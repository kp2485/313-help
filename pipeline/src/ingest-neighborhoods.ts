// Neighborhood indicators, the two network steps (docs/13). Public City datasets only: nothing here ever
// touches reports, app usage, or anything a phone sends.
//
//   neighborhoods  the City's 205 named neighborhoods (polygons, council district)   -> data/ingested/neighborhoods.json
//   stats          per neighborhood and year, added up BY THE CITY'S SERVER:
//                    arm's-length residential sales (count, median price) and building permits issued
//                    (count, estimated cost)                                          -> data/ingested/city_stats.json
//
// We never download a sale or a permit record, so buyer and seller names never reach this repo. Small numbers
// are dropped here, before anything is written: a count under 5 is stored as "lt5", and a median needs 10 sales.

import { p, slug, writeJson } from './util.js';
import { simplify } from './ingest-basemap.js';

const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';
const HOODS = `${ORG}/Current_City_of_Detroit_Neighborhoods/FeatureServer/0`;
const JLG_STUDY = `${ORG}/Joe_Louis_Greenway_Study_Area_Neighborhoods_Only_view/FeatureServer/0`;
const SALES = `${ORG}/assessor_property_sales_view/FeatureServer/0`;
const PERMITS = `${ORG}/bseed_building_permits/FeatureServer/0`;
const UA = { 'user-agent': 'detroithelp-pipeline (open-source civic directory; one polite pass)' };
export const FIRST_YEAR = 2019;

type Pt = [number, number];
export interface Neighborhood { id: string; name: string; district: number | null; center: Pt; rings: Pt[][]; jlg_study_area?: boolean }
export type Count = number | 'lt5';
export interface YearStats { sales?: Count; median_price?: number; permits?: Count; permit_cost?: number }

const get = async (url: string) => { const j = (await (await fetch(url, { headers: UA })).json()) as any; if (j.error) throw new Error(`${url.slice(0, 120)}: ${JSON.stringify(j.error)}`); return j; };
const edited = async (layer: string) => { const m = await get(`${layer}?f=json`); return new Date(m.editingInfo?.dataLastEditDate ?? m.editingInfo?.lastEditDate).toISOString().slice(0, 10); };
const q = (layer: string, params: Record<string, string>) => get(`${layer}/query?${new URLSearchParams({ f: 'json', ...params })}`);

/** The same place can be spelled two ways across City datasets ("Mc Dougall-Hunt"). Compare on letters and digits only. */
export const nameKey = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export function pointInRing(pt: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** Do two outlines overlap? Good enough for city shapes: a corner of one lies inside the other. */
const overlaps = (a: Pt[], b: Pt[]) => a.some((q2) => pointInRing(q2, b)) || b.some((q2) => pointInRing(q2, a));

/** `studyRings`: the City's own greenway planning-study areas. A neighborhood that overlaps one is in the greenway lens. */
export function toNeighborhoods(features: any[], studyRings: Pt[][]): Neighborhood[] {
  const seen = new Set<string>();
  return features.map((f) => {
    const name = String(f.properties?.nhood_name ?? '').replace(/\s+/g, ' ').trim(), g = f.geometry;
    const polys: Pt[][][] = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = polys.map((poly) => simplify(poly[0]!, 12).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))] as Pt)).filter((r) => r.length >= 4);
    if (!name || !rings.length) return null;
    let id = `nbh_${slug(name)}`; while (seen.has(id)) id += '_b'; seen.add(id);
    const big = rings.reduce((a, b) => (b.length > a.length ? b : a));
    const center: Pt = [Number((big.reduce((s, q2) => s + q2[0], 0) / big.length).toFixed(5)), Number((big.reduce((s, q2) => s + q2[1], 0) / big.length).toFixed(5))];
    const d = Number(f.properties?.council_district);
    return { id, name, district: d >= 1 && d <= 7 ? d : null, center, rings, ...(rings.some((r) => studyRings.some((sr) => overlaps(r, sr))) ? { jlg_study_area: true } : {}) };
  }).filter((n): n is Neighborhood => !!n).sort((a, b) => a.id.localeCompare(b.id));
}

/** Honesty rule 2 (docs/13), applied before anything is stored. */
export function suppress(n: number, median?: number | null, cost?: number | null): { count: Count; median?: number; cost?: number } {
  if (n < 5) return { count: 'lt5' };
  return { count: n, ...(median != null && n >= 10 ? { median: Math.round(median) } : {}), ...(cost != null ? { cost: Math.round(cost) } : {}) };
}

