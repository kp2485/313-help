// One integrated trip plan: walk, or walk-ride-walk, or walk-ride-walk-ride-walk.
// Spec: schema/query-spec.md "Trip plans". Study: docs/research/2026-09-22-offline-directions.md §1.3, §2.
// A case-for-case Kotlin port of packages/query/src/transit-plan.ts, held to schema/fixtures/15-trip-plans.json.
//
// Kyle, 2026-09-22: "I want integrated walking and bus routes for the best user experience." So there is one
// entry point, `plan()`, and walking on its own is simply one of the candidates it ranks. Every walking leg,
// including the walk to the stop and the walk between two stops at a change, is a real A* walk on the street
// graph, so the distance and the drawn line are the streets a person actually walks.
//
// WE HAVE NO TIMETABLE AND WILL NOT PRETEND TO. No departure time, no arrival time, no live position, ever.
// A route's published headway ("about every 45 minutes on a weekday", DDOT only) is the one time-like fact we
// carry, and it enters the estimate as half a headway of waiting. The estimate leaves as a RANGE.
package org.help313.query

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

// ---- the cost model (constants, so three clients can agree) ----------------------------------
/** An average city bus, stops included: 280 m/min is about 17 km/h. It is an average, never a schedule. */
const val BUS_M_PER_MIN = 280.0
/** Waiting is taken as half the published headway. */
const val WAIT_FRACTION_OF_HEADWAY = 0.5
/** When a route publishes no headway (SMART, QLINE, the People Mover) this is the assumed wait. */
const val DEFAULT_WAIT_MIN = 15.0
/** The cost of changing vehicle at all, on top of the wait and the walk. */
const val CHANGE_PENALTY_MIN = 5.0
/** At most one change. Distance-only planning over-transfers; a plan with three changes and no times is a maze. */
const val MAX_CHANGES = 1
/** A stop is "at" a place when it is this close in a straight line; the walk to it is then routed properly. */
const val ACCESS_M = 400.0
/** How many access stops we consider at each end. */
const val MAX_ACCESS_STOPS = 8
/** A change on foot may be this long. */
const val TRANSFER_WALK_M = 150.0
/** Walking on its own is always offered up to here (3 miles). */
const val MAX_WALK_ONLY_M = 4828.0
/** How many itineraries come back. */
const val MAX_PLANS = 3

// ---- the network -----------------------------------------------------------------------------

private const val TRANSIT_SCALE = 1e5

/** `map/transit/<id>.json` — the stops layer, exactly as the bundle carries it. */
class PackedPoints(val origin: DoubleArray, val names: List<String>, val points: List<IntArray>) {
    companion object {
        fun fromJson(j: Json): PackedPoints {
            val o = j["origin"]!!.arr
            return PackedPoints(
                doubleArrayOf(o[0].num ?: 0.0, o[1].num ?: 0.0),
                j["names"]?.arr?.map { it.str ?: "" } ?: emptyList(),
                j["points"]?.arr?.map { p -> IntArray(p.arr.size) { p.arr[it].int ?: 0 } } ?: emptyList(),
            )
        }
    }
}

/** `<stops id>.net.json`, or the same two keys folded into a rail routes file. */
class PackedServes(val routeIds: List<String>, val serves: List<List<Int>>)

class PackedRouteEntry(
    val id: String, val short: String?, val long: String?, val headway: Double?, val frequent: Boolean,
    val lines: List<Int>, val stops: List<List<Int>>,
)

/** `<routes id>.net.json`. */
class PackedRoutes(
    val origin: DoubleArray,
    val names: List<String>,
    /** [nameIndex, encoded line] per drawn line. */
    val lines: List<IntArray>,
    val agency: String?,
    val system: String?,
    val routes: List<PackedRouteEntry>,
    val routeIds: List<String>?,
    val serves: List<List<Int>>?,
) {
    companion object {
        fun fromJson(j: Json): PackedRoutes {
            val o = j["origin"]!!.arr
            return PackedRoutes(
                doubleArrayOf(o[0].num ?: 0.0, o[1].num ?: 0.0),
                j["names"]?.arr?.map { it.str ?: "" } ?: emptyList(),
                j["lines"]?.arr?.map { l -> val e = l.arr[1].arr; IntArray(e.size) { e[it].int ?: 0 } } ?: emptyList(),
                j["agency"]?.str, j["system"]?.str,
                j["routes"]?.arr?.map { r ->
                    PackedRouteEntry(
                        id = r["id"]?.str ?: "", short = r["short"]?.str, long = r["long"]?.str,
                        headway = r["headway"]?.num, frequent = r["frequent"]?.bool == true,
                        lines = r["lines"]?.arr?.mapNotNull { it.int } ?: emptyList(),
                        stops = r["stops"]?.arr?.map { p -> p.arr.mapNotNull { it.int } } ?: emptyList(),
                    )
                } ?: emptyList(),
                j["route_ids"]?.arr?.map { it.str ?: "" },
                j["serves"]?.arr?.map { s -> s.arr.mapNotNull { it.int } },
            )
        }
    }
}

