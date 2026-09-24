// Offline directions on the web (DECISIONS 2026-09-22): the wording contract, the traceless rule, the map
// overlay and the four languages.
//
// Held to what a person gets, not to the shape of the line that produces it. The wording table below is the
// contract the iPhone and the Android port mirror: if one of the three ever says something different about the
// same structured step, one of the three is wrong.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Itinerary, RideLeg, WalkLeg } from '@313help/query';
import { minutesRange } from '@313help/query';
import {
  OFF_ROUTE_M, currentStep, distance, headwayWords, itineraryTitle, legsLine, metresFromRoute, offStreet,
  rangeWords, routeName, routeText, steps, summary, towardName,
} from '../src/dirwords.js';
import { mapRoute } from '../src/dirscreen.js';
import { hashFor } from '../src/router.js';
import { orderFeatures } from '../src/map.js';
import { handle } from '../src/dirworker.js';
import { dirPayload } from '../src/directions.js';
import { SENSITIVE } from '../src/needs.js';

const root = join(__dirname, '../../..');
const LANGS = ['en', 'es', 'ar', 'bn'] as const;
const table = (l: string) => JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
const TABLES = Object.fromEntries(LANGS.map((l) => [l, table(l)])) as Record<(typeof LANGS)[number], Record<string, string>>;
/** The app's own `t`, for one language, with the same fallback rule i18n.ts uses. */
const say = (l: (typeof LANGS)[number]) => (key: string, p: Record<string, string | number> = {}) =>
  (TABLES[l][key] ?? TABLES.en[key] ?? key).replace(/\{(\w+)\}/g, (_: string, k: string) => String(p[k] ?? ''));
const t = say('en');

// ---------------------------------------------------------------------------------------------------
// A fixture plan. Exactly the shapes `packages/query` returns, by hand, so nothing here needs a bundle.
// ---------------------------------------------------------------------------------------------------
const walkLeg = (metres: number, stepsIn: WalkLeg['steps'], line: [number, number][], ends: Partial<WalkLeg> = {}): WalkLeg =>
  ({ kind: 'walk', metres, minutes: metres / 80, steps: stepsIn, polyline: line, ...ends });
const rideLeg = (over: Partial<RideLeg> = {}): RideLeg => ({
  kind: 'ride', route_id: 'rt_ddot_4', route_short: '4', route_long: 'Woodward', agency: 'DDOT',
  headway_minutes: 15, from_stop: { index: 1, name: 'Woodward & Warren' }, to_stop: { index: 10, name: 'Woodward & Grand Blvd' },
  stops: 9, metres: 2800, minutes: 10, wait_minutes: 7.5,
  polyline: [[-83.066, 42.355], [-83.072, 42.368], [-83.074, 42.370]], ...over,
});
function finish(legs: Itinerary['legs'], endOff = 40): Itinerary {
  const walk = legs.filter((l) => l.kind === 'walk').reduce((n, l) => n + l.metres, 0);
  const ride = legs.filter((l) => l.kind === 'ride').reduce((n, l) => n + l.metres, 0);
  const minutes = legs.reduce((n, l) => n + l.minutes, 0) + legs.filter((l) => l.kind === 'ride').reduce((n, l) => n + (l as RideLeg).wait_minutes, 0);
  return { legs, changes: Math.max(0, legs.filter((l) => l.kind === 'ride').length - 1), walk_metres: walk, ride_metres: ride, minutes, range: minutesRange(minutes), start_off_metres: 12, end_off_metres: endOff };
}
const WALK_ONLY = finish([walkLeg(1930, [
  { street: 'Woodward Ave', bearing: 'north', turn: null, metres: 480 },
  { street: 'Warren Ave', bearing: 'west', turn: 'left', metres: 1290 },
  { street: 'Yellowstone St', bearing: 'north', turn: 'right', metres: 160 },
], [[-83.0458, 42.3314], [-83.0500, 42.3400], [-83.0600, 42.3450]])]);
const BUS = finish([
  walkLeg(480, [{ street: 'Woodward Ave', bearing: 'north', turn: null, metres: 480 }], [[-83.0458, 42.3314], [-83.0466, 42.3355]], { to_stop: { index: 1, name: 'Woodward & Warren' } }),
  rideLeg(),
  walkLeg(160, [{ street: 'Yellowstone St', bearing: 'west', turn: null, metres: 160 }], [[-83.074, 42.370], [-83.0755, 42.3705]], { from_stop: { index: 10, name: 'Woodward & Grand Blvd' } }),
]);

