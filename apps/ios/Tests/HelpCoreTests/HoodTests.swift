// The neighborhood rules (docs/13), tested where they live: decoding, which neighborhood a point is in, the order
// of the index, the search box, and every way a number is written. No UIKit and no simulator, so these run with
// `swift test` on macOS and on Linux in CI.
//
// Two kinds of test are here on purpose. The ones built on a made-up square always run and pin the rules exactly.
// The ones that read the repository's own `data/indicators/neighborhoods.json` (committed) and the built bundle
// (not committed — skipped when it is not there) prove the rules survive the real 205.
import XCTest
@testable import DetroitQuery
@testable import HelpCore

final class HoodTests: XCTestCase {

    /// This file is `apps/ios/Tests/HelpCoreTests/HoodTests.swift`: the repository root is five levels up.
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private let en = Locale(identifier: "en_US")

    // MARK: - a made-up neighborhood, so the geometry has a known answer

    /// A one-hundredth-of-a-degree square whose bottom-left corner is at the file's origin, delta-encoded exactly
    /// as the pipeline encodes a real one.
    private func square(id: String, name: String, district: Int? = 1) -> Hood {
        let ring = [0, 0, 1000, 0, 0, 1000, -1000, 0, 0, -1000]      // x, y deltas in 1e-5 degrees
        let json = """
        {"id":"\(id)","name":"\(name)","district":\(district.map(String.init) ?? "null"),
         "center":[42.225,-83.315],"rings":[\(ring)],
         "help":{"total":0,"by":{},"nearest_miles":{"food":null},"none_listed_yet":["food"],"coverage_checked":false},
         "places":{"parks":0,"rec_centers":0,"greenway_open":0},"years":{}}
        """
        return try! JSONDecoder().decode(Hood.self, from: Data(json.utf8))
    }

    private let origin = [-83.32, 42.22]

    func testAPointInsideTheSquareIsFoundAndAPointOutsideIsNot() {
        let h = square(id: "nbh_test", name: "Test")
        let rings = hoodOutline(h, origin: origin)
        XCTAssertEqual(rings.count, 1)
        XCTAssertEqual(rings[0].count, 5)
        XCTAssertEqual(rings[0][0].lat, 42.22, accuracy: 1e-9)
        XCTAssertEqual(rings[0][0].lon, -83.32, accuracy: 1e-9)
        XCTAssertEqual(rings[0][2].lat, 42.23, accuracy: 1e-9)
        XCTAssertEqual(rings[0][2].lon, -83.31, accuracy: 1e-9)

        XCTAssertTrue(hoodContains(h, LatLon(lat: 42.225, lon: -83.315), origin: origin), "the middle is inside")
        XCTAssertFalse(hoodContains(h, LatLon(lat: 42.225, lon: -83.30), origin: origin), "east of it is outside")
        XCTAssertFalse(hoodContains(h, LatLon(lat: 42.24, lon: -83.315), origin: origin), "north of it is outside")
        XCTAssertFalse(hoodContains(h, LatLon(lat: .nan, lon: -83.315), origin: origin), "a fix that is not a number is inside nothing")
    }

    func testAPointInsideNoNeighborhoodIsNoNeighborhood() throws {
        let d = try indicators(neighborhoods: [square(id: "nbh_test", name: "Test")])
        XCTAssertEqual(d.neighborhood(containing: LatLon(lat: 42.225, lon: -83.315))?.id, "nbh_test")
        // Dearborn, Hamtramck, Highland Park, the river: in the service area, in no Detroit neighborhood.
        XCTAssertNil(d.neighborhood(containing: LatLon(lat: 42.31, lon: -83.21)))
    }

    // MARK: - the index

