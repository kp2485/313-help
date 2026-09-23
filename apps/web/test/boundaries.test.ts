// Neighbourhood and city boundaries on the Map tab (Kyle, 2026-09-22: "The user needs to be able to see the
// boundaries of the neighborhoods on the map").
//
// Four things are held here, and they are the four the iPhone and Android ports have to match:
//   1. the layer is on when nobody has said otherwise, and an existing phone gains it exactly once;
//   2. `boundaryStyle` — the whole per-band table, as arithmetic;
//   3. the draw order on a real canvas: after the streets and the parks, before the greenway, the transit lines
//      and the listing dots;
//   4. what the text list says, and what is NOT remembered about the outline a person tapped.
// The colour is held with the rest of the map's contrast, in web.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOUNDARY_MID_MPP, BOUNDARY_NAME_CAP, BOUNDARY_NAME_MIN_PX, BOUNDARY_NEAR_MPP, BOUNDARY_SELECTED_WIDTH,
  BOUNDARY_TOKEN, BOUNDARY_WASH_ALPHA, areasMapBoundaryStyle, boundaryBand, boundaryStyle,
} from '../src/bounds.js';
import { mapListHtml } from '../src/maplist.js';
import { mapKeyHtml } from '../src/stylepanel.js';
import { themeTokens } from './fakes.js';
import { baseSpec, framesOf, overlaysFor, serveBasemap } from './mapfixture.js';
import type { MapArea } from '../src/map.js';

const root = join(__dirname, '../../..');
const strings = (lang: string) => JSON.parse(readFileSync(join(root, `strings/${lang}.json`), 'utf8')) as Record<string, string>;
const en = strings('en');

// The phone's own storage, in memory, exactly as the outbox test does it. `layers.ts` is imported AFTER the mock
// so it really goes through this and not through a browser's IndexedDB.
const store = new Map<string, unknown>();
vi.mock('../src/data.js', () => ({
  idbGet: async (k: string) => structuredClone(store.get(k)),
  idbSet: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); },
}));
const { AREAS_LAYER, DEFAULT_LAYERS, LAYERS_VERSION, loadLayers, setLayers, toggleLayer } = await import('../src/layers.js');

beforeEach(() => store.clear());

// ---------------------------------------------------------------------------------------------------
// 1. On by default, and added exactly once to a phone that already had a list
// ---------------------------------------------------------------------------------------------------

