// The map, held to the same arithmetic as the iPhone app's (apps/ios/Sources/HelpCore/MapData.swift,
// MapLayers.swift) and the web app's (apps/web/src/map.ts), and to the one rule that must never be got wrong:
// a listing that is never a dot.
//
// **This file is a case-for-case port of apps/ios/Tests/HelpCoreTests/MapTests.swift**, in the same order, under the
// same names. Everything here is plain numbers, so `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs all of it on a
// plain JDK with no Android SDK anywhere.
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon
import org.help313.query.Segment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import kotlin.math.min
import kotlin.math.sqrt

/**
 * `Segment` is read out of the bundle, so a test stretch is written as the JSON the bundle carries and decoded the
 * same way the app decodes it — exactly as `testSegment` does in the Swift tests.
 */
private fun testSegment(
    id: String,
    name: String = id,
    phase: String = "open",
    lines: List<List<List<Double>>>,
): Segment {
    val geometry = lines.joinToString(",", "[", "]") { line ->
        line.joinToString(",", "[", "]") { p -> "[" + p.joinToString(",") + "]" }
    }
    val json = """{"id":"$id","name":"$name","phase":"$phase","lines":$geometry}"""
    return Segment.fromJson(Json.parse(json))
}

private val repoRoot = File("../../..")

// ---- MapProjectionTests ------------------------------------------------------------------------------------------

class MapProjectionTest {

    @Test
    fun aPointProjectsAndComesBack() {
        val p = LatLon(42.3314, -83.0458)                       // Campus Martius
        assertEquals(p.lat, MapProjection.lat(MapProjection.pointY(p)), 1e-9)
        assertEquals(p.lon, MapProjection.lon(MapProjection.pointX(p)), 1e-9)
    }

    @Test
    fun northIsUpAndEastIsRight() {
        assertTrue(MapProjection.y(42.45) < MapProjection.y(42.26))   // further north, smaller y
        assertTrue(MapProjection.x(-83.3) < MapProjection.x(-82.95))
    }

    /** One degree of latitude is one unit; a degree of longitude is shorter this far north, by the cosine. */
    @Test
    fun aUnitIsADegreeOfLatitude() {
        assertEquals(1.0, MapProjection.y(41.35) - MapProjection.y(42.35), 1e-12)
        assertEquals(MapProjection.K, MapProjection.x(-82.1) - MapProjection.x(-83.1), 1e-12)
        assertTrue(MapProjection.K < 1)
    }

    @Test
    fun aBoxIsTheRectangleAroundThePoints() {
        val b = MapBox.around(doubleArrayOf(0.0, 0.0, 2.0, -1.0, -3.0, 4.0))
        assertEquals(-3.0, b.minX, 0.0); assertEquals(2.0, b.maxX, 0.0)
        assertEquals(-1.0, b.minY, 0.0); assertEquals(4.0, b.maxY, 0.0)
        assertTrue(b.intersects(MapBox(1.0, 1.0, 9.0, 9.0)))
        assertFalse(b.intersects(MapBox(9.0, 9.0, 10.0, 10.0)))
        assertTrue(b.contains(0.0, 0.0))
        assertFalse(b.contains(5.0, 0.0))
        assertTrue(MapBox.EMPTY.isEmpty)
        assertEquals(b, MapBox.EMPTY.union(b))
    }
}

// ---- MapFileTests ------------------------------------------------------------------------------------------------

class MapFileTest {

    /**
     * The bundle writes a line as a first point and then deltas, in hundred-thousandths of a degree from the file's
     * own origin. Same decoding as `decodeLine` in apps/web/src/map.ts.
     */
    @Test
    fun aPolylineIsDeltasFromTheFilesOrigin() {
        val pts = MapFileDecoder.polyline(intArrayOf(100_000, 200_000, -50_000, 0), doubleArrayOf(-83.2, 42.3))
        assertEquals(4, pts.size)
        assertEquals(-82.2, MapProjection.lon(pts[0]), 1e-9)
        assertEquals(44.3, MapProjection.lat(pts[1]), 1e-9)
        assertEquals(-82.7, MapProjection.lon(pts[2]), 1e-9)
        assertEquals(44.3, MapProjection.lat(pts[3]), 1e-9)
    }

    @Test
    fun anOddOrEmptyRunDecodesToNothingRatherThanCrashing() {
        assertEquals(0, MapFileDecoder.polyline(intArrayOf(), doubleArrayOf(-83.2, 42.3)).size)
        assertEquals(0, MapFileDecoder.polyline(intArrayOf(5), doubleArrayOf(-83.2, 42.3)).size)
        assertEquals(0, MapFileDecoder.polyline(intArrayOf(5, 5), doubleArrayOf()).size)
    }

