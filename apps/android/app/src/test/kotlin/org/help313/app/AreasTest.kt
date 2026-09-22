// The four cities and the 205 outlines, on a plain JDK: the decode of the file the app actually ships, the
// allow-list a city page draws from, where a point falls, and what a tap on the outline layer finds.
//
// Two of these are the reason the file exists. **The allow-list** is what keeps "Dearborn does not publish blight
// tickets" a fact in the bundle rather than a habit of a screen. **Smallest-area-wins** is what makes a tap inside
// Detroit open the neighborhood a person is standing in rather than the city outline it sits inside.
//
// Nothing here may order anything by a number about an area (docs/13, honesty rule 1); the last test says so in
// the only way a test can, by handing the layer a set of outlines and checking that the answer moves with their
// SIZE and with nothing else.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AreasTest {

    private val root = File("../../..")
    private val shipped = File(root, "data/bundle/v1/indicators/neighborhoods.json")

    private fun real(): Indicators? {
        if (!shipped.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return null
        }
        return decodeIndicators(shipped.readBytes())
    }

    // ---- the file the app ships ----------------------------------------------------------------------------------

    @Test
    fun theShippedFileCarriesFourCitiesAndFourCityPages() {
        val d = real() ?: return
        assertEquals("four cities", 4, d.cities.size)
        assertEquals(
            "the four cities, in the bundle's own order",
            listOf("city_detroit", "city_hamtramck", "city_highland_park", "city_dearborn"),
            d.cities.map { it.id },
        )
        assertEquals("one page each", 4, d.areas.size)
        assertTrue("Detroit is the only city with neighborhoods under it", d.cities.count { it.hasNeighborhoods } == 1)
        assertTrue("Detroit has them", cityOf(d, "city_detroit")!!.hasNeighborhoods)
        assertTrue("Hamtramck does not", !cityOf(d, "city_hamtramck")!!.hasNeighborhoods)
        assertTrue("there are sources to cite", d.areaSources.isNotEmpty())
        for (a in d.areas) {
            assertTrue("${a.id} has no outline", a.hood.rings.isNotEmpty())
            assertTrue("${a.id} has no name", a.name.isNotEmpty())
            assertTrue("${a.id} draws no panel at all", cityPanels(a).isNotEmpty())
        }
    }

    /**
     * **The allow-list is the only way a panel is drawn.** Every panel an area asks for is one of the six, every
     * panel that is drawn has a source line, and the order is the fixed one whatever order the bundle lists them.
     */
    @Test
    fun aCityPageDrawsOnlyThePanelsItsOwnAllowListNames() {
        val d = real() ?: return
        for (a in d.areas) {
            for (p in a.panels) assertTrue("${a.id} asks for a panel that is not one of the six: $p", CITY_PANELS.contains(p))
            val drawn = cityPanels(a)
            assertEquals("${a.id} draws the panels in the fixed order", CITY_PANELS.filter { a.panels.contains(it) }, drawn)
            for (p in drawn) {
                // "help" is our own list and cites us, not an outside source; everything else names one.
                if (p == "help") continue
                assertNotNull("${a.id} draws $p with no source line", panelSource(a, d, p))
            }
        }
    }

    /** A panel that is not one of the six can never be drawn, however the data asks. */
    @Test
    fun aPanelThatIsNotOnTheListCanNeverBeDrawn() {
        val d = real() ?: return
        val real = d.areas.first { it.id == "city_hamtramck" }
        val meddled = Area(
            real.hood, real.city, real.kind,
            panels = listOf("crashes", "league_table", "parks", "help"),
            sources = real.sources, missing = real.missing, parkAcres = real.parkAcres,
            roadsBands = real.roadsBands, vacancy = real.vacancy, permitsByYear = real.permitsByYear,
        )
        assertEquals(
            "an invented panel is dropped, and the rest keep the fixed order",
            listOf("help", "parks", "crashes"), cityPanels(meddled),
        )
    }

    /**
     * SEMCOG ask for their sentence wherever their data is reproduced. It rides on the source, so it reaches every
     * panel of theirs and no panel that is not, and it is never rewritten by us.
     */
    @Test
    fun everySemcogPanelCarriesSemcogsOwnNotice() {
        val d = real() ?: return
        var semcogPanels = 0
        for (a in d.areas) for (p in cityPanels(a)) {
            val s = panelSource(a, d, p) ?: continue
            if (!s.name.contains("SEMCOG")) continue
            semcogPanels++
            assertTrue("a SEMCOG panel on ${a.id} carries no notice", !s.notice.isNullOrBlank())
            assertTrue("the notice is not SEMCOG's", s.notice!!.contains("SEMCOG"))
        }
        assertTrue("no SEMCOG panel found at all; the check would be vacuous", semcogPanels >= 4)
    }

    /** What a page says it has nothing about is said for a reason, and the reason is one of the two honest ones. */
    @Test
    fun aMissingPanelSaysWhichOfTheTwoHonestReasonsItIs() {
        val d = real() ?: return
        for (a in d.areas) for (m in a.missing) {
            assertTrue("${a.id} misses $m.panel for no stated reason", m.notPublished || m.noneRecorded)
            assertTrue("${a.id} says a panel is missing and draws it too", !a.panels.contains(m.panel) || m.noneRecorded)
        }
    }

    // ---- where a point falls -------------------------------------------------------------------------------------

    /**
     * The fix that was a dead end before this work: a Hamtramck, Highland Park or Dearborn resident now has a page
     * instead of being told, by name, that they are not in Detroit (audit C1).
     */
    @Test
    fun everyOneOfTheFourCitiesAnswersAPointInsideIt() {
        val d = real() ?: return
        val cases = listOf(
            Triple(42.3928, -83.0496, "city_hamtramck"),
            Triple(42.4055, -83.0968, "city_highland_park"),
            Triple(42.3223, -83.1763, "city_dearborn"),
        )
        for ((lat, lon, id) in cases) {
            val at = areaAt(d, lat, lon)
            assertNotNull("$id did not answer a point inside it", at)
            assertTrue("$lat,$lon came back as something other than a city page: $at", at is AreaPage.OfCity)
            assertEquals(id, (at as AreaPage.OfCity).area.id)
        }
    }

    /** Inside Detroit the neighborhood wins, because Detroit is the one city with outlines under it. */
    @Test
    fun insideDetroitTheNeighborhoodWinsOverTheCity() {
        val d = real() ?: return
        val at = areaAt(d, 42.3314, -83.0458)
        assertNotNull("downtown Detroit answered nothing", at)
        assertTrue("expected a neighborhood, got $at", at is AreaPage.OfNeighborhood)
        assertEquals(
            "the same answer the neighborhood index gives on its own",
            hoodAt(d, 42.3314, -83.0458)?.id, at!!.id,
        )
    }

    /** A point outside all four is still a real answer, and still null: nothing is guessed. */
    @Test
    fun aPointOutsideAllFourCitiesIsNull() {
        val d = real() ?: return
        assertNull("a point in Lake St Clair", areaAt(d, 42.46, -82.80))
        assertNull("a point in Ohio", areaAt(d, 41.50, -83.60))
        assertNull("a fix that is not a number", areaAt(d, Double.NaN, Double.NaN))
    }

    /** Every id the layer can hand a tap opens a page, and every page has a city name to put under its name. */
    @Test
    fun everyOutlineTheLayerDrawsOpensAPage() {
        val d = real() ?: return
        for (a in drawnAreas(d)) {
            val page = areaById(d, a.id)
            assertNotNull("the layer draws ${a.id}, which opens nothing", page)
            assertTrue("no city name for ${a.id}", cityNameOf(d, page!!).isNotEmpty())
        }
    }

    // ---- what the layer draws, and what a tap finds -----------------------------------------------------------------

    /** Cities and all 205 neighborhoods, at every zoom (docs/MAP-STYLE.md section 15). */
    @Test
    fun theLayerDrawsEveryOutlineAtEveryZoom() {
        val d = real() ?: return
        // Every outline, at every zoom (docs/MAP-STYLE.md section 15): what keeps 205 of them from being a mesh
        // is weight, not hiding. It is the NAMES the zoom still governs, in boundaryStyle.
        val all = drawnAreas(d)
        assertEquals("the four cities and all 205", 4 + 205, all.size)
        assertEquals("the four cities come first", 4, all.take(4).count { it.isCity })
        assertEquals("and nothing else is a city", 4, all.count { it.isCity })
    }

    /**
     * **The smallest outline holding the tap wins**, so a Detroit neighborhood beats the Detroit outline it sits
     * inside. The three squares below are nested on purpose: the answer has to move with their size and with
     * nothing else, which is also why no number about an area is anywhere near this function.
     */
    @Test
    fun theSmallestOutlineHoldingTheTapWins() {
        fun square(id: String, isCity: Boolean, half: Double) = DrawnArea(
            id, id, isCity,
            listOf(
                listOf(
                    LatLon(42.35 - half, -83.05 - half), LatLon(42.35 - half, -83.05 + half),
                    LatLon(42.35 + half, -83.05 + half), LatLon(42.35 + half, -83.05 - half),
                    LatLon(42.35 - half, -83.05 - half),
                ),
            ),
        )
        val big = square("big_city", true, 0.20)
        val middling = square("middling", false, 0.05)
        val small = square("small", false, 0.01)
        // Whatever order they arrive in, the smallest one holding the point is the answer.
        assertEquals("small", areaHit(listOf(big, middling, small), 42.35, -83.05)!!.id)
        assertEquals("small", areaHit(listOf(small, big, middling), 42.35, -83.05)!!.id)
        // Just outside the small one: the next smallest that still holds it.
        assertEquals("middling", areaHit(listOf(big, middling, small), 42.37, -83.05)!!.id)
        // Outside everything but the city outline.
        assertEquals("big_city", areaHit(listOf(big, middling, small), 42.50, -83.05)!!.id)
        // Outside all of them is a miss, never the nearest.
        assertNull(areaHit(listOf(big, middling, small), 43.50, -83.05))
        assertNull("no outlines at all is a miss", areaHit(emptyList(), 42.35, -83.05))
    }

    /** On the real outlines: a tap in Hamtramck finds Hamtramck, which is an island inside Detroit's outline. */
    @Test
    fun anEnclaveBeatsTheCityItSitsInside() {
        val d = real() ?: return
        val hit = areaHit(drawnAreas(d), 42.3928, -83.0496)
        assertNotNull("nothing was found in Hamtramck", hit)
        assertEquals("city_hamtramck", hit!!.id)
    }

    // ---- the orders everything else is held to -----------------------------------------------------------------------

    /** An area sits behind everything a person came to the map to find, and ahead of a park. */
    @Test
    fun anAreaIsPickedAfterEverythingAPersonCameForAndBeforeAPark() {
        assertEquals(
            listOf("dot", "glyph", "stop", "greenway", "route", "area", "park"), MAP_PICK_ORDER,
        )
        assertTrue("an area must lose to a listing dot", MAP_PICK_ORDER.indexOf("dot") < MAP_PICK_ORDER.indexOf("area"))
        assertTrue("an area must lose to a greenway stretch", MAP_PICK_ORDER.indexOf("greenway") < MAP_PICK_ORDER.indexOf("area"))
        assertTrue("an area must beat a park", MAP_PICK_ORDER.indexOf("area") < MAP_PICK_ORDER.indexOf("park"))
        assertEquals("the keyboard walks the other way", listOf("segment", "area", "dot"), MAP_WALK_ORDER)
    }
}
