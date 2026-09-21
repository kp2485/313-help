// The two named styles for the transport layers (docs/MAP-STYLE.md): `standard`, which is the drawing the map has
// always had and is the default, and `subway`, the metro-diagram look a person may pick instead.
//
// Everything that decides WHAT is drawn lives here as pure functions over plain numbers. No android.* class in this
// file: `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs all of it on a plain JDK.
// MapSubway.kt only paints what these answer. A port of apps/ios/Sources/HelpCore/MapStyle.swift, function for
// function; MapStyleTest.kt is the port of its tests, case for case.
//
// The rule that matters most: `standard` is untouched. Its resolver hands back exactly the `MapLayerStyle` table and
// the two width functions of MapLayers.kt, it never looks at a route, and it never asks for a network file
// ([netFilesWanted]). MapStyleTest holds all three.
package org.help313.app

import org.help313.query.Json
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** The four layers whose lines the subway style redraws, and whose presence quietens the basemap. */
val subwayNetworkLayers = listOf("ddot_routes", "smart_routes", "qline", "people_mover")

// ---- zoom bands --------------------------------------------------------------------------------------------------

enum class ZoomBand { FAR, MID, NEAR }

/**
 * far > 30 m per dp, mid > 12, near at 12 and under — 12 is the threshold `standard` uses for dense stops.
 * A band changes only when the scale crosses an edge by 5 %, so a pinch that hovers on an edge does not flicker.
 */
fun zoomBand(metersPerPoint: Double, previous: ZoomBand? = null): ZoomBand {
    val mpp = metersPerPoint
    if (previous == null) return if (mpp > 30) ZoomBand.FAR else if (mpp > 12) ZoomBand.MID else ZoomBand.NEAR
    val farEdge = if (previous == ZoomBand.FAR) 30 * 0.95 else 30 * 1.05
    val nearEdge = if (previous == ZoomBand.NEAR) 12 * 1.05 else 12 * 0.95
    return if (mpp > farEdge) ZoomBand.FAR else if (mpp > nearEdge) ZoomBand.MID else ZoomBand.NEAR
}

// ---- colour, as numbers --------------------------------------------------------------------------------------------

/** A colour as 0xRRGGBB, so the contrast tables of docs/MAP-STYLE.md can be computed in a test. */
data class RGB(val value: Int) {
    val r: Int get() = (value shr 16) and 255
    val g: Int get() = (value shr 8) and 255
    val b: Int get() = value and 255
    val hex: String get() = "#%02x%02x%02x".format(r, g, b)

    /** Opaque, in the form `android.graphics.Paint.setColor` takes. */
    val argb: Int get() = (0xFF shl 24) or (value and 0xFFFFFF)

    /** WCAG relative luminance. */
    val luminance: Double
        get() {
            fun lin(v: Int): Double {
                val c = v / 255.0
                return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
            }
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }

    companion object {
        /** WCAG contrast ratio, 1…21. */
        fun contrast(a: RGB, b: RGB): Double {
            val hi = max(a.luminance, b.luminance)
            val lo = min(a.luminance, b.luminance)
            return (hi + 0.05) / (lo + 0.05)
        }
    }
}

enum class MapScheme { LIGHT, DARK }

/**
 * The `--tr-*` tokens of docs/MAP-STYLE.md section 4. Our own contrast-checked palette, not agency brand colours
 * (Kyle, 2026-09-21): every SMART colour fails 3:1 in one theme, and they mark service classes, not routes.
 */
enum class TransitToken(val css: String) {
    TR0("--tr-0"), TR1("--tr-1"), TR2("--tr-2"), TR3("--tr-3"), TR4("--tr-4"), TR5("--tr-5"),
    RAIL("--tr-rail"), DPM("--tr-dpm"), TRUNK("--tr-trunk"), BIKE("--tr-bike"), COACH("--tr-coach"), PR("--tr-pr"),
    RING("--tr-ring"), FILL("--tr-fill"),

    /** The stroke under a chosen route. The ring colour, under its own name as in style.css. */
    SEL("--tr-sel");

    companion object {
        private val tones = listOf(TR0, TR1, TR2, TR3, TR4, TR5)

        /** A tone outside 0…5 wraps rather than crashing. */
        fun tone(n: Int): TransitToken = tones[((n % 6) + 6) % 6]
    }
}

object TransitPalette {
    private val normal: Map<TransitToken, Pair<Int, Int>> = mapOf(
        TransitToken.TR0 to (0xC8102E to 0xFF7A70), TransitToken.TR1 to (0x1D4ED8 to 0x7AA7FF),
        TransitToken.TR2 to (0x0F766E to 0x4FD1C5), TransitToken.TR3 to (0x8A4B14 to 0xE0A96D),
        TransitToken.TR4 to (0xBE185D to 0xFF8AC2), TransitToken.TR5 to (0x475569 to 0xB6C2D2),
        TransitToken.RAIL to (0x1F2937 to 0xEEF2F6), TransitToken.DPM to (0x86198F to 0xE59BF0),
        TransitToken.TRUNK to (0x334155 to 0xCBD5E1), TransitToken.BIKE to (0x15803D to 0x6EE7A0),
        TransitToken.COACH to (0x7C2D12 to 0xFDBA74), TransitToken.PR to (0x1E40AF to 0x93B4FF),
        TransitToken.RING to (0x1B2A22 to 0xEEF5F0), TransitToken.FILL to (0xFFFFFF to 0x0A110E),
        TransitToken.SEL to (0x1B2A22 to 0xEEF5F0),
    )

    /** High contrast (section 4.4). The tokens not named there keep their values: all are already 8:1 or more. */
    private val more: Map<TransitToken, Pair<Int, Int>> = mapOf(
        TransitToken.TR0 to (0x9B0C23 to 0xFFA099), TransitToken.TR1 to (0x1E3A8A to 0xA8C5FF),
        TransitToken.TR2 to (0x0B4F4A to 0x8BE6DD), TransitToken.TR3 to (0x5F330D to 0xF0C596),
        TransitToken.TR4 to (0x831843 to 0xFFB3D7), TransitToken.TR5 to (0x1E293B to 0xDBE3EE),
        TransitToken.DPM to (0x581C5F to 0xF0C0F7), TransitToken.BIKE to (0x14532D to 0xA7F3C5),
    )

    fun color(token: TransitToken, scheme: MapScheme, highContrast: Boolean = false): RGB {
        val pair = (if (highContrast) more[token] else null) ?: normal.getValue(token)
        return RGB(if (scheme == MapScheme.LIGHT) pair.first else pair.second)
    }

    /** The words on a badge: white on the tone in light, the dark casing colour on the tone in dark. */
    fun badgeText(scheme: MapScheme): RGB = RGB(if (scheme == MapScheme.LIGHT) 0xFFFFFF else 0x0A110E)

    // What the ratios in the spec are measured against (apps/web/src/style.css, 2026-09-21).
    fun land(s: MapScheme): RGB = RGB(if (s == MapScheme.LIGHT) 0xF7F9F6 else 0x141F19)
    fun park(s: MapScheme): RGB = RGB(if (s == MapScheme.LIGHT) 0xC4E3C9 else 0x1C3B27)
    fun casing(s: MapScheme): RGB = RGB(if (s == MapScheme.LIGHT) 0xFFFFFF else 0x0A110E)

    /** The ground high contrast is measured against. */
    fun landMoreContrast(s: MapScheme): RGB = RGB(if (s == MapScheme.LIGHT) 0xFFFFFF else 0x0C1512)
}