class TransitLayerFiles(val stops: PackedPoints, val routes: PackedRoutes, val serves: PackedServes? = null)

class TransitStop(val name: String, val lat: Double, val lon: Double, val layer: Int, val routes: MutableList<Int>) {
    val point: LatLon get() = LatLon(lat, lon)
}

class TransitRoute(
    val id: String, val short: String, val long: String, val agency: String, val system: String,
    /** The agency's own published headway in minutes, or null. Never inferred, never a timetable. */
    val headway: Double?,
    val frequent: Boolean,
    /** One list of global stop indices per direction, in the owner's travel order. */
    val patterns: List<List<Int>>,
    /** The drawn route lines, [lon, lat]. */
    val lines: List<List<DoubleArray>>,
)

class PatternPos(val route: Int, val pattern: Int, val at: Int)

/** A stop on one of a route's patterns that a plan may board or alight at. */
private class Boardable(val stop: Int, val pattern: Int, val at: Int)

class TransitNetwork(
    val stops: List<TransitStop>,
    val routes: List<TransitRoute>,
    val posOf: Map<Int, MutableList<PatternPos>>,
    val cells: Map<Long, MutableList<Int>>,
)

private const val CELL_DEG = 0.005                  // about 400 m of latitude; the stop index's bucket
private fun stopCell(lon: Double, lat: Double): Long =
    floor(lon / CELL_DEG).toLong() * 100000L + floor(lat / CELL_DEG).toLong()

private fun decodeLine(enc: IntArray, origin: DoubleArray): List<DoubleArray> {
    val out = ArrayList<DoubleArray>(enc.size / 2)
    var x = 0
    var y = 0
    var i = 0
    while (i + 1 < enc.size) {
        if (i == 0) { x = enc[0]; y = enc[1] } else { x += enc[i]; y += enc[i + 1] }
        out.add(doubleArrayOf(origin[0] + x / TRANSIT_SCALE, origin[1] + y / TRANSIT_SCALE))
        i += 2
    }
    return out
}

/** Build one network out of every transit layer the client holds. Stop and route numbers are global. */
fun buildTransitNetwork(layers: List<TransitLayerFiles>): TransitNetwork {
    val stops = ArrayList<TransitStop>()
    val routes = ArrayList<TransitRoute>()
    val posOf = LinkedHashMap<Int, MutableList<PatternPos>>()
    layers.forEachIndexed { li, layer ->
        val stopBase = stops.size
        val routeBase = routes.size
        val o = layer.stops.origin
        for (p in layer.stops.points) {
            val nameIdx = p[0]
            stops.add(
                TransitStop(
                    name = if (nameIdx >= 0) (layer.stops.names.getOrNull(nameIdx) ?: "") else "",
                    lon = o[0] + p[1] / TRANSIT_SCALE, lat = o[1] + p[2] / TRANSIT_SCALE,
                    layer = li, routes = ArrayList(),
                ),
            )
        }
        val agency = layer.routes.agency ?: ""
        val system = layer.routes.system ?: ""
        for (r in layer.routes.routes) {
            routes.add(
                TransitRoute(
                    id = r.id, short = r.short ?: "", long = r.long ?: "", agency = agency, system = system,
                    headway = if (r.headway != null && r.headway > 0) r.headway else null,
                    frequent = r.frequent,
                    patterns = r.stops.map { p -> p.map { stopBase + it } },
                    lines = r.lines.map { i -> decodeLine(layer.routes.lines.getOrNull(i) ?: IntArray(0), layer.routes.origin) },
                ),
            )
        }
        val serves = layer.serves?.serves ?: layer.routes.serves ?: emptyList()
        val routeIds = layer.serves?.routeIds ?: layer.routes.routeIds ?: layer.routes.routes.map { it.id }
        serves.forEachIndexed { i, list ->
            val stop = stops.getOrNull(stopBase + i) ?: return@forEachIndexed
            for (ri in list) {
                val id = routeIds.getOrNull(ri)
                // An empty id is falsy in the TypeScript, and falls through to the positional lookup.
                val at = if (!id.isNullOrEmpty()) {
                    routes.withIndex().firstOrNull { (k, x) -> k >= routeBase && x.id == id }?.index ?: -1
                } else {
                    routeBase + ri
                }
                if (at >= 0) stop.routes.add(at)
            }
        }
    }
    // a stop can also learn its routes from the patterns alone (rail files carry no `serves`)
    routes.forEachIndexed { ri, r ->
        r.patterns.forEachIndexed { pi, p ->
            p.forEachIndexed { at, s ->
                val stop = stops.getOrNull(s) ?: return@forEachIndexed
                if (!stop.routes.contains(ri)) stop.routes.add(ri)
                posOf.getOrPut(s) { ArrayList() }.add(PatternPos(ri, pi, at))
            }
        }
    }
    val cells = LinkedHashMap<Long, MutableList<Int>>()
    stops.forEachIndexed { i, s -> cells.getOrPut(stopCell(s.lon, s.lat)) { ArrayList() }.add(i) }
    return TransitNetwork(stops, routes, posOf, cells)
}

