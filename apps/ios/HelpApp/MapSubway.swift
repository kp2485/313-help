// The `subway` map style, painted (docs/MAP-STYLE.md). Every decision about WHAT to draw — which colour a route
// wears, how wide, which side of a shared street, where a badge goes, which of them win — is a pure function in
// HelpCore/MapStyle.swift, tested on Linux. This file turns those answers into `Path`s and nothing else.
//
// `standard` never comes here: MapPainter.draw calls into this file only for a layer whose overlay says
// `subway`, and an overlay says so only when the style is chosen AND that layer's network file is held.
//
// Nothing here is live. No arrival times, no vehicles; the lines, stops and names are files in the signed bundle.
import DetroitQuery
import HelpCore
import SwiftUI

// MARK: - what the last frame drew

/// What a finger can land on, written by the painter and read by the tap: a person taps what they see. Memory
/// only, replaced every frame, and about the map — never about a person.
final class SubwayBoard {
    var glyphs: [HitGlyph] = []
    var targets: [String: MapSelection] = [:]
    /// The lines as drawn (shifted sideways where routes share a street), per network layer.
    var lines: [(layer: String, net: TransitNet, built: [SubwayGeometry.BuiltLine])] = []
    func clear() { glyphs = []; targets = [:]; lines = [] }
}

/// Everything the subway passes need for one frame. A value, like `MapScene`.
struct SubwayInput {
    /// The networks that are on and held, by layer id ("ddot_routes").
    var nets: [String: PreparedNet] = [:]
    var netKeys: [String: String] = [:]
    var serves: [String: TransitServes] = [:]
    var hubs: [TransitHub] = []
    var layersOn: [String] = []
    var band: ZoomBand = .far
    var scheme: MapScheme = .light
    /// Increase Contrast: the spec's high-contrast palette, casing + 1, rings + 0.5, and no quietened basemap.
    var moreContrast = false
    /// Dynamic Type, held to × 1…1.5 for badges and labels.
    var textScale = 1.0
    var selected: (layer: String, index: Int)?
    /// The selected route's stops layer, held even when that layer is switched off.
    var selectedStops: MapLayerData?
    var quietBasemap = false
    var board: SubwayBoard
}

// MARK: - paths, built once per scale and kept

/// A network's lines as `Path`s in **map units**, for one zoom band at one scale bucket. A drag keeps the scale, so
/// every frame of it reuses these and only applies the camera's transform; a pinch rebuilds them a few times.
/// Main actor only (the Canvas draws synchronously), memory only.
private struct CachedNet {
    /// ONE path per route (both directions), in map units: drawn through the camera's transform, never copied.
    struct Route { var box: MapBox; var own: Path; var all: Path }
    var signature: String
    var routes: [Route]
    /// Every trunk stretch of the network: every member draws the same stroke, so it is one path, drawn once.
    var trunks: Path
    var built: [SubwayGeometry.BuiltLine]
}

private func path(_ commands: [PathCommand]) -> Path {
    var p = Path()
    for c in commands {
        switch c {
        case .move(let x, let y): p.move(to: CGPoint(x: x, y: y))
        case .line(let x, let y): p.addLine(to: CGPoint(x: x, y: y))
        case .quad(let cx, let cy, let x, let y): p.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: cx, y: cy))
        }
    }
    return p
}

enum SubwayPainter {
    private nonisolated(unsafe) static var cache: [String: CachedNet] = [:]

    private static func cached(_ layer: String, _ sub: SubwayInput, scale: Double) -> CachedNet? {
        guard let prepared = sub.nets[layer] else { return nil }
        let bucket = subwayScaleBucket(scale)
        let signature = "\(sub.netKeys[layer] ?? layer)|\(sub.band.rawValue)|\(bucket)"
        if let held = cache[layer], held.signature == signature { return held }
        let built = prepared.built(band: sub.band, scale: subwayBucketScale(bucket))
        var routes = [CachedNet.Route](repeating: .init(box: .empty, own: Path(), all: Path()), count: prepared.net.routes.count)
        var trunks = Path()
        for b in built {
            let own = path(b.ownCommands), trunk = path(b.trunkCommands)
            routes[b.route].box = routes[b.route].box.union(b.box)
            routes[b.route].own.addPath(own)
            routes[b.route].all.addPath(own); routes[b.route].all.addPath(trunk)
            trunks.addPath(trunk)
        }
        let made = CachedNet(signature: signature, routes: routes, trunks: trunks, built: built)
        cache[layer] = made
        return made
    }

