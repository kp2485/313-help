// Loads the signed bundle, verifies it, and keeps the verified copy in IndexedDB.
// Read path: IndexedDB first (instant, offline), then a background refresh.
// A bundle that fails verification is dropped and the old one stays. Nothing is sent anywhere.

import type { Alert, BundleRow, Segment } from '@detroithelp/query';
import { sha256Hex, signatureOk } from './verify.js';

export interface BundleIndex {
  version: string; generated_at: string; heartbeat: string; emergency_verified: boolean; signing: 'release' | 'dev';
  counts: Record<string, number>; files: Record<string, { sha256: string; bytes: number }>;
}
export interface EmergencyNumber { id: string; label: string; number: string; sms?: string; hardcoded: boolean }
export interface Bundle {
  index: BundleIndex;
  rows: BundleRow[];
  alerts: Alert[];
  emergency: EmergencyNumber[];
  archived: { id: string; name: string; category: string; archived: { at: string; reason: string; replacement_id?: string } }[];
  greenway: { source: { name: string; last_edited: string }; segments: Segment[] } | null;
}

const BASE = '/data/bundle/v1/';
declare const __PINNED_KEYS__: string[];

// ---- IndexedDB, one key ----------------------------------------------------
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open('detroithelp', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try { const d = await db(); return await new Promise((ok, no) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => ok(q.result as T); q.onerror = () => no(q.error); }); }
  catch { return undefined; } // private mode or blocked storage: the app still works online
}
export async function idbSet(key: string, val: unknown): Promise<void> {
  try { const d = await db(); await new Promise<void>((ok, no) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); }); }
  catch { /* ignore */ }
}

export const cached = () => idbGet<Bundle>('bundle');

async function bytes(path: string): Promise<Uint8Array> {
  const res = await fetch(BASE + path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}
const parse = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));

/** Returns a new verified bundle, or null when there is nothing newer. Throws on any verification failure. */
export async function refresh(current?: Bundle): Promise<Bundle | null> {
  const [indexBytes, sigBytes] = await Promise.all([bytes('index.json'), bytes('index.json.sig')]);
  const sig = parse(sigBytes) as { signature: string };
  if (!(await signatureOk(indexBytes, sig.signature, __PINNED_KEYS__))) throw new Error('bundle signature did not match a pinned key');
  const index = parse(indexBytes) as BundleIndex;
  if (current && current.index.version === index.version) return null;
  // Never go backwards: a replayed old bundle is as dangerous as a forged one.
  if (current && index.generated_at < current.index.generated_at) throw new Error('bundle is older than the one we have');

  const files: Record<string, unknown> = {};
  await Promise.all(Object.entries(index.files).map(async ([name, meta]) => {
    const b = await bytes(name);
    if ((await sha256Hex(b)) !== meta.sha256) throw new Error(`checksum mismatch: ${name}`);
    files[name] = parse(b);
  }));

  const next: Bundle = {
    index,
    rows: Object.keys(files).filter((n) => n.startsWith('category/')).flatMap((n) => files[n] as BundleRow[]),
    alerts: (files['alerts.json'] ?? []) as Alert[],
    emergency: (files['emergency.json'] ?? []) as EmergencyNumber[],
    archived: (files['archived.json'] ?? []) as Bundle['archived'],
    greenway: (files['places/greenway.json'] ?? null) as Bundle['greenway'],
  };
  await idbSet('bundle', next); // one put = atomic swap
  return next;
}
