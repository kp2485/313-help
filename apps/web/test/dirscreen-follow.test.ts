// Following along on the Directions screen (dirscreen.ts), driven: a real plan from the real worker code, a fake
// `navigator.geolocation`, and positions handed in by the test.
//
// This replaces three checks that read dirscreen.ts: that it contained `watchPosition` and `clearWatch`, that
// the 400 characters after `export function open` and `close` mentioned `stopFollowing()`, and that the text
// between `function startFollowing` and a comment contained no `runPlan(`. What they stood for is held here:
// one watch at most, every way off the screen ends it, and a position off the route never plans a new route —
// it says so and offers "Plan again", which plans only when tapped.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../src/dirworker.js';
import { FakeWorker } from './fakes.js';

// Two short streets that cross, in the bundle's own packed shape; no transit.
vi.mock('../src/dirfiles.js', () => ({
  streetFiles: async () => [{
    origin: [-83.05, 42.33], names: ['Woodward Ave', 'Warren Ave'],
    roads: [[3, 0, [0, 0, 0, 200]], [3, 1, [0, 100, 200, 0]]],
  }],
  transitLayers: async () => [],
}));

const en = JSON.parse(readFileSync(join(__dirname, '../../../strings/en.json'), 'utf8')) as Record<string, string>;
const t = (key: string, p: Record<string, string | number> = {}) => (en[key] ?? key).replace(/\{(\w+)\}/g, (_: string, k: string) => String(p[k] ?? ''));

const deps = () => ({
  t, esc: (s: unknown) => String(s ?? ''), icon: () => '', mapBox: () => '<div class="mapbox"></div>',
  announce: vi.fn(), rerender: vi.fn(),
  origin: () => ({ lat: 42.33, lon: -83.05 }), originKind: () => 'cross' as const, originWords: () => 'Woodward & Warren',
  originHtml: () => '<div class="loc"></div>', index: { files: {} } as never, transit: undefined, centre: vi.fn(() => true),
});
const PLACE = { lat: 42.3312, lon: -83.05, name: 'A pantry on Woodward' };
const tap = (data: Record<string, string>) => ({ dataset: data }) as unknown as HTMLElement;

/** A geolocation that hands out watch ids and remembers who is listening. */
function fakeGeo() {
  let next = 1;
  const live = new Map<number, (p: { coords: { latitude: number; longitude: number } }) => void>();
  const geo = {
    watchPosition: vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => { const id = next++; live.set(id, ok); return id; }),
    clearWatch: vi.fn((id: number) => { live.delete(id); }),
  };
  const at = (lat: number, lon: number) => { for (const ok of live.values()) ok({ coords: { latitude: lat, longitude: lon } }); };
  return { geo, live, at };
}

describe('following along', () => {
  let m: typeof import('../src/dirscreen.js');
  let g: ReturnType<typeof fakeGeo>;
  let d: ReturnType<typeof deps>;

  /** Open the screen, wait for the real plan, choose it and draw its steps, as a person would. */
  async function chosenTrip() {
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(m.state().phase).toBe('ready'));
    m.onClick(tap({ dirPick: '0' }), d as never);
    const out = m.html(d as never);
    expect(m.state().steps).toBeGreaterThan(0);
    return out;
  }

  beforeEach(async () => {
    FakeWorker.made = []; FakeWorker.answer = (msg) => handle(msg);
    g = fakeGeo();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', { geolocation: g.geo });
    d = deps();
    m = await import('../src/dirscreen.js');
    m.reset();
  });
  afterEach(() => { m.reset(); vi.unstubAllGlobals(); });

  it('is off until asked, then watches once; asking again stops it', async () => {
    expect(await chosenTrip()).toContain('data-dir-act="follow"');
    expect(g.geo.watchPosition).not.toHaveBeenCalled();
    m.onClick(tap({ dirAct: 'follow' }), d as never);
    expect(m.state().following).toBe(true);
    expect(g.live.size).toBe(1);
    m.onClick(tap({ dirAct: 'follow' }), d as never);
    expect(m.state().following).toBe(false);
    expect(g.live.size).toBe(0);
  });

  it('every way off the screen ends the watch and forgets the position', async () => {
    for (const leave of [
      () => m.close(),
      () => m.open({ lat: 42.3305, lon: -83.049, name: 'Somewhere else' }, d as never),
      () => m.onClick(tap({ dirAct: 'restart' }), d as never),
    ]) {
      m.reset();
      await chosenTrip();
      m.onClick(tap({ dirAct: 'follow' }), d as never);
      g.at(42.3301, -83.05);
      expect(m.state().livePos).toBe(true);
      leave();
      expect(g.live.size, 'no watch left running').toBe(0);
      expect(m.state().following).toBe(false);
      expect(m.state().livePos).toBe(false);
    }
  });

  it('on the route, it says which step a person is on', async () => {
    await chosenTrip();
    m.onClick(tap({ dirAct: 'follow' }), d as never);
    g.at(42.3301, -83.05);
    expect(m.state().stepAt).toBeGreaterThanOrEqual(0);
    expect(m.state().offRoute).toBe(false);
  });

  it('off the route, it never plans a new route: it says so, and plans again only when asked', async () => {
    await chosenTrip();
    m.onClick(tap({ dirAct: 'follow' }), d as never);
    const worker = FakeWorker.made[0]!;
    const asked = worker.sent.length;

    g.at(42.40, -83.20);                                              // miles away
    expect(m.state().offRoute).toBe(true);
    expect(d.announce).toHaveBeenLastCalledWith(t('dir.off_route'));
    expect(worker.sent.length, 'nothing was sent to the planner').toBe(asked);
    expect(m.state().plans).toBe(1);
    expect(m.state().chosen).toBe(0);
    expect(m.html(d as never)).toContain('data-dir-act="again"');

    m.onClick(tap({ dirAct: 'again' }), d as never);
    await vi.waitFor(() => expect(worker.sent.length).toBe(asked + 1));
    expect(worker.sent.at(-1)!.type).toBe('plan');
    expect(worker.sent.at(-1)).toMatchObject({ from: { lat: 42.33, lon: -83.05 } });   // from the origin, not the position
  });
});
