import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEEDS, CATEGORIES, HARDCODED, MAP_GROUPS, PRIVATE_TOPS, TABS, isPrivate, isSensitive } from '../src/needs.js';
import { LISTING_KINDS, PLACE_KINDS } from '../src/report.js';
import { sha256Hex, signatureOk } from '../src/verify.js';
import { TRANSIT } from '../src/transit.js';
import { clip, decodeLine, inside, wx, wy } from '../src/map.js';
import { directionsHref, placeQuery, transitAppHref, transitAppQuery, transitHref } from '../src/directions.js';
import { LINKS } from '../src/links.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES, buildProposal } from '../src/propose.js';
import { canSave } from '../src/saved.js';
import { telHref } from '../src/phone.js';
import { releaseKeyProblems } from '../src/keys.js';
import { LANGS, dirFor, pickLang } from '../src/i18n.js';
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
  it('an emergency room and urgent care are their own kinds of help, the emergency room first and led by 911', () => {
    const doctor = NEEDS.find((n) => n.id === 'doctor')!;
    expect(doctor.refine!.map((r) => r.id)).toEqual(['er', 'urgent', 'doctor', 'dhd', 'dentist', 'eyes']);
    expect(doctor.refine![0]!.query).toEqual({ category: 'health.er' });
    expect(doctor.refine![1]!.query).toEqual({ category: 'health.urgent' });
    // 911 sits above the emergency-room list, and only there: the plain "a doctor or nurse" screen has no 911 row.
    expect(doctor.refine![0]!.first).toEqual(['emg_911']);
    expect(doctor.first).toBeUndefined();
    expect(doctor.refine!.filter((r) => r.first)).toHaveLength(1);
    expect(main).toContain("const first = ((chosen?.first ?? n.first) ?? []).map(callButton).join('');");
    for (const c of ['health.er', 'health.urgent']) {
      expect(strings[`refine.doctor.${c.split('.')[1]}`], c).toBeTypeOf('string');
      expect(isSensitive(c), c).toBe(false); expect(isPrivate(c), c).toBe(false);   // an address and a map dot: people have to get there
      expect(MAP_GROUPS.find((g) => g.tops.includes(c.split('.')[0]!))!.id, c).toBe('health');
    }
    // They are not free clinics; nothing in the app may call them that.
    expect(strings['refine.doctor.er']).not.toMatch(/free|low.cost/i);
    expect(strings['refine.doctor.urgent']).not.toMatch(/free|low.cost/i);
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
    expect(main).toContain('return { title: r.name, exit: priv, ownTitle: true, html:');
  });
});

