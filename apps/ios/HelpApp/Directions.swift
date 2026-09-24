// Our own directions, computed on this phone (DECISIONS 2026-09-22). The Swift half of apps/web/src/dirscreen.ts,
// apps/web/src/dirfiles.ts and apps/web/src/dirworker.ts.
//
// **The screen is traceless.** Nothing about the trip is written anywhere: not the destination, not the origin,
// not the plan. The origin is worse than the destination and is treated as such — it lives in `Here` for as long
// as the app is open, it is passed to `plan()` and to nothing else, and it is never written down and never sent.
// The two people this was built for are a survivor with no phone service and a person with no signal looking for
// food; where they are standing is the one fact that must never leave the device. The privacy shield still covers
// this screen like every other (Views.swift).
//
// **The words are the contract.** Every sentence comes from HelpCore/DirWords.swift, which the spec's wording
// rules are written into: the estimate is a range, a headway is only ever the agency's own sentence, nothing is
// called safe or accessible, and the last leg ends at the street.
//
// **Nothing here touches the network** beyond the ordinary map-file read: the files are checked against the
// checksum in the **signed** index before a byte of them is decoded, exactly as the map's own files are, and on a
// phone that has opened the Map tab once they are already here. No routing service is ever contacted.
import DetroitQuery
import HelpCore
import SwiftUI

/// Where a trip is going. It is a value on a navigation stack and nothing more — never a URL, never a file.
struct DirDestination: Hashable {
    var lat: Double
    var lon: Double
    var name: String
    var point: LatLon { LatLon(lat: lat, lon: lon) }
}

/// The destination a row may be routed to, or nil. A sensitive listing — a domestic-violence shelter, a
/// mental-health crisis line — carries no coordinate in the first place and is never routed to at all (docs/08).
func dirDestination(name: String, lat: Double?, lon: Double?, category: String = "") -> DirDestination? {
    guard let lat, let lon, !isSensitive(category) else { return nil }
    return DirDestination(lat: lat, lon: lon, name: name)
}

// MARK: - the graph, built once per bundle, off the main actor

/**
 The street graph and the transit network.

 Building the graph is one to two seconds on a cheap phone (DECISIONS 2026-09-22), and a phone that has to think
 for a second must not stop answering the person's thumb while it does — so it happens off the main actor, once
 per bundle, and the screen says "Getting the map ready… (about a second)" meanwhile. `StreetGraphCache` keys it
 by the map files' own sha256, which is a fact about a file and never about a person.
 */
@MainActor
@Observable
final class DirPlanner {
    static let shared = DirPlanner()

    private(set) var built = false
    /// True when this phone holds bus data to plan on. An empty network is a real answer, not a failure: the
    /// planner still ranks walking, which is the leg that matters most to the two people this was built for.
    private(set) var hasTransit = false
    /// The street files are not on this phone at all. The screen says to open the Map tab once with a signal.
    private(set) var noFiles = false
    private var graph: StreetGraph?
    private var network: TransitNetwork?
    /// The build in flight. A second screen that asks while it runs waits for it rather than being told "not
    /// built", and no screen leaving can cancel it (HelpCore/OneRun.swift).
    private let run = OneRun()

    /// The map files, then the graph. Safe to call as often as a screen likes; it does the work once, and a call
    /// made while the work runs returns when it has finished.
    func build(from store: BundleStore) async {
        guard !built else { return }
        await run.run { [self] in await load(from: store) }
    }

    private func load(from store: BundleStore) async {
        guard !built else { return }
        guard let baseSrc = store.mapSource("map/base.json") else { noFiles = true; return }
        let cellsSrc = store.mapSource("map/streets.json")
        do {
            // `map/base.json` first, then each cell of `map/streets.json` by its key, sorted. **The order is
            // part of the contract** — node numbering follows it — so the graph this phone builds is the graph
            // the fixtures describe (dirfiles.ts, `streetFiles`).
            struct Cells: Decodable, Sendable { var cells: [String: PackedStreets] }
            let base = try await MapLoader.shared.decoded(baseSrc, as: PackedStreets.self)
            var files = [base]
            var key = baseSrc.sha256
            if let cellsSrc, let cells = try? await MapLoader.shared.decoded(cellsSrc, as: Cells.self) {
                files += cells.cells.keys.sorted().compactMap { cells.cells[$0] }
                key += ":" + cellsSrc.sha256
            }
            let layers = await transitLayers(from: store)
            let g = await StreetGraphCache.shared.graph(key) { buildStreetGraph(files, key: key) }
            let net = await Task.detached(priority: .userInitiated) { buildTransitNetwork(layers) }.value
            graph = g
            network = net
            hasTransit = !net.stops.isEmpty
            built = true
            noFiles = false
        } catch {
            // A bundle that has never been held is the one case the screen cannot route around.
            noFiles = true
        }
    }

