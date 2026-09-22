// A year panel drawn as a picture instead of a table (Kyle, 2026-09-22: "for the longitudinal data, we should give
// the user the option on page to switch between a table and chart view for relevant data").
//
// **Lines on one chart, since later the same day.** Kyle, after looking at the first bars: he wants "Homes sold"
// and "Building permits" on the SAME chart with the two selectable, and a year whose count is hidden to be VISIBLE
// rather than dropped.
//
// This is the Swift half of `apps/web/src/hoodchart.ts`, and, like the rest of HelpCore, it is a port rather than a
// rewrite: the same arithmetic, the same axis, the same wording, held to the same cases in HoodChartTests. It draws
// nothing — no SwiftUI here — so `swift test` runs every rule in it on Linux too.
//
// The rules docs/13 sets, and how each survives being drawn:
//
//  1. **No ranking, no comparison with another neighborhood.** A chart holds ONE neighborhood's own years. There is
//     no whole-city line, no trend line, and no colour that means good or bad: two colours are two identities
//     (homes sold, permits), never two ends of a scale. ONE y-axis, never two.
//  2. **A hidden count is never drawn at a value.** `lt5` — which since 2026-09-22 means blight tickets,
//     demolitions, reported problems and fires, but no longer home sales or building permits (DECISIONS) — becomes
//     a HOLLOW marker at a fixed height, so the year is visibly there and its number is visibly not.
//     `markerFraction` is the only thing that turns a hidden count into geometry. The line goes on through it as a
//     dotted piece, so a hidden year is never a gap that reads as zero.
//  3. **The axis never labels a value under 5 as if it were exact**: `ticks` holds 0 and then nothing below 5, and
//     a marker always sits below the first tick over zero.
//  4. **The table is the source of truth.** The chart is another VIEW of the same rows; the table is still on the
//     screen for VoiceOver either way (HelpApp/HoodsScreen.swift).
import Foundation

/// Which way a neighborhood's year panels are drawn. **Table is the default**, on every platform.
public enum HoodViewChoice: String, Sendable, CaseIterable, Codable {
    case table, chart
}

/// Whatever was stored, read safely: only the exact word "chart" is chart; anything else is a table.
public func hoodViewChoice(_ stored: String?) -> HoodViewChoice { stored == "chart" ? .chart : .table }

public enum HoodChart {

    // MARK: - what goes in

    /// One year of one series, exactly as the bundle gives it: a number, the hidden `lt5`, or nothing recorded.
    public struct Point: Equatable, Sendable, Identifiable {
        public var year: String
        public var count: HoodCount?
        public var partial: Bool
        public var id: String { year }
        public init(year: String, count: HoodCount?, partial: Bool = false) {
            self.year = year; self.count = count; self.partial = partial
        }
    }

    /// Which of the two identities a series wears: a colour, a marker shape and a line pattern, all three.
    public enum Tone: String, Sendable, Equatable { case a, b }

    /// One series before it is measured against the others. `key` is what a checkbox switches.
    public struct Series: Equatable, Sendable, Identifiable {
        public var key: String
        public var tone: Tone
        public var label: String
        public var points: [Point]
        public var id: String { key }
        public init(key: String, tone: Tone, label: String, points: [Point]) {
            self.key = key; self.tone = tone; self.label = label; self.points = points
        }
    }

    // MARK: - what comes out

    public enum Kind: String, Sendable, Equatable { case value, hidden, none }

    /// A year of a series, placed. `frac` is its height as a share of the top of the axis, 0 to 1.
    public struct PlotPoint: Equatable, Sendable, Identifiable {
        public var year: String
        public var index: Int
        public var partial: Bool
        public var kind: Kind
        /// The number, when there is one to show. Never set for a hidden year — that is the point of it.
        public var value: Int?
        /// For a hidden year it is `markerFraction`, a constant chosen by nothing in the data.
        public var frac: Double
        public var id: String { year }
    }

    /// A piece of the line between two neighbouring years. `dotted` where one of its ends is a hidden count.
    public struct Segment: Equatable, Sendable, Identifiable {
        public var from: Int
        public var to: Int
        public var dotted: Bool
        public var id: Int { from }
    }

    public struct SeriesModel: Equatable, Sendable, Identifiable {
        public var key: String
        public var tone: Tone
        public var label: String
        public var points: [PlotPoint]
        public var segments: [Segment]
        /// The years the pipeline hid. A hollow marker each — never a value.
        public var markers: [String]
        /// The years with nothing recorded at all: a place on the axis, no marker, and a break in the line.
        public var blanks: [String]
        /// The tallest year, for the summary sentence; `nil` when there is nothing to draw.
        public var peak: (year: String, value: Int)?
        public var id: String { key }

