// The Map tab's first open (Locate.kt and MapCamera.forRadius). The same table of cases as
// apps/web/test/locate.test.ts and apps/ios/Tests/HelpCoreTests/LocateTests.swift: if one of the three ever
// answers differently, one of the three is wrong.
//
// Runs under `:core` on a plain JDK — no Android SDK, no emulator.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class LocateDecisionTest {

    /** The table. Every client runs these exact rows. */
    private val cases = listOf(
        Case("a first open, nothing known: our own card, and no dialog yet", false, LocatePermission.PROMPT, false, FirstOpenAction.SHOW_CARD),
        Case("a state we do not recognise is still a first open", false, LocatePermission.UNKNOWN, false, FirstOpenAction.SHOW_CARD),
        Case("the card has been answered: never again on this phone", true, LocatePermission.PROMPT, false, FirstOpenAction.NONE),
        Case("permission already given on Home: no card, straight to the person", false, LocatePermission.GRANTED, false, FirstOpenAction.CENTRE_ON_PERSON),
        Case("permission given and the card long since answered: the same", true, LocatePermission.GRANTED, false, FirstOpenAction.CENTRE_ON_PERSON),
        Case("already refused: a card whose button cannot work is a dead end", false, LocatePermission.DENIED, false, FirstOpenAction.NONE),
        Case("a typed ZIP wins over everything: they already said where to look", false, LocatePermission.PROMPT, true, FirstOpenAction.CENTRE_ON_ZIP),
        Case("a typed ZIP wins even when permission was given", true, LocatePermission.GRANTED, true, FirstOpenAction.CENTRE_ON_ZIP),
        Case("a typed ZIP wins even when permission was refused", true, LocatePermission.DENIED, true, FirstOpenAction.CENTRE_ON_ZIP),
    )

    data class Case(
        val why: String,
        val answered: Boolean,
        val permission: LocatePermission,
        val zip: Boolean,
        val want: FirstOpenAction,
    )

    @Test
    fun `what the Map tab does when it opens`() {
        for (c in cases) assertEquals(c.why, c.want, firstOpenAction(c.answered, c.permission, c.zip))
    }

    @Test
    fun `the card is shown exactly once`() {
        assertEquals(FirstOpenAction.SHOW_CARD, firstOpenAction(false, LocatePermission.PROMPT, false))
        // Answering it is the whole of what stops it coming back.
        assertEquals(FirstOpenAction.NONE, firstOpenAction(true, LocatePermission.PROMPT, false))
    }
}

class ServiceBoxTest {

    @Test
    fun `knows the four cities`() {
        assertTrue(inServiceArea(LatLon(42.3487, -83.0567)))   // downtown Detroit
        assertTrue(inServiceArea(LatLon(42.3934, -83.0497)))   // Hamtramck City Hall
        assertTrue(inServiceArea(LatLon(42.4055, -83.0968)))   // Highland Park City Hall
        assertTrue(inServiceArea(LatLon(42.3224, -83.1763)))   // Dearborn
        assertFalse(inServiceArea(LatLon(41.8781, -87.6298)))  // Chicago
    }

    @Test
    fun `is the same box the other two clients use`() {
        assertEquals(42.25, ServiceBox.LAT_MIN, 0.0)
        assertEquals(42.46, ServiceBox.LAT_MAX, 0.0)
        assertEquals(-83.33, ServiceBox.LON_MIN, 0.0)
        assertEquals(-82.91, ServiceBox.LON_MAX, 0.0)
        assertTrue(inServiceArea(42.25, -83.33))
        assertTrue(inServiceArea(42.46, -82.91))
        for (p in listOf(42.2499 to -83.0, 42.4601 to -83.0, 42.35 to -83.3301, 42.35 to -82.9099)) {
            assertFalse("$p is outside the four cities", inServiceArea(p.first, p.second))
        }
    }

    @Test
    fun `a fix that is not a number is not inside anything`() {
        assertFalse(inServiceArea(Double.NaN, -83.05))
        assertFalse(inServiceArea(42.35, Double.POSITIVE_INFINITY))
    }
}

class LocateCameraTest {

    private val here = LatLon(42.3487, -83.0567)
    private fun metresAcrossShortSide(c: MapCamera): Double =
        min(c.width, c.height) * MapProjection.METERS_PER_UNIT / c.scale

