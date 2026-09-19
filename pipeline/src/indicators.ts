// Neighborhood indicators (docs/13), the offline step: joins the 205 neighborhoods with OUR listings, City parks,
// the greenway, and the City's own per-neighborhood sales and permit counts. Public data only. No report, no
// app usage, nothing a phone sends is read here, and there is no ranking of neighborhoods anywhere in the output.

import { milesToLine, miles, type BundleRow, type Segment } from '@313help/query';
import { encodeLine, GRID } from './ingest-basemap.js';
import { pointInRing, type Neighborhood, type NowStats, type YearStats } from './ingest-neighborhoods.js';

export const NEAR_MILES = 0.5;                       // "inside or within half a mile" (docs/13)
export const HELP_TOPS = ['food', 'health', 'harm', 'shelter', 'utilities', 'hygiene', 'youth', 'rec'] as const;
/** Walk distance from the middle of the neighborhood to the nearest listing of each kind. */
const NEAREST: Record<string, string> = { food: 'food', clinic: 'health.clinic', narcan: 'harm.narcan', indoors: 'rec' };

type Pt = [number, number];
export interface NeighborhoodIndicators {
  id: string; name: string; district: number | null; jlg_study_area?: boolean;
  center: [number, number];                          // [lat, lon]
  rings: number[][];                                 // outline, same compact encoding as the street map
  help: { total: number; by: Record<string, number>; nearest_miles: Record<string, number | null>; none_listed_yet: string[]; coverage_checked: boolean };
  places: { parks: number; rec_centers: number; greenway_open: number; snap_stores?: number; bus_stops?: number };
  /** Straight-line miles from the middle to the nearest store that takes a Bridge card, such a grocery store, and bus stop (City data, not our list). */
  nearest_city?: { snap: number | null; grocery: number | null; bus: number | null };
  parcels?: number;                                  // the City's parcel count here: the base for "per 1,000 parcels"
  years: Record<string, YearStats>;
  now?: NowStats;
}

/** 0 when the point is inside; otherwise miles to the nearest edge. */
export function milesToArea(pt: { lat: number; lon: number }, rings: Pt[][]): number {
  if (rings.some((r) => pointInRing([pt.lon, pt.lat], r))) return 0;
  return Math.min(...rings.map((r) => milesToLine(pt, r)));
}

/** Straight-line miles to the nearest of `pts` ([lon, lat, ...]), to one decimal; null when there are none. */
export function nearestMiles(from: { lat: number; lon: number }, pts: number[][]): number | null {
  let best = Infinity;
  for (const q of pts) best = Math.min(best, miles(from, { lat: q[1]!, lon: q[0]! }));
  return best === Infinity ? null : Number(best.toFixed(1));
}

export function buildIndicators(input: {
  hoods: Neighborhood[]; rows: BundleRow[]; parks: { lat: number; lon: number }[]; segments: Segment[];
  stats: { neighborhoods: Record<string, Record<string, YearStats>>; parcels?: Record<string, number>; current?: { neighborhoods: Record<string, NowStats> } }; coverageChecked?: Set<string>;
  /** City points: SNAP stores as [lon, lat, 1 if a grocery store], bus stops as [lon, lat]. */
  snap?: number[][]; busStops?: number[][];
}): { neighborhoods: NeighborhoodIndicators[]; segments: Record<string, string[]> } {
  const asPt = (q: number[]) => ({ lat: q[1]!, lon: q[0]! });
  const located = input.rows.filter((r) => r.status === 'active' && r.lat !== undefined && r.lon !== undefined);
  const open = input.segments.filter((s) => s.phase === 'open');
  const segHoods: Record<string, string[]> = {};
  const neighborhoods = input.hoods.map((n) => {
    const box = n.rings.flat(), pad = 0.012;
    const x0 = Math.min(...box.map((q) => q[0])) - pad, x1 = Math.max(...box.map((q) => q[0])) + pad, y0 = Math.min(...box.map((q) => q[1])) - pad, y1 = Math.max(...box.map((q) => q[1])) + pad;
    const maybe = (q: { lat: number; lon: number }) => q.lon >= x0 && q.lon <= x1 && q.lat >= y0 && q.lat <= y1;
    const near = (q: { lat: number; lon: number }) => maybe(q) && milesToArea(q, n.rings) <= NEAR_MILES;
    const help = located.filter((r) => near({ lat: r.lat!, lon: r.lon! }));
    const by = Object.fromEntries(HELP_TOPS.map((t) => [t, help.filter((r) => r.category === t || r.category.startsWith(t + '.')).length]));
    const center = { lat: n.center[1], lon: n.center[0] };
    const nearest = Object.fromEntries(Object.entries(NEAREST).map(([k, cat]) => {
      const d = located.filter((r) => r.category === cat || r.category.startsWith(cat + '.')).map((r) => miles(center, { lat: r.lat!, lon: r.lon! }));
      return [k, d.length ? Number(Math.min(...d).toFixed(1)) : null];
    }));
    // A segment belongs to every neighborhood it passes through (any point of the path inside the outline).
    for (const s of input.segments) if (s.lines.some((l) => l.some(([lon, lat]) => maybe({ lat, lon }) && n.rings.some((r) => pointInRing([lon, lat], r))))) (segHoods[s.id] ??= []).push(n.id);
    return {
      id: n.id, name: n.name, district: n.district, ...(n.jlg_study_area ? { jlg_study_area: true } : {}),
      center: [n.center[1], n.center[0]] as [number, number],
      rings: n.rings.map((r) => encodeLine(r, [GRID.lon0, GRID.lat0])),
      help: {
        total: help.length, by, nearest_miles: nearest,
        // "None listed yet" describes OUR directory, not the neighborhood (honesty rule 6).
        none_listed_yet: ['food', 'health', 'harm'].filter((t) => by[t] === 0),
        coverage_checked: input.coverageChecked?.has(n.id) ?? false,
      },
      places: {
        parks: input.parks.filter(near).length,
        rec_centers: help.filter((r) => r.category === 'rec.center').length,
        greenway_open: open.filter((s) => s.lines.some((l) => l.some(([lon, lat]) => near({ lat, lon })))).length,
        ...(input.snap ? { snap_stores: input.snap.filter((q) => near(asPt(q))).length } : {}),
        ...(input.busStops ? { bus_stops: input.busStops.filter((q) => near(asPt(q))).length } : {}),
      },
      ...(input.snap && input.busStops ? { nearest_city: { snap: nearestMiles(center, input.snap), grocery: nearestMiles(center, input.snap.filter((q) => q[2] === 1)), bus: nearestMiles(center, input.busStops) } } : {}),
      ...(input.stats.parcels?.[n.id] ? { parcels: input.stats.parcels[n.id] } : {}),
      years: input.stats.neighborhoods[n.id] ?? {},
      ...(input.stats.current?.neighborhoods[n.id] ? { now: input.stats.current.neighborhoods[n.id] } : {}),
    };
  });
  return { neighborhoods, segments: segHoods };
}
