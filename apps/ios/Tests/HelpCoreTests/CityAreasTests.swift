// The `place:areas` layer and the city pages: the pick order, the hit test, the reading order, and the panel
// allow-list. Pure arithmetic and pure rules, so `swift test` runs all of it on Linux.
//
// The honesty rules of docs/13 are what most of these hold: an outline is a shape and a name, the smallest one
// containing a tap wins, a panel is drawn only when the area's own allow-list names it, and nothing anywhere
// ranks one place against another.
import DetroitQuery
import Foundation
import XCTest
@testable import HelpCore

final class CityAreasTests: XCTestCase {

    /// A square, as a flat run of map-unit x, y pairs, closed.
    private func square(_ x0: Double, _ y0: Double, _ side: Double) -> [Double] {
        [x0, y0, x0 + side, y0, x0 + side, y0 + side, x0, y0 + side, x0, y0]
    }

    private func outline(_ id: String, _ rings: [[Double]], city: Bool = false) -> AreaOutline {
        AreaOutline(id: id, name: id, sub: city ? "Whole city" : "District 5", rings: rings, isCity: city)
    }

    // MARK: - the hit test

    func testTheSmallestOutlineHoldingATapWins() {
        let city = outline("city_detroit", [square(0, 0, 10)], city: true)
        let hood = outline("nbh_bagley", [square(2, 2, 2)])
        let list = [city, hood]                                   // cities first, as `areaOutlines` builds them
        XCTAssertEqual(areaAt(list, x: 3, y: 3)?.id, "nbh_bagley", "a neighbourhood beats the city it sits inside")
        XCTAssertEqual(areaAt(list, x: 8, y: 8)?.id, "city_detroit")
        XCTAssertNil(areaAt(list, x: 20, y: 20))
    }

    /// `evenodd` over every ring at once, so Detroit's enclaves — Hamtramck and Highland Park — are holes in it
    /// and not part of it.
    func testAnEnclaveIsAHoleAndNotPartOfTheCityAroundIt() {
        let detroit = outline("city_detroit", [square(0, 0, 10), square(4, 4, 2)], city: true)
        XCTAssertNotNil(areaAt([detroit], x: 1, y: 1))
        XCTAssertNil(areaAt([detroit], x: 5, y: 5), "the hole is not inside the outline that surrounds it")
    }

    func testSizeIsTheUnsignedAreaSoWindingDirectionCannotChangeWhichOutlineWins() {
        let clockwise = [0.0, 0.0, 0.0, 2.0, 2.0, 2.0, 2.0, 0.0, 0.0, 0.0]
        XCTAssertEqual(abs(shoelace(clockwise)), 4, accuracy: 1e-9)
        XCTAssertEqual(outline("a", [clockwise]).size, 4, accuracy: 1e-9)
    }

    // MARK: - which outlines are drawn at which zoom

    /// A neighbourhood is drawn only from the zoom at which its own name fits; below that, the four city
    /// outlines alone, because 205 dashed outlines at city zoom are a mesh rather than a map (audit §3.3).
    func testNeighbourhoodOutlinesWaitForTheZoomAtWhichTheirNameFits() {
        let view = MapBox(minX: -100, minY: -100, maxX: 100, maxY: 100)
        let list = [outline("city_detroit", [square(0, 0, 10)], city: true), outline("nbh_bagley", [square(1, 1, 1)])]
        XCTAssertEqual(areasDrawn(list, view: view, metersPerPoint: 60).map(\.id), ["city_detroit"])
        XCTAssertEqual(areasDrawn(list, view: view, metersPerPoint: 8).map(\.id), ["city_detroit", "nbh_bagley"])
        XCTAssertEqual(areaDetailMetersPerPoint, 14)
    }

    func testAnOutlineOffTheScreenIsNotDrawn() {
        let view = MapBox(minX: 0, minY: 0, maxX: 1, maxY: 1)
        let list = [outline("far", [square(50, 50, 2)], city: true)]
        XCTAssertTrue(areasDrawn(list, view: view, metersPerPoint: 8).isEmpty)
    }

    // MARK: - the reading order VoiceOver and the keyboard get

    /// A drawn route's own markers first, then the greenway along the route, then the areas nearest the middle
    /// of the screen, then the places likewise. An area comes before the dots because it is the ground they
    /// stand on (the web's `orderFeatures`, held to a fixture rather than to a map).
    func testTheReadingOrderIsStopThenSegmentThenAreaThenDot() {
        let list = [
            OrderableFeature(id: "dot:near", kind: .dot, d: 1),
            OrderableFeature(id: "area:far", kind: .area, d: 9),
            OrderableFeature(id: "seg:2", kind: .segment, route: 2),
            OrderableFeature(id: "stop:1", kind: .stop, route: 1),
            OrderableFeature(id: "area:near", kind: .area, d: 2),
            OrderableFeature(id: "seg:1", kind: .segment, route: 1),
            OrderableFeature(id: "stop:0", kind: .stop, route: 0),
            OrderableFeature(id: "dot:far", kind: .dot, d: 5),
        ]
        XCTAssertEqual(orderFeatures(list).map(\.id),
                       ["stop:0", "stop:1", "seg:1", "seg:2", "area:near", "area:far", "dot:near", "dot:far"])
    }

