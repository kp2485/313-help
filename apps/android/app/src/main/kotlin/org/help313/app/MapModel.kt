// What the Map tab knows: where the camera is, which layers are on, which shapes have arrived, and what is
// selected. The rules and the arithmetic are in MapData.kt and MapLayers.kt, where `:core` runs them on a plain
// JDK; this file is the part that has to live on a phone.
//
// Nothing here is about a person. The layer choice is a file in this app's own storage, the camera is memory only,
// and a location — if the person taps for one — is held in memory by MainActivity and never written down or sent.
//
// **One model per process, not one per activity.** A font-scale change, dark mode or a rotation must not re-read
// and re-decode a third of a megabyte of streets, exactly as it must not re-verify the bundle's signature
// (BundleStore.of). The camera survives with it, so the map is where the person left it.
package org.help313.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.help313.query.BundleRow
import org.help313.query.Json
import org.help313.query.LatLon
import org.help313.query.Segment
import java.io.File

// ---- what the bundle says is on offer ----------------------------------------------------------------------------

/** One transport layer as `places/transit.json` lists it: what it is, where its shapes are, and whose data it is. */
class TransitLayerInfo(
    val id: String,
    val name: String,
    val file: String,
    val lines: Int,
    val points: Int,
    val sourceName: String,
    val license: String,
    val fetchedAt: String,
)

/** One park as `places/parks.json` lists it. The shapes themselves are in `map/base.json`. */
class ParkPlace(val id: String, val name: String, val lat: Double?, val lon: Double?)

// ---- what is on the map, and what is selected ---------------------------------------------------------------------

/** A greenway stretch, ready to draw and to tap: its lines projected once, and the box they sit in. */
class DrawnSegment(val segment: Segment) {
    val id: String get() = segment.id
    val lines: List<DoubleArray> = MapFileDecoder.segmentLines(segment)
    val box: MapBox = lines.fold(MapBox.EMPTY) { b, l -> b.union(MapBox.around(l)) }
}

/**
 * One of our own listings as a dot on the map. Sensitive and private listings never become one of these
 * ([mapDrawable], MapLayers.kt) — not a dot, not a row in the list, and not a virtual accessibility node.
 */
class DrawnDot(
    val id: String,
    val name: String,
    val category: String,
    val group: String,
    val phone: String?,
    val x: Double,
    val y: Double,
)

/**
 * What a tap found. Every one of these is also a row in "See this map as a list", so nothing on this tab is
 * reachable only by looking at a picture.
 */
sealed class MapSelection {
    class Stretch(val id: String) : MapSelection()
    class Listing(val id: String) : MapSelection()
    class Park(val name: String) : MapSelection()
    class Stop(val name: String, val layer: String) : MapSelection()
    class Route(val name: String, val layer: String) : MapSelection()

    // The subway style's own (docs/MAP-STYLE.md section 9). [layer] is the bundle's id, "ddot_routes", never a word.
    /** One route of a network, by its stable `rt_` id. Selecting it dims the rest and shows its stops. */
    class Line(val layer: String, val routeId: String) : MapSelection()

    /** A street more than four routes share: the card lists them, each a button. */
    class Trunk(val layer: String, val routeIds: List<String>) : MapSelection()

    /** A stop or station, by its number in the STANDARD layer file (which is what `serves` indexes). */
    class Station(val layer: String, val index: Int) : MapSelection()
    class Interchange(val layer: String, val index: Int) : MapSelection()
    class Hub(val name: String) : MapSelection()

    /** True for a selection only the subway drawing can show; dropped when the style goes back to `standard`. */
    val isSubway: Boolean get() = this is Line || this is Trunk || this is Station || this is Interchange || this is Hub

