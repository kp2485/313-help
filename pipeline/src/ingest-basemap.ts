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
import { safetyByte, type Segment } from '@313help/query';
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
export interface Road { cls: number; name: string; line: Pt[]; safety?: number }

// The City's own safety fields on the same Roads layer, packed one byte per polyline (schema/query-spec.md
// "The safety byte"). Same source, same licence, nothing new fetched from anywhere else. They are what lets a
// walking route prefer a calmer street using the City's own judgement rather than ours.
export const SAFETY_FIELDS = ['HIN_2021', 'HighSeverity', 'LANES', 'POSTED_SPE', 'AADT'] as const;

/** The layer writes yes/no as text and the three numbers as integers, with 0 and null both meaning "unknown". */
export function roadSafety(a: Record<string, unknown>): number {
  const yes = (v: unknown) => /^y(es)?$/i.test(String(v ?? '').trim());
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  return safetyByte({ hin: yes(a.HIN_2021), highSeverity: yes(a.HighSeverity), lanes: num(a.LANES), speed: num(a.POSTED_SPE), aadt: num(a.AADT) });
}

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

/**
 * The worst of two safety bytes, field by field: on the High Injury Network if either piece is, the higher
 * lane, speed and traffic bucket of the two. Pieces of one street are joined end to end below, so the byte a
 * merged line carries is the worst of the pieces inside it — a route is warned by the worst block of a street,
 * never let through by the calmest one.
 */
export function worstSafety(a: number, b: number): number {
  const bucket = (shift: number) => Math.max((a >> shift) & 3, (b >> shift) & 3) << shift;
  return ((a | b) & 3) | bucket(2) | bucket(4) | bucket(6);
}

/** Metres between two [lon, lat] points, near enough for this latitude. */
export const metresApart = (a: Pt, b: Pt): number =>
  Math.hypot((b[0] - a[0]) * 111320 * Math.cos((42.4 * Math.PI) / 180), (b[1] - a[1]) * 110574);

/**
 * TIGER does not share a node between the two pieces of a street either side of an intersection: measured on
 * Highland Park, consecutive pieces of one street end 6-17 m apart (Ford St at 2nd Ave: 12 m). Keying an
 * endpoint by its exact rounded coordinate, as this used to, therefore never joined them, and a street came out
 * as a dozen two-point lines with a dozen labels. So ends are snapped first: every endpoint within SNAP_M of one
 * already seen is treated as the same place. 2 m is under half a lane and well under a block.
 */
export const SNAP_M = 2;
/** A gap a chain may step over when the next piece plainly carries the same street on: metres, and the two
 *  cosines that make "carries on" mean something — 25 degrees of turn, and 40 degrees off straight ahead. */
export const BRIDGE_M = 20, BRIDGE_COS = Math.cos((25 * Math.PI) / 180), BRIDGE_AHEAD = Math.cos((40 * Math.PI) / 180);
const KLON = Math.cos((42.4 * Math.PI) / 180);
/** Unit vector from a to b, with longitude squeezed so a bearing means what it looks like on the screen. */
export const unit = (a: Pt, b: Pt): Pt => { const x = (b[0] - a[0]) * KLON, y = b[1] - a[1], L = Math.hypot(x, y) || 1; return [x / L, y / L]; };
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

/** Group endpoints that are within `tol` metres of each other; returns a key function over them. */
export function snapper(points: Pt[], tol = SNAP_M): (pt: Pt) => string {
  const cell = tol / 100000;                                   // a grid coarser than tol, in degrees
  const buckets = new Map<string, { at: Pt; id: number }[]>();
  const ids = new Map<string, number>();
  const bucket = (pt: Pt) => `${Math.floor(pt[0] / cell)},${Math.floor(pt[1] / cell)}`;
  const exact = (pt: Pt) => `${pt[0]},${pt[1]}`;
  const find = (pt: Pt): number | null => {
    const [bx, by] = bucket(pt).split(',').map(Number) as [number, number];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const c of buckets.get(`${bx + dx},${by + dy}`) ?? []) if (metresApart(pt, c.at) <= tol) return c.id;
    return null;
  };
  for (const pt of points) {
    if (ids.has(exact(pt))) continue;
    const hit = find(pt);
    const id = hit ?? ids.size;
    ids.set(exact(pt), id);
    if (hit === null) (buckets.get(bucket(pt)) ?? buckets.set(bucket(pt), []).get(bucket(pt))!).push({ at: pt, id });
  }
  return (pt: Pt) => String(ids.get(exact(pt)) ?? `?${exact(pt)}`);
}

