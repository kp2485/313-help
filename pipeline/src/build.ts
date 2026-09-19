// data/seed + data/ingested  ->  data/hsds (committed)  +  data/bundle/v1 (never committed)
//   pnpm build:bundle            dev build: unverified emergency numbers warn, dev signing key
//   pnpm build:bundle:release    fails unless every emergency number was phoned within 30 days
//                                and BUNDLE_SIGNING_KEY is set

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Alert, BundleRow } from '@detroithelp/query';
import { p, readCsv, sha256, today, writeJson, type CsvRow } from './util.js';
import { loadSources } from './ingest-arcgis.js';
import { buildIndicators, NEAR_MILES } from './indicators.js';
import { GRID } from './ingest-basemap.js';
import { fromIngested, fromSeed, toHsds, type Normalized } from './normalize.js';
import { hsdsSchema, validateAlerts, validateEmergency, validateHsds, validateRows } from './validate.js';
import { loadSigningKey, publicKeyB64, signBytes } from './sign.js';
import { applyAggregates, fetchAggregates, pushTargets, type Aggregates } from './reports-sync.js';

export interface BuildOptions { aggregates?: Aggregates | null; release?: boolean; offline?: boolean; outDir?: string; hsdsDir?: string | null; now?: Date; quiet?: boolean }

export interface BundleIndex {
  schema: 1;
  version: string;
  generated_at: string;
  /** Set only when a person retires the directory on purpose (data/seed/directory.json). No timer ever sets it. */
  retired?: true;
  emergency_verified: boolean;
  signing: 'release' | 'dev';
  counts: Record<string, number>;
  files: Record<string, { sha256: string; bytes: number }>;
}

