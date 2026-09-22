// The neighborhood numbers (docs/13), in numbers only: no UIKit, no SwiftUI, so `swift test` runs every rule here
// on Linux as well. This is the Swift half of `apps/web/src/hoods.ts`, and it is deliberately a port rather than a
// rewrite: the same file, the same fields, the same rates, the same words.
//
// What comes from where. `indicators/neighborhoods.json` is built by the pipeline from PUBLIC City and SEMCOG
// datasets joined with our own listings. Nothing in it comes from a phone, a report, or app usage (docs/13), and
// nothing here sends anything anywhere: the file arrives with the signed bundle and is checked against the
// checksum in the signed index before a byte of it is decoded, exactly as a map file is.
//
// The honesty rules that live in this file, the same three as the web's:
//  1. No ranking. `hoodsAlphabetical` and `hoodsByDistrict` sort by name and by council district and by nothing
//     else; `testIndexOrderNeverDependsOnAnIndicator` holds them to it.
//  2. Every count is the real number, however small (Kyle, 2026-09-22 — DECISIONS). Nothing in the file is hidden
//     and nothing here hides it: a 3 is a 3, crashes included.
//  3. A rate needs a base we can defend (at least 100 lots), or there is no rate.
import DetroitQuery
import Foundation

// MARK: - a count

/// A count, exactly as the pipeline wrote it. Since 2026-09-22 there is no hidden value in the file at all, so a
/// count is simply a whole number; the type stays so that every field that is a count says so.
public enum HoodCount: Equatable, Sendable, Decodable {
    case number(Int)

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        self = .number(try c.decode(Int.self))
    }

    /// The number. (Optional only so a missing count and a present one read the same way at every call site.)
    public var shown: Int? { if case .number(let n) = self { return n }; return nil }
}

// MARK: - the file

public struct HoodSource: Decodable, Equatable, Sendable {
    public var name: String
    public var url: String
    public var lastEdited: String
    enum CodingKeys: String, CodingKey { case name, url, lastEdited = "last_edited" }
}

/// One year of one neighborhood (or of the whole city). Every field is optional: a year with too little in it
/// says so in words rather than showing a zero.
public struct HoodYear: Decodable, Equatable, Sendable {
    public var sales: HoodCount?
    public var medianPrice: Double?
    public var permits: HoodCount?
    public var permitCost: Double?
    public var blight: HoodCount?
    public var demolitions: HoodCount?
    public var issues: HoodCount?
    public var issueDays: Double?
    public var fires: HoodCount?
    enum CodingKeys: String, CodingKey {
        case sales, permits, blight, demolitions, issues, fires
        case medianPrice = "median_price", permitCost = "permit_cost", issueDays = "issue_days"
    }
    public init() {}
    /// A count that is not a number — the `"lt5"` a file built before 2026-09-22 carried — reads as nothing
    /// recorded, so an older list on a phone still draws every number it does have instead of no page at all.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sales = try? c.decodeIfPresent(HoodCount.self, forKey: .sales)
        medianPrice = try c.decodeIfPresent(Double.self, forKey: .medianPrice)
        permits = try? c.decodeIfPresent(HoodCount.self, forKey: .permits)
        permitCost = try c.decodeIfPresent(Double.self, forKey: .permitCost)
        blight = try? c.decodeIfPresent(HoodCount.self, forKey: .blight)
        demolitions = try? c.decodeIfPresent(HoodCount.self, forKey: .demolitions)
        issues = try? c.decodeIfPresent(HoodCount.self, forKey: .issues)
        issueDays = try c.decodeIfPresent(Double.self, forKey: .issueDays)
        fires = try? c.decodeIfPresent(HoodCount.self, forKey: .fires)
    }
}

public struct HoodRoads: Decodable, Equatable, Sendable {
    public var pieces: HoodCount
    public var miles: Double?
    public var poorPct: Double?
    enum CodingKeys: String, CodingKey { case pieces, miles, poorPct = "poor_pct" }
}

/// Today's numbers rather than a year's: rental certificates in force, vacant registrations of the past twelve
/// months, street ratings.
public struct HoodNow: Decodable, Equatable, Sendable {
    public var rentalCerts: HoodCount?
    public var vacantReg: HoodCount?
    public var roads: HoodRoads?
    enum CodingKeys: String, CodingKey { case rentalCerts = "rental_certs", vacantReg = "vacant_reg", roads }
    /// Same tolerance as `HoodYear`: a value an older file hid reads as nothing recorded.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rentalCerts = try? c.decodeIfPresent(HoodCount.self, forKey: .rentalCerts)
        vacantReg = try? c.decodeIfPresent(HoodCount.self, forKey: .vacantReg)
        roads = try? c.decodeIfPresent(HoodRoads.self, forKey: .roads)
    }
}

