// The Areas tab as a map, on the iPhone (Kyle, 2026-09-22): the camera that frames one outline, the landing
// decision, and the strip an area page wears and collapses as it is read.
//
// Every case here is ported, case for case, from `apps/web/test/areas-map.test.ts` — the three pure pieces the
// iPhone and Android ports re-implement. If the clients ever disagree about where the Areas tab opens, one of
// them is wrong, and this is the file that says so.
import DetroitQuery
import Foundation
import HelpCore
import XCTest

final class AreasCameraTests: XCTestCase {
    private let phone = (w: 390.0, h: 640.0), laptop = (w: 760.0, h: 620.0)

    /// A rectangle of `w` by `h` degrees with its south-west corner at (lat, lon), as one ring.
    private func box(_ lat: Double, _ lon: Double, _ h: Double, _ w: Double) -> [[LatLon]] {
        [[LatLon(lat: lat, lon: lon), LatLon(lat: lat, lon: lon + w), LatLon(lat: lat + h, lon: lon + w),
          LatLon(lat: lat + h, lon: lon), LatLon(lat: lat, lon: lon)]]
    }
    private func mpp(_ c: MapCamera) -> Double { c.metersPerPoint }
    private let wx = MapProjection.x(lon:)
    private let wy = MapProjection.y(lat:)

    func testFitsTheWholeOutlineWithAnEightPerCentMarginOnEverySide() {
        // A neighbourhood about 2.2 km tall and 1.6 km wide, on a tall phone: WIDTH is the tighter axis here, so
        // the outline plus its margin is exactly as wide as the box and there is room to spare above and below.
        let cam = MapCamera.forArea(box(42.33, -83.09, 0.02, 0.02), width: phone.w, height: phone.h)!
        let spanX = abs((wx(-83.07) - wx(-83.09)) * cam.scale), spanY = abs((wy(42.33) - wy(42.35)) * cam.scale)
        XCTAssertEqual(spanX, phone.w / (1 + areaFitMargin * 2), accuracy: 1e-6)
        XCTAssertLessThan(spanY, phone.h)
        // And it is centred on the outline's own middle.
        XCTAssertEqual(cam.centerX, wx(-83.08), accuracy: 1e-9)
        XCTAssertEqual(cam.centerY, wy(42.34), accuracy: 1e-9)
    }

    func testEightPerCentIsTheMarginNotZeroAndNotAGuess() {
        XCTAssertEqual(areaFitMargin, 0.08)
        let cam = MapCamera.forArea(box(42.33, -83.09, 0.02, 0.02), width: phone.w, height: phone.h)!
        let used = abs((wx(-83.07) - wx(-83.09)) * cam.scale)
        XCTAssertEqual(phone.w - used, phone.w * (2 * areaFitMargin) / (1 + 2 * areaFitMargin), accuracy: 1e-6)
    }

    func testPortraitAndLandscapeAreDecidedByTheBoxItIsHanded() {
        let rings = box(42.33, -83.09, 0.02, 0.02)
        let tall = MapCamera.forArea(rings, width: 390, height: 640)!
        let wide = MapCamera.forArea(rings, width: 640, height: 390)!
        // Same middle, different scale: the shorter side is what has to hold the outline.
        XCTAssertEqual(wide.centerX, tall.centerX, accuracy: 1e-9)
        XCTAssertGreaterThan(mpp(wide), mpp(tall))
        // Whichever way round, the WHOLE outline is on screen — `min`, never `cover`.
        for (cam, v) in [(tall, (390.0, 640.0)), (wide, (640.0, 390.0))] {
            XCTAssertLessThanOrEqual(abs((wy(42.33) - wy(42.35)) * cam.scale), v.1 + 1e-9)
            XCTAssertLessThanOrEqual(abs((wx(-83.07) - wx(-83.09)) * cam.scale), v.0 + 1e-9)
        }
    }

