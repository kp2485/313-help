// Request bodies are closed schemas: an unknown key is a 400, not a shrug. If a client bug ever
// tries to send an install id or coordinates, it fails loudly in development instead of being stored.

export const LISTING_KINDS = ['confirmed_ok', 'closed_permanently', 'moved', 'wrong_hours', 'wrong_phone', 'out_of_stock', 'wrong_info'] as const;
// Condition reports are about things, never people (docs/11). There is deliberately no kind for a
// person, a tent, a vehicle someone sleeps in, or "suspicious activity". Do not add one.
export const PLACE_KINDS = ['looks_good', 'light_out', 'glass_trash', 'flooding_ice', 'path_damaged', 'overgrown', 'broken_fixture', 'restroom', 'dumping'] as const;
export const CLOSED_KINDS = ['closed_permanently', 'moved'];
export const WRONG_KINDS = ['wrong_hours', 'wrong_phone', 'wrong_info'];
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

export interface ReportInput { target_id: string; place: boolean; kind: string; detail: string | null; suggested: string | null; observed_at: string | null; client_nonce: string }

export function parseReport(body: unknown, now: Date): Result<ReportInput> {
  const b = closed(body, ['target_id', 'kind', 'detail', 'suggested', 'observed_at', 'client_nonce']);
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
    const clean = Object.fromEntries(Object.entries(s.value).map(([k, v]) => [k, text(v, 200)]).filter(([, v]) => v));
    if (Object.keys(clean).length) suggested = JSON.stringify(clean);
  }
  const detail = text(b.value.detail, 280);
  return { ok: true, value: { target_id, place, kind, detail: detail ? mask(detail) : null, suggested, observed_at: coarseTime(b.value.observed_at, now, place), client_nonce } };
}

export interface ProposalInput { name: string; category: string; what: string; address: string | null; phone: string | null; schedule_text: string | null; how_known: string; notes: string | null }

export function parseProposal(body: unknown): Result<ProposalInput> {
  const b = closed(body, ['name', 'category', 'what', 'address', 'phone', 'schedule_text', 'how_known', 'notes']);
  if (!b.ok) return b;
  const name = text(b.value.name, 120), what = text(b.value.what, 280), category = text(b.value.category, 40);
  if (!name || !what) return fail('name and what are required');
  if (!category || !CATEGORY.test(category)) return fail('bad category');
  if (!HOW_KNOWN.includes(b.value.how_known as never)) return fail('bad how_known');
  const notes = text(b.value.notes, 280);
  return { ok: true, value: {
    name, category, what,
    // A DV shelter's address must never enter the system, even as a proposal (docs/08).
    address: category === 'shelter.dv' ? null : text(b.value.address, 200),
    phone: text(b.value.phone, 40), schedule_text: text(b.value.schedule_text, 200),
    how_known: b.value.how_known as string, notes: notes ? mask(notes) : null,
  } };
}
