// The post-deploy smoke check (pipeline/src/smoke.ts), driven by a fake origin. Nothing here touches a network.
import { describe, expect, it } from 'vitest';
import { USER_AGENT, parseArgs, smoke } from '../src/smoke.js';

const SITE = 'https://313help.example';
interface Sent { url: string; method: string; headers: Record<string, string>; body: string }

/** A fake origin. `open` drops every protection, one at a time or all at once. */
function fakeOrigin(open: Partial<{ steward: boolean; admin: boolean; schema: boolean; cors: string; limit: boolean; photos: boolean }> = {}) {
  const sent: Sent[] = [];
  let writes = 0;
  const fetcher = async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    sent.push({ url, method, headers, body: typeof init.body === 'string' ? init.body : '' });
    const path = url.slice(SITE.length);
    const res = (status: number, h: Record<string, string> = {}) => new Response(null, { status, headers: h });
    if (path === '/v1/health') return res(200, { 'cache-control': 'no-store' });
    if (path.startsWith('/v1/steward/')) return open.steward ? res(200) : res(302, { location: 'https://313help.cloudflareaccess.com/login' });
    if (path === '/admin/') return open.admin ? res(200) : res(302, { location: 'https://313help.cloudflareaccess.com/login' });
    if (path === '/v1/photos') return res(open.photos ? 201 : 503);
    if (method === 'OPTIONS') return res(204, { 'access-control-allow-origin': open.cors ?? SITE });
    if (path === '/v1/reports') {
      writes++;
      if (!open.limit && writes > 2) return res(429);     // the two schema probes, then the edge starts refusing
      if (open.schema) return res(202);
      return res(JSON.parse(sent.at(-1)!.body).install_id ? 400 : 422);
    }
    return res(404);
  };
  return { fetcher, sent };
}
const nap = async () => {};
const failures = (probes: Awaited<ReturnType<typeof smoke>>) => probes.filter((p) => !p.ok && p.level === 'stop').map((p) => p.what);

describe('pnpm smoke: what only a live origin can answer', () => {
  it('a protected origin passes every check', async () => {
    const { fetcher } = fakeOrigin();
    const probes = await smoke(SITE, fetcher, 25, nap);
    expect(failures(probes)).toEqual([]);
    expect(probes.filter((p) => !p.ok)).toEqual([]);
  });

  it('an unprotected origin fails on the steward queue, the admin page, CORS, the schema and the rate limit', async () => {
    const { fetcher } = fakeOrigin({ steward: true, admin: true, schema: true, cors: '*', limit: true });
    const named = failures(await smoke(SITE, fetcher, 25, nap)).join('\n');
    expect(named).toMatch(/GET \/v1\/steward\/queue refuses/);
    expect(named).toMatch(/GET \/v1\/steward\/tasks refuses/);
    expect(named).toMatch(/GET \/v1\/steward\/aggregates refuses/);
    expect(named).toMatch(/PUT \/v1\/steward\/targets refuses/);
    expect(named).toMatch(/\/admin\/ is behind Cloudflare Access/);
    expect(named).toMatch(/unknown field/);
    expect(named).toMatch(/CORS names this site/);
    expect(named).toMatch(/burst of 25 writes is rate-limited/);
  });

  it('a wide-open CORS header is a failure even when everything else is fine', async () => {
    const { fetcher } = fakeOrigin({ cors: 'https://smoke-test.invalid' });
    expect(failures(await smoke(SITE, fetcher, 3, nap))).toEqual(['CORS names this site and nobody else']);
  });

  it('a 404 at /admin/ asks a person to look: not open, but not the steward page either', async () => {
    const { fetcher } = fakeOrigin();
    const notThere = async (url: string, init?: RequestInit) => (url.endsWith('/admin/') ? new Response(null, { status: 404 }) : fetcher(url, init));
    const probes = await smoke(SITE, notThere, 3, nap);
    expect(failures(probes)).toEqual([]);
    expect(probes.find((p) => p.what.includes('/admin/'))).toMatchObject({ ok: false, level: 'look', saw: '404: no steward page at this origin' });
  });

  it('photos being on is something to look at, not something that stops anyone', async () => {
    const probes = await smoke(SITE, fakeOrigin({ photos: true }).fetcher, 25, nap);
    expect(failures(probes)).toEqual([]);
    expect(probes.filter((p) => !p.ok).map((p) => p.level)).toEqual(['look']);
  });

  it('sends nothing that could become a row, and says honestly who it is', async () => {
    const { fetcher, sent } = fakeOrigin();
    await smoke(SITE, fetcher, 5, nap);
    for (const s of sent) {
      expect(s.headers['user-agent']).toBe(USER_AGENT);
      expect(s.url.startsWith(SITE)).toBe(true);
      if (!s.body) continue;
      const body = JSON.parse(s.body) as Record<string, unknown>;
      // Every body is one the API must refuse: an unknown field, an id that does not exist, or two empty lists.
      const refusable = 'install_id' in body || body.target_id === 'sal_smoke_test_no_such_listing'
        || (Array.isArray(body.listings) && body.listings.length === 0 && Array.isArray(body.places) && body.places.length === 0);
      expect(refusable, s.body).toBe(true);
      expect(s.body).not.toMatch(/lat|lon|email|@/);
    }
    // Short: the burst is the only repetition, and it is as long as it was asked to be.
    expect(sent.filter((s) => s.url.endsWith('/v1/reports') && s.method === 'POST')).toHaveLength(2 + 5);
  });

  it('refuses to run without a person saying they own the origin, and refuses a path or plain http', () => {
    expect(parseArgs([SITE])).toMatchObject({ ok: false, why: expect.stringContaining('--i-own-this-origin') });
    expect(parseArgs([`${SITE}/admin/`, '--i-own-this-origin'])).toMatchObject({ ok: false, why: expect.stringContaining('origin only') });
    expect(parseArgs(['http://313help.example', '--i-own-this-origin'])).toMatchObject({ ok: false, why: expect.stringContaining('https') });
    expect(parseArgs(['--i-own-this-origin'])).toMatchObject({ ok: false, why: expect.stringContaining('give the origin') });
    expect(parseArgs(['not a url', '--i-own-this-origin'])).toMatchObject({ ok: false });
  });

  it('takes the origin, an opt-in, and an honest burst size', () => {
    expect(parseArgs(['--', `${SITE}/`, '--i-own-this-origin'])).toEqual({ ok: true, origin: SITE, burst: 25 });
    expect(parseArgs([SITE, '--i-own-this-origin', '--burst=5']).burst).toBe(5);
    expect(parseArgs([SITE, '--i-own-this-origin', '--burst=5000']).burst).toBe(60);
    expect(parseArgs([SITE, '--i-own-this-origin', '--no-burst']).burst).toBe(0);
    expect(parseArgs(['http://localhost:8787', '--i-own-this-origin'])).toMatchObject({ ok: true, origin: 'http://localhost:8787' });
  });

  it('with --no-burst it asks everything else and never repeats a request', async () => {
    const { fetcher, sent } = fakeOrigin();
    const probes = await smoke(SITE, fetcher, 0, nap);
    expect(probes.map((p) => p.what).join()).not.toMatch(/burst/);
    expect(sent.filter((s) => s.url.endsWith('/v1/reports') && s.method === 'POST')).toHaveLength(2);
  });
});
