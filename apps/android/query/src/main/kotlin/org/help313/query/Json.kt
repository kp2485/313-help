// A small JSON reader, so this module and the app have no dependencies at all.
//
// Why not a library: kotlinx.serialization or Moshi would each add a runtime (and a compiler plugin) to an APK
// aimed at cheap phones, and Android's own org.json is not on the classpath of a plain JVM unit test, which is
// where the fixtures run. Reading is all we need: the bundle is signed and read-only, and nothing is ever written.
//
// It is deliberately strict. Anything it cannot read throws, and every caller treats that as "refuse the file",
// never as "guess".
//
// It is also bounded, which matters more than strictness. `value()` recurses once per nesting level, so 40 KB of
// "[[[[[[…" is 40,000 stack frames and a StackOverflowError — an Error, not an Exception, which slips past
// `catch (e: Exception)`. The app parses `index.json.sig` *before* any signature has been checked (Verify.kt), so
// that input is whatever answered for the bundle origin: unbounded recursion there killed the loader thread and
// did it again at every start (Android review, 2026-09-20). Depth and length are capped below, both failures are
// an ordinary JsonException, and the caller refuses the file as it would any other malformed one.
package org.help313.query

sealed class Json {
    object Null : Json()
    data class Bool(val value: Boolean) : Json()
    data class Num(val value: Double) : Json()
    data class Str(val value: String) : Json()
    data class Arr(val items: List<Json>) : Json()
    data class Obj(val fields: Map<String, Json>) : Json()

    /** A field of an object, or null. A JSON null reads as null, so callers never have to test for both. */
    operator fun get(key: String): Json? {
        val v = (this as? Obj)?.fields?.get(key)
        return if (v == null || v is Null) null else v
    }

    /** True when the key is present and explicitly null (the fixtures' `"next": null`). */
    fun hasNullAt(key: String): Boolean = (this as? Obj)?.fields?.get(key) is Null

    val str: String? get() = (this as? Str)?.value
    val num: Double? get() = (this as? Num)?.value
    val int: Int? get() = (this as? Num)?.value?.toInt()
    val bool: Boolean? get() = (this as? Bool)?.value
    val arr: List<Json> get() = (this as? Arr)?.items ?: emptyList()
    val obj: Map<String, Json> get() = (this as? Obj)?.fields ?: emptyMap()

    fun strings(key: String): List<String> = (get(key)?.arr ?: emptyList()).mapNotNull { it.str }

    companion object {
        /**
         * How deep a value may nest. The bundle's own deepest file is about six levels
         * (`{files:{"category/food.json":{sha256:…}}}`, a schedule inside a listing inside an array), and the
         * fixtures are shallower still, so 64 is more than an order of magnitude of headroom and still nowhere
         * near a stack that a 2016 phone's loader thread would run out of.
         */
        const val MAX_DEPTH = 64

        /**
         * How much text will be read at all. The whole bundle is about 742 KB across twenty files and the largest
         * single one is well under a megabyte; `index.json.sig` is a few hundred bytes. 16 MiB of characters is a
         * ceiling nothing we publish can approach, and it means a hostile origin cannot make the app allocate
         * without limit before the depth cap gets a chance to fire.
         */
        const val MAX_CHARS = 16 * 1024 * 1024

        /** The same ceiling for a file read as bytes. A character is never less than a byte, so it is no looser. */
        const val MAX_BYTES = MAX_CHARS

        internal val TRUE = Bool(true)
        internal val FALSE = Bool(false)

        fun parse(text: String): Json {
            if (text.length > MAX_CHARS) throw JsonException("JSON is ${text.length} characters; the limit is $MAX_CHARS")
            return parse(text.toByteArray(Charsets.UTF_8))
        }

        /**
         * Reads UTF-8 bytes as they came off the disk or the network, which is how the bundle is read: the 742 KB
         * is never turned into one big String first, and a string with no escape in it is decoded once, straight
         * from its bytes (apps/android/README.md, "JSON, measured").
         */
        fun parse(bytes: ByteArray): Json {
            if (bytes.size > MAX_BYTES) throw JsonException("JSON is ${bytes.size} bytes; the limit is $MAX_BYTES")
            val p = Parser(bytes)
            val v = p.value()
            p.skipWhitespace()
            if (!p.atEnd()) throw JsonException("trailing text at ${p.pos}")
            return v
        }
    }
}

class JsonException(message: String) : RuntimeException(message)

// Works on the UTF-8 bytes, not on a String. Every character JSON's grammar cares about is ASCII, and an ASCII
// byte never occurs inside a longer UTF-8 sequence, so the structure can be found byte by byte and only the text
// between two quotes is ever decoded. `pos`, and every position in a message, is therefore a byte offset.
private class Parser(private val b: ByteArray) {
    var pos = 0
    private val n = b.size

    /** How many objects and arrays are open at this point. One frame of `value()` per level, so it is the cap. */
    private var depth = 0

