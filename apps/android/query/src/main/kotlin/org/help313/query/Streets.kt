// A routable street graph, built on the device from the map files the app already downloads.
// Spec: schema/query-spec.md "Streets graph". Measured study: docs/research/2026-09-22-offline-directions.md.
//
// A case-for-case Kotlin port of packages/query/src/streets.ts. The web, the iPhone and this file are held to
// schema/fixtures/14-streets-walk.json, so a change to the rules is a change in three places and the fixtures
// are what keeps them honest.
//
// The bundle's street files (map/base.json, the cells inside map/streets.json) are drawn, not routed: a street
// is ONE polyline from end to end and every cross street crosses it mid-line, so 82% of polyline ends touch
// nothing. Noding fixes that on the phone: split every polyline wherever it geometrically crosses another, then
// pull each still-dangling end onto a line within 12 m.
//
// Nothing here touches the network, the clock, or a person's location. It is arithmetic on a file.
package org.help313.query

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Metres per degree, at one fixed reference latitude for the whole service area, so every client gets the
 *  same metre value for the same pair of points and fixtures can be compared exactly. */
const val REF_LAT = 42.35
const val M_PER_DEG_LAT = 111132.0
val M_PER_DEG_LON = 111320.0 * cos(REF_LAT * Math.PI / 180.0)

/** Whole units of 1e-5 degrees, the packing every map file uses (docs/06 "Map"). */
const val STREET_SCALE = 1e5

/** Build constants. Changing any of them changes the graph, so they are part of the spec. */
const val CELL_M = 200.0            // grid cell for the crossing search
const val NODE_TOL_M = 1.0          // two points this close are one node
const val SNAP_M = 12.0             // a dangling polyline end is pulled onto a line this close
const val MIN_EDGE_M = 0.01         // shorter than this is not an edge
const val STREET_GRAPH_VERSION = 1

/** A street class, as the basemap writes it: 0 freeway/ramp, 1 main road, 2 arterial, 3 collector, 4 local. */
const val FREEWAY_CLASS = 0

/** One street file exactly as the bundle carries it. `safety` is optional and additive (see `safetyByte`). */
class PackedStreets(
    val origin: DoubleArray,             // [lon, lat]
    val names: List<String>,
    /** [class, nameIndex, encoded line] per polyline. */
    val roads: List<Road>,
    /** One byte per entry of `roads`, same order, or null when the file carried none. */
    val safety: IntArray? = null,
) {
    class Road(val cls: Int, val nameIndex: Int, val enc: IntArray)

    /** The same file with its safety array dropped, which is what an older bundle looks like. */
    fun withoutSafety(): PackedStreets = PackedStreets(origin, names, roads, null)

    companion object {
        fun fromJson(j: Json): PackedStreets {
            val o = j["origin"]!!.arr
            val roads = j["roads"]!!.arr.map { r ->
                val a = r.arr
                Road(a[0].int ?: 0, a[1].int ?: -1, IntArray(a[2].arr.size) { a[2].arr[it].int ?: 0 })
            }
            val safetyJson = j["safety"]?.arr
            return PackedStreets(
                doubleArrayOf(o[0].num ?: 0.0, o[1].num ?: 0.0),
                j["names"]?.arr?.map { it.str ?: "" } ?: emptyList(),
                roads,
                safetyJson?.let { list -> IntArray(list.size) { list[it].int ?: 0 } },
            )
        }
    }
}

/** A decoded polyline, in metres, ready to be noded. */
class Street(
    val cls: Int,
    val name: String,
    /** The safety byte (`safetyByte`), or 0 when the file carried none. */
    val safety: Int,
    /** Projected vertices, flat [x, y, x, y, …] in metres. */
    val pts: DoubleArray,
    /** The same vertices as [lon, lat], flat, kept for drawing. */
    val lonlat: DoubleArray,
) {
    val count: Int get() = pts.size / 2
    fun x(i: Int) = pts[2 * i]
    fun y(i: Int) = pts[2 * i + 1]
}

