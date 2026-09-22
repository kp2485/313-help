// A year panel drawn as a picture instead of a table (Kyle, 2026-09-22: "for the longitudinal data, we should give
// the user the option on page to switch between a table and chart view"). Same numbers, same file, same rules.
//
// **Lines on one chart, since later the same day.** Kyle, after looking at the first bars: he wants "Homes sold"
// and "Building permits" on the SAME chart, with the two selectable. So: one pair of axes, one line per series
// that is switched on, a key of real checkboxes, and every year on the axis.
//
// **Every number is the real number, since later still the same day** (Kyle: "I want exact numbers"; DECISIONS
// 2026-09-22). There is no hidden count anywhere in the dataset any more, so there is no marker for one: a year
// has a value or has nothing recorded, and that is the whole model.
//
// The rules docs/13 sets, and how each one survives being drawn:
//
//  1. **No ranking, no comparison with another neighborhood.** A chart holds ONE neighborhood's own years. There
//     is no city line, no trend line, no second place on the axis, and no colour that means good or bad: the
//     colours are identities (homes, permits; walking, biking, badly hurt), not two ends of a scale. One y-axis,
//     never two — two scales on one chart is a way of making any two lines say whatever you like, so a series in
//     a different UNIT (days to close) gets a chart of its own, never a second axis.
//  2. **A year with nothing recorded is a break in the line, never a zero.** Joining across one would draw a
//     number nobody counted.
//  3. **The table is the source of truth.** The chart is another VIEW of the same rows, never a different set of
//     numbers, and the table stays in the page (visually hidden) so a screen reader has every value either way
//     (apps/web/src/hoods.ts, `yearGroup`).
//  4. **Three ways to tell lines apart, at once.** Colour, point shape (circle, diamond, square) and line pattern
//     (solid, dashed, dash-dot), so up to three series are still three in grayscale, in print, under forced
//     colours and to a reader who sees no difference between the hues. Never more than three on one chart.
//
// This file is arithmetic and strings. It is the model the iPhone (`HoodChart` in HelpCore/HoodChart.swift) and
// Android (`hoodChartModel` in Hoods.kt) re-implement against the same cases, so all three draw the same picture.

/** One year of one series, exactly as the bundle gives it: a number, or nothing recorded. */
export interface ChartPoint { year: string; count: number | undefined; partial: boolean }

/** Which colour, which marker shape, which dash. Identities, never a scale. At most three on one chart. */
export type Tone = 'a' | 'b' | 'c';
/** What the numbers are: a count of things, or a number of days. A chart holds ONE unit (rule 1). */
export type Unit = 'count' | 'days';

/** One series before it is measured against the others. `key` is what a checkbox switches. */
export interface ChartSeries {
  key: string;
  tone: Tone;
  /** The series' own name — "Homes sold", "Permits" — which is its key entry and its checkbox label. */
  label: string;
  points: ChartPoint[];
  /** `count` unless said otherwise. */
  unit?: Unit;
}

/** A year of a series, placed. `frac` is its height as a share of the top of the axis, 0 to 1. */
export interface PlotPoint {
  year: string;
  index: number;
  partial: boolean;
  kind: 'value' | 'none';
  /** The number, when there is one to show. */
  value?: number;
  /** 0 to 1. */
  frac: number;
}

/** A piece of the line between two neighbouring years. */
export interface PlotSegment { from: number; to: number }

export interface SeriesModel {
  key: string;
  tone: Tone;
  label: string;
  points: PlotPoint[];
  segments: PlotSegment[];
  /** The years with nothing recorded at all: a place on the axis, no marker, and a break in the line. */
  blanks: string[];
  /** The tallest year, for the summary sentence. `null` when nothing can be drawn. */
  peak: { year: string; value: number } | null;
}

export interface ChartModel {
  years: string[];
  series: SeriesModel[];
  /** The top of the axis: the first round number at or above the tallest value, never under 1. */
  top: number;
  /** 0, then every labelled value, ending at `top`. */
  ticks: number[];
  unit: Unit;
}

/** 1, 2, 5, 10, 20, 50, … — the only step sizes an axis is allowed, so ticks are always round numbers. */
function axisStep(max: number): number {
  for (let e = 0; e < 12; e++) for (const s of [1, 2, 5]) { const step = s * 10 ** e; if (Math.ceil(max / step) <= 4) return step; }
  return 10 ** 12;
}

/**
 * The whole picture, worked out from the rows — no pixels yet, so the same arithmetic runs in a test, on a phone
 * and in a browser. Years arrive in the order the table lists them and stay in it. Only the series that are
 * switched on are handed in, so the axis follows what is actually on the screen. Every series handed in shares
 * one unit; the first one's unit is the chart's.
 */
