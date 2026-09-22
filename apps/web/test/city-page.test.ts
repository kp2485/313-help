// City pages for Hamtramck, Highland Park, Dearborn and Detroit (docs/13, DECISIONS 2026-09-22).
//
// A city page is the same page as a neighborhood page, drawn from the same components. What makes it a
// different KIND of page is the data, and that is what this file holds:
//
//  1. the ALLOW-LIST is the only thing that decides what is drawn — a number in the bundle that is not in
//     `panels` must not appear, and a panel in `panels` must not be an empty box;
//  2. what a city's public sources do not support is one sentence in words — never a zero, never a blank chart;
//  3. every panel prints its OWN owner, its own date and its own required notice. SEMCOG's notice is a condition
//     of use wherever its data appears, and the Census Building Permits Survey is not SEMCOG's;
//  4. no number from another city is anywhere on the page;
//  5. `#/n/city_<slug>` is a real address: the route the Neighborhoods tab has always had serves it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaById, areaPage, cityPage, hoodIndex, isArea, CITY_PANELS, type Area, type AreaSource, type Hood, type Indicators, type Ui } from '../src/hoods.js';
import { fromHash, hashFor } from '../src/router.js';

const root = join(__dirname, '../../..');
const strings = JSON.parse(readFileSync(join(root, 'strings/en.json'), 'utf8')) as Record<string, string>;
const ui: Ui = {
  t: (k, p = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')),
  esc: (x) => String(x), own: (x) => String(x), date: (d) => d, icon: () => '',
  link: (u, l) => `<a href="${u}">${l}</a>`, go: (v) => `data-go='${JSON.stringify(v)}'`, map: (h) => `<div class="map">${h.name}</div>`,
};
const T = (k: string, p: Record<string, string | number> = {}) => ui.t(k, p);

const SEMCOG_NOTE = 'Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.';
const semcog = (name: string): AreaSource => ({ name, url: 'https://maps-semcog.opendata.arcgis.com/layer', license: 'SEMCOG Copyright License Agreement', license_url: 'https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement', notice: SEMCOG_NOTE, last_edited: '2026-09-15' });
const AREA_SOURCES: Record<string, AreaSource> = {
  src_semcog_parks: semcog('SEMCOG — Parks and amenities'),
  src_semcog_pavement: { ...semcog('SEMCOG — Pavement Condition 2003 to 2024 (PASER)'), records_from: "Michigan's Transportation Asset Management Council" },
  src_semcog_crashes: { ...semcog('SEMCOG — Crash Locations, 2015-2024'), records_from: 'Michigan State Police (CJIC)' },
  src_census_vacancy: { ...semcog('SEMCOG — 2020 Census totals by community'), records_from: 'the 2020 U.S. Census' },
  src_census_bps: { name: 'U.S. Census Bureau — Building Permits Survey', url: 'https://www2.census.gov/econ/bps/', license: 'No licence stated; a work of the United States government', last_edited: '2026-09-22', records_from: 'the permit-issuing place' },
  src_detroit_parks: { name: 'City of Detroit parks layer', url: 'https://example.org/parks', license: 'Unstated', last_edited: '2026-09-14' },
};

const DETROIT_ONLY = ['sales', 'blight', 'demolitions', 'issues', 'fires', 'rentals', 'vacant_reg'];

const area = (over: Partial<Area> = {}): Area => ({
  id: 'city_hamtramck', name: 'Hamtramck', city: 'city_hamtramck', kind: 'city', district: null,
  center: [42.39537, -83.05594], rings: [],
  help: { total: 19, by: { food: 6, health: 3 }, nearest_miles: { food: 0.4, clinic: 0.7, narcan: 0.3, indoors: 0.6 }, nearest_id: { food: null, clinic: null, narcan: null, indoors: null }, none_listed_yet: [], coverage_checked: false },
  places: { parks: 3, rec_centers: 1, greenway_open: 0 }, park_acres: 15, parcels: 6876,
  years: {},
  crashes: { walk: 69, bike: 29, severe: 'lt5' },
  roads_bands: { pieces: 244, miles: 12.4, good_pct: 44, fair_pct: 36, poor_pct: 20 },
  vacancy: { housing_units: 8911, vacant: 772, pct: 9, population: 28433 },
  permits_by_year: [
    { year: 2021, buildings: 0, units: 0, months_reported: 0 },
    { year: 2022, buildings: 4, units: 4, months_reported: 12 },
    { year: 2023, buildings: 5, units: 5, months_reported: 12 },
    { year: 2024, buildings: 7, units: 7, months_reported: 12 },
    { year: 2025, buildings: 4, units: 4, months_reported: 12 },
  ],
  panels: ['help', 'parks', 'crashes', 'roads', 'vacancy', 'permits'],
  sources: { parks: 'src_semcog_parks', crashes: 'src_semcog_crashes', roads: 'src_semcog_pavement', vacancy: 'src_census_vacancy', permits: 'src_census_bps' },
  missing: DETROIT_ONLY.map((panel) => ({ panel, why: 'not_published' as const })),
  ...over,
});

const hood: Hood = {
  id: 'nbh_bagley', name: 'Bagley', district: 2, center: [42.3, -83.1], rings: [],
  help: { total: 4, by: {}, nearest_miles: {}, none_listed_yet: [], coverage_checked: true },
  places: { parks: 1, rec_centers: 0, greenway_open: 0 }, years: {},
};

const src = { name: 'City of Detroit neighborhoods layer', url: 'https://example.org/n', last_edited: '2023-12-06' };
const d = (over: Partial<Indicators> = {}): Indicators => ({
  sources: { neighborhoods: src, sales: src, permits: src },
  stats_fetched_at: '2026-09-22', first_year: 2019, partial_year: 2026, near_miles: 0.5, origin: [-83.32, 42.22],
  city: {}, neighborhoods: [hood], segments: {},
  crash_years: [2020, 2024],
  cities: [
    { id: 'city_detroit', name: 'Detroit', kind: 'city', children: 'neighborhood' },
    { id: 'city_hamtramck', name: 'Hamtramck', kind: 'city', children: 'none' },
    { id: 'city_highland_park', name: 'Highland Park', kind: 'city', children: 'none' },
    { id: 'city_dearborn', name: 'Dearborn', kind: 'city', children: 'none' },
  ],
  areas: [area()], area_sources: AREA_SOURCES, pavement_year: 2024, permit_years: [2021, 2022, 2023, 2024, 2025],
  ...over,
});

/** The heading each panel draws, so "this panel is on the page" is asked the way a reader would ask it. */
const HEADS: Record<string, string> = {
  help: strings['hood.help_head']!, parks: strings['city.parks_head']!, crashes: strings['hood.crash_head']!,
  roads: strings['city.roads_head']!, vacancy: strings['city.vacancy_head']!, permits: strings['city.permits_head']!,
};

// ---- the route ------------------------------------------------------------------------------------------

describe('a city page lives at the address the Neighborhoods tab already had', () => {
  it('#/n/city_hamtramck is a neighborhood-tab view, like #/n/nbh_bagley', () => {
    expect(fromHash('#/n/city_hamtramck')).toEqual({ v: 'hood', id: 'city_hamtramck' });
    expect(fromHash('#/n/nbh_bagley')).toEqual({ v: 'hood', id: 'nbh_bagley' });
    expect(hashFor({ v: 'hood', id: 'city_hamtramck' }, () => false)).toBe('#/n/city_hamtramck');
    // `#/c/` is the categories tab and stays that way: a city page never takes it.
    expect(fromHash('#/c/food')).not.toEqual({ v: 'hood', id: 'food' });
  });

  it('one lookup finds either kind, and one page function draws whichever it found', () => {
    const data = d();
    expect(areaById(data, 'nbh_bagley')!.name).toBe('Bagley');
    expect(areaById(data, 'city_hamtramck')!.name).toBe('Hamtramck');
    expect(areaById(data, 'city_nowhere')).toBeNull();
    expect(isArea(areaById(data, 'city_hamtramck')!)).toBe(true);
    expect(isArea(areaById(data, 'nbh_bagley')!)).toBe(false);
    expect(areaPage(areaById(data, 'city_hamtramck')!, data, ui)).toContain(T('city.kind'));
    expect(areaPage(areaById(data, 'nbh_bagley')!, data, ui)).not.toContain(T('city.kind'));
  });

  it('the tab lists the four cities, by name and nothing else', () => {
    const html = hoodIndex(d(), ui, { order: 'abc', query: '', located: false, zip: '', mine: null, locHtml: '' });
    for (const c of ['Detroit', 'Hamtramck', 'Highland Park', 'Dearborn']) expect(html).toContain(c);
    expect(html).toContain(`data-go='{"v":"hood","id":"city_hamtramck"}'`);
    // An index row carries no indicator (docs/13, rule 1): no count, no share, no year.
    const rows = html.slice(html.indexOf(T('city.list_head')));
    expect(rows).not.toMatch(/\b(772|8911|12\.4|69)\b/);
  });

  it('a bundle built before city pages existed draws the tab exactly as it did before', () => {
    const old = d({ cities: undefined, areas: undefined, area_sources: undefined });
    const html = hoodIndex(old, ui, { order: 'abc', query: '', located: false, zip: '', mine: null, locHtml: '' });
    expect(html).toContain(T('hood.only_detroit'));
    expect(html).not.toContain(T('city.list_head'));
    expect(areaById(old, 'city_hamtramck')).toBeNull();
  });
});

// ---- the allow-list -------------------------------------------------------------------------------------

describe('the page draws every allowed panel and not one more', () => {
  it('draws all six for a city that has all six', () => {
    const html = cityPage(area(), d(), ui);
    for (const panel of CITY_PANELS) expect(html, panel).toContain(HEADS[panel]!);
  });

  it('a panel missing from the allow-list is not drawn, even when its number is right there in the data', () => {
    // The numbers stay on the area object; only `panels` shrinks. Nothing may draw from the numbers alone.
    const a = area({ panels: ['help', 'crashes'], sources: { crashes: 'src_semcog_crashes' } });
    const html = cityPage(a, d({ areas: [a] }), ui);
    expect(html).toContain(HEADS.help!);
    expect(html).toContain(HEADS.crashes!);
    for (const panel of ['parks', 'roads', 'vacancy', 'permits']) expect(html, panel).not.toContain(HEADS[panel]!);
    // and none of the numbers leaks out under another heading
    expect(html).not.toContain(T('city.roads_pct', { pct: 20 }));
    expect(html).not.toContain(T('city.vacancy_pct', { pct: 9 }));
  });

  it('draws the panels in one fixed order, whatever order the allow-list is written in', () => {
    const a = area({ panels: ['permits', 'help', 'vacancy', 'parks', 'roads', 'crashes'] });
    const html = cityPage(a, d({ areas: [a] }), ui);
    const at = CITY_PANELS.map((k) => html.indexOf(HEADS[k]!));
    expect(at).toEqual([...at].sort((x, y) => x - y));
  });

  it('never prints a MISSING string: every key the page uses is in strings/en.json', () => {
    expect(cityPage(area(), d(), ui)).not.toContain('MISSING:');
  });
});

// ---- absent, never zero ---------------------------------------------------------------------------------

describe('what this city does not publish is one sentence, in words', () => {
  it('names all seven Detroit-only panels and draws no chart for any of them', () => {
    const html = cityPage(area(), d(), ui);
    const list = DETROIT_ONLY.map((p) => strings['city.missing.' + p]!);
    for (const name of list) expect(html, name).toContain(name);
    expect(html).toContain(T('city.missing', { city: 'Hamtramck', list: list.join(', ') }));
    expect(html).not.toContain(strings['hood.cond_head']!);
    expect(html).not.toContain(strings['hood.money_head']!);
  });

  it('a city that authorised no new home in any year says exactly that, and has no permits panel', () => {
    const hp = area({
      id: 'city_highland_park', name: 'Highland Park',
      panels: ['help', 'parks', 'crashes', 'roads', 'vacancy'],
      sources: { parks: 'src_semcog_parks', crashes: 'src_semcog_crashes', roads: 'src_semcog_pavement', vacancy: 'src_census_vacancy' },
      permits_by_year: undefined,
      missing: [{ panel: 'permits', why: 'none_recorded' }, ...DETROIT_ONLY.map((panel) => ({ panel, why: 'not_published' as const }))],
    });
    const html = cityPage(hp, d({ areas: [hp] }), ui);
    expect(html).not.toContain(HEADS.permits!);
    expect(html).toContain(T('city.permits_none', { city: 'Highland Park', from: 2021, to: 2025 }));
    // "None recorded" is a different sentence from "nobody publishes it", and the list must not swallow it.
    expect(html).not.toContain(T('city.missing', { city: 'Highland Park', list: ['permits', ...DETROIT_ONLY].map((p) => strings['city.missing.' + p] ?? p).join(', ') }));
  });

  it('says a part-reported permit year is part estimate, naming the months', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.permits_partial', { year: 2021, city: 'Hamtramck', months: 0 }));
    expect(html).not.toContain(T('city.permits_partial', { year: 2022, city: 'Hamtramck', months: 12 }));
  });
});

