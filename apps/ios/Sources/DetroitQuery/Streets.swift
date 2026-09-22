// A routable street graph, built on the device from the map files the app already downloads.
// Swift port of packages/query/src/streets.ts, case for case. Spec: schema/query-spec.md "Streets graph".
//
// The bundle's street files (`map/base.json`, the cells inside `map/streets.json`) are drawn, not routed: a
// street is ONE polyline from end to end and every cross street crosses it mid-line, so 82% of polyline ends
// touch nothing. Noding fixes that on the phone: split every polyline wherever it geometrically crosses
// another, then pull each still-dangling end onto a line within 12 m.
//
// Nothing here touches the network, the clock, or a person's location. It is arithmetic on a file.
import Foundation

/// Metres per degree, at one fixed reference latitude for the whole service area, so every client gets the
/// same metre value for the same pair of points and fixtures can be compared exactly.
public let REF_LAT = 42.35
public let M_PER_DEG_LAT = 111132.0
public let M_PER_DEG_LON = 111320.0 * cos(REF_LAT * .pi / 180)

/// Whole units of 1e-5 degrees, the packing every map file uses (docs/06 "Map").
public let STREET_SCALE = 1e5

/// Build constants. Changing any of them changes the graph, so they are part of the spec.
public let CELL_M = 200.0          // grid cell for the crossing search
public let NODE_TOL_M = 1.0        // two points this close are one node
public let SNAP_M = 12.0           // a dangling polyline end is pulled onto a line this close
public let MIN_EDGE_M = 0.01       // shorter than this is not an edge
public let STREET_GRAPH_VERSION = 1

/// A street class, as the basemap writes it: 0 freeway/ramp, 1 main road, 2 arterial, 3 collector, 4 local.
public let FREEWAY_CLASS = 0

/// One street file exactly as the bundle carries it. `safety` is optional and additive (see `safetyByte`).
public struct PackedStreets: Decodable, Sendable {
    public var origin: [Double]                       // [lon, lat]
    public var names: [String]
    public var roads: [PackedRoad]                    // [class, nameIndex, encoded line]
    public var safety: [Int]?                         // one byte per entry of `roads`, same order

    public init(origin: [Double], names: [String], roads: [PackedRoad], safety: [Int]? = nil) {
        self.origin = origin; self.names = names; self.roads = roads; self.safety = safety
    }

    /// The same file with its safety array dropped — what a bundle built before 2026-09-22 looks like.
    public var withoutSafety: PackedStreets { PackedStreets(origin: origin, names: names, roads: roads) }
}

/// `[cls, nameIdx, encoded]`: a heterogeneous JSON array, so it decodes by position.
public struct PackedRoad: Decodable, Sendable {
    public var cls: Int
    public var nameIdx: Int
    public var enc: [Int]
    public init(cls: Int, nameIdx: Int, enc: [Int]) { self.cls = cls; self.nameIdx = nameIdx; self.enc = enc }
    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        cls = try c.decode(Int.self)
        nameIdx = try c.decode(Int.self)
        enc = try c.decode([Int].self)
    }
}

/// A decoded polyline, in metres, ready to be noded.
public struct Street: Sendable {
    public var cls: Int
    public var name: String
    /// The safety byte (`safetyByte`), or 0 when the file carried none.
    public var safety: Int
    /// Projected vertices: [x, y] in metres.
    public var pts: [[Double]]
    /// The same vertices as [lon, lat], kept for drawing.
    public var lonlat: [[Double]]
}

