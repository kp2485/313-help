// "Safe streets" (pipeline/src/ingest-crashes.ts, docs/13). These tests never touch the network: they run the
// aggregation over made-up crashes and check the committed file and the script itself.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES, FIELDS, LAYER, LICENSE_PAGE, NOTICE, WINDOW, aggregate, cityWhere, hide, pickYears, suppressedCount, type Crash } from '../src/ingest-crashes.js';
import { buildIndicators } from '../src/indicators.js';
import type { Neighborhood } from '../src/ingest-neighborhoods.js';
import { p } from '../src/util.js';

/** Two square neighborhoods side by side, near Campus Martius. */
const box = (id: string, x0: number): Neighborhood => ({ id, name: id, district: 1, center: [x0 + 0.005, 42.335], rings: [[[x0, 42.33], [x0 + 0.01, 42.33], [x0 + 0.01, 42.34], [x0, 42.34], [x0, 42.33]]] });
const HOODS = [box('nbh_a', -83.05), box('nbh_b', -83.04)];
const at = (x: number, year: number, o: Partial<Crash> = {}): Crash => ({ year, walk: true, bike: false, severe: false, pt: [x, 42.335], ...o });

describe('crashes: adding up by neighborhood', () => {
  const years = [2020, 2021];
  it('puts each crash in the outline that holds it, by mode, and leaves the rest unplaced', () => {
    const crashes: Crash[] = [
      ...Array.from({ length: 6 }, () => at(-83.045, 2020)),                       // 6 walking in A, 2020
      ...Array.from({ length: 5 }, () => at(-83.045, 2020, { walk: false, bike: true })),
      ...Array.from({ length: 7 }, () => at(-83.035, 2021)),                       // 7 walking in B, 2021
      at(-83.2, 2020),                                                              // outside every outline
      at(-83.045, 2019),                                                            // a year the panel does not cover
    ];
    const got = aggregate(crashes, HOODS, years);
    expect(got.placed).toBe(18);
    expect(got.unplaced).toBe(1);
    expect(got.neighborhoods.nbh_a!.window).toEqual({ walk: 6, bike: 5, severe: 'lt5' });
    expect(got.neighborhoods.nbh_b!.window).toEqual({ walk: 7, bike: 'lt5', severe: 'lt5' });
    // Every neighborhood gets a row, and a row is one multi-year total and nothing else.
    expect(Object.keys(got.neighborhoods).sort()).toEqual(['nbh_a', 'nbh_b']);
    expect(Object.keys(got.neighborhoods.nbh_a!)).toEqual(['window']);
  });
  it('a crash that killed or badly hurt someone is counted once, among the crashes of its mode', () => {
    const crashes = Array.from({ length: 5 }, () => at(-83.045, 2020, { severe: true }));
    const got = aggregate(crashes, HOODS, years).neighborhoods.nbh_a!;
    expect(got.window).toEqual({ walk: 5, bike: 'lt5', severe: 5 });
  });
  it('a crash with both a person walking and a person biking counts in both modes', () => {
    const got = aggregate([at(-83.045, 2020, { bike: true })], HOODS, years).neighborhoods.nbh_a!.window;
    expect(got).toEqual({ walk: 'lt5', bike: 'lt5', severe: 'lt5' });   // still hidden: one is under 5
  });
  it('hides every count under 5, including zero (docs/13 honesty rule 2)', () => {
    expect(hide({ walk: 0, bike: 4, severe: 5 })).toEqual({ walk: 'lt5', bike: 'lt5', severe: 5 });
    const hidden = suppressedCount(aggregate([], HOODS, years).neighborhoods);
    expect(hidden.cells).toBe(2 * 3);                                     // 2 neighborhoods x 3 numbers
    expect(hidden.places).toBe(2);
  });
  it('covers the most recent complete years the layer offers, newest last', () => {
    expect(pickYears(2024)).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(pickYears(2025, 3)).toEqual([2023, 2024, 2025]);
    expect(WINDOW).toBe(5);
  });
  it('asks only for crashes with a person walking or biking, in the four cities we serve', () => {
    const w = cityWhere([2020, 2024]);
    expect(w).toContain('PEDESTRIAN = 1 OR BICYCLE = 1');
    expect(w).toContain('YEAR >= 2020');
    expect(w).toContain('YEAR <= 2024');
    for (const c of CITIES) expect(w).toContain(`'${c}'`);
    expect(CITIES).toEqual(['Detroit', 'Hamtramck', 'Highland Park', 'Dearborn']);
  });
});

