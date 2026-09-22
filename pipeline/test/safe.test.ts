// The City's police-precinct and fire-station layers: which features become listings, and what those listings
// say (pipeline/src/ingest-safe.ts, DECISIONS 2026-09-22). Network-free: the fixtures below are the shape the
// two layers actually answer with, including the parts that made a dedicated ingest necessary — a whole postal
// address in one field, latitude and longitude in fields named the other way round, staff names beside the
// phone number, and features that are not places to walk into at 3am.

import { describe, expect, it } from 'vitest';
import { badge, openNow, type BundleRow } from '@313help/query';
import { loadSources, type Source } from '../src/ingest-arcgis.js';
import { fireName, policeName, SAFE_COLUMNS, splitAddress, toSafeRows } from '../src/ingest-safe.js';
import { fromIngested } from '../src/normalize.js';
import { validateRows } from '../src/validate.js';
import { p, readCsv } from '../src/util.js';

const src = (id: string): Source => loadSources().find((s) => s.id === id)!;
const POLICE = 'detroit_police_precincts', FIRE = 'detroit_fire_stations';
const feat = (props: Record<string, unknown>, lon: number, lat: number) =>
  ({ properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });

// Straight from the layer, staff names and all: the two fields this ingest must never read.
const PRECINCTS = [
  feat({ Precinct: '3rd', Address: '2875 W. Grand Boulevard', City: 'Detroit', State: 'MI', Zip: '48202', Phone: '(313) 596-5300', Leadership: 'Commander Giaquinto', NPO: 'Officer Carrie Thomas (313)590-4327' }, -83.0813268556457, 42.3677779600266),
  feat({ Precinct: '5th', Address: '3500 Conner Avenue', City: 'Detroit', State: 'MI', Zip: '48215', Phone: '(313) 596-5500', Leadership: 'Commander Ewing', NPO: 'Officer Deborah Gaines (313)643-0202' }, -82.9660191057761, 42.3817806012646),
  // Not a precinct front counter: a downtown unit and the department's headquarters building.
  feat({ Precinct: 'Downtown Services', Address: '20 Atwater Street', City: 'Detroit', Zip: '48226', Phone: '(313) 237-2850', Leadership: 'Captain Conway Petty' }, -83.0423319359863, 42.327487884668),
  feat({ Precinct: 'DPSH', Address: '1301 3rd Street', City: 'Detroit', Zip: '48226', Phone: '(313) 596-2200' }, -83.0581640394881, 42.3301801256905),
];

const STATIONS = [
  feat({ Firehouse: 'ENGINE 01', FH_Short: 'E-1', Address: '111 W Montcalm Street, Detroit, Michigan, 48201', Lat: -83.05408151, Long: 42.3378751765 }, -83.054081509554, 42.3378751764982),
  feat({ Firehouse: 'LADDER 14', FH_Short: 'L-14', Address: '2200 Crane Street, Detroit, Michigan, 48214', Lat: -82.9878, Long: 42.3633 }, -82.987833, 42.363310),
  feat({ Firehouse: 'SQUAD 03', FH_Short: 'S-03', Address: '1818 E Grand Boulevard, Detroit, Michigan, 48211', Lat: -83.0363566329, Long: 42.375531735 }, -83.0363566328523, 42.3755317349017),
  // Not an engine house: the training centre, the fireboat house, and a half-typed row the layer still carries.
  feat({ Firehouse: 'RTC', FH_Short: 'RTC', Address: '10200 Erwin Avenue, Detroit, Michigan, 48234' }, -83.0355, 42.4210),
  feat({ Firehouse: 'FIREBOAT', FH_Short: 'FB', Address: '40 24th Street, Detroit, Michigan, 48216' }, -83.0938, 42.3118),
  feat({ Firehouse: '27 hf 7 Lad 8', FH_Short: null, Address: null }, -83.09, 42.31),
];

