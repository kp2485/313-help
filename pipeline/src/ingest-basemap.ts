// A street map we host ourselves (audit B8), made only from City of Detroit open data:
//   roads (names + class), park outlines, the city boundary.
// No map-tile company ever sees where a person is looking, and the map works offline.
//
// Output, committed under data/ingested/basemap/ so builds never need the network:
//   base.json          city boundary, park outlines, freeways and arterials for the whole city
//   cells/c_X_Y.json   every smaller street inside one grid cell (about 2 x 2 miles)
//   crossings.json     seg_id -> street names a greenway segment crosses, in order along the path
//
// File format (docs/06 "Map"): coordinates are whole numbers of 1e-5 degrees (about 1 m) measured from
// the file's `origin` [lon, lat]; each line is [x0, y0, dx1, dy1, dx2, dy2, ...].
//   roads: [class, nameIndex, line]   class 0 freeway, 1 main road, 2 arterial, 3 collector, 4 local street
//   parks: [nameIndex, ring]          nameIndex points into `names`; -1 = no name

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Segment } from '@313help/query';
import { p, today } from './util.js';

const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';
const ROADS = `${ORG}/City_of_Detroit_Roads/FeatureServer/0`;
const PARKS = `${ORG}/city_parks/FeatureServer/0`;
const BOUNDARY = `${ORG}/City_of_Detroit_Boundary/FeatureServer/0`;
const UA = { 'user-agent': '313help-pipeline (open-source civic directory; one polite pass)' };

// Fixed numbers, not derived from BBOX: every committed map cell (c_X_Y) and encoded outline is measured from this
// origin, so widening the service area (Dearborn, 2026-09-19) must not move it. Points west of it get negative cells.
export const GRID = { lon0: -83.32, lat0: 42.22, dLon: 0.04, dLat: 0.03 };
export const SCALE = 1e5;
type Pt = [number, number];                       // [lon, lat]
export interface Road { cls: number; name: string; line: Pt[] }

const NFC: Record<string, number> = {
  Interstate: 0, 'Other Freeways': 0, 'Other freeway': 0, OPA: 1, 'Other principal arterial': 1,
  'Minor Arterial': 2, 'Major Collector': 3, 'Minor Collector': 3, Local: 4, '0': 4,
};

/** "W I 94 Service Drive" stays; "8 Mile/Kelly TURN" and ramps are not streets a person looks for. */
export function roadName(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (/\/|\bTURN\b|\bRAMP\b/i.test(s)) return '';
  // The layer names each side of a freeway by direction ("N I 75", "W I 96 CD"). People say "I-75".
  return s.replace(/^[NSEW] (I|M|US) (\d+)\b( CD)?/, '$1-$2');
}

