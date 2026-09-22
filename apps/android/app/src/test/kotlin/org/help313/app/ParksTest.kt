// The 302 City parks, on a plain JDK: the decode of the file the app ships, and the **only two orders a list of
// them may ever have** (Parks.kt; DECISIONS 2026-09-22, "Parks and paths is the front door").
//
// The order is the test that matters. Nearest first when we know where somebody is, A to Z when we do not, and
// never by acres, never by the kind of park, never by anything else — a list of the places people live beside,
// sorted by a number, is the league table docs/13 forbids, and the sort is the moment it would happen.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ParksTest {

    private val root = File("../../..")
    private val shipped = File(root, "data/bundle/v1/$PARKS_FILE")

    private fun real(): List<Park>? {
        if (!shipped.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return null
        }
        return decodeParks(shipped.readBytes())
    }

    // ---- the file the app ships ------------------------------------------------------------------------------------

    @Test
    fun theShippedParkListDecodes() {
        val parks = real() ?: return
        assertEquals("the City's layer has 302 parks", 302, parks.size)
        assertTrue("every park has an id", parks.all { it.id.startsWith("plc_park_") })
        assertTrue("every park has a name", parks.all { it.name.isNotBlank() })
        assertTrue("ids are not reused", parks.map { it.id }.toSet().size == parks.size)
        // Most publish a coordinate; a park that does not is a row we keep and never guess a point for.
        assertTrue("almost none of them can be put on a map", parks.count { it.point != null } > 250)
        val named = parkById(parks, "plc_park_alfred_brush_ford")
        assertNotNull("a park the City has published for years is missing", named)
        assertEquals("Alfred Brush Ford", named!!.name)
        assertEquals("100 Lenox St", named.address)
        assertEquals(33.9, named.acres!!, 1e-9)
    }

    /** A park with no published street address says so; a coordinate is never printed as if it were one. */
    @Test
    fun aParkWithNoPublishedAddressCarriesNone() {
        val parks = real() ?: return
        for (p in parks) assertTrue("a blank address should decode to nothing at all", p.address?.isNotBlank() ?: true)
    }

    // ---- the only two orders ------------------------------------------------------------------------------------------

    private fun park(id: String, name: String, acres: Double?, lat: Double?, lon: Double?) =
        Park(id, name, null, "Park: Mini", acres, lat, lon)

    @Test
    fun withNoLocationTheListIsAToZ() {
        val list = listOf(
            park("c", "Palmer Park", 296.0, 42.42, -83.12),
            park("a", "Belle Isle", 982.0, 42.34, -82.98),
            park("b", "clark park", 30.0, 42.31, -83.10),
        )
        assertEquals(
            listOf("Belle Isle", "clark park", "Palmer Park"),
            parksInOrder(list, null).map { it.name },
        )
    }

    @Test
    fun withALocationTheListIsNearestFirst() {
        val here = LatLon(42.3314, -83.0458)   // downtown
        val list = listOf(
            park("far", "Far Park", 1.0, 42.44, -83.25),
            park("near", "Near Park", 900.0, 42.3330, -83.0470),
            park("mid", "Mid Park", 10.0, 42.36, -83.08),
        )
        assertEquals(listOf("Near Park", "Mid Park", "Far Park"), parksInOrder(list, here).map { it.name })
    }

    /** A park the City publishes no point for cannot be measured, so it keeps its place at the end in name
     *  order — never dropped, and never given an invented distance. */
    @Test
    fun aParkWithNoCoordinateGoesLastInNameOrderRatherThanBeingDropped() {
        val here = LatLon(42.3314, -83.0458)
        val list = listOf(
            park("z", "Zeta Park", 1.0, null, null),
            park("near", "Near Park", 1.0, 42.3330, -83.0470),
            park("a", "Alpha Park", 1.0, null, null),
        )
        val out = parksInOrder(list, here).map { it.name }
        assertEquals(listOf("Near Park", "Alpha Park", "Zeta Park"), out)
        assertEquals("nothing is lost", 3, out.size)
    }

    /**
     * **The order never moves with a number about the park.** Same names, same points, acres scrambled: the list
     * has to come back identical, both with a location and without one. This is the one thing about this screen
     * that docs/13 rule out, so it is checked rather than reasoned about.
     */
    @Test
    fun parksOrderIsNeverByAnIndicator() {
        val here = LatLon(42.3314, -83.0458)
        val plain = listOf(
            park("a", "Alpha Park", 1.0, 42.34, -83.05),
            park("b", "Beta Park", 2.0, 42.36, -83.06),
            park("c", "Gamma Park", 3.0, 42.38, -83.07),
        )
        val scrambled = listOf(
            park("a", "Alpha Park", 9999.0, 42.34, -83.05),
            park("b", "Beta Park", 0.1, 42.36, -83.06),
            park("c", "Gamma Park", null, 42.38, -83.07),
        )
        assertEquals(parksInOrder(plain, null).map { it.id }, parksInOrder(scrambled, null).map { it.id })
        assertEquals(parksInOrder(plain, here).map { it.id }, parksInOrder(scrambled, here).map { it.id })
        // And the kind of park is just as irrelevant.
        val byType = plain.mapIndexed { i, p ->
            Park(p.id, p.name, p.address, listOf("Park: Regional", "Park: Mini", "Park: Golf")[i], p.acres, p.lat, p.lon)
        }
        assertEquals(parksInOrder(plain, null).map { it.id }, parksInOrder(byType, null).map { it.id })
    }

    /** One bundle, one point, one list: ties fall back to the name so the order never wobbles between launches. */
    @Test
    fun theSameListComesBackTheSameWayEveryTime() {
        val here = LatLon(42.35, -83.05)
        val list = listOf(
            park("b", "Same Distance B", 1.0, 42.36, -83.05),
            park("a", "Same Distance A", 1.0, 42.36, -83.05),
        )
        assertEquals(listOf("a", "b"), parksInOrder(list, here).map { it.id })
        assertEquals(listOf("a", "b"), parksInOrder(list.reversed(), here).map { it.id })
    }

    @Test
    fun anIdThatIsNotInTheListOpensNothing() {
        assertNull(parkById(emptyList(), "plc_park_nowhere"))
        val parks = real() ?: return
        assertNull(parkById(parks, "plc_park_nowhere"))
    }

    /** The real 302, ordered from a real point: the nearest really is the nearest, measured the same way. */
    @Test
    fun theRealListOrdersFromARealPoint() {
        val parks = real() ?: return
        val here = LatLon(42.3314, -83.0458)
        val ordered = parksInOrder(parks, here)
        assertEquals("nothing is lost or added", parks.size, ordered.size)
        val measured = ordered.filter { it.point != null }
        for (i in 1 until measured.size) {
            val a = parkMiles(measured[i - 1], here)!!
            val b = parkMiles(measured[i], here)!!
            assertTrue("park ${measured[i].name} is nearer than the one before it", a <= b + 1e-9)
        }
        // Without a location the same list is strictly alphabetical.
        val abc = parksInOrder(parks, null)
        assertEquals(parksAtoZ(parks).map { it.id }, abc.map { it.id })
    }

    /** The distances the park page's two rows are drawn from are stated once, here, and not invented per screen. */
    @Test
    fun theTwoDistancesAParkPageUsesAreTheOnesTheDocsName() {
        assertEquals("a quarter mile for help within a ten-minute walk", 0.25, PARK_HELP_MILES, 0.0)
        assertEquals("half a mile for a greenway stretch", 0.5, PARK_GREENWAY_MILES, 0.0)
        assertEquals("rec.paths_gap", PARKS_GAP_KEY)
    }
}
