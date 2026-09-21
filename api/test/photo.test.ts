import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, photoRetention, retention, type Db, type Env, type Stmt } from '../src/index.js';
import { checkJpeg, type PhotoStore } from '../src/photo.js';

// Photos on condition reports (docs/11): no metadata can be stored, photos are never public, and they are deleted on time.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
function fakeD1(): Db & { raw: InstanceType<typeof DatabaseSync> } {
  const raw = new DatabaseSync(':memory:');
  for (const f of readdirSync(join(__dirname, '../migrations')).sort()) raw.exec(readFileSync(join(__dirname, '../migrations', f), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): Stmt => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...(args as never[])).changes) } }),
    all: async <T>() => ({ results: raw.prepare(sql).all(...(args as never[])) as T[] }),
    first: async <T>() => (raw.prepare(sql).get(...(args as never[])) ?? null) as T | null,
  });
  // Like D1, a batch is one transaction and answers one result per statement.
  const batch = async (s: Stmt[]) => {
    raw.exec('BEGIN');
    try { const out = []; for (const x of s) out.push(await x.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  };
  return { raw, prepare: (sql) => stmt(sql), batch };
}
function fakeBucket(): PhotoStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return { files, put: async (k, v) => { files.set(k, new Uint8Array(v as ArrayBuffer)); }, get: async (k) => (files.has(k) ? { arrayBuffer: async () => files.get(k)!.slice().buffer as ArrayBuffer } : null),
    delete: async (k) => { for (const x of Array.isArray(k) ? k : [k]) files.delete(x); } };
}

// A tiny JPEG skeleton. checkJpeg reads structure, not pixels, so the picture data can be filler.
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload];
const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
function jpeg(o: { extra?: number[]; after?: number[]; w?: number; h?: number; app0?: string } = {}): Uint8Array {
  const w = o.w ?? 1280, h = o.h ?? 960;
  return new Uint8Array([0xff, 0xd8, ...seg(0xe0, [...ascii(o.app0 ?? 'JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...(o.extra ?? []), ...seg(0xdb, new Array(65).fill(1)),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]), ...seg(0xc4, new Array(20).fill(2)), ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    ...new Array(30).fill(0x55), 0xff, 0x00, 0x12, 0xff, 0xd0, 0x34, 0xff, 0xd9, ...(o.after ?? [])]);
}
const EXIF = seg(0xe1, [...ascii('Exif'), 0, 0, ...ascii('MM'), 0, 42, ...ascii('GPSLatitude 42.3314 iPhone 15')]);

const NOW = new Date('2026-09-18T17:41:37.512Z');
let db: ReturnType<typeof fakeD1>, bucket: ReturnType<typeof fakeBucket>, env: Env;
const app = createApp({ now: () => NOW });
const upload = (bytes: Uint8Array, headers: Record<string, string> = {}, e: Env = env) => app.request('/v1/photos', { method: 'POST', body: bytes as unknown as BodyInit, headers: { 'content-type': 'image/jpeg', ...headers } }, e);
const report = (body: object) => app.request('/v1/reports', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, env);
const steward = (path: string, init: RequestInit = {}) =>
  app.request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(init.headers as Record<string, string>) } }, { ...env, DEV_STEWARD: 'local' });
beforeEach(() => {
  db = fakeD1(); bucket = fakeBucket(); env = { DB: db, PHOTOS: bucket, PHOTOS_ENABLED: 'true' };
  db.raw.exec("INSERT INTO targets VALUES ('sal_b', 'listing'), ('seg_conrail_warren_to_joy', 'place')");
});

describe('a photo can never carry metadata into storage', () => {
  it('accepts the plain JPEG a canvas makes', () => expect(checkJpeg(jpeg())).toMatchObject({ ok: true, width: 1280, height: 960 }));
  it('refuses Exif (GPS, device, time), XMP, ICC, IPTC, and comments', () => {
    expect(checkJpeg(jpeg({ extra: EXIF }))).toEqual({ ok: false, error: 'photo carries metadata (Exif or XMP)' });
    for (const marker of [0xe2, 0xed, 0xee, 0xfe]) expect(checkJpeg(jpeg({ extra: seg(marker, ascii('made on a phone by someone')) })).ok, marker.toString(16)).toBe(false);
    expect(checkJpeg(jpeg({ app0: 'JFXX' })).ok).toBe(false);
  });
  it('APP0 must be exactly the 16-byte JFIF header: no thumbnail, nothing tucked in after it', () => {
    const app0 = (payload: number[]) => [0xff, 0xd8, ...seg(0xe0, payload)];
    const base = [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const rest = jpeg().slice(2 + 18);                                          // everything after the normal APP0
    const withApp0 = (payload: number[]) => new Uint8Array([...app0(payload), ...rest]);
    expect(checkJpeg(withApp0(base)).ok).toBe(true);
    expect(checkJpeg(withApp0([...base.slice(0, 12), 2, 2, ...new Array(12).fill(0x80)])).ok).toBe(false);   // a 2x2 thumbnail
    expect(checkJpeg(withApp0([...base, ...ascii('GPS 42.33 -83.04')])).ok).toBe(false);                      // hidden text
    expect(checkJpeg(withApp0(base.slice(0, 10))).ok).toBe(false);                                             // too short
  });
  it('drops anything hidden after the end of the picture', () => {
    const r = checkJpeg(jpeg({ after: ascii('<script>PK..zip or anything else</script>') }));
    expect(r.ok && r.clean.length).toBe(jpeg().length);
    expect(r.ok && new TextDecoder().decode(r.clean)).not.toContain('script');
  });
  it('refuses what the app would never send: not a JPEG, too big, cut short', () => {
    expect(checkJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(0)])).ok).toBe(false);
    expect(checkJpeg(jpeg({ w: 4032, h: 3024 }))).toEqual({ ok: false, error: 'photo is too large' });
    expect(checkJpeg(jpeg().slice(0, 140)).ok).toBe(false);
    expect(checkJpeg(new Uint8Array(1_600_000)).ok).toBe(false);
  });
});