// ---- geometry ------------------------------------------------------------------
/** Douglas-Peucker on [lon, lat]; tolerance in units of 1e-5 degrees. */
export function simplify(line: Pt[], tol: number): Pt[] {
  if (line.length < 3) return line;
  const t = tol / SCALE, keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; const [ax, ay] = line[a]!, [bx, by] = line[b]!;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = line[i]!;
      const u = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const d = Math.hypot(x - ax - u * dx, y - ay - u * dy);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > t && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

/** Join block-long pieces of the same street end to end, so there are fewer lines and better labels. */
export function mergeChains(roads: Road[]): Road[] {
  const key = (pt: Pt) => `${Math.round(pt[0] * SCALE)},${Math.round(pt[1] * SCALE)}`;
  const groups = new Map<string, Pt[][]>();
  for (const r of roads) { const k = `${r.cls}|${r.name}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r.line); }
  const out: Road[] = [];
  for (const [k, lines] of groups) {
    const cls = Number(k.slice(0, k.indexOf('|'))), name = k.slice(k.indexOf('|') + 1);
    const ends = new Map<string, Set<number>>();
    const add = (pt: Pt, i: number) => (ends.get(key(pt)) ?? ends.set(key(pt), new Set()).get(key(pt))!).add(i);
    const drop = (pt: Pt, i: number) => ends.get(key(pt))?.delete(i);
    lines.forEach((l, i) => { add(l[0]!, i); add(l[l.length - 1]!, i); });
    const used = new Uint8Array(lines.length);
    const take = (pt: Pt): Pt[] | null => {
      for (const j of ends.get(key(pt)) ?? []) {
        if (used[j]) continue;
        const l = lines[j]!; used[j] = 1; drop(l[0]!, j); drop(l[l.length - 1]!, j);
        return key(l[0]!) === key(pt) ? l : [...l].reverse();
      }
      return null;
    };
    lines.forEach((l, i) => {
      if (used[i]) return;
      used[i] = 1; drop(l[0]!, i); drop(l[l.length - 1]!, i);
      let chain = [...l];
      for (let nx = take(chain[chain.length - 1]!); nx; nx = take(chain[chain.length - 1]!)) chain.push(...nx.slice(1));
      for (let nx = take(chain[0]!); nx; nx = take(chain[0]!)) chain = [...[...nx].reverse().slice(0, -1), ...chain];
      out.push({ cls, name, line: chain });
    });
  }
  return out;
}

export function encodeLine(line: Pt[], origin: Pt): number[] {
  const out: number[] = []; let px = 0, py = 0;
  line.forEach(([lon, lat], i) => {
    const x = Math.round((lon - origin[0]) * SCALE), y = Math.round((lat - origin[1]) * SCALE);
    if (i && x === px && y === py) return;
    out.push(i ? x - px : x, i ? y - py : y); px = x; py = y;
  });
  return out;
}

export const cellOf = (pt: Pt): [number, number] => [Math.floor((pt[0] - GRID.lon0) / GRID.dLon), Math.floor((pt[1] - GRID.lat0) / GRID.dLat)];

/** Street names a path crosses, in order along it. Streets the path runs along do not cross it, so they drop out. */
export function crossings(lines: Pt[][], roads: Road[]): string[] {
  const k = Math.cos((42.35 * Math.PI) / 180);
  const hits: { at: number; name: string }[] = [];
  const all = lines.flat(), pad = 0.002;
  const x0 = Math.min(...all.map((q) => q[0])) - pad, x1 = Math.max(...all.map((q) => q[0])) + pad, y0 = Math.min(...all.map((q) => q[1])) - pad, y1 = Math.max(...all.map((q) => q[1])) + pad;
  roads = roads.filter((r) => r.name && r.cls !== 0 && !/tunnel/i.test(r.name)
    && Math.min(...r.line.map((q) => q[0])) <= x1 && Math.max(...r.line.map((q) => q[0])) >= x0 && Math.min(...r.line.map((q) => q[1])) <= y1 && Math.max(...r.line.map((q) => q[1])) >= y0);
  let base = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!;
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minY = Math.min(ay, by), maxY = Math.max(ay, by);
      for (const r of roads) {
        if (!r.name || r.cls === 0) continue;                 // a freeway goes over or under; it is not a cross street
        for (let j = 0; j + 1 < r.line.length; j++) {
          const [cx, cy] = r.line[j]!, [dx, dy] = r.line[j + 1]!;
          if (Math.max(cx, dx) < minX || Math.min(cx, dx) > maxX || Math.max(cy, dy) < minY || Math.min(cy, dy) > maxY) continue;
          const rx = (bx - ax) * k, ry = by - ay, sx = (dx - cx) * k, sy = dy - cy, den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-14) continue;
          const qx = (cx - ax) * k, qy = cy - ay, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const sin = Math.abs(den) / (Math.hypot(rx, ry) * Math.hypot(sx, sy));
          if (sin < 0.5) continue;                            // under 30 degrees: running alongside, not crossing
          hits.push({ at: base + i + t, name: r.name });
        }
      }
    }
    base += line.length;
  }
  // One street, once. At a city line the City's layer and TIGER can type the same street differently
  // ("Tireman Ave" / "Tireman St"), so the street type doesn't count as a difference.
  const seen = new Set<string>();
  const key = (n: string) => n.toLowerCase().replace(/\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ct|pl|ln|way|hwy|pkwy)\.?$/, '');
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name).filter((n) => !seen.has(key(n)) && !!seen.add(key(n)));
}

// ---- fetch ---------------------------------------------------------------------
async function geojson(layer: string, fields: string, page: number): Promise<any[]> {
  const all: any[] = [];
  for (let offset = 0; ; offset += page) {
    const q = `${layer}/query?where=1%3D1&outFields=${fields}&outSR=4326&geometryPrecision=6&resultOffset=${offset}&resultRecordCount=${page}&orderByFields=${fields.split(',')[0]}&f=geojson`;
    const fc = (await (await fetch(q, { headers: UA })).json()) as any;
    if (fc.error) throw new Error(`${layer}: ${JSON.stringify(fc.error)}`);
    all.push(...(fc.features ?? []));
    if ((fc.features ?? []).length < page) return all;
    await new Promise((r) => setTimeout(r, 300));
  }
}
const lastEdited = async (layer: string) => {
  const m = (await (await fetch(`${layer}?f=json`, { headers: UA })).json()) as any;
  return today(new Date(m.editingInfo?.dataLastEditDate ?? m.editingInfo?.lastEditDate));
};
const linesOf = (g: any): Pt[][] => (!g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const ringsOf = (g: any): Pt[][] => (!g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
const compact = (path: string, data: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data) + '\n'); };

// ---- the neighbor cities (Kyle, 2026-09-19) -------------------------------------
// Hamtramck, Highland Park and Dearborn are in the service area, and the City's layers stop at Detroit. Their streets
// and all four city outlines come from the Census Bureau's TIGER data (public domain). The four outlines come from
// one source so their shared borders line up exactly: no seams, and Hamtramck and Highland Park fill the hole in
// Detroit's outline instead of reading as water.
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const TIGER_PLACES = `${TIGER}/Places_CouSub_ConCity_SubMCD/MapServer/4`;
const TIGER_ROADS = [`${TIGER}/Transportation/MapServer/2`, `${TIGER}/Transportation/MapServer/6`, `${TIGER}/Transportation/MapServer/8`];
export const NEIGHBOR_CITIES = ['Hamtramck', 'Highland Park', 'Dearborn'];

/** TIGER's road codes to ours: limited-access 0, other main roads 1, local streets 4. Ramps, alleys, paths: none. */
export function tigerClass(mtfcc: unknown): number | null {
  return ({ S1100: 0, S1200: 1, S1400: 4 } as Record<string, number>)[String(mtfcc ?? '')] ?? null;
}
/** "I- 94" -> "I-94"; everything else as written. */
export const tigerName = (raw: unknown) => String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^(I|US|M)- ?(\d+)/, '$1-$2');

/** Even-odd point in polygon over all rings (holes included). */
export function insideRings(pt: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

async function tigerQuery(layer: string, where: string, extra = ''): Promise<any[]> {
  const all: any[] = [];
  for (let offset = 0; ; offset += 2000) {
    const q = `${layer}/query?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&geometryPrecision=6&returnGeometry=true&resultOffset=${offset}&resultRecordCount=2000&orderByFields=OBJECTID&f=geojson${extra}`;
    const fc = (await (await fetch(q, { headers: UA })).json()) as any;
    if (fc.error) throw new Error(`${layer}: ${JSON.stringify(fc.error)}`);
    all.push(...(fc.features ?? []));
    if ((fc.features ?? []).length < 2000) return all;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** The four city outlines, and every named street whose middle lies in Hamtramck, Highland Park or Dearborn. */
async function neighbors(): Promise<{ outlines: Pt[][]; roads: Road[] }> {
  const names = ['Detroit', ...NEIGHBOR_CITIES].map((n) => `'${n}'`).join(',');
  const places = await tigerQuery(TIGER_PLACES, `STATE='26' AND BASENAME IN (${names})`);
  if (places.length !== 4) throw new Error(`basemap: expected 4 city outlines from TIGER, got ${places.length}. Not overwriting the last good files.`);
  const outlines = places.flatMap((f) => ringsOf(f.geometry));
  const near = places.filter((f) => NEIGHBOR_CITIES.includes(String(f.properties?.BASENAME)));
  const nearRings = near.flatMap((f) => ringsOf(f.geometry));
  const all = nearRings.flat(), env = { xmin: Math.min(...all.map((q) => q[0])), ymin: Math.min(...all.map((q) => q[1])), xmax: Math.max(...all.map((q) => q[0])), ymax: Math.max(...all.map((q) => q[1])), spatialReference: { wkid: 4326 } };
  const box = `&geometry=${encodeURIComponent(JSON.stringify(env))}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
  const roads: Road[] = [];
  for (const layer of TIGER_ROADS) {
    for (const f of await tigerQuery(layer, '1=1', box)) {
      const cls = tigerClass(f.properties?.MTFCC), name = tigerName(f.properties?.NAME);
      if (cls === null || (!name && cls !== 0)) continue;
      for (const line of linesOf(f.geometry)) if (line.length > 1 && insideRings(line[Math.floor(line.length / 2)]!, nearRings)) roads.push({ cls, name, line });
    }
  }
  if (roads.length < 1000) throw new Error(`basemap: only ${roads.length} neighbor-city streets parsed. Not overwriting the last good files.`);
  return { outlines, roads };
}

/** Turn a list of roads into the compact file shape. */
export function packRoads(roads: Road[], origin: Pt, tol: number): { names: string[]; roads: [number, number, number[]][] } {
  const names: string[] = [], idx = new Map<string, number>();
  const nameIdx = (n: string) => (n ? idx.get(n) ?? (idx.set(n, names.push(n) - 1), names.length - 1) : -1);
  const packed = mergeChains(roads).map((r) => [r.cls, nameIdx(r.name), encodeLine(simplify(r.line, tol), origin)] as [number, number, number[]])
    .filter((r) => r[2].length >= 4).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2][0]! - b[2][0]! || a[2][1]! - b[2][1]!);
  return { names, roads: packed };
}