    func testATinyNeighbourhoodIsNotOpenedOnSixHouses() {
        // About 110 m across — smaller than the smallest of the City's 205, and the clamp still holds.
        let cam = MapCamera.forArea(box(42.34, -83.08, 0.001, 0.001), width: phone.w, height: phone.h)!
        XCTAssertEqual(mpp(cam), areaMinMetersPerPoint, accuracy: 1e-9)
        XCTAssertEqual(areaMinMetersPerPoint, 4)
        XCTAssertLessThanOrEqual(cam.scale, MapCamera.maxScale)
    }

    func testAWholeCityIsNotOpenedWiderThanTheCameraHasEverAllowed() {
        // Detroit is about 0.2° tall and 0.4° wide; on a phone that is well past the map's own far limit.
        let cam = MapCamera.forArea(box(42.255, -83.288, 0.195, 0.377), width: phone.w, height: phone.h)!
        XCTAssertEqual(mpp(cam), 90, accuracy: 1e-6)
        XCTAssertEqual(cam.scale, MapCamera.minScale, accuracy: 1e-9)
        // A laptop's wider box gets closer, and is still inside the limits.
        let big = MapCamera.forArea(box(42.255, -83.288, 0.195, 0.377), width: laptop.w, height: laptop.h)!
        XCTAssertLessThan(mpp(big), 90)
        XCTAssertGreaterThanOrEqual(big.scale, MapCamera.minScale)
    }

    func testAnAreaTheBundleCarriesNoOutlineForMovesNothingAtAll() {
        XCTAssertNil(MapCamera.forArea([], width: phone.w, height: phone.h))
        XCTAssertNil(MapCamera.forArea([[]], width: phone.w, height: phone.h))
    }

    func testADegenerateOutlineIsACameraNotADivisionByZero() {
        let cam = MapCamera.forArea([[LatLon(lat: 42.34, lon: -83.08)]], width: phone.w, height: phone.h)!
        XCTAssertTrue(cam.scale.isFinite)
        XCTAssertEqual(mpp(cam), areaMinMetersPerPoint, accuracy: 1e-9)
    }
}

final class AreasLandingTests: XCTestCase {
    private let cases: [(why: String, located: Bool, area: Bool, outside: Bool, want: AreasLanding)] = [
        ("nobody has said where they are: the location card, over the anchor view", false, false, false, .ask),
        ("a position allowed this session, inside a neighbourhood: that polygon", true, true, false, .area),
        ("a typed cross street or ZIP is the same answer by another road", true, true, false, .area),
        ("a fix from beyond the four cities: the plain message, and the map stays", false, false, true, .outside),
        ("a point inside the box that no outline holds is the same plain message", true, false, false, .outside),
        ("outside wins even if an older area is still remembered", true, true, true, .outside),
    ]

    func testTheLandingTable() {
        for c in cases {
            XCTAssertEqual(areasLanding(located: c.located, area: c.area, outside: c.outside), c.want, c.why)
        }
    }

    func testTheMapIsNeverTakenAway() {
        // There is no fourth answer, and none of the three is "show a list instead".
        let answers = Set(cases.map { areasLanding(located: $0.located, area: $0.area, outside: $0.outside) })
        XCTAssertEqual(answers, Set([.ask, .area, .outside] as [AreasLanding]))
    }
}

