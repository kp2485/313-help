// Walking directions on the street graph. Spec: schema/query-spec.md "Walking directions".
// A case-for-case Kotlin port of packages/query/src/walk.ts, held to schema/fixtures/14-streets-walk.json.
//
// Everything is on the device. No origin, no destination and no query ever leaves the phone
// (DECISIONS 2026-09-22). The route is streets only: we have no sidewalk, curb-ramp or lighting data, so no
// client may call a route safe, accessible or lit — the words a client says are in strings/, and the rules
// here only hand it facts.
//
// We never route to the door. The route ends at the nearest point on a street and `endOffMetres` says how far
// the building still is, so a screen can say "then about 40 m to the building".
package org.help313.query

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** A person walking, for the estimates. 1.33 m/s is 80 m per minute — the number the plan's cost model uses. */
const val WALK_M_PER_S = 1.33
const val WALK_M_PER_MIN = 80.0

/**
 * Safety penalties. The cost of an edge is `metres * (1 + penalty)`, with `penalty` capped, so a calmer street
 * wins whenever the detour is smaller than the penalty allows: a cap of 0.60 means we will walk up to 60%
 * further to stay off the City's High Injury Network. These are the City of Detroit's own markings, not our
 * judgement (docs/research/2026-09-22-offline-directions.md §2.5, rule 3).
 */
object SafetyPenalty {
    const val HIN = 0.35                                    // HIN_2021
    const val HIGH_SEVERITY = 0.20                          // HighSeverity
    val LANES = doubleArrayOf(0.0, 0.0, 0.10, 0.20)         // unknown, 1-2, 3-4, 5+
    val SPEED = doubleArrayOf(0.0, 0.0, 0.10, 0.25)         // unknown, <=25, 30-35, 40+
    val AADT = doubleArrayOf(0.0, 0.0, 0.05, 0.15)          // unknown, <5k, 5k-20k, >20k
    const val CAP = 0.60
}

/**
 * Used only when the street file carries no safety bytes (an older bundle, or an ingest the City refused).
 * Indexed by street class: 0 freeway (never walked), 1 main road, 2 arterial, 3 collector, 4 local street.
 */
val CLASS_PENALTY = doubleArrayOf(0.0, 0.15, 0.10, 0.05, 0.0)

/**
 * What a turn costs, in metres of walking. On Detroit's grid every route between two corners is the same
 * length, so with no turn penalty the tie is broken arbitrarily and a person is handed a staircase of fifteen
 * turns instead of three streets. It never changes the distance that is reported — only which of several
 * equally long routes is the one described.
 */
const val TURN_PENALTY_M = 40.0

/** The penalty for one way of the graph. */
fun wayPenalty(g: StreetGraph, way: Int): Double {
    if (!g.hasSafety) return CLASS_PENALTY.getOrElse(min(g.wayCls[way], 4)) { 0.0 }
    val b = g.waySafety[way]
    val p = (if (safetyHin(b)) SafetyPenalty.HIN else 0.0) +
        (if (safetyHighSeverity(b)) SafetyPenalty.HIGH_SEVERITY else 0.0) +
        SafetyPenalty.LANES[safetyLanes(b)] + SafetyPenalty.SPEED[safetySpeed(b)] + SafetyPenalty.AADT[safetyAadt(b)]
    return min(p, SafetyPenalty.CAP)
}

/** Eight winds, each 45 degrees wide, north first. The wire words, which strings/ turns into a sentence. */
val BEARINGS = listOf("north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest")

/** Compass word for a direction in metres. */
fun bearingWord(dx: Double, dy: Double): String {
    val deg = atan2(dx, dy) * 180.0 / Math.PI          // 0 = north, clockwise
    val i = (Math.round(((deg % 360) + 360) % 360 / 45).toInt()) % 8
    return BEARINGS[i]
}

/** Turn word from the change of heading in degrees, signed: positive is to the right. */
fun turnWord(deltaDeg: Double): String {
    val d = ((deltaDeg + 540) % 360) - 180
    val a = abs(d)
    if (a < 20) return "straight"
    if (a > 160) return "around"
    val right = d > 0
    if (a < 45) return if (right) "slight_right" else "slight_left"
    if (a <= 135) return if (right) "right" else "left"
    return if (right) "sharp_right" else "sharp_left"
}

/** One instruction. The client words it; these are facts. */
class WalkStep(
    /** The street's name as the City publishes it. Unnamed lines are never routed on, so this is never empty. */
    val street: String,
    val bearing: String,
    /** How to get onto this street from the last one. Null on the first step. */
    val turn: String?,
    var metres: Double,
)

class WalkRoute(
    val metres: Double,
    /** Straight-line metres between the two asked-for points, so a client can show how direct a route is. */
    val straightMetres: Double,
    /** At WALK_M_PER_S. An estimate, never a promise. */
    val seconds: Double,
    val steps: List<WalkStep>,
    /** [lon, lat] vertices to draw, from the snapped start point to the snapped end point. */
    val polyline: List<DoubleArray>,
    /** Metres from the asked-for start to the street, and from the street to the asked-for destination. */
    val startOffMetres: Double,
    val endOffMetres: Double,
    /** Nodes settled by A*. A number for tests, never a screen. */
    val settled: Int,
)