    /// The order of the index is A–Z and, grouped, by council district. It never depends on a number about a
    /// place. This is honesty rule 1 of docs/13, and it is the one rule a well-meaning change is most likely to
    /// break, so it is tested by CHANGING every indicator and demanding the same order back.
    func testIndexOrderNeverDependsOnAnIndicator() throws {
        let d = try realIndicators()
        let before = hoodsAlphabetical(d.neighborhoods).map(\.id)
        let grouped = hoodsByDistrict(d.neighborhoods).map { ($0.district, $0.hoods.map(\.id)) }

        // Every number turned upside down: the help counts, the parcels, the crashes, the years, the places.
        var scrambled = d.neighborhoods
        for i in scrambled.indices {
            scrambled[i].help.total = scrambled.count - i
            scrambled[i].parcels = (i * 7919) % 50_000
            scrambled[i].crashes = HoodCrashes(walk: .number(i), bike: .suppressed, severe: .number(1000 - i))
            scrambled[i].years = [:]
            scrambled[i].now = nil
            scrambled[i].places = HoodPlaces(parks: i, recCenters: i, greenwayOpen: i, snapStores: i, busStops: i)
        }
        XCTAssertEqual(hoodsAlphabetical(scrambled.reversed()).map(\.id), before,
                       "the A–Z index changed when the numbers changed")
        let groupedAfter = hoodsByDistrict(scrambled.shuffled()).map { ($0.district, $0.hoods.map(\.id)) }
        XCTAssertEqual(groupedAfter.map(\.0), grouped.map(\.0))
        for (a, b) in zip(groupedAfter, grouped) { XCTAssertEqual(a.1, b.1) }
    }

    func testTheIndexIsAlphabeticalAndTheDistrictsAreInOrder() throws {
        let d = try realIndicators()
        let groups = hoodsByDistrict(d.neighborhoods)
        XCTAssertEqual(groups.compactMap(\.district), groups.compactMap(\.district).sorted())
        XCTAssertEqual(groups.map(\.hoods).reduce(0) { $0 + $1.count }, d.neighborhoods.count,
                       "every neighborhood is in exactly one group")
        // Any group with no district is last, because it is not a district.
        if let i = groups.firstIndex(where: { $0.district == nil }) { XCTAssertEqual(i, groups.count - 1) }
    }

    /// The search box is the web's `matchHoods` (apps/web/src/hoodfind.ts): a typed word matches a word of the
    /// name that starts with it, accents and punctuation set aside, and the answer stays in A–Z order.
    func testTheSearchBoxMatchesWholeWordsByTheirStart() throws {
        let list = [square(id: "nbh_a", name: "Déjà Park"), square(id: "nbh_b", name: "LaSalle Gardens"),
                    square(id: "nbh_c", name: "Palmer Park"), square(id: "nbh_d", name: "Campau/Banglatown"),
                    square(id: "nbh_e", name: "Sparkle Hill")]
        XCTAssertEqual(hoodsMatching(list, query: "deja").map(\.id), ["nbh_a"])
        XCTAssertEqual(hoodsMatching(list, query: "DÉJÀ").map(\.id), ["nbh_a"])
        XCTAssertEqual(hoodsMatching(list, query: "lasalle").map(\.id), ["nbh_b"])
        XCTAssertEqual(hoodsMatching(list, query: "park").map(\.id), ["nbh_a", "nbh_c"], "never \"Sparkle\"")
        XCTAssertEqual(hoodsMatching(list, query: "banglatown").map(\.id), ["nbh_d"], "a slash is a space")
        XCTAssertEqual(hoodsMatching(list, query: "palmer par").map(\.id), ["nbh_c"], "every word typed must match")
        XCTAssertEqual(hoodsMatching(list, query: "palmer gardens").map(\.id), [])
        XCTAssertEqual(hoodsMatching(list, query: "   ").map(\.id), hoodsAlphabetical(list).map(\.id),
                       "an empty search hides nothing and re-ranks nothing")
        XCTAssertEqual(hoodsMatching(list, query: "zzz").map(\.id), [])
    }

