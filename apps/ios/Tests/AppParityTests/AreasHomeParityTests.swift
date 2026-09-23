// The Areas tab as a map (Kyle, 2026-09-22; DECISIONS 2026-09-22), held to the web app's own files.
//
// Two things must not drift. **The numbers**: the strip is 38 % of the viewport, the bar it collapses to is 48
// points, a turn is 8 points, the shrink is 240 ms, the settling period is 320 ms, the camera leaves an 8 %
// margin and never opens closer than 4 m per pixel. They are written down in `apps/web/src/areas.ts` and
// `apps/web/src/map.ts` and again in `apps/ios/Sources/HelpCore/AreasHome.swift`, and a number that means the
// same thing on two clients has to BE the same number. **The words**: the eight strings the tab's map face needs
// exist in all four languages, and "You are in {name}" keeps its placeholder everywhere.
//
// Like the other parity tests this reads files as text, so it runs with `swift test` and needs no Xcode.
import Foundation
import XCTest

final class AreasHomeParityTests: XCTestCase {

    /// This file is `apps/ios/Tests/AppParityTests/AreasHomeParityTests.swift`: the root is five levels up.
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private static let languages = ["en", "es", "ar", "bn"]

    private func text(_ path: String) throws -> String {
        try String(contentsOf: Self.root.appendingPathComponent(path), encoding: .utf8)
    }
    private func strings(_ lang: String) throws -> [String: String] {
        let d = try Data(contentsOf: Self.root.appendingPathComponent("strings/\(lang).json"))
        return try JSONDecoder().decode([String: String].self, from: d)
    }
    /// The number a `const NAME = value` or a `public let name = value` gives, whichever file it is in.
    private func number(_ source: String, _ pattern: String) throws -> Double? {
        let re = try NSRegularExpression(pattern: pattern)
        let ns = source as NSString
        guard let m = re.firstMatch(in: source, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return Double(ns.substring(with: m.range(at: 1)))
    }

    // MARK: - the numbers

    /// The four numbers of the collapsing strip, on both clients. `AREAS_SETTLE_MS` is derived from the shrink on
    /// both, so the derivation is what is compared rather than the sum.
    func testTheStripNumbersAreTheSameOnBothClients() throws {
        let web = try text("apps/web/src/areas.ts"), swift = try text("apps/ios/Sources/HelpCore/AreasHome.swift")
        for (webName, swiftName, webToSwift) in [
            ("AREAS_STRIP_VH", "areasStripFraction", 0.01),          // 38 % on the web is 0.38 here
            ("AREAS_BAR_PX", "areasBarPoints", 1.0),
            ("AREAS_TURN_PX", "areasTurnPoints", 1.0),
            ("AREAS_SHRINK_MS", "areasShrinkMilliseconds", 1.0),
        ] {
            let w = try number(web, "\(webName)\\s*=\\s*([0-9.]+)")
            let s = try number(swift, "public let \(swiftName)\\s*=\\s*([0-9.]+)")
            XCTAssertNotNil(w, "apps/web/src/areas.ts no longer names \(webName)")
            XCTAssertNotNil(s, "AreasHome.swift no longer names \(swiftName)")
            XCTAssertEqual(s!, w! * webToSwift, accuracy: 1e-9, "\(swiftName) differs from \(webName)")
        }
        // And the settling period is the shrink plus 80 on both, rather than a second literal to keep in step.
        XCTAssertTrue(web.contains("AREAS_SETTLE_MS = AREAS_SHRINK_MS + 80"), "the web's settling period changed")
        XCTAssertTrue(swift.contains("areasSettleMilliseconds = areasShrinkMilliseconds + 80"),
                      "the iPhone's settling period changed")
    }

    /// The camera that frames one outline: the same margin and the same closest opening, or the two apps open the
    /// Areas tab on two different pictures of the same neighbourhood.
    func testTheCameraNumbersAreTheSameOnBothClients() throws {
        let web = try text("apps/web/src/map.ts"), swift = try text("apps/ios/Sources/HelpCore/AreasHome.swift")
        let margin = try number(web, "AREA_FIT_MARGIN\\s*=\\s*([0-9.]+)")
        let mpp = try number(web, "AREA_MIN_MPP\\s*=\\s*([0-9.]+)")
        XCTAssertEqual(margin, 0.08)
        XCTAssertEqual(mpp, 4)
        XCTAssertEqual(try number(swift, "public let areaFitMargin\\s*=\\s*([0-9.]+)"), margin)
        XCTAssertEqual(try number(swift, "public let areaMinMetersPerPoint\\s*=\\s*([0-9.]+)"), mpp)
    }

    /// The landing has three answers on both clients, and the same three.
    func testTheLandingHasTheSameThreeAnswers() throws {
        let web = try text("apps/web/src/areas.ts"), swift = try text("apps/ios/Sources/HelpCore/AreasHome.swift")
        for answer in ["area", "ask", "outside"] {
            XCTAssertTrue(web.contains("'\(answer)'"), "the web no longer lands on \(answer)")
            XCTAssertTrue(swift.contains("case \(answer)"), "the iPhone no longer lands on \(answer)")
        }
    }

    // MARK: - the words

    /// The eight strings the Areas map face needs, in every language the app registers.
    func testTheAreasMapWordsExistEverywhere() throws {
        let wanted = ["hood.list_head", "hood.switch_label", "hood.switch_map", "hood.switch_list",
                      "hood.say_map", "hood.say_list", "hood.back_map", "hood.here_is"]
        for lang in Self.languages {
            let table = try strings(lang)
            for key in wanted {
                XCTAssertNotNil(table[key], "strings/\(lang).json has no \(key)")
                XCTAssertFalse((table[key] ?? "").isEmpty, "strings/\(lang).json leaves \(key) empty")
            }
            // "You are in Eastern Market" needs somewhere to put the name, in every language.
            XCTAssertTrue((table["hood.here_is"] ?? "").contains("{name}"), "\(lang) hood.here_is lost {name}")
            // Two words on one small control: a switch whose label wraps is not a switch.
            XCTAssertLessThanOrEqual((table["hood.switch_list"] ?? "").count, 12, "\(lang) hood.switch_list is too long")
            XCTAssertLessThanOrEqual((table["hood.switch_map"] ?? "").count, 12, "\(lang) hood.switch_map is too long")
        }
    }

    /// The screen really asks for them. A string nobody reads is a string that quietly rots.
    func testTheAreasScreenAsksForThoseWords() throws {
        let screen = try text("apps/ios/HelpApp/HoodsScreen.swift") + (try text("apps/ios/HelpApp/CityPage.swift"))
        // Not `hood.back_map`: on iPhone the area page's Back is the system's own (Kyle, 2026-09-23 — the strip's
        // second Back under it was one too many). The web and Android, which have no system bar, still ask for it.
        for key in ["hood.switch_label", "hood.switch_map", "hood.switch_list", "hood.say_map", "hood.say_list",
                    "hood.here_is", "hood.list_head"] {
            XCTAssertTrue(screen.contains("\"\(key)\""), "the Areas tab never asks for \(key)")
        }
    }
}