// ---- the safety byte ------------------------------------------------------------------------
// One byte per polyline, from the City's own Roads layer (`pipeline/src/ingest-basemap.ts`):
//   bit 0      HIN_2021       on the City's High Injury Network
//   bit 1      HighSeverity   the City's high-severity marking
//   bits 2-3   lanes          0 unknown, 1 = 1-2, 2 = 3-4, 3 = 5 or more
//   bits 4-5   posted speed   0 unknown, 1 = 25 or less, 2 = 30-35, 3 = 40 or more
//   bits 6-7   AADT           0 unknown, 1 = under 5k, 2 = 5k-20k, 3 = over 20k
// A byte of 0 means "this file told us nothing", which is exactly what an older bundle says.
public let SAFETY_HIN = 1
public let SAFETY_HIGH_SEVERITY = 2

public func lanesBucket(_ n: Double?) -> Int { guard let n, n > 0 else { return 0 }; return n <= 2 ? 1 : n <= 4 ? 2 : 3 }
public func speedBucket(_ n: Double?) -> Int { guard let n, n > 0 else { return 0 }; return n <= 25 ? 1 : n <= 35 ? 2 : 3 }
public func aadtBucket(_ n: Double?) -> Int { guard let n, n > 0 else { return 0 }; return n < 5000 ? 1 : n <= 20000 ? 2 : 3 }

public func safetyByte(hin: Bool = false, highSeverity: Bool = false, lanes: Double? = nil, speed: Double? = nil, aadt: Double? = nil) -> Int {
    (hin ? SAFETY_HIN : 0) | (highSeverity ? SAFETY_HIGH_SEVERITY : 0)
        | (lanesBucket(lanes) << 2) | (speedBucket(speed) << 4) | (aadtBucket(aadt) << 6)
}
public func safetyHin(_ b: Int) -> Bool { b & SAFETY_HIN != 0 }
public func safetyHighSeverity(_ b: Int) -> Bool { b & SAFETY_HIGH_SEVERITY != 0 }
public func safetyLanes(_ b: Int) -> Int { (b >> 2) & 3 }
public func safetySpeed(_ b: Int) -> Int { (b >> 4) & 3 }
public func safetyAadt(_ b: Int) -> Int { (b >> 6) & 3 }

// ---- decoding -------------------------------------------------------------------------------

public func toMetres(_ lon: Double, _ lat: Double) -> (x: Double, y: Double) { (lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT) }
public func toLonLat(_ x: Double, _ y: Double) -> (lon: Double, lat: Double) { (x / M_PER_DEG_LON, y / M_PER_DEG_LAT) }

/// One street file's polylines, decoded and projected. Order is the file's order, so the graph is deterministic.
public func decodeStreets(_ file: PackedStreets) -> [Street] {
    let ox = file.origin[0], oy = file.origin[1]
    return file.roads.enumerated().map { (i, r) in
        var lonlat: [[Double]] = []
        var x = 0, y = 0
        var k = 0
        while k + 1 < r.enc.count {
            if k == 0 { x = r.enc[0]; y = r.enc[1] } else { x += r.enc[k]; y += r.enc[k + 1] }
            lonlat.append([ox + Double(x) / STREET_SCALE, oy + Double(y) / STREET_SCALE])
            k += 2
        }
        let name = r.nameIdx >= 0 ? (r.nameIdx < file.names.count ? file.names[r.nameIdx] : "") : ""
        let safety = (file.safety?.indices.contains(i) ?? false) ? file.safety![i] : 0
        return Street(cls: r.cls, name: name, safety: safety,
                      pts: lonlat.map { let m = toMetres($0[0], $0[1]); return [m.x, m.y] }, lonlat: lonlat)
    }
}

// ---- the graph ------------------------------------------------------------------------------

/// Counts a person never sees; the real-data tests do.
public struct StreetGraphStats: Sendable {
    public var polylines = 0, skipped = 0, crossings = 0, snapped = 0, components = 0, largestComponent = 0, deadEnds = 0
    public var buildMs = 0
}

