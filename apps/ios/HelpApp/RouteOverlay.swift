// A trip drawn on the map: the Swift half of `mapRoute` in apps/web/src/dirscreen.ts and of the route pass in
// apps/web/src/map.ts.
//
// Walking legs are solid in the walk token; rides are the agency's own colour with the ride dash; every leg has
// a casing under it, so a line is 3:1 against the land AND against the streets it crosses (WCAG 1.4.11). The leg
// a person is on is drawn thicker. Colour never carries the meaning: the numbered step list below the map says
// the same trip in words, and the map's own label is `dir.route_text`.
//
// Nothing here is written down. The trip is a value handed to a `Canvas` for one frame.
import DetroitQuery
import HelpCore
import SwiftUI

/// One leg, ready to draw: its line in map units, the palette name it wears, and whether it is a ride.
struct DrawnLeg: Equatable {
    var points: [Double]
    var token: String
    var dash: [Double]
}

/// One marker on a trip. `ring` is the inner white ring that tells a boarding or an alighting from the two ends.
struct DrawnMark: Equatable, Identifiable {
    enum Kind: String { case start, board, alight, end }
    var kind: Kind
    var x: Double
    var y: Double
    var label: String
    var sub: String
    var id: String { "\(kind.rawValue):\(x),\(y)" }
    /// Board and alight carry an inner ring, so the two places a bus is involved read differently from the two
    /// ends of the trip at a glance as well as in words.
    var innerRing: Bool { kind == .board || kind == .alight }
}

/// The whole trip on the canvas: the legs in order, the markers, the leg that is current, and the sentence that
/// is the picture's text equivalent.
struct DrawnRoute: Equatable {
    var legs: [DrawnLeg]
    var marks: [DrawnMark]
    /// The leg of the step a person is on, or -1. It is drawn thicker than the rest.
    var active: Int
    var text: String
}

/// Turn an itinerary into something a `Canvas` can paint. Pure, and the same decisions as the web's `mapRoute`.
func drawnRoute(_ it: Itinerary, destination: String, active: Int, t: @escaping Say) -> DrawnRoute {
    func flat(_ poly: [[Double]]) -> [Double] {
        var out: [Double] = []
        out.reserveCapacity(poly.count * 2)
        for p in poly where p.count >= 2 {
            let q = MapProjection.point(LatLon(lat: p[1], lon: p[0]))
            out.append(q.x); out.append(q.y)
        }
        return out
    }
    var legs: [DrawnLeg] = []
    var marks: [DrawnMark] = []
    for leg in it.legs {
        switch leg {
        case .walk(let w): legs.append(DrawnLeg(points: flat(w.polyline), token: routeWalkToken, dash: []))
        case .ride(let r): legs.append(DrawnLeg(points: flat(r.polyline), token: rideToken(agency: r.agency), dash: rideDash))
        }
    }
    func mark(_ kind: DrawnMark.Kind, _ p: [Double], _ label: String, _ sub: String) {
        guard p.count >= 2 else { return }
        let q = MapProjection.point(LatLon(lat: p[1], lon: p[0]))
        marks.append(DrawnMark(kind: kind, x: q.x, y: q.y, label: label, sub: sub))
    }
    if let first = it.legs.first, let head = polyline(first).first {
        mark(.start, head, t("dir.mark_start", [:]), "")
    }
    for leg in it.legs {
        guard case .ride(let r) = leg else { continue }
        if let a = r.polyline.first { mark(.board, a, t("dir.mark_board", [:]), r.fromStop.name) }
        if let b = r.polyline.last { mark(.alight, b, t("dir.mark_alight", [:]), r.toStop.name) }
    }
    if let last = it.legs.last, let tail = polyline(last).last {
        mark(.end, tail, t("dir.mark_end", [:]), destination)
    }
    return DrawnRoute(legs: legs, marks: marks, active: active, text: dirRouteText(t, it))
}

private func polyline(_ l: PlanLeg) -> [[Double]] {
    switch l {
    case .walk(let w): return w.polyline
    case .ride(let r): return r.polyline
    }
}

enum RoutePainter {
    /// How wide a leg is drawn at this zoom, in points. The active leg is half again as wide.
    static func width(metersPerPoint: Double, active: Bool) -> Double {
        let base = max(4, min(8, 22 / metersPerPoint))
        return active ? base * 1.5 : base
    }

    static func drawLines(_ route: DrawnRoute, cam: MapCamera, into ctx: GraphicsContext) {
        let mpp = cam.metersPerPoint
        // One casing under everything first, so the trip looks continuous where a walk becomes a ride.
        var casing = Path()
        for leg in route.legs { MapPainter.trace(leg.points, cam: cam, into: &casing, close: false) }
        ctx.stroke(casing, with: .color(MapColor.gwCase),
                   style: StrokeStyle(lineWidth: width(metersPerPoint: mpp, active: false) + 5, lineCap: .round, lineJoin: .round))
        for (i, leg) in route.legs.enumerated() {
            var path = Path()
            MapPainter.trace(leg.points, cam: cam, into: &path, close: false)
            let lw = width(metersPerPoint: mpp, active: i == route.active)
            ctx.stroke(path, with: .color(MapColor.named(leg.token)),
                       style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round, dash: leg.dash.map { $0 * lw }))
        }
    }

    /// Start, board, alight, end. All four are the same size and the same shape; board and alight carry an inner
    /// ring, and every one of them is also a sentence in the numbered step list.
    static func drawMarks(_ route: DrawnRoute, cam: MapCamera, size: CGSize, into ctx: GraphicsContext) {
        for m in route.marks {
            let x = cam.screenX(m.x), y = cam.screenY(m.y)
            if x < -14 || y < -14 || x > size.width + 14 || y > size.height + 14 { continue }
            let r = 9.0
            let circle = Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
            ctx.fill(circle, with: .color(m.kind == .start || m.kind == .end ? MapColor.routeWalk : MapColor.routeRide))
            ctx.stroke(circle, with: .color(Color.surface), lineWidth: 3)
            if m.innerRing {
                let inner = Path(ellipseIn: CGRect(x: x - 3.5, y: y - 3.5, width: 7, height: 7))
                ctx.fill(inner, with: .color(Color.surface))
            }
        }
    }
}
