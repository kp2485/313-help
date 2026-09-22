// One integrated trip plan: walk, or walk-ride-walk, or walk-ride-walk-ride-walk.
// Spec: schema/query-spec.md "Trip plans". Study: docs/research/2026-09-22-offline-directions.md §1.3, §2.
//
// Kyle, 2026-09-22: "I want integrated walking and bus routes for the best user experience." So there is one
// entry point, `plan()`, and walking on its own is simply one of the candidates it ranks. Every walking leg,
// including the walk to the stop and the walk between two stops at a change, is a real A* walk on the street
// graph, so the distance and the drawn line are the streets a person actually walks.
//
// WE HAVE NO TIMETABLE AND WILL NOT PRETEND TO. No departure time, no arrival time, no live position, ever.
// A route's published headway ("about every 45 minutes on a weekday", DDOT only) is the one time-like fact we
// carry, and it enters the estimate as half a headway of waiting. The estimate leaves as a RANGE.

import { type StreetGraph, type EdgePoint, nearestEdgePoint } from './streets.js';
import { WALK_M_PER_MIN, type WalkStep, metresBetween, routeBetween, walkRoute } from './walk.js';

// ---- the cost model (constants, so three clients can agree) ----------------------------------
/** Metres a person walks in a minute. The same number walk.ts uses (1.33 m/s). */
export { WALK_M_PER_MIN };
/** An average city bus, stops included: 280 m/min is about 17 km/h. It is an average, never a schedule. */
export const BUS_M_PER_MIN = 280;
/** Waiting is taken as half the published headway. */
export const WAIT_FRACTION_OF_HEADWAY = 0.5;
/** When a route publishes no headway (SMART, QLINE, the People Mover) this is the assumed wait. */
export const DEFAULT_WAIT_MIN = 15;
/** The cost of changing vehicle at all, on top of the wait and the walk. */
export const CHANGE_PENALTY_MIN = 5;
/** At most one change. Distance-only planning over-transfers; a plan with three changes and no times is a maze. */
export const MAX_CHANGES = 1;
/** A stop is "at" a place when it is this close in a straight line; the walk to it is then routed properly. */
export const ACCESS_M = 400;
/** How many access stops we consider at each end. */
export const MAX_ACCESS_STOPS = 8;
/** A change on foot may be this long. */
export const TRANSFER_WALK_M = 150;
/** Walking on its own is always offered up to here (3 miles). */
export const MAX_WALK_ONLY_M = 4828;
/** How many itineraries come back. */
export const MAX_PLANS = 3;

// ---- the network -----------------------------------------------------------------------------

const SCALE = 1e5;

/** `map/transit/<id>.json` — the stops layer, exactly as the bundle carries it. */
export interface PackedPoints { origin: [number, number]; names: string[]; points: [number, number, number][] }
/** `<stops id>.net.json`, or the same two keys folded into a rail routes file. */
export interface PackedServes { route_ids: string[]; serves: number[][] }
/** `<routes id>.net.json`. */
export interface PackedRoutes {
  origin: [number, number]; names: string[]; lines: [number, number[]][];
  agency?: string; system?: string;
  routes: { id: string; short?: string; long?: string; headway?: number; frequent?: boolean; lines?: number[]; stops?: number[][] }[];
  route_ids?: string[]; serves?: number[][];
}

export interface TransitLayer { stops: PackedPoints; routes: PackedRoutes; serves?: PackedServes }

export interface TransitStop { name: string; lat: number; lon: number; layer: number; routes: number[] }
export interface TransitRoute {
  id: string; short: string; long: string; agency: string; system: string;
  /** The agency's own published headway in minutes, or null. Never inferred, never a timetable. */
  headway: number | null;
  frequent: boolean;
  /** One list of global stop indices per direction, in the owner's travel order. */
  patterns: number[][];
  /** The drawn route lines, [lon, lat]. */
  lines: [number, number][][];
}

export interface TransitNetwork {
  stops: TransitStop[];
  routes: TransitRoute[];
  /** stop index -> position in each pattern: `where.get(route * 1e6 + stop)` is not used; see `posOf`. */
  posOf: Map<number, { route: number; pattern: number; at: number }[]>;
  cells: Map<number, number[]>;
}

const CELL_DEG = 0.005;                         // about 400 m of latitude; the stop index's bucket
const cellKey = (lon: number, lat: number) => Math.floor(lon / CELL_DEG) * 100000 + Math.floor(lat / CELL_DEG);

