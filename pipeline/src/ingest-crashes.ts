// "Safe streets" (docs/13): crashes involving people walking or biking, per neighborhood, per year.
//
// SOURCE, read on its owner's own server on 2026-09-20:
//   SEMCOG "Crash Locations, 2015-2024"
//   https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/crash2024_10year/FeatureServer/0
//   page https://maps-semcog.opendata.arcgis.com/datasets/SEMCOG::crash-locations-2015-2024
//   The layer answers an honest, named request anonymously. SEMCOG's portal publishes NO terms for it, and the
//   records underneath are the Michigan State Police's (CJIC), not SEMCOG's own. Licence is recorded as
//   `unstated` and carried as an Open row in docs/DECISIONS.md: Kyle accepted it for the hackathon and the
//   follow-up is to ask SEMCOG and MSP about terms and attribution, and to remove the layer if either objects.
//
// What we keep, and nothing else. At ingest each crash becomes +1 in a neighborhood's yearly tally and is
// then forgotten: no crash id, no date or time (the year only), no ages, no driver, vehicle, road, weather,
// alcohol or hit-and-run fields, and no coordinates in the output. The committed file holds counts alone.
//   data/ingested/crashes.json   per neighborhood and year, and per city, with the source, years and licence
//
// Counts under 5 are stored as "lt5" (docs/13 honesty rule 2) before anything is written.
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
const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };

export type Pt = [number, number];
export interface Tally { walk: number; bike: number; severe: number }
export interface CrashCounts { walk: Count; bike: Count; severe: Count }
export interface CrashRow { years: Record<string, CrashCounts>; window: CrashCounts }
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
 * Crashes into per-neighborhood, per-year tallies. A crash belongs to the neighborhood whose outline holds it;
 * one outside every outline (a freeway edge, or one of the other three cities) is counted only in its city total.
 */
export function aggregate(crashes: Crash[], hoods: Neighborhood[], years: number[]): {
  neighborhoods: Record<string, CrashRow>; placed: number; unplaced: number;
} {
  const boxes = hoods.map((n) => {
    const b = n.rings.flat();
    return { id: n.id, rings: n.rings, x0: Math.min(...b.map((q) => q[0])), x1: Math.max(...b.map((q) => q[0])), y0: Math.min(...b.map((q) => q[1])), y1: Math.max(...b.map((q) => q[1])) };
  });
  const tallies = new Map<string, { years: Map<number, Tally>; window: Tally }>();
  let placed = 0, unplaced = 0;
  for (const c of crashes) {
    if (!years.includes(c.year)) continue;
    const [lon, lat] = c.pt;
    const hit = boxes.find((b) => lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 && b.rings.some((r) => pointInRing(c.pt, r)));
    if (!hit) { unplaced++; continue; }
    placed++;
    let t = tallies.get(hit.id);
    if (!t) { t = { years: new Map(), window: empty() }; tallies.set(hit.id, t); }
    let y = t.years.get(c.year);
    if (!y) { y = empty(); t.years.set(c.year, y); }
    add(y, c); add(t.window, c);
  }
  const neighborhoods: Record<string, CrashRow> = {};
  for (const n of hoods) {
    const t = tallies.get(n.id);
    neighborhoods[n.id] = {
      years: Object.fromEntries(years.map((y) => [y, hide(t?.years.get(y) ?? empty())])),
      window: hide(t?.window ?? empty()),
    };
  }
  return { neighborhoods, placed, unplaced };
}