    val key: String
        get() = when (this) {
            is Line -> "line:$layer:$routeId"
            is Trunk -> "trunk:$layer:" + routeIds.joinToString(",")
            is Station -> "station:$layer:$index"
            is Interchange -> "change:$layer:$index"
            is Hub -> "hub:$name"
            is Stretch -> "seg:$id"
            is Listing -> "row:$id"
            is Park -> "park:$name"
            is Stop -> "stop:$layer:$name"
            is Route -> "route:$layer:$name"
        }
}

/** One switched-on transport layer, ready to draw: its shapes, how it is painted, and its name in words. */
class MapOverlay(
    val id: String,
    val label: String,
    val style: MapLayerStyle,
    val data: MapLayerData,
    /**
     * How this layer is drawn THIS frame ([drawnStyle]): `subway` only when that style is chosen and — for a network
     * layer — its network file is held. While the file is coming, or if it failed, the layer goes on drawing
     * `standard` beside the ones that arrived.
     */
    val subway: Boolean = false,
)

// ---- the model ------------------------------------------------------------------------------------------------

object MapModel {

    private val main = Handler(Looper.getMainLooper())

    /** Whether this layer's shapes are here, still coming, or could not be read. */
    enum class LayerState { READY, LOADING, FAILED }

    // -- the camera. Memory only; it dies with the process.
    @Volatile
    var camera: MapCamera = MapCamera(0.0, 0.0, MapCamera.MIN_SCALE, 1.0, 1.0)
        private set
    private var everMoved = false

    /** The four corners of the service area (CLAUDE.md: Detroit, Hamtramck, Highland Park and Dearborn). */
    private val cityCorners = listOf(LatLon(42.255, -83.29), LatLon(42.45, -82.91))

    // -- what has arrived
    @Volatile var base: BaseMap? = null; private set
    @Volatile var baseFailed = false; private set
    @Volatile var segments: List<DrawnSegment> = emptyList(); private set
    @Volatile var dots: List<DrawnDot> = emptyList(); private set
    @Volatile var parks: List<ParkPlace> = emptyList(); private set
    @Volatile var transitLayers: List<TransitLayerInfo> = emptyList(); private set

    /** layer id to its network file, for the layers that carry a format-2 one. Empty for an old bundle. */
    @Volatile var netFiles: Map<String, String> = emptyMap(); private set
    @Volatile var hubs: List<TransitHub> = emptyList(); private set

    /** Goes up whenever anything that is drawn or read out changed, so caches keyed on it are never stale. */
    @Volatile var version = 0; private set

    private val netData = HashMap<String, PreparedNet>()
    private val servesData = HashMap<String, TransitServes>()
    private val netFailed = HashSet<String>()
    private val layerData = HashMap<String, MapLayerData>()
    private val layerFailed = HashSet<String>()
    private val asking = HashSet<String>()
    private var baseKey = ""
    private var segmentsKey = ""
    private var dotsKey = ""

    // -- what is switched on, remembered on this phone only
    private var store: MapLayerStore? = null

    @Volatile
    var selection: MapSelection? = null

    /** Called on the main thread whenever anything above changed. The Map screen sets it and clears it. */
    @Volatile
    var onChange: (() -> Unit)? = null

    private fun changed() {
        version++
        main.post { onChange?.invoke() }
    }

    // -- layers ----------------------------------------------------------------------------------------------

    @Synchronized
    private fun layers(context: Context): MapLayerStore =
        store ?: MapLayerStore(File(context.applicationContext.filesDir, "state")).also { store = it }

    fun layersOn(context: Context): List<String> = layers(context).on

    fun isOn(context: Context, id: String): Boolean = layers(context).isOn(id)

    fun toggle(context: Context, id: String) {
        layers(context).toggle(id)
        synchronized(this) {
            layerFailed.remove(id)
            netFailed.remove(id.removePrefix("go:"))
        }
        version++
    }

    // -- the map style -----------------------------------------------------------------------------------------

    fun style(context: Context): MapStyle = layers(context).style

    /** Whether there is anything to choose: an old bundle has no network files, and the control is then hidden. */
    val styleOffered: Boolean get() = netFiles.isNotEmpty()

