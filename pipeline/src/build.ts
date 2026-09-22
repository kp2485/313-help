// data/seed + data/ingested  ->  data/hsds (committed)  +  data/bundle/v1 (never committed)
//   pnpm build:bundle            dev build: unverified emergency numbers warn, dev signing key
//   pnpm build:bundle:release    fails if an emergency number's own page showed a different number
//                                (mismatch_on, from check:emergency), and unless BUNDLE_SIGNING_KEY is set

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Alert, BundleRow } from '@313help/query';
import { p, readCsv, sha256, today, writeJson, type CsvRow } from './util.js';
import { loadSources } from './ingest-arcgis.js';
import { buildAreas, buildIndicators, NEAR_MILES } from './indicators.js';
import { GRID } from './ingest-basemap.js';
import { fromIngested, fromSeed, toHsds, type Normalized } from './normalize.js';
import { retiredPath } from './ingest-ids.js';
import { hsdsSchema, scriptRefusingHosts, validateAlerts, validateEmergency, validateHsds, validateHsdsPrivacy, validateIngestedIds, validateRows, type Issues } from './validate.js';
import { readScriptRefusingHosts } from './seed-io.js';
import { loadSigningKey, publicKeyB64, signBytes } from './sign.js';
import { applyAggregates, fetchAggregates, pushTargets, type Aggregates } from './reports-sync.js';

/** One row of data/ingested/transit/source.json (pipeline/src/ingest-transit.ts). */
interface TransitNote { id: string; kind: 'line' | 'point' | 'both'; lines: number; points: number; bytes: number; name: string; source: { name: string; url: string; page: string; license: string; fetched_at: string }; net?: { file: string; v: number; routes?: number } }

export interface BuildOptions { aggregates?: Aggregates | null; release?: boolean; offline?: boolean; outDir?: string; hsdsDir?: string | null; now?: Date; quiet?: boolean }

export interface BundleIndex {
  schema: 1;
  version: string;
  generated_at: string;
  /** Set only when a person retires the directory on purpose (data/seed/directory.json). No timer ever sets it. */
  retired?: true;
  /** Set only when a person turns photos on (data/seed/directory.json; the Worker has its own PHOTOS_ENABLED). */
  photos?: true;
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
  // An ingested id belongs to one record of the publisher's, for good (DECISIONS 2026-09-22). Checked here, on
  // what is committed, so an id that has moved or been reused can never reach a bundle or a pull request.
  const idIssues: Issues[] = [];
  for (const src of loadSources().filter((s) => s.mode === 'publish')) {
    const ingested = readCsv(p('data/ingested', `${src.id}.csv`));
    idIssues.push(validateIngestedIds(src.id, ingested, readCsv(retiredPath('data/ingested', src.id))));
    parts.push(fromIngested(src, ingested));
  }
  const rows: BundleRow[] = parts.flatMap((x) => x.rows).sort((a, b) => a.id.localeCompare(b.id));
  // Report counts and visitor confirms from the write API (none until it is deployed and configured).
  const agg = opts.aggregates !== undefined ? opts.aggregates : await fetchAggregates();
  if (agg) { const a = applyAggregates(rows, agg); log(`reports: facts applied to ${a.applied} rows${a.frozen ? ' — CIRCUIT BREAKER tripped: closure counts ignored until a steward looks' : ''}`); }
  const emergency: CsvRow[] = readCsv(p('data/seed/emergency.csv'));
  const alerts = JSON.parse(readFileSync(p('data/seed/alerts.json'), 'utf8')) as Alert[];