    @Test
    fun `two miles in every direction`() {
        assertEquals(3218.688, LOCATE_RADIUS_METERS, 0.001)     // two miles, in metres
        val cam = MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 390.0, 780.0)
        assertEquals(6437.376, metresAcrossShortSide(cam), 1.0)
    }

    @Test
    fun `the shorter side in landscape too`() {
        val portrait = MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 390.0, 780.0)
        val landscape = MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 780.0, 390.0)
        assertEquals(portrait.scale, landscape.scale, 1e-6)
        assertEquals(6437.376, metresAcrossShortSide(landscape), 1.0)
    }

    @Test
    fun `puts the middle on the person`() {
        val cam = MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 390.0, 780.0)
        assertEquals(MapProjection.pointX(here), cam.centerX, 1e-9)
        assertEquals(MapProjection.pointY(here), cam.centerY, 1e-9)
    }

    @Test
    fun `never zooms past the map's own limits`() {
        assertEquals(MapCamera.MAX_SCALE, MapCamera.forRadius(here, 1.0, 390.0, 780.0).scale, 1e-6)
        assertEquals(MapCamera.MIN_SCALE, MapCamera.forRadius(here, 5_000_000.0, 390.0, 780.0).scale, 1e-6)
        assertEquals(MapCamera.MAX_SCALE, MapCamera.forRadius(here, 0.0, 390.0, 780.0).scale, 1e-6)
    }

    @Test
    fun `a box with no size yet does not produce a camera with no scale`() {
        val cam = MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 0.0, 0.0)
        assertTrue(cam.scale.isFinite())
        assertTrue(cam.scale >= MapCamera.MIN_SCALE)
        assertTrue(cam.width > 0)
    }

    @Test
    fun `a point on the edge of the city stays within the pan limits`() {
        for (p in listOf(42.25 to -83.33, 42.46 to -82.91, 42.25 to -82.91, 42.46 to -83.33)) {
            val cam = MapCamera.forRadius(LatLon(p.first, p.second), LOCATE_RADIUS_METERS, 390.0, 780.0)
            assertTrue(abs(cam.centerX) <= MapCamera.PAN_LIMIT_X + 1e-9)
            assertTrue(abs(cam.centerY) <= MapCamera.PAN_LIMIT_Y + 1e-9)
        }
    }

    @Test
    fun `the three clients agree on what two miles looks like`() {
        // The web test asserts the same number from the same inputs; this is the arithmetic written out, so a
        // change to either one has to be a deliberate change to both.
        val side = max(1.0, min(390.0, 780.0))
        val want = side * MapProjection.METERS_PER_UNIT / (LOCATE_RADIUS_METERS * 2)
        assertEquals(want, MapCamera.forRadius(here, LOCATE_RADIUS_METERS, 390.0, 780.0).scale, 1e-9)
    }
}

/**
 * The anchor view: what the Map tab opens at when nobody has said where they are (DECISIONS 2026-09-22). The same
 * numbers as apps/web/test/locate.test.ts and apps/ios/Tests/HelpCoreTests/LocateTests.swift.
 */
class AnchorViewTest {

    /** A 375 dp phone, and a laptop-sized box, as the three clients each measure them. */
    private val phoneW = 343.0
    private val phoneH = 384.0
    private val laptopW = 600.0
    private val laptopH = 640.0
    private fun metresAcrossShortSide(c: MapCamera): Double =
        min(c.width, c.height) * MapProjection.METERS_PER_UNIT / c.scale
    private fun metresPerDp(c: MapCamera): Double = MapProjection.METERS_PER_UNIT / c.scale