    /**
     Every transit layer that can be planned on: a routes `.net.json` paired with its own stops layer and, where
     the two are different files, the stops' `serves` list. This is the same pairing the shared routing test does
     (`RoutingRealTests`), so the phone plans on exactly what the fixtures plan on.

     A layer whose files are not here is simply left out. Walking is never left out.
     */
    private func transitLayers(from store: BundleStore) async -> [DetroitQuery.TransitLayer] {
        /// What a `.net.json` says about itself. A stops `.net.json` carries no `routes` and is reached through
        /// the routes file that names it.
        struct Head: Decodable, Sendable {
            var id: String
            var stopsLayer: String?
            var hasRoutes: Bool
            enum CodingKeys: String, CodingKey { case id, stopsLayer = "stops_layer", routes }
            init(from decoder: Decoder) throws {
                let c = try decoder.container(keyedBy: CodingKeys.self)
                id = try c.decodeIfPresent(String.self, forKey: .id) ?? ""
                stopsLayer = try c.decodeIfPresent(String.self, forKey: .stopsLayer)
                hasRoutes = c.contains(.routes)
            }
        }
        var out: [DetroitQuery.TransitLayer] = []
        let netFiles = store.bundle?.netFiles ?? [:]
        let meta = store.bundle?.transitLayers ?? []
        for layer in netFiles.keys.sorted() {
            guard let file = netFiles[layer], let src = store.mapSource(file),
                  let head = try? await MapLoader.shared.decoded(src, as: Head.self), head.hasRoutes else { continue }
            let stopsId = head.stopsLayer ?? (head.id.isEmpty ? layer : head.id)
            guard let stopsMeta = meta.first(where: { $0.id == stopsId }), let stopsSrc = store.mapSource(stopsMeta.file),
                  let stops = try? await MapLoader.shared.decoded(stopsSrc, as: PackedPoints.self),
                  let routes = try? await MapLoader.shared.decoded(src, as: PackedRoutes.self) else { continue }
            var serves: PackedServes?
            if stopsId != layer, let servesFile = netFiles[stopsId], let servesSrc = store.mapSource(servesFile) {
                serves = try? await MapLoader.shared.decoded(servesSrc, as: PackedServes.self)
            }
            out.append(DetroitQuery.TransitLayer(stops: stops, routes: routes, serves: serves))
        }
        return out
    }

    /// Up to three ways to get there, in the planner's own rank order. Off the main actor: an A* across forty
    /// thousand edges is not work a screen does while a finger is on it.
    func plan(from: LatLon, to: LatLon) async -> [Itinerary] {
        guard let g = graph, let net = network else { return [] }
        return await Task.detached(priority: .userInitiated) { DetroitQuery.plan(g, net, from: from, to: to) }.value
    }

    /// For a new bundle: yesterday's graph says nothing about today's streets.
    func forget() {
        graph = nil; network = nil; built = false; hasTransit = false; noFiles = false
    }
}

// MARK: - the screen

/**
 The Directions screen: where you are, the ways to get there, and then the numbered steps, which are what the
 screen actually promises. The map is the extra.
 */
struct DirectionsView: View {
    let to: DirDestination
    @EnvironmentObject private var store: BundleStore
    @EnvironmentObject private var here: Here
    @Environment(MapModel.self) private var map
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var planner = DirPlanner.shared
    @State private var phase: DirPhase = .needOrigin
    @State private var plans: [Itinerary] = []
    /// -1 is the list of ways; otherwise the index in `plans`.
    @State private var chosen = -1
    @State private var steps: [DirStep] = []
    /// Follow-along: which step is current, -1 for none.
    @State private var stepAt = -1
    @State private var offRoute = false
    @State private var following = false
    /// The origin and destination the plans on screen belong to. Memory only, like everything else here.
    @State private var planFor = ""
    @State private var follower = DirFollower()

