// Every bundle build runs these. Errors stop the build; warnings are printed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { assertScheduleValid, type Alert, type BundleRow } from '@313help/query';
import { inBbox, p, parsePhone, type CsvRow } from './util.js';

export interface Issues { errors: string[]; warnings: string[] }

const ID = /^sal_[a-z0-9_]+$/;
const CATEGORY = /^(food\.(pantry|meal|mobile|benefits)|shelter\.(emergency|warming|cooling|dv)|harm\.(narcan|supplies)|health\.(clinic|mental|dhd)|utilities|housing\.rent|hygiene\.shower|transport|youth|rec\.(center|library))$/;
// Patterns that suggest a person's contact details leaked into public text.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
// Case-sensitive on purpose: the name part must be Capitalized Words, or "ask for help today" would match.
const CONTACT_NAME = /\b(?:[Cc]ontact|[Aa]sk for)\s+(?:(?:Mr|Ms|Mrs|Dr|Sister|Pastor|Rev)\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

export function validateRows(rows: BundleRow[], todayStr: string): Issues {
  const errors: string[] = [], warnings: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const e = (m: string) => errors.push(`${r.id}: ${m}`), w = (m: string) => warnings.push(`${r.id}: ${m}`);
    if (!ID.test(r.id)) e('id must be a sal_ slug');
    if (seen.has(r.id)) e('duplicate id');
    seen.add(r.id);
    if (!CATEGORY.test(r.category)) e(`unknown category "${r.category}"`);
    if (!['active', 'suspended', 'archived'].includes(r.status)) e(`unknown status "${r.status}"`);
    if (!['scheduled', 'always', 'call_first', 'unknown'].includes(r.availability)) e(`unknown availability "${r.availability}"`);
    if (!r.name || !r.what) e('name and what are required');
    if (/�/.test(JSON.stringify(r))) e('contains a broken character (encoding problem in the source)');

    // DV rows never carry a place. A schema rule, not an editorial habit (docs/08, audit A8).
    if (r.category === 'shelter.dv' && (r.address || r.lat !== undefined || r.lon !== undefined)) e('domestic violence rows must not have an address or coordinates');

    if ((r.lat === undefined) !== (r.lon === undefined)) e('lat and lon must come together');
    if (r.lat !== undefined && !inBbox(r.lat, r.lon!)) e(`coordinates ${r.lat},${r.lon} are outside the service area (Detroit, Hamtramck, Highland Park, Dearborn)`);
    if (r.address && r.lat === undefined && r.status === 'active') w('has an address but no coordinates; it will not sort by distance');

    if (r.phones.length === 0 && !r.address) e('needs a phone number or an address');
    for (const ph of r.phones) if (!parsePhone(ph.number)) e(`phone "${ph.number}" is not a valid number`);

    if (r.availability === 'scheduled' && r.schedules.length === 0) e('availability is "scheduled" but there are no schedule rows');
    if (r.availability !== 'scheduled' && r.schedules.length > 0) e(`availability is "${r.availability}" but schedule rows exist`);
    for (const s of r.schedules) {
      try { assertScheduleValid(s); } catch (err) { e(`schedule: ${(err as Error).message}`); }
      if (r.status === 'active' && s.until && s.until < todayStr && s.freq) w(`a schedule ended on ${s.until}`);
    }

    const text = `${r.what} ${r.eligibility ?? ''} ${r.notice ?? ''} ${r.hours_text ?? ''}`;
    if (EMAIL.test(text) || CONTACT_NAME.test(text)) e('public text looks like it contains a personal contact');

    if (r.status === 'archived' && !r.archived) e('archived rows need an archive record (date and reason)');
    if (!r.facts.source?.name) e('source name is required');
  }
  return { errors, warnings };
}

export function validateEmergency(rows: CsvRow[], todayStr: string, release: boolean): Issues & { verified: boolean } {
  const errors: string[] = [], warnings: string[] = [];
  const need = new Map([['emg_911', '911'], ['emg_988', '988']]);
  let verified = true;
  for (const r of rows) {
    if (!parsePhone(r.number ?? '')) errors.push(`${r.id}: "${r.number}" is not a valid number`);
    if (need.has(r.id!)) {
      if (r.number !== need.get(r.id!) || r.hardcoded !== 'yes') errors.push(`${r.id}: must be ${need.get(r.id!)} and hardcoded`);
      need.delete(r.id!);
      continue; // 911 and 988 are never test-called
    }
    if (parsePhone(r.number ?? '')?.number.length === 3) continue; // national three-digit codes (211)
    // A release fails only on a mismatch (DECISIONS 2026-09-19): the owner's page was read and showed a different
    // number. A person clears it by fixing the number (and mismatch_on), or by logging a call on or after that day.
    if (r.mismatch_on && !(r.verified_by_call_on && r.verified_by_call_on >= r.mismatch_on)) {
      verified = false;
      (release ? errors : warnings).push(`${r.id} (${r.number}): on ${r.mismatch_on} its page (${r.source_url}) did not show this number. Read the page, fix emergency.csv by hand, and clear mismatch_on`);
      continue;
    }
    // Otherwise age is a note for a person, never a reason to hold a release. A logged call or a page match counts.
    const on = [r.verified_by_call_on, r.verified_published_on].filter(Boolean).sort().pop();
    const age = on ? Math.round((Date.parse(todayStr) - Date.parse(on)) / 86400000) : Infinity;
    if (age > 30) {
      verified = false;
      warnings.push(`${r.id} (${r.number}): ${on ? `last checked ${on}, ${age} days ago` : 'never checked against its published source'}; check it (pnpm check:emergency, or in a browser)`);
    }
  }
  for (const id of need.keys()) errors.push(`${id} is missing from emergency.csv`);
  return { errors, warnings, verified };
}

export function validateAlerts(alerts: Alert[], ids: Set<string>): Issues {
  const errors: string[] = [];
  for (const a of alerts) {
    if (!/^alert_[a-z0-9_-]+$/.test(a.id)) errors.push(`${a.id}: id must be an alert_ slug`);
    if (!(Date.parse(a.ends_at) > Date.parse(a.starts_at))) errors.push(`${a.id}: ends_at must be after starts_at (every alert expires)`);
    for (const t of a.targets ?? []) if (!ids.has(t)) errors.push(`${a.id}: unknown target ${t}`);
  }
  return { errors, warnings: [] };
}

// HSDS 3.2 compiled schema: fetched into a git-ignored cache, never vendored (DECISIONS.md).
const HSDS_URL = 'https://raw.githubusercontent.com/openreferral/specification/3.2/schema/compiled/service.json';
export async function hsdsSchema(offline = false): Promise<object | null> {
  const cached = p('.cache/hsds-3.2-service.json');
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'));
  if (offline) return null;
  try {
    const res = await fetch(HSDS_URL);
    if (!res.ok) return null;
    const text = await res.text();
    mkdirSync(p('.cache'), { recursive: true });
    writeFileSync(cached, text);
    return JSON.parse(text);
  } catch { return null; }
}

export function validateHsds(services: unknown[], schema: object): Issues {
  // The upstream schema carries non-standard annotation keywords, so strict mode is off.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const check = ajv.compile(schema);
  const errors: string[] = [];
  for (const s of services as any[]) {
    if (!check(s)) for (const err of check.errors ?? []) errors.push(`HSDS ${s.x_detroit?.id}: ${err.instancePath} ${err.message}`);
  }
  return { errors, warnings: [] };
}
