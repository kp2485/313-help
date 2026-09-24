// Which streets a trip walks on (Kyle, 2026-09-24: the area widened to every city and township a DDOT or SMART
// bus stops in). Spec: schema/query-spec.md "The trip window".
//
// The street map is seven times the size it was, and a phone must not build a graph of three counties of streets
// to plan a walk to the corner. (It still downloads the one street file, as before: bytes are cheap, a graph of
// 150,000 nodes on an old phone is not.) A plan only ever WALKS in a few places: from where it starts to a stop,
// from a stop to where it ends, between two stops at a change, or the whole way when the two ends are close. Every
// one of those places is known from the two ends and the bus network alone, before a single street is read. So:
//
//   1. `tripWindow` names the boxes a plan can walk in;
//   2. `windowFiles` keeps every street whose own box touches one of them: the main roads first, then each cell of
//      map/streets.json in key order — the ONE order every client builds the graph in, so node numbering, and so
//      the answer, is the same on all three.
//
// A street is chosen by its OWN box, never by the cell it is filed in: a cell holds a street by its midpoint, and a
// suburban street TIGER merged into one long line can pass the front door with its midpoint two cells away.
//
// The boxes are a SUPERSET of where `plan` walks: including a cell that is never walked in costs a little time and
// changes no answer a person could see except by a detour longer than the padding. Nothing here touches the
// network, the clock or a person's location beyond the two points it is given, and nothing is kept: a window's
// graph is built for one plan and dropped with it, never cached (a cache of them would be a record of trips).

import { M_PER_DEG_LAT, M_PER_DEG_LON, STREET_SCALE, type PackedStreets } from './streets.js';
import { metresBetween } from './walk.js';
import { ACCESS_M, MAX_ACCESS_STOPS, MAX_WALK_ONLY_M, TRANSFER_WALK_M, stopsNear, type TransitNetwork } from './transit-plan.js';

/** Padding round each end of a trip. An access walk is at most ACCESS_M in a straight line; streets wander. */
export const END_PAD_M = ACCESS_M + 800;
/** Padding round a stop where a change may need a walk (at most TRANSFER_WALK_M in a straight line). */
export const TRANSFER_PAD_M = TRANSFER_WALK_M + 800;
/** Padding round the box between the two ends, when they are close enough to walk. */
export const WALK_PAD_M = 800;

/** A box in degrees. */
export interface GeoBox { lonMin: number; latMin: number; lonMax: number; latMax: number }

/** A point padded by `metres` on every side. */
export function boxAround(pt: { lat: number; lon: number }, metres: number): GeoBox {
  const dLat = metres / M_PER_DEG_LAT, dLon = metres / M_PER_DEG_LON;
  return { lonMin: pt.lon - dLon, latMin: pt.lat - dLat, lonMax: pt.lon + dLon, latMax: pt.lat + dLat };
}
const boxesTouch = (a: GeoBox, b: GeoBox) => a.lonMin <= b.lonMax && a.lonMax >= b.lonMin && a.latMin <= b.latMax && a.latMax >= b.latMin;

/**
 * The stops where a plan with one change may have to WALK between two stops: `x` on a route boarded near the start
 * and `y` within TRANSFER_WALK_M of it on a route that reaches a stop near the end. The same loops as `plan`'s
 * step 2, without the cap on candidates, so the answer is a superset of every change `plan` can make.
 */
