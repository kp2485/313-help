// City pages for Hamtramck, Highland Park, Dearborn and Detroit (docs/13, DECISIONS 2026-09-22).
//
// Network-free: every fixture below is a hand-written copy of the shape each source really answers with, so the
// arithmetic and the rules are checked without asking anybody's server anything.
//
// The things that could go wrong, and what holds each one:
//  1. a panel gets drawn because a number happens to be there — the ALLOW-LIST is the only thing that decides;
//  2. "Dearborn publishes no blight tickets" turns into a zero or an empty chart — `missing` says it, in words;
//  3. Detroit's 205 neighborhoods change because city pages were added — they are built by a different function
//     from different inputs, and nothing in this file can reach them;
//  4. suppression spreads or shrinks — crashes keep "fewer than 5"; parks, roads, homes and permits are real
//     numbers however small (DECISIONS 2026-09-22);
//  5. two panels with different owners share one source line — sources are per panel and interned by key.

import { describe, expect, it } from 'vitest';
import type { BundleRow } from '@313help/query';
import { bandOf, parseBps, roadBands, CITIES, DETROIT_ONLY, PASER } from '../src/ingest-cities.js';
import { buildAreas, buildIndicators, type AreaSource } from '../src/indicators.js';

// ---- fixtures -------------------------------------------------------------------------------------------

/** A square around (42.40, -83.05): stands in for Hamtramck. Nothing outside it is in the city. */
const SQUARE: [number, number][][] = [[[-83.07, 42.38], [-83.03, 42.38], [-83.03, 42.42], [-83.07, 42.42], [-83.07, 42.38]]];
/** A second square, well away from the first, for a second city that must never borrow the first's numbers. */
const FAR: [number, number][][] = [[[-83.25, 42.29], [-83.17, 42.29], [-83.17, 42.34], [-83.25, 42.34], [-83.25, 42.29]]];

const row = (id: string, category: string, lat: number, lon: number): BundleRow =>
  ({ id, name: id, category, status: 'active', lat, lon } as unknown as BundleRow);

const source = (name: string, notice?: string): AreaSource =>
  ({ name, url: `https://example.org/${name}`, license: 'test', last_edited: '2026-09-01', ...(notice ? { notice } : {}) });

const SOURCES: Record<string, AreaSource> = {
  parks: source('SEMCOG parks', 'Copyright © 2025 SEMCOG.'),
  detroit_parks: source('City of Detroit parks'),
  roads: source('SEMCOG pavement', 'Copyright © 2025 SEMCOG.'),
  vacancy: source('SEMCOG 2020 Census totals', 'Copyright © 2025 SEMCOG.'),
  permits: source('Census Building Permits Survey'),
};
const CRASH_SOURCE = source('SEMCOG crashes', 'Copyright © 2025 SEMCOG.');

const city = (over: Partial<Parameters<typeof buildAreas>[0]['cities'][number]> = {}) => ({
  id: 'city_hamtramck', name: 'Hamtramck', children: 'none' as const,
  center: [-83.05, 42.4] as [number, number], rings: SQUARE,
  parks: { count: 3, acres: 15 },
  roads: { pieces: 244, miles: 12.4, good_pct: 44, fair_pct: 36, poor_pct: 20 },
  vacancy: { housing_units: 8911, vacant: 772, pct: 9, population: 28433, land_acres: 1337 },
  parcels: 6876,
  permits: [
    { year: 2021, buildings: 0, units: 0, months_reported: 0 },
    { year: 2022, buildings: 4, units: 4, months_reported: 12 },
    { year: 2023, buildings: 5, units: 5, months_reported: 12 },
    { year: 2024, buildings: 7, units: 7, months_reported: 12 },
    { year: 2025, buildings: 4, units: 4, months_reported: 12 },
  ],
  ...over,
});

const build = (cities: ReturnType<typeof city>[], rows: BundleRow[] = [], extra: Partial<Parameters<typeof buildAreas>[0]> = {}) =>
  buildAreas({ cities, sources: SOURCES, rows, crashes: { Hamtramck: { window: { walk: 69, bike: 29, severe: 'lt5' } } }, crashSource: CRASH_SOURCE, ...extra });

