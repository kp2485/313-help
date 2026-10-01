// An ArcGIS layer whose addresses are checked against the Census Bureau before any row is published
// (kind: arcgis_checked in data/sources.yaml). Written 2026-10-01 for Oakland County's Narcan Locations map.
//
// WHY A CHECK. The County's records carry a typed street, city and ZIP, and a map point placed separately. Each
// can be wrong on its own: one record files 27725 Greenfield Rd (ZIP 48076, Southfield) under "Pontiac", another
// spells "Hazel Pak", and the West Bloomfield library's point sits 5.5 km away in Bloomfield Township. So the
// County's street and ZIP are sent to the Census Bureau's geocoder (the one `pnpm geocode` already uses) and:
//   - the County's city stays when it is the Census Bureau's postal city for that street and ZIP, or the city or
//     township the Census Bureau's match lies in ("Rochester Hills" stays although the postal city is Rochester).
//     Otherwise the city printed is the Census Bureau's postal city ("Pontiac" becomes Southfield). Both come from
//     forward geocoding the publisher's own street and ZIP; the County's map point never names a city or an
//     address (CLAUDE.md). The point decides only whether a record is inside the 75 places, as for Wayne's map;
//   - the same for the ZIP: the County's, unless the Census Bureau's match of that street and city has another
//     ("48327" typed for Oak Park's 48237);
//   - the street, phone and map point printed are the County's own, unchanged;
//   - a record the Census Bureau cannot match, or whose point is more than MAX_GAP_M from its matched address, is
//     held in data/staging/<id>.csv with the reason, for a person. Nothing is guessed to fill the gap.
// Each row says what the Census Bureau corrected and what the layer had written (`census_fixed`, empty when
// nothing was), so the sourcing travels with the data.
//
// Only the fields the source maps are asked for: a contact-name field on the layer is never fetched at all.

import { assertNoMovedIds, assignIds, NO_PRIOR, oneRowPerRecord, recordKey, type IdRequest, type PriorIds, type Retired } from './ingest-ids.js';
import { INGESTED_COLUMNS, type Source } from './ingest-arcgis.js';
import { placeAt, regionPlaces } from './region.js';
import { inBbox, slug, type CsvRow } from './util.js';

/** The ArcGIS columns, plus the city and organization each record states, and where the printed city came from. */
export const CHECKED_COLUMNS = [...INGESTED_COLUMNS.slice(0, 4), 'city', 'org_name', 'census_fixed', ...INGESTED_COLUMNS.slice(4)];
/** A held record keeps every column, plus why a person has to look at it. */
export const HELD_COLUMNS = [...CHECKED_COLUMNS, 'why'];

/** A record's point this far from its own matched address is held: a campus is under a kilometre; 5.5 km is a misplaced pin. */
export const MAX_GAP_M = 1000;

/** What the Census Bureau's geocoder answered for a street and ZIP (null: no match). */
export interface Match { lat: number; lon: number; city: string; zip: string; matched: string }

/** The fields this kind of source asks the server for: the mapped ones and the `extra` ones, nothing else. */
export function outFields(src: Source): string[] {
  const f = src.fields ?? {};
  const mapped = Object.entries(f).flatMap(([, v]) => v.split('+'));
  return [...new Set([...mapped, ...(src.extra ?? [])])].filter(Boolean);
}

const tidy = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
/** The Census Bureau's postal spelling, as a person writes it: "WOLVERINE LK" -> "Wolverine Lake", "W BLOOMFIELD" -> "West Bloomfield". */
export const titleCity = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  .replace(/^W /, 'West ').replace(/^E /, 'East ').replace(/^N /, 'North ').replace(/^S /, 'South ')
  .replace(/\bLk\b/g, 'Lake').replace(/\bHts\b/g, 'Heights').replace(/\bTwp\b/g, 'Township').replace(/\bVlg\b/g, 'Village');
const norm = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\bcharter\s+/g, '').replace(/\btwp\b/g, 'township').replace(/\s+/g, ' ').trim();
const bare = (s: string) => norm(s).replace(/\s+township$/, '');
/**
 * Two spellings of one place, compared loosely: case, dots, "Charter" and "Twp" do not count, and "West
 * Bloomfield" is West Bloomfield Township. A missing "Township" counts only when no city has the bare name:
 * Royal Oak and Royal Oak Township are two places.
 */
export function sameCity(a: string, b: string, cities: ReadonlySet<string> = CITY_NAMES()): boolean {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  return bare(a) === bare(b) && !cities.has(bare(a));
}
/** The region's places that are cities, by bare name ("royal oak", not "royal oak township"). */
let cityNames: Set<string> | null = null;
const CITY_NAMES = () => (cityNames ??= new Set(regionPlaces().filter((x) => !/township$/i.test(x.name)).map((x) => norm(x.name))));
export const metres = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  6371000 * Math.hypot(((lon2 - lon1) * Math.PI / 180) * Math.cos((lat1 * Math.PI) / 180), ((lat2 - lat1) * Math.PI) / 180);

