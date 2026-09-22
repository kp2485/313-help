// Read-only ingester for the City of Detroit's police-precinct and fire-station layers (DECISIONS 2026-09-22,
// Kyle's plan decision 3: "police and fire stations are ingested from City open data as 24-hour 'get somewhere
// safe' destinations beside the emergency rooms"). Writes data/ingested/<id>.csv, which is committed, so a
// changed address or phone number reaches a steward as the diff of a pull request like every other layer.
//
// It is a separate script from ingest-arcgis.ts for two reasons that are about the data, not about tidiness:
//
//  1. Both layers need rows dropped, and the rule is different for each. The City's Precinct Buildings layer
//     holds the twelve numbered precinct buildings plus two units that are not precinct front counters
//     ("Downtown Services", "DPSH"); the fire layer holds engine houses plus a training centre and a fireboat
//     house. A person in trouble at 3am should be sent to a lobby with a front desk, not to a radio shop, a
//     hangar or a classroom, so this ingest keeps only what it can name as a public-facing station and says
//     out loud what it dropped.
//  2. The fire layer writes a whole postal address into one field ("111 W Montcalm Street, Detroit, Michigan,
//     48201") and publishes its latitude in a field called `Long` and its longitude in a field called `Lat`.
//     The address is split here; the coordinate is read from the feature's own geometry, which is correct, and
//     the two mislabelled fields are never read at all.
//
// Everything else is shared with the other ingesters on purpose: the paging read (`fetchLayer`), the
// id rules (`ingest-ids.ts`: an id belongs to one record of the publisher's, for good) and the sharp-drop
// guard. Staff-name fields are never mapped. Nothing is ever written back to a source.

import { existsSync } from 'node:fs';
import {
  assertNoMovedIds, assignIds, NO_PRIOR, oneRowPerRecord, readPrior, recordKey,
  RETIRED_COLUMNS, retiredPath, retiredRows, type IdRequest, type PriorIds, type Retired,
} from './ingest-ids.js';
import { fetchLayer, loadSources, sharpDrop, type Source } from './ingest-arcgis.js';
import { p, readCsv, writeCsv, slug, inBbox, type CsvRow, today } from './util.js';

/** Same columns as the other ingested files, plus the city the layer states. */
export const SAFE_COLUMNS = [
  'sal_id', 'record_ref', 'name', 'address_1', 'city', 'zip', 'lat', 'lon', 'phone', 'website',
  'hours_text', 'extra', 'source_id', 'source_last_edited', 'fetched_at',
];

const ORDINAL = /^(\d+)(st|nd|rd|th)$/i;
/** An engine house: an engine, a ladder or a squad company. Not the training centre, not the fireboat house. */
const COMPANY = /^(engine|ladder|squad)\s*0*(\d+)$/i;

const clean = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/**
 * The plain name of a precinct building, or null for a row that is not one.
 * The City writes the precinct as an ordinal on its own ("2nd"), so the words around it are ours; the number
 * is the City's. Two rows in the layer are units rather than precinct front counters and are dropped by name.
 */
export function policeName(precinct: string): string | null {
  const m = ORDINAL.exec(clean(precinct));
  return m ? `Detroit Police ${m[1]}${m[2]!.toLowerCase()} Precinct` : null;
}

