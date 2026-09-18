import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEEDS, CATEGORIES, HARDCODED, TABS } from '../src/needs.js';
import { LISTING_KINDS, PLACE_KINDS } from '../src/report.js';
import { sha256Hex, signatureOk } from '../src/verify.js';
import { TRANSIT } from '../src/transit.js';
import { clip, decodeLine, inside, wx, wy } from '../src/map.js';
import { FOOD_BENEFITS } from '../src/benefits.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES, buildProposal } from '../src/propose.js';
import { canSave } from '../src/saved.js';
import { hoodList, hoodPage, type Hood, type Indicators } from '../src/hoods.js';
import { build as buildReport, nonce } from '../src/report.js';

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
    for (const tab of TABS) expect(strings[`tab.${tab.id}`], tab.id).toBeTypeOf('string');
    for (const id of ['food', 'shelter', 'doctor', 'narcan']) expect(strings[`quick.${id}`], id).toBeTypeOf('string');
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
  it('urgent needs come first on the Help tab, and urgent numbers are one tap from every screen', () => {
    expect(NEEDS.filter((n) => n.group === 'now').map((n) => n.id)).toEqual(['overdose_now', 'shelter', 'unsafe', 'talk']);
    expect(main).toMatch(/quickExit \? `<button class="exit" data-exit>[^`]+` : urgentBtn/);
  });
  it('transit links go to official sites only, over a known list of hosts', () => {
    const hosts = new Set(TRANSIT.sections.flatMap((s) => s.links ?? []).concat(TRANSIT.bike).map((l) => new URL(l.url).hostname.replace(/^www\./, '')));
    expect([...hosts].sort()).toEqual(['detroitmi.gov', 'mogodetroit.org', 'myddotbus.com', 'qlinedetroit.com', 'smartbus.org', 'thepeoplemover.com', 'tokentransit.com', 'transitapp.com']);
  });
});

describe('reports from the phone', () => {
  const day1 = new Date('2026-09-18T17:45:00Z'), day2 = new Date('2026-09-19T17:45:00Z');
  it('the dedupe hash is stable within a day, and unlinkable across targets and across days', async () => {
    const a = await nonce('sal_a', day1, 'secret'), again = await nonce('sal_a', new Date('2026-09-18T23:00:00Z'), 'secret');
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(again).toBe(a);
    expect(await nonce('sal_b', day1, 'secret')).not.toBe(a);
    expect(await nonce('sal_a', day2, 'secret')).not.toBe(a);
    expect(await nonce('sal_a', day1, 'other-phone')).not.toBe(a);
  });
  it('the day rolls over at Detroit midnight, not UTC midnight', async () =>
    expect(await nonce('sal_a', new Date('2026-09-19T03:30:00Z'), 's')).toBe(await nonce('sal_a', day1, 's')));
  it('a report carries exactly the fields the API accepts, and nothing about the device', async () => {
    const r = await buildReport('sal_a', 'moved', '  the sign says they moved  ', day1);
    expect(Object.keys(r).sort()).toEqual(['client_nonce', 'detail', 'kind', 'observed_at', 'target_id']);
    expect(r).toMatchObject({ target_id: 'sal_a', kind: 'moved', detail: 'the sign says they moved', observed_at: '2026-09-18T17:45Z' });
    expect(Object.keys(await buildReport('sal_a', 'confirmed_ok', '', day1))).not.toContain('detail');
    const src = readFileSync(join(__dirname, '../src/report.ts'), 'utf8');
    expect(src).toMatch(/credentials: 'omit'/);
    expect(src).not.toMatch(/navigator\.|geolocation|userAgent|localStorage|document\.cookie/);
  });
  it('place reports offer no way to report a person', () => {
    expect([...PLACE_KINDS].join(' ')).not.toMatch(/person|people|tent|camp|homeless|suspicious|loiter|vehicle/);
  });
});

describe('add a place, saved places, help paying for food', () => {
  const full = { name: '  New Hope pantry ', category: 'food', what: 'Free groceries', address: '1 Main St', phone: '313-555-0100', schedule_text: 'Tuesdays 10 to 12', how_known: 'volunteer', notes: '' };
  it('a proposal carries exactly the fields the API accepts, and nothing about the person or the phone', () => {
    const p = buildProposal(full)!;
    expect(Object.keys(p).sort()).toEqual(['address', 'category', 'how_known', 'name', 'phone', 'schedule_text', 'what']);
    expect(p.name).toBe('New Hope pantry');
    expect(buildProposal({ ...full, extra: 'x', lat: '42.3' } as Record<string, string>)).not.toHaveProperty('lat');
    const src = readFileSync(join(__dirname, '../src/propose.ts'), 'utf8');
    expect(src).toContain("credentials: 'omit'");
    expect(src).not.toMatch(/navigator|geolocation|userAgent|localStorage|document[.]cookie|installSecret/);
  });
  it('needs a name, what people get, a kind of help, and how the person knows', () => {
    for (const k of ['name', 'what', 'category', 'how_known']) expect(buildProposal({ ...full, [k]: ' ' }), k).toBeNull();
    expect(buildProposal({ ...full, category: 'shelter.dv' })).toBeNull();
    expect(buildProposal({ ...full, name: 'x'.repeat(500) })!.name).toHaveLength(120);
  });
  it('offers no way to propose a domestic-violence shelter, and every choice has plain words', () => {
    expect(PROPOSE_CATEGORIES.join(' ')).not.toMatch(/dv|mental/);
    for (const c of PROPOSE_CATEGORIES) expect(strings['add.cat.' + c], c).toBeTypeOf('string');
    for (const h of HOW_KNOWN) expect(strings['add.how.' + h], h).toBeTypeOf('string');
    for (const f of ['name', 'category', 'what', 'address', 'schedule_text', 'phone', 'how_known', 'notes']) expect(strings['add.f.' + f], f).toBeTypeOf('string');
  });
  it('domestic-violence and mental-health listings can never be saved; the Saved screen leaves no URL', () => {
    expect(canSave('shelter.dv')).toBe(false); expect(canSave('health.mental')).toBe(false);
    expect(canSave('food.pantry')).toBe(true); expect(canSave('harm.narcan')).toBe(true);
    expect(strings['saved.note']).toMatch(/this phone only/);
    expect(main).toContain("canSave(r.category) ? `<button");
  });
  it('help paying for food links only to the programs\' own sites, over https', () => {
    expect(FOOD_BENEFITS.items.map((b) => new URL(b.url).hostname).sort()).toEqual(['doubleupfoodbucks.org', 'newmibridges.michigan.gov', 'www.michigan.gov']);
    for (const b of FOOD_BENEFITS.items) expect(b.url.startsWith('https://')).toBe(true);
    expect(NEEDS.find((n) => n.id === 'food')!.refine!.map((r) => r.id)).toEqual(['today', 'week', 'paying']);
  });
});

