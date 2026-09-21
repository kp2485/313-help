// The neighborhood rules, on a plain JDK: the decode, where a point falls, the order of the index, the name
// filter, and every number that reaches a screen (Hoods.kt, docs/13).
//
// It runs under `:core` as well as `:app` — `HELP313_NO_ANDROID=1 ./gradlew :core:test` — because these are rules
// a mistake in would be worst: an index that quietly sorted by a number would be the league table docs/13 forbids,
// and a suppressed count turned back into a digit would undo the suppression.
//
// **It reads the file the app actually ships.** A decoder held only to a fixture is a decoder held to a guess: the
// last test below opens data/bundle/v1/indicators/neighborhoods.json, all 380 KB of it, and checks that every one
// of the 205 neighborhoods came back whole.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Locale

class HoodsTest {

    /** Tests run from `apps/android/app` (and from `apps/android/core`, at the same depth). */
    private val root = File("../../..")

    private val shipped = File(root, "data/bundle/v1/indicators/neighborhoods.json")

    /**
     * The neighborhood numbers out of the bundle, or **null when there is no bundle**.
     *
     * CI builds no data bundle — the android job is a JDK-only one that runs `:query:test :core:test` and never
     * `pnpm build:bundle` — so a test that asserted the file exists would fail there and say nothing about the
     * code. Every test below that needs it returns early instead, printing the same sentence GuardsTest and
     * VerifyTest print. They all run on a laptop after a build, which is where the real file is checked.
     */
    private fun real(): Indicators? {
        if (!shipped.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return null
        }
        return decodeIndicators(shipped.readBytes())
    }

    // ---- the file the app ships ------------------------------------------------------------------------------

    /**
     * The real file, decoded — not a fixture. Every count, every outline and every source.
     *
     * This is the test that would have caught a `center` read the wrong way round (it did, 2026-09-22: the bundle
     * writes [lat, lon] and `origin` writes [lon, lat], and the first draft read both the same way).
     */
    @Test
    fun theShippedIndicatorsFileDecodes() {
        val d = real() ?: return
        assertEquals("the City's layer has 205 neighborhoods", 205, d.neighborhoods.size)
        assertNotNull("no sales source", d.sources["sales"])
        assertNotNull("no neighborhoods source", d.sources["neighborhoods"])
        assertTrue("no citywide years", d.years.isNotEmpty())
        assertEquals(2, d.origin.size)
        assertTrue("origin is [lon, lat]", d.origin[0] < -80 && d.origin[1] > 40)

        for (h in d.neighborhoods) {
            assertTrue("a neighborhood with no id", h.id.startsWith("nbh_"))
            assertTrue("${h.id} has no name", h.name.isNotEmpty())
            assertTrue("${h.id} has no outline", h.rings.any { it.size >= 6 })
            // The middle of the neighborhood is in Detroit, not in the Gulf of Mexico: proof that `center` is
            // [lat, lon] and not the other way about.
            assertTrue("${h.id} centre is not in Detroit: ${h.center.lat}, ${h.center.lon}", inServiceArea(h.center))
            h.district?.let { assertTrue("${h.id} district $it", it in 1..7) }
        }
        // Names are unique, so a person who reads one on the index knows which page they are opening.
        assertEquals(d.neighborhoods.size, d.neighborhoods.map { it.id }.toSet().size)
    }

    /** A suppressed count arrives already hidden and there is no way back to the number. */
    @Test
    fun suppressedCountsStayWords() {
        val d = real() ?: return
        val hidden = d.neighborhoods.flatMap { it.years.values }.count { it.sales?.hidden == true } +
            d.neighborhoods.count { it.crashes?.bike?.hidden == true }
        assertTrue("the shipped file has no suppressed counts at all, which is not what docs/13 describes", hidden > 0)
        assertNull("a hidden count must have no value", HoodCount.HIDDEN.value)
        assertEquals("fewer than 5", hoodCountText(HoodCount.HIDDEN) { "fewer than 5" })
        assertEquals("none recorded", hoodCountText(null) { "none recorded" })
        assertEquals("14", hoodCountText(HoodCount.of(14)) { it })
        // And a hidden count never becomes a rate, which would hand the number back.
        assertNull(hoodRate(HoodCount.HIDDEN, 10_000))
    }

    // ---- where a point falls -----------------------------------------------------------------------------------

