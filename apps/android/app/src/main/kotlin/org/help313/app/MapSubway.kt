// The `subway` map style, painted (docs/MAP-STYLE.md). Every decision about WHAT to draw — which colour a route
// wears, how wide, which side of a shared street, where a badge goes, which of them win — is a pure function in
// MapStyle.kt, tested on a plain JDK. This file turns those answers into `android.graphics.Path`s and nothing else.
// A port of apps/ios/HelpApp/MapSubway.swift.
//
// `standard` never comes here: MapView.draw calls into this file only when the style is `subway`, and only for a
// layer whose overlay says `subway` — which a network layer says only once its network file is held.
//
// Nothing here is live. No arrival times, no vehicles; the lines, stops and names are files in the signed bundle.
package org.help313.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/** Everything the subway passes need that is not the camera. Made by MapModel whenever something arrives or changes. */
class SubwayScene(
    /** The networks that are on (or selected) and held, by layer id ("ddot_routes"). */
    val nets: Map<String, PreparedNet>,
    /** `file:sha256` per held network: part of the path cache's key, so a new bundle never draws old paths. */
    val netKeys: Map<String, String>,
    val serves: Map<String, TransitServes>,
    val hubs: List<TransitHub>,
    val layersOn: List<String>,
    /** The chosen route: its network layer and its number in that file. */
    val selected: Pair<String, Int>?,
    /** The selected route's stops layer, held even when that layer is switched off. */
    val selectedStops: MapLayerData?,
)

/**
 * What a finger can land on, written by the painter and read by the tap: a person taps what they see. Memory only,
 * replaced every frame, and about the map — never about a person.
 */
class SubwayBoard {
    var glyphs: List<HitGlyph> = emptyList()
    var targets: Map<String, MapSelection> = emptyMap()

    /** The lines as drawn (shifted sideways where routes share a street), per network layer. */
    var lines: List<Triple<String, TransitNet, List<SubwayGeometry.BuiltLine>>> = emptyList()

    /** Where each route's placed badges are, in dp: the keyboard's ring goes round the nearest one. */
    var badgeSpots: Map<String, List<LabelRect>> = emptyMap()

    fun clear() {
        glyphs = emptyList(); targets = emptyMap(); lines = emptyList(); badgeSpots = emptyMap()
    }
}

class SubwayPainter(private val palette: MapPalette) {

    val board = SubwayBoard()

    /** The band last drawn: a band changes only 5 % past an edge, so it has to be remembered between frames. */
    var band: ZoomBand? = null
        private set

    fun bandFor(metersPerPoint: Double): ZoomBand = zoomBand(metersPerPoint, band).also { band = it }

    // ---- paths, built once per band × scale bucket and kept ---------------------------------------------------------

    /**
     * A network's lines as `Path`s **in dp at the bucket's scale** (map units × the ladder step's scale), for one
     * zoom band. A drag keeps the scale, so every frame of it reuses these and only changes the canvas matrix; a
     * pinch rebuilds them once per ladder step (9 %), never per frame. Main thread only, memory only.
     */
    private class CachedRoute {
        var box: MapBox = MapBox.EMPTY
        val own = Shape()
        val all = Shape()
    }

    /**
     * One cached geometry, held two ways from the SAME commands (offset runs, corners rounded with quads):
     *
     *  - [path], the `Path` itself — what a dashed stroke needs (the QLINE's ties);
     *  - [segments], the same path flattened to plain segments (a quad becomes one to three chords, about a
     *    third of a dp from the curve at most), for `Canvas.drawLines`.
     *
     * Every SOLID pass — casing, colour, stripe, trunk, the selected route — is drawn from the segments. With round
     * caps a run of segments covers exactly the shape of a round-joined polyline, and it is drawn as plain geometry. A long
     * stroked `Path` under a matrix that changes every frame is instead rasterised on the CPU and uploaded as a mask
     * the size of its bounds, once per path per frame: with 79 routes that was 800 ms a frame on the emulator against
     * 250 ms for `standard`, measured with `dumpsys gfxinfo` on 2026-09-21; from segments it is 550 ms (the basemap's
     * own paths are half of what is left). The emulator's GPU is a poor guide to a phone's; the ratio is the point. Both are built once per band × scale bucket and never per frame.
     */
    private class Shape {
        val path = Path()
        var segments = FloatArray(0)
        private val pending = ArrayList<Float>()

        fun add(commands: List<PathCommand>, k: Double) {
            var x = 0f
            var y = 0f
            fun seg(nx: Float, ny: Float) {
                pending.add(x); pending.add(y); pending.add(nx); pending.add(ny)
                x = nx; y = ny
            }
            for (c in commands) {
                when (c) {
                    is PathCommand.Move -> { x = (c.x * k).toFloat(); y = (c.y * k).toFloat(); path.moveTo(x, y) }
                    is PathCommand.Line -> { path.lineTo((c.x * k).toFloat(), (c.y * k).toFloat()); seg((c.x * k).toFloat(), (c.y * k).toFloat()) }
                    is PathCommand.Quad -> {
                        val cx = (c.cx * k).toFloat(); val cy = (c.cy * k).toFloat()
                        val ex = (c.x * k).toFloat(); val ey = (c.y * k).toFloat()
                        path.quadTo(cx, cy, ex, ey)
                        // A quad is never further from its chords than its control point's sag divided by n². Three
                        // chords at most: on a 14 dp corner that is a third of a dp, under a line 3.5 to 10 dp wide —
                        // and every chord is a draw, so a corner must not cost more than the street leading to it.
                        val sag = hypot((x + ex) / 2.0 - cx, (y + ey) / 2.0 - cy) / 2
                        val n = kotlin.math.ceil(kotlin.math.sqrt(sag / 0.5)).toInt().coerceIn(1, 3)
                        val sx = x; val sy = y
                        for (i in 1..n) {
                            val t = i.toFloat() / n
                            val u = 1 - t
                            seg(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey)
                        }
                    }
                }
            }
        }