    @Test
    fun `the anchor is City Hall, nudged up Woodward, at two miles`() {
        // Detroit City Hall (Coleman A. Young Municipal Center) — the `detroit` service area's reference point,
        // which is still what the app SAYS in words.
        assertEquals(42.3293, CITY_HALL.lat, 1e-9)
        assertEquals(-83.0452, CITY_HALL.lon, 1e-9)
        // The view opens 0.6 mile up Woodward from it (Grand Circus Park), because a two-mile box centred on City
        // Hall itself spends a third of its height on Windsor (DECISIONS 2026-09-22).
        assertEquals(42.3366, MAP_ANCHOR.lat, 1e-9)
        assertEquals(-83.0514, MAP_ANCHOR.lon, 1e-9)
        assertTrue(inServiceArea(MAP_ANCHOR))
        // The pinned number really is the nudge it claims to be: north of City Hall, west of it, and 0.6 mile away.
        assertTrue("the anchor is north of City Hall", MAP_ANCHOR.lat > CITY_HALL.lat)
        assertTrue("and west of it", MAP_ANCHOR.lon < CITY_HALL.lon)
        val miles = kotlin.math.hypot(
            (MAP_ANCHOR.lat - CITY_HALL.lat) * 69.0,
            (MAP_ANCHOR.lon - CITY_HALL.lon) * 69.0 * MapProjection.K,
        )
        assertEquals(ANCHOR_NUDGE_MILES, miles, 0.02)
        // **One radius people can learn**: the anchor view and the you-are-here view are the same two miles.
        assertEquals(3218.688, ANCHOR_RADIUS_METERS, 0.001)
        assertEquals(LOCATE_RADIUS_METERS, ANCHOR_RADIUS_METERS, 0.0)
    }

    /**
     * The three ways in are one decision: a location, then a junction a person typed, then the anchor — and the
     * card's three buttons all mark it answered while only one of them asks the system for anything.
     */
    @Test
    fun `the card's three answers`() {
        val yes = locateCardClick(LocateCardAnswer.YES)
        assertTrue("\"Use my location\" asks", yes.ask)
        assertTrue("and remembers, so the card does not come back", yes.remember)
        assertTrue("it does not close the card itself; the fix or the refusal does", !yes.close)

        val cross = locateCardClick(LocateCardAnswer.CROSS)
        assertTrue("\"Type a cross street\" asks the system for nothing at all", !cross.ask)
        assertTrue("it opens the field", cross.openCrossStreet)
        assertTrue("closes the card", cross.close)
        assertTrue("and is an answer, so the card is not shown again", cross.remember)

        val no = locateCardClick(LocateCardAnswer.NO)
        assertTrue(!no.ask)
        assertTrue(!no.openCrossStreet)
        assertTrue(no.close)
        assertTrue(no.remember)
    }

    /**
     * **We listen for five minutes and say so after ten seconds.** Giving up at ten was the app being honest about
     * its own patience and wrong about a phone with no network (Kyle, 2026-09-22).
     */
    @Test
    fun `the ask runs for five minutes and speaks up after ten seconds`() {
        assertEquals(10_000L, LOCATE_SLOW_MS)
        assertEquals(300_000L, LOCATE_TIMEOUT_MS)
        assertTrue("the slow note must come long before we stop", LOCATE_SLOW_MS < LOCATE_TIMEOUT_MS)
    }

    @Test
    fun `with no location it is the anchor, and with one it is the two-mile view`() {
        val (centre, radius) = openingView(null)
        assertEquals(MAP_ANCHOR, centre)
        assertEquals(ANCHOR_RADIUS_METERS, radius, 1e-9)
        val here = LatLon(42.3487, -83.0567)
        val (known, knownRadius) = openingView(here)
        assertEquals(here, known)
        assertEquals(LOCATE_RADIUS_METERS, knownRadius, 1e-9)
    }

    @Test
    fun `four miles across the shorter side, portrait or landscape`() {
        val (centre, radius) = openingView(null)
        for (size in listOf(phoneW to phoneH, phoneH to phoneW, laptopW to laptopH)) {
            val cam = MapCamera.forRadius(centre, radius, size.first, size.second)
            // Two miles in every direction, which is the one radius the whole app opens on now.
            assertEquals(6437.376, metresAcrossShortSide(cam), 1.0)
        }
    }

    @Test
    fun `puts the middle on the anchor`() {
        val (centre, radius) = openingView(null)
        val cam = MapCamera.forRadius(centre, radius, phoneW, phoneH)
        assertEquals(MapProjection.pointX(MAP_ANCHOR), cam.centerX, 1e-9)
        assertEquals(MapProjection.pointY(MAP_ANCHOR), cam.centerY, 1e-9)
    }

