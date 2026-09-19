// Neighborhood indicators, the two network steps (docs/13). Public City datasets only: nothing here ever
// touches reports, app usage, or anything a phone sends.
//
//   neighborhoods  the City's 205 named neighborhoods (polygons, council district)   -> data/ingested/neighborhoods.json
//   stats          per neighborhood and year, added up BY THE CITY'S SERVER:
//                    arm's-length residential sales (count, median price) and building permits issued
//                    (count, estimated cost); blight tickets and demolitions (counts); dumping, tree, park and
//                    street-light issues people reported to the City (count, median days to close); parcels (count)
//                    fires in buildings (count; see FIRE_TYPES for exactly which calls)
//                  and, as of today rather than per year: active rental certificates, vacant-building
//                    registrations of the past 12 months (counts), and the share of rated main-street length in
//                    poor condition (the one layer with no neighborhood field: see pavement() below)
//                                                                                     -> data/ingested/city_stats.json
//   points         where people can use a Bridge card (SNAP stores) and DDOT bus stops: public places, like
//                    parks. Coordinates and a grocery flag only: no store name, no address  -> data/ingested/city_points.json
//
// We never download a sale or a permit record, so buyer and seller names never reach this repo. The rental,
// fire and vacant-building layers carry addresses and (vacant) owner names: we only ever ask them for counts.
// Small numbers are dropped here, before anything is written: a count under 5 is stored as "lt5", and a median
// needs 10 sales.

import { writeFileSync } from 'node:fs';
import { p, slug, writeJson, today } from './util.js';
import { simplify } from './ingest-basemap.js';

const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';
const HOODS = `${ORG}/Current_City_of_Detroit_Neighborhoods/FeatureServer/0`;
const JLG_STUDY = `${ORG}/Joe_Louis_Greenway_Study_Area_Neighborhoods_Only_view/FeatureServer/0`;
const SALES = `${ORG}/assessor_property_sales_view/FeatureServer/0`;
const PERMITS = `${ORG}/bseed_building_permits/FeatureServer/0`;
const BLIGHT = `${ORG}/blight_tickets/FeatureServer/0`;
const DEMOS = `${ORG}/city_completed_demolitions/FeatureServer/0`;
const ISSUES = `${ORG}/improve_detroit/FeatureServer/0`;
const PARCELS = `${ORG}/parcel_file_current/FeatureServer/0`;
const SNAP = `${ORG}/SNAP_Retailer_Locations/FeatureServer/0`;
const BUS = `${ORG}/DDOT_Bus_Stops/FeatureServer/0`;               // not DDOT_Bus_Stops_102023, the older copy
const RENTALS = `${ORG}/bseed_active_residential_compliance_certificates/FeatureServer/0`;
const FIRES = `${ORG}/Fire_Incidents/FeatureServer/0`;
const PAVEMENT = `${ORG}/annual_pavement_conditions/FeatureServer/0`;
const VACANT = `${ORG}/bseed_vacant_property_registrations/FeatureServer/0`;
/** Improve Detroit request types we count. Things, never people: "Squatters Issue" and the like are left out on purpose (docs/11). */
export const ISSUE_TYPES = ['Illegal Dump Sites', 'Tree Issue', 'Park Issue', 'Street Light Out'];
/**
 * Fire Department incident types we count as "a fire in a building" (checked by hand 2026-09-19 against every
 * type in the layer). The layer holds every call: medical assists, crashes, false alarms, smoke scares, gas
 * leaks. None of those are here. Car fires and outdoor (trash, grass) fires are left out too: before 2025 the
 * layer's car type is just "Automobile", which we can't tell apart from a crash call.
 * The City renamed its types twice: NFIRS names until 2025 (when "Cooking fire, no flame damage" replaced
 * "Cooking fire, confined to container" at the same yearly count), NERIS "Fire - Structure Fire - ..." from 2026.
 */
