// The service area as the ingest scripts read it: data/ingested/region.json (written by `pnpm ingest:region`,
// every city and township a DDOT or SMART bus stops in; Kyle, 2026-09-24). This file only reads it, so any script
// can ask "which place is this point in?" without importing an ingest script.

import { existsSync, readFileSync } from 'node:fs';
import { p } from './util.js';

type Pt = [number, number];                                   // [lon, lat]

export interface Place { id: string; name: string; counties: string[]; geoids: string[]; semmcd: number; center: Pt; rings: Pt[][] }

let cached: Place[] | null = null;
/** Every place in the area, in the file's own order (Wayne, Oakland, Macomb; then by name). */
export function regionPlaces(file = p('data/ingested/region.json')): Place[] {
  if (file === p('data/ingested/region.json') && cached) return cached;
  if (!existsSync(file)) throw new Error('data/ingested/region.json is missing. Run pnpm ingest:region first.');
  const list = (JSON.parse(readFileSync(file, 'utf8')) as { municipalities: Place[] }).municipalities;
  if (file === p('data/ingested/region.json')) cached = list;
  return list;
}

/** Even-odd over every ring, so a point in a hole is outside and a point in either part of a two-part place is in. */
export function inRings(pt: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The place a coordinate is in, or null when it is outside the area (or on a line between two places). */
export function placeAt(lat: number, lon: number, places = regionPlaces()): Place | null {
  return places.find((m) => inRings([lon, lat], m.rings)) ?? null;
}
