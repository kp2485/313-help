// Seed + ingested CSV rows -> (a) bundle rows for the apps, (b) nested HSDS 3.2 services for everyone else.

import type { BundleRow, Schedule, SourceType, VerifyMethod, Availability, RowStatus } from '@detroithelp/query';
import { formatPhone, parsePhone, uuid5, type CsvRow } from './util.js';
import type { Source } from './ingest-arcgis.js';

// How long a confirmation stays good, by category (docs/04). Not a to-do list for anyone.
const CADENCE: [string, number][] = [
  ['food.mobile', 14], ['food.pantry', 45], ['food.meal', 45], ['harm.', 45], ['shelter.', 60], ['youth', 60],
  ['hygiene.', 45], ['utilities', 90], ['housing.', 90], ['health.', 180], ['rec.', 180], ['food.benefits', 365],
];
export const cadenceFor = (category: string) => CADENCE.find(([k]) => category.startsWith(k))?.[1] ?? 90;

export interface Normalized { rows: BundleRow[]; orgs: Map<string, string>; svcOf: Map<string, { svc_id: string; service_name: string; org_id: string }> }

function phones(r: CsvRow): BundleRow['phones'] {
  const out: BundleRow['phones'] = [];
  for (const [raw, label] of [[r.phone, r.phone_label], [r.phone2, r.phone2_label]] as const) {
    if (!raw) continue;
    const ph = parsePhone(raw);
    // Invalid numbers are kept as typed so the validator can name them; they never ship.
    out.push({ number: ph ? formatPhone(ph.number) + (ph.ext ? ` ext. ${ph.ext}` : '') : raw, ...(label ? { label } : {}) });
  }
  return out;
}

export function fromSeed(resources: CsvRow[], schedules: CsvRow[]): Normalized {
  const bySal = new Map<string, Schedule[]>();
  for (const s of schedules) {
    const sch: Schedule = { dtstart: s.dtstart!, opens_at: s.opens_at!, closes_at: s.closes_at! };
    if (s.freq) sch.freq = s.freq as Schedule['freq'];
    if (s.interval) sch.interval = Number(s.interval);
    for (const k of ['byday', 'bymonthday', 'until', 'valid_from', 'valid_to', 'description'] as const) if (s[k]) sch[k] = s[k];
    bySal.set(s.sal_id!, [...(bySal.get(s.sal_id!) ?? []), sch]);
  }
  const orgs = new Map<string, string>(), svcOf: Normalized['svcOf'] = new Map();
  const rows = resources.filter((r) => r.status !== 'proposed').map((r): BundleRow => {
    orgs.set(r.org_id!, r.org_name!);
    svcOf.set(r.sal_id!, { svc_id: r.svc_id || r.sal_id!.replace(/^sal_/, 'svc_'), service_name: r.service_name!, org_id: r.org_id! });
    const hasCoords = r.lat && r.lon;
    return {
      id: r.sal_id!, name: r.location_name || r.service_name!, org: r.org_name!, category: r.category!, what: r.what!,
      ...(r.eligibility ? { eligibility: r.eligibility } : {}),
      ...(r.address_1 ? { address: { line1: r.address_1, city: r.city || 'Detroit', ...(r.zip ? { zip: r.zip } : {}) } } : {}),
      ...(hasCoords ? { lat: Number(r.lat), lon: Number(r.lon) } : {}),
      phones: phones(r),
      ...(r.website ? { website: r.website } : {}),
      availability: (r.availability || 'unknown') as Availability,
      ...(r.hours_text ? { hours_text: r.hours_text } : {}),
      ...(r.notice ? { notice: r.notice } : {}),
      schedules: bySal.get(r.sal_id!) ?? [],
      flags: r.flags ? r.flags.split(',').map((f) => f.trim()).filter(Boolean) : [],
      status: r.status as RowStatus,
      facts: {
        checked_at_entry: r.checked_at_entry || null,
        entry_method: (r.entry_method || null) as VerifyMethod | null,
        last_confirmed_at: null, last_confirm_method: null,
        cadence_days: r.cadence_days ? Number(r.cadence_days) : cadenceFor(r.category!),
        reports: { closed_open: 0, closed_last_at: null, wrong_open: 0 },   // filled from D1 once the Worker exists (build step 3)
        source: { type: (r.source_type || 'seed_list') as SourceType, name: r.source_name!, ...(r.source_url ? { url: r.source_url } : {}) },
      },
    };
  });
  return { rows, orgs, svcOf };
}

const ALWAYS = /^(open\s*)?24\s*(hrs?|hours)\.?$/i;
const DEVICE: Record<string, string> = { 'Vending Machine': 'vending machine', Newsstand: 'newsstand box', Countertop: 'countertop box', 'Wall Mount': 'wall box' };