    private val baseJson = """
        {"source":{"last_edited":{"roads":"2025-09-30"}},"origin":[-83.2,42.3],
         "names":["Gratiot Ave"],"roads":[[0,-1,[0,0,1000,0]],[3,0,[0,0,0,1000]]],
         "park_names":["Palmer Park"],"parks":[[0,[0,0,500,0,0,500,-500,0]],[-1,[0,0,100,0,0,100]]],
         "boundary":[[0,0,2000,0,0,2000,-2000,0]]}
    """.trimIndent().toByteArray(Charsets.UTF_8)

    @Test
    fun theBaseFileBecomesRoadsParksAndOutlines() {
        val m = MapFileDecoder.baseMap(baseJson, null)
        assertEquals("2025-09-30", m.edited)
        assertEquals(2, m.roads.size)
        assertEquals(0, m.roads[0].cls)
        assertEquals("a name index of -1 means the road has no name", "", m.roads[0].name)
        assertEquals("Gratiot Ave", m.roads[1].name)
        assertEquals(listOf("Palmer Park", ""), m.parks.map { it.name })
        assertEquals(1, m.boundary.size)
        assertEquals("no streets file: the map still draws, without the small streets", 0, m.cells.size)
        assertFalse(m.roads[0].box.isEmpty)
    }

    @Test
    fun theStreetsFileAddsOneCellPerSquare() {
        val streets = """
            {"grid":{},"cells":{"c_0_1":{"origin":[-83.2,42.3],"names":["Elm St"],"roads":[[4,0,[0,0,100,0]]]},
                                "c_0_0":{"origin":[-83.2,42.3],"names":[],"roads":[[4,-1,[0,0,0,100]]]}}}
        """.trimIndent().toByteArray(Charsets.UTF_8)
        val m = MapFileDecoder.baseMap(baseJson, streets)
        assertEquals(2, m.cells.size)
        // Sorted by key, so the same bundle always draws in the same order.
        assertEquals("", m.cells[0].roads[0].name)
        assertEquals("Elm St", m.cells[1].roads[0].name)
        assertFalse(m.cells[1].box.isEmpty)
    }

    @Test
    fun aTransportLayerCarriesLinesAndStops() {
        val json = """
            {"id":"ddot_routes","kind":"both","origin":[-83.2,42.3],"names":["Route 4","Gratiot & 7 Mile"],
             "lines":[[0,[0,0,1000,1000]]],"points":[[1,2000,3000],[-1,4000,5000]]}
        """.trimIndent().toByteArray(Charsets.UTF_8)
        val l = MapFileDecoder.layer(json)
        assertEquals(1, l.lines.size)
        assertEquals("Route 4", l.lines[0].name)
        assertEquals(listOf("Gratiot & 7 Mile", ""), l.points.map { it.name })
        assertEquals(42.33, MapProjection.lat(l.points[0].y), 1e-9)
    }

    @Test
    fun aGreenwayStretchProjectsToDrawableLines() {
        val seg = testSegment("seg_x", name = "Bagley", lines = listOf(listOf(listOf(-83.076, 42.326), listOf(-83.074, 42.327))))
        val lines = MapFileDecoder.segmentLines(seg)
        assertEquals(1, lines.size)
        assertEquals(4, lines[0].size)
        assertEquals(-83.076, MapProjection.lon(lines[0][0]), 1e-9)
    }

    /**
     * The real files in the repository, so a change to the pipeline's encoding is caught here rather than on a phone.
     * Skipped when the bundle has not been built (`pnpm build:bundle`).
     */
    @Test
    fun theShippedBundleDecodes() {
        val dir = File(repoRoot, "data/bundle/v1/map")
        val baseFile = File(dir, "base.json")
        assumeTrue("data/bundle/v1 has not been built here", baseFile.isFile)
        val streets = File(dir, "streets.json").takeIf { it.isFile }?.readBytes()
        val m = MapFileDecoder.baseMap(baseFile.readBytes(), streets)
        assertTrue(m.roads.size > 100)
        assertTrue(m.parks.size > 100)
        assertTrue(m.boundary.isNotEmpty())
        assertEquals("the road layer's edit date is a plain YYYY-MM-DD", 10, m.edited.length)
        // Everything is inside the bbox CLAUDE.md gives for the service area, with a little room at the edges.
        var all = MapBox.EMPTY
        for (r in m.roads) all = all.union(r.box)
        assertTrue(MapProjection.lat(all.maxY) > 42.1)
        assertTrue(MapProjection.lat(all.minY) < 42.6)
        assertTrue(MapProjection.lon(all.minX) > -83.6)
        assertTrue(MapProjection.lon(all.maxX) < -82.7)
        // The small streets are what makes the file big; a cell with nothing in it would be a decoding bug.
        assertTrue(m.cells.size > 10)
        assertTrue(m.cells.all { it.roads.isNotEmpty() })

        val layer = File(dir, "transit/qline.json")
        if (layer.isFile) {
            val l = MapFileDecoder.layer(layer.readBytes())
            assertTrue(l.points.size > 5)
            assertTrue(l.points.all { it.name.isNotEmpty() })
        }
    }

