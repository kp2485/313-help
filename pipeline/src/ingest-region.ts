// The service area: every city and township a DDOT or SMART bus stops in or runs through (Kyle, 2026-09-24,
// DECISIONS: "extend the resource map to all the suburban cities our included transportation systems travel to",
// then "overlay all the bus routes (SMART included) and make sure they are all contained").
//
// WHY A DERIVED LIST. The area used to be four cities typed by hand. It is now "wherever the buses in this app go",
// so it is worked out from the buses: every stop in SMART's published GTFS feed and every stop in the committed
// DDOT layer is placed in the Census Bureau's county subdivision that contains it, and each subdivision holding at
// least one stop is in the area. So is each subdivision a route RUNS THROUGH without stopping (FAST Woodward
// crosses a corner of Orion Township on I-75): a route counts for a place when at least ROUTE_RUN_M of it lies
// inside that place and more than BORDER_M from its edge, so a road that only forms a city line (8 Mile) never
// pulls in the place across it. A Michigan county subdivision is a city or a township — the unit a person names
// when asked where they live, and the unit that runs a police department. When SMART's opt-in communities change,
// re-running this script changes the list, and the change arrives as a reviewable diff like every other ingest.
//
// SOURCES, read once with an honest user-agent:
//   SMART's GTFS feed (stops.txt)             the same feed ingest-transit.ts reads (data/sources: transit)
//   data/ingested/transit/ddot_stops.json     committed; DDOT runs no stop outside what that file already holds
//   TIGERweb County Subdivisions (layer 1)    US Census Bureau, public domain (17 U.S.C. §105)
//   SEMCOG 2020 Census totals by community    only for each place's `semmcd` code, which ingest-cities.ts keys on
//
// Output, committed: data/ingested/region.json
//   municipalities[]  id (city_<slug>), name, counties, Census GEOIDs, SEMCOG code, stop counts, outline, centre
//   bbox              the box round every outline, which SERVICE_BBOX in packages/query must contain (a test)
//
// A stop on the very edge of two outlines (8 Mile, 11 Mile) can fall in neither after simplification; it is
// counted as "on a line" and never invents a place. Nothing here is about a person.
//
// Run: pnpm ingest:region      By hand, after SMART changes the communities it serves.

import { readFileSync } from 'node:fs';
import { simplify } from './ingest-basemap.js';
import { gtfsRows } from './ingest-transit.js';
import { unzip } from './xlsx.js';
import { p, today, writeJson } from './util.js';

type Pt = [number, number];

const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };
export const SMART_GTFS = 'https://apps1.smartbus.org/gtfs/smart_gtfs.zip';
export const TIGER_COUSUB = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/1';
export const SEMCOG_MCD = 'https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/mcd_2020/FeatureServer/0';
/** The counties a SMART or DDOT stop can be in, and a margin of the ones next door so an edge is never missed. */
export const COUNTIES: Record<string, string> = { '163': 'Wayne', '125': 'Oakland', '099': 'Macomb', '161': 'Washtenaw', '093': 'Livingston', '147': 'St. Clair' };
/** How much of a route must run inside a place, away from its edge, before the place is in the area. Measured on
 *  2026-09-24: the only such stretch is 203 m of FAST Woodward (462) on I-75 across a corner of Orion Township, and
 *  Kyle asked for every route to be contained, so the bar sits under it. */
export const ROUTE_RUN_M = 100;
/** A route this close to a place's edge is on a border road, and counts for neither side. */
export const BORDER_M = 40;
/** Douglas-Peucker tolerance for an outline, in 1e-5 degrees (about 4 m) — the same as ingest-cities.ts. */
export const OUTLINE_TOL = 4;

export interface Municipality {
  id: string;
  name: string;
  counties: string[];
  geoids: string[];
  semmcd: number;
  stops: { smart: number; ddot: number };
  /** Metres of DDOT or SMART route line inside the place, away from its edge. Measured only for a place with no
   *  stop, which is in the area for this alone; 0 for every place that has a stop. */
  route_m: number;
  center: Pt;
  rings: Pt[][];
}

