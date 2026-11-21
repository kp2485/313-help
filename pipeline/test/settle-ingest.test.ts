// scripts/settle-ingest.sh, driven end to end against a throwaway repository and a throwaway "GitHub" (a bare
// remote, and a stub `gh` that records what it was asked). What these hold (DECISIONS 2026-11-20): one waiting
// change never holds another source's dates back, there is one review pull request and not one a day, a change
// read monthly survives the nights in between, and a real change still reaches main only when a person merges it.
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { summarize } from '../src/ingest-changes.js';

const root = join(__dirname, '../..');
const BOXES = 'data/ingested/boxes.csv', HELD = 'data/staging/county.csv', MAP = 'data/ingested/map.json';
const boxes = (phone: string, fetched: string) => `sal_id,phone,source_last_edited,fetched_at\nsal_hr_1,${phone},2026-09-14,${fetched}\n`;
const held = (n: number, fetched: string) => 'sal_id,name,fetched_at,why\n' + Array.from({ length: n }, (_, i) => `sal_ocn_${i},Box ${i},${fetched},layer too old to publish\n`).join('');

describe('the nightly settle', () => {
  let tmp = '';
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = ''; });

  function world() {
    tmp = mkdtempSync(join(tmpdir(), 'settle-'));
    const remote = join(tmp, 'remote.git'), work = join(tmp, 'work'), bin = join(tmp, 'bin'), ghLog = join(tmp, 'gh.log'), prFile = join(tmp, 'pr-open');
    const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    mkdirSync(bin);
    // `gh`, as far as this script uses it: is the pull request open, create, edit, close. The state is one file.
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash
echo "$*" >> "${ghLog}"
case "$1 $2" in
  "pr list") [ -f "${prFile}" ] && echo 7 || true ;;
  "pr create") touch "${prFile}" ;;
  "pr close") rm -f "${prFile}"; git push -q origin --delete ingest/pending ;;
