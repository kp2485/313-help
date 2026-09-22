// "Safe streets" (pipeline/src/ingest-crashes.ts, docs/13). These tests never touch the network: they run the
// aggregation over made-up crashes and check the committed file and the script itself.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES, FIELDS, LAYER, LICENSE_PAGE, NOTICE, WINDOW, aggregate, cityWhere, pickYears, rowOf, type Crash } from '../src/ingest-crashes.js';
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
    expect(got.neighborhoods.nbh_a!.window).toEqual({ walk: 6, bike: 5, severe: 0 });
    expect(got.neighborhoods.nbh_b!.window).toEqual({ walk: 7, bike: 0, severe: 0 });
    // Each year of the window too, exact, and the window is their sum (2026-09-22: nothing is hidden).
    expect(got.neighborhoods.nbh_a!.years).toEqual({ '2020': { walk: 6, bike: 5, severe: 0 }, '2021': { walk: 0, bike: 0, severe: 0 } });
    expect(got.neighborhoods.nbh_b!.years).toEqual({ '2020': { walk: 0, bike: 0, severe: 0 }, '2021': { walk: 7, bike: 0, severe: 0 } });
    // Every neighborhood gets a row, and a row is the window and its years and nothing else.
    expect(Object.keys(got.neighborhoods).sort()).toEqual(['nbh_a', 'nbh_b']);
    expect(Object.keys(got.neighborhoods.nbh_a!).sort()).toEqual(['window', 'years']);
  });
  it('a crash that killed or badly hurt someone is counted once, among the crashes of its mode', () => {
    const crashes = Array.from({ length: 5 }, () => at(-83.045, 2020, { severe: true }));
    const got = aggregate(crashes, HOODS, years).neighborhoods.nbh_a!;
    expect(got.window).toEqual({ walk: 5, bike: 0, severe: 5 });
  });
  it('a crash with both a person walking and a person biking counts in both modes', () => {
    const got = aggregate([at(-83.045, 2020, { bike: true })], HOODS, years).neighborhoods.nbh_a!.window;
    expect(got).toEqual({ walk: 1, bike: 1, severe: 0 });                // a 1 is a 1: nothing is hidden
  });
  it('every count is the exact number, zero included, and a window is the sum of its years (Kyle, 2026-09-22)', () => {
    expect(rowOf({ '2020': { walk: 0, bike: 4, severe: 5 }, '2021': { walk: 1, bike: 0, severe: 0 } }, [2020, 2021]))
      .toEqual({ window: { walk: 1, bike: 4, severe: 5 }, years: { '2020': { walk: 0, bike: 4, severe: 5 }, '2021': { walk: 1, bike: 0, severe: 0 } } });
    expect(JSON.stringify(aggregate([], HOODS, years).neighborhoods)).not.toContain('lt5');
  });
  it('a crash in a hole of an outline is outside it (even-odd)', () => {
    const holed: Neighborhood = { ...box('nbh_h', -83.06), rings: [...box('nbh_h', -83.06).rings, [[-83.057, 42.333], [-83.053, 42.333], [-83.053, 42.337], [-83.057, 42.337], [-83.057, 42.333]]] };
    const got = aggregate([at(-83.055, 2020), at(-83.0585, 2020)], [holed], years);
    expect(got.placed).toBe(1); expect(got.unplaced).toBe(1);
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
    for (const row of Object.values(doc.neighborhoods) as { window: Record<string, unknown>; years: Record<string, Record<string, unknown>> }[]) {
      expect(Object.keys(row).sort()).toEqual(['window', 'years']);      // the window and its years: counts only
      expect(Object.keys(row.window).sort()).toEqual(['bike', 'severe', 'walk']);
      for (const y of Object.values(row.years)) expect(Object.keys(y).sort()).toEqual(['bike', 'severe', 'walk']);
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
  it('the committed file is exact: every count a number, the window the sum of its years, and no "lt5" anywhere', () => {
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;
    const text = readFileSync(file, 'utf8'), doc = JSON.parse(text);
    expect(text).not.toContain('lt5');
    let small = 0;
    for (const row of [...Object.values(doc.neighborhoods), ...Object.values(doc.city_by_name)] as { window: Record<string, number>; years: Record<string, Record<string, number>> }[]) {
      for (const k of ['walk', 'bike', 'severe']) {
        expect(typeof row.window[k]).toBe('number');
        if (row.window[k]! < 5) small++;
        expect(Object.values(row.years).reduce((s, y) => s + y[k]!, 0), k).toBe(row.window[k]);
      }
      expect(Object.keys(row.years)).toEqual(doc.years_covered.map(String));
    }
    expect(small, 'the point of 2026-09-22: small counts are stated').toBeGreaterThan(50);
  });
});

describe('crashes in the bundle', () => {
  it('each neighborhood carries the multi-year totals and the years, and never a rate or a rank', () => {
    const crashes = aggregate([...Array.from({ length: 9 }, () => at(-83.045, 2020)), at(-83.045, 2021, { bike: true })], HOODS, [2020, 2021]).neighborhoods;
    const { neighborhoods } = buildIndicators({ hoods: HOODS, rows: [], parks: [], segments: [], stats: { neighborhoods: {} }, crashes });
    const a = neighborhoods.find((n) => n.id === 'nbh_a')!;
    expect(a.crashes).toEqual({ walk: 10, bike: 1, severe: 0 });
    expect(a.crashes_by_year).toEqual({ '2020': { walk: 9, bike: 0, severe: 0 }, '2021': { walk: 1, bike: 1, severe: 0 } });
    expect(JSON.stringify(a.crashes)).not.toMatch(/rate|rank|per_1000/);
    // The order of the list is the order the neighborhoods came in: nothing is sorted by a crash count.
    expect(neighborhoods.map((n) => n.id)).toEqual(['nbh_a', 'nbh_b']);
    expect(readFileSync(p('pipeline/src/indicators.ts'), 'utf8')).not.toMatch(/sort[(][^)]*crash/);
  });
});