describe('neighborhood pages (docs/13 honesty rules)', () => {
  const ui = { t: (k: string, p: Record<string, string | number> = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')), esc: (x: unknown) => String(x), own: (x: unknown) => '<span lang="en">' + String(x) + '</span>', date: (d: string) => d, link: (u: string, l: string) => '<a href="' + u + '">' + l + '</a>', go: (v: object) => "data-go='" + JSON.stringify(v) + "'", map: () => '<div class="mapbox"></div>' };
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
  it('"Safe streets": plain counts with their years, no rate, no rank, no fault, and the records named', () => {
    const safe: Indicators = { ...d, crash_years: [2020, 2024], city_crashes: { walk: 2024, bike: 664, severe: 630 },
      crash_records_from: 'Michigan State Police (CJIC) police-reported crashes, published by SEMCOG',
      sources: { ...d.sources, crashes: { ...src, name: 'SEMCOG — Crash Locations, 2015-2024' } },
      neighborhoods: [{ ...d.neighborhoods[0]!, crashes: { walk: 49, bike: 'lt5', severe: 22 } }] };
    const html = hoodPage(safe.neighborhoods[0]!, safe, ui);
    expect(html).not.toContain('MISSING:');
    expect(html).toContain('Safe streets');
    expect(html).toContain('2020 through 2024');
    expect(html).toContain('Crashes with someone walking');
    expect(html).toContain('49'); expect(html).toContain('fewer than 5'); expect(html).toContain('Whole city: 2,024');
    expect(html).toContain('These count crashes, not people');
    expect(html).toContain('we do not compare one neighborhood with another');
    expect(html).toContain('Michigan State Police');
    // The panel names counts and nothing else: no rate per anything, no score, no ranking word.
    const panel = html.slice(html.indexOf('Safe streets')); const safePanel = panel.slice(0, panel.indexOf('</div>'));
    expect(safePanel).not.toMatch(/for every 1,000|per 1,000|rank|safest|worst|best/i);
    expect(safePanel).not.toMatch(/blame|drunk|speeding|driver|caused by/i);
    // "Fault" appears once, and only to say we do not assign it.
    expect(safePanel.match(/fault/gi)).toHaveLength(1);
    expect(safePanel).toContain('We do not say who was at fault');
    // Its source is listed with the others, and a bundle without crash numbers simply has no panel.
    expect(html.slice(html.indexOf('Where these numbers come from'))).toContain('SEMCOG');
    expect(hoodPage(d.neighborhoods[0]!, d, ui)).not.toContain('Safe streets');
  });
  it('crashes are a neighborhood-page number only: never a map layer, never a dot per crash', () => {
    const hoodsSrc = readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8');
    const panelSrc = hoodsSrc.slice(hoodsSrc.indexOf('export function crashPanel'), hoodsSrc.indexOf('export function hoodPage'));
    expect(panelSrc).not.toMatch(/ui\.map\(/);
    expect(readFileSync(join(__dirname, '../src/layers.ts'), 'utf8')).not.toMatch(/crash/i);
  });
  it('neighborhood numbers are fetched only when asked for, and checked against the signed index', () => {
    const src2 = readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8');
    expect(src2).toContain('fetchVerified(index, FILE)'); expect(src2).not.toContain(' fetch(');
    expect(readFileSync(join(__dirname, '../src/data.ts'), 'utf8')).toContain("!name.startsWith('indicators/')");
  });
});

describe('the other languages', () => {
  // Spanish, Arabic (right to left) and Bengali. Every file carries exactly the English keys, the same
  // placeholders, and the same emergency numbers; nothing in any of them is a leftover English sentence.
  const OTHER = ['es', 'ar', 'bn'] as const;
  const table = (l: string) => JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
  const es = table('es');
  const holes = (v: string) => (v.match(/[{]\w+[}]/g) ?? []).sort().join(',');
  // Names, and values that are nothing but a placeholder, are the same in every language on purpose.
  // `miles` is "{miles} mi": Spanish writes the unit the same way.
  // `clock.am`/`clock.pm` and `list.sep` are a clock abbreviation and a comma: Spanish as written in the United
  // States uses the English ones, and Bengali writes the same comma. Arabic writes its own (ص, م, ،).
  const SAME_ON_PURPOSE = new Set(['app.name', 'detail.source_line', 'hood.kind.harm', 'miles', 'gw.title', 'layer.place.greenway',
    'layer.go.people_mover', 'link.food.wic.title', 'link.food.wic.label', 'link.food.double_up.title', 'link.benefits.ser.title',
    'clock.am', 'clock.pm', 'list.sep']);

  for (const l of OTHER) {
    const w = table(l);
    it(`${l} has every English key, and no extra ones`, () => expect(Object.keys(w)).toEqual(Object.keys(strings)));
    it(`${l} keeps every placeholder, so no number or date goes missing`, () => { for (const k of Object.keys(strings)) expect(holes(w[k]!), k).toBe(holes(strings[k]!)); });
    it(`${l} keeps 911, 988 and 211 where the English has them`, () => { for (const k of Object.keys(strings)) for (const n of ['911', '988', '211']) if (strings[k]!.includes(n)) expect(w[k], k).toContain(n); });
    it(`${l} is really translated: no value is still the English one`, () => {
      for (const k of Object.keys(strings)) if (!SAME_ON_PURPOSE.has(k)) expect(w[k], `${l} ${k} is still English`).not.toBe(strings[k]);
    });
  }
  // A phone number has to match the keypad and a time has to match the sign on the door, so every digit in every
  // language is a Western one (DECISIONS 2026-09-20). Arabic-Indic and Bengali digits are not allowed anywhere.
  it('Arabic and Bengali use Western digits, so a number can be dialled as it is read', () => {
    for (const l of ['ar', 'bn']) {
      const w = table(l);
      for (const [k, v] of Object.entries(w)) expect(v, `${l} ${k}`).not.toMatch(/[٠-٩۰-۹০-৯]/);
      for (const [k, v] of Object.entries(w)) for (const m of v.match(/[\d٠-٩০-৯][\d٠-٩০-৯‑-]{6,}/g) ?? []) expect(m, `${l} ${k}`).toMatch(/^[\d-]+$/);
    }
  });
  it('Arabic reads right to left, the other three read left to right', () => {
    expect(dirFor('ar')).toBe('rtl');
    for (const l of ['en', 'es', 'bn']) expect(dirFor(l), l).toBe('ltr');
    expect(LANGS.map((l) => l.code)).toEqual(['en', 'es', 'ar', 'bn']);
    // Each language names itself, and the switch marks each name with its own lang (WCAG 3.1.2).
    expect(LANGS.map((l) => l.name)).toEqual(['English', 'Español', 'العربية', 'বাংলা']);
    expect(main).toContain('<nav class="langrow" aria-label="${T(\'lang.switch\')}">');
    expect(main).toContain('lang="${l.code}"');
  });
  it('the first language is the phone\'s own, and the choice is remembered on the phone only', () => {
    expect(pickLang(undefined, ['ar-EG', 'en-US'])).toBe('ar');
    expect(pickLang(undefined, ['bn-BD'])).toBe('bn');
    expect(pickLang(undefined, ['es-MX', 'ar'])).toBe('es');       // the phone's order wins, not ours
    expect(pickLang(undefined, ['fr-FR'])).toBe('en');             // a language we have no words for
    expect(pickLang('ar', ['en-US'])).toBe('ar');                  // what the person picked beats the phone
    expect(pickLang('de', ['en-US'])).toBe('en');
  });
  it('the language choice stays on the phone, and a place\'s own words are never machine-translated', () => {
    const src = readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8');
    expect(src).not.toMatch(/fetch[(]|localStorage|cookie/); expect(src).toContain("idbSet('lang'");
    expect(main).toContain('<p lang="en">${esc(r.what)}</p>');
    // Each language is its own chunk: an English reader downloads none of them.
    for (const l of OTHER) expect(src).toContain(`import('../../../strings/${l}.json')`);
  });
  it('dates, times and numbers keep Western digits in Arabic and Bengali', () => {
    const src = readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8');
    expect(src).toContain("ar: 'ar-u-nu-latn'"); expect(src).toContain("bn: 'bn-u-nu-latn'");
    expect(new Intl.NumberFormat('ar-u-nu-latn').format(2026)).toBe('2,026');
  });

  // Everything below was found by walking every screen in Arabic and in Bengali on 2026-09-20.
  const cssBody = readFileSync(join(__dirname, '../src/style.css'), 'utf8').replace(/\/\*[^]*?\*\//g, '');
  const hoodsSrc = readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8');
  /** Every rule in the stylesheet, as { selector, body }. */
  const RULES = [...cssBody.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

  it('nothing is upper-cased or letter-spaced except in the two languages that were drawn for it', () => {
    // `text-transform:uppercase` says nothing in Arabic or Bengali, and letter-spacing breaks Arabic's joins and
    // pulls a Bengali conjunct off its vowel sign. Both are allowed only inside a `:lang(en)`/`:lang(es)` rule.
    const scoped = (sel: string) => /:lang\((?:en|es)\)/.test(sel);
    for (const r of RULES) {
      if (/text-transform\s*:\s*uppercase/.test(r.body)) expect(scoped(r.sel), `uppercase in "${r.sel}"`).toBe(true);
      const ls = /letter-spacing\s*:\s*([^;}]+)/.exec(r.body)?.[1]?.trim();
      // `normal`, `0`, and the two runs that are Latin in every language — the brand's "313 Help" and a phone
      // number — are the only unscoped tracking left.
      if (ls && !['normal', '0'].includes(ls) && !scoped(r.sel)) expect(['.brand', '.callrow strong'], `letter-spacing in "${r.sel}"`).toContain(r.sel);
    }
    expect(cssBody).toContain('h2:lang(en),h2:lang(es) { letter-spacing:.04em; text-transform:uppercase; }');
  });
  it('Bengali gets room for its vowel signs: every tight line-height opens up, and only for Bengali', () => {
    for (const sel of [':lang(bn) h1,:lang(bn) .brand', ':lang(bn) .when']) expect(cssBody).toContain(sel);
    expect(cssBody).toMatch(/:lang\(bn\)[^{]*\.tabs button[^{]*\{[^}]*line-height:1\.4/);
    // and nothing Bengali-only touches the phone layout English and Spanish already have
    for (const r of RULES) if (/:lang\(bn\)/.test(r.sel)) expect(r.body).toMatch(/^[^:]*line-height|font-family/);
  });
  it('"am" and "pm" are words we translate, not letters left in English', () => {
    expect(main).toContain("${t(h < 12 || h === 24 ? 'clock.am' : 'clock.pm')}");
    expect(main).not.toMatch(/'am' : 'pm'/);
    for (const l of ['en', 'es', 'ar', 'bn']) for (const k of ['clock.am', 'clock.pm', 'list.sep']) expect(table(l)[k], `${l} ${k}`).toBeTruthy();
    expect(table('ar')['clock.am']).toBe('ص');
    // and the day of the week comes from the same files, never from the browser's idea of a weekday
    for (const l of ['en', 'es', 'ar', 'bn']) for (const d of ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']) expect(table(l)['day.' + d], `${l} ${d}`).toBeTruthy();
    expect(main).toContain("t('day.' + m[2])");
    expect(main).toContain("days.join(t('list.sep'))");
  });
  it('a clock time reads left to right wherever it is printed, not only in the hours table', () => {
    expect(main).toContain("const clockHtml = (...parts: string[]) => `<bdi>${parts.map(esc).join(' – ')}</bdi>`;");
    // no bare "9 am – 1 pm" left anywhere: every pair of clock times goes through clockHtml
    expect(main).not.toMatch(/\$\{esc\(clock\([^)]*\)\)\} – /);
  });
  it('3.1.2: a name its owner wrote is marked English in the heading too, not only in the page', () => {
    expect(main).toContain('function topBar(title?: string, quickExit = false, ownTitle = false)');
    expect(main).toContain('${ownTitle ? owner(title) : esc(title)}');
    expect(main).toContain('head = topBar(title, exit, ownTitle)');
    // and the screens whose heading is a name say so
    for (const k of ['ownTitle: true, html:', 'ownTitle = hs.ownTitle', 'ownTitle = d.ownTitle', "ownTitle = !!s;"]) expect(main).toContain(k);
  });
  it('the map never mirrors, but the pad of arrows under it still moves to the other corner', () => {
    // `direction:ltr` on the pad kept the glyphs physical AND stopped `inset-inline-start` mirroring, so in Arabic
    // the arrows sat in the same corner as the zoom keys. `row-reverse` does the first without the second.
    expect(cssBody).toContain('[dir="rtl"] .mappan { flex-direction:row-reverse; }');
    expect(cssBody).toMatch(/\.mappan \{[^}]*inset-inline-start:\.5rem/);
    expect(cssBody).not.toMatch(/\.mappan \{[^}]*direction:ltr/);
    expect(cssBody).toMatch(/\.maptools \{[^}]*inset-inline-end:\.5rem/);
  });
  it('a run of English inside our sentence is marked, so Arabic keeps it in one piece', () => {
    for (const call of ['owner(e.label)', 'owner(s.cross_streets.join', 'owner(l.source.name)']) expect(main).toContain(call);
    expect(hoodsSrc).toContain('ui.own(n.name)');
    expect(hoodsSrc).toContain('export function slot(');
  });
  it('dollars are written the way the record writes them, in every language', () => {
    // Intl renders USD in Arabic as "85,000 US$" and cuts the Bengali compact word short ("85 হা$").
    expect(hoodsSrc).toContain("const MONEY_LOCALE = 'en-US';");
    expect(hoodsSrc).toContain("return mine.startsWith('$') ? mine : new Intl.NumberFormat(MONEY_LOCALE, opts).format(n);");
    const usd = (l: string, o: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(l, { style: 'currency', currency: 'USD', maximumFractionDigits: 0, ...o }).format(85000);
    // English and Spanish already lead with the sign, so nothing about them changes; Arabic and Bengali do not.
    for (const l of ['en-US', 'es-US']) expect(usd(l).startsWith('$'), l).toBe(true);
    for (const l of ['ar-u-nu-latn', 'bn-u-nu-latn']) expect(usd(l).startsWith('$'), l).toBe(false);
    expect(usd('en-US')).toBe('$85,000');
    // counts, which carry no unit, still follow the language
    expect(hoodsSrc).toContain('new Intl.NumberFormat(locale()).format(n)');
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
    expect(main).toContain('const sensitiveId = (id: string) => { const r = bundle?.rows.find((x) => x.id === id); return !!r && isPrivate(r.category); }');   // router.ts: no URL for these (private includes sensitive)
    expect(main).not.toMatch(/category [!=]== 'shelter.dv'|category [!=]== 'health.mental'/);
  });
  it('the full-screen map leaves the top bar (Urgent help, quick exit) in reach', () => expect(mapSrc).toContain("querySelector('header.top')"));
  it('a place with coordinates but no street address still gets directions, and its coordinate is never printed as an address', () => {
    const spot = { lat: 42.3314, lon: -83.0458 };                       // a naloxone station: no address, no phone
    const withAddress = { address: { line1: '1 Main St', city: 'Detroit', zip: '48226' }, lat: 42.33, lon: -83.05 };
    expect(placeQuery(spot)).toBe('42.3314,-83.0458');
    expect(placeQuery(withAddress)).toBe('1%20Main%20St%2C%20Detroit%2C%20MI%2048226');
    expect(placeQuery({})).toBeNull();                                   // no address, no coordinate: no button at all
    expect(directionsHref(spot, 'iPhone')).toBe('https://maps.apple.com/?daddr=42.3314,-83.0458');
    expect(directionsHref(spot, 'Android')).toBe('geo:42.3314,-83.0458?q=42.3314,-83.0458');
    expect(directionsHref(spot, 'Windows')).toBe('https://www.google.com/maps/dir/?api=1&destination=42.3314,-83.0458');
    expect(directionsHref({}, 'Android')).toBeNull();
    expect(transitHref(spot)).toBe('https://www.google.com/maps/dir/?api=1&destination=42.3314,-83.0458&travelmode=transit');
    // The screen: the buttons and the "Where" block no longer depend on there being an address, and where there is
    // none the page says so in words instead of turning the coordinate into one.
    expect(main).toContain('${goHere(r) ? `<div class="two">');
    expect(main).toContain("${r.address || (!sensitive && r.lat !== undefined) ? `<h2>${T('detail.where')}</h2>");
    expect(main).toContain("T('detail.where_no_address', { source: r.facts.source.name })");
    expect(main).not.toMatch(/r\.address!/);
    expect(strings['detail.where_no_address']).toContain('{source}');
  });
  it('the Transit app is an extra way to open the same trip: their documented scheme, the destination and nothing else', () => {
    const spot = { lat: 42.3314, lon: -83.0458 };                        // a naloxone station: a point, no address
    const withAddress = { address: { line1: '1 Main St', city: 'Detroit', zip: '48226' }, lat: 42.33, lon: -83.05 };
    const addressOnly = { address: { line1: '1 Main St', city: 'Detroit', zip: '48226' } };
    // transitapp.com/developers: `transit://directions` with from/to. We send only `to`, so Transit asks the
    // person for their own location itself. The coordinate wins when there is one (their address geocoding is
    // loose); it is passed through, never printed as an address.
    expect(transitAppQuery(spot)).toBe('42.3314,-83.0458');
    expect(transitAppQuery(withAddress)).toBe('42.33,-83.05');
    expect(transitAppQuery(addressOnly)).toBe('1%20Main%20St%2C%20Detroit%2C%20MI%2048226');
    expect(transitAppQuery({})).toBeNull();
    expect(transitAppHref(spot, 'iPhone')).toBe('transit://directions?to=42.3314,-83.0458');
    expect(transitAppHref(addressOnly, 'Android')).toBe('transit://directions?to=1%20Main%20St%2C%20Detroit%2C%20MI%2048226');
    for (const ua of ['iPhone', 'iPad', 'Android']) expect(transitAppHref(spot, ua), ua).not.toContain('from');
    // No app on a laptop, and Transit documents no web link, so no link there: "Bus directions" needs no app.
    for (const ua of ['Windows', 'Macintosh', 'X11; Linux x86_64']) expect(transitAppHref(spot, ua), ua).toBeNull();
    expect(transitAppHref({}, 'iPhone')).toBeNull();                     // nothing to point at, no link
    // The screen: inside the same gate as Directions and Bus directions, so a row whose directions are withheld
    // (DV and crisis rows carry neither an address nor a coordinate) never shows it. Bus directions stays first.
    expect(main).toContain("${goHere(r) ? `<div class=\"two\">");
    expect(main).toContain("${busApp(r) ? `<a class=\"btn ghost\" href=\"${esc(busApp(r)!)}\"");
    expect(main).toMatch(/transitHref\(r\)![\s\S]{0,200}busApp\(r\)/);
    expect(main).toContain("const busApp = (r: BundleRow) => transitAppHref(r, navigator.userAgent);");
    expect(strings['detail.bus_app_label']).toContain('{name}');
    // A plain link and nothing else: no SDK, no script, no image or font from their servers, no preconnect.
    const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
    const web = ['src/directions.ts', 'src/links.ts', 'src/transit.ts'].map(src).concat(main).join('\n');
    expect(web).not.toMatch(/preconnect|dns-prefetch|<script|transitapp\.com\/[^'"\s)]*\.(js|css|png|svg|woff2?)/);
    // Nothing from transitapp.com is fetched, cached, or allowed by the CSP: the page still says default-src 'self'.
    for (const p of ['index.html', 'public/sw.js']) expect(src(p), p).not.toContain('transitapp.com');
    expect(src('index.html')).toContain("default-src 'self'");
    expect(src('public/sw.js')).toContain("url.origin !== location.origin");
  });
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

describe('the Map tab (one tab in place of Recreation and Transit, Kyle 2026-09-20)', () => {
  const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;
  const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
  const layersSrc = readFileSync(join(__dirname, '../src/layers.ts'), 'utf8');

  it('four tabs: Home, Help, Map, Events', () => {
    expect(TABS.map((t) => t.id)).toEqual(['home', 'help', 'map', 'events']);
    for (const tab of TABS) { expect(strings[`tab.${tab.id}`], tab.id).toBeTypeOf('string'); expect(es[`tab.${tab.id}`], tab.id).toBeTypeOf('string'); }
    expect(main).toContain("tab === 'map' ? mapTab()");
    // The greenway, parks and segment screens now sit under Map, so the tab bar highlights Map on them.
    expect(main).toContain("greenway: 'map', segment: 'map', parks: 'map' };");
  });
  it('everything the Recreation and Transit tabs offered is still on it', () => {
    for (const k of ['gw.title', 'rec.parks', 'rec.all_parks', 'rec.centers', 'rec.bike', 'transit.tip', 'transit.checked']) expect(main, k).toContain(`T('${k}'`);
    expect(main).toContain('${transitPanels()}');                       // trip planners, fares, free rides, phone numbers
    expect(main).toContain("TRANSIT.sections.map");
    expect(main).toContain("${T('detail.bus')}");                        // bus directions still on every listing
  });
  it('one layer per group of our own listings, and every top-level kind of help belongs to exactly one group', () => {
    const tops = MAP_GROUPS.flatMap((g) => g.tops);
    expect(new Set(tops).size, 'a category in two groups').toBe(tops.length);
    // Every category a person can browse is either in a group or is one of the private kinds we never draw.
    for (const c of CATEGORIES) {
      const top = c.query.category!.split('.')[0]!;
      expect(tops.includes(top) || PRIVATE_TOPS.includes(top), c.id).toBe(true);
    }
    for (const t of PRIVATE_TOPS) expect(tops, t).not.toContain(t);
    expect(PRIVATE_TOPS.sort()).toEqual(['assault', 'treatment']);
  });
  it('treatment, sexual assault, DV and crisis listings are never drawn on it', () => {
    // The layer rows drop the private kinds outright and the sensitive ones row by row.
    expect(main).toContain("!isSensitive(r.category)\n    && !PRIVATE_TOPS.includes(r.category.split('.')[0]!) && tops.includes(r.category.split('.')[0]!)");
    for (const c of ['treatment.detox', 'assault', 'shelter.dv', 'health.mental']) {
      const top = c.split('.')[0]!;
      expect(MAP_GROUPS.some((g) => g.tops.includes(top)) && !isSensitive(c) && !isPrivate(c), c).toBe(false);
    }
  });
  it('every layer has plain words in both languages', () => {
    const ids = [...MAP_GROUPS.map((g) => 'layer.help.' + g.id), 'layer.place.greenway', 'layer.place.parks',
      ...[...main.matchAll(/'go:(\w+)':/g)].map((m) => 'layer.go.' + m[1])];
    expect(ids.length).toBeGreaterThan(15);
    for (const k of ids) { expect(strings[k], k).toBeTypeOf('string'); expect(es[k], `es ${k}`).toBeTypeOf('string'); }
    for (const k of ['map.lede', 'map.layers', 'map.layers_note', 'map.group_help', 'map.group_places', 'map.group_go',
      'map.list_title', 'map.list_none', 'map.list_help', 'map.list_more', 'map.list_unnamed', 'map.sources', 'map.label_tab', 'map.layer_zoom']) {
      expect(strings[k], k).toBeTypeOf('string'); expect(es[k], `es ${k}`).toBeTypeOf('string');
    }
  });
  it('layer switches are real labelled checkboxes, so the keyboard and a screen reader already work', () => {
    expect(main).toContain('<label class="pick"><input type="checkbox" data-layer=');
    expect(main).toContain('<fieldset><legend>${T(s.group)}</legend>');
    // The cursor goes back to the switch that was just used, instead of to the top of the page.
    expect(main).toContain('refocus = el.dataset.layer;');
    expect(main).toContain('app.querySelector<HTMLElement>(`[data-layer="${refocus}"]`)?.focus');
  });
  it('whatever is on the map is also a list, in words', () => {
    expect(main).toContain('function layerList(');
    expect(main).toContain("${layerSwitcher()}${layerList(rows, over)}");
    expect(main).toContain("T('map.list_title')");
  });
  it('the layer choice is kept on this phone and never sent', () => {
    expect(layersSrc).toContain("idbSet('layers'");
    expect(layersSrc).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|method:\s*'POST'/);
    expect(main).not.toMatch(/idbSet|indexedDB/);                       // main.ts still never writes to the phone itself
  });
  it('a transport layer is downloaded only when it is switched on, and checked against the signed index', () => {
    expect(mapSrc).toContain('export function loadLayer(');
    expect(mapSrc).toContain("fetchVerified(index, file)");
    expect(mapSrc).not.toContain(' fetch(');
    expect(mapSrc).not.toContain('http');                                // still no tile server, no third party
    // refresh() leaves every map/ file alone, so a first visit downloads none of them.
    expect(readFileSync(join(__dirname, '../src/data.ts'), 'utf8')).toContain("!name.startsWith('map/')");
    expect(main).toContain('void loadLayer(bundle!.index, l.file)');
  });
  it('colour never carries the meaning alone: each layer is named in the switcher and again when tapped', () => {
    expect(mapSrc).toContain('stop.name || stop.label');
    expect(mapSrc).toContain('route.name || route.label');
    const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
    for (const v of ['--lyr-bus', '--lyr-smart', '--lyr-rail', '--lyr-bike', ...MAP_GROUPS.map((g) => '--grp-' + g.id)]) {
      expect(css, v).toContain(`${v}:`);
      expect(css.slice(css.indexOf('prefers-color-scheme: dark')), `${v} in dark`).toContain(`${v}:`);
    }
  });
});

describe('wider screens: laptops and desktops (Kyle, 2026-09-20)', () => {
  const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;
  const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
  const wideBlock = css.slice(css.indexOf('@media (min-width:64rem)'));

  it('the phone layout is untouched: the bottom tab bar and the page width are still what they were', () => {
    // Everything for a big screen is inside a min-width query, so a phone — and a laptop at 400% zoom, which
    // reports a narrow screen — never sees any of it.
    expect(css).toMatch(/\.tabs \{ position:fixed; inset:auto 0 0 0;/);
    expect(css).toMatch(/main \{ max-width:42rem;/);
    expect(css).toContain('@media (min-width:64rem)');
    for (const rule of ['#app { padding-inline-start:15.5rem', '.tabs { inset-block:0; inset-inline:0 auto', 'main.wide { max-width:74rem', '.maptop { display:grid']) {
      expect(wideBlock, rule).toContain(rule);
    }
    // Nothing added for a big screen uses a physical side: Arabic is next (docs/05).
    expect(wideBlock).not.toMatch(/[;{ ](margin|padding|border|inset)-(left|right):/);
    expect(wideBlock).not.toMatch(/[;{ ](left|right):/);
  });
  it('the tab bar becomes a rail with Urgent help first, and the top bar drops its copy', () => {
    expect(main).toContain('const wide = matchMedia(\'(min-width: 64rem)\');');
    expect(main).toMatch(/const urgentFirst = wide\.matches \? `<button class="urgent" \$\{go\(\{ v: 'urgent' \}\)\}/);
    expect(wideBlock).toContain('header.top > .urgent { display:none; }');
    expect(main).toContain("wide.addEventListener('change', () => render(false));");   // and it re-draws when the window crosses the line
  });
  it('what the keyboard walks is what the eye reads, at either width, and a skip link comes first', () => {
    expect(main).toContain('app.innerHTML = skip + (wide.matches ? nav + head + body : head + body + nav);');
    expect(main).toContain('<button class="skip" data-skip>${T(\'skip.main\')}</button>');
    expect(main).toContain("if ('skip' in el.dataset) { app.querySelector<HTMLElement>('main')?.focus(); }");
    expect(main).toContain(`body.replace(/^<main/, '<main tabindex="-1"')`);
    expect(strings['skip.main']).toBeTypeOf('string'); expect(es['skip.main']).toBeTypeOf('string');
  });
  it('the Map tab is one column on a phone and map-beside-list on a laptop', () => {
    expect(css).toContain('.maptop,.mapside { display:contents; }');            // the phone: the wrappers are not boxes
    expect(main).toContain('<div class="maptop">');
    expect(main).toContain('<div class="mapside">${locChip()}${layerSwitcher()}${layerList(rows, over)}</div></div>');
    expect(wideBlock).toContain('.maptop > .mapbox { position:sticky;');
  });
  it('the map is drawn again when the pixel ratio or the window changes, and Escape leaves the full-screen map', () => {
    const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
    expect(mapSrc).toContain("window.addEventListener('resize', this.onWindow);");
    expect(mapSrc).toContain('if (Math.min(window.devicePixelRatio || 1, 2) !== this.dpr) this.resize();');
    expect(mapSrc).toMatch(/e\.key === 'Escape' && this\.el\.classList\.contains\('big'\)/);
    expect(mapSrc).toContain("window.removeEventListener('resize', this.onWindow); document.removeEventListener('keydown', this.onKey);");
  });
  it('a listing prints (people print at a library): no app furniture, ink on white, link addresses spelled out', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toContain('.tabs,.skip,.maptools,.mappan,.report,.searchbtn,.langrow');
    expect(print).toContain('a[href^="http"]::after');
    expect(print).toContain('--ink:#000;');
    expect(print).not.toMatch(/\.top \{[^}]*display:none/);                     // the listing's name lives in the top bar
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
    // The ZIP field names its purpose so a browser can fill it in (WCAG 1.3.5); we still never store or send it.
    expect(main).toMatch(/<input name="zip"[^>]*autocomplete="postal-code"/);
    expect(main).not.toMatch(/localStorage|sessionStorage/);
  });
  it('no third-party origins in the page shell', () => {
    const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
    expect(html).toMatch(/default-src 'self'/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});

// ---------------------------------------------------------------------------------------------------
// Accessibility (docs/ACCESSIBILITY-AUDIT-2026-09-20.md). These are the parts of WCAG 2.2 AA that a test
// can hold still: contrast computed from the tokens themselves, a name on every control, a string for
// every key the code asks for, and the structural fixes the audit made.
// ---------------------------------------------------------------------------------------------------
describe('accessibility: WCAG 2.2 AA, the parts a test can hold', () => {
  const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
  const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
  const es = JSON.parse(readFileSync(join(root, 'strings/es.json'), 'utf8')) as Record<string, string>;

  /** The custom properties of one theme, read out of style.css exactly as the browser would see them. */
  function tokens(theme: 'light' | 'dark'): Record<string, string> {
    const block = theme === 'light'
      ? css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'))
      : css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('* { box-sizing'));
    const out: Record<string, string> = {};
    for (const [, k, v] of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) out[k!] = v!.toLowerCase();
    return out;
  }
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // WCAG 1.4.3 (text) and 1.4.11 (everything else). Both themes, every pair a screen actually puts together.
  const TEXT: [string, string, string][] = [
    ['body text on the page', '--ink', '--bg'], ['body text on a card', '--ink', '--surface'], ['a pill', '--ink', '--sunken'],
    ['secondary text on the page', '--muted', '--bg'], ['secondary text on a card', '--muted', '--surface'], ['secondary text in a pill', '--muted', '--sunken'],
    ['a link on the page', '--brand', '--bg'], ['a link on a card', '--brand', '--surface'],
    ['a green button', '--brand-ink', '--brand'], ['a green button, hovered', '--brand-ink', '--brand-strong'],
    ['an "open" pill', '--brand-soft-ink', '--brand-soft'], ['an outline button', '--brand-soft-ink', '--surface'],
    ['a freshness warning', '--warn-ink', '--warn-bg'], ['the 911 row and quick exit', '--danger-ink', '--danger'],
    ['a street name on the map', '--map-ink', '--map-land'], ['a park name on the map', '--map-park-ink', '--map-park'],
  ];
  const NON_TEXT: [string, string, string][] = [
    ['the focus ring on the page', '--focus', '--bg'], ['the focus ring on a card', '--focus', '--surface'],
    ['the outline of a control on a card', '--edge', '--surface'], ['the outline of a control on the page', '--edge', '--bg'],
    ['a main road', '--map-main', '--map-land'], ['a freeway', '--map-fwy', '--map-land'],
    ['the greenway, open', '--gw-open', '--map-land'], ['the greenway, being built', '--gw-build', '--map-land'],
    ['the greenway, funded', '--gw-fund', '--map-land'], ['the greenway, planned', '--gw-plan', '--map-land'],
    ...['bus', 'smart', 'rail', 'bike'].flatMap((l): [string, string, string][] =>
      [[`the ${l} layer on land`, `--lyr-${l}`, '--map-land'], [`the ${l} layer over a park`, `--lyr-${l}`, '--map-park']]),
    ...['food', 'shelter', 'health', 'rec', 'work', 'things', 'paperwork'].flatMap((g): [string, string, string][] =>
      [[`${g} dots on land`, `--grp-${g}`, '--map-land'], [`${g} dots over a park`, `--grp-${g}`, '--map-park']]),
  ];
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme} theme: every text pair reaches 4.5:1`, () => {
      const v = tokens(theme);
      for (const [what, fg, bg] of TEXT) {
        expect(v[fg], `${fg} is missing in the ${theme} theme`).toBeTypeOf('string');
        expect(`${what}: ${ratio(v[fg]!, v[bg]!).toFixed(2)}:1`).toBe(`${what}: ${Math.max(4.5, ratio(v[fg]!, v[bg]!)).toFixed(2)}:1`);
      }
    });
    it(`${theme} theme: every outline, ring and map line reaches 3:1`, () => {
      const v = tokens(theme);
      for (const [what, fg, bg] of NON_TEXT) {
        expect(v[fg], `${fg} is missing in the ${theme} theme`).toBeTypeOf('string');
        expect(`${what}: ${ratio(v[fg]!, v[bg]!).toFixed(2)}:1`).toBe(`${what}: ${Math.max(3, ratio(v[fg]!, v[bg]!)).toFixed(2)}:1`);
      }
    });
  }
  it('white on the lightest part of the hero reaches 4.5:1 (the words there are normal size)', () => {
    const stop = /radial-gradient\([^)]*?(#[0-9a-f]{6}) 0%/i.exec(css)![1]!;
    expect(ratio('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
  });

  it('every string key the app asks for exists in both languages (4.1.2: no control named "cat.x")', () => {
    const src = [main, mapSrc, readFileSync(join(__dirname, '../src/hoods.ts'), 'utf8')].join('\n');
    const dynamic = /^(cat|need|tile|quick|refine|link|add|report|gw|day|open|badge|layer|bundle|hood)\./;
    // Only whole keys: `t('od.s' + i)` is built from a list and is checked by the loops below.
    const keys = new Set([...src.matchAll(/(?<![\w.])[tT]\('((?:[a-z0-9_]+\.)+[a-z0-9_]+)'\s*[,)]/g)].map((m) => m[1]!));
    for (const k of keys) {
      if (dynamic.test(k) && !(k in strings)) continue;        // built from a list; the loops below cover those
      expect(strings[k], `strings/en.json has no ${k}`).toBeTypeOf('string');
    }
    for (const k of Object.keys(strings)) expect(es[k], `strings/es.json has no ${k}`).toBeTypeOf('string');
    // Same placeholders in both languages, or a screen says "{count} places" out loud.
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');
    for (const k of Object.keys(strings)) expect(`${k}: ${holes(es[k]!)}`).toBe(`${k}: ${holes(strings[k]!)}`);
  });
  it('every need, choice, category and map layer has words (no key is ever shown raw)', () => {
    for (const n of NEEDS) {
      expect(strings['need.' + n.id], n.id).toBeTypeOf('string');
      for (const r of n.refine ?? []) expect(strings[`refine.${n.id}.${r.id}`], `refine.${n.id}.${r.id}`).toBeTypeOf('string');
    }
    for (const c of CATEGORIES) expect(strings['cat.' + c.id], c.id).toBeTypeOf('string');
    for (const g of MAP_GROUPS) expect(strings['layer.help.' + g.id], g.id).toBeTypeOf('string');
    for (const t of TABS) expect(strings['tab.' + t.id], t.id).toBeTypeOf('string');
  });

  it('2.4.2: a screen that may be named in the browser has a title; one that must leave no trace does not', () => {
    expect(main).toContain("document.title = docTitle && traceable(v) ? `${docTitle} · ${t('app.name')}` : t('app.name');");
    expect(main).toContain('const traceable = (v: View) => hashFor(v, sensitiveId, location.pathname) !== null;');
  });
  it('2.4.3 and 4.1.3: a redraw that is not a new screen puts the cursor back and says what happened', () => {
    expect(main).toContain('refocusSel = `[data-save="${id}"]`;');
    for (const hook of ['data-listmap]', 'data-loc="on"]', 'data-loc="off"]', 'data-lang]']) expect(main).toContain(`refocusSel = '[${hook}'`);
    expect(main).toContain("if (refocusSel) { app.querySelector<HTMLElement>(refocusSel)?.focus({ preventScroll: true }); refocusSel = ''; }");
    // One live region, made once, outside the part of the page a redraw replaces.
    expect(main).toContain("sayEl.setAttribute('aria-live', 'polite'); document.body.append(sayEl);");
    // Exactly one: the search count, which is the same element on every keystroke. Everything else goes through
    // announce(), because a live region a redraw has just built is never read out.
    expect(main.match(/role="status"/g) ?? []).toHaveLength(1);
    expect(main).toContain('<p class="vh" id="searchsay" role="status" aria-live="polite">');
  });
  it('4.1.2: only one "Urgent help" button exists at a time, never one hidden behind the other', () => {
    expect(main).toContain("const urgentBtn = wide.matches ? '' : `<button class=\"urgent\"");
  });
  it('2.5.7 and 2.1.1: the map moves without dragging, and says so to the keyboard', () => {
    for (const act of ['left', 'right', 'up', 'down']) expect(mapSrc).toContain(`act === '${act}'`);
    expect(mapSrc).toContain("pad.className = 'mappan'");
    expect(mapSrc).toContain("this.canvas.setAttribute('aria-describedby', help.id)");
    expect(strings['map.keys']).toMatch(/arrow/i);
  });
  it('2.4.11 and 2.1.2: the full-screen map is a real overlay — nothing behind it is reachable', () => {
    expect(mapSrc).toContain("this.el.setAttribute('aria-modal', 'true')");
    expect(mapSrc).toContain('(n as HTMLElement).inert = true');
    expect(mapSrc).toContain('private release(): void');
    expect(mapSrc).toContain('(this.opener ?? b).focus();');
    expect(mapSrc).toContain('destroy(): void { this.release();');
  });
  it('3.3.1 and 3.3.3: "Add a place" names the field that is empty and puts the cursor on it', () => {
    expect(main).toContain("missing = ['name', 'category', 'what', 'how_known'].filter");
    expect(main).toContain('refocusSel = `.addform [name="${missing[0] ?? \'name\'}"]`;');
    for (const f of ['name', 'category', 'what', 'how_known']) expect(strings['add.e.' + f], f).toBeTypeOf('string');
    expect(css).toContain('.addform [aria-invalid="true"] { border-color:var(--danger); border-width:2px; }');
  });
  it('3.3.7: "Add a place" gives back everything already typed instead of asking for it again', () => {
    expect(main).toContain('addValues = values;');
    expect(main).toContain('const had = (name: string) => addValues[name] ?? \'\';');
    expect(main).toContain('value="${esc(had(name))}"');
    expect(main).toContain("${had(name) === id ? ' checked' : ''}");
    // and it is memory only, cleared the moment the screen is left or the form goes
    for (const clear of ["missing = []; addValues = {};", "missing = []; addValues = {}; }"]) expect(main).toContain(clear);
  });
  it('3.1.2: what a place wrote about itself is marked as English on a screen that is not English', () => {
    expect(main).toContain("const owner = (s: unknown) => (currentLang() === 'en' ? esc(s) : `<span lang=\"en\">${esc(s)}</span>`);");
    for (const field of ['r.row.name', 'r.row.what', 'r.org', 'r.eligibility', 'a.title', 'p.name']) expect(main).toContain(`owner(${field})`);
    expect(main).toContain('<address lang="en">');
  });
  it('a phone number stays left to right and never breaks in the middle (CLAUDE.md, and Arabic is next)', () => {
    expect(main).toContain('const phoneHtml = (n: string) => `<bdi class="tel">${phoneParts(n).map((p) => `<bdi>${esc(p)}</bdi>`).join(\' \')}</bdi>`;');
    expect(main).not.toMatch(/<strong>\$\{esc\((?:e|ph|p)\.number\)\}<\/strong>/);
    expect(css).toContain('.callrow strong .tel > bdi,.btn strong .tel > bdi { white-space:nowrap; }');
    // and the number and its extension stay in that order in Arabic: one left-to-right run around the two pieces
    expect(css).toContain('.tel { direction:ltr; unicode-bidi:isolate; }');
  });
  it('right-to-left is ready: no physical left/right in the stylesheet, and the arrows can turn round', () => {
    const body = css.replace(/\/\*[^]*?\*\//g, '');
    expect(body).not.toMatch(/(?:^|[;{\s])(?:margin|padding|border)-(?:left|right)\s*:/);
    expect(body).not.toMatch(/text-align\s*:\s*(?:left|right)/);
    expect(body).toContain('[dir="rtl"] .ic.turn { transform:scaleX(-1); }');
    expect(body).toContain(':lang(ar)'); expect(body).toContain(':lang(bn)');
    expect(readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8')).toContain("document.documentElement.dir = dirFor(l);");
  });
  it('1.4.12: nothing that holds words is a fixed height', () => {
    expect(css).not.toMatch(/\.when \{[^}]*[^-]height:3\.5rem/);
    expect(css).toContain('width:3.25rem; min-height:3.5rem;');
  });
  it('2.4.11: the skip link steps aside for the rail instead of covering its first button', () => {
    const wideBlock = css.slice(css.indexOf('@media (min-width:64rem)'));
    expect(wideBlock).toContain('.skip:focus-visible { inset-inline-start:calc(15.5rem + .75rem); }');
  });
  it('1.4.1: every state that has a colour also has words', () => {
    for (const k of ['open.open', 'open.closed_no_next', 'open.unknown', 'open.call_first', 'gw.open', 'gw.under_construction', 'gw.funded', 'gw.planned']) {
      expect(strings[k], k).toBeTypeOf('string');
      expect(strings[k]!.length).toBeGreaterThan(2);
    }
    expect(main).toContain('<ul class="gwkey">');                              // the map key, in words as well as dashes
  });
});