/// A street graph in flat arrays. Undirected: every edge appears once from each end (the City's layer
/// publishes no one-way field, which is exactly why there are no driving directions).
///
/// CSR: node `n`'s edges are the half-open range `head[n] ..< head[n + 1]` of `edgeTo`/`edgeLen`/`edgeWay`.
///
/// A final class, not a struct, so the node index below can be built once and kept beside it.
public final class StreetGraph: @unchecked Sendable {
    public let version = STREET_GRAPH_VERSION
    /// `"\(STREET_GRAPH_VERSION):\(sha256 of the map files)"`, the key this graph is cached under.
    public var key: String
    public let nodeCount: Int
    public let edgeCount: Int                 // undirected edges; the arrays below are twice this long
    public let nodeX: [Double]
    public let nodeY: [Double]
    public let head: [Int]                    // nodeCount + 1
    public let edgeTo: [Int]
    public let edgeLen: [Double]
    public let edgeWay: [Int]                 // into wayName / wayCls / waySafety / wayPts
    /// Which undirected edge each half-edge belongs to, for the geometry below.
    public let halfEdge: [Int]
    /// The same edge walked the other way. `twinHalf[twinHalf[h]] == h`.
    public let twinHalf: [Int]
    public let wayName: [String]
    public let wayCls: [Int]
    public let waySafety: [Int]
    /// Each way's own vertices, flat [x, y, x, y, …] in metres. An edge runs along a part of one of these.
    public let wayPts: [[Double]]
    // Where each undirected edge starts and ends along its way: vertex `seg` plus a fraction `t` towards
    // `seg + 1`. This is what keeps a curved street curved when the route is drawn — an edge between two
    // junctions is NOT a straight chord.
    public let edgeSegA: [Int]
    public let edgeTA: [Double]
    public let edgeSegB: [Int]
    public let edgeTB: [Double]
    public let edgeNodeA: [Int]
    public let edgeNodeB: [Int]
    /// True when at least one source file carried a `safety` array. Decides which penalty table Walk uses.
    public let hasSafety: Bool
    public let stats: StreetGraphStats

    /// The node grid, built once on first use. It is only an index; it holds nothing new.
    fileprivate lazy var nodeCells: [Int: [Int]] = {
        var m: [Int: [Int]] = [:]
        for i in 0..<nodeCount {
            let k = Int((nodeX[i] / CELL_M).rounded(.down)) * 100000 + Int((nodeY[i] / CELL_M).rounded(.down))
            m[k, default: []].append(i)
        }
        return m
    }()

    init(key: String, nodeCount: Int, edgeCount: Int, nodeX: [Double], nodeY: [Double], head: [Int], edgeTo: [Int],
         edgeLen: [Double], edgeWay: [Int], halfEdge: [Int], twinHalf: [Int], wayName: [String], wayCls: [Int],
         waySafety: [Int], wayPts: [[Double]], edgeSegA: [Int], edgeTA: [Double], edgeSegB: [Int], edgeTB: [Double],
         edgeNodeA: [Int], edgeNodeB: [Int], hasSafety: Bool, stats: StreetGraphStats) {
        self.key = key; self.nodeCount = nodeCount; self.edgeCount = edgeCount; self.nodeX = nodeX; self.nodeY = nodeY
        self.head = head; self.edgeTo = edgeTo; self.edgeLen = edgeLen; self.edgeWay = edgeWay
        self.halfEdge = halfEdge; self.twinHalf = twinHalf; self.wayName = wayName; self.wayCls = wayCls
        self.waySafety = waySafety; self.wayPts = wayPts; self.edgeSegA = edgeSegA; self.edgeTA = edgeTA
        self.edgeSegB = edgeSegB; self.edgeTB = edgeTB; self.edgeNodeA = edgeNodeA; self.edgeNodeB = edgeNodeB
        self.hasSafety = hasSafety; self.stats = stats
    }
}

