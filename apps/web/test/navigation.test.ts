// The navigation work of 2026-09-22 (docs/NAVIGATION-AUDIT-2026-09-22.md; Kyle's plan decisions of the same
// day), held to what it DOES rather than to the shape of the lines that do it.
//
// Five things are checked here:
//  1. the cross-street finder — a parse table, and real crossings on a synthetic grid and on the real bundle;
//  2. the opening rule of every map that opens on "where you are", as a decision table;
//  3. the Map tab's first-open layers;
//  4. the areas layer: what it draws, what it can never draw, and that the parks list is never ordered by a
//     number about a park;
//  5. the mouse cursor over the map.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  MAX_CHOICES, crossingsOf, midpointOf, nameMatches, normStreet, parseCrossing, resolveCrossing, segmentCross,
  streetIndex, whereWords, forgetCrossings, type NamedLine,
} from '../src/intersections.js';
import { decodeMap, wx, wy, orderFeatures, type BaseMap } from '../src/map.js';
import { DEFAULT_LAYERS } from '../src/layers.js';
import { MAP_GROUPS } from '../src/needs.js';
import { firstOpenAction, openingView, positionOutcome, LOCATE_RADIUS_M, ANCHOR_RADIUS_M, MAP_ANCHOR, CITY_HALL, type LocatePermission } from '../src/locate.js';
import { groupHoods, type HoodOrder } from '../src/hoodfind.js';
import type { Hood } from '../src/hoods.js';

const root = join(__dirname, '../../..');
const src = (name: string) => readFileSync(join(__dirname, '../src/' + name), 'utf8');
const main = src('main.ts');

// ---------------------------------------------------------------------------------------------------
// 1. "Type a cross street"
// ---------------------------------------------------------------------------------------------------

describe('what a person typed: the parse table', () => {
  // Every form a person actually writes a junction in, and what this app makes of it. The iPhone and Android
  // apps are held to this same table when they get their own copy.
  const CASES: [string, string, string][] = [
    ['Woodward and Warren', 'Woodward', 'Warren'],
    ['Woodward & Warren', 'Woodward', 'Warren'],
    ['Warren at Woodward', 'Warren', 'Woodward'],
    ['Woodward/Warren', 'Woodward', 'Warren'],
    ['Woodward @ Warren', 'Woodward', 'Warren'],
    ['woodward   and   warren', 'woodward', 'warren'],
    ['Grand River and W Warren Ave', 'Grand River', 'W Warren Ave'],
    ['Woodward', 'Woodward', ''],
  ];
  for (const [typed, a, b] of CASES) {
    it(`"${typed}" is ${JSON.stringify(a)} and ${JSON.stringify(b)}`, () => expect(parseCrossing(typed)).toEqual({ a, b }));
  }
  it('nothing typed is not a question', () => {
    for (const s of ['', '   ', '\t']) expect(parseCrossing(s)).toBeNull();
  });
});

describe('a street name, normalised', () => {
  const CASES: [string, string, string][] = [
    // typed -> name, direction
    ['Woodward Ave', 'woodward', ''],
    ['woodward avenue', 'woodward', ''],
    ['WOODWARD', 'woodward', ''],
    ['Woodward Ave.', 'woodward', ''],
    ['E Warren Ave', 'warren', 'e'],
    ['East Warren', 'warren', 'e'],
    ['W. Grand Blvd', 'grand', 'w'],
    ['7 Mile Rd', '7 mile', ''],
    ['Seven Mile', '7 mile', ''],
    ['Grand River Ave', 'grand river', ''],
    ['Mount Elliott St', 'mount elliott', ''],
    ['Groesbeck Hwy', 'groesbeck', ''],
    // A street-type word that IS the name keeps it: "Way" and "Circle" are real Detroit street names.
    ['Way', 'way', ''],
  ];
  for (const [typed, name, dir] of CASES) {
    it(`"${typed}" is ${JSON.stringify(name)}${dir ? ` (${dir})` : ''}`, () => expect(normStreet(typed)).toEqual({ name, dir }));
  }
  it('a typed direction narrows, and no typed direction matches either half of a street', () => {
    expect(nameMatches(normStreet('E Warren'), normStreet('E Warren Ave'))).toBe(true);
    expect(nameMatches(normStreet('E Warren'), normStreet('W Warren Ave'))).toBe(false);
    expect(nameMatches(normStreet('Warren'), normStreet('W Warren Ave'))).toBe(true);
    expect(nameMatches(normStreet('Warren'), normStreet('E Warren Ave'))).toBe(true);
    expect(nameMatches(normStreet('Warren'), normStreet('Warren Ave'))).toBe(true);
  });
});