function decodeLine(enc: number[], origin: [number, number]): [number, number][] {
  const out: [number, number][] = []; let x = 0, y = 0;
  for (let i = 0; i + 1 < enc.length; i += 2) {
    if (i === 0) { x = enc[0]!; y = enc[1]!; } else { x += enc[i]!; y += enc[i + 1]!; }
    out.push([origin[0] + x / SCALE, origin[1] + y / SCALE]);
  }
  return out;
}

/** Build one network out of every transit layer the client holds. Stop and route numbers are global. */
export function buildTransitNetwork(layers: TransitLayer[]): TransitNetwork {
  const stops: TransitStop[] = [], routes: TransitRoute[] = [];
  const posOf = new Map<number, { route: number; pattern: number; at: number }[]>();
  layers.forEach((layer, li) => {
    const stopBase = stops.length, routeBase = routes.length;
    const o = layer.stops.origin;
    for (const [nameIdx, x, y] of layer.stops.points) {
      stops.push({ name: nameIdx >= 0 ? (layer.stops.names[nameIdx] ?? '') : '', lon: o[0] + x / SCALE, lat: o[1] + y / SCALE, layer: li, routes: [] });
    }
    const agency = layer.routes.agency ?? '', system = layer.routes.system ?? '';
    for (const r of layer.routes.routes) {
      routes.push({
        id: r.id, short: r.short ?? '', long: r.long ?? '', agency, system,
        headway: typeof r.headway === 'number' && r.headway > 0 ? r.headway : null,
        frequent: r.frequent === true,
        patterns: (r.stops ?? []).map((p) => p.map((s) => stopBase + s)),
        lines: (r.lines ?? []).map((i) => decodeLine(layer.routes.lines[i]?.[1] ?? [], layer.routes.origin)),
      });
    }
    const serves = layer.serves?.serves ?? layer.routes.serves ?? [];
    const routeIds = layer.serves?.route_ids ?? layer.routes.route_ids ?? layer.routes.routes.map((r) => r.id);
    serves.forEach((list, i) => {
      const stop = stops[stopBase + i]; if (!stop) return;
      for (const ri of list) {
        const id = routeIds[ri];
        const at = id ? routes.findIndex((x, k) => k >= routeBase && x.id === id) : routeBase + ri;
        if (at >= 0) stop.routes.push(at);
      }
    });
  });
  // a stop can also learn its routes from the patterns alone (rail files carry no `serves`)
  routes.forEach((r, ri) => r.patterns.forEach((p, pi) => p.forEach((s, at) => {
    const stop = stops[s]; if (!stop) return;
    if (!stop.routes.includes(ri)) stop.routes.push(ri);
    const l = posOf.get(s); const e = { route: ri, pattern: pi, at };
    if (l) l.push(e); else posOf.set(s, [e]);
  })));
  const cells = new Map<number, number[]>();
  stops.forEach((s, i) => { const k = cellKey(s.lon, s.lat); const l = cells.get(k); if (l) l.push(i); else cells.set(k, [i]); });
  return { stops, routes, posOf, cells };
}

/** Stops within `metres` of a point, nearest first. Straight-line; the walk to them is routed afterwards. */
export function stopsNear(net: TransitNetwork, pt: { lat: number; lon: number }, metres = ACCESS_M): { stop: number; metres: number }[] {
  const r = Math.ceil(metres / (CELL_DEG * 111132)) + 1;
  const cx = Math.floor(pt.lon / CELL_DEG), cy = Math.floor(pt.lat / CELL_DEG);
  const out: { stop: number; metres: number }[] = [];
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
    const l = net.cells.get((cx + a) * 100000 + (cy + b)); if (!l) continue;
    for (const i of l) {
      const d = metresBetween(pt, net.stops[i]!);
      if (d <= metres) out.push({ stop: i, metres: d });
    }
  }
  return out.sort((x, y) => x.metres - y.metres || x.stop - y.stop);
}

// ---- what a plan looks like -------------------------------------------------------------------

export interface WalkLeg {
  kind: 'walk';
  metres: number;
  minutes: number;
  steps: WalkStep[];
  polyline: [number, number][];
  /** Set when this leg ends at, or starts from, a stop. */
  to_stop?: { index: number; name: string };
  from_stop?: { index: number; name: string };
}

