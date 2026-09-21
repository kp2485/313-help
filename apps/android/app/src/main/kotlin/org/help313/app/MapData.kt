// The app's own street map, in numbers only: no android.* class anywhere in this file, so `:core` compiles it and
// `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs all of it on a plain JDK. MapView.kt does nothing but paint what
// is worked out here.
//
// 313 Help draws its own map (DECISIONS 2026-09-18, "The app draws its own street map from City of Detroit open
// data"). No tile server is ever contacted, no map company learns where a person is looking, and the map works with
// no signal at all: the streets, parks, city outlines and transport layers are files inside the **signed** bundle,
// checked against the signed index before a byte of them is decoded (BundleStore.mapSource).
//
// This is a port, line for line, of apps/ios/Sources/HelpCore/MapData.swift, which is itself a port of
// apps/web/src/map.ts: the same flat projection, the same delta encoding, the same zoom clamps, the same hit
// tolerances. MapTest.kt is the Kotlin copy of apps/ios/Tests/HelpCoreTests/MapTests.swift, case for case, so the
// three apps cannot drift.
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon
import org.help313.query.Segment
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// ---- where a point on the earth is on the map ------------------------------------------------------------------

/**
 * A flat projection around Detroit: one unit is one degree of latitude, longitudes squeezed by the cosine of
 * Detroit's latitude. Good to a few metres across a city, and it costs nothing to compute on a cheap phone.
 */
object MapProjection {
    const val LON0 = -83.1
    const val LAT0 = 42.35
    val K: Double = cos(LAT0 * PI / 180.0)

    /** Metres in one unit (one degree of latitude). */
    const val METERS_PER_UNIT = 111_320.0

    fun x(lon: Double): Double = (lon - LON0) * K
    fun y(lat: Double): Double = LAT0 - lat
    fun lon(x: Double): Double = x / K + LON0
    fun lat(y: Double): Double = LAT0 - y
    fun pointX(p: LatLon): Double = x(p.lon)
    fun pointY(p: LatLon): Double = y(p.lat)
}

/**
 * A rectangle in map units. Everything drawn is clipped against one of these first, because a phone should not walk
 * a polyline it cannot see.
 */
data class MapBox(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double) {

    val isEmpty: Boolean get() = minX > maxX || minY > maxY
    val width: Double get() = maxX - minX
    val height: Double get() = maxY - minY
    val centerX: Double get() = (minX + maxX) / 2
    val centerY: Double get() = (minY + maxY) / 2

    fun intersects(o: MapBox): Boolean = minX <= o.maxX && maxX >= o.minX && minY <= o.maxY && maxY >= o.minY

    fun contains(x: Double, y: Double): Boolean = x >= minX && x <= maxX && y >= minY && y <= maxY

    fun union(o: MapBox): MapBox =
        MapBox(min(minX, o.minX), min(minY, o.minY), max(maxX, o.maxX), max(maxY, o.maxY))

    fun expanded(by: Double): MapBox = MapBox(minX - by, minY - by, maxX + by, maxY + by)

    companion object {
        /** The box that loses to every other box in [union], and touches nothing. */
        val EMPTY = MapBox(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY)

        /** The box around a flat run of x, y pairs. */
        fun around(pts: DoubleArray): MapBox {
            var a = Double.POSITIVE_INFINITY
            var b = Double.POSITIVE_INFINITY
            var c = Double.NEGATIVE_INFINITY
            var d = Double.NEGATIVE_INFINITY
            var i = 0
            while (i + 1 < pts.size) {
                a = min(a, pts[i]); c = max(c, pts[i])
                b = min(b, pts[i + 1]); d = max(d, pts[i + 1])
                i += 2
            }
            return MapBox(a, b, c, d)
        }

        fun aroundPoints(points: List<LatLon>): MapBox {
            var b = EMPTY
            for (p in points) {
                val x = MapProjection.x(p.lon)
                val y = MapProjection.y(p.lat)
                b = MapBox(min(b.minX, x), min(b.minY, y), max(b.maxX, x), max(b.maxY, y))
            }
            return b
        }
    }
}

// ---- what the map is made of -----------------------------------------------------------------------------------