    /**
     * Every transport layer the bundle actually ships, decoded, and every one of them named in the switcher: an
     * unnamed layer is one a person can switch on and not be told what it is. (Not in the Swift tests; this is the
     * Android side of `mapLayerName`, which falls back to the bundle's own English name.)
     */
    @Test
    fun everyShippedTransportLayerDecodesAndHasAStyle() {
        val manifest = File(repoRoot, "data/bundle/v1/places/transit.json")
        assumeTrue("data/bundle/v1 has not been built here", manifest.isFile)
        val layers = Json.parse(manifest.readBytes())["layers"]?.arr ?: emptyList()
        assertTrue(layers.size >= 11)
        for (entry in layers) {
            val id = entry["id"]?.str ?: ""
            val file = File(repoRoot, "data/bundle/v1/" + (entry["file"]?.str ?: ""))
            assertTrue("no file for $id", file.isFile)
            val data = MapFileDecoder.layer(file.readBytes())
            assertEquals("$id lines", entry["lines"]?.int ?: 0, data.lines.size)
            assertEquals("$id points", entry["points"]?.int ?: 0, data.points.size)
            assertTrue("$id has no style of its own", mapLayerStyles.containsKey("go:$id"))
        }
    }
}

// ---- MapCameraTests --------------------------------------------------------------------------------------------

class MapCameraTest {

    private fun camera(): MapCamera = MapCamera.fitting(
        listOf(LatLon(42.25, -83.33), LatLon(42.46, -82.91)),
        width = 390.0, height = 700.0, cover = true,
    )

    @Test
    fun fittingPutsTheCityInTheMiddle() {
        val c = camera()
        assertEquals(42.355, MapProjection.lat(c.centerY), 0.01)
        assertEquals(-83.12, MapProjection.lon(c.centerX), 0.01)
        assertTrue(c.scale > 0)
    }

    @Test
    fun coverFillsTheBoxAndFitShowsAllOfIt() {
        val pts = listOf(LatLon(42.25, -83.33), LatLon(42.46, -82.91))
        val cover = MapCamera.fitting(pts, 390.0, 700.0, cover = true)
        val fit = MapCamera.fitting(pts, 390.0, 700.0, cover = false)
        assertTrue("cover is always the closer of the two", cover.scale > fit.scale)
    }

    @Test
    fun aPointOnTheScreenAndBack() {
        val c = camera()
        val x = MapProjection.x(-83.05)
        val y = MapProjection.y(42.33)
        assertEquals(x, c.mapX(c.screenX(x)), 1e-9)
        assertEquals(y, c.mapY(c.screenY(y)), 1e-9)
        assertEquals(195.0, c.screenX(c.centerX), 1e-9)
        assertEquals(350.0, c.screenY(c.centerY), 1e-9)
    }

    @Test
    fun zoomingKeepsWhatIsUnderTheFingersUnderTheFingers() {
        val c = camera()
        val beforeX = c.mapX(120.0)
        val beforeY = c.mapY(500.0)
        val z = c.zoomed(1.8, 120.0, 500.0)
        assertEquals(beforeX, z.mapX(120.0), 1e-9)
        assertEquals(beforeY, z.mapY(500.0), 1e-9)
        assertEquals(c.scale * 1.8, z.scale, 1e-6)
    }

    @Test
    fun zoomStopsAtTheSameTwoLimitsAsTheWebMap() {
        var c = camera()
        repeat(40) { c = c.zoomed(2.0) }
        assertEquals(MapCamera.MAX_SCALE, c.scale, 1e-6)
        assertEquals(0.6, c.metersPerPoint, 1e-6)
        repeat(80) { c = c.zoomed(0.5) }
        assertEquals(MapCamera.MIN_SCALE, c.scale, 1e-6)
        assertEquals(90.0, c.metersPerPoint, 1e-6)
    }

