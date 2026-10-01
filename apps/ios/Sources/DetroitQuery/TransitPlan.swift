// One integrated trip plan: walk, or walk-ride-walk, or up to four rides with walks between (three changes).
// Swift port of packages/query/src/transit-plan.ts. Spec: schema/query-spec.md "Trip plans".
//
// Kyle, 2026-09-22: "I want integrated walking and bus routes for the best user experience." So there is one
// entry point, `plan()`, and walking on its own is simply one of the candidates it ranks. Every walking leg,
// including the walk to the stop and the walk between two stops at a change, is a real A* walk on the street
// graph, so the distance and the drawn line are the streets a person actually walks.
//
// WE HAVE NO TIMETABLE AND WILL NOT PRETEND TO. No departure time, no arrival time, no live position, ever.
// A route's published headway ("about every 45 minutes on a weekday", DDOT only) is the one time-like fact we
// carry, and it enters the estimate as half a headway of waiting. The estimate leaves as a RANGE.
import Foundation

// ---- the cost model (constants, so three clients can agree) ----------------------------------
/// An average city bus, stops included: 280 m/min is about 17 km/h. It is an average, never a schedule.
public let BUS_M_PER_MIN = 280.0
/// Waiting is taken as half the published headway.
public let WAIT_FRACTION_OF_HEADWAY = 0.5
/// When a route publishes no headway (SMART, QLINE, the People Mover) this is the assumed wait.
public let DEFAULT_WAIT_MIN = 15.0
/// The cost of changing vehicle at all, on top of the wait and the walk.
public let CHANGE_PENALTY_MIN = 5.0
/// The first search allows one change, within ACCESS_M and TRANSFER_WALK_M: distance-only planning over-transfers,
/// so a trip one change answers is always answered that way (2026-09-22). Only when that search has nothing to try
/// does the wide search run (Kyle, 2026-10-01: "allow 3 changes and widen the walk"): the area is 75 places now, and
/// from most of Detroit a stop on 15 Mile Road in Clinton Township is two changes away.
public let SHORT_CHANGES = 1
/// The hard cap, in the wide search.
public let MAX_CHANGES = 3
/// A stop is "at" a place when it is this close in a straight line; the walk to it is then routed properly.
public let ACCESS_M = 400.0
/// The wide search's radius for access stops: half a mile, because suburban stops are far apart.
public let ACCESS_WIDE_M = 800.0
/// The wide search's longest walk at a change: across a wide suburban intersection to the far-side stop.
public let TRANSFER_WIDE_M = 400.0
/// How many route chains the wide search hands on to be walked out on the streets.
public let WIDE_CHAINS = 6
/// How many access stops we consider at each end.
public let MAX_ACCESS_STOPS = 8
/// A change on foot may be this long.
public let TRANSFER_WALK_M = 150.0
/// Walking on its own is always offered up to here (3 miles).
public let MAX_WALK_ONLY_M = 4828.0
/// How many itineraries come back.
public let MAX_PLANS = 3

// ---- the network -----------------------------------------------------------------------------

private let SCALE = 1e5

/// `map/transit/<id>.json` — the stops layer, exactly as the bundle carries it.
public struct PackedPoints: Decodable, Sendable {
    public var origin: [Double]
    public var names: [String]
    public var points: [[Int]]                    // [nameIdx, x, y]
    public init(origin: [Double], names: [String], points: [[Int]]) { self.origin = origin; self.names = names; self.points = points }
}

/// `<stops id>.net.json`, or the same two keys folded into a rail routes file.
public struct PackedServes: Decodable, Sendable {
    public var routeIds: [String]
    public var serves: [[Int]]
    enum CodingKeys: String, CodingKey { case routeIds = "route_ids", serves }
    public init(routeIds: [String], serves: [[Int]]) { self.routeIds = routeIds; self.serves = serves }
}

/// `[lineNameIdx, encoded]`: a heterogeneous JSON array, so it decodes by position.
public struct PackedLine: Decodable, Sendable {
    public var nameIdx: Int
    public var enc: [Int]
    public init(nameIdx: Int, enc: [Int]) { self.nameIdx = nameIdx; self.enc = enc }
    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        nameIdx = try c.decode(Int.self)
        enc = try c.decode([Int].self)
    }
}

/// `<routes id>.net.json`.
public struct PackedRoutes: Decodable, Sendable {
    public struct Entry: Decodable, Sendable {
        public var id: String
        public var short: String?
        public var long: String?
        public var headway: Double?
        public var frequent: Bool?
        public var lines: [Int]?
        public var stops: [[Int]]?
    }
    public var origin: [Double]
    public var names: [String]
    public var lines: [PackedLine]
    public var agency: String?
    public var system: String?
    public var routes: [Entry]
    public var routeIds: [String]?
    public var serves: [[Int]]?
    enum CodingKeys: String, CodingKey { case origin, names, lines, agency, system, routes, routeIds = "route_ids", serves }
}

