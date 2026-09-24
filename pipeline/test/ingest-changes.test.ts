// The nightly publish commits a re-read of open data without review only when nothing moved but the fetch dates
// (Kyle, 2026-09-24; DECISIONS). Everything else still waits for a steward. These tests hold both halves: what
// counts as "only the dates", and that the command the workflow runs says so with its exit code.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { onlyRefreshed, stagedChanges } from '../src/ingest-changes.js';

const root = join(__dirname, '../..');

describe('what counts as only a refresh', () => {
  const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\n') + '\n';
  const HEAD = ['sal_id', 'name', 'phone', 'extra', 'source_last_edited', 'fetched_at'];
  const row = (phone = '(313) 866-2562', edited = '2026-09-14', fetched = '2026-09-19') => ['sal_hr_1', 'Citgo', `"${phone}"`, 'Box_Location=Outdoors', edited, fetched];

  it('a CSV whose fetch-date columns moved, and nothing else', () => {
    expect(onlyRefreshed('a.csv', csv([HEAD, row()]), csv([HEAD, row(undefined, '2026-09-21', '2026-09-23')]))).toBe(true);
  });

  it('a changed phone, a new row or a removed row is not', () => {
    expect(onlyRefreshed('a.csv', csv([HEAD, row()]), csv([HEAD, row('(313) 866-2563', '2026-09-21', '2026-09-23')]))).toBe(false);
    expect(onlyRefreshed('a.csv', csv([HEAD, row()]), csv([HEAD, row(), ['sal_hr_2', 'Amoco', '"x"', '', '2026-09-21', '2026-09-23']]))).toBe(false);
    expect(onlyRefreshed('a.csv', csv([HEAD, row(), row()]), csv([HEAD, row()]))).toBe(false);
  });

  it('the real DHD file with only its dates rewritten is a refresh; with one phone changed it is not', () => {
    const real = readFileSync(join(root, 'data/ingested/dhd_harm_reduction.csv'), 'utf8');
    const redated = real.replace(/,(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/gm, ',$1,2031-01-01');
    expect(redated).not.toBe(real);
    expect(onlyRefreshed('data/ingested/dhd_harm_reduction.csv', real, redated)).toBe(true);
    const phone = real.match(/\(313\) \d{3}-\d{4}/)![0];
    expect(onlyRefreshed('data/ingested/dhd_harm_reduction.csv', real, redated.replace(phone, '(313) 000-0000'))).toBe(false);
  });

  it('JSON: fetched_at and last_edited are ignored at any depth; any other key, a real date included, is not', () => {
    const doc = (o: Record<string, unknown> = {}) => JSON.stringify({ fetched_at: '2026-09-19', last_edited: '2026-09-13', features: [{ name: 'Joe Louis Greenway', fetched_at: '2026-09-19', open_date: '2026-10-01', ...o }] }, null, 2);
    const later = doc().replace(/2026-09-19/g, '2026-09-23').replace('2026-09-13', '2026-09-20');
    expect(onlyRefreshed('jlg.json', doc(), later)).toBe(true);
    expect(onlyRefreshed('jlg.json', doc(), doc({ open_date: '2026-11-01' }))).toBe(false);   // a real date is data
    expect(onlyRefreshed('jlg.json', doc(), doc({ name: 'Joe Louis Greenway Phase 2' }))).toBe(false);
  });

  it('a file added, removed, unreadable, or of a kind it does not know goes to a person', () => {
    expect(onlyRefreshed('a.csv', null, 'x\n')).toBe(false);
    expect(onlyRefreshed('a.csv', 'x\n', null)).toBe(false);
    expect(onlyRefreshed('a.json', '{"a":1}', '{"a":')).toBe(false);
    expect(onlyRefreshed('tiles.bin', 'aaa', 'aab')).toBe(false);
    expect(onlyRefreshed('tiles.bin', 'aaa', 'aaa')).toBe(true);
  });
});

describe('the command the nightly publish runs', () => {
  let dir = '';
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

  /** A throwaway repository with one ingested CSV committed, as the publish job's checkout has. */
  function repo(): string {
    dir = mkdtempSync(join(tmpdir(), 'ingest-changes-'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
    mkdirSync(join(dir, 'data/ingested'), { recursive: true });
    writeFileSync(join(dir, 'data/ingested/boxes.csv'), 'sal_id,phone,source_last_edited,fetched_at\nsal_hr_1,(313) 866-2562,2026-09-14,2026-09-19\n');
    git('add', '.'); git('commit', '-q', '-m', 'start');
    return dir;
  }
  const stage = (d: string, text: string) => {
    writeFileSync(join(d, 'data/ingested/boxes.csv'), text);
    execFileSync('git', ['add', 'data/ingested'], { cwd: d });
  };
  const run = (d: string) => spawnSync(join(root, 'pipeline/node_modules/.bin/tsx'), [join(root, 'pipeline/src/ingest-changes.ts')], { cwd: d, encoding: 'utf8' });

  it('exits 0 when only the fetch dates moved, so the job commits straight to main', () => {
    const d = repo();
    stage(d, 'sal_id,phone,source_last_edited,fetched_at\nsal_hr_1,(313) 866-2562,2026-09-21,2026-09-23\n');
    expect(stagedChanges(d)).toEqual([{ path: 'data/ingested/boxes.csv', refreshOnly: true }]);
    const r = run(d);
    expect(r.stdout).toContain('Only the fetch dates changed');
    expect(r.status).toBe(0);
  });

  it('exits 1 when anything else changed, so the job opens a review branch', () => {
    const d = repo();
    stage(d, 'sal_id,phone,source_last_edited,fetched_at\nsal_hr_1,(313) 866-0000,2026-09-21,2026-09-23\n');
    const r = run(d);
    expect(r.stdout).toContain('for a person to read: data/ingested/boxes.csv');
    expect(r.status).toBe(1);
  });

  it('exits 1 when nothing is staged, rather than committing an empty refresh', () => {
    expect(run(repo()).status).toBe(1);
  });
});