/// Grade separation, stated: the map has no bridge/tunnel field, so a crossing of two lines is assumed to be a
/// junction. Two lines may only be joined when **neither is class 0** (freeway and ramp). That covers every
/// freeway-over-street and street-over-freeway case, which is where nearly all of Detroit's grade separation is,
/// and it is why class 0 is left out of the walking graph altogether — a freeway is not walkable anyway.
///
/// Residual error, not hidden: a street bridge over another street (rail viaducts, the Rouge crossings, service
/// drives over a sunken street) still becomes a junction.
public func mayJoin(_ clsA: Int, _ clsB: Int) -> Bool { clsA != FREEWAY_CLASS && clsB != FREEWAY_CLASS }

/// Streets a person can walk: everything but class 0, and only lines with a name we could read aloud.
public func isWalkable(cls: Int, name: String) -> Bool { cls != FREEWAY_CLASS && !name.isEmpty }

private struct Split { var seg: Int; var t: Double; var x: Double; var y: Double }

private func cellKey(_ cx: Int, _ cy: Int) -> Int { cx * 100000 + cy }
private func floorDiv(_ v: Double, _ by: Double) -> Int { Int((v / by).rounded(.down)) }

/// Build the routable graph. Pass every street file the client holds (base + whichever cells it has).
///
/// `key` is the caller's cache key — `sha256` of the map files, so a new bundle builds a new graph and an
/// unchanged one is reused. Nothing about a person is part of it.
public func buildStreetGraph(_ files: [PackedStreets], key: String = "") -> StreetGraph {
    let t0 = Date()
    let all = files.flatMap(decodeStreets)
    let hasSafety = files.contains { ($0.safety?.isEmpty == false) }
    let streets = all.filter { isWalkable(cls: $0.cls, name: $0.name) }
    let skipped = all.count - streets.count

    // 1. every segment of every polyline, bucketed into a 200 m grid
    var grid: [Int: [Int]] = [:]
    var segRoad: [Int] = [], segIdx: [Int] = [], segAx: [Double] = [], segAy: [Double] = [], segBx: [Double] = [], segBy: [Double] = []
    for (ri, r) in streets.enumerated() {
        var i = 0
        while i + 1 < r.pts.count {
            let a = r.pts[i], b = r.pts[i + 1]
            let si = segRoad.count
            segRoad.append(ri); segIdx.append(i); segAx.append(a[0]); segAy.append(a[1]); segBx.append(b[0]); segBy.append(b[1])
            let x0 = floorDiv(min(a[0], b[0]), CELL_M), x1 = floorDiv(max(a[0], b[0]), CELL_M)
            let y0 = floorDiv(min(a[1], b[1]), CELL_M), y1 = floorDiv(max(a[1], b[1]), CELL_M)
            for x in x0...x1 { for y in y0...y1 { grid[cellKey(x, y), default: []].append(si) } }
            i += 1
        }
    }

    // 2. crossings. Order of discovery does not matter: splits are sorted per polyline afterwards.
    var splits: [Int: [Split]] = [:]
    func addSplit(_ ri: Int, _ seg: Int, _ t: Double, _ x: Double, _ y: Double) {
        splits[ri, default: []].append(Split(seg: seg, t: t, x: x, y: y))
    }
    var crossings = 0
    var seen = Set<Int>()
    for list in grid.values {
        for m in 0..<list.count {
            var n = m + 1
            while n < list.count {
                defer { n += 1 }
                let p = list[m], q = list[n]
                let rp = segRoad[p], rq = segRoad[q]
                if rp == rq { continue }
                if !mayJoin(streets[rp].cls, streets[rq].cls) { continue }
                let pairKey = p < q ? p * 10_000_000 + q : q * 10_000_000 + p
                if seen.contains(pairKey) { continue }
                seen.insert(pairKey)
                let rx = segBx[p] - segAx[p], ry = segBy[p] - segAy[p]
                let sx = segBx[q] - segAx[q], sy = segBy[q] - segAy[q]
                let den = rx * sy - ry * sx
                if abs(den) < 1e-12 { continue }
                let qx = segAx[q] - segAx[p], qy = segAy[q] - segAy[p]
                let t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den
                if t < 0 || t > 1 || u < 0 || u > 1 { continue }
                let x = segAx[p] + t * rx, y = segAy[p] + t * ry
                addSplit(rp, segIdx[p], t, x, y)
                addSplit(rq, segIdx[q], u, x, y)
                crossings += 1
            }
        }
    }

    // 3. dangling ends: pull the OTHER line onto our endpoint when it passes within SNAP_M.
    var snapped = 0
    for ri in 0..<streets.count {
        let pts = streets[ri].pts
        for end in 0...1 {
            let p = end == 1 ? pts[pts.count - 1] : pts[0]
            let cx = floorDiv(p[0], CELL_M), cy = floorDiv(p[1], CELL_M)
            var bestD = SNAP_M, bestSeg = -1, bestU = 0.0
            for a in -1...1 { for b in -1...1 {
                guard let l = grid[cellKey(cx + a, cy + b)] else { continue }
                for si in l {
                    let rj = segRoad[si]
                    if rj == ri || !mayJoin(streets[ri].cls, streets[rj].cls) { continue }
                    let dx = segBx[si] - segAx[si], dy = segBy[si] - segAy[si], len2 = dx * dx + dy * dy
                    let u = len2 != 0 ? max(0, min(1, ((p[0] - segAx[si]) * dx + (p[1] - segAy[si]) * dy) / len2)) : 0
                    let d = hypot(p[0] - segAx[si] - u * dx, p[1] - segAy[si] - u * dy)
                    if d < bestD { bestD = d; bestSeg = si; bestU = u }
                }
            } }
            if bestSeg >= 0 { addSplit(segRoad[bestSeg], segIdx[bestSeg], bestU, p[0], p[1]); snapped += 1 }
        }
    }

    // 4. nodes and edges. Node ids are handed out in polyline order, so two clients build the same graph.
    var nodeGrid: [Int: [Int]] = [:]
    var nodeX: [Double] = [], nodeY: [Double] = []
    func nodeOf(_ x: Double, _ y: Double) -> Int {
        let cx = floorDiv(x, NODE_TOL_M), cy = floorDiv(y, NODE_TOL_M)
        for a in -1...1 { for b in -1...1 {
            guard let l = nodeGrid[cellKey(cx + a, cy + b)] else { continue }
            for n in l where hypot(nodeX[n] - x, nodeY[n] - y) <= NODE_TOL_M { return n }
        } }
        let id = nodeX.count; nodeX.append(x); nodeY.append(y)
        nodeGrid[cellKey(cx, cy), default: []].append(id)
        return id
    }

    var eA: [Int] = [], eB: [Int] = [], eLen: [Double] = [], eWay: [Int] = []
    var eSegA: [Int] = [], eTA: [Double] = [], eSegB: [Int] = [], eTB: [Double] = []
    var wayName: [String] = [], wayCls: [Int] = [], waySafety: [Int] = [], wayPts: [[Double]] = []
    for (ri, r) in streets.enumerated() {
        let way = wayName.count
        wayName.append(r.name); wayCls.append(r.cls); waySafety.append(r.safety)
        var flat = [Double](repeating: 0, count: r.pts.count * 2)
        for (i, p) in r.pts.enumerated() { flat[2 * i] = p[0]; flat[2 * i + 1] = p[1] }
        wayPts.append(flat)
        let sp = (splits[ri] ?? []).enumerated().sorted { l, r2 in
            if l.element.seg != r2.element.seg { return l.element.seg < r2.element.seg }
            if l.element.t != r2.element.t { return l.element.t < r2.element.t }
            return l.offset < r2.offset                       // stable, like Array.prototype.sort
        }.map(\.element)
        var prev = nodeOf(r.pts[0][0], r.pts[0][1]), acc = 0.0, k = 0, segA = 0, tA = 0.0
        func emit(_ n: Int, _ segB: Int, _ tB: Double) {
            eA.append(prev); eB.append(n); eLen.append(acc); eWay.append(way)
            eSegA.append(segA); eTA.append(tA); eSegB.append(segB); eTB.append(tB)
            prev = n; acc = 0; segA = segB; tA = tB
        }
        var i = 0
        while i + 1 < r.pts.count {
            let a = r.pts[i], b = r.pts[i + 1]
            let len = hypot(b[0] - a[0], b[1] - a[1])
            var last = 0.0
            while k < sp.count && sp[k].seg == i {
                let s = sp[k], n = nodeOf(s.x, s.y)
                acc += len * (s.t - last); last = s.t
                if n != prev && acc > MIN_EDGE_M { emit(n, i, s.t) }
                k += 1
            }
            acc += len * (1 - last)
            i += 1
        }
        let end = nodeOf(r.pts[r.pts.count - 1][0], r.pts[r.pts.count - 1][1])
        if end != prev && acc > MIN_EDGE_M { emit(end, max(0, r.pts.count - 2), 1) }
    }

    // 5. CSR
    let N = nodeX.count, E = eA.count
    var head = [Int](repeating: 0, count: N + 1)
    for i in 0..<E { head[eA[i] + 1] += 1; head[eB[i] + 1] += 1 }
    for i in 0..<N { head[i + 1] += head[i] }
    var fill = Array(head[0..<N])
    var edgeTo = [Int](repeating: 0, count: 2 * E), edgeLen = [Double](repeating: 0, count: 2 * E)
    var edgeWay = [Int](repeating: 0, count: 2 * E), halfEdge = [Int](repeating: 0, count: 2 * E)
    var twinHalf = [Int](repeating: 0, count: 2 * E)
    func place(_ from: Int, _ to: Int, _ i: Int) -> Int {
        let at = fill[from]; fill[from] = at + 1
        edgeTo[at] = to; edgeLen[at] = eLen[i]; edgeWay[at] = eWay[i]; halfEdge[at] = i
        return at
    }
    for i in 0..<E {
        let f = place(eA[i], eB[i], i), b = place(eB[i], eA[i], i)
        twinHalf[f] = b; twinHalf[b] = f
    }

    // 6. components and dead ends, for the honesty tests
    var parent = Array(0..<N)
    func find(_ x0: Int) -> Int { var x = x0; while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x] }; return x }
    for i in 0..<E { let a = find(eA[i]), b = find(eB[i]); if a != b { parent[a] = b } }
    var sizes: [Int: Int] = [:]
    for i in 0..<N { sizes[find(i), default: 0] += 1 }
    let largest = sizes.values.max() ?? 0
    var deadEnds = 0
    for i in 0..<N where head[i + 1] - head[i] == 1 { deadEnds += 1 }

    let stats = StreetGraphStats(polylines: streets.count, skipped: skipped, crossings: crossings, snapped: snapped,
                                 components: sizes.count, largestComponent: largest, deadEnds: deadEnds,
                                 buildMs: Int(Date().timeIntervalSince(t0) * 1000))
    return StreetGraph(key: key.isEmpty ? "" : "\(STREET_GRAPH_VERSION):\(key)", nodeCount: N, edgeCount: E,
                       nodeX: nodeX, nodeY: nodeY, head: head, edgeTo: edgeTo, edgeLen: edgeLen, edgeWay: edgeWay,
                       halfEdge: halfEdge, twinHalf: twinHalf, wayName: wayName, wayCls: wayCls, waySafety: waySafety,
                       wayPts: wayPts, edgeSegA: eSegA, edgeTA: eTA, edgeSegB: eSegB, edgeTB: eTB,
                       edgeNodeA: eA, edgeNodeB: eB, hasSafety: hasSafety, stats: stats)
}