    @Test
    fun panningFollowsTheFingerAndCannotLoseTheCity() {
        val c = camera()
        val right = c.panned(50.0, 0.0)
        assertTrue("dragging right moves the view west", right.centerX < c.centerX)
        var far = c
        repeat(200) { far = far.panned(-400.0, -400.0) }
        assertEquals(MapCamera.PAN_LIMIT_X, far.centerX, 1e-12)
        assertEquals(MapCamera.PAN_LIMIT_Y, far.centerY, 1e-12)
    }

    @Test
    fun aFingersWidthBecomesADistanceOnTheMap() {
        val c = camera()
        assertEquals(22.0, c.mapDistance(22.0) * c.scale, 1e-9)
        assertTrue(c.mapDistance(22.0) > 0)
    }

    /**
     * A pinch is two things at once. Not in the Swift tests: the iPhone's `MagnifyGesture` reports a span and a
     * start location and nothing about the hand sliding, so the Android map is the first of the three to pan and
     * zoom in one step (Kyle, 2026-09-21: "pinch to zoom and other common gestures").
     */
    @Test
    fun aPinchPansAndZoomsAtOnceAndKeepsThePointBetweenTheFingers() {
        val c = camera()
        // Two fingers that slide without spreading move the map exactly as one finger would. (To the last bit but
        // one: a factor of exactly 1 still goes through the zoom arithmetic, which is two more roundings.)
        val slid = c.pinched(30.0, -20.0, 1.0, 200.0, 300.0)
        assertEquals(c.panned(30.0, -20.0).centerX, slid.centerX, 1e-15)
        assertEquals(c.panned(30.0, -20.0).centerY, slid.centerY, 1e-15)
        assertEquals(c.scale, slid.scale, 1e-12)
        // Two fingers that spread without sliding are a plain zoom about the point between them.
        val spread = c.pinched(0.0, 0.0, 1.4, 200.0, 300.0)
        assertEquals(c.zoomed(1.4, 200.0, 300.0).centerX, spread.centerX, 1e-15)
        assertEquals(c.zoomed(1.4, 200.0, 300.0).centerY, spread.centerY, 1e-15)
        // Both at once: whatever the hand is over at the end of the step is what it was over at the start of it.
        val moved = c.panned(25.0, 15.0)
        val wasX = moved.mapX(200.0)
        val wasY = moved.mapY(300.0)
        val after = c.pinched(25.0, 15.0, 1.6, 200.0, 300.0)
        assertEquals(wasX, after.mapX(200.0), 1e-9)
        assertEquals(wasY, after.mapY(300.0), 1e-9)
        assertEquals(c.scale * 1.6, after.scale, 1e-6)
    }

    /** A zoom spread over an animation still multiplies to exactly the zoom that was asked for. */
    @Test
    fun anAnimatedZoomAddsUpToTheZoomThatWasAskedFor() {
        var product = 1.0
        var at = 0.0
        for (step in 1..12) {
            val to = step / 12.0
            product *= mapZoomStep(1.8, at, to)
            at = to
        }
        assertEquals(1.8, product, 1e-9)
        // A step that goes nowhere, or backwards, changes nothing.
        assertEquals(1.0, mapZoomStep(1.8, 0.5, 0.5), 0.0)
        assertEquals(1.0, mapZoomStep(1.8, 0.5, 0.2), 0.0)
        // And the point under the finger is still under it after the whole run, because every step is a `zoomed`
        // about the same place.
        var c = camera()
        val wasX = c.mapX(120.0)
        at = 0.0
        for (step in 1..12) {
            val to = step / 12.0
            c = c.zoomed(mapZoomStep(1.8, at, to), 120.0, 500.0)
            at = to
        }
        assertEquals(wasX, c.mapX(120.0), 1e-9)
    }

    @Test
    fun theVisibleBoxIsWhatTheScreenShows() {
        val c = camera()
        val v = c.visible
        assertEquals(c.centerX, v.centerX, 1e-12)
        assertEquals(c.width, v.width * c.scale, 1e-9)
        assertEquals(c.height, v.height * c.scale, 1e-9)
    }
}

// ---- a flick that carries on -----------------------------------------------------------------------------------

/**
 * Not in the Swift tests: a flick with momentum is an Android gesture the iPhone's map does not have (Kyle,
 * 2026-09-21). The thing worth holding to a test is not how it feels but that it **stops**: in a finite time,
 * having travelled a finite distance, and never past the edge of the city.
 */
class MapFlingTest {