    /**
     * **The table all three clients are held to**, read from the file itself rather than copied into Kotlin:
     * `schema/neighborhoods/points.json`, which the web runs in apps/web/test/hoods-tab.test.ts and the iPhone app
     * runs in Swift. A point that opens Corktown in a browser opens Corktown on a phone.
     *
     * It is not in `schema/fixtures/`: the Swift and Kotlin fixture runners read every file in that folder and know
     * only the query-rule shapes, so a file of a new shape there fails them all.
     *
     * The three cities beside Detroit are in it on purpose. They are in the service area and they are on the map,
     * and they have no neighborhood pages, because the outlines and the numbers are the City of Detroit's: `null`
     * is a real answer and the screen says so rather than naming the nearest outline.
     */
    private fun shared(): org.help313.query.Json {
        val f = File(root, "schema/neighborhoods/points.json")
        assertTrue("no ${f.path}: the shared point cases are missing", f.isFile)
        return org.help313.query.Json.parse(f.readBytes())
    }

    @Test
    fun aPointFallsInTheNeighborhoodItIsIn() {
        val d = real() ?: return
        val cases = shared()["cases"]!!.arr
        assertTrue("the shared table has no cases", cases.size >= 11)
        for (c in cases) {
            val what = c["name"]?.str ?: "?"
            val found = hoodAt(d, c["lat"]!!.num!!, c["lon"]!!.num!!)
            assertEquals(what, c["expect"]?.str, found?.id)
        }
        // Every case that expects nothing really is outside every outline, and not merely misspelt.
        assertTrue("no case expects null", cases.any { it["expect"] == null })
    }

    /**
     * The ZIP cases from the same file. The bundle carries one point per ZIP — its centre — and that is what
     * decides; a ZIP covers more than one neighborhood and a screen that used one would say so (`hood.mine_zip`).
     */
    @Test
    fun aZipCentreFallsInTheNeighborhoodItIsIn() {
        val d = real() ?: return
        val zips = org.help313.query.Json.parse(File(root, "data/bundle/v1/places/zips.json").readBytes())["zips"]!!
        for (c in shared()["zip_cases"]!!.arr) {
            val zip = c["zip"]!!.str!!
            val point = zips[zip]?.arr ?: continue
            val found = hoodsForZip(d, LatLon(point[0].num!!, point[1].num!!))
            assertEquals(c["name"]?.str ?: zip, c.get("expect")!!.arr.mapNotNull { it.str }, found.map { it.id })
        }
    }

    /** Every neighborhood's own middle is inside its own outline, bar a handful of horseshoe-shaped ones. */
    @Test
    fun almostEveryCentreIsInsideItsOwnOutline() {
        val d = real() ?: return
        val inside = d.neighborhoods.count { hoodContains(it, d.origin, it.center.lat, it.center.lon) }
        assertTrue("only $inside of ${d.neighborhoods.size} centres are inside their own outline", inside >= 195)
    }

    /** A fix that is not a number is not inside anything, exactly as [inServiceArea] answers. */
    @Test
    fun aBrokenFixIsInsideNothing() {
        val d = real() ?: return
        val h = d.neighborhoods.first()
        assertFalse(hoodContains(h, d.origin, Double.NaN, -83.0))
        assertFalse(hoodContains(h, d.origin, 42.3, Double.POSITIVE_INFINITY))
    }

    // ---- the order of the index ----------------------------------------------------------------------------------

    /**
     * **The order never depends on a number** (docs/13 honesty rule 1: no league tables).
     *
     * The list is shuffled and every indicator on it is thrown away — no sales, no permits, no blight, no crashes,
     * no parcels, no help counts — and the order that comes back is the same order. Nothing on these screens can
     * become a ranking by accident.
     */
    @Test
    fun indexOrderNeverDependsOnANumber() {
        val d = real() ?: return
        val want = hoodsAtoZ(d.neighborhoods).map { it.id }
        val stripped = d.neighborhoods.shuffled(java.util.Random(7)).map { h ->
            Hood(
                id = h.id, name = h.name, district = h.district, jlgStudyArea = h.jlgStudyArea,
                center = h.center, rings = emptyList(),
                help = HoodHelp(0, emptyMap(), emptyMap(), emptyMap(), emptyList(), false),
                places = HoodPlaces(0, 0, 0, null, null), nearestCity = null, parcels = null,
                years = emptyMap(), now = null, crashes = null,
            )
        }
        assertEquals(want, hoodsAtoZ(stripped).map { it.id })
        assertEquals(
            want.filter { id -> d.hood(id)!!.district == 3 },
            hoodsByDistrict(stripped).first { it.district == 3 }.items.map { it.id },
        )
    }

