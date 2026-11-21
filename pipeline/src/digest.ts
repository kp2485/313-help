// The weekly review, and the daily watch (DECISIONS 2026-11-21). Kyle: "how can we automate the maintenance of this
// website so I can review what is necessary once a week", then "can i get the digest in my email with actionable
// items?". .github/workflows/digest.yml runs this; scripts/digest-issues.sh turns what it writes into GitHub issues,
// assigned to the repository's owner, and GitHub's own notification is the email. No mail service, no secret, and
// no address of anyone's in this repository.
//
//   tsx src/digest.ts --in <dir> --out <dir>
//     reads  <dir>/runs.json  `gh run list --workflow publish.yml --json conclusion,status,createdAt,url`
//            <dir>/pr.json    `gh pr list --head ingest/pending --state open --json number,url,headRefOid`
//            <dir>/ci.json    `gh run list --workflow ci.yml --branch ingest/pending --json conclusion,status,headSha,url`
//     writes <dir>/digest.md  the week's checklist
//            <dir>/alarm.md   empty when the nightly publish is healthy, otherwise what is wrong
//
// The repository is public, so are its issues. What goes into one is COUNTS AND LINKS ONLY: how many reports wait,
// never a report's words, a steward's note or a listing id from the queue. The steward queue is read with the same
// Access service token the nightly build uses, and nothing it returns is printed or written anywhere but as a number.
// Emergency numbers, alerts and sources are named, because those files are already public in this repository.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { headers, patiently } from './reports-sync.js';
import { p, readCsv, today, type CsvRow } from './util.js';

