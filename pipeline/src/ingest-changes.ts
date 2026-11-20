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
import { existsSync, writeFileSync } from 'node:fs';
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

/**
 * What changed in one file, in words a person can review in a minute: for a CSV, rows added, removed and changed by
 * their first column (the id), with the fields that moved; for anything else, that it changed. The fetch-date
 * columns are left out, as everywhere in this file. Held rows are counted by their `why`.
 */
export function summarize(path: string, before: string | null, after: string | null): string[] {
  if (before === null) return ['new file'];
  if (after === null) return ['file removed'];
  if (!path.endsWith('.csv')) return ['changed (not a table: read the diff)'];
  try {
    const table = (text: string) => {
      const rows = parse(text, { relax_column_count: true }) as string[][];
      const header = rows[0] ?? [];
      const keep = header.flatMap((h, i) => (REFRESH.has(h) ? [] : [i]));
      return { header: keep.map((i) => header[i] ?? ''), rows: new Map(rows.slice(1).map((r) => [r[0] ?? '', keep.map((i) => r[i] ?? '')])) };
    };
    const b = table(before), a = table(after), lines: string[] = [], added: string[] = [], removed: string[] = [], changed: string[] = [];
    const why = a.header.indexOf('why'), whys = new Map<string, number>();
    for (const [id, row] of a.rows) {
      const old = b.rows.get(id);
      if (!old) { added.push(id); if (why >= 0) whys.set(row[why] ?? '', (whys.get(row[why] ?? '') ?? 0) + 1); continue; }
      const moved = row.flatMap((v, i) => (v === old[b.header.indexOf(a.header[i] ?? '')] ? [] : [`${a.header[i]}: "${(old[b.header.indexOf(a.header[i] ?? '')] ?? '').slice(0, 70)}" → "${v.slice(0, 70)}"`]));
      if (moved.length) changed.push(`${id} — ${moved.join('; ')}`);
    }
    for (const id of b.rows.keys()) if (!a.rows.has(id)) removed.push(id);
    lines.push(`${b.rows.size} rows → ${a.rows.size}: ${added.length} added, ${removed.length} removed, ${changed.length} changed`);
    if (JSON.stringify(a.header) !== JSON.stringify(b.header)) lines.push('the columns changed');
    for (const [w, n] of whys) lines.push(`${n} newly held: ${w.slice(0, 160) || '(no reason given)'}`);
    const some = (label: string, list: string[]) => { for (const x of list.slice(0, 5)) lines.push(`${label} ${x}`); if (list.length > 5) lines.push(`${label} … and ${list.length - 5} more`); };
    some('changed', changed); some('removed', removed); if (why < 0) some('added', added);
    return lines;
  } catch {
    return ['changed (could not be read as a table: read the diff)'];
  }
}

/** The pull request's body: every file a person must read, and what moved in it. */
export function reviewBody(root: string, real: string[], day: string): string {
  const git = (...args: string[]) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const parts = real.map((path) => `**\`${path}\`**\n${summarize(path, git('show', `HEAD:${path}`), git('show', `:${path}`)).map((l) => `- ${l}`).join('\n')}`);
  return [
    `Open data, as read on ${day}. ${real.length} file${real.length === 1 ? '' : 's'} changed in a way a person should read; nothing in ${real.length === 1 ? 'it' : 'them'} is published until this is merged.`,
    '',
    'Every file that only moved its fetch dates was committed to `main` tonight as usual, so one waiting change no longer holds the others back. This pull request is rebuilt every night against `main` (one pull request, not one a day): what you see is everything waiting, as of the date above. If the changes go away at the source, it closes itself.',
    '',
    ...parts.flatMap((x) => [x, '']),
  ].join('\n');
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-changes.ts')) {
  // --write <dir>: sort tonight's staged files into the two piles the nightly job acts on (scripts/settle-ingest.sh),
  // and write the review text. refresh.txt goes straight to main; real.txt goes to the one review pull request.
  const w = process.argv.indexOf('--write');
  if (w >= 0) {
    try {
      const out = process.argv[w + 1] ?? '.';
      const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
      const changes = stagedChanges(root);
      const real = changes.filter((c) => !c.refreshOnly).map((c) => c.path), refresh = changes.filter((c) => c.refreshOnly).map((c) => c.path);
      writeFileSync(join(out, 'refresh.txt'), refresh.map((x) => x + '\n').join(''));
      writeFileSync(join(out, 'real.txt'), real.map((x) => x + '\n').join(''));
      writeFileSync(join(out, 'summary.md'), reviewBody(root, real, new Date().toISOString().slice(0, 10)));
      console.log(`${refresh.length} file(s) only moved their fetch dates; ${real.length} for a person to read${real.length ? ': ' + real.join(', ') : ''}`);
      process.exit(0);
    } catch (e) {
      console.log(`Could not sort tonight's files: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  }
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
