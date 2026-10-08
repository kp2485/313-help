// Copies the bundle residents are using right now into data/bundle/v1, so a build on a laptop can package exactly
// what the site serves (the Android release does: scripts/release-android.sh). No private key is involved anywhere:
// the signature the site carries is checked here against the two pinned public keys, every other file against the
// SHA-256 the signed index gives for it, and nothing is written until all of it has passed.
//
//   BUNDLE_PUBLIC_KEYS="<active>,<spare>" pnpm fetch:bundle [https://313help.com/data/bundle/v1/]
//
// The request is the same plain GET a phone makes: no header of ours, no query string.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verifyBytes } from './sign.js';
import { p } from './util.js';

const base = (process.argv[2] ?? 'https://313help.com/data/bundle/v1/').replace(/\/?$/, '/');
const keys = (process.env.BUNDLE_PUBLIC_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
if (keys.length !== 2) {
  console.error('fetch:bundle: set BUNDLE_PUBLIC_KEYS to the two pinned public keys (active,spare), the repository variable of the same name.');
  process.exit(2);
}

async function get(name: string): Promise<Buffer> {
  const res = await fetch(new URL(name, base), { redirect: 'error' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const indexBytes = await get('index.json');
const sigBytes = await get('index.json.sig');
const sig = JSON.parse(sigBytes.toString('utf8')) as { alg?: string; signature?: string };
if (sig.alg !== 'Ed25519' || !sig.signature || !verifyBytes(indexBytes, sig.signature, keys)) {
  console.error('fetch:bundle: index.json is not signed by a pinned key. Nothing written.');
  process.exit(1);
}
const index = JSON.parse(indexBytes.toString('utf8')) as {
  version: string; signing: string; files: Record<string, { sha256: string; bytes: number }>;
};
if (index.signing !== 'release') {
  console.error(`fetch:bundle: the served bundle says signing="${index.signing}", not "release". Nothing written.`);
  process.exit(1);
}

const stage = mkdtempSync(join(tmpdir(), 'help313-bundle-'));
writeFileSync(join(stage, 'index.json'), indexBytes);
writeFileSync(join(stage, 'index.json.sig'), sigBytes);
const names = Object.keys(index.files);
for (const name of names) {
  if (name.includes('..') || name.startsWith('/')) throw new Error(`refusing path ${name}`);
  const bytes = await get(name);
  const want = index.files[name]!;
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== want.sha256 || bytes.length !== want.bytes) {
    console.error(`fetch:bundle: ${name} does not match the signed index (sha256 ${sha}, ${bytes.length} bytes). Nothing written.`);
    rmSync(stage, { recursive: true, force: true });
    process.exit(1);
  }
  mkdirSync(dirname(join(stage, name)), { recursive: true });
  writeFileSync(join(stage, name), bytes);
}

const dest = p('data/bundle/v1');
mkdirSync(p('data/bundle'), { recursive: true });
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
renameSync(stage, dest);
console.log(`fetch:bundle: ${names.length + 2} files, version ${index.version}, release-signed by a pinned key → ${dest}`);
