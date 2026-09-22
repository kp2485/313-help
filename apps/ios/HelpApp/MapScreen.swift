// The Map tab: one map of the city, edge to edge, drawn on this phone from the signed bundle (docs/05 "Map tab").
// No tile server, no map company, nothing sent — and it works with no signal, from the snapshot inside the app.
//
// The map is never the only way to reach a fact. "See this map as a list" shows everything that is switched on in
// words, every stretch and every dot is also a VoiceOver button in reading order, and the greenway list is one tap
// away. A picture that some people cannot see is an extra, never the answer.
import DetroitQuery
import HelpCore
import SwiftUI

/// A layer's name in the app's own words, falling back to the English name the bundle carries.
func mapLayerName(_ id: String, fallback: String = "") -> String {
    let key = "layer." + id.replacingOccurrences(of: ":", with: ".")
    let s = L.t(key)
    return s == key ? (fallback.isEmpty ? id : fallback) : s
}

/// A route's name is Latin and reads left to right in every language: inside an Arabic sentence it is held
/// together as one left-to-right run (docs/MAP-STYLE.md section 8), so "4 Woodward · DDOT" never comes out shuffled.
func ltr(_ s: String) -> String { "\u{2066}" + s + "\u{2069}" }

/// "Grand Circus Park (People Mover), Grand Circus Station (QLINE)": each station and whose it is.
func hubStops(_ hub: TransitHub) -> String {
    hub.stops.map { ltr($0.name) + " (" + mapLayerName("go:" + $0.layer) + ")" }.joined(separator: L.t("list.sep"))
}

// MARK: - the tab

struct MapTabView: View {
    @EnvironmentObject private var store: BundleStore
    @EnvironmentObject private var here: Here
    @Environment(MapModel.self) private var model
    @State private var path: [MapRoute] = []
    @State private var showLayers = false
    @State private var showList = false
    @State private var showUrgent = false

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $path) {
            MapSurface(overlays: overlays, showUrgent: $showUrgent, showLayers: $showLayers, showList: $showList)
                // Full screen: the map runs under the status bar. The tab bar stays, because leaving this tab must
                // never take more than one tap.
                .toolbar(.hidden, for: .navigationBar)
                // The map runs under the tab bar, so the bar keeps its own background: over a dark map, tab
                // labels on bare glass were hard to read (simulator check, 2026-09-21).
                .toolbarBackground(.visible, for: .tabBar)
                .navigationDestination(for: MapRoute.self) { route in
                    switch route {
                    case .segment(let id):
                        if let s = store.bundle?.segments.first(where: { $0.id == id }) { SegmentView(segment: s) }
                    case .listing(let id):
                        if let r = store.bundle?.rows.first(where: { $0.id == id }) { DetailView(row: r) }
                    case .greenway:
                        GreenwayView()
                    case .area(let id):
                        if let d = model.indicators, let page = d.areaPage(id: id) { AreaPageView(page: page, d: d) }
                    case .directions(let to):
                        DirectionsView(to: to)
                    }
                }
        }
        // The card a tap opens: name, what it is, and a way in. It never covers the whole map, and the map keeps
        // working behind it, so a person can look at one place and then at the next without dismissing anything.
        .sheet(item: $model.selection) { selection in
            MapCardSheet(selection: selection, open: { route in
                model.select(nil)
                path.append(route)
            })
            .presentationDetents([.height(240), .medium])
            .presentationBackgroundInteraction(.enabled(upThrough: .height(240)))
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showLayers) { MapLayersSheet() }
        .sheet(isPresented: $showList) {
            MapListSheet(overlays: overlays, open: { route in
                showList = false
                path.append(route)
            })
        }
        .sheet(isPresented: $showUrgent) { NavigationStack { UrgentView() } }
        .task(id: store.bundle?.index.version) {
            model.prepareSegments(store.bundle?.segments ?? [])
            model.rebuildDots(from: store)
            await model.loadBase(from: store)
            await loadSwitchedOnLayers()
        }
        .task(id: model.layersOn) {
            model.rebuildDots(from: store)
            // The outlines live in the numbers file, which is fetched the first time any screen wants it.
            if model.isOn(areasLayerId) { await model.loadAreas(from: store) }
            await loadSwitchedOnLayers()
        }
        #if DEBUG
        .onAppear { showLayers = MapStage.value("-mapSheet") == "layers"; showList = MapStage.value("-mapSheet") == "list" }
        #endif
        // The subway style's network files: asked for when the style is on, when a layer is switched on in it, and
        // when a route is selected (its stops). In `standard` this asks for nothing at all.
        .task(id: netsWanted) { await model.loadNets(from: store) }
    }

    /// Changes whenever a different set of network files might be needed.
    private var netsWanted: String {
        "\(model.style.rawValue)|\(model.layersOn.joined(separator: ","))|\(model.stopsLayerOfSelection() ?? "")|\(store.bundle?.index.version ?? "")"
    }

    /// The transport layers that are on, with their shapes if those have arrived.
    private var overlays: [MapOverlay] {
        (store.bundle?.transitLayers ?? []).compactMap { l in
            let id = "go:" + l.id
            guard model.isOn(id), let data = model.data(for: id, in: store) else { return nil }
            return MapOverlay(id: id, label: mapLayerName(id, fallback: l.name), style: mapLayerStyle(id), data: data,
                              subway: drawsSubway(l.id))
        }
    }

    /// `standard` unless the person chose `subway` AND this bundle carries the style AND — for a layer that has a
    /// network file — that file is here. While it is coming, or if it could not be read, the layer is `standard`.
    private func drawsSubway(_ layer: String) -> Bool {
        guard model.style == .subway, let files = store.bundle?.netFiles, !files.isEmpty else { return false }
        return files[layer] == nil ? true : model.net(for: layer, in: store) != nil || model.serves(for: layer, in: store) != nil
    }

    /// Structured concurrency: these finish with the view, and nothing outlives it.
    private func loadSwitchedOnLayers() async {
        for l in store.bundle?.transitLayers ?? [] where model.isOn("go:" + l.id) {
            await model.loadLayer("go:" + l.id, from: store)
        }
    }
}

// MARK: - the map itself