// ---------------------------------------------------------------------------------------------------
// The wording contract
// ---------------------------------------------------------------------------------------------------
describe('what a trip plan is allowed to say (schema/query-spec.md "Trip plans")', () => {
  it('the estimate is always a RANGE, never a single number and never a clock time', () => {
    expect(rangeWords(t, WALK_ONLY)).toBe(`about ${WALK_ONLY.range[0]}–${WALK_ONLY.range[1]} min`);
    for (const it of [WALK_ONLY, BUS]) {
      const said = summary(t, it);
      expect(said).toContain('–');
      expect(said).toMatch(/about \d+–\d+ min/);
      // no clock time, ever: nothing that looks like 7:45, am/pm, or an arrival
      expect(said).not.toMatch(/\d{1,2}:\d{2}/);
      expect(said).not.toMatch(/\b(am|pm|arrive|arrival)\b/i);
    }
  });

  it('a headway is the agency\'s own sentence, and only when the agency published one', () => {
    expect(headwayWords(t, BUS)).toBe('about every 15 min');
    const noHeadway = finish([BUS.legs[0]!, rideLeg({ headway_minutes: null }), BUS.legs[2]!]);
    expect(headwayWords(t, noHeadway)).toBe('');
    // our ASSUMED wait is never on screen, in any form
    expect(summary(t, noHeadway)).not.toContain('15');
    expect(summary(t, BUS)).not.toContain('7.5');
  });

  it('never says safe, accessible, lit or step-free — about a leg, a route or the whole trip', () => {
    const forbidden = /\b(safe|safer|safety|accessible|accessibility|lit|lighting|step-free|wheelchair)\b/i;
    const every = [summary(t, WALK_ONLY), summary(t, BUS), routeText(t, BUS), ...steps(t, BUS, 'Auntie Na\'s Village').map((s) => s.text)];
    for (const line of every) expect(line, line).not.toMatch(forbidden);
    // and neither does any string the screen can reach, in any language
    for (const l of LANGS) for (const [k, v] of Object.entries(TABLES[l])) {
      if (!k.startsWith('dir.')) continue;
      if (k === 'dir.caveat') continue;                    // the one line whose whole job is to say we did NOT check
      expect(`${l} ${k}: ${v}`, `${l} ${k}`).not.toMatch(/\b(safe|accessible|step-free|wheelchair)\b/i);
    }
  });

  it('the last thing a person is told is the street, not the door', () => {
    const list = steps(t, BUS, 'Auntie Na\'s Village');
    expect(list[list.length - 1]!.text).toBe('Then about 40 m to the building');
    expect(offStreet(t, 40.4)).toBe('40 m');
    // under five metres there is nothing to say
    expect(steps(t, finish(BUS.legs, 2), 'X').some((s) => s.text.includes('to the building'))).toBe(false);
  });

  it('a walking distance never reads as no distance at all', () => {
    expect(distance(t, 1609.344)).toBe('1.0 mi');
    expect(distance(t, 480)).toBe('0.3 mi');
    expect(distance(t, 12)).toBe('0.1 mi');                // a leg that rounds to 0.0 is still a walk somebody does
  });

  it('a bus is called what its rider reads off the front of it, and its direction is the agency\'s own words', () => {
    expect(routeName(rideLeg())).toBe('4');
    expect(towardName(rideLeg())).toBe('Woodward');
    expect(routeName(rideLeg({ route_short: '', route_long: '' }))).toBe('rt_ddot_4');
    expect(towardName(rideLeg({ route_long: '4' }))).toBe('');
  });
});

