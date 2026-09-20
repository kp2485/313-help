// The Android app's need screens, held to the web app's list, and its string keys held to strings/en.json.
//
// `apps/web/src/needs.ts` is the source of truth for "What do you need?" (docs/05). This app restates it in
// Kotlin in `Needs.kt`, and the three apps have drifted apart before: Android was written before `health.er`,
// `health.urgent` and `health.dhd` existed. This test reads both files as text and fails when they differ.
//
// It also checks every string key the app asks `L.t` for against `strings/en.json`. Keys were retired on
// 2026-09-20 (`tab.rec`, `tab.transit`), and a missing key puts a raw key on a screen about a shelter bed.
//
// Plain JVM: it reads files in this repository and touches no android.* class, so it runs with
// `./gradlew :app:testDebugUnitTest`. The iPhone app has the same test in Swift
// (apps/ios/Tests/AppParityTests/ParityTests.swift), which is where this one's wording comes from.
package org.help313.app

import org.help313.query.Address
import org.help313.query.BundleRow
import org.help313.query.Phone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ParityTest {

    /** Tests run from `apps/android/app`, so the repository root is three levels up (as in VerifyTest). */
    private val root = File("../../..")

    private fun text(path: String) = File(root, path).readText()

    /**
     * Refinements in the web app that lead only to link-outs, with no list of places. Android has no link-out
     * screens yet (README.md, "What it does and does not do yet"), so it leaves these out. The set is written
     * down here so that a *new* one fails this test until someone decides.
     */
    private val linkOnly = setOf("food.paying", "job.lost")

    // ---- the comparison ------------------------------------------------------------------------------------

    @Test
    fun needsMatchTheWebApp() {
        val web = webNeeds()
        val android = kotlinNeeds()
        assertTrue("could not read apps/web/src/needs.ts", web.isNotEmpty())
        assertEquals("the two apps list different needs, or in a different order", web.map { it.id }, android.map { it.id })
        for ((a, b) in android.zip(web)) {
            assertEquals("the Android \"${a.id}\" need differs from apps/web/src/needs.ts", b.line, a.line)
            assertEquals("the choices under \"${a.id}\" differ", b.refine.map { it.first }, a.refine.map { it.first })
            for ((ra, rb) in a.refine.zip(b.refine)) {
                assertEquals("${a.id} > ${ra.first} differs from apps/web/src/needs.ts", rb.second, ra.second)
            }
        }
    }

    /** Every need and refinement has words in both languages. A screen never shows a raw key. */
    @Test
    fun everyNeedHasItsWords() {
        val en = strings("strings/en.json")
        val es = strings("strings/es.json")
        val wanted = ArrayList<String>()
        for (n in NEEDS) {
            wanted += "need.${n.id}"
            n.intro?.let { wanted += it }
            n.emptyKey?.let { wanted += it }
            for (r in n.refine) wanted += "refine.${n.id}.${r.id}"
        }
        for (id in listOf("food", "shelter", "doctor", "narcan")) wanted += "quick.$id"
        for (key in wanted) {
            assertNotNull("strings/en.json has no $key", en[key])
            assertNotNull("strings/es.json has no $key", es[key])
        }
    }

    /** Every key the app asks `L.t` for — literal, or built from a number or a known list — exists in English. */
    @Test
    fun everyStringKeyTheAppAsksForExists() {
        val en = strings("strings/en.json")
        val missing = ArrayList<String>()
        for (file in kotlinSources()) {
            for (key in literalKeys(file.readText())) if (!en.containsKey(key)) missing += "${file.name}: $key"
        }
        // The keys the app builds rather than writes out.
        val built = ArrayList<String>()
        for (i in 1..6) built += "od.s$i"
        for (k in listOf("about.p1", "about.p2", "about.data")) built += k
        for (i in 1..5) built += "privacy.phone_$i"
        for (part in listOf("title", "body", "label")) built += "link.beds.safebeds.$part"
        for (id in CATEGORIES.map { it.first }) built += "cat.$id"
        for (kind in LISTING_KINDS) built += "report.kind.$kind"
        // Keys chosen inside an expression (`L.t(if (sent) … else …)`) or read out of a list of keys.
        built += listOf(
            "tab.home", "tab.help", "search.title", "saved.title", "tabs.label",
            "help.now", "help.soon", "help.later", "results.none",
            "quick.food", "quick.shelter", "quick.doctor", "quick.narcan",
            "report.sent", "report.queued", "about.sig_dev", "about.sig_ok",
            "home.no_data", "home.loading",
        )
        for (key in built) if (!en.containsKey(key)) missing += "built: $key"
        assertEquals("string keys the app asks for that strings/en.json does not have", emptyList<String>(), missing)
    }

    /** Keys retired on 2026-09-20, when the web app folded Recreation and Transit into one Map tab. */
    @Test
    fun retiredKeysAreNotAskedForAgain() {
        for (file in kotlinSources()) {
            val body = file.readText()
            for (key in listOf("tab.rec", "tab.transit")) {
                assertFalse("${file.name} asks for the retired key $key", body.contains("\"$key\""))
            }
        }
    }

    /** The shelter screen's link card is a key into the strings files, not a name typed into the code. */
    @Test
    fun theLinkAboveTheNumbersIsTranslated() {
        val en = strings("strings/en.json")
        val shelter = NEEDS.first { it.id == "shelter" }
        val key = shelter.firstLink!!.first
        for (part in listOf("title", "body", "label")) assertNotNull(en["link.$key.$part"])
    }

    // ---- a place that publishes a point and no street address (the sal_wws_ stations) -----------------------

    private fun station(address: Address? = null, lat: Double? = 42.31, lon: Double? = -83.18, phones: List<Phone> = emptyList()) =
        BundleRow(id = "sal_wws_test", name = "A station", category = "harm.supplies",
            address = address, lat = lat, lon = lon, phones = phones)

    @Test
    fun aPointWithNoAddressStillGetsDirections() {
        val row = station()
        assertTrue(showsPointWithoutAddress(row))
        // The coordinate goes to the maps app as a coordinate, and is never printed as an address.
        assertEquals("42.31,-83.18", mapsDestination(row))
        assertFalse(hasPhone(row))
    }

    @Test
    fun aStreetAddressIsUsedWhenThePlacePublishesOne() {
        val row = station(address = Address("1234 Woodward Ave", "Detroit", "48226"))
        assertFalse(showsPointWithoutAddress(row))
        assertEquals("1234 Woodward Ave, Detroit, MI 48226", mapsDestination(row))
    }

    @Test
    fun aSensitiveListingIsNeverHandedToAMapsApp() {
        for (category in listOf("shelter.dv", "health.mental")) {
            val row = BundleRow(id = "sal_x", name = "x", category = category, lat = 42.33, lon = -83.05)
            assertNull(mapsDestination(row))
            assertFalse(showsPointWithoutAddress(row))
        }
    }

    @Test
    fun noAddressAndNoPointMeansNoDirections() {
        assertNull(mapsDestination(station(lat = null, lon = null)))
        assertFalse(showsPointWithoutAddress(station(lat = null, lon = null)))
    }

    @Test
    fun aListingWithAPhoneOffersACall() {
        assertTrue(hasPhone(station(phones = listOf(Phone("313-555-0101")))))
    }

    // ---- reading the two files -----------------------------------------------------------------------------

    /** id, the one-line summary of the need, and its choices as (id, one-line summary) pairs. */
    private class Parsed(val id: String, val line: String, val refine: List<Pair<String, String>>)

    private fun webNeeds(): List<Parsed> {
        val src = text("apps/web/src/needs.ts")
        val from = src.indexOf("export const NEEDS")
        val to = src.indexOf("export const CATEGORIES")
        if (from < 0 || to < 0) return emptyList()
        return src.substring(from, to).split("\n  { id: ").drop(1).map { part ->
            val (head, body) = split(part, "refine: [")
            val id = quoted(head).firstOrNull() ?: "?"
            parsed(id, value(head, "group") ?: "?", head, body, "{ id: ")
        }
    }

    private fun kotlinNeeds(): List<Parsed> {
        val src = text("apps/android/app/src/main/kotlin/org/help313/app/Needs.kt")
        val from = src.indexOf("val NEEDS: List<Need> = listOf(")
        val to = src.indexOf("/** Browse-by-type chips")
        if (from < 0 || to < 0) return emptyList()
        return src.substring(from, to).split("\n    Need(").drop(1).map { part ->
            val (head, body) = split(part, "refine = listOf(")
            val words = quoted(head)
            // A need is written `Need("<id>", "<group>", …)`: the id and the group are its first two words.
            parsed(words.getOrElse(0) { "?" }, words.getOrElse(1) { "?" }, head, body, "Refine(")
        }
    }

    /** Both readers produce the same shape, so a failure can print the two lines side by side. */
    private fun parsed(id: String, group: String, head: String, body: String?, splitOn: String): Parsed {
        val refine = ArrayList<Pair<String, String>>()
        for (entry in (body ?: "").split(splitOn).drop(1)) {
            val rid = quoted(entry).firstOrNull() ?: "?"
            if (linkOnly.contains("$id.$rid")) continue
            refine += rid to "$rid ${queryLine(entry)} first=${list(entry, "first")}"
        }
        // A need with choices carries no query of its own; without them, its query is on the need.
        val query = if (body == null) queryLine(head) else "cat=- mode=- prefer=-"
        val line = "$id group=$group first=${list(head, "first")} steps=${flag(head, "stepsOnly")} " +
            "sensitive=${flag(head, "sensitive")} intro=${value(head, "intro") ?: "-"} " +
            "empty=${value(head, "emptyKey") ?: "-"} $query"
        return Parsed(id, line, refine)
    }

    // ---- small readers, deliberately dull ------------------------------------------------------------------

    /**
     * Everything before the choices and everything after. Both files put a need's own settings before its
     * choices, so that the settings are never read out of a choice by mistake.
     */
    private fun split(s: String, marker: String): Pair<String, String?> {
        val at = s.indexOf(marker)
        return if (at < 0) s to null else s.substring(0, at) to s.substring(at + marker.length)
    }

    /**
     * A query written either way: `query: { category: 'x', mode: 'week', prefer: ['youth'] }` (TypeScript) or
     * `Query(category = "x", mode = "week", prefer = listOf("youth"))` (Kotlin, where a choice's query is the
     * second argument and has no name). `mode` defaults to "now" in both apps.
     */
    private fun queryLine(s: String): String {
        val chunk = when {
            s.contains("Query(") -> balanced(s, "Query(", '(', ')')
            s.contains("query: {") -> balanced(s, "query: {", '{', '}')
            else -> return "cat=- mode=- prefer=-"
        }
        return "cat=${value(chunk, "category") ?: "-"} mode=${value(chunk, "mode") ?: "now"} prefer=${list(chunk, "prefer")}"
    }

    /** What is inside the brackets opened by `marker`, counting nesting. */
    private fun balanced(s: String, marker: String, open: Char, close: Char): String {
        val at = s.indexOf(marker)
        if (at < 0) return ""
        var depth = 1
        val out = StringBuilder()
        for (i in (at + marker.length) until s.length) {
            val ch = s[i]
            if (ch == open) depth++
            if (ch == close) {
                depth--
                if (depth == 0) break
            }
            out.append(ch)
        }
        return out.toString()
    }

    /** `name: 'x'`, `name: "x"` or `name = "x"`, and nothing else. */
    private fun value(s: String, name: String): String? {
        for (sep in listOf("$name: ", "$name = ")) {
            val at = s.indexOf(sep)
            if (at < 0) continue
            val rest = s.substring(at + sep.length)
            val q = rest.firstOrNull() ?: continue
            if (q != '\'' && q != '"') continue
            val end = rest.indexOf(q, 1)
            if (end > 0) return rest.substring(1, end)
        }
        return null
    }

    /** `name: true` or `name = true`. */
    private fun flag(s: String, name: String): Boolean = s.contains("$name: true") || s.contains("$name = true")

    /** `name: ['a', 'b']` or `name = listOf("a", "b")`, as `a|b`. Absent reads as `-`. */
    private fun list(s: String, name: String): String {
        val chunk = when {
            s.contains("$name: [") -> balanced(s, "$name: [", '[', ']')
            s.contains("$name = listOf(") -> balanced(s, "$name = listOf(", '(', ')')
            else -> return "-"
        }
        val items = quoted(chunk)
        return if (items.isEmpty()) "-" else items.joinToString("|")
    }

    /** Every single- or double-quoted run in a string, in order. */
    private fun quoted(s: String): List<String> {
        val out = ArrayList<String>()
        var current: StringBuilder? = null
        var quote = '\''
        for (ch in s) {
            val c = current
            if (c != null) {
                if (ch == quote) {
                    out += c.toString()
                    current = null
                } else {
                    c.append(ch)
                }
            } else if (ch == '\'' || ch == '"') {
                quote = ch
                current = StringBuilder()
            }
        }
        return out
    }

    /** `L.t("some.key"` where the key is whole: not a template and not a prefix the app finishes at run time. */
    private fun literalKeys(body: String): List<String> {
        val out = ArrayList<String>()
        var i = body.indexOf("L.t(\"")
        while (i >= 0) {
            val start = i + 5
            val end = body.indexOf('"', start)
            if (end < 0) break
            val key = body.substring(start, end)
            val after = body.substring(end + 1).trimStart()
            if (!key.contains("\$") && !after.startsWith("+")) out += key
            i = body.indexOf("L.t(\"", end)
        }
        return out
    }

    private fun kotlinSources(): List<File> =
        (File(root, "apps/android/app/src/main/kotlin/org/help313/app").listFiles() ?: emptyArray())
            .filter { it.name.endsWith(".kt") }.sortedBy { it.name }

    /** A strings file is a flat object of strings; this reads it without a JSON library, in the app's own style. */
    private fun strings(path: String): Map<String, String> =
        org.help313.query.Json.parse(text(path)).obj.mapNotNull { (k, v) -> v.str?.let { k to it } }.toMap()
}