// ---- the cache ------------------------------------------------------------------------------
// Building is ~200 ms on a laptop and 1-2 s on a cheap phone, so it happens once per map-file version. The key
// is the sha256 of the map files the client already checks the signature against; nothing else is in it.

public let STREET_GRAPH_CACHE_SIZE = 2

/// The graph cache, off the main actor. The key is `sha256` of the map files — nothing about a person.
public actor StreetGraphCache {
    public static let shared = StreetGraphCache()
    private var order: [String] = []
    private var graphs: [String: StreetGraph] = [:]

    public init() {}

    /// Returns the cached graph for `sha256`, building it with `build` the first time.
    public func graph(_ sha256: String, _ build: @Sendable () -> StreetGraph) -> StreetGraph {
        let key = "\(STREET_GRAPH_VERSION):\(sha256)"
        if let hit = graphs[key] {
            order.removeAll { $0 == key }; order.append(key)
            return hit
        }
        let g = build()
        g.key = key
        graphs[key] = g; order.append(key)
        while order.count > STREET_GRAPH_CACHE_SIZE { graphs.removeValue(forKey: order.removeFirst()) }
        return g
    }

    public func clear() { graphs.removeAll(); order.removeAll() }
}

// ---- edge geometry --------------------------------------------------------------------------
// An edge between two junctions is a piece of a real street, bends and all. These two functions are what a
// client draws and what the snapping measures against; nothing anywhere treats an edge as a straight chord.