struct MapSurface: View {
    @EnvironmentObject private var store: BundleStore
    @EnvironmentObject private var here: Here
    @Environment(MapModel.self) private var model
    @Environment(\.accessibilityReduceTransparency) private var plainBackgrounds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    /// Increase Contrast. The subway style then uses the spec's high-contrast palette and never dims the basemap.
    @Environment(\.colorSchemeContrast) private var contrast
    /// Dynamic Type, as a number: badges and station names follow it, up to one and a half times.
    @ScaledMetric(relativeTo: .body) private var textUnit: CGFloat = 100
    let overlays: [MapOverlay]
    @Binding var showUrgent: Bool
    @Binding var showLayers: Bool
    @Binding var showList: Bool
    /// Where the finger was last time, so a drag moves the map by the difference and never jumps.
    @State private var lastDrag: CGSize = .zero
    @State private var lastPinch: CGFloat = 1
    /// One finger is down (the drag is live, whatever it turns out to be).
    @State private var dragging = false
    /// Two fingers are on the map. It stays true until the LAST finger lifts, because the drag's own ending is
    /// what decides whether this was a tap, a flick or a pinch, and it may arrive after the pinch has ended.
    @State private var pinching = false
    @State private var pinchFrom: Date?
    /// The last tap, so the next one can be recognised as the second of a double tap — even when it is held.
    @State private var lastTapAt: Date?
    @State private var lastTapPoint: CGPoint = .zero
    /// A double tap whose second tap is still down: dragging up or down now zooms about that tap.
    private struct HeldZoom { var point: CGPoint; var from: MapCamera }
    @State private var held: HeldZoom?
    /// True only once the person has tapped "Use my location". A phone that has never been asked must not be told
    /// its location was refused: the map has nothing to do with where anybody is until they ask it to.
    @State private var askedForLocation = false
    /// Our own card, over the map, the first time this tab is opened on this phone (DECISIONS 2026-09-21).
    @State private var locateCard = false
    /// A fix that arrived from somewhere that is not one of the four cities. The map does not move, and says so.
    @State private var locateOutside = false
    /// The decision has already been made this launch, so coming back to the tab does not re-open anything.
    @State private var locateChecked = false
    /// The one thing this phone remembers about all of it: that the card was answered. Never the answer.
    @State private var flags = LocateFlagStore(dir: DeviceState.dir)
    /// "Getting around" as its own sheet, from the labelled row at the foot of the map (audit H3).
    @State private var showGettingAround = false

