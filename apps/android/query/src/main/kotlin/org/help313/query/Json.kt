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

        fun parse(text: String): Json {
            if (text.length > MAX_CHARS) throw JsonException("JSON is ${text.length} characters; the limit is $MAX_CHARS")
            val p = Parser(text)
            val v = p.value()
            p.skipWhitespace()
            if (!p.atEnd()) throw JsonException("trailing text at ${p.pos}")
            return v
        }
    }
}

class JsonException(message: String) : RuntimeException(message)

private class Parser(private val s: String) {
    var pos = 0

    /** How many objects and arrays are open at this point. One frame of `value()` per level, so it is the cap. */
    private var depth = 0

    fun atEnd() = pos >= s.length

    fun skipWhitespace() {
        while (pos < s.length) {
            val c = s[pos]
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') pos++ else break
        }
    }

    private fun expect(c: Char) {
        if (pos >= s.length || s[pos] != c) throw JsonException("expected '$c' at $pos")
        pos++
    }

    fun value(): Json {
        skipWhitespace()
        if (atEnd()) throw JsonException("unexpected end of JSON")
        return when (s[pos]) {
            '{' -> nested { obj() }
            '[' -> nested { arr() }
            '"' -> Json.Str(string())
            't' -> literal("true", Json.Bool(true))
            'f' -> literal("false", Json.Bool(false))
            'n' -> literal("null", Json.Null)
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
        if (!s.startsWith(word, pos)) throw JsonException("bad literal at $pos")
        pos += word.length
        return v
    }

    private fun obj(): Json {
        expect('{')
        val out = LinkedHashMap<String, Json>()
        skipWhitespace()
        if (pos < s.length && s[pos] == '}') { pos++; return Json.Obj(out) }
        while (true) {
            skipWhitespace()
            val k = string()
            skipWhitespace()
            expect(':')
            out[k] = value()
            skipWhitespace()
            if (pos >= s.length) throw JsonException("unterminated object")
            when (s[pos]) {
                ',' -> pos++
                '}' -> { pos++; return Json.Obj(out) }
                else -> throw JsonException("expected ',' or '}' at $pos")
            }
        }
    }

    private fun arr(): Json {
        expect('[')
        val out = ArrayList<Json>()
        skipWhitespace()
        if (pos < s.length && s[pos] == ']') { pos++; return Json.Arr(out) }
        while (true) {
            out.add(value())
            skipWhitespace()
            if (pos >= s.length) throw JsonException("unterminated array")
            when (s[pos]) {
                ',' -> pos++
                ']' -> { pos++; return Json.Arr(out) }
                else -> throw JsonException("expected ',' or ']' at $pos")
            }
        }
    }

    private fun string(): String {
        expect('"')
        val sb = StringBuilder()
        while (true) {
            if (pos >= s.length) throw JsonException("unterminated string")
            when (val c = s[pos++]) {
                '"' -> return sb.toString()
                '\\' -> {
                    if (pos >= s.length) throw JsonException("unterminated escape")
                    when (val e = s[pos++]) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'b' -> sb.append('\b')
                        'f' -> sb.append('')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            if (pos + 4 > s.length) throw JsonException("short \\u escape at $pos")
                            val code = s.substring(pos, pos + 4).toIntOrNull(16)
                                ?: throw JsonException("bad \\u escape at $pos")
                            pos += 4
                            sb.append(code.toChar())
                        }
                        else -> throw JsonException("bad escape '\\$e' at ${pos - 1}")
                    }
                }
                else -> sb.append(c)
            }
        }
    }

    private fun number(): Json {
        val start = pos
        if (pos < s.length && (s[pos] == '-' || s[pos] == '+')) pos++
        while (pos < s.length && (s[pos].isDigit() || s[pos] == '.' || s[pos] == 'e' || s[pos] == 'E' ||
                ((s[pos] == '-' || s[pos] == '+') && (s[pos - 1] == 'e' || s[pos - 1] == 'E')))
        ) pos++
        val text = s.substring(start, pos)
        val d = text.toDoubleOrNull() ?: throw JsonException("bad number '$text' at $start")
        return Json.Num(d)
    }
}
