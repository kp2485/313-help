// "Type a cross street" — resolved ON THIS DEVICE, from the street geometry the signed bundle already carries
// (Kyle, 2026-09-22; DECISIONS: the map opens on the person's location, then on an intersection they type, then
// on City Hall).
//
// Why this file exists at all. A person who will not — or cannot — share a location still has to be able to say
// where they are, and the only honest way to let them is to take the two street names in their head and turn
// them into a point without asking anybody else. Every line below runs in the browser, over `map/base.json` and
// `map/streets.json`, which are already on the phone. **Nothing is sent, and the typed text is never stored**:
// it lives in one variable in main.ts for as long as the screen is open, exactly like the search box, and it
// never reaches the URL, the history, IndexedDB or a report (docs/08).
//
// It is a module of its own, with no import of storage, the network or the router, so the iPhone and Android
// apps can be held to the same answers case for case (the table in apps/web/test/behaviour.test.ts).

import { ilat, ilon, wx, wy, type BaseMap } from './map.js';

export interface Pt { lat: number; lon: number }
/** One named piece of street geometry, in the map's own world coordinates (map.ts `wx`/`wy`). */
export interface NamedLine { name: string; pts: Float32Array }

// ---- names ---------------------------------------------------------------------------------------------------
// The City writes "Woodward Ave", "E Warren Ave", "W 7 Mile Rd"; a person types "woodward", "Warren", "seven
// mile". Both sides go through `normStreet`, which throws away everything that is not the name itself.

/** Street-type words, long and short. A name is the same name with or without one on the end. */
const SUFFIXES = new Set([
  'ave', 'avenue', 'st', 'street', 'rd', 'road', 'blvd', 'boulevard', 'dr', 'drive', 'hwy', 'highway',
  'ln', 'lane', 'ct', 'court', 'pkwy', 'parkway', 'ter', 'terrace', 'pl', 'place', 'cir', 'circle', 'way', 'trl', 'trail',
]);
/** "E", "West", "N.", "southbound" — the side of town, not the name. Kept as one letter so "E Warren" and
 *  "East Warren" are one street, and dropped when the other side has no direction at all. */
const DIRECTIONS: Record<string, string> = {
  e: 'e', east: 'e', w: 'w', west: 'w', n: 'n', north: 'n', s: 's', south: 's',
  ne: 'ne', northeast: 'ne', nw: 'nw', northwest: 'nw', se: 'se', southeast: 'se', sw: 'sw', southwest: 'sw',
};
/** "Seven Mile" is "7 Mile" on every sign in the city, and a person may type either. */
const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
};

/**
 * A street name as this file compares them: lower case, no accents, no punctuation, number words as digits, no
 * street-type word on the end, and any leading direction kept as a single letter in `dir`.
 *
 * The direction is kept apart rather than thrown away, because Detroit really does have an East Warren and a
 * West Warren and they are different halves of one street: a person who types the half they mean should get it,
 * and a person who types neither should get both (`nameMatches`).
 */
export function normStreet(raw: string): { name: string; dir: string } {
  const flat = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let words = flat.split(' ').filter(Boolean).map((w) => NUMBER_WORDS[w] ?? w);
  let dir = '';
  if (words.length > 1 && DIRECTIONS[words[0]!]) { dir = DIRECTIONS[words[0]!]!; words = words.slice(1); }
  // A street-type word only ever comes off the END, and never when it is the whole name ("Way", "Circle").
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1]!)) words.pop();
  // "Service Drive" is a kind of road, not Woodward: "M-1 Service Drive" keeps its own name.
  return { name: words.join(' '), dir };
}

/** Two names are the same street when the names match and neither side contradicts the other's direction. */
export function nameMatches(typed: { name: string; dir: string }, known: { name: string; dir: string }): boolean {
  if (typed.name !== known.name) return false;
  return !typed.dir || !known.dir || typed.dir === known.dir;
}

// ---- what a person typed ---------------------------------------------------------------------------------------

/** The separators between two street names, in the words people actually use. */
const SPLIT = /\s+(?:and|at|&|@|x)\s+|\s*[/+]\s*|\s+&\s+/i;

/**
 * "Woodward and Warren", "Woodward & Warren", "Warren at Woodward", "Woodward/Warren" — or one street name on
 * its own. Returns the pieces exactly as typed; `normStreet` is what makes them comparable.
 */
export function parseCrossing(text: string): { a: string; b: string } | null {
  const clean = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const parts = clean.split(SPLIT).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { a: parts[0]!, b: '' };
  return { a: parts[0]!, b: parts[1]! };
}

// ---- the streets on this phone -----------------------------------------------------------------------------------