class StopNear(val stop: Int, val metres: Double)

/** Stops within `metres` of a point, nearest first. Straight-line; the walk to them is routed afterwards. */
fun stopsNear(net: TransitNetwork, pt: LatLon, metres: Double = ACCESS_M): List<StopNear> {
    val r = ceil(metres / (CELL_DEG * 111132.0)).toInt() + 1
    val cx = floor(pt.lon / CELL_DEG).toLong()
    val cy = floor(pt.lat / CELL_DEG).toLong()
    val out = ArrayList<StopNear>()
    for (a in -r..r) for (b in -r..r) {
        val l = net.cells[(cx + a) * 100000L + (cy + b)] ?: continue
        for (i in l) {
            val d = metresBetween(pt, net.stops[i].point)
            if (d <= metres) out.add(StopNear(i, d))
        }
    }
    return out.sortedWith(compareBy({ it.metres }, { it.stop }))
}

// ---- what a plan looks like -------------------------------------------------------------------

class StopRef(val index: Int, val name: String)

sealed class PlanLeg {
    abstract val metres: Double
    abstract val minutes: Double
    abstract val polyline: List<DoubleArray>
}

class WalkLeg(
    override val metres: Double,
    override val minutes: Double,
    val steps: List<WalkStep>,
    override val polyline: List<DoubleArray>,
    /** Set when this leg ends at, or starts from, a stop. */
    val toStop: StopRef? = null,
    val fromStop: StopRef? = null,
) : PlanLeg()

class RideLeg(
    val routeId: String,
    val routeShort: String,
    val routeLong: String,
    val agency: String,
    /** Minutes between buses as the agency publishes it, or null. A client may only say "about every N minutes
     *  on a weekday" when this is a number, and must never turn it into a departure time. */
    val headwayMinutes: Double?,
    val fromStop: StopRef,
    val toStop: StopRef,
    /** Stops ridden, counting the one you get off at. */
    val stops: Int,
    override val metres: Double,
    override val minutes: Double,
    /** The wait this plan assumed: half the headway, or DEFAULT_WAIT_MIN. An assumption, not a schedule. */
    val waitMinutes: Double,
    override var polyline: List<DoubleArray>,
) : PlanLeg()

class Itinerary(
    val legs: List<PlanLeg>,
    val changes: Int,
    val walkMetres: Double,
    val rideMetres: Double,
    /** The whole estimate in minutes, walking + riding + waiting + change penalty. Never shown as one number. */
    val minutes: Double,
    /** What a screen shows: "about 25 to 40 minutes". Always a range. */
    val range: IntArray,
    /** Metres from the asked-for start to the first street, and from the last street to the destination. */
    val startOffMetres: Double,
    val endOffMetres: Double,
)

/** The range a client says. Rounded to 5 minutes, at least 5 minutes wide, never a single number. */
fun minutesRange(minutes: Double): IntArray {
    val lo = max(5.0, floor(minutes * 0.85 / 5) * 5)
    var hi = ceil(minutes * 1.25 / 5) * 5
    if (hi - lo < 5) hi = lo + 5
    return intArrayOf(lo.toInt(), hi.toInt())
}

