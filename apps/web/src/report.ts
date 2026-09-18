// Anonymous reports (docs/04). What leaves the phone: a listing or segment id, a kind, an optional
// note, a time, and a one-day hash. Nothing else exists to send: there is no account and no device id.

import { idbGet, idbSet } from './data.js';

export const LISTING_KINDS = ['closed_permanently', 'moved', 'wrong_hours', 'wrong_phone', 'out_of_stock', 'wrong_info'] as const;
export const PLACE_KINDS = ['light_out', 'glass_trash', 'flooding_ice', 'path_damaged', 'overgrown', 'broken_fixture', 'restroom', 'dumping'] as const;
export const CONFIRM = { listing: 'confirmed_ok', place: 'looks_good' } as const;

export interface Report { target_id: string; kind: string; detail?: string; observed_at: string; client_nonce: string }

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const detroitDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(d);

/** Random, made on this phone, never sent. Clearing site data resets it. */
async function installSecret(): Promise<string> {
  let s = await idbGet<string>('secret');
  if (!s) { s = hex(crypto.getRandomValues(new Uint8Array(32)).buffer); await idbSet('secret', s); }
  return s;
}

/** sha256(secret | target | day): the same phone reporting the same target twice in a day counts once;
 *  two targets, or two days, give hashes nobody can connect (audit A4). */
export async function nonce(targetId: string, when: Date, secret?: string): Promise<string> {
  const s = secret ?? (await installSecret());
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${s}|${targetId}|${detroitDay(when)}`)));
}

export async function build(targetId: string, kind: string, detail: string, when = new Date()): Promise<Report> {
  const text = detail.trim().slice(0, 280);
  return { target_id: targetId, kind, ...(text ? { detail: text } : {}), observed_at: when.toISOString().slice(0, 16) + 'Z', client_nonce: await nonce(targetId, when) };
}

async function post(r: Report): Promise<boolean> {
  try {
    const res = await fetch('/v1/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), credentials: 'omit', referrerPolicy: 'no-referrer' });
    return res.status < 500;   // a 4xx will never succeed later; don't keep it
  } catch { return false; }
}

/** Sends now if it can; otherwise keeps it on the phone and tries again later. */
export async function submit(r: Report): Promise<'sent' | 'queued'> {
  if (await post(r)) return 'sent';
  await idbSet('queue', [...((await idbGet<Report[]>('queue')) ?? []), r].slice(-50));
  return 'queued';
}

export async function flush(): Promise<void> {
  const queue = (await idbGet<Report[]>('queue')) ?? [];
  if (!queue.length) return;
  const left: Report[] = [];
  for (const r of queue) if (!(await post(r))) left.push(r);
  await idbSet('queue', left);
}
