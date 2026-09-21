// What the fixes from the web review of 2026-09-20 actually DO, held to the behaviour rather than to the shape
// of the line that does it. The vitest environment here is Node with no DOM, so anything that walks a page is
// given a small fixture tree of its own (`node()` below) built from the handful of Element members the code
// touches. Everything else is a plain function with plain values.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, MAP_GROUPS, NEEDS, PRIVATE_TOPS, SENSITIVE, TABS, isPrivate, mapDrawable } from '../src/needs.js';
import { LINKS } from '../src/links.js';
import { LISTING_KINDS, PLACE_KINDS } from '../src/report.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES } from '../src/propose.js';
import { canSave, canShare } from '../src/saved.js';
import { safeUrl } from '../src/url.js';
import { focusSelector, type FocusEl } from '../src/focus.js';
import { LAYER_STYLE } from '../src/layerstyle.js';
import { coverTargets, esc, focusableDots, isLiveRegion, mapKey, orderFeatures } from '../src/map.js';
import { langPicker } from '../src/i18n.js';
import { hoodPage, SEMCOG_NOTICE, type Hood, type Indicators } from '../src/hoods.js';

const root = join(__dirname, '../../..');
const table = (l: string) => JSON.parse(readFileSync(join(root, `strings/${l}.json`), 'utf8')) as Record<string, string>;
const LANGS = ['en', 'es', 'ar', 'bn'] as const;

// ---------------------------------------------------------------------------------------------------
// A fixture page. Only what the code under test reads: children, parent, containment, attributes, inert.
// ---------------------------------------------------------------------------------------------------
class Node_ {
  children: Node_[] = [];
  parentElement: Node_ | null = null;
  inert = false;
  attrs: Record<string, string>;
  constructor(public readonly name: string, attrs: Record<string, string> = {}, kids: Node_[] = []) {
    this.attrs = attrs;
    for (const k of kids) { k.parentElement = this; this.children.push(k); }
  }
  hasAttribute(a: string) { return a in this.attrs; }
  getAttribute(a: string) { return this.attrs[a] ?? null; }
  contains(n: unknown): boolean { return n === this || this.children.some((c) => c.contains(n)); }
}
const node = (name: string, attrs?: Record<string, string>, kids?: Node_[]) => new Node_(name, attrs, kids);
const el = (n: Node_) => n as unknown as Element;