/**
 * The name a person uses. Census writes "Clinton charter township", "Royal Oak city" and "Village of Grosse Pointe
 * Shores city"; people say Clinton Township, Royal Oak and Grosse Pointe Shores. A township keeps the word, because
 * Royal Oak and Royal Oak Township are two different places with two different police departments.
 */
export function displayName(censusName: string, baseName: string): string {
  const base = baseName.replace(/^Village of /, '');
  return /township$/i.test(censusName) ? `${base} Township` : base;
}
export const cityId = (name: string) => 'city_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Even-odd point in polygon over one polygon's rings (outer first, holes after). */
function inPolygon(pt: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface Subdivision { geoid: string; censusName: string; baseName: string; county: string; polygons: Pt[][][]; center: Pt; box: [number, number, number, number] }

/** Which subdivision a point is in, or null for a point on a line between two of them. */
export function subdivisionOf(pt: Pt, subs: Subdivision[]): Subdivision | null {
  for (const s of subs) {
    const [x0, y0, x1, y1] = s.box;
    if (pt[0] < x0 || pt[0] > x1 || pt[1] < y0 || pt[1] > y1) continue;
    if (s.polygons.some((poly) => inPolygon(pt, poly))) return s;
  }
  return null;
}

const M_LAT = 111132, M_LON = 111320 * Math.cos((42.35 * Math.PI) / 180);
const metres = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT);
/** Metres from a point to the nearest edge of any ring of a polygon. */
function toEdge(pt: Pt, polygons: Pt[][][]): number {
  let best = Infinity;
  for (const poly of polygons) for (const ring of poly) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i]!, [bx, by] = ring[i + 1]!;
    const dx = (bx - ax) * M_LON, dy = (by - ay) * M_LAT, px = (pt[0] - ax) * M_LON, py = (pt[1] - ay) * M_LAT;
    const len2 = dx * dx + dy * dy, u = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const d = Math.hypot(px - u * dx, py - u * dy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * For each subdivision, how many metres of route run inside it and more than BORDER_M from its edge. Each line is
 * cut into pieces of at most 25 m; a piece counts for the subdivision its middle is in, unless that middle is on a
 * border road. `skip` names subdivisions already in the area (they have a stop): measuring the edge distance is
 * the slow part, and for them the answer changes nothing.
 */
export function routeRun(routes: Pt[][], subs: Subdivision[], skip: ReadonlySet<string> = new Set()): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of routes) for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, len = metres(a, b), n = Math.max(1, Math.ceil(len / 25));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, mid: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const s = subdivisionOf(mid, subs);
      if (!s || skip.has(s.geoid) || toEdge(mid, s.polygons) <= BORDER_M) continue;
      out.set(s.geoid, (out.get(s.geoid) ?? 0) + len / n);
    }
  }
  return out;
}

/**
 * The area from stop positions: each subdivision with a stop, merged by name so a place that straddles a county
 * line (Grosse Pointe Shores is in Wayne and Macomb) is one place with two GEOIDs. Sorted by county as SMART
 * lists them (Wayne, Oakland, Macomb), then by name, so the file is the same every run.
 */
