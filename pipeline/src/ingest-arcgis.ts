// Read-only ingester for City of Detroit ArcGIS feature layers listed in data/sources.yaml.
// Writes data/ingested/<id>.csv (mode: publish) or data/staging/<id>.csv (mode: stage).
// Both are committed: the git diff of these files is how a phone or address change
// gets seen and approved by a person before it reaches the bundle (10-A5).
// Never maps staff-name fields. Never writes back to a source.

import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { p, writeCsv, slug, inBbox, type CsvRow } from './util.js';

export interface Source {
  id: string; name: string; kind: string; url: string; page?: string; license?: string;
  mode?: 'publish' | 'stage'; enabled?: boolean; max_age_days?: number;
  category?: string; cadence_days?: number; org?: { id: string; name: string };
  fields?: Record<string, string>; extra?: string[]; id_prefix?: string;
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
  const res = await fetch(url, { headers: { 'user-agent': 'detroithelp-pipeline (open-source civic directory)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function fetchLayer(src: Source): Promise<{ lastEdited: string | null; features: any[] }> {
  const meta = await getJson(`${src.url}?f=json`);
  const ms = meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate;
  const lastEdited = ms ? new Date(ms).toISOString().slice(0, 10) : null;
  const features: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await getJson(`${src.url}/query?where=1%3D1&outFields=*&f=geojson&resultOffset=${offset}&resultRecordCount=1000`);
    features.push(...(page.features ?? []));
    if (!page.properties?.exceededTransferLimit || !page.features?.length) break;
  }
  return { lastEdited, features };
}

export function toRows(src: Source, lastEdited: string | null, features: any[], fetchedAt: string): { rows: CsvRow[]; warnings: string[] } {
  const f = src.fields ?? {};
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  const rows: CsvRow[] = [];
  const get = (props: any, key?: string) => (key && props[key] != null ? String(props[key]).replace(/\s+/g, ' ').trim() : '');

  for (const feat of features) {
    const props = feat.properties ?? {};
    const [lon, lat] = feat.geometry?.coordinates ?? [];
    const name = get(props, f.name), address = get(props, f.address);
    if (!name || !address) { warnings.push(`${src.id}: skipped a feature with no name or address`); continue; }
    if (typeof lat !== 'number' || !inBbox(lat, lon)) { warnings.push(`${src.id}: "${name}" is outside the Detroit bbox; skipped`); continue; }

    // Stable id from the address. If two features share an address, the second gets the name too.
    let id = `sal_${src.id_prefix ?? src.id}_${slug(address)}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) { warnings.push(`${src.id}: duplicate address "${address}" ("${name}")`); id = `${id}_${slug(name).slice(0, 20)}`; }

    const extra = (src.extra ?? []).map((k) => `${k}=${get(props, k)}`).filter((s) => !s.endsWith('=')).join('; ');
    rows.push({
      sal_id: id, record_ref: get(props, f.ref), name, address_1: address, zip: get(props, f.zip),
      lat: lat.toFixed(6), lon: lon.toFixed(6), phone: get(props, f.phone), website: get(props, f.website),
      hours_text: get(props, f.hours), extra, source_id: src.id, source_last_edited: lastEdited ?? '', fetched_at: fetchedAt,
    });
  }
  rows.sort((a, b) => a.sal_id!.localeCompare(b.sal_id!));
  return { rows, warnings };
}

async function main() {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  for (const src of loadSources().filter((s) => s.kind === 'arcgis')) {
    const { lastEdited, features } = await fetchLayer(src);
    const { rows, warnings } = toRows(src, lastEdited, features, fetchedAt);
    const ageDays = lastEdited ? Math.round((Date.now() - Date.parse(lastEdited)) / 86400000) : Infinity;
    let mode = src.mode ?? 'stage';
    if (mode === 'publish' && ageDays > (src.max_age_days ?? 90)) {
      warnings.push(`${src.id}: layer last edited ${lastEdited} (${ageDays} days ago); too old to publish, staging instead`);
      mode = 'stage';
    }
    const out = p(mode === 'publish' ? 'data/ingested' : 'data/staging', `${src.id}.csv`);
    writeCsv(out, rows, INGESTED_COLUMNS);
    console.log(`${src.id}: ${rows.length} rows, layer last edited ${lastEdited ?? 'unknown'} -> ${mode} (${out})`);
    for (const w of warnings) console.warn('  warn:', w);
  }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-arcgis.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