// ---- PASER ----------------------------------------------------------------------------------------------

describe('PASER bands are the raters’ own groups, never a score of ours', () => {
  it('puts every rating from 1 to 10 in exactly one of the three groups the owner publishes', () => {
    expect(PASER).toEqual({ poor: [1, 2, 3, 4], fair: [5, 6, 7], good: [8, 9, 10] });
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(bandOf);
    expect(all).toEqual(['poor', 'poor', 'poor', 'poor', 'fair', 'fair', 'fair', 'good', 'good', 'good']);
    // 0 is "not rated" in the layer, and an unrated piece is never a band and never a number on a page.
    expect(bandOf(0)).toBeNull();
    expect(bandOf(11)).toBeNull();
  });

  it('shares are of RATED miles, add to exactly 100, and skip unrated pieces', () => {
    const b = roadBands([
      { rating: 0, pieces: 999, miles: 500 },                 // unrated: must not reach the arithmetic
      { rating: 2, pieces: 10, miles: 10 },
      { rating: 6, pieces: 10, miles: 20 },
      { rating: 9, pieces: 10, miles: 70 },
    ])!;
    expect(b).toEqual({ pieces: 30, miles: 100, good_pct: 70, fair_pct: 20, poor_pct: 10 });
    expect(b.good_pct + b.fair_pct + b.poor_pct).toBe(100);
  });

  it('never prints 99% or 101%: the rounding lands in one band, not on the page', () => {
    const b = roadBands([{ rating: 3, pieces: 1, miles: 1 }, { rating: 6, pieces: 1, miles: 1 }, { rating: 9, pieces: 1, miles: 1 }])!;
    expect(b.good_pct + b.fair_pct + b.poor_pct).toBe(100);
  });

  it('a city with no rated road at all gets no band object, so the panel is absent rather than empty', () => {
    expect(roadBands([])).toBeNull();
    expect(roadBands([{ rating: 0, pieces: 5, miles: 3 }])).toBeNull();
  });
});

// ---- the Census Building Permits Survey -----------------------------------------------------------------

const HEADER = 'Survey,State,6-Digit,County,Census Place,FIPS Place,FIPS MCD,Pop,CSA,CBSA,Footnote,Central,Zip,Region,Division,Number of,Place,,1-unit,,,2-units,,,3-4 units,,,5+ units,,,1-unit rep,,,2-units rep,,,3-4 units rep,,,5+ units rep';
/** Two real-shaped rows: Michigan's Highland Park, and Illinois's, which is in the same file. */
const BPS = [HEADER,
  '2025,26,415000,163,2870,38180 ,38180 ,10712 ,220,19820, , ,48203      ,2,3,12,Highland Park,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  '2025,17,353800,097,2595,34722 ,50364 ,29427 ,176,16980, , ,60035      ,2,3,0,Highland Park,23,23,13727076,0,0,0,0,0,0,14,83,17083226,0,0,0,0,0,0,0,0,0,0,0,0',
  '2025,26,391500,163,2660,36280 ,36280 ,21438 ,220,19820, , ,482123315  ,2,3,12,Hamtramck,4,4,1090750,0,0,0,0,0,0,0,0,0,4,4,1090750,0,0,0,0,0,0,0,0,0',
  '2025,26,220000,163,1170,22000 ,22000 ,665369 ,220,19820, , ,48226      ,2,3,12,Detroit,662,662,47600191,220,440,21104485,11,40,2882240,30,1478,219390050,0,0,0,0,0,0,0,0,0,0,0,0',
].join('\n');