    /**
     The shared point cases (`schema/neighborhoods/points.json`), ported case for case: the same coordinates the
     web app and Android are held to, so "Use my location" gives the same answer on all three.

     `expect: null` is a real answer, and the honest one. The City's outlines cover Detroit, so Hamtramck,
     Highland Park, Dearborn, Windsor and the lake are in none of them and the screen says so rather than naming
     whichever outline happens to be nearest.
     */
    func testTheSharedPointCases() throws {
        struct Case: Decodable { var name: String; var lat: Double; var lon: Double; var expect: String? }
        struct File: Decodable { var cases: [Case] }
        let url = Self.root.appendingPathComponent("schema/neighborhoods/points.json")
        let file = try JSONDecoder().decode(File.self, from: try Data(contentsOf: url))
        XCTAssertGreaterThanOrEqual(file.cases.count, 10, "the shared list should not have shrunk")
        let d = try bundleIndicators()
        for c in file.cases {
            let got = d.neighborhood(containing: LatLon(lat: c.lat, lon: c.lon))
            XCTAssertEqual(got?.id, c.expect, "\(c.name): expected \(c.expect ?? "no neighborhood"), got \(got?.id ?? "none")")
        }
    }

    /// The whole index in the order the web app puts it in. The web sorts with JavaScript's `localeCompare`;
    /// this is the Swift comparison that gives the same answer, and it is pinned to one collation so the order
    /// does not change with the phone's language (LaSalle after Lafayette, the hyphen in Gratiot-Findlay ignored).
    func testTheIndexIsInTheSameOrderAsTheWebApp() throws {
        let d = try realIndicators()
        let names = hoodsAlphabetical(d.neighborhoods).map(\.name)
        XCTAssertEqual(names.firstIndex(of: "Lafayette Park")! < names.firstIndex(of: "LaSalle Gardens")!, true)
        XCTAssertEqual(Array(names.filter { $0.hasPrefix("Gratiot") }),
                       ["Gratiot Town/Kettering", "Gratiot Woods", "Gratiot-Findlay", "Gratiot-Grand"],
                       "a space sorts before a hyphen, as it does in the web app")
        XCTAssertEqual(names.firstIndex(of: "Nardin Park")! < names.firstIndex(of: "NW Goldberg")!, true)
        XCTAssertEqual(names.first, "Airport Sub")
    }

    // MARK: - the nearest listed place, when the bundle says which one it is

    private func help(nearestId: [String: String?]?) -> HoodHelp {
        HoodHelp(total: 1, by: [:], nearestMiles: ["food": 0.6], nearestId: nearestId,
                 noneListedYet: [], coverageChecked: true)
    }

    private func row(_ id: String, _ category: String) -> BundleRow {
        let json = """
        {"id":"\(id)","name":"A place","org":"An org","category":"\(category)","what":"Food","phones":[],
         "availability":"unknown","schedules":[],"flags":[],"status":"active",
         "facts":{"reports":{"closed_open":0,"wrong_open":0},"source":{"type":"steward","name":"Someone"}}}
        """
        return try! bundleDecoder().decode(BundleRow.self, from: Data(json.utf8))
    }

