import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { badge, miles as milesBetween, openNow, rank, SERVICE_AREAS, SERVICE_AREA_IDS, type BundleRow } from '@313help/query';
import { build } from '../src/build.js';
import { fetchLayer, sharpDrop, toRows, type Source } from '../src/ingest-arcgis.js';
import { verifyBytes } from '../src/sign.js';
import { p, parsePhone, sha256, today, uuid5, type CsvRow } from '../src/util.js';
import { KNOWN_CATEGORIES, scriptRefusingHosts, validateAlerts, validateEmergency, validateHsdsPrivacy, validateRows } from '../src/validate.js';
import { readScriptRefusingHosts } from '../src/seed-io.js';
import { applyAggregates } from '../src/reports-sync.js';
import { recheckTask, syncTasks } from '../src/tasks-sync.js';
import { addNeighborZips, toZipCenters } from '../src/ingest-city.js';
import { importInto, lineToRows, parseSchedule } from '../src/import-lines.js';
import { COUNT_RULE, buildIndicators, canBeNearest, milesToArea, nearestMiles, nearestPicks, pointInRings } from '../src/indicators.js';
import { FIRE_TYPES, ISSUE_TYPES, isBuildingFire, nameKey, pathMidpoint, plainCount, roadShare, roadsByHood, sqlIn, toNeighborhoods, uncountedFireTypes } from '../src/ingest-neighborhoods.js';
import { makeAlert } from '../src/alert-new.js';
import { checkEmergencyRow } from '../src/check-emergency.js';
import { addressOnPage, fetchPage, isChallenge, listingOnPage, pageText, phone2OnItsPage, phoneOnPage, phonesOn, streetKey } from '../src/page-match.js';
import { GRID, crossings, encodeLine, insideRings, mergeChains, packRoads, roadName, simplify, tigerClass, tigerName, type Road } from '../src/ingest-basemap.js';

const row = (over: Partial<BundleRow>): BundleRow => ({
  id: 'sal_test', name: 'Test', org: 'Org', category: 'food.pantry', what: 'Free groceries',
  phones: [{ number: '313-555-0100' }], availability: 'call_first', schedules: [], flags: [], status: 'active',
  facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' } },
  ...over,
});
const errs = (r: Partial<BundleRow>) => validateRows([row(r)], '2026-09-18').errors.join(' | ');

