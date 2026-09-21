// An ingested id belongs to one record of the publisher's, for good (DECISIONS 2026-09-22).
//
// On 2026-09-21 the City's Narcan layer answered with its two boxes at 13601 W. McNichols in the other order,
// and `sal_hr_13601_w_mcnichols` silently moved from the Citgo record to the Amoco one. Ids are what reports,
// saved places and steward decisions hang on, so these tests are about one promise: an id never moves.
//
// Network-free: every test here reads the committed CSVs or builds features by hand.

import { describe, expect, it } from 'vitest';
import { INGESTED_COLUMNS, loadSources, toRows, type Source } from '../src/ingest-arcgis.js';
import { assignIds, NO_PRIOR, readPrior, recordKey, type PriorIds } from '../src/ingest-ids.js';
import { MYMAP_COLUMNS, parseKml, toRows as mymapRows, type Placemark } from '../src/ingest-mymap.js';
import { validateIngestedIds } from '../src/validate.js';
import { p, readCsv, type CsvRow } from '../src/util.js';

const src = (id: string): Source => loadSources().find((s) => s.id === id)!;
const DHD = 'dhd_harm_reduction', WWS = 'wayne_well_wayne_stations';

/** The ids the published file holds, by the record each one belongs to. */
const priorOf = (rows: CsvRow[]): PriorIds => ({ ids: new Map(rows.map((r) => [recordKey(r), r.sal_id!])), retired: [] });

/** A deterministic shuffle, so a failure is reproducible. */
function shuffled<T>(xs: T[], seed = 12345): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The committed Health Department file, turned back into the ArcGIS features it was read from. */
function dhdFeatures(): { rows: CsvRow[]; features: object[] } {
  const rows = readCsv(p('data/ingested', `${DHD}.csv`));
  const features = rows.map((r) => ({
    geometry: { coordinates: [Number(r.lon), Number(r.lat)] },
    properties: {
      GlobalID: r.record_ref, Location_Description: r.name, Address: r.address_1, Zip: r.zip,
      Phone_Number: r.phone, Website: r.website, Hours_of_Operations: r.hours_text,
      ...Object.fromEntries((r.extra ?? '').split('; ').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])),
    },
  }));
  return { rows, features };
}

const csv = (rows: CsvRow[], columns: string[]) => rows.map((r) => columns.map((c) => r[c] ?? '').join('')).join('\n');

