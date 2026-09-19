// Checks for the keys a release build pins (audit A5): the app refuses any list not signed by one of them, so a
// release that pins the wrong keys, or only one, can't be fixed without shipping a new app. Used by vite.config.ts.

// An Ed25519 public key in SPKI DER form is 44 bytes: this fixed 12-byte header, then the 32-byte key.
const SPKI_ED25519 = '302a300506032b6570032100';

const hex = (b64: string): string | null => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try { return [...atob(b64)].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(''); } catch { return null; }
};

/** Problems with a release's pinned keys; empty when there are exactly two different Ed25519 keys (active + spare). */
export function releaseKeyProblems(keys: string[]): string[] {
  const out: string[] = [];
  if (keys.length !== 2) out.push(`a release pins exactly two keys (active and spare); got ${keys.length}`);
  keys.forEach((k, i) => { const h = hex(k); if (!h || h.length !== 88 || !h.startsWith(SPKI_ED25519)) out.push(`key ${i + 1} is not a base64 SPKI Ed25519 public key`); });
  if (keys.length === 2 && keys[0] === keys[1]) out.push('the active and spare keys are the same key');
  return out;
}