/** Join block-long pieces of the same street end to end, so there are fewer lines and better labels. */
export function mergeChains(roads: Road[]): Road[] {
  const key = snapper(roads.flatMap((r) => [r.line[0]!, r.line[r.line.length - 1]!]));
  const groups = new Map<string, Road[]>();
  for (const r of roads) { const k = `${r.cls}|${r.name}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const out: Road[] = [];
  for (const [k, pieces] of groups) {
    const cls = Number(k.slice(0, k.indexOf('|'))), name = k.slice(k.indexOf('|') + 1);
    const lines = pieces.map((r) => r.line);
    const ends = new Map<string, Set<number>>();
    const add = (pt: Pt, i: number) => (ends.get(key(pt)) ?? ends.set(key(pt), new Set()).get(key(pt))!).add(i);
    const drop = (pt: Pt, i: number) => ends.get(key(pt))?.delete(i);
    lines.forEach((l, i) => { add(l[0]!, i); add(l[l.length - 1]!, i); });
    const used = new Uint8Array(lines.length);
    const at = (j: number, front: boolean) => (front ? lines[j]![0]! : lines[j]![lines[j]!.length - 1]!);
    const claim = (j: number, pt: Pt, forwards: boolean): { line: Pt[]; safety: number } => {
      const l = lines[j]!; used[j] = 1; drop(l[0]!, j); drop(l[l.length - 1]!, j);
      return { line: forwards ? l : [...l].reverse(), safety: pieces[j]!.safety ?? 0 };
    };
    const take = (pt: Pt, heading: Pt | null): { line: Pt[]; safety: number } | null => {
      for (const j of ends.get(key(pt)) ?? []) {
        if (used[j]) continue;
        return claim(j, pt, key(lines[j]![0]!) === key(pt));
      }
      // Nothing shares this end. TIGER leaves a gap of one intersection between its pieces (6-20 m on the
      // Highland Park streets), so look for a piece that starts a few metres ahead and carries straight on:
      // near enough, pointing the same way, and lying ahead rather than beside. A street on the far side of a
      // boulevard, or the other carriageway of one, fails the second or third test and stays a separate line.
      if (!heading) return null;
      let best: { j: number; front: boolean; d: number } | null = null;
      for (let j = 0; j < lines.length; j++) {
        if (used[j]) continue;
        for (const front of [true, false]) {
          const e = at(j, front), d = metresApart(pt, e);
          if (d > BRIDGE_M || d < 1e-9) continue;
          const other = front ? lines[j]![1]! : lines[j]![lines[j]!.length - 2]!;
          const far = front ? lines[j]![lines[j]!.length - 1]! : lines[j]![0]!;
          // Points the same way, and goes on ahead: the far end of the candidate must be further along, which
          // is what tells the next block of a street from the other carriageway of the same boulevard.
          if (dot(heading, unit(e, other)) < BRIDGE_COS || dot(heading, unit(pt, far)) < BRIDGE_AHEAD) continue;
          if (!best || d < best.d) best = { j, front, d };
        }
      }
      return best ? claim(best.j, pt, best.front) : null;
    };
    const headEnd = (l: Pt[]) => unit(l[l.length - 2]!, l[l.length - 1]!);
    const headStart = (l: Pt[]) => unit(l[1]!, l[0]!);
    lines.forEach((l, i) => {
      if (used[i]) return;
      used[i] = 1; drop(l[0]!, i); drop(l[l.length - 1]!, i);
      let chain = [...l], safety = pieces[i]!.safety ?? 0;
      for (let nx = take(chain[chain.length - 1]!, headEnd(chain)); nx; nx = take(chain[chain.length - 1]!, headEnd(chain))) { chain.push(...nx.line.slice(1)); safety = worstSafety(safety, nx.safety); }
      for (let nx = take(chain[0]!, headStart(chain)); nx; nx = take(chain[0]!, headStart(chain))) { chain = [...[...nx.line].reverse().slice(0, -1), ...chain]; safety = worstSafety(safety, nx.safety); }
      out.push({ cls, name, line: chain, safety });
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

/**
 * Cut a line at a city boundary and keep the side asked for.
 *
 * The old rule — keep a TIGER line only if its MIDDLE vertex is inside one of the three cities — threw away
 * every street whose TIGER feature runs on past the city line, which is exactly the through streets: measured
 * on 2026-09-22, 16.6% of Highland Park's 97 km of street had nothing drawn for it, including most of Woodward
 * Ave, John R St, Brush St, 3rd St, Glendale Ave and the Davison, because the City of Detroit's own roads layer
 * stops dead at the city line (0 Woodward vertices inside Highland Park) and TIGER's piece was being dropped.
 * Clipping instead of dropping gives one authority on each side of the line and no gap between them.
 */
export function clipToRings(line: Pt[], rings: Pt[][], keepInside: boolean): Pt[][] {
  // Most of Detroit is nowhere near these three outlines, so a line whose box misses every ring's box needs no
  // work at all: it is wholly outside, and that answer is exact.
  const box = (pts: Pt[]) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] as const;
  const lb = box(line);
  const near = rings.filter((r) => { const rb = box(r); return rb[0] <= lb[2] && rb[2] >= lb[0] && rb[1] <= lb[3] && rb[3] >= lb[1]; });
  if (!near.length) return keepInside ? [] : [line];
  const out: Pt[][] = [];
  let run: Pt[] = [];
  const push = () => { if (run.length > 1) out.push(run); run = []; };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!;
    const ts = [0];
    for (const ring of near) for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
      const c = ring[k]!, d = ring[j]!;
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-15) continue;
      const qx = c[0] - a[0], qy = c[1] - a[1];
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.push(1);
    ts.sort((x, y) => x - y);
    const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let s = 0; s + 1 < ts.length; s++) {
      const t0 = ts[s]!, t1 = ts[s + 1]!;
      if (t1 - t0 < 1e-12) continue;
      if (insideRings(at((t0 + t1) / 2), near) === keepInside) {
        if (!run.length) run.push(at(t0));
        run.push(at(t1));
      } else push();
    }
  }
  push();
  return out.map((l) => l.filter((pt, i) => i === 0 || metresApart(pt, l[i - 1]!) > 0.05)).filter((l) => l.length > 1);
}

/**
 * TIGER publishes one row per NAME an edge carries, so the same geometry comes back twice or more: in the
 * Highland Park box, 114 of 794 distinct geometries arrive under two names ("Tyler St" and "Tyler Ave",
 * "Woodward Ave" and "State Hwy 1"). Drawn as they arrive, every street in the three cities is drawn twice and
 * labelled twice, and half the pieces cannot join the City's own piece across the line because they are typed
 * differently. One geometry keeps one name: the one the City of Detroit's layer uses for the street next door,
 * then a real name over a route number, then whichever sorts first so the file is the same every build.
 */
export function pickNames(rows: { line: Pt[]; name: string; cls: number }[], cityNames: Set<string>): { line: Pt[]; name: string; cls: number }[] {
  const byShape = new Map<string, { line: Pt[]; name: string; cls: number }[]>();
  for (const r of rows) {
    const k = r.line.map((p) => `${Math.round(p[0] * SCALE)},${Math.round(p[1] * SCALE)}`).join(';');
    (byShape.get(k) ?? byShape.set(k, []).get(k)!).push(r);
  }
  const rank = (n: string) => (cityNames.has(n) ? 0 : /\b(State|Interstate|US) Hwy \d/.test(n) ? 2 : 1);
  return [...byShape.values()].map((group) => {
    const best = [...group].sort((a, b) => rank(a.name) - rank(b.name) || a.cls - b.cls || a.name.localeCompare(b.name))[0]!;
    return { line: best.line, name: best.name, cls: Math.min(...group.map((g) => g.cls)) };
  });
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

/** The four city outlines, and every named street with any part in Hamtramck, Highland Park or Dearborn. */
async function neighbors(cityNames: Set<string>): Promise<{ outlines: Pt[][]; rings: Pt[][]; roads: Road[] }> {
  const names = ['Detroit', ...NEIGHBOR_CITIES].map((n) => `'${n}'`).join(',');
  const places = await tigerQuery(TIGER_PLACES, `STATE='26' AND BASENAME IN (${names})`);
  if (places.length !== 4) throw new Error(`basemap: expected 4 city outlines from TIGER, got ${places.length}. Not overwriting the last good files.`);
  const outlines = places.flatMap((f) => ringsOf(f.geometry));
  const near = places.filter((f) => NEIGHBOR_CITIES.includes(String(f.properties?.BASENAME)));
  const nearRings = near.flatMap((f) => ringsOf(f.geometry));
  const all = nearRings.flat(), env = { xmin: Math.min(...all.map((q) => q[0])), ymin: Math.min(...all.map((q) => q[1])), xmax: Math.max(...all.map((q) => q[0])), ymax: Math.max(...all.map((q) => q[1])), spatialReference: { wkid: 4326 } };
  const box = `&geometry=${encodeURIComponent(JSON.stringify(env))}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`;
  const raw: { line: Pt[]; name: string; cls: number }[] = [];
  for (const layer of TIGER_ROADS) {
    for (const f of await tigerQuery(layer, '1=1', box)) {
      const cls = tigerClass(f.properties?.MTFCC), name = tigerName(f.properties?.NAME);
      if (cls === null || (!name && cls !== 0)) continue;
      for (const line of linesOf(f.geometry)) if (line.length > 1) raw.push({ cls, name, line });
    }
  }
  // One name per geometry first (TIGER sends each edge once per name), then cut each line at the city line and
  // keep the part inside. A street that runs on into Detroit keeps the blocks that are in the neighbour city
  // instead of being thrown away whole.
  const roads: Road[] = [];
  for (const r of pickNames(raw, cityNames)) for (const line of clipToRings(r.line, nearRings, true)) roads.push({ cls: r.cls, name: r.name, line });
  if (roads.length < 1000) throw new Error(`basemap: only ${roads.length} neighbor-city streets parsed. Not overwriting the last good files.`);
  return { outlines, rings: nearRings, roads };
}

/**
 * Turn a list of roads into the compact file shape.
 *
 * `safety` is one small whole number per entry of `roads`, in the same order — additive, so a client that does
 * not know the key draws exactly what it drew before. It is left out entirely when every byte is 0, which is
 * what an older basemap, or a City layer that refused the fields, produces.
 */
export function packRoads(roads: Road[], origin: Pt, tol: number): { names: string[]; roads: [number, number, number[]][]; safety?: number[] } {
  const names: string[] = [], idx = new Map<string, number>();
  const nameIdx = (n: string) => (n ? idx.get(n) ?? (idx.set(n, names.push(n) - 1), names.length - 1) : -1);
  const packed = mergeChains(roads).map((r) => [r.cls, nameIdx(r.name), encodeLine(simplify(r.line, tol), origin), r.safety ?? 0] as [number, number, number[], number])
    .filter((r) => r[2].length >= 4).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2][0]! - b[2][0]! || a[2][1]! - b[2][1]!);
  const safety = packed.map((r) => r[3]);
  return { names, roads: packed.map((r) => [r[0], r[1], r[2]] as [number, number, number[]]), ...(safety.some((s) => s > 0) ? { safety } : {}) };
}

async function main() {
  const dir = p('data/ingested/basemap');
  const [roadFeats, parkFeats, cityFeats] = [await geojson(ROADS, `OBJECTID,RDNAME,NFC,FCC,${SAFETY_FIELDS.join(',')}`, 2000), await geojson(PARKS, 'ObjectId,park_name', 1000), await geojson(BOUNDARY, 'FID', 10)];
  const city: Road[] = [];
  for (const f of roadFeats) {
    const a = f.properties ?? {}, cls = NFC[String(a.NFC ?? '0').trim()] ?? 4, name = roadName(a.RDNAME);
    if (!name && cls !== 0) continue;                        // unnamed alleys and turn lanes; freeway ramps stay
    const safety = roadSafety(a);
    for (const line of linesOf(f.geometry)) if (line.length > 1) city.push({ cls, name, line, safety });
  }
  if (city.length < 20000) throw new Error(`basemap: only ${city.length} roads parsed. Not overwriting the last good files.`);
  const near = await neighbors(new Set(city.map((r) => r.name).filter(Boolean)));
  // One authority on each side of the city line: TIGER inside the three neighbour cities, the City of Detroit's
  // own layer outside. The City's layer reaches about 0.95 km into Highland Park and a few metres into
  // Hamtramck; clipping that away is what stops the same block being drawn, and labelled, twice.
  const roads: Road[] = [];
  for (const r of city) for (const line of clipToRings(r.line, near.rings, false)) roads.push({ ...r, line });
  const clipped = city.length - roads.length;
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
  compact(`${dir}/base.json`, { origin, names: big.names, roads: big.roads, ...(big.safety ? { safety: big.safety } : {}), park_names: parkNames, parks, boundary });

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
  // `safety_fields` says which fields of the City's Roads layer the one byte per polyline was packed from, so a
  // reader of the file never has to guess. TIGER publishes none of them, so the three neighbour cities' streets
  // carry a byte of 0 — "this file told us nothing" — and the graph falls back to street class there.
  compact(`${dir}/source.json`, { name: 'City of Detroit open data (Detroit roads and parks); US Census Bureau TIGER (city outlines; Hamtramck, Highland Park and Dearborn streets)', urls: { roads: ROADS, parks: PARKS, boundary: BOUNDARY, tiger_places: TIGER_PLACES, tiger_roads: TIGER_ROADS }, last_edited: sources, grid: GRID, scale: SCALE, safety_fields: [...SAFETY_FIELDS] });
  const withSafety = roads.filter((r) => (r.safety ?? 0) > 0).length;
  console.log(`basemap: ${roads.length} road pieces -> ${big.roads.length} main-road lines in base.json, ${byCell.size} cells; ${parks.length} parks; crossings for ${Object.keys(cross).length} greenway segments; ${withSafety} pieces carry the City's safety fields; ${near.roads.length} pieces from TIGER inside the three neighbour cities, ${clipped >= 0 ? clipped : 0} City pieces net change from clipping at the city line`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-basemap.ts')) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