export function chartModel(series: readonly ChartSeries[]): ChartModel {
  const years = series[0]?.points.map((p) => p.year) ?? [];
  const max = Math.max(0, ...series.flatMap((s) => s.points.map((p) => (typeof p.count === 'number' ? p.count : 0))));
  const step = axisStep(Math.max(max, 1));
  const top = Math.max(1, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== top) ticks.push(top);

  return {
    years, top, ticks, unit: series[0]?.unit ?? 'count',
    series: series.map((s) => {
      const points: PlotPoint[] = s.points.map((p, index) =>
        typeof p.count === 'number'
          ? { year: p.year, index, partial: p.partial, kind: 'value', value: p.count, frac: p.count / top }
          : { year: p.year, index, partial: p.partial, kind: 'none', frac: 0 });
      // The line runs between two neighbouring years whenever both have a value. A year with nothing recorded
      // breaks it, because joining across one would draw a number nobody counted.
      const segments: PlotSegment[] = [];
      for (let i = 0; i + 1 < points.length; i++) if (points[i]!.kind === 'value' && points[i + 1]!.kind === 'value') segments.push({ from: i, to: i + 1 });
      const values = points.filter((p) => p.kind === 'value');
      return {
        key: s.key, tone: s.tone, label: s.label, points, segments,
        blanks: points.filter((p) => p.kind === 'none').map((p) => p.year),
        // The tallest year, and the EARLIEST of them when two are equal, so one bundle always names one year.
        peak: values.reduce<{ year: string; value: number } | null>(
          (best, p) => (best && best.value >= p.value! ? best : { year: p.year, value: p.value! }), null),
      };
    }),
  };
}

/**
 * Whether a series is worth offering a chart of at all: three years with a number in them. Two points is a line
 * between two dots, not a shape worth a control.
 */
export function chartable(points: readonly ChartPoint[]): boolean {
  return points.filter((p) => typeof p.count === 'number').length >= 3;
}

/** Whether a series has anything at all: one year with a number. Otherwise the panel says the City has not
 *  published it for this neighborhood, instead of a table of "none recorded". */
export function anyValue(points: readonly ChartPoint[]): boolean {
  return points.some((p) => typeof p.count === 'number');
}

/**
 * Which series are drawn, given what has been switched off. **Never nothing**: the last one left on cannot be
 * switched off, so the chart is never an empty pair of axes. The control for it is disabled as well, and the key
 * says why (`hood.chart_only_one`).
 */
export function shownSeries<T extends { key: string }>(all: readonly T[], off: ReadonlySet<string>): T[] {
  const on = all.filter((s) => !off.has(s.key));
  return on.length ? on : [all[0]!];
}

/**
 * Which years get a label under the axis: every one while they fit, then every other one once there are more than
 * six, so a year is never drawn over its neighbour at a large font scale.
 *
 * It counts back from the LAST year rather than forward from the first, because the last year is the one a reader
 * looks for and because stepping forward and then adding the last as well puts two labels side by side whenever
 * the count is even — "2025 2026" ran into each other at a font scale of 2 (Android emulator, 2026-09-22). The
 * first year is added back only when it is not next to the earliest label kept. Every year is still in the table,
 * in each point's own label, and named in the summary sentence, which always says the whole range.
 */
export function axisYears(years: readonly string[]): string[] {
  if (years.length <= 6) return [...years];
  const keep = new Set<number>();
  for (let i = years.length - 1; i >= 0; i -= 2) keep.add(i);
  if (!keep.has(0) && Math.min(...keep) >= 2) keep.add(0);
  return years.filter((_, i) => keep.has(i));
}

// ---- drawing ----------------------------------------------------------------------------------------------------
// Inline SVG and nothing else: no canvas (a canvas carries no `<title>`, nothing for a screen reader, and prints
// as a blur), no library, no script. Everything below is geometry in the viewBox's own units.

const W = 320, GUT = 34, TOP_PAD = 12, BOTTOM = 22, PLOT_H = 96;
const H = TOP_PAD + PLOT_H + BOTTOM;
const MARKER_R = 4;

interface ChartUi {
  t: (key: string, p?: Record<string, string | number>) => string;
  esc: (s: unknown) => string;
}

/**
 * The point at one year. A circle for the first series, a diamond for the second and a square for the third — a
 * different SHAPE, not only a different colour, so the lines are still distinct in grayscale, in print and under
 * forced colours (WCAG 1.4.1).
 */
function markerPath(tone: Tone, x: number, y: number): string {
  return tone === 'a'
    ? `M${x - MARKER_R} ${y}a${MARKER_R} ${MARKER_R} 0 1 0 ${MARKER_R * 2} 0a${MARKER_R} ${MARKER_R} 0 1 0 ${-MARKER_R * 2} 0Z`
    : tone === 'b'
      ? `M${x} ${y - MARKER_R}L${x + MARKER_R} ${y}L${x} ${y + MARKER_R}L${x - MARKER_R} ${y}Z`
      : `M${x - MARKER_R + 0.5} ${y - MARKER_R + 0.5}h${MARKER_R * 2 - 1}v${MARKER_R * 2 - 1}h${-(MARKER_R * 2 - 1)}Z`;
}

