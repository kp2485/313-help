// Table | Chart on a neighborhood's year panels (Kyle, 2026-09-22: "for the longitudinal data, we should give the
// user the option on page to switch between a table and chart view for relevant data", and later the same day:
// lines, with "Homes sold" and "Building permits" selectable on one chart, and a year with a hidden count VISIBLE
// rather than dropped).
//
// Held to the things that could go wrong when numbers stop being a table and become a shape:
//  1. a count the pipeline hid is drawn at a value, or dropped so a gap reads as a zero (docs/13, honesty rule 2);
//  2. the table — the thing a screen reader can actually read — goes away when the picture arrives;
//  3. the picture quietly becomes a comparison with somewhere else, or a trend, which docs/13 forbids;
//  4. both lines get switched off and the chart becomes an empty pair of axes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hoodPage, hoodView, seriesOf, type Hood, type Indicators, type Ui, type YearStats } from '../src/hoods.js';
import {
  MARKER_FRACTION, axisYears, chartModel, chartSummary, chartable, shownSeries,
  type ChartPoint, type ChartSeries,
} from '../src/hoodchart.js';

const root = join(__dirname, '../../..');
const strings = JSON.parse(readFileSync(join(root, 'strings/en.json'), 'utf8')) as Record<string, string>;
const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
const chartSrc = readFileSync(join(__dirname, '../src/hoodchart.ts'), 'utf8');

