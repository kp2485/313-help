import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, retention, type Db, type Env, type Stmt } from '../src/index.js';
import { keyring, verifyAccess } from '../src/access.js';
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
  // Like D1, a batch is one transaction: all of it happens or none of it does.
  const batch = async (s: Stmt[]) => {
    raw.exec('BEGIN');
    try { const out = []; for (const x of s) out.push(await x.run()); raw.exec('COMMIT'); return out; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  };
  return { raw, prepare: (sql) => stmt(sql), batch };
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
// A browser on the steward page sends its own origin with every POST; app.request's default origin is http://localhost.
const steward = (path: string, init: RequestInit = {}, token = accessToken(goodClaims), headers: Record<string, string> = { origin: 'http://localhost' }) =>
  app.request(path, { ...init, headers: { 'content-type': 'application/json', 'Cf-Access-Jwt-Assertion': token, ...headers } }, env);

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
  it('place reports keep only the hour they were received, too (docs/11); listing reports keep the minute', async () => {
    await post('/v1/reports', { target_id: 'seg_conrail_warren_to_joy', kind: 'light_out', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'f'.repeat(64) });
    expect(db.raw.prepare('SELECT target_id, submitted_at FROM reports ORDER BY target_id').all()).toEqual([
      { target_id: 'sal_b', submitted_at: '2026-09-18T17:41Z' }, { target_id: 'seg_conrail_warren_to_joy', submitted_at: '2026-09-18T17:00Z' }]);
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
  it('masks phone numbers and emails in what and schedule_text before storing; the place\'s own phone field stays', async () => {
    await post('/v1/proposals', { name: 'New Hope pantry', category: 'food.pantry', what: 'Free groceries, text me 313-555-0142', schedule_text: 'Saturdays, ask jo@example.com', phone: '313-555-0100', how_known: 'volunteer' });
    const row = db.raw.prepare('SELECT what, schedule_text, phone FROM proposals').get();
    expect(row).toEqual({ what: 'Free groceries, text me [removed]', schedule_text: 'Saturdays, ask [removed]', phone: '313-555-0100' });
  });
  it('masks suggested hours and address on a report; a suggested phone is the listing\'s number and stays', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_info', client_nonce: NONCE, suggested: { hours: 'Mon 9-5, call me (313) 555-0142', address: '1 Main St, jo@example.com', phone: '313-555-0100' } });
    const s = JSON.parse((db.raw.prepare('SELECT suggested FROM reports').get() as { suggested: string }).suggested);
    expect(s).toEqual({ hours: 'Mon 9-5, call me [removed]', address: '1 Main St, [removed]', phone: '313-555-0100' });
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
    expect(agg.targets[0]).toEqual({ target_id: 'sal_b', closed_open: 2, closed_last_at: '2026-09-18T17:41Z', wrong_open: 1, last_confirmed_at: '2026-09-18T17:41Z', open_after_closed: 0 });
    expect(JSON.stringify(agg)).not.toContain('private words');
    expect(agg.circuit_breaker).toBe(false);

    const ids = Array.from({ length: 6 }, (_, i) => `sal_burst_${i}`);
    expect((await steward('/v1/steward/targets', { method: 'PUT', body: JSON.stringify({ listings: ids, places: [] }) })).status).toBe(200);
    for (const [i, id] of ids.entries()) await post('/v1/reports', { target_id: id, kind: 'closed_permanently', client_nonce: (i + 4).toString(16).repeat(64) });
    agg = (await (await steward('/v1/steward/aggregates')).json()) as typeof agg;
    expect(agg.circuit_breaker).toBe(true);
  });
  it('one phone saying both "closed" and "moved" counts once (DECISIONS 2026-09-19: one phone = one report)', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: NONCE });
    type Agg = { targets: { closed_open: number }[] };
    expect(((await (await steward('/v1/steward/aggregates')).json()) as Agg).targets[0]!.closed_open).toBe(1);
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'e'.repeat(64) });
    expect(((await (await steward('/v1/steward/aggregates')).json()) as Agg).targets[0]!.closed_open).toBe(2);
  });
  // Reports at chosen times (the app's clock is fixed at NOW).
  const at = (target: string, kind: string, when: string, nonce: string) => db.raw.prepare("INSERT INTO reports (id, target_id, kind, submitted_at, observed_at, client_nonce, status) VALUES (?, ?, ?, ?, ?, ?, 'open')")
    .run(`rpt_${nonce.slice(0, 6)}${kind.length}${when.slice(8, 10)}`, target, kind, when, when, nonce);
  type Full = { circuit_breaker: boolean; targets: { target_id: string; closed_open: number; open_after_closed: number; closed_last_at: string | null }[] };
  const full = async () => (await (await steward('/v1/steward/aggregates')).json()) as Full;
  it('open_after_closed counts different phones that said "still open" after the latest closed report (review 18)', async () => {
    at('sal_b', 'closed_permanently', '2026-09-15T10:00Z', 'a'.repeat(64));
    at('sal_b', 'moved', '2026-09-16T10:00Z', 'b'.repeat(64));
    at('sal_b', 'confirmed_ok', '2026-09-15T12:00Z', 'c'.repeat(64));   // before the latest closed report: doesn't count
    at('sal_b', 'confirmed_ok', '2026-09-17T09:00Z', 'd'.repeat(64));
    at('sal_b', 'looks_good', '2026-09-17T11:00Z', 'd'.repeat(64));     // the same phone again: once
    expect((await full()).targets.find((t) => t.target_id === 'sal_b')).toMatchObject({ closed_open: 2, open_after_closed: 1, closed_last_at: '2026-09-16T10:00Z' });
    at('sal_b', 'confirmed_ok', '2026-09-17T15:00Z', 'e'.repeat(64));
    expect((await full()).targets.find((t) => t.target_id === 'sal_b')!.open_after_closed).toBe(2);
  });
  it('while the breaker is tripped, labels stay as they were: counts are taken as of before the burst (Kyle, 2026-09-19)', async () => {
    at('sal_b', 'closed_permanently', '2026-09-15T10:00Z', 'a'.repeat(64));
    at('sal_b', 'moved', '2026-09-15T11:00Z', 'b'.repeat(64));
    const ids = Array.from({ length: 6 }, (_, i) => `sal_burst_${i}`);
    expect((await steward('/v1/steward/targets', { method: 'PUT', body: JSON.stringify({ listings: ids, places: [] }) })).status).toBe(200);
    for (const [i, id] of ids.entries()) at(id, 'closed_permanently', '2026-09-18T12:00Z', (i + 4).toString(16).repeat(64));
    at('sal_b', 'confirmed_ok', '2026-09-18T13:00Z', 'f'.repeat(64));   // a "still open" flood during the burst waits too
    at('sal_b', 'confirmed_ok', '2026-09-18T13:01Z', 'e'.repeat(64));
    const agg = await full();
    expect(agg.circuit_breaker).toBe(true);
    expect(agg.targets.find((t) => t.target_id === 'sal_b')).toMatchObject({ closed_open: 2, open_after_closed: 0 });   // the real label stays up
    expect(agg.targets.some((t) => t.target_id.startsWith('sal_burst_'))).toBe(false);                                // the flood adds none
  });
  it('wrong_open counts phones too: one phone saying wrong hours and wrong phone counts once', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_hours', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_phone', client_nonce: NONCE });
    type Agg = { targets: { wrong_open: number }[] };
    expect(((await (await steward('/v1/steward/aggregates')).json()) as Agg).targets[0]!.wrong_open).toBe(1);
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_info', client_nonce: 'e'.repeat(64) });
    expect(((await (await steward('/v1/steward/aggregates')).json()) as Agg).targets[0]!.wrong_open).toBe(2);
  });
});