export const FIRE_TYPES = [
  'Building fire', 'Cooking fire, confined to container', 'Cooking fire, no flame damage', 'Chimney or flue fire, confined to chimney or flue',
  'Fuel burner/boiler malfunction, fire confined', 'Incinerator overload or malfunction, fire confined', 'Commercial Compactor fire, confined to rubbish',
  'Trash or rubbish fire, contained', 'Fire contained to trash can inside of structure', 'Fires in structures other than in a building', 'Fires in structure other than in a building',
  'Fire in mobile home used as fixed residence', 'Fire in portable building, fixed location',
  'Fire - Structure Fire - Structural Involvement', 'Fire - Structure Fire - Room and Contents Fire', 'Fire - Structure Fire - Confined Cooking / Appliance Fire', 'Fire - Structure Fire - Chimney Fire',
];
export const isBuildingFire = (type: string) => FIRE_TYPES.includes(type.trim());
/** Types that look like a building fire but aren't counted: printed at ingest so a new City type is looked at by a person, not silently dropped. */
export const uncountedFireTypes = (seen: string[]) => seen.filter((t) => /\b(structure fire|building fire|cooking fire|chimney)/i.test(t) && !isBuildingFire(t));
/** SNAP store types that count as a grocery store (the rest are mostly corner and gas-station stores). */
const GROCERY = ['Grocery Store', 'Supermarket', 'Super Store'];
/** Pavement ratings (PASER, 1 to 10) of 1 to 4 are "poor", as Michigan's Transportation Asset Management Council groups them. */
export const POOR_MAX = 4;
const UA = { 'user-agent': 'detroithelp-pipeline (open-source civic directory; one polite pass)' };
export const FIRST_YEAR = 2019;

type Pt = [number, number];
export interface Neighborhood { id: string; name: string; district: number | null; center: Pt; rings: Pt[][]; jlg_study_area?: boolean }
export type Count = number | 'lt5';
export interface YearStats { sales?: Count; median_price?: number; permits?: Count; permit_cost?: number; blight?: Count; demolitions?: Count; issues?: Count; issue_days?: number; fires?: Count }
/** Numbers that describe today, not a year: rental certificates in force, vacant registrations of the past 12 months, street ratings. */
export interface NowStats { rental_certs?: Count; vacant_reg?: Count; roads?: { pieces: Count; miles?: number; poor_pct?: number } }
export interface RoadTotals { pieces: number; miles: number; poor_miles: number }

const get = async (url: string) => { const j = (await (await fetch(url, { headers: UA })).json()) as any; if (j.error) throw new Error(`${url.slice(0, 120)}: ${JSON.stringify(j.error)}`); return j; };
const edited = async (layer: string) => { const m = await get(`${layer}?f=json`); return today(new Date(m.editingInfo?.dataLastEditDate ?? m.editingInfo?.lastEditDate)); };
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

export const sqlIn = (field: string, values: string[]) => `${field} IN (${values.map((v) => `'${v.split("'").join("''")}'`).join(', ')})`;

/** The point halfway along a street piece (by length, with longitude scaled for Detroit's latitude). */
export function pathMidpoint(path: Pt[]): Pt {
  const k = Math.cos((path[0]![1] * Math.PI) / 180), len = (a: Pt, b: Pt) => Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
  const total = path.slice(1).reduce((s, q2, i) => s + len(path[i]!, q2), 0);
  let left = total / 2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, l = len(a, b);
    if (l > 0 && left <= l) { const t = left / l; return [Number((a[0] + (b[0] - a[0]) * t).toFixed(5)), Number((a[1] + (b[1] - a[1]) * t).toFixed(5))]; }
    left -= l;
  }
  return [Number(path[0]![0].toFixed(5)), Number(path[0]![1].toFixed(5))];
}