/** The quietened basemap (section 4.3): thinner, paler-but-legal streets and a paler park. Every street stays 3:1. */
data class QuietBasemap(
    val road: RGB, val main: RGB, val freeway: RGB, val park: RGB, val parkInk: RGB, val ink: RGB,
) {
    /** Street widths × 0.8, never under one dp. */
    val widthFactor: Double get() = 0.8

    /** Street names drop one class, so fewer names compete with badges. */
    val labelClassDrop: Int get() = 1

    /** The CSS names, for the test that reads style.css. */
    val css: Map<String, RGB>
        get() = mapOf(
            "--map-road-q" to road, "--map-main-q" to main, "--map-fwy-q" to freeway,
            "--map-park-q" to park, "--map-park-ink-q" to parkInk, "--map-ink-q" to ink,
        )

    companion object {
        fun tokens(s: MapScheme): QuietBasemap =
            if (s == MapScheme.LIGHT) {
                QuietBasemap(RGB(0x818A84), RGB(0x7D8680), RGB(0xA2833D), RGB(0xE3F1E5), RGB(0x3F6B4C), RGB(0x5A6760))
            } else {
                QuietBasemap(RGB(0x66756C), RGB(0x6C7B73), RGB(0x837039), RGB(0x182C20), RGB(0x7FB394), RGB(0xA3B2A9))
            }
    }
}

enum class BasemapKind { NORMAL, QUIET }

/**
 * The basemap is quietened only in `subway`, only while a network layer is on, and **never** with high contrast: a
 * person who asked for more contrast keeps every street at full strength.
 */
fun basemapTokens(style: MapStyle, networkOn: Boolean, highContrast: Boolean): BasemapKind =
    if (style == MapStyle.SUBWAY && networkOn && !highContrast) BasemapKind.QUIET else BasemapKind.NORMAL

/** A quiet street: × 0.8, never under one dp. */
fun mapQuietStreetWidth(cls: Int, metersPerPoint: Double): Double = max(1.0, mapStreetWidth(cls, metersPerPoint) * 0.8)

// ---- widths (table 7.1) ----------------------------------------------------------------------------------------------

enum class SubwayLineKind { BUS_FREQUENT, BUS_LOCAL, RAIL, TRUNK }

private fun pick(band: ZoomBand, far: Double, mid: Double, near: Double): Double =
    when (band) { ZoomBand.FAR -> far; ZoomBand.MID -> mid; ZoomBand.NEAR -> near }

fun subwayLineWidth(kind: SubwayLineKind, band: ZoomBand): Double = when (kind) {
    SubwayLineKind.BUS_FREQUENT -> pick(band, 3.5, 5.0, 6.0)
    SubwayLineKind.BUS_LOCAL -> pick(band, 2.5, 3.5, 4.5)
    SubwayLineKind.RAIL -> pick(band, 4.5, 6.0, 7.0)
    SubwayLineKind.TRUNK -> pick(band, 5.5, 8.0, 10.0)
}

/** Added to the line's width, half each side. High contrast adds one more. */
fun subwayCasing(band: ZoomBand, highContrast: Boolean = false): Double =
    pick(band, 2.0, 3.0, 4.0) + (if (highContrast) 1 else 0)

fun subwayGap(band: ZoomBand): Double = pick(band, 0.0, 1.5, 2.0)

/** One side-by-side step. Zero at far: every `off` is read as 0 and shared streets are drawn on the centre. */
fun subwayStep(band: ZoomBand): Double =
    if (band == ZoomBand.FAR) 0.0 else subwayLineWidth(SubwayLineKind.BUS_FREQUENT, band) + subwayGap(band)

/** The bike lanes' double line: two strokes of `first`, `second` apart. At far it is one 1.5 dp line. */
fun subwayBikeLine(band: ZoomBand): Pair<Double, Double> = when (band) {
    ZoomBand.FAR -> 1.5 to 0.0
    ZoomBand.MID -> 1.25 to 2.0
    ZoomBand.NEAR -> 1.5 to 2.5
}

/** Corner radius, badge spacing and simplification tolerance per band (sections 6 and 7.5). */
fun subwayCornerRadius(band: ZoomBand): Double = pick(band, 6.0, 10.0, 14.0)
fun subwayBadgeSpacingMeters(band: ZoomBand): Double = pick(band, 8000.0, 3000.0, 1200.0)
fun subwaySimplifyMeters(band: ZoomBand): Double = pick(band, 30.0, 10.0, 0.0)

/** Pills and terminal rings (7.4). High contrast: rings + 0.5. */
fun subwayPillHeight(hub: Boolean, band: ZoomBand): Double =
    if (hub) (if (band == ZoomBand.NEAR) 14.0 else 12.0) else (if (band == ZoomBand.NEAR) 11.0 else 9.0)

fun subwayPillRing(hub: Boolean, highContrast: Boolean): Double = (if (hub) 2.5 else 2.0) + (if (highContrast) 0.5 else 0.0)
fun subwayTerminalRadius(band: ZoomBand): Double = if (band == ZoomBand.NEAR) 7.5 else 6.0
fun subwayTerminalRing(highContrast: Boolean): Double = 3.0 + (if (highContrast) 0.5 else 0.0)

// ---- style resolution ------------------------------------------------------------------------------------------------

/** A shape that carries identity without colour (WCAG 1.4.1). */
sealed class TransitInlay {
    /** SMART: a `fill` stroke down the centre, a third of the line. */
    data class Stripe(val width: Double) : TransitInlay()

    /** QLINE: `fill` ties across the line, butt caps. */
    data class Ties(val width: Double, val dash: List<Double>) : TransitInlay()

    /** People Mover: "›" every so many dp along the loop, pointing the way it runs. */
    data class Chevrons(val every: Double, val arm: Double, val width: Double) : TransitInlay()

    /** Bike lanes: two thin strokes rather than one. */
    data class DoubleLine(val gap: Double) : TransitInlay()
}

sealed class TransitMarker {
    data class Station(val radius: Double, val ring: Double) : TransitMarker()

    /** MoGo: a rounded square in `bike` with a `fill` ring and a `fill` dot. */
    data class Dock(val size: Double, val corner: Double, val ring: Double, val dot: Double) : TransitMarker()

    /** Amtrak: a `fill` square ringed in `rail`, with a bar across it. */
    data class RailStation(val size: Double, val corner: Double, val ring: Double, val barWidth: Double, val barHeight: Double) : TransitMarker()

    /** Intercity coach: a `fill` diamond with a dashed `coach` ring. */
    data class Coach(val across: Double, val ring: Double, val dash: List<Double>) : TransitMarker()

    /** Park and ride: a `pr` rounded square with a bold P in `fill`. */
    data class Parking(val size: Double, val corner: Double, val letter: Double) : TransitMarker()
}

data class TransitBadge(val text: String, val fill: TransitToken, val height: Double, val fontSize: Double)

/** `standard`: exactly what MapLayers.kt has always answered, and nothing else. */
data class StandardDrawing(val style: MapLayerStyle, val lineWidth: Double, val stopRadius: Double)

data class SubwayDrawing(
    val stroke: TransitToken? = null,
    val strokeRGB: RGB? = null,
    val width: Double = 0.0,
    val casing: TransitToken? = null,
    val casingWidth: Double = 0.0,
    val inlay: TransitInlay? = null,
    val marker: TransitMarker? = null,
    /** From which band the marker is drawn at all. */
    val markerFrom: ZoomBand = ZoomBand.MID,
    val badge: TransitBadge? = null,
    /** True when the badge is drawn in this band without the route being selected (far: rail and frequent only). */
    val badgeShown: Boolean = false,
)

sealed class ResolvedTransit {
    data class Standard(val drawing: StandardDrawing) : ResolvedTransit()
    data class Subway(val drawing: SubwayDrawing) : ResolvedTransit()
}