/**
 * One drawn line: a street, a bus route, a bike lane. [points] is a flat run of x, y pairs in map units.
 * [cls] is the road class the City publishes: 0 is a freeway, 4 a residential street.
 */
class MapLine(val cls: Int, val name: String, val points: DoubleArray) {
    val box: MapBox = MapBox.around(points)
}

/** A closed shape: a park, or one ring of the city outline. */
class MapArea(val name: String, val points: DoubleArray) {
    val box: MapBox = MapBox.around(points)
}

/**
 * One square of the street grid. The small streets are split into squares so that a zoomed-in map walks a few
 * hundred lines rather than forty thousand.
 */
class MapCell(val box: MapBox, val roads: List<MapLine>)

/** A stop, a station, a dock: one named point on a switched-on layer. */
class MapPoint(val name: String, val x: Double, val y: Double)

/** Everything `map/base.json` and `map/streets.json` carry, decoded once and kept in memory while the tab is open. */
class BaseMap(
    /** The big roads, at every zoom. */
    val roads: List<MapLine>,
    /** The small streets, by square. */
    val cells: List<MapCell>,
    val parks: List<MapArea>,
    /** The four cities' outlines, one flat x, y run per ring. */
    val boundary: List<DoubleArray>,
    /** The day the City last edited the road layer. Shown under the map; never frozen at build time. */
    val edited: String,
)

/** One switched-on transport layer's shapes (`map/transit/…`). */
class MapLayerData(val lines: List<MapLine>, val points: List<MapPoint>)

// ---- reading the files -----------------------------------------------------------------------------------------

/**
 * The JSON the `map` folder carries, and how a run of deltas becomes a polyline. Every one of these files travels in the
 * signed bundle and is checked against the signed index's checksum before it reaches this code.
 *
 * The files hold arrays rather than objects, to keep the bundle small: `[cls, nameIndex, deltas]`,
 * `[nameIndex, deltas]`, `[nameIndex, x, y]`. A name index of -1 means "this one has no name".
 */
object MapFileDecoder {

    /** `[x0, y0, dx1, dy1, …]` in hundred-thousandths of a degree from `origin`, to a flat run of map x, y pairs. */
    fun polyline(enc: IntArray, origin: DoubleArray): DoubleArray {
        if (origin.size < 2) return DoubleArray(0)
        val out = DoubleArray(enc.size - (enc.size and 1))
        var x = 0
        var y = 0
        var i = 0
        var w = 0
        while (i + 1 < enc.size) {
            x += enc[i]; y += enc[i + 1]
            out[w] = MapProjection.x(origin[0] + x / 1e5)
            out[w + 1] = MapProjection.y(origin[1] + y / 1e5)
            i += 2; w += 2
        }
        return out
    }

    private fun name(i: Int, names: List<String>): String = if (i < 0 || i >= names.size) "" else names[i]

    private fun ints(j: Json?): IntArray {
        val items = j?.arr ?: return IntArray(0)
        val out = IntArray(items.size)
        for (i in items.indices) out[i] = items[i].int ?: 0
        return out
    }

    private fun origin(j: Json?): DoubleArray {
        val items = j?.arr ?: return DoubleArray(0)
        val out = DoubleArray(items.size)
        for (i in items.indices) out[i] = items[i].num ?: 0.0
        return out
    }

    /** `[[cls, nameIndex, deltas], …]` with the file's own names and origin. */
    private fun roads(j: Json): List<MapLine> {
        val names = j.strings("names")
        val o = origin(j["origin"])
        return (j["roads"]?.arr ?: emptyList()).map { r ->
            val a = r.arr
            MapLine(
                cls = a.getOrNull(0)?.int ?: 4,
                name = name(a.getOrNull(1)?.int ?: -1, names),
                points = polyline(ints(a.getOrNull(2)), o),
            )
        }
    }

