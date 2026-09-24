// The Areas tab as a map (Kyle, 2026-09-22): the camera that frames one outline, the landing decision, the
// Map/List switch, the two-column laptop layout, and the strip an area page wears and collapses as it is read.
//
// The two pure pieces here — `cameraForArea` (map.ts) and `areasLanding` / `stripAt` (areas.ts) — are the ones
// the iPhone and Android ports re-implement, so the tables below are the shared cases: if the three clients
// ever disagree about where the Areas tab opens, one of them is wrong.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREA_FIT_MARGIN, AREA_MIN_MPP, S_MIN, S_MAX, cameraForArea, wx, wy } from '../src/map.js';
import { AREAS_BAR_PX, AREAS_SETTLE_MS, AREAS_SHRINK_MS, AREAS_STRIP_VH, AREAS_TURN_PX, areasLanding, stripAt, stripSettling, stripStart, type StripScroll } from '../src/areas.js';
import { hoodIndex, type Hood, type Indicators, type Ui } from '../src/hoods.js';

const root = join(__dirname, '../../..');
const src = (name: string) => readFileSync(join(__dirname, '../src/' + name), 'utf8');
const main = src('main.ts');
const css = src('style.css');
const strings = JSON.parse(readFileSync(join(root, 'strings/en.json'), 'utf8')) as Record<string, string>;
/** One unit of the world is one degree of latitude; `S_MIN` is 180 m per pixel (90 until 2026-09-24), which is what pins it. */
const M_PER_UNIT = S_MIN * 180;
const mpp = (s: number) => M_PER_UNIT / s;

/** A rectangle of `w` by `h` degrees with its south-west corner at (lat, lon), as one ring. */
const box = (lat: number, lon: number, h: number, w: number) => [[
  { lat, lon }, { lat, lon: lon + w }, { lat: lat + h, lon: lon + w }, { lat: lat + h, lon }, { lat, lon },
]];

// ---------------------------------------------------------------------------------------------------
// cameraForArea: fit the outline, leave 8 %, and never open closer than 4 m per pixel
// ---------------------------------------------------------------------------------------------------

