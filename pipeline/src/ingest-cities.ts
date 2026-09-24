// City pages for Hamtramck, Highland Park, Dearborn — and Detroit (docs/13, "The four cities").
//
// WHY THIS FILE EXISTS. None of the other three cities runs an open-data portal, so there is no
// per-neighborhood anything outside Detroit and there never will be from the cities themselves
// (docs/research/2026-09-22-neighborhoods-three-cities.md). What does exist is REGIONAL and FEDERAL data that
// covers all four cities with one method: SEMCOG for pavement, parks and the 2020 Census municipal totals, the
// U.S. Census Building Permits Survey for new homes permitted, Wayne County for a parcel count, and the Census
// Bureau's TIGER place outlines we already draw on the map. This script reads those, and nothing else.
//
// WHAT IS DELIBERATELY ABSENT. Home sales, blight tickets, demolitions, problems people reported, building
// fires, rental certificates and vacant-building registrations are Detroit-only panels. No public,
// machine-readable, name-free source exists for any of them in the other three cities, and the assessing and
// permit system all three use (BS&A Online) prohibits automated access in its own terms, so we do not read it
// and do not deep-link it. Those panels are ABSENT on a city page — never estimated, never drawn as a zero.
// Each city page says in one sentence which ones its public sources do not support.
//
// NO RANKING. Nothing here compares one city with another, and the file carries no order but the one it is
// written in. Each page is read on its own (docs/13, honesty rule 1).
//
// WHAT WE ASK FOR, AND WHAT WE KEEP. Every count below is added up BY THE OWNER'S OWN SERVER: we send an
// `outStatistics` query and keep the total. No parcel record, no park record and no road record is downloaded.
// Wayne County's parcel layer carries `OwnerName` and `OwnerAddress`; we never put either in `outFields`.
// The Census Building Permits Survey file is a plain public text file of place totals with nobody's name in it.
//
// LICENCES, exactly as their owners state them:
//   SEMCOG  — pavement, parks, and the 2020 Census municipal totals. SEMCOG's portal-wide Copyright License
//             Agreement (LICENSE_PAGE) grants a perpetual, royalty-free licence to reproduce and publish on the
//             condition that its notice is stated prominently, disclaims warranties, and asks the licensee to
//             indemnify SEMCOG. **Kyle accepted it as it stands, indemnification included, for every panel that
//             uses SEMCOG data (DECISIONS 2026-09-22.)** The notice travels in this file and is printed on every
//             SEMCOG-sourced panel. The pavement records are Michigan's Transportation Asset Management
//             Council's; the vacancy counts are the 2020 Census's. Both are named on their panels.
//   Census  — Building Permits Survey and TIGER. A work of the United States government, not subject to domestic
//             copyright (17 U.S.C. §105); neither page states a licence. We read PUBLISHED FILES over https,
//             not the Census Data API, so the API notice does not arise here — if that ever changes, the notice
//             "This product uses the Census Bureau Data API but is not endorsed or certified by the Census
//             Bureau." becomes a condition and must go on the panel (docs/02, NOTICE).
//   Wayne County — the parcel layer states no licence; the County GIS page carries a disclaimer only. Counts
//             only, and the count is a denominator, not a panel.
//
// IF A SOURCE REFUSES US, that panel is absent and the run says so. We never retry with a disguised request.
//
// Run: pnpm ingest:cities      By hand. SEMCOG gains a pavement year each January and a permits year each spring.

import { p, today, writeJson } from './util.js';
import { simplify } from './ingest-basemap.js';
import { LICENSE_PAGE, NOTICE } from './ingest-crashes.js';
import { regionPlaces } from './region.js';
import { TIGER_COUSUB } from './ingest-region.js';

type Pt = [number, number];

