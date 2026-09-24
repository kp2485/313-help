// The four federal datasets staged for the wider service area (pipeline/src/ingest-federal.ts). Network-free: the
// fixtures below are the shape each dataset actually answers with, including the rows that must never be staged —
// an airport's airside fire station, a bookmobile, a health center at a domestic-violence shelter, a hospital whose
// mailing city shares its name with a place in another county. The last block reads the committed staging files.

import { describe, expect, it } from 'vitest';
import {
  cmsRows, COVERED, FEDERAL_COLUMNS, hrsaRows, imlsRows, placeByCity, stage, usgsRows, type Parsed,
} from '../src/ingest-federal.js';
import { placeAt, regionPlaces, type Place } from '../src/region.js';
import { p, readCsv } from '../src/util.js';

type Pt = [number, number];
const square = (x0: number, y0: number, x1: number, y1: number): Pt[][] => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const place = (id: string, name: string, county: string, rings: Pt[][]): Place =>
  ({ id, name, counties: [county], geoids: [], semmcd: 0, center: rings[0]![0]!, rings });
// Two made-up places side by side: a covered city and a suburb.
const PLACES = [
  place('city_detroit', 'Detroit', 'Wayne', square(0, 0, 1, 1)),
  place('city_warren', 'Warren', 'Macomb', square(1, 0, 2, 1)),
  place('city_clinton_township', 'Clinton Township', 'Macomb', square(2, 0, 3, 1)),
];
const FETCHED = '2026-09-24';
const csv = (header: string[], rows: string[][]) =>
  [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';

const usgs = (name: string, id: string, lon: number, lat: number) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { permanent_identifier: id, name, address: '1 Main Street', city: 'Warren', zipcode: '48093', loaddate: 1659398400000 },
});

describe('USGS fire and police stations', () => {
  const features = [
    usgs('Warren Fire Department Station 2 Headquarters', 'u-1', 1.5, 0.5),
    usgs('Ferndale Fire Department Headquarters', 'u-2', 1.4, 0.5),
    usgs('Detroit Metropolitan Wayne County Airport Fire Department Station 100', 'u-3', 1.3, 0.5),
    usgs('Detroit Fire Department Engine 1', 'u-4', 0.5, 0.5),                 // in a covered city
    usgs('Somewhere Far Fire Department', 'u-5', 9, 9),                        // outside every place
  ];
  const got = stage('fire', usgsRows('fire', features, 'https://example.test/16'), PLACES, FETCHED);

  it('keeps a station in a suburb, placed by its own coordinate, with no phone the layer does not print', () => {
    expect(got.rows.map((r) => r.name)).toEqual(['Ferndale Fire Department Headquarters', 'Warren Fire Department Station 2 Headquarters']);
    const warren = got.rows.find((r) => r.record_ref === 'u-1')!;
    expect(warren).toMatchObject({ category: 'safe.fire', place_id: 'city_warren', county: 'Macomb', placed_by: 'coordinate', phone: '', source_last_edited: '2022-08-02' });
    expect(warren.candidate_id).toBe('sal_usfire_warren_fire_department_station_2_headquarters');
  });

  it('flags a "Headquarters" with no station for the research step instead of guessing it away', () => {
    expect(got.rows.find((r) => r.record_ref === 'u-2')!.note).toMatch(/headquarters and no station/);
    expect(got.rows.find((r) => r.record_ref === 'u-1')!.note).toBe('');
  });

  it("drops an airport's station by name, a covered city's station and a point outside the area, and says so", () => {
    expect(got.dropped.get('not a public station (by name)')).toEqual(['Detroit Metropolitan Wayne County Airport Fire Department Station 100']);
    expect(got.dropped.get('in Detroit (already covered)')).toEqual(['Detroit Fire Department Engine 1']);
    expect(got.dropped.get('outside the service area')).toHaveLength(1);
  });

  it('marks a sheriff or a state police post as not a city police department', () => {
    const police = stage('police', usgsRows('police', [usgs('Michigan State Police Metro Post', 'u-9', 1.5, 0.5)], 'x'), PLACES, FETCHED);
    expect(police.rows[0]).toMatchObject({ category: 'safe.police', note: 'not a city police department' });
  });
});

