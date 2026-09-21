// The two map styles (docs/MAP-STYLE.md). `standard` is the default and must draw exactly what it drew before
// there was a second style; `subway` is an option. Everything here is held to behaviour: plain functions with
// plain values, the HTML a person is shown, and the calls that really reach a (recording) canvas — drawn through
// the real MapView from the real network files the pipeline wrote (data/ingested/transit).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYER_STYLE } from '../src/layerstyle.js';
import { mapStyle } from '../src/layers.js';
import { decodeLayer, esc, wx, wy, type MapSpec, type Overlay } from '../src/map.js';
import { mapListHtml } from '../src/maplist.js';
import { styleSwitchHtml, subwayKeyHtml } from '../src/stylepanel.js';
import { plannerFor, TRANSIT } from '../src/transit.js';
import * as S from '../src/subway.js';
import { baseSpec, framesOf, overlaysFor, serveBasemap } from './mapfixture.js';
import { fakeContext, themeTokens } from './fakes.js';

const root = join(__dirname, '../../..');
const file = (name: string) => JSON.parse(readFileSync(join(root, 'data/ingested/transit', name), 'utf8'));
const table = (l: string) => JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
const en = table('en');
const t = (k: string, p: Record<string, string | number> = {}) => (en[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? ''));
const golden = readFileSync(join(__dirname, 'golden/standard-draw.txt'), 'utf8');
const STD = ['ddot_routes', 'smart_routes', 'ddot_stops', 'qline', 'intercity_bus', 'bike_lanes'];

// ---- the real networks, decoded once ---------------------------------------------------------------------------------
const NETS = Object.fromEntries(['ddot_routes', 'smart_routes', 'qline', 'people_mover'].map((id) => [id, S.decodeNet(file(id + '.net.json'))!]));
const realOverlays = (ids: string[]): Overlay[] => ids.map((id) => ({ ...decodeLayer(file(id + '.json')), id: 'go:' + id, label: id, ...(LAYER_STYLE['go:' + id] ?? { css: '--lyr-bus' }) }));
const HUBS = file('source.json').hubs as S.Hub[];
function subwayData(on: string[], more: Partial<S.SubwayData> = {}): S.SubwayData {
  const stops: S.SubwayData['stops'] = {};
  for (const id of ['ddot_stops', 'smart_stops']) stops[id] = { points: decodeLayer(file(id + '.json')).points, serves: S.decodeServes(file(id + '.net.json'))! };
  return { nets: Object.fromEntries(Object.entries(NETS).filter(([id]) => on.includes(id))), stops, hubs: HUBS, on, t, label: (l) => l, planner: (sys, agency) => `<a href="${plannerFor(sys) ?? ''}">${t('map.route_plan', { agency })}</a>`, want: () => {}, ...more };
}
const subwaySpec = (on: string[], more: Partial<S.SubwayData> = {}): MapSpec['subway'] => ({ Painter: S.SubwayPainter, order: S.featureOrder, more: (n) => `and ${n} more`, data: subwayData(on, more) });
const DOWNTOWN = [{ lat: 42.326, lon: -83.058 }, { lat: 42.342, lon: -83.038 }];
const index = () => serveBasemap();

describe('the map style is a choice, and the choice defaults to what people already had', () => {
  it('anything but the exact word "subway" reads as standard', () => {
    for (const v of [undefined, null, '', 'Subway', 'SUBWAY', 'metro', 1, {}, ['subway'], 'standard']) expect(mapStyle(v)).toBe('standard');
    expect(mapStyle('subway')).toBe('subway');
  });
  it('two real radio buttons in a fieldset with a legend, each with a line of its own, the chosen one checked', () => {
    const T = (k: string) => t(k);
    const html = styleSwitchHtml({ offered: true, style: 'standard', T });
    expect(html).toMatch(/^<fieldset class="mapstyle"><legend>Map style<\/legend>/);
    const radios = [...html.matchAll(/<label class="pick"><input type="radio" name="mapstyle" value="(\w+)" data-mapstyle="\1"( checked)?><span>([^<]+) <small>([^<]+)<\/small><\/span><\/label>/g)];
    expect(radios.map((m) => [m[1], !!m[2], m[3], m[4]])).toEqual([['standard', true, 'Standard', 'Each kind of transport in one color'], ['subway', false, 'Subway lines', 'Bus and rail drawn like a subway map']]);
    expect([...styleSwitchHtml({ offered: true, style: 'subway', T }).matchAll(/value="(\w+)"[^>]* checked/g)].map((m) => m[1])).toEqual(['subway']);
  });
  it('a bundle with no subway data offers nothing to choose', () => expect(styleSwitchHtml({ offered: false, style: 'subway', T: t })).toBe(''));
  it('a failed subway file says so inside the same group, where the choice was made', () => {
    expect(styleSwitchHtml({ offered: true, style: 'subway', T: t, problems: '<p class="banner warn">x</p>' })).toMatch(/<\/div><p class="banner warn">x<\/p><\/fieldset>$/);
  });
  it('the key says each line in words, only for what is on, and says the QLINE is drawn between its stations while the data marks it so', () => {
    const key = (on: string[], derived?: boolean) => subwayKeyHtml({ on: (l) => on.includes(l), derived, t });
    expect(key(['mogo', 'bike_lanes'])).toBe('');
    const bus = key(['ddot_routes']);
    for (const k of ['map.key_frequent', 'map.key_local', 'map.key_trunk', 'map.key_station', 'map.key_change', 'map.key_end']) expect(bus).toContain(en[k]);
    for (const k of ['map.key_smart', 'map.key_qline', 'map.key_dpm', 'map.key_bike']) expect(bus).not.toContain(en[k]!.slice(0, 20));
    expect(key(['qline'], true)).toContain('Drawn through its stations, not along the exact track');
    expect(key(['qline'])).toContain('Drawn through its stations');                        // not known yet: say it
    expect(key(['qline'], false)).not.toContain('Drawn through its stations');
    expect(key(['qline'], false)).toContain('Dark line with light ties: the QLINE');
    expect(NETS.qline!.routes[0]!.derived, 'the file the pipeline wrote marks the QLINE line as derived').toBe(true);
    expect((key(['smart_routes', 'people_mover', 'bike_lanes']).match(/<li><i class="\w+"><\/i>/g) ?? []).length).toBe(10 - 1);   // everything but the QLINE
  });
  it('every word the option, the key and the cards ask for exists in all four languages, with the same blanks', () => {
    const keys = ['map.style', 'map.style_standard', 'map.style_standard_note', 'map.style_subway', 'map.style_subway_note', 'map.style_say', 'map.key', 'map.key_frequent', 'map.key_local', 'map.key_smart', 'map.key_trunk', 'map.key_station', 'map.key_change', 'map.key_end', 'map.key_qline', 'map.key_dpm', 'map.key_bike', 'map.route_card', 'map.route_every', 'map.route_frequent', 'map.route_stops', 'map.route_plan', 'map.stop_lines', 'map.change_here', 'map.hub_walk', 'map.many_routes'];
    expect(keys.length).toBe(26);
    const holes = (s: string) => [...s.matchAll(/[{]\w+[}]/g)].map((m) => m[0]).sort().join();
    for (const l of ['en', 'es', 'ar', 'bn']) for (const k of [...keys, ...S.SUBWAY_KEYS]) { expect(table(l)[k], `${l} ${k}`).toBeTypeOf('string'); expect(holes(table(l)[k]!), `${l} ${k}`).toBe(holes(en[k]!)); }
    // The three sentences a card trims its list from must end in ": {list}" in every language, or the trim leaves a stray brace.
    for (const l of ['en', 'es', 'ar', 'bn']) for (const k of ['map.stop_lines', 'map.change_here', 'map.many_routes']) expect(table(l)[k], `${l} ${k}`).toMatch(/[:：] [{]list[}]$/);
  });
  it('the route card links to the trip planner the Map tab already carries, one for each system in the data', () => {
    const links = TRANSIT.sections.flatMap((s) => s.links ?? []);
    for (const net of Object.values(NETS)) { expect(plannerFor(net!.system), net!.system).toBeTypeOf('string'); expect(links.map((l) => l.url)).toContain(plannerFor(net!.system)); }
    expect(plannerFor('nobody')).toBeUndefined();
  });
});

