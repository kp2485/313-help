// The reader as it was before 2026-09-20, kept word for word as the thing the new one is compared with.
//
// Json.kt used to turn a whole file into a String and walk it a character at a time; it now walks the UTF-8 bytes
// (apps/android/README.md, "JSON, measured"). That is a rewrite of the code every list in the app comes through,
// so JsonParityTest holds the two to the same answer on every fixture, on the bundle when there is one, and on
// the awkward inputs. This file is the old half of that comparison. It is test code only and ships nowhere.
package org.help313.query

object ReferenceJson {
    fun parse(text: String): Json {
        if (text.length > Json.MAX_CHARS) throw JsonException("JSON is ${text.length} characters; the limit is ${Json.MAX_CHARS}")
        val p = ReferenceParser(text)
        val v = p.value()
        p.skipWhitespace()
        if (!p.atEnd()) throw JsonException("trailing text at ${p.pos}")
        return v
    }
}

private class ReferenceParser(private val s: String) {
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