describe('an ingested id never moves to a different record (pipeline/src/ingest-ids.ts)', () => {
  const layer: Source = { id: 'hr', name: 'HR', kind: 'arcgis', url: 'x', id_prefix: 'hr', fields: { name: 'Location_Description', address: 'Address', ref: 'GlobalID' } };
  const feat = (ref: string, name: string, address: string, lon = -83.1, lat = 42.35) =>
    ({ geometry: { coordinates: [lon, lat] }, properties: { GlobalID: ref, Location_Description: name, Address: address } });

  it('THE BUG: the two Narcan boxes at 13601 W. McNichols keep the ids main published, in either order', () => {
    const { rows, features } = dhdFeatures();
    const prior = priorOf(rows);
    const published = new Map(rows.map((r) => [r.record_ref!, r.sal_id!]));
    expect(published.get('0df12f9d-83b0-405c-bd4f-a6378c09119b')).toBe('sal_hr_13601_w_mcnichols');                      // Citgo
    expect(published.get('a715adf5-070a-482f-928a-d3e767cb650c')).toBe('sal_hr_13601_w_mcnichols_amoco_gas_station');    // Amoco

    for (const order of [features, [...features].reverse(), shuffled(features), shuffled(features, 999)]) {
      const out = toRows(src(DHD), '2026-08-26', order, '2026-09-22', prior);
      const got = new Map(out.rows.map((r) => [r.record_ref!, r.sal_id!]));
      expect(got.get('0df12f9d-83b0-405c-bd4f-a6378c09119b')).toBe('sal_hr_13601_w_mcnichols');
      expect(got.get('a715adf5-070a-482f-928a-d3e767cb650c')).toBe('sal_hr_13601_w_mcnichols_amoco_gas_station');
      expect(got).toEqual(published);       // and so does every other row in the layer
    }
  });

  it('the whole committed Health Department file comes back byte-identical whatever order the service answers in', () => {
    const { rows, features } = dhdFeatures();
    const prior = priorOf(rows);
    const want = csv(rows, INGESTED_COLUMNS);
    for (const order of [features, [...features].reverse(), shuffled(features), shuffled(features, 7)]) {
      const out = toRows(src(DHD), '2026-08-26', order, rows[0]!.fetched_at!, prior);
      expect(csv(out.rows, INGESTED_COLUMNS)).toBe(want);
      expect(out.retired).toEqual([]);      // nothing vanished, so nothing is retired
    }
  });

  it('a record that the layer renamed, or whose address text changed, keeps its id', () => {
    const prior: PriorIds = { ids: new Map([['ref-1', 'sal_hr_1_main']]), retired: [] };
    const { rows } = toRows(layer, null, [feat('ref-1', 'Citgo Gas Station', '1 Main')], '2026-09-22', prior);
    expect(rows[0]!.sal_id).toBe('sal_hr_1_main');
    // Renamed and re-addressed by the publisher. The id is the same; the diff a steward reads shows the change.
    const after = toRows(layer, null, [feat('ref-1', 'Shell Gas Station', '3 Other St')], '2026-09-22', prior);
    expect(after.rows[0]!.sal_id).toBe('sal_hr_1_main');
    expect(after.rows[0]).toMatchObject({ name: 'Shell Gas Station', address_1: '3 Other St' });
  });

  it('a new record at an occupied address gets a suffixed id and does not disturb the one already there', () => {
    const prior: PriorIds = { ids: new Map([['ref-1', 'sal_hr_1_main']]), retired: [] };
    const both = [feat('ref-1', 'Citgo Gas Station', '1 Main'), feat('ref-2', 'Amoco Gas Station', '1 Main')];
    for (const order of [both, [...both].reverse()]) {
      const { rows, warnings } = toRows(layer, null, order, '2026-09-22', prior);
      const by = new Map(rows.map((r) => [r.record_ref!, r.sal_id!]));
      expect(by.get('ref-1')).toBe('sal_hr_1_main');
      expect(by.get('ref-2')).toBe('sal_hr_1_main_amoco_gas_station');
      expect(warnings.join(' ')).toMatch(/two records at one address in one category/);
    }
  });

  it("a vanished record's id is retired, reported, and never handed to a newcomer at the same address", () => {
    const prior: PriorIds = { ids: new Map([['gone', 'sal_hr_1_main']]), retired: [] };
    const { rows, warnings, retired } = toRows(layer, null, [feat('new', 'Newcomer', '1 Main')], '2026-09-22', prior);
    expect(rows[0]!.sal_id).not.toBe('sal_hr_1_main');
    expect(rows[0]!.sal_id).toBe('sal_hr_1_main_newcomer');
    expect(retired).toEqual([{ sal_id: 'sal_hr_1_main', record_ref: 'gone', last_seen: '2026-09-22' }]);
    expect(warnings.join(' ')).toMatch(/sal_hr_1_main \(gone\) is no longer in the source/);

    // And it stays retired on every later run, even once the tombstone is all that is left of it.
    const later = toRows(layer, null, [feat('newer', 'Another One', '1 Main')], '2026-09-23', { ids: new Map(), retired });
    expect(later.rows[0]!.sal_id).toBe('sal_hr_1_main_another_one');
  });

  it('a record that comes back gets its own id back, rather than a second one', () => {
    const retired = [{ sal_id: 'sal_hr_1_main', record_ref: 'ref-1', last_seen: '2026-09-22' }];
    const out = toRows(layer, null, [feat('ref-1', 'Citgo Gas Station', '1 Main')], '2026-09-23', { ids: new Map(), retired });
    expect(out.rows[0]!.sal_id).toBe('sal_hr_1_main');
    expect(out.retired).toEqual([]);
  });

  it('a first read with no previous file mints in record-reference order, not arrival order', () => {
    const both = [feat('zzz', 'Zed Store', '1 Main'), feat('aaa', 'Able Store', '1 Main')];
    const ids = (fs: object[]) => Object.fromEntries(toRows(layer, null, fs, '2026-09-22', NO_PRIOR).rows.map((r) => [r.record_ref, r.sal_id]));
    expect(ids(both)).toEqual({ aaa: 'sal_hr_1_main', zzz: 'sal_hr_1_main_zed_store' });
    expect(ids([...both].reverse())).toEqual(ids(both));
  });

  it('a third record at one address with the same name falls back to a stable hash of the reference', () => {
    const three = [feat('aaa', 'Gas Station', '1 Main'), feat('bbb', 'Gas Station', '1 Main'), feat('ccc', 'Gas Station', '1 Main')];
    const of = (fs: object[]) => Object.fromEntries(toRows(layer, null, fs, '2026-09-22', NO_PRIOR).rows.map((r) => [r.record_ref, r.sal_id!]));
    const ids = of(three);
    expect(new Set(Object.values(ids)).size).toBe(3);
    expect(ids.aaa).toBe('sal_hr_1_main');
    expect(ids.bbb).toBe('sal_hr_1_main_gas_station');
    expect(ids.ccc).toMatch(/^sal_hr_1_main_[0-9a-f]{8}$/);
    expect(of(shuffled(three))).toEqual(ids);      // and the hash does not depend on the answer's order
  });

  it('a layer that answers twice for one reference reports it and never writes two rows with one id', () => {
    const { rows, warnings } = toRows(layer, null, [feat('ref-1', 'A', '1 Main'), feat('ref-1', 'B', '2 Other')], '2026-09-22', NO_PRIOR);
    expect(rows).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/two records share the reference "ref-1"/);
  });
});

