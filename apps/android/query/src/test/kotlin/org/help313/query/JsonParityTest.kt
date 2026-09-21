// The byte reader in Json.kt against the character reader it replaced (ReferenceJson.kt): the same tree or the
// same refusal, on everything this app reads and on the inputs most likely to tell two readers apart.
package org.help313.query

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Random

class JsonParityTest {

    /** Either both readers refuse the text, or both give the same tree. `Json.Num` compares doubles bit for bit. */
    private fun same(text: String) {
        val expected = runCatching { ReferenceJson.parse(text) }
        val fromText = runCatching { Json.parse(text) }
        val fromBytes = runCatching { Json.parse(text.toByteArray(Charsets.UTF_8)) }
        for (actual in listOf(fromText, fromBytes)) {
            if (expected.isFailure) {
                val e = actual.exceptionOrNull()
                assertTrue("accepted what the old reader refused: ${text.take(60)}", e is JsonException)
            } else {
                assertEquals(text.take(60), expected.getOrThrow(), actual.getOrThrow())
            }
        }
    }

    @Test
    fun everyFixtureReadsTheSameBothWays() {
        val files = fixturesDir().listFiles { f -> f.name.endsWith(".json") }!!
        assertTrue(files.isNotEmpty())
        for (f in files) same(f.readText(Charsets.UTF_8))
    }

    /** The real thing, when `pnpm build:bundle` has been run. data/bundle/ is never committed, so CI may not have it. */
    @Test
    fun theBundleReadsTheSameBothWays() {
        val bundle = File(fixturesDir().parentFile.parentFile, "data/bundle/v1")
        if (!bundle.isDirectory) return
        val files = bundle.walkTopDown().filter { it.isFile && it.name.endsWith(".json") }.toList()
        for (f in files) same(f.readText(Charsets.UTF_8))
        println("JSON parity: ${files.size} bundle files read the same by both readers")
    }

    @Test
    fun awkwardTextReadsTheSameBothWays() {
        val u = "\\u"
        listOf(
            // strings: plain, escaped, escapes at either end, two-, three- and four-byte UTF-8, surrogate escapes
            """""""", """"a"""", """"é"""", """"Dequindre Cut — 日本 🚲"""", """"a\nb"""", """"\n"""", """"\"q\"""""",
            """"\\"""", """"x\\"""", """"\/\b\f\r\t"""", """"é\né"""", """"tab	raw"""",
            "\"${u}00e9\"", "\"${u}00E9${u}d83d${u}DEB2\"", "\"${u}d83d\"", "\"a${u}0000b\"",
            "\"${u}12\"", "\"${u}12g4\"", "\"${u}\"", """"\x"""", """"\""", """"open""", "\"",
            // keys: repeated, escaped, non-ASCII, long, empty, duplicated (the last one wins)
            """{"id":1,"id":2}""", """{"a":{"a":{"a":1}},"b":[{"a":1},{"a":2}]}""", """{"":1}""", """{"k\n":1,"k\n":2}""",
            """{"é":1,"é":2}""", """{"${"k".repeat(40)}":1,"${"k".repeat(40)}":2}""", """{"ab":1,"ba":2,"abc":3}""",
            """{a:1}""", """{"a" 1}""", """{"a":1,}""", """{"a":1""", """{"a"""", """{""", """{,}""",
            // numbers
            "0", "-0", "-0.0", "7", "007", "42.331427", "-83.0458", "0.1", "1.10", "123456789012345", "1234567890123456",
            "0.123456789012345", "0.1234567890123456", "12345678.12345678", "9007199254740993", "1e3", "1E-2", "-2.5e+3",
            "1.", ".5", "-.5", "+5", "-", "+", "1.2.3", "1e", "1e+", "--1", "1-2", "1e5e5", "1.5f", "0x10", "NaN", "Infinity",
            "1 ", " 1", "[1,2.50,-3]", "[1 2]",
            // literals, whitespace, structure
            "true", "false", "null", "tru", "nul", "truee", "[true,false,null]", " \t\r\n[ ] ", "[]", "{}", "[[],{}]",
            "[1,]", "[,1]", "[", "]", "", " ", "[] []", "[]x", "﻿[]", "[ ]",
        ).forEach(::same)
        // One shape per key count around every LinkedHashMap size, since the map is now sized in one go.
        for (n in 0..40) same((0 until n).joinToString(",", "{", "}") { "\"k$it\":$it" })
        // More distinct keys than the key table will hold, each seen twice.
        same((0 until 600).joinToString(",", "[", "]") { """{"key$it":1,"key$it":2,"id":$it}""" })
    }

    /** The in-place number path is only allowed to exist if it gives exactly the double the JDK gives. */
    @Test
    fun plainDecimalsAreTheSameDoubleTheJdkGives() {
        val r = Random(313)
        var checked = 0
        repeat(200_000) {
            val digits = 1 + r.nextInt(17)
            val sb = StringBuilder()
            if (r.nextBoolean()) sb.append('-')
            repeat(digits) { sb.append('0' + r.nextInt(10)) }
            if (r.nextInt(4) != 0) sb.insert(sb.length - r.nextInt(digits), '.')
            val text = sb.toString()
            val want = text.toDoubleOrNull()
            val got = runCatching { Json.parse(text).num }.getOrNull()
            if (want == null) assertEquals(text, null, got)
            else assertEquals(text, want.toRawBits(), got!!.toRawBits())
            checked++
        }
        assertEquals(200_000, checked)
    }

    /** The same ceiling as before, now also on the way in as bytes. */
    @Test
    fun theBytePathKeepsTheDepthCap() {
        for (size in listOf(Json.MAX_DEPTH + 1, 20_000, 200_000)) {
            try {
                Json.parse("[".repeat(size).toByteArray(Charsets.UTF_8))
                throw AssertionError("JSON nested $size deep was accepted")
            } catch (e: JsonException) {
                assertTrue(e.message!!.contains("deep"))
            }
        }
    }
}