        fun seal() {
            segments = pending.toFloatArray()
            pending.clear()
        }
    }

    private class CachedNet(
        val signature: String,
        val bucketScale: Double,
        val routes: List<CachedRoute>,
        /** Every trunk stretch of the network: every member draws the same stroke, so it is one shape, drawn once. */
        val trunks: Shape,
        val anyTrunk: Boolean,
        val built: List<SubwayGeometry.BuiltLine>,
    )

    private val cache = HashMap<String, CachedNet>()

    /** How many times paths were built, for the debug log: it must not grow while a finger drags. */
    var builds = 0
        private set

    private fun cached(layer: String, scene: SubwayScene, band: ZoomBand, scale: Double): CachedNet? {
        val prepared = scene.nets[layer] ?: return null
        val bucket = subwayScaleBucket(scale)
        val signature = (scene.netKeys[layer] ?: layer) + "|" + band.name + "|" + bucket
        cache[layer]?.let { if (it.signature == signature) return it }
        val bucketScale = subwayBucketScale(bucket)
        val built = prepared.built(band, bucketScale)
        val routes = List(prepared.net.routes.size) { CachedRoute() }
        val trunks = Shape()
        var anyTrunk = false
        for (b in built) {
            val r = routes[b.route]
            r.box = r.box.union(b.box)
            r.own.add(b.ownCommands, bucketScale)
            r.all.add(b.ownCommands, bucketScale)
            r.all.add(b.trunkCommands, bucketScale)
            if (b.trunkCommands.isNotEmpty()) {
                trunks.add(b.trunkCommands, bucketScale)
                anyTrunk = true
            }
        }
        for (r in routes) { r.own.seal(); r.all.seal() }
        trunks.seal()
        builds++
        return CachedNet(signature, bucketScale, routes, trunks, anyTrunk, built).also { cache[layer] = it }
    }

    fun forget() {
        cache.clear()
        board.clear()
    }