describe('crashes: what we refuse to keep', () => {
  const src = readFileSync(p('pipeline/src/ingest-crashes.ts'), 'utf8');
  it('asks the layer for five fields and no other: no date, time, age, driver, vehicle or crash id', () => {
    expect(FIELDS).toEqual(['YEAR', 'PEDESTRIAN', 'BICYCLE', 'KCOUNT', 'ACOUNT']);
    for (const f of ['DATE_FULL', 'TIME_FULL', 'MONTH', 'DAY', 'HOUR', 'CRASHID_UD10', 'ELDERLY', 'YOUNG', 'ALCOHOL', 'DRUG', 'HITNRUN', 'UNBELTED', 'SPEEDING', 'DISTRACTED'])
      expect(FIELDS, f).not.toContain(f);
  });
  it('we identify ourselves honestly, and a refusal stops the run instead of being worked around', () => {
    expect(src).toMatch(/'user-agent': '313help-pipeline/);
    expect(src).not.toMatch(/Mozilla|Chrome\/|Safari\//);
    expect(src).toMatch(/stopping/);
  });
  it('the committed file holds counts only: no coordinate, no date finer than a year, no crash id', () => {
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;                                       // a checkout that has not run the ingest yet
    const text = readFileSync(file, 'utf8'), doc = JSON.parse(text);
    expect(doc.source.url).toBe(LAYER);
    expect(doc.source.records_from).toMatch(/Michigan State Police/);
    expect(doc.years[0]).toBeGreaterThanOrEqual(2015);
    expect(doc.years[1]).toBeGreaterThan(doc.years[0]);
    expect(doc.years_covered).toEqual(Array.from({ length: doc.years[1] - doc.years[0] + 1 }, (_, i) => doc.years[0] + i));
    expect(Object.keys(doc.neighborhoods).length).toBeGreaterThan(190);
    // No latitude, longitude or timestamp anywhere in the file.
    expect(text).not.toMatch(/-8[23]\.\d/);
    expect(text).not.toMatch(/42\.\d\d/);
    expect(text).not.toMatch(/\d{4}-\d\d-\d\dT/);
    for (const row of Object.values(doc.neighborhoods) as { window: Record<string, unknown> }[]) {
      expect(Object.keys(row).sort()).toEqual(['window']);               // nothing per year: see the suppression test
      expect(Object.keys(row.window).sort()).toEqual(['bike', 'severe', 'walk']);
    }
  });
  it("says what the licence actually is, and carries the notice SEMCOG's agreement requires", () => {
    expect(NOTICE(2026)).toBe('Copyright © 2026 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.');
    expect(src).toContain(LICENSE_PAGE);
    expect(src).toMatch(/indemnif/i);                                     // the clause a person has to accept
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    expect(doc.source.license).toBe('SEMCOG Copyright License Agreement');
    expect(doc.source.license).not.toMatch(/unstated/);
    expect(doc.source.license_url).toBe(LICENSE_PAGE);
    // "with the appropriate year inserted": the layer's own year, not today's, so the notice never drifts.
    expect(doc.source.license_notice).toBe(NOTICE(doc.source.last_edited.slice(0, 4)));
    expect(doc.source.review).toMatch(/indemnif/i);
    expect(doc.source.review).toMatch(/MSP has not been asked/);          // the other owner's terms, still unasked
  });
  it('the counts in the committed file are already hidden under 5', () => {
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const row of [...Object.values(doc.neighborhoods), ...Object.values(doc.city_by_name)] as { window: Record<string, number | string> }[])
      for (const [k, v] of Object.entries(row.window)) expect(v === 'lt5' || (typeof v === 'number' && v >= 5), `${k}=${v}`).toBe(true);
  });
});

/**
 * Hidden has to mean hidden. The file used to publish a per-year count *and* the five-year total for the same
 * place, each suppressed on its own, so a hidden year was just the total minus the published years: eighteen
 * cells came out exactly (2026-09-20). This walks every hidden cell in the committed file and proves that more
 * than one value is still consistent with everything the file publishes — per place (a severe crash is one of
 * that place's walking or biking crashes, so `severe <= walk + bike`) and against the city total it belongs to.
 */
describe('crashes: a hidden count cannot be worked out from the published ones', () => {
  const MAX = 4;                                                          // "lt5" means 0..4
  const feasible = (window: Record<string, number | string>): Record<string, Set<number>> => {
    const opts = (k: string) => (window[k] === 'lt5' ? [0, 1, 2, 3, 4] : [window[k] as number]);
    const ok: Record<string, Set<number>> = { walk: new Set(), bike: new Set(), severe: new Set() };
    for (const w of opts('walk')) for (const b of opts('bike')) for (const s of opts('severe')) if (s <= w + b) { ok.walk!.add(w); ok.bike!.add(b); ok.severe!.add(s); }
    return ok;
  };

  it('two or more values fit every hidden cell, in each place and against its city total', () => {
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const rows = Object.entries(doc.neighborhoods) as [string, { window: Record<string, number | string> }][];
    for (const [id, row] of rows) {
      const ok = feasible(row.window);
      for (const k of ['walk', 'bike', 'severe']) if (row.window[k] === 'lt5') expect(ok[k]!.size, `${id} ${k}`).toBeGreaterThan(1);
    }
    // Detroit's neighborhoods sit inside Detroit's published total, and crashes outside every outline are not
    // published at all, so the total only ever gives an upper bound. Prove the slack is wider than one value.
    for (const k of ['walk', 'bike', 'severe'] as const) {
      const known = rows.reduce((n, [, r]) => n + (typeof r.window[k] === 'number' ? (r.window[k] as number) : 0), 0);
      const hidden = rows.filter(([, r]) => r.window[k] === 'lt5').length;
      const city = doc.city.window[k];
      if (typeof city !== 'number' || !hidden) continue;
      // With one hidden cell set to v and the others to 0, the sum must still fit under the city total.
      expect(city - known, `${k}: only one value fits under the city total`).toBeGreaterThan(1);
      expect(hidden * MAX, `${k}: the hidden cells cannot even reach the city total, so they are all pinned high`).toBeGreaterThan(city - known);
    }
  });

  it('catches the shape that leaked: a total beside its parts, each suppressed on its own', () => {
    // 2020-2024 walking counts for one place: 7, 6, <5, <5, <5 with a five-year total of 14 leaves 1 to split
    // between three hidden years -- which is 1, 0, 0 in some order, so each is known to be 0 or 1, not 0..4.
    // A total of 25 leaves 12 for three cells that cannot hold more than 4 each: every one of them is exactly 4.
    const fits = (parts: (number | string)[], total: number, at: number) => {
      const hidden = parts.filter((v) => v === 'lt5').length;
      const rest = total - parts.reduce<number>((n, v) => n + (typeof v === 'number' ? v : 0), 0);
      const values = new Set<number>();
      const walk = (i: number, left: number, chosen: number[]) => {
        if (i === hidden) { if (left === 0) values.add(chosen[at]!); return; }
        for (let v = 0; v <= MAX; v++) walk(i + 1, left - v, [...chosen, v]);
      };
      walk(0, rest, []);
      return values;
    };
    expect(fits([7, 6, 'lt5', 'lt5', 'lt5'], 14, 0)).toEqual(new Set([0, 1]));
    expect(fits([7, 6, 'lt5', 'lt5', 'lt5'], 25, 0)).toEqual(new Set([4]));      // pinned exactly: the old leak
    // Which is why the file publishes the total and nothing else to subtract from it.
    const got = aggregate([], HOODS, [2020, 2021]).neighborhoods.nbh_a!;
    expect(JSON.stringify(got)).not.toMatch(/20(20|21)/);
  });
});

describe('crashes in the bundle', () => {
  it('each neighborhood carries the multi-year totals only, and never a rate or a rank', () => {
    const crashes = aggregate([...Array.from({ length: 9 }, () => at(-83.045, 2020))], HOODS, [2020]).neighborhoods;
    const { neighborhoods } = buildIndicators({ hoods: HOODS, rows: [], parks: [], segments: [], stats: { neighborhoods: {} }, crashes });
    const a = neighborhoods.find((n) => n.id === 'nbh_a')!;
    expect(a.crashes).toEqual({ walk: 9, bike: 'lt5', severe: 'lt5' });
    expect(JSON.stringify(a.crashes)).not.toMatch(/rate|rank|per_1000/);
    // The order of the list is the order the neighborhoods came in: nothing is sorted by a crash count.
    expect(neighborhoods.map((n) => n.id)).toEqual(['nbh_a', 'nbh_b']);
    expect(readFileSync(p('pipeline/src/indicators.ts'), 'utf8')).not.toMatch(/sort[(][^)]*crash/);
  });
});
