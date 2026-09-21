// `pnpm smoke -- https://<domain> --i-own-this-origin`
//
// What preflight cannot see, this can: it asks a live origin, from outside, whether the protections that live in the
// Cloudflare dashboard are really there (audit 2026-09-20). Run it after the first deploy, after any change to the
// Access policy or the WAF rule, and after re-signing api/edge-protections.md.
//
// Rules this script lives by:
//   - Run it only against an origin you own. It refuses to start without --i-own-this-origin.
//   - It identifies itself honestly (the user agent below) and never pretends to be a browser or a phone.
//   - It never stores anything. Every request it sends is one the API must refuse: an unknown field (400), an
//     unknown target (422), an empty id list, an empty photo body. Nothing it sends can become a row.
//   - The rate-limit probe is a short burst (25 requests by default, at most 60) of those same refused requests.
//     Skip it with --no-burst.
//   - It sends no resident data, and prints no response bodies.

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export const USER_AGENT = '313-help-smoke/1 (operations check, run by the operator; docs/OPERATIONS.md)';
export interface Probe { ok: boolean; level: 'stop' | 'look'; what: string; saw: string }
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const STEWARD_READS = ['/v1/steward/queue', '/v1/steward/tasks', '/v1/steward/aggregates'];
const NONCE = '0'.repeat(64);
// A slug nobody will ever publish, so the API answers 422 and stores nothing.
const NO_SUCH_TARGET = 'sal_smoke_test_no_such_listing';

/** Access shows a login page instead of an answer; both a refusal and a redirect to it count as "not open". */
function refused(res: Response): boolean {
  if (res.status === 401 || res.status === 403 || res.status === 404) return true;
  const to = res.headers.get('location') ?? '';
  return res.status >= 300 && res.status < 400 && /cloudflareaccess\.com|\/cdn-cgi\/access\//.test(to);
}

export function parseArgs(argv: string[]): { ok: boolean; why?: string; origin: string; burst: number } {
  const args = argv.filter((a) => a !== '--');
  const origin = (args.find((a) => !a.startsWith('-')) ?? '').replace(/\/+$/, '');
  const burstArg = args.find((a) => a.startsWith('--burst='));
  const burst = args.includes('--no-burst') ? 0 : Math.min(60, Math.max(1, Number(burstArg?.split('=')[1] ?? 25)));
  const bad = (why: string) => ({ ok: false, why, origin, burst });
  if (!origin) return bad('give the origin to check: pnpm smoke -- https://<domain> --i-own-this-origin');
  let url: URL;
  try { url = new URL(origin); } catch { return bad(`${origin} is not a URL`); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) return bad('the origin must be https (or a localhost copy for a rehearsal)');
  if (url.pathname !== '/' || url.search) return bad('give the origin only, with no path: https://<domain>');
  if (!args.includes('--i-own-this-origin')) return bad('this sends a short burst of requests. Add --i-own-this-origin, and only to an origin you run.');
  if (burstArg && !Number.isFinite(Number(burstArg.split('=')[1]))) return bad('--burst= wants a number');
  return { ok: true, origin: url.origin, burst };
}

