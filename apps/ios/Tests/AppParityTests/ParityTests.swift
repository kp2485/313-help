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

    /// The urgent sheet's numbers, in docs/05's order: `urgentIds` in Help.swift is exactly `URGENT_IDS` in
    /// apps/web/src/needs.ts (2026-09-24: one shelter and one crisis line per county).
    func testTheUrgentSheetMatchesTheWebApp() throws {
        let web = quoted(bracketed(try text("apps/web/src/needs.ts"), after: "export const URGENT_IDS = "))
        let ios = quoted(bracketed(try text("apps/ios/HelpApp/Help.swift"), after: "let urgentIds = "))
        XCTAssertFalse(web.isEmpty, "could not read URGENT_IDS in apps/web/src/needs.ts")
        XCTAssertEqual(Array(web.prefix(2)), ["emg_911", "emg_988"], "911 and 988 come first (docs/05)")
        XCTAssertEqual(ios, web, "the iPhone's urgent sheet differs from apps/web/src/needs.ts")
    }

    /// A number that belongs to one place (emergency.csv `area`: a city's own police) is on that city's page and
    /// never on the urgent sheet or any need screen. Every `emg_` id Help.swift names is checked against the file.
    func testAPlacesOwnNumberIsNeverInAGeneralList() throws {
        let rows = try text("data/seed/emergency.csv").split(separator: "\n").map { csvFields(String($0)) }
        let head = try XCTUnwrap(rows.first)
        let at = try XCTUnwrap(head.firstIndex(of: "area"), "emergency.csv has no area column")
        let scoped = Set(rows.dropFirst().filter { $0.count > at && !$0[at].isEmpty }.map { $0[0] })
        XCTAssertGreaterThanOrEqual(scoped.count, 60, "the committed file carries the cities' own police lines")
        let help = try text("apps/ios/HelpApp/Help.swift")
        let named = quoted(help).filter { $0.hasPrefix("emg_") }
        XCTAssertFalse(named.isEmpty)
        for id in named { XCTAssertFalse(scoped.contains(id), "\(id) belongs to one place and is in a general list") }
    }

    /// One CSV line into its fields, honouring quotes (the labels carry commas).
    private func csvFields(_ line: String) -> [String] {
        var out: [String] = [], cur = "", inQuotes = false
        let chars = Array(line.trimmingCharacters(in: .newlines))
        var i = 0
        while i < chars.count {
            let ch = chars[i]
            if inQuotes {
                if ch == "\"" && i + 1 < chars.count && chars[i + 1] == "\"" { cur.append("\""); i += 1 }
                else if ch == "\"" { inQuotes = false } else { cur.append(ch) }
            } else if ch == "\"" { inQuotes = true } else if ch == "," { out.append(cur); cur = "" } else { cur.append(ch) }
            i += 1
        }
        out.append(cur)
        return out
    }

    /// The languages the app registers (L.languages in Help.swift). English is the fallback.
    private static let languages = ["en", "es", "ar", "bn"]

    /// Every need and refinement has words in every language. A screen never shows a raw key.
    func testEveryNeedHasItsWords() throws {
        let en = try strings("strings/en.json")
        var wanted: [String] = []
        for n in try swiftNeeds() {
            wanted.append("need.\(n.id)")
            if n.group != "now" { wanted.append("tile.\(n.id)") }       // the "now" needs are rows, not tiles
            if let intro = n.intro { wanted.append(intro) }
            if let empty = n.emptyKey { wanted.append(empty) }
            for r in n.refine { wanted.append("refine.\(n.id).\(r.id)") }
            // The heading over a need's second list ("Places to go during the day" under the crisis numbers).
            if let also = alsoId(in: n.line) { wanted.append("also.\(n.id).\(also)") }
        }
        wanted += ["food", "shelter", "doctor", "drugs", "job", "narcan"].map { "quick.\($0)" }
        for key in wanted { XCTAssertNotNil(en[key], "strings/en.json has no \(key)") }
        for lang in Self.languages.dropFirst() {
            let other = try strings("strings/\(lang).json")
            for key in wanted { XCTAssertNotNil(other[key], "strings/\(lang).json has no \(key)") }
        }
    }

    /// Every language the app registers has a file with exactly the English keys, the same placeholders and the
    /// same emergency numbers. Arabic and Bengali carry Western digits only, so a number reads as it is dialled
    /// (DECISIONS 2026-09-20). Help.swift must register the same four.
    func testEveryLanguageIsCompleteAndReadable() throws {
        let help = try text("apps/ios/HelpApp/Help.swift")
        XCTAssertTrue(help.contains("static let languages = [\"en\", \"es\", \"ar\", \"bn\"]"), "L.languages differs")
        XCTAssertTrue(help.contains("ar@numbers=latn"), "Arabic must keep Western digits")
        let en = try strings("strings/en.json")
        let holes = { (s: String) -> String in
            s.ranges(of: try! Regex("\\{\\w+\\}")).map { String(s[$0]) }.sorted().joined(separator: ",")
        }
        let nativeDigits = try Regex("[\\u{0660}-\\u{0669}\\u{06F0}-\\u{06F9}\\u{09E6}-\\u{09EF}]")
        for lang in Self.languages.dropFirst() {
            let other = try strings("strings/\(lang).json")
            XCTAssertEqual(en.keys.sorted(), other.keys.sorted(), "strings/\(lang).json has different keys")
            for (key, value) in en {
                guard let mine = other[key] else { continue }
                XCTAssertEqual(holes(value), holes(mine), "\(lang) \(key) has different placeholders")
                for n in ["911", "988", "211"] where value.contains(n) {
                    XCTAssertTrue(mine.contains(n), "\(lang) \(key) lost \(n)")
                }
            }
            guard lang == "ar" || lang == "bn" else { continue }
            for (key, value) in other {
                XCTAssertNil(try? nativeDigits.firstMatch(in: value), "\(lang) \(key) uses non-Western digits")
            }
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
        var built = (1...6).map { "od.s\($0)" } + ["about.p1", "about.independent", "about.p2", "about.p3"] + (1...5).map { "privacy.phone_\($0)" }
        built += ["title", "body", "label"].map { "link.beds.safebeds.\($0)" }
        built += ["open", "under_construction", "funded", "planned"].map { "gw.\($0)" }
        // ReportKinds moved into the HelpCore library on 2026-09-20, so that `swift test` covers it.
        let reports = try text("apps/ios/Sources/HelpCore/Reports.swift")
        for name in ["listing", "place"] {
            let kinds = quoted(bracketed(reports, after: "static let \(name) = "))
            XCTAssertFalse(kinds.isEmpty, "could not read ReportKinds.\(name) from Reports.swift")
            built += kinds.map { "report.kind.\($0)" }
        }
        // The Neighborhoods tab finishes three prefixes from lists in HelpCore/Hoods.swift: the kinds of help
        // counted for a neighborhood, the four "nearest listed" rows, and the kinds we may have nothing listed
        // for. `shelter` is spelled `shelter.emergency` in the category words, as it is on the web.
        let hoods = try text("apps/ios/Sources/HelpCore/Hoods.swift")
        let helpKinds = quoted(bracketed(hoods, after: "public let hoodHelpKinds = "))
        XCTAssertFalse(helpKinds.isEmpty, "could not read hoodHelpKinds from Hoods.swift")
        built += helpKinds.map { "add.cat.\($0 == "shelter" ? "shelter.emergency" : $0)" }
        let nearest = quoted(bracketed(hoods, after: "public let hoodNearestKinds = "))
        XCTAssertFalse(nearest.isEmpty, "could not read hoodNearestKinds from Hoods.swift")
        built += nearest.map { "hood.nearest.\($0)" }
        built += ["food", "health", "harm"].map { "hood.kind.\($0)" }
        // "Add a place that helps": the kinds of help offered, the ways of knowing, and every field's own label,
        // error and hint (the hints are passed to the field as a key, so they are built rather than written out).
        let proposals = try text("apps/ios/Sources/HelpCore/Proposals.swift")
        let categories = quoted(bracketed(proposals, after: "public let proposalCategories = "))
        XCTAssertFalse(categories.isEmpty, "could not read proposalCategories from Proposals.swift")
        built += categories.map { "add.cat.\($0)" }
        let how = quoted(bracketed(proposals, after: "public let proposalHowKnown = "))
        XCTAssertFalse(how.isEmpty, "could not read proposalHowKnown from Proposals.swift")
        built += how.map { "add.how.\($0)" }
        built += ["name", "category", "what", "address", "schedule_text", "phone", "how_known", "notes"].map { "add.f.\($0)" }
        built += quoted(bracketed(proposals, after: "public let proposalRequired = ")).map { "add.e.\($0)" }
        built += ["add.h.what", "add.h.address", "add.h.schedule", "add.h.phone", "add.h.notes"]
        for key in built where en[key] == nil { missing.append("built: \(key)") }
        XCTAssertEqual(missing, [], "string keys the app asks for that strings/en.json does not have")
    }

    /// "Leave this page fast" is on four needs in both apps, and HelpCore keeps the same four in one list for the
    /// screens and the tests to share. All three have to agree (iPhone review, 2026-09-20).
    func testTheQuickExitNeedsAgreeEverywhere() throws {
        let flagged = try swiftNeeds().filter { $0.line.contains("quickExit=true") }.map(\.id).sorted()
        XCTAssertEqual(flagged, ["assault", "drugs", "talk", "unsafe"], "Help.swift marks different needs quickExit")
        let core = try text("apps/ios/Sources/HelpCore/Listing.swift")
        let listed = quoted(bracketed(core, after: "let quickExitNeeds = ")).sorted()
        XCTAssertEqual(listed, flagged, "HelpCore.quickExitNeeds and Help.swift disagree")
        // And the page the exit leaves for is the one the web app leaves for.
        let web = try text("apps/web/src/main.ts")
        XCTAssertTrue(web.contains("location.replace('https://www.weather.gov/')"), "the web app's quick-exit target moved")
        XCTAssertTrue(core.contains("\"https://www.weather.gov/\""), "HelpCore's quick-exit target differs from the web app's")
    }

    /// The two decisions of the category audit of 2026-09-22, on this phone as on the web.
    ///
    /// K1: "I want free Narcan" asks for the whole `harm` kind, so Wayne County's Well Wayne stations
    /// (`harm.supplies`, every one of which gives out naloxone) are on it beside the Health Department's boxes.
    /// K3: "I need to talk to someone" keeps 988 and the crisis places first, and lists the daytime places
    /// (`health.support`) under their own heading below them.
    func testTheCategoryAuditOf20260922IsOnThisPhoneToo() throws {
        let needs = try swiftNeeds()
        let narcan = try XCTUnwrap(needs.first { $0.id == "narcan" })
        XCTAssertTrue(narcan.line.contains("cat=harm "), "the Narcan need must ask for the whole harm kind: \(narcan.line)")
        XCTAssertEqual(narcan.intro, "narcan.intro")
        let talk = try XCTUnwrap(needs.first { $0.id == "talk" })
        XCTAssertTrue(talk.line.contains("cat=health.mental"), "the talk screen's own list is still the crisis one")
        XCTAssertTrue(talk.line.contains("first=emg_988|emg_dwihn_crisis"), "988 still comes first")
        XCTAssertTrue(talk.line.contains("sensitive=true quickExit=true"))
        XCTAssertEqual(alsoId(in: talk.line), "support")
        XCTAssertTrue(talk.line.contains("also=support:cat=health.support"), talk.line)
        let doctor = try XCTUnwrap(needs.first { $0.id == "doctor" })
        XCTAssertTrue(doctor.refine.contains { $0.line.contains("support cat=health.support") }, "the doctor need lists it too")
        // The second list is drawn after the first, never mixed into it, and its rows are ordinary rows.
        let views = try text("apps/ios/HelpApp/Views.swift")
        XCTAssertTrue(views.contains("if let also, !alsoRanked.isEmpty {"), "ResultsView does not draw a second list")
        XCTAssertTrue(views.contains("CardLink(r: r, showMiles: true) { DetailView(row: r.row) }"),
                      "the second list's rows must keep their distance, like any ordinary row")
        // And the sensitive pair did not change while a new health kind was added (HelpCore owns the rule).
        XCTAssertTrue(try text("apps/ios/Sources/HelpCore/Saved.swift")
            .contains("public let sensitiveCategories = [\"shelter.dv\", \"health.mental\"]"))
    }

    // MARK: - the Neighborhoods tab (docs/13)

    /**
     A neighborhood page says the same things in the same order on the iPhone as on the web.

     `hoodPage` in apps/web/src/hoods.ts is the source of truth for the panels: help, then building and staying,
     then conditions, then safe streets, then the sources. The order is not decoration — the money panel draws
     home prices and building permits together on purpose, and the crash panel carries SEMCOG's notice — so a
     panel that moved or went missing on one client and not the other is a bug worth a failing test.
     */
    func testTheNeighborhoodPagePanelsMatchTheWebApp() throws {
        let web = try text("apps/web/src/hoods.ts")
        guard let start = web.range(of: "export function hoodPage(") else { return XCTFail("hoodPage moved") }
        // `hoodPage`'s OWN body, and nothing after it. Since 2026-09-22 the same file also holds `cityPage`,
        // which reuses several of these headings for Hamtramck, Highland Park, Dearborn and Detroit — and the
        // iPhone has no city page yet (docs/13, "The four cities"). Reading to the end of the file would mix the
        // two pages' panels together and compare the sum against one screen. The next top-level `export` is
        // where this function ends, which is structure rather than a guess at a comment.
        let afterStart = String(web[start.upperBound...])
        guard let end = afterStart.range(of: "\nexport ") else { return XCTFail("hoodPage is no longer followed by another export; the bound this test uses is gone") }
        var webBody = String(afterStart[..<end.lowerBound])
        // The Conditions and Safe-streets panels are functions of their own, called from inside `hoodPage`
        // (Conditions since 2026-09-22, when it grew its four chart groups): each body is spliced in where it
        // is called, so its own headings are counted in place.
        func body(of name: String, upTo bound: String) -> String {
            guard let s = web.range(of: "export function \(name)(") else { return "" }
            let rest = String(web[s.upperBound...])
            return String(rest[..<(rest.range(of: bound)?.lowerBound ?? rest.endIndex)])
        }
        webBody = webBody.replacingOccurrences(of: "${conditionsPanel(h, d, ui, view, off)}", with: body(of: "conditionsPanel", upTo: "\nfunction crashYears"))
        webBody = webBody.replacingOccurrences(of: "${crashPanel(h, d, ui, view, off)}", with: body(of: "crashPanel", upTo: "\nexport "))
        let webPanels = headKeys(in: webBody)
        XCTAssertEqual(webPanels, ["hood.help_head", "hood.nearest_head", "hood.places_head", "hood.city_near_head",
                                   "hood.money_head", "hood.cond_head", "hood.cond_blight_head", "hood.cond_issues_head",
                                   "hood.cond_days_head", "hood.cond_fires_head", "hood.crash_head", "hood.sources_head"],
                       "the web page's headings changed; the iPhone's have to change with them")

        let ios = try text("apps/ios/HelpApp/HoodsScreen.swift")
        guard let panelStart = ios.range(of: "// MARK: - the panels, in the web page's order"),
              let panelEnd = ios.range(of: "// MARK: - the pieces a panel is built from")
        else { return XCTFail("the panel section of HoodsScreen.swift moved") }
        XCTAssertEqual(headKeys(in: String(ios[panelStart.upperBound..<panelEnd.lowerBound])), webPanels,
                       "the iPhone's panels are in a different order from the web page's")

        // And the one sentence that is not ours to translate is byte for byte the web's.
        let notice = "Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."
        XCTAssertTrue(web.contains("export const SEMCOG_NOTICE = '\(notice)'"), "the web's SEMCOG notice changed")
        XCTAssertTrue(try text("apps/ios/Sources/HelpCore/Hoods.swift").contains("\"\(notice)\""),
                      "the iPhone's SEMCOG notice differs from the web's, or is no longer written out in full")
    }

    /**
     No number a person reads is laid out by the platform.

     `NumberFormatter`, `formatted()` and `String(format:)` do not agree across the two systems this repository
     builds on: swift-corelibs-foundation ignored the fraction-digit settings that Darwin honours, so a rate came
     out "9.4" on a Mac and "9.44" on the Linux runner (PR #10, 2026-09-21). The rules in HelpCore must give the
     same answer everywhere, so they do their own arithmetic — and this is the guard that keeps a convenient
     one-liner from creeping back in.
     */
    func testHelpCoreNeverLetsThePlatformFormatANumber() throws {
        for file in try FileManager.default.contentsOfDirectory(atPath: Self.root.appendingPathComponent("apps/ios/Sources/HelpCore").path)
        where file.hasSuffix(".swift") {
            let code = withoutComments(try text("apps/ios/Sources/HelpCore/\(file)"))
            for needle in ["NumberFormatter", ".formatted("] {
                XCTAssertFalse(code.contains(needle),
                               "\(file) formats a number with \(needle), which rounds differently on Linux")
            }
            // `String(format:)` is allowed for whole numbers — a hex byte, a two-digit hour — and never for a
            // fractional one, which is where the two platforms part company.
            for line in code.split(separator: "\n") where line.contains("String(format:") {
                for spec in ["%f", "%g", "%e", "%.'"] where line.contains(spec) {
                    XCTFail("\(file) formats a fractional number with \(spec): \(line)")
                }
                XCTAssertFalse(line.contains("%."), "\(file) formats a fractional number: \(line)")
            }
        }
    }

    /// A Swift file with its comments taken out, so a test that looks for a forbidden call does not trip over a
    /// comment that names it in order to explain why it is forbidden.
    private func withoutComments(_ source: String) -> String {
        var out = "", inBlock = false, i = source.startIndex
        while i < source.endIndex {
            let rest = source[i...]
            if inBlock {
                if rest.hasPrefix("*/") { inBlock = false; i = source.index(i, offsetBy: 2) } else { i = source.index(after: i) }
                continue
            }
            if rest.hasPrefix("/*") { inBlock = true; i = source.index(i, offsetBy: 2); continue }
            if rest.hasPrefix("//") {
                while i < source.endIndex, source[i] != "\n" { i = source.index(after: i) }
                continue
            }
            out.append(source[i])
            i = source.index(after: i)
        }
        return out
    }

    /**
     A proposal carries exactly the field names the Worker's closed schema accepts.

     `parseProposal` in api/src/validate.ts calls `closed(body, [...])`: a name that is not in that list is a 400,
     not something stored. The iPhone builds its own body, so the two lists have to be the same list — and the
     failure mode if they are not is a person filling in a form, tapping Send, and being told nothing happened.
     */
    func testAProposalsFieldsAreTheOnesTheWorkerAccepts() throws {
        let api = try text("api/src/validate.ts")
        guard let r = api.range(of: "export function parseProposal("),
              let call = api.range(of: "closed(body, [", range: r.upperBound..<api.endIndex),
              let end = api[call.upperBound...].firstIndex(of: "]")
        else { return XCTFail("parseProposal's closed() list moved") }
        let worker = quoted(String(api[call.upperBound..<end]))
        XCTAssertEqual(worker.sorted(), ["address", "category", "how_known", "name", "notes", "phone", "schedule_text", "what"])
        // The Swift side names them in its CodingKeys, which is what the encoder writes.
        let keys = try text("apps/ios/Sources/HelpCore/Proposals.swift")
        guard let start = keys.range(of: "public enum CodingKeys: String, CodingKey {"),
              let stop = keys[start.upperBound...].firstIndex(of: "}")
        else { return XCTFail("Proposal.CodingKeys moved") }
        let block = String(keys[start.upperBound..<stop])
        for name in worker {
            XCTAssertTrue(block.contains(name) || block.contains(camel(name)),
                          "a proposal from the iPhone has no \(name), which the Worker expects")
        }
        // And nothing about the person can be sent with it: a proposal is not deduplicated, so unlike a report it
        // carries no per-day hash, and there is nothing else it could carry either.
        for forbidden in ["client_nonce", "observed_at", "install", "lat", "lon"] {
            XCTAssertFalse(worker.contains(forbidden), "the Worker would accept \(forbidden) on a proposal")
            XCTAssertFalse(block.contains(forbidden), "the iPhone's proposal carries \(forbidden)")
        }
    }

    /// "schedule_text" as Swift spells it in a property name.
    private func camel(_ snake: String) -> String {
        let parts = snake.split(separator: "_")
        return (parts.first.map(String.init) ?? "") + parts.dropFirst().map { $0.capitalized }.joined()
    }

    /// The kinds of help counted for a neighborhood are the pipeline's `HELP_TOPS`, in its order. A JSON object's
    /// order does not survive being decoded into a Swift dictionary, so the iPhone keeps its own copy of the list
    /// — and a copy drifts unless something holds it (HelpCore/Hoods.swift says as much).
    func testTheNeighborhoodHelpKindsMatchThePipeline() throws {
        let pipeline = quoted(bracketed(try text("pipeline/src/indicators.ts"), after: "export const HELP_TOPS = "))
        XCTAssertFalse(pipeline.isEmpty, "could not read HELP_TOPS from pipeline/src/indicators.ts")
        let swift = quoted(bracketed(try text("apps/ios/Sources/HelpCore/Hoods.swift"), after: "public let hoodHelpKinds = "))
        XCTAssertEqual(swift, pipeline, "HelpCore.hoodHelpKinds and the pipeline's HELP_TOPS disagree")
    }

    /// The `hood.*_head` keys a body asks for, in the order it asks for them.
    private func headKeys(in body: String) -> [String] {
        var out: [String] = [], rest = Substring(body)
        while let r = rest.range(of: "'hood.") ?? rest.range(of: "\"hood.") {
            let quote = rest[r.lowerBound]
            rest = rest[rest.index(after: r.lowerBound)...]
            guard let end = rest.firstIndex(of: quote) else { break }
            let key = String(rest[..<end])
            if key.hasSuffix("_head") { out.append(key) }
            rest = rest[end...]
        }
        return out
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

    /**
     A day is never shown to a person as "2026-09-26". `DayWords` decides the words and is tested in HelpCore;
     what this checks is that every screen that prints a day actually goes through it.

     It is here because the bug it catches is not a wrong rule but an unused one: the status pill on a listing
     had said "Today" / "Tomorrow" / "Saturday, Sep 26" since DayWords landed, while the "Next times" list
     underneath it went on printing the raw ISO day straight off the occurrence (found 2026-09-21). The web app
     and Android both call their own `dayName` / `dayText` there; the iPhone now does too.
     */
    func testEveryDayShownToAPersonGoesThroughDayWords() throws {
        let views = try text("apps/ios/HelpApp/Views.swift")
        // The "Next times" list on a listing. `o` is one occurrence; its `date` is a calendar day, "YYYY-MM-DD".
        XCTAssertTrue(views.contains("dayName(o.date"),
                      "the \"Next times\" list must print dayName(o.date …), not the raw ISO day")
        for file in try swiftSources() {
            let body = try text("apps/ios/HelpApp/\(file)")
            // A bare `Text(x.date)` is a raw ISO day on a screen. Every day goes through `dayName` first.
            for raw in ["Text(o.date)", "Text(occurrence.date)", "Text(n.date)"] {
                XCTAssertFalse(body.contains(raw), "\(file) shows a raw ISO day: \(raw)")
            }
        }
        // And all three clients name the same helper, so a reader can follow one to the others.
        XCTAssertTrue(try text("apps/web/src/main.ts").contains("dayName(n.date)"))
        XCTAssertTrue(try text("apps/android/app/src/main/kotlin/org/help313/app/Screens.kt").contains("dayText(o.date"))
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
        // `quickExit` is the "Leave this page fast" button (docs/08). Both files spell it `quickExit: true`, and
        // it is compared here so a screen that gains or loses one in the web app cannot quietly keep or lose it on
        // the iPhone (iPhone review, 2026-09-20).
        let line = """
            \(id) group=\(group) first=\(list(head, "first")) steps=\(head.contains("stepsOnly: true")) \
            sensitive=\(head.contains("sensitive: true")) quickExit=\(head.contains("quickExit: true")) \
            intro=\(value(head, "intro") ?? "-") \
            empty=\(value(head, "emptyKey") ?? "-") \(query) cats=\(list(head, "categories")) also=\(alsoLine(head))
            """
        return Parsed(id: id, group: group, intro: value(head, "intro"), emptyKey: value(head, "emptyKey"),
                      refine: refines, line: line)
    }

    // MARK: - the navigation audit of 2026-09-22

    /// Browse by type (audit C2). The iPhone had **no** browse path at all, so the shower and young-people
    /// listings could only be reached by typing a name into Search. These are the web's `CATEGORIES`, id for id
    /// and in the web's order, and every chip has words in `strings/en.json`.
    func testBrowseChipsMatchTheWebApp() throws {
        let src = try text("apps/web/src/needs.ts")
        guard let start = src.range(of: "export const CATEGORIES"), let end = src.range(of: "export const TABS")
        else { return XCTFail("could not read CATEGORIES from apps/web/src/needs.ts") }
        let web = String(src[start.lowerBound..<end.lowerBound])
            .components(separatedBy: "{ id: '").dropFirst().compactMap { $0.split(separator: "'").first.map(String.init) }
        let ios = try text("apps/ios/HelpApp/Browse.swift")
        guard let s2 = ios.range(of: "let browseCategories"), let e2 = ios.range(of: "\n]\n", range: s2.upperBound..<ios.endIndex)
        else { return XCTFail("could not read browseCategories from apps/ios/HelpApp/Browse.swift") }
        let mine = String(ios[s2.upperBound..<e2.lowerBound])
            .components(separatedBy: "    (\"").dropFirst().compactMap { $0.split(separator: "\"").first.map(String.init) }
        XCTAssertEqual(mine, web, "the iPhone's browse chips differ from apps/web/src/needs.ts CATEGORIES")
        XCTAssertEqual(web.count, 19)
        let en = try strings("strings/en.json")
        for id in mine { XCTAssertNotNil(en["cat.\(id)"], "strings/en.json has no cat.\(id)") }
    }

    /// The six quick needs on Home, in the audit's order (§4.2) and the web's. The iPhone used to filter the
    /// needs array by a set of six ids, which rendered them in declaration order, so "A place to sleep"
    /// outranked "Food" on the one screen docs/05 says must lead with food (audit M2).
    func testHomesQuickNeedsAreInTheWebsOrder() throws {
        let main = try text("apps/web/src/main.ts")
        guard let r = main.range(of: "const quick = [") else { return XCTFail("could not read `quick` from apps/web/src/main.ts") }
        let line = String(main[r.upperBound...].prefix(while: { $0 != "]" }))
        let web = line.components(separatedBy: "'").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        let ios = try text("apps/ios/HelpApp/Browse.swift")
        guard let r2 = ios.range(of: "let quickNeedIds = [") else { return XCTFail("could not read quickNeedIds") }
        let mine = String(ios[r2.upperBound...].prefix(while: { $0 != "]" }))
            .components(separatedBy: "\"").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        XCTAssertEqual(mine, web, "Home's six quick needs differ from apps/web/src/main.ts")
        XCTAssertEqual(mine.first, "food", "docs/05: Home leads with food")
        XCTAssertEqual(mine.count, 6)
    }

    /// The Map tab opens with help on it (audit H2). One constant per client; this is the iPhone's held to the
    /// web's `DEFAULT_LAYERS`.
    func testTheMapOpensWithTheSameLayersAsTheWeb() throws {
        let web = try text("apps/web/src/layers.ts")
        guard let r = web.range(of: "DEFAULT_LAYERS") else { return XCTFail("could not read DEFAULT_LAYERS") }
        let line = String(web[r.upperBound...].prefix(while: { $0 != "]" }))
        let ids = line.components(separatedBy: "'").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        let swift = try text("apps/ios/Sources/HelpCore/MapLayers.swift")
        guard let r2 = swift.range(of: "public let defaultMapLayers = [") else { return XCTFail("could not read defaultMapLayers") }
        let mine = String(swift[r2.upperBound...].prefix(while: { $0 != "]" }))
            .components(separatedBy: "\"").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        XCTAssertEqual(mine, ids, "the iPhone's first-open map layers differ from apps/web/src/layers.ts")
        XCTAssertTrue(mine.contains { $0.hasPrefix("help:") }, "the Map tab must open with help on it (audit H2)")
    }

    /// One tab set on all three clients: Home · Help · Map · Areas, with Events hiding itself while the bundle
    /// carries none (audit §4.1).
    func testTheTabSetMatchesTheWebApp() throws {
        let web = try text("apps/web/src/needs.ts")
        guard let r = web.range(of: "export const TABS = [") else { return XCTFail("could not read TABS") }
        let line = String(web[r.upperBound...].prefix(while: { $0 != "]" }))
        let ids = line.components(separatedBy: "{ id: '").dropFirst().compactMap { $0.split(separator: "'").first.map(String.init) }
        let swift = try text("apps/ios/HelpApp/Views.swift")
        guard let r2 = swift.range(of: "enum Tab: Hashable { case ") else { return XCTFail("could not read AppNav.Tab") }
        let mine = String(swift[r2.upperBound...].prefix(while: { $0 != "}" }))
            .components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        XCTAssertEqual(mine, ids, "the iPhone's tabs differ from apps/web/src/needs.ts TABS")
    }

    /// Home has one entry to each screen (audit L1) and does not push a second copy of the Help tab (audit H7).
    /// `HomeView` is read as text, which is enough to see which of the two kinds of control it uses.
    func testHomeSelectsTheHelpTabAndKeepsSavedUnderHelp() throws {
        let src = try text("apps/ios/HelpApp/Views.swift")
        guard let r = src.range(of: "struct HomeView: View"), let e = src.range(of: "struct AgeBanner", range: r.upperBound..<src.endIndex)
        else { return XCTFail("could not read HomeView") }
        let home = String(src[r.lowerBound..<e.lowerBound])
        XCTAssertTrue(home.contains("TabRow(tab: .help"), "Home's \"Find free help\" must select the Help tab, not push a second HelpView")
        XCTAssertFalse(home.contains("{ HelpView() }"), "Home pushes a second copy of the Help tab (audit H7)")
        XCTAssertFalse(home.contains("SavedView()"), "Saved places belong under Help → More, once (audit L1)")
        for want in ["TabTile(tab: .map", "TabTile(tab: .hoods", "ParksView()"] {
            XCTAssertTrue(home.contains(want), "Home is missing \(want) (audit M1)")
        }
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

    /// The id in the `also=` fragment of a parsed line, or nil when that need has no second list.
    private func alsoId(in line: String) -> String? {
        guard let r = line.range(of: "also=") else { return nil }
        let rest = line[r.upperBound...]
        guard let colon = rest.firstIndex(of: ":") else { return nil }
        return String(rest[..<colon])
    }

    /// The second list under a need's own, written `also: { id: 'support', query: { category: 'x' } }` or
    /// `also: .init(id: "support", query: Query(category: "x"))`. Both files write it AFTER the need's own
    /// query, so `queryLine(head)` above still reads the need's own and this reads only this one.
    private func alsoLine(_ s: String) -> String {
        guard let r = s.range(of: "also: ") else { return "-" }
        let rest = String(s[r.upperBound...])
        return "\(quoted(rest).first ?? "?"):\(queryLine(rest))"
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