describe('the Building Permits Survey is matched on codes, never on a name', () => {
  it('reads Michigan’s Highland Park and not Illinois’s, though both are in the file and share a name', () => {
    expect(parseBps(BPS, 2025, '26', '38180')).toEqual({ year: 2025, buildings: 0, units: 0, months_reported: 12 });
    expect(parseBps(BPS, 2025, '17', '38180')).toBeNull();
  });

  it('adds the four size classes into one count of homes, and keeps the buildings separately', () => {
    // Detroit 2025: 662 + 220 + 11 + 30 buildings, 662 + 440 + 40 + 1478 homes.
    expect(parseBps(BPS, 2025, '26', '22000')).toEqual({ year: 2025, buildings: 923, units: 2620, months_reported: 12 });
    expect(parseBps(BPS, 2025, '26', '36280')).toEqual({ year: 2025, buildings: 4, units: 4, months_reported: 12 });
  });

  it('carries how many months the place reported, so a part-reported year can say so', () => {
    expect(parseBps(BPS, 2025, '26', '38180')!.months_reported).toBe(12);
    expect(parseBps('2024,26,391500,163,2660,36280 ,36280 ,0 ,0,0, , ,0,2,3,1,Hamtramck,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0', 2024, '26', '36280')!.months_reported).toBe(1);
  });

  it('a place that is not in the file at all is null, which is what makes a panel absent', () => {
    expect(parseBps(BPS, 2025, '26', '99999')).toBeNull();
  });
});

// ---- the allow-list -------------------------------------------------------------------------------------

describe('the allow-list decides what a city page draws', () => {
  it('lists only the panels this city has a source for, and names that source per panel', () => {
    const { areas, area_sources } = build([city()]);
    const a = areas[0]!;
    expect(a.panels).toEqual(['help', 'parks', 'crashes', 'roads', 'vacancy', 'permits']);
    expect(a.sources).toEqual({
      parks: 'src_semcog_parks', crashes: 'src_semcog_crashes', roads: 'src_semcog_pavement',
      vacancy: 'src_census_vacancy', permits: 'src_census_bps',
    });
    // Interned: every panel's source string appears in the bundle once, under the key the panel names.
    for (const key of Object.values(a.sources)) expect(area_sources[key]).toBeTruthy();
    expect(area_sources.src_census_bps!.notice).toBeUndefined();
    expect(area_sources.src_semcog_pavement!.notice).toContain('SEMCOG');
  });

  it('Detroit’s parks come from the City’s own list and everybody else’s from SEMCOG — two owners, two source lines', () => {
    const { areas, area_sources } = build(
      [city(), city({ id: 'city_detroit', name: 'Detroit', children: 'neighborhood', rings: FAR, center: [-83.21, 42.31] })],
      [],
      { detroitParks: [{ lat: 42.31, lon: -83.21, acres: 4 }, { lat: 42.32, lon: -83.2, acres: 6 }, { lat: 1, lon: 1, acres: 99 }] },
    );
    const detroit = areas.find((a) => a.id === 'city_detroit')!;
    expect(detroit.sources.parks).toBe('src_detroit_parks');
    expect(areas.find((a) => a.id === 'city_hamtramck')!.sources.parks).toBe('src_semcog_parks');
    expect(detroit.sources.parks).not.toBe(areas.find((a) => a.id === 'city_hamtramck')!.sources.parks);
    expect(area_sources.src_detroit_parks!.name).toBe('City of Detroit parks');
    // Only the parks inside Detroit's own outline are counted; the one at (1, 1) is nowhere near it.
    expect(detroit.places.parks).toBe(2);
    expect(detroit.park_acres).toBe(10);
  });

  it('a source a city has no number for is left out of the allow-list entirely', () => {
    const { areas } = build([city({ roads: undefined, vacancy: undefined })]);
    expect(areas[0]!.panels).not.toContain('roads');
    expect(areas[0]!.panels).not.toContain('vacancy');
    expect(areas[0]!.sources.roads).toBeUndefined();
    expect(areas[0]!.roads_bands).toBeUndefined();
  });

  it('every panel in the allow-list has the number it needs, so no page can draw an empty box', () => {
    const { areas } = build([city()]);
    const a = areas[0]!;
    const has: Record<string, boolean> = {
      help: true, parks: a.places.parks !== undefined, crashes: !!a.crashes,
      roads: !!a.roads_bands, vacancy: !!a.vacancy, permits: !!a.permits_by_year?.length,
    };
    for (const panel of a.panels) expect(has[panel], panel).toBe(true);
  });
});

// ---- absent, never zero ---------------------------------------------------------------------------------

