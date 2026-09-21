// The neighborhood numbers (docs/13), in numbers only: no UIKit, no SwiftUI, so `swift test` runs every rule here
// on Linux as well. This is the Swift half of `apps/web/src/hoods.ts`, and it is deliberately a port rather than a
// rewrite: the same file, the same fields, the same suppression, the same rates, the same words.
//
// What comes from where. `indicators/neighborhoods.json` is built by the pipeline from PUBLIC City and SEMCOG
// datasets joined with our own listings. Nothing in it comes from a phone, a report, or app usage (docs/13), and
// nothing here sends anything anywhere: the file arrives with the signed bundle and is checked against the
// checksum in the signed index before a byte of it is decoded, exactly as a map file is.
//
// The honesty rules that live in this file, the same three as the web's:
//  1. No ranking. `hoodsAlphabetical` and `hoodsByDistrict` sort by name and by council district and by nothing
//     else; `testIndexOrderNeverDependsOnAnIndicator` holds them to it.
//  2. Small counts arrive already hidden (`"lt5"`) and are shown as WORDS, never as a number and never as zero.
//  3. A rate needs a count we can show and a base we can defend (at least 100 lots), or there is no rate.
import DetroitQuery
import Foundation

// MARK: - a count that may be too small to show

/// A count the pipeline either gives as a number or hides as `"lt5"` — "fewer than 5" (docs/13). There is
/// deliberately no way to get a number out of a hidden one: it is not 4, it is not 0, it is not shown.
public enum HoodCount: Equatable, Sendable, Decodable {
    case number(Int)
    /// `"lt5"` in the file: under five, so the City's own suppression rule hides it and so do we.
    case suppressed

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { self = .number(n); return }
        let s = try c.decode(String.self)
        guard s == "lt5" else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "a count is a number or \"lt5\", not \(s)")
        }
        self = .suppressed
    }

    /// The number, when there is one to show. `nil` for a hidden count, so no caller can accidentally print it.
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
}

/// "Safe streets" (docs/13): crashes the police wrote up that involved someone walking or biking, over the years
/// the panel names. Plain counts, hidden under five. Never a rate — docs/13 defines no denominator here.
public struct HoodCrashes: Decodable, Equatable, Sendable {
    public var walk: HoodCount
    public var bike: HoodCount
    public var severe: HoodCount
}

public struct HoodHelp: Decodable, Equatable, Sendable {
    public var total: Int
    /// How many of our listings of each kind are in or near this neighborhood.
    public var by: [String: Int]
    /// Miles from the middle of the neighborhood to the nearest listed one of each kind; `nil` for none listed.
    public var nearestMiles: [String: Double?]
    /// The kinds we have nothing listed for. That describes OUR list, never the neighborhood.
    public var noneListedYet: [String]
    public var coverageChecked: Bool
    enum CodingKeys: String, CodingKey {
        case total, by
        case nearestMiles = "nearest_miles", noneListedYet = "none_listed_yet", coverageChecked = "coverage_checked"
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
    enum CodingKeys: String, CodingKey {
        case id, name, district, center, rings, help, places, parcels, years, now, crashes
        case jlgStudyArea = "jlg_study_area", nearestCity = "nearest_city"
    }
    public var inJLG: Bool { jlgStudyArea == true }
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
    public var crashRecordsFrom: String?
    public var statsFetchedAt: String
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