const SEMCOG = 'https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services';
export const PAVEMENT = `${SEMCOG}/Pavement_Condition_2003_to_2024/FeatureServer/80`;
export const PARKS = `${SEMCOG}/park_poly_2023_view/FeatureServer/0`;
export const MCD2020 = `${SEMCOG}/mcd_2020/FeatureServer/0`;
export const PARCELS = 'https://services1.arcgis.com/b6rkZNtCd6Mx2gvB/arcgis/rest/services/Parcels_AssessmentData/FeatureServer/0';
/** One plain text file per year, per Census region: place totals for new privately-owned housing units authorised. */
export const BPS_DIR = 'https://www2.census.gov/econ/bps/Place/Midwest%20Region';
export const BPS_PAGE = 'https://www.census.gov/construction/bps/';
/** The column the pavement layer's newest complete rating year lives in, and the year it stands for. */
export const PAVEMENT_YEAR = 2024;
/** How many years of building permits a page shows. Three or more is what makes the chart offerable. */
export const PERMIT_YEARS = 5;
/** Douglas-Peucker tolerance for a city outline, in units of 1e-5 degrees (about 4 m). Finer than the 12 a
 *  neighborhood uses and the 15 the map's boundary uses: Hamtramck is 2.1 square miles, and at 15 its outline
 *  came back as eleven points — a shape that is no longer the city's. */
export const CITY_TOL = 4;

const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };

/**
 * The four cities, with every key each source uses to name them. Nothing here is guessed: `semmcd` is SEMCOG's
 * own community code, `fips` is the Census place code, `muni` is the spelling in Wayne County's `Muni` field and
 * `tiger` the spelling in TIGER's `BASENAME`. The ids are the ones the clients route on (`#/n/city_<slug>`).
 */
export const CITIES = [
  { id: 'city_detroit', name: 'Detroit', semmcd: 5, fips: '22000', muni: 'Detroit', tiger: 'Detroit', children: 'neighborhood' as const },
  { id: 'city_hamtramck', name: 'Hamtramck', semmcd: 1090, fips: '36280', muni: 'Hamtramck', tiger: 'Hamtramck', children: 'none' as const },
  { id: 'city_highland_park', name: 'Highland Park', semmcd: 1100, fips: '38180', muni: 'Highland Park', tiger: 'Highland Park', children: 'none' as const },
  { id: 'city_dearborn', name: 'Dearborn', semmcd: 1025, fips: '21000', muni: 'Dearborn', tiger: 'Dearborn', children: 'none' as const },
];
export type CityKey = (typeof CITIES)[number];

/** The panels a Detroit neighborhood page has that no city page outside Detroit can have, and why. */
export const DETROIT_ONLY = ['sales', 'blight', 'demolitions', 'issues', 'fires', 'rentals', 'vacant_reg'] as const;

// ---- PASER ------------------------------------------------------------------------------------------------
/**
 * PASER is a 1-to-10 rating of a piece of road. The three groups below are **not ours**: they are the groups
 * Michigan's Transportation Asset Management Council and SEMCOG publish the ratings in. We never invent a score,
 * never average the ten values into one number and never call a city's roads "good" or "bad" — the panel states
 * the share of rated miles in each of the owner's own three categories and names the owner.
 */
export const PASER = { poor: [1, 2, 3, 4], fair: [5, 6, 7], good: [8, 9, 10] } as const;
export type PaserBand = keyof typeof PASER;
export const bandOf = (rating: number): PaserBand | null =>
  (Object.keys(PASER) as PaserBand[]).find((b) => (PASER[b] as readonly number[]).includes(rating)) ?? null;

export interface RoadBands { pieces: number; miles: number; good_pct: number; fair_pct: number; poor_pct: number }
/** Rated miles per PASER value into the owner's three bands. Percentages are of rated miles and add to 100. */
export function roadBands(byRating: { rating: number; pieces: number; miles: number }[]): RoadBands | null {
  const rated = byRating.filter((r) => bandOf(r.rating));
  const miles = rated.reduce((s, r) => s + r.miles, 0), pieces = rated.reduce((s, r) => s + r.pieces, 0);
  if (!pieces || miles <= 0) return null;
  const share = (b: PaserBand) => rated.filter((r) => bandOf(r.rating) === b).reduce((s, r) => s + r.miles, 0) / miles;
  const good = Math.round(share('good') * 100), fair = Math.round(share('fair') * 100);
  // The three add to 100 exactly: the largest band absorbs the rounding, so no page prints 99% or 101%.
  return { pieces, miles: Number(miles.toFixed(1)), good_pct: good, fair_pct: fair, poor_pct: 100 - good - fair };
}