describe('the full-screen map is a real overlay, and the app can still speak from behind it', () => {
  // #app > main > .maptop > .mapbox, with the top bar and the rail beside it, and the one live region outside
  // #app entirely (main.ts appends it to <body> so a redraw can never destroy it).
  const build = () => {
    const mapbox = node('div.mapbox');
    const body = node('body', {}, [
      node('div#app', {}, [
        node('nav.tabs'),
        node('header.top', {}, [node('button.urgent')]),
        node('main', {}, [node('h1'), node('div.maptop', {}, [mapbox, node('div.mapside', {}, [node('form.layers')])])]),
      ]),
      node('p.vh', { role: 'status', 'aria-live': 'polite' }),
      node('script'),
    ]);
    return { body, mapbox };
  };

  it('covers the top bar, the rail and the rest of the page, and nothing that holds the map', () => {
    const { body, mapbox } = build();
    const covered = coverTargets(el(mapbox), el(body)).map((n) => (n as unknown as Node_).name);
    // Everything beside the map, at every level between it and the page.
    expect(covered).toContain('nav.tabs');
    expect(covered).toContain('header.top');
    expect(covered).toContain('script');
    expect(covered).toContain('h1');
    expect(covered).toContain('div.mapside');
    // Never the map itself, and never anything the map is inside: those would take the map down with them.
    for (const keep of ['div.mapbox', 'div.maptop', 'main', 'div#app']) expect(covered, keep).not.toContain(keep);
    // Each one exactly once, so releasing it puts everything back.
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('never covers the live region: an announcement still reaches a screen reader while the map is open', () => {
    const { body, mapbox } = build();
    const live = body.children.find((n) => n.name === 'p.vh')!;
    expect(isLiveRegion(el(live))).toBe(true);
    expect(coverTargets(el(mapbox), el(body))).not.toContain(el(live));
    // Either marking is enough: main.ts sets both, and one of them is the only thing standing between a person
    // and silence if the other is ever dropped.
    expect(isLiveRegion(el(node('p', { role: 'status' })))).toBe(true);
    expect(isLiveRegion(el(node('p', { 'aria-live': 'polite' })))).toBe(true);
    expect(isLiveRegion(el(node('p')))).toBe(false);
  });

  it('leaves alone anything a screen already made inert, so closing the map does not un-hide it', () => {
    const { body, mapbox } = build();
    const rail = body.children[0]!.children[0]!;
    rail.inert = true;
    expect(coverTargets(el(mapbox), el(body))).not.toContain(el(rail));
  });

  it('the map\'s own words are escaped before they become markup or a label', () => {
    // These come from strings/*.json, where an apostrophe is ordinary punctuation, and they go straight into
    // innerHTML and into aria-label.
    expect(esc(`Don't <b>zoom</b> & "stop"`)).toBe('Don&#39;t &lt;b&gt;zoom&lt;/b&gt; &amp; &quot;stop&quot;');
    expect(esc('plain words')).toBe('plain words');
  });
});

// ---------------------------------------------------------------------------------------------------
// The language control (Kyle, 2026-09-20): one line in the top bar, not a row of its own under it.
// ---------------------------------------------------------------------------------------------------
describe('choosing a language is one control on one line, and the platform draws the list', () => {
  const esc = (s: string) => String(s).replace(/[&<>"\']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const render = (current: 'en' | 'es' | 'ar' | 'bn') => langPicker(current, 'Language', '<svg aria-hidden="true"></svg>', esc);

  it('one row: a label, a decorative globe and a native select — no menu of our own to get wrong', () => {
    const html = render('en');
    expect(html.startsWith('<label class="langpick">')).toBe(true);
    expect(html.endsWith('</select></label>')).toBe(true);
    // Exactly one control, and it is a real <select>: the operating system draws the list, which is what makes
    // it work under Switch Control and on a cheap Android phone.
    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).not.toMatch(/aria-expanded|role="menu"|<button/);
    // Its name is exactly "Language", so it reads as "Language, English, pop-up button" (4.1.2). It is an
    // aria-label and not text inside the <label>, because a label that wraps a select takes the select's own
    // options into the name it computes — "Language English Español العربية বাংলা" (found live, 2026-09-21).
    expect(html).toContain('aria-label="Language"');
    expect(html).not.toContain('<span class="vh">');
    expect(html).toContain('aria-hidden="true"');                     // the globe says nothing
  });

  it('four options, each naming its own language in its own language, each carrying its own lang (3.1.2)', () => {
    const html = render('en');
    const options = [...html.matchAll(/<option value="(\w+)" lang="(\w+)"([^>]*)>([^<]+)<\/option>/g)];
    expect(options).toHaveLength(4);
    expect(options.map((m) => [m[1], m[2], m[4]])).toEqual([
      ['en', 'en', 'English'], ['es', 'es', 'Español'], ['ar', 'ar', 'العربية'], ['bn', 'bn', 'বাংলা'],
    ]);
    // Every language is offered on every screen, and the list is the app's own list, not a second copy of it.
    expect(options.map((m) => m[1])).toEqual(LANGS.map((l) => l));
  });

  it('the one in use is the one selected, whichever it is', () => {
    for (const code of LANGS) {
      const picked = [...render(code).matchAll(/<option value="(\w+)"[^>]*?( selected)?>/g)].filter((m) => m[2]);
      expect(picked.map((m) => m[1]), code).toEqual([code]);
    }
  });

  it('it is in the top bar, on the screens a person browses from, and never inside the full-screen map', () => {
    const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    const map = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
    // One row: the bar itself, with the control between the name (or the page title) and Urgent help.
    expect(main).toContain('</div>${picker}${urgentBtn}</header>');
    expect(main).toContain('${picker}${quickExit ? `<button class="exit" data-exit>');
    expect(main).toContain("const showLang = v.v === 'tab' || v.v === 'about';");
    // The old row under the bar is gone from every screen that had it.
    expect(main).not.toContain('langBtn');
    expect(main).not.toContain('class="langrow"');
    // The full-screen map copies only the two controls that must never be more than one tap away.
    expect(map).toContain("const wanted = ['[data-exit]', '.urgent'].map(find)");
    expect(map).not.toContain('langpick');
  });

  it('the choice still stays on the phone, still says so when it cannot be fetched, and keeps the cursor', () => {
    const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    expect(main).toContain("refocusSel = '[data-lang-select]';");
    expect(main).toContain("void setLang(next).then((ok) => { langOffline = !ok; render(false); announce(t(ok ? 'lang.changed' : 'lang.needs_net')); });");
    expect(readFileSync(join(__dirname, '../src/i18n.ts'), 'utf8')).toContain("idbSet('lang'");
    // A printed page has no language control on it.
    expect(readFileSync(join(__dirname, '../src/style.css'), 'utf8')).toMatch(/@media print[\s\S]*\.langpick/);
  });
});

// ---------------------------------------------------------------------------------------------------
// The picture answers to a keyboard and to a switch (WCAG 2.1.1). The text list under every map is still
// the equivalent and still complete; this is the map itself becoming operable rather than an ornament.
// ---------------------------------------------------------------------------------------------------
describe('the map has a roving focus, and it is allowed nowhere the map is not', () => {
  const dot = (label: string, category: string, d: number) => ({ kind: 'dot' as const, route: 0, d, label, category, lat: 42.33, lon: -83.05 });

  it('greenway stretches first, in route order; then the places, nearest the middle of the screen first', () => {
    const list = [
      dot('Furthest pantry', 'food', 300),
      { kind: 'segment' as const, route: 2, d: 0, label: 'Dequindre Cut, north' },
      dot('Nearest pantry', 'food', 12),
      { kind: 'segment' as const, route: 0, d: 0, label: 'Riverwalk' },
      dot('Middle clinic', 'health', 140),
      { kind: 'segment' as const, route: 1, d: 0, label: 'Dequindre Cut, south' },
    ];
    expect(orderFeatures(list).map((f) => f.label)).toEqual([
      'Riverwalk', 'Dequindre Cut, south', 'Dequindre Cut, north',
      'Nearest pantry', 'Middle clinic', 'Furthest pantry',
    ]);
    // and the order does not depend on the order they were found in
    expect(orderFeatures([...list].reverse()).map((f) => f.label)).toEqual(orderFeatures(list).map((f) => f.label));
  });

  it('the ring can never land on a row the map is not allowed to draw — the same predicate, not a second copy', () => {
    const dots = [
      { lat: 42.33, lon: -83.05, label: 'Capuchin Soup Kitchen', category: 'food.meal' },
      { lat: 42.34, lon: -83.06, label: 'A DV shelter', category: 'shelter.dv' },
      { lat: 42.35, lon: -83.07, label: 'A crisis line', category: 'health.mental' },
      { lat: 42.36, lon: -83.08, label: 'A treatment program', category: 'treatment.detox' },
      { lat: 42.37, lon: -83.09, label: 'After an assault', category: 'assault' },
      { lat: 42.38, lon: -83.10, label: 'A warming center', category: 'rec' },
    ];
    expect(focusableDots(dots).map((d) => d.label)).toEqual(['Capuchin Soup Kitchen', 'A warming center']);
    // Exactly what mapDrawable itself says, so there is one rule and not two.
    expect(focusableDots(dots)).toEqual(mapDrawable(dots, MAP_GROUPS.flatMap((g) => g.tops)));
    // Fails closed: a dot that never said what kind of place it is is not walked either.
    expect(focusableDots([{ lat: 42.33, lon: -83.05, label: 'Unlabelled' }])).toEqual([]);
  });

  it('the keys: N and P walk, the arrows still pan, Tab still leaves, and a modifier is never ours', () => {
    const k = (key: string, mods: Record<string, boolean> = {}) => mapKey({ key, ...mods });
    expect(k('n')).toBe('next'); expect(k('N')).toBe('next');
    expect(k('p')).toBe('prev'); expect(k('P')).toBe('prev');
    expect(k('Enter')).toBe('open'); expect(k(' ')).toBe('open');
    expect(k('Escape')).toBe('escape');
    // 2.5.7: the arrows are how the map moves without dragging. Driving the list with them would take that away.
    for (const [key, act] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down']]) expect(k(key!)).toBe(act);
    expect(k('+')).toBe('in'); expect(k('=')).toBe('in'); expect(k('-')).toBe('out');
    // 2.1.2: nothing about Tab is the map's business, so Tab always walks out of it.
    expect(k('Tab')).toBeNull();
    expect(k('Tab', { shiftKey: true })).toBeNull();
    // 2.1.4: a letter with a modifier belongs to the browser or to a screen reader.
    for (const mod of ['metaKey', 'ctrlKey', 'altKey']) { expect(k('n', { [mod]: true })).toBeNull(); expect(k('p', { [mod]: true })).toBeNull(); }
    expect(k('q')).toBeNull();
  });

  it('what the map source actually does with those actions, and what it says while doing it', () => {
    const src = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
    // The ring is the keyboard's cursor: a finger or a mouse puts it away, and so does leaving the picture.
    expect(src).toContain("c.addEventListener('blur', () => { if (this.ringId) { this.ringId = ''; this.redraw(); } });");
    expect(src).toContain("c.addEventListener('pointerdown', (e) => { if (this.ringId) { this.ringId = ''; this.redraw(); }");
    // 2.4.11: a ring at the very edge of the canvas is a ring that is obscured, so the map moves first.
    expect(src).toContain('if (cx < m || cy < m || cx > this.w - m || cy > this.h - m) this.pan(this.w / 2 - cx, this.h / 2 - cy);');
    // 2.4.13: 3 px of ring with 1.5 px of casing either side, so it keeps its 3:1 over a street or a park.
    expect(src).toContain('c.strokeStyle = case_; c.lineWidth = 6; path(); c.stroke();');
    expect(src).toContain('c.strokeStyle = focus; c.lineWidth = 3; path(); c.stroke();');
    // It is announced through the map's own live region, with the same words a tap produces plus what Enter does.
    expect(src).toContain("this.note.setAttribute('aria-live', 'polite')");
    const said = src.slice(src.indexOf('this.say(`<div class="mappick">'));
    expect(said.slice(0, said.indexOf('\n'))).toMatch(/esc\(f\.label\)[\s\S]*esc\(f\.sub\)[\s\S]*data-go[\s\S]*esc\(S\.focusHint\)/);
    // Enter opens it through the app's own handling, so there is no second copy of "what a map card does".
    // (In the subway map style a feature may carry `sel` instead — a route to choose — and nothing else changes.)
    expect(src).toContain("    this.note.querySelector<HTMLElement>('[data-go]')?.click();\n  }");
    // and the words exist, in all four languages, and the help text names the keys
    for (const lang of LANGS) for (const key of ['map.focus_hint', 'map.focus_none', 'map.focus_off', 'map.keys']) {
      expect(table(lang)[key], `strings/${lang}.json has no ${key}`).toBeTypeOf('string');
    }
    expect(table('en')['map.keys']).toMatch(/\bN\b[^.]*\bP\b[^.]*Enter[^.]*Escape/);
  });
});

describe('the cursor comes back after a redraw that is not a new screen', () => {
  const inside = () => true;
  const field = (attrs: Record<string, string>, extra: Partial<FocusEl> = {}): FocusEl => ({
    getAttribute: (a) => attrs[a] ?? null,
    closest: () => null,
    ...extra,
  });

  it('names a control by its id, then by the hook the app already puts on it', () => {
    expect(focusSelector(field({}, { id: 'q' }), inside)).toBe('[id="q"]');
    expect(focusSelector(field({ 'data-layer': 'go:ddot_routes' }), inside)).toBe('[data-layer="go:ddot_routes"]');
    expect(focusSelector(field({ 'data-save': 'sal_a' }), inside)).toBe('[data-save="sal_a"]');
    expect(focusSelector(field({ 'data-layer-retry': 'go:qline' }), inside)).toBe('[data-layer-retry="go:qline"]');
    // A quote in a value cannot break out of the selector.
    expect(focusSelector(field({ 'data-save': 'sal_"a' }), inside)).toBe('[data-save="sal_\\"a"]');
  });

  it('a half-typed note is named by the listing it belongs to, so two on one screen never swap cursors', () => {
    const inBox = (target: string, over: Partial<FocusEl>): FocusEl => ({
      getAttribute: () => null,
      closest: (sel) => (sel === '.report' ? { getAttribute: (a) => (a === 'data-target' ? target : null) } : null),
      ...over,
    });
    expect(focusSelector(inBox('sal_a', { tagName: 'TEXTAREA' }), inside)).toBe('.report[data-target="sal_a"] textarea');
    expect(focusSelector(inBox('seg_b', { tagName: 'TEXTAREA' }), inside)).toBe('.report[data-target="seg_b"] textarea');
    expect(focusSelector(field({}, { name: 'what' }), inside)).toBe('[name="what"]');
  });

  it('says nothing about a control it cannot name again, and nothing about the page behind the redraw', () => {
    expect(focusSelector(field({}, { tagName: 'BUTTON' }), inside)).toBe('');
    expect(focusSelector(null, inside)).toBe('');
    expect(focusSelector(field({}, { id: 'q' }), () => false)).toBe('');
  });
});

describe('a private listing is never shared, and no private list is ever drawn on the map', () => {
  it('Share is gated exactly like Save: the same listings, for the same reason', () => {
    for (const c of ['shelter.dv', 'health.mental', 'health.mental.crisis', 'treatment', 'treatment.detox', 'assault']) {
      expect(canShare(c), c).toBe(false);
      expect(canShare(c), `${c}: Share and Save must agree`).toBe(canSave(c));
      expect(isPrivate(c), c).toBe(true);
    }
    for (const c of ['food.pantry', 'harm.narcan', 'health.clinic', 'shelter.emergency', 'jobs.find']) {
      expect(canShare(c), c).toBe(true);
      expect(canShare(c), c).toBe(canSave(c));
    }
  });

  it('a mixed list of listings: only the ones that may be drawn come back', () => {
    const rows = [
      { id: 'sal_pantry', category: 'food.pantry', lat: 42.33 },
      { id: 'sal_narcan', category: 'harm.narcan', lat: 42.34 },
      { id: 'sal_clinic', category: 'health.clinic', lat: 42.35 },
      // Never, at any zoom, in any group: a DV shelter and a crisis line are sensitive row by row…
      { id: 'sal_dv', category: 'shelter.dv', lat: 42.36 },
      { id: 'sal_crisis', category: 'health.mental.crisis', lat: 42.37 },
      // …and treatment and help after sexual assault are dropped as whole kinds.
      { id: 'sal_detox', category: 'treatment.detox', lat: 42.38 },
      { id: 'sal_meds', category: 'treatment.meds', lat: 42.39 },
      { id: 'sal_avalon', category: 'assault', lat: 42.4 },
      // A shelter with no coordinate is no dot either.
      { id: 'sal_no_dot', category: 'shelter.emergency' },
    ];
    const everyTop = MAP_GROUPS.flatMap((g) => g.tops).concat(PRIVATE_TOPS, SENSITIVE.map((c) => c.split('.')[0]!));
    const drawn = mapDrawable(rows, everyTop).map((r) => r.id);
    expect(drawn).toEqual(['sal_pantry', 'sal_narcan', 'sal_clinic']);
    // Switch on only the group a treatment listing would fall into and it is still not drawn.
    expect(mapDrawable(rows, ['treatment', 'assault'])).toEqual([]);
    // And the shelter group draws shelters without dragging the DV shelter along.
    expect(mapDrawable(rows, ['shelter']).map((r) => r.id)).toEqual([]);
    expect(mapDrawable([{ id: 'sal_ok', category: 'shelter.emergency', lat: 42.3 }], ['shelter']).map((r) => r.id)).toEqual(['sal_ok']);
  });

  it('every category a person can browse is either drawable or private, never neither', () => {
    const tops = MAP_GROUPS.flatMap((g) => g.tops);
    for (const c of CATEGORIES) {
      const top = c.query.category!.split('.')[0]!;
      expect(tops.includes(top) || isPrivate(top), c.id).toBe(true);
    }
  });
});

describe('only a scheme we trust ever becomes a link', () => {
  it('http, https, and the three app schemes the docs name', () => {
    for (const u of ['https://detroitmi.gov/', 'http://example.org/x?y=1', 'tel:+13135792100,4217',
      'geo:42.33,-83.04?q=42.33,-83.04', 'transit://directions?to=42.33,-83.04', 'maps://?daddr=42.33,-83.04']) {
      expect(safeUrl(u), u).toBe(u);
    }
  });
  it('a javascript: address is not a link at all — the caller prints it as words', () => {
    for (const u of ['javascript:alert(1)', 'JavaScript:alert(1)', '  javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'blob:https://x/y', '', '   ', null, undefined]) {
      expect(safeUrl(u as string), String(u)).toBeNull();
    }
  });
  it('a scheme-relative address is judged as one, not waved through', () => {
    // "//evil.example/x" takes the page's own scheme; it is http(s) and allowed, which is the honest answer —
    // what must never pass is a scheme that RUNS something, and those are refused above.
    expect(safeUrl('//evil.example/x')).toBe('//evil.example/x');
    expect(safeUrl('java\nscript:alert(1)')).toBeNull();
  });
});

describe('the whole app is served with the policy the page claims, not only the steward page', () => {
  const headers = readFileSync(join(__dirname, '../public/_headers'), 'utf8');
  const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
  /** One Pages block, as Pages reads it: a path on its own line, then indented headers. */
  const block = (path: string) => headers.split(/\r?\n(?=\S)/).find((b) => b.split(/\r?\n/)[0]!.trim() === path) ?? '';
  const header = (path: string, name: string) => new RegExp(`^\\s+${name}:\\s*(.+?)\\s*$`, 'mi').exec(block(path))?.[1] ?? '';
  const directives = (csp: string) => Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k!, v.join(' ')]; }));

  it('there is a block for every path, and it carries a real Content-Security-Policy', () => {
    const csp = directives(header('/*', 'Content-Security-Policy'));
    expect(csp['default-src']).toBe("'self'");
    expect(csp['img-src']).toBe("'self' data:");
    expect(csp['font-src']).toBe("'self'");
    expect(csp['frame-ancestors']).toBe("'none'");
    // The bundle and the API are both our own origin (vite.config.ts proxies /v1 in dev; the Worker is routed on
    // the same origin in production), so there is no second origin to allow.
    expect(csp['connect-src']).toBe("'self'");
    expect(readFileSync(join(__dirname, '../src/data.ts'), 'utf8')).toContain("const BASE = '/data/bundle/v1/';");
    for (const f of ['src/report.ts', 'src/propose.ts']) expect(readFileSync(join(__dirname, '..', f), 'utf8'), f).not.toMatch(/fetch\('https?:/);
  });
  it('and the rest of what a browser needs told once, at the top', () => {
    expect(header('/*', 'Referrer-Policy')).toBe('no-referrer');
    expect(header('/*', 'X-Content-Type-Options')).toBe('nosniff');
    const pp = header('/*', 'Permissions-Policy');
    expect(pp).toMatch(/geolocation=\(self\)/);                  // "Use my location" is ours to ask for
    for (const off of ['camera', 'microphone', 'payment', 'usb', 'display-capture', 'browsing-topics']) {
      expect(pp, off).toMatch(new RegExp(`${off}=\\(\\)`));
    }
  });
  it('the header and the <meta> tag say the same thing, so a cached shell is no weaker', () => {
    const meta = directives(/content="([^"]*default-src[^"]*)"/.exec(html)![1]!);
    const sent = directives(header('/*', 'Content-Security-Policy'));
    for (const k of Object.keys(meta)) expect(`${k}: ${sent[k]}`).toBe(`${k}: ${meta[k]}`);
  });
  it('the steward page keeps its own block, which is where a reader looks for it', () => {
    for (const p of ['/admin', '/admin/*']) {
      expect(header(p, 'Content-Security-Policy'), p).toBe("frame-ancestors 'none'");
      expect(header(p, 'X-Frame-Options'), p).toBe('DENY');
    }
  });
  it('every link that leaves the app hands the other site no window and no referrer', () => {
    const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    const opens = [...main.matchAll(/<a [^`]*target="_blank"[^`]*>/g)].map((m) => m[0]!);
    expect(opens.length).toBeGreaterThan(0);
    for (const a of opens) expect(a, a).toContain('rel="noopener noreferrer"');
    // and every one of them goes through `ext`, which checks the scheme first
    expect(main).toContain('const safe = safeUrl(url);');
    expect(main).toContain('if (!safe) return `<span');
  });
});

describe('the line under the overdose steps says only what Kyle has told us', () => {
  // Kyle, 2026-09-20: the City had these six steps approved (DECISIONS). The line names the Detroit Health
  // Department and nobody else, keeps 911 first, and never promises anything about the law.
  it('911 first, the Health Department and no other source, no promise, in all four languages', () => {
    const dept: Record<string, RegExp> = { en: /Detroit Health Department approved these steps/, es: /Departamento de Salud de Detroit aprobó estos pasos/, ar: /دائرة الصحة في ديترويت/, bn: /ডেট্রয়েট স্বাস্থ্য বিভাগ/ };
    for (const l of LANGS) {
      const v = table(l)['od.review_note']!;
      expect(v.indexOf('911'), l).toBeGreaterThanOrEqual(0);
      expect(v.indexOf('911'), `${l}: 911 comes before anything else`).toBeLessThan(v.search(dept[l]!));
      expect(v, l).toMatch(dept[l]!);
      expect(v, `${l} names a source nobody gave us`).not.toMatch(/guidance|guideline|CDC|MDHHS|SAMHSA|WHO\b|doctor|médico|طبيب|ডাক্তার/i);
      expect(v, `${l} promises protection`).not.toMatch(/\blaw\b|\blegal\b|arrest|police|\bley\b|policía|قانون|আইন/i);
    }
  });

  it('the six steps are the ones that were approved: not one word has changed', () => {
    const en = table('en');
    expect([1, 2, 3, 4, 5, 6].map((i) => en['od.s' + i])).toEqual([
      'Call 911. Say someone is not breathing.',
      'Try to wake them. Shout their name. Rub the middle of their chest hard.',
      'If you have Narcan, spray it into one nostril.',
      'If they are not breathing, give one breath every 5 seconds if you know how.',
      'No change after 2 to 3 minutes? Give a second dose in the other nostril.',
      'Lay them on their side. Stay with them until help comes.',
    ]);
  });
});

describe('the Safe streets panel prints what SEMCOG requires, beside its source line', () => {
  const ui = { t: (k: string, p: Record<string, string | number> = {}) => (table('en')[k] ?? 'MISSING:' + k).replace(/[{](\w+)[}]/g, (_, x) => String(p[x] ?? '')), esc: (x: unknown) => String(x), own: (x: unknown) => '<span lang="en">' + String(x) + '</span>', date: (d: string) => d, link: (u: string, l: string) => '<a href="' + u + '">' + l + '</a>', go: (v: object) => "data-go='" + JSON.stringify(v) + "'", map: () => '' };
  const src = { name: 'City data', url: 'https://example.org/x', last_edited: '2026-09-17' };
  const hood: Hood = { id: 'nbh_zug', name: 'Zug', district: 1, center: [42.4, -83.1], rings: [], years: {},
    help: { total: 1, by: {}, nearest_miles: {}, none_listed_yet: [], coverage_checked: false }, places: { parks: 1, rec_centers: 0, greenway_open: 0 },
    crashes: { walk: 49, bike: 'lt5', severe: 22 } };
  const d: Indicators = { sources: { neighborhoods: src, sales: src, permits: src, crashes: { ...src, name: 'SEMCOG — Crash Locations, 2015-2024' } },
    stats_fetched_at: '2026-09-18', first_year: 2024, partial_year: 2026, near_miles: 0.5, origin: [-83.32, 42.22], segments: {},
    city: {}, neighborhoods: [hood], crash_years: [2020, 2024], city_crashes: { walk: 2024, bike: 664, severe: 630 },
    crash_records_from: 'Michigan State Police (CJIC) police-reported crashes, published by SEMCOG' };

  it('the licensor\'s own sentence, word for word, marked English so it is never machine-translated', () => {
    const html = hoodPage(hood, d, ui);
    expect(html).toContain('Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited.');
    expect(html).toContain(`lang="en">${SEMCOG_NOTICE}`);
    // Beside the source line, inside the Safe streets panel, not loose at the bottom of the page.
    const panel = html.slice(html.indexOf('Safe streets'));
    expect(panel.slice(0, panel.indexOf('</div>'))).toContain(SEMCOG_NOTICE);
    // The year is the year of the layer we ship, not today's.
    expect(SEMCOG_NOTICE).toContain('2025');
  });
  it('a bundle with no crash numbers prints no notice, because it reproduces nothing', () => {
    const { crashes, ...rest } = d.sources;
    expect(crashes).toBeDefined();
    expect(hoodPage(hood, { ...d, sources: rest } as Indicators, ui)).not.toContain('SEMCOG. All Rights Reserved');
  });
});

describe('every word the app asks for exists, in all four languages', () => {
  // The old test skipped a key exactly when it was missing ("built from a list; the loops below cover those"),
  // so a dynamic key that no loop covered could go missing without failing anything. Now every dynamic key is
  // enumerated from the data that builds it, and a hole is a failure (web review, 2026-09-20).
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  const en = table('en');

  it('a dynamic key with no words FAILS, instead of being skipped for being dynamic', () => {
    // A guard on the guard: the enumeration below must actually notice a hole.
    const pretend = { ...en };
    delete (pretend as Record<string, string>)['cat.food'];
    expect(dynamicKeys().filter((k) => !(k in pretend))).toEqual(['cat.food']);
  });

  it('every key, literal or built from a list, has words in English, Spanish, Arabic and Bengali', () => {
    const code = ['src/main.ts', 'src/map.ts', 'src/hoods.ts'].map(src).join('\n');
    const literal = [...code.matchAll(/(?<![\w.])[tT]\('((?:[a-z0-9_]+\.)+[a-z0-9_]+)'\s*[,)]/g)].map((m) => m[1]!);
    const all = [...new Set([...literal, ...dynamicKeys()])];
    expect(all.length).toBeGreaterThan(200);
    for (const l of LANGS) {
      const w = table(l);
      for (const k of all) expect(w[k], `strings/${l}.json has no ${k}`).toBeTypeOf('string');
    }
  });

  /** Every key the app builds at run time, taken from the very lists it builds them from. */
  function dynamicKeys(): string[] {
    const out: string[] = [];
    for (const n of NEEDS) {
      out.push(`need.${n.id}`);
      if (n.group !== 'now') out.push(`tile.${n.id}`);
      for (const r of n.refine ?? []) out.push(`refine.${n.id}.${r.id}`);
      if (n.intro) out.push(n.intro);
      if (n.emptyKey) out.push(n.emptyKey);
    }
    for (const c of CATEGORIES) out.push(`cat.${c.id}`);
    for (const t of TABS) out.push(`tab.${t.id}`);
    for (const id of ['food', 'shelter', 'doctor', 'drugs', 'job', 'narcan']) out.push(`quick.${id}`);
    for (const g of MAP_GROUPS) out.push(`layer.help.${g.id}`);
    for (const id of ['greenway', 'parks']) out.push(`layer.place.${id}`);
    // The transport layers: their ids are the keys of LAYER_STYLE in main.ts, which is the list the map draws.
    for (const id of Object.keys(LAYER_STYLE)) out.push(`layer.${id.replace(':', '.')}`);
    for (const set of Object.keys(LINKS)) {
      if (LINKS[set]!.lede) out.push(LINKS[set]!.lede!);
      for (const b of LINKS[set]!.items) for (const part of ['title', 'body', 'label']) out.push(`link.${set}.${b.id}.${part}`);
    }
    for (const k of [...LISTING_KINDS, ...PLACE_KINDS]) out.push(`report.kind.${k}`);
    for (const c of PROPOSE_CATEGORIES) out.push(`add.cat.${c}`);
    for (const h of HOW_KNOWN) out.push(`add.how.${h}`);
    for (const f of ['name', 'category', 'what', 'address', 'schedule_text', 'phone', 'how_known', 'notes']) out.push(`add.f.${f}`);
    for (const f of ['name', 'category', 'what', 'how_known']) out.push(`add.e.${f}`);
    for (let i = 1; i <= 6; i++) out.push(`od.s${i}`);
    for (const ph of ['open', 'under_construction', 'funded', 'planned']) out.push(`gw.${ph}`);
    for (const d of ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']) out.push(`day.${d}`);
    for (const id of ['emg_911', 'emg_988']) out.push(`emergency.${id}`);
    return [...new Set(out)];
  }
});

describe('a map layer that will not load says so, and can be asked for again', () => {
  const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
  const mapSrc = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');

  it('a failure is its own state, not "nothing", so the switch is never left ticked over an empty map', () => {
    // It used to store `null` under the file name for ever: the switch stayed ticked, the app said the layer was
    // "on the map now", nothing was drawn, and it was never asked for again (web review, 2026-09-20).
    expect(main).toContain("const layerFiles = new Map<string, LayerData | 'loading' | 'failed'>();");
    expect(main).toContain("layerFiles.set(key, d ?? 'failed');");
    expect(main).toContain("if (!d) announce(t('map.layer_failed_say', { name: layerName(id) }));");
    expect(main).not.toMatch(/layerFiles\.set\([^,]+, null\)/);
  });
  it('the shapes are held under the file AND its checksum, exactly as map.ts holds them', () => {
    expect(main).toContain("const layerKey = (file: string) => `${file}:${bundle?.index.files[file]?.sha256 ?? ''}`;");
    expect(mapSrc).toContain('const key = `${file}:${meta.sha256}`;');
    // map.ts keeps no failure at all, so asking again really does ask again.
    expect(mapSrc).toContain('finally { layerJobs.delete(key); }');
  });
  it('it says so in the switcher and in the list, and "Try again" clears the failure and asks afresh', () => {
    expect(main).toContain("${s.items.map((i) => layerProblem(i.id)).join('')}</fieldset>");
    expect(main).toContain("problems: (bundle?.transit?.layers ?? []).map((l) => layerProblem('go:' + l.id)),");
    expect(main).toContain('layerFiles.delete(layerKey(l.file)); refocus = id;');
    // and nothing is said about a layer that is switched off, or one that is simply still coming
    expect(main).toContain("if (!layerOn(id) || layerState(id) !== 'failed') return '';");
  });
  it('the words exist in all four languages, and name the layer', () => {
    for (const l of LANGS) {
      for (const k of ['map.layer_failed', 'map.layer_failed_say', 'map.layer_retry']) expect(table(l)[k], `${l} ${k}`).toBeTypeOf('string');
      for (const k of ['map.layer_failed', 'map.layer_failed_say']) expect(table(l)[k], `${l} ${k}`).toContain('{name}');
    }
  });
  it('every transport layer the map can draw has a look of its own', () => {
    // `go:intercity_bus` had no entry, so it was drawn exactly like the DDOT routes and nothing told them apart.
    const styles = Object.entries(LAYER_STYLE).map(([id, s]) => ({ id, decl: JSON.stringify(s) }));
    expect(styles.map((s) => s.id)).toContain('go:intercity_bus');
    const look = (s: { decl: string }) => s.decl.replace(/\s/g, '');
    const ddot = styles.find((s) => s.id === 'go:ddot_routes')!;
    const intercity = styles.find((s) => s.id === 'go:intercity_bus')!;
    expect(look(intercity)).not.toBe(look(ddot));
    // every layer named in the switcher has a style, and no two styles are the same
    const seen = styles.map(look);
    expect(new Set(seen).size, 'two layers are drawn identically').toBe(seen.length);
  });
});

describe('what the app does when something cannot be fetched', () => {
  const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
  it('a language nobody has opened yet, with no signal: it says so instead of doing nothing', () => {
    expect(main).toContain("void setLang(next).then((ok) => { langOffline = !ok; render(false); announce(t(ok ? 'lang.changed' : 'lang.needs_net')); });");
    expect(main).toContain("const langNote = () => (langOffline ? `<p class=\"banner warn\" role=\"note\">${T('lang.needs_net')}</p>` : '');");
    expect(main).toContain('if (showLang && langOffline) body = body.replace(');
    for (const l of LANGS) expect(table(l)['lang.needs_net'], l).toBeTypeOf('string');
  });
  it('a service worker that will not register does not take the rest of the start-up with it', () => {
    const start = main.slice(main.indexOf('async function start()'));
    expect(start).toMatch(/try \{\s*const reg = await navigator\.serviceWorker\.register/);
    expect(start).toMatch(/\} catch \(e\) \{ console\.warn\('the app will not work offline/);
  });
  it('a quick exit that empties the stack cannot be drawn into', () => {
    expect(main).toContain('if (!stack.length) return;');
    expect(main.indexOf('if (!stack.length) return;')).toBeLessThan(main.indexOf('const v = stack[stack.length - 1]!;'));
  });
  it('a report already waiting is not asked for again after a reload, and the message is true either way', () => {
    expect(main).toContain("for (const id of await queuedTargets()) reported.set(id, 'queued');");
    // "when you're back online" was a guess: the server may simply have failed while the phone had signal.
    for (const l of LANGS) {
      expect(table(l)['report.queued'], l).not.toMatch(/back online|vuelva a tener internet|تعود للاتصال|ইন্টারনেট এলে/);
      expect(table(l)['add.queued'], l).not.toMatch(/back online|vuelva a tener internet|تعود للاتصال|ইন্টারনেট এলে/);
    }
    expect(table('en')['report.queued']).toMatch(/saved on your phone/);
  });
});

describe('a map layer says who it came from and what we did to it', () => {
  const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
  it('a licence we know the address of is a link, and the cut to our four cities is stated', () => {
    expect(main).toContain("'CC BY-NC 4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',");
    expect(main).toContain('const url = LICENSE_URL[l.source.license];');
    expect(main).toContain("${sources.map(layerSource).join(' · ')}<br>${T('map.layer_filtered')}");
    for (const l of LANGS) {
      expect(table(l)['map.layer_license'], l).toContain('{name}');
      expect(table(l)['map.layer_filtered'], l).toBeTypeOf('string');
    }
    // English names the four cities the service area covers (CLAUDE.md).
    for (const city of ['Detroit', 'Hamtramck', 'Highland Park', 'Dearborn']) expect(table('en')['map.layer_filtered']).toContain(city);
  });
  it('a licence with no address we know is still printed, never guessed at', () => {
    expect(main).toContain("url ? ext(url, t('map.layer_license', { name: l.source.license }), 'link') : esc(t('map.layer_license', { name: l.source.license }))");
  });
});

describe('911 and 988 are named in the language the screen is in', () => {
  it('their labels are ours, and they exist in all four languages', () => {
    const main = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    expect(main).toContain("const ours = t('emergency.' + id, {});");
    expect(main).not.toMatch(/id === 'emg_911' \? 'Emergency'/);
    for (const l of LANGS) for (const id of ['emg_911', 'emg_988']) expect(table(l)[`emergency.${id}`], `${l} ${id}`).toBeTypeOf('string');
    // Not English left in the other three.
    for (const l of ['es', 'ar', 'bn']) expect(table(l)['emergency.emg_911'], l).not.toBe(table('en')['emergency.emg_911']);
  });
});

describe('a badge says which of a person and a program did the checking', () => {
  it('"read in a browser" and "matched by a script" are two different sentences, in every language', () => {
    for (const l of LANGS) {
      const w = table(l);
      expect(w['badge.entry_checked.web'], l).not.toBe(w['badge.entry_checked.auto_check']);
      // Neither of the three website badges may sound like a person went and looked.
      for (const k of ['badge.entry_checked.web', 'badge.entry_checked.auto_check', 'badge.confirmed.web']) {
        expect(w[k], `${l} ${k}`).toBeTypeOf('string');
        expect(w[k], `${l} ${k} says "verified"`).not.toMatch(/verified|verificad/i);
      }
    }
    expect(table('en')['badge.entry_checked.auto_check']).toMatch(/^A program matched/);
    expect(table('en')['badge.confirmed.web']).not.toMatch(/^We checked/);
  });
});
