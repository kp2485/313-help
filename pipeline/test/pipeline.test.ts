import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { badge, openNow, rank, type BundleRow } from '@detroithelp/query';
import { build } from '../src/build.js';
import { toRows, type Source } from '../src/ingest-arcgis.js';
import { verifyBytes } from '../src/sign.js';
import { p, parsePhone, sha256, uuid5 } from '../src/util.js';
import { validateEmergency, validateRows } from '../src/validate.js';
import { applyAggregates } from '../src/reports-sync.js';

const row = (over: Partial<BundleRow>): BundleRow => ({
  id: 'sal_test', name: 'Test', org: 'Org', category: 'food.pantry', what: 'Free groceries',
  phones: [{ number: '313-555-0100' }], availability: 'call_first', schedules: [], flags: [], status: 'active',
  facts: { cadence_days: 45, reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' } },
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
  it('a tripped circuit breaker keeps closure reports off the badges', () => {
    const r = row({ facts: { ...row({}).facts, checked_at_entry: '2026-09-10', entry_method: 'phone' } });
    applyAggregates([r], agg({ circuit_breaker: true, targets: [{ target_id: 'sal_test', closed_open: 9, closed_last_at: '2026-09-18T10:00Z', wrong_open: 0, last_confirmed_at: null }] }));
    expect(badge(r, new Date('2026-09-18T17:45:00Z')).level).toBe('entry_checked');
  });
});

describe('helpers', () => {
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

describe('the real bundle', () => {
  let out: string, index: any, rows: BundleRow[];
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'dh-bundle-'));
    const r = await build({ aggregates: null, outDir: out, hsdsDir: null, quiet: true, now: new Date('2026-09-18T17:45:00Z') });
    index = r.index; rows = r.rows;
  }, 60000);

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
  it('reports whether emergency numbers are verified, and the heartbeat is a human date', () => {
    expect(typeof index.emergency_verified).toBe('boolean');
    expect(index.heartbeat).toBe('2026-09-18');
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
  it('station rows state their source and never claim to be checked', () => {
    const st = rows.find((r) => r.category === 'harm.narcan')!;
    expect(badge(st, new Date('2026-09-18T17:45:00Z'))).toMatchObject({ level: 'source_listed', params: { source_date: '2026-08-26' } });
    expect(badge(st, new Date('2027-01-15T17:45:00Z')).level).toBe('never_checked');
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