/** The plain name of an engine house, or null for a row that is not one. "ENGINE 01" -> "Engine 1 fire station". */
export function fireName(firehouse: string): string | null {
  const m = COMPANY.exec(clean(firehouse));
  if (!m) return null;
  const kind = m[1]!.toLowerCase();
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${Number(m[2])} fire station`;
}

/**
 * The fire layer's one-field address: "111 W Montcalm Street, Detroit, Michigan, 48201".
 * Only the shape the layer actually publishes is accepted; anything else keeps the whole string as the street
 * line and states no city or ZIP of its own, because a guessed city is worse than none.
 */
export function splitAddress(full: string): { line1: string; city: string; zip: string } {
  const parts = clean(full).split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 4 && /^\d{5}$/.test(parts[parts.length - 1]!)) {
    return { line1: parts[0]!, city: parts[1]!, zip: parts[parts.length - 1]! };
  }
  return { line1: clean(full), city: '', zip: '' };
}

export interface SafeRows { rows: CsvRow[]; warnings: string[]; retired: Retired[]; dropped: string[] }

export function toSafeRows(src: Source, lastEdited: string | null, features: any[], fetchedAt: string, prior: PriorIds = NO_PRIOR): SafeRows {
  const f = src.fields ?? {};
  const police = src.wording === 'police_station';
  const warnings: string[] = [];
  const dropped: string[] = [];
  const all: CsvRow[] = [];

  for (const feat of features) {
    const props = feat.properties ?? {};
    const [lon, lat] = feat.geometry?.coordinates ?? [];
    const raw = clean(props[f.name ?? '']);
    const name = police ? policeName(raw) : fireName(raw);
    if (!name) { dropped.push(raw || '(a feature with no name)'); continue; }

    const addr = police
      ? { line1: clean(props[f.address ?? '']), city: clean(props[f.city ?? '']) || 'Detroit', zip: clean(props[f.zip ?? '']) }
      : splitAddress(clean(props[f.address ?? '']));
    if (!addr.line1) { warnings.push(`"${name}" has no address in the layer; skipped`); continue; }
    if (typeof lat !== 'number' || !inBbox(lat, lon)) { warnings.push(`"${name}" is outside the service area; skipped`); continue; }

    all.push({
      sal_id: '',
      // The publisher's own reference for the record. Neither layer carries a GlobalID, so this is the best
      // permanent key each one has: the precinct's ordinal, and the fire company's short label ("E-1").
      record_ref: clean(props[f.ref ?? '']) || raw,
      name, address_1: addr.line1, city: addr.city, zip: addr.zip,
      lat: lat.toFixed(6), lon: lon.toFixed(6),
      // Only a number the layer itself prints as the building's public line. The fire layer prints none, and
      // no dispatch or internal number is ever read from either one.
      phone: police ? clean(props[f.phone ?? '']) : '',
      website: '', hours_text: '', extra: '',
      source_id: src.id, source_last_edited: lastEdited ?? '', fetched_at: fetchedAt,
    });
  }

  const one = oneRowPerRecord(all);
  const rows = one.rows;
  warnings.push(...one.warnings);
  const requests: IdRequest[] = rows.map((r) => ({ key: recordKey(r), base: slug(r.name!), alt: slug(r.address_1!).slice(0, 20) }));
  const assigned = assignIds(`sal_${src.id_prefix ?? src.id}_`, requests, prior, fetchedAt);
  for (const r of rows) r.sal_id = assigned.ids.get(recordKey(r))!;
  warnings.push(...assigned.warnings);
  assertNoMovedIds(src.id, prior, rows);

  rows.sort((a, b) => a.sal_id!.localeCompare(b.sal_id!));
  return { rows, warnings, retired: assigned.retired, dropped };
}

async function main() {
  const fetchedAt = today();
  for (const src of loadSources().filter((s) => s.kind === 'arcgis_safe')) {
    const { lastEdited, features } = await fetchLayer(src);
    const prior = readPrior(src.id);
    const { rows, warnings, retired, dropped } = toSafeRows(src, lastEdited, features, fetchedAt, prior);
    const ageDays = lastEdited ? Math.round((Date.now() - Date.parse(lastEdited)) / 86400000) : Infinity;
    let mode = src.mode ?? 'stage';
    if (mode === 'publish' && ageDays > (src.max_age_days ?? 90)) {
      warnings.push(`layer last edited ${lastEdited} (${ageDays} days ago); too old to publish, staging instead`);
      mode = 'stage';
    }
    const dir = mode === 'publish' ? 'data/ingested' : 'data/staging';
    const out = p(dir, `${src.id}.csv`);
    const before = existsSync(out) ? readCsv(out).length : 0;
    if (sharpDrop(before, rows.length)) {
      console.warn(`${src.id}: ${rows.length} rows, down from ${before}. Not overwriting ${out}; a person should look at the layer first.`);
      process.exitCode = 1;
      continue;
    }
    writeCsv(out, rows, SAFE_COLUMNS);
    if (retired.length) writeCsv(retiredPath(dir, src.id), retiredRows(retired), RETIRED_COLUMNS);
    console.log(`${src.id}: ${rows.length} rows, layer last edited ${lastEdited ?? 'unknown'} -> ${mode} (${out})`);
    // What was left out, every run, by name: this is the list a steward argues with, so it is never silent.
    if (dropped.length) console.log(`  not a public station, left out: ${dropped.join(', ')}`);
    for (const w of warnings) console.warn('  warn:', `${src.id}: ${w}`);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-safe.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
