// Walking directions on the street graph. Spec: schema/query-spec.md "Walking directions".
//
// Everything is on the device. No origin, no destination and no query ever leaves the phone
// (DECISIONS 2026-09-22). The route is streets only: we have no sidewalk, curb-ramp or lighting data, so no
// client may call a route safe, accessible or lit — the words a client says are in strings/, and the rules
// here only hand it facts.
//
// We never route to the door. The route ends at the nearest point on a street and `endOffMetres` says how far
// the building still is, so a screen can say "then about 40 m to the building".

import {
  type EdgePoint, type StreetGraph, edgeGeometry, nearestEdgePoint, safetyAadt, safetyHighSeverity, safetyHin,
  safetyLanes, safetySpeed, sliceByFraction, toLonLat,
} from './streets.js';

/** A person walking, for the estimates. 1.33 m/s is 80 m per minute — the number the plan's cost model uses. */
export const WALK_M_PER_S = 1.33;
export const WALK_M_PER_MIN = 80;

/**
 * Safety penalties. The cost of an edge is `metres * (1 + penalty)`, with `penalty` capped, so a calmer street
 * wins whenever the detour is smaller than the penalty allows: a cap of 0.60 means we will walk up to 60% further
 * to stay off the City's High Injury Network. These are the City of Detroit's own markings, not our judgement
 * (docs/research/2026-09-22-offline-directions.md §2.5, rule 3).
 */
export const SAFETY_PENALTY = {
  hin: 0.35,                       // HIN_2021: on the City's High Injury Network
  high_severity: 0.20,             // HighSeverity
  lanes: [0, 0, 0.10, 0.20],       // unknown, 1-2, 3-4, 5+
  speed: [0, 0, 0.10, 0.25],       // unknown, <=25, 30-35, 40+
  aadt: [0, 0, 0.05, 0.15],        // unknown, <5k, 5k-20k, >20k
  cap: 0.60,
} as const;

/**
 * Used only when the street file carries no safety bytes (an older bundle, or an ingest the City refused).
 * Indexed by street class: 0 freeway (never walked), 1 main road, 2 arterial, 3 collector, 4 local street.
 */
export const CLASS_PENALTY = [0, 0.15, 0.10, 0.05, 0] as const;

/**
 * What a turn costs, in metres of walking. On Detroit's grid every route between two corners is the same
 * length, so with no turn penalty the tie is broken arbitrarily and a person is handed a staircase of fifteen
 * turns instead of three streets. It never changes the distance that is reported — only which of several
 * equally long routes is the one described.
 */
export const TURN_PENALTY_M = 40;

/** The penalty for one way of the graph. */
export function wayPenalty(g: StreetGraph, way: number): number {
  if (!g.hasSafety) return CLASS_PENALTY[Math.min(g.wayCls[way]!, 4)] ?? 0;
  const b = g.waySafety[way]!;
  const p = (safetyHin(b) ? SAFETY_PENALTY.hin : 0) + (safetyHighSeverity(b) ? SAFETY_PENALTY.high_severity : 0)
    + SAFETY_PENALTY.lanes[safetyLanes(b)]! + SAFETY_PENALTY.speed[safetySpeed(b)]! + SAFETY_PENALTY.aadt[safetyAadt(b)]!;
  return Math.min(p, SAFETY_PENALTY.cap);
}

export type Bearing = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
export type Turn = 'straight' | 'slight_left' | 'left' | 'sharp_left' | 'slight_right' | 'right' | 'sharp_right' | 'around';