export function municipalitiesFrom(stops: { smart: Pt[]; ddot: Pt[] }, subs: Subdivision[], semmcd: Map<string, number>, routes: Pt[][] = []): { list: Municipality[]; onALine: number } {
  const counts = new Map<string, { smart: number; ddot: number }>();
  let onALine = 0;
  for (const [kind, pts] of [['smart', stops.smart], ['ddot', stops.ddot]] as const) for (const pt of pts) {
    const s = subdivisionOf(pt, subs);
    if (!s) { onALine++; continue; }
    const c = counts.get(s.geoid) ?? { smart: 0, ddot: 0 };
    c[kind]++;
    counts.set(s.geoid, c);
  }
  const run = routeRun(routes, subs, new Set(counts.keys()));
  const byName = new Map<string, Municipality>();
  for (const s of subs) {
    const c = counts.get(s.geoid) ?? ((run.get(s.geoid) ?? 0) >= ROUTE_RUN_M ? { smart: 0, ddot: 0 } : null);
    if (!c) continue;
    const metres = Math.round(run.get(s.geoid) ?? 0);
    const name = displayName(s.censusName, s.baseName);
    const code = semmcd.get(s.censusName);
    if (code === undefined) throw new Error(`region: SEMCOG has no community named "${s.censusName}". Not overwriting the last good file.`);
    const m = byName.get(name);
    const rings = s.polygons.flatMap((poly) => poly.map((r) => simplify(r, OUTLINE_TOL).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))] as Pt))).filter((r) => r.length >= 4);
    if (m) {
      m.counties.push(s.county); m.geoids.push(s.geoid); m.rings.push(...rings);
      m.stops.smart += c.smart; m.stops.ddot += c.ddot; m.route_m += metres;
    } else {
      byName.set(name, { id: cityId(name), name, counties: [s.county], geoids: [s.geoid], semmcd: code, stops: { ...c }, route_m: metres, center: s.center, rings });
    }
  }
  const order = ['Wayne', 'Oakland', 'Macomb'];
  const rank = (m: Municipality) => Math.min(...m.counties.map((c) => { const i = order.indexOf(c); return i < 0 ? order.length : i; }));
  const list = [...byName.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  for (const m of list) m.counties.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const ids = new Set(list.map((m) => m.id));
  if (ids.size !== list.length) throw new Error('region: two places share an id. Not overwriting the last good file.');
  return { list, onALine };
}

export function boxOf(list: Municipality[]): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const pts = list.flatMap((m) => m.rings.flat());
  const r = (n: number) => Number(n.toFixed(4));
  return {
    latMin: r(Math.min(...pts.map((q) => q[1]))), latMax: r(Math.max(...pts.map((q) => q[1]))),
    lonMin: r(Math.min(...pts.map((q) => q[0]))), lonMax: r(Math.max(...pts.map((q) => q[0]))),
  };
}