describe('`standard` draws exactly what it drew before there was a second style', () => {
  const lines = (f: { far: string[]; near: string[] }) => ['# far', ...f.far, '# near', ...f.near].join('\n') + '\n';
  it('the canvas calls of two whole frames match the recording made before the subway style was written', async () => {
    expect(lines(await framesOf(baseSpec('g1', overlaysFor(STD)), index()))).toBe(golden);
    expect(lines(await framesOf(baseSpec('g2', overlaysFor(STD), { style: 'standard' }), index()))).toBe(golden);
  });
  it('the standard path never reads a field of a .net.json file, the hubs, or anything else of the subway style', async () => {
    const touched: string[] = [];
    const trap = <T extends object>(name: string): T => new Proxy({}, { get: (_, k) => { touched.push(`${name}.${String(k)}`); throw new Error(`standard read ${name}.${String(k)}`); }, has: (_, k) => { touched.push(`${name} has ${String(k)}`); return false; }, ownKeys: () => { touched.push(name + ' keys'); return []; } }) as T;
    const spec = baseSpec('g3', overlaysFor(STD), { style: 'standard', subway: trap<NonNullable<MapSpec['subway']>>('subway') });
    expect(lines(await framesOf(spec, index()))).toBe(golden);
    expect(touched).toEqual([]);
  });
  it('the subway style with nothing to draw from yet (code or files still coming) is still the standard picture', async () => {
    expect(lines(await framesOf(baseSpec('g4', overlaysFor(STD), { style: 'subway' }), index()))).toBe(golden);
  });
  it('LAYER_STYLE is the table in section 2 of the spec, to the digit', () => {
    expect(LAYER_STYLE).toEqual({
      'go:ddot_routes': { css: '--lyr-bus', width: 3.2 }, 'go:ddot_stops': { css: '--lyr-bus', dense: true },
      'go:smart_routes': { css: '--lyr-smart', width: 2.8, dash: [3, 2] }, 'go:smart_stops': { css: '--lyr-smart', dense: true },
      'go:qline': { css: '--lyr-rail', width: 4, ring: true }, 'go:people_mover': { css: '--lyr-rail', width: 3.4, ring: true },
      'go:mogo': { css: '--lyr-bike', ring: true }, 'go:bike_lanes': { css: '--lyr-bike', width: 2.4 }, 'go:stations': { css: '--lyr-rail', ring: true },
      'go:park_ride': { css: '--lyr-smart', ring: true }, 'go:intercity_bus': { css: '--lyr-rail', width: 2.6, dash: [5, 3], ring: true },
    });
    // and `resolveStyle` answers for `standard` from that table alone, whatever the band, theme or contrast
    for (const [id, s] of Object.entries(LAYER_STYLE)) for (const band of ['far', 'mid', 'near'] as const) for (const contrast of ['plain', 'more', 'forced'] as const) {
      const r = S.resolveStyle({ style: 'standard', layer: id, band, contrast, theme: 'dark' });
      expect([r.stroke, r.width, r.dash, r.casing, r.casingWidth, r.points], id).toEqual([s.css, s.width ?? 5, s.dash ?? null, '--gw-case', (s.width ?? 5) + 3, s.dense ? 'dense' : s.ring ? 'sparse' : null]);
      expect([r.badge, r.marker, r.stripe, r.ties, r.chevrons, r.double]).toEqual([null, null, null, null, null, null]);
    }
  });
});