    // ---- paints -------------------------------------------------------------------------------------------------------

    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val butt = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.BUTT
        strokeJoin = Paint.Join.ROUND
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val erase = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
        color = -0x1000000
    }

    /**
     * Badges: the system's own bold face, tabular figures, always horizontal. `drawText(String)` lays a run out left
     * to right unless the text itself is right-to-left, and a route's short name is Latin — so "3 · 4 · 16" reads the
     * same on an Arabic phone, and the canvas never mirrors.
     */
    private val badgeWords = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.DEFAULT_BOLD
        textAlign = Paint.Align.CENTER
        fontFeatureSettings = "tnum"
    }
    private val nameFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val nameHalo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeWidth = 3.5f
    }

    private fun token(t: TransitToken): Int = palette.transit(t)

    private fun resolved(layer: String, route: NetRoute?, band: ZoomBand, mpp: Double): SubwayDrawing {
        val r = resolveTransitStyle(
            TransitStyleInput(MapStyle.SUBWAY, layer, route, mpp, band, palette.scheme, palette.highContrast),
        )
        return (r as? ResolvedTransit.Subway)?.drawing ?: SubwayDrawing()
    }

    private val widths = HashMap<String, Float>()

    private fun textWidth(text: String, size: Float, paint: Paint): Double {
        val key = "${(size * 10).toInt()}:${if (paint === badgeWords) "b" else "n"}:$text"
        widths[key]?.let { return it.toDouble() }
        paint.textSize = size
        val w = paint.measureText(text)
        if (widths.size > 2000) widths.clear()
        widths[key] = w
        return w.toDouble()
    }

    // ---- lines (draw order 6 to 12) -------------------------------------------------------------------------------------

    private class RoutePath(val layer: String, val index: Int, val route: NetRoute, val own: Shape, val all: Shape, val draw: SubwayDrawing)

    fun drawLines(overlays: List<MapOverlay>, scene: SubwayScene, cam: MapCamera, band: ZoomBand, c: Canvas) {
        val view = cam.visible
        val mpp = cam.metersPerPoint
        val w = cam.width.toFloat()
        val h = cam.height.toFloat()
        board.lines = emptyList()

        // 6. Bike lanes: the secondary network, under every transit line. A thin double line, never badged.
        overlays.firstOrNull { it.id == "go:bike_lanes" && it.subway }?.let { bikes ->
            val p = Path()
            for (l in bikes.data.lines) {
                if (!l.box.intersects(view) || l.points.size < 4) continue
                p.moveTo(cam.screenX(l.points[0]).toFloat(), cam.screenY(l.points[1]).toFloat())
                var i = 2
                while (i + 1 < l.points.size) {
                    p.lineTo(cam.screenX(l.points[i]).toFloat(), cam.screenY(l.points[i + 1]).toFloat())
                    i += 2
                }
            }
            val d = resolved("bike_lanes", null, band, mpp)
            val inlay = d.inlay
            line.pathEffect = null
            line.color = token(TransitToken.BIKE)
            if (inlay is TransitInlay.DoubleLine) {
                // Two strokes from one path: the whole width in green, then the middle taken out again. The layer is
                // what makes "out" mean "back to the map underneath" rather than "a hole to the window".
                val layer = c.saveLayer(0f, 0f, w, h, null)
                line.strokeWidth = (d.width * 2 + inlay.gap).toFloat()
                c.drawPath(p, line)
                erase.strokeWidth = inlay.gap.toFloat()
                c.drawPath(p, erase)
                c.restoreToCount(layer)
            } else {
                line.strokeWidth = d.width.toFloat()
                c.drawPath(p, line)
            }
        }

        // One `Path` per route, built once per band × scale bucket. A frame copies nothing: the paths are stroked
        // through the canvas matrix, with every width and dash divided by what is left of the scale, so a line is
        // the same number of dp wide at every zoom.
        val routes = HashMap<String, List<RoutePath>>()
        val trunkPaths = ArrayList<Shape>()
        val held = ArrayList<Triple<String, TransitNet, List<SubwayGeometry.BuiltLine>>>()
        var bucketScale = 0.0
        for (layer in subwayNetworkLayers) {
            if (overlays.none { it.id == "go:$layer" && it.subway }) continue
            val prepared = scene.nets[layer] ?: continue
            val made = cached(layer, scene, band, cam.scale) ?: continue
            bucketScale = made.bucketScale
            held.add(Triple(layer, prepared.net, made.built))
            if (made.anyTrunk) trunkPaths.add(made.trunks)
            routes[layer] = prepared.net.routes.indices.mapNotNull { i ->
                val r = made.routes[i]
                if (!r.box.intersects(view)) null
                else RoutePath(layer, i, prepared.net.routes[i], r.own, r.all, resolved(layer, prepared.net.routes[i], band, mpp))
            }
        }
        board.lines = held
        if (routes.isEmpty()) return

        val k = (cam.scale / bucketScale).toFloat()
        val fillColor = token(TransitToken.FILL)
        fun through(body: () -> Unit) {
            val save = c.save()
            c.translate((cam.width / 2 - cam.centerX * cam.scale).toFloat(), (cam.height / 2 - cam.centerY * cam.scale).toFloat())
            c.scale(k, k)
            body()
            c.restoreToCount(save)
        }
        fun stroke(p: Shape, color: Int, width: Double) {
            line.pathEffect = null
            line.color = color
            line.strokeWidth = (width / k).toFloat()
            c.drawLines(p.segments, line)
        }

        fun chevrons(layer: String, inlay: TransitInlay.Chevrons) {
            val made = cache[layer] ?: return
            val marks = Path()
            for (b in made.built) {
                for (poly in b.own) {
                    val screen = DoubleArray(poly.size)
                    var i = 0
                    while (i + 1 < poly.size) {
                        screen[i] = cam.screenX(poly[i]); screen[i + 1] = cam.screenY(poly[i + 1])
                        i += 2
                    }
                    for (m in SubwayGeometry.marksAlong(screen, inlay.every)) {
                        if (m.x < -20 || m.y < -20 || m.x > w + 20 || m.y > h + 20) continue
                        // "›": two strokes from the tip, back at ±35° to the way the loop runs.
                        val half = inlay.arm * cos(35 * Math.PI / 180) / 2
                        val tx = m.x + cos(m.angle) * half
                        val ty = m.y + sin(m.angle) * half
                        for (side in doubleArrayOf(35.0, -35.0)) {
                            val a = m.angle + Math.PI + side * Math.PI / 180
                            marks.moveTo(tx.toFloat(), ty.toFloat())
                            marks.lineTo((tx + cos(a) * inlay.arm).toFloat(), (ty + sin(a) * inlay.arm).toFloat())
                        }
                    }
                }
            }
            line.pathEffect = null
            line.color = fillColor
            line.strokeWidth = inlay.width.toFloat()
            c.drawPath(marks, line)
        }

        /** Inside [through] for the stripe and the ties; the chevrons are screen-space and drawn outside it. */
        fun inlayThrough(r: RoutePath, p: Shape) {
            when (val inlay = r.draw.inlay) {
                is TransitInlay.Stripe -> stroke(p, fillColor, inlay.width)
                is TransitInlay.Ties -> {
                    butt.color = fillColor
                    butt.strokeWidth = (inlay.width / k).toFloat()
                    butt.pathEffect = DashPathEffect(FloatArray(inlay.dash.size) { (inlay.dash[it] / k).toFloat() }, 0f)
                    c.drawPath(p.path, butt)
                    butt.pathEffect = null
                }
                else -> Unit
            }
        }

        fun everything() {
            through {
                // 7, 8. SMART under DDOT. The casing pass for the whole network first, then each route in its tone —
                // local before frequent, and the lowest route number last so it is on top where lines meet.
                for (layer in listOf("smart_routes", "ddot_routes")) {
                    // One path per route, never one per network: a single path holding every route of a network
                    // crosses itself thousands of times, and the GPU's path triangulator is quadratic in crossings —
                    // tried on 2026-09-21, it stopped the emulator's render thread for seconds at a time. Per route,
                    // a route out of view is also not drawn at all.
                    val list = routes[layer] ?: continue
                    for (frequent in listOf(false, true)) {
                        for (r in list) if (r.route.frequent == frequent) stroke(r.own, fillColor, r.draw.casingWidth)
                    }
                    for (frequent in listOf(false, true)) {
                        for (r in list.asReversed()) {
                            if (r.route.frequent == frequent) stroke(r.own, token(r.draw.stroke ?: TransitToken.TR5), r.draw.width)
                        }
                    }
                    for (r in list) (r.draw.inlay as? TransitInlay.Stripe)?.let { stroke(r.own, fillColor, it.width) }
                }
                // 9. Trunks: every member draws the same stroke, so it is drawn once per network.
                val tw = subwayLineWidth(SubwayLineKind.TRUNK, band)
                for (t in trunkPaths) stroke(t, fillColor, tw + subwayCasing(band, palette.highContrast))
                for (t in trunkPaths) stroke(t, token(TransitToken.TRUNK), tw)
            }
            // 10, 11. QLINE: casing, line, ties. People Mover: casing, line, chevrons.
            for (layer in listOf("qline", "people_mover")) {
                for (r in routes[layer] ?: emptyList()) {
                    through {
                        stroke(r.all, fillColor, r.draw.casingWidth)
                        stroke(r.all, token(r.draw.stroke ?: TransitToken.RAIL), r.draw.width)
                        inlayThrough(r, r.all)
                    }
                    (r.draw.inlay as? TransitInlay.Chevrons)?.let { chevrons(layer, it) }
                }
            }
        }

        // 12. A selected route: everything else at 35 % — as ONE layer, so overlaps do not add up and the casing
        // does not show through the line — then the route itself last: the `--tr-sel` under-stroke, its casing, and
        // the line a dp and a half wider, shape kept, drawn THROUGH its trunk stretches.
        val chosen = scene.selected?.let { sel -> routes[sel.first]?.firstOrNull { it.index == sel.second } }
        if (scene.selected != null && scene.nets.containsKey(scene.selected.first)) {
            val layer = c.saveLayerAlpha(0f, 0f, w, h, DIM_ALPHA)
            everything()
            c.restoreToCount(layer)
        } else {
            everything()
        }
        if (chosen != null) {
            through {
                stroke(chosen.all, token(TransitToken.SEL), chosen.draw.casingWidth + 1.5 + 3)
                stroke(chosen.all, fillColor, chosen.draw.casingWidth + 1.5)
                stroke(chosen.all, token(chosen.draw.stroke ?: TransitToken.TR5), chosen.draw.width + 1.5)
                inlayThrough(chosen, chosen.all)
            }
            (chosen.draw.inlay as? TransitInlay.Chevrons)?.let { chevrons(chosen.layer, it) }
        }
    }

    // ---- stations, pills, terminals, markers and badges (draw order 15 to 18, and 20) -----------------------------------

    class Plan {
        class Dot(val x: Double, val y: Double, val r: Double, val ring: Double, val dim: Boolean)
        class Pill(val ax: Double, val ay: Double, val bx: Double, val by: Double, val height: Double, val ring: Double, val dim: Boolean)
        class End(val x: Double, val y: Double, val r: Double, val tone: TransitToken, val dim: Boolean)
        class Mark(val x: Double, val y: Double, val marker: TransitMarker, val tone: TransitToken)
        class Badge(val rect: LabelRect, val text: String, val fill: TransitToken, val fontSize: Double, val dim: Boolean)
        class Name(val text: String, val x: Double, val y: Double, val clear: Double, val selected: Boolean)

        val dots = ArrayList<Dot>()
        val pills = ArrayList<Pill>()
        val ends = ArrayList<End>()
        val marks = ArrayList<Mark>()
        val badges = ArrayList<Badge>()
        val names = ArrayList<Name>()

        /** What street and park names must keep clear of: badges, pills and terminals outrank them. */
        var occupied: List<LabelRect> = emptyList()
    }

    /**
     * Works out what is drawn this frame and where, and writes the tap targets to the board. Done before the street
     * names are placed, because badges, pills and terminals outrank them. [controls] are the map's own floating
     * buttons and the open card, in dp: entered as already taken, so no badge or name is drawn under a button.
     */
    fun plan(
        overlays: List<MapOverlay>, scene: SubwayScene, cam: MapCamera, band: ZoomBand,
        textScale: Double, controls: List<LabelRect>,
    ): Plan {
        val plan = Plan()
        val mpp = cam.metersPerPoint
        val w = cam.width
        val h = cam.height
        val glyphs = ArrayList<HitGlyph>()
        val targets = HashMap<String, MapSelection>()
        val stations = stationsFor(band, mpp, scene.selected != null)
        fun on(x: Double, y: Double, pad: Double = 12.0) = x > -pad && y > -pad && x < w + pad && y < h + pad
        fun centre(x: Double, y: Double) = hypot(x - w / 2, y - h / 2)
        fun target(id: String, kind: HitKind, x: Double, y: Double, sel: MapSelection) {
            glyphs.add(HitGlyph(id, kind, x, y)); targets[id] = sel
        }
        fun subwayOn(layer: String) = overlays.any { it.id == "go:$layer" && it.subway }
        val selected = scene.selected
        val selectedNet = selected?.let { scene.nets[it.first]?.net }
        val selectedStopSet: Set<Int> =
            if (selected == null || selectedNet == null) emptySet()
            else selectedNet.routes.getOrNull(selected.second)?.stops?.flatten()?.toSet() ?: emptySet()

        // 15. Stops. Near only, 400 at most (nearest the middle first; the list carries the rest).
        for (layer in listOf("smart_stops", "ddot_stops")) {
            val overlay = overlays.firstOrNull { it.id == "go:$layer" && it.subway }
            val isSelectedNet = selectedNet?.stopsLayer == layer
            val data = overlay?.data ?: (if (isSelectedNet) scene.selectedStops else null) ?: continue
            val marker = resolved(layer, null, band, mpp).marker as? TransitMarker.Station ?: continue
            val showAll = overlay != null && stations.stops
            var found = ArrayList<DoubleArray>()     // index, x, y, mine
            for ((i, p) in data.points.withIndex()) {
                val mine = isSelectedNet && selectedStopSet.contains(i)
                if (!(showAll || (mine && stations.selectedStops))) continue
                val x = cam.screenX(p.x)
                val y = cam.screenY(p.y)
                if (on(x, y)) found.add(doubleArrayOf(i.toDouble(), x, y, if (mine) 1.0 else 0.0))
            }
            if (found.size > SUBWAY_STOP_CAP) {
                found = ArrayList(found.sortedBy { centre(it[1], it[2]) }.take(SUBWAY_STOP_CAP))
            }
            for (f in found) {
                val mine = f[3] == 1.0
                val i = f[0].toInt()
                plan.dots.add(Plan.Dot(f[1], f[2], if (mine) 4.5 else marker.radius, if (mine) marker.ring + 0.5 else marker.ring, selected != null && !mine))
                target("stop:$layer:$i", if (mine) HitKind.SELECTED else HitKind.STOP, f[1], f[2], MapSelection.Station(layer, i))
            }
        }
        // Rail stations, from mid. Stations come from the STANDARD layer file: a rail network file has no points.
        if (stations.railStations) {
            for (layer in listOf("qline", "people_mover")) {
                val o = overlays.firstOrNull { it.id == "go:$layer" && it.subway } ?: continue
                val marker = resolved(layer, null, band, mpp).marker as? TransitMarker.Station ?: continue
                val dim = selected != null && selected.first != layer
                for ((i, p) in o.data.points.withIndex()) {
                    val x = cam.screenX(p.x)
                    val y = cam.screenY(p.y)
                    if (!on(x, y)) continue
                    plan.dots.add(Plan.Dot(x, y, marker.radius, marker.ring, dim))
                    target("stop:$layer:$i", HitKind.STOP, x, y, MapSelection.Station(layer, i))
                    if (stations.railStationNames) plan.names.add(Plan.Name(p.name, x, y, marker.radius + 3, false))
                }
            }
        }

        // 16. Interchanges (120 at most), terminals, hubs.
        if (stations.interchangeMinRoutes > 0) {
            for (layer in listOf("smart_routes", "ddot_routes")) {
                if (!subwayOn(layer)) continue
                val net = scene.nets[layer]?.net ?: continue
                var found = ArrayList<DoubleArray>()
                for ((i, ch) in net.interchanges.withIndex()) {
                    if (ch.routes.size < stations.interchangeMinRoutes) continue
                    val x = cam.screenX(ch.x)
                    val y = cam.screenY(ch.y)
                    if (on(x, y)) found.add(doubleArrayOf(i.toDouble(), x, y))
                }
                if (found.size > SUBWAY_PILL_CAP) found = ArrayList(found.sortedBy { centre(it[1], it[2]) }.take(SUBWAY_PILL_CAP))
                for (f in found) {
                    val i = f[0].toInt()
                    val ch = net.interchanges[i]
                    val dim = selected != null && (selected.first != layer || !ch.routes.contains(selected.second))
                    plan.pills.add(
                        Plan.Pill(
                            cam.screenX(ch.ax), cam.screenY(ch.ay), cam.screenX(ch.bx), cam.screenY(ch.by),
                            subwayPillHeight(false, band), subwayPillRing(false, palette.highContrast), dim,
                        ),
                    )
                    target("change:$layer:$i", HitKind.INTERCHANGE, f[1], f[2], MapSelection.Interchange(layer, i))
                }
            }
        }

        val candidates = ArrayList<BadgeCandidate>()
        class Look(val fill: TransitToken, val font: Double, val dim: Boolean, val route: String?)
        val looks = HashMap<String, Look>()
        val terminalSpots = ArrayList<DoubleArray>()
        fun candidate(
            id: String, text: String, fill: TransitToken, rank: BadgeRank, order: Long,
            x: Double, y: Double, height: Double, font: Double, dim: Boolean, route: String?, leftOf: Boolean = false,
        ) {
            val hgt = height * textScale
            val width = badgeWidth(textWidth(text, (font * textScale).toFloat(), badgeWords), hgt, 5 * textScale)
            val cx = if (leftOf) x + width / 2 else x
            candidates.add(BadgeCandidate(id, text, rank, order, LabelRect(cx, y, width, hgt), centre(x, y)))
            looks[id] = Look(fill, font * textScale, dim, route)
        }
        for ((li, layer) in subwayNetworkLayers.withIndex()) {        // `li` numbers the trunk badges only
            if (!subwayOn(layer)) continue
            val prepared = scene.nets[layer] ?: continue
            val net = prepared.net
            for ((ri, route) in net.routes.withIndex()) {
                val d = resolved(layer, route, band, mpp)
                val isSelected = selected?.first == layer && selected.second == ri
                val dim = selected != null && !isSelected
                val badge = d.badge ?: continue
                if (!(d.badgeShown || isSelected)) continue
                val rail = layer == "qline" || layer == "people_mover"
                val rank = if (isSelected) BadgeRank.SELECTED else if (rail) BadgeRank.RAIL else if (route.frequent) BadgeRank.FREQUENT else BadgeRank.OTHER
                val order = riderOrder(route.short, net.system, ri)
                val sel = MapSelection.Line(layer, route.id)
                if (stations.terminals) {
                    for ((ei, e) in route.ends.withIndex()) {
                        val x = cam.screenX(e.x)
                        val y = cam.screenY(e.y)
                        if (!on(x, y)) continue
                        val r = subwayTerminalRadius(band)
                        plan.ends.add(Plan.End(x, y, r, d.stroke ?: TransitToken.TR5, dim))
                        terminalSpots.add(doubleArrayOf(x, y))
                        target("end:${route.id}:$ei", if (isSelected) HitKind.SELECTED else HitKind.TERMINAL, x, y, sel)
                        // Each terminal carries its route's badge beside it, and at near the stop's name.
                        candidate("endbadge:${route.id}:$ei", badge.text, badge.fill, rank, order, x + r + 4, y, badge.height, badge.fontSize, dim, route.id, leftOf = true)
                        targets["endbadge:${route.id}:$ei"] = sel
                        if (stations.terminalNames && e.name.isNotEmpty()) {
                            plan.names.add(Plan.Name(e.name, x, y + r + 9 * textScale, 0.0, isSelected))
                        }
                    }
                }
                val step = subwayStep(band)
                for ((ai, a) in (prepared.anchors[band]?.getOrNull(ri) ?: emptyList()).withIndex()) {
                    // On the shifted line, not the centre of the street.
                    val shift = a.off * step / 2
                    val x = cam.screenX(a.x) + a.leftX * shift
                    val y = cam.screenY(a.y) + a.leftY * shift
                    if (!on(x, y, 0.0) || terminalSpots.any { hypot(it[0] - x, it[1] - y) < 24 }) continue
                    candidate("badge:${route.id}:$ai", badge.text, badge.fill, rank, order, x, y, badge.height, badge.fontSize, dim, route.id)
                    targets["badge:${route.id}:$ai"] = sel
                }
            }
            // A trunk's one stacked badge, at each anchor the pipeline chose.
            for ((ti, t) in net.trunks.withIndex()) {
                val x = cam.screenX(t.x)
                val y = cam.screenY(t.y)
                if (!on(x, y, 0.0)) continue
                val id = "trunk:$layer:$ti"
                candidate(
                    id, trunkBadgeText(t.routes.map { net.routes[it].short }), TransitToken.TRUNK, BadgeRank.TRUNK,
                    -(li * 1000L + ti) - 1, x, y, if (band == ZoomBand.NEAR) 18.0 else 16.0,
                    if (band == ZoomBand.NEAR) 12.0 else 11.0, selected != null, null,
                )
                targets[id] = MapSelection.Trunk(layer, t.routes.map { net.routes[it].id })
            }
        }
        for (hub in scene.hubs) {
            if (!hub.shows(scene.layersOn)) continue
            val x = cam.screenX(hub.x)
            val y = cam.screenY(hub.y)
            if (!on(x, y)) continue
            val hgt = subwayPillHeight(true, band)
            // Placed from the file, and always the whole span, whichever of the hub's layers are on.
            plan.pills.add(
                Plan.Pill(cam.screenX(hub.ax), cam.screenY(hub.ay), cam.screenX(hub.bx), cam.screenY(hub.by), hgt, subwayPillRing(true, palette.highContrast), false),
            )
            target(hub.id, HitKind.HUB, x, y, MapSelection.Hub(hub.name))
            plan.names.add(0, Plan.Name(hub.name, x, y, hgt / 2 + 4, false))
        }

        // 17. Point markers: MoGo, park and ride, coaches, Amtrak. From mid.
        if (stations.markers) {
            for ((layer, named) in listOf("mogo" to false, "park_ride" to false, "intercity_bus" to false, "stations" to true)) {
                val o = overlays.firstOrNull { it.id == "go:$layer" && it.subway } ?: continue
                val d = resolved(layer, null, band, mpp)
                val marker = d.marker ?: continue
                for ((i, p) in o.data.points.withIndex()) {
                    val x = cam.screenX(p.x)
                    val y = cam.screenY(p.y)
                    if (!on(x, y)) continue
                    plan.marks.add(Plan.Mark(x, y, marker, d.stroke ?: TransitToken.RAIL))
                    target("mark:$layer:$i", HitKind.MARKER, x, y, MapSelection.Stop(p.name, o.label))
                    if (named) plan.names.add(Plan.Name(p.name, x, y, 10.0, false))
                }
            }
        }

        // 18. Badges: 24 a frame, in the order of claim, never on a control, a terminal, a hub or an interchange.
        val taken = ArrayList(controls)
        for (e in plan.ends) taken.add(LabelRect(e.x, e.y, e.r * 2 + 3, e.r * 2 + 3))
        for (p in plan.pills) taken.add(LabelRect((p.ax + p.bx) / 2, (p.ay + p.by) / 2, abs(p.ax - p.bx) + p.height, abs(p.ay - p.by) + p.height))
        val spots = HashMap<String, ArrayList<LabelRect>>()
        for (b in claimBadges(candidates, taken)) {
            val look = looks[b.id] ?: continue
            plan.badges.add(Plan.Badge(b.rect, b.text, look.fill, look.font, look.dim))
            glyphs.add(HitGlyph(b.id, if (b.rank == BadgeRank.SELECTED) HitKind.SELECTED else HitKind.BADGE, b.rect.x, b.rect.y))
            look.route?.let { spots.getOrPut(it) { ArrayList() }.add(b.rect) }
        }
        val drawn = glyphs.map { it.id }.toSet()
        board.glyphs = glyphs
        board.targets = targets.filterKeys { drawn.contains(it) }
        board.badgeSpots = spots
        plan.occupied = taken + plan.badges.map { it.rect }
        return plan
    }

    private fun alpha(color: Int, dim: Boolean): Int =
        if (!dim) color else (color and 0x00FFFFFF) or (DIM_ALPHA shl 24)

    fun drawGlyphs(plan: Plan, textScale: Double, c: Canvas) {
        val fillColor = token(TransitToken.FILL)
        val ring = token(TransitToken.RING)
        line.pathEffect = null

        // 15. Stops: a white disc with a dark ring. One path per ring width, plain and dimmed.
        for (dim in listOf(true, false)) {
            val byRing = HashMap<Double, Path>()
            for (d in plan.dots) {
                if (d.dim != dim) continue
                byRing.getOrPut(d.ring) { Path() }.addCircle(d.x.toFloat(), d.y.toFloat(), d.r.toFloat(), Path.Direction.CW)
            }
            for ((width, p) in byRing) {
                fill.color = alpha(fillColor, dim)
                c.drawPath(p, fill)
                line.color = alpha(ring, dim)
                line.strokeWidth = width.toFloat()
                c.drawPath(p, line)
            }
        }
        // 16. Pills: a stadium round the two stops furthest apart; a circle when they are closer than it is tall.
        for (p in plan.pills) {
            val bx = if (p.ax == p.bx && p.ay == p.by) p.bx + 0.01 else p.bx
            line.color = alpha(ring, p.dim)
            line.strokeWidth = p.height.toFloat()
            c.drawLine(p.ax.toFloat(), p.ay.toFloat(), bx.toFloat(), p.by.toFloat(), line)
            line.color = alpha(fillColor, p.dim)
            line.strokeWidth = (p.height - p.ring * 2).toFloat()
            c.drawLine(p.ax.toFloat(), p.ay.toFloat(), bx.toFloat(), p.by.toFloat(), line)
        }
        for (e in plan.ends) {
            fill.color = alpha(fillColor, e.dim)
            c.drawCircle(e.x.toFloat(), e.y.toFloat(), e.r.toFloat(), fill)
            line.color = alpha(token(e.tone), e.dim)
            line.strokeWidth = subwayTerminalRing(palette.highContrast).toFloat()
            c.drawCircle(e.x.toFloat(), e.y.toFloat(), e.r.toFloat(), line)
        }
        // 17. Markers. Each kind has a shape of its own, so none of them is told apart by colour.
        for (m in plan.marks) drawMarker(c, m.x.toFloat(), m.y.toFloat(), m.marker, token(m.tone), fillColor, ring)

        // 18. Badges: always horizontal, so nothing is ever upside down; Latin route names, left to right in every
        // language (the canvas never mirrors).
        val words = palette.badgeText
        for (b in plan.badges) {
            box.set(
                (b.rect.x - b.rect.width / 2).toFloat(), (b.rect.y - b.rect.height / 2).toFloat(),
                (b.rect.x + b.rect.width / 2).toFloat(), (b.rect.y + b.rect.height / 2).toFloat(),
            )
            val corner = (5 * textScale).toFloat()
            fill.color = alpha(token(b.fill), b.dim)
            c.drawRoundRect(box, corner, corner, fill)
            line.color = alpha(fillColor, b.dim)
            line.strokeWidth = 1.5f
            c.drawRoundRect(box, corner, corner, line)
            badgeWords.textSize = b.fontSize.toFloat()
            badgeWords.color = alpha(words, b.dim)
            c.drawText(b.text, b.rect.x.toFloat(), b.rect.y.toFloat() - (badgeWords.ascent() + badgeWords.descent()) / 2, badgeWords)
        }
    }

    private val box = RectF()

    fun drawMarker(c: Canvas, x: Float, y: Float, marker: TransitMarker, tone: Int, fillColor: Int, ring: Int) {
        line.pathEffect = null
        when (marker) {
            is TransitMarker.Dock -> {
                val s = marker.size.toFloat() / 2
                box.set(x - s, y - s, x + s, y + s)
                fill.color = tone
                c.drawRoundRect(box, marker.corner.toFloat(), marker.corner.toFloat(), fill)
                line.color = fillColor; line.strokeWidth = marker.ring.toFloat()
                c.drawRoundRect(box, marker.corner.toFloat(), marker.corner.toFloat(), line)
                fill.color = fillColor
                c.drawCircle(x, y, marker.dot.toFloat(), fill)
            }
            is TransitMarker.RailStation -> {
                val s = marker.size.toFloat() / 2
                box.set(x - s, y - s, x + s, y + s)
                fill.color = fillColor
                c.drawRoundRect(box, marker.corner.toFloat(), marker.corner.toFloat(), fill)
                line.color = tone; line.strokeWidth = marker.ring.toFloat()
                c.drawRoundRect(box, marker.corner.toFloat(), marker.corner.toFloat(), line)
                fill.color = tone
                c.drawRect(x - marker.barWidth.toFloat() / 2, y - marker.barHeight.toFloat() / 2, x + marker.barWidth.toFloat() / 2, y + marker.barHeight.toFloat() / 2, fill)
            }
            is TransitMarker.Coach -> {
                val a = marker.across.toFloat() / 2
                val d = Path()
                d.moveTo(x, y - a); d.lineTo(x + a, y); d.lineTo(x, y + a); d.lineTo(x - a, y); d.close()
                fill.color = fillColor
                c.drawPath(d, fill)
                line.color = tone; line.strokeWidth = marker.ring.toFloat()
                line.pathEffect = DashPathEffect(FloatArray(marker.dash.size) { marker.dash[it].toFloat() }, 0f)
                c.drawPath(d, line)
                line.pathEffect = null
            }
            is TransitMarker.Parking -> {
                val s = marker.size.toFloat() / 2
                box.set(x - s, y - s, x + s, y + s)
                fill.color = tone
                c.drawRoundRect(box, marker.corner.toFloat(), marker.corner.toFloat(), fill)
                badgeWords.textSize = marker.letter.toFloat()
                badgeWords.color = fillColor
                c.drawText("P", x, y - (badgeWords.ascent() + badgeWords.descent()) / 2, badgeWords)
            }
            is TransitMarker.Station -> {
                fill.color = fillColor
                c.drawCircle(x, y, marker.radius.toFloat(), fill)
                line.color = ring; line.strokeWidth = marker.ring.toFloat()
                c.drawCircle(x, y, marker.radius.toFloat(), line)
            }
        }
    }

    /**
     * 20. Names of hubs, terminals and stations: twelve at most, right of the glyph, then left, above, below — the
     * first that is free. One that does not fit is dropped, never shrunk or overlapped. A station's two platforms
     * carry one name between them.
     */
    fun drawNames(plan: Plan, cam: MapCamera, textScale: Double, quiet: Boolean, c: Canvas) {
        val placed = ArrayList(plan.occupied)
        var drawn = 0
        val said = HashSet<String>()
        val ink = if (quiet) palette.quiet.ink.argb else palette.ink
        for (n in plan.names.sortedBy { if (it.selected) 0 else 1 }) {
            if (drawn >= SUBWAY_NAME_CAP) break
            if (n.text.isEmpty() || said.contains(n.text)) continue
            val size = ((if (n.selected) 13.0 else 12.0) * textScale).toFloat()
            val tw = textWidth(n.text, size, nameFill)
            val th = size + 4.0
            val spots = if (n.clear == 0.0) listOf(n.x to n.y) else listOf(
                n.x + n.clear + tw / 2 to n.y, n.x - n.clear - tw / 2 to n.y,
                n.x to n.y - n.clear - th / 2, n.x to n.y + n.clear + th / 2,
            )
            val spot = spots.firstOrNull { (sx, sy) ->
                val r = LabelRect(sx, sy, tw, th)
                sx - tw / 2 > 4 && sx + tw / 2 < cam.width - 4 && placed.none { it.overlaps(r) }
            } ?: continue
            placed.add(LabelRect(spot.first, spot.second, tw, th))
            nameFill.textSize = size
            nameHalo.textSize = size
            val baseline = spot.second.toFloat() - (nameFill.ascent() + nameFill.descent()) / 2
            nameHalo.color = palette.land
            c.drawText(n.text, spot.first.toFloat(), baseline, nameHalo)
            nameFill.color = ink
            c.drawText(n.text, spot.first.toFloat(), baseline, nameFill)
            drawn++
            said.add(n.text)
        }
    }

    // ---- tapping ------------------------------------------------------------------------------------------------------

    private var lastTap: Triple<Double, Double, String>? = null

    /**
     * First the thing under a 48 × 48 dp box, in the label priority of the spec — a second tap in the same place
     * moves on to the next thing under the finger.
     */
    fun pickGlyph(x: Double, y: Double): MapSelection? {
        val previous = lastTap?.let { if (hypot(it.first - x, it.second - y) < 12) it.third else null }
        val hit = subwayHitTest(x, y, board.glyphs, previous)
        val target = hit?.let { board.targets[it.id] }
        lastTap = if (hit != null && target != null) Triple(x, y, hit.id) else null
        return target
    }

    /** Then the nearest route line within 22 dp. On a trunk, the card lists the routes that share the street. */
    fun pickLine(x: Double, y: Double, cam: MapCamera): MapSelection? {
        val mx = cam.mapX(x)
        val my = cam.mapY(y)
        val limit = cam.mapDistance(SUBWAY_LINE_HIT)
        val reach = MapBox(mx - limit, my - limit, mx + limit, my + limit)
        var bestD = Double.POSITIVE_INFINITY
        var best: MapSelection? = null
        for ((layer, net, built) in board.lines) {
            val trunkRoutes = HashSet<Int>()
            var trunkD = Double.POSITIVE_INFINITY
            for (b in built) {
                if (!b.box.intersects(reach)) continue
                for (poly in b.own) {
                    val d = MapHit.distanceToPolyline(mx, my, poly)
                    if (d < limit && d < bestD) { bestD = d; best = MapSelection.Line(layer, net.routes[b.route].id) }
                }
                for (poly in b.trunk) {
                    val d = MapHit.distanceToPolyline(mx, my, poly)
                    if (d < limit) { trunkRoutes.add(b.route); trunkD = minOf(trunkD, d) }
                }
            }
            if (trunkRoutes.size > 1 && trunkD <= bestD) {
                bestD = trunkD
                best = MapSelection.Trunk(layer, trunkRoutes.sorted().map { net.routes[it].id })
            }
        }
        return best
    }

    companion object {
        /** 35 %, as one layer. */
        const val DIM_ALPHA = 89
    }
}

