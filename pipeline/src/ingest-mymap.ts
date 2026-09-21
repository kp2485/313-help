// Read-only ingester for a published Google My Map whose own KML is the source (data/sources.yaml, kind: google_mymap).
// The one source read here today:
//   Wayne County "Well Wayne Stations Location Map", published by the Wayne County Department of Health, Human and
//   Veterans Services at https://endoverdosewayne.org/ (KML: https://www.google.com/maps/d/kml?mid=...&forcekml=1).
//   Kyle approved it on 2026-09-20: facts only, attributed to the County, and flagged for a licence question
//   because the County's page states no licence (docs/research/2026-09-20/empty-categories.md).
// Read-only and identified honestly, like every other ingest. Nothing is ever written back to the source.
// Writes data/ingested/<id>.csv (mode: publish) or data/staging/<id>.csv (mode: stage), both committed: the git
// diff of that file is how a change to a station reaches a person before it reaches the bundle (10-A5).
//
// The map gives a site name, a city, coordinates, a station type, whether it is 24/7, where on the property the
// box sits, and sometimes the host's website. It gives NO street address and no phone, and we never turn a
// coordinate into a street address we then publish as a fact (DECISIONS 2026-09-20). So this layer's rows carry
// their own city and no address_1, which is why the file has one column the ArcGIS layers do not: `city`.
//
// The KML is small, flat and has no namespaced elements, so it is read with regular expressions rather than by
// adding an XML dependency. Anything the reader does not recognise is left out of `extra`, never guessed at.

import { existsSync } from 'node:fs';
import { INGESTED_COLUMNS, loadSources, sharpDrop, type Source } from './ingest-arcgis.js';
import { assertNoMovedIds, assignIds, NO_PRIOR, oneRowPerRecord, readPrior, recordKey, RETIRED_COLUMNS, retiredPath, retiredRows, type IdRequest, type PriorIds, type Retired } from './ingest-ids.js';
import { p, readCsv, writeCsv, slug, inBbox, today, type CsvRow } from './util.js';

/** Same columns as an ArcGIS layer, plus the city this layer publishes for itself. */
export const MYMAP_COLUMNS = [...INGESTED_COLUMNS.slice(0, 4), 'city', ...INGESTED_COLUMNS.slice(4)];

const UA = { 'user-agent': '313help-pipeline (open-source civic directory)' };

export interface Placemark { city: string; name: string; description: string; lat: number; lon: number }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Collapse the map's tabs, non-breaking spaces and stray runs of whitespace; never changes a word. */
const tidy = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unescapeXml(m[1]!) : null;
};

/**
 * The map's own "Map updated: September 14, 2026" line is this layer's last-edited date, the same fact an ArcGIS
 * layer reports as dataLastEditDate. If the map stops stating one we publish nothing new rather than invent a date.
 */
