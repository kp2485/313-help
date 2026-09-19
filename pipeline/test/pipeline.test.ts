import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { badge, openNow, rank, type BundleRow } from '@detroithelp/query';
import { build } from '../src/build.js';
import { toRows, type Source } from '../src/ingest-arcgis.js';
import { verifyBytes } from '../src/sign.js';
import { p, parsePhone, sha256, today, uuid5 } from '../src/util.js';
import { validateAlerts, validateEmergency, validateRows } from '../src/validate.js';
import { applyAggregates } from '../src/reports-sync.js';
import { parseCalendar, toZipCenters } from '../src/ingest-city.js';
import { lineToRows, parseSchedule } from '../src/import-lines.js';
import { buildIndicators, milesToArea } from '../src/indicators.js';
import { ISSUE_TYPES, nameKey, suppress, toNeighborhoods } from '../src/ingest-neighborhoods.js';
import { makeAlert } from '../src/alert-new.js';
import { crossings, encodeLine, mergeChains, packRoads, roadName, simplify, type Road } from '../src/ingest-basemap.js';

const row = (over: Partial<BundleRow>): BundleRow => ({
  id: 'sal_test', name: 'Test', org: 'Org', category: 'food.pantry', what: 'Free groceries',
  phones: [{ number: '313-555-0100' }], availability: 'call_first', schedules: [], flags: [], status: 'active',
  facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' } },
  ...over,
});
const errs = (r: Partial<BundleRow>) => validateRows([row(r)], '2026-09-18').errors.join(' | ');

describe('row validation', () => {
  it('accepts a plain row', () => expect(errs({})).toBe(''));
  it('rejects a DV row that carries an address', () =>
    expect(errs({ category: 'shelter.dv', address: { line1: '1 Main St', city: 'Detroit' } })).toMatch(/must not have an address/));
  it('rejects a DV row that carries coordinates', () =>
    expect(errs({ category: 'shelter.dv', lat: 42.35, lon: -83.05 })).toMatch(/must not have an address or coordinates/));
  it('rejects coordinates outside the Detroit bbox', () => expect(errs({ lat: 42.6, lon: -83.05 })).toMatch(/outside the Detroit bbox/));
  it('rejects a malformed phone number', () => expect(errs({ phones: [{ number: '555-0100' }] })).toMatch(/not a valid number/));
  it('rejects "scheduled" with no schedule rows (it would render as unknown forever)', () =>
    expect(errs({ availability: 'scheduled' })).toMatch(/no schedule rows/));
  it('rejects an unparseable schedule', () =>
    expect(errs({ availability: 'scheduled', schedules: [{ freq: 'WEEKLY', byday: 'FRIDAY', dtstart: '2026-09-04', opens_at: '13:30', closes_at: '14:30' }] })).toMatch(/Bad BYDAY/));
  it('rejects public text that names a staff contact or an email', () => {
    expect(errs({ what: 'Contact Jane Smith for a food box' })).toMatch(/personal contact/);
    expect(errs({ eligibility: 'Email jane@example.org first' })).toMatch(/personal contact/);
  });
  it('rejects an unknown category', () => expect(errs({ category: 'food.pantries' })).toMatch(/unknown category/));
  it('rejects broken characters from a bad source encoding', () => expect(errs({ hours_text: 'Mon � Fri' })).toMatch(/broken character/));
});

describe('emergency numbers', () => {
  const base = [
    { id: 'emg_911', number: '911', hardcoded: 'yes', verified_by_call_on: '' },
    { id: 'emg_988', number: '988', hardcoded: 'yes', verified_by_call_on: '' },
  ];
  it('a release fails while any number has never been checked', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '' }], '2026-09-18', true);
    expect(r.errors.join()).toMatch(/never checked against its published source/);
  });
  it('a release fails when the last call is older than 30 days', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '2026-08-01' }], '2026-09-18', true);
    expect(r.errors.join()).toMatch(/48 days ago/);
  });
  it('a recent match against the published page is enough', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '', verified_published_on: '2026-09-15' }, { id: 'emg_211', number: '211', hardcoded: 'no' }], '2026-09-18', true);
    expect(r.errors).toEqual([]);
    expect(r.verified).toBe(true);
  });
  it('passes with a recent call, and never asks anyone to test-call 911 or 988', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '2026-09-10' }], '2026-09-18', true);
    expect(r.errors).toEqual([]);
    expect(r.verified).toBe(true);
  });
  it('a dev build only warns', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '' }], '2026-09-18', false);
    expect(r.errors).toEqual([]);
    expect(r.verified).toBe(false);
  });
  it('911 and 988 must be present, exact, and hardcoded', () => {
    expect(validateEmergency([base[0]!], '2026-09-18', false).errors.join()).toMatch(/emg_988 is missing/);
    expect(validateEmergency([{ ...base[0]!, number: '313-555-0100' }, base[1]!], '2026-09-18', false).errors.join()).toMatch(/must be 911/);
  });
});

