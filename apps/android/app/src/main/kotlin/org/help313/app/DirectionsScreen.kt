// Our own directions, computed on this phone (DECISIONS 2026-09-22). The Kotlin copy of apps/web/src/dirscreen.ts.
//
// **The screen is traceless.** It is reached only through [Route.Directions], which [Route.isTraceless] answers
// true for, so a trip is never put back after a recreation and never sits in the retained stack. The origin is
// worse than the destination and is treated as such: it lives in `MainActivity.near` for as long as the activity
// is alive, it is handed to the planner and to nothing else, and it is never written down and never sent. The two
// people this was built for are a survivor with no phone service and a person with no signal looking for food;
// where they are standing is the one fact that must never leave the device.
//
// **The words are the contract.** Every sentence comes from DirWords.kt, which the spec's wording rules are
// written into and which `:core` runs on a plain JDK in all four languages: the estimate is a range, a headway is
// only ever the agency's own sentence, nothing is called safe or accessible, and the last leg ends at the street.
//
// **The numbered steps are the source of truth.** The map beside them is the extra, exactly as it is everywhere
// else in this app: the route has a text equivalent (DirRoute.text), every marker on it is a TalkBack node of its
// own (MapView.features), and a person who never sees the picture loses nothing.
package org.help313.app

import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import org.help313.query.Itinerary
import org.help313.query.LatLon
import org.help313.query.PackedStreets
import org.help313.query.TransitLayerFiles
import org.help313.query.plan as planTrip

object DirectionsScreen {

    /** What the screen is doing. Every one of these states carries the caveat pair; none of them is silent. */
    enum class Phase { NEED_ORIGIN, BUILDING, PLANNING, READY, EMPTY, NO_FILES, FAILED }

    // ---- this visit only, and nothing in it is ever written or sent -------------------------------------------

    private var dest: LatLon? = null
    private var destName = ""
    private var phase = Phase.NEED_ORIGIN
    private var plans: List<Itinerary> = emptyList()
    private var chosen = -1
    private var stepList: List<DirStep> = emptyList()
    private var stepAt = -1
    private var offRoute = false
    private var following = false
    private var hasTransit = false
    /** The origin>destination the plans on screen belong to, and the one the work in flight is for. */
    private var planFor = ""
    private var workingFor = ""
    private var planning = 0

    /** The one live location listener the follow-along uses, so it can always be taken off again. */
    private var watcher: android.location.LocationListener? = null
    private var livePos: LatLon? = null

    private val say: Say = { key, params -> L.t(key, params) }

    private fun keyOf(from: LatLon?, to: LatLon?): String =
        if (from == null || to == null) "" else
            String.format(java.util.Locale.US, "%.5f,%.5f>%.5f,%.5f", from.lat, from.lon, to.lat, to.lon)

    /** A new trip. Everything about the last one goes, including any plan still in flight. */
    fun open(a: MainActivity, route: Route.Directions) {
        val to = LatLon(route.lat, route.lon)
        if (dest != null && dest!!.lat == to.lat && dest!!.lon == to.lon && destName == route.name) return
        stopFollowing(a)
        dest = to
        destName = route.name
        plans = emptyList()
        chosen = -1
        stepList = emptyList()
        stepAt = -1
        offRoute = false
        planFor = ""
        phase = Phase.NEED_ORIGIN
    }

    /**
     * Leaving the screen. The graph stays — it cost a second to build and it belongs to the bundle, not to the
     * trip — and the trip does not. Called by MainActivity whenever the screen on top stops being a Directions one.
     */
    fun close(a: MainActivity) {
        stopFollowing(a)
        dest = null
        destName = ""
        plans = emptyList()
        chosen = -1
        stepList = emptyList()
        stepAt = -1
        offRoute = false
        planFor = ""
        routeView = null
        workingFor = ""
        phase = Phase.NEED_ORIGIN
    }