export function mapUpdated(documentDescription: string): string | null {
  const m = /Map updated:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(tidy(documentDescription));
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

/** Every `<Placemark>` with a point, plus the map's own updated date. Site names read `[City] Site name`. */
export function parseKml(xml: string): { lastEdited: string | null; placemarks: Placemark[] } {
  const doc = /<Document>([\s\S]*?)(?:<Folder>|<Placemark>)/.exec(xml)?.[1] ?? '';
  const lastEdited = mapUpdated(tag(doc, 'description') ?? '');
  const placemarks: Placemark[] = [];
  for (const [, body] of xml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const coords = tag(body!, 'coordinates');
    if (!coords) continue;   // a line or polygon, not a station
    const [lon, lat] = tidy(coords).split(',').map(Number);
    const raw = tidy(tag(body!, 'name') ?? '');
    const m = /^\[([^\]]+)\]\s*(.+)$/.exec(raw);
    if (!m || lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    placemarks.push({ city: tidy(m[1]!), name: tidy(m[2]!), description: tag(body!, 'description') ?? '', lat, lon });
  }
  return { lastEdited, placemarks };
}

const KEYS: [RegExp, string][] = [
  [/^website$/i, 'website'],
  [/^station types?$/i, 'Station_Type'],
  [/^24\/7 access$/i, 'Access_247'],
  [/^location(?:\s*\d+)?$/i, 'Box_Location'],
];

export interface Details { website: string; station_type: string[]; access: string[]; box_locations: string[]; supplies: string[] }

/**
 * A placemark's description is a `<br>`-separated list of "Key: value" lines, then a "Supplies:" list, then the
 * map's own note that supplies can run out. A site with several devices repeats "Location N:" and "24/7 Access:".
 */
export function parseDetails(description: string): Details {
  const out: Details = { website: '', station_type: [], access: [], box_locations: [], supplies: [] };
  let inSupplies = false;
  for (const part of description.split(/<br\s*\/?>/i)) {
    const line = tidy(part);
    if (!line) continue;
    if (line.startsWith('*')) { inSupplies = false; continue; }   // "*Supplies are subject to change..."
    const kv = /^([^:]{1,24}):\s*(.*)$/.exec(line);
    const label = kv ? kv[1]!.trim() : line.replace(/:$/, '').trim();
    if (/^supplies$/i.test(label)) { inSupplies = true; if (kv?.[2]) out.supplies.push(kv[2]!); continue; }
    const key = KEYS.find(([re]) => re.test(label))?.[1];
    if (key && kv) {
      inSupplies = false;
      const value = kv[2]!.trim();
      if (!value) continue;
      if (key === 'website') out.website = value;
      else if (key === 'Station_Type') out.station_type.push(...value.split(/[;,]/).map((s) => s.trim()).filter(Boolean));
      else if (key === 'Access_247') out.access.push(value);
      else out.box_locations.push(value);
      continue;
    }
    if (inSupplies) out.supplies.push(line);
  }
  return out;
}

/**
 * The only hours fact the map states is its legend: red is 24/7, purple is "not 24/7, usually Monday-Friday during
 * normal business hours". A site whose devices differ says nothing, so it publishes as unknown and never as open.
 */
export const NOT_24H = "Not open 24 hours; the County's map says usually Monday-Friday during normal business hours";
export function hoursText(access: string[]): string {
  const yes = access.filter((a) => /^yes\b/i.test(a)).length, no = access.filter((a) => /^no\b/i.test(a)).length;
  if (yes && !no) return '24 hrs';
  if (no && !yes) return NOT_24H;
  return '';
}

export function toRows(src: Source, lastEdited: string | null, placemarks: Placemark[], fetchedAt: string, prior: PriorIds = NO_PRIOR): { rows: CsvRow[]; warnings: string[]; retired: Retired[] } {
  const warnings: string[] = [];
  const cities = new Set((src.cities ?? []).map((c) => c.toLowerCase()));
  const all: CsvRow[] = [];
  for (const pm of [...placemarks].sort((a, b) => `${a.city}|${a.name}`.localeCompare(`${b.city}|${b.name}`))) {
    // The map covers the whole county. The service area is Detroit, Hamtramck, Highland Park and Dearborn, and the
    // map states each station's city itself, so the city decides (Dearborn Heights is not Dearborn). The bbox is a
    // second, independent sanity check on the coordinate the County publishes.
    if (cities.size && !cities.has(pm.city.toLowerCase())) continue;
    if (!inBbox(pm.lat, pm.lon)) { warnings.push(`${src.id}: "${pm.name}" (${pm.city}) is at ${pm.lat},${pm.lon}, outside the service area; skipped`); continue; }

    const d = parseDetails(pm.description);
    // `extra` is a "; "-separated list of key=value, so a value's own semicolons become commas. Nothing else changes.
    const comma = (s: string) => s.replace(/\s*;\s*/g, ', ');
    const fields: [string, string][] = [
      ['Station_Type', comma(d.station_type.join(', '))],
      ['Access_247', comma(d.access.join(', '))],
      ...(d.box_locations.length === 1
        ? ([['Box_Location', comma(d.box_locations[0]!)]] as [string, string][])
        : d.box_locations.map((b, i) => [`Box_Location${i + 1}`, comma(b)] as [string, string])),
      ['Supplies', comma(d.supplies.join(', '))],
    ];
    all.push({
      sal_id: '', record_ref: '', name: pm.name, address_1: '', city: pm.city, zip: '',
      lat: pm.lat.toFixed(7), lon: pm.lon.toFixed(7), phone: '', website: d.website,
      hours_text: hoursText(d.access),
      extra: fields.filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; '),
      source_id: src.id, source_last_edited: lastEdited ?? '', fetched_at: fetchedAt,
    });
  }

  // The KML carries no per-placemark id, so the stable key this map has is the city and site name it states
  // (ingest-ids.ts says what that costs). The slug still covers prefix, city and name together, so an id this
  // layer has already published keeps exactly the spelling it has.
  const one = oneRowPerRecord(all);
  const rows = one.rows;
  warnings.push(...one.warnings.map((w) => `${src.id}: ${w}`));
  const requests: IdRequest[] = rows.map((r) => ({
    key: recordKey(r), base: slug(`${src.id_prefix ?? src.id} ${r.city} ${r.name}`), alt: slug(r.name!).slice(0, 20),
  }));
  const assigned = assignIds('sal_', requests, prior, fetchedAt);
  for (const r of rows) r.sal_id = assigned.ids.get(recordKey(r))!;
  warnings.push(...assigned.warnings.map((w) => `${src.id}: ${w}`));
  assertNoMovedIds(src.id, prior, rows);

  rows.sort((a, b) => a.sal_id!.localeCompare(b.sal_id!));
  return { rows, warnings, retired: assigned.retired };
}

async function main() {
  const fetchedAt = today();
  for (const src of loadSources().filter((s) => s.kind === 'google_mymap')) {
    const res = await fetch(src.url, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} ${src.url}`);
    const { lastEdited, placemarks } = parseKml(await res.text());
    if (!placemarks.length) throw new Error(`${src.id}: no placemarks read; not overwriting anything`);
    // What this map committed last time: the ids it has already handed out, and the ids it has retired.
    const prior = readPrior(src.id);
    const { rows, warnings, retired } = toRows(src, lastEdited, placemarks, fetchedAt, prior);
    const ageDays = lastEdited ? Math.round((Date.now() - Date.parse(lastEdited)) / 86400000) : Infinity;
    // A map its publisher hasn't updated in max_age_days publishes nothing new: fresh rows go to staging for a
    // person and the last published file stays live. Nothing disappears on a timer.
    let mode = src.mode ?? 'stage';
    if (mode === 'publish' && ageDays > (src.max_age_days ?? 90)) {
      warnings.push(`${src.id}: map last updated ${lastEdited ?? 'unknown'} (${ageDays} days ago); too old to publish, staging instead`);
      mode = 'stage';
    }
    const out = p(mode === 'publish' ? 'data/ingested' : 'data/staging', `${src.id}.csv`);
    const before = existsSync(out) ? readCsv(out).length : 0;
    if (sharpDrop(before, rows.length)) {
      console.warn(`${src.id}: ${rows.length} rows, down from ${before}. Not overwriting ${out}; a person should look at the map first.`);
      process.exitCode = 1;
      continue;
    }
    writeCsv(out, rows, MYMAP_COLUMNS);
    // Tombstones ride with the file whose ids they retire, and are committed with it: nothing is deleted.
    if (retired.length) writeCsv(retiredPath(mode === 'publish' ? 'data/ingested' : 'data/staging', src.id), retiredRows(retired), RETIRED_COLUMNS);
    console.log(`${src.id}: ${rows.length} of ${placemarks.length} stations are in the service area, map updated ${lastEdited ?? 'unknown'} -> ${mode} (${out})`);
    for (const w of warnings) console.warn('  warn:', w);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-mymap.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
