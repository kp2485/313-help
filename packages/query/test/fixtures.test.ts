import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { badge, bundleAge, effectiveNow, helpAlong, milesToSegment, nearestSegment, nextOccurrences, openNow, rank, search } from '../src/index.js';
import type { Alert, BundleRow, Segment } from '../src/index.js';

// Fixtures are plain JSON so the iOS implementation can run the same cases.
const dir = join(__dirname, '../../../schema/fixtures');

interface Case {
  name: string;
  fn: 'openNow' | 'nextOccurrences' | 'badge' | 'rank' | 'bundleAge' | 'effectiveNow' | 'helpAlong' | 'milesToSegment' | 'nearestSegment' | 'search';
  segment?: string; openOnly?: boolean; maxMiles?: number; tolerance?: number;
  now: string;
  text?: string;
  row?: string;
  n?: number;
  query?: Record<string, unknown>;
  index?: { generated_at: string; retired?: boolean };
  expect: unknown;
}
type FixtureRow = Partial<BundleRow> & { id: string };
interface Fixture { description: string; segments?: Segment[]; rows?: FixtureRow[]; alerts?: Alert[]; cases: Case[] }

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

  describe(`${file} — ${fx.description}`, () => {
    for (const c of fx.cases) {
      it(c.name, () => {
        const now = new Date(c.now);
        switch (c.fn) {
          case 'openNow':
            expect(openNow(find(c.row), now, alerts)).toMatchObject(c.expect as object); break;
          case 'nextOccurrences':
            expect(nextOccurrences(find(c.row), now, c.n ?? 3, alerts).map((o) => `${o.date} ${o.opens_at}-${o.closes_at}`)).toEqual(c.expect); break;
          case 'badge':
            expect(badge(find(c.row), now)).toMatchObject(c.expect as object); break;
          case 'rank':
            expect(rank(rows, c.query ?? {}, now, alerts).map((r) => r.row.id)).toEqual(c.expect); break;
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
        }
      });
    }
  });
}
