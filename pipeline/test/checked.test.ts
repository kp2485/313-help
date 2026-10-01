// Oakland County's Narcan map (kind arcgis_checked): what each County record becomes, driven through the real
// functions with the Census Bureau's answers given in, so no test touches the network.

import { describe, expect, it } from 'vitest';
import { loadSources, type Source } from '../src/ingest-arcgis.js';
import { CHECKED_COLUMNS, MAX_GAP_M, outFields, sameCity, streetOnly, titleCity, toCheckedRows, type Match } from '../src/ingest-checked.js';
import { fromIngested } from '../src/normalize.js';
import { placeAt } from '../src/region.js';
import { validateSameAs } from '../src/validate.js';
import { p, readCsv } from '../src/util.js';

const OCN = loadSources().find((s) => s.id === 'oakland_narcan')!;
const feature = (props: Record<string, unknown>, lat: number, lon: number) => ({ properties: props, geometry: { coordinates: [lon, lat] } });
const rec = (name: string, address: string, city: string, zip: string, lat: number, lon: number, more: Record<string, unknown> = {}) =>
  feature({ USER_Name: name, USER_Address: address, USER_City: city, USER_Zip: zip, USER_Managed_By: 'Alliance of Coalitions for Healthy Communities', USER_Notes: 'Save a Life Box', ...more }, lat, lon);
const match = (lat: number, lon: number, city: string, zip: string, matched = ''): Match => ({ lat, lon, city, zip, matched });
// Every test point is in a named place unless it is the one that is not.
const PLACES: [number, string][] = [[42.49, 'Southfield'], [42.48, 'Hazel Park'], [42.68, 'Rochester Hills'], [42.47, 'Royal Oak Township'], [42.56, 'West Bloomfield Township']];
const placeOf = (lat: number) => (lat > 42.9 ? null : PLACES.find(([l]) => Math.abs(l - lat) < 0.005)?.[1] ?? 'Somewhere');

describe('a checked layer asks for only the fields it maps', () => {
  it('never asks the County for the contact-name field', () => {
    expect(outFields(OCN)).not.toContain('USER_Contact_Name');
    expect(outFields(OCN).sort()).toEqual(['USER_Address', 'USER_City', 'USER_Location', 'USER_Managed_By', 'USER_Name', 'USER_Notes', 'USER_Phone', 'USER_Zip'].sort());
  });
});

