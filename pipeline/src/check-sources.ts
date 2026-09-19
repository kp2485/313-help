// Entry check by machine: read each row's source_url and ask the strict matcher (page-match.ts) whether the page
// still shows the listing: every listed phone (phone and phone2) as a whole number, and the street address (house
// number, then street). A listing with no phone must show its house number. A row that matches becomes active with
// entry_method "auto_check" ("Matched their website when added"). A row that does not match stays proposed and out
// of the bundle until a person looks. A page that can't be read (an error, or bot protection) is never a mismatch:
// the row waits for a person with a browser. `--recheck` also re-reads active rows (the nightly re-check); a miss
// there only leaves a note for a steward. Nothing changes in the app until a person decides (DECISIONS 2026-09-19).

import { today } from './util.js';
import { readResources, writeResources } from './seed-io.js';
import { fetchPage, listingOnPage, type PageResult } from './page-match.js';

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
for (const r of rows) {
  if (promoteOnly && r.status !== 'proposed') continue;
  if (!r.source_url) { held++; continue; }
  const got = await page(r.source_url);
  if (!got.ok) { note(r, `source page could not be read (${got.why}); check by eye`); unread++; continue; }
  const m = listingOnPage(got.html, r);
  if (m.ok) {
    if (r.status === 'proposed') { r.status = 'active'; r.checked_at_entry = today(); r.entry_method = 'auto_check'; }
    ok++;
  } else {
    const why = `not found on source page: ${m.missing.join(', ')}`;
    console.warn(`  HELD ${r.sal_id}: ${why}`);
    note(r, why);
    held++;
  }
}
writeResources(rows);
console.log(`${ok} matched their source page, ${held} held for a person to check, ${unread} pages could not be read`);
