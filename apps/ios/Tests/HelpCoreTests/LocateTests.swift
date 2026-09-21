// The Map tab's first open (HelpCore/Locate.swift and MapCamera.forRadius). The same table of cases as
// apps/web/test/locate.test.ts and apps/android/.../LocateTest.kt: if one of the three ever answers differently,
// one of the three is wrong.
//
// Linux-clean: no CoreLocation, no SwiftUI, nothing that needs a phone.
import XCTest
@testable import DetroitQuery
@testable import HelpCore

final class LocateDecisionTests: XCTestCase {

    /// The table. Every client runs these exact rows.
    private let cases: [(why: String, answered: Bool, permission: LocatePermission, zip: Bool, want: FirstOpenAction)] = [
        ("a first open, nothing known: our own card, and no sheet yet", false, .prompt, false, .showCard),
        ("a state we do not recognise is still a first open", false, .unknown, false, .showCard),
        ("the card has been answered: never again on this phone", true, .prompt, false, .none),
        ("permission already given on Home: no card, straight to the person", false, .granted, false, .centreOnPerson),
        ("permission given and the card long since answered: the same", true, .granted, false, .centreOnPerson),
        ("already refused: a card whose button cannot work is a dead end", false, .denied, false, .none),
        ("a typed ZIP wins over everything: they already said where to look", false, .prompt, true, .centreOnZip),
        ("a typed ZIP wins even when permission was given", true, .granted, true, .centreOnZip),
        ("a typed ZIP wins even when permission was refused", true, .denied, true, .centreOnZip),
    ]

    func testWhatTheMapTabDoesWhenItOpens() {
        for c in cases {
            XCTAssertEqual(firstOpenAction(flagAnswered: c.answered, permission: c.permission, hasNearFromZip: c.zip),
                           c.want, c.why)
        }
    }

    func testTheCardIsShownExactlyOnce() {
        XCTAssertEqual(firstOpenAction(flagAnswered: false, permission: .prompt, hasNearFromZip: false), .showCard)
        // Answering it is the whole of what stops it coming back.
        XCTAssertEqual(firstOpenAction(flagAnswered: true, permission: .prompt, hasNearFromZip: false), .none)
    }
}

final class ServiceBoxTests: XCTestCase {

    func testKnowsTheFourCities() {
        XCTAssertTrue(inServiceArea(LatLon(lat: 42.3487, lon: -83.0567)))   // downtown Detroit
        XCTAssertTrue(inServiceArea(LatLon(lat: 42.3934, lon: -83.0497)))   // Hamtramck City Hall
        XCTAssertTrue(inServiceArea(LatLon(lat: 42.4055, lon: -83.0968)))   // Highland Park City Hall
        XCTAssertTrue(inServiceArea(LatLon(lat: 42.3224, lon: -83.1763)))   // Dearborn
        XCTAssertFalse(inServiceArea(LatLon(lat: 41.8781, lon: -87.6298)))  // Chicago
    }

    func testIsTheSameBoxTheOtherTwoClientsUse() {
        XCTAssertEqual(ServiceBox.latMin, 42.25)
        XCTAssertEqual(ServiceBox.latMax, 42.46)
        XCTAssertEqual(ServiceBox.lonMin, -83.33)
        XCTAssertEqual(ServiceBox.lonMax, -82.91)
        XCTAssertTrue(inServiceArea(lat: 42.25, lon: -83.33))
        XCTAssertTrue(inServiceArea(lat: 42.46, lon: -82.91))
        for p in [(42.2499, -83.0), (42.4601, -83.0), (42.35, -83.3301), (42.35, -82.9099)] {
            XCTAssertFalse(inServiceArea(lat: p.0, lon: p.1), "\(p) is outside the four cities")
        }
    }

    func testAFixThatIsNotANumberIsNotInsideAnything() {
        XCTAssertFalse(inServiceArea(lat: .nan, lon: -83.05))
        XCTAssertFalse(inServiceArea(lat: 42.35, lon: .infinity))
    }
}

final class LocateCameraTests: XCTestCase {

    private let here = LatLon(lat: 42.3487, lon: -83.0567)
    private func metresAcrossShortSide(_ c: MapCamera) -> Double {
        min(c.width, c.height) * MapProjection.metersPerUnit / c.scale
    }