    enum CodingKeys: String, CodingKey {
        case sources, origin, city, neighborhoods, segments
        case cityParcels = "city_parcels", issueTypes = "issue_types", fireTypes = "fire_types", cityNow = "city_now"
        case roadsYears = "roads_years", vacantPeriod = "vacant_period", crashYears = "crash_years"
        case cityCrashes = "city_crashes", crashRecordsFrom = "crash_records_from", statsFetchedAt = "stats_fetched_at"
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
}

// MARK: - the formatting rules

/**
 How a number is written on a neighborhood screen, as pure functions — the Swift half of the money, count and
 rate rules in apps/web/src/hoods.ts.

 Dollars are written the way the sale record and the permit write them: "$85,000", "$1.2 million", with the sign
 in front and Western digits, in every one of the app's languages (DECISIONS 2026-09-20, and the same rule the
 web applies by falling back to `en-US` whenever a language would move the sign to the far end). Counts, which
 carry no unit, follow the language.
 */
public enum HoodFormat {
    /// The scale words, for the one language that keeps the sign in front and so keeps its own words. Every other
    /// language falls back to English here for the same reason the web's `dollars()` does: with the amount in
    /// Arabic or Bengali the currency sign lands at the end of the line, and the whole point of this rule is that
    /// it does not. Spanish writes "$1.2 millones", which is what `es-US` gives on the web.
    static let scaleWords: [String: [String]] = [
        "en": ["thousand", "million", "billion", "trillion"],
        "es": ["mil", "millones", "mil millones", "billones"],
    ]

    /// "$85,000". Western digits and a leading sign, whatever the language (see the note above).
    public static func money(_ n: Double, locale: Locale) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.locale = locale
        f.maximumFractionDigits = 0
        f.minimumFractionDigits = 0
        let mine = f.string(from: NSNumber(value: n)) ?? ""
        if mine.hasPrefix("$") { return mine }
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: n)) ?? "$\(Int(n.rounded()))"
    }

    /// "$1.2 million": the permit cost of a whole year, where the exact dollar is noise and the size is the fact.
    /// Under a thousand it is simply `money`.
    public static func bigMoney(_ n: Double, language: String, locale: Locale) -> String {
        let words = scaleWords[language] ?? scaleWords["en"]!
        let magnitude = abs(n)
        let steps: [(Double, String)] = [(1e12, words[3]), (1e9, words[2]), (1e6, words[1]), (1e3, words[0])]
        guard let step = steps.first(where: { magnitude >= $0.0 }) else { return money(n, locale: locale) }
        let scaled = (n / step.0 * 10).rounded() / 10
        // One decimal at most, and never a pointless ".0".
        let digits = scaled == scaled.rounded() ? String(Int(scaled)) : String(format: "%.1f", scaled)
        return "$" + digits + " " + step.1
    }

    /// Per 1,000 lots. No rate without a count we can show AND a base we can defend: a hidden count has no rate,
    /// and neither has a neighborhood with fewer than a hundred lots in it (honesty rules 2 and 3).
    public static func rate(_ c: HoodCount?, parcels: Int?) -> Double? {
        guard let n = c?.shown, let p = parcels, p >= 100 else { return nil }
        return Double(n) / Double(p) * 1000
    }

    /// A rate as it is printed: one decimal under ten, none above it.
    public static func rateText(_ r: Double, locale: Locale) -> String {
        number(r, decimals: r < 10 ? 1 : 0, locale: locale)
    }

    /// A plain number in the phone's language (Western digits everywhere: `L.locale`).
    public static func number(_ n: Double, decimals: Int, locale: Locale) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = locale
        f.maximumFractionDigits = decimals
        f.minimumFractionDigits = decimals
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    /**
     A count as a person reads it: the number, "fewer than 5" when the pipeline hid it, or "none recorded" when
     there is nothing at all. The two sentences are the app's own words, handed in by the screen — the rule of
     which one to use is what lives here, and it is the rule the web applies in `count()` and `show()`.

     There is no branch that turns a hidden count into a digit. That is the point of it.
     */
    public static func count(_ c: HoodCount?, locale: Locale, none: String, fewerThanFive: String) -> String {
        switch c {
        case .none: return none
        case .suppressed: return fewerThanFive
        case .number(let n): return number(Double(n), decimals: 0, locale: locale)
        }
    }
}

/// SEMCOG asks for this sentence wherever their data is reproduced, and it is theirs, so it stays in their words:
/// the same English on an Arabic, Bengali or Spanish screen, marked as English so a screen reader says it in an
/// English voice (WCAG 3.1.2), never machine-translated. Byte for byte the web's `SEMCOG_NOTICE`.
public let semcogNotice = "Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."
