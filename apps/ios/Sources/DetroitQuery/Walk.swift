// Walking directions on the street graph. Swift port of packages/query/src/walk.ts.
// Spec: schema/query-spec.md "Walking directions".
//
// Everything is on the device. No origin, no destination and no query ever leaves the phone
// (DECISIONS 2026-09-22). The route is streets only: we have no sidewalk, curb-ramp or lighting data, so no
// client may call a route safe, accessible or lit — the words a client says are in strings/, and the rules
// here only hand it facts.
//
// We never route to the door. The route ends at the nearest point on a street and `endOffMetres` says how far
// the building still is, so a screen can say "then about 40 m to the building".
import Foundation

/// A person walking, for the estimates. 1.33 m/s is 80 m per minute — the number the plan's cost model uses.
public let WALK_M_PER_S = 1.33
public let WALK_M_PER_MIN = 80.0

/// Safety penalties. The cost of an edge is `metres * (1 + penalty)`, with `penalty` capped, so a calmer street
/// wins whenever the detour is smaller than the penalty allows: a cap of 0.60 means we will walk up to 60%
/// further to stay off the City's High Injury Network. These are the City of Detroit's own markings, not our
/// judgement (docs/research/2026-09-22-offline-directions.md §2.5, rule 3).
public enum SAFETY_PENALTY {
    public static let hin = 0.35                      // HIN_2021: on the City's High Injury Network
    public static let highSeverity = 0.20             // HighSeverity
    public static let lanes = [0.0, 0.0, 0.10, 0.20]  // unknown, 1-2, 3-4, 5+
    public static let speed = [0.0, 0.0, 0.10, 0.25]  // unknown, <=25, 30-35, 40+
    public static let aadt = [0.0, 0.0, 0.05, 0.15]   // unknown, <5k, 5k-20k, >20k
    public static let cap = 0.60
}

/// Used only when the street file carries no safety bytes (an older bundle, or an ingest the City refused).
/// Indexed by street class: 0 freeway (never walked), 1 main road, 2 arterial, 3 collector, 4 local street.
public let CLASS_PENALTY = [0.0, 0.15, 0.10, 0.05, 0.0]

/// What a turn costs, in metres of walking. On Detroit's grid every route between two corners is the same
/// length, so with no turn penalty the tie is broken arbitrarily and a person is handed a staircase of fifteen
/// turns instead of three streets. It never changes the distance that is reported — only which of several
/// equally long routes is the one described.
public let TURN_PENALTY_M = 40.0

/// The penalty for one way of the graph.
public func wayPenalty(_ g: StreetGraph, _ way: Int) -> Double {
    if !g.hasSafety { return CLASS_PENALTY[min(g.wayCls[way], 4)] }
    let b = g.waySafety[way]
    let p = (safetyHin(b) ? SAFETY_PENALTY.hin : 0) + (safetyHighSeverity(b) ? SAFETY_PENALTY.highSeverity : 0)
        + SAFETY_PENALTY.lanes[safetyLanes(b)] + SAFETY_PENALTY.speed[safetySpeed(b)] + SAFETY_PENALTY.aadt[safetyAadt(b)]
    return min(p, SAFETY_PENALTY.cap)
}

public enum Bearing: String, Sendable, Equatable {
    case north, northeast, east, southeast, south, southwest, west, northwest
}
public enum Turn: String, Sendable, Equatable {
    case straight, slightLeft = "slight_left", left, sharpLeft = "sharp_left"
    case slightRight = "slight_right", right, sharpRight = "sharp_right", around
}

private let BEARINGS: [Bearing] = [.north, .northeast, .east, .southeast, .south, .southwest, .west, .northwest]

/// Compass word for a direction in metres. Eight winds, each 45 degrees wide, north first.
public func bearingWord(_ dx: Double, _ dy: Double) -> Bearing {
    let deg = atan2(dx, dy) * 180 / .pi                        // 0 = north, clockwise
    let wrapped = deg.truncatingRemainder(dividingBy: 360)
    let i = Int(((wrapped + 360).truncatingRemainder(dividingBy: 360) / 45).rounded()) % 8
    return BEARINGS[i]
}

/// Turn word from the change of heading in degrees, signed: positive is to the right.
public func turnWord(_ deltaDeg: Double) -> Turn {
    let d = (deltaDeg + 540).truncatingRemainder(dividingBy: 360) - 180
    let a = abs(d)
    if a < 20 { return .straight }
    if a > 160 { return .around }
    let right = d > 0
    if a < 45 { return right ? .slightRight : .slightLeft }
    if a <= 135 { return right ? .right : .left }
    return right ? .sharpRight : .sharpLeft
}