    private static func token(_ t: TransitToken, _ sub: SubwayInput) -> Color {
        Color(rgb: TransitPalette.color(t, scheme: sub.scheme, increasedContrast: sub.moreContrast))
    }
    private static func resolved(_ layer: String, _ route: NetRoute?, _ sub: SubwayInput, mpp: Double) -> SubwayDrawing {
        if case .subway(let d) = resolveTransitStyle(TransitStyleInput(style: .subway, layer: layer, route: route, metersPerPoint: mpp,
                                                                      band: sub.band, scheme: sub.scheme, increasedContrast: sub.moreContrast)) { return d }
        return SubwayDrawing()
    }
    private static let round = { (w: Double) in StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round) }

    // MARK: - lines (draw order 6 to 12)

    static func drawLines(_ s: MapScene, _ sub: SubwayInput, into ctx: GraphicsContext) {
        let cam = s.camera, view = cam.visible, mpp = cam.metersPerPoint
        let toScreen = CGAffineTransform(a: cam.scale, b: 0, c: 0, d: cam.scale,
                                         tx: cam.width / 2 - cam.centerX * cam.scale, ty: cam.height / 2 - cam.centerY * cam.scale)
        sub.board.lines = []

        // 6. Bike lanes: the secondary network, under every transit line. A thin double line, never badged.
        if let bikes = s.overlays.first(where: { $0.id == "go:bike_lanes" && $0.subway }) {
            var p = Path()
            for l in bikes.data.lines where l.box.intersects(view) { MapPainter.trace(l.points, cam: cam, into: &p, close: false) }
            let d = resolved("bike_lanes", nil, sub, mpp: mpp)
            if case .double(let gap)? = d.inlay {
                // Two strokes from one path: the whole width in green, then the middle taken out again.
                ctx.drawLayer { layer in
                    layer.stroke(p, with: .color(token(.bike, sub)), style: round(d.width * 2 + gap))
                    layer.blendMode = .destinationOut
                    layer.stroke(p, with: .color(.black), style: round(gap))
                }
            } else {
                ctx.stroke(p, with: .color(token(.bike, sub)), style: round(d.width))
            }
        }

        // One `Path` per route, built once per scale and kept in map units. A frame copies nothing: the paths
        // are stroked through the camera's transform, with every width divided by the scale so that a line is
        // the same number of points wide at every zoom.
        struct RoutePath { var layer: String; var index: Int; var route: NetRoute; var own: Path; var all: Path; var draw: SubwayDrawing }
        var routes: [String: [RoutePath]] = [:]
        var trunkPaths: [Path] = []
        for layer in subwayNetworkLayers {
            guard s.overlays.contains(where: { $0.id == "go:" + layer && $0.subway }),
                  let prepared = sub.nets[layer], let held = cached(layer, sub, scale: cam.scale) else { continue }
            sub.board.lines.append((layer, prepared.net, held.built))
            if !held.trunks.isEmpty { trunkPaths.append(held.trunks) }
            routes[layer] = prepared.net.routes.enumerated().compactMap { i, r in
                held.routes[i].box.intersects(view) ? RoutePath(layer: layer, index: i, route: r, own: held.routes[i].own,
                                                                all: held.routes[i].all, draw: resolved(layer, r, sub, mpp: mpp)) : nil
            }
        }
        if routes.isEmpty { return }
        let k = cam.scale
        func mapRound(_ w: Double) -> StrokeStyle { round(w / k) }

        let fill = token(.fill, sub)
        func chevrons(_ layer: String, every: Double, arm: Double, width: Double, into g: GraphicsContext) {
            guard let held = cache[layer] else { return }
            var marks = Path()
            for b in held.built {
                for poly in b.own {
                    var screen = [Double](); screen.reserveCapacity(poly.count)
                    var i = 0
                    while i + 1 < poly.count { screen.append(cam.screenX(poly[i])); screen.append(cam.screenY(poly[i + 1])); i += 2 }
                    for m in SubwayGeometry.marksAlong(screen, every: every)
                    where m.x > -20 && m.y > -20 && m.x < cam.width + 20 && m.y < cam.height + 20 {
                        // "›": two strokes from the tip, back at ±35° to the way the loop runs.
                        let half = arm * cos(35 * Double.pi / 180) / 2
                        let tip = CGPoint(x: m.x + cos(m.angle) * half, y: m.y + sin(m.angle) * half)
                        for side in [35.0, -35.0] {
                            let a = m.angle + .pi + side * .pi / 180
                            marks.move(to: tip)
                            marks.addLine(to: CGPoint(x: tip.x + cos(a) * arm, y: tip.y + sin(a) * arm))
                        }
                    }
                }
            }
            g.stroke(marks, with: .color(fill), style: round(width))
        }
        /// `m` draws through the camera (map units); `g` is the same context in screen points, for the chevrons.
        func inlay(_ r: RoutePath, _ p: Path, map m: GraphicsContext, screen g: GraphicsContext) {
            switch r.draw.inlay {
            case .stripe(let w)?: m.stroke(p, with: .color(fill), style: mapRound(w))
            case .ties(let w, let dash)?:
                m.stroke(p, with: .color(fill), style: StrokeStyle(lineWidth: w / k, lineCap: .butt, lineJoin: .round, dash: dash.map { CGFloat($0 / k) }))
            case .chevrons(let every, let arm, let w)?: chevrons(r.layer, every: every, arm: arm, width: w, into: g)
            default: break
            }
        }

        func everything(_ g: GraphicsContext) {
            var m = g
            m.concatenate(toScreen)
            // 7, 8. SMART under DDOT. The casing pass for the whole network first, then each route in its tone —
            // local before frequent, and the lowest route number last so it is on top where lines meet.
            for layer in ["smart_routes", "ddot_routes"] {
                guard let list = routes[layer] else { continue }
                for frequent in [false, true] {
                    for r in list where r.route.frequent == frequent { m.stroke(r.own, with: .color(fill), style: mapRound(r.draw.casingWidth)) }
                }
                for frequent in [false, true] {
                    for r in list.reversed() where r.route.frequent == frequent {
                        m.stroke(r.own, with: .color(token(r.draw.stroke ?? .tr5, sub)), style: mapRound(r.draw.width))
                    }
                }
                for r in list { if case .stripe(let w)? = r.draw.inlay { m.stroke(r.own, with: .color(fill), style: mapRound(w)) } }
            }
            // 9. Trunks: every member draws the same stroke, so it is drawn once per network.
            let w = subwayLineWidth(.trunk, band: sub.band)
            for t in trunkPaths { m.stroke(t, with: .color(fill), style: mapRound(w + subwayCasing(band: sub.band, increasedContrast: sub.moreContrast))) }
            for t in trunkPaths { m.stroke(t, with: .color(token(.trunk, sub)), style: mapRound(w)) }
            // 10, 11. QLINE: casing, line, ties. People Mover: casing, line, chevrons.
            for layer in ["qline", "people_mover"] {
                for r in routes[layer] ?? [] {
                    m.stroke(r.all, with: .color(fill), style: mapRound(r.draw.casingWidth))
                    m.stroke(r.all, with: .color(token(r.draw.stroke ?? .rail, sub)), style: mapRound(r.draw.width))
                    inlay(r, r.all, map: m, screen: g)
                }
            }
        }

        // 12. A selected route: everything else at 35 % (as ONE layer, so overlaps do not add up), then the route
        // itself last — a dark under-stroke, its casing, and the line a point and a half wider, shape kept.
        // Reduce Transparency: nothing is faded; the under-stroke and the width still mark the route.
        let chosen = sub.selected.flatMap { sel in routes[sel.layer]?.first { $0.index == sel.index } }
        if chosen != nil, !s.plainColors {
            ctx.drawLayer { layer in layer.opacity = 0.35; everything(layer) }
        } else {
            everything(ctx)
        }
        if let r = chosen {
            var m = ctx
            m.concatenate(toScreen)
            m.stroke(r.all, with: .color(token(.ring, sub)), style: mapRound(r.draw.casingWidth + 1.5 + 3))
            m.stroke(r.all, with: .color(fill), style: mapRound(r.draw.casingWidth + 1.5))
            m.stroke(r.all, with: .color(token(r.draw.stroke ?? .tr5, sub)), style: mapRound(r.draw.width + 1.5))
            inlay(r, r.all, map: m, screen: ctx)
        }
    }

    // MARK: - stations, pills, terminals, markers and badges (draw order 15 to 18, and 20)

    struct Plan {
        struct Dot { var x: Double, y: Double, r: Double, ring: Double, dim: Bool }
        struct Pill { var ax: Double, ay: Double, bx: Double, by: Double, height: Double, ring: Double, dim: Bool }
        struct End { var x: Double, y: Double, r: Double, tone: TransitToken, dim: Bool }
        struct Mark { var x: Double, y: Double, marker: TransitMarker, tone: TransitToken }
        struct Badge { var rect: LabelRect, text: String, fill: TransitToken, fontSize: Double, dim: Bool }
        struct Name { var text: String, x: Double, y: Double, clear: Double, selected: Bool }
        var dots: [Dot] = [], pills: [Pill] = [], ends: [End] = [], marks: [Mark] = [], badges: [Badge] = [], names: [Name] = []
        /// What street and park names must keep clear of: badges, pills and terminals outrank them.
        var occupied: [LabelRect] = []
    }

    private nonisolated(unsafe) static var widths: [String: Double] = [:]
    private static func textWidth(_ s: String, size: Double, ctx: GraphicsContext) -> Double {
        let k = "\(Int(size * 10)):\(s)"
        if let w = widths[k] { return w }
        let w = ctx.resolve(Text(s).font(.system(size: size, weight: .bold)).monospacedDigit()).measure(in: CGSize(width: 400, height: 60)).width
        if widths.count > 2000 { widths.removeAll() }
        widths[k] = w
        return w
    }

    /// Works out what is drawn this frame and where, and writes the tap targets to the board. Done before the
    /// street names are placed, because badges, pills and terminals outrank them.
    static func plan(_ s: MapScene, _ sub: SubwayInput, ctx: GraphicsContext) -> Plan {
        var plan = Plan()
        let cam = s.camera, mpp = cam.metersPerPoint, w = cam.width, h = cam.height
        let board = sub.board
        board.glyphs = []; board.targets = [:]
        let stations = stationsFor(band: sub.band, metersPerPoint: mpp, hasSelection: sub.selected != nil)
        let scale = sub.textScale
        func on(_ x: Double, _ y: Double, _ pad: Double = 12) -> Bool { x > -pad && y > -pad && x < w + pad && y < h + pad }
        func centre(_ x: Double, _ y: Double) -> Double { hypot(x - w / 2, y - h / 2) }
        func target(_ id: String, _ kind: HitGlyph.Kind, _ x: Double, _ y: Double, _ sel: MapSelection) {
            board.glyphs.append(HitGlyph(id: id, kind: kind, x: x, y: y)); board.targets[id] = sel
        }
        func subwayOn(_ layer: String) -> Bool { s.overlays.contains { $0.id == "go:" + layer && $0.subway } }
        let selectedNet = sub.selected.flatMap { sub.nets[$0.layer]?.net }
        let selectedStopSet: Set<Int> = sub.selected.flatMap { sel in selectedNet.map { Set($0.routes[sel.index].stops.flatMap { $0 }) } } ?? []

        // 15. Stops. Near only, 400 at most (nearest the middle first; the list carries the rest).
        for layer in ["smart_stops", "ddot_stops"] {
            let overlay = s.overlays.first { $0.id == "go:" + layer && $0.subway }
            let isSelectedNet = selectedNet?.stopsLayer == layer
            guard let data = overlay?.data ?? (isSelectedNet ? sub.selectedStops : nil) else { continue }
            let d = resolved(layer, nil, sub, mpp: mpp)
            guard case .station(let r0, let ring0)? = d.marker else { continue }
            let showAll = overlay != nil && stations.stops
            var found: [(i: Int, x: Double, y: Double, mine: Bool)] = []
            for (i, p) in data.points.enumerated() {
                let mine = isSelectedNet && selectedStopSet.contains(i)
                guard showAll || (mine && stations.selectedStops) else { continue }
                let x = cam.screenX(p.x), y = cam.screenY(p.y)
                if on(x, y) { found.append((i, x, y, mine)) }
            }
            if found.count > 400 { found.sort { centre($0.x, $0.y) < centre($1.x, $1.y) }; found = Array(found.prefix(400)) }
            for f in found {
                plan.dots.append(.init(x: f.x, y: f.y, r: f.mine ? 4.5 : r0, ring: f.mine ? ring0 + 0.5 : ring0,
                                       dim: sub.selected != nil && !f.mine))
                target("stop:\(layer):\(f.i)", f.mine ? .selected : .stop, f.x, f.y, .station(layer: layer, index: f.i))
            }
        }
        // Rail stations, from mid.
        for layer in ["qline", "people_mover"] where stations.railStations {
            guard let o = s.overlays.first(where: { $0.id == "go:" + layer && $0.subway }) else { continue }
            let d = resolved(layer, nil, sub, mpp: mpp)
            guard case .station(let r, let ring)? = d.marker else { continue }
            let dim = sub.selected != nil && sub.selected?.layer != layer
            for (i, p) in o.data.points.enumerated() {
                let x = cam.screenX(p.x), y = cam.screenY(p.y)
                guard on(x, y) else { continue }
                plan.dots.append(.init(x: x, y: y, r: r, ring: ring, dim: dim))
                target("stop:\(layer):\(i)", .stop, x, y, .station(layer: layer, index: i))
                if stations.railStationNames { plan.names.append(.init(text: p.name, x: x, y: y, clear: r + 3, selected: false)) }
            }
        }

        // 16. Interchanges (120 at most), terminals, hubs.
        for layer in ["smart_routes", "ddot_routes"] where stations.interchangeMinRoutes > 0 && subwayOn(layer) {
            guard let net = sub.nets[layer]?.net else { continue }
            var found: [(i: Int, x: Double, y: Double)] = []
            for (i, c) in net.interchanges.enumerated() where c.routes.count >= stations.interchangeMinRoutes {
                let x = cam.screenX(c.x), y = cam.screenY(c.y)
                if on(x, y) { found.append((i, x, y)) }
            }
            if found.count > 120 { found.sort { centre($0.x, $0.y) < centre($1.x, $1.y) }; found = Array(found.prefix(120)) }
            for f in found {
                let c = net.interchanges[f.i]
                let dim = sub.selected.map { $0.layer != layer || !c.routes.contains($0.index) } ?? false
                plan.pills.append(.init(ax: cam.screenX(c.ax), ay: cam.screenY(c.ay), bx: cam.screenX(c.bx), by: cam.screenY(c.by),
                                        height: sub.band == .near ? 11 : 9, ring: sub.moreContrast ? 2.5 : 2, dim: dim))
                target("change:\(layer):\(f.i)", .interchange, f.x, f.y, .interchange(layer: layer, index: f.i))
            }
        }
        var candidates: [BadgeCandidate] = []
        var badgeStyle: [String: (TransitToken, Double, Bool)] = [:]
        var terminalSpots: [(x: Double, y: Double)] = []
        func candidate(_ id: String, _ text: String, fill: TransitToken, rank: BadgeCandidate.Rank, order: Int,
                       x: Double, y: Double, height: Double, font: Double, dim: Bool, leftOf: Bool = false) {
            let hgt = height * scale, width = badgeWidth(textWidth: textWidth(text, size: font * scale, ctx: ctx), height: hgt, padding: 5 * scale)
            let cx = leftOf ? x + width / 2 : x
            candidates.append(BadgeCandidate(id: id, text: text, rank: rank, order: order,
                                             rect: LabelRect(x: cx, y: y, width: width, height: hgt), distanceToCentre: centre(x, y)))
            badgeStyle[id] = (fill, font * scale, dim)
        }
        for (li, layer) in subwayNetworkLayers.enumerated() where subwayOn(layer) {   // `li` numbers the trunk badges only
            guard let prepared = sub.nets[layer] else { continue }
            let net = prepared.net
            for (ri, route) in net.routes.enumerated() {
                let d = resolved(layer, route, sub, mpp: mpp)
                let isSelected = sub.selected?.layer == layer && sub.selected?.index == ri
                let dim = sub.selected != nil && !isSelected
                guard let badge = d.badge, d.badgeShown || isSelected else { continue }
                let rail = layer == "qline" || layer == "people_mover"
                let rank: BadgeCandidate.Rank = isSelected ? .selected : rail ? .rail : route.frequent ? .frequent : .other
                let order = riderOrder(short: route.short, system: net.system, index: ri)
                if stations.terminals {
                    for (ei, e) in route.ends.enumerated() {
                        let x = cam.screenX(e.x), y = cam.screenY(e.y)
                        guard on(x, y) else { continue }
                        let r = sub.band == .near ? 7.5 : 6.0
                        plan.ends.append(.init(x: x, y: y, r: r, tone: d.stroke ?? .tr5, dim: dim))
                        terminalSpots.append((x, y))
                        target("end:\(route.id):\(ei)", isSelected ? .selected : .terminal, x, y, .line(layer: layer, route: route.id))
                        // Each terminal carries its route's badge beside it, and at near the stop's name.
                        candidate("endbadge:\(route.id):\(ei)", badge.text, fill: badge.fill, rank: rank, order: order,
                                  x: x + r + 4, y: y, height: badge.height, font: badge.fontSize, dim: dim, leftOf: true)
                        if stations.terminalNames, !e.name.isEmpty {
                            plan.names.append(.init(text: e.name, x: x, y: y + r + 9 * scale, clear: 0, selected: isSelected))
                        }
                    }
                }
                let step = subwayStep(band: sub.band)
                for (ai, a) in (prepared.anchors[sub.band]?[ri] ?? []).enumerated() {
                    // On the shifted line, not the centre of the street.
                    let shift = Double(a.off) * step / 2
                    let x = cam.screenX(a.x) + a.leftX * shift, y = cam.screenY(a.y) + a.leftY * shift
                    guard on(x, y, 0), !terminalSpots.contains(where: { hypot($0.x - x, $0.y - y) < 24 }) else { continue }
                    candidate("badge:\(route.id):\(ai)", badge.text, fill: badge.fill, rank: rank, order: order,
                              x: x, y: y, height: badge.height, font: badge.fontSize, dim: dim)
                    board.targets["badge:\(route.id):\(ai)"] = .line(layer: layer, route: route.id)
                }
                for (ei, _) in route.ends.enumerated() { board.targets["endbadge:\(route.id):\(ei)"] = .line(layer: layer, route: route.id) }
            }
            // A trunk's one stacked badge, at each anchor the pipeline chose.
            for (ti, t) in net.trunks.enumerated() {
                let x = cam.screenX(t.x), y = cam.screenY(t.y)
                guard on(x, y, 0) else { continue }
                let id = "trunk:\(layer):\(ti)"
                candidate(id, trunkBadgeText(t.routes.map { net.routes[$0].short }), fill: .trunk, rank: .trunk, order: -(li * 1000 + ti) - 1,
                          x: x, y: y, height: sub.band == .near ? 18 : 16, font: sub.band == .near ? 12 : 11, dim: sub.selected != nil)
                board.targets[id] = .trunk(layer: layer, routes: t.routes.map { net.routes[$0].id })
            }
        }
        for hub in sub.hubs where hub.shows(layersOn: sub.layersOn) {
            let x = cam.screenX(hub.x), y = cam.screenY(hub.y)
            guard on(x, y) else { continue }
            let hgt = sub.band == .near ? 14.0 : 12.0
            plan.pills.append(.init(ax: cam.screenX(hub.ax), ay: cam.screenY(hub.ay), bx: cam.screenX(hub.bx), by: cam.screenY(hub.by),
                                    height: hgt, ring: sub.moreContrast ? 3 : 2.5, dim: false))
            target(hub.id, .hub, x, y, .hub(hub.name))
            plan.names.insert(.init(text: hub.name, x: x, y: y, clear: hgt / 2 + 4, selected: false), at: 0)
        }

        // 17. Point markers: MoGo, park and ride, coaches, Amtrak. From mid.
        for (layer, named) in [("mogo", false), ("park_ride", false), ("intercity_bus", false), ("stations", true)] where stations.markers {
            guard let o = s.overlays.first(where: { $0.id == "go:" + layer && $0.subway }) else { continue }
            let d = resolved(layer, nil, sub, mpp: mpp)
            guard let marker = d.marker else { continue }
            for (i, p) in o.data.points.enumerated() {
                let x = cam.screenX(p.x), y = cam.screenY(p.y)
                guard on(x, y) else { continue }
                plan.marks.append(.init(x: x, y: y, marker: marker, tone: d.stroke ?? .rail))
                target("mark:\(layer):\(i)", .marker, x, y, .stop(name: p.name, layer: o.label))
                if named { plan.names.append(.init(text: p.name, x: x, y: y, clear: 10, selected: false)) }
            }
        }

        // 18. Badges: 24 a frame, in the order of claim, never on a terminal, a hub or an interchange.
        var taken: [LabelRect] = plan.ends.map { LabelRect(x: $0.x, y: $0.y, width: $0.r * 2 + 3, height: $0.r * 2 + 3) }
        taken += plan.pills.map {
            LabelRect(x: ($0.ax + $0.bx) / 2, y: ($0.ay + $0.by) / 2, width: abs($0.ax - $0.bx) + $0.height, height: abs($0.ay - $0.by) + $0.height)
        }
        for c in claimBadges(candidates, taken: taken) {
            guard let style = badgeStyle[c.id] else { continue }
            plan.badges.append(.init(rect: c.rect, text: c.text, fill: style.0, fontSize: style.1, dim: style.2))
            board.glyphs.append(HitGlyph(id: c.id, kind: c.rank == .selected ? .selected : .badge, x: c.rect.x, y: c.rect.y))
        }
        let drawnIds = Set(board.glyphs.map(\.id))
        board.targets = board.targets.filter { drawnIds.contains($0.key) }
        plan.occupied = taken + plan.badges.map(\.rect)
        return plan
    }

    static func drawGlyphs(_ plan: Plan, _ s: MapScene, _ sub: SubwayInput, into ctx: GraphicsContext) {
        let fill = token(.fill, sub), ring = token(.ring, sub)
        let fade = s.plainColors ? 1 : 0.35

        // 15. Stops: a white circle with a dark ring. One path for the plain ones, one for the dimmed.
        for dim in [true, false] {
            let list = plan.dots.filter { $0.dim == dim }
            if list.isEmpty { continue }
            var byRing: [Double: Path] = [:]
            for d in list { byRing[d.ring, default: Path()].addEllipse(in: CGRect(x: d.x - d.r, y: d.y - d.r, width: d.r * 2, height: d.r * 2)) }
            for (w, p) in byRing {
                ctx.fill(p, with: .color(fill.opacity(dim ? fade : 1)))
                ctx.stroke(p, with: .color(ring.opacity(dim ? fade : 1)), lineWidth: w)
            }
        }
        // 16. Pills: a stadium round the two stops furthest apart; a circle when they are closer than it is tall.
        for p in plan.pills {
            var line = Path()
            line.move(to: CGPoint(x: p.ax, y: p.ay)); line.addLine(to: CGPoint(x: p.bx, y: p.by))
            if p.ax == p.bx, p.ay == p.by { line.addLine(to: CGPoint(x: p.bx + 0.01, y: p.by)) }
            let a = p.dim ? fade : 1
            ctx.stroke(line, with: .color(ring.opacity(a)), style: round(p.height))
            ctx.stroke(line, with: .color(fill.opacity(a)), style: round(p.height - p.ring * 2))
        }
        for e in plan.ends {
            let c = Path(ellipseIn: CGRect(x: e.x - e.r, y: e.y - e.r, width: e.r * 2, height: e.r * 2))
            let a = e.dim ? fade : 1
            ctx.fill(c, with: .color(fill.opacity(a)))
            ctx.stroke(c, with: .color(token(e.tone, sub).opacity(a)), lineWidth: 3)
        }
        // 17. Markers. Each kind has a shape of its own, so none of them is told apart by colour.
        for m in plan.marks {
            let tone = token(m.tone, sub)
            switch m.marker {
            case .dock(let size, let corner, let ringW, let dot):
                let sq = Path(roundedRect: CGRect(x: m.x - size / 2, y: m.y - size / 2, width: size, height: size), cornerRadius: corner)
                ctx.fill(sq, with: .color(tone)); ctx.stroke(sq, with: .color(fill), lineWidth: ringW)
                ctx.fill(Path(ellipseIn: CGRect(x: m.x - dot, y: m.y - dot, width: dot * 2, height: dot * 2)), with: .color(fill))
            case .railStation(let size, let corner, let ringW, let bw, let bh):
                let sq = Path(roundedRect: CGRect(x: m.x - size / 2, y: m.y - size / 2, width: size, height: size), cornerRadius: corner)
                ctx.fill(sq, with: .color(fill)); ctx.stroke(sq, with: .color(tone), lineWidth: ringW)
                ctx.fill(Path(CGRect(x: m.x - bw / 2, y: m.y - bh / 2, width: bw, height: bh)), with: .color(tone))
            case .coach(let across, let ringW, let dash):
                var d = Path()
                d.move(to: CGPoint(x: m.x, y: m.y - across / 2)); d.addLine(to: CGPoint(x: m.x + across / 2, y: m.y))
                d.addLine(to: CGPoint(x: m.x, y: m.y + across / 2)); d.addLine(to: CGPoint(x: m.x - across / 2, y: m.y)); d.closeSubpath()
                ctx.fill(d, with: .color(fill))
                ctx.stroke(d, with: .color(tone), style: StrokeStyle(lineWidth: ringW, lineJoin: .round, dash: dash.map { CGFloat($0) }))
            case .parking(let size, let corner, let letter):
                let sq = Path(roundedRect: CGRect(x: m.x - size / 2, y: m.y - size / 2, width: size, height: size), cornerRadius: corner)
                ctx.fill(sq, with: .color(tone))
                ctx.draw(Text("P").font(.system(size: letter, weight: .heavy)).foregroundStyle(fill), at: CGPoint(x: m.x, y: m.y), anchor: .center)
            case .station(let r, let ringW):
                let c = Path(ellipseIn: CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2))
                ctx.fill(c, with: .color(fill)); ctx.stroke(c, with: .color(ring), lineWidth: ringW)
            }
        }
        // 18. Badges: always horizontal, so nothing is ever upside down; Latin route names, left to right in
        // every language (the canvas never mirrors).
        let words = Color(rgb: TransitPalette.badgeText(scheme: sub.scheme))
        for b in plan.badges {
            let a = b.dim ? fade : 1
            let box = Path(roundedRect: CGRect(x: b.rect.x - b.rect.width / 2, y: b.rect.y - b.rect.height / 2,
                                               width: b.rect.width, height: b.rect.height), cornerRadius: 5 * sub.textScale)
            ctx.fill(box, with: .color(token(b.fill, sub).opacity(a)))
            ctx.stroke(box, with: .color(fill.opacity(a)), lineWidth: 1.5)
            ctx.draw(Text(b.text).font(.system(size: b.fontSize, weight: .bold)).monospacedDigit().foregroundStyle(words.opacity(a)),
                     at: CGPoint(x: b.rect.x, y: b.rect.y), anchor: .center)
        }
    }

    /// 20. Names of hubs, terminals and stations: twelve at most, right of the glyph, then left, above, below —
    /// the first that is free. One that does not fit is dropped, never shrunk or overlapped.
    static func drawNames(_ plan: Plan, _ s: MapScene, _ sub: SubwayInput, into ctx: GraphicsContext) {
        var placed = plan.occupied
        var drawn = 0
        var said = Set<String>()                  // a station's two platforms carry one name between them
        let ink = sub.quietBasemap ? Color(rgb: QuietBasemap.tokens(sub.scheme).ink) : MapColor.ink
        for n in plan.names.sorted(by: { $0.selected && !$1.selected }) where drawn < 12 && !n.text.isEmpty && !said.contains(n.text) {
            let size = (n.selected ? 13.0 : 12.0) * sub.textScale
            let text = Text(n.text).font(.system(size: size, weight: .semibold))
            let resolved = ctx.resolve(text)
            let tw = resolved.measure(in: CGSize(width: 300, height: 60)).width, th = size + 4
            let spots: [(Double, Double)] = n.clear == 0
                ? [(n.x, n.y)]
                : [(n.x + n.clear + tw / 2, n.y), (n.x - n.clear - tw / 2, n.y), (n.x, n.y - n.clear - th / 2), (n.x, n.y + n.clear + th / 2)]
            guard let spot = spots.first(where: { sp in
                let r = LabelRect(x: sp.0, y: sp.1, width: tw, height: th)
                return sp.0 - tw / 2 > 4 && sp.0 + tw / 2 < s.camera.width - 4 && !placed.contains { $0.overlaps(r) }
            }) else { continue }
            placed.append(LabelRect(x: spot.0, y: spot.1, width: tw, height: th))
            MapPainter.drawLabel(resolved, at: CGPoint(x: spot.0, y: spot.1), angle: 0, ink: ink, halo: MapColor.land, ctx: ctx)
            drawn += 1
            said.insert(n.text)
        }
    }
}

