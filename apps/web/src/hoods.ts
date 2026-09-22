// Neighborhood pages (docs/13): "How is Bagley doing?" Public City data joined with our own listings by the
// pipeline. Nothing here comes from a phone, a report, or app usage. Not in the crisis path: reached from
// About, from a greenway segment, or by link.
//
// Honesty rules that live in this file: no ranking or sorting by a number (lists are alphabetical); every number
// says where it came from and when; every count is the real number, however small (Kyle, 2026-09-22 — nothing is
// hidden, crashes included); home prices and building permits are drawn in ONE panel so neither is shown without
// the other; "none listed yet" describes our list, not the place.

import { fetchVerified, idbGet, idbSet, type BundleIndex } from './data.js';
import { anyValue, chartModel, chartSummary, chartSvg, chartable, shownSeries, type ChartPoint, type ChartSeries } from './hoodchart.js';
import { groupHoods, matchHoods, type HoodOrder } from './hoodfind.js';
import { isPrivate } from './needs.js';
import { locale } from './i18n.js';

/** Every count is the exact number. There has been no hidden value in the bundle since 2026-09-22. */
type Count = number;
export interface YearStats { sales?: Count; median_price?: number; permits?: Count; permit_cost?: number; blight?: Count; demolitions?: Count; issues?: Count; issue_days?: number; fires?: Count }
/** Today's numbers, not a year's: rental certificates in force, vacant registrations of the past 12 months, street ratings. */
export interface NowStats { rental_certs?: Count; vacant_reg?: Count; roads?: { pieces: Count; miles?: number; poor_pct?: number } }
/** "Safe streets" (docs/13): crashes the police wrote up that involved someone walking or biking, over the
 *  years the panel names. Exact counts. Never a rate: docs/13 defines no denominator here. */
export interface CrashCounts { walk: Count; bike: Count; severe: Count }
export interface Hood {
  id: string; name: string; district: number | null; jlg_study_area?: boolean; center: [number, number]; rings: number[][];
  /** `nearest_id` names the listing each `nearest_miles` number was measured to (pipeline/src/indicators.ts,
   *  2026-09-22). Optional: a bundle built before that date carries the distances and no ids, and the rows are
   *  then drawn exactly as they were. */
  help: { total: number; by: Record<string, number>; nearest_miles: Record<string, number | null>; nearest_id?: Record<string, string | null>; none_listed_yet: string[]; coverage_checked: boolean };
  places: { parks: number; rec_centers: number; greenway_open: number; snap_stores?: number; bus_stops?: number };
  nearest_city?: { snap: number | null; grocery: number | null; bus: number | null };
  parcels?: number;
  years: Record<string, YearStats>;
  now?: NowStats;
  crashes?: CrashCounts;
  /** The same three counts for each year of the window (2026-09-22). Optional: a bundle built before that day
   *  carries the window only, and the panel then draws the totals and no chart. */
  crashes_by_year?: Record<string, CrashCounts>;
}
interface Source { name: string; url: string; last_edited: string }
/**
 * A city page (docs/13, "The four cities"; DECISIONS 2026-09-22). It is a `Hood` with extra keys, because it is
 * the same page drawn with the same components — the outline map, the help panel, the nearest rows and the
 * crash panel are shared code, not a copy.
 *
 * Two things are NOT shared, and both are properties of the data:
 *   `panels` is an allow-list. This file draws a panel because the area lists it, never because a number is
 *   present — so "Dearborn does not publish blight tickets" is a fact in the bundle, not a habit of the web.
 *   `sources` names a source PER PANEL. Detroit's parks come from the City and Hamtramck's from SEMCOG; two
 *   numbers that share a word never share a source line.
 */
export interface AreaSource { name: string; url: string; license: string; license_url?: string; notice?: string; last_edited: string; records_from?: string }
export interface MissingPanel { panel: string; why: 'not_published' | 'none_recorded' }
export interface PermitYear { year: number; buildings: number; units: number; months_reported: number }
export interface Area extends Hood {
  city: string; kind: 'city' | 'neighborhood';
  panels: string[]; sources: Record<string, string>; missing: MissingPanel[];
  park_acres?: number;
  roads_bands?: { pieces: number; miles: number; good_pct: number; fair_pct: number; poor_pct: number };
  vacancy?: { housing_units: number; vacant: number; pct: number; population: number };
  permits_by_year?: PermitYear[];
}
export interface CityRow { id: string; name: string; kind: 'city'; children: 'neighborhood' | 'none' }
export interface Indicators {
  sources: { neighborhoods: Source; sales: Source; permits: Source; blight?: Source; demolitions?: Source; issues?: Source; parcels?: Source; snap?: Source; bus_stops?: Source; rentals?: Source; fires?: Source; pavement?: Source; vacant?: Source; crashes?: Source };
  city_parcels?: number; issue_types?: string[]; fire_types?: string[]; city_now?: NowStats; roads_years?: [number, number]; vacant_period?: [string, string];
  crash_years?: [number, number]; city_crashes?: CrashCounts; city_crashes_by_year?: Record<string, CrashCounts>; crash_records_from?: string;
  stats_fetched_at: string; first_year: number; partial_year: number;
  near_miles: number; origin: [number, number]; city: Record<string, YearStats>; neighborhoods: Hood[]; segments: Record<string, string[]>;
  /** Added 2026-09-22, all optional: a bundle built before the city pages carries none of them and every screen
   *  that existed before behaves exactly as it did. */
  cities?: CityRow[]; areas?: Area[]; area_sources?: Record<string, AreaSource>;
  pavement_year?: number; permit_years?: number[];
}

/** The page for an id, whichever kind of area it names. `null` for an id this bundle does not carry. */
export function areaById(d: Indicators, id: string): Hood | Area | null {
  return d.neighborhoods.find((n) => n.id === id) ?? d.areas?.find((a) => a.id === id) ?? null;
}
export const isArea = (h: Hood | Area): h is Area => Array.isArray((h as Area).panels);
/** One entry point for `#/n/<id>`: a Detroit neighborhood page, or a city page, drawn from the same components. */
export function areaPage(h: Hood | Area, d: Indicators, ui: Ui, view: HoodView = 'table', off: ReadonlySet<string> = new Set()): string {
  return isArea(h) ? cityPage(h, d, ui, view, off) : hoodPage(h, d, ui, view, off);
}

const FILE = 'indicators/neighborhoods.json';
let loaded: { key: string; data: Indicators } | undefined;
export async function loadIndicators(index: BundleIndex): Promise<Indicators | null> {
  const key = index.files[FILE]?.sha256;
  if (!key) return null;
  if (loaded?.key === key) return loaded.data;
  try {
    let hit = await idbGet<{ key: string; data: Indicators }>('indicators');
    if (hit?.key !== key) {
      try { hit = { key, data: (await fetchVerified(index, FILE)) as Indicators }; await idbSet('indicators', hit); }
      catch (e) { if (!hit) throw e; }
    }
    loaded = hit!;
    return loaded.data;
  } catch (e) { console.warn('neighborhood numbers not available', e); return null; }
}

/** Outline corners as lat/lon, for fitting and drawing the map. */
export function outline(h: Hood, origin: [number, number]): { lat: number; lon: number }[][] {
  return h.rings.map((enc) => { const out: { lat: number; lon: number }[] = []; let x = 0, y = 0; for (let i = 0; i + 1 < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out.push({ lon: origin[0] + x / 1e5, lat: origin[1] + y / 1e5 }); } return out; });
}