    /** For the tests and for a new bundle: forget the trip and the graph both. */
    fun reset() {
        dest = null
        destName = ""
        plans = emptyList()
        chosen = -1
        stepList = emptyList()
        stepAt = -1
        offRoute = false
        following = false
        watcher = null
        livePos = null
        routeView = null
        planFor = ""
        workingFor = ""
        phase = Phase.NEED_ORIGIN
        hasTransit = false
    }

    /** What is on screen, without a view: for the tests and for a bug report. Nothing about a person is in it. */
    fun state(): String =
        "$phase|plans=${plans.size}|chosen=$chosen|steps=${stepList.size}|at=$stepAt|off=$offRoute|follow=$following"

    // ---- the work ----------------------------------------------------------------------------------------------

    /**
     * The map files, then the graph, then the plan. Each step says where it has got to, out loud and on screen.
     *
     * All of it on `Work.io`: building the street graph is one to two seconds on a cheap phone (DECISIONS
     * 2026-09-22) and a phone that has to think for a second must not stop answering the person's thumb while it
     * does. `Directions.prepare` is what holds the graph, keyed by the signed index's own hashes, so a second trip
     * in the same session costs nothing.
     */
    private fun ensureWork(a: MainActivity) {
        val to = dest ?: return
        val from = a.near ?: return
        val key = keyOf(from, to)
        // Already answered, or already being answered. This is what makes the call idempotent, which matters
        // because every draw of the screen asks for it again.
        if (planFor == key || workingFor == key) return
        workingFor = key
        val index = a.store.bundle?.index
        if (index == null) {
            workingFor = ""
            phase = Phase.NO_FILES
            a.render()
            return
        }
        val held = Directions.current()
        if (held is Directions.State.Ready) {
            runPlan(a, from, to, key, held)
            return
        }
        phase = Phase.BUILDING
        a.render()
        val graphKey = Directions.graphKey(index)
        val store = a.store
        Work.io {
            Directions.prepare(graphKey, { readFiles(store) }) { st ->
                a.runOnUiThread {
                    if (workingFor != key || a.current() !is Route.Directions) return@runOnUiThread
                    when (st) {
                        is Directions.State.Building -> {
                            phase = Phase.BUILDING
                            a.render()
                        }
                        is Directions.State.Unavailable -> {
                            workingFor = ""
                            phase = Phase.NO_FILES
                            a.render()
                        }
                        is Directions.State.Ready -> runPlan(a, from, to, key, st)
                        else -> Unit
                    }
                }
            }
        }
    }

    /**
     * The street files and every transit layer that can be planned on, read from the copy this phone has already
     * checked against the signed index. Nothing here touches the network that the map has not already touched: both
     * street files are ones the Map tab downloads, so on a phone that has opened the map once, offline directions
     * cost no new bytes at all (DECISIONS 2026-09-22).
     *
     * Null when the bundle has no street files at all, which is `Unavailable` and not an error. A transit layer
     * whose files are not here is simply left out; walking is never left out.
     */
    private fun readFiles(store: BundleStore): Pair<List<PackedStreets>, List<TransitLayerFiles>>? {
        val base = runCatching { store.verifiedBytes("map/base.json") }.getOrNull() ?: return null
        val streets = runCatching { store.verifiedBytes("map/streets.json") }.getOrNull()
        val walking = Directions.streetFiles(base, streets)
        if (walking.isEmpty()) return null
        return walking to readTransit(store)
    }