describe('what a County record becomes (toCheckedRows)', () => {
  const features = [
    rec('Youngbloods', '24918 John R Rd', 'Hazel Pak', '48030', 42.48, -83.10),
    rec('Rochester Hills substation', '750 Barclay Circle', 'Rochester Hills', '48307', 42.68, -83.13),
    rec('Temple', '14450 W 10 Mile Rd', 'Oak Park', '48327', 42.47, -83.17, { USER_Contact_Name: 'A Person', USER_Phone: '248-555-0100' }),
    rec('Far pin', '4600 Walnut Lake Rd', 'West Bloomfield Township', '48323', 42.56, -83.31),
    rec('No match', '1 Nowhere St', 'Pontiac', '48341', 42.49, -83.29),
    rec('Up north', '315 S Broad St', 'Holly', '48442', 42.95, -83.62),
    rec('Already listed', '27725 Greenfield Rd', 'Pontiac', '48076', 42.49, -83.20),
  ];
  const matches = new Map<string, Match | null>([
    ['Youngbloods|24918 John R Rd', match(42.4801, -83.1001, 'HAZEL PARK', '48030')],
    ['Rochester Hills substation|750 Barclay Circle', match(42.6802, -83.1302, 'ROCHESTER', '48307')],
    ['Temple|14450 W 10 Mile Rd', match(42.4701, -83.1701, 'OAK PARK', '48237')],
    ['Far pin|4600 Walnut Lake Rd', match(42.56, -83.377, 'WEST BLOOMFIELD', '48323', '4600 WALNUT LAKE RD, WEST BLOOMFIELD, MI, 48323')],
    ['No match|1 Nowhere St', null],
  ]);
  const src: Source = { ...OCN, same_as: { 'Already listed|27725 Greenfield Rd': 'sal_seed_row' } };
  const out = toCheckedRows(src, '2026-08-06', features, matches, '2026-10-01', undefined, placeOf);
  const by = (name: string) => [...out.rows, ...out.held].find((r) => r.name === name)!;

  it('a misspelt city takes the Census Bureau\'s spelling, and says so', () => {
    expect(by('Youngbloods')).toMatchObject({ city: 'Hazel Park', census_fixed: 'city (the layer says "Hazel Pak") from the US Census Bureau\'s match of this street' });
  });
  it('a right city stays, though the postal city differs: the match lies in the place the County named', () => {
    expect(by('Rochester Hills substation')).toMatchObject({ city: 'Rochester Hills', census_fixed: '' });
  });
  it('a mistyped ZIP takes the Census Bureau\'s ZIP, and says so', () => {
    expect(by('Temple')).toMatchObject({ zip: '48237', census_fixed: 'ZIP (the layer says "48327") from the US Census Bureau\'s match of this street' });
  });
  it('the street, phone and map point printed are the County\'s own, and no staff name is carried', () => {
    const t = by('Temple');
    expect(t).toMatchObject({ address_1: '14450 W 10 Mile Rd', phone: '248-555-0100', lat: '42.470000', lon: '-83.170000' });
    expect(Object.values(t).join(' ')).not.toContain('A Person');
    expect(Object.keys(t).every((k) => [...CHECKED_COLUMNS, 'why'].includes(k))).toBe(true);
  });
  it(`a pin more than ${MAX_GAP_M} m from its own address, and an address with no match, are held with the reason`, () => {
    expect(out.held.map((r) => r.name).sort()).toEqual(['Far pin', 'No match']);
    expect(by('Far pin').why).toMatch(/^its map point is 5\.5 km from its own street address \(4600 WALNUT LAKE RD/);
    expect(by('No match').why).toBe('the Census Bureau found no match for "1 Nowhere St, MI 48341"');
  });
  it('a record outside the 75 places is left out, and one a person already listed is skipped', () => {
    expect(out.outside).toBe(1);
    expect(out.same).toBe(1);
    expect([...out.rows, ...out.held].map((r) => r.name)).not.toContain('Up north');
    expect([...out.rows, ...out.held].map((r) => r.name)).not.toContain('Already listed');
  });
  it('ids are the layer\'s prefix and the record\'s own street and city', () => {
    expect(by('Youngbloods').sal_id).toBe('sal_ocn_24918_john_r_rd_hazel_park');
  });
});

describe('the small rules', () => {
  it('Royal Oak and Royal Oak Township are two places; West Bloomfield is West Bloomfield Township', () => {
    expect(sameCity('Royal Oak', 'Royal Oak Township')).toBe(false);
    expect(sameCity('West Bloomfield', 'West Bloomfield Township')).toBe(true);
    expect(sameCity('Clinton Twp', 'Clinton Township')).toBe(true);
    expect(sameCity('Pontiac', '')).toBe(false);
  });
  it('a postal spelling reads as a person writes it', () => {
    expect(titleCity('WOLVERINE LK')).toBe('Wolverine Lake');
    expect(titleCity('W BLOOMFIELD')).toBe('West Bloomfield');
    expect(titleCity('SOUTHFIELD')).toBe('Southfield');
  });
  it('the geocoder is asked about the building, not the unit', () => {
    expect(streetOnly('250 Elizabeth Lake Rd #1520')).toBe('250 Elizabeth Lake Rd');
    expect(streetOnly('1200 N Telegraph, Building #38E')).toBe('1200 N Telegraph');
    expect(streetOnly('1200 N. Telegraph Rd 34E')).toBe('1200 N. Telegraph Rd');
  });
});

describe('the listing a County record becomes (fromIngested, county_narcan)', () => {
  const [row] = fromIngested(OCN, [{
    sal_id: 'sal_ocn_x', record_ref: 'r', name: 'Neighborhood House', address_1: '1 Main St', city: 'Royal Oak', zip: '48067',
    org_name: 'Families Against Narcotics', census_fixed: '', lat: '42.49', lon: '-83.14', phone: '', website: '', hours_text: '',
    extra: 'USER_Notes=Vending Machine / Save a Life Box; USER_Location=in the lobby', source_id: 'oakland_narcan', source_last_edited: '2026-08-06', fetched_at: '2026-10-01',
  }]).rows;
  it('says what the County says and nothing more: free Narcan, the device, where it sits', () => {
    expect(row!.what).toBe('Free Narcan from a vending machine and a Save a Life box. It is in the lobby.');
    expect(row!.flags).toEqual(['walk_in']);
    expect(row!.availability).toBe('unknown');
  });
  it('names the group that runs the box, prints the record\'s own city, and credits the County\'s map', () => {
    expect(row!.org).toBe('Families Against Narcotics');
    expect(row!.address).toEqual({ line1: '1 Main St', city: 'Royal Oak', zip: '48067' });
    expect(row!.facts.source).toMatchObject({ type: 'open_data', name: 'Oakland County Narcan Locations map', last_edited: '2026-08-06' });
  });
});

describe('the committed file and the build', () => {
  const live = readCsv(p('data/ingested/oakland_narcan.csv'));
  it('every published County box is inside the 75 places, at the County\'s own point', () => {
    expect(live.length).toBeGreaterThan(80);
    for (const r of live) expect(placeAt(Number(r.lat), Number(r.lon)), r.sal_id).not.toBeNull();
  });
  it('a row the Census Bureau corrected says what the County had written', () => {
    for (const r of live.filter((x) => x.census_fixed)) expect(r.census_fixed, r.sal_id).toMatch(/the layer says "[^"]*"\) from the US Census Bureau's match of this street$/);
  });
  it('a same_as line naming a row that is not an active listing stops the build', () => {
    const rows = [{ id: 'sal_a', status: 'active' }, { id: 'sal_b', status: 'archived' }] as any;
    expect(validateSameAs('oakland_narcan', { x: 'sal_a' }, rows).errors).toEqual([]);
    expect(validateSameAs('oakland_narcan', { y: 'sal_b', z: 'sal_gone' }, rows).errors).toHaveLength(2);
  });
});