export function transferStops(net: TransitNetwork, from: { lat: number; lon: number }, to: { lat: number; lon: number }, access = ACCESS_M): number[] {
  const originStops = stopsNear(net, from, access).slice(0, MAX_ACCESS_STOPS);
  const destStops = stopsNear(net, to, access).slice(0, MAX_ACCESS_STOPS);
  if (!originStops.length || !destStops.length) return [];
  const destAt = new Map<number, { pattern: number; at: number }[]>();
  for (const { stop } of destStops) for (const e of net.posOf.get(stop) ?? []) {
    const l = destAt.get(e.route); const v = { pattern: e.pattern, at: e.at };
    if (l) l.push(v); else destAt.set(e.route, [v]);
  }
  const out = new Set<number>();
  for (const { stop } of originStops) for (const b of net.posOf.get(stop) ?? []) {
    if (destAt.has(b.route)) continue;                                      // a direct ride; no change
    const p1 = net.routes[b.route]!.patterns[b.pattern]!;
    for (let at = b.at + 1; at < p1.length; at++) {
      const x = p1[at]!;
      for (const { stop: y } of stopsNear(net, net.stops[x]!, TRANSFER_WALK_M)) {
        if (x === y) continue;                                              // a change at the same stop: no walk
        const reaches = (net.posOf.get(y) ?? []).some((e) => e.route !== b.route
          && (destAt.get(e.route) ?? []).some((a) => a.pattern === e.pattern && a.at > e.at));
        if (reaches) { out.add(x); out.add(y); }
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

export interface TripWindow {
  /** Where the plan may walk: both ends, the walk between them if it is short enough, and each change. */
  boxes: GeoBox[];
}

/** Where a plan from `from` to `to` may walk. `net` may be null (walking only). */
export function tripWindow(net: TransitNetwork | null, from: { lat: number; lon: number }, to: { lat: number; lon: number }, opts: { accessMetres?: number; maxWalkOnlyMetres?: number } = {}): TripWindow {
  const boxes: GeoBox[] = [boxAround(from, END_PAD_M), boxAround(to, END_PAD_M)];
  if (metresBetween(from, to) <= (opts.maxWalkOnlyMetres ?? MAX_WALK_ONLY_M)) {
    const a = boxAround(from, WALK_PAD_M), b = boxAround(to, WALK_PAD_M);
    boxes.push({ lonMin: Math.min(a.lonMin, b.lonMin), latMin: Math.min(a.latMin, b.latMin), lonMax: Math.max(a.lonMax, b.lonMax), latMax: Math.max(a.latMax, b.latMax) });
  }
  if (net) for (const s of transferStops(net, from, to, opts.accessMetres ?? ACCESS_M)) boxes.push(boxAround(net.stops[s]!, TRANSFER_PAD_M));
  return { boxes };
}

/** The box of one packed line, decoded from its origin and deltas. */
function lineBox(enc: number[], origin: [number, number]): GeoBox {
  let x = 0, y = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < enc.length; i += 2) {
    if (i === 0) { x = enc[0]!; y = enc[1]!; } else { x += enc[i]!; y += enc[i + 1]!; }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { lonMin: origin[0] + x0 / STREET_SCALE, latMin: origin[1] + y0 / STREET_SCALE, lonMax: origin[0] + x1 / STREET_SCALE, latMax: origin[1] + y1 / STREET_SCALE };
}

/** One street file cut down to the streets whose own box touches one of `boxes`, in the file's own order. */
export function roadsInBoxes(base: PackedStreets, boxes: GeoBox[]): PackedStreets {
  const keep: number[] = [];
  base.roads.forEach((r, i) => { const b = lineBox(r[2], base.origin); if (boxes.some((q) => boxesTouch(b, q))) keep.push(i); });
  return {
    origin: base.origin, names: base.names, roads: keep.map((i) => base.roads[i]!),
    ...(base.safety ? { safety: keep.map((i) => base.safety![i] ?? 0) } : {}),
  };
}

/**
 * The files the walking graph is built from, in the one order: the main roads that touch the window, then each cell
 * of map/streets.json — `cells` in ascending key order, exactly the list every client already builds from — each
 * cut down to its streets that touch the window. A cell left with none is dropped.
 */
export function windowFiles(base: PackedStreets, cells: PackedStreets[], w: TripWindow): PackedStreets[] {
  const out = [roadsInBoxes(base, w.boxes)];
  for (const c of cells) { const kept = roadsInBoxes(c, w.boxes); if (kept.roads.length) out.push(kept); }
  return out;
}