/** Every named piece of street geometry in the basemap: the city-wide roads, and the ones in the grid cells. */
export function namedLines(map: BaseMap): NamedLine[] {
  const out: NamedLine[] = [];
  for (const r of map.roads) if (r.name) out.push({ name: r.name, pts: r.pts });
  for (const cell of map.cells) for (const r of cell.roads) if (r.name) out.push({ name: r.name, pts: r.pts });
  return out;
}

/** Name -> every piece of that street. Built once per basemap: 205 neighbourhoods' worth of streets on a cheap
 *  phone is a few thousand short arrays, and a person may type several guesses in a row. */
const indexes = new WeakMap<BaseMap, Map<string, { dir: string; lines: NamedLine[] }[]>>();
export function streetIndex(map: BaseMap): Map<string, { dir: string; lines: NamedLine[] }[]> {
  const held = indexes.get(map);
  if (held) return held;
  const byName = new Map<string, { dir: string; lines: NamedLine[] }[]>();
  for (const l of namedLines(map)) {
    const n = normStreet(l.name);
    if (!n.name) continue;
    const bucket = byName.get(n.name) ?? [];
    const slot = bucket.find((b) => b.dir === n.dir) ?? (bucket.push({ dir: n.dir, lines: [] }), bucket[bucket.length - 1]!);
    slot.lines.push(l);
    byName.set(n.name, bucket);
  }
  indexes.set(map, byName);
  return byName;
}

/** Every piece of the street a person means, or an empty list. */
export function linesFor(index: Map<string, { dir: string; lines: NamedLine[] }[]>, typed: string): NamedLine[] {
  const n = normStreet(typed);
  if (!n.name) return [];
  const bucket = index.get(n.name);
  if (!bucket) return [];
  return bucket.filter((b) => nameMatches(n, { name: n.name, dir: b.dir })).flatMap((b) => b.lines);
}

// ---- where two streets cross -----------------------------------------------------------------------------------

const boxOf = (pts: Float32Array): [number, number, number, number] => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { a = Math.min(a, pts[i]!); c = Math.max(c, pts[i]!); b = Math.min(b, pts[i + 1]!); d = Math.max(d, pts[i + 1]!); }
  return [a, b, c, d];
};
const overlap = (p: [number, number, number, number], q: [number, number, number, number], pad: number) =>
  p[0] - pad <= q[2] && p[2] + pad >= q[0] && p[1] - pad <= q[3] && p[3] + pad >= q[1];

/** Where two straight pieces cross, or null. Plain segment intersection: no touching-at-a-shared-end special
 *  case, because two City road records that share an end really do meet there. */
export function segmentCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): { x: number; y: number } | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (!den) return null;                                      // parallel, or a piece of no length
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rx, y: ay + t * ry };
}

/** One degree of latitude, in metres: what the world coordinates of map.ts are one unit of. */
const M_PER_UNIT = 111320;
/** Two crossings closer together than this are the same junction drawn twice (a boulevard's two carriageways,
 *  a record split at a city line). 120 m is wider than any Detroit intersection and narrower than a block. */
export const SAME_JUNCTION_M = 120;

/** Every place two streets cross, nearest-to-furthest apart, already merged. World coordinates in, lat/lon out. */
export function crossingsOf(a: readonly NamedLine[], b: readonly NamedLine[]): Pt[] {
  const pad = SAME_JUNCTION_M / M_PER_UNIT;
  const hits: { x: number; y: number }[] = [];
  const boxesB = b.map((l) => boxOf(l.pts));
  for (const la of a) {
    const ba = boxOf(la.pts);
    for (let j = 0; j < b.length; j++) {
      if (!overlap(ba, boxesB[j]!, pad)) continue;
      const lb = b[j]!;
      for (let i = 0; i + 3 < la.pts.length; i += 2) for (let k = 0; k + 3 < lb.pts.length; k += 2) {
        const p = segmentCross(la.pts[i]!, la.pts[i + 1]!, la.pts[i + 2]!, la.pts[i + 3]!, lb.pts[k]!, lb.pts[k + 1]!, lb.pts[k + 2]!, lb.pts[k + 3]!);
        if (p) hits.push(p);
      }
    }
  }
  // Merge: a junction is one answer however many road records meet in it.
  const merged: { x: number; y: number }[] = [];
  for (const p of hits) if (!merged.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < pad)) merged.push(p);
  // North to south, then west to east: the same bundle always offers the same list in the same order.
  merged.sort((p, q) => p.y - q.y || p.x - q.x);
  return merged.map((p) => ({ lat: ilat(p.y), lon: ilon(p.x) }));
}