const police = toSafeRows(src(POLICE), '2018-07-19', PRECINCTS, '2026-09-22');
const fire = toSafeRows(src(FIRE), '2024-02-24', STATIONS, '2026-09-22');

describe('naming what the City publishes (pipeline/src/ingest-safe.ts)', () => {
  it('turns an ordinal into a precinct name, and refuses anything that is not one', () => {
    expect(policeName('3rd')).toBe('Detroit Police 3rd Precinct');
    expect(policeName('12th')).toBe('Detroit Police 12th Precinct');
    for (const x of ['Downtown Services', 'DPSH', 'Training Academy', 'Aviation', '']) expect(policeName(x), x).toBeNull();
  });

  it('turns a fire company into a station name, and refuses anything that is not an engine house', () => {
    expect(fireName('ENGINE 01')).toBe('Engine 1 fire station');
    expect(fireName('LADDER 14')).toBe('Ladder 14 fire station');
    expect(fireName('SQUAD 03')).toBe('Squad 3 fire station');
    for (const x of ['RTC', 'FIREBOAT', '27 hf 7 Lad 8', '']) expect(fireName(x), x).toBeNull();
  });

  it("splits the fire layer's one-field address, and keeps the whole string when it is not that shape", () => {
    expect(splitAddress('111 W Montcalm Street, Detroit, Michigan, 48201')).toEqual({ line1: '111 W Montcalm Street', city: 'Detroit', zip: '48201' });
    // A city is never guessed: an address the layer writes some other way states no city and no ZIP of its own.
    expect(splitAddress('111 W Montcalm Street')).toEqual({ line1: '111 W Montcalm Street', city: '', zip: '' });
  });
});

describe('the rows the two layers become', () => {
  it('keeps the public-facing buildings and names what it left out', () => {
    expect(police.rows.map((r) => r.name)).toEqual(['Detroit Police 3rd Precinct', 'Detroit Police 5th Precinct']);
    expect(police.dropped).toEqual(['Downtown Services', 'DPSH']);
    expect(fire.rows.map((r) => r.name)).toEqual(['Engine 1 fire station', 'Ladder 14 fire station', 'Squad 3 fire station']);
    expect(fire.dropped).toEqual(['RTC', 'FIREBOAT', '27 hf 7 Lad 8']);
  });

  it('never reads a staff name or an officer’s mobile number, whatever the layer carries', () => {
    const text = JSON.stringify(police.rows) + JSON.stringify(fire.rows);
    for (const leak of ['Giaquinto', 'Ewing', 'Conway Petty', 'Carrie Thomas', 'Deborah Gaines', '590-4327', '643-0202']) {
      expect(text, leak).not.toContain(leak);
    }
    expect(Object.keys(police.rows[0]!).sort()).toEqual([...SAFE_COLUMNS].sort());
  });

  it('takes the precinct desk number the City prints, and no number at all for a fire station', () => {
    expect(police.rows.find((r) => r.name!.includes('3rd'))!.phone).toBe('(313) 596-5300');
    for (const r of fire.rows) expect(r.phone).toBe('');
  });

  it("reads the fire layer's geometry, not its two fields that hold the other one's value", () => {
    const e1 = fire.rows.find((r) => r.name === 'Engine 1 fire station')!;
    // The layer's own `Lat` for this station is -83.054 and its `Long` is 42.337. The row has it the right way up.
    expect(Number(e1.lat)).toBeCloseTo(42.3378, 3);
    expect(Number(e1.lon)).toBeCloseTo(-83.0540, 3);
    expect(e1.address_1).toBe('111 W Montcalm Street');
    expect(e1.city).toBe('Detroit');
    expect(e1.zip).toBe('48201');
  });

  it("keys an id to the publisher's own reference, so a renamed or moved record keeps it", () => {
    expect(police.rows.map((r) => r.record_ref)).toEqual(['3rd', '5th']);
    expect(fire.rows.map((r) => r.record_ref)).toEqual(['E-1', 'L-14', 'S-03']);
    const prior = { ids: new Map([['3rd', 'sal_dpd_detroit_police_3rd_precinct']]), retired: [] };
    const moved = PRECINCTS.map((f) => (f.properties.Precinct === '3rd' ? feat({ ...f.properties, Address: '1 New Street' }, -83.08, 42.36) : f));
    const again = toSafeRows(src(POLICE), '2018-07-19', moved, '2026-09-23', prior);
    expect(again.rows.find((r) => r.record_ref === '3rd')!.sal_id).toBe('sal_dpd_detroit_police_3rd_precinct');
    expect(again.rows.find((r) => r.record_ref === '3rd')!.address_1).toBe('1 New Street');
  });

  it('drops a feature the City places outside the four cities rather than listing it', () => {
    const away = toSafeRows(src(POLICE), '2018-07-19', [feat({ Precinct: '9th', Address: '1 Somewhere', City: 'Lansing', Zip: '48933' }, -84.55, 42.73)], '2026-09-22');
    expect(away.rows).toEqual([]);
    expect(away.warnings.join(' ')).toMatch(/outside the service area/);
  });
});

