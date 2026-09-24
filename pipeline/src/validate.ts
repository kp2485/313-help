// Every bundle build runs these. Errors stop the build; warnings are printed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { assertScheduleValid, isDvCategory, isServiceArea, SERVICE_AREA_IDS, type Alert, type BundleRow } from '@313help/query';
import { recordKey } from './ingest-ids.js';
import { inBbox, p, parsePhone, type CsvRow } from './util.js';

export interface Issues { errors: string[]; warnings: string[] }

const ID = /^sal_[a-z0-9_]+$/;
/** Every category a listing may carry (docs/03, 46 slugs). One list, so the app's tests can hold the need screens,
 *  the browse chips and the map layers to it: apps/web/test/web.test.ts reads this block and fails when a category
 *  here can be reached from no screen or belongs to no map layer (category audit, 2026-09-22). */
export const KNOWN_CATEGORIES = [
  'food.pantry', 'food.meal', 'food.mobile', 'food.benefits',
  'shelter.emergency', 'shelter.warming', 'shelter.cooling', 'shelter.dv', 'shelter.day',
  'harm.narcan', 'harm.supplies',
  // `health.mental` is the crisis one and is *sensitive* (no address, no dot, no Save, no Share: docs/08).
  // `health.support` is ongoing mental-health support that is not a crisis service — a daytime clubhouse whose
  // owner prints its address — and is an ordinary category (category audit 2026-09-22, K3).
  'health.clinic', 'health.mental', 'health.support', 'health.dhd', 'health.dental', 'health.vision', 'health.er', 'health.urgent',
  'utilities', 'housing.rent', 'housing.owner', 'hygiene.shower', 'transport', 'youth',
  'rec.center', 'rec.library', 'jobs.find', 'jobs.training', 'learn.school', 'learn.english',
  'treatment.crisis', 'treatment.detox', 'treatment.residential', 'treatment.outpatient', 'treatment.meds', 'treatment.recovery',
  'legal', 'ids', 'assault', 'money.tax', 'money.benefits', 'goods.clothes', 'goods.baby', 'kids.care', 'connect', 'pets',
  // Somewhere open all night with a phone a person can use (DECISIONS 2026-09-22, Kyle's plan decision 3).
  // A category says what the row offers, not who runs it: both of these offer a door that is never locked.
  'safe.police', 'safe.fire',
  // Fourteen more kinds of help (Kyle, 2026-09-23; DECISIONS). Listings enter first; each choice reaches the
  // screens only once it has checked places in it. Two of them are PRIVATE kinds — see PRIVATE_NOT_YET_ON_CLIENTS.
  'health.prenatal', 'health.sexual', 'housing.repair', 'housing.lead', 'goods.home', 'goods.personal',
  'hygiene.laundry', 'legal.immigration', 'ids.mail', 'connect.phone', 'kids.prek',
  // Help built for one group of people: a senior center, a veterans' service office, a center for independent
  // living. A row that merely welcomes the group keeps its own category and carries the flag instead (docs/03).
  'seniors', 'veterans', 'disability',
  // A children's advocacy center: where a child is interviewed after abuse (Kids-TALK). PRIVATE on all three clients
  // (Kyle, 2026-09-23), like help after sexual assault; it keeps its address, because a family has to get there.
  'youth.advocacy',
] as const;
/**
 * Private kinds (no Save, no Share, no history, quick exit: docs/08) that the three clients do not yet treat as
 * private. A published row in one of these would be saved, shared and remembered like any other, so the build
 * refuses it. Empty this list in the same change that adds the kinds to `isPrivate` on the web, iPhone and Android.
 */
// 2026-09-23: health.sexual and legal.immigration were here until the web, iPhone and Android treated them as private
// (the same change emptied this list). Keep the list: the next private kind waits here too.
export const PRIVATE_NOT_YET_ON_CLIENTS: readonly string[] = [];
const CATEGORY = { test: (c: string) => (KNOWN_CATEGORIES as readonly string[]).includes(c) };
// Patterns that suggest a person's contact details leaked into public text.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
// Case-sensitive on purpose: the name part must be Capitalized Words, or "ask for help today" would match.
const CONTACT_NAME = /\b(?:[Cc]ontact|[Aa]sk for)\s+(?:(?:Mr|Ms|Mrs|Dr|Sister|Pastor|Rev)\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : null; } catch { return null; } };
const sameSite = (a?: string, b?: string) => { const x = host(a), y = host(b); return !!x && x === y; };

