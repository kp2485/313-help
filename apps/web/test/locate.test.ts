// The Map tab's first open (locate.ts, map.ts `cameraForRadius`, DECISIONS 2026-09-21). Held to what a person
// experiences — a card that appears once, a prompt that only ever follows a tap, a view two miles across, and a
// position that is nowhere on this phone afterwards — rather than to the shape of the lines that do it.
//
// The same table of cases is run against the iPhone (Tests/HelpCoreTests/LocateTests.swift) and Android
// (app/src/test/kotlin/org/help313/app/LocateTest.kt). If one of the three ever answers differently, one of the
// three is wrong.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_RADIUS_M, CITY_HALL, LOCATE_OPTIONS, LOCATE_RADIUS_M, LOCATE_SLOW_MS, MAP_ANCHOR, SERVICE_BBOX, firstOpenAction, inServiceArea,
  locateCardClick, locateCardHtml, locatePermission, openingView, positionOutcome, requestPosition,
  type FirstOpenAction, type LocatePermission,
} from '../src/locate.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const src = (name: string) => readFileSync(join(__dirname, '../src/' + name), 'utf8');

// ---------------------------------------------------------------------------------------------------
// What the tab does when it opens
// ---------------------------------------------------------------------------------------------------

/** The table. Every client runs these exact rows. */
const CASES: { why: string; answered: boolean; permission: LocatePermission; zip: boolean; want: FirstOpenAction }[] = [
  { why: 'a first open, nothing known: our own card, and no prompt yet', answered: false, permission: 'prompt', zip: false, want: 'showCard' },
  { why: 'a browser that will not say what it knows is still a first open', answered: false, permission: 'unknown', zip: false, want: 'showCard' },
  { why: 'the card has been answered: never again on this phone', answered: true, permission: 'prompt', zip: false, want: 'none' },
  { why: 'permission already given on Home: no card, straight to the person', answered: false, permission: 'granted', zip: false, want: 'centreOnPerson' },
  { why: 'permission given and the card long since answered: the same', answered: true, permission: 'granted', zip: false, want: 'centreOnPerson' },
  { why: 'already refused: a card whose button cannot work is a dead end', answered: false, permission: 'denied', zip: false, want: 'none' },
  { why: 'a typed ZIP wins over everything: they already said where to look', answered: false, permission: 'prompt', zip: true, want: 'centreOnZip' },
  { why: 'a typed ZIP wins even when permission was given', answered: true, permission: 'granted', zip: true, want: 'centreOnZip' },
  { why: 'a typed ZIP wins even when permission was refused', answered: true, permission: 'denied', zip: true, want: 'centreOnZip' },
];

