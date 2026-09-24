// Read-only ingester for four FEDERAL public-domain datasets that name places across the wider service area
// (every city and township a DDOT or SMART bus reaches; data/ingested/region.json, Kyle 2026-09-24). Tier A,
// **staged**: every row it writes is a candidate in data/staging/federal_<layer>.csv, never a listing. A later
// research step checks each candidate against the place's own page, and only `pnpm import:lines` +
// `pnpm check:sources` can turn one into a listing, like every other row. Nothing here publishes anything.
//
// Sources (all works of the United States government, not subject to domestic copyright, 17 U.S.C. §105; each
// read with an honest user agent, one request per file or page, and nothing is ever written back):
//   - USGS The National Map, "Structures" (National Structures Dataset), carto.nationalmap.gov ArcGIS REST,
//     layers 16 "Fire Stations/EMS Stations" and 18 "Police Stations". The service calls itself "public domain
//     structures data". No phone. Each row's own LOADDATE is its last-edited date.
//     -> federal_fire.csv (safe.fire), federal_police.csv (safe.police)
//   - CMS, "Hospital General Information" (data.cms.gov provider data, dataset xubh-q36u): Michigan hospitals with
//     `Emergency Services = Yes`. The file has **no coordinate**, and a third-party geocode is not allowed, so a row
//     is placed by its mailing city and county matched to a place in region.json and says `placed_by=city`, with
//     lat and lon left empty. A mailing city is not a municipality (a "Rochester" address can be in Rochester
//     Hills): that is the research step's to settle, not ours to guess. -> federal_er.csv (health.er)
//   - IMLS, Public Libraries Survey, outlet file (FY 2024, the latest published): central libraries and branches
//     with the survey's own coordinate. Bookmobiles and books-by-mail outlets are left out (no door to walk to),
//     and so are outlets the survey records as closed or temporarily closed. -> federal_library.csv (rec.library)
//   - HRSA, "Health Center Service Delivery and Look-Alike Sites" (data.hrsa.gov download): active, permanent or
//     seasonal sites that deliver care. Left out: mobile vans (no fixed place), administrative-only sites, sites in
//     a correctional or carceral setting (not open to the public), and **every site HRSA files under a
//     domestic-violence setting — HRSA already suppresses their street address, and this repository carries no
//     address or point of any kind for a DV organization (CLAUDE.md)**. Only the count of those is logged.
//     HRSA regenerates the file every day, so its date is the file's, not a record's edit.
//     -> federal_clinic.csv (health.clinic)
//
// What is kept: a row whose point (or, for CMS, whose mailing city) is inside a place of the service area and NOT
// in Detroit, Hamtramck, Highland Park or Dearborn, which already have their own sources. Everything dropped is
// counted, and the rows dropped by a name rule are named, every run.
// Never read: any person's name (HRSA's file carries members of Congress, which are never mapped), any staff
// contact. A phone is only the number the dataset prints for the site itself.
// Ids: a candidate id is keyed to the publisher's own permanent reference (USGS permanent_identifier, CMS
// Facility ID, IMLS FSCSKEY-FSCS_SEQ, HRSA BPHC Assigned Number) through ingest-ids.ts, so it never moves to
// another record; a vanished record's id is retired in a committed tombstone file, never reused.
//
//   node: pnpm --filter @313help/pipeline ingest:federal [fire police er library clinic]
//   By hand, not in the nightly job.

import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { assertNoMovedIds, assignIds, RETIRED_COLUMNS, retiredPath, retiredRows, type IdRequest, type PriorIds, type Retired } from './ingest-ids.js';
import { sharpDrop } from './ingest-arcgis.js';
import { cityNames } from './ingest-treatment.js';
import { placeAt, regionPlaces, type Place } from './region.js';
import { SERVICE_BBOX } from '@313help/query';
import { formatPhone, p, parsePhone, readCsv, slug, today, writeCsv, type CsvRow } from './util.js';
import { unzip } from './xlsx.js';

const UA = { 'user-agent': '313help-pipeline (open-source civic directory; one polite pass)' };