// ---- domestic violence: a row that names no place at all --------------------------------------------------
// A shelter.dv row carries no address, no ZIP, no coordinate, no name that is a building or a street, and no
// link whose own address is a "where we are" page. The bundle is public and signed, so anything in it is
// published, and a DV shelter's address can get someone killed (docs/08, DECISIONS 2026-09-20). This overrides
// the ordinary "a shelter's address is shown only if the shelter publishes it" rule: for shelter.dv there is no
// such case — not even when the shelter prints its address on its own page.

/** A house number followed by a street word: the shape of an address wherever it is written. */
const STREET_IN_TEXT = /\b\d{2,6}\s+([NSEW]\.?\s+|(?:North|South|East|West)\s+)?[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*)?\s*(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway|Way|Ter|Terrace|Cir|Circle|Mile)\b\.?/i;
/** A name that is really a building or a street: "Interim House, 100 Main St", "The Main Street shelter". */
const BUILDING_NAME = new RegExp(`${STREET_IN_TEXT.source}|\\b(building|suite|apartments?|floor)\\b`, 'i');
/** A URL path that is a "where we are" page, or that spells an address into the path itself. */
const ADDRESS_PATH = /(^|[/_-])(address(es)?|directions?|our-?locations?|find-?us|visit-?us|where-?we-?are|get-?directions?|map|maps)([/_-]|$)|\d{2,6}[-_](north|south|east|west|[a-z]+)([-_][a-z]+)?[-_](st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|lane|ln|way|court|ct|place|pl)([/_-]|$)/i;

const urlPath = (u?: string) => { try { return u ? new URL(u).pathname : null; } catch { return null; } };

/**
 * One row of data/seed/script-refusing-hosts.csv: a host that refuses this pipeline's fetcher, and the first
 * day on which every attempt was refused. Kept as data so a steward can add a host without touching code.
 */
export interface RefusingHost { host: string; refusing_since: string; refusal: string; note?: string }

