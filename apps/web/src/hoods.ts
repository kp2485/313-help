// Neighborhood pages (docs/13): "How is Bagley doing?" Public City data joined with our own listings by the
// pipeline. Nothing here comes from a phone, a report, or app usage. Not in the crisis path: reached from
// About, from a greenway segment, or by link.
//
// Honesty rules that live in this file: no ranking or sorting by a number (lists are alphabetical); every number
// says where it came from and when; small counts arrive already hidden ("lt5"); home prices and building permits
// are drawn in ONE panel so neither is shown without the other; "none listed yet" describes our list, not the place.

import { fetchVerified, idbGet, idbSet, type BundleIndex } from './data.js';
import { groupHoods, matchHoods, type HoodOrder } from './hoodfind.js';
import { locale } from './i18n.js';

type Count = number | 'lt5';
export interface YearStats { sales?: Count; median_price?: number; permits?: Count; permit_cost?: number; blight?: Count; demolitions?: Count; issues?: Count; issue_days?: number; fires?: Count }
/** Today's numbers, not a year's: rental certificates in force, vacant registrations of the past 12 months, street ratings. */
export interface NowStats { rental_certs?: Count; vacant_reg?: Count; roads?: { pieces: Count; miles?: number; poor_pct?: number } }
/** "Safe streets" (docs/13): crashes the police wrote up that involved someone walking or biking, over the
 *  years the panel names. Plain counts, hidden under 5. Never a rate: docs/13 defines no denominator here. */
