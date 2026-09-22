// "Type a cross street", held to the same table as apps/web/test/navigation.test.ts. If the phone and the
// browser ever make different sense of "Seven Mile at Woodward", one of the two is wrong.
//
// Linux-clean: it reads files in this repository and does arithmetic. Nothing here touches the network, and
// nothing a person types is ever written down — that is the whole point of the module under test.
import Foundation
import XCTest
@testable import DetroitQuery
@testable import HelpCore

final class CrossStreetParseTests: XCTestCase {

    /// Every form a person actually writes a junction in, and what this app makes of it. The same table the web
    /// and Android runners use.
    func testWhatAPersonTyped() {
        let cases: [(String, String, String)] = [
            ("Woodward and Warren", "Woodward", "Warren"),
            ("Woodward & Warren", "Woodward", "Warren"),
            ("Warren at Woodward", "Warren", "Woodward"),
            ("Woodward/Warren", "Woodward", "Warren"),
            ("Woodward @ Warren", "Woodward", "Warren"),
            ("woodward   and   warren", "woodward", "warren"),
            ("Grand River and W Warren Ave", "Grand River", "W Warren Ave"),
            ("Woodward", "Woodward", ""),
        ]
        for (typed, a, b) in cases {
            let got = parseCrossing(typed)
            XCTAssertEqual(got?.a, a, typed)
            XCTAssertEqual(got?.b, b, typed)
        }
    }

    func testNothingTypedIsNotAQuestion() {
        for s in ["", "   ", "\t"] { XCTAssertNil(parseCrossing(s), "\"\(s)\"") }
    }

    func testAStreetNameNormalised() {
        let cases: [(String, String, String)] = [
            ("Woodward Ave", "woodward", ""),
            ("woodward avenue", "woodward", ""),
            ("WOODWARD", "woodward", ""),
            ("Woodward Ave.", "woodward", ""),
            ("E Warren Ave", "warren", "e"),
            ("East Warren", "warren", "e"),
            ("W. Grand Blvd", "grand", "w"),
            ("7 Mile Rd", "7 mile", ""),
            ("Seven Mile", "7 mile", ""),
            ("Grand River Ave", "grand river", ""),
            ("Mount Elliott St", "mount elliott", ""),
            ("Groesbeck Hwy", "groesbeck", ""),
            // A street-type word that IS the name keeps it: "Way" and "Circle" are real Detroit street names.
            ("Way", "way", ""),
        ]
        for (typed, name, dir) in cases {
            XCTAssertEqual(normStreet(typed), StreetName(name: name, dir: dir), typed)
        }
    }

    func testATypedDirectionNarrowsAndNoneMatchesEitherHalf() {
        XCTAssertTrue(nameMatches(typed: normStreet("E Warren"), known: normStreet("E Warren Ave")))
        XCTAssertFalse(nameMatches(typed: normStreet("E Warren"), known: normStreet("W Warren Ave")))
        XCTAssertTrue(nameMatches(typed: normStreet("Warren"), known: normStreet("W Warren Ave")))
        XCTAssertTrue(nameMatches(typed: normStreet("Warren"), known: normStreet("E Warren Ave")))
        XCTAssertTrue(nameMatches(typed: normStreet("Warren"), known: normStreet("Warren Ave")))
    }
}

final class CrossStreetGeometryTests: XCTestCase {

    private func line(_ pts: [(lon: Double, lat: Double)]) -> [Double] {
        pts.flatMap { [MapProjection.x(lon: $0.lon), MapProjection.y(lat: $0.lat)] }
    }
    private func ns(_ lon: Double) -> NamedLine {
        let p = line([(lon, 42.30), (lon, 42.40)]); return NamedLine(name: "NS", points: p, box: MapBox.around(p))
    }
    private func ew(_ lat: Double) -> NamedLine {
        let p = line([(-83.10, lat), (-83.00, lat)]); return NamedLine(name: "EW", points: p, box: MapBox.around(p))
    }

