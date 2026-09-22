// Painting the map onto a SwiftUI `Canvas`. A port of `draw()` in apps/web/src/map.ts, in the same order, with the
// same rules about what appears at which zoom — so the two apps draw the same city.
//
// Everything is batched **per layer**: one `Path` for all the class-3 streets, one for all the bus routes, one for
// every bus stop, and one stroke or fill each. Filling five thousand circles one at a time is what makes a cheap
// phone stutter while a finger is on the screen.
import DetroitQuery
import HelpCore
import SwiftUI

/// One switched-on transport layer, ready to draw: its shapes, how it is painted, and its name in words (for the
/// card a tap opens, because colour never carries the meaning alone).
struct MapOverlay: Identifiable, Equatable {
    var id: String
    var label: String
    var style: MapLayerStyle
    var data: MapLayerData
    /// True when this layer is drawn in the `subway` style this frame (MapSubway.swift): the style is chosen and,
    /// for a network layer, its network file is held. False is `standard`, which is every line of this file as
    /// it was before the style existed.
    var subway = false
}

/// Everything one frame needs. A value, so the painter can be handed it and nothing else.
struct MapScene {
    var camera: MapCamera
    var base: BaseMap?
    var drawParks: Bool = true
    var overlays: [MapOverlay] = []
    var segments: [DrawnSegment] = []
    /// The stretch a person is looking at: drawn bright, with the rest dimmed.
    var focus: String?
    var dots: [DrawnDot] = []
    /// City and neighbourhood outlines (`place:areas`), already narrowed to what this zoom draws.
    var areas: [AreaOutline] = []
    /// The outline a tap chose: a wash of the land colour and a solid line, so the tap can be seen. Never a fill
    /// that carries a value — docs/13's first honesty rule forbids a choropleth.
    var areaSelected = ""
    var me: LatLon?
    /// The whole trip a Directions screen is showing: the walking and riding legs, and their markers.
    var route: DrawnRoute?
    /// Reduce Transparency: no faint fills, no dimming — everything at full strength.
    var plainColors = false
    /// Nil in `standard`. In `subway`: the networks, the palette's switches and the board a tap reads.
    var subway: SubwayInput?
}

enum MapPainter {
    // MARK: - the frame

    static func draw(_ s: MapScene, into ctx: GraphicsContext, size: CGSize) {
        let cam = s.camera
        let w = size.width, h = size.height
        let mpp = cam.metersPerPoint
        let view = cam.visible

        // The ground. Outside the four cities is a TEXTURE, not a shade: two pale fills a step apart (1.20:1) were
        // not a difference anyone could see, so the area is sparse diagonal hatching whose own lines clear 3:1
        // against both fills (as the web; DECISIONS 2026-09-20). The city edge is a drawn line as well.
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(s.base == nil ? MapColor.land : MapColor.outside))

        var labels: [(name: String, points: [Double], cls: Int)] = []
        // The quietened basemap: `subway` only, a network layer on, and never with Increase Contrast. Otherwise
        // `quiet` is nil and every colour and width below is exactly what it always was.
        let quiet = s.subway.flatMap { $0.quietBasemap ? QuietBasemap.tokens($0.scheme) : nil }