// ---- the safety byte ------------------------------------------------------------------------
// One byte per polyline, from the City's own Roads layer (pipeline/src/ingest-basemap.ts):
//   bit 0      HIN_2021       on the City's High Injury Network
//   bit 1      HighSeverity   the City's high-severity marking
//   bits 2-3   lanes          0 unknown, 1 = 1-2, 2 = 3-4, 3 = 5 or more
//   bits 4-5   posted speed   0 unknown, 1 = 25 or less, 2 = 30-35, 3 = 40 or more
//   bits 6-7   AADT           0 unknown, 1 = under 5k, 2 = 5k-20k, 3 = over 20k
// A byte of 0 means "this file told us nothing", which is exactly what an older bundle says.
const val SAFETY_HIN = 1
const val SAFETY_HIGH_SEVERITY = 2

fun lanesBucket(n: Double?): Int = if (n == null || !(n > 0)) 0 else if (n <= 2) 1 else if (n <= 4) 2 else 3
fun speedBucket(n: Double?): Int = if (n == null || !(n > 0)) 0 else if (n <= 25) 1 else if (n <= 35) 2 else 3
fun aadtBucket(n: Double?): Int = if (n == null || !(n > 0)) 0 else if (n < 5000) 1 else if (n <= 20000) 2 else 3

fun safetyByte(hin: Boolean, highSeverity: Boolean, lanes: Double?, speed: Double?, aadt: Double?): Int =
    (if (hin) SAFETY_HIN else 0) or (if (highSeverity) SAFETY_HIGH_SEVERITY else 0) or
        (lanesBucket(lanes) shl 2) or (speedBucket(speed) shl 4) or (aadtBucket(aadt) shl 6)

fun safetyHin(b: Int) = (b and SAFETY_HIN) != 0
fun safetyHighSeverity(b: Int) = (b and SAFETY_HIGH_SEVERITY) != 0
fun safetyLanes(b: Int) = (b shr 2) and 3
fun safetySpeed(b: Int) = (b shr 4) and 3
fun safetyAadt(b: Int) = (b shr 6) and 3

// ---- decoding -------------------------------------------------------------------------------

fun toMetresX(lon: Double) = lon * M_PER_DEG_LON
fun toMetresY(lat: Double) = lat * M_PER_DEG_LAT
fun toLonFromX(x: Double) = x / M_PER_DEG_LON
fun toLatFromY(y: Double) = y / M_PER_DEG_LAT

/** One street file's polylines, decoded and projected. Order is the file's order, so the graph is deterministic. */
fun decodeStreets(file: PackedStreets): List<Street> {
    val ox = file.origin[0]
    val oy = file.origin[1]
    return file.roads.mapIndexed { i, road ->
        val enc = road.enc
        val n = enc.size / 2
        val lonlat = DoubleArray(2 * n)
        val pts = DoubleArray(2 * n)
        var x = 0
        var y = 0
        var k = 0
        var at = 0
        while (k + 1 < enc.size) {
            if (k == 0) { x = enc[0]; y = enc[1] } else { x += enc[k]; y += enc[k + 1] }
            val lon = ox + x / STREET_SCALE
            val lat = oy + y / STREET_SCALE
            lonlat[2 * at] = lon; lonlat[2 * at + 1] = lat
            pts[2 * at] = toMetresX(lon); pts[2 * at + 1] = toMetresY(lat)
            at++
            k += 2
        }
        Street(
            cls = road.cls,
            name = if (road.nameIndex >= 0) (file.names.getOrNull(road.nameIndex) ?: "") else "",
            safety = file.safety?.getOrNull(i) ?: 0,
            pts = pts, lonlat = lonlat,
        )
    }
}

// ---- the graph ------------------------------------------------------------------------------

class GraphStats(
    val polylines: Int, val skipped: Int, val crossings: Int, val snapped: Int,
    val components: Int, val largestComponent: Int, val deadEnds: Int, val buildMs: Long,
)

