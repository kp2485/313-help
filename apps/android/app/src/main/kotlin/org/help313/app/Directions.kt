// The street files and the transit network, as the app holds them. No android.* class in this file, so `:core`
// compiles it and CI checks it on a plain JDK.
//
// The rules themselves are in `:query` (Streets.kt, Walk.kt, TransitPlan.kt, Window.kt), which is the Kotlin copy
// of packages/query and is held to schema/fixtures/14, /15 and /16. What is here is only the *holding*: which
// bundle files the walking graph is built from, the one key the decoded files are held under, the three states a
// screen can be in while they are read, and the one call that plans a trip.
//
// Since the area widened to every city and township a DDOT or SMART bus stops in (2026-09-24), the whole street map
// is ~110,000 nodes — a second on a laptop and many on a cheap phone — so **no graph of all of it is ever built**.
// The decoded street files are held once per bundle; each plan builds a graph of only the streets that trip can
// walk on (`tripWindow`, `windowFiles`; schema/query-spec.md "The trip window") and drops it with the answer.
// **A window graph is never cached**: it is the streets round two points a person asked about, so a cache of them
// would be a record of their trips.
//
// Nothing here touches the network or a person's location beyond the two points of the one trip being planned.
// The graph is arithmetic on files the app has already downloaded and already checked the signature of.
package org.help313.app

import org.help313.query.Itinerary
import org.help313.query.Json
import org.help313.query.LatLon
import org.help313.query.PackedPoints
import org.help313.query.PackedRoutes
import org.help313.query.PackedServes
import org.help313.query.PackedStreets
import org.help313.query.StreetGraph
import org.help313.query.TransitLayerFiles
import org.help313.query.TransitNetwork
import org.help313.query.buildStreetGraph
import org.help313.query.buildTransitNetwork
import org.help313.query.plan
import org.help313.query.tripWindow
import org.help313.query.windowFiles

object Directions {

    /** The bundle files the walking graph is built from, in the order they are passed to `buildStreetGraph`. */
    val STREET_FILES = listOf("map/base.json", "map/streets.json")

    /**
     * The key the decoded street files are held under: the sha256 of the **signed index's own** sha256 for each
     * street file, in a fixed order. A new bundle is a new key and is read once; an unchanged one is reused for the
     * life of the process. Nothing about a person is in it, and no file's contents are re-hashed — the index has
     * already been verified against a pinned key, so its hashes are the trustworthy ones.
     */
    fun graphKey(index: BundleIndex): String {
        val text = STREET_FILES.joinToString("\n") { "$it=${index.files[it]?.sha256 ?: ""}" }
        return BundleCheck.sha256Hex(text.toByteArray(Charsets.UTF_8))
    }

    /**
     * `map/base.json` plus every cell of `map/streets.json`, cells in sorted order so two phones with the same
     * bundle build the same graph. `streets` may be null: an older bundle carried only the base.
     */
    fun streetFiles(base: ByteArray, streets: ByteArray?): List<PackedStreets> {
        val out = ArrayList<PackedStreets>()
        out.add(PackedStreets.fromJson(Json.parse(base)))
        if (streets != null) {
            val cells = Json.parse(streets)["cells"]?.obj ?: emptyMap()
            for (k in cells.keys.sorted()) out.add(PackedStreets.fromJson(cells.getValue(k)))
        }
        return out
    }

    /** One transit layer: its stops file, its routes `.net.json`, and the stops' own `serves` when separate. */
    fun transitLayer(stops: ByteArray, routes: ByteArray, serves: ByteArray?): TransitLayerFiles =
        TransitLayerFiles(
            stops = PackedPoints.fromJson(Json.parse(stops)),
            routes = PackedRoutes.fromJson(Json.parse(routes)),
            serves = serves?.let {
                val s = Json.parse(it)
                PackedServes(
                    s["route_ids"]?.arr?.map { r -> r.str ?: "" } ?: emptyList(),
                    s["serves"]?.arr?.map { r -> r.arr.mapNotNull { v -> v.int } } ?: emptyList(),
                )
            },
        )

    /**
     * What a directions screen is looking at. `Building` is the "Getting the map ready" state: it is the honest
     * answer while the street and transit files are read and decoded, and it is never skipped by planning on
     * half-read files.
     */
    sealed class State {
        /** Nothing asked for yet. */
        object Idle : State()

        /** The files are being read on `Work.io`. A screen shows "Getting the map ready". */
        object Building : State()