        if let base = s.base {
            var hatch = Path()
            var hx = -h
            while hx < w + h { hatch.move(to: CGPoint(x: hx, y: 0)); hatch.addLine(to: CGPoint(x: hx + h, y: h)); hx += mapHatchSpacing }
            ctx.stroke(hatch, with: .color(MapColor.outsideInk), lineWidth: mapHatchWidth)
            var land = Path()
            for ring in base.boundary { trace(ring, cam: cam, into: &land, close: true) }
            ctx.fill(land, with: .color(MapColor.land), style: FillStyle(eoFill: true))
            ctx.stroke(land, with: .color(MapColor.main), lineWidth: mapBoundaryWidth)

            // "City parks" off means off: no green shapes, no pocket-park dots, no park names further down.
            if s.drawParks {
                var parks = Path(), pocket = Path()
                for a in base.parks where a.box.intersects(view) {
                    trace(a.points, cam: cam, into: &parks, close: true)
                    // Zoomed out, a pocket park is smaller than a point: mark it so it can still be found.
                    if a.box.width * cam.scale < 7 {
                        let x = cam.screenX(a.box.centerX), y = cam.screenY(a.box.centerY)
                        pocket.addEllipse(in: CGRect(x: x - 2, y: y - 2, width: 4, height: 4))
                    }
                }
                ctx.fill(parks, with: .color(quiet.map { Color(rgb: $0.park) } ?? MapColor.park))
                ctx.fill(pocket, with: .color((quiet.map { Color(rgb: $0.parkInk) } ?? MapColor.parkInk).opacity(s.plainColors ? 1 : 0.75)))
            }

            // Small streets appear as you zoom in; the big roads are always there to get your bearings.
            let limit = mapStreetClassLimit(metersPerPoint: mpp)
            var visible: [[MapLine]] = Array(repeating: [], count: 5)
            for r in base.roads where r.box.intersects(view) { visible[min(4, max(0, r.cls))].append(r) }
            if limit > 2 {
                for cell in base.cells where cell.box.intersects(view) {
                    for r in cell.roads where r.cls <= limit && r.box.intersects(view) {
                        visible[min(4, max(0, r.cls))].append(r)
                    }
                }
            }
            // One path per class, used twice close in: the big roads get a casing in the land colour first. It is
            // only worth the pass when the lines are wide enough for it to show, and it is what keeps a freeway
            // readable where it runs through a park. Never in the quietened basemap.
            var paths: [Path] = Array(repeating: Path(), count: 5)
            for cls in 0...4 { for r in visible[cls] { trace(r.points, cam: cam, into: &paths[cls], close: false) } }
            if mapRoadCasingShown(metersPerPoint: mpp, quiet: quiet != nil) {
                for cls in [2, 1, 0] where !visible[cls].isEmpty {
                    ctx.stroke(paths[cls], with: .color(MapColor.land),
                               style: StrokeStyle(lineWidth: mapStreetWidth(cls: cls, metersPerPoint: mpp) + mapRoadCasingExtra, lineCap: .round, lineJoin: .round))
                }
            }
            for cls in [4, 3, 2, 1, 0] {
                let list = visible[cls]
                if list.isEmpty { continue }
                let path = paths[cls]
                var color = cls == 0 ? MapColor.freeway : cls <= 2 ? MapColor.main : MapColor.road
                var width = mapStreetWidth(cls: cls, metersPerPoint: mpp)
                if let quiet {
                    color = Color(rgb: cls == 0 ? quiet.freeway : cls <= 2 ? quiet.main : quiet.road)
                    width = max(1, width * quiet.widthFactor)
                }
                ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
            // Quietened: street names drop one class, so fewer names compete with badges.
            let labelLimit = mapStreetLabelLimit(metersPerPoint: mpp) - (quiet?.labelClassDrop ?? 0)
            for cls in 0...4 where cls <= labelLimit {
                for r in visible[cls] where !r.name.isEmpty { labels.append((r.name, r.points, cls)) }
            }
        }

        // Neighbourhood and city boundaries (`place:areas`, docs/MAP-STYLE.md section 15). A dashed line and a
        // name, and — for the one that was tapped — a wash of the brand colour so the tap can be seen. **Never a
        // fill that carries a value**: docs/13 rule 1 forbids a choropleth, and a map that shades an area by a
        // number is a league table with a picture on it.
        //
        // Every outline is drawn in EVERY band (2026-09-22). Until then a neighbourhood appeared only under 14
        // metres per point, so the Map tab — which opens on the whole city — showed four city edges and none of
        // the 205 outlines a person came for. What stops 205 dotted outlines being a mesh is not hiding them: it
        // is the WEIGHT. `boundaryStyle` (HelpCore/Boundaries.swift) is the whole table, shared with the ports.
        //
        // The dash is **absolute**, not multiplied by the line width the way a transit dash is: a hairline whose
        // dash scales with it stops being dashed, and the dotted texture is what says "this is not a street". A
        // city outline is heavier than a neighbourhood's, and that is the only difference between them — never a
        // different colour, and never a fill.
        var areaLabels: [(name: String, x: Double, y: Double, d: Double)] = []
        let bs = boundaryStyle(mpp)
        for a in s.areas {
            var shape = Path()
            for ring in a.rings { trace(ring, cam: cam, into: &shape, close: true) }
            let on = a.id == s.areaSelected
            if on { ctx.fill(shape, with: .color(Color.brand.opacity(s.plainColors ? 0.16 : boundaryWashAlpha)), style: FillStyle(eoFill: true)) }
            ctx.stroke(shape, with: .color(on ? MapColor.focus : MapColor.boundary),
                       style: StrokeStyle(lineWidth: on ? boundarySelectedWidth : a.isCity ? bs.cityWidth : bs.width,
                                          lineJoin: .round, dash: on ? [] : bs.dash.map { CGFloat($0) }))
            guard bs.names, a.box.width * cam.scale > bs.nameMinPoints else { continue }
            let x = cam.screenX(a.box.centerX), y = cam.screenY(a.box.centerY)
            if x > 0, x < w, y > 0, y < h {
                areaLabels.append((a.name, x, y, hypot(x - w / 2, y - h / 2)))
            }
        }
        // Nearest the middle of the screen first, and no more than the band's cap: downtown has a dozen outlines
        // in one frame, and a name that loses the collision test below is dropped, never shrunk or overlapped.
        areaLabels.sort { $0.d < $1.d }
        if areaLabels.count > bs.nameCap { areaLabels.removeLast(areaLabels.count - bs.nameCap) }

        // The transport layers a person switched on. Drawn under the greenway and under the listing dots, so
        // switching a layer on never hides the thing this screen is about.
        for o in s.overlays where !o.data.lines.isEmpty && !o.subway {
            var path = Path()
            for l in o.data.lines where l.box.intersects(view) { trace(l.points, cam: cam, into: &path, close: false) }
            let lw = mapLayerLineWidth(o.style, metersPerPoint: mpp)
            // A casing first, exactly as the greenway has one. A route is 3:1 against the land and against a park,
            // but it crosses streets that are now 3:1 themselves, and no one colour can be 3:1 against both a
            // near-white land and a mid-grey street. The casing is what its 3:1 is measured against (1.4.11).
            ctx.stroke(path, with: .color(MapColor.gwCase), style: StrokeStyle(lineWidth: lw + mapLayerCasingExtra, lineCap: .round, lineJoin: .round))
            ctx.stroke(path, with: .color(MapColor.named(o.style.color)),
                       style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round, dash: o.style.dash.map { $0 * lw }))
        }