/** [layer] is the layer's id as the bundle names it: "ddot_routes", not "go:ddot_routes". */
class TransitStyleInput(
    val style: MapStyle,
    val layer: String,
    val route: NetRoute? = null,
    val metersPerPoint: Double,
    band: ZoomBand? = null,
    val scheme: MapScheme = MapScheme.LIGHT,
    val highContrast: Boolean = false,
) {
    val band: ZoomBand = band ?: zoomBand(metersPerPoint)
}

/**
 * Which colour a route wears. **Read from the data**: `tone` is decided in the pipeline so three clients cannot
 * disagree. Rail and the People Mover are fixed. The agency's own `color` is carried in the file and not used.
 */
fun routeColour(layer: String, route: NetRoute?): TransitToken = when (layer) {
    "qline" -> TransitToken.RAIL
    "people_mover" -> TransitToken.DPM
    else -> TransitToken.tone(route?.tone ?: 0)
}

/** What a badge says: the short name; the first ten characters of the long one when there is none; "FAST 461" at near. */
fun badgeText(layer: String, route: NetRoute, band: ZoomBand): String {
    val short = route.short.ifEmpty { route.long.take(10) }
    return if (layer == "smart_routes" && route.frequent && band == ZoomBand.NEAR) "FAST $short" else short
}

/** style × layer × route × zoom band × colour scheme × high contrast → stroke, casing, marker, inlay, badge. */
fun resolveTransitStyle(i: TransitStyleInput): ResolvedTransit {
    if (i.style == MapStyle.STANDARD) {
        // Nothing below this line is reached: no route, no band, no scheme, no net data.
        val s = mapLayerStyle("go:" + i.layer)
        return ResolvedTransit.Standard(
            StandardDrawing(s, mapLayerLineWidth(s, i.metersPerPoint), mapStopRadius(s.dense, i.metersPerPoint)),
        )
    }
    val band = i.band
    val more = i.highContrast
    fun rgb(t: TransitToken) = TransitPalette.color(t, i.scheme, more)
    fun badge(route: NetRoute?, t: TransitToken, always: Boolean): Pair<TransitBadge?, Boolean> {
        if (route == null) return null to false
        val b = TransitBadge(
            badgeText(i.layer, route, band), t,
            if (band == ZoomBand.NEAR) 18.0 else 16.0, if (band == ZoomBand.NEAR) 12.0 else 11.0,
        )
        return b to (band != ZoomBand.FAR || always || route.frequent)
    }
    val ringExtra = if (more) 0.5 else 0.0
    val d: SubwayDrawing = when (i.layer) {
        "ddot_routes", "smart_routes" -> {
            val t = routeColour(i.layer, i.route)
            val w = subwayLineWidth(if (i.route?.frequent == true) SubwayLineKind.BUS_FREQUENT else SubwayLineKind.BUS_LOCAL, band)
            val (b, shown) = badge(i.route, t, false)
            SubwayDrawing(
                stroke = t, strokeRGB = rgb(t), width = w, casing = TransitToken.FILL,
                casingWidth = w + subwayCasing(band, more),
                inlay = if (i.layer == "smart_routes" && band != ZoomBand.FAR) TransitInlay.Stripe(w / 3) else null,
                badge = b, badgeShown = shown,
            )
        }
        "qline" -> {
            val w = subwayLineWidth(SubwayLineKind.RAIL, band)
            val (b, shown) = badge(i.route, TransitToken.RAIL, true)
            SubwayDrawing(
                stroke = TransitToken.RAIL, strokeRGB = rgb(TransitToken.RAIL), width = w, casing = TransitToken.FILL,
                casingWidth = w + subwayCasing(band, more),
                inlay = TransitInlay.Ties(max(1.5, w - 3), listOf(1.2 * w, 1.8 * w)),
                marker = TransitMarker.Station(4.5, 2 + ringExtra), badge = b, badgeShown = shown,
            )
        }
        "people_mover" -> {
            val w = subwayLineWidth(SubwayLineKind.RAIL, band)
            val (b, shown) = badge(i.route, TransitToken.DPM, true)
            SubwayDrawing(
                stroke = TransitToken.DPM, strokeRGB = rgb(TransitToken.DPM), width = w, casing = TransitToken.FILL,
                casingWidth = w + subwayCasing(band, more),
                inlay = if (band != ZoomBand.FAR) TransitInlay.Chevrons(if (band == ZoomBand.MID) 90.0 else 120.0, 5.0, 1.75) else null,
                marker = TransitMarker.Station(4.5, 2 + ringExtra), badge = b, badgeShown = shown,
            )
        }
        "ddot_stops", "smart_stops" -> SubwayDrawing(
            stroke = TransitToken.RING, strokeRGB = rgb(TransitToken.RING),
            marker = TransitMarker.Station(3.0, 1.5 + ringExtra), markerFrom = ZoomBand.NEAR,
        )
        "bike_lanes" -> {
            val (stroke, gap) = subwayBikeLine(band)
            SubwayDrawing(
                stroke = TransitToken.BIKE, strokeRGB = rgb(TransitToken.BIKE), width = stroke,
                inlay = if (gap > 0) TransitInlay.DoubleLine(gap) else null,
            )
        }
        "mogo" -> SubwayDrawing(
            stroke = TransitToken.BIKE, strokeRGB = rgb(TransitToken.BIKE),
            marker = TransitMarker.Dock(if (band == ZoomBand.NEAR) 11.0 else 9.0, 2.5, 1.5, 1.5),
        )
        "stations" -> SubwayDrawing(
            stroke = TransitToken.RAIL, strokeRGB = rgb(TransitToken.RAIL),
            marker = TransitMarker.RailStation(if (band == ZoomBand.NEAR) 13.0 else 11.0, 1.5, 2.5, 7.0, 2.0),
        )
        "intercity_bus" -> SubwayDrawing(
            stroke = TransitToken.COACH, strokeRGB = rgb(TransitToken.COACH),
            marker = TransitMarker.Coach(if (band == ZoomBand.NEAR) 12.0 else 10.0, 2.0, listOf(3.0, 2.0)),
        )
        "park_ride" -> SubwayDrawing(
            stroke = TransitToken.PR, strokeRGB = rgb(TransitToken.PR), marker = TransitMarker.Parking(14.0, 3.0, 10.0),
        )
        else -> SubwayDrawing(stroke = TransitToken.TR5, strokeRGB = rgb(TransitToken.TR5))
    }
    return ResolvedTransit.Subway(d)
}

/**
 * The network files this style and these switched-on layers need. **Empty in `standard`, always.**
 * A stops layer's small file is wanted when that layer is on, or when a route of its network is selected.
 */
fun netFilesWanted(
    style: MapStyle,
    layersOn: List<String>,
    available: Map<String, String>,
    alsoStopsOf: String? = null,
): Map<String, String> {
    if (style != MapStyle.SUBWAY) return emptyMap()
    return available.filter { (layer, _) -> layersOn.contains("go:$layer") || layer == alsoStopsOf }
}

/**
 * How one layer is actually drawn this frame. `subway` needs the layer's network file **held**; while it is still
 * coming, or when it could not be read, was refused or failed its checksum, the layer goes on drawing `standard`
 * (and the layers screen says so). A held file never changes what `standard` draws.
 */
fun drawnStyle(chosen: MapStyle, netHeld: Boolean): MapStyle =
    if (chosen == MapStyle.SUBWAY && netHeld) MapStyle.SUBWAY else MapStyle.STANDARD

// ---- the network files -----------------------------------------------------------------------------------------------

data class NetEnd(val x: Double, val y: Double, val name: String)