export interface Ui {
  t: (key: string, p?: Record<string, string | number>) => string; esc: (s: unknown) => string; own: (s: unknown) => string; date: (d: string) => string;
  link: (url: string, label: string) => string; go: (view: object) => string; map: (h: Hood) => string; icon: (name: string) => string;
  /** A listing from the bundle this page is drawn beside, or null when the bundle has not loaded or no longer
   *  carries that id. Only the "nearest" rows use it, to name and open the place the distance belongs to. */
  listing?: (id: string) => { id: string; name: string; category: string } | null;
}
/** Per 1,000 parcels. No rate without a count we can show and a base we can defend (honesty rules 2 and 3). */
/**
 * One of our sentences with a run the City wrote dropped into it: the sentence is escaped, the run is marked
 * English (WCAG 3.1.2), and in Arabic the run stays one left-to-right piece inside the Arabic sentence, so its
 * own commas and slashes do not end up at the end of the line.
 */
export function slot(ui: Ui, key: string, name: string, value: string, p: Record<string, string | number> = {}): string {
  return ui.esc(ui.t(key, { ...p, [name]: '\u0000' })).replace('\u0000', ui.own(value));
}
export const rate = (c: Count | undefined, parcels: number | undefined) => (typeof c === 'number' && parcels && parcels >= 100 ? (c / parcels) * 1000 : undefined);
/**
 * Dollars are written the way the sale record and the permit write them: "$85,000", "$1.2 million". This is the
 * same rule that keeps every digit Western (DECISIONS 2026-09-20) — and it is also the only formatting that is
 * right in all four languages here: `Intl` renders USD in Arabic as "85,000 US$" with the sign at the far end,
 * and in Bengali it cuts the compact word short ("85 হা$"). Counts, which carry no unit, still follow the
 * language: `num()` below uses `locale()`.
 */
const MONEY_LOCALE = 'en-US';
/** The dollar sign leads the amount, or we fall back to the language that writes it that way. Nothing changes for
 *  a language whose own rules already put it there, so English and Spanish are untouched. */
const dollars = (n: number, o: Intl.NumberFormatOptions) => {
  const opts = { style: 'currency', currency: 'USD', ...o } as const;
  const mine = new Intl.NumberFormat(locale(), opts).format(n);
  return mine.startsWith('$') ? mine : new Intl.NumberFormat(MONEY_LOCALE, opts).format(n);
};
const money = (n: number) => dollars(n, { maximumFractionDigits: 0 });
const bigMoney = (n: number) => dollars(n, { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });

/** One row of the index: the neighborhood's name and nothing else. No count, no number, nothing that could be
 *  read as a score — an index row carries no indicator at all, so the list cannot become a league table by the
 *  back door (docs/13, rule 1). The name is the City's, marked English so it is read in the right voice. */
const indexRow = (ui: Ui, n: Hood, pick = '') =>
  `<li><button class="row${n.id === pick ? ' on' : ''}"${n.id === pick ? ' aria-current="true"' : ''} ${ui.go({ v: 'hood', id: n.id })}><span class="rowtx"><strong>${ui.own(n.name)}</strong></span></button></li>`;

/** The groups of the index list, in the order asked for: A to Z, or by council district. `matchHoods` narrows
 *  the list by what has been typed and leaves the order alone. Drawn on its own so typing a letter can replace
 *  this one piece of the screen instead of the whole page: the keyboard stays up and nothing jumps. */
export function hoodRows(d: Indicators, ui: Ui, o: { order: HoodOrder; query: string; near?: { lat: number; lon: number } | null; pick?: string }): string {
  const found = matchHoods(d.neighborhoods, o.query);
  if (!found.length) return `<p class="empty">${ui.esc(ui.t('hood.find_none'))}</p>`;
  const head = (key: string | number) =>
    o.order === 'district' ? (key === '' ? ui.t('hood.no_district') : ui.t('hood.district', { n: key })) : key === '' ? ui.t('hood.letter_other') : String(key);
  return groupHoods(found, o.order, o.near).map((g) => {
    // Nearest first has one group and no heading: see `groupHoods`.
    const h = o.order === 'near' ? '' : `<h3 class="sub">${ui.esc(head(g.key))}</h3>`;
    return `${h}<ul class="rows">${g.items.map((n) => indexRow(ui, n, o.pick ?? '')).join('')}</ul>`;
  }).join('');
}

/**
 * The Neighborhoods tab's own screen (docs/05): what these pages are, then the fastest way to the person's own
 * neighborhood, then all 205 by name.
 *
 * `mine` is the answer the device worked out from a location or a typed ZIP — it is handed in already decided
 * (hoodfind.ts), is used to draw one row, and is kept nowhere. `locHtml` is the ordinary location chip, the
 * same one every list screen uses, so there is no second way of asking for a location anywhere in the app.
 */
/**
 * The Areas tab's **list**: on a phone it is the whole screen behind the Map/List switch; on a laptop it is the
 * right-hand column beside the map, and then it is drawn with `view: 'column'` — no heading of its own to
 * repeat the page's, and no switch, because a laptop is shown both things at once (main.ts, `areasTab`).
 *
 * What the list is FOR has not changed: what these pages are and that we do not rank neighborhoods · "Your
 * area" · the ordinary location chip · find one by name · all 205, Nearest first / A to Z / by council district
 * and never by any number (docs/13, rule 1) · the other three cities as rows · where the numbers come from.
 *
 * `mine` is the answer the device worked out from a location or a typed ZIP (hoodfind.ts): handed in already
 * decided, used to draw one row, and kept nowhere. `pick` is the area whose page was last opened — the row for
 * it is marked `aria-current` and scrolled to, which is the list half of the one selection the tab keeps.
 */
