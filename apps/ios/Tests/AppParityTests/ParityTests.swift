// The iPhone app's need screens, held to the web app's list.
//
// `apps/web/src/needs.ts` is the source of truth for "What do you need?" (docs/05). The iPhone app restates it in
// Swift in `HelpApp/Help.swift`, and the two drifted apart twice in one day: first the emergency-room and
// urgent-care choices, then the Health Department one. This test reads both files as text and fails when they
// differ, so drift is caught by `swift test` rather than by a person reading two lists side by side.
//
// It also checks that every string key the app asks for exists in `strings/en.json`. Keys were retired on
// 2026-09-20 (`tab.rec`, `tab.transit`), and a missing key shows a person the raw key, which is never acceptable
// on a screen about a shelter bed.
//
// Nothing here touches the network, the bundle, or anything about a person: it reads files in this repository.
// It needs no simulator and no Xcode, which is why it lives in the SwiftPM test target and runs with `swift test`.
import XCTest

final class ParityTests: XCTestCase {

    /// This file is `apps/ios/Tests/AppParityTests/ParityTests.swift`, so the repository root is five levels up.
    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    /// Refinements in the web app that lead only to link-outs, with no list of places. The iPhone app has no
    /// link-out screens yet (apps/ios/README.md, "What the iPhone app does and does not do yet"), so it leaves
    /// these out. The set is written down here so that a *new* one fails this test until someone decides.
    private let linkOnly: Set<String> = ["food.paying", "job.lost"]

    // MARK: - the comparison

    func testNeedsMatchTheWebApp() throws {
        let web = try webNeeds(), ios = try swiftNeeds()
        XCTAssertFalse(web.isEmpty, "could not read apps/web/src/needs.ts")
        XCTAssertEqual(ios.map(\.id), web.map(\.id), "the two apps list different needs, or in a different order")
        for (a, b) in zip(ios, web) {
            XCTAssertEqual(a.line, b.line, "the iPhone's \"\(a.id)\" need differs from apps/web/src/needs.ts")
            XCTAssertEqual(a.refine.map(\.id), b.refine.map(\.id), "the choices under \"\(a.id)\" differ")
            for (ra, rb) in zip(a.refine, b.refine) {
                XCTAssertEqual(ra.line, rb.line, "\(a.id) › \(ra.id) differs from apps/web/src/needs.ts")
            }
        }
    }

    /// Every need and refinement has words in both languages. A screen never shows a raw key.
    func testEveryNeedHasItsWords() throws {
        let en = try strings("strings/en.json"), es = try strings("strings/es.json")
        var wanted: [String] = []
        for n in try swiftNeeds() {
            wanted.append("need.\(n.id)")
            if n.group != "now" { wanted.append("tile.\(n.id)") }       // the "now" needs are rows, not tiles
            if let intro = n.intro { wanted.append(intro) }
            if let empty = n.emptyKey { wanted.append(empty) }
            for r in n.refine { wanted.append("refine.\(n.id).\(r.id)") }
        }
        wanted += ["food", "shelter", "doctor", "drugs", "job", "narcan"].map { "quick.\($0)" }
        for key in wanted {
            XCTAssertNotNil(en[key], "strings/en.json has no \(key)")
            XCTAssertNotNil(es[key], "strings/es.json has no \(key)")
        }
    }