describe('CMS hospitals with an emergency department, placed by mailing city', () => {
  const header = ['Facility ID', 'Facility Name', 'Address', 'City/Town', 'State', 'ZIP Code', 'County/Parish', 'Telephone Number', 'Hospital Type', 'Emergency Services'];
  const text = csv(header, [
    ['230001', 'WARREN HOSPITAL', '1 E 12 MILE', 'WARREN', 'MI', '48093', 'MACOMB', '(586) 573-5000', 'Acute Care Hospitals', 'Yes'],
    ['230002', 'CLINTON HOSPITAL', '2 MAIN', 'CLINTON', 'MI', '49236', 'LENAWEE', '(517) 555-0100', 'Acute Care Hospitals', 'Yes'],
    ['230003', 'WARREN SURGICAL', '3 MAIN', 'WARREN', 'MI', '48093', 'MACOMB', '(586) 555-0100', 'Acute Care Hospitals', 'No'],
    ['230004', 'DETROIT HOSPITAL', '4 MAIN', 'DETROIT', 'MI', '48201', 'WAYNE', '(313) 555-0100', 'Acute Care Hospitals', 'Yes'],
    ['990001', 'OHIO HOSPITAL', '5 MAIN', 'WARREN', 'OH', '44481', 'TRUMBULL', '(330) 555-0100', 'Acute Care Hospitals', 'Yes'],
  ]);
  const got = stage('er', cmsRows(text, 'https://data.cms.gov/provider-data/dataset/xubh-q36u', '2026-07-22'), PLACES, FETCHED);

  it('stages only an emergency department in a suburb, with no coordinate and placed_by=city', () => {
    expect(got.rows).toHaveLength(1);
    expect(got.rows[0]).toMatchObject({
      name: 'WARREN HOSPITAL', category: 'health.er', place_id: 'city_warren', lat: '', lon: '', placed_by: 'city',
      phone: '586-573-5000', source_last_edited: '2026-07-22', record_ref: '230001',
    });
  });

  it('never matches a mailing city in another county, never another state, never a hospital with no emergency department', () => {
    expect(got.dropped.get('mailing city is not a place in the service area')).toEqual(['CLINTON HOSPITAL']);
    expect(got.dropped.get('no emergency department')).toEqual(['WARREN SURGICAL']);
    expect(got.dropped.get('in Detroit (already covered)')).toEqual(['DETROIT HOSPITAL']);
    expect(JSON.stringify(got)).not.toContain('OHIO');
  });

  it('reads the way mail writes a place, in the real region', () => {
    const places = regionPlaces();
    expect(placeByCity('W BLOOMFIELD', 'OAKLAND', places)?.id).toBe('city_west_bloomfield_township');
    expect(placeByCity('CLINTON TOWNSHIP', 'MACOMB', places)?.id).toBe('city_clinton_township');
    expect(placeByCity('MT CLEMENS', 'MACOMB', places)?.id).toBe('city_mount_clemens');
    expect(placeByCity('CLINTON', 'LENAWEE', places)).toBeNull();
  });
});

