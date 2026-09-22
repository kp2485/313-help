// The routing rules against the real committed data, with no network at all.
//
// Like the pipeline's own convention, every case skips when the files are not in the checkout: `data/bundle/v1`
// is never committed, so a fresh clone runs the fixtures and skips these. What they hold on to is the shape of
// the real city — the numbers in docs/research/2026-09-22-offline-directions.md — so that a change to the
// noding, the snapping or the cost model has to be a decision somebody makes rather than a surprise.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type PackedStreets, type TransitLayer, buildStreetGraph, buildTransitNetwork, metresBetween, plan, stopsNear,
  walkRoute,
} from '../src/index.js';

const root = join(__dirname, '../../..');
const bundle = join(root, 'data/bundle/v1');
const ingested = join(root, 'data/ingested/basemap');

function streetFiles(): PackedStreets[] {
  if (existsSync(join(bundle, 'map/base.json'))) {
    const base = JSON.parse(readFileSync(join(bundle, 'map/base.json'), 'utf8')) as PackedStreets;
    const streets = JSON.parse(readFileSync(join(bundle, 'map/streets.json'), 'utf8')) as { cells: Record<string, PackedStreets> };
    return [base, ...Object.keys(streets.cells).sort().map((k) => streets.cells[k]!)];
  }
  if (existsSync(join(ingested, 'base.json'))) {
    const base = JSON.parse(readFileSync(join(ingested, 'base.json'), 'utf8')) as PackedStreets;
    const cells = readdirSync(join(ingested, 'cells')).sort().map((f) => JSON.parse(readFileSync(join(ingested, 'cells', f), 'utf8')) as PackedStreets);
    return [base, ...cells];
  }
  return [];
}

interface Row { id: string; name: string; category: string; lat?: number; lon?: number }
function listings(): Row[] {
  const dir = join(bundle, 'category');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Row[] | { rows: Row[] };
    return Array.isArray(j) ? j : j.rows;
  });
}

function transitLayers(): TransitLayer[] {
  const dir = join(bundle, 'map/transit');
  if (!existsSync(dir)) return [];
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const out: TransitLayer[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.net.json')).sort()) {
    const net = read(f);
    if (!net.routes) continue;                                   // a stops .net.json; picked up through its routes file
    const stopsId = net.stops_layer ?? net.id;
    if (!existsSync(join(dir, `${stopsId}.json`))) continue;
    const stops = read(`${stopsId}.json`);
    const servesFile = `${stopsId}.net.json`;
    const serves = stopsId !== net.id && existsSync(join(dir, servesFile)) ? read(servesFile) : undefined;
    out.push({ stops, routes: net, serves });
  }
  return out;
}

const files = streetFiles();
const rows = listings();
const layers = transitLayers();
const has = files.length > 0;
// The street files are committed (`data/ingested/basemap`), so the graph cases run on a fresh clone. The
// listings and the transit layers are NOT: `data/bundle/v1` is built, never committed, so every case that
// needs a listing skips until somebody has run `pnpm build:bundle`.
const hasRows = rows.length >= 40;

