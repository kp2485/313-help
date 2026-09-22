// What the Map tab may draw, and what it must never draw. A port of the rules in apps/web/src/needs.ts
// (MAP_GROUPS, mapDrawable, PRIVATE_TOPS), apps/web/src/main.ts (LAYER_STYLE) and apps/web/src/layers.ts
// (DEFAULT_LAYERS, remembered on the device only).
//
// It lives here rather than in a screen because the one rule that must never be got wrong — a listing that is
// never a dot — is worth holding to a fixture of the exact rows it must refuse. No UIKit, no SwiftUI.
import DetroitQuery
import Foundation

// MARK: - our own listings, by group

/// One "Free help" layer: a group of our own listings, derived from the category taxonomy. `tops` are top-level
/// categories (the part before the first dot). Every top-level category belongs to exactly one group, except the
/// private ones, which are never drawn at all.
public struct MapGroup: Equatable, Sendable, Identifiable {
    public var id: String
    public var symbol: String
    public var tops: [String]
    public init(id: String, symbol: String, tops: [String]) { self.id = id; self.symbol = symbol; self.tops = tops }
}

/// The same eight groups (category audit, 2026-09-22), in the same order, as `MAP_GROUPS` in apps/web/src/needs.ts.
public let mapGroups: [MapGroup] = [
    MapGroup(id: "food", symbol: "fork.knife", tops: ["food"]),
    MapGroup(id: "shelter", symbol: "bed.double", tops: ["shelter"]),
    // Police and fire stations ride with the emergency rooms they are listed beside (DECISIONS 2026-09-22). A
    // layer of their own would need a colour of its own in three clients' map palettes.
    MapGroup(id: "health", symbol: "cross.case", tops: ["health", "harm", "safe"]),
    MapGroup(id: "rec", symbol: "figure.run", tops: ["rec", "connect"]),
    MapGroup(id: "work", symbol: "briefcase", tops: ["jobs", "learn"]),
    MapGroup(id: "kids", symbol: "figure.2.and.child.holdinghands", tops: ["kids", "youth"]),
    MapGroup(id: "things", symbol: "tshirt", tops: ["goods", "hygiene", "pets"]),
    MapGroup(id: "paperwork", symbol: "person.text.rectangle", tops: ["housing", "utilities", "money", "legal", "ids", "transport"]),
]

/// Never a layer, never a dot: help with drugs or alcohol, and help after sexual assault, are dropped as whole
/// top-level kinds. Inside any other group a single **sensitive** listing (a DV shelter, a mental-health crisis
/// line) is dropped row by row as well (`isSensitive`, Saved.swift).
public let mapPrivateTops = ["treatment", "assault"]

/// The group a category belongs to, or "" when it belongs to none.
public func mapGroupId(for category: String) -> String {
    let top = String(category.split(separator: ".").first ?? "")
    return mapGroups.first { $0.tops.contains(top) }?.id ?? ""
}

/// The listings a set of switched-on help layers may put on the map. Three rules, and all of them have to hold:
/// the private kinds are dropped as whole top-level kinds, a sensitive listing is dropped row by row, and a row
/// needs a published point, because a dot is what this is for.
///
/// Written over closures rather than over `BundleRow` so the tests can hand it the exact rows it must refuse.
public func mapDrawable<T>(_ rows: [T], tops: [String],
                           category: (T) -> String, hasPoint: (T) -> Bool) -> [T] {
    rows.filter { row in
        guard hasPoint(row) else { return false }
        let c = category(row)
        let top = String(c.split(separator: ".").first ?? "")
        return !isSensitive(c) && !mapPrivateTops.contains(top) && tops.contains(top)
    }
}

public func mapDrawable(_ rows: [BundleRow], tops: [String]) -> [BundleRow] {
    mapDrawable(rows, tops: tops, category: { $0.category }, hasPoint: { $0.lat != nil && $0.lon != nil })
}

/// The rows a screen that mixes categories draws from (`Need.categories` in HelpApp/Help.swift, `inCategories`
/// in apps/web/src/needs.ts). A category matches whole or as a parent, the same way `DetroitQuery` matches one.
///
/// It lives here, where CI can run it, because "Get somewhere safe now" is an urgent screen and the one thing it
/// must never do is show a listing that hides where it is.
public func inCategories<T>(_ rows: [T], _ cats: [String], category: (T) -> String) -> [T] {
    rows.filter { row in
        let c = category(row)
        return cats.contains { c == $0 || c.hasPrefix($0 + ".") }
    }
}

public func inCategories(_ rows: [BundleRow], _ cats: [String]) -> [BundleRow] {
    inCategories(rows, cats, category: { $0.category })
}

// MARK: - the layers on offer, and how each one is drawn