describe('what a city’s public sources do not support is said in words, not drawn as a zero', () => {
  it('names all seven Detroit-only panels, with the reason, on a city that is not Detroit', () => {
    const { areas } = build([city()]);
    const missing = areas[0]!.missing.filter((m) => m.why === 'not_published').map((m) => m.panel);
    expect(missing).toEqual([...DETROIT_ONLY]);
    for (const panel of DETROIT_ONLY) expect(areas[0]!.panels).not.toContain(panel);
  });

  it('Detroit’s own city page claims nothing is missing, because those panels are on its neighborhood pages', () => {
    const { areas } = build([city({ id: 'city_detroit', name: 'Detroit', children: 'neighborhood' })]);
    expect(areas[0]!.missing.filter((m) => m.why === 'not_published')).toEqual([]);
  });

  it('a city where every published year authorised no new home gets NO permits panel and a reason of its own', () => {
    const none = city({
      id: 'city_highland_park', name: 'Highland Park',
      permits: [2021, 2022, 2023, 2024, 2025].map((year) => ({ year, buildings: 0, units: 0, months_reported: 12 })),
    });
    const a = build([none]).areas[0]!;
    expect(a.panels).not.toContain('permits');
    expect(a.permits_by_year).toBeUndefined();
    // The reason is "we looked and the answer was none", which is a different sentence from "nobody publishes it".
    expect(a.missing).toContainEqual({ panel: 'permits', why: 'none_recorded' });
    expect(a.missing.find((m) => m.panel === 'permits')!.why).not.toBe('not_published');
  });

  it('one year with a permit is enough for the panel, and the zero years stay in it as real years', () => {
    const a = build([city()]).areas[0]!;
    expect(a.panels).toContain('permits');
    expect(a.permits_by_year!.map((y) => y.units)).toEqual([0, 4, 5, 7, 4]);
    expect(a.missing.some((m) => m.panel === 'permits')).toBe(false);
  });
});

// ---- suppression scope ----------------------------------------------------------------------------------

describe('suppression is only where suppression protects somebody (docs/13, honesty rule 2)', () => {
  it('crash counts keep "fewer than 5" exactly as the crash file wrote them', () => {
    const a = build([city()]).areas[0]!;
    expect(a.crashes).toEqual({ walk: 69, bike: 29, severe: 'lt5' });
  });

  it('parks, roads, homes, permits and parcels are real numbers however small', () => {
    const tiny = city({ parks: { count: 3, acres: 15 }, permits: [{ year: 2025, buildings: 1, units: 1, months_reported: 12 }] });
    const a = build([tiny]).areas[0]!;
    expect(a.places.parks).toBe(3);
    expect(a.park_acres).toBe(15);
    expect(a.permits_by_year).toEqual([{ year: 2025, buildings: 1, units: 1, months_reported: 12 }]);
    expect(a.vacancy).toEqual({ housing_units: 8911, vacant: 772, pct: 9, population: 28433 });
    expect(a.parcels).toBe(6876);
    for (const v of [a.places.parks, a.park_acres, a.parcels, a.roads_bands!.pieces]) expect(typeof v).toBe('number');
  });
});

// ---- our own listings -----------------------------------------------------------------------------------