    func testTheReadingOrderIsStable() {
        let same = (0..<5).map { OrderableFeature(id: "a\($0)", kind: .area, d: 3) }
        XCTAssertEqual(orderFeatures(same).map(\.id), same.map(\.id))
    }

    // MARK: - the city page's allow-list

    /// A panel is drawn ONLY when the area's own `panels` names it. A number that is in the data and not in the
    /// list is not drawn; the allow-list is a fact in the bundle, never a habit of a screen.
    func testTheAllowListIsTheOnlyReasonAPanelIsDrawn() throws {
        let area = try decodeArea("""
        {"id":"city_hamtramck","name":"Hamtramck","district":null,"center":[42.3928,-83.0496],
         "help":{"total":3,"by":{"food":2},"nearest_miles":{},"none_listed_yet":[],"coverage_checked":true},
         "places":{"parks":6,"rec_centers":1,"greenway_open":0},"years":{},
         "city":"Hamtramck","kind":"city",
         "panels":["help","crashes","permits"],
         "sources":{"help":"ours","crashes":"semcog","permits":"census"},
         "missing":[{"panel":"sales","why":"not_published"},{"panel":"permits","why":"none_recorded"}],
         "park_acres":41.2,
         "roads_bands":{"pieces":40,"miles":12.5,"good_pct":30,"fair_pct":50,"poor_pct":20}}
        """)
        // `roads_bands` is in the data and `roads` is not in the allow-list, so the panel is never drawn.
        XCTAssertEqual(cityPanelsShown(area), ["help", "crashes", "permits"])
        XCTAssertFalse(area.shows("roads"))
        XCTAssertNotNil(area.roadsBands, "the number is there; the allow-list is what refuses it")
        XCTAssertEqual(area.missing.filter(\.notPublished).map(\.panel), ["sales"])
        XCTAssertEqual(area.missing.filter(\.noneRecorded).map(\.panel), ["permits"])
        XCTAssertEqual(area.parkAcres, 41.2)
    }

    /// The order is fixed, and it is the web's `CITY_PANELS`. A key not in the list can never be drawn.
    func testThePanelOrderIsFixed() throws {
        XCTAssertEqual(cityPanels, ["help", "parks", "crashes", "roads", "vacancy", "permits"])
        let area = try decodeArea("""
        {"id":"city_detroit","name":"Detroit","district":null,"center":[42.33,-83.05],
         "help":{"total":0,"by":{},"nearest_miles":{},"none_listed_yet":[],"coverage_checked":true},
         "places":{"parks":302,"rec_centers":9,"greenway_open":12},"years":{},
         "city":"Detroit","kind":"city",
         "panels":["permits","help","roads","parks"],
         "sources":{},"missing":[]}
        """)
        XCTAssertEqual(cityPanelsShown(area), ["help", "parks", "roads", "permits"],
                       "the page draws in CITY_PANELS order, not in the order the file happens to list them")
        XCTAssertFalse(cityPanelsShown(area).contains("made_up"))
    }

    func testAnAreaCarriesAWholeNeighborhoodInsideIt() throws {
        let area = try decodeArea("""
        {"id":"city_dearborn","name":"Dearborn","district":null,"center":[42.3223,-83.1763],
         "rings":[[0,0,100,0,0,100,-100,0]],
         "help":{"total":5,"by":{"food":5},"nearest_miles":{"food":0.4},"none_listed_yet":["narcan"],
                 "coverage_checked":false},
         "places":{"parks":3,"rec_centers":0,"greenway_open":0},"years":{},
         "crashes":{"walk":12,"bike":"lt5","severe":7},
         "city":"Dearborn","kind":"city","panels":["crashes"],"sources":{"crashes":"semcog"},"missing":[],
         "permits_by_year":[{"year":2023,"buildings":4,"units":9,"months_reported":12},
                            {"year":2024,"buildings":2,"units":3,"months_reported":7}]}
        """)
        XCTAssertEqual(area.hood.name, "Dearborn")
        XCTAssertEqual(area.hood.help.total, 5)
        XCTAssertEqual(area.hood.crashes?.bike, .suppressed)
        XCTAssertEqual(area.permitsByYear?.count, 2)
        XCTAssertEqual(area.permitsByYear?[1].monthsReported, 7)
        XCTAssertEqual(area.hood.rings?.count, 1)
    }

    /// SEMCOG's sentence stays in SEMCOG's words, byte for byte, wherever it is printed.
    func testTheSemcogNoticeIsUnchanged() {
        XCTAssertEqual(semcogNotice,
                       "Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.")
    }

    private func decodeArea(_ json: String) throws -> Area {
        try JSONDecoder().decode(Area.self, from: Data(json.utf8))
    }

    // MARK: - nearest first is an order, not a ranking

