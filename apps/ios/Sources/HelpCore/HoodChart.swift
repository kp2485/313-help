// A year panel drawn as a picture instead of a table (Kyle, 2026-09-22: "for the longitudinal data, we should give
// the user the option on page to switch between a table and chart view for relevant data").
//
// **Lines on one chart, since later the same day.** Kyle, after looking at the first bars: he wants "Homes sold"
// and "Building permits" on the SAME chart with the two selectable. **And every number exact, since later still**
// (Kyle: "I want exact numbers"; DECISIONS 2026-09-22): there is no hidden count in the dataset any more, so there
// is no marker for one — a year has a value or has nothing recorded.
//
// This is the Swift half of `apps/web/src/hoodchart.ts`, and, like the rest of HelpCore, it is a port rather than a
// rewrite: the same arithmetic, the same axis, the same wording, held to the same cases in HoodChartTests. It draws
// nothing — no SwiftUI here — so `swift test` runs every rule in it on Linux too.
//
// The rules docs/13 sets, and how each survives being drawn:
//
//  1. **No ranking, no comparison with another neighborhood.** A chart holds ONE neighborhood's own years. There is
//     no whole-city line, no trend line, and no colour that means good or bad: the colours are identities (homes
//     sold, permits; walking, biking, badly hurt), never ends of a scale. ONE y-axis, never two — a series in a
//     different UNIT (days to close) gets a chart of its own.
//  2. **A year with nothing recorded is a break in the line, never a zero.**
//  3. **The table is the source of truth.** The chart is another VIEW of the same rows; the table is still on the
//     screen for VoiceOver either way (HelpApp/HoodsScreen.swift).
//  4. **Three ways to tell lines apart, at once**: colour, point shape (circle, diamond, square) and line pattern
//     (solid, dashed, dash-dot). Never more than three series on one chart.
import Foundation

/// Which way a neighborhood's year panels are drawn. **Table is the default**, on every platform.
public enum HoodViewChoice: String, Sendable, CaseIterable, Codable {
    case table, chart
}

/// Whatever was stored, read safely: only the exact word "chart" is chart; anything else is a table.
public func hoodViewChoice(_ stored: String?) -> HoodViewChoice { stored == "chart" ? .chart : .table }

public enum HoodChart {

    // MARK: - what goes in

    /// One year of one series, exactly as the bundle gives it: a number, or nothing recorded.
    public struct Point: Equatable, Sendable, Identifiable {
        public var year: String
        public var count: HoodCount?
        public var partial: Bool
        public var id: String { year }
        public init(year: String, count: HoodCount?, partial: Bool = false) {
            self.year = year; self.count = count; self.partial = partial
        }
    }

    /// Which identity a series wears: a colour, a marker shape and a line pattern, all three. At most three.
    public enum Tone: String, Sendable, Equatable { case a, b, c }
    /// What the numbers are: a count of things, or a number of days. A chart holds ONE unit (rule 1).
    public enum Unit: String, Sendable, Equatable { case count, days }

    /// One series before it is measured against the others. `key` is what a checkbox switches.
    public struct Series: Equatable, Sendable, Identifiable {
        public var key: String
        public var tone: Tone
        public var label: String
        public var points: [Point]
        public var unit: Unit
        public var id: String { key }
        public init(key: String, tone: Tone, label: String, points: [Point], unit: Unit = .count) {
            self.key = key; self.tone = tone; self.label = label; self.points = points; self.unit = unit
        }
    }

    // MARK: - what comes out

    public enum Kind: String, Sendable, Equatable { case value, none }

    /// A year of a series, placed. `frac` is its height as a share of the top of the axis, 0 to 1.
    public struct PlotPoint: Equatable, Sendable, Identifiable {
        public var year: String
        public var index: Int
        public var partial: Bool
        public var kind: Kind
        /// The number, when there is one to show.
        public var value: Int?
        public var frac: Double
        public var id: String { year }
    }

    /// A piece of the line between two neighbouring years.
    public struct Segment: Equatable, Sendable, Identifiable {
        public var from: Int
        public var to: Int
        public var id: Int { from }
    }