    /// Every key the app asks `L.t` for — literal, or built from a number or a known list — exists in English.
    func testEveryStringKeyTheAppAsksForExists() throws {
        let en = try strings("strings/en.json")
        var missing: [String] = []
        for file in try swiftSources() {
            for key in literalKeys(in: try text("apps/ios/HelpApp/\(file)")) where en[key] == nil {
                missing.append("\(file): \(key)")
            }
        }
        // The keys the app builds rather than writes out: a number, a fixed list, or a list read from the source.
        var built = (1...6).map { "od.s\($0)" } + (1...3).map { "about.p\($0)" } + (1...5).map { "privacy.phone_\($0)" }
        built += ["title", "body", "label"].map { "link.beds.safebeds.\($0)" }
        built += ["open", "under_construction", "funded", "planned"].map { "gw.\($0)" }
        let reports = try text("apps/ios/HelpApp/Reports.swift")
        for name in ["listing", "place"] {
            let kinds = quoted(bracketed(reports, after: "static let \(name) = "))
            XCTAssertFalse(kinds.isEmpty, "could not read ReportKinds.\(name) from Reports.swift")
            built += kinds.map { "report.kind.\($0)" }
        }
        for key in built where en[key] == nil { missing.append("built: \(key)") }
        XCTAssertEqual(missing, [], "string keys the app asks for that strings/en.json does not have")
    }

    /// Keys retired on 2026-09-20, when the web app folded Recreation and Transit into one Map tab.
    func testRetiredKeysAreNotAskedForAgain() throws {
        for file in try swiftSources() {
            let body = try text("apps/ios/HelpApp/\(file)")
            for key in ["tab.rec", "tab.transit"] {
                XCTAssertFalse(body.contains("\"\(key)\""), "\(file) asks for the retired key \(key)")
            }
        }
    }

    // MARK: - what one need looks like, once both files are read

    private struct Refined { var id: String; var line: String }
    private struct Parsed {
        var id: String, group: String, intro: String?, emptyKey: String?
        var refine: [Refined]
        var line: String
    }

    /// Both readers below produce the same shape, so the test can compare two strings and print the difference.
    private func parsed(id: String, group: String, head: String, refineBody: String?, splitOn: String) -> Parsed {
        var refines: [Refined] = []
        for entry in (refineBody ?? "").components(separatedBy: splitOn).dropFirst() {
            let rid = quoted(entry).first ?? "?"
            if linkOnly.contains("\(id).\(rid)") { continue }
            refines.append(Refined(id: rid, line: "\(rid) \(queryLine(entry)) first=\(list(entry, "first"))"))
        }
        // A need with choices carries no query of its own; without them, its query is on the need.
        let query = refineBody == nil ? queryLine(head) : "cat=- mode=- prefer=-"
        let line = """
            \(id) group=\(group) first=\(list(head, "first")) steps=\(head.contains("stepsOnly: true")) \
            sensitive=\(head.contains("sensitive: true")) intro=\(value(head, "intro") ?? "-") \
            empty=\(value(head, "emptyKey") ?? "-") \(query)
            """
        return Parsed(id: id, group: group, intro: value(head, "intro"), emptyKey: value(head, "emptyKey"),
                      refine: refines, line: line)
    }

    // MARK: - reading the two files

    private func webNeeds() throws -> [Parsed] {
        let src = try text("apps/web/src/needs.ts")
        guard let start = src.range(of: "export const NEEDS"), let end = src.range(of: "export const CATEGORIES")
        else { return [] }
        return String(src[start.lowerBound..<end.lowerBound]).components(separatedBy: "\n  { id: ").dropFirst().map { part in
            let (head, body) = split(part, at: "refine: [")
            return parsed(id: quoted(head).first ?? "?", group: value(head, "group") ?? "?",
                          head: head, refineBody: body, splitOn: "{ id: ")
        }
    }

    private func swiftNeeds() throws -> [Parsed] {
        let src = try text("apps/ios/HelpApp/Help.swift")
        guard let start = src.range(of: "let needs: [Need] = ["), let end = src.range(of: "\n]\n\nfunc telURL")
        else { return [] }
        return String(src[start.upperBound..<end.lowerBound]).components(separatedBy: "Need(id: ").dropFirst().map { part in
            let (head, body) = split(part, at: "refine: [")
            // `now: true` is the "Right now" group; `later: true` is "Work, school, and paperwork".
            let group = head.contains("now: true") ? "now" : (head.contains("later: true") ? "later" : "soon")
            return parsed(id: quoted(head).first ?? "?", group: group,
                          head: head, refineBody: body, splitOn: ".init(id: ")
        }
    }

