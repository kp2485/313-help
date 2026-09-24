// Which streets a trip walks on (Kyle, 2026-09-24: the area widened to every city and township a DDOT or SMART
// bus stops in). Spec: schema/query-spec.md "The trip window".
// A case-for-case Kotlin port of packages/query/src/window.ts, held to schema/fixtures/16-trip-window.json.
//
// The street map is seven times the size it was, and a phone must not build a graph of three counties of streets
// to plan a walk to the corner. (It still downloads the one street file, as before: bytes are cheap, a graph of
// 150,000 nodes on an old phone is not.) A plan only ever WALKS in a few places: from where it starts to a stop,
// from a stop to where it ends, between two stops at a change, or the whole way when the two ends are close. Every
// one of those places is known from the two ends and the bus network alone, before a single street is read. So:
//
//   1. `tripWindow` names the boxes a plan can walk in;
//   2. `windowFiles` keeps every street whose own box touches one of them: the main roads first, then each cell of
//      map/streets.json in key order — the ONE order every client builds the graph in, so node numbering, and so
//      the answer, is the same on all three.
//
// A street is chosen by its OWN box, never by the cell it is filed in: a cell holds a street by its midpoint, and a
// suburban street TIGER merged into one long line can pass the front door with its midpoint two cells away.
//
// Nothing here touches the network, the clock or a person's location beyond the two points it is given, and
// nothing is kept: a window's graph is built for one plan and dropped with it, never cached (a cache of them would
// be a record of trips).
package org.help313.query

/** Padding round each end of a trip. An access walk is at most ACCESS_M in a straight line; streets wander. */
const val END_PAD_M = ACCESS_M + 800.0

/** Padding round a stop where a change may need a walk (at most TRANSFER_WALK_M in a straight line). */
const val TRANSFER_PAD_M = TRANSFER_WALK_M + 800.0

/** Padding round the box between the two ends, when they are close enough to walk. */
const val WALK_PAD_M = 800.0

/** A box in degrees. */
data class GeoBox(val lonMin: Double, val latMin: Double, val lonMax: Double, val latMax: Double)

/** A point padded by `metres` on every side. */
fun boxAround(pt: LatLon, metres: Double): GeoBox {
    val dLat = metres / M_PER_DEG_LAT
    val dLon = metres / M_PER_DEG_LON
    return GeoBox(lonMin = pt.lon - dLon, latMin = pt.lat - dLat, lonMax = pt.lon + dLon, latMax = pt.lat + dLat)
}

private fun boxesTouch(a: GeoBox, b: GeoBox): Boolean =
    a.lonMin <= b.lonMax && a.lonMax >= b.lonMin && a.latMin <= b.latMax && a.latMax >= b.latMin

/**
 * The stops where a plan with one change may have to WALK between two stops: `x` on a route boarded near the start
 * and `y` within TRANSFER_WALK_M of it on a route that reaches a stop near the end. The same loops as `plan`'s
 * step 2, without the cap on candidates, so the answer is a superset of every change `plan` can make.
 */
fun transferStops(net: TransitNetwork, from: LatLon, to: LatLon, access: Double = ACCESS_M): List<Int> {
    val originStops = stopsNear(net, from, access).take(MAX_ACCESS_STOPS)
    val destStops = stopsNear(net, to, access).take(MAX_ACCESS_STOPS)
    if (originStops.isEmpty() || destStops.isEmpty()) return emptyList()
    val destAt = LinkedHashMap<Int, MutableList<IntArray>>()          // route -> [pattern, at]
    for (sn in destStops) for (e in net.posOf[sn.stop] ?: emptyList()) {
        destAt.getOrPut(e.route) { ArrayList() }.add(intArrayOf(e.pattern, e.at))
    }
    val out = HashSet<Int>()
    for (sn in originStops) for (b in net.posOf[sn.stop] ?: emptyList()) {
        if (destAt.containsKey(b.route)) continue                        // a direct ride; no change
        val p1 = net.routes[b.route].patterns[b.pattern]
        for (at in b.at + 1 until p1.size) {
            val x = p1[at]
            for (near in stopsNear(net, net.stops[x].point, TRANSFER_WALK_M)) {
                val y = near.stop
                if (x == y) continue                                     // a change at the same stop: no walk
                val reaches = (net.posOf[y] ?: emptyList()).any { e ->
                    e.route != b.route && (destAt[e.route] ?: emptyList()).any { a -> a[0] == e.pattern && a[1] > e.at }
                }
                if (reaches) { out.add(x); out.add(y) }
            }
        }
    }
    return out.sorted()
}