/**
 * A street graph in flat arrays. Undirected: every edge appears once from each end (the City's layer publishes
 * no one-way field, which is exactly why there are no driving directions).
 *
 * CSR: node `n`'s edges are the half-open range `head[n] .. head[n + 1]` of `edgeTo`/`edgeLen`/`edgeWay`.
 */
class StreetGraph(
    val version: Int,
    /** "$STREET_GRAPH_VERSION:$sha256", the key this graph is cached under. */
    val key: String,
    val nodeCount: Int,
    /** Undirected edges; the half-edge arrays are twice this long. */
    val edgeCount: Int,
    val nodeX: DoubleArray,
    val nodeY: DoubleArray,
    val head: IntArray,                  // nodeCount + 1
    val edgeTo: IntArray,
    /** Float, not Double, exactly as the TypeScript's Float32Array is, so the two agree to the last bit. */
    val edgeLen: FloatArray,
    val edgeWay: IntArray,
    /** Which undirected edge each half-edge belongs to. */
    val halfEdge: IntArray,
    /** The same edge walked the other way. `twinHalf[twinHalf[h]] == h`. */
    val twinHalf: IntArray,
    val wayName: List<String>,
    val wayCls: IntArray,
    val waySafety: IntArray,
    /** Each way's own vertices, flat [x, y, x, y, …] in metres. An edge runs along a part of one of these. */
    val wayPts: List<DoubleArray>,
    // Where each undirected edge starts and ends along its way: vertex `seg` plus a fraction `t` towards
    // `seg + 1`. This is what keeps a curved street curved when the route is drawn — an edge between two
    // junctions is NOT a straight chord.
    val edgeSegA: IntArray,
    val edgeTA: FloatArray,
    val edgeSegB: IntArray,
    val edgeTB: FloatArray,
    val edgeNodeA: IntArray,
    val edgeNodeB: IntArray,
    /** True when at least one source file carried a `safety` array. Decides which penalty table Walk.kt uses. */
    val hasSafety: Boolean,
    /** Counts a person never sees; the real-data tests do. */
    val stats: GraphStats,
) {
    /** Built once, on first use, and only an index: it holds nothing new. */
    internal var nodeCells: HashMap<Long, MutableList<Int>>? = null

    /** The same graph under a different cache key (what the cache stores). */
    internal fun withKey(k: String) = StreetGraph(
        version, k, nodeCount, edgeCount, nodeX, nodeY, head, edgeTo, edgeLen, edgeWay, halfEdge, twinHalf,
        wayName, wayCls, waySafety, wayPts, edgeSegA, edgeTA, edgeSegB, edgeTB, edgeNodeA, edgeNodeB,
        hasSafety, stats,
    ).also { it.nodeCells = nodeCells }
}

/**
 * Grade separation, stated: the map has no bridge/tunnel field, so a crossing of two lines is assumed to be a
 * junction. Two lines may only be joined when neither is class 0 (freeway and ramp). That covers every
 * freeway-over-street and street-over-freeway case, which is where nearly all of Detroit's grade separation is,
 * and it is why class 0 is left out of the walking graph altogether — a freeway is not walkable anyway.
 *
 * Residual error, not hidden: a street bridge over another street still becomes a junction.
 */
fun mayJoin(clsA: Int, clsB: Int): Boolean = clsA != FREEWAY_CLASS && clsB != FREEWAY_CLASS

/** Streets a person can walk: everything but class 0, and only lines with a name we could read aloud. */
fun isWalkable(cls: Int, name: String): Boolean = cls != FREEWAY_CLASS && name != ""

private class Split(val seg: Int, val t: Double, val x: Double, val y: Double)

private fun cellKey(cx: Long, cy: Long): Long = cx * 100000L + cy

/**
 * Build the routable graph. Pass every street file the client holds (base + whichever cells it has).
 *
 * `key` is the caller's cache key — sha256 of the map files, so a new bundle builds a new graph and an unchanged
 * one is reused. Nothing about a person is part of it.
 */
