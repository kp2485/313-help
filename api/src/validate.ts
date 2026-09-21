// Request bodies are closed schemas: an unknown key is a 400, not a shrug. If a client bug ever
// tries to send an install id or coordinates, it fails loudly in development instead of being stored.

export const LISTING_KINDS = ['confirmed_ok', 'closed_permanently', 'moved', 'wrong_hours', 'wrong_phone', 'out_of_stock', 'wrong_info'] as const;
// Condition reports are about things, never people (docs/11). There is deliberately no kind for a
// person, a tent, a vehicle someone sleeps in, or "suspicious activity". Do not add one.
export const PLACE_KINDS = ['looks_good', 'light_out', 'glass_trash', 'flooding_ice', 'path_damaged', 'overgrown', 'broken_fixture', 'restroom', 'dumping'] as const;
export const CLOSED_KINDS = ['closed_permanently', 'moved'];
export const WRONG_KINDS = ['wrong_hours', 'wrong_phone', 'wrong_info'];
// "Still open" and "looks good": counted for the badge, never something a steward has to settle.
export const CONFIRM_KINDS = ['confirmed_ok', 'looks_good'];
export const HOW_KNOWN = ['run_it', 'volunteer', 'went_there', 'heard'] as const;

const LISTING_ID = /^sal_[a-z0-9_]{1,80}$/;
const PLACE_ID = /^(seg|plc)_[a-z0-9_]{1,80}$/;
const NONCE = /^[a-f0-9]{64}$/;
const CATEGORY = /^[a-z]+(\.[a-z_]+)?$/;

const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** Masks contact details before anything is stored (audit B6). */
export const mask = (s: string) => s.replace(EMAIL, '[removed]').replace(PHONE, '[removed]');

export const isListingId = (s: unknown): s is string => typeof s === 'string' && LISTING_ID.test(s);
export const ARCHIVE_REASONS = ['closed_permanently', 'moved', 'duplicate', 'never_existed', 'program_ended'];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function closed(body: unknown, allowed: string[]): Result<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('body must be a JSON object');
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  return extra.length ? fail(`unknown field: ${extra.join(', ')}`) : { ok: true, value: body as Record<string, unknown> };
}
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Minute precision for listings, hour precision for places (the reporter is standing there). Future or junk -> null. */
export function coarseTime(v: unknown, now: Date, hourOnly: boolean): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 5 * 60000 || d.getTime() < now.getTime() - 30 * 86400000) return null;
  return hourOnly ? d.toISOString().slice(0, 13) + ':00Z' : d.toISOString().slice(0, 16) + 'Z';
}

export interface ReportInput { target_id: string; place: boolean; kind: string; detail: string | null; suggested: string | null; observed_at: string | null; client_nonce: string; photo: string | null }

export function parseReport(body: unknown, now: Date): Result<ReportInput> {
  const b = closed(body, ['target_id', 'kind', 'detail', 'suggested', 'observed_at', 'client_nonce', 'photo']);
  if (!b.ok) return b;
  const { target_id, kind, client_nonce } = b.value;
  if (typeof target_id !== 'string' || !(LISTING_ID.test(target_id) || PLACE_ID.test(target_id))) return fail('bad target_id');
  const place = PLACE_ID.test(target_id);
  if (typeof kind !== 'string' || !(place ? PLACE_KINDS : LISTING_KINDS).includes(kind as never)) return fail('bad kind for this target');
  if (typeof client_nonce !== 'string' || !NONCE.test(client_nonce)) return fail('bad client_nonce');

  let suggested: string | null = null;
  if (b.value.suggested != null) {
    if (place) return fail('suggested is not accepted for places');
    const s = closed(b.value.suggested, ['hours', 'address', 'phone']);
    if (!s.ok) return s;
    // Hours and address are typed words and get masked; phone is the listing's own number, the point of the correction.
    const clean = Object.fromEntries(Object.entries(s.value).map(([k, v]) => [k, text(v, 200)]).filter(([, v]) => v).map(([k, v]) => [k, k === 'phone' ? v : mask(v!)]));
    if (Object.keys(clean).length) suggested = JSON.stringify(clean);
  }
  // A photo is only ever about a place (a thing), never about a listing, and only by the key the upload returned.
  let photo: string | null = null;
  if (b.value.photo != null) {
    if (!place) return fail('photo is only accepted for places');
    if (typeof b.value.photo !== 'string' || !/^ph_[a-f0-9]{32}$/.test(b.value.photo)) return fail('bad photo');
    photo = b.value.photo;
  }
  const detail = text(b.value.detail, 280);
  return { ok: true, value: { photo, target_id, place, kind, detail: detail ? mask(detail) : null, suggested, observed_at: coarseTime(b.value.observed_at, now, place), client_nonce } };
}