describe('subway: what decides the drawing is plain functions (docs/MAP-STYLE.md, section 14)', () => {
  it('zoom bands: far above 30 m/px, near at 12 and under, and 5 % of stickiness at each edge', () => {
    expect([90, 30.1, 30, 12.1, 12, 0.6].map((m) => S.zoomBand(m))).toEqual(['far', 'far', 'mid', 'mid', 'near', 'near']);
    expect(S.zoomBand(29, 'far')).toBe('far'); expect(S.zoomBand(28.4, 'far')).toBe('mid'); expect(S.zoomBand(31, 'mid')).toBe('mid'); expect(S.zoomBand(31.6, 'mid')).toBe('far');
    expect(S.zoomBand(12.5, 'near')).toBe('near'); expect(S.zoomBand(12.7, 'near')).toBe('mid'); expect(S.zoomBand(11.5, 'mid')).toBe('mid'); expect(S.zoomBand(11.3, 'mid')).toBe('near');
    expect(S.zoomBand(5, 'far')).toBe('near'); expect(S.zoomBand(80, 'near')).toBe('far');
  });
  it('a route wears the tone the DATA gives it; the QLINE and the People Mover are fixed; theme and contrast never change the token', () => {
    for (let tone = 0; tone < 6; tone++) expect(S.routeColour({ tone, system: 'ddot' })).toBe('--tr-' + tone);
    expect(S.routeColour({ tone: 4, system: 'smart' }, 'dark', 'more')).toBe('--tr-4');
    expect(S.routeColour({ tone: 0, system: 'qline' })).toBe('--tr-rail'); expect(S.routeColour({ tone: 0, system: 'dpm' })).toBe('--tr-dpm');
    expect(S.routeColour({ tone: 7, system: 'ddot' })).toBe('--tr-1'); expect(S.routeColour({ tone: -1, system: 'ddot' })).toBe('--tr-5');   // a bad file cannot ask for a token that does not exist
    // the real files: every tone is one of the six, and route 4 Woodward wears what the file says, not what we think
    for (const id of ['ddot_routes', 'smart_routes']) for (const r of NETS[id]!.routes) expect([0, 1, 2, 3, 4, 5]).toContain(r.tone);
    const four = NETS.ddot_routes!.routes.find((r) => r.short === '4')!, raw = file('ddot_routes.net.json').routes.find((r: { short: string }) => r.short === '4');
    expect(S.routeColour(four)).toBe('--tr-' + raw.tone);
    expect(NETS.ddot_routes!.routes.filter((r) => r.frequent).map((r) => r.short)).toEqual(['3', '4', '9']);                   // the owner's word, as the data carries it
    expect(NETS.smart_routes!.routes.filter((r) => r.frequent).map((r) => r.short)).toEqual(['261', '461', '462', '561']);
  });
  it('widths are table 7.1', () => {
    const w = (r: S.RouteLook) => (['far', 'mid', 'near'] as const).map((b) => S.lineWidth(r, b));
    expect(w({ tone: 0, system: 'ddot', frequent: true })).toEqual([3.5, 5, 6]); expect(w({ tone: 0, system: 'smart' })).toEqual([2.5, 3.5, 4.5]); expect(w({ tone: 0, system: 'qline' })).toEqual([4.5, 6, 7]);
    expect((['far', 'mid', 'near'] as const).map((b) => [S.trunkWidth(b), S.casingWidth(b), S.casingWidth(b, 'more'), S.step(b)])).toEqual([[5.5, 2, 3, 0], [8, 3, 4, 6.5], [10, 4, 5, 8]]);
  });
  it('style × layer × route × band × contrast → stroke, casing, marker, dash, badge', () => {
    const q = (layer: string, band: S.Band, more: Partial<S.LookQuery> = {}) => S.resolveStyle({ style: 'subway', layer, band, ...more });
    const ddot4 = { tone: 3, system: 'ddot', frequent: true }, smart = { tone: 2, system: 'smart' };
    expect(q('ddot_routes', 'mid', { route: ddot4 })).toMatchObject({ stroke: '--tr-3', width: 5, casing: '--gw-case', casingWidth: 8, stripe: null, ties: null, chevrons: null, badge: { fill: '--tr-3', text: '--tr-fill', ring: '--tr-fill', ringWidth: 1.5, height: 16, font: 11, radius: 5, pad: 5 } });
    expect(q('ddot_routes', 'near', { route: ddot4, selected: true, contrast: 'more' })).toMatchObject({ width: 7.5, casingWidth: 12.5, badge: { height: 18, font: 12 } });
    expect(q('smart_routes', 'far', { route: smart }).stripe).toBeNull();                                          // at far, SMART is solid
    expect(q('smart_routes', 'mid', { route: smart })).toMatchObject({ stroke: '--tr-2', width: 3.5, stripe: { token: '--tr-fill', width: 3.5 / 3 } });
    expect(q('qline', 'mid')).toMatchObject({ stroke: '--tr-rail', width: 6, ties: { token: '--tr-fill', width: 3, dash: [1.2 * 6, 1.8 * 6] }, marker: { shape: 'circle', size: 9, ringWidth: 2, ring: '--tr-ring', fill: '--tr-fill' } });
    expect(q('qline', 'far')).toMatchObject({ width: 4.5, ties: { width: 1.5 }, marker: null });
    expect(q('people_mover', 'mid').chevrons).toEqual({ token: '--tr-fill', every: 90, length: 5, width: 1.75, angle: 35 });
    expect(q('people_mover', 'near').chevrons!.every).toBe(120); expect(q('people_mover', 'far').chevrons).toBeNull();
    expect(q('people_mover', 'near')).toMatchObject({ stroke: '--tr-dpm', width: 7, badge: { fill: '--tr-dpm' } });
    expect([q('ddot_stops', 'far').marker, q('smart_stops', 'mid').marker]).toEqual([null, null]);
    expect(q('ddot_stops', 'near').marker).toMatchObject({ shape: 'circle', size: 6, ringWidth: 1.5 }); expect(q('ddot_stops', 'mid', { selected: true }).marker).toMatchObject({ size: 9, ringWidth: 2 });
    expect(q('ddot_stops', 'near', { contrast: 'more' }).marker!.ringWidth).toBe(2);                              // rings + 0.5 under "increase contrast"
    expect(q('bike_lanes', 'far')).toMatchObject({ stroke: '--tr-bike', width: 1.5, double: null, casing: null }); expect(q('bike_lanes', 'mid').double).toEqual({ stroke: 1.25, gap: 2 }); expect(q('bike_lanes', 'near').double).toEqual({ stroke: 1.5, gap: 2.5 });
    for (const id of ['mogo', 'stations', 'intercity_bus', 'park_ride']) expect(q(id, 'far').marker, id).toBeNull();
    expect(q('mogo', 'mid').marker).toMatchObject({ shape: 'dock', size: 9, corner: 2.5, fill: '--tr-bike', ring: '--tr-fill' }); expect(q('mogo', 'near').marker!.size).toBe(11);
    expect(q('stations', 'near').marker).toMatchObject({ shape: 'square', size: 13, ring: '--tr-rail', ringWidth: 2.5, inner: '--tr-rail' });
    expect(q('intercity_bus', 'mid').marker).toMatchObject({ shape: 'diamond', size: 10, ring: '--tr-coach', ringDash: [3, 2] });
    expect(q('park_ride', 'mid').marker).toMatchObject({ shape: 'p', size: 14, corner: 3, fill: '--tr-pr' });
    // shape, not colour, tells the systems apart: no two network looks are the same once the colour is taken away
    const shape = (r: S.Resolved) => JSON.stringify([!!r.stripe, !!r.ties, !!r.chevrons, !!r.double]);
    expect(new Set([q('ddot_routes', 'mid'), q('smart_routes', 'mid'), q('qline', 'mid'), q('people_mover', 'mid'), q('bike_lanes', 'mid')].map(shape)).size).toBe(5);
    expect(S.pillLook('interchange', 'mid')).toMatchObject({ height: 9, ringWidth: 2 }); expect(S.pillLook('hub', 'near', 'more')).toMatchObject({ height: 14, ringWidth: 3 });
    expect(S.terminalLook('mid')).toMatchObject({ r: 6, ringWidth: 3 }); expect(S.terminalLook('near').r).toBe(7.5);
  });
  it('the basemap is quietened only in subway, only while a network is on, and never for someone who asked for more contrast', () => {
    expect(S.basemapTokens('subway', true, 'plain')).toEqual({ quiet: true, road: '--map-road-q', main: '--map-main-q', fwy: '--map-fwy-q', park: '--map-park-q', parkInk: '--map-park-ink-q', ink: '--map-ink-q' });
    for (const [style, on, contrast] of [['standard', true, 'plain'], ['subway', false, 'plain'], ['subway', true, 'more'], ['subway', true, 'forced']] as const)
      expect(S.basemapTokens(style, on, contrast)).toEqual({ quiet: false, road: '--map-road', main: '--map-main', fwy: '--map-fwy', park: '--map-park', parkInk: '--map-park-ink', ink: '--map-ink' });
  });
  it('reads the four real network files, and refuses anything that is not format 2 by answering "draw standard"', () => {
    expect(NETS.ddot_routes).toMatchObject({ system: 'ddot', agency: 'DDOT', stopsLayer: 'ddot_stops' }); expect(NETS.ddot_routes!.routes.length).toBe(37); expect(NETS.smart_routes!.routes.length).toBe(42);
    expect(NETS.ddot_routes!.trunks.length).toBe(5); expect(NETS.smart_routes!.trunks.length).toBe(10); expect(Math.max(...NETS.ddot_routes!.trunks.map((k) => k.routes.length))).toBe(17);
    expect(NETS.people_mover!.routes[0]).toMatchObject({ loop: true, short: 'DPM', ends: [] }); expect(NETS.qline!.routes[0]!.ends.map((e) => e.name)).toEqual(['Congress Station', 'Grand Blvd Station']);
    for (const net of Object.values(NETS)) for (const l of net!.lines) { expect(l.runs[0]!.from).toBe(0); expect(l.runs[l.runs.length - 1]!.to).toBe(l.pts.length / 2 - 1); for (const r of l.runs) expect(r.to).toBeGreaterThan(r.from); }
    expect(S.decodeServes(file('ddot_stops.net.json'))!.length).toBe(decodeLayer(file('ddot_stops.json')).points.length);
    for (const bad of [null, {}, { ...file('qline.net.json'), v: 1 }, { ...file('qline.net.json'), v: 3 }, { ...file('qline.net.json'), routes: undefined }, file('qline.json')]) expect(S.decodeNet(bad)).toBeNull();
  });
  it('side-by-side offsets: left of the direction of travel with north up, a mitre at corners, never past twice the offset', () => {
    expect(S.offsetRun([0, 0, 10, 0], 2)).toEqual([0, -2, 10, -2]);                                                 // going east, left is north (up the screen)
    expect(S.offsetRun([0, 0, 0, -10], 2)).toEqual([-2, 0, -2, -10]);                                               // going north, left is west
    expect(S.offsetRun([10, 0, 0, 0], 2)).toEqual([10, 2, 0, 2]);                                                   // going west: the pipeline flips the sign, the client does not
    const bend = S.offsetRun([0, 0, 10, 0, 10, 10], 2);                                                             // east then south: the corner moves along the mitre
    expect(bend.map((v) => Math.round(v * 100) / 100)).toEqual([0, -2, 12, -2, 12, 10]);
    const hairpin = S.offsetRun([0, 0, 10, 0, 0, 0.1], 2);
    expect(Math.hypot(hairpin[2]! - 10, hairpin[3]!)).toBeLessThanOrEqual(4 + 1e-9);                                // mitre limit 2
    expect(S.offsetRun([1, 2, 3, 4], 0)).toEqual([1, 2, 3, 4]);
  });
  it('corners are one quadratic curve each: r = min(R, half of either side), and a turn under 8° is left alone', () => {
    expect(S.roundCorners([0, 0, 100, 0, 100, 100], 10)).toEqual([0, 0, 0, 1, 90, 0, 2, 100, 0, 100, 10, 1, 100, 100]);
    expect(S.roundCorners([0, 0, 8, 0, 8, 100], 10)).toEqual([0, 0, 0, 1, 4, 0, 2, 8, 0, 8, 4, 1, 8, 100]);           // a short side: half of it
    expect(S.roundCorners([0, 0, 100, 0, 200, 5], 10)).toEqual([0, 0, 0, 1, 100, 0, 1, 200, 5]);                       // 2.9°: a plain vertex
    expect(S.roundCorners([0, 0, 100, 0, 100, 100], 0).filter((_, i, a) => a[i] === 2 && (i === 0 || i % 3 === 0)).length).toBe(0);
    const log: string[] = []; S.replay(fakeContext(log), S.roundCorners([0, 0, 100, 0, 100, 100], 10));
    expect(log).toEqual(['moveTo(0,0)', 'lineTo(90,0)', 'quadraticCurveTo(100,0,100,10)', 'lineTo(100,100)']);
  });
  it('simplifying keeps the ends of every run, so run boundaries survive', () => {
    expect(S.simplify([0, 0, 5, 0.1, 10, 0], 1)).toEqual([0, 0, 10, 0]); expect(S.simplify([0, 0, 5, 3, 10, 0], 1)).toEqual([0, 0, 5, 3, 10, 0]); expect(S.simplify([0, 0, 5, 0.1, 10, 0], 0)).toEqual([0, 0, 5, 0.1, 10, 0]);
  });
  it('badges are anchored to the world, spaced along the first line, and never sit on a trunk', () => {
    const m = 1 / 111320, line = { pts: Float32Array.from([0, 0, 10000 * m, 0]), cum: Float32Array.from([0, 10000]), runs: [{ from: 0, to: 1, off: -1, n: 2 }] };
    expect(S.badgeAnchors(line, 3000).map((a) => Math.round(a.d))).toEqual([1500, 4500, 7500]);
    expect(S.badgeAnchors(line, 3000)[0]).toMatchObject({ off: -1, y: 0 }); expect(S.badgeAnchors(line, 3000)[0]!.x * 111320).toBeCloseTo(1500, 0);
    expect(S.badgeAnchors({ ...line, runs: [{ from: 0, to: 1, off: 0, n: 5 }] }, 3000)).toEqual([]);                    // five or more share the street: the trunk badge speaks for them
    // the real thing: route 4 at the mid band, and no anchor of any route inside a trunk run
    const net = NETS.ddot_routes!;
    for (const r of net.routes) for (const a of S.badgeAnchors(net.lines[r.lines[0]!]!, 1200)) { const l = net.lines[r.lines[0]!]!, seg = l.cum.findIndex((c) => c >= a.d) - 1, run = l.runs.find((x) => seg >= x.from && seg < x.to); expect(run?.n ?? 1, r.short).toBeLessThanOrEqual(4); }
  });
  it('badges claim room ROUND-ROBIN: the chosen route first, then every route\'s first badge (rail, trunks, frequent, the rest) before any route\'s second — 24 placed at most', () => {
    const c = (key: string, route: string, cls: S.BadgeCandidate['cls'], order: number, d: number): S.BadgeCandidate => ({ key, route, cls, order, d });
    const many = [...Array.from({ length: 40 }, (_, i) => c('o' + i, 'r' + i, 'other', i, 5)), c('f', 'r4', 'frequent', 4000, 9), c('t', 'trunk', 'trunk', 0, 9), c('q', 'qline', 'rail', 9000, 9), c('far', 'r31', 'other', 31, 300), c('near', 'r31', 'other', 31, 3)];
    const got = S.claimBadges(many, 24, 'r31');
    // r4's 'f' is that route's SECOND badge (o4 is nearer the middle), so it waits for the second round.
    expect(got.length).toBe(24); expect(got.slice(0, 6).map((b) => b.key)).toEqual(['near', 'o31', 'far', 'q', 't', 'o0']);   // o31 is the chosen route's too
    expect(S.claimBadges(many).length).toBe(S.BADGE_CAP);
    // Mid zoom downtown, the case that starved: 30 routes with 3 badges each in view. Strict priority gave routes
    // 1–8 three badges each and routes 9–30 none. Now the first 24 routes get one each and nobody has two.
    const crowd = Array.from({ length: 30 }, (_, r) => [0, 1, 2].map((k) => c(`b${r}_${k}`, 'route' + r, r < 3 ? 'frequent' : 'other', r, 10 + k))).flat();
    const drawn = S.claimBadges(crowd);
    expect(new Set(drawn.map((b) => b.route)).size).toBe(24); expect(drawn.every((b) => b.key.endsWith('_0'))).toBe(true);
    expect(drawn.slice(0, 3).map((b) => b.route)).toEqual(['route0', 'route1', 'route2']);                             // frequent routes lead their round
    // With room for more than one each, the second round starts only after every route has had its first.
    const order = S.badgeOrder(crowd).map((b) => b.key);
    expect(order.slice(0, 30).every((k) => k.endsWith('_0'))).toBe(true); expect(order[30]).toBe('b0_1');
    // A badge that finds no room does not use up one of the 24: the next in line gets the place.
    const picky = S.claimBadges(crowd, 24, '', (b) => b.route !== 'route0');
    expect(picky.length).toBe(24); expect(picky.some((b) => b.route === 'route0')).toBe(false); expect(picky.some((b) => b.route === 'route24')).toBe(true);
  });
  it('what stands on the map at each zoom', () => {
    const on = ['ddot_routes', 'ddot_stops', 'qline'];
    expect(S.stationsFor('far', '', on)).toEqual({ stopLayers: [], selectedStops: false, interchangeMin: Infinity, terminals: false, markers: false, railStations: false, hubs: true });
    expect(S.stationsFor('mid', 'route:ddot_routes:3', on)).toMatchObject({ stopLayers: [], selectedStops: true, interchangeMin: 3, terminals: true, markers: true, railStations: true });
    expect(S.stationsFor('near', 'hub:1', on)).toMatchObject({ stopLayers: ['ddot_stops'], selectedStops: false, interchangeMin: 2 });
    expect(S.stationsFor('near', '', ['qline', 'mogo']).interchangeMin).toBe(Infinity);                                  // no bus network on: no bus interchanges
  });
  it('every glyph answers a tap within a 44 × 44 box however small it is; priority decides; the same place again moves on', () => {
    const glyphs: S.Glyph[] = [{ id: 'stop', x: 100, y: 100, prio: 4 }, { id: 'terminal', x: 110, y: 104, prio: 1 }, { id: 'pill', x: 96, y: 98, prio: 2 }, { id: 'elsewhere', x: 300, y: 300, prio: 0 }];
    expect(S.hitTest({ x: 121.9, y: 100 }, glyphs)!.id).toBe('terminal'); expect(S.hitTest({ x: 78.5, y: 100 }, glyphs)!.id).toBe('pill');
    expect(S.hitTest({ x: 100, y: 127 }, glyphs)).toBeNull(); expect(S.hitTest({ x: 200, y: 200 }, glyphs)).toBeNull();
    const round: string[] = []; let last = ''; for (let i = 0; i < 4; i++) { last = S.hitTest({ x: 102, y: 101 }, glyphs, last)!.id; round.push(last); }
    expect(round).toEqual(['terminal', 'pill', 'stop', 'terminal']);
    expect(S.hitTest({ x: 140, y: 100 }, [{ id: 'badge', x: 100, y: 100, prio: 3, w: 90, h: 16 }])!.id).toBe('badge');   // a wide badge answers over its whole width
    expect(S.HIT).toBe(44); expect(S.LINE_HIT).toBe(22);
  });
  it('the keyboard order is only ever added to: today\'s order, then hubs, terminals, interchanges by nearness, routes in rider order — 40 at most', () => {
    const existing = [{ kind: 'segment', id: 's1' }, { kind: 'segment', id: 's2' }, { kind: 'dot', id: 'd1' }];
    const f = (kind: S.SubFeature['kind'], id: string, d: number, order = 0) => ({ kind, id, d, order });
    const got = S.featureOrder(existing, [f('route', 'r9', 1, 9), f('interchange', 'ixFar', 80), f('route', 'r4', 99, 4), f('terminal', 'end', 50), f('hub', 'hubFar', 200), f('interchange', 'ixNear', 5), f('hub', 'hubNear', 20)]);
    expect(got.map((x) => x.id)).toEqual(['s1', 's2', 'd1', 'hubNear', 'hubFar', 'end', 'ixNear', 'ixFar', 'r4', 'r9']);
    expect(got.slice(0, 3)).toEqual(existing);                                                                          // never reordered, never dropped
    // Downtown: 90 interchanges, 30 terminals and 50 routes in view. Interchanges stop at 20 and terminals at 8, so
    // the keyboard still reaches routes — and the whole addition is never more than 40.
    const flood = S.featureOrder(existing, [...Array.from({ length: 90 }, (_, i) => f('interchange', 'ix' + i, i)), ...Array.from({ length: 30 }, (_, i) => f('terminal', 'end' + i, i)), ...Array.from({ length: 50 }, (_, i) => f('route', 'r' + i, 0, i)), f('hub', 'h', 1)]);
    const kinds = (k: string) => flood.filter((x) => (x as { kind: string }).kind === k).length;
    expect(flood.length).toBe(3 + S.FEATURE_CAP);
    expect([kinds('hub'), kinds('terminal'), kinds('interchange'), kinds('route')]).toEqual([1, S.FEATURE_KIND_CAP.terminal, S.FEATURE_KIND_CAP.interchange, 11]);
    expect(flood[3 + 1 + 8 + 19]).toMatchObject({ id: 'ix19' }); expect(flood[flood.length - 1]).toMatchObject({ id: 'r10' });
    expect(S.featureOrder(existing, Array.from({ length: 90 }, (_, i) => f('interchange', 'ix' + i, i))).length).toBe(3 + 20);
    expect(S.featureOrder(existing, [])).toEqual(existing);
  });
});