export interface RideLeg {
  kind: 'ride';
  route_id: string;
  route_short: string;
  route_long: string;
  agency: string;
  /** Minutes between buses as the agency publishes it, or null. A client may only say "about every N minutes
   *  on a weekday" when this is a number, and must never turn it into a departure time. */
  headway_minutes: number | null;
  from_stop: { index: number; name: string };
  to_stop: { index: number; name: string };
  /** Stops ridden, counting the one you get off at. */
  stops: number;
  metres: number;
  minutes: number;
  /** The wait this plan assumed: half the headway, or DEFAULT_WAIT_MIN. An assumption, not a schedule. */
  wait_minutes: number;
  polyline: [number, number][];
}

export type PlanLeg = WalkLeg | RideLeg;

export interface Itinerary {
  legs: PlanLeg[];
  changes: number;
  walk_metres: number;
  ride_metres: number;
  /** The whole estimate in minutes, walking + riding + waiting + change penalty. Never shown as one number. */
  minutes: number;
  /** What a screen shows: "about 25 to 40 minutes". Always a range. */
  range: [number, number];
  /** Metres from the asked-for start to the first street, and from the last street to the destination. */
  start_off_metres: number;
  end_off_metres: number;
}

/** The range a client says. Rounded to 5 minutes, at least 5 minutes wide, never a single number. */
export function minutesRange(minutes: number): [number, number] {
  const lo = Math.max(5, Math.floor((minutes * 0.85) / 5) * 5);
  let hi = Math.ceil((minutes * 1.25) / 5) * 5;
  if (hi - lo < 5) hi = lo + 5;
  return [lo, hi];
}

const waitFor = (r: TransitRoute) => (r.headway ? r.headway * WAIT_FRACTION_OF_HEADWAY : DEFAULT_WAIT_MIN);

/** Ride distance along a pattern, stop to stop. */
function rideMetres(net: TransitNetwork, pattern: number[], from: number, to: number): number {
  let m = 0;
  for (let i = from; i < to; i++) m += metresBetween(net.stops[pattern[i]!]!, net.stops[pattern[i + 1]!]!);
  return m;
}

/** The route's own drawn line between two stops, or the stops themselves when no line fits. */
function ridePolyline(net: TransitNetwork, route: TransitRoute, pattern: number[], from: number, to: number): [number, number][] {
  const a = net.stops[pattern[from]!]!, b = net.stops[pattern[to]!]!;
  let best: { line: [number, number][]; i: number; j: number; d: number } | null = null;
  for (const line of route.lines) {
    if (line.length < 2) continue;
    let bi = 0, bj = 0, di = Infinity, dj = Infinity;
    line.forEach((p, k) => {
      const pa = metresBetween(a, { lon: p[0], lat: p[1] }), pb = metresBetween(b, { lon: p[0], lat: p[1] });
      if (pa < di) { di = pa; bi = k; }
      if (pb < dj) { dj = pb; bj = k; }
    });
    if (bi === bj) continue;
    if (!best || di + dj < best.d) best = { line, i: bi, j: bj, d: di + dj };
  }
  if (best && best.d < 200) {
    const [i, j] = best.i < best.j ? [best.i, best.j] : [best.j, best.i];
    const slice = best.line.slice(i, j + 1);
    if (best.i > best.j) slice.reverse();
    return [[a.lon, a.lat], ...slice, [b.lon, b.lat]];
  }
  return pattern.slice(from, to + 1).map((s) => [net.stops[s]!.lon, net.stops[s]!.lat] as [number, number]);
}

const stopRef = (net: TransitNetwork, i: number) => ({ index: i, name: net.stops[i]!.name });

function walkLeg(r: { metres: number; steps: WalkStep[]; polyline: [number, number][] }, ends: { to_stop?: { index: number; name: string }; from_stop?: { index: number; name: string } } = {}): WalkLeg {
  return { kind: 'walk', metres: r.metres, minutes: r.metres / WALK_M_PER_MIN, steps: r.steps, polyline: r.polyline, ...ends };
}

function finish(legs: PlanLeg[], startOff: number, endOff: number): Itinerary {
  let walk = 0, ride = 0, minutes = 0, changes = -1;
  for (const l of legs) {
    if (l.kind === 'walk') { walk += l.metres; minutes += l.minutes; }
    else { ride += l.metres; minutes += l.minutes + l.wait_minutes; changes++; }
  }
  if (changes < 0) changes = 0;
  minutes += changes * CHANGE_PENALTY_MIN;
  return { legs, changes, walk_metres: walk, ride_metres: ride, minutes, range: minutesRange(minutes), start_off_metres: startOff, end_off_metres: endOff };
}

/**
 * Rank: the estimate in minutes, then fewer changes, then less walking, then fewer ride stops, then the first
 * route's id — so one bundle always answers the same way.
 */
