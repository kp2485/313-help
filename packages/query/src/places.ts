import type { BundleRow } from './types.js';

// Greenway geometry helpers (docs/11). Everything here runs on the device:
//   - "Help along the Greenway": rows within a 10-minute walk of a segment
//   - "0.3 mi from the Joe Louis Greenway" on a help listing
//   - snapping a condition report to a segment id, so raw GPS never leaves the phone

export type Phase = 'open' | 'under_construction' | 'funded' | 'planned';

export interface Segment {
  id: string;            // seg_ slug
  name: string;
  phase: Phase;
  typology?: string;
  /** Streets this stretch crosses, in order along the path. Worked out by the pipeline from the City's road layer. */
  cross_streets?: string[];
  /** One or more polylines of [lon, lat]. */
  lines: [number, number][][];
}

/** About a 10-minute walk or roll. */
export const WALK_MILES = 0.5;

const MILES_PER_DEG_LAT = 69.09;

/** Miles from a point to a polyline. Flat-earth projection; error is negligible at city scale. */
export function milesToLine(pt: { lat: number; lon: number }, line: [number, number][]): number {
  const kx = MILES_PER_DEG_LAT * Math.cos((pt.lat * Math.PI) / 180);
  const P = line.map(([lon, lat]) => [(lon - pt.lon) * kx, (lat - pt.lat) * MILES_PER_DEG_LAT] as const);
  if (P.length === 1) return Math.hypot(P[0]![0], P[0]![1]);
  let best = Infinity;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, ay] = P[i]!, [bx, by] = P[i + 1]!;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function milesToSegment(pt: { lat: number; lon: number }, seg: Segment): number {
  return Math.min(...seg.lines.map((l) => milesToLine(pt, l)));
}

/** Active rows within walking distance of a segment, nearest first. Rows without coordinates (hotlines, DV) never appear. */
export function helpAlong(rows: BundleRow[], seg: Segment, maxMiles = WALK_MILES): { row: BundleRow; miles: number }[] {
  return rows
    .filter((r) => r.status === 'active' && r.lat !== undefined && r.lon !== undefined)
    .map((row) => ({ row, miles: milesToSegment({ lat: row.lat!, lon: row.lon! }, seg) }))
    .filter((x) => x.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles || a.row.id.localeCompare(b.row.id));
}

/**
 * Nearest segment to a point. Used two ways: the "near the greenway" line on a listing
 * (openOnly = true, so we never send someone to a trail that is not built), and snapping
 * a condition report to a segment id on the device.
 */
export function nearestSegment(pt: { lat: number; lon: number }, segs: Segment[], opts: { openOnly?: boolean; maxMiles?: number } = {}): { segment: Segment; miles: number } | null {
  let best: { segment: Segment; miles: number } | null = null;
  for (const segment of segs) {
    if (opts.openOnly && segment.phase !== 'open') continue;
    const miles = milesToSegment(pt, segment);
    if (!best || miles < best.miles) best = { segment, miles };
  }
  return best && best.miles <= (opts.maxMiles ?? Infinity) ? best : null;
}
