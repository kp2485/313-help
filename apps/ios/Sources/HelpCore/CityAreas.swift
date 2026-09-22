// Whole-city area pages, and the `place:areas` map layer (docs/13 "The four cities"; DECISIONS 2026-09-22;
// navigation audit §3). The Swift half of the city half of apps/web/src/hoods.ts and of the `areas` parts of
// apps/web/src/map.ts, in numbers and rules only — no SwiftUI — so `swift test` runs all of it.
//
// Hamtramck, Highland Park and Dearborn publish nothing per neighborhood, so their page is the whole city, built
// from regional and federal sources that cover all four cities with one method. Detroit gets a city page too, so
// a tap on the Areas layer inside Detroit that is not on a neighborhood has somewhere to go.
//
// The rules this file keeps, exactly as the web keeps them:
//   * a panel is drawn ONLY when the area's own `panels` allow-list names it. A number that is in the data and
//     not in the list is not drawn; the allow-list is a fact in the bundle, never a habit of a screen.
//   * every panel prints its OWN source, with its own date and its owner's own required notice. Nothing inherits.
//   * `missing` is said in one plain sentence. Absent, never zero, never an empty chart.
//   * no number from another city appears anywhere: there is no cross-city comparison on the page at all.
//   * the layer is a SHAPE and a NAME. No dot, no listing, and never a fill that carries a value — docs/13's
//     first honesty rule means a shape may be outlined and named, never shaded by a number.
import DetroitQuery
import Foundation

// MARK: - the file's city rows

/// One source behind one panel: the owner, the licence, whose records they are, and the notice that owner
/// requires. The notice is the owner's own sentence, so it stays in their words and their language.
public struct AreaSource: Decodable, Equatable, Sendable {
    public var name: String
    public var url: String
    public var license: String
    public var licenseURL: String?
    public var notice: String?
    public var lastEdited: String
    public var recordsFrom: String?
    enum CodingKeys: String, CodingKey {
        case name, url, license, notice
        case licenseURL = "license_url", lastEdited = "last_edited", recordsFrom = "records_from"
    }
}

/// A panel this city does not have, and why. `notPublished` is said in one sentence at the foot of the page;
/// `noneRecorded` gets its own sentence per panel.
public struct MissingPanel: Decodable, Equatable, Sendable {
    public var panel: String
    public var why: String
    public var notPublished: Bool { why == "not_published" }
    public var noneRecorded: Bool { why == "none_recorded" }
}

public struct PermitYear: Decodable, Equatable, Sendable, Identifiable {
    public var year: Int
    public var buildings: Int
    public var units: Int
    public var monthsReported: Int
    public var id: Int { year }
    enum CodingKeys: String, CodingKey { case year, buildings, units, monthsReported = "months_reported" }
}

public struct AreaRoads: Decodable, Equatable, Sendable {
    public var pieces: Int
    public var miles: Double
    public var goodPct: Double
    public var fairPct: Double
    public var poorPct: Double
    enum CodingKeys: String, CodingKey { case pieces, miles, goodPct = "good_pct", fairPct = "fair_pct", poorPct = "poor_pct" }
}

public struct AreaVacancy: Decodable, Equatable, Sendable {
    public var housingUnits: Int
    public var vacant: Int
    public var pct: Double
    public var population: Int
    enum CodingKeys: String, CodingKey { case housingUnits = "housing_units", vacant, pct, population }
}

/// One row of the cities list: a city, and whether it has neighborhood pages under it.
public struct CityRow: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var kind: String
    public var children: String
    public var hasNeighborhoods: Bool { children == "neighborhood" }
}

/**
 A city page. It is a `Hood` with extra keys, because it is the same page drawn with the same components — the
 outline map, the help panel, the nearest rows and the crash panel are shared code, not a copy. Swift has no
 struct inheritance, so the `Hood` half is decoded from the same container and carried whole.
 */
public struct Area: Decodable, Equatable, Sendable, Identifiable {
    public var hood: Hood
    public var city: String
    public var kind: String
    /// The allow-list, and the only reason a panel is ever drawn.
    public var panels: [String]
    /// Panel key → the key of the `AreaSource` behind it.
    public var sources: [String: String]
    public var missing: [MissingPanel]
    public var parkAcres: Double?
    public var roadsBands: AreaRoads?
    public var vacancy: AreaVacancy?
    public var permitsByYear: [PermitYear]?

    public var id: String { hood.id }
    public var name: String { hood.name }

    enum CodingKeys: String, CodingKey {
        case city, kind, panels, sources, missing
        case parkAcres = "park_acres", roadsBands = "roads_bands", vacancy, permitsByYear = "permits_by_year"
    }