describe('open-data ingester', () => {
  const src: Source = { id: 'rec', name: 'Rec', kind: 'arcgis', url: 'x', id_prefix: 'rec', fields: { name: 'Site', address: 'Address', phone: 'Phone' } };
  const feat = (props: object, lon = -83.1, lat = 42.35) => ({ geometry: { coordinates: [lon, lat] }, properties: props });
  it('never carries a staff contact name, even when the layer has one', () => {
    const { rows } = toRows(src, '2016-11-16', [feat({ Site: 'Adams Butzel', Address: '10500 Lyndon', Phone: '(313) 628-0990', Contact: 'Contact Jane Example' })], '2026-09-18');
    expect(JSON.stringify(rows)).not.toMatch(/Jane|Example/);
    expect(rows[0]).toMatchObject({ sal_id: 'sal_rec_10500_lyndon', source_last_edited: '2016-11-16' });
  });
  it('skips features outside Detroit and keeps ids unique on a shared address', () => {
    const { rows, warnings } = toRows(src, null, [
      feat({ Site: 'A', Address: '1 Main' }), feat({ Site: 'B', Address: '1 Main' }), feat({ Site: 'Far', Address: '9 Elsewhere' }, -84, 43),
    ], '2026-09-18');
    expect(rows.map((r) => r.sal_id).sort()).toEqual(['sal_rec_1_main', 'sal_rec_1_main_b']);
    expect(warnings.join()).toMatch(/outside the Detroit bbox/);
  });
});

describe('report facts from the write API', () => {
  const agg = (over = {}) => ({ circuit_breaker: false, targets: [{ target_id: 'sal_test', closed_open: 2, closed_last_at: '2026-09-17T10:00Z', wrong_open: 1, last_confirmed_at: '2026-09-16T09:00Z' }], ...over });
  it('turn into badges on the device', () => {
    const r = row({});
    applyAggregates([r], agg());
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('reported_closed');
    expect(r.facts.last_confirm_method).toBe('community_confirm');
  });
  it('a steward archive closes the listing with its reason, even while the breaker is tripped', () => {
    const r = row({});
    applyAggregates([r], agg({ circuit_breaker: true, overrides: [{ target_id: 'sal_test', status: 'archived', reason_code: 'closed_permanently', replacement_id: 'sal_other', at: '2026-09-18T17:41Z' }] }));
    expect(r).toMatchObject({ status: 'archived', archived: { at: '2026-09-18', reason: 'closed_permanently', replacement_id: 'sal_other' } });
    expect(badge(r, new Date('2026-09-18T18:00:00Z'))).toMatchObject({ level: 'archived', params: { date: '2026-09-18' } });
    expect(validateRows([r], '2026-09-18').errors).toEqual([]);
  });
  it('a tripped circuit breaker keeps closure reports off the badges', () => {
    const r = row({ facts: { ...row({}).facts, checked_at_entry: '2026-09-10', entry_method: 'phone' } });
    applyAggregates([r], agg({ circuit_breaker: true, targets: [{ target_id: 'sal_test', closed_open: 9, closed_last_at: '2026-09-18T10:00Z', wrong_open: 0, last_confirmed_at: null }] }));
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('entry_checked');
  });
});