esac
`);
    chmodSync(join(bin, 'gh'), 0o755);
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    execFileSync('git', ['clone', '-q', remote, work], { stdio: 'pipe' });
    git(work, 'config', 'user.email', 'test@example.invalid'); git(work, 'config', 'user.name', 'test');
    mkdirSync(join(work, 'data/ingested'), { recursive: true }); mkdirSync(join(work, 'data/staging'), { recursive: true });
    writeFileSync(join(work, BOXES), boxes('(313) 866-2562', '2026-11-03'));
    writeFileSync(join(work, HELD), held(2, '2026-11-03'));
    writeFileSync(join(work, MAP), JSON.stringify({ fetched_at: '2026-10-01', streets: 10 }));
    git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'start'); git(work, 'push', '-q', '-u', 'origin', 'main');
    const run = (cmd: 'overlay' | 'settle') => {
      const r = spawnSync(join(root, 'scripts/settle-ingest.sh'), [cmd], { cwd: work, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stdout}\n${r.stderr}`);
      return r.stdout;
    };
    /** One night: a fresh look at main, what is waiting carried in, the "ingest" (the files given), then settle. */
    const night = (files: Record<string, string>) => {
      git(work, 'checkout', '-q', 'main'); git(work, 'pull', '-q');
      run('overlay');
      for (const [f, text] of Object.entries(files)) writeFileSync(join(work, f), text);
      return run('settle');
    };
    const onMain = (f: string) => git(work, 'show', `origin/main:${f}`);
    const waiting = (f: string) => { git(work, 'fetch', '-q', 'origin'); return git(work, 'show', `origin/ingest/pending:${f}`); };
    const gh = () => (existsSync(ghLog) ? readFileSync(ghLog, 'utf8') : '');
    return { work, git, night, onMain, waiting, gh, prOpen: () => existsSync(prFile) };
  }

  it('one waiting change no longer holds the other sources back — the seventeen nights of November 2026', () => {
    const w = world();
    // The County layer ages out: 118 rows are held. The DHD boxes only moved their fetch date.
    w.night({ [HELD]: held(120, '2026-11-04'), [BOXES]: boxes('(313) 866-2562', '2026-11-04') });
    expect(w.onMain(BOXES)).toContain('2026-11-04');                       // the refresh reached main anyway
    expect(w.onMain(HELD)).toBe(held(2, '2026-11-03').trim());             // the held rows did not
    expect(w.waiting(HELD)).toContain('sal_ocn_119');
    expect(w.prOpen()).toBe(true);
    expect(w.gh()).toContain('workflow run ci.yml --ref ingest/pending');    // its tests are asked for (2026-11-21)
  });

  it('is one pull request, updated each night, not one a day', () => {
    const w = world();
    w.night({ [HELD]: held(120, '2026-11-04') });
    w.night({ [HELD]: held(120, '2026-11-05'), [BOXES]: boxes('(313) 866-2562', '2026-11-05') });
    w.night({ [HELD]: held(121, '2026-11-06'), [BOXES]: boxes('(313) 866-2562', '2026-11-06') });
    expect(w.gh().match(/^pr create/gm)).toHaveLength(1);
    expect(w.gh().match(/^pr edit 7/gm)).toHaveLength(2);
    expect(w.waiting(HELD)).toContain('sal_ocn_120');                      // the third night's reading
    expect(w.onMain(BOXES)).toContain('2026-11-06');
    // The branch is main plus exactly the waiting files: it never drifts behind main.
    expect(w.git(w.work, 'diff', '--name-only', 'origin/main', 'origin/ingest/pending')).toBe(HELD);
  });

  it('a changed phone number reaches main only when a person merges it', () => {
    const w = world();
    w.night({ [BOXES]: boxes('(313) 866-0000', '2026-11-04') });
    expect(w.onMain(BOXES)).toContain('(313) 866-2562');
    expect(w.waiting(BOXES)).toContain('(313) 866-0000');
    // A person merges; the next night there is nothing waiting and only a date to commit.
    w.git(w.work, 'checkout', '-q', 'main'); w.git(w.work, 'merge', '-q', '--no-ff', '-m', 'merge', 'origin/ingest/pending'); w.git(w.work, 'push', '-q');
    w.night({ [BOXES]: boxes('(313) 866-0000', '2026-11-05') });
    expect(w.onMain(BOXES)).toBe(boxes('(313) 866-0000', '2026-11-05').trim());
    expect(w.gh()).toContain('pr close 7');
    expect(w.prOpen()).toBe(false);
  });

  it('a change read monthly is still waiting on the nights in between', () => {
    const w = world();
    w.night({ [MAP]: JSON.stringify({ fetched_at: '2026-11-01', streets: 11 }) });           // the 1st: the street map changed
    w.night({ [BOXES]: boxes('(313) 866-2562', '2026-11-02') });                              // the 2nd: the map is not re-read
    expect(w.waiting(MAP)).toContain('"streets":11');
    expect(w.onMain(MAP)).toContain('"streets":10');
    expect(w.onMain(BOXES)).toContain('2026-11-02');
  });

  it('closing the pull request is a real no: nothing is carried from a closed one', () => {
    const w = world();
    w.night({ [MAP]: JSON.stringify({ fetched_at: '2026-11-01', streets: 11 }) });
    rmSync(join(w.work, '../pr-open'));                                                       // a person closes it, branch left behind
    const out = w.night({ [BOXES]: boxes('(313) 866-2562', '2026-11-02') });
    expect(out).not.toContain('for a person to read: data/ingested/map.json');
    expect(w.gh().match(/^pr create/gm)).toHaveLength(1);                                     // and none is opened for it again
  });

  it('a file main has changed since is never overwritten by the waiting copy', () => {
    const w = world();
    w.night({ [BOXES]: boxes('(313) 866-0000', '2026-11-04') });
    // A person fixes the same file on main by hand.
    w.git(w.work, 'checkout', '-q', 'main'); writeFileSync(join(w.work, BOXES), boxes('(313) 866-1111', '2026-11-04'));
    w.git(w.work, 'commit', '-q', '-am', 'by hand'); w.git(w.work, 'push', '-q');
    w.git(w.work, 'checkout', '-q', 'main'); w.git(w.work, 'pull', '-q');
    const out = spawnSync(join(root, 'scripts/settle-ingest.sh'), ['overlay'], { cwd: w.work, encoding: 'utf8', env: { ...process.env, PATH: `${join(w.work, '../bin')}:${process.env.PATH}` } }).stdout;
    expect(out).toContain("main's copy stands");
    expect(readFileSync(join(w.work, BOXES), 'utf8')).toContain('(313) 866-1111');
  });
});