async function main() {
  const dir = p('data/ingested/basemap');
  const [roadFeats, parkFeats, cityFeats] = [await geojson(ROADS, 'OBJECTID,RDNAME,NFC,FCC', 2000), await geojson(PARKS, 'ObjectId,park_name', 1000), await geojson(BOUNDARY, 'FID', 10)];
  const roads: Road[] = [];
  for (const f of roadFeats) {
    const a = f.properties ?? {}, cls = NFC[String(a.NFC ?? '0').trim()] ?? 4, name = roadName(a.RDNAME);
    if (!name && cls !== 0) continue;                        // unnamed alleys and turn lanes; freeway ramps stay
    for (const line of linesOf(f.geometry)) if (line.length > 1) roads.push({ cls, name, line });
  }
  if (roads.length < 20000) throw new Error(`basemap: only ${roads.length} roads parsed. Not overwriting the last good files.`);
  const near = await neighbors();
  roads.push(...near.roads);

  rmSync(dir, { recursive: true, force: true });
  const origin: Pt = [GRID.lon0, GRID.lat0];
  const parkNames: string[] = [];
  const parks = parkFeats.flatMap((f) => {
    const n = String(f.properties?.park_name ?? '').trim();
    return ringsOf(f.geometry).slice(0, 1).map((ring) => [n ? parkNames.push(n) - 1 : -1, encodeLine(simplify(ring, 3), origin)] as [number, number[]]);
  }).filter((x) => x[1].length >= 8);
  const big = packRoads(roads.filter((r) => r.cls <= 2), origin, 4);
  // All four outlines from TIGER, simplified alike, so shared borders stay shared. (The City's boundary layer is
  // still read, to date it in source.json, but the drawn outline is TIGER's.)
  void cityFeats;
  const boundary = near.outlines.map((ring) => encodeLine(simplify(ring, 15), origin)).filter((r) => r.length >= 8);
  const sources = { roads: await lastEdited(ROADS), parks: await lastEdited(PARKS), boundary: await lastEdited(BOUNDARY), neighbors: today() };
  compact(`${dir}/base.json`, { origin, names: big.names, roads: big.roads, park_names: parkNames, parks, boundary });

  const byCell = new Map<string, Road[]>();
  for (const r of roads.filter((x) => x.cls > 2)) {
    const [cx, cy] = cellOf(r.line[Math.floor(r.line.length / 2)]!), k = `c_${cx}_${cy}`;
    (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(r);
  }
  for (const [k, list] of byCell) {
    const [, cx, cy] = k.split('_').map(Number) as [number, number, number];
    const o: Pt = [Number((GRID.lon0 + cx * GRID.dLon).toFixed(5)), Number((GRID.lat0 + cy * GRID.dLat).toFixed(5))];
    compact(`${dir}/cells/${k}.json`, { origin: o, ...packRoads(list, o, 1.5) });
  }

  const jlg = p('data/ingested/jlg_segments.json');
  const cross: Record<string, string[]> = {};
  if (existsSync(jlg)) for (const s of (JSON.parse(readFileSync(jlg, 'utf8')).segments as Segment[])) cross[s.id] = crossings(s.lines, roads);
  compact(`${dir}/crossings.json`, cross);
  compact(`${dir}/source.json`, { name: 'City of Detroit open data (Detroit roads and parks); US Census Bureau TIGER (city outlines; Hamtramck, Highland Park and Dearborn streets)', urls: { roads: ROADS, parks: PARKS, boundary: BOUNDARY, tiger_places: TIGER_PLACES, tiger_roads: TIGER_ROADS }, last_edited: sources, grid: GRID, scale: SCALE });
  console.log(`basemap: ${roads.length} road pieces -> ${big.roads.length} main-road lines in base.json, ${byCell.size} cells; ${parks.length} parks; crossings for ${Object.keys(cross).length} greenway segments`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-basemap.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