/** The street the geocoder is asked for: a unit, suite or building on the end matches the building, not the unit. */
export const streetOnly = (line: string) => line.replace(/,?\s*(suite|ste\.?|unit|bldg\.?|building|#)\s*#?[\w-]+$/i, '').replace(/\s+\d+[A-Z]$/, '').trim();

export interface Checked { rows: CsvRow[]; held: CsvRow[]; warnings: string[]; retired: Retired[]; outside: number; same: number }

/**
 * The rows a checked layer becomes. Pure: the geocoder's answers come in as `matches` (keyed by the record's ref),
 * and `inArea` is the region test, so a test can drive every branch without the network.
 */
export function toCheckedRows(
  src: Source, lastEdited: string | null, features: any[], matches: Map<string, Match | null>, fetchedAt: string,
  prior: PriorIds = NO_PRIOR, placeOf: (lat: number, lon: number) => string | null = (lat, lon) => placeAt(lat, lon)?.name ?? null,
): Checked {
  const f = src.fields ?? {};
  const same = new Set(Object.keys(src.same_as ?? {}));
  const warnings: string[] = [];
  const all: { row: CsvRow; why: string }[] = [];
  let outside = 0, skipped = 0;
  const get = (props: any, key?: string) => (key ? tidy(props[key]) : '');

  for (const feat of features) {
    const props = feat.properties ?? {};
    const [lon, lat] = feat.geometry?.coordinates ?? [];
    const name = get(props, f.name), address = get(props, f.address);
    if (!name || !address) { warnings.push(`${src.id}: skipped a record with no name or address`); continue; }
    // The layer covers the whole county; the record's own point decides whether it is in the 75 places.
    if (typeof lat !== 'number' || !inBbox(lat, lon) || placeOf(lat, lon) === null) { outside++; continue; }
    const ref = (f.ref ?? '').split('+').map((k) => get(props, k)).filter(Boolean).join('|');
    // A place a person has already listed from its owner's own page stays that row (sources.yaml `same_as`).
    if (same.has(ref)) { skipped++; continue; }

    const given = get(props, f.city), zip = get(props, f.zip);
    const m = matches.get(ref) ?? null;
    const extra = (src.extra ?? []).map((k) => `${k}=${get(props, k)}`).filter((s) => !s.endsWith('=')).join('; ');
    const row: CsvRow = {
      sal_id: '', record_ref: ref, name, address_1: address, city: given, org_name: get(props, f.org), census_fixed: '',
      zip, lat: lat.toFixed(6), lon: lon.toFixed(6), phone: get(props, f.phone), website: get(props, f.website),
      hours_text: get(props, f.hours), extra, source_id: src.id, source_last_edited: lastEdited ?? '', fetched_at: fetchedAt,
    };
    let why = '';
    if (!m) why = `the Census Bureau found no match for "${streetOnly(address)}, MI ${zip}"`;
    else {
      const gap = metres(lat, lon, m.lat, m.lon);
      if (gap > MAX_GAP_M) why = `its map point is ${(gap / 1000).toFixed(1)} km from its own street address (${m.matched})`;
      else {
        const fixes: string[] = [];
        if (!sameCity(m.city, given) && !sameCity(placeOf(m.lat, m.lon) ?? '', given)) { row.city = titleCity(m.city); fixes.push(`city (the layer says "${given}")`); }
        if (m.zip && m.zip !== zip) { row.zip = m.zip; fixes.push(`ZIP (the layer says "${zip}")`); }
        if (fixes.length) row.census_fixed = `${fixes.join(' and ')} from the US Census Bureau's match of this street`;
      }
    }
    all.push({ row, why });
  }

  // Ids come from the layer's own record references, never from the order it answered in (ingest-ids.ts).
  const one = oneRowPerRecord(all.map((x) => x.row));
  warnings.push(...one.warnings.map((w) => `${src.id}: ${w}`));
  const whyOf = new Map(all.map((x) => [recordKey(x.row), x.why]));
  const requests: IdRequest[] = one.rows.map((r) => ({ key: recordKey(r), base: slug(`${r.address_1} ${r.city}`), alt: slug(r.name!).slice(0, 20) }));
  const assigned = assignIds(`sal_${src.id_prefix ?? src.id}_`, requests, prior, fetchedAt);
  for (const r of one.rows) r.sal_id = assigned.ids.get(recordKey(r))!;
  warnings.push(...assigned.warnings.map((w) => `${src.id}: ${w}`));
  assertNoMovedIds(src.id, prior, one.rows);

  const byId = (a: CsvRow, b: CsvRow) => a.sal_id!.localeCompare(b.sal_id!);
  const rows = one.rows.filter((r) => !whyOf.get(recordKey(r))).sort(byId);
  const held = one.rows.filter((r) => whyOf.get(recordKey(r))).map((r) => ({ ...r, why: whyOf.get(recordKey(r))! })).sort(byId);
  return { rows, held, warnings, retired: assigned.retired, outside, same: skipped };
}

/**
 * The Census Bureau's best match for a street and ZIP, or null. Throws if the geocoder itself fails. The record's
 * own city is sent first because the geocoder misses many streets without one; a wrong city then fails to match
 * and the street and ZIP alone are tried, so the city that comes back is always the Census Bureau's own.
 */
export async function censusMatch(street: string, zip: string, city = ''): Promise<Match | null> {
  const ask = async (line: string) => {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(line)}`;
    const res = await fetch(url, { headers: { 'user-agent': '313help-pipeline (open-source civic directory)' } });
    if (!res.ok) throw new Error(`Census geocoder: HTTP ${res.status}`);
    const m = ((await res.json()) as any).result?.addressMatches?.[0];
    return m ? { lat: m.coordinates.y, lon: m.coordinates.x, city: m.addressComponents?.city ?? '', zip: m.addressComponents?.zip ?? '', matched: m.matchedAddress } : null;
  };
  const whole = street.trim(), bare = streetOnly(street);
  const tries = [...(city ? [`${whole}, ${city}, MI ${zip}`] : []), `${whole}, MI ${zip}`, ...(bare !== whole ? [...(city ? [`${bare}, ${city}, MI ${zip}`] : []), `${bare}, MI ${zip}`] : [])];
  for (const line of tries) { const m = await ask(line); if (m) return m; }
  return null;
}

/**
 * Read one checked layer and write its files: published rows to data/ingested/<id>.csv and held rows to
 * data/staging/<id>.csv (with the reason), so both keep their ids from night to night. The geocoder is asked
 * only about records inside the area that no seed row already stands for. A geocoder failure stops the read:
 * nothing partial is written, and the files from the last good read stay.
 */
export async function ingestChecked(src: Source, fetchedAt: string): Promise<void> {
  const { existsSync } = await import('node:fs');
  const { fetchLayer, sharpDrop } = await import('./ingest-arcgis.js');
  const { readPrior, retiredPath, retiredRows, RETIRED_COLUMNS } = await import('./ingest-ids.js');
  const { p, readCsv, writeCsv } = await import('./util.js');

  const { lastEdited, features } = await fetchLayer(src, outFields(src));
  const f = src.fields ?? {};
  const same = new Set(Object.keys(src.same_as ?? {}));
  const matches = new Map<string, Match | null>();
  for (const feat of features) {
    const props = feat.properties ?? {};
    const [lon, lat] = feat.geometry?.coordinates ?? [];
    const ref = (f.ref ?? '').split('+').map((k) => tidy(props[k])).filter(Boolean).join('|');
    if (typeof lat !== 'number' || !inBbox(lat, lon) || !placeAt(lat, lon) || same.has(ref) || matches.has(ref)) continue;
    matches.set(ref, await censusMatch(tidy(props[f.address!]), tidy(props[f.zip!]), tidy(props[f.city!])));
  }

  const prior = readPrior(src.id);
  const out = toCheckedRows(src, lastEdited, features, matches, fetchedAt, prior);
  const ageDays = lastEdited ? Math.round((Date.now() - Date.parse(lastEdited)) / 86400000) : Infinity;
  // A layer its publisher hasn't edited in max_age_days publishes nothing new: everything goes to staging for a
  // person and the last published file stays live. Nothing disappears on a timer.
  const stale = (src.mode ?? 'stage') !== 'publish' || ageDays > (src.max_age_days ?? 90);
  if (stale) out.warnings.push(`${src.id}: layer last edited ${lastEdited} (${ageDays} days ago) or not a publish source; staging everything`);
  const pubPath = p('data/ingested', `${src.id}.csv`), heldPath = p('data/staging', `${src.id}.csv`);
  const publish = stale ? [] : out.rows;
  const held = stale ? [...out.rows.map((r) => ({ ...r, why: 'layer too old to publish' })), ...out.held] : out.held;
  const before = existsSync(pubPath) ? readCsv(pubPath).length : 0;
  if (!stale && sharpDrop(before, publish.length)) {
    console.warn(`${src.id}: ${publish.length} rows, down from ${before}. Not overwriting ${pubPath}; a person should look at the layer first.`);
    process.exitCode = 1;
    return;
  }
  if (!stale) writeCsv(pubPath, publish, CHECKED_COLUMNS);
  writeCsv(heldPath, held, HELD_COLUMNS);
  if (out.retired.length) writeCsv(retiredPath('data/ingested', src.id), retiredRows(out.retired), RETIRED_COLUMNS);
  const fixed = publish.filter((r) => r.census_fixed).length;
  console.log(`${src.id}: ${publish.length} published (${fixed} with a city or ZIP from the Census Bureau), ${held.length} held for a person, ${out.same} already listed by hand, ${out.outside} outside the area; layer last edited ${lastEdited ?? 'unknown'}`);
  for (const w of out.warnings) console.warn('  warn:', w);
}