fun buildStreetGraph(files: List<PackedStreets>, key: String = ""): StreetGraph {
    val t0 = System.currentTimeMillis()
    val all = ArrayList<Street>()
    for (f in files) all.addAll(decodeStreets(f))
    val hasSafety = files.any { it.safety != null && it.safety.isNotEmpty() }
    val streets = all.filter { isWalkable(it.cls, it.name) }
    val skipped = all.size - streets.size

    // 1. every segment of every polyline, bucketed into a 200 m grid
    val grid = LinkedHashMap<Long, MutableList<Int>>()
    val segRoad = ArrayList<Int>(); val segIdx = ArrayList<Int>()
    val segAx = ArrayList<Double>(); val segAy = ArrayList<Double>()
    val segBx = ArrayList<Double>(); val segBy = ArrayList<Double>()
    for (ri in streets.indices) {
        val r = streets[ri]
        var i = 0
        while (i + 1 < r.count) {
            val ax = r.x(i); val ay = r.y(i); val bx = r.x(i + 1); val by = r.y(i + 1)
            val si = segRoad.size
            segRoad.add(ri); segIdx.add(i); segAx.add(ax); segAy.add(ay); segBx.add(bx); segBy.add(by)
            val x0 = floor(min(ax, bx) / CELL_M).toLong(); val x1 = floor(max(ax, bx) / CELL_M).toLong()
            val y0 = floor(min(ay, by) / CELL_M).toLong(); val y1 = floor(max(ay, by) / CELL_M).toLong()
            var x = x0
            while (x <= x1) {
                var y = y0
                while (y <= y1) {
                    grid.getOrPut(cellKey(x, y)) { ArrayList() }.add(si)
                    y++
                }
                x++
            }
            i++
        }
    }

    // 2. crossings. Order of discovery does not matter: splits are sorted per polyline afterwards.
    val splits = LinkedHashMap<Int, MutableList<Split>>()
    fun addSplit(ri: Int, seg: Int, t: Double, x: Double, y: Double) {
        splits.getOrPut(ri) { ArrayList() }.add(Split(seg, t, x, y))
    }
    var crossings = 0
    val seen = HashSet<Long>()
    for (list in grid.values) {
        for (m in list.indices) for (n in m + 1 until list.size) {
            val p = list[m]; val q = list[n]
            val rp = segRoad[p]; val rq = segRoad[q]
            if (rp == rq) continue
            if (!mayJoin(streets[rp].cls, streets[rq].cls)) continue
            val pairKey = if (p < q) p * 10_000_000L + q else q * 10_000_000L + p
            if (!seen.add(pairKey)) continue
            val rx = segBx[p] - segAx[p]; val ry = segBy[p] - segAy[p]
            val sx = segBx[q] - segAx[q]; val sy = segBy[q] - segAy[q]
            val den = rx * sy - ry * sx
            if (abs(den) < 1e-12) continue
            val qx = segAx[q] - segAx[p]; val qy = segAy[q] - segAy[p]
            val t = (qx * sy - qy * sx) / den
            val u = (qx * ry - qy * rx) / den
            if (t < 0 || t > 1 || u < 0 || u > 1) continue
            val x = segAx[p] + t * rx; val y = segAy[p] + t * ry
            addSplit(rp, segIdx[p], t, x, y)
            addSplit(rq, segIdx[q], u, x, y)
            crossings++
        }
    }

    // 3. dangling ends: pull the OTHER line onto our endpoint when it passes within SNAP_M.
    var snapped = 0
    for (ri in streets.indices) {
        val r = streets[ri]
        for (end in 0..1) {
            val pi = if (end == 1) r.count - 1 else 0
            val px = r.x(pi); val py = r.y(pi)
            val cx = floor(px / CELL_M).toLong(); val cy = floor(py / CELL_M).toLong()
            var bestD = SNAP_M; var bestSeg = -1; var bestU = 0.0
            for (a in -1..1) for (b in -1..1) {
                val l = grid[cellKey(cx + a, cy + b)] ?: continue
                for (si in l) {
                    val rj = segRoad[si]
                    if (rj == ri || !mayJoin(streets[ri].cls, streets[rj].cls)) continue
                    val dx = segBx[si] - segAx[si]; val dy = segBy[si] - segAy[si]
                    val len2 = dx * dx + dy * dy
                    val u = if (len2 != 0.0) max(0.0, min(1.0, ((px - segAx[si]) * dx + (py - segAy[si]) * dy) / len2)) else 0.0
                    val ex = px - segAx[si] - u * dx; val ey = py - segAy[si] - u * dy
                    val d = sqrt(ex * ex + ey * ey)
                    if (d < bestD) { bestD = d; bestSeg = si; bestU = u }
                }
            }
            if (bestSeg >= 0) { addSplit(segRoad[bestSeg], segIdx[bestSeg], bestU, px, py); snapped++ }
        }
    }

    // 4. nodes and edges. Node ids are handed out in polyline order, so two clients build the same graph.
    val nodeGrid = LinkedHashMap<Long, MutableList<Int>>()
    val nodeXs = ArrayList<Double>(); val nodeYs = ArrayList<Double>()
    fun nodeOf(x: Double, y: Double): Int {
        val cx = floor(x / NODE_TOL_M).toLong(); val cy = floor(y / NODE_TOL_M).toLong()
        for (a in -1..1) for (b in -1..1) {
            val l = nodeGrid[cellKey(cx + a, cy + b)] ?: continue
            for (n in l) {
                val dx = nodeXs[n] - x; val dy = nodeYs[n] - y
                if (sqrt(dx * dx + dy * dy) <= NODE_TOL_M) return n
            }
        }
        val id = nodeXs.size
        nodeXs.add(x); nodeYs.add(y)
        nodeGrid.getOrPut(cellKey(cx, cy)) { ArrayList() }.add(id)
        return id
    }

    val eA = ArrayList<Int>(); val eB = ArrayList<Int>(); val eLen = ArrayList<Double>(); val eWay = ArrayList<Int>()
    val eSegA = ArrayList<Int>(); val eTA = ArrayList<Double>(); val eSegB = ArrayList<Int>(); val eTB = ArrayList<Double>()
    val wayName = ArrayList<String>(); val wayCls = ArrayList<Int>(); val waySafety = ArrayList<Int>()
    val wayPts = ArrayList<DoubleArray>()
    for (ri in streets.indices) {
        val r = streets[ri]
        val way = wayName.size
        wayName.add(r.name); wayCls.add(r.cls); waySafety.add(r.safety)
        wayPts.add(r.pts.copyOf())
        val sp = (splits[ri] ?: emptyList<Split>()).sortedWith(
            compareBy({ it.seg }, { it.t }),
        )
        var prev = nodeOf(r.x(0), r.y(0))
        var acc = 0.0
        var k = 0
        var segA = 0
        var tA = 0.0
        fun emit(n: Int, segB: Int, tB: Double) {
            eA.add(prev); eB.add(n); eLen.add(acc); eWay.add(way)
            eSegA.add(segA); eTA.add(tA); eSegB.add(segB); eTB.add(tB)
            prev = n; acc = 0.0; segA = segB; tA = tB
        }
        var i = 0
        while (i + 1 < r.count) {
            val dx = r.x(i + 1) - r.x(i); val dy = r.y(i + 1) - r.y(i)
            val len = sqrt(dx * dx + dy * dy)
            var last = 0.0
            while (k < sp.size && sp[k].seg == i) {
                val s = sp[k]
                val n = nodeOf(s.x, s.y)
                acc += len * (s.t - last); last = s.t
                if (n != prev && acc > MIN_EDGE_M) emit(n, i, s.t)
                k++
            }
            acc += len * (1 - last)
            i++
        }
        val end = nodeOf(r.x(r.count - 1), r.y(r.count - 1))
        if (end != prev && acc > MIN_EDGE_M) emit(end, max(0, r.count - 2), 1.0)
    }

    // 5. CSR
    val n = nodeXs.size
    val e = eA.size
    val head = IntArray(n + 1)
    for (i in 0 until e) { head[eA[i] + 1]++; head[eB[i] + 1]++ }
    for (i in 0 until n) head[i + 1] += head[i]
    val fill = IntArray(n) { head[it] }
    val edgeTo = IntArray(2 * e); val edgeLen = FloatArray(2 * e); val edgeWay = IntArray(2 * e)
    val halfEdge = IntArray(2 * e); val twinHalf = IntArray(2 * e)
    fun place(from: Int, to: Int, i: Int): Int {
        val at = fill[from]; fill[from] = at + 1
        edgeTo[at] = to; edgeLen[at] = eLen[i].toFloat(); edgeWay[at] = eWay[i]; halfEdge[at] = i
        return at
    }
    for (i in 0 until e) {
        val f = place(eA[i], eB[i], i)
        val b = place(eB[i], eA[i], i)
        twinHalf[f] = b; twinHalf[b] = f
    }

    // 6. components and dead ends, for the honesty tests
    val parent = IntArray(n) { it }
    fun find(start: Int): Int {
        var x = start
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x] }
        return x
    }
    for (i in 0 until e) { val a = find(eA[i]); val b = find(eB[i]); if (a != b) parent[a] = b }
    val sizes = HashMap<Int, Int>()
    for (i in 0 until n) { val r = find(i); sizes[r] = (sizes[r] ?: 0) + 1 }
    var largest = 0
    for (v in sizes.values) if (v > largest) largest = v
    var deadEnds = 0
    for (i in 0 until n) if (head[i + 1] - head[i] == 1) deadEnds++

    return StreetGraph(
        version = STREET_GRAPH_VERSION,
        key = if (key.isNotEmpty()) "$STREET_GRAPH_VERSION:$key" else "",
        nodeCount = n, edgeCount = e,
        nodeX = DoubleArray(n) { nodeXs[it] }, nodeY = DoubleArray(n) { nodeYs[it] },
        head = head, edgeTo = edgeTo, edgeLen = edgeLen, edgeWay = edgeWay,
        halfEdge = halfEdge, twinHalf = twinHalf,
        wayName = wayName, wayCls = IntArray(wayCls.size) { wayCls[it] },
        waySafety = IntArray(waySafety.size) { waySafety[it] }, wayPts = wayPts, hasSafety = hasSafety,
        edgeSegA = IntArray(e) { eSegA[it] }, edgeTA = FloatArray(e) { eTA[it].toFloat() },
        edgeSegB = IntArray(e) { eSegB[it] }, edgeTB = FloatArray(e) { eTB[it].toFloat() },
        edgeNodeA = IntArray(e) { eA[it] }, edgeNodeB = IntArray(e) { eB[it] },
        stats = GraphStats(
            polylines = streets.size, skipped = skipped, crossings = crossings, snapped = snapped,
            components = sizes.size, largestComponent = largest, deadEnds = deadEnds,
            buildMs = System.currentTimeMillis() - t0,
        ),
    )
}

