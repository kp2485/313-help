// The words a trip plan is allowed to say, held to the same table as apps/web/test/directions.test.ts.
//
// Nothing here needs a bundle: the itineraries are the exact shapes `DetroitQuery` returns, written out by hand,
// so `swift test` runs the whole wording contract on Linux as well.
import DetroitQuery
import Foundation
import XCTest
@testable import HelpCore

final class DirWordsTests: XCTestCase {

    /// This file is `apps/ios/Tests/HelpCoreTests/DirWordsTests.swift`, so the repository root is five levels up.
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    static let languages = ["en", "es", "ar", "bn"]
    static let tables: [String: [String: String]] = {
        var out: [String: [String: String]] = [:]
        for l in languages {
            let url = root.appendingPathComponent("strings/\(l).json")
            guard let d = try? Data(contentsOf: url),
                  let t = try? JSONDecoder().decode([String: String].self, from: d) else { continue }
            out[l] = t
        }
        return out
    }()

    /// The app's own `L.t`, for one language, with the same fallback rule.
    func say(_ l: String) -> Say {
        { key, p in
            var s = Self.tables[l]?[key] ?? Self.tables["en"]?[key] ?? key
            for (k, v) in p { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
            return s
        }
    }
    var t: Say { say("en") }

    // MARK: - the fixture plans (the web test's, leg for leg)

    private func walkLeg(_ metres: Double, _ steps: [WalkStep], _ line: [[Double]],
                         toStop: StopRef? = nil, fromStop: StopRef? = nil) -> PlanLeg {
        .walk(WalkLeg(metres: metres, minutes: metres / WALK_M_PER_MIN, steps: steps, polyline: line,
                      toStop: toStop, fromStop: fromStop))
    }
    private func rideLeg(stops: Int = 9, headway: Double? = 15) -> PlanLeg {
        .ride(RideLeg(routeId: "rt_ddot_4", routeShort: "4", routeLong: "Woodward", agency: "DDOT",
                      headwayMinutes: headway,
                      fromStop: StopRef(index: 1, name: "Woodward & Warren"),
                      toStop: StopRef(index: 10, name: "Woodward & Grand Blvd"),
                      stops: stops, metres: 2800, minutes: 10, waitMinutes: 7.5,
                      polyline: [[-83.066, 42.355], [-83.072, 42.368], [-83.074, 42.370]]))
    }
    private func finish(_ legs: [PlanLeg], endOff: Double = 40) -> Itinerary {
        var walk = 0.0, ride = 0.0, minutes = 0.0, rides = 0
        for l in legs {
            switch l {
            case .walk(let w): walk += w.metres; minutes += w.minutes
            case .ride(let r): ride += r.metres; minutes += r.minutes + r.waitMinutes; rides += 1
            }
        }
        return Itinerary(legs: legs, changes: max(0, rides - 1), walkMetres: walk, rideMetres: ride,
                         minutes: minutes, range: minutesRange(minutes), startOffMetres: 12, endOffMetres: endOff)
    }

    private var walkOnly: Itinerary {
        finish([walkLeg(1930, [
            WalkStep(street: "Woodward Ave", bearing: .north, turn: nil, metres: 480),
            WalkStep(street: "Warren Ave", bearing: .west, turn: .left, metres: 1290),
            WalkStep(street: "Yellowstone St", bearing: .north, turn: .right, metres: 160),
        ], [[-83.0458, 42.3314], [-83.0500, 42.3400], [-83.0600, 42.3450]])])
    }
    private var bus: Itinerary {
        finish([
            walkLeg(480, [WalkStep(street: "Woodward Ave", bearing: .north, turn: nil, metres: 480)],
                    [[-83.0458, 42.3314], [-83.0466, 42.3355]], toStop: StopRef(index: 1, name: "Woodward & Warren")),
            rideLeg(),
            walkLeg(160, [WalkStep(street: "Yellowstone St", bearing: .west, turn: nil, metres: 160)],
                    [[-83.074, 42.370], [-83.0755, 42.3705]], fromStop: StopRef(index: 10, name: "Woodward & Grand Blvd")),
        ])
    }

    // MARK: - the step list, which is the source of truth for the whole screen

    func testReadsAsTheSpecsOwnExample() {
        XCTAssertEqual(dirSteps(t, bus, destination: "Auntie Na's Village").map(\.text), [
            "Walk north on Woodward Ave for 0.3 mi",
            "Walk 0.3 mi to Woodward & Warren",
            "Board the 4 at Woodward & Warren toward Woodward",
            "Ride 9 stops to Woodward & Grand Blvd",
            "Get off at Woodward & Grand Blvd",
            "Walk west on Yellowstone St for 0.1 mi",
            "Walk 0.1 mi to Auntie Na's Village",
            "Then about 40 m to the building",
        ])
    }

    func testAPureWalkIsTurnByTurnAndTheFirstStepHasNoTurnWord() {
        XCTAssertEqual(dirSteps(t, walkOnly, destination: "Auntie Na's Village").map(\.text), [
            "Walk north on Woodward Ave for 0.3 mi",
            "Turn left onto Warren Ave and walk 0.8 mi",
            "Turn right onto Yellowstone St and walk 0.1 mi",
            "Walk 1.2 mi to Auntie Na's Village",
            "Then about 40 m to the building",
        ])
    }

    func testOneStopIsOneStop() {
        let legs = bus.legs
        let one = finish([legs[0], rideLeg(stops: 1), legs[2]])
        XCTAssertTrue(dirSteps(t, one, destination: "X").map(\.text).contains("Ride 1 stop to Woodward & Grand Blvd"))
        XCTAssertTrue(legsLine(t, one).contains("ride 1 stop"))
    }

    func testEveryStepSaysWhichLegItBelongsTo() {
        XCTAssertEqual(dirSteps(t, bus, destination: "X").map(\.leg), [0, 0, 1, 1, 1, 2, 2, 2])
    }

    /// The four-language table: no key leaks onto a screen, no placeholder is left unfilled, and a turn or a
    /// compass word that fell back to its key would show as "dir.turn.left" inside a sentence.
    func testEverySentenceIsARealSentenceInAllFourLanguages() {
        for l in Self.languages {
            XCTAssertNotNil(Self.tables[l], "strings/\(l).json is missing")
            let say = say(l)
            for it in [walkOnly, bus] {
                for s in dirSteps(say, it, destination: "Auntie Na's Village") {
                    XCTAssertFalse(s.text.hasPrefix("dir."), "\(l): \(s.text)")
                    XCTAssertFalse(s.text.contains("dir."), "\(l): \(s.text)")
                    XCTAssertFalse(s.text.contains("{"), "\(l): a placeholder was left unfilled: \(s.text)")
                    XCTAssertGreaterThan(s.text.trimmingCharacters(in: .whitespaces).count, 4, "\(l): \(s.text)")
                }
                XCTAssertFalse(dirSummary(say, it).contains("dir."), l)
                XCTAssertFalse(dirSummary(say, it).contains("{"), l)
                XCTAssertFalse(dirRouteText(say, it).contains("{"), l)
            }
        }
    }

    func testTurnAndCompassWordsAreTranslated() {
        for l in ["es", "ar", "bn"] {
            for k in ["dir.turn.left", "dir.turn.right", "dir.bearing.north", "dir.bearing.west"] {
                XCTAssertNotNil(Self.tables[l]?[k], "\(l) \(k)")
                XCTAssertNotEqual(Self.tables[l]?[k], Self.tables["en"]?[k], "\(l) \(k) is still English")
            }
        }
    }

    /// A turn is a WORD, so nothing has to mirror in Arabic and nothing depends on a glyph.
    func testNoArrowGlyphsInAnyLanguage() {
        let arrows = Set("←→↑↓⬅➡⬆⬇↰↱⤴⤵")
        for l in Self.languages {
            for (k, v) in Self.tables[l] ?? [:] where k.hasPrefix("dir.") {
                XCTAssertNil(v.first { arrows.contains($0) }, "\(l) \(k) carries an arrow glyph")
            }
        }
    }

    // MARK: - the three rules of DECISIONS 2026-09-22

    func testTheEstimateIsAlwaysARange() {
        let words = rangeWords(t, bus)
        XCTAssertTrue(words.contains("–"), words)
        XCTAssertGreaterThanOrEqual(bus.range.hi - bus.range.lo, 5)
        // Never a clock time: no ":" and no am/pm anywhere in the card's own line.
        XCTAssertFalse(dirSummary(t, bus).contains(":"))
    }

    func testAHeadwayIsOnlyEverTheAgencysOwnSentence() {
        XCTAssertEqual(headwayWords(t, bus), "about every 15 min")
        let legs = bus.legs
        let quiet = finish([legs[0], rideLeg(headway: nil), legs[2]])
        XCTAssertEqual(headwayWords(t, quiet), "", "a route that publishes no headway says nothing")
        // The assumed wait is never shown, in any language.
        for l in Self.languages {
            XCTAssertFalse(dirSummary(say(l), quiet).contains("7.5"), l)
        }
    }

    func testNothingSaysSafeOrAccessible() {
        let banned = ["safe", "accessible", "lit ", "step-free", "well-lit"]
        for it in [walkOnly, bus] {
            var all = [dirSummary(t, it), dirRouteText(t, it), legsLine(t, it)]
            all += dirSteps(t, it, destination: "X").map(\.text)
            for line in all { for word in banned { XCTAssertFalse(line.lowercased().contains(word), line) } }
        }
    }

    func testTheLastThingAPersonIsToldIsTheStreetNotTheDoor() {
        XCTAssertEqual(dirSteps(t, bus, destination: "X").last?.text, "Then about 40 m to the building")
        // Under five metres there is nothing to say.
        let close = finish(bus.legs, endOff: 3)
        XCTAssertEqual(dirSteps(t, close, destination: "X").last?.text, "Walk 0.1 mi to X")
    }

    func testAWalkingDistanceNeverReadsAsNoDistanceAtAll() {
        XCTAssertEqual(dirDistance(t, metres: 10), "0.1 mi")
        XCTAssertEqual(dirDistance(t, metres: 0), "0.1 mi")
        XCTAssertEqual(dirOffStreet(t, metres: 39.6), "40 m")
    }

    func testABusIsCalledWhatItsRiderReadsOffTheFrontOfIt() {
        guard case .ride(let r) = bus.legs[1] else { return XCTFail("no ride leg") }
        XCTAssertEqual(routeName(r), "4")
        XCTAssertEqual(towardName(r), "Woodward")
        var same = r; same.routeLong = "4"
        XCTAssertEqual(towardName(same), "", "a long name that repeats the short one says nothing")
    }

    // MARK: - the cards, and the route drawn on the map

    func testTheCardNamesTheShapeOfTheTrip() {
        XCTAssertEqual(itineraryTitle(t, walkOnly), "Walk")
        XCTAssertEqual(itineraryTitle(t, bus), "Bus 4")
        XCTAssertTrue(legsLine(t, bus).contains("ride 9 stops"))
    }

    func testAOneChangePlanNamesBothBuses() {
        let legs = bus.legs
        let two = finish([legs[0], rideLeg(), rideLeg(), legs[2]])
        XCTAssertEqual(itineraryTitle(t, two), "Bus 4, then bus 4")
    }

    func testARideWearsItsAgencysLayerToneAndAWalkItsOwn() {
        XCTAssertEqual(rideToken(agency: "DDOT"), "bus")
        XCTAssertEqual(rideToken(agency: "SMART"), "smart")
        XCTAssertEqual(rideToken(agency: "QLINE"), "rail")
        XCTAssertEqual(rideToken(agency: "Detroit People Mover"), routeRideToken)
        XCTAssertEqual(routeWalkToken, "routeWalk")
    }

    // MARK: - following along, and what it will not do

    func testKnowsHowFarOffTheLineAPersonIs() {
        let line = [[-83.0458, 42.3314], [-83.0458, 42.3400]]
        XCTAssertLessThan(metresFromRoute(LatLon(lat: 42.3350, lon: -83.0458), [line]), 1)
        let away = metresFromRoute(LatLon(lat: 42.3350, lon: -83.0470), [line])
        XCTAssertGreaterThan(away, 50)
        XCTAssertLessThan(away, 200)
        XCTAssertEqual(offRouteMetres, 120)
    }

    func testSaysWhichStepAPersonIsOn() {
        let list = dirSteps(t, bus, destination: "X")
        // Standing on the ride leg: the first step of that leg.
        XCTAssertEqual(currentStep(LatLon(lat: 42.368, lon: -83.072), bus, list), 2)
        // Standing at the start: the first step of all.
        XCTAssertEqual(currentStep(LatLon(lat: 42.3314, lon: -83.0458), bus, list), 0)
    }

    // MARK: - the start decision table

    func testTheStartDecisionTable() {
        XCTAssertEqual(dirOriginKind(hasPoint: false, zip: nil, cross: nil), .none)
        XCTAssertEqual(dirOriginKind(hasPoint: false, zip: "48226", cross: nil), .none)
        XCTAssertEqual(dirOriginKind(hasPoint: true, zip: nil, cross: nil), .me)
        XCTAssertEqual(dirOriginKind(hasPoint: true, zip: "48226", cross: nil), .zip)
        XCTAssertEqual(dirOriginKind(hasPoint: true, zip: nil, cross: "Woodward & Warren"), .cross)
        XCTAssertEqual(dirOriginKind(hasPoint: true, zip: "", cross: ""), .me)
    }

    /// The cross-street field is first on the Directions screen and nowhere else: it is the only one of the
    /// three that works with no satellite and no signal at all (DECISIONS 2026-09-22).
    func testTheCrossStreetFieldIsFirstOnDirectionsAndNowhereElse() {
        XCTAssertEqual(dirWays(crossFirst: true), [.cross, .use, .zip])
        XCTAssertEqual(dirWays(crossFirst: false), [.use, .cross, .zip])
    }
}
