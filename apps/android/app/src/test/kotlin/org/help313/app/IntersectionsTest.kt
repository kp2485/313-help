// "Type a cross street", on a plain JDK: the parser table, the name folding, the crossing maths on a synthetic
// grid where every answer is known by hand, and two real spot checks against the streets the app actually ships.
//
// It runs under `:core` as well as `:app`, because this is the way in for a person who will not or cannot share a
// location — the survivor whose service has been cut off, in Kyle's words — and a wrong answer here is the app
// putting them somewhere they are not.
//
// The parser and folding cases are the web's own table (apps/web/test/behaviour.test.ts), case for case: if the
// two files ever disagree, one of the clients has drifted and this is where it shows.
package org.help313.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class IntersectionsTest {

    private val root = File("../../..")

    @Before
    fun clean() = Intersections.forget()

    // ---- the names ----------------------------------------------------------------------------------------------

    /**
     * The folding table. Every row is a thing a person types or a thing the City wrote, and what the two have to
     * agree on. Case, apostrophes, full stops, number words, street-type words and the half of town.
     */
    @Test
    fun streetNamesFoldTheSameWayOnBothSides() {
        val cases = listOf(
            // typed/published          name          direction
            Triple("Woodward", "woodward", ""),
            Triple("Woodward Ave", "woodward", ""),
            Triple("woodward avenue", "woodward", ""),
            Triple("W. Warren Ave", "warren", "w"),
            Triple("West Warren", "warren", "w"),
            Triple("E Warren Ave", "warren", "e"),
            Triple("Seven Mile", "7 mile", ""),
            Triple("W 7 Mile Rd", "7 mile", "w"),
            Triple("seven mile road", "7 mile", ""),
            Triple("Gratiot", "gratiot", ""),
            Triple("St. Aubin St", "st aubin", ""),
            Triple("Mt Elliott", "mt elliott", ""),
            // A street-type word that is the WHOLE name keeps it: "Way" and "Circle" are streets in this city.
            Triple("Way", "way", ""),
            Triple("Circle", "circle", ""),
            // A service drive is a kind of road, not Woodward.
            Triple("M-1 Service Drive", "m 1 service", ""),
            Triple("  woodward   ave  ", "woodward", ""),
            Triple("", "", ""),
        )
        for ((typed, name, dir) in cases) {
            val n = Intersections.normStreet(typed)
            assertEquals("name of \"$typed\"", name, n.name)
            assertEquals("direction of \"$typed\"", dir, n.dir)
        }
    }

    /** A typed direction narrows; no typed direction matches either half of the street. */
    @Test
    fun aTypedDirectionNarrowsAndNoDirectionMatchesBothHalves() {
        val east = Intersections.normStreet("E Warren")
        val west = Intersections.normStreet("W Warren")
        val plain = Intersections.normStreet("Warren")
        assertTrue("no direction matches the east half", Intersections.nameMatches(plain, east))
        assertTrue("no direction matches the west half", Intersections.nameMatches(plain, west))
        assertTrue("east matches a street with no direction", Intersections.nameMatches(east, plain))
        assertTrue("east matches east", Intersections.nameMatches(east, east))
        assertTrue("east does not match west", !Intersections.nameMatches(east, west))
        assertTrue("a different name never matches", !Intersections.nameMatches(plain, Intersections.normStreet("Gratiot")))
    }

    // ---- what a person typed ---------------------------------------------------------------------------------------

    /** The separators people actually use, and the one-name case. */
    @Test
    fun theParserTakesEveryWayPeopleWriteAJunction() {
        val cases = listOf(
            "Woodward and Warren" to ("Woodward" to "Warren"),
            "Woodward & Warren" to ("Woodward" to "Warren"),
            "Warren at Woodward" to ("Warren" to "Woodward"),
            "Woodward/Warren" to ("Woodward" to "Warren"),
            "Woodward / Warren" to ("Woodward" to "Warren"),
            "Woodward+Warren" to ("Woodward" to "Warren"),
            "Woodward @ Warren" to ("Woodward" to "Warren"),
            "Woodward x Warren" to ("Woodward" to "Warren"),
            "  Woodward   and   Warren  " to ("Woodward" to "Warren"),
            // One name on its own: `b` is empty, which is what makes the answer the middle of that street.
            "Woodward" to ("Woodward" to ""),
            "W 7 Mile Rd" to ("W 7 Mile Rd" to ""),
            // Three names: the first two, because a junction is two streets.
            "Woodward and Warren and Cass" to ("Woodward" to "Warren"),
        )
        for ((typed, want) in cases) {
            val got = Intersections.parseCrossing(typed)
            assertNotNull("\"$typed\" parsed to nothing", got)
            assertEquals("first street of \"$typed\"", want.first, got!!.first)
            assertEquals("second street of \"$typed\"", want.second, got.second)
        }
        assertNull("empty text is no junction", Intersections.parseCrossing(""))
        assertNull("blank text is no junction", Intersections.parseCrossing("   "))
        assertNull("null text is no junction", Intersections.parseCrossing(null))
        // "Andover" starts with "and" and is one street, not two: the separator needs spaces round it.
        assertEquals("Andover", Intersections.parseCrossing("Andover")!!.first)
    }

    // ---- the two pieces the grid cases exercise only indirectly --------------------------------------------------
    // Carried over from the Directions branch's own port of intersections.ts, which was dropped in favour of this
    // file (2026-09-22). Both are worth asserting on their own: a wrong answer here is a junction in the wrong
    // place, and the grid below would only show it as a missing crossing.

    /** Where two straight pieces cross, and the three ways there is no answer. */
    @Test
    fun twoPiecesCrossWhereTheyCross() {
        val hit = Intersections.segmentCross(1.0, 0.0, 1.0, 2.0, 0.0, 1.0, 2.0, 1.0)!!
        assertEquals(1.0, hit[0], 1e-9)
        assertEquals(1.0, hit[1], 1e-9)
        assertNull("parallel", Intersections.segmentCross(0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0))
        assertNull(
            "the lines would meet, but not within either piece",
            Intersections.segmentCross(0.0, 0.0, 1.0, 0.0, 5.0, -1.0, 5.0, 1.0),
        )
        assertNull("a piece of no length", Intersections.segmentCross(0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0))
    }

    /**
     * The axis is whichever way the answers are actually spread, so two crossings of an east-west pair read east
     * and west rather than being forced onto north and south.
     */
    @Test
    fun theAxisIsWhicheverWayTheAnswersAreSpread() {
        assertEquals(
            listOf("west", "east"),
            Intersections.whereWords(listOf(LatLonPoint(42.350, -83.20), LatLonPoint(42.351, -83.00))),
        )
        assertEquals(
            listOf("north", "south"),
            Intersections.whereWords(listOf(LatLonPoint(42.45, -83.05), LatLonPoint(42.26, -83.05))),
        )
        assertEquals("one answer is not at an end of anything", listOf(""), Intersections.whereWords(listOf(LatLonPoint(42.35, -83.05))))
    }

    // ---- the crossings, on a grid whose every answer is known by hand -----------------------------------------------

    /**
     * A synthetic grid: three north-south streets and three east-west ones, a tenth of a degree apart, so every
     * crossing is a number that can be worked out on paper and compared to the metre.
     */
    private fun grid(): BaseMap {
        fun line(name: String, pts: List<Pair<Double, Double>>): MapLine {
            val out = DoubleArray(pts.size * 2)
            for (i in pts.indices) {
                out[i * 2] = MapProjection.x(pts[i].second)
                out[i * 2 + 1] = MapProjection.y(pts[i].first)
            }
            return MapLine(2, name, out)
        }
        val roads = listOf(
            line("Alpha Ave", listOf(42.30 to -83.10, 42.40 to -83.10)),
            line("Beta St", listOf(42.30 to -83.05, 42.40 to -83.05)),
            line("Gamma Rd", listOf(42.30 to -83.00, 42.40 to -83.00)),
            line("E Delta Blvd", listOf(42.32 to -83.12, 42.32 to -82.98)),
            line("W Delta Blvd", listOf(42.36 to -83.12, 42.36 to -82.98)),
            // Never crosses any of the north-south three: it lives east of all of them.
            line("Lonely Ln", listOf(42.30 to -82.95, 42.40 to -82.95)),
        )
        return BaseMap(roads, emptyList(), emptyList(), emptyList(), "2026-09-22")
    }

    @Test
    fun oneJunctionIsOnePoint() {
        val map = grid()
        val out = Intersections.resolve(map, "Beta and E Delta")
        assertTrue("Beta & E Delta should be one junction, got $out", out is CrossOutcome.Point)
        val p = (out as CrossOutcome.Point).point
        assertEquals("latitude", 42.32, p.lat, 1e-6)
        assertEquals("longitude", -83.05, p.lon, 1e-6)
    }

    /**
     * Two streets that cross more than once come back as a short list, **north to south**, each named by the end
     * of the street it is at. "Delta" with no direction matches both halves, so Beta crosses it twice.
     */
    @Test
    fun severalJunctionsComeBackAsAListNorthToSouthWithTheEndTheyAreAt() {
        val out = Intersections.resolve(grid(), "Beta and Delta")
        assertTrue("expected a list of choices, got $out", out is CrossOutcome.Choices)
        val c = out as CrossOutcome.Choices
        assertEquals("two crossings", 2, c.choices.size)
        assertEquals("north first", 42.36, c.choices[0].point.lat, 1e-6)
        assertEquals("then south", 42.32, c.choices[1].point.lat, 1e-6)
        assertEquals("north", c.choices[0].where)
        assertEquals("south", c.choices[1].where)
    }

    /** Two streets we know that never meet say so; they are never given the nearest point instead. */
    @Test
    fun twoStreetsThatNeverMeetSaySo() {
        val out = Intersections.resolve(grid(), "Lonely and Beta")
        assertTrue("expected no_crossing, got $out", out is CrossOutcome.NoCrossing)
    }

    /** A name the bundle's streets do not carry says so **by name**, so the screen can offer the ZIP instead. */
    @Test
    fun aNameWeDoNotHaveIsNamed() {
        val out = Intersections.resolve(grid(), "Nowhere and Beta")
        assertTrue("expected unknown, got $out", out is CrossOutcome.Unknown)
        assertEquals("Nowhere", (out as CrossOutcome.Unknown).unknown)
        // The SECOND name is the one reported when the first is known.
        val other = Intersections.resolve(grid(), "Beta and Nowhere")
        assertEquals("Nowhere", (other as CrossOutcome.Unknown).unknown)
    }

    /** One street name gives the middle of it, halfway ALONG the street and not the middle of its box. */
    @Test
    fun oneStreetNameGivesTheMiddleOfIt() {
        val out = Intersections.resolve(grid(), "Beta")
        assertTrue("expected a street midpoint, got $out", out is CrossOutcome.Street)
        val p = (out as CrossOutcome.Street).point
        assertEquals("halfway along", 42.35, p.lat, 1e-4)
        assertEquals("on the street", -83.05, p.lon, 1e-6)
    }

    /**
     * Two crossings closer together than 120 m are one junction: a boulevard drawn as two carriageways must not
     * offer a person a choice between two points on the same corner.
     */
    @Test
    fun twoCarriagewaysAreOneJunction() {
        fun line(name: String, pts: List<Pair<Double, Double>>): MapLine {
            val out = DoubleArray(pts.size * 2)
            for (i in pts.indices) {
                out[i * 2] = MapProjection.x(pts[i].second)
                out[i * 2 + 1] = MapProjection.y(pts[i].first)
            }
            return MapLine(2, name, out)
        }
        // Two carriageways about 40 m apart (0.00036° of latitude ≈ 40 m), crossed by one street.
        val map = BaseMap(
            listOf(
                line("Split Blvd", listOf(42.3500 to -83.10, 42.3500 to -83.00)),
                line("Split Blvd", listOf(42.35036 to -83.10, 42.35036 to -83.00)),
                line("Cross St", listOf(42.30 to -83.05, 42.40 to -83.05)),
            ),
            emptyList(), emptyList(), emptyList(), "2026-09-22",
        )
        val out = Intersections.resolve(map, "Split and Cross")
        assertTrue("two carriageways should merge into one junction, got $out", out is CrossOutcome.Point)
    }

    /** At most six choices are offered: a list nobody can read is not a choice. */
    @Test
    fun atMostSixChoicesAreOffered() {
        fun line(name: String, pts: List<Pair<Double, Double>>): MapLine {
            val out = DoubleArray(pts.size * 2)
            for (i in pts.indices) {
                out[i * 2] = MapProjection.x(pts[i].second)
                out[i * 2 + 1] = MapProjection.y(pts[i].first)
            }
            return MapLine(2, name, out)
        }
        val roads = ArrayList<MapLine>()
        roads.add(line("Long Ave", listOf(42.30 to -83.05, 42.45 to -83.05)))
        // Ten separate east-west records, all of one name, well more than 120 m apart.
        for (i in 0 until 10) roads.add(line("Rung St", listOf((42.31 + i * 0.01) to -83.10, (42.31 + i * 0.01) to -83.00)))
        val out = Intersections.resolve(BaseMap(roads, emptyList(), emptyList(), emptyList(), ""), "Long and Rung")
        assertTrue(out is CrossOutcome.Choices)
        assertEquals(Intersections.MAX_CHOICES, (out as CrossOutcome.Choices).choices.size)
    }

    /** The cache is keyed by the NORMALISED names: two spellings of one junction are one entry and one answer. */
    @Test
    fun twoSpellingsOfOneJunctionGiveOneAnswer() {
        val map = grid()
        val a = Intersections.resolve(map, "Beta and E Delta") as CrossOutcome.Point
        val b = Intersections.resolve(map, "  beta st  AT  east delta blvd ") as CrossOutcome.Point
        assertEquals(a.point.lat, b.point.lat, 0.0)
        assertEquals(a.point.lon, b.point.lon, 0.0)
    }

    // ---- the streets the app actually ships ---------------------------------------------------------------------

    /**
     * Two junctions everybody in Detroit can place, resolved from the real `map/base.json` and `map/streets.json`.
     *
     * The tolerance is 300 m, which is wider than the junction and much narrower than a neighborhood: the point of
     * the check is that the answer is the corner a person meant, not that two City road records meet at the
     * centimetre.
     */
    @Test
    fun realJunctionsResolveWhereDetroitersWouldPutThem() {
        val map = realBaseMap() ?: return
        val cases = listOf(
            Triple("Woodward and Warren", 42.35679, -83.06429),
            Triple("Dequindre and Davison", 42.40972, -83.07758),
        )
        for ((typed, lat, lon) in cases) {
            val out = Intersections.resolve(map, typed)
            assertNotNull("\"$typed\" resolved to nothing", out)
            val point = when (out) {
                is CrossOutcome.Point -> out.point
                // Dequindre crosses Davison more than once in the City's records; the north one is the corner.
                is CrossOutcome.Choices -> out.choices.first().point
                else -> null
            }
            assertNotNull("\"$typed\" came back as $out, not a point", point)
            val away = Intersections.metersApart(point!!, LatLonPoint(lat, lon))
            assertTrue("\"$typed\" landed ${away.toInt()} m from where it should", away < 300)
        }
    }

    /** A street name the City does not carry is said to be unknown, over the real streets too. */
    @Test
    fun aStreetDetroitDoesNotHaveIsUnknownOverTheRealMap() {
        val map = realBaseMap() ?: return
        val out = Intersections.resolve(map, "Rue de Rivoli and Woodward")
        assertTrue("expected unknown, got $out", out is CrossOutcome.Unknown)
    }

    private fun realBaseMap(): BaseMap? {
        val base = File(root, "data/bundle/v1/map/base.json")
        val streets = File(root, "data/bundle/v1/map/streets.json")
        if (!base.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return null
        }
        return MapFileDecoder.baseMap(base.readBytes(), if (streets.isFile) streets.readBytes() else null)
    }
}
