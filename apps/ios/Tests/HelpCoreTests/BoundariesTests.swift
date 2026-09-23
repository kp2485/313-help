// Neighbourhood and city boundaries (Kyle, 2026-09-22: "The user needs to be able to see the boundaries of the
// neighborhoods on the map"; docs/MAP-STYLE.md section 15).
//
// The cases here are the ones `apps/web/test/boundaries.test.ts` holds that are arithmetic rather than canvas:
// the per-band table, the fact that every outline is drawn in every band now, and the once-only migration that
// gives an existing phone the layer without taking away its ability to switch it off again. The colour is held
// with the rest of the map's contrast in MapStyleTests.
import DetroitQuery
import Foundation
import XCTest
@testable import HelpCore

final class BoundaryStyleTests: XCTestCase {

    func testTheBandCutPointsAreTheSubwayStylesOwn() {
        XCTAssertEqual(boundaryMidMetersPerPoint, 30)
        XCTAssertEqual(boundaryNearMetersPerPoint, 12)
        // Above 30 is `city`, 12 up to and including 30 is `mid`, under 12 is `near`.
        XCTAssertEqual(boundaryBand(90), .city)
        XCTAssertEqual(boundaryBand(30.01), .city)
        XCTAssertEqual(boundaryBand(30), .mid)
        XCTAssertEqual(boundaryBand(12), .mid)
        XCTAssertEqual(boundaryBand(11.99), .near)
        XCTAssertEqual(boundaryBand(0.6), .near)
    }

    /// The table of docs/MAP-STYLE.md 15.1, row for row. These are the THIRD set of numbers: two earlier drafts
    /// were too faint on real screenshots, so a change here is a change to the picture, not to a constant.
    func testTheWholeTable() {
        let city = boundaryStyle(60), mid = boundaryStyle(20), near = boundaryStyle(6)
        XCTAssertEqual(city.band, .city); XCTAssertEqual(mid.band, .mid); XCTAssertEqual(near.band, .near)
        XCTAssertEqual([city.width, mid.width, near.width], [1.1, 1.6, 2.2])
        XCTAssertEqual([city.cityWidth, mid.cityWidth, near.cityWidth], [1.5, 2.4, 3.0])
        XCTAssertEqual(city.dash, [2, 2]); XCTAssertEqual(mid.dash, [3, 3]); XCTAssertEqual(near.dash, [6, 3])
    }

    /// A city outline is heavier than a neighbourhood's in every band, and that is the ONLY difference between
    /// them: never a different colour, and never a fill (docs/13 rule 1 forbids a choropleth).
    func testACityOutlineIsHeavierInEveryBand() {
        for mpp in [60.0, 20, 6] {
            let s = boundaryStyle(mpp)
            XCTAssertGreaterThan(s.cityWidth, s.width, "a city is a bigger fact at \(mpp) m/pt")
        }
    }

    /// The dash is absolute, and its "on" length is never shorter than the stroke is wide — below that it reads
    /// as dust rather than as a line. This is one of the four things the spec says porters get wrong.
    func testTheDashIsNeverShorterThanTheStrokeIsWide() {
        for mpp in [60.0, 20, 6] {
            let s = boundaryStyle(mpp)
            XCTAssertGreaterThanOrEqual(s.dash[0], s.cityWidth - 1e-9, "the on-length must cover the heaviest stroke at \(mpp)")
            XCTAssertEqual(s.dash.count, 2)
        }
    }

    /// At city zoom the boundary is still thinner than the thinnest street drawn there (classes 0–2, floor 1.6),
    /// so 205 of them read as a lattice and never as a road. The spec calls this the one number a later "make it
    /// stronger" pass may not simply raise.
    func testTheCityBandIsThinnerThanTheThinnestStreet() {
        XCTAssertLessThan(boundaryStyle(60).width, 1.6)
    }

    func testNamesAreCappedAndAbsentFromTheCityBand() {
        XCTAssertFalse(boundaryStyle(60).names)
        XCTAssertEqual(boundaryStyle(60).nameCap, 0)
        for mpp in [20.0, 6] {
            XCTAssertTrue(boundaryStyle(mpp).names)
            XCTAssertEqual(boundaryStyle(mpp).nameCap, boundaryNameCap)
            XCTAssertEqual(boundaryStyle(mpp).nameMinPoints, boundaryNameMinPoints)
        }
        XCTAssertEqual(boundaryNameCap, 12)
        XCTAssertEqual(boundaryNameMinPoints, 70)
    }

    func testTheSelectedOutlineStaysClearOfTheHeaviestOrdinaryOne() {
        XCTAssertEqual(boundarySelectedWidth, 4)
        XCTAssertGreaterThan(boundarySelectedWidth, boundaryStyle(6).cityWidth)
        XCTAssertEqual(boundaryWashAlpha, 0.08)
    }
}

