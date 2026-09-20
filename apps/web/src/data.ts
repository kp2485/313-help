// Loads the signed bundle, verifies it, and keeps the verified copy in IndexedDB.
// Read path: IndexedDB first (instant, offline), then a background refresh.
// A bundle that fails verification is dropped and the old one stays. Nothing is sent anywhere.

import type { Alert, BundleRow, Segment } from '@313help/query';
import { sha256Hex, signatureOk } from './verify.js';

export interface BundleIndex {
  version: string; generated_at: string; retired?: boolean; photos?: boolean; emergency_verified: boolean; signing: 'release' | 'dev';
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
  events?: { id: string; title: string; starts_at: string; ends_at?: string; time_text?: string; department?: string; location?: string; url: string }[];
  events_source?: { name: string; page: string; fetched_at: string };
  parks?: { id: string; name: string; address: string; type: string; acres: number; lat: number; lon: number }[];
  parks_source?: { name: string; last_edited: string };
  /** ZIP -> [lat, lon] center point, for "Type a ZIP". */
  zips?: Record<string, [number, number]>;
  /** What transport layers this bundle carries (pipeline/src/ingest-transit.ts). The list itself is tiny and
   *  travels with the bundle; each layer's shapes live in map/transit/… and are fetched only when switched on. */
  transit?: { layers: TransitLayer[] };
}
export interface TransitLayer {
  id: string; kind: 'line' | 'point' | 'both'; file: string;
  lines: number; points: number; bytes: number;
  /** English fallback name, used only if the app has no words of its own for this layer id. */
  name: string;
  source: { name: string; url: string; page: string; license: string; fetched_at: string };
}

const BASE = '/data/bundle/v1/';
declare const __PINNED_KEYS__: string[];

// ---- IndexedDB, one key ----------------------------------------------------
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open('313help', 1);
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

/** One file of the bundle, checked against the checksum in the (already signature-checked) index. */
export async function fetchVerified(index: BundleIndex, name: string): Promise<unknown> {
  const meta = index.files[name];
  if (!meta) throw new Error(`not in the bundle: ${name}`);
  const b = await bytes(name);
  if ((await sha256Hex(b)) !== meta.sha256) throw new Error(`checksum mismatch: ${name}`);
  return parse(b);
}

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
  // map/ and indicators/ files are big and only needed when a person opens a map or a neighborhood page:
  // they are fetched and checked then (fetchVerified).
  await Promise.all(Object.entries(index.files).filter(([name]) => !name.startsWith('map/') && !name.startsWith('indicators/')).map(async ([name, meta]) => {
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
    events: (files['events.json'] as { events?: Bundle['events'] } | undefined)?.events,
    events_source: (files['events.json'] as { source?: Bundle['events_source'] } | undefined)?.source,
    parks: (files['places/parks.json'] as { parks?: Bundle['parks'] } | undefined)?.parks,
    parks_source: (files['places/parks.json'] as { source?: Bundle['parks_source'] } | undefined)?.source,
    zips: (files['places/zips.json'] as { zips?: Bundle['zips'] } | undefined)?.zips,
    transit: files['places/transit.json'] as Bundle['transit'],
  };
  await idbSet('bundle', next); // one put = atomic swap
  return next;
}