    /**
     * The city: big roads, the small streets by square, parks, outlines. Slow enough (a third of a megabyte of JSON)
     * that it is always decoded off the main thread.
     *
     * `streets` may be null or unreadable: the map then draws the big roads only, which is still a map.
     */
    fun baseMap(base: ByteArray, streets: ByteArray?): BaseMap {
        val b = Json.parse(base)
        val o = origin(b["origin"])
        val parkNames = b.strings("park_names")
        val cells = ArrayList<MapCell>()
        if (streets != null) {
            val s = try { Json.parse(streets) } catch (_: Throwable) { null }
            val byKey = s?.get("cells")?.obj ?: emptyMap()
            // Sorted by key, so the same bundle always draws in the same order and a screenshot can be compared.
            for (key in byKey.keys.sorted()) {
                val lines = roads(byKey.getValue(key))
                var box = MapBox.EMPTY
                for (l in lines) box = box.union(l.box)
                cells.add(MapCell(box, lines))
            }
        }
        return BaseMap(
            roads = roads(b),
            cells = cells,
            parks = (b["parks"]?.arr ?: emptyList()).map { p ->
                val a = p.arr
                MapArea(name(a.getOrNull(0)?.int ?: -1, parkNames), polyline(ints(a.getOrNull(1)), o))
            },
            boundary = (b["boundary"]?.arr ?: emptyList()).map { polyline(ints(it), o) },
            edited = b["source"]?.get("last_edited")?.get("roads")?.str ?: "",
        )
    }

    /** One transport layer (`map/transit/ddot_routes.json` and the rest). */
    fun layer(data: ByteArray): MapLayerData {
        val f = Json.parse(data)
        val names = f.strings("names")
        val o = origin(f["origin"])
        val lines = (f["lines"]?.arr ?: emptyList()).map { l ->
            val a = l.arr
            MapLine(1, name(a.getOrNull(0)?.int ?: -1, names), polyline(ints(a.getOrNull(1)), o))
        }
        val points = (f["points"]?.arr ?: emptyList()).mapNotNull { p ->
            val a = p.arr
            if (a.size < 3 || o.size < 2) {
                null
            } else {
                MapPoint(
                    name = name(a[0].int ?: -1, names),
                    x = MapProjection.x(o[0] + (a[1].int ?: 0) / 1e5),
                    y = MapProjection.y(o[1] + (a[2].int ?: 0) / 1e5),
                )
            }
        }
        return MapLayerData(lines, points)
    }

    /** A greenway stretch's polylines of [lon, lat], projected once so that drawing and tapping never re-project. */
    fun segmentLines(segment: Segment): List<DoubleArray> = segment.lines.map { line ->
        val out = DoubleArray(line.size * 2)
        var w = 0
        for (p in line) {
            if (p.size < 2) continue
            out[w] = MapProjection.x(p[0])
            out[w + 1] = MapProjection.y(p[1])
            w += 2
        }
        if (w == out.size) out else out.copyOf(w)
    }
}

// ---- the camera ------------------------------------------------------------------------------------------------

/**
 * What part of the map the screen is showing. Everything is in density-independent pixels, never device pixels:
 * [scale] is dp per map unit, so [metersPerPoint] is what decides which streets and which stops are worth drawing.
 */
