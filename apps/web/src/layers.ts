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
 *
 * **Boundaries joined it on 2026-09-22** (Kyle: "The user needs to be able to see the boundaries of the
 * neighborhoods on the map"). The outlines were the one thing on the Map tab a person could not get to without
 * knowing the switcher existed, and a neighbourhood edge is not an extra: it is how somebody says where they
 * live. They are drawn as a hairline (bounds.ts), under every dot and every line, so the map that opens is still
 * a map of help with the ground drawn under it.
 */
export const AREAS_LAYER = 'place:areas';
export const DEFAULT_LAYERS = [
  'help:food', 'help:shelter', 'help:health', 'help:rec', 'help:work', 'help:kids', 'help:things', 'help:paperwork',
  'place:parks', AREAS_LAYER,
];

/**
 * What the stored list is a list OF. Bumped when the default set gains something every phone should see.
 *
 * 1 (implied, no marker written): the list as it stood before 2026-09-22.
 * 2: boundaries are in the defaults, and a list written before this existed gets them added once.
 *
 * Why a marker rather than "just add it": a phone that has ever touched the switcher never reads `DEFAULT_LAYERS`
 * again, so those people would have gone on seeing no boundaries for ever. Adding it on every load instead would
 * mean a person could not turn it OFF. So it is added exactly once, the marker records that it happened, and
 * from then on the remembered choice — including "off" — is the only thing that decides.
 */
export const LAYERS_VERSION = 2;

export async function loadLayers(): Promise<string[]> {
  const ids = await idbGet<unknown>('layers');
  // Never touched the switcher: the defaults, whatever they are today. Nothing is written — a first visit that
  // never opens the switcher leaves no layer row at all, exactly as before.
  if (!Array.isArray(ids)) return [...DEFAULT_LAYERS];
  const stored = ids.filter((x): x is string => typeof x === 'string');
  if ((await idbGet<unknown>('layers_v')) === LAYERS_VERSION) return stored;
  const next = stored.includes(AREAS_LAYER) ? stored : [...stored, AREAS_LAYER].slice(-30);
  await idbSet('layers', next);
  await idbSet('layers_v', LAYERS_VERSION);
  return next;
}

/** Returns the new list. 30 at most, so a stale phone can never ask for an unbounded number of files. */
export async function toggleLayer(on: string[], id: string): Promise<string[]> {
  const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id].slice(-30);
  await save(next);
  return next;
}

export async function setLayers(ids: string[]): Promise<string[]> {
  const next = ids.slice(0, 30);
  await save(next);
  return next;
}
/** Every write stamps the marker, so a choice made today is never "migrated" tomorrow: switching the boundaries
 *  off and coming back must leave them off. */
async function save(next: string[]): Promise<void> {
  await idbSet('layers', next);
  await idbSet('layers_v', LAYERS_VERSION);
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
