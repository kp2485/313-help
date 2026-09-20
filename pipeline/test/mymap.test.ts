// Wayne County's Well Wayne Stations map: reading its KML, and the rows it becomes.
// Also the promise that generalising fromIngested changed nothing for the 60 Detroit Health Department boxes.

import { describe, expect, it } from 'vitest';
import { badge, openNow, type BundleRow } from '@313help/query';
import { loadSources, type Source } from '../src/ingest-arcgis.js';
import { hoursText, mapUpdated, MYMAP_COLUMNS, NOT_24H, parseDetails, parseKml, toRows } from '../src/ingest-mymap.js';
import { fromIngested, toHsds } from '../src/normalize.js';
import { validateRows } from '../src/validate.js';
import { formatPhone, inBbox, p, parsePhone, readCsv, type CsvRow } from '../src/util.js';

const src = (id: string): Source => loadSources().find((s) => s.id === id)!;
const WWS = 'wayne_well_wayne_stations';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>Well Wayne Stations Location Map </name>
  <description><![CDATA[Red are 24/7 locations<br>Purple are not 24/7, usually Monday-Friday during normal business hours<br><br>Map updated: September 14, 2026]]></description>
  <Style id="icon-1899-FF5252-normal"><IconStyle><color>ff5252ff</color></IconStyle></Style>
  <Folder><name>Well Wayne Stations (Locations)</name>
    <Placemark><name><![CDATA[[Allen Park] Big Ben's Comix Oasis]]></name>
      <description><![CDATA[Station Type: Newsstand<br>24/7 Access: Yes<br>Location: Outdoors, on the right corner<br>Supplies:<br>Naloxone (Narcan®)<br>Fentanyl Testing Strips<br>*Supplies are subject to change based on availability and may not always be available]]></description>
      <Point><coordinates>-83.2101111,42.2574226,0</coordinates></Point></Placemark>
    <Placemark><name>[Dearborn Heights] Somewhere Else</name>
      <description><![CDATA[Station Type: Newsstand<br>24/7 Access: Yes<br>Location: Outdoors<br>Supplies:<br>Naloxone (Narcan®)]]></description>
      <Point><coordinates>-83.2733,42.3367,0</coordinates></Point></Placemark>
    <Placemark><name>[Hamtramck] Hamtramck City Hall</name>
      <description><![CDATA[Website: https://hamtramckcity.gov/<br>Station Type: Vending machine<br>24/7 Access: No<br>\tLocation: Indoors, in the main lobby<br>Supplies:<br>Naloxone (Narcan®)<br>Fentanyl Testing Strips<br>Xylazine Testing Strips<br>*Supplies are subject to change based on availability and may not always be available]]></description>
      <Point><coordinates>-83.0524565,42.3993937,0</coordinates></Point></Placemark>
    <Placemark><name>[Detroit] Wayne County Criminal Justice Complex </name>
      <description><![CDATA[Website: https://www.waynecounty.com/cjc/home.aspx <br>Station Types: Vending Machines; Newsstands <br>\tLocation 1: Indoors, past main entrance under the stairs; near employee entrance<br>    24/7 Access: No<br>Location 2: Outdoors, near the East (staff) parking lot<br>   24/7 Access: Yes <br>Supplies:<br>Naloxone (Narcan®)<br>*Supplies are subject to change based on availability and may not always be available]]></description>
      <Point><coordinates>-83.0528025,42.3644661,0</coordinates></Point></Placemark>
  </Folder>
</Document></kml>`;

describe('reading a Google My Map (pipeline/src/ingest-mymap.ts)', () => {
  const { lastEdited, placemarks } = parseKml(KML);

  it("takes the map's own 'Map updated' line as the layer's last-edited date", () => {
    expect(lastEdited).toBe('2026-09-14');
    expect(mapUpdated('nothing here')).toBeNull();          // never invent a date
    expect(mapUpdated('Map updated: Smarch 3, 2026')).toBeNull();
  });

  it('splits the "[City] Site name" convention and keeps the point the County publishes', () => {
    expect(placemarks).toHaveLength(4);
    expect(placemarks[0]).toMatchObject({ city: 'Allen Park', name: "Big Ben's Comix Oasis", lat: 42.2574226, lon: -83.2101111 });
    expect(placemarks[3]!.name).toBe('Wayne County Criminal Justice Complex');   // trailing nbsp trimmed
  });

  it('reads the key: value lines, several devices at one site, and the supplies list', () => {
    const d = parseDetails(placemarks[2]!.description);
    expect(d).toEqual({
      website: 'https://hamtramckcity.gov/', station_type: ['Vending machine'], access: ['No'],
      box_locations: ['Indoors, in the main lobby'],
      supplies: ['Naloxone (Narcan®)', 'Fentanyl Testing Strips', 'Xylazine Testing Strips'],
    });
    const cjc = parseDetails(placemarks[3]!.description);
    expect(cjc.station_type).toEqual(['Vending Machines', 'Newsstands']);
    expect(cjc.access).toEqual(['No', 'Yes']);
    expect(cjc.box_locations).toHaveLength(2);
  });

  it('states hours only when the map states them: all-24/7, none, or nothing at all', () => {
    expect(hoursText(['Yes'])).toBe('24 hrs');
    expect(hoursText(['Yes', 'Yes'])).toBe('24 hrs');
    expect(hoursText(['No'])).toBe(NOT_24H);
    expect(hoursText(['No', 'Yes'])).toBe('');     // mixed: unknown, never "open"
    expect(hoursText([])).toBe('');
  });

  it('keeps the service area by the city the map states, not by the bounding box alone', () => {
    const { rows, warnings } = toRows(src(WWS), lastEdited, placemarks, '2026-09-20');
    // Allen Park sits inside the bbox and is still not in the service area; Dearborn Heights is not Dearborn.
    expect(inBbox(42.2574226, -83.2101111)).toBe(true);
    expect(rows.map((r) => r.sal_id)).toEqual(['sal_wws_detroit_wayne_county_criminal_justice_complex', 'sal_wws_hamtramck_hamtramck_city_hall']);
    expect(warnings).toEqual([]);
    const cjc = rows[0]!;
    expect(cjc.address_1).toBe('');
    expect(cjc.city).toBe('Detroit');
    expect(cjc.hours_text).toBe('');                       // mixed access says nothing
    expect(cjc.extra).toContain('Box_Location1=Indoors, past main entrance under the stairs, near employee entrance');
    expect(cjc.extra).not.toMatch(/;\s*near employee/);    // a value's own semicolons become commas
    expect(cjc.record_ref).toBe('');                       // the KML has no per-placemark id
  });

  it('a point outside the bounding box is dropped with a warning, whatever city it claims', () => {
    const { rows, warnings } = toRows(src(WWS), lastEdited, [{ city: 'Detroit', name: 'Nowhere', description: '', lat: 41.9, lon: -87.6 }], '2026-09-20');
    expect(rows).toEqual([]);
    expect(warnings[0]).toContain('outside the service area');
  });

  it('writes the ArcGIS columns plus city', () => {
    expect(MYMAP_COLUMNS).toEqual(['sal_id', 'record_ref', 'name', 'address_1', 'city', 'zip', 'lat', 'lon', 'phone', 'website', 'hours_text', 'extra', 'source_id', 'source_last_edited', 'fetched_at']);
  });
});

// The rows fromIngested made for the Health Department boxes before it learned about cities, missing addresses
// and other wording. Any change to that output is a change to 60 live listings, so it is spelled out here.
function legacyDhdRow(src: Source, r: CsvRow): BundleRow {
  const DEVICE: Record<string, string> = { 'Vending Machine': 'vending machine', Newsstand: 'newsstand box', Countertop: 'countertop box', 'Wall Mount': 'wall box' };
  const extra = Object.fromEntries((r.extra ?? '').split('; ').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
  const device = DEVICE[extra.Distribution_Device_Type ?? ''] ?? 'box';
  const where = extra.Box_Location ? ` The box is ${extra.Box_Location.toLowerCase()}.` : '';
  const ph = parsePhone(r.phone ?? '');
  const always = /^(open\s*)?24\s*(hrs?|hours)\.?$/i.test((r.hours_text ?? '').trim());
  return {
    id: r.sal_id!, name: r.name!, org: src.org!.name, category: src.category!,
    what: `Free Narcan from a ${device}. No ID, no cost, no questions.${where}`,
    address: { line1: r.address_1!, city: 'Detroit', ...(r.zip ? { zip: r.zip } : {}) },
    lat: Number(r.lat), lon: Number(r.lon),
    phones: ph ? [{ number: formatPhone(ph.number), label: 'Host site' }] : [],
    ...(r.website ? { website: r.website } : {}),
    availability: always ? 'always' : 'unknown',
    ...(!always && r.hours_text ? { hours_text: r.hours_text } : {}),
    schedules: [], flags: ['walk_in', 'no_id_required'], status: 'active',
    facts: {
      checked_at_entry: null, entry_method: null, last_confirmed_at: null, last_confirm_method: null,
      reports: { closed_open: 0, closed_last_at: null, wrong_open: 0 },
      source: { type: 'open_data', name: src.name, url: src.page ?? src.url, last_edited: r.source_last_edited || null },
    },
  };
}

describe('fromIngested still makes exactly the same 60 Health Department rows', () => {
  const dhd = src('dhd_harm_reduction');
  const csv = readCsv(p('data/ingested/dhd_harm_reduction.csv'));

  it('row for row, key for key', () => {
    expect(csv.length).toBeGreaterThan(50);
    const { rows, svcOf } = fromIngested(dhd, csv);
    expect(rows).toEqual(csv.map((r) => legacyDhdRow(dhd, r)));
    expect([...svcOf.values()][0]!.service_name).toBe('Free Narcan and harm reduction supplies');
    for (const r of rows) expect(r.address!.city).toBe('Detroit');
  });
});

describe('the Wayne County stations as listings', () => {
  const wws = src(WWS);
  const csv = readCsv(p('data/ingested/wayne_well_wayne_stations.csv'));
  const { rows, orgs, svcOf } = fromIngested(wws, csv);

  it('is the 26 stations in the service area, in four cities, with no street address', () => {
    expect(rows).toHaveLength(26);
    const byCity: Record<string, number> = {};
    for (const r of csv) byCity[r.city!] = (byCity[r.city!] ?? 0) + 1;
    expect(byCity).toEqual({ Detroit: 13, Dearborn: 6, Hamtramck: 5, 'Highland Park': 2 });
    for (const r of rows) {
      expect(r.address).toBeUndefined();          // the County publishes none, and we never make one up
      expect(inBbox(r.lat!, r.lon!)).toBe(true);
      expect(r.category).toBe('harm.supplies');
      expect(r.phones).toEqual([]);
    }
    expect(validateRows(rows, '2026-09-20').errors).toEqual([]);
  });

  it('says what the County says it stocks: naloxone and fentanyl and xylazine test strips', () => {
    const hall = rows.find((r) => r.id === 'sal_wws_hamtramck_hamtramck_city_hall')!;
    expect(hall.what).toBe('Free naloxone (Narcan), fentanyl test strips and xylazine test strips from a vending machine. No cost, no ID, no questions. The station is indoors, in the main lobby. What is in stock can change, so supplies may not always be there.');
    expect([...svcOf.values()][0]!.service_name).toBe('Free naloxone and test strips');
    for (const r of rows) {
      expect(r.what).toContain('fentanyl test strips');
      expect(r.what).toContain('xylazine test strips');
      expect(r.what).not.toContain('undefined');
    }
    // Four devices at one site, each with its own spot.
    expect(rows.find((r) => r.id === 'sal_wws_detroit_wayne_county_criminal_justice_complex')!.what).toContain('There are 4 stations here:');
  });

  it('is attributed to Wayne County the same way the Health Department layer is', () => {
    expect([...orgs.entries()]).toEqual([['org_wayne_hhvs', 'Wayne County Department of Health, Human and Veterans Services']]);
    for (const r of rows) {
      expect(r.org).toBe('Wayne County Department of Health, Human and Veterans Services');
      expect(r.facts.source).toEqual({ type: 'open_data', name: 'Wayne County Well Wayne Stations location map', url: 'https://endoverdosewayne.org/', last_edited: '2026-09-14' });
    }
  });

  it("states a fact and never 'verified': nobody checked these, and the freshness fact is the map's own date", () => {
    for (const r of rows) {
      expect(r.facts.checked_at_entry).toBeNull();
      expect(r.facts.entry_method).toBeNull();
      expect(r.facts.last_confirmed_at).toBeNull();
      expect(badge(r, new Date('2026-09-20T17:45:00Z'))).toMatchObject({ level: 'source_listed', params: { source_date: '2026-09-14' } });
      // No timers: months later the badge states the same fact.
      expect(badge(r, new Date('2027-03-01T17:45:00Z'))).toMatchObject({ level: 'source_listed', params: { source_date: '2026-09-14' } });
    }
  });

  it('only an unambiguous 24 hours becomes open-now; mixed access is unknown, never open', () => {
    for (const r of rows) {
      if (r.availability === 'always') expect(r.hours_text).toBeUndefined();
      else { expect(r.availability).toBe('unknown'); expect(openNow(r, new Date()).state).toBe('unknown'); }
    }
    expect(rows.filter((r) => r.availability === 'always')).toHaveLength(14);   // the map's red pins
    expect(rows.find((r) => r.id === 'sal_wws_detroit_wayne_county_criminal_justice_complex')!.hours_text).toBeUndefined();
  });

  it('exports as an HSDS location that is physical and carries a point but no address', () => {
    const svc = toHsds([fromIngested(wws, csv)])[0]!;
    expect(svc.name).toBe('Free naloxone and test strips');
    const loc = svc.service_at_locations[0].location;
    expect(loc.location_type).toBe('physical');
    expect(loc.addresses).toBeUndefined();
    expect(typeof loc.latitude).toBe('number');
  });
});