    var body: some View {
        ZStack {
            canvas
                // Arabic mirrors every other screen. A map must not mirror: Detroit would be back to front and the
                // streets would not match the city (docs/ACCESSIBILITY-AUDIT-2026-09-20). The controls around it do.
                .environment(\.layoutDirection, .leftToRight)
                .ignoresSafeArea()
        }
        .safeAreaInset(edge: .top, spacing: 0) { topControls }
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomControls }
        .overlay(alignment: .top) { locateCardView }
        .background(Color.appBg)
        .sensoryFeedback(.selection, trigger: model.selectionCount)
        .sheet(isPresented: $showGettingAround) { GettingAroundSheet() }
        .onAppear { firstOpen() }
    }

    // MARK: "See what is near you?"

    /**
     Our own card, before any permission sheet. It sits over the map and never across it: the map keeps drawing
     and answering fingers behind it, "Urgent help" stays where it was, and it is deliberately **not** marked
     `.isModal` — it takes nothing away, so nothing behind it is hidden from VoiceOver. Its own elements are
     ordered first (`.accessibilitySortPriority`), so a reader meets it before the map, which is the order a
     sighted person meets it in too.
     */
    @ViewBuilder private var locateCardView: some View {
        if locateCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(L.t("map.locate_title")).font(.headline)
                Text(L.t("map.locate_body")).font(.subheadline).foregroundStyle(Color.muted)
                // A row that becomes a column when the words are large: at the biggest text sizes two buttons
                // side by side cut each other in half.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { locateYes; locateNo }
                    VStack(alignment: .leading, spacing: 10) { locateYes; locateNo }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(14)
            .frame(maxWidth: 380, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.line))
            .padding(.horizontal, 16)
            .padding(.top, 64)                       // clear of the row of controls along the top
            .accessibilityElement(children: .contain)
            .accessibilitySortPriority(10)
            .transition(.opacity)
        }
    }

    private var locateYes: some View {
        Button(L.t("map.locate_yes")) {
            // The tap is the gesture: the sheet is asked for here and nowhere else.
            askedForLocation = true
            locateCard = false
            here.ask()
            flags.markAnswered()
        }
        .buttonStyle(.borderedProminent)
    }

    private var locateNo: some View {
        Button(L.t("map.locate_no")) {
            locateCard = false
            flags.markAnswered()
        }
        .buttonStyle(.bordered)
    }

    /// What this tab does when it opens. `firstOpenAction` is the whole decision and is the same function on the
    /// web and on Android, held to the same table of cases (HelpCore/Locate.swift).
    private func firstOpen() {
        guard !locateChecked else { return }
        locateChecked = true
        switch firstOpenAction(flagAnswered: flags.answered, permission: here.permission, hasNearFromZip: false) {
        case .showCard:
            locateCard = true
        case .centreOnPerson:
            // Permission is already given, so there is nothing to explain and nothing to ask: just the fix.
            askedForLocation = true
            here.ask()
        case .centreOnZip, .none:
            break                                    // the city, as before. iPhone has no ZIP entry yet (i-list).
        }
    }

    /// A fix has arrived. Inside the four cities the map moves to a two-mile view around it and says so; outside
    /// them nothing moves, and the words say why rather than leaving a person staring at an unchanged map.
    private func locationArrived(_ p: LatLon) {
        locateCard = false
        guard inServiceArea(p) else {
            locateOutside = true
            // The point is not kept either: sorting a Detroit list by distance from another state is a worse
            // answer than not sorting it at all. The web and Android drop it here too.
            here.forget()
            UIAccessibility.post(notification: .announcement, argument: L.t("map.locate_outside"))
            return
        }
        locateOutside = false
        if reduceMotion { model.show(p) } else { withAnimation(.easeOut(duration: 0.25)) { model.show(p) } }
        UIAccessibility.post(notification: .announcement, argument: L.t("map.locate_centered"))
    }

    // MARK: the canvas

    private var canvas: some View {
        GeometryReader { geo in
            Canvas(opaque: false, rendersAsynchronously: false) { ctx, size in
                MapFrameClock.measure("map frame") {
                    MapPainter.draw(scene, into: ctx, size: size)
                }
            }
            .onAppear { model.openAt = here.point; model.resize(geo.size) }
            .onChange(of: geo.size) { _, s in model.resize(s) }
            .contentShape(Rectangle())
            .gesture(drag)
            .simultaneousGesture(pinch)
            .simultaneousGesture(taps)
            // A Canvas is one opaque picture to VoiceOver, so the things on it are offered as real buttons in
            // reading order instead: the greenway south to north, then the places nearest the middle of the screen.
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L.t("map.label_tab"))
            .accessibilityChildren { MapCanvasElements(items: items) }
        }
    }

    private var scene: MapScene {
        MapScene(camera: model.camera,
                 base: model.base,
                 drawParks: model.isOn("place:parks"),
                 overlays: overlays,
                 segments: model.isOn("place:greenway") ? model.segments : [],
                 focus: focusedSegment,
                 dots: model.dots,
                 areas: model.areasShown,
                 areaSelected: model.areaSelected,
                 me: here.point,
                 plainColors: plainBackgrounds,
                 subway: subwayInput)
    }
    /// Nil in `standard`, so the painter's subway passes are never entered.
    private var subwayInput: SubwayInput? {
        guard overlays.contains(where: \.subway) else { return nil }
        var input = SubwayInput(board: model.board)
        for layer in subwayNetworkLayers where model.isOn("go:" + layer) {
            if let net = model.net(for: layer, in: store) { input.nets[layer] = net; input.netKeys[layer] = store.bundle?.netFiles[layer] ?? layer }
        }
        input.hubs = store.bundle?.hubs ?? []
        input.layersOn = model.layersOn
        input.band = model.band
        input.scheme = colorScheme == .dark ? .dark : .light
        input.moreContrast = contrast == .increased
        input.textScale = subwayTextScale(Double(textUnit) / 100)
        input.selected = model.selectedRoute()
        if let stops = model.stopsLayerOfSelection() { input.selectedStops = model.data(for: "go:" + stops, in: store) }
        input.quietBasemap = basemapTokens(style: .subway, networkOn: !input.nets.isEmpty, increasedContrast: input.moreContrast) == .quiet
        return input
    }
    private var focusedSegment: String? {
        if case .segment(let id) = model.selection { return id }
        return nil
    }

    // MARK: gestures

    /// One finger. It pans, it flicks, and — when it is the held second tap of a double tap — it zooms. What it
    /// never does any more is select: that is the tap gestures' job, so that the card of a first tap cannot flash
    /// up and be thrown away by the zoom of a second.
    ///
    /// During a pinch this same gesture is what follows the two fingers' middle across the screen: SwiftUI reports
    /// the centroid's translation here while `pinch` reports the spread, and the two compose into exactly the one
    /// step `MapCamera.pinched` describes — zoom about where the middle was, then follow it to where it is.
    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                if !dragging {
                    dragging = true
                    model.stopMotion()              // a finger on the map stops it where it is, at once
                    if let at = lastTapAt, Date.now.timeIntervalSince(at) <= 0.3,
                       hypot(v.startLocation.x - lastTapPoint.x, v.startLocation.y - lastTapPoint.y) <= 30 {
                        held = HeldZoom(point: v.startLocation, from: model.camera)
                    }
                }
                if let h = held {
                    model.zoom(MapDragZoom.factor(dy: v.translation.height), from: h.from, at: h.point)
                } else {
                    model.pan(dx: v.translation.width - lastDrag.width, dy: v.translation.height - lastDrag.height)
                }
                lastDrag = v.translation
            }
            .onEnded { v in
                let wasPinching = pinching, wasHeld = held != nil
                lastDrag = .zero; dragging = false; held = nil; pinching = false; pinchFrom = nil
                if wasPinching || wasHeld { lastTapAt = nil; return }
                // A tap, not a drag: the same eight points the web map allows for a finger that does not hold
                // still. It is remembered, so the next finger down knows it may be a double tap being held.
                if abs(v.translation.width) + abs(v.translation.height) < 8 {
                    lastTapAt = .now; lastTapPoint = v.location
                    return
                }
                // Momentum, straight from the gesture's own velocity — and none at all under Reduce Motion.
                if !reduceMotion { model.fling(vx: v.velocity.width, vy: v.velocity.height) }
            }
    }
    /// Two fingers. The spread is the zoom; the middle they are zooming about is where it is NOW, which is the
    /// start of the pinch carried along by the drag above — so the map point under the fingers stays under them
    /// while the hand also slides. A pair of fingers put down and lifted without spreading is a two-finger tap,
    /// and that is zoom out: the other half of the double tap.
    private var pinch: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0)
            .onChanged { v in
                if !pinching { pinching = true; pinchFrom = .now; model.stopMotion() }
                let mid = CGPoint(x: v.startLocation.x + lastDrag.width, y: v.startLocation.y + lastDrag.height)
                model.zoom(v.magnification / lastPinch, at: mid)
                lastPinch = v.magnification
            }
            .onEnded { v in
                let mid = CGPoint(x: v.startLocation.x + lastDrag.width, y: v.startLocation.y + lastDrag.height)
                let brief = pinchFrom.map { Date.now.timeIntervalSince($0) <= 0.3 } ?? false
                lastPinch = 1
                if brief, abs(v.magnification - 1) < 0.06 {
                    model.zoom(1 / 1.8, at: mid, animated: !reduceMotion)
                }
            }
    }
    /// Tapping. The double tap is offered first, so a single tap waits the system's double-tap window out before
    /// it selects anything: about a quarter of a second, which is the price of never showing a card and then
    /// throwing it away. VoiceOver never comes this way — its route is the buttons behind the canvas.
    private var taps: some Gesture {
        SpatialTapGesture(count: 2)
            .onEnded { e in
                lastTapAt = nil
                model.zoom(1.8, at: e.location, animated: !reduceMotion)
            }
            .exclusively(before: SpatialTapGesture(count: 1).onEnded { e in
                model.select(model.pick(at: e.location, overlays: overlays, parksOn: model.isOn("place:parks")))
            })
    }

    // MARK: the things on the map, as buttons

    private var items: [MapElement] {
        var out: [MapElement] = []
        if model.isOn("place:greenway") {
            for g in model.segments {
                out.append(MapElement(
                    id: "seg:" + g.id,
                    label: "\(L.t("gw.title")), \(g.segment.name), \(L.t("gw." + g.segment.phase)). \(L.t("map.details"))",
                    action: { model.select(.segment(g.id)) }))
            }
        }
        let view = model.camera.visible
        // The outlines come after the greenway and BEFORE the dots: an area is the ground the dots stand on, and
        // a reader that walks the ground first reads the map the way an eye does (`MapFeatureKind`, audit §3.4).
        // The one nearest the middle of the screen is offered first, like every other place on this map.
        let areasNear = placesInReadingOrder(model.areasShown, fromX: model.camera.centerX, fromY: model.camera.centerY,
                                             x: { $0.box.centerX }, y: { $0.box.centerY }, tieBreak: { $0.id })
        for a in areasNear.prefix(20) {
            out.append(MapElement(
                id: "area:" + a.id,
                label: "\(a.name), \(a.sub). \(L.t("map.details"))",
                action: { model.select(.area(a.id)) }))
        }
        let onScreen = model.dots.filter { view.contains(x: $0.x, y: $0.y) }
        let near = placesInReadingOrder(onScreen, fromX: model.camera.centerX, fromY: model.camera.centerY,
                                        x: { $0.x }, y: { $0.y }, tieBreak: { $0.name })
        for d in near.prefix(40) {
            out.append(MapElement(
                id: "row:" + d.id,
                label: "\(d.name), \(mapLayerName("help:" + d.group)). \(L.t("map.details"))",
                action: { model.select(.listing(d.id)) }))
        }
        // The subway style only ever ADDS to this list, after everything `standard` reads and in the spec's
        // order: hubs, terminals, interchanges nearest the middle first, then routes in rider order. Forty at
        // most; the list has the rest.
        guard overlays.contains(where: \.subway) else { return out }
        return featureOrder(existing: out, hubs: subwayElements.hubs, terminals: subwayElements.terminals,
                            interchanges: subwayElements.interchanges, routes: subwayElements.routes).items
    }

    private var subwayElements: (hubs: [MapElement], terminals: [MapElement], interchanges: [MapElement], routes: [MapElement]) {
        let view = model.camera.visible
        let plan = stationsFor(band: model.band, metersPerPoint: model.camera.metersPerPoint, hasSelection: false)
        var hubs: [MapElement] = []
        var ends: [(d: Double, e: MapElement)] = [], routes: [(order: Int, e: MapElement)] = []
        var changes: [(d: Double, e: MapElement)] = []
        for hub in store.bundle?.hubs ?? [] where hub.shows(layersOn: model.layersOn) && view.contains(x: hub.x, y: hub.y) {
            hubs.append(MapElement(id: hub.id, label: "\(hub.name). \(L.t("map.hub_walk", ["list": hubStops(hub)]))",
                                   action: { model.select(.hub(hub.name)) }))
        }
        for layer in subwayNetworkLayers where overlays.contains(where: { $0.id == "go:" + layer && $0.subway }) {
            guard let net = model.net(for: layer, in: store)?.net else { continue }
            let onScreen = Set(net.lines.filter { $0.box.intersects(view) }.map(\.route))
            for (ri, r) in net.routes.enumerated() where onScreen.contains(ri) {
                let name = L.t("map.route_card", ["name": r.label, "agency": net.agency])
                routes.append((riderOrder(short: r.short, system: net.system, index: ri),
                               MapElement(id: "line:" + r.id, label: "\(name). \(L.t("map.details"))",
                                          action: { model.select(.line(layer: layer, route: r.id)) })))
                guard plan.terminals else { continue }
                for (ei, e) in r.ends.enumerated() where view.contains(x: e.x, y: e.y) {
                    ends.append((hypot(e.x - model.camera.centerX, e.y - model.camera.centerY),
                                 MapElement(id: "end:\(r.id):\(ei)", label: "\(e.name.isEmpty ? name : e.name), \(name). \(L.t("map.details"))",
                                            action: { model.select(.line(layer: layer, route: r.id)) })))
                }
            }
            guard plan.interchangeMinRoutes > 0 else { continue }
            for (ci, c) in net.interchanges.enumerated() where c.routes.count >= plan.interchangeMinRoutes && view.contains(x: c.x, y: c.y) {
                let list = c.routes.map { net.routes[$0].short }.joined(separator: L.t("list.sep"))
                changes.append((hypot(c.x - model.camera.centerX, c.y - model.camera.centerY),
                                MapElement(id: "change:\(layer):\(ci)", label: "\(c.name). \(L.t("map.change_here", ["list": list]))",
                                           action: { model.select(.interchange(layer: layer, index: ci)) })))
            }
        }
        // Terminals and interchanges nearest the middle first; routes in rider order, across networks.
        return (hubs, ends.sorted { $0.d < $1.d }.map(\.e), changes.sorted { $0.d < $1.d }.map(\.e), routes.sorted { $0.order < $1.order }.map(\.e))
    }

    // MARK: the controls

    private var topControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                MapButton(symbol: "phone.fill", label: L.t("strip.more"), plain: plainBackgrounds) { showUrgent = true }
                Spacer(minLength: 0)
                MapButton(symbol: "square.3.layers.3d", label: L.t("map.layers"), plain: plainBackgrounds) { showLayers = true }
                MapButton(symbol: "list.bullet", label: L.t("map.list_title"), plain: plainBackgrounds) { showList = true }
            }
            // The three ways a person can say where they are — "Use my location", a cross street, a ZIP — and,
            // once one of them has answered, what the map is using and how to stop (audit M6). The same control,
            // the same words and the same refusal handling as every list screen, and the same one the web's Map
            // tab carries beside its map. It sits under the round buttons rather than over the attribution,
            // because the cross-street field opens the keyboard and the keyboard comes up from the bottom.
            // While our own first-open card is up it has the floor: two cards asking the same question at once
            // is two cards, and the card is the one that explains itself.
            if !locateCard { whereCard }
            // "Getting around" as a labelled row, not a symbol (audit H3): trip planners, fares, free rides and
            // the phone numbers, which is what the web's Map tab prints under its map. It is also still in
            // "See this map as a list", exactly as it was.
            gettingAroundRow
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private var bottomControls: some View {
        VStack(alignment: .trailing, spacing: 10) {
            if model.baseFailed {
                Text(L.t("map.no_streets")).font(.footnote).foregroundStyle(Color.warnInk)
                    .padding(10).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .bottom, spacing: 10) {
                if let edited = model.base?.edited, !edited.isEmpty {
                    // Who the streets and parks come from, over the map itself. The whole sentence — with what a
                    // drag and a pinch do — is in "See this map as a list", where there is room for it.
                    Text(L.t("map.source", ["date": prettyDate(edited)]))
                        .font(.caption2).foregroundStyle(Color.muted).lineLimit(2)
                        .padding(8)
                        .background(plainBackgrounds ? AnyShapeStyle(Color.surface) : AnyShapeStyle(.thinMaterial),
                                    in: RoundedRectangle(cornerRadius: 10))
                        .accessibilityHidden(true)      // the same sentence is read with the map's own label
                }
                Spacer(minLength: 0)
                VStack(spacing: 10) {
                    zoomControls
                    MapButton(symbol: "location.fill", label: L.t("loc.use"), plain: plainBackgrounds) {
                        askedForLocation = true
                        here.ask()
                    }
                    MapButton(symbol: "scope", label: L.t("map.reset"), plain: plainBackgrounds) { model.reset() }
                }
            }
            if locateOutside {
                Text(L.t("map.locate_outside")).font(.footnote).foregroundStyle(Color.ink)
                    .padding(10).background(Color.surface, in: RoundedRectangle(cornerRadius: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 8)
        .onChange(of: here.point) { _, p in
            guard let p else { return }
            locationArrived(p)
        }
        .onChange(of: here.denied) { _, no in if no { locateCard = false } }
    }

    /// The location card over the map: the three ways in, "Still looking…" with its Stop, and what the map is
    /// using once one of them has answered. It never covers the map — it sits in the bottom inset with the
    /// attribution, and the map keeps drawing and answering fingers behind it.
    private var whereCard: some View {
        LocationChip()
            .padding(12)
            .frame(maxWidth: 420, alignment: .leading)
            .background(plainBackgrounds ? AnyShapeStyle(Color.surface) : AnyShapeStyle(.regularMaterial),
                        in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
    }

    private var gettingAroundRow: some View {
        Button { showGettingAround = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "bus").accessibilityHidden(true)
                Text(L.t("transit.head")).fontWeight(.semibold).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).accessibilityHidden(true)
            }
            .font(.subheadline).foregroundStyle(Color.brand)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: 420, minHeight: 44, alignment: .leading)
            .background(plainBackgrounds ? AnyShapeStyle(Color.surface) : AnyShapeStyle(.regularMaterial),
                        in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L.t("transit.head"))
    }

    /// Plus and minus, and the same two steps offered to a screen reader as one adjustable control, so zooming
    /// never needs two separate hunts across the screen.
    private var zoomControls: some View {
        VStack(spacing: 0) {
            MapButton(symbol: "plus", label: L.t("map.zoom_in"), plain: plainBackgrounds, framed: false) { model.zoom(1.6) }
            Divider().frame(width: 30)
            MapButton(symbol: "minus", label: L.t("map.zoom_out"), plain: plainBackgrounds, framed: false) { model.zoom(1 / 1.6) }
        }
        .background(plainBackgrounds ? AnyShapeStyle(Color.surface) : AnyShapeStyle(.regularMaterial),
                    in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L.t("map.zoom"))
        .accessibilityHint(L.t("map.keys"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: model.zoom(1.6)
            case .decrement: model.zoom(1 / 1.6)
            @unknown default: break
            }
        }
    }
}