async function neighborhoods(): Promise<Neighborhood[]> {
  const fc = await get(`${HOODS}/query?where=1%3D1&outFields=nhood_name,council_district&outSR=4326&geometryPrecision=6&f=geojson`);
  const jlg = await get(`${JLG_STUDY}/query?where=1%3D1&outFields=Name_Nhood&outSR=4326&geometryPrecision=5&f=geojson`);
  const studyRings: Pt[][] = (jlg.features ?? []).flatMap((f: any) => (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates[0]] : (f.geometry?.coordinates ?? []).map((poly: Pt[][]) => poly[0])));
  const list = toNeighborhoods(fc.features ?? [], studyRings);
  if (list.length < 190) throw new Error(`neighborhoods: only ${list.length} parsed. Not overwriting the last good file.`);
  writeJson(p('data/ingested/neighborhoods.json'), { source: { name: 'City of Detroit neighborhoods layer', url: HOODS, last_edited: await edited(HOODS) }, neighborhoods: list });
  console.log(`neighborhoods: ${list.length}; ${list.filter((n) => n.jlg_study_area).length} in the City's greenway study area`);
  return list;
}

async function stats(hoods: Neighborhood[]): Promise<void> {
  const byKey = new Map(hoods.map((n) => [nameKey(n.name), n.id]));
  const out: Record<string, Record<string, YearStats>> = {}, city: Record<string, YearStats> = {}, unmatched = new Set<string>();
  const put = (name: string | null, year: number, s: YearStats) => {
    const id = name ? byKey.get(nameKey(name)) : undefined;
    if (!id) { if (name) unmatched.add(name); return; }
    ((out[id] ??= {})[year] ??= {}); Object.assign(out[id]![year]!, s);
  };
  const thisYear = new Date().getUTCFullYear();
  for (let y = FIRST_YEAR; y <= thisYear; y++) {
    const span = (f: string) => `${f} >= DATE '${y}-01-01' AND ${f} < DATE '${y + 1}-01-01'`;
    // Arm's-length sales of homes only: no family transfers, no government or bulk sales, no $1 deeds.
    const salesWhere = `${span('sale_date')} AND property_class_description = 'RESIDENTIAL' AND term_of_sale = '03-ARM''S LENGTH' AND amt_sale_price > 1000`;
    const salesStats = JSON.stringify([{ statisticType: 'count', onStatisticField: 'sale_id', outStatisticFieldName: 'n' }, { statisticType: 'PERCENTILE_CONT', statisticParameters: { value: 0.5 }, onStatisticField: 'amt_sale_price', outStatisticFieldName: 'median' }]);
    const permitStats = JSON.stringify([{ statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'n' }, { statisticType: 'sum', onStatisticField: 'amt_estimated_contractor_cost', outStatisticFieldName: 'cost' }]);
    const [s, sAll, b, bAll] = [
      await q(SALES, { where: salesWhere, groupByFieldsForStatistics: 'neighborhood', outStatistics: salesStats }), await q(SALES, { where: salesWhere, outStatistics: salesStats }),
      await q(PERMITS, { where: span('issued_date'), groupByFieldsForStatistics: 'neighborhood', outStatistics: permitStats }), await q(PERMITS, { where: span('issued_date'), outStatistics: permitStats }),
    ];
    for (const f of s.features ?? []) { const r = suppress(f.attributes.n, f.attributes.median); put(f.attributes.neighborhood, y, { sales: r.count, ...(r.median ? { median_price: r.median } : {}) }); }
    for (const f of b.features ?? []) { const r = suppress(f.attributes.n, null, f.attributes.cost); put(f.attributes.neighborhood, y, { permits: r.count, ...(r.cost ? { permit_cost: r.cost } : {}) }); }
    const cs = suppress(sAll.features?.[0]?.attributes.n ?? 0, sAll.features?.[0]?.attributes.median), cb = suppress(bAll.features?.[0]?.attributes.n ?? 0, null, bAll.features?.[0]?.attributes.cost);
    city[y] = { sales: cs.count, ...(cs.median ? { median_price: cs.median } : {}), permits: cb.count, ...(cb.cost ? { permit_cost: cb.cost } : {}) };
    console.log(`stats ${y}: city sales ${cs.count} (median ${cs.median ?? 'n/a'}), permits ${cb.count}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  if (unmatched.size) console.warn(`stats: ${unmatched.size} neighborhood names in the City's sales/permit data match no neighborhood polygon and were left out: ${[...unmatched].sort().join('; ')}`);
  writeJson(p('data/ingested/city_stats.json'), {
    sources: { sales: { name: 'City of Detroit Assessor: property sales', url: SALES, last_edited: await edited(SALES) }, permits: { name: 'City of Detroit BSEED: building permits', url: PERMITS, last_edited: await edited(PERMITS) } },
    fetched_at: new Date().toISOString().slice(0, 10), first_year: FIRST_YEAR, partial_year: thisYear, city, neighborhoods: out,
  });
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-neighborhoods.ts')) {
  neighborhoods().then(stats).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