export function fromIngested(src: Source, ingested: CsvRow[]): Normalized {
  const orgs = new Map([[src.org!.id, src.org!.name]]), svcOf: Normalized['svcOf'] = new Map();
  const rows = ingested.map((r): BundleRow => {
    const extra = Object.fromEntries((r.extra ?? '').split('; ').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
    const device = DEVICE[extra.Distribution_Device_Type ?? ''] ?? 'box';
    const where = extra.Box_Location ? ` The box is ${extra.Box_Location.toLowerCase()}.` : '';
    svcOf.set(r.sal_id!, { svc_id: `svc_${src.id}`, service_name: 'Free Narcan and harm reduction supplies', org_id: src.org!.id });
    const ph = parsePhone(r.phone ?? '');
    const always = ALWAYS.test((r.hours_text ?? '').trim());
    return {
      id: r.sal_id!, name: r.name!, org: src.org!.name, category: src.category!,
      what: `Free Narcan from a ${device}. No ID, no cost, no questions.${where}`,
      address: { line1: r.address_1!, city: 'Detroit', ...(r.zip ? { zip: r.zip } : {}) },
      lat: Number(r.lat), lon: Number(r.lon),
      // This is the host's number (the store, the center), not a Narcan line. Label it so.
      phones: ph ? [{ number: formatPhone(ph.number), label: 'Host site' }] : [],
      ...(r.website ? { website: r.website } : {}),
      // Hours text from a list is shown as written; only an unambiguous "24 hours" becomes open-now.
      availability: always ? 'always' : 'unknown',
      ...(!always && r.hours_text ? { hours_text: r.hours_text } : {}),
      schedules: [], flags: ['walk_in', 'no_id_required'], status: 'active',
      facts: {
        checked_at_entry: null, entry_method: null, last_confirmed_at: null, last_confirm_method: null,
        cadence_days: src.cadence_days ?? cadenceFor(src.category!),
        reports: { closed_open: 0, closed_last_at: null, wrong_open: 0 },
        source: { type: 'open_data', name: src.name, url: src.page ?? src.url, last_edited: r.source_last_edited || null },
      },
    };
  });
  return { rows, orgs, svcOf };
}

// ---- HSDS 3.2 export -------------------------------------------------------

const HSDS_STATUS: Record<RowStatus, string> = { active: 'active', suspended: 'temporarily closed', archived: 'defunct' };
const ALL_DAYS = 'MO,TU,WE,TH,FR,SA,SU';

function hsdsSchedule(salId: string, s: Schedule, i: number) {
  // HSDS freq allows only WEEKLY and MONTHLY; a daily schedule is weekly on every day.
  const daily = s.freq === 'DAILY';
  return {
    id: uuid5(`${salId}#schedule${i}`),
    ...(s.freq ? { freq: daily ? 'WEEKLY' : s.freq } : {}),
    ...(s.interval ? { interval: s.interval } : {}),
    ...(daily ? { byday: ALL_DAYS } : s.byday ? { byday: s.byday } : {}),
    ...(s.bymonthday ? { bymonthday: s.bymonthday } : {}),
    dtstart: s.dtstart, ...(s.until ? { until: s.until } : !s.freq ? { until: s.dtstart } : {}),
    ...(s.valid_from ? { valid_from: s.valid_from } : {}), ...(s.valid_to ? { valid_to: s.valid_to } : {}),
    // HSDS `timezone` is a numeric UTC offset, which is wrong for half the year in a DST zone.
    // Times are wall-clock; the zone name rides in the extension.
    opens_at: s.opens_at, closes_at: s.closes_at, x_detroit: { timezone: 'America/Detroit', wall_clock: true },
    ...(s.description ? { description: s.description } : {}),
  };
}

export function toHsds(all: Normalized[]) {
  const services = new Map<string, any>();
  for (const { rows, orgs, svcOf } of all) {
    for (const row of rows) {
      const meta = svcOf.get(row.id)!;
      let svc = services.get(meta.svc_id);
      if (!svc) {
        svc = {
          id: uuid5(meta.svc_id), name: meta.service_name, status: 'active', description: row.what,
          ...(row.eligibility ? { eligibility_description: row.eligibility } : {}),
          ...(row.website ? { url: row.website } : {}),
          organization: { id: uuid5(meta.org_id), name: orgs.get(meta.org_id)!, description: orgs.get(meta.org_id)!, x_detroit: { id: meta.org_id } },
          service_at_locations: [], x_detroit: { id: meta.svc_id, category: row.category },
        };
        services.set(meta.svc_id, svc);
      }
      // HSDS core fields carry what any consumer needs even if it ignores x_detroit (10-B11).
      const touched = [row.facts.last_confirmed_at, row.facts.checked_at_entry].filter(Boolean).sort().pop();
      if (touched && (!svc.assured_date || touched > svc.assured_date)) svc.assured_date = touched.slice(0, 10);
      const locSlug = row.id.replace(/^sal_/, 'loc_');
      svc.service_at_locations.push({
        id: uuid5(row.id),
        location: {
          id: uuid5(locSlug), name: row.name, location_type: row.address ? 'physical' : 'virtual',
          ...(row.lat !== undefined ? { latitude: row.lat, longitude: row.lon } : {}),
          ...(row.address ? { addresses: [{ id: uuid5(`${locSlug}#address`), address_1: row.address.line1, city: row.address.city, state_province: 'MI', postal_code: row.address.zip ?? '', country: 'US', address_type: 'physical' }] } : {}),
          x_detroit: { id: locSlug },
        },
        phones: row.phones.map((ph, i) => ({ id: uuid5(`${row.id}#phone${i}`), number: ph.number, ...(ph.label ? { description: ph.label } : {}) })),
        schedules: row.schedules.map((s, i) => hsdsSchedule(row.id, s, i)),
        x_detroit: { id: row.id, status: row.status, hsds_status: HSDS_STATUS[row.status], availability: row.availability, flags: row.flags,
          ...(row.hours_text ? { hours_text: row.hours_text } : {}), ...(row.notice ? { notice: row.notice } : {}), ...row.facts, archived: row.archived ?? null },
      });
    }
  }
  for (const svc of services.values()) {
    const st = svc.service_at_locations.map((s: any) => s.x_detroit.status as RowStatus);
    svc.status = st.includes('active') ? 'active' : st.includes('suspended') ? 'temporarily closed' : 'defunct';
  }
  return [...services.values()].sort((a, b) => a.x_detroit.id.localeCompare(b.x_detroit.id));
}
