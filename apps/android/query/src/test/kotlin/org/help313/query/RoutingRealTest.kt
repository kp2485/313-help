// The routing rules against the real committed data, with no network at all. The Kotlin mirror of
// packages/query/test/routing-real.test.ts.
//
// Like the pipeline's own convention, every case skips when the files are not in the checkout: `data/bundle/v1`
// is never committed, so a fresh clone runs the fixtures and skips these. What they hold on to is the shape of
// the real city — the numbers in docs/research/2026-09-22-offline-directions.md — so that a change to the
// noding, the snapping or the cost model has to be a decision somebody makes rather than a surprise.
package org.help313.query

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class RoutingRealTest {

    private val repo: File = fixturesDir().parentFile.parentFile
    private val bundle = File(repo, "data/bundle/v1")
    private val ingested = File(repo, "data/ingested/basemap")

    private fun read(f: File): Json = Json.parse(f.readBytes())

    /** The main-road file and every cell by key, as a client holds them; null when neither is in the checkout. */
    private fun streetParts(): Pair<PackedStreets, List<PackedStreets>>? {
        if (File(bundle, "map/base.json").isFile) {
            val base = PackedStreets.fromJson(read(File(bundle, "map/base.json")))
            val cells = read(File(bundle, "map/streets.json"))["cells"]?.obj ?: emptyMap()
            return base to cells.keys.sorted().map { PackedStreets.fromJson(cells.getValue(it)) }
        }
        if (File(ingested, "base.json").isFile) {
            val base = PackedStreets.fromJson(read(File(ingested, "base.json")))
            val cells = (File(ingested, "cells").listFiles() ?: emptyArray()).sortedBy { it.name }
                .map { PackedStreets.fromJson(read(it)) }
            return base to cells
        }
        return null
    }

    private class Row(val id: String, val lat: Double, val lon: Double)

    private fun listings(): List<Row> {
        val dir = File(bundle, "category")
        if (!dir.isDirectory) return emptyList()
        val out = ArrayList<Row>()
        for (f in (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".json") }.sortedBy { it.name }) {
            val j = read(f)
            val rows = if (j is Json.Arr) j.items else (j["rows"]?.arr ?: emptyList())
            for (r in rows) {
                val lat = r["lat"]?.num
                val lon = r["lon"]?.num
                if (lat != null && lon != null) out.add(Row(r["id"]?.str ?: "", lat, lon))
            }
        }
        return out
    }

    private fun transitLayers(): List<TransitLayerFiles> {
        val dir = File(bundle, "map/transit")
        if (!dir.isDirectory) return emptyList()
        val out = ArrayList<TransitLayerFiles>()
        for (f in (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".net.json") }.sortedBy { it.name }) {
            val net = read(f)
            if (net["routes"] == null) continue              // a stops .net.json; picked up through its routes file
            val stopsId = net["stops_layer"]?.str ?: net["id"]?.str ?: continue
            val stopsFile = File(dir, "$stopsId.json")
            if (!stopsFile.isFile) continue
            val servesFile = File(dir, "$stopsId.net.json")
            val serves = if (stopsId != net["id"]?.str && servesFile.isFile) {
                val s = read(servesFile)
                PackedServes(
                    s["route_ids"]?.arr?.map { it.str ?: "" } ?: emptyList(),
                    s["serves"]?.arr?.map { r -> r.arr.mapNotNull { it.int } } ?: emptyList(),
                )
            } else {
                null
            }
            out.add(TransitLayerFiles(PackedPoints.fromJson(read(stopsFile)), PackedRoutes.fromJson(net), serves))
        }
        return out
    }

    private val parts by lazy { streetParts() }
    private val files by lazy { parts?.let { listOf(it.first) + it.second } ?: emptyList() }
    private val rows by lazy { listings() }
    private val layers by lazy { transitLayers() }
    private val graph by lazy { if (files.isEmpty()) null else buildStreetGraph(files, "real") }

    private fun skip(why: String): Boolean {
        println("$why - skipping")
        return true
    }

    @Test
    fun theGraphIsTheSizeAndShapeTheWholeAreaMeasured() {
        val g = graph ?: return Unit.also { skip("no street files") }
        val s = g.stats
        // The study (Detroit and three cities, before the 2026-09-22 basemap fix): 23,863 nodes, 40,342 edges, 45
        // components, largest 99.5%, built in 183 ms. The whole area (every city and township a DDOT or SMART bus
        // stops in, 2026-09-24): 108,820 nodes, 163,723 edges, 375 components, largest 98.9%, 15.4% dead ends
        // (TIGER's suburban courts and cul-de-sacs). That size is why a phone builds a trip's window, not this graph.
        assertTrue("nodes ${g.nodeCount}", g.nodeCount in 95_001..124_999)
        assertTrue("edges ${g.edgeCount}", g.edgeCount in 140_001..189_999)
        assertTrue(s.largestComponent.toDouble() / g.nodeCount > 0.98)
        assertTrue(s.deadEnds.toDouble() / g.nodeCount < 0.17)
        assertTrue("crossings ${s.crossings}", s.crossings > 60_000)
        assertTrue("snapped ${s.snapped}", s.snapped > 40_000)
        println(
            "streets graph: ${g.nodeCount} nodes, ${g.edgeCount} edges, ${s.components} components, " +
                "largest ${"%.1f".format(100.0 * s.largestComponent / g.nodeCount)}%, " +
                "dead ends ${"%.1f".format(100.0 * s.deadEnds / g.nodeCount)}%, " +
                "${s.crossings} crossings + ${s.snapped} snapped ends, built in ${s.buildMs} ms",
        )
    }

    @Test
    fun itCarriesTheCitysSafetyFields() {
        val g = graph ?: return Unit.also { skip("no street files") }
        assertTrue(g.hasSafety)
        var onHin = 0
        for (w in g.waySafety.indices) if ((g.waySafety[w] and 1) != 0) onHin++
        assertTrue("$onHin ways on the HIN", onHin > 50)
        println("safety bytes: $onHin of ${g.waySafety.size} ways are on the City's High Injury Network")
    }

    @Test
    fun itBuildsWithoutAnAccidentalQuadratic() {
        val g = graph ?: return Unit.also { skip("no street files") }
        // 984 ms for the whole area on a Mac in TypeScript; a CI runner is slower. What this catches is an
        // accidental quadratic, not a slow laptop. No phone builds this graph: it builds a trip's window (below).
        assertTrue("built in ${g.stats.buildMs} ms", g.stats.buildMs < 16_000)
    }

    @Test
    fun theCacheBuildsOncePerBundle() {
        val g = graph ?: return Unit.also { skip("no street files") }
        StreetGraphCache.clear()
        assertTrue(!StreetGraphCache.holds("abc"))
        var built = 0
        val first = StreetGraphCache.get("abc") { built++; g }
        val again = StreetGraphCache.get("abc") { built++; g }
        assertEquals(1, built)
        assertTrue(first === again)
        assertTrue(StreetGraphCache.holds("abc"))
        assertEquals("$STREET_GRAPH_VERSION:abc", first.key)
        StreetGraphCache.clear()
    }

    @Test
    fun twentyListingPairsRouteWellUnderFiftyMillisecondsEach() {
        val g = graph ?: return Unit.also { skip("no street files") }
        if (rows.size < 40) return Unit.also { skip("no built bundle") }
        var seed = 7L
        fun rnd(): Double { seed = (seed * 1103515245 + 12345) and 0x7fffffff; return seed.toDouble() / 0x7fffffff }
        val times = ArrayList<Double>()
        var found = 0
        for (i in 0 until 20) {
            val a = rows[(rnd() * rows.size).toInt()]
            val b = rows[(rnd() * rows.size).toInt()]
            val t = System.nanoTime()
            val r = walkRoute(g, LatLon(a.lat, a.lon), LatLon(b.lat, b.lon))
            times.add((System.nanoTime() - t) / 1e6)
            if (r != null) found++
        }
        times.sort()
        println("20 listing pairs: median ${"%.1f".format(times[10])} ms, max ${"%.1f".format(times[19])} ms, $found routed")
        assertTrue("$found routed", found >= 18)
        assertTrue("median ${times[10]} ms", times[10] < 50)
        assertTrue("max ${times[19]} ms", times[19] < 500)
    }

    // The study's own sample: Woodward at W Grand Blvd to Auntie Na's Village free food boxes, 12028 Yellowstone.
    @Test
    fun itReproducesTheStudysSampleRoute() {
        val g = graph ?: return Unit.also { skip("no street files") }
        val route = walkRoute(g, LatLon(42.3697, -83.0742), LatLon(42.377459, -83.135296))
        assertTrue("no route", route != null)
        route!!
        println(
            "sample route: ${"%.2f".format(route.metres / 1000)} km " +
                "(straight ${"%.2f".format(route.straightMetres / 1000)} km), " +
                "snapped ${"%.0f".format(route.startOffMetres)} m / ${"%.0f".format(route.endOffMetres)} m, " +
                "${route.settled} settled, ${route.steps.size} steps: " +
                route.steps.filter { it.metres > 100 }.joinToString(" > ") { "${it.street} ${Math.round(it.metres)}" },
        )
        assertTrue(route.metres > 5_000 && route.metres < 9_000)
        assertTrue(route.straightMetres > 5_000)
        assertTrue(route.startOffMetres < 120)
        assertTrue(route.endOffMetres < 120)
        // it ends on the pantry's own street, and every step names a street a person can read off a sign
        assertEquals("Yellowstone St", route.steps.last().street)
        assertTrue(route.steps.all { it.street.isNotEmpty() })
        // the drawn line follows the streets, so it has far more vertices than it has turns
        assertTrue(route.polyline.size > route.steps.size)
    }

    @Test
    fun itRoutesToTheStreetOutsideNeverToTheDoor() {
        val g = graph ?: return Unit.also { skip("no street files") }
        if (rows.size < 40) return Unit.also { skip("no built bundle") }
        var off = 0.0
        var n = 0
        for (row in rows.take(60)) {
            val r = walkRoute(g, LatLon(42.3314, -83.0458), LatLon(row.lat, row.lon)) ?: continue
            off += r.endOffMetres; n++
            val last = r.polyline.last()
            val d = metresBetween(LatLon(last[1], last[0]), LatLon(row.lat, row.lon))
            assertTrue("$d vs ${r.endOffMetres}", Math.abs(d - r.endOffMetres) < 0.5)
        }
        assertTrue("$n routed", n > 30)
        println("route ends: mean ${"%.0f".format(off / n)} m from the door, over $n listings")
    }

    @Test
    fun theTransitNetworkCarriesEveryStopAndRouteTheIngestPublished() {
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        val net = buildTransitNetwork(layers)
        assertTrue("${net.stops.size} stops", net.stops.size > 9_000)
        assertTrue("${net.routes.size} routes", net.routes.size > 70)
        val withHeadway = net.routes.count { it.headway != null }
        assertTrue("$withHeadway with a headway", withHeadway >= 37)   // DDOT publishes one for all 37
        println("transit: ${net.stops.size} stops, ${net.routes.size} routes, $withHeadway with a published headway")
    }

    @Test
    fun aStopIsWithin400mOfNinetyPercentOfOurListings() {
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        if (rows.size < 40) return Unit.also { skip("no built bundle") }
        val net = buildTransitNetwork(layers)
        val near = rows.count { stopsNear(net, LatLon(it.lat, it.lon), 400.0).isNotEmpty() }
        println("transit coverage: $near of ${rows.size} listings have a stop within 400 m (${100 * near / rows.size}%)")
        assertTrue(near.toDouble() / rows.size > 0.9)                  // the study measured 92%
    }

    @Test
    fun itPlansTheStudysTripWithNoTimeAnywhereInIt() {
        val g = graph ?: return Unit.also { skip("no street files") }
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        val net = buildTransitNetwork(layers)
        val t = System.nanoTime()
        val plans = plan(g, net, LatLon(42.3697, -83.0742), LatLon(42.377459, -83.135296))
        val ms = (System.nanoTime() - t) / 1e6
        assertTrue("no plans", plans.isNotEmpty())
        for (p in plans) {
            println(
                "plan ${p.range[0]}-${p.range[1]} min, ${p.changes} change(s), " +
                    "walk ${Math.round(p.walkMetres)} m: " + p.legs.joinToString(" > ") { l ->
                        when (l) {
                            is WalkLeg -> "walk ${Math.round(l.metres)} m"
                            is RideLeg -> "ride ${l.routeId} ${l.stops} stops" +
                                (l.headwayMinutes?.let { " every ${it.toInt()}" } ?: "")
                        }
                    },
            )
            assertTrue(p.changes <= 1)
            assertTrue(p.range[1] > p.range[0])
            for (l in p.legs) {
                if (l !is RideLeg) continue
                assertTrue(l.fromStop.name.isNotEmpty())
                assertTrue(l.headwayMinutes == null || l.headwayMinutes > 0)
                assertTrue(l.polyline.size > 1)
                assertTrue("made-up route ${l.routeId}", net.routes.any { it.id == l.routeId })
            }
        }
        println("plan computed in ${"%.0f".format(ms)} ms")
        assertTrue("plan took $ms ms", ms < 4_000)
    }

    @Test
    fun itWalksTheFourBlocksInsteadOfWaitingForABus() {
        val g = graph ?: return Unit.also { skip("no street files") }
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        val net = buildTransitNetwork(layers)
        val plans = plan(g, net, LatLon(42.3314, -83.0458), LatLon(42.3353, -83.0495))
        assertTrue(plans.isNotEmpty())
        assertTrue(plans[0].legs.all { it is WalkLeg })
    }

    // ---- the trip window (schema/query-spec.md "The trip window") ----------------------------------------------

    /** What a person reads of a plan: its legs, their routes and stops, and each distance to the metre. */
    private fun shape(ps: List<Itinerary>): List<String> = ps.map { p ->
        p.legs.joinToString(" > ") { l ->
            when (l) {
                is WalkLeg -> "walk ${Math.round(l.metres)}"
                is RideLeg -> "${l.routeId} ${l.fromStop.index}-${l.toStop.index}"
            }
        }
    }

    /** The graph a phone builds for one trip: only the streets its window touches. Never cached. */
    private fun windowGraph(net: TransitNetwork, from: LatLon, to: LatLon): Pair<TripWindow, StreetGraph> {
        val (base, cells) = parts!!
        val w = tripWindow(net, from, to)
        return w to buildStreetGraph(windowFiles(base, cells, w), "window")
    }

    @Test
    fun aTripAcrossDetroitBuildsASmallPartOfTheArea() {
        val whole = graph ?: return Unit.also { skip("no street files") }
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        val net = buildTransitNetwork(layers)
        val (w, g) = windowGraph(net, LatLon(42.3697, -83.0742), LatLon(42.377459, -83.135296))
        println("window: ${w.boxes.size} boxes, ${g.nodeCount} of ${whole.nodeCount} nodes, built in ${g.stats.buildMs} ms")
        assertTrue("${g.nodeCount} of ${whole.nodeCount}", g.nodeCount < whole.nodeCount / 4)
    }

    @Test
    fun theWindowGivesTheSamePlansAsTheWholeGraphForNamedTrips() {
        val whole = graph ?: return Unit.also { skip("no street files") }
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        val net = buildTransitNetwork(layers)
        val trips = listOf(
            Triple("the study's trip", LatLon(42.3697, -83.0742), LatLon(42.377459, -83.135296)),
            Triple("four blocks downtown", LatLon(42.3314, -83.0458), LatLon(42.3353, -83.0495)),
            Triple("Detroit to Pontiac", LatLon(42.3314, -83.0458), LatLon(42.6389, -83.2910)),
            Triple("Dearborn to Warren", LatLon(42.3224, -83.1763), LatLon(42.4895, -83.0147)),
            Triple("Southfield to Royal Oak", LatLon(42.4734, -83.2219), LatLon(42.4895, -83.1446)),
        )
        var compared = 0
        for ((name, from, to) in trips) {
            val full = plan(whole, net, from, to)
            val part = plan(windowGraph(net, from, to).second, net, from, to)
            assertEquals(name, shape(full), shape(part))
            if (full.isNotEmpty()) compared++
            println("$name: ${shape(full).firstOrNull() ?: "(no plan)"}")
        }
        assertTrue("$compared compared", compared >= 4)
    }

    @Test
    fun theWindowGivesTheSamePlansAsTheWholeGraphForListingPairs() {
        val whole = graph ?: return Unit.also { skip("no street files") }
        if (layers.isEmpty()) return Unit.also { skip("no transit layers") }
        if (rows.size < 40) return Unit.also { skip("no built bundle") }
        val net = buildTransitNetwork(layers)
        var seed = 11L
        fun rnd(): Double { seed = (seed * 1103515245 + 12345) and 0x7fffffff; return seed.toDouble() / 0x7fffffff }
        var compared = 0
        for (i in 0 until 24) {
            val a = rows[(rnd() * rows.size).toInt().coerceAtMost(rows.size - 1)]
            val b = rows[(rnd() * rows.size).toInt().coerceAtMost(rows.size - 1)]
            val from = LatLon(a.lat, a.lon)
            val to = LatLon(b.lat, b.lon)
            val full = plan(whole, net, from, to)
            val part = plan(windowGraph(net, from, to).second, net, from, to)
            assertEquals("${a.id} -> ${b.id}", shape(full), shape(part))
            if (full.isNotEmpty()) compared++
        }
        assertTrue("$compared compared", compared >= 6)
    }
}
