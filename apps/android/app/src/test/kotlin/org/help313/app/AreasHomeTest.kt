// The Areas tab as a map (Kyle, 2026-09-22): the camera that frames one outline, the landing decision, and the
// strip an area page wears and collapses as it is read.
//
// **Every case here is ported from apps/web/test/areas-map.test.ts, case for case.** The two pure pieces the web
// names as the ones the ports re-implement — `cameraForArea` (map.ts) and `areasLanding` / `stripAt` (areas.ts) —
// are what this file drives. If the three clients ever disagree about where the Areas tab opens, one of them is
// wrong, and this is where Android finds out.
//
// Plain JVM: no android.* class is touched, so `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs all of it.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class AreasHomeTest {

    /** One unit of the world is one degree of latitude; MIN_SCALE is 90 m per dp, which is what pins it. */
    private val metresPerUnit = MapCamera.MIN_SCALE * 90
    private fun mpp(scale: Double) = metresPerUnit / scale

    /** A rectangle of `w` by `h` degrees with its south-west corner at (lat, lon), as one ring. */
    private fun box(lat: Double, lon: Double, h: Double, w: Double): List<List<LatLon>> = listOf(
        listOf(
            LatLon(lat, lon), LatLon(lat, lon + w), LatLon(lat + h, lon + w), LatLon(lat + h, lon), LatLon(lat, lon),
        ),
    )

    private fun wx(lon: Double) = MapProjection.x(lon)
    private fun wy(lat: Double) = MapProjection.y(lat)

    private val phoneW = 390.0
    private val phoneH = 640.0
    private val laptopW = 760.0
    private val laptopH = 620.0

    // ---- cameraForArea: fit the outline, leave 8 %, never open closer than 4 m per dp ------------------------

    @Test
    fun itFitsTheWholeOutlineWithAMarginOfEightPercentOnEverySide() {
        // A neighbourhood about 2.2 km tall and 1.6 km wide, on a tall phone: WIDTH is the tighter axis here, so
        // the outline plus its margin is exactly as wide as the box and there is room to spare above and below.
        val cam = MapCamera.forArea(box(42.33, -83.09, 0.02, 0.02), phoneW, phoneH)!!
        val spanX = abs((wx(-83.07) - wx(-83.09)) * cam.scale)
        val spanY = abs((wy(42.33) - wy(42.35)) * cam.scale)
        assertEquals(phoneW / (1 + MapCamera.AREA_FIT_MARGIN * 2), spanX, 1e-6)
        assertTrue("the outline is taller than the box", spanY < phoneH)
        // And it is centred on the outline's own middle.
        assertEquals(wx(-83.08), cam.centerX, 1e-9)
        assertEquals(wy(42.34), cam.centerY, 1e-9)
    }

    @Test
    fun eightPercentIsTheMarginNotZeroAndNotAGuess() {
        assertEquals(0.08, MapCamera.AREA_FIT_MARGIN, 0.0)
        val cam = MapCamera.forArea(box(42.33, -83.09, 0.02, 0.02), phoneW, phoneH)!!
        val used = abs((wx(-83.07) - wx(-83.09)) * cam.scale)
        val want = phoneW * (2 * MapCamera.AREA_FIT_MARGIN) / (1 + 2 * MapCamera.AREA_FIT_MARGIN)
        assertEquals(want, phoneW - used, 1e-6)
    }

    @Test
    fun portraitAndLandscapeAreDecidedByTheBoxItIsHanded() {
        val rings = box(42.33, -83.09, 0.02, 0.02)
        val tall = MapCamera.forArea(rings, 390.0, 640.0)!!
        val wide = MapCamera.forArea(rings, 640.0, 390.0)!!
        // Same middle, different scale: the shorter side is what has to hold the outline.
        assertEquals(tall.centerX, wide.centerX, 1e-9)
        assertTrue("landscape got closer than portrait", mpp(wide.scale) > mpp(tall.scale))
        // Whichever way round, the WHOLE outline is on screen — the smaller fit, never `cover`.
        for ((cam, size) in listOf(tall to (390.0 to 640.0), wide to (640.0 to 390.0))) {
            assertTrue(abs((wy(42.33) - wy(42.35)) * cam.scale) <= size.second + 1e-9)
            assertTrue(abs((wx(-83.07) - wx(-83.09)) * cam.scale) <= size.first + 1e-9)
        }
    }

    @Test
    fun aTinyNeighbourhoodIsNotOpenedOnSixHouses() {
        // About 110 m across — smaller than the smallest of the City's 205, and the clamp still holds.
        val cam = MapCamera.forArea(box(42.34, -83.08, 0.001, 0.001), phoneW, phoneH)!!
        assertEquals(MapCamera.AREA_MIN_MPP, mpp(cam.scale), 1e-9)
        assertEquals(4.0, MapCamera.AREA_MIN_MPP, 0.0)
        assertTrue(cam.scale <= MapCamera.MAX_SCALE)
    }

    @Test
    fun aWholeCityIsNotOpenedWiderThanTheCameraHasEverAllowed() {
        // Detroit is about 0.2° tall and 0.4° wide; on a phone that is well past the map's own far limit.
        val cam = MapCamera.forArea(box(42.255, -83.288, 0.195, 0.377), phoneW, phoneH)!!
        assertEquals(90.0, mpp(cam.scale), 1e-6)
        assertEquals(MapCamera.MIN_SCALE, cam.scale, 1e-9)
        // A laptop's wider box gets closer, and is still inside the limits.
        val big = MapCamera.forArea(box(42.255, -83.288, 0.195, 0.377), laptopW, laptopH)!!
        assertTrue(mpp(big.scale) < 90.0)
        assertTrue(big.scale >= MapCamera.MIN_SCALE)
    }

    @Test
    fun anAreaWithNoOutlineMovesNothingAtAll() {
        assertNull(MapCamera.forArea(emptyList(), phoneW, phoneH))
        assertNull(MapCamera.forArea(listOf(emptyList()), phoneW, phoneH))
    }

    @Test
    fun aDegenerateOutlineIsACameraNotADivisionByZero() {
        val cam = MapCamera.forArea(listOf(listOf(LatLon(42.34, -83.08))), phoneW, phoneH)
        assertNotNull(cam)
        assertTrue(cam!!.scale.isFinite())
        assertEquals(MapCamera.AREA_MIN_MPP, mpp(cam.scale), 1e-9)
    }

    // ---- the landing decision table -------------------------------------------------------------------------

    @Test
    fun theLandingDecisionIsTheWebsTable() {
        // located, area, outside -> the landing, with the web's own reason for each row.
        val cases = listOf(
            Triple(false, false, false) to AreasLanding.ASK,      // nobody has said where they are
            Triple(true, true, false) to AreasLanding.AREA,       // a position allowed this session, in a neighbourhood
            Triple(true, true, false) to AreasLanding.AREA,       // a typed cross street or ZIP, the same answer
            Triple(false, false, true) to AreasLanding.OUTSIDE,   // a fix from beyond the four cities
            Triple(true, false, false) to AreasLanding.OUTSIDE,   // inside the box, but no outline holds it
            Triple(true, true, true) to AreasLanding.OUTSIDE,     // outside wins even over a remembered area
        )
        for ((o, want) in cases) {
            assertEquals("located=${o.first} area=${o.second} outside=${o.third}", want, areasLanding(o.first, o.second, o.third))
        }
        // There is no fourth answer, and none of the three is "show a list instead".
        assertEquals(setOf(AreasLanding.ASK, AreasLanding.AREA, AreasLanding.OUTSIDE), cases.map { it.second }.toSet())
    }

    // ---- the collapsing strip ---------------------------------------------------------------------------------

    private fun walk(ys: List<Int>): List<StripScroll> {
        val out = ArrayList<StripScroll>()
        var at = stripStart()
        for (y in ys) {
            at = stripAt(at, y)
            out.add(at)
        }
        return out
    }

    @Test
    fun atTheTopOfThePageTheMapIsAlwaysWhole() {
        assertEquals(StripState.OPEN, stripStart().state)
        assertEquals(StripState.OPEN, stripAt(StripScroll(StripState.SHUT, 900, 0), 0).state)
        // An over-scroll past the top is still the top.
        assertEquals(StripState.OPEN, stripAt(StripScroll(StripState.SHUT, 900, 0), -40).state)
    }

    @Test
    fun readingDownShutsItAndTurningRoundOpensItAgainNotOnlyAtTheTop() {
        val down = walk(listOf(0, 40, 200, 600))
        assertEquals(StripState.SHUT, down.last().state)
        // Now up a little, still 500 dp down the page: the map comes back.
        val up = stripAt(stripAt(down.last(), 560), 520)
        assertEquals(StripState.OPEN, up.state)
        assertEquals(520, up.y)
    }

    @Test
    fun aWobbleAtTheEndOfAFlickDoesNotFlapIt() {
        assertEquals(8, AREAS_TURN_PX)
        val shut = walk(listOf(0, 40, 400)).last()
        assertEquals(StripState.SHUT, shut.state)
        assertEquals("4 dp back is not a turn", StripState.SHUT, stripAt(shut, 396).state)
        assertEquals("10 dp back is", StripState.OPEN, stripAt(stripAt(shut, 396), 390).state)
    }

    @Test
    fun theMachineAnswersWithAStateAndNothingElse() {
        val next = stripAt(StripScroll(StripState.OPEN, 100, 0), 300)
        assertEquals("what it was told, not something it decided", 300, next.y)
        assertEquals(StripState.SHUT, next.state)
    }

    @Test
    fun thePageRearrangingItselfAfterACollapseIsNotAPersonTurningRound() {
        assertEquals(AREAS_SHRINK_MS + 80, AREAS_SETTLE_MS)
        assertTrue(stripSettling(1000, 1000))
        assertTrue(stripSettling(1000, 1000L + AREAS_SETTLE_MS - 1))
        assertTrue(!stripSettling(1000, 1000L + AREAS_SETTLE_MS))
    }

    @Test
    fun theNumbersThePortsNeedAreNamed() {
        assertEquals(38, AREAS_STRIP_VH)
        assertEquals(48, AREAS_BAR_PX)
        assertEquals(240, AREAS_SHRINK_MS)
        // The state machine has no notion of motion at all, so it behaves identically with animations off.
        assertEquals(StripState.SHUT, stripAt(stripStart(), 400).state)
    }
}