// MARK: - tapping

extension MapModel {
    /// A tap in the subway style: first the thing under a 44 × 44 point box, in the label priority of the spec — a
    /// second tap in the same place moves on to the next thing under the finger — then the nearest route line
    /// within 22 points. On a trunk, the card lists the routes that share the street.
    func pickSubwayGlyph(at p: CGPoint) -> MapSelection? {
        let previous = lastSubwayTap.flatMap { hypot($0.at.x - p.x, $0.at.y - p.y) < 12 ? $0.hit : nil }
        if let hit = subwayHitTest(x: p.x, y: p.y, glyphs: board.glyphs, previous: previous), let target = board.targets[hit.id] {
            lastSubwayTap = (p, hit.id)
            return target
        }
        lastSubwayTap = nil
        return nil
    }

    func pickSubwayLine(at p: CGPoint) -> MapSelection? {
        let x = camera.mapX(p.x), y = camera.mapY(p.y), limit = camera.mapDistance(points: 22)
        let reach = MapBox(minX: x - limit, minY: y - limit, maxX: x + limit, maxY: y + limit)
        var best: (d: Double, hit: MapSelection)?
        for entry in board.lines {
            var trunkRoutes: [Int] = []
            var trunkDistance = Double.infinity
            for b in entry.built where b.box.intersects(reach) {
                for poly in b.own {
                    let d = MapHit.distanceToPolyline(x, y, poly)
                    if d < limit, best == nil || d < best!.d { best = (d, .line(layer: entry.layer, route: entry.net.routes[b.route].id)) }
                }
                for poly in b.trunk {
                    let d = MapHit.distanceToPolyline(x, y, poly)
                    if d < limit { trunkRoutes.append(b.route); trunkDistance = min(trunkDistance, d) }
                }
            }
            let members = Array(Set(trunkRoutes)).sorted()
            if members.count > 1, best == nil || trunkDistance <= best!.d {
                best = (trunkDistance, .trunk(layer: entry.layer, routes: members.map { entry.net.routes[$0].id }))
            }
        }
        return best?.hit
    }
}