describe('POST /v1/photos', () => {
  it('stores the cleaned picture under a random key, and nothing about who sent it', async () => {
    const res = await upload(jpeg({ after: ascii('TRAILER') }), { 'cf-connecting-ip': '203.0.113.77', 'user-agent': 'TestPhone/9 (unique-device-string)', cookie: 'session=abc123secret' });
    expect(res.status).toBe(201);
    const { photo } = (await res.json()) as { photo: string };
    expect(photo).toMatch(/^ph_[a-f0-9]{32}$/);
    expect(bucket.files.get(photo)!.length).toBe(jpeg().length);
    const all = JSON.stringify(db.raw.prepare('SELECT * FROM photos').all());
    for (const leak of ['203.0.113', 'TestPhone', 'abc123secret', ':37']) expect(all).not.toContain(leak);
    expect(all).toContain('2026-09-18T17:00Z');                // to the hour, like the report it rides on (docs/11)
    expect(all).not.toContain('17:41');
  });
  it('refuses a photo with Exif, a non-JPEG content type, and everything when photos are off', async () => {
    expect((await upload(jpeg({ extra: EXIF }))).status).toBe(422);
    expect(bucket.files.size).toBe(0);
    expect((await upload(jpeg(), { 'content-type': 'image/png' })).status).toBe(415);
    expect((await upload(jpeg(), {}, { DB: db })).status).toBe(503);
  });
  it('is off unless the switch is on, even with a bucket (DECISIONS 2026-09-19: off by default)', async () => {
    for (const v of [undefined, '', 'false', 'TRUE', '1']) expect((await upload(jpeg(), {}, { DB: db, PHOTOS: bucket, ...(v === undefined ? {} : { PHOTOS_ENABLED: v }) })).status, String(v)).toBe(503);
    expect(bucket.files.size).toBe(0);
    const toml = readFileSync(join(__dirname, '../wrangler.toml'), 'utf8');
    expect(toml).toMatch(/^PHOTOS_ENABLED = "false"/m);
  });
  it('the source never reads an IP or user agent, and no public route serves a photo back', () => {
    const src = readFileSync(join(__dirname, '../src/index.ts'), 'utf8') + readFileSync(join(__dirname, '../src/photo.ts'), 'utf8');
    for (const h of ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'user-agent']) { expect(src.toLowerCase()).not.toContain(`header('${h}`); expect(src.toLowerCase()).not.toContain(`header("${h}`); }
    expect(src.match(/app\.get\('\/v1\/(?!steward|health)[^']*photo/)).toBeNull();
  });
});