public struct TransitLayer: Decodable, Sendable {
    public var stops: PackedPoints
    public var routes: PackedRoutes
    public var serves: PackedServes?
    public init(stops: PackedPoints, routes: PackedRoutes, serves: PackedServes? = nil) {
        self.stops = stops; self.routes = routes; self.serves = serves
    }
}

/// The map files spell their keys exactly as `PackedStreets`, `PackedPoints` and `PackedRoutes` name them, so
/// they decode with a plain decoder — never the bundle's snake-case one, which would rewrite `route_ids`.
public func directionsDecoder() -> JSONDecoder { JSONDecoder() }

public struct TransitStop: Sendable { public var name: String; public var lat: Double; public var lon: Double; public var layer: Int; public var routes: [Int] }

public struct TransitRoute: Sendable {
    public var id: String, short: String, long: String, agency: String, system: String
    /// The agency's own published headway in minutes, or nil. Never inferred, never a timetable.
    public var headway: Double?
    public var frequent: Bool
    /// One list of global stop indices per direction, in the owner's travel order.
    public var patterns: [[Int]]
    /// The drawn route lines, [lon, lat].
    public var lines: [[[Double]]]
}

public struct StopPosition: Sendable { public var route: Int; public var pattern: Int; public var at: Int }

public struct TransitNetwork: Sendable {
    public var stops: [TransitStop]
    public var routes: [TransitRoute]
    /// stop index -> where that stop sits in each route's pattern.
    public var posOf: [Int: [StopPosition]]
    public var cells: [Int: [Int]]
}

private let CELL_DEG = 0.005                    // about 400 m of latitude; the stop index's bucket
private func stopCellKey(_ lon: Double, _ lat: Double) -> Int {
    Int((lon / CELL_DEG).rounded(.down)) * 100000 + Int((lat / CELL_DEG).rounded(.down))
}

private func decodeLine(_ enc: [Int], _ origin: [Double]) -> [[Double]] {
    var out: [[Double]] = []; var x = 0, y = 0
    var i = 0
    while i + 1 < enc.count {
        if i == 0 { x = enc[0]; y = enc[1] } else { x += enc[i]; y += enc[i + 1] }
        out.append([origin[0] + Double(x) / SCALE, origin[1] + Double(y) / SCALE])
        i += 2
    }
    return out
}

/// Build one network out of every transit layer the client holds. Stop and route numbers are global.
public func buildTransitNetwork(_ layers: [TransitLayer]) -> TransitNetwork {
    var stops: [TransitStop] = [], routes: [TransitRoute] = []
    var posOf: [Int: [StopPosition]] = [:]
    for (li, layer) in layers.enumerated() {
        let stopBase = stops.count, routeBase = routes.count
        let o = layer.stops.origin
        for p in layer.stops.points {
            let nameIdx = p[0], x = p[1], y = p[2]
            let name = nameIdx >= 0 && nameIdx < layer.stops.names.count ? layer.stops.names[nameIdx] : ""
            stops.append(TransitStop(name: name, lat: o[1] + Double(y) / SCALE, lon: o[0] + Double(x) / SCALE, layer: li, routes: []))
        }
        let agency = layer.routes.agency ?? "", system = layer.routes.system ?? ""
        for r in layer.routes.routes {
            routes.append(TransitRoute(
                id: r.id, short: r.short ?? "", long: r.long ?? "", agency: agency, system: system,
                headway: (r.headway ?? 0) > 0 ? r.headway : nil,
                frequent: r.frequent == true,
                patterns: (r.stops ?? []).map { $0.map { s in stopBase + s } },
                lines: (r.lines ?? []).map { i in
                    decodeLine(i >= 0 && i < layer.routes.lines.count ? layer.routes.lines[i].enc : [], layer.routes.origin)
                }))
        }
        let serves = layer.serves?.serves ?? layer.routes.serves ?? []
        let routeIds = layer.serves?.routeIds ?? layer.routes.routeIds ?? layer.routes.routes.map(\.id)
        for (i, list) in serves.enumerated() {
            guard stopBase + i < stops.count else { continue }
            for ri in list {
                let at: Int
                if ri >= 0 && ri < routeIds.count {
                    let id = routeIds[ri]
                    at = routes.indices.first { $0 >= routeBase && routes[$0].id == id } ?? -1
                } else {
                    at = routeBase + ri
                }
                if at >= 0 && at < routes.count { stops[stopBase + i].routes.append(at) }
            }
        }
    }
    // a stop can also learn its routes from the patterns alone (rail files carry no `serves`)
    for (ri, r) in routes.enumerated() {
        for (pi, p) in r.patterns.enumerated() {
            for (at, s) in p.enumerated() {
                guard s >= 0 && s < stops.count else { continue }
                if !stops[s].routes.contains(ri) { stops[s].routes.append(ri) }
                posOf[s, default: []].append(StopPosition(route: ri, pattern: pi, at: at))
            }
        }
    }
    var cells: [Int: [Int]] = [:]
    for (i, s) in stops.enumerated() { cells[stopCellKey(s.lon, s.lat), default: []].append(i) }
    return TransitNetwork(stops: stops, routes: routes, posOf: posOf, cells: cells)
}

