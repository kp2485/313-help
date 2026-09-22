import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  badge, bundleAge, buildStreetGraph, buildTransitNetwork, effectiveNow, helpAlong, milesToSegment, nearestSegment,
  nextOccurrences, openNow, plan, rank, search, walkRoute,
} from '../src/index.js';
import type { Alert, BundleRow, PackedStreets, Segment, TransitLayer, WalkRoute } from '../src/index.js';

// Fixtures are plain JSON so the iOS implementation can run the same cases.
const dir = join(__dirname, '../../../schema/fixtures');

interface Case {
  name: string;
  fn: 'openNow' | 'nextOccurrences' | 'badge' | 'rank' | 'rankDetail' | 'bundleAge' | 'effectiveNow' | 'helpAlong' | 'milesToSegment' | 'nearestSegment' | 'search'
  | 'streetGraph' | 'walk' | 'plan';
  segment?: string; openOnly?: boolean; maxMiles?: number; tolerance?: number;
  now: string;
  text?: string;
  row?: string;
  n?: number;
  query?: Record<string, unknown>;
  index?: { generated_at: string; retired?: boolean };
  // Directions (schema/query-spec.md). `no_safety` drops the street files' safety array, which is what an
  // older bundle looks like; `from`/`to` are the two ends of a walk or a whole trip.
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
  no_safety?: boolean;
  expect: unknown;
}
type FixtureRow = Partial<BundleRow> & { id: string };
interface Fixture {
  description: string; segments?: Segment[]; rows?: FixtureRow[]; alerts?: Alert[]; cases: Case[];
  streets?: PackedStreets[]; transit?: TransitLayer[];
}

// The one wording of a result that all three runners compare. Metres are rounded to 10 so a port never fails on
// a last-digit difference, and the distances that a person is told ("about 40 m to the building") to the metre.
const r10 = (m: number) => Math.round(m / 10) * 10;
export const walkSummary = (r: WalkRoute | null): string | null => r === null ? null
  : `${r.steps.map((s) => `${s.turn ?? 'start'} ${s.street} ${s.bearing} ${r10(s.metres)}`).join(' > ')} | ${r10(r.metres)} m, off ${Math.round(r.startOffMetres)}/${Math.round(r.endOffMetres)}`;

const DEFAULTS = {
  org: 'Test Org', category: 'food.pantry', what: 'Free groceries', phones: [], flags: [],
  availability: 'scheduled', schedules: [], status: 'active',
  facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' } },
};

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const fx = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Fixture;
  const rows = (fx.rows ?? []).map((r) => ({ ...DEFAULTS, ...r, name: r.name ?? r.id, facts: { ...DEFAULTS.facts, ...(r.facts ?? {}) } })) as BundleRow[];
  const alerts = fx.alerts ?? [];
  const seg = (id?: string) => {
    const s = (fx.segments ?? []).find((x) => x.id === id);
    if (!s) throw new Error(`${file}: no segment ${id}`);
    return s;
  };
  const find = (id?: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new Error(`${file}: no row ${id}`);
    return r;
  };

  // Directions: one graph per fixture file, built once with and once without the City's safety fields.
  const streets = fx.streets ?? [];
  const bare = streets.map((s) => ({ origin: s.origin, names: s.names, roads: s.roads }));
  const graphOf = (noSafety?: boolean) => buildStreetGraph(noSafety ? bare : streets, `${file}${noSafety ? ':bare' : ''}`);
  const network = fx.transit?.length ? buildTransitNetwork(fx.transit) : null;

  describe(`${file} — ${fx.description}`, () => {
    for (const c of fx.cases) {
      it(c.name, () => {
        const now = new Date(c.now);
        switch (c.fn) {
          case 'openNow':
            expect(openNow(find(c.row), now, alerts)).toMatchObject(c.expect as object); break;
          case 'nextOccurrences':
            // " holiday" marks an occurrence that opens on a holiday: labelled, never dropped (query-spec "Holidays").
            expect(nextOccurrences(find(c.row), now, c.n ?? 3, alerts).map((o) => `${o.date} ${o.opens_at}-${o.closes_at}${o.holiday ? ' holiday' : ''}`)).toEqual(c.expect); break;
          case 'badge':
            expect(badge(find(c.row), now)).toMatchObject(c.expect as object); break;
          case 'rank':
            expect(rank(rows, c.query ?? {}, now, alerts).map((r) => r.row.id)).toEqual(c.expect); break;
          // "<id> band<n> <no-distance|distance>": the band a row landed in, and whether the result object carries
          // a distance at all. A domestic-violence row must always read "no-distance" (schema/query-spec.md).
          case 'rankDetail':
            expect(rank(rows, c.query ?? {}, now, alerts)
              .map((r) => `${r.row.id} band${r.band} ${r.miles === null ? 'no-distance' : 'distance'}`)).toEqual(c.expect); break;
          case 'search':
            expect(search(rows, c.text ?? '', c.query ?? {}, now, alerts).map((r) => r.row.id)).toEqual(c.expect); break;
          case 'bundleAge':
            expect(bundleAge(c.index!, now)).toBe(c.expect); break;
          case 'helpAlong':
            expect(helpAlong(rows, seg(c.segment)).map((x) => x.row.id)).toEqual(c.expect); break;
          case 'milesToSegment': {
            const r = find(c.row);
            expect(Math.abs(milesToSegment({ lat: r.lat!, lon: r.lon! }, seg(c.segment)) - (c.expect as number))).toBeLessThan(c.tolerance ?? 0.01); break;
          }
          case 'nearestSegment': {
            const r = find(c.row);
            const hit = nearestSegment({ lat: r.lat!, lon: r.lon! }, fx.segments ?? [], { openOnly: c.openOnly, maxMiles: c.maxMiles });
            expect(hit ? hit.segment.id : null).toBe(c.expect); break;
          }
          case 'effectiveNow':
            expect(effectiveNow(now, c.index!.generated_at).toISOString()).toBe(c.expect); break;
          case 'streetGraph': {
            const g = graphOf(c.no_safety);
            expect({
              nodes: g.nodeCount, edges: g.edgeCount, crossings: g.stats.crossings, snapped: g.stats.snapped,
              components: g.stats.components, largest: g.stats.largestComponent, dead_ends: g.stats.deadEnds, skipped: g.stats.skipped,
            }).toEqual(c.expect); break;
          }
          case 'walk':
            expect(walkSummary(walkRoute(graphOf(c.no_safety), c.from!, c.to!))).toEqual(c.expect); break;
          case 'plan': {
            const got = plan(graphOf(c.no_safety), network!, c.from!, c.to!).map((p) => `${p.legs.map((l) => l.kind === 'walk'
              ? `walk ${r10(l.metres)}m`
              : `ride ${l.route_id} ${l.stops}st ${l.headway_minutes === null ? 'no-headway' : `every ${l.headway_minutes}`}`).join(' > ')} [${p.range[0]}-${p.range[1]}]`);
            expect(got).toEqual(c.expect); break;
          }
        }
      });
    }
  });
}
