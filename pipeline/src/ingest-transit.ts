// Transport layers for the Map tab (Kyle, 2026-09-20). Everything here is drawn on the phone from the signed
// bundle: no tile server, no third-party script, no runtime request to any of these owners. We read each source
// once, politely, with an honest user-agent, and commit the result under data/ingested/transit/ so a build never
// needs the network and every change is a reviewable diff.
//
// SOURCES, each read on its owner's own page on 2026-09-20 (see SPECS below for the exact URLs and what each
// owner's page says about reuse). Licences that are share-alike, non-commercial or simply unstated are flagged
// `review` here and carried as Open rows in docs/DECISIONS.md for a person to settle (Kyle's call for the
// hackathon: get the data in, flag it for review).
//
//   ddot_routes, ddot_stops   City of Detroit open data, "DDOT Bus Routes" and "DDOT Bus Stops" layers.
//                             DDOT's own GTFS zip is the better source but detroitmi.gov answers scripts with
//                             403 (its bot protection). We do not disguise the request; a person can download
//                             it by hand. The City's own layers carry the same routes and stops.
//   smart_routes, smart_stops SMART's published GTFS feed (a regional public transit authority).
//   qline                     City of Detroit open data, "QLine Stops" (M-1 RAIL). The QLINE GTFS feed's
//                             calendar ran out in 2025, so we ship the stops, not timetables.
//   people_mover              The Detroit Transportation Corporation's own published GTFS feed.
//   mogo                      City of Detroit open data, "MoGo Stations".
//   bike_lanes                City of Detroit open data, "Bike Lanes" (Department of Public Works).
//   stations                  US DOT Bureau of Transportation Statistics, NTAD Amtrak Stations (public domain).
//   intercity_bus             US DOT BTS, NTAD Intercity Bus Atlas Stops. CC BY-NC 4.0: flagged for review.
//   park_ride                 MDOT Carpool Lots.
//
// Crashes are deliberately absent from the Map tab. SEMCOG's crash layer is now read by
// pipeline/src/ingest-crashes.ts, but only as counts per neighborhood for the "Safe streets" panel on a
// neighborhood page (docs/13). Crash places are never drawn on a map: a dot per crash is a picture of where
// people were hurt, which is not what this tab is for.
//
// Output, committed:
//   data/ingested/transit/<id>.json     one packed layer (the same line/point encoding as the street map)
//   data/ingested/transit/source.json   the layer list with counts, sources and licence notes
//
// Run: pnpm ingest:transit          (every layer)
//      pnpm ingest:transit qline    (one layer; the others keep their last good file)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { encodeLine, simplify, GRID, SCALE, type Road } from './ingest-basemap.js';
import { unzip } from './xlsx.js';
import { inBbox, p, today } from './util.js';

const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };
type Pt = [number, number];                                   // [lon, lat]
const DIR = 'data/ingested/transit';
const ORIGIN: Pt = [GRID.lon0, GRID.lat0];                    // the same origin as the street map, so cells line up

/** How far outside the service-area bbox a route or stop may still be kept, in degrees (about 7 miles). */
export const SLACK = 0.1;

export interface LayerSource { name: string; url: string; page: string; license: string }
export interface PackedLayer {
  id: string; kind: 'line' | 'point' | 'both'; origin: Pt;
  names: string[]; lines: [number, number[]][]; points: [number, number, number][];
}