    public init(from decoder: Decoder) throws {
        hood = try Hood(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        city = try c.decode(String.self, forKey: .city)
        kind = try c.decode(String.self, forKey: .kind)
        panels = try c.decodeIfPresent([String].self, forKey: .panels) ?? []
        sources = try c.decodeIfPresent([String: String].self, forKey: .sources) ?? [:]
        missing = try c.decodeIfPresent([MissingPanel].self, forKey: .missing) ?? []
        parkAcres = try c.decodeIfPresent(Double.self, forKey: .parkAcres)
        roadsBands = try c.decodeIfPresent(AreaRoads.self, forKey: .roadsBands)
        vacancy = try c.decodeIfPresent(AreaVacancy.self, forKey: .vacancy)
        permitsByYear = try c.decodeIfPresent([PermitYear].self, forKey: .permitsByYear)
    }

    /// True only when this area's own allow-list names the panel. Nothing else may draw one.
    public func shows(_ panel: String) -> Bool { panels.contains(panel) }
}

/// The allow-list, in the order the page draws them. A key not in here can never be drawn. Exactly `CITY_PANELS`
/// in apps/web/src/hoods.ts, and `AppParityTests` holds the two together.
public let cityPanels = ["help", "parks", "crashes", "roads", "vacancy", "permits"]

/// The panels this area draws, in the fixed order, and nothing else.
public func cityPanelsShown(_ a: Area) -> [String] { cityPanels.filter(a.shows) }

/// Which page an id names. `nil` for an id this bundle does not carry.
public enum AreaPage: Equatable, Sendable {
    case neighborhood(Hood)
    case city(Area)
    public var hood: Hood {
        switch self {
        case .neighborhood(let h): return h
        case .city(let a): return a.hood
        }
    }
}

extension Indicators {
    /// The page for an id, whichever kind of area it names — a Detroit neighborhood first, then a city, exactly
    /// as the web's `areaById` looks.
    public func areaPage(id: String) -> AreaPage? {
        if let h = neighborhoods.first(where: { $0.id == id }) { return .neighborhood(h) }
        if let a = (areas ?? []).first(where: { $0.id == id }) { return .city(a) }
        return nil
    }
    /// The city rows, in the file's own order. Empty in a bundle built before the city pages existed, and the
    /// screens then say "only Detroit" rather than drawing an empty list.
    public var cityRows: [CityRow] { cities ?? [] }
    public func areaSource(_ key: String?) -> AreaSource? {
        guard let key, !key.isEmpty else { return nil }
        return areaSources?[key]
    }
    /// The sources a city page lists at its foot: each one once, in the order its panels first name it.
    public func sourcesOfArea(_ a: Area) -> [AreaSource] {
        var seen = Set<String>(), out: [AreaSource] = []
        for panel in cityPanels {
            guard let key = a.sources[panel], !seen.contains(key), let s = areaSource(key) else { continue }
            seen.insert(key)
            out.append(s)
        }
        // A source named by a panel that is not in the allow-list still belongs in the list, as on the web,
        // where `Object.values(h.sources)` is what is read.
        for key in a.sources.keys.sorted() where !seen.contains(key) {
            guard let s = areaSource(key) else { continue }
            seen.insert(key)
            out.append(s)
        }
        return out
    }
}

// MARK: - the `place:areas` layer

/// The id of the layer, as it is stored beside the others in `state/map-layers.json`.
public let areasLayerId = "place:areas"

/// A neighbourhood is drawn only from the zoom at which its own name fits (audit §3.3); below that, the four
/// city outlines alone, because 205 dashed outlines at city zoom are a mesh, not a map. The number is the label
/// rule itself: a name needs about 70 points, and a Detroit neighbourhood is about a kilometre across, so it
/// earns its outline at 1000/70 ≈ 14 metres per point. Exactly `AREA_DETAIL_MPP` on the web.
public let areaDetailMetersPerPoint = 14.0
/// An area's name is drawn only when its own box is at least this many points wide (the web's `wide > 70`).
public let areaLabelMinPoints = 70.0

/// One city or neighbourhood outline, projected once and ready to draw and to tap. It is a SHAPE and a NAME and
/// nothing else: it carries no listing, no dot and no number, which is how docs/08's rule about sensitive rows is
/// satisfied here — trivially, by there being nothing to drop.
public struct AreaOutline: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    /// The council district, or "Whole city" — never a number about the place.
    public var sub: String
    /// Each ring as a flat run of map-unit x, y pairs (`MapProjection`).
    public var rings: [[Double]]
    public var box: MapBox
    /// Twice the total unsigned area of the rings, in map units. Used for one thing: when two outlines hold a
    /// tap, the smaller one is the more specific answer.
    public var size: Double
    /// True for one of the four whole-city outlines, which are drawn at every zoom.
    public var isCity: Bool