// ---- the Census Building Permits Survey -------------------------------------------------------------------
export interface PermitYear { year: number; buildings: number; units: number; months_reported: number }
/**
 * One year's place row out of a Building Permits Survey regional file.
 *
 * The file is comma-delimited with a two-line header. Columns, from that header: 1 survey date, 2 state FIPS,
 * 6 place FIPS, 16 months reported, 17 place name, then four blocks of (buildings, units, value) for 1-unit,
 * 2-unit, 3-4 unit and 5+ unit buildings, followed by the same four blocks again as "reported" (imputation
 * removed). We read the FIRST four blocks — what the Bureau publishes as the year's total — and add the units.
 *
 * `months_reported` is carried and shown: where it is under 12 the place did not report every month and the
 * Bureau imputed the rest, which a page that prints the number has to say. A row is matched on **state and
 * place code**, never on the name: "Highland Park" is also a city in Illinois, in the same file.
 */
export function parseBps(text: string, year: number, state: string, fips: string): PermitYear | null {
  for (const line of text.split('\n')) {
    const c = line.split(',').map((s) => s.trim());
    if (c.length < 29 || c[1] !== state || c[5] !== fips) continue;
    const n = (i: number) => Number(c[i] ?? 0) || 0;
    return { year, buildings: n(17) + n(20) + n(23) + n(26), units: n(18) + n(21) + n(24) + n(27), months_reported: n(15) };
  }
  return null;
}

// ---- reading ----------------------------------------------------------------------------------------------
/** A refusal is reported, never worked around: no retry with a different name, no scraping of a query UI. */
const get = async (url: string): Promise<any> => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.slice(0, 140)} — stopping. A person should check whether the service is refusing us.`);
  const j = (await res.json()) as any;
  if (j.error) throw new Error(`${url.slice(0, 140)}: ${JSON.stringify(j.error)}`);
  return j;
};
const text = async (url: string): Promise<string | null> => {
  const res = await fetch(url, { headers: UA });
  if (res.status === 404) return null;                       // a year the Bureau has not published yet
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url} — stopping.`);
  return res.text();
};
const q = (layer: string, params: Record<string, string>) => get(`${layer}/query?${new URLSearchParams({ f: 'json', ...params })}`);
const edited = async (layer: string) => { const m = await get(`${layer}?f=json`); const d = m.editingInfo?.dataLastEditDate ?? m.editingInfo?.lastEditDate; return d ? today(new Date(d)) : today(); };
const count = (field: string, name = 'n') => ({ statisticType: 'count', onStatisticField: field, outStatisticFieldName: name });
const sum = (field: string, name: string) => ({ statisticType: 'sum', onStatisticField: field, outStatisticFieldName: name });
const pause = () => new Promise((r) => setTimeout(r, 300));

const ringsOf = (g: any): Pt[][] => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);

/**
 * Every place's outline and centre, from data/ingested/region.json: the Census Bureau's own county subdivisions and
 * its published internal point for each, the same outlines the map draws its boundaries from, so a city page and
 * the map never disagree about where a city ends. We never draw a centre of our own and never call it a city hall.
 */
function outlines(): Record<string, { rings: Pt[][]; center: Pt }> {
  const out: Record<string, { rings: Pt[][]; center: Pt }> = {};
  for (const m of regionPlaces()) {
    const rings = m.rings.map((r) => simplify(r, CITY_TOL).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))] as Pt)).filter((r) => r.length >= 8);
    if (rings.length) out[m.id] = { rings, center: m.center };
  }
  for (const c of CITIES) if (!out[c.id]) throw new Error(`cities: region.json has no outline for ${c.name}. Not overwriting the last good file.`);
  return out;
}