function better(a: Itinerary, b: Itinerary): number {
  const rideStops = (x: Itinerary) => x.legs.reduce((t, l) => t + (l.kind === 'ride' ? l.stops : 0), 0);
  const firstRoute = (x: Itinerary) => x.legs.find((l): l is RideLeg => l.kind === 'ride')?.route_id ?? '';
  return a.minutes - b.minutes || a.changes - b.changes || a.walk_metres - b.walk_metres
    || rideStops(a) - rideStops(b) || firstRoute(a).localeCompare(firstRoute(b));
}

export interface PlanOptions {
  /** Straight-line radius for access stops (default ACCESS_M). */
  accessMetres?: number;
  /** Longest walk-only trip still offered (default MAX_WALK_ONLY_M). */
  maxWalkOnlyMetres?: number;
  /** How many itineraries (default MAX_PLANS). */
  limit?: number;
}

/**
 * The whole answer to "how do I get there": ranked itineraries of walking and riding legs.
 *
 * Pure walking is always one of the candidates when it is under `maxWalkOnlyMetres`, and it is ranked by the
 * same cost model as the bus plans — so "walk, it is four blocks" wins on its own merits, and a bus only wins
 * when it really is faster given an honest wait.
 *
 * Returns [] when nothing works: nothing within walking distance, no route between the two ends within one
 * change, and the two ends in different pieces of the street graph. A client says so; it never invents a leg.
 */