    @Test
    fun aFlickStopsInAFiniteTimeHavingTravelledAFiniteDistance() {
        val f = MapFling(1200.0, -900.0, deceleration = 3000.0)
        val speed = sqrt(1200.0 * 1200.0 + 900.0 * 900.0)
        assertEquals(speed / 3000.0, f.duration, 1e-9)
        assertEquals(speed * speed / 6000.0, f.distance, 1e-6)
        assertTrue(f.isDone(f.duration))
        assertFalse(f.isDone(f.duration / 2))
        // It never goes further than its own total, however long it is asked about.
        val endX = f.offsetX(f.duration)
        assertEquals(endX, f.offsetX(f.duration * 10), 1e-9)
        assertEquals(f.distance, sqrt(endX * endX + f.offsetY(f.duration) * f.offsetY(f.duration)), 1e-6)
    }

    @Test
    fun aFlickOnlyEverMovesForwardAndSlowsDown() {
        val f = MapFling(1000.0, 0.0)
        var last = 0.0
        var lastStep = Double.MAX_VALUE
        for (i in 1..40) {
            val at = f.offsetX(f.duration * i / 40.0)
            val step = at - last
            assertTrue("a flick never goes backwards", step >= -1e-9)
            assertTrue("a flick never speeds up", step <= lastStep + 1e-9)
            lastStep = step
            last = at
        }
    }

    @Test
    fun aFlickWithNoSpeedInItIsNotAFlick() {
        val f = MapFling(0.0, 0.0)
        assertEquals(0.0, f.duration, 0.0)
        assertEquals(0.0, f.distance, 0.0)
        assertTrue(f.isDone(0.0))
        assertEquals(0.0, f.offsetX(1.0), 0.0)
    }

    /**
     * The one that matters: a flick is clamped by the camera and nothing else. There is no second set of bounds
     * here that could disagree with `MapCamera.panned`, so a hard flick west ends at the pan limit and stays there.
     */
    @Test
    fun aFlickCannotCarryTheMapOutOfTheCity() {
        var c = MapCamera.fitting(listOf(LatLon(42.25, -83.33), LatLon(42.46, -82.91)), 390.0, 700.0, cover = true)
        val f = MapFling(-9000.0, -9000.0)
        var was = 0.0
        var stuckFor = 0
        var steps = 0
        while (!f.isDone(was) && steps < 10_000) {
            val at = min(f.duration, was + 1 / 60.0)
            val before = c
            c = c.panned(f.offsetX(at) - f.offsetX(was), f.offsetY(at) - f.offsetY(was))
            if (c == before) stuckFor++ else stuckFor = 0
            was = at
            steps++
        }
        assertEquals(MapCamera.PAN_LIMIT_X, c.centerX, 1e-12)
        assertEquals(MapCamera.PAN_LIMIT_Y, c.centerY, 1e-12)
        assertTrue("the view stops moving long before the flick runs out, which is how the screen knows to stop", stuckFor > 1)
    }
}

// ---- MapHitTests -----------------------------------------------------------------------------------------------

class MapHitTest {

    @Test
    fun distanceToAPieceOfLine() {
        assertEquals(1.0, MapHit.distanceToSegment(0.0, 1.0, -1.0, 0.0, 1.0, 0.0), 1e-12)
        // Past the end of the piece: the distance is to the end, not to the infinite line.
        assertEquals(2.0, MapHit.distanceToSegment(3.0, 0.0, -1.0, 0.0, 1.0, 0.0), 1e-12)
        assertEquals(sqrt(2.0), MapHit.distanceToSegment(0.0, 0.0, 1.0, 1.0, 1.0, 1.0), 1e-12)
    }

    @Test
    fun distanceToAWholeLine() {
        val line = doubleArrayOf(0.0, 0.0, 10.0, 0.0, 10.0, 10.0)
        assertEquals(2.0, MapHit.distanceToPolyline(5.0, 2.0, line), 1e-12)
        assertEquals(2.0, MapHit.distanceToPolyline(12.0, 5.0, line), 1e-12)
        assertEquals(
            "a one-point line is that point",
            5.0, MapHit.distanceToPolyline(0.0, 0.0, doubleArrayOf(3.0, 4.0)), 1e-12,
        )
        assertEquals(Double.POSITIVE_INFINITY, MapHit.distanceToPolyline(0.0, 0.0, DoubleArray(0)), 0.0)
    }

