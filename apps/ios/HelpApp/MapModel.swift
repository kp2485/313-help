// What the Map tab knows: where the camera is, which layers are on, which shapes have arrived, and what is
// selected. The rules and the arithmetic are in HelpCore (MapData.swift, MapLayers.swift), where `swift test`
// runs them; this file is the part that has to live on a phone.
//
// Nothing here is about a person. The layer choice is a file on this phone, the camera is memory only, and a
// location — if the person taps for one — is held in memory by `Here` and never written down or sent.
import DetroitQuery
import Foundation
import HelpCore
import OSLog
import SwiftUI

// MARK: - reading the files, off the main actor

/// Reads and decodes the big map files away from the screen, and keeps what it decoded. A third of a megabyte of
/// JSON on the main actor is a dropped frame on a cheap phone.
///
/// Each file is checked against the checksum in the **signed** index before it is decoded, wherever it came from:
/// the verified copy on this phone, the snapshot shipped inside the app, or the published origin, in that order.
/// A file that does not match is not used — it is never "close enough".
actor MapLoader {
    static let shared = MapLoader()

    private var baseMaps: [String: BaseMap] = [:]
    private var layers: [String: MapLayerData] = [:]

    enum Failure: Error { case missing, badChecksum }

    /// The city itself. `streets` may be nil or unreadable: the map then draws the big roads only, which is still
    /// a map. The key is both files' checksums, so a new bundle is decoded again and an old one is not.
    func baseMap(_ base: MapFileSource, streets: MapFileSource?) async throws -> BaseMap {
        let key = base.sha256 + ":" + (streets?.sha256 ?? "")
        if let held = baseMaps[key] { return held }
        let baseData = try await bytes(base)
        var streetData: Data?
        if let streets { streetData = try? await bytes(streets) }   // no small streets is a poorer map, not no map
        let map = try MapFileDecoder.baseMap(base: baseData, streets: streetData)
        baseMaps = [key: map]                       // one city at a time; an old bundle's copy is dropped
        return map
    }

    func layer(_ src: MapFileSource) async throws -> MapLayerData {
        let key = src.name + ":" + src.sha256
        if let held = layers[key] { return held }
        let data = try await bytes(src)
        let decoded = try MapFileDecoder.layer(data)
        layers[key] = decoded
        return decoded
    }

    /// A network file of the subway style (`map/transit/<id>.net.json`), checked against the signed index like
    /// every other map file **before** it is decoded, then prepared for all three zoom bands — here, off the main
    /// actor, once per bundle version. A file this app cannot read throws, and the layer goes on drawing `standard`.
    private var nets: [String: PreparedNet] = [:]
    private var servesFiles: [String: TransitServes] = [:]
    func net(_ src: MapFileSource) async throws -> PreparedNet {
        let key = src.name + ":" + src.sha256
        if let held = nets[key] { return held }
        let prepared = PreparedNet(try MapFileDecoder.net(try await bytes(src)))
        nets[key] = prepared
        return prepared
    }
    func serves(_ src: MapFileSource) async throws -> TransitServes {
        let key = src.name + ":" + src.sha256
        if let held = servesFiles[key] { return held }
        let decoded = try MapFileDecoder.netServes(try await bytes(src))
        servesFiles[key] = decoded
        return decoded
    }

    /// The neighborhood numbers (`indicators/neighborhoods.json`, docs/13). It is not a map file, but it is read
    /// exactly like one and for the same reasons: a quarter of a megabyte of JSON, wanted only when one tab is
    /// opened, and believed only once its bytes match the checksum in the **signed** index. Decoding it here
    /// keeps it off the main actor, so the tab does not stutter while 205 neighborhoods arrive.
    private var indicatorFiles: [String: Indicators] = [:]
    func indicators(_ src: MapFileSource) async throws -> Indicators {
        let key = src.name + ":" + src.sha256
        if let held = indicatorFiles[key] { return held }
        let decoded = try HoodsFile.decode(try await bytes(src), sha256: src.sha256)
        indicatorFiles = [key: decoded]             // one bundle's numbers at a time
        return decoded
    }

    /// One map file, checked against the **signed** index and then decoded here, off the main actor, as whatever
    /// the caller asks for. The Directions screen reads the street files and the transit networks this way, so
    /// they go through exactly the check every other map file goes through, and a phone that has opened the Map
    /// tab once already holds them (DECISIONS 2026-09-22: offline directions cost no new bytes).
    func decoded<T: Decodable & Sendable>(_ src: MapFileSource, as type: T.Type) async throws -> T {
        try directionsDecoder().decode(T.self, from: try await bytes(src))
    }

    /// Frees everything but what is still switched on, when iOS says memory is short.
    func forgetEverything() { baseMaps = [:]; layers = [:]; nets = [:]; servesFiles = [:]; indicatorFiles = [:] }

    private func readLocal(_ src: MapFileSource) throws -> Data {
        for url in [src.cache, src.snapshot].compactMap({ $0 }) {
            guard let d = try? Data(contentsOf: url) else { continue }
            guard BundleCheck.sha256Hex(d) == src.sha256 else { continue }   // a stale cache is simply not used
            return d
        }
        throw Failure.missing
    }

    private func bytes(_ src: MapFileSource) async throws -> Data {
        if let local = try? readLocal(src) { return local }
        guard let remote = src.remote else { throw Failure.missing }
        var req = URLRequest(url: remote)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.httpShouldHandleCookies = false
        let (data, res) = try await Net.session.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw Failure.missing }
        guard BundleCheck.sha256Hex(data) == src.sha256 else { throw Failure.badChecksum }
        // Kept beside the rest of the verified copy, so the next open needs no signal.
        try? FileManager.default.createDirectory(at: src.cache.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: src.cache, options: [.atomic, .completeFileProtection])
        return data
    }
}