/// The metre vertices of a half-edge, from its start node to its end node: flat [x, y, x, y, …].
public func edgeGeometry(_ g: StreetGraph, _ half: Int) -> [Double] {
    let e = g.halfEdge[half], pts = g.wayPts[g.edgeWay[half]]
    func at(_ seg: Int, _ t: Double) -> (Double, Double) {
        let i = 2 * seg, j = i + 2
        if j + 1 >= pts.count { return (pts[i], pts[i + 1]) }
        return (pts[i] + t * (pts[j] - pts[i]), pts[i + 1] + t * (pts[j + 1] - pts[i + 1]))
    }
    let segA = g.edgeSegA[e], segB = g.edgeSegB[e]
    var out: [Double] = []
    let start = at(segA, g.edgeTA[e])
    out.append(start.0); out.append(start.1)
    if segA + 1 <= segB { for v in (segA + 1)...segB { out.append(pts[2 * v]); out.append(pts[2 * v + 1]) } }
    let end = at(segB, g.edgeTB[e])
    out.append(end.0); out.append(end.1)
    let to = g.edgeTo[half]
    if to == g.edgeNodeA[e] {                      // this half runs B -> A, so the way's order is reversed
        var flipped: [Double] = []
        var i = out.count - 2
        while i >= 0 { flipped.append(out[i]); flipped.append(out[i + 1]); i -= 2 }
        out = flipped
    }
    // The two ends are the nodes themselves: a node made by a 12 m end-snap sits slightly off its own line, and
    // a drawn route must not show a gap there.
    let from = edgeFrom(g, half)
    out[0] = g.nodeX[from]; out[1] = g.nodeY[from]
    out[out.count - 2] = g.nodeX[to]; out[out.count - 1] = g.nodeY[to]
    return out
}

