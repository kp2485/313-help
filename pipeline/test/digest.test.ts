// The weekly review and the daily watch (pipeline/src/digest.ts, scripts/digest-issues.sh; DECISIONS 2026-11-21).
// What these hold: the alarm rings for the failures that froze the site in November 2026 and not for one bad night;
// the review lists what a person must do as checkboxes and says "nothing" when there is nothing; nothing from the
// steward queue but a number reaches a public issue; and there is one alarm issue and one review issue, not a pile.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEmergency } from '../src/validate.js';
import { readCsv } from '../src/util.js';
import { alarm, alertsEnding, digestBody, emergencyDue, prFact, queueCounts, sourcesAging, taskKinds, type Facts, type Run } from '../src/digest.js';

const root = join(__dirname, '../..');
const NOW = '2026-11-23T13:41:00Z';
const run = (daysAgo: number, conclusion: string | null): Run => ({ conclusion, createdAt: new Date(Date.parse(NOW) - daysAgo * 86400000 - 6 * 3600000).toISOString(), url: `https://example.invalid/run/${daysAgo}` });
const week = (bad: number[] = []) => [0, 1, 2, 3, 4, 5, 6].map((d) => run(d, bad.includes(d) ? 'failure' : 'success'));
const fresh = { generated_at: '2026-11-23T07:40Z', emergency_verified: true };
const quiet: Facts = {
  day: '2026-11-23', now: NOW, repo: 'someone/313-help', site: 'https://example.invalid', runs: week(), bundle: fresh, pr: null,
  queue: { reports: 0, closed: 0, proposals: 0, ownerSaidOpen: 0, tasks: { changed: 0, gone: 0, refusing: 0, unreachable: 0 } },
  emergency: [], alerts: [], sources: [],
};

describe('the daily watch', () => {
  it('is silent on a healthy week, and after one bad night that recovered', () => {
    expect(alarm(quiet)).toEqual([]);
    expect(alarm({ ...quiet, runs: week([1]) })).toEqual([]);
    expect(alarm({ ...quiet, runs: week([0]) })).toEqual([]);              // last night failed; tonight may recover
  });
  it('rings when two nights in a row failed, ignoring a run still going', () => {
    expect(alarm({ ...quiet, runs: week([0, 1]) })[0]).toContain('last two nightly runs');
    expect(alarm({ ...quiet, runs: [{ ...run(0, null), status: 'in_progress' }, ...week([0, 1])] })).toHaveLength(1);
  });
  it('rings when the schedule stopped, and when the site serves old data though runs look green', () => {
    expect(alarm({ ...quiet, runs: week().slice(3) }).join(' ')).toContain('No nightly run has started');
    expect(alarm({ ...quiet, bundle: { ...fresh, generated_at: '2026-11-20T07:40Z' } }).join(' ')).toContain('more than 48 hours ago');
  });
  it('does not ring because the site could not be read once', () => {
    expect(alarm({ ...quiet, bundle: null })).toEqual([]);
  });
});

describe('the weekly review', () => {
  it('says there is nothing to do when there is nothing', () => {
    const body = digestBody(quiet);
    expect(body).toContain('Nothing. Everything below ran by itself.');
    expect(body).not.toContain('- [ ]');
    expect(body).toContain('All 7 publish runs this week succeeded.');
  });
  it('lists each job as a checkbox with the link that does it', () => {
    const body = digestBody({
      ...quiet, runs: week([3]),
      pr: { number: 91, url: 'https://example.invalid/pull/91', tests: 'passed', testsUrl: 'https://example.invalid/ci/1' },
      queue: { reports: 4, closed: 1, proposals: 2, ownerSaidOpen: 0, tasks: { changed: 12, gone: 3, refusing: 100, unreachable: 5 } },
      emergency: [{ label: 'Detroit police, non-emergency', url: 'https://example.invalid/police', state: 'due', days: 3 }],
      alerts: [{ title: 'Warming centers are open', ends: '2026-11-26T12:00:00Z' }],
    });
    const boxes = body.split('\n').filter((l) => l.startsWith('- [ ]'));
    expect(boxes).toHaveLength(10);
    expect(body).toContain('merge or close #91. The tests passed against it (https://example.invalid/ci/1).');
    expect(body).toContain('12 listings whose own pages no longer show the phone or street we list');
    expect(body).toContain('1 listing was reported closed or moved by two or more phones');
    expect(body).toContain('https://example.invalid/admin/');
    expect(body).toContain('Detroit police, non-emergency: https://example.invalid/police (due in 3 days)');
    expect(body).toContain('1 publish run of 7 failed this week and the next one recovered');
    // Sites that refuse scripts come after the pages that really changed, and unreachable pages are not a job at all.
    expect(boxes.findIndex((l) => l.includes('no longer show'))).toBeLessThan(boxes.findIndex((l) => l.includes('turns scripts away')));
    expect(boxes.join('\n')).not.toContain('could not be reached');
  });
  it('puts a stopped publish and a mismatched emergency number first, and warns off merging data whose tests failed', () => {
    const body = digestBody({
      ...quiet, runs: week([0, 1]),
      pr: { number: 91, url: 'u', tests: 'failed' },
      emergency: [{ label: 'Shelter tonight', url: 'https://example.invalid/shelter', state: 'mismatch', days: 2 }],
    });
    const boxes = body.split('\n').filter((l) => l.startsWith('- [ ]'));
    expect(boxes[0]).toContain('The nightly publish needs you');
    expect(boxes[1]).toContain('Shelter tonight');
    expect(body).toContain('do not merge until that is understood');
  });
  it('never calls an unread queue empty', () => {
    const body = digestBody({ ...quiet, queue: null });
    expect(body).toContain('The steward queue could not be read');
    expect(body).not.toContain('The steward queue is empty');
  });
});