    /**
     * The real thing this is for: a finger 22 dp wide lands on a greenway stretch it is near, and not on one a block
     * away. The tolerance is in dp and is turned into map units by the camera.
     */
    @Test
    fun aFingerNearAStretchSelectsItAndAFingerAwayDoesNot() {
        val c = MapCamera.fitting(listOf(LatLon(42.32, -83.08), LatLon(42.34, -83.06)), 390.0, 700.0)
        val seg = testSegment("seg_x", name = "Bagley", lines = listOf(listOf(listOf(-83.076, 42.326), listOf(-83.074, 42.3268))))
        val line = MapFileDecoder.segmentLines(seg)[0]
        val tol = c.mapDistance(22.0)
        val onItX = MapProjection.x(-83.075)
        val onItY = MapProjection.y(42.3264)
        assertTrue(MapHit.distanceToPolyline(onItX, onItY, line) < tol)
        val awayY = MapProjection.y(42.3330)
        assertTrue(MapHit.distanceToPolyline(onItX, awayY, line) > tol)
    }

    @Test
    fun insideAPark() {
        val square = doubleArrayOf(0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0)
        assertTrue(MapHit.inside(2.0, 2.0, square))
        assertFalse(MapHit.inside(5.0, 2.0, square))
        assertFalse(MapHit.inside(-1.0, -1.0, square))
        assertFalse("two points are not a shape", MapHit.inside(0.0, 0.0, doubleArrayOf(0.0, 0.0, 1.0, 1.0)))
    }
}

// ---- MapLayerRuleTests -----------------------------------------------------------------------------------------

class MapLayerRuleTest {

    private class Row(val category: String, val lat: Double?)

    private fun drawable(rows: List<Row>, tops: List<String>): List<String> =
        mapDrawable(rows, tops, { it.category }, { it.lat != null }).map { it.category }

    /**
     * The rule the whole tab hangs on. Treatment and help after sexual assault are never drawn, whatever is switched
     * on; a DV shelter and a mental-health crisis line are dropped row by row inside their own group.
     */
    @Test
    fun theListingsThatAreNeverADot() {
        val rows = listOf(
            Row("food.pantry", 42.3),
            Row("shelter.emergency", 42.3),
            Row("shelter.dv", 42.3),
            Row("shelter.dv.transitional", 42.3),
            Row("health.clinic", 42.3),
            Row("health.mental", 42.3),
            Row("health.mental.crisis", 42.3),
            Row("treatment.detox", 42.3),
            Row("treatment", 42.3),
            Row("assault", 42.3),
            Row("assault.advocacy", 42.3),
            Row("harm.supplies", 42.3),
            Row("food.meal", null),
        )
        val everything = mapGroups.flatMap { it.tops }
        assertEquals(
            "a private kind, a sensitive row, or a row with no point must never be drawn",
            listOf("food.pantry", "harm.supplies", "health.clinic", "shelter.emergency"),
            drawable(rows, everything).sorted(),
        )
    }

    /**
     * A domestic-violence shelter publishes no address, and must never be on the map even if a coordinate turns up
     * on the row anyway — from a bad merge, a future source, or a steward's mistake. The predicate refuses it on the
     * category, never on whether a point happens to be there, and the whole tab (dots, the tap test, the virtual
     * accessibility nodes and the map's own list) goes through this one function.
     */
    @Test
    fun aDomesticViolenceRowIsNeverDrawnEvenWithACoordinate() {
        val rows = listOf(
            Row("shelter.dv", 42.33),
            Row("shelter.dv.transitional", 42.33),
            Row("health.mental", 42.33),
            Row("shelter.emergency", 42.33),
        )
        assertEquals(listOf("shelter.emergency"), drawable(rows, listOf("shelter", "health")))
        assertTrue(isSensitive("shelter.dv"))
        assertFalse(Saved.canSave("shelter.dv"))
    }

    @Test
    fun onlySwitchedOnGroupsAreDrawn() {
        val rows = listOf(Row("food.pantry", 42.3), Row("jobs.find", 42.3))
        assertEquals(listOf("food.pantry"), drawable(rows, listOf("food")))
        assertEquals(emptyList<String>(), drawable(rows, emptyList()))
    }

    @Test
    fun everyTopLevelCategoryBelongsToExactlyOneGroup() {
        val seen = HashMap<String, Int>()
        for (g in mapGroups) for (t in g.tops) seen[t] = (seen[t] ?: 0) + 1
        assertTrue("a category in two groups would draw twice: $seen", seen.values.all { it == 1 })
        for (t in mapPrivateTops) assertEquals("$t must not be in any layer at all", null, seen[t])
        assertEquals("health", mapGroupId("harm.supplies"))
        // Category audit, 2026-09-22: the same eight groups as the web, and nothing surprising in any of them.
        assertEquals(listOf("food", "shelter", "health", "rec", "work", "kids", "things", "paperwork"), mapGroups.map { it.id })
        assertEquals("rec", mapGroupId("connect"))
        assertEquals("kids", mapGroupId("youth"))
        assertEquals("kids", mapGroupId("kids.care"))
        assertEquals(listOf("goods", "hygiene", "pets"), mapGroups.first { it.id == "things" }.tops)
        assertEquals("", mapGroupId("nothing.like.this"))
    }

