// The people who run a listing say "still right" or "something changed" (docs/14; Kyle's decisions of 2026-09-24).
// Driven through the Worker with the real migrations on Node's SQLite, like api.test.ts.

import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, retention, type Db, type Env, type Stmt } from '../src/index.js';
import { OWNER_KEY } from '../src/validate.js';

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
const everything = (db: ReturnType<typeof fakeD1>) => (db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
  .map((t) => JSON.stringify(db.raw.prepare(`SELECT * FROM ${t.name}`).all())).join('\n');

const NOW = new Date('2026-09-24T15:07:41.250Z');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string }), kid: 'k1' };
const b64u = (o: object | Buffer) => (Buffer.isBuffer(o) ? o : Buffer.from(JSON.stringify(o))).toString('base64url');
const head = `${b64u({ alg: 'RS256', kid: 'k1' })}.${b64u({ aud: ['aud123'], iss: 'https://team.cloudflareaccess.com', exp: NOW.getTime() / 1000 + 86400 * 400, email: 'steward@example.org' })}`;
const TOKEN = `${head}.${b64u(createSign('RSA-SHA256').update(head).sign(privateKey))}`;

let db: ReturnType<typeof fakeD1>, env: Env;
const appAt = (now: Date) => createApp({ now: () => now, jwks: async () => [jwk] });
const app = appAt(NOW);
const post = (path: string, body: unknown, a = app) => a.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, env);
const steward = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { 'content-type': 'application/json', 'Cf-Access-Jwt-Assertion': TOKEN, origin: 'http://localhost' } }, env);
const makeLink = async (target_id = 'sal_pantry', category = 'food.pantry', source_url = 'https://pantry.example.org/contact') => {
  const res = await steward('/v1/steward/owner-links', { method: 'POST', body: JSON.stringify({ target_id, category, source_url }) });
  return { res, body: await res.json() as { key: string; expires_at: string; error?: string } };
};
const GONE = { error: 'this link has expired or was already used' };