async function pavement(): Promise<Record<string, RoadBands | null>> {
  const col = `AS_OF_${String(PAVEMENT_YEAR).slice(2)}`;
  const out: Record<string, RoadBands | null> = {};
  for (const c of CITIES) {
    // A piece of road whose LEFT or RIGHT side is in this city counts for this city. A road that forms the
    // boundary between two of the four therefore appears in both, which is the honest reading of "the roads in
    // this city" and is said on the panel.
    const page = await q(PAVEMENT, { where: `(SEMMCDL = ${c.semmcd} OR SEMMCDR = ${c.semmcd}) AND ${col} >= 1`, groupByFieldsForStatistics: col, outStatistics: JSON.stringify([count('OBJECTID'), sum('LENMI', 'mi')]) });
    out[c.id] = roadBands((page.features ?? []).map((f: any) => ({ rating: Number(f.attributes[col]), pieces: Number(f.attributes.n ?? 0), miles: Number(f.attributes.mi ?? 0) })));
    await pause();
  }
  return out;
}

async function parks(): Promise<Record<string, { count: number; acres: number }>> {
  const page = await q(PARKS, { where: `semmcd IN (${CITIES.map((c) => c.semmcd).join(',')})`, groupByFieldsForStatistics: 'semmcd', outStatistics: JSON.stringify([count('OBJECTID'), sum('acres', 'ac')]) });
  const out: Record<string, { count: number; acres: number }> = {};
  for (const f of page.features ?? []) {
    const city = CITIES.find((c) => c.semmcd === Number(f.attributes.semmcd));
    if (city) out[city.id] = { count: Number(f.attributes.n ?? 0), acres: Number(Number(f.attributes.ac ?? 0).toFixed(0)) };
  }
  return out;
}

export interface Vacancy { housing_units: number; vacant: number; pct: number; population: number; land_acres: number }
async function vacancy(): Promise<Record<string, Vacancy>> {
  const page = await q(MCD2020, { where: `semmcd IN (${CITIES.map((c) => c.semmcd).join(',')})`, outFields: 'semmcd,pop_tot,hu_tot,hu_vac,landacre', returnGeometry: 'false' });
  const out: Record<string, Vacancy> = {};
  for (const f of page.features ?? []) {
    const a = f.attributes, city = CITIES.find((c) => c.semmcd === Number(a.semmcd));
    if (!city || !(a.hu_tot > 0)) continue;
    out[city.id] = { housing_units: Number(a.hu_tot), vacant: Number(a.hu_vac), pct: Math.round((Number(a.hu_vac) / Number(a.hu_tot)) * 100), population: Number(a.pop_tot), land_acres: Number(Number(a.landacre).toFixed(0)) };
  }
  return out;
}

async function parcels(): Promise<Record<string, number>> {
  // Counts only. This layer holds OwnerName and OwnerAddress; neither is ever put in outFields.
  const page = await q(PARCELS, { where: `Muni IN (${CITIES.map((c) => `'${c.muni}'`).join(', ')})`, groupByFieldsForStatistics: 'Muni', outStatistics: JSON.stringify([count('OBJECTID')]) });
  const out: Record<string, number> = {};
  for (const f of page.features ?? []) { const city = CITIES.find((c) => c.muni === String(f.attributes.Muni)); if (city) out[city.id] = Number(f.attributes.n ?? 0); }
  return out;
}

async function permits(): Promise<{ by: Record<string, PermitYear[]>; years: number[] }> {
  const by: Record<string, PermitYear[]> = Object.fromEntries(CITIES.map((c) => [c.id, [] as PermitYear[]]));
  const years: number[] = [];
  // Walk back from last year until we have PERMIT_YEARS the Bureau has actually published.
  for (let y = new Date().getUTCFullYear() - 1; years.length < PERMIT_YEARS && y > 2015; y--) {
    const body = await text(`${BPS_DIR}/mw${y}a.txt`);
    if (!body) continue;
    years.unshift(y);
    for (const c of CITIES) { const row = parseBps(body, y, '26', c.fips); if (row) by[c.id]!.push(row); }
    await pause();
  }
  for (const c of CITIES) by[c.id]!.sort((a, b) => a.year - b.year);
  return { by, years };
}

