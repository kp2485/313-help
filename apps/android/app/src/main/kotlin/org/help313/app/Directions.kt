// The street graph and the transit network, as the app holds them. No android.* class in this file, so `:core`
// compiles it and CI checks it on a plain JDK.
//
// The rules themselves are in `:query` (Streets.kt, Walk.kt, TransitPlan.kt), which is the Kotlin copy of
// packages/query and is held to schema/fixtures/14 and /15. What is here is only the *holding*: which bundle
// files the graph is built from, the one key it is cached under, and the three states a screen can be in while
// it is being built.
//
// Nothing here touches the network or a person's location. The graph is arithmetic on files the app has already
// downloaded and already checked the signature of.
package org.help313.app

import org.help313.query.Json
import org.help313.query.PackedPoints
import org.help313.query.PackedRoutes
import org.help313.query.PackedServes
import org.help313.query.PackedStreets
import org.help313.query.StreetGraph
import org.help313.query.StreetGraphCache
import org.help313.query.TransitLayerFiles
import org.help313.query.TransitNetwork
import org.help313.query.buildStreetGraph
import org.help313.query.buildTransitNetwork

object Directions {

    /** The bundle files the walking graph is built from, in the order they are passed to `buildStreetGraph`. */
    val STREET_FILES = listOf("map/base.json", "map/streets.json")

    /**
     * The key the built graph is cached under: the sha256 of the **signed index's own** sha256 for each street
     * file, in a fixed order. A new bundle is a new key and builds once; an unchanged one is reused for the life
     * of the process. Nothing about a person is in it, and no file's contents are re-hashed — the index has
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
     * answer for the second or two the noding takes on a cheap phone, and it is never skipped by drawing a route
     * from a half-built graph.
     */
    sealed class State {
        /** Nothing asked for yet. */
        object Idle : State()

        /** The graph is being built on `Work.io`. A screen shows "Getting the map ready". */
        object Building : State()

        class Ready(val graph: StreetGraph, val network: TransitNetwork?) : State()

        /** No street files in this bundle, or they could not be read. A screen says so; it invents no route. */
        class Unavailable(val why: String) : State()
    }

    @Volatile
    private var state: State = State.Idle

    @Volatile
    private var buildingKey: String? = null

    /** How long the last build took, in milliseconds. A number for the timing log, never a screen. */
    @Volatile
    var lastBuildMs: Long = 0
        private set

    @Synchronized
    fun current(): State = state

    @Synchronized
    fun reset() {
        state = State.Idle
        buildingKey = null
        StreetGraphCache.clear()
    }

    /** True when this key is already built, so a screen can go straight to the route with no "ready" state. */
    fun isReady(key: String): Boolean = StreetGraphCache.holds(key)

    /**
     * Build (or fetch from the cache) the graph for `key`, then hand the state to `onState` — once with
     * `Building` if any work is needed, and once with the result. `read` is called on the calling thread, so the
     * caller decides whether that is a background one; `MainActivity` runs the whole thing on `Work.io`.
     *
     * `read` returns null when the bundle has no street files at all, which is `Unavailable`, not an error.
     */
    fun prepare(
        key: String,
        read: () -> Pair<List<PackedStreets>, List<TransitLayerFiles>>?,
        onState: (State) -> Unit,
    ) {
        synchronized(this) {
            val held = state
            if (held is State.Ready && held.graph.key == "${org.help313.query.STREET_GRAPH_VERSION}:$key") {
                onState(held)
                return
            }
            if (buildingKey == key) return                     // a second tap while the first build runs
            buildingKey = key
            state = State.Building
        }
        onState(State.Building)
        val next = try {
            val files = read()
            if (files == null || files.first.isEmpty()) {
                State.Unavailable("no street files in this bundle")
            } else {
                val t0 = System.currentTimeMillis()
                val g = StreetGraphCache.get(key) { buildStreetGraph(files.first, key) }
                lastBuildMs = System.currentTimeMillis() - t0
                Trace.say("directions.graph_build", lastBuildMs)
                val net = if (files.second.isEmpty()) null else buildTransitNetwork(files.second)
                State.Ready(g, net)
            }
        } catch (t: Throwable) {
            State.Unavailable(t.javaClass.simpleName)
        }
        synchronized(this) {
            state = next
            buildingKey = null
        }
        onState(next)
    }
}