/// One instruction. The client words it; these are facts.
public struct WalkStep: Sendable, Equatable {
    /// The street's name as the City publishes it. Unnamed lines are never routed on, so this is never empty.
    public var street: String
    public var bearing: Bearing
    /// How to get onto this street from the last one. `nil` on the first step.
    public var turn: Turn?
    public var metres: Double
}

public struct WalkRoute: Sendable {
    public var metres: Double
    /// Straight-line metres between the two asked-for points, so a client can show how direct a route is.
    public var straightMetres: Double
    /// At WALK_M_PER_S. An estimate, never a promise.
    public var seconds: Double
    public var steps: [WalkStep]
    /// [lon, lat] vertices to draw, from the snapped start point to the snapped end point.
    public var polyline: [[Double]]
    /// Metres from the asked-for start to the street, and from the street to the asked-for destination.
    public var startOffMetres: Double
    public var endOffMetres: Double
    /// Nodes settled by A*. A number for tests, never a screen.
    public var settled: Int
}

/// A binary min-heap of (key, value). The heap grows; the search never writes past its own end.
private struct MinHeap {
    private var k: [Double] = [], v: [Int] = []
    var isEmpty: Bool { v.isEmpty }
    mutating func push(_ key: Double, _ val: Int) {
        k.append(key); v.append(val)
        var i = k.count - 1
        while i > 0 {
            let p = (i - 1) >> 1
            if k[p] <= k[i] { break }
            k.swapAt(p, i); v.swapAt(p, i); i = p
        }
    }
    mutating func pop() -> Int {
        let top = v[0], m = k.count - 1
        k[0] = k[m]; v[0] = v[m]; k.removeLast(); v.removeLast()
        if m > 0 {
            var i = 0
            while true {
                let l = 2 * i + 1, r = l + 1
                var s = i
                if l < m && k[l] < k[s] { s = l }
                if r < m && k[r] < k[s] { s = r }
                if s == i { break }
                k.swapAt(s, i); v.swapAt(s, i); i = s
            }
        }
        return top
    }
}

/// A* from one point to another. Both points are snapped to the nearest edge, which is split for the search:
/// state ids `2 * edgeCount` and `2 * edgeCount + 1` are the virtual start and goal.
///
/// Returns nil when the two ends are in different pieces of the graph (0.5% of nodes are), or when either is
/// further than `maxSnapMetres` from any street.
public func walkRoute(_ g: StreetGraph, from: LatLon, to: LatLon, maxSnapMetres: Double = 2000) -> WalkRoute? {
    guard let a = nearestEdgePoint(g, from, maxMetres: maxSnapMetres),
          let b = nearestEdgePoint(g, to, maxMetres: maxSnapMetres) else { return nil }
    return routeBetween(g, a, b, from: from, to: to)
}

