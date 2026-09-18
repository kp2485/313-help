// Entry check by machine: fetch each row's source_url and look for the row's phone number
// (and street number) in the raw page text. A row that matches becomes active with
// entry_method "auto_check" ("Matched their website when added"). A row that does not match
// stays proposed and out of the bundle until a person looks. This is also the nightly
// auto-check: a listed phone that disappears from its own source page raises a task.

import { parsePhone, today } from './util.js';
import { readResources, writeResources } from './seed-io.js';

const cache = new Map<string, string | null>();
async function pageText(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!;
  let text: string | null = null;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; detroithelp-sourcecheck; open-source civic directory)' } });
    if (res.ok) text = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ');
    else console.warn(`  ${res.status} ${url}`);
  } catch (e) { console.warn(`  fetch failed ${url}: ${(e as Error).message}`); }
  cache.set(url, text);
  return text;
}

// Letters on a keypad, so "1-800-866-THAW" matches 8008668429.
const keypad = (s: string) => s.toUpperCase().replace(/[A-Z]/g, (c) => String('22233344455566677778889999'[c.charCodeAt(0) - 65]));

const promoteOnly = !process.argv.includes('--recheck');
const rows = readResources();
let ok = 0, held = 0;
for (const r of rows) {
  if (promoteOnly && r.status !== 'proposed') continue;
  if (!r.source_url) { held++; continue; }
  const text = await pageText(r.source_url);
  if (text === null) {
    if (!(r.internal_note ?? '').includes('could not be fetched')) r.internal_note = `[${today()}] source page could not be fetched; check by eye. ${r.internal_note ?? ''}`.trim();
    held++; continue;
  }
  const phone = parsePhone(r.phone ?? '');
  const digits = text.replace(/\D/g, ''), digitsKeypad = keypad(text).replace(/\D/g, '');
  // A listing with no phone (a church pantry door) is checked on its street address alone, and must have one.
  const phoneFound = r.phone ? !!phone && (digits.includes(phone.number) || digitsKeypad.includes(phone.number)) : !!r.address_1;
  const streetNo = /^\d+/.exec(r.address_1 ?? '')?.[0];
  const addressFound = !streetNo || new RegExp(`(^|\\D)${streetNo}(\\D|$)`).test(text);
  if (phoneFound && addressFound) {
    if (r.status === 'proposed') { r.status = 'active'; r.checked_at_entry = today(); r.entry_method = 'auto_check'; }
    ok++;
  } else {
    const why = [!phoneFound && 'phone not found on source page', !addressFound && 'street number not found on source page'].filter(Boolean).join('; ');
    console.warn(`  HELD ${r.sal_id}: ${why}`);
    if (!(r.internal_note ?? '').includes(why)) r.internal_note = `[${today()}] ${why}. ${r.internal_note ?? ''}`.trim();
    held++;
  }
}
writeResources(rows);
console.log(`${ok} matched their source page, ${held} held for a person to check`);
