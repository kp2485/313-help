// A routable street graph, built on the device from the map files the app already downloads.
// Spec: schema/query-spec.md "Streets graph". Measured study: docs/research/2026-09-22-offline-directions.md.
//
// The bundle's street files (`map/base.json`, the cells inside `map/streets.json`) are drawn, not routed: a
// street is ONE polyline from end to end and every cross street crosses it mid-line, so 82% of polyline ends
// touch nothing. Noding fixes that on the phone: split every polyline wherever it geometrically crosses
// another, then pull each still-dangling end onto a line within 12 m.
//
// Nothing here touches the network, the clock, or a person's location. It is arithmetic on a file.

/** Metres per degree, at one fixed reference latitude for the whole service area, so every client gets the
 *  same metre value for the same pair of points and fixtures can be compared exactly. */
export const REF_LAT = 42.35;
export const M_PER_DEG_LAT = 111132;
export const M_PER_DEG_LON = 111320 * Math.cos((REF_LAT * Math.PI) / 180);

/** Whole units of 1e-5 degrees, the packing every map file uses (docs/06 "Map"). */
export const STREET_SCALE = 1e5;

/** Build constants. Changing any of them changes the graph, so they are part of the spec. */
export const CELL_M = 200;          // grid cell for the crossing search
export const NODE_TOL_M = 1;        // two points this close are one node
export const SNAP_M = 12;           // a dangling polyline end is pulled onto a line this close
export const MIN_EDGE_M = 0.01;     // shorter than this is not an edge
export const STREET_GRAPH_VERSION = 1;

/** A street class, as the basemap writes it: 0 freeway/ramp, 1 main road, 2 arterial, 3 collector, 4 local. */
export const FREEWAY_CLASS = 0;

export type Pt = [number, number];  // [lon, lat]

/** One street file exactly as the bundle carries it. `safety` is optional and additive (see `safetyByte`). */
export interface PackedStreets {
  origin: Pt;
  names: string[];
  roads: [number, number, number[]][];   // [class, nameIndex, encoded line]
  safety?: number[];                     // one byte per entry of `roads`, same order
}

/** A decoded polyline, in metres, ready to be noded. */
export interface Street {
  cls: number;
  name: string;
  /** The safety byte (`safetyByte`), or 0 when the file carried none. */
  safety: number;
  /** Projected vertices: [x, y] in metres. */
  pts: Pt[];
  /** The same vertices as [lon, lat], kept for drawing. */
  lonlat: Pt[];
}

// ---- the safety byte ------------------------------------------------------------------------
// One byte per polyline, from the City's own Roads layer (`pipeline/src/ingest-basemap.ts`):
//   bit 0      HIN_2021       on the City's High Injury Network
//   bit 1      HighSeverity   the City's high-severity marking
//   bits 2-3   lanes          0 unknown, 1 = 1-2, 2 = 3-4, 3 = 5 or more
//   bits 4-5   posted speed   0 unknown, 1 = 25 or less, 2 = 30-35, 3 = 40 or more
//   bits 6-7   AADT           0 unknown, 1 = under 5k, 2 = 5k-20k, 3 = over 20k
// A byte of 0 means "this file told us nothing", which is exactly what an older bundle says.
export const SAFETY_HIN = 1;
export const SAFETY_HIGH_SEVERITY = 2;

export const lanesBucket = (n: number | null | undefined): number =>
  n === null || n === undefined || !(n > 0) ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
export const speedBucket = (n: number | null | undefined): number =>
  n === null || n === undefined || !(n > 0) ? 0 : n <= 25 ? 1 : n <= 35 ? 2 : 3;
export const aadtBucket = (n: number | null | undefined): number =>
  n === null || n === undefined || !(n > 0) ? 0 : n < 5000 ? 1 : n <= 20000 ? 2 : 3;