    func testNearestFirstOrdersByDistanceAndBreaksTiesByName() throws {
        let hoods = try [("nbh_far", 42.45, -83.00), ("nbh_near", 42.34, -83.05), ("nbh_mid", 42.38, -83.05)]
            .map { try decodeHood(id: $0.0, lat: $0.1, lon: $0.2) }
        let order = hoodsNearestFirst(hoods, to: LatLon(lat: 42.34, lon: -83.05)).map(\.id)
        XCTAssertEqual(order, ["nbh_near", "nbh_mid", "nbh_far"])
        // With no point there is nothing to measure and the list is the alphabet: never a number about a place.
        XCTAssertEqual(hoodsAlphabetical(hoods).map(\.id), ["nbh_far", "nbh_mid", "nbh_near"])
    }

    // MARK: - the built bundle, when there is one

    /// `data/bundle/v1` is never committed, so this skips on a fresh clone and runs after `pnpm build:bundle`.
    private static let built: Indicators? = {
        let url = root.appendingPathComponent("data/bundle/v1/indicators/neighborhoods.json")
        guard let d = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Indicators.self, from: d)
    }()
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    func testTheShippedAreasKeepTheirOwnRules() throws {
        let d = try XCTUnwrap(Self.built, "no built bundle in this checkout — run `pnpm build:bundle`")
        try XCTSkipUnless(d.areas?.isEmpty == false, "this bundle carries no city pages yet")
        let areas = d.areas ?? []
        XCTAssertEqual(Set(d.cityRows.map(\.id)), Set(areas.filter { $0.kind == "city" }.map(\.id)),
                       "every city row has a page and every city page is listed")
        for a in areas {
            for panel in a.panels {
                XCTAssertTrue(cityPanels.contains(panel), "\(a.id) lists a panel no page can draw: \(panel)")
                // A panel in the allow-list with no source is a page that would print a number from nowhere.
                // "help" is the one exception, and not an exception at all: it counts OUR OWN listings, and the
                // page says so in words (`hood.source_ours`) rather than naming somebody else's dataset.
                if panel == "help" { continue }
                XCTAssertNotNil(d.areaSource(a.sources[panel]), "\(a.id) draws \(panel) with no source")
            }
            // Nothing is both drawn and missing.
            for m in a.missing {
                XCTAssertFalse(a.panels.contains(m.panel) && m.why == "not_published",
                               "\(a.id) says \(m.panel) is not published and draws it anyway")
            }
        }
        // The four cities are outlines the map can draw, and the smallest one wins where two overlap.
        let outlines = areaOutlines(d, wholeCity: "Whole city", district: { _ in "" })
        XCTAssertGreaterThan(outlines.count, 200, "the outlines did not decode")
        XCTAssertTrue(outlines.prefix(4).allSatisfy(\.isCity), "the cities come first, so a neighbourhood can win")
    }

    /**
     SEMCOG's notice rides on every panel SEMCOG's data is behind, in SEMCOG's own words.

     **Each panel carries its own**, year and all: the parks layer is © 2026 and the vacancy layer © 2024, and a
     page that printed one year over the other would be misquoting its owner. `semcogNotice` is the crash
     layer's own sentence and is not a template for the rest — this holds the shape and the owner, never the
     year, and holds the notice to whatever the source published byte for byte.
     */
    func testSemcogsNoticeRidesOnItsOwnPanels() throws {
        let d = try XCTUnwrap(Self.built, "no built bundle in this checkout — run `pnpm build:bundle`")
        try XCTSkipUnless(d.areas?.isEmpty == false, "this bundle carries no city pages yet")
        var seen: Set<String> = []
        for a in d.areas ?? [] {
            for panel in a.panels {
                guard let s = d.areaSource(a.sources[panel]) else { continue }
                guard s.name.uppercased().contains("SEMCOG") || (s.notice ?? "").contains("SEMCOG") else { continue }
                let notice = try XCTUnwrap(s.notice, "\(a.id) · \(panel) uses SEMCOG data and prints no notice")
                seen.insert(panel)
                XCTAssertTrue(notice.hasPrefix("Copyright © "), notice)
                XCTAssertTrue(notice.hasSuffix(" SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."),
                              "\(a.id) · \(panel) changed SEMCOG's own sentence: \(notice)")
            }
        }
        // The four SEMCOG panels of docs/13: parks, crashes, roads and vacancy.
        XCTAssertEqual(seen, ["parks", "crashes", "roads", "vacancy"],
                       "the panels SEMCOG's notice rides on have changed")
        XCTAssertTrue(semcogNotice.hasSuffix(" SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."))
    }

    private func decodeHood(id: String, lat: Double, lon: Double) throws -> Hood {
        try JSONDecoder().decode(Hood.self, from: Data("""
        {"id":"\(id)","name":"\(id)","district":null,"center":[\(lat),\(lon)],
         "help":{"total":0,"by":{},"nearest_miles":{},"none_listed_yet":[],"coverage_checked":true},
         "places":{"parks":0,"rec_centers":0,"greenway_open":0},"years":{}}
        """.utf8))
    }
}