beforeEach(() => {
  db = fakeD1();
  env = { DB: db, ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud123' };
  db.raw.exec("INSERT INTO targets VALUES ('sal_pantry', 'listing'), ('sal_dv_line', 'listing'), ('seg_conrail_warren_to_joy', 'place')");
});

describe('a steward makes a link', () => {
  it('answers the key once, keeps only its hash, and says when it stops working', async () => {
    const { res, body } = await makeLink();
    expect(res.status).toBe(201);
    expect(body.key).toMatch(OWNER_KEY);
    expect(body.expires_at).toBe('2026-10-24T15:07Z');                       // 30 days, to the minute
    const stored = everything(db);
    expect(stored).not.toContain(body.key);                                  // a copy of the database is not a working link
    expect(db.raw.prepare('SELECT target_id, category, source_url, made_at, used_at FROM owner_links').all()).toEqual([
      { target_id: 'sal_pantry', category: 'food.pantry', source_url: 'https://pantry.example.org/contact', made_at: '2026-09-24T15:07Z', used_at: null }]);
    expect(db.raw.prepare("SELECT action, subject_id FROM steward_actions").all()).toEqual([{ action: 'owner_link.made', subject_id: 'sal_pantry' }]);
  });

  it('two links are two different keys', async () => {
    expect((await makeLink()).body.key).not.toBe((await makeLink()).body.key);
  });

  it('refuses a place, an unknown listing, a page that is not https, and any field it does not know', async () => {
    expect((await makeLink('seg_conrail_warren_to_joy')).res.status).toBe(400);
    expect((await makeLink('sal_nobody')).res.status).toBe(404);
    expect((await makeLink('sal_pantry', 'food.pantry', 'http://pantry.example.org')).res.status).toBe(400);
    expect((await makeLink('sal_pantry', 'food.pantry', 'not a url')).res.status).toBe(400);
    const extra = await steward('/v1/steward/owner-links', { method: 'POST', body: JSON.stringify({ target_id: 'sal_pantry', category: 'food.pantry', source_url: 'https://pantry.example.org', email: 'director@pantry.example.org' }) });
    expect(extra.status).toBe(400);
    expect(everything(db)).not.toContain('director@');                        // the address is never taken in (D2)
  });

  it('only a steward can make one', async () => {
    const res = await app.request('/v1/steward/owner-links', { method: 'POST', body: JSON.stringify({ target_id: 'sal_pantry', category: 'food.pantry', source_url: 'https://pantry.example.org' }), headers: { 'content-type': 'application/json' } }, env);
    expect(res.status).toBe(401);
  });

  it('the list of links says who was asked and what they said, and never a key or its hash', async () => {
    const { body } = await makeLink();
    await post('/v1/owner/confirm', { key: body.key });
    const list = await (await steward('/v1/steward/owner-links')).json() as { links: Record<string, unknown>[] };
    expect(list.links).toEqual([{ target_id: 'sal_pantry', made_at: '2026-09-24T15:07Z', expires_at: '2026-10-24T15:07Z', used_at: '2026-09-24T15:07Z', answer: 'still_right' }]);
  });
});

describe('the people who run it answer', () => {
  it('look: the link names its listing, and changes nothing', async () => {
    const { body } = await makeLink();
    const res = await post('/v1/owner/look', { key: body.key });
    expect(await res.json()).toEqual({ target_id: 'sal_pantry', category: 'food.pantry', expires_at: '2026-10-24T15:07Z' });
    expect((await post('/v1/owner/look', { key: body.key })).status).toBe(200);
  });

  it('"still right" records a dated owner confirmation, once', async () => {
    const { body } = await makeLink();
    expect((await post('/v1/owner/confirm', { key: body.key })).status).toBe(202);
    expect(db.raw.prepare('SELECT target_id, at FROM owner_attests').all()).toEqual([{ target_id: 'sal_pantry', at: '2026-09-24T15:07Z' }]);
    const again = await post('/v1/owner/confirm', { key: body.key });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual(GONE);
    expect((await post('/v1/owner/look', { key: body.key })).status).toBe(404);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM owner_attests').get()).toEqual({ n: 1 });
  });

  it('two taps at once use the link once', async () => {
    const { body } = await makeLink();
    const answers = await Promise.all([post('/v1/owner/confirm', { key: body.key }), post('/v1/owner/confirm', { key: body.key }), post('/v1/owner/propose', { key: body.key, name: 'X', what: 'Y' })]);
    expect(answers.map((r) => r.status).sort()).toEqual([202, 404, 404]);
    const rows = Number((db.raw.prepare('SELECT COUNT(*) AS n FROM owner_attests').get() as { n: number }).n) + Number((db.raw.prepare('SELECT COUNT(*) AS n FROM proposals').get() as { n: number }).n);
    expect(rows).toBe(1);
  });

  it('"something changed" is a proposal about that listing, held for a steward, with free text masked', async () => {
    const { body } = await makeLink();
    const res = await post('/v1/owner/propose', { key: body.key, name: 'Brightmoor Pantry', what: 'Free groceries, Tuesdays now', address: '14585 Greenview Ave', phone: '(313) 555-0142', schedule_text: 'Tue 10-2', notes: 'Call Ms. Jones at jones@pantry.example.org or 313-555-0199' });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ accepted: true, ref: expect.stringMatching(/^[0-9A-F]{6}$/) });
    const [p] = db.raw.prepare('SELECT target_id, category, how_known, name, address, phone, schedule_text, notes, status FROM proposals').all() as Record<string, unknown>[];
    expect(p).toEqual({ target_id: 'sal_pantry', category: 'food.pantry', how_known: 'run_it', name: 'Brightmoor Pantry', address: '14585 Greenview Ave', phone: '(313) 555-0142', schedule_text: 'Tue 10-2', notes: 'Call Ms. Jones at [removed] or [removed]', status: 'open' });
    const queue = await (await steward('/v1/steward/queue')).json() as { proposals: { target_id: string }[] };
    expect(queue.proposals.map((q) => q.target_id)).toEqual(['sal_pantry']);
    expect((await post('/v1/owner/confirm', { key: body.key })).status).toBe(404);          // used
  });

  it('a domestic-violence listing\'s answer never keeps an address, whatever the form sends', async () => {
    const { body } = await makeLink('sal_dv_line', 'shelter.dv', 'https://dv.example.org/contact');
    expect((await post('/v1/owner/propose', { key: body.key, name: 'Help line', what: '24-hour line', address: '1 Secret St', phone: '(313) 555-0100' })).status).toBe(202);
    expect(db.raw.prepare('SELECT address, category FROM proposals').all()).toEqual([{ address: null, category: 'shelter.dv' }]);
    expect(everything(db)).not.toContain('Secret St');
  });

  it('an expired link answers exactly like a used or unknown one, and records nothing', async () => {
    const { body } = await makeLink();
    const later = appAt(new Date(NOW.getTime() + 31 * 86400000));
    for (const [path, b] of [['/v1/owner/look', { key: body.key }], ['/v1/owner/confirm', { key: body.key }], ['/v1/owner/propose', { key: body.key, name: 'X', what: 'Y' }]] as const) {
      const res = await post(path, b, later);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual(GONE);
    }
    const unknown = await post('/v1/owner/confirm', { key: 'A'.repeat(43) });
    expect(await unknown.json()).toEqual(GONE);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM owner_attests').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM proposals').get()).toEqual({ n: 0 });
  });

  it('closed bodies with a size cap: an unknown field, a malformed key or a long body is a 400', async () => {
    const { body } = await makeLink();
    expect((await post('/v1/owner/confirm', { key: body.key, install_id: 'abc' })).status).toBe(400);
    expect((await post('/v1/owner/confirm', { key: 'short' })).status).toBe(400);
    expect((await post('/v1/owner/look', { key: body.key, pad: 'x'.repeat(600) })).status).toBe(400);
    expect((await post('/v1/owner/propose', { key: body.key, name: 'X', what: 'Y', category: 'shelter.dv' })).status).toBe(400);   // the category is the link's
    expect((await post('/v1/owner/confirm', { key: body.key })).status).toBe(202);          // none of that used it up
  });
});

