// The chart model behind Table | Chart on a neighborhood's year panels (docs/13, 2026-09-22).
//
// These are the web's cases in `apps/web/test/hoodchart.test.ts`, ported one for one: the same years, the same
// counts, the same expected points, markers, segments, axis and sentence. If the two ever disagree, one of the two
// apps is drawing something the other is not.
import XCTest
@testable import HelpCore

final class HoodChartTests: XCTestCase {

    private let years = ["2020", "2021", "2022", "2023", "2024", "2025"]
    /// The web's SALES fixture. Since 2026-09-22 a small count is stated, not hidden (DECISIONS): 3 is 3.
    private let sales: [HoodCount?] = [.number(12), .number(3), .number(18), .number(24), .number(31), .number(9)]

    private func points(_ counts: [HoodCount?], partial: String? = nil) -> [HoodChart.Point] {
        counts.enumerated().map { HoodChart.Point(year: years[$0.offset], count: $0.element, partial: years[$0.offset] == partial) }
    }
    private func one(_ counts: [HoodCount?], tone: HoodChart.Tone = .a, label: String = "x", key: String = "x") -> HoodChart.Series {
        HoodChart.Series(key: key, tone: tone, label: label, points: points(counts))
    }
    /// The app's own words, as the screen hands them in.
    private func words(_ key: String, _ p: [String: String]) -> String {
        let table = [
            "hood.lt5": "fewer than 5",
            "hood.none_recorded": "none recorded",
            "hood.so_far": "{year} so far",
            "hood.chart_bar": "{year}, {label}: {count}",
            "hood.chart_summary": "The chart shows each year from {from} to {to}. Most in one year: {most}.",
            "hood.chart_peak": "{label}, {count} in {year}",
            "hood.chart_peak_none": "{label}, no year has a number we can show",
            "hood.chart_lt5_note": "A year with fewer than 5 shows a hollow marker at a fixed height, not a value.",
            "list.sep": ", ",
        ]
        var out = table[key] ?? "MISSING:" + key
        for (k, v) in p { out = out.replacingOccurrences(of: "{\(k)}", with: v) }
        return out
    }

    // MARK: - points, segments, markers and blanks

    func testASeriesBecomesPointsSegmentsMarkersAndBlanksAndNeverMixesThemUp() {
        let m = HoodChart.model([one([.number(12), .suppressed, nil, .number(24), .number(7), .number(7)])])
        let s = m.series[0]
        XCTAssertEqual(s.points.map(\.kind), [.value, .hidden, .none, .value, .value, .value])
        XCTAssertEqual(s.markers, ["2021"])
        XCTAssertEqual(s.blanks, ["2022"])
        XCTAssertNil(s.points[1].value)
        XCTAssertEqual(s.points[1].frac, HoodChart.markerFraction, accuracy: 1e-12)
        // No piece of line crosses the year with nothing recorded; the pieces that touch the hidden one are dotted.
        XCTAssertEqual(s.segments, [
            HoodChart.Segment(from: 0, to: 1, dotted: true),
            HoodChart.Segment(from: 3, to: 4, dotted: false),
            HoodChart.Segment(from: 4, to: 5, dotted: false),
        ])
    }

    /// The whole point of the marker: there is no path from a hidden count to a value.
    func testAHiddenCountIsNeverAValue() {
        let hidden: HoodCount? = .suppressed
        let m = HoodChart.model([one([hidden, hidden, hidden, .number(40), hidden, hidden])])
        XCTAssertEqual(m.series[0].points.filter { $0.kind == .value }.count, 1)
        XCTAssertEqual(m.series[0].markers.count, 5)
        for p in m.series[0].points where p.kind == .hidden {
            XCTAssertNil(p.value)
            XCTAssertEqual(p.frac, HoodChart.markerFraction, accuracy: 1e-12)
        }
        XCTAssertEqual(HoodChart.markerFraction, 10.0 / 96.0, accuracy: 1e-12)
    }

    /// And it can never be lined up against a tick and read as a number.
    func testAMarkerAlwaysSitsBelowTheFirstTickOverZero() {
        for counts in [[5, 6, 7], [12, 18, 24, 31, 9], [200, 410, 90], [6, 6, 6], [1, 2, 3]] {
            let m = HoodChart.model([HoodChart.Series(key: "x", tone: .a, label: "x",
                points: counts.enumerated().map { HoodChart.Point(year: String(2020 + $0.offset), count: .number($0.element)) })])
            let firstTick = m.ticks.first(where: { $0 > 0 }) ?? m.top
            XCTAssertLessThan(HoodChart.markerValue(top: m.top), Double(firstTick), "top \(m.top)")
        }
    }