describe('the review text', () => {
  it('says what moved in a table, by id and field, without the fetch dates', () => {
    const before = 'sal_id,name,phone,fetched_at\nsal_a,Citgo,(313) 866-2562,2026-11-03\nsal_b,Amoco,(313) 555-0100,2026-11-03\n';
    const after = 'sal_id,name,phone,fetched_at\nsal_a,Citgo,(313) 866-0000,2026-11-04\nsal_c,Shell,(313) 555-0199,2026-11-04\n';
    const lines = summarize('data/ingested/x.csv', before, after);
    expect(lines[0]).toBe('2 rows → 2: 1 added, 1 removed, 1 changed');
    expect(lines).toContain('changed sal_a — phone: "(313) 866-2562" → "(313) 866-0000"');
    expect(lines).toContain('removed sal_b');
    expect(lines).toContain('added sal_c');
    expect(lines.join('\n')).not.toContain('2026-11-04');
  });
  it('counts newly held rows by their reason instead of listing 118 of them', () => {
    expect(summarize('data/staging/county.csv', held(2, '2026-11-03'), held(120, '2026-11-04'))).toEqual(['2 rows → 120: 118 added, 0 removed, 0 changed', '118 newly held: layer too old to publish']);
  });
});

describe('the age rule: an old layer may be re-dated, never changed, without a person (DECISIONS 2026-11-20)', () => {
  let tmp = '';
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = ''; });
  it('a re-read that says what is published is the same; a changed phone, a new row or no published file is not', async () => {
    const { sameAsPublished } = await import('../src/ingest-changes.js');
    tmp = mkdtempSync(join(tmpdir(), 'age-'));
    const file = join(tmp, 'county.csv');
    expect(sameAsPublished(file, boxes('(313) 866-2562', '2026-11-20'))).toBe(false);          // never published: a person first
    writeFileSync(file, boxes('(313) 866-2562', '2026-11-03'));
    expect(sameAsPublished(file, boxes('(313) 866-2562', '2026-11-20'))).toBe(true);
    expect(sameAsPublished(file, boxes('(313) 866-0000', '2026-11-20'))).toBe(false);
    expect(sameAsPublished(file, boxes('(313) 866-2562', '2026-11-20') + 'sal_hr_2,(313) 555-0100,2026-09-14,2026-11-20\n')).toBe(false);
  });
});

describe('one network blip does not cost a night', () => {
  const res = (status: number) => new Response('{}', { status });
  it('a thrown fetch or a 5xx is tried again, and the third answer stands', async () => {
    const { patiently } = await import('../src/reports-sync.js');
    let n = 0;
    expect((await patiently(async () => { if (++n === 1) throw new Error('fetch failed'); return n === 2 ? res(503) : res(200); }, [1, 1])).status).toBe(200);
    expect(n).toBe(3);
    n = 0;
    expect((await patiently(async () => { n++; return res(503); }, [1, 1])).status).toBe(503);
    expect(n).toBe(3);
    await expect(patiently(async () => { throw new Error('fetch failed'); }, [1, 1])).rejects.toThrow('fetch failed');
  });
  it('a refusal is not retried: waiting does not fix a 403', async () => {
    const { patiently } = await import('../src/reports-sync.js');
    let n = 0;
    expect((await patiently(async () => { n++; return res(403); }, [1, 1])).status).toBe(403);
    expect(n).toBe(1);
  });
});

describe('a passing error from the City\'s server does not lose the month\'s neighborhood numbers', () => {
  it('asks again after an error answer or a dropped connection, and gives up only when it stays', async () => {
    const { getJson } = await import('../src/ingest-neighborhoods.js');
    let n = 0;
    const flaky = async () => { n++; if (n === 1) return { error: { code: 400, details: ['Unable to perform query.'] } }; if (n === 2) throw new Error('socket hang up'); return { features: [1] }; };
    expect(await getJson('https://example.invalid/q', flaky, [1, 1, 1])).toEqual({ features: [1] });
    expect(n).toBe(3);
    n = 0;
    await expect(getJson('https://example.invalid/q', async () => { n++; return { error: { code: 400 } }; }, [1, 1, 1])).rejects.toThrow('{"code":400}');
    expect(n).toBe(4);
  });
});