describe('what the review is built from', () => {
  it('sorts re-check tasks by what a person can do about them', () => {
    expect(taskKinds([
      { result: 'missing', detail: 'phone (313) 555-0100' }, { result: 'unreadable', detail: 'HTTP 404' }, { result: 'unreadable', detail: 'HTTP 403' },
      { result: 'unreadable', detail: 'bot protection' }, { result: 'unreadable', detail: 'page has almost no text (79 characters)' },
      { result: 'unreadable', detail: 'HTTP 500' }, { result: 'unreadable', detail: 'fetch failed: fetch failed' },
    ])).toEqual({ changed: 1, gone: 1, refusing: 3, unreachable: 2 });
  });
  it('takes counts from the steward queue and nothing else', async () => {
    const secret = 'the pantry on Elm closed, call Maria at 313-555-0100';
    const answers: Record<string, unknown> = {
      '/v1/steward/queue': { reports: [{ id: 'rpt_1', target_id: 'sal_private_place', detail: secret }, { id: 'rpt_2', detail: secret }], closed_phones: { sal_a: 3, sal_b: 1 }, proposals: [{ name: secret }], owner_said_open: { sal_a: '2026-11-22T10:00Z' } },
      '/v1/steward/tasks': { tasks: [{ target_id: 'sal_private_place', result: 'missing', detail: 'phone (313) 555-0100' }, { target_id: 'sal_c', result: 'unreadable', detail: 'HTTP 403' }] },
    };
    const asked: string[] = [];
    const counts = await queueCounts({ REPORTS_API: 'https://api.invalid', ACCESS_CLIENT_ID: 'id', ACCESS_CLIENT_SECRET: 's' }, async (url) => { asked.push(url); return new Response(JSON.stringify(answers[new URL(url).pathname])); });
    expect(counts).toEqual({ reports: 2, closed: 1, proposals: 1, ownerSaidOpen: 1, tasks: { changed: 1, gone: 0, refusing: 1, unreachable: 0 } });
    const body = digestBody({ ...quiet, queue: counts });
    for (const leak of ['Maria', '555-0100', 'sal_private_place', 'sal_a', 'rpt_1', 'Elm']) expect(body).not.toContain(leak);
    expect(asked).toHaveLength(2);
  });
  it('reports an unconfigured or failing queue as unread, never as empty', async () => {
    expect(await queueCounts({})).toBeNull();
    expect(await queueCounts({ REPORTS_API: 'https://api.invalid' }, async () => new Response('no', { status: 403 }))).toBeNull();
    expect(await queueCounts({ REPORTS_API: 'https://api.invalid' }, async () => { throw new Error('down'); }, [])).toBeNull();
  });
  it('finds the emergency numbers a person must read: a mismatch, or a check 24 or more days old', () => {
    const row = (id: string, o: Record<string, string>) => ({ id, label: id, number: '313-555-0100', hardcoded: 'no', source_url: `https://example.invalid/${id}`, verified_by_call_on: '', verified_published_on: '', mismatch_on: '', ...o });
    const due = emergencyDue([
      row('emg_911', { hardcoded: 'yes' }), row('fresh', { verified_published_on: '2026-11-20' }), row('soon', { verified_published_on: '2026-10-28' }),
      row('late', { verified_published_on: '2026-10-01' }), row('never', {}), row('wrong', { verified_published_on: '2026-11-22', mismatch_on: '2026-11-21' }),
      row('called', { mismatch_on: '2026-11-01', verified_by_call_on: '2026-11-20' }),
    ], '2026-11-23');
    expect(due.map((e) => `${e.label}:${e.state}`)).toEqual(['soon:due', 'late:overdue', 'never:overdue', 'wrong:mismatch']);
    expect(due[0]!.days).toBe(4);
  });
  it('holds the same line the build holds, on the real emergency file, for any day', () => {
    // Whenever the build would say emergency_verified is false, the review names at least one number as overdue or
    // mismatched; whenever it would say true, the review names none. Tried from today to 45 days on.
    const rows = readCsv(join(root, 'data/seed/emergency.csv'));
    for (let d = 0; d <= 45; d += 5) {
      const day = new Date(Date.parse(NOW) + d * 86400000).toISOString().slice(0, 10);
      const pressing = emergencyDue(rows, day).filter((e) => e.state !== 'due');
      expect(pressing.length === 0, day).toBe(validateEmergency(rows.map((r) => ({ ...r })), day, false).verified);
    }
  });
  it('says the tests passed only for the commit the pull request now holds', () => {
    const prs = [{ number: 91, url: 'u', headRefOid: 'new' }];
    expect(prFact([], [])).toBeNull();
    expect(prFact(prs, [{ conclusion: 'success', headSha: 'old' }])!.tests).toBe('not run');
    expect(prFact(prs, [{ conclusion: 'success', headSha: 'new', url: 'ci' }])).toMatchObject({ tests: 'passed', testsUrl: 'ci' });
    expect(prFact(prs, [{ conclusion: null, status: 'in_progress', headSha: 'new' }])!.tests).toBe('running');
    expect(prFact(prs, [{ conclusion: 'failure', headSha: 'new' }])!.tests).toBe('failed');
  });
  it('names alerts ending within the week, and layers within two weeks of their age limit', () => {
    expect(alertsEnding([
      { title: 'soon', ends_at: '2026-11-26T00:00:00Z', status: 'published' }, { title: 'over', ends_at: '2026-10-30T00:00:00Z', status: 'published' },
      { title: 'far', ends_at: '2027-01-01T00:00:00Z', status: 'published' }, { title: 'draft', ends_at: '2026-11-26T00:00:00Z', status: 'draft' },
    ], NOW).map((a) => a.title)).toEqual(['soon']);
    const edited: Record<string, string> = { a: '2026-11-01', b: '2026-09-01', c: '2026-07-01', d: '2020-01-01' };
    const aging = sourcesAging([
      { id: 'a', name: 'A', mode: 'publish', max_age_days: 90 }, { id: 'b', name: 'B', mode: 'publish', max_age_days: 90 },
      { id: 'c', name: 'C', mode: 'publish', max_age_days: 90 }, { id: 'd', name: 'D', mode: 'stage', max_age_days: 90 }, { id: 'none', name: 'N', mode: 'publish', max_age_days: 90 },
    ], (id) => edited[id] ?? null, '2026-11-23');
    expect(aging.map((s) => s.name)).toEqual(['B', 'C']);
    expect(digestBody({ ...quiet, sources: aging })).toContain('C: its publisher last edited it on 2026-07-01, 145 days ago, past our 90-day limit');
  });
});

