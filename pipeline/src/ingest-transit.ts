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
// TWO MAP STYLES (Kyle, 2026-09-21; docs/MAP-STYLE.md). `standard` is the default and draws from the layer
// files exactly as before: those files are still written by the same code and have not changed by a byte.
// `subway` is an option, and what it needs is worked out here (pipeline/src/transit-network.ts) so three clients
// never have to agree on geometry. It travels in a SECOND file beside each network layer, `<id>.net.json`,
// which a phone downloads only when the subway style is on:
//   ddot_routes.net.json, smart_routes.net.json, qline.net.json, people_mover.net.json
//     lines[]        the network's own lines (same packing), with a vertex wherever the company on a street changes
//     routes[]       id (rt_…), short and long name, palette tone, the owner's route_color / route_text_color when
//                    the feed publishes them, `frequent` and `headway` only from the owner's own data, `loop`,
//                    `derived`, the numbers of its lines, its stops in travel order, its terminals
//     runs[]         per line: where it shares a street with other routes, and which side it is drawn on
//     interchanges   stops of two or more routes within 75 m;  trunks: where more than 4 routes share a street
//   ddot_stops.net.json, smart_stops.net.json (and inside the two rail files)
//     serves[]       for each point of the UNCHANGED stops layer, the routes that call there
// and source.json carries `hubs`: stations of different systems within 150 m of each other.
// Every stop number in a .net.json file is a position in the standard layer's `points`, so the two are always
// read and written together. Where stop order comes from: SMART and the People Mover publish it
// (stop_times.txt). The City's DDOT layers do not: a DDOT stop names its own routes (`route_number`), and we
// order a route's stops by distance along its line, keeping those within 60 m of it. The City publishes no
// QLINE track, so the subway style's QLINE is DRAWN THROUGH ITS STATIONS and marked `derived`; the People
// Mover's loop is the operator's own shape, in the direction the trains run.
// `frequent` is never a guess: DDOT's layer publishes `weekday_base_frequency` (minutes) and a route is
// frequent at 15 or less; SMART's own route names say FAST. Nothing here is a timetable or a live position.
//
// Output, committed:
//   data/ingested/transit/<id>.json     one packed layer (the same line/point encoding as the street map)
//   data/ingested/transit/<id>.net.json what the subway style adds for that layer (networks only)
//   data/ingested/transit/source.json   the layer list with counts, sources and licence notes, and the hubs
//
// Run: pnpm ingest:transit                    (every layer)
//      pnpm ingest:transit --derive           (no network: bus tones across all networks, and the hubs, worked
//                                              out again from the committed files)
//      pnpm ingest:transit qline people_mover (some layers; the others keep their last good file. A network's
//                                              routes and stops are always read together: they point at each other)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { encodeLine, simplify, GRID, SCALE, type Road } from './ingest-basemap.js';
import { unzip } from './xlsx.js';
import { inBbox, p, today } from './util.js';
import { FORMAT, hubs, packNetwork, retone, toneClashes, type ToneNet, type Hub, type HubStation, type NetRoute, type NetStop, type Network } from './transit-network.js';

const UA = { 'user-agent': '313help-pipeline (open-source civic directory for Detroit; one polite pass)' };
type Pt = [number, number];                                   // [lon, lat]
const DIR = 'data/ingested/transit';
const ORIGIN: Pt = [GRID.lon0, GRID.lat0];                    // the same origin as the street map, so cells line up

/** How far outside the service-area bbox a route or stop may still be kept, in degrees (about 1.4 miles). It was
 *  0.1 (about 7 miles) while the area was four cities, to keep the suburban ends of routes; since 2026-09-24 the
 *  area is every city and township SMART or DDOT stops in, so the whole network is inside and a small margin
 *  only keeps a line from stopping short of the edge. */
export const SLACK = 0.02;