    func testTwoStraightPiecesGiveTheCrossingOrNothing() {
        let hit = segmentCross(0, 0, 10, 0, 5, -5, 5, 5)
        XCTAssertEqual(hit?.x, 5); XCTAssertEqual(hit?.y, 0)
        XCTAssertNil(segmentCross(0, 0, 10, 0, 0, 1, 10, 1))            // parallel
        XCTAssertNil(segmentCross(0, 0, 10, 0, 20, -5, 20, 5))          // past the end of the first
    }

    func testAGridGivesOneCrossingPerPairAtTheRightPlace() {
        let hits = crossingsOf([ns(-83.05)], [ew(42.35)])
        XCTAssertEqual(hits.count, 1)
        XCTAssertEqual(hits[0].lat, 42.35, accuracy: 1e-5)
        XCTAssertEqual(hits[0].lon, -83.05, accuracy: 1e-5)
    }

    func testAStreetCrossingAnotherTwiceGivesTwoAnswersNorthToSouth() {
        let hits = crossingsOf([ns(-83.05)], [ew(42.32), ew(42.38)])
        XCTAssertEqual(hits.count, 2)
        XCTAssertEqual(hits[0].lat, 42.38, accuracy: 1e-5)               // north first
        XCTAssertEqual(hits[1].lat, 42.32, accuracy: 1e-5)
        XCTAssertEqual(whereWords(hits), ["north", "south"])
    }

    func testTwoStreetsThatNeverMeetGiveNoneNotTheNearestThingToAnAnswer() {
        XCTAssertTrue(crossingsOf([ns(-83.05)], [ns(-83.02)]).isEmpty)
    }

    func testOneJunctionDrawnBySeveralRoadRecordsIsOneAnswer() {
        // A boulevard's two carriageways, 30 m apart: one junction, not two.
        let near = 30 / 111320.0
        XCTAssertEqual(crossingsOf([ns(-83.05)], [ew(42.35), ew(42.35 + near)]).count, 1)
    }

    func testAPairSpreadEastAndWestIsNamedEastAndWest() {
        XCTAssertEqual(whereWords([LatLon(lat: 42.35, lon: -83.10), LatLon(lat: 42.35, lon: -83.00)]), ["west", "east"])
        XCTAssertEqual(whereWords([LatLon(lat: 42.35, lon: -83.05)]), [""])
    }

    func testOneStreetNameIsAnsweredWithTheMiddleOfTheLongestPieceAlongIt() {
        let p = midpointOf([ns(-83.05)])
        XCTAssertEqual(p?.lat ?? 0, 42.35, accuracy: 1e-4)
        XCTAssertEqual(p?.lon ?? 0, -83.05, accuracy: 1e-5)
    }
}

/// The real streets, from the bundle this repository builds. Skipped, loudly, when there is no bundle: the file
/// is never committed (CLAUDE.md), so `pnpm build:bundle` is what turns these on.
final class RealCrossStreetTests: XCTestCase {
    private static let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
    private static var bundle: URL { root.appendingPathComponent("data/bundle/v1") }

    private static let map: BaseMap? = {
        guard let base = try? Data(contentsOf: bundle.appendingPathComponent("map/base.json")),
              let streets = try? Data(contentsOf: bundle.appendingPathComponent("map/streets.json")),
              let m = try? MapFileDecoder.baseMap(base: base, streets: streets) else { return nil }
        return m
    }()

    private func cross() throws -> CrossStreets {
        let m = try XCTUnwrap(Self.map, "no bundle in this checkout — run `pnpm build:bundle`")
        return CrossStreets(map: m)
    }

    func testKnowsTheStreetsPeopleName() throws {
        let m = try XCTUnwrap(Self.map, "no bundle in this checkout — run `pnpm build:bundle`")
        let index = StreetIndex(m)
        for name in ["woodward", "grand river", "gratiot", "michigan", "8 mile"] {
            XCTAssertFalse(index.lines(for: name).isEmpty, name)
        }
    }