  // 2. Validate
  const issues = [...idIssues, validateRows(rows, todayStr, scriptRefusingHosts(readScriptRefusingHosts())), validateAlerts(alerts, new Set(rows.map((r) => r.id)))];
  const emg = validateEmergency(emergency, todayStr, !!opts.release);
  issues.push(emg);
  const services = toHsds(parts);
  // The published HSDS copy gets the domestic-violence rule checked on its own terms, not inherited from the rows.
  issues.push(validateHsdsPrivacy(services));
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
  // Transport layers for the Map tab (ingest-transit.ts, Kyle 2026-09-20). Like the street map, every layer is
  // covered by the signature but a phone downloads one only when a person switches that layer on. The small list
  // of what exists (places/transit.json) travels with the bundle so the switcher can be drawn offline.
  const transitDir = p('data/ingested/transit');
  if (existsSync(`${transitDir}/source.json`)) {
    const read = JSON.parse(readFileSync(`${transitDir}/source.json`, 'utf8')) as { layers: TransitNote[]; hubs?: unknown[] };
    const layers = [];
    for (const l of read.layers) {
      const from = `${transitDir}/${l.id}.json`;
      if (!existsSync(from)) continue;
      const name = `map/transit/${l.id}.json`;
      putCompact(name, JSON.parse(readFileSync(from, 'utf8')));
      // The subway style's own file for this layer (docs/MAP-STYLE.md): signed like every file, fetched only when a
      // person picks that style. `net` and `hubs` are extra keys; a client that does not know them ignores them.
      const extra = l.net && existsSync(`${transitDir}/${l.net.file}`) ? `map/transit/${l.net.file}` : '';
      if (extra) putCompact(extra, JSON.parse(readFileSync(`${transitDir}/${l.net!.file}`, 'utf8')));
      layers.push({ id: l.id, kind: l.kind, file: name, lines: l.lines, points: l.points, bytes: files[name]!.bytes, name: l.name, source: l.source, ...(extra ? { net: { file: extra, bytes: files[extra]!.bytes, v: l.net!.v, ...(l.net!.routes ? { routes: l.net!.routes } : {}) } } : {}) });
    }
    if (layers.length) { put('places/transit.json', { layers, ...(read.hubs?.length ? { hubs: read.hubs } : {}) }); counts.transit_layers = layers.length; }
  }
  // Recreation and transit facts. City events are not shipped until a real feed exists (DECISIONS 2026-09-19).
  const parksFile = p('data/ingested/city_parks.json');
  if (existsSync(parksFile)) { const d = JSON.parse(readFileSync(parksFile, 'utf8')); counts.parks = d.parks.length; put('places/parks.json', d); }
  // ZIP center points for "Type a ZIP" (docs/05): about 1 KB, and the typed ZIP never leaves the phone.
  // Neighborhood indicators (docs/13): public City data joined with our own listings. Like the map, the file is
  // under the signature but only downloaded when someone opens a neighborhood page. It is not in the crisis path.
  const hoodsFile = p('data/ingested/neighborhoods.json'), statsFile = p('data/ingested/city_stats.json');
  if (existsSync(hoodsFile) && existsSync(statsFile)) {
    const h = JSON.parse(readFileSync(hoodsFile, 'utf8')), st = JSON.parse(readFileSync(statsFile, 'utf8'));
    // Stores that take a Bridge card and bus stops (City data): counted near each neighborhood, never shipped as points.
    const pointsFile = p('data/ingested/city_points.json'), pts = existsSync(pointsFile) ? JSON.parse(readFileSync(pointsFile, 'utf8')) : null;
    // "Safe streets" (docs/13, ingest-crashes.ts): counts of crashes involving people walking or biking, over
    // the years that file names. Only the multi-year totals go in the bundle; the yearly history stays in git.
    const crashFile = p('data/ingested/crashes.json'), cr = existsSync(crashFile) ? JSON.parse(readFileSync(crashFile, 'utf8')) : null;
    const ind = buildIndicators({
      hoods: h.neighborhoods, rows: live, stats: st,
      parks: existsSync(parksFile) ? JSON.parse(readFileSync(parksFile, 'utf8')).parks : [],
      segments: existsSync(jlg) ? JSON.parse(readFileSync(jlg, 'utf8')).segments : [],
      ...(pts ? { snap: pts.snap, busStops: pts.bus_stops } : {}),
      ...(cr ? { crashes: cr.neighborhoods } : {}),
    });
    // The crash layer's licence makes its notice a condition of use wherever the data appears, so the notice
    // travels with the numbers into the bundle and no app has to hard-code it (pipeline/src/ingest-crashes.ts).
    const crashSource = cr ? { crashes: { name: cr.source.name, url: cr.source.page, last_edited: cr.source.last_edited, license: cr.source.license, license_url: cr.source.license_url, notice: cr.source.license_notice } } : {};
    // City pages for the four cities (docs/13, DECISIONS 2026-09-22), added to the same file so "Find my area"
    // needs one fetch and one signature. ADDITIVE: `neighborhoods`, `sources` and `city` are untouched byte for
    // byte, so an older client — and the iPhone and Android apps until they mirror this — keeps printing
    // exactly what it printed. A client that knows nothing of `areas` simply never opens one.
    const citiesFile = p('data/ingested/cities.json'), ct = existsSync(citiesFile) ? JSON.parse(readFileSync(citiesFile, 'utf8')) : null;
    const areaDoc = ct ? buildAreas({
      cities: ct.cities, sources: { ...ct.sources, detroit_parks: existsSync(parksFile) ? { ...JSON.parse(readFileSync(parksFile, 'utf8')).source, license: 'Unstated (the City portal publishes a disclaimer only)' } : undefined },
      rows: live,
      detroitParks: existsSync(parksFile) ? JSON.parse(readFileSync(parksFile, 'utf8')).parks : [],
      ...(cr ? { crashes: cr.city_by_name, crashSource: { name: cr.source.name, url: cr.source.page, license: cr.source.license, license_url: cr.source.license_url, notice: cr.source.license_notice, last_edited: cr.source.last_edited, records_from: cr.source.records_from } } : {}),
    }) : null;
    const doc = { sources: { neighborhoods: h.source, ...st.sources, ...(pts?.sources ?? {}), ...crashSource }, stats_fetched_at: st.fetched_at, first_year: st.first_year, partial_year: st.partial_year, near_miles: NEAR_MILES, origin: [GRID.lon0, GRID.lat0], city: st.city, city_parcels: st.city_parcels, issue_types: st.issue_types,
      ...(cr ? { crash_years: cr.years, city_crashes: cr.city.window, ...(cr.city.years ? { city_crashes_by_year: cr.city.years } : {}), crash_records_from: cr.source.records_from } : {}),
      ...(st.current ? { city_now: st.current.city, fire_types: st.fire_types, roads_years: st.roads_years, vacant_period: st.vacant_period } : {}), ...ind,
      ...(areaDoc ? { cities: areaDoc.cities, areas: areaDoc.areas, area_sources: areaDoc.area_sources, paser: ct.paser, pavement_year: ct.pavement_year, permit_years: ct.permit_years } : {}) };
    putCompact('indicators/neighborhoods.json', doc);
    counts.neighborhoods = ind.neighborhoods.length;
    if (areaDoc) counts.city_pages = areaDoc.areas.length;
    // Committed on publish, without the outlines, so the history of every number is in git (docs/13).
    if (opts.hsdsDir !== null) writeJson(p('data/indicators/neighborhoods.json'), { ...doc, neighborhoods: ind.neighborhoods.map(({ rings: _rings, ...n }) => n), ...(areaDoc ? { areas: areaDoc.areas.map(({ rings: _rings, ...a }) => a) } : {}) });
  }
  const zipsFile = p('data/ingested/city_zips.json');
  if (existsSync(zipsFile)) put('places/zips.json', JSON.parse(readFileSync(zipsFile, 'utf8')));
  put('alerts.json', alerts.filter((a) => a.status === 'published' && Date.parse(a.ends_at) > now.getTime()));
  put('emergency.json', emergency.sort((a, b) => Number(a.sort) - Number(b.sort))
    .map((r) => ({ id: r.id, label: r.label, number: r.number, ...(r.sms ? { sms: r.sms } : {}), hardcoded: r.hardcoded === 'yes' })));

  // Retiring the directory is a person's decision, committed to git (docs/OPERATIONS "How to retire the directory").
  const directoryFile = p('data/seed/directory.json');
  const directory = existsSync(directoryFile) ? JSON.parse(readFileSync(directoryFile, 'utf8')) : {};
  const retired = directory.retired === true, photos = directory.photos === true;
  const { key, kind } = loadSigningKey(!!opts.release);
  const index: BundleIndex = {
    // The content hash makes every distinct bundle a distinct version, even two builds in the same minute.
    schema: 1, version: `${gitSha()}-${now.toISOString().replace(/[-:]/g, '').slice(0, 13)}-${sha256(JSON.stringify(files)).slice(0, 8)}`,
    generated_at: now.toISOString().slice(0, 16) + 'Z',
    ...(retired ? { retired: true as const } : {}),
    ...(photos ? { photos: true as const } : {}),
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