private fun waitFor(r: TransitRoute): Double =
    if (r.headway != null && r.headway != 0.0) r.headway * WAIT_FRACTION_OF_HEADWAY else DEFAULT_WAIT_MIN

/** Ride distance along a pattern, stop to stop. */
private fun rideMetres(net: TransitNetwork, pattern: List<Int>, from: Int, to: Int): Double {
    var m = 0.0
    for (i in from until to) m += metresBetween(net.stops[pattern[i]].point, net.stops[pattern[i + 1]].point)
    return m
}

/** The route's own drawn line between two stops, or the stops themselves when no line fits. */
private fun ridePolyline(net: TransitNetwork, route: TransitRoute, pattern: List<Int>, from: Int, to: Int): List<DoubleArray> {
    val a = net.stops[pattern[from]]
    val b = net.stops[pattern[to]]
    var bestLine: List<DoubleArray>? = null
    var bestI = 0
    var bestJ = 0
    var bestD = 0.0
    for (line in route.lines) {
        if (line.size < 2) continue
        var bi = 0
        var bj = 0
        var di = Double.POSITIVE_INFINITY
        var dj = Double.POSITIVE_INFINITY
        line.forEachIndexed { k, p ->
            val pa = metresBetween(a.point, LatLon(p[1], p[0]))
            val pb = metresBetween(b.point, LatLon(p[1], p[0]))
            if (pa < di) { di = pa; bi = k }
            if (pb < dj) { dj = pb; bj = k }
        }
        if (bi == bj) continue
        if (bestLine == null || di + dj < bestD) { bestLine = line; bestI = bi; bestJ = bj; bestD = di + dj }
    }
    val line = bestLine
    if (line != null && bestD < 200) {
        val i = if (bestI < bestJ) bestI else bestJ
        val j = if (bestI < bestJ) bestJ else bestI
        val slice = ArrayList(line.subList(i, j + 1))
        if (bestI > bestJ) slice.reverse()
        val out = ArrayList<DoubleArray>(slice.size + 2)
        out.add(doubleArrayOf(a.lon, a.lat))
        out.addAll(slice)
        out.add(doubleArrayOf(b.lon, b.lat))
        return out
    }
    return pattern.subList(from, to + 1).map { doubleArrayOf(net.stops[it].lon, net.stops[it].lat) }
}

private fun stopRef(net: TransitNetwork, i: Int) = StopRef(i, net.stops[i].name)

private fun walkLeg(r: WalkRoute, toStop: StopRef? = null, fromStop: StopRef? = null): WalkLeg =
    WalkLeg(r.metres, r.metres / WALK_M_PER_MIN, r.steps, r.polyline, toStop, fromStop)

private fun finish(legs: List<PlanLeg>, startOff: Double, endOff: Double): Itinerary {
    var walk = 0.0
    var ride = 0.0
    var minutes = 0.0
    var changes = -1
    for (l in legs) {
        if (l is WalkLeg) { walk += l.metres; minutes += l.minutes }
        else { l as RideLeg; ride += l.metres; minutes += l.minutes + l.waitMinutes; changes++ }
    }
    if (changes < 0) changes = 0
    minutes += changes * CHANGE_PENALTY_MIN
    return Itinerary(legs, changes, walk, ride, minutes, minutesRange(minutes), startOff, endOff)
}

/**
 * Rank: the estimate in minutes, then fewer changes, then less walking, then fewer ride stops, then the first
 * route's id — so one bundle always answers the same way.
 */
private val BETTER = Comparator<Itinerary> { a, b ->
    fun rideStops(x: Itinerary) = x.legs.sumOf { if (it is RideLeg) it.stops else 0 }
    fun firstRoute(x: Itinerary) = x.legs.filterIsInstance<RideLeg>().firstOrNull()?.routeId ?: ""
    var c = a.minutes.compareTo(b.minutes)
    if (c == 0) c = a.changes.compareTo(b.changes)
    if (c == 0) c = a.walkMetres.compareTo(b.walkMetres)
    if (c == 0) c = rideStops(a).compareTo(rideStops(b))
    if (c == 0) c = firstRoute(a).compareTo(firstRoute(b))
    c
}