// ---- sources and notices --------------------------------------------------------------------------------

describe('every panel names its own owner, its own date and its own required notice', () => {
  it('prints SEMCOG’s notice on each SEMCOG panel, once per panel', () => {
    const html = cityPage(area(), d(), ui);
    // parks, crashes, roads, vacancy: four SEMCOG-sourced panels, four notices.
    expect([...html.matchAll(/Reproduction or Use Without Permission is Prohibited/g)]).toHaveLength(4);
    expect(html).toContain(`<p class="foot" lang="en">${SEMCOG_NOTE}</p>`);
  });

  it('does not put SEMCOG’s notice on the Census Building Permits panel, which is not SEMCOG’s', () => {
    const only = area({ panels: ['permits'], sources: { permits: 'src_census_bps' } });
    const html = cityPage(only, d({ areas: [only] }), ui);
    expect(html).not.toContain(SEMCOG_NOTE);
    expect(html).toContain('U.S. Census Bureau — Building Permits Survey');
    expect(html).toContain(T('city.records_from', { who: 'the permit-issuing place' }));
  });

  it('names whose records they are where the owner is not the record-keeper', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.records_from', { who: 'Michigan State Police (CJIC)' }));
    expect(html).toContain(T('city.records_from', { who: "Michigan's Transportation Asset Management Council" }));
    expect(html).toContain(T('city.records_from', { who: 'the 2020 U.S. Census' }));
  });

  it('gives every panel a date, and lists each source once at the bottom', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('hood.updated', { date: '2026-09-15' }));
    expect(html).toContain(T('hood.source_ours'));
    const bottom = html.slice(html.indexOf(strings['hood.sources_head']!));
    expect([...bottom.matchAll(/SEMCOG — Parks and amenities/g)]).toHaveLength(1);
  });
});