    /**
     * Applies at once. Switching never reloads a file already held: `standard → subway` asks for the network file of
     * each network layer that is on and keeps drawing `standard` for that layer until it arrives; `subway →
     * standard` redraws from what is held.
     */
    fun setStyle(context: Context, store: BundleStore, next: MapStyle) {
        layers(context).setStyle(next)
        if (next == MapStyle.STANDARD && selection?.isSubway == true) selection = null
        version++
        loadNets(context, store)
    }

    /** The top-level categories the switched-on help layers cover. */
    fun switchedOnTops(context: Context): List<String> =
        mapGroups.filter { isOn(context, "help:" + it.id) }.flatMap { it.tops }

    // -- the camera ------------------------------------------------------------------------------------------

    /**
     * Where the map OPENS: a point already known (allowed earlier, or the centre of a typed ZIP) or, with none,
     * nothing at all — and then [openingView] hands back the civic anchor (Locate.kt). Set by the screen before
     * the first layout. It is a view, not a person: nothing here is written down or sent.
     */
    @Volatile var openAt: LatLon? = null

    /** The camera the tab opens at, for a box of this size. Pure, and the same on all three clients. */
    fun openingCamera(width: Double, height: Double): MapCamera {
        val (centre, radius) = openingView(openAt)
        return MapCamera.forRadius(centre, radius, width, height)
    }

    fun resize(width: Double, height: Double) {
        if (width <= 1 || height <= 1) return
        camera = if (!everMoved || camera.width <= 1) {
            openingCamera(width, height)
        } else {
            camera.resized(width, height).clamped()
        }
    }

    fun zoom(factor: Double, atX: Double = camera.width / 2, atY: Double = camera.height / 2) {
        everMoved = true
        camera = camera.zoomed(factor, atX, atY)
    }

    fun pan(dx: Double, dy: Double) {
        everMoved = true
        camera = camera.panned(dx, dy)
    }

    /** One step of a pinch: the fingers moved the middle of the gesture and changed its span, both at once. */
    fun pinch(dx: Double, dy: Double, factor: Double, atX: Double, atY: Double) {
        everMoved = true
        camera = camera.pinched(dx, dy, factor, atX, atY)
    }

    /**
     * The whole area, one tap away: the reset button still shows all four cities, whatever the map opened at
     * (DECISIONS 2026-09-22). It counts as a move now — before, `everMoved = false` meant the next layout refit
     * the region, which since 2026-09-22 would instead throw the person back to the anchor they just left.
     */
    fun reset() {
        everMoved = true
        camera = MapCamera.fitting(cityCorners, camera.width, camera.height, cover = true)
    }

    /**
     * Show a radius around a point — two miles, the first time the Map tab is opened with a location to hand
     * (docs/05, DECISIONS 2026-09-21). [MapCamera.forRadius] is the whole of it, and it is tested in `:core`.
     * The point is not kept: the camera is a few numbers in memory, and they are numbers about a view.
     */
    fun show(p: LatLon, radiusMeters: Double = LOCATE_RADIUS_METERS) {
        everMoved = true
        camera = MapCamera.forRadius(p, radiusMeters, camera.width, camera.height)
    }

    /** Centre on a point without changing the zoom — "my location", and following a row from the list. */
    fun center(p: LatLon, metersAcross: Double = 1200.0) {
        everMoved = true
        val want = MapProjection.METERS_PER_UNIT / (metersAcross / maxOf(camera.width, 1.0))
        camera = camera.copy(
            centerX = MapProjection.pointX(p),
            centerY = MapProjection.pointY(p),
            scale = maxOf(camera.scale, want),
        ).clamped()
    }

    // -- loading ---------------------------------------------------------------------------------------------