export function safetyByte(f: { hin?: boolean; highSeverity?: boolean; lanes?: number | null; speed?: number | null; aadt?: number | null }): number {
  return (f.hin ? SAFETY_HIN : 0) | (f.highSeverity ? SAFETY_HIGH_SEVERITY : 0)
    | (lanesBucket(f.lanes) << 2) | (speedBucket(f.speed) << 4) | (aadtBucket(f.aadt) << 6);
}
export const safetyHin = (b: number) => (b & SAFETY_HIN) !== 0;
export const safetyHighSeverity = (b: number) => (b & SAFETY_HIGH_SEVERITY) !== 0;
export const safetyLanes = (b: number) => (b >> 2) & 3;
export const safetySpeed = (b: number) => (b >> 4) & 3;
export const safetyAadt = (b: number) => (b >> 6) & 3;

// ---- decoding -------------------------------------------------------------------------------

export const toMetres = (lon: number, lat: number): Pt => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];
export const toLonLat = (x: number, y: number): Pt => [x / M_PER_DEG_LON, y / M_PER_DEG_LAT];

/** One street file's polylines, decoded and projected. Order is the file's order, so the graph is deterministic. */
export function decodeStreets(file: PackedStreets): Street[] {
  const [ox, oy] = file.origin;
  return file.roads.map(([cls, nameIdx, enc], i) => {
    const lonlat: Pt[] = [];
    let x = 0, y = 0;
    for (let k = 0; k + 1 < enc.length; k += 2) {
      if (k === 0) { x = enc[0]!; y = enc[1]!; } else { x += enc[k]!; y += enc[k + 1]!; }
      lonlat.push([ox + x / STREET_SCALE, oy + y / STREET_SCALE]);
    }
    return {
      cls, name: nameIdx >= 0 ? (file.names[nameIdx] ?? '') : '', safety: file.safety?.[i] ?? 0,
      pts: lonlat.map(([lon, lat]) => toMetres(lon, lat)), lonlat,
    };
  });
}

// ---- the graph ------------------------------------------------------------------------------

/**
 * A street graph in typed arrays. Undirected: every edge appears once from each end (the City's layer
 * publishes no one-way field, which is exactly why there are no driving directions).
 *
 * CSR: node `n`'s edges are the half-open range `head[n] .. head[n + 1]` of `edgeTo`/`edgeLen`/`edgeWay`.
 */
export interface StreetGraph {
  version: number;
  /** `${STREET_GRAPH_VERSION}:${sha256 of the map files}`, the key this graph is cached under. */
  key: string;
  nodeCount: number;
  edgeCount: number;                 // undirected edges; the arrays below are twice this long
  nodeX: Float64Array;
  nodeY: Float64Array;
  head: Int32Array;                  // nodeCount + 1
  edgeTo: Int32Array;
  edgeLen: Float32Array;
  edgeWay: Int32Array;               // into wayName / wayCls / waySafety
  wayName: string[];
  wayCls: Uint8Array;
  waySafety: Uint8Array;
  /** True when at least one source file carried a `safety` array. Decides which penalty table walk.ts uses. */
  hasSafety: boolean;
  /** Counts a person never sees; the real-data tests do. */
  stats: { polylines: number; skipped: number; crossings: number; snapped: number; components: number; largestComponent: number; deadEnds: number; buildMs: number };
}

/**
 * Grade separation, stated: the map has no bridge/tunnel field, so a crossing of two lines is assumed to be a
 * junction. Two lines may only be joined when **neither is class 0** (freeway and ramp). That covers every
 * freeway-over-street and street-over-freeway case, which is where nearly all of Detroit's grade separation is,
 * and it is why class 0 is left out of the walking graph altogether — a freeway is not walkable anyway.
 *
 * Residual error, not hidden: a street bridge over another street (rail viaducts, the Rouge crossings, service
 * drives over a sunken street) still becomes a junction. Measured on the committed basemap by
 * `packages/query/test/streets-real.test.ts`.
 */
export const mayJoin = (clsA: number, clsB: number): boolean => clsA !== FREEWAY_CLASS && clsB !== FREEWAY_CLASS;

/** Streets a person can walk: everything but class 0, and only lines with a name we could read aloud. */
export const isWalkable = (s: { cls: number; name: string }): boolean => s.cls !== FREEWAY_CLASS && s.name !== '';

interface Split { seg: number; t: number; x: number; y: number }