    public struct SeriesModel: Equatable, Sendable, Identifiable {
        public var key: String
        public var tone: Tone
        public var label: String
        public var points: [PlotPoint]
        public var segments: [Segment]
        /// The years with nothing recorded at all: a place on the axis, no marker, and a break in the line.
        public var blanks: [String]
        /// The tallest year, for the summary sentence; `nil` when there is nothing to draw.
        public var peak: (year: String, value: Int)?
        public var id: String { key }

        public static func == (l: SeriesModel, r: SeriesModel) -> Bool {
            l.key == r.key && l.tone == r.tone && l.label == r.label && l.points == r.points
                && l.segments == r.segments && l.blanks == r.blanks
                && l.peak?.year == r.peak?.year && l.peak?.value == r.peak?.value
        }
    }

    public struct Model: Equatable, Sendable {
        public var years: [String]
        public var series: [SeriesModel]
        /// The top of the axis: the first round number at or above the tallest value, never under 1.
        public var top: Int
        /// 0, then every labelled value, ending at `top`.
        public var ticks: [Int]
        public var unit: Unit
    }

    // MARK: - the model

    /// 1, 2, 5, 10, 20, 50, … — the only step sizes an axis may use, so a tick is always a round number.
    static func axisStep(_ max: Int) -> Int {
        var step = 1
        for _ in 0..<12 {
            for s in [1, 2, 5] {
                let candidate = s * step
                if (max + candidate - 1) / candidate <= 4 { return candidate }
            }
            step *= 10
        }
        return step
    }

    /// The whole picture, worked out from the rows — no geometry yet, so the same arithmetic runs in a test and on
    /// a phone. Only the series that are switched on are handed in, so the axis follows what is on the screen.
    public static func model(_ series: [Series]) -> Model {
        let years = series.first?.points.map(\.year) ?? []
        let max = series.flatMap { $0.points.compactMap { $0.count?.shown } }.max() ?? 0
        let step = axisStep(Swift.max(max, 1))
        let top = Swift.max(1, ((max + step - 1) / step) * step)
        var ticks: [Int] = []
        var t = 0
        while t <= top { ticks.append(t); t += step }
        if ticks.last != top { ticks.append(top) }

        return Model(years: years, series: series.map { s in
            let points: [PlotPoint] = s.points.enumerated().map { index, p in
                if let n = p.count?.shown {
                    return PlotPoint(year: p.year, index: index, partial: p.partial, kind: .value, value: n,
                                     frac: Double(n) / Double(top))
                }
                return PlotPoint(year: p.year, index: index, partial: p.partial, kind: .none, value: nil, frac: 0)
            }
            // The line runs between two neighbouring years whenever both have a value. A year with nothing
            // recorded breaks it, because joining across one would draw a number nobody counted.
            var segments: [Segment] = []
            for i in 0..<Swift.max(0, points.count - 1) where points[i].kind == .value && points[i + 1].kind == .value {
                segments.append(Segment(from: i, to: i + 1))
            }
            let values = points.filter { $0.kind == .value }
            return SeriesModel(
                key: s.key, tone: s.tone, label: s.label, points: points, segments: segments,
                blanks: points.filter { $0.kind == .none }.map(\.year),
                // The tallest year, and the EARLIEST of them when two are equal, so one bundle says one year.
                peak: values.reduce(nil) { best, p in
                    (best.map { $0.value >= (p.value ?? 0) } ?? false) ? best : (year: p.year, value: p.value ?? 0)
                }
            )
        }, top: top, ticks: ticks, unit: series.first?.unit ?? .count)
    }

    /// Whether a series is worth offering a chart of at all: three years with a number in them. Two points is a
    /// line between two dots.
    public static func chartable(_ points: [Point]) -> Bool {
        points.filter { $0.count?.shown != nil }.count >= 3
    }

    /// Whether a series has anything at all: one year with a number. Otherwise the panel says the City has not
    /// published it for this neighborhood, instead of a table of "none recorded".
    public static func anyValue(_ points: [Point]) -> Bool {
        points.contains { $0.count?.shown != nil }
    }

    /// A value in the chart's unit, as words: "14", or "12 days".
    public static func valueText(_ n: Int, unit: Unit, words: (String, [String: String]) -> String) -> String {
        unit == .days ? words("hood.days", ["n": HoodFormat.number(Double(n))]) : HoodFormat.grouped(Double(n))
    }