    @Test
    fun denseStopLayersWaitForTheZoom() {
        assertEquals(
            "five thousand stops are a smear, not places",
            0.0, mapStopRadius(dense = true, metersPerPoint = 30.0), 0.0,
        )
        assertTrue(mapStopRadius(dense = true, metersPerPoint = 8.0) > 0)
        assertTrue("twenty stations always draw", mapStopRadius(dense = false, metersPerPoint = 30.0) > 0)
        assertTrue(mapLayerStyle("go:ddot_stops").dense)
        assertFalse(mapLayerStyle("go:qline").dense)
        assertEquals("coaches are not a bus network", listOf(5.0, 3.0), mapLayerStyle("go:intercity_bus").dash)
        assertNotEquals(mapLayerStyle("go:ddot_routes").color, mapLayerStyle("go:intercity_bus").color)
    }

    @Test
    fun streetsAppearAsYouZoomIn() {
        assertEquals("far out: main roads only", 2, mapStreetClassLimit(40.0))
        assertEquals(4, mapStreetClassLimit(5.0))
        assertEquals(0, mapStreetLabelLimit(40.0))
        assertEquals(4, mapStreetLabelLimit(3.0))
        assertTrue(mapStreetWidth(0, 5.0) > mapStreetWidth(4, 5.0))
    }

    @Test
    fun theGreenwayIsDrawnLeastBuiltFirstAndEveryPhaseHasItsOwnDash() {
        assertEquals("an open stretch is never hidden under a dotted one", "open", greenwayPhaseOrder.last())
        assertTrue(greenwayPhaseStyle("open").dash.isEmpty())
        val dashes = greenwayPhaseOrder.map { greenwayPhaseStyle(it).dash }
        assertEquals(
            "phases must differ by dash, not only by colour (Differentiate Without Color)",
            greenwayPhaseOrder.size, dashes.map { it.toString() }.toSet().size,
        )
        assertEquals(greenwayPhaseOrder.size, greenwayPhaseOrder.map { greenwayPhaseStyle(it).color }.toSet().size)
        assertTrue(greenwayShowsStations(8.0))
        assertFalse(greenwayShowsStations(40.0))
        assertTrue(greenwayWidth(2.0) > greenwayWidth(40.0))
    }

    @Test
    fun aStretchIsReadSouthToNorth() {
        fun seg(id: String, lat: Double) =
            testSegment(id, lines = listOf(listOf(listOf(-83.1, lat), listOf(-83.1, lat + 0.01))))
        val order = greenwaySegmentsInReadingOrder(listOf(seg("north", 42.42), seg("south", 42.28), seg("middle", 42.35)))
        assertEquals(listOf("south", "middle", "north"), order.map { it.id })
        // Two stretches that start at the same latitude keep a settled order between launches.
        val tie = greenwaySegmentsInReadingOrder(listOf(seg("b", 42.3), seg("a", 42.3)))
        assertEquals(listOf("a", "b"), tie.map { it.id })
    }

    @Test
    fun placesAreReadNearestFirst() {
        class P(val name: String, val x: Double, val y: Double)
        val list = listOf(P("far", 10.0, 0.0), P("near", 1.0, 0.0), P("middle", 4.0, 0.0))
        val order = placesInReadingOrder(list, 0.0, 0.0, { it.x }, { it.y }, { it.name })
        assertEquals(listOf("near", "middle", "far"), order.map { it.name })
    }

    /**
     * Not in the Swift tests: the style parameter docs/MAP-STYLE.md asks every client to take. `standard` is today's
     * drawing and the default. Asked for in `subway`, this table still answers with the standard drawing — it is what
     * a layer falls back to while its network file is coming or when that file failed — and the subway drawing itself
     * is `resolveTransitStyle` (MapStyleTest.kt).
     */
    @Test
    fun theLayerTableIsTheStandardDrawingInBothStyles() {
        assertEquals(MapStyle.STANDARD, mapStyleOf(null))
        assertEquals(MapStyle.STANDARD, mapStyleOf("standard"))
        assertEquals(MapStyle.STANDARD, mapStyleOf("something else"))
        assertEquals(MapStyle.SUBWAY, mapStyleOf("subway"))
        for (id in mapLayerStyles.keys) {
            assertEquals(id, mapLayerStyle(id, MapStyle.STANDARD), mapLayerStyle(id, MapStyle.SUBWAY))
        }
    }
}