// ---- the numbers themselves -----------------------------------------------------------------------------

describe('the numbers say what they are, and only about this city', () => {
  it('states the three PASER bands as the raters’ groups, with the rated miles', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.roads_lede', { city: 'Hamtramck', year: 2024 }));
    expect(html).toContain(T('city.roads_pct', { pct: 44 }));
    expect(html).toContain(T('city.roads_miles', { miles: '12.4' }));
    expect(html).toContain(T('city.roads_note'));
  });

  it('says the empty-homes count is one day in 2020, and not the same fact as Detroit’s registrations', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.vacancy_lede', { city: 'Hamtramck', vacant: '772', units: '8,911' }));
    expect(html).toContain(T('city.vacancy_note'));
  });

  it('keeps a hidden crash count hidden, and prints the real count everywhere else', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(strings['hood.lt5']!);           // severe crashes
    expect(html).toContain('69');                           // walking crashes: a real number
    expect(html).toContain('3');                            // three parks: small, and still the real number
  });

  it('carries no other city’s number and no ranking anywhere', () => {
    const html = cityPage(area(), d(), ui);
    for (const other of ['Detroit', 'Dearborn', 'Highland Park']) expect(html, other).not.toContain(`>${other}<`);
    expect(html).not.toContain(strings['hood.crash_city']!.replace('{count}', ''));
    expect(html).not.toContain(strings['hood.city']!.length > 4 ? `<th scope="col">${strings['hood.city']}</th>` : 'NEVER');
  });

  it('counts help as what is IN the city, and says the nearest place may be outside it', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.help_count', { count: 19, city: 'Hamtramck' }));
    expect(html).toContain(T('city.nearest_head'));
    expect(html).toContain(T('city.nearest_note'));
    expect(html).not.toContain(T('hood.places_head', { miles: 0.5 }));
  });
});