/** How many neighborhood-years came out hidden, for the run's own log and for docs/OPERATIONS. */
export function suppressedCount(rows: Record<string, CrashRow>): { years: number; windows: number; cells: number } {
  let years = 0, windows = 0, cells = 0;
  for (const r of Object.values(rows)) {
    for (const c of Object.values(r.years)) { const n = [c.walk, c.bike, c.severe].filter((v) => v === 'lt5').length; cells += n; if (n) years++; }
    if ([r.window.walk, r.window.bike, r.window.severe].some((v) => v === 'lt5')) windows++;
  }
  return { years, windows, cells };
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
  const byCity: Record<string, { years: Map<number, Tally>; window: Tally }> = {};
  for (const c of CITIES) byCity[c] = { years: new Map(years.map((y) => [y, empty()])), window: empty() };
  const modes = await query({ where: cityWhere(years), groupByFieldsForStatistics: 'community,YEAR', outStatistics: JSON.stringify([
    { statisticType: 'sum', onStatisticField: 'PEDESTRIAN', outStatisticFieldName: 'walk' },
    { statisticType: 'sum', onStatisticField: 'BICYCLE', outStatisticFieldName: 'bike' }]) });
  await new Promise((r) => setTimeout(r, 300));
  const bad = await query({ where: `${cityWhere(years)} AND (KCOUNT > 0 OR ACOUNT > 0)`, groupByFieldsForStatistics: 'community,YEAR', outStatistics: JSON.stringify([
    { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'severe' }]) });
  const put = (a: any, t: Partial<Tally>) => {
    const city = byCity[String(a.community)];
    if (!city || !years.includes(a.YEAR)) return;
    Object.assign(city.years.get(a.YEAR)!, t);
    for (const k of Object.keys(t) as (keyof Tally)[]) city.window[k] += t[k] ?? 0;
  };
  for (const f of modes.features ?? []) put(f.attributes, { walk: f.attributes.walk ?? 0, bike: f.attributes.bike ?? 0 });
  for (const f of bad.features ?? []) put(f.attributes, { severe: f.attributes.severe ?? 0 });
  return Object.fromEntries(Object.entries(byCity).map(([c, t]) => [c, { years: Object.fromEntries(years.map((y) => [y, hide(t.years.get(y)!)])), window: hide(t.window) }]));
}

async function main(): Promise<void> {
  const meta = await get(`${LAYER}?f=json`);
  const maxYear = (await query({ where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'YEAR', outStatisticFieldName: 'y' }]) })).features?.[0]?.attributes?.y;
  if (!(maxYear >= 2020)) throw new Error(`crashes: the layer's newest year is ${maxYear}. Not writing.`);
  const years = pickYears(Number(maxYear));
  const hoodsFile = p('data/ingested/neighborhoods.json');
  const hoods = (JSON.parse(readFileSync(hoodsFile, 'utf8')).neighborhoods as Neighborhood[]);
  if (hoods.length < 190) throw new Error(`crashes: only ${hoods.length} neighborhood outlines. Run pnpm ingest:neighborhoods first.`);

  const crashes = await readCrashes(years);
  if (crashes.length < 500) throw new Error(`crashes: only ${crashes.length} crashes read for ${years[0]} to ${years.at(-1)}. Not overwriting the last good file.`);
  const { neighborhoods, placed, unplaced } = aggregate(crashes, hoods, years);
  const cities = await cityTotals(years);
  const hidden = suppressedCount(neighborhoods);

  writeJson(p('data/ingested/crashes.json'), {
    source: {
      name: 'SEMCOG — Crash Locations, 2015-2024',
      url: LAYER, page: PAGE,
      license: 'unstated',
      records_from: 'Michigan State Police (CJIC) police-reported crashes, published by SEMCOG',
      last_edited: today(new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate)),
      review: 'No terms are published for this layer and the records are the Michigan State Police\'s. Accepted by Kyle for the hackathon (DECISIONS 2026-09-20); ask SEMCOG and MSP about terms and attribution, and remove the layer if either objects.',
    },
    fetched_at: today(),
    years: [years[0], years.at(-1)],
    cities: CITIES,
    kept: 'Counts only: crashes involving a person walking or biking, per neighborhood and year, and how many of those crashes killed or seriously hurt someone. Nothing else from the layer is kept.',
    city: cities.Detroit, city_by_name: cities, neighborhoods,
  });
  console.log(`crashes ${years[0]} to ${years.at(-1)}: ${crashes.length} crashes read in the four cities, ${placed} placed in a Detroit neighborhood, ${unplaced} outside every outline (the other three cities, or on a city-edge road)`);
  console.log(`crashes: ${hidden.cells} counts hidden as "fewer than 5" across ${hidden.years} neighborhood-years; ${hidden.windows} of ${Object.keys(neighborhoods).length} neighborhoods have a hidden number in the ${years.length}-year total`);
  console.log(`crashes: city totals ${years[0]}-${years.at(-1)} — ${CITIES.map((c) => `${c} walking ${cities[c]!.window.walk}, biking ${cities[c]!.window.bike}`).join('; ')}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-crashes.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