export const USGS_STRUCTURES = 'https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer';
export const USGS_FIRE_LAYER = 16, USGS_POLICE_LAYER = 18;
export const CMS_DATASET = 'xubh-q36u';
export const CMS_METASTORE = `https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/${CMS_DATASET}`;
export const CMS_PAGE = `https://data.cms.gov/provider-data/dataset/${CMS_DATASET}`;
/** Change the year here when IMLS publishes the next survey (the FY 2024 file appeared in June 2026). */
export const IMLS_PLS_YEAR = 2024;
export const IMLS_PLS_ZIP = 'https://www.imls.gov/sites/default/files/2026-06/pls_fy2024_csv.zip';
export const HRSA_SITES = 'https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv';

/** Already covered by their own sources. A candidate here is never staged by this script. */
export const COVERED = new Set(['city_detroit', 'city_hamtramck', 'city_highland_park', 'city_dearborn']);

export const FEDERAL_COLUMNS = [
  'candidate_id', 'category', 'name', 'address_1', 'city', 'zip', 'lat', 'lon', 'phone', 'place_id', 'county',
  'source_dataset', 'source_url', 'source_last_edited', 'placed_by', 'record_ref', 'note', 'fetched_at',
];

export type LayerId = 'fire' | 'police' | 'er' | 'library' | 'clinic';
export const LAYERS: Record<LayerId, { category: string; prefix: string; dataset: string }> = {
  fire: { category: 'safe.fire', prefix: 'usfire', dataset: 'USGS National Structures Dataset: Fire Stations/EMS Stations' },
  police: { category: 'safe.police', prefix: 'uspolice', dataset: 'USGS National Structures Dataset: Police Stations' },
  er: { category: 'health.er', prefix: 'cmser', dataset: `CMS Hospital General Information (${CMS_DATASET})` },
  library: { category: 'rec.library', prefix: 'imls', dataset: `IMLS Public Libraries Survey FY ${IMLS_PLS_YEAR}, outlet file` },
  clinic: { category: 'health.clinic', prefix: 'hrsa', dataset: 'HRSA Health Center Service Delivery and Look-Alike Sites' },
};

/** One row as a dataset states it, before it is placed. lat/lon are null when the dataset has no coordinate. */
export interface Candidate {
  ref: string; name: string; address_1: string; city: string; zip: string;
  lat: number | null; lon: number | null; phone: string; note: string; last_edited: string; source_url: string;
  /** The county the dataset states, for a row placed by its mailing city. */
  county?: string;
  /**
   * Why a row that is otherwise in the area is left out (a bookmobile, an airport's station). Decided by the parser,
   * applied after placing, so the run names only the in-area rows a rule removed, not every such row in Michigan.
   */
  skip?: string;
}
/** What a parser read: the rows, and the rows it left out on purpose, by reason. */
export interface Parsed { cands: Candidate[]; dropped: Map<string, string[]> }

const clean = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const zip5 = (v: unknown) => /^(\d{5})/.exec(clean(v))?.[1] ?? '';
/** The dataset's own number, formatted, or empty. A number that isn't a dialable NANP number is left out, never repaired. */
const phoneOf = (v: unknown) => { const x = parsePhone(clean(v)); return x ? formatPhone(x.number) + (x.ext ? ` ext. ${x.ext}` : '') : ''; };
const drop = (m: Map<string, string[]>, reason: string, what: string) => m.set(reason, [...(m.get(reason) ?? []), what]);
const num = (v: unknown) => { const n = Number(clean(v)); return clean(v) !== '' && Number.isFinite(n) ? n : null; };
/** A CSV file as rows keyed by header. Some federal files end the header with a stray comma; that is not an error. */
const csvRows = (text: string): Record<string, string>[] =>
  parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) as Record<string, string>[];

// ------------------------------------------------------------------------------------------------ USGS stations

/**
 * Rows the USGS layer carries that are not a door a person can walk up to at 3am: an airport's airside station,
 * a military installation's, a training site, a sheriff's marine or mounted unit. Dropped by name, and named in
 * the run's output. The layer has one feature code per layer and no "administrative" type, so a name that says
 * "Headquarters" without a station number is kept and flagged in `note` for the research step instead.
 */
export const NOT_A_PUBLIC_STATION = /\b(airport|arsenal|army|air national guard|air force|selfridge|coast guard|training|academy|marine unit|mounted|detention|jail)\b/i;