describe('a photo belongs to one report about a place', () => {
  const NONCE = 'b'.repeat(64);
  const key = async () => ((await (await upload(jpeg())).json()) as { photo: string }).photo;
  it('rides on a condition report and shows up in the steward queue only', async () => {
    const photo = await key();
    expect((await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE, photo })).status).toBe(202);
    const queue = (await (await steward('/v1/steward/queue')).json()) as { reports: { id: string; photo_key: string }[] };
    expect(queue.reports[0]!.photo_key).toBe(photo);
    expect(db.raw.prepare('SELECT report_id FROM photos').get()).toEqual({ report_id: queue.reports[0]!.id });
    const img = await steward(`/v1/steward/photos/${photo}`);
    expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/jpeg'); expect(img.headers.get('cache-control')).toBe('no-store');
    expect((await app.request(`/v1/steward/photos/${photo}`, {}, env)).status).toBe(401);       // no login, no photo
    expect((await app.request(`/v1/photos/${photo}`, {}, env)).status).toBe(404);               // there is no public way to read one
  });
  it('is refused on a listing report, with a made-up key, or a second time', async () => {
    const photo = await key();
    expect((await report({ target_id: 'sal_b', kind: 'wrong_hours', client_nonce: NONCE, photo })).status).toBe(400);
    expect((await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE, photo: 'ph_' + '0'.repeat(32) })).status).toBe(422);
    expect((await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE, photo })).status).toBe(202);
    expect((await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'glass_trash', client_nonce: 'c'.repeat(64), photo })).status).toBe(422);
  });
  it('two reports racing for one photo: only the first claims it, and the second is not stored with it', async () => {
    const photo = await key();
    expect((await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE, photo })).status).toBe(202);
    const first = (db.raw.prepare('SELECT id FROM reports').get() as { id: string }).id;
    // The second request's "is this photo free?" look happened before the first one claimed it.
    const stale: Db = { ...db, prepare: (sql) => (sql.startsWith('SELECT key FROM photos') ? { ...db.prepare(sql), bind: () => ({ ...db.prepare(sql), first: async () => ({ key: photo }) }) as Stmt } as Stmt : db.prepare(sql)) };
    const res = await app.request('/v1/reports', { method: 'POST', body: JSON.stringify({ target_id: 'seg_conrail_warren_to_joy', kind: 'glass_trash', client_nonce: 'c'.repeat(64), photo }), headers: { 'content-type': 'application/json' } }, { ...env, DB: stale });
    expect(res.status).toBe(422);
    expect(db.raw.prepare('SELECT report_id FROM photos').all()).toEqual([{ report_id: first }]);
    expect(db.raw.prepare('SELECT photo_key FROM reports WHERE id != ?').all(first)).toEqual([]);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM reports WHERE photo_key = ?').get(photo)).toEqual({ n: 1 });
  });
  it('a steward can discard a photo at once; the report stays', async () => {
    const photo = await key();
    await report({ target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE, photo });
    expect((await steward(`/v1/steward/photos/${photo}/discard`, { method: 'POST' })).status).toBe(200);
    expect(bucket.files.size).toBe(0);
    expect(db.raw.prepare('SELECT photo_key FROM reports').get()).toEqual({ photo_key: null });
    expect(db.raw.prepare('SELECT steward, action FROM steward_actions').get()).toEqual({ steward: 'dev:local', action: 'discard_photo' });
  });
});