/** The list, keyed by host with any leading "www." dropped, the way `host()` reads a url. */
export function scriptRefusingHosts(rows: CsvRow[]): Map<string, RefusingHost> {
  const out = new Map<string, RefusingHost>();
  for (const r of rows) {
    const h = (r.host ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (!h || !/^\d{4}-\d\d-\d\d$/.test(r.refusing_since ?? '')) continue;
    out.set(h, { host: h, refusing_since: r.refusing_since!, refusal: r.refusal ?? 'refuses our fetcher', ...(r.note ? { note: r.note } : {}) });
  }
  return out;
}

export function validateRows(rows: BundleRow[], todayStr: string, refusing: Map<string, RefusingHost> = new Map()): Issues {
  const errors: string[] = [], warnings: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const e = (m: string) => errors.push(`${r.id}: ${m}`), w = (m: string) => warnings.push(`${r.id}: ${m}`);
    if (!ID.test(r.id)) e('id must be a sal_ slug');
    if (seen.has(r.id)) e('duplicate id');
    seen.add(r.id);
    if (!CATEGORY.test(r.category)) e(`unknown category "${r.category}"`);
    if ((PRIVATE_NOT_YET_ON_CLIENTS as readonly string[]).includes(r.category)) e(`"${r.category}" is private, and the clients do not treat it as private yet: keep the row proposed (PRIVATE_NOT_YET_ON_CLIENTS)`);
    if (!['active', 'suspended', 'archived'].includes(r.status)) e(`unknown status "${r.status}"`);
    if (!['scheduled', 'always', 'call_first', 'unknown'].includes(r.availability)) e(`unknown availability "${r.availability}"`);
    if (!r.name || !r.what) e('name and what are required');
    if (/�/.test(JSON.stringify(r))) e('contains a broken character (encoding problem in the source)');

    // A place that chooses not to publish where it is (flag `address_withheld`, DECISIONS 2026-09-23: Freedom House,
    // a shelter for people seeking asylum). The owner's choice, held by the build: an address or a coordinate added
    // later from a directory fails here, whatever its category.
    if (r.flags.includes('address_withheld') && (r.address || r.lat !== undefined || r.lon !== undefined)) {
      e('this place does not publish its address (flag address_withheld), so it must carry no address and no coordinates');
    }
    if (r.flags.includes('address_withheld') && r.phones.length === 0) e('a place that withholds its address publishes on its phone alone, so it must have one');
    // DV rows never carry a place. A schema rule, not an editorial habit (docs/08, audit A8). This holds even
    // when the shelter publishes its own address, which is why it is checked before the "own website" rule below
    // and not as an exception to it (DECISIONS 2026-09-20).
    if (isDvCategory(r.category)) {
      if (r.address || r.lat !== undefined || r.lon !== undefined) e('domestic violence rows must not have an address or coordinates');
      if (BUILDING_NAME.test(r.name)) e(`the name "${r.name}" reads as a building or a street; a domestic violence row is named by its service, never by where it is`);
      for (const [what, url] of [['website', r.website], ['source url', r.facts.source?.url]] as const) {
        const path = urlPath(url);
        if (path && ADDRESS_PATH.test(path)) e(`${what} ${url} points at an address page; a domestic violence row links only to a page that is not about where it is`);
      }
      if (r.service_area !== undefined && !isServiceArea(r.service_area)) e(`unknown service_area "${r.service_area}" (one of: ${SERVICE_AREA_IDS.join(', ')})`);
      if (r.phones.length === 0) e('a domestic violence row publishes on its phone alone, so it must have one');
    } else if (r.service_area !== undefined) {
      e('service_area is for domestic violence rows only; every other row says where it is with an address or a coordinate');
    }
    // Any other shelter shows an address only if the shelter publishes it on its own site (DECISIONS 2026-09-19).
    // Warming and cooling centers are public buildings the City announces, not shelters people live in.
    if (/^shelter\.(?!warming|cooling)/.test(r.category) && r.address && !sameSite(r.website, r.facts.source?.url)) e("a shelter's address must come from the shelter's own website: source url and website must be on the same site");

    if ((r.lat === undefined) !== (r.lon === undefined)) e('lat and lon must come together');
    if (r.lat !== undefined && !inBbox(r.lat, r.lon!)) e(`coordinates ${r.lat},${r.lon} are outside the service area (Detroit, Hamtramck, Highland Park, Dearborn)`);
    if (r.address && r.lat === undefined && r.status === 'active') w('has an address but no coordinates; it will not sort by distance');

    // A person has to be able to find it: a number to call, a street address, or a coordinate its publisher
    // states (Wayne County's station map gives a site name and a point and no address; DECISIONS 2026-09-20).
    if (r.phones.length === 0 && !r.address && r.lat === undefined) e('needs a phone number, an address, or coordinates');
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

    // "Matched their website when added" is a claim that a machine read a page. A host that refuses our fetcher
    // cannot have been read by it, so a row entered on or after the day that host started refusing cannot
    // honestly carry entry_method "auto_check": a person read it in a browser, which is entry_method "web".
    // Two rows shipped that badge for pages dmc.org has never let us read (2026-09-20), which is why this is a
    // build error and not a note. A row entered while the host still answered keeps auto_check: the badge is
    // about the day it was added, and that day it was true.
    if (r.status === 'active' && r.facts.entry_method === 'auto_check') {
      const url = r.facts.source?.url;
      const ref = url ? refusing.get(host(url) ?? '') : undefined;
      if (!url) e('entry_method is "auto_check" but there is no source url, so no machine can have matched a page');
      else if (!r.facts.checked_at_entry) e('entry_method is "auto_check" but there is no checked_at_entry saying when');
      else if (ref && r.facts.checked_at_entry >= ref.refusing_since)
        e(`entry_method is "auto_check" (badge: "Matched their website when added") for ${url}, but ${ref.host} has refused this pipeline's fetcher since ${ref.refusing_since} (${ref.refusal}) and the row was entered on ${r.facts.checked_at_entry}. Read the page in a browser and set entry_method "web", or correct data/seed/script-refusing-hosts.csv`);
    }
  }
  return { errors, warnings };
}