// ---- table or chart -------------------------------------------------------------------------------------

describe('Table | Chart on the permits panel, on the same terms as a neighborhood’s panels', () => {
  it('offers both when there are three years or more, with Table checked', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/id="hv-permits-table"[^>]*checked/);
    expect(html).toContain('<table class="years">');
  });

  it('offers nothing when there are not enough years, and still prints the table', () => {
    const thin = area({ permits_by_year: [{ year: 2025, buildings: 4, units: 4, months_reported: 12 }] });
    const html = cityPage(thin, d({ areas: [thin] }), ui);
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('<table class="years">');
  });

  it('keeps every number reachable in chart view: the table is in the page, only hidden', () => {
    const html = cityPage(area(), d(), ui, 'chart');
    expect(html).toContain('<figure class="hoodchart"');
    expect(html).toContain('class="yeartables vh" id="permits-rows"');
    expect(html).toContain('aria-describedby="permits-sum permits-rows"');
  });
});

// ---- Detroit --------------------------------------------------------------------------------------------

describe('Detroit’s own city page is the one city page with children', () => {
  const detroit = area({
    id: 'city_detroit', name: 'Detroit', city: 'city_detroit',
    places: { parks: 302, rec_centers: 16, greenway_open: 0 }, park_acres: 4968,
    sources: { parks: 'src_detroit_parks', crashes: 'src_semcog_crashes', roads: 'src_semcog_pavement', vacancy: 'src_census_vacancy', permits: 'src_census_bps' },
    missing: [],
  });

  it('sends people to the 205 neighborhood pages and does not print the regional caveat', () => {
    const html = cityPage(detroit, d({ areas: [detroit] }), ui);
    expect(html).toContain(T('city.detroit_children'));
    expect(html).toContain(T('city.see_neighborhoods'));
    expect(html).toContain(`data-go='{"v":"tab","tab":"hoods"}'`);
    expect(html).not.toContain(T('city.regional', { city: 'Detroit' }));
    expect(html).not.toContain(T('city.no_neighborhoods', { city: 'Detroit' }));
  });

  it('names the City’s own parks list, not SEMCOG’s, and says so', () => {
    const html = cityPage(detroit, d({ areas: [detroit] }), ui);
    expect(html).toContain('City of Detroit parks layer');
    expect(html).toContain(T('city.parks_note_detroit'));
    expect(html).not.toContain(T('city.parks_note_semcog'));
  });

  it('a city with no neighborhoods of its own says so, and says where its numbers come from', () => {
    const html = cityPage(area(), d(), ui);
    expect(html).toContain(T('city.no_neighborhoods', { city: 'Hamtramck' }));
    expect(html).toContain(T('city.regional', { city: 'Hamtramck' }));
    expect(html).not.toContain(T('city.detroit_children'));
  });
});