/// Stops within `metres` of a point, nearest first. Straight-line; the walk to them is routed afterwards.
public func stopsNear(_ net: TransitNetwork, _ pt: LatLon, metres: Double = ACCESS_M) -> [(stop: Int, metres: Double)] {
    let r = Int((metres / (CELL_DEG * M_PER_DEG_LAT)).rounded(.up)) + 1
    let cx = Int((pt.lon / CELL_DEG).rounded(.down)), cy = Int((pt.lat / CELL_DEG).rounded(.down))
    var out: [(stop: Int, metres: Double)] = []
    for a in -r...r { for b in -r...r {
        guard let l = net.cells[(cx + a) * 100000 + (cy + b)] else { continue }
        for i in l {
            let s = net.stops[i]
            let d = metresBetween(pt, LatLon(lat: s.lat, lon: s.lon))
            if d <= metres { out.append((i, d)) }
        }
    } }
    return out.sorted { $0.metres != $1.metres ? $0.metres < $1.metres : $0.stop < $1.stop }
}

// ---- what a plan looks like -------------------------------------------------------------------

public struct StopRef: Sendable, Equatable {
    public var index: Int
    public var name: String
    public init(index: Int, name: String) { self.index = index; self.name = name }
}

public struct WalkLeg: Sendable {
    public var metres: Double
    public var minutes: Double
    public var steps: [WalkStep]
    public var polyline: [[Double]]
    /// Set when this leg ends at, or starts from, a stop.
    public var toStop: StopRef?
    public var fromStop: StopRef?
    /// Public so a client's own wording tests can build a leg without a bundle.
    public init(metres: Double, minutes: Double, steps: [WalkStep], polyline: [[Double]],
                toStop: StopRef? = nil, fromStop: StopRef? = nil) {
        self.metres = metres; self.minutes = minutes; self.steps = steps; self.polyline = polyline
        self.toStop = toStop; self.fromStop = fromStop
    }
}

public struct RideLeg: Sendable {
    public var routeId: String
    public var routeShort: String
    public var routeLong: String
    public var agency: String
    /// Minutes between buses as the agency publishes it, or nil. A client may only say "about every N minutes
    /// on a weekday" when this is a number, and must never turn it into a departure time.
    public var headwayMinutes: Double?
    public var fromStop: StopRef
    public var toStop: StopRef
    /// Stops ridden, counting the one you get off at.
    public var stops: Int
    public var metres: Double
    public var minutes: Double
    /// The wait this plan assumed: half the headway, or DEFAULT_WAIT_MIN. An assumption, not a schedule.
    public var waitMinutes: Double
    public var polyline: [[Double]]
    // Which pattern this ride is, so the drawn line can be filled in for the few itineraries returned.
    var route = -1, pattern = -1, fromAt = -1, toAt = -1
    /// Public so a client's own wording tests can build a leg without a bundle. The pattern indices above stay
    /// internal: they are how the planner found the line, not anything a client may invent.
    public init(routeId: String, routeShort: String, routeLong: String, agency: String, headwayMinutes: Double?,
                fromStop: StopRef, toStop: StopRef, stops: Int, metres: Double, minutes: Double,
                waitMinutes: Double, polyline: [[Double]]) {
        self.routeId = routeId; self.routeShort = routeShort; self.routeLong = routeLong; self.agency = agency
        self.headwayMinutes = headwayMinutes; self.fromStop = fromStop; self.toStop = toStop; self.stops = stops
        self.metres = metres; self.minutes = minutes; self.waitMinutes = waitMinutes; self.polyline = polyline
    }
}

public enum PlanLeg: Sendable {
    case walk(WalkLeg)
    case ride(RideLeg)
    public var isRide: Bool { if case .ride = self { return true }; return false }
    public var rideLeg: RideLeg? { if case .ride(let r) = self { return r }; return nil }
    public var walkLeg: WalkLeg? { if case .walk(let w) = self { return w }; return nil }
}

public struct Itinerary: Sendable {
    public var legs: [PlanLeg]
    public var changes: Int
    public var walkMetres: Double
    public var rideMetres: Double
    /// The whole estimate in minutes, walking + riding + waiting + change penalty. Never shown as one number.
    public var minutes: Double
    /// What a screen shows: "about 25 to 40 minutes". Always a range.
    public var range: (lo: Int, hi: Int)
    /// Metres from the asked-for start to the first street, and from the last street to the destination.
    public var startOffMetres: Double
    public var endOffMetres: Double
    /// Public so a client's own wording tests can build one without a bundle.
    public init(legs: [PlanLeg], changes: Int, walkMetres: Double, rideMetres: Double, minutes: Double,
                range: (lo: Int, hi: Int), startOffMetres: Double, endOffMetres: Double) {
        self.legs = legs; self.changes = changes; self.walkMetres = walkMetres; self.rideMetres = rideMetres
        self.minutes = minutes; self.range = range; self.startOffMetres = startOffMetres; self.endOffMetres = endOffMetres
    }
}