/// The same search between two points already snapped to edges (the transit planner snaps stops once).
public func routeBetween(_ g: StreetGraph, _ a: EdgePoint, _ b: EdgePoint, from: LatLon? = nil, to: LatLon? = nil) -> WalkRoute? {
    // The search is over HALF-EDGES, not nodes: a state is "walking along this edge in this direction", which is
    // what makes a turn cost something. On a grid every route between two corners is the same length, so without
    // a turn penalty the tie is broken arbitrarily and a person is handed a staircase of fifteen turns instead of
    // two streets. The penalty is small (TURN_PENALTY_M metres of walking) and never changes the reported
    // distance — it only decides which of several equally long routes a person is told to walk.
    let M = 2 * g.edgeCount, S = M, T = M + 1, total = M + 2
    if g.edgeCount == 0 { return nil }
    let aLen = g.edgeLen[a.half], bLen = g.edgeLen[b.half]
    let bTwin = g.twinHalf[b.half]
    /// The fraction of the goal edge already walked when arriving along half-edge `h`.
    func goalRemaining(_ h: Int) -> Double { h == b.half ? b.t * bLen : (1 - b.t) * bLen }

    var dist = [Double](repeating: .infinity, count: total)
    var cost = [Double](repeating: .infinity, count: total)
    var prev = [Int](repeating: -1, count: total)
    var closed = [Bool](repeating: false, count: total)
    var heap = MinHeap()
    var settled = 0
    /// Straight line to the goal from where a state leaves you standing. Admissible: no cost is negative.
    func h(_ s: Int) -> Double {
        if s == T { return 0 }
        if s == S { return hypot(a.x - b.x, a.y - b.y) }
        let n = g.edgeTo[s]
        return hypot(g.nodeX[n] - b.x, g.nodeY[n] - b.y)
    }
    func push(_ s: Int, _ c: Double, _ d: Double, _ fromState: Int) {
        if c >= cost[s] { return }
        cost[s] = c; dist[s] = d; prev[s] = fromState
        heap.push(c + h(s), s)
    }

    cost[S] = 0; dist[S] = 0
    heap.push(h(S), S)
    let aFor = a.half, aBack = g.twinHalf[a.half]
    let aPen = 1 + wayPenalty(g, g.edgeWay[a.half])
    push(aFor, (1 - a.t) * aLen * aPen, (1 - a.t) * aLen, S)
    push(aBack, a.t * aLen * aPen, a.t * aLen, S)
    if g.halfEdge[a.half] == g.halfEdge[b.half] {
        let bt = b.half == a.half ? b.t : 1 - b.t
        push(T, abs(bt - a.t) * aLen * aPen, abs(bt - a.t) * aLen, S)
    }

    while !heap.isEmpty {
        let s = heap.pop()
        if closed[s] { continue }
        closed[s] = true; settled += 1
        if s == T { break }
        if s == S { continue }
        let u = g.edgeTo[s], name = g.wayName[g.edgeWay[s]]
        for e in g.head[u]..<g.head[u + 1] {
            if e == g.twinHalf[s] { continue }                  // no turning round in the middle of a street
            let turn = g.wayName[g.edgeWay[e]] == name ? 0 : TURN_PENALTY_M
            let pen = 1 + wayPenalty(g, g.edgeWay[e])
            if e == b.half || e == bTwin { push(T, cost[s] + turn + goalRemaining(e) * pen, dist[s] + goalRemaining(e), s) }
            push(e, cost[s] + turn + g.edgeLen[e] * pen, dist[s] + g.edgeLen[e], s)
        }
    }
    if !cost[T].isFinite { return nil }

    // walk the path back, then turn it into steps and a polyline along the streets' real shape
    var path: [Int] = []
    var s = T
    while s != -1 { path.append(s); s = prev[s] }
    path.reverse()                                              // S, half-edge, half-edge, …, T

    /// What was walked in one step of the path: the vertices in travel order and the street's name.
    /// The goal is reached part-way along an edge that is never itself a state, so `T` renders that partial edge.
    func piece(_ i: Int) -> (geom: [Double], way: Int) {
        let st = path[i], before = path[i - 1]
        if st == T {
            if before == S {                                    // start and goal on one edge
                let bt = b.half == a.half ? b.t : 1 - b.t
                return (sliceByFraction(edgeGeometry(g, a.half), a.t, bt), g.edgeWay[a.half])
            }
            let u = g.edgeTo[before]
            let e = u == b.from ? b.half : bTwin
            let ft = e == b.half ? b.t : 1 - b.t
            return (sliceByFraction(edgeGeometry(g, e), 0, ft), g.edgeWay[e])
        }
        let geom = edgeGeometry(g, st)
        return (before == S ? sliceByFraction(geom, st == aFor ? a.t : 1 - a.t, 1) : geom, g.edgeWay[st])
    }

    var polyline: [[Double]] = []
    func pushPt(_ x: Double, _ y: Double) {
        let p = toLonLat(x, y)
        if let last = polyline.last, last[0] == p.lon, last[1] == p.lat { return }
        polyline.append([p.lon, p.lat])
    }
    var steps: [WalkStep] = []
    var lastHeading: Double?
    for i in 1..<path.count {
        let metres = dist[path[i]] - dist[path[i - 1]]
        let (geom, way) = piece(i)
        var k = 0
        while k + 1 < geom.count { pushPt(geom[k], geom[k + 1]); k += 2 }
        if metres <= 0 || geom.count < 4 { continue }
        let name = g.wayName[way]
        let dx0 = geom[2] - geom[0], dy0 = geom[3] - geom[1]
        let n = geom.count
        let heading0 = atan2(dx0, dy0) * 180 / .pi
        let headingEnd = atan2(geom[n - 2] - geom[n - 4], geom[n - 1] - geom[n - 3]) * 180 / .pi
        if var last = steps.last, last.street == name {
            last.metres += metres
            steps[steps.count - 1] = last
        } else {
            steps.append(WalkStep(street: name, bearing: bearingWord(dx0, dy0),
                                  turn: lastHeading == nil ? nil : turnWord(heading0 - lastHeading!), metres: metres))
        }
        lastHeading = headingEnd
    }
    let startPt = from ?? LatLon(lat: polyline[0][1], lon: polyline[0][0])
    let endPt = to ?? LatLon(lat: polyline[polyline.count - 1][1], lon: polyline[polyline.count - 1][0])
    return WalkRoute(metres: dist[T], straightMetres: metresBetween(startPt, endPt), seconds: dist[T] / WALK_M_PER_S,
                     steps: steps, polyline: polyline, startOffMetres: a.offMetres, endOffMetres: b.offMetres,
                     settled: settled)
}

/// Straight-line metres between two points, at the one reference latitude every client uses.
public func metresBetween(_ p: LatLon, _ q: LatLon) -> Double {
    hypot((q.lon - p.lon) * M_PER_DEG_LON, (q.lat - p.lat) * M_PER_DEG_LAT)
}