    /// Which series are drawn, given what has been switched off. **Never nothing**: the last one left on cannot be
    /// switched off, so the chart is never an empty pair of axes, and its control is disabled with a line saying why.
    public static func shown(_ all: [Series], off: Set<String>) -> [Series] {
        let on = all.filter { !off.contains($0.key) }
        return on.isEmpty ? Array(all.prefix(1)) : on
    }

    /// Which years get a label under the axis: every one while they fit, then every other one once there are more
    /// than six, so a year is never drawn over its neighbour at a large text size.
    ///
    /// It counts back from the LAST year rather than forward from the first: stepping forward and then adding the
    /// last as well puts two labels side by side whenever the count is even, and "2025 2026" ran into each other
    /// at a font scale of 2. The first year is added back only when it is not next to the earliest label kept.
    public static func axisYears(_ years: [String]) -> [String] {
        guard years.count > 6 else { return years }
        var keep = Set<Int>()
        var i = years.count - 1
        while i >= 0 { keep.insert(i); i -= 2 }
        if !keep.contains(0), (keep.min() ?? 0) >= 2 { keep.insert(0) }
        return years.enumerated().filter { keep.contains($0.offset) }.map(\.element)
    }

    /// One count of one neighborhood, year by year, in the order the table prints — the web's `seriesOf`.
    public static func series(_ h: Hood, _ d: Indicators, count: (HoodYear) -> HoodCount?) -> [Point] {
        d.years.map { y in
            Point(year: y, count: count(h.years[y] ?? HoodYear()), partial: Int(y) == d.partialYear)
        }
    }

    /// The days to close, which the file carries as a decimal median, as a whole number of days.
    public static func daysSeries(_ h: Hood, _ d: Indicators) -> [Point] {
        d.years.map { y in
            Point(year: y, count: (h.years[y] ?? HoodYear()).issueDays.map { .number(Int($0.rounded())) },
                  partial: Int(y) == d.partialYear)
        }
    }

    /// The three crash series of one place, year by year (oldest first), from its `crashes_by_year`. Empty when the
    /// bundle carries the window only.
    public static func crashSeries(_ byYear: [String: HoodCrashes]?, labels: (walk: String, bike: String, severe: String)) -> [Series] {
        guard let byYear, !byYear.isEmpty else { return [] }
        let years = byYear.keys.sorted()
        func pts(_ pick: (HoodCrashes) -> HoodCount) -> [Point] { years.map { Point(year: $0, count: byYear[$0].map(pick)) } }
        return [Series(key: "walk", tone: .a, label: labels.walk, points: pts { $0.walk }),
                Series(key: "bike", tone: .b, label: labels.bike, points: pts { $0.bike }),
                Series(key: "severe", tone: .c, label: labels.severe, points: pts { $0.severe })]
    }

    // MARK: - the words

    /// What one point says on its own: "2023, Homes sold: 14", "2021, Time to close: 12 days". The sentences are
    /// the app's own, handed in.
    public static func pointText(_ p: PlotPoint, label: String, unit: Unit = .count, words: (String, [String: String]) -> String) -> String {
        let year = p.partial ? words("hood.so_far", ["year": p.year]) : p.year
        let count: String
        switch p.kind {
        case .value: count = valueText(p.value ?? 0, unit: unit, words: words)
        case .none: count = words("hood.none_recorded", [:])
        }
        return words("hood.chart_bar", ["year": year, "label": label, "count": count])
    }

    /// The sentence under the picture: what is drawn, over which years, and the biggest year of each series. A
    /// fact about this neighborhood's own years, never a trend: these numbers describe and do not explain
    /// (docs/13, rule 4).
    public static func summary(_ m: Model, words: (String, [String: String]) -> String) -> String {
        let most = m.series.map { s -> String in
            guard let peak = s.peak else { return words("hood.chart_peak_none", ["label": s.label]) }
            return words("hood.chart_peak", ["label": s.label,
                                             "count": valueText(peak.value, unit: m.unit, words: words),
                                             "year": peak.year])
        }.joined(separator: words("list.sep", [:]))
        return words("hood.chart_summary", ["from": m.years.first ?? "", "to": m.years.last ?? "", "most": most])
    }
}