describe('City calendar reader', () => {
  const html = `<div><section class="event-preview-top"><div><article class="date"><time datetime="2026-09-19T12:00:00Z">Sep 19</time></article></div>
    <article class="tag-time"><article class="tags"><a href="/x">Parks &amp; Recreation</a></article><article class="time"> 10:00 am - 2:00 pm </article></article></section>
    <section class="desc-contacts"><article class="article-title"><h3><a href="/events/gourdys-pumpkin-run" hreflang="en">Gourdy&#039;s Pumpkin Run</a></h3>
    <article class="article-body"><p>The City's own description, which we do not copy.</p></article></article></section></div>
    <div><section class="event-preview-top"><time datetime="2026-09-20T12:00:00Z">Sep 20</time><article class="time"></article><h3><a href="/events/board-meeting">Board meeting</a></h3></section></div>`;
  it('keeps facts only: title, date, time, department, link', () => {
    const ev = parseCalendar(html);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toEqual({ id: 'evt_gourdys_pumpkin_run_2026-09-19', title: "Gourdy's Pumpkin Run", starts_at: '2026-09-19T10:00', time_text: '10:00 am - 2:00 pm', department: 'Parks & Recreation', url: 'https://detroitmi.gov/events/gourdys-pumpkin-run' });
    expect(ev[1]).toMatchObject({ starts_at: '2026-09-20', title: 'Board meeting' });
    expect(JSON.stringify(ev)).not.toContain('own description');
  });
});

describe('hours from research text', () => {
  it('become a schedule only when every part is understood', () => {
    expect(parseSchedule('Mon-Fri 8am-9pm; Sat 9am-5pm')).toEqual([{ byday: 'MO,TU,WE,TH,FR', opens_at: '08:00', closes_at: '21:00' }, { byday: 'SA', opens_at: '09:00', closes_at: '17:00' }]);
    expect(parseSchedule('Monday through Thursday: 8:30 a.m. - 12:00 p.m. & 1:00 p.m. - 5:00 p.m.')).toEqual([{ byday: 'MO,TU,WE,TH', opens_at: '08:30', closes_at: '12:00' }, { byday: 'MO,TU,WE,TH', opens_at: '13:00', closes_at: '17:00' }]);
    expect(parseSchedule('Tuesdays and Thursdays 10 am to noon')).toEqual([{ byday: 'TU,TH', opens_at: '10:00', closes_at: '12:00' }]);
    expect(parseSchedule('M-F 9-5pm')).toEqual([{ byday: 'MO,TU,WE,TH,FR', opens_at: '09:00', closes_at: '17:00' }]);
  });
  it('refuses to guess', () => {
    for (const text of ['Second Saturday of the month 10am-noon', 'Mon-Fri 8am-9pm; weekends vary', 'By appointment', 'Wednesdays after service', 'Fri 1pm until food runs out', 'Sat 5pm-9am', 'not stated'])
      expect(parseSchedule(text), text).toBeNull();
  });
  it('a line with unclear hours is imported as call-first with the hours kept as written', () => {
    const out = lineToRows('Hope Pantry | Hope Church | food.pantry | Free groceries. | 1 Main St | Detroit | 48204 | 313-555-0100 | https://x.org | 2nd Saturday 10am-noon | | https://x.org/pantry');
    expect(out).toMatchObject({ resource: { sal_id: 'sal_hope_church_hope_pantry', status: 'proposed', availability: 'call_first', hours_text: '2nd Saturday 10am-noon' }, schedules: [] });
  });
});