data class NetRoute(
    val id: String,
    val short: String,
    val long: String,
    val tone: Int,
    /** The agency's own colours, where its feed publishes them. Carried, not drawn (section 4.2). */
    val color: String? = null,
    val text: String? = null,
    val frequent: Boolean = false,
    /** The agency's published weekday figure, in minutes. Worded as theirs, never as live. */
    val headway: Int? = null,
    val loop: Boolean = false,
    /** True when the line is a drawing through the stations rather than the owner's own track (the QLINE). */
    val derived: Boolean = false,
    val lines: List<Int> = emptyList(),
    val stops: List<List<Int>> = emptyList(),
    val ends: List<NetEnd> = emptyList(),
) {
    /** "4 Woodward", and "QLINE" rather than "QLINE QLINE". */
    val label: String
        get() = when {
            short.isEmpty() -> long
            long.isEmpty() || long.equals(short, ignoreCase = true) -> short
            else -> "$short $long"
        }

    /** How many different stops the route calls at, both directions together. */
    val stopCount: Int get() = stops.flatten().toSet().size
}

/** One stretch of a line: from this vertex, drawn `off` half-steps to the left, shared by `n` routes. */
data class NetRun(val from: Int, val off: Int, val n: Int) {
    /** More than four routes on one street is a trunk: drawn once, in the trunk colour, on the centre. */
    val isTrunk: Boolean get() = n > 4
}

class NetLine(val route: Int, val points: DoubleArray, val runs: List<NetRun>) {
    val box: MapBox = MapBox.around(points)
}

/** [ax]…[by] are the two ends of the pill, in map units. */
data class NetInterchange(
    val x: Double, val y: Double, val name: String, val routes: List<Int>,
    val ax: Double, val ay: Double, val bx: Double, val by: Double,
)

data class NetTrunk(val x: Double, val y: Double, val routes: List<Int>)

/** A whole `<routes>` network file, decoded. It stands on its own: the subway lines are drawn from this alone. */
class TransitNet(
    val id: String,
    val system: String,
    val agency: String,
    val agencyUrl: String?,
    val stopsLayer: String,
    val routes: List<NetRoute>,
    val lines: List<NetLine>,
    val interchanges: List<NetInterchange>,
    val trunks: List<NetTrunk>,
    /** Rail files fold the stops file in: `serves[i]` belongs to `points[i]` of the standard layer. */
    val serves: List<List<Int>>?,
)

/** A `<stops>` network file: which routes call at each stop of the unchanged stops layer. */
class TransitServes(val id: String, val routesLayer: String, val routeIds: List<String>, val serves: List<List<Int>>)

/** A place where stations of different systems are a short walk apart (`places/transit.json` `hubs`). */
data class TransitHub(
    val x: Double, val y: Double,
    val ax: Double, val ay: Double, val bx: Double, val by: Double,
    val name: String,
    val layers: List<String>,
    /** layer to station name: for the card's words, never for placing anything. */
    val stops: List<Pair<String, String>>,
) {
    val id: String get() = "hub:$name"

    /** Drawn when two or more of its layers are on. */
    fun shows(layersOn: List<String>): Boolean = layers.count { layersOn.contains("go:$it") } >= 2
}

class NetFileException(val reason: String, val version: Int? = null) : RuntimeException(
    if (version != null) "network file format $version is not one this app reads" else "network file is $reason",
)

class TransitExtras(val netFiles: Map<String, String>, val hubs: List<TransitHub>)

object NetFileDecoder {

    /**
     * Only for a bundle from before hubs carried their own `origin` (2026-09-21): the transit grid every transit
     * layer uses (pipeline/src/ingest-transit.ts `ORIGIN`). A hub that says its origin is placed by what it says.
     */
    val transitOrigin = doubleArrayOf(-83.32, 42.22)

    private fun ux(x: Int, o: DoubleArray) = MapProjection.x(o[0] + x / 1e5)
    private fun uy(y: Int, o: DoubleArray) = MapProjection.y(o[1] + y / 1e5)
    private fun ints(j: Json?): List<Int> = (j?.arr ?: emptyList()).map { it.int ?: 0 }
    private fun doubles(j: Json?): DoubleArray = (j?.arr ?: emptyList()).map { it.num ?: 0.0 }.toDoubleArray()

    private fun versioned(data: ByteArray): Json {
        val f = try { Json.parse(data) } catch (t: Throwable) { throw NetFileException("unreadable") }
        val v = f["v"]?.int ?: 0
        if (v != 2) throw NetFileException("unsupported", v)
        return f
    }

    /**
     * A routes network. A file that is not format 2 is refused, and the layer goes on drawing `standard`.
     * Anything that points outside the file (a route naming a line that is not there) is dropped, never trusted.
     */
    fun net(data: ByteArray): TransitNet {
        val f = versioned(data)
        val origin = doubles(f["origin"])
        val fileLines = f["lines"]
        val fileRoutes = f["routes"]
        if (origin.size < 2 || fileLines !is Json.Arr || fileRoutes !is Json.Arr) throw NetFileException("malformed")
        val names = f.strings("names")
        fun name(i: Int): String = if (i < 0 || i >= names.size) "" else names[i]

        val owner = IntArray(fileLines.items.size) { -1 }
        val routes = fileRoutes.items.mapIndexed { ri, r ->
            val mine = ints(r["lines"]).filter { it >= 0 && it < fileLines.items.size }
            for (l in mine) owner[l] = ri
            val ends = (r["ends"]?.arr ?: emptyList()).mapNotNull { e ->
                val a = ints(e)
                if (a.size < 3) null else NetEnd(ux(a[0], origin), uy(a[1], origin), name(a[2]))
            }
            NetRoute(
                id = r["id"]?.str ?: throw NetFileException("malformed"),
                short = r["short"]?.str ?: "", long = r["long"]?.str ?: "", tone = r["tone"]?.int ?: 0,
                color = r["color"]?.str, text = r["text"]?.str, frequent = r["frequent"]?.bool ?: false,
                headway = r["headway"]?.int, loop = r["loop"]?.bool ?: false, derived = r["derived"]?.bool ?: false,
                lines = mine, stops = (r["stops"]?.arr ?: emptyList()).map { ints(it) }, ends = ends,
            )
        }
        val allRuns = f["runs"]?.arr ?: emptyList()
        val lines = fileLines.items.mapIndexed { li, l ->
            val pts = MapFileDecoder.polyline(ints(l.arr.getOrNull(1)).toIntArray(), origin)
            val count = pts.size / 2
            val runs = ArrayList<NetRun>()
            val flat = ints(allRuns.getOrNull(li))
            var k = 0
            while (k + 2 < flat.size) {
                val from = max(0, min(count - 1, flat[k]))
                if (runs.isEmpty() || from > runs[runs.size - 1].from) runs.add(NetRun(from, flat[k + 1], flat[k + 2]))
                k += 3
            }
            if (runs.isEmpty() || runs[0].from != 0) runs.add(0, NetRun(0, 0, 1))
            NetLine(owner[li], pts, runs)
        }
        val interchanges = (f["interchanges"]?.arr ?: emptyList()).mapNotNull { c ->
            val a = c.arr
            if (a.size < 4) return@mapNotNull null
            val x = a[0].int ?: 0
            val y = a[1].int ?: 0
            val span = ints(a.getOrNull(4)).let { if (it.size >= 4) it else listOf(0, 0, 0, 0) }
            NetInterchange(
                ux(x, origin), uy(y, origin), name(a[2].int ?: -1),
                ints(a[3]).filter { it >= 0 && it < routes.size },
                ux(x + span[0], origin), uy(y + span[1], origin), ux(x + span[2], origin), uy(y + span[3], origin),
            )
        }
        val trunks = (f["trunks"]?.arr ?: emptyList()).mapNotNull { t ->
            val a = t.arr
            if (a.size < 3) null
            else NetTrunk(ux(a[0].int ?: 0, origin), uy(a[1].int ?: 0, origin), ints(a[2]).filter { it >= 0 && it < routes.size })
        }
        return TransitNet(
            id = f["id"]?.str ?: "", system = f["system"]?.str ?: "", agency = f["agency"]?.str ?: "",
            agencyUrl = f["agency_url"]?.str, stopsLayer = f["stops_layer"]?.str ?: "",
            routes = routes, lines = lines, interchanges = interchanges, trunks = trunks,
            serves = (f["serves"] as? Json.Arr)?.items?.map { ints(it) },
        )
    }

