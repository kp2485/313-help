// "Safe streets" (docs/13): crashes involving people walking or biking, per neighborhood, over five years.
//
// SOURCE, read on its owner's own server on 2026-09-20:
//   SEMCOG "Crash Locations, 2015-2024"
//   https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/crash2024_10year/FeatureServer/0
//   page https://maps-semcog.opendata.arcgis.com/datasets/SEMCOG::crash-locations-2015-2024
//   The layer answers an honest, named request anonymously.
//
// LICENCE. SEMCOG's portal does publish terms, on a page of its own, and they apply to this layer:
//   https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement  (read 2026-09-20)
//   It grants a perpetual, non-exclusive, royalty-free licence to use, reproduce, modify, distribute, publish
//   and display "data you received from SEMCOG", on the condition that any use "prominently state" the notice
//   NOTICE below, with the year filled in. It also disclaims all warranties and, in section 8(a), requires the
//   licensee to indemnify SEMCOG against third-party claims arising from the licensee's breach — an obligation
//   a person has to accept on this project's behalf, which is why it is an Open row in docs/DECISIONS.md.
//   Section 1(b) grants no third-party rights, and the records underneath are the Michigan State Police's
//   (CJIC), not SEMCOG's own: MSP has not been asked about its terms or attribution. Both follow-ups stand —
//   accept or decline the indemnity, ask MSP, and remove the layer if either owner objects.
//
// What we keep, and nothing else. At ingest each crash becomes +1 in one neighborhood's tally for the whole
// window and is then forgotten: no crash id, no date or time (not even the year, per crash), no ages, no
// driver, vehicle, road, weather, alcohol or hit-and-run fields, and no coordinates in the output. The
// committed file holds counts alone.
//   data/ingested/crashes.json   one multi-year total per neighborhood and per city, the years it covers, the
//                                source and the licence
//
// Counts under 5 are stored as "lt5" (docs/13 honesty rule 2) before anything is written. NOTHING ELSE
// DERIVABLE IS PUBLISHED: the file used to carry a per-year count *and* the window total, each suppressed on
// its own, so a hidden year could be recovered by subtracting the published years from the total. Eighteen
// cells came out exactly that way (2026-09-20). Only the window total is written now. Any number added here
// later must pass the test in pipeline/test/crashes.test.ts: for every hidden cell, more than one value has to
// be consistent with everything the file publishes.
//
// Crashes are about streets, never people: nothing here says who was at fault, and there is no ranking of
// neighborhoods, no rate (docs/13 defines no denominator for crashes) and nothing on the Map tab.
//
// Run: pnpm ingest:crashes        By hand, about once a year when SEMCOG publishes a new year (docs/OPERATIONS).

import { readFileSync } from 'node:fs';
import { inBbox, p, today, writeJson } from './util.js';
import { pointInRing, suppress, type Count, type Neighborhood } from './ingest-neighborhoods.js';

export const LAYER = 'https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/crash2024_10year/FeatureServer/0';
export const PAGE = 'https://maps-semcog.opendata.arcgis.com/datasets/SEMCOG::crash-locations-2015-2024';
/** The four cities we serve (CLAUDE.md), spelled as SEMCOG's `community` field spells them. */
export const CITIES = ['Detroit', 'Hamtramck', 'Highland Park', 'Dearborn'];
/** How many complete years the panel covers. */
export const WINDOW = 5;
/**
 * Every field we ask the server for, and there is no other. `PEDESTRIAN` and `BICYCLE` are 0/1 flags, so a sum
 * is a count of crashes. `KCOUNT` and `ACOUNT` are the people killed and seriously hurt in that crash.
 * The layer also carries dates, times, ages, driver, vehicle, alcohol, drug and hit-and-run fields, and a crash
 * id. We ask for none of them.
 */
export const FIELDS = ['YEAR', 'PEDESTRIAN', 'BICYCLE', 'KCOUNT', 'ACOUNT'];
/**
 * The notice SEMCOG's Copyright License Agreement requires on any use of its data, "with the appropriate year
 * inserted". The appropriate year is the layer's own, so it comes from the layer's last-edited date and does not
 * drift with the calendar. The notice travels in the bundle (build.ts) so no app has to hard-code it.
 */
export const NOTICE = (year: number | string) => `Copyright © ${year} SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.`;
export const LICENSE_PAGE = 'https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement';
const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };

export type Pt = [number, number];
export interface Tally { walk: number; bike: number; severe: number }
export interface CrashCounts { walk: Count; bike: Count; severe: Count }
/** One place's counts for the whole window. Deliberately nothing per year: see the note at the top of the file. */
export interface CrashRow { window: CrashCounts }
/** One crash, already stripped to what a tally needs. Never written anywhere. */
export interface Crash { year: number; walk: boolean; bike: boolean; severe: boolean; pt: Pt }