    /**
     * The manifest is read here rather than taken from [MapModel], so a trip planned before the Map tab has ever
     * been opened still gets the buses. Reading it from the model instead meant the first trip of a launch was
     * planned on walking alone — found on the emulator, 2026-09-22. Every file goes through
     * [BundleStore.verifiedBytes], so it is checked against the signed index wherever it came from.
     */
    private fun readTransit(store: BundleStore): List<TransitLayerFiles> {
        val manifest = runCatching { store.verifiedBytes("places/transit.json") }.getOrNull() ?: return emptyList()
        val nets = runCatching { NetFileDecoder.transitExtras(manifest).netFiles }.getOrElse { return emptyList() }
        val shapeFiles = runCatching {
            (org.help313.query.Json.parse(manifest)["layers"]?.arr ?: emptyList())
                .mapNotNull { l ->
                    val id = l["id"]?.str
                    val file = l["file"]?.str
                    if (id.isNullOrEmpty() || file.isNullOrEmpty()) null else id to file
                }.toMap()
        }.getOrElse { return emptyList() }

        val out = ArrayList<TransitLayerFiles>()
        for ((layer, netFile) in nets) {
            runCatching {
                val routesBytes = store.verifiedBytes(netFile)
                // A `.net.json` says whose stops it rides on. Where that is a different layer, that layer's own
                // `.net.json` is the `serves` list — the same pairing the shared routing test does.
                val stopsLayer = org.help313.query.Json.parse(routesBytes)["stops_layer"]?.str ?: layer
                val stopsFile = shapeFiles[stopsLayer] ?: return@runCatching
                val stopsBytes = store.verifiedBytes(stopsFile)
                val serves = if (stopsLayer != layer) {
                    nets[stopsLayer]?.let { f -> runCatching { store.verifiedBytes(f) }.getOrNull() }
                } else {
                    null
                }
                out.add(Directions.transitLayer(stopsBytes, routesBytes, serves))
            }
        }
        return out
    }

    private fun runPlan(a: MainActivity, from: LatLon, to: LatLon, key: String, ready: Directions.State.Ready) {
        phase = Phase.PLANNING
        a.render()
        val id = ++planning
        // A phone with no transit files still gets a plan: an empty network is a real answer and the planner goes
        // on ranking the walk, which is the leg that matters most to the two people this was built for. Treating
        // "no buses" as "no way to get there" is what this used to do (found on the emulator, 2026-09-22).
        val net = ready.network ?: org.help313.query.buildTransitNetwork(emptyList())
        val buses = ready.network != null && ready.network.stops.isNotEmpty()
        Work.io {
            val found = runCatching { planTrip(ready.graph, net, from, to).take(3) }.getOrElse { emptyList() }
            a.runOnUiThread {
                if (id != planning || a.current() !is Route.Directions) return@runOnUiThread
                plans = found
                planFor = key
                workingFor = ""
                chosen = -1
                stepList = emptyList()
                stepAt = -1
                offRoute = false
                hasTransit = buses
                phase = if (plans.isEmpty()) Phase.EMPTY else Phase.READY
                a.render()
            }
        }
    }

    // ---- the screen ----------------------------------------------------------------------------------------------

