import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, retention, type Db, type Env, type Stmt } from '../src/index.js';
import { mask } from '../src/validate.js';

// A D1-shaped wrapper over Node's built-in SQLite, so tests run the real migration and real SQL.
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
  return { raw, prepare: (sql) => stmt(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}
/** Every value in every table, as one string. If something personal got stored, it is in here. */
function everything(db: ReturnType<typeof fakeD1>): string {
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
  return tables.map((t) => JSON.stringify(db.raw.prepare(`SELECT * FROM ${t.name}`).all())).join('\n');
}

const NOW = new Date('2026-09-18T17:41:37.512Z');
const NONCE = 'a'.repeat(64);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string }), kid: 'k1' };
const b64u = (o: object | Buffer) => (Buffer.isBuffer(o) ? o : Buffer.from(JSON.stringify(o))).toString('base64url');
function accessToken(claims: object, key = privateKey, kid = 'k1'): string {
  const head = `${b64u({ alg: 'RS256', kid })}.${b64u(claims)}`;
  return `${head}.${b64u(createSign('RSA-SHA256').update(head).sign(key))}`;
}
const goodClaims = { aud: ['aud123'], iss: 'https://team.cloudflareaccess.com', exp: NOW.getTime() / 1000 + 600, email: 'steward@example.org' };

let db: ReturnType<typeof fakeD1>, env: Env;
const app = createApp({ now: () => NOW, jwks: async () => [jwk] });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }, env);
const steward = (path: string, init: RequestInit = {}, token = accessToken(goodClaims)) =>
  app.request(path, { ...init, headers: { 'content-type': 'application/json', 'Cf-Access-Jwt-Assertion': token } }, env);

beforeEach(() => {
  db = fakeD1();
  env = { DB: db, ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud123' };
  db.raw.exec("INSERT INTO targets VALUES ('sal_csk_conner_meals', 'listing'), ('sal_b', 'listing'), ('seg_conrail_warren_to_joy', 'place')");
});

describe('zero PII: nothing about the person reaches the database', () => {
  it('stores no IP, user agent, install id, coordinates, or seconds, whatever the client sends', async () => {
    const res = await post('/v1/reports',
      { target_id: 'sal_csk_conner_meals', kind: 'closed_permanently', detail: 'Sign on the door says closed', observed_at: '2026-09-18T17:40:12Z', client_nonce: NONCE },
      { 'cf-connecting-ip': '203.0.113.77', 'x-forwarded-for': '203.0.113.77', 'x-real-ip': '203.0.113.77', 'user-agent': 'TestPhone/9 (unique-device-string)', cookie: 'session=abc123secret', 'cf-ipcountry': 'US' });
    expect(res.status).toBe(202);
    const all = everything(db);
    for (const leak of ['203.0.113', 'TestPhone', 'unique-device-string', 'abc123secret', ':12Z', ':37', '.512']) expect(all, leak).not.toContain(leak);
    expect(all).toContain('2026-09-18T17:40Z');   // observed, to the minute
    expect(all).toContain('2026-09-18T17:41Z');   // submitted, to the minute
  });
  it('rejects a body that carries an install id, coordinates, or any unknown field, and stores nothing', async () => {
    for (const extra of [{ install_id: '6f1c-device' }, { lat: 42.35, lon: -83.05 }, { email: 'me@example.org' }]) {
      const res = await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: NONCE, ...extra });
      expect(res.status).toBe(400);
    }
    expect(everything(db)).not.toMatch(/6f1c-device|42\.35|me@example/);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM reports').get()).toEqual({ n: 0 });
  });
  it('masks phone numbers and emails in free text BEFORE storing it', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_info', detail: 'Call me at (313) 555-0142 or jo@example.com, it moved', client_nonce: NONCE });
    const all = everything(db);
    expect(all).not.toMatch(/555-0142|jo@example/);
    expect(all).toContain('[removed]');
    expect(mask('text 313.555.0142 now')).toBe('text [removed] now');
  });
  it('the source never reads an IP or user-agent header and never logs', () => {
    for (const f of readdirSync(join(__dirname, '../src'))) {
      const src = readFileSync(join(__dirname, '../src', f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/connecting-ip|forwarded-for|real-ip|user-agent|console\.(log|info|debug)|req\.raw\.cf|\.cf\b/i);
    }
  });
  it('place reports keep only the hour, because the reporter is standing there', async () => {
    await post('/v1/reports', { target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', observed_at: '2026-09-18T17:40:12Z', client_nonce: NONCE });
    expect(db.raw.prepare('SELECT id, observed_at FROM reports').get()).toMatchObject({ observed_at: '2026-09-18T17:00Z' });
  });
});

describe('reports', () => {
  it('counts one device once per target, kind and day, and answers 202 both times', async () => {
    const r = { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE };
    expect((await post('/v1/reports', r)).status).toBe(202);
    expect((await post('/v1/reports', r)).status).toBe(202);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM reports').get()).toEqual({ n: 1 });
  });
  it('refuses unknown targets, bad nonces, and listing kinds on places', async () => {
    expect((await post('/v1/reports', { target_id: 'sal_nope', kind: 'moved', client_nonce: NONCE })).status).toBe(422);
    expect((await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'short' })).status).toBe(400);
    expect((await post('/v1/reports', { target_id: 'seg_conrail_warren_to_joy', kind: 'closed_permanently', client_nonce: NONCE })).status).toBe(400);
  });
  it('has no way to report a person: those kinds do not exist', async () => {
    for (const kind of ['person', 'encampment', 'tent', 'homeless', 'suspicious', 'loitering', 'squatter', 'vehicle'])
      expect((await post('/v1/reports', { target_id: 'seg_conrail_warren_to_joy', kind, client_nonce: NONCE })).status, kind).toBe(400);
  });
  it('rejects oversized and non-JSON bodies', async () => {
    expect((await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: NONCE, detail: 'x'.repeat(5000) })).status).toBe(400);
    expect((await app.request('/v1/reports', { method: 'POST', body: 'not json' }, env)).status).toBe(400);
  });
});