/// One thing on the map, offered to VoiceOver, Voice Control and Switch Control as a real button. The list is
/// laid out but never drawn: the picture underneath is what a sighted person sees.
struct MapElement: Identifiable {
    var id: String
    var label: String
    var action: () -> Void
}
struct MapCanvasElements: View {
    let items: [MapElement]
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { item in
                Button(item.label, action: item.action)
                    .accessibilityLabel(item.label)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
        }
    }
}

/// A floating control over the map: a circle of material, a symbol, a real label, and never smaller than 44 points.
struct MapButton: View {
    let symbol: String
    let label: String
    var plain = false
    var framed = true
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                // A fixed size, not a scaling one: at the accessibility text sizes the symbol grew out of its
                // circle and over the map. The Large Content Viewer below shows it big, with its words, on a
                // press and hold, which is what iOS asks of a control this small.
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.brand)
                .frame(width: 44, height: 44)
                .background {
                    if framed {
                        Circle().fill(plain ? AnyShapeStyle(Color.surface) : AnyShapeStyle(.regularMaterial))
                            .overlay(Circle().strokeBorder(Color.line, lineWidth: 1))
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityInputLabels([label])
        .accessibilityShowsLargeContentViewer { Label(label, systemImage: symbol) }
    }
}

// MARK: - the card a tap opens