    /**
     A "nearest listed food" row becomes a way into that listing only when the bundle says which listing it is,
     that listing is still here, and it is not one of the private kinds. Anything else leaves the row exactly as
     it was: a distance, and no link.
     */
    func testTheNearestRowOpensAListingOnlyWhenItSafelyCan() {
        let rows = [row("sal_a_pantry", "food"), row("sal_a_shelter", "shelter.dv"),
                    row("sal_a_clinic", "health.mental"), row("sal_a_detox", "treatment.detox")]
        XCTAssertEqual(help(nearestId: ["food": "sal_a_pantry"]).nearestListing(kind: "food", in: rows)?.id, "sal_a_pantry")
        // An older bundle carries no ids at all.
        XCTAssertNil(help(nearestId: nil).nearestListing(kind: "food", in: rows))
        // The file says there is nothing listed of that kind.
        XCTAssertNil(help(nearestId: ["food": nil]).nearestListing(kind: "food", in: rows))
        // A kind this neighborhood has no entry for.
        XCTAssertNil(help(nearestId: ["food": "sal_a_pantry"]).nearestListing(kind: "clinic", in: rows))
        // An id this phone's list does not have — a row must never be a dead end.
        XCTAssertNil(help(nearestId: ["food": "sal_gone_away"]).nearestListing(kind: "food", in: rows))
        // Something that is not a listing id at all.
        XCTAssertNil(help(nearestId: ["food": "seg_a_path"]).nearestListing(kind: "food", in: rows))
        // And the kinds that never appear on a page about a neighborhood (docs/08).
        for id in ["sal_a_shelter", "sal_a_clinic", "sal_a_detox"] {
            XCTAssertNil(help(nearestId: ["food": id]).nearestListing(kind: "food", in: rows),
                         "\(id) is private and must not be named here")
        }
    }

    /// The field is additive: a bundle built before it existed still decodes, and one built after it carries it.
    func testTheRealFileDecodesWithOrWithoutTheNearestIds() throws {
        XCTAssertNoThrow(try realIndicators(), "the pipeline's copy has no nearest_id yet and must still decode")
        let d = try realIndicators()
        for h in d.neighborhoods where h.help.nearestId != nil {
            for (kind, id) in h.help.nearestId! {
                XCTAssertTrue(hoodNearestKinds.contains(kind), "\(h.id) has a nearest_id for an unknown kind: \(kind)")
                if let id { XCTAssertTrue(id.hasPrefix("sal_"), "\(h.id) \(kind) is not a listing id: \(id)") }
            }
        }
    }

    // MARK: - the numbers, as they are written

    func testACountUnderFiveIsWordsAndNeverADigit() {
        let words = HoodFormat.count(.suppressed, none: "none recorded", fewerThanFive: "fewer than 5")
        XCTAssertEqual(words, "fewer than 5")
        XCTAssertNil(HoodCount.suppressed.shown, "a hidden count has no number to print")
        XCTAssertEqual(HoodFormat.count(nil, none: "none recorded", fewerThanFive: "fewer than 5"), "none recorded")
        // A year table writes a count plainly, as the web's `String(c)` does; the crash panel groups it, as the
        // web's `Intl.NumberFormat` does.
        XCTAssertEqual(HoodFormat.count(.number(1078), none: "x", fewerThanFive: "y"), "1078")
        XCTAssertEqual(HoodFormat.count(.number(2024), none: "x", fewerThanFive: "y", grouped: true), "2,024")
    }