describe('IMLS library outlets', () => {
  const header = ['STABR', 'FSCSKEY', 'FSCS_SEQ', 'LIBID', 'LIBNAME', 'ADDRESS', 'CITY', 'ZIP', 'PHONE', 'C_OUT_TY', 'STATSTRU', 'LONGITUD', 'LATITUDE', 'GEOMTYPE'];
  const text = csv(header, [
    ['MI', 'MI0397', '002', 'MI0397-002', 'CLINTON-MACOMB PUBLIC LIBRARY', '40900 ROMEO PLANK ROAD', 'CLINTON TOWNSHIP', '48038', '5862265000', 'CE', '00', '2.5', '0.5', 'POINTADDRESS'],
    // The FY 2024 file repeats a LIBID across two branches; the key is FSCSKEY + FSCS_SEQ.
    ['MI', 'MI0397', '004', 'MI0397-004', 'SOUTH BRANCH', '35679 SOUTH GRATIOT AVENUE', 'CLINTON TOWNSHIP', '48035', '5862265070', 'BR', '00', '2.6', '0.5', 'POINTADDRESS'],
    ['MI', 'MI0397', '005', 'MI0397-004', 'NORTH BRANCH', '54100 BROUGHTON RD.', 'CLINTON TOWNSHIP', '48042', '5862265080', 'BR', '25', '2.7', '0.5', 'MANUAL'],
    ['MI', 'MI0356', '009', 'MI0356-009', 'BOOKMOBILE', '1 MAIN', 'WARREN', '48093', '5865550100', 'BS', '00', '1.5', '0.5', 'POINTADDRESS'],
    ['MI', 'MI0001', '003', 'MI0001-003', 'CONELY BRANCH LIBRARY', '4600 MARTIN', 'WARREN', '48093', '3135550100', 'BR', '23', '1.6', '0.5', 'POINTADDRESS'],
  ]);
  const got = stage('library', imlsRows(text, 'https://www.imls.gov/x.zip', '2026-06-16'), PLACES, FETCHED);

  it('keeps central libraries and branches, each under its own survey key, with the survey phone', () => {
    expect(got.rows.map((r) => r.record_ref).sort()).toEqual(['MI0397-002', 'MI0397-004', 'MI0397-005']);
    expect(got.rows.find((r) => r.record_ref === 'MI0397-002')).toMatchObject({ category: 'rec.library', phone: '586-226-5000', place_id: 'city_clinton_township' });
  });

  it('says when a library did not answer this survey', () => {
    expect(got.rows.find((r) => r.record_ref === 'MI0397-005')!.note).toMatch(/did not answer this survey/);
  });

  it('leaves out a bookmobile and a branch the survey records as temporarily closed', () => {
    expect(got.dropped.get('bookmobile or books-by-mail (no door to walk to)')).toEqual(['BOOKMOBILE']);
    expect(got.dropped.get('closed or temporarily closed in the survey year')).toEqual(['CONELY BRANCH LIBRARY']);
  });
});

describe('HRSA health center sites', () => {
  const header = [
    'Health Center Type', 'BPHC Assigned Number', 'Site Name', 'Site Address', 'Site City', 'Site State Abbreviation', 'Site Postal Code',
    'Site Telephone Number', 'Site Web Address', 'Health Center Service Delivery Site Location Setting Description', 'Site Status Description',
    'Health Center Location Type Description', 'Health Center Type Description', 'Health Center Name',
    'Geocoding Artifact Address Primary X Coordinate', 'Geocoding Artifact Address Primary Y Coordinate', 'U.S. Congressional Representative Name', '',
  ];
  const row = (id: string, name: string, over: Partial<Record<string, string>> = {}) => {
    const r: Record<string, string> = {
      'Health Center Type': 'Federally Qualified Health Center (FQHC)', 'BPHC Assigned Number': id, 'Site Name': name,
      'Site Address': '12200 E 13 Mile Rd', 'Site City': 'Warren', 'Site State Abbreviation': 'MI', 'Site Postal Code': '48093-1234',
      'Site Telephone Number': '313-416-6262', 'Site Web Address': 'www.example.org',
      'Health Center Service Delivery Site Location Setting Description': 'All Other Clinic Types', 'Site Status Description': 'Active',
      'Health Center Location Type Description': 'Permanent', 'Health Center Type Description': 'Service Delivery Site',
      'Health Center Name': 'EXAMPLE HEALTH', 'Geocoding Artifact Address Primary X Coordinate': '1.5',
      'Geocoding Artifact Address Primary Y Coordinate': '0.5', 'U.S. Congressional Representative Name': 'A Member Of Congress', '': '', ...over,
    };
    return header.map((h) => r[h] ?? '');
  };
  const text = csv(header, [
    row('BPS-1', 'Example Clinic'),
    row('BPS-2', 'Example School Clinic', { 'Health Center Service Delivery Site Location Setting Description': 'School' }),
    row('BPS-3', 'Example Mobile Van', { 'Health Center Location Type Description': 'Mobile Van' }),
    row('BPS-4', 'Example Admin', { 'Health Center Type Description': 'Administrative' }),
    row('BPS-5', 'Example Jail Clinic', { 'Health Center Service Delivery Site Location Setting Description': 'Correctional Facility' }),
    // HRSA suppresses a DV site's street; this fixture gives it one anyway, to prove none of it is ever written.
    row('BPS-6', 'Safe Haven Shelter Clinic', { 'Health Center Service Delivery Site Location Setting Description': 'Domestic Violence', 'Site Address': '99 Hidden Lane' }),
  ]);
  const parsed: Parsed = hrsaRows(text, 'https://data.hrsa.gov/x.csv', '2026-09-24');
  const got = stage('clinic', parsed, PLACES, FETCHED);

  it('keeps a clinic and a school-based site, and says the school site may serve only students', () => {
    expect(got.rows.map((r) => r.record_ref)).toEqual(['BPS-1', 'BPS-2']);
    expect(got.rows[0]).toMatchObject({ category: 'health.clinic', zip: '48093', phone: '313-416-6262', place_id: 'city_warren' });
    expect(got.rows[0]!.note).toContain('website=www.example.org');
    expect(got.rows[1]!.note).toMatch(/may serve only students/);
  });

  it('leaves out a mobile van, an administrative site and a correctional site, by name', () => {
    expect(got.dropped.get('mobile van (no fixed place)')).toEqual(['Example Mobile Van']);
    expect(got.dropped.get('administrative site only')).toEqual(['Example Admin']);
    expect(got.dropped.get('correctional setting (not open to the public)')).toEqual(['Example Jail Clinic']);
  });

  it('never stages, names, places or keeps the address of a site in a domestic-violence setting', () => {
    const all = JSON.stringify({ parsed: parsed.cands, rows: got.rows, dropped: [...got.dropped] });
    expect(all).not.toContain('Safe Haven');
    expect(all).not.toContain('Hidden Lane');
    expect(got.dropped.get('domestic-violence setting (never staged; count only)')).toEqual(['']);
  });

  it("never reads a person's name from the file", () => {
    expect(JSON.stringify(got.rows)).not.toContain('Member Of Congress');
  });
});

