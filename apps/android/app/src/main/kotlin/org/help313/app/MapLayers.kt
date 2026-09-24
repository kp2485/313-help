// What the Map tab may draw, and what it must never draw. A port of apps/ios/Sources/HelpCore/MapLayers.swift,
// which is itself a port of the rules in apps/web/src/needs.ts (MAP_GROUPS, mapDrawable, PRIVATE_TOPS),
// apps/web/src/main.ts (LAYER_STYLE) and apps/web/src/layers.ts (DEFAULT_LAYERS, remembered on the device only).
//
// It lives here rather than in a screen because the one rule that must never be got wrong — a listing that is never
// a dot — is worth holding to a fixture of the exact rows it must refuse. No android.* class in this file: `:core`
// compiles it and a plain JDK runs its tests.
package org.help313.app

import org.help313.query.Segment
import java.io.File
import kotlin.math.max
import kotlin.math.min

// ---- our own listings, by group ----------------------------------------------------------------------------------

/**
 * One "Free help" layer: a group of our own listings, derived from the category taxonomy. [tops] are top-level
 * categories (the part before the first dot). Every top-level category belongs to exactly one group, except the
 * private ones, which are never drawn at all.
 */
class MapGroup(val id: String, val tops: List<String>)

/** The same eight groups (category audit, 2026-09-22), in the same order, as `MAP_GROUPS` in apps/web/src/needs.ts. */
val mapGroups: List<MapGroup> = listOf(
    MapGroup("food", listOf("food")),
    MapGroup("shelter", listOf("shelter")),
    // Police and fire stations ride with the emergency rooms they are listed beside (DECISIONS 2026-09-22). A
    // layer of their own would need a colour of its own in three clients' map palettes.
    MapGroup("health", listOf("health", "harm", "safe")),
    MapGroup("rec", listOf("rec", "connect")),
    MapGroup("work", listOf("jobs", "learn")),
    MapGroup("kids", listOf("kids", "youth")),
    MapGroup("things", listOf("goods", "hygiene", "pets")),
    // Seniors, veterans and disability help ride here (2026-09-23), as on the web.
    MapGroup("paperwork", listOf("housing", "utilities", "money", "legal", "ids", "transport", "seniors", "veterans", "disability")),
)

/**
 * Never a layer, never a dot: help with drugs or alcohol, and help after sexual assault, are dropped as whole
 * top-level kinds. Inside any other group a single **sensitive** listing (a DV shelter, a mental-health crisis
 * line) is dropped row by row as well ([isSensitive], Needs.kt).
 */
val mapPrivateTops = listOf("treatment", "assault")

/** The group a category belongs to, or "" when it belongs to none. */
fun mapGroupId(category: String): String {
    val top = category.substringBefore('.')
    return mapGroups.firstOrNull { it.tops.contains(top) }?.id ?: ""
}

/**
 * The listings a set of switched-on help layers may put on the map. Three rules, and all of them have to hold: the
 * private kinds are dropped as whole top-level kinds, a sensitive listing is dropped row by row, and a row needs a
 * published point, because a dot is what this is for.
 *
 * Written over lambdas rather than over `BundleRow` so the tests can hand it the exact rows it must refuse — above
 * all a `shelter.dv` row that wrongly carries a coordinate.
 */
fun <T> mapDrawable(rows: List<T>, tops: List<String>, category: (T) -> String, hasPoint: (T) -> Boolean): List<T> =
    rows.filter { row ->
        if (!hasPoint(row)) return@filter false
        val c = category(row)
        val top = c.substringBefore('.')
        // Asked of the row: a private kind can sit inside a group that is drawn (2026-09-23).
        !isPrivate(c) && tops.contains(top)
    }

fun mapDrawable(rows: List<org.help313.query.BundleRow>, tops: List<String>): List<org.help313.query.BundleRow> =
    mapDrawable(rows, tops, { it.category }, { it.lat != null && it.lon != null })

/**
 * The rows a screen that mixes categories draws from (`Need.categories` in Needs.kt, `inCategories` in
 * apps/web/src/needs.ts and apps/ios/Sources/HelpCore/MapLayers.swift). A category matches whole or as a parent,
 * the same way `:query` matches one.
 *
 * It lives here, in a file `:core` compiles on a plain JDK, because "Get somewhere safe now" is an urgent screen
 * and the one thing it must never do is show a listing that hides where it is.
 */
