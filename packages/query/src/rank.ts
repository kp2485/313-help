import type { Alert, Badge, BundleRow, OpenResult } from './types.js';
import { badge } from './freshness.js';
import { nextOccurrences, openNow } from './schedule.js';
import { nowWallMinutes } from './time.js';
import { AREA_BAND_MILES, SERVICE_AREAS, isDvCategory, servesByArea } from './areas.js';

// One ranking rule (DECISIONS 10-B2):
//   eligibility -> preferred flags (if asked) -> distance band -> wide area -> reported-closed last
//   -> open-now / next-open -> distance -> id
// No freshness tier: time passing never reorders a list; only reports do (DECISIONS 2026-09-19).
// Distance comes before everything except eligibility because many users have no car.
// A domestic-violence row has no coordinate at all, so it gets its band from its service area's public
// reference point instead, and never a distance (areas.ts, schema/query-spec.md, DECISIONS 2026-09-20). Since
// 2026-09-24 so does any row that names a service area and has no coordinate (`servesByArea`).

export interface Query {
  /** Category slug or prefix: "food" matches "food.pantry". */
  category?: string;
  /** Every flag listed must be on the row. */
  flags?: string[];
  /** Rows with every one of these flags come first; nothing is left out ("I'm under 25": youth shelters first). */
  prefer?: string[];
  /** Device location; held in memory only, never written or sent. */
  near?: { lat: number; lon: number };
  /** "now": who is open right now. "week": who has a time in the next 7 days. */
  mode?: 'now' | 'week';
}

export interface Ranked {
  row: BundleRow;
  open: OpenResult;
  badge: Badge;
  miles: number | null;
  band: 0 | 1 | 2;
}

const EARTH_MILES = 3958.8;

export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

function bandOf(mi: number | null): 0 | 1 | 2 {
  if (mi === null) return 0; // no location known, or a phone-only service: reachable from anywhere
  return mi <= 1 ? 0 : mi <= 3 ? 1 : 2;
}

/**
 * Band and wide-area key for a row ranked by its area (a domestic-violence row, or a row with an area and no
 * coordinate). Every input is public and per-area: the person's own
 * location (which never leaves the device) and a city hall's coordinate that is identical for every shelter
 * serving that area. The row itself contributes nothing but the name of the area.
 *
 * No location, or no service area: band 0 and wide 0, exactly as a row with no coordinates ranks today.
 */
function dvBand(row: BundleRow, near?: { lat: number; lon: number }): { band: 0 | 1 | 2; wide: 0 | 1 } {
  const area = row.service_area ? SERVICE_AREAS[row.service_area] : undefined;
  if (!near || !area) return { band: 0, wide: 0 };
  // statewide and national have no local centre: farthest band, and after every local area.
  if (!area.point) return { band: 2, wide: 1 };
  const mi = miles(near, area.point);
  const [close, mid] = AREA_BAND_MILES;
  return { band: mi <= close ? 0 : mi <= mid ? 1 : 2, wide: 0 };
}

function openKeyNow(o: OpenResult, today: string): number {
  switch (o.state) {
    case 'open': return 0;
    case 'closes_soon': return 1;
    case 'closed': return o.next?.date === today ? 2 : o.next ? 4 : 5;
    // A holiday row ranks exactly where "call first" does: we do not know today's hours, so it never sorts above a
    // row that is known to be open (schema/query-spec.md "Holidays").
    case 'call_first': case 'holiday': return 3;
    default: return 6; // unknown sorts last: never implied open
  }
}

function openKeyWeek(row: BundleRow, o: OpenResult, now: Date, alerts: Alert[]): number {
  if (o.state === 'open' || o.state === 'closes_soon') return 0;
  if (o.state === 'call_first' || o.state === 'holiday') return 1;
  if (o.state === 'unknown') return 3;
  const next = nextOccurrences(row, now, 1, alerts)[0];
  return next && next.start - nowWallMinutes(now) <= 7 * 1440 ? 0 : 2;
}

export function rank(rows: BundleRow[], q: Query, now: Date, alerts: Alert[] = []): Ranked[] {
  const mode = q.mode ?? 'now';
  const today = new Date(nowWallMinutes(now) * 60000).toISOString().slice(0, 10);

  const out = rows
    .filter((r) => r.status === 'active')
    .filter((r) => !q.category || r.category === q.category || r.category.startsWith(q.category + '.'))
    .filter((r) => (q.flags ?? []).every((f) => r.flags.includes(f)))
    .map((row) => {
      // DV rows never carry coordinates and never get a distance (docs/08). Their band comes from the public
      // reference point of the area they serve, so proximity works without any fact that locates a shelter.
      const byArea = servesByArea(row);
      const mi = !isDvCategory(row.category) && q.near && row.lat !== undefined && row.lon !== undefined
        ? miles(q.near, { lat: row.lat, lon: row.lon }) : null;
      const { band, wide } = byArea ? dvBand(row, q.near) : { band: bandOf(mi), wide: 0 as const };
      const open = openNow(row, now, alerts);
      const key = mode === 'week' ? openKeyWeek(row, open, now, alerts) : openKeyNow(open, today);
      return { row, open, badge: badge(row, now), miles: mi, band, key, wide };
    });

  // Rows with 2+ standing closed reports stay visible but go last in their band (docs/04).
  const reported = (r: { badge: Badge }) => (r.badge.level === 'reported_closed' ? 1 : 0);

  const preferred = (r: { row: BundleRow }) => (q.prefer?.length && q.prefer.every((f) => r.row.flags.includes(f)) ? 0 : 1);

  out.sort((a, b) =>
    preferred(a) - preferred(b)
    || a.band - b.band
    // Statewide and national DV lines after every local area. 0 for every other row, so ordinary lists are untouched.
    || a.wide - b.wide
    || reported(a) - reported(b)
    || a.key - b.key
    // A DV row's miles is always null, so two shelters in one area are separated by the open key and the id only.
    || (a.miles ?? 0) - (b.miles ?? 0)
    || a.row.id.localeCompare(b.row.id));

  return out.map(({ key: _key, wide: _wide, ...r }) => r);
}
