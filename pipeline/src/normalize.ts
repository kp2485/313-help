// Seed + ingested CSV rows -> (a) bundle rows for the apps, (b) nested HSDS 3.2 services for everyone else.

import type { BundleRow, Schedule, SourceType, VerifyMethod, Availability, RowStatus } from '@313help/query';
import { formatPhone, parsePhone, uuid5, type CsvRow } from './util.js';
import type { Source } from './ingest-arcgis.js';

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
      // A domestic-violence row's only statement about where it is: a coarse area, never a place (docs/08).
      ...(r.service_area ? { service_area: r.service_area } : {}),
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
        reports: { closed_open: 0, closed_last_at: null, wrong_open: 0 },   // filled from D1 once the Worker exists (build step 3)
        source: { type: (r.source_type || 'seed_list') as SourceType, name: r.source_name!, ...(r.source_url ? { url: r.source_url } : {}) },
      },
    };
  });
  return { rows, orgs, svcOf };
}

const ALWAYS = /^(open\s*)?24\s*(hrs?|hours)\.?$/i;
const DEVICE: Record<string, string> = { 'Vending Machine': 'vending machine', Newsstand: 'newsstand box', Countertop: 'countertop box', 'Wall Mount': 'wall box' };

/** What the layer calls its device, in our words. A layer that names several devices at one site just says "box". */
const deviceWord = (type: string) => DEVICE[Object.keys(DEVICE).find((k) => k.toLowerCase() === type.trim().toLowerCase()) ?? ''] ?? 'box';
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The plain wording a layer's rows carry. Every sentence states a fact the source states:
 *  - narcan_box: the Detroit Health Department's list, which names Narcan and nothing else.
 *  - supplies_station: Wayne County's Well Wayne Stations, which name naloxone (Narcan) *and* fentanyl and
 *    xylazine test strips, and whose own map adds that supplies can run out ("*Supplies are subject to change
 *    based on availability and may not always be available"). That is why they are harm.supplies, not harm.narcan.
 *    The County says "free" and nothing more: its page offers "free naloxone (Narcan®), fentanyl test strips,
 *    and xylazine test strips" and says nothing about ID or questions, so neither do we, and these rows do not
 *    carry the no_id_required flag (2026-09-20). The Health Department's own list does say "No ID, no cost, no
 *    questions", which is why narcan_box still does.
 */
const WORDING = {
  narcan_box: {
    service_name: 'Free Narcan and harm reduction supplies',
    what: (extra: Record<string, string>) => {
      const where = extra.Box_Location ? ` The box is ${extra.Box_Location.toLowerCase()}.` : '';
      return `Free Narcan from a ${deviceWord(extra.Distribution_Device_Type ?? '')}. No ID, no cost, no questions.${where}`;
    },
    /** The Health Department's own list says "No ID, no cost, no questions". */
    flags: ['walk_in', 'no_id_required'],
  },
  supplies_station: {
    service_name: 'Free naloxone and test strips',
    what: (extra: Record<string, string>) => {
      const spots = Object.keys(extra).filter((k) => /^Box_Location\d*$/.test(k)).sort().map((k) => lowerFirst(extra[k]!.replace(/\.$/, '')));
      const where = spots.length === 1 ? ` The station is ${spots[0]}.`
        : spots.length > 1 ? ` There are ${spots.length} stations here: ${spots.join('; ')}.` : '';
      return `Free naloxone (Narcan), fentanyl test strips and xylazine test strips from a ${deviceWord(extra.Station_Type ?? '')}.${where} What is in stock can change, so supplies may not always be there.`;
    },
    /** The County says only "free": no claim about ID or questions, so no no_id_required flag on these rows. */
    flags: ['walk_in'],
  },
} as const;

export function fromIngested(src: Source, ingested: CsvRow[]): Normalized {
  const orgs = new Map([[src.org!.id, src.org!.name]]), svcOf: Normalized['svcOf'] = new Map();
  const wording = WORDING[src.wording ?? 'narcan_box'];
  const rows = ingested.map((r): BundleRow => {
    const extra = Object.fromEntries((r.extra ?? '').split('; ').filter(Boolean).map((kv) => {
      const at = kv.indexOf('=');
      return [kv.slice(0, at), kv.slice(at + 1)] as [string, string];
    }));
    svcOf.set(r.sal_id!, { svc_id: `svc_${src.id}`, service_name: wording.service_name, org_id: src.org!.id });
    const ph = parsePhone(r.phone ?? '');
    const always = ALWAYS.test((r.hours_text ?? '').trim());
    const hasCoords = r.lat !== undefined && r.lat !== '' && r.lon !== undefined && r.lon !== '';
    return {
      id: r.sal_id!, name: r.name!, org: src.org!.name, category: src.category!,
      what: wording.what(extra),
      // A layer may publish a city of its own (this one spans four) and may have no street address at all.
      // A coordinate is never turned into an address: the row simply has none, and the map dot comes from the
      // publisher's own coordinate (DECISIONS 2026-09-20). validateRows checks every coordinate against the bbox.
      ...(r.address_1 ? { address: { line1: r.address_1, city: r.city || 'Detroit', ...(r.zip ? { zip: r.zip } : {}) } } : {}),
      ...(hasCoords ? { lat: Number(r.lat), lon: Number(r.lon) } : {}),
      // This is the host's number (the store, the center), not a Narcan line. Label it so.
      phones: ph ? [{ number: formatPhone(ph.number), label: 'Host site' }] : [],
      ...(r.website ? { website: r.website } : {}),
      // Hours text from a list is shown as written; only an unambiguous "24 hours" becomes open-now.
      availability: always ? 'always' : 'unknown',
      ...(!always && r.hours_text ? { hours_text: r.hours_text } : {}),
      // The flags a layer's rows carry are the ones its owner's words support (see WORDING).
      schedules: [], flags: [...wording.flags], status: 'active',
      facts: {
        checked_at_entry: null, entry_method: null, last_confirmed_at: null, last_confirm_method: null,
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
          // A place someone walks to is physical even when its publisher gives a point and no street address
          // (Wayne County's stations). Only a row with neither an address nor a point is virtual (a hotline, a DV row).
          id: uuid5(locSlug), name: row.name, location_type: row.address || row.lat !== undefined ? 'physical' : 'virtual',
          ...(row.lat !== undefined ? { latitude: row.lat, longitude: row.lon } : {}),
          ...(row.address ? { addresses: [{ id: uuid5(`${locSlug}#address`), address_1: row.address.line1, city: row.address.city, state_province: 'MI', postal_code: row.address.zip ?? '', country: 'US', address_type: 'physical' }] } : {}),
          x_detroit: { id: locSlug, ...(row.service_area ? { service_area: row.service_area } : {}) },
        },
        phones: row.phones.map((ph, i) => ({ id: uuid5(`${row.id}#phone${i}`), number: ph.number, ...(ph.label ? { description: ph.label } : {}) })),
        schedules: row.schedules.map((s, i) => hsdsSchedule(row.id, s, i)),
        x_detroit: { id: row.id, status: row.status, hsds_status: HSDS_STATUS[row.status], availability: row.availability, flags: row.flags, ...(row.service_area ? { service_area: row.service_area } : {}),
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