/// How one switched-on layer is painted. `color` names a colour in the app's palette (HelpApp/MapPalette.swift),
/// never a colour value: dark mode and the contrast fixes of docs/ACCESSIBILITY-AUDIT-2026-09-20 live there.
///
/// Colour never carries the meaning on its own. Every layer is named in the switcher, named again when a person
/// taps one of its lines or stops, and named in the list under the map.
public struct MapLayerStyle: Equatable, Sendable {
    public var color: String
    public var width: Double
    public var dash: [Double]
    public var ring: Bool
    /// Thousands of points: they wait until the map is close enough for them to be separate things.
    public var dense: Bool
    public init(color: String, width: Double = 5, dash: [Double] = [], ring: Bool = false, dense: Bool = false) {
        self.color = color; self.width = width; self.dash = dash; self.ring = ring; self.dense = dense
    }
}

/// Exactly `LAYER_STYLE` in apps/web/src/main.ts, including the intercity coaches' own style: without it they
/// were drawn exactly like the DDOT routes and nothing on the map told the two apart.
public let mapLayerStyles: [String: MapLayerStyle] = [
    "go:ddot_routes": MapLayerStyle(color: "bus", width: 3.2),
    "go:ddot_stops": MapLayerStyle(color: "bus", dense: true),
    "go:smart_routes": MapLayerStyle(color: "smart", width: 2.8, dash: [3, 2]),
    "go:smart_stops": MapLayerStyle(color: "smart", dense: true),
    "go:qline": MapLayerStyle(color: "rail", width: 4, ring: true),
    "go:people_mover": MapLayerStyle(color: "rail", width: 3.4, ring: true),
    "go:mogo": MapLayerStyle(color: "bike", ring: true),
    "go:bike_lanes": MapLayerStyle(color: "bike", width: 2.4),
    "go:stations": MapLayerStyle(color: "rail", ring: true),
    "go:park_ride": MapLayerStyle(color: "smart", ring: true),
    "go:intercity_bus": MapLayerStyle(color: "rail", width: 2.6, dash: [5, 3], ring: true),
]
public func mapLayerStyle(_ id: String) -> MapLayerStyle { mapLayerStyles[id] ?? MapLayerStyle(color: "bus") }

/// What a first-time visitor sees (navigation audit 2026-09-22, H2 / §5 Q4). It used to be the greenway, the
/// parks and the buses — **no help at all**, so the one tab named after the thing on it opened without the
/// thing, and a person who tapped Map to find food had to open the switcher and tick a box first.
///
/// So: **every help layer on, parks on, the greenway off, the bus routes off.** All eight help groups rather
/// than food alone, because the map is where a helper asks "what is near this address?" and the honest answer
/// is all of it; parks because they are the other thing a map is for; the greenway off because it is one path
/// inside a 302-park system (Kyle, direction b) and one tap away in the switcher; the bus routes off because a
/// route line over eight kinds of dot is the busiest thing on the screen and the stops only draw at zoom anyway.
///
/// A remembered choice still wins: this list is only ever read on a phone that has never touched the switcher.
/// Exactly `DEFAULT_LAYERS` in apps/web/src/layers.ts, and `AppParityTests` holds the two together.
///
/// **Boundaries joined it on 2026-09-22** (Kyle: "The user needs to be able to see the boundaries of the
/// neighborhoods on the map"; docs/MAP-STYLE.md 15.4). The outlines were the one thing on the Map tab a person
/// could not get to without knowing the switcher existed, and a neighbourhood edge is not an extra: it is how
/// somebody says where they live. They are drawn as a hairline under every dot and every line, so the map that
/// opens is still a map of help with the ground drawn under it.
public let defaultMapLayers = [
    "help:food", "help:shelter", "help:health", "help:rec", "help:work", "help:kids", "help:things", "help:paperwork",
    "place:parks", areasLayerId,
]

/// What the stored layer list is a list OF. Bumped when the default set gains something every phone should see.
///
/// 1 (implied, no marker written): the list as it stood before 2026-09-22.
/// 2: boundaries are in the defaults, and a list written before this existed gets them added once.
///
/// Why a marker rather than "just add it": a phone that has ever touched the switcher never reads
/// `defaultMapLayers` again, so those people would have gone on seeing no boundaries for ever. Adding it on
/// every load instead would mean a person could not turn it OFF. So it is added exactly once, the marker records
/// that it happened, and from then on the remembered choice — including "off" — is the only thing that decides.
public let layersVersion = 2

/// The migration, as a pure function so `swift test` runs it: a stored list with no marker, or an older one,
/// gains the boundaries once — at the end, nothing else touched, the 30-layer cap still applied. A list already
/// stamped with this version is returned exactly as it was, whether or not the boundaries are in it.
public func migrateMapLayers(_ stored: [String], version: Int?) -> [String] {
    guard version != layersVersion else { return stored }
    guard !stored.contains(areasLayerId) else { return stored }
    return Array((stored + [areasLayerId]).suffix(30))
}