export interface LayerSource { name: string; url: string; page: string; license: string }
export interface PackedLayer {
  id: string; kind: 'line' | 'point' | 'both'; origin: Pt;
  names: string[]; lines: [number, number[]][]; points: [number, number, number][];
}
/** What the subway style adds to one layer (`<id>.net.json`). See transit-network.ts. */
export type NetFile = Record<string, unknown> & { id: string; v: number; routes?: unknown[] };

// ---- reading the shapes ---------------------------------------------------------
/** A GTFS text file as rows of strings. GTFS is plain CSV with a header row. */
export const gtfsRows = (buf: Buffer | undefined): Record<string, string>[] =>
  !buf ? [] : (parse(buf.toString('utf8'), { columns: (h: string[]) => h.map((x) => x.replace(/^\uFEFF/, '').trim()), skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[]);

/** The pieces of a line that lie inside the service area (plus SLACK). Statewide layers (Amtrak, the coach atlas,
 *  MDOT's lots) keep only what is near the area. */
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

// ---- whole networks (format 2) ---------------------------------------------------------------------------
const clean = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const byNumber = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
/** A line end is a real end of the route only if it is inside the area; an end outside is where we clipped. */
export const realEnd = (pt: Pt) => inBbox(pt[1], pt[0], SLACK);
/** `frequent` for DDOT: the City layer's own `weekday_base_frequency`, in minutes, at or under this. */
export const FREQUENT_MIN = 15;

/** stop_times.txt is the one big file in a feed (SMART's is 12 MB), so it is read line by line for the three
 *  columns we use. A quoted field sends us back to the real CSV reader. */
export function stopTimes(buf: Buffer | undefined): { trip: string; stop: string; seq: number }[] {
  if (!buf) return [];
  const text = buf.toString('utf8').replace(/^﻿/, '');
  if (text.includes('"')) return gtfsRows(buf).map((r) => ({ trip: r.trip_id ?? '', stop: r.stop_id ?? '', seq: Number(r.stop_sequence) || 0 }));
  const rows = text.split(/\r?\n/), head = (rows[0] ?? '').split(',').map((h) => h.trim());
  const ti = head.indexOf('trip_id'), si = head.indexOf('stop_id'), qi = head.indexOf('stop_sequence'), out: { trip: string; stop: string; seq: number }[] = [];
  for (let i = 1; i < rows.length; i++) { const c = rows[i]!.split(','); if (c.length > 2) out.push({ trip: c[ti]!.trim(), stop: c[si]!.trim(), seq: Number(c[qi]) || 0 }); }
  return out;
}

/** A GTFS feed as a network: routes with the owner's names and colours, the longest shape each way, stops with
 *  the routes that call there, and the owner's own stop order for the trip that runs the longest shape. */
export function gtfsNetwork(files: Map<string, Buffer>, system: string, isFrequent: (r: Record<string, string>) => boolean = () => false): Network {
  const agencyRow = gtfsRows(files.get('agency.txt'))[0] ?? {};
  const routeRows = gtfsRows(files.get('routes.txt'));
  const shapes = new Map<string, { seq: number; pt: Pt }[]>();
  for (const r of gtfsRows(files.get('shapes.txt'))) {
    const lat = Number(r.shape_pt_lat), lon = Number(r.shape_pt_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    (shapes.get(r.shape_id!) ?? shapes.set(r.shape_id!, []).get(r.shape_id!)!).push({ seq: Number(r.shape_pt_sequence) || 0, pt: [lon, lat] });
  }
  const shapePts = new Map([...shapes].map(([k, l]) => [k, l.sort((a, b) => a.seq - b.seq).map((x) => x.pt)]));
  const trips = gtfsRows(files.get('trips.txt')), tripRoute = new Map(trips.map((t) => [t.trip_id!, t.route_id!]));
  const best = new Map<string, { shape: string; pts: Pt[] }>();
  for (const t of trips) {
    const pts = shapePts.get(t.shape_id ?? '');
    if (!pts || !t.route_id) continue;
    const k = `${t.route_id}|${t.direction_id || '0'}`, held = best.get(k);
    if (!held || held.pts.length < pts.length || (held.pts.length === pts.length && t.shape_id! < held.shape)) best.set(k, { shape: t.shape_id!, pts });
  }
  // Stops: stations and plain stops inside the area; a platform answers for its station.
  const parent = new Map<string, string>(), stopById = new Map<string, NetStop>();
  for (const s of gtfsRows(files.get('stops.txt'))) {
    const up = clean(s.parent_station), type = clean(s.location_type) || '0';
    if (up) { parent.set(s.stop_id!, up); continue; }
    if (type !== '0' && type !== '1') continue;
    const lat = Number(s.stop_lat), lon = Number(s.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon, SLACK)) continue;
    stopById.set(s.stop_id!, { id: `${system}:${s.stop_id}`, name: clean(s.stop_name), pt: [lon, lat], routes: [] });
  }
  // Routes that have a line in the area, in the order a rider would list them.
  const pieces = new Map<string, Pt[][]>();
  for (const [k, b] of best) pieces.set(k, clipToArea(b.pts));
  const kept = routeRows.filter((r) => [...pieces].some(([k, v]) => k.slice(0, k.lastIndexOf('|')) === r.route_id && v.length))
    .sort((a, b) => byNumber(clean(a.route_short_name) || clean(a.route_long_name), clean(b.route_short_name) || clean(b.route_long_name)) || byNumber(a.route_id!, b.route_id!));
  const routeIdx = new Map(kept.map((r, i) => [r.route_id!, i]));
  const routes: NetRoute[] = kept.map((r) => ({
    id: `rt_${system}_${slug(r.route_id!)}`, short: clean(r.route_short_name), long: clean(r.route_long_name),
    ...(/^[0-9a-f]{6}$/i.test(clean(r.route_color)) ? { color: `#${clean(r.route_color)}` } : {}),
    ...(/^[0-9a-f]{6}$/i.test(clean(r.route_text_color)) ? { text: `#${clean(r.route_text_color)}` } : {}),
    ...(isFrequent(r) ? { frequent: true } : {}),
  }));
  const lines: Network['lines'] = [];
  for (const [k, list] of [...pieces].sort((a, b) => byNumber(a[0], b[0]))) {
    const ri = routeIdx.get(k.slice(0, k.lastIndexOf('|')));
    if (ri !== undefined) for (const line of list) lines.push({ route: ri, dir: k.slice(k.lastIndexOf('|') + 1), line });
  }
  // Who calls where, and the owner's stop order on the trip that runs each chosen shape (the one with most stops).
  const byTrip = new Map<string, { stop: string; seq: number }[]>(), serves = new Map<string, Set<number>>();
  for (const st of stopTimes(files.get('stop_times.txt'))) {
    const ri = routeIdx.get(tripRoute.get(st.trip) ?? ''), stop = parent.get(st.stop) ?? st.stop;
    if (ri === undefined || !stopById.has(stop)) continue;
    (serves.get(stop) ?? serves.set(stop, new Set()).get(stop)!).add(ri);
    (byTrip.get(st.trip) ?? byTrip.set(st.trip, []).get(st.trip)!).push({ stop, seq: st.seq });
  }
  for (const [id, set] of serves) stopById.get(id)!.routes = [...set].sort((a, b) => a - b);
  const patterns = new Map<number, string[][]>();
  for (const [k, b] of [...best].sort((a, c) => byNumber(a[0], c[0]))) {
    const ri = routeIdx.get(k.slice(0, k.lastIndexOf('|')));
    if (ri === undefined) continue;
    const pick = trips.filter((t) => t.shape_id === b.shape && t.route_id === kept[ri]!.route_id).map((t) => ({ id: t.trip_id!, n: byTrip.get(t.trip_id!)?.length ?? 0 }))
      .sort((a, c) => c.n - a.n || byNumber(a.id, c.id))[0];
    const order = (byTrip.get(pick?.id ?? '') ?? []).sort((a, c) => a.seq - c.seq).map((x) => `${system}:${x.stop}`).filter((id, i, a) => id !== a[i - 1]);
    if (order.length > 1) (patterns.get(ri) ?? patterns.set(ri, []).get(ri)!).push(order);
  }
  const url = clean(agencyRow.agency_url);
  return { system, agency: clean(agencyRow.agency_name), ...(url ? { agency_url: url } : {}), routes, lines, stops: [...stopById.values()], patterns };
}

/** DDOT from the City's two layers. A route row carries its number, name, direction and the owner's own
 *  frequency; a stop row names the routes that call there ("7, 32") but not their order. */
export function ddotNetwork(routeFeatures: any[], stopFeatures: any[]): Network {
  const numbers = [...new Set(routeFeatures.map((f) => clean(f.properties?.route_number)).filter(Boolean))].sort(byNumber);
  const idx = new Map(numbers.map((n, i) => [n, i]));
  const routes: NetRoute[] = numbers.map((n) => {
    const pr = routeFeatures.find((f) => clean(f.properties?.route_number) === n)!.properties;
    const headway = Number(pr.weekday_base_frequency);
    return { id: `rt_ddot_${slug(n)}`, short: n, long: clean(pr.route_name), ...(headway > 0 ? { headway } : {}), ...(headway > 0 && headway <= FREQUENT_MIN ? { frequent: true } : {}), ...(/^loop$/i.test(clean(pr.direction)) ? { loop: true } : {}) };
  });
  const lines: Network['lines'] = [];
  for (const f of routeFeatures) {
    const g = f.geometry, ri = idx.get(clean(f.properties?.route_number));
    if (ri === undefined || !g) continue;
    const parts: Pt[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const part of parts) for (const line of clipToArea(part)) lines.push({ route: ri, dir: clean(f.properties?.direction), line });
  }
  const stops: NetStop[] = [];
  for (const f of stopFeatures) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as Pt;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon, SLACK)) continue;
    const served = clean(f.properties?.route_number).split(/[,;/]/).map((x) => idx.get(x.trim())).filter((x): x is number => x !== undefined);
    stops.push({ id: `ddot:${clean(f.properties?.bus_stop_id) || clean(f.properties?.ObjectId)}`, name: clean(f.properties?.location), pt: [lon, lat], routes: [...new Set(served)].sort((a, b) => a - b), dir: clean(f.properties?.direction) });
  }
  return { system: 'ddot', agency: 'DDOT', routes, lines, stops };
}