/** Rated street pieces, added up per neighborhood by the outline their middle falls in. Unrated pieces (0) are skipped. */
export function roadsByHood(pieces: { cond: number; miles: number; mid: Pt }[], hoods: Neighborhood[]): { byHood: Record<string, RoadTotals>; city: RoadTotals } {
  const boxes = hoods.map((n) => { const b = n.rings.flat(); return { n, x0: Math.min(...b.map((q2) => q2[0])), x1: Math.max(...b.map((q2) => q2[0])), y0: Math.min(...b.map((q2) => q2[1])), y1: Math.max(...b.map((q2) => q2[1])) }; });
  const byHood: Record<string, RoadTotals> = {}, city: RoadTotals = { pieces: 0, miles: 0, poor_miles: 0 };
  const add = (t: RoadTotals, x: { cond: number; miles: number }) => { t.pieces++; t.miles += x.miles; if (x.cond <= POOR_MAX) t.poor_miles += x.miles; };
  for (const x of pieces) {
    if (!(x.cond >= 1)) continue;
    add(city, x);
    const [lon, lat] = x.mid, hit = boxes.find((b) => lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 && b.n.rings.some((r) => pointInRing(x.mid, r)));
    if (hit) add((byHood[hit.n.id] ??= { pieces: 0, miles: 0, poor_miles: 0 }), x);
  }
  return { byHood, city };
}