// ---- reading the shapes ---------------------------------------------------------
/** A GTFS text file as rows of strings. GTFS is plain CSV with a header row. */
export const gtfsRows = (buf: Buffer | undefined): Record<string, string>[] =>
  !buf ? [] : (parse(buf.toString('utf8'), { columns: (h: string[]) => h.map((x) => x.replace(/^\uFEFF/, '').trim()), skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[]);

/** The pieces of a line that lie inside the service area (plus SLACK). A route to the suburbs keeps only its
 *  Detroit-area stretches, so one regional feed does not put the whole three-county network in the bundle. */
export function clipToArea(line: Pt[], slack = SLACK): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (let i = 0; i < line.length; i++) {
    const inside = inBbox(line[i]![1], line[i]![0], slack);
    if (inside) {
      // Keep one point on each side of the edge, so a stretch does not stop short of the boundary.
      if (!run.length && i > 0) run.push(line[i - 1]!);
      run.push(line[i]!);
    } else if (run.length) { run.push(line[i]!); out.push(run); run = []; }
  }
  if (run.length) out.push(run);
  return out.filter((l) => l.length > 1);
}

/** Route lines from a GTFS feed: for each route, the longest shape in each direction, clipped to the area. */
export function gtfsRoutes(files: Map<string, Buffer>): Road[] {
  const routes = new Map(gtfsRows(files.get('routes.txt')).map((r) => [r.route_id!, r]));
  const shapes = new Map<string, Pt[]>();
  const bySeq = new Map<string, { seq: number; pt: Pt }[]>();
  for (const r of gtfsRows(files.get('shapes.txt'))) {
    const lat = Number(r.shape_pt_lat), lon = Number(r.shape_pt_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const k = r.shape_id!;
    (bySeq.get(k) ?? bySeq.set(k, []).get(k)!).push({ seq: Number(r.shape_pt_sequence) || 0, pt: [lon, lat] });
  }
  for (const [k, list] of bySeq) shapes.set(k, list.sort((a, b) => a.seq - b.seq).map((x) => x.pt));
  // One shape per route and direction: the longest, which is the full-length pattern rather than a short turn.
  const best = new Map<string, Pt[]>();
  for (const t of gtfsRows(files.get('trips.txt'))) {
    const pts = shapes.get(t.shape_id ?? '');
    if (!pts || !t.route_id) continue;
    const k = `${t.route_id}|${t.direction_id ?? '0'}`;
    if ((best.get(k)?.length ?? 0) < pts.length) best.set(k, pts);
  }
  const out: Road[] = [];
  for (const [k, pts] of best) {
    const r = routes.get(k.slice(0, k.lastIndexOf('|')));
    const name = [r?.route_short_name, r?.route_long_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
    for (const piece of clipToArea(pts)) out.push({ cls: 1, name, line: piece });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

/** Stops from a GTFS feed, inside the service area. Stations (location_type 1) and plain stops both count;
 *  entrances, generic nodes and boarding areas (2, 3, 4) are not places a rider waits. A platform that belongs
 *  to a station is dropped, so the People Mover shows 13 stations and not 13 stations plus their platforms. */
export function gtfsStops(files: Map<string, Buffer>): { name: string; pt: Pt }[] {
  const seen = new Set<string>(), out: { name: string; pt: Pt }[] = [];
  for (const s of gtfsRows(files.get('stops.txt'))) {
    const type = (s.location_type ?? '0').trim() || '0';
    if (type !== '0' && type !== '1') continue;
    if ((s.parent_station ?? '').trim()) continue;
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon, SLACK)) continue;
    const name = (s.stop_name ?? '').replace(/\s+/g, ' ').trim();
    const key = `${name}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, pt: [lon, lat] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.pt[0] - b.pt[0]);
}

// ---- packing ---------------------------------------------------------------------
/** Lines and points into the compact shape the phone decodes (apps/web/src/map.ts decodeLayer).
 *  Coordinates are whole 1e-5 degrees from `origin`; `tol` is the simplification tolerance in the same units. */
export function packLayer(id: string, lines: Road[], points: { name: string; pt: Pt }[], tol = 2): PackedLayer {
  const names: string[] = [], idx = new Map<string, number>();
  const nameIdx = (n: string) => (n ? idx.get(n) ?? (idx.set(n, names.push(n) - 1), names.length - 1) : -1);
  const packedLines = lines
    .map((r) => [nameIdx(r.name), encodeLine(simplify(r.line, tol), ORIGIN)] as [number, number[]])
    .filter((r) => r[1].length >= 4);
  const packedPoints = points
    .map((q) => [nameIdx(q.name), Math.round((q.pt[0] - ORIGIN[0]) * SCALE), Math.round((q.pt[1] - ORIGIN[1]) * SCALE)] as [number, number, number])
    .sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  const kind = packedLines.length && packedPoints.length ? 'both' : packedPoints.length ? 'point' : 'line';
  return { id, kind, origin: ORIGIN, names, lines: packedLines, points: packedPoints };
}

// ---- the sources ------------------------------------------------------------------
// Each entry says where the file is, whose page publishes it, and what that page says about reuse. `review`
// marks a licence a person still has to settle (an Open row in docs/DECISIONS.md, 2026-09-20).
export interface Spec {
  id: string; kind: 'gtfs_routes' | 'gtfs_stops' | 'gbfs' | 'arcgis_lines' | 'arcgis_points';
  source: LayerSource;
  /** Set when the owner publishes no reuse terms, or terms with a condition a person has to settle. */
  review?: string;
  tol?: number;
  /** arcgis_*: the fields that hold the name a rider would recognise, best first. `join` puts them together
   *  ("17" + "Eight Mile" -> "17 Eight Mile") instead of taking the first that has something in it. */
  nameFields?: string[]; join?: boolean; where?: string;
}

/** The name a rider would recognise, from whichever of these fields the owner filled in. */
export function pickName(props: Record<string, unknown> | undefined, fields: string[], join = false): string {
  const vals = fields.map((f) => String(props?.[f] ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!vals.length) return '';
  if (!join) return vals[0]!;
  const seen: string[] = [];
  for (const v of vals) if (!seen.some((x) => x.toLowerCase() === v.toLowerCase())) seen.push(v);
  return seen.join(' ');
}

const CITY_PORTAL = 'https://data.detroitmi.gov/pages/disclaimer';
const CITY_TERMS = 'City of Detroit open data portal: a disclaimer, no stated licence';
const ARC = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';
const NTAD = 'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services';

export const SPECS: Spec[] = [
  { id: 'ddot_routes', kind: 'arcgis_lines', nameFields: ['route_number', 'route_name'], join: true, tol: 7,
    source: { name: 'City of Detroit open data — DDOT Bus Routes', url: `${ARC}/DDOT_Bus_Routes/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence; DDOT also publishes a GTFS feed marked CC0 that blocks scripts' },
  { id: 'ddot_stops', kind: 'arcgis_points', nameFields: ['location'],
    source: { name: 'City of Detroit open data — DDOT Bus Stops', url: `${ARC}/DDOT_Bus_Stops/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'smart_routes', kind: 'gtfs_routes', tol: 9,
    source: { name: 'SMART published GTFS feed', url: 'https://apps1.smartbus.org/gtfs/smart_gtfs.zip', page: 'https://www.smartbus.org/', license: 'no terms published with the feed' },
    review: 'a public transit authority, but SMART publishes no reuse terms with the feed' },
  { id: 'smart_stops', kind: 'gtfs_stops',
    source: { name: 'SMART published GTFS feed', url: 'https://apps1.smartbus.org/gtfs/smart_gtfs.zip', page: 'https://www.smartbus.org/', license: 'no terms published with the feed' },
    review: 'a public transit authority, but SMART publishes no reuse terms with the feed' },
  { id: 'qline', kind: 'arcgis_points', nameFields: ['name', 'location'],
    source: { name: 'City of Detroit open data — QLine Stops (M-1 RAIL)', url: `${ARC}/QLine_Stops/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'people_mover', kind: 'gtfs_stops',
    source: { name: 'Detroit People Mover published GTFS feed', url: 'https://hosted-gtfs-feeds.s3.amazonaws.com/DPM/gtfs.zip', page: 'https://www.thepeoplemover.com/', license: 'no terms published with the feed' },
    review: 'the operator publishes the feed but no reuse terms' },
  { id: 'mogo', kind: 'arcgis_points', nameFields: ['station_name', 'cross_street'],
    source: { name: 'City of Detroit open data — MoGo Stations', url: `${ARC}/mogo_stations/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'bike_lanes', kind: 'arcgis_lines', nameFields: ['route_name', 'trail_name'], tol: 2,
    source: { name: 'City of Detroit open data — Bike Lanes (Department of Public Works)', url: `${ARC}/bike_routes_and_facilities/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'stations', kind: 'arcgis_points', nameFields: ['StationName', 'Name'], where: "State='MI'",
    source: { name: 'US DOT Bureau of Transportation Statistics — NTAD Amtrak Stations', url: `${NTAD}/NTAD_Amtrak_Stations/FeatureServer/0`, page: 'https://geodata.bts.gov/datasets/usdot::amtrak-stations/about', license: 'US government work, not protected by copyright; unrestricted public use' } },
  { id: 'intercity_bus', kind: 'arcgis_points', nameFields: ['stop_name', 'carrier_name'], where: "state_usps='MI'",
    source: { name: 'US DOT Bureau of Transportation Statistics — NTAD Intercity Bus Atlas Stops', url: `${NTAD}/NTAD_Intercity_Bus_Atlas_Stops/FeatureServer/0`, page: 'https://geodata.bts.gov/datasets/usdot::intercity-bus-atlas-stops/about', license: 'CC BY-NC 4.0' },
    review: 'CC BY-NC 4.0: non-commercial and attribution-bound. Fine for a free app, but Kyle should say so.' },
  { id: 'park_ride', kind: 'arcgis_points', nameFields: ['CRPL_LOT_LOC_NAME', 'FACL_NAME'],
    source: { name: 'Michigan Department of Transportation — Carpool Lots', url: 'https://gisagomdot.state.mi.us/arcgis/rest/services/MDOT/MdotCarpoolLot/FeatureServer/0', page: 'https://gis-michigan.opendata.arcgis.com/datasets/mdot::mdot-carpool-lots', license: 'MDOT terms of use: a disclaimer, no redistribution limit stated' },
    review: 'a State agency layer, but the terms are a disclaimer rather than a licence' },
];

// One download per URL per run: routes and stops come out of the same SMART zip, and we do not ask twice.
const downloads = new Map<string, Promise<Buffer>>();
const getBuf = (url: string): Promise<Buffer> => {
  const held = downloads.get(url);
  if (held) return held;
  const job = (async () => {
    const res = await fetch(url, { headers: UA, redirect: 'follow' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  })();
  downloads.set(url, job);
  return job;
};
const getJson = async (url: string): Promise<any> => JSON.parse((await getBuf(url)).toString('utf8'));

/** GBFS station_information.json -> named points. The feed states its own licence in `license_url`. */
export function gbfsStations(doc: any): { name: string; pt: Pt }[] {
  const list = doc?.data?.stations ?? [];
  return list
    .map((s: any) => ({ name: String(s.name ?? '').replace(/\s+/g, ' ').trim(), pt: [Number(s.lon), Number(s.lat)] as Pt }))
    .filter((s: { pt: Pt }) => Number.isFinite(s.pt[0]) && Number.isFinite(s.pt[1]) && inBbox(s.pt[1], s.pt[0], SLACK))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
}

/** An ArcGIS/GeoJSON feature collection -> lines or points, clipped to the service area. */
export function featuresToLines(features: any[], fields: string[], join = false): Road[] {
  const out: Road[] = [];
  for (const f of features) {
    const g = f.geometry, name = pickName(f.properties, fields, join);
    const lines: Pt[][] = !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) for (const piece of clipToArea(l)) out.push({ cls: 1, name, line: piece });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}
export function featuresToPoints(features: any[], fields: string[], join = false): { name: string; pt: Pt }[] {
  const out: { name: string; pt: Pt }[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g?.type !== 'Point') continue;
    const [lon, lat] = g.coordinates as Pt;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon, SLACK)) continue;
    out.push({ name: pickName(f.properties, fields, join), pt: [lon, lat] });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function arcgis(url: string, where = '1=1'): Promise<any[]> {
  const all: any[] = [];
  for (let offset = 0; ; offset += 2000) {
    const q = `${url}/query?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&geometryPrecision=5&returnGeometry=true&resultOffset=${offset}&resultRecordCount=2000&f=geojson`;
    const fc = await getJson(q);
    if (fc.error) throw new Error(`${url}: ${JSON.stringify(fc.error)}`);
    all.push(...(fc.features ?? []));
    if ((fc.features ?? []).length < 2000) return all;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** One layer, read from its owner. Throws rather than write a worse file over a good one. */
export async function readLayer(spec: Spec): Promise<PackedLayer> {
  if (spec.kind === 'gtfs_routes' || spec.kind === 'gtfs_stops') {
    const files = unzip(await getBuf(spec.source.url));
    return spec.kind === 'gtfs_routes'
      ? packLayer(spec.id, gtfsRoutes(files), [], spec.tol ?? 3)
      : packLayer(spec.id, [], gtfsStops(files));
  }
  if (spec.kind === 'gbfs') return packLayer(spec.id, [], gbfsStations(await getJson(spec.source.url)));
  const feats = await arcgis(spec.source.url, spec.where);
  const fields = spec.nameFields ?? ['NAME'];
  return spec.kind === 'arcgis_lines'
    ? packLayer(spec.id, featuresToLines(feats, fields, spec.join), [], spec.tol ?? 2)
    : packLayer(spec.id, [], featuresToPoints(feats, fields, spec.join));
}

// ---- writing ----------------------------------------------------------------------
const compact = (path: string, data: unknown) => { mkdirSync(p(DIR), { recursive: true }); writeFileSync(p(path), JSON.stringify(data) + '\n'); };

export interface LayerNote {
  id: string; kind: PackedLayer['kind']; lines: number; points: number; bytes: number;
  name: string; source: LayerSource & { fetched_at: string }; review?: string;
}

async function main(only?: string) {
  mkdirSync(p(DIR), { recursive: true });
  const notesFile = p(`${DIR}/source.json`);
  const held: Record<string, LayerNote> = existsSync(notesFile) ? Object.fromEntries((JSON.parse(readFileSync(notesFile, 'utf8')).layers as LayerNote[]).map((l) => [l.id, l])) : {};
  const notes: LayerNote[] = [];
  for (const spec of SPECS) {
    if (only && spec.id !== only) { if (held[spec.id]) notes.push(held[spec.id]!); continue; }
    try {
      const layer = await readLayer(spec);
      if (!layer.lines.length && !layer.points.length) throw new Error('nothing inside the service area');
      const path = `${DIR}/${spec.id}.json`;
      compact(path, layer);
      const bytes = readFileSync(p(path)).length;
      notes.push({ id: spec.id, kind: layer.kind, lines: layer.lines.length, points: layer.points.length, bytes, name: spec.source.name, source: { ...spec.source, fetched_at: today() }, ...(spec.review ? { review: spec.review } : {}) });
      console.log(`transit ${spec.id}: ${layer.lines.length} lines, ${layer.points.length} points, ${(bytes / 1024).toFixed(0)} KB`);
    } catch (e) {
      // A source that cannot be read is a person's job, never a silent gap: the last good file stays.
      console.error(`transit ${spec.id}: ${String((e as Error).message ?? e)} — keeping the last good file`);
      if (held[spec.id]) notes.push(held[spec.id]!);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // In SPECS order, not alphabetical: that order is how the layer switcher reads on the phone.
  compact(`${DIR}/source.json`, { fetched_at: today(), layers: notes });
  console.log(`transit: ${notes.length} layers in ${DIR}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-transit.ts')) {
  main(process.argv[2]).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