describe('the camera that frames one area (cameraForArea)', () => {
  const phone = { w: 390, h: 640 }, laptop = { w: 760, h: 620 };

  it('fits the whole outline, with a margin of 8 % on every side', () => {
    // A neighbourhood about 2.2 km tall and 1.6 km wide, on a tall phone: WIDTH is the tighter axis here (the
    // box is 390 by 640), so the outline plus its margin is exactly as wide as the box and there is room to
    // spare above and below.
    const rings = box(42.33, -83.09, 0.02, 0.02);
    const cam = cameraForArea(rings, phone)!;
    const spanY = (wy(42.33) - wy(42.35)) * cam.s, spanX = (wx(-83.07) - wx(-83.09)) * cam.s;
    expect(Math.abs(spanX)).toBeCloseTo(phone.w / (1 + AREA_FIT_MARGIN * 2), 6);
    expect(Math.abs(spanY)).toBeLessThan(phone.h);
    // And it is centred on the outline's own middle.
    expect(cam.cx).toBeCloseTo(wx(-83.08), 9);
    expect(cam.cy).toBeCloseTo(wy(42.34), 9);
  });

  it('8 % is the margin, not 0 and not a guess: the outline never touches the frame', () => {
    expect(AREA_FIT_MARGIN).toBe(0.08);
    const rings = box(42.33, -83.09, 0.02, 0.02);
    const cam = cameraForArea(rings, phone)!;
    const used = Math.abs((wx(-83.07) - wx(-83.09)) * cam.s);
    expect(phone.w - used).toBeCloseTo(phone.w * (2 * AREA_FIT_MARGIN) / (1 + 2 * AREA_FIT_MARGIN), 6);
  });

  it('portrait and landscape are decided by the box it is handed, so the phone can be held either way', () => {
    const rings = box(42.33, -83.09, 0.02, 0.02);
    const tall = cameraForArea(rings, { w: 390, h: 640 })!;
    const wide = cameraForArea(rings, { w: 640, h: 390 })!;
    // Same middle, different scale: the shorter side is what has to hold the outline.
    expect(wide.cx).toBeCloseTo(tall.cx, 9);
    expect(mpp(wide.s)).toBeGreaterThan(mpp(tall.s));
    // Whichever way round, the WHOLE outline is on screen — `min`, never `cover`.
    for (const [cam, v] of [[tall, { w: 390, h: 640 }], [wide, { w: 640, h: 390 }]] as const) {
      expect(Math.abs((wy(42.33) - wy(42.35)) * cam.s)).toBeLessThanOrEqual(v.h + 1e-9);
      expect(Math.abs((wx(-83.07) - wx(-83.09)) * cam.s)).toBeLessThanOrEqual(v.w + 1e-9);
    }
  });

  it('a tiny neighbourhood is not opened on six houses: 4 metres per pixel is as close as it goes', () => {
    // About 110 m across — smaller than the smallest of the City's 205, and the clamp still holds.
    const cam = cameraForArea(box(42.34, -83.08, 0.001, 0.001), phone)!;
    expect(mpp(cam.s)).toBeCloseTo(AREA_MIN_MPP, 9);
    expect(AREA_MIN_MPP).toBe(4);
    expect(cam.s).toBeLessThanOrEqual(S_MAX);
  });

  it('the whole service area is not opened wider than the camera allows: 180 metres per pixel', () => {
    // Every city and township a DDOT or SMART bus stops in or runs through is about 0.69° tall and 0.87° wide; on a phone that is
    // past the map's own far limit.
    const cam = cameraForArea(box(42.11, -83.57, 0.69, 0.87), phone)!;
    expect(mpp(cam.s)).toBeCloseTo(180, 6);
    expect(cam.s).toBeCloseTo(S_MIN, 9);
    // A laptop's wider box gets closer, and is still inside the limits.
    const big = cameraForArea(box(42.11, -83.57, 0.69, 0.87), laptop)!;
    expect(mpp(big.s)).toBeLessThan(180);
    expect(big.s).toBeGreaterThanOrEqual(S_MIN);
    // Detroit alone now opens inside the limit on a phone.
    expect(mpp(cameraForArea(box(42.255, -83.288, 0.195, 0.377), phone)!.s)).toBeLessThan(180);
  });

  it('an area the bundle carries no outline for moves nothing at all', () => {
    expect(cameraForArea([], phone)).toBeNull();
    expect(cameraForArea([[]], phone)).toBeNull();
  });

  it('a degenerate outline — one point — is a camera, not a division by zero', () => {
    const cam = cameraForArea([[{ lat: 42.34, lon: -83.08 }]], phone)!;
    expect(Number.isFinite(cam.s)).toBe(true);
    expect(mpp(cam.s)).toBeCloseTo(AREA_MIN_MPP, 9);
  });
});

// ---------------------------------------------------------------------------------------------------
// The landing decision table
// ---------------------------------------------------------------------------------------------------

describe('what the Areas tab lands on', () => {
  const CASES = [
    { why: 'nobody has said where they are: the location card, over the anchor view', o: { located: false, area: false, outside: false }, want: 'ask' },
    { why: 'a position allowed this session, inside a neighbourhood: that polygon', o: { located: true, area: true, outside: false }, want: 'area' },
    { why: 'a typed cross street or ZIP is the same answer by another road', o: { located: true, area: true, outside: false }, want: 'area' },
    { why: 'a fix from beyond the four cities: the plain message, and the map stays', o: { located: false, area: false, outside: true }, want: 'outside' },
    { why: 'a point inside the box that no outline holds is the same plain message', o: { located: true, area: false, outside: false }, want: 'outside' },
    { why: 'outside wins even if an older area is still remembered', o: { located: true, area: true, outside: true }, want: 'outside' },
  ] as const;
  for (const c of CASES) it(c.why, () => expect(areasLanding(c.o)).toBe(c.want));

  it('the map is never taken away: every case is still a map with something said over it', () => {
    // There is no fourth answer, and none of the three is "show a list instead".
    expect(new Set(CASES.map((c) => areasLanding(c.o)))).toEqual(new Set(['ask', 'area', 'outside']));
    // Outside the service area the map stays, and the ways in under it carry the sentence the app already uses.
    expect(main).toContain("${here ? '' : `<div class=\"areasask\">${locChip()}</div>`}");
    expect(strings['map.locate_outside']).toContain('The map stays where it is.');
  });
});