/**
 * One small drawn sample for the key ("What the lines mean"), painted with the same tokens and the same marker
 * code as the map, so it follows dark mode and high contrast. The words beside it carry the meaning; the sample is
 * decoration to a screen reader and says nothing.
 */
// Built in code with the kind of sample it is, never inflated from XML: this app has no layout files at all.
@android.annotation.SuppressLint("ViewConstructor")
class SubwayKeySample(context: Context, private val kind: String) : View(context) {

    private val palette = MapPalette(context)
    private val painter = SubwayPainter(palette)
    private val density = resources.displayMetrics.density
    private val pen = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val flat = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.BUTT }
    private val solid = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val ties = DashPathEffect(floatArrayOf(4f, 6f), 0f)
    private val stop = TransitMarker.Station(4.5, 2.0)

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
        setMeasuredDimension((44 * density).toInt(), (24 * density).toInt())

    override fun onDraw(c: Canvas) {
        c.save()
        c.scale(density, density)
        val y = 12f
        val fillColor = palette.transit(TransitToken.FILL)
        val ring = palette.transit(TransitToken.RING)
        fun bar(color: Int, width: Float, casing: Float = 3f) {
            pen.pathEffect = null
            if (casing > 0) { pen.color = fillColor; pen.strokeWidth = width + casing; c.drawLine(6f, y, 38f, y, pen) }
            pen.color = color; pen.strokeWidth = width
            c.drawLine(6f, y, 38f, y, pen)
        }
        when (kind) {
            "frequent" -> bar(palette.transit(TransitToken.TR0), 6f)
            "local" -> bar(palette.transit(TransitToken.TR1), 3.5f)
            "smart" -> { bar(palette.transit(TransitToken.TR2), 6f); pen.color = fillColor; pen.strokeWidth = 2f; c.drawLine(6f, y, 38f, y, pen) }
            "trunk" -> bar(palette.transit(TransitToken.TRUNK), 9f)
            "station" -> painter.drawMarker(c, 22f, y, stop, ring, fillColor, ring)
            "change" -> {
                pen.color = ring; pen.strokeWidth = 11f; c.drawLine(15f, y, 29f, y, pen)
                pen.color = fillColor; pen.strokeWidth = 7f; c.drawLine(15f, y, 29f, y, pen)
            }
            "end" -> {
                solid.color = fillColor
                c.drawCircle(22f, y, 7f, solid)
                pen.color = palette.transit(TransitToken.TR0); pen.strokeWidth = 3f
                c.drawCircle(22f, y, 7f, pen)
            }
            "qline" -> {
                bar(palette.transit(TransitToken.RAIL), 7f)
                flat.color = fillColor; flat.strokeWidth = 4f
                flat.pathEffect = ties
                c.drawLine(6f, y, 38f, y, flat)
            }
            "dpm" -> {
                bar(palette.transit(TransitToken.DPM), 7f)
                pen.color = fillColor; pen.strokeWidth = 1.75f
                for (x in floatArrayOf(14f, 24f, 34f)) { c.drawLine(x, y, x - 3.5f, y - 2.5f, pen); c.drawLine(x, y, x - 3.5f, y + 2.5f, pen) }
            }
            "bike" -> {
                pen.color = palette.transit(TransitToken.BIKE); pen.strokeWidth = 1.5f
                c.drawLine(6f, y - 2f, 38f, y - 2f, pen); c.drawLine(6f, y + 2f, 38f, y + 2f, pen)
            }
        }
        c.restore()
    }
}