class PlanOptions(
    /** Straight-line radius for access stops. */
    val accessMetres: Double = ACCESS_M,
    /** Longest walk-only trip still offered. */
    val maxWalkOnlyMetres: Double = MAX_WALK_ONLY_M,
    /** How many itineraries. */
    val limit: Int = MAX_PLANS,
)

/**
 * The whole answer to "how do I get there": ranked itineraries of walking and riding legs.
 *
 * Pure walking is always one of the candidates when it is under `maxWalkOnlyMetres`, and it is ranked by the
 * same cost model as the bus plans — so "walk, it is four blocks" wins on its own merits, and a bus only wins
 * when it really is faster given an honest wait.
 *
 * Returns [] when nothing works. A client says so; it never invents a leg.
 */
fun plan(
    g: StreetGraph,
    net: TransitNetwork,
    from: LatLon,
    to: LatLon,
    opts: PlanOptions = PlanOptions(),
): List<Itinerary> {
    val access = opts.accessMetres
    val out = ArrayList<Itinerary>()
    val pending = LinkedHashMap<RideLeg, IntArray>()       // leg -> [route, pattern, from, to]

    // 0. walking on its own
    val direct = walkRoute(g, from, to)
    if (direct != null && direct.metres <= opts.maxWalkOnlyMetres) {
        out.add(finish(listOf(walkLeg(direct)), direct.startOffMetres, direct.endOffMetres))
    }

    val originStops = stopsNear(net, from, access).take(MAX_ACCESS_STOPS)
    val destStops = stopsNear(net, to, access).take(MAX_ACCESS_STOPS)
    if (originStops.isNotEmpty() && destStops.isNotEmpty()) {
        val fromSnap = nearestEdgePoint(g, from.lat, from.lon)
        val toSnap = nearestEdgePoint(g, to.lat, to.lon)
        val snaps = HashMap<Int, EdgePoint?>()
        fun snapStop(i: Int): EdgePoint? = snaps.getOrPut(i) {
            nearestEdgePoint(g, net.stops[i].lat, net.stops[i].lon)
        }
        val accessWalk = HashMap<Int, WalkRoute?>()
        fun walkTo(i: Int): WalkRoute? = accessWalk.getOrPut(i) {
            val s = snapStop(i)
            if (fromSnap != null && s != null) routeBetween(g, fromSnap, s, from, net.stops[i].point) else null
        }
        val egressWalk = HashMap<Int, WalkRoute?>()
        fun walkFrom(i: Int): WalkRoute? = egressWalk.getOrPut(i) {
            val s = snapStop(i)
            if (s != null && toSnap != null) routeBetween(g, s, toSnap, net.stops[i].point, to) else null
        }

        val originAt = LinkedHashMap<Int, MutableList<Boardable>>()      // route -> boardable
        for (sn in originStops) for (e in net.posOf[sn.stop] ?: emptyList()) {
            originAt.getOrPut(e.route) { ArrayList() }.add(Boardable(sn.stop, e.pattern, e.at))
        }
        val destAt = LinkedHashMap<Int, MutableList<Boardable>>()        // route -> alightable
        for (sn in destStops) for (e in net.posOf[sn.stop] ?: emptyList()) {
            destAt.getOrPut(e.route) { ArrayList() }.add(Boardable(sn.stop, e.pattern, e.at))
        }

        // The drawn line of a ride costs a pass over the route's vertices, so it is filled in at the end, for
        // the few itineraries that are actually returned.
        fun rideLeg(ri: Int, pattern: Int, fromAt: Int, toAt: Int): RideLeg? {
            val r = net.routes[ri]
            val p = r.patterns[pattern]
            if (toAt <= fromAt) return null
            val m = rideMetres(net, p, fromAt, toAt)
            val leg = RideLeg(
                routeId = r.id, routeShort = r.short, routeLong = r.long, agency = r.agency,
                headwayMinutes = r.headway, fromStop = stopRef(net, p[fromAt]), toStop = stopRef(net, p[toAt]),
                stops = toAt - fromAt, metres = m, minutes = m / BUS_M_PER_MIN, waitMinutes = waitFor(r),
                polyline = emptyList(),
            )
            pending[leg] = intArrayOf(ri, pattern, fromAt, toAt)
            return leg
        }

        // 1. direct rides
        for ((ri, boards) in originAt) {
            val alights = destAt[ri] ?: continue
            for (b in boards) for (a in alights) {
                if (a.pattern != b.pattern || a.at <= b.at) continue
                val w1 = walkTo(b.stop)
                val w2 = walkFrom(a.stop)
                val leg = rideLeg(ri, b.pattern, b.at, a.at)
                if (w1 == null || w2 == null || leg == null) continue
                out.add(
                    finish(
                        listOf(
                            walkLeg(w1, toStop = stopRef(net, b.stop)), leg,
                            walkLeg(w2, fromStop = stopRef(net, a.stop)),
                        ),
                        w1.startOffMetres, w2.endOffMetres,
                    ),
                )
            }
        }

        // 2. one change: ride, then a change at the same stop or a walk of at most TRANSFER_WALK_M
        if (MAX_CHANGES >= 1) {
            val transferWalk = HashMap<Long, WalkRoute?>()
            fun walkBetween(i: Int, j: Int): WalkRoute? = transferWalk.getOrPut(i * 1_000_000L + j) {
                val a = snapStop(i)
                val b = snapStop(j)
                if (a != null && b != null) routeBetween(g, a, b, net.stops[i].point, net.stops[j].point) else null
            }
            // A bound on the work, not on the answer: the ranking only ever keeps a handful, and every
            // candidate past this many is a worse version of one already found.
            val candidateCap = 400
            for ((r1, boards) in originAt) {
                if (destAt.containsKey(r1)) continue           // a direct ride already covers this route
                if (out.size > candidateCap) break
                for (b in boards) {
                    val p1 = net.routes[r1].patterns[b.pattern]
                    for (at in b.at + 1 until p1.size) {
                        val x = p1[at]
                        for (near in stopsNear(net, net.stops[x].point, TRANSFER_WALK_M)) {
                            val y = near.stop
                            for (e in net.posOf[y] ?: emptyList()) {
                                if (e.route == r1) continue
                                val alights = destAt[e.route] ?: continue
                                for (a in alights) {
                                    if (a.pattern != e.pattern || a.at <= e.at) continue
                                    val w1 = walkTo(b.stop)
                                    val w3 = walkFrom(a.stop)
                                    val leg1 = rideLeg(r1, b.pattern, b.at, at)
                                    val leg2 = rideLeg(e.route, e.pattern, e.at, a.at)
                                    if (w1 == null || w3 == null || leg1 == null || leg2 == null) continue
                                    val mid = ArrayList<PlanLeg>()
                                    if (x != y) {
                                        val w2 = if (near.metres < 1) null else walkBetween(x, y)
                                        if (w2 == null) continue
                                        mid.add(walkLeg(w2, toStop = stopRef(net, y), fromStop = stopRef(net, x)))
                                    }
                                    val legs = ArrayList<PlanLeg>()
                                    legs.add(walkLeg(w1, toStop = stopRef(net, b.stop)))
                                    legs.add(leg1)
                                    legs.addAll(mid)
                                    legs.add(leg2)
                                    legs.add(walkLeg(w3, fromStop = stopRef(net, a.stop)))
                                    out.add(finish(legs, w1.startOffMetres, w3.endOffMetres))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // one itinerary per shape: the same sequence of routes never comes back twice
    val seen = HashSet<String>()
    val ranked = ArrayList<Itinerary>()
    for (it in out.sortedWith(BETTER)) {
        val key = it.legs.filterIsInstance<RideLeg>().joinToString(">") { l -> l.routeId }.ifEmpty { "walk" }
        if (!seen.add(key)) continue
        ranked.add(it)
        if (ranked.size >= opts.limit) break
    }
    for (plan in ranked) for (l in plan.legs) {
        if (l !is RideLeg) continue
        val p = pending[l] ?: continue
        l.polyline = ridePolyline(net, net.routes[p[0]], net.routes[p[0]].patterns[p[1]], p[2], p[3])
    }
    return ranked
}

/** The one wording of a plan that all three runners compare (schema/fixtures/15-trip-plans.json). */
fun planSummary(p: Itinerary): String {
    fun r10(m: Double) = Math.round(m / 10) * 10
    val legs = p.legs.joinToString(" > ") { l ->
        when (l) {
            is WalkLeg -> "walk ${r10(l.metres)}m"
            is RideLeg -> "ride ${l.routeId} ${l.stops}st " +
                (if (l.headwayMinutes == null) "no-headway" else "every ${numberWord(l.headwayMinutes)}")
        }
    }
    return "$legs [${p.range[0]}-${p.range[1]}]"
}

private fun numberWord(d: Double): String =
    if (d == floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()