describe("Wayne County's station map has the same guarantees (pipeline/src/ingest-mymap.ts)", () => {
  const pm = (city: string, name: string, lat = 42.36, lon = -83.05): Placemark => ({ city, name, description: 'Station Type: Newsstand<br>24/7 Access: Yes', lat, lon });

  it('the committed file comes back byte-identical whatever order the KML lists the placemarks in', () => {
    const rows = readCsv(p('data/ingested', `${WWS}.csv`));
    const prior = priorOf(rows);
    const stations = rows.map((r) => pm(r.city!, r.name!, Number(r.lat), Number(r.lon)));
    const want = rows.map((r) => `${r.sal_id}|${r.city}|${r.name}`).join('\n');
    for (const order of [stations, [...stations].reverse(), shuffled(stations), shuffled(stations, 42)]) {
      const out = mymapRows(src(WWS), '2026-09-14', order, rows[0]!.fetched_at!, prior);
      expect(out.rows.map((r) => `${r.sal_id}|${r.city}|${r.name}`).join('\n')).toBe(want);
      expect(out.retired).toEqual([]);
      expect(MYMAP_COLUMNS).toContain('city');
    }
  });

  it('a station this map has already published keeps its id when the map reorders or a new one joins it', () => {
    const rows = readCsv(p('data/ingested', `${WWS}.csv`));
    const first = rows[0]!;
    const prior = priorOf(rows);
    const stations = [...rows.map((r) => pm(r.city!, r.name!, Number(r.lat), Number(r.lon))), pm(first.city!, `${first.name} Annex`, Number(first.lat), Number(first.lon))];
    const out = mymapRows(src(WWS), '2026-09-14', shuffled(stations), '2026-09-22', prior);
    const by = new Map(out.rows.map((r) => [`${r.city}|${r.name}`, r.sal_id!]));
    expect(by.get(`${first.city}|${first.name}`)).toBe(first.sal_id);
    expect(by.get(`${first.city}|${first.name} Annex`)).not.toBe(first.sal_id);
  });

  it("a station the County drops has its id retired, and a later station never gets it", () => {
    const prior: PriorIds = { ids: new Map([['Detroit|Old Station', 'sal_wws_detroit_old_station']]), retired: [] };
    const out = mymapRows(src(WWS), '2026-09-14', [pm('Detroit', 'New Station')], '2026-09-22', prior);
    expect(out.retired).toEqual([{ sal_id: 'sal_wws_detroit_old_station', record_ref: 'Detroit|Old Station', last_seen: '2026-09-22' }]);
    const again = mymapRows(src(WWS), '2026-09-14', [pm('Detroit', 'Old Station')], '2026-09-23', { ids: new Map(), retired: out.retired });
    expect(again.rows[0]!.sal_id).toBe('sal_wws_detroit_old_station');   // the same station, so its own id back
  });

  it('the map states no per-placemark id, so the key is the city and name it states — and that is written down', () => {
    const { placemarks } = parseKml('<kml><Document><Placemark><name>[Detroit] A Store</name><Point><coordinates>-83.05,42.36,0</coordinates></Point></Placemark></Document></kml>');
    const { rows } = mymapRows(src(WWS), null, placemarks, '2026-09-22', NO_PRIOR);
    expect(rows[0]!.record_ref).toBe('');
    expect(recordKey(rows[0]!)).toBe('Detroit|A Store');
  });
});