// ---- MapLayerStoreTests ----------------------------------------------------------------------------------------

class MapLayerStoreTest {

    private fun tempDir(): File {
        val d = File(System.getProperty("java.io.tmpdir"), "maplayers-" + java.util.UUID.randomUUID())
        d.mkdirs()
        d.deleteOnExit()
        return d
    }

    /**
     * **A first open shows help** (audit H2; DECISIONS 2026-09-22). The tab used to open as a street map with a
     * green line on it and not one place that helps, so a person who tapped Map to find food had to open the
     * switcher before the tab did anything the app is for.
     */
    @Test
    fun aFirstOpenShowsEveryHelpLayerAndTheParks() {
        val store = MapLayerStore(tempDir())
        assertEquals(defaultMapLayers, store.on)
        assertEquals("all eight help groups, the parks and the boundaries", 10, store.on.size)
        for (g in mapGroups) assertTrue("${g.id} is not on at a first open", store.isOn("help:${g.id}"))
        assertTrue(store.isOn("place:parks"))
        // **The boundaries are on** (docs/MAP-STYLE.md section 15; Kyle, 2026-09-22: "The user needs to be able to
        // see the boundaries of the neighborhoods on the map"). They used to be off, on the reasoning that they
        // were the Areas tab's job; the Map tab is where a person looks at the city.
        assertTrue("the boundaries are not on at a first open", store.isOn(AREAS_LAYER))
        // Off: the greenway is one path inside a 302-park system, and a bus route line over eight kinds of dot is
        // the busiest thing on the screen.
        assertFalse("the greenway comes off the default", store.isOn("place:greenway"))
        assertFalse("and the bus routes", store.isOn("go:ddot_routes"))
        assertFalse(store.isOn("go:ddot_stops"))
    }

    @Test
    fun theChoiceIsRememberedOnThisPhoneAndNowhereElse() {
        val dir = tempDir()
        val first = MapLayerStore(dir)
        assertTrue(first.toggle("place:greenway"))
        assertTrue(first.toggle("place:parks"))
        val again = MapLayerStore(dir)
        assertTrue("a remembered choice still wins over the defaults", again.isOn("place:greenway"))
        assertFalse(again.isOn("place:parks"))
        assertTrue(
            "the choice is a file in the app's own private storage, never SharedPreferences",
            File(dir, "map-layers.json").exists(),
        )
        // Written atomically: the temporary file is renamed over the old one and never left behind.
        assertFalse(File(dir, "map-layers.json.new").exists())
    }

    @Test
    fun aPhoneCanNeverAskForAnUnboundedNumberOfFiles() {
        val store = MapLayerStore(tempDir())
        store.set((0 until 100).map { "go:layer$it" })
        assertEquals(30, store.on.size)
        for (i in 0 until 60) store.toggle("help:g$i")
        assertTrue(store.on.size <= 30)
    }

    /** A file somebody else wrote, or a half-written one, is a first open — never a crash and never a raw key. */
    @Test
    fun anUnreadableChoiceFileReadsAsAFirstOpen() {
        val dir = tempDir()
        File(dir, "map-layers.json").writeText("{ not json at all")
        assertEquals(defaultMapLayers, MapLayerStore(dir).on)
    }
}

// ---- the language choice ---------------------------------------------------------------------------------------

class LanguageTest {

    private val carried = listOf("en", "es", "ar", "bn")

    /** The person's own order decides, not ours: Urdu, then Arabic, then English gets Arabic. */
    @Test
    fun theFirstLanguageWeCarryWins() {
        assertEquals("ar", pickLanguage(listOf("ur", "ar", "en"), carried))
        assertEquals("en", pickLanguage(listOf("fr"), carried))
        assertEquals("es", pickLanguage(listOf("es", "en"), carried))
        assertEquals("bn", pickLanguage(listOf("bn"), carried))
    }

    @Test
    fun anEmptyOrUnknownListIsEnglish() {
        assertEquals("en", pickLanguage(emptyList(), carried))
        assertEquals("en", pickLanguage(listOf("ur", "zh", "pt"), carried))
    }

    /** A language whose words did not load is a language this app cannot speak, whatever the build intended. */
    @Test
    fun aLanguageWithNoWordsLoadedIsSkipped() {
        assertEquals("en", pickLanguage(listOf("ar", "en"), carried) { it != "ar" })
        assertEquals("es", pickLanguage(listOf("ar", "es", "en"), carried) { it != "ar" })
    }
}