export function usgsRows(kind: 'fire' | 'police', features: any[], layerUrl: string): Parsed {
  const cands: Candidate[] = [];
  const dropped = new Map<string, string[]>();
  for (const f of features) {
    const pr = f?.properties ?? {};
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    const name = clean(pr.name ?? pr.NAME);
    const ref = clean(pr.permanent_identifier ?? pr.PERMANENT_IDENTIFIER);
    if (!name || !ref) { drop(dropped, 'no name or no permanent identifier', name || '(unnamed)'); continue; }
    if (typeof lat !== 'number' || typeof lon !== 'number') { drop(dropped, 'no point', name); continue; }
    const load = Number(pr.loaddate ?? pr.LOADDATE);
    const hq = /headquarters/i.test(name) && !/station/i.test(name);
    cands.push({
      ref, name, address_1: clean(pr.address ?? pr.ADDRESS), city: clean(pr.city ?? pr.CITY), zip: zip5(pr.zipcode ?? pr.ZIPCODE),
      lat, lon, phone: '',
      note: [hq ? 'the name says headquarters and no station: may be offices only' : '', kind === 'police' && /sheriff|state police|university|college/i.test(name) ? 'not a city police department' : '']
        .filter(Boolean).join('; '),
      // LOADDATE is a calendar date stored as UTC midnight ("740 TNMC Update 8/2/2022" -> 1659398400000); read in
      // Detroit time it would land on the day before.
      last_edited: Number.isFinite(load) && load > 0 ? new Date(load).toISOString().slice(0, 10) : '',
      source_url: layerUrl,
      skip: NOT_A_PUBLIC_STATION.test(name) ? 'not a public station (by name)' : undefined,
    });
  }
  return { cands, dropped };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body: any = await res.json();
  if (body?.error) throw new Error(`${url}: ${body.error.message ?? 'error'} (${body.error.code ?? '?'})`);
  return body;
}