describe('candidate ids belong to a record for good', () => {
  const two = (order: 'ab' | 'ba') => {
    const a = usgs('Warren Fire Station', 'ref-a', 1.5, 0.5), b = usgs('Warren Fire Station', 'ref-b', 1.6, 0.5);
    return usgsRows('fire', order === 'ab' ? [a, b] : [b, a], 'x');
  };

  it('do not depend on the order the dataset answers in', () => {
    const ids = (r: ReturnType<typeof stage>) => Object.fromEntries(r.rows.map((x) => [x.record_ref, x.candidate_id]));
    expect(ids(stage('fire', two('ab'), PLACES, FETCHED))).toEqual(ids(stage('fire', two('ba'), PLACES, FETCHED)));
  });

  it('keep the id a record had last time, and retire a vanished record\'s id instead of reusing it', () => {
    const prior = { ids: new Map([['ref-b', 'sal_usfire_warren_fire_station'], ['ref-gone', 'sal_usfire_old_station']]), retired: [] };
    const got = stage('fire', two('ab'), PLACES, FETCHED, prior);
    expect(got.rows.find((r) => r.record_ref === 'ref-b')!.candidate_id).toBe('sal_usfire_warren_fire_station');
    expect(got.rows.find((r) => r.record_ref === 'ref-a')!.candidate_id).not.toBe('sal_usfire_warren_fire_station');
    expect(got.retired).toEqual([{ sal_id: 'sal_usfire_old_station', record_ref: 'ref-gone', last_seen: FETCHED }]);
  });
});

describe('the committed staging files (data/staging/federal_*.csv)', () => {
  const places = regionPlaces();
  const ids = new Set(places.map((m) => m.id));
  const CATEGORY = { fire: 'safe.fire', police: 'safe.police', er: 'health.er', library: 'rec.library', clinic: 'health.clinic' } as const;

  for (const [layer, category] of Object.entries(CATEGORY)) {
    const rows = readCsv(p('data/staging', `federal_${layer}.csv`));
    it(`federal_${layer}: every candidate is in a place of the area and none is in a covered city`, () => {
      expect(rows.length).toBeGreaterThan(0);
      expect(Object.keys(rows[0]!)).toEqual(FEDERAL_COLUMNS);
      for (const r of rows) {
        expect(r.category).toBe(category);
        expect(ids.has(r.place_id!)).toBe(true);
        expect(COVERED.has(r.place_id!)).toBe(false);
        if (r.placed_by === 'coordinate') expect(placeAt(Number(r.lat), Number(r.lon), places)?.id).toBe(r.place_id);
        else expect(r.placed_by === 'city' && r.lat === '' && r.lon === '').toBe(true);
      }
      expect(new Set(rows.map((r) => r.candidate_id)).size).toBe(rows.length);
    });
  }
});
