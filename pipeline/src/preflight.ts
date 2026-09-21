// `pnpm preflight`: is this checkout ready to deploy? Read-only. It looks at the config files and the environment
// the deploy would use and prints each check. Anything marked "stop" must be fixed first; "look" needs a person's
// eyes but doesn't block. It never prints a secret, only whether one is set and fits.
//
//   BUNDLE_SIGNING_KEY=... BUNDLE_PUBLIC_KEYS=a,b pnpm preflight

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseCsv } from 'csv-parse/sync';
import { p } from './util.js';

export interface Check { ok: boolean; level: 'stop' | 'look'; what: string; fix?: string }
export interface Inputs {
  env: Record<string, string | undefined>;
  /** Contents of a repo file, or null when it doesn't exist. */
  file: (path: string) => string | null;
  /** The day the check runs on; only for tests. */
  now?: Date;
}

// The Cloudflare Access policy and the WAF rate-limiting rule are made in a dashboard, not in this repository, so no
// script can see them. A person signs for them in api/edge-protections.md and preflight reads that signature. Until
// both are signed a deploy is blocked: without them a checkout could pass every other check and still put an
// unprotected API on the internet (audit 2026-09-20, "preflight has blind spots").
export const ATTESTATIONS = 'api/edge-protections.md';
export interface Attestation { ok: boolean; on?: string; by?: string; why?: string }
const PLACEHOLDER = /^(not signed|unsigned|todo|tbd|none|nobody|someone|name|xxx|a person\b)/i;

/** Reads one signed line (`key: YYYY-MM-DD Name — what they saw`). Indented example lines are ignored. */
export function readAttestation(text: string | null, key: string, today: string): Attestation {
  if (text === null) return { ok: false, why: `${ATTESTATIONS} is missing` };
  const line = text.split('\n').filter((l) => l.startsWith(`${key}:`)).at(-1);
  if (line === undefined) return { ok: false, why: `${ATTESTATIONS} has no ${key} line` };
  const m = new RegExp(`^${key}:\\s*(\\d{4}-\\d{2}-\\d{2})\\s+(\\S.{3,})$`).exec(line.trim());
  if (!m) return { ok: false, why: `${key} is not signed` };
  const [, on, by] = m as unknown as [string, string, string];
  if (on > today) return { ok: false, why: `${key} is signed with a date in the future (${on})` };
  if (PLACEHOLDER.test(by)) return { ok: false, why: `${key} is signed with a placeholder, not a person's name` };
  return { ok: true, on, by };
}

const SPKI_ED25519 = '302a300506032b6570032100';
const isEd25519Spki = (b64: string) => { try { const h = Buffer.from(b64, 'base64').toString('hex'); return h.length === 88 && h.startsWith(SPKI_ED25519); } catch { return false; } };
const tomlVar = (toml: string, name: string) => new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(toml)?.[1];