describe('what the answers change', () => {
  it('the aggregates carry each listing\'s latest "still right" date for the badge', async () => {
    const { body } = await makeLink();
    await post('/v1/owner/confirm', { key: body.key });
    const agg = await (await steward('/v1/steward/aggregates')).json() as { attests: unknown[] };
    expect(agg.attests).toEqual([{ target_id: 'sal_pantry', at: '2026-09-24T15:07Z' }]);
  });

  it('"still right" after a closed report puts the listing at the top of the queue, and leaves the report open (D4)', async () => {
    db.raw.exec("INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce) VALUES ('rpt_1', 'sal_pantry', 'closed_permanently', '2026-09-20T10:00Z', '" + 'b'.repeat(64) + "')");
    const { body } = await makeLink();
    await post('/v1/owner/confirm', { key: body.key });
    const queue = await (await steward('/v1/steward/queue')).json() as { owner_said_open: Record<string, string>; reports: { id: string }[] };
    expect(queue.owner_said_open).toEqual({ sal_pantry: '2026-09-24T15:07Z' });
    expect(queue.reports.map((r) => r.id)).toEqual(['rpt_1']);                                 // still open: a steward calls
  });

  it('a "still right" from before the closed report is not news, and is not flagged', async () => {
    const { body } = await makeLink();
    await post('/v1/owner/confirm', { key: body.key });
    db.raw.exec("INSERT INTO reports (id, target_id, kind, submitted_at, client_nonce) VALUES ('rpt_2', 'sal_pantry', 'moved', '2026-09-25T09:00Z', '" + 'c'.repeat(64) + "')");
    const queue = await (await steward('/v1/steward/queue')).json() as { owner_said_open: Record<string, string> };
    expect(queue.owner_said_open).toEqual({});
  });

  it('a link goes 180 days after it expired; the dated answers stay', async () => {
    const { body } = await makeLink();
    await post('/v1/owner/confirm', { key: body.key });
    await retention(db, new Date(NOW.getTime() + 209 * 86400000));
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM owner_links').get()).toEqual({ n: 1 });
    await retention(db, new Date(NOW.getTime() + 211 * 86400000));
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM owner_links').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM owner_attests').get()).toEqual({ n: 1 });
  });
});