/// The range a client says. Rounded to 5 minutes, at least 5 minutes wide, never a single number.
public func minutesRange(_ minutes: Double) -> (lo: Int, hi: Int) {
    let lo = max(5, Int((minutes * 0.85 / 5).rounded(.down)) * 5)
    var hi = Int((minutes * 1.25 / 5).rounded(.up)) * 5
    if hi - lo < 5 { hi = lo + 5 }
    return (lo, hi)
}

private func waitFor(_ r: TransitRoute) -> Double { if let h = r.headway, h > 0 { return h * WAIT_FRACTION_OF_HEADWAY }; return DEFAULT_WAIT_MIN }

/// Ride distance along a pattern, stop to stop.
private func rideMetres(_ net: TransitNetwork, _ pattern: [Int], _ from: Int, _ to: Int) -> Double {
    var m = 0.0
    for i in from..<to {
        let a = net.stops[pattern[i]], b = net.stops[pattern[i + 1]]
        m += metresBetween(LatLon(lat: a.lat, lon: a.lon), LatLon(lat: b.lat, lon: b.lon))
    }
    return m
}

/// The route's own drawn line between two stops, or the stops themselves when no line fits.
private func ridePolyline(_ net: TransitNetwork, _ route: TransitRoute, _ pattern: [Int], _ from: Int, _ to: Int) -> [[Double]] {
    let a = net.stops[pattern[from]], b = net.stops[pattern[to]]
    let aP = LatLon(lat: a.lat, lon: a.lon), bP = LatLon(lat: b.lat, lon: b.lon)
    var best: (line: [[Double]], i: Int, j: Int, d: Double)?
    for line in route.lines {
        if line.count < 2 { continue }
        var bi = 0, bj = 0, di = Double.infinity, dj = Double.infinity
        for (k, p) in line.enumerated() {
            let here = LatLon(lat: p[1], lon: p[0])
            let pa = metresBetween(aP, here), pb = metresBetween(bP, here)
            if pa < di { di = pa; bi = k }
            if pb < dj { dj = pb; bj = k }
        }
        if bi == bj { continue }
        if best == nil || di + dj < best!.d { best = (line, bi, bj, di + dj) }
    }
    if let best, best.d < 200 {
        let i = min(best.i, best.j), j = max(best.i, best.j)
        var slice = Array(best.line[i...j])
        if best.i > best.j { slice.reverse() }
        return [[a.lon, a.lat]] + slice + [[b.lon, b.lat]]
    }
    return pattern[from...to].map { [net.stops[$0].lon, net.stops[$0].lat] }
}

private func stopRef(_ net: TransitNetwork, _ i: Int) -> StopRef { StopRef(index: i, name: net.stops[i].name) }

private func stopPoint(_ net: TransitNetwork, _ i: Int) -> LatLon { LatLon(lat: net.stops[i].lat, lon: net.stops[i].lon) }

private func walkLeg(_ r: WalkRoute, toStop: StopRef? = nil, fromStop: StopRef? = nil) -> PlanLeg {
    .walk(WalkLeg(metres: r.metres, minutes: r.metres / WALK_M_PER_MIN, steps: r.steps, polyline: r.polyline,
                  toStop: toStop, fromStop: fromStop))
}

private func finish(_ legs: [PlanLeg], _ startOff: Double, _ endOff: Double) -> Itinerary {
    var walk = 0.0, ride = 0.0, minutes = 0.0, changes = -1
    for l in legs {
        switch l {
        case .walk(let w): walk += w.metres; minutes += w.minutes
        case .ride(let r): ride += r.metres; minutes += r.minutes + r.waitMinutes; changes += 1
        }
    }
    if changes < 0 { changes = 0 }
    minutes += Double(changes) * CHANGE_PENALTY_MIN
    return Itinerary(legs: legs, changes: changes, walkMetres: walk, rideMetres: ride, minutes: minutes,
                     range: minutesRange(minutes), startOffMetres: startOff, endOffMetres: endOff)
}

/// Rank: the estimate in minutes, then fewer changes, then less walking, then fewer ride stops, then the first
/// route's id — so one bundle always answers the same way.
private func better(_ a: Itinerary, _ b: Itinerary) -> Bool {
    func rideStops(_ x: Itinerary) -> Int { x.legs.reduce(0) { $0 + ($1.rideLeg?.stops ?? 0) } }
    func firstRoute(_ x: Itinerary) -> String { x.legs.compactMap(\.rideLeg).first?.routeId ?? "" }
    if a.minutes != b.minutes { return a.minutes < b.minutes }
    if a.changes != b.changes { return a.changes < b.changes }
    if a.walkMetres != b.walkMetres { return a.walkMetres < b.walkMetres }
    let ra = rideStops(a), rb = rideStops(b)
    if ra != rb { return ra < rb }
    return firstRoute(a) < firstRoute(b)
}