    /** A stops network's small file. */
    fun netServes(data: ByteArray): TransitServes {
        val f = versioned(data)
        val serves = f["serves"] as? Json.Arr ?: throw NetFileException("malformed")
        val ids = f["route_ids"] as? Json.Arr ?: throw NetFileException("malformed")
        val id = f["id"]?.str ?: ""
        return TransitServes(id, f["routes_layer"]?.str ?: id, ids.items.mapNotNull { it.str }, serves.items.map { ints(it) })
    }

    /**
     * What `places/transit.json` says about the subway style: which layers carry a format-2 network file, and the
     * hubs. An old bundle has neither, and the "Map style" control is then not offered at all.
     *
     * [stationsByLayer] is only for a hub with no `origin` of its own (a bundle from before 2026-09-21): it is then
     * found by the names of its stations among the layers that are held, as the web does, and failing that on the
     * transit grid.
     */
    fun transitExtras(data: ByteArray, stationsByLayer: Map<String, List<MapPoint>> = emptyMap()): TransitExtras {
        val f = try { Json.parse(data) } catch (_: Throwable) { return TransitExtras(emptyMap(), emptyList()) }
        val files = LinkedHashMap<String, String>()
        for (l in f["layers"]?.arr ?: emptyList()) {
            val id = l["id"]?.str ?: continue
            val net = l["net"] ?: continue
            val file = net["file"]?.str ?: continue
            if (net["v"]?.int == 2) files[id] = file
        }
        val hubs = (f["hubs"]?.arr ?: emptyList()).mapNotNull { h ->
            val at = ints(h["at"])
            val span = ints(h["span"])
            val name = h["name"]?.str ?: return@mapNotNull null
            if (at.size < 2 || span.size < 4) return@mapNotNull null
            val stops = (h["stops"]?.arr ?: emptyList()).mapNotNull { s ->
                val layer = s["layer"]?.str
                val station = s["name"]?.str
                if (layer == null || station == null) null else layer to station
            }
            val layers = h.strings("layers")
            val said = doubles(h["origin"])
            if (said.size < 2) {
                hubByName(name, layers, stops, stationsByLayer)?.let { return@mapNotNull it }
            }
            val o = if (said.size >= 2) said else transitOrigin
            TransitHub(
                ux(at[0], o), uy(at[1], o),
                ux(at[0] + span[0], o), uy(at[1] + span[1], o), ux(at[0] + span[2], o), uy(at[1] + span[3], o),
                name, layers, stops,
            )
        }
        return TransitExtras(files, hubs)
    }

    /** The old-bundle fallback: the closest pair of the hub's named stations in different layers, within 400 m. */
    private fun hubByName(
        name: String, layers: List<String>, stops: List<Pair<String, String>>, held: Map<String, List<MapPoint>>,
    ): TransitHub? {
        val found = stops.map { (layer, station) -> (held[layer] ?: emptyList()).filter { it.name == station } }
        var best: Pair<MapPoint, MapPoint>? = null
        var gap = Double.POSITIVE_INFINITY
        for (i in found.indices) for (j in i + 1 until found.size) for (p in found[i]) for (q in found[j]) {
            val d = Math.hypot(p.x - q.x, p.y - q.y)
            if (d < gap) { gap = d; best = p to q }
        }
        val pair = best ?: return null
        if (gap * MapProjection.METERS_PER_UNIT > 400) return null
        val (a, b) = pair
        return TransitHub((a.x + b.x) / 2, (a.y + b.y) / 2, a.x, a.y, b.x, b.y, name, layers, stops)
    }
}

// ---- geometry (section 6) --------------------------------------------------------------------------------------------

/** A drawing instruction in map units. `Quad` is `Path.quadTo` / `addQuadCurve` / `quadraticCurveTo`. */
sealed class PathCommand {
    data class Move(val x: Double, val y: Double) : PathCommand()
    data class Line(val x: Double, val y: Double) : PathCommand()
    data class Quad(val cx: Double, val cy: Double, val x: Double, val y: Double) : PathCommand()
}

object SubwayGeometry {