// ---------------------------------------------------------------------------------------------------
// The collapsing strip
// ---------------------------------------------------------------------------------------------------

describe('the strip collapses as the page is read and comes back only at the top', () => {
  const walk = (ys: number[]) => ys.reduce<StripScroll[]>((acc, y) => [...acc, stripAt(acc[acc.length - 1] ?? stripStart(), y)], []);

  it('at the top of the page the map is always whole', () => {
    expect(stripStart().state).toBe('open');
    expect(stripAt({ state: 'shut', y: 900, pivot: 0 }, 0).state).toBe('open');
    expect(stripAt({ state: 'shut', y: 900, pivot: 0 }, -40).state).toBe('open');   // a rubber-banded over-scroll
  });

  it('reading down shuts it, and scrolling back up does not bring the map back until the top (Kyle, 2026-09-23)', () => {
    const down = walk([0, 40, 200, 600]);
    expect(down[down.length - 1]!.state).toBe('shut');
    // All the way back up the page, a long way past any turn: still shut, right up to the last pixel.
    let at = down[down.length - 1]!;
    for (const y of [560, 520, 300, 100, 1]) { at = stripAt(at, y); expect(at.state, `at ${y}`).toBe('shut'); }
    // The top is what opens it.
    expect(stripAt(at, 0).state).toBe('open');
    // And down again after a turn shuts it again.
    expect(stripAt(stripAt(at, 40), 400).state).toBe('shut');
  });

  it('a wobble at the start of a read does not shut it: 8 px is the threshold', () => {
    expect(AREAS_TURN_PX).toBe(8);
    expect(stripAt(stripStart(), 4).state).toBe('open');     // 4 px down is not reading
    expect(stripAt(stripAt(stripStart(), 4), 10).state).toBe('shut');   // 10 px is
  });

  it('it never moves the page: the machine answers with a state, and nothing else', () => {
    const next = stripAt({ state: 'open', y: 100, pivot: 0 }, 300);
    expect(Object.keys(next).sort()).toEqual(['pivot', 'state', 'y']);
    expect(next.y).toBe(300);                                // what it was told, not something it decided
    // And the driver only ever toggles a class — it never touches scrollTop, scrollTo or scrollIntoView.
    const driver = main.slice(main.indexOf('let stripChangedAt = 0;'), main.indexOf('let stripChangedAt = 0;') + 1200);
    for (const forbidden of ['scrollTo(', 'scrollTop', 'scrollIntoView', 'render(']) expect(driver, forbidden).not.toContain(forbidden);
    expect(driver).toContain("page.classList.toggle('shut'");
    expect(driver).toContain('{ passive: true }');
    // And it never waits for a frame: a page the browser has stopped painting still answers a scroll.
    expect(driver).not.toContain('requestAnimationFrame');
  });

  it('the page rearranging itself after a collapse is not a person turning round', () => {
    // Shutting the strip makes the document shorter, and a browser scrolled near the bottom moves the scroll up
    // by exactly that much. Read as a scroll UP it opens the strip, which makes the page taller, which moves the
    // scroll back down: the first live run flickered between the two about sixty times a second.
    expect(AREAS_SETTLE_MS).toBe(AREAS_SHRINK_MS + 80);
    expect(stripSettling(1000, 1000)).toBe(true);
    expect(stripSettling(1000, 1000 + AREAS_SETTLE_MS - 1)).toBe(true);
    expect(stripSettling(1000, 1000 + AREAS_SETTLE_MS)).toBe(false);
    // The driver stamps the clock only when the state really changed, and the top of the page is the one thing
    // that answers through a settling period — scrolled all the way back is never ambiguous.
    const driver = main.slice(main.indexOf('let stripChangedAt = 0;'), main.indexOf('let stripChangedAt = 0;') + 1200);
    expect(driver).toContain('if (next.state !== strip.state) stripChangedAt = at;');
    expect(driver).toContain('if (y > 0 && stripSettling(stripChangedAt, at))');
  });

  it('the numbers the ports need are named, and the stylesheet uses those same numbers', () => {
    expect(AREAS_STRIP_VH).toBe(38);
    expect(AREAS_BAR_PX).toBe(48);
    expect(css).toContain('--areas-strip-h:38dvh');
    expect(css).toContain('--areas-bar-h:3rem');            // 48 px at the root font size
    expect(css).toContain('main.areapage.shut .areastrip { height:var(--areas-bar-h); }');
  });

  it('reduced motion still collapses and still comes back — it just does not travel', () => {
    expect(css).toContain('@media (prefers-reduced-motion:reduce) { .areastrip { transition:none; } }');
    // The state machine has no notion of motion at all, so it behaves identically either way.
    expect(stripAt(stripStart(), 400).state).toBe('shut');
  });

  it('the collapse is visual only: the map stays in the page, and the bar keeps Back reachable', () => {
    expect(css).toContain('.areastrip { position:sticky');
    expect(css).not.toContain('.areastrip { display:none');
    expect(main).toContain('<div class="areabar"><button class="iconbtn" data-back');
    // A keyboard cursor never lands under the pinned bar.
    expect(css).toContain('main.areapage :focus-visible { scroll-margin-block-start:calc(var(--areas-bar-h) + .75rem); }');
  });
});

