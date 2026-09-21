// Adds researched listings to the seed as `proposed` rows. Input: data/seed/incoming/*.txt, one
// pipe-delimited line per listing (12 fields, see FIELDS, and an optional 13th: `key=value` pairs separated
// by `;` for the columns a person used to fill in by hand, see EXTRAS). Nothing imported here is visible until
// `pnpm check:sources` finds the phone and street number on the listing's own source page.
//
// Hours become a schedule ONLY when every part parses cleanly. Anything else is kept as written
// (`hours_text`) and the listing says "call first". We never guess at a door's hours.

import { readdirSync, readFileSync } from 'node:fs';
import { isDvCategory, isServiceArea, SERVICE_AREA_IDS } from '@313help/query';
import { p, readCsv, slug, writeCsv, type CsvRow } from './util.js';
import { readResources, writeResources } from './seed-io.js';

const FIELDS = ['name', 'org', 'category', 'what', 'address', 'city', 'zip', 'phone', 'website', 'schedule', 'eligibility', 'source_url'] as const;
/** Optional 13th field: `flags=reentry,walk_in; phone_label=Intake; phone2=313-555-0100; phone2_label=Main line`. */
// `service_area` is how a steward enters the one coarse area a domestic-violence row may name — the only thing
// such a row ever says about where it is (packages/query/src/areas.ts, docs/08).
const EXTRAS = ['flags', 'phone_label', 'phone2', 'phone2_label', 'phone2_source_url', 'notice', 'service_area'] as const;
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_WORD: Record<string, string> = { m: 'MO', mon: 'MO', monday: 'MO', mondays: 'MO', t: 'TU', tu: 'TU', tue: 'TU', tues: 'TU', tuesday: 'TU', tuesdays: 'TU', w: 'WE', wed: 'WE', wednesday: 'WE', wednesdays: 'WE',
  th: 'TH', thu: 'TH', thur: 'TH', thurs: 'TH', thursday: 'TH', thursdays: 'TH', f: 'FR', fri: 'FR', friday: 'FR', fridays: 'FR', sat: 'SA', saturday: 'SA', saturdays: 'SA', sun: 'SU', sunday: 'SU', sundays: 'SU' };

function parseClock(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '24:00';
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'pm') h += 12;
  if (Number(m[1]) > 12 || Number(m[2] ?? 0) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

function parseDays(raw: string): string[] | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '').replace(/\s*(?:–|—|-|through|thru|to)\s*/g, '-').replace(/\s*(?:,|&|and)\s*/g, ',');
  if (s === 'daily' || s === 'every day' || s === '7 days a week') return [...DAYS];
  const out: string[] = [];
  for (const part of s.split(',').filter(Boolean)) {
    const range = part.split('-');
    const a = DAY_WORD[range[0]!.trim()], b = range[1] !== undefined ? DAY_WORD[range[1].trim()] : a;
    if (!a || !b || range.length > 2) return null;
    const i = DAYS.indexOf(a), j = DAYS.indexOf(b);
    if (j < i) return null;
    out.push(...DAYS.slice(i, j + 1));
  }
  return out.length ? [...new Set(out)] : null;
}

export interface ParsedWindow { byday: string; opens_at: string; closes_at: string }

/** The whole text says "always open" ("24 hours", "Open 24/7", "24 hours a day, 7 days a week"), and nothing else. */
const ALWAYS = /^\s*(?:open\s+)?24\s*(?:hours|hrs|\/\s*7)(?:\s*(?:a|per)\s*day)?(?:,?\s*7\s*days(?:\s*(?:a|per)\s*week)?)?\s*\.?\s*$/i;

/** "Mon-Fri 8am-9pm; Sat 9am-5pm" -> windows. Returns null unless EVERY part is understood. */
export function parseSchedule(text: string): ParsedWindow[] | null {
  if (/24\s*(hours|hrs|\/\s*7)/i.test(text) || /not stated|varies|appointment|call/i.test(text)) return null;
  const windows: ParsedWindow[] = [];
  for (const part of text.split(/;|\n/).map((x) => x.trim()).filter(Boolean)) {
    // days, then one or more time ranges separated by "&" or "and" or ","
    const m = /^([A-Za-z.,&\s–—-]+?)[:\s]\s*(\d.*|noon.*)$/.exec(part);
    if (!m) return null;
    const days = parseDays(m[1]!.replace(/[:\s]+$/, ''));
    if (!days) return null;
    for (const range of m[2]!.split(/\s*(?:&|,|\band\b)\s*/)) {
      const ends = range.split(/\s*(?:–|—|-|\bto\b)\s*/);
      if (ends.length !== 2) return null;
      let open = parseClock(ends[0]!);
      const close = parseClock(ends[1]!);
      // "9-5pm", "1-3pm": the opening time borrows am/pm only when that gives a sensible window. The later of the
      // two sensible readings wins, so "1-3pm" is 1 pm to 3 pm, not a 14-hour window from 1 am.
      if (!open && close && /^\d{1,2}(:\d{2})?$/.test(ends[0]!.trim())) {
        const am = parseClock(ends[0]!.trim() + 'am'), pm = parseClock(ends[0]!.trim() + 'pm');
        open = pm && pm < close ? pm : am && am < close ? am : null;
      }
      if (!open || !close || close <= open) return null;
      windows.push({ byday: days.join(','), opens_at: open, closes_at: close });
    }
  }
  return windows.length ? windows : null;
}