/** Every feature of one USGS layer inside the service area's box, page by page, in OBJECTID order. */
async function fetchUsgs(layer: number): Promise<any[]> {
  const url = `${USGS_STRUCTURES}/${layer}`;
  const meta = await getJson(`${url}?f=json`);
  const size = Math.min(1000, Number(meta.maxRecordCount) || 1000);
  const b = SERVICE_BBOX;
  const env = encodeURIComponent(JSON.stringify({ xmin: b.lonMin, ymin: b.latMin, xmax: b.lonMax, ymax: b.latMax, spatialReference: { wkid: 4326 } }));
  const out: any[] = [];
  for (let offset = 0; offset < 100_000;) {
    const page = await getJson(`${url}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326&outFields=*&orderByFields=OBJECTID&resultOffset=${offset}&resultRecordCount=${size}&f=geojson`);
    const got: any[] = page.features ?? [];
    out.push(...got);
    offset += got.length;
    if (!got.length || (got.length < size && !(page.exceededTransferLimit || page.properties?.exceededTransferLimit))) break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ CMS hospitals

export function cmsRows(text: string, sourceUrl: string, modified: string): Parsed {
  const cands: Candidate[] = [];
  const dropped = new Map<string, string[]>();
  for (const r of csvRows(text)) {
    if (clean(r['State']) !== 'MI') continue;
    const name = clean(r['Facility Name']);
    cands.push({
      ref: clean(r['Facility ID']), name, address_1: clean(r['Address']), city: clean(r['City/Town']), zip: zip5(r['ZIP Code']),
      lat: null, lon: null, phone: phoneOf(r['Telephone Number']),
      note: [`hospital_type=${clean(r['Hospital Type'])}`, 'placed by mailing city; no coordinate in the file'].join('; '),
      last_edited: modified, source_url: sourceUrl, county: clean(r['County/Parish']),
      skip: clean(r['Emergency Services']) !== 'Yes' ? 'no emergency department' : undefined,
    });
  }
  return { cands, dropped };
}

/** The place a mailing city names, when that place is also in the county the row states. */
export function placeByCity(city: string, county: string, places: Place[]): Place | null {
  const names = cityNames(places);
  const c = city.toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^w /, 'west ').replace(/^e /, 'east ').replace(/^mt\.? /, 'mount ').replace(/^st\.? /, 'st. ').replace(/ twp\.?$/, ' twp');
  const name = names.get(c);
  const place = name ? places.find((m) => m.name === name) ?? null : null;
  if (!place) return null;
  // "Clinton" is a township in Macomb and a village in Lenawee: the county the row states must agree.
  const cty = county.toLowerCase().replace(/ county$/, '').trim();
  return cty && !place.counties.some((k) => k.toLowerCase() === cty) ? null : place;
}

// ------------------------------------------------------------------------------------------------ IMLS libraries

const OUTLET: Record<string, string> = { CE: 'central library', BR: 'branch' };
export function imlsRows(text: string, zipUrl: string, lastEdited: string): Parsed {
  const cands: Candidate[] = [];
  const dropped = new Map<string, string[]>();
  for (const r of csvRows(text)) {
    if (clean(r['STABR']) !== 'MI') continue;
    const name = clean(r['LIBNAME']);
    const type = clean(r['C_OUT_TY']);
    // Structure change codes from the survey's own documentation: 03 closed, 23 temporarily closed this year.
    const stat = clean(r['STATSTRU']);
    const lat = num(r['LATITUDE']), lon = num(r['LONGITUD']);
    if (lat == null || lon == null) { drop(dropped, 'no point', name); continue; }
    cands.push({
      // FSCSKEY + FSCS_SEQ, not LIBID: LIBID repeats in the FY 2024 file (two Clinton-Macomb branches share one).
      ref: `${clean(r['FSCSKEY'])}-${clean(r['FSCS_SEQ'])}`, name,
      address_1: clean(r['ADDRESS']), city: clean(r['CITY']), zip: zip5(r['ZIP']), lat, lon, phone: phoneOf(r['PHONE']),
      note: [`outlet=${OUTLET[type]}`, `system=${clean(r['FSCSKEY'])}`, stat === '25' ? 'the library did not answer this survey; facts carried from an earlier year' : '', `geocode=${clean(r['GEOMTYPE']).toLowerCase()}`]
        .filter(Boolean).join('; '),
      last_edited: lastEdited, source_url: zipUrl,
      skip: !OUTLET[type] ? 'bookmobile or books-by-mail (no door to walk to)'
        : stat === '03' || stat === '23' ? 'closed or temporarily closed in the survey year' : undefined,
    });
  }
  return { cands, dropped };
}

// ------------------------------------------------------------------------------------------------ HRSA sites

/** Settings whose sites are not open to the public, or must carry no location at all. */
const CLOSED_SETTING = /correctional|carceral/i;
const DV_SETTING = /domestic violence/i;

export function hrsaRows(text: string, fileUrl: string, lastEdited: string): Parsed {
  const cands: Candidate[] = [];
  const dropped = new Map<string, string[]>();
  for (const r of csvRows(text)) {
    if (clean(r['Site State Abbreviation']) !== 'MI') continue;
    const name = clean(r['Site Name']);
    const setting = clean(r['Health Center Service Delivery Site Location Setting Description']);
    // Never named, never placed, never written: only counted (CLAUDE.md, no DV address anywhere).
    if (DV_SETTING.test(setting)) { drop(dropped, 'domestic-violence setting (never staged; count only)', ''); continue; }
    const lat = num(r['Geocoding Artifact Address Primary Y Coordinate']), lon = num(r['Geocoding Artifact Address Primary X Coordinate']);
    const address = clean(r['Site Address']);
    if (lat == null || lon == null || !address) { drop(dropped, 'no street address or no point', name); continue; }
    const web = clean(r['Site Web Address']);
    cands.push({
      ref: clean(r['BPHC Assigned Number']), name, address_1: address, city: clean(r['Site City']), zip: zip5(r['Site Postal Code']),
      lat, lon, phone: phoneOf(r['Site Telephone Number']),
      note: [
        `health_center=${clean(r['Health Center Name'])}`,
        `type=${clean(r['Health Center Type'])}`,
        `setting=${setting}`,
        /school/i.test(setting) ? 'a school-based site may serve only students' : '',
        clean(r['Health Center Location Type Description']) === 'Seasonal' ? 'seasonal site' : '',
        web ? `website=${web}` : '',
      ].filter(Boolean).join('; '),
      last_edited: lastEdited, source_url: fileUrl,
      skip: clean(r['Site Status Description']) !== 'Active' ? 'not active'
        : clean(r['Health Center Location Type Description']) === 'Mobile Van' ? 'mobile van (no fixed place)'
        : clean(r['Health Center Type Description']) === 'Administrative' ? 'administrative site only'
        : CLOSED_SETTING.test(setting) ? 'correctional setting (not open to the public)' : undefined,
    });
  }
  return { cands, dropped };
}

// ------------------------------------------------------------------------------------------------ placing & ids

export interface Staged { rows: CsvRow[]; warnings: string[]; retired: Retired[]; dropped: Map<string, string[]> }

/** A candidate id for each record, from the publisher's reference; the prior file's ids are kept for good. */
export function readPriorFederal(layer: LayerId, dir = 'data/staging'): PriorIds {
  const ids = new Map<string, string>();
  const retired: Retired[] = [];
  for (const r of readCsv(p(dir, `federal_${layer}.csv`))) if (r.record_ref && r.candidate_id && !ids.has(r.record_ref)) ids.set(r.record_ref, r.candidate_id);
  for (const r of readCsv(retiredPath(dir, `federal_${layer}`))) if (r.sal_id && r.record_ref) retired.push({ sal_id: r.sal_id, record_ref: r.record_ref, last_seen: r.last_seen ?? '' });
  return { ids, retired };
}

/**
 * Place every candidate, keep those in a place of the service area other than the four covered cities, and give
 * each one an id that belongs to its record for good.
 */
export function stage(layer: LayerId, parsed: Parsed, places: Place[], fetchedAt: string, prior: PriorIds = { ids: new Map(), retired: [] }): Staged {
  const { category, prefix, dataset } = LAYERS[layer];
  const dropped = new Map(parsed.dropped);
  const warnings: string[] = [];
  const byRef = new Map<string, CsvRow>();
  for (const c of parsed.cands) {
    let place: Place | null;
    let placedBy: string;
    if (c.lat != null && c.lon != null) {
      place = placeAt(c.lat, c.lon, places);
      placedBy = 'coordinate';
    } else {
      place = placeByCity(c.city, c.county ?? '', places);
      placedBy = 'city';
    }
    if (!place) { drop(dropped, placedBy === 'city' ? 'mailing city is not a place in the service area' : 'outside the service area', c.name); continue; }
    if (COVERED.has(place.id)) { drop(dropped, `in ${place.name} (already covered)`, c.name); continue; }
    if (c.skip) { drop(dropped, c.skip, c.name); continue; }
    if (!c.ref) { warnings.push(`"${c.name}" has no reference in the dataset; skipped`); continue; }
    if (byRef.has(c.ref)) { warnings.push(`two records share the reference "${c.ref}"; keeping "${byRef.get(c.ref)!.name}"`); continue; }
    byRef.set(c.ref, {
      candidate_id: '', category, name: c.name, address_1: c.address_1, city: c.city, zip: c.zip,
      lat: c.lat != null ? c.lat.toFixed(6) : '', lon: c.lon != null ? c.lon.toFixed(6) : '', phone: c.phone,
      place_id: place.id, county: place.counties.join('/'), source_dataset: dataset, source_url: c.source_url,
      source_last_edited: c.last_edited, placed_by: placedBy, record_ref: c.ref, note: c.note, fetched_at: fetchedAt,
    });
  }
  const rows = [...byRef.values()];
  const requests: IdRequest[] = rows.map((r) => ({ key: r.record_ref!, base: slug(r.name!), alt: slug(r.address_1! || r.city!).slice(0, 20) }));
  const assigned = assignIds(`sal_${prefix}_`, requests, prior, fetchedAt);
  for (const r of rows) r.candidate_id = assigned.ids.get(r.record_ref!)!;
  // Same rule as the other layers: two records at one name are a warning for a person, not an error.
  warnings.push(...assigned.warnings.filter((w) => !w.startsWith('two records at one address')));
  // assertNoMovedIds reads `sal_id`; hand it the candidate ids under that name.
  assertNoMovedIds(`federal_${layer}`, prior, rows.map((r) => ({ sal_id: r.candidate_id!, record_ref: r.record_ref! })));
  rows.sort((a, b) => a.candidate_id!.localeCompare(b.candidate_id!));
  return { rows, warnings, retired: assigned.retired, dropped };
}

// ------------------------------------------------------------------------------------------------ run

async function fetchText(url: string, latin1 = false): Promise<{ text: string; lastModified: string }> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const lm = res.headers.get('last-modified');
  return { text: buf.toString(latin1 ? 'latin1' : 'utf8'), lastModified: lm ? today(new Date(lm)) : '' };
}