describe('neighborhood pages (docs/13 honesty rules)', () => {
  const ui = { t: (k: string, p: Record<string, string | number> = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')), esc: (x: unknown) => String(x), date: (d: string) => d, link: (u: string, l: string) => '<a href="' + u + '">' + l + '</a>', go: (v: object) => "data-go='" + JSON.stringify(v) + "'", map: () => '<div class="mapbox"></div>' };
  const hood = (name: string, district: number | null, total: number): Hood => ({ id: 'nbh_' + name.toLowerCase(), name, district, center: [42.4, -83.1], rings: [], years: { 2024: { sales: 'lt5', permits: 12, permit_cost: 500000 }, 2025: { sales: 40, median_price: 90000 } },
    help: { total, by: { food: 0, harm: total }, nearest_miles: { food: 2.3, clinic: null, narcan: 0.5, indoors: 0.8 }, none_listed_yet: ['food', 'health'], coverage_checked: false }, places: { parks: 3, rec_centers: 1, greenway_open: 0 } });
  const src = { name: 'City data', url: 'https://example.org/x', last_edited: '2026-09-17' };
  const d: Indicators = { sources: { neighborhoods: src, sales: src, permits: src }, stats_fetched_at: '2026-09-18', first_year: 2024, partial_year: 2026, near_miles: 0.5, origin: [-83.32, 42.22], segments: {},
    city: { 2024: { sales: 8775, median_price: 79000 }, 2025: { sales: 7541, median_price: 85000 }, 2026: { sales: 3803, median_price: 86500 } }, neighborhoods: [hood('Zug', 1, 9), hood('Alpha', 1, 0), hood('Midway', 2, 4)] };
  it('lists neighborhoods in ABC order inside each district: never by a number', () => {
    const html = hoodList(d, ui);
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Zug')); expect(html.indexOf('Zug')).toBeLessThan(html.indexOf('Midway'));
    expect(html).toContain("We don't rank neighborhoods");
    expect(readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8')).not.toMatch(/sort[(][^)]*(total|median|sales|permits)/);
  });
  it('every page says the numbers describe and do not explain, and a thin list is called our gap, with a way to add a place', () => {
    const html = hoodPage(d.neighborhoods[0]!, d, ui);
    expect(html).toContain("They can't tell you why");
    expect(html).toContain('It does not mean there is no help here');
    expect(html).toContain('"v":"add"');
    expect(html).toContain('That describes our list, not the neighborhood');
    expect(html).not.toContain('MISSING:');
  });
  it('hidden counts read "fewer than 5", a missing price says why, the unfinished year says "so far", and both tables sit in one panel', () => {
    const html = hoodPage(d.neighborhoods[0]!, d, ui);
    expect(html).toContain('fewer than 5'); expect(html).toContain('too few sales to show a price'); expect(html).toContain('2026 so far');
    const panel = html.slice(html.indexOf('Read these two together'));
    expect(panel.indexOf('<table')).toBeGreaterThan(-1);
    expect(panel.slice(0, panel.indexOf('</div>')).match(/<table/g)).toHaveLength(2);
    expect(html).toContain('We leave out crime numbers on purpose');
  });
  it('neighborhood numbers are fetched only when asked for, and checked against the signed index', () => {
    const src2 = readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8');
    expect(src2).toContain('fetchVerified(index, FILE)'); expect(src2).not.toContain(' fetch(');
    expect(readFileSync(join(__dirname, '../src/data.ts'), 'utf8')).toContain("!name.startsWith('indicators/')");
  });
});

describe('map', () => {
  const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
  it('reads the pipeline line format: whole 1e-5 degrees from an origin, then steps', () => {
    const pts = decodeLine([5000, 5000, 2000, 0, 0, 1000], [-83.1, 42.3]);
    expect(pts[0]).toBeCloseTo(wx(-83.05), 6); expect(pts[1]).toBeCloseTo(wy(42.35), 6);
    expect(pts[2]).toBeCloseTo(wx(-83.03), 6); expect(pts[5]).toBeCloseTo(wy(42.36), 6);
  });
  it('clips a line to the screen for label placement, and knows when a tap is inside a park', () => {
    expect(clip(-10, 5, 30, 5, 0, 0, 20, 10)).toEqual([0, 5, 20, 5]);
    expect(clip(-10, -5, -1, 50, 0, 0, 20, 10)).toBeNull();
    const square = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
    expect(inside(5, 5, square)).toBe(true); expect(inside(15, 5, square)).toBe(false);
  });
  it('asks no other site for anything: no tile server, no URL at all; files are checked against the signed index', () => {
    expect(mapSrc).not.toContain('http');
    expect(mapSrc).toContain("fetchVerified(index, 'map/base.json')");
    expect(mapSrc).not.toContain(' fetch(');
  });
  it('a typed ZIP is never drawn as "you are here", and sensitive listings get no map', () => {
    expect(main).toContain('me: here && !hereZip ? here : null');
    expect(main).toContain('!sensitive && r.lat !== undefined ? mapBox');
  });
  it('the list map is closed until asked for, and is never offered on the "not safe at home" screen', () => {
    expect(main).toContain('let listMap = false;');
    expect(main).toContain("const pins = opts.noDistance ? [] : ranked.filter((r) => r.row.lat !== undefined && r.row.category !== 'shelter.dv' && r.row.category !== 'health.mental');");
  });
  it('the full-screen map leaves the top bar (Urgent help, quick exit) in reach', () => expect(mapSrc).toContain("querySelector('header.top')"));
});

describe('privacy and copy rules, checked against the source', () => {
  it('every strings key used in main.ts exists', () => {
    // Whole literal keys only: t('od.s' + i) is a prefix, covered by the steps test below.
    const used = [...main.matchAll(/\b[tT]\('([a-z_]+\.[\w.]*\w)'\s*[,)]/g)].map((m) => m[1]!);
    for (let i = 1; i <= 6; i++) used.push(`od.s${i}`);
    for (const ph of ['open', 'under_construction', 'funded', 'planned']) used.push(`gw.${ph}`);
    for (const k of [...LISTING_KINDS, ...PLACE_KINDS]) used.push(`report.kind.${k}`);
    expect(used.length).toBeGreaterThan(40);
    for (const k of used) expect(strings[k], k).toBeTypeOf('string');
  });
  it('never writes to localStorage, sessionStorage, or cookies, and never sends anything', () => {
    for (const f of ['main.ts', 'data.ts', 'needs.ts', 'verify.ts', 'map.ts', 'hoods.ts', 'saved.ts', 'benefits.ts']) {
      const src = readFileSync(join(__dirname, '../src', f), 'utf8');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest/);
      expect(src.match(/method:\s*'POST'/), f).toBeNull();
    }
  });
  it('need screens and search never put anything in the URL', () => {
    expect(main).toMatch(/return null; \/\/ the urgent sheet, search, saved places, and every "need" screen: no trace/);
    const hashFor = main.slice(main.indexOf('function hashFor'), main.indexOf('function fromHash'));
    expect(hashFor).not.toMatch(/'search'|'need'|'urgent'|'saved'/);
  });
  it('what a person types (search text, ZIP) stays in a variable: never in storage, a request, or the URL', () => {
    // idbSet is the only way this app writes to the phone, and main.ts never calls it.
    expect(main).not.toMatch(/idbSet|indexedDB/);
    for (const name of ['searchText', 'hereZip']) {
      const lines = main.split('\n').filter((l) => l.includes(name));
      expect(lines.length, name).toBeGreaterThan(0);
      for (const l of lines) expect(l, name).not.toMatch(/fetch\(|pushState|location\.|href=/);
    }
    expect(main).toMatch(/if \(view\.v === 'tab'\) \{ stack\.length = 0; searchText = ''; \}/);
    expect(main).toMatch(/<input id="q"[^>]*autocomplete="off"/);
    expect(main).toMatch(/<input name="zip"[^>]*autocomplete="off"/);
  });
  it('no third-party origins in the page shell', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).toMatch(/default-src 'self'/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
