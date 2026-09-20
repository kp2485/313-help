// The first night. Every scheduled job here has never run against a real database, and the first run is the one
// nobody watches: empty tables, no R2 bucket, Access not configured yet, a targets table with nothing in it.
// These tests hold the first run to the same promise as the hundredth: it either does the right thing or does
// nothing, and it never throws away a report or counts one twice.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { createApp, photoRetention, retention, type Db, type Env, type Stmt } from '../src/index.js';
import type { PhotoStore } from '../src/photo.js';

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
  const batch = async (s: Stmt[]) => {
    raw.exec('BEGIN');
    try { const out = []; for (const x of s) out.push(await x.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  };
  return { raw, prepare: (sql) => stmt(sql), batch };
}
/** An R2 bucket that counts what was asked of it, so a first run can be shown to touch it not at all. */
function fakeBucket(): PhotoStore & { calls: string[] } {
  const calls: string[] = [];
  return { calls, put: async (k) => { calls.push(`put ${k}`); }, get: async () => null, delete: async (k) => { calls.push(`delete ${[k].flat().join(',')}`); } };
}

const NOW = new Date('2026-09-18T17:41:37.512Z');
const NONCE = 'a'.repeat(64);
const app = createApp({ now: () => NOW });
let db: ReturnType<typeof fakeD1>;
let env: Env;
const rows = (sql: string) => db.raw.prepare(sql).all();
const steward = (path: string, init: RequestInit = {}) =>
  app.request(`http://localhost${path}`, { ...init, headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(init.headers as Record<string, string>) } }, { ...env, DEV_STEWARD: 'kyle' });

beforeEach(() => {
  db = fakeD1(); env = { DB: db };
  db.raw.exec("INSERT INTO targets VALUES ('sal_b', 'listing'), ('seg_x', 'place')");
});