/**
 * Build the routable graph. Pass every street file the client holds (base + whichever cells it has).
 *
 * `key` is the caller's cache key — `sha256` of the map files, so a new bundle builds a new graph and an
 * unchanged one is reused. Nothing about a person is part of it.
 */
export function buildStreetGraph(files: PackedStreets[], key = ''): StreetGraph {
  const t0 = Date.now();
  const all = files.flatMap(decodeStreets);
  const hasSafety = files.some((f) => Array.isArray(f.safety) && f.safety.length > 0);
  const streets = all.filter(isWalkable);
  const skipped = all.length - streets.length;

  // 1. every segment of every polyline, bucketed into a 200 m grid
  const grid = new Map<number, number[]>();
  const segRoad: number[] = [], segIdx: number[] = [], segAx: number[] = [], segAy: number[] = [], segBx: number[] = [], segBy: number[] = [];
  const cellKey = (cx: number, cy: number) => cx * 100000 + cy;
  streets.forEach((r, ri) => {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const si = segRoad.length;
      segRoad.push(ri); segIdx.push(i); segAx.push(a[0]); segAy.push(a[1]); segBx.push(b[0]); segBy.push(b[1]);
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL_M), x1 = Math.floor(Math.max(a[0], b[0]) / CELL_M);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL_M), y1 = Math.floor(Math.max(a[1], b[1]) / CELL_M);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = cellKey(x, y);
        const l = grid.get(k); if (l) l.push(si); else grid.set(k, [si]);
      }
    }
  });

  // 2. crossings. Order of discovery does not matter: splits are sorted per polyline afterwards.
  const splits = new Map<number, Split[]>();
  const addSplit = (ri: number, seg: number, t: number, x: number, y: number) => {
    const l = splits.get(ri); const s = { seg, t, x, y };
    if (l) l.push(s); else splits.set(ri, [s]);
  };
  let crossings = 0;
  const seen = new Set<number>();
  for (const list of grid.values()) {
    for (let m = 0; m < list.length; m++) for (let n = m + 1; n < list.length; n++) {
      const p = list[m]!, q = list[n]!;
      const rp = segRoad[p]!, rq = segRoad[q]!;
      if (rp === rq) continue;
      if (!mayJoin(streets[rp]!.cls, streets[rq]!.cls)) continue;
      const pairKey = p < q ? p * 1e7 + q : q * 1e7 + p;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const rx = segBx[p]! - segAx[p]!, ry = segBy[p]! - segAy[p]!;
      const sx = segBx[q]! - segAx[q]!, sy = segBy[q]! - segAy[q]!;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const qx = segAx[q]! - segAx[p]!, qy = segAy[q]! - segAy[p]!;
      const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = segAx[p]! + t * rx, y = segAy[p]! + t * ry;
      addSplit(rp, segIdx[p]!, t, x, y);
      addSplit(rq, segIdx[q]!, u, x, y);
      crossings++;
    }
  }

  // 3. dangling ends: pull the OTHER line onto our endpoint when it passes within SNAP_M.
  let snapped = 0;
  for (let ri = 0; ri < streets.length; ri++) {
    const pts = streets[ri]!.pts;
    for (const end of [0, 1]) {
      const p = end ? pts[pts.length - 1]! : pts[0]!;
      const cx = Math.floor(p[0] / CELL_M), cy = Math.floor(p[1] / CELL_M);
      let bestD = SNAP_M, bestSeg = -1, bestU = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = grid.get(cellKey(cx + a, cy + b)); if (!l) continue;
        for (const si of l) {
          const rj = segRoad[si]!;
          if (rj === ri || !mayJoin(streets[ri]!.cls, streets[rj]!.cls)) continue;
          const dx = segBx[si]! - segAx[si]!, dy = segBy[si]! - segAy[si]!, len2 = dx * dx + dy * dy;
          const u = len2 ? Math.max(0, Math.min(1, ((p[0] - segAx[si]!) * dx + (p[1] - segAy[si]!) * dy) / len2)) : 0;
          const d = Math.hypot(p[0] - segAx[si]! - u * dx, p[1] - segAy[si]! - u * dy);
          if (d < bestD) { bestD = d; bestSeg = si; bestU = u; }
        }
      }
      if (bestSeg >= 0) { addSplit(segRoad[bestSeg]!, segIdx[bestSeg]!, bestU, p[0], p[1]); snapped++; }
    }
  }

  // 4. nodes and edges. Node ids are handed out in polyline order, so two clients build the same graph.
  const nodeGrid = new Map<number, number[]>();
  const nodeX: number[] = [], nodeY: number[] = [];
  const nodeOf = (x: number, y: number): number => {
    const cx = Math.floor(x / NODE_TOL_M), cy = Math.floor(y / NODE_TOL_M);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = nodeGrid.get(cellKey(cx + a, cy + b)); if (!l) continue;
      for (const n of l) if (Math.hypot(nodeX[n]! - x, nodeY[n]! - y) <= NODE_TOL_M) return n;
    }
    const id = nodeX.length; nodeX.push(x); nodeY.push(y);
    const k = cellKey(cx, cy); const l = nodeGrid.get(k); if (l) l.push(id); else nodeGrid.set(k, [id]);
    return id;
  };

  const eA: number[] = [], eB: number[] = [], eLen: number[] = [], eWay: number[] = [];
  const wayName: string[] = [], wayCls: number[] = [], waySafety: number[] = [];
  streets.forEach((r, ri) => {
    const way = wayName.length;
    wayName.push(r.name); wayCls.push(r.cls); waySafety.push(r.safety);
    const sp = (splits.get(ri) ?? []).slice().sort((x, y) => x.seg - y.seg || x.t - y.t);
    let prev = nodeOf(r.pts[0]![0], r.pts[0]![1]), acc = 0, k = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let last = 0;
      while (k < sp.length && sp[k]!.seg === i) {
        const s = sp[k]!, n = nodeOf(s.x, s.y);
        acc += len * (s.t - last); last = s.t;
        if (n !== prev && acc > MIN_EDGE_M) { eA.push(prev); eB.push(n); eLen.push(acc); eWay.push(way); prev = n; acc = 0; }
        k++;
      }
      acc += len * (1 - last);
    }
    const end = nodeOf(r.pts[r.pts.length - 1]![0], r.pts[r.pts.length - 1]![1]);
    if (end !== prev && acc > MIN_EDGE_M) { eA.push(prev); eB.push(end); eLen.push(acc); eWay.push(way); }
  });

  // 5. CSR
  const N = nodeX.length, E = eA.length;
  const head = new Int32Array(N + 1);
  for (let i = 0; i < E; i++) { head[eA[i]! + 1] = head[eA[i]! + 1]! + 1; head[eB[i]! + 1] = head[eB[i]! + 1]! + 1; }
  for (let i = 0; i < N; i++) head[i + 1] = head[i + 1]! + head[i]!;
  const fill = Int32Array.from(head.subarray(0, N));
  const edgeTo = new Int32Array(2 * E), edgeLen = new Float32Array(2 * E), edgeWay = new Int32Array(2 * E);
  const place = (from: number, to: number, len: number, way: number) => {
    const at = fill[from]!; fill[from] = at + 1;
    edgeTo[at] = to; edgeLen[at] = len; edgeWay[at] = way;
  };
  for (let i = 0; i < E; i++) { place(eA[i]!, eB[i]!, eLen[i]!, eWay[i]!); place(eB[i]!, eA[i]!, eLen[i]!, eWay[i]!); }

  // 6. components and dead ends, for the honesty tests
  const parent = new Int32Array(N); for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x: number): number => { while (parent[x]! !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  for (let i = 0; i < E; i++) { const a = find(eA[i]!), b = find(eB[i]!); if (a !== b) parent[a] = b; }
  const sizes = new Map<number, number>();
  for (let i = 0; i < N; i++) { const r = find(i); sizes.set(r, (sizes.get(r) ?? 0) + 1); }
  let largest = 0; for (const v of sizes.values()) if (v > largest) largest = v;
  let deadEnds = 0; for (let i = 0; i < N; i++) if (head[i + 1]! - head[i]! === 1) deadEnds++;

  return {
    version: STREET_GRAPH_VERSION, key: key ? `${STREET_GRAPH_VERSION}:${key}` : '',
    nodeCount: N, edgeCount: E,
    nodeX: Float64Array.from(nodeX), nodeY: Float64Array.from(nodeY),
    head, edgeTo, edgeLen, edgeWay,
    wayName, wayCls: Uint8Array.from(wayCls), waySafety: Uint8Array.from(waySafety), hasSafety,
    stats: { polylines: streets.length, skipped, crossings, snapped, components: sizes.size, largestComponent: largest, deadEnds, buildMs: Date.now() - t0 },
  };
}

// ---- the cache ------------------------------------------------------------------------------
// Building is ~200 ms here and 1-2 s on a cheap phone, so it happens once per map-file version. The key is the
// sha256 of the map files the client already checks the signature against; nothing else is in it.

const graphs = new Map<string, StreetGraph>();
export const STREET_GRAPH_CACHE_SIZE = 2;

/** Returns the cached graph for `sha256`, building it with `build` the first time. */
export function cachedStreetGraph(sha256: string, build: () => StreetGraph): StreetGraph {
  const key = `${STREET_GRAPH_VERSION}:${sha256}`;
  const hit = graphs.get(key);
  if (hit) { graphs.delete(key); graphs.set(key, hit); return hit; }
  const g = build();
  graphs.set(key, { ...g, key });
  while (graphs.size > STREET_GRAPH_CACHE_SIZE) graphs.delete(graphs.keys().next().value as string);
  return graphs.get(key)!;
}

export function clearStreetGraphCache(): void { graphs.clear(); }

// ---- lookup ---------------------------------------------------------------------------------

/** A point on the graph: which edge, how far along it, and how far off the graph the original point was. */
export interface EdgePoint {
  /** Index into `edgeTo`/`edgeLen`/`edgeWay` (a directed half-edge), and the node it leaves. */
  half: number;
  from: number;
  to: number;
  /** 0..1 along `from` -> `to`. */
  t: number;
  x: number;
  y: number;
  /** Metres from the asked-for point to the street. This is the "then about N m to the building" number. */
  offMetres: number;
}

/** The nearest point ON AN EDGE to a location. We route to the street, never to the door. */
export function nearestEdgePoint(g: StreetGraph, pt: { lat: number; lon: number }, maxMetres = 2000): EdgePoint | null {
  const [px, py] = toMetres(pt.lon, pt.lat);
  let best: EdgePoint | null = null, bestD = maxMetres;
  // Widening rings of node cells: an edge is found through either of its end nodes.
  const cx = Math.floor(px / CELL_M), cy = Math.floor(py / CELL_M);
  const nodeCells = new Map<number, number[]>();
  if (!nodeCellsFor(g, nodeCells)) return null;
  for (let r = 1; r <= 12; r++) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      const l = nodeCells.get((cx + a) * 100000 + (cy + b)); if (!l) continue;
      for (const n of l) {
        for (let h = g.head[n]!; h < g.head[n + 1]!; h++) {
          const m = g.edgeTo[h]!;
          const ax = g.nodeX[n]!, ay = g.nodeY[n]!, bx = g.nodeX[m]!, by = g.nodeY[m]!;
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
          const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
          const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(px - x, py - y);
          if (d < bestD) { bestD = d; best = { half: h, from: n, to: m, t, x, y, offMetres: d }; }
        }
      }
    }
    if (best && bestD <= r * CELL_M) break;
  }
  return best;
}

// The node grid is built once per graph and kept beside it. It is only an index; it holds nothing new.
const nodeCellIndex = new WeakMap<StreetGraph, Map<number, number[]>>();
function nodeCellsFor(g: StreetGraph, into: Map<number, number[]>): boolean {
  const cached = nodeCellIndex.get(g);
  if (cached) { for (const [k, v] of cached) into.set(k, v); return into.size > 0; }
  const m = new Map<number, number[]>();
  for (let i = 0; i < g.nodeCount; i++) {
    const k = Math.floor(g.nodeX[i]! / CELL_M) * 100000 + Math.floor(g.nodeY[i]! / CELL_M);
    const l = m.get(k); if (l) l.push(i); else m.set(k, [i]);
  }
  nodeCellIndex.set(g, m);
  for (const [k, v] of m) into.set(k, v);
  return into.size > 0;
}