// ---------------------------------------------------------------------------------------------------
// The three faces: the switch, the list, and the laptop's two columns
// ---------------------------------------------------------------------------------------------------

describe('the Map/List switch', () => {
  it('is two real buttons, each saying whether it is the one showing', () => {
    const fn = main.slice(main.indexOf('function areasSwitch('), main.indexOf('/** The tab\'s map:'));
    expect(fn).toContain('aria-pressed="${face === id}"');
    expect(fn).toContain('role="group" aria-label="${T(\'hood.switch_label\')}"');
    expect(fn).toContain("data-areasview=");
    // Both words exist, in every language, and neither is longer than a small control.
    for (const l of ['en', 'es', 'ar', 'bn']) {
      const tbl = JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
      for (const k of ['hood.switch_map', 'hood.switch_list', 'hood.switch_label', 'hood.say_map', 'hood.say_list', 'hood.back_map', 'hood.here_is', 'hood.list_head']) {
        expect(tbl[k], `${l} ${k}`).toBeTypeOf('string');
      }
      expect([...tbl['hood.switch_list']!].length, l).toBeLessThanOrEqual(12);
      expect(tbl['hood.here_is']).toContain('{name}');
    }
  });

  it('rides at the head of the map\'s own control stack, so it is top-right — and top-left in Arabic', () => {
    // The stack is placed with `inset-inline-end`, which is the end of the line in whatever language the page
    // is in: the top-right corner of an English screen and the top-left of an Arabic one. Kyle asked for "top
    // right"; the mirrored position is the same corner for a right-to-left reader, so that is what it does.
    expect(css).toContain('.maptools { position:absolute; inset-block-start:.5rem; inset-inline-end:.5rem;');
    expect(css).toContain('.maptools { justify-items:end; }');
    expect(main).toContain('areasMap(d, mine, areasSwitch(\'map\'))');
    expect(src('map.ts')).toContain("tools.innerHTML = (spec.lead ?? '') + btn('in', '+', S.zoomIn)");
    // 44 px: `.areasw` is 2.5 rem tall inside a padded group, which clears the target size either way.
    expect(css).toContain('.areasw { min-width:3.25rem; min-height:2.5rem;');
  });

  it('is offered on a phone only, and the choice lives no longer than the page does', () => {
    // A laptop is shown both at once, so `areasFace` never returns to the switch there.
    expect(main).toContain("const areasFace = (): 'split' | 'map' | 'list' => (wide.matches ? 'split' : areasView);");
    expect(main).toContain("let areasView: 'map' | 'list' = 'map';");
    // Nothing writes it down: no storage of any kind, and it is not in the URL — the map is the default every
    // launch, which is what Kyle asked for.
    const handler = main.slice(main.indexOf('else if (el.dataset.areasview)'), main.indexOf('else if (el.dataset.areasview)') + 400);
    for (const forbidden of ['idbSet', 'Storage', 'navigate(', 'replaceState']) expect(handler, forbidden).not.toContain(forbidden);
    expect(handler).toContain('refocusSel = `[data-areasview="${areasView}"]`');    // focus moves sensibly
    expect(handler).toContain("announce(t(areasView === 'map' ? 'hood.say_map' : 'hood.say_list'))");
  });
});