public struct PlanOptions: Sendable {
    /// Straight-line radius for access stops (default ACCESS_M).
    public var accessMetres: Double = ACCESS_M
    /// Longest walk-only trip still offered (default MAX_WALK_ONLY_M).
    public var maxWalkOnlyMetres: Double = MAX_WALK_ONLY_M
    /// How many itineraries (default MAX_PLANS).
    public var limit: Int = MAX_PLANS
    public init(accessMetres: Double = ACCESS_M, maxWalkOnlyMetres: Double = MAX_WALK_ONLY_M, limit: Int = MAX_PLANS) {
        self.accessMetres = accessMetres; self.maxWalkOnlyMetres = maxWalkOnlyMetres; self.limit = limit
    }
}

/// The whole answer to "how do I get there": ranked itineraries of walking and riding legs.
///
/// Pure walking is always one of the candidates when it is under `maxWalkOnlyMetres`, and it is ranked by the
/// same cost model as the bus plans — so "walk, it is four blocks" wins on its own merits, and a bus only wins
/// when it really is faster given an honest wait.
///
/// When the one-change search has nothing to try (`hasShortPlan` is false), the wide search runs: up to MAX_CHANGES
/// changes, access stops within ACCESS_WIDE_M and changes within TRANSFER_WIDE_M (`routeChains`).
///
/// Returns [] when nothing works: nothing within walking distance, no route between the two ends within three
/// changes, and the two ends in different pieces of the street graph. A client says so; it never invents a leg.
public func plan(_ g: StreetGraph, _ net: TransitNetwork, from: LatLon, to: LatLon, options: PlanOptions = PlanOptions()) -> [Itinerary] {
    let access = options.accessMetres
    var out: [Itinerary] = []

    // 0. walking on its own
    if let direct = walkRoute(g, from: from, to: to), direct.metres <= options.maxWalkOnlyMetres {
        out.append(finish([walkLeg(direct)], direct.startOffMetres, direct.endOffMetres))
    }

    let originStops = Array(stopsNear(net, from, metres: access).prefix(MAX_ACCESS_STOPS))
    let destStops = Array(stopsNear(net, to, metres: access).prefix(MAX_ACCESS_STOPS))
    if !originStops.isEmpty && !destStops.isEmpty {
        let fromSnap = nearestEdgePoint(g, from), toSnap = nearestEdgePoint(g, to)
        var snaps: [Int: EdgePoint?] = [:]
        func snapStop(_ i: Int) -> EdgePoint? {
            if let s = snaps[i] { return s }
            let s = nearestEdgePoint(g, LatLon(lat: net.stops[i].lat, lon: net.stops[i].lon))
            snaps[i] = s
            return s
        }
        var accessWalk: [Int: WalkRoute?] = [:]
        func walkTo(_ i: Int) -> WalkRoute? {
            if let w = accessWalk[i] { return w }
            let s = snapStop(i)
            let w = (fromSnap != nil && s != nil)
                ? routeBetween(g, fromSnap!, s!, from: from, to: LatLon(lat: net.stops[i].lat, lon: net.stops[i].lon)) : nil
            accessWalk[i] = w
            return w
        }
        var egressWalk: [Int: WalkRoute?] = [:]
        func walkFrom(_ i: Int) -> WalkRoute? {
            if let w = egressWalk[i] { return w }
            let s = snapStop(i)
            let w = (s != nil && toSnap != nil)
                ? routeBetween(g, s!, toSnap!, from: LatLon(lat: net.stops[i].lat, lon: net.stops[i].lon), to: to) : nil
            egressWalk[i] = w
            return w
        }

        struct Board { var stop: Int; var pattern: Int; var at: Int }
        var originOrder: [Int] = [], originAt: [Int: [Board]] = [:]        // route -> boardable
        for s in originStops { for e in net.posOf[s.stop] ?? [] {
            if originAt[e.route] == nil { originOrder.append(e.route) }
            originAt[e.route, default: []].append(Board(stop: s.stop, pattern: e.pattern, at: e.at))
        } }
        var destAt: [Int: [Board]] = [:]                                   // route -> alightable
        for s in destStops { for e in net.posOf[s.stop] ?? [] {
            destAt[e.route, default: []].append(Board(stop: s.stop, pattern: e.pattern, at: e.at))
        } }

        // The drawn line of a ride costs a pass over the route's vertices, so it is filled in at the end, for
        // the few itineraries that are actually returned.
        func makeRideLeg(_ ri: Int, _ pattern: Int, _ fromAt: Int, _ toAt: Int) -> PlanLeg? {
            let r = net.routes[ri], p = r.patterns[pattern]
            guard toAt > fromAt else { return nil }
            let m = rideMetres(net, p, fromAt, toAt)
            var leg = RideLeg(routeId: r.id, routeShort: r.short, routeLong: r.long, agency: r.agency,
                              headwayMinutes: r.headway, fromStop: stopRef(net, p[fromAt]), toStop: stopRef(net, p[toAt]),
                              stops: toAt - fromAt, metres: m, minutes: m / BUS_M_PER_MIN, waitMinutes: waitFor(r),
                              polyline: [])
            leg.route = ri; leg.pattern = pattern; leg.fromAt = fromAt; leg.toAt = toAt
            return .ride(leg)
        }

        // 1. direct rides
        for ri in originOrder {
            guard let boards = originAt[ri], let alights = destAt[ri] else { continue }
            for b in boards { for a in alights {
                if a.pattern != b.pattern || a.at <= b.at { continue }
                guard let w1 = walkTo(b.stop), let w2 = walkFrom(a.stop), let leg = makeRideLeg(ri, b.pattern, b.at, a.at) else { continue }
                out.append(finish([walkLeg(w1, toStop: stopRef(net, b.stop)), leg, walkLeg(w2, fromStop: stopRef(net, a.stop))],
                                  w1.startOffMetres, w2.endOffMetres))
            } }
        }

        // 2. one change: ride, then a change at the same stop or a walk of at most TRANSFER_WALK_M
        if SHORT_CHANGES >= 1 {
            var transferWalk: [String: WalkRoute?] = [:]
            func walkBetween(_ i: Int, _ j: Int) -> WalkRoute? {
                let k = "\(i):\(j)"
                if let w = transferWalk[k] { return w }
                let a = snapStop(i), b = snapStop(j)
                let w = (a != nil && b != nil)
                    ? routeBetween(g, a!, b!, from: LatLon(lat: net.stops[i].lat, lon: net.stops[i].lon),
                                   to: LatLon(lat: net.stops[j].lat, lon: net.stops[j].lon)) : nil
                transferWalk[k] = w
                return w
            }
            // A bound on the work, not on the answer: the ranking only ever keeps a handful, and every
            // candidate past this many is a worse version of one already found.
            let CANDIDATE_CAP = 400
            outer: for r1 in originOrder {
                guard let boards = originAt[r1] else { continue }
                if destAt[r1] != nil { continue }                  // a direct ride already covers this route
                if out.count > CANDIDATE_CAP { break outer }
                for b in boards {
                    let p1 = net.routes[r1].patterns[b.pattern]
                    var at = b.at + 1
                    while at < p1.count {
                        defer { at += 1 }
                        let x = p1[at]
                        for (y, gap) in stopsNear(net, LatLon(lat: net.stops[x].lat, lon: net.stops[x].lon), metres: TRANSFER_WALK_M) {
                            for e in net.posOf[y] ?? [] {
                                if e.route == r1 { continue }
                                guard let alights = destAt[e.route] else { continue }
                                for a in alights {
                                    if a.pattern != e.pattern || a.at <= e.at { continue }
                                    guard let w1 = walkTo(b.stop), let w3 = walkFrom(a.stop),
                                          let leg1 = makeRideLeg(r1, b.pattern, b.at, at),
                                          let leg2 = makeRideLeg(e.route, e.pattern, e.at, a.at) else { continue }
                                    var mid: [PlanLeg] = []
                                    // Two stops less than a metre apart (a DDOT and a SMART stop on one pole) are one spot: no walk.
                                    if x != y && gap >= 1 {
                                        guard let w2 = walkBetween(x, y) else { continue }
                                        mid.append(walkLeg(w2, toStop: stopRef(net, y), fromStop: stopRef(net, x)))
                                    }
                                    out.append(finish([walkLeg(w1, toStop: stopRef(net, b.stop)), leg1] + mid
                                                      + [leg2, walkLeg(w3, fromStop: stopRef(net, a.stop))],
                                                      w1.startOffMetres, w3.endOffMetres))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. the wide search, only when the one-change search had nothing to try
    if !hasShortPlan(net, from: from, to: to, access: access) {
        let fromSnap = nearestEdgePoint(g, from), toSnap = nearestEdgePoint(g, to)
        var snaps: [Int: EdgePoint?] = [:]
        func snapStop(_ i: Int) -> EdgePoint? {
            if let s = snaps[i] { return s }
            let s = nearestEdgePoint(g, stopPoint(net, i))
            snaps[i] = s
            return s
        }
        chains: for chain in routeChains(net, from: from, to: to) {
            let first = chain[0], last = chain[chain.count - 1]
            let b0 = net.routes[first.route].patterns[first.pattern][first.from]
            let an = net.routes[last.route].patterns[last.pattern][last.to]
            let s0 = snapStop(b0), sn = snapStop(an)
            let w1 = (fromSnap != nil && s0 != nil) ? routeBetween(g, fromSnap!, s0!, from: from, to: stopPoint(net, b0)) : nil
            let w3 = (sn != nil && toSnap != nil) ? routeBetween(g, sn!, toSnap!, from: stopPoint(net, an), to: to) : nil
            guard let w1, let w3 else { continue }
            var legs: [PlanLeg] = [walkLeg(w1, toStop: stopRef(net, b0))]
            for (i, c) in chain.enumerated() {
                if i > 0 {
                    let prev = chain[i - 1]
                    let x = net.routes[prev.route].patterns[prev.pattern][prev.to], y = net.routes[c.route].patterns[c.pattern][c.from]
                    if x != y && metresBetween(stopPoint(net, x), stopPoint(net, y)) >= 1 {
                        let a = snapStop(x), b = snapStop(y)
                        guard a != nil && b != nil, let w = routeBetween(g, a!, b!, from: stopPoint(net, x), to: stopPoint(net, y))
                        else { continue chains }
                        legs.append(walkLeg(w, toStop: stopRef(net, y), fromStop: stopRef(net, x)))
                    }
                }
                let r = net.routes[c.route], p = r.patterns[c.pattern], m = rideMetres(net, p, c.from, c.to)
                var leg = RideLeg(routeId: r.id, routeShort: r.short, routeLong: r.long, agency: r.agency,
                                  headwayMinutes: r.headway, fromStop: stopRef(net, p[c.from]), toStop: stopRef(net, p[c.to]),
                                  stops: c.to - c.from, metres: m, minutes: m / BUS_M_PER_MIN, waitMinutes: waitFor(r),
                                  polyline: [])
                leg.route = c.route; leg.pattern = c.pattern; leg.fromAt = c.from; leg.toAt = c.to
                legs.append(.ride(leg))
            }
            legs.append(walkLeg(w3, fromStop: stopRef(net, an)))
            out.append(finish(legs, w1.startOffMetres, w3.endOffMetres))
        }
    }

    // one itinerary per shape: the same sequence of routes never comes back twice
    var seen = Set<String>()
    var ranked: [Itinerary] = []
    let sorted = out.enumerated().sorted { l, r in
        if better(l.element, r.element) { return true }
        if better(r.element, l.element) { return false }
        return l.offset < r.offset                                 // stable, like Array.prototype.sort
    }.map(\.element)
    for it in sorted {
        let ids = it.legs.compactMap(\.rideLeg).map(\.routeId)
        let key = ids.isEmpty ? "walk" : ids.joined(separator: ">")
        if seen.contains(key) { continue }
        seen.insert(key)
        ranked.append(it)
        if ranked.count >= options.limit { break }
    }
    for (i, it) in ranked.enumerated() {
        for (j, l) in it.legs.enumerated() {
            guard var r = l.rideLeg, r.route >= 0 else { continue }
            r.polyline = ridePolyline(net, net.routes[r.route], net.routes[r.route].patterns[r.pattern], r.fromAt, r.toAt)
            ranked[i].legs[j] = .ride(r)
        }
    }
    return ranked
}

// ---- the wide search ---------------------------------------------------------------------------

/// Whether the one-change search (`plan`'s steps 1 and 2) has anything to try: a route that calls within `access`
/// of both ends in travel order, or a change within TRANSFER_WALK_M from a route near the start onto one near the
/// end. Read from the network alone, so `plan` and `tripWindow` always agree on whether the wide search runs.
public func hasShortPlan(_ net: TransitNetwork, from: LatLon, to: LatLon, access: Double = ACCESS_M) -> Bool {
    let originStops = stopsNear(net, from, metres: access).prefix(MAX_ACCESS_STOPS)
    let destStops = stopsNear(net, to, metres: access).prefix(MAX_ACCESS_STOPS)
    if originStops.isEmpty || destStops.isEmpty { return false }
    var destAt: [Int: [(pattern: Int, at: Int)]] = [:]
    for d in destStops { for e in net.posOf[d.stop] ?? [] { destAt[e.route, default: []].append((e.pattern, e.at)) } }
    func reachesEnd(_ route: Int, _ pattern: Int, _ at: Int) -> Bool {
        (destAt[route] ?? []).contains { $0.pattern == pattern && $0.at > at }
    }
    for o in originStops {
        for b in net.posOf[o.stop] ?? [] {
            if reachesEnd(b.route, b.pattern, b.at) { return true }
            let p1 = net.routes[b.route].patterns[b.pattern]
            var at = b.at + 1
            while at < p1.count {
                for near in stopsNear(net, stopPoint(net, p1[at]), metres: TRANSFER_WALK_M) {
                    for e in net.posOf[near.stop] ?? [] where e.route != b.route && reachesEnd(e.route, e.pattern, e.at) { return true }
                }
                at += 1
            }
        }
    }
    return false
}

/// One ride of a chain: a route, one of its patterns, and the positions boarded and left on it.
public struct ChainRide: Sendable, Equatable {
    public var route: Int, pattern: Int, from: Int, to: Int
    public init(route: Int, pattern: Int, from: Int, to: Int) { self.route = route; self.pattern = pattern; self.from = from; self.to = to }
}

/// The wide search, on the network alone (no street is read): the best chains of one to MAX_CHANGES + 1 rides from
/// stops within ACCESS_WIDE_M of `from` to stops within ACCESS_WIDE_M of `to`, changing at the same stop or after a
/// straight-line walk of at most TRANSFER_WIDE_M. Rounds, one per ride (schema/query-spec.md "The wide search"):
///
///   board[0][s]  = metres(from, s) / WALK_M_PER_MIN for every access stop s
///   ride round k: each route in index order, each pattern in order, walked stop by stop; at position i the best
///                 boarding so far gives arrive[k][p[i]] = best + cum[i]/BUS_M_PER_MIN + wait + (k > 0 ? CHANGE_PENALTY_MIN : 0),
///                 where best = min over earlier positions j of board[k][p[j]] - cum[j]/BUS_M_PER_MIN, and a stop is
///                 never boarded from the route that brought you to it; a label only changes when strictly better.
///   walk round:  board[k+1][u] = min over s of arrive[k][s] + metres(s, u)/WALK_M_PER_MIN, u within TRANSFER_WIDE_M
///                 of s (u = s included), s taken in index order.
///   ends:        every (k, t) with t within ACCESS_WIDE_M of `to` scores arrive[k][t] + metres(t, to)/WALK_M_PER_MIN;
///                 sorted by score, then k, then t; each traced back to its rides; one chain per sequence of routes;
///                 the first WIDE_CHAINS kept.
///
/// Straight lines and averages only: the chains are candidates, and `plan` walks each one out on the streets and
/// ranks them with everything else. Deterministic, so the trip window can name every stop a plan may change at.
/// The arithmetic is done in the TypeScript's order, so a tie breaks the same way on every client.
public func routeChains(_ net: TransitNetwork, from: LatLon, to: LatLon) -> [[ChainRide]] {
    let n = net.stops.count, K = MAX_CHANGES + 1
    var board = Array(repeating: Array(repeating: Double.infinity, count: n), count: K)
    var boardFrom = Array(repeating: Array(repeating: -1, count: n), count: K)      // stop alighted before walking here
    var boardRoute = Array(repeating: Array(repeating: -1, count: n), count: K)     // route that brought you here
    var arrive = Array(repeating: Array(repeating: Double.infinity, count: n), count: K)
    var arriveRide = Array(repeating: [ChainRide?](repeating: nil, count: n), count: K)
    for s in stopsNear(net, from, metres: ACCESS_WIDE_M) { board[0][s.stop] = s.metres / WALK_M_PER_MIN }
    for k in 0..<K {
        let pen = k > 0 ? CHANGE_PENALTY_MIN : 0
        for (ri, r) in net.routes.enumerated() {
            let wait = waitFor(r)
            for (pi, p) in r.patterns.enumerated() {
                var best = Double.infinity, bestAt = -1, cum = 0.0
                for i in 0..<p.count {
                    if i > 0 { cum += metresBetween(stopPoint(net, p[i - 1]), stopPoint(net, p[i])) }
                    let s = p[i]
                    if bestAt >= 0 {
                        let c = best + cum / BUS_M_PER_MIN + wait + pen
                        if c < arrive[k][s] { arrive[k][s] = c; arriveRide[k][s] = ChainRide(route: ri, pattern: pi, from: bestAt, to: i) }
                    }
                    if board[k][s] < Double.infinity && boardRoute[k][s] != ri {
                        let key = board[k][s] - cum / BUS_M_PER_MIN
                        if key < best { best = key; bestAt = i }
                    }
                }
            }
        }
        if k + 1 < K {
            for s in 0..<n where arrive[k][s] != Double.infinity {
                for near in stopsNear(net, stopPoint(net, s), metres: TRANSFER_WIDE_M) {
                    let u = near.stop, c = arrive[k][s] + near.metres / WALK_M_PER_MIN
                    if c < board[k + 1][u] { board[k + 1][u] = c; boardFrom[k + 1][u] = s; boardRoute[k + 1][u] = arriveRide[k][s]!.route }
                }
            }
        }
    }
    var ends: [(score: Double, k: Int, t: Int)] = []
    for near in stopsNear(net, to, metres: ACCESS_WIDE_M) {
        for k in 0..<K where arrive[k][near.stop] < Double.infinity {
            ends.append((arrive[k][near.stop] + near.metres / WALK_M_PER_MIN, k, near.stop))
        }
    }
    ends.sort { a, b in a.score != b.score ? a.score < b.score : a.k != b.k ? a.k < b.k : a.t < b.t }
    var out: [[ChainRide]] = [], seen = Set<String>()
    for end in ends {
        var chain: [ChainRide] = []
        var stop = end.t
        for j in stride(from: end.k, through: 0, by: -1) {
            let ride = arriveRide[j][stop]!
            chain.insert(ride, at: 0)
            if j > 0 { stop = boardFrom[j][net.routes[ride.route].patterns[ride.pattern][ride.from]] }
        }
        let key = chain.map { net.routes[$0.route].id }.joined(separator: ">")
        if seen.contains(key) { continue }
        seen.insert(key); out.append(chain)
        if out.count >= WIDE_CHAINS { break }
    }
    return out
}

/// Every stop a wide-search chain changes at: where a ride ends and where the next one starts. Sorted, once each.
public func chainChangeStops(_ net: TransitNetwork, _ chains: [[ChainRide]]) -> [Int] {
    var out = Set<Int>()
    for chain in chains {
        for (i, c) in chain.enumerated() {
            let p = net.routes[c.route].patterns[c.pattern]
            if i > 0 { out.insert(p[c.from]) }
            if i < chain.count - 1 { out.insert(p[c.to]) }
        }
    }
    return out.sorted()
}