fun <T> inCategories(rows: List<T>, cats: List<String>, category: (T) -> String): List<T> =
    rows.filter { row -> val c = category(row); cats.any { c == it || c.startsWith("$it.") } }

fun inCategories(rows: List<org.help313.query.BundleRow>, cats: List<String>): List<org.help313.query.BundleRow> =
    inCategories(rows, cats) { it.category }

// ---- the layers on offer, and how each one is drawn ----------------------------------------------------------------

/**
 * Which of the two named drawings of the transport layers is in use (docs/MAP-STYLE.md, 2026-09-21).
 * `STANDARD` is today's map and the default on all three clients; `SUBWAY` is the metro-diagram look, a person's
 * choice. Everything that decides what `SUBWAY` draws is in MapStyle.kt.
 */
enum class MapStyle { STANDARD, SUBWAY }

/** Anything that is not the word "subway" reads as `standard` (docs/MAP-STYLE.md section 14, `mapStyle(stored)`). */
fun mapStyleOf(stored: String?): MapStyle = if (stored == "subway") MapStyle.SUBWAY else MapStyle.STANDARD

/**
 * How one switched-on layer is painted. [color] names a colour in the app's palette (MapPalette.kt), never a colour
 * value: dark mode and the contrast fixes of docs/ACCESSIBILITY-AUDIT-2026-09-20 live there, and the Canvas code
 * therefore never hard-codes a colour.
 *
 * Colour never carries the meaning on its own. Every layer is named in the switcher, named again when a person taps
 * one of its lines or stops, and named in the list under the map.
 */
data class MapLayerStyle(
    val color: String,
    val width: Double = 5.0,
    val dash: List<Double> = emptyList(),
    val ring: Boolean = false,
    /** Thousands of points: they wait until the map is close enough for them to be separate things. */
    val dense: Boolean = false,
)

/**
 * Exactly `LAYER_STYLE` in apps/web/src/main.ts and `mapLayerStyles` in apps/ios/Sources/HelpCore/MapLayers.swift,
 * including the intercity coaches' own style: without it they were drawn exactly like the DDOT routes and nothing on
 * the map told the two apart. Written down again as table 2 of docs/MAP-STYLE.md.
 */
val mapLayerStyles: Map<String, MapLayerStyle> = mapOf(
    "go:ddot_routes" to MapLayerStyle("bus", width = 3.2),
    "go:ddot_stops" to MapLayerStyle("bus", dense = true),
    "go:smart_routes" to MapLayerStyle("smart", width = 2.8, dash = listOf(3.0, 2.0)),
    "go:smart_stops" to MapLayerStyle("smart", dense = true),
    "go:qline" to MapLayerStyle("rail", width = 4.0, ring = true),
    "go:people_mover" to MapLayerStyle("rail", width = 3.4, ring = true),
    "go:mogo" to MapLayerStyle("bike", ring = true),
    "go:bike_lanes" to MapLayerStyle("bike", width = 2.4),
    "go:stations" to MapLayerStyle("rail", ring = true),
    "go:park_ride" to MapLayerStyle("smart", ring = true),
    "go:intercity_bus" to MapLayerStyle("rail", width = 2.6, dash = listOf(5.0, 3.0), ring = true),
)

/**
 * The `standard` drawing of a layer — which is also what a layer falls back to in `subway` while its network file is
 * still coming, or when that file could not be read (docs/MAP-STYLE.md section 10: "that layer goes on drawing
 * `standard`"). So both styles answer with the same table here, on purpose, and this function never reads a network
 * file. What `subway` itself draws — one line per route, badges, stations, interchanges, trunks — is
 * [resolveTransitStyle] in MapStyle.kt, which hands this same answer back untouched for `standard`.
 */
fun mapLayerStyle(id: String, @Suppress("UNUSED_PARAMETER") style: MapStyle = MapStyle.STANDARD): MapLayerStyle =
    mapLayerStyles[id] ?: MapLayerStyle("bus")

/**
 * The outlines of every place a bus reaches and the 205 Detroit neighborhoods, as a layer (audit §3; DECISIONS 2026-09-22).
 *
 * Thin dashed lines with names, the neighborhoods only from the zoom at which a name fits; **no choropleth, ever**
 * (docs/13, rule 1) — the only fill is a wash on the one outline that was tapped, which carries no number. The
 * layer is handed no listing at all, so the rule about sensitive rows is satisfied by there being nothing to drop.
 */