// A list fixture, built the way hoods-tab.test.ts builds one.
const ORIGIN: [number, number] = [-83.32, 42.22];
const hood = (name: string, district: number | null): Hood => ({
  id: 'nbh_' + name.toLowerCase().replace(/ /g, '_'), name, district, center: [42.3, -83.1], rings: [],
  help: { total: 0, by: {}, nearest_miles: {}, none_listed_yet: [], coverage_checked: false },
  places: { parks: 0, rec_centers: 0, greenway_open: 0 }, years: {},
});
const ui: Ui = {
  t: (k, p = {}) => (strings[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')),
  esc: (x) => String(x), own: (x) => String(x), date: (d) => d, icon: (n) => `<svg data-ic="${n}"></svg>`,
  link: (u, l) => `<a href="${u}">${l}</a>`, go: (v) => `data-go='${JSON.stringify(v)}'`, map: () => '',
};
const srcRow = { name: 'City of Detroit neighborhoods', url: 'https://example.org/n', last_edited: '2026-09-17' };
const data = (list: Hood[]): Indicators => ({
  sources: { neighborhoods: srcRow, sales: srcRow, permits: srcRow }, stats_fetched_at: '2026-09-18', first_year: 2024,
  partial_year: 2026, near_miles: 0.5, origin: ORIGIN, city: {}, segments: {}, neighborhoods: list,
});
const OPTS = { order: 'abc' as const, query: '', located: false, zip: '', mine: null, locHtml: '', mapHtml: '' };

describe('the list, on a phone and beside the map on a laptop', () => {
  const d = data([hood('Bagley', 2), hood('Corktown', 6)]);

  it('the phone list is a whole page with a heading and the switch on it', () => {
    const html = hoodIndex(d, ui, { ...OPTS, view: 'list', switchHtml: '<div class="areaswitch"></div>' });
    expect(html.startsWith('<main>')).toBe(true);
    expect(html).toContain('<h1 class="page" tabindex="-1">');
    expect(html).toContain('<div class="areaswitch"></div>');
    expect(html).toContain(`<h2>${strings['hood.list_head']}</h2>`);
    expect(html).toContain('<ul class="rows">');
  });

  it('the laptop column repeats neither the page heading nor the switch', () => {
    const html = hoodIndex(d, ui, { ...OPTS, view: 'column' });
    expect(html.startsWith('<div class="arealist">')).toBe(true);
    expect(html).not.toContain('<main');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('areaswitch');
    // It is still a proper list under a heading, which is what a screen reader navigates by.
    expect(html).toContain(`<h2>${strings['hood.list_head']}</h2>`);
    expect(html).toContain('<ul class="rows">');
  });

  it('the area whose page was last opened is the current row, and it is the same one the map picks out', () => {
    const html = hoodIndex(d, ui, { ...OPTS, view: 'column', pick: 'nbh_corktown' });
    expect(html).toMatch(/<button class="row on" aria-current="true" data-go='\{"v":"hood","id":"nbh_corktown"\}'/);
    expect(html).not.toContain('"id":"nbh_bagley"\'aria-current');
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    // One source of truth: the map is handed the same id, and the same outline is what it opens on.
    expect(main).toContain("const on = (areaPick ? areaById(d, areaPick) : null) ?? mine;");
    expect(main).toContain("selected: on?.id ?? ''");
    expect(main).toContain('openArea: areasGlide ? undefined : rings');
  });

  it('a row and an outline are two doors to one place: both open that area\'s own page', () => {
    const html = hoodIndex(d, ui, { ...OPTS, view: 'column', pick: '' });
    expect(html).toContain(`data-go='{"v":"hood","id":"nbh_bagley"}'`);
    expect(main).toContain("onArea: (id) => { areaPick = id; navigate({ v: 'hood', id }); },");
  });
});

describe('the two-column layout a laptop gets (≥ 64 rem)', () => {
  const wideBlock = css.slice(css.indexOf('@media (min-width:64rem)'), css.indexOf('@media (min-width:100rem)'));

  it('the map is on the left and the list on the right, in the Map tab\'s own column widths', () => {
    expect(wideBlock).toContain('.maptop { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);');
    expect(wideBlock).toContain('.areas .maptop > .areasstage { position:sticky; top:5rem; }');
    expect(wideBlock).toContain('.areas .areasstage > .mapbox:not(.big) .mapframe { flex:none; height:min(74vh,40rem);');
    // The list scrolls on its own, so the map never leaves the screen while 205 names go past.
    expect(wideBlock).toContain('.areas .arealist { max-height:min(74vh,40rem); overflow-y:auto;');
  });

  it('an area page keeps the map column and puts the page where the list was — no strip on a laptop', () => {
    expect(wideBlock).toContain('main.areapage { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);');
    expect(wideBlock).toContain('main.areapage > .areastrip { grid-column:1;');
    expect(wideBlock).toContain('main.areapage.shut > .areastrip { height:min(74vh,40rem); }');   // nothing collapses here
    // And the collapse driver does not even run at this width.
    expect(main).toContain('if (!page || wide.matches) return;');
  });

  it('the keyboard walks the map and its controls before the list, because that is the reading order', () => {
    // The map's stage is the first child of `.maptop` in the markup, and the grid does not reorder it.
    const tab = main.slice(main.indexOf("if (face === 'split')"), main.indexOf("if (face === 'list')"));
    expect(tab.indexOf('areasMap(')).toBeLessThan(tab.indexOf('mapside'));
    // No `order:` and no `direction:` anywhere in the Areas rules: what the eye reads is what the keyboard walks.
    expect(wideBlock.slice(wideBlock.indexOf('.areas .maptop'))).not.toMatch(/[;{]\s*(order|direction):/);
  });
});

// ---------------------------------------------------------------------------------------------------
// The map itself: the extra control, the tap that opens a page, and the glide to an outline
// ---------------------------------------------------------------------------------------------------

describe('the Areas map, driven for real', () => {
  const W = 390, H = 640;
  const rings = box(42.33, -83.09, 0.02, 0.02);
  async function open(more: Record<string, unknown> = {}, media: Record<string, boolean> = {}) {
    const { FakeEl, installPage } = await import('./fakes.js');
    const { MapView, focusArea } = await import('../src/map.js');
    const { baseSpec, serveBasemap } = await import('./mapfixture.js');
    const page = installPage({ width: W, height: H });
    Object.assign(page.media, media);
    const key = 'areas' + Math.random().toString(36).slice(2);
    const spec = baseSpec(key, [], { segments: [], dots: [], areas: [{ id: 'nbh_x', name: 'Bagley', sub: 'Council District 2', rings }], ...more });
    const el = new FakeEl('div');
    const view = new MapView(el as unknown as HTMLElement, spec, serveBasemap());
    await new Promise((ok) => setTimeout(ok, 25));
    const priv = view as unknown as { cx: number; cy: number; s: number; pick(q: { x: number; y: number }): void; note: { innerHTML: string } };
    return { key, view, el, page, focusArea, priv, cam: () => ({ cx: priv.cx, cy: priv.cy, s: priv.s }) };
  }

  it('the extra control is drawn first in the control stack, above the zoom keys', async () => {
    const m = await open({ lead: '<div class="areaswitch">SWITCH</div>' });
    const tools = m.el.children[0]!.children.find((c) => c.className === 'maptools')!;
    expect(tools.innerHTML.startsWith('<div class="areaswitch">SWITCH</div>')).toBe(true);
    expect(tools.innerHTML.indexOf('SWITCH')).toBeLessThan(tools.innerHTML.indexOf('data-map-act="in"'));
    m.view.destroy();
  });

  it('opening on an outline frames that outline, not the whole fit area', async () => {
    const m = await open({ openArea: rings });
    expect(m.cam().cx).toBeCloseTo(wx(-83.08), 6);
    expect(m.cam().cy).toBeCloseTo(wy(42.34), 6);
    expect(Math.abs((wx(-83.07) - wx(-83.09)) * m.cam().s)).toBeCloseTo(W / (1 + AREA_FIT_MARGIN * 2), 4);
    m.view.destroy();
  });

  it('a tap on an outline tells the page, and draws no "See details" card of its own', async () => {
    const told: string[] = [];
    const m = await open({ openArea: rings, onArea: (id: string) => told.push(id) });
    m.priv.pick({ x: W / 2, y: H / 2 });
    expect(told).toEqual(['nbh_x']);
    expect(m.priv.note.innerHTML).not.toContain('mappick');
    m.view.destroy();
  });

  it('with no `onArea` — every other map in the app — the card is exactly what it always was', async () => {
    const m = await open({ openArea: rings });
    m.priv.pick({ x: W / 2, y: H / 2 });
    expect(m.priv.note.innerHTML).toContain('mappick');
    expect(m.priv.note.innerHTML).toContain('Bagley');
    m.view.destroy();
  });

  it('an answer that arrives after the map has opened glides to the outline', async () => {
    const m = await open();                                  // opened on the fit area, not on the outline
    const before = m.cam().s;
    expect(m.focusArea(m.key, 'nbh_x', rings)).toBe(true);
    expect(m.page.frames).toBeGreaterThan(0);                // it travelled
    expect(m.cam().s).not.toBeCloseTo(before, 6);
    expect(m.cam().cy).toBeCloseTo(wy(42.34), 4);
    m.view.destroy();
  });

  it('under Reduce Motion it simply arrives (WCAG 2.3.3)', async () => {
    const m = await open({}, { 'prefers-reduced-motion': true });
    const before = m.page.frames;
    m.focusArea(m.key, 'nbh_x', rings);
    // Two frames: the redraw every change asks for, and the one that checks the box was measured right
    // (`settle`). Neither is a journey — the camera is already where it was asked to be.
    expect(m.page.frames - before).toBeLessThanOrEqual(2);
    expect(m.cam().cy).toBeCloseTo(wy(42.34), 6);
    m.view.destroy();
  });

  it('a map that is not on the screen is not moved, and nothing is kept for later', async () => {
    const m = await open();
    expect(m.focusArea('a-map-that-is-not-open', 'nbh_x', rings)).toBe(false);
    m.view.destroy();
  });
});

// ---------------------------------------------------------------------------------------------------
// Nothing location-derived is written down (docs/08)
// ---------------------------------------------------------------------------------------------------

describe('what the Areas tab leaves behind: nothing', () => {
  it('the tab\'s own rules cannot store, send, or navigate', () => {
    const areas = src('areas.ts');
    for (const forbidden of ['idbSet', 'idbGet', 'indexedDB', 'localStorage', 'sessionStorage', 'fetch(', 'pushState', 'replaceState', 'location.', 'navigator']) {
      expect(areas, forbidden).not.toContain(forbidden);
    }
    // It is handed booleans and a scroll offset, and hands back a word. Nothing else crosses the door.
    expect(areas).toContain('export function areasLanding(o: { located: boolean; area: boolean; outside: boolean }): AreasLanding');
    expect(areas).toContain('export function stripAt(was: StripScroll, y: number): StripScroll');
  });

  it('the area a phone worked out is a variable, and the only thing that reaches the history is its id', () => {
    const tab = main.slice(main.indexOf('const AREAS_MAP_KEY'), main.indexOf('function hoodSaid('));
    for (const forbidden of ['idbSet', 'localStorage', 'sessionStorage', 'fetch(', 'pushState', 'replaceState']) {
      expect(tab, forbidden).not.toContain(forbidden);
    }
    expect([...tab.matchAll(/navigate\(([^)]*)\)/g)].map((m) => m[1])).toEqual(["{ v: 'hood', id }"]);
    // The fix itself only ever becomes a camera and an id, both of which die with the page.
    const glide = main.slice(main.indexOf('function glideToArea('), main.indexOf('function glideToArea(') + 500);
    for (const forbidden of ['idbSet', 'fetch(', 'JSON.stringify', 'announce(']) expect(glide, forbidden).not.toContain(forbidden);
  });
});