describe('photos are deleted on time', () => {
  it('30 days after the report closes, or after a day if no report claimed them', async () => {
    const put = async (k: string) => bucket.put(k, jpeg());
    for (const k of ['ph_orphan_old', 'ph_orphan_new', 'ph_closed_old', 'ph_closed_new', 'ph_open']) await put(k);
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce, status, resolved_at, photo_key) VALUES
      ('cond_1', 'seg_conrail_warren_to_joy', 'light_out', '2026-07-01T10:00Z', '${'1'.repeat(64)}', 'accepted', '2026-08-01T10:00Z', 'ph_closed_old'),
      ('cond_2', 'seg_conrail_warren_to_joy', 'light_out', '2026-09-01T10:00Z', '${'2'.repeat(64)}', 'accepted', '2026-09-10T10:00Z', 'ph_closed_new'),
      ('cond_3', 'seg_conrail_warren_to_joy', 'light_out', '2026-06-01T10:00Z', '${'3'.repeat(64)}', 'open', NULL, 'ph_open')`);
    db.raw.exec(`INSERT INTO photos VALUES ('ph_orphan_old', '2026-09-16T10:00Z', NULL), ('ph_orphan_new', '2026-09-18T12:00Z', NULL),
      ('ph_closed_old', '2026-07-01T10:00Z', 'cond_1'), ('ph_closed_new', '2026-09-01T10:00Z', 'cond_2'), ('ph_open', '2026-06-01T10:00Z', 'cond_3')`);
    expect(await photoRetention(db, bucket, NOW)).toBe(2);
    expect([...bucket.files.keys()].sort()).toEqual(['ph_closed_new', 'ph_open', 'ph_orphan_new']);
    expect(db.raw.prepare("SELECT photo_key FROM reports WHERE id = 'cond_1'").get()).toEqual({ photo_key: null });
  });
  it('a report that turns into a monthly count takes its photo with it, and does not block the rest (review 12)', async () => {
    await bucket.put('ph_still_open', jpeg());
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce, status, photo_key) VALUES
      ('cond_old', 'seg_conrail_warren_to_joy', 'light_out', '2026-02-01T10:00Z', '${'4'.repeat(64)}', 'open', 'ph_still_open'),
      ('cond_old2', 'seg_conrail_warren_to_joy', 'light_out', '2026-02-02T10:00Z', '${'5'.repeat(64)}', 'open', NULL)`);
    db.raw.exec("INSERT INTO photos VALUES ('ph_still_open', '2026-02-01T10:00Z', 'cond_old')");
    expect(await retention(db, NOW, bucket)).toBe(2);
    expect(bucket.files.size).toBe(0);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM photos').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM reports').get()).toEqual({ n: 0 });
    expect(await retention(db, NOW, bucket)).toBe(0);                                        // the next night counts nothing twice
    expect(db.raw.prepare('SELECT n FROM report_counts').all()).toEqual([{ n: 2 }]);
  });
  it('without the bucket, a report with a photo waits rather than leave the picture behind', async () => {
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce, status, photo_key) VALUES
      ('cond_old', 'seg_conrail_warren_to_joy', 'light_out', '2026-02-01T10:00Z', '${'4'.repeat(64)}', 'open', 'ph_x'),
      ('cond_old2', 'seg_conrail_warren_to_joy', 'light_out', '2026-02-02T10:00Z', '${'5'.repeat(64)}', 'open', NULL)`);
    db.raw.exec("INSERT INTO photos VALUES ('ph_x', '2026-02-01T10:00Z', 'cond_old')");
    expect(await retention(db, NOW, undefined)).toBe(1);
    expect(db.raw.prepare('SELECT id FROM reports').all()).toEqual([{ id: 'cond_old' }]);
    expect(db.raw.prepare('SELECT n FROM report_counts').all()).toEqual([{ n: 1 }]);
  });
});