const empty = (): Tally => ({ walk: 0, bike: 0, severe: 0 });
const add = (t: Tally, c: Crash) => { if (c.walk) t.walk++; if (c.bike) t.bike++; if (c.severe) t.severe++; };
/** docs/13 honesty rule 2, applied before anything is stored. */
export const hide = (t: Tally): CrashCounts => ({ walk: suppress(t.walk).count, bike: suppress(t.bike).count, severe: suppress(t.severe).count });

/** The most recent complete years the layer offers, newest last. The layer's newest year is its newest complete one. */
export function pickYears(maxYear: number, window = WINDOW): number[] {
  return Array.from({ length: window }, (_, i) => maxYear - window + 1 + i);
}

/**
 * Crashes into one tally per neighborhood, over the whole window. A crash belongs to the neighborhood whose
 * outline holds it; one outside every outline (a freeway edge, or one of the other three cities) is counted only
 * in its city total. `years` is the window: a crash from any other year is not counted at all.
 */
export function aggregate(crashes: Crash[], hoods: Neighborhood[], years: number[]): {
  neighborhoods: Record<string, CrashRow>; placed: number; unplaced: number;
} {
  const boxes = hoods.map((n) => {
    const b = n.rings.flat();
    return { id: n.id, rings: n.rings, x0: Math.min(...b.map((q) => q[0])), x1: Math.max(...b.map((q) => q[0])), y0: Math.min(...b.map((q) => q[1])), y1: Math.max(...b.map((q) => q[1])) };
  });
  const tallies = new Map<string, Tally>();
  let placed = 0, unplaced = 0;
  for (const c of crashes) {
    if (!years.includes(c.year)) continue;
    const [lon, lat] = c.pt;
    const hit = boxes.find((b) => lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 && b.rings.some((r) => pointInRing(c.pt, r)));
    if (!hit) { unplaced++; continue; }
    placed++;
    let t = tallies.get(hit.id);
    if (!t) { t = empty(); tallies.set(hit.id, t); }
    add(t, c);
  }
  const neighborhoods: Record<string, CrashRow> = {};
  for (const n of hoods) neighborhoods[n.id] = { window: hide(tallies.get(n.id) ?? empty()) };
  return { neighborhoods, placed, unplaced };
}

/** How many counts came out hidden, for the run's own log and for docs/OPERATIONS. */
export function suppressedCount(rows: Record<string, CrashRow>): { places: number; cells: number } {
  let places = 0, cells = 0;
  for (const r of Object.values(rows)) {
    const n = [r.window.walk, r.window.bike, r.window.severe].filter((v) => v === 'lt5').length;
    cells += n;
    if (n) places++;
  }
  return { places, cells };
}