export function titleFor(name: string, org: string): string {
  const words = org.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 3 && !['church', 'detroit', 'center', 'community', 'services'].includes(w));
  return !org || org === name || words.some((w) => name.toLowerCase().includes(w)) ? name : `${name}, ${org}`;
}

export function lineToRows(line: string): { resource: CsvRow; schedules: CsvRow[] } | string {
  const f = line.split('|').map((x) => x.trim());
  if (f.length !== FIELDS.length && f.length !== FIELDS.length + 1) return `expected ${FIELDS.length} fields (or ${FIELDS.length + 1} with extras), got ${f.length}`;
  const v = Object.fromEntries(FIELDS.map((k, i) => [k, f[i]!])) as Record<(typeof FIELDS)[number], string>;
  const extra: Partial<Record<(typeof EXTRAS)[number], string>> = {};
  for (const pair of (f[FIELDS.length] ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const eq = pair.indexOf('='), k = pair.slice(0, eq).trim(), val = pair.slice(eq + 1).trim();
    if (eq < 1 || !(EXTRAS as readonly string[]).includes(k)) return `unknown extra "${pair}" (allowed: ${EXTRAS.join(', ')})`;
    extra[k as (typeof EXTRAS)[number]] = k === 'flags' ? val.split(',').map((x) => x.trim()).filter(Boolean).join(',') : val;
  }
  if (extra.phone2 && !extra.phone2_label) return 'phone2 needs a phone2_label that says what the line is for';
  if (extra.service_area && !isServiceArea(extra.service_area)) return `unknown service_area "${extra.service_area}" (one of: ${SERVICE_AREA_IDS.join(', ')})`;
  // A domestic-violence row is never entered with a place, whatever the owner's page prints (docs/08).
  if (isDvCategory(v.category) && (v.address || v.zip)) return 'a domestic violence row must carry no address and no ZIP; give service_area=<area> in the extras instead';
  if (extra.service_area && !isDvCategory(v.category)) return 'service_area is for domestic violence rows only';
  if (!v.name || !v.category || !v.what || !v.source_url || !(v.phone || v.address)) return 'name, category, what, source_url and a phone or address are required';
  const id = `sal_${slug(`${v.org && !v.name.toLowerCase().includes(v.org.toLowerCase().slice(0, 12)) ? v.org.split(/\s+/).slice(0, 2).join(' ') + ' ' : ''}${v.name}`).slice(0, 56)}`;
  const always = ALWAYS.test(v.schedule);
  const windows = always ? null : parseSchedule(v.schedule);
  const hoursText = !always && !windows && v.schedule && !/^not stated$/i.test(v.schedule) ? v.schedule.slice(0, 160) : '';
  return {
    resource: {
      // "Food give-away" alone doesn't say whose it is; a title names the place unless the name already does.
      sal_id: id, svc_id: '', org_id: `org_${slug(v.org || v.name).slice(0, 40)}`, org_name: v.org || v.name, service_name: v.name, location_name: titleFor(v.name, v.org),
      category: v.category, what: v.what, eligibility: v.eligibility, address_1: v.address, city: v.address ? v.city || 'Detroit' : '', zip: v.zip, lat: '', lon: '', service_area: extra.service_area ?? '',
      phone: v.phone, phone_label: extra.phone_label ?? '', phone2: extra.phone2 ?? '', phone2_label: extra.phone2_label ?? '', phone2_source_url: extra.phone2_source_url ?? '', website: v.website, availability: always ? 'always' : windows ? 'scheduled' : 'call_first',
      hours_text: hoursText, flags: extra.flags ?? '', notice: extra.notice ?? '', status: 'proposed', checked_at_entry: '', entry_method: '', source_type: 'seed_list',
      source_name: `${v.org || v.name} website`, source_url: v.source_url, internal_note: '',
    },
    schedules: (windows ?? []).map((w) => ({ sal_id: id, freq: 'WEEKLY', interval: '', byday: w.byday, bymonthday: '', dtstart: '2026-09-14', until: '', valid_from: '', valid_to: '', opens_at: w.opens_at, closes_at: w.closes_at, description: '' })),
  };
}

const SCHEDULE_COLUMNS = ['sal_id', 'freq', 'interval', 'byday', 'bymonthday', 'dtstart', 'until', 'valid_from', 'valid_to', 'opens_at', 'closes_at', 'description'];

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (s: string | undefined): string => (s ?? '').replace(/\D/g, '');

/**
 * Is the row that already holds this id the same door the line describes?
 *
 * The organisation must match. The address alone cannot decide it: a steward or the geocoder corrects an
 * address in place after the import (three rows in the seed today read "Fenkell Ave." or a corrected house
 * number where the incoming line still says what the research said), and calling those collisions would cry
 * wolf on every run. So a differing address is only a collision when the phone differs too — two doors of one
 * organisation that share a phone and a service name still land on one id and are still dropped, as today;
 * that stays a note rather than an error, because it is far more often a corrected address.
 */
function sameDoor(existing: CsvRow, line: CsvRow): boolean {
  if (norm(existing.org_name) !== norm(line.org_name)) return false;
  return norm(existing.address_1) === norm(line.address_1) || (!!digits(line.phone) && digits(existing.phone) === digits(line.phone));
}

export interface ImportSummary { added: number; collisions: number }

/**
 * Imports parsed lines into `resources`/`schedules` (both mutated). A line whose id is already present is
 * skipped; when the row that holds the id is a *different* door, the skip is reported and counted.
 *
 * Why the ids collide at all: `lineToRows` builds the slug from the first two words of the org name plus the
 * service name, cut to 56 characters. "City of Hamtramck Assessor" and "City of Highland Park Assessor" both
 * contribute just "city_of", so two different cities' "Help with a property tax bill you cannot pay" landed on
 * one id and the second line vanished without a word (2026-09-20). Taking more of the org name would be a
 * better slug, but ids are stable slugs that are never reused: they are already in data/seed/schedules.csv,
 * the published data/hsds/ rows and signed bundles, and in reports that name a sal_id, so changing generation
 * would move existing ids. Doing it only when a collision is detected is worse still — the id a line gets
 * would then depend on which file happened to be read first. So generation is untouched and a collision is a
 * loud skip: a person renames the service, as they did by hand for the Highland Park line.
 */
export function importInto(
  files: { file: string; text: string }[],
  resources: CsvRow[],
  schedules: CsvRow[],
  log: (msg: string) => void = console.log,
  warn: (msg: string) => void = console.warn,
): ImportSummary {
  const have = new Map(resources.map((r) => [r.sal_id ?? '', r]));
  let added = 0, collisions = 0;
  for (const { file, text } of files) {
    for (const [n, line] of text.split('\n').entries()) {
      if (!line.trim() || line.startsWith('#')) continue;
      const out = lineToRows(line);
      if (typeof out === 'string') { warn(`${file}:${n + 1} skipped: ${out}`); continue; }
      const id = out.resource.sal_id!;
      const existing = have.get(id);
      if (existing) {
        if (!sameDoor(existing, out.resource)) {
          collisions++;
          warn(`${file}:${n + 1} skipped: id collision with ${id} (a different organisation or address already has this id); change the service name so the id is unique`);
        } else if (norm(existing.address_1) !== norm(out.resource.address_1)) {
          // Same organisation and phone, different address text: almost always an address corrected in the seed
          // after this line was imported. Worth one line so a person can see it, but not an error.
          log(`~ ${file}:${n + 1} already imported as ${id}; the seed row's address reads "${existing.address_1}" (corrected since, or a second site that needs its own service name)`);
        }
        // An identical re-import says nothing and changes nothing, as it always has.
        continue;
      }
      have.set(id, out.resource); resources.push(out.resource); schedules.push(...out.schedules); added++;
      log(`+ ${id}  ${out.resource.availability}${out.resource.hours_text ? `  (hours kept as written: "${out.resource.hours_text}")` : ''}`);
    }
  }
  return { added, collisions };
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/import-lines.ts')) {
  const dir = p('data/seed/incoming');
  const resources = readResources(), schedules = readCsv(p('data/seed/schedules.csv'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().map((file) => ({ file, text: readFileSync(`${dir}/${file}`, 'utf8') }));
  const { added, collisions } = importInto(files, resources, schedules);
  writeResources(resources);
  writeCsv(p('data/seed/schedules.csv'), schedules, SCHEDULE_COLUMNS);
  // Exit 0 even with collisions: every other skipped line (bad field count, unknown extra) is a warning here
  // too, and the person reads the summary. Nothing half-written — the good lines are saved either way.
  console.log(`${added} added as proposed, ${collisions} skipped for an id collision. Next: pnpm check:sources, then pnpm geocode.`);
}