export function hoodIndex(d: Indicators, ui: Ui, o: { order: HoodOrder; query: string; located: boolean; zip: string; mine: Hood | null; locHtml: string; view: 'map' | 'list' | 'column'; mapHtml: string; switchHtml?: string; pick?: string; near?: { lat: number; lon: number } | null }): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const src = d.sources.neighborhoods;
  const mine = !o.located
    ? ''
    : o.mine
      ? `<ul class="rows"><li><button class="row" ${ui.go({ v: 'hood', id: o.mine.id })}><span class="rowic">${ui.icon('district')}</span><span class="rowtx"><strong>${ui.own(o.mine.name)}</strong>${o.mine.district ? `<small>${T('hood.district', { n: o.mine.district })}</small>` : ''}</span></button></li></ul>
        ${o.zip ? `<p class="foot">${T('hood.mine_zip', { zip: o.zip })}</p>` : ''}<p class="foot">${T('hood.mine_note')}</p>
        <p class="loc"><button class="chip" data-loc="off">${T(o.zip ? 'loc.zip_off' : 'loc.off')}</button></p>`
      : `<p class="banner plain">${T('hood.mine_outside')}</p><div class="stackbtns"><button class="btn ghost" ${ui.go({ v: 'tab', tab: 'map' })}>${T('hood.mine_map')}</button></div>`;
  const radio = (value: HoodOrder, label: string) =>
    `<label class="pick"><input type="radio" name="hoodorder" value="${value}" data-hoodorder="${value}"${o.order === value ? ' checked' : ''}><span>${T(label)}</span></label>`;
  const list = `<h2>${T('hood.list_head')}</h2><label class="searchbox">${T('hood.find_label')}<input id="hoodq" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="40" value="${ui.esc(o.query)}" aria-describedby="hoodsay"></label>
    <p class="vh" id="hoodsay" role="status" aria-live="polite"></p>
    <fieldset class="hoodorder"><legend>${T('hood.group_label')}</legend><div class="kinds">${o.near ? radio('near', 'hood.order_near') : ''}${radio('abc', 'hood.group_abc')}${radio('district', 'hood.group_district')}</div></fieldset>
    <div id="hoodlist">${hoodRows(d, ui, o)}</div>`;
  // The other three cities, as rows. They are on the map as outlines too, but a list has to name them: a person
  // who reads lists rather than pictures must reach a Hamtramck page by the same number of taps as a Detroiter
  // reaches theirs, and "it is on the map" is not an answer to that.
  const cities = (d.cities ?? []).length
    ? `<h2>${T('city.list_head')}</h2><p class="foot">${T('city.list_note')}</p>
      <ul class="rows">${(d.cities ?? []).map((c) => `<li><button class="row" ${ui.go({ v: 'hood', id: c.id })}><span class="rowic">${ui.icon('district')}</span><span class="rowtx"><strong>${ui.own(c.name)}</strong></span></button></li>`).join('')}</ul>`
    : `<p class="foot">${T('hood.only_detroit')}</p>`;
  const body = `<p class="lede">${T('hood.index_intro')}</p>
    <h2>${T('hood.mine_head')}</h2>${mine}${o.locHtml}
    ${list}
    ${cities}
    <p class="foot">${T('hood.index_sources')} ${ui.link(src.url, src.name)} <small>${T('hood.updated', { date: ui.date(src.last_edited) })}</small></p>
    <p class="foot">${T('hood.describe')}</p>`;
  // The column beside the map on a laptop: no `<main>`, no `<h1>`, no switch — the page around it has all three.
  if (o.view === 'column') return `<div class="arealist">${body}</div>`;
  return `<main><h1 class="page" tabindex="-1">${T('hood.title')}</h1>${o.switchHtml ?? ''}${body}</main>`;
}

/** Alphabetical inside each council district. Never sorted by a number: no league tables (rule 1). */
export function hoodList(d: Indicators, ui: Ui, lens?: string): string {
  const list = d.neighborhoods.filter((n) => lens !== 'jlg' || n.jlg_study_area).sort((a, b) => a.name.localeCompare(b.name));
  // A neighborhood's name is the City's, never ours: marked English so it is read in the right voice and, in
  // Arabic, so a name like "Crary/St Marys" or "Evergreen Lahser 7/8" stays in one piece.
  const row = (n: Hood) => `<li><button class="row" ${ui.go({ v: 'hood', id: n.id })}><span class="rowtx"><strong>${ui.own(n.name)}</strong></span></button></li>`;
  const groups = [1, 2, 3, 4, 5, 6, 7, null].map((dist) => ({ dist, items: list.filter((n) => n.district === dist) })).filter((g) => g.items.length);
  return `<main><p class="lede">${ui.esc(ui.t('hood.list_lede'))}</p><p class="foot">${ui.esc(ui.t('hood.describe'))}</p>
    ${lens === 'jlg' ? `<p class="foot">${ui.esc(ui.t('hood.lens_jlg_note', { count: list.length }))}</p>` : ''}
    ${groups.map((g) => `<h2>${ui.esc(g.dist ? ui.t('hood.district', { n: g.dist }) : ui.t('hood.no_district'))}</h2><ul class="rows">${g.items.map(row).join('')}</ul>`).join('')}</main>`;
}

function yearsTable(h: Hood, d: Indicators, ui: Ui, o: { value: (y: YearStats) => number | undefined; cityValue?: (y: YearStats) => number | undefined; count?: (y: YearStats) => Count | undefined; fmt: (n: number) => string; head: string; countHead: string; missing: string; caption: string }): string {
  const years = Object.keys(d.city).sort(), max = Math.max(1, ...years.map((y) => o.value(h.years[y] ?? {}) ?? 0));
  const count = (c: Count | undefined) => (c === undefined ? ui.t('hood.none_recorded') : String(c));
  return `<table class="years"><caption>${ui.esc(o.caption)}</caption><thead><tr><th scope="col">${ui.esc(ui.t('hood.year'))}</th><th scope="col">${ui.esc(o.head)}</th>${o.count ? `<th scope="col">${ui.esc(o.countHead)}</th>` : ''}<th scope="col">${ui.esc(ui.t('hood.city'))}</th></tr></thead><tbody>
    ${years.map((y) => { const v = o.value(h.years[y] ?? {}), cv = (o.cityValue ?? o.value)(d.city[y] ?? {});
      return `<tr><th scope="row">${Number(y) === d.partial_year ? ui.esc(ui.t('hood.so_far', { year: y })) : y}</th><td>${v === undefined ? `<small>${ui.esc(o.missing)}</small>` : `<span class="bar" aria-hidden="true" style="width:${Math.max(3, Math.round((v / max) * 100))}%"></span><span>${ui.esc(o.fmt(v))}</span>`}</td>${o.count ? `<td>${ui.esc(count(o.count(h.years[y] ?? {})))}</td>` : ''}<td>${cv === undefined ? '' : ui.esc(o.fmt(cv))}</td></tr>`; }).join('')}</tbody></table>`;
}

// ---- table or chart (2026-09-22) --------------------------------------------------------------------------------

/** Which way the year panels are drawn. **Table is the default**, and the table is in the page either way. */
export type HoodView = 'table' | 'chart';
/** Whatever was stored, read safely: only the exact word "chart" is chart; anything else is a table. */
export const hoodView = (stored: unknown): HoodView => (stored === 'chart' ? 'chart' : 'table');
export async function loadHoodView(): Promise<HoodView> { return hoodView(await idbGet<unknown>('hoodview')); }
export async function saveHoodView(v: HoodView): Promise<HoodView> { const next = hoodView(v); await idbSet('hoodview', next); return next; }

/** The years of one number, in the table's own order (oldest first, most recent last), ready for `chartModel`. */
export function seriesOf(h: Hood, d: Indicators, count: (y: YearStats) => number | undefined): ChartPoint[] {
  return Object.keys(d.city).sort().map((y) => ({ year: y, count: count(h.years[y] ?? {}), partial: Number(y) === d.partial_year }));
}

/**
 * Table | Chart: two real radio buttons in a named group, so the arrow keys already move between them and a screen
 * reader says "radio button, 1 of 2". One choice covers every panel on the page (`main.ts` keeps it, in the same
 * place as the map layer choices — on this device, never sent), and the cursor stays where it was after switching.
 */
function viewPick(ui: Ui, id: string, view: HoodView): string {
  const radio = (v: HoodView) =>
    `<label class="pick"><input type="radio" id="hv-${id}-${v}" name="hoodview-${id}" value="${v}" data-hoodview="${v}"${view === v ? ' checked' : ''}><span>${ui.esc(ui.t('hood.view_' + v))}</span></label>`;
  return `<div class="viewpick" role="radiogroup" aria-label="${ui.esc(ui.t('hood.view_label'))}">${radio('table')}${radio('chart')}</div>`;
}

/**
 * One group of year panels, drawn the way this device asked for.
 *
 * Whichever way that is, **the tables are in the page**: in chart view they are only visually hidden, and the
 * picture points at them with `aria-describedby`, so a screen reader reaches every number without having to find
 * the control first. The picture adds nothing the table does not already say.
 *
 * The control appears only when there is something a chart could show — three years with something in them and at
 * least one number to draw (`chartable`). A neighborhood with two years of sales keeps its table and is offered
 * nothing else.
 */