    // MARK: - small readers, deliberately dull

    /// Everything before `refine: [` and everything after it. Both files put a need's own settings before its
    /// choices, so that the settings are never read out of a choice by mistake.
    private func split(_ s: String, at marker: String) -> (head: String, body: String?) {
        guard let r = s.range(of: marker) else { return (s, nil) }
        return (String(s[..<r.lowerBound]), String(s[r.upperBound...]))
    }

    /// A query written either way: `query: { category: 'x', mode: 'week', prefer: ['youth'] }` or
    /// `query: Query(category: "x", mode: "week", prefer: ["youth"])`. `mode` defaults to "now" in both apps.
    private func queryLine(_ s: String) -> String {
        guard let r = s.range(of: "query: ") else { return "cat=- mode=- prefer=-" }
        let rest = String(s[r.upperBound...])
        let stop = [rest.firstIndex(of: "}"), rest.firstIndex(of: ")")].compactMap { $0 }.min() ?? rest.endIndex
        let chunk = String(rest[..<stop])
        return "cat=\(value(chunk, "category") ?? "-") mode=\(value(chunk, "mode") ?? "now") prefer=\(list(chunk, "prefer"))"
    }

    /// `name: 'x'` or `name: "x"`, and nothing else.
    private func value(_ s: String, _ name: String) -> String? {
        guard let r = s.range(of: "\(name): ") else { return nil }
        let rest = s[r.upperBound...]
        guard let q = rest.first, q == "'" || q == "\"" else { return nil }
        let body = rest.dropFirst()
        guard let end = body.firstIndex(of: q) else { return nil }
        return String(body[..<end])
    }

    /// `name: ['a', 'b']` or `name: ["a", "b"]`, as `a|b`. Absent reads as `-`.
    private func list(_ s: String, _ name: String) -> String {
        let items = quoted(bracketed(s, after: "\(name): "))
        return items.isEmpty ? "-" : items.joined(separator: "|")
    }

    /// What is inside the first `[ … ]` after `marker`, or "" when there is none.
    private func bracketed(_ s: String, after marker: String) -> String {
        guard let r = s.range(of: marker + "[") else { return "" }
        let rest = s[r.upperBound...]
        guard let end = rest.firstIndex(of: "]") else { return "" }
        return String(rest[..<end])
    }

    /// Every single- or double-quoted run in a string, in order.
    private func quoted(_ s: String) -> [String] {
        var out: [String] = [], current: String? = nil, quote: Character = "'"
        for ch in s {
            if let c = current {
                if ch == quote { out.append(c); current = nil } else { current = c + String(ch) }
            } else if ch == "'" || ch == "\"" {
                quote = ch
                current = ""
            }
        }
        return out
    }

    private func text(_ path: String) throws -> String {
        try String(contentsOf: Self.root.appendingPathComponent(path), encoding: .utf8)
    }

    private func strings(_ path: String) throws -> [String: String] {
        try JSONDecoder().decode([String: String].self, from: Data(contentsOf: Self.root.appendingPathComponent(path)))
    }

    private func swiftSources() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: Self.root.appendingPathComponent("apps/ios/HelpApp").path)
            .filter { $0.hasSuffix(".swift") }.sorted()
    }

    /// `L.t("some.key"` where the key is whole: not interpolated (`L.t("od.s\(i)")`) and not a prefix that the
    /// app finishes at run time (`L.t("need." + n.id)`). Those are covered by the built list and by
    /// `testEveryNeedHasItsWords`, which knows what the endings can be.
    private func literalKeys(in body: String) -> [String] {
        var out: [String] = [], rest = Substring(body)
        while let r = rest.range(of: "L.t(\"") {
            rest = rest[r.upperBound...]
            guard let end = rest.firstIndex(of: "\"") else { break }
            let key = String(rest[..<end])
            let after = rest[rest.index(after: end)...].drop(while: { $0 == " " })
            if !key.contains("\\("), !after.hasPrefix("+") { out.append(key) }
        }
        return out
    }
}
