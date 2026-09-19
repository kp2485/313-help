// The thin write plane (docs/06). Anonymous reports and proposals in; a steward queue out.
// Zero-PII rules this file lives by (a test reads this source and fails if they are broken):
//   - it never reads an IP or user-agent header, and never logs a request
//   - only whitelisted body fields are stored; unknown fields are rejected
//   - times are coarsened before storage; free text is masked before storage

import { Hono, type Context } from 'hono';
import { keyring, verifyAccess, type JwksFetcher } from './access.js';
import { MAX_PHOTO_BYTES, PHOTO_KEY, checkJpeg, type PhotoStore } from './photo.js';
import { ARCHIVE_REASONS, CLOSED_KINDS, CONFIRM_KINDS, WRONG_KINDS, isListingId, parseDismiss, parseProposal, parseReport, parseSettle, parseTasks, reportIds } from './validate.js';

export interface Stmt { bind(...args: unknown[]): Stmt; run(): Promise<{ meta: { changes: number } }>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null> }
/** A batch is one transaction (D1), answering one result per statement. */
export interface Db { prepare(sql: string): Stmt; batch(stmts: Stmt[]): Promise<{ meta: { changes: number } }[]> }
export interface Env { DB: Db; PHOTOS?: PhotoStore; /** "true" turns photo uploads on (docs/11, off by default). */ PHOTOS_ENABLED?: string; ALLOWED_ORIGIN?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; DEV_STEWARD?: string }
interface Deps { now: () => Date; jwks?: JwksFetcher }