    func testWoodwardAndWarrenIsOneJunctionInMidtown() throws {
        let out = try XCTUnwrap(cross().resolve("Woodward and Warren"))
        // Warren has an east and a west half, so this may be one point or a short list; either way every answer
        // is on Woodward in Midtown, which is the fact that matters.
        let points: [LatLon]
        switch out {
        case .point(let p, _, _): points = [p]
        case .choices(_, _, let c): points = c.map(\.point)
        default: points = []
        }
        XCTAssertFalse(points.isEmpty)
        for p in points {
            XCTAssertGreaterThan(p.lat, 42.34); XCTAssertLessThan(p.lat, 42.37)
            XCTAssertGreaterThan(p.lon, -83.08); XCTAssertLessThan(p.lon, -83.05)
        }
    }

    /// Woodward IS the line that splits E 7 Mile from W 7 Mile, so the road records that carry the name all meet
    /// it at one junction, which the merge correctly reports as one answer.
    func testWoodwardAndSevenMileIsOneJunction() throws {
        let out = try XCTUnwrap(cross().resolve("Woodward & 7 Mile"))
        guard case .point(let p, _, _) = out else { return XCTFail("expected one junction, got \(out)") }
        XCTAssertEqual(p.lat, 42.4321, accuracy: 0.01)
        XCTAssertEqual(p.lon, -83.1150, accuracy: 0.01)
    }

    func testTwoStreetsThatReallyCrossTwiceAreAShortList() throws {
        // Dequindre crosses Davison twice: the street and the service drive beside the freeway.
        let out = try XCTUnwrap(cross().resolve("Dequindre and Davison"))
        guard case .choices(_, _, let choices) = out else { return XCTFail("expected a short list, got \(out)") }
        XCTAssertGreaterThanOrEqual(choices.count, 2)
        XCTAssertLessThanOrEqual(choices.count, maxCrossChoices)
        XCTAssertEqual(Set(choices.map(\.whereWord)).count, 2)           // two ends, two words
        for c in choices { XCTAssertTrue(["north", "south", "east", "west"].contains(c.whereWord)) }
    }

    func testSevenMileAtWoodwardIsTheSameQuestion() throws {
        let c = try cross()
        // The outcome carries the words the person typed, so the two differ there and nowhere else: the same
        // kind of answer, at the same junction.
        let a = try XCTUnwrap(c.resolve("Woodward & 7 Mile")), b = try XCTUnwrap(c.resolve("Seven Mile at Woodward"))
        guard case .point(let pa, _, _) = a, case .point(let pb, _, _) = b else { return XCTFail("\(a) vs \(b)") }
        XCTAssertEqual(pa, pb)
    }

    func testOneStreetNameIsAnsweredWithTheMiddleOfItAndSaidToBeThat() throws {
        let out = try XCTUnwrap(cross().resolve("Woodward Ave"))
        guard case .street(let p, let a) = out else { return XCTFail("expected the middle of a street, got \(out)") }
        XCTAssertEqual(a, "Woodward Ave")
        XCTAssertTrue(inServiceArea(p))
    }

    func testAStreetWeDoNotCarryIsSaidToBeUnknownNeverGuessedAt() throws {
        // Deliberately a street this city does not have: the app says it does not know it, and never answers
        // with the nearest thing it does know.
        let out = try XCTUnwrap(cross().resolve("Nonesuch Boulevard and Woodward"))
        guard case .unknown(let name) = out else { return XCTFail("expected unknown, got \(out)") }
        XCTAssertEqual(name, "Nonesuch Boulevard")
    }

    func testTwoRealStreetsThatDoNotMeetSaySo() throws {
        let out = try XCTUnwrap(cross().resolve("8 Mile and Michigan"))
        guard case .noCrossing = out else { return XCTFail("expected no crossing, got \(out)") }
    }
}