/** Honesty rule 2 for street ratings: fewer than 5 pieces is "lt5", and a share needs at least 10 rated pieces. */
export function roadShare(t: RoadTotals | undefined): NowStats['roads'] {
  if (!t) return undefined;
  if (t.pieces < 5) return { pieces: 'lt5' };
  return { pieces: t.pieces, miles: Number(t.miles.toFixed(1)), ...(t.pieces >= 10 && t.miles > 0 ? { poor_pct: Math.round((t.poor_miles / t.miles) * 100) } : {}) };
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
    // Conditions (docs/13 step 4). Counts only: the blight layer carries owner names, which we never ask for.
    const countStat = (field: string) => JSON.stringify([{ statisticType: 'count', onStatisticField: field, outStatisticFieldName: 'n' }]);
    const issueWhere = `${span('created_at')} AND request_type IN (${ISSUE_TYPES.map((t) => `'${t}'`).join(', ')})`;
    const issueStats = JSON.stringify([{ statisticType: 'count', onStatisticField: 'issue_id', outStatisticFieldName: 'n' }, { statisticType: 'PERCENTILE_CONT', statisticParameters: { value: 0.5 }, onStatisticField: 'num_days_to_close', outStatisticFieldName: 'median' }]);
    const grouped = { groupByFieldsForStatistics: 'neighborhood' };
    // Fires in buildings only (FIRE_TYPES). exposure_number 0 is the fire itself: a fire that spreads to the
    // house next door adds a row for that "exposure", which would count one fire twice.
    const fireWhere = `${span('called_at')} AND exposure_number = 0 AND ${sqlIn('incident_type_description', FIRE_TYPES)}`;
    const [bl, blAll, de, deAll, is, isAll, fi, fiAll] = [
      await q(BLIGHT, { where: span('ticket_issued_date'), ...grouped, outStatistics: countStat('ticket_id') }), await q(BLIGHT, { where: span('ticket_issued_date'), outStatistics: countStat('ticket_id') }),
      await q(DEMOS, { where: span('demolition_date'), ...grouped, outStatistics: countStat('ObjectId') }), await q(DEMOS, { where: span('demolition_date'), outStatistics: countStat('ObjectId') }),
      await q(ISSUES, { where: issueWhere, ...grouped, outStatistics: issueStats }), await q(ISSUES, { where: issueWhere, outStatistics: issueStats }),
      await q(FIRES, { where: fireWhere, ...grouped, outStatistics: countStat('ObjectId') }), await q(FIRES, { where: fireWhere, outStatistics: countStat('ObjectId') }),
    ];
    for (const f of bl.features ?? []) put(f.attributes.neighborhood, y, { blight: suppress(f.attributes.n).count });
    for (const f of de.features ?? []) put(f.attributes.neighborhood, y, { demolitions: suppress(f.attributes.n).count });
    for (const f of is.features ?? []) { const r = suppress(f.attributes.n, f.attributes.median); put(f.attributes.neighborhood, y, { issues: r.count, ...(r.median !== undefined ? { issue_days: r.median } : {}) }); }
    for (const f of fi.features ?? []) put(f.attributes.neighborhood, y, { fires: suppress(f.attributes.n).count });
    const ci = suppress(isAll.features?.[0]?.attributes.n ?? 0, isAll.features?.[0]?.attributes.median);
    const conditions: YearStats = { blight: suppress(blAll.features?.[0]?.attributes.n ?? 0).count, demolitions: suppress(deAll.features?.[0]?.attributes.n ?? 0).count, issues: ci.count, ...(ci.median !== undefined ? { issue_days: ci.median } : {}), fires: suppress(fiAll.features?.[0]?.attributes.n ?? 0).count };
    for (const f of s.features ?? []) { const r = suppress(f.attributes.n, f.attributes.median); put(f.attributes.neighborhood, y, { sales: r.count, ...(r.median ? { median_price: r.median } : {}) }); }
    for (const f of b.features ?? []) { const r = suppress(f.attributes.n, null, f.attributes.cost); put(f.attributes.neighborhood, y, { permits: r.count, ...(r.cost ? { permit_cost: r.cost } : {}) }); }
    const cs = suppress(sAll.features?.[0]?.attributes.n ?? 0, sAll.features?.[0]?.attributes.median), cb = suppress(bAll.features?.[0]?.attributes.n ?? 0, null, bAll.features?.[0]?.attributes.cost);
    city[y] = { sales: cs.count, ...(cs.median ? { median_price: cs.median } : {}), permits: cb.count, ...(cb.cost ? { permit_cost: cb.cost } : {}), ...conditions };
    console.log(`stats ${y}: city sales ${cs.count} (median ${cs.median ?? 'n/a'}), permits ${cb.count}, blight tickets ${conditions.blight}, demolitions ${conditions.demolitions}, issues ${conditions.issues} (median ${conditions.issue_days ?? 'n/a'} days), building fires ${conditions.fires}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  // Parcels per neighborhood: the denominator for "blight tickets per 1,000 parcels" (honesty rule 3).
  const parcels: Record<string, number> = {}; let cityParcels = 0;
  const pc = await q(PARCELS, { where: '1=1', groupByFieldsForStatistics: 'neighborhood', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'n' }]) });
  for (const f of pc.features ?? []) { cityParcels += f.attributes.n; const id = f.attributes.neighborhood ? byKey.get(nameKey(f.attributes.neighborhood)) : undefined; if (id) parcels[id] = (parcels[id] ?? 0) + f.attributes.n; }
  // A new fire type the City starts using must be looked at by a person, not silently left out.
  const types = await q(FIRES, { where: `called_at >= DATE '${FIRST_YEAR}-01-01'`, groupByFieldsForStatistics: 'incident_type_description', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'n' }]) });
  const odd = uncountedFireTypes((types.features ?? []).map((f: any) => String(f.attributes.incident_type_description ?? '')));
  if (odd.length) console.warn(`fires: these types look like building fires but are not in FIRE_TYPES, so they are not counted. Check them by hand: ${odd.join('; ')}`);

  // Numbers that describe today (not a year), counted by the City's server per neighborhood.
  const now: Record<string, NowStats> = {}, cityNow: NowStats = {};
  const putNow = (name: string | null, s: NowStats) => { const id = name ? byKey.get(nameKey(name)) : undefined; if (id) Object.assign((now[id] ??= {}), s); else if (name) unmatched.add(name); };
  const count1 = (field: string) => JSON.stringify([{ statisticType: 'count', onStatisticField: field, outStatisticFieldName: 'n' }]);
  // Rental certificates of compliance in force today: the layer holds only active ones; the date check makes sure.
  const rentWhere = `expired_date >= DATE '${today()}'`;
  const [rn, rnAll] = [await q(RENTALS, { where: rentWhere, groupByFieldsForStatistics: 'neighborhood', outStatistics: count1('ObjectId') }), await q(RENTALS, { where: rentWhere, outStatistics: count1('ObjectId') })];
  for (const f of rn.features ?? []) putNow(f.attributes.neighborhood, { rental_certs: suppress(f.attributes.n).count });
  cityNow.rental_certs = suppress(rnAll.features?.[0]?.attributes.n ?? 0).count;
  // Vacant-building registrations issued in the past 12 months. Counts only: this layer carries owner names.
  const yearAgo = today(new Date(Date.now() - 365 * 864e5)), vacWhere = `issued_date >= DATE '${yearAgo}'`;
  const [va, vaAll] = [await q(VACANT, { where: vacWhere, groupByFieldsForStatistics: 'neighborhood', outStatistics: count1('ObjectId') }),
    await q(VACANT, { where: vacWhere, outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'ObjectId', outStatisticFieldName: 'n' }, { statisticType: 'min', onStatisticField: 'issued_date', outStatisticFieldName: 'a' }, { statisticType: 'max', onStatisticField: 'issued_date', outStatisticFieldName: 'b' }]) })];
  for (const f of va.features ?? []) putNow(f.attributes.neighborhood, { vacant_reg: suppress(f.attributes.n).count });
  const vAll = vaAll.features?.[0]?.attributes ?? {};
  cityNow.vacant_reg = suppress(vAll.n ?? 0).count;
  const day = (v: unknown) => (typeof v === 'number' ? today(new Date(v)) : String(v ?? '').slice(0, 10));
  const vacantPeriod: [string, string] = [day(vAll.a) || yearAgo, day(vAll.b) || today()];
  // Street ratings: the one layer with no neighborhood field.
  const roads = await pavement(hoods);
  for (const [id, t] of Object.entries(roads.totals.byHood)) Object.assign((now[id] ??= {}), { roads: roadShare(t) });
  cityNow.roads = roadShare(roads.totals.city);
  console.log(`now: rental certificates ${cityNow.rental_certs}, vacant registrations ${cityNow.vacant_reg} (${vacantPeriod.join(' to ')}), main streets rated ${roads.totals.city.pieces} pieces, ${roads.totals.city.miles.toFixed(0)} miles, ${cityNow.roads?.poor_pct}% poor (ratings ${roads.years.join('-')})`);

  if (unmatched.size) console.warn(`stats: ${unmatched.size} neighborhood names in the City's data match no neighborhood polygon and were left out: ${[...unmatched].sort().join('; ')}`);
  writeJson(p('data/ingested/city_stats.json'), {
    sources: { sales: { name: 'City of Detroit Assessor: property sales', url: SALES, last_edited: await edited(SALES) }, permits: { name: 'City of Detroit BSEED: building permits', url: PERMITS, last_edited: await edited(PERMITS) },
      blight: { name: 'City of Detroit: blight tickets', url: BLIGHT, last_edited: await edited(BLIGHT) }, demolitions: { name: 'City of Detroit: completed demolitions', url: DEMOS, last_edited: await edited(DEMOS) },
      issues: { name: 'Improve Detroit: issues people reported to the City', url: ISSUES, last_edited: await edited(ISSUES) }, parcels: { name: 'City of Detroit Assessor: parcels', url: PARCELS, last_edited: await edited(PARCELS) },
      rentals: { name: 'City of Detroit BSEED: active rental certificates of compliance', url: RENTALS, last_edited: await edited(RENTALS) },
      fires: { name: 'Detroit Fire Department: fire incidents', url: FIRES, last_edited: await edited(FIRES) },
      pavement: { name: 'City of Detroit: street pavement ratings', url: PAVEMENT, last_edited: await edited(PAVEMENT) },
      vacant: { name: 'City of Detroit BSEED: vacant property registrations', url: VACANT, last_edited: await edited(VACANT) } },
    issue_types: ISSUE_TYPES, fire_types: FIRE_TYPES, parcels, city_parcels: cityParcels,
    fetched_at: today(), first_year: FIRST_YEAR, partial_year: thisYear, city, neighborhoods: out,
    roads_years: roads.years, vacant_period: vacantPeriod, current: { city: cityNow, neighborhoods: now },
  });
}

/**
 * Street ratings (PASER 1 to 10) for main streets. The layer rates every piece for every year back to 2003; only
 * the row for the year a piece was actually looked at (condition_year = year_last_evaluated) is a real rating,
 * so we use that one. Freeways (NFC 1 and 2) are left out; the layer holds no side streets at all.
 * No neighborhood field, so we download the rating, length and line of each piece (nothing else), find the
 * point halfway along it, and add it up by neighborhood here. Only the totals are written.
 */
async function pavement(hoods: Neighborhood[]): Promise<{ totals: ReturnType<typeof roadsByHood>; years: [number, number] }> {
  const pieces: { cond: number; miles: number; mid: Pt }[] = []; let y0 = 9999, y1 = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await q(PAVEMENT, { where: 'condition_year = year_last_evaluated AND nfc_type >= 3 AND condition >= 1', outFields: 'condition,condition_year,length_in_miles', returnGeometry: 'true', outSR: '4326', geometryPrecision: '5', orderByFields: 'ObjectId', resultOffset: String(offset), resultRecordCount: '1000' });
    for (const f of page.features ?? []) {
      const path = f.geometry?.paths?.[0] as Pt[] | undefined;
      if (!path?.length) continue;
      pieces.push({ cond: f.attributes.condition, miles: f.attributes.length_in_miles ?? 0, mid: pathMidpoint(path) });
      y0 = Math.min(y0, f.attributes.condition_year); y1 = Math.max(y1, f.attributes.condition_year);
    }
    if (!page.exceededTransferLimit && (page.features ?? []).length < 1000) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (pieces.length < 10000) throw new Error(`pavement: only ${pieces.length} rated pieces. Not overwriting the last good file.`);
  return { totals: roadsByHood(pieces, hoods), years: [y0, y1] };
}

/** Where people can use a Bridge card, and bus stops: public places. Coordinates (and a grocery flag) only. */
async function points(): Promise<void> {
  const all = async (layer: string, params: Record<string, string>) => {
    const got: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await q(layer, { ...params, outSR: '4326', returnGeometry: 'true', orderByFields: params.orderByFields!, resultOffset: String(offset), resultRecordCount: '1000' });
      got.push(...(page.features ?? []));
      if (!page.exceededTransferLimit && (page.features ?? []).length < 1000) return got;
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  const xy = (f: any): Pt | null => { const x = f.geometry?.x, y = f.geometry?.y; return typeof x === 'number' && typeof y === 'number' && y > 42.2 && y < 42.5 && x > -83.35 && x < -82.85 ? [Number(x.toFixed(5)), Number(y.toFixed(5))] : null; };
  // Restaurant Meals Program places are left out: only some people (older, disabled, or without a home) can use a Bridge card there.
  const snap = (await all(SNAP, { where: "RETAILER_TYPE IS NULL OR RETAILER_TYPE <> 'Restaurant Meals Program'", outFields: 'RETAILER_TYPE', orderByFields: 'OBJECTID' }))
    .map((f) => { const pt = xy(f); return pt ? [pt[0], pt[1], GROCERY.includes(f.attributes.RETAILER_TYPE) ? 1 : 0] : null; }).filter((x): x is number[] => !!x);
  const bus = (await all(BUS, { where: '1=1', outFields: 'ObjectId', orderByFields: 'ObjectId' })).map(xy).filter((x): x is Pt => !!x);
  if (snap.length < 700 || bus.length < 4000) throw new Error(`points: only ${snap.length} SNAP stores and ${bus.length} bus stops. Not overwriting the last good file.`);
  // One point per line, so a change reads well in a pull request.
  const lines = (a: number[][]) => a.map((x) => JSON.stringify(x)).join(',\n');
  const sources = { snap: { name: 'City of Detroit: stores that take SNAP (Bridge card)', url: SNAP, last_edited: await edited(SNAP) }, bus_stops: { name: 'DDOT: bus stops', url: BUS, last_edited: await edited(BUS) } };
  writeFileSync(p('data/ingested/city_points.json'), `{"sources": ${JSON.stringify(sources)},\n"fetched_at": "${today()}",\n"snap": [\n${lines(snap)}\n],\n"bus_stops": [\n${lines(bus)}\n]}\n`);
  console.log(`points: ${snap.length} stores that take a Bridge card (${snap.filter((x) => x[2]).length} grocery stores or supermarkets), ${bus.length} bus stops`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-neighborhoods.ts')) {
  neighborhoods().then(stats).then(points).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
