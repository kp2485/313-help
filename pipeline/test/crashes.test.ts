// "Safe streets" (pipeline/src/ingest-crashes.ts, docs/13). These tests never touch the network: they run the
// aggregation over made-up crashes and check the committed file and the script itself.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES, FIELDS, LAYER, WINDOW, aggregate, cityWhere, hide, pickYears, suppressedCount, type Crash } from '../src/ingest-crashes.js';
import { buildIndicators } from '../src/indicators.js';
import type { Neighborhood } from '../src/ingest-neighborhoods.js';
import { p } from '../src/util.js';

/** Two square neighborhoods side by side, near Campus Martius. */
const box = (id: string, x0: number): Neighborhood => ({ id, name: id, district: 1, center: [x0 + 0.005, 42.335], rings: [[[x0, 42.33], [x0 + 0.01, 42.33], [x0 + 0.01, 42.34], [x0, 42.34], [x0, 42.33]]] });
const HOODS = [box('nbh_a', -83.05), box('nbh_b', -83.04)];
const at = (x: number, year: number, o: Partial<Crash> = {}): Crash => ({ year, walk: true, bike: false, severe: false, pt: [x, 42.335], ...o });

describe('crashes: adding up by neighborhood and year', () => {
  const years = [2020, 2021];
  it('puts each crash in the outline that holds it, by mode and by year, and leaves the rest unplaced', () => {
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
    expect(got.neighborhoods.nbh_a!.years['2020']).toEqual({ walk: 6, bike: 5, severe: 'lt5' });
    expect(got.neighborhoods.nbh_a!.years['2021']).toEqual({ walk: 'lt5', bike: 'lt5', severe: 'lt5' });
    expect(got.neighborhoods.nbh_b!.window).toEqual({ walk: 7, bike: 'lt5', severe: 'lt5' });
    // Every neighborhood gets a row, and every row covers exactly the years the panel names.
    expect(Object.keys(got.neighborhoods).sort()).toEqual(['nbh_a', 'nbh_b']);
    expect(Object.keys(got.neighborhoods.nbh_a!.years)).toEqual(['2020', '2021']);
  });
  it('a crash that killed or badly hurt someone is counted once, among the crashes of its mode', () => {
    const crashes = Array.from({ length: 5 }, () => at(-83.045, 2020, { severe: true }));
    const got = aggregate(crashes, HOODS, years).neighborhoods.nbh_a!;
    expect(got.window).toEqual({ walk: 5, bike: 'lt5', severe: 5 });
  });
  it('a crash with both a person walking and a person biking counts in both modes', () => {
    const got = aggregate([at(-83.045, 2020, { bike: true })], HOODS, years).neighborhoods.nbh_a!.years['2020']!;
    expect(got).toEqual({ walk: 'lt5', bike: 'lt5', severe: 'lt5' });   // still hidden: one is under 5
  });
  it('hides every count under 5, including zero (docs/13 honesty rule 2)', () => {
    expect(hide({ walk: 0, bike: 4, severe: 5 })).toEqual({ walk: 'lt5', bike: 'lt5', severe: 5 });
    const hidden = suppressedCount(aggregate([], HOODS, years).neighborhoods);
    expect(hidden.cells).toBe(2 * 2 * 3);                                 // 2 neighborhoods x 2 years x 3 numbers
    expect(hidden.windows).toBe(2);
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
    expect(doc.source.license).toBe('unstated');
    expect(doc.source.records_from).toMatch(/Michigan State Police/);
    expect(doc.source.review).toMatch(/remove the layer if either objects/);
    expect(doc.years[0]).toBeGreaterThanOrEqual(2015);
    expect(doc.years[1]).toBeGreaterThan(doc.years[0]);
    expect(Object.keys(doc.neighborhoods).length).toBeGreaterThan(190);
    // No latitude, longitude or timestamp anywhere in the file.
    expect(text).not.toMatch(/-8[23]\.\d/);
    expect(text).not.toMatch(/42\.\d\d/);
    expect(text).not.toMatch(/\d{4}-\d\d-\d\dT/);
    for (const row of Object.values(doc.neighborhoods) as { years: Record<string, unknown>; window: Record<string, unknown> }[]) {
      expect(Object.keys(row.window).sort()).toEqual(['bike', 'severe', 'walk']);
      for (const y of Object.keys(row.years)) expect(Number(y)).toBeGreaterThanOrEqual(doc.years[0]);
    }
  });
  it('the counts in the committed file are already hidden under 5', () => {
    const file = p('data/ingested/crashes.json');
    if (!existsSync(file)) return;
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const row of Object.values(doc.neighborhoods) as { years: Record<string, Record<string, number | string>>; window: Record<string, number | string> }[])
      for (const cell of [...Object.values(row.years), row.window])
        for (const [k, v] of Object.entries(cell)) expect(v === 'lt5' || (typeof v === 'number' && v >= 5), `${k}=${v}`).toBe(true);
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
