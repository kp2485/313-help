// Emergency numbers use what their owners currently publish (DECISIONS 2026-09-18).
// This reads each number's source_url (page-match.ts, the same strict matcher as listings):
//   - the number is on the page: stamp verified_published_on, clear mismatch_on;
//   - the page was read and the number is NOT on it: stamp mismatch_on. A release build then fails until a person
//     reads the page and fixes emergency.csv (DECISIONS 2026-09-19: a release fails only on a mismatch);
//   - the page couldn't be read (an error, or bot protection): logged for a person to check in a browser. Not a
//     failure, and nothing is stamped.
// 911 and 988 are hardcoded and never checked. Another three-digit code (211) is checked against its owner's page
// the same way, allowing for "2-1-1". Nothing here ever rewrites a number.

import { p, parsePhone, readCsv, today, writeCsv, type CsvRow } from './util.js';
import { fetchPage, phoneOnPage, shortCodeOnPage, type PageResult } from './page-match.js';

export const EMERGENCY_COLUMNS = ['id', 'label', 'number', 'sms', 'hardcoded', 'sort', 'verified_by_call_on', 'verified_published_on', 'mismatch_on', 'source_url', 'internal_note'];

export type EmergencyCheck = 'match' | 'mismatch' | 'unreadable' | 'skipped';

/** One row against its page. Updates the row's dates; returns what happened. */
export function checkEmergencyRow(r: CsvRow, page: PageResult | null, day: string): EmergencyCheck {
  const ph = parsePhone(r.number ?? '');
  if (!ph || r.hardcoded === 'yes' || !r.source_url || !page) return 'skipped';
  if (!page.ok) return 'unreadable';
  const onPage = ph.number.length === 3 ? shortCodeOnPage(page.html, ph.number) : phoneOnPage(page.html, r.number!);
  if (onPage) { r.verified_published_on = day; r.mismatch_on = ''; return 'match'; }
  r.mismatch_on = day;
  return 'mismatch';
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/check-emergency.ts')) {
  const path = p('data/seed/emergency.csv');
  const rows = readCsv(path);
  let mismatches = 0;
  for (const r of rows) {
    const ph = parsePhone(r.number ?? '');
    const page = ph && r.hardcoded !== 'yes' && r.source_url ? await fetchPage(r.source_url) : null;
    const result = checkEmergencyRow(r, page, today());
    if (result === 'match') console.log(`ok        ${r.id} ${r.number} is on ${r.source_url}`);
    else if (result === 'mismatch') { mismatches++; console.warn(`MISMATCH  ${r.id} ${r.number} is not on ${r.source_url}. Has the published number changed? Read the page and fix emergency.csv by hand.`); }
    else if (result === 'unreadable') console.warn(`unread    ${r.id}: ${r.source_url} (${page && !page.ok ? page.why : ''}). Check it in a browser and record the date in verified_by_call_on or verified_published_on.`);
  }
  writeCsv(path, rows, EMERGENCY_COLUMNS);
  if (mismatches) process.exitCode = 1;
}
