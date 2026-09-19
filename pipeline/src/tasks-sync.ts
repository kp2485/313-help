// The nightly re-check becomes steward tasks (DECISIONS 2026-09-19: "Nightly re-check of each listing's own page
// produces a steward task only"). `pnpm check:sources -- --recheck` writes data/staging/recheck.json (git-ignored):
// every active listing whose own page no longer shows its phone or street address, or could not be read. This
// script sends that whole list to the Worker, which opens new tasks and closes the ones no longer reported.
// Nothing in the app changes because of it. Configured like the build: REPORTS_API plus the Access service token.
// Without REPORTS_API it does nothing.

import { existsSync, readFileSync } from 'node:fs';
import { p } from './util.js';
import { headers } from './reports-sync.js';

export interface RecheckTask { target_id: string; result: 'missing' | 'unreadable'; detail: string; checked_on: string }
export const RECHECK = p('data/staging/recheck.json');

/**
 * One listing's re-check as a task, or null when its page still matches. The detail is only the page matcher's own
 * words: which published phone or street address it could not find, or why the page could not be read.
 */
export function recheckTask(target_id: string, outcome: { missing: string[] } | { why: string }, day: string): RecheckTask | null {
  if ('why' in outcome) return { target_id, result: 'unreadable', detail: outcome.why.slice(0, 300), checked_on: day };
  return outcome.missing.length ? { target_id, result: 'missing', detail: outcome.missing.join(', ').slice(0, 300), checked_on: day } : null;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** PUTs the re-check list. Returns how many tasks were sent, or 'skipped' without REPORTS_API. */
export async function syncTasks(file = RECHECK, env: Record<string, string | undefined> = process.env, fetcher: Fetch = fetch): Promise<number | 'skipped'> {
  const api = env.REPORTS_API;
  if (!api) return 'skipped';
  // No list means the re-check didn't finish. Sending an empty one would close every open task, so send nothing.
  if (!existsSync(file)) throw new Error(`no re-check list at ${file}; run check:sources --recheck first`);
  const tasks = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  if (!Array.isArray(tasks)) throw new Error(`${file} is not a list`);
  const res = await fetcher(`${api}/v1/steward/tasks`, { method: 'PUT', headers: headers(env), body: JSON.stringify({ tasks }) });
  if (!res.ok) throw new Error(`could not sync steward tasks: ${res.status}`);
  return tasks.length;
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/tasks-sync.ts')) {
  const sent = await syncTasks();
  console.log(sent === 'skipped' ? 'REPORTS_API is not set; no tasks sent.' : `${sent} re-check tasks sent to the steward queue.`);
}