describe('the steward queue settles only what the steward saw', () => {
  type Queue = { reports: { id: string; target_id: string; kind: string }[]; closed_phones: Record<string, number> };
  const queue = async () => (await (await steward('/v1/steward/queue')).json()) as Queue;
  const settle = (b: object) => steward('/v1/steward/reports/settle', { method: 'POST', body: JSON.stringify(b) });
  const rows = () => db.raw.prepare('SELECT target_id, kind, status FROM reports ORDER BY kind').all();

  it('settles only the ids sent, only on that target, and only while still open', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_hours', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_csk_conner_meals', kind: 'wrong_phone', client_nonce: 'c'.repeat(64) });
    const shown = (await queue()).reports;
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'e'.repeat(64) });     // came in after the page loaded
    const res = await settle({ target_id: 'sal_b', ids: shown.map((r) => r.id), status: 'rejected', reason_code: 'could_not_confirm' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settled: 1 });
    expect(rows()).toEqual([{ target_id: 'sal_b', kind: 'moved', status: 'open' }, { target_id: 'sal_b', kind: 'wrong_hours', status: 'rejected' },
      { target_id: 'sal_csk_conner_meals', kind: 'wrong_phone', status: 'open' }]);
    const settled = shown.find((r) => r.target_id === 'sal_b')!.id;
    expect(db.raw.prepare('SELECT steward, action, subject_id, reason_code FROM steward_actions').all()).toEqual([{ steward: 'steward@example.org', action: 'reports.rejected', subject_id: settled, reason_code: 'could_not_confirm' }]);
    expect(await (await settle({ target_id: 'sal_b', ids: [settled], status: 'rejected', reason_code: 'spam' })).json()).toEqual({ ok: true, settled: 0 });
  });
  it('settling takes a closed body: unknown fields, bad ids, statuses or reasons are 400', async () => {
    const good = { target_id: 'sal_b', ids: ['rpt_0011223344556677'], status: 'rejected', reason_code: 'spam' };
    expect((await settle(good)).status).toBe(200);
    for (const bad of [{ ...good, note: 'x' }, { ...good, ids: 'rpt_0011223344556677' }, { ...good, ids: ['sal_b'] }, { ...good, status: 'open' },
      { ...good, reason_code: 'because' }, { ...good, target_id: 'nope' }, { ...good, ids: Array.from({ length: 501 }, (_, i) => `rpt_${i}`) }])
      expect((await settle(bad)).status, JSON.stringify(bad).slice(0, 80)).toBe(400);
  });
  it('archiving settles only the closure reports the page sent; one that came in later stays open', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    const shown = (await queue()).reports.map((r) => r.id);
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'e'.repeat(64) });
    expect((await steward('/v1/steward/listings/sal_b/status', { method: 'POST', body: JSON.stringify({ status: 'archived', reason_code: 'closed_permanently', report_ids: shown }) })).status).toBe(200);
    expect(rows()).toEqual([{ target_id: 'sal_b', kind: 'closed_permanently', status: 'accepted' }, { target_id: 'sal_b', kind: 'moved', status: 'open' }]);
  });
  it('confirmations are not in the queue, and settling a listing never settles one', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'confirmed_ok', client_nonce: 'c'.repeat(64) });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_hours', client_nonce: 'e'.repeat(64) });
    await post('/v1/reports', { target_id: 'seg_conrail_warren_to_joy', kind: 'looks_good', client_nonce: 'd'.repeat(64) });
    expect((await queue()).reports.map((r) => r.kind).sort()).toEqual(['closed_permanently', 'wrong_hours']);
    // Even a page that somehow sent a confirmation's id can't settle it.
    const all = (db.raw.prepare('SELECT id FROM reports').all() as { id: string }[]).map((r) => r.id);
    await steward('/v1/steward/listings/sal_b/status', { method: 'POST', body: JSON.stringify({ status: 'archived', reason_code: 'moved', report_ids: all }) });
    await settle({ target_id: 'sal_b', ids: all, status: 'accepted', reason_code: 'confirmed_by_phone' });
    expect(rows()).toEqual([{ target_id: 'sal_b', kind: 'closed_permanently', status: 'accepted' }, { target_id: 'sal_b', kind: 'confirmed_ok', status: 'open' },
      { target_id: 'seg_conrail_warren_to_joy', kind: 'looks_good', status: 'open' }, { target_id: 'sal_b', kind: 'wrong_hours', status: 'accepted' }]);
    const agg = (await (await steward('/v1/steward/aggregates')).json()) as { targets: { target_id: string; last_confirmed_at: string | null }[] };
    expect(agg.targets.find((t) => t.target_id === 'sal_b')!.last_confirmed_at).toBe('2026-09-18T17:41Z');
  });
  it('the queue says how many different phones said closed, and never sends the hashes', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: NONCE });
    let q = await queue();
    expect(q.closed_phones).toEqual({ sal_b: 1 });
    expect(JSON.stringify(q)).not.toContain(NONCE);
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: 'e'.repeat(64) });
    q = await queue();
    expect(q.closed_phones).toEqual({ sal_b: 2 });
  });
});