describe('where two streets cross', () => {
  it('two straight pieces: the crossing, or nothing', () => {
    expect(segmentCross(0, 0, 10, 0, 5, -5, 5, 5)).toEqual({ x: 5, y: 0 });
    expect(segmentCross(0, 0, 10, 0, 0, 1, 10, 1)).toBeNull();          // parallel
    expect(segmentCross(0, 0, 10, 0, 20, -5, 20, 5)).toBeNull();        // past the end of the first
  });

  // A synthetic grid, in world coordinates: two north-south streets and two east-west ones, all crossing.
  const line = (pts: [number, number][]): Float32Array => { const a = new Float32Array(pts.length * 2); pts.forEach(([lon, lat], i) => { a[i * 2] = wx(lon); a[i * 2 + 1] = wy(lat); }); return a; };
  const NS = (lon: number): NamedLine => ({ name: 'NS', pts: line([[lon, 42.30], [lon, 42.40]]) });
  const EW = (lat: number): NamedLine => ({ name: 'EW', pts: line([[-83.10, lat], [-83.00, lat]]) });

  it('a grid: one crossing per pair, at the right place', () => {
    const hits = crossingsOf([NS(-83.05)], [EW(42.35)]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.lat).toBeCloseTo(42.35, 5);
    expect(hits[0]!.lon).toBeCloseTo(-83.05, 5);
  });

  it('a street that crosses another one twice gives two answers, north to south', () => {
    const hits = crossingsOf([NS(-83.05)], [EW(42.32), EW(42.38)]);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.lat).toBeCloseTo(42.38, 5);                          // north first
    expect(hits[1]!.lat).toBeCloseTo(42.32, 5);
    expect(whereWords(hits)).toEqual(['north', 'south']);
  });

  it('two streets that never meet give none — never the nearest thing to an answer', () => {
    expect(crossingsOf([NS(-83.05)], [NS(-83.02)])).toEqual([]);
  });

  it('one junction drawn by several road records is one answer', () => {
    // A boulevard's two carriageways, 30 m apart: one junction, not two.
    const near = 30 / 111320;
    const hits = crossingsOf([NS(-83.05)], [EW(42.35), EW(42.35 + near)]);
    expect(hits).toHaveLength(1);
  });

  it('a pair spread east and west is named east and west, not north and south', () => {
    expect(whereWords([{ lat: 42.35, lon: -83.10 }, { lat: 42.35, lon: -83.00 }])).toEqual(['west', 'east']);
    expect(whereWords([{ lat: 42.35, lon: -83.05 }])).toEqual(['']);
  });

  it('one street name answers with the middle of the longest piece of it, along the street', () => {
    const p = midpointOf([NS(-83.05)]);
    expect(p!.lat).toBeCloseTo(42.35, 4);
    expect(p!.lon).toBeCloseTo(-83.05, 5);
  });
});

