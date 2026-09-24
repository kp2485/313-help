// The Directions screen when its Worker dies (DECISIONS 2026-09-23).
//
// A worker whose script cannot be fetched or run does not make `new Worker()` throw: it fires `error` on the
// Worker object, later. Under `vite dev` that is every time (a classic worker is served as a module there), and
// in production it is an old cached page asking for a worker file a deploy has removed. Before this, the screen
// waited for a reply that never came and said "Getting the map ready… (about a second)" for ever.
//
// Driven, not read: dirscreen runs against a fake Worker that the test makes fail or answer, and the files it
// would read from IndexedDB are handed in by a mock of dirfiles.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromWorker, ToWorker } from '../src/dirworker.js';
import { FakeWorker } from './fakes.js';

// The map files: one street file, no transit. `release` lets a test hold them back until the Worker has failed.
let filesReady: Promise<void> = Promise.resolve();
vi.mock('../src/dirfiles.js', () => ({
  streetFiles: async () => { await filesReady; return [{ fake: 'streets' }]; },
  transitLayers: async () => [],
}));

const en = JSON.parse(readFileSync(join(__dirname, '../../../strings/en.json'), 'utf8')) as Record<string, string>;
const t = (key: string, p: Record<string, string | number> = {}) => (en[key] ?? key).replace(/\{(\w+)\}/g, (_: string, k: string) => String(p[k] ?? ''));

const deps = () => ({
  t, esc: (s: unknown) => String(s ?? ''), icon: () => '', mapBox: () => '<div class="mapbox"></div>',
  announce: vi.fn(), rerender: vi.fn(),
  origin: () => ({ lat: 42.3314, lon: -83.0458 }), originKind: () => 'me' as const, originWords: () => '',
  originHtml: () => '<div class="loc"></div>', index: { files: {} } as never, transit: undefined, centre: () => true,
});
const PLACE = { lat: 42.377, lon: -83.135, name: 'X' };

const healthy = (m: ToWorker): FromWorker =>
  m.type === 'build' ? { type: 'ready', id: m.id, nodes: 1, edges: 0, buildMs: 1, transit: false } : { type: 'plans', id: m.id, plans: [] };

describe('a Worker that fails is a failed screen with Try again, never a screen that waits for ever', () => {
  let m: typeof import('../src/dirscreen.js');
  beforeEach(async () => {
    FakeWorker.made = []; FakeWorker.answer = () => null; filesReady = Promise.resolve();
    vi.stubGlobal('Worker', FakeWorker);
    m = await import('../src/dirscreen.js');
    m.reset();
  });
  afterEach(() => { m.reset(); vi.unstubAllGlobals(); });

  it('fails the build it was asked for when the script dies while building', async () => {
    const d = deps();
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made[0]?.sent.map((s) => s.type)).toEqual(['build']));
    expect(m.state().phase).toBe('building');
    FakeWorker.made[0]!.fail();
    expect(m.state().phase).toBe('failed');
    expect(d.announce).toHaveBeenLastCalledWith('The map could not be read.');
    const out = m.html(d as never);
    expect(out).toContain('The map could not be read.');
    expect(out).toContain('data-dir-act="retry"');
    expect(out).not.toContain('Getting the map ready');
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });

  it('fails too when the script dies before the map files are even read (the `vite dev` case)', async () => {
    let release!: () => void;
    filesReady = new Promise((r) => { release = r; });
    const d = deps();
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made).toHaveLength(1));
    FakeWorker.made[0]!.fail();
    release();
    await vi.waitFor(() => expect(m.state().phase).toBe('failed'));
    expect(FakeWorker.made[0]!.sent).toEqual([]);                  // nothing was posted to a dead worker
  });

  it('a reply that cannot be read (`messageerror`) fails the screen the same way', async () => {
    const d = deps();
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made[0]?.sent).toHaveLength(1));
    FakeWorker.made[0]!.fail('messageerror');
    expect(m.state().phase).toBe('failed');
  });

  it('Try again starts a new Worker, and a healthy one plans the trip', async () => {
    const d = deps();
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made[0]?.sent).toHaveLength(1));
    FakeWorker.made[0]!.fail();
    expect(m.state().phase).toBe('failed');

    FakeWorker.answer = healthy;
    expect(m.onClick({ dataset: { dirAct: 'retry' } } as unknown as HTMLElement, d as never)).toBe(true);
    await vi.waitFor(() => expect(m.state().phase).toBe('empty'));
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1]!.sent.map((s) => s.type)).toEqual(['build', 'plan']);
  });

  it('a Worker that dies after the graph is built fails the plan in flight, and the next trip rebuilds', async () => {
    const d = deps();
    FakeWorker.answer = (msg) => (msg.type === 'build' ? healthy(msg) : null);   // builds, then never plans
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made[0]?.sent.map((s) => s.type)).toEqual(['build', 'plan']));
    expect(m.state().phase).toBe('planning');
    FakeWorker.made[0]!.fail();
    expect(m.state().phase).toBe('failed');

    // "Plan again" keeps a built graph; this one died with its Worker, so it is built again on a new one.
    FakeWorker.answer = healthy;
    m.onClick({ dataset: { dirAct: 'again' } } as unknown as HTMLElement, d as never);
    await vi.waitFor(() => expect(m.state().phase).toBe('empty'));
    expect(FakeWorker.made[1]!.sent.map((s) => s.type)).toEqual(['build', 'plan']);
  });

  it('an error from a Worker already replaced does nothing to the new one', async () => {
    const d = deps();
    m.open(PLACE, d as never);
    await vi.waitFor(() => expect(FakeWorker.made[0]?.sent).toHaveLength(1));
    FakeWorker.made[0]!.fail();
    FakeWorker.answer = healthy;
    m.onClick({ dataset: { dirAct: 'retry' } } as unknown as HTMLElement, d as never);
    await vi.waitFor(() => expect(m.state().phase).toBe('empty'));
    FakeWorker.made[0]!.fail();                                    // the old one, again
    expect(FakeWorker.made[1]!.terminated).toBe(false);
    expect(m.state().phase).toBe('empty');
  });
});