/// Which area a point is in, against the bundle this checkout has built: a Detroit neighborhood first, then the
/// city that holds it, so that a Hamtramck, Highland Park or Dearborn resident lands on their own outline
/// instead of on the dead end the navigation audit found (C1). Skipped, never failed, with no built bundle.
final class AreaContainingTests: XCTestCase {
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
    private static let built: Indicators? = {
        let url = root.appendingPathComponent("data/bundle/v1/indicators/neighborhoods.json")
        guard let d = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Indicators.self, from: d)
    }()

    func testAPointInEachOfTheFourCitiesLandsOnAnOutline() throws {
        guard let d = Self.built else { throw XCTSkip("no built bundle — run `pnpm build:bundle`") }
        try XCTSkipUnless(d.areas?.isEmpty == false, "this bundle carries no city pages yet")
        // Eastern Market: a Detroit point is answered with its neighborhood, never with "Detroit".
        let market = d.area(containing: LatLon(lat: 42.3470, lon: -83.0400))
        XCTAssertEqual(market?.hood.id, "nbh_eastern_market")
        if case .city = market { XCTFail("a Detroit point must answer with its neighborhood") }
        // The three cities that publish no neighborhoods answer with themselves.
        for (name, p, id) in [("Hamtramck", LatLon(lat: 42.3928, lon: -83.0496), "city_hamtramck"),
                              ("Highland Park", LatLon(lat: 42.4055, lon: -83.0971), "city_highland_park"),
                              ("Dearborn", LatLon(lat: 42.3223, lon: -83.1763), "city_dearborn")] {
            let a = d.area(containing: p)
            XCTAssertEqual(a?.hood.id, id, "\(name) did not land on its own outline")
            guard case .city = a else { return XCTFail("\(name) must be a city page") }
        }
        // Lake St Clair: nothing holds it, and nothing is given to the nearest shape.
        XCTAssertNil(d.area(containing: LatLon(lat: 42.55, lon: -82.70)))
    }
}

final class AreasStripTests: XCTestCase {
    private func walk(_ ys: [Double]) -> [StripScroll] {
        var out: [StripScroll] = []
        for y in ys { out.append(stripAt(out.last ?? stripStart(), y: y)) }
        return out
    }

    func testAtTheTopOfThePageTheMapIsAlwaysWhole() {
        XCTAssertEqual(stripStart().state, .open)
        XCTAssertEqual(stripAt(StripScroll(state: .shut, y: 900, pivot: 0), y: 0).state, .open)
        // A rubber-banded over-scroll.
        XCTAssertEqual(stripAt(StripScroll(state: .shut, y: 900, pivot: 0), y: -40).state, .open)
    }

    func testReadingDownShutsItAndTurningRoundOpensItAgain() {
        let down = walk([0, 40, 200, 600])
        XCTAssertEqual(down.last!.state, .shut)
        // Now up a little, still 520 points down the page: the map comes back.
        let up = stripAt(stripAt(down.last!, y: 560), y: 520)
        XCTAssertEqual(up.state, .open)
        XCTAssertEqual(up.y, 520)
    }

    func testAWobbleAtTheEndOfAFlickDoesNotFlapIt() {
        XCTAssertEqual(areasTurnPoints, 8)
        let shut = walk([0, 40, 400])[2]
        XCTAssertEqual(shut.state, .shut)
        XCTAssertEqual(stripAt(shut, y: 396).state, .shut)                       // 4 points back is not a turn
        XCTAssertEqual(stripAt(stripAt(shut, y: 396), y: 390).state, .open)      // 10 points back is
    }

    func testItNeverMovesThePage() {
        let next = stripAt(StripScroll(state: .open, y: 100, pivot: 0), y: 300)
        XCTAssertEqual(next.y, 300)          // what it was told, not something it decided
        XCTAssertEqual(next.state, .shut)
    }

    func testThePageRearrangingItselfAfterACollapseIsNotAPersonTurningRound() {
        XCTAssertEqual(areasSettleMilliseconds, areasShrinkMilliseconds + 80)
        XCTAssertTrue(stripSettling(changedAt: 1000, now: 1000))
        XCTAssertTrue(stripSettling(changedAt: 1000, now: 1000 + areasSettleMilliseconds - 1))
        XCTAssertFalse(stripSettling(changedAt: 1000, now: 1000 + areasSettleMilliseconds))
    }

    func testTheNumbersThePortsNeedAreNamed() {
        XCTAssertEqual(areasStripFraction, 0.38)
        XCTAssertEqual(areasBarPoints, 48)
        XCTAssertEqual(areasShrinkMilliseconds, 240)
    }

    func testReducedMotionStillCollapsesAndStillComesBack() {
        // The state machine has no notion of motion at all, so it behaves identically either way.
        XCTAssertEqual(stripAt(stripStart(), y: 400).state, .shut)
        XCTAssertEqual(stripAt(stripAt(stripStart(), y: 400), y: 0).state, .open)
    }
}
