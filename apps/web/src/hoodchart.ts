// A year panel drawn as a picture instead of a table (Kyle, 2026-09-22: "for the longitudinal data, we should give
// the user the option on page to switch between a table and chart view"). Same numbers, same file, same rules.
//
// **Lines on one chart, since later the same day.** Kyle, after looking at the first bars: he wants "Homes sold"
// and "Building permits" on the SAME chart, with the two selectable, and he wants a year the count is hidden for
// to be VISIBLE rather than dropped. So: one pair of axes, one line per series that is switched on, a key of two
// real checkboxes, and every year on the axis whether or not its count may be shown.
//
// The rules docs/13 sets, and how each one survives being drawn:
//
//  1. **No ranking, no comparison with another neighborhood.** A chart holds ONE neighborhood's own years. There
//     is no city line, no trend line, no second place on the axis, and no colour that means good or bad: the two
//     colours are two identities (homes, permits), not two ends of a scale. One y-axis, never two — two scales on
//     one chart is a way of making any two lines say whatever you like.
//  2. **A hidden count is never drawn at a value.** `lt5` — which since 2026-09-22 means blight tickets,
//     demolitions, reported problems and fires, but no longer home sales or building permits (DECISIONS) — gets a
//     HOLLOW marker at a fixed height, the same constant fraction of the plot in every chart, so the year is
//     visibly there and its number is visibly not. `MARKER_FRACTION` is the only thing that turns a hidden count
//     into geometry, and what it makes carries no value. The line goes on through it as a dotted piece, so a
//     hidden year is never a gap that reads as zero.
//  3. **The axis never labels a value under 5 as if it were exact.** `ticks` drops every tick between 0 and 5, and
//     a marker always sits below the first tick over zero (the step is at least a quarter of the top, the marker
//     about a tenth), so a marker can never be lined up against a "2" or a "4" and read as one.
//  4. **The table is the source of truth.** The chart is another VIEW of the same rows, never a different set of
//     numbers, and the table stays in the page (visually hidden) so a screen reader has every value either way
//     (apps/web/src/hoods.ts, `yearGroup`).
//
// This file is arithmetic and strings. It is the model the iPhone (`HoodChart` in HelpCore/HoodChart.swift) and
// Android (`hoodChartModel` in Hoods.kt) re-implement against the same cases, so all three draw the same picture.

export type Count = number | 'lt5';

/** One year of one series, exactly as the bundle gives it: a number, the hidden `lt5`, or nothing recorded. */
export interface ChartPoint { year: string; count: Count | undefined; partial: boolean }

/** One series before it is measured against the others. `key` is what a checkbox switches. */
export interface ChartSeries {
  key: string;
  /** `a` or `b`: which colour, which marker shape, which dash. Two identities, never a scale. */
  tone: 'a' | 'b';
  /** The series' own name — "Homes sold", "Permits" — which is its key entry and its checkbox label. */
  label: string;
  points: ChartPoint[];
}

/** A year of a series, placed. `frac` is its height as a share of the top of the axis, 0 to 1. */
export interface PlotPoint {
  year: string;
  index: number;
  partial: boolean;
  kind: 'value' | 'hidden' | 'none';
  /** The number, when there is one to show. Never set for a hidden year — that is the point of it. */
  value?: number;
  /** 0 to 1. For a hidden year it is `MARKER_FRACTION`, a constant chosen by nothing in the data. */
  frac: number;
}

/** A piece of the line between two neighbouring years. `dotted` where one of its ends is a hidden count. */
export interface PlotSegment { from: number; to: number; dotted: boolean }

export interface SeriesModel {
  key: string;
  tone: 'a' | 'b';
  label: string;
  points: PlotPoint[];
  segments: PlotSegment[];
  /** The years the pipeline hid. A hollow marker each — never a value. */
  markers: string[];
  /** The years with nothing recorded at all: a place on the axis, no marker, and a break in the line. */
  blanks: string[];
  /** The tallest year, for the summary sentence. `null` when nothing can be drawn. */
  peak: { year: string; value: number } | null;
}