    /** Douglas–Peucker over a flat run of x, y pairs. [tolerance] is in the same units as the points. */
    fun simplify(pts: DoubleArray, tolerance: Double): DoubleArray {
        val n = pts.size / 2
        if (tolerance <= 0 || n <= 2) return pts
        val keep = BooleanArray(n)
        keep[0] = true; keep[n - 1] = true
        val stack = ArrayList<IntArray>()
        stack.add(intArrayOf(0, n - 1))
        while (stack.isNotEmpty()) {
            val (a, b) = stack.removeAt(stack.size - 1)
            if (b <= a + 1) continue
            var far = -1
            var best = tolerance
            for (i in a + 1 until b) {
                val d = MapHit.distanceToSegment(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1])
                if (d > best) { best = d; far = i }
            }
            if (far >= 0) {
                keep[far] = true
                stack.add(intArrayOf(a, far)); stack.add(intArrayOf(far, b))
            }
        }
        val out = DoubleArray(keep.count { it } * 2)
        var w = 0
        for (i in 0 until n) if (keep[i]) { out[w] = pts[2 * i]; out[w + 1] = pts[2 * i + 1]; w += 2 }
        return out
    }

    /** A line cut into its runs, each simplified **on its own** so that run boundaries survive. */
    class PreparedRun(val off: Int, val n: Int, val points: DoubleArray) {
        val isTrunk: Boolean get() = n > 4
    }

    fun prepare(line: NetLine, band: ZoomBand): List<PreparedRun> {
        val tol = subwaySimplifyMeters(band) / MapProjection.METERS_PER_UNIT
        val count = line.points.size / 2
        val out = ArrayList<PreparedRun>()
        for ((i, r) in line.runs.withIndex()) {
            val to = if (i + 1 < line.runs.size) line.runs[i + 1].from else count - 1
            if (to <= r.from) continue
            out.add(PreparedRun(r.off, r.n, simplify(line.points.copyOfRange(2 * r.from, 2 * to + 2), tol)))
        }
        return out
    }

    /**
     * A run shifted sideways by [offset] (same units as the points), to the **left of its own direction of travel
     * with north up**. y grows downwards here as on a screen, so for a direction (dx, dy) left is (dy, −dx). Inside
     * the run a vertex moves along the mitre of its two normals, never more than twice as far.
     */
    fun offsetRun(pts: DoubleArray, offset: Double): DoubleArray {
        val n = pts.size / 2
        if (offset == 0.0 || n < 2) return pts
        // Unit normals per segment; a zero-length segment borrows its neighbour's.
        val nx = DoubleArray(n - 1)
        val ny = DoubleArray(n - 1)
        var have = false
        var lx = 0.0
        var ly = 0.0
        for (i in 0 until n - 1) {
            val dx = pts[2 * i + 2] - pts[2 * i]
            val dy = pts[2 * i + 3] - pts[2 * i + 1]
            val len = sqrt(dx * dx + dy * dy)
            if (len > 0) { lx = dy / len; ly = -dx / len; have = true }
            if (have) { nx[i] = lx; ny[i] = ly }
        }
        val first = (0 until n - 1).firstOrNull { nx[it] != 0.0 || ny[it] != 0.0 } ?: return pts
        for (i in 0 until first) { nx[i] = nx[first]; ny[i] = ny[first] }
        val out = DoubleArray(n * 2)
        for (i in 0 until n) {
            val ix = if (i == 0) nx[0] else nx[i - 1]
            val iy = if (i == 0) ny[0] else ny[i - 1]
            val ox = if (i == n - 1) nx[n - 2] else nx[i]
            val oy = if (i == n - 1) ny[n - 2] else ny[i]
            var mx = ix + ox
            var my = iy + oy
            val ml = sqrt(mx * mx + my * my)
            if (ml < 1e-12) { mx = ox; my = oy } else { mx /= ml; my /= ml }
            val k = offset / max(0.5, mx * ox + my * oy)
            out[2 * i] = pts[2 * i] + mx * k
            out[2 * i + 1] = pts[2 * i + 1] + my * k
        }
        return out
    }

    /**
     * Round every corner with one quadratic curve: line to P − r·t_in, then a quad through P to P + r·t_out,
     * r = min(R, half of each neighbouring segment). A turn under 8° is left alone. A closed line (the People
     * Mover) starts half-way along its first segment, so the corner where it closes is rounded like the rest.
     */
    fun roundCorners(input: DoubleArray, radius: Double, closed: Boolean = false): List<PathCommand> {
        var pts = ArrayList<Double>(input.size)
        var i = 0
        while (i + 1 < input.size) {                                 // drop repeats: a repeat has no direction
            if (pts.size < 2 || pts[pts.size - 2] != input[i] || pts[pts.size - 1] != input[i + 1]) {
                pts.add(input[i]); pts.add(input[i + 1])
            }
            i += 2
        }
        var n = pts.size / 2
        if (n < 2) return emptyList()
        if (closed && n >= 4 && pts[0] == pts[pts.size - 2] && pts[1] == pts[pts.size - 1]) {
            val mx = (pts[0] + pts[2]) / 2
            val my = (pts[1] + pts[3]) / 2
            val turned = ArrayList<Double>(pts.size + 2)
            turned.add(mx); turned.add(my)
            turned.addAll(pts.subList(2, pts.size))
            turned.add(mx); turned.add(my)
            pts = turned
            n = pts.size / 2
        }
        val out = ArrayList<PathCommand>(n + 2)
        out.add(PathCommand.Move(pts[0], pts[1]))
        val minTurn = cos(8 * Math.PI / 180)
        for (v in 1 until n - 1) {
            val px = pts[2 * v]
            val py = pts[2 * v + 1]
            if (radius <= 0) { out.add(PathCommand.Line(px, py)); continue }
            var ix = px - pts[2 * v - 2]
            var iy = py - pts[2 * v - 1]
            var ox = pts[2 * v + 2] - px
            var oy = pts[2 * v + 3] - py
            val il = sqrt(ix * ix + iy * iy)
            val ol = sqrt(ox * ox + oy * oy)
            ix /= il; iy /= il; ox /= ol; oy /= ol
            if (ix * ox + iy * oy > minTurn) { out.add(PathCommand.Line(px, py)); continue }
            val r = min(radius, min(il / 2, ol / 2))
            out.add(PathCommand.Line(px - r * ix, py - r * iy))
            out.add(PathCommand.Quad(px, py, px + r * ox, py + r * oy))
        }
        out.add(PathCommand.Line(pts[2 * n - 2], pts[2 * n - 1]))
        return out
    }

    /**
     * One line, ready to draw at one scale: the route's own stretches (offset, joined across run boundaries by a
     * short diagonal, never a gap) and its trunk stretches (on the centre, drawn once in the trunk colour).
     * [own] and [trunk] are the polylines as drawn, for hit-testing against what a person actually sees.
     */
    class BuiltLine(
        val route: Int,
        val box: MapBox,
        val own: List<DoubleArray>,
        val trunk: List<DoubleArray>,
        val ownCommands: List<PathCommand>,
        val trunkCommands: List<PathCommand>,
    )

    /**
     * [step] and [radius] are in map units (dp ÷ scale): the device does no bearing logic, it only reads `off` and
     * shifts left by `off × step / 2`.
     */
    fun build(route: Int, runs: List<PreparedRun>, step: Double, radius: Double, closed: Boolean): BuiltLine {
        val own = ArrayList<DoubleArray>()
        val trunk = ArrayList<DoubleArray>()
        var open = ArrayList<Double>()
        fun flush() {
            if (open.size >= 4) own.add(open.toDoubleArray())
            open = ArrayList()
        }
        for ((i, r) in runs.withIndex()) {
            if (r.isTrunk) {
                // The route's own stroke runs on to the trunk's first point, so there is never a gap under it.
                if (open.isNotEmpty() && r.points.size >= 2) { open.add(r.points[0]); open.add(r.points[1]) }
                flush()
                trunk.add(r.points)
                if (i + 1 < runs.size && !runs[i + 1].isTrunk && r.points.size >= 2) {
                    open.add(r.points[r.points.size - 2]); open.add(r.points[r.points.size - 1])
                }
            } else {
                for (v in offsetRun(r.points, r.off * step / 2)) open.add(v)
            }
        }
        flush()
        val isLoop = closed && own.size == 1 && trunk.isEmpty()
        var box = MapBox.EMPTY
        for (l in own) box = box.union(MapBox.around(l))
        for (l in trunk) box = box.union(MapBox.around(l))
        return BuiltLine(
            route, box, own, trunk,
            own.flatMap { roundCorners(it, radius, isLoop) },
            trunk.flatMap { roundCorners(it, radius) },
        )
    }

    // -- badges along a line

    /** [leftX], [leftY]: the unit normal to the left of travel; [off]: the run's, so the badge sits on the shifted line. */
    data class BadgeAnchor(val meters: Double, val x: Double, val y: Double, val leftX: Double, val leftY: Double, val off: Int)

    /**
     * Where badges go: at `spacing / 2 + k × spacing` metres from the line's start. World-anchored, so badges do
     * not swim when the map pans. An anchor inside a trunk run is skipped: a trunk has one stacked badge instead.
     */
    fun badgeAnchors(pts: DoubleArray, runs: List<NetRun>, spacingMeters: Double): List<BadgeAnchor> {
        val n = pts.size / 2
        if (n < 2 || spacingMeters <= 0) return emptyList()
        val out = ArrayList<BadgeAnchor>()
        var want = spacingMeters / 2
        var walked = 0.0
        var run = 0
        for (i in 0 until n - 1) {
            while (run + 1 < runs.size && runs[run + 1].from <= i) run++
            val dx = pts[2 * i + 2] - pts[2 * i]
            val dy = pts[2 * i + 3] - pts[2 * i + 1]
            val len = sqrt(dx * dx + dy * dy) * MapProjection.METERS_PER_UNIT
            while (len > 0 && want <= walked + len) {
                val u = (want - walked) / len
                if (!(run < runs.size && runs[run].isTrunk)) {
                    val ul = len / MapProjection.METERS_PER_UNIT
                    out.add(
                        BadgeAnchor(
                            want, pts[2 * i] + dx * u, pts[2 * i + 1] + dy * u, dy / ul, -dx / ul,
                            if (run < runs.size) runs[run].off else 0,
                        ),
                    )
                }
                want += spacingMeters
            }
            walked += len
        }
        return out
    }

    /** x, y and the direction of travel (radians). */
    data class Mark(val x: Double, val y: Double, val angle: Double)

    /** Evenly spaced places along a polyline given in **screen dp**, with the direction of travel at each: the chevrons. */
    fun marksAlong(pts: DoubleArray, every: Double): List<Mark> {
        if (every <= 0) return emptyList()
        val out = ArrayList<Mark>()
        var want = every / 2
        var walked = 0.0
        var i = 0
        while (i + 3 < pts.size) {
            val dx = pts[i + 2] - pts[i]
            val dy = pts[i + 3] - pts[i + 1]
            val len = sqrt(dx * dx + dy * dy)
            while (len > 0 && want <= walked + len) {
                val u = (want - walked) / len
                out.add(Mark(pts[i] + dx * u, pts[i + 1] + dy * u, atan2(dy, dx)))
                want += every
            }
            walked += len
            i += 2
        }
        return out
    }

    /** The place on a flat run of x, y pairs nearest a point: x, y and the distance, or null for an empty run. */
    fun nearestOn(pts: DoubleArray, px: Double, py: Double): DoubleArray? {
        if (pts.size < 2) return null
        var best = doubleArrayOf(pts[0], pts[1], Math.hypot(pts[0] - px, pts[1] - py))
        var i = 0
        while (i + 3 < pts.size) {
            val dx = pts[i + 2] - pts[i]
            val dy = pts[i + 3] - pts[i + 1]
            val len2 = dx * dx + dy * dy
            val t = if (len2 == 0.0) 0.0 else max(0.0, min(1.0, ((px - pts[i]) * dx + (py - pts[i + 1]) * dy) / len2))
            val qx = pts[i] + t * dx
            val qy = pts[i + 1] + t * dy
            val d = Math.hypot(qx - px, qy - py)
            if (d < best[2]) best = doubleArrayOf(qx, qy, d)
            i += 2
        }
        return best
    }
}

