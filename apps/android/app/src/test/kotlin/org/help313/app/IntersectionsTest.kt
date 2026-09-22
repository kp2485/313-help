// "Two streets that cross", case by case: the way this phone turns two street names into a point without asking
// anybody anything. The Kotlin half of the table apps/web/test/behaviour.test.ts holds the web to.
//
// Why it matters enough to have its own test: this is the only way a person who will not — or cannot — share a
// location can say where they are, and it is the one that has to work with no satellite and no signal. If it
// answers the wrong junction, a person walks the wrong way at night.
package org.help313.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IntersectionsTest {

    // ---- names --------------------------------------------------------------------------------------------

    @Test
    fun aNameIsTheNameWhateverIsWrittenRoundIt() {
        assertEquals("woodward" to "", normStreet("Woodward Ave").let { it.name to it.dir })
        assertEquals("woodward" to "", normStreet("  woodward  ").let { it.name to it.dir })
        assertEquals("warren" to "e", normStreet("E Warren Ave").let { it.name to it.dir })
        assertEquals("warren" to "e", normStreet("East Warren").let { it.name to it.dir })
        assertEquals("7 mile" to "w", normStreet("W 7 Mile Rd").let { it.name to it.dir })
        assertEquals("a person types the words, the City writes the digit", "7 mile", normStreet("seven mile").name)
        assertEquals("grand river" to "", normStreet("Grand River Avenue").let { it.name to it.dir })
        // A street-type word only ever comes off the END, and never when it is the whole name.
        assertEquals("way", normStreet("Way").name)
        assertEquals("m 1 service", normStreet("M-1 Service Drive").name)
        assertEquals("st aubin", normStreet("St. Aubin").name)
    }

    @Test
    fun theHalfOfAStreetSomebodyMeansIsTheHalfTheyGet() {
        val typedPlain = normStreet("Warren")
        val typedEast = normStreet("E Warren")
        assertTrue("no direction typed matches either half", nameMatches(typedPlain, normStreet("W Warren Ave")))
        assertTrue(nameMatches(typedPlain, normStreet("E Warren Ave")))
        assertTrue(nameMatches(typedEast, normStreet("E Warren Ave")))
        assertEquals(false, nameMatches(typedEast, normStreet("W Warren Ave")))
        assertEquals(false, nameMatches(normStreet("Warren"), normStreet("Woodward")))
    }

    // ---- what a person typed --------------------------------------------------------------------------------

    @Test
    fun theWordsPeopleActuallyUseBetweenTwoStreets() {
        for (typed in listOf(
            "Woodward and Warren", "Woodward & Warren", "Woodward at Warren",
            "Woodward/Warren", "Woodward + Warren", "Woodward x Warren", "Woodward @ Warren",
        )) {
            val p = parseCrossing(typed)!!
            assertEquals("$typed: first street", "Woodward", p.a)
            assertEquals("$typed: second street", "Warren", p.b)
        }
        assertEquals("", parseCrossing("Woodward")!!.b)
        assertNull(parseCrossing(""))
        assertNull(parseCrossing("   "))
        assertNull(parseCrossing(null))
    }

    // ---- where two straight pieces cross ----------------------------------------------------------------------

    @Test
    fun twoPiecesCrossWhereTheyCross() {
        // A vertical piece and a horizontal one, crossing at (1, 1).
        val hit = segmentCross(1.0, 0.0, 1.0, 2.0, 0.0, 1.0, 2.0, 1.0)!!
        assertEquals(1.0, hit[0], 1e-9)
        assertEquals(1.0, hit[1], 1e-9)
        // Parallel.
        assertNull(segmentCross(0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0))
        // They would cross, but not within either piece.
        assertNull(segmentCross(0.0, 0.0, 1.0, 0.0, 5.0, -1.0, 5.0, 1.0))
        // A piece of no length is not a crossing.
        assertNull(segmentCross(0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0))
    }

    // ---- a small city, so the whole answer can be asserted -----------------------------------------------------

    /** A straight north-south street and a straight east-west one, in world coordinates around downtown. */
    private fun line(name: String, vararg latLon: Double): MapLine {
        val pts = DoubleArray(latLon.size)
        var i = 0
        while (i < latLon.size) {
            pts[i] = MapProjection.x(latLon[i + 1])
            pts[i + 1] = MapProjection.y(latLon[i])
            i += 2
        }
        return MapLine(1, name, pts)
    }

    private fun city(vararg roads: MapLine) =
        BaseMap(roads.toList(), emptyList(), emptyList(), emptyList(), "2026-09-01")

    @Test
    fun oneJunctionIsOneAnswer() {
        val map = city(
            line("Woodward Ave", 42.30, -83.05, 42.40, -83.05),
            line("E Warren Ave", 42.35, -83.10, 42.35, -83.00),
        )
        forgetCrossings()
        val out = Crossings.resolve(map, "Woodward and Warren")
        assertTrue("expected one junction, got $out", out is CrossOutcome.Point)
        val p = (out as CrossOutcome.Point).point
        assertEquals(42.35, p.lat, 1e-6)
        assertEquals(-83.05, p.lon, 1e-6)
    }

    /** A boulevard drawn as two carriageways is one junction, not two: anything inside 120 m is merged. */
    @Test
    fun aBoulevardDrawnTwiceIsStillOneJunction() {
        val map = city(
            line("Woodward Ave", 42.30, -83.0500, 42.40, -83.0500),
            line("Woodward Ave", 42.30, -83.0504, 42.40, -83.0504),   // about 33 m apart
            line("E Warren Ave", 42.35, -83.10, 42.35, -83.00),
        )
        forgetCrossings()
        assertTrue(Crossings.resolve(map, "Woodward & Warren") is CrossOutcome.Point)
    }

    /** Two streets that really do cross twice: a short list to pick from, each named by the end it is at. */
    @Test
    fun twoCrossingsAreOfferedAsAChoice() {
        val map = city(
            line("Woodward Ave", 42.30, -83.05, 42.45, -83.05),
            // A street that comes back on itself, crossing Woodward in the north and again in the south.
            line("Outer Dr", 42.32, -83.10, 42.32, -83.00, 42.44, -83.00, 42.44, -83.10),
        )
        forgetCrossings()
        val out = Crossings.resolve(map, "Woodward at Outer Drive")
        assertTrue("expected a choice, got $out", out is CrossOutcome.Choices)
        val choices = (out as CrossOutcome.Choices).choices
        assertEquals(2, choices.size)
        assertEquals("the answers are spread north to south, so they are named north and south", listOf("north", "south"), choices.map { it.where })
        assertTrue("north to south: the northern one is offered first", choices[0].point.lat > choices[1].point.lat)
    }

    /** Where the answers are spread east to west, they are named east and west instead. */
    @Test
    fun theAxisIsWhicheverWayTheAnswersAreSpread() {
        val far = listOf(org.help313.query.LatLon(42.35, -83.20), org.help313.query.LatLon(42.351, -83.00))
        assertEquals(listOf("west", "east"), whereWords(far))
        val up = listOf(org.help313.query.LatLon(42.45, -83.05), org.help313.query.LatLon(42.26, -83.05))
        assertEquals(listOf("north", "south"), whereWords(up))
        assertEquals(listOf(""), whereWords(listOf(org.help313.query.LatLon(42.35, -83.05))))
    }

    @Test
    fun oneStreetIsTheMiddleOfIt() {
        val map = city(line("Woodward Ave", 42.30, -83.05, 42.40, -83.05))
        forgetCrossings()
        val out = Crossings.resolve(map, "Woodward")
        assertTrue("expected the middle of one street, got $out", out is CrossOutcome.Street)
        assertEquals("halfway ALONG it, not the middle of its box", 42.35, (out as CrossOutcome.Street).point.lat, 1e-4)
    }

    @Test
    fun twoStreetsWeKnowThatNeverMeet() {
        val map = city(
            line("Woodward Ave", 42.30, -83.05, 42.40, -83.05),
            line("Gratiot Ave", 42.30, -83.01, 42.40, -83.01),
        )
        forgetCrossings()
        val out = Crossings.resolve(map, "Woodward and Gratiot")
        assertTrue("expected no crossing, got $out", out is CrossOutcome.NoCrossing)
    }

    @Test
    fun aStreetThisBundleDoesNotCarryIsSaidSo() {
        val map = city(line("Woodward Ave", 42.30, -83.05, 42.40, -83.05))
        forgetCrossings()
        assertEquals("Wodwrd", (Crossings.resolve(map, "Wodwrd and Warren") as CrossOutcome.Unknown).unknown)
        // The FIRST one we could not find is the one named, so a person fixes one spelling at a time.
        assertEquals("Warren", (Crossings.resolve(map, "Woodward and Warren") as CrossOutcome.Unknown).unknown)
    }

    /** Six is as many choices as a list can be: a pair with more than that is a service drive. */
    @Test
    fun theChoicesAreCapped() {
        assertEquals(6, MAX_CHOICES)
        assertEquals(120.0, SAME_JUNCTION_M, 0.0)
    }
}