async function main(): Promise<void> {
  const rings = outlines();
  const [roads, park, vac, parc, perm] = [await pavement(), await parks(), await vacancy(), await parcels(), await permits()];
  const semcogNotice = NOTICE(new Date().getUTCFullYear());
  const semcog = (name: string, url: string, lastEdited: string, records?: string) => ({
    name, url, page: 'https://maps-semcog.opendata.arcgis.com/', license: 'SEMCOG Copyright License Agreement',
    license_url: LICENSE_PAGE, notice: NOTICE(lastEdited.slice(0, 4)), last_edited: lastEdited, ...(records ? { records_from: records } : {}),
  });
  const sources = {
    outlines: { name: 'U.S. Census Bureau TIGERweb: county subdivisions (cities and townships)', url: TIGER_COUSUB, page: 'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html', license: 'No licence stated; a work of the United States government (17 U.S.C. §105)', last_edited: today() },
    roads: semcog('SEMCOG — Pavement Condition 2003 to 2024 (PASER)', PAVEMENT, await edited(PAVEMENT), "Michigan's Transportation Asset Management Council"),
    parks: semcog('SEMCOG — Parks and amenities', PARKS, await edited(PARKS)),
    vacancy: semcog('SEMCOG — 2020 Census totals by community', MCD2020, await edited(MCD2020), 'the 2020 U.S. Census'),
    permits: { name: 'U.S. Census Bureau — Building Permits Survey, annual place totals', url: `${BPS_DIR}/`, page: BPS_PAGE, license: 'No licence stated; a work of the United States government (17 U.S.C. §105)', last_edited: today(), records_from: 'the permit-issuing place' },
    parcels: { name: 'Wayne County — Parcels and assessment data', url: PARCELS, page: 'https://www.waynecounty.com/departments/mb/gis.aspx', license: 'None stated (a disclaimer only)', last_edited: await edited(PARCELS) },
  };
  const cities = CITIES.map((c) => ({
    id: c.id, name: c.name, semmcd: c.semmcd, fips_place: c.fips, children: c.children,
    center: rings[c.id]!.center, rings: rings[c.id]!.rings,
    ...(park[c.id] ? { parks: park[c.id] } : {}),
    ...(roads[c.id] ? { roads: roads[c.id] } : {}),
    ...(vac[c.id] ? { vacancy: vac[c.id] } : {}),
    ...(parc[c.id] ? { parcels: parc[c.id] } : {}),
    permits: perm.by[c.id] ?? [],
  }));
  // Every other place in the area (Kyle, 2026-09-24: "an outline and name, with no stats page yet"): its outline,
  // its centre and the help listed inside it. No panel is fetched for it, so none is drawn; the allow-list in
  // indicators.ts is what keeps an absent number absent rather than zero.
  for (const m of regionPlaces()) {
    if (CITIES.some((c) => c.id === m.id) || !rings[m.id]) continue;
    cities.push({ id: m.id, name: m.name, semmcd: m.semmcd, fips_place: '', children: 'none' as const, outline_only: true, center: rings[m.id]!.center, rings: rings[m.id]!.rings, permits: [] } as unknown as (typeof cities)[number]);
  }
  writeJson(p('data/ingested/cities.json'), {
    fetched_at: today(), semcog_notice: semcogNotice, permit_years: perm.years,
    paser: PASER, pavement_year: PAVEMENT_YEAR, detroit_only: DETROIT_ONLY,
    kept: 'Counts and shares only, every one added up by the owner\'s own server: rated road miles by PASER band, parks and acres, 2020 Census housing units and vacant units, parcels, and new housing units authorised by building permits per year. No parcel, park or road record is downloaded, and no name field is ever asked for.',
    sources, cities,
  });
  for (const c of cities) {
    console.log(`${c.name}: parks ${c.parks?.count ?? '—'} (${c.parks?.acres ?? '—'} acres), roads ${c.roads ? `${c.roads.miles} rated miles, ${c.roads.good_pct}% good / ${c.roads.fair_pct}% fair / ${c.roads.poor_pct}% poor` : 'not published'}, empty homes ${c.vacancy ? `${c.vacancy.vacant} of ${c.vacancy.housing_units} (${c.vacancy.pct}%)` : '—'}, parcels ${c.parcels ?? '—'}, permits ${c.permits.map((y) => `${y.year}:${y.units}`).join(' ') || 'none'}`);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-cities.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