/** Where the plan may walk: both ends, the walk between them if it is short enough, and each change. */
class TripWindow(val boxes: List<GeoBox>)

/** Where a plan from `from` to `to` may walk. `net` may be null (walking only). */
fun tripWindow(
    net: TransitNetwork?,
    from: LatLon,
    to: LatLon,
    accessMetres: Double = ACCESS_M,
    maxWalkOnlyMetres: Double = MAX_WALK_ONLY_M,
): TripWindow {
    val boxes = arrayListOf(boxAround(from, END_PAD_M), boxAround(to, END_PAD_M))
    if (metresBetween(from, to) <= maxWalkOnlyMetres) {
        val a = boxAround(from, WALK_PAD_M)
        val b = boxAround(to, WALK_PAD_M)
        boxes.add(
            GeoBox(
                lonMin = minOf(a.lonMin, b.lonMin), latMin = minOf(a.latMin, b.latMin),
                lonMax = maxOf(a.lonMax, b.lonMax), latMax = maxOf(a.latMax, b.latMax),
            ),
        )
    }
    if (net != null) for (s in transferStops(net, from, to, accessMetres)) boxes.add(boxAround(net.stops[s].point, TRANSFER_PAD_M))
    return TripWindow(boxes)
}

/** The box of one packed line, decoded from its origin and deltas. An empty line touches nothing. */
private fun lineBox(enc: IntArray, origin: DoubleArray): GeoBox {
    var x = 0
    var y = 0
    var x0 = Int.MAX_VALUE
    var y0 = Int.MAX_VALUE
    var x1 = Int.MIN_VALUE
    var y1 = Int.MIN_VALUE
    var i = 0
    while (i + 1 < enc.size) {
        if (i == 0) { x = enc[0]; y = enc[1] } else { x += enc[i]; y += enc[i + 1] }
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        i += 2
    }
    if (x0 > x1) {
        return GeoBox(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY)
    }
    return GeoBox(
        lonMin = origin[0] + x0 / STREET_SCALE, latMin = origin[1] + y0 / STREET_SCALE,
        lonMax = origin[0] + x1 / STREET_SCALE, latMax = origin[1] + y1 / STREET_SCALE,
    )
}

/** One street file cut down to the streets whose own box touches one of `boxes`, in the file's own order. */
fun roadsInBoxes(base: PackedStreets, boxes: List<GeoBox>): PackedStreets {
    val keep = ArrayList<Int>()
    base.roads.forEachIndexed { i, r ->
        val b = lineBox(r.enc, base.origin)
        if (boxes.any { q -> boxesTouch(b, q) }) keep.add(i)
    }
    val safety = base.safety
    return PackedStreets(
        origin = base.origin,
        names = base.names,
        roads = keep.map { base.roads[it] },
        safety = if (safety != null) IntArray(keep.size) { safety.getOrNull(keep[it]) ?: 0 } else null,
    )
}

/**
 * The files the walking graph is built from, in the one order: the main roads that touch the window, then each cell
 * of map/streets.json — `cells` in ascending key order, exactly the list every client already builds from — each
 * cut down to its streets that touch the window. A cell left with none is dropped; the main-road file never is.
 */
fun windowFiles(base: PackedStreets, cells: List<PackedStreets>, w: TripWindow): List<PackedStreets> {
    val out = arrayListOf(roadsInBoxes(base, w.boxes))
    for (c in cells) {
        val kept = roadsInBoxes(c, w.boxes)
        if (kept.roads.isNotEmpty()) out.add(kept)
    }
    return out
}