// The real streets, from the bundle this repository builds. Skipped, loudly, when there is no bundle: the file
// is never committed (CLAUDE.md), so `pnpm build:bundle` is what turns these on.
const BUNDLE = join(root, 'data/bundle/v1');
const haveBundle = existsSync(join(BUNDLE, 'map/base.json'));
describe.skipIf(!haveBundle)('the real streets of Detroit', () => {
  let map: BaseMap;
  beforeEach(() => {
    forgetCrossings();
    map ??= decodeMap(
      JSON.parse(readFileSync(join(BUNDLE, 'map/base.json'), 'utf8')),
      JSON.parse(readFileSync(join(BUNDLE, 'map/streets.json'), 'utf8')),
    );
  });

  it('knows the streets people name', () => {
    const index = streetIndex(map);
    for (const name of ['woodward', 'grand river', 'gratiot', 'michigan', '8 mile']) expect([...index.keys()], name).toContain(name);
  });

  it('Woodward and Warren is one junction, in Midtown', () => {
    const out = resolveCrossing(map, 'Woodward and Warren')!;
    // Warren has an east and a west half, so this may be one point or a short list; either way every answer is
    // on Woodward in Midtown, which is the fact that matters.
    const points = out.kind === 'point' ? [out.point] : out.kind === 'choices' ? out.choices.map((c) => c.point) : [];
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(42.34);
      expect(p.lat).toBeLessThan(42.37);
      expect(p.lon).toBeGreaterThan(-83.08);
      expect(p.lon).toBeLessThan(-83.05);
    }
  });

  // Woodward and 7 Mile was expected to be the two-crossing case and is not: Woodward IS the line that splits
  // E 7 Mile from W 7 Mile, so the four road records that carry the name all meet it at one junction, which the
  // merge correctly reports as one answer. Recorded here as a spot check rather than quietly dropped.
  it('Woodward and 7 Mile is ONE junction, where E and W 7 Mile meet Woodward', () => {
    const out = resolveCrossing(map, 'Woodward & 7 Mile')!;
    expect(out.kind).toBe('point');
    if (out.kind !== 'point') return;
    expect(out.point.lat).toBeCloseTo(42.4321, 2);
    expect(out.point.lon).toBeCloseTo(-83.1150, 2);
  });

  it('two streets that really do cross twice are offered as a short list, each named by where it is', () => {
    // Dequindre crosses Davison twice: the street and the service drive beside the freeway.
    const out = resolveCrossing(map, 'Dequindre and Davison')!;
    expect(out.kind).toBe('choices');
    if (out.kind !== 'choices') return;
    expect(out.choices.length).toBeGreaterThanOrEqual(2);
    expect(out.choices.length).toBeLessThanOrEqual(MAX_CHOICES);
    expect(new Set(out.choices.map((c) => c.where)).size).toBe(2);       // two ends, two words
    for (const c of out.choices) expect(['north', 'south', 'east', 'west']).toContain(c.where);
  });

  it('"Seven Mile at Woodward" is the same question as "Woodward & 7 Mile"', () => {
    const a = resolveCrossing(map, 'Woodward & 7 Mile')!, b = resolveCrossing(map, 'Seven Mile at Woodward')!;
    expect(b.kind).toBe(a.kind);
    if (a.kind !== 'choices' || b.kind !== 'choices') return;
    expect(b.choices.length).toBe(a.choices.length);
  });

  it('one street name is answered with the middle of it, and said to be that', () => {
    const out = resolveCrossing(map, 'Woodward Ave')!;
    expect(out.kind).toBe('street');
    if (out.kind !== 'street') return;
    expect(out.point.lat).toBeGreaterThan(42.3);
    expect(out.point.lat).toBeLessThan(42.46);
  });

  it('a street nobody has is said to be unknown, by name — never guessed at', () => {
    const out = resolveCrossing(map, 'Nonesuch and Woodward')!;
    expect(out).toEqual({ kind: 'unknown', unknown: 'Nonesuch' });
  });

  it('every answer is inside the four cities, so a typed junction can never throw the map off', () => {
    for (const q of ['Woodward and Warren', 'Gratiot and Mack', 'Michigan and Livernois', 'Woodward']) {
      const out = resolveCrossing(map, q)!;
      const points = out.kind === 'point' || out.kind === 'street' ? [out.point] : out.kind === 'choices' ? out.choices.map((c) => c.point) : [];
      for (const p of points) {
        expect(positionOutcome(p.lat, p.lon), q).toBe('inside');
      }
    }
  });
});

