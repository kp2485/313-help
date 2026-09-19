// Anonymous reports (docs/04). What leaves the phone: a listing or segment id, a kind, an optional
// note, a time, and a one-day hash. Nothing else exists to send: there is no account and no device id.

import { idbGet, idbSet } from './data.js';
import { outbox, retryable, type Sent } from './outbox.js';

export const LISTING_KINDS = ['closed_permanently', 'moved', 'wrong_hours', 'wrong_phone', 'out_of_stock', 'wrong_info'] as const;
export const PLACE_KINDS = ['light_out', 'glass_trash', 'flooding_ice', 'path_damaged', 'overgrown', 'broken_fixture', 'restroom', 'dumping'] as const;
export const CONFIRM = { listing: 'confirmed_ok', place: 'looks_good' } as const;

export interface Report { target_id: string; kind: string; detail?: string; observed_at: string; client_nonce: string; photo?: string }

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const detroitDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(d);

/** Random, made on this phone, never sent. Clearing site data resets it. */
async function installSecret(): Promise<string> {
  let s = await idbGet<string>('secret');
  if (!s) { s = hex(crypto.getRandomValues(new Uint8Array(32)).buffer); await idbSet('secret', s); }
  return s;
}

/** A new random key (About → Privacy). Reports made after this can't be matched to earlier ones, even on the same day. */
export async function resetInstallSecret(): Promise<void> {
  await idbSet('secret', hex(crypto.getRandomValues(new Uint8Array(32)).buffer));
}

/** sha256(secret | target | day): the same phone reporting the same target twice in a day counts once;
 *  two targets, or two days, give hashes nobody can connect (audit A4). */
export async function nonce(targetId: string, when: Date, secret?: string): Promise<string> {
  const s = secret ?? (await installSecret());
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${s}|${targetId}|${detroitDay(when)}`)));
}

export async function build(targetId: string, kind: string, detail: string, when = new Date(), photo?: string | null): Promise<Report> {
  const text = detail.trim().slice(0, 280);
  return { target_id: targetId, kind, ...(text ? { detail: text } : {}), ...(photo ? { photo } : {}), observed_at: when.toISOString().slice(0, 16) + 'Z', client_nonce: await nonce(targetId, when) };
}

/** Photos (docs/11), for condition reports about a place. The picture is drawn again on a canvas, at most 1280 px on
 *  its long side. A canvas keeps pixels only: the new file has no GPS position, no phone model, and no time inside it.
 *  The server refuses any photo that still carries such data, so a mistake here cannot leak. */
export const PHOTO_MAX_SIDE = 1280;
export function fitWithin(w: number, h: number, max = PHOTO_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/** Browsers add a color profile (and may add other blocks) to the JPEG a canvas makes. Keep only what a picture
 *  needs; the server accepts nothing else. Returns null if the bytes are not a JPEG we understand. */
export function plainJpeg(b: Uint8Array): Uint8Array | null {
  const KEEP = [0xe0, 0xdb, 0xc0, 0xc1, 0xc2, 0xc4, 0xdd];
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.slice(0, 2)];
  for (let i = 2; i + 3 < b.length;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!, len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m === 0xda) { parts.push(b.slice(i)); const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of parts) { out.set(x, at); at += x.length; } return out; }
    if (len < 2 || i + 2 + len > b.length) return null;
    if (KEEP.includes(m)) parts.push(b.slice(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}
export async function preparePhoto(file: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file), { w, h } = fitWithin(bmp.width, bmp.height);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close();
    const drawn = await new Promise<Blob | null>((ok) => canvas.toBlob((b) => ok(b), 'image/jpeg', 0.8));
    const plain = drawn && plainJpeg(new Uint8Array(await drawn.arrayBuffer()));
    return plain ? new Blob([plain as BlobPart], { type: 'image/jpeg' }) : null;
  } catch { return null; }
}
/** Returns the key to put on the report, or null if the photo could not be sent (the report still goes). */
export async function uploadPhoto(photo: Blob): Promise<string | null> {
  try {
    const res = await fetch('/v1/photos', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: photo, credentials: 'omit', referrerPolicy: 'no-referrer' });
    return res.status === 201 ? ((await res.json()) as { photo?: string }).photo ?? null : null;
  } catch { return null; }
}

async function post(r: Report): Promise<Sent<undefined>> {
  try {
    const res = await fetch('/v1/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), credentials: 'omit', referrerPolicy: 'no-referrer' });
    return { sent: !retryable(res.status) };   // any other 4xx will never succeed later; don't keep it
  } catch { return { sent: false }; }
}

const reports = outbox<Report>('queue', 50, post);

/** Sends now if it can; otherwise keeps it on the phone and tries again later. */
export async function submit(r: Report): Promise<'sent' | 'queued'> {
  return (await reports.submit(r)).sent ? 'sent' : 'queued';
}

export const flush = () => reports.flush();