describe('subway: what reaches the canvas, drawn through the real MapView from the real network files', () => {
  const BUS = ['ddot_routes', 'smart_routes', 'qline', 'people_mover', 'bike_lanes', 'mogo', 'stations', 'intercity_bus', 'park_ride'];
  const draw = async (key: string, on: string[], more: Partial<MapSpec> = {}, data: Partial<S.SubwayData> = {}, asked: string[] = []) =>
    framesOf(baseSpec(key, realOverlays(on), { style: 'subway', subway: subwaySpec(on, data), fit: DOWNTOWN, dots: [], me: null, ...more }), serveBasemap(asked));
  const count = (log: string[], re: RegExp) => log.filter((l) => re.test(l)).length;
  const tokens = themeTokens('light');

  it('switching to subway asks the network for nothing: the painter draws from what it is handed', async () => {
    const asked: string[] = []; await draw('s0', BUS, {}, {}, asked);
    expect(asked.filter((u) => !/map\/(base|streets)\.json$/.test(u))).toEqual([]);                                    // the basemap's own two files at most; never a layer, never a .net.json
  });
  it('one path per route per frame, one casing pass per width, all strokes round, and the greenway above every transit line', async () => {
    const f = await draw('s1', ['ddot_routes']);
    const log = f.far, first = log.findIndex((l) => l.startsWith('translate(')), last = log.indexOf('restore()');
    const pass = log.slice(first, last), strokes = count(pass, /^stroke\(\)$/), begins = count(pass, /^beginPath\(\)$/);
    expect(strokes).toBe(begins);                                                                                       // a path is stroked once, never per segment
    const routesInView = new Set(pass.filter((l) => /^strokeStyle=#/.test(l)).map((l) => l)).size;
    expect(strokes).toBeLessThanOrEqual(2 /* casings */ + NETS.ddot_routes!.routes.length + 2 /* trunk casing and stroke */);
    expect(routesInView).toBeGreaterThan(3);
    expect(pass).not.toContain('lineCap=butt');                                                                          // DDOT alone: round caps throughout
    expect(count(pass, /^quadraticCurveTo\(/)).toBeGreaterThan(20);                                                      // corners are rounded with quadratic curves
    const gw = log.findIndex((l) => l === `strokeStyle=${tokens['--gw-open']}`);
    expect(gw).toBeGreaterThan(last);                                                                                   // step 13 comes after steps 6–12
  });
  it('badges: never more than 24, always horizontal, left to right, with the route\'s own short name', async () => {
    for (const frame of Object.values(await draw('s2', BUS)).slice(0, 2) as string[][]) {
      const from = frame.findIndex((l) => l === 'direction=ltr'), marks = frame.slice(from);
      const texts = marks.filter((l) => /^fillText\(/.test(l) && !/^fillText\(P,/.test(l));
      const badgeTexts = texts.filter((l) => /^fillText\((FAST )?[\dA-Z]+( · [\dA-Z]+)*( \+\d+)?,/.test(l));
      expect(badgeTexts.length).toBeGreaterThan(2); expect(badgeTexts.length).toBeLessThanOrEqual(S.BADGE_CAP);
      expect(from).toBeGreaterThan(0);
      // nothing in the subway passes turns the canvas: the only rotate() calls belong to street names, which come before
      expect(count(marks, /^rotate\(/)).toBe(0);
    }
  });
  it('the QLINE has ties (a dashed light stroke with butt caps), the People Mover has chevrons, SMART a light stripe, bike lanes two thin lines', async () => {
    const f = await draw('s3', ['qline', 'people_mover', 'smart_routes', 'bike_lanes']);
    const log = f.far;
    expect(log).toContain('lineCap=butt');
    const tie = log[log.indexOf('lineCap=butt') - 1]!; expect(tie).toMatch(/^setLineDash\(\[[\d.]+,[\d.]+\]\)$/);
    const [a, b] = /\[([\d.]+),([\d.]+)\]/.exec(tie)!.slice(1).map(Number) as [number, number]; expect(b / a).toBeCloseTo(1.5, 1);   // 1.2 W on, 1.8 W off
    expect(log).toContain(`strokeStyle=${tokens['--tr-dpm']}`); expect(log).toContain(`strokeStyle=${tokens['--tr-rail']}`); expect(log).toContain(`strokeStyle=${tokens['--tr-bike']}`);
    expect(count(log, new RegExp(`^strokeStyle=${tokens['--tr-fill']}$`)), 'ties, stripes and chevrons are all drawn in the fill colour').toBeGreaterThanOrEqual(3);
  });
  it('choosing a route dims every other transit line, badge and station to 35 %, draws the route last over an under-stroke, and shows its stops', async () => {
    const four = NETS.ddot_routes!.routes.find((r) => r.short === '4')!;
    const f = await draw('s4', ['ddot_routes', 'qline'], { fit: [{ lat: 42.29, lon: -83.2 }, { lat: 42.44, lon: -82.95 }] });
    const note = () => f.canvas.parentElement!.parentElement!.children[1]!.innerHTML;
    for (let i = 0; i < 3; i++) f.canvas.fire('keydown', { key: '-' });                                                  // back out to the whole city (framesOf zoomed in)
    f.canvas.log.length = 0; f.view.redraw();
    // the way a keyboard does it: N to the route, Enter to choose it
    for (let i = 0; i < 80 && !note().includes('<strong>4 Woodward</strong>'); i++) f.canvas.fire('keydown', { key: 'n' });
    expect(note()).toContain('<strong>4 Woodward</strong>');
    f.canvas.fire('keydown', { key: 'Enter' }); f.canvas.fire('keydown', { key: 'Escape' });                           // Escape puts the ring away; the route stays chosen
    for (let i = 0; i < 5; i++) f.canvas.fire('keydown', { key: '+' });                                                  // in to the near band, where its stops show
    f.canvas.log.length = 0; f.view.redraw();
    const log = [...f.canvas.log], first = log.findIndex((l) => l.startsWith('translate(')), last = log.indexOf('restore()'), pass = log.slice(first, last);
    expect(pass).toContain('globalAlpha=0.35');
    const lastFull = pass.lastIndexOf('globalAlpha=1'), tail = pass.slice(lastFull);
    expect(tail.filter((l) => l.startsWith('strokeStyle=')).slice(0, 3)).toEqual([`strokeStyle=${tokens['--tr-sel']}`, `strokeStyle=${tokens['--gw-case']}`, `strokeStyle=${tokens['--tr-' + four.tone]}`]);
    expect(pass.slice(0, lastFull).filter((l) => l.startsWith('globalAlpha=')).every((l) => l === 'globalAlpha=0.35')).toBe(true);
    // the greenway and the basemap are not dimmed
    const gw = log.findIndex((l) => l === `strokeStyle=${tokens['--gw-open']}`); expect(log.slice(last, gw)).not.toContain('globalAlpha=0.35');
    // the card: name and agency, "Frequent route", the agency's own headway worded as theirs, stops, terminals, one link, and no clock time
    const card = note();
    expect(card).toContain('4 Woodward'); expect(card).toContain('· DDOT'); expect(card).toContain('Frequent route'); expect(card).toContain('About every 12 minutes on weekdays, the agency says');
    expect(card).toContain(`${four.stopCount} stops`); expect(card).toContain(plannerFor('ddot')); expect(card).toContain('Plan a trip with DDOT');
    expect((card.match(/<a /g) ?? []).length).toBe(1); expect(card).not.toMatch(/\d{1,2}:\d{2}|\bmin away|arriv/i);
    expect(card).toContain('<bdi dir="ltr" lang="en">');                                                                 // Latin names stay left to right inside an Arabic card
    f.canvas.fire('keydown', { key: 'Escape' }); f.canvas.log.length = 0; f.view.redraw();                              // Escape again lets the route go
    expect(f.canvas.log).not.toContain('globalAlpha=0.35');
  });
  it('under "increase contrast" and forced colours the basemap is NOT quietened; in the plain subway style it is', async () => {
    const q = (log: string[]) => log.some((l) => l.endsWith('=' + tokens['--map-road-q']) || l.endsWith('=' + tokens['--map-main-q']) || l.endsWith('=' + tokens['--map-park-q']));
    expect(q((await draw('s5', ['ddot_routes'])).far)).toBe(true);
    expect(q((await draw('s5b', ['mogo', 'bike_lanes'])).far)).toBe(false);                                              // no network on: nothing to quieten for
    for (const media of ['prefers-contrast: more', 'forced-colors: active']) {
      const f = await framesOf(baseSpec('s6' + media, realOverlays(['ddot_routes']), { style: 'subway', subway: subwaySpec(['ddot_routes']), fit: DOWNTOWN }), index(), { [media]: true });
      expect(q(f.far), media).toBe(false); expect(f.far.some((l) => l.endsWith('=' + tokens['--map-main'])), media).toBe(true);
    }
  });
  it('a network whose .net.json has not arrived (or could not be read) keeps drawing the standard way, beside the ones that did', async () => {
    const f = await framesOf(baseSpec('s7', realOverlays(['ddot_routes', 'smart_routes']), { style: 'subway', subway: subwaySpec(['ddot_routes', 'smart_routes'], { nets: { ddot_routes: NETS.ddot_routes! } }), fit: DOWNTOWN }), index());
    // SMART's standard look is a dash of 3 and 2 line-widths (LAYER_STYLE); nothing else on this map has that ratio.
    const smartDash = (log: string[]) => log.some((l) => { const m = /^setLineDash\(\[([\d.]+),([\d.]+)\]\)$/.exec(l); return !!m && Math.abs(Number(m[1]) / Number(m[2]) - 1.5) < 0.01; });
    expect(smartDash(f.far)).toBe(true);                                                                                 // SMART: still standard
    expect(f.far.filter((l) => l.startsWith('quadraticCurveTo(')).length).toBeGreaterThan(20);                           // DDOT: subway, beside it
    const both = await framesOf(baseSpec('s7b', realOverlays(['ddot_routes', 'smart_routes']), { style: 'subway', subway: subwaySpec(['ddot_routes', 'smart_routes']), fit: DOWNTOWN }), index());
    expect(smartDash(both.far)).toBe(false);
  });
  it('tapping a hub names the stations a short walk apart; the keyboard walks hubs, terminals, interchanges and routes after today\'s features', async () => {
    const f = await draw('s8', ['qline', 'people_mover', 'ddot_routes'], { fit: [{ lat: 42.3352, lon: -83.0518 }, { lat: 42.3372, lon: -83.0498 }], dots: [{ lat: 42.3362, lon: -83.0508, label: 'Pantry', category: 'food.pantry' }] });
    const note = () => f.canvas.parentElement!.parentElement!.children[1]!.innerHTML;
    f.canvas.log.length = 0; f.view.redraw();
    const seen: string[] = [];
    for (let i = 0; i < 45; i++) { f.canvas.fire('keydown', { key: 'n' }); const m = /<strong>([^<]*)<\/strong>/.exec(note()); if (m && !seen.includes(m[1]!)) seen.push(m[1]!); }
    expect(seen[0]).toBe('Pantry');                                                                                    // today's features first, as today
    expect(seen[1]).toBe('Grand Circus Park');                                                                         // then hubs
    // Enter on the hub opens its card: the stations a short walk apart, by name and system
    for (let i = 0; i < 60 && !note().includes('<strong>Grand Circus Park</strong>'); i++) f.canvas.fire('keydown', { key: 'n' });
    f.canvas.fire('keydown', { key: 'Enter' }); f.canvas.log.length = 0; f.view.redraw();
    expect(note()).toContain('A short walk between: Grand Circus Park (people_mover), Grand Circus Station (qline)');
  });
});

describe('subway: hubs are placed by the file, routes stay in reach, and the list does not know the style', () => {
  it('a hub\'s pill comes from its own origin + at + span; name-matching is only for a bundle from before `origin`', () => {
    for (const hub of HUBS) {
      expect(hub.origin, hub.name).toEqual([-83.32, 42.22]);
      const [a, b] = S.hubSpan(hub)!;                                                                                  // no overlays handed over: nothing to match names in
      expect(a.x).toBeCloseTo(wx(hub.origin![0] + (hub.at[0] + hub.span[0]!) / 1e5), 9); expect(b.y).toBeCloseTo(wy(hub.origin![1] + (hub.at[1] + hub.span[3]!) / 1e5), 9);
      // The old way, for an old bundle, lands in the same place (within a few metres: the file's span is every station of the hub).
      const { origin: _o, ...old } = hub, was = S.hubSpan(old, realOverlays(hub.layers));
      expect(was, hub.name).not.toBeNull();
      expect(Math.hypot((was![0].x + was![1].x) / 2 - (a.x + b.x) / 2, (was![0].y + was![1].y) / 2 - (a.y + b.y) / 2) * 111320).toBeLessThan(60);
    }
    expect(S.hubSpan({ at: [0, 0], span: [0, 0, 0, 0], name: 'x', layers: [], stops: [] })).toBeNull();
  });
  it('downtown, at mid and near zoom, with both bus networks on, the keyboard still reaches routes (interchanges stop at 20)', async () => {
    const on = ['ddot_routes', 'smart_routes', 'qline', 'people_mover'];
    for (const fit of [[{ lat: 42.29, lon: -83.11 }, { lat: 42.37, lon: -83.0 }], [{ lat: 42.326, lon: -83.058 }, { lat: 42.342, lon: -83.038 }]]) {
      const f = await framesOf(baseSpec('reach' + fit[0]!.lat, realOverlays(on), { style: 'subway', subway: subwaySpec(on), fit, dots: [], me: null }), serveBasemap());
      const note = () => f.canvas.parentElement!.parentElement!.children[1]!.innerHTML;
      f.canvas.log.length = 0; f.view.redraw();
      const seen: string[] = [];
      for (let i = 0; i < 45; i++) { f.canvas.fire('keydown', { key: 'n' }); const m = /<strong>([^<]*)<\/strong><small>([^<]*)/.exec(note()); if (m) seen.push(`${m[1]}|${m[2]}`); }
      const routes = new Set(seen.filter((x) => /\|(DDOT|SMART|M-1 RAIL|Detroit Transportation Corporation|Detroit People Mover)$/.test(x) && !x.includes(' · ')));
      expect(routes.size, JSON.stringify(seen.slice(0, 6))).toBeGreaterThanOrEqual(8);
    }
  });
  it('"See this map as a list" is the same HTML, to the character, in standard and in subway', () => {
    // main.ts hands mapListHtml the same things whichever style is on: the listings, the greenway, the parks and
    // the STANDARD layers that are on. The subway files are never given to it; this proves they are not needed.
    const over = realOverlays(['ddot_routes', 'smart_routes', 'ddot_stops', 'qline', 'people_mover', 'mogo', 'bike_lanes', 'stations']);
    const T = (k: string, p?: Record<string, string | number>) => esc(t(k, p));
    const input = (style: 'standard' | 'subway') => ({
      rows: [{ id: 'svc_a', name: 'Pantry & Co' }], overlays: over.map((o) => ({ ...o, ...(style === 'subway' ? { net: NETS[o.id.slice(3)] } : {}) })), parks: [{ name: 'Palmer Park' }, { name: 'Clark Park' }],
      segments: [{ id: 'seg_1', name: 'Dequindre Cut', phase: 'open' }], problems: ['', '<p role="alert">x</p>'], T, t, owner: (x: unknown) => `<span lang="en">${esc(String(x))}</span>`,
      icon: (n: string) => `<i data-i="${n}"></i>`, card: (r: { id: string; name: string }) => `<li>${esc(r.name)}</li>`, segmentRow: (g: { id: string; name: string }) => `<li>${esc(g.name)}</li>`, allParks: '<button>all</button>',
    });
    const std = mapListHtml(input('standard')), sub = mapListHtml(input('subway'));
    expect(sub).toBe(std);
    expect(std).toContain('<h3>ddot_routes <span class="count">'); expect(std).toContain('4 Woodward'); expect(std).toContain('Pantry &amp; Co'); expect(std).toContain('Dequindre Cut');
    expect(std).not.toMatch(/rt_ddot|FAST 4|tone/);                                                                      // nothing of a .net.json file is in the list
    expect(mapListHtml({ ...input('subway'), rows: [], overlays: [], parks: [], segments: [], problems: [] })).toBe(`<h2>${T('map.list_title')}</h2><p class="empty">${T('map.list_none')}</p>`);
  });
  it('main.ts builds the list from mapListHtml and hands it nothing about the style', () => {
    const src = readFileSync(join(__dirname, '../src/main.ts'), 'utf8'), body = src.slice(src.indexOf('function layerList('), src.indexOf('/** Who a layer came from'));
    expect(body).toContain('mapListHtml('); expect(body).not.toMatch(/styleOn|styleNow|subway|netFiles|netNow/);
    expect(readFileSync(join(__dirname, '../src/maplist.ts'), 'utf8')).not.toMatch(/^import/m);                     // it imports nothing at all: not the style, not a painter, not a file reader
  });
});

describe('subway tokens: every pair the spec tabulates, computed from style.css (the numbers ARE the spec\'s)', () => {
  const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
  const read = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
  const slice = (from: string, to: string) => css.slice(css.indexOf(from), css.indexOf(to));
  const light = read(slice(':root {', '@media (prefers-color-scheme: dark)')), dark = { ...light, ...read(slice('@media (prefers-color-scheme: dark)', '* { box-sizing')) };
  const moreLight = { ...light, ...read(slice('@media (prefers-contrast: more) {', '@media (prefers-contrast: more) and')) };
  const moreDark = { ...dark, ...read(slice('@media (prefers-contrast: more) {', '@media (prefers-contrast: more) and')), ...read(slice('@media (prefers-contrast: more) and (prefers-color-scheme: dark)', '@media (forced-colors: active) {')) };
  const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // docs/MAP-STYLE.md 4.1: token, light value, [land, park, casing], dark value, [land, park, casing]
  const LINES: [string, string, number[], string, number[]][] = [
    ['--tr-0', '#c8102e', [5.56, 4.25, 5.88], '#ff7a70', [6.67, 4.85, 7.52]], ['--tr-1', '#1d4ed8', [6.33, 4.84, 6.70], '#7aa7ff', [7.10, 5.16, 8.00]],
    ['--tr-2', '#0f766e', [5.17, 3.96, 5.47], '#4fd1c5', [9.08, 6.61, 10.24]], ['--tr-3', '#8a4b14', [6.40, 4.90, 6.78], '#e0a96d', [8.12, 5.91, 9.16]],
    ['--tr-4', '#be185d', [5.70, 4.36, 6.04], '#ff8ac2', [7.80, 5.67, 8.79]], ['--tr-5', '#475569', [7.16, 5.48, 7.58], '#b6c2d2', [9.39, 6.83, 10.58]],
    ['--tr-rail', '#1f2937', [13.87, 10.61, 14.68], '#eef2f6', [15.06, 10.95, 16.98]], ['--tr-dpm', '#86198f', [7.78, 5.95, 8.24], '#e59bf0', [8.29, 6.03, 9.35]],
    ['--tr-trunk', '#334155', [9.78, 7.48, 10.35], '#cbd5e1', [11.41, 8.30, 12.87]], ['--tr-bike', '#15803d', [4.74, 3.63, 5.02], '#6ee7a0', [10.97, 7.98, 12.37]],
    ['--tr-coach', '#7c2d12', [8.85, 6.77, 9.37], '#fdba74', [10.04, 7.31, 11.33]], ['--tr-pr', '#1e40af', [8.24, 6.30, 8.72], '#93b4ff', [8.24, 5.99, 9.29]],
    ['--tr-ring', '#1b2a22', [14.16, 10.83, 14.99], '#eef5f0', [15.29, 11.12, 17.24]],
  ];
  it('4.1 lines and markers: the values are the spec\'s, the ratios are the spec\'s to two places, and every one is 3:1 or better', () => {
    for (const [token, lv, lr, dv, dr] of LINES) for (const [theme, v, want, value] of [['light', light, lr, lv], ['dark', dark, dr, dv]] as const) {
      expect(v[token], `${token} ${theme}`).toBe(value);
      ['--map-land', '--map-park', '--gw-case'].forEach((bg, i) => { const r = ratio(v[token]!, v[bg]!); expect(`${token} on ${bg} (${theme}): ${r.toFixed(2)}`).toBe(`${token} on ${bg} (${theme}): ${want[i]!.toFixed(2)}`); expect(r).toBeGreaterThanOrEqual(3); });
    }
    expect([light['--tr-fill'], dark['--tr-fill']]).toEqual([light['--gw-case'], dark['--gw-case']]);                   // the fill IS the casing, on purpose
    expect([light['--tr-sel'], dark['--tr-sel']]).toEqual([light['--tr-ring'], dark['--tr-ring']]);
  });
  it('4.1 badge text: the fill colour on every tone is 4.5:1 or better, from 5.47 to 10.35 in light and 7.52 to 12.87 in dark', () => {
    for (const [theme, v, lo, hi] of [['light', light, 5.47, 10.35], ['dark', dark, 7.52, 12.87]] as const) {
      const rs = ['--tr-0', '--tr-1', '--tr-2', '--tr-3', '--tr-4', '--tr-5', '--tr-trunk'].map((k) => ratio(v['--tr-fill']!, v[k]!));
      expect([Math.min(...rs).toFixed(2), Math.max(...rs).toFixed(2)], theme).toEqual([lo.toFixed(2), hi.toFixed(2)]);
      for (const k of ['--tr-rail', '--tr-dpm']) expect(ratio(v['--tr-fill']!, v[k]!), k).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('4.3 the quietened basemap: every street still 3:1 against the land, names 4.5:1, and the casing 3:1 against every quiet street', () => {
    const Q: [string, string, number, string, number][] = [['--map-road-q', '#818a84', 3.36, '#66756c', 3.49], ['--map-main-q', '#7d8680', 3.55, '#6c7b73', 3.81], ['--map-fwy-q', '#a2833d', 3.39, '#837039', 3.50], ['--map-ink-q', '#5a6760', 5.60, '#a3b2a9', 7.66]];
    for (const [token, lv, lr, dv, dr] of Q) for (const [theme, v, want, value] of [['light', light, lr, lv], ['dark', dark, dr, dv]] as const) {
      expect(v[token], `${token} ${theme}`).toBe(value);
      expect(`${token} on land (${theme}): ${ratio(v[token]!, v['--map-land']!).toFixed(2)}`).toBe(`${token} on land (${theme}): ${want.toFixed(2)}`);
      expect(ratio(v[token]!, v['--map-land']!)).toBeGreaterThanOrEqual(token === '--map-ink-q' ? 4.5 : 3);
    }
    expect([light['--map-park-q'], dark['--map-park-q'], light['--map-park-ink-q'], dark['--map-park-ink-q']]).toEqual(['#e3f1e5', '#182c20', '#3f6b4c', '#7fb394']);
    expect([ratio(light['--map-park-ink-q']!, light['--map-park-q']!).toFixed(2), ratio(dark['--map-park-ink-q']!, dark['--map-park-q']!).toFixed(2)]).toEqual(['5.26', '6.18']);
    const casing = (v: Record<string, string>) => ['road', 'main', 'fwy'].map((r) => ratio(v['--gw-case']!, v[`--map-${r}-q`]!).toFixed(2));
    expect(casing(light)).toEqual(['3.56', '3.75', '3.59']); expect(casing(dark)).toEqual(['3.93', '4.29', '3.95']);
    const vsPark = (v: Record<string, string>) => Math.min(...LINES.map(([k]) => ratio(v[k]!, v['--map-park-q']!))).toFixed(2);
    expect([vsPark(light), vsPark(dark)]).toEqual(['4.29', '5.82']);
  });
  it('4.3 a quiet street over the quiet PARK is 3:1 too, in both themes (it was 2.78 / 2.81 light and 2.75 / 2.81 dark until the road tokens moved)', () => {
    // `standard` holds every street to 3:1 over a park as well as over the land, and so does the quietened set.
    const over = (v: Record<string, string>) => ['road', 'main', 'fwy'].map((r) => ratio(v[`--map-${r}-q`]!, v['--map-park-q']!));
    for (const v of [light, dark]) for (const r of over(v)) expect(r).toBeGreaterThanOrEqual(3);
    expect(over(light).map((r) => r.toFixed(2))).toEqual(['3.05', '3.21', '3.07']); expect(over(dark).map((r) => r.toFixed(2))).toEqual(['3.05', '3.32', '3.06']);
    // Quiet still means quieter: each quiet street is paler against the land than the street it stands in for.
    for (const v of [light, dark]) for (const r of ['road', 'main', 'fwy']) expect(ratio(v[`--map-${r}-q`]!, v['--map-land']!)).toBeLessThan(ratio(v[`--map-${r}`]!, v['--map-land']!));
  });
  it('4.4 "increase contrast": the eight tones the spec changes, at the ratios it gives against #ffffff and #0c1512, and never less than plain', () => {
    const MORE: [string, string, number, string, number][] = [['--tr-0', '#9b0c23', 8.50, '#ffa099', 9.49], ['--tr-1', '#1e3a8a', 10.36, '#a8c5ff', 10.69], ['--tr-2', '#0b4f4a', 9.41, '#8be6dd', 12.78], ['--tr-3', '#5f330d', 10.68, '#f0c596', 11.60], ['--tr-4', '#831843', 9.65, '#ffb3d7', 11.21], ['--tr-5', '#1e293b', 14.63, '#dbe3ee', 14.35], ['--tr-dpm', '#581c5f', 12.03, '#f0c0f7', 12.01], ['--tr-bike', '#14532d', 9.11, '#a7f3c5', 14.38]];
    expect([moreLight['--map-land'], moreDark['--map-land']]).toEqual(['#ffffff', '#0c1512']);
    for (const [token, lv, lr, dv, dr] of MORE) {
      expect([moreLight[token], moreDark[token]], token).toEqual([lv, dv]);
      expect([ratio(lv, moreLight['--map-land']!).toFixed(2), ratio(dv, moreDark['--map-land']!).toFixed(2)], token).toEqual([lr.toFixed(2), dr.toFixed(2)]);
    }
    for (const [token] of LINES) for (const [plain, more] of [[light, moreLight], [dark, moreDark]] as const) for (const bg of ['--map-land', '--map-park', '--gw-case'])
      expect(`${token} on ${bg}: ${ratio(more[token]!, more[bg]!) >= Math.min(8, ratio(plain[token]!, plain[bg]!)) - 0.005}`).toBe(`${token} on ${bg}: true`);
  });
  it('4.4 forced colours: every subway token is a system colour, as the spec maps them, so the canvas obeys', () => {
    const block = css.slice(css.indexOf('@media (forced-colors: active) {\n  :root'));
    const sys = Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([A-Za-z]+)\s*;/g)].map((m) => [m[1]!, m[2]!]));
    for (const k of ['--tr-0', '--tr-1', '--tr-2', '--tr-3', '--tr-4', '--tr-5', '--tr-dpm', '--tr-coach', '--tr-pr']) expect(sys[k], k).toBe('LinkText');
    for (const k of ['--tr-rail', '--tr-trunk', '--tr-ring']) expect(sys[k], k).toBe('CanvasText');
    expect([sys['--tr-bike'], sys['--tr-fill'], sys['--tr-sel']]).toEqual(['GrayText', 'Canvas', 'Highlight']);
    // and every token the subway code can ask for exists in the plain, dark and forced blocks
    const asked = new Set([...readFileSync(join(__dirname, '../src/subway.ts'), 'utf8').matchAll(/'(--(?:tr|map|gw)-[\w-]+?)'/g)].map((m) => m[1]!));
    for (let i = 0; i < 6; i++) asked.add('--tr-' + i);
    for (const k of asked) if (!k.endsWith('-')) { expect(light[k], `${k} light`).toBeTypeOf('string'); expect(dark[k], `${k} dark`).toBeTypeOf('string'); expect(sys[k], `${k} forced`).toBeTypeOf('string'); }
  });
});