const val AREAS_LAYER = "place:areas"

// The 14-metre threshold that used to live here — below it the neighborhood outlines were drawn, above it the
// four cities alone — is gone (docs/MAP-STYLE.md section 15, 2026-09-22). The Map tab opens on the whole city, so
// in practice it meant a person saw four city edges and none of the 205 they had come to find. Every outline is
// drawn in every band now; what keeps them from being a mesh is WEIGHT, in `boundaryStyle` (Bounds.kt), and what
// the zoom still governs is the NAMES.

/**
 * What a first-time visitor sees (audit H2; Kyle, 2026-09-22; DECISIONS 2026-09-22).
 *
 * It used to be the greenway, the parks and the DDOT routes — a street map with a green line on it and **not one
 * place that helps**. The one tab named after the thing on it opened without the thing, and a person who tapped
 * Map to find food had to open the switcher and tick a box before the tab did anything the app is for.
 *
 * So: **every help layer on, parks on, the greenway off, the outlines off, the bus routes off.** All eight help
 * groups rather than food alone, because the map is where a helper asks "what is near this address?" and the
 * honest answer is all of it; parks because they are the other thing a map is for; the greenway off because it is
 * one path inside a 302-park system (Kyle, direction b) and one tap away in the switcher; the bus routes off
 * because a route line over eight kinds of dot is the busiest thing on the screen.
 *
 * A remembered choice still wins: this list is only ever read on a phone that has never touched the switcher.
 */
val defaultMapLayers = mapGroups.map { "help:${it.id}" } + listOf("place:parks", AREAS_LAYER)

/**
 * The version of the layer list this build understands (docs/MAP-STYLE.md section 15.4).
 *
 * A phone that has never touched the switcher simply gets [defaultMapLayers]. A phone that **has** never reads
 * the defaults again, so it would have gone on seeing no boundaries for ever; adding the layer on every load
 * instead would mean nobody could ever switch it off. So the stored list carries a marker, a list without one —
 * or with an older one — gains `place:areas` **once**, and every write stamps the marker.
 */
const val LAYERS_VERSION = 2

/**
 * The one-time migration, as a pure function so `:core` can hold it to its three cases: a list from before the
 * marker gains the boundaries layer at the end and nothing else is touched; a list already at this version is
 * handed back untouched, off or on; and the 30-layer cap still applies.
 */
fun migrateLayers(stored: List<String>, version: Int): List<String> {
    if (version >= LAYERS_VERSION) return stored
    if (stored.contains(AREAS_LAYER)) return stored
    // `takeLast`, as the web's `slice(-30)` is: the layer that has just been added must survive the cap, or the
    // migration would run for ever on a phone with thirty layers on and never take.
    return (stored + AREAS_LAYER).takeLast(30)
}

/** How wide a layer's line is drawn, in dp, at this zoom. */
fun mapLayerLineWidth(style: MapLayerStyle, metersPerPoint: Double): Double =
    max(1.6, min(style.width, style.width * 18 / metersPerPoint))

/**
 * How big a stop is drawn, in dp — **0 means do not draw it at all**. A dense layer (five thousand bus stops) waits
 * for the zoom: drawn at every zoom it is a smear rather than a set of places, and it costs a cheap phone a frame.
 * The switcher says so, and the list shows every stop at any zoom.
 */
fun mapStopRadius(dense: Boolean, metersPerPoint: Double): Double =
    if (dense) {
        if (metersPerPoint > 12) 0.0 else max(2.0, min(4.0, 30 / metersPerPoint))
    } else {
        max(3.5, min(6.5, 45 / metersPerPoint))
    }

/**
 * The road classes drawn at this zoom: main roads always, small streets as you come in. Class 0 is a freeway.
 *
 * These are the web map's numbers **as of 2026-09-21**, not the iPhone's. On that day the web raised every street
 * past 3:1 against the land (WCAG 1.4.11) and paid for it three ways at once: a small street became a hairline, a
 * small street waits for a closer zoom than it used to (6 m/dp rather than 9, and the next class 11 rather than 16),
 * and width rather than fade carries the hierarchy. The colours and the widths are one decision and cannot be taken
 * separately, so this app takes both. apps/ios still has the older pair; the ported tests pass either way, so the
 * drift is written down in the report rather than hidden here.
 */