/// "Safe streets" (docs/13): crashes the police wrote up that involved someone walking or biking, over the years
/// the panel names. Exact counts. Never a rate — docs/13 defines no denominator here.
public struct HoodCrashes: Decodable, Equatable, Sendable {
    public var walk: HoodCount
    public var bike: HoodCount
    public var severe: HoodCount
    public init(walk: HoodCount, bike: HoodCount, severe: HoodCount) { self.walk = walk; self.bike = bike; self.severe = severe }
}

public struct HoodHelp: Decodable, Equatable, Sendable {
    public var total: Int
    /// How many of our listings of each kind are in or near this neighborhood.
    public var by: [String: Int]
    /// Miles from the middle of the neighborhood to the nearest listed one of each kind; `nil` for none listed.
    public var nearestMiles: [String: Double?]
    /// Which listing that nearest one IS, when the bundle says (`help.nearest_id`, added 2026-09-21). Older
    /// bundles do not carry it, so it is optional and the row is then a distance and nothing more — a screen
    /// never invents a listing to link to.
    public var nearestId: [String: String?]?
    /// The kinds we have nothing listed for. That describes OUR list, never the neighborhood.
    public var noneListedYet: [String]
    public var coverageChecked: Bool
    enum CodingKeys: String, CodingKey {
        case total, by
        case nearestMiles = "nearest_miles", nearestId = "nearest_id"
        case noneListedYet = "none_listed_yet", coverageChecked = "coverage_checked"
    }
}

public struct HoodPlaces: Decodable, Equatable, Sendable {
    public var parks: Int
    public var recCenters: Int
    public var greenwayOpen: Int
    public var snapStores: Int?
    public var busStops: Int?
    enum CodingKeys: String, CodingKey {
        case parks
        case recCenters = "rec_centers", greenwayOpen = "greenway_open", snapStores = "snap_stores", busStops = "bus_stops"
    }
}

public struct HoodNearestCity: Decodable, Equatable, Sendable {
    public var snap: Double?
    public var grocery: Double?
    public var bus: Double?
}

public struct Hood: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    /// The City's name for this place, never ours. It is shown as English wherever the app's own words are not
    /// (the same rule as a listing's own name), so a screen reader reads it in the right voice.
    public var name: String
    public var district: Int?
    public var jlgStudyArea: Bool?
    /// lat, lon of the middle of the neighborhood — the point the "nearest" distances are measured from.
    public var center: [Double]
    /// The outline, as runs of delta-encoded hundred-thousandths of a degree from the file's `origin`. It is
    /// added when the bundle is built, so the pipeline's own copy in `data/indicators/` has none: a file without
    /// outlines still gives every number, and simply draws no shape.
    public var rings: [[Int]]?
    public var help: HoodHelp
    public var places: HoodPlaces
    public var nearestCity: HoodNearestCity?
    /// Assessor parcels — "lots" — the base every per-1,000 rate is over.
    public var parcels: Int?
    public var years: [String: HoodYear]
    public var now: HoodNow?
    public var crashes: HoodCrashes?
    /// The same three counts for each year of the window (2026-09-22). Optional: a bundle built before that day
    /// carries the window only, and the panel then draws the totals and no chart.
    public var crashesByYear: [String: HoodCrashes]?
    enum CodingKeys: String, CodingKey {
        case id, name, district, center, rings, help, places, parcels, years, now, crashes
        case jlgStudyArea = "jlg_study_area", nearestCity = "nearest_city", crashesByYear = "crashes_by_year"
    }
    public var inJLG: Bool { jlgStudyArea == true }
    /// The crash counts of a file built before 2026-09-22 may still say `"lt5"`; such a panel is left out rather
    /// than the whole page refused. Everything else decodes exactly as before.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        district = try c.decodeIfPresent(Int.self, forKey: .district)
        jlgStudyArea = try c.decodeIfPresent(Bool.self, forKey: .jlgStudyArea)
        center = try c.decode([Double].self, forKey: .center)
        rings = try c.decodeIfPresent([[Int]].self, forKey: .rings)
        help = try c.decode(HoodHelp.self, forKey: .help)
        places = try c.decode(HoodPlaces.self, forKey: .places)
        nearestCity = try c.decodeIfPresent(HoodNearestCity.self, forKey: .nearestCity)
        parcels = try c.decodeIfPresent(Int.self, forKey: .parcels)
        years = try c.decode([String: HoodYear].self, forKey: .years)
        now = try c.decodeIfPresent(HoodNow.self, forKey: .now)
        crashes = try? c.decodeIfPresent(HoodCrashes.self, forKey: .crashes)
        crashesByYear = try? c.decodeIfPresent([String: HoodCrashes].self, forKey: .crashesByYear)
    }
}