/// How wide a layer's line is drawn, in points, at this zoom.
public func mapLayerLineWidth(_ style: MapLayerStyle, metersPerPoint: Double) -> Double {
    max(1.6, min(style.width, style.width * 18 / metersPerPoint))
}

/// How big a stop is drawn, in points — **0 means do not draw it at all**. A dense layer (five thousand bus
/// stops) waits for the zoom: drawn at every zoom it is a smear rather than a set of places, and it costs a
/// cheap phone a frame. The switcher says so, and the list shows every stop at any zoom.
public func mapStopRadius(dense: Bool, metersPerPoint: Double) -> Double {
    if dense { return metersPerPoint > 12 ? 0 : max(2, min(4, 30 / metersPerPoint)) }
    return max(3.5, min(6.5, 45 / metersPerPoint))
}

/// The road classes drawn at this zoom: main roads always, small streets as you come in. Class 0 is a freeway.
/// As the web (map.ts, accessibility pass of 2026-09-20): every street now clears 3:1, so a small street only
/// appears at the zoom where it means anything — class 4 waits for 6 m/pt (it was 9), class 3 for 11 (it was 16).
public func mapStreetClassLimit(metersPerPoint: Double) -> Int {
    metersPerPoint < 6 ? 4 : metersPerPoint < 11 ? 3 : 2
}
/// The road classes whose names are worth printing at this zoom.
public func mapStreetLabelLimit(metersPerPoint: Double) -> Int {
    metersPerPoint < 4.6 ? 4 : metersPerPoint < 8 ? 3 : metersPerPoint < 14 ? 2 : metersPerPoint < 30 ? 1 : 0
}
/// How wide a street of this class is drawn, in points. Width carries the hierarchy, not fade: freeway, main road
/// and side street are within a step of each other in colour and a long way apart in weight. A small street is a
/// hairline (0.9), which reads far lighter than its own swatch.
public func mapStreetWidth(cls: Int, metersPerPoint: Double) -> Double {
    let base: [Double] = [18, 20, 15, 10, 7]
    let c = max(0, min(4, cls))
    return max(c == 4 ? 0.9 : c == 3 ? 1.2 : 1.6, min(c <= 2 ? 6.5 : 4.5, base[c] / metersPerPoint))
}

// MARK: - the greenway, drawn like a transit line

/// A stretch's colour and dash. Colour never carries the meaning alone: the phase is also a word on every row,
/// in the tapped card, and in the list (Differentiate Without Color).
public struct GreenwayPhaseStyle: Equatable, Sendable {
    public var color: String
    /// Multiples of the drawn width, so the pattern keeps its shape at every zoom. Empty is a solid line.
    public var dash: [Double]
    public init(color: String, dash: [Double]) { self.color = color; self.dash = dash }
}
/// Least built first, so an open stretch is never hidden under a dotted one.
public let greenwayPhaseOrder = ["planned", "funded", "under_construction", "open"]
public func greenwayPhaseStyle(_ phase: String) -> GreenwayPhaseStyle {
    switch phase {
    case "open": return GreenwayPhaseStyle(color: "gwOpen", dash: [])
    case "under_construction": return GreenwayPhaseStyle(color: "gwBuild", dash: [2.4, 1.5])
    case "funded": return GreenwayPhaseStyle(color: "gwFund", dash: [1.4, 1.3])
    default: return GreenwayPhaseStyle(color: "gwPlan", dash: [0.02, 1.9])   // round caps turn this into dots
    }
}
/// The width of the whole route at this zoom: one width the whole way, as a transit line is drawn.
public func greenwayWidth(metersPerPoint: Double) -> Double { max(4.5, min(9, 18 / metersPerPoint)) }
/// Station dots where stretches meet are only worth drawing once they are far enough apart.
public func greenwayShowsStations(metersPerPoint: Double) -> Bool { metersPerPoint < 14 }

// MARK: - reading order for VoiceOver

/// A Canvas is one opaque picture to VoiceOver, so the greenway is offered as a list of buttons instead. They are
/// read **south to north**, the way the route is walked and the way the City numbers its phases, and a stretch
/// that starts at the same latitude as another is settled by its name so the order never wobbles between launches.
public func greenwaySegmentsInReadingOrder(_ segments: [Segment]) -> [Segment] {
    func south(_ s: Segment) -> Double {
        s.lines.flatMap { $0 }.compactMap { $0.count >= 2 ? $0[1] : nil }.min() ?? .infinity
    }
    return segments.sorted { a, b in
        let (sa, sb) = (south(a), south(b))
        if sa != sb { return sa < sb }
        return a.id < b.id
    }
}

