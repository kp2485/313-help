// Checks for the keys a release build pins (audit A5): the app refuses any list not signed by one of them, so a
// release that pins the wrong keys, or only one, can't be fixed without shipping a new app. Used by vite.config.ts.

// An Ed25519 public key in SPKI DER form is 44 bytes: this fixed 12-byte header, then the 32-byte key.
const SPKI_ED25519 = '302a300506032b6570032100';

/** The points of small order on Ed25519, as their y bytes with the sign bit cleared — seven values, and with the
 *  sign bit either way the eight small-order points plus the two non-canonical spellings. A signature verifies
 *  under any of them for a message the attacker did not choose, so a build that pinned one would "verify" a list
 *  nobody signed. None is ever a real signing key. The same list iOS (HelpCore/Verify.swift) and Android
 *  (Ed25519.kt) refuse; it is libsodium's `crypto_core_ed25519_is_valid_point` blacklist. */
const SMALL_ORDER_Y = [
  '0000000000000000000000000000000000000000000000000000000000000000',   // y = 0, order 4
  '0100000000000000000000000000000000000000000000000000000000000000',   // y = 1, the neutral point
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',   // order 8
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',   // order 8
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',   // y = p - 1, order 2
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',   // y = p, non-canonical 0
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',   // y = p + 1, non-canonical 1
];

/** The 32-byte key of a 44-byte SPKI blob, with the sign bit of x cleared: what the list above is compared with. */
function keyYHex(spkiHex: string): string {
  const bytes = spkiHex.slice(24).match(/../g)!;
  bytes[31] = (parseInt(bytes[31]!, 16) & 0x7f).toString(16).padStart(2, '0');
  return bytes.join('');
}

const hex = (b64: string): string | null => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try { return [...atob(b64)].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(''); } catch { return null; }
};

/** Problems with a release's pinned keys; empty when there are exactly two different Ed25519 keys (active + spare). */
export function releaseKeyProblems(keys: string[]): string[] {
  const out: string[] = [];
  if (keys.length !== 2) out.push(`a release pins exactly two keys (active and spare); got ${keys.length}`);
  keys.forEach((k, i) => {
    const h = hex(k);
    if (!h || h.length !== 88 || !h.startsWith(SPKI_ED25519)) { out.push(`key ${i + 1} is not a base64 SPKI Ed25519 public key`); return; }
    if (SMALL_ORDER_Y.includes(keyYHex(h))) out.push(`key ${i + 1} is a small-order point, which is not a signing key`);
  });
  if (keys.length === 2 && keys[0] === keys[1]) out.push('the active and spare keys are the same key');
  return out;
}
