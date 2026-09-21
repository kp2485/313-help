// One small city for the drawing tests: a few streets of every class, a park, a boundary, a greenway in two
// phases, help dots, and one transport layer of every shape `standard` draws (a solid line, a dashed line, dense
// stops, ringed stations). `standardFrames()` draws it through the real MapView at two zooms and hands back
// what reached the canvas.

import { createHash } from 'node:crypto';
import type { Segment } from '@313help/query';
import type { BundleIndex } from '../src/data.js';
import { MapView, decodeLayer, type MapSpec, type Overlay } from '../src/map.js';
import { LAYER_STYLE } from '../src/layerstyle.js';
import { installPage, type FakeEl } from './fakes.js';

const ORIGIN: [number, number] = [-83.32, 42.22];
const line = (x: number, y: number, steps: [number, number][]) => [x, y, ...steps.flat()];
export const BASE = {
  origin: ORIGIN, source: { last_edited: { roads: '2026-09-01' } },
  names: ['I-75', 'Woodward Ave', 'Grand River Ave', 'Canfield St', 'Alley'],
  roads: [
    [0, 0, line(20000, 9000, [[2000, 1500], [2500, 2500], [1000, 3000]])], [1, 1, line(27400, 10900, [[-900, 1300], [-900, 1400], [-900, 1400]])],
    [2, 2, line(27000, 11000, [[-2000, 900], [-2500, 1200]])], [3, 3, line(25000, 13000, [[1500, 600], [1500, 650]])], [4, 4, line(26000, 13200, [[300, -500]])],
  ],
  park_names: ['Palmer Park'], parks: [[0, line(24000, 12500, [[800, 0], [0, 700], [-800, 0]])]],
  boundary: [line(15000, 5000, [[20000, 0], [0, 15000], [-20000, 0]])],
};
export const STREETS = { cells: { a: { origin: ORIGIN, names: ['Side St'], roads: [[4, 0, line(25500, 12000, [[0, 900], [600, 0]])], [3, 0, line(25200, 12100, [[1200, 300]])]] } } };

export const LAYERS: Record<string, { origin: [number, number]; names: string[]; lines?: [number, number[]][]; points?: [number, number, number][] }> = {
  ddot_routes: { origin: ORIGIN, names: ['4 Woodward', '3 Grand River'], lines: [[0, line(27450, 10960, [[-900, 1300], [-900, 1400], [-964, 1341]])], [1, line(27000, 11000, [[-2000, 900], [-2500, 1200]])]] },
  smart_routes: { origin: ORIGIN, names: ['461 FAST Woodward'], lines: [[0, line(27440, 10950, [[-900, 1300], [-1800, 2800]])]] },
  ddot_stops: { origin: ORIGIN, names: ['Woodward & Mack', 'Woodward & Warren'], points: [[0, 26550, 12260], [1, 25650, 13660]] },
  qline: { origin: ORIGIN, names: ['Congress Station', 'Grand Blvd Station'], points: [[0, 27450, 10963], [1, 24686, 15001]] },
  intercity_bus: { origin: ORIGIN, names: ['Detroit'], points: [[0, 24780, 14810]] },
  bike_lanes: { origin: ORIGIN, names: ['Cass Ave'], lines: [[0, line(26800, 11200, [[-700, 1100], [-700, 1200]])]] },
};
export function overlaysFor(ids: string[]): Overlay[] {
  return ids.map((id) => ({ ...decodeLayer(LAYERS[id]!), id: 'go:' + id, label: id, ...(LAYER_STYLE['go:' + id] ?? { css: '--lyr-bus' }) }));
}
const seg = (id: string, phase: Segment['phase'], pts: [number, number][]): Segment => ({ id, name: id, phase, lines: [pts] } as unknown as Segment);
export const SEGMENTS = [seg('seg_a', 'open', [[-83.07, 42.34], [-83.06, 42.35], [-83.055, 42.36]]), seg('seg_b', 'planned', [[-83.055, 42.36], [-83.05, 42.37]])];
export const STRINGS: MapSpec['strings'] = { zoomIn: '+', zoomOut: '-', reset: 'r', bigger: 'b', smaller: 's', details: 'd', park: 'park', noStreets: 'none', keys: 'keys', panUp: 'u', panDown: 'dn', panLeft: 'l', panRight: 'rt', focusHint: 'hint', focusNone: 'nothing', focusOff: 'off', source: (d) => d, phase: { open: 'Open', planned: 'Planned' } };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** An index that really does name the two basemap files, and a `fetch` that really does serve them, so the map
 *  goes through its own checksum path. Every request made is written to `asked`. */
export function serveBasemap(asked: string[] = []): BundleIndex {
  const files: Record<string, string> = { 'map/base.json': JSON.stringify(BASE), 'map/streets.json': JSON.stringify(STREETS) };
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
    asked.push(url); const body = files[url.replace('/data/bundle/v1/', '')];
    return body === undefined ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new TextEncoder().encode(body).buffer };
  };
  return { version: 't', generated_at: '2026-09-21T00:00:00Z', emergency_verified: true, signing: 'dev', counts: {}, files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, { sha256: sha(b), bytes: b.length }])) };
}
export const baseSpec = (key: string, overlays: Overlay[], more: Partial<MapSpec> = {}): MapSpec => ({
  key, label: 'map', segments: SEGMENTS, overlays, strings: STRINGS, quiet: true, cover: true,
  dots: [{ lat: 42.345, lon: -83.06, label: 'Pantry', category: 'food.pantry', css: '--grp-food' }], me: { lat: 42.35, lon: -83.05 },
  fit: [{ lat: 42.33, lon: -83.08 }, { lat: 42.37, lon: -83.04 }], ...more,
});
const settle = () => new Promise((ok) => setTimeout(ok, 25));
/** Draw `spec` for real and return the canvas calls of two frames: as it opens, and after three steps of zoom. */
export async function framesOf(spec: MapSpec, index: BundleIndex, media: Record<string, boolean> = {}): Promise<{ far: string[]; near: string[]; canvas: FakeEl; view: MapView }> {
  const page = installPage(); Object.assign(page.media, media);
  const view = new MapView(new (await import('./fakes.js')).FakeEl('div') as unknown as HTMLElement, spec, index);
  await settle();
  const canvas = page.canvases[page.canvases.length - 1]!;
  canvas.log.length = 0; view.redraw(); const far = [...canvas.log];
  for (let i = 0; i < 3; i++) canvas.fire('keydown', { key: '+' });
  canvas.log.length = 0; view.redraw(); const near = [...canvas.log];
  return { far, near, canvas, view };
}
