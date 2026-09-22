// Table | Chart on a neighborhood's year panels (Kyle, 2026-09-22: "for the longitudinal data, we should give the
// user the option on page to switch between a table and chart view for relevant data", and later the same day:
// lines, with "Homes sold" and "Building permits" selectable on one chart, and a year with a hidden count VISIBLE
// rather than dropped).
//
// Held to the things that could go wrong when numbers stop being a table and become a shape:
//  1. a year with nothing recorded is joined across, so a gap reads as a zero;
//  2. the table — the thing a screen reader can actually read — goes away when the picture arrives;
//  3. the picture quietly becomes a comparison with somewhere else, or a trend, which docs/13 forbids;
//  4. both lines get switched off and the chart becomes an empty pair of axes;
//  5. a number that used to be hidden is still hidden somewhere (Kyle, 2026-09-22: exact numbers, everywhere).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionsPanel, crashPanel, hoodPage, hoodView, latestYear, seriesOf, type Hood, type Indicators, type Ui, type YearStats } from '../src/hoods.js';
import {
  anyValue, axisYears, chartModel, chartSummary, chartable, fmtValue, shownSeries,
  type ChartPoint, type ChartSeries, type Tone,
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
/** Demolitions with a 3 and a year nobody counted: the real number, and a break in the line. */
const DEMOS: (number | undefined)[] = [7, 3, 9, undefined, 12, 4];
const BLIGHT = [40, 52, 61, 30, 22, 9];
const ISSUES = [9, 12, 3, 15, 11, 6];
const DAYS = [8, 21, 40, 12, 9, 5];
const FIRES = [3, 4, 6, 2, 5, 1];

function years(): Record<string, YearStats> {
  return Object.fromEntries(YEARS.map((y, i) => [y, {
    sales: SALES[i], median_price: 50000 + i * 1000, permits: PERMITS[i], permit_cost: 900000 + i, demolitions: DEMOS[i],
    blight: BLIGHT[i], issues: ISSUES[i], issue_days: DAYS[i], fires: FIRES[i],
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
const points = (counts: readonly (number | undefined)[]): ChartPoint[] =>
  counts.map((c, i) => ({ year: YEARS[i]!, count: c, partial: false }));
const series = (key: string, tone: Tone, label: string, counts: readonly (number | undefined)[]): ChartSeries =>
  ({ key, tone, label, points: points(counts) });
/** The Conditions sources switched on, so the panel is drawn. */
const cond: Indicators = { ...d, sources: { ...d.sources, blight: src, demolitions: src, issues: src, fires: src, vacant: src, pavement: src, parcels: src }, city_parcels: 380000, issue_types: ['Illegal Dump Sites', 'Tree Issue'], fire_types: ['Building fire'], vacant_period: ['2025-09-22', '2026-09-21'], roads_years: [2021, 2024], city_now: { rental_certs: 12000, vacant_reg: 1500, roads: { pieces: 15000, miles: 826, poor_pct: 33 } } };

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

  it('a year with three of something is drawn at 3 and says 3 — nothing is hidden, and the code for hiding is gone', () => {
    const page = hoodPage(hood(), cond, ui, 'chart');
    expect(page).toContain('2021, Torn down: 3');
    expect(page).toContain('2020, Building fires: 3');
    expect(page).toContain('2025 so far, Building fires: 1');
    for (const gone of ['hollow', 'unsure', 'MARKER_FRACTION', 'lt5', "'hidden'"]) { expect(chartSrc).not.toContain(gone); expect(page).not.toContain(gone); }
    expect(css).not.toMatch(/hollow|unsure|chart-lt5/);
    // A 3 is placed at three quarters of an axis whose top is 4.
    const m = chartModel([series('x', 'a', 'x', [3, 4, 4])]);
    expect(m.top).toBe(4);
    expect(m.series[0]!.points[0]).toMatchObject({ kind: 'value', value: 3, frac: 0.75 });
  });

  it('a year with nothing recorded is a break in the line, never a zero', () => {
    const page = hoodPage(hood(), cond, ui, 'chart');
    const demo = [...page.matchAll(/<svg class="hoodsvg"[\s\S]*?<\/svg>/g)].map((m) => m[0]).find((s) => s.includes('Torn down: 3'))!;
    // Six years, five with a number: five diamonds, and only three pieces of dashed line (2020–21, 2021–22, 2024–25).
    expect([...demo.matchAll(/class="mk tb"/g)]).toHaveLength(5);
    expect([...demo.matchAll(/class="ln tb"/g)]).toHaveLength(3);
    expect(demo).not.toContain('2023, Torn down');
  });

  it('the axis starts at 0, ends on a round number at or above the tallest year, and labels small values exactly', () => {
    for (const counts of [[5, 6, 7], [12, 3, 18, 24, 31, 9], [200, 410, 90], [1, 1, 2], [0, 0, 0]]) {
      const m = chartModel([series('x', 'a', 'x', counts)]);
      expect(m.ticks[0]).toBe(0);
      expect(m.top).toBeGreaterThanOrEqual(Math.max(1, ...counts));
      expect(m.ticks[m.ticks.length - 1]).toBe(m.top);
      expect(m.ticks.length).toBeLessThanOrEqual(6);
      for (const p of m.series[0]!.points) expect(p.frac).toBeLessThanOrEqual(1);
    }
    expect(chartModel([series('x', 'a', 'x', [1, 1, 2])]).ticks).toEqual([0, 1, 2]);   // 1 and 2 are labelled: they are exact
    expect(chartModel([series('x', 'a', 'x', [0, 0, 0])]).top).toBe(1);
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

  it('the pipeline writes the real count for every series, and there is no function left that hides one', () => {
    const ingest = readFileSync(join(root, 'pipeline/src/ingest-neighborhoods.ts'), 'utf8');
    expect(ingest).toContain('export function plainCount(');
    for (const k of ['sales', 'permits', 'blight', 'demolitions', 'issues', 'fires', 'rental_certs', 'vacant_reg']) expect(ingest, k).toMatch(new RegExp(`${k}: (plainCount\\(|r\\.count)`));
    expect(ingest).not.toMatch(/suppress|'lt5'/);
    expect(readFileSync(join(root, 'pipeline/src/ingest-crashes.ts'), 'utf8')).not.toMatch(/'lt5'|suppress\(/);
  });

  it('the shipped numbers hold no hidden count of any kind: not a sale, not a fire, not a crash', () => {
    const file = join(root, 'data/indicators/neighborhoods.json');
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('lt5');
    const shipped = JSON.parse(text) as Indicators;
    let small = 0, smallCrash = 0;
    for (const n of shipped.neighborhoods) {
      for (const y of Object.values(n.years)) for (const k of ['sales', 'permits', 'blight', 'demolitions', 'issues', 'fires'] as const) if (y[k] !== undefined) { expect(typeof y[k]).toBe('number'); if (y[k]! < 5) small++; }
      if (n.crashes) for (const v of Object.values(n.crashes)) { expect(typeof v).toBe('number'); if (v < 5) smallCrash++; }
    }
    expect(small).toBeGreaterThan(500);
    expect(smallCrash).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------------------------------
// The Conditions panel: grouped charts, one control, a glance row, ledes, empty states
// ---------------------------------------------------------------------------------------------------

describe('the Conditions panel', () => {
  const table = conditionsPanel(hood(), cond, ui, 'table', new Set());
  const chart = conditionsPanel(hood(), cond, ui, 'chart', new Set());
  const svgs = (html: string) => [...html.matchAll(/<figure class="hoodchart" role="group" aria-label="([^"]+)"[\s\S]*?<\/figure>/g)].map((m) => ({ name: m[1]!, html: m[0] }));

  it('groups the series into four charts that each share a unit and a meaning, in a fixed order', () => {
    const names = svgs(chart).map((f) => f.name);
    expect(names).toEqual([
      'Blight tickets and buildings torn down by year, 2020 to 2025, chart',
      'Problems reported by year, 2020 to 2025, chart',
      'Days to close a problem by year, 2020 to 2025, chart',
      'Building fires by year, 2020 to 2025, chart',
    ]);
    // Tickets and demolitions are two COUNTS on one axis, each switchable; days are a chart of their own.
    const first = svgs(chart)[0]!.html;
    expect(first).toContain('data-hoodseries="cond:blight"');
    expect(first).toContain('data-hoodseries="cond:demo"');
    expect(first).toContain('class="ln ta"'); expect(first).toContain('class="ln tb"');
    const days = svgs(chart)[2]!.html;
    expect(days).toContain('2022, Middle time to close: 40 days');
    expect(days).toContain(strings['hood.chart_plot_days']);
    expect(days).not.toContain('data-hoodseries');                     // one series: nothing to choose
    // Never a second y-axis: no chart carries two units.
    for (const f of svgs(chart)) expect([...f.html.matchAll(/<svg /g)]).toHaveLength(1);
  });

  it('has ONE Table | Chart control for the whole panel, above the charts, and the tables stay in the page', () => {
    expect([...chart.matchAll(/role="radiogroup"/g)]).toHaveLength(1);
    expect(chart).toContain('name="hoodview-cond"');
    expect(chart.indexOf('role="radiogroup"')).toBeLessThan(chart.indexOf('<figure'));
    expect([...chart.matchAll(/class="yeartables vh"/g)]).toHaveLength(4);   // blight+demo, issues, days (one line pointing at the issues table), fires
    expect(chart).toContain('aria-describedby="days-sum days-rows"');
    expect([...table.matchAll(/role="radiogroup"/g)]).toHaveLength(1);
    expect(table).not.toContain('<svg');
    expect([...table.matchAll(/<table class="years"/g)]).toHaveLength(4);
  });

  it('every table and every axis runs oldest to newest, so the most recent year is at the end', () => {
    for (const t of [...table.matchAll(/<table class="years"[\s\S]*?<\/table>/g)].map((m) => m[0])) {
      const rows = [...t.matchAll(/<th scope="row">([^<]+)<\/th>/g)].map((m) => m[1]);
      expect(rows[0]).toBe('2020'); expect(rows[rows.length - 1]).toBe('2025 so far');
    }
    for (const f of svgs(chart)) { const yrs = [...f.html.matchAll(/class="yr"[^>]*>(\d{4})</g)].map((m) => m[1]); expect(yrs).toEqual(['2020', '2021', '2022', '2023', '2024', '2025']); }
  });

  it('opens with an "at a glance" row of the latest year’s figures, plus today’s two, each a label over a value', () => {
    const glance = /<dl class="glance">[\s\S]*?<\/dl>/.exec(table)![0];
    const tiles = [...glance.matchAll(/<dt>([^<]+)(?: <small>([^<]*)<\/small>)?<\/dt><dd>([^<]+)<\/dd>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(tiles).toEqual([
      ['Blight tickets', '2025 so far', '9'], ['Torn down', '2025 so far', '4'], ['Problems reported', '2025 so far', '6'],
      ['Middle time to close', '2025 so far', '5 days'], ['Building fires', '2025 so far', '1'],
      ['Empty buildings registered in the past year', 'today', 'none recorded'], ['Main streets in poor shape', 'today', 'no main streets rated here'],
    ]);
    expect(table.indexOf('class="glance"')).toBeLessThan(table.indexOf('role="radiogroup"'));
    // The latest year is the latest with a number in it, not the last column.
    expect(latestYear(hood({ years: { 2020: { blight: 3 }, 2021: {}, 2022: { sales: 4 } } }), cond, ['blight', 'demolitions', 'issues', 'fires'])).toBe('2020');
    expect(latestYear(hood({ years: {} }), cond, ['blight'])).toBeNull();
  });

  it('each chart has a one-sentence lede saying what the number is and where it comes from', () => {
    for (const k of ['hood.cond_blight_lede', 'hood.cond_issues_lede', 'hood.cond_days_lede', 'hood.cond_fires_lede']) {
      expect(table).toContain(`<p>${strings[k]}</p>`);
      expect(strings[k]!.split(/[.!?]\s/).length).toBeLessThanOrEqual(3);
      expect(strings[k]).toMatch(/From |City|Department/);              // names the source
    }
    expect(strings['hood.cond_days_lede']).toMatch(/days, not a count/);
  });

  it('a series the City has published nothing for says so in one sentence, with the neighborhood’s name, instead of a table of blanks', () => {
    const none = hood({ years: Object.fromEntries(YEARS.map((y, i) => [y, { blight: BLIGHT[i], issues: ISSUES[i], issue_days: DAYS[i] }])) });
    for (const view of ['table', 'chart'] as const) {
      const html = conditionsPanel(none, cond, ui, view, new Set());
      expect(html).toContain('<p class="empty">The City has not published this for Bagley.</p>');
      expect([...html.matchAll(/The City has not published this for Bagley/g)]).toHaveLength(1);   // fires only: tickets are there, demolitions ride with them
      expect(html).not.toContain(strings['hood.fire_caption']);
    }
    expect(conditionsPanel(hood({ years: {} }), cond, ui, 'chart', new Set())).not.toContain('role="radiogroup"');
  });

  it('a point says its exact figure, spoken and shown, for counts and for days', () => {
    expect(chart).toContain('<title>2023, Blight tickets: 30</title>');
    expect(chart).toContain('aria-label="2023, Blight tickets: 30"');
    expect(chart).toMatch(/<text x="[\d.]+" y="[\d.]+" text-anchor="middle">40 days<\/text>/);
  });

  it('keeps the words that make the numbers honest, and never the ones that hid them', () => {
    for (const k of ['hood.small_numbers', 'hood.blight_note', 'hood.fire_note', 'hood.vacant_note', 'hood.roads_note']) expect(table).toContain(strings[k]);
    expect(table).not.toMatch(/fewer than 5|too few to show|lt5/);
    expect(Object.keys(strings).filter((k) => /lt5|too_few_permits/.test(k))).toEqual([]);
    for (const v of Object.values(strings)) expect(v).not.toMatch(/under 5 shows|fewer than 5/);
  });

  it('is the same on a page: the neighborhood page draws it once, then the crash panel, then the sources', () => {
    const page = hoodPage(hood(), cond, ui, 'chart');
    expect(page.indexOf(strings['hood.cond_head']!)).toBeGreaterThan(page.indexOf(strings['hood.money_head']!));
    expect(page.indexOf(strings['hood.sources_head']!)).toBeGreaterThan(page.indexOf(strings['hood.cond_head']!));
    expect([...page.matchAll(/class="glance"/g)]).toHaveLength(1);
  });
});

describe('the crash panel, by year', () => {
  const byYear = { '2020': { walk: 12, bike: 1, severe: 5 }, '2021': { walk: 12, bike: 2, severe: 5 }, '2022': { walk: 8, bike: 0, severe: 4 }, '2023': { walk: 10, bike: 1, severe: 4 }, '2024': { walk: 7, bike: 5, severe: 4 } };
  const h = hood({ crashes: { walk: 49, bike: 9, severe: 22 }, crashes_by_year: byYear });
  const dd: Indicators = { ...d, sources: { ...d.sources, crashes: src }, crash_years: [2020, 2024], city_crashes: { walk: 2024, bike: 664, severe: 630 } };

  it('prints the exact totals and a year table with the window as its last row — no "fewer than 5" anywhere', () => {
    const html = crashPanel(h, dd, ui);
    expect(html).toContain('<span>49 <small>Whole city: 2,024</small></span>');
    expect(html).toContain('<span>9 <small>Whole city: 664</small></span>');
    const rows = [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)].map((m) => m.slice(1, 5));
    expect(rows).toEqual([['2020', '12', '1', '5'], ['2021', '12', '2', '5'], ['2022', '8', '0', '4'], ['2023', '10', '1', '4'], ['2024', '7', '5', '4'], ['2020 to 2024 total', '49', '9', '22']]);
    expect(html).not.toMatch(/fewer than|lt5/);
    expect(strings['hood.crash_note']).not.toMatch(/hidden|fewer than/);
  });

  it('draws walking, biking and badly hurt as three toggleable lines on one axis, in the chart view', () => {
    const html = crashPanel(h, dd, ui, 'chart');
    expect(html).toContain('aria-label="Crashes with someone walking or biking by year, 2020 to 2024, chart"');
    for (const k of ['walk', 'bike', 'severe']) expect(html).toContain(`data-hoodseries="crash:${k}"`);
    expect(html).toContain('class="ln tc"');
    expect(html).toContain('<title>2024, Biking: 5</title>');
    expect(html).toContain('<title>2022, Biking: 0</title>');
    const off = crashPanel(h, dd, ui, 'chart', new Set(['crash:walk', 'crash:bike']));
    expect(off).toContain('data-hoodseries="crash:severe" checked disabled');
    expect(off).not.toContain('class="ln ta"');
  });

  it('a bundle without the years draws the totals and no chart, exactly as before', () => {
    const html = crashPanel(hood({ crashes: { walk: 49, bike: 9, severe: 22 } }), dd, ui, 'chart');
    expect(html).toContain('<span>49 <small>Whole city: 2,024</small></span>');
    expect(html).not.toContain('<svg'); expect(html).not.toContain('role="radiogroup"');
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
    // A third series — the crash chart's — is a square on a dash-dot line.
    const crash = crashPanel(hood({ crashes: { walk: 10, bike: 2, severe: 1 }, crashes_by_year: { '2020': { walk: 3, bike: 1, severe: 0 }, '2021': { walk: 4, bike: 0, severe: 1 }, '2022': { walk: 3, bike: 1, severe: 0 } } }), { ...d, sources: { ...d.sources, crashes: src }, crash_years: [2020, 2022] }, ui, 'chart');
    expect(crash).toMatch(/class="mk tc" d="M[\d.]+ [\d.]+h7v7h-7Z"/);
    expect(css).toContain('.hoodsvg .ln.tc { stroke:var(--chart-c); stroke-dasharray:7 3 1.5 3; }');
    expect(css).toContain('.chartkey .sw.tc {');
  });

  it('the colours are tokens, with a step for dark, for increased contrast, and for forced colours, and every one is 3:1 on its card', () => {
    for (const token of ['--chart-a', '--chart-b', '--chart-c', '--chart-grid', '--chart-ink']) {
      expect(css, token).toContain(token + ':');
      expect([...css.matchAll(new RegExp(token + ':', 'g'))].length, token).toBeGreaterThanOrEqual(5);
    }
    expect(css).not.toContain('--chart-lt5');
    const forced = css.slice(css.indexOf('@media (forced-colors: active) { :root { --chart-a'));
    expect(forced).toContain('--chart-a:CanvasText');
    expect(forced).toContain('--chart-b:LinkText');
    expect(forced).toContain('--chart-c:Highlight');
    expect(css).toContain('@media (prefers-contrast: more) { :root { --chart-a:');
    expect(css).toContain('@media print {');
    // Contrast, computed: each series colour against the card it is drawn on, in light, dark and both
    // "increase contrast" modes, is at least 3:1 (WCAG 1.4.11).
    const read = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
    const slice = (from: string, to: string) => css.slice(css.indexOf(from), css.indexOf(to));
    const light = read(slice(':root {', '@media (prefers-color-scheme: dark)')), dark = { ...light, ...read(slice('@media (prefers-color-scheme: dark)', '* { box-sizing')) };
    const chartLight = read(slice('--chart-a:#', '@media (prefers-color-scheme: dark) { :root {\n  /* Its own')), chartDark = read(slice('@media (prefers-color-scheme: dark) { :root {\n  /* Its own', '/* "Increase contrast" deliberately'));
    const moreLight = read(slice('@media (prefers-contrast: more) { :root { --chart-a', '@media (prefers-contrast: more) and (prefers-color-scheme: dark) { :root { --chart-a'));
    const moreDark = read(slice('@media (prefers-contrast: more) and (prefers-color-scheme: dark) { :root { --chart-a', '@media (forced-colors: active) { :root { --chart-a'));
    const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
    const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    for (const [name, tokens, surface] of [['light', chartLight, light['--surface']], ['dark', chartDark, dark['--surface']], ['more light', moreLight, '#ffffff'], ['more dark', moreDark, dark['--surface']]] as const)
      for (const k of ['--chart-a', '--chart-b', '--chart-c', '--chart-ink']) expect(ratio(tokens[k]!, surface!), `${k} ${name} ${tokens[k]} on ${surface}`).toBeGreaterThanOrEqual(3);
    expect([chartLight['--chart-c'], chartDark['--chart-c']]).toEqual(['#b5177a', '#c86aa0']);
  });
});

// ---------------------------------------------------------------------------------------------------
// The model on its own
// ---------------------------------------------------------------------------------------------------

describe('the chart model', () => {
  it('turns a series into points, segments and blanks, and never mixes them up', () => {
    const m = chartModel([series('x', 'a', 'x', [12, 2, undefined, 24, 7, 7])]);
    const s = m.series[0]!;
    expect(s.points.map((p) => p.kind)).toEqual(['value', 'value', 'none', 'value', 'value', 'value']);
    expect(s.blanks).toEqual(['2022']);
    expect(s.points[1]).toMatchObject({ value: 2, frac: 2 / m.top });
    // No piece of line crosses the year with nothing recorded.
    expect(s.segments).toEqual([{ from: 0, to: 1 }, { from: 3, to: 4 }, { from: 4, to: 5 }]);
    expect(JSON.stringify(m)).not.toMatch(/hidden|marker|dotted/);
  });

  it('a chart holds one unit: days are said as days, in the point, the tip and the summary', () => {
    const m = chartModel([{ ...series('days', 'a', 'Middle time to close', DAYS), unit: 'days' }]);
    expect(m.unit).toBe('days');
    expect(fmtValue(ui, 'days', 12)).toBe('12 days');
    expect(fmtValue(ui, 'count', 12)).toBe('12');
    expect(chartSummary(ui, m)).toContain('Middle time to close, 40 days in 2022');
    expect(chartModel([series('x', 'a', 'x', [1, 2, 3])]).unit).toBe('count');
  });

  it('names the earliest of two equal peaks, so one bundle always says the same year', () => {
    expect(chartModel([series('x', 'a', 'x', [30, 12, 30])]).series[0]!.peak).toEqual({ year: '2020', value: 30 });
  });

  it('offers a chart only for three years with a number in them', () => {
    expect(chartable(points([12, 14, 16]))).toBe(true);
    expect(chartable(points([0, 0, 0]))).toBe(true);                   // three zeros are three numbers
    expect(chartable(points([12, 14]))).toBe(false);
    expect(chartable(points([12, undefined, undefined, 14]))).toBe(false);
    expect(anyValue(points([undefined, undefined, 0]))).toBe(true);
    expect(anyValue(points([undefined, undefined]))).toBe(false);
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
    'hood.chart_name_money', 'hood.chart_name_cond', 'hood.chart_name_issues', 'hood.chart_name_days', 'hood.chart_name_fires', 'hood.chart_name_crashes',
    'hood.chart_summary', 'hood.chart_peak', 'hood.chart_peak_none', 'hood.chart_bar',
    'hood.chart_money_note', 'hood.small_numbers', 'hood.chart_show', 'hood.chart_only_one', 'hood.chart_series_on',
    'hood.chart_series_off', 'hood.chart_plot', 'hood.chart_plot_days',
    'hood.glance', 'hood.glance_today', 'hood.blight_tickets', 'hood.issues_reported', 'hood.fires_short', 'hood.vacant_short', 'hood.roads_poor_short',
    'hood.cond_blight_head', 'hood.cond_blight_lede', 'hood.cond_issues_head', 'hood.cond_issues_lede', 'hood.cond_days_head', 'hood.cond_days_lede', 'hood.cond_days_table',
    'hood.cond_fires_head', 'hood.cond_fires_lede', 'hood.cond_none', 'hood.crash_walk_short', 'hood.crash_bike_short', 'hood.crash_severe_short', 'hood.crash_caption',
    'hood.crash_total', 'hood.crash_years_lede', 'hood.crash_note', 'hood.places_head', 'hood.rule_inside', 'hood.rule_near', 'hood.places_note'];
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
