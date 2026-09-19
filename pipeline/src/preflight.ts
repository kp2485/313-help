// `pnpm preflight`: is this checkout ready to deploy? Read-only. It looks at the config files and the environment
// the deploy would use and prints each check. Anything marked "stop" must be fixed first; "look" needs a person's
// eyes but doesn't block. It never prints a secret, only whether one is set and fits.
//
//   BUNDLE_SIGNING_KEY=... BUNDLE_PUBLIC_KEYS=a,b pnpm preflight

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { p } from './util.js';

export interface Check { ok: boolean; level: 'stop' | 'look'; what: string; fix?: string }
export interface Inputs {
  env: Record<string, string | undefined>;
  /** Contents of a repo file, or null when it doesn't exist. */
  file: (path: string) => string | null;
}

const SPKI_ED25519 = '302a300506032b6570032100';
const isEd25519Spki = (b64: string) => { try { const h = Buffer.from(b64, 'base64').toString('hex'); return h.length === 88 && h.startsWith(SPKI_ED25519); } catch { return false; } };
const tomlVar = (toml: string, name: string) => new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'm').exec(toml)?.[1];

export function preflight({ env, file }: Inputs): Check[] {
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
  check(!/database_id\s*=\s*"0{8}-0{4}-0{4}-0{4}-0{12}"/.test(toml) && /database_id\s*=\s*"[0-9a-f-]{36}"/.test(toml), 'stop', 'api/wrangler.toml has the real D1 database id', 'wrangler d1 create detroithelp, then put its id in api/wrangler.toml (step 3)');
  const origin = tomlVar(toml, 'ALLOWED_ORIGIN') ?? '';
  check(/^https:\/\/[^/]+$/.test(origin) && !/localhost|127\.0\.0\.1/.test(origin), 'stop', 'ALLOWED_ORIGIN is the https site, not localhost', 'set ALLOWED_ORIGIN = "https://<domain>" in api/wrangler.toml');
  check(!!tomlVar(toml, 'ACCESS_TEAM_DOMAIN') && !!tomlVar(toml, 'ACCESS_AUD'), 'stop', 'Cloudflare Access team domain and AUD are set (the steward pages fail closed without them)', 'step 5: put ACCESS_TEAM_DOMAIN and ACCESS_AUD in api/wrangler.toml');
  check(tomlVar(toml, 'PHOTOS_ENABLED') !== 'true', 'look', 'photos are off in the Worker (PHOTOS_ENABLED)', 'photos stay off until the legal advice in docs/11 (DECISIONS 2026-09-19)');
  check(!/^DEV_STEWARD/m.test(toml), 'stop', 'DEV_STEWARD is not in wrangler.toml (local only, in api/.dev.vars)', 'remove DEV_STEWARD from api/wrangler.toml');

  // What the app will show.
  const directory = JSON.parse(file('data/seed/directory.json') ?? '{}') as { retired?: boolean; photos?: boolean };
  check(directory.retired !== true, 'look', 'the directory is not marked retired', 'data/seed/directory.json says retired: true; every phone will show the shutdown notice');
  check(directory.photos !== true, 'look', 'the photo field is off in the app (directory.json)', 'photos stay off until the legal advice in docs/11');
  const emergency = file('data/seed/emergency.csv') ?? '';
  const header = emergency.split(/\r?\n/)[0]?.split(',') ?? [];
  const col = header.indexOf('mismatch_on');
  const mismatched = col < 0 ? [] : emergency.split(/\r?\n/).slice(1).filter((l) => l && (l.split(',')[col] ?? '') !== '').map((l) => l.split(',')[0]);
  check(mismatched.length === 0, 'stop', 'no emergency number has a page that showed a different number', `fix ${mismatched.join(', ')} in data/seed/emergency.csv by hand (check:emergency found a mismatch)`);

  // The page shell.
  const headers = file('apps/web/public/_headers') ?? '';
  check(/frame-ancestors 'none'/.test(headers) && /X-Frame-Options:\s*DENY/i.test(headers), 'stop', 'the steward page can\'t be framed (apps/web/public/_headers)', 'restore apps/web/public/_headers');
  const en = JSON.parse(file('strings/en.json') ?? '{}') as Record<string, string>;
  const manifest = JSON.parse(file('apps/web/public/manifest.webmanifest') ?? '{}') as { name?: string };
  check(en['app.name'] === '313 Help' && manifest.name === '313 Help' && /<title>313 Help<\/title>/.test(file('apps/web/index.html') ?? ''), 'stop', 'the app is named 313 Help in the strings, the manifest and the page title', 'the name changes only with Kyle (CLAUDE.md)');
  check(/Not an official City of Detroit app/.test(en['about.p3'] ?? ''), 'stop', 'the "not an official City of Detroit app" line is there');

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