/** The middle of the longest piece of one street: an honest answer to one name, and the screen says so. */
export function midpointOf(lines: readonly NamedLine[]): Pt | null {
  let best: { len: number; x: number; y: number } | null = null;
  for (const l of lines) {
    let len = 0;
    for (let i = 0; i + 3 < l.pts.length; i += 2) len += Math.hypot(l.pts[i + 2]! - l.pts[i]!, l.pts[i + 3]! - l.pts[i + 1]!);
    if (best && len <= best.len) continue;
    // Halfway ALONG the street, not the middle of its box: a street that bends would otherwise be answered with
    // a point that is not on it.
    let run = 0, x = l.pts[0]!, y = l.pts[1]!;
    for (let i = 0; i + 3 < l.pts.length; i += 2) {
      const d = Math.hypot(l.pts[i + 2]! - l.pts[i]!, l.pts[i + 3]! - l.pts[i + 1]!);
      if (run + d >= len / 2) { const f = d ? (len / 2 - run) / d : 0; x = l.pts[i]! + (l.pts[i + 2]! - l.pts[i]!) * f; y = l.pts[i + 1]! + (l.pts[i + 3]! - l.pts[i + 1]!) * f; break; }
      run += d; x = l.pts[i + 2]!; y = l.pts[i + 3]!;
    }
    best = { len, x, y };
  }
  return best ? { lat: ilat(best.y), lon: ilon(best.x) } : null;
}

/** Which end of the street one of several crossings is at: "Woodward & 7 Mile — north / south". The axis is
 *  whichever way the answers are actually spread, so two crossings of an east-west pair read east and west. */
export function whereWords(points: readonly Pt[]): string[] {
  if (points.length < 2) return points.map(() => '');
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const spanLat = Math.max(...lats) - Math.min(...lats), spanLon = (Math.max(...lons) - Math.min(...lons)) * 0.74;
  const mid = spanLat >= spanLon
    ? (Math.max(...lats) + Math.min(...lats)) / 2
    : (Math.max(...lons) + Math.min(...lons)) / 2;
  return points.map((p) => (spanLat >= spanLon ? (p.lat >= mid ? 'north' : 'south') : (p.lon >= mid ? 'east' : 'west')));
}

export type CrossOutcome =
  /** One junction: the map goes there. */
  | { kind: 'point'; point: Pt; a: string; b: string }
  /** Two streets that cross more than once: a short list to pick from, each with the end it is at. */
  | { kind: 'choices'; a: string; b: string; choices: { point: Pt; where: string }[] }
  /** One street name: the middle of it, and a note saying that is what this is. */
  | { kind: 'street'; point: Pt; a: string }
  /** Two streets we know that never meet. */
  | { kind: 'no_crossing'; a: string; b: string }
  /** A name the bundle's streets do not carry. `unknown` names the first one we could not find. */
  | { kind: 'unknown'; unknown: string };

/** At most this many choices are offered: a street pair with more crossings than this is a service drive, and a
 *  list nobody can read is not a choice. */
export const MAX_CHOICES = 6;

const cache = new Map<string, CrossOutcome>();
/** The cache is keyed by the NORMALISED names, so it holds no more of what a person typed than "woodward|warren"
 *  — and it is a plain Map in this module, which dies with the page, never storage. */
export function resolveCrossing(map: BaseMap, text: string): CrossOutcome | null {
  const parsed = parseCrossing(text);
  if (!parsed) return null;
  const na = normStreet(parsed.a), nb = normStreet(parsed.b);
  const key = `${na.dir}:${na.name}|${nb.dir}:${nb.name}`;
  const held = cache.get(key);
  if (held) return held;
  const index = streetIndex(map);
  const out = ((): CrossOutcome => {
    const a = linesFor(index, parsed.a);
    if (!a.length) return { kind: 'unknown', unknown: parsed.a };
    if (!parsed.b) { const p = midpointOf(a); return p ? { kind: 'street', point: p, a: parsed.a } : { kind: 'unknown', unknown: parsed.a }; }
    const b = linesFor(index, parsed.b);
    if (!b.length) return { kind: 'unknown', unknown: parsed.b };
    const hits = crossingsOf(a, b);
    if (!hits.length) return { kind: 'no_crossing', a: parsed.a, b: parsed.b };
    if (hits.length === 1) return { kind: 'point', point: hits[0]!, a: parsed.a, b: parsed.b };
    const kept = hits.slice(0, MAX_CHOICES);
    const words = whereWords(kept);
    return { kind: 'choices', a: parsed.a, b: parsed.b, choices: kept.map((point, i) => ({ point, where: words[i] ?? '' })) };
  })();
  cache.set(key, out);
  return out;
}

/** For tests and for a new bundle: the crossings held from the old one mean nothing about the new streets. */
export const forgetCrossings = () => cache.clear();

/** World coordinates for a lat/lon, re-exported so a caller need not know which file the projection lives in. */
export const toWorld = (p: Pt) => ({ x: wx(p.lon), y: wy(p.lat) });
