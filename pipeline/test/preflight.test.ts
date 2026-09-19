import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { preflight } from '../src/preflight.js';

const pair = () => {
  const k = generateKeyPairSync('ed25519');
  return { priv: k.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: k.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
};
const active = pair(), spare = pair();
const ready: Record<string, string> = {
  'api/wrangler.toml': 'database_id = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"\n[vars]\nPHOTOS_ENABLED = "false"\nALLOWED_ORIGIN = "https://313help.org"\nACCESS_TEAM_DOMAIN = "dc.cloudflareaccess.com"\nACCESS_AUD = "abc123"\n',
  'data/seed/directory.json': '{"retired": false, "photos": false}',
  'data/seed/emergency.csv': 'id,label,number,sms,hardcoded,sort,verified_by_call_on,verified_published_on,mismatch_on,source_url,internal_note\nemg_911,Emergency,911,,yes,1,,,,,\nemg_x,Shelter,866-313-2520,,no,2,,2026-09-18,,https://x,\n',
  'apps/web/public/_headers': "/admin/*\n  Content-Security-Policy: frame-ancestors 'none'\n  X-Frame-Options: DENY\n",
  'strings/en.json': '{"app.name": "313 Help", "about.p3": "Not an official City of Detroit app."}',
  'apps/web/public/manifest.webmanifest': '{"name": "313 Help"}',
  'apps/web/index.html': '<title>313 Help</title>',
  'docs/CHECKS-2026-09-19.md': '| a | b | ok |\n',
};
const env = { BUNDLE_SIGNING_KEY: active.priv, BUNDLE_PUBLIC_KEYS: `${active.pub},${spare.pub}` };
const run = (over: Record<string, string | null> = {}, e: Record<string, string | undefined> = env) =>
  preflight({ env: e, file: (f) => (f in over ? over[f]! : ready[f] ?? null) });
const stops = (r: ReturnType<typeof run>) => r.filter((c) => !c.ok && c.level === 'stop').map((c) => c.what);

describe('preflight', () => {
  it('a ready checkout has nothing to stop for', () => expect(stops(run())).toEqual([]));
  it('the placeholder database, localhost origin, and missing Access settings stop a deploy', () => {
    const toml = 'database_id = "00000000-0000-0000-0000-000000000000"\n[vars]\nALLOWED_ORIGIN = "http://localhost:5173"\nACCESS_TEAM_DOMAIN = ""\nACCESS_AUD = ""\n';
    expect(stops(run({ 'api/wrangler.toml': toml })).join('\n')).toMatch(/D1 database id[\s\S]*ALLOWED_ORIGIN[\s\S]*Access team domain/);
  });
  it('keys: one key, the same key twice, or a signing key that isn\'t pinned all stop it', () => {
    expect(stops(run({}, { ...env, BUNDLE_PUBLIC_KEYS: active.pub })).join()).toMatch(/pins two different/);
    expect(stops(run({}, { ...env, BUNDLE_PUBLIC_KEYS: `${active.pub},${active.pub}` })).join()).toMatch(/pins two different/);
    expect(stops(run({}, { ...env, BUNDLE_SIGNING_KEY: pair().priv })).join()).toMatch(/signing key is one of the two pinned/);
    expect(stops(run({}, { ...env, BUNDLE_SIGNING_KEY: undefined })).join()).toMatch(/BUNDLE_SIGNING_KEY is set/);
  });
  it('an emergency mismatch, a missing _headers, or a renamed app stop it', () => {
    const csv = ready['data/seed/emergency.csv']!.replace('2026-09-18,,https', '2026-09-18,2026-09-19,https');
    expect(stops(run({ 'data/seed/emergency.csv': csv })).join()).toMatch(/emergency number/);
    expect(stops(run({ 'apps/web/public/_headers': null })).join()).toMatch(/framed/);
    expect(stops(run({ 'apps/web/index.html': '<title>Other</title>' })).join()).toMatch(/named 313 Help/);
  });
  it('photos on, or open worksheet rows, only ask a person to look', () => {
    const r = run({ 'data/seed/directory.json': '{"photos": true}', 'docs/CHECKS-2026-09-19.md': '| a | b | |\n| c | d | |\n' });
    expect(stops(r)).toEqual([]);
    expect(r.filter((c) => !c.ok && c.level === 'look').map((c) => c.fix ?? c.what).join()).toMatch(/legal advice[\s\S]*2 rows still have no result/);
  });
  it('never prints a secret', () => {
    expect(JSON.stringify(run({}, { ...env, BUNDLE_PUBLIC_KEYS: 'x' }))).not.toContain(active.priv.slice(40, 80));
  });
});