function gitSha(): string {
  try { return execSync('git rev-parse --short HEAD', { cwd: p(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'nogit'; }
}

export async function build(opts: BuildOptions = {}) {
  const now = opts.now ?? new Date();
  const todayStr = today(now);
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log(...a); };

  // 1. Load and normalize
  const parts: Normalized[] = [fromSeed(readCsv(p('data/seed/resources.csv')), readCsv(p('data/seed/schedules.csv')))];
  for (const src of loadSources().filter((s) => s.mode === 'publish')) {
    parts.push(fromIngested(src, readCsv(p('data/ingested', `${src.id}.csv`))));
  }
  const rows: BundleRow[] = parts.flatMap((x) => x.rows).sort((a, b) => a.id.localeCompare(b.id));
  // Report counts and visitor confirms from the write API (none until it is deployed and configured).
  const agg = opts.aggregates !== undefined ? opts.aggregates : await fetchAggregates();
  if (agg) { const a = applyAggregates(rows, agg); log(`reports: facts applied to ${a.applied} rows${a.frozen ? ' — CIRCUIT BREAKER tripped: closure counts ignored until a steward looks' : ''}`); }
  const emergency: CsvRow[] = readCsv(p('data/seed/emergency.csv'));
  const alerts = JSON.parse(readFileSync(p('data/seed/alerts.json'), 'utf8')) as Alert[];

  // 2. Validate
  const issues = [validateRows(rows, todayStr), validateAlerts(alerts, new Set(rows.map((r) => r.id)))];
  const emg = validateEmergency(emergency, todayStr, !!opts.release);
  issues.push(emg);
  const services = toHsds(parts);
  const schema = await hsdsSchema(opts.offline);
  if (schema) issues.push(validateHsds(services, schema));
  else issues.push({ errors: opts.release ? ['HSDS schema unavailable; a release must validate against it'] : [], warnings: ['HSDS schema unavailable (offline); skipped HSDS validation'] });

  const errors = issues.flatMap((i) => i.errors), warnings = issues.flatMap((i) => i.warnings);
  for (const w of warnings) log('warn:', w);
  if (errors.length) throw new Error(`Bundle build failed:\n  ${errors.join('\n  ')}`);

  // 3. HSDS export (committed on publish)
  if (opts.hsdsDir !== null) writeJson(p(opts.hsdsDir ?? 'data/hsds', 'services.json'), services);

  // 4. Bundle: one file per top-level category, plus alerts, emergency, archived (<= 90 days)
  const out = opts.outDir ?? p('data/bundle/v1');
  rmSync(out, { recursive: true, force: true });
  const files: BundleIndex['files'] = {};
  const put = (name: string, data: unknown) => { const buf = writeJson(`${out}/${name}`, data); files[name] = { sha256: sha256(buf), bytes: buf.length }; };

  const live = rows.filter((r) => r.status !== 'archived');
  const counts: Record<string, number> = {};
  for (const top of [...new Set(live.map((r) => r.category.split('.')[0]!))].sort()) {
    const subset = live.filter((r) => r.category.split('.')[0] === top);
    counts[top] = subset.length;
    put(`category/${top}.json`, subset);
  }
  const cutoff = today(new Date(now.getTime() - 90 * 86400000));
  put('archived.json', rows.filter((r) => r.status === 'archived' && (r.archived?.at ?? '') >= cutoff)
    .map((r) => ({ id: r.id, name: r.name, category: r.category, archived: r.archived })));
  // Greenway segments (docs/11): fetched after the help categories, so a phone that only ever
  // loads food never downloads a trail map.
  const jlg = p('data/ingested/jlg_segments.json');
  // Street map made from City open data (ingest-basemap.ts). The files are listed here so the signature covers
  // them, but a phone downloads them only when a person first opens a map (apps/web/src/map.ts).
  const mapDir = p('data/ingested/basemap');
  const hasMap = existsSync(`${mapDir}/base.json`);
  const crossings: Record<string, string[]> = hasMap ? JSON.parse(readFileSync(`${mapDir}/crossings.json`, 'utf8')) : {};
  if (existsSync(jlg)) {
    const g = JSON.parse(readFileSync(jlg, 'utf8'));
    for (const s of g.segments as { id: string; cross_streets?: string[] }[]) if (crossings[s.id]?.length) s.cross_streets = crossings[s.id];
    counts.greenway_segments = g.segments.length; put('places/greenway.json', g);
  }
  const putCompact = (name: string, data: unknown) => { const buf = Buffer.from(JSON.stringify(data)); mkdirSync(`${out}/${name.slice(0, name.lastIndexOf('/'))}`, { recursive: true }); writeFileSync(`${out}/${name}`, buf); files[name] = { sha256: sha256(buf), bytes: buf.length }; };
  if (hasMap) {
    const cells: Record<string, unknown> = {};
    for (const f of readdirSync(`${mapDir}/cells`).sort()) cells[f.replace('.json', '')] = JSON.parse(readFileSync(`${mapDir}/cells/${f}`, 'utf8'));
    const source = JSON.parse(readFileSync(`${mapDir}/source.json`, 'utf8'));
    putCompact('map/base.json', { source, ...JSON.parse(readFileSync(`${mapDir}/base.json`, 'utf8')) });
    putCompact('map/streets.json', { grid: source.grid, cells });
    counts.map_cells = Object.keys(cells).length;
  }
  // Recreation and Events tabs. Past events are dropped at build time and again on the device.
  const parksFile = p('data/ingested/city_parks.json'), eventsFile = p('data/ingested/city_events.json');
  if (existsSync(parksFile)) { const d = JSON.parse(readFileSync(parksFile, 'utf8')); counts.parks = d.parks.length; put('places/parks.json', d); }
  // ZIP center points for "Type a ZIP" (docs/05): about 1 KB, and the typed ZIP never leaves the phone.
  // Neighborhood indicators (docs/13): public City data joined with our own listings. Like the map, the file is
  // under the signature but only downloaded when someone opens a neighborhood page. It is not in the crisis path.
  const hoodsFile = p('data/ingested/neighborhoods.json'), statsFile = p('data/ingested/city_stats.json');
  if (existsSync(hoodsFile) && existsSync(statsFile)) {
    const h = JSON.parse(readFileSync(hoodsFile, 'utf8')), st = JSON.parse(readFileSync(statsFile, 'utf8'));
    const ind = buildIndicators({
      hoods: h.neighborhoods, rows: live, stats: st,
      parks: existsSync(parksFile) ? JSON.parse(readFileSync(parksFile, 'utf8')).parks : [],
      segments: existsSync(jlg) ? JSON.parse(readFileSync(jlg, 'utf8')).segments : [],
    });
    const doc = { sources: { neighborhoods: h.source, ...st.sources }, stats_fetched_at: st.fetched_at, first_year: st.first_year, partial_year: st.partial_year, near_miles: NEAR_MILES, origin: [GRID.lon0, GRID.lat0], city: st.city, city_parcels: st.city_parcels, issue_types: st.issue_types, ...ind };
    putCompact('indicators/neighborhoods.json', doc);
    counts.neighborhoods = ind.neighborhoods.length;
    // Committed on publish, without the outlines, so the history of every number is in git (docs/13).
    if (opts.hsdsDir !== null) writeJson(p('data/indicators/neighborhoods.json'), { ...doc, neighborhoods: ind.neighborhoods.map(({ rings: _rings, ...n }) => n) });
  }
  const zipsFile = p('data/ingested/city_zips.json');
  if (existsSync(zipsFile)) put('places/zips.json', JSON.parse(readFileSync(zipsFile, 'utf8')));
  if (existsSync(eventsFile)) { const d = JSON.parse(readFileSync(eventsFile, 'utf8')); d.events = d.events.filter((e: { starts_at: string }) => e.starts_at.slice(0, 10) >= todayStr); counts.events = d.events.length; put('events.json', d); }
  put('alerts.json', alerts.filter((a) => a.status === 'published' && Date.parse(a.ends_at) > now.getTime()));
  put('emergency.json', emergency.sort((a, b) => Number(a.sort) - Number(b.sort))
    .map((r) => ({ id: r.id, label: r.label, number: r.number, ...(r.sms ? { sms: r.sms } : {}), hardcoded: r.hardcoded === 'yes' })));

  // Retiring the directory is a person's decision, committed to git (docs/OPERATIONS "How to retire the directory").
  const directoryFile = p('data/seed/directory.json');
  const retired = existsSync(directoryFile) && JSON.parse(readFileSync(directoryFile, 'utf8')).retired === true;
  const { key, kind } = loadSigningKey(!!opts.release);
  const index: BundleIndex = {
    // The content hash makes every distinct bundle a distinct version, even two builds in the same minute.
    schema: 1, version: `${gitSha()}-${now.toISOString().replace(/[-:]/g, '').slice(0, 13)}-${sha256(JSON.stringify(files)).slice(0, 8)}`,
    generated_at: now.toISOString().slice(0, 16) + 'Z',
    ...(retired ? { retired: true as const } : {}),
    emergency_verified: emg.verified, signing: kind, counts, files,
  };
  const indexBytes = writeJson(`${out}/index.json`, index);
  writeJson(`${out}/index.json.sig`, { alg: 'Ed25519', signature: signBytes(indexBytes, key), public_key: publicKeyB64(key) });

  if (opts.aggregates === undefined) await pushTargets(rows.map((r) => r.id), existsSync(jlg) ? (JSON.parse(readFileSync(jlg, 'utf8')).segments as { id: string }[]).map((s) => s.id) : []);
  const total = Object.values(files).reduce((n, f) => n + f.bytes, 0) + indexBytes.length;
  log(`bundle ${index.version}: ${live.length} rows in ${Object.keys(counts).length} categories, ${(total / 1024).toFixed(0)} KB, signed (${kind}), emergency numbers ${emg.verified ? 'match their published sources' : 'NOT yet checked'}`);
  log('  ', Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · '));
  return { index, out, rows, services, warnings };
}

const entry = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (entry.endsWith('/src/build.ts')) {
  build({ release: process.argv.includes('--release'), offline: process.argv.includes('--offline') })
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}

export { today };