/// The node a half-edge leaves. Its other end is `edgeTo[half]`.
public func edgeFrom(_ g: StreetGraph, _ half: Int) -> Int {
    let e = g.halfEdge[half]
    return g.edgeTo[half] == g.edgeNodeA[e] ? g.edgeNodeB[e] : g.edgeNodeA[e]
}

/// The part of a flat point list between two fractions of its own length.
public func sliceByFraction(_ pts: [Double], _ t0: Double, _ t1: Double) -> [Double] {
    let n = pts.count / 2
    if n < 2 { return pts }
    var lens: [Double] = []; var total = 0.0
    for i in 0..<(n - 1) {
        let d = hypot(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1])
        lens.append(d); total += d
    }
    if total <= 0 { return [pts[0], pts[1]] }
    let lo = min(t0, t1) * total, hi = max(t0, t1) * total
    func point(_ d: Double) -> (Double, Double) {
        var acc = 0.0
        for i in 0..<lens.count {
            if acc + lens[i] >= d || i == lens.count - 1 {
                let u = lens[i] > 0 ? max(0, min(1, (d - acc) / lens[i])) : 0
                return (pts[2 * i] + u * (pts[2 * i + 2] - pts[2 * i]), pts[2 * i + 1] + u * (pts[2 * i + 3] - pts[2 * i + 1]))
            }
            acc += lens[i]
        }
        return (pts[pts.count - 2], pts[pts.count - 1])
    }
    var out: [Double] = []
    let a = point(lo); out.append(a.0); out.append(a.1)
    var acc = 0.0
    for i in 0..<lens.count {
        acc += lens[i]
        if acc > lo && acc < hi { out.append(pts[2 * i + 2]); out.append(pts[2 * i + 3]) }
    }
    let b = point(hi); out.append(b.0); out.append(b.1)
    if t1 < t0 {
        var flipped: [Double] = []
        var i = out.count - 2
        while i >= 0 { flipped.append(out[i]); flipped.append(out[i + 1]); i -= 2 }
        return flipped
    }
    return out
}