struct MapCardSheet: View {
    @EnvironmentObject private var store: BundleStore
    @Environment(MapModel.self) private var model
    @Environment(\.dynamicTypeSize) private var textSize
    let selection: MapSelection
    let open: (MapRoute) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                switch selection {
                case .segment(let id):
                    if let s = store.bundle?.segments.first(where: { $0.id == id }) {
                        head(L.t("gw.title"), s.name)
                        // The phase is a word, and the status is a word: never a colour on its own.
                        Pill(text: L.t("gw." + s.phase), tone: s.phase == "open" ? .open : .plain)
                        if s.phase != "open" { Text(L.t("gw.not_open")).font(.subheadline).foregroundStyle(Color.muted) }
                        if let cross = s.crossStreets, !cross.isEmpty {
                            Text(L.t("gw.crosses") + L.t("list.sep") + cross.joined(separator: L.t("list.sep")))
                                .font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                        }
                        openButton(L.t("map.details")) { open(.segment(id)) }
                    }
                case .listing(let id):
                    if let r = store.bundle?.rows.first(where: { $0.id == id }) {
                        head(mapLayerName("help:" + mapGroupId(for: r.category)), r.name)
                        Text(r.what).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                        let now1 = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
                        let open1 = openNow(r, now: now1, alerts: store.bundle?.alerts ?? [])
                        // "Next: Friday, Sep 25 3:30 pm" — a day by its name, as the web says it, never a raw date.
                        Pill(text: openText(open1, now: now1), tone: Pill.tone(for: open1.state))
                        if let phone = r.phones.first { CallRow(label: L.t("detail.call"), number: phone.number) }
                        // "Directions" comes FIRST on the card: on the Map tab it is the thing a person came
                        // for, and "See details" is the longer road to the same place (the web's `pick`).
                        if let dest = dirDestination(name: r.name, lat: r.lat, lon: r.lon, category: r.category) {
                            openButton(L.t("dir.open")) { open(.directions(dest)) }
                        }
                        openButton(L.t("map.details")) { open(.listing(id)) }
                    }
                case .area(let id):
                    if let a = model.area(id: id) {
                        // A name, whose area it is, and the way to its page. No number, ever: docs/13's first
                        // honesty rule means an outline is never handed anything that could read as a score.
                        head(a.sub, a.name)
                        openButton(L.t("map.details")) { open(.area(id)) }
                    }
                case .park(let name):
                    head(L.t("map.park"), name)
                case .stop(let name, let layer):
                    head(layer, name.isEmpty ? layer : name)
                case .route(let name, let layer):
                    head(layer, name.isEmpty ? layer : name)
                case .line(let layer, let id):
                    if let net = model.net(for: layer, in: store)?.net, let r = net.routes.first(where: { $0.id == id }) {
                        routeCard(r, net: net, layer: layer)
                    }
                case .trunk(let layer, let ids):
                    if let net = model.net(for: layer, in: store)?.net {
                        let members = net.routes.filter { ids.contains($0.id) }
                        head(mapLayerName("go:" + layer), L.t("map.many_routes", [
                            "count": String(members.count), "list": ltr(members.map(\.short).joined(separator: " · "))]))
                        routeButtons(members, layer: layer)
                    }
                case .station(let layer, let index):
                    let points = model.data(for: "go:" + layer, in: store)?.points ?? []
                    if index < points.count {
                        head(mapLayerName("go:" + layer), points[index].name.isEmpty ? mapLayerName("go:" + layer) : points[index].name)
                        let calling = routesCalling(at: index, layer: layer)
                        if !calling.routes.isEmpty {
                            Text(L.t("map.stop_lines", ["list": ltr(calling.routes.map(\.short).joined(separator: L.t("list.sep")))]))
                                .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                            routeButtons(calling.routes, layer: calling.layer)
                        }
                    }
                case .interchange(let layer, let index):
                    if let net = model.net(for: layer, in: store)?.net, index < net.interchanges.count {
                        let c = net.interchanges[index]
                        let members = c.routes.map { net.routes[$0] }
                        head(mapLayerName("go:" + layer), c.name.isEmpty ? mapLayerName("go:" + layer) : c.name)
                        Text(L.t("map.change_here", ["list": ltr(members.map(\.short).joined(separator: L.t("list.sep")))]))
                            .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                        routeButtons(members, layer: layer)
                    }
                case .hub(let name):
                    if let hub = store.bundle?.hubs.first(where: { $0.name == name }) {
                        head(L.t("map.key_change"), hub.name)
                        Text(L.t("map.hub_walk", ["list": hubStops(hub)]))
                            .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.appBg)
    }

