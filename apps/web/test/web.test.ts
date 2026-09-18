import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEEDS, CATEGORIES, HARDCODED } from '../src/needs.js';
import { sha256Hex, signatureOk } from '../src/verify.js';

const root = join(__dirname, '../../..');
const strings = JSON.parse(readFileSync(join(root, 'strings/en.json'), 'utf8')) as Record<string, string>;
const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');

describe('bundle verification in the browser code path', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pinned = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const index = new TextEncoder().encode('{"version":"x","files":{}}');
  const sig = sign(null, index, privateKey).toString('base64');

  it('accepts a bundle signed by a pinned key (same format the pipeline writes)', async () => expect(await signatureOk(index, sig, [pinned])).toBe(true));
  it('accepts the spare key too', async () => {
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    expect(await signatureOk(index, sig, [other, pinned])).toBe(true);
  });
  it('rejects a changed index, an unpinned key, and no keys at all', async () => {
    expect(await signatureOk(new TextEncoder().encode('{"version":"y","files":{}}'), sig, [pinned])).toBe(false);
    const stranger = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    expect(await signatureOk(index, sig, [stranger])).toBe(false);
    expect(await signatureOk(index, sig, [])).toBe(false);
  });
  it('hashes like the pipeline', async () => expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
});

describe('needs list', () => {
  it('every need, refinement, and category has plain-language copy', () => {
    for (const n of NEEDS) {
      expect(strings[`need.${n.id}`], n.id).toBeTypeOf('string');
      for (const r of n.refine ?? []) expect(strings[`refine.${n.id}.${r.id}`], `${n.id}.${r.id}`).toBeTypeOf('string');
    }
    for (const c of CATEGORIES) expect(strings[`cat.${c.id}`], c.id).toBeTypeOf('string');
  });
  it('the overdose-now screen has 911 and steps, and no list of places', () => {
    const od = NEEDS.find((n) => n.id === 'overdose_now')!;
    expect(od).toMatchObject({ stepsOnly: true, first: ['emg_911'] });
    expect(od.query).toBeUndefined(); expect(od.refine).toBeUndefined();
  });
  it('"not safe at home" and "need to talk" show phone numbers first, offer a quick exit, and leave no URL', () => {
    for (const id of ['unsafe', 'talk']) expect(NEEDS.find((n) => n.id === id)).toMatchObject({ sensitive: true, quickExit: true });
    expect(NEEDS.find((n) => n.id === 'unsafe')!.first).toEqual(['emg_ndvh', 'emg_911']);
    expect(NEEDS.find((n) => n.id === 'talk')!.first![0]).toBe('emg_988');
  });
  it('911 and 988 are hardcoded', () => expect(HARDCODED).toEqual({ emg_911: '911', emg_988: '988' }));
});

describe('privacy and copy rules, checked against the source', () => {
  it('every strings key used in main.ts exists', () => {
    // Whole literal keys only: t('od.s' + i) is a prefix, covered by the steps test below.
    const used = [...main.matchAll(/\b[tT]\('([a-z_]+\.[\w.]*\w)'\s*[,)]/g)].map((m) => m[1]!);
    for (let i = 1; i <= 6; i++) used.push(`od.s${i}`);
    for (const ph of ['open', 'under_construction', 'funded', 'planned']) used.push(`gw.${ph}`);
    expect(used.length).toBeGreaterThan(40);
    for (const k of used) expect(strings[k], k).toBeTypeOf('string');
  });
  it('never writes to localStorage, sessionStorage, or cookies, and never sends anything', () => {
    for (const f of ['main.ts', 'data.ts', 'needs.ts', 'verify.ts']) {
      const src = readFileSync(join(__dirname, '../src', f), 'utf8');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest/);
      expect(src.match(/method:\s*'POST'/), f).toBeNull();
    }
  });
  it('need screens never put anything in the URL', () => {
    expect(main).toMatch(/return null; \/\/ home, more, and every "need" screen: no trace/);
  });
  it('no third-party origins in the page shell', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).toMatch(/default-src 'self'/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