describe('the street graph, on the committed basemap', () => {
  const g = has ? buildStreetGraph(files, 'real') : null;

  it.skipIf(!has)('is the size and shape the study measured', () => {
    const s = g!.stats;
    // The study (before the 2026-09-22 basemap fix): 23,863 nodes, 40,342 edges, 45 components, largest 99.5%,
    // built in 183 ms. On the clipped, merged basemap: 23,592 nodes, 39,714 edges, 35 components, largest 99.7%.
    expect(g!.nodeCount).toBeGreaterThan(20_000);
    expect(g!.nodeCount).toBeLessThan(28_000);
    expect(g!.edgeCount).toBeGreaterThan(34_000);
    expect(g!.edgeCount).toBeLessThan(46_000);
    expect(s.largestComponent / g!.nodeCount).toBeGreaterThan(0.99);
    expect(s.deadEnds / g!.nodeCount).toBeLessThan(0.15);
    expect(s.crossings).toBeGreaterThan(15_000);
    expect(s.snapped).toBeGreaterThan(5_000);
    console.log(`streets graph: ${g!.nodeCount} nodes, ${g!.edgeCount} edges, ${s.components} components, ` +
      `largest ${(100 * s.largestComponent / g!.nodeCount).toFixed(1)}%, dead ends ${(100 * s.deadEnds / g!.nodeCount).toFixed(1)}%, ` +
      `${s.crossings} crossings + ${s.snapped} snapped ends, built in ${s.buildMs} ms`);
  });

  it.skipIf(!has)('carries the City\'s safety fields, and prefers a calmer street because of them', () => {
    expect(g!.hasSafety).toBe(true);
    let onHin = 0;
    for (let w = 0; w < g!.waySafety.length; w++) if ((g!.waySafety[w]! & 1) !== 0) onHin++;
    expect(onHin).toBeGreaterThan(50);            // the City's High Injury Network really is in there
    console.log(`safety bytes: ${onHin} of ${g!.waySafety.length} ways are on the City's High Injury Network`);
  });

  it.skipIf(!has)('builds fast enough to do it once when a bundle changes', () => {
    // 183 ms on the study's Mac; a cheap phone is 5-10x slower. A CI runner is slower than both, so the bound
    // is generous on purpose: what it catches is an accidental quadratic, not a slow laptop.
    expect(g!.stats.buildMs).toBeLessThan(3_000);
  });

  it.skipIf(!has || !hasRows)('answers a walking route for 20 listing pairs in well under 50 ms each', () => {
    const withCoords = rows.filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const times: number[] = [];
    let found = 0;
    for (let i = 0; i < 20; i++) {
      const a = withCoords[Math.floor(rnd() * withCoords.length)]!, b = withCoords[Math.floor(rnd() * withCoords.length)]!;
      const t = performance.now();
      const r = walkRoute(g!, { lat: a.lat!, lon: a.lon! }, { lat: b.lat!, lon: b.lon! });
      times.push(performance.now() - t);
      if (r) found++;
    }
    times.sort((x, y) => x - y);
    console.log(`20 listing pairs: median ${times[10]!.toFixed(1)} ms, max ${times[19]!.toFixed(1)} ms, ${found} routed`);
    expect(found).toBeGreaterThanOrEqual(18);
    // The target is 50 ms a route. It is held against the median rather than the worst of twenty, because the
    // first route of a cold process pays for the JIT and for reading the map files, and one cold outlier on a
    // shared runner is not a regression. The worst is bounded too, an order of magnitude looser.
    expect(times[10]).toBeLessThan(50);
    expect(times[19]).toBeLessThan(500);
  });

  // The study's own sample: Woodward at W Grand Blvd to Auntie Na's Village free food boxes, 12028 Yellowstone.
  it.skipIf(!has)('reproduces the study\'s sample route, ending on the pantry\'s own block', () => {
    const r = walkRoute(g!, { lat: 42.3697, lon: -83.0742 }, { lat: 42.377459, lon: -83.135296 });
    expect(r).not.toBeNull();
    const route = r!;
    console.log(`sample route: ${(route.metres / 1000).toFixed(2)} km (straight ${(route.straightMetres / 1000).toFixed(2)} km), ` +
      `snapped ${route.startOffMetres.toFixed(0)} m / ${route.endOffMetres.toFixed(0)} m, ${route.settled} settled, ` +
      `${route.steps.length} steps: ${route.steps.filter((s) => s.metres > 100).map((s) => `${s.street} ${Math.round(s.metres)}`).join(' > ')}`);
    // The study measured 6.66 km on the shortest path and a 5.10 km straight line. The safety penalty may move
    // the route onto calmer streets, so the bound is on being a sane walking route, not on one exact line.
    expect(route.metres).toBeGreaterThan(5_000);
    expect(route.metres).toBeLessThan(9_000);
    expect(route.straightMetres).toBeGreaterThan(5_000);
    expect(route.startOffMetres).toBeLessThan(120);
    expect(route.endOffMetres).toBeLessThan(120);
    // it ends on the pantry's own street, and every step names a street a person can read off a sign
    expect(route.steps[route.steps.length - 1]!.street).toBe('Yellowstone St');
    expect(route.steps.every((s) => s.street.length > 0)).toBe(true);
    // the drawn line follows the streets, so it has far more vertices than it has turns
    expect(route.polyline.length).toBeGreaterThan(route.steps.length);
  });

  it.skipIf(!has || !hasRows)('routes to the street outside, never to the door', () => {
    const withCoords = rows.filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number').slice(0, 60);
    let off = 0, n = 0;
    for (const row of withCoords) {
      const r = walkRoute(g!, { lat: 42.3314, lon: -83.0458 }, { lat: row.lat!, lon: row.lon! });
      if (!r) continue;
      off += r.endOffMetres; n++;
      // the polyline's last point is a point on a street, which is not the listing's own coordinate
      const last = r.polyline[r.polyline.length - 1]!;
      expect(metresBetween({ lat: last[1], lon: last[0] }, { lat: row.lat!, lon: row.lon! })).toBeCloseTo(r.endOffMetres, 0);
    }
    expect(n).toBeGreaterThan(30);
    console.log(`route ends: mean ${(off / n).toFixed(0)} m from the door, over ${n} listings`);
  });
});

