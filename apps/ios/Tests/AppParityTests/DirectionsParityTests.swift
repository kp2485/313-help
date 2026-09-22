// The navigation work of 2026-09-22, held to the web app's own files.
//
// Three things must not drift: the words the Directions screen says (`dir.*`), the order a city page draws its
// panels in (`CITY_PANELS`), and the rules of the `place:areas` layer. Like `ParityTests`, this reads the web's
// files and the app's as text, so it runs with `swift test` and needs no Xcode and no simulator.
import Foundation
import XCTest

final class DirectionsParityTests: XCTestCase {

    /// This file is `apps/ios/Tests/AppParityTests/DirectionsParityTests.swift`: the root is five levels up.
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
    /// Every `L.t("…")` literal in one of the app's own files.
    private func keysAsked(in paths: [String]) throws -> Set<String> {
        var out: Set<String> = []
        let pattern = try NSRegularExpression(pattern: #"L\.t\("([a-z0-9_.]+)""#)
        for p in paths {
            let s = try text(p)
            let ns = s as NSString
            for m in pattern.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                let key = ns.substring(with: m.range(at: 1))
                // `L.t("hood.kind." + $0)` is a key built at run time, not a key: the fixed half of it ends in
                // a dot or an underscore, and the whole set of them is covered by the tests that name the list.
                if key.hasSuffix(".") || key.hasSuffix("_") { continue }
                out.insert(key)
            }
        }
        return out
    }

    private let screens = [
        "apps/ios/HelpApp/Directions.swift",
        "apps/ios/HelpApp/DirectionsEntry.swift",
        "apps/ios/HelpApp/CrossStreet.swift",
        "apps/ios/HelpApp/CityPage.swift",
        "apps/ios/HelpApp/HoodsScreen.swift",
        "apps/ios/HelpApp/MapScreen.swift",
    ]

    // MARK: - the words