export interface ProposalInput { name: string; category: string; what: string; address: string | null; phone: string | null; schedule_text: string | null; how_known: string; notes: string | null }

export function parseProposal(body: unknown): Result<ProposalInput> {
  const b = closed(body, ['name', 'category', 'what', 'address', 'phone', 'schedule_text', 'how_known', 'notes']);
  if (!b.ok) return b;
  const name = text(b.value.name, 120), what = text(b.value.what, 280), category = text(b.value.category, 40);
  if (!name || !what) return fail('name and what are required');
  if (!category || !CATEGORY.test(category)) return fail('bad category');
  if (!HOW_KNOWN.includes(b.value.how_known as never)) return fail('bad how_known');
  const notes = text(b.value.notes, 280), schedule = text(b.value.schedule_text, 200);
  return { ok: true, value: {
    // Free text is masked like a report note; `phone` is the place's public number and is kept as typed.
    name, category, what: mask(what),
    // A DV shelter's address must never enter the system, even as a proposal (docs/08).
    address: category === 'shelter.dv' ? null : text(b.value.address, 200),
    phone: text(b.value.phone, 40), schedule_text: schedule ? mask(schedule) : null,
    how_known: b.value.how_known as string, notes: notes ? mask(notes) : null,
  } };
}

const REPORT_ID = /^(rpt|cond)_[a-z0-9]{1,40}$/;
const TARGET_ID = /^(sal|seg|plc)_[a-z0-9_]{1,80}$/;
const idList = (v: unknown, re: RegExp, max: number): string[] | null => (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && re.test(x)) ? v as string[] : null);
/** Report ids the steward page showed (at most 500). A missing list is an empty one. */
export const reportIds = (v: unknown): string[] | null => (v == null ? [] : idList(v, REPORT_ID, 500));

export interface SettleInput { target_id: string; ids: string[]; status: string; reason_code: string }

/** Settle the reports a steward was shown on one listing or place, and no others. */
export function parseSettle(body: unknown, reasons: string[]): Result<SettleInput> {
  const b = closed(body, ['target_id', 'ids', 'status', 'reason_code']);
  if (!b.ok) return b;
  const { target_id, status, reason_code } = b.value, ids = idList(b.value.ids, REPORT_ID, 500);
  if (typeof target_id !== 'string' || !TARGET_ID.test(target_id)) return fail('bad target_id');
  if (!ids) return fail('ids must be a list of at most 500 report ids');
  if (!['accepted', 'rejected', 'duplicate'].includes(status as string) || !reasons.includes(reason_code as string)) return fail('status and a known reason_code are required');
  return { ok: true, value: { target_id, ids, status: status as string, reason_code: reason_code as string } };
}

// Tasks the machine raises for a steward (DECISIONS 2026-09-19). The detail is the page matcher's own words: which of
// the listing's published phone numbers or street address it could not find, or why the page could not be read.
export const TASK_RESULTS = ['missing', 'unreadable'];
export const TASK_REASONS = ['checked_fine', 'will_fix'];
export interface TaskInput { target_id: string; result: string; detail: string; checked_on: string }

export function parseTasks(body: unknown): Result<TaskInput[]> {
  const b = closed(body, ['tasks']);
  if (!b.ok) return b;
  const list = b.value.tasks;
  if (!Array.isArray(list) || list.length > 2000) return fail('tasks must be a list');
  const out: TaskInput[] = [];
  for (const t of list) {
    const c = closed(t, ['target_id', 'result', 'detail', 'checked_on']);
    if (!c.ok) return c;
    const { target_id, result, detail, checked_on } = c.value;
    if (!isListingId(target_id)) return fail('bad target_id');
    if (!TASK_RESULTS.includes(result as string)) return fail('bad result');
    if (typeof detail !== 'string' || !detail.trim() || detail.length > 300) return fail('detail must be 1 to 300 characters');
    if (typeof checked_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(checked_on)) return fail('checked_on must be a date');
    if (out.some((o) => o.target_id === target_id)) return fail(`${target_id} is listed twice`);
    out.push({ target_id, result: result as string, detail: detail.trim(), checked_on });
  }
  return { ok: true, value: out };
}