/// Every dataset behind these numbers, in the order the sources panel prints them. Each one is optional: a bundle
/// built before a dataset was added simply does not draw that panel.
public struct HoodSources: Decodable, Equatable, Sendable {
    public var neighborhoods: HoodSource
    public var sales: HoodSource
    public var permits: HoodSource
    public var blight: HoodSource?
    public var demolitions: HoodSource?
    public var issues: HoodSource?
    public var parcels: HoodSource?
    public var snap: HoodSource?
    public var busStops: HoodSource?
    public var rentals: HoodSource?
    public var fires: HoodSource?
    public var pavement: HoodSource?
    public var vacant: HoodSource?
    public var crashes: HoodSource?
    enum CodingKeys: String, CodingKey {
        case neighborhoods, sales, permits, blight, demolitions, issues, parcels, snap, rentals, fires, pavement,
             vacant, crashes
        case busStops = "bus_stops"
    }

    /// The order the web app lists them in at the foot of a neighborhood page (`hoodPage`, apps/web/src/hoods.ts).
    public var inPageOrder: [HoodSource] {
        [sales, permits, rentals, blight, demolitions, issues, fires, vacant, pavement, parcels, snap, busStops,
         crashes, neighborhoods].compactMap { $0 }
    }
}

public struct Indicators: Decodable, Equatable, Sendable {
    public var sources: HoodSources
    public var cityParcels: Int?
    public var issueTypes: [String]?
    public var fireTypes: [String]?
    public var cityNow: HoodNow?
    public var roadsYears: [Int]?
    public var vacantPeriod: [String]?
    public var crashYears: [Int]?
    public var cityCrashes: HoodCrashes?
    public var cityCrashesByYear: [String: HoodCrashes]?
    public var crashRecordsFrom: String?
    public var statsFetchedAt: String
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sources = try c.decode(HoodSources.self, forKey: .sources)
        cityParcels = try c.decodeIfPresent(Int.self, forKey: .cityParcels)
        issueTypes = try c.decodeIfPresent([String].self, forKey: .issueTypes)
        fireTypes = try c.decodeIfPresent([String].self, forKey: .fireTypes)
        cityNow = try c.decodeIfPresent(HoodNow.self, forKey: .cityNow)
        roadsYears = try c.decodeIfPresent([Int].self, forKey: .roadsYears)
        vacantPeriod = try c.decodeIfPresent([String].self, forKey: .vacantPeriod)
        crashYears = try c.decodeIfPresent([Int].self, forKey: .crashYears)
        cityCrashes = try? c.decodeIfPresent(HoodCrashes.self, forKey: .cityCrashes)
        cityCrashesByYear = try? c.decodeIfPresent([String: HoodCrashes].self, forKey: .cityCrashesByYear)
        crashRecordsFrom = try c.decodeIfPresent(String.self, forKey: .crashRecordsFrom)
        statsFetchedAt = try c.decode(String.self, forKey: .statsFetchedAt)
        firstYear = try c.decode(Int.self, forKey: .firstYear)
        partialYear = try c.decode(Int.self, forKey: .partialYear)
        nearMiles = try c.decode(Double.self, forKey: .nearMiles)
        origin = try c.decode([Double].self, forKey: .origin)
        city = try c.decode([String: HoodYear].self, forKey: .city)
        neighborhoods = try c.decode([Hood].self, forKey: .neighborhoods)
        segments = try c.decode([String: [String]].self, forKey: .segments)
    }
    public var firstYear: Int
    /// The year that is still running: its row is labelled "so far", never compared as if it were finished.
    public var partialYear: Int
    /// How far outside a neighborhood a listing still counts as reachable from it.
    public var nearMiles: Double
    /// lon, lat the outlines are delta-encoded from.
    public var origin: [Double]
    public var city: [String: HoodYear]
    public var neighborhoods: [Hood]
    /// Greenway stretch id → the neighborhoods it runs through.
    public var segments: [String: [String]]
    /// The four cities (DECISIONS 2026-09-22), all optional: a bundle built before the city pages carries none
    /// of them and every screen that existed before behaves exactly as it did.
    public var cities: [CityRow]?
    public var areas: [Area]?
    public var areaSources: [String: AreaSource]?
    public var pavementYear: Int?
    public var permitYears: [Int]?

    enum CodingKeys: String, CodingKey {
        case sources, origin, city, neighborhoods, segments, cities, areas
        case areaSources = "area_sources", pavementYear = "pavement_year", permitYears = "permit_years"
        case cityParcels = "city_parcels", issueTypes = "issue_types", fireTypes = "fire_types", cityNow = "city_now"
        case roadsYears = "roads_years", vacantPeriod = "vacant_period", crashYears = "crash_years"
        case cityCrashes = "city_crashes", cityCrashesByYear = "city_crashes_by_year", crashRecordsFrom = "crash_records_from", statsFetchedAt = "stats_fetched_at"
        case firstYear = "first_year", partialYear = "partial_year", nearMiles = "near_miles"
    }

    /// The years every table has a column for, oldest first: the whole-city table's own years, as on the web.
    public var years: [String] { city.keys.sorted() }
}