/// Places are read nearest-first from wherever the map is looking, so the first thing VoiceOver reads is the
/// thing in the middle of the screen. `point` is in map units (the camera's centre).
public func placesInReadingOrder<T>(_ places: [T], fromX: Double, fromY: Double,
                                    x: (T) -> Double, y: (T) -> Double, tieBreak: (T) -> String) -> [T] {
    places.map { (item: $0, d: (x($0) - fromX) * (x($0) - fromX) + (y($0) - fromY) * (y($0) - fromY)) }
        .sorted { $0.d != $1.d ? $0.d < $1.d : tieBreak($0.item) < tieBreak($1.item) }
        .map(\.item)
}

// MARK: - what this phone remembers

/// Which layers are switched on. A preference about a map, not a fact about a person: it is a small file in the
/// app's own state directory, which is excluded from every backup, and it is never sent anywhere.
///
/// **Not `UserDefaults`**: the privacy manifest (HelpApp/PrivacyInfo.xcprivacy) declares no required-reason API,
/// and the app keeps its own state in files it creates.
public final class MapLayerStore {
    private let file: URL
    public private(set) var on: [String]
    /// How the transport layers are drawn (docs/MAP-STYLE.md). It lives in the **same file** as the layer list and
    /// under the same rules: on this phone only, never in a backup, never sent. Anything that is not exactly
    /// "subway" reads as `standard`, which is the default.
    public private(set) var style: MapStyleChoice
    /// Table or chart on a neighborhood's year panels (docs/13, 2026-09-22). It is not about the map at all, but
    /// it is the same KIND of fact — a way of showing something, chosen on this phone — so it lives in the same
    /// file under the same rules: this phone only, never in a backup, never sent. Anything that is not exactly
    /// "chart" reads as `table`, which is the default.
    public private(set) var hoodView: HoodViewChoice

    /// What the file holds since 2026-09-21. Before that it was a bare list of layer ids, which is still read.
    /// `v` is the layer list's version marker (docs/MAP-STYLE.md 15.4), added 2026-09-22; a file written before
    /// that has none, which is exactly what the migration looks for.
    private struct Saved: Codable { var on: [String]; var style: String?; var hoodView: String?; var v: Int? }

    public init(dir: URL) {
        file = dir.appendingPathComponent("map-layers.json")
        let d = DeviceState.read(file)
        if let d, let saved = try? JSONDecoder().decode(Saved.self, from: d) {
            let migrated = migrateMapLayers(Array(saved.on.prefix(30)), version: saved.v)
            on = migrated; style = mapStyle(saved.style); hoodView = hoodViewChoice(saved.hoodView)
            // The marker is written back the moment a list is migrated, so it happens exactly once: switching
            // the boundaries off tomorrow must leave them off.
            if saved.v != layersVersion { _ = write() }
        } else if let d, let list = try? JSONDecoder().decode([String].self, from: d) {
            on = migrateMapLayers(Array(list.prefix(30)), version: nil); style = .standard; hoodView = .table
            _ = write()
        } else {
            // Never touched the switcher: the defaults, whatever they are today. Nothing is written, so a first
            // run that never opens the switcher leaves no layer file at all, exactly as before.
            on = defaultMapLayers; style = .standard; hoodView = .table
        }
    }

    public func isOn(_ id: String) -> Bool { on.contains(id) }

    /// Returns the new list. Thirty at most, so a phone with an old bundle can never ask for an unbounded number
    /// of files. Returns false only when the choice could not be written down; the switch still moves.
    @discardableResult public func toggle(_ id: String) -> Bool {
        on = on.contains(id) ? on.filter { $0 != id } : Array(([id] + on).prefix(30))
        return write()
    }

    @discardableResult public func set(_ ids: [String]) -> Bool {
        on = Array(ids.prefix(30))
        return write()
    }

    @discardableResult public func setStyle(_ next: MapStyleChoice) -> Bool {
        style = next
        return write()
    }

    /// One choice for every year panel on every neighborhood page. Returns false only when it could not be written
    /// down; the control still moves, because a preference that does not survive a relaunch is still a preference.
    @discardableResult public func setHoodView(_ next: HoodViewChoice) -> Bool {
        hoodView = next
        return write()
    }

    /// **Every** write stamps the version marker, not only the migration: a choice made after it — including
    /// "boundaries off" — must never be migrated again (docs/MAP-STYLE.md 15.4).
    private func write() -> Bool {
        guard let d = try? JSONEncoder().encode(Saved(on: on, style: style.rawValue, hoodView: hoodView.rawValue,
                                                      v: layersVersion)) else { return false }
        do { try DeviceState.write(d, to: file); return true } catch { return false }
    }
}