// MARK: - what is on the map, and what is selected

/// A greenway stretch, ready to draw and to tap: its lines projected once, and the box they sit in.
struct DrawnSegment: Identifiable, Equatable {
    var segment: Segment
    var lines: [[Double]]
    var box: MapBox
    var id: String { segment.id }
    init(_ segment: Segment) {
        self.segment = segment
        lines = MapFileDecoder.segmentLines(segment)
        box = lines.reduce(MapBox.empty) { $0.union(MapBox.around($1)) }
    }
}

/// One of our own listings as a dot on the map. Sensitive and private listings never become one of these
/// (`mapDrawable`, HelpCore/MapLayers.swift).
struct DrawnDot: Identifiable, Equatable {
    var id: String
    var name: String
    var group: String
    var phone: String?
    var x: Double
    var y: Double
}

/// What a tap found. Every one of these is also a row in "See this map as a list", so nothing on this tab is
/// reachable only by looking at a picture.
enum MapSelection: Identifiable, Hashable {
    case segment(String)
    case listing(String)
    case park(String)
    /// A city or neighbourhood outline (`place:areas`). It carries no listing and no number — the card is a
    /// name, whose area it is, and the way to its page.
    case area(String)
    /// A stop or a route on a switched-on transport layer: its own name, and the layer's name in words.
    case stop(name: String, layer: String)
    case route(name: String, layer: String)
    // -- the subway style only (docs/MAP-STYLE.md section 9). `layer` is the bundle's id ("ddot_routes").
    /// One route, by its `rt_` id: drawn last and bright, with every other transit line at 35 %.
    case line(layer: String, route: String)
    /// A street more than four routes share. The card lists them, and each is a button.
    case trunk(layer: String, routes: [String])
    /// A stop or station, by its number in the stops layer.
    case station(layer: String, index: Int)
    case interchange(layer: String, index: Int)
    case hub(String)

    var id: String {
        switch self {
        case .segment(let s): return "seg:" + s
        case .listing(let s): return "row:" + s
        case .park(let s): return "park:" + s
        case .area(let s): return "area:" + s
        case .stop(let n, let l): return "stop:" + l + ":" + n
        case .route(let n, let l): return "route:" + l + ":" + n
        case .line(let l, let r): return "line:" + l + ":" + r
        case .trunk(let l, let r): return "trunk:" + l + ":" + r.joined(separator: ",")
        case .station(let l, let i): return "station:" + l + ":\(i)"
        case .interchange(let l, let i): return "change:" + l + ":\(i)"
        case .hub(let n): return "hub:" + n
        }
    }
}

/// Where a tap on a row in the map's own list, or on the "Open" button in the card, goes next.
enum MapRoute: Hashable {
    case segment(String)
    case listing(String)
    case greenway
    /// A city or neighbourhood page (docs/13).
    case area(String)
    /// Our own directions to a place on the map (DECISIONS 2026-09-22).
    case directions(DirDestination)
}