    func testTheEarliestOfTwoEqualPeaksIsNamed() {
        let m = HoodChart.model([one([.number(30), .number(12), .number(30), nil, nil, nil])])
        XCTAssertEqual(m.series[0].peak?.year, "2020")
        XCTAssertEqual(m.series[0].peak?.value, 30)
    }

    // MARK: - the axis

    func testTheAxisStartsAtZeroAndNeverLabelsAValueUnderFive() {
        for counts in [[5, 6, 7], [12, 3, 18, 24, 31, 9], [200, 410, 90], [1, 1, 2]] {
            let m = HoodChart.model([HoodChart.Series(key: "x", tone: .a, label: "x",
                points: counts.enumerated().map { HoodChart.Point(year: String(2020 + $0.offset), count: .number($0.element)) })])
            XCTAssertEqual(m.ticks.first, 0, "\(counts)")
            XCTAssertGreaterThanOrEqual(m.top, 5, "\(counts)")
            XCTAssertEqual(m.ticks.last, m.top, "\(counts)")
            for t in m.ticks { XCTAssertTrue(t == 0 || t >= 5, "tick \(t) in \(counts)") }
            for p in m.series[0].points { XCTAssertLessThanOrEqual(p.frac, 1.0) }
        }
    }

    /// Two series share ONE axis: its top is the larger of the two, never one scale each.
    func testTwoSeriesShareOneAxis() {
        let m = HoodChart.model([one(sales, key: "s"), one([.number(6), .number(7), .number(1), .number(14), .number(11), .number(8)], tone: .b, key: "p")])
        XCTAssertEqual(m.series.count, 2)
        XCTAssertEqual(m.top, HoodChart.model([one(sales)]).top)
        XCTAssertEqual(m.series[0].points[0].frac, 12.0 / Double(m.top), accuracy: 1e-12)
        XCTAssertEqual(m.series[1].points[0].frac, 6.0 / Double(m.top), accuracy: 1e-12)
    }

    func testAnAllHiddenSeriesHasAnAxisOfFive() {
        let m = HoodChart.model([one([.suppressed, .suppressed, .suppressed, nil, nil, nil])])
        XCTAssertEqual(m.top, 5)
        XCTAssertEqual(m.ticks, [0, 5])
        XCTAssertNil(m.series[0].peak)
    }

    func testTheStepIsAlwaysAOneATwoOrAFiveTimesAPowerOfTen() {
        for max in [1, 4, 5, 9, 11, 37, 99, 205, 1234, 90_000] {
            let step = HoodChart.axisStep(max)
            let head = step / Int(pow(10.0, floor(log10(Double(step)))))
            XCTAssertTrue([1, 2, 5].contains(head), "step \(step) for \(max)")
            XCTAssertLessThanOrEqual((max + step - 1) / step, 4, "too many ticks for \(max)")
        }
    }

    // MARK: - which lines are drawn

    func testTheLastLineOnCannotBeSwitchedOff() {
        let all = [one(sales, key: "sales"), one(sales, tone: .b, key: "permits")]
        XCTAssertEqual(HoodChart.shown(all, off: []).map(\.key), ["sales", "permits"])
        XCTAssertEqual(HoodChart.shown(all, off: ["permits"]).map(\.key), ["sales"])
        XCTAssertEqual(HoodChart.shown(all, off: ["sales"]).map(\.key), ["permits"])
        // Both off is not a state the screen can reach, and if it ever were, something is still drawn.
        XCTAssertEqual(HoodChart.shown(all, off: ["sales", "permits"]).map(\.key), ["sales"])
    }

    // MARK: - when a chart is offered at all

    func testAChartIsOfferedOnlyForThreeYearsWithAtLeastOneNumberToDraw() {
        XCTAssertTrue(HoodChart.chartable(points([.number(12), .number(14), .number(16), nil, nil, nil])))
        XCTAssertFalse(HoodChart.chartable(points([.number(12), .number(14), nil, nil, nil, nil])))
        XCTAssertFalse(HoodChart.chartable(points([.number(12), nil, nil, .number(14), nil, nil])))
        XCTAssertFalse(HoodChart.chartable(points([.suppressed, .suppressed, .suppressed, nil, nil, nil])))
        XCTAssertTrue(HoodChart.chartable(points([.suppressed, .suppressed, .number(7), nil, nil, nil])))
    }

    // MARK: - the labels under the axis

