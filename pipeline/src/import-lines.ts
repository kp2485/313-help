// Adds researched listings to the seed as `proposed` rows. Input: data/seed/incoming/*.txt, one
// pipe-delimited line per listing (12 fields, see FIELDS). Nothing imported here is visible until
// `pnpm check:sources` finds the phone and street number on the listing's own source page.
//
// Hours become a schedule ONLY when every part parses cleanly. Anything else is kept as written
// (`hours_text`) and the listing says "call first". We never guess at a door's hours.

import { readdirSync, readFileSync } from 'node:fs';
import { p, readCsv, slug, writeCsv, type CsvRow } from './util.js';
import { readResources, writeResources } from './seed-io.js';

const FIELDS = ['name', 'org', 'category', 'what', 'address', 'city', 'zip', 'phone', 'website', 'schedule', 'eligibility', 'source_url'] as const;
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
      // "9-5pm": the opening time borrows am/pm only when that gives a sensible window.
      if (!open && close && /^\d{1,2}(:\d{2})?$/.test(ends[0]!.trim())) {
        const am = parseClock(ends[0]!.trim() + 'am'), pm = parseClock(ends[0]!.trim() + 'pm');
        open = am && am < close ? am : pm && pm < close ? pm : null;
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
  if (f.length !== FIELDS.length) return `expected ${FIELDS.length} fields, got ${f.length}`;
  const v = Object.fromEntries(FIELDS.map((k, i) => [k, f[i]!])) as Record<(typeof FIELDS)[number], string>;
  if (!v.name || !v.category || !v.what || !v.source_url || !(v.phone || v.address)) return 'name, category, what, source_url and a phone or address are required';
  const id = `sal_${slug(`${v.org && !v.name.toLowerCase().includes(v.org.toLowerCase().slice(0, 12)) ? v.org.split(/\s+/).slice(0, 2).join(' ') + ' ' : ''}${v.name}`).slice(0, 56)}`;
  const always = /24\s*(hours|hrs|\/\s*7)/i.test(v.schedule);
  const windows = always ? null : parseSchedule(v.schedule);
  const hoursText = !always && !windows && v.schedule && !/^not stated$/i.test(v.schedule) ? v.schedule.slice(0, 160) : '';
  return {
    resource: {
      // "Food give-away" alone doesn't say whose it is; a title names the place unless the name already does.
      sal_id: id, svc_id: '', org_id: `org_${slug(v.org || v.name).slice(0, 40)}`, org_name: v.org || v.name, service_name: v.name, location_name: titleFor(v.name, v.org),
      category: v.category, what: v.what, eligibility: v.eligibility, address_1: v.address, city: v.address ? v.city || 'Detroit' : '', zip: v.zip, lat: '', lon: '',
      phone: v.phone, phone_label: '', phone2: '', phone2_label: '', website: v.website, availability: always ? 'always' : windows ? 'scheduled' : 'call_first',
      hours_text: hoursText, flags: '', notice: '', status: 'proposed', checked_at_entry: '', entry_method: '', source_type: 'seed_list',
      source_name: `${v.org || v.name} website`, source_url: v.source_url, cadence_days: '', internal_note: '',
    },
    schedules: (windows ?? []).map((w) => ({ sal_id: id, freq: 'WEEKLY', interval: '', byday: w.byday, bymonthday: '', dtstart: '2026-09-14', until: '', valid_from: '', valid_to: '', opens_at: w.opens_at, closes_at: w.closes_at, description: '' })),
  };
}

const SCHEDULE_COLUMNS = ['sal_id', 'freq', 'interval', 'byday', 'bymonthday', 'dtstart', 'until', 'valid_from', 'valid_to', 'opens_at', 'closes_at', 'description'];

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/import-lines.ts')) {
  const dir = p('data/seed/incoming');
  const resources = readResources(), schedules = readCsv(p('data/seed/schedules.csv'));
  const have = new Set(resources.map((r) => r.sal_id));
  let added = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    for (const [n, line] of readFileSync(`${dir}/${file}`, 'utf8').split('\n').entries()) {
      if (!line.trim() || line.startsWith('#')) continue;
      const out = lineToRows(line);
      if (typeof out === 'string') { console.warn(`${file}:${n + 1} skipped: ${out}`); continue; }
      if (have.has(out.resource.sal_id)) continue;
      have.add(out.resource.sal_id!); resources.push(out.resource); schedules.push(...out.schedules); added++;
      console.log(`+ ${out.resource.sal_id}  ${out.resource.availability}${out.resource.hours_text ? `  (hours kept as written: "${out.resource.hours_text}")` : ''}`);
    }
  }
  writeResources(resources);
  writeCsv(p('data/seed/schedules.csv'), schedules, SCHEDULE_COLUMNS);
  console.log(`${added} added as proposed. Next: pnpm check:sources, then pnpm geocode.`);
}