describe('the issues', () => {
  let tmp = '';
  afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = ''; });
  /** A throwaway "GitHub": a stub `gh` whose open issues are files named <label>-<number>. */
  function world() {
    tmp = mkdtempSync(join(tmpdir(), 'digest-'));
    const bin = join(tmp, 'bin'), log = join(tmp, 'gh.log'), issues = join(tmp, 'issues'), dir = join(tmp, 'd');
    mkdirSync(bin); mkdirSync(issues); mkdirSync(dir);
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash
echo "$*" >> "${log}"
arg() { while [ $# -gt 1 ]; do [ "$1" = "$want" ] && { echo "$2"; return; }; shift; done; }
case "$1 $2" in
  "issue list") want=--label; l="$(arg "$@")"; ls "${issues}" | sed -n "s/^$l-//p" ;;
  "issue create") want=--label; l="$(arg "$@")"; n=$(( $(ls "${issues}" | wc -l) + 101 )); touch "${issues}/$l-$n"; echo "https://example.invalid/issues/$n" ;;
  "issue close") rm -f "${issues}"/*-"$3" ;;
esac
`);
    chmodSync(join(bin, 'gh'), 0o755);
    const go = (cmd: string) => {
      const r = spawnSync(join(root, 'scripts/digest-issues.sh'), [cmd, dir], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY_OWNER: 'someone' } });
      if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stdout}\n${r.stderr}`);
      return r.stdout;
    };
    const set = (file: string, text: string) => writeFileSync(join(dir, file), text);
    const gh = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    const open = () => spawnSync('ls', [issues], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
    return { go, set, gh, open };
  }

  it('opens one alarm for a whole outage, assigned to the owner, and closes it when things are healthy', () => {
    const w = world();
    w.set('alarm.md', ''); w.go('alarm');
    expect(w.open()).toEqual([]);
    w.set('alarm.md', 'two nights failed'); w.go('alarm'); w.go('alarm'); w.go('alarm');
    expect(w.open()).toEqual(['publish-alarm-101']);
    expect(w.gh().match(/issue create/g)).toHaveLength(1);
    expect(w.gh()).toContain('--assignee someone');
    w.set('alarm.md', ''); w.go('alarm');
    expect(w.open()).toEqual([]);
  });
  it('keeps one weekly review open: the new one replaces the last', () => {
    const w = world();
    w.set('digest.md', 'week one'); w.go('weekly');
    w.set('digest.md', 'week two'); w.go('weekly');
    expect(w.open()).toEqual(['weekly-review-102']);
    expect(w.gh()).toContain('issue close 101 --comment Replaced by this week\'s review: https://example.invalid/issues/102');
  });
  it('leaves the alarm alone when it writes the weekly review', () => {
    const w = world();
    w.set('alarm.md', 'down'); w.go('alarm');
    w.set('digest.md', 'week'); w.go('weekly');
    expect(w.open().sort()).toEqual(['publish-alarm-101', 'weekly-review-102']);
  });
});
