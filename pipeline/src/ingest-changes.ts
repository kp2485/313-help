// Did the nightly re-read of open data change anything a person needs to read, or only the dates it was read on?
//
// Every night `.github/workflows/publish.yml` re-reads the City's layers into data/ingested and data/staging. The
// fetch dates move every time, so until 2026-09-24 every night looked like "a source changed" and made a review
// branch with nothing in it but dates. Kyle, 2026-09-24: date-only refreshes are committed without review
// (DECISIONS). Anything else — a name, a phone, an address, a coordinate, hours, a row added or gone, a file this
// does not know how to read — still waits for a steward, as before.
//
// The fields ignored are exactly these, by name, and no other date: an event's date or a program's end date is
// data, and changes to it are reviewed.
//
//   node:  pnpm --filter @313help/pipeline ingest:refresh-only
//   exit 0: only fetch dates changed in the staged files; exit 1: something else changed, or anything failed.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

/** The columns and keys that record when we read a source, not what the source says. */
export const REFRESH_FIELDS = ['fetched_at', 'source_last_edited', 'last_edited'] as const;
const REFRESH = new Set<string>(REFRESH_FIELDS);

function csvWithoutRefresh(text: string): string[][] {
  const rows = parse(text, { relax_column_count: true }) as string[][];
  const header = rows[0] ?? [];
  const drop = new Set(header.flatMap((h, i) => (REFRESH.has(h) ? [i] : [])));
  return rows.map((r) => r.filter((_, i) => !drop.has(i)));
}

function jsonWithoutRefresh(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonWithoutRefresh);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !REFRESH.has(k)).map(([k, x]) => [k, jsonWithoutRefresh(x)]));
  }
  return v;
}

/**
 * True when `after` differs from `before` in the fetch-date fields only. A file that was added or removed is a
 * change (null on either side), and so is one that cannot be parsed: a doubt goes to a person.
 */
export function onlyRefreshed(path: string, before: string | null, after: string | null): boolean {
  if (before === null || after === null) return false;
  if (before === after) return true;
  try {
    if (path.endsWith('.csv')) return JSON.stringify(csvWithoutRefresh(before)) === JSON.stringify(csvWithoutRefresh(after));
    if (path.endsWith('.json') || path.endsWith('.geojson')) {
      return JSON.stringify(jsonWithoutRefresh(JSON.parse(before))) === JSON.stringify(jsonWithoutRefresh(JSON.parse(after)));
    }
  } catch {
    return false;
  }
  return false;
}

/** The staged files under the two ingest folders, and whether each is a date-only refresh. */
export function stagedChanges(root: string): { path: string; refreshOnly: boolean }[] {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const paths = git('diff', '--cached', '--no-renames', '--name-only', '--', 'data/ingested', 'data/staging').split('\n').filter(Boolean);
  return paths.map((path) => {
    let before: string | null = null;
    try { before = git('show', `HEAD:${path}`); } catch { before = null; }
    const file = join(root, path);
    let after: string | null = null;
    try { after = existsSync(file) ? git('show', `:${path}`) : null; } catch { after = null; }
    return { path, refreshOnly: onlyRefreshed(path, before, after) };
  });
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-changes.ts')) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const changes = stagedChanges(root);
    const real = changes.filter((c) => !c.refreshOnly);
    if (!changes.length) { console.log('Nothing staged under data/ingested or data/staging.'); process.exit(1); }
    if (real.length) {
      console.log(`Changed beyond the fetch dates, for a person to read: ${real.map((c) => c.path).join(', ')}`);
      process.exit(1);
    }
    console.log(`Only the fetch dates changed: ${changes.map((c) => c.path).join(', ')}`);
    process.exit(0);
  } catch (e) {
    console.log(`Could not tell, so it goes to review: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