        // The subway style's lines (docs/MAP-STYLE.md draw order 6 to 12), still under the greenway: in both
        // styles the greenway is above every transit line, with its own colours and width.
        var plan: SubwayPainter.Plan?
        if let sub = s.subway {
            SubwayPainter.drawLines(s, sub, into: ctx)
            plan = SubwayPainter.plan(s, sub, ctx: ctx)       // before the names: badges and pills outrank them
        }

        drawGreenway(s, cam: cam, view: view, mpp: mpp, size: size, ctx: ctx)
        drawNames(labels, s, cam: cam, view: view, mpp: mpp, size: size, ctx: ctx, occupied: plan?.occupied ?? [],
                  ink: quiet.map { Color(rgb: $0.ink) }, parkInk: quiet.map { Color(rgb: $0.parkInk) },
                  parkHalo: quiet.map { Color(rgb: $0.park) }, areaLabels: areaLabels.map { ($0.name, $0.x, $0.y) })

        // Stops and stations. A dense layer waits for the zoom (thousands of bus stops are a smear, not places);
        // the list below the map shows every one of them at any zoom.
        for o in s.overlays where !o.data.points.isEmpty && !o.subway {
            let r = mapStopRadius(dense: o.style.dense, metersPerPoint: mpp)
            if r == 0 { continue }
            var path = Path()
            for q in o.data.points {
                let x = cam.screenX(q.x), y = cam.screenY(q.y)
                if x < -6 || y < -6 || x > w + 6 || y > h + 6 { continue }
                path.addEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
            }
            ctx.fill(path, with: .color(MapColor.named(o.style.color)))
            if o.style.ring { ctx.stroke(path, with: .color(Color.surface), lineWidth: max(1, r * 0.4)) }
        }

        if let sub = s.subway, let plan { SubwayPainter.drawGlyphs(plan, s, sub, into: ctx) }

        // The trip, when this map is a Directions map: the walking legs solid in the walk token, the rides in
        // the agency's own colour with the ride dash, each over a casing, and the leg a person is on drawn
        // thicker (RouteOverlay.swift).
        if let route = s.route { RoutePainter.drawLines(route, cam: cam, into: ctx) }

        // Our own listings, one colour per help group — and a white edge, so a dot is a dot on any ground.
        for d in s.dots {
            let x = cam.screenX(d.x), y = cam.screenY(d.y)
            if x < -10 || y < -10 || x > w + 10 || y > h + 10 { continue }
            let circle = Path(ellipseIn: CGRect(x: x - 7, y: y - 7, width: 14, height: 14))
            ctx.fill(circle, with: .color(MapColor.group(d.group)))
            ctx.stroke(circle, with: .color(Color.surface), lineWidth: 2.5)
        }