fun mapStreetClassLimit(metersPerPoint: Double): Int =
    if (metersPerPoint < 6) 4 else if (metersPerPoint < 11) 3 else 2

/** The road classes whose names are worth printing at this zoom. */
fun mapStreetLabelLimit(metersPerPoint: Double): Int = when {
    metersPerPoint < 4.6 -> 4
    metersPerPoint < 8 -> 3
    metersPerPoint < 14 -> 2
    metersPerPoint < 30 -> 1
    else -> 0
}

/** How wide a street of this class is drawn, in dp. A class-4 street is a hairline; see [mapStreetClassLimit]. */
fun mapStreetWidth(cls: Int, metersPerPoint: Double): Double {
    val c = max(0, min(4, cls))
    val base = doubleArrayOf(18.0, 20.0, 15.0, 10.0, 7.0)[c]
    val floor = if (c == 4) 0.9 else if (c == 3) 1.2 else 1.6
    val ceiling = if (c <= 2) 6.5 else 4.5
    return max(floor, min(ceiling, base / metersPerPoint))
}

/** Close in, the big roads get a casing in the land colour, which keeps a freeway readable through a park. */
fun mapStreetCasing(metersPerPoint: Double): Boolean = metersPerPoint < 4

// ---- the greenway, drawn like a transit line -----------------------------------------------------------------------

/**
 * A stretch's colour and dash. Colour never carries the meaning alone: the phase is also a word on every row, in the
 * tapped card, and in the list (Differentiate Without Color).
 */
data class GreenwayPhaseStyle(
    val color: String,
    /** Multiples of the drawn width, so the pattern keeps its shape at every zoom. Empty is a solid line. */
    val dash: List<Double>,
)

/** Least built first, so an open stretch is never hidden under a dotted one. */
val greenwayPhaseOrder = listOf("planned", "funded", "under_construction", "open")

fun greenwayPhaseStyle(phase: String): GreenwayPhaseStyle = when (phase) {
    "open" -> GreenwayPhaseStyle("gwOpen", emptyList())
    "under_construction" -> GreenwayPhaseStyle("gwBuild", listOf(2.4, 1.5))
    "funded" -> GreenwayPhaseStyle("gwFund", listOf(1.4, 1.3))
    // Round caps turn this into dots.
    else -> GreenwayPhaseStyle("gwPlan", listOf(0.02, 1.9))
}

/** The width of the whole route at this zoom: one width the whole way, as a transit line is drawn. */
fun greenwayWidth(metersPerPoint: Double): Double = max(4.5, min(9.0, 18 / metersPerPoint))

/** Station dots where stretches meet are only worth drawing once they are far enough apart. */
fun greenwayShowsStations(metersPerPoint: Double): Boolean = metersPerPoint < 14

// ---- reading order for TalkBack --------------------------------------------------------------------------------

/**
 * A custom View is one opaque picture to TalkBack, so the greenway is offered as a list of virtual nodes instead
 * (MapView.getAccessibilityNodeProvider). They are read **south to north**, the way the route is walked and the way
 * the City numbers its phases, and a stretch that starts at the same latitude as another is settled by its id so the
 * order never wobbles between launches.
 */
fun greenwaySegmentsInReadingOrder(segments: List<Segment>): List<Segment> {
    fun south(s: Segment): Double =
        s.lines.flatMap { it.asIterable() }.mapNotNull { if (it.size >= 2) it[1] else null }.minOrNull()
            ?: Double.POSITIVE_INFINITY
    return segments.sortedWith(compareBy({ south(it) }, { it.id }))
}

/**
 * Places are read nearest-first from wherever the map is looking, so the first thing TalkBack reads is the thing in
 * the middle of the screen. `fromX`/`fromY` are in map units (the camera's centre).
 */
fun <T> placesInReadingOrder(
    places: List<T>,
    fromX: Double,
    fromY: Double,
    x: (T) -> Double,
    y: (T) -> Double,
    tieBreak: (T) -> String,
): List<T> = places.sortedWith(
    compareBy(
        { (x(it) - fromX) * (x(it) - fromX) + (y(it) - fromY) * (y(it) - fromY) },
        { tieBreak(it) },
    ),
)

// ---- what this phone remembers -----------------------------------------------------------------------------------