// MARK: - reading the file

public enum HoodsFile {
    /// The name this file has in the signed index. It is NOT loaded with the rest of the bundle
    /// (`BundleCheck.loadedNow`): it is a quarter of a megabyte and only the Neighborhoods tab wants it.
    public static let name = "indicators/neighborhoods.json"

    /// Decode the numbers — but only after the bytes have been held to the checksum the **signed** index gives
    /// them. A file that does not match is not used; it is never "close enough". This is the same check, in the
    /// same order, that every map file goes through (HelpApp/MapModel.swift).
    public static func decode(_ data: Data, sha256 expected: String) throws -> Indicators {
        guard BundleCheck.sha256Hex(data) == expected else { throw BundleError.badChecksum(name) }
        do { return try JSONDecoder().decode(Indicators.self, from: data) }
        catch { throw BundleError.notJSON }
    }
}

// MARK: - the outline

/// The corners of a neighborhood's outline as lat/lon, undoing the delta encoding: the same three lines as
/// `outline()` in apps/web/src/hoods.ts, so both apps draw the same shape.
public func hoodOutline(_ h: Hood, origin: [Double]) -> [[LatLon]] {
    guard origin.count >= 2 else { return [] }
    return (h.rings ?? []).map { enc in
        var out: [LatLon] = []
        out.reserveCapacity(enc.count / 2)
        var x = 0, y = 0
        var i = 0
        while i + 1 < enc.count {
            x += enc[i]; y += enc[i + 1]
            out.append(LatLon(lat: origin[1] + Double(y) / 1e5, lon: origin[0] + Double(x) / 1e5))
            i += 2
        }
        return out
    }
}

// MARK: - which neighborhood a point is in

/**
 Whether a point is inside a neighborhood's outline: a ray cast east, counting crossings, over every ring
 (even-odd, so a ring cut out of another is a hole and not a second inside).

 This is the whole of "Use my location" on the Neighborhoods tab. It runs HERE, on the phone, against outlines
 that arrived in the signed bundle — the position is never sent anywhere to be looked up, and it is never
 written down (docs/08). A fix that is not a number, or that is outside the four cities, is inside nothing.
 */
public func hoodContains(_ h: Hood, _ p: LatLon, origin: [Double]) -> Bool {
    guard p.lat.isFinite, p.lon.isFinite else { return false }
    return hoodContains(rings: hoodOutline(h, origin: origin), p)
}