// ---- the cache ------------------------------------------------------------------------------
// Building is ~200 ms on a laptop and 1-2 s on a cheap phone, so it happens once per map-file version. The key
// is the sha256 of the map files the client already checks the signature against; nothing else is in it.

const val STREET_GRAPH_CACHE_SIZE = 2

object StreetGraphCache {
    private val graphs = LinkedHashMap<String, StreetGraph>()

    /** Returns the cached graph for `sha256`, building it with `build` the first time. */
    @Synchronized
    fun get(sha256: String, build: () -> StreetGraph): StreetGraph {
        val key = "$STREET_GRAPH_VERSION:$sha256"
        val hit = graphs.remove(key)
        if (hit != null) { graphs[key] = hit; return hit }
        val g = build().withKey(key)
        graphs[key] = g
        while (graphs.size > STREET_GRAPH_CACHE_SIZE) graphs.remove(graphs.keys.first())
        return g
    }

    /** True when this sha256 is already built, so a caller can skip the "Getting the map ready" state. */
    @Synchronized
    fun holds(sha256: String): Boolean = graphs.containsKey("$STREET_GRAPH_VERSION:$sha256")

    @Synchronized
    fun clear() = graphs.clear()
}

// ---- edge geometry --------------------------------------------------------------------------
// An edge between two junctions is a piece of a real street, bends and all. These two functions are what a
// client draws and what the snapping measures against; nothing anywhere treats an edge as a straight chord.