    func testTwoMilesInEveryDirection() {
        XCTAssertEqual(locateRadiusMeters, 3218.688, accuracy: 0.001)       // two miles, in metres
        let cam = MapCamera.forRadius(here, radiusMeters: locateRadiusMeters, width: 390, height: 780)
        XCTAssertEqual(metresAcrossShortSide(cam), 6437.376, accuracy: 1)
    }

    func testTheShorterSideInLandscapeToo() {
        let portrait = MapCamera.forRadius(here, radiusMeters: locateRadiusMeters, width: 390, height: 780)
        let landscape = MapCamera.forRadius(here, radiusMeters: locateRadiusMeters, width: 780, height: 390)
        XCTAssertEqual(portrait.scale, landscape.scale, accuracy: 1e-6)
        XCTAssertEqual(metresAcrossShortSide(landscape), 6437.376, accuracy: 1)
    }

    func testPutsTheMiddleOnThePerson() {
        let cam = MapCamera.forRadius(here, radiusMeters: locateRadiusMeters, width: 390, height: 780)
        let q = MapProjection.point(here)
        XCTAssertEqual(cam.centerX, q.x, accuracy: 1e-9)
        XCTAssertEqual(cam.centerY, q.y, accuracy: 1e-9)
    }

    func testNeverZoomsPastTheMapsOwnLimits() {
        XCTAssertEqual(MapCamera.forRadius(here, radiusMeters: 1, width: 390, height: 780).scale,
                       MapCamera.maxScale, accuracy: 1e-6)
        XCTAssertEqual(MapCamera.forRadius(here, radiusMeters: 5_000_000, width: 390, height: 780).scale,
                       MapCamera.minScale, accuracy: 1e-6)
        XCTAssertEqual(MapCamera.forRadius(here, radiusMeters: 0, width: 390, height: 780).scale,
                       MapCamera.maxScale, accuracy: 1e-6)
    }

    func testABoxWithNoSizeYetDoesNotProduceACameraWithNoScale() {
        let cam = MapCamera.forRadius(here, radiusMeters: locateRadiusMeters, width: 0, height: 0)
        XCTAssertTrue(cam.scale.isFinite)
        XCTAssertGreaterThanOrEqual(cam.scale, MapCamera.minScale)
        XCTAssertGreaterThan(cam.width, 0)
    }

    func testAPointOnTheEdgeOfTheCityStaysWithinThePanLimits() {
        for p in [(42.25, -83.33), (42.46, -82.91), (42.25, -82.91), (42.46, -83.33)] {
            let cam = MapCamera.forRadius(LatLon(lat: p.0, lon: p.1), radiusMeters: locateRadiusMeters,
                                          width: 390, height: 780)
            XCTAssertLessThanOrEqual(abs(cam.centerX), MapCamera.panLimitX + 1e-9)
            XCTAssertLessThanOrEqual(abs(cam.centerY), MapCamera.panLimitY + 1e-9)
        }
    }
}

final class LocateFlagStoreTests: XCTestCase {

    private func tempDir() throws -> URL {
        let d = FileManager.default.temporaryDirectory
            .appendingPathComponent("locate-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    func testStartsUnanswered() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        XCTAssertFalse(LocateFlagStore(dir: dir).answered)
    }

    func testRemembersThatItWasAnsweredAcrossLaunches() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let first = LocateFlagStore(dir: dir)
        XCTAssertTrue(first.markAnswered())
        XCTAssertTrue(first.answered)
        XCTAssertTrue(LocateFlagStore(dir: dir).answered, "a new launch reads the same file")
    }

    func testForgettingBringsTheCardBack() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = LocateFlagStore(dir: dir)
        store.markAnswered()
        store.forget()
        XCTAssertFalse(LocateFlagStore(dir: dir).answered)
    }

    func testAFileOfRubbishReadsAsUnanswered() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("not json at all".utf8).write(to: dir.appendingPathComponent("map-locate.json"))
        XCTAssertFalse(LocateFlagStore(dir: dir).answered)
    }

    func testHoldsNothingButTheFlag() throws {
        let dir = try tempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        LocateFlagStore(dir: dir).markAnswered()
        let text = String(decoding: try Data(contentsOf: dir.appendingPathComponent("map-locate.json")), as: UTF8.self)
        // One key. There is nowhere in this file for a coordinate to be, which is the point of it being this small.
        XCTAssertEqual(text, "{\"answered\":true}")
        for forbidden in ["lat", "lon", "42.", "-83."] {
            XCTAssertFalse(text.contains(forbidden), "the flag file must never carry \(forbidden)")
        }
    }
}
