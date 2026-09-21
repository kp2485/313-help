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

    /** The languages the app registers (L.LANGUAGES), kept here as plain data so this test needs no android.*. */
    private val LANGS = listOf("en", "es", "ar", "bn")

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

    /** Every need and refinement has words in every language. A screen never shows a raw key. */
    @Test
    fun everyNeedHasItsWords() {
        val en = strings("strings/en.json")
        val wanted = ArrayList<String>()
        for (n in NEEDS) {
            wanted += "need.${n.id}"
            n.intro?.let { wanted += it }
            n.emptyKey?.let { wanted += it }
            for (r in n.refine) wanted += "refine.${n.id}.${r.id}"
        }
        for (id in listOf("food", "shelter", "doctor", "narcan")) wanted += "quick.$id"
        for (key in wanted) assertNotNull("strings/en.json has no $key", en[key])
        for (lang in LANGS - "en") {
            val other = strings("strings/$lang.json")
            for (key in wanted) assertNotNull("strings/$lang.json has no $key", other[key])
        }
    }

    /**
     * Every language the app registers has a file with exactly the English keys and the same placeholders, and
     * the app can read it. Arabic and Bengali carry Western digits only, so a number reads as it is dialled
     * (DECISIONS 2026-09-20).
     */
    @Test
    fun everyLanguageIsCompleteAndReadable() {
        val en = strings("strings/en.json")
        val holes = { s: String -> Regex("\\{(\\w+)}").findAll(s).map { it.value }.sorted().joinToString(",") }
        // Strings.kt is read as text: this test runs on a plain JVM and never loads a class that names android.*.
        val declared = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Strings.kt").readText()
        assertTrue("L.LANGUAGES does not list $LANGS", declared.contains("""val LANGUAGES = listOf("en", "es", "ar", "bn")"""))
        for (lang in LANGS - "en") {
            val other = strings("strings/$lang.json")
            assertEquals("strings/$lang.json has different keys", en.keys.sorted(), other.keys.sorted())
            for ((key, value) in en) {
                assertEquals("$lang $key has different placeholders", holes(value), holes(other.getValue(key)))
                for (n in listOf("911", "988", "211")) {
                    if (value.contains(n)) assertTrue("$lang $key lost $n", other.getValue(key).contains(n))
                }
            }
            if (lang == "ar" || lang == "bn") {
                val native = Regex("[\\u0660-\\u0669\\u06F0-\\u06F9\\u09E6-\\u09EF]")
                for ((key, value) in other) assertFalse("$lang $key uses non-Western digits", native.containsMatchIn(value))
            }
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
        for (k in listOf("about.p1", "about.independent", "about.p2", "about.p3", "about.data")) built += k
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
            // Chosen inside an `if` in Format.clock, and asked for on a listing that has no street address.
            "clock.am", "clock.pm", "detail.not_found",
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

    // ---- which report buttons one listing gets ---------------------------------------------------------------

    /**
     * "Out of supplies or food today" is offered only where there are supplies. The Android app offered it on every
     * listing, an emergency room included (Android review, 2026-09-20); the web app and the iPhone app both filter
     * it. All three now use the same rule, so this test reads theirs and checks ours behaves the same way.
     */
    @Test
    fun theOutOfSuppliesButtonIsOnlyOfferedWhereThereAreSupplies() {
        // Ours.
        for (category in listOf("food", "food.pantry", "food.meal", "harm", "harm.narcan", "harm.supplies")) {
            assertTrue("$category should offer out_of_stock", listingKinds(category).contains("out_of_stock"))
            assertEquals("no other kind may be dropped", LISTING_KINDS.size, listingKinds(category).size)
        }
        for (category in listOf("health.er", "health.urgent", "health.clinic", "shelter.emergency", "legal",
            "jobs.find", "treatment.detox", "rec", "shelter.dv", "")) {
            assertFalse("$category must not offer out_of_stock", listingKinds(category).contains("out_of_stock"))
            assertEquals(LISTING_KINDS.size - 1, listingKinds(category).size)
        }
        // The order of the ones that stay is the order in LISTING_KINDS, which is the order all three apps show.
        assertEquals(LISTING_KINDS.filter { it != "out_of_stock" }, listingKinds("legal"))

        // The web app's rule, as text: a change there fails here rather than drifting quietly.
        val web = text("apps/web/src/main.ts")
        assertTrue(
            "apps/web/src/main.ts no longer filters out_of_stock the way this app does",
            web.contains("""LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category))"""),
        )
        // And the iPhone app's. Its file has moved once already (HelpApp -> Sources/HelpCore), so it is found by
        // what it declares rather than by where it happens to live.
        val ios = swiftFileDeclaring("enum ReportKinds")
        assertNotNull("no Swift file declares ReportKinds any more", ios)
        assertTrue(
            "${ios!!.path} no longer filters out_of_stock the way this app does",
            ios.readText().contains(""" != "out_of_stock" || category.hasPrefix("food") || category.hasPrefix("harm")"""),
        )
        // The screen must actually use the filter rather than the raw list.
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/Screens.kt")
        assertTrue("Screens.kt loops over the unfiltered LISTING_KINDS again", screens.contains("listingKinds(row.category)"))
        assertFalse("Screens.kt loops over the unfiltered LISTING_KINDS again", screens.contains("for (kind in LISTING_KINDS)"))
    }

    /**
     * The screens that offer "Leave this page fast" are the screens the web app marks `quickExit` — checked by
     * `needsMatchTheWebApp` above, which now carries the flag in the line it compares, and asserted here as the set
     * the reviewer named so that a failure says which screen changed.
     */
    @Test
    fun theSameScreensOfferAQuickExitInEveryApp() {
        assertEquals(
            listOf("unsafe", "talk", "drugs", "assault"),
            NEEDS.filter { it.quickExit }.map { it.id },
        )
        val web = text("apps/web/src/needs.ts")
        val webExit = Regex("\\{ id: '([a-z_]+)'[^\\n]*quickExit: true").findAll(web).map { it.groupValues[1] }.toList()
        assertEquals("the two apps put the quick exit on different screens", webExit, NEEDS.filter { it.quickExit }.map { it.id })
        // The address is the same in both apps, so what someone learns on one is true of the other.
        assertTrue(text("apps/web/src/main.ts").contains("https://www.weather.gov/"))
        assertEquals("https://www.weather.gov/", Net.QUICK_EXIT_URL)
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

    // ---- the Transit app link (docs/research/2026-09-20/transit-app.md) --------------------------------------
    //
    // The same six cases as apps/ios/HelpAppTests ListingTests and the web app's own tests, so the three apps
    // cannot drift on which listings get a bus link and what is in it.

    /** A place with both a point and an address: Transit gets the point, because it geocodes address strings
     *  loosely by its own documentation. This is the reverse of what the maps link does, on purpose. */
    @Test
    fun theTransitAppGetsTheCoordinateWhenThePublisherGivesOne() {
        val pantry = BundleRow(id = "sal_p", name = "A pantry", category = "food.pantry",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"), lat = 42.3378412, lon = -83.1770116)
        assertEquals("42.3378412,-83.1770116", transitAppDestination(pantry))
        assertEquals("1234 Woodward Ave, Detroit, MI 48226", mapsDestination(
            BundleRow(id = "sal_p2", name = "x", category = "food.pantry",
                address = Address("1234 Woodward Ave", "Detroit", "48226"), lat = 42.33, lon = -83.05)))
    }

    @Test
    fun theTransitAppFallsBackToTheWrittenAddress() {
        val clinic = BundleRow(id = "sal_c", name = "A clinic", category = "health.clinic",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"))
        assertEquals("2424 W Grand Blvd, Detroit, MI 48208", transitAppDestination(clinic))
    }

    /** The same gate as Directions: a listing whose directions are withheld gets no Transit link either. */
    @Test
    fun theTransitAppIsNeverOfferedForASensitiveListing() {
        for (category in listOf("shelter.dv", "health.mental", "health.mental.crisis")) {
            assertNull(transitAppDestination(BundleRow(id = "sal_s", name = "x", category = category,
                address = Address("1 Main St", "Detroit", "48226"), lat = 42.3, lon = -83.1)))
        }
    }

    /** Treatment keeps its directions, because people have to get there, so it keeps the Transit link too. */
    @Test
    fun theTransitAppIsOfferedForTreatment() {
        assertNotNull(transitAppDestination(BundleRow(id = "sal_t", name = "Detox", category = "treatment.detox",
            address = Address("1 Main St", "Detroit", "48226"))))
    }

    @Test
    fun noAddressAndNoPointMeansNoTransitLink() {
        assertNull(transitAppDestination(station(lat = null, lon = null)))
    }

    /** The link carries the destination and nothing else. No `from`, ever: Transit's own note says leaving it
     *  out uses the person's own location, which Transit asks for itself. We pass no origin and read none. */
    @Test
    fun theTransitLinkCarriesNoOrigin() {
        val pantry = BundleRow(id = "sal_p", name = "A pantry", category = "food.pantry",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"), lat = 42.3, lon = -83.1)
        val link = "transit://directions?to=" + transitAppDestination(pantry)
        assertEquals("transit://directions?to=42.3,-83.1", link)
        assertFalse("the Transit link must never carry an origin", link.contains("from"))
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
            "sensitive=${flag(head, "sensitive")} exit=${flag(head, "quickExit")} " +
            "intro=${value(head, "intro") ?: "-"} " +
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

    /** The one Swift file in apps/ios that declares `what`, wherever the iPhone app keeps it today. */
    private fun swiftFileDeclaring(what: String): File? =
        File(root, "apps/ios").walkTopDown()
            .filter { it.isFile && it.name.endsWith(".swift") }
            .firstOrNull { it.readText().contains(what) }

    private fun kotlinSources(): List<File> =
        (File(root, "apps/android/app/src/main/kotlin/org/help313/app").listFiles() ?: emptyArray())
            .filter { it.name.endsWith(".kt") }.sortedBy { it.name }

    /** A strings file is a flat object of strings; this reads it without a JSON library, in the app's own style. */
    private fun strings(path: String): Map<String, String> =
        org.help313.query.Json.parse(text(path)).obj.mapNotNull { (k, v) -> v.str?.let { k to it } }.toMap()
}
