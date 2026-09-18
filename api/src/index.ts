// The thin write plane (docs/06). Anonymous reports and proposals in; a steward queue out.
// Zero-PII rules this file lives by (a test reads this source and fails if they are broken):
//   - it never reads an IP or user-agent header, and never logs a request
//   - only whitelisted body fields are stored; unknown fields are rejected
//   - times are coarsened before storage; free text is masked before storage

import { Hono, type Context } from 'hono';
import { verifyAccess, type JwksFetcher } from './access.js';
import { ARCHIVE_REASONS, CLOSED_KINDS, WRONG_KINDS, isListingId, parseProposal, parseReport } from './validate.js';

export interface Stmt { bind(...args: unknown[]): Stmt; run(): Promise<{ meta: { changes: number } }>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null> }
export interface Db { prepare(sql: string): Stmt; batch(stmts: Stmt[]): Promise<unknown> }
export interface Env { DB: Db; ALLOWED_ORIGIN?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; DEV_STEWARD?: string }
interface Deps { now: () => Date; jwks?: JwksFetcher }

const minute = (d: Date) => d.toISOString().slice(0, 16) + 'Z';
const randomId = (prefix: string, bytes = 8) => prefix + [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const REASONS = ['confirmed_by_phone', 'confirmed_in_person', 'confirmed_on_web', 'could_not_confirm', 'not_true', 'duplicate', 'spam', 'about_a_person', 'listed', 'not_a_fit'];

export function createApp(deps: Deps = { now: () => new Date() }) {
  const app = new Hono<{ Bindings: Env; Variables: { who: string } }>();

  app.use('/v1/*', async (c, next) => {
    const origin = c.env.ALLOWED_ORIGIN;
    if (origin) { c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin'); }
    c.header('Cache-Control', 'no-store');
    if (c.req.method === 'OPTIONS') { c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); c.header('Access-Control-Allow-Headers', 'content-type'); return c.body(null, 204); }
    await next();
  });

  app.get('/v1/health', (c) => c.json({ ok: true }));

  const body = async (c: Context): Promise<unknown> => {
    const raw = await c.req.text();
    if (raw.length > 4096) return undefined;
    try { return JSON.parse(raw); } catch { return undefined; }
  };

  app.post('/v1/reports', async (c) => {
    const parsed = parseReport(await body(c), deps.now());
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const r = parsed.value;
    const target = await c.env.DB.prepare('SELECT kind FROM targets WHERE id = ?').bind(r.target_id).first();
    if (!target) return c.json({ error: 'unknown target' }, 422);
    // OR IGNORE: the same device reporting the same thing about the same target on the same day counts once.
    // The answer is 202 either way, so a repeat looks exactly like a first report.
    await c.env.DB.prepare('INSERT OR IGNORE INTO reports (id, target_id, kind, detail, suggested, observed_at, submitted_at, client_nonce) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomId(r.place ? 'cond_' : 'rpt_'), r.target_id, r.kind, r.detail, r.suggested, r.observed_at, minute(deps.now()), r.client_nonce).run();
    return c.json({ accepted: true }, 202);
  });

  app.post('/v1/proposals', async (c) => {
    const parsed = parseProposal(await body(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const p = parsed.value, ref = randomId('', 3).toUpperCase();
    await c.env.DB.prepare('INSERT INTO proposals (id, ref, name, category, what, address, phone, schedule_text, how_known, notes, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomId('prop_'), ref, p.name, p.category, p.what, p.address, p.phone, p.schedule_text, p.how_known, p.notes, minute(deps.now())).run();
    return c.json({ accepted: true, ref }, 202);
  });

  // ---- stewards and the pipeline, behind Cloudflare Access --------------------------------
  app.use('/v1/steward/*', async (c, next) => {
    // Local development only: `DEV_STEWARD` in api/.dev.vars stands in for Cloudflare Access, and only when the
    // Worker is being reached as localhost. A deployed Worker is never localhost, so this cannot open production.
    const host = new URL(c.req.url).hostname;
    const dev = c.env.DEV_STEWARD && (host === 'localhost' || host === '127.0.0.1') ? { who: `dev:${c.env.DEV_STEWARD}` } : null;
    const id = dev ?? (await verifyAccess(c.req.header('Cf-Access-Jwt-Assertion'), c.env, deps.now(), deps.jwks));
    if (!id) return c.json({ error: 'not signed in' }, 401);
    c.set('who', id.who);
    await next();
  });

  app.get('/v1/steward/queue', async (c) => {
    const reports = await c.env.DB.prepare("SELECT id, target_id, kind, detail, suggested, observed_at, submitted_at FROM reports WHERE status = 'open' ORDER BY submitted_at DESC LIMIT 500").all();
    const proposals = await c.env.DB.prepare("SELECT id, ref, name, category, what, address, phone, schedule_text, how_known, notes, submitted_at FROM proposals WHERE status = 'open' ORDER BY (how_known = 'heard'), submitted_at DESC LIMIT 200").all();
    return c.json({ reports: reports.results, proposals: proposals.results });
  });

  const resolve = (table: 'reports' | 'proposals') => async (c: Context<{ Bindings: Env; Variables: { who: string } }>) => {
    const b = (await body(c)) as { status?: string; reason_code?: string; note?: string } | undefined;
    if (!b || !['accepted', 'rejected', 'duplicate'].includes(b.status ?? '') || !REASONS.includes(b.reason_code ?? '')) return c.json({ error: 'status and a known reason_code are required' }, 400);
    const id = c.req.param('id'), at = minute(deps.now());
    const done = await c.env.DB.prepare(`UPDATE ${table} SET status = ?, reason_code = ?, resolved_at = ? WHERE id = ? AND status = 'open'`).bind(b.status, b.reason_code, at, id).run();
    if (!done.meta.changes) return c.json({ error: 'not found or already resolved' }, 404);
    await c.env.DB.prepare('INSERT INTO steward_actions (at, steward, action, subject_id, reason_code, note) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(at, c.get('who'), `${table}.${b.status}`, id, b.reason_code, typeof b.note === 'string' ? b.note.slice(0, 500) : null).run();
    return c.json({ ok: true });
  };
  app.post('/v1/steward/reports/:id/resolve', resolve('reports'));
  app.post('/v1/steward/proposals/:id/resolve', resolve('proposals'));

  // Archive, pause, or restore a listing. Open closure reports on it are settled in the same step.
  app.post('/v1/steward/listings/:id/status', async (c) => {
    const id = c.req.param('id');
    const b = (await body(c)) as { status?: string; reason_code?: string; replacement_id?: string; note?: string } | undefined;
    if (!isListingId(id) || !b || !['archived', 'suspended', 'active'].includes(b.status ?? '')) return c.json({ error: 'status must be archived, suspended, or active' }, 400);
    const reason = b.status === 'archived' ? b.reason_code : b.reason_code ?? (b.status === 'active' ? 'confirmed_by_phone' : 'seasonal');
    if (b.status === 'archived' && !ARCHIVE_REASONS.includes(reason ?? '')) return c.json({ error: `archiving needs a reason: ${ARCHIVE_REASONS.join(', ')}` }, 400);
    if (b.replacement_id != null && !isListingId(b.replacement_id)) return c.json({ error: 'bad replacement_id' }, 400);
    if (!(await c.env.DB.prepare('SELECT 1 AS ok FROM targets WHERE id = ?').bind(id).first())) return c.json({ error: 'unknown listing' }, 404);
    const at = minute(deps.now());
    await c.env.DB.prepare('INSERT INTO listing_overrides (target_id, status, reason_code, replacement_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (target_id) DO UPDATE SET status = excluded.status, reason_code = excluded.reason_code, replacement_id = excluded.replacement_id, at = excluded.at')
      .bind(id, b.status, reason, b.replacement_id ?? null, at).run();
    const settle = b.status === 'archived' ? 'accepted' : b.status === 'active' ? 'rejected' : null;
    if (settle) await c.env.DB.prepare(`UPDATE reports SET status = ?, reason_code = ?, resolved_at = ? WHERE target_id = ? AND status = 'open' AND kind IN (${CLOSED_KINDS.map((k) => `'${k}'`).join(',')})`).bind(settle, reason, at, id).run();
    await c.env.DB.prepare('INSERT INTO steward_actions (at, steward, action, subject_id, reason_code, note) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(at, c.get('who'), `listing.${b.status}`, id, reason, typeof b.note === 'string' ? b.note.slice(0, 500) : null).run();
    return c.json({ ok: true });
  });

  // The pipeline tells us which ids exist at each publish, so reports can only target real rows.
  app.put('/v1/steward/targets', async (c) => {
    const b = (await c.req.json().catch(() => null)) as { listings?: string[]; places?: string[] } | null;
    if (!b || !Array.isArray(b.listings) || !Array.isArray(b.places)) return c.json({ error: 'listings and places arrays are required' }, 400);
    const rows = [...b.listings.map((id) => [id, 'listing']), ...b.places.map((id) => [id, 'place'])].filter(([id]) => /^(sal|seg|plc)_[a-z0-9_]{1,80}$/.test(id!));
    // Nothing is deleted: archived ids keep resolving (CLAUDE.md).
    for (let i = 0; i < rows.length; i += 50) await c.env.DB.batch(rows.slice(i, i + 50).map(([id, kind]) => c.env.DB.prepare('INSERT OR IGNORE INTO targets (id, kind) VALUES (?, ?)').bind(id, kind)));
    return c.json({ ok: true, count: rows.length });
  });

  // Facts for the bundle build: counts and dates only. No free text leaves through here.
  app.get('/v1/steward/aggregates', async (c) => {
    const q = (kinds: string[]) => `SUM(CASE WHEN kind IN (${kinds.map((k) => `'${k}'`).join(',')}) THEN 1 ELSE 0 END)`;
    const open = await c.env.DB.prepare(`SELECT target_id, ${q(CLOSED_KINDS)} AS closed_open, MAX(CASE WHEN kind IN (${CLOSED_KINDS.map((k) => `'${k}'`).join(',')}) THEN submitted_at END) AS closed_last_at, ${q(WRONG_KINDS)} AS wrong_open,
        MAX(CASE WHEN kind IN ('confirmed_ok', 'looks_good') THEN submitted_at END) AS last_confirmed_at FROM reports WHERE status = 'open' GROUP BY target_id`).all<{ target_id: string; closed_open: number }>();
    // Circuit breaker (audit A1): closure reports on many listings in one day is an attack or a disaster.
    // Either way a person should look before badges change, so the pipeline ignores closure counts while it is tripped.
    const since = new Date(deps.now().getTime() - 86400000).toISOString().slice(0, 16) + 'Z';
    const burst = await c.env.DB.prepare(`SELECT COUNT(DISTINCT target_id) AS n FROM reports WHERE status = 'open' AND submitted_at >= ? AND kind IN (${CLOSED_KINDS.map((k) => `'${k}'`).join(',')})`).bind(since).first<{ n: number }>();
    const overrides = await c.env.DB.prepare('SELECT target_id, status, reason_code, replacement_id, at FROM listing_overrides').all();
    return c.json({ circuit_breaker: (burst?.n ?? 0) > 5, targets: open.results, overrides: overrides.results });
  });

  return app;
}

/** After 180 days a report becomes a monthly count and the row is removed (docs/06, docs/08). */
export async function retention(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 16) + 'Z';
  await db.prepare(`INSERT INTO report_counts (target_id, kind, month, n) SELECT target_id, kind, substr(submitted_at, 1, 7), COUNT(*) FROM reports WHERE submitted_at < ? GROUP BY 1, 2, 3
    ON CONFLICT (target_id, kind, month) DO UPDATE SET n = n + excluded.n`).bind(cutoff).run();
  return (await db.prepare('DELETE FROM reports WHERE submitted_at < ?').bind(cutoff).run()).meta.changes;
}

const app = createApp();
export default {
  fetch: app.fetch,
  scheduled: async (_event: unknown, env: Env) => { await retention(env.DB, new Date()); },
};
