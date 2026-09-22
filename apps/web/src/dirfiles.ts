// The map files the planner needs, in the shape `packages/query` wants them, from the copy this phone already
// has. Nothing here reaches the network unless the file is not on the phone yet, and every fetch goes through
// `fetchVerified` — the checksum in the signed index — exactly like every other map file (map.ts).
//
// Both files are ones the map already downloads, so on a phone that has opened the Map tab once, offline
// directions cost no new bytes at all (DECISIONS 2026-09-22).

import type { PackedStreets, TransitLayer } from '@313help/query';
import { fetchVerified, idbGet, idbSet, type Bundle, type BundleIndex } from './data.js';

/** One file under `map/`, from IndexedDB when the checksum matches, else fetched and checked and kept. Null
 *  when the bundle has no such file, or when it is not here and there is no signal — the caller degrades. */
async function raw(index: BundleIndex, file: string): Promise<unknown | null> {
  const meta = index.files[file];
  if (!meta) return null;
  const key = `${file}:${meta.sha256}`;
  const held = await idbGet<{ key: string; file: unknown }>('layer:' + file);
  if (held?.key === key) return held.file;
  try {
    const got = await fetchVerified(index, file);
    await idbSet('layer:' + file, { key, file: got });
    return got;
  } catch { return held?.file ?? null; }         // offline with last week's copy is better than no bus at all
}

/**
 * The street files, in the one order every client uses: `map/base.json` first, then each cell of
 * `map/streets.json` by its key, sorted. The order is part of the contract — node numbering follows it — so a
 * graph built on the phone is the graph the fixtures describe.
 *
 * They come out of the same IndexedDB entry the map draws from (`map`), so a person who has opened a map is
 * ready for directions with no signal. Empty when the phone has never held them.
 */
export async function streetFiles(index: BundleIndex): Promise<PackedStreets[]> {
  const want = ['map/base.json', 'map/streets.json'].map((n) => index.files[n]?.sha256);
  if (!want[0] || !want[1]) return [];
  const held = await idbGet<{ key: string; base: PackedStreets; streets: { cells: Record<string, PackedStreets> } }>('map');
  if (held?.key === want.join(':')) return [held.base, ...Object.keys(held.streets.cells).sort().map((k) => held.streets.cells[k]!)];
  try {
    const [base, streets] = await Promise.all([
      fetchVerified(index, 'map/base.json') as Promise<PackedStreets>,
      fetchVerified(index, 'map/streets.json') as Promise<{ cells: Record<string, PackedStreets> }>,
    ]);
    await idbSet('map', { key: want.join(':'), base, streets });
    return [base, ...Object.keys(streets.cells).sort().map((k) => streets.cells[k]!)];
  } catch {
    // Last month's streets still route; a bundle we have never held does not.
    return held ? [held.base, ...Object.keys(held.streets.cells).sort().map((k) => held.streets.cells[k]!)] : [];
  }
}

/**
 * Every transit layer that can be planned on: a routes `.net.json` paired with its own stops layer and, where
 * the two are different files, the stops' `serves` list. This is the same pairing the shared routing test does
 * (packages/query/test/routing-real.test.ts), so the web plans on exactly what the fixtures plan on.
 *
 * A layer whose files are not here is simply left out. Walking is never left out.
 */
export async function transitLayers(index: BundleIndex, transit: Bundle['transit']): Promise<TransitLayer[]> {
  const list = transit?.layers ?? [];
  const out: TransitLayer[] = [];
  for (const l of list) {
    if (!l.net) continue;
    const routes = await raw(index, l.net.file) as { routes?: unknown; id?: string; stops_layer?: string } | null;
    if (!routes?.routes) continue;                                  // a stops `.net.json`: reached through its routes file
    const stopsId = routes.stops_layer ?? routes.id ?? l.id;
    const stopsLayer = list.find((x) => x.id === stopsId);
    if (!stopsLayer) continue;
    const stops = await raw(index, stopsLayer.file);
    if (!stops) continue;
    const serves = stopsId !== l.id && stopsLayer.net ? await raw(index, stopsLayer.net.file) : undefined;
    out.push({ stops, routes, ...(serves ? { serves } : {}) } as TransitLayer);
  }
  return out;
}