export function preflight({ env, file, now = new Date() }: Inputs): Check[] {
  const out: Check[] = [];
  const check = (ok: boolean, level: Check['level'], what: string, fix?: string) => out.push({ ok, level, what, ...(ok || !fix ? {} : { fix }) });

  // Keys: two pinned public keys, and the signing key is one of them.
  const pins = (env.BUNDLE_PUBLIC_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  check(pins.length === 2 && pins[0] !== pins[1] && pins.every(isEd25519Spki), 'stop', 'BUNDLE_PUBLIC_KEYS pins two different Ed25519 keys (active and spare)', 'pnpm keys:generate twice; set BUNDLE_PUBLIC_KEYS="active,spare" (OPERATIONS, First deployment step 2)');
  let signingPub: string | null = null;
  try { if (env.BUNDLE_SIGNING_KEY) signingPub = createPublicKey(createPrivateKey(env.BUNDLE_SIGNING_KEY)).export({ type: 'spki', format: 'der' }).toString('base64'); } catch { signingPub = null; }
  check(!!signingPub, 'stop', 'BUNDLE_SIGNING_KEY is set and is a private key', 'set the active private key as BUNDLE_SIGNING_KEY');
  check(!!signingPub && pins.includes(signingPub), 'stop', 'the signing key is one of the two pinned keys', 'the active key\'s public half must be in BUNDLE_PUBLIC_KEYS, or every phone will refuse the list');

  // The Worker's config.
  const toml = file('api/wrangler.toml') ?? '';
  check(!/database_id\s*=\s*"0{8}-0{4}-0{4}-0{4}-0{12}"/.test(toml) && /database_id\s*=\s*"[0-9a-f-]{36}"/.test(toml), 'stop', 'api/wrangler.toml has the real D1 database id', 'wrangler d1 create 313-help, then put its id in api/wrangler.toml (step 3)');
  const origin = tomlVar(toml, 'ALLOWED_ORIGIN') ?? '';
  check(/^https:\/\/[^/]+$/.test(origin) && !/localhost|127\.0\.0\.1/.test(origin), 'stop', 'ALLOWED_ORIGIN is the https site, not localhost', 'set ALLOWED_ORIGIN = "https://<domain>" in api/wrangler.toml');
  check(!!tomlVar(toml, 'ACCESS_TEAM_DOMAIN') && !!tomlVar(toml, 'ACCESS_AUD'), 'stop', 'Cloudflare Access team domain and AUD are set (the steward pages fail closed without them)', 'step 5: put ACCESS_TEAM_DOMAIN and ACCESS_AUD in api/wrangler.toml');
  check(tomlVar(toml, 'PHOTOS_ENABLED') !== 'true', 'look', 'photos are off in the Worker (PHOTOS_ENABLED)', 'photos stay off until the legal advice in docs/11 (DECISIONS 2026-09-19)');
  check(!/^DEV_STEWARD/m.test(toml), 'stop', 'DEV_STEWARD is not in wrangler.toml (local only, in api/.dev.vars)', 'remove DEV_STEWARD from api/wrangler.toml');

  // The two protections only a person can see (api/edge-protections.md).
  const signed = file(ATTESTATIONS), today = now.toISOString().slice(0, 10);
  const attested: [string, string, string][] = [
    ['access_policy', 'a person has signed that the Cloudflare Access policy covers /admin/* and /v1/steward/*', 'make the Access application (OPERATIONS step 5), then sign the access_policy line in api/edge-protections.md'],
    ['waf_rate_limit', 'a person has signed that the WAF rate-limiting rule on POST /v1/* exists', 'make the rate-limiting rule (OPERATIONS step 6), then sign the waf_rate_limit line in api/edge-protections.md'],
  ];
  for (const [key, what, fix] of attested) {
    const a = readAttestation(signed, key, today);
    check(a.ok, 'stop', what, `${a.why}. ${fix}, and prove it afterwards with pnpm smoke -- https://<domain> --i-own-this-origin (docs/DEPLOY-HANDOFF-2026-09-20.md)`);
    // Nothing tells us when a dashboard rule is deleted, so an old signature asks for a fresh look, never a stop.
    if (a.ok && a.on) check(Date.parse(today) - Date.parse(a.on) < 180 * 86400000, 'look', `the ${key} signature is less than 180 days old`, `signed ${a.on} by ${a.by}; look in the dashboard again and re-sign the line`);
  }

  // The nightly publish. Preflight can't read a repository variable, so it only checks that the job is still gated.
  const workflow = file('.github/workflows/publish.yml');
  check(!!workflow && /if:\s*vars\.PUBLISH_ENABLED == 'true'/.test(workflow), workflow ? 'stop' : 'look', 'the nightly publish exists and stays off until PUBLISH_ENABLED is true',
    workflow ? "publish.yml lost its `if: vars.PUBLISH_ENABLED == 'true'` gate: it would publish on every schedule" : '.github/workflows/publish.yml is missing; nothing publishes on a schedule');

  // What the app will show.
  const directory = JSON.parse(file('data/seed/directory.json') ?? '{}') as { retired?: boolean; photos?: boolean };
  check(directory.retired !== true, 'look', 'the directory is not marked retired', 'data/seed/directory.json says retired: true; every phone will show the shutdown notice');
  check(directory.photos !== true, 'look', 'the photo field is off in the app (directory.json)', 'photos stay off until the legal advice in docs/11');
  // Parsed as real CSV: a label like "Sexual assault help, 24 hours (Avalon Healing Center)" holds commas, and
  // splitting on them shifted the columns and invented a mismatch that stopped a deploy for no reason.
  const emergency = parseCsv(file('data/seed/emergency.csv') ?? '', { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const mismatched = emergency.filter((r) => (r.mismatch_on ?? '') !== '').map((r) => r.id);
  check(mismatched.length === 0, 'stop', 'no emergency number has a page that showed a different number', `fix ${mismatched.join(', ')} in data/seed/emergency.csv by hand (check:emergency found a mismatch)`);

  // The page shell.
  const headers = file('apps/web/public/_headers') ?? '';
  check(/frame-ancestors 'none'/.test(headers) && /X-Frame-Options:\s*DENY/i.test(headers), 'stop', 'the steward page can\'t be framed (apps/web/public/_headers)', 'restore apps/web/public/_headers');
  const en = JSON.parse(file('strings/en.json') ?? '{}') as Record<string, string>;
  const manifest = JSON.parse(file('apps/web/public/manifest.webmanifest') ?? '{}') as { name?: string };
  check(en['app.name'] === '313 Help' && manifest.name === '313 Help' && /<title>313 Help<\/title>/.test(file('apps/web/index.html') ?? ''), 'stop', 'the app is named 313 Help in the strings, the manifest and the page title', 'the name changes only with Kyle (CLAUDE.md)');

  // Work a person still owes.
  const worksheet = file('docs/CHECKS-2026-09-19.md');
  const open = worksheet ? worksheet.split('\n').filter((l) => /^\| .*\| \|$/.test(l.trim())).length : 0;
  check(open === 0, 'look', 'the hand-check worksheet is done (docs/CHECKS-2026-09-19.md)', `${open} rows still have no result`);
  return out;
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/preflight.ts')) {
  const results = preflight({ env: process.env, file: (f) => (existsSync(p(f)) ? readFileSync(p(f), 'utf8') : null) });
  for (const c of results) console.log(`${c.ok ? 'ok  ' : c.level === 'stop' ? 'STOP' : 'look'}  ${c.what}${c.fix ? `\n        -> ${c.fix}` : ''}`);
  const stops = results.filter((c) => !c.ok && c.level === 'stop').length;
  console.log(stops ? `\n${stops} thing(s) to fix before a deploy.` : '\nReady, apart from anything marked "look".');
  console.log('The nightly publish stays off until the repository variable PUBLISH_ENABLED is true (docs/OPERATIONS.md).');
  if (stops) process.exitCode = 1;
}
