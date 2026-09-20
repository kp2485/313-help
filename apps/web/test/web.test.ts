import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEEDS, CATEGORIES, HARDCODED, TABS, isPrivate, isSensitive } from '../src/needs.js';
import { LISTING_KINDS, PLACE_KINDS } from '../src/report.js';
import { sha256Hex, signatureOk } from '../src/verify.js';
import { TRANSIT } from '../src/transit.js';
import { clip, decodeLine, inside, wx, wy } from '../src/map.js';
import { LINKS } from '../src/links.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES, buildProposal } from '../src/propose.js';
import { canSave } from '../src/saved.js';
import { telHref } from '../src/phone.js';
import { releaseKeyProblems } from '../src/keys.js';
import { hoodList, hoodPage, rate, type Hood, type Indicators } from '../src/hoods.js';
import { build as buildReport, fitWithin, nonce, plainJpeg } from '../src/report.js';

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
    for (const id of ['food', 'shelter', 'doctor', 'drugs', 'job', 'narcan']) expect(strings[`quick.${id}`], id).toBeTypeOf('string');
    // "This week" and "Work, school, and paperwork" are short tiles; "Right now" keeps its full sentences.
    for (const n of NEEDS.filter((x) => x.group !== 'now')) expect(strings[`tile.${n.id}`], n.id).toBeTypeOf('string');
  });
  it('"I\'m under 25" lists emergency shelters, youth shelters first (not after-school programs)', () => {
    const young = NEEDS.find((n) => n.id === 'shelter')!.refine!.find((r) => r.id === 'young')!;
    expect(young.query).toEqual({ category: 'shelter.emergency', prefer: ['youth'] });
    const seed = readFileSync(join(root, 'data/seed/resources.csv'), 'utf8');
    expect(seed).toMatch(/^sal_covenant_house_detroit,(?:[^,]*,){5}shelter\.emergency,/m);
  });
  it('"a safe place to sleep tonight" opens with 313SafeBeds, then the shelter lines (Kyle, 2026-09-20)', () => {
    const shelter = NEEDS.find((n) => n.id === 'shelter')!;
    expect(shelter.firstLinks).toBe('beds');
    expect(LINKS.beds!.items.map((i) => i.url)).toEqual(['https://313safebeds.com/']);
    expect(shelter.first).toEqual(['emg_shelter_helpline', 'emg_shelter_outwayne']);
    // The link panel is drawn above the call buttons on the screen itself.
    expect(main).toContain('${topLinks}${first ? `<div class="stackbtns">${first}</div>` : \'\'}');
    expect(strings['link.beds.safebeds.body']).toMatch(/their site, not ours/);
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
  it('treatment: DWIHN\'s 24-hour line first, then SAMHSA; sexual assault: hotlines and 911 first; both have a quick exit', () => {
    expect(NEEDS.find((n) => n.id === 'drugs')).toMatchObject({ first: ['emg_dwihn_crisis', 'emg_dwihn_care_center', 'emg_samhsa'], quickExit: true });
    expect(NEEDS.find((n) => n.id === 'assault')).toMatchObject({ first: ['emg_avalon', 'emg_voices4', 'emg_911'], quickExit: true, query: { category: 'assault' } });
    const emg = readFileSync(join(root, 'data/seed/emergency.csv'), 'utf8');
    for (const id of ['emg_dwihn_crisis', 'emg_dwihn_care_center', 'emg_samhsa', 'emg_avalon', 'emg_voices4']) expect(emg, id).toMatch(new RegExp(`^${id},`, 'm'));
    for (const wrong of ['800-421-4949', '800-231-1127', '800-841-4949']) expect(emg.split('\n').filter((l) => l.startsWith('emg_')).map((l) => l.split(',').slice(0, 4).join(',')).join('\n')).not.toContain(wrong);
  });
  it('911 and 988 are hardcoded', () => expect(HARDCODED).toEqual({ emg_911: '911', emg_988: '988' }));
  it('urgent needs come first on the Help tab, and urgent numbers are one tap from every screen', () => {
    expect(NEEDS.filter((n) => n.group === 'now').map((n) => n.id)).toEqual(['overdose_now', 'shelter', 'unsafe', 'talk', 'drugs', 'assault']);
    expect(main).toContain("<h2>${T('help.now')}</h2>${rows('now')}<h2>${T('help.soon')}</h2>${tiles('soon')}<h2>${T('help.later')}</h2>${tiles('later')}");
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
  it('a photo is re-drawn small on a canvas before it leaves, goes only with a place report, and the camera is asked for, not the gallery', async () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1280, h: 960 }); expect(fitWithin(3024, 4032)).toEqual({ w: 960, h: 1280 }); expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
    expect(Object.keys(await buildReport('seg_a', 'light_out', '', day1, 'ph_' + 'a'.repeat(32))).sort()).toEqual(['client_nonce', 'kind', 'observed_at', 'photo', 'target_id']);
    const src = readFileSync(join(__dirname, '../src/report.ts'), 'utf8');
    expect(src).toContain("canvas.toBlob((b) => ok(b), 'image/jpeg'");
    // The browser's own color-profile block (APP2) and anything else extra is cut out; the picture data is untouched.
    const sg = (mk: number, n: number) => [0xff, mk, 0, n + 2, ...new Array(n).fill(7)];
    const made = new Uint8Array([0xff, 0xd8, ...sg(0xe0, 14), ...sg(0xe2, 40), ...sg(0xe1, 20), ...sg(0xfe, 9), ...sg(0xdb, 65), ...sg(0xc0, 15), ...sg(0xc4, 20), ...sg(0xda, 10), 1, 2, 3, 0xff, 0xd9]);
    const plain = plainJpeg(made)!;
    expect(plain.length).toBe(made.length - 44 - 24 - 13); expect([...plain.slice(-5)]).toEqual([1, 2, 3, 0xff, 0xd9]);
    expect(plainJpeg(new Uint8Array([1, 2, 3, 4]))).toBeNull(); expect(src).toContain("fetch('/v1/photos'");
    expect(main).toContain('capture="environment" data-photo'); expect(main).toContain("isPlace && bundle?.index.photos === true ? `<label>${T('report.photo_label')}");   // and only when a person turned photos on
    expect(strings['report.photo_note']).toMatch(/not of people/);
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
    expect(LINKS.food!.items.map((b) => new URL(b.url).hostname).sort()).toEqual(['doubleupfoodbucks.org', 'newmibridges.michigan.gov', 'www.michigan.gov']);
    expect(NEEDS.find((n) => n.id === 'food')!.refine!.map((r) => r.id)).toEqual(['today', 'week', 'paying']);
  });
  it('every link-out set a need names exists, is https, has a checked date, and has words in both languages', () => {
    const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;
    const named = NEEDS.flatMap((n) => [n.links, ...(n.refine ?? []).map((r) => r.links)]).filter((x): x is string => !!x);
    for (const set of named) {
      const l = LINKS[set];
      expect(l, set).toBeDefined();
      expect(l!.checked, set).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(l!.items.length, set).toBeGreaterThan(0);
      for (const b of l!.items) {
        expect(b.url.startsWith('https://'), b.url).toBe(true);
        for (const k of ['title', 'body', 'label']) { expect(strings[`link.${set}.${b.id}.${k}`], `${set}.${b.id}.${k}`).toBeTypeOf('string'); expect(es[`link.${set}.${b.id}.${k}`], `es ${set}.${b.id}.${k}`).toBeTypeOf('string'); }
      }
    }
  });
  it('treatment and sexual-assault listings are private: never saved, never in the URL, quick exit; they keep a map dot', () => {
    for (const c of ['treatment.detox', 'treatment.meds', 'assault', 'shelter.dv', 'health.mental']) { expect(isPrivate(c), c).toBe(true); expect(canSave(c), c).toBe(false); }
    for (const c of ['harm.narcan', 'health.clinic', 'jobs.find', 'treatments']) expect(isPrivate(c), c).toBe(false);
    for (const c of ['treatment.detox', 'assault']) expect(isSensitive(c), c).toBe(false);   // address, distance and map stay
    expect(main).toContain('return { title: r.name, exit: priv, html:');
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
  it('blight is a rate per 1,000 lots with its caveat on the chart, and a hidden count never becomes a rate', () => {
    expect(rate(250, 5000)).toBe(50); expect(rate('lt5', 5000)).toBeUndefined(); expect(rate(250, 40)).toBeUndefined(); expect(rate(250, undefined)).toBeUndefined();
    const withCond: Indicators = { ...d, city_parcels: 377000, issue_types: ['Illegal Dump Sites'], sources: { ...d.sources, blight: src, demolitions: src, issues: src, parcels: src },
      neighborhoods: [{ ...d.neighborhoods[0]!, parcels: 5000, years: { 2025: { blight: 250, demolitions: 'lt5', issues: 40, issue_days: 8 } } }] };
    const html = hoodPage(withCond.neighborhoods[0]!, withCond, ui);
    expect(html).toContain('Tickets show where inspectors went as much as where blight is');
    expect(html).toContain('We never count reports about people');
    expect(html).toContain('8 days'); expect(html).toContain('fewer than 5, or none'); expect(html).not.toContain('MISSING:');
  });
  it('Bridge-card stores, bus stops, rentals, fires, vacant buildings and streets: each with its caveat next to it, and its source', () => {
    const more: Indicators = { ...d, city_parcels: 377000, issue_types: [], fire_types: ['Building fire'], roads_years: [2023, 2024], vacant_period: ['2025-09-19', '2026-09-16'],
      sources: { ...d.sources, blight: src, snap: { ...src, name: 'SNAP stores' }, bus_stops: { ...src, name: 'DDOT stops' }, rentals: { ...src, name: 'Rental certificates' }, fires: { ...src, name: 'Fire calls' }, pavement: { ...src, name: 'Street ratings' }, vacant: { ...src, name: 'Vacant registrations' } },
      city: { 2025: { fires: 2245 } }, city_now: { rental_certs: 12276, vacant_reg: 1493, roads: { pieces: 15000, miles: 826, poor_pct: 31 } },
      neighborhoods: [{ ...d.neighborhoods[0]!, parcels: 5000, years: { 2025: { fires: 20 } }, places: { parks: 1, rec_centers: 0, greenway_open: 0, snap_stores: 7, bus_stops: 31 },
        nearest_city: { snap: 0.3, grocery: 1.4, bus: 0.1 }, now: { rental_certs: 150, vacant_reg: 'lt5', roads: { pieces: 60, miles: 5.2, poor_pct: 45 } } }] };
    const html = hoodPage(more.neighborhoods[0]!, more, ui);
    expect(html).not.toContain('MISSING:');
    expect(html).toContain('Stores that take a Bridge card'); expect(html).toContain('>7<'); expect(html).toContain('>31<'); expect(html).toContain('1.4');
    // Rentals sit in the "can people stay" panel, next to their caveat, and the panel still holds exactly its two tables.
    const money = html.slice(html.indexOf('Read these two together')); const moneyPanel = money.slice(0, money.indexOf('</div>'));
    expect(moneyPanel).toContain('150 (30 for every 1,000 lots)'); expect(moneyPanel).toContain('Many rentals never sign up'); expect(moneyPanel.match(/<table/g)).toHaveLength(2);
    // Fires: a rate per 1,000 lots (20 / 5,000 = 4.0), with what was and was not counted right under the table.
    expect(html).toContain('4.0'); expect(html).toContain('Not counted: car, trash and grass fires, medical calls');
    expect(html).toContain('fewer than 5'); expect(html).toContain('It does not count every empty building');
    expect(html).toContain('45% of 5.2 miles'); expect(html).toContain('Whole city: 31%'); expect(html).toContain('not side streets');
    for (const s of ['SNAP stores', 'DDOT stops', 'Rental certificates', 'Fire calls', 'Street ratings', 'Vacant registrations']) expect(html.slice(html.indexOf('Where these numbers come from'))).toContain(s);
    // An older bundle without these numbers still draws a page, without empty rows.
    const old = hoodPage(d.neighborhoods[0]!, d, ui);
    expect(old).not.toContain('Bridge card'); expect(old).not.toContain('MISSING:');
  });
  it('neighborhood numbers are fetched only when asked for, and checked against the signed index', () => {
    const src2 = readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8');
    expect(src2).toContain('fetchVerified(index, FILE)'); expect(src2).not.toContain(' fetch(');
    expect(readFileSync(join(__dirname, '../src/data.ts'), 'utf8')).toContain("!name.startsWith('indicators/')");
  });
});

describe('Spanish', () => {
  const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;
  const holes = (v: string) => (v.match(/[{]\w+[}]/g) ?? []).sort().join(',');
  it('has every English key, and no extra ones', () => expect(Object.keys(es)).toEqual(Object.keys(strings)));
  it('keeps every placeholder, so no number or date goes missing', () => { for (const k of Object.keys(strings)) expect(holes(es[k]!), k).toBe(holes(strings[k]!)); });
  it('keeps 911, 988 and 211 where the English has them', () => { for (const k of Object.keys(strings)) for (const n of ['911', '988', '211']) if (strings[k]!.includes(n)) expect(es[k], k).toContain(n); });
  it('the language choice stays on the phone, and a place\'s own words are never machine-translated', () => {
    const src = readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8');
    expect(src).not.toMatch(/fetch[(]|localStorage|cookie/); expect(src).toContain("idbSet('lang'");
    expect(main).toContain('<p lang="en">${esc(r.what)}</p>');
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
    expect(main).toContain('ranked.filter((r) => r.row.lat !== undefined && !isSensitive(r.row.category))');
  });
  it('one sensitivity rule: DV and crisis listings get no map dot anywhere, including greenway segments, and no URL', () => {
    for (const c of ['shelter.dv', 'health.mental', 'health.mental.crisis']) expect(isSensitive(c), c).toBe(true);
    for (const c of ['shelter.emergency', 'health.clinic', 'food.pantry']) expect(isSensitive(c), c).toBe(false);
    expect(main).toContain('helpAlong(bundle!.rows.filter((r) => !isSensitive(r.category)), s)');
    expect(main).toContain('sensitive: (id) => { const r = bundle?.rows.find((x) => x.id === id); return !!r && isPrivate(r.category); }');   // router.ts: no URL for these (private includes sensitive)
    expect(main).not.toMatch(/category [!=]== 'shelter.dv'|category [!=]== 'health.mental'/);
  });
  it('the full-screen map leaves the top bar (Urgent help, quick exit) in reach', () => expect(mapSrc).toContain("querySelector('header.top')"));
  it('the greenway is drawn like a transit line, and the key says each phase in words', () => {
    // One width and a casing under every stretch, so the route reads as one line whatever phase it is in.
    expect(mapSrc).toContain('for (const g of onScreen) stroke(g, col.gwCase, gwW + 4, []);');
    for (const phase of ['open', 'under_construction', 'funded', 'planned']) expect(mapSrc, phase).toContain(`${phase}: { color: col.gw`);
    // Least built first, so an open stretch is never covered by a dotted one.
    expect(mapSrc).toContain("for (const phase of ['planned', 'funded', 'under_construction', 'open'])");
    // Colour never carries the meaning alone: the key under the map names every phase.
    expect(main).toContain("<ul class=\"gwkey\">");
    for (const phase of ['open', 'under_construction', 'funded', 'planned']) expect(strings[`gw.${phase}`], phase).toBeTypeOf('string');
    const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
    for (const v of ['--gw-open', '--gw-build', '--gw-fund', '--gw-plan', '--gw-case']) expect(css, v).toContain(`${v}:`);
  });
});

describe('release builds pin two good keys', () => {
  const key = () => generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  it('two different Ed25519 keys pass', () => expect(releaseKeyProblems([key(), key()])).toEqual([]));
  it('one key, three keys, the same key twice, or not a key: refused', () => {
    const k = key();
    expect(releaseKeyProblems([k]).join()).toMatch(/exactly two/);
    expect(releaseKeyProblems([k, key(), key()]).join()).toMatch(/exactly two/);
    expect(releaseKeyProblems([k, k]).join()).toMatch(/same key/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    expect(releaseKeyProblems([k, rsa]).join()).toMatch(/key 2 is not/);
    expect(releaseKeyProblems([k, 'not base64!']).join()).toMatch(/key 2 is not/);
  });
  it('the build uses the check when WEB_RELEASE=1, and the nightly publish sets it', () => {
    const cfg = readFileSync(join(__dirname, '../vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/const release = process\.env\.WEB_RELEASE === '1'/);
    expect(cfg).toMatch(/releaseKeyProblems\(keys\)/);
    expect(readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8')).toMatch(/WEB_RELEASE: '1'/);
  });
});

describe('service worker', () => {
  // Runs public/sw.js against a fake browser: records what it would cache and which requests it takes over.
  const load = (net: (url: string) => { ok: boolean; body: string }) => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const stored = new Map<string, string>();
    const cache = {
      put: async (req: string | { url: string }, res: { body: string }) => { stored.set(typeof req === 'string' ? req : new URL(req.url).pathname, res.body); },
      addAll: async (urls: string[]) => { for (const u of urls) stored.set(u, 'x'); },
      match: async (req: string | { url: string }) => { const k = typeof req === 'string' ? req : new URL(req.url).pathname; return stored.has(k) ? { body: stored.get(k)! } : undefined; },
    };
    const self = { addEventListener: (n: string, f: (e: unknown) => void) => { handlers[n] = f; }, skipWaiting: () => {}, clients: { claim: () => {} } };
    const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: cache.match };
    const fetchFn = async (req: { url: string }) => { const r = net(req.url); return { ...r, clone: () => ({ ...r }) }; };
    new Function('self', 'caches', 'fetch', 'location', readFileSync(join(__dirname, '../public/sw.js'), 'utf8'))(self, caches, fetchFn, new URL('https://app.test/'));
    const request = async (path: string, mode = 'no-cors', method = 'GET') => {
      let taken: Promise<unknown> | null = null;
      handlers.fetch!({ request: { url: 'https://app.test' + path, mode, method }, respondWith: (p: Promise<unknown>) => { taken = p; } });
      const res = taken ? await taken : null;
      await new Promise((r) => setTimeout(r, 0));
      return res;
    };
    return { stored, request, handlers };
  };
  it('never touches the API, the steward page, or the bundle', async () => {
    const sw = load(() => ({ ok: true, body: 'x' }));
    for (const p of ['/v1/reports', '/v1/steward/queue', '/admin', '/admin/', '/data/bundle/v1/index.json']) {
      expect(await sw.request(p, p.startsWith('/admin') ? 'navigate' : 'cors'), p).toBeNull();
    }
    expect([...sw.stored.keys()]).toEqual([]);
  });
  it('keeps the app page only when it loaded fine', async () => {
    const sw = load((u) => (u.endsWith('/') ? { ok: false, body: 'error page' } : { ok: true, body: 'x' }));
    await sw.request('/', 'navigate');
    expect(sw.stored.has('/')).toBe(false);
    const ok = load(() => ({ ok: true, body: 'app' }));
    await ok.request('/', 'navigate');
    expect(ok.stored.get('/')).toBe('app');
  });
  it('a newer shell name, so phones drop the old cache', () => {
    expect(readFileSync(join(__dirname, '../public/sw.js'), 'utf8')).toMatch(/const SHELL = 'shell-v2'/);
  });
});

describe('phone links', () => {
  it('dial the main number, then the extension after a pause (never the digits run together)', () => {
    expect(telHref('313-579-2100 ext. 4217')).toBe('tel:+13135792100,4217');
    expect(telHref('313-579-2100 x12')).toBe('tel:+13135792100,12');
    expect(telHref('(313) 579-2100 Extension 3')).toBe('tel:+13135792100,3');
  });
  it('plain, short and toll-free numbers', () => {
    expect(telHref('313-579-2100')).toBe('tel:+13135792100');
    expect(telHref('1-866-313-2520')).toBe('tel:+18663132520');
    expect(telHref('911')).toBe('tel:911');
    expect(telHref('988')).toBe('tel:988');
    expect(telHref('211')).toBe('tel:211');
  });
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
  it('the tab bar fits however many tabs are shown (Events hides itself when there are none)', () => {
    const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
    expect(css).toMatch(/\.tabs \{[^}]*grid-auto-flow:column; grid-auto-columns:1fr;/);
    expect(css).not.toMatch(/\.tabs \{[^}]*grid-template-columns:repeat\(\d/);   // a fixed count left an empty column
    expect(main).toContain("const shownTabs = () => TABS.filter((x) => x.id !== 'events' || upcoming(1).length > 0);");
  });
  it('the About paragraphs the screen asks for all exist, in both languages', () => {
    // They are built in a loop (about.p1, about.p2, …); a hole would print the key itself on the screen.
    const n = Number(/\[([\d, ]+)\]\.map\(\(n\) => `<p>\$\{T\('about\.p' \+ n\)\}<\/p>`\)/.exec(main)![1]!.split(',').pop()!.trim());
    const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;
    for (let i = 1; i <= n; i++) { expect(strings[`about.p${i}`], `en about.p${i}`).toBeTypeOf('string'); expect(es[`about.p${i}`], `es about.p${i}`).toBeTypeOf('string'); }
    expect(strings[`about.p${n + 1}`], 'a paragraph the screen never shows').toBeUndefined();
  });
  it('never writes to localStorage, sessionStorage, or cookies, and never sends anything', () => {
    for (const f of ['main.ts', 'data.ts', 'needs.ts', 'verify.ts', 'map.ts', 'hoods.ts', 'saved.ts', 'links.ts', 'outbox.ts', 'phone.ts', 'keys.ts']) {
      const src = readFileSync(join(__dirname, '../src', f), 'utf8');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest/);
      expect(src.match(/method:\s*'POST'/), f).toBeNull();
    }
  });
  it('need screens and search never put anything in the URL', () => {
    // Behavior: test/router.test.ts. Here: the no-trace rule is in the router, and main.ts never writes history itself.
    const router = readFileSync(join(__dirname, '../src/router.ts'), 'utf8');
    const hashFor = router.slice(router.indexOf('export function hashFor'), router.indexOf('export function fromHash'));
    expect(hashFor).toMatch(/return null; \/\/ the urgent sheet, search, saved places, and every "need" screen: no trace/);
    expect(hashFor).not.toMatch(/'search'|'need'|'urgent'|'saved'/);
    expect(main).not.toMatch(/history\.(pushState|replaceState)/);
  });
  it('what a person types (search text, ZIP) stays in a variable: never in storage, a request, or the URL', () => {
    // idbSet is the only way this app writes to the phone, and main.ts never calls it.
    expect(main).not.toMatch(/idbSet|indexedDB/);
    for (const name of ['searchText', 'hereZip']) {
      const lines = main.split('\n').filter((l) => l.includes(name));
      expect(lines.length, name).toBeGreaterThan(0);
      for (const l of lines) expect(l, name).not.toMatch(/fetch\(|pushState|location\.|href=/);
    }
    expect(main).toMatch(/if \(view\.v === 'tab'\) searchText = '';/);
    expect(main).toMatch(/<input id="q"[^>]*autocomplete="off"/);
    expect(main).toMatch(/<input name="zip"[^>]*autocomplete="off"/);
  });
  it('no third-party origins in the page shell', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).toMatch(/default-src 'self'/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
