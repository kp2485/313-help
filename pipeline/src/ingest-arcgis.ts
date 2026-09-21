// Read-only ingester for City of Detroit ArcGIS feature layers listed in data/sources.yaml.
// Writes data/ingested/<id>.csv (mode: publish) or data/staging/<id>.csv (mode: stage).
// Both are committed: the git diff of these files is how a phone or address change
// gets seen and approved by a person before it reaches the bundle (10-A5).
// Never maps staff-name fields. Never writes back to a source.

import { existsSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { assertNoMovedIds, assignIds, NO_PRIOR, oneRowPerRecord, readPrior, recordKey, RETIRED_COLUMNS, retiredPath, retiredRows, type IdRequest, type PriorIds, type Retired } from './ingest-ids.js';
import { p, readCsv, writeCsv, slug, inBbox, type CsvRow, today } from './util.js';

export interface Source {
  id: string; name: string; kind: string; url: string; page?: string; license?: string;
  mode?: 'publish' | 'stage'; enabled?: boolean; max_age_days?: number;
  category?: string; org?: { id: string; name: string };
  fields?: Record<string, string>; extra?: string[]; id_prefix?: string;
  /** Which plain wording normalize.ts gives this layer's rows. Default: the Narcan boxes' wording. */
  wording?: 'narcan_box' | 'supplies_station';
  /** Service-area cities a layer that covers more than the service area is filtered to (ingest-mymap.ts). */
  cities?: string[];
}

export const INGESTED_COLUMNS = [
  'sal_id', 'record_ref', 'name', 'address_1', 'zip', 'lat', 'lon', 'phone', 'website',
  'hours_text', 'extra', 'source_id', 'source_last_edited', 'fetched_at',
];

export function loadSources(): Source[] {
  const doc = YAML.parse(readFileSync(p('data/sources.yaml'), 'utf8')) as { sources: Source[] };
  return doc.sources.filter((s) => s.enabled !== false);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': '313help-pipeline (open-source civic directory)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body: any = await res.json();
  // ArcGIS answers many failures with HTTP 200 and an error object. That is an error, never an empty layer.
  if (body?.error) throw new Error(`${url}: ${body.error.message ?? 'error'} (${body.error.code ?? '?'})`);
  return body;
}

/**
 * Every feature, page by page. Pages are ordered by the layer's id field so none is skipped or repeated, sized to
 * what the server allows, and the next page is asked for whenever a page comes back full (some servers never set
 * exceededTransferLimit on GeoJSON). A page that fails stops the whole read: nothing partial is ever written.
 */
export async function fetchLayer(src: Source): Promise<{ lastEdited: string | null; features: any[] }> {
  const meta = await getJson(`${src.url}?f=json`);
  const ms = meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate;
  const lastEdited = ms ? today(new Date(ms)) : null;
  const size = Math.min(1000, Number(meta.maxRecordCount) || 1000);
  const oid = meta.objectIdField ?? (meta.fields ?? []).find((f: { type?: string }) => f.type === 'esriFieldTypeOID')?.name ?? 'OBJECTID';
  const features: any[] = [];
  for (let offset = 0; offset < 1_000_000;) {
    const page = await getJson(`${src.url}/query?where=1%3D1&outFields=*&f=geojson&orderByFields=${encodeURIComponent(oid)}&resultOffset=${offset}&resultRecordCount=${size}`);
    const got: any[] = page.features ?? [];
    features.push(...got);
    offset += got.length;
    if (!got.length || (got.length < size && !(page.exceededTransferLimit || page.properties?.exceededTransferLimit))) break;
  }
  return { lastEdited, features };
}

/** A layer that lost more than half its rows since the last good file is more likely broken than emptied. */
export const sharpDrop = (before: number, after: number) => before >= 10 && after < before / 2;

export function toRows(src: Source, lastEdited: string | null, features: any[], fetchedAt: string, prior: PriorIds = NO_PRIOR): { rows: CsvRow[]; warnings: string[]; retired: Retired[] } {
  const f = src.fields ?? {};
  const warnings: string[] = [];
  const all: CsvRow[] = [];
  const get = (props: any, key?: string) => (key && props[key] != null ? String(props[key]).replace(/\s+/g, ' ').trim() : '');

  for (const feat of features) {
    const props = feat.properties ?? {};
    const [lon, lat] = feat.geometry?.coordinates ?? [];
    const name = get(props, f.name), address = get(props, f.address);
    if (!name || !address) { warnings.push(`${src.id}: skipped a feature with no name or address`); continue; }
    if (typeof lat !== 'number' || !inBbox(lat, lon)) { warnings.push(`${src.id}: "${name}" is outside the service area; skipped`); continue; }

    const extra = (src.extra ?? []).map((k) => `${k}=${get(props, k)}`).filter((s) => !s.endsWith('=')).join('; ');
    all.push({
      sal_id: '', record_ref: get(props, f.ref), name, address_1: address, zip: get(props, f.zip),
      lat: lat.toFixed(6), lon: lon.toFixed(6), phone: get(props, f.phone), website: get(props, f.website),
      hours_text: get(props, f.hours), extra, source_id: src.id, source_last_edited: lastEdited ?? '', fetched_at: fetchedAt,
    });
  }

  // Ids come from the layer's own record references, never from the order it answered in (ingest-ids.ts).
  const one = oneRowPerRecord(all);
  const rows = one.rows;
  warnings.push(...one.warnings.map((w) => `${src.id}: ${w}`));
  const requests: IdRequest[] = rows.map((r) => ({ key: recordKey(r), base: slug(r.address_1!), alt: slug(r.name!).slice(0, 20) }));
  const assigned = assignIds(`sal_${src.id_prefix ?? src.id}_`, requests, prior, fetchedAt);
  for (const r of rows) r.sal_id = assigned.ids.get(recordKey(r))!;
  warnings.push(...assigned.warnings.map((w) => `${src.id}: ${w}`));
  assertNoMovedIds(src.id, prior, rows);

  rows.sort((a, b) => a.sal_id!.localeCompare(b.sal_id!));
  return { rows, warnings, retired: assigned.retired };
}

async function main() {
  const fetchedAt = today();
  for (const src of loadSources().filter((s) => s.kind === 'arcgis')) {
    const { lastEdited, features } = await fetchLayer(src);
    // What this layer committed last time: every record it has already been given an id for, and every id it
    // has retired. Both decide the ids below, so this read happens before anything is minted.
    const prior = readPrior(src.id);
    const { rows, warnings, retired } = toRows(src, lastEdited, features, fetchedAt, prior);
    const ageDays = lastEdited ? Math.round((Date.now() - Date.parse(lastEdited)) / 86400000) : Infinity;
    // A layer its publisher hasn't edited in max_age_days publishes nothing new: fresh rows go to staging for a person,
    // and the last published file stays live. Nothing disappears on a timer.
    let mode = src.mode ?? 'stage';
    if (mode === 'publish' && ageDays > (src.max_age_days ?? 90)) {
      warnings.push(`${src.id}: layer last edited ${lastEdited} (${ageDays} days ago); too old to publish, staging instead`);
      mode = 'stage';
    }
    const out = p(mode === 'publish' ? 'data/ingested' : 'data/staging', `${src.id}.csv`);
    const before = existsSync(out) ? readCsv(out).length : 0;
    if (sharpDrop(before, rows.length)) {
      console.warn(`${src.id}: ${rows.length} rows, down from ${before}. Not overwriting ${out}; a person should look at the layer first.`);
      process.exitCode = 1;
      continue;
    }
    writeCsv(out, rows, INGESTED_COLUMNS);
    // Tombstones ride with the file whose ids they retire, and are committed with it: nothing is deleted.
    if (retired.length) writeCsv(retiredPath(mode === 'publish' ? 'data/ingested' : 'data/staging', src.id), retiredRows(retired), RETIRED_COLUMNS);
    console.log(`${src.id}: ${rows.length} rows, layer last edited ${lastEdited ?? 'unknown'} -> ${mode} (${out})`);
    for (const w of warnings) console.warn('  warn:', w);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-arcgis.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