describe('"help nearby" counts what is IN the city, and the nearest place may be outside it', () => {
  const rows = [
    row('sal_in_food', 'food.pantry', 42.4, -83.05),                 // inside Hamtramck
    row('sal_in_clinic', 'health.clinic', 42.39, -83.04),            // inside
    row('sal_out_food', 'food.pantry', 42.3, -83.2),                 // outside, and further away
    row('sal_just_outside', 'rec.center', 42.43, -83.05),            // just over the line: NOT in the city
  ];

  it('counts only the listings inside the outline — half a mile outside Hamtramck is Detroit', () => {
    const a = build([city()], rows).areas[0]!;
    expect(a.help.total).toBe(2);
    expect(a.help.by.food).toBe(1);
    expect(a.help.by.health).toBe(1);
    expect(a.help.by.rec).toBe(0);
    expect(a.places.rec_centers).toBe(0);
  });

  it('says which kinds our list has none of, and says it about OUR list', () => {
    const a = build([city()], [rows[0]!]).areas[0]!;
    expect(a.help.none_listed_yet).toEqual(['health', 'harm']);
    expect(a.help.coverage_checked).toBe(false);
  });

  it('measures the nearest food, clinic, Narcan and indoor place over every listing, not only this city’s', () => {
    const a = build([city({ parks: undefined })], [row('sal_only_food', 'food.pantry', 42.3, -83.2)]).areas[0]!;
    expect(a.help.total).toBe(0);
    expect(a.help.nearest_id.food).toBe('sal_only_food');
    expect(a.help.nearest_miles.food).toBeGreaterThan(0);
    expect(a.help.nearest_id.clinic).toBeNull();
    expect(a.help.nearest_miles.clinic).toBeNull();
  });

  it('never names a sensitive or private listing, whatever is nearest', () => {
    const a = build([city()], [
      row('sal_dv', 'shelter.dv', 42.4, -83.05),
      row('sal_mental', 'health.mental', 42.4, -83.05),
      row('sal_rehab', 'treatment.residential', 42.4, -83.05),
      row('sal_clinic', 'health.clinic', 42.3, -83.2),
    ]).areas[0]!;
    expect(Object.values(a.help.nearest_id)).not.toContain('sal_dv');
    expect(Object.values(a.help.nearest_id)).not.toContain('sal_mental');
    expect(Object.values(a.help.nearest_id)).not.toContain('sal_rehab');
    expect(a.help.nearest_id.clinic).toBe('sal_clinic');
  });
});

// ---- the 205 neighborhoods are untouched -----------------------------------------------------------------

describe('adding city pages cannot change a single Detroit neighborhood', () => {
  it('builds the two from different inputs, and the city builder is never handed a neighborhood', () => {
    const ind = buildIndicators({ hoods: [], rows: [], parks: [], segments: [], stats: { neighborhoods: {} } });
    const cityDoc = build([city()]);
    // Nothing the city builder returns can land on `neighborhoods`, `sources` or `city` in the bundle: the keys
    // are disjoint, so the additive promise is structural rather than a habit of build.ts.
    expect(Object.keys(cityDoc)).toEqual(['cities', 'areas', 'area_sources']);
    for (const k of Object.keys(cityDoc)) expect(Object.keys(ind)).not.toContain(k);
    expect(ind.neighborhoods).toEqual([]);
  });

  it('keeps the two kinds of id apart, so no lookup can ever return the wrong kind of page', () => {
    const { areas, cities } = build([city()]);
    for (const a of areas) expect(a.id.startsWith('city_')).toBe(true);
    for (const c of cities) expect(c.id.startsWith('city_')).toBe(true);
    for (const c of CITIES) expect(c.id.startsWith('city_')).toBe(true);
  });

  it('does not mutate the rows or the city rows it was handed', () => {
    const rows = [row('sal_in_food', 'food.pantry', 42.4, -83.05)];
    const before = JSON.stringify(rows), cities = [city()], citiesBefore = JSON.stringify(cities);
    build(cities, rows);
    expect(JSON.stringify(rows)).toBe(before);
    expect(JSON.stringify(cities)).toBe(citiesBefore);
  });
});

// ---- no ranking -----------------------------------------------------------------------------------------

describe('no city is ever ranked against another (docs/13, honesty rule 1)', () => {
  it('carries no score, no rank and no other city’s number on any area', () => {
    const { areas } = build([city(), city({ id: 'city_dearborn', name: 'Dearborn', rings: FAR, center: [-83.21, 42.31] })]);
    for (const a of areas) {
      expect(Object.keys(a)).not.toContain('rank');
      expect(Object.keys(a)).not.toContain('score');
      expect(a.city).toBe(a.id);
      expect(a.kind).toBe('city');
    }
    // Dearborn's fixture is identical to Hamtramck's except its outline, and it gets Hamtramck's crash numbers
    // nowhere: a city with no row in the crash file simply has no crash panel.
    const dearborn = areas.find((a) => a.id === 'city_dearborn')!;
    expect(dearborn.crashes).toBeUndefined();
    expect(dearborn.panels).not.toContain('crashes');
  });

  it('the index rows carry a name and where the page is, and no indicator at all', () => {
    const { cities } = build([city()]);
    expect(cities).toEqual([{ id: 'city_hamtramck', name: 'Hamtramck', kind: 'city', children: 'none' }]);
  });
});
