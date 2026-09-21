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

    // MARK: - the numbers, as they are written

    func testACountUnderFiveIsWordsAndNeverADigit() {
        let words = HoodFormat.count(.suppressed, locale: en, none: "none recorded", fewerThanFive: "fewer than 5")
        XCTAssertEqual(words, "fewer than 5")
        XCTAssertNil(HoodCount.suppressed.shown, "a hidden count has no number to print")
        XCTAssertEqual(HoodFormat.count(nil, locale: en, none: "none recorded", fewerThanFive: "fewer than 5"), "none recorded")
        XCTAssertEqual(HoodFormat.count(.number(1078), locale: en, none: "x", fewerThanFive: "y"), "1,078")
    }

    func testDollarsLeadWithTheSignInEveryLanguage() {
        for lang in ["en_US", "es_US", "ar@numbers=latn", "bn@numbers=latn"] {
            let s = HoodFormat.money(85_000, locale: Locale(identifier: lang))
            XCTAssertTrue(s.hasPrefix("$"), "\(lang) wrote \(s)")
            XCTAssertTrue(s.contains("85"), "\(lang) wrote \(s)")
            XCTAssertFalse(s.contains("."), "no cents on a house price: \(s)")
            // Western digits, always (DECISIONS 2026-09-20).
            XCTAssertNil(s.rangeOfCharacter(from: CharacterSet(charactersIn: "٠١٢٣٤٥٦٧٨٩০১২৩৪৫৬৭৮৯")), "\(lang) wrote \(s)")
        }
        XCTAssertEqual(HoodFormat.money(85_000, locale: en), "$85,000")
    }

    func testABigCostIsWrittenInWords() {
        XCTAssertEqual(HoodFormat.bigMoney(107_838_606, language: "en", locale: en), "$107.8 million")
        XCTAssertEqual(HoodFormat.bigMoney(20_486_576, language: "en", locale: en), "$20.5 million")
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "en", locale: en), "$2 million")
        XCTAssertEqual(HoodFormat.bigMoney(1_500, language: "en", locale: en), "$1.5 thousand")
        XCTAssertEqual(HoodFormat.bigMoney(1_200_000_000, language: "en", locale: en), "$1.2 billion")
        XCTAssertEqual(HoodFormat.bigMoney(850, language: "en", locale: en), "$850", "under a thousand is a plain price")
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "es", locale: Locale(identifier: "es_US")), "$2 millones")
        // A language with no words of its own here falls back to English, with the sign still in front.
        XCTAssertEqual(HoodFormat.bigMoney(2_000_000, language: "ar", locale: Locale(identifier: "ar@numbers=latn")), "$2 million")
    }

    func testARateNeedsACountWeCanShowAndABaseWeCanDefend() {
        XCTAssertEqual(HoodFormat.rate(.number(1078), parcels: 10_244)!, 105.23, accuracy: 0.01)
        XCTAssertNil(HoodFormat.rate(.suppressed, parcels: 10_244), "a hidden count has no rate")
        XCTAssertNil(HoodFormat.rate(.number(3), parcels: 99), "fewer than a hundred lots is not a base")
        XCTAssertNil(HoodFormat.rate(.number(3), parcels: nil))
        XCTAssertNil(HoodFormat.rate(nil, parcels: 10_244))
        XCTAssertEqual(HoodFormat.rateText(105.23, locale: en), "105")
        XCTAssertEqual(HoodFormat.rateText(9.44, locale: en), "9.4", "one decimal under ten")
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
        // And a hidden count really is in there, so the suppression path is exercised by the real file.
        let hidden = d.neighborhoods.contains { h in h.years.values.contains { $0.sales == .suppressed } }
        XCTAssertTrue(hidden, "the real file carries suppressed counts")
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