    /**
     Every number is laid out by this package's own arithmetic, never by `NumberFormatter` — which rounds
     differently on Linux from Darwin and cost this branch a red CI run (2026-09-21). These are the boundaries,
     and each expectation is the string a browser's `toFixed` / `Intl` produces for the same input.
     */
    func testEveryNumberIsRoundedTheSameWayOnEveryPlatform() {
        // `toFixed(1)`: half away from zero — on the binary double, which is why 0.95 and 9.95 go DOWN.
        XCTAssertEqual(HoodFormat.number(0.95, decimals: 1), "0.9")
        XCTAssertEqual(HoodFormat.number(9.94, decimals: 1), "9.9")
        XCTAssertEqual(HoodFormat.number(9.95, decimals: 1), "9.9")
        XCTAssertEqual(HoodFormat.number(9.99, decimals: 1), "10.0", "trailing zeros are kept")
        XCTAssertEqual(HoodFormat.number(10.04, decimals: 1), "10.0")
        XCTAssertEqual(HoodFormat.number(9.44, decimals: 1), "9.4", "the case that failed on Linux")
        // `toFixed(0)`
        XCTAssertEqual(HoodFormat.number(0.5), "1")
        XCTAssertEqual(HoodFormat.number(999.5), "1000", "away from zero, and ungrouped")
        XCTAssertEqual(HoodFormat.number(1000), "1000")
        XCTAssertEqual(HoodFormat.number(1_234_567), "1234567")
        XCTAssertEqual(HoodFormat.number(-1234.5), "-1235")
        XCTAssertEqual(HoodFormat.number(-9.95, decimals: 1), "-9.9")
        XCTAssertEqual(HoodFormat.number(0), "0")
        XCTAssertEqual(HoodFormat.number(-0.4), "0", "a rounded-away minus is not printed")
        // Grouped, the way the crash panel writes a count.
        XCTAssertEqual(HoodFormat.grouped(1_234_567), "1,234,567")
        XCTAssertEqual(HoodFormat.grouped(999), "999")
        XCTAssertEqual(HoodFormat.grouped(1000), "1,000")
        XCTAssertEqual(HoodFormat.grouped(-1_234_567), "-1,234,567")
        // What a JavaScript template writes when the web hands a raw number to a sentence.
        XCTAssertEqual(HoodFormat.loose(0.5), "0.5")
        XCTAssertEqual(HoodFormat.loose(2), "2")
        XCTAssertEqual(HoodFormat.loose(45), "45")
        // Nothing here ever produces a digit that is not Latin.
        let native = CharacterSet(charactersIn: "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹০১২৩৪৫৬৭৮৯")
        for s in [HoodFormat.number(1_234_567), HoodFormat.grouped(1_234_567), HoodFormat.money(85_000),
                  HoodFormat.bigMoney(107_838_606, language: "ar"), HoodFormat.rateText(9.44)] {
            XCTAssertNil(s.rangeOfCharacter(from: native), s)
        }
    }

    func testDollarsLeadWithTheSignInEveryLanguage() {
        XCTAssertEqual(HoodFormat.money(85_000), "$85,000")
        XCTAssertEqual(HoodFormat.money(1_234_567), "$1,234,567")
        XCTAssertEqual(HoodFormat.money(999.5), "$1,000", "whole dollars, rounded away from zero")
        XCTAssertEqual(HoodFormat.money(0.5), "$1")
        XCTAssertEqual(HoodFormat.money(0), "$0")
        XCTAssertEqual(HoodFormat.money(-85_000), "-$85,000", "the minus goes in front of the sign")
        // The amount does not depend on the language: dollars are written the way the sale record writes them.
        XCTAssertFalse(HoodFormat.money(85_000).contains("."), "no cents on a house price")
    }