describe('what a person reads on one of these listings', () => {
  const rows = (id: string, csv: typeof police) => fromIngested(src(id), csv.rows).rows;
  const bundlePolice = rows(POLICE, police), bundleFire = rows(FIRE, fire);
  const at = new Date('2026-09-22T03:30:00-04:00');   // half past three in the morning

  it('is open at 3am, and says what to do when the door does not open', () => {
    for (const r of [...bundlePolice, ...bundleFire]) {
      expect(r.availability, r.id).toBe('always');
      expect(openNow(r, at, []).state, r.id).toBe('open');
    }
    expect(bundlePolice[0]!.notice).toBe('If you are in danger, call 911.');
    // A fire station is staffed but the crew goes out; the row says so instead of promising a person at the door.
    expect(bundleFire[0]!.notice).toBe('Ring the bell. If no one answers, call 911.');
    expect(bundleFire[0]!.what).toContain('they go out on calls');
  });

  it("says it is on the City's list and never that a person checked it", () => {
    for (const r of [...bundlePolice, ...bundleFire]) {
      expect(r.facts.entry_method, r.id).toBeNull();
      expect(r.facts.checked_at_entry, r.id).toBeNull();
      expect(badge(r, at).key, r.id).toBe('badge.source_listed');
    }
    expect(badge(bundlePolice[0]!, at).params).toEqual({ source: 'City of Detroit Police Precinct Buildings layer', source_date: '2018-07-19' });
    expect(badge(bundleFire[0]!, at).params).toEqual({ source: 'Detroit Fire Department Fire Stations layer', source_date: '2024-02-24' });
  });

  it('labels the precinct number as the station desk, not as the way to reach help', () => {
    expect(bundlePolice[0]!.phones).toEqual([{ number: '313-596-5300', label: 'Station desk' }]);
    expect(bundleFire[0]!.phones).toEqual([]);
  });

  it('is an ordinary listing the build accepts', () => {
    const all: BundleRow[] = [...bundlePolice, ...bundleFire];
    expect(validateRows(all, '2026-09-22').errors).toEqual([]);
    for (const r of all) expect(r.category === 'safe.police' || r.category === 'safe.fire', r.category).toBe(true);
  });
});

describe('the committed files the City layers wrote', () => {
  it('carry every Detroit precinct and engine house, each with a coordinate', () => {
    const p1 = readCsv(p('data/ingested', `${POLICE}.csv`)), p2 = readCsv(p('data/ingested', `${FIRE}.csv`));
    expect(p1.length).toBeGreaterThanOrEqual(11);
    expect(p2.length).toBeGreaterThanOrEqual(36);
    for (const r of [...p1, ...p2]) {
      expect(r.lat, r.sal_id).toMatch(/^42\./);
      expect(r.name, r.sal_id).toMatch(/Precinct$|fire station$/);
    }
  });
});
