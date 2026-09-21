import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { preflight, readAttestation } from '../src/preflight.js';

const NOW = new Date('2026-09-20T12:00:00Z');
const SIGNED = 'access_policy: 2026-09-19 Kyle Peterson — one Access app over /admin/* and /v1/steward/*\nwaf_rate_limit: 2026-09-19 Kyle Peterson — POST /v1/*, 10 a minute per IP\n';

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
  'strings/en.json': '{"app.name": "313 Help"}',
  'apps/web/public/manifest.webmanifest': '{"name": "313 Help"}',
  'apps/web/index.html': '<title>313 Help</title>',
  'docs/CHECKS-2026-09-19.md': '| a | b | ok |\n',
  'api/edge-protections.md': SIGNED,
  '.github/workflows/publish.yml': "jobs:\n  publish:\n    if: vars.PUBLISH_ENABLED == 'true'\n",
};
const env = { BUNDLE_SIGNING_KEY: active.priv, BUNDLE_PUBLIC_KEYS: `${active.pub},${spare.pub}` };
const run = (over: Record<string, string | null> = {}, e: Record<string, string | undefined> = env) =>
  preflight({ env: e, file: (f) => (f in over ? over[f]! : ready[f] ?? null), now: NOW });
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
  it('a label with a comma in it is not a mismatch (it once stopped a deploy for no reason)', () => {
    const csv = ready['data/seed/emergency.csv']! + 'emg_avalon,"Sexual assault help, 24 hours (Avalon Healing Center)",313-474-7233,,no,5.5,,2026-09-20,,https://avalonhealing.org/,"Printed as 313-474-SAFE, a vanity number"\n';
    expect(stops(run({ 'data/seed/emergency.csv': csv })).join()).not.toMatch(/emergency number/);
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
  it('the two dashboard-only protections stop a deploy until a person signs for them', () => {
    // The blind spot the 2026-09-20 audit named: nothing in a checkout can see the Access policy or the WAF rule.
    expect(stops(run({ 'api/edge-protections.md': null })).join('\n')).toMatch(/Access policy[\s\S]*WAF rate-limiting/);
    const unsigned = 'access_policy: not signed\nwaf_rate_limit: not signed\n';
    expect(stops(run({ 'api/edge-protections.md': unsigned }))).toHaveLength(2);
    expect(stops(run({ 'api/edge-protections.md': `${SIGNED.split('\n')[0]}\n` })).join()).toMatch(/WAF rate-limiting/);
    // The example lines in that file are indented, so they never count as a signature.
    expect(stops(run({ 'api/edge-protections.md': SIGNED.split('\n').map((l) => `    ${l}`).join('\n') }))).toHaveLength(2);
  });
  it('a signature needs a real date and a person\'s name', () => {
    const on = (l: string) => readAttestation(l, 'waf_rate_limit', '2026-09-20');
    expect(on('waf_rate_limit: 2026-09-19 Kyle Peterson — the rule').ok).toBe(true);
    expect(on('waf_rate_limit: 2026-09-21 Kyle Peterson — the rule').why).toMatch(/future/);
    expect(on('waf_rate_limit: yes it exists').why).toMatch(/not signed/);
    expect(on('waf_rate_limit: 2026-09-19 TODO').why).toMatch(/not signed|placeholder/);
    expect(on('waf_rate_limit: 2026-09-19 someone will do this').why).toMatch(/placeholder/);
    expect(readAttestation(null, 'access_policy', '2026-09-20').why).toMatch(/missing/);
    expect(readAttestation('nothing here', 'access_policy', '2026-09-20').why).toMatch(/no access_policy line/);
  });
  it('a signature older than 180 days asks for a fresh look, and never stops a deploy', () => {
    const old = SIGNED.split('2026-09-19').join('2026-01-01');
    const r = run({ 'api/edge-protections.md': old });
    expect(stops(r)).toEqual([]);
    expect(r.filter((c) => !c.ok && c.level === 'look').map((c) => c.what).join()).toMatch(/access_policy signature[\s\S]*waf_rate_limit signature/);
  });
  it('a publish workflow that lost its PUBLISH_ENABLED gate stops a deploy; a missing one only asks a person to look', () => {
    expect(stops(run({ '.github/workflows/publish.yml': 'jobs:\n  publish:\n    runs-on: ubuntu-24.04\n' })).join()).toMatch(/nightly publish/);
    const gone = run({ '.github/workflows/publish.yml': null });
    expect(stops(gone)).toEqual([]);
    expect(gone.filter((c) => !c.ok && c.level === 'look').map((c) => c.fix).join()).toMatch(/publish\.yml is missing/);
  });
  it('never prints a secret', () => {
    expect(JSON.stringify(run({}, { ...env, BUNDLE_PUBLIC_KEYS: 'x' }))).not.toContain(active.priv.slice(40, 80));
  });
});
