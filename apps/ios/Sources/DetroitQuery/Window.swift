// Which streets a trip walks on (Kyle, 2026-09-24: the area widened to every city and township a DDOT or SMART
// bus stops in). Spec: schema/query-spec.md "The trip window". A port of packages/query/src/window.ts, case for
// case, held to schema/fixtures/16-trip-window.json by FixtureTests.
//
// The street map is seven times the size it was, and a phone must not build a graph of three counties of streets
// to plan a walk to the corner. A plan only ever WALKS in a few places: from where it starts to a stop, from a stop
// to where it ends, between two stops at a change, or the whole way when the two ends are close. Every one of those
// places is known from the two ends and the bus network alone, before a single street is read. So:
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
import Foundation

/// Padding round each end of a trip. An access walk is at most ACCESS_M in a straight line; streets wander.
public let END_PAD_M = ACCESS_M + 800
/// Padding round a stop where a change may need a walk (at most TRANSFER_WALK_M in a straight line).
public let TRANSFER_PAD_M = TRANSFER_WALK_M + 800
/// Padding round the box between the two ends, when they are close enough to walk.
public let WALK_PAD_M = 800.0

/// A box in degrees.
public struct GeoBox: Equatable, Sendable {
    public var lonMin: Double, latMin: Double, lonMax: Double, latMax: Double
    public init(lonMin: Double, latMin: Double, lonMax: Double, latMax: Double) {
        self.lonMin = lonMin; self.latMin = latMin; self.lonMax = lonMax; self.latMax = latMax
    }
    func touches(_ b: GeoBox) -> Bool { lonMin <= b.lonMax && lonMax >= b.lonMin && latMin <= b.latMax && latMax >= b.latMin }
}

/// A point padded by `metres` on every side.
public func boxAround(_ pt: LatLon, _ metres: Double) -> GeoBox {
    let dLat = metres / M_PER_DEG_LAT, dLon = metres / M_PER_DEG_LON
    return GeoBox(lonMin: pt.lon - dLon, latMin: pt.lat - dLat, lonMax: pt.lon + dLon, latMax: pt.lat + dLat)
}

/// The stops where a plan with one change may have to WALK between two stops: `x` on a route boarded near the start
/// and `y` within TRANSFER_WALK_M of it on a route that reaches a stop near the end. The same loops as `plan`'s
/// step 2, without the cap on candidates, so the answer is a superset of every change `plan` can make.
public func transferStops(_ net: TransitNetwork, from: LatLon, to: LatLon, access: Double = ACCESS_M) -> [Int] {
    let originStops = stopsNear(net, from, metres: access).prefix(MAX_ACCESS_STOPS)
    let destStops = stopsNear(net, to, metres: access).prefix(MAX_ACCESS_STOPS)
    if originStops.isEmpty || destStops.isEmpty { return [] }
    var destAt: [Int: [(pattern: Int, at: Int)]] = [:]
    for d in destStops { for e in net.posOf[d.stop] ?? [] { destAt[e.route, default: []].append((e.pattern, e.at)) } }
    var out = Set<Int>()
    for o in originStops {
        for b in net.posOf[o.stop] ?? [] {
            if destAt[b.route] != nil { continue }                              // a direct ride; no change
            let p1 = net.routes[b.route].patterns[b.pattern]
            var at = b.at + 1
            while at < p1.count {
                let x = p1[at]
                let sx = net.stops[x]
                for near in stopsNear(net, LatLon(lat: sx.lat, lon: sx.lon), metres: TRANSFER_WALK_M) {
                    let y = near.stop
                    if x == y { continue }                                      // a change at the same stop: no walk
                    let reaches = (net.posOf[y] ?? []).contains { e in
                        e.route != b.route && (destAt[e.route] ?? []).contains { $0.pattern == e.pattern && $0.at > e.at }
                    }
                    if reaches { out.insert(x); out.insert(y) }
                }
                at += 1
            }
        }
    }
    return out.sorted()
}

public struct TripWindow: Sendable {
    /// Where the plan may walk: both ends, the walk between them if it is short enough, and each change.
    public var boxes: [GeoBox]
    public init(boxes: [GeoBox]) { self.boxes = boxes }
}

/// Where a plan from `from` to `to` may walk. `net` may be nil (walking only).
public func tripWindow(_ net: TransitNetwork?, from: LatLon, to: LatLon,
                       accessMetres: Double = ACCESS_M, maxWalkOnlyMetres: Double = MAX_WALK_ONLY_M) -> TripWindow {
    var boxes = [boxAround(from, END_PAD_M), boxAround(to, END_PAD_M)]
    if metresBetween(from, to) <= maxWalkOnlyMetres {
        let a = boxAround(from, WALK_PAD_M), b = boxAround(to, WALK_PAD_M)
        boxes.append(GeoBox(lonMin: min(a.lonMin, b.lonMin), latMin: min(a.latMin, b.latMin),
                            lonMax: max(a.lonMax, b.lonMax), latMax: max(a.latMax, b.latMax)))
    }
    if let net {
        for s in transferStops(net, from: from, to: to, access: accessMetres) {
            boxes.append(boxAround(LatLon(lat: net.stops[s].lat, lon: net.stops[s].lon), TRANSFER_PAD_M))
        }
    }
    return TripWindow(boxes: boxes)
}

/// The box of one packed line, decoded from its origin and deltas.
private func lineBox(_ enc: [Int], _ origin: [Double]) -> GeoBox {
    var x = 0, y = 0
    var x0 = Double.infinity, y0 = Double.infinity, x1 = -Double.infinity, y1 = -Double.infinity
    var i = 0
    while i + 1 < enc.count {
        if i == 0 { x = enc[0]; y = enc[1] } else { x += enc[i]; y += enc[i + 1] }
        let dx = Double(x), dy = Double(y)
        if dx < x0 { x0 = dx }; if dx > x1 { x1 = dx }; if dy < y0 { y0 = dy }; if dy > y1 { y1 = dy }
        i += 2
    }
    return GeoBox(lonMin: origin[0] + x0 / STREET_SCALE, latMin: origin[1] + y0 / STREET_SCALE,
                  lonMax: origin[0] + x1 / STREET_SCALE, latMax: origin[1] + y1 / STREET_SCALE)
}

/// One street file cut down to the streets whose own box touches one of `boxes`, in the file's own order.
public func roadsInBoxes(_ base: PackedStreets, _ boxes: [GeoBox]) -> PackedStreets {
    var keep: [Int] = []
    for (i, r) in base.roads.enumerated() {
        let b = lineBox(r.enc, base.origin)
        if boxes.contains(where: { b.touches($0) }) { keep.append(i) }
    }
    let safety = base.safety.map { s in keep.map { $0 < s.count ? s[$0] : 0 } }
    return PackedStreets(origin: base.origin, names: base.names, roads: keep.map { base.roads[$0] }, safety: safety)
}

/// The files the walking graph is built from, in the one order: the main roads that touch the window, then each cell
/// of map/streets.json — `cells` in ascending key order, exactly the list every client already builds from — each
/// cut down to its streets that touch the window. A cell left with none is dropped.
public func windowFiles(_ base: PackedStreets, _ cells: [PackedStreets], _ w: TripWindow) -> [PackedStreets] {
    var out = [roadsInBoxes(base, w.boxes)]
    for c in cells {
        let kept = roadsInBoxes(c, w.boxes)
        if !kept.roads.isEmpty { out.append(kept) }
    }
    return out
}