    func testYearsThinThemselvesRatherThanOverlapOnceThereAreMoreThanSix() {
        XCTAssertEqual(HoodChart.axisYears(years), years)
        let nine = (2017...2025).map(String.init)
        let shown = HoodChart.axisYears(nine)
        XCTAssertEqual(shown.first, "2017")
        XCTAssertEqual(shown.last, "2025")
        XCTAssertLessThan(shown.count, nine.count)
    }

    // MARK: - the words

    func testAPointSaysItsYearItsSeriesAndItsCountAndNeverADigitForAHiddenOne() {
        let m = HoodChart.model([one(sales, label: "Homes sold")])
        XCTAssertEqual(HoodChart.pointText(m.series[0].points[0], label: "Homes sold", words: words), "2020, Homes sold: 12")
        XCTAssertEqual(HoodChart.pointText(m.series[0].points[1], label: "Homes sold", words: words), "2021, Homes sold: 3")
        let hid = HoodChart.model([one([.suppressed, .suppressed, .suppressed, .number(9), nil, nil], label: "Torn down")])
        XCTAssertEqual(HoodChart.pointText(hid.series[0].points[0], label: "Torn down", words: words), "2020, Torn down: fewer than 5")
        XCTAssertEqual(HoodChart.pointText(hid.series[0].points[4], label: "Torn down", words: words), "2024, Torn down: none recorded")
        // The year that is still running says so, exactly as its table row does.
        let sofar = HoodChart.model([HoodChart.Series(key: "x", tone: .a, label: "Homes sold", points: points(sales, partial: "2025"))])
        XCTAssertEqual(HoodChart.pointText(sofar.series[0].points[5], label: "Homes sold", words: words), "2025 so far, Homes sold: 9")
    }

    func testTheSummarySaysWhatIsDrawnOverWhichYearsAndThatHiddenYearsAreNotDrawnAtAValue() {
        let m = HoodChart.model([one([.suppressed, .number(12), .number(31), nil, nil, nil], label: "Torn down")])
        let s = HoodChart.summary(m, words: words)
        XCTAssertEqual(s, "The chart shows each year from 2020 to 2025. Most in one year: Torn down, 31 in 2022. "
                       + "A year with fewer than 5 shows a hollow marker at a fixed height, not a value.")
        // No hidden year, no sentence about hidden years.
        let plain = HoodChart.model([one([.number(12), .number(14), .number(16), nil, nil, nil], label: "Homes sold")])
        XCTAssertFalse(HoodChart.summary(plain, words: words).contains("hollow marker"))
        // Never a trend: the sentence describes, it does not explain (docs/13, honesty rule 4).
        for word in ["rising", "falling", "better", "worse", "trend"] {
            XCTAssertFalse(s.lowercased().contains(word), word)
        }
    }

    func testTwoSeriesAreBothNamedInOneSentence() {
        let m = HoodChart.model([one(sales, label: "Homes sold", key: "s"),
                                 one([.number(6), .number(7), .number(1), .number(14), .number(11), .number(8)], tone: .b, label: "Permits", key: "p")])
        let s = HoodChart.summary(m, words: words)
        XCTAssertTrue(s.contains("Homes sold, 31 in 2024"))
        XCTAssertTrue(s.contains("Permits, 14 in 2023"))
    }

    // MARK: - what the phone remembers

    func testTableIsTheDefaultAndOnlyTheWordChartIsChart() {
        XCTAssertEqual(hoodViewChoice(nil), .table)
        XCTAssertEqual(hoodViewChoice("nonsense"), .table)
        XCTAssertEqual(hoodViewChoice("Chart"), .table)      // exactly the word, or it is a table
        XCTAssertEqual(hoodViewChoice("chart"), .chart)
    }

    func testTheChoiceSurvivesARelaunchAndSitsBesideTheLayerChoicesInTheSameFile() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let first = MapLayerStore(dir: dir)
        XCTAssertEqual(first.hoodView, .table)               // nothing stored yet
        first.toggle("go:qline")
        first.setHoodView(.chart)

        let second = MapLayerStore(dir: dir)
        XCTAssertEqual(second.hoodView, .chart)
        XCTAssertTrue(second.isOn("go:qline"))               // the layer choice is not trampled
        XCTAssertEqual(second.style, .standard)
    }

    /// Yesterday's file — a bare list of layer ids, and then a file with no `hoodView` at all — still reads, and
    /// the view is then the default.
    func testAnOlderFileReadsAsATable() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("map-layers.json")
        try Data(#"{"on":["place:parks"],"style":"subway"}"#.utf8).write(to: file)
        let store = MapLayerStore(dir: dir)
        XCTAssertEqual(store.hoodView, .table)
        XCTAssertEqual(store.style, .subway)
    }
}