describe('Cloudflare Access key rotation', () => {
  const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk2 = { ...(second.publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string }), kid: 'k2' };
  const accessEnv = { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud123' };
  const claims = { ...goodClaims, exp: NOW.getTime() / 1000 + 3600 };
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60000);
  const fake = () => {
    const f: { served: (typeof jwk)[]; calls: number; keys: ReturnType<typeof keyring> } = { served: [jwk], calls: 0, keys: keyring(async () => { f.calls++; return f.served; }) };
    return f;
  };
  it('a token signed with a key it has not seen makes it fetch the keys again, then it verifies', async () => {
    const f = fake();
    expect(await verifyAccess(accessToken(claims), accessEnv, at(0), f.keys)).toEqual({ who: 'steward@example.org' });
    f.served = [jwk, jwk2];                                                      // Access rotates its keys
    expect(await verifyAccess(accessToken(claims, second.privateKey, 'k2'), accessEnv, at(6), f.keys)).toEqual({ who: 'steward@example.org' });
    expect(f.calls).toBe(2);
    expect(await verifyAccess(accessToken(claims), accessEnv, at(7), f.keys)).toEqual({ who: 'steward@example.org' });
    expect(f.calls).toBe(2);
  });
  it('unknown keys fetch at most once per 5 minutes, so a flood of bad tokens cannot hammer the certs endpoint', async () => {
    const f = fake();
    await verifyAccess(accessToken(claims), accessEnv, at(0), f.keys);
    f.served = [jwk, jwk2];
    for (const m of [1, 2, 3, 4]) expect(await verifyAccess(accessToken(claims, second.privateKey, 'k2'), accessEnv, at(m), f.keys)).toBeNull();
    expect(f.calls).toBe(1);
    expect(await verifyAccess(accessToken(claims, second.privateKey, 'kX'), accessEnv, at(6), f.keys)).toBeNull();
    expect(await verifyAccess(accessToken(claims, second.privateKey, 'kX'), accessEnv, at(8), f.keys)).toBeNull();
    expect(f.calls).toBe(2);
    expect(await verifyAccess(accessToken(claims, second.privateKey, 'k2'), accessEnv, at(8), f.keys)).toEqual({ who: 'steward@example.org' });
    expect(f.calls).toBe(2);
  });
  it('a failed re-fetch keeps the keys it had', async () => {
    let fail = false;
    const keys = keyring(async () => { if (fail) throw new Error('down'); return [jwk]; });
    await verifyAccess(accessToken(claims), accessEnv, at(0), keys);
    fail = true;
    expect(await verifyAccess(accessToken(claims, second.privateKey, 'k2'), accessEnv, at(6), keys)).toBeNull();
    expect(await verifyAccess(accessToken(claims), accessEnv, at(7), keys)).toEqual({ who: 'steward@example.org' });
  });
});