/**
 * Which layers are switched on. A preference about a map, not a fact about a person: it is a small file in the app's
 * own private storage, which the backup rules already exclude, and it is never sent anywhere.
 *
 * **Not `SharedPreferences`**: the app keeps its own state in files it creates, as SavedStore does, and the write is
 * atomic — a new file beside the old one, then a rename — so a phone that loses power mid-write comes back with the
 * old choice rather than with half a file (apps/android/README.md, "atomic writes").
 */
class MapLayerStore(private val dir: File) {

    private val file = File(dir, "map-layers.json")

    var on: List<String> = defaultMapLayers
        private set

    /** `standard` unless a person chose otherwise; anything else on disk reads as `standard`. Same file, same rules. */
    var style: MapStyle = MapStyle.STANDARD
        private set

    /**
     * Table or chart on a neighborhood's year panels (docs/13, 2026-09-22). Not about the map at all, but the same
     * KIND of fact — a way of showing something, chosen on this phone — so it lives in the same file under the same
     * rules: private storage, excluded from backup, never sent. `table` is the default.
     */
    var hoodView: HoodViewChoice = HoodViewChoice.TABLE
        private set

    init {
        read()
    }

    fun isOn(id: String): Boolean = on.contains(id)

    /**
     * Returns false only when the choice could not be written down; the switch still moves. Thirty at most, so a
     * phone with an old bundle can never ask for an unbounded number of files.
     */
    fun toggle(id: String): Boolean {
        on = if (on.contains(id)) on.filter { it != id } else (listOf(id) + on).take(CAP)
        return write()
    }

    fun set(ids: List<String>): Boolean {
        on = ids.take(CAP)
        return write()
    }

    fun setStyle(next: MapStyle): Boolean {
        style = next
        return write()
    }

    /** One choice for every year panel on every neighborhood page. False only when it could not be written down. */
    fun setHoodView(next: HoodViewChoice): Boolean {
        hoodView = next
        return write()
    }

    /**
     * `{"on":[…],"style":"subway"}`. Yesterday's file was a bare list of layer ids; it still reads, and the style is
     * then `standard`.
     */
    private fun read() {
        try {
            val j = org.help313.query.Json.parse(file.readBytes())
            val list = if (j is org.help313.query.Json.Arr) j else (j["on"] as? org.help313.query.Json.Arr ?: throw IllegalStateException())
            val stored = list.items.mapNotNull { it.str }.take(CAP)
            val version = j["v"]?.int ?: 0
            on = migrateLayers(stored, version)
            style = mapStyleOf(j["style"]?.str)
            hoodView = hoodViewOf(j["hoodView"]?.str)
            // A migrated list is written back at once, so the marker is on disk even if nothing else is ever
            // touched — otherwise the same migration would run on every launch and "off" could never stick.
            if (version < LAYERS_VERSION) write()
        } catch (_: Throwable) {
            on = defaultMapLayers
            style = MapStyle.STANDARD
            hoodView = HoodViewChoice.TABLE
        }
    }

    private fun write(): Boolean = try {
        dir.mkdirs()
        val temp = File(dir, "map-layers.json.new")
        // **Every write stamps the version marker**, not only the migration: a choice made after it — including
        // switching the boundaries back off — must never be migrated a second time (docs/MAP-STYLE.md 15.4).
        val text = "{\"v\":" + LAYERS_VERSION + ",\"on\":" + encode(on) +
            ",\"style\":\"" + (if (style == MapStyle.SUBWAY) "subway" else "standard") +
            "\",\"hoodView\":\"" + (if (hoodView == HoodViewChoice.CHART) "chart" else "table") + "\"}"
        temp.writeBytes(text.toByteArray(Charsets.UTF_8))
        if (!temp.renameTo(file)) {
            // Some filesystems refuse a rename onto an existing file; the delete-then-rename is the fallback, and
            // the old choice is still on disk right up to the delete.
            file.delete()
            if (!temp.renameTo(file)) throw java.io.IOException("could not replace ${file.name}")
        }
        true
    } catch (_: Throwable) {
        false
    }
    private fun encode(ids: List<String>): String =
        ids.joinToString(",", "[", "]") { id ->
            val safe = StringBuilder("\"")
            for (ch in id) {
                when {
                    ch == '"' || ch == '\\' -> safe.append('\\').append(ch)
                    ch < ' ' -> safe.append(' ')
                    else -> safe.append(ch)
                }
            }
            safe.append('"').toString()
        }

    private companion object {
        const val CAP = 30
    }
}