const ui: Ui = {
  t: (k, p = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')),
  esc: (x) => String(x), own: (x) => String(x), date: (d) => d, icon: () => '',
  link: (u, l) => `<a href="${u}">${l}</a>`, go: (v) => `data-go='${JSON.stringify(v)}'`, map: () => '',
};

const src = { name: 'Property Sales', url: 'https://example.org/s', last_edited: '2026-09-17' };
const YEARS = ['2020', '2021', '2022', '2023', '2024', '2025'];
/** Since 2026-09-22 sales and permits carry their real count, however small (DECISIONS): 3 is written as 3. */
const SALES = [12, 3, 18, 24, 31, 9];
const PERMITS = [6, 7, 1, 14, 11, 8];
/** Demolitions still arrive hidden under five — the marker path is alive, and this is what exercises it. */
const DEMOS: (number | 'lt5' | undefined)[] = [7, 'lt5', 9, undefined, 12, 'lt5'];

function years(): Record<string, YearStats> {
  return Object.fromEntries(YEARS.map((y, i) => [y, {
    sales: SALES[i], median_price: 50000 + i * 1000, permits: PERMITS[i], permit_cost: 900000 + i, demolitions: DEMOS[i],
  }]));
}
const hood = (over: Partial<Hood> = {}): Hood => ({
  id: 'nbh_bagley', name: 'Bagley', district: 2, center: [42.3, -83.1], rings: [],
  help: { total: 4, by: {}, nearest_miles: {}, none_listed_yet: [], coverage_checked: true },
  places: { parks: 1, rec_centers: 0, greenway_open: 0 }, parcels: 2000, years: years(), ...over,
});
const d: Indicators = {
  sources: { neighborhoods: src, sales: src, permits: src }, stats_fetched_at: '2026-09-18', first_year: 2020, partial_year: 2025,
  near_miles: 0.5, origin: [-83.32, 42.22], city: Object.fromEntries(YEARS.map((y) => [y, { sales: 900, median_price: 70000, permits: 400, permit_cost: 1e8 }])),
  neighborhoods: [], segments: {},
};
const points = (counts: readonly (number | 'lt5' | undefined)[]): ChartPoint[] =>
  counts.map((c, i) => ({ year: YEARS[i]!, count: c, partial: false }));
const series = (key: string, tone: 'a' | 'b', label: string, counts: readonly (number | 'lt5' | undefined)[]): ChartSeries =>
  ({ key, tone, label, points: points(counts) });

// ---------------------------------------------------------------------------------------------------
// The control
// ---------------------------------------------------------------------------------------------------

describe('Table | Chart, above every year panel that has enough years', () => {
  it('is a radiogroup of two real radios, and Table is the one that starts checked', () => {
    const html = hoodPage(hood(), d, ui);
    expect(html).toContain(`role="radiogroup" aria-label="${strings['hood.view_label']}"`);
    expect(html).toMatch(/<input type="radio" id="hv-money-table" name="hoodview-money" value="table" data-hoodview="table" checked>/);
    expect(html).toMatch(/<input type="radio" id="hv-money-chart" name="hoodview-money" value="chart" data-hoodview="chart">/);
    expect(hoodView(undefined)).toBe('table');
    expect(hoodView('nonsense')).toBe('table');
    expect(hoodView('chart')).toBe('chart');
  });

  it('a panel with fewer than three years to show is a table and is offered nothing', () => {
    const thin = hood({ years: { 2024: { sales: 7, median_price: 1 }, 2025: { sales: 9, median_price: 2 } } });
    const html = hoodPage(thin, { ...d, city: { 2024: {}, 2025: {} } }, ui);
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('table class="years"');
  });

  it('the choice is kept on this device, applies at once, is said out loud, and leaves the cursor where it was', () => {
    expect(main).toContain("if (!el.dataset?.hoodview) return;");
    expect(main).toContain("refocusSel = '#' + el.id;");
    expect(main).toContain("void saveHoodView(next).then((v) => { hoodViewNow = v; render(false); announce(t('hood.view_say', { name: t('hood.view_' + v) })); });");
    expect(main).toContain('hoodViewNow = await loadHoodView();');
    expect(main).toContain('areaPage(h, d, ui, hoodViewNow, hoodSeriesOff)');
    // One flag for every panel on the page: there is a single piece of state, not one per panel.
    expect([...main.matchAll(/hoodViewNow/g)]).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------------------------------
// The picture: one chart, one axis, two lines
// ---------------------------------------------------------------------------------------------------

describe('the chart is the same numbers, drawn', () => {
  const html = hoodPage(hood(), d, ui, 'chart');

  it('is inline SVG built here — never a canvas, never a library', () => {
    expect(html).toContain('<svg class="hoodsvg"');
    expect(html).not.toContain('<canvas');
    expect(chartSrc).not.toMatch(/\bimport\b.*from '(?!\.)/);        // nothing from outside this repo
    expect(chartSrc).not.toContain('getContext');
  });

  it('homes sold and permits share ONE chart and ONE axis, never a second y-scale', () => {
    const svg = /<svg class="hoodsvg"[\s\S]*?<\/svg>/.exec(html)![0];
    expect(svg).toContain('class="ln ta"');
    expect(svg).toContain('class="ln tb"');
    const m = chartModel([series('s', 'a', 'Homes sold', SALES), series('p', 'b', 'Permits', PERMITS)]);
    expect([...svg.matchAll(/class="tk"/g)].length).toBe(m.ticks.length);
    expect(svg).not.toContain('text-anchor="start"');            // no second axis on the right
  });

  it('every year with something in it gets a point, and each point says its own year, series and count', () => {
    const svg = /<svg class="hoodsvg"[\s\S]*?<\/svg>/.exec(html)![0];
    const pts = [...svg.matchAll(/<g class="pt" tabindex="0" role="img" aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(pts).toHaveLength(SALES.length + PERMITS.length);
    expect(pts).toContain('2020, Homes sold: 12');
    expect(pts).toContain('2021, Homes sold: 3');            // no longer hidden: the real number (DECISIONS)
    expect(pts).toContain('2022, Permits: 1');
    // A point is reachable by keyboard and carries a tooltip as well as a name.
    expect(svg).toContain('<title>2020, Homes sold: 12</title>');
    expect(svg).toContain('class="tip"');
    expect(css).toContain('.hoodsvg .pt:hover .tip,.hoodsvg .pt:focus-visible .tip { opacity:1; }');
  });

  it('a hidden count is a hollow marker at a fixed height, never a value, and the line goes on through it', () => {
    const cond = { ...d, sources: { ...d.sources, blight: src } };
    const page = hoodPage(hood(), cond, ui, 'chart');
    const demo = [...page.matchAll(/<svg class="hoodsvg"[\s\S]*?<\/svg>/g)].map((m) => m[0])
      .find((s) => s.includes('2021, Torn down: fewer than 5'));
    expect(demo).toBeTypeOf('string');
    // Two hidden years, two hollow markers, and not one of them carries a number.
    expect([...demo!.matchAll(/class="mk t[ab] hollow"/g)]).toHaveLength(2);
    expect(page).toContain(strings['hood.chart_lt5']);
    // The pieces of line that touch a hidden year are drawn, and drawn differently.
    expect(demo).toContain('class="ln ta unsure"');
    // The height is a constant, not a value.
    expect(chartSrc).toContain('export const MARKER_FRACTION = 10 / 96;');
    expect(MARKER_FRACTION).toBeCloseTo(10 / 96, 12);
  });

  it('a marker always sits below the first tick over zero, so it can never be read off the axis', () => {
    for (const counts of [[5, 6, 7], [12, 18, 24, 31, 9], [200, 410, 90], [6, 6, 6], [1, 2, 3]]) {
      const m = chartModel([series('x', 'a', 'x', counts)]);
      const firstTick = m.ticks.find((t) => t > 0)!;
      expect(MARKER_FRACTION * m.top, `top ${m.top}`).toBeLessThan(firstTick);
    }
  });

  it('the axis starts at 0 and never labels a value under 5 as if it were exact', () => {
    for (const counts of [[5, 6, 7], [12, 3, 18, 24, 31, 9], [200, 410, 90], [1, 1, 2]]) {
      const m = chartModel([series('x', 'a', 'x', counts)]);
      expect(m.ticks[0]).toBe(0);
      expect(m.top).toBeGreaterThanOrEqual(5);
      for (const t of m.ticks) expect(t === 0 || t >= 5, `tick ${t}`).toBe(true);
      expect(m.ticks[m.ticks.length - 1]).toBe(m.top);
      for (const p of m.series[0]!.points) expect(p.frac).toBeLessThanOrEqual(1);
    }
  });

  it('a summary sentence says what is drawn, over which years, and names each series’ biggest year', () => {
    const m = chartModel([series('s', 'a', strings['hood.sales']!, SALES), series('p', 'b', strings['hood.permits']!, PERMITS)]);
    const s = chartSummary(ui, m);
    expect(s).toContain('2020');
    expect(s).toContain('2025');
    expect(s).toContain('31');
    expect(s).toContain('14');
    expect(html).toContain(s.slice(0, 30));
    expect(s).toMatch(/^The chart shows/);          // it is not a bar chart any more, and does not say it is
    // Never a trend: the sentence describes, it does not explain (docs/13, honesty rule 4).
    for (const word of ['rising', 'falling', 'improving', 'better', 'worse', 'trend']) expect(s.toLowerCase()).not.toContain(word);
  });

  it('holds one neighborhood and its own years: no city line, no other neighborhood', () => {
    const svg = /<svg class="hoodsvg"[\s\S]*?<\/svg>/.exec(html)![0];
    expect(svg).not.toContain(strings['hood.city']);
    expect(chartSrc).not.toMatch(/cityValue|d\.city|median_price/);
  });

  it('years thin themselves rather than overlap once there are more than six', () => {
    expect(axisYears(YEARS)).toEqual(YEARS);
    const nine = ['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    const shown = axisYears(nine);
    expect(shown[0]).toBe('2017');
    expect(shown[shown.length - 1]).toBe('2025');
    expect(shown.length).toBeLessThan(nine.length);
  });
});

// ---------------------------------------------------------------------------------------------------
// Two lines, either of which can be switched off — but never both
// ---------------------------------------------------------------------------------------------------

describe('the key is two real checkboxes', () => {
  it('both are on to begin with, and each has a label and a sample of its own', () => {
    const html = hoodPage(hood(), d, ui, 'chart');
    expect(html).toContain(strings['hood.chart_show']);
    expect(html).toMatch(/<input type="checkbox" data-hoodseries="money:sales" checked/);
    expect(html).toMatch(/<input type="checkbox" data-hoodseries="money:permits" checked/);
    expect(html).toContain(`<span class="sw ta" aria-hidden="true"></span>${strings['hood.sales']}`);
    expect(html).toContain(`<span class="sw tb" aria-hidden="true"></span>${strings['hood.permits']}`);
  });

  it('switching one off draws the other alone', () => {
    const html = hoodPage(hood(), d, ui, 'chart', new Set(['money:permits']));
    const svg = /<svg class="hoodsvg"[\s\S]*?<\/svg>/.exec(html)![0];
    expect(svg).toContain('class="ln ta"');
    expect(svg).not.toContain('class="ln tb"');
    expect(html).toMatch(/data-hoodseries="money:permits"(?![^>]*checked)/);
  });

  it('the last line on cannot be switched off: its box is disabled and the page says why', () => {
    const html = hoodPage(hood(), d, ui, 'chart', new Set(['money:permits']));
    expect(html).toMatch(/data-hoodseries="money:sales" checked disabled aria-describedby="money-only"/);
    expect(html).toContain(strings['hood.chart_only_one']);
    // And even if both ever arrived switched off, something is still drawn.
    const both = hoodPage(hood(), d, ui, 'chart', new Set(['money:sales', 'money:permits']));
    expect(both).toContain('class="ln ta"');
    expect(shownSeries([{ key: 'a' }, { key: 'b' }], new Set(['a', 'b']))).toEqual([{ key: 'a' }]);
    expect(shownSeries([{ key: 'a' }, { key: 'b' }], new Set(['a']))).toEqual([{ key: 'b' }]);
  });

  it('a panel with one series has no checkboxes at all: there is nothing to choose', () => {
    const cond = { ...d, sources: { ...d.sources, blight: src } };
    const html = hoodPage(hood(), cond, ui, 'chart');
    expect(html).not.toContain('data-hoodseries="demo:demo"');
    expect(html).toContain('data-hoodseries="money:sales"');
  });

  it('which lines are drawn is this visit only: never stored, never sent, and cleared on a new tab', () => {
    expect(main).toContain('const hoodSeriesOff = new Set<string>();');
    expect(main).toContain('if (el.checked) hoodSeriesOff.delete(id); else hoodSeriesOff.add(id);');
    expect(main).toContain('refocusSel = `[data-hoodseries="${id}"]`;');
    expect(main).toContain("hoodQuery = ''; hoodSeriesOff.clear();");
    const block = main.slice(main.indexOf('const hoodSeriesOff'), main.indexOf('const hoodSeriesOff') + 400);
    for (const forbidden of ['idbSet', 'localStorage', 'fetch(']) expect(block).not.toContain(forbidden);
  });
});

// ---------------------------------------------------------------------------------------------------
// The table is still the source of truth
// ---------------------------------------------------------------------------------------------------

describe('a screen reader gets the table either way', () => {
  it('the tables stay in the page in chart view — hidden from the eye only — and the picture points at them', () => {
    const html = hoodPage(hood(), d, ui, 'chart');
    expect(html).toContain('<div class="yeartables vh" id="money-rows">');
    expect(html).toContain('<table class="years">');
    expect(html).toContain('aria-describedby="money-sum money-rows"');
    expect(html).toContain(strings['hood.sales_caption']);
    expect(css).toMatch(/\.vh \{ position:absolute;/);
  });

  it('in table view the tables are plain and no picture is drawn at all', () => {
    const html = hoodPage(hood(), d, ui);
    expect(html).toContain('<div class="yeartables" id="money-rows">');
    expect(html).not.toContain('<svg class="hoodsvg"');
  });

  it('the figure has a name that says what it is, with the years in it', () => {
    const html = hoodPage(hood(), d, ui, 'chart');
    expect(html).toContain(`aria-label="${ui.t('hood.chart_name_money', { from: '2020', to: '2025' })}"`);
    expect(strings['hood.chart_name_money']).toMatch(/chart$/);
    expect(html).toContain(`aria-label="${strings['hood.chart_plot']}"`);
  });

  it('the chart view says where the prices went, because the picture counts and does not price', () => {
    expect(hoodPage(hood(), d, ui, 'chart')).toContain(strings['hood.chart_money_note']);
    expect(hoodPage(hood(), d, ui)).not.toContain(strings['hood.chart_money_note']);
  });
});

// ---------------------------------------------------------------------------------------------------
// Home sales and building permits state their real count (Kyle, 2026-09-22)
// ---------------------------------------------------------------------------------------------------

describe('a small number of sales is a number, not a hiding place', () => {
  it('a year with three sales says 3, in the table and on the chart', () => {
    const table = hoodPage(hood(), d, ui);
    expect(table).toContain('<td>3</td>');
    expect(hoodPage(hood(), d, ui, 'chart')).toContain('2021, Homes sold: 3');
  });

  it('the panel says in words what a small number does, instead of hiding it', () => {
    const html = hoodPage(hood(), d, ui);
    expect(html).toContain(strings['hood.small_numbers']);
    expect(strings['hood.small_numbers']).toBe('Small numbers change a lot from year to year.');
    // The old promise — "a count under 5 shows as fewer than 5" — must not still be on the page.
    expect(strings['hood.money_note']).not.toMatch(/under 5|fewer than 5/);
    expect(strings['hood.money_note']).toMatch(/10 sales/);        // the median's own threshold stays
  });

  it('the pipeline writes the real count for sales and permits, and goes on hiding the rest', () => {
    const ingest = readFileSync(join(root, 'pipeline/src/ingest-neighborhoods.ts'), 'utf8');
    expect(ingest).toContain('export function plainCount(');
    expect(ingest).toMatch(/plainCount\(f\.attributes\.n, f\.attributes\.median\);[^\n]*\{ sales/);
    expect(ingest).toMatch(/plainCount\(f\.attributes\.n, null, f\.attributes\.cost\);[^\n]*\{ permits/);
    for (const still of ['blight', 'demolitions', 'fires']) {
      expect(ingest, still).toMatch(new RegExp(`${still}: suppress\\(`));
    }
  });

  it('the shipped numbers carry no hidden sale or permit, and still hide what counts people', () => {
    const file = join(root, 'data/indicators/neighborhoods.json');
    const shipped = JSON.parse(readFileSync(file, 'utf8')) as Indicators;
    let hiddenSales = 0, smallSales = 0, hiddenElsewhere = 0;
    for (const n of shipped.neighborhoods) {
      for (const y of Object.values(n.years)) {
        if (y.sales === 'lt5' || y.permits === 'lt5') hiddenSales++;
        if (typeof y.sales === 'number' && y.sales < 5) smallSales++;
        if (y.blight === 'lt5' || y.demolitions === 'lt5' || y.fires === 'lt5') hiddenElsewhere++;
      }
    }
    expect(hiddenSales).toBe(0);
    expect(smallSales).toBeGreaterThan(0);
    expect(hiddenElsewhere).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------
// Colour is never the only carrier, in any of the four rendering modes
// ---------------------------------------------------------------------------------------------------

describe('the drawing works without colour', () => {
  it('each series has a marker shape and a line pattern of its own, not only a hue', () => {
    const html = hoodPage(hood(), d, ui, 'chart');
    const svg = /<svg class="hoodsvg"[\s\S]*?<\/svg>/.exec(html)![0];
    // A circle (an arc path) for the first series and a diamond (straight segments) for the second.
    expect(svg).toMatch(/class="mk ta" d="M[\d.]+ [\d.]+a4 4/);
    expect(svg).toMatch(/class="mk tb" d="M[\d.]+ [\d.]+L/);
    expect(css).toContain('.hoodsvg .ln.tb { stroke:var(--chart-b); stroke-dasharray:7 4; }');
    expect(css).toContain('.hoodsvg .ln.unsure { stroke-dasharray:1 3; stroke-width:1.5; }');
  });

  it('the colours are tokens, with a step for dark, for increased contrast, and for forced colours', () => {
    for (const token of ['--chart-a', '--chart-b', '--chart-lt5', '--chart-grid', '--chart-ink']) {
      expect(css, token).toContain(token + ':');
      expect([...css.matchAll(new RegExp(token + ':', 'g'))].length, token).toBeGreaterThanOrEqual(5);
    }
    const forced = css.slice(css.indexOf('@media (forced-colors: active) { :root { --chart-a'));
    expect(forced).toContain('--chart-a:CanvasText');
    expect(forced).toContain('--chart-b:LinkText');
    expect(forced).toContain('--chart-lt5:GrayText');
    expect(css).toContain('@media (prefers-contrast: more) { :root { --chart-a:');
    expect(css).toContain('@media print {');
  });
});

// ---------------------------------------------------------------------------------------------------
// The model on its own
// ---------------------------------------------------------------------------------------------------

describe('the chart model', () => {
  it('turns a series into points, segments, markers and blanks, and never mixes them up', () => {
    const m = chartModel([series('x', 'a', 'x', [12, 'lt5', undefined, 24, 7, 7])]);
    const s = m.series[0]!;
    expect(s.points.map((p) => p.kind)).toEqual(['value', 'hidden', 'none', 'value', 'value', 'value']);
    expect(s.markers).toEqual(['2021']);
    expect(s.blanks).toEqual(['2022']);
    expect(s.points[1]!.value).toBeUndefined();
    expect(s.points[1]!.frac).toBe(MARKER_FRACTION);
    // No piece of line crosses the year with nothing recorded; the pieces that touch the hidden one are dotted.
    expect(s.segments).toEqual([
      { from: 0, to: 1, dotted: true },
      { from: 3, to: 4, dotted: false },
      { from: 4, to: 5, dotted: false },
    ]);
  });

  it('names the earliest of two equal peaks, so one bundle always says the same year', () => {
    expect(chartModel([series('x', 'a', 'x', [30, 12, 30])]).series[0]!.peak).toEqual({ year: '2020', value: 30 });
  });

  it('offers a chart only for three years with something in them and at least one number to draw', () => {
    expect(chartable(points([12, 14, 16]))).toBe(true);
    expect(chartable(points([12, 14]))).toBe(false);
    expect(chartable(points([12, undefined, undefined, 14]))).toBe(false);
    expect(chartable(points(['lt5', 'lt5', 'lt5']))).toBe(false);     // nothing to draw at a value
    expect(chartable(points(['lt5', 'lt5', 7]))).toBe(true);
  });

  it('reads the years out of the same table the page prints, in the same order', () => {
    expect(seriesOf(hood(), d, (y) => y.sales).map((p) => p.year)).toEqual(YEARS);
    expect(seriesOf(hood(), d, (y) => y.sales).map((p) => p.count)).toEqual(SALES);
    expect(seriesOf(hood(), d, (y) => y.sales).filter((p) => p.partial).map((p) => p.year)).toEqual(['2025']);
  });
});

// ---------------------------------------------------------------------------------------------------
// The same words in all four languages
// ---------------------------------------------------------------------------------------------------

describe('the new words', () => {
  const keys = ['hood.view_label', 'hood.view_table', 'hood.view_chart', 'hood.view_say', 'hood.chart_series_name',
    'hood.chart_name_money', 'hood.chart_name_blight', 'hood.chart_name_demo', 'hood.chart_name_issues', 'hood.chart_name_fires',
    'hood.chart_summary', 'hood.chart_peak', 'hood.chart_peak_none', 'hood.chart_bar', 'hood.chart_lt5', 'hood.chart_lt5_note',
    'hood.chart_money_note', 'hood.small_numbers', 'hood.chart_show', 'hood.chart_only_one', 'hood.chart_series_on',
    'hood.chart_series_off', 'hood.chart_plot'];
  for (const l of ['en', 'es', 'ar', 'bn']) {
    it(`${l} has every one of them, with the same placeholders`, () => {
      const tbl = JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
      const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      for (const k of keys) {
        expect(tbl[k], `${l} ${k}`).toBeTypeOf('string');
        expect(holes(tbl[k]!), `${l} ${k}`).toBe(holes(strings[k]!));
      }
    });
  }
});