        /**
         * The street files — `map/base.json` first, then every cell of `map/streets.json` in key order — and the
         * transit network, for the bundle `key` names. No street graph: each trip builds its own window
         * ([planTrip]).
         */
        class Ready(val key: String, val streets: List<PackedStreets>, val network: TransitNetwork?) : State()

        /** No street files in this bundle, or they could not be read. A screen says so; it invents no route. */
        class Unavailable(val why: String) : State()
    }

    @Volatile
    private var state: State = State.Idle

    @Volatile
    private var buildingKey: String? = null

    /**
     * Everyone who asked for a key while that key was already being built, answered when the build ends. Without
     * this a second caller was told `Building` by nobody and the result by nobody, and a screen that had moved on
     * from the first caller's trip (back, then Directions to somewhere else, inside the second the build takes)
     * sat on "Getting the map ready" for good.
     */
    private val waiting = HashMap<String, MutableList<(State) -> Unit>>()

    /** How long the last read took, in milliseconds. A number for the timing log, never a screen. */
    @Volatile
    var lastBuildMs: Long = 0
        private set

    @Synchronized
    fun current(): State = state

    @Synchronized
    fun reset() {
        state = State.Idle
        buildingKey = null
    }

    /** True when this key is already read, so a screen can go straight to the route with no "ready" state. */
    @Synchronized
    fun isReady(key: String): Boolean = (state as? State.Ready)?.key == key

    /**
     * Read (or reuse) the files for `key`, then hand the state to `onState` — once with
     * `Building` if any work is needed, and once with the result. `read` is called on the calling thread, so the
     * caller decides whether that is a background one; `MainActivity` runs the whole thing on `Work.io`.
     *
     * **Every caller gets its result.** A call for a key that is already being built does not build it again: it
     * is told `Building` at once and then the same result as the call that started the build, on that call's
     * thread, when the build ends.
     *
     * `read` returns null when the bundle has no street files at all, which is `Unavailable`, not an error.
     */
    fun prepare(
        key: String,
        read: () -> Pair<List<PackedStreets>, List<TransitLayerFiles>>?,
        onState: (State) -> Unit,
    ) {
        val joined = synchronized(this) {
            val held = state
            if (held is State.Ready && held.key == key) {
                onState(held)
                return
            }
            if (buildingKey == key) {
                waiting.getOrPut(key) { ArrayList() }.add(onState)   // a second ask while the first build runs
                true
            } else {
                buildingKey = key
                state = State.Building
                false
            }
        }
        onState(State.Building)
        if (joined) return
        val next = try {
            val files = read()
            if (files == null || files.first.isEmpty()) {
                State.Unavailable("no street files in this bundle")
            } else {
                val t0 = System.currentTimeMillis()
                val net = if (files.second.isEmpty()) null else buildTransitNetwork(files.second)
                lastBuildMs = System.currentTimeMillis() - t0
                Trace.say("directions.transit_build", lastBuildMs)
                State.Ready(key, files.first, net)
            }
        } catch (t: Throwable) {
            State.Unavailable(t.javaClass.simpleName)
        }
        val others = synchronized(this) {
            state = next
            if (buildingKey == key) buildingKey = null
            waiting.remove(key).orEmpty()
        }
        onState(next)
        for (other in others) other(next)
    }

    /**
     * The graph one trip is planned on: only the streets its window touches (schema/query-spec.md "The trip
     * window"), main roads first, then the cells in key order. Built for the one plan and returned to the caller,
     * who drops it: nothing here keeps it, and nothing may.
     */
    fun windowGraph(ready: State.Ready, from: LatLon, to: LatLon): StreetGraph {
        val w = tripWindow(ready.network, from, to)
        return buildStreetGraph(windowFiles(ready.streets.first(), ready.streets.drop(1), w))
    }

    /**
     * Every itinerary for one trip, best first, at most `limit`. The window graph is built here and is garbage the
     * moment this returns: **a window graph is never cached** (a cache of them would be a record of trips). A phone
     * with no transit files still gets a plan: an empty network is a real answer and the planner goes on ranking
     * the walk.
     */
    fun planTrip(ready: State.Ready, from: LatLon, to: LatLon, limit: Int = 3): List<Itinerary> {
        val net = ready.network ?: buildTransitNetwork(emptyList())
        return plan(windowGraph(ready, from, to), net, from, to).take(limit)
    }
}