describe('what the typed text is allowed to become', () => {
  it('it is a variable, and it is never written down or sent', () => {
    // The same rule the search box lives under (docs/08). `crossText` may only ever be assigned and read.
    expect(main).toMatch(/let crossOpen = false, crossText = '', crossOut: CrossOutcome \| null = null/);
    expect(main).not.toMatch(/idbSet\([^)]*cross/);
    expect(main).not.toMatch(/hashFor[\s\S]{0,80}cross/);
    // Nothing in the finder itself can reach storage, the network or the router.
    const finder = src('intersections.ts');
    for (const forbidden of ['./data.js', 'fetch(', 'idbGet', 'idbSet', 'localStorage', 'location.']) expect(finder, forbidden).not.toContain(forbidden);
  });
  it('the cache holds normalised names only, never the line as it was typed', () => {
    const finder = src('intersections.ts');
    expect(finder).toContain('const key = `${na.dir}:${na.name}|${nb.dir}:${nb.name}`;');
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. The opening rule
// ---------------------------------------------------------------------------------------------------

describe('what a map that opens on "where you are" does', () => {
  // (a) a location known -> two miles round the person. (b) otherwise the card, which now offers three
  // choices. (c) otherwise the anchor, at the same two miles.
  const CASES: [string, boolean, LocatePermission, boolean, string][] = [
    ['a ZIP already typed wins over everything', false, 'prompt', true, 'centreOnZip'],
    ['permission already given needs no card', false, 'granted', false, 'centreOnPerson'],
    ['permission already refused would make the card a dead end', false, 'denied', false, 'none'],
    ['a card already answered is not asked again', true, 'prompt', false, 'none'],
    ['otherwise: the card, once', false, 'prompt', false, 'showCard'],
    ['a browser that cannot say: the card, once', false, 'unknown', false, 'showCard'],
  ];
  for (const [what, answered, permission, zip, want] of CASES) {
    it(what, () => expect(firstOpenAction(answered, permission, zip)).toBe(want));
  }

  it('every opening view is two miles: the person, or the anchor', () => {
    expect(openingView({ lat: 42.36, lon: -83.07 }).radiusMeters).toBe(LOCATE_RADIUS_M);
    expect(openingView(null).radiusMeters).toBe(ANCHOR_RADIUS_M);
    expect(ANCHOR_RADIUS_M).toBe(LOCATE_RADIUS_M);
  });

  it('the anchor is City Hall, moved 0.6 mile up Woodward so the box is not a third river', () => {
    expect(MAP_ANCHOR.lat).toBeGreaterThan(CITY_HALL.lat);
    // Two miles south of the anchor is still north of the Ambassador Bridge's reach of the river, which is
    // what the nudge is for: the old centre put a third of the box on Windsor and on the hatching.
    expect(MAP_ANCHOR.lat - ANCHOR_RADIUS_M / 111320).toBeGreaterThan(CITY_HALL.lat - 2600 / 111320);
  });

  it('the card offers the third way in, and "Type a cross street" counts as an answer to it', () => {
    const locate = src('locate.ts');
    expect(locate).toContain(`data-locate="cross"`);
    expect(locate).toContain("if (answer === 'cross') { deps.close(); deps.cross?.(); deps.remember(); return; }");
  });

  it('the ask no longer gives up at ten seconds: it says so, and can be stopped', () => {
    const locate = src('locate.ts');
    expect(locate).toContain('export const LOCATE_SLOW_MS = 10000;');
    expect(locate).toContain('timeout: 300000');
    expect(main).toContain("locSlow = true; redraw(); announce(t('loc.slow'));");
    expect(main).toContain('function stopLocating(): void {');
    // Cancelling really stops us listening, so a fix that lands after the person typed a cross street cannot
    // move the map out from under them.
    expect(locate).toContain('geo.getCurrentPosition((p) => { if (!live) return; done(); ok(p); }');
  });

  it('the slow state leaves both the ways in that need no satellite on the screen', () => {
    // `locChip` draws the banner, then "Use my location", then the cross-street box, then the ZIP box.
    const chip = main.slice(main.indexOf('function locChip()'), main.indexOf('const searchBtn'));
    expect(chip.indexOf('slowBanner()')).toBeLessThan(chip.indexOf('crossBox()'));
    expect(chip.indexOf('crossBox()')).toBeLessThan(chip.indexOf('${zip}'));
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. The Map tab's first open
// ---------------------------------------------------------------------------------------------------

describe('the Map tab opens with help on it (audit H2)', () => {
  it('every help layer is on', () => {
    for (const g of MAP_GROUPS) expect(DEFAULT_LAYERS, g.id).toContain('help:' + g.id);
  });
  it('parks are on; the greenway, the outlines and the bus routes are not', () => {
    expect(DEFAULT_LAYERS).toContain('place:parks');
    expect(DEFAULT_LAYERS).not.toContain('place:greenway');
    expect(DEFAULT_LAYERS).not.toContain('place:areas');
    expect(DEFAULT_LAYERS.filter((x) => x.startsWith('go:'))).toEqual([]);
  });
  it('a remembered choice still wins, and the default is only ever read when there is none', () => {
    const layers = src('layers.ts');
    expect(layers).toContain("return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [...DEFAULT_LAYERS];");
  });
  it('the layer menu puts parks before the greenway, and the outlines last', () => {
    const menu = main.slice(main.indexOf('const places = ['), main.indexOf('const go2 ='));
    expect(menu.indexOf("place:parks")).toBeLessThan(menu.indexOf("place:greenway"));
    expect(main).toContain("const areas = mapAreas().length ? [{ id: 'place:areas'");
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. The areas layer, and what a list of places may be ordered by
// ---------------------------------------------------------------------------------------------------

describe('the areas layer draws areas and nothing else', () => {
  it('it is handed outlines, and there is no path from a listing to it', () => {
    const areas = main.slice(main.indexOf('function mapAreas(): MapArea[] {'), main.indexOf('/** The outlines live in'));
    // The only two sources are the numbers file's own shapes.
    expect(areas).toContain('(d.areas ?? []).filter((a) => a.kind === \'city\'');
    expect(areas).toContain('d.neighborhoods.filter((h) => h.rings.length)');
    // Nothing about a listing, a dot or a category can reach it.
    for (const forbidden of ['bundle.rows', 'rank(', 'dots', 'category', 'lat:', 'mapDrawable']) expect(areas, forbidden).not.toContain(forbidden);
  });
  it('a MapArea carries a shape and a name, and no number at all', () => {
    const map = src('map.ts');
    expect(map).toContain('export interface MapArea { id: string; name: string; sub: string; rings: { lat: number; lon: number }[][]; go?: string }');
  });
  it('an outline is never filled by a value: only the tapped one is washed, and with the brand colour', () => {
    const map = src('map.ts');
    const pass = map.slice(map.indexOf('if (this.areas.length) {'), map.indexOf('// Transport layers a person switched on'));
    expect(pass).toContain("c.globalAlpha = 0.08; c.fillStyle = col.brand;");
    expect(pass.match(/c\.fill\(/g) ?? []).toHaveLength(1);              // exactly one fill, and it is the selection
  });
  it('the pick order puts an area behind everything a person came for, and ahead of a park', () => {
    const map = src('map.ts');
    const probe = map.slice(map.indexOf('private probe(q: { x: number; y: number }): Hit | null {'), map.indexOf('/** The smallest outline holding a world point'));
    const at = (needle: string) => probe.indexOf(needle);
    expect(at('this.spec.dots ?? []')).toBeLessThan(at('this.sub?.hit(q'));
    expect(at('this.sub?.hit(q')).toBeLessThan(at('for (const o of std) for (const pt of o.points)'));
    expect(at('for (const o of std) for (const pt of o.points)')).toBeLessThan(at('for (const g of this.segs)'));
    expect(at('for (const g of this.segs)')).toBeLessThan(at('const area = this.areaAt(X, Y);'));
    expect(at('const area = this.areaAt(X, Y);')).toBeLessThan(at('const park = !this.parksOn()'));
  });
  it('the most specific outline wins, so a Detroit neighborhood beats the Detroit outline', () => {
    const map = src('map.ts');
    expect(map).toContain('if (hit && (!found || a.size < found.size)) found = { area: a.area, size: a.size };');
  });
  it('the keyboard walks the greenway, then the areas, then the dots', () => {
    const walk = orderFeatures([
      { kind: 'dot' as const, route: 0, d: 5, id: 'd1' },
      { kind: 'area' as const, route: 0, d: 90, id: 'a1' },
      { kind: 'segment' as const, route: 2, d: 0, id: 's2' },
      { kind: 'area' as const, route: 0, d: 10, id: 'a2' },
      { kind: 'segment' as const, route: 1, d: 0, id: 's1' },
      { kind: 'dot' as const, route: 0, d: 1, id: 'd2' },
    ]);
    expect(walk.map((f) => f.id)).toEqual(['s1', 's2', 'a2', 'a1', 'd2', 'd1']);
  });
  it('the Areas tab opens on the map, with the areas on and nothing else', () => {
    expect(main).toContain("key: 'areastab'");
    const tab = main.slice(main.indexOf("key: 'areastab'"), main.indexOf("key: 'areastab'") + 200);
    for (const forbidden of ['dots:', 'overlays:', 'segments: true', 'subway:']) expect(tab, forbidden).not.toContain(forbidden);
  });
});

describe('what a list of places may be ordered by (docs/13, rule 1)', () => {
  const hood = (id: string, name: string, lat: number, lon: number): Hood => ({
    id, name, district: 1, center: [lat, lon], rings: [], years: {},
    help: { total: 0, by: {}, nearest_miles: {}, none_listed_yet: [], coverage_checked: true },
    places: { parks: 0, rec_centers: 0, greenway_open: 0 },
  });
  const list = [hood('a', 'Zebra', 42.40, -83.10), hood('b', 'Apple', 42.30, -83.00), hood('c', 'Middle', 42.35, -83.05)];

  it('"Nearest first" is one group, ordered by distance from the point and nothing else', () => {
    const g = groupHoods(list, 'near', { lat: 42.40, lon: -83.10 });
    expect(g).toHaveLength(1);
    expect(g[0]!.items.map((h) => h.name)).toEqual(['Zebra', 'Middle', 'Apple']);
  });
  it('with no point, "Nearest first" falls back to A to Z rather than inventing a distance', () => {
    expect(groupHoods(list, 'near', null).map((g) => g.items.map((h) => h.name))).toEqual(groupHoods(list, 'abc').map((g) => g.items.map((h) => h.name)));
  });
  it('the order is only ever offered when a point is known', () => {
    const hoods = src('hoods.ts');
    expect(hoods).toContain("${o.near ? radio('near', 'hood.order_near') : ''}");
    expect(main).toContain('hoodOrder = hoodOrderOf(el.dataset.hoodorder, !!here);');
  });
  it('no indicator can reach the ordering at all', () => {
    const find = src('hoodfind.ts');
    expect(find).not.toMatch(/\b(help|total|parks|sales|permits|blight|crashes|median)\b\s*[.[]/);
  });

  it('the parks list is nearest-first or A to Z, and never by acres or by kind of park', () => {
    expect(main).toContain('const parksInOrder = (): Park[] => [...(bundle?.parks ?? [])].sort((a, b) => (here ? milesBetween(here, a) - milesBetween(here, b) : a.name.localeCompare(b.name)));');
    const order = main.slice(main.indexOf('const parksInOrder'), main.indexOf('const parkRow'));
    for (const forbidden of ['acres', 'type', 'p.id']) expect(order, forbidden).not.toContain(forbidden);
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. Parks and paths, and the greenway's new weight
// ---------------------------------------------------------------------------------------------------

describe('one front door called Parks and paths (Kyle, direction b)', () => {
  it('every park is a row that opens a page', () => {
    expect(main).toContain("rowLink({ v: 'park', id: p.id }");
    expect(main).not.toContain('<div class="row static">');              // the 302 dead rows are gone
    expect(src('router.ts')).toContain("if (v.v === 'park') return `#/park/${v.id}`;");
  });
  it('the greenway is one row inside it, and its own screens are untouched', () => {
    const screen = main.slice(main.indexOf('function parksList(): string {'), main.indexOf('function parkPage('));
    expect(screen).toContain("rowLink({ v: 'greenway' }, 'path', t('gw.title'), t('rec.gw_row'");
    // Its screen and its 52 stretches still exist, with their condition reports.
    expect(main).toContain("else if (v.v === 'greenway')");
    expect(main).toContain("${s.phase === 'open' ? reportBox(s.id, true) : ''}");
  });
  it('Home offers Parks and paths where the greenway tile used to be', () => {
    const home = main.slice(main.indexOf('function homeTab()'), main.indexOf('function helpTab()'));
    expect(home).toContain(`<button class="tile" \${go({ v: 'parks' })}>`);
    expect(home).not.toContain("go({ v: 'greenway' })");
    expect(home).not.toContain("T('gw.title')");
  });
  it('a map draws the greenway only when it is asked to', () => {
    expect(main).toContain("const segments = o.segments ? bundle?.greenway?.segments ?? [] : [];");
    // Asked: the Map tab's layer, the greenway screen, a stretch, Parks and paths, a park beside a stretch.
    const asked = [...main.matchAll(/segments: ([^,)]+)/g)].map((m) => m[1]!.trim());
    // Five maps ask: the Map tab (its layer), the greenway screen, a stretch, Parks and paths, and a park page
    // whose park touches an open stretch. The sixth is the map LIST's own section, which is the same switch.
    expect(asked.sort()).toEqual([
      '!!gw', "layerOn('place:greenway'", "layerOn('place:greenway'", 'true', 'true }', 'true',
    ].sort());
    // Not asked: the results-list map, the listing detail map, the areas map, a neighbourhood outline.
    for (const key of ["key: 'list:'", "key: 'r:' + r.id", "key: 'areastab'"]) {
      const at = main.indexOf(key);
      expect(main.slice(at, at + 400), key).not.toContain('segments:');
    }
  });
  it('a listing names whichever of a park and a path is closer, within a quarter mile', () => {
    expect(main).toContain('export function nearestParkOrPath(at: { lat: number; lon: number })');
    expect(main).toContain('const MAX = 0.25;');
    expect(main).toContain("T('detail.near_place'");
  });
});

// ---------------------------------------------------------------------------------------------------
// 6. The cursor
// ---------------------------------------------------------------------------------------------------

describe('the mouse cursor on the map', () => {
  it('the hand and the click run the same hit test, so they can never disagree', () => {
    const map = src('map.ts');
    // One `probe`; `pick` acts on it and `hover` only asks whether it found anything.
    expect(map).toContain("const want = this.hoverAt && !this.pointers.size && this.probe(this.hoverAt) ? 'pointer' : '';");
    expect(map).toContain('const hit = this.probe(q);');
  });
  it('a finger is never charged for it, and a drag is not a hover', () => {
    const map = src('map.ts');
    expect(map).toContain("c.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') this.hover(at(e)); });");
    expect(map).toContain("this.hoverNow = '';                                  // a drag is not a hover");
  });
  it('it is worked out once a frame at most', () => {
    const map = src('map.ts');
    expect(map).toContain('if (this.hoverRaf) return;');
    expect(map).toContain('this.hoverRaf = requestAnimationFrame(');
    expect(map).toContain('if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf);');
  });
  it("an empty stretch of map hands the cursor back to the stylesheet's grab and grabbing", () => {
    const css = src('style.css');
    expect(css).toContain('cursor:grab;');
    expect(css).toContain('.mapframe canvas:active { cursor:grabbing; }');
  });
  it('everything else that answers a click says so too, and everything switched off says that', () => {
    const css = src('style.css');
    expect(css).toContain('summary { cursor:pointer; }');
    expect(css).toContain('input[type="checkbox"],input[type="radio"],select { cursor:pointer; }');
    expect(css).toContain('button:disabled,input:disabled,select:disabled,.pick:has(input:disabled) { cursor:default; }');
  });
});