    @ViewBuilder private func head(_ kind: String, _ name: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(kind).font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
            Text(name).font(.title3.bold()).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    /// A route in the subway style: its name and whose it is, what the agency itself publishes about how often it
    /// runs, how many stops, where it ends — and ONE link, the owner's own trip planner, the same one "Getting
    /// around" carries. Nothing here is live: no arrival times, ever.
    @ViewBuilder private func routeCard(_ r: NetRoute, net: TransitNet, layer: String) -> some View {
        head(mapLayerName("go:" + layer), ltr(L.t("map.route_card", ["name": r.label, "agency": net.agency])))
        if r.frequent { Pill(text: L.t("map.route_frequent"), tone: .plain) }
        if let minutes = r.headway {
            Text(L.t("map.route_every", ["minutes": String(minutes)])).font(.subheadline).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        if r.stopCount > 0 {
            Text(L.t("map.route_stops", ["count": String(r.stopCount)])).font(.subheadline).foregroundStyle(Color.muted)
        }
        // Where it ends, by the names of the stops themselves (the owner's words, so no sentence of ours round them).
        let ends = r.ends.map(\.name).filter { !$0.isEmpty }
        if !ends.isEmpty {
            Text(ltr(ends.joined(separator: " ↔ "))).font(.subheadline).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        // The QLINE line is a drawing through its stations, and says so wherever the data marks it `derived`.
        if r.derived {
            Text(L.t("map.key_qline")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        }
        let planner = TransitFacts.current.planner(forSystem: net.system)
            ?? net.agencyURL.map { TransitFacts.Link(label: net.agency, url: $0) }
        if let planner { OwnerLink(link: planner, title: L.t("map.route_plan", ["agency": net.agency])) }
    }

    /// Each route a button that selects it, never smaller than 44 points.
    @ViewBuilder private func routeButtons(_ routes: [NetRoute], layer: String) -> some View {
        ForEach(routes, id: \.id) { r in
            openButton(ltr(r.label)) { model.select(.line(layer: layer, route: r.id)) }
        }
    }

    /// The routes that call at a stop, and the network layer they belong to. A stops layer reads its small
    /// `serves` file; the two rail layers carry theirs inside the network file.
    private func routesCalling(at index: Int, layer: String) -> (layer: String, routes: [NetRoute]) {
        if let s = model.serves(for: layer, in: store), let net = model.net(for: s.routesLayer, in: store)?.net, index < s.serves.count {
            return (s.routesLayer, s.serves[index].filter { $0 < net.routes.count }.map { net.routes[$0] })
        }
        if let net = model.net(for: layer, in: store)?.net, let serves = net.serves, index < serves.count {
            return (layer, serves[index].filter { $0 < net.routes.count }.map { net.routes[$0] })
        }
        return (layer, [])
    }

    private func openButton(_ title: String, _ go: @escaping () -> Void) -> some View {
        Button(action: go) {
            HStack(spacing: 8) {
                Text(title).fontWeight(.semibold).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
            }
            .font(.subheadline).foregroundStyle(Color.brandSoftInk)
            .padding(.horizontal, 16).padding(.vertical, 14).frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

/// A link out to somebody else's page. It names its owner before the tap — the host, in plain sight — opens in
/// the browser through `openURL`, and sends nothing of ours with it.
struct OwnerLink: View {
    @Environment(\.openURL) private var openURL
    let link: TransitFacts.Link
    var title: String?
    var body: some View {
        Button { if let url = URL(string: link.url) { openURL(url) } } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title ?? link.label).fontWeight(.semibold).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    Text(ltr(link.owner)).font(.footnote).foregroundStyle(Color.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right.square").accessibilityHidden(true)
            }
            .font(.subheadline).foregroundStyle(Color.brandSoftInk)
            .padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isLink)
    }
}

/// One line of "What the lines mean": a small drawn sample and the words. The words carry it; the sample is
/// hidden from VoiceOver.
private struct MapKeyRow: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    let key: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Canvas { ctx, size in sample(ctx, size) }
                .frame(width: 44, height: 18).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
                .environment(\.layoutDirection, .leftToRight)
                .accessibilityHidden(true)
            Text(L.t("map.key_" + key)).font(.footnote).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
    private func color(_ t: TransitToken) -> Color {
        Color(rgb: TransitPalette.color(t, scheme: scheme == .dark ? .dark : .light, increasedContrast: contrast == .increased))
    }
    private func sample(_ ctx: GraphicsContext, _ size: CGSize) {
        let y = size.height / 2
        var line = Path(); line.move(to: CGPoint(x: 4, y: y)); line.addLine(to: CGPoint(x: size.width - 4, y: y))
        func stroke(_ t: TransitToken, _ w: Double, dash: [CGFloat] = [], cap: CGLineCap = .round) {
            ctx.stroke(line, with: .color(color(t)), style: StrokeStyle(lineWidth: w, lineCap: cap, dash: dash))
        }
        let dot = { (r: Double) in Path(ellipseIn: CGRect(x: size.width / 2 - r, y: y - r, width: r * 2, height: r * 2)) }
        switch key {
        case "frequent": stroke(.fill, 9); stroke(.tr0, 6)
        case "local": stroke(.fill, 7.5); stroke(.tr1, 3.5)
        case "smart": stroke(.fill, 9); stroke(.tr2, 6); stroke(.fill, 2)
        case "trunk": stroke(.fill, 13); stroke(.trunk, 10)
        case "station": ctx.fill(dot(4), with: .color(color(.fill))); ctx.stroke(dot(4), with: .color(color(.ring)), lineWidth: 1.5)
        case "change":
            var pill = Path(); pill.move(to: CGPoint(x: 14, y: y)); pill.addLine(to: CGPoint(x: size.width - 14, y: y))
            ctx.stroke(pill, with: .color(color(.ring)), style: StrokeStyle(lineWidth: 11, lineCap: .round))
            ctx.stroke(pill, with: .color(color(.fill)), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        case "end": ctx.fill(dot(6), with: .color(color(.fill))); ctx.stroke(dot(6), with: .color(color(.tr0)), lineWidth: 3)
        case "qline": stroke(.fill, 10); stroke(.rail, 7); stroke(.fill, 4, dash: [6, 8], cap: .butt)
        case "dpm":
            stroke(.fill, 10); stroke(.dpm, 7)
            var chevron = Path()
            for x in [14.0, 30.0] {
                chevron.move(to: CGPoint(x: x - 3, y: y - 3)); chevron.addLine(to: CGPoint(x: x + 1, y: y)); chevron.addLine(to: CGPoint(x: x - 3, y: y + 3))
            }
            ctx.stroke(chevron, with: .color(color(.fill)), style: StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round))
        case "bike":
            for dy in [-1.75, 1.75] {
                var l = Path(); l.move(to: CGPoint(x: 4, y: y + dy)); l.addLine(to: CGPoint(x: size.width - 4, y: y + dy))
                ctx.stroke(l, with: .color(color(.bike)), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            }
        default: break
        }
    }
}

// MARK: - what to show on the map

struct MapLayersSheet: View {
    @EnvironmentObject private var store: BundleStore
    @Environment(MapModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            List {
                Section {
                    Text(L.t("map.layers_note")).font(.footnote).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !helpLayers.isEmpty {
                    Section(L.t("map.group_help")) { ForEach(helpLayers, id: \.self) { row($0) } }
                }
                if !placeLayers.isEmpty {
                    Section(L.t("map.group_places")) { ForEach(placeLayers, id: \.self) { row($0) } }
                }
                // "Map style" sits above "Getting around" because it changes how that group is drawn and nothing
                // else. It is not offered at all when this bundle carries no network files: nothing to choose.
                if !goLayers.isEmpty, !(store.bundle?.netFiles.isEmpty ?? true) { styleSection }
                if !goLayers.isEmpty {
                    Section(L.t("map.group_go")) { ForEach(goLayers, id: \.self) { row($0) } }
                }
            }
            #if DEBUG
            .task {     // `-mapSheetScroll style`: a screenshot of the part of this sheet that is below the fold
                guard let to = MapStage.value("-mapSheetScroll") else { return }
                try? await Task.sleep(for: .seconds(1))
                proxy.scrollTo(to, anchor: .top)
            }
            #endif
            }
            .navigationTitle(L.t("map.layers")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L.t("map.done")) { dismiss() } } }
        }
    }

    /// Two options, one of them chosen: an inline `Picker`, which is what iOS gives VoiceOver, Switch Control and
    /// Voice Control as a radio group — the section's header names the group, each row is its label and its one
    /// line of description read together, and the chosen row says "selected". The choice applies at once, is
    /// written to the same file as the layer choices (never `UserDefaults`, never sent), and is announced.
    @ViewBuilder private var styleSection: some View {
        let style = model.style
        Section {
            Picker(L.t("map.style"), selection: Binding(get: { style }, set: { next in
                guard next != style else { return }
                model.setStyle(next)
                AccessibilityNotification.Announcement(L.t("map.style_say", ["name": styleName(next)])).post()
            })) {
                ForEach(MapStyleChoice.allCases, id: \.self) { choice in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(styleName(choice)).foregroundStyle(Color.ink)
                        Text(L.t("map.style_\(choice.rawValue)_note")).font(.footnote).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(minHeight: 44, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    .tag(choice)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            .tint(Color.brand)
            if style == .subway {
                let waiting = goLayers.filter { model.netLoading($0, in: store) }
                if !waiting.isEmpty {
                    // Until a network file arrives its layer goes on being drawn in the standard style.
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(waiting.map { mapLayerName($0, fallback: bundleName($0)) }.joined(separator: L.t("list.sep")))
                            .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(L.t("map.layer_loading") + " " + waiting.map { mapLayerName($0, fallback: bundleName($0)) }.joined(separator: L.t("list.sep")))
                }
                if !keyRows.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L.t("map.key")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(keyRows, id: \.self) { MapKeyRow(key: $0) }
                    }
                    .padding(.vertical, 4)
                }
            }
        } header: {
            Text(L.t("map.style"))
        }
        .id("style")
    }
    private func styleName(_ s: MapStyleChoice) -> String { L.t("map.style_" + s.rawValue) }

    /// The key, in words, only for what is switched on.
    private var keyRows: [String] {
        let on = { (id: String) in model.isOn("go:" + id) }
        var rows: [String] = []
        let bus = on("ddot_routes") || on("smart_routes")
        if bus { rows += ["frequent", "local"] }
        if on("smart_routes") { rows.append("smart") }
        if bus { rows.append("trunk") }
        if on("ddot_stops") || on("smart_stops") || on("qline") || on("people_mover") { rows.append("station") }
        if bus { rows += ["change", "end"] }
        if on("qline") { rows.append("qline") }
        if on("people_mover") { rows.append("dpm") }
        if on("bike_lanes") { rows.append("bike") }
        return rows
    }

    /// A real `Toggle`, so Switch Control, Voice Control and VoiceOver all say "on" or "off" themselves.
    @ViewBuilder private func row(_ id: String) -> some View {
        let name = mapLayerName(id, fallback: bundleName(id))
        // Read out of the model **here**, in the body, so the switch redraws when the choice changes: a getter
        // inside a Binding closure runs outside the body and Observation never sees it.
        let on = model.layersOn.contains(id)
        VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: Binding(get: { on }, set: { _ in model.toggle(id) })) {
                Text(name).fixedSize(horizontal: false, vertical: true)
            }
            .tint(Color.brand)
            if mapLayerStyle(id).dense, id.hasPrefix("go:") {
                Text(L.t("map.layer_zoom")).font(.footnote).foregroundStyle(Color.muted)
            }
            // A layer that is switched on and could not be read says so, and asks again on a tap. It is never
            // silently remembered as "nothing" (web review, 2026-09-20).
            // In the subway style the same line covers the layer's network file: the layer then stays in the
            // standard style, which is still a map, and "Try again" asks for the file afresh.
            if on, model.layerFailed.contains(id) || (model.style == .subway && model.netFailed.contains(id)) {
                HStack(spacing: 10) {
                    Text(L.t("map.layer_failed", ["name": name])).font(.footnote).foregroundStyle(Color.warnInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(L.t("map.layer_retry")) { Task { await model.retry(id, from: store) } }
                        .font(.footnote.weight(.semibold)).foregroundStyle(Color.brand)
                }
            }
        }
    }

    private func bundleName(_ id: String) -> String {
        (store.bundle?.transitLayers.first { "go:" + $0.id == id })?.name ?? ""
    }
    private var helpLayers: [String] {
        mapGroups.filter { g in
            (store.bundle?.rows ?? []).contains { r in
                g.tops.contains(String(r.category.split(separator: ".").first ?? "")) && r.lat != nil && !isSensitive(r.category)
            }
        }.map { "help:" + $0.id }
    }
    private var placeLayers: [String] {
        var out: [String] = []
        if !(store.bundle?.segments.isEmpty ?? true) { out.append("place:greenway") }
        if !(store.bundle?.parks.isEmpty ?? true) { out.append("place:parks") }
        // The outlines. Off by default on the Map tab, where the job is "what is near me?"; the Areas tab opens
        // with them on, because there the job is "tell me about this part of the city" (audit §3.1). The row is
        // offered whenever this bundle carries the numbers file the outlines ride in.
        if store.mapSource(HoodsFile.name) != nil { out.append(areasLayerId) }
        return out
    }
    private var goLayers: [String] { (store.bundle?.transitLayers ?? []).map { "go:" + $0.id } }
}

// MARK: - see this map as a list

/// Everything the map is showing, in words. This is the text alternative the whole tab depends on, so it is a
/// persistent control and not a hidden one — and the greenway list is reachable from it.
struct MapListSheet: View {
    @EnvironmentObject private var store: BundleStore
    @EnvironmentObject private var here: Here
    @Environment(MapModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let overlays: [MapOverlay]
    let open: (MapRoute) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if rows.isEmpty && segments.isEmpty && parks.isEmpty && overlays.isEmpty {
                        Text(L.t("map.list_none")).foregroundStyle(Color.muted).card()
                    }
                    if !rows.isEmpty {
                        SectionHead(text: L.t("map.list_help", ["count": String(rows.count)]))
                        ForEach(rows.prefix(20), id: \.row.id) { r in
                            Button { open(.listing(r.row.id)) } label: { Card(r: r, showMiles: here.point != nil) }
                                .buttonStyle(.plain).card()
                        }
                        if rows.count > 20 {
                            Text(L.t("map.list_more", ["count": String(rows.count - 20)])).font(.footnote).foregroundStyle(Color.muted)
                        }
                    }
                    if !segments.isEmpty {
                        SectionHead(text: L.t("gw.title"))
                        ForEach(segments) { s in
                            Button { open(.segment(s.id)) } label: {
                                HStack(spacing: 14) {
                                    IconBadge(symbol: "point.topleft.down.curvedto.point.bottomright.up")
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.name).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Text(L.t("gw." + s.phase)).font(.subheadline).foregroundStyle(Color.muted)
                                    }
                                    Spacer(minLength: 8)
                                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                                }.card()
                            }.buttonStyle(.plain)
                        }
                        Button { open(.greenway) } label: {
                            Text(L.t("gw.title")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                                .padding(.horizontal, 16).padding(.vertical, 13).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                    if !parks.isEmpty {
                        SectionHead(text: L.t("rec.parks"))
                        // Park, route and stop names are written by the City, never by us: one run of their words.
                        Text(names(parks.map(\.name), limit: 30)).font(.subheadline).foregroundStyle(Color.ink)
                            .fixedSize(horizontal: false, vertical: true).card()
                    }
                    ForEach(overlays) { o in
                        SectionHead(text: o.label)
                        let list = (o.data.lines.map(\.name) + o.data.points.map(\.name)).filter { !$0.isEmpty }
                        let count = o.data.lines.count + o.data.points.count
                        if list.isEmpty {
                            Text(L.t("map.list_unnamed", ["count": String(count)])).font(.subheadline).foregroundStyle(Color.muted).card()
                        } else {
                            Text(names(list, limit: 40)).font(.subheadline).foregroundStyle(Color.ink)
                                .fixedSize(horizontal: false, vertical: true).card()
                        }
                    }
                    GettingAround()
                    if !sources.isEmpty {
                        Text(L.t("map.sources") + " " + sources + "\n" + L.t("map.layer_filtered"))
                            .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    // The streets and parks themselves, in full: who they come from, when they were last edited,
                    // and how to move the map. Over the map there is only room for the first two lines of it.
                    if let edited = model.base?.edited, !edited.isEmpty {
                        Text(L.t("map.source", ["date": prettyDate(edited)]))
                            .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }.padding(16)
            }
            .background(Color.appBg)
            .navigationTitle(L.t("map.list_title")).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L.t("map.done")) { dismiss() } } }
        }
    }

    private func names(_ list: [String], limit: Int) -> String {
        var seen = Set<String>(), out: [String] = []
        for n in list where !seen.contains(n) { seen.insert(n); out.append(n) }
        let head = out.prefix(limit).joined(separator: " · ")
        return out.count > limit ? head + "\n" + L.t("map.list_more", ["count": String(out.count - limit)]) : head
    }

    private var rows: [Ranked] {
        let tops = model.switchedOnTops
        guard !tops.isEmpty else { return [] }
        var q = Query()
        q.near = here.point
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        return rank(mapDrawable(store.bundle?.rows ?? [], tops: tops), q, now: now, alerts: store.bundle?.alerts ?? [])
    }
    private var segments: [Segment] {
        model.isOn("place:greenway") ? model.segments.map(\.segment) : []
    }
    private var parks: [Park] {
        guard model.isOn("place:parks") else { return [] }
        return (store.bundle?.parks ?? []).sorted { $0.name < $1.name }
    }
    private var sources: String {
        (store.bundle?.transitLayers ?? []).filter { model.isOn("go:" + $0.id) }
            .map { "\($0.source.name) (\(L.t("map.layer_license", ["name": $0.source.license])), \(prettyDate($0.source.fetchedAt)))" }
            .joined(separator: " · ")
    }
}