// ---- a whole network, prepared once ------------------------------------------------------------------------------------

/**
 * What the painter needs from one network file: each band's simplified runs and badge anchors, worked out once
 * (off the main thread, MapModel.loadNet) when the file is decoded, never per frame.
 */
class PreparedNet(val net: TransitNet) {
    val runs: Map<ZoomBand, List<List<SubwayGeometry.PreparedRun>>> =
        ZoomBand.values().associateWith { band -> net.lines.map { SubwayGeometry.prepare(it, band) } }

    /** Badges ride along a route's FIRST line only. */
    val anchors: Map<ZoomBand, List<List<SubwayGeometry.BadgeAnchor>>> =
        ZoomBand.values().associateWith { band ->
            net.routes.map { r ->
                val line = r.lines.firstOrNull()?.let { net.lines.getOrNull(it) }
                if (line == null) emptyList()
                else SubwayGeometry.badgeAnchors(line.points, line.runs, subwayBadgeSpacingMeters(band))
            }
        }

    /** Every line at one scale. [scale] is dp per map unit. A line no route owns is not drawn. */
    fun built(band: ZoomBand, scale: Double): List<SubwayGeometry.BuiltLine> {
        val step = subwayStep(band) / scale
        val radius = subwayCornerRadius(band) / scale
        val prepared = runs.getValue(band)
        return net.lines.indices.mapNotNull { li ->
            val line = net.lines[li]
            if (line.route < 0 || line.route >= net.routes.size) null
            else SubwayGeometry.build(line.route, prepared[li], step, radius, net.routes[line.route].loop)
        }
    }
}

/**
 * The scale a geometry cache is keyed on: an eighth of an octave (a ladder step of 2^(1/8) ≈ 9 %, inside the spec's
 * 15 %), so a drag (one scale) reuses every path and a pinch rebuilds them a few times rather than every frame.
 * Offsets and radii are then within 4.5 % of exact, and exact on a step.
 */
fun subwayScaleBucket(scale: Double): Int = (ln(max(scale, 1e-9)) / ln(2.0) * 8).roundToInt()
fun subwayBucketScale(bucket: Int): Double = 2.0.pow(bucket / 8.0)

// ---- what is drawn at which zoom ---------------------------------------------------------------------------------------

data class StationPlan(
    val hubs: Boolean = true,
    val terminals: Boolean = false,
    /** Interchanges of at least this many routes; 0 means none. */
    val interchangeMinRoutes: Int = 0,
    val railStations: Boolean = false,
    val markers: Boolean = false,
    /** Every stop of a stops layer that is on. */
    val stops: Boolean = false,
    /** The selected route's own stops. */
    val selectedStops: Boolean = false,
    val terminalNames: Boolean = false,
    val railStationNames: Boolean = false,
)

fun stationsFor(band: ZoomBand, metersPerPoint: Double, hasSelection: Boolean): StationPlan {
    if (band == ZoomBand.FAR) return StationPlan()
    return StationPlan(
        terminals = true, railStations = true, markers = true,
        interchangeMinRoutes = if (band == ZoomBand.MID) 3 else 2,
        selectedStops = hasSelection,
        stops = band == ZoomBand.NEAR,
        terminalNames = band == ZoomBand.NEAR,
        railStationNames = metersPerPoint <= 6,
    )
}

/** Caps a frame (section 12). */
const val SUBWAY_BADGE_CAP = 24
const val SUBWAY_NAME_CAP = 12
const val SUBWAY_STOP_CAP = 400
const val SUBWAY_PILL_CAP = 120

/**
 * A station's two platforms carry one name between them (the QLINE lists each station twice): true for the first
 * of each name, false for a repeat. Both circles are drawn; the name is printed — and read out — once.
 */
fun firstOfEachName(names: List<String>): List<Boolean> {
    val said = HashSet<String>()
    return names.map { it.isNotEmpty() && said.add(it) }
}

// ---- badges: who gets one of the 24 ------------------------------------------------------------------------------------

/** Centre and size, in dp. */
data class LabelRect(val x: Double, val y: Double, val width: Double, val height: Double) {
    fun overlaps(o: LabelRect, margin: Double = 2.0): Boolean =
        abs(x - o.x) * 2 < width + o.width + margin * 2 && abs(y - o.y) * 2 < height + o.height + margin * 2

    /** Does a circle touch this box? Street names claim room as rows of circles (MapView.drawNames). */
    fun touchesCircle(cx: Double, cy: Double, r: Double): Boolean {
        val dx = max(0.0, abs(cx - x) - width / 2)
        val dy = max(0.0, abs(cy - y) - height / 2)
        return dx * dx + dy * dy < r * r
    }
}

/** The settled order (docs/MAP-STYLE.md 7.5, the same on every client). The ordinal is the rank. */
enum class BadgeRank { SELECTED, RAIL, TRUNK, FREQUENT, OTHER }

/**
 * [order] is the route's place in rider order ([riderOrder]); for a trunk badge, its own number. Badges of one route
 * share one [rank] and one [order], which is how a route's badges are known to belong together.
 */
data class BadgeCandidate(
    val id: String, val text: String, val rank: BadgeRank, val order: Long, val rect: LabelRect, val distanceToCentre: Double,
)

/**
 * Rider order across networks: by the number on the front of the bus, then DDOT before SMART, then the order in
 * the file; a route with no number (QLINE, DPM) comes last. The same key the web and the iPhone use.
 */
fun riderOrder(short: String, system: String, index: Int): Long {
    val n = short.takeWhile { it in '0'..'9' }.take(9).toLongOrNull() ?: 9000L
    val sys = listOf("ddot", "smart").indexOf(system).let { if (it < 0) 2 else it }
    return n * 1_000_000L + sys * 1000L + index
}

/**
 * The order badges claim room in: every badge of the selected route first (nearest the middle first); then
 * ROUND-ROBIN — every route's first badge (its nearest to the middle) before any route's second, and so on — and
 * inside one round by rank (rail, trunk badges, frequent routes, the rest), then rider order.
 */