describe('helpers', () => {
  it('today is the Detroit calendar date, not the UTC one', () => {
    expect(today(new Date('2026-09-19T00:26:00Z'))).toBe('2026-09-18');   // 8:26pm in Detroit
    expect(today(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14');   // 11:59pm in winter
    expect(today(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15');
  });
  it('parses the phone formats found in real sources', () => {
    expect(parsePhone('(313) 579-2100 ext. 4217')).toEqual({ number: '3135792100', ext: '4217' });
    expect(parsePhone('1-800-799-7233')).toEqual({ number: '8007997233' });
    expect(parsePhone('313.964.2823')).toEqual({ number: '3139642823' });
    expect(parsePhone('988')).toEqual({ number: '988' });
    expect(parsePhone('(734) 313-386-9727')).toBeNull(); // the typo on a real partner homepage
  });
  it('gives HSDS a stable UUID for a slug', () => {
    expect(uuid5('sal_csk_meldrum_meals')).toBe(uuid5('sal_csk_meldrum_meals'));
    expect(uuid5('sal_csk_meldrum_meals')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('ZIP center points', () => {
  it('keeps 5-digit ZIPs near Detroit, rounded to about 100 m, and drops everything else', () => {
    expect(toZipCenters([
      { attributes: { zipcode: '48201' }, centroid: { x: -83.06012, y: 42.34731 } },
      { attributes: { zipcode: '48236' }, centroid: { x: -82.9, y: 42.425 } },      // border ZIP, a little outside the bbox
      { attributes: { zipcode: '49503' }, centroid: { x: -85.67, y: 42.96 } },      // Grand Rapids
      { attributes: { zipcode: '4820' }, centroid: { x: -83.06, y: 42.34 } },
      { attributes: { zipcode: '48202' } },
    ])).toEqual({ '48201': [42.347, -83.06], '48236': [42.425, -82.9] });
  });
  it('the committed file covers the city, corner to corner', () => {
    const { zips } = JSON.parse(readFileSync(p('data/ingested/city_zips.json'), 'utf8')) as { zips: Record<string, [number, number]> };
    expect(Object.keys(zips).length).toBeGreaterThanOrEqual(25);
    for (const z of ['48201', '48209', '48219', '48224', '48238']) expect(zips[z], z).toBeDefined();
  });
});

describe('street map from City open data', () => {
  const road = (name: string, cls: number, line: [number, number][]): Road => ({ name, cls, line });
  it('names: freeways the way people say them; turn lanes and ramps have no name', () => {
    expect(roadName('N I 75')).toBe('I-75'); expect(roadName('W I 96 CD')).toBe('I-96'); expect(roadName('S M 10')).toBe('M-10');
    expect(roadName('W I 94 Service Drive')).toBe('I-94 Service Drive');
    expect(roadName('  Mack   Ave ')).toBe('Mack Ave'); expect(roadName('8 Mile/Kelly TURN')).toBe(''); expect(roadName(null)).toBe('');
  });
  it('joins block-long pieces of one street, in any order and direction, and keeps other streets apart', () => {
    const out = mergeChains([
      road('Mack Ave', 1, [[-83.03, 42.35], [-83.02, 42.35]]), road('Mack Ave', 1, [[-83.01, 42.35], [-83.02, 42.35]]),
      road('Mack Ave', 1, [[-83.04, 42.35], [-83.03, 42.35]]), road('Russell St', 4, [[-83.03, 42.35], [-83.03, 42.36]]),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.name === 'Mack Ave')!.line.map((q) => q[0])).toEqual([-83.04, -83.03, -83.02, -83.01]);
  });
  it('drops points that do not change the shape, keeps corners, and encodes to whole meters-ish', () => {
    const line: [number, number][] = [[-83.05, 42.35], [-83.04, 42.350001], [-83.03, 42.35], [-83.03, 42.36]];
    expect(simplify(line, 1.5)).toEqual([[-83.05, 42.35], [-83.03, 42.35], [-83.03, 42.36]]);
    expect(encodeLine([[-83.05, 42.35], [-83.03, 42.35], [-83.03, 42.36]], [-83.1, 42.3])).toEqual([5000, 5000, 2000, 0, 0, 1000]);
    const packed = packRoads([road('A St', 4, line), road('', 0, [[-83.05, 42.35], [-83.04, 42.36]])], [-83.1, 42.3], 1.5);
    expect(packed.names).toEqual(['A St']); expect(packed.roads.map((r) => [r[0], r[1]])).toEqual([[0, -1], [4, 0]]);
  });
  it('cross streets come out in order along the path; a street alongside, a freeway, and a tunnel are not crossings', () => {
    const path: [number, number][][] = [[[-83.03, 42.33], [-83.03, 42.36]]];
    expect(crossings(path, [
      road('Mack Ave', 1, [[-83.04, 42.35], [-83.02, 42.35]]), road('E Jefferson Ave', 1, [[-83.04, 42.335], [-83.02, 42.335]]),
      road('Gratiot Ave', 1, [[-83.04, 42.34], [-83.02, 42.345]]), road('Mack Ave', 1, [[-83.04, 42.3501], [-83.02, 42.3501]]),
      road('St Aubin St', 4, [[-83.0301, 42.33], [-83.0299, 42.36]]), road('I-75', 0, [[-83.04, 42.355], [-83.02, 42.355]]),
      road('Detroit Windsor Tunnel', 1, [[-83.04, 42.332], [-83.02, 42.332]]), road('Far St', 4, [[-83.0, 42.35], [-82.99, 42.35]]),
    ])).toEqual(['E Jefferson Ave', 'Gratiot Ave', 'Mack Ave']);
  });
  it('the committed map covers the city and the greenway has its cross streets', () => {
    const base = JSON.parse(readFileSync(p('data/ingested/basemap/base.json'), 'utf8'));
    expect(base.roads.length).toBeGreaterThan(300); expect(base.parks.length).toBeGreaterThan(250); expect(base.boundary.length).toBeGreaterThan(0);
    for (const n of ['Woodward Ave', 'Gratiot Ave', 'Michigan Ave', 'I-75']) expect(base.names, n).toContain(n);
    const cross = JSON.parse(readFileSync(p('data/ingested/basemap/crossings.json'), 'utf8'));
    expect(cross.seg_dequindre_cut_detroit_riverwalk).toEqual(expect.arrayContaining(['E Jefferson Ave', 'Gratiot Ave']));
  });
});

describe('writing an alert', () => {
  const now = new Date('2026-09-18T17:45:30Z');
  it('always ends, names its source, and carries a checked phone number', () => {
    const a = makeAlert({ title: 'Overnight warming centers are open', body: 'Open through Wednesday noon.', hours: 60, category: 'warming', sourceUrl: 'https://detroitmi.gov/news/x', tel: ['Shelter help line=866-313-2520'] }, now);
    expect(a).toMatchObject({ id: 'alert_overnight_warming_centers_are_open_20260918t1345', status: 'published', starts_at: '2026-09-18T17:45:00Z', ends_at: '2026-09-21T05:45:00Z', source: { type: 'press_release', url: 'https://detroitmi.gov/news/x' }, actions: [{ label: 'Shelter help line', tel: '8663132520' }] });
    expect(validateAlerts([a], new Set()).errors).toEqual([]);
  });
  it('refuses an alert with no end, one longer than 7 days, no source, or a bad phone number', () => {
    const ok = { title: 'x', hours: 5, sourceUrl: 'https://detroitmi.gov/news/x' };
    expect(() => makeAlert({ ...ok, hours: undefined }, now)).toThrow(/every alert ends/);
    expect(() => makeAlert({ ...ok, hours: 200 }, now)).toThrow(/at most 7 days/);
    expect(() => makeAlert({ ...ok, sourceUrl: undefined }, now)).toThrow(/source-url/);
    expect(() => makeAlert({ ...ok, tel: ['Call=555-0100'] }, now)).toThrow(/--tel/);
  });
  it('a cancellation can be posted ahead for a whole Detroit day, and its id carries the start time', () => {
    const a = makeAlert({ kind: 'cancellation', title: 'Pantry closed Saturday', day: '2026-09-26', targets: ['sal_x'], sourceUrl: 'https://example.org/closed' }, now);
    // Saturday 00:00 to Sunday 00:00 in Detroit (EDT, UTC-4)
    expect(a).toMatchObject({ kind: 'cancellation', starts_at: '2026-09-26T04:00:00Z', ends_at: '2026-09-27T04:00:00Z', targets: ['sal_x'], id: 'alert_pantry_closed_saturday_20260926t0000' });
    // two alerts with the same title on the same day no longer collide
    const b = makeAlert({ kind: 'cancellation', title: 'Pantry closed Saturday', from: '2026-09-26 13:00', hours: 3, targets: ['sal_x'], sourceUrl: 'https://example.org/closed' }, now);
    expect(b).toMatchObject({ starts_at: '2026-09-26T17:00:00Z', ends_at: '2026-09-26T20:00:00Z', id: 'alert_pantry_closed_saturday_20260926t1300' });
    // a winter date uses EST (UTC-5)
    expect(makeAlert({ title: 'x', from: '2026-12-05 09:30', hours: 1, sourceUrl: 'https://example.org' }, new Date('2026-11-20T12:00:00Z')).starts_at).toBe('2026-12-05T14:30:00Z');
    // the day clocks fall back is 25 hours long
    expect(makeAlert({ title: 'x', day: '2026-11-01', sourceUrl: 'https://example.org' }, new Date('2026-10-30T12:00:00Z'))).toMatchObject({ starts_at: '2026-11-01T04:00:00Z', ends_at: '2026-11-02T05:00:00Z' });
  });
  it('alert start times are checked', () => {
    const ok = { title: 'x', sourceUrl: 'https://example.org' };
    expect(() => makeAlert({ ...ok, from: '9/26 1pm', hours: 1 }, now)).toThrow(/--from/);
    expect(() => makeAlert({ ...ok, day: '2026-02-30' }, now)).toThrow(/--day/);
    expect(() => makeAlert({ ...ok, day: '2026-09-26', from: '2026-09-26 10:00', hours: 1 }, now)).toThrow(/not both/);
    expect(() => makeAlert({ ...ok, day: '2026-09-10' }, now)).toThrow(/already over/);
    expect(() => makeAlert({ ...ok, day: '2026-12-26' }, now)).toThrow(/30 days/);
  });
  it('a demo alert says so in its title and body, lasts at most 3 hours, and has no phone number', () => {
    const a = makeAlert({ demo: true, title: 'This is what an alert looks like', hours: 1 }, now);
    expect(a.title).toBe('Demo: This is what an alert looks like'); expect(a.body_plain).toMatch(/This is a demo. Nothing is happening/); expect(a.category).toBe('demo');
    expect(() => makeAlert({ demo: true, title: 'x', hours: 4 }, now)).toThrow(/at most 3 hours/);
    expect(() => makeAlert({ demo: true, title: 'x', hours: 1, tel: ['A=313-555-0100'] }, now)).toThrow(/cannot carry a phone/);
  });
});

describe('neighborhood indicators (docs/13)', () => {
  const square = (x: number, y: number, d = 0.01) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
  const hoods = toNeighborhoods([
    { properties: { nhood_name: ' Bagley ', council_district: 2 }, geometry: square(-83.16, 42.41) },
    { properties: { nhood_name: 'Far Side', council_district: 9 }, geometry: square(-83.0, 42.3) },
    { properties: { nhood_name: '', council_district: 1 }, geometry: square(-83.1, 42.3) },
  ], [[[-83.165, 42.405], [-83.155, 42.405], [-83.155, 42.415], [-83.165, 42.415], [-83.165, 42.405]]]);
  it('reads the City layer: stable nbh_ ids, district, and the greenway lens by overlap with the study areas', () => {
    expect(hoods.map((n) => n.id)).toEqual(['nbh_bagley', 'nbh_far_side']);
    expect(hoods[0]).toMatchObject({ name: 'Bagley', district: 2, jlg_study_area: true });
    expect(hoods[1]!.district).toBeNull(); expect(hoods[1]!.jlg_study_area).toBeUndefined();
    expect(nameKey('Mc Dougall-Hunt')).toBe(nameKey('McDougall Hunt'));
  });
  it('small numbers are hidden before anything is stored', () => {
    expect(suppress(4, 90000, 1000)).toEqual({ count: 'lt5' });
    expect(suppress(9, 90000)).toEqual({ count: 9 });
    expect(suppress(10, 90000.4)).toEqual({ count: 10, median: 90000 });
  });
  it('counts help inside or within half a mile, says what our list is missing, and never ranks', () => {
    expect(milesToArea({ lat: 42.415, lon: -83.155 }, hoods[0]!.rings)).toBe(0);
    expect(milesToArea({ lat: 42.415, lon: -83.14 }, hoods[0]!.rings)).toBeGreaterThan(0.4);
    const out = buildIndicators({
      hoods, parks: [{ lat: 42.412, lon: -83.158 }], stats: { neighborhoods: { nbh_bagley: { 2025: { sales: 183, median_price: 190000 } } } },
      segments: [{ id: 'seg_a', name: 'A', phase: 'open', lines: [[[-83.159, 42.412], [-83.158, 42.413]]] }],
      rows: [row({ id: 'sal_in', category: 'harm.narcan', lat: 42.415, lon: -83.155 }), row({ id: 'sal_near', category: 'food.pantry', lat: 42.4225, lon: -83.155 }),
        row({ id: 'sal_far', category: 'food.pantry', lat: 42.30, lon: -83.2 }), row({ id: 'sal_dv', category: 'shelter.dv' })],
    });
    const b = out.neighborhoods[0]!;
    expect(b.help).toMatchObject({ total: 2, none_listed_yet: ['health'], coverage_checked: false });
    expect(b.help.by).toMatchObject({ food: 1, harm: 1 });
    expect(b.places).toEqual({ parks: 1, rec_centers: 0, greenway_open: 1 });
    expect(b.years['2025']).toEqual({ sales: 183, median_price: 190000 });
    expect(out.segments).toEqual({ seg_a: ['nbh_bagley'] });
    expect(JSON.stringify(out)).not.toMatch(/rank|score|worst|best/i);
  });
  it('conditions count things the City recorded, never reports about people, and never ask for an owner name', () => {
    expect(ISSUE_TYPES.join(' ')).not.toMatch(/squat|person|people|homeless|encamp|loiter|vehicle/i);
    const src = readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8');
    expect(src).not.toMatch(/outFields[^\n]*(owner|inspector|taxpayer|grantor|grantee)/i);
    const st = JSON.parse(readFileSync(p('data/ingested/city_stats.json'), 'utf8'));
    expect(st.city_parcels).toBeGreaterThan(300000); expect(Object.keys(st.parcels).length).toBeGreaterThan(190);
    for (const years of Object.values<any>(st.neighborhoods)) for (const y of Object.values<any>(years)) for (const k of ['blight', 'demolitions', 'issues']) if (y[k] !== undefined && y[k] !== 'lt5') expect(y[k]).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(st)).not.toMatch(/owner|inspector|taxpayer/i);
  });
  it('the committed City numbers cover all 205 neighborhoods, hold no count under 5, and no names of buyers or sellers', () => {
    const h = JSON.parse(readFileSync(p('data/ingested/neighborhoods.json'), 'utf8')), st = readFileSync(p('data/ingested/city_stats.json'), 'utf8');
    expect(h.neighborhoods).toHaveLength(205);
    expect(h.neighborhoods.filter((n: any) => n.jlg_study_area).length).toBeGreaterThan(20);
    for (const years of Object.values<any>(JSON.parse(st).neighborhoods)) for (const y of Object.values<any>(years)) {
      for (const k of ['sales', 'permits']) if (y[k] !== undefined && y[k] !== 'lt5') expect(y[k]).toBeGreaterThanOrEqual(5);
      if (y.median_price !== undefined) expect(y.sales).toBeGreaterThanOrEqual(10);
    }
    expect(st).not.toMatch(/grantor|grantee|parcel_id|"address"/);
    expect(readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8')).not.toMatch(/outFields: '[^']*(grantor|grantee|address)/);
  });
});

describe('the real bundle', () => {
  let out: string, index: any, rows: BundleRow[];
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'dh-bundle-'));
    const r = await build({ aggregates: null, outDir: out, hsdsDir: null, quiet: true, now: new Date('2026-09-18T17:45:00Z') });
    index = r.index; rows = r.rows;
  }, 60000);

  it('carries the street map under the same signature, and cross streets on greenway segments', () => {
    expect(Object.keys(index.files)).toEqual(expect.arrayContaining(['map/base.json', 'map/streets.json']));
    const g = JSON.parse(readFileSync(join(out, 'places/greenway.json'), 'utf8'));
    expect(g.segments.find((x: any) => x.id === 'seg_dequindre_cut_detroit_riverwalk').cross_streets).toContain('Gratiot Ave');
  });
  it('carries the neighborhood numbers under the same signature', () => {
    expect(Object.keys(index.files)).toContain('indicators/neighborhoods.json');
    const d = JSON.parse(readFileSync(join(out, 'indicators/neighborhoods.json'), 'utf8'));
    expect(d.neighborhoods).toHaveLength(205); expect(d.near_miles).toBe(0.5); expect(d.origin).toHaveLength(2);
  });
  it('is signed, and the signature covers every file through its checksum', () => {
    const bytes = readFileSync(join(out, 'index.json'));
    const sig = JSON.parse(readFileSync(join(out, 'index.json.sig'), 'utf8'));
    expect(verifyBytes(bytes, sig.signature, [sig.public_key])).toBe(true);
    for (const [name, meta] of Object.entries<any>(index.files)) expect(sha256(readFileSync(join(out, name)))).toBe(meta.sha256);
  });
  it('a tampered index fails verification; a tampered data file fails its checksum', () => {
    const sig = JSON.parse(readFileSync(join(out, 'index.json.sig'), 'utf8'));
    const forged = Buffer.from(readFileSync(join(out, 'index.json'), 'utf8').replace('"schema": 1', '"schema": 2'));
    expect(verifyBytes(forged, sig.signature, [sig.public_key])).toBe(false);
    const f = join(out, 'emergency.json');
    writeFileSync(f, readFileSync(f, 'utf8').replace('866-313-2520', '900-555-0199'));
    expect(sha256(readFileSync(f))).not.toBe(index.files['emergency.json'].sha256);
  });
  it('a key that is not pinned is refused', () => {
    const sig = JSON.parse(readFileSync(join(out, 'index.json.sig'), 'utf8'));
    expect(verifyBytes(readFileSync(join(out, 'index.json')), sig.signature, ['MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='])).toBe(false);
  });
  it('reports whether emergency numbers are verified; no heartbeat, and never retired unless a person says so', () => {
    expect(typeof index.emergency_verified).toBe('boolean');
    expect(index).not.toHaveProperty('heartbeat');
    expect(index).not.toHaveProperty('retired');
    expect(JSON.parse(readFileSync(p('data/seed/directory.json'), 'utf8')).retired).toBe(false);
    for (const r of rows) expect(r.facts).not.toHaveProperty('cadence_days');
  });
  it('no DV row has a place', () => {
    const dv = rows.filter((r) => r.category === 'shelter.dv');
    expect(dv.length).toBeGreaterThan(0);
    for (const r of dv) { expect(r.address).toBeUndefined(); expect(r.lat).toBeUndefined(); }
  });
  it('every badge a real row can produce has a plain-language string', () => {
    const strings = JSON.parse(readFileSync(p('strings/en.json'), 'utf8'));
    for (const when of ['2026-09-18T17:45:00Z', '2026-12-25T17:45:00Z', '2027-06-01T17:45:00Z']) {
      for (const r of rows) expect(strings[badge(r, new Date(when)).key], `${r.id} @ ${when}`).toBeTypeOf('string');
    }
  });
  it('station rows state their source and date, never claim to be checked, and do not change as time passes', () => {
    const st = rows.find((r) => r.category === 'harm.narcan')!;
    expect(badge(st, new Date('2026-09-18T17:45:00Z'))).toMatchObject({ level: 'source_listed', params: { source_date: '2026-08-26' } });
    // No timers (DECISIONS 2026-09-19): months later the badge states the same fact.
    expect(badge(st, new Date('2027-01-15T17:45:00Z'))).toMatchObject({ level: 'source_listed', params: { source_date: '2026-08-26' } });
  });
  it('only an unambiguous "24 hours" becomes open-now; other hours text is shown as written', () => {
    for (const r of rows.filter((x) => x.category === 'harm.narcan')) {
      if (r.availability === 'always') expect(r.hours_text).toBeUndefined();
      else { expect(r.availability).toBe('unknown'); expect(openNow(r, new Date()).state).toBe('unknown'); }
    }
  });
  it('answers a real question: free meals near Eastern Market, Friday 1:45pm', () => {
    const top = rank(rows, { category: 'food.meal', near: { lat: 42.3467, lon: -83.0405 } }, new Date('2026-09-18T17:45:00Z'));
    expect(top.length).toBeGreaterThanOrEqual(3);
    expect(top[0]!.miles).toBeLessThan(3);
    for (const t of top) expect(['open', 'closes_soon', 'closed', 'call_first', 'unknown']).toContain(t.open.state);
  });
});