    /**
     * The members of every object and array still open, innermost last. A container is built once, at its closing
     * bracket, at exactly the size it turned out to be — so no map is rehashed and no list regrown on the way.
     */
    private var stack = arrayOfNulls<Any>(64)
    private var top = 0

    /**
     * Object keys seen so far in this document. A category file says "id", "name", "facts" five hundred times; each
     * is decoded once and the same String reused, which also means its hash is computed once. ASCII keys of up to
     * [KEY_MAX] bytes only, and never more than half of [KEY_SLOTS], so a hostile file cannot make it grow.
     */
    private val keys = arrayOfNulls<String>(KEY_SLOTS)
    private var keyCount = 0

    fun atEnd() = pos >= n

    fun skipWhitespace() {
        while (pos < n) {
            val c = b[pos].toInt()
            if (c == ' '.code || c == '\n'.code || c == '\r'.code || c == '\t'.code) pos++ else break
        }
    }

    private fun expect(c: Char) {
        if (pos >= n || b[pos].toInt() != c.code) throw JsonException("expected '$c' at $pos")
        pos++
    }

    fun value(): Json {
        skipWhitespace()
        if (atEnd()) throw JsonException("unexpected end of JSON")
        return when (b[pos].toInt()) {
            '{'.code -> nested { obj() }
            '['.code -> nested { arr() }
            '"'.code -> Json.Str(string())
            't'.code -> literal("true", Json.TRUE)
            'f'.code -> literal("false", Json.FALSE)
            'n'.code -> literal("null", Json.Null)
            else -> number()
        }
    }

    /**
     * One more level of nesting, refused past [Json.MAX_DEPTH]. The check is here rather than inside `obj()` and
     * `arr()` so that there is exactly one place it can be forgotten, and it fires *before* the recursive call
     * rather than after it — a cap that throws on the way out is a cap that has already overflowed the stack.
     */
    private inline fun <T> nested(body: () -> T): T {
        if (depth >= Json.MAX_DEPTH) throw JsonException("JSON nested more than ${Json.MAX_DEPTH} deep at $pos")
        depth++
        val out = body()
        depth--
        return out
    }

    private fun literal(word: String, v: Json): Json {
        if (pos + word.length > n) throw JsonException("bad literal at $pos")
        for (i in word.indices) if (b[pos + i].toInt() != word[i].code) throw JsonException("bad literal at $pos")
        pos += word.length
        return v
    }

    private fun push(x: Any) {
        if (top == stack.size) stack = stack.copyOf(top * 2)
        stack[top++] = x
    }

    private fun obj(): Json {
        expect('{')
        skipWhitespace()
        if (pos < n && b[pos].toInt() == '}'.code) { pos++; return Json.Obj(LinkedHashMap(0)) }
        val base = top
        while (true) {
            skipWhitespace()
            push(key())
            skipWhitespace()
            expect(':')
            push(value())
            skipWhitespace()
            if (pos >= n) throw JsonException("unterminated object")
            when (b[pos].toInt()) {
                ','.code -> pos++
                '}'.code -> {
                    pos++
                    val count = (top - base) / 2
                    // Room for `count` entries under the default load factor of 0.75, so it never rehashes.
                    val out = LinkedHashMap<String, Json>(count + count / 3 + 1)
                    var i = base
                    while (i < top) {
                        out[stack[i] as String] = stack[i + 1] as Json   // a repeated key: the last one wins, as before
                        i += 2
                    }
                    java.util.Arrays.fill(stack, base, top, null)
                    top = base
                    return Json.Obj(out)
                }
                else -> throw JsonException("expected ',' or '}' at $pos")
            }
        }
    }

    private fun arr(): Json {
        expect('[')
        skipWhitespace()
        if (pos < n && b[pos].toInt() == ']'.code) { pos++; return Json.Arr(ArrayList(0)) }
        val base = top
        while (true) {
            push(value())
            skipWhitespace()
            if (pos >= n) throw JsonException("unterminated array")
            when (b[pos].toInt()) {
                ','.code -> pos++
                ']'.code -> {
                    pos++
                    val out = ArrayList<Json>(top - base)
                    for (i in base until top) out.add(stack[i] as Json)
                    java.util.Arrays.fill(stack, base, top, null)
                    top = base
                    return Json.Arr(out)
                }
                else -> throw JsonException("expected ',' or ']' at $pos")
            }
        }
    }

    /** An object key: the same text `string()` would give, but a short plain one is looked up before it is decoded. */
    private fun key(): String {
        if (pos >= n || b[pos].toInt() != '"'.code) throw JsonException("expected '\"' at $pos")
        val start = pos + 1
        var i = start
        var h = 0
        while (i < n) {
            val c = b[i].toInt()
            if (c == '"'.code) break
            if (c < 0 || c == '\\'.code || i - start >= KEY_MAX) return string()
            h = h * 31 + c
            i++
        }
        if (i >= n) return string()   // unterminated, and string() is what says so
        val len = i - start
        var slot = (h xor (h ushr 16)) and (KEY_SLOTS - 1)
        while (true) {
            val k = keys[slot] ?: break
            if (k.length == len && sameAscii(k, start)) { pos = i + 1; return k }
            slot = (slot + 1) and (KEY_SLOTS - 1)
        }
        val k = string()
        if (keyCount < KEY_SLOTS / 2) { keys[slot] = k; keyCount++ }
        return k
    }