data class MapCamera(
    val centerX: Double,
    val centerY: Double,
    val scale: Double,
    val width: Double,
    val height: Double,
) {

    val metersPerPoint: Double get() = MapProjection.METERS_PER_UNIT / scale

    fun screenX(x: Double): Double = (x - centerX) * scale + width / 2
    fun screenY(y: Double): Double = (y - centerY) * scale + height / 2
    fun mapX(sx: Double): Double = centerX + (sx - width / 2) / scale
    fun mapY(sy: Double): Double = centerY + (sy - height / 2) / scale

    /** A distance on the screen, in map units: how a 48 dp finger becomes a tolerance the geometry understands. */
    fun mapDistance(points: Double): Double = points / scale

    val visible: MapBox
        get() = MapBox(
            centerX - width / 2 / scale, centerY - height / 2 / scale,
            centerX + width / 2 / scale, centerY + height / 2 / scale,
        )

    /** Zoom about a point on the screen, so what is under the fingers stays under the fingers. */
    fun zoomed(factor: Double, aroundX: Double, aroundY: Double): MapCamera {
        val s = max(MIN_SCALE, min(MAX_SCALE, scale * factor))
        val bigX = centerX + (aroundX - width / 2) / scale
        val bigY = centerY + (aroundY - height / 2) / scale
        return copy(
            centerX = bigX - (aroundX - width / 2) / s,
            centerY = bigY - (aroundY - height / 2) / s,
            scale = s,
        ).clamped()
    }

    fun zoomed(factor: Double): MapCamera = zoomed(factor, width / 2, height / 2)

    /** Drag: the map follows the finger, which is the opposite sign to the centre moving. */
    fun panned(dx: Double, dy: Double): MapCamera =
        copy(centerX = centerX - dx / scale, centerY = centerY - dy / scale).clamped()

    /**
     * One step of a pinch: the two fingers moved the middle of the gesture by [dx], [dy] **and** changed the span
     * by [factor]. Both at once, in that order, because that is what the fingers did — panning after zooming would
     * move the map by the wrong distance, since the scale it is divided by has already changed.
     *
     * The pan is applied first and the zoom is then taken about where the fingers now are, so the point the middle
     * of the pinch is over stays under it however the hand moves. Two fingers that slide across the screen without
     * changing their span pan the map exactly as one finger would.
     */
    fun pinched(dx: Double, dy: Double, factor: Double, aroundX: Double, aroundY: Double): MapCamera =
        panned(dx, dy).zoomed(factor, aroundX, aroundY)

    fun clamped(): MapCamera = copy(
        centerX = max(-PAN_LIMIT_X, min(PAN_LIMIT_X, centerX)),
        centerY = max(-PAN_LIMIT_Y, min(PAN_LIMIT_Y, centerY)),
        scale = max(MIN_SCALE, min(MAX_SCALE, scale)),
    )

    fun resized(width: Double, height: Double): MapCamera = copy(width = width, height = height)

    companion object {
        /**
         * 90 m per dp zoomed out (the whole city on a phone), 0.6 m per dp zoomed in (one doorway). The same two
         * limits the web map and the iPhone app use, so no two of the three can be zoomed somewhere the others
         * cannot follow.
         */
        val MIN_SCALE = MapProjection.METERS_PER_UNIT / 90
        val MAX_SCALE = MapProjection.METERS_PER_UNIT / 0.6

        /** Detroit and its neighbours sit well inside this; it stops a flung finger from losing the city entirely. */
        const val PAN_LIMIT_X = 0.25
        const val PAN_LIMIT_Y = 0.2

        /**
         * The opening view: at least these points on the screen, never closer than [minMeters] across. [cover] fills
         * the box instead of fitting inside it — the wide city on a tall phone, as on the web's Map tab.
         */
        fun fitting(
            points: List<LatLon>,
            width: Double,
            height: Double,
            minMeters: Double = 500.0,
            cover: Boolean = false,
        ): MapCamera {
            if (width <= 0 || height <= 0 || points.isEmpty()) {
                return MapCamera(0.0, 0.0, MIN_SCALE, max(width, 1.0), max(height, 1.0)).clamped()
            }
            val box = MapBox.aroundPoints(points)
            val least = minMeters / MapProjection.METERS_PER_UNIT
            val spanX = max(box.width, least) * 1.18
            val spanY = max(box.height, least) * 1.18
            val fit = if (cover) max(width / spanX, height / spanY) else min(width / spanX, height / spanY)
            return MapCamera(box.centerX, box.centerY, fit, width, height).clamped()
        }

        /**
         * A camera that shows [radiusMeters] in every direction around [center]: the SHORTER side of the screen
         * spans the whole diameter, so the circle fits whichever way the phone is held (Map tab, first open,
         * 2026-09-21). Pure, and the same three lines as `cameraForRadius` in apps/web/src/map.ts and
         * `MapCamera.forRadius` in apps/ios/Sources/HelpCore/MapData.swift, so "two miles" is two miles on all
         * three.
         *
         * The result goes through [clamped] like every other camera, which is what stops a wrong — or a spoofed —
         * fix from throwing the map off Detroit.
         */
        fun forRadius(center: LatLon, radiusMeters: Double, width: Double, height: Double): MapCamera {
            val side = max(1.0, min(width, height))
            val across = max(1.0, radiusMeters * 2)
            return MapCamera(
                MapProjection.pointX(center),
                MapProjection.pointY(center),
                side * MapProjection.METERS_PER_UNIT / across,
                max(width, 1.0),
                max(height, 1.0),
            ).clamped()
        }
    }
}