const minute = (d: Date) => d.toISOString().slice(0, 16) + 'Z';
// Anything about a place (a condition report, its photo) keeps only the hour: the person was standing there (docs/11).
const hour = (d: Date) => d.toISOString().slice(0, 13) + ':00Z';
const randomId = (prefix: string, bytes = 8) => prefix + [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
// `restored` says a steward put a listing back, and nothing more: it is never a phone check (review 10b).
const REASONS = ['confirmed_by_phone', 'confirmed_in_person', 'confirmed_on_web', 'could_not_confirm', 'not_true', 'duplicate', 'spam', 'about_a_person', 'listed', 'not_a_fit', 'restored'];
const inList = (kinds: string[]) => kinds.map((k) => `'${k}'`).join(',');

export function createApp(deps: Deps = { now: () => new Date() }) {
  const app = new Hono<{ Bindings: Env; Variables: { who: string } }>();
  const keys = keyring(deps.jwks);

  app.use('/v1/*', async (c, next) => {
    const origin = c.env.ALLOWED_ORIGIN;
    if (origin) { c.header('Access-Control-Allow-Origin', origin); c.header('Vary', 'Origin'); }
    c.header('Cache-Control', 'no-store');
    if (c.req.method === 'OPTIONS') { c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); c.header('Access-Control-Allow-Headers', 'content-type'); return c.body(null, 204); }
    await next();
  });

  app.get('/v1/health', (c) => c.json({ ok: true }));

  const body = async (c: Context, max = 4096): Promise<unknown> => {
    const raw = await c.req.text();
    if (raw.length > max) return undefined;
    try { return JSON.parse(raw); } catch { return undefined; }
  };

  app.post('/v1/reports', async (c) => {
    const parsed = parseReport(await body(c), deps.now());
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const r = parsed.value;
    const target = await c.env.DB.prepare('SELECT kind FROM targets WHERE id = ?').bind(r.target_id).first();
    if (!target) return c.json({ error: 'unknown target' }, 422);
    if (r.photo && !(await c.env.DB.prepare('SELECT key FROM photos WHERE key = ? AND report_id IS NULL').bind(r.photo).first())) return c.json({ error: 'unknown photo' }, 422);
    // OR IGNORE: the same device reporting the same thing about the same target on the same day counts once.
    // The answer is 202 either way, so a repeat looks exactly like a first report.
    const id = randomId(r.place ? 'cond_' : 'rpt_'), submitted = r.place ? hour(deps.now()) : minute(deps.now());
    const insert = 'INSERT OR IGNORE INTO reports (id, target_id, kind, detail, suggested, observed_at, submitted_at, client_nonce, photo_key) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?';
    const args = [id, r.target_id, r.kind, r.detail, r.suggested, r.observed_at, submitted, r.client_nonce, r.photo];
    if (!r.photo) { await c.env.DB.prepare(insert).bind(...args).run(); return c.json({ accepted: true }, 202); }
    // With a photo, storing the report and claiming the photo is one transaction: the report is stored only while the
    // photo is still unclaimed, and the claim only lands on a report that was stored. Two reports can't share a photo.
    const [, claim] = await c.env.DB.batch([
      c.env.DB.prepare(`${insert} WHERE EXISTS (SELECT 1 FROM photos WHERE key = ? AND report_id IS NULL)`).bind(...args, r.photo),
      c.env.DB.prepare('UPDATE photos SET report_id = ? WHERE key = ? AND report_id IS NULL AND EXISTS (SELECT 1 FROM reports WHERE id = ?)').bind(id, r.photo, id)]);
    if (claim?.meta.changes === 1) return c.json({ accepted: true }, 202);
    // Nothing was stored. A repeat report answers 202 as always, and its photo stays unclaimed for the daily pass to
    // delete; otherwise another report took the photo in the meantime, which is refused like the check above.
    if (await c.env.DB.prepare('SELECT 1 AS ok FROM reports WHERE client_nonce = ? AND kind = ?').bind(r.client_nonce, r.kind).first()) return c.json({ accepted: true }, 202);
    return c.json({ error: 'unknown photo' }, 422);
  });

  // A photo for a condition report (docs/11). The phone has already re-drawn it without metadata; checkJpeg
  // refuses anything that still carries any. The picture goes to a private bucket and is never served to the public.
  app.post('/v1/photos', async (c) => {
    // Off unless switched on (DECISIONS 2026-09-19): the app then sends reports without photos.
    if (!c.env.PHOTOS || c.env.PHOTOS_ENABLED !== 'true') return c.json({ error: 'photos are off' }, 503);
    if ((c.req.header('content-type') ?? '').split(';')[0]!.trim() !== 'image/jpeg') return c.json({ error: 'send a JPEG' }, 415);
    if (Number(c.req.header('content-length') ?? 0) > MAX_PHOTO_BYTES) return c.json({ error: 'photo is too large' }, 413);
    const checked = checkJpeg(new Uint8Array(await c.req.arrayBuffer()));
    if (!checked.ok) return c.json({ error: checked.error }, 422);
    const key = randomId('ph_', 16);
    await c.env.PHOTOS.put(key, checked.clean, { httpMetadata: { contentType: 'image/jpeg' } });
    await c.env.DB.prepare('INSERT INTO photos (key, uploaded_at) VALUES (?, ?)').bind(key, hour(deps.now())).run();
    return c.json({ photo: key }, 201);
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
    const url = new URL(c.req.url), local = (h: string) => h === 'localhost' || h === '127.0.0.1';
    const dev = c.env.DEV_STEWARD && local(url.hostname) ? { who: `dev:${c.env.DEV_STEWARD}` } : null;
    const id = dev ?? (await verifyAccess(c.req.header('Cf-Access-Jwt-Assertion'), c.env, deps.now(), keys));
    if (!id) return c.json({ error: 'not signed in' }, 401);
    // Cross-site request forgery: a steward's browser carries the Access cookie to any site that posts here. A form
    // can't send a JSON content type, and every browser names the page it posts from in Origin. So a write must be JSON
    // and come from our own origin. The pipeline's Access service token rides in headers no other site can set, and it
    // sends no Origin, so it needs only the content type. Locally the page may be on another localhost port (Vite).
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if ((c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase() !== 'application/json') return c.json({ error: 'send JSON' }, 415);
      const origin = c.req.header('origin');
      let from: URL | null = null;
      try { from = origin ? new URL(origin) : null; } catch { from = null; }
      const same = !!from && (from.origin === url.origin || (!!dev && from.protocol === 'http:' && local(from.hostname)));
      if (!same && !id.who.startsWith('service:')) return c.json({ error: 'not from the steward page' }, 403);
    }
    c.set('who', id.who);
    await next();
  });

  // Reports to look at: confirmations are counted for the badge and never need a steward, so they are not here.
  // `closed_phones` is how many different phones said closed or moved, counted like the aggregates (one phone = one
  // report, DECISIONS 2026-09-19); the hashes themselves never leave the database.
  app.get('/v1/steward/queue', async (c) => {
    const reports = await c.env.DB.prepare(`SELECT id, target_id, kind, detail, suggested, observed_at, submitted_at, photo_key FROM reports WHERE status = 'open' AND kind NOT IN (${inList(CONFIRM_KINDS)}) ORDER BY submitted_at DESC LIMIT 500`).all();
    const closedPhones = await c.env.DB.prepare(`SELECT target_id, COUNT(DISTINCT client_nonce) AS n FROM reports WHERE status = 'open' AND kind IN (${inList(CLOSED_KINDS)}) GROUP BY target_id`).all<{ target_id: string; n: number }>();
    const proposals = await c.env.DB.prepare("SELECT id, ref, name, category, what, address, phone, schedule_text, how_known, notes, submitted_at FROM proposals WHERE status = 'open' ORDER BY (how_known = 'heard'), submitted_at DESC LIMIT 200").all();
    return c.json({ reports: reports.results, closed_phones: Object.fromEntries(closedPhones.results.map((r) => [r.target_id, r.n])), proposals: proposals.results });
  });

  // Photos are for stewards' eyes only, and a steward can throw one away at once (a face, a house number, abuse).
  app.get('/v1/steward/photos/:key', async (c) => {
    const key = c.req.param('key'), obj = PHOTO_KEY.test(key) ? await c.env.PHOTOS?.get(key) : null;
    if (!obj) return c.json({ error: 'no such photo' }, 404);
    return c.body(await obj.arrayBuffer(), 200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  });
  app.post('/v1/steward/photos/:key/discard', async (c) => {
    const key = c.req.param('key');
    if (!PHOTO_KEY.test(key) || !c.env.PHOTOS) return c.json({ error: 'no such photo' }, 404);
    await c.env.PHOTOS.delete(key);
    await c.env.DB.batch([c.env.DB.prepare('UPDATE reports SET photo_key = NULL WHERE photo_key = ?').bind(key), c.env.DB.prepare('DELETE FROM photos WHERE key = ?').bind(key),
      c.env.DB.prepare('INSERT INTO steward_actions (at, steward, action, subject_id, reason_code, note) VALUES (?, ?, ?, ?, ?, ?)').bind(minute(deps.now()), c.get('who'), 'discard_photo', key, 'discarded', null)]);
    return c.json({ discarded: true });
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

  // Settle the reports a steward was shown on one listing or place. Only those ids, only on that target, only while
  // still open, and never a confirmation: a report that came in after the page loaded stays open for the next look.
  app.post('/v1/steward/reports/settle', async (c) => {
    const parsed = parseSettle(await body(c, 32768), REASONS);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const { target_id, ids, status, reason_code } = parsed.value, at = minute(deps.now());
    if (!ids.length) return c.json({ ok: true, settled: 0 });
    const match = `FROM reports WHERE target_id = ? AND status = 'open' AND kind NOT IN (${inList(CONFIRM_KINDS)}) AND id IN (${ids.map(() => '?').join(',')})`;
    const [, done] = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO steward_actions (at, steward, action, subject_id, reason_code, note) SELECT ?, ?, ?, id, ?, NULL ${match}`).bind(at, c.get('who'), `reports.${status}`, reason_code, target_id, ...ids),
      c.env.DB.prepare(`UPDATE reports SET status = ?, reason_code = ?, resolved_at = ? WHERE id IN (SELECT id ${match})`).bind(status, reason_code, at, target_id, ...ids)]);
    return c.json({ ok: true, settled: done?.meta.changes ?? 0 });
  });
  app.post('/v1/steward/proposals/:id/resolve', resolve('proposals'));

  // Archive, pause, or restore a listing. The closure reports the page showed (`report_ids`) are settled in the same
  // step; one that came in after the page loaded stays open.
  app.post('/v1/steward/listings/:id/status', async (c) => {
    const id = c.req.param('id');
    const b = (await body(c, 32768)) as { status?: string; reason_code?: string; replacement_id?: string; note?: string; report_ids?: unknown } | undefined;
    if (!isListingId(id) || !b || !['archived', 'suspended', 'active'].includes(b.status ?? '')) return c.json({ error: 'status must be archived, suspended, or active' }, 400);
    const shown = reportIds(b.report_ids);
    if (!shown) return c.json({ error: 'report_ids must be a list of at most 500 report ids' }, 400);
    // Restoring records `restored`, never a phone check: nobody called, so the badge must not say anyone did (review 10b).
    const reason = b.status === 'archived' ? b.reason_code : b.status === 'active' ? 'restored' : b.reason_code ?? 'seasonal';
    if (b.status === 'archived' && !ARCHIVE_REASONS.includes(reason ?? '')) return c.json({ error: `archiving needs a reason: ${ARCHIVE_REASONS.join(', ')}` }, 400);
    if (b.status === 'active' && b.reason_code != null && b.reason_code !== 'restored') return c.json({ error: 'restoring takes no reason_code' }, 400);
    if (b.replacement_id != null && !isListingId(b.replacement_id)) return c.json({ error: 'bad replacement_id' }, 400);
    if (!(await c.env.DB.prepare('SELECT 1 AS ok FROM targets WHERE id = ?').bind(id).first())) return c.json({ error: 'unknown listing' }, 404);
    const at = minute(deps.now());
    await c.env.DB.prepare('INSERT INTO listing_overrides (target_id, status, reason_code, replacement_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (target_id) DO UPDATE SET status = excluded.status, reason_code = excluded.reason_code, replacement_id = excluded.replacement_id, at = excluded.at')
      .bind(id, b.status, reason, b.replacement_id ?? null, at).run();
    const settle = b.status === 'archived' ? 'accepted' : b.status === 'active' ? 'rejected' : null;
    if (settle && shown.length) await c.env.DB.prepare(`UPDATE reports SET status = ?, reason_code = ?, resolved_at = ? WHERE target_id = ? AND status = 'open' AND kind IN (${inList(CLOSED_KINDS)}) AND id IN (${shown.map(() => '?').join(',')})`).bind(settle, reason, at, id, ...shown).run();
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
    const phones = (kinds: string[]) => `COUNT(DISTINCT CASE WHEN kind IN (${inList(kinds)}) THEN client_nonce END)`;
    // One phone = one report (DECISIONS 2026-09-19): closure and wrong-info reports count distinct per-target daily
    // hashes, so one phone saying both "closed" and "moved" counts once. (The hash differs every day, so a phone
    // counts once a day.)
    const open = await c.env.DB.prepare(`SELECT target_id, ${phones(CLOSED_KINDS)} AS closed_open, MAX(CASE WHEN kind IN (${inList(CLOSED_KINDS)}) THEN submitted_at END) AS closed_last_at, ${phones(WRONG_KINDS)} AS wrong_open,
        MAX(CASE WHEN kind IN (${inList(CONFIRM_KINDS)}) THEN submitted_at END) AS last_confirmed_at FROM reports WHERE status = 'open' GROUP BY target_id`).all<{ target_id: string; closed_open: number }>();
    // Circuit breaker (audit A1): closure reports on many listings in one day is an attack or a disaster.
    // Either way a person should look before badges change, so the pipeline ignores closure counts while it is tripped.
    const since = new Date(deps.now().getTime() - 86400000).toISOString().slice(0, 16) + 'Z';
    const burst = await c.env.DB.prepare(`SELECT COUNT(DISTINCT target_id) AS n FROM reports WHERE status = 'open' AND submitted_at >= ? AND kind IN (${inList(CLOSED_KINDS)})`).bind(since).first<{ n: number }>();
    const overrides = await c.env.DB.prepare('SELECT target_id, status, reason_code, replacement_id, at FROM listing_overrides').all();
    return c.json({ circuit_breaker: (burst?.n ?? 0) > 5, targets: open.results, overrides: overrides.results });
  });

  // ---- tasks the machine raises for a steward (DECISIONS 2026-09-19) ------------------------------
  // The nightly re-check sends every listing whose own page no longer shows its phone or street address, or could not
  // be read. The app never changes because of it; a steward looks. The list replaces the open set: a listing no longer
  // reported closes as resolved_by_check. A task a steward dismissed stays dismissed while the check says the same
  // thing; a different result (or the same one after the page matched again in between) is a new task.
  app.put('/v1/steward/tasks', async (c) => {
    const parsed = parseTasks(await body(c, 512 * 1024));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const at = minute(deps.now()), DB = c.env.DB;
    type Live = { id: string; target_id: string; result: string; detail: string; status: string };
    const live = new Map((await DB.prepare("SELECT id, target_id, result, detail, status FROM steward_tasks WHERE kind = 'source_check' AND cleared_at IS NULL").all<Live>()).results.map((t) => [t.target_id, t]));
    // For a page that can't be read the reason varies night to night (a 503, a timeout); only the result counts.
    const same = (t: Live, n: { result: string; detail: string }) => t.result === n.result && (n.result === 'unreadable' || t.detail === n.detail);
    const stmts: Stmt[] = [];
    let opened = 0;
    for (const n of parsed.value) {
      const cur = live.get(n.target_id);
      live.delete(n.target_id);
      if (cur && same(cur, n)) continue;
      if (cur?.status === 'open') { stmts.push(DB.prepare('UPDATE steward_tasks SET result = ?, detail = ?, checked_on = ? WHERE id = ?').bind(n.result, n.detail, n.checked_on, cur.id)); continue; }
      if (cur) stmts.push(DB.prepare('UPDATE steward_tasks SET cleared_at = ? WHERE id = ?').bind(at, cur.id));
      opened++;
      stmts.push(DB.prepare("INSERT INTO steward_tasks (id, kind, target_id, result, detail, checked_on, opened_at) VALUES (?, 'source_check', ?, ?, ?, ?, ?)").bind(randomId('task_'), n.target_id, n.result, n.detail, n.checked_on, at));
    }
    // Whatever is left was not reported tonight: the page matched again.
    for (const t of live.values()) stmts.push(DB.prepare("UPDATE steward_tasks SET status = CASE WHEN status = 'open' THEN 'resolved_by_check' ELSE status END, closed_at = COALESCE(closed_at, ?), cleared_at = ? WHERE id = ?").bind(at, at, t.id));
    if (stmts.length) await DB.batch(stmts);
    return c.json({ ok: true, opened, cleared: live.size });
  });

  app.get('/v1/steward/tasks', async (c) => {
    const tasks = await c.env.DB.prepare("SELECT id, target_id, result, detail, checked_on FROM steward_tasks WHERE status = 'open' ORDER BY checked_on, target_id").all();
    return c.json({ tasks: tasks.results });
  });

  app.post('/v1/steward/tasks/:id/dismiss', async (c) => {
    const parsed = parseDismiss(await body(c));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const id = c.req.param('id'), at = minute(deps.now()), { reason } = parsed.value;
    // Logging first, from the row as it stands, keeps the two in one transaction: no log without a dismissal.
    const [, done] = await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO steward_actions (at, steward, action, subject_id, reason_code, note) SELECT ?, ?, 'tasks.dismissed', id, ?, NULL FROM steward_tasks WHERE id = ? AND status = 'open'").bind(at, c.get('who'), reason, id),
      c.env.DB.prepare("UPDATE steward_tasks SET status = 'dismissed', reason_code = ?, closed_at = ? WHERE id = ? AND status = 'open'").bind(reason, at, id)]);
    if (!done?.meta.changes) return c.json({ error: 'not found or already closed' }, 404);
    return c.json({ ok: true });
  });

  return app;
}

/** After 180 days a report becomes a monthly count and the row is removed (docs/06, docs/08). */
/** Photos go 30 days after their report closes, or after one day if no report claimed them (docs/11). */
export async function photoRetention(db: Db, photos: PhotoStore | undefined, now: Date): Promise<number> {
  if (!photos) return 0;
  const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 16) + 'Z';
  const due = await db.prepare(`SELECT p.key FROM photos p LEFT JOIN reports r ON r.id = p.report_id
    WHERE (p.report_id IS NULL AND p.uploaded_at < ?) OR (r.status != 'open' AND r.resolved_at < ?) OR (p.report_id IS NOT NULL AND r.id IS NULL)`).bind(ago(1), ago(30)).all<{ key: string }>();
  for (const { key } of due.results) {
    await photos.delete(key);
    await db.batch([db.prepare('UPDATE reports SET photo_key = NULL WHERE photo_key = ?').bind(key), db.prepare('DELETE FROM photos WHERE key = ?').bind(key)]);
  }
  return due.results.length;
}

// A photo goes with its report. Pictures are deleted from the bucket first, then counting, removing the photo rows and
// removing the reports is one transaction: a crash before it leaves every report in place for the next night (a
// missing picture is harmless), and a crash inside it changes nothing, so a report is never counted twice or lost.
// Without the bucket a picture can't be deleted, so a report with a photo waits rather than leave the picture behind.
// Settled proposals go 180 days after the steward's decision; open ones wait for a steward (DECISIONS 2026-09-19).
export async function retention(db: Db, now: Date, photos?: PhotoStore): Promise<number> {
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 16) + 'Z';
  const due = `FROM reports WHERE submitted_at < ?${photos ? '' : ' AND id NOT IN (SELECT report_id FROM photos WHERE report_id IS NOT NULL)'}`;
  if (photos) {
    const keys = (await db.prepare('SELECT p.key FROM photos p JOIN reports r ON r.id = p.report_id WHERE r.submitted_at < ?').bind(cutoff).all<{ key: string }>()).results.map((p) => p.key);
    for (let i = 0; i < keys.length; i += 1000) await photos.delete(keys.slice(i, i + 1000));     // R2 takes 1000 keys a call
  }
  const [, , , removed] = await db.batch([
    db.prepare(`INSERT INTO report_counts (target_id, kind, month, n) SELECT target_id, kind, substr(submitted_at, 1, 7), COUNT(*) ${due} GROUP BY 1, 2, 3
      ON CONFLICT (target_id, kind, month) DO UPDATE SET n = n + excluded.n`).bind(cutoff),
    db.prepare(`DELETE FROM photos WHERE report_id IN (SELECT id ${due})`).bind(cutoff),
    db.prepare("DELETE FROM proposals WHERE status != 'open' AND resolved_at < ?").bind(cutoff),
    db.prepare(`DELETE ${due}`).bind(cutoff)]);
  return removed?.meta.changes ?? 0;
}

const app = createApp();
export default {
  fetch: app.fetch,
  scheduled: async (_event: unknown, env: Env) => { await photoRetention(env.DB, env.PHOTOS, new Date()); await retention(env.DB, new Date(), env.PHOTOS); },
};