/** The metre vertices of a half-edge, from its start node to its end node: flat [x, y, x, y, …]. */
fun edgeGeometry(g: StreetGraph, half: Int): DoubleArray {
    val e = g.halfEdge[half]
    val pts = g.wayPts[g.edgeWay[half]]
    fun atX(seg: Int, t: Double): Double {
        val i = 2 * seg; val j = i + 2
        return if (j + 1 >= pts.size) pts[i] else pts[i] + t * (pts[j] - pts[i])
    }
    fun atY(seg: Int, t: Double): Double {
        val i = 2 * seg; val j = i + 2
        return if (j + 1 >= pts.size) pts[i + 1] else pts[i + 1] + t * (pts[j + 1] - pts[i + 1])
    }
    val segA = g.edgeSegA[e]; val segB = g.edgeSegB[e]
    val out = ArrayList<Double>((segB - segA + 3) * 2)
    out.add(atX(segA, g.edgeTA[e].toDouble())); out.add(atY(segA, g.edgeTA[e].toDouble()))
    for (v in segA + 1..segB) { out.add(pts[2 * v]); out.add(pts[2 * v + 1]) }
    out.add(atX(segB, g.edgeTB[e].toDouble())); out.add(atY(segB, g.edgeTB[e].toDouble()))
    var flat = DoubleArray(out.size) { out[it] }
    val to = g.edgeTo[half]
    if (to == g.edgeNodeA[e]) {                       // this half runs B -> A, so the way's order is reversed
        val flipped = DoubleArray(flat.size)
        var w = 0
        var i = flat.size - 2
        while (i >= 0) { flipped[w] = flat[i]; flipped[w + 1] = flat[i + 1]; w += 2; i -= 2 }
        flat = flipped
    }
    // The two ends are the nodes themselves: a node made by a 12 m end-snap sits slightly off its own line, and
    // a drawn route must not show a gap there.
    val from = edgeFrom(g, half)
    flat[0] = g.nodeX[from]; flat[1] = g.nodeY[from]
    flat[flat.size - 2] = g.nodeX[to]; flat[flat.size - 1] = g.nodeY[to]
    return flat
}