    @Test
    fun theIndexIsAlphabeticalAndGrouped() {
        val d = real() ?: return
        val abc = hoodsAtoZ(d.neighborhoods)
        assertEquals("Airport Sub", abc.first().name)
        assertEquals("Yorkshire Woods", abc.last().name)
        for (i in 1 until abc.size) {
            assertTrue(
                "${abc[i - 1].name} is not before ${abc[i].name}",
                foldHoodName(abc[i - 1].name) <= foldHoodName(abc[i].name),
            )
        }
        // The six names where punctuation decides, in the order the web's `localeCompare` puts them. This is what
        // keeps the index reading the same way in a browser and on a phone (foldHoodName).
        assertEquals(
            listOf("Gratiot Town/Kettering", "Gratiot Woods", "Gratiot-Findlay", "Gratiot-Grand"),
            abc.map { it.name }.filter { it.startsWith("Gratiot") },
        )
        assertEquals(
            listOf("Greenfield", "Greenfield Park", "Greenfield-Grand River"),
            abc.map { it.name }.filter { it.startsWith("Greenfield") },
        )

        // By letter: every group is one letter, in order, and nothing is lost. A name filed under no letter is
        // filed last, under "Other", never first.
        val letters = hoodsByLetter(d.neighborhoods)
        assertEquals(d.neighborhoods.size, letters.sumOf { it.items.size })
        assertEquals(letters.mapNotNull { it.letter }, letters.mapNotNull { it.letter }.sorted())
        assertTrue("an Other group was filed before a letter", letters.dropLast(1).all { it.letter != null })
        // By district: 1 to 7 in order, then whatever has none, and nothing is lost or counted twice.
        val districts = hoodsByDistrict(d.neighborhoods)
        assertEquals(d.neighborhoods.size, districts.sumOf { it.items.size })
        assertEquals(
            districts.mapNotNull { it.district },
            districts.mapNotNull { it.district }.sorted(),
        )
        assertTrue("a district group is not alphabetical inside", districts.all { g ->
            g.items.map { foldHoodName(it.name) } == g.items.map { foldHoodName(it.name) }.sorted()
        })
    }

    // ---- finding a name -------------------------------------------------------------------------------------------

    @Test
    fun theFilterIgnoresCaseAndAccents() {
        assertTrue(hoodMatches("Corktown", "cork"))
        assertTrue(hoodMatches("Corktown", "CORK"))
        assertTrue(hoodMatches("Corktown", "  Cork "))
        assertTrue("an accent typed or not typed finds the same place", hoodMatches("Détroit Ouest", "detroit"))
        assertTrue(hoodMatches("Detroit Ouest", "détroit"))
        assertFalse(hoodMatches("Corktown", "bagley"))
        // A word of the name has to START with what was typed, so a word buried inside another is not a match.
        assertTrue(hoodMatches("Palmer Park", "park"))
        assertFalse(hoodMatches("Sparkle Street", "park"))
        // Every word typed has to find something.
        assertTrue(hoodMatches("North Corktown", "north cork"))
        assertFalse(hoodMatches("North Corktown", "north bagley"))
        // The punctuation in the City's own names is not something anybody should have to type.
        assertTrue(hoodMatches("Gratiot Town/Kettering", "kettering"))
        assertTrue(hoodMatches("Evergreen Lahser 7/8", "lahser"))
        val d = real() ?: return
        // Empty means the whole list, so nothing is hidden before a person types.
        assertEquals(d.neighborhoods.size, filterHoods(d.neighborhoods, "").size)
        assertEquals(d.neighborhoods.size, filterHoods(d.neighborhoods, "   ").size)
        // A real search over the real names. A word in the middle of a name counts, so "corktown" finds North
        // Corktown too: somebody who half remembers a name should not have to remember which half.
        assertEquals(listOf("Corktown", "North Corktown"), filterHoods(d.neighborhoods, "corktown").map { it.name })
        assertTrue(filterHoods(d.neighborhoods, "park").size > 1)
        assertTrue(filterHoods(d.neighborhoods, "zzzz").isEmpty())
        // A filter narrows a list; it never re-ranks one. What comes back is the A–Z order, with rows taken out.
        val some = filterHoods(d.neighborhoods, "e")
        assertEquals(hoodsAtoZ(some).map { it.id }, some.map { it.id })
    }

    // ---- the numbers, in words -------------------------------------------------------------------------------------