/** The QLINE from its stations alone. One station is two platforms with one name; the line runs through the
 *  middle of each pair, south to north up Woodward. It is `derived`: a drawing through the stops, not track. */
export function qlineNetwork(stopFeatures: any[], fields: string[]): Network {
  const stops: NetStop[] = featuresToPoints(stopFeatures, fields).map((s, i) => ({ id: `qline:${i}`, name: s.name, pt: s.pt, routes: [0] }))
    .sort((a, b) => a.pt[1] - b.pt[1] || a.pt[0] - b.pt[0]).map((s, i) => ({ ...s, id: `qline:${i}` }));
  const byName = new Map<string, Pt[]>();
  for (const s of stops) (byName.get(s.name) ?? byName.set(s.name, []).get(s.name)!).push(s.pt);
  const mids = [...byName.values()].map((l) => [l.reduce((t, q) => t + q[0], 0) / l.length, l.reduce((t, q) => t + q[1], 0) / l.length] as Pt).sort((a, b) => a[1] - b[1]);
  return {
    system: 'qline', agency: 'M-1 RAIL', routes: [{ id: 'rt_qline', short: 'QLINE', long: 'QLINE', derived: true }],
    lines: mids.length > 1 ? [{ route: 0, line: mids }] : [], stops, patterns: new Map([[0, [stops.map((s) => s.id)]]]),
  };
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
  /** Format 2: this layer is one half (or the whole) of a network, read and packed together with its other half. */
  network?: 'ddot' | 'smart' | 'qline' | 'dpm';
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
  { id: 'ddot_routes', network: 'ddot', kind: 'arcgis_lines', nameFields: ['route_number', 'route_name'], join: true, tol: 7,
    source: { name: 'City of Detroit open data — DDOT Bus Routes', url: `${ARC}/DDOT_Bus_Routes/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence; DDOT also publishes a GTFS feed marked CC0 that blocks scripts' },
  { id: 'ddot_stops', network: 'ddot', kind: 'arcgis_points', nameFields: ['location'],
    source: { name: 'City of Detroit open data — DDOT Bus Stops', url: `${ARC}/DDOT_Bus_Stops/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'smart_routes', network: 'smart', kind: 'gtfs_routes', tol: 9,
    source: { name: 'SMART published GTFS feed', url: 'https://apps1.smartbus.org/gtfs/smart_gtfs.zip', page: 'https://www.smartbus.org/', license: 'no terms published with the feed' },
    review: 'a public transit authority, but SMART publishes no reuse terms with the feed' },
  { id: 'smart_stops', network: 'smart', kind: 'gtfs_stops',
    source: { name: 'SMART published GTFS feed', url: 'https://apps1.smartbus.org/gtfs/smart_gtfs.zip', page: 'https://www.smartbus.org/', license: 'no terms published with the feed' },
    review: 'a public transit authority, but SMART publishes no reuse terms with the feed' },
  { id: 'qline', network: 'qline', kind: 'arcgis_points', nameFields: ['name', 'location'],
    source: { name: 'City of Detroit open data — QLine Stops (M-1 RAIL)', url: `${ARC}/QLine_Stops/FeatureServer/0`, page: CITY_PORTAL, license: CITY_TERMS },
    review: 'City layer, no stated licence' },
  { id: 'people_mover', network: 'dpm', kind: 'gtfs_stops',
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

/** A network's layers and their subway files, from one reading of the owner's data.
 *  `layers` are made by the same code as ever (packLayer), so the standard style's files do not change; `nets`
 *  point into them. Pure: the caller hands in what was downloaded. */
export interface NetworkFiles { layers: Map<string, PackedLayer>; nets: Map<string, NetFile> }
export function networkFiles(net: Network, routesId: string, stopsId: string, base: { lines?: PackedLayer; stops: PackedLayer }, tol: number): NetworkFiles {
  const packed = packNetwork(net, { routes: routesId, stops: stopsId }, ORIGIN, tol, realEnd, base.stops);
  const { points: _p, names: _n, lines: _l, origin: _o, kind: _k, serves, route_ids, unmatched, ...stopHead } = packed.stopsLayer as any;
  if (unmatched) console.warn(`transit ${stopsId}: ${unmatched} stops of the network are not in the standard layer and are left out of stop lists`);
  const layers = new Map<string, PackedLayer>(), nets = new Map<string, NetFile>();
  if (routesId === stopsId) {
    layers.set(stopsId, base.stops);
    nets.set(stopsId, { ...(packed.routesLayer as any), route_ids, serves });
  } else {
    layers.set(routesId, base.lines!); layers.set(stopsId, base.stops);
    nets.set(routesId, packed.routesLayer as any);
    nets.set(stopsId, { ...stopHead, id: stopsId, route_ids, serves });
  }
  return { layers, nets };
}

const networks = new Map<string, Promise<NetworkFiles>>();
const specOf = (id: string) => SPECS.find((s) => s.id === id)!;
function readNetwork(system: NonNullable<Spec['network']>): Promise<NetworkFiles> {
  const held = networks.get(system);
  if (held) return held;
  const job = (async () => {
    if (system === 'ddot') {
      const r = specOf('ddot_routes'), st = specOf('ddot_stops'), rf = await arcgis(r.source.url), sf = await arcgis(st.source.url);
      return networkFiles(ddotNetwork(rf, sf), r.id, st.id, { lines: packLayer(r.id, featuresToLines(rf, r.nameFields!, r.join), [], r.tol ?? 2), stops: packLayer(st.id, [], featuresToPoints(sf, st.nameFields!, st.join)) }, r.tol ?? 7);
    }
    if (system === 'smart') {
      const r = specOf('smart_routes'), files = unzip(await getBuf(r.source.url));
      return networkFiles(gtfsNetwork(files, 'smart', (x) => /^FAST\b/.test((x.route_long_name ?? '').trim())), r.id, 'smart_stops', { lines: packLayer(r.id, gtfsRoutes(files), [], r.tol ?? 3), stops: packLayer('smart_stops', [], gtfsStops(files)) }, r.tol ?? 9);
    }
    if (system === 'dpm') {
      const files = unzip(await getBuf(specOf('people_mover').source.url));
      return networkFiles(gtfsNetwork(files, 'dpm'), 'people_mover', 'people_mover', { stops: packLayer('people_mover', [], gtfsStops(files)) }, 1);
    }
    const q = specOf('qline'), feats = await arcgis(q.source.url, q.where);
    return networkFiles(qlineNetwork(feats, q.nameFields ?? ['name']), 'qline', 'qline', { stops: packLayer('qline', [], featuresToPoints(feats, q.nameFields ?? ['name'], q.join)) }, 0);
  })();
  networks.set(system, job);
  return job;
}

/** One layer, read from its owner. Throws rather than write a worse file over a good one. */
export async function readLayer(spec: Spec): Promise<PackedLayer> {
  if (spec.network) {
    const layer = (await readNetwork(spec.network)).layers.get(spec.id);
    if (!layer) throw new Error(`no ${spec.id} in the ${spec.network} network`);
    return layer;
  }
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

/** Stations of different systems a short walk apart, from the committed layer files (so a run that refreshes
 *  one layer still sees the others). Bus stops are left out: nearly every rail station has one. */
export const HUB_LAYERS = ['qline', 'people_mover', 'stations', 'intercity_bus'];
export function hubsFrom(layers: PackedLayer[]): Hub[] {
  const st: HubStation[] = [];
  for (const l of layers) if (HUB_LAYERS.includes(l.id)) for (const [n, x, y] of l.points) st.push({ layer: l.id, name: l.names[n] ?? '', pt: [l.origin[0] + x / SCALE, l.origin[1] + y / SCALE] });
  return hubs(st, ORIGIN);
}

// ---- writing ----------------------------------------------------------------------
const compact = (path: string, data: unknown) => { mkdirSync(p(DIR), { recursive: true }); writeFileSync(p(path), JSON.stringify(data) + '\n'); };

export interface LayerNote {
  id: string; kind: PackedLayer['kind']; lines: number; points: number; bytes: number;
  name: string; source: LayerSource & { fetched_at: string }; review?: string;
  /** The subway style's file for this layer, when it has one (docs/MAP-STYLE.md). */
  net?: { file: string; bytes: number; v: number; routes?: number };
}

/** The bus networks whose routes are coloured TOGETHER (docs/MAP-STYLE.md 4.2): a rider sees one street, so a
 *  DDOT route and a SMART route that share it must not wear one tone. Read from the committed `.net.json` files,
 *  so refreshing one network still sees the other. Rail has fixed colours and is not in this. */
export const TONE_LAYERS = ['ddot_routes', 'smart_routes'];
function retoneOnDisk(notes: LayerNote[]): void {
  const files = TONE_LAYERS.map((id) => ({ id, path: p(`${DIR}/${id}.net.json`) })).filter((f) => existsSync(f.path));
  const nets = files.map((f) => JSON.parse(readFileSync(f.path, 'utf8')) as ToneNet & Record<string, unknown>);
  if (!nets.length) return;
  const changed = retone(nets);
  files.forEach((f, i) => { writeFileSync(f.path, JSON.stringify(nets[i]) + '\n'); const n = notes.find((x) => x.id === f.id); if (n?.net) n.net.bytes = readFileSync(f.path).length; });
  const clashes = toneClashes(nets);
  console.log(`transit tones: ${nets.reduce((t, n) => t + n.routes.length, 0)} routes of ${files.map((f) => f.id).join(' + ')} coloured together, ${changed} changed, ${clashes.length} neighbours still share a tone${clashes.length ? ': ' + clashes.slice(0, 8).map((c) => `${c.a} / ${c.b} (${c.metres} m)`).join(', ') : ''}`);
}

/** `--derive`: no request to anyone. Works out again, from the committed files alone, what is derived across
 *  layers: the bus tones (all networks together) and the hubs. */
function derive(): void {
  const notesFile = p(`${DIR}/source.json`), read = JSON.parse(readFileSync(notesFile, 'utf8')) as { fetched_at: string; format: number; layers: LayerNote[] };
  retoneOnDisk(read.layers);
  const onDisk = read.layers.map((n) => p(`${DIR}/${n.id}.json`)).filter((f) => existsSync(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')) as PackedLayer);
  compact(`${DIR}/source.json`, { ...read, hubs: hubsFrom(onDisk) });
  console.log(`transit: derived tones and hubs again from ${read.layers.length} committed layers`);
}

async function main(only: string[]) {
  if (only.includes('--derive')) return derive();
  // A network's two halves point at each other by number, so asking for one reads both.
  const want = new Set(only.flatMap((id) => { const n = SPECS.find((s) => s.id === id)?.network; return n ? SPECS.filter((s) => s.network === n).map((s) => s.id) : [id]; }));
  mkdirSync(p(DIR), { recursive: true });
  const notesFile = p(`${DIR}/source.json`);
  const held: Record<string, LayerNote> = existsSync(notesFile) ? Object.fromEntries((JSON.parse(readFileSync(notesFile, 'utf8')).layers as LayerNote[]).map((l) => [l.id, l])) : {};
  const notes: LayerNote[] = [];
  for (const spec of SPECS) {
    if (want.size && !want.has(spec.id)) { if (held[spec.id]) notes.push(held[spec.id]!); continue; }
    try {
      const layer = await readLayer(spec);
      if (!layer.lines.length && !layer.points.length) throw new Error('nothing inside the service area');
      const path = `${DIR}/${spec.id}.json`;
      compact(path, layer);
      const bytes = readFileSync(p(path)).length;
      // The subway style's file, written in the same breath: its stop numbers are positions in the file above.
      const extra = spec.network ? (await readNetwork(spec.network)).nets.get(spec.id) : undefined;
      if (extra) compact(`${DIR}/${spec.id}.net.json`, extra);
      const net = extra ? { file: `${spec.id}.net.json`, bytes: readFileSync(p(`${DIR}/${spec.id}.net.json`)).length, v: extra.v, ...(extra.routes ? { routes: extra.routes.length } : {}) } : undefined;
      notes.push({ id: spec.id, kind: layer.kind, lines: layer.lines.length, points: layer.points.length, bytes, name: spec.source.name, source: { ...spec.source, fetched_at: today() }, ...(spec.review ? { review: spec.review } : {}), ...(net ? { net } : {}) });
      console.log(`transit ${spec.id}: ${layer.lines.length} lines, ${layer.points.length} points, ${(bytes / 1024).toFixed(0)} KB`);
    } catch (e) {
      // A source that cannot be read is a person's job, never a silent gap: the last good file stays.
      console.error(`transit ${spec.id}: ${String((e as Error).message ?? e)} — keeping the last good file`);
      if (held[spec.id]) notes.push(held[spec.id]!);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  retoneOnDisk(notes);
  // In SPECS order, not alphabetical: that order is how the layer switcher reads on the phone.
  const onDisk = notes.map((n) => p(`${DIR}/${n.id}.json`)).filter((f) => existsSync(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')) as PackedLayer);
  compact(`${DIR}/source.json`, { fetched_at: today(), format: FORMAT, layers: notes, hubs: hubsFrom(onDisk) });
  console.log(`transit: ${notes.length} layers in ${DIR}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-transit.ts')) {
  main(process.argv.slice(2).filter((a) => a !== '--')).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