    /**
     * Everything the Map tab needs, read and decoded on the shared io thread and never on the main one. Called when
     * the tab appears and whenever a newer bundle arrives; a file already decoded for this bundle version is not
     * read again.
     *
     * No lock is held while a file is read, hashed or fetched (apps/android/README.md: a lock is never held across
     * the network). The only locked sections are the few lines that put a decoded value into the maps below.
     */
    fun load(context: Context, store: BundleStore) {
        val bundle = store.bundle ?: return
        prepareSegments(bundle.segments)
        rebuildDots(context, bundle.rows)
        Work.io {
            loadPlaces(store)
            loadBase(store)
            for (l in transitLayers) if (isOn(context, "go:" + l.id)) loadLayer(store, "go:" + l.id)
            wantNets(context, store)
        }
    }

    /** The network files the style, the switched-on layers and the selected route ask for. Nothing in `standard`. */
    fun loadNets(context: Context, store: BundleStore) {
        Work.io { wantNets(context, store) }
    }

    private fun wantNets(context: Context, store: BundleStore) {
        val chosen = selection as? MapSelection.Line
        val stopsOf = chosen?.let { net(store, it.layer)?.net?.stopsLayer }
        val wanted = netFilesWanted(style(context), layersOn(context), netFiles, stopsOf)
        for ((layer, file) in wanted) loadNet(store, layer, file)
        // A selected route shows its stops: that needs the network's stops LAYER as well as its small file, even
        // when that layer is switched off. Until they come, only terminals and interchanges show.
        if (stopsOf != null && style(context) == MapStyle.SUBWAY) loadLayer(store, "go:$stopsOf")
    }

