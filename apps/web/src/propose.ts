// "Add a place that helps" (docs/04). What leaves the phone is what the person typed about the PLACE:
// name, kind of help, address, times, phone, a note, and how they know. Nothing about the person: no
// account, no device id, no location. A steward checks every proposal before it can appear (docs/04).

import { outbox, retryable, type Sent } from './outbox.js';

export const HOW_KNOWN = ['run_it', 'volunteer', 'went_there', 'heard'] as const;
/** Kinds of help a person can pick. There is no choice for a domestic-violence shelter: those addresses
 *  must never be collected (docs/08), and the API drops them even if sent. */
export const PROPOSE_CATEGORIES = ['food', 'shelter.emergency', 'health', 'harm', 'utilities', 'hygiene', 'youth', 'rec'] as const;

export interface Proposal { name: string; category: string; what: string; address?: string; phone?: string; schedule_text?: string; how_known: string; notes?: string }

const LIMITS = { name: 120, what: 280, address: 200, phone: 40, schedule_text: 200, notes: 280 } as const;

/** Exactly the fields the API accepts (it rejects anything else), trimmed, empty ones left out. */
export function buildProposal(form: Record<string, string>): Proposal | null {
  const clean = (k: keyof typeof LIMITS) => (form[k] ?? '').trim().slice(0, LIMITS[k]);
  const name = clean('name'), what = clean('what'), category = form.category ?? '', how = form.how_known ?? '';
  if (!name || !what || !(PROPOSE_CATEGORIES as readonly string[]).includes(category) || !(HOW_KNOWN as readonly string[]).includes(how)) return null;
  const out: Proposal = { name, category, what, how_known: how };
  for (const k of ['address', 'phone', 'schedule_text', 'notes'] as const) { const v = clean(k); if (v) out[k] = v; }
  return out;
}

async function post(p: Proposal): Promise<Sent<string>> {
  try {
    const res = await fetch('/v1/proposals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p), credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (retryable(res.status)) return { sent: false };
    const ref = res.ok ? ((await res.json().catch(() => ({}))) as { ref?: string }).ref : undefined;
    return { sent: true, result: ref };  // any other 4xx will never succeed later; don't keep it
  } catch { return { sent: false }; }
}

const proposals = outbox<Proposal, string>('proposals', 10, post);

/** Sends now if it can; otherwise keeps it on the phone and tries again later (docs/05 "Offline"). */
export async function submitProposal(p: Proposal): Promise<{ state: 'sent' | 'queued'; ref?: string }> {
  const r = await proposals.submit(p);
  return r.sent ? { state: 'sent', ...(r.result ? { ref: r.result } : {}) } : { state: 'queued' };
}

export const flushProposals = () => proposals.flush();