// ---- reading ---------------------------------------------------------------------
const get = async (url: string): Promise<any> => {
  const res = await fetch(url, { headers: UA });
  // A refusal is reported, never worked around: we do not retry with a different name or scrape the query UI.
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from SEMCOG for ${url.slice(0, 120)} — stopping. A person should check whether the service is refusing us.`);
  const j = (await res.json()) as any;
  if (j.error) throw new Error(`SEMCOG: ${JSON.stringify(j.error)}`);
  return j;
};
const query = (params: Record<string, string>) => get(`${LAYER}/query?${new URLSearchParams({ f: 'json', ...params })}`);

export const cityWhere = (years: number[]) =>
  `(PEDESTRIAN = 1 OR BICYCLE = 1) AND YEAR >= ${years[0]} AND YEAR <= ${years[years.length - 1]} AND community IN (${CITIES.map((c) => `'${c}'`).join(', ')})`;

/** Crash points for the four cities, minimal fields, held in memory only. */
async function readCrashes(years: number[]): Promise<Crash[]> {
  const out: Crash[] = [];
  const where = cityWhere(years);
  for (let offset = 0; ; offset += 1000) {
    const page = await query({ where, outFields: FIELDS.join(','), returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: '1000' });
    for (const f of page.features ?? []) {
      const a = f.attributes ?? {}, g = f.geometry ?? {};
      if (typeof g.x !== 'number' || typeof g.y !== 'number' || !inBbox(g.y, g.x)) continue;
      out.push({ year: Number(a.YEAR), walk: a.PEDESTRIAN === 1, bike: a.BICYCLE === 1, severe: (a.KCOUNT ?? 0) + (a.ACOUNT ?? 0) > 0, pt: [Number(g.x.toFixed(5)), Number(g.y.toFixed(5))] });
    }
    if (!page.exceededTransferLimit && (page.features ?? []).length < 1000) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

/**
 * Per-city totals, added up by SEMCOG's own server: no record is downloaded for these. Two queries, so that
 * "killed or seriously hurt" counts crashes here exactly as it does per neighborhood, not people.
 */
async function cityTotals(years: number[]): Promise<Record<string, CrashRow>> {
  const byCity: Record<string, Tally> = {};
  for (const c of CITIES) byCity[c] = empty();
  const modes = await query({ where: cityWhere(years), groupByFieldsForStatistics: 'community,YEAR', outStatistics: JSON.stringify([
    { statisticType: 'sum', onStatisticField: 'PEDESTRIAN', outStatisticFieldName: 'walk' },
    { statisticType: 'sum', onStatisticField: 'BICYCLE', outStatisticFieldName: 'bike' }]) });
  await new Promise((r) => setTimeout(r, 300));
  const bad = await query({ where: `${cityWhere(years)} AND (KCOUNT > 0 OR ACOUNT > 0)`, groupByFieldsForStatistics: 'community,YEAR', outStatistics: JSON.stringify([
    { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'severe' }]) });
  // The server groups by year as well as city so that the two queries line up row for row; the years are then
  // added together and thrown away. Nothing per year is kept, let alone written (see the note at the top).
  const put = (a: any, t: Partial<Tally>) => {
    const city = byCity[String(a.community)];
    if (!city || !years.includes(a.YEAR)) return;
    for (const k of Object.keys(t) as (keyof Tally)[]) city[k] += t[k] ?? 0;
  };
  for (const f of modes.features ?? []) put(f.attributes, { walk: f.attributes.walk ?? 0, bike: f.attributes.bike ?? 0 });
  for (const f of bad.features ?? []) put(f.attributes, { severe: f.attributes.severe ?? 0 });
  return Object.fromEntries(Object.entries(byCity).map(([c, t]) => [c, { window: hide(t) }]));
}

async function main(): Promise<void> {
  const meta = await get(`${LAYER}?f=json`);
  const maxYear = (await query({ where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'YEAR', outStatisticFieldName: 'y' }]) })).features?.[0]?.attributes?.y;
  if (!(maxYear >= 2020)) throw new Error(`crashes: the layer's newest year is ${maxYear}. Not writing.`);
  const years = pickYears(Number(maxYear));
  const hoodsFile = p('data/ingested/neighborhoods.json');
  const hoods = (JSON.parse(readFileSync(hoodsFile, 'utf8')).neighborhoods as Neighborhood[]);
  if (hoods.length < 190) throw new Error(`crashes: only ${hoods.length} neighborhood outlines. Run pnpm ingest:neighborhoods first.`);

  const lastEdited = today(new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate));
  const crashes = await readCrashes(years);
  if (crashes.length < 500) throw new Error(`crashes: only ${crashes.length} crashes read for ${years[0]} to ${years.at(-1)}. Not overwriting the last good file.`);
  const { neighborhoods, placed, unplaced } = aggregate(crashes, hoods, years);
  const cities = await cityTotals(years);
  const hidden = suppressedCount(neighborhoods);

  writeJson(p('data/ingested/crashes.json'), {
    source: {
      name: 'SEMCOG — Crash Locations, 2015-2024',
      url: LAYER, page: PAGE,
      license: 'SEMCOG Copyright License Agreement',
      license_url: LICENSE_PAGE,
      license_notice: NOTICE(lastEdited.slice(0, 4)),
      records_from: 'Michigan State Police (CJIC) police-reported crashes, published by SEMCOG',
      last_edited: lastEdited,
      review: "SEMCOG's Copyright License Agreement (license_url, read 2026-09-20) grants a perpetual royalty-free licence to use and publish its data, on the condition that license_notice is stated prominently; it also disclaims all warranties and, in section 8(a), asks the licensee to indemnify SEMCOG against third-party claims arising from the licensee's own breach. Section 1(b) grants no third-party rights, and the records are the Michigan State Police's (CJIC): MSP has not been asked about its terms or attribution. Open in docs/DECISIONS.md — a person accepts or declines the indemnity, asks MSP, and the layer comes out if either owner objects.",
    },
    fetched_at: today(),
    years: [years[0], years.at(-1)],
    years_covered: years,
    cities: CITIES,
    kept: 'Counts only: crashes involving a person walking or biking, added up over the years in years_covered, per neighborhood and per city, and how many of those crashes killed or seriously hurt someone. Nothing per year and nothing else from the layer is kept, so a hidden "fewer than 5" cannot be recovered by subtracting published numbers from a total.',
    city: cities.Detroit, city_by_name: cities, neighborhoods,
  });
  console.log(`crashes ${years[0]} to ${years.at(-1)}: ${crashes.length} crashes read in the four cities, ${placed} placed in a Detroit neighborhood, ${unplaced} outside every outline (the other three cities, or on a city-edge road)`);
  console.log(`crashes: ${hidden.cells} counts hidden as "fewer than 5"; ${hidden.places} of ${Object.keys(neighborhoods).length} neighborhoods have a hidden number in the ${years.length}-year total`);
  console.log(`crashes: city totals ${years[0]}-${years.at(-1)} — ${CITIES.map((c) => `${c} walking ${cities[c]!.window.walk}, biking ${cities[c]!.window.bike}`).join('; ')}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-crashes.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