final class BoundariesDrawnTests: XCTestCase {
    private func square(_ x0: Double, _ y0: Double, _ side: Double) -> [Double] {
        [x0, y0, x0 + side, y0, x0 + side, y0 + side, x0, y0 + side, x0, y0]
    }
    private func outline(_ id: String, _ rings: [[Double]], city: Bool = false) -> AreaOutline {
        AreaOutline(id: id, name: id, sub: city ? "Whole city" : "District 5", rings: rings, isCity: city)
    }

    /// The zoom no longer decides WHETHER an outline is drawn. Until 2026-09-22 a neighbourhood appeared only
    /// under 14 m/pt, and the Map tab opens on the whole city: a person saw four city edges and none of the 205
    /// outlines they had come to find.
    func testEveryOutlineOnScreenIsDrawnInEveryBand() {
        let list = [outline("city_detroit", [square(0, 0, 10)], city: true), outline("nbh_bagley", [square(2, 2, 2)])]
        let view = MapBox(minX: 0, minY: 0, maxX: 10, maxY: 10)
        XCTAssertEqual(areasDrawn(list, view: view).map(\.id), ["city_detroit", "nbh_bagley"])
    }

    func testAnOutlineOffTheScreenIsStillNotDrawn() {
        let list = [outline("nbh_bagley", [square(50, 50, 2)])]
        XCTAssertTrue(areasDrawn(list, view: MapBox(minX: 0, minY: 0, maxX: 10, maxY: 10)).isEmpty)
    }
}

/// The once-only migration (docs/MAP-STYLE.md 15.4). A phone that has ever touched the switcher never reads the
/// defaults again, so it would have gone on seeing no boundaries for ever; adding them on every load instead
/// would mean nobody could switch them off. So: exactly once, and a marker records that it happened.
final class LayerMigrationTests: XCTestCase {

    func testTheBoundariesAreOnWhenNobodyHasSaidOtherwise() {
        XCTAssertTrue(defaultMapLayers.contains(areasLayerId))
        XCTAssertEqual(defaultMapLayers.last, areasLayerId, "it is added at the end, nothing else moved")
        XCTAssertEqual(layersVersion, 2)
    }

    func testAListRememberedBeforeTodayGainsTheLayerOnceAndKeepsEveryOtherChoice() {
        let stored = ["help:food", "place:greenway", "go:ddot_routes"]
        XCTAssertEqual(migrateMapLayers(stored, version: nil), stored + [areasLayerId])
        XCTAssertEqual(migrateMapLayers(stored, version: 1), stored + [areasLayerId])
    }

    func testItIsAddedOnceSoSwitchingItOffAgainLeavesItOff() {
        // The migration ran, the person switched it off, and the list was written with today's marker.
        let off = ["help:food"]
        XCTAssertEqual(migrateMapLayers(off, version: layersVersion), off, "a stamped list is never migrated again")
        // And a list that already has it is left exactly as it was, marker or no marker.
        let on = ["help:food", areasLayerId]
        XCTAssertEqual(migrateMapLayers(on, version: nil), on)
    }

    func testTheThirtyLayerCapStillHolds() {
        let many = (0..<30).map { "help:\($0)" }
        let next = migrateMapLayers(many, version: nil)
        XCTAssertEqual(next.count, 30)
        XCTAssertEqual(next.last, areasLayerId)
        XCTAssertFalse(next.contains("help:0"), "the oldest is what gives way, not the boundaries")
    }
}

/// The Areas tab's selection map (docs/MAP-STYLE.md 15.7), the same cases as apps/web/test/boundaries.test.ts.
final class AreasMapBoundaryStyleTests: XCTestCase {
    func testSolidAndHeavierThanTheMapTabInEveryBand() {
        for (mpp, width, cityWidth) in [(60.0, 1.8, 2.6), (20, 2.4, 3.2), (5, 3.0, 3.6)] {
            let a = areasMapBoundaryStyle(mpp), m = boundaryStyle(mpp)
            XCTAssertEqual(a.width, width); XCTAssertEqual(a.cityWidth, cityWidth); XCTAssertEqual(a.dash, [])
            XCTAssertGreaterThan(a.width, m.width)
            XCTAssertGreaterThan(a.cityWidth, a.width)
            XCTAssertLessThan(a.cityWidth, boundarySelectedWidth)
            XCTAssertEqual(a.band, m.band); XCTAssertEqual(a.names, m.names); XCTAssertEqual(a.nameCap, m.nameCap)
        }
    }
}