function yearGroup(ui: Ui, o: { id: string; view: HoodView; name: string; tables: string; series: ChartSeries[]; off: ReadonlySet<string>; pick?: boolean }): string {
  const drawable = o.series.filter((s) => chartable(s.points));
  if (!drawable.length) return o.tables;
  const tables = `<div class="yeartables${o.view === 'chart' ? ' vh' : ''}" id="${o.id}-rows">${o.tables}</div>`;
  // A panel with several charts draws ONE control above them all (`pick: false` here, `viewPick` once there).
  const pick = o.pick === false ? '' : viewPick(ui, o.id, o.view);
  if (o.view !== 'chart') return `${pick}${tables}`;

  // One chart, one pair of axes, and only the series that are switched on — so the axis follows what is on the
  // screen. `shownSeries` refuses to leave nothing: the last one on stays on.
  // The set is keyed "<panel>:<series>", because two panels may name a series the same way.
  const offHere = new Set(drawable.filter((sx) => o.off.has(`${o.id}:${sx.key}`)).map((sx) => sx.key));
  const shown = shownSeries(drawable, offHere);
  const m = chartModel(shown);
  const years = drawable[0]!.points.map((p) => p.year);
  const lastOn = shown.length === 1;
  /** One key entry. With two series it is a real checkbox; with one there is nothing to choose. */
  const toggle = (sx: ChartSeries) => {
    const on = shown.some((x) => x.key === sx.key), only = on && lastOn;
    return `<label class="keybox"><input type="checkbox" data-hoodseries="${o.id}:${sx.key}"${on ? ' checked' : ''}${only ? ' disabled aria-describedby="' + o.id + '-only"' : ''}><span class="sw t${sx.tone}" aria-hidden="true"></span>${ui.esc(sx.label)}</label>`;
  };
  const key = drawable.length > 1
    ? `<fieldset class="chartkey"><legend>${ui.esc(ui.t('hood.chart_show'))}</legend>${drawable.map(toggle).join('')}</fieldset>
       ${lastOn ? `<p class="foot" id="${o.id}-only">${ui.esc(ui.t('hood.chart_only_one'))}</p>` : ''}`
    : '';
  return `${pick}
    <figure class="hoodchart" role="group" aria-label="${ui.esc(ui.t(o.name, { from: years[0] ?? '', to: years[years.length - 1] ?? '' }))}" aria-describedby="${o.id}-sum ${o.id}-rows">
      ${chartSvg(ui, m)}${key}
      <figcaption class="foot" id="${o.id}-sum">${ui.esc(chartSummary(ui, m))}</figcaption>
    </figure>${tables}`;
}

/**
 * One chart's worth of a panel: a plain-language lede saying what the number means and where it comes from, then
 * the table or the chart. When the City has published nothing at all for this neighborhood in this series — no
 * year with a number — the panel says exactly that, in one sentence, instead of a table of "none recorded".
 */
function condGroup(ui: Ui, h: Hood, o: { id: string; view: HoodView; name: string; lede: string; tables: string; series: ChartSeries[]; off: ReadonlySet<string>; after?: string }): string {
  const lede = `<p>${ui.esc(ui.t(o.lede))}</p>`;
  if (!o.series.some((sx) => anyValue(sx.points))) return `${lede}<p class="empty">${ui.esc(ui.t('hood.cond_none', { name: h.name }))}</p>`;
  return `${lede}${yearGroup(ui, { ...o, pick: false })}${o.after ?? ''}`;
}

/** The latest year with a number in any of the given fields: the year the "at a glance" row names. */
export function latestYear(h: Hood, d: Indicators, fields: (keyof YearStats)[]): string | null {
  const years = Object.keys(d.city).sort().reverse();
  return years.find((y) => fields.some((f) => typeof h.years[y]?.[f] === 'number')) ?? null;
}

/**
 * "At a glance": the latest year's figure for each Conditions series, and today's two numbers, in one compact row
 * of stat tiles above the charts. Each tile is a `<dt>`/`<dd>` pair, so a screen reader hears label then value.
 * Nothing here is a rate or a comparison: one number per series, the one a reader came for.
 */
function glance(ui: Ui, h: Hood, d: Indicators): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const y = latestYear(h, d, ['blight', 'demolitions', 'issues', 'fires']);
  const num = (n: number | undefined, f: (n: number) => string = String) => (n === undefined ? T('hood.none_recorded') : ui.esc(f(n)));
  const tile = (label: string, value: string, note = '') => `<div class="tile"><dt>${label}${note ? ` <small>${note}</small>` : ''}</dt><dd>${value}</dd></div>`;
  const ys = y ? h.years[y] ?? {} : {};
  const yearLabel = y ? (Number(y) === d.partial_year ? ui.t('hood.so_far', { year: y }) : y) : '';
  const rows = [
    ...(y ? [
      tile(T('hood.blight_tickets'), num(ys.blight), ui.esc(yearLabel)),
      tile(T('hood.demolitions'), num(ys.demolitions), ui.esc(yearLabel)),
      tile(T('hood.issues_reported'), num(ys.issues), ui.esc(yearLabel)),
      tile(T('hood.issue_days'), num(ys.issue_days, (n) => ui.t('hood.days', { n })), ui.esc(yearLabel)),
      ...(d.sources.fires ? [tile(T('hood.fires_short'), num(ys.fires), ui.esc(yearLabel))] : []),
    ] : []),
    ...(d.sources.vacant ? [tile(T('hood.vacant_short'), num(h.now?.vacant_reg), T('hood.glance_today'))] : []),
    ...(d.sources.pavement ? [tile(T('hood.roads_poor_short'), h.now?.roads?.poor_pct === undefined ? T(h.now?.roads ? 'hood.roads_few' : 'hood.roads_none') : T('hood.roads_pct', { pct: h.now.roads.poor_pct, miles: (h.now.roads.miles ?? 0).toFixed(1) }), T('hood.glance_today'))] : []),
  ];
  if (!rows.length) return '';
  return `<h3 class="sub">${T('hood.glance')}</h3><dl class="glance">${rows.join('')}</dl>`;
}

/**
 * Conditions (docs/13): what the City recorded here, grouped into charts that share a unit and a meaning —
 *
 *   Blight tickets and buildings torn down   two COUNTS on one axis (both are things the City did to buildings)
 *   Problems reported                        a COUNT
 *   Time to close                            DAYS — its own small chart, because days on a count axis is the
 *                                            dual-axis trick with one axis; the table carries both columns
 *   Building fires                           a COUNT, on its own: a fire is not a ticket
 *
 * — each with a one-sentence lede saying what the number is and where it comes from, ONE Table | Chart control
 * for the whole panel, and an "at a glance" row of the latest year's figures above the charts. Empty buildings
 * registered and street condition are today's numbers, not years, so they are tiles in that row and rows below,
 * never a chart. Years run oldest to newest everywhere, so the most recent year is at the end of every table and
 * every axis.
 */