const BEARINGS: Bearing[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** Compass word for a direction in metres. Eight winds, each 45 degrees wide, north first. */
export function bearingWord(dx: number, dy: number): Bearing {
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;           // 0 = north, clockwise
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return BEARINGS[i]!;
}

/** Turn word from the change of heading in degrees, signed: positive is to the right. */
export function turnWord(deltaDeg: number): Turn {
  const d = ((deltaDeg + 540) % 360) - 180;
  const a = Math.abs(d);
  if (a < 20) return 'straight';
  if (a > 160) return 'around';
  const right = d > 0;
  if (a < 45) return right ? 'slight_right' : 'slight_left';
  if (a <= 135) return right ? 'right' : 'left';
  return right ? 'sharp_right' : 'sharp_left';
}

/** One instruction. The client words it; these are facts. */
export interface WalkStep {
  /** The street's name as the City publishes it. Unnamed lines are never routed on, so this is never empty. */
  street: string;
  bearing: Bearing;
  /** How to get onto this street from the last one. `null` on the first step. */
  turn: Turn | null;
  metres: number;
}

export interface WalkRoute {
  metres: number;
  /** Straight-line metres between the two asked-for points, so a client can show how direct a route is. */
  straightMetres: number;
  /** At WALK_M_PER_S. An estimate, never a promise. */
  seconds: number;
  steps: WalkStep[];
  /** [lon, lat] vertices to draw, from the snapped start point to the snapped end point. */
  polyline: [number, number][];
  /** Metres from the asked-for start to the street, and from the street to the asked-for destination. */
  startOffMetres: number;
  endOffMetres: number;
  /** Nodes settled by A*. A number for tests, never a screen. */
  settled: number;
}

const heapPush = (k: Float64Array, v: Int32Array, n: number, key: number, val: number): number => {
  let i = n; k[i] = key; v[i] = val;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (k[p]! <= k[i]!) break;
    const tk = k[p]!, tv = v[p]!; k[p] = k[i]!; v[p] = v[i]!; k[i] = tk; v[i] = tv; i = p;
  }
  return n + 1;
};
const heapPop = (k: Float64Array, v: Int32Array, n: number): [number, number] => {
  const top = v[0]!; const m = n - 1;
  if (m > 0) {
    k[0] = k[m]!; v[0] = v[m]!;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let s = i;
      if (l < m && k[l]! < k[s]!) s = l;
      if (r < m && k[r]! < k[s]!) s = r;
      if (s === i) break;
      const tk = k[s]!, tv = v[s]!; k[s] = k[i]!; v[s] = v[i]!; k[i] = tk; v[i] = tv; i = s;
    }
  }
  return [top, m];
};

/**
 * A* from one point to another. Both points are snapped to the nearest edge, which is split for the search:
 * node ids `nodeCount` and `nodeCount + 1` are the virtual start and goal.
 *
 * Returns null when the two ends are in different pieces of the graph (0.5% of nodes are), or when either is
 * further than `maxSnapMetres` from any street.
 */
export function walkRoute(
  g: StreetGraph,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: { maxSnapMetres?: number } = {},
): WalkRoute | null {
  const a = nearestEdgePoint(g, from, opts.maxSnapMetres ?? 2000);
  const b = nearestEdgePoint(g, to, opts.maxSnapMetres ?? 2000);
  if (!a || !b) return null;
  return routeBetween(g, a, b, from, to);
}