    private var t: Say { { key, p in L.t(key, p) } }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 12) {
            head
            switch phase {
            case .needOrigin:
                // The cross-street field comes first here, and on no other screen: it is the only one of the
                // three that works with no signal at all, and this screen is the one a person with no signal is
                // on (DECISIONS 2026-09-22).
                SectionHead(text: L.t("dir.from_head"))
                Text(L.t("dir.from_hint")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                LocationChip(crossFirst: true)
            case .loading, .building, .planning:
                originLine
                banner(L.t(phase == .planning ? "dir.planning" : "dir.building"), warn: false)
            case .noFiles:
                originLine
                banner(L.t("dir.no_streets"), warn: true)
            case .failed:
                originLine
                banner(L.t("dir.failed"), warn: true)
                retryButton(L.t("dir.retry"))
            case .empty:
                originLine
                Text(L.t("dir.none")).foregroundStyle(Color.muted).card()
            case .ready:
                originLine
                if chosen < 0 { ways } else { chosenWay }
            }
            caveats
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("dir.title")).navigationBarTitleDisplayMode(.inline)
        .urgentHelp()
        .task(id: originKey) { await begin() }
        .onDisappear {
            // Leaving the screen. The graph stays — it cost a second to build and belongs to the bundle, not to
            // the trip; the trip does not.
            follower.stop()
            following = false
            plans = []; steps = []; chosen = -1; stepAt = -1; offRoute = false; planFor = ""
        }
    }

    // MARK: the head, and the caveats that are on every state

    private var head: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 0) {
                Text(L.t("dir.to")).font(.body).foregroundStyle(Color.muted)
                // The place's own name, as its owner wrote it.
                Text(L.rightToLeft ? ltr(to.name) : to.name).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The pair of caveats is on **every** state of this screen, including the one that is still thinking: a
    /// person must never read a step before they have read what the steps are not.
    private var caveats: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L.t("dir.caveat")).font(.footnote).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            Text(L.t("dir.caveat_times")).font(.footnote).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    /// Where this trip starts, in words, and the way back to changing it. **Never a coordinate, ever.**
    private var originLine: some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.brand).accessibilityHidden(true)
            Text(fromWords).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button(L.t("dir.change_start")) { restart() }
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line, lineWidth: 1))
    }
    private var fromWords: String {
        switch here.originKind {
        case .me: return L.t("dir.from_me")
        case .zip: return L.t("dir.from_zip", ["zip": here.zip ?? ""])
        case .cross: return L.t("dir.from_here", ["where": ""]) + (here.cross ?? "")
        case .none: return L.t("dir.from_head")
        }
    }

    private func banner(_ text: String, warn: Bool) -> some View {
        Text(text).font(.subheadline).foregroundStyle(warn ? Color.warnInk : Color.ink)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(warn ? Color.warnBg : Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
            .fixedSize(horizontal: false, vertical: true)
    }
    private func retryButton(_ title: String) -> some View {
        Button(title) { Task { planner.forget(); planFor = ""; await begin() } }
            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
    }

    // MARK: the ways to get there

    /// Up to three, in the planner's own rank order, each one a card that is also a button.
    private var ways: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHead(text: L.t("dir.ways_head"))
            ForEach(Array(plans.enumerated()), id: \.offset) { i, it in
                Button { choose(i) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(itineraryTitle(t, it)).font(.headline).foregroundStyle(Color.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Text([legsLine(t, it), rangeWords(t, it), headwayWords(t, it)]
                            .filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(L.t("dir.choose")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("dir.choose_label", ["summary": dirSummary(t, it)]))
            }
            if !planner.hasTransit {
                Text(L.t("dir.walk_only")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: the chosen way

    private var chosenWay: some View {
        let it = plans[chosen]
        let route = drawnRoute(it, destination: to.name, active: stepAt >= 0 ? (steps[safe: stepAt]?.leg ?? -1) : -1, t: t)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(itineraryTitle(t, it)).font(.title3.bold()).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Pill(text: rangeWords(t, it))
            }
            .accessibilityElement(children: .combine)
            RouteMapView(route: route, base: map.base, me: follower.at ?? here.point)
            HStack(spacing: 10) {
                Button(L.t("dir.other_ways")) { chosen = -1; stopFollowing() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                Spacer(minLength: 8)
                Button(L.t(following ? "dir.follow_stop" : "dir.follow")) { toggleFollowing() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                    .accessibilityAddTraits(following ? [.isSelected] : [])
            }
            if offRoute {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("dir.off_route")).font(.subheadline).foregroundStyle(Color.warnInk)
                        .fixedSize(horizontal: false, vertical: true)
                    // There is no rerouting here and there is not going to be: a phone that quietly changes the
                    // route under a person walking down a street at night is worse than one that says so and
                    // waits to be asked.
                    retryButton(L.t("dir.plan_again"))
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
            }
            SectionHead(text: L.t("dir.steps_head"))
            // The numbered list is the source of truth for the whole screen: every step is a real element, in
            // order, and the current one carries the trait a screen reader reads as "current".
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                    HStack(alignment: .top, spacing: 12) {
                        Text(String(i + 1)).font(.subheadline.weight(.bold)).foregroundStyle(Color.brandSoftInk)
                            .frame(width: 28, height: 28).background(Color.brandSoft, in: Circle())
                            .accessibilityHidden(true)
                        // A street name is Latin and reads left to right in every language.
                        Text(L.rightToLeft ? ltr(s.text) : s.text)
                            .font(.body).foregroundStyle(Color.ink)
                            .fontWeight(i == stepAt ? .semibold : .regular)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(L.t("dir.follow_say", ["n": String(i + 1), "total": String(steps.count), "text": s.text]))
                    .accessibilityAddTraits(i == stepAt ? [.isSelected] : [])
                    if i < steps.count - 1 { Divider().overlay(Color.line) }
                }
            }
            .padding(.horizontal, 14)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        }
    }

    // MARK: the work

    /// Changes whenever the trip changes: a new origin, a new destination.
    private var originKey: String {
        guard let p = here.point else { return "" }
        return String(format: "%.5f,%.5f>%.5f,%.5f", p.lat, p.lon, to.lat, to.lon)
    }

    private func begin() async {
        guard here.point != nil else { phase = .needOrigin; plans = []; chosen = -1; planFor = ""; stopFollowing(); return }
        if planFor == originKey, phase == .ready { return }
        if !planner.built {
            phase = .loading
            say(L.t("dir.building"))
            phase = .building
            await planner.build(from: store)
        }
        if planner.noFiles { phase = .noFiles; say(L.t("dir.no_streets")); return }
        guard planner.built, let from = here.point else { phase = .failed; say(L.t("dir.failed")); return }
        phase = .planning
        let found = await planner.plan(from: from, to: to.point)
        plans = found
        planFor = originKey
        chosen = -1; steps = []; stepAt = -1; offRoute = false
        phase = found.isEmpty ? .empty : .ready
        say(found.isEmpty ? L.t("dir.none")
            : L.t(found.count == 1 ? "dir.said_one_plan" : "dir.said_plans", ["count": String(found.count)]))
    }

    private func choose(_ i: Int) {
        chosen = i
        stepAt = -1
        offRoute = false
        steps = dirSteps(t, plans[i], destination: to.name)
        say(L.t("dir.chose_say", ["summary": dirSummary(t, plans[i])]))
    }

    /// "Change the start" throws the plan away and asks again, with the cross-street field open and first.
    private func restart() {
        here.forget()
        plans = []; steps = []; chosen = -1; stepAt = -1; offRoute = false; planFor = ""
        stopFollowing()
        phase = .needOrigin
    }

    // MARK: following along
    //
    // The whole of the logic is: which step is nearest, and are we further than 120 m from the line. There is no
    // rerouting, by design.

    private func toggleFollowing() {
        if following { stopFollowing(); say(L.t("dir.follow_off_say")); return }
        guard chosen >= 0 else { return }
        following = true
        let it = plans[chosen]
        follower.start { p in
            let wasStep = stepAt, wasOff = offRoute
            offRoute = metresFromRoute(p, legPolylines(it)) > offRouteMetres
            stepAt = currentStep(p, it, steps)
            guard stepAt != wasStep || offRoute != wasOff else { return }
            say(offRoute ? L.t("dir.off_route")
                : L.t("dir.follow_say", ["n": String(stepAt + 1), "total": String(steps.count),
                                         "text": steps[safe: stepAt]?.text ?? ""]))
        }
        say(L.t("dir.follow_on_say"))
    }

    private func stopFollowing() {
        follower.stop()
        following = false
        stepAt = -1
        offRoute = false
    }

    private func say(_ s: String) { AccessibilityNotification.Announcement(s).post() }
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

// MARK: - the map the route is drawn on

/// The Canvas map of one trip: our own streets, the route over them, and the four markers. It is an extra — the
/// numbered steps below it say the same thing in words, and the map's own accessibility label is `dir.route_text`.
struct RouteMapView: View {
    let route: DrawnRoute
    let base: BaseMap?
    let me: LatLon?
    @Environment(\.accessibilityReduceTransparency) private var plainBackgrounds
    /// **The camera is derived, not remembered.** It is the box round this trip, worked out from the size the
    /// layout gives us — so the map is fitted on the very first frame it draws, with no `onAppear` to miss and
    /// no state to reset. Only a finger overrides it, and only until the trip changes.
    @State private var moved: MapCamera?
    @State private var movedFor = ""
    @State private var lastDrag: CGSize = .zero
    @State private var lastPinch: CGFloat = 1

    /// The whole trip as one box, in map units — the legs are already projected, so nothing is converted twice.
    private var box: MapBox {
        route.legs.reduce(MapBox.empty) { $0.union(MapBox.around($1.points)) }
    }
    /// What changes when the trip does.
    private var tripKey: String { "\(route.legs.count):\(route.marks.count):\(box.minX),\(box.minY),\(box.maxX),\(box.maxY)" }

    private func fitted(_ size: CGSize) -> MapCamera {
        let b = box
        guard !b.isEmpty, size.width > 1, size.height > 1 else {
            return MapCamera.fitting([mapAnchor], width: max(size.width, 1), height: max(size.height, 1), minMeters: 500)
        }
        // At least 500 m across, and a margin, exactly as `MapCamera.fitting` gives every other map.
        let least = 500 / MapProjection.metersPerUnit
        let spanX = max(b.width, least) * 1.18, spanY = max(b.height, least) * 1.18
        let scale = min(size.width / spanX, size.height / spanY)
        return MapCamera(centerX: b.centerX, centerY: b.centerY, scale: scale,
                         width: size.width, height: size.height).clamped()
    }

    var body: some View {
        GeometryReader { geo in
            let camera = (movedFor == tripKey ? moved : nil)?.resized(width: geo.size.width, height: geo.size.height).clamped()
                ?? fitted(geo.size)
            Canvas(opaque: false, rendersAsynchronously: false) { ctx, size in
                MapPainter.draw(MapScene(camera: camera.resized(width: size.width, height: size.height),
                                         base: base, drawParks: true, me: me, route: route,
                                         plainColors: plainBackgrounds),
                                into: ctx, size: size)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    moved = camera.panned(dx: v.translation.width - lastDrag.width, dy: v.translation.height - lastDrag.height)
                    movedFor = tripKey
                    lastDrag = v.translation
                }
                .onEnded { _ in lastDrag = .zero })
            .simultaneousGesture(MagnifyGesture(minimumScaleDelta: 0)
                .onChanged { v in
                    let mid = CGPoint(x: v.startLocation.x + lastDrag.width, y: v.startLocation.y + lastDrag.height)
                    moved = camera.zoomed(by: v.magnification / lastPinch, aroundX: mid.x, y: mid.y)
                    movedFor = tripKey
                    lastPinch = v.magnification
                }
                .onEnded { _ in lastPinch = 1 })
        }
        // Arabic mirrors the words around it; the map does not, or Detroit is back to front.
        .environment(\.layoutDirection, .leftToRight)
        .frame(height: 260)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        // The picture's text equivalent (WCAG 1.1.1). The numbered steps below are the detail.
        .accessibilityElement()
        .accessibilityLabel(route.text)
    }
}
