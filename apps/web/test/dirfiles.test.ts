// The map files Directions plans on (apps/web/src/dirfiles.ts), driven with data.js's three calls faked: what
// it fetches, what it keeps, and what it hands back online, offline and half-offline.
//
// This replaces a check that read dirfiles.ts and counted `fetchVerified(` and quoted its two `idbSet(` lines.
// The rule it stood for is the one held here: every byte comes through `fetchVerified` (the checksum in the
// signed index), only the bundle's own `map/` files are ever asked for, and what is written down is the file
// itself under the file's own key — never anything about a person.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  db: new Map<string, unknown>(),
  files: {} as Record<string, unknown>,
  fetched: [] as string[],
  written: [] as string[],
  online: true,
}));
vi.mock('../src/data.js', () => ({
  idbGet: async (key: string) => fake.db.get(key),
  idbSet: async (key: string, val: unknown) => { fake.written.push(key); fake.db.set(key, val); },
  fetchVerified: async (_index: unknown, name: string) => {
    fake.fetched.push(name);
    if (!fake.online) throw new Error('no signal');
    if (!(name in fake.files)) throw new Error('not in the bundle');
    return fake.files[name];
  },
}));

import { streetFiles, transitLayers } from '../src/dirfiles.js';

const cell = (x: number) => ({ origin: [-83.05 + x, 42.33], names: [`Street ${x}`], roads: [] });
const BASE = { origin: [-83.05, 42.33], names: ['Woodward Ave'], roads: [] };
// Out of order on purpose: the graph's node numbering follows the sorted cell keys, on every client.
const STREETS = { grid: 0.02, cells: { c_1_0: cell(1), c_0_1: cell(0.1), c_0_0: cell(0) } };

const index = (files: Record<string, string>) => ({ files: Object.fromEntries(Object.entries(files).map(([k, sha]) => [k, { sha256: sha, bytes: 1 }])) }) as never;
const STREET_INDEX = { 'map/base.json': 'b1', 'map/streets.json': 's1', 'category/food.json': 'f1' };

beforeEach(() => {
  fake.db.clear(); fake.fetched = []; fake.written = []; fake.online = true;
  fake.files = { 'map/base.json': BASE, 'map/streets.json': STREETS };
});

describe('the street files', () => {
  it('fetches the two street files through the signed index, keeps them under their own checksums, and hands back the base then the cells in key order', async () => {
    const got = await streetFiles(index(STREET_INDEX));
    expect(got).toEqual([BASE, STREETS.cells.c_0_0, STREETS.cells.c_0_1, STREETS.cells.c_1_0]);
    expect(fake.fetched.sort()).toEqual(['map/base.json', 'map/streets.json']);
    expect(fake.written).toEqual(['map']);
    expect(fake.db.get('map')).toEqual({ key: 'b1:s1', base: BASE, streets: STREETS });
  });

  it('a phone that already holds them asks for nothing and writes nothing', async () => {
    await streetFiles(index(STREET_INDEX));
    fake.fetched = []; fake.written = [];
    fake.online = false;
    expect(await streetFiles(index(STREET_INDEX))).toHaveLength(4);
    expect(fake.fetched).toEqual([]);
    expect(fake.written).toEqual([]);
  });

  it('offline with last month\'s streets still routes on them, and writes nothing new', async () => {
    await streetFiles(index(STREET_INDEX));
    fake.fetched = []; fake.written = [];
    fake.online = false;
    const got = await streetFiles(index({ ...STREET_INDEX, 'map/streets.json': 's2' }));   // a newer bundle it cannot fetch
    expect(got).toEqual([BASE, STREETS.cells.c_0_0, STREETS.cells.c_0_1, STREETS.cells.c_1_0]);
    expect(fake.written).toEqual([]);
  });

  it('offline and never held: nothing, which the screen says as "not on this phone yet"', async () => {
    fake.online = false;
    expect(await streetFiles(index(STREET_INDEX))).toEqual([]);
    expect(fake.written).toEqual([]);
  });

  it('a bundle without both street files asks for neither', async () => {
    expect(await streetFiles(index({ 'map/base.json': 'b1' }))).toEqual([]);
    expect(fake.fetched).toEqual([]);
  });
});

describe('the transit layers', () => {
  const layer = (id: string, net?: string) => ({ id, kind: 'both', file: `map/transit/${id}.json`, lines: 1, points: 1, bytes: 1, name: id, source: {} as never, ...(net ? { net: { file: net, bytes: 1, v: 1 } } : {}) });
  const TRANSIT = {
    layers: [
      layer('ddot', 'map/transit/ddot.net.json'),                       // routes and stops in one layer
      layer('smart_routes', 'map/transit/smart_routes.net.json'),       // routes whose stops are another layer
      layer('smart_stops', 'map/transit/smart_stops.net.json'),         // that layer: its .net.json is the serves list
      layer('greenway'),                                                // no .net.json: nothing to plan on
      layer('qline', 'map/transit/qline.net.json'),                     // named, but not in this bundle
    ],
  } as never;
  const FILES = {
    'map/transit/ddot.net.json': { id: 'ddot', routes: [{ id: 'rt_ddot_4' }] },
    'map/transit/ddot.json': { points: 'ddot stops' },
    'map/transit/smart_routes.net.json': { id: 'smart_routes', stops_layer: 'smart_stops', routes: [{ id: 'rt_smart_461' }] },
    'map/transit/smart_stops.json': { points: 'smart stops' },
    'map/transit/smart_stops.net.json': { route_ids: ['rt_smart_461'], serves: [[0]] },
  };
  const TRANSIT_INDEX = Object.fromEntries(Object.keys(FILES).map((f) => [f, 'x_' + f.length]));

  it('pairs each routes file with its own stops, and a separate stops layer with its serves list', async () => {
    fake.files = FILES;
    const got = await transitLayers(index(TRANSIT_INDEX), TRANSIT);
    expect(got).toEqual([
      { stops: FILES['map/transit/ddot.json'], routes: FILES['map/transit/ddot.net.json'] },
      { stops: FILES['map/transit/smart_stops.json'], routes: FILES['map/transit/smart_routes.net.json'], serves: FILES['map/transit/smart_stops.net.json'] },
    ]);
  });

  it('asks only for map files the signed index lists, and keeps each one as itself under its own checksum', async () => {
    fake.files = FILES;
    await transitLayers(index(TRANSIT_INDEX), TRANSIT);
    expect(fake.fetched.length).toBeGreaterThan(0);
    for (const f of fake.fetched) {
      expect(f).toMatch(/^map\//);
      expect(TRANSIT_INDEX).toHaveProperty([f]);
    }
    expect(fake.fetched).not.toContain('map/transit/qline.net.json');   // not in the index: never asked for
    for (const key of fake.written) {
      const file = key.replace(/^layer:/, '');
      expect(key).toBe('layer:' + file);
      expect(fake.db.get(key)).toEqual({ key: `${file}:${TRANSIT_INDEX[file]}`, file: FILES[file as keyof typeof FILES] });
    }
  });

  it('offline, a layer it has held before still plans; one it never held is simply left out, and walking is never touched', async () => {
    fake.files = FILES;
    await transitLayers(index(TRANSIT_INDEX), TRANSIT);
    fake.online = false; fake.fetched = [];
    const newer = Object.fromEntries(Object.entries(TRANSIT_INDEX).map(([f, sha]) => [f, sha + '_next']));
    expect(await transitLayers(index(newer), TRANSIT)).toHaveLength(2);
    fake.db.clear();
    expect(await transitLayers(index(newer), TRANSIT)).toEqual([]);
  });
});