private fun heapPush(k: DoubleArray, v: IntArray, n: Int, key: Double, value: Int): Int {
    var i = n
    k[i] = key; v[i] = value
    while (i > 0) {
        val p = (i - 1) shr 1
        if (k[p] <= k[i]) break
        val tk = k[p]; val tv = v[p]
        k[p] = k[i]; v[p] = v[i]; k[i] = tk; v[i] = tv
        i = p
    }
    return n + 1
}

/** Returns the popped value; `size` is written back through `out`. */
private fun heapPop(k: DoubleArray, v: IntArray, n: Int, out: IntArray): Int {
    val top = v[0]
    val m = n - 1
    if (m > 0) {
        k[0] = k[m]; v[0] = v[m]
        var i = 0
        while (true) {
            val l = 2 * i + 1
            val r = l + 1
            var s = i
            if (l < m && k[l] < k[s]) s = l
            if (r < m && k[r] < k[s]) s = r
            if (s == i) break
            val tk = k[s]; val tv = v[s]
            k[s] = k[i]; v[s] = v[i]; k[i] = tk; v[i] = tv
            i = s
        }
    }
    out[0] = m
    return top
}

/**
 * A* from one point to another. Both points are snapped to the nearest edge, which is split for the search:
 * node ids `2 * edgeCount` and `2 * edgeCount + 1` are the virtual start and goal.
 *
 * Returns null when the two ends are in different pieces of the graph (0.5% of nodes are), or when either is
 * further than `maxSnapMetres` from any street.
 */
fun walkRoute(g: StreetGraph, from: LatLon, to: LatLon, maxSnapMetres: Double = 2000.0): WalkRoute? {
    val a = nearestEdgePoint(g, from.lat, from.lon, maxSnapMetres) ?: return null
    val b = nearestEdgePoint(g, to.lat, to.lon, maxSnapMetres) ?: return null
    return routeBetween(g, a, b, from, to)
}