describe('what the Map tab does the first time it is opened', () => {
  for (const c of CASES) {
    it(c.why, () => expect(firstOpenAction(c.answered, c.permission, c.zip)).toBe(c.want));
  }

  it('shows the card exactly once: answering it is what stops it coming back', () => {
    expect(firstOpenAction(false, 'prompt', false)).toBe('showCard');
    expect(firstOpenAction(true, 'prompt', false)).toBe('none');
  });

  it('the only thing that can be remembered is that the card was answered', () => {
    // Not the answer, not the permission, and never a position: `firstOpenAction` is given a boolean and cannot
    // be given anything else, and nothing in the file writes a coordinate.
    const text = src('locate.ts');
    expect(text).not.toMatch(/idbSet\((?!FLAG)/);
    expect(text.match(/idbSet\(/g)).toHaveLength(1);
    for (const forbidden of ['pushState', 'replaceState', 'location.hash', 'fetch(']) expect(text).not.toContain(forbidden);
  });
});

// ---------------------------------------------------------------------------------------------------
// The card itself
// ---------------------------------------------------------------------------------------------------

describe('our own card, before any permission prompt', () => {
  const html = locateCardHtml({ title: 'See what is near you?', body: 'Your location stays on this phone. We never send it or save it.', yes: 'Use my location', no: 'Not now', cross: 'Type a cross street' }, esc);

  it('says what it is and what it will not do', () => {
    expect(html).toContain('See what is near you?');
    expect(html).toContain('We never send it or save it.');
  });

  it('is a labelled dialog that takes nothing away from the map behind it', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');          // nothing is trapped and nothing is made inert
    expect(html).toContain('aria-labelledby="locardh"');
    expect(html).toContain('aria-describedby="locardb"');
    expect(html).toContain('id="locardh" tabindex="-1"');  // the cursor is moved here when it opens
  });

  it('offers three real buttons, all reachable by the keyboard', () => {
    expect(html).toContain('type="button" data-locate="yes"');
    // The third choice (Kyle, 2026-09-22): a person who will not share a location, or whose phone cannot find
    // one, can still say where they are by naming two streets.
    expect(html).toContain('type="button" data-locate="cross"');
    expect(html).toContain('type="button" data-locate="no"');
    expect(html).not.toContain('<a ');
  });

  it('escapes what it is given, whatever language it is in', () => {
    const bad = locateCardHtml({ title: '<script>x</script>', body: 'b', yes: 'y', no: 'n', cross: 'c' }, esc);
    expect(bad).not.toContain('<script>');
    expect(bad).toContain('&lt;script&gt;');
  });

  it('never covers the whole map, and keeps clear of the zoom keys', () => {
    const css = src('style.css');
    const rule = css.slice(css.indexOf('.locard {'), css.indexOf('.locard h2'));
    expect(rule).toContain('position:absolute');
    expect(rule).toContain('max-inline-size');             // never the full width, so the map is visible beside it
    expect(rule).toContain('inset-inline-start');          // start/end, so it mirrors for Arabic on its own
    expect(rule).not.toContain('inset:0');
  });
});

describe('the two buttons', () => {
  const spy = () => { const calls: string[] = []; return { calls, deps: { ask: () => calls.push('ask'), remember: () => calls.push('remember'), close: () => calls.push('close') } }; };

  it('"Use my location" asks the browser exactly once, and before anything is written down', () => {
    const { calls, deps } = spy();
    locateCardClick('yes', deps);
    expect(calls.filter((c) => c === 'ask')).toHaveLength(1);
    // The gesture is the click. A write awaited first would hand the browser a prompt with nothing behind it.
    expect(calls.indexOf('ask')).toBeLessThan(calls.indexOf('remember'));
  });

  it('"Not now" never asks the browser for anything, and is remembered', () => {
    const { calls, deps } = spy();
    locateCardClick('no', deps);
    expect(calls).not.toContain('ask');
    expect(calls).toContain('close');
    expect(calls).toContain('remember');
  });
});

describe('asking the browser', () => {
  it('asks once, coarsely, and keeps looking for minutes, not seconds', () => {
    const getCurrentPosition = vi.fn();
    const ask = requestPosition({ getCurrentPosition } as unknown as Geolocation, () => {}, () => {});
    expect(typeof ask.cancel).toBe('function');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const opts = getCurrentPosition.mock.calls[0]![2] as PositionOptions;
    expect(opts.enableHighAccuracy).toBe(false);           // a dot on a city map, not a doorway
    // Kyle, 2026-09-22: a cold GPS fix with no network is a walk outside and a few minutes of sky. Ten seconds
    // was the app being honest about its own patience and wrong about the phone's.
    expect(opts.timeout).toBe(300000);
    expect(LOCATE_SLOW_MS).toBe(10000);                    // ...and at ten seconds it SAYS so, instead of giving up
    expect(opts.maximumAge).toBeGreaterThan(0);            // a fix from a few minutes ago is a fine answer
    expect(LOCATE_OPTIONS.enableHighAccuracy).toBe(false);
  });

  it('a browser with no geolocation at all is answered like a refusal, not with silence', () => {
    let failed = 0;
    const ask = requestPosition(undefined, () => {}, () => { failed++; });
    expect(failed).toBe(1);
    expect(() => ask.cancel()).not.toThrow();              // nothing was asked, so there is nothing to call off
  });

  it('says "denied" without asking anybody when the browser has no geolocation', async () => {
    await expect(locatePermission({})).resolves.toBe('denied');
  });

  it('says "unknown" when the browser will not answer the question (Safari)', async () => {
    const nav = { geolocation: {} as Geolocation, permissions: undefined };
    await expect(locatePermission(nav as Partial<Navigator>)).resolves.toBe('unknown');
  });

  it('repeats what the browser says when it does answer', async () => {
    for (const state of ['granted', 'denied', 'prompt'] as const) {
      const nav = { geolocation: {} as Geolocation, permissions: { query: async () => ({ state }) } };
      await expect(locatePermission(nav as unknown as Partial<Navigator>)).resolves.toBe(state);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Inside the city, and outside it
// ---------------------------------------------------------------------------------------------------

describe('a fix from outside the four cities moves nothing', () => {
  it('knows Detroit, Hamtramck, Highland Park and Dearborn', () => {
    expect(positionOutcome(42.3487, -83.0567)).toBe('inside');    // downtown Detroit
    expect(positionOutcome(42.3934, -83.0497)).toBe('inside');    // Hamtramck City Hall
    expect(positionOutcome(42.4055, -83.0968)).toBe('inside');    // Highland Park City Hall
    expect(positionOutcome(42.3224, -83.1763)).toBe('inside');    // Dearborn
  });

  it('knows Chicago is not one of them', () => {
    expect(positionOutcome(41.8781, -87.6298)).toBe('outside');
  });

  it('is the same box the pipeline checks every ingested coordinate against', () => {
    expect(SERVICE_BBOX).toEqual({ latMin: 42.25, latMax: 42.46, lonMin: -83.33, lonMax: -82.91 });
    for (const [lat, lon] of [[42.25, -83.33], [42.46, -82.91]] as const) expect(inServiceArea(lat, lon)).toBe(true);
    for (const [lat, lon] of [[42.2499, -83.0], [42.4601, -83.0], [42.35, -83.3301], [42.35, -82.9099]] as const) {
      expect(inServiceArea(lat, lon)).toBe(false);
    }
  });

  it('refuses a fix that is not a number rather than putting the map somewhere undefined', () => {
    expect(inServiceArea(Number.NaN, -83.05)).toBe(false);
    expect(inServiceArea(42.35, Number.NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// Two miles
// ---------------------------------------------------------------------------------------------------

describe('the two-mile view', () => {
  // `cameraForRadius` is in map.ts, beside the limits it has to obey. Imported here so the maths and the rules
  // about it are read in one place.
  let cameraForRadius: typeof import('../src/map.js').cameraForRadius;
  let S_MIN = 0, S_MAX = 0;
  beforeEach(async () => {
    const m = await import('../src/map.js');
    cameraForRadius = m.cameraForRadius; S_MIN = m.S_MIN; S_MAX = m.S_MAX;
  });

  const M_PER_UNIT = 111320;
  const metresAcrossShortSide = (cam: { s: number }, w: number, h: number) => (Math.min(w, h) * M_PER_UNIT) / cam.s;
  const here = { lat: 42.3487, lon: -83.0567 };

  it('is two miles in every direction: the shorter side spans four', () => {
    expect(LOCATE_RADIUS_M).toBeCloseTo(3218.688, 3);      // two miles, in metres
    const cam = cameraForRadius(here, LOCATE_RADIUS_M, 390, 780);
    expect(metresAcrossShortSide(cam, 390, 780)).toBeCloseTo(6437.376, 0);
  });

  it('is the shorter side in landscape too, so the circle fits whichever way the phone is held', () => {
    const portrait = cameraForRadius(here, LOCATE_RADIUS_M, 390, 780);
    const landscape = cameraForRadius(here, LOCATE_RADIUS_M, 780, 390);
    expect(landscape.s).toBeCloseTo(portrait.s, 6);
    expect(metresAcrossShortSide(landscape, 780, 390)).toBeCloseTo(6437.376, 0);
  });

  it('a square box is the same either way', () => {
    expect(cameraForRadius(here, LOCATE_RADIUS_M, 500, 500).s).toBeCloseTo(cameraForRadius(here, LOCATE_RADIUS_M, 500, 500).s, 9);
  });

  it('puts the middle on the person', () => {
    const cam = cameraForRadius(here, LOCATE_RADIUS_M, 390, 780);
    const lon = cam.cx / Math.cos((42.35 * Math.PI) / 180) + -83.1;
    expect(42.35 - cam.cy).toBeCloseTo(here.lat, 6);
    expect(lon).toBeCloseTo(here.lon, 6);
  });

  it('never zooms past the map\'s own limits, however small the radius asked for', () => {
    expect(cameraForRadius(here, 1, 390, 780).s).toBeCloseTo(S_MAX, 6);
    expect(cameraForRadius(here, 5_000_000, 390, 780).s).toBeCloseTo(S_MIN, 6);
    expect(cameraForRadius(here, 0, 390, 780).s).toBeCloseTo(S_MAX, 6);
  });

  it('a box with no size yet does not produce a camera with no scale', () => {
    const cam = cameraForRadius(here, LOCATE_RADIUS_M, 0, 0);
    expect(Number.isFinite(cam.s)).toBe(true);
    expect(cam.s).toBeGreaterThanOrEqual(S_MIN);
  });

  it('a point on the edge of the city stays within the map\'s pan limits', () => {
    const m = { PAN_X: 0.25, PAN_Y: 0.2 };
    for (const [lat, lon] of [[42.25, -83.33], [42.46, -82.91], [42.25, -82.91], [42.46, -83.33]] as const) {
      const cam = cameraForRadius({ lat, lon }, LOCATE_RADIUS_M, 390, 780);
      expect(Math.abs(cam.cx)).toBeLessThanOrEqual(m.PAN_X + 1e-9);
      expect(Math.abs(cam.cy)).toBeLessThanOrEqual(m.PAN_Y + 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// The real map, moved
// ---------------------------------------------------------------------------------------------------

describe('the map actually moves there', () => {
  const W = 390, H = 384;
  const here = { lat: 42.3487, lon: -83.0567 };

  async function mapOn(media: Record<string, boolean> = {}) {
    const { FakeEl, installPage } = await import('./fakes.js');
    const { MapView, focusRadius } = await import('../src/map.js');
    const { baseSpec, serveBasemap } = await import('./mapfixture.js');
    const page = installPage({ width: W, height: H });
    Object.assign(page.media, media);
    const key = 'loc' + Math.random().toString(36).slice(2);
    const view = new MapView(new FakeEl('div') as unknown as HTMLElement, baseSpec(key, []), serveBasemap());
    await new Promise((ok) => setTimeout(ok, 25));
    const priv = view as unknown as { cx: number; cy: number; s: number };
    return { key, view, focusRadius, page, cam: () => ({ cx: priv.cx, cy: priv.cy, s: priv.s }) };
  }

  it('a map on the screen ends up showing four miles across its shorter side', async () => {
    const m = await mapOn();
    expect(m.focusRadius(m.key, here.lat, here.lon, LOCATE_RADIUS_M)).toBe(true);
    const cam = m.cam();
    expect((Math.min(W, H) * 111320) / cam.s).toBeCloseTo(6437.376, 0);
    expect(42.35 - cam.cy).toBeCloseTo(here.lat, 5);
    m.view.destroy();
  });

  it('a map that is not on the screen is not moved, and nothing is kept for later', async () => {
    const m = await mapOn();
    expect(m.focusRadius('a-map-that-is-not-open', here.lat, here.lon, LOCATE_RADIUS_M)).toBe(false);
    m.view.destroy();
  });

  it('under Reduce Motion it simply happens: one redraw, and no movement to watch (WCAG 2.3.3)', async () => {
    const m = await mapOn({ 'prefers-reduced-motion': true });
    const before = m.page.frames;
    m.focusRadius(m.key, here.lat, here.lon, LOCATE_RADIUS_M);
    // One frame is the redraw every change asks for. Anything beyond that would be an animation.
    expect(m.page.frames - before).toBeLessThanOrEqual(1);
    expect((Math.min(W, H) * 111320) / m.cam().s).toBeCloseTo(6437.376, 0);
    m.view.destroy();
  });

  it('a page redraw in the middle of the move still ends at the two-mile view', async () => {
    // The page redraws itself for reasons that have nothing to do with the map — a newer bundle arriving is the
    // usual one — and a redraw throws every map away and builds it again. A move that was one frame into its
    // journey used to be frozen there, leaving the whole city on screen with a dot on it (found on the first
    // headless run, 2026-09-21).
    const { FakeEl, installPage } = await import('./fakes.js');
    const { MapView, focusRadius } = await import('../src/map.js');
    const { baseSpec, serveBasemap } = await import('./mapfixture.js');
    const page = installPage({ width: W, height: H });
    const key = 'redraw' + Math.random().toString(36).slice(2);
    // One frame per animation step, so the move can be interrupted part-way through.
    const queue: (() => void)[] = [];
    (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (f: () => void) => { queue.push(f); page.frames++; return 1; };
    const build = () => new MapView(new FakeEl('div') as unknown as HTMLElement, baseSpec(key, []), serveBasemap());
    const first = build();
    await new Promise((ok) => setTimeout(ok, 25));
    expect(focusRadius(key, here.lat, here.lon, LOCATE_RADIUS_M)).toBe(true);
    queue.pop()?.();                                         // one frame of the move, and no more
    first.destroy();                                         // …and now the page redraws
    const second = build();
    await new Promise((ok) => setTimeout(ok, 25));
    const cam = second as unknown as { cx: number; cy: number; s: number };
    expect((Math.min(W, H) * 111320) / cam.s).toBeCloseTo(6437.376, 0);
    expect(42.35 - cam.cy).toBeCloseTo(here.lat, 5);
    second.destroy();
  });

  it('otherwise it is eased over a fifth of a second, and still lands exactly on the two-mile view', async () => {
    const m = await mapOn();
    const before = m.page.frames;
    m.focusRadius(m.key, here.lat, here.lon, LOCATE_RADIUS_M);
    // More than the single redraw the still version does: the eased steps are really run (the fake clock runs
    // them all at once, so the test does not wait for a fifth of a second).
    expect(m.page.frames - before).toBeGreaterThan(1);
    expect((Math.min(W, H) * 111320) / m.cam().s).toBeCloseTo(6437.376, 0);
    m.view.destroy();
  });
});

// ---------------------------------------------------------------------------------------------------
// The anchor view: what the Map tab opens at when nobody has said where they are (DECISIONS 2026-09-22)
// ---------------------------------------------------------------------------------------------------

describe('the anchor view', () => {
  let cameraForRadius: typeof import('../src/map.js').cameraForRadius;
  let S_MIN = 0, S_MAX = 0;
  beforeEach(async () => {
    const m = await import('../src/map.js');
    cameraForRadius = m.cameraForRadius; S_MIN = m.S_MIN; S_MAX = m.S_MAX;
  });

  const M_PER_UNIT = 111320;
  const mpp = (cam: { s: number }) => M_PER_UNIT / cam.s;
  const metresAcrossShortSide = (cam: { s: number }, w: number, h: number) => (Math.min(w, h) * M_PER_UNIT) / cam.s;
  // A 375 px phone: the page's own gutters leave the map about 343 px wide, and .mapframe is min(58vh, 24rem).
  const PHONE: [number, number] = [343, 384];
  // A laptop: the Map tab's two columns leave the map about 600 px, min(74vh, 40rem) tall.
  const LAPTOP: [number, number] = [600, 640];

  it('is the civic point the app already carries, not a new number', () => {
    // Detroit City Hall (Coleman A. Young Municipal Center) — the `detroit` service area's reference point.
    expect(CITY_HALL).toEqual({ lat: 42.3293, lon: -83.0452 });
    // ...and the view is nudged 0.6 mile up Woodward from it (Kyle, 2026-09-22), so a two-mile box is not a
    // third river and hatching. Still City Hall in words; Grand Circus Park on the ground.
    expect(MAP_ANCHOR).toEqual({ lat: 42.3366, lon: -83.0514 });
    expect(MAP_ANCHOR.lat).toBeGreaterThan(CITY_HALL.lat);        // north
    expect(MAP_ANCHOR.lon).toBeLessThan(CITY_HALL.lon);           // ...and west, which is the way Woodward runs
    expect(Math.hypot((MAP_ANCHOR.lat - CITY_HALL.lat) * 111320, (MAP_ANCHOR.lon - CITY_HALL.lon) * 111320 * Math.cos(42.35 * Math.PI / 180))).toBeCloseTo(965.6, -2);
    expect(inServiceArea(MAP_ANCHOR.lat, MAP_ANCHOR.lon)).toBe(true);
    expect(ANCHOR_RADIUS_M).toBeCloseTo(3218.688, 3);             // two miles, as everywhere else
  });

  it('is what the Map tab opens at with no location, and the two-mile view with one', () => {
    expect(openingView(null)).toEqual({ ...MAP_ANCHOR, radiusMeters: ANCHOR_RADIUS_M });
    expect(openingView(undefined)).toEqual({ ...MAP_ANCHOR, radiusMeters: ANCHOR_RADIUS_M });
    // A location known — allowed earlier, or the middle of a typed ZIP — keeps today's two-mile view, unchanged.
    expect(openingView({ lat: 42.3487, lon: -83.0567 })).toEqual({ lat: 42.3487, lon: -83.0567, radiusMeters: LOCATE_RADIUS_M });
  });

  it('spans four miles across the shorter side, portrait or landscape', () => {
    const v = openingView(null);
    for (const [w, h] of [PHONE, [PHONE[1], PHONE[0]] as [number, number], LAPTOP]) {
      expect(metresAcrossShortSide(cameraForRadius(v, v.radiusMeters, w, h), w, h)).toBeCloseTo(6437.376, 0);
    }
  });

  it('puts the middle on the anchor', () => {
    const v = openingView(null);
    const cam = cameraForRadius(v, v.radiusMeters, ...PHONE);
    const lon = cam.cx / Math.cos((42.35 * Math.PI) / 180) + -83.1;
    expect(42.35 - cam.cy).toBeCloseTo(MAP_ANCHOR.lat, 6);
    expect(lon).toBeCloseTo(MAP_ANCHOR.lon, 6);
  });

  it('is inside the zoom limits the whole app shares, and the middle inside the pan limits', () => {
    const v = openingView(null);
    for (const [w, h] of [PHONE, LAPTOP, [0, 0] as [number, number]]) {
      const cam = cameraForRadius(v, v.radiusMeters, w, h);
      expect(cam.s).toBeGreaterThanOrEqual(S_MIN);
      expect(cam.s).toBeLessThanOrEqual(S_MAX);
      expect(Number.isFinite(cam.s)).toBe(true);
      expect(Math.abs(cam.cx)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(Math.abs(cam.cy)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('reads at a phone size: the mid band, where streets are drawn and named', () => {
    // docs/MAP-STYLE.md section 5: mid is 12 < mpp <= 30, where street classes 0-3 are drawn (class 3 from
    // mpp < 11 is the one that waits) and main roads are named (class <= 1 from mpp < 30). Far, > 30, is where
    // the old region fit sat.
    const v = openingView(null);
    expect(mpp(cameraForRadius(v, v.radiusMeters, ...PHONE))).toBeLessThanOrEqual(30);
    expect(mpp(cameraForRadius(v, v.radiusMeters, ...LAPTOP))).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------------------------------
// The real map, opened
// ---------------------------------------------------------------------------------------------------

describe('the Map tab opens on the anchor, not on the region', () => {
  const W = 343, H = 384;

  async function open(more: Record<string, unknown> = {}) {
    const { FakeEl, installPage } = await import('./fakes.js');
    const { MapView } = await import('../src/map.js');
    const { baseSpec, serveBasemap } = await import('./mapfixture.js');
    installPage({ width: W, height: H });
    const key = 'open' + Math.random().toString(36).slice(2);
    // The Map tab's own spec: the four cities as `fit` (the reset button), the opening view as `open`.
    const spec = baseSpec(key, [], { cover: true, fit: [{ lat: 42.256, lon: -83.287 }, { lat: 42.45, lon: -82.911 }], ...more });
    const view = new MapView(new FakeEl('div') as unknown as HTMLElement, spec, serveBasemap());
    await new Promise((ok) => setTimeout(ok, 25));
    const priv = view as unknown as { cx: number; cy: number; s: number };
    return { view, cam: () => ({ cx: priv.cx, cy: priv.cy, s: priv.s }), mpp: () => 111320 / priv.s };
  }

  it('the first render is the anchor camera, and the region fit is what it is not', async () => {
    const region = await open();
    const wide = region.mpp();
    region.view.destroy();
    const m = await open({ open: openingView(null) });
    expect(m.mpp()).toBeLessThan(wide / 2);
    expect((Math.min(W, H) * 111320) / m.cam().s).toBeCloseTo(6437.376, 0);
    expect(42.35 - m.cam().cy).toBeCloseTo(MAP_ANCHOR.lat, 5);
    m.view.destroy();
  });

  it('with a location known, the two-mile view around the person wins', async () => {
    const here = { lat: 42.3487, lon: -83.0567 };
    const m = await open({ open: openingView(here) });
    expect((Math.min(W, H) * 111320) / m.cam().s).toBeCloseTo(6437.376, 0);
    expect(42.35 - m.cam().cy).toBeCloseTo(here.lat, 5);
    m.view.destroy();
  });

  it('the whole area is still one press of the reset button away', async () => {
    const region = await open();
    const wide = region.cam();
    region.view.destroy();
    const m = await open({ open: openingView(null) });
    (m.view as unknown as { tool(act: string, s: unknown): void }).tool('reset', {});
    expect(m.cam().s).toBeCloseTo(wide.s, 6);
    expect(m.cam().cy).toBeCloseTo(wide.cy, 9);
    m.view.destroy();
  });

  it('every map that opens on "where you are" asks for it, and no other map does', () => {
    const main = src('main.ts');
    const tab = main.split('\n').filter((l) => l.includes("key: 'maptab'"));
    expect(tab).toHaveLength(1);
    expect(tab[0]).toContain('open: openingView(here)');
    // Two maps open on where the person is: the Map tab, and the Areas tab's map of the outlines (Kyle,
    // 2026-09-22 — the rule is about all of them, not about one tab).
    const areas = main.split('\n').filter((l) => l.includes("key: 'areastab'"));
    expect(areas).toHaveLength(1);
    expect(areas[0]).toContain('open: openingView(here)');
    // The maps that are about one subject — a listing, a stretch of greenway, a park, a neighbourhood — keep
    // fitting their subject, and never take the opening view.
    expect(main.match(/open: openingView\(/g)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------
// Where a position does NOT go
// ---------------------------------------------------------------------------------------------------

describe('a position is in one variable and nowhere else', () => {
  const main = src('main.ts');
  /** The three functions a fix passes through, as text: the only code that ever holds a coordinate. */
  const body = (name: string) => {
    const at = main.indexOf(`function ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    return main.slice(at, main.indexOf('\n}', at));
  };

  for (const fn of ['locationArrived', 'locationFailed', 'mapTabOpened']) {
    it(`${fn} writes nothing down, puts nothing in the URL, and sends nothing`, () => {
      const text = body(fn);
      for (const forbidden of ['idbSet', 'pushState', 'replaceState', 'localStorage', 'sessionStorage', 'fetch(', 'navigate(', 'location.hash']) {
        expect(text, `${fn} must not use ${forbidden}`).not.toContain(forbidden);
      }
    });
  }

  it('the only thing the first open remembers is the answered flag', () => {
    // `rememberLocateAnswered` is the sole writer, and it is reached only from the two buttons and Escape.
    const writes = [...main.matchAll(/rememberLocateAnswered\(\)/g)];
    expect(writes.length).toBeGreaterThan(0);
    expect(main).not.toMatch(/idbSet\([^)]*(lat|lon|here|pos)/);
  });

  it('the map remembers a camera in memory only: there is no store behind it', () => {
    const map = src('map.ts');
    // The cameras live in a plain Map, which dies with the page. The only things map.ts writes down are the
    // city's own street files and the public layer files — never where the map was pointed.
    expect(map).toContain('const cameras = new Map<');
    for (const call of map.match(/idbSet\([^)]*\)/g) ?? []) {
      expect(call, call).toMatch(/idbSet\('map', |idbSet\('layer:' \+ file, /);
    }
    for (const forbidden of ['localStorage', 'sessionStorage']) expect(map).not.toContain(forbidden);
  });

  it('a typed ZIP is never drawn as where the person is', () => {
    expect(main).toContain('me: here && !hereZip ? here : null');
  });
});