/** A value in the chart's unit, as words: "14", or "12 days". */
export function fmtValue(ui: ChartUi, unit: Unit, n: number): string {
  return unit === 'days' ? ui.t('hood.days', { n }) : String(n);
}

/**
 * The whole chart: one pair of axes, one line per series switched on, and a point at every year with a value.
 *
 * Each point is a focusable group with its own `<title>` and its own accessible name, and a small label that
 * appears on hover and on keyboard focus — so "2023, Homes sold: 14" can be reached with a pointer, with a
 * keyboard, and by a screen reader. Every number is also still in the table on the same page.
 */
export function chartSvg(ui: ChartUi, m: ChartModel): string {
  const E = (x: unknown) => ui.esc(x);
  const n = Math.max(1, m.years.length);
  const left = GUT + 8, right = W - 10;
  const xOf = (i: number) => (n === 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1));
  const baseline = TOP_PAD + PLOT_H;
  const yOf = (frac: number) => baseline - frac * PLOT_H;
  const labelled = new Set(axisYears(m.years));

  const grid = m.ticks.map((t) => {
    const y = round(yOf(t / m.top));
    return `<line class="gl" x1="${GUT - 4}" y1="${y}" x2="${W - 2}" y2="${y}"></line>` +
      `<text class="tk" x="${GUT - 7}" y="${round(y + 4)}" text-anchor="end">${E(t)}</text>`;
  }).join('');

  const lines = m.series.map((s) => s.segments.map((g) => {
    const a = s.points[g.from]!, b = s.points[g.to]!;
    return `<line class="ln t${s.tone}" x1="${round(xOf(a.index))}" y1="${round(yOf(a.frac))}" x2="${round(xOf(b.index))}" y2="${round(yOf(b.frac))}"></line>`;
  }).join('')).join('');

  const dots = m.series.map((s) => s.points.filter((p) => p.kind === 'value').map((p) => {
    const x = round(xOf(p.index)), y = round(yOf(p.frac)), label = pointText(ui, s.label, p, m.unit);
    const tipX = round(Math.min(Math.max(x, left + 24), right - 24));
    const tip = fmtValue(ui, m.unit, p.value!);
    return `<g class="pt" tabindex="0" role="img" aria-label="${E(label)}"><title>${E(label)}</title>` +
      `<path class="mk t${s.tone}" d="${markerPath(s.tone, x, y)}"></path>` +
      `<g class="tip" aria-hidden="true"><rect x="${round(tipX - 24)}" y="${round(y - 21)}" width="48" height="15" rx="3"></rect>` +
      `<text x="${tipX}" y="${round(y - 10)}" text-anchor="middle">${E(tip)}</text></g></g>`;
  }).join('')).join('');

  const axis = m.years.map((y, i) => labelled.has(y)
    ? `<text class="yr" x="${round(xOf(i))}" y="${baseline + 15}" text-anchor="middle">${E(y)}</text>` : '').join('');

  return `<svg class="hoodsvg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${E(ui.t(m.unit === 'days' ? 'hood.chart_plot_days' : 'hood.chart_plot'))}">
      <g class="grid">${grid}</g>
      <line class="ax" x1="${GUT - 4}" y1="${baseline}" x2="${W - 2}" y2="${baseline}"></line>
      ${lines}${dots}${axis}
    </svg>`;
}

/** What one point says on its own: "2023, Homes sold: 14", "2021, Time to close: 12 days". */
export function pointText(ui: ChartUi, label: string, p: PlotPoint, unit: Unit = 'count'): string {
  const year = p.partial ? ui.t('hood.so_far', { year: p.year }) : p.year;
  const count = p.kind === 'value' ? fmtValue(ui, unit, p.value!) : ui.t('hood.none_recorded');
  return ui.t('hood.chart_bar', { year, label, count });
}

/**
 * The sentence under the picture, in words: what is drawn, over which years, and the biggest year of each series.
 * It is a fact about this neighborhood's own years and never a trend ("rising", "improving"): docs/13's fourth
 * honesty rule is that these numbers describe and do not explain.
 */
export function chartSummary(ui: ChartUi, m: ChartModel): string {
  const parts = m.series.map((s) => s.peak
    ? ui.t('hood.chart_peak', { label: s.label, count: fmtValue(ui, m.unit, s.peak.value), year: s.peak.year })
    : ui.t('hood.chart_peak_none', { label: s.label }));
  return ui.t('hood.chart_summary', {
    from: m.years[0] ?? '', to: m.years[m.years.length - 1] ?? '', most: parts.join(ui.t('list.sep')),
  });
}

/** Two decimals at most: the same geometry from the same numbers on every browser, and a smaller page. */
const round = (x: number) => Math.round(x * 100) / 100;