    private fun sameAscii(k: String, start: Int): Boolean {
        for (j in k.indices) if (k[j].code != b[start + j].toInt()) return false
        return true
    }

    private fun string(): String {
        expect('"')
        val start = pos
        while (pos < n) {
            val c = b[pos].toInt()
            if (c == '"'.code) return String(b, start, pos++ - start, Charsets.UTF_8)   // the usual case: no escapes
            if (c == '\\'.code) return escaped(start)
            pos++
        }
        throw JsonException("unterminated string")
    }

    /** The rest of a string that has a backslash in it. `pos` is at the first one; `start` is where the text began. */
    private fun escaped(start: Int): String {
        val sb = StringBuilder(pos - start + 16)
        var run = start   // the bytes from `run` up to `pos` are plain text not yet copied
        while (true) {
            if (pos >= n) throw JsonException("unterminated string")
            val c = b[pos].toInt()
            if (c != '"'.code && c != '\\'.code) { pos++; continue }
            if (pos > run) sb.append(String(b, run, pos - run, Charsets.UTF_8))
            pos++
            if (c == '"'.code) return sb.toString()
            if (pos >= n) throw JsonException("unterminated escape")
            when (val e = b[pos++].toInt()) {
                '"'.code -> sb.append('"')
                '\\'.code -> sb.append('\\')
                '/'.code -> sb.append('/')
                'b'.code -> sb.append('\b')
                'f'.code -> sb.append('')
                'n'.code -> sb.append('\n')
                'r'.code -> sb.append('\r')
                't'.code -> sb.append('\t')
                'u'.code -> {
                    if (pos + 4 > n) throw JsonException("short \\u escape at $pos")
                    var code = 0
                    for (i in 0 until 4) {
                        val d = hex(b[pos + i].toInt())
                        if (d < 0) throw JsonException("bad \\u escape at $pos")
                        code = code * 16 + d
                    }
                    pos += 4
                    sb.append(code.toChar())
                }
                else -> throw JsonException("bad escape '\\${e.toChar()}' at ${pos - 1}")
            }
            run = pos
        }
    }

    private fun hex(c: Int): Int = when {
        c >= '0'.code && c <= '9'.code -> c - '0'.code
        c >= 'a'.code && c <= 'f'.code -> c - 'a'.code + 10
        c >= 'A'.code && c <= 'F'.code -> c - 'A'.code + 10
        else -> -1
    }

    private fun digit(i: Int): Boolean = i < n && b[i] >= ZERO && b[i] <= NINE

    private fun number(): Json {
        val start = pos
        // Plain decimals — every number the bundle has: "3", "-83.0458", "42.331427" — are read in place. Up to 15
        // digits fit a Double exactly and so does the power of ten under them, so the one division below is
        // correctly rounded: bit for bit what Double.parseDouble gives. Anything else takes the path it always took.
        var i = pos
        val negative = i < n && b[i].toInt() == '-'.code
        if (negative) i++
        var mantissa = 0L
        var digits = 0
        while (digit(i) && digits <= 15) { mantissa = mantissa * 10 + (b[i] - ZERO); digits++; i++ }
        var plain = digits in 1..15
        var fraction = 0
        if (plain && i < n && b[i].toInt() == '.'.code) {
            i++
            while (digit(i) && digits <= 15) { mantissa = mantissa * 10 + (b[i] - ZERO); digits++; fraction++; i++ }
            plain = fraction > 0 && digits <= 15
        }
        if (plain && (i >= n || !numberByte(i))) {
            pos = i
            val d = mantissa.toDouble() / POW10[fraction]
            return Json.Num(if (negative) -d else d)
        }

        if (pos < n && (b[pos].toInt() == '-'.code || b[pos].toInt() == '+'.code)) pos++
        while (pos < n && numberByte(pos)) pos++
        val text = String(b, start, pos - start, Charsets.ISO_8859_1)
        val d = text.toDoubleOrNull() ?: throw JsonException("bad number '$text' at $start")
        return Json.Num(d)
    }

    /** Whether the byte at `i`, which is never a number's first, can continue one. */
    private fun numberByte(i: Int): Boolean {
        val c = b[i].toInt()
        if (c >= '0'.code && c <= '9'.code) return true
        if (c == '.'.code || c == 'e'.code || c == 'E'.code) return true
        if (c == '-'.code || c == '+'.code) { val p = b[i - 1].toInt(); return p == 'e'.code || p == 'E'.code }
        return false
    }

    private companion object {
        const val KEY_SLOTS = 256
        const val KEY_MAX = 32
        const val ZERO = '0'.code.toByte()
        const val NINE = '9'.code.toByte()
        val POW10 = DoubleArray(16).also { it[0] = 1.0; for (i in 1 until 16) it[i] = it[i - 1] * 10.0 }
    }
}