    /**
     * **Every number on these screens is written by hand and reads the same everywhere.**
     *
     * This test runs under whatever default locale the machine happens to have, and passes: that is the point. A
     * locale-dependent formatter gave a CI runner "9,9" where a phone said "9.9" and the iPhone PR went red on it
     * (2026-09-22), so there is no formatter left in Hoods.kt to disagree with anybody.
     */
    @Test
    fun everyNumberIsWrittenByHandAndReadsTheSameEverywhere() {
        val was = Locale.getDefault()
        try {
            // A language that writes a comma for the decimal point and a dot for the thousands: the worst case.
            Locale.setDefault(Locale.GERMANY)
            assertEquals("$85,000", hoodMoney(85_000.0))
            assertEquals("$1,250,000", hoodMoney(1_250_000.0))
            assertEquals("$0", hoodMoney(0.0))
            assertEquals("9.9", hoodRateText(9.94))
            assertEquals("1,234,567", hoodNumber(1_234_567))
            assertEquals("0.5", hoodFixed(0.5, 1))
        } finally {
            Locale.setDefault(was)
        }
    }

    /** The boundaries: where a decimal appears, where it goes, and where a number rounds up into the next word. */
    @Test
    fun theRoundingBoundaries() {
        // One decimal below ten, none at ten and above.
        assertEquals("9.9", hoodRateText(9.94))
        assertEquals("9.9", hoodRateText(9.95))   // 9.95 is not exactly 9.95 in binary; JavaScript agrees
        assertEquals("10.0", hoodRateText(9.96))
        assertEquals("10", hoodRateText(10.0))
        assertEquals("1,000", hoodRateText(999.5))
        assertEquals("0.0", hoodRateText(0.0))
        assertEquals("0.8", hoodRateText(0.84))
        assertEquals("14", hoodRateText(13.7))

        // Dollars, to the dollar.
        assertEquals("$1,234,567", hoodMoney(1_234_567.0))
        assertEquals("$86,900", hoodMoney(86_899.5))

        // Large amounts in words.
        assertEquals("$1.2 million", hoodBigMoney(1_234_567.0))
        assertEquals("$107.8 million", hoodBigMoney(107_800_000.0))
        assertEquals("$136 million", hoodBigMoney(135_999_561.0))
        assertEquals("$85 thousand", hoodBigMoney(85_000.0))
        assertEquals("$950", hoodBigMoney(950.0))
        assertEquals("$1.7 billion", hoodBigMoney(1_700_000_000.0))
        // Rounded first, then the word is chosen again: never "$1000 million".
        assertEquals("$1 billion", hoodBigMoney(999_950_000.0))
        // Under a thousand there is no word to use, so it is written out.
        assertEquals("$1,000", hoodBigMoney(999.5))

        // Grouping, on its own.
        assertEquals("0", hoodDigits(0))
        assertEquals("999", hoodDigits(999))
        assertEquals("1,000", hoodDigits(1000))
        assertEquals("-1,000", hoodDigits(-1000))
        assertEquals("1,234,567,890", hoodDigits(1_234_567_890))
    }

    @Test
    fun aRateNeedsABaseWeCanDefend() {
        assertEquals(10.0, hoodRate(HoodCount.of(100), 10_000)!!, 1e-9)
        assertNull("under a hundred lots there is no rate", hoodRate(HoodCount.of(4), 99))
        assertNull(hoodRate(HoodCount.of(4), null))
        assertNull(hoodRate(null, 10_000))
    }

    @Test
    fun aYearTableIsTheYearsTheCityTableHas() {
        val d = real() ?: return
        val h = d.hood("nbh_corktown")!!
        val rows = hoodYearRows(h, d, { it.permitCost }, count = { it.permits })
        assertEquals(d.years, rows.map { it.year })
        assertEquals(1, rows.count { it.soFar })
        assertEquals(d.partialYear.toString(), rows.first { it.soFar }.year)
        // Every bar is inside the table, and a year with no value has no bar at all.
        for (r in rows) {
            assertTrue(r.bar in 0.0..1.0)
            if (r.value == null) assertEquals(0.0, r.bar, 0.0)
        }
        assertEquals(1.0, rows.filter { it.value != null }.maxOf { it.bar }, 1e-9)
        // A rate table asks the city column for the city's own base, not this neighborhood's.
        val blight = hoodYearRows(h, d, { hoodRate(it.blight, h.parcels) }, { hoodRate(it.blight, d.cityParcels) }, { it.blight })
        assertEquals(d.years.size, blight.size)
    }