// ---- steward writes ----------------------------------------------------------------------------
// These three used to read the body by hand, which meant an unknown key was silently ignored and one of them had no
// size cap at all (review 2026-09-20). They are closed schemas now, like everything a resident sends.

const STATUSES = ['accepted', 'rejected', 'duplicate'];
/** A steward's own note on a decision. Kept as typed (it is their words, not a resident's), capped at 500. */
const note = (v: unknown): Result<string | null> => (v == null ? { ok: true, value: null } : typeof v === 'string' ? { ok: true, value: v.slice(0, 500) } : fail('note must be text'));

export interface ResolveInput { status: string; reason_code: string; note: string | null }

/** Settle one report or proposal. */
export function parseResolve(body: unknown, reasons: string[]): Result<ResolveInput> {
  const b = closed(body, ['status', 'reason_code', 'note']);
  if (!b.ok) return b;
  const { status, reason_code } = b.value;
  if (!STATUSES.includes(status as string) || !reasons.includes(reason_code as string)) return fail('status and a known reason_code are required');
  const n = note(b.value.note);
  if (!n.ok) return n;
  return { ok: true, value: { status: status as string, reason_code: reason_code as string, note: n.value } };
}

export interface ListingStatusInput { status: string; reason: string; replacement_id: string | null; note: string | null; report_ids: string[] }

/** Archive, pause, or restore one listing, settling the closure reports the page showed. */
export function parseListingStatus(body: unknown): Result<ListingStatusInput> {
  const b = closed(body, ['status', 'reason_code', 'replacement_id', 'note', 'report_ids']);
  if (!b.ok) return b;
  const { status, reason_code } = b.value;
  if (!['archived', 'suspended', 'active'].includes(status as string)) return fail('status must be archived, suspended, or active');
  if (reason_code != null && typeof reason_code !== 'string') return fail('status must be archived, suspended, or active');
  const shown = reportIds(b.value.report_ids);
  if (!shown) return fail('report_ids must be a list of at most 500 report ids');
  // Restoring is always `restored`: a steward cannot slip a phone check nobody made through this call (review 10b).
  const reason = status === 'archived' ? (reason_code as string | undefined) : status === 'active' ? 'restored' : (reason_code as string | undefined) ?? 'seasonal';
  if (status === 'archived' && !ARCHIVE_REASONS.includes(reason ?? '')) return fail(`archiving needs a reason: ${ARCHIVE_REASONS.join(', ')}`);
  if (status === 'active' && reason_code != null && reason_code !== 'restored') return fail('restoring takes no reason_code');
  if (b.value.replacement_id != null && !isListingId(b.value.replacement_id)) return fail('bad replacement_id');
  const n = note(b.value.note);
  if (!n.ok) return n;
  return { ok: true, value: { status: status as string, reason: reason as string, replacement_id: (b.value.replacement_id as string | undefined) ?? null, note: n.value, report_ids: shown } };
}

/** The ids that exist at a publish. Unknown-looking ids are dropped by the caller; nothing is ever deleted. */
export function parseTargets(body: unknown): Result<{ listings: string[]; places: string[] }> {
  const b = closed(body, ['listings', 'places']);
  if (!b.ok) return b;
  const { listings, places } = b.value;
  if (!Array.isArray(listings) || !Array.isArray(places) || ![...listings, ...places].every((x) => typeof x === 'string')) return fail('listings and places arrays are required');
  if (listings.length + places.length > 20000) return fail('too many ids');
  return { ok: true, value: { listings: listings as string[], places: places as string[] } };
}

export function parseDismiss(body: unknown): Result<{ reason: string }> {
  const b = closed(body, ['reason']);
  if (!b.ok) return b;
  return TASK_REASONS.includes(b.value.reason as string) ? { ok: true, value: { reason: b.value.reason as string } } : fail(`reason must be one of: ${TASK_REASONS.join(', ')}`);
}