fun badgeOrder(candidates: List<BadgeCandidate>): List<BadgeCandidate> {
    val turn = HashMap<String, Int>()
    val seen = HashMap<String, Int>()
    for (c in candidates.sortedWith(compareBy({ it.distanceToCentre }, { it.id }))) {
        val key = "${c.rank.ordinal}|${c.order}"
        val n = seen[key] ?: 0
        turn[c.id] = if (c.rank == BadgeRank.SELECTED) 0 else n
        seen[key] = n + 1
    }
    return candidates.sortedWith(
        compareBy<BadgeCandidate>({ if (it.rank == BadgeRank.SELECTED) 0 else 1 }, { turn[it.id] ?: 0 }, { it.rank.ordinal })
            .thenBy { it.order }.thenBy { it.distanceToCentre }.thenBy { it.id },
    )
}

/**
 * **(settled) A trunk badge may be nudged** (7.3): it speaks for up to 17 routes in the busiest part of the map, so
 * it is not dropped when its anchor is taken. Vertical steps in badge-heights, and at each step horizontal shifts in
 * badge-widths, in this order; the first free spot wins.
 */
val trunkBadgeNudges: List<Pair<Double, Double>> =
    listOf(0.0, -1.5, 1.5, -3.0, 3.0, -4.5, 4.5, -6.0, 6.0, -7.5, 7.5).flatMap { dy -> listOf(0.0, -0.5, 0.5).map { dx -> dx to dy } }

/**
 * The badges that draw this frame: [badgeOrder], until 24 are PLACED. A badge that would sit on something already
 * placed ([taken]: the map's own controls, terminals, hubs, interchanges — and the badges before it) is dropped,
 * never shrunk or overlapped, and does not use up one of the 24. A trunk badge tries its nudges first, and comes
 * back with the rectangle it found.
 */
fun claimBadges(candidates: List<BadgeCandidate>, taken: List<LabelRect> = emptyList(), cap: Int = SUBWAY_BADGE_CAP): List<BadgeCandidate> {
    val placed = ArrayList(taken)
    val out = ArrayList<BadgeCandidate>()
    for (c in badgeOrder(candidates)) {
        if (out.size >= cap) break
        val tries = if (c.rank == BadgeRank.TRUNK) trunkBadgeNudges else trunkBadgeNudges.subList(0, 1)
        for ((dx, dy) in tries) {
            val rect = c.rect.copy(x = c.rect.x + dx * c.rect.width, y = c.rect.y + dy * c.rect.height)
            if (placed.any { it.overlaps(rect) }) continue
            placed.add(rect)
            out.add(if (rect == c.rect) c else c.copy(rect = rect))
            break
        }
    }
    return out
}

/** How wide a badge is: text width plus 5 dp each side, never narrower than it is tall. */
fun badgeWidth(textWidth: Double, height: Double, padding: Double = 5.0): Double = max(height, textWidth + padding * 2)

/** Badges and labels follow the text size, up to × 1.5. */
fun subwayTextScale(platformScale: Double): Double = max(1.0, min(1.5, platformScale))

/** A trunk's stacked badge: the members' short names in rider order, six at most, then "+N". */
fun trunkBadgeText(shorts: List<String>): String {
    val head = shorts.take(6).joinToString(" · ")
    return if (shorts.size > 6) "$head +${shorts.size - 6}" else head
}

// ---- tapping -----------------------------------------------------------------------------------------------------------

/** The ordinal is the label priority of section 8. */
enum class HitKind { SELECTED, TERMINAL, HUB, INTERCHANGE, BADGE, MARKER, STOP }

data class HitGlyph(val id: String, val kind: HitKind, val x: Double, val y: Double)

/** Android's touch target: 48 × 48 dp, however small the glyph (the iPhone's is 44 pt, the web's 44 CSS px). */
const val SUBWAY_HIT_BOX = 48.0

/** A route line answers a tap within this many dp. */
const val SUBWAY_LINE_HIT = 22.0

/** Everything whose box holds the finger, in the label priority of section 8 and then nearest first. */
fun subwayHits(x: Double, y: Double, glyphs: List<HitGlyph>, box: Double = SUBWAY_HIT_BOX): List<HitGlyph> =
    glyphs.filter { abs(it.x - x) <= box / 2 && abs(it.y - y) <= box / 2 }
        .sortedWith(compareBy({ it.kind.ordinal }, { (it.x - x) * (it.x - x) + (it.y - y) * (it.y - y) }, { it.id }))

/** The thing a tap selects. A second tap in the same place moves on to the next thing under the finger. */
fun subwayHitTest(x: Double, y: Double, glyphs: List<HitGlyph>, previous: String? = null, box: Double = SUBWAY_HIT_BOX): HitGlyph? {
    val hits = subwayHits(x, y, glyphs, box)
    if (hits.isEmpty()) return null
    val at = if (previous == null) -1 else hits.indexOfFirst { it.id == previous }
    return if (at >= 0) hits[(at + 1) % hits.size] else hits[0]
}

// ---- reading order -----------------------------------------------------------------------------------------------------

const val SUBWAY_FEATURE_CAP = 40

/**
 * Of the 40, at most this many terminals and interchanges — so that downtown, where a hundred interchanges are in
 * view, TalkBack still reaches the ROUTES. Hubs are never capped (there are four); routes take whatever room is
 * left, which is never less than 40 − 4 − 8 − 20 = 8.
 */
const val SUBWAY_TERMINAL_FEATURE_CAP = 8
const val SUBWAY_INTERCHANGE_FEATURE_CAP = 20

class FeatureOrder<T>(val items: List<T>, val more: Int)

/**
 * TalkBack's and the keyboard's order is `standard`'s order, **only ever appended to**: what was there first stays
 * first and in the same order, then hubs, terminals, interchanges (nearest the middle first — the caller sorts
 * them) and routes in rider order. At most 40 are added, of which at most 8 terminals and 20 interchanges; [more]
 * is how many the list still has.
 */
fun <T> featureOrder(
    existing: List<T>, hubs: List<T>, terminals: List<T>, interchanges: List<T>, routes: List<T>,
    cap: Int = SUBWAY_FEATURE_CAP,
): FeatureOrder<T> {
    val extra = hubs + terminals.take(SUBWAY_TERMINAL_FEATURE_CAP) + interchanges.take(SUBWAY_INTERCHANGE_FEATURE_CAP) + routes
    val all = hubs.size + terminals.size + interchanges.size + routes.size
    return FeatureOrder(existing + extra.take(cap), max(0, all - min(cap, extra.size)))
}

// ---- the owner's own trip planner ----------------------------------------------------------------------------------------

/**
 * ONE link on a route card: the owner's trip planner, the same link apps/web/src/transit.ts marks `system:` for
 * that agency (MapStyleTest reads that file and fails if these differ). The `agency_url` in the network file is the
 * fallback. Whatever comes back still goes through `Net.webLink`, which is https only — so an owner whose planner
 * is plain http (DDOT's, today) gets no link on this phone rather than an exception to the rule.
 */
val transitPlanners: Map<String, String> = mapOf(
    "ddot" to "http://myddotbus.com/map?selector=tripplanner",
    "dpm" to "https://www.thepeoplemover.com/",
    "qline" to "https://qlinedetroit.com/",
    "smart" to "https://www.smartbus.org/Schedules/Trip-Planner",
)

fun plannerLink(system: String, agencyUrl: String?): String? =
    listOfNotNull(transitPlanners[system], agencyUrl).firstNotNullOfOrNull { Net.webLink(it) }

/** A card prints `map.stop_lines`, `map.change_here` and `map.many_routes` without their list, above route buttons. */
fun sentenceWithoutList(filledWithEmptyList: String): String = filledWithEmptyList.trim().trimEnd(':', '：').trim()