export interface ChartModel {
  years: string[];
  series: SeriesModel[];
  /** The top of the axis. Always at least 5, so the drawn area never implies a scale finer than suppression. */
  top: number;
  /** 0, then every labelled value. Never 1 to 4: see rule 3 above. */
  ticks: number[];
}

/**
 * How high a hidden year's marker sits, as a share of the plot: a CONSTANT — ten of the drawing's ninety-six
 * units — and the same on all three apps, so nothing about the marker comes from the count it stands for. It is
 * always below the first tick over zero, because the axis step is at least a quarter of the top.
 */
export const MARKER_FRACTION = 10 / 96;

/** 1, 2, 5, 10, 20, 50, … — the only step sizes an axis is allowed, so ticks are always round numbers. */
function axisStep(max: number): number {
  for (let e = 0; e < 12; e++) for (const s of [1, 2, 5]) { const step = s * 10 ** e; if (Math.ceil(max / step) <= 4) return step; }
  return 10 ** 12;
}

/**
 * The whole picture, worked out from the rows — no pixels yet, so the same arithmetic runs in a test, on a phone
 * and in a browser. Years arrive in the order the table lists them and stay in it. Only the series that are
 * switched on are handed in, so the axis follows what is actually on the screen.
 */
export function chartModel(series: readonly ChartSeries[]): ChartModel {
  const years = series[0]?.points.map((p) => p.year) ?? [];
  const max = Math.max(0, ...series.flatMap((s) => s.points.map((p) => (typeof p.count === 'number' ? p.count : 0))));
  const step = axisStep(Math.max(max, 1));
  const top = Math.max(5, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) if (t === 0 || t >= 5) ticks.push(t);
  if (ticks[ticks.length - 1] !== top) ticks.push(top);

  return {
    years, top, ticks,
    series: series.map((s) => {
      const points: PlotPoint[] = s.points.map((p, index) =>
        typeof p.count === 'number'
          ? { year: p.year, index, partial: p.partial, kind: 'value', value: p.count, frac: p.count / top }
          : p.count === 'lt5'
            ? { year: p.year, index, partial: p.partial, kind: 'hidden', frac: MARKER_FRACTION }
            : { year: p.year, index, partial: p.partial, kind: 'none', frac: 0 });
      // The line runs between two neighbouring years whenever both have something. A year with nothing recorded
      // breaks it, because joining across one would draw a number nobody counted.
      const segments: PlotSegment[] = [];
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i]!, b = points[i + 1]!;
        if (a.kind === 'none' || b.kind === 'none') continue;
        segments.push({ from: i, to: i + 1, dotted: a.kind === 'hidden' || b.kind === 'hidden' });
      }
      const values = points.filter((p) => p.kind === 'value');
      return {
        key: s.key, tone: s.tone, label: s.label, points, segments,
        markers: points.filter((p) => p.kind === 'hidden').map((p) => p.year),
        blanks: points.filter((p) => p.kind === 'none').map((p) => p.year),
        // The tallest year, and the EARLIEST of them when two are equal, so one bundle always names one year.
        peak: values.reduce<{ year: string; value: number } | null>(
          (best, p) => (best && best.value >= p.value! ? best : { year: p.year, value: p.value! }), null),
      };
    }),
  };
}

/**
 * Whether a series is worth offering a chart of at all: three years with something in them, and at least one of
 * those a number there is a point to draw. Two points is a line between two dots, not a shape worth a control.
 */