/** The same search between two points already snapped to edges (the transit planner snaps stops once). */
export function routeBetween(
  g: StreetGraph, a: EdgePoint, b: EdgePoint,
  from?: { lat: number; lon: number }, to?: { lat: number; lon: number },
): WalkRoute | null {
  // The search is over HALF-EDGES, not nodes: a state is "walking along this edge in this direction", which is
  // what makes a turn cost something. On a grid every route between two corners is the same length, so without
  // a turn penalty the tie is broken arbitrarily and a person is handed a staircase of fifteen turns instead of
  // two streets. The penalty is small (TURN_PENALTY_M metres of walking) and never changes the reported
  // distance — it only decides which of several equally long routes a person is told to walk.
  const M = 2 * g.edgeCount, S = M, T = M + 1, total = M + 2;
  const aLen = g.edgeLen[a.half]!, bLen = g.edgeLen[b.half]!;
  const bTwin = g.twinHalf[b.half]!;
  /** The fraction of the goal edge already walked when arriving along half-edge `h`. */
  const goalRemaining = (h: number): number => (h === b.half ? b.t * bLen : (1 - b.t) * bLen);

  const dist = new Float64Array(total).fill(Infinity);
  const cost = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const hk = new Float64Array(total + 8), hv = new Int32Array(total + 8);
  let hn = 0, settled = 0;
  /** Straight line to the goal from where a state leaves you standing. Admissible: no cost is negative. */
  const h = (s: number) => {
    if (s === T) return 0;
    if (s === S) return Math.hypot(a.x - b.x, a.y - b.y);
    const n = g.edgeTo[s]!;
    return Math.hypot(g.nodeX[n]! - b.x, g.nodeY[n]! - b.y);
  };
  const push = (s: number, c: number, d: number, from_: number) => {
    if (c >= cost[s]!) return;
    cost[s] = c; dist[s] = d; prev[s] = from_;
    hn = heapPush(hk, hv, hn, c + h(s), s);
  };

  cost[S] = 0; dist[S] = 0;
  hn = heapPush(hk, hv, hn, h(S), S);
  const aFor = a.half, aBack = g.twinHalf[a.half]!;
  const aPen = 1 + wayPenalty(g, g.edgeWay[a.half]!);
  push(aFor, (1 - a.t) * aLen * aPen, (1 - a.t) * aLen, S);
  push(aBack, a.t * aLen * aPen, a.t * aLen, S);
  if (g.halfEdge[a.half]! === g.halfEdge[b.half]!) {
    const bt = b.half === a.half ? b.t : 1 - b.t;
    push(T, Math.abs(bt - a.t) * aLen * aPen, Math.abs(bt - a.t) * aLen, S);
  }

  while (hn > 0) {
    const [s, next] = heapPop(hk, hv, hn); hn = next;
    if (closed[s]) continue;
    closed[s] = 1; settled++;
    if (s === T) break;
    if (s === S) continue;
    const u = g.edgeTo[s]!, name = g.wayName[g.edgeWay[s]!] ?? '';
    for (let e = g.head[u]!; e < g.head[u + 1]!; e++) {
      if (e === g.twinHalf[s]!) continue;                      // no turning round in the middle of a street
      const turn = (g.wayName[g.edgeWay[e]!] ?? '') === name ? 0 : TURN_PENALTY_M;
      const pen = 1 + wayPenalty(g, g.edgeWay[e]!);
      if (e === b.half || e === bTwin) push(T, cost[s]! + turn + goalRemaining(e) * pen, dist[s]! + goalRemaining(e), s);
      push(e, cost[s]! + turn + g.edgeLen[e]! * pen, dist[s]! + g.edgeLen[e]!, s);
    }
  }
  if (!Number.isFinite(cost[T]!)) return null;

  // walk the path back, then turn it into steps and a polyline along the streets' real shape
  const path: number[] = [];
  for (let s: number = T; s !== -1; s = prev[s]!) path.push(s);
  path.reverse();                                              // S, half-edge, half-edge, …, T

  /**
   * What was walked in one step of the path: the vertices in travel order and the street's name.
   * The goal is reached part-way along an edge that is never itself a state, so `T` renders that partial edge.
   */
  const piece = (i: number): { geom: number[]; way: number } => {
    const s = path[i]!, before = path[i - 1]!;
    if (s === T) {
      if (before === S) {                                      // start and goal on one edge
        const bt = b.half === a.half ? b.t : 1 - b.t;
        return { geom: sliceByFraction(edgeGeometry(g, a.half), a.t, bt), way: g.edgeWay[a.half]! };
      }
      const u = g.edgeTo[before]!;
      const e = u === b.from ? b.half : bTwin;
      const ft = e === b.half ? b.t : 1 - b.t;
      return { geom: sliceByFraction(edgeGeometry(g, e), 0, ft), way: g.edgeWay[e]! };
    }
    const geom = edgeGeometry(g, s);
    return { geom: before === S ? sliceByFraction(geom, s === aFor ? a.t : 1 - a.t, 1) : geom, way: g.edgeWay[s]! };
  };

  const polyline: [number, number][] = [];
  const pushPt = (x: number, y: number) => {
    const p = toLonLat(x, y) as [number, number];
    const last = polyline[polyline.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) polyline.push(p);
  };
  const steps: WalkStep[] = [];
  let lastHeading: number | null = null;
  for (let i = 1; i < path.length; i++) {
    const metres = dist[path[i]!]! - dist[path[i - 1]!]!;
    const { geom, way } = piece(i);
    for (let k = 0; k + 1 < geom.length; k += 2) pushPt(geom[k]!, geom[k + 1]!);
    if (metres <= 0 || geom.length < 4) continue;
    const name = g.wayName[way] ?? '';
    const dx0 = geom[2]! - geom[0]!, dy0 = geom[3]! - geom[1]!;
    const n = geom.length;
    const heading0 = (Math.atan2(dx0, dy0) * 180) / Math.PI;
    const headingEnd = (Math.atan2(geom[n - 2]! - geom[n - 4]!, geom[n - 1]! - geom[n - 3]!) * 180) / Math.PI;
    const last = steps[steps.length - 1];
    if (last && last.street === name) last.metres += metres;
    else steps.push({ street: name, bearing: bearingWord(dx0, dy0), turn: lastHeading === null ? null : turnWord(heading0 - lastHeading), metres });
    lastHeading = headingEnd;
  }
  const startPt = from ?? { lon: polyline[0]![0], lat: polyline[0]![1] };
  const endPt = to ?? { lon: polyline[polyline.length - 1]![0], lat: polyline[polyline.length - 1]![1] };
  return {
    metres: dist[T]!, straightMetres: metresBetween(startPt, endPt), seconds: dist[T]! / WALK_M_PER_S,
    steps, polyline, startOffMetres: a.offMetres, endOffMetres: b.offMetres, settled,
  };
}

function toLonLatDelta(p: { lat: number; lon: number }, q: { lat: number; lon: number }): [number, number] {
  return [(q.lon - p.lon) * (111320 * Math.cos((42.35 * Math.PI) / 180)), (q.lat - p.lat) * 111132];
}

/** Straight-line metres between two points, at the one reference latitude every client uses. */
export function metresBetween(p: { lat: number; lon: number }, q: { lat: number; lon: number }): number {
  const [dx, dy] = toLonLatDelta(p, q);
  return Math.hypot(dx, dy);
}