/// The same test against rings that have already been decoded, so a whole-city search decodes each outline once.
public func hoodContains(rings: [[LatLon]], _ p: LatLon) -> Bool {
    guard p.lat.isFinite, p.lon.isFinite else { return false }
    var inside = false
    for ring in rings where ring.count >= 3 {
        var j = ring.count - 1
        for i in 0..<ring.count {
            let a = ring[i], b = ring[j]
            if (a.lat > p.lat) != (b.lat > p.lat) {
                let x = (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon
                if p.lon < x { inside.toggle() }
            }
            j = i
        }
    }
    return inside
}

/// A neighborhood's whole outline as a box, for throwing away the 204 that cannot possibly contain a point.
/// Every ring, not just the first: the web's `boxHolds` walks them all, and a neighborhood drawn in two pieces
/// would otherwise lose the second one.
public func hoodBox(_ rings: [[LatLon]]) -> (minLat: Double, maxLat: Double, minLon: Double, maxLon: Double)? {
    var b: (minLat: Double, maxLat: Double, minLon: Double, maxLon: Double)?
    for ring in rings {
        for p in ring {
            if var box = b {
                box.minLat = min(box.minLat, p.lat); box.maxLat = max(box.maxLat, p.lat)
                box.minLon = min(box.minLon, p.lon); box.maxLon = max(box.maxLon, p.lon)
                b = box
            } else {
                b = (p.lat, p.lat, p.lon, p.lon)
            }
        }
    }
    return b
}

extension Indicators {
    /// The neighborhood a point is in, or `nil` — which is the honest answer for Hamtramck, Highland Park,
    /// Dearborn, the river, and anywhere else that is not one of Detroit's 205. The caller says so in words;
    /// it never picks the closest one instead.
    public func neighborhood(containing p: LatLon) -> Hood? {
        guard p.lat.isFinite, p.lon.isFinite else { return nil }
        for h in neighborhoods {
            let rings = hoodOutline(h, origin: origin)
            guard let box = hoodBox(rings) else { continue }
            // A quick reject on the outline's box: 205 outlines, one point, on a cheap phone (the web's `boxHolds`).
            if p.lat < box.minLat || p.lat > box.maxLat || p.lon < box.minLon || p.lon > box.maxLon { continue }
            if hoodContains(rings: rings, p) { return h }
        }
        return nil
    }

    public func hood(id: String) -> Hood? { neighborhoods.first { $0.id == id } }

    /// The neighborhoods a greenway stretch runs through, in the list's own order.
    public func neighborhoods(alongSegment id: String) -> [Hood] {
        (segments[id] ?? []).compactMap { hood(id: $0) }
    }
}

// MARK: - the index: A–Z, and by council district

/// A–Z by name, and by nothing else. Never by a number: there are no league tables of neighborhoods (docs/13,
/// honesty rule 1).
///
/// The comparison is the web's `byName` — JavaScript's `localeCompare` — which files "LaSalle Gardens" after
/// "Lafayette Park" and ignores the hyphen in "Gratiot-Findlay", where a plain byte comparison does neither. It
/// is pinned to `en_US` rather than the phone's language, so the 205 come back in one order for everybody and a
/// screenshot of the Arabic app can be read against the English one line for line.
public func hoodsAlphabetical(_ list: [Hood]) -> [Hood] {
    let collation = Locale(identifier: "en_US")
    return list.sorted { a, b in
        switch a.name.compare(b.name, options: [.caseInsensitive], range: nil, locale: collation) {
        case .orderedAscending: return true
        case .orderedDescending: return false
        case .orderedSame: return a.id < b.id
        }
    }
}

/// One heading on the index when it is grouped: a council district, or the neighborhoods with none listed.
public struct HoodDistrict: Equatable, Sendable, Identifiable {
    public var district: Int?
    public var hoods: [Hood]
    public var id: String { district.map(String.init) ?? "none" }
}

/// Council districts 1 to 7, then anything with no district, each group A–Z inside itself. The groups are in
/// district order because that is how the City numbers them, which is not a ranking of anything.
public func hoodsByDistrict(_ list: [Hood]) -> [HoodDistrict] {
    let sorted = hoodsAlphabetical(list)
    let districts = Set(sorted.compactMap(\.district)).sorted().map { Optional($0) } + [nil]
    return districts.compactMap { d in
        let items = sorted.filter { $0.district == d }
        return items.isEmpty ? nil : HoodDistrict(district: d, hoods: items)
    }
}

/**
 Nearest first, from a point this phone worked out for itself — a location, the middle of a typed ZIP, or a
 junction typed into the cross-street field.

 **It is still not a ranking** (docs/13, honesty rule 1): a distance to the middle of an outline says how far
 away a place is, never how good it is, and the only other thing this function can read is the name it breaks
 ties with. The arithmetic is the web's `away` in apps/web/src/hoodfind.ts — flat units, longitude squeezed by
 0.74, comparisons only — so one bundle and one point always give one list on all three clients.
 */
public func hoodsNearestFirst(_ list: [Hood], to p: LatLon) -> [Hood] {
    func away(_ h: Hood) -> Double {
        guard h.center.count >= 2 else { return .infinity }
        return hypot((h.center[1] - p.lon) * 0.74, h.center[0] - p.lat)
    }
    let byName = hoodsAlphabetical(list)
    return byName.enumerated()
        .sorted { a, b in
            let (x, y) = (away(a.element), away(b.element))
            return x != y ? x < y : a.offset < b.offset
        }
        .map(\.element)
}

/// A name flattened for matching what a person types against a name the City wrote: accents dropped, case
/// dropped, every run of punctuation turned into one space. The web's `foldName` in apps/web/src/hoodfind.ts,
/// so "Campau/Banglatown" is two words on all three clients and "Déjà" matches "deja".
public func hoodFold(_ s: String) -> String {
    let flat = s.folding(options: [.diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "en_US")).lowercased()
    var spaced = ""
    for ch in flat { spaced.append((ch.isLetter || ch.isNumber) && ch.isASCII ? ch : " ") }
    return spaced.split(separator: " ", omittingEmptySubsequences: true).joined(separator: " ")
}

/// The letter a name is filed under on the A–Z index; an empty string for a name that starts with anything else,
/// which is the one "Other" group at the end. The web's `letterOf`.
public func hoodLetter(_ h: Hood) -> String {
    guard let c = hoodFold(h.name).first, c.isLetter else { return "" }
    return String(c).uppercased()
}

/**
 Search as you type, over the 205 names — the web's `matchHoods`, case for case.

 A typed word matches a name when a WORD OF THE NAME starts with it, so "park" finds "Palmer Park" and
 "Park Grove" but not "Sparkle", and every word typed has to match something. What comes back is in the A–Z
 order, exactly as with no filter at all: a filter narrows a list, it never re-ranks one (docs/13, rule 1).
 */
public func hoodsMatching(_ list: [Hood], query: String) -> [Hood] {
    let words = hoodFold(query).split(separator: " ").map(String.init)
    guard !words.isEmpty else { return hoodsAlphabetical(list) }
    return hoodsAlphabetical(list.filter { h in
        let parts = hoodFold(h.name).split(separator: " ").map(String.init)
        return words.allSatisfy { w in parts.contains { $0.hasPrefix(w) } }
    })
}

// MARK: - the order the kinds of help are listed in

/// The kinds of help counted for a neighborhood, in the order the panel lists them. It is `HELP_TOPS` in
/// `pipeline/src/indicators.ts`, written out here because a JSON object's order does not survive being decoded
/// into a Swift dictionary — and the iPhone must list them in the same order as the web page, not in whatever
/// order a hash table hands back. AppParityTests holds the two lists together.
public let hoodHelpKinds = ["food", "health", "harm", "shelter", "utilities", "hygiene", "youth", "rec", "jobs",
                           "learn", "treatment", "housing", "legal", "ids", "money", "goods", "kids", "connect",
                           "transport", "pets"]

/// The four "nearest listed" rows, in the order `hoodPage` prints them (apps/web/src/hoods.ts).
public let hoodNearestKinds = ["food", "clinic", "narcan", "indoors"]

extension HoodHelp {
    /// The kinds this neighborhood has something listed for, in the panel's order and never re-sorted by count.
    public var kindsWithSomething: [(kind: String, count: Int)] {
        hoodHelpKinds.compactMap { k in (by[k] ?? 0) > 0 ? (k, by[k]!) : nil }
    }

    /**
     The listing the "nearest {kind}" row is about, when the row may open it.

     Four things have to be true, and any one of them failing leaves the row a plain distance:
     - the bundle says which listing it is (an older bundle does not),
     - that listing is still in the list this phone holds (a row is never a dead end),
     - it is not private or sensitive — a domestic-violence shelter, a crisis line, treatment, help after an
       assault. Those never appear on a neighborhood page at all: a page about a place must not tell anyone who
       reads it over a person's shoulder which of those they may have been looking at (docs/08),
     - and it is a listing id, not something else that happens to be in the file.
     */
    public func nearestListing(kind: String, in rows: [BundleRow]) -> BundleRow? {
        guard let id = (nearestId?[kind] ?? nil), id.hasPrefix("sal_") else { return nil }
        guard let row = rows.first(where: { $0.id == id }) else { return nil }
        return isPrivate(row.category) ? nil : row
    }
}

// MARK: - the formatting rules

/**
 How a number is written on a neighborhood screen, as pure arithmetic and string building — the Swift half of the
 money, count and rate rules in apps/web/src/hoods.ts.

 **Nothing here goes through `NumberFormatter`, `formatted()` or `String(format:)`.** Those belong to the
 platform, and the platform is not the same on both sides of CI: swift-corelibs-foundation on Linux does not
 honour the fraction-digit settings Darwin does, so `9.44` came out "9.4" on a Mac and "9.44" on the Linux runner
 (PR #10, 2026-09-21). What a person reads must not depend on which machine built the app, so the rounding is
 done with `.rounded()` — half away from zero, which is what JavaScript's `toFixed` and `Intl` do — and the
 digits are laid out by hand. Western digits, always (DECISIONS 2026-09-20).

 Dollars are written the way the sale record and the permit write them: "$85,000", "$107.8M", with the sign in
 front, in every one of the app's languages. That is not our invention — it is what `Intl` gives for `en-US`, and
 the web falls back to `en-US` whenever a language would move the currency sign to the far end of the line, which
 Arabic and Bengali both do. Spanish keeps the sign in front and so keeps its own spacing: "$107.8 M".
 */
public enum HoodFormat {

    // MARK: laying out the digits

    /// Thousands separators, by hand: "1234567" becomes "1,234,567". The comma is `en-US`'s, which is what the
    /// web shows in English, Spanish and Arabic alike; Bengali groups by lakh above 99,999, and the only grouped
    /// numbers on this screen are crash counts in the hundreds, which are written the same either way.
    static func grouping(_ digits: String) -> String {
        guard digits.count > 3 else { return digits }
        var out = "", n = 0
        for ch in digits.reversed() {
            if n > 0 && n % 3 == 0 { out.append(",") }
            out.append(ch)
            n += 1
        }
        return String(out.reversed())
    }

    /**
     `|x|` multiplied by `10^places` and rounded to a whole number, **exactly** — the integer JavaScript's
     `toFixed` picks: the one closest to the true value of the double, and the larger of the two when it is
     caught exactly between them.

     It has to be exact, because `x * 10` is not. The double nearest to 0.95 is a hair BELOW it
     (0.94999999999999995559…), so `toFixed(1)` writes "0.9" — but `0.95 * 10` in floating point rounds to
     exactly 9.5, which then rounds up to "1.0". One digit, two answers, from the same number. So the value is
     taken apart into the integer and the power of two it really is (`x = significand × 2^exponent`) and the
     scaling is done in whole numbers, where nothing can drift.

     `nil` when the number is too large or too small for that arithmetic to fit in 64 bits — far outside
     anything a neighborhood screen shows, and the caller then falls back to plain floating point.
     */
    static func scaledDigits(_ x: Double, places: Int) -> UInt64? {
        guard x.isFinite, x >= 0 else { return nil }
        guard (0...3).contains(places) else { return nil }
        // Zero, and anything too small to have a leading bit of its own, round to nothing at three places or fewer.
        guard x.isNormal else { return 0 }
        let pow10: UInt64 = [1, 10, 100, 1000][places]
        let significand = x.significandBitPattern | (1 << 52)      // the implicit leading bit, restored
        let exponent = x.exponent - 52                             // x == significand × 2^exponent, exactly
        let (numerator, overflowed) = significand.multipliedReportingOverflow(by: pow10)
        guard !overflowed else { return nil }
        if exponent >= 0 {
            guard exponent < 64 else { return nil }
            let (whole, over) = numerator.multipliedReportingOverflow(by: 1 << UInt64(exponent))
            return over ? nil : whole                              // a whole number already: nothing to round
        }
        let shift = -exponent
        // A shift this big means the number is under 2^-11 — smaller than half of the last place three decimals
        // can hold — so it rounds to nothing, and there is nothing to divide.
        guard shift < 64 else { return 0 }
        let denominator: UInt64 = 1 << UInt64(shift)
        let quotient = numerator / denominator, remainder = numerator % denominator
        // Half away from zero, which for a magnitude is `toFixed`'s "pick the larger n".
        let (twice, over) = remainder.multipliedReportingOverflow(by: 2)
        return (over || twice >= denominator) ? quotient + 1 : quotient
    }

    /**
     `n` to exactly `decimals` places, the way JavaScript's `toFixed` writes it: rounded half away from zero,
     trailing zeros kept ("10.0"), grouped only when asked.
     */
    static func fixed(_ n: Double, decimals: Int, grouped: Bool) -> String {
        guard n.isFinite else { return "0" }
        let places = max(0, min(3, decimals))
        let unit: UInt64 = [1, 10, 100, 1000][places]
        guard let whole = scaledDigits(abs(n), places: places) else {
            // Nothing this screen shows reaches here; a number that does is printed rather than dropped.
            return String(n)
        }
        let sign = n < 0 && whole > 0 ? "-" : ""
        var text = String(whole / unit)
        if grouped { text = grouping(text) }
        guard places > 0 else { return sign + text }
        let frac = String(whole % unit)
        return sign + text + "." + String(repeating: "0", count: places - frac.count) + frac
    }

    /// A number to a fixed number of places, ungrouped: `toFixed` on the web, which is how every number in a year
    /// table, every distance and every percentage is written there.
    public static func number(_ n: Double, decimals: Int = 0) -> String { fixed(n, decimals: decimals, grouped: false) }

    /// A number with thousands separators — what `Intl.NumberFormat` gives, and what the web uses for the crash
    /// counts and the whole-city figure beside them.
    public static func grouped(_ n: Double, decimals: Int = 0) -> String { fixed(n, decimals: decimals, grouped: true) }

    /// A number written the way a JavaScript template writes one — `${0.5}` is "0.5" and `${2}` is "2" — for the
    /// few values the web drops straight into a sentence without rounding them first: how far "nearby" reaches,
    /// the share of main streets rated poor, the days a reported problem took to close.
    public static func loose(_ n: Double) -> String {
        n == n.rounded() && abs(n) < 9e15 ? fixed(n, decimals: 0, grouped: false) : fixed(n, decimals: 1, grouped: false)
    }

    // MARK: money

    /// "$85,000": whole dollars, grouped, with the sign in front of the amount and the minus in front of that.
    public static func money(_ n: Double) -> String {
        let digits = fixed(abs(n), decimals: 0, grouped: true)
        return (n < 0 && digits != "0" ? "-" : "") + "$" + digits
    }

    /// The scale suffixes. `Intl` has no long words for a **currency** in compact notation — ask it for
    /// `compactDisplay: 'long'` with `style: 'currency'` and CLDR hands back the short form anyway — so the web
    /// renders "$107.8M", and so do we. Spanish puts a space before the suffix and has no short form for a
    /// thousand million: `es-US` writes $1.2 billion as "$1200 M", keeping "B" for a million million.
    static func scaleSteps(_ language: String) -> [(value: Double, suffix: String)] {
        language == "es"
            ? [(1e12, "B"), (1e6, "M"), (1e3, "K")]
            : [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]
    }

    /// "$107.8M": a whole year's permit cost, where the exact dollar is noise and the size is the fact. Under a
    /// thousand it is a plain price. One decimal at most, and never a pointless ".0".
    public static func bigMoney(_ n: Double, language: String) -> String {
        let magnitude = abs(n)
        let sign = n < 0 ? "-" : ""
        let steps = scaleSteps(language)
        let space = language == "es" ? " " : ""
        guard var step = steps.first(where: { magnitude >= $0.value }) else {
            return sign + "$" + trimmed(magnitude, decimals: 1)      // "$850", "$999.5"
        }
        // Rounding can carry a number over its own step — 999,999 rounds to "1000K", which nobody writes — so it
        // moves up, but only to a step exactly a thousand times this one. Spanish has no such step between a
        // million and a million million, and writes "$1200 M" there, exactly as `es-US` does.
        if (scaledDigits(magnitude / step.value, places: 1) ?? 0) >= 10_000,
           let next = steps.first(where: { $0.value == step.value * 1000 }) { step = next }
        return sign + "$" + trimmed(magnitude / step.value, decimals: 1) + space + step.suffix
    }

    /// One decimal at most, with a bare ".0" dropped: "107.8", "2", "1200".
    static func trimmed(_ n: Double, decimals: Int) -> String {
        let text = fixed(n, decimals: decimals, grouped: false)
        guard text.hasSuffix(".0") else { return text }
        return String(text.dropLast(2))
    }

    // MARK: rates and counts

    /// Per 1,000 lots. No rate without a base we can defend: a neighborhood with fewer than a hundred lots in it
    /// has no rate (honesty rule 3).
    public static func rate(_ c: HoodCount?, parcels: Int?) -> Double? {
        guard let n = c?.shown, let p = parcels, p >= 100 else { return nil }
        return Double(n) / Double(p) * 1000
    }

    /// A rate as it is printed: one decimal under ten, none above it. The web's `fmtRate`, ungrouped as there.
    public static func rateText(_ r: Double) -> String { number(r, decimals: r < 10 ? 1 : 0) }

    /**
     A count as a person reads it: the number, or "none recorded" when there is nothing at all. The sentence is the
     app's own words, handed in by the screen; the rule is the web's `count()` and `show()`.
     */
    public static func count(_ c: HoodCount?, none: String, grouped useGrouping: Bool = false) -> String {
        switch c {
        case .none: return none
        case .number(let n): return fixed(Double(n), decimals: 0, grouped: useGrouping)
        }
    }

    /// The latest year with a number in any of the given fields: the year the "at a glance" row names.
    public static func latestYear(_ h: Hood, _ d: Indicators, fields: [(HoodYear) -> Bool]) -> String? {
        d.years.reversed().first { y in
            let year = h.years[y] ?? HoodYear()
            return fields.contains { $0(year) }
        }
    }
}

/// SEMCOG asks for this sentence wherever their data is reproduced, and it is theirs, so it stays in their words:
/// the same English on an Arabic, Bengali or Spanish screen, marked as English so a screen reader says it in an
/// English voice (WCAG 3.1.2), never machine-translated. Byte for byte the web's `SEMCOG_NOTICE`.
public let semcogNotice = "Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."