export function conditionsPanel(h: Hood, d: Indicators, ui: Ui, view: HoodView, off: ReadonlySet<string>): string {
  if (!d.sources.blight) return '';
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const series = (key: string, tone: 'a' | 'b', label: string, count: (y: YearStats) => number | undefined, unit: 'count' | 'days' = 'count'): ChartSeries =>
    ({ key, tone, label: ui.t(label), points: seriesOf(h, d, count), unit });
  const row = (label: string, value: string, city = '') => `<ul class="hours"><li><span>${label}</span><span>${value}${city ? ` <small>${city}</small>` : ''}</span></li></ul>`;
  const fmtRate = (r: number) => r.toFixed(r < 10 ? 1 : 0);
  const per1000 = (c: Count | undefined) => { if (c === undefined) return T('hood.none_recorded'); const r = rate(c, h.parcels); return r === undefined ? String(c) : T('hood.per_1000', { count: c, rate: fmtRate(r) }); };
  const cityPer1000 = (c: Count | undefined) => { const r = rate(c, d.city_parcels); return r === undefined ? '' : T('hood.city_per_1000', { rate: fmtRate(r) }); };
  const roads = h.now?.roads, cityRoads = d.city_now?.roads;
  const roadsValue = !roads ? T('hood.roads_none') : roads.poor_pct === undefined ? T('hood.roads_few') : T('hood.roads_pct', { pct: roads.poor_pct, miles: (roads.miles ?? 0).toFixed(1) });
  const blight = series('blight', 'a', 'hood.blight_tickets', (y) => y.blight), demo = series('demo', 'b', 'hood.demolitions', (y) => y.demolitions);
  const issues = series('issues', 'a', 'hood.issues_reported', (y) => y.issues), days = series('days', 'a', 'hood.issue_days', (y) => y.issue_days, 'days');
  const fires = series('fires', 'a', 'hood.fires_short', (y) => y.fires);
  const issuesTable = yearsTable(h, d, ui, { value: (y) => y.issue_days, count: (y) => y.issues, fmt: (n) => ui.t('hood.days', { n }), head: ui.t('hood.issue_days'), countHead: ui.t('hood.issues'), missing: ui.t('hood.none_recorded'), caption: ui.t('hood.issues_caption') });
  // One control for the panel, drawn only when at least one group has a chart to offer.
  const pick = [blight, demo, issues, days, ...(d.sources.fires ? [fires] : [])].some((sx) => chartable(sx.points)) ? viewPick(ui, 'cond', view) : '';
  return `<h2>${T('hood.cond_head')}</h2><div class="panel"><p>${T('hood.cond_lede')}</p>
    ${glance(ui, h, d)}
    ${pick}
    <h3 class="sub">${T('hood.cond_blight_head')}</h3>
    ${condGroup(ui, h, { id: 'cond', view, name: 'hood.chart_name_cond', lede: 'hood.cond_blight_lede', off, series: [blight, demo],
      tables: `${yearsTable(h, d, ui, { value: (y) => rate(y.blight, h.parcels), cityValue: (y) => rate(y.blight, d.city_parcels), count: (y) => y.blight, fmt: (n) => n.toFixed(0), head: ui.t('hood.blight_rate'), countHead: ui.t('hood.blight'), missing: ui.t('hood.none_recorded'), caption: ui.t('hood.blight_caption') })}
        ${yearsTable(h, d, ui, { value: (y) => y.demolitions, fmt: (n) => String(n), head: ui.t('hood.demolitions'), countHead: '', missing: ui.t('hood.none_recorded'), caption: ui.t('hood.demo_caption') })}`,
      after: `<p class="foot">${T('hood.blight_note')}</p>` })}
    <h3 class="sub">${T('hood.cond_issues_head')}</h3>
    ${condGroup(ui, h, { id: 'issues', view, name: 'hood.chart_name_issues', lede: 'hood.cond_issues_lede', off, series: [issues], tables: issuesTable })}
    <h3 class="sub">${T('hood.cond_days_head')}</h3>
    ${condGroup(ui, h, { id: 'days', view, name: 'hood.chart_name_days', lede: 'hood.cond_days_lede', off, series: [days],
      // The days table IS the problems table above (both columns are in it), so in table view nothing is repeated
      // and in chart view the picture points at that table.
      tables: view === 'chart' ? `<p class="foot">${T('hood.cond_days_table')}</p>` : '',
      after: `<p class="foot">${slot(ui, 'hood.issues_note', 'types', (d.issue_types ?? []).join(', '))}</p>` })}
    ${d.sources.fires ? `<h3 class="sub">${T('hood.cond_fires_head')}</h3>
    ${condGroup(ui, h, { id: 'fires', view, name: 'hood.chart_name_fires', lede: 'hood.cond_fires_lede', off, series: [fires],
      tables: yearsTable(h, d, ui, { value: (y) => rate(y.fires, h.parcels), cityValue: (y) => rate(y.fires, d.city_parcels), count: (y) => y.fires, fmt: (n) => n.toFixed(1), head: ui.t('hood.blight_rate'), countHead: ui.t('hood.fires'), missing: ui.t('hood.none_recorded'), caption: ui.t('hood.fire_caption') }),
      after: `<p class="foot">${T('hood.fire_note')}</p><details class="foot"><summary>${T('hood.fire_types')}</summary><p>${ui.own((d.fire_types ?? []).join('; '))}</p></details>` })}` : ''}
    <p class="foot">${T('hood.small_numbers')}</p>
    ${d.sources.vacant ? `${row(T('hood.vacant', { from: ui.date(d.vacant_period?.[0] ?? ''), to: ui.date(d.vacant_period?.[1] ?? '') }), per1000(h.now?.vacant_reg), cityPer1000(d.city_now?.vacant_reg))}<p class="foot">${T('hood.vacant_note')}</p>` : ''}
    ${d.sources.pavement ? `${row(T('hood.roads', { from: d.roads_years?.[0] ?? '', to: d.roads_years?.[1] ?? '' }), roadsValue, cityRoads?.poor_pct !== undefined ? T('hood.city_pct', { pct: cityRoads.poor_pct }) : '')}<p class="foot">${T('hood.roads_note')}</p>` : ''}</div>`;
}

/**
 * The crashes by year, as a table (walking, biking, killed or badly hurt; the window total as the last row) and
 * as the same three-line chart every other year panel gets. Drawn only when the bundle carries the years.
 */
function crashYears(h: Hood, d: Indicators, ui: Ui, view: HoodView, off: ReadonlySet<string>, byYear: Record<string, CrashCounts> | undefined): string {
  if (!byYear || !d.crash_years) return '';
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const years = Object.keys(byYear).sort();
  const [from, to] = d.crash_years;
  const pt = (k: keyof CrashCounts): ChartPoint[] => years.map((y) => ({ year: y, count: byYear[y]?.[k], partial: false }));
  const series: ChartSeries[] = [
    { key: 'walk', tone: 'a', label: ui.t('hood.crash_walk_short'), points: pt('walk') },
    { key: 'bike', tone: 'b', label: ui.t('hood.crash_bike_short'), points: pt('bike') },
    { key: 'severe', tone: 'c', label: ui.t('hood.crash_severe_short'), points: pt('severe') },
  ];
  const cell = (c: number | undefined) => (c === undefined ? T('hood.none_recorded') : ui.esc(num(c)));
  const table = `<table class="years"><caption>${T('hood.crash_caption')}</caption><thead><tr><th scope="col">${T('hood.year')}</th><th scope="col">${T('hood.crash_walk_short')}</th><th scope="col">${T('hood.crash_bike_short')}</th><th scope="col">${T('hood.crash_severe_short')}</th></tr></thead><tbody>
    ${years.map((y) => `<tr><th scope="row">${y}</th><td>${cell(byYear[y]?.walk)}</td><td>${cell(byYear[y]?.bike)}</td><td>${cell(byYear[y]?.severe)}</td></tr>`).join('')}
    ${h.crashes ? `<tr><th scope="row">${T('hood.crash_total', { from, to })}</th><td>${cell(h.crashes.walk)}</td><td>${cell(h.crashes.bike)}</td><td>${cell(h.crashes.severe)}</td></tr>` : ''}</tbody></table>`;
  return `<p>${T('hood.crash_years_lede')}</p>${yearGroup(ui, { id: 'crash', view, name: 'hood.chart_name_crashes', off, series, tables: table })}`;
}