    @Test
    fun `stays inside the zoom and pan limits`() {
        val (centre, radius) = openingView(null)
        for (size in listOf(phoneW to phoneH, laptopW to laptopH, 0.0 to 0.0)) {
            val cam = MapCamera.forRadius(centre, radius, size.first, size.second)
            assertTrue(cam.scale.isFinite())
            assertTrue(cam.scale >= MapCamera.MIN_SCALE)
            assertTrue(cam.scale <= MapCamera.MAX_SCALE)
            assertTrue(abs(cam.centerX) <= MapCamera.PAN_LIMIT_X + 1e-9)
            assertTrue(abs(cam.centerY) <= MapCamera.PAN_LIMIT_Y + 1e-9)
        }
    }

    /**
     * docs/MAP-STYLE.md section 5: mid is 12 < mpp <= 30, where the street classes and their names are drawn. The
     * four-city fit it replaces sat in `far`, above 30, where every street is a hairline.
     */
    @Test
    fun `opens in the mid band, where streets are drawn and named`() {
        val (centre, radius) = openingView(null)
        val onPhone = MapCamera.forRadius(centre, radius, phoneW, phoneH)
        val onLaptop = MapCamera.forRadius(centre, radius, laptopW, laptopH)
        assertTrue(metresPerDp(onPhone) <= 30)
        assertTrue(metresPerDp(onLaptop) <= 15)
        assertEquals(ZoomBand.MID, zoomBand(metresPerDp(onPhone)))
    }

    /** The whole four-city region is still what the reset button shows, and it is much further out than this. */
    @Test
    fun `the region fit is still there and is further out`() {
        val (centre, radius) = openingView(null)
        val anchor = MapCamera.forRadius(centre, radius, phoneW, phoneH)
        val region = MapCamera.fitting(
            listOf(LatLon(42.255, -83.29), LatLon(42.45, -82.91)), phoneW, phoneH, cover = true,
        )
        assertTrue(metresPerDp(region) > 2 * metresPerDp(anchor))
    }
}

class LocateFlagStoreTest {

    private fun tempDir(): File {
        val d = File(System.getProperty("java.io.tmpdir"), "locate-" + System.nanoTime())
        d.mkdirs()
        return d
    }

    @Test
    fun `starts unanswered`() {
        val d = tempDir()
        try { assertFalse(LocateFlagStore(d).answered) } finally { d.deleteRecursively() }
    }

    @Test
    fun `remembers that it was answered across launches`() {
        val d = tempDir()
        try {
            val first = LocateFlagStore(d)
            assertTrue(first.markAnswered())
            assertTrue(first.answered)
            assertTrue("a new launch reads the same file", LocateFlagStore(d).answered)
        } finally {
            d.deleteRecursively()
        }
    }

    @Test
    fun `forgetting brings the card back`() {
        val d = tempDir()
        try {
            val store = LocateFlagStore(d)
            store.markAnswered()
            store.forget()
            assertFalse(LocateFlagStore(d).answered)
        } finally {
            d.deleteRecursively()
        }
    }

    @Test
    fun `a file of rubbish reads as unanswered`() {
        val d = tempDir()
        try {
            File(d, "map-locate.json").writeText("not json at all")
            assertFalse(LocateFlagStore(d).answered)
        } finally {
            d.deleteRecursively()
        }
    }

    @Test
    fun `holds nothing but the flag`() {
        val d = tempDir()
        try {
            LocateFlagStore(d).markAnswered()
            val text = File(d, "map-locate.json").readText()
            // One key. There is nowhere in this file for a coordinate to be, which is the point of it being
            // this small.
            assertEquals("{\"answered\":true}", text)
            for (forbidden in listOf("lat", "lon", "42.", "-83.")) {
                assertFalse("the flag file must never carry $forbidden", text.contains(forbidden))
            }
        } finally {
            d.deleteRecursively()
        }
    }

    @Test
    fun `the write is atomic and leaves no half file behind`() {
        val d = tempDir()
        try {
            LocateFlagStore(d).markAnswered()
            assertFalse(File(d, "map-locate.json.new").exists())
            assertEquals(listOf("map-locate.json"), d.list()!!.sorted())
        } finally {
            d.deleteRecursively()
        }
    }
}