// ---- what a finger leaves behind -------------------------------------------------------------------------------

/**
 * A flick that carries on after the finger leaves: constant deceleration in a straight line, in dp and seconds.
 * The whole of it is arithmetic, so the one thing that matters — that it stops, in a finite time, having travelled
 * a finite distance — is a test rather than a hope.
 *
 * `android.widget.OverScroller` would do the same job; this does not use it because the maths then could not be
 * run on a plain JDK, and because the camera's own clamp (MapCamera.panned) is what stops a flick at the edge of
 * the city, not a second set of bounds that could disagree with it.
 */
class MapFling(velocityX: Double, velocityY: Double, deceleration: Double = DEFAULT_DECELERATION) {

    private val speed = kotlin.math.hypot(velocityX, velocityY)
    private val decel = max(1.0, deceleration)
    private val ux = if (speed == 0.0) 0.0 else velocityX / speed
    private val uy = if (speed == 0.0) 0.0 else velocityY / speed

    /** How long it runs, in seconds. Zero for a flick with no speed in it. */
    val duration: Double = speed / decel

    /** The whole distance it will travel, in dp. */
    val distance: Double = speed * speed / (2 * decel)

    /** How far it has travelled by [t] seconds: x and y in dp, from where the finger left. */
    fun offsetX(t: Double): Double = ux * travelled(t)
    fun offsetY(t: Double): Double = uy * travelled(t)

    fun isDone(t: Double): Boolean = t >= duration

    private fun travelled(t: Double): Double {
        val s = max(0.0, min(duration, t))
        return speed * s - decel * s * s / 2
    }

    companion object {
        /** dp per second per second. A flick across a phone settles in about half a second, as the platform's own do. */
        const val DEFAULT_DECELERATION = 3500.0

        /** Below this, a flick is a tap with a shake in it and the map should simply stop. */
        const val MIN_SPEED = 80.0
    }
}

/**
 * How a zoom is spread over an animation: the factor for one step, so that the steps multiply to [total] over the
 * whole run. Geometric rather than linear, because zoom is multiplicative — and because every step is a
 * [MapCamera.zoomed] about the same point, which keeps that point under the finger the whole way.
 */
fun mapZoomStep(total: Double, fromProgress: Double, toProgress: Double): Double {
    val a = max(0.0, min(1.0, fromProgress))
    val b = max(0.0, min(1.0, toProgress))
    if (b <= a || total <= 0) return 1.0
    return Math.pow(total, b - a)
}

// ---- tapping ---------------------------------------------------------------------------------------------------

/**
 * Distances and insideness, all in map units. The screen converts a finger's 48 dp into a tolerance with
 * [MapCamera.mapDistance] and asks these; nothing here knows what a pixel is.
 */
object MapHit {

    /** Distance from a point to one piece of a line. */
    fun distanceToSegment(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
        val dx = bx - ax
        val dy = by - ay
        val len2 = dx * dx + dy * dy
        val t = if (len2 == 0.0) 0.0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
        val ox = px - ax - t * dx
        val oy = py - ay - t * dy
        return sqrt(ox * ox + oy * oy)
    }

    /** Distance from a point to a flat run of x, y pairs. A one-point "line" is just that point. */
    fun distanceToPolyline(px: Double, py: Double, pts: DoubleArray): Double {
        if (pts.size < 2) return Double.POSITIVE_INFINITY
        if (pts.size == 2) {
            val dx = px - pts[0]
            val dy = py - pts[1]
            return sqrt(dx * dx + dy * dy)
        }
        var best = Double.POSITIVE_INFINITY
        var i = 0
        while (i + 3 < pts.size) {
            best = min(best, distanceToSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]))
            i += 2
        }
        return best
    }

    /** Ray casting: is the point inside this ring? */
    fun inside(px: Double, py: Double, ring: DoubleArray): Boolean {
        val n = ring.size
        if (n < 6) return false
        var hit = false
        var i = 0
        var j = n - 2
        while (i < n - 1) {
            val xi = ring[i]
            val yi = ring[i + 1]
            val xj = ring[j]
            val yj = ring[j + 1]
            if ((yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) hit = !hit
            j = i
            i += 2
        }
        return hit
    }
}