describe('proposals', () => {
  it('accepts a place and returns a display-only reference', async () => {
    const res = await post('/v1/proposals', { name: 'New Hope pantry', category: 'food.pantry', what: 'Free groceries on Saturdays', address: '123 Joy Rd', phone: '313-555-0100', how_known: 'volunteer' });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { ref: string }).ref).toMatch(/^[0-9A-F]{6}$/);
  });
  it('never stores an address for a domestic violence shelter', async () => {
    await post('/v1/proposals', { name: 'Safe house', category: 'shelter.dv', what: 'Shelter', address: '99 Hidden St', how_known: 'heard' });
    expect(everything(db)).not.toContain('Hidden St');
  });
});

describe('steward endpoints', () => {
  it('fail closed: no token, wrong audience, expired, wrong key, or no configuration', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect((await app.request('/v1/steward/queue', {}, env)).status).toBe(401);
    expect((await steward('/v1/steward/queue', {}, accessToken({ ...goodClaims, aud: ['someone-else'] }))).status).toBe(401);
    expect((await steward('/v1/steward/queue', {}, accessToken({ ...goodClaims, exp: NOW.getTime() / 1000 - 1 }))).status).toBe(401);
    expect((await steward('/v1/steward/queue', {}, accessToken(goodClaims, other))).status).toBe(401);
    env = { DB: db };
    expect((await steward('/v1/steward/queue')).status).toBe(401);
  });
  it('queue, resolve with a reason code, and log who did it', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    const queue = (await (await steward('/v1/steward/queue')).json()) as { reports: { id: string }[] };
    expect(queue.reports).toHaveLength(1);
    const id = queue.reports[0]!.id;
    expect((await steward(`/v1/steward/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'accepted' }) })).status).toBe(400);
    expect((await steward(`/v1/steward/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status: 'accepted', reason_code: 'confirmed_by_phone' }) })).status).toBe(200);
    expect(db.raw.prepare('SELECT steward, action, reason_code FROM steward_actions').get()).toEqual({ steward: 'steward@example.org', action: 'reports.accepted', reason_code: 'confirmed_by_phone' });
    expect(((await (await steward('/v1/steward/queue')).json()) as { reports: unknown[] }).reports).toHaveLength(0);
  });
  it('aggregates give the pipeline counts and dates only, and trip the circuit breaker on a burst', async () => {
    for (const [i, kind] of ['closed_permanently', 'moved', 'wrong_hours', 'confirmed_ok'].entries())
      await post('/v1/reports', { target_id: 'sal_b', kind, detail: 'private words', client_nonce: String(i).repeat(64) });
    let agg = (await (await steward('/v1/steward/aggregates')).json()) as { circuit_breaker: boolean; targets: Record<string, unknown>[] };
    expect(agg.targets[0]).toEqual({ target_id: 'sal_b', closed_open: 2, closed_last_at: '2026-09-18T17:41Z', wrong_open: 1, last_confirmed_at: '2026-09-18T17:41Z' });
    expect(JSON.stringify(agg)).not.toContain('private words');
    expect(agg.circuit_breaker).toBe(false);

    const ids = Array.from({ length: 6 }, (_, i) => `sal_burst_${i}`);
    expect((await steward('/v1/steward/targets', { method: 'PUT', body: JSON.stringify({ listings: ids, places: [] }) })).status).toBe(200);
    for (const [i, id] of ids.entries()) await post('/v1/reports', { target_id: id, kind: 'closed_permanently', client_nonce: (i + 4).toString(16).repeat(64) });
    agg = (await (await steward('/v1/steward/aggregates')).json()) as typeof agg;
    expect(agg.circuit_breaker).toBe(true);
  });
});

describe('retention', () => {
  it('turns reports older than 180 days into monthly counts and removes the rows', async () => {
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, detail, submitted_at, client_nonce) VALUES
      ('rpt_old1', 'sal_b', 'moved', 'old words', '2026-02-03T10:00Z', '${'b'.repeat(64)}'),
      ('rpt_old2', 'sal_b', 'moved', null, '2026-02-20T10:00Z', '${'c'.repeat(64)}'),
      ('rpt_new', 'sal_b', 'moved', null, '2026-09-01T10:00Z', '${'d'.repeat(64)}')`);
    expect(await retention(db, NOW)).toBe(2);
    expect(db.raw.prepare('SELECT * FROM report_counts').all()).toEqual([{ target_id: 'sal_b', kind: 'moved', month: '2026-02', n: 2 }]);
    expect(everything(db)).not.toContain('old words');
    expect(db.raw.prepare('SELECT id FROM reports').all()).toEqual([{ id: 'rpt_new' }]);
  });
});