    /// A screen never shows a raw key. Every key these screens ask for is in `strings/en.json`, and every one of
    /// them is in the other three files too, with the same placeholders.
    func testEveryKeyTheseScreensAskForHasWordsInAllFourLanguages() throws {
        let asked = try keysAsked(in: screens)
        XCTAssertGreaterThan(asked.count, 60, "the screens ask for nothing: the regex or the paths are wrong")
        let tables = try Dictionary(uniqueKeysWithValues: Self.languages.map { ($0, try strings($0)) })
        let placeholders = try NSRegularExpression(pattern: #"\{(\w+)\}"#)
        func slots(_ s: String) -> Set<String> {
            let ns = s as NSString
            return Set(placeholders.matches(in: s, range: NSRange(location: 0, length: ns.length))
                .map { ns.substring(with: $0.range(at: 1)) })
        }
        for key in asked.sorted() {
            guard let en = tables["en"]?[key] else {
                XCTFail("strings/en.json has no \(key)")
                continue
            }
            for l in Self.languages.dropFirst() {
                guard let mine = tables[l]?[key] else {
                    XCTFail("strings/\(l).json has no \(key)")
                    continue
                }
                XCTAssertEqual(slots(mine), slots(en), "\(l) \(key) has different placeholders from English")
            }
        }
    }

    /// Every `dir.*` key the web's own wording file and screen use is in all four string files: the iPhone says
    /// the same sentences as the web, or the test says which one is missing.
    func testTheDirStringsAreTheWebs() throws {
        let web = try text("apps/web/src/dirwords.ts") + text("apps/web/src/dirscreen.ts")
        let pattern = try NSRegularExpression(pattern: #"t\('(dir\.[a-z0-9_.]+)'"#)
        let ns = web as NSString
        var wanted: Set<String> = []
        for m in pattern.matches(in: web, range: NSRange(location: 0, length: ns.length)) {
            let key = ns.substring(with: m.range(at: 1))
            if key.hasSuffix(".") { continue }               // `'dir.bearing.' + s.bearing`: named in full below
            wanted.insert(key)
        }
        // The compass and turn words are built as `'dir.bearing.' + s.bearing`, so they are named here.
        wanted.formUnion(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
            .map { "dir.bearing." + $0 })
        wanted.formUnion(["straight", "slight_left", "left", "sharp_left", "slight_right", "right", "sharp_right", "around"]
            .map { "dir.turn." + $0 })
        XCTAssertGreaterThan(wanted.count, 40, "no dir.* keys found in the web's own files")
        for l in Self.languages {
            let table = try strings(l)
            for key in wanted.sorted() { XCTAssertNotNil(table[key], "strings/\(l).json has no \(key)") }
        }
    }

    /// A turn is a WORD in every language, so nothing has to mirror in Arabic.
    func testNoDirStringIsAnArrow() throws {
        let arrows = Set("←→↑↓⬅➡⬆⬇↰↱⤴⤵")
        for l in Self.languages {
            for (k, v) in try strings(l) where k.hasPrefix("dir.") {
                XCTAssertNil(v.first { arrows.contains($0) }, "\(l) \(k) carries an arrow glyph")
            }
        }
    }

    // MARK: - the city pages

    /// `cityPanels` in HelpCore is `CITY_PANELS` in apps/web/src/hoods.ts, in the same order.
    func testTheCityPanelOrderMatchesTheWeb() throws {
        let web = try text("apps/web/src/hoods.ts")
        guard let line = web.split(separator: "\n").first(where: { $0.contains("export const CITY_PANELS") }) else {
            return XCTFail("apps/web/src/hoods.ts no longer declares CITY_PANELS")
        }
        let webOrder = quoted(String(line))
        let swift = try text("apps/ios/Sources/HelpCore/CityAreas.swift")
        guard let mine = swift.split(separator: "\n").first(where: { $0.contains("public let cityPanels =") }) else {
            return XCTFail("HelpCore/CityAreas.swift no longer declares cityPanels")
        }
        XCTAssertEqual(quoted(String(mine)), webOrder,
                       "the iPhone draws a city page's panels in a different order from apps/web/src/hoods.ts")
        XCTAssertEqual(webOrder, ["help", "parks", "crashes", "roads", "vacancy", "permits"])
    }

    /// The city page's own sentences are on all four files: the ones the web prints and no others.
    func testTheCityPageSentencesExist() throws {
        let wanted = ["city.kind", "city.area_sub", "city.list_head", "city.list_note", "city.no_neighborhoods",
                      "city.regional", "city.detroit_children", "city.see_neighborhoods", "city.nearest_head",
                      "city.nearest_note", "city.missing", "city.records_from", "city.permits_partial"]
        for l in Self.languages {
            let table = try strings(l)
            for key in wanted { XCTAssertNotNil(table[key], "strings/\(l).json has no \(key)") }
        }
    }

    // MARK: - the areas layer

    /// The layer's id, and the fact that it is OFF by default on the Map tab — the Areas tab is where the job is
    /// "tell me about this part of the city" (audit §3.1). The web's `DEFAULT_LAYERS` says the same.
    func testTheAreasLayerIsOffByDefaultAndNamedTheSame() throws {
        let swift = try text("apps/ios/Sources/HelpCore/CityAreas.swift")
        XCTAssertTrue(swift.contains(#"public let areasLayerId = "place:areas""#))
        let layers = try text("apps/ios/Sources/HelpCore/MapLayers.swift")
        let defaults = layers.components(separatedBy: "public let defaultMapLayers = [")
        XCTAssertEqual(defaults.count, 2)
        let list = defaults[1].components(separatedBy: "]")[0]
        XCTAssertFalse(list.contains("place:areas"), "the outlines must not be on when the Map tab first opens")
        let web = try text("apps/web/src/layers.ts")
        let webList = web.components(separatedBy: "export const DEFAULT_LAYERS = [")[1].components(separatedBy: "]")[0]
        XCTAssertEqual(quoted(list), quoted(webList), "the first-open layers differ from apps/web/src/layers.ts")
        // And the layer has a name in every language, so the switcher never shows a raw id.
        for l in Self.languages {
            XCTAssertNotNil(try strings(l)["layer.place.areas"], "strings/\(l).json has no layer.place.areas")
        }
    }

    /// The zoom at which a neighbourhood outline appears is the web's `AREA_DETAIL_MPP`.
    func testTheAreaDetailZoomMatchesTheWeb() throws {
        let web = try text("apps/web/src/map.ts")
        XCTAssertTrue(web.contains("export const AREA_DETAIL_MPP = 14;"),
                      "apps/web/src/map.ts changed AREA_DETAIL_MPP; HelpCore must follow")
        let swift = try text("apps/ios/Sources/HelpCore/CityAreas.swift")
        XCTAssertTrue(swift.contains("public let areaDetailMetersPerPoint = 14.0"))
    }

    /// The layer is never handed a listing, so the sensitive rules are satisfied trivially: `areaOutlines` reads
    /// only the outlines, and nothing in the file mentions a row, a dot or a category.
    func testTheAreasLayerIsNeverHandedAListing() throws {
        let swift = try text("apps/ios/Sources/HelpCore/CityAreas.swift")
        for word in ["BundleRow", "mapDrawable", "DrawnDot", "category"] {
            XCTAssertFalse(swift.contains(word), "the areas layer must never touch \(word)")
        }
    }

    /// The follow-along threshold, on all three clients.
    func testTheOffRouteThresholdIsTheWebs() throws {
        XCTAssertTrue(try text("apps/web/src/dirwords.ts").contains("export const OFF_ROUTE_M = 120;"))
        XCTAssertTrue(try text("apps/ios/Sources/HelpCore/DirWords.swift").contains("public let offRouteMetres = 120.0"))
    }

    private func quoted(_ line: String) -> [String] {
        var out: [String] = [], current = "", inside = false
        for ch in line {
            if ch == "'" || ch == "\"" {
                if inside { out.append(current); current = ""; inside = false } else { inside = true }
            } else if inside {
                current.append(ch)
            }
        }
        return out
    }
}