describe('steward tasks from the nightly re-check', () => {
  type Task = { id: string; target_id: string; result: string; detail: string; checked_on: string };
  const service = accessToken({ ...goodClaims, email: undefined, common_name: 'pipeline' });
  const put = (tasks: unknown, token = service, headers: Record<string, string> = {}) => steward('/v1/steward/tasks', { method: 'PUT', body: JSON.stringify({ tasks }) }, token, headers);
  const list = async () => ((await (await steward('/v1/steward/tasks')).json()) as { tasks: Task[] }).tasks;
  const miss = (target_id: string, detail = 'phone 313-555-0100', result = 'missing') => ({ target_id, result, detail, checked_on: '2026-09-18' });
  const dismiss = (id: string, b: object) => steward(`/v1/steward/tasks/${id}/dismiss`, { method: 'POST', body: JSON.stringify(b) });

  it('a PUT replaces the open set: new misses open, ones no longer reported close as resolved_by_check', async () => {
    expect((await put([miss('sal_b'), miss('sal_csk_conner_meals', 'HTTP 503', 'unreadable')])).status).toBe(200);
    expect((await list()).map((t) => [t.target_id, t.result, t.detail])).toEqual([['sal_b', 'missing', 'phone 313-555-0100'], ['sal_csk_conner_meals', 'unreadable', 'HTTP 503']]);
    expect((await list())[0]!.id).toMatch(/^task_[a-f0-9]{16}$/);
    await put([miss('sal_b')]);
    expect((await list()).map((t) => t.target_id)).toEqual(['sal_b']);
    expect(db.raw.prepare('SELECT target_id, status FROM steward_tasks ORDER BY target_id').all()).toEqual([{ target_id: 'sal_b', status: 'open' }, { target_id: 'sal_csk_conner_meals', status: 'resolved_by_check' }]);
    await put([]);
    expect(await list()).toEqual([]);
  });
  it('a dismissed task stays dismissed while the check says the same thing, and opens again when it changes', async () => {
    await put([miss('sal_b')]);
    const [t] = await list();
    for (const bad of [{}, { reason: 'because' }, { reason: 'checked_fine', note: 'hi' }]) expect((await dismiss(t!.id, bad)).status).toBe(400);
    expect((await dismiss(t!.id, { reason: 'checked_fine' })).status).toBe(200);
    expect((await dismiss(t!.id, { reason: 'checked_fine' })).status).toBe(404);
    expect(await list()).toEqual([]);
    expect(db.raw.prepare('SELECT steward, action, subject_id, reason_code FROM steward_actions').all()).toEqual([{ steward: 'steward@example.org', action: 'tasks.dismissed', subject_id: t!.id, reason_code: 'checked_fine' }]);
    await put([miss('sal_b')]);
    expect(await list()).toEqual([]);
    await put([miss('sal_b', 'street address "1 Main St"')]);
    const again = await list();
    expect(again.map((x) => x.detail)).toEqual(['street address "1 Main St"']);
    expect(again[0]!.id).not.toBe(t!.id);
  });
  it('a dismissed task whose page matched again is forgotten: the next miss is news', async () => {
    await put([miss('sal_b')]);
    await dismiss((await list())[0]!.id, { reason: 'will_fix' });
    await put([]);
    await put([miss('sal_b')]);
    expect(await list()).toHaveLength(1);
  });
  it('takes a closed body: unknown fields, bad ids, results or dates, and repeated targets are 400 and change nothing', async () => {
    for (const bad of [[{ ...miss('sal_b'), phone: '313' }], [miss('seg_x')], [miss('sal_b', 'x', 'closed')], [{ ...miss('sal_b'), checked_on: 'yesterday' }],
      [miss('sal_b', '')], [miss('sal_b', 'x'.repeat(301))], [miss('sal_b'), miss('sal_b')], 'sal_b'])
      expect((await put(bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    expect((await steward('/v1/steward/tasks', { method: 'PUT', body: JSON.stringify({ tasks: [], extra: 1 }) }, service, {})).status).toBe(400);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM steward_tasks').get()).toEqual({ n: 0 });
  });
  it('needs a steward login or the pipeline token, and a browser write from the page itself', async () => {
    expect((await app.request('/v1/steward/tasks', {}, env)).status).toBe(401);
    expect((await put([miss('sal_b')], accessToken(goodClaims))).status).toBe(403);                 // a browser with no Origin
    expect((await put([miss('sal_b')], accessToken(goodClaims), { origin: 'http://localhost' })).status).toBe(200);
  });
});

describe('steward writes refuse cross-site requests', () => {
  const resolveBody = { method: 'POST', body: JSON.stringify({ status: 'accepted', reason_code: 'confirmed_by_phone' }) };
  const archive = { method: 'POST', body: JSON.stringify({ status: 'archived', reason_code: 'moved' }) };
  it('a POST needs a JSON content type (415) and the page\'s own Origin (403)', async () => {
    const url = '/v1/steward/listings/sal_b/status', token = accessToken(goodClaims);
    expect((await steward(url, archive, token, {})).status).toBe(403);                                        // no Origin
    expect((await steward(url, archive, token, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await steward(url, archive, token, { origin: 'http://localhost.evil.example' })).status).toBe(403);
    expect((await steward(url, archive, token, { origin: 'null' })).status).toBe(403);
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])
      expect((await steward(url, archive, token, { origin: 'http://localhost', 'content-type': type })).status, type).toBe(415);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM listing_overrides').get()).toEqual({ n: 0 });
    expect((await steward(url, archive)).status).toBe(200);
  });
  it('covers every steward write: resolve, photo discard, targets', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'moved', client_nonce: NONCE });
    const id = (db.raw.prepare('SELECT id FROM reports').get() as { id: string }).id;
    expect((await steward(`/v1/steward/reports/${id}/resolve`, resolveBody, accessToken(goodClaims), {})).status).toBe(403);
    expect((await steward('/v1/steward/proposals/prop_x/resolve', resolveBody, accessToken(goodClaims), {})).status).toBe(403);
    expect((await steward(`/v1/steward/photos/ph_${'0'.repeat(32)}/discard`, { method: 'POST' }, accessToken(goodClaims), {})).status).toBe(403);
    expect((await steward('/v1/steward/targets', { method: 'PUT', body: JSON.stringify({ listings: ['sal_new'], places: [] }) }, accessToken(goodClaims), {})).status).toBe(403);
    expect((await steward('/v1/steward/reports/settle', { method: 'POST', body: JSON.stringify({ target_id: 'sal_b', ids: [id], status: 'accepted', reason_code: 'confirmed_by_phone' }) }, accessToken(goodClaims), {})).status).toBe(403);
    expect((await steward('/v1/steward/tasks/task_0011223344556677/dismiss', { method: 'POST', body: JSON.stringify({ reason: 'checked_fine' }) }, accessToken(goodClaims), {})).status).toBe(403);
    expect(db.raw.prepare("SELECT status FROM reports").get()).toEqual({ status: 'open' });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM targets WHERE id = 'sal_new'").get()).toEqual({ n: 0 });
    expect((await steward(`/v1/steward/reports/${id}/resolve`, resolveBody)).status).toBe(200);
  });
  it('the pipeline\'s Access service token (no browser, no cookie) needs JSON but no Origin', async () => {
    const service = accessToken({ ...goodClaims, email: undefined, common_name: 'pipeline' });
    const put = { method: 'PUT', body: JSON.stringify({ listings: ['sal_new'], places: [] }) };
    expect((await steward('/v1/steward/targets', put, service, {})).status).toBe(200);
    expect((await steward('/v1/steward/targets', put, service, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await steward('/v1/steward/aggregates', {}, service, {})).status).toBe(200);
  });
  it('reads (GET) need neither', async () => {
    expect((await app.request('/v1/steward/queue', { headers: { 'Cf-Access-Jwt-Assertion': accessToken(goodClaims) } }, env)).status).toBe(200);
  });
  it('the admin page sends a JSON content type on every call, and a body on every POST', () => {
    const js = readFileSync(join(__dirname, '../../admin/admin.js'), 'utf8');
    const api = js.slice(js.indexOf('async function api('), js.indexOf('\n}\n', js.indexOf('async function api(')));
    expect(api).toMatch(/'content-type': 'application\/json'/);
    expect(api).toMatch(/options\.body \?\? '\{\}'/);
    expect(js).not.toMatch(/fetch\(\s*['`]\/v1\/steward/);                                              // every steward call goes through api()
  });
  it('the steward page cannot be framed: Pages sends frame-ancestors none and X-Frame-Options DENY for /admin', () => {
    const headers = readFileSync(join(__dirname, '../../apps/web/public/_headers'), 'utf8');
    const block = (path: string) => headers.split(/\r?\n(?=\S)/).find((b) => b.split(/\r?\n/)[0]!.trim() === path) ?? '';
    for (const path of ['/admin', '/admin/*']) {
      expect(block(path), path).toMatch(/^\s+Content-Security-Policy: frame-ancestors 'none'\s*$/m);
      expect(block(path), path).toMatch(/^\s+X-Frame-Options: DENY\s*$/m);
    }
  });
});

describe('archiving a listing', () => {
  it('needs a reason, records the decision, settles the closure reports, and reaches the pipeline', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    await post('/v1/reports', { target_id: 'sal_b', kind: 'wrong_hours', client_nonce: 'e'.repeat(64) });
    const call = (b: object) => steward('/v1/steward/listings/sal_b/status', { method: 'POST', body: JSON.stringify(b) });
    expect((await call({ status: 'archived' })).status).toBe(400);
    expect((await call({ status: 'archived', reason_code: 'because' })).status).toBe(400);
    expect((await steward('/v1/steward/listings/sal_nope/status', { method: 'POST', body: JSON.stringify({ status: 'archived', reason_code: 'moved' }) })).status).toBe(404);
    const shown = ((await (await steward('/v1/steward/queue')).json()) as { reports: { id: string }[] }).reports.map((r) => r.id);
    expect((await call({ status: 'archived', reason_code: 'closed_permanently', report_ids: 'all' })).status).toBe(400);
    expect((await call({ status: 'archived', reason_code: 'closed_permanently', report_ids: shown })).status).toBe(200);

    // The status call settles the closure reports it was sent; the page settles the rest with its own call.
    expect(db.raw.prepare("SELECT kind, status FROM reports ORDER BY kind").all()).toEqual([{ kind: 'closed_permanently', status: 'accepted' }, { kind: 'wrong_hours', status: 'open' }]);
    expect(db.raw.prepare('SELECT action, subject_id, reason_code FROM steward_actions').get()).toEqual({ action: 'listing.archived', subject_id: 'sal_b', reason_code: 'closed_permanently' });
    const agg = (await (await steward('/v1/steward/aggregates')).json()) as { overrides: object[] };
    expect(agg.overrides).toEqual([{ target_id: 'sal_b', status: 'archived', reason_code: 'closed_permanently', replacement_id: null, at: '2026-09-18T17:41Z' }]);
    // Nothing is deleted: the listing is still a known target, and it can be restored.
    expect((await call({ status: 'active' })).status).toBe(200);
    expect(((await (await steward('/v1/steward/aggregates')).json()) as { overrides: { status: string }[] }).overrides[0]!.status).toBe('active');
  });
  it('restoring never records a phone check that nobody made (review 10b)', async () => {
    await post('/v1/reports', { target_id: 'sal_b', kind: 'closed_permanently', client_nonce: NONCE });
    const call = (b: object) => steward('/v1/steward/listings/sal_b/status', { method: 'POST', body: JSON.stringify(b) });
    expect((await call({ status: 'archived', reason_code: 'closed_permanently' })).status).toBe(200);
    expect((await call({ status: 'active' })).status).toBe(200);
    // A steward can't slip a phone check in through the restore call either.
    expect((await call({ status: 'active', reason_code: 'confirmed_by_phone' })).status).toBe(400);
    const agg = (await (await steward('/v1/steward/aggregates')).json()) as { overrides: { status: string; reason_code: string }[]; targets: { last_confirmed_at: string | null }[] };
    expect(agg.overrides).toEqual([expect.objectContaining({ status: 'active', reason_code: 'restored' })]);
    expect(agg.targets.every((t) => t.last_confirmed_at === null)).toBe(true);
    expect(everything(db)).not.toMatch(/confirmed_by_phone|phone/);
    expect(db.raw.prepare("SELECT action, reason_code FROM steward_actions WHERE action = 'listing.active'").get()).toEqual({ action: 'listing.active', reason_code: 'restored' });
  });
});

describe('local development login', () => {
  it('works on localhost only, and only when DEV_STEWARD is set', async () => {
    const at = (url: string, e: Env) => app.request(url, {}, e);
    expect((await at('http://localhost:8787/v1/steward/queue', { DB: db, DEV_STEWARD: 'local' })).status).toBe(200);
    expect((await at('http://127.0.0.1:8787/v1/steward/queue', { DB: db, DEV_STEWARD: 'local' })).status).toBe(200);
    expect((await at('https://313help.example/v1/steward/queue', { DB: db, DEV_STEWARD: 'local' })).status).toBe(401);
    expect((await at('https://localhost.evil.example/v1/steward/queue', { DB: db, DEV_STEWARD: 'local' })).status).toBe(401);
    expect((await at('http://localhost:8787/v1/steward/queue', { DB: db })).status).toBe(401);
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
  it('counts and removes in one step: if the removal fails, nothing is counted, so a retry never double-counts', async () => {
    db.raw.exec(`INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce) VALUES ('rpt_old1', 'sal_b', 'moved', '2026-02-03T10:00Z', '${'b'.repeat(64)}')`);
    db.raw.exec("CREATE TRIGGER no_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT, 'disk on fire'); END");
    await expect(retention(db, NOW)).rejects.toThrow();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM report_counts').get()).toEqual({ n: 0 });
    db.raw.exec('DROP TRIGGER no_delete');
    expect(await retention(db, NOW)).toBe(1);
    expect(await retention(db, NOW)).toBe(0);
    expect(db.raw.prepare('SELECT n FROM report_counts').all()).toEqual([{ n: 1 }]);
  });
  it('removes proposals settled more than 180 days ago; open and recently settled ones stay (DECISIONS 2026-09-19)', async () => {
    db.raw.exec(`INSERT INTO proposals (id, ref, name, category, what, how_known, submitted_at, status, resolved_at) VALUES
      ('prop_old_settled', 'A1', 'Old pantry', 'food.pantry', 'food', 'heard', '2026-01-02T10:00Z', 'rejected', '2026-02-01T10:00Z'),
      ('prop_new_settled', 'A2', 'New pantry', 'food.pantry', 'food', 'heard', '2026-08-02T10:00Z', 'accepted', '2026-09-01T10:00Z'),
      ('prop_old_open', 'A3', 'Waiting pantry', 'food.pantry', 'food', 'heard', '2026-01-02T10:00Z', 'open', NULL)`);
    await retention(db, NOW);
    expect(db.raw.prepare('SELECT id FROM proposals ORDER BY id').all()).toEqual([{ id: 'prop_new_settled' }, { id: 'prop_old_open' }]);
    expect(everything(db)).not.toContain('Old pantry');
  });
});