describe('the build refuses a moved or reused id (pipeline/src/validate.ts)', () => {
  const row = (sal_id: string, record_ref: string, name = 'X') => ({ sal_id, record_ref, name });

  it('passes on what is committed today', () => {
    for (const id of [DHD, WWS]) {
      const live = readCsv(p('data/ingested', `${id}.csv`));
      expect(validateIngestedIds(id, live, readCsv(p('data/ingested', `${id}.retired-ids.csv`))).errors).toEqual([]);
    }
  });

  it('fails when one id stands for two different records', () => {
    const errors = validateIngestedIds(DHD, [row('sal_hr_13601_w_mcnichols', '0df12f9d'), row('sal_hr_13601_w_mcnichols', 'a715adf5')], []).errors;
    expect(errors.join(' ')).toMatch(/sal_hr_13601_w_mcnichols stands for two different records/);
  });

  it('fails when a retired id comes back on a different record', () => {
    const errors = validateIngestedIds(DHD, [row('sal_hr_1_main', 'newcomer')], [row('sal_hr_1_main', 'gone')]).errors;
    expect(errors.join(' ')).toMatch(/was retired from "gone" and now belongs to "newcomer"/);
  });

  it('allows a retired id back on the record it was retired from', () => {
    expect(validateIngestedIds(DHD, [row('sal_hr_1_main', 'ref-1')], [row('sal_hr_1_main', 'ref-1')]).errors).toEqual([]);
  });
});

describe('reading what a source committed last time (readPrior)', () => {
  it("finds the Health Department's ids by GlobalID and the County's by city and name", () => {
    const dhd = readPrior(DHD);
    expect(dhd.ids.get('0df12f9d-83b0-405c-bd4f-a6378c09119b')).toBe('sal_hr_13601_w_mcnichols');
    expect(dhd.ids.get('a715adf5-070a-482f-928a-d3e767cb650c')).toBe('sal_hr_13601_w_mcnichols_amoco_gas_station');
    const wws = readPrior(WWS);
    const first = readCsv(p('data/ingested', `${WWS}.csv`))[0]!;
    expect(wws.ids.get(`${first.city}|${first.name}`)).toBe(first.sal_id);
  });

  it('a source that has never run gets nothing, and mints from scratch', () => {
    const prior = readPrior('a_source_that_does_not_exist');
    expect(prior.ids.size).toBe(0);
    expect(prior.retired).toEqual([]);
    expect(assignIds('sal_x_', [{ key: 'k', base: 'one_main', alt: 'store' }], prior, '2026-09-22').ids.get('k')).toBe('sal_x_one_main');
  });
});
