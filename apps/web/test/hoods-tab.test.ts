// The Neighborhoods tab (Kyle, 2026-09-22: "all the neighborhood info is buried in the about page, it should
// have its own tab"). Held to what a person can do with it — reach their own neighborhood without sending
// anything, find one by name, walk all 205 in an order that is never a ranking — and to the rules docs/13 sets
// for anything that shows neighborhood numbers at all.
//
// The point-in-polygon cases are the ones in schema/neighborhoods/points.json, which the iPhone and
// Android apps run too: if the three ever disagree about which neighborhood a coordinate is in, one is wrong.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABS } from '../src/needs.js';
import { fromHash, hashFor, type View } from '../src/router.js';
import { hoodIndex, hoodRows, type Hood, type Indicators, type Ui } from '../src/hoods.js';
import { foldName, groupHoods, hoodAt, hoodsForZip, matchHoods } from '../src/hoodfind.js';

const root = join(__dirname, '../../..');
const strings = JSON.parse(readFileSync(join(root, 'strings/en.json'), 'utf8')) as Record<string, string>;
const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
const findSrc = readFileSync(join(__dirname, '../src/hoodfind.ts'), 'utf8');

const ui: Ui = {
  t: (k, p = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')),
  esc: (x) => String(x), own: (x) => String(x), date: (d) => d, icon: (n) => `<svg data-ic="${n}"></svg>`,
  link: (u, l) => `<a href="${u}">${l}</a>`, go: (v) => `data-go='${JSON.stringify(v)}'`, map: () => '',
};

const ORIGIN: [number, number] = [-83.32, 42.22];
/** A square outline, encoded exactly as the bundle encodes one: whole 1e-5 degrees from the origin, each corner
 *  a delta on the one before. */
function square(south: number, west: number, side = 0.01): number[] {
  const corners: [number, number][] = [[west, south], [west + side, south], [west + side, south + side], [west, south + side], [west, south]];
  const out: number[] = [];
  let x = 0, y = 0;
  for (const [lon, lat] of corners) {
    const nx = Math.round((lon - ORIGIN[0]) * 1e5), ny = Math.round((lat - ORIGIN[1]) * 1e5);
    out.push(nx - x, ny - y); x = nx; y = ny;
  }
  return out;
}
function hood(name: string, district: number | null, rings: number[][] = [], extra: Partial<Hood> = {}): Hood {
  return {
    id: 'nbh_' + foldName(name).replace(/ /g, '_'), name, district, center: [42.3, -83.1], rings,
    help: { total: 9, by: { food: 3 }, nearest_miles: { food: 1.2 }, none_listed_yet: [], coverage_checked: false },
    places: { parks: 2, rec_centers: 1, greenway_open: 0 }, years: {}, ...extra,
  };
}
const src = { name: 'City of Detroit neighborhoods', url: 'https://example.org/n', last_edited: '2026-09-17' };
function indicators(list: Hood[]): Indicators {
  return { sources: { neighborhoods: src, sales: src, permits: src }, stats_fetched_at: '2026-09-18', first_year: 2024, partial_year: 2026,
    near_miles: 0.5, origin: ORIGIN, city: {}, segments: {}, neighborhoods: list };
}
const INDEX_OPTS = { order: 'abc' as const, query: '', located: false, zip: '', mine: null, locHtml: '<div class="loc"></div>' };

// ---------------------------------------------------------------------------------------------------
// The tab itself
// ---------------------------------------------------------------------------------------------------

describe('a tab of its own', () => {
  it('sits between Map and Events, so a phone with no events still shows four', () => {
    expect(TABS.map((t) => t.id)).toEqual(['home', 'help', 'map', 'hoods', 'events']);
    // Events is the one that hides itself; the bar sizes itself to whatever is left (style.css, tested there).
    expect(main).toContain("const shownTabs = () => TABS.filter((x) => x.id !== 'events' || upcoming(1).length > 0);");
  });

  it('the bar shows a label that fits a fifth of a 320 px screen; the rail and the window title say the whole word', () => {
    // The short word IS the button's whole name on the bar — not a truncation, and never a name a screen reader
    // reads differently from what a person sees (WCAG 2.5.3). No label on the bar is longer than "Neighborhoods".
    for (const l of ['en', 'es', 'ar', 'bn']) {
      const tbl = JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
      expect(tbl['tab.hoods'], l).toBeTypeOf('string');
      expect(tbl['tab.hoods_wide'], l).toBeTypeOf('string');
      expect([...tbl['tab.hoods']!].length, `${l} tab label too long for five columns at 320px`).toBeLessThanOrEqual(8);
    }
    expect(strings['tab.hoods_wide']).toBe('Neighborhoods');
    expect(main).toContain('esc(wide.matches ? tabName(x.id) : t(\'tab.\' + x.id))');
    expect(main).toContain("const docTitle = title ?? (v.v === 'tab' && v.tab !== 'home' ? tabName(v.tab) : '');");
  });

  it('has an icon of its own, drawn here, that is neither the Home house nor the Map pin', () => {
    const icons = readFileSync(join(__dirname, '../src/icons.ts'), 'utf8');
    const path = (name: string) => new RegExp(`^  ${name}: '([^']+)'`, 'm').exec(icons)?.[1];
    expect(path('district')).toBeTypeOf('string');
    expect(path('district')).not.toBe(path('home'));
    expect(path('district')).not.toBe(path('pin'));
    expect(TABS.find((t) => t.id === 'hoods')!.icon).toBe('district');
  });

  it('Home has a way in, and About keeps one plain sentence instead of the block it used to hold', () => {
    expect(main).toContain(`<button class="tile" \${go({ v: 'tab', tab: 'hoods' })}>`);
    for (const k of ['home.hoods_title', 'home.hoods_sub', 'about.hoods']) expect(strings[k], k).toBeTypeOf('string');
    const about = main.slice(main.indexOf('function about()'), main.indexOf('const CONTACT'));
    expect(about).toContain("T('about.hoods')");
    expect(about).toContain("go({ v: 'tab', tab: 'hoods' })");
    // The old heading-and-row block is gone: one sentence and one link, so nobody who learned the old place is lost.
    expect(about).not.toContain("rowLink({ v: 'hoods' }");
    expect(about).not.toContain("T('hood.title')}</h2>");
  });
});

describe('the links people already have keep working', () => {
  it('#/n is the tab, #/n/nbh_… one neighborhood, #/n/lens-jlg the greenway lens', () => {
    expect(fromHash('#/n')).toEqual({ v: 'tab', tab: 'hoods' });
    expect(fromHash('#/n/nbh_bagley')).toEqual({ v: 'hood', id: 'nbh_bagley' });
    expect(fromHash('#/n/lens-jlg')).toEqual({ v: 'hoods', lens: 'jlg' });
    // And back again, so Back and Forward walk the same trips.
    expect(hashFor({ v: 'tab', tab: 'hoods' }, () => false, '/')).toBe('#/n');
    expect(hashFor({ v: 'hood', id: 'nbh_bagley' }, () => false, '/')).toBe('#/n/nbh_bagley');
    expect(hashFor({ v: 'hoods', lens: 'jlg' }, () => false, '/')).toBe('#/n/lens-jlg');
  });
  it('every tab round-trips through its own URL, the new one included', () => {
    for (const tab of TABS.map((x) => x.id)) {
      const h = hashFor({ v: 'tab', tab } as View, () => false, '/');
      expect(fromHash(h ?? '/'), tab).toEqual({ v: 'tab', tab });
    }
  });
  it('a half link opens the tab, never a half-built screen', () => {
    expect(fromHash('#/n/lens-')).toEqual({ v: 'tab', tab: 'hoods' });
  });
});

// ---------------------------------------------------------------------------------------------------
// The index: never a league table (docs/13, rule 1)
// ---------------------------------------------------------------------------------------------------

describe('the list is ordered by name or district, and by nothing else', () => {
  const list = [hood('Zug Island', 6), hood('Bagley', 2), hood('Midway', 2), hood('Alpha', 6), hood('8 Mile', null)];
  const d = indicators(list);

  it('A to Z, whatever the numbers say', () => {
    const html = hoodRows(d, ui, { order: 'abc', query: '' });
    const order = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    expect(order).toEqual(['Alpha', 'Bagley', 'Midway', 'Zug Island', '8 Mile']);   // a name with no letter files last
    expect(html).toContain('>A<');
    expect(html).toContain(strings['hood.letter_other']);
  });

  it('by council district, and inside a district still alphabetically', () => {
    const html = hoodRows(d, ui, { order: 'district', query: '' });
    const order = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
    expect(order).toEqual(['Bagley', 'Midway', 'Alpha', 'Zug Island', '8 Mile']);
    expect(html.indexOf('Council District 2')).toBeLessThan(html.indexOf('Council District 6'));
  });

  it('an index row carries the name and no number at all: nothing to sort a ranking by', () => {
    const html = hoodRows(d, ui, { order: 'abc', query: '' });
    const rows = [...html.matchAll(/<li>.*?<\/li>/g)].map((m) => m[0]);
    expect(rows).toHaveLength(5);
    // Everything but the name the City gave it (a name may hold a number of its own: "8 Mile"): no count, no
    // price, no rate, not even the district number — an index row has nothing a ranking could be built from.
    for (const r of rows) expect(r.replace(/<strong>[^<]*<\/strong>/, '').replace(/"id":"[^"]*"/, ''), r).not.toMatch(/\d/);
  });

  it('nothing in the finding code can sort by an indicator', () => {
    expect(findSrc).not.toMatch(/sort\([^)]*(total|median|sales|permits|blight|crash|fires|help)/);
    // The only comparisons it makes are a name and a district.
    expect(findSrc).toContain('const byName = (a: Hood, b: Hood) => a.name.localeCompare(b.name);');
  });

  it('the screen says there is no ranking, in words, and says where the numbers come from', () => {
    const html = hoodIndex(d, ui, INDEX_OPTS);
    expect(html).toContain(strings['hood.index_intro']);
    expect(strings['hood.index_intro']).toMatch(/don't rank/);
    expect(html).toContain(strings['hood.index_sources']);
    expect(html).toContain(`<a href="${src.url}">${src.name}</a>`);
    expect(html).toContain(strings['hood.describe']);              // "These numbers describe what happened here."
  });
});

describe('finding a neighborhood by name', () => {
  const list = [hood('Palmer Park', 2), hood('Park Grove', 4), hood('Sparkle Heights', 1), hood('Green Acres', 2), hood('Crary/St Marys', 2)];

  it('a typed word matches the start of a word in the name, not any old piece of it', () => {
    expect(matchHoods(list, 'park').map((h) => h.name)).toEqual(['Palmer Park', 'Park Grove']);
    expect(matchHoods(list, 'gr').map((h) => h.name)).toEqual(['Green Acres', 'Park Grove']);
    expect(matchHoods(list, 'park gr').map((h) => h.name)).toEqual(['Park Grove']);
  });
  it('punctuation and case are set aside, so "st marys" finds "Crary/St Marys"', () => {
    expect(matchHoods(list, 'ST MARYS').map((h) => h.name)).toEqual(['Crary/St Marys']);
  });
  it('nothing typed is the whole list, in name order', () => {
    expect(matchHoods(list, '  ').map((h) => h.name)).toEqual(['Crary/St Marys', 'Green Acres', 'Palmer Park', 'Park Grove', 'Sparkle Heights']);
  });
  it('a name nobody has says so, plainly', () => {
    expect(matchHoods(list, 'atlantis')).toEqual([]);
    expect(hoodRows(indicators(list), ui, { order: 'abc', query: 'atlantis' })).toContain(strings['hood.find_none']);
  });
  it('the box has a label and a count that is announced politely, and the list is redrawn in place', () => {
    const html = hoodIndex(indicators(list), ui, INDEX_OPTS);
    expect(html).toContain('<label class="searchbox">');
    expect(html).toContain(strings['hood.find_label']);
    expect(html).toMatch(/<input id="hoodq"[^>]*type="search"/);
    expect(html).toMatch(/<p class="vh" id="hoodsay" role="status" aria-live="polite">/);
    // Only the list is replaced as a person types: the box keeps the cursor and the keyboard, nothing jumps.
    expect(main).toContain("if (el.id === 'hoodq') { hoodQuery = el.value; redrawHoodList(); return; }");
    expect(main).toContain("out.innerHTML = hoodRows(d, hoodUi(d), { order: hoodOrder, query: hoodQuery });");
    for (const k of ['hood.find_count', 'hood.find_one', 'hood.find_none']) expect(strings[k], k).toBeTypeOf('string');
  });
  it('the A–Z / by-district switch is two real radio buttons', () => {
    const html = hoodIndex(indicators(list), ui, INDEX_OPTS);
    expect(html).toMatch(/<input type="radio" name="hoodorder" value="abc"[^>]*checked/);
    expect(html).toMatch(/<input type="radio" name="hoodorder" value="district"/);
    expect(html).toContain(strings['hood.group_label']);
  });
});

// ---------------------------------------------------------------------------------------------------
// "Your neighborhood": worked out on the device, kept nowhere
// ---------------------------------------------------------------------------------------------------

describe('which neighborhood a point is in', () => {
  // Two squares side by side, and one with a hole in the middle of it.
  const west = hood('West Square', 1, [square(42.3, -83.12)]);
  const east = hood('East Square', 2, [square(42.3, -83.11)]);
  const ring = hood('Ring', 3, [square(42.35, -83.12, 0.02), square(42.355, -83.115, 0.01)]);
  const list = [west, east, ring];

  it('a point inside an outline is that neighborhood', () => {
    expect(hoodAt(list, ORIGIN, { lat: 42.305, lon: -83.115 })?.id).toBe(west.id);
    expect(hoodAt(list, ORIGIN, { lat: 42.305, lon: -83.105 })?.id).toBe(east.id);
  });
  it('a point outside every outline is none: it is never given to the nearest one', () => {
    expect(hoodAt(list, ORIGIN, { lat: 42.20, lon: -83.30 })).toBeNull();
    expect(hoodAt(list, ORIGIN, { lat: 42.305, lon: -83.09 })).toBeNull();
  });
  it('a hole in an outline is outside it', () => {
    expect(hoodAt(list, ORIGIN, { lat: 42.352, lon: -83.118 })?.id).toBe(ring.id);   // in the ring itself
    expect(hoodAt(list, ORIGIN, { lat: 42.36, lon: -83.11 })).toBeNull();            // in the hole
  });
  it('a neighborhood the bundle carries no outline for is never the answer', () => {
    expect(hoodAt([hood('No Shape', 1, [])], ORIGIN, { lat: 42.305, lon: -83.115 })).toBeNull();
  });
  it('a ZIP answers with a list, because a ZIP covers more than one neighborhood', () => {
    expect(hoodsForZip(list, ORIGIN, { lat: 42.305, lon: -83.115 }).map((h) => h.id)).toEqual([west.id]);
    expect(hoodsForZip(list, ORIGIN, { lat: 42.20, lon: -83.30 })).toEqual([]);
  });
});

// The same coordinates the iPhone and Android apps are held to, against the outlines the pipeline really builds.
describe('the shared point-in-polygon cases (schema/neighborhoods/points.json)', () => {
  const file = join(root, 'data/bundle/v1/indicators/neighborhoods.json');
  const fixture = JSON.parse(readFileSync(join(root, 'schema/neighborhoods/points.json'), 'utf8')) as
    { cases: { name: string; lat: number; lon: number; expect: string | null }[]; zip_cases: { zip: string; expect: string[] }[] };

  it('the table names real places and says "none" outside Detroit', () => {
    expect(fixture.cases.length).toBeGreaterThan(6);
    expect(fixture.cases.some((c) => c.expect === null && /Dearborn/.test(c.name))).toBe(true);
    expect(fixture.cases.some((c) => c.expect !== null)).toBe(true);
  });

  it.skipIf(!existsSync(file))('every case holds against the built bundle', () => {
    const d = JSON.parse(readFileSync(file, 'utf8')) as Indicators;
    for (const c of fixture.cases) {
      expect(hoodAt(d.neighborhoods, d.origin, { lat: c.lat, lon: c.lon })?.id ?? null, c.name).toBe(c.expect);
    }
    const zips = (JSON.parse(readFileSync(join(root, 'data/bundle/v1/places/zips.json'), 'utf8')) as { zips: Record<string, [number, number]> }).zips;
    for (const c of fixture.zip_cases) {
      const centre = zips[c.zip]!;
      expect(hoodsForZip(d.neighborhoods, d.origin, { lat: centre[0], lon: centre[1] }).map((h) => h.id), c.zip).toEqual(c.expect);
    }
  });
});

describe('what "your neighborhood" leaves behind: nothing', () => {
  it('the finding code cannot store, send, or navigate', () => {
    for (const forbidden of ['idbSet', 'idbGet', 'indexedDB', 'localStorage', 'sessionStorage', 'fetch(', 'pushState', 'replaceState', 'location.']) {
      expect(findSrc, forbidden).not.toContain(forbidden);
    }
    // It is handed a point and a list, and hands back a neighborhood. Nothing else crosses the door.
    expect(findSrc).toContain('export function hoodAt(list: readonly Hood[], origin: [number, number], p: Point): Hood | null');
  });
  it('the screen keeps the answer in memory only, and asks for a location the one way the app already asks', () => {
    const tab = main.slice(main.indexOf('function hoodsTab()'), main.indexOf('function hoodSaid('));
    for (const forbidden of ['idbSet', 'localStorage', 'sessionStorage', 'fetch(', 'pushState', 'replaceState', 'navigate(']) {
      expect(tab, forbidden).not.toContain(forbidden);
    }
    // No new permission pattern: the same chip (and the same remembered refusal) as every list screen. Once
    // there IS a location, the chip's own "Sorted by distance from you" would be a claim about a list that is
    // in ABC order, so what stays is its Stop button — the same button, with the same handler.
    expect(tab).toContain("locHtml: here ? '' : locChip()");
    expect(readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8')).toContain(`<button class="chip" data-loc="off">`);
  });
  it('outside Detroit it says so and offers the map, instead of naming the nearest neighborhood', () => {
    const html = hoodIndex(indicators([hood('West Square', 1, [square(42.3, -83.12)])]), ui, { ...INDEX_OPTS, located: true, mine: null });
    expect(html).toContain(strings['hood.mine_outside']);
    expect(html).toContain(`data-go='{"v":"tab","tab":"map"}'`);
    expect(strings['hood.only_detroit']).toMatch(/Hamtramck/);
    expect(strings['hood.only_detroit']).toMatch(/Dearborn/);
  });
  it('a found neighborhood is one row to its own page, with the line that says where it came from', () => {
    const mine = hood('West Square', 1, [square(42.3, -83.12)]);
    const html = hoodIndex(indicators([mine]), ui, { ...INDEX_OPTS, located: true, mine });
    expect(html).toContain(strings['hood.mine_head']);
    expect(html).toContain(`data-go='{"v":"hood","id":"${mine.id}"}'`);
    expect(html).toContain(strings['hood.mine_note']);
    expect(strings['hood.mine_note']).toMatch(/never sent|never saved/);
  });
  it('a typed ZIP says it is the middle of a ZIP, not the person', () => {
    const mine = hood('West Square', 1, [square(42.3, -83.12)]);
    const html = hoodIndex(indicators([mine]), ui, { ...INDEX_OPTS, located: true, zip: '48226', mine });
    expect(html).toContain('48226');
    expect(html).toContain(ui.t('hood.mine_zip', { zip: '48226' }));
  });
});

describe('the same words in all four languages', () => {
  const keys = ['tab.hoods', 'tab.hoods_wide', 'hood.index_intro', 'hood.index_sources', 'hood.mine_head', 'hood.mine_note', 'hood.mine_zip',
    'hood.mine_outside', 'hood.mine_map', 'hood.find_label', 'hood.find_count', 'hood.find_one', 'hood.find_none', 'hood.group_label',
    'hood.group_abc', 'hood.group_district', 'hood.letter_other', 'hood.only_detroit', 'home.hoods_title', 'home.hoods_sub', 'about.hoods'];
  for (const l of ['en', 'es', 'ar', 'bn']) {
    it(`${l} has every new key, with the same placeholders`, () => {
      const tbl = JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
      for (const k of keys) {
        expect(tbl[k], `${l} ${k}`).toBeTypeOf('string');
        const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
        expect(holes(tbl[k]!), `${l} ${k}`).toBe(holes(strings[k]!));
      }
    });
  }
});