describe('the first night the cron ever fires', () => {
  it('runs the whole scheduled handler against an empty database and changes nothing', async () => {
    await worker.scheduled({}, env);
    for (const t of ['reports', 'report_counts', 'photos', 'proposals', 'steward_tasks']) expect(rows(`SELECT * FROM ${t}`), t).toEqual([]);
  });

  it('runs without the photo bucket, which is how the first deploy is configured', async () => {
    // The R2 binding is commented out in wrangler.toml so the first deploy succeeds (DECISIONS 2026-09-20).
    expect(env.PHOTOS).toBeUndefined();
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce) VALUES ('rpt_old', 'sal_b', 'moved', '2026-02-03T10:00Z', '${'b'.repeat(64)}')`);
    await worker.scheduled({}, env);
    expect(rows('SELECT id FROM reports')).toEqual([]);
    expect(rows('SELECT target_id, kind, month, n FROM report_counts')).toEqual([{ target_id: 'sal_b', kind: 'moved', month: '2026-02', n: 1 }]);
    expect(await photoRetention(db, undefined, NOW)).toBe(0);
  });

  it('runs with a brand new empty bucket without asking R2 for anything', async () => {
    const bucket = fakeBucket();
    await worker.scheduled({}, { DB: db, PHOTOS: bucket });
    expect(bucket.calls).toEqual([]);
  });

  it('is safe to run twice in one night: nothing is counted twice', async () => {
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce) VALUES ('rpt_old', 'sal_b', 'moved', '2026-02-03T10:00Z', '${'b'.repeat(64)}')`);
    await worker.scheduled({}, env);
    await worker.scheduled({}, env);
    expect(rows('SELECT n FROM report_counts')).toEqual([{ n: 1 }]);
    expect(await retention(db, NOW)).toBe(0);
  });

  it('leaves a report alone while its photo cannot be deleted, so no picture is ever orphaned', async () => {
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce, photo_key) VALUES ('cond_old', 'seg_x', 'trash', '2026-02-03T10:00Z', '${'c'.repeat(64)}', 'ph_${'0'.repeat(32)}')`);
    db.raw.exec(`INSERT INTO photos (key, uploaded_at, report_id) VALUES ('ph_${'0'.repeat(32)}', '2026-02-03T10:00Z', 'cond_old')`);
    await worker.scheduled({}, env);                       // no bucket
    expect(rows('SELECT id FROM reports')).toEqual([{ id: 'cond_old' }]);
    expect(rows('SELECT * FROM report_counts')).toEqual([]);
  });
});

describe('the first time the pipeline talks to a fresh Worker', () => {
  it('answers the aggregates the build asks for, on an empty database, in the shape it expects', async () => {
    const res = await steward('/v1/steward/aggregates');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ circuit_breaker: false, targets: [], overrides: [] });
  });

  it('takes the first sync of ids into an empty targets table, in batches, and a second sync changes nothing', async () => {
    const listings = Array.from({ length: 120 }, (_, i) => `sal_first_${i}`);
    const put = () => steward('/v1/steward/targets', { method: 'PUT', body: JSON.stringify({ listings, places: ['seg_a', 'plc_b'] }) });
    expect(await (await put()).json()).toEqual({ ok: true, count: 122 });
    expect(rows('SELECT COUNT(*) AS n FROM targets')).toEqual([{ n: 124 }]);   // 122 synced, plus the two this test started with
    await put();
    expect(rows('SELECT COUNT(*) AS n FROM targets')).toEqual([{ n: 124 }]);   // 122 synced, plus the two this test started with
  });

  it('takes the first nightly re-check into an empty task table, and an empty first list closes nothing', async () => {
    const put = (tasks: unknown) => steward('/v1/steward/tasks', { method: 'PUT', body: JSON.stringify({ tasks }) });
    expect(await (await put([])).json()).toEqual({ ok: true, opened: 0, cleared: 0 });
    expect(await (await put([{ target_id: 'sal_b', result: 'missing', detail: 'phone 313-555-0100', checked_on: '2026-09-18' }])).json()).toEqual({ ok: true, opened: 1, cleared: 0 });
    expect(rows("SELECT target_id, status FROM steward_tasks")).toEqual([{ target_id: 'sal_b', status: 'open' }]);
  });

  it('shows an empty queue rather than an error before anyone has reported anything', async () => {
    expect(await (await steward('/v1/steward/queue')).json()).toEqual({ reports: [], closed_phones: {}, proposals: [] });
  });
});

describe('deployed before Cloudflare Access is configured', () => {
  // Step 4 (deploy) can land before step 5 (Access). The Worker must fail closed, and say so, not crash.
  it('refuses every steward route with 401, never a 500, while the Access settings are empty', async () => {
    const bare: Env = { DB: db, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' };
    for (const path of ['/v1/steward/queue', '/v1/steward/tasks', '/v1/steward/aggregates']) {
      const res = await app.request(`https://313help.example${path}`, { headers: { 'Cf-Access-Jwt-Assertion': 'not.a.token' } }, bare);
      expect(res.status, path).toBe(401);
    }
    const write = await app.request('https://313help.example/v1/steward/targets', { method: 'PUT', body: '{"listings":[],"places":[]}', headers: { 'content-type': 'application/json' } }, bare);
    expect(write.status).toBe(401);
  });

  it('still takes reports and proposals from the public, which is what the first day is for', async () => {
    const res = await app.request('https://313help.example/v1/reports', { method: 'POST', body: JSON.stringify({ target_id: 'sal_b', kind: 'moved', client_nonce: NONCE }), headers: { 'content-type': 'application/json' } }, { DB: db, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' });
    expect(res.status).toBe(202);
  });

  it('answers 503 to a photo upload while there is no bucket, so the app sends the report without it', async () => {
    const res = await app.request('https://313help.example/v1/photos', { method: 'POST', body: 'x', headers: { 'content-type': 'image/jpeg' } }, env);
    expect(res.status).toBe(503);
  });
});