/** SEMCOG asks for this sentence wherever their data is reproduced, and it is theirs, so it stays in their
 *  words: the same English on an Arabic, Bengali or Spanish screen, marked `lang="en"` so a screen reader says
 *  it in an English voice (WCAG 3.1.2), never machine-translated. The year is the year of the crash layer we
 *  ship (data/ingested/crashes.json, `source.last_edited` 2025-10-08). */
export const SEMCOG_NOTICE = 'Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.';

/**
 * "Safe streets" (docs/13). Plain counts of crashes over the years the panel names, with the whole-city number
 * beside each one. No rate (no denominator we can defend), no ranking, no colour that reads as a score, no
 * comparison with another neighborhood, and nothing about who was at fault: these are counts of crashes on
 * streets, not a judgement of the people in them. Drawn only when the bundle carries the numbers.
 */
export function crashPanel(h: Hood, d: Indicators, ui: Ui, view: HoodView = 'table', off: ReadonlySet<string> = new Set()): string {
  if (!d.sources.crashes || !h.crashes || !d.crash_years) return '';
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const show = (c: Count | undefined) => (c === undefined ? T('hood.none_recorded') : ui.esc(num(c)));
  const city = (c: Count | undefined) => (typeof c === 'number' ? T('hood.crash_city', { count: num(c) }) : '');
  const line = (label: string, k: keyof CrashCounts) =>
    `<li><span>${label}</span><span>${show(h.crashes![k])}${city(d.city_crashes?.[k]) ? ` <small>${city(d.city_crashes?.[k])}</small>` : ''}</span></li>`;
  const [from, to] = d.crash_years;
  return `<h2>${T('hood.crash_head')}</h2><div class="panel"><p>${T('hood.crash_lede', { from, to })}</p>
    <ul class="hours">${line(T('hood.crash_walk'), 'walk')}${line(T('hood.crash_bike'), 'bike')}${line(T('hood.crash_severe'), 'severe')}</ul>
    ${crashYears(h, d, ui, view, off, h.crashes_by_year)}
    <p class="foot">${T('hood.crash_note')}</p>
    <p class="foot">${slot(ui, 'hood.crash_source', 'source', d.sources.crashes.name, { records: d.crash_records_from ?? '' })}</p>
    <p class="foot" lang="en">${SEMCOG_NOTICE}</p></div>`;
}

/**
 * One row of "From the middle of the neighborhood to the nearest listed…". It says a distance, and when the
 * numbers name the listing that distance was measured to, and this bundle still carries that listing, the row
 * opens it and says whose it is: "Free food — Capuchin Soup Kitchen · 0.6 mi". A distance you cannot act on was
 * the gap this closes.
 *
 * It falls back to the plain row it has always been in three cases: the numbers were built before the ids
 * existed (`nearest_id` missing); the id names a listing this bundle no longer has (a row archived since the
 * numbers were built); or the listing is one no public page may point at. The pipeline already refuses to pick
 * a sensitive or private row, so the last case should be impossible — it is checked again here because the
 * numbers and the listings are two files, and a page that linked a DV shelter would break a promise (docs/08).
 *
 * The name is the place's own words, so it is marked English inside a translated page, like every owner-written
 * name in the app. The button's accessible name is the whole fact — kind, place and distance — because "Food"
 * and "0.6 mi" in two separate spans is not a name a screen reader can act on (WCAG 2.4.4).
 */
export function nearestRow(h: Hood, ui: Ui, k: string): string {
  const T = (key: string, p?: Record<string, string | number>) => ui.esc(ui.t(key, p));
  const mi = h.help.nearest_miles[k], kind = 'hood.nearest.' + k;
  if (mi === null || mi === undefined) return `<li><span>${T(kind)}</span><span>${T('hood.nearest_none')}</span></li>`;
  const distance = ui.t('miles', { miles: mi.toFixed(1) });
  const plain = `<li><span>${T(kind)}</span><span>${ui.esc(distance)}</span></li>`;
  const id = h.help.nearest_id?.[k];
  const r = id ? ui.listing?.(id) ?? null : null;
  if (!r || isPrivate(r.category)) return plain;
  const label = ui.esc(ui.t('hood.nearest_open', { kind: ui.t(kind), name: r.name, distance }));
  return `<li class="golink"><button ${ui.go({ v: 'detail', id: r.id })} aria-label="${label}"><span>${T(kind)}</span><span class="goto">${ui.own(r.name)} · ${ui.esc(distance)}</span></button></li>`;
}