/**
 * The HSDS export is published too, and it is the copy other people read. A domestic-violence service must be
 * virtual there: no `addresses`, no `latitude`/`longitude`, no `postal_code`. Checked on the exported objects
 * themselves rather than on the rows they came from, so a change to the exporter cannot quietly leak a place.
 */
export function validateHsdsPrivacy(services: unknown[]): Issues {
  const errors: string[] = [];
  for (const svc of services as any[]) {
    if (!isDvCategory(svc?.x_detroit?.category ?? '')) continue;
    for (const sal of svc.service_at_locations ?? []) {
      const id = sal?.x_detroit?.id ?? svc.x_detroit?.id, loc = sal?.location ?? {};
      if (loc.addresses?.length) errors.push(`HSDS ${id}: a domestic violence service must carry no address`);
      if (loc.latitude !== undefined || loc.longitude !== undefined) errors.push(`HSDS ${id}: a domestic violence service must carry no coordinates`);
      if (loc.location_type !== 'virtual') errors.push(`HSDS ${id}: a domestic violence location must be "virtual", not "${loc.location_type}"`);
    }
  }
  return { errors, warnings: [] };
}

/**
 * `places` is the set of place ids in data/ingested/region.json. A row with an `area` belongs to one place and is
 * shown only on that place's page (a city's own police, 2026-09-24); it names a place that exists, and 911 and 988
 * are never scoped to one.
 */
export function validateEmergency(rows: CsvRow[], todayStr: string, release: boolean, places?: Set<string>): Issues & { verified: boolean } {
  const errors: string[] = [], warnings: string[] = [];
  const need = new Map([['emg_911', '911'], ['emg_988', '988']]);
  let verified = true;
  for (const r of rows) {
    if (!parsePhone(r.number ?? '')) errors.push(`${r.id}: "${r.number}" is not a valid number`);
    if (r.area && need.has(r.id!)) errors.push(`${r.id}: 911 and 988 belong to everyone and carry no area`);
    if (r.area && places && !places.has(r.area)) errors.push(`${r.id}: area "${r.area}" is not a place in data/ingested/region.json`);
    if (need.has(r.id!)) {
      if (r.number !== need.get(r.id!) || r.hardcoded !== 'yes') errors.push(`${r.id}: must be ${need.get(r.id!)} and hardcoded`);
      need.delete(r.id!);
      continue; // 911 and 988 are never test-called
    }
    // 911 and 988 are hardcoded (handled above). Any other number, including 211, follows the same rule as the rest.
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

/**
 * Ids for open-data rows are keyed to the publisher's permanent record reference and are never reused
 * (DECISIONS 2026-09-22, pipeline/src/ingest-ids.ts). Two things are checkable from what is committed, and
 * both of them are the bug that swapped the two Narcan boxes at 13601 W. McNichols: one id must never stand
 * for two different records, and an id retired from a record must never come back on a different one.
 */
export function validateIngestedIds(srcId: string, live: CsvRow[], retired: CsvRow[]): Issues {
  const errors: string[] = [];
  const recordOf = new Map<string, string>();
  for (const r of live) {
    const id = r.sal_id ?? '', key = recordKey(r), had = recordOf.get(id);
    if (had !== undefined && had !== key) errors.push(`${srcId}: ${id} stands for two different records ("${had}" and "${key}")`);
    recordOf.set(id, key);
  }
  for (const t of retired) {
    const now = recordOf.get(t.sal_id ?? '');
    if (now !== undefined && now !== (t.record_ref ?? '')) errors.push(`${srcId}: ${t.sal_id} was retired from "${t.record_ref}" and now belongs to "${now}"; a retired id is never reused`);
  }
  return { errors, warnings: [] };
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
