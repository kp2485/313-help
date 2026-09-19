// Pulls report facts from the write API at build time and tells the API which ids exist.
// Only counts and dates cross this line; free text never enters the bundle or the dataset.
// Configured by REPORTS_API plus an Access service token; without them the build uses zeros.

import type { BundleRow } from '@detroithelp/query';

export interface Aggregates {
  circuit_breaker: boolean;
  targets: { target_id: string; closed_open: number; closed_last_at: string | null; wrong_open: number; last_confirmed_at: string | null }[];
  /** Steward decisions (admin tool). The seed files are never edited; these are applied at build time. */
  overrides?: { target_id: string; status: 'archived' | 'suspended' | 'active'; reason_code: string; replacement_id: string | null; at: string }[];
}

export function applyAggregates(rows: BundleRow[], agg: Aggregates): { applied: number; frozen: boolean } {
  const by = new Map(agg.targets.map((t) => [t.target_id, t]));
  let applied = 0;
  for (const r of rows) {
    const a = by.get(r.id);
    if (!a) continue;
    applied++;
    // Breaker tripped: closure reports across many listings in a day. Badges wait for a person (audit A1).
    if (!agg.circuit_breaker) r.facts.reports = { closed_open: a.closed_open, closed_last_at: a.closed_last_at, wrong_open: a.wrong_open };
    else r.facts.reports.wrong_open = a.wrong_open;
    // A visitor's confirm never overrides a newer check by a person with a phone.
    if (a.last_confirmed_at && (!r.facts.last_confirmed_at || a.last_confirmed_at > r.facts.last_confirmed_at)) {
      r.facts.last_confirmed_at = a.last_confirmed_at;
      r.facts.last_confirm_method = 'community_confirm';
    }
  }
  // A steward's decision is not subject to the circuit breaker: a person already looked.
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  for (const o of agg.overrides ?? []) {
    const r = rowsById.get(o.target_id);
    if (!r) continue;
    r.status = o.status;
    r.archived = o.status === 'archived' ? { at: o.at.slice(0, 10), reason: o.reason_code, ...(o.replacement_id ? { replacement_id: o.replacement_id } : {}) } : null;
    // A restore clears the closure reports the steward rejected. It is not a check: nobody called, so the badge keeps
    // whatever dated check the listing already had (review 10b). Older overrides said "confirmed_by_phone" by default.
    if (o.status === 'active') r.facts.reports = { closed_open: 0, closed_last_at: null, wrong_open: r.facts.reports.wrong_open };
  }
  return { applied, frozen: agg.circuit_breaker };
}

function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'CF-Access-Client-Id': process.env.ACCESS_CLIENT_ID ?? '', 'CF-Access-Client-Secret': process.env.ACCESS_CLIENT_SECRET ?? '' };
}

export async function fetchAggregates(): Promise<Aggregates | null> {
  const api = process.env.REPORTS_API;
  if (!api) return null;
  const res = await fetch(`${api}/v1/steward/aggregates`, { headers: headers() });
  if (!res.ok) throw new Error(`reports API answered ${res.status}; refusing to build with silently missing report data`);
  return (await res.json()) as Aggregates;
}

export async function pushTargets(listings: string[], places: string[]): Promise<void> {
  const api = process.env.REPORTS_API;
  if (!api) return;
  const res = await fetch(`${api}/v1/steward/targets`, { method: 'PUT', headers: headers(), body: JSON.stringify({ listings, places }) });
  if (!res.ok) throw new Error(`could not sync targets: ${res.status}`);
}
