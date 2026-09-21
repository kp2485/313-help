// Loads the signed bundle, the same files the web app reads (docs/06). Order: the verified copy on this phone,
// else the snapshot shipped inside the app (so it works with no signal, ever), then a background refresh.
// A bundle whose signature does not match a pinned key, whose files don't match their checksums, or that is older
// than the one held — or older than the snapshot this build shipped — is refused, and the old one stays.
// Nothing is ever sent: these are plain GETs on the app's one cookie-less session (HelpCore/Net).
import DetroitQuery
import Foundation
import HelpCore

// BundleIndex, BundleError and the checks themselves live in HelpCore/Verify.swift, where `swift test` reaches them.
struct EmergencyNumber: Codable, Identifiable { var id: String; var label: String; var number: String; var hardcoded: Bool }
struct CityEvent: Codable, Identifiable { var id: String; var title: String; var startsAt: String; var endsAt: String?; var location: String?; var url: String }
struct ArchivedRow: Codable, Identifiable { var id: String; var name: String; var category: String; var archived: BundleRow.Archived }
/// A City park (`places/parks.json`): a name, where it is, and how big. Drawn on the Map tab and listed under it.
struct Park: Codable, Identifiable, Equatable { var id: String; var name: String; var address: String?; var type: String?; var acres: Double?; var lat: Double; var lon: Double }
/// Which transport layers this bundle carries (`places/transit.json`, from pipeline/src/ingest-transit.ts). The
/// list itself is tiny and travels with the bundle, so the layer switcher draws offline; each layer's **shapes**
/// live in `map/transit/…` and are fetched only when that layer is first switched on.
struct TransitLayer: Codable, Identifiable, Equatable {
    struct Source: Codable, Equatable { var name: String; var url: String?; var page: String?; var license: String; var fetchedAt: String }
    var id: String
    var kind: String
    var file: String
    var lines: Int
    var points: Int
    var bytes: Int
    /// English fallback, used only when the app has no words of its own for this layer id (`layer.go.<id>`).
    var name: String
    var source: Source
}

struct LoadedBundle {
    var index: BundleIndex
    var rows: [BundleRow] = []
    var alerts: [Alert] = []
    var emergency: [EmergencyNumber] = []
    var archived: [ArchivedRow] = []
    var segments: [Segment] = []
    var events: [CityEvent] = []
    var parks: [Park] = []
    var parksEdited: String = ""
    var transitLayers: [TransitLayer] = []
    /// The subway map style's extras (docs/MAP-STYLE.md): which layers carry a format-2 network file
    /// (`map/transit/<id>.net.json`, fetched only in that style) and the hubs. Both are empty in an old bundle,
    /// and the "Map style" control is then not offered at all.
    var netFiles: [String: String] = [:]
    var hubs: [TransitHub] = []
}

/// Where one big map file may be read from, and the checksum the **signed** index gives it. Handed to `MapLoader`
/// (HelpApp/MapModel.swift) so that reading and decoding a third of a megabyte of JSON happens off the main actor.
/// Nothing in it is about a person, so it crosses actors freely.
struct MapFileSource: Sendable {
    var name: String
    var sha256: String
    /// The verified copy on this phone, the snapshot shipped inside the app, and the published origin, in the
    /// order they are tried. The map therefore works on a phone that has never had a signal.
    var cache: URL
    var snapshot: URL?
    var remote: URL?
}

@MainActor
final class BundleStore: ObservableObject {
    @Published private(set) var bundle: LoadedBundle?
    @Published private(set) var loadFailed = false

    /// Where the published bundle lives, e.g. https://<domain>/data/bundle/v1/ (Config, from Info.plist). A build
    /// still carrying the placeholder origin reaches nothing at all, and lives on the shipped snapshot.
    private let base = Config.bundleBaseURL
    /// Base64 SPKI Ed25519 public keys, active and spare (Info.plist DCPinnedKeys). Same values as BUNDLE_PUBLIC_KEYS.
    private let pinned = Config.pinnedKeys
    /// The oldest list this build accepts, even on a first launch: the shipped snapshot's own date.
    private let floor = Config.snapshotFloor
    /// A verified copy of the list is a cache, so it lives in Caches and is never in a backup (HelpCore/DeviceState).
    private let cacheDir = DeviceState.cacheDir

    func start() async {
        // A cached list older than the snapshot this build shipped is not used: an app update raises the floor.
        if let local = try? load(from: { try Data(contentsOf: self.cacheDir.appendingPathComponent($0)) }),
           !BundleCheck.refusesOlder(current: nil, next: local.index, floor: floor) { bundle = local }
        else if let snap = Bundle.main.url(forResource: "bundle-snapshot", withExtension: nil),
                let shipped = try? load(from: { try Data(contentsOf: snap.appendingPathComponent($0)) }) { bundle = shipped }
        await refresh()
    }