export interface Run { conclusion: string | null; status?: string; createdAt: string; url: string }
export interface TaskKinds { changed: number; gone: number; refusing: number; unreachable: number }
export interface Facts {
  day: string;                                    // today in Detroit, ISO
  now: string;                                    // the instant, ISO
  repo: string; site: string;
  runs: Run[];                                    // the nightly publish, newest first
  bundle: { generated_at: string; emergency_verified: boolean } | null;   // what the site serves; null = could not be read
  pr: { number: number; url: string; tests: 'passed' | 'failed' | 'running' | 'not run'; testsUrl?: string } | null;
  queue: { reports: number; closed: number; proposals: number; ownerSaidOpen: number; tasks: TaskKinds } | null;   // null = could not be read
  emergency: { label: string; url: string; state: 'mismatch' | 'due' | 'overdue'; days: number }[];
  alerts: { title: string; ends: string }[];      // published alerts that end within a week
  sources: { name: string; edited: string; age: number; max: number }[];   // publisher's layers near or past their age limit
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const hours = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3600000;
const finished = (runs: Run[]) => runs.filter((r) => r.conclusion && r.conclusion !== 'skipped');

/**
 * One re-check task's kind, from the page matcher's own words (pipeline/src/page-match.ts). `changed`: the page was
 * read and no longer shows the phone or street we list — the ones that matter. `gone`: the page is not there.
 * `refusing`: the site turns scripts away, so a person reads it in a browser. `unreachable`: a timeout or a server
 * error, which usually clears itself.
 */
export function taskKind(t: { result: string; detail: string }): keyof TaskKinds {
  if (t.result === 'missing') return 'changed';
  if (/^HTTP (404|410)\b/.test(t.detail)) return 'gone';
  if (/^HTTP (401|403|429)\b/.test(t.detail) || t.detail.startsWith('bot protection') || t.detail.startsWith('page has almost no text')) return 'refusing';
  return 'unreachable';
}
export function taskKinds(tasks: { result: string; detail: string }[]): TaskKinds {
  const k: TaskKinds = { changed: 0, gone: 0, refusing: 0, unreachable: 0 };
  for (const t of tasks) k[taskKind(t)]++;
  return k;
}

/** Emergency numbers a person must look at: a mismatch now, or a last check that is 24 or more days old (30 is the line). */
export function emergencyDue(rows: CsvRow[], day: string): Facts['emergency'] {
  const out: Facts['emergency'] = [];
  for (const r of rows) {
    if (r.hardcoded === 'yes') continue;
    const label = r.label ?? r.id ?? '', url = r.source_url ?? '';
    if (r.mismatch_on && !(r.verified_by_call_on && r.verified_by_call_on >= r.mismatch_on)) { out.push({ label, url, state: 'mismatch', days: days(r.mismatch_on, day) }); continue; }
    const on = [r.verified_by_call_on, r.verified_published_on].filter(Boolean).sort().pop();
    const age = on ? days(on, day) : Infinity;
    if (age > 30) out.push({ label, url, state: 'overdue', days: age });
    else if (age >= 24) out.push({ label, url, state: 'due', days: 30 - age });
  }
  return out;
}

/** Why the nightly publish needs a person today; empty when it does not. One bad night is not a reason: two are. */
export function alarm(f: Pick<Facts, 'runs' | 'bundle' | 'now'>): string[] {
  const why: string[] = [];
  const done = finished(f.runs);
  if (done.length >= 2 && done[0]!.conclusion !== 'success' && done[1]!.conclusion !== 'success')
    why.push(`The last two nightly runs did not succeed. The newest: ${done[0]!.url}`);
  if (f.runs.length && hours(f.runs[0]!.createdAt, f.now) > 48)
    why.push(`No nightly run has started since ${f.runs[0]!.createdAt.slice(0, 10)}. GitHub may have switched the schedule off: Actions → publish → Enable workflow.`);
  if (f.bundle && hours(f.bundle.generated_at, f.now) > 48)
    why.push(`The data the site serves was built on ${f.bundle.generated_at.slice(0, 10)}, more than 48 hours ago.`);
  return why;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The week's issue. Things to do come first, as checkboxes with the link that does each; what needs nothing comes last. */
export function digestBody(f: Facts): string {
  const todo: string[] = [], fine: string[] = [], admin = `${f.site}/admin/`;
  const done = finished(f.runs).filter((r) => days(r.createdAt, f.now) <= 7), bad = done.filter((r) => r.conclusion !== 'success');
  for (const why of alarm(f)) todo.push(`**The nightly publish needs you.** ${why}`);
  if (bad.length && !alarm(f).some((w) => w.startsWith('The last two')))
    todo.push(`${n(bad.length, 'publish run', 'publish runs')} of ${done.length} failed this week and the next one recovered. Look at why: ${bad.map((r) => r.url).join(' ')}`);
  else if (done.length && !bad.length) fine.push(`All ${done.length} publish runs this week succeeded.`);
  if (!f.bundle) todo.push(`The site's data file could not be read from ${f.site}. Open the site and see that it loads.`);
  else if (hours(f.bundle.generated_at, f.now) <= 48) fine.push(`The site is serving data built on ${f.bundle.generated_at.slice(0, 10)}.`);

  for (const e of f.emergency.filter((x) => x.state === 'mismatch'))
    todo.push(`**${e.label}: its owner's page showed a different number ${n(e.days, 'day', 'days')} ago, and the publish stays stopped until this is settled.** Read ${e.url}, fix \`data/seed/emergency.csv\` by hand and clear \`mismatch_on\`.`);

  if (f.pr) {
    const tests = { passed: 'The tests passed against it', failed: '**The tests failed against it: do not merge until that is understood**', running: 'Its tests are still running', 'not run': 'Its tests have not run: build and test it locally first' }[f.pr.tests];
    todo.push(`Open data changed at its source and waits for you: read the summary and merge or close #${f.pr.number}. ${tests}${f.pr.testsUrl ? ` (${f.pr.testsUrl})` : ''}.`);
  } else fine.push('No open data is waiting for review.');

  if (!f.queue) todo.push(`The steward queue could not be read. Open ${admin} and work what is there.`);
  else {
    const q = f.queue, t = q.tasks;
    if (q.closed) todo.push(`${n(q.closed, 'listing was', 'listings were')} reported closed or moved by two or more phones. Call, then archive or clear: ${admin}`);
    if (q.ownerSaidOpen) todo.push(`${n(q.ownerSaidOpen, 'listing', 'listings')} reported closed, where the people who run it then said it is still right. Call: ${admin}`);
    if (q.reports) todo.push(`${n(q.reports, 'report', 'reports')} from residents to read: ${admin}`);
    if (q.proposals) todo.push(`${n(q.proposals, 'proposed place', 'proposed places')} to check: ${admin}`);
    if (t.changed) todo.push(`${n(t.changed, 'listing whose own page no longer shows', 'listings whose own pages no longer show')} the phone or street we list. Open each page; fix the row or press "Checked: it's fine": ${admin}`);
    if (t.gone) todo.push(`${n(t.gone, 'listing whose page is', 'listings whose pages are')} gone (404). Find the new page or call: ${admin}`);
    if (t.refusing) todo.push(`When there is time: ${n(t.refusing, 'listing is', 'listings are')} on a site that turns scripts away, so only a browser can read ${t.refusing === 1 ? 'it' : 'them'}: ${admin}`);
    if (t.unreachable) fine.push(`${n(t.unreachable, 'page', 'pages')} could not be reached last night (a timeout or a server error). These usually clear themselves.`);
    if (!q.closed && !q.ownerSaidOpen && !q.reports && !q.proposals && !t.changed && !t.gone && !t.refusing) fine.push('The steward queue is empty.');
  }

  const late = f.emergency.filter((e) => e.state !== 'mismatch');
  if (late.length) {
    todo.push(`Read ${n(late.length, 'emergency number', 'emergency numbers')} on ${late.length === 1 ? "its owner's page" : "their owners' pages"} in a browser (a script cannot), then set \`verified_published_on\` in \`data/seed/emergency.csv\`:\n`
      + late.map((e) => `  - ${e.label}: ${e.url} (${e.state === 'overdue' ? `last checked ${e.days} days ago` : `due in ${n(e.days, 'day', 'days')}`})`).join('\n'));
  } else if (!f.emergency.length) fine.push('Every emergency number was matched to its owner\'s page within the last 23 days.');

  for (const a of f.alerts) todo.push(`The alert "${a.title}" ends on ${a.ends.slice(0, 10)}. Let it lapse, or post it again if it is still true (\`pnpm alert:new\`).`);
  for (const s of f.sources)
    fine.push(s.age > s.max
      ? `${s.name}: its publisher last edited it on ${s.edited}, ${s.age} days ago, past our ${s.max}-day limit. It is still re-read every night and nothing in it changes without you. If it stays this way, ask the publisher whether the layer is still kept.`
      : `${s.name}: its publisher last edited it on ${s.edited}. In ${n(s.max - s.age, 'day', 'days')} it passes our ${s.max}-day limit.`);

  return [
    `What 313 Help needs from a person in the week of ${f.day}. Tick each box as you finish it.`,
    '',
    '## To do',
    '',
    todo.length ? todo.map((t) => `- [ ] ${t}`).join('\n') : 'Nothing. Everything below ran by itself.',
    '',
    '## Needs nothing',
    '',
    fine.map((t) => `- ${t}`).join('\n'),
    '',
    `Written by \`.github/workflows/digest.yml\` from counts only. A new one replaces this next Monday. How each job is done: \`docs/OPERATIONS.md\`.`,
    '',
  ].join('\n');
}

// ---- gathering -------------------------------------------------------------------------------------------------

function readJson<T>(file: string, fallback: T): T {
  try { return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback; } catch { return fallback; }
}

/** The waiting pull request and whether CI ran against exactly the commit it now holds. */
export function prFact(prs: { number: number; url: string; headRefOid?: string }[], ci: { conclusion: string | null; status?: string; headSha?: string; url?: string }[]): Facts['pr'] {
  const pr = prs[0];
  if (!pr) return null;
  const run = ci.find((r) => r.headSha === pr.headRefOid);
  const tests = !run ? 'not run' : run.conclusion === 'success' ? 'passed' : run.conclusion ? 'failed' : 'running';
  return { number: pr.number, url: pr.url, tests, ...(run?.url ? { testsUrl: run.url } : {}) };
}

/** Published alerts whose end falls inside the next seven days. */
export function alertsEnding(alerts: { title?: string; ends_at?: string; status?: string }[], now: string): Facts['alerts'] {
  return alerts.filter((a) => a.status === 'published' && a.ends_at && hours(now, a.ends_at) > 0 && hours(now, a.ends_at) <= 7 * 24)
    .map((a) => ({ title: a.title ?? '', ends: a.ends_at! }));
}

/** Layers that publish only while their publisher keeps editing them, within two weeks of the limit or past it. */
export function sourcesAging(sources: { id: string; name: string; mode?: string; max_age_days?: number }[], edited: (id: string) => string | null, day: string): Facts['sources'] {
  const out: Facts['sources'] = [];
  for (const s of sources) {
    if (s.mode !== 'publish' || !s.max_age_days) continue;
    const on = edited(s.id);
    if (!on) continue;
    const age = days(on, day);
    if (age > s.max_age_days - 14) out.push({ name: s.name, edited: on, age, max: s.max_age_days });
  }
  return out;
}

function lastEdited(id: string): string | null {
  const file = p('data/ingested', `${id}.csv`);
  if (!existsSync(file)) return null;
  return readCsv(file).map((r) => r.source_last_edited ?? '').filter(Boolean).sort().pop() ?? null;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Counts from the steward queue, and nothing else from it. Null when it is not configured or does not answer. */
export async function queueCounts(env: Record<string, string | undefined> = process.env, fetcher: Fetch = fetch, waits?: number[]): Promise<Facts['queue']> {
  const api = env.REPORTS_API;
  if (!api) return null;
  try {
    const get = async <T>(path: string) => {
      const res = await patiently(() => fetcher(`${api}${path}`, { headers: headers(env) }), waits);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    };
    const q = await get<{ reports: unknown[]; closed_phones: Record<string, number>; proposals: unknown[]; owner_said_open: Record<string, string> }>('/v1/steward/queue');
    const t = await get<{ tasks: { result: string; detail: string }[] }>('/v1/steward/tasks');
    return {
      reports: q.reports.length, closed: Object.values(q.closed_phones).filter((c) => c >= 2).length, proposals: q.proposals.length,
      ownerSaidOpen: Object.keys(q.owner_said_open).length, tasks: taskKinds(t.tasks),
    };
  } catch { return null; }
}

async function liveBundle(site: string): Promise<Facts['bundle']> {
  try {
    const res = await patiently(() => fetch(`${site}/data/bundle/v1/index.json`, { redirect: 'error' }));
    if (!res.ok) return null;
    const i = (await res.json()) as { generated_at?: string; emergency_verified?: boolean };
    return i.generated_at ? { generated_at: i.generated_at, emergency_verified: i.emergency_verified === true } : null;
  } catch { return null; }
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/digest.ts')) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const dir = arg('--in'), out = arg('--out') ?? dir;
  if (!dir || !out) { console.error('usage: tsx src/digest.ts --in <dir> [--out <dir>]'); process.exit(2); }
  const now = new Date(), site = (process.env.SITE ?? 'https://313help.com').replace(/\/$/, '');
  const facts: Facts = {
    day: today(now), now: now.toISOString(), repo: process.env.GITHUB_REPOSITORY ?? '', site,
    runs: readJson<Run[]>(join(dir, 'runs.json'), []),
    bundle: await liveBundle(site),
    pr: prFact(readJson(join(dir, 'pr.json'), []), readJson(join(dir, 'ci.json'), [])),
    queue: await queueCounts(),
    emergency: emergencyDue(readCsv(p('data/seed/emergency.csv')), today(now)),
    alerts: alertsEnding(readJson(p('data/seed/alerts.json'), []), now.toISOString()),
    sources: sourcesAging((YAML.parse(readFileSync(p('data/sources.yaml'), 'utf8')) as { sources: { id: string; name: string; mode?: string; max_age_days?: number }[] }).sources, lastEdited, today(now)),
  };
  writeFileSync(join(out, 'digest.md'), digestBody(facts));
  const why = alarm(facts);
  writeFileSync(join(out, 'alarm.md'), why.length ? `The nightly publish of 313 Help needs a person.\n\n${why.map((w) => `- ${w}`).join('\n')}\n\nResidents keep the last good data until this is fixed. This issue closes itself when a nightly run succeeds and the site's data is fresh again.\n` : '');
  console.log(`digest written; ${why.length ? `ALARM: ${why.length} reason(s)` : 'the nightly publish is healthy'}.`);
}
