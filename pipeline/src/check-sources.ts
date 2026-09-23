// Entry check by machine: read each row's source_url and ask the strict matcher (page-match.ts) whether the page
// still shows the listing: every listed phone (phone and phone2) as a whole number, and the street address (house
// number, then street). A listing with no phone must show its house number. A row that matches becomes active with
// entry_method "auto_check" ("Matched their website when added"). A row that does not match stays proposed and out
// of the bundle until a person looks. A page that can't be read (an error, or bot protection) is never a mismatch:
// the row waits for a person with a browser. `--recheck` also re-reads active rows (the nightly re-check); a miss
// there only leaves a note for a steward. Nothing changes in the app until a person decides (DECISIONS 2026-09-19).
// `--recheck` also writes data/staging/recheck.json: each active listing whose page missed or could not be read, for
// `pnpm tasks:sync` to send to the steward queue as a task.

import { today, writeJson } from './util.js';
import { PRIVATE_NOT_YET_ON_CLIENTS } from './validate.js';
import { readResources, writeResources } from './seed-io.js';
import { fetchPage, listingOnPage, phone2OnItsPage, type PageResult } from './page-match.js';
import { RECHECK, recheckTask, type RecheckTask } from './tasks-sync.js';

const cache = new Map<string, PageResult>();
const page = async (url: string) => { if (!cache.has(url)) cache.set(url, await fetchPage(url)); return cache.get(url)!; };
// One current note per kind: a newer "could not be read" replaces the older one instead of piling up.
const STALE = /\[\d{4}-\d{2}-\d{2}\] source page could not be (?:fetched|read[^;]*); check by eye\.\s*/g;
const note = (r: Record<string, string | undefined>, why: string) => {
  if ((r.internal_note ?? '').includes(why)) return;
  const rest = why.startsWith('source page could not be') ? (r.internal_note ?? '').replace(STALE, '') : r.internal_note ?? '';
  r.internal_note = `[${today()}] ${why}. ${rest}`.trim();
};

const promoteOnly = !process.argv.includes('--recheck');
const rows = readResources();
let ok = 0, held = 0, unread = 0;
/** Active rows that carry the "Matched their website when added" badge for a page we cannot read today. */
const claimed: string[] = [];
const tasks: RecheckTask[] = [];
const task = (r: Record<string, string | undefined>, outcome: { missing: string[] } | { why: string }) => {
  const t = r.status === 'active' && r.sal_id ? recheckTask(r.sal_id, outcome, today()) : null;
  if (t) tasks.push(t);
};
for (const r of rows) {
  if (promoteOnly && r.status !== 'proposed') continue;
  if (!r.source_url) { held++; continue; }
  const got = await page(r.source_url);
  if (!got.ok) {
    task(r, { why: got.why });
    note(r, `source page could not be read (${got.why}); check by eye`);
    // Worth naming on its own: the row tells residents a machine matched this page, and today it cannot be read
    // at all. A page that answered on the day the row was added keeps the badge honestly — validate.ts fails the
    // build for the other case, where the host was already refusing when the row was entered.
    if (r.status === 'active' && r.entry_method === 'auto_check') claimed.push(`  ${r.sal_id} (entered ${r.checked_at_entry}): ${got.why} — ${r.source_url}`);
    unread++;
    continue;
  }
  const m = listingOnPage(got.html, r);
  // A second number published on another owner's page is checked there.
  if (r.phone2 && r.phone2_source_url) {
    const p2 = await page(r.phone2_source_url);
    if (!p2.ok) { m.ok = false; m.missing.push(`phone2 ${r.phone2} (its page could not be read: ${p2.why})`); }
    else if (!phone2OnItsPage(p2.html, r.phone2)) { m.ok = false; m.missing.push(`phone2 ${r.phone2} on ${r.phone2_source_url}`); }
  }
  task(r, { missing: m.missing });
  if (m.ok) {
    // A private kind the clients do not treat as private yet (validate.ts) is matched and dated, but stays proposed:
    // published now, it would be saved, shared and kept in history like any other row.
    if (r.status === 'proposed' && (PRIVATE_NOT_YET_ON_CLIENTS as readonly string[]).includes(r.category ?? '')) {
      r.checked_at_entry = today(); r.entry_method = 'auto_check';
      note(r, `matched its source page; kept proposed until the clients treat ${r.category} as private`);
    } else if (r.status === 'proposed') { r.status = 'active'; r.checked_at_entry = today(); r.entry_method = 'auto_check'; }
    ok++;
  } else {
    const why = `not found on source page: ${m.missing.join(', ')}`;
    console.warn(`  HELD ${r.sal_id}: ${why}`);
    note(r, why);
    held++;
  }
}
writeResources(rows);
if (!promoteOnly) {
  writeJson(RECHECK, tasks);
  console.log(`${tasks.length} re-check tasks written to ${RECHECK}`);
  if (claimed.length) console.log(`${claimed.length} active rows say "matched their website when added" but their page could not be read today:\n${claimed.join('\n')}`);
}
console.log(`${ok} matched their source page, ${held} held for a person to check, ${unread} pages could not be read`);