export function hoodPage(h: Hood, d: Indicators, ui: Ui, view: HoodView = 'table', off: ReadonlySet<string> = new Set()): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  /** A count series for the chart view: the same column the table already prints, by year. */
  const series = (key: string, tone: 'a' | 'b', label: string, count: (y: YearStats) => number | undefined): ChartSeries =>
    ({ key, tone, label: ui.t(label), points: seriesOf(h, d, count) });
  const near = (k: string) => nearestRow(h, ui, k);
  const cats = Object.entries(h.help.by).filter(([, n]) => n > 0);
  const src = (s: Source) => `<li>${ui.link(s.url, s.name)} <small>${T('hood.updated', { date: ui.date(s.last_edited) })}</small></li>`;
  const row = (label: string, value: string, city = '') => `<ul class="hours"><li><span>${label}</span><span>${value}${city ? ` <small>${city}</small>` : ''}</span></li></ul>`;
  const fmtRate = (r: number) => r.toFixed(r < 10 ? 1 : 0);
  /** A count as of today, with its rate per 1,000 lots when the base can be defended (rule 3). */
  const per1000 = (c: Count | undefined) => { if (c === undefined) return T('hood.none_recorded'); const r = rate(c, h.parcels); return r === undefined ? String(c) : T('hood.per_1000', { count: c, rate: fmtRate(r) }); };
  const cityPer1000 = (c: Count | undefined) => { const r = rate(c, d.city_parcels); return r === undefined ? '' : T('hood.city_per_1000', { rate: fmtRate(r) }); };
  // Which counting rule each count uses, said on the row (docs/13, "Counting rules"): a bus stop or a Bridge-card
  // store counts only inside the outline; a park or rec center counts inside or within half a mile.
  const place = (label: string, n: number, rule: 'inside' | 'near') => `<li><span>${label} <small>${T(rule === 'inside' ? 'hood.rule_inside' : 'hood.rule_near', { miles: d.near_miles })}</small></span><span>${n}</span></li>`;
  const nc = h.nearest_city, mi = (m: number | null) => (m === null ? T('hood.none_found') : T('miles', { miles: m.toFixed(1) }));
  return `<main><p class="org">${h.district ? T('hood.district', { n: h.district }) : ''}${h.jlg_study_area ? ` · ${T('hood.in_jlg')}` : ''}</p>
    <p class="banner plain">${T('hood.describe')}</p>${ui.map(h)}

    <h2>${T('hood.help_head')}</h2>
    ${h.help.coverage_checked ? '' : `<div class="panel"><p>${T('hood.thin')}</p><div class="stackbtns"><button class="btn ghost" ${ui.go({ v: 'add' })}>${T('add.title')}</button></div></div>`}
    <p>${T(h.help.total === 1 ? 'hood.help_count_one' : 'hood.help_count', { count: h.help.total, miles: d.near_miles })}</p>
    ${cats.length ? `<ul class="hours">${cats.map(([c, n]) => `<li><span>${T('add.cat.' + (c === 'shelter' ? 'shelter.emergency' : c))}</span><span>${n}</span></li>`).join('')}</ul>` : ''}
    ${h.help.none_listed_yet.length ? `<p class="foot">${T('hood.none_listed', { kinds: h.help.none_listed_yet.map((c) => ui.t('hood.kind.' + c)).join(', ') })}</p>` : ''}
    <h3 class="sub">${T('hood.nearest_head')}</h3><ul class="hours">${['food', 'clinic', 'narcan', 'indoors'].map(near).join('')}</ul>
    <h3 class="sub">${T('hood.places_head')}</h3><ul class="hours">${place(T('hood.parks'), h.places.parks, 'near')}${place(T('hood.rec_centers'), h.places.rec_centers, 'near')}${place(T('hood.greenway_open'), h.places.greenway_open, 'near')}${h.places.snap_stores !== undefined ? place(T('hood.snap_stores'), h.places.snap_stores, 'inside') : ''}${h.places.bus_stops !== undefined ? place(T('hood.bus_stops'), h.places.bus_stops, 'inside') : ''}</ul>
    <p class="foot">${T('hood.places_note', { miles: d.near_miles })}</p>
    ${nc ? `<h3 class="sub">${T('hood.city_near_head')}</h3><ul class="hours"><li><span>${T('hood.near.snap')}</span><span>${mi(nc.snap)}</span></li><li><span>${T('hood.near.grocery')}</span><span>${mi(nc.grocery)}</span></li><li><span>${T('hood.near.bus')}</span><span>${mi(nc.bus)}</span></li></ul>
    <p class="foot">${T('hood.snap_note')}</p>` : ''}

    <h2>${T('hood.money_head')}</h2><div class="panel"><p>${T('hood.money_lede')}</p>
      ${yearGroup(ui, { id: 'money', view, name: 'hood.chart_name_money',
        off, series: [series('sales', 'a', 'hood.sales', (y) => y.sales), series('permits', 'b', 'hood.permits', (y) => y.permits)],
        tables: `${yearsTable(h, d, ui, { value: (y) => y.median_price, count: (y) => y.sales, fmt: money, head: ui.t('hood.median'), countHead: ui.t('hood.sales'), missing: ui.t('hood.too_few'), caption: ui.t('hood.sales_caption') })}
      ${yearsTable(h, d, ui, { value: (y) => y.permit_cost, count: (y) => y.permits, fmt: bigMoney, head: ui.t('hood.permit_cost'), countHead: ui.t('hood.permits'), missing: ui.t('hood.none_recorded'), caption: ui.t('hood.permits_caption') })}` })}
      <p class="foot">${T('hood.money_note')}</p>
      <p class="foot">${T('hood.small_numbers')}</p>
      ${view === 'chart' ? `<p class="foot">${T('hood.chart_money_note')}</p>` : ''}
      ${d.sources.rentals ? `${row(T('hood.rentals'), per1000(h.now?.rental_certs), cityPer1000(d.city_now?.rental_certs))}<p class="foot">${T('hood.rentals_note')}</p>` : ''}</div>

    ${conditionsPanel(h, d, ui, view, off)}

    ${crashPanel(h, d, ui, view, off)}

    <h2>${T('hood.sources_head')}</h2><ul class="srcs">${[d.sources.sales, d.sources.permits, d.sources.rentals, d.sources.blight, d.sources.demolitions, d.sources.issues, d.sources.fires, d.sources.vacant, d.sources.pavement, d.sources.parcels, d.sources.snap, d.sources.bus_stops, d.sources.crashes, d.sources.neighborhoods].filter((x): x is Source => !!x).map(src).join('')}<li>${T('hood.source_ours')}</li></ul>
    <p class="foot">${T('hood.left_out')}</p></main>`;
}

// ---- city pages (docs/13, "The four cities"; DECISIONS 2026-09-22) ----------------------------------------
//
// Hamtramck, Highland Park and Dearborn publish nothing per neighborhood — none of them runs an open-data
// portal — so their page is the whole city, built from regional and federal sources that cover all four cities
// with one method. Detroit gets a city page too, so the Areas layer has somewhere to send a tap inside Detroit
// that is not already on a neighborhood.
//
// The rules this function keeps:
//   * It draws a panel ONLY if `h.panels` lists it. A number that is in the data but not in the allow-list is
//     not drawn; a panel in the allow-list with no number is a bug the tests catch, not a blank box.
//   * Every panel prints its OWN source, with its own date, and its own required notice. Nothing inherits.
//   * `missing` is said in one plain sentence. Absent, never zero, never an empty chart.
//   * No number from another city appears anywhere. There is no cross-city comparison on this page at all.

/** The allow-list, in the order the page draws them. A key not in here can never be drawn. */
export const CITY_PANELS = ['help', 'parks', 'crashes', 'roads', 'vacancy', 'permits'] as const;

/** The source line for one panel: the owner, when it was last edited, whose records they are, and the notice
 *  that owner requires. The notice is the owner's own sentence, so it stays in their words and their language. */
function panelSource(h: Area, d: Indicators, ui: Ui, panel: string): string {
  const s = d.area_sources?.[h.sources[panel] ?? ''];
  if (!s) return '';
  return `<p class="foot">${ui.link(s.url, s.name)} <small>${ui.esc(ui.t('hood.updated', { date: ui.date(s.last_edited) }))}</small></p>
    ${s.records_from ? `<p class="foot">${slot(ui, 'city.records_from', 'who', s.records_from)}</p>` : ''}
    ${s.notice ? `<p class="foot" lang="en">${ui.esc(s.notice)}</p>` : ''}`;
}

/** A city's crash panel: the same counts and the same words as a neighborhood's, with this area's own source. */
function cityCrashPanel(h: Area, d: Indicators, ui: Ui, view: HoodView, off: ReadonlySet<string>): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const show = (c: Count | undefined) => (c === undefined ? T('hood.none_recorded') : ui.esc(num(c)));
  const line = (label: string, k: keyof CrashCounts) => `<li><span>${label}</span><span>${show(h.crashes?.[k])}</span></li>`;
  const [from, to] = d.crash_years ?? ['', ''];
  return `<h2>${T('hood.crash_head')}</h2><div class="panel"><p>${T('hood.crash_lede', { from, to })}</p>
    <ul class="hours">${line(T('hood.crash_walk'), 'walk')}${line(T('hood.crash_bike'), 'bike')}${line(T('hood.crash_severe'), 'severe')}</ul>
    ${crashYears(h, d, ui, view, off, h.crashes_by_year)}
    <p class="foot">${T('hood.crash_note')}</p>${panelSource(h, d, ui, 'crashes')}</div>`;
}