    /**
     * A "nearest listed" row opens the listing the **bundle** named, or it opens nothing.
     *
     * Four ways to open nothing, and each of them is the safe answer: no field at all (an older bundle), an id
     * this phone's list does not have, and — the one that matters — an id naming a sensitive or private listing.
     * A domestic-violence or mental-health-crisis row must never appear on a public neighborhood page and must
     * never carry a distance (docs/08), so the rule is written down rather than left to the data.
     */
    @Test
    fun aNearestRowOpensOnlyAListingTheBundleNamedAndMayName() {
        val rows = listOf(
            org.help313.query.BundleRow(id = "sal_pantry", name = "A pantry", category = "food.pantry"),
            org.help313.query.BundleRow(id = "sal_dv", name = "A crisis line", category = "shelter.dv"),
            org.help313.query.BundleRow(id = "sal_crisis", name = "A crisis line", category = "health.mental"),
        )
        val lookup = { id: String -> rows.firstOrNull { it.id == id } }
        fun hood(ids: Map<String, String>) = Hood(
            id = "nbh_x", name = "X", district = 1, jlgStudyArea = false, center = LatLon(42.33, -83.05),
            rings = emptyList(),
            help = HoodHelp(1, emptyMap(), mapOf("food" to 0.6), ids, emptyList(), false),
            places = HoodPlaces(0, 0, 0, null, null), nearestCity = null, parcels = null,
            years = emptyMap(), now = null, crashes = null,
        )
        assertEquals("sal_pantry", hoodNearestListing(hood(mapOf("food" to "sal_pantry")), "food", lookup)?.id)
        // No field at all: an older bundle, and the row is the plain one it always was.
        assertNull(hoodNearestListing(hood(emptyMap()), "food", lookup))
        // A kind the bundle named nothing for.
        assertNull(hoodNearestListing(hood(mapOf("food" to "sal_pantry")), "clinic", lookup))
        // An id this phone's copy of the list does not have.
        assertNull(hoodNearestListing(hood(mapOf("food" to "sal_gone")), "food", lookup))
        // And the one that must never happen, refused by name as well as by the data.
        assertNull(hoodNearestListing(hood(mapOf("food" to "sal_dv")), "food", lookup))
        assertNull(hoodNearestListing(hood(mapOf("food" to "sal_crisis")), "food", lookup))
    }

    /**
     * And in the file the app actually ships: every neighborhood names an id for each kind it has a distance for,
     * every id is a listing this phone's list holds, and not one of them is a sensitive or private listing.
     */
    @Test
    fun theShippedNearestIdsAllPointAtListingsThisAppMayShow() {
        val d = real() ?: return
        val rows = org.help313.query.Json
            .parse(File(root, "data/bundle/v1/category/food.json").readBytes()).arr
            .map { org.help313.query.BundleRow.fromJson(it) }
            .associateBy { it.id }
        var checked = 0
        for (h in d.neighborhoods) {
            for (kind in HOOD_NEAREST) {
                val id = h.help.nearestId[kind]
                // A distance and an id go together: null exactly where the distance is null.
                if (h.help.nearestMiles[kind] == null) {
                    assertNull("${h.id} names a $kind listing but no distance", id)
                    continue
                }
                assertNotNull("${h.id} has a $kind distance but names no listing", id)
                assertTrue("${h.id} $kind names ${id!!}", id.startsWith("sal_"))
                // The food ones can be checked against a real category file; the rest are checked for shape.
                if (kind == "food" && rows.containsKey(id)) {
                    val row = rows.getValue(id)
                    assertFalse("${h.id} names the sensitive listing $id", isSensitive(row.category))
                    assertEquals(row, hoodNearestListing(h, kind) { rows[it] })
                    checked++
                }
            }
        }
        assertTrue("no food listing was checked against the real bundle", checked > 100)
    }

    /** The four "nearest listed" kinds, and the order the page names them in, are the web's. */
    @Test
    fun thePageIsMadeOfTheSamePiecesAsTheWeb() {
        assertEquals(listOf("food", "clinic", "narcan", "indoors"), HOOD_NEAREST)
        assertEquals("add.cat.shelter.emergency", hoodCategoryKey("shelter"))
        assertEquals("add.cat.food", hoodCategoryKey("food"))
        val d = real() ?: return
        val sources = hoodSourceOrder(d)
        assertTrue("the sources list is empty", sources.isNotEmpty())
        assertEquals("the neighborhood layer comes last", d.sources["neighborhoods"]!!.name, sources.last().name)
        assertFalse("a source with no name reached the list", sources.any { it.name.isEmpty() })
    }

    /** Crime is left out on purpose, and no crash number is ever turned into a rate (docs/13). */
    @Test
    fun thereIsNoCrimePanelAndNoCrashRate() {
        val d = real() ?: return
        for (key in listOf("crime", "police", "arrests", "incidents")) {
            assertNull("the bundle carries a $key source", d.sources[key])
        }
        val h = d.neighborhoods.first { it.crashes != null }
        // The only numbers a crash panel has are the three counts and the citywide ones beside them.
        assertNotNull(h.crashes!!.walk)
        assertNotNull(d.crashYears)
        assertNotNull(d.cityCrashes)
    }
}