    /**
     * One network file, through the same path as a layer: looked up in the signed index, read, checked against its
     * SHA-256, and only then parsed (BundleStore.verifiedBytes) — off the main thread, as is the simplification of
     * its three bands (PreparedNet). Kept by `file:sha256`. Not in the index, a bad hash, no network, not format 2,
     * malformed: all one state, FAILED, and the layer goes on drawing `standard`.
     */
    private fun loadNet(store: BundleStore, layer: String, file: String) {
        val key = netKey(store, layer) ?: return
        synchronized(this) {
            if (netData.containsKey(key) || servesData.containsKey(key) || asking.contains(key) || netFailed.contains(layer)) return
            asking.add(key)
        }
        changed()
        try {
            val bytes = store.verifiedBytes(file)
            if (layer.endsWith("_stops")) {
                val decoded = Trace.time("map.decode_serves") { NetFileDecoder.netServes(bytes) }
                synchronized(this) { servesData[key] = decoded }
            } else {
                val decoded = Trace.time("map.decode_net") { PreparedNet(NetFileDecoder.net(bytes)) }
                synchronized(this) { netData[key] = decoded }
            }
        } catch (t: Throwable) {
            synchronized(this) { netFailed.add(layer) }
            if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "map network $layer failed: $t")
        } finally {
            synchronized(this) { asking.remove(key) }
        }
        changed()
    }

    private fun netKey(store: BundleStore, layer: String): String? {
        val file = netFiles[layer] ?: return null
        return file + ":" + (store.bundle?.index?.files?.get(file)?.sha256 ?: "")
    }

    @Synchronized
    fun net(store: BundleStore, layer: String): PreparedNet? = netKey(store, layer)?.let { netData[it] }

    @Synchronized
    fun serves(store: BundleStore, layer: String): TransitServes? = netKey(store, layer)?.let { servesData[it] }

    /** Which routes call at stop [index] of [layer]: the stops file for a bus stop, the rail file's own `serves`. */
    fun routesAt(store: BundleStore, layer: String, index: Int): Pair<PreparedNet, List<Int>>? {
        val routesLayer = serves(store, layer)?.routesLayer ?: layer
        val owner = net(store, routesLayer) ?: return null
        val list = (serves(store, layer)?.serves ?: owner.net.serves)?.getOrNull(index) ?: return null
        return owner to list.filter { it >= 0 && it < owner.net.routes.size }
    }

    /** READY, LOADING or FAILED for a layer's network file; null when nothing is being asked of it. */
    @Synchronized
    fun netState(context: Context, store: BundleStore, layer: String): LayerState? {
        if (style(context) != MapStyle.SUBWAY || !netFiles.containsKey(layer) || !isOn(context, "go:$layer")) return null
        val key = netKey(store, layer)
        return when {
            netFailed.contains(layer) -> LayerState.FAILED
            key != null && (netData.containsKey(key) || servesData.containsKey(key)) -> LayerState.READY
            else -> LayerState.LOADING
        }
    }

    /** "Try again" forgets the failure and asks afresh. */
    fun retryNet(context: Context, store: BundleStore, layer: String) {
        synchronized(this) { netFailed.remove(layer) }
        changed()
        loadNets(context, store)
    }

    /** What the subway passes draw from, or null in `standard` — which therefore never reaches that code at all. */
    fun subwayScene(context: Context, store: BundleStore): SubwayScene? {
        if (style(context) != MapStyle.SUBWAY || !styleOffered) return null
        val on = layersOn(context)
        val nets = HashMap<String, PreparedNet>()
        val keys = HashMap<String, String>()
        val serving = HashMap<String, TransitServes>()
        for (layer in netFiles.keys) {
            val key = netKey(store, layer) ?: continue
            net(store, layer)?.let { nets[layer] = it; keys[layer] = key }
            serves(store, layer)?.let { serving[layer] = it }
        }
        val chosen = selection as? MapSelection.Line
        val picked = chosen?.let { c ->
            val i = nets[c.layer]?.net?.routes?.indexOfFirst { it.id == c.routeId } ?: -1
            if (i >= 0) c.layer to i else null
        }
        val stops = picked?.let { nets[it.first]?.net?.stopsLayer }?.let { data(store, "go:$it") }
        return SubwayScene(nets, keys, serving, hubs, on, picked, stops)
    }

    /** One transport layer, asked for only when it is switched on. */
    fun loadOne(context: Context, store: BundleStore, id: String) {
        Work.io { loadLayer(store, id) }
    }

    fun retry(context: Context, store: BundleStore, id: String) {
        synchronized(this) { layerFailed.remove(id) }
        changed()
        loadOne(context, store, id)
    }

    private fun loadPlaces(store: BundleStore) {
        if (transitLayers.isEmpty()) {
            runCatching {
                val manifest = store.verifiedBytes("places/transit.json")
                val j = Json.parse(manifest)
                transitLayers = (j["layers"]?.arr ?: emptyList()).map { l ->
                    val src = l["source"]
                    TransitLayerInfo(
                        id = l["id"]?.str ?: "",
                        name = src?.get("name")?.str ?: l["name"]?.str ?: "",
                        file = l["file"]?.str ?: "",
                        lines = l["lines"]?.int ?: 0,
                        points = l["points"]?.int ?: 0,
                        sourceName = src?.get("name")?.str ?: "",
                        license = src?.get("license")?.str ?: "",
                        fetchedAt = src?.get("fetched_at")?.str ?: "",
                    )
                }.filter { it.id.isNotEmpty() && it.file.isNotEmpty() }
                // The subway style's part of the same file: which layers carry a network file, and the hubs. A hub
                // says where it is (`origin` + `at` + `span`); nothing is looked up by name unless it does not.
                val extras = NetFileDecoder.transitExtras(manifest)
                netFiles = extras.netFiles
                hubs = extras.hubs
                changed()
            }.onFailure { if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "transit manifest failed: $it") }
        }
        if (parks.isEmpty()) {
            runCatching {
                val j = Json.parse(store.verifiedBytes("places/parks.json"))
                parks = (j["parks"]?.arr ?: emptyList()).map { p ->
                    ParkPlace(p["id"]?.str ?: "", p["name"]?.str ?: "", p["lat"]?.num, p["lon"]?.num)
                }
                changed()
            }.onFailure { if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "park list failed: $it") }
        }
    }

    private fun loadBase(store: BundleStore) {
        val index = store.bundle?.index ?: return
        val key = (index.files["map/base.json"]?.sha256 ?: "") + ":" + (index.files["map/streets.json"]?.sha256 ?: "")
        synchronized(this) { if (base != null && baseKey == key) return }
        try {
            val baseBytes = Trace.time("map.read_base") { store.verifiedBytes("map/base.json") }
            // No small streets is a poorer map, not no map.
            val streetBytes = runCatching { Trace.time("map.read_streets") { store.verifiedBytes("map/streets.json") } }.getOrNull()
            val decoded = Trace.time("map.decode_base") { MapFileDecoder.baseMap(baseBytes, streetBytes) }
            synchronized(this) {
                base = decoded
                baseKey = key
                baseFailed = false
            }
        } catch (t: Throwable) {
            // The greenway and the dots still draw; the streets simply do not — and the screen says so.
            baseFailed = true
            if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "map base failed: $t")
        }
        changed()
    }

    private fun loadLayer(store: BundleStore, id: String) {
        val meta = transitLayers.firstOrNull { "go:" + it.id == id } ?: return
        val sha = store.bundle?.index?.files?.get(meta.file)?.sha256 ?: ""
        val key = "$id:$sha"
        synchronized(this) {
            if (layerData.containsKey(key) || asking.contains(key)) return
            asking.add(key)
        }
        try {
            val decoded = Trace.time("map.decode_layer") { MapFileDecoder.layer(store.verifiedBytes(meta.file)) }
            synchronized(this) {
                layerData[key] = decoded
                layerFailed.remove(id)
            }
        } catch (t: Throwable) {
            // A failure is a state of its own: the switcher and the list say so, and "Try again" asks afresh. It
            // is never remembered as "nothing".
            synchronized(this) { layerFailed.add(id) }
            if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "map layer $id failed: $t")
        } finally {
            synchronized(this) { asking.remove(key) }
        }
        changed()
    }

    @Synchronized
    fun data(store: BundleStore, id: String): MapLayerData? {
        val meta = transitLayers.firstOrNull { "go:" + it.id == id } ?: return null
        return layerData["$id:" + (store.bundle?.index?.files?.get(meta.file)?.sha256 ?: "")]
    }

    @Synchronized
    fun state(store: BundleStore, id: String): LayerState = when {
        layerFailed.contains(id) -> LayerState.FAILED
        data(store, id) == null -> LayerState.LOADING
        else -> LayerState.READY
    }

    /** The transport layers that are on, with their shapes, in the order the bundle lists them. */
    fun overlays(context: Context, store: BundleStore): List<MapOverlay> = transitLayers.mapNotNull { l ->
        val id = "go:" + l.id
        if (!isOn(context, id)) return@mapNotNull null
        val data = data(store, id) ?: return@mapNotNull null
        val chosen = style(context)
        // A network layer is `subway` only once its network file is held; the others need no file of their own.
        val held = !subwayNetworkLayers.contains(l.id) || net(store, l.id) != null
        MapOverlay(id, mapLayerName(id, l.name), mapLayerStyle(id, chosen), data, styleOffered && drawnStyle(chosen, held) == MapStyle.SUBWAY)
    }

    /** The greenway, projected once per bundle. */
    private fun prepareSegments(list: List<Segment>) {
        val key = list.joinToString(",") { it.id }
        if (key == segmentsKey) return
        segmentsKey = key
        segments = greenwaySegmentsInReadingOrder(list).map { DrawnSegment(it) }
    }

    /**
     * Our own listings as dots, rebuilt when the bundle or the switched-on layers change — never while a finger is
     * moving. [mapDrawable] is the one rule that matters here: a treatment or sexual-assault listing is never a dot
     * at all, and a DV or mental-health-crisis listing is dropped row by row (MapLayers.kt).
     */
    fun rebuildDots(context: Context, rows: List<BundleRow>) {
        val tops = switchedOnTops(context)
        val key = tops.joinToString(",") + "#" + rows.size
        if (key == dotsKey) return
        dotsKey = key
        dots = mapDrawable(rows, tops).mapNotNull { r ->
            val lat = r.lat
            val lon = r.lon
            if (r.status != "active" || lat == null || lon == null) {
                null
            } else {
                DrawnDot(
                    id = r.id,
                    name = r.name,
                    category = r.category,
                    group = mapGroupId(r.category),
                    phone = r.phones.firstOrNull()?.number,
                    x = MapProjection.x(lon),
                    y = MapProjection.y(lat),
                )
            }
        }
    }

    /** Frees the decoded shapes. Called when the system says memory is short. */
    @Synchronized
    fun forgetEverything() {
        base = null
        baseKey = ""
        layerData.clear()
        netData.clear()
        servesData.clear()
        version++
    }

    // -- tapping ---------------------------------------------------------------------------------------------

    /**
     * What a tap found, in the order the web map looks: a listing dot first, then a stop, then the greenway, then a
     * route, then the park a finger is inside. Tolerances are in dp and are turned into map units here, so a finger
     * is the same size at every zoom.
     */
    fun pick(
        sx: Double, sy: Double, overlays: List<MapOverlay>, greenwayOn: Boolean, parksOn: Boolean,
        /** Subway only: the glyph under a 48 dp box, asked after the listing dots; and the route line within 22 dp. */
        glyph: (() -> MapSelection?)? = null,
        line: (() -> MapSelection?)? = null,
    ): MapSelection? {
        val cam = camera
        val x = cam.mapX(sx)
        val y = cam.mapY(sy)

        var bestDistance = Double.POSITIVE_INFINITY
        var best: MapSelection? = null
        fun consider(d: Double, limit: Double, hit: () -> MapSelection) {
            if (d < limit && d < bestDistance) {
                bestDistance = d
                best = hit()
            }
        }

        val dotTol = cam.mapDistance(24.0)
        for (dot in dots) consider(Math.hypot(dot.x - x, dot.y - y), dotTol) { MapSelection.Listing(dot.id) }
        best?.let { return it }
        glyph?.invoke()?.let { return it }

        // From here on `standard` only tests what `standard` drew: a layer drawn `subway` answered above.
        val stopTol = cam.mapDistance(18.0)
        for (o in overlays) {
            if (o.subway) continue
            for (q in o.data.points) consider(Math.hypot(q.x - x, q.y - y), stopTol) { MapSelection.Stop(q.name, o.label) }
        }
        best?.let { return it }

        if (greenwayOn) {
            val segTol = cam.mapDistance(16.0)
            val view = cam.visible
            for (g in segments) {
                if (!g.box.expanded(segTol).intersects(view)) continue
                for (l in g.lines) consider(MapHit.distanceToPolyline(x, y, l), segTol) { MapSelection.Stretch(g.id) }
            }
            best?.let { return it }
        }

        line?.invoke()?.let { return it }
        val routeTol = cam.mapDistance(14.0)
        val view = cam.visible
        for (o in overlays) {
            if (o.subway) continue
            for (l in o.data.lines) {
                if (!l.box.intersects(view)) continue
                consider(MapHit.distanceToPolyline(x, y, l.points), routeTol) { MapSelection.Route(l.name, o.label) }
            }
        }
        best?.let { return it }

        if (parksOn) {
            val park = base?.parks?.firstOrNull {
                it.name.isNotEmpty() && it.box.contains(x, y) && MapHit.inside(x, y, it.points)
            }
            if (park != null) return MapSelection.Park(park.name)
        }
        return null
    }
}

/** A layer's name in the app's own words, falling back to the English name the bundle carries. */
fun mapLayerName(id: String, fallback: String = ""): String {
    val key = "layer." + id.replace(":", ".")
    val s = L.t(key)
    return if (s == key) fallback.ifEmpty { id } else s
}