/** The same search between two points already snapped to edges (the transit planner snaps stops once). */
fun routeBetween(g: StreetGraph, a: EdgePoint, b: EdgePoint, from: LatLon? = null, to: LatLon? = null): WalkRoute? {
    // The search is over HALF-EDGES, not nodes: a state is "walking along this edge in this direction", which
    // is what makes a turn cost something.
    val m2 = 2 * g.edgeCount
    val s0 = m2
    val t0 = m2 + 1
    val total = m2 + 2
    val aLen = g.edgeLen[a.half].toDouble()
    val bLen = g.edgeLen[b.half].toDouble()
    val bTwin = g.twinHalf[b.half]
    /** The fraction of the goal edge already walked when arriving along half-edge `h`. */
    fun goalRemaining(h: Int): Double = if (h == b.half) b.t * bLen else (1 - b.t) * bLen

    val dist = DoubleArray(total) { Double.POSITIVE_INFINITY }
    val cost = DoubleArray(total) { Double.POSITIVE_INFINITY }
    val prev = IntArray(total) { -1 }
    val closed = ByteArray(total)
    val hk = DoubleArray(total + 8)
    val hv = IntArray(total + 8)
    var hn = 0
    var settled = 0
    /** Straight line to the goal from where a state leaves you standing. Admissible: no cost is negative. */
    fun h(s: Int): Double {
        if (s == t0) return 0.0
        if (s == s0) { val dx = a.x - b.x; val dy = a.y - b.y; return sqrt(dx * dx + dy * dy) }
        val n = g.edgeTo[s]
        val dx = g.nodeX[n] - b.x; val dy = g.nodeY[n] - b.y
        return sqrt(dx * dx + dy * dy)
    }
    fun push(s: Int, c: Double, d: Double, fromState: Int) {
        if (c >= cost[s]) return
        cost[s] = c; dist[s] = d; prev[s] = fromState
        hn = heapPush(hk, hv, hn, c + h(s), s)
    }

    cost[s0] = 0.0; dist[s0] = 0.0
    hn = heapPush(hk, hv, hn, h(s0), s0)
    val aFor = a.half
    val aBack = g.twinHalf[a.half]
    val aPen = 1 + wayPenalty(g, g.edgeWay[a.half])
    push(aFor, (1 - a.t) * aLen * aPen, (1 - a.t) * aLen, s0)
    push(aBack, a.t * aLen * aPen, a.t * aLen, s0)
    if (g.halfEdge[a.half] == g.halfEdge[b.half]) {
        val bt = if (b.half == a.half) b.t else 1 - b.t
        push(t0, abs(bt - a.t) * aLen * aPen, abs(bt - a.t) * aLen, s0)
    }

    val sizeOut = IntArray(1)
    while (hn > 0) {
        val s = heapPop(hk, hv, hn, sizeOut)
        hn = sizeOut[0]
        if (closed[s].toInt() != 0) continue
        closed[s] = 1; settled++
        if (s == t0) break
        if (s == s0) continue
        val u = g.edgeTo[s]
        val name = g.wayName.getOrElse(g.edgeWay[s]) { "" }
        for (e in g.head[u] until g.head[u + 1]) {
            if (e == g.twinHalf[s]) continue                  // no turning round in the middle of a street
            val turn = if (g.wayName.getOrElse(g.edgeWay[e]) { "" } == name) 0.0 else TURN_PENALTY_M
            val pen = 1 + wayPenalty(g, g.edgeWay[e])
            if (e == b.half || e == bTwin) {
                push(t0, cost[s] + turn + goalRemaining(e) * pen, dist[s] + goalRemaining(e), s)
            }
            push(e, cost[s] + turn + g.edgeLen[e].toDouble() * pen, dist[s] + g.edgeLen[e].toDouble(), s)
        }
    }
    if (!cost[t0].isFinite()) return null

    // walk the path back, then turn it into steps and a polyline along the streets' real shape
    val path = ArrayList<Int>()
    var s = t0
    while (s != -1) { path.add(s); s = prev[s] }
    path.reverse()                                            // S, half-edge, half-edge, …, T

    /**
     * What was walked in one step of the path: the vertices in travel order and the street's name.
     * The goal is reached part-way along an edge that is never itself a state, so `T` renders that partial edge.
     */
    fun piece(i: Int): Pair<DoubleArray, Int> {
        val st = path[i]
        val before = path[i - 1]
        if (st == t0) {
            if (before == s0) {                               // start and goal on one edge
                val bt = if (b.half == a.half) b.t else 1 - b.t
                return Pair(sliceByFraction(edgeGeometry(g, a.half), a.t, bt), g.edgeWay[a.half])
            }
            val u = g.edgeTo[before]
            val e = if (u == b.from) b.half else bTwin
            val ft = if (e == b.half) b.t else 1 - b.t
            return Pair(sliceByFraction(edgeGeometry(g, e), 0.0, ft), g.edgeWay[e])
        }
        val geom = edgeGeometry(g, st)
        return Pair(
            if (before == s0) sliceByFraction(geom, if (st == aFor) a.t else 1 - a.t, 1.0) else geom,
            g.edgeWay[st],
        )
    }

    val polyline = ArrayList<DoubleArray>()
    fun pushPt(x: Double, y: Double) {
        val lon = toLonFromX(x); val lat = toLatFromY(y)
        val last = polyline.lastOrNull()
        if (last == null || last[0] != lon || last[1] != lat) polyline.add(doubleArrayOf(lon, lat))
    }
    val steps = ArrayList<WalkStep>()
    var lastHeading: Double? = null
    for (i in 1 until path.size) {
        val metres = dist[path[i]] - dist[path[i - 1]]
        val (geom, way) = piece(i)
        var k = 0
        while (k + 1 < geom.size) { pushPt(geom[k], geom[k + 1]); k += 2 }
        if (metres <= 0 || geom.size < 4) continue
        val name = g.wayName.getOrElse(way) { "" }
        val dx0 = geom[2] - geom[0]; val dy0 = geom[3] - geom[1]
        val n = geom.size
        val heading0 = atan2(dx0, dy0) * 180.0 / Math.PI
        val headingEnd = atan2(geom[n - 2] - geom[n - 4], geom[n - 1] - geom[n - 3]) * 180.0 / Math.PI
        val last = steps.lastOrNull()
        if (last != null && last.street == name) last.metres += metres
        else steps.add(
            WalkStep(name, bearingWord(dx0, dy0), lastHeading?.let { turnWord(heading0 - it) }, metres),
        )
        lastHeading = headingEnd
    }
    val startPt = from ?: LatLon(polyline[0][1], polyline[0][0])
    val endPt = to ?: LatLon(polyline[polyline.size - 1][1], polyline[polyline.size - 1][0])
    return WalkRoute(
        metres = dist[t0], straightMetres = metresBetween(startPt, endPt), seconds = dist[t0] / WALK_M_PER_S,
        steps = steps, polyline = polyline,
        startOffMetres = a.offMetres, endOffMetres = b.offMetres, settled = settled,
    )
}

/** Straight-line metres between two points, at the one reference latitude every client uses. */
fun metresBetween(p: LatLon, q: LatLon): Double {
    val dx = (q.lon - p.lon) * (111320.0 * cos(42.35 * Math.PI / 180.0))
    val dy = (q.lat - p.lat) * 111132.0
    return sqrt(dx * dx + dy * dy)
}

/** The one wording of a walk that all three runners compare (schema/fixtures/14-streets-walk.json). */
fun walkSummary(r: WalkRoute?): String? {
    if (r == null) return null
    fun r10(m: Double) = Math.round(m / 10) * 10
    val steps = r.steps.joinToString(" > ") { "${it.turn ?: "start"} ${it.street} ${it.bearing} ${r10(it.metres)}" }
    return "$steps | ${r10(r.metres)} m, off ${r.startOffMetres.roundToInt()}/${r.endOffMetres.roundToInt()}"
}
