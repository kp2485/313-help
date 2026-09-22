// Which neighborhood is a point in, and how the index list is ordered and filtered (docs/13).
//
// Every line of this runs ON THE DEVICE. A point handed to `hoodAt` comes from the browser's own geolocation or
// from the centre of a ZIP the person typed; it is a value passed in and returned from, and nothing in this file
// stores, sends, or even looks at anything else. There is no import of storage, of the network, or of the
// router: a neighborhood found here reaches the browser's history only as the neighborhood's own id, when the
// person taps the row.
//
// It is a module of its own so the iPhone and Android apps can be held to the same answers, case for case:
// the coordinates in `schema/neighborhoods/points.json` are run by all three clients.
//
// Nothing here may order a list by an indicator (docs/13, honesty rule 1: no league tables). The only orders
// this file knows are the neighborhood's own name and the council district it is in.

import type { Hood } from './hoods.js';

export interface Point { lat: number; lon: number }

/** One outline, as lat/lon corners. `rings` are whole 1e-5 degrees from the bundle's origin, each one a delta
 *  on the one before; the same decoding as `outline()` in hoods.ts, with no words or HTML attached. */
export function rings(h: Hood, origin: [number, number]): Point[][] {
  return h.rings.map((enc) => {
    const out: Point[] = [];
    let x = 0, y = 0;
    for (let i = 0; i + 1 < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out.push({ lon: origin[0] + x / 1e5, lat: origin[1] + y / 1e5 }); }
    return out;
  });
}

/**
 * Is the point inside this outline? Ray casting, counting crossings across every ring at once, so a
 * neighborhood drawn as several pieces, or with a hole in it, answers correctly: an odd number of crossings
 * is inside. A point exactly on an edge belongs to one side only, which is what keeps two neighbors from both
 * claiming a point on the street between them.
 */
export function inHood(h: Hood, origin: [number, number], p: Point): boolean {
  let inside = false;
  for (const ring of rings(h, origin)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!;
      if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
    }
  }
  return inside;
}

/** A quick reject before the crossings are counted: 205 outlines, one point, on a cheap phone. */
function boxHolds(h: Hood, origin: [number, number], p: Point): boolean {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const ring of rings(h, origin)) for (const c of ring) {
    if (c.lat < minLat) minLat = c.lat; if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon; if (c.lon > maxLon) maxLon = c.lon;
  }
  return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
}

/**
 * The neighborhood a point is in, or null. Null is a real answer and the honest one: the City's outlines cover
 * Detroit, so a point in Hamtramck, Highland Park or Dearborn is in none of them and the screen says so
 * (`hood.mine_outside`) instead of naming whichever outline happens to be nearest. Nothing is ever guessed.
 */
export function hoodAt(list: readonly Hood[], origin: [number, number], p: Point): Hood | null {
  for (const h of list) if (h.rings.length && boxHolds(h, origin, p) && inHood(h, origin, p)) return h;
  return null;
}

/**
 * A typed ZIP. The bundle carries one point per ZIP — its centre — and a ZIP covers more than one neighborhood,
 * so this answers with the neighborhood that centre falls in and the screen says as much (`hood.mine_zip`).
 * An empty list when the centre is outside every Detroit outline. It returns a list, not one neighborhood,
 * because the day the bundle carries ZIP outlines this is where the several they touch will come from.
 */
export function hoodsForZip(list: readonly Hood[], origin: [number, number], centre: Point): Hood[] {
  const h = hoodAt(list, origin, centre);
  return h ? [h] : [];
}

// ---- the index list: name order and district order, and nothing else -------------------------------------

/** For matching what a person types against a name the City wrote: case, accents and punctuation set aside. */
export const foldName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Search as you type, over the 205 names. A typed word matches a name when a word of the name STARTS with it,
 * so "park" finds "Palmer Park" and "Park Grove" but not "Sparkle"; every word typed has to match something.
 * The order that comes back is alphabetical, exactly as with no filter: a filter narrows a list, it never
 * re-ranks one.
 */
export function matchHoods(list: readonly Hood[], query: string): Hood[] {
  const words = foldName(query).split(' ').filter(Boolean);
  const kept = words.length
    ? list.filter((h) => { const parts = foldName(h.name).split(' '); return words.every((w) => parts.some((p) => p.startsWith(w))); })
    : [...list];
  return kept.sort(byName);
}

const byName = (a: Hood, b: Hood) => a.name.localeCompare(b.name);

/** Three orders. "Nearest first" is offered only when a location or a typed ZIP is already known, and it is
 *  still not a ranking: a distance to the middle of an outline says how far away a place is, never how good it
 *  is (docs/13, rule 1). The distance is computed here, on the device, from a point that never leaves it. */
export type HoodOrder = 'abc' | 'district' | 'near';
export const hoodOrder = (stored: unknown, canNear: boolean): HoodOrder =>
  stored === 'district' ? 'district' : stored === 'near' && canNear ? 'near' : 'abc';

/** Straight-line distance, in the flat units this file already uses for outlines: only comparisons use it. */
const away = (h: Hood, p: Point) => Math.hypot((h.center[1] - p.lon) * 0.74, h.center[0] - p.lat);

/** The first letter a name is filed under; anything that is not a letter files under one "Other" group. */
export const letterOf = (h: Hood) => { const c = foldName(h.name)[0] ?? ''; return /[a-z]/.test(c) ? c.toUpperCase() : ''; };

/**
 * The list, in groups. Two orders and no more: A to Z, or by council district — and inside a district,
 * alphabetically. Never by a number about the neighborhood (docs/13, rule 1); `groups` is handed no indicator
 * and could not sort by one if it were asked to.
 *
 * `key` is the letter, or the district number, or '' for the group that has neither.
 */
export function groupHoods(list: readonly Hood[], order: HoodOrder, near?: Point | null): { key: string | number; items: Hood[] }[] {
  const sorted = [...list].sort(byName);
  // Nearest first: one group, no headings, because a letter or a district over a distance-ordered list would be
  // a heading that lies about the order under it. Without a point there is nothing to measure, so it falls back
  // to A to Z rather than inventing a distance.
  if (order === 'near') {
    if (!near) return groupHoods(list, 'abc');
    // Ties break on the name, so one bundle and one point always give one list.
    return [{ key: '', items: sorted.sort((a, b) => away(a, near) - away(b, near) || byName(a, b)) }];
  }
  if (order === 'district') {
    const districts = [...new Set(sorted.map((h) => h.district))].filter((d): d is number => typeof d === 'number').sort((a, b) => a - b);
    const keys: (string | number)[] = [...districts, ''];
    return keys.map((k) => ({ key: k, items: sorted.filter((h) => (k === '' ? h.district === null || h.district === undefined : h.district === k)) })).filter((g) => g.items.length);
  }
  const letters = [...new Set(sorted.map(letterOf))].sort();
  // '' (a name that starts with a digit or a symbol) is filed last, under "Other", not first.
  const keys = [...letters.filter(Boolean), ...(letters.includes('') ? [''] : [])];
  return keys.map((k) => ({ key: k, items: sorted.filter((h) => letterOf(h) === k) }));
}