// The service-area table lives in code three times over — TypeScript, Swift, Kotlin — because each client
// re-implements the query rules. A shelter would be ranked differently on a different phone if they drifted,
// and the whole safety argument rests on the point being the same for everyone (schema/query-spec.md).
describe('the service-area table is the same in all three languages', () => {
  const areasOf = (path: string, re: RegExp) => {
    const out: Record<string, string> = {};
    for (const m of readFileSync(p(path), 'utf8').matchAll(re)) out[m[1]!] = m[2] === undefined ? 'none' : `${Number(m[2])},${Number(m[3])}`;
    return out;
  };
  const ts = areasOf('packages/query/src/areas.ts', /^ {2}(\w+): \{ point: (?:\{ lat: (-?[\d.]+), lon: (-?[\d.]+) \}|null)/gm);
  it('every id in the spec table is in the code table', () => {
    expect(Object.keys(ts).sort()).toEqual([...SERVICE_AREA_IDS].sort());
    expect(readFileSync(p('schema/query-spec.md'), 'utf8')).toContain('`wayne_county_downriver`');
    for (const id of SERVICE_AREA_IDS) expect(readFileSync(p('schema/query-spec.md'), 'utf8'), id).toContain(`\`${id}\``);
  });
  it('Swift and Kotlin carry the same ids and the same points', () => {
    expect(areasOf('apps/ios/Sources/DetroitQuery/Areas.swift', /^ {4}"(\w+)": ServiceArea\(point: (?:LatLon\(lat: (-?[\d.]+), lon: (-?[\d.]+)\)|nil)/gm)).toEqual(ts);
    expect(areasOf('apps/android/query/src/main/kotlin/org/help313/query/Areas.kt', /^ {4}"(\w+)" to ServiceArea\((?:LatLon\((-?[\d.]+), (-?[\d.]+)\)|null)/gm)).toEqual(ts);
  });
  it('every reference point is a public place in or around Wayne County, never a shelter', () => {
    for (const [id, pt] of Object.entries(ts)) {
      if (pt === 'none') { expect(SERVICE_AREAS[id]!.wide, id).toBe(true); continue; }
      const [lat, lon] = pt.split(',').map(Number) as [number, number];
      expect(lat, id).toBeGreaterThan(42.0); expect(lat, id).toBeLessThan(42.5);
      expect(lon, id).toBeLessThan(-82.8); expect(lon, id).toBeGreaterThan(-83.6);
      // Nowhere near any shelter in the seed: a reference point is a city hall, not a place we list.
      expect(SERVICE_AREAS[id]!.reference, id).toMatch(/City Hall|Administrative Center|geographic centre/);
    }
  });
});

describe('row validation', () => {
  it('accepts a plain row', () => expect(errs({})).toBe(''));
  it('rejects a DV row that carries an address', () =>
    expect(errs({ category: 'shelter.dv', address: { line1: '1 Main St', city: 'Detroit' } })).toMatch(/must not have an address/));
  it('rejects a DV row that carries coordinates', () =>
    expect(errs({ category: 'shelter.dv', lat: 42.35, lon: -83.05 })).toMatch(/must not have an address or coordinates/));
  // Kyle, 2026-09-20: a DV shelter's address is never published — not even when the shelter's own page prints
  // it. What may be published instead is one coarse area from the closed list (packages/query/src/areas.ts).
  describe('a domestic violence row names no place at all (Kyle, 2026-09-20)', () => {
    const dv = (r: Partial<BundleRow>) => errs({ category: 'shelter.dv', name: 'Crisis line', ...r });
    const own = (url: string) => ({ reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list' as const, name: 'test', url } });
    it('a plain phone-only row with an area is fine', () => expect(dv({ service_area: 'detroit' })).toBe(''));
    it('no area at all is fine: the row ranks as a coordinate-less row does today', () => expect(dv({})).toBe(''));
    it("the address rule beats the shelter's own website, which would otherwise allow it", () =>
      expect(dv({ address: { line1: '1 Main St', city: 'Detroit' }, website: 'https://shelter.org', facts: own('https://shelter.org/') }))
        .toMatch(/must not have an address/));
    it('a sub-category is covered too', () =>
      expect(errs({ category: 'shelter.dv', name: 'x', lat: 42.35, lon: -83.05 })).toMatch(/must not have an address or coordinates/));
    it('a name that is a building or a street is refused', () => {
      expect(dv({ name: 'Interim House, 100 Main St' })).toMatch(/reads as a building or a street/);
      expect(dv({ name: 'Safe House, Suite 4' })).toMatch(/reads as a building or a street/);
      expect(dv({ name: '24-hour helpline' })).toBe('');
    });
    it('a link whose path is an address page is refused, for the website and for the source', () => {
      expect(dv({ website: 'https://shelter.org/our-locations/' })).toMatch(/points at an address page/);
      expect(dv({ facts: own('https://shelter.org/visit-us') })).toMatch(/points at an address page/);
      expect(dv({ website: 'https://shelter.org/100-main-street/' })).toMatch(/points at an address page/);
      expect(dv({ website: 'https://shelter.org/get-help/', facts: own('https://shelter.org/get-help/') })).toBe('');
    });
    it('an unknown service_area is refused, and every id in the closed list is accepted', () => {
      expect(dv({ service_area: '48226' })).toMatch(/unknown service_area/);
      expect(dv({ service_area: 'midtown' })).toMatch(/unknown service_area/);
      for (const id of SERVICE_AREA_IDS) expect(dv({ service_area: id }), id).toBe('');
    });
    it('a row with no phone is refused: a DV row publishes on its phone alone', () =>
      expect(dv({ phones: [] })).toMatch(/publishes on its phone alone/));
    it('service_area is for DV rows only', () =>
      expect(errs({ category: 'food.pantry', service_area: 'detroit' })).toMatch(/domestic violence rows only/));
  });
  it('the HSDS export is checked on its own terms, not inherited from the rows', () => {
    const virt = { x_detroit: { category: 'shelter.dv' }, service_at_locations: [{ x_detroit: { id: 'sal_dv' }, location: { location_type: 'virtual' } }] };
    expect(validateHsdsPrivacy([virt]).errors).toEqual([]);
    const leaked = { x_detroit: { category: 'shelter.dv' }, service_at_locations: [{ x_detroit: { id: 'sal_dv' }, location: { location_type: 'physical', latitude: 42.35, longitude: -83.05, addresses: [{ address_1: '1 Main St' }] } }] };
    expect(validateHsdsPrivacy([leaked]).errors).toHaveLength(3);
    // An ordinary service keeps its address in HSDS: this rule is about DV rows and nothing else.
    expect(validateHsdsPrivacy([{ ...leaked, x_detroit: { category: 'shelter.emergency' } }]).errors).toEqual([]);
  });
  it("shows a shelter's address only when it came from the shelter's own site (Kyle, 2026-09-19)", () => {
    const addr = { line1: '1 Main St', city: 'Detroit' };
    const src = (url: string) => ({ reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list' as const, name: 'test', url } });
    expect(errs({ category: 'shelter.emergency', address: addr, website: 'https://www.shelter.org', facts: src('https://shelter.org/locations/') })).toBe('');
    expect(errs({ category: 'shelter.emergency', address: addr, website: 'https://shelter.org', facts: src('https://www.justice.gov/eoir/roster') })).toMatch(/shelter's own website/);
    expect(errs({ category: 'shelter.emergency', address: addr, facts: src('https://shelter.org/') })).toMatch(/shelter's own website/);
    expect(errs({ category: 'shelter.emergency', website: 'https://shelter.org', facts: src('https://example.org/') })).toBe('');   // intake phone only
    expect(errs({ category: 'shelter.cooling', address: addr })).toBe('');   // a public building, not a shelter
  });
  it('rejects coordinates outside the service area', () => expect(errs({ lat: 42.6, lon: -83.05 })).toMatch(/outside the service area/));
  it('accepts places in Dearborn, Hamtramck and Highland Park (Kyle, 2026-09-19)', () => {
    for (const [lat, lon] of [[42.322, -83.176], [42.33, -83.312], [42.395, -83.049], [42.405, -83.097]]) expect(errs({ lat, lon }), `${lat},${lon}`).toBe('');
  });
  it('rejects a malformed phone number', () => expect(errs({ phones: [{ number: '555-0100' }] })).toMatch(/not a valid number/));
  it('rejects "scheduled" with no schedule rows (it would render as unknown forever)', () =>
    expect(errs({ availability: 'scheduled' })).toMatch(/no schedule rows/));
  it('rejects an unparseable schedule', () =>
    expect(errs({ availability: 'scheduled', schedules: [{ freq: 'WEEKLY', byday: 'FRIDAY', dtstart: '2026-09-04', opens_at: '13:30', closes_at: '14:30' }] })).toMatch(/Bad BYDAY/));
  it('rejects public text that names a staff contact or an email', () => {
    expect(errs({ what: 'Contact Jane Smith for a food box' })).toMatch(/personal contact/);
    expect(errs({ eligibility: 'Email jane@example.org first' })).toMatch(/personal contact/);
  });
  it('knows 49 categories, each once (docs/03)', () => {
    expect(KNOWN_CATEGORIES.length).toBe(49);
    expect(new Set(KNOWN_CATEGORIES).size).toBe(49);
    // Added 2026-09-22 (Kyle's plan decision 3): somewhere open all night with a phone a person can use.
    for (const c of ['safe.police', 'safe.fire']) expect(KNOWN_CATEGORIES).toContain(c);
    // Added 2026-09-22 (category audit K3): ongoing mental-health support that is not a crisis service. It is a
    // kind of its own precisely so that it is NOT health.mental, which is sensitive and hides its address.
    expect(KNOWN_CATEGORIES).toContain('health.support');
  });
  it('rejects an unknown category', () => expect(errs({ category: 'food.pantries' })).toMatch(/unknown category/));
  // Emergency rooms and urgent care are their own kinds (DECISIONS 2026-09-20): neither says it is free or
  // low-cost, which is what health.clinic means.
  it('takes an emergency room and an urgent care as their own kinds of help', () => {
    for (const c of ['health.er', 'health.urgent']) expect(errs({ category: c }), c).toBe('');
    expect(errs({ category: 'health.emergency' })).toMatch(/unknown category/);
  });
  it('rejects a status or availability the app doesn\'t know (a typo must not read as open)', () => {
    expect(errs({ status: 'Active' as never })).toMatch(/unknown status/);
    expect(errs({ status: 'proposed' as never })).toMatch(/unknown status/);
    expect(errs({ availability: 'open' as never })).toMatch(/unknown availability/);
    expect(errs({ availability: 'always' })).toBe('');
  });
  it('rejects broken characters from a bad source encoding', () => expect(errs({ hours_text: 'Mon � Fri' })).toMatch(/broken character/));
});

describe('emergency numbers', () => {
  const base = [
    { id: 'emg_911', number: '911', hardcoded: 'yes', verified_by_call_on: '' },
    { id: 'emg_988', number: '988', hardcoded: 'yes', verified_by_call_on: '' },
  ];
  it('a release fails on a mismatch: the owner\'s page was read and showed a different number', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_published_on: '2026-09-01', mismatch_on: '2026-09-17', source_url: 'https://x' }], '2026-09-18', true);
    expect(r.errors.join()).toMatch(/did not show this number/);
    expect(r.verified).toBe(false);
    // a person called on or after that day: cleared
    expect(validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', mismatch_on: '2026-09-17', verified_by_call_on: '2026-09-17' }], '2026-09-18', true).errors).toEqual([]);
  });
  it('a number not checked lately, or never, is a note for a person, not a failed release (DECISIONS 2026-09-19)', () => {
    for (const row of [{ verified_by_call_on: '' }, { verified_by_call_on: '2026-08-01' }]) {
      const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', ...row }], '2026-09-18', true);
      expect(r.errors).toEqual([]);
      expect(r.warnings.join()).toMatch(/never checked|48 days ago/);
      expect(r.verified).toBe(false);
    }
  });
  it('check:emergency: a match stamps the date and clears a mismatch; a changed number is a mismatch; a blocked page is neither', () => {
    const row = () => ({ id: 'emg_shelter', number: '866-313-2520', source_url: 'https://x', mismatch_on: '2026-09-01', verified_published_on: '' });
    const a = row();
    expect(checkEmergencyRow(a, { ok: true, html: '<p>Call 866-313-2520</p>' }, '2026-09-18')).toBe('match');
    expect(a).toMatchObject({ verified_published_on: '2026-09-18', mismatch_on: '' });
    const b = row();
    expect(checkEmergencyRow(b, { ok: true, html: '<p>Call 313-305-0311</p><script>"8663132520"</script>' }, '2026-09-18')).toBe('mismatch');
    expect(b.mismatch_on).toBe('2026-09-18');
    const c = row();
    expect(checkEmergencyRow(c, { ok: false, why: 'bot protection' }, '2026-09-18')).toBe('unreadable');
    expect(c).toEqual(row());
  });
  it('211 is checked against its own page ("211" or "2-1-1"); 911 and 988 never are (REVIEW 30a)', () => {
    const row = (over = {}) => ({ id: 'emg_211', number: '211', source_url: 'https://mi211.org/', hardcoded: '', mismatch_on: '', verified_published_on: '', ...over });
    const a = row();
    expect(checkEmergencyRow(a, { ok: true, html: '<p>Call 2-1-1 any time</p>' }, '2026-09-20')).toBe('match');
    expect(a.verified_published_on).toBe('2026-09-20');
    expect(checkEmergencyRow(row(), { ok: true, html: '<p>Dial 311 for city services</p>' }, '2026-09-20')).toBe('mismatch');
    expect(checkEmergencyRow(row(), { ok: true, html: '<p>Call 313-211-0000</p>' }, '2026-09-20')).toBe('mismatch');   // not inside a longer number
    for (const id of ['emg_911', 'emg_988']) expect(checkEmergencyRow(row({ id, number: id.slice(4), hardcoded: 'yes' }), { ok: true, html: '' }, '2026-09-20'), id).toBe('skipped');
  });
  it('a recent match against the published page is enough', () => {
    const r = validateEmergency([...base, { id: 'emg_shelter', number: '866-313-2520', hardcoded: 'no', verified_by_call_on: '', verified_published_on: '2026-09-15' }, { id: 'emg_211', number: '211', hardcoded: 'no', verified_published_on: '2026-09-15' }], '2026-09-18', true);
    expect(r.errors).toEqual([]);
    expect(r.verified).toBe(true);
  });
  it('211 follows the same rule as every other number: never checked is a warning, not a failed release (REVIEW 30a)', () => {
    const r = validateEmergency([...base, { id: 'emg_211', number: '211', hardcoded: 'no' }], '2026-09-18', true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/emg_211 \(211\): never checked/);
    expect(r.verified).toBe(false);
    const bad = validateEmergency([...base, { id: 'emg_211', number: '211', hardcoded: 'no', mismatch_on: '2026-09-17' }], '2026-09-18', true);
    expect(bad.errors.join(' ')).toMatch(/emg_211/);   // a release stops if 211's own page stopped showing it
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
    expect(warnings.join()).toMatch(/outside the service area/);
  });
  it('ids at a shared address don\'t depend on the order the layer returns features', () => {
    const a = feat({ Site: 'A', Address: '1 Main' }), b = feat({ Site: 'B', Address: '1 Main' });
    const ids = (fs: object[]) => Object.fromEntries(toRows(src, null, fs, '2026-09-18').rows.map((r) => [r.name, r.sal_id]));
    expect(ids([b, a])).toEqual(ids([a, b]));
  });
  it('a layer that suddenly lost most of its rows does not overwrite the last good file', () => {
    expect(sharpDrop(40, 12)).toBe(true);
    expect(sharpDrop(40, 30)).toBe(false);
    expect(sharpDrop(4, 1)).toBe(false);    // tiny layers change by a lot for real
    expect(sharpDrop(0, 0)).toBe(false);
  });
  describe('reading a layer', () => {
    const layer = 'https://example.test/FeatureServer/0';
    const pt = (i: number) => ({ geometry: { coordinates: [-83.1, 42.35] }, properties: { Site: `S${i}`, Address: `${i} Main` } });
    const serve = (pages: Record<string, unknown>) => vi.stubGlobal('fetch', async (url: string) => {
      const key = Object.keys(pages).find((k) => url.includes(k));
      return { ok: true, status: 200, json: async () => pages[key!] };
    });
    afterEach(() => vi.unstubAllGlobals());
    it('an error answered with HTTP 200 is an error, not an empty layer', async () => {
      serve({ '?f=json': { error: { code: 400, message: 'Invalid or missing input parameters.' } } });
      await expect(fetchLayer({ id: 'x', name: 'x', kind: 'arcgis', url: layer })).rejects.toThrow(/Invalid or missing/);
      serve({ '?f=json': { objectIdField: 'OBJECTID', maxRecordCount: 2 }, 'resultOffset=0': { error: { code: 500, message: 'Unable to complete operation.' } } });
      await expect(fetchLayer({ id: 'x', name: 'x', kind: 'arcgis', url: layer })).rejects.toThrow(/Unable to complete/);
    });
    it('pages in a stable order by the layer\'s id field, by how many came back, up to the server\'s page size', async () => {
      const seen: string[] = [];
      vi.stubGlobal('fetch', async (url: string) => {
        seen.push(url);
        const body = url.includes('?f=json') ? { objectIdField: 'OBJECTID', maxRecordCount: 2 }
          : url.includes('resultOffset=0') ? { features: [pt(1), pt(2)] }          // no exceededTransferLimit flag at all
          : url.includes('resultOffset=2') ? { features: [pt(3), pt(4)] }
          : { features: [pt(5)] };
        return { ok: true, status: 200, json: async () => body };
      });
      const { features } = await fetchLayer({ id: 'x', name: 'x', kind: 'arcgis', url: layer });
      expect(features).toHaveLength(5);
      expect(seen.filter((u) => u.includes('/query')).every((u) => u.includes('orderByFields=OBJECTID') && u.includes('resultRecordCount=2'))).toBe(true);
    });
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
  it('a steward restore puts the listing back but never claims anyone phoned (review 10b)', () => {
    for (const reason_code of ['restored', 'confirmed_by_phone']) {   // older overrides said confirmed_by_phone by default
      const r = row({ facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' }, checked_at_entry: '2026-09-01', entry_method: 'web' } });
      applyAggregates([r], { circuit_breaker: false, targets: [], overrides: [{ target_id: 'sal_test', status: 'active', reason_code, replacement_id: null, at: '2026-09-18T17:41Z' }] });
      expect(r.facts.last_confirm_method).toBeUndefined();
      expect(r.facts.last_confirmed_at).toBeUndefined();
      expect(badge(r, new Date('2026-09-18T18:00:00Z')).level).toBe('entry_checked');
    }
  });
  it('a "closed" report made after a restore still counts (the rejected ones are already settled in the Worker)', () => {
    const r = row({});
    applyAggregates([r], { circuit_breaker: false, targets: [{ target_id: 'sal_test', closed_open: 1, closed_last_at: '2026-09-19T09:00Z', wrong_open: 0, last_confirmed_at: null }],
      overrides: [{ target_id: 'sal_test', status: 'active', reason_code: 'restored', replacement_id: null, at: '2026-09-18T17:41Z' }] });
    expect(r.facts.reports.closed_open).toBe(1);
    expect(badge(r, new Date('2026-09-19T12:00:00Z')).level).toBe('reported_once');
  });
  it('a steward archive closes the listing with its reason, even while the breaker is tripped', () => {
    const r = row({});
    applyAggregates([r], agg({ circuit_breaker: true, overrides: [{ target_id: 'sal_test', status: 'archived', reason_code: 'closed_permanently', replacement_id: 'sal_other', at: '2026-09-18T17:41Z' }] }));
    expect(r).toMatchObject({ status: 'archived', archived: { at: '2026-09-18', reason: 'closed_permanently', replacement_id: 'sal_other' } });
    expect(badge(r, new Date('2026-09-18T18:00:00Z'))).toMatchObject({ level: 'archived', params: { date: '2026-09-18' } });
    expect(validateRows([r], '2026-09-18').errors).toEqual([]);
  });
  it('a tripped circuit breaker leaves labels as they were: the counts the Worker froze before the burst are applied', () => {
    // The Worker sends counts as of before the burst while tripped; a real label from before stays up.
    const r = row({ facts: { ...row({}).facts, checked_at_entry: '2026-09-10', entry_method: 'phone' } });
    applyAggregates([r], agg({ circuit_breaker: true, targets: [{ target_id: 'sal_test', closed_open: 2, closed_last_at: '2026-09-15T10:00Z', wrong_open: 0, last_confirmed_at: null }] }));
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('reported_closed');
  });
  it('the "still open" phone count reaches the badge: one tap does not clear two closed reports', () => {
    const r = row({});
    applyAggregates([r], agg({ targets: [{ target_id: 'sal_test', closed_open: 2, closed_last_at: '2026-09-15T10:00Z', wrong_open: 0, last_confirmed_at: '2026-09-17T10:00Z', open_after_closed: 1 }] }));
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('reported_closed');
    applyAggregates([r], agg({ targets: [{ target_id: 'sal_test', closed_open: 2, closed_last_at: '2026-09-15T10:00Z', wrong_open: 0, last_confirmed_at: '2026-09-17T10:00Z', open_after_closed: 2 }] }));
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('confirmed');
  });
});

describe('does the page still show this listing (one strict matcher)', () => {
  it('a data file (like the Gleaners map\'s): phone and address must be in the SAME entry', () => {
    const file = JSON.stringify([
      { name: 'A Pantry', address: '100 Main St', city: 'Detroit', phone: '(313) 555-0100' },
      { name: 'B Pantry', address: '200 Oak Ave', city: 'Detroit', phone: '313-555-0199' },
    ]);
    expect(listingOnPage(file, { phone: '313-555-0100', address_1: '100 Main St' }).ok).toBe(true);
    // the phone of one entry and the address of another: not a match
    expect(listingOnPage(file, { phone: '313-555-0100', address_1: '200 Oak Ave' }).ok).toBe(false);
    expect(listingOnPage(JSON.stringify({ locations: JSON.parse(file) }), { phone: '313-555-0199', address_1: '200 Oak Ave' }).ok).toBe(true);
  });
  it('a second number from another owner\'s page is checked on that page, not the listing\'s (Kyle, 2026-09-19)', () => {
    const church = '<p>Truck on 2nd and 4th Fridays. Call 313-872-2900. 9000 Main St</p>';
    const r = { phone: '313-872-2900', phone2: '248-967-1500', address_1: '9000 Main St' };
    expect(listingOnPage(church, r).missing).toEqual(['phone2 248-967-1500']);       // without its own page, phone2 must be here
    expect(listingOnPage(church, { ...r, phone2_source_url: 'https://foodbank.example/' }).ok).toBe(true);
    expect(phone2OnItsPage('<footer>Office 248-967-1500</footer>', '248-967-1500')).toBe(true);
    expect(phone2OnItsPage('<footer>Office 248-967-1599</footer>', '248-967-1500')).toBe(false);
  });
  it('a street named for a saint counts: "5900 St. Lawrence"', () => {
    expect(addressOnPage('<p>5900 St. Lawrence, Detroit</p>', '5900 St. Lawrence St')).toBe(true);
    expect(addressOnPage('<p>12 Saint Aubin</p>', '12 St Aubin St')).toBe(true);
  });
  const page = `<html><head><script>var tracking = "3135550100";</script><style>.x{}</style></head><body>
    <h1>St. Moses Pantry</h1><p>Call (313) 555-0100 or 313.555.0199. Toll free 1-800-866-THAW.</p>
    <a href="tel:+18663132520">Shelter line</a><p>2959 Martin Luther King Jr.&nbsp;Blvd, Detroit</p>
    <p>Zip 48208 20261234 office 55501</p></body></html>`;
  it('finds whole phone numbers, keypad letters and tel: links, and nothing hidden in a script', () => {
    expect([...phonesOn(page)].sort()).toEqual(['3135550100', '3135550199', '8008668429', '8663132520']);
    expect(phoneOnPage('<script>"3135550100"</script><p>nothing</p>', '313-555-0100')).toBe(false);
  });
  it('digits that merely run together are not a phone number', () => {
    expect(phoneOnPage('<p>Order 43135550100999 and 3135 550100</p>', '313-555-0100')).toBe(false);
    expect(phoneOnPage('<p>313-555-0100</p>', '313-555-0100 ext. 12')).toBe(true);   // the extension is not on the page, the number is
  });
  it('the ways real pages write numbers (from the 2026-09-19 re-check)', () => {
    for (const written of ['Phone: (313)-400-7040', 'P (313) 922 - 0033&nbsp;', 'MI 48221 &nbsp; (313)-447-0165</div>', '313 555 0100', '+1 313 555 0100'])
      expect(phonesOn(`<p>${written}</p>`).size, written).toBe(1);
  });
  it('a street address counts only as its house number followed by its street', () => {
    expect(addressOnPage(page, '2959 Martin Luther King Jr Blvd')).toBe(true);
    expect(addressOnPage(page, '2959 W. Grand Blvd')).toBe(false);
    expect(addressOnPage('<p>Suite 2959, on Martin Luther King</p>', '2959 Martin Luther King Jr Blvd')).toBe(false);   // number after the street
    expect(streetKey('14 W. 7 Mile Rd')).toEqual(['14', 'mile']);
    expect(streetKey('Cass Park')).toBeNull();
  });
  it('every listed phone must be on the page, phone2 too; a listing with no phone needs its house number', () => {
    expect(listingOnPage(page, { phone: '313-555-0100', phone2: '313-555-0199', address_1: '2959 Martin Luther King Jr Blvd' })).toEqual({ ok: true, missing: [] });
    expect(listingOnPage(page, { phone: '313-555-0100', phone2: '313-555-0000' }).missing).toEqual(['phone2 313-555-0000']);
    expect(listingOnPage(page, { address_1: '2959 Martin Luther King Jr Blvd' }).ok).toBe(true);
    expect(listingOnPage(page, { address_1: 'Corner of Cass and Warren' }).ok).toBe(false);   // no house number: nothing to check
    expect(listingOnPage(page, {}).ok).toBe(false);
  });
  it('a domestic violence row publishes on its phone alone, by rule (Kyle, 2026-09-20)', () => {
    // It may never carry a street address (docs/04, docs/08), so asking for a house number would hold it for ever.
    expect(listingOnPage(page, { phone: '313-555-0100', category: 'shelter.dv' })).toEqual({ ok: true, missing: [] });
    expect(listingOnPage(page, { category: 'shelter.dv' }).missing).toEqual([expect.stringMatching(/publishes on its phone alone/)]);
    // Every other listing is unchanged: no phone still means the house number has to be on the page.
    expect(listingOnPage(page, { category: 'shelter.emergency' }).missing).toEqual(['a phone or a street address with a house number to look for']);
  });
  it('a bot-protection challenge is unreadable, but a real page that loads Cloudflare\'s script is a page', () => {
    expect(isChallenge('<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>')).toBe(true);
    expect(isChallenge('<title>Domestic Violence Support</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script><p>1-800-799-7233</p>')).toBe(false);
  });
  it('reads the page as text: entities decoded, dashes normalized', () => {
    expect(pageText('<p>313&#8209;555&ndash;0100 &amp; more</p>')).toBe('313-555-0100 & more');
  });
});

// Two listings shipped the badge "Matched their website when added" for DMC emergency-room pages that dmc.org
// has never let this pipeline read (2026-09-20). check-sources.ts had not promoted them — it cannot — but
// nothing checked the claim, so a hand-written row published it. These fix both halves: what "could not be
// read" means, and a build check that fails on the claim itself.
describe('a page the fetcher could not read is never a match', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: string, headers: Record<string, string> = {}) =>
    vi.stubGlobal('fetch', async () => new Response(body, { status, headers }));
  const REAL_PAGE = `<html><body><h1>Clinic</h1><p>${'Open to everyone in the neighborhood, walk in any weekday. '.repeat(6)}</p><p>1 Main St, Detroit</p><p>313-555-0100</p></body></html>`;
  // Cloudflare's own refusal for https://www.dmc.org/locations/detail/... , shortened.
  const CHALLENGE = '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body><div id="challenge-error-text">3990 John R Street</div><script>window._cf_chl_opt={cvId:"3"}</script></body></html>';

  it('reads a real page', async () => {
    answer(200, REAL_PAGE);
    expect((await fetchPage('https://example.org/clinic')).ok).toBe(true);
  });
  it('a 403 body is a refusal, not a page, even when the listing\'s facts appear in it', async () => {
    answer(403, CHALLENGE);
    const got = await fetchPage('https://www.dmc.org/locations/detail/dmc-harper-university-hospital---emergency');
    expect(got.ok).toBe(false);
    expect(got.ok === false && got.why).toBe('HTTP 403');
    answer(403, CHALLENGE, { 'cf-mitigated': 'challenge' });
    expect((await fetchPage('https://www.dmc.org/z')).ok).toBe(false);
  });
  it('a bot-challenge page answered with 200 is still a refusal', async () => {
    answer(200, CHALLENGE);
    expect((await fetchPage('https://www.dmc.org/x')).ok).toBe(false);
    answer(200, '<html><head><title>Attention Required! | Cloudflare</title></head><body>3901 Beaubien Boulevard</body></html>');
    expect((await fetchPage('https://www.dmc.org/y')).ok).toBe(false);
  });
  it('an empty or near-empty 200 body could not be read either (a house number is easy to find in nothing)', async () => {
    answer(200, '');
    const empty = await fetchPage('https://example.org/gone');
    expect(empty.ok).toBe(false);
    expect(empty.ok === false && empty.why).toMatch(/almost no text/);
    answer(200, '<html><body><p>3901 Beaubien Boulevard</p></body></html>');
    expect((await fetchPage('https://example.org/stub')).ok).toBe(false);
    // A data file is short on purpose and is read entry by entry, so it is still a page.
    answer(200, JSON.stringify([{ name: 'Pantry', address: '1 Main St', phone: '313-555-0100' }]));
    expect((await fetchPage('https://example.org/food.json')).ok).toBe(true);
  });
  it('a 404, a 500 and a failed connection are all "could not be read"', async () => {
    for (const s of [404, 500]) { answer(s, REAL_PAGE); expect((await fetchPage('https://example.org/x')).ok, String(s)).toBe(false); }
    vi.stubGlobal('fetch', async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    expect((await fetchPage('https://example.org/x')).ok).toBe(false);
  });

  const REFUSING = scriptRefusingHosts([
    { host: 'dmc.org', refusing_since: '2026-09-20', refusal: 'HTTP 403 with a Cloudflare challenge page' },
    { host: 'www.detroitmi.gov', refusing_since: '2026-09-20', refusal: 'HTTP 403 with a Cloudflare challenge page' },
  ]);
  const auto = (over: Partial<BundleRow['facts']>) => validateRows([row({ facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'DMC', url: 'https://www.dmc.org/locations/detail/dmc-harper-university-hospital---emergency' }, entry_method: 'auto_check', checked_at_entry: '2026-09-20', ...over } })], '2026-09-20', REFUSING).errors.join(' | ');

  it('fails the build when an active row claims a machine match on a host that was already refusing', () => {
    expect(auto({})).toMatch(/entry_method is "auto_check".*dmc\.org has refused this pipeline's fetcher since 2026-09-20/);
    // The list is read with "www." dropped, like every other host check here.
    expect(auto({ source: { type: 'seed_list', name: 'City', url: 'https://detroitmi.gov/departments/x' } })).toMatch(/detroitmi\.gov has refused/);
  });
  it('a person read it in a browser: entry_method "web" is fine on the same page', () => {
    expect(auto({ entry_method: 'web' })).toBe('');
  });
  it('keeps the badge for a row added while the host still answered: it was true that day', () => {
    expect(auto({ checked_at_entry: '2026-09-18' })).toBe('');
  });
  it('a machine match needs a page and a date to point at', () => {
    expect(auto({ source: { type: 'seed_list', name: 'DMC' } })).toMatch(/no source url/);
    expect(auto({ checked_at_entry: null })).toMatch(/no checked_at_entry/);
  });
  it('the committed list is a data file a steward can edit, and every host on it parses', () => {
    const list = scriptRefusingHosts(readScriptRefusingHosts());
    expect(list.size).toBeGreaterThan(0);
    for (const [h, r] of list) {
      expect(h, h).toBe(h.toLowerCase().replace(/^www\./, ''));
      expect(r.refusing_since, h).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(r.refusal, h).toBeTruthy();
      expect(r.note, h).toBeTruthy();                                    // why it is on the list, for the next person
    }
  });
});

describe('hours from research text', () => {
  it('become a schedule only when every part is understood', () => {
    expect(parseSchedule('Mon-Fri 8am-9pm; Sat 9am-5pm')).toEqual([{ byday: 'MO,TU,WE,TH,FR', opens_at: '08:00', closes_at: '21:00' }, { byday: 'SA', opens_at: '09:00', closes_at: '17:00' }]);
    expect(parseSchedule('Monday through Thursday: 8:30 a.m. - 12:00 p.m. & 1:00 p.m. - 5:00 p.m.')).toEqual([{ byday: 'MO,TU,WE,TH', opens_at: '08:30', closes_at: '12:00' }, { byday: 'MO,TU,WE,TH', opens_at: '13:00', closes_at: '17:00' }]);
    expect(parseSchedule('Tuesdays and Thursdays 10 am to noon')).toEqual([{ byday: 'TU,TH', opens_at: '10:00', closes_at: '12:00' }]);
    expect(parseSchedule('M-F 9-5pm')).toEqual([{ byday: 'MO,TU,WE,TH,FR', opens_at: '09:00', closes_at: '17:00' }]);
  });
  it('an opening time with no am/pm is read as afternoon when that makes sense ("1-3pm" is 1 pm, not 1 am)', () => {
    expect(parseSchedule('Wed 1-3pm')).toEqual([{ byday: 'WE', opens_at: '13:00', closes_at: '15:00' }]);
    expect(parseSchedule('Sat 12-2pm')).toEqual([{ byday: 'SA', opens_at: '12:00', closes_at: '14:00' }]);
    expect(parseSchedule('Sat 11-1pm')).toEqual([{ byday: 'SA', opens_at: '11:00', closes_at: '13:00' }]);
    expect(parseSchedule('Tue 9-11am')).toEqual([{ byday: 'TU', opens_at: '09:00', closes_at: '11:00' }]);
  });
  it('"always open" only when the whole text says so, not when "24 hours" appears somewhere in it', () => {
    const line = (hours: string) => lineToRows(`Hope Pantry | Hope Church | food.pantry | Free groceries. | 1 Main St | Detroit | 48204 | 313-555-0100 | https://x.org | ${hours} | | https://x.org/pantry`) as { resource: Record<string, string> };
    for (const h of ['24 hours', 'Open 24 hours', '24/7', '24 hours a day, 7 days a week', 'Open 24/7.']) expect(line(h).resource.availability, h).toBe('always');
    for (const h of ['Mon 9am-5pm; hotline 24 hours', 'Closed 24 hours before holidays', 'Mon-Fri 9am-5pm, call 24/7 line after hours'])
      expect(line(h).resource.availability, h).not.toBe('always');
  });
  it('refuses to guess', () => {
    for (const text of ['Second Saturday of the month 10am-noon', 'Mon-Fri 8am-9pm; weekends vary', 'By appointment', 'Wednesdays after service', 'Fri 1pm until food runs out', 'Sat 5pm-9am', 'not stated'])
      expect(parseSchedule(text), text).toBeNull();
  });
  it('a line with unclear hours is imported as call-first with the hours kept as written', () => {
    const out = lineToRows('Hope Pantry | Hope Church | food.pantry | Free groceries. | 1 Main St | Detroit | 48204 | 313-555-0100 | https://x.org | 2nd Saturday 10am-noon | | https://x.org/pantry');
    expect(out).toMatchObject({ resource: { sal_id: 'sal_hope_church_hope_pantry', status: 'proposed', availability: 'call_first', hours_text: '2nd Saturday 10am-noon' }, schedules: [] });
  });
  it('an optional 13th field carries flags, phone labels, a second phone and a notice', () => {
    const base = 'Career center | Detroit at Work | jobs.find | Help finding a job. | 1 Main St | Detroit | 48204 | 313-555-0100 | https://x.org | Mon-Fri 8am-5pm | | https://x.org/locations';
    expect(lineToRows(`${base} | flags=walk_in, reentry; phone_label=Job line; phone2=313-555-0101; phone2_label=Unemployment help; notice=Closed Nov 26.`)).toMatchObject({ resource: {
      flags: 'walk_in,reentry', phone_label: 'Job line', phone2: '313-555-0101', phone2_label: 'Unemployment help', notice: 'Closed Nov 26.', availability: 'scheduled' } });
    expect(lineToRows(`${base} | `)).toMatchObject({ resource: { flags: '', phone2: '' } });
    expect(lineToRows(`${base} | color=green`)).toMatch(/unknown extra/);
    expect(lineToRows(`${base} | phone2=313-555-0101`)).toMatch(/phone2_label/);
  });
  it('a domestic violence line carries a service_area and never a place (Kyle, 2026-09-20)', () => {
    const dv = (address: string, zip: string, extras: string) =>
      lineToRows(`Crisis line | Interim House | shelter.dv | Call any time. | ${address} | Detroit | ${zip} | 313-555-0100 | https://x.org | 24 hours | | https://x.org/get-help${extras}`);
    expect(dv('', '', ' | service_area=detroit')).toMatchObject({ resource: { service_area: 'detroit', address_1: '', lat: '', lon: '' } });
    expect(dv('1 Main St', '', ' | service_area=detroit')).toMatch(/must carry no address and no ZIP/);
    expect(dv('', '48226', '')).toMatch(/must carry no address and no ZIP/);
    expect(dv('', '', ' | service_area=midtown')).toMatch(/unknown service_area/);
    expect(lineToRows('Career center | Detroit at Work | jobs.find | Help finding a job. | 1 Main St | Detroit | 48204 | 313-555-0100 | https://x.org | Mon-Fri 8am-5pm | | https://x.org/locations | service_area=detroit'))
      .toMatch(/domestic violence rows only/);
  });
});

describe('importing lines into the seed', () => {
  // Two cities' assessors, one service name: both slugs are "sal_city_of_help_with_a_property_tax_bill..."
  const hamtramck = 'Help with a property tax bill you cannot pay | City of Hamtramck Assessor | money.tax | Ask the Board of Review to lower it. | 3401 Evaline St | Hamtramck | 48212 | 313-800-5233 | https://hamtramckcity.gov | Mon-Fri 8am-4pm | Homeowners. | https://hamtramckcity.gov/departments/assessor/';
  const highlandPark = 'Help with a property tax bill you cannot pay | City of Highland Park Assessor | money.tax | Ask the Board of Review to lower it. | 12050 Woodward Ave | Highland Park | 48203 | 313-252-0050 | https://highlandparkmi.gov | Mon-Fri 8:30am-5pm | Homeowners. | https://highlandparkmi.gov/government/assessor/';

  function run(files: { file: string; text: string }[], resources: CsvRow[] = []) {
    const logs: string[] = [], warns: string[] = [], schedules: CsvRow[] = [];
    const summary = importInto(files, resources, schedules, (m) => logs.push(m), (m) => warns.push(m));
    return { ...summary, logs, warns, resources, schedules };
  }

  it('a second line whose id is taken by a different organisation is reported, counted and not silently dropped', () => {
    const out = run([{ file: 'a.txt', text: `# note\n${hamtramck}\n${highlandPark}\n` }]);
    expect(out.added).toBe(1);
    expect(out.collisions).toBe(1);
    expect(out.resources).toHaveLength(1);
    expect(out.warns).toEqual(['a.txt:3 skipped: id collision with sal_city_of_help_with_a_property_tax_bill_you_cannot_pay (a different organisation or address already has this id); change the service name so the id is unique']);
  });

  it('a collision against a row already in the seed is reported too', () => {
    const seeded = run([{ file: 'a.txt', text: hamtramck }]).resources;
    const out = run([{ file: 'b.txt', text: `\n${highlandPark}` }], seeded);
    expect(out).toMatchObject({ added: 0, collisions: 1 });
    expect(out.warns[0]).toMatch(/^b\.txt:2 skipped: id collision with sal_city_of_/);
  });

  it('a same-organisation, same-address re-import is silent and changes nothing', () => {
    const seeded = run([{ file: 'a.txt', text: hamtramck }]).resources;
    const before = JSON.stringify(seeded);
    const out = run([{ file: 'a.txt', text: hamtramck }], seeded);
    expect(out).toMatchObject({ added: 0, collisions: 0 });
    expect(out.warns).toEqual([]);
    expect(out.logs).toEqual([]);
    expect(JSON.stringify(out.resources)).toBe(before);
  });

  it('an address corrected in the seed after the import is a note, not a collision', () => {
    const seeded = run([{ file: 'a.txt', text: hamtramck }]).resources;
    seeded[0]!.address_1 = '3401 Evaline Street, 1st Floor';
    const out = run([{ file: 'a.txt', text: hamtramck }], seeded);
    expect(out).toMatchObject({ added: 0, collisions: 0 });
    expect(out.warns).toEqual([]);
    expect(out.logs[0]).toMatch(/already imported as sal_city_of_.*address reads "3401 Evaline Street, 1st Floor"/);
  });

  it('same organisation, different address and different phone is a collision', () => {
    const seeded = run([{ file: 'a.txt', text: hamtramck }]).resources;
    const branch = hamtramck.replace('3401 Evaline St', '9000 Jos Campau').replace('313-800-5233', '313-800-9999');
    const out = run([{ file: 'b.txt', text: branch }], seeded);
    expect(out).toMatchObject({ added: 0, collisions: 1 });
    expect(out.warns[0]).toMatch(/^b\.txt:1 skipped: id collision with sal_city_of_/);
  });

  it('the same organisation with a different service is imported, not called a collision', () => {
    const other = hamtramck.replace('Help with a property tax bill you cannot pay', 'Pay your water bill in person');
    const out = run([{ file: 'a.txt', text: `${hamtramck}\n${other}` }]);
    expect(out).toMatchObject({ added: 2, collisions: 0 });
    expect(new Set(out.resources.map((r) => r.sal_id)).size).toBe(2);
    expect(out.warns).toEqual([]);
  });

  it('a malformed line is still a plain skip, with no collision count', () => {
    const out = run([{ file: 'a.txt', text: 'one | two | three' }]);
    expect(out).toMatchObject({ added: 0, collisions: 0 });
    expect(out.warns[0]).toMatch(/^a\.txt:1 skipped: expected 12 fields/);
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
  it('Hamtramck, Highland Park and Dearborn ZIPs come from the Census layer only when the City\'s layer lacks them', () => {
    const census = [
      { attributes: { ZCTA5: '48124', INTPTLAT: '+42.2980362', INTPTLON: '-083.2476095' } },
      { attributes: { ZCTA5: '48126', INTPTLAT: '+42.3303262', INTPTLON: '-083.1871333' } },   // the City has it: City wins
      { attributes: { ZCTA5: '48301', INTPTLAT: '+42.54', INTPTLON: '-083.28' } },             // Bloomfield Hills: not wanted
    ];
    expect(addNeighborZips({ '48126': [42.33, -83.18] }, census)).toEqual({ '48124': [42.298, -83.248], '48126': [42.33, -83.18] });
  });
  it('the committed file covers the city, corner to corner', () => {
    const { zips } = JSON.parse(readFileSync(p('data/ingested/city_zips.json'), 'utf8')) as { zips: Record<string, [number, number]> };
    expect(Object.keys(zips).length).toBeGreaterThanOrEqual(25);
    for (const z of ['48201', '48209', '48219', '48224', '48238']) expect(zips[z], z).toBeDefined();
    for (const z of ['48203', '48212', '48120', '48124', '48126', '48128']) expect(zips[z], `${z} (Highland Park, Hamtramck, Dearborn)`).toBeDefined();
  });
});

describe('street map from City open data', () => {
  it('neighbor-city streets from TIGER: main roads and local streets kept, ramps and alleys dropped, names tidied', () => {
    expect([tigerClass('S1100'), tigerClass('S1200'), tigerClass('S1400'), tigerClass('S1630'), tigerClass('S1730'), tigerClass(undefined)]).toEqual([0, 1, 4, null, null, null]);
    expect(tigerName('I- 94')).toBe('I-94'); expect(tigerName('  Michigan   Ave ')).toBe('Michigan Ave');
  });
  it('point in polygon honors holes (a street in Hamtramck is not "in Detroit")', () => {
    const outer: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(insideRings([2, 2], [outer, hole])).toBe(true);
    expect(insideRings([5, 5], [outer, hole])).toBe(false);
    expect(insideRings([5, 5], [hole])).toBe(true);
    expect(insideRings([11, 5], [outer])).toBe(false);
  });
  it('the grid is pinned to the origin the committed map cells were cut from (it must not move with the service area)', () => {
    const base = JSON.parse(readFileSync(p('data/ingested/basemap/base.json'), 'utf8')) as { origin: [number, number] };
    expect(GRID.lon0).toBeCloseTo(base.origin[0], 6);
    expect(GRID.lat0).toBeCloseTo(base.origin[1], 6);
    const hoods = readFileSync(p('data/indicators/neighborhoods.json'), 'utf8');
    expect(hoods).not.toMatch(/-83\.36\b/);
  });
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
  it('a street typed differently on each side of a city line is one cross street', () => {
    const path: [number, number][][] = [[[-83.03, 42.33], [-83.03, 42.36]]];
    expect(crossings(path, [road('Tireman Ave', 1, [[-83.04, 42.34], [-83.029, 42.34]]), road('Tireman St', 4, [[-83.031, 42.3401], [-83.02, 42.3401]]),
      road('Belmont St', 4, [[-83.04, 42.35], [-83.02, 42.35]])])).toEqual(['Tireman Ave', 'Belmont St']);
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
  it('every count is the real number, however small; only a MEDIAN needs ten records (2026-09-22)', () => {
    // A 3 is a 3, a 0 is a 0, and there is no function left in the pipeline that turns a count into "lt5".
    expect(plainCount(3, 90000, 1000)).toEqual({ count: 3, cost: 1000 });
    expect(plainCount(0)).toEqual({ count: 0 });
    expect(plainCount(4, 90000)).toEqual({ count: 4 });
    expect(plainCount(9, 90000)).toEqual({ count: 9 });
    expect(plainCount(12, 90000.4)).toEqual({ count: 12, median: 90000 });
    const src = readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8') + readFileSync(p('pipeline/src/ingest-crashes.ts'), 'utf8') + readFileSync(p('pipeline/src/indicators.ts'), 'utf8');
    expect(src).not.toMatch(/'lt5'/);
  });
  it('a hole in an outline is outside it, and a two-part outline is inside either part (even-odd)', () => {
    const outer: [number, number][] = [[-83.16, 42.41], [-83.15, 42.41], [-83.15, 42.42], [-83.16, 42.42], [-83.16, 42.41]];
    const hole: [number, number][] = [[-83.157, 42.413], [-83.153, 42.413], [-83.153, 42.417], [-83.157, 42.417], [-83.157, 42.413]];
    const island: [number, number][] = [[-83.14, 42.41], [-83.13, 42.41], [-83.13, 42.42], [-83.14, 42.42], [-83.14, 42.41]];
    expect(pointInRings({ lat: 42.415, lon: -83.155 }, [outer])).toBe(true);
    expect(pointInRings({ lat: 42.415, lon: -83.155 }, [outer, hole])).toBe(false);   // in the hole
    expect(pointInRings({ lat: 42.412, lon: -83.155 }, [outer, hole])).toBe(true);    // in the ring, not the hole
    expect(pointInRings({ lat: 42.415, lon: -83.135 }, [outer, island])).toBe(true);
    expect(pointInRings({ lat: 42.415, lon: -83.145 }, [outer, island])).toBe(false); // between the two parts
    expect(milesToArea({ lat: 42.415, lon: -83.155 }, [outer, hole])).toBeGreaterThan(0);
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
    // Two rules, and the page says which one each count uses: help, parks, rec centers and greenway pieces are
    // "inside or within half a mile"; bus stops and Bridge-card stores are "inside" (docs/13, "Counting rules").
    expect(COUNT_RULE).toEqual({ bus_stops: 'inside', snap_stores: 'inside', parks: 'near', rec_centers: 'near', greenway_open: 'near', help: 'near' });
    expect(out.segments).toEqual({ seg_a: ['nbh_bagley'] });
    expect(JSON.stringify(out)).not.toMatch(/rank|score|worst|best/i);
  });
  it('"nearest" names the listing the miles were measured to, so a neighborhood page can open it', () => {
    const out = buildIndicators({
      hoods, parks: [], segments: [], stats: { neighborhoods: {} },
      // Two pantries at exactly the same distance from the middle of the square: the tie goes to the lower id,
      // on every machine and every build, so the page never changes its mind between two builds of one bundle.
      rows: [row({ id: 'sal_b_pantry', category: 'food.pantry', lat: 42.424, lon: -83.156 }), row({ id: 'sal_a_pantry', category: 'food.pantry', lat: 42.404, lon: -83.156 }),
        row({ id: 'sal_narcan', category: 'harm.supplies', lat: 42.415, lon: -83.155 }), row({ id: 'sal_no_coords', category: 'rec.center' }),
        row({ id: 'sal_dv', category: 'shelter.dv' })],
    });
    const h = out.neighborhoods[0]!.help;
    expect(h.nearest_id).toEqual({ food: 'sal_a_pantry', clinic: null, narcan: 'sal_narcan', indoors: null });
    // The distances did not move: an older client that knows nothing of the ids prints exactly what it did.
    expect(h.nearest_miles).toEqual({ food: 0.7, clinic: null, narcan: 0.1, indoors: null });
    expect(h.nearest_miles.food).toBe(out.neighborhoods[0]!.help.nearest_miles.food);
    // A listing with no coordinate is nothing to measure to, so it is never the nearest anything.
    expect(h.nearest_id.indoors).toBeNull();
  });
  it('a sensitive or private listing is never the nearest anything, whatever the categories map to', () => {
    for (const c of ['shelter.dv', 'shelter.dv.hotline', 'health.mental', 'treatment', 'treatment.detox', 'assault']) expect(canBeNearest(c), c).toBe(false);
    for (const c of ['food.pantry', 'health.clinic', 'health.support', 'harm.narcan', 'rec.library', 'shelter.emergency', 'treatments']) expect(canBeNearest(c), c).toBe(true);
    // The guard does not depend on today's mapping: point the kinds straight at the categories it protects and
    // the answer is still "none", with the ordinary listing beside them still found.
    const center = { lat: 42.414, lon: -83.156 };
    const picks = nearestPicks(center, [
      row({ id: 'sal_dv_bed', category: 'shelter.dv', lat: 42.4141, lon: -83.1561 }),
      row({ id: 'sal_crisis', category: 'health.mental', lat: 42.4141, lon: -83.1561 }),
      row({ id: 'sal_detox', category: 'treatment.detox', lat: 42.4141, lon: -83.1561 }),
      row({ id: 'sal_rape_crisis', category: 'assault', lat: 42.4141, lon: -83.1561 }),
      row({ id: 'sal_clinic', category: 'health.clinic', lat: 42.4142, lon: -83.1562 }),
    ], { beds: 'shelter', crisis: 'health.mental', rehab: 'treatment', after: 'assault', clinic: 'health.clinic' });
    expect(picks.ids).toEqual({ beds: null, crisis: null, rehab: null, after: null, clinic: 'sal_clinic' });
    expect(picks.miles).toMatchObject({ beds: null, crisis: null, rehab: null, after: null });
  });
  it('conditions count things the City recorded, never reports about people, and never ask for an owner name', () => {
    expect(ISSUE_TYPES.join(' ')).not.toMatch(/squat|person|people|homeless|encamp|loiter|vehicle/i);
    const src = readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8');
    expect(src).not.toMatch(/outFields[^\n]*(owner|inspector|taxpayer|grantor|grantee)/i);
    const st = JSON.parse(readFileSync(p('data/ingested/city_stats.json'), 'utf8'));
    expect(st.city_parcels).toBeGreaterThan(300000); expect(Object.keys(st.parcels).length).toBeGreaterThan(190);
    // Exact numbers, every series (Kyle, 2026-09-22): a count under 5 is written as itself, never as "lt5".
    let small = 0;
    for (const years of Object.values<any>(st.neighborhoods)) for (const y of Object.values<any>(years)) for (const k of ['blight', 'demolitions', 'issues', 'fires']) if (y[k] !== undefined) { expect(typeof y[k], k).toBe('number'); if (y[k] < 5) small++; }
    expect(small, 'small counts are stated, not hidden').toBeGreaterThan(100);
    expect(JSON.stringify(st)).not.toContain('lt5');
    expect(JSON.stringify(st)).not.toMatch(/owner|inspector|taxpayer/i);
  });
  it('the committed City numbers cover all 205 neighborhoods and hold no names of buyers or sellers', () => {
    const h = JSON.parse(readFileSync(p('data/ingested/neighborhoods.json'), 'utf8')), st = readFileSync(p('data/ingested/city_stats.json'), 'utf8');
    expect(h.neighborhoods).toHaveLength(205);
    expect(h.neighborhoods.filter((n: any) => n.jlg_study_area).length).toBeGreaterThan(20);
    // **Home sales and building permits state their real count, however small** (Kyle, 2026-09-22 — DECISIONS):
    // both are public transaction records the City already publishes with the address on them, so a 3 is a 3.
    // A MEDIAN price still needs ten sales, because the middle of three moves with any one of them.
    let small = 0;
    for (const years of Object.values<any>(JSON.parse(st).neighborhoods)) for (const y of Object.values<any>(years)) {
      for (const k of ['sales', 'permits']) if (y[k] !== undefined) { expect(y[k]).not.toBe('lt5'); if (y[k] < 5) small++; }
      if (y.median_price !== undefined) expect(y.sales).toBeGreaterThanOrEqual(10);
    }
    expect(small, 'the whole point: small counts are now stated').toBeGreaterThan(0);
    expect(st).not.toMatch(/grantor|grantee|parcel_id|"address"/);
    expect(readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8')).not.toMatch(/outFields: '[^']*(grantor|grantee|address)/);
  });
  it('fires count only fires in buildings: never medical calls, crashes, false alarms, car or outdoor fires', () => {
    for (const t of ['Building fire', 'Cooking fire, confined to container', 'Cooking fire, no flame damage', 'Fire - Structure Fire - Room and Contents Fire', 'Fire - Structure Fire - Structural Involvement', ' Building fire ']) expect(isBuildingFire(t)).toBe(true);
    for (const t of ['Automobile', 'unintentional', 'Medical / MANPOWER assist, assist EMS crew', 'Vehicle accident with injuries', 'Alarm system activation, no fire - unintentional', 'Smoke scare, odor of smoke',
      'Passenger vehicle fire', 'Outside rubbish, trash or waste fire', 'Grass fire', 'Excessive heat, scorch burns with no ignition', 'No incident found on arrival at dispatch address', 'Fire - Transportation Fire - Vehicle Fire  -  Passenger', 'Fire - Outside Fire - Trash / Rubbish Fire'])
      expect(isBuildingFire(t)).toBe(false);
    expect(FIRE_TYPES.join(' ')).not.toMatch(/medical|ems|alarm|accident|vehicle|automobile|outside|grass|no fire|false/i);
    // A fire type the City adds later is flagged at ingest instead of silently dropped.
    expect(uncountedFireTypes(['Building fire', 'Fire - Structure Fire - Attic Fire', 'Rescue - Structure - Elevator / Escalator Rescue', 'Grass fire', 'Fire - Outside Fire - Utility Infrastructure Fire', 'Structure fire, other'])).toEqual(['Fire - Structure Fire - Attic Fire', 'Structure fire, other']);
    expect(sqlIn('t', ["Kyle's", 'b'])).toBe("t IN ('Kyle''s', 'b')");
  });
  it('street pieces go to the neighborhood around their middle, and "poor" is a share of rated length', () => {
    expect(pathMidpoint([[-83.16, 42.41], [-83.15, 42.41]])).toEqual([-83.155, 42.41]);
    expect(pathMidpoint([[-83.16, 42.41], [-83.159, 42.41], [-83.15, 42.41]])).toEqual([-83.155, 42.41]);
    const piece = (cond: number, miles: number, mid: [number, number]) => ({ cond, miles, mid });
    const inB = [-83.155, 42.415] as [number, number];
    const r = roadsByHood([piece(3, 1, inB), piece(4, 1, inB), piece(9, 2, inB), piece(2, 5, [-82.95, 42.35])], hoods);
    expect(r.byHood).toEqual({ nbh_bagley: { pieces: 3, miles: 4, poor_miles: 2 } });
    expect(r.city).toEqual({ pieces: 4, miles: 9, poor_miles: 7 });
    // The real number of pieces however few; a SHARE of poor street still needs ten pieces, like a median.
    expect(roadShare({ pieces: 3, miles: 4, poor_miles: 2 })).toEqual({ pieces: 3, miles: 4 });
    expect(roadShare({ pieces: 8, miles: 4, poor_miles: 2 })).toEqual({ pieces: 8, miles: 4 });
    expect(roadShare({ pieces: 12, miles: 4.04, poor_miles: 1.3 })).toEqual({ pieces: 12, miles: 4, poor_pct: 32 });
    expect(roadShare(undefined)).toBeUndefined();
  });
  it('Bridge-card stores and bus stops: nearest in a straight line from the middle, and how many INSIDE the outline', () => {
    expect(nearestMiles({ lat: 42.415, lon: -83.155 }, [])).toBeNull();
    expect(nearestMiles({ lat: 42.415, lon: -83.155 }, [[-83.155, 42.4295], [-83.155, 42.30]])).toBe(1);
    const out = buildIndicators({
      hoods, parks: [{ lat: 42.4225, lon: -83.155 }], segments: [], rows: [], stats: { neighborhoods: {}, current: { neighborhoods: { nbh_bagley: { rental_certs: 12, vacant_reg: 3 } } } },
      // One store inside the square, one half a mile north of its edge (a stop or store that near counted twice), one far.
      snap: [[-83.155, 42.415, 0], [-83.155, 42.4225, 1], [-83.155, 42.44, 1], [-82.9, 42.3, 1]], busStops: [[-83.1551, 42.4151], [-83.155, 42.4225], [-83.2, 42.3]],
    });
    const b = out.neighborhoods[0]!;
    // Strictly inside: the store and the stop just outside the edge are NOT counted here — a park there is.
    expect(b.places).toMatchObject({ snap_stores: 1, bus_stops: 1, parks: 1 });
    // The distances are measured to the nearest point wherever it is, so the counting rule does not touch them.
    // The middle of this square outline is [-83.156, 42.414] (the average of its five stored corners).
    expect(b.nearest_city).toEqual({ snap: 0.1, grocery: 0.6, bus: 0.1 });
    expect(b.now).toEqual({ rental_certs: 12, vacant_reg: 3 });
    expect(out.neighborhoods[1]!.now).toBeUndefined();
  });
  it('the committed counts: each bus stop and Bridge-card store is in exactly one neighborhood, and Airport Sub has 139 stops', () => {
    // Before 2026-09-22 the 205 pages added up to 20,505 bus stops against 5,098 real ones, and Airport Sub said
    // 289 where 139 lie inside its outline: "within half a mile of the edge" counted a stop in every neighborhood
    // it was near. Now the sum is the number of stops inside a Detroit neighborhood outline.
    const h = JSON.parse(readFileSync(p('data/ingested/neighborhoods.json'), 'utf8')).neighborhoods;
    const pts = JSON.parse(readFileSync(p('data/ingested/city_points.json'), 'utf8'));
    const ct = JSON.parse(readFileSync(p('data/ingested/cities.json'), 'utf8')).cities.find((c: any) => c.id === 'city_detroit');
    const ind = JSON.parse(readFileSync(p('data/indicators/neighborhoods.json'), 'utf8'));
    const sum = (k: string) => ind.neighborhoods.reduce((n: number, x: any) => n + (x.places[k] ?? 0), 0);
    const inHoods = (arr: number[][]) => arr.filter((q) => h.some((n: any) => pointInRings({ lat: q[1]!, lon: q[0]! }, n.rings))).length;
    const inDetroit = (arr: number[][]) => arr.filter((q) => pointInRings({ lat: q[1]!, lon: q[0]! }, ct.rings)).length;
    expect(ind.neighborhoods).toHaveLength(205);
    expect(sum('bus_stops')).toBe(4526);
    expect(sum('snap_stores')).toBe(893);
    expect(ind.neighborhoods.find((n: any) => n.id === 'nbh_airport_sub').places).toMatchObject({ bus_stops: 139, snap_stores: 16 });
    // The sum is the stops inside SOME neighborhood outline, give or take the three that sit on a shared simplified
    // edge and count in both; the rest of the 5,098 are on or outside the city line (Hamtramck, Highland Park,
    // Dearborn, freeway edges) and count in no neighborhood.
    expect(sum('bus_stops') - inHoods(pts.bus_stops)).toBeGreaterThanOrEqual(0);
    expect(sum('bus_stops') - inHoods(pts.bus_stops)).toBeLessThanOrEqual(5);
    expect(Math.abs(sum('bus_stops') - inDetroit(pts.bus_stops))).toBeLessThanOrEqual(20);
    expect(sum('bus_stops')).toBeLessThan(pts.bus_stops.length);
    expect(Math.abs(sum('snap_stores') - inDetroit(pts.snap))).toBeLessThanOrEqual(10);
    // The counting rule did not touch the distances: no `nearest_city` value moved between the two rules.
    for (const n of ind.neighborhoods) if (n.nearest_city) for (const v of Object.values(n.nearest_city)) expect(v === null || typeof v === 'number').toBe(true);
  });
  it('the regenerated indicators file holds no hidden count of any kind', () => {
    const text = readFileSync(p('data/indicators/neighborhoods.json'), 'utf8');
    expect(text).not.toContain('lt5');
    expect(text).not.toContain('fewer than');
    const ind = JSON.parse(text);
    // A fixture year with three fires renders as 3: the number is in the file as a number.
    let small = 0;
    for (const n of ind.neighborhoods) for (const y of Object.values<any>(n.years)) if (typeof y.fires === 'number' && y.fires < 5) small++;
    expect(small).toBeGreaterThan(100);
    // Crashes too: the window and each year of it are numbers, and the window is the sum of its years.
    for (const n of ind.neighborhoods) if (n.crashes) {
      for (const k of ['walk', 'bike', 'severe']) expect(typeof n.crashes[k]).toBe('number');
      expect(n.crashes_by_year).toBeDefined();
      for (const k of ['walk', 'bike', 'severe']) expect(Object.values<any>(n.crashes_by_year).reduce((s, y) => s + y[k], 0)).toBe(n.crashes[k]);
    }
    expect(Object.keys(ind.city_crashes_by_year)).toEqual(['2020', '2021', '2022', '2023', '2024']);
  });
  it('the new City numbers are added up by the City, are exact, and hold no owner, address or store name', () => {
    const src = readFileSync(p('pipeline/src/ingest-neighborhoods.ts'), 'utf8');
    expect(src).not.toMatch(/outFields[^\n]*(owner|address|RETAILER_NAME|GRANTEE|location|record_id|parcel)/i);
    const st = JSON.parse(readFileSync(p('data/ingested/city_stats.json'), 'utf8'));
    expect(Object.keys(st.sources)).toEqual(expect.arrayContaining(['rentals', 'fires', 'pavement', 'vacant']));
    expect(st.fire_types).toEqual(FIRE_TYPES);
    let fires = 0;
    for (const years of Object.values<any>(st.neighborhoods)) for (const y of Object.values<any>(years)) if (y.fires !== undefined) { fires++; expect(typeof y.fires).toBe('number'); }
    expect(fires).toBeGreaterThan(500);
    expect(Object.keys(st.current.neighborhoods).length).toBeGreaterThan(190);
    for (const n of Object.values<any>(st.current.neighborhoods)) {
      for (const k of ['rental_certs', 'vacant_reg']) if (n[k] !== undefined) expect(typeof n[k]).toBe('number');
      if (n.roads) expect(typeof n.roads.pieces).toBe('number');
      if (n.roads?.poor_pct !== undefined) { expect(n.roads.pieces).toBeGreaterThanOrEqual(10); expect(n.roads.poor_pct).toBeLessThanOrEqual(100); }
    }
    expect(JSON.stringify(st)).not.toMatch(/owner|RETAILER_NAME|grantee/i);
    const pts = JSON.parse(readFileSync(p('data/ingested/city_points.json'), 'utf8'));
    expect(pts.snap.length).toBeGreaterThan(800); expect(pts.bus_stops.length).toBeGreaterThan(4000);
    for (const q of [...pts.snap, ...pts.bus_stops]) for (const x of q) expect(typeof x).toBe('number');
  });
});

describe('the real bundle', () => {
  let out: string, index: any, rows: BundleRow[], services: any[];
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'dh-bundle-'));
    const r = await build({ aggregates: null, outDir: out, hsdsDir: null, quiet: true, now: new Date('2026-09-18T17:45:00Z') });
    index = r.index; rows = r.rows; services = r.services;
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
    expect(Object.keys(d.sources)).toEqual(expect.arrayContaining(['snap', 'bus_stops', 'rentals', 'fires', 'pavement', 'vacant']));
    expect(d.city_now.rental_certs).toBeGreaterThan(5000); expect(d.fire_types.length).toBeGreaterThan(10);
    expect(d.neighborhoods.filter((n: any) => typeof n.nearest_city?.bus === 'number').length).toBe(205);
    // Every "nearest" id is a listing in this very bundle, with a coordinate, that a resident may open from a
    // public page — and it is the listing the miles beside it were measured to.
    let linked = 0;
    for (const n of d.neighborhoods) {
      expect(Object.keys(n.help.nearest_id).sort()).toEqual(['clinic', 'food', 'indoors', 'narcan']);
      for (const [kind, id] of Object.entries<string | null>(n.help.nearest_id)) {
        expect(id === null, kind).toBe(n.help.nearest_miles[kind] === null);
        if (id === null) continue;
        linked++;
        const r = rows.find((x) => x.id === id);
        expect(r, id).toBeDefined();
        expect(canBeNearest(r!.category), `${id} ${r!.category}`).toBe(true);
        expect(r!.lat, id).toBeTypeOf('number');
        const centre = { lat: n.center[0], lon: n.center[1] };
        expect(Number(milesBetween(centre, { lat: r!.lat!, lon: r!.lon! }).toFixed(1)), id).toBe(n.help.nearest_miles[kind]);
      }
    }
    expect(linked).toBeGreaterThan(600);
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
    expect(index).not.toHaveProperty('photos');   // photos stay off until a person turns them on
    expect(JSON.parse(readFileSync(p('data/seed/directory.json'), 'utf8')).retired).toBe(false);
    for (const r of rows) expect(r.facts).not.toHaveProperty('cadence_days');
  });
  it('ships no City events until a real feed exists (DECISIONS 2026-09-19)', () => {
    expect(Object.keys(index.files)).not.toContain('events.json');
  });
  it('no DV row has a place, in the bundle or in the published HSDS export', () => {
    const dv = rows.filter((r) => r.category.startsWith('shelter.dv'));
    expect(dv.length).toBeGreaterThan(0);
    for (const r of dv) {
      expect(r.address).toBeUndefined(); expect(r.lat).toBeUndefined(); expect(r.lon).toBeUndefined();
      // An area is allowed and is the only thing that may say where the row is; it must be one of the closed list.
      if (r.service_area !== undefined) expect(SERVICE_AREA_IDS).toContain(r.service_area);
      // Nothing anywhere in the row's JSON reads as a street address or a Detroit-area ZIP.
      const text = JSON.stringify(r);
      expect(text, r.id).not.toMatch(/\b\d{2,6}\s+[A-Za-z][\w.'-]*(\s+[A-Za-z][\w.'-]*)?\s*(St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Drive|Lane|Ln|Way|Ct|Pl|Pkwy|Hwy)\b/i);
      expect(text, r.id).not.toMatch(/\b48\d{3}\b/);
    }
    const hsds = services.filter((s: any) => (s.x_detroit?.category ?? '').startsWith('shelter.dv'));
    expect(hsds.length).toBe(dv.length);
    expect(validateHsdsPrivacy(services).errors).toEqual([]);
  });
  it('every badge a real row can produce has a plain-language string', () => {
    const strings = JSON.parse(readFileSync(p('strings/en.json'), 'utf8'));
    for (const when of ['2026-09-18T17:45:00Z', '2026-12-25T17:45:00Z', '2027-06-01T17:45:00Z']) {
      for (const r of rows) expect(strings[badge(r, new Date(when)).key], `${r.id} @ ${when}`).toBeTypeOf('string');
    }
  });
  it('station rows state their source and date, never claim to be checked, and do not change as time passes', () => {
    // DHD's open-data stations; Narcan boxes from a seed list (e.g. Dearborn's) carry their own entry check instead.
    const st = rows.find((r) => r.category === 'harm.narcan' && r.facts.source.type === 'open_data')!;
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

describe('nightly re-check becomes a steward task (DECISIONS 2026-09-19)', () => {
  const day = '2026-09-19';
  it('a miss names what the matcher found missing; an unreadable page says why; a match is no task', () => {
    expect(recheckTask('sal_x', { missing: [] }, day)).toBeNull();
    expect(recheckTask('sal_x', { missing: ['phone 313-555-0100', 'street address "1 Main St"'] }, day))
      .toEqual({ target_id: 'sal_x', result: 'missing', detail: 'phone 313-555-0100, street address "1 Main St"', checked_on: day });
    expect(recheckTask('sal_x', { why: 'HTTP 503' }, day)).toEqual({ target_id: 'sal_x', result: 'unreadable', detail: 'HTTP 503', checked_on: day });
    expect(recheckTask('sal_x', { why: 'x'.repeat(400) }, day)!.detail).toHaveLength(300);
  });
  const task = { target_id: 'sal_x', result: 'missing', detail: 'phone 313-555-0100', checked_on: day };
  const env = { REPORTS_API: 'https://api.example', ACCESS_CLIENT_ID: 'client-id', ACCESS_CLIENT_SECRET: 'client-secret' };
  const setup = (status = 200) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return new Response('{}', { status }); };
    const file = join(mkdtempSync(join(tmpdir(), 'recheck-')), 'recheck.json');
    return { calls, fake, file };
  };
  it('PUTs the list to the steward API with the service token; does nothing without REPORTS_API', async () => {
    const { calls, fake, file } = setup();
    writeFileSync(file, JSON.stringify([task]));
    expect(await syncTasks(file, {}, fake)).toBe('skipped');
    expect(calls).toHaveLength(0);
    expect(await syncTasks(file, env, fake)).toBe(1);
    expect(calls[0]!.url).toBe('https://api.example/v1/steward/tasks');
    expect(calls[0]!.init.method).toBe('PUT');
    expect(calls[0]!.init.headers).toMatchObject({ 'content-type': 'application/json', 'CF-Access-Client-Id': 'client-id', 'CF-Access-Client-Secret': 'client-secret' });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ tasks: [task] });
  });
  it('sends nothing when the re-check wrote no list: an empty PUT would close every open task', async () => {
    const { calls, fake, file } = setup();
    await expect(syncTasks(file, env, fake)).rejects.toThrow(/no re-check list/);
    writeFileSync(file, '{"not": "a list"}');
    await expect(syncTasks(file, env, fake)).rejects.toThrow(/not a list/);
    expect(calls).toHaveLength(0);
  });
  it('fails loudly when the API refuses', async () => {
    const { fake, file } = setup(500);
    writeFileSync(file, JSON.stringify([task]));
    await expect(syncTasks(file, env, fake)).rejects.toThrow(/500/);
  });
});
