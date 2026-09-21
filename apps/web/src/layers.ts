// Which map layers are switched on. A preference about a map, not a fact about a person: it is kept on this
// phone only (IndexedDB, like the language choice and saved places) and never sent anywhere.
//
// Layer ids are `help:<group>` for our own listings (needs.ts MAP_GROUPS), `place:<kind>` for parks, the greenway
// and recreation centres, and `go:<layer>` for the transport layers the pipeline ships (ingest-transit.ts).

import { idbGet, idbSet } from './data.js';

/** What a first-time visitor sees: the greenway and the buses, nothing else, so the map opens fast and plain. */
export const DEFAULT_LAYERS = ['place:greenway', 'place:parks', 'go:ddot_routes'];

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