/** The node a half-edge leaves. Its other end is `edgeTo[half]`. */
fun edgeFrom(g: StreetGraph, half: Int): Int {
    val e = g.halfEdge[half]
    return if (g.edgeTo[half] == g.edgeNodeA[e]) g.edgeNodeB[e] else g.edgeNodeA[e]
}

/** The part of a flat point list between two fractions of its own length. */
fun sliceByFraction(pts: DoubleArray, t0: Double, t1: Double): DoubleArray {
    val n = pts.size / 2
    if (n < 2) return pts.copyOf()
    val lens = DoubleArray(n - 1)
    var total = 0.0
    for (i in 0 until n - 1) {
        val dx = pts[2 * i + 2] - pts[2 * i]; val dy = pts[2 * i + 3] - pts[2 * i + 1]
        val d = sqrt(dx * dx + dy * dy)
        lens[i] = d; total += d
    }
    if (total <= 0) return doubleArrayOf(pts[0], pts[1])
    val lo = min(t0, t1) * total
    val hi = max(t0, t1) * total
    fun point(d: Double): DoubleArray {
        var acc = 0.0
        for (i in lens.indices) {
            if (acc + lens[i] >= d || i == lens.size - 1) {
                val u = if (lens[i] > 0) max(0.0, min(1.0, (d - acc) / lens[i])) else 0.0
                return doubleArrayOf(
                    pts[2 * i] + u * (pts[2 * i + 2] - pts[2 * i]),
                    pts[2 * i + 1] + u * (pts[2 * i + 3] - pts[2 * i + 1]),
                )
            }
            acc += lens[i]
        }
        return doubleArrayOf(pts[pts.size - 2], pts[pts.size - 1])
    }
    val out = ArrayList<Double>()
    val a = point(lo); out.add(a[0]); out.add(a[1])
    var acc = 0.0
    for (i in lens.indices) {
        acc += lens[i]
        if (acc > lo && acc < hi) { out.add(pts[2 * i + 2]); out.add(pts[2 * i + 3]) }
    }
    val b = point(hi); out.add(b[0]); out.add(b[1])
    if (t1 < t0) {
        val flipped = DoubleArray(out.size)
        var w = 0
        var i = out.size - 2
        while (i >= 0) { flipped[w] = out[i]; flipped[w + 1] = out[i + 1]; w += 2; i -= 2 }
        return flipped
    }
    return DoubleArray(out.size) { out[it] }
}

