// Neighborhood pages (docs/13): "How is Bagley doing?" Public City data joined with our own listings by the
// pipeline. Nothing here comes from a phone, a report, or app usage. Not in the crisis path: reached from
// About, from a greenway segment, or by link.
//
// Honesty rules that live in this file: no ranking or sorting by a number (lists are alphabetical); every number
// says where it came from and when; small counts arrive already hidden ("lt5"); home prices and building permits
// are drawn in ONE panel so neither is shown without the other; "none listed yet" describes our list, not the place.

import { fetchVerified, idbGet, idbSet, type BundleIndex } from './data.js';
import { locale } from './i18n.js';

type Count = number | 'lt5';
export interface YearStats { sales?: Count; median_price?: number; permits?: Count; permit_cost?: number; blight?: Count; demolitions?: Count; issues?: Count; issue_days?: number }
export interface Hood {
  id: string; name: string; district: number | null; jlg_study_area?: boolean; center: [number, number]; rings: number[][];
  help: { total: number; by: Record<string, number>; nearest_miles: Record<string, number | null>; none_listed_yet: string[]; coverage_checked: boolean };
  places: { parks: number; rec_centers: number; greenway_open: number };
  parcels?: number;
  years: Record<string, YearStats>;
}
interface Source { name: string; url: string; last_edited: string }
export interface Indicators {
  sources: { neighborhoods: Source; sales: Source; permits: Source; blight?: Source; demolitions?: Source; issues?: Source; parcels?: Source }; city_parcels?: number; issue_types?: string[]; stats_fetched_at: string; first_year: number; partial_year: number;
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

export interface Ui { t: (key: string, p?: Record<string, string | number>) => string; esc: (s: unknown) => string; date: (d: string) => string; link: (url: string, label: string) => string; go: (view: object) => string; map: (h: Hood) => string }
/** Per 1,000 parcels. No rate without a count we can show and a base we can defend (honesty rules 2 and 3). */
export const rate = (c: Count | undefined, parcels: number | undefined) => (typeof c === 'number' && parcels && parcels >= 100 ? (c / parcels) * 1000 : undefined);
const money = (n: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const bigMoney = (n: number) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 }).format(n);

/** Alphabetical inside each council district. Never sorted by a number: no league tables (rule 1). */
export function hoodList(d: Indicators, ui: Ui, lens?: string): string {
  const list = d.neighborhoods.filter((n) => lens !== 'jlg' || n.jlg_study_area).sort((a, b) => a.name.localeCompare(b.name));
  const row = (n: Hood) => `<li><button class="row" ${ui.go({ v: 'hood', id: n.id })}><span class="rowtx"><strong>${ui.esc(n.name)}</strong></span></button></li>`;
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

export function hoodPage(h: Hood, d: Indicators, ui: Ui): string {
  const T = (k: string, p?: Record<string, string | number>) => ui.esc(ui.t(k, p));
  const near = (k: string) => { const mi = h.help.nearest_miles[k]; return `<li><span>${T('hood.nearest.' + k)}</span><span>${mi === null || mi === undefined ? T('hood.nearest_none') : T('miles', { miles: mi.toFixed(1) })}</span></li>`; };
  const cats = Object.entries(h.help.by).filter(([, n]) => n > 0);
  const src = (s: Source) => `<li>${ui.link(s.url, s.name)} <small>${T('hood.updated', { date: ui.date(s.last_edited) })}</small></li>`;
  return `<main><p class="org">${h.district ? T('hood.district', { n: h.district }) : ''}${h.jlg_study_area ? ` · ${T('hood.in_jlg')}` : ''}</p>
    <p class="banner plain">${T('hood.describe')}</p>${ui.map(h)}

    <h2>${T('hood.help_head')}</h2>
    ${h.help.coverage_checked ? '' : `<div class="panel"><p>${T('hood.thin')}</p><div class="stackbtns"><button class="btn ghost" ${ui.go({ v: 'add' })}>${T('add.title')}</button></div></div>`}
    <p>${T(h.help.total === 1 ? 'hood.help_count_one' : 'hood.help_count', { count: h.help.total, miles: d.near_miles })}</p>
    ${cats.length ? `<ul class="hours">${cats.map(([c, n]) => `<li><span>${T('add.cat.' + (c === 'shelter' ? 'shelter.emergency' : c))}</span><span>${n}</span></li>`).join('')}</ul>` : ''}
    ${h.help.none_listed_yet.length ? `<p class="foot">${T('hood.none_listed', { kinds: h.help.none_listed_yet.map((c) => ui.t('hood.kind.' + c)).join(', ') })}</p>` : ''}
    <h3 class="sub">${T('hood.nearest_head')}</h3><ul class="hours">${['food', 'clinic', 'narcan', 'indoors'].map(near).join('')}</ul>
    <h3 class="sub">${T('hood.places_head', { miles: d.near_miles })}</h3><ul class="hours"><li><span>${T('hood.parks')}</span><span>${h.places.parks}</span></li><li><span>${T('hood.rec_centers')}</span><span>${h.places.rec_centers}</span></li><li><span>${T('hood.greenway_open')}</span><span>${h.places.greenway_open}</span></li></ul>

    <h2>${T('hood.money_head')}</h2><div class="panel"><p>${T('hood.money_lede')}</p>
      ${yearsTable(h, d, ui, { value: (y) => y.median_price, count: (y) => y.sales, fmt: money, head: ui.t('hood.median'), countHead: ui.t('hood.sales'), missing: ui.t('hood.too_few'), caption: ui.t('hood.sales_caption') })}
      ${yearsTable(h, d, ui, { value: (y) => y.permit_cost, count: (y) => y.permits, fmt: bigMoney, head: ui.t('hood.permit_cost'), countHead: ui.t('hood.permits'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.permits_caption') })}
      <p class="foot">${T('hood.money_note')}</p></div>

    ${d.sources.blight ? `<h2>${T('hood.cond_head')}</h2><div class="panel"><p>${T('hood.cond_lede')}</p>
      ${yearsTable(h, d, ui, { value: (y) => rate(y.blight, h.parcels), cityValue: (y) => rate(y.blight, d.city_parcels), count: (y) => y.blight, fmt: (n) => n.toFixed(0), head: ui.t('hood.blight_rate'), countHead: ui.t('hood.blight'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.blight_caption') })}
      <p class="foot">${T('hood.blight_note')}</p>
      ${yearsTable(h, d, ui, { value: (y) => (typeof y.demolitions === 'number' ? y.demolitions : undefined), fmt: (n) => String(n), head: ui.t('hood.demolitions'), countHead: '', missing: ui.t('hood.lt5_or_none'), caption: ui.t('hood.demo_caption') })}
      ${yearsTable(h, d, ui, { value: (y) => y.issue_days, count: (y) => y.issues, fmt: (n) => ui.t('hood.days', { n }), head: ui.t('hood.issue_days'), countHead: ui.t('hood.issues'), missing: ui.t('hood.too_few_permits'), caption: ui.t('hood.issues_caption') })}
      <p class="foot">${T('hood.issues_note', { types: (d.issue_types ?? []).join(', ') })}</p></div>` : ''}

    <h2>${T('hood.sources_head')}</h2><ul class="srcs">${[d.sources.sales, d.sources.permits, d.sources.blight, d.sources.demolitions, d.sources.issues, d.sources.parcels, d.sources.neighborhoods].filter((x): x is Source => !!x).map(src).join('')}<li>${T('hood.source_ours')}</li></ul>
    <p class="foot">${T('hood.left_out')}</p></main>`;
}