/** Asks a live origin the questions preflight can't. Sends nothing that could be stored. */
export async function smoke(origin: string, ask: Fetcher = fetch, burst = 25, pause: (ms: number) => Promise<void> = sleep): Promise<Probe[]> {
  // Read the origin's first answer. fetch follows redirects by default, and Access's login page answers 200: followed,
  // a protected path looks open.
  const fetcher: Fetcher = (url, init) => ask(url, { ...init, redirect: 'manual' });
  const out: Probe[] = [];
  const add = (ok: boolean, level: Probe['level'], what: string, saw: string) => out.push({ ok, level, what, saw });
  const head = (extra: Record<string, string> = {}) => ({ 'user-agent': USER_AGENT, ...extra });
  const json = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    fetcher(origin + path, { method: 'POST', headers: head({ 'content-type': 'application/json', ...extra }), body: JSON.stringify(body) });
  const badReport = { target_id: NO_SUCH_TARGET, kind: 'moved', client_nonce: NONCE, install_id: 'smoke-test' };

  // 1. The API is there at all.
  const health = await fetcher(`${origin}/v1/health`, { headers: head() });
  add(health.status === 200, 'stop', 'GET /v1/health answers 200', `${health.status}`);
  add((health.headers.get('cache-control') ?? '').includes('no-store'), 'look', 'answers are not cached (Cache-Control: no-store)', health.headers.get('cache-control') ?? 'no header');

  // 2. Nobody can read the steward queue without signing in (the Access policy).
  for (const path of STEWARD_READS) {
    const res = await fetcher(origin + path, { headers: head() });
    add(refused(res), 'stop', `GET ${path} refuses a request that is not signed in`, `${res.status}${res.headers.get('location') ? ` → ${new URL(res.headers.get('location')!, origin).host}` : ''}`);
  }
  // A write nobody signed in for. The body is two empty lists, so even if it got through it would change nothing.
  const write = await fetcher(`${origin}/v1/steward/targets`, { method: 'PUT', headers: head({ 'content-type': 'application/json' }), body: JSON.stringify({ listings: [], places: [] }) });
  add(refused(write), 'stop', 'PUT /v1/steward/targets refuses a request that is not signed in', `${write.status}`);
  // The steward page itself must be behind the same Access application.
  const admin = await fetcher(`${origin}/admin/`, { headers: head() });
  const where = admin.headers.get('location') ? ` → ${new URL(admin.headers.get('location')!, origin).host}` : '';
  // A 404 is not "open", but it isn't the steward page either: the site isn't served from this origin yet.
  add(refused(admin) && admin.status !== 404, admin.status === 404 ? 'look' : 'stop', 'the steward page /admin/ is behind Cloudflare Access',
    admin.status === 404 ? '404: no steward page at this origin' : `${admin.status}${where}`);

  // 3. The request body is a closed schema: an unknown field is a 400, and nothing is stored.
  const unknown = await json('/v1/reports', badReport);
  add(unknown.status === 400, 'stop', 'POST /v1/reports answers 400 to a body with an unknown field', `${unknown.status}`);
  const stranger = await json('/v1/reports', { target_id: NO_SUCH_TARGET, kind: 'moved', client_nonce: NONCE });
  add(stranger.status === 422, 'stop', 'POST /v1/reports answers 422 to an id that does not exist (so nothing was stored)', `${stranger.status}`);

  // 4. CORS is pinned to the site, and never echoes whoever asked.
  const cors = await fetcher(`${origin}/v1/reports`, { method: 'OPTIONS', headers: head({ origin: 'https://smoke-test.invalid', 'access-control-request-method': 'POST' }) });
  const acao = cors.headers.get('access-control-allow-origin') ?? '';
  add(acao === origin, 'stop', 'CORS names this site and nobody else', acao === '' ? 'no Access-Control-Allow-Origin' : acao);

  // 5. Photos: off until the legal advice in docs/11 is in hand.
  const photo = await fetcher(`${origin}/v1/photos`, { method: 'POST', headers: head({ 'content-type': 'image/jpeg' }), body: '' });
  add(photo.status === 503, 'look', 'photo uploads are off (503)', `${photo.status}`);

  // 6. The WAF rate-limiting rule. The same refused request, a few times, quickly.
  if (burst > 0) {
    const codes: number[] = [];
    for (let i = 0; i < burst; i++) { codes.push((await json('/v1/reports', badReport)).status); await pause(50); }
    const limited = codes.filter((s) => s === 429 || s === 403).length;
    add(limited > 0, 'stop', `a burst of ${burst} writes is rate-limited`, limited ? `${limited} of ${burst} refused (429/403)` : `all ${burst} went through`);
  }
  return out;
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/smoke.ts')) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) { console.error(args.why); process.exit(2); }
  console.log(`Checking ${args.origin} from outside, as ${USER_AGENT}.\nNothing this sends can be stored.\n`);
  const probes = await smoke(args.origin, fetch, args.burst);
  for (const pr of probes) console.log(`${pr.ok ? 'ok  ' : pr.level === 'stop' ? 'STOP' : 'look'}  ${pr.what}\n        saw: ${pr.saw}`);
  const stops = probes.filter((pr) => !pr.ok && pr.level === 'stop').length;
  console.log(stops ? `\n${stops} thing(s) this origin does not protect yet. Fix them before telling anyone the address.` : '\nEvery protection answered. Sign the lines in api/edge-protections.md.');
  if (stops) process.exitCode = 1;
}