        if let sub = s.subway, let plan { SubwayPainter.drawNames(plan, s, sub, into: ctx) }

        if let me = s.me {
            let q = MapProjection.point(me)
            let x = cam.screenX(q.x), y = cam.screenY(q.y)
            let circle = Path(ellipseIn: CGRect(x: x - 8, y: y - 8, width: 16, height: 16))
            ctx.fill(circle, with: .color(MapColor.me))
            ctx.stroke(circle, with: .color(Color.surface), lineWidth: 3)
        }

        // Start, end, board and alight: last, so nothing is ever drawn over the four places that matter.
        if let route = s.route { RoutePainter.drawMarks(route, cam: cam, size: size, into: ctx) }
    }

    // MARK: - the greenway, drawn like a transit line

    private static func drawGreenway(_ s: MapScene, cam: MapCamera, view: MapBox, mpp: Double,
                                     size: CGSize, ctx: GraphicsContext) {
        let onScreen = s.segments.filter { $0.box.intersects(view) }
        if onScreen.isEmpty { return }
        let width = greenwayWidth(metersPerPoint: mpp)

        func path(_ g: DrawnSegment) -> Path {
            var p = Path()
            for l in g.lines { trace(l, cam: cam, into: &p, close: false) }
            return p
        }
        func stroke(_ p: Path, _ color: Color, _ lw: Double, _ dash: [Double], opacity: Double = 1) {
            ctx.stroke(p, with: .color(color.opacity(opacity)),
                       style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round, dash: dash.map { $0 * width }))
        }

        // One casing under everything, so the route looks continuous where phases change.
        var casing = Path()
        for g in onScreen { casing.addPath(path(g)) }
        stroke(casing, MapColor.gwCase, width + 4, [])

        // Then each phase, least built first, so an open stretch is never hidden under a dotted one.
        for phase in greenwayPhaseOrder {
            let style = greenwayPhaseStyle(phase)
            var p = Path()
            var dim = Path()
            for g in onScreen where g.segment.phase == phase {
                if s.focus != nil && g.id != s.focus { dim.addPath(path(g)) } else { p.addPath(path(g)) }
            }
            if !dim.isEmpty { stroke(dim, MapColor.named(style.color), width, style.dash, opacity: s.plainColors ? 1 : 0.45) }
            if !p.isEmpty { stroke(p, MapColor.named(style.color), width, style.dash) }
        }

        // The chosen stretch, drawn again with a dark halo so it stands out from the rest of the route.
        if let focus = s.focus, let g = onScreen.first(where: { $0.id == focus }) {
            let style = greenwayPhaseStyle(g.segment.phase)
            let p = path(g)
            stroke(p, MapColor.ink, width + 6, [])
            stroke(p, MapColor.gwCase, width + 3, [])
            stroke(p, MapColor.named(style.color), width, style.dash)
        }

        // Stations: where a stretch begins and ends, once they are far enough apart to be worth drawing.
        guard greenwayShowsStations(metersPerPoint: mpp) else { return }
        let r = max(3, min(6, width * 0.75))
        var seen: [CGPoint] = []
        var dots = Path()
        for g in onScreen {
            for l in g.lines where l.count >= 4 {
                for (ux, uy) in [(l[0], l[1]), (l[l.count - 2], l[l.count - 1])] {
                    let x = cam.screenX(ux), y = cam.screenY(uy)
                    if x < -10 || y < -10 || x > size.width + 10 || y > size.height + 10 { continue }
                    if seen.contains(where: { hypot($0.x - x, $0.y - y) < r * 2.5 }) { continue }
                    seen.append(CGPoint(x: x, y: y))
                    dots.addEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
                }
            }
        }
        ctx.fill(dots, with: .color(MapColor.gwCase))
        ctx.stroke(dots, with: .color(MapColor.ink), lineWidth: max(1.5, r * 0.45))
    }

    // MARK: - street and park names

    private static func drawNames(_ labels: [(name: String, points: [Double], cls: Int)], _ s: MapScene,
                                  cam: MapCamera, view: MapBox, mpp: Double, size: CGSize, ctx: GraphicsContext,
                                  occupied: [LabelRect] = [], ink: Color? = nil, parkInk: Color? = nil,
                                  parkHalo: Color? = nil,
                                  areaLabels: [(name: String, x: Double, y: Double)] = []) {
        // A name takes a row of small circles along its text, so a slanted name only blocks the space it covers.
        var taken: [(x: Double, y: Double, r: Double)] = []
        // The subway style's badges, pills and terminals are already placed and outrank a street name: each is
        // entered as a row of circles across its rectangle. Empty in `standard`.
        for o in occupied {
            let r = o.height / 2 + 2, n = max(1, Int((o.width / (2 * r)).rounded(.up)))
            for i in 0..<n { taken.append((o.x + (n == 1 ? 0 : (Double(i) / Double(n - 1) - 0.5) * (o.width - o.height)), o.y, r)) }
        }
        var named: [(n: String, x: Double, y: Double)] = []
        func room(_ x: Double, _ y: Double, _ a: Double, _ tw: Double, _ size: Double) -> Bool {
            let r = size / 2 + 3, n = max(1, Int((tw / (2 * r)).rounded(.up)))
            var mine: [(x: Double, y: Double, r: Double)] = []
            for i in 0..<n {
                let d = n == 1 ? 0 : (Double(i) / Double(n - 1) - 0.5) * (tw - size)
                mine.append((x + cos(a) * d, y + sin(a) * d, r))
            }
            if mine.contains(where: { m in taken.contains { hypot(m.x - $0.x, m.y - $0.y) < m.r + $0.r } }) { return false }
            taken.append(contentsOf: mine)
            return true
        }

        for l in labels {
            let size9 = l.cls <= 1 ? 13.0 : l.cls <= 3 ? 12.0 : 11.0
            let text = Text(l.name).font(.system(size: size9, weight: .semibold))
            // Laying a name out costs more than the geometry that decides whether it fits, and a street keeps its
            // name and its size from one frame to the next: measured once, then remembered while the tab is open.
            let tw = width(of: l.name, size: size9, text: text, ctx: ctx)
            guard var spot = labelSpot(l.points, need: tw + 14, cam: cam, size: size) else { continue }
            let resolved = ctx.resolve(text)
            if named.contains(where: { $0.n == l.name && hypot($0.x - spot.x, $0.y - spot.y) < 220 }) { continue }
            // The middle of the street may be taken by a cross street's name: slide along to find room.
            let slide = (spot.len - tw - 10) / 2, ux = cos(spot.a), uy = sin(spot.a)
            guard let at = [0, 0.5, -0.5, 1, -1].map({ $0 * slide })
                .first(where: { room(spot.x + ux * $0, spot.y + uy * $0, spot.a, tw, size9) }) else { continue }
            spot.x += ux * at; spot.y += uy * at
            named.append((l.name, spot.x, spot.y))
            drawLabel(resolved, at: CGPoint(x: spot.x, y: spot.y), angle: spot.a,
                      ink: ink ?? MapColor.ink, halo: MapColor.land, ctx: ctx)
        }

        // An area's name, over its middle. It goes through the same "is there room?" test as every other name,
        // so an outline never writes over a street name, and it is drawn before the parks so the bigger thing
        // wins (the web draws them in exactly this order).
        for a in areaLabels {
            let text = Text(a.name).font(.system(size: 13, weight: .bold))
            let tw = width(of: "area:" + a.name, size: 13, text: text, ctx: ctx)
            guard room(a.x, a.y, 0, tw, 13) else { continue }
            drawLabel(ctx.resolve(text), at: CGPoint(x: a.x, y: a.y), angle: 0,
                      ink: MapColor.areaInk, halo: MapColor.land, ctx: ctx)
        }

        guard let base = s.base, mpp < 7, s.drawParks else { return }
        for a in base.parks {
            guard !a.name.isEmpty, a.box.intersects(view), a.box.width * cam.scale >= 46 else { continue }
            let x = cam.screenX(a.box.centerX), y = cam.screenY(a.box.centerY)
            guard x > 0, x < size.width, y > 0, y < size.height else { continue }
            let text = Text(a.name).font(.system(size: 12, weight: .semibold).italic())
            let tw = width(of: "park:" + a.name, size: 12, text: text, ctx: ctx)
            guard room(x, y, 0, tw, 12) else { continue }
            drawLabel(ctx.resolve(text), at: CGPoint(x: x, y: y), angle: 0, ink: parkInk ?? MapColor.parkInk, halo: parkHalo ?? MapColor.park, ctx: ctx)
        }
    }

    /// How wide a name is, measured once per name and size. The map is redrawn on every frame of a drag, and
    /// laying out forty street names each time was most of the frame (measured in the simulator, 2026-09-21).
    /// Names come from the City's own data and there are a few hundred of them, so the table stays small; it is
    /// about the words on a map, never about a person, and it is memory only.
    private nonisolated(unsafe) static var widths: [String: Double] = [:]
    private static func width(of key: String, size: Double, text: Text, ctx: GraphicsContext) -> Double {
        let k = "\(Int(size)):\(key)"
        if let held = widths[k] { return held }
        let w = ctx.resolve(text).measure(in: CGSize(width: 400, height: 40)).width
        if widths.count > 4000 { widths.removeAll() }
        widths[k] = w
        return w
    }

    /// The name, with a halo so it reads over whatever is under it. Canvas has no stroked text, so the halo is the
    /// same words drawn four times a point and a half out.
    static func drawLabel(_ text: GraphicsContext.ResolvedText, at p: CGPoint, angle: Double,
                                  ink: Color, halo: Color, ctx: GraphicsContext) {
        var behind = text; behind.shading = .color(halo)
        var front = text; front.shading = .color(ink)
        ctx.drawLayer { layer in
            layer.translateBy(x: p.x, y: p.y)
            if angle != 0 { layer.rotate(by: .radians(angle)) }
            for (dx, dy) in [(-1.5, 0.0), (1.5, 0.0), (0.0, -1.5), (0.0, 1.5)] {
                layer.draw(behind, at: CGPoint(x: dx, y: dy), anchor: .center)
            }
            layer.draw(front, at: .zero, anchor: .center)
        }
    }

    /// The middle of the longest nearly straight, on-screen run of a line that is at least `need` points long.
    private static func labelSpot(_ pts: [Double], need: Double, cam: MapCamera,
                                  size: CGSize) -> (x: Double, y: Double, a: Double, len: Double)? {
        var best: (x: Double, y: Double, a: Double, len: Double)?
        var sx = 0.0, sy = 0.0, px = 0.0, py = 0.0, ang = 0.0, open = false
        func close() {
            guard open else { return }
            open = false
            guard let c = clip(sx, sy, px, py, 8, 8, size.width - 8, size.height - 8) else { return }
            let len = hypot(c.2 - c.0, c.3 - c.1)
            guard len >= need, best == nil || len > best!.len else { return }
            var a = atan2(c.3 - c.1, c.2 - c.0)
            if a > .pi / 2 { a -= .pi } else if a < -.pi / 2 { a += .pi }
            best = ((c.0 + c.2) / 2, (c.1 + c.3) / 2, a, len)
        }
        var i = 0
        while i + 3 < pts.count {
            let ax = cam.screenX(pts[i]), ay = cam.screenY(pts[i + 1])
            let bx = cam.screenX(pts[i + 2]), by = cam.screenY(pts[i + 3])
            let a = atan2(by - ay, bx - ax)
            // A short jog where a boulevard meets a cross street does not end the run; a real bend does.
            if open, hypot(bx - ax, by - ay) > 6, abs(atan2(sin(a - ang), cos(a - ang))) > 0.3 { close() }
            if !open { sx = ax; sy = ay; ang = a; open = true }
            px = bx; py = by
            i += 2
        }
        close()
        return best
    }

    // MARK: - small things

    /// A flat run of map x, y pairs added to a path in screen points.
    static func trace(_ pts: [Double], cam: MapCamera, into path: inout Path, close: Bool) {
        guard pts.count >= 4 else { return }
        path.move(to: CGPoint(x: cam.screenX(pts[0]), y: cam.screenY(pts[1])))
        var i = 2
        while i + 1 < pts.count {
            path.addLine(to: CGPoint(x: cam.screenX(pts[i]), y: cam.screenY(pts[i + 1])))
            i += 2
        }
        if close { path.closeSubpath() }
    }

    /// Liang-Barsky: the part of a line inside a box, or nil.
    private static func clip(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double,
                             _ l: Double, _ t: Double, _ r: Double, _ b: Double) -> (Double, Double, Double, Double)? {
        var u0 = 0.0, u1 = 1.0
        let dx = x1 - x0, dy = y1 - y0
        for (p, q) in [(-dx, x0 - l), (dx, r - x0), (-dy, y0 - t), (dy, b - y0)] {
            if p == 0 { if q < 0 { return nil }; continue }
            let u = q / p
            if p < 0 { if u > u1 { return nil }; u0 = max(u0, u) } else { if u < u0 { return nil }; u1 = min(u1, u) }
        }
        return (x0 + u0 * dx, y0 + u0 * dy, x0 + u1 * dx, y0 + u1 * dy)
    }
}