    fun view(a: MainActivity, route: Route.Directions): View {
        open(a, route)
        // The origin may have changed since the last draw: a fix arrived, a junction was typed, a ZIP was typed, or
        // "Change the start" let it go. This one line is how any of that reaches the trip.
        if (a.near == null) {
            if (phase != Phase.NEED_ORIGIN) {
                phase = Phase.NEED_ORIGIN
                plans = emptyList()
                chosen = -1
                planFor = ""
                workingFor = ""
            }
        } else if (phase == Phase.NEED_ORIGIN) {
            phase = Phase.BUILDING
        }
        // The streets are asked for the moment this screen appears, so a person who types a junction fast is not
        // kept waiting on a file that was always going to be needed. It is the same basemap the Map tab draws,
        // read from the copy already checked against the signed index; nothing new is fetched on a phone with it.
        MapModel.load(a, a.store)

        val col = UI.column(a, 16)

        // Where to, and the two caveats — on EVERY state of this screen, not only on the one with a route on it.
        col.addView(UI.text(a, L.t("dir.to") + destName, 22f, R.color.ink, bold = true))
        caveats(a, col)

        if (phase == Phase.NEED_ORIGIN) {
            startCard(a, col)
            return UI.scroller(a, col)
        }

        originLine(a, col)

        when (phase) {
            Phase.BUILDING, Phase.PLANNING -> {
                val words = L.t(if (phase == Phase.PLANNING) "dir.planning" else "dir.building")
                val banner = UI.pill(a, words)
                col.addView(banner)
                banner.post { banner.announceForAccessibility(words) }
            }
            Phase.NO_FILES -> col.addView(UI.pill(a, L.t("dir.no_streets"), R.drawable.pill_warn, R.color.warn_ink))
            Phase.FAILED -> {
                col.addView(UI.pill(a, L.t("dir.failed"), R.drawable.pill_warn, R.color.warn_ink))
                col.addView(
                    UI.button(a, L.t("dir.retry"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                        planFor = ""
                        workingFor = ""
                        ensureWork(a)
                    },
                )
            }
            Phase.EMPTY -> col.addView(UI.text(a, L.t("dir.none"), 17f, R.color.muted, topDp = 16))
            Phase.READY -> if (chosen < 0) ways(a, col) else steps(a, col)
            Phase.NEED_ORIGIN -> Unit
        }

        // Asked for after the screen exists, never while it is being built: calling render from inside a half-built
        // column puts the answer on a view that this very call is about to throw away (the same mistake the Map
        // tab's first-open card made on 2026-09-21). Idempotent, so every draw may ask.
        col.post { ensureWork(a) }
        return UI.scroller(a, col)
    }

    /**
     * The caveat pair, under the destination and above everything else, on every state of the screen: these
     * directions were worked out here from public maps and nobody has checked the streets on them. Nothing on this
     * screen ever says safe, lit, accessible or step-free, and this is the sentence that says why not.
     */
    private fun caveats(a: MainActivity, col: LinearLayout) {
        col.addView(UI.text(a, L.t("dir.caveat"), 14f, R.color.muted, topDp = 8))
        col.addView(UI.text(a, L.t("dir.caveat_times"), 14f, R.color.muted, topDp = 4))
    }

    /**
     * "Where are you starting?" — the three ways in, with **the cross-street field open and first**.
     *
     * That order is this screen and no other (DECISIONS 2026-09-22): typing two streets is the only one of the
     * three that works with no satellite and no signal at all, and this screen is the one a person with neither is
     * on. Everywhere else in the app "Use my location" comes first.
     */
    private fun startCard(a: MainActivity, col: LinearLayout) {
        col.addView(UI.sectionHead(a, L.t("dir.from_head")))
        col.addView(UI.text(a, L.t("dir.from_hint"), 15f, R.color.muted))
        // The field itself is CrossBox, the same control every other screen offers, with nothing added and
        // nothing taken away: all this screen does is put it first, and open it without waiting to be asked.
        a.crossWanted = a.crossWanted || a.crossText == null
        CrossBox.add(a, col)

        col.addView(
            UI.button(a, L.t("loc.use"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 16) {
                a.askForLocation()
            },
        )
        if (a.locationRefused) {
            col.addView(
                UI.text(a, L.t(if (a.locationPermanentlyDenied()) "loc.denied_settings" else "loc.denied"), 15f, R.color.muted, topDp = 6),
            )
        }
        ZipBox.add(a, col)
        col.addView(UI.text(a, L.t("loc.note"), 14f, R.color.muted, topDp = 4))
    }

    /** Where this trip starts, in words, and the way back to changing it. Never a coordinate, ever. */
    private fun originLine(a: MainActivity, col: LinearLayout) {
        val kind = dirStart(a.near != null, a.nearZip, a.crossText)
        val words = a.nearZip ?: a.crossText ?: ""
        col.addView(UI.text(a, dirFromWords(say, kind, words), 16f, R.color.ink, topDp = 12))
        col.addView(
            UI.button(a, L.t("dir.change_start"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                // The origin is the activity's business: it is let go here, and then the screen goes back to asking.
                stopFollowing(a)
                a.near = null
                a.nearZip = null
                a.crossText = null
                a.locateOutside = false
                chosen = -1
                plans = emptyList()
                planFor = ""
                phase = Phase.NEED_ORIGIN
                a.render()
            },
        )
    }

    /** Up to three ways to get there, in the planner's own rank order, each one a card that is also a tap. */
    private fun ways(a: MainActivity, col: LinearLayout) {
        col.addView(UI.sectionHead(a, L.t("dir.ways_head")))
        plans.forEachIndexed { i, it ->
            val label = L.t("dir.choose_label", "summary" to dirSummary(say, it))
            val card = UI.tappableCard(a, label) {
                chosen = i
                stepAt = -1
                offRoute = false
                a.render()
            }
            card.addView(UI.text(a, itineraryTitle(say, it), 18f, R.color.ink, bold = true))
            val every = cardHeadway(say, it)
            val line = listOf(legsLine(say, it), rangeWords(say, it), every).filter { w -> w.isNotEmpty() }
                .joinToString(" · ")
            card.addView(UI.text(a, line, 16f, R.color.muted, topDp = 2))
            card.addView(UI.pill(a, L.t("dir.choose")))
            col.addView(card)
        }
        // No transit files on this phone is a poorer answer, not a wrong one: walking is still ranked.
        if (!hasTransit) col.addView(UI.text(a, L.t("dir.walk_only"), 15f, R.color.muted, topDp = 12))
    }

    /** The chosen way: the route on the map, then the numbered steps, which are what the screen promises. */
    private fun steps(a: MainActivity, col: LinearLayout) {
        val it = plans.getOrNull(chosen) ?: return
        stepList = dirSteps(say, it, destName)

        val head = LinearLayout(a)
        head.orientation = LinearLayout.VERTICAL
        col.addView(UI.text(a, itineraryTitle(say, it), 20f, R.color.ink, bold = true, topDp = 12))
        col.addView(UI.pill(a, rangeWords(say, it)))
        col.addView(head)

        col.addView(routeMap(a, it))

        col.addView(
            UI.button(a, L.t("dir.other_ways"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                chosen = -1
                stopFollowing(a)
                a.render()
            },
        )
        if (a.locatePermission() != LocatePermission.DENIED) {
            col.addView(
                UI.button(
                    a, L.t(if (following) "dir.follow_stop" else "dir.follow"),
                    backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink,
                ) {
                    if (following) stopFollowing(a) else startFollowing(a)
                    a.render()
                },
            )
        }
        if (offRoute) {
            col.addView(UI.pill(a, L.t("dir.off_route"), R.drawable.pill_warn, R.color.warn_ink))
            col.addView(
                UI.button(a, L.t("dir.plan_again"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    stopFollowing(a)
                    planFor = ""
                    workingFor = ""
                    chosen = -1
                    offRoute = false
                    a.render()
                },
            )
        }

        col.addView(UI.sectionHead(a, L.t("dir.steps_head")))
        val bidi = android.text.BidiFormatter.getInstance()
        stepList.forEachIndexed { i, s ->
            // Each step is wrapped the way the web wraps it in <bdi>: the sentence is the reader's language and a
            // street name inside it is the City's own Latin, so on an Arabic screen "Warren" stays left to right
            // and the sentence around it stays right to left.
            val line = UI.text(a, bidi.unicodeWrap(s.text), 17f, if (i == stepAt) R.color.ink else R.color.ink, bold = i == stepAt, topDp = 8)
            // The number is spoken, never only drawn: "Step 3 of 9" is what tells a person where they are.
            line.contentDescription = L.t(
                "dir.follow_say",
                mapOf("n" to (i + 1).toString(), "total" to stepList.size.toString(), "text" to s.text),
            )
            line.isFocusable = true
            if (i == stepAt) {
                line.setBackgroundResource(R.drawable.pill_soft)
                line.setPaddingRelative(UI.dp(a, 10), UI.dp(a, 8), UI.dp(a, 10), UI.dp(a, 8))
            }
            col.addView(line)
        }
        col.addView(UI.text(a, L.t("dir.caveat"), 14f, R.color.muted, topDp = 12))
    }

    /**
     * The route, drawn on the same canvas the Map tab draws on — with a camera of its own, so this picture opens on
     * the whole trip and moving it never moves the city out from under the Map tab (MapView.localCamera).
     *
     * It is a picture and it says so: its own contentDescription is [DirRoute.text], the sentence that says in
     * words what the coloured line says in colour, and every marker on it is a node of its own for TalkBack.
     */
    private fun routeMap(a: MainActivity, trip: Itinerary): View {
        val map = MapView(a)
        map.localCamera = MapCamera(0.0, 0.0, MapCamera.MIN_SCALE, 1.0, 1.0)
        map.greenwayOn = false
        map.dotsOn = false
        map.overlays = emptyList()
        map.subway = null
        map.here = null
        val active = if (stepAt >= 0) stepList.getOrNull(stepAt)?.leg ?: -1 else -1
        val route = dirRoute(say, trip, destName, active)
        map.route = route
        map.contentDescription = joinParts(listOf(L.t("map.label_route", "name" to destName), route.text))
        val fit = dirFitPoints(trip)
        map.onLocalSized = { map.fitLocally(fit, 500.0) }
        val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, UI.dp(a, 220))
        p.topMargin = UI.dp(a, 12)
        map.layoutParams = p
        routeView = map
        return map
    }

    /** The view drawn last, so the follow-along can move its camera without redrawing the whole screen. */
    private var routeView: MapView? = null

    // ---- following along -------------------------------------------------------------------------------------
    // There is no rerouting here and there is not going to be: a phone that quietly changes the route under a
    // person walking down a street at night is worse than one that says "you are off the route" and waits to be
    // asked. The whole of the logic is: which step is nearest, and are we further than OFF_ROUTE_M from the line.
    //
    // The listener is `ACCESS_COARSE_LOCATION` and nothing else, exactly as every other location in this app is,
    // and what it hands back is used on this phone and thrown away: it is never written down and never sent.

    private fun startFollowing(a: MainActivity) {
        if (following) return
        if (a.locatePermission() != LocatePermission.GRANTED) {
            a.askForLocation()
            return
        }
        val lm = a.getSystemService(android.content.Context.LOCATION_SERVICE) as? android.location.LocationManager ?: return
        val provider = listOf(android.location.LocationManager.NETWORK_PROVIDER, android.location.LocationManager.GPS_PROVIDER)
            .firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) } ?: return
        val listener = object : android.location.LocationListener {
            override fun onLocationChanged(location: android.location.Location) = arrived(a, location)
            override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        val started = runCatching { lm.requestLocationUpdates(provider, 5_000L, 10f, listener, a.mainLooper) }.isSuccess
        if (!started) return
        watcher = listener
        following = true
        a.render()
        routeView?.announceForAccessibility(L.t("dir.follow_on_say"))
    }

    private fun stopFollowing(a: MainActivity) {
        val held = watcher
        watcher = null
        livePos = null
        if (held != null) {
            val lm = a.getSystemService(android.content.Context.LOCATION_SERVICE) as? android.location.LocationManager
            runCatching { lm?.removeUpdates(held) }
        }
        if (following) {
            following = false
            stepAt = -1
            routeView?.announceForAccessibility(L.t("dir.follow_off_say"))
        }
    }

    private fun arrived(a: MainActivity, location: android.location.Location) {
        val trip = plans.getOrNull(chosen) ?: return
        val at = LatLon(location.latitude, location.longitude)
        livePos = at
        val wasStep = stepAt
        val wasOff = offRoute
        offRoute = metresFromRoute(at, trip.legs.map { it.polyline }) > OFF_ROUTE_M
        stepAt = currentStep(at, trip, stepList)
        // The map keeps the person in view. It jumps rather than eases, which is the right answer when the phone's
        // animator scale is 0 and an acceptable one when it is not: nothing on this screen animates at all.
        routeView?.centreLocally(at, 400.0)
        if (stepAt != wasStep || offRoute != wasOff) {
            a.render()
            val words = if (offRoute) {
                L.t("dir.off_route")
            } else {
                L.t(
                    "dir.follow_say",
                    mapOf(
                        "n" to (stepAt + 1).toString(),
                        "total" to stepList.size.toString(),
                        "text" to (stepList.getOrNull(stepAt)?.text ?: ""),
                    ),
                )
            }
            routeView?.announceForAccessibility(words)
        }
    }
}