    /// `Intl` has no long words for a currency in compact notation, whatever `compactDisplay` asks for — a
    /// browser writes "$107.8M" — so this does too. Spanish keeps a space and has no "B" under a million million.
    func testABigCostIsWrittenShort() {
        XCTAssertEqual(HoodFormat.bigMoney(107_838_606, language: "en"), "$107.8M")
        XCTAssertEqual(HoodFormat.bigMoney(20_486_576, language: "en"), "$20.5M")
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "en"), "$2M", "no pointless .0")
        XCTAssertEqual(HoodFormat.bigMoney(95_989_218, language: "en"), "$96M")
        XCTAssertEqual(HoodFormat.bigMoney(1_500, language: "en"), "$1.5K")
        XCTAssertEqual(HoodFormat.bigMoney(12_345, language: "en"), "$12.3K")
        XCTAssertEqual(HoodFormat.bigMoney(99_950, language: "en"), "$100K")
        XCTAssertEqual(HoodFormat.bigMoney(999_999, language: "en"), "$1M", "rounding carries it up a step")
        XCTAssertEqual(HoodFormat.bigMoney(1_200_000_000, language: "en"), "$1.2B")
        XCTAssertEqual(HoodFormat.bigMoney(1_250_000_000_000, language: "en"), "$1.3T")
        XCTAssertEqual(HoodFormat.bigMoney(850, language: "en"), "$850", "under a thousand is a plain price")
        XCTAssertEqual(HoodFormat.bigMoney(0, language: "en"), "$0")
        XCTAssertEqual(HoodFormat.bigMoney(-2_000_000, language: "en"), "-$2M")
        // Spanish, as `es-US` writes it.
        XCTAssertEqual(HoodFormat.bigMoney(107_838_606, language: "es"), "$107.8 M")
        XCTAssertEqual(HoodFormat.bigMoney(999_999, language: "es"), "$1 M")
        XCTAssertEqual(HoodFormat.bigMoney(1_200_000_000, language: "es"), "$1200 M", "es-US has no short thousand-million")
        XCTAssertEqual(HoodFormat.bigMoney(1_250_000_000_000, language: "es"), "$1.3 B")
        // A language whose own rules would move the sign to the end of the line falls back to English, as the web's
        // `dollars()` does.
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "ar"), "$2M")
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "bn"), "$2M")
    }

    func testARateNeedsACountWeCanShowAndABaseWeCanDefend() {
        XCTAssertEqual(HoodFormat.rate(.number(1078), parcels: 10_244)!, 105.23, accuracy: 0.01)
        XCTAssertNil(HoodFormat.rate(.suppressed, parcels: 10_244), "a hidden count has no rate")
        XCTAssertNil(HoodFormat.rate(.number(3), parcels: 99), "fewer than a hundred lots is not a base")
        XCTAssertNil(HoodFormat.rate(.number(3), parcels: nil))
        XCTAssertNil(HoodFormat.rate(nil, parcels: 10_244))
        XCTAssertEqual(HoodFormat.rateText(105.23), "105")
        XCTAssertEqual(HoodFormat.rateText(9.44), "9.4", "one decimal under ten")
        XCTAssertEqual(HoodFormat.rateText(0.95), "0.9")
        XCTAssertEqual(HoodFormat.rateText(9.99), "10.0", "still under ten when it is measured")
        XCTAssertEqual(HoodFormat.rateText(10.04), "10")
        XCTAssertEqual(HoodFormat.rateText(999.5), "1000")
    }

    // MARK: - the real file

    func testTheRealFileDecodesAndKeepsItsShape() throws {
        let d = try realIndicators()
        XCTAssertEqual(d.neighborhoods.count, 205, "Detroit has 205 neighborhoods (docs/13)")
        XCTAssertEqual(d.firstYear, 2019)
        XCTAssertTrue(d.years.contains(String(d.partialYear)), "the part-year has a column of its own")
        XCTAssertFalse(d.sources.inPageOrder.isEmpty)
        for s in d.sources.inPageOrder {
            XCTAssertFalse(s.name.isEmpty)
            XCTAssertEqual(s.lastEdited.count, 10, "every source says when it was last edited: \(s.name)")
        }
        // Every id is an `nbh_` slug, exactly once (CLAUDE.md: ids are stable slugs and are never reused).
        XCTAssertTrue(d.neighborhoods.allSatisfy { $0.id.hasPrefix("nbh_") })
        XCTAssertEqual(Set(d.neighborhoods.map(\.id)).count, d.neighborhoods.count)
        // Home sales and building permits state their real count, however small (Kyle, 2026-09-22 — DECISIONS):
        // both are public transaction records, and hiding a 3 protected nobody. A hidden count is still in the
        // file for the series that count what people did to a place rather than what they bought, so the
        // suppression path is exercised by the real file either way.
        XCTAssertFalse(d.neighborhoods.contains { h in h.years.values.contains { $0.sales == .suppressed || $0.permits == .suppressed } },
                       "sales and permits no longer hide a small count")
        XCTAssertTrue(d.neighborhoods.contains { h in h.years.values.contains { ($0.sales?.shown ?? 9) < 5 } },
                      "and a small one really is stated")
        XCTAssertTrue(d.neighborhoods.contains { h in h.years.values.contains { $0.demolitions == .suppressed || $0.blight == .suppressed } },
                      "the real file still carries suppressed counts elsewhere")
    }

    /// The bundle's copy carries the outlines, so every one of the 205 can be drawn and searched. It is not
    /// committed (CLAUDE.md), so this is skipped where it has not been built.
    func testEveryOutlineInTheBundleIsDrawableAndFindsItsOwnMiddle() throws {
        let d = try bundleIndicators()
        var found = 0
        for h in d.neighborhoods {
            let rings = hoodOutline(h, origin: d.origin)
            XCTAssertFalse(rings.isEmpty, "\(h.id) has no outline")
            XCTAssertGreaterThanOrEqual(rings[0].count, 3, "\(h.id) has too few corners to be a shape")
            for p in rings[0] {
                XCTAssertTrue(inServiceArea(p, slack: 0.05), "\(h.id) has a corner outside the four cities: \(p)")
            }
            // The middle the file gives is `center` as lat, lon.
            if hoodContains(rings: rings, LatLon(lat: h.center[0], lon: h.center[1])) { found += 1 }
        }
        // A neighborhood shaped like a horseshoe can have its own average outside itself; nearly all do not.
        XCTAssertGreaterThan(found, Int(Double(d.neighborhoods.count) * 0.9),
                             "most neighborhoods contain the middle the file gives them")
    }

    func testAPointIsInAtMostOneNeighborhood() throws {
        let d = try bundleIndicators()
        let rings = d.neighborhoods.map { (h: $0, rings: hoodOutline($0, origin: d.origin)) }
        // A grid over the city: no point may be inside two outlines at once.
        var inside = 0
        for lat in stride(from: 42.26, through: 42.45, by: 0.01) {
            for lon in stride(from: -83.29, through: -82.91, by: 0.01) {
                let p = LatLon(lat: lat, lon: lon)
                let hits = rings.filter { hoodContains(rings: $0.rings, p) }
                XCTAssertLessThanOrEqual(hits.count, 1, "\(p) is in \(hits.map(\.h.id))")
                if hits.count == 1 { inside += 1 }
            }
        }
        XCTAssertGreaterThan(inside, 100, "the grid should land inside Detroit a good many times")
    }

    func testAFileWhoseBytesDoNotMatchTheSignedIndexIsRefused() throws {
        let data = try Data(contentsOf: Self.root.appendingPathComponent("data/indicators/neighborhoods.json"))
        let good = BundleCheck.sha256Hex(data)
        XCTAssertNoThrow(try HoodsFile.decode(data, sha256: good))
        XCTAssertThrowsError(try HoodsFile.decode(data, sha256: String(repeating: "0", count: 64))) { e in
            XCTAssertEqual(e as? BundleError, .badChecksum(HoodsFile.name))
        }
        let junk = Data("{\"nope\":1}".utf8)
        XCTAssertThrowsError(try HoodsFile.decode(junk, sha256: BundleCheck.sha256Hex(junk))) { e in
            XCTAssertEqual(e as? BundleError, .notJSON)
        }
    }

    // MARK: - reading the two files

    private func realIndicators() throws -> Indicators {
        let url = Self.root.appendingPathComponent("data/indicators/neighborhoods.json")
        let data = try Data(contentsOf: url)
        return try HoodsFile.decode(data, sha256: BundleCheck.sha256Hex(data))
    }

    private func bundleIndicators() throws -> Indicators {
        let url = Self.root.appendingPathComponent("data/bundle/v1/" + HoodsFile.name)
        guard let data = try? Data(contentsOf: url) else { throw XCTSkip("data/bundle/v1 has not been built here") }
        return try HoodsFile.decode(data, sha256: BundleCheck.sha256Hex(data))
    }

    /// The real file with its neighborhoods swapped for made-up ones, for the tests that want a known answer.
    private func indicators(neighborhoods: [Hood]) throws -> Indicators {
        var d = try realIndicators()
        d.neighborhoods = neighborhoods
        return d
    }
}