/** New homes permitted, by year. A plain table, and a chart when there are three years to draw. */
function permitPanel(h: Area, d: Indicators, ui: Ui, view: HoodView, off: ReadonlySet<string>): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const rows = h.permits_by_year ?? [];
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const max = Math.max(1, ...rows.map((r) => r.units));
  const table = `<table class="years"><caption>${T('city.permits_caption')}</caption><thead><tr><th scope="col">${T('hood.year')}</th><th scope="col">${T('city.permits_units')}</th><th scope="col">${T('city.permits_buildings')}</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><th scope="row">${r.year}</th><td><span class="bar" aria-hidden="true" style="width:${Math.max(3, Math.round((r.units / max) * 100))}%"></span><span>${ui.esc(num(r.units))}</span></td><td>${ui.esc(num(r.buildings))}</td></tr>`).join('')}</tbody></table>`;
  // A year the city did not report in full is named, with the number of months it did report: the Census Bureau
  // estimates the rest, and a page that prints the number has to say so rather than pass it off as a count.
  const partial = rows.filter((r) => r.months_reported < 12)
    .map((r) => `<p class="foot">${T('city.permits_partial', { year: r.year, city: h.name, months: r.months_reported })}</p>`).join('');
  const series: ChartSeries[] = [{ key: 'permits', tone: 'a', label: ui.t('city.permits_units'), points: rows.map((r) => ({ year: String(r.year), count: r.units, partial: r.months_reported < 12 })) }];
  return `<h2>${T('city.permits_head')}</h2><div class="panel"><p>${T('city.permits_lede', { city: h.name })}</p>
    ${yearGroup(ui, { id: 'permits', view, name: 'city.chart_name_permits', off, series, tables: table })}
    <p class="foot">${T('city.permits_note')}</p>${partial}${panelSource(h, d, ui, 'permits')}</div>`;
}

/**
 * One city page. Same components as a neighborhood page; the panels are whatever this area's allow-list says,
 * in the fixed order of `CITY_PANELS`, and nothing else.
 */
export function cityPage(h: Area, d: Indicators, ui: Ui, view: HoodView = 'table', off: ReadonlySet<string> = new Set()): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const on = (panel: string) => h.panels.includes(panel);
  const cats = Object.entries(h.help.by).filter(([, n]) => n > 0);
  const detroit = (d.cities ?? []).find((c) => c.id === h.id)?.children === 'neighborhood';
  const notPublished = h.missing.filter((m) => m.why === 'not_published').map((m) => ui.t('city.missing.' + m.panel));
  const noneRecorded = h.missing.filter((m) => m.why === 'none_recorded');
  const years = d.permit_years ?? [];

  const help = `<h2>${T('hood.help_head')}</h2>
    <p>${T(h.help.total === 1 ? 'city.help_count_one' : h.help.total === 0 ? 'city.help_none' : 'city.help_count', { count: h.help.total, city: h.name })}</p>
    ${cats.length ? `<ul class="hours">${cats.map(([c, n]) => `<li><span>${T('add.cat.' + (c === 'shelter' ? 'shelter.emergency' : c))}</span><span>${ui.esc(num(n))}</span></li>`).join('')}</ul>` : ''}
    ${h.help.none_listed_yet.length ? `<p class="foot">${T('hood.none_listed', { kinds: h.help.none_listed_yet.map((c) => ui.t('hood.kind.' + c)).join(', ') })}</p>` : ''}
    <div class="panel"><p>${T('hood.thin')}</p><div class="stackbtns"><button class="btn ghost" ${ui.go({ v: 'add' })}>${T('add.title')}</button></div></div>
    <h3 class="sub">${T('city.nearest_head')}</h3><ul class="hours">${['food', 'clinic', 'narcan', 'indoors'].map((k) => nearestRow(h, ui, k)).join('')}</ul>
    <p class="foot">${T('city.nearest_note')}</p>
    <p class="foot">${T('hood.source_ours')}</p>`;

  const parks = `<h2>${T('city.parks_head')}</h2><div class="panel">
    <ul class="hours"><li><span>${T('city.parks_count')}</span><span>${ui.esc(num(h.places.parks))}</span></li>${h.park_acres !== undefined ? `<li><span>${T('city.parks_acres')}</span><span>${ui.esc(num(h.park_acres))}</span></li>` : ''}</ul>
    <p class="foot">${T(detroit ? 'city.parks_note_detroit' : 'city.parks_note_semcog')}</p>${panelSource(h, d, ui, 'parks')}</div>`;

  const b = h.roads_bands;
  const roads = !b ? '' : `<h2>${T('city.roads_head')}</h2><div class="panel"><p>${T('city.roads_lede', { city: h.name, year: d.pavement_year ?? '' })}</p>
    <ul class="hours">${([['good', b.good_pct], ['fair', b.fair_pct], ['poor', b.poor_pct]] as const).map(([k, pct]) => `<li><span>${T('city.roads_' + k)}</span><span>${T('city.roads_pct', { pct })}</span></li>`).join('')}</ul>
    <p class="foot">${T('city.roads_miles', { miles: b.miles.toFixed(1) })}</p>
    <p class="foot">${T('city.roads_note')}</p>${panelSource(h, d, ui, 'roads')}</div>`;

  const v = h.vacancy;
  const vacancy = !v ? '' : `<h2>${T('city.vacancy_head')}</h2><div class="panel">
    <p>${T('city.vacancy_lede', { city: h.name, vacant: num(v.vacant), units: num(v.housing_units) })}</p>
    <ul class="hours"><li><span>${T('city.vacancy_share')}</span><span>${T('city.vacancy_pct', { pct: v.pct })}</span></li></ul>
    <p class="foot">${T('city.vacancy_note')}</p>${panelSource(h, d, ui, 'vacancy')}</div>`;

  const drawn: Record<string, string> = { help, parks, crashes: cityCrashPanel(h, d, ui, view, off), roads, vacancy, permits: permitPanel(h, d, ui, view, off) };
  const sources = [...new Set(Object.values(h.sources))].map((k) => d.area_sources?.[k]).filter((s): s is AreaSource => !!s);
  return `<main><p class="org">${T('city.kind')}</p>
    <p class="banner plain">${T('hood.describe')}</p>${ui.map(h)}
    ${detroit ? `<p class="foot">${T('city.detroit_children')}</p><ul class="rows"><li><button class="row" ${ui.go({ v: 'tab', tab: 'hoods' })}><span class="rowtx"><strong>${T('city.see_neighborhoods')}</strong></span></button></li></ul>`
      : `<p class="foot">${T('city.no_neighborhoods', { city: h.name })}</p><p class="foot">${T('city.regional', { city: h.name })}</p>`}
    ${CITY_PANELS.filter(on).map((k) => drawn[k] ?? '').join('')}
    ${noneRecorded.map((m) => `<p class="foot">${T('city.' + m.panel + '_none', { city: h.name, from: years[0] ?? '', to: years[years.length - 1] ?? '' })}</p>`).join('')}
    ${notPublished.length ? `<p class="foot">${slot(ui, 'city.missing', 'list', notPublished.join(', '), { city: h.name })}</p>` : ''}
    <h2>${T('hood.sources_head')}</h2><ul class="srcs">${sources.map((s) => `<li>${ui.link(s.url, s.name)} <small>${T('hood.updated', { date: ui.date(s.last_edited) })}</small></li>`).join('')}<li>${T('hood.source_ours')}</li></ul>
    <p class="foot">${T('hood.left_out')}</p></main>`;
}