// ---- reading ----------------------------------------------------------------------------------------------
const get = async (url: string): Promise<Response> => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.slice(0, 140)} — stopping. A person should check whether the service is refusing us.`);
  return res;
};

async function subdivisions(): Promise<Subdivision[]> {
  const where = `STATE='26' AND COUNTY IN (${Object.keys(COUNTIES).map((c) => `'${c}'`).join(',')})`;
  const q = new URLSearchParams({ where, outFields: 'GEOID,NAME,BASENAME,COUNTY,INTPTLAT,INTPTLON', outSR: '4326', geometryPrecision: '6', returnGeometry: 'true', f: 'geojson' });
  const fc = (await (await get(`${TIGER_COUSUB}/query?${q}`)).json()) as any;
  if (fc.error) throw new Error(`region: ${JSON.stringify(fc.error)}`);
  const out: Subdivision[] = [];
  for (const f of fc.features ?? []) {
    const g = f.geometry, a = f.properties ?? {};
    const polygons: Pt[][][] = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (!polygons.length || /^County subdivisions not defined/i.test(String(a.NAME))) continue;
    const all = polygons.flat(2);
    out.push({
      geoid: String(a.GEOID), censusName: String(a.NAME), baseName: String(a.BASENAME), county: COUNTIES[String(a.COUNTY)] ?? String(a.COUNTY), polygons,
      center: [Number(Number(a.INTPTLON).toFixed(5)), Number(Number(a.INTPTLAT).toFixed(5))],
      box: [Math.min(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), Math.max(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1]))],
    });
  }
  if (out.length < 100) throw new Error(`region: only ${out.length} county subdivisions from TIGER. Not overwriting the last good file.`);
  return out;
}

async function semmcdCodes(): Promise<Map<string, number>> {
  const q = new URLSearchParams({ where: '1=1', outFields: 'geoname,semmcd', returnGeometry: 'false', f: 'json' });
  const j = (await (await get(`${SEMCOG_MCD}/query?${q}`)).json()) as any;
  return new Map((j.features ?? []).map((f: any) => [String(f.attributes.geoname), Number(f.attributes.semmcd)]));
}

/** Every DDOT stop in the committed layer, decoded from its packing (1e-5 degrees from `origin`). */
export function ddotStops(file = p('data/ingested/transit/ddot_stops.json')): Pt[] {
  const d = JSON.parse(readFileSync(file, 'utf8')) as { origin: Pt; points: [number, number, number][] };
  return d.points.map(([, x, y]) => [d.origin[0] + x / 1e5, d.origin[1] + y / 1e5] as Pt);
}

/** Every DDOT route line in the committed layer, decoded ([line, [x0, y0, dx, dy, ...]] from `origin`). */
export function ddotRoutes(file = p('data/ingested/transit/ddot_routes.json')): Pt[][] {
  const d = JSON.parse(readFileSync(file, 'utf8')) as { origin: Pt; lines: [number, number[]][] };
  return d.lines.map(([, enc]) => {
    const out: Pt[] = []; let x = 0, y = 0;
    for (let i = 0; i + 1 < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out.push([d.origin[0] + x / 1e5, d.origin[1] + y / 1e5]); }
    return out;
  });
}

async function main(): Promise<void> {
  const files = unzip(Buffer.from(await (await get(SMART_GTFS)).arrayBuffer()));
  const smart = gtfsRows(files.get('stops.txt'))
    .filter((s) => ((s.location_type ?? '0').trim() || '0') === '0')
    .map((s) => [Number(s.stop_lon), Number(s.stop_lat)] as Pt)
    .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
  if (smart.length < 1000) throw new Error(`region: only ${smart.length} SMART stops. Not overwriting the last good file.`);
  const shapes = new Map<string, [number, Pt][]>();
  for (const r of gtfsRows(files.get('shapes.txt'))) {
    const pt: Pt = [Number(r.shape_pt_lon), Number(r.shape_pt_lat)];
    if (Number.isFinite(pt[0]) && Number.isFinite(pt[1])) (shapes.get(r.shape_id!) ?? shapes.set(r.shape_id!, []).get(r.shape_id!)!).push([Number(r.shape_pt_sequence), pt]);
  }
  const routes = [...[...shapes.values()].map((l) => l.sort((a, b) => a[0] - b[0]).map((x) => x[1])), ...ddotRoutes()];
  if (shapes.size < 20) throw new Error(`region: only ${shapes.size} SMART shapes. Not overwriting the last good file.`);
  const { list, onALine } = municipalitiesFrom({ smart, ddot: ddotStops() }, await subdivisions(), await semmcdCodes(), routes);
  writeJson(p('data/ingested/region.json'), {
    fetched_at: today(),
    sources: {
      smart: { name: 'SMART published GTFS feed (stops.txt)', url: SMART_GTFS },
      ddot: { name: 'City of Detroit open data — DDOT Bus Stops (committed layer)', url: 'data/ingested/transit/ddot_stops.json' },
      outlines: { name: 'U.S. Census Bureau TIGERweb: county subdivisions', url: TIGER_COUSUB, license: 'No licence stated; a work of the United States government (17 U.S.C. §105)' },
      codes: { name: 'SEMCOG — 2020 Census totals by community (community codes only)', url: SEMCOG_MCD },
    },
    rule: `every Census county subdivision holding at least one SMART or DDOT stop, or with at least ${ROUTE_RUN_M} m of SMART or DDOT route inside it more than ${BORDER_M} m from its edge`,
    stops_on_a_line: onALine,
    bbox: boxOf(list),
    municipalities: list,
  });
  console.log(`region: ${list.length} places (${list.filter((m) => m.stops.ddot > 0).length} with a DDOT stop, ${list.filter((m) => !m.stops.ddot && !m.stops.smart).map((m) => m.name).join(', ') || 'none'} for a route alone); ${onALine} stops on a line between two; bbox ${JSON.stringify(boxOf(list))}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-region.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