// MARK: - getting around

/// Trip planners, fares, free rides, phone numbers, the MoGo pass and the Transit app link-out: what the web's Map
/// tab shows under its map (apps/web/src/transit.ts), here in the map's list. The same in both map styles. Every
/// link names its owner and opens in the browser; nothing about the rider goes with it, and nothing here is live.
/// The same panels on a sheet of their own, opened by the labelled "Getting around" row at the foot of the Map
/// tab (audit H3). Nothing on it is live and nothing about a rider goes anywhere.
struct GettingAroundSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView { VStack(alignment: .leading, spacing: 10) { GettingAround() }.padding(16) }
                .background(Color.appBg)
                .navigationTitle(L.t("transit.head")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L.t("map.done")) { dismiss() } } }
        }
    }
}

struct GettingAround: View {
    private let facts = TransitFacts.current
    var body: some View {
        SectionHead(text: L.t("transit.head"))
        Text(L.t("transit.lede")).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        ForEach(facts.sections) { section in
            VStack(alignment: .leading, spacing: 10) {
                // What an owner says about its own service is its own words: English, like a listing.
                Text(section.title).font(.body.weight(.semibold)).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                if let body = section.body {
                    Text(body).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                }
                ForEach(section.facts) { fact in
                    Label { Text(fact.text).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true) }
                        icon: { Image(systemName: symbol(fact.icon)).foregroundStyle(Color.brand).accessibilityHidden(true) }
                }
                ForEach(section.phones) { CallRow(label: $0.label, number: $0.number) }
                ForEach(section.links) { OwnerLink(link: $0) }
            }
            .environment(\.locale, Locale(identifier: "en_US"))
            .card()
        }
        SectionHead(text: L.t("rec.bike"))
        VStack(alignment: .leading, spacing: 10) {
            Text(facts.bike.body).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            OwnerLink(link: facts.bike.link)
        }.card()
        Text(L.t("transit.checked", ["date": prettyDate(facts.checked)]))
            .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
    }
    private func symbol(_ icon: String) -> String {
        switch icon {
        case "ticket": return "ticket"
        case "people": return "person.2"
        default: return "checkmark.circle"
        }
    }
}