describe('the boundaries are on the Map tab without anyone asking', () => {
  it('a phone that has never touched the switcher gets the boundaries with everything else', async () => {
    expect(DEFAULT_LAYERS).toContain(AREAS_LAYER);
    expect(await loadLayers()).toEqual([...DEFAULT_LAYERS]);
    // And reading the defaults writes nothing: a visit that never opens the switcher leaves no row behind.
    expect([...store.keys()]).toEqual([]);
  });

  it('a list remembered before today gains the layer once, and keeps every other choice', async () => {
    store.set('layers', ['help:food', 'place:greenway', 'go:ddot_routes']);
    expect(await loadLayers()).toEqual(['help:food', 'place:greenway', 'go:ddot_routes', AREAS_LAYER]);
    expect(store.get('layers_v')).toBe(LAYERS_VERSION);
  });

  it('it is added ONCE: switching it off again and coming back leaves it off', async () => {
    store.set('layers', ['help:food']);
    const after = await loadLayers();
    expect(after).toContain(AREAS_LAYER);
    // The person turns it off.
    const off = await toggleLayer(after, AREAS_LAYER);
    expect(off).not.toContain(AREAS_LAYER);
    // Next visit, and the one after that: still off. The marker is what stops the migration running again.
    expect(await loadLayers()).toEqual(off);
    expect(await loadLayers()).toEqual(off);
  });

  it('a phone that already had the layer on is not given a second copy', async () => {
    store.set('layers', ['help:food', AREAS_LAYER]);
    expect(await loadLayers()).toEqual(['help:food', AREAS_LAYER]);
    expect((await loadLayers()).filter((x) => x === AREAS_LAYER)).toHaveLength(1);
  });

  it('a first visit that DOES use the switcher is a choice, not a list to migrate', async () => {
    // Nothing stored yet; the person unticks the boundaries straight away. `toggleLayer` stamps the marker, so
    // the next load must not hand them back.
    const off = await toggleLayer([...DEFAULT_LAYERS], AREAS_LAYER);
    expect(await loadLayers()).toEqual(off);
    expect(await loadLayers()).not.toContain(AREAS_LAYER);
    // `setLayers` (the "all off" / "all on" paths) stamps it too.
    store.clear();
    await setLayers(['help:food']);
    expect(await loadLayers()).toEqual(['help:food']);
  });

  it('a stored list of rubbish is still a stored list: the strings survive, the rest is dropped', async () => {
    store.set('layers', ['help:food', 7, null, { x: 1 }]);
    expect(await loadLayers()).toEqual(['help:food', AREAS_LAYER]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. The per-band table — the pure function the ports re-implement
// ---------------------------------------------------------------------------------------------------

describe('boundaryStyle: one table, three bands', () => {
  it('the bands are the ones the subway style already uses, so there is one ladder to port', () => {
    expect([BOUNDARY_MID_MPP, BOUNDARY_NEAR_MPP]).toEqual([30, 12]);
    for (const [mpp, band] of [[90, 'city'], [40, 'city'], [30.01, 'city'], [30, 'mid'], [20, 'mid'], [12, 'mid'], [11.99, 'near'], [4, 'near'], [0.5, 'near']] as const) {
      expect(`${mpp} m/px`).toBe(`${mpp} m/px`);
      expect(boundaryBand(mpp), `${mpp} m/px`).toBe(band);
    }
  });

  it('the whole table, to the digit', () => {
    const CASES = [
      { mpp: 60, band: 'city', width: 1.1, cityWidth: 1.5, dash: [2, 2], names: false, nameCap: 0 },
      { mpp: 20, band: 'mid', width: 1.6, cityWidth: 2.4, dash: [3, 3], names: true, nameCap: BOUNDARY_NAME_CAP },
      { mpp: 6, band: 'near', width: 2.2, cityWidth: 3, dash: [6, 3], names: true, nameCap: BOUNDARY_NAME_CAP },
    ] as const;
    for (const { mpp, ...want } of CASES) expect(boundaryStyle(mpp), `${mpp} m/px`).toEqual({ ...want, nameMinPx: BOUNDARY_NAME_MIN_PX });
    expect(BOUNDARY_NAME_CAP).toBe(12);
    expect(BOUNDARY_NAME_MIN_PX).toBe(70);
  });

  it('every band is a real boundary: dashed, never solid, and drawn in the boundary token', () => {
    for (const mpp of [90, 30, 20, 12, 6, 1]) {
      const s = boundaryStyle(mpp);
      expect(s.dash.length, `${mpp} m/px`).toBe(2);
      expect(s.dash.every((d) => d > 0), `${mpp} m/px`).toBe(true);
      // A dash shorter than the line is wide reads as dust, not as a line: the "on" length is never under the stroke.
      expect(s.dash[0]!, `${mpp} m/px`).toBeGreaterThanOrEqual(s.width);
    }
    expect(BOUNDARY_TOKEN).toBe('--map-bnd');
    // The one exception is the outline a person tapped: solid, heavier, and in the focus colour.
    expect(BOUNDARY_SELECTED_WIDTH).toBeGreaterThan(boundaryStyle(1).cityWidth);
  });

  it('at city zoom the line is thinner than the thinnest street the map draws there', () => {
    // map.ts: under 30 m/px only classes 0–2 are drawn, and their width floor is 1.6 px. 205 outlines can only
    // be a lattice rather than a mesh if each one is lighter than every road it crosses. This is the one number
    // the "make it stronger" passes may not simply keep raising.
    expect(boundaryStyle(60).width).toBeLessThan(1.6);
    expect(boundaryStyle(60).cityWidth).toBeLessThan(1.6);
  });

  it('coming in makes the line stronger and the dash longer, never the other way round', () => {
    const [city, mid, near] = [boundaryStyle(60), boundaryStyle(20), boundaryStyle(6)];
    expect(city.width).toBeLessThan(mid.width); expect(mid.width).toBeLessThan(near.width);
    expect(city.cityWidth).toBeLessThan(mid.cityWidth); expect(mid.cityWidth).toBeLessThan(near.cityWidth);
    expect(city.dash[0]!).toBeLessThan(mid.dash[0]!); expect(mid.dash[0]!).toBeLessThan(near.dash[0]!);
    // A city outline is always heavier than a neighbourhood's: weight is the only thing that says which is which.
    for (const s of [city, mid, near]) expect(s.cityWidth).toBeGreaterThan(s.width);
  });

  it('no names at city zoom, names from mid', () => {
    expect(boundaryStyle(60).names).toBe(false);
    expect(boundaryStyle(20).names).toBe(true);
    expect(boundaryStyle(6).names).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. What reaches the canvas: order, and the same line in every band
// ---------------------------------------------------------------------------------------------------

/** Two areas over the fixture city: the "city" outline and one neighbourhood inside it. */
const AREAS: MapArea[] = [
  { id: 'city_detroit', name: 'Detroit', sub: 'City', rings: [[{ lat: 42.27, lon: -83.17 }, { lat: 42.27, lon: -83.0 }, { lat: 42.42, lon: -83.0 }, { lat: 42.42, lon: -83.17 }]] },
  { id: 'nbh_midtown', name: 'Midtown', sub: 'District 5', rings: [[{ lat: 42.33, lon: -83.08 }, { lat: 42.33, lon: -83.04 }, { lat: 42.37, lon: -83.04 }, { lat: 42.37, lon: -83.08 }]] },
];
const tokens = themeTokens();
const at = (log: string[], needle: string) => log.findIndex((l) => l === needle);

describe('where a boundary is drawn, and in what order', () => {
  it('under the listing dots, the transit lines and the greenway; over the streets and the parks', async () => {
    const f = await framesOf(baseSpec('bnd1', overlaysFor(['ddot_routes']), { areas: AREAS }), serveBasemap());
    for (const log of [f.far, f.near]) {
      const park = at(log, `fillStyle=${tokens['--map-park']}`);
      const street = at(log, `strokeStyle=${tokens['--map-road']}`) >= 0 ? at(log, `strokeStyle=${tokens['--map-road']}`) : at(log, `strokeStyle=${tokens['--map-main']}`);
      const bnd = at(log, `strokeStyle=${tokens['--map-bnd']}`);
      const layer = at(log, `strokeStyle=${tokens['--lyr-bus']}`);
      const greenway = at(log, `strokeStyle=${tokens['--gw-open']}`);
      const dot = at(log, `fillStyle=${tokens['--grp-food']}`);
      expect(bnd, 'the boundary was never drawn').toBeGreaterThan(-1);
      expect(park, 'parks').toBeLessThan(bnd);
      expect(street, 'streets').toBeLessThan(bnd);
      expect(bnd, 'transit lines').toBeLessThan(layer);
      expect(bnd, 'the greenway').toBeLessThan(greenway);
      expect(bnd, 'the listing dots').toBeLessThan(dot);
    }
  });

  it('the outlines are drawn at every zoom, dotted, at the band\'s own weight', async () => {
    const f = await framesOf(baseSpec('bnd2', [], { areas: AREAS }), serveBasemap());
    for (const log of [f.far, f.near]) {
      const i = at(log, `strokeStyle=${tokens['--map-bnd']}`);
      expect(i).toBeGreaterThan(-1);
      // The dash is set immediately before the colour, and it is one of the three the table allows.
      expect(log[i - 1]).toMatch(/^setLineDash\(\[(2,2|3,3|6,3)\]\)$/);
      expect(log[i + 1]).toMatch(/^lineWidth=(1\.1|1\.5|1\.6|2\.4|2\.2|3)$/);
    }
    // Both outlines reached the canvas in the far frame: the city AND the neighbourhood inside it. Until today a
    // neighbourhood was not drawn at all above 14 m/px, which is every view the Map tab opens on.
    expect(f.far.filter((l) => l === `strokeStyle=${tokens['--map-bnd']}`)).toHaveLength(2);
  });

  it('a boundary is never a street colour, and never filled with a value', async () => {
    const f = await framesOf(baseSpec('bnd3', [], { areas: AREAS }), serveBasemap());
    for (const road of ['--map-road', '--map-main', '--map-fwy']) expect(tokens['--map-bnd']).not.toBe(tokens[road]);
    // Not one fill anywhere in the pass: no outline is selected here, so there is no wash either.
    const i = at(f.far, `strokeStyle=${tokens['--map-bnd']}`), j = f.far.findIndex((l, k) => k > i && l.startsWith('strokeStyle=') && l !== `strokeStyle=${tokens['--map-bnd']}`);
    expect(f.far.slice(i, j).filter((l) => l.startsWith('fill('))).toEqual([]);
  });

  it('the one that was tapped keeps its wash: solid, heavier, in the focus colour, and filled once', async () => {
    const f = await framesOf(baseSpec('bnd4', [], { areas: AREAS, selected: 'nbh_midtown' }), serveBasemap());
    const i = at(f.near, `globalAlpha=${BOUNDARY_WASH_ALPHA}`);
    expect(i).toBeGreaterThan(-1);
    expect(f.near[i + 1]).toBe(`fillStyle=${tokens['--brand']}`);
    expect(f.near).toContain(`strokeStyle=${tokens['--focus']}`);
    expect(f.near).toContain(`lineWidth=${BOUNDARY_SELECTED_WIDTH}`);
    expect(f.near[i + 2]).toBe('fill(evenodd)');                           // the wash itself, and nothing else
    expect(f.near.filter((l) => l === `globalAlpha=${BOUNDARY_WASH_ALPHA}`)).toHaveLength(1);   // one outline, one wash
  });

  it('no more than the band\'s cap of names in a frame', async () => {
    // Twenty little outlines side by side, all in view, all wide enough to earn a name.
    const many: MapArea[] = Array.from({ length: 20 }, (_, i) => ({
      id: 'nbh_' + i, name: 'Area ' + i, sub: '',
      rings: [[{ lat: 42.33, lon: -83.09 + i * 0.004 }, { lat: 42.33, lon: -83.087 + i * 0.004 }, { lat: 42.36, lon: -83.087 + i * 0.004 }, { lat: 42.36, lon: -83.09 + i * 0.004 }]],
    }));
    const f = await framesOf(baseSpec('bnd5', [], { areas: many }), serveBasemap());
    const drawn = f.near.filter((l) => /^fillText\(Area \d+/.test(l));
    expect(drawn.length).toBeLessThanOrEqual(BOUNDARY_NAME_CAP);
    // And nothing at all in the city band, whatever fits.
    expect(f.far.filter((l) => /^fillText\(Area \d+/.test(l))).toEqual([]);
  });

  it('a map with no outlines handed to it draws no boundary at all', async () => {
    const f = await framesOf(baseSpec('bnd6', [], {}), serveBasemap());
    expect(f.far).not.toContain(`strokeStyle=${tokens['--map-bnd']}`);
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. The words: the switcher, the key, the list — and what is not remembered
// ---------------------------------------------------------------------------------------------------

describe('the boundaries in words', () => {
  const t = (k: string) => en[k] ?? k;

  it('one name for the layer, in all four languages, and it is the one Kyle asked for', () => {
    expect(en['layer.place.areas']).toBe('Neighborhood and city boundaries');
    for (const lang of ['en', 'es', 'ar', 'bn']) expect(strings(lang)['layer.place.areas'], lang).toBeTypeOf('string');
    // No placeholders to get wrong, in any of them.
    for (const lang of ['en', 'es', 'ar', 'bn']) expect(strings(lang)['layer.place.areas']!).not.toMatch(/[{}]/);
  });

  it('the key under the map names the boundary line, in either map style', () => {
    const key = mapKeyHtml({ on: () => false, areas: en['layer.place.areas'], t });
    expect(key).toContain(en['map.key']!);
    expect(key).toContain('<i class="bnd"></i>Neighborhood and city boundaries');
    // With the layer off there is nothing to say, and no heading either.
    expect(mapKeyHtml({ on: () => false, areas: '', t })).toBe('');
    // With the subway style on as well, one heading and both kinds of row.
    const both = mapKeyHtml({ on: (l) => l === 'ddot_routes', areas: en['layer.place.areas'], t });
    expect((both.match(/<h2 class="keyh">/g) ?? [])).toHaveLength(1);
    expect(both).toContain('<i class="bnd"></i>');
    expect(both).toContain(en['map.key_frequent']!);
  });

  it('"See this map as a list" carries the area names when the layer is on, and nothing when it is off', () => {
    const base = {
      rows: [], overlays: [], parks: [], segments: [], problems: [],
      T: t, t, owner: (s: unknown) => String(s), icon: () => '', card: () => '', segmentRow: () => '', allParks: '',
    };
    const on = mapListHtml({ ...base, areas: [{ name: 'Midtown' }, { name: 'Detroit' }], areasLabel: en['layer.place.areas']! });
    expect(on).toContain('Neighborhood and city boundaries');
    expect(on).toContain('Midtown · Detroit');
    expect(on).toContain('<span class="count">2</span>');
    const off = mapListHtml({ ...base, areas: [], areasLabel: en['layer.place.areas']! });
    expect(off).not.toContain('Neighborhood and city boundaries');
    expect(off).toContain(en['map.list_none']!);
  });

  it('nothing about the outline a person tapped is ever written down', () => {
    // The selection lives in the view for as long as the screen is open and nowhere else: `areaSel` is a field
    // on MapView, the page is told through a callback, and no storage call exists in the pass that draws it.
    const map = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
    expect(map).toContain('private areaSel = \'\';');
    const bounds = readFileSync(join(__dirname, '../src/bounds.ts'), 'utf8');
    for (const forbidden of ['idbGet', 'idbSet', 'indexedDB', 'localStorage', 'sessionStorage', 'fetch(', 'document', 'navigator']) {
      expect(bounds, forbidden).not.toContain(forbidden);
    }
    // And the only thing the layer store ever holds is the list of layer ids and its version marker.
    expect([...store.keys()].filter((k) => k !== 'layers' && k !== 'layers_v')).toEqual([]);
  });
});

describe("the Areas tab's selection map draws the outlines as its subject (docs/MAP-STYLE.md 15.7)", () => {
  it('is solid and heavier than the Map tab in every band, with the names rule unchanged', () => {
    for (const [mpp, width, cityWidth] of [[60, 1.8, 2.6], [20, 2.4, 3.2], [5, 3.0, 3.6]] as const) {
      const a = areasMapBoundaryStyle(mpp), m = boundaryStyle(mpp);
      expect([a.width, a.cityWidth, a.dash]).toEqual([width, cityWidth, []]);
      expect(a.width).toBeGreaterThan(m.width);
      expect(a.cityWidth).toBeGreaterThan(a.width);                     // a city is still the heavier line
      expect(a.cityWidth).toBeLessThan(BOUNDARY_SELECTED_WIDTH);        // and the tapped one is heavier still
      expect([a.band, a.names, a.nameCap, a.nameMinPx]).toEqual([m.band, m.names, m.nameCap, m.nameMinPx]);
    }
  });
});