export function plan(
  g: StreetGraph,
  net: TransitNetwork,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  opts: PlanOptions = {},
): Itinerary[] {
  const access = opts.accessMetres ?? ACCESS_M;
  const out: Itinerary[] = [];
  const pending = new Map<RideLeg, { route: number; pattern: number; from: number; to: number }>();

  // 0. walking on its own
  const direct = walkRoute(g, from, to);
  if (direct && direct.metres <= (opts.maxWalkOnlyMetres ?? MAX_WALK_ONLY_M)) {
    out.push(finish([walkLeg(direct)], direct.startOffMetres, direct.endOffMetres));
  }

  const originStops = stopsNear(net, from, access).slice(0, MAX_ACCESS_STOPS);
  const destStops = stopsNear(net, to, access).slice(0, MAX_ACCESS_STOPS);
  if (originStops.length && destStops.length) {
    const fromSnap = nearestEdgePoint(g, from), toSnap = nearestEdgePoint(g, to);
    const snaps = new Map<number, EdgePoint | null>();
    const snapStop = (i: number) => {
      if (!snaps.has(i)) snaps.set(i, nearestEdgePoint(g, net.stops[i]!));
      return snaps.get(i)!;
    };
    const accessWalk = new Map<number, ReturnType<typeof routeBetween>>();
    const walkTo = (i: number) => {
      if (!accessWalk.has(i)) {
        const s = snapStop(i);
        accessWalk.set(i, fromSnap && s ? routeBetween(g, fromSnap, s, from, net.stops[i]!) : null);
      }
      return accessWalk.get(i)!;
    };
    const egressWalk = new Map<number, ReturnType<typeof routeBetween>>();
    const walkFrom = (i: number) => {
      if (!egressWalk.has(i)) {
        const s = snapStop(i);
        egressWalk.set(i, s && toSnap ? routeBetween(g, s, toSnap, net.stops[i]!, to) : null);
      }
      return egressWalk.get(i)!;
    };

    const originAt = new Map<number, { stop: number; pattern: number; at: number }[]>();   // route -> boardable
    for (const { stop } of originStops) for (const e of net.posOf.get(stop) ?? []) {
      const l = originAt.get(e.route); const v = { stop, pattern: e.pattern, at: e.at };
      if (l) l.push(v); else originAt.set(e.route, [v]);
    }
    const destAt = new Map<number, { stop: number; pattern: number; at: number }[]>();     // route -> alightable
    for (const { stop } of destStops) for (const e of net.posOf.get(stop) ?? []) {
      const l = destAt.get(e.route); const v = { stop, pattern: e.pattern, at: e.at };
      if (l) l.push(v); else destAt.set(e.route, [v]);
    }

    // The drawn line of a ride costs a pass over the route's vertices, so it is filled in at the end, for the
    // few itineraries that are actually returned.
    const rideLeg = (ri: number, pattern: number, from_: number, to_: number): RideLeg | null => {
      const r = net.routes[ri]!, p = r.patterns[pattern]!;
      if (!(to_ > from_)) return null;
      const m = rideMetres(net, p, from_, to_);
      const leg: RideLeg = {
        kind: 'ride', route_id: r.id, route_short: r.short, route_long: r.long, agency: r.agency,
        headway_minutes: r.headway, from_stop: stopRef(net, p[from_]!), to_stop: stopRef(net, p[to_]!),
        stops: to_ - from_, metres: m, minutes: m / BUS_M_PER_MIN, wait_minutes: waitFor(r),
        polyline: [],
      };
      pending.set(leg, { route: ri, pattern, from: from_, to: to_ });
      return leg;
    };

    // 1. direct rides
    for (const [ri, boards] of originAt) {
      const alights = destAt.get(ri); if (!alights) continue;
      for (const b of boards) for (const a of alights) {
        if (a.pattern !== b.pattern || a.at <= b.at) continue;
        const w1 = walkTo(b.stop), w2 = walkFrom(a.stop);
        const leg = rideLeg(ri, b.pattern, b.at, a.at);
        if (!w1 || !w2 || !leg) continue;
        out.push(finish(
          [walkLeg(w1, { to_stop: stopRef(net, b.stop) }), leg, walkLeg(w2, { from_stop: stopRef(net, a.stop) })],
          w1.startOffMetres, w2.endOffMetres,
        ));
      }
    }

    // 2. one change: ride, then a change at the same stop or a walk of at most TRANSFER_WALK_M
    if (MAX_CHANGES >= 1) {
      const transferWalk = new Map<string, ReturnType<typeof routeBetween>>();
      const walkBetween = (i: number, j: number) => {
        const k = `${i}:${j}`;
        if (!transferWalk.has(k)) {
          const a = snapStop(i), b = snapStop(j);
          transferWalk.set(k, a && b ? routeBetween(g, a, b, net.stops[i]!, net.stops[j]!) : null);
        }
        return transferWalk.get(k)!;
      };
      // A bound on the work, not on the answer: the ranking only ever keeps a handful, and every candidate
      // past this many is a worse version of one already found.
      const CANDIDATE_CAP = 400;
      for (const [r1, boards] of originAt) {
        if (destAt.has(r1)) continue;                       // a direct ride already covers this route
        if (out.length > CANDIDATE_CAP) break;
        for (const b of boards) {
          const p1 = net.routes[r1]!.patterns[b.pattern]!;
          for (let at = b.at + 1; at < p1.length; at++) {
            const x = p1[at]!;
            for (const { stop: y, metres: gap } of stopsNear(net, net.stops[x]!, TRANSFER_WALK_M)) {
              for (const e of net.posOf.get(y) ?? []) {
                if (e.route === r1) continue;
                const alights = destAt.get(e.route); if (!alights) continue;
                for (const a of alights) {
                  if (a.pattern !== e.pattern || a.at <= e.at) continue;
                  const w1 = walkTo(b.stop), w3 = walkFrom(a.stop);
                  const leg1 = rideLeg(r1, b.pattern, b.at, at), leg2 = rideLeg(e.route, e.pattern, e.at, a.at);
                  if (!w1 || !w3 || !leg1 || !leg2) continue;
                  const mid: PlanLeg[] = [];
                  if (x !== y) {
                    const w2 = gap < 1 ? null : walkBetween(x, y);
                    if (!w2) continue;
                    mid.push(walkLeg(w2, { from_stop: stopRef(net, x), to_stop: stopRef(net, y) }));
                  }
                  out.push(finish(
                    [walkLeg(w1, { to_stop: stopRef(net, b.stop) }), leg1, ...mid, leg2, walkLeg(w3, { from_stop: stopRef(net, a.stop) })],
                    w1.startOffMetres, w3.endOffMetres,
                  ));
                }
              }
            }
          }
        }
      }
    }
  }

  // one itinerary per shape: the same sequence of routes never comes back twice
  const seen = new Set<string>();
  const ranked: Itinerary[] = [];
  for (const it of out.sort(better)) {
    const key = it.legs.filter((l): l is RideLeg => l.kind === 'ride').map((l) => l.route_id).join('>') || 'walk';
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push(it);
    if (ranked.length >= (opts.limit ?? MAX_PLANS)) break;
  }
  for (const it of ranked) for (const l of it.legs) {
    if (l.kind !== 'ride') continue;
    const p = pending.get(l);
    if (p) l.polyline = ridePolyline(net, net.routes[p.route]!, net.routes[p.route]!.patterns[p.pattern]!, p.from, p.to);
  }
  return ranked;
}