// MARK: - the model

@MainActor
@Observable
final class MapModel {
    // -- camera
    var camera = MapCamera(centerX: 0, centerY: 0, scale: MapCamera.minScale, width: 1, height: 1)
    private var everMoved = false

    // -- what has arrived
    private(set) var base: BaseMap?
    private(set) var baseFailed = false
    private(set) var layerData: [String: MapLayerData] = [:]
    private(set) var layerFailed: Set<String> = []
    private var asking: Set<String> = []

    // -- what is switched on, remembered on this phone only
    private let store = MapLayerStore(dir: DeviceState.dir)
    private(set) var layersOn: [String]

    // -- what is selected
    var selection: MapSelection?
    /// Bumped on every selection, so `.sensoryFeedback` can tell a new tap from a redraw.
    private(set) var selectionCount = 0

    /// The greenway, projected once. Rebuilt only when the bundle changes.
    private(set) var segments: [DrawnSegment] = []
    private var segmentsKey = ""

    // -- how the transport layers are drawn (docs/MAP-STYLE.md). `standard` is the default; the choice lives in the
    // same excluded-from-backup file as the layer list, is never sent, and is never in a report.
    private(set) var style: MapStyleChoice
    // -- table or chart on a neighborhood's year panels (docs/13, 2026-09-22). Not about the map, but the same
    // kind of fact — a way of showing something, chosen on this phone — so it lives in the same excluded-from-
    // backup file, is never sent, and is never in a report. It is here because this is the object every screen
    // already has, and there is one choice for the whole app.
    private(set) var hoodView: HoodViewChoice
    /// The zoom band, with its 5 % hysteresis, so a pinch hovering on an edge does not flicker.
    private(set) var band: ZoomBand = .far
    private(set) var nets: [String: PreparedNet] = [:]
    private(set) var serves: [String: TransitServes] = [:]
    private(set) var netFailed: Set<String> = []
    private(set) var netAsking: Set<String> = []
    /// What the last frame drew, so a tap lands on what a person sees (MapSubway.swift). Not observed.
    @ObservationIgnored let board = SubwayBoard()
    @ObservationIgnored var lastSubwayTap: (at: CGPoint, hit: String)?

    init() { layersOn = store.on; style = store.style; hoodView = store.hoodView }

    // MARK: the style
    /// Applies at once. Nothing already held is loaded again; `subway` asks for the network files it needs
    /// (`loadNets`), and until one arrives that layer goes on drawing `standard`.
    func setStyle(_ next: MapStyleChoice) {
        guard next != style else { return }
        store.setStyle(next)
        style = next
        if next == .standard, isSubwaySelection { selection = nil }
    }
    /// Applies at once, to every year panel on every neighborhood page.
    func setHoodView(_ next: HoodViewChoice) {
        guard next != hoodView else { return }
        store.setHoodView(next)
        hoodView = next
    }

    private var isSubwaySelection: Bool {
        switch selection {
        case .line, .trunk, .station, .interchange, .hub: return true
        default: return false
        }
    }
    /// The route that is selected, if one is: (layer, index in that network's file).
    func selectedRoute() -> (layer: String, index: Int)? {
        guard case .line(let layer, let id) = selection, let net = nets.first(where: { $0.value.net.id == layer })?.value.net,
              let i = net.routes.firstIndex(where: { $0.id == id }) else { return nil }
        return (layer, i)
    }

    // MARK: layers
    func isOn(_ id: String) -> Bool { layersOn.contains(id) }
    func toggle(_ id: String) {
        store.toggle(id)
        layersOn = store.on
        layerFailed.remove(id)
    }
    #if DEBUG
    func setLayers(_ ids: [String]) { store.set(ids); layersOn = store.on }
    func stage(_ p: LatLon, metersPerPoint: Double) {
        everMoved = true
        let q = MapProjection.point(p)
        camera = MapCamera(centerX: q.x, centerY: q.y, scale: MapProjection.metersPerUnit / metersPerPoint,
                           width: max(camera.width, 2), height: max(camera.height, 2)).clamped()
        band = zoomBand(metersPerPoint: camera.metersPerPoint)
    }
    #endif
    /// The top-level categories the switched-on help layers cover.
    var switchedOnTops: [String] { mapGroups.filter { isOn("help:" + $0.id) }.flatMap(\.tops) }

    // MARK: the camera