    func refresh() async {
        guard let base else { return }
        do {
            var fetched: [String: Data] = [:]
            let get: (String) async throws -> Data = { name in
                if let d = fetched[name] { return d }
                var req = URLRequest(url: base.appendingPathComponent(name)); req.cachePolicy = .reloadIgnoringLocalCacheData
                req.httpShouldHandleCookies = false
                let (d, res) = try await Net.session.data(for: req)
                guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                fetched[name] = d; return d
            }
            let indexData = try await get("index.json")
            let index = try verifiedIndex(indexData, try await get("index.json.sig"))
            if let cur = bundle?.index, cur.version == index.version { return }
            if BundleCheck.refusesOlder(current: bundle?.index, next: index, floor: floor) { throw BundleError.older }
            for name in index.files.keys where BundleCheck.loadedNow(name) { _ = try await get(name) }
            let next = try load(from: { name in guard let d = fetched[name] else { throw URLError(.fileDoesNotExist) }; return d })
            try? FileManager.default.removeItem(at: cacheDir)
            for (name, data) in fetched {
                let url = cacheDir.appendingPathComponent(name)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: url, options: [.atomic, .completeFileProtection])
            }
            bundle = next
        } catch {
            if bundle == nil { loadFailed = true }   // keep what we have; say so only when we have nothing
        }
    }

    /// Where to read one of the big map files from, and what its bytes must hash to. `nil` when this bundle does
    /// not carry that file at all, which is the map simply drawing without it.
    ///
    /// The checksum comes from `index.json`, which was **signed** by a pinned key before anything here was
    /// believed, so a map file is either exactly the one the signer published or it is not used. No map file is
    /// ever read from anywhere but these three places, and none of them is a tile server.
    func mapSource(_ name: String) -> MapFileSource? {
        guard let meta = bundle?.index.files[name] else { return nil }
        let snapshot = Bundle.main.url(forResource: "bundle-snapshot", withExtension: nil)?.appendingPathComponent(name)
        return MapFileSource(name: name, sha256: meta.sha256,
                             cache: cacheDir.appendingPathComponent(name),
                             snapshot: snapshot,
                             remote: base?.appendingPathComponent(name))
    }

    private func verifiedIndex(_ indexData: Data, _ sigData: Data) throws -> BundleIndex {
        try BundleCheck.verifiedIndex(indexData, sig: sigData, pinned: pinned)
    }

    /// Reads and checks every file the index lists (maps and neighborhood numbers load later, when opened).
    private func load(from read: (String) throws -> Data) throws -> LoadedBundle {
        let index = try verifiedIndex(try read("index.json"), try read("index.json.sig"))
        var b = LoadedBundle(index: index)
        let dec = bundleDecoder()
        for (name, meta) in index.files where BundleCheck.loadedNow(name) {
            let data = try read(name)
            guard BundleCheck.sha256Hex(data) == meta.sha256 else { throw BundleError.badChecksum(name) }
            switch name {
            case _ where name.hasPrefix("category/"): b.rows += try dec.decode([BundleRow].self, from: data)
            case "alerts.json": b.alerts = try dec.decode([Alert].self, from: data)
            case "emergency.json": b.emergency = try dec.decode([EmergencyNumber].self, from: data)
            case "archived.json": b.archived = try dec.decode([ArchivedRow].self, from: data)
            case "places/greenway.json": struct G: Codable { var segments: [Segment] }; b.segments = try dec.decode(G.self, from: data).segments
            case "places/parks.json":
                struct P: Codable { struct S: Codable { var lastEdited: String }; var source: S?; var parks: [Park] }
                let p = try dec.decode(P.self, from: data); b.parks = p.parks; b.parksEdited = p.source?.lastEdited ?? ""
            case "places/transit.json": struct T: Codable { var layers: [TransitLayer] }; b.transitLayers = try dec.decode(T.self, from: data).layers
                // The same verified bytes, read again by HelpCore for the parts only the subway style uses.
                let extras = MapFileDecoder.transitExtras(data)
                // Only a file the signed index lists is ever offered: nothing is fetched on a layer list's say-so.
                b.netFiles = extras.netFiles.filter { index.files[$0.value] != nil }
                b.hubs = extras.hubs
            case "events.json": struct E: Codable { var events: [CityEvent] }; b.events = try dec.decode(E.self, from: data).events
            default: break
            }
        }
        return b
    }
}
