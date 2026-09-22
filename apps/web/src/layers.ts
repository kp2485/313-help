// Which map layers are switched on. A preference about a map, not a fact about a person: it is kept on this
// phone only (IndexedDB, like the language choice and saved places) and never sent anywhere.
//
// Layer ids are `help:<group>` for our own listings (needs.ts MAP_GROUPS), `place:<kind>` for parks, the greenway
// and recreation centres, and `go:<layer>` for the transport layers the pipeline ships (ingest-transit.ts).

import { idbGet, idbSet } from './data.js';

/**
 * What a first-time visitor sees (audit H2; Kyle, 2026-09-22).
 *
 * It used to be the greenway, the parks and the DDOT routes — a street map with a green line on it and **not one
 * place that helps**. The one tab named after the thing on it opened without the thing, and a person who tapped
 * Map to find food had to open the switcher and tick a box before the tab did anything the app is for.
 *
 * So: **every help layer on, parks on, the greenway off, the bus routes off.** All eight help groups rather than
 * food alone, because the map is where a helper asks "what is near this address?" and the honest answer is all
 * of it; parks because they are the other thing a map is for; the greenway off because it is one path inside a
 * 302-park system (Kyle, direction b) and one tap away in the switcher; the bus routes off because a route line
 * over eight kinds of dot is the busiest thing on the screen and the stops only draw at zoom anyway.
 *
 * A remembered choice still wins: this list is only ever read on a phone that has never touched the switcher.
 */
export const DEFAULT_LAYERS = [
  'help:food', 'help:shelter', 'help:health', 'help:rec', 'help:work', 'help:kids', 'help:things', 'help:paperwork',
  'place:parks',
];

export async function loadLayers(): Promise<string[]> {
  const ids = await idbGet<unknown>('layers');
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [...DEFAULT_LAYERS];
}

/** Returns the new list. 30 at most, so a stale phone can never ask for an unbounded number of files. */
export async function toggleLayer(on: string[], id: string): Promise<string[]> {
  const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id].slice(-30);
  await idbSet('layers', next);
  return next;
}

export async function setLayers(ids: string[]): Promise<string[]> {
  const next = ids.slice(0, 30);
  await idbSet('layers', next);
  return next;
}

// ---- the map style (docs/MAP-STYLE.md, section 1) ---------------------------------------------------------------
// How the transport layers are drawn: `standard` (one colour per layer, the default) or `subway` (one line per
// route, like a metro map). The same kind of fact as the layer list, kept in the same place under the same
// rules: this phone only, never sent, not in any report.
export type MapStyle = 'standard' | 'subway';
/** Whatever was stored, read safely: only the exact word "subway" is subway; everything else is standard. */
export const mapStyle = (stored: unknown): MapStyle => (stored === 'subway' ? 'subway' : 'standard');
export async function loadStyle(): Promise<MapStyle> { return mapStyle(await idbGet<unknown>('style')); }
export async function saveStyle(style: MapStyle): Promise<MapStyle> { const next = mapStyle(style); await idbSet('style', next); return next; }