/// A point on the graph: which edge, how far along it, and how far off the graph the original point was.
public struct EdgePoint: Sendable {
    /// Index into `edgeTo`/`edgeLen`/`edgeWay` (a directed half-edge), and the node it leaves.
    public var half: Int
    public var from: Int
    public var to: Int
    /// 0..1 of the edge's own LENGTH along `from` -> `to`, measured on the real geometry.
    public var t: Double
    public var x: Double
    public var y: Double
    /// Metres from the asked-for point to the street. This is the "then about N m to the building" number.
    public var offMetres: Double
}

/// The nearest point ON AN EDGE to a location. We route to the street, never to the door.
public func nearestEdgePoint(_ g: StreetGraph, _ pt: LatLon, maxMetres: Double = 2000) -> EdgePoint? {
    let (px, py) = toMetres(pt.lon, pt.lat)
    var best: EdgePoint?, bestD = maxMetres
    let cx = floorDiv(px, CELL_M), cy = floorDiv(py, CELL_M)
    let cells = g.nodeCells
    if cells.isEmpty { return nil }
    // Rings outwards from the point's own cell (r = 0 IS that cell), stopping as soon as a further ring could
    // not hold anything nearer.
    for r in 0...12 {
        for a in -r...r { for b in -r...r {
            if max(abs(a), abs(b)) != r { continue }
            guard let l = cells[cellKey(cx + a, cy + b)] else { continue }
            for n in l {
                for h in g.head[n]..<g.head[n + 1] {
                    // measured against the street's real shape, not a chord between its junctions
                    let geom = edgeGeometry(g, h)
                    var acc = 0.0, total = 0.0, bt = 0.0, bx2 = 0.0, by2 = 0.0, bd = Double.infinity
                    var i = 0
                    while i + 3 < geom.count {
                        let ax = geom[i], ay = geom[i + 1], dx = geom[i + 2] - ax, dy = geom[i + 3] - ay
                        let len = hypot(dx, dy), len2 = dx * dx + dy * dy
                        let u = len2 != 0 ? max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
                        let x = ax + u * dx, y = ay + u * dy, d = hypot(px - x, py - y)
                        if d < bd { bd = d; bt = acc + u * len; bx2 = x; by2 = y }
                        acc += len; total += len
                        i += 2
                    }
                    if bd < bestD {
                        bestD = bd
                        best = EdgePoint(half: h, from: n, to: g.edgeTo[h], t: total > 0 ? bt / total : 0, x: bx2, y: by2, offMetres: bd)
                    }
                }
            }
        } }
        if best != nil && bestD <= Double(r) * CELL_M { break }
    }
    return best
}