describe('the step list, which is the source of truth for the whole screen', () => {
  it('reads as the spec\'s own example: streets, turns, boarding, riding, getting off, the street outside', () => {
    expect(steps(t, BUS, 'Auntie Na\'s Village').map((s) => s.text)).toEqual([
      'Walk north on Woodward Ave for 0.3 mi',
      'Walk 0.3 mi to Woodward & Warren',
      'Board the 4 at Woodward & Warren toward Woodward',
      'Ride 9 stops to Woodward & Grand Blvd',
      'Get off at Woodward & Grand Blvd',
      'Walk west on Yellowstone St for 0.1 mi',
      'Walk 0.1 mi to Auntie Na\'s Village',
      'Then about 40 m to the building',
    ]);
  });

  it('a pure walk is turn by turn, and the first step never has a turn word', () => {
    expect(steps(t, WALK_ONLY, 'Auntie Na\'s Village').map((s) => s.text)).toEqual([
      'Walk north on Woodward Ave for 0.3 mi',
      'Turn left onto Warren Ave and walk 0.8 mi',
      'Turn right onto Yellowstone St and walk 0.1 mi',
      'Walk 1.2 mi to Auntie Na\'s Village',
      'Then about 40 m to the building',
    ]);
  });

  it('one stop is "1 stop", never "1 stops"', () => {
    const one = finish([BUS.legs[0]!, rideLeg({ stops: 1 }), BUS.legs[2]!]);
    expect(steps(t, one, 'X').map((s) => s.text)).toContain('Ride 1 stop to Woodward & Grand Blvd');
    expect(legsLine(t, one)).toContain('ride 1 stop');
  });

  it('every step says which leg it belongs to, so the map can show where a person is', () => {
    const list = steps(t, BUS, 'X');
    expect(list.map((s) => s.leg)).toEqual([0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('every sentence is a real sentence in all four languages: no key leaks, no empty placeholder', () => {
    for (const l of LANGS) {
      const l_ = say(l);
      for (const it of [WALK_ONLY, BUS]) for (const s of steps(l_, it, 'Auntie Na\'s Village')) {
        expect(s.text, `${l}: ${s.text}`).not.toMatch(/^dir\./);        // a missing key never reaches a screen
        expect(s.text, `${l}: ${s.text}`).not.toMatch(/\{\w+\}/);       // no placeholder left unfilled
        expect(s.text.trim().length, `${l}: ${s.text}`).toBeGreaterThan(4);
        // a turn or a compass word that fell back to its key would show as "dir.turn.left" inside a sentence
        expect(s.text, `${l}: ${s.text}`).not.toContain('dir.');
      }
      // the card's own line, too
      for (const it of [WALK_ONLY, BUS]) {
        expect(summary(l_, it), l).not.toContain('dir.');
        expect(summary(l_, it), l).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('the turn and compass words are translated, not left in English, in every language', () => {
    for (const l of ['es', 'ar', 'bn'] as const) {
      for (const k of ['dir.turn.left', 'dir.turn.right', 'dir.bearing.north', 'dir.bearing.west']) {
        expect(TABLES[l][k], `${l} ${k}`).toBeTypeOf('string');
        expect(TABLES[l][k], `${l} ${k}`).not.toBe(TABLES.en[k]);
      }
    }
  });

  it('there are no arrow glyphs in any language: a turn is a WORD, so nothing has to mirror in Arabic', () => {
    for (const l of LANGS) for (const [k, v] of Object.entries(TABLES[l])) {
      if (!k.startsWith('dir.')) continue;
      expect(v, `${l} ${k}`).not.toMatch(/[←→↑↓⬅➡⬆⬇↰↱⤴⤵]/);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// The traceless rule: nothing about a route or an origin reaches IndexedDB, the URL or the history
// ---------------------------------------------------------------------------------------------------
describe('nothing about where somebody is, or is going, is ever written down', () => {
  const never = () => false;

  it('the Directions screen has no address at all: no hash, so no URL, no history entry, no title', () => {
    expect(hashFor({ v: 'directions', to: { lat: 42.33, lon: -83.05 }, name: 'Capuchin Soup Kitchen' }, never)).toBeNull();
    // the same answer as the urgent sheet and a private listing, and it does not depend on the destination
    expect(hashFor({ v: 'directions', to: { lat: 42.45, lon: -82.99 }, name: '' }, never)).toBeNull();
    expect(hashFor({ v: 'urgent' }, never)).toBeNull();
  });

  it('nothing in the directions code writes to storage, the URL, the history, or the network', () => {
    for (const file of ['dirscreen.ts', 'dirwords.ts', 'dirworker.ts']) {
      const src = readFileSync(join(__dirname, '../src/' + file), 'utf8');
      for (const forbidden of ['idbSet(', 'localStorage', 'sessionStorage', 'pushState', 'replaceState', 'location.hash', 'document.cookie', 'navigator.sendBeacon', 'XMLHttpRequest']) {
        expect(src, `${file} must not use ${forbidden}`).not.toContain(forbidden);
      }
      // `fetch` is only ever the bundle's own verified files, and only from dirfiles.ts
      expect(src, `${file} must not fetch`).not.toMatch(/\bfetch\(/);
    }
  });

  // The file loader (only the bundle's own map files, through the signed index; the file itself is all it keeps)
  // is driven in dirfiles.test.ts, and following along (one watch, ended by every way off the screen) in
  // dirscreen-follow.test.ts.

  it('the payload a Directions button carries is the destination, and nothing else', () => {
    const p = dirPayload('Auntie Na\'s Village', 42.377, -83.135, 'food.pantry');
    expect(JSON.parse(p!)).toEqual({ lat: 42.377, lon: -83.135, name: 'Auntie Na\'s Village' });   // exactly these keys
    // a coordinate is enough: a place with no street address a person could read out still gets directions
    expect(dirPayload('Naloxone box', 42.35, -83.06, 'harm.naloxone')).toBeDefined();
  });

  it('fails closed: no coordinate, or a sensitive kind, and there is no button at all', () => {
    expect(dirPayload('X', undefined, -83.05, 'food.pantry')).toBeUndefined();
    expect(dirPayload('X', 42.33, undefined, 'food.pantry')).toBeUndefined();
    // A DV shelter or a crisis line carries no coordinate in the first place; if one were ever handed over, the
    // gate still refuses it.
    expect(SENSITIVE.length).toBeGreaterThan(0);
    for (const kind of SENSITIVE) expect(dirPayload('X', 42.33, -83.05, kind), kind).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------
// The cards, the overlay and the keyboard
// ---------------------------------------------------------------------------------------------------
describe('the cards a person picks from', () => {
  it('names the shape of the trip: what to walk, what to ride, how long, how often', () => {
    expect(itineraryTitle(t, WALK_ONLY)).toBe('Walk');
    expect(itineraryTitle(t, BUS)).toBe('Bus 4');
    expect(legsLine(t, BUS)).toBe('walk 0.3 mi, ride 9 stops, walk 0.1 mi');
    expect(summary(t, BUS)).toBe(`Bus 4 · walk 0.3 mi, ride 9 stops, walk 0.1 mi · about ${BUS.range[0]}–${BUS.range[1]} min · about every 15 min`);
  });

  it('a one-change plan names both buses', () => {
    const two = finish([BUS.legs[0]!, rideLeg(), walkLeg(100, [], [[-83.07, 42.36], [-83.071, 42.361]]), rideLeg({ route_short: '16', route_long: 'Dexter' }), BUS.legs[2]!]);
    expect(itineraryTitle(t, two)).toBe('Bus 4, then bus 16');
    expect(two.changes).toBe(1);
  });
});

describe('the route drawn on the map', () => {
  const route = mapRoute(t, BUS, 'Auntie Na\'s Village', 1);

  it('draws one line per leg, in the order they are walked', () => {
    expect(route.legs).toHaveLength(BUS.legs.length);
    expect(route.legs.map((l) => l.kind)).toEqual(['walk', 'ride', 'walk']);
    expect(route.legs.map((l) => l.polyline.length)).toEqual(BUS.legs.map((l) => l.polyline.length));
  });

  it('a walking leg is solid in its own tone; a ride wears its agency\'s layer tone and a dash', () => {
    expect(route.legs[0]!.css).toBe('--route-walk');
    expect(route.legs[0]!.dash).toBeUndefined();
    expect(route.legs[1]!.css).toBe('--lyr-bus');                        // DDOT
    expect(route.legs[1]!.dash).toEqual([2.2, 1.4]);                     // never colour alone (1.4.1)
    expect(mapRoute(t, finish([BUS.legs[0]!, rideLeg({ agency: 'SMART' }), BUS.legs[2]!]), 'X', -1).legs[1]!.css).toBe('--lyr-smart');
  });

  it('marks the start, the end, and every place a bus is got on or off', () => {
    expect(route.marks.map((m) => m.kind)).toEqual(['start', 'board', 'alight', 'end']);
    expect(route.marks.map((m) => m.sub)).toEqual(['', 'Woodward & Warren', 'Woodward & Grand Blvd', 'Auntie Na\'s Village']);
    // a start marker really is the start of the first leg's line, not the person's own coordinate
    expect([route.marks[0]!.lon, route.marks[0]!.lat]).toEqual(BUS.legs[0]!.polyline[0]);
  });

  it('has a text equivalent that says the same thing the line says (1.1.1)', () => {
    expect(route.text).toContain(legsLine(t, BUS));
    expect(route.text).toContain(rangeWords(t, BUS));
    expect(route.text).not.toMatch(/\{\w+\}/);
    for (const l of LANGS) expect(routeText(say(l), BUS), l).not.toContain('dir.');
  });

  it('the map\'s N and P reach the route\'s own stops first, in the order they happen', () => {
    const list = [
      { kind: 'dot' as const, label: 'A pantry', route: 0, d: 10 },
      { kind: 'stop' as const, label: 'End', route: 3, d: 200 },
      { kind: 'area' as const, label: 'Midtown', route: 0, d: 5 },
      { kind: 'stop' as const, label: 'Start', route: 0, d: 400 },
      { kind: 'segment' as const, label: 'Dequindre Cut', route: 0, d: 0 },
    ];
    expect(orderFeatures(list).map((f) => f.label)).toEqual(['Start', 'End', 'Dequindre Cut', 'Midtown', 'A pantry']);
  });
});

describe('following along, and what it will not do', () => {
  it('knows how far off the line a person is, in metres', () => {
    const line = BUS.legs[0]!.polyline;
    expect(metresFromRoute({ lat: line[0]![1], lon: line[0]![0] }, [line])).toBeCloseTo(0, 0);
    expect(metresFromRoute({ lat: 42.40, lon: -83.20 }, [line])).toBeGreaterThan(OFF_ROUTE_M);
  });

  it('says which step a person is on, from which leg they are standing on', () => {
    const list = steps(t, BUS, 'X');
    const onTheBus = BUS.legs[1]!.polyline[1]!;
    expect(list[currentStep({ lat: onTheBus[1], lon: onTheBus[0] }, BUS, list)]!.leg).toBe(1);
    const atTheStart = BUS.legs[0]!.polyline[0]!;
    expect(list[currentStep({ lat: atTheStart[1], lon: atTheStart[0] }, BUS, list)]!.leg).toBe(0);
  });

  // "Never reroutes: an off-route position only offers to plan again" is driven in dirscreen-follow.test.ts.
});

// ---------------------------------------------------------------------------------------------------
// Offline, and the Worker
// ---------------------------------------------------------------------------------------------------
describe('offline: the Worker is handed files, and never goes looking for any', () => {
  it('plans nothing before it has been built, and says so rather than throwing', () => {
    expect(handle({ type: 'plan', id: 1, from: { lat: 42.33, lon: -83.05 }, to: { lat: 42.34, lon: -83.06 } }))
      .toEqual({ type: 'error', id: 1, message: 'not built' });
  });

  it('a phone with no street files at all is told so, not handed an empty graph', () =>
    expect(handle({ type: 'build', id: 9, streets: [], layers: [] })).toMatchObject({ type: 'error', message: 'no streets' }));

  it('a phone with the streets and no transit files still gets walking directions', () => {
    // Two short streets that cross, in the bundle's own packed shape, and no transit layer at all.
    const streets = [{
      origin: [-83.05, 42.33] as [number, number], names: ['Woodward Ave', 'Warren Ave'],
      roads: [
        [3, 0, [0, 0, 0, 200]],
        [3, 1, [0, 100, 200, 0]],
      ] as [number, number, number[]][],
    }];
    const ready = handle({ type: 'build', id: 2, streets, layers: [] });
    expect(ready.type).toBe('ready');
    expect(ready).toMatchObject({ transit: false });
    const out = handle({ type: 'plan', id: 3, from: { lat: 42.33, lon: -83.05 }, to: { lat: 42.331, lon: -83.05 } });
    expect(out.type).toBe('plans');
    expect((out as { plans: Itinerary[] }).plans.length).toBeGreaterThan(0);
    for (const p of (out as { plans: Itinerary[] }).plans) expect(p.legs.every((l) => l.kind === 'walk')).toBe(true);
  });

  it('the Worker never imports anything that could reach the network', () => {
    const src = readFileSync(join(__dirname, '../src/dirworker.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\(|importScripts|XMLHttpRequest/);
    // it imports the shared rules and nothing of the app's own
    expect([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['@313help/query']);
  });

  it('the lazily loaded chunk and its Worker are handed to the service worker to keep', () => {
    const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    const sw = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
    // sw.js's one message contract, unchanged
    expect(sw).toContain("e.data.type === 'cache' && Array.isArray(e.data.urls)");
    expect(sw).toContain("/^\\/(data|v1|admin)(\\/|$)/");                // it never caches the bundle or the API
    // and main.ts posts it again the moment the directions chunk lands, so the SECOND tap works with no signal
    expect(main).toContain('function precacheNow()');
    expect(main).toMatch(/dirMod = m; dirState = '';\s*\n[\s\S]{0,400}precacheNow\(\);/);
  });
});

// ---------------------------------------------------------------------------------------------------
// The entry points
// ---------------------------------------------------------------------------------------------------
describe('where a person can ask for directions', () => {
  const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');

  it('a listing\'s own screen leads with ours; the three link-outs move below it, unchanged', () => {
    const detail = main.slice(main.indexOf('function detail(id: string)'), main.indexOf('// Maps (map.ts)'));
    expect(detail.indexOf('dirButton(r.name, r.lat, r.lon, r.category, true)')).toBeLessThan(detail.indexOf("T('dir.other_apps')"));
    expect(detail.indexOf("T('dir.other_apps')")).toBeLessThan(detail.indexOf('goHere(r)!'));
    // the link-outs themselves still hand over the destination and nothing else (CLAUDE.md)
    expect(detail).toContain('transitHref(r)!');
    expect(detail).toContain('busApp(r)!');
  });

  it('every results row with a place, the "Get somewhere safe now" list included, offers one', () => {
    // `card()` is what every ranked list draws, including the urgent sheet's safe_now screen, so one button
    // added there is a button on all of them.
    const card = main.slice(main.indexOf('function card(r: Ranked'), main.indexOf('function results('));
    expect(card).toContain('dirButton(r.row.name, r.row.lat, r.row.lon, r.row.category)');
  });

  it('a dot on the map carries its own destination, so the bottom card has the button', () => {
    expect(main.match(/dirPayload\(/g) ?? []).toHaveLength(4);           // the button, and three sets of dots
    const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
    expect(mapSrc).toContain('export const dirBtn =');
    expect(mapSrc).toContain('data-dir="${esc(dir)}"');
  });

  it('the cross-street field comes first on the Directions screen, and nowhere else', () => {
    expect(main).toContain('function locChip(crossFirst = false)');
    expect(main).toContain('originHtml: () => locChip(true)');
    expect((main.match(/locChip\(true\)/g) ?? []).length).toBe(1);
  });
});

describe('the whole screen, drawn', () => {
  /** The deps main.ts hands down, with nothing real behind them. */
  const deps = (over: Record<string, unknown> = {}) => ({
    t, esc: (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)),
    icon: () => '', mapBox: () => '<div class="mapbox"></div>', announce: vi.fn(), rerender: vi.fn(),
    origin: () => ({ lat: 42.3314, lon: -83.0458 }), originKind: () => 'me' as const, originWords: () => '',
    originHtml: () => '<div class="loc"></div>', index: { files: {} } as never, transit: undefined,
    centre: () => true, ...over,
  });

  it('with no origin it asks for one, cross street first, and plans nothing', async () => {
    const m = await import('../src/dirscreen.js');
    m.reset();
    m.open({ lat: 42.377, lon: -83.135, name: 'Auntie Na\'s Village' }, deps({ origin: () => null, originKind: () => 'none' }) as never);
    const out = m.html(deps({ origin: () => null, originKind: () => 'none' }) as never);
    expect(m.state().phase).toBe('need_origin');
    expect(out).toContain('Where are you starting?');
    expect(out).toContain('Type two streets that cross. This works with no signal.');
    expect(out).toContain('<div class="loc"></div>');
    m.reset();
  });

  it('says the two caveats at the top, in the spec\'s own words, on every state of the screen', async () => {
    const m = await import('../src/dirscreen.js');
    m.reset();
    m.open({ lat: 42.377, lon: -83.135, name: 'X' }, deps({ origin: () => null, originKind: () => 'none' }) as never);
    const out = m.html(deps({ origin: () => null, originKind: () => 'none' }) as never);
    expect(out).toContain('Directions are computed on your phone from public maps. They are not checked for safety or lighting. If a street looks wrong, use another.');
    expect(out).toContain('Times are estimates. Buses may come more or less often.');
    m.reset();
  });
});