export function chartable(points: readonly ChartPoint[]): boolean {
  return points.filter((p) => p.count !== undefined).length >= 3 && points.some((p) => typeof p.count === 'number');
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
 * The point at one year. A circle for the first series and a diamond for the second — a different SHAPE, not only
 * a different colour, so the two lines are still two in grayscale, in print and under forced colours (WCAG 1.4.1).
 * The hollow "fewer than 5" marker is the same shape with no fill, so a reader learns one shape per series.
 */
function markerPath(tone: 'a' | 'b', x: number, y: number): string {
  return tone === 'a'
    ? `M${x - MARKER_R} ${y}a${MARKER_R} ${MARKER_R} 0 1 0 ${MARKER_R * 2} 0a${MARKER_R} ${MARKER_R} 0 1 0 ${-MARKER_R * 2} 0Z`
    : `M${x} ${y - MARKER_R}L${x + MARKER_R} ${y}L${x} ${y + MARKER_R}L${x - MARKER_R} ${y}Z`;
}

/**
 * The whole chart: one pair of axes, one line per series switched on, a point at every year, and a hollow marker
 * at every year the pipeline hid.
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
    return `<line class="ln t${s.tone}${g.dotted ? ' unsure' : ''}" x1="${round(xOf(a.index))}" y1="${round(yOf(a.frac))}" x2="${round(xOf(b.index))}" y2="${round(yOf(b.frac))}"></line>`;
  }).join('')).join('');

  const dots = m.series.map((s) => s.points.filter((p) => p.kind !== 'none').map((p) => {
    const x = round(xOf(p.index)), y = round(yOf(p.frac)), label = pointText(ui, s.label, p);
    const tipX = round(Math.min(Math.max(x, left + 24), right - 24));
    const tip = p.kind === 'hidden' ? ui.t('hood.lt5') : String(p.value);
    return `<g class="pt" tabindex="0" role="img" aria-label="${E(label)}"><title>${E(label)}</title>` +
      `<path class="mk t${s.tone}${p.kind === 'hidden' ? ' hollow' : ''}" d="${markerPath(s.tone, x, y)}"></path>` +
      `<g class="tip" aria-hidden="true"><rect x="${round(tipX - 24)}" y="${round(y - 21)}" width="48" height="15" rx="3"></rect>` +
      `<text x="${tipX}" y="${round(y - 10)}" text-anchor="middle">${E(tip)}</text></g></g>`;
  }).join('')).join('');

  const axis = m.years.map((y, i) => labelled.has(y)
    ? `<text class="yr" x="${round(xOf(i))}" y="${baseline + 15}" text-anchor="middle">${E(y)}</text>` : '').join('');

  return `<svg class="hoodsvg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${E(ui.t('hood.chart_plot'))}">
      <g class="grid">${grid}</g>
      <line class="ax" x1="${GUT - 4}" y1="${baseline}" x2="${W - 2}" y2="${baseline}"></line>
      ${lines}${dots}${axis}
    </svg>`;
}

/** What one point says on its own: "2023, Homes sold: 14", "2021, Tickets: fewer than 5". */
export function pointText(ui: ChartUi, label: string, p: PlotPoint): string {
  const year = p.partial ? ui.t('hood.so_far', { year: p.year }) : p.year;
  const count = p.kind === 'value' ? String(p.value) : p.kind === 'hidden' ? ui.t('hood.lt5') : ui.t('hood.none_recorded');
  return ui.t('hood.chart_bar', { year, label, count });
}

/**
 * The sentence under the picture, in words: what is drawn, over which years, the biggest year of each series, and
 * — only when there is one — that some years are hidden and are NOT drawn at a value. It is a fact about this
 * neighborhood's own years and never a trend ("rising", "improving"): docs/13's fourth honesty rule is that these
 * numbers describe and do not explain.
 */
export function chartSummary(ui: ChartUi, m: ChartModel): string {
  const parts = m.series.map((s) => s.peak
    ? ui.t('hood.chart_peak', { label: s.label, count: s.peak.value, year: s.peak.year })
    : ui.t('hood.chart_peak_none', { label: s.label }));
  const hidden = m.series.some((s) => s.markers.length) ? ' ' + ui.t('hood.chart_lt5_note') : '';
  return ui.t('hood.chart_summary', {
    from: m.years[0] ?? '', to: m.years[m.years.length - 1] ?? '', most: parts.join(ui.t('list.sep')),
  }) + hidden;
}

/** Two decimals at most: the same geometry from the same numbers on every browser, and a smaller page. */
const round = (x: number) => Math.round(x * 100) / 100;