        public static func == (l: SeriesModel, r: SeriesModel) -> Bool {
            l.key == r.key && l.tone == r.tone && l.label == r.label && l.points == r.points
                && l.segments == r.segments && l.markers == r.markers && l.blanks == r.blanks
                && l.peak?.year == r.peak?.year && l.peak?.value == r.peak?.value
        }
    }

    public struct Model: Equatable, Sendable {
        public var years: [String]
        public var series: [SeriesModel]
        /// The top of the axis. At least 5, so the drawn area never implies a scale finer than suppression.
        public var top: Int
        /// 0, then every labelled value. Never 1 to 4 (rule 3).
        public var ticks: [Int]
    }

    /**
     How high a hidden year's marker sits, as a share of the plot: a CONSTANT — ten of the web's ninety-six drawing
     units — and the same on all three apps, so nothing about the marker comes from the count it stands for. It is
     always below the first tick over zero, because the axis step is at least a quarter of the top.
     */
    public static let markerFraction = 10.0 / 96.0
    public static func markerValue(top: Int) -> Double { Double(top) * markerFraction }

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
        let top = Swift.max(5, ((max + step - 1) / step) * step)
        var ticks: [Int] = []
        var t = 0
        while t <= top { if t == 0 || t >= 5 { ticks.append(t) }; t += step }
        if ticks.last != top { ticks.append(top) }

        return Model(years: years, series: series.map { s in
            let points: [PlotPoint] = s.points.enumerated().map { index, p in
                if let n = p.count?.shown {
                    return PlotPoint(year: p.year, index: index, partial: p.partial, kind: .value, value: n,
                                     frac: Double(n) / Double(top))
                }
                if p.count == .suppressed {
                    return PlotPoint(year: p.year, index: index, partial: p.partial, kind: .hidden, value: nil,
                                     frac: markerFraction)
                }
                return PlotPoint(year: p.year, index: index, partial: p.partial, kind: .none, value: nil, frac: 0)
            }
            // The line runs between two neighbouring years whenever both have something. A year with nothing
            // recorded breaks it, because joining across one would draw a number nobody counted.
            var segments: [Segment] = []
            for i in 0..<Swift.max(0, points.count - 1) {
                let a = points[i], b = points[i + 1]
                if a.kind == .none || b.kind == .none { continue }
                segments.append(Segment(from: i, to: i + 1, dotted: a.kind == .hidden || b.kind == .hidden))
            }
            let values = points.filter { $0.kind == .value }
            return SeriesModel(
                key: s.key, tone: s.tone, label: s.label, points: points, segments: segments,
                markers: points.filter { $0.kind == .hidden }.map(\.year),
                blanks: points.filter { $0.kind == .none }.map(\.year),
                // The tallest year, and the EARLIEST of them when two are equal, so one bundle says one year.
                peak: values.reduce(nil) { best, p in
                    (best.map { $0.value >= (p.value ?? 0) } ?? false) ? best : (year: p.year, value: p.value ?? 0)
                }
            )
        }, top: top, ticks: ticks)
    }

    /// Whether a series is worth offering a chart of at all: three years with something in them, and at least one
    /// of those a number there is a point to draw. Two points is a line between two dots.
    public static func chartable(_ points: [Point]) -> Bool {
        points.filter { $0.count != nil }.count >= 3 && points.contains { $0.count?.shown != nil }
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

    // MARK: - the words

    /// What one point says on its own: "2023, Homes sold: 14", "2021, Torn down: fewer than 5". The sentences are
    /// the app's own, handed in, exactly as `HoodFormat.count` takes them.
    public static func pointText(_ p: PlotPoint, label: String, words: (String, [String: String]) -> String) -> String {
        let year = p.partial ? words("hood.so_far", ["year": p.year]) : p.year
        let count: String
        switch p.kind {
        case .value: count = HoodFormat.grouped(Double(p.value ?? 0))
        case .hidden: count = words("hood.lt5", [:])
        case .none: count = words("hood.none_recorded", [:])
        }
        return words("hood.chart_bar", ["year": year, "label": label, "count": count])
    }

    /// The sentence under the picture: what is drawn, over which years, the biggest year of each series, and — only
    /// when there is one — that some years are hidden and are NOT drawn at a value. A fact about this
    /// neighborhood's own years, never a trend: these numbers describe and do not explain (docs/13, rule 4).
    public static func summary(_ m: Model, words: (String, [String: String]) -> String) -> String {
        let most = m.series.map { s -> String in
            guard let peak = s.peak else { return words("hood.chart_peak_none", ["label": s.label]) }
            return words("hood.chart_peak", ["label": s.label,
                                             "count": HoodFormat.grouped(Double(peak.value)),
                                             "year": peak.year])
        }.joined(separator: words("list.sep", [:]))
        let line = words("hood.chart_summary", ["from": m.years.first ?? "", "to": m.years.last ?? "", "most": most])
        guard m.series.contains(where: { !$0.markers.isEmpty }) else { return line }
        return line + " " + words("hood.chart_lt5_note", [:])
    }
}