    /// Where the map OPENS: a point already known (allowed earlier, or the centre of a typed ZIP) or, with none,
    /// nothing at all — and then `openingView` hands back the civic anchor (HelpCore/Locate.swift). Set by the
    /// screen before the first layout. It is a view, not a person: nothing here is written down or sent.
    var openAt: LatLon?

    /// The camera the tab opens at, for a box of this size. Pure, and the same on all three clients.
    func openingCamera(width: Double, height: Double) -> MapCamera {
        let v = openingView(openAt)
        return MapCamera.forRadius(v.center, radiusMeters: v.radiusMeters, width: width, height: height)
    }

    func resize(_ size: CGSize) {
        guard size.width > 1, size.height > 1 else { return }
        if !everMoved || camera.width <= 1 {
            camera = openingCamera(width: size.width, height: size.height)
        } else {
            camera = camera.resized(width: size.width, height: size.height).clamped()
        }
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }
    func zoom(_ factor: Double, at point: CGPoint? = nil) {
        stopMotion()
        everMoved = true
        camera = point.map { camera.zoomed(by: factor, aroundX: $0.x, y: $0.y) } ?? camera.zoomed(by: factor)
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }
    /// A zoom measured from the camera a gesture started at, not from wherever it has got to: the double tap held
    /// and dragged, which must come back to exactly where it began when the finger comes back.
    func zoom(_ factor: Double, from base: MapCamera, at point: CGPoint) {
        everMoved = true
        camera = base.zoomed(by: factor, aroundX: point.x, y: point.y)
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }
    func pan(dx: Double, dy: Double) {
        stopMotion()
        everMoved = true
        camera = camera.panned(dx: dx, dy: dy)
    }
    /// Two fingers: zoom and pan in one step, so the place under them stays under them while the hand also
    /// slides. `HelpCore.MapCamera.pinched` is the whole of it; this only remembers that the map has been moved.
    func pinch(_ factor: Double, fromX ax: Double, y ay: Double, toX bx: Double, y by: Double) {
        everMoved = true
        camera = camera.pinched(by: factor, fromX: ax, y: ay, toX: bx, y: by)
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }

    // MARK: movement that carries on after the finger has gone
    //
    // A Canvas redraws from `camera`, which is a struct of plain numbers: `withAnimation` has nothing to
    // interpolate there, so both the fling and the eased double-tap zoom are stepped here, frame by frame. Both
    // stop the moment anything touches the map, and neither is ever started under Reduce Motion — the screen
    // asks first and simply jumps instead (WCAG 2.3.3).
    @ObservationIgnored private var motion: Task<Void, Never>?
    var isMoving: Bool { motion != nil }
    /// A finger down, a zoom button, a row from the list: whatever it is, the map stops where it is.
    func stopMotion() {
        motion?.cancel()
        motion = nil
    }
    /// Momentum after a drag. `vx`/`vy` are points per second, straight from the drag gesture's own `velocity`.
    func fling(vx: Double, vy: Double) {
        stopMotion()
        var left = MapFling(vx: vx, vy: vy)
        guard left.worthStarting else { return }
        everMoved = true
        motion = frames { [weak self] dt in
            guard let self else { return false }
            let r = left.step(self.camera, seconds: dt)
            self.camera = r.camera
            left = r.fling
            return !r.done
        }
    }
    /// A double tap, or a two-finger tap: the same zoom either way, eased over a fifth of a second so the eye can
    /// follow where the map went. `animated` is false under Reduce Motion, and then it simply happens.
    func zoom(_ factor: Double, at point: CGPoint, animated: Bool) {
        stopMotion()
        guard animated else { zoom(factor, at: point); return }
        let from = camera
        var done = 0.0
        everMoved = true
        motion = frames { [weak self] dt in
            guard let self else { return false }
            done = min(1, done + dt / 0.2)
            let eased = 1 - pow(1 - done, 3)
            self.camera = from.zoomed(by: pow(factor, eased), aroundX: point.x, y: point.y)
            self.band = zoomBand(metersPerPoint: self.camera.metersPerPoint, previous: self.band)
            return done < 1
        }
    }
    /// One loop, about sixty times a second, until the step says it is finished or anything cancels it.
    @ObservationIgnored private var motionNo = 0
    private func frames(_ step: @escaping @MainActor (Double) -> Bool) -> Task<Void, Never> {
        motionNo += 1
        let mine = motionNo
        return Task { @MainActor [weak self] in
            var last = ContinuousClock.now
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(16))
                guard !Task.isCancelled else { return }
                let now = ContinuousClock.now
                let since = now - last
                last = now
                let dt = min(0.064, max(0.001, Double(since.components.seconds) + Double(since.components.attoseconds) / 1e18))
                if !step(dt) { break }
            }
            // Only the loop that is still the current one may say the map has stopped.
            if let self, self.motionNo == mine { self.motion = nil }
        }
    }
    /// The whole area, one tap away: the reset button still shows all four cities, whatever the map opened at
    /// (DECISIONS 2026-09-22). It counts as a move now — before, `everMoved = false` meant the next layout refit
    /// the region, which since 2026-09-22 would instead throw the person back to the anchor they just left.
    func reset() {
        everMoved = true
        camera = MapCamera.fitting(cityCorners, width: camera.width, height: camera.height, cover: true)
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }
    /// Centre on a point without changing the zoom — "my location", and following a row from the list.
    func center(on p: LatLon, atLeast metersAcross: Double = 1200) {
        everMoved = true
        let q = MapProjection.point(p)
        var next = camera
        next.centerX = q.x
        next.centerY = q.y
        let want = MapProjection.metersPerUnit / (metersAcross / max(camera.width, 1))
        if next.scale < want { next.scale = want }
        camera = next.clamped()
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }
    /// Show a radius around a point — two miles, the first time the Map tab is opened with a location to hand
    /// (docs/05, DECISIONS 2026-09-21). `MapCamera.forRadius` is the whole of it, and it is tested in HelpCore.
    /// The point is not kept: the camera is a few numbers in memory, and they are numbers about a view.
    func show(_ p: LatLon, radiusMeters: Double = locateRadiusMeters) {
        everMoved = true
        camera = MapCamera.forRadius(p, radiusMeters: radiusMeters, width: camera.width, height: camera.height)
        band = zoomBand(metersPerPoint: camera.metersPerPoint, previous: band)
    }

    /// The four corners of the service area (CLAUDE.md: Detroit, Hamtramck, Highland Park and Dearborn).
    private let cityCorners = [LatLon(lat: 42.255, lon: -83.29), LatLon(lat: 42.45, lon: -82.91)]

    // MARK: loading
    /// The city. Called when the tab first appears and whenever a newer bundle arrives.
    func loadBase(from store: BundleStore) async {
        guard let base = store.mapSource("map/base.json") else { baseFailed = true; return }
        let streets = store.mapSource("map/streets.json")
        do {
            let next = try await MapLoader.shared.baseMap(base, streets: streets)
            if next != self.base { crossStreets = nil }      // another bundle's crossings mean nothing here
            self.base = next
            baseFailed = false
        } catch {
            baseFailed = true                    // the greenway and the dots still draw; the streets simply do not
        }
    }

    // MARK: the city and neighbourhood outlines (`place:areas`)
    //
    // Both come from the same file the area pages come from: the four city outlines the pipeline ships
    // (`areas[]`, DECISIONS 2026-09-22) and the City's own 205 neighbourhood outlines. **No dot, no listing, no
    // value-carrying fill** — the layer cannot draw a listing because it is never handed one, which is how
    // docs/08's rule about sensitive rows is satisfied here: trivially, by there being nothing to drop.

    private(set) var indicators: Indicators?
    private(set) var areas: [AreaOutline] = []
    /// The outline a tap chose. It is a way of drawing the map and nothing else: it is never written down.
    var areaSelected = ""
    private var areasKey = ""

    /// The outlines live in the numbers file, which is fetched the first time any screen wants it — lazily,
    /// checksum first, decoded off the main actor, exactly as a map file is.
    func loadAreas(from store: BundleStore) async {
        guard let src = store.mapSource(HoodsFile.name) else { return }
        guard src.sha256 != areasKey || areas.isEmpty else { return }
        guard let d = try? await MapLoader.shared.indicators(src) else { return }
        indicators = d
        areas = areaOutlines(d, wholeCity: L.t("city.area_sub"),
                             district: { $0.map { n in L.t("hood.district", ["n": String(n)]) } ?? L.t("hood.no_district") })
        areasKey = src.sha256
    }

    // MARK: the streets a typed cross street is resolved against
    //
    // "Type a cross street" (Kyle, 2026-09-22) is answered on this phone from `map/base.json` and
    // `map/streets.json` — the files the map already holds — so it works with no signal and nothing is sent.
    // Building the name index walks a city's worth of geometry, so it happens off the main actor, once per
    // bundle; what a person types never reaches this object at all (HelpCore/Intersections.swift).

    private(set) var crossStreets: CrossStreets?
    private(set) var crossFailed = false
    private var crossBuilding = false

    /// The street map, then the index. Safe to call from any screen that offers the field, as often as it likes.
    func ensureCrossStreets(from store: BundleStore) async {
        guard crossStreets == nil, !crossBuilding else { return }
        crossBuilding = true
        defer { crossBuilding = false }
        if base == nil { await loadBase(from: store) }
        guard let map = base else { crossFailed = true; return }
        let index = await Task.detached(priority: .userInitiated) { StreetIndex(map) }.value
        crossStreets = CrossStreets(index: index)
        crossFailed = false
    }

    /// One transport layer's shapes, asked for only when that layer is switched on. A failure is a state of its
    /// own: the switcher and the list say so, and "Try again" asks afresh — it is never remembered as "nothing".
    func loadLayer(_ id: String, from store: BundleStore) async {
        guard let meta = store.bundle?.transitLayers.first(where: { "go:" + $0.id == id }) else { return }
        let key = id + ":" + (store.bundle?.index.files[meta.file]?.sha256 ?? "")
        guard layerData[key] == nil, !asking.contains(key) else { return }
        guard let src = store.mapSource(meta.file) else { layerFailed.insert(id); return }
        asking.insert(key)
        defer { asking.remove(key) }
        do {
            layerData[key] = try await MapLoader.shared.layer(src)
            layerFailed.remove(id)
        } catch {
            layerFailed.insert(id)
        }
    }

    func retry(_ id: String, from store: BundleStore) async {
        layerFailed.remove(id)
        netFailed.remove(id)
        await loadLayer(id, from: store)
        await loadNets(from: store)
    }

    // MARK: the subway style's network files
    private func netKey(_ layer: String, _ store: BundleStore) -> String? {
        guard let file = store.bundle?.netFiles[layer], let sha = store.bundle?.index.files[file]?.sha256 else { return nil }
        return layer + ":" + sha
    }
    func net(for layer: String, in store: BundleStore) -> PreparedNet? { netKey(layer, store).flatMap { nets[$0] } }
    func serves(for layer: String, in store: BundleStore) -> TransitServes? { netKey(layer, store).flatMap { serves[$0] } }

    /// The stops layer a selected route needs, so its stops can appear even when that layer is switched off.
    func stopsLayerOfSelection() -> String? {
        guard let sel = selectedRoute(), let net = nets.first(where: { $0.value.net.id == sel.layer })?.value.net else { return nil }
        return net.stopsLayer.isEmpty || net.stopsLayer == sel.layer ? nil : net.stopsLayer
    }

    /// Asks for each network file this style and these layers need — **nothing at all in `standard`**
    /// (`netFilesWanted`, HelpCore). Lazy, checksum first, decoded off the main actor. A failure is a state of its
    /// own: the layer keeps drawing `standard`, the layers sheet says so, and "Try again" asks afresh.
    func loadNets(from store: BundleStore) async {
        let wanted = netFilesWanted(style: style, layersOn: layersOn, available: store.bundle?.netFiles ?? [:],
                                    alsoStopsOf: stopsLayerOfSelection())
        for (layer, file) in wanted.sorted(by: { $0.key < $1.key }) {
            guard let key = netKey(layer, store), nets[key] == nil, serves[key] == nil, !netAsking.contains(key) else { continue }
            guard let src = store.mapSource(file) else { netFailed.insert("go:" + layer); continue }
            netAsking.insert(key)
            do {
                if layer.hasSuffix("_stops") { serves[key] = try await MapLoader.shared.serves(src) }
                else { nets[key] = try await MapLoader.shared.net(src) }
                netFailed.remove("go:" + layer)
            } catch {
                netFailed.insert("go:" + layer)
            }
            netAsking.remove(key)
        }
        // A selected route's stops need the stops layer's own shapes too, even when that layer is off.
        if let stops = stopsLayerOfSelection() { await loadLayer("go:" + stops, from: store) }
    }
    func netLoading(_ id: String, in store: BundleStore) -> Bool {
        guard style == .subway, isOn(id), let key = netKey(String(id.dropFirst(3)), store) else { return false }
        return netAsking.contains(key)
    }
    /// True when this layer is drawn in the subway style this frame: chosen, and its network is here.
    func drawsSubway(_ layer: String, in store: BundleStore) -> Bool {
        drawnStyle(chosen: style, netHeld: net(for: layer, in: store) != nil) == .subway
    }

    /// Whether this layer's shapes are here, still coming, or could not be read.
    enum LayerState { case ready, loading, failed }
    func state(of id: String, in store: BundleStore) -> LayerState {
        if layerFailed.contains(id) { return .failed }
        return data(for: id, in: store) == nil ? .loading : .ready
    }
    func data(for id: String, in store: BundleStore) -> MapLayerData? {
        guard let meta = store.bundle?.transitLayers.first(where: { "go:" + $0.id == id }) else { return nil }
        return layerData[id + ":" + (store.bundle?.index.files[meta.file]?.sha256 ?? "")]
    }

    /// Our own listings as dots, rebuilt when the bundle or the switched-on layers change — never while a finger
    /// is moving. `mapDrawable` is the one rule that matters here: a treatment or sexual-assault listing is never
    /// a dot at all, and a DV or mental-health-crisis listing is dropped row by row (HelpCore/MapLayers.swift).
    private(set) var dots: [DrawnDot] = []
    func rebuildDots(from store: BundleStore) {
        dots = mapDrawable(store.bundle?.rows ?? [], tops: switchedOnTops).compactMap { r in
            guard r.status == "active", let lat = r.lat, let lon = r.lon else { return nil }
            let q = MapProjection.point(LatLon(lat: lat, lon: lon))
            return DrawnDot(id: r.id, name: r.name, group: mapGroupId(for: r.category),
                            phone: r.phones.first?.number, x: q.x, y: q.y)
        }
    }

    /// What a tap found, in the order the web map looks: a listing dot first, then a stop, then the greenway, then
    /// a route, then the park a finger is inside. Tolerances are in points and are turned into map units here, so
    /// a finger is the same size at every zoom.
    func pick(at p: CGPoint, overlays: [MapOverlay], parksOn: Bool) -> MapSelection? {
        let x = camera.mapX(p.x), y = camera.mapY(p.y)
        func tolerance(_ points: Double) -> Double { camera.mapDistance(points: points) }

        var best: (d: Double, hit: MapSelection)?
        func consider(_ d: Double, _ limit: Double, _ hit: @autoclosure () -> MapSelection) {
            guard d < limit, best == nil || d < best!.d else { return }
            best = (d, hit())
        }

        let dotTol = tolerance(24)
        for dot in dots { consider(hypot(dot.x - x, dot.y - y), dotTol, .listing(dot.id)) }
        if let b = best { return b.hit }

        // The subway style: glyphs by their 44-point boxes. Layers still drawn `standard` fall through to below.
        let subwayLines = overlays.contains { $0.subway }
        if subwayLines, let hit = pickSubwayGlyph(at: p) { return hit }

        let stopTol = tolerance(18)
        for o in overlays where !o.subway {
            for q in o.data.points { consider(hypot(q.x - x, q.y - y), stopTol, .stop(name: q.name, layer: o.label)) }
        }
        if let b = best { return b.hit }

        if isOn("place:greenway") {
            let segTol = tolerance(16)
            for g in segments where g.box.expanded(by: segTol).contains(x: x, y: y) || g.box.expanded(by: segTol).intersects(camera.visible) {
                for l in g.lines { consider(MapHit.distanceToPolyline(x, y, l), segTol, .segment(g.id)) }
            }
            if let b = best { return b.hit }
        }

        if subwayLines, let hit = pickSubwayLine(at: p) { return hit }

        let routeTol = tolerance(14)
        for o in overlays where !o.subway {
            for l in o.data.lines where l.box.intersects(camera.visible) {
                consider(MapHit.distanceToPolyline(x, y, l.points), routeTol, .route(name: l.name, layer: o.label))
            }
        }
        if let b = best { return b.hit }

        // An outline sits ahead of the parks and behind everything a person came to the map to find, and the
        // smallest area containing the point wins — a Detroit neighbourhood beats the Detroit city outline
        // (`areaAt`, HelpCore/CityAreas.swift; the web's `probe`).
        if isOn(areasLayerId), let a = areaAt(areasShown, x: x, y: y) { return .area(a.id) }

        if parksOn, let park = base?.parks.first(where: {
            !$0.name.isEmpty && $0.box.contains(x: x, y: y) && MapHit.inside(x, y, ring: $0.points)
        }) { return .park(park.name) }
        return nil
    }

    /// The outlines the map is drawing this frame: only what a tap may land on, so the picture and the hit test
    /// can never disagree about which shapes are there.
    var areasShown: [AreaOutline] {
        guard isOn(areasLayerId) else { return [] }
        return areasDrawn(areas, view: camera.visible)
    }
    func area(id: String) -> AreaOutline? { areas.first { $0.id == id } }

    /// The greenway, projected once per bundle.
    func prepareSegments(_ list: [Segment]) {
        let key = list.map(\.id).joined(separator: ",")
        guard key != segmentsKey else { return }
        segmentsKey = key
        segments = greenwaySegmentsInReadingOrder(list).map(DrawnSegment.init)
    }

    // MARK: selecting
    func select(_ s: MapSelection?) {
        selection = s
        // The outline that was tapped stays washed until another one is: that is how a person sees which shape
        // the card belongs to. It is a way of drawing the map, and it is never written down.
        if case .area(let id) = s { areaSelected = id }
        if s != nil { selectionCount += 1 }
    }
}