// ---- lookup ---------------------------------------------------------------------------------

/** A point on the graph: which edge, how far along it, and how far off the graph the original point was. */
class EdgePoint(
    /** Index into edgeTo/edgeLen/edgeWay (a directed half-edge), and the node it leaves. */
    val half: Int,
    val from: Int,
    val to: Int,
    /** 0..1 of the edge's own LENGTH along `from` -> `to`, measured on the real geometry. */
    val t: Double,
    val x: Double,
    val y: Double,
    /** Metres from the asked-for point to the street. This is the "then about N m to the building" number. */
    val offMetres: Double,
)

private fun nodeCellsFor(g: StreetGraph): HashMap<Long, MutableList<Int>> {
    g.nodeCells?.let { return it }
    val m = HashMap<Long, MutableList<Int>>()
    for (i in 0 until g.nodeCount) {
        val k = cellKey(floor(g.nodeX[i] / CELL_M).toLong(), floor(g.nodeY[i] / CELL_M).toLong())
        m.getOrPut(k) { ArrayList() }.add(i)
    }
    g.nodeCells = m
    return m
}

/** The nearest point ON AN EDGE to a location. We route to the street, never to the door. */
fun nearestEdgePoint(g: StreetGraph, lat: Double, lon: Double, maxMetres: Double = 2000.0): EdgePoint? {
    val px = toMetresX(lon); val py = toMetresY(lat)
    var best: EdgePoint? = null
    var bestD = maxMetres
    val cx = floor(px / CELL_M).toLong(); val cy = floor(py / CELL_M).toLong()
    val nodeCells = nodeCellsFor(g)
    if (nodeCells.isEmpty()) return null
    // Rings outwards from the point's own cell (r = 0 IS that cell), stopping as soon as a further ring could
    // not hold anything nearer.
    for (r in 0..12) {
        for (a in -r..r) for (b in -r..r) {
            if (max(abs(a), abs(b)) != r) continue
            val l = nodeCells[cellKey(cx + a, cy + b)] ?: continue
            for (node in l) {
                for (h in g.head[node] until g.head[node + 1]) {
                    // measured against the street's real shape, not a chord between its junctions
                    val geom = edgeGeometry(g, h)
                    var acc = 0.0; var total = 0.0; var bt = 0.0; var bx2 = 0.0; var by2 = 0.0
                    var bd = Double.POSITIVE_INFINITY
                    var i = 0
                    while (i + 3 < geom.size) {
                        val ax = geom[i]; val ay = geom[i + 1]
                        val dx = geom[i + 2] - ax; val dy = geom[i + 3] - ay
                        val len2 = dx * dx + dy * dy
                        val len = sqrt(len2)
                        val u = if (len2 != 0.0) max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2)) else 0.0
                        val x = ax + u * dx; val y = ay + u * dy
                        val ex = px - x; val ey = py - y
                        val d = sqrt(ex * ex + ey * ey)
                        if (d < bd) { bd = d; bt = acc + u * len; bx2 = x; by2 = y }
                        acc += len; total += len
                        i += 2
                    }
                    if (bd < bestD) {
                        bestD = bd
                        best = EdgePoint(h, node, g.edgeTo[h], if (total > 0) bt / total else 0.0, bx2, by2, bd)
                    }
                }
            }
        }
        if (best != null && bestD <= r * CELL_M) break
    }
    return best
}
