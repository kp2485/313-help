// Bundle authenticity (audit A5). index.json is signed with Ed25519; it lists a SHA-256 for every
// other file. The app pins public keys at build time and refuses anything else, so a tampered
// CDN, feed, or cache cannot put a wrong phone number on someone's screen.
// @noble/ed25519 rather than WebCrypto Ed25519: older Android browsers don't have the latter.
// zip215: false = strict RFC 8032 checking. We make our own signatures with Node, so nothing valid is lost.

import * as ed from '@noble/ed25519';

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** SPKI DER for Ed25519 is a fixed 12-byte header followed by the 32-byte key. */
const rawKey = (spkiB64: string) => b64(spkiB64).slice(-32);

export async function signatureOk(indexBytes: Uint8Array, signatureB64: string, pinnedSpkiB64: string[]): Promise<boolean> {
  for (const key of pinnedSpkiB64) {
    try { if (await ed.verifyAsync(b64(signatureB64), indexBytes, rawKey(key), { zip215: false })) return true; } catch { /* try the next pinned key */ }
  }
  return false;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