// MARK: - setting the stage for a screenshot or a measurement (Debug only)

#if DEBUG
/// Launch arguments that put the map somewhere known, so a screenshot or a frame-time run can be repeated:
/// `-mapTab`, `-mapStyle subway`, `-mapLayers ddot_routes,qline` (or `place:parks`), `-mapAt 42.3314,-83.0458,8`
/// (latitude, longitude, metres per point), `-mapSelect ddot_routes:rt_ddot_4`, `-mapSheet layers|list`,
/// `-mapBench` (drags the map in a circle for ten seconds so `MapFrameClock` has frames to time).
/// None of this exists in a Release build, and none of it reads or writes anything about a person.
enum MapStage {
    static func value(_ name: String) -> String? {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
        return a[i + 1]
    }
    static func has(_ name: String) -> Bool { ProcessInfo.processInfo.arguments.contains(name) }
}

extension MapModel {
    func applyStage() {
        if let layers = MapStage.value("-mapLayers") {
            setLayers(layers.split(separator: ",").map { $0.contains(":") ? String($0) : "go:" + $0 })
        }
        if let style = MapStage.value("-mapStyle") { setStyle(mapStyle(style)) }
        if let at = MapStage.value("-mapAt")?.split(separator: ",").compactMap({ Double($0) }), at.count == 3 {
            stage(LatLon(lat: at[0], lon: at[1]), metersPerPoint: at[2])
        }
        if let sel = MapStage.value("-mapSelect")?.split(separator: ":").map(String.init), sel.count == 2 {
            select(.line(layer: sel[0], route: sel[1]))
        }
        if MapStage.has("-mapBench") {
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(4))
                for i in 0..<600 {
                    let a = Double(i) / 40
                    pan(dx: cos(a) * 3, dy: sin(a) * 3)
                    try? await Task.sleep(for: .milliseconds(16))
                }
            }
        }
    }
}
#endif

// MARK: - how long a frame took

/// A plain frame-time log, Debug only, so panning with the bus stops on can be measured without Instruments.
/// It never runs in a Release build and it writes nothing to disk.
enum MapFrameClock {
    #if DEBUG
    private static let log = Logger(subsystem: "org.help313.app", category: "map")
    private nonisolated(unsafe) static var total = 0.0
    private nonisolated(unsafe) static var count = 0
    private nonisolated(unsafe) static var worst = 0.0

    static func measure<T>(_ what: String, _ body: () -> T) -> T {
        let t0 = CFAbsoluteTimeGetCurrent()
        let out = body()
        let ms = (CFAbsoluteTimeGetCurrent() - t0) * 1000
        total += ms; count += 1; worst = max(worst, ms)
        if count >= 30 {
            let line = "\(what): \(String(format: "%.2f", total / 30)) ms average, \(String(format: "%.2f", worst)) ms worst over 30 frames"
            log.info("\(line, privacy: .public)")
            print(line)                                  // Debug builds only; a Release build has none of this
            total = 0; count = 0; worst = 0
        }
        return out
    }
    #else
    static func measure<T>(_ what: String, _ body: () -> T) -> T { body() }
    #endif
}