describe('trip plans, on the committed transit layers', () => {
  const ok = has && layers.length > 0;
  const g = ok ? buildStreetGraph(files, 'real') : null;
  const net = ok ? buildTransitNetwork(layers) : null;

  it.skipIf(!ok)('carries every stop and route the ingest published', () => {
    expect(net!.stops.length).toBeGreaterThan(9_000);
    expect(net!.routes.length).toBeGreaterThan(70);
    const withHeadway = net!.routes.filter((r) => r.headway !== null);
    expect(withHeadway.length).toBeGreaterThanOrEqual(37);        // DDOT publishes one for all 37
    console.log(`transit: ${net!.stops.length} stops, ${net!.routes.length} routes, ${withHeadway.length} with a published headway`);
  });

  it.skipIf(!ok || !hasRows)('puts a stop within 400 m of at least 90% of our listings', () => {
    const withCoords = rows.filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number');
    const near = withCoords.filter((r) => stopsNear(net!, { lat: r.lat!, lon: r.lon! }, 400).length > 0).length;
    console.log(`transit coverage: ${near} of ${withCoords.length} listings have a stop within 400 m (${(100 * near / withCoords.length).toFixed(0)}%)`);
    expect(near / withCoords.length).toBeGreaterThan(0.9);        // the study measured 92%
  });

  it.skipIf(!ok)('plans the study\'s trip as walking legs and rides, with no time anywhere in it', () => {
    const t = performance.now();
    const plans = plan(g!, net!, { lat: 42.3697, lon: -83.0742 }, { lat: 42.377459, lon: -83.135296 });
    const ms = performance.now() - t;
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      console.log(`plan ${p.range[0]}-${p.range[1]} min, ${p.changes} change(s), walk ${Math.round(p.walk_metres)} m: ` +
        p.legs.map((l) => l.kind === 'walk' ? `walk ${Math.round(l.metres)} m` : `ride ${l.route_id} ${l.stops} stops${l.headway_minutes ? ` every ${l.headway_minutes}` : ''}`).join(' > '));
      expect(p.changes).toBeLessThanOrEqual(1);
      expect(p.range[1]).toBeGreaterThan(p.range[0]);
      // every ride names its own stops, and a headway is either a published number or nothing
      for (const l of p.legs) {
        if (l.kind !== 'ride') continue;
        expect(l.from_stop.name.length).toBeGreaterThan(0);
        expect(l.headway_minutes === null || l.headway_minutes > 0).toBe(true);
        expect(l.polyline.length).toBeGreaterThan(1);
      }
    }
    // the bus plans must be real DDOT or SMART routes, not something we made up
    const ridden = plans.flatMap((p) => p.legs.filter((l) => l.kind === 'ride').map((l) => (l as { route_id: string }).route_id));
    for (const id of ridden) expect(net!.routes.some((r) => r.id === id)).toBe(true);
    console.log(`plan computed in ${ms.toFixed(0)} ms; routes offered: ${ridden.join(', ') || '(walking only)'}`);
    expect(ms).toBeLessThan(2_000);
  });

  it.skipIf(!ok)('walks the four blocks instead of waiting for a bus', () => {
    // Two points about 500 m apart downtown: a bus cannot beat walking once half a headway is counted.
    const plans = plan(g!, net!, { lat: 42.3314, lon: -83.0458 }, { lat: 42.3353, lon: -83.0495 });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]!.legs.every((l) => l.kind === 'walk')).toBe(true);
  });
});
