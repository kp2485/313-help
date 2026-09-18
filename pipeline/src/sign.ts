// Ed25519 signatures over the exact bytes of index.json (audit A5).
// index.json lists a SHA-256 for every other file, so one signature covers the bundle.
// Clients pin two public keys (active + spare) and keep their old bundle if verification fails.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { p } from './util.js';

export const publicKeyB64 = (key: KeyObject) =>
  createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');

export function generate(): { privatePem: string; publicB64: string } {
  const { privateKey } = generateKeyPairSync('ed25519');
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, publicB64: publicKeyB64(privateKey) };
}

/**
 * Release builds read BUNDLE_SIGNING_KEY (PKCS8 PEM) from the environment.
 * Dev builds fall back to a throwaway key in .keys/ (git-ignored) and say so in index.json.
 */
export function loadSigningKey(release: boolean): { key: KeyObject; kind: 'release' | 'dev' } {
  const env = process.env.BUNDLE_SIGNING_KEY;
  if (env) return { key: createPrivateKey(env.replace(/\\n/g, '\n')), kind: 'release' };
  if (release) throw new Error('BUNDLE_SIGNING_KEY is not set; a release bundle must be signed with the real key');
  const path = p('.keys/dev-ed25519.pem');
  if (!existsSync(path)) { mkdirSync(p('.keys'), { recursive: true }); writeFileSync(path, generate().privatePem, { mode: 0o600 }); }
  return { key: createPrivateKey(readFileSync(path, 'utf8')), kind: 'dev' };
}

export const signBytes = (bytes: Buffer, key: KeyObject) => sign(null, bytes, key).toString('base64');

export function verifyBytes(bytes: Buffer, signatureB64: string, publicKeysB64: string[]): boolean {
  return publicKeysB64.some((b64) => {
    try {
      const pub = createPublicKey({ key: Buffer.from(b64, 'base64'), type: 'spki', format: 'der' });
      return verify(null, bytes, pub, Buffer.from(signatureB64, 'base64'));
    } catch { return false; }
  });
}