const READERS: Record<LayerId, () => Promise<Parsed>> = {
  fire: async () => usgsRows('fire', await fetchUsgs(USGS_FIRE_LAYER), `${USGS_STRUCTURES}/${USGS_FIRE_LAYER}`),
  police: async () => usgsRows('police', await fetchUsgs(USGS_POLICE_LAYER), `${USGS_STRUCTURES}/${USGS_POLICE_LAYER}`),
  er: async () => {
    const meta = await getJson(CMS_METASTORE);
    const url: string | undefined = meta?.distribution?.find((d: any) => d.mediaType === 'text/csv')?.downloadURL;
    if (!url) throw new Error(`${CMS_METASTORE}: no CSV distribution`);
    // The download URL carries a hash that changes with every CMS refresh; the rows cite the dataset's stable page.
    return cmsRows((await fetchText(url)).text, CMS_PAGE, clean(meta.modified));
  },
  library: async () => {
    const res = await fetch(IMLS_PLS_ZIP, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} ${IMLS_PLS_ZIP}`);
    const lm = res.headers.get('last-modified');
    const files = unzip(Buffer.from(await res.arrayBuffer()));
    const entry = [...files.keys()].find((k) => /outlet[^/]*\.csv$/i.test(k));
    if (!entry) throw new Error(`${IMLS_PLS_ZIP}: no outlet CSV inside (${[...files.keys()].join(', ')})`);
    // The survey's files are Latin-1, not UTF-8.
    return imlsRows(files.get(entry)!.toString('latin1'), IMLS_PLS_ZIP, lm ? today(new Date(lm)) : '');
  },
  clinic: async () => { const { text, lastModified } = await fetchText(HRSA_SITES); return hrsaRows(text, HRSA_SITES, lastModified); },
};

async function main() {
  const fetchedAt = today();
  const places = regionPlaces();
  const only = process.argv.slice(2) as LayerId[];
  const layers = (Object.keys(LAYERS) as LayerId[]).filter((l) => !only.length || only.includes(l));
  for (const layer of layers) {
    let parsed: Parsed;
    try { parsed = await READERS[layer](); } catch (e) {
      // A dataset that is gone or refuses us is recorded and skipped; the last good file stays as it is.
      console.warn(`federal_${layer}: not read (${(e as Error).message}); the last committed file, if any, is unchanged`);
      process.exitCode = 1;
      continue;
    }
    const prior = readPriorFederal(layer);
    const { rows, warnings, retired, dropped } = stage(layer, parsed, places, fetchedAt, prior);
    const out = p('data/staging', `federal_${layer}.csv`);
    const before = existsSync(out) ? readCsv(out).length : 0;
    if (sharpDrop(before, rows.length)) {
      console.warn(`federal_${layer}: ${rows.length} rows, down from ${before}. Not overwriting ${out}; a person should look at the dataset first.`);
      process.exitCode = 1;
      continue;
    }
    writeCsv(out, rows, FEDERAL_COLUMNS);
    if (retired.length) writeCsv(retiredPath('data/staging', `federal_${layer}`), retiredRows(retired), RETIRED_COLUMNS);
    const byCounty = new Map<string, number>();
    for (const r of rows) byCounty.set(r.county!, (byCounty.get(r.county!) ?? 0) + 1);
    console.log(`federal_${layer}: ${rows.length} candidates -> ${out} (${[...byCounty].map(([k, n]) => `${k} ${n}`).join(', ')})`);
    for (const [reason, names] of dropped) {
      const named = !/outside the service area|not a place in the service area|already covered|domestic-violence/.test(reason) && names.every(Boolean);
      console.log(`  left out, ${reason}: ${names.length}${named ? ` (${names.join('; ')})` : ''}`);
    }
    for (const w of warnings) console.warn(`  warn: federal_${layer}: ${w}`);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-federal.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