export interface CrashCounts { walk: Count; bike: Count; severe: Count }
export interface Hood {
  id: string; name: string; district: number | null; jlg_study_area?: boolean; center: [number, number]; rings: number[][];
  help: { total: number; by: Record<string, number>; nearest_miles: Record<string, number | null>; none_listed_yet: string[]; coverage_checked: boolean };
  places: { parks: number; rec_centers: number; greenway_open: number; snap_stores?: number; bus_stops?: number };
  nearest_city?: { snap: number | null; grocery: number | null; bus: number | null };
  parcels?: number;
  years: Record<string, YearStats>;
  now?: NowStats;
  crashes?: CrashCounts;
}
interface Source { name: string; url: string; last_edited: string }
export interface Indicators {
  sources: { neighborhoods: Source; sales: Source; permits: Source; blight?: Source; demolitions?: Source; issues?: Source; parcels?: Source; snap?: Source; bus_stops?: Source; rentals?: Source; fires?: Source; pavement?: Source; vacant?: Source; crashes?: Source };
  city_parcels?: number; issue_types?: string[]; fire_types?: string[]; city_now?: NowStats; roads_years?: [number, number]; vacant_period?: [string, string];
  crash_years?: [number, number]; city_crashes?: CrashCounts; crash_records_from?: string;
  stats_fetched_at: string; first_year: number; partial_year: number;
  near_miles: number; origin: [number, number]; city: Record<string, YearStats>; neighborhoods: Hood[]; segments: Record<string, string[]>;
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

export interface Ui { t: (key: string, p?: Record<string, string | number>) => string; esc: (s: unknown) => string; own: (s: unknown) => string; date: (d: string) => string; link: (url: string, label: string) => string; go: (view: object) => string; map: (h: Hood) => string; icon: (name: string) => string }
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
const indexRow = (ui: Ui, n: Hood) => `<li><button class="row" ${ui.go({ v: 'hood', id: n.id })}><span class="rowtx"><strong>${ui.own(n.name)}</strong></span></button></li>`;

/** The groups of the index list, in the order asked for: A to Z, or by council district. `matchHoods` narrows
 *  the list by what has been typed and leaves the order alone. Drawn on its own so typing a letter can replace
 *  this one piece of the screen instead of the whole page: the keyboard stays up and nothing jumps. */
export function hoodRows(d: Indicators, ui: Ui, o: { order: HoodOrder; query: string }): string {
  const found = matchHoods(d.neighborhoods, o.query);
  if (!found.length) return `<p class="empty">${ui.esc(ui.t('hood.find_none'))}</p>`;
  const head = (key: string | number) =>
    o.order === 'district' ? (key === '' ? ui.t('hood.no_district') : ui.t('hood.district', { n: key })) : key === '' ? ui.t('hood.letter_other') : String(key);
  return groupHoods(found, o.order).map((g) => `<h3 class="sub">${ui.esc(head(g.key))}</h3><ul class="rows">${g.items.map((n) => indexRow(ui, n)).join('')}</ul>`).join('');
}

/**
 * The Neighborhoods tab's own screen (docs/05): what these pages are, then the fastest way to the person's own
 * neighborhood, then all 205 by name.
 *
 * `mine` is the answer the device worked out from a location or a typed ZIP — it is handed in already decided
 * (hoodfind.ts), is used to draw one row, and is kept nowhere. `locHtml` is the ordinary location chip, the
 * same one every list screen uses, so there is no second way of asking for a location anywhere in the app.
 */
export function hoodIndex(d: Indicators, ui: Ui, o: { order: HoodOrder; query: string; located: boolean; zip: string; mine: Hood | null; locHtml: string }): string {
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
  return `<main><h1 class="page" tabindex="-1">${T('hood.title')}</h1><p class="lede">${T('hood.index_intro')}</p>
    <p class="foot">${T('hood.index_sources')} ${ui.link(src.url, src.name)} <small>${T('hood.updated', { date: ui.date(src.last_edited) })}</small></p>
    <h2>${T('hood.mine_head')}</h2>${mine}${o.locHtml}
    <label class="searchbox">${T('hood.find_label')}<input id="hoodq" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="40" value="${ui.esc(o.query)}" aria-describedby="hoodsay"></label>
    <p class="vh" id="hoodsay" role="status" aria-live="polite"></p>
    <fieldset class="hoodorder"><legend>${T('hood.group_label')}</legend><div class="kinds">${radio('abc', 'hood.group_abc')}${radio('district', 'hood.group_district')}</div></fieldset>
    <div id="hoodlist">${hoodRows(d, ui, o)}</div>
    <p class="foot">${T('hood.only_detroit')}</p>
    <ul class="rows"><li><button class="row" ${ui.go({ v: 'hoods', lens: 'jlg' })}><span class="rowtx"><strong>${T('hood.lens_jlg')}</strong><small>${T('hood.lens_jlg_sub')}</small></span></button></li></ul>
    <p class="foot">${T('hood.describe')}</p></main>`;
}

/** Alphabetical inside each council district. Never sorted by a number: no league tables (rule 1). */
export function hoodList(d: Indicators, ui: Ui, lens?: string): string {
  const list = d.neighborhoods.filter((n) => lens !== 'jlg' || n.jlg_study_area).sort((a, b) => a.name.localeCompare(b.name));
  // A neighborhood's name is the City's, never ours: marked English so it is read in the right voice and, in
  // Arabic, so a name like "Crary/St Marys" or "Evergreen Lahser 7/8" stays in one piece.
  const row = (n: Hood) => `<li><button class="row" ${ui.go({ v: 'hood', id: n.id })}><span class="rowtx"><strong>${ui.own(n.name)}</strong></span></button></li>`;
  const groups = [1, 2, 3, 4, 5, 6, 7, null].map((dist) => ({ dist, items: list.filter((n) => n.district === dist) })).filter((g) => g.items.length);
  return `<main><p class="lede">${ui.esc(ui.t('hood.list_lede'))}</p><p class="foot">${ui.esc(ui.t('hood.describe'))}</p>
    ${lens === 'jlg' ? `<p class="foot">${ui.esc(ui.t('hood.lens_jlg_note', { count: list.length }))}</p>` : `<ul class="rows"><li><button class="row" ${ui.go({ v: 'hoods', lens: 'jlg' })}><span class="rowtx"><strong>${ui.esc(ui.t('hood.lens_jlg'))}</strong><small>${ui.esc(ui.t('hood.lens_jlg_sub'))}</small></span></button></li></ul>`}
    ${groups.map((g) => `<h2>${ui.esc(g.dist ? ui.t('hood.district', { n: g.dist }) : ui.t('hood.no_district'))}</h2><ul class="rows">${g.items.map(row).join('')}</ul>`).join('')}</main>`;
}

function yearsTable(h: Hood, d: Indicators, ui: Ui, o: { value: (y: YearStats) => number | undefined; cityValue?: (y: YearStats) => number | undefined; count?: (y: YearStats) => Count | undefined; fmt: (n: number) => string; head: string; countHead: string; missing: string; caption: string }): string {
  const years = Object.keys(d.city).sort(), max = Math.max(1, ...years.map((y) => o.value(h.years[y] ?? {}) ?? 0));
  const count = (c: Count | undefined) => (c === undefined ? ui.t('hood.none_recorded') : c === 'lt5' ? ui.t('hood.lt5') : String(c));
  return `<table class="years"><caption>${ui.esc(o.caption)}</caption><thead><tr><th scope="col">${ui.esc(ui.t('hood.year'))}</th><th scope="col">${ui.esc(o.head)}</th>${o.count ? `<th scope="col">${ui.esc(o.countHead)}</th>` : ''}<th scope="col">${ui.esc(ui.t('hood.city'))}</th></tr></thead><tbody>
    ${years.map((y) => { const v = o.value(h.years[y] ?? {}), cv = (o.cityValue ?? o.value)(d.city[y] ?? {});
      return `<tr><th scope="row">${Number(y) === d.partial_year ? ui.esc(ui.t('hood.so_far', { year: y })) : y}</th><td>${v === undefined ? `<small>${ui.esc(o.missing)}</small>` : `<span class="bar" aria-hidden="true" style="width:${Math.max(3, Math.round((v / max) * 100))}%"></span><span>${ui.esc(o.fmt(v))}</span>`}</td>${o.count ? `<td>${ui.esc(count(o.count(h.years[y] ?? {})))}</td>` : ''}<td>${cv === undefined ? '' : ui.esc(o.fmt(cv))}</td></tr>`; }).join('')}</tbody></table>`;
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
export function crashPanel(h: Hood, d: Indicators, ui: Ui): string {
  if (!d.sources.crashes || !h.crashes || !d.crash_years) return '';
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const num = (n: number) => new Intl.NumberFormat(locale()).format(n);
  const show = (c: Count | undefined) => (c === undefined ? T('hood.none_recorded') : c === 'lt5' ? T('hood.lt5') : num(c));
  const city = (c: Count | undefined) => (typeof c === 'number' ? T('hood.crash_city', { count: num(c) }) : '');
  const line = (label: string, k: keyof CrashCounts) =>
    `<li><span>${label}</span><span>${show(h.crashes![k])}${city(d.city_crashes?.[k]) ? ` <small>${city(d.city_crashes?.[k])}</small>` : ''}</span></li>`;
  const [from, to] = d.crash_years;
  return `<h2>${T('hood.crash_head')}</h2><div class="panel"><p>${T('hood.crash_lede', { from, to })}</p>
    <ul class="hours">${line(T('hood.crash_walk'), 'walk')}${line(T('hood.crash_bike'), 'bike')}${line(T('hood.crash_severe'), 'severe')}</ul>
    <p class="foot">${T('hood.crash_note')}</p>
    <p class="foot">${slot(ui, 'hood.crash_source', 'source', d.sources.crashes.name, { records: d.crash_records_from ?? '' })}</p>
    <p class="foot" lang="en">${SEMCOG_NOTICE}</p></div>`;
}

export function hoodPage(h: Hood, d: Indicators, ui: Ui): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const near = (k: string) => { const mi = h.help.nearest_miles[k]; return `<li><span>${T('hood.nearest.' + k)}</span><span>${mi === null || mi === undefined ? T('hood.nearest_none') : T('miles', { miles: mi.toFixed(1) })}</span></li>`; };
  const cats = Object.entries(h.help.by).filter(([, n]) => n > 0);
  const src = (s: Source) => `<li>${ui.link(s.url, s.name)} <small>${T('hood.updated', { date: ui.date(s.last_edited) })}</small></li>`;
  const row = (label: string, value: string, city = '') => `<ul class="hours"><li><span>${label}</span><span>${value}${city ? ` <small>${city}</small>` : ''}</span></li></ul>`;
  const fmtRate = (r: number) => r.toFixed(r < 10 ? 1 : 0);
  /** A count as of today, with its rate per 1,000 lots when the count can be shown and the base defended (rules 2 and 3). */
  const per1000 = (c: Count | undefined) => { if (c === undefined) return T('hood.none_recorded'); if (c === 'lt5') return T('hood.lt5'); const r = rate(c, h.parcels); return r === undefined ? String(c) : T('hood.per_1000', { count: c, rate: fmtRate(r) }); };
  const cityPer1000 = (c: Count | undefined) => { const r = rate(c, d.city_parcels); return r === undefined ? '' : T('hood.city_per_1000', { rate: fmtRate(r) }); };
  const roads = h.now?.roads, cityRoads = d.city_now?.roads;
  const roadsValue = !roads ? T('hood.roads_none') : roads.poor_pct === undefined ? T('hood.roads_few') : T('hood.roads_pct', { pct: roads.poor_pct, miles: (roads.miles ?? 0).toFixed(1) });
  const nc = h.nearest_city, mi = (m: number | null) => (m === null ? T('hood.none_found') : T('miles', { miles: m.toFixed(1) }));
  return `<main><p class="org">${h.district ? T('hood.district', { n: h.district }) : ''}${h.jlg_study_area ? ` · ${T('hood.in_jlg')}` : ''}</p>
    <p class="banner plain">${T('hood.describe')}</p>${ui.map(h)}

    <h2>${T('hood.help_head')}</h2>
    ${h.help.coverage_checked ? '' : `<div class="panel"><p>${T('hood.thin')}</p><div class="stackbtns"><button class="btn ghost" ${ui.go({ v: 'add' })}>${T('add.title')}</button></div></div>`}
    <p>${T(h.help.total === 1 ? 'hood.help_count_one' : 'hood.help_count', { count: h.help.total, miles: d.near_miles })}</p>
    ${cats.length ? `<ul class="hours">${cats.map(([c, n]) => `<li><span>${T('add.cat.' + (c === 'shelter' ? 'shelter.emergency' : c))}</span><span>${n}</span></li>`).join('')}</ul>` : ''}
    ${h.help.none_listed_yet.length ? `<p class="foot">${T('hood.none_listed', { kinds: h.help.none_listed_yet.map((c) => ui.t('hood.kind.' + c)).join(', ') })}</p>` : ''}
    <h3 class="sub">${T('hood.nearest_head')}</h3><ul class="hours">${['food', 'clinic', 'narcan', 'indoors'].map(near).join('')}</ul>
    <h3 class="sub">${T('hood.places_head', { miles: d.near_miles })}</h3><ul class="hours"><li><span>${T('hood.parks')}</span><span>${h.places.parks}</span></li><li><span>${T('hood.rec_centers')}</span><span>${h.places.rec_centers}</span></li><li><span>${T('hood.greenway_open')}</span><span>${h.places.greenway_open}</span></li>${h.places.snap_stores !== undefined ? `<li><span>${T('hood.snap_stores')}</span><span>${h.places.snap_stores}</span></li>` : ''}${h.places.bus_stops !== undefined ? `<li><span>${T('hood.bus_stops')}</span><span>${h.places.bus_stops}</span></li>` : ''}</ul>
    ${nc ? `<h3 class="sub">${T('hood.city_near_head')}</h3><ul class="hours"><li><span>${T('hood.near.snap')}</span><span>${mi(nc.snap)}</span></li><li><span>${T('hood.near.grocery')}</span><span>${mi(nc.grocery)}</span></li><li><span>${T('hood.near.bus')}</span><span>${mi(nc.bus)}</span></li></ul>
    <p class="foot">${T('hood.snap_note')}</p>` : ''}

    <h2>${T('hood.money_head')}</h2><div class="panel"><p>${T('hood.money_lede')}</p>
      ${yearsTable(h, d, ui, { value: (y) => y.median_price, count: (y) => y.sales, fmt: money, head: ui.t('hood.median'), countHead: ui.t('hood.sales'), missing: ui.t('hood.too_few'), caption: ui.t('hood.sales_caption') })}
      ${yearsTable(h, d, ui, { value: (y) => y.permit_cost, count: (y) => y.permits, fmt: bigMoney, head: ui.t('hood.permit_cost'), countHead: ui.t('hood.permits'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.permits_caption') })}
      <p class="foot">${T('hood.money_note')}</p>
      ${d.sources.rentals ? `${row(T('hood.rentals'), per1000(h.now?.rental_certs), cityPer1000(d.city_now?.rental_certs))}<p class="foot">${T('hood.rentals_note')}</p>` : ''}</div>

    ${d.sources.blight ? `<h2>${T('hood.cond_head')}</h2><div class="panel"><p>${T('hood.cond_lede')}</p>
      ${yearsTable(h, d, ui, { value: (y) => rate(y.blight, h.parcels), cityValue: (y) => rate(y.blight, d.city_parcels), count: (y) => y.blight, fmt: (n) => n.toFixed(0), head: ui.t('hood.blight_rate'), countHead: ui.t('hood.blight'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.blight_caption') })}
      <p class="foot">${T('hood.blight_note')}</p>
      ${yearsTable(h, d, ui, { value: (y) => (typeof y.demolitions === 'number' ? y.demolitions : undefined), fmt: (n) => String(n), head: ui.t('hood.demolitions'), countHead: '', missing: ui.t('hood.lt5_or_none'), caption: ui.t('hood.demo_caption') })}
      ${yearsTable(h, d, ui, { value: (y) => y.issue_days, count: (y) => y.issues, fmt: (n) => ui.t('hood.days', { n }), head: ui.t('hood.issue_days'), countHead: ui.t('hood.issues'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.issues_caption') })}
      <p class="foot">${slot(ui, 'hood.issues_note', 'types', (d.issue_types ?? []).join(', '))}</p>
      ${d.sources.fires ? `${yearsTable(h, d, ui, { value: (y) => rate(y.fires, h.parcels), cityValue: (y) => rate(y.fires, d.city_parcels), count: (y) => y.fires, fmt: (n) => n.toFixed(1), head: ui.t('hood.blight_rate'), countHead: ui.t('hood.fires'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.fire_caption') })}
      <p class="foot">${T('hood.fire_note')}</p><details class="foot"><summary>${T('hood.fire_types')}</summary><p>${ui.own((d.fire_types ?? []).join('; '))}</p></details>` : ''}
      ${d.sources.vacant ? `${row(T('hood.vacant', { from: ui.date(d.vacant_period?.[0] ?? ''), to: ui.date(d.vacant_period?.[1] ?? '') }), per1000(h.now?.vacant_reg), cityPer1000(d.city_now?.vacant_reg))}<p class="foot">${T('hood.vacant_note')}</p>` : ''}
      ${d.sources.pavement ? `${row(T('hood.roads', { from: d.roads_years?.[0] ?? '', to: d.roads_years?.[1] ?? '' }), roadsValue, cityRoads?.poor_pct !== undefined ? T('hood.city_pct', { pct: cityRoads.poor_pct }) : '')}<p class="foot">${T('hood.roads_note')}</p>` : ''}</div>` : ''}

    ${crashPanel(h, d, ui)}

    <h2>${T('hood.sources_head')}</h2><ul class="srcs">${[d.sources.sales, d.sources.permits, d.sources.rentals, d.sources.blight, d.sources.demolitions, d.sources.issues, d.sources.fires, d.sources.vacant, d.sources.pavement, d.sources.parcels, d.sources.snap, d.sources.bus_stops, d.sources.crashes, d.sources.neighborhoods].filter((x): x is Source => !!x).map(src).join('')}<li>${T('hood.source_ours')}</li></ul>
    <p class="foot">${T('hood.left_out')}</p></main>`;
}
