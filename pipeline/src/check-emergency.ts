// Emergency numbers use what their owners currently publish (DECISIONS 2026-09-18).
// This fetches each number's source_url and stamps verified_published_on when the number
// appears in the raw page text. A release build needs that stamp (or a logged phone call)
// within 30 days. Three-digit codes (911, 988, 211) are national and are not checked.
// If a published number CHANGES, this fails loudly; a person edits emergency.csv. Nothing
// here ever rewrites a number.

import { p, parsePhone, readCsv, today, writeCsv } from './util.js';

export const EMERGENCY_COLUMNS = ['id', 'label', 'number', 'sms', 'hardcoded', 'sort', 'verified_by_call_on', 'verified_published_on', 'source_url', 'internal_note'];

const path = p('data/seed/emergency.csv');
const rows = readCsv(path);
let failed = 0;
for (const r of rows) {
  const ph = parsePhone(r.number ?? '');
  if (!ph || ph.number.length === 3) continue;
  try {
    const res = await fetch(r.source_url!, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; detroithelp-sourcecheck; open-source civic directory)' } });
    const digits = res.ok ? (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/\D/g, '') : '';
    if (digits.includes(ph.number)) { r.verified_published_on = today(); console.log(`ok    ${r.id} ${r.number} is on ${r.source_url}`); }
    else { failed++; console.warn(`FAIL  ${r.id} ${r.number} not found on ${r.source_url}${res.ok ? '' : ` (HTTP ${res.status})`} — has the published number changed?`); }
  } catch (e) { failed++; console.warn(`FAIL  ${r.id}: ${(e as Error).message}`); }
}
writeCsv(path, rows, EMERGENCY_COLUMNS);
if (failed) process.exitCode = 1;