    public init(id: String, name: String, sub: String, rings: [[Double]], isCity: Bool) {
        self.id = id; self.name = name; self.sub = sub; self.rings = rings; self.isCity = isCity
        box = rings.reduce(MapBox.empty) { $0.union(MapBox.around($1)) }
        size = rings.reduce(0) { $0 + abs(shoelace($1)) }
    }
}

/// Twice the signed area of a ring of flat x, y pairs, in map units. The web's `shoelace`.
public func shoelace(_ pts: [Double]) -> Double {
    guard pts.count >= 6 else { return 0 }
    var a = 0.0
    var i = 0, j = pts.count - 2
    while i + 1 < pts.count {
        a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1]
        j = i
        i += 2
    }
    return a / 2
}

/// The outlines, ready to draw: the four city outlines first, then Detroit's 205 neighbourhoods. The cities come
/// first so that a tap landing in two outlines at once can prefer the smaller one and a Detroit neighbourhood
/// wins over the Detroit outline it sits inside (`areaAt`). `sub` is handed in already worded, because the words
/// belong to the screen and the arithmetic belongs here.
public func areaOutlines(_ d: Indicators, wholeCity: String, district: (Int?) -> String) -> [AreaOutline] {
    func flatten(_ h: Hood) -> [[Double]] {
        hoodOutline(h, origin: d.origin).compactMap { ring in
            guard ring.count >= 3 else { return nil }
            var flat: [Double] = []
            flat.reserveCapacity(ring.count * 2)
            for p in ring { let q = MapProjection.point(p); flat.append(q.x); flat.append(q.y) }
            return flat
        }
    }
    var out: [AreaOutline] = []
    for a in (d.areas ?? []) where a.kind == "city" {
        let rings = flatten(a.hood)
        if rings.isEmpty { continue }
        out.append(AreaOutline(id: a.id, name: a.name, sub: wholeCity, rings: rings, isCity: true))
    }
    for h in d.neighborhoods {
        let rings = flatten(h)
        if rings.isEmpty { continue }
        out.append(AreaOutline(id: h.id, name: h.name, sub: district(h.district), rings: rings, isCity: false))
    }
    return out
}

/// Which outlines are drawn at this zoom: every one that is on screen when a neighbourhood's name would fit, and
/// the four city outlines alone below that.
public func areasDrawn(_ list: [AreaOutline], view: MapBox, metersPerPoint: Double) -> [AreaOutline] {
    let detailed = metersPerPoint < areaDetailMetersPerPoint
    return list.filter { $0.box.intersects(view) && (detailed || $0.isCity) }
}

/// The smallest outline holding a map point, or none. `evenodd` over every ring at once, so Detroit's enclave
/// holes — Hamtramck and Highland Park — are not part of Detroit.
public func areaAt(_ list: [AreaOutline], x: Double, y: Double) -> AreaOutline? {
    var found: AreaOutline?
    for a in list {
        guard a.box.contains(x: x, y: y) else { continue }
        var hit = false
        for r in a.rings where MapHit.inside(x, y, ring: r) { hit.toggle() }
        if hit, found == nil || a.size < found!.size { found = a }
    }
    return found
}

// MARK: - the reading order

/// What kind of thing a VoiceOver element on the map is. The order is the web's `KIND_ORDER`: a drawn route's own
/// markers first (a map about one trip is about nothing else), then the greenway stretch by stretch along the
/// route, then the areas nearest the middle of the screen, then the places likewise. An area comes before the
/// dots because it is the ground they stand on.
public enum MapFeatureKind: Int, Equatable, Sendable, CaseIterable {
    case stop = 0, segment = 1, area = 2, dot = 3
}

/// One thing on the map, for ordering only: what kind it is, its place in a sequence (a stretch along the path,
/// a marker along the trip) and how far it is from the middle of the screen.
public struct OrderableFeature: Equatable, Sendable {
    public var id: String
    public var kind: MapFeatureKind
    public var route: Int
    public var d: Double
    public init(id: String, kind: MapFeatureKind, route: Int = 0, d: Double = 0) {
        self.id = id; self.kind = kind; self.route = route; self.d = d
    }
}

/// A stable, meaningful order, held to a fixture rather than to a map. Exactly `orderFeatures` on the web.
public func orderFeatures(_ list: [OrderableFeature]) -> [OrderableFeature] {
    list.enumerated().sorted { a, b in
        if a.element.kind != b.element.kind { return a.element.kind.rawValue < b.element.kind.rawValue }
        let sequence = a.element.kind == .segment || a.element.kind == .stop
        let x = sequence ? Double(a.element.route) : a.element.d
        let y = sequence ? Double(b.element.route) : b.element.d
        if x != y { return x < y }
        return a.offset < b.offset            // a stable sort, as JavaScript's own is
    }.map(\.element)
}
