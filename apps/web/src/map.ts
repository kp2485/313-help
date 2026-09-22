// The app's map. Streets, parks and the city boundary come from the signed bundle (map/base.json,
// map/streets.json: City of Detroit open data), so no map company ever learns where a person is looking,
// and the map keeps working offline. Everything is drawn on one canvas: fast on a cheap phone.
//
// The map is an extra, never the only way to get a fact: every screen that shows one also lists the same
// places and cross streets as text. If the map files can't be loaded, the greenway and the dots still draw.

import type { Segment } from '@313help/query';
import { fetchVerified, idbGet, idbSet, type BundleIndex } from './data.js';
import { MAP_GROUPS, mapDrawable } from './needs.js';
import type { MapStyle } from './layers.js';
import { BOUNDARY_SELECTED_WIDTH, BOUNDARY_WASH_ALPHA, boundaryStyle } from './bounds.js';
import type { SubwayData, SubwayPainter } from './subway.js';

// ---- world coordinates: flat projection around Detroit; one unit = one degree of latitude ----------------
const LON0 = -83.1, LAT0 = 42.35, K = Math.cos((LAT0 * Math.PI) / 180), M_PER_UNIT = 111320;
export const wx = (lon: number) => (lon - LON0) * K;
export const wy = (lat: number) => LAT0 - lat;
/** The way back. Only two files need it — the cross-street finder and the city outlines — and both work in
 *  world coordinates and hand lat/lon back out, so the projection stays in this one file. */
export const ilon = (x: number) => x / K + LON0;
export const ilat = (y: number) => LAT0 - y;
type Box = [number, number, number, number];                           // minX, minY, maxX, maxY
interface Line { cls: number; name: string; pts: Float32Array; box: Box }
interface Area { name: string; pts: Float32Array; box: Box }
interface Cell { box: Box; roads: Line[] }
export interface BaseMap { roads: Line[]; cells: Cell[]; parks: Area[]; boundary: Float32Array[]; edited: string }

/** [x0, y0, dx1, dy1, ...] in 1e-5 degrees from `origin` -> world x,y pairs. */
export function decodeLine(enc: number[], origin: [number, number]): Float32Array {
  const out = new Float32Array(enc.length); let x = 0, y = 0;
  for (let i = 0; i + 1 < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out[i] = wx(origin[0] + x / 1e5); out[i + 1] = wy(origin[1] + y / 1e5); }
  return out;
}
function boxOf(pts: Float32Array): Box {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { a = Math.min(a, pts[i]!); c = Math.max(c, pts[i]!); b = Math.min(b, pts[i + 1]!); d = Math.max(d, pts[i + 1]!); }
  return [a, b, c, d];
}
const merge = (boxes: Box[]): Box => boxes.reduce((m, x) => [Math.min(m[0], x[0]), Math.min(m[1], x[1]), Math.max(m[2], x[2]), Math.max(m[3], x[3])], [Infinity, Infinity, -Infinity, -Infinity] as Box);
const touches = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

interface RoadFile { origin: [number, number]; names: string[]; roads: [number, number, number[]][] }
interface BaseFile extends RoadFile { source: { last_edited: { roads: string } }; park_names: string[]; parks: [number, number[]][]; boundary: number[][] }
const roadsOf = (f: RoadFile): Line[] => f.roads.map(([cls, n, enc]) => { const pts = decodeLine(enc, f.origin); return { cls, name: n < 0 ? '' : f.names[n]!, pts, box: boxOf(pts) }; });

export function decodeMap(base: BaseFile, streets: { cells: Record<string, RoadFile> }): BaseMap {
  return {
    roads: roadsOf(base),
    cells: Object.values(streets.cells).map((c) => { const roads = roadsOf(c); return { roads, box: merge(roads.map((r) => r.box)) }; }),
    parks: base.parks.map(([n, enc]) => { const pts = decodeLine(enc, base.origin); return { name: n < 0 ? '' : base.park_names[n]!, pts, box: boxOf(pts) }; }),
    boundary: base.boundary.map((enc) => decodeLine(enc, base.origin)),
    edited: base.source.last_edited.roads,
  };
}

// ---- loading: checked against the signed index, then kept on the phone --------------------------------------
let loaded: { key: string; map: BaseMap } | undefined, loading: Promise<BaseMap | null> | undefined;
/** The basemap if it is already decoded and in memory, without asking for it. The cross-street finder needs the
 *  streets synchronously while a person is typing, and this is the one thing it needs from the loading path. */
export const loadedBase = (): BaseMap | null => loaded?.map ?? null;
export function loadMap(index: BundleIndex): Promise<BaseMap | null> {
  const want = ['map/base.json', 'map/streets.json'].map((n) => index.files[n]?.sha256);
  if (!want[0] || !want[1]) return Promise.resolve(null);
  const key = want.join(':');
  if (loaded?.key === key) return Promise.resolve(loaded.map);
  return (loading ??= (async () => {
    try {
      let files = await idbGet<{ key: string; base: BaseFile; streets: { cells: Record<string, RoadFile> } }>('map');
      if (files?.key !== key) {
        try {
          const [base, streets] = await Promise.all([fetchVerified(index, 'map/base.json'), fetchVerified(index, 'map/streets.json')]);
          files = { key, base: base as BaseFile, streets: streets as { cells: Record<string, RoadFile> } };
          await idbSet('map', files);
        } catch (e) { if (!files) throw e; }               // offline with last month's streets: still better than none
      }
      loaded = { key: files!.key, map: decodeMap(files!.base, files!.streets) };
      return loaded.map;
    } catch (e) { console.warn('map files not available; drawing without streets', e); return null; }
    finally { loading = undefined; }
  })());
}

// ---- extra layers (ingest-transit.ts): bus routes and stops, the streetcar, bike lanes, stations ----------
// Each layer is its own file in the signed bundle, fetched only when a person switches that layer on, decoded
// the same way as the streets. `names` holds each line's or point's name once; -1 means it has none.
export interface LayerFile { origin: [number, number]; names: string[]; lines?: [number, number[]][]; points?: [number, number, number][] }
export interface LayerData { lines: Line[]; points: { name: string; x: number; y: number }[] }
export function decodeLayer(f: LayerFile): LayerData {
  const nm = (n: number) => (n < 0 ? '' : f.names[n] ?? '');
  return {
    lines: (f.lines ?? []).map(([n, enc]) => { const pts = decodeLine(enc, f.origin); return { cls: 1, name: nm(n), pts, box: boxOf(pts) }; }),
    points: (f.points ?? []).map(([n, x, y]) => ({ name: nm(n), x: wx(f.origin[0] + x / 1e5), y: wy(f.origin[1] + y / 1e5) })),
  };
}
const layers = new Map<string, LayerData>(), jobs = new Map<string, Promise<LayerData | null>>();
/** One file under map/, checked against the signed index, decoded once and kept on the phone for offline use.
 *  Null when the bundle has no such file or it cannot be read. One path for every lazy map file: a layer's
 *  shapes, and the subway style's `.net.json` beside them. */
function loadChecked<T>(index: BundleIndex, file: string, decode: (raw: unknown) => T, kept: Map<string, T>, layerJobs: Map<string, Promise<T | null>>): Promise<T | null> {
  const meta = index.files[file];
  if (!meta) return Promise.resolve(null);
  const key = `${file}:${meta.sha256}`;
  const have = kept.get(key);
  if (have) return Promise.resolve(have);
  const job = layerJobs.get(key);
  if (job) return job;
  const run = (async () => {
    try {
      let held = await idbGet<{ key: string; file: unknown }>('layer:' + file);
      if (held?.key !== key) {
        try { held = { key, file: await fetchVerified(index, file) }; await idbSet('layer:' + file, held); }
        catch (e) { if (!held) throw e; }                 // offline with last week's copy: better than nothing
      }
      const data = decode(held!.file);
      kept.set(key, data);
      return data;
    } catch (e) { console.warn('map layer not available', file, e); return null; }
    finally { layerJobs.delete(key); }
  })();
  layerJobs.set(key, run);
  return run;
}
/** One layer file, checked against the signed index, decoded once and kept on the phone for offline use.
 *  Null when the bundle has no such layer or it cannot be read; the map then simply draws without it. */
export function loadLayer(index: BundleIndex, file: string): Promise<LayerData | null> { return loadChecked(index, file, (f) => decodeLayer(f as LayerFile), layers, jobs); }
const nets = new Map<string, object>(), netJobs = new Map<string, Promise<object | null>>();
/** A subway-style `.net.json` file (docs/MAP-STYLE.md), through the very same checksum path. It comes back as
 *  the file itself: subway.ts, which only people who pick that style ever download, is what reads it. */
export function loadNet(index: BundleIndex, file: string): Promise<object | null> { return loadChecked(index, file, (f) => f as object, nets, netJobs); }

/** How one switched-on layer is drawn. `css` is a custom property in style.css, so dark mode works. */
export interface Overlay extends LayerData { id: string; label: string; css: string; width?: number; dash?: number[]; ring?: boolean; dense?: boolean }

// ---- the view -----------------------------------------------------------------
/** `dir` is the `data-dir` payload for the bottom card's "Directions" button: the destination, and nothing
 *  about the person. Absent where a row has no coordinate or must never be routed to (docs/08). */
export interface MapDot { lat: number; lon: number; label: string; go?: string; dir?: string; css?: string; sub?: string; category?: string }

/**
 * One chosen itinerary, drawn (DECISIONS 2026-09-22). The map is the extra here as everywhere: the numbered
 * steps below it are the source of truth, `text` is what this line says in words, and nothing on it is ever
 * called safe, lit or accessible.
 *
 * A walking leg is a solid line in its own tone; a ride wears the tone of the agency's own layer and its dash,
 * so the map and the layer switcher never disagree about what a colour means. Both sit on the same casing
 * every other line in this file uses, which is what their 3:1 is measured against (1.4.11).
 */
export interface MapRouteLeg { kind: 'walk' | 'ride'; polyline: [number, number][]; css?: string; dash?: number[] }
export interface MapRouteMark { lat: number; lon: number; kind: 'start' | 'end' | 'board' | 'alight'; label: string; sub?: string }
export interface MapRoute {
  legs: MapRouteLeg[];
  marks: MapRouteMark[];
  /** The overlay's text equivalent (1.1.1), read out with the picture's own label. */
  text: string;
  /** The leg the current step belongs to, drawn heavier. -1 for none. */
  active?: number;
}

// ---- the features a keyboard can walk ------------------------------------------------------------------
// The picture is an extra: every map in the app is also a list of the same places (docs/05). But "there is a
// list" is not a reason for the picture itself to be dead to a keyboard or a switch (WCAG 2.1.1), so the map
// carries a roving focus of its own: N and P step through what is on screen, Enter opens it, Escape steps back
// out to the map. N and P rather than Tab, because Tab has to keep leaving the map (2.1.2, no keyboard trap)
// and the arrows have to keep panning it (2.5.7); all three are written out in the map's keyboard help.
/** A city or neighbourhood outline on the map (audit §1; Kyle, 2026-09-22). It is a SHAPE and a NAME and
 *  nothing else: no dot, no listing, no number. `sub` is the council district, or the city's own name for a
 *  whole-city area; `go` is the ordinary `data-go` payload, absent for an area that has no page yet. */
// (There used to be an `AREA_DETAIL_MPP = 14` here: the zoom a neighbourhood outline first appeared at. It is
// gone — every outline is drawn in every band now, at the weight `boundaryStyle` gives it: bounds.ts.)
export interface MapArea { id: string; name: string; sub: string; rings: { lat: number; lon: number }[][]; go?: string }

/** What is under a point on the map: a card to show, a subway glyph to choose, an area to select — or nothing. */
type Hit =
  | { kind: 'card'; title: string; sub: string; go?: string; dir?: string }
  | { kind: 'area'; id: string; title: string; sub: string; go?: string }
  | { kind: 'glyph'; glyph: string; sel: string };

export interface MapFeature {
  // `stop` is a marker on a drawn route (start, end, and where a bus is boarded or left). The last four are
  // subway style only, and always after the first three.
  kind: 'stop' | 'segment' | 'dot' | 'area' | 'hub' | 'terminal' | 'interchange' | 'route';
  id: string;                 // stable across a pan, so the ring stays on the same thing
  route: number;              // a greenway stretch's place in the route
  d: number;                  // a place's distance from the middle of the screen, in pixels
  label: string; sub: string; go?: string;
  dir?: string;               // the `data-dir` payload: open OUR directions to this place
  sel?: string;               // subway style: what Enter chooses (a route, an interchange…), instead of a screen to go to
  box: [number, number, number, number];   // on screen: what the ring is drawn round
}
/** A stable, meaningful order: a drawn route's own markers first, in the order they are walked, because a map
 *  that is about one trip is about nothing else; then the greenway, stretch by stretch along the route; then
 *  the areas, the one nearest the middle of the screen first; then the places, likewise. An area comes before
 *  the dots because it is the ground they stand on, and a keyboard that walks the ground first reads the map
 *  the way an eye does (audit §3.4). Pure, so the order is held to a fixture rather than to a map. */
const KIND_ORDER: Record<string, number> = { stop: 0, segment: 1, area: 2, dot: 3 };
export function orderFeatures<T extends { kind: 'stop' | 'segment' | 'dot' | 'area'; route: number; d: number }>(list: readonly T[]): T[] {
  // `route` is a place in a sequence: a greenway stretch's along the path, a route marker's along the trip.
  return [...list].sort((a, b) => (a.kind === b.kind ? (a.kind === 'segment' || a.kind === 'stop' ? a.route - b.route : a.d - b.d) : (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)));
}
export type MapAction = 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'next' | 'prev' | 'open' | 'escape' | null;
/** What one key press means to the map — the whole of it, as a plain function, so the choice of keys can be
 *  held to a test instead of to a browser.
 *
 *  Three rules decide the choice. **Tab is not here**, so Tab still walks out of the map and there is no
 *  keyboard trap (2.1.2). **The arrows still pan**, so the one way to move the map without dragging is not
 *  taken away to drive a list (2.5.7). And a bare letter is only ever read while the picture itself has focus,
 *  which is the exception 2.1.4 makes for a single-character shortcut; a letter with Ctrl, Cmd or Alt belongs
 *  to the browser or to a screen reader and is left alone. */
export function mapKey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): MapAction {
  const k = e.key, bare = !e.metaKey && !e.ctrlKey && !e.altKey;
  if (k === '+' || k === '=') return 'in';
  if (k === '-') return 'out';
  if (k === 'ArrowLeft') return 'left';
  if (k === 'ArrowRight') return 'right';
  if (k === 'ArrowUp') return 'up';
  if (k === 'ArrowDown') return 'down';
  if (bare && (k === 'n' || k === 'N')) return 'next';
  if (bare && (k === 'p' || k === 'P')) return 'prev';
  if (k === 'Enter' || k === ' ') return 'open';
  if (k === 'Escape') return 'escape';
  return null;
}
const ALL_TOPS = MAP_GROUPS.flatMap((g) => g.tops);
/** The dots a keyboard may land on. Exactly the rows the map is allowed to draw at all — `mapDrawable`, the one
 *  predicate that decides it (needs.ts) — so a DV shelter or a crisis line can never be named by the ring even
 *  if a screen were ever to hand one over as a dot. A dot with no category at all is not walked either: the
 *  rule fails closed. */
export function focusableDots(dots: readonly MapDot[]): MapDot[] {
  return mapDrawable(dots.filter((d) => typeof d.category === 'string') as (MapDot & { category: string })[], ALL_TOPS);
}
export interface MapSpec {
  key: string;                                  // remembers pan and zoom while this screen is open
  label: string;                                // what a screen reader hears for the picture
  segments: Segment[]; focus?: string;          // greenway; `focus` is drawn bold
  outline?: { lat: number; lon: number }[][];   // a neighborhood's edge
  /** City and neighbourhood outlines (`place:areas`). Drawn thin and never filled with a value — docs/13's
   *  first honesty rule: no choropleth anywhere, ever. The one that is `selected` gets a light wash of the
   *  land colour so a tap can be seen, which carries no number and means nothing but "this one". */
  areas?: MapArea[];
  selected?: string;
  /**
   * What the page is told when an outline is tapped (the Areas tab). Handed one, this map stops drawing the
   * bottom "See details" card for an area and hands the tap over instead: on that tab a tap is not a card, it
   * is the area's own page opening under a shrinking map (Kyle, 2026-09-22). Every other map — the Map tab
   * included — is handed nothing here and keeps the card it has always drawn.
   */
  onArea?: (id: string) => void;
  /** Open on this outline rather than on `fit` or `open`: `cameraForArea`, above. The Areas tab's whole point. */
  openArea?: { lat: number; lon: number }[][];
  /**
   * HTML for controls at the HEAD of the map's own control stack, above the zoom keys (the Areas tab's
   * Map/List switch). It comes from the caller, which builds it out of strings/*.json — the same trust this
   * file already extends to every word on the map, and the reason a caller can put a `data-` hook on it and
   * have the app's own click handling pick it up.
   */
  lead?: string;
  overlays?: Overlay[];                         // switched-on transport layers, already loaded (Map tab)
  /** One chosen itinerary, drawn over everything else (the Directions screen). */
  route?: MapRoute;
  dots?: MapDot[]; me?: { lat: number; lon: number } | null;
  fit: { lat: number; lon: number }[];          // the "whole area" view: the reset button, and the start when there is no `open`
  /** Where this map OPENS, when it opens on a radius rather than on a bounding box (the Map tab, 2026-09-22).
   *  `fit` still decides what the reset button shows, so the four cities stay one tap away. */
  open?: { lat: number; lon: number; radiusMeters: number };
  minMeters?: number;                           // never start closer than this many meters across
  quiet?: boolean;                              // a map about help, not parks: no dots for small parks, so the listing dots stand out
  cover?: boolean;                              // fill the box with the fit area (the wide city on a tall phone) instead of showing all of it
  /** Draw the city's parks. False on the Map tab when "City parks" is switched off: the switch used to move only
   *  the list, and the parks stayed painted on the map whatever it said (web review, 2026-09-20). */
  parks?: boolean;
  /** How the transport layers are drawn (docs/MAP-STYLE.md). `standard`, or nothing at all, is the drawing this
   *  file has always done. `subway` also needs `subway`: the lazily loaded painter and its data. Until both are
   *  there, and for any network whose data has not arrived, the map keeps drawing `standard`. */
  style?: MapStyle;
  subway?: { Painter: new (data: SubwayData) => SubwayPainter; order: typeof import('./subway.js').featureOrder; data: SubwayData; more: (count: number) => string };
  strings: { zoomIn: string; zoomOut: string; reset: string; bigger: string; smaller: string; details: string; park: string; noStreets: string; keys: string; panUp: string; panDown: string; panLeft: string; panRight: string; focusHint: string; focusNone: string; focusOff: string; directions?: string; source: (date: string) => string; phase: Record<string, string> };
  segGo?: (id: string) => string;               // data-go value for a greenway segment
}
const cameras = new Map<string, { cx: number; cy: number; s: number }>();
const selections = new Map<string, string>();          // subway style: the chosen route or stop, kept across a redraw of the page
const live = new Map<string, MapView>();               // the maps on screen now, by `spec.key`
/** Put a map's middle on a place at a scale, whether it is on screen now or opens later. Used to take the same
 *  picture twice (the screenshot list in docs/MAP-STYLE.md); nothing is stored and nothing is sent. */
export function placeCamera(key: string, lat: number, lon: number, metersPerPixel: number): void {
  const cam = { cx: wx(lon), cy: wy(lat), s: M_PER_UNIT / Math.max(0.6, Math.min(90, metersPerPixel)) };
  cameras.set(key, cam);
  live.get(key)?.moveTo(cam);
}
/** Show a radius around a point on a map that is on screen now. Nothing is stored; there is nothing to store. */
export function focusRadius(key: string, lat: number, lon: number, radiusMeters: number): boolean {
  const view = live.get(key);
  if (!view) return false;
  view.radiusTo(lat, lon, radiusMeters);
  return true;
}
/**
 * Pick out one outline on a map that is on screen now and glide to it: the wash on the shape, and the camera
 * `cameraForArea` works out. Used when the answer to "which area am I in?" lands after the map has already
 * opened, and when a row in the list beside the map is chosen. Nothing is stored; nothing is sent.
 */
export function focusArea(key: string, id: string, rings: readonly { lat: number; lon: number }[][]): boolean {
  const view = live.get(key);
  if (!view) return false;
  view.areaTo(id, rings);
  return true;
}
let mapNo = 0;                                          // one id per map on the screen, for aria-describedby
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** The app's one live region. It sits outside #app precisely so a redraw cannot destroy it; making it inert
 *  behind the full-screen map silenced every announcement while the map was open, which is the one time a
 *  person is most likely to switch a layer on (web review, 2026-09-20). */
export const isLiveRegion = (n: Element) => n.hasAttribute('aria-live') || n.getAttribute('role') === 'status';
/** Everything that has to be made inert while the full-screen map is open: every part of the page that is not
 *  the map and does not contain it, from the root down to the map's own parent — except the live region, which
 *  is how the app speaks and must keep speaking. Pure, so it can be tested against a fixture tree. */
export function coverTargets(el: Element, root: Element): Element[] {
  const out: Element[] = [];
  const take = (n: Element) => {
    for (const sib of n.children) {
      if (sib === el || sib.contains(el) || isLiveRegion(sib) || (sib as HTMLElement).inert || out.includes(sib)) continue;
      out.push(sib);
    }
  };
  take(root);
  for (let n: Element | null = el.parentElement; n; n = n.parentElement) { take(n); if (n === root) break; }
  return out;
}
/** Our own words go into `innerHTML` and into `aria-label` here; they come from strings/*.json, where an
 *  apostrophe or an ampersand is ordinary punctuation. Escaped, always: a label is markup once it is set. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** The bottom card's "Directions" button. Only when the caller gave this thing a destination to route to AND
 *  the screen handed down the word for it: a map on a screen with no Directions handling never grows one. */
export const dirBtn = (dir: string | undefined, S: { directions?: string }): string =>
  (dir && S.directions ? `<button class="btn" data-dir="${esc(dir)}">${esc(S.directions)}</button>` : '');

// ---- gestures: the maths, as plain functions ---------------------------------------------------------------
// A phone map is judged on how it moves, and how it moves is arithmetic: what stays under the fingers, how far a
// flung map carries, what counts as a tap. All of it lives here, out of the event handlers, so it can be held to
// a test instead of to a thumb.
export interface Cam { cx: number; cy: number; s: number }
export const S_MIN = M_PER_UNIT / 90, S_MAX = M_PER_UNIT / 0.6;        // 90 m per pixel out, 0.6 m per pixel in
export const PAN_X = 0.25, PAN_Y = 0.2;                                // how far the middle may leave the city
/** Zoom about a point on the screen: the map point under `px,py` before is under `px,py` after. */
export function zoomAbout(cam: Cam, f: number, px: number, py: number, w: number, h: number): Cam {
  const s = Math.max(S_MIN, Math.min(S_MAX, cam.s * f));
  const X = cam.cx + (px - w / 2) / cam.s, Y = cam.cy + (py - h / 2) / cam.s;
  return { cx: X - (px - w / 2) / s, cy: Y - (py - h / 2) / s, s };
}
/**
 * A camera that shows `radiusMeters` in every direction around `center`: the SHORTER side of the box spans the
 * whole diameter, so the circle fits whichever way the phone is held (2026-09-21, the Map tab's first open).
 *
 * Pure, and the same three lines on all three clients (`MapCamera.forRadius` in
 * apps/ios/Sources/HelpCore/MapData.swift and apps/android/.../MapData.kt), so "two miles" is two miles
 * everywhere. The result goes through the map's own limits — the zoom stops at 0.6 m per pixel and the middle
 * never leaves the city — which is what keeps a wrong or spoofed fix from throwing the map off Detroit.
 */
export function cameraForRadius(center: { lat: number; lon: number }, radiusMeters: number, w: number, h: number): Cam {
  const side = Math.max(1, Math.min(w, h));
  const across = Math.max(1, radiusMeters * 2);
  const s = Math.max(S_MIN, Math.min(S_MAX, (side * M_PER_UNIT) / across));
  return { cx: Math.max(-PAN_X, Math.min(PAN_X, wx(center.lon))), cy: Math.max(-PAN_Y, Math.min(PAN_Y, wy(center.lat))), s };
}

/**
 * How much room is left around an outline when a map is asked to show that outline and nothing else, and how
 * close such a map may ever get (Kyle, 2026-09-22: "a map view … zoomed into the polygon of the neighborhood
 * that the user is in"). Both are named here, once, because the iPhone and Android apps have to use the same
 * two numbers or the three clients open the Areas tab on three different pictures.
 *
 * - `AREA_FIT_MARGIN` — 8 %: the outline's own box, grown by 8 % on every side, is what has to fit. Enough that
 *   the dashed edge is never flush against the frame, small enough that a neighbourhood still fills the screen.
 * - `AREA_MIN_MPP` — 4 metres per pixel: the closest this camera will ever open, whatever it was handed. The
 *   smallest of the City's 205 outlines is a few blocks across; fitting it exactly would open on a picture of
 *   six houses with no streets a person could recognise. The map's own limit is 0.6 m/px (`S_MAX`) and a person
 *   can still zoom all the way in by hand — this is only where it OPENS.
 *
 * A whole city is handled by the other end of the same clamp: `S_MIN` is 90 m per pixel, so Detroit cannot open
 * wider than the camera has ever allowed.
 */
export const AREA_FIT_MARGIN = 0.08, AREA_MIN_MPP = 4;
/**
 * The camera that shows one area's outline: fit its rings, with `AREA_FIT_MARGIN` of room, inside the box.
 *
 * Pure — rings in, camera out — and portrait or landscape is decided by the box it is handed, so the same
 * neighbourhood fits whichever way the phone is held. `Math.min` of the two axes, so the WHOLE outline is on
 * screen (unlike `cover`, which fills the box and lets the long axis run off it): an area map that cut the top
 * off Rosedale Park would be answering a different question.
 *
 * Handed nothing — an area the bundle carries no outline for — it returns null, and the caller keeps the view it
 * already had. Never a guess, and never a camera pointed at 0°N 0°E.
 */
export function cameraForArea(rings: readonly { lat: number; lon: number }[][], viewport: { w: number; h: number }): Cam | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) for (const q of ring) {
    const x = wx(q.lon), y = wy(q.lat);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const w = Math.max(1, viewport.w), h = Math.max(1, viewport.h), grow = 1 + AREA_FIT_MARGIN * 2;
  // A point, or a sliver: give it something to be wide, so the division below is never by zero.
  const spanX = Math.max(maxX - minX, 1 / M_PER_UNIT) * grow, spanY = Math.max(maxY - minY, 1 / M_PER_UNIT) * grow;
  const fit = Math.min(w / spanX, h / spanY);
  // The clamps, in this order: never closer than AREA_MIN_MPP, never outside the camera's own two limits.
  const s = Math.max(S_MIN, Math.min(S_MAX, M_PER_UNIT / AREA_MIN_MPP, fit));
  return { cx: Math.max(-PAN_X, Math.min(PAN_X, (minX + maxX) / 2)), cy: Math.max(-PAN_Y, Math.min(PAN_Y, (minY + maxY) / 2)), s };
}

/** Drag: the map follows the finger, and the middle never leaves the four cities by more than a screen or two. */
export function panCam(cam: Cam, dx: number, dy: number): Cam {
  return { cx: Math.max(-PAN_X, Math.min(PAN_X, cam.cx - dx / cam.s)), cy: Math.max(-PAN_Y, Math.min(PAN_Y, cam.cy - dy / cam.s)), s: cam.s };
}
/** Two fingers, as one number each frame: how far apart they are and where their middle is. */
export interface Grip { d: number; mx: number; my: number }
export const gripOf = (a: { x: number; y: number }, b: { x: number; y: number }): Grip => ({ d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
/** One frame of a pinch: zoom about where the fingers' middle WAS, then follow it to where it is NOW. Done in
 *  that order, the map point under the middle at the start of the gesture stays under it however the two fingers
 *  turn and slide — which is what makes a two-finger pan during a pinch feel like one gesture rather than two. */
export function pinchCam(cam: Cam, was: Grip, now: Grip, w: number, h: number): Cam {
  const zoomed = zoomAbout(cam, was.d > 0 ? now.d / was.d : 1, was.mx, was.my, w, h);
  return panCam(zoomed, now.mx - was.mx, now.my - was.my);
}
export const TAP_PX = 8;                       // a finger that does not hold still is still pointing at one thing
export const DOUBLE_MS = 300, DOUBLE_PX = 30;  // two taps this close in time and place are one double tap
export const GRIP_STILL = 12;                  // two fingers that moved less than this never meant to pinch
/** `dblclick` is not to be trusted after a pointer-events gesture on touch, so a double tap is detected here:
 *  the second tap close enough in time and place to the first. */
export function isSecondTap(prev: { x: number; y: number; t: number } | null | undefined, now: { x: number; y: number; t: number }): boolean {
  return !!prev && now.t - prev.t <= DOUBLE_MS && now.t >= prev.t && Math.hypot(now.x - prev.x, now.y - prev.y) <= DOUBLE_PX;
}
/** A tap is one pointer that barely moved and never became part of a two-finger gesture. Anything else — a drag,
 *  a pinch, the held second tap of a double tap — is a gesture, and a gesture never selects anything. */
export function isTap(moved: number, mostPointers: number, dragZooming = false): boolean {
  return moved < TAP_PX && mostPointers === 1 && !dragZooming;
}
/** Speed at the moment the finger left, in pixels per millisecond, from the last `ms` of its path. Older samples
 *  are ignored: a finger that dragged across the map and then stopped dead must not fling. */
export function flingVelocity(path: readonly { x: number; y: number; t: number }[], ms = 100): { vx: number; vy: number } {
  const last = path[path.length - 1];
  if (!last) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = path.length - 1; i >= 0; i--) { const p = path[i]!; if (last.t - p.t > ms) break; first = p; }
  const dt = last.t - first.t;
  return dt < 8 ? { vx: 0, vy: 0 } : { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}
export const FLING_K = 0.0035;                 // e-folding per millisecond: about a second of carry
export const FLING_STOP = 0.02, FLING_START = 0.35;   // px/ms: when to stop, and what is worth starting
/** One frame of momentum. Done when the speed has died away or the map has reached the end of its leash — and
 *  `panCam`'s own limits are what stop it, so a fling can never carry the map off the city. */
export function flingFrame(cam: Cam, v: { vx: number; vy: number }, dt: number): { cam: Cam; v: { vx: number; vy: number }; done: boolean } {
  const next = panCam(cam, v.vx * dt, v.vy * dt), f = Math.exp(-FLING_K * dt);
  const nv = { vx: v.vx * f, vy: v.vy * f };
  const still = next.cx === cam.cx && next.cy === cam.cy;
  return { cam: next, v: nv, done: still || Math.hypot(nv.vx, nv.vy) < FLING_STOP };
}
export const DRAG_ZOOM_PX = 140;
/** Double tap and hold, then drag: up zooms in, down zooms out, about the tap. The factor is against the scale
 *  the gesture started at, not the last frame, so the map goes back exactly where it was on the way back. */
export const dragZoom = (dy: number) => Math.exp(-dy / DRAG_ZOOM_PX);
export const ZOOM_MS = 200;
/** Ease-out for the animated double-tap zoom. */
export const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);

export class MapView {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private note = document.createElement('div');
  private cx = 0; private cy = 0; private s = 1; private home = { cx: 0, cy: 0, s: 1 };
  private w = 0; private h = 0; private raf = 0; private map: BaseMap | null = null;
  private touched = false; private pointers = new Map<number, { x: number; y: number }>(); private moved = 0;
  // -- what one gesture in progress knows about itself (see the pure functions above)
  private grip: Grip | null = null;                       // two fingers: their span and middle, last frame
  private gripMoved = 0;                                  // how much those two fingers ever moved: a still pair is a tap
  private twoAt = 0; private twoMid = { x: 0, y: 0 };     // when the second finger arrived, and where the middle was
  private mostPts = 0;                                    // how many fingers this gesture ever had at once
  private path: { x: number; y: number; t: number }[] = [];   // the last moments of one finger's drag, for the fling
  private lastTap: { x: number; y: number; t: number } | null = null;
  private tapWait = 0;                                    // the selection a second tap may still cancel
  private dtz: { x: number; y: number; cam: Cam } | null = null;   // double tap, held: dragging now zooms
  private animId = 0; private animAt = 0; private animN = 0;      // the fling, and the animated double-tap zoom
  private slow = matchMedia('(prefers-reduced-motion: reduce)');
  private segs: { seg: Segment; lines: Float32Array[]; box: Box }[];
  /** City and neighbourhood outlines, in world coordinates. `size` is how big the shape is, and it is used for
   *  one thing: when a tap is inside two outlines, the smaller one wins, so a Detroit neighbourhood beats the
   *  Detroit city outline (audit §3.4, "most specific wins"). */
  private areas: { area: MapArea; rings: Float32Array[]; box: Box; size: number }[];
  private areaSel = '';                                   // the outline that was tapped; the page is not told
  private ro: ResizeObserver; private mq = matchMedia('(prefers-color-scheme: dark)');
  private onScheme = () => this.redraw();
  // A laptop: the window can move to a screen with a different pixel ratio, or be zoomed. The canvas is then the
  // wrong number of pixels for its box and the map looks soft, so it is drawn again at the ratio it now has.
  private dpr = 0;
  private onWindow = () => { if (Math.min(window.devicePixelRatio || 1, 2) !== this.dpr) this.resize(); };
  // Escape leaves the full-screen map, like any other overlay.
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.el.classList.contains('big')) { e.preventDefault(); this.tool('big', this.spec.strings); } };
  private ringId = '';                                    // the feature the keyboard is on, '' for none
  private opener: HTMLElement | null = null;              // what to give the cursor back to when full screen closes
  private hidden: Element[] = [];                         // what full screen made inert
  private bar: HTMLElement | null = null;                 // Urgent help (and quick exit) inside the full-screen map
  private sub: SubwayPainter | null = null;               // subway style only; null is `standard`
  private sel = ''; private shown = ''; private lastGlyph = '';
  private avoid: [number, number, number, number][] = [];   // where the zoom buttons and the arrow pad sit over the picture
  private mqc = matchMedia('(prefers-contrast: more)');
  private release(): void { for (const n of this.hidden) (n as HTMLElement).inert = false; this.hidden = []; }

  constructor(private el: HTMLElement, private spec: MapSpec, index: BundleIndex) {
    const S = spec.strings;
    this.segs = spec.segments.map((seg) => { const lines = seg.lines.map((l) => { const a = new Float32Array(l.length * 2); l.forEach((pt, i) => { a[i * 2] = wx(pt[0]); a[i * 2 + 1] = wy(pt[1]); }); return a; }); return { seg, lines, box: merge(lines.map(boxOf)) }; });
    this.areas = (spec.areas ?? []).map((area) => {
      const rings = area.rings.map((r) => { const a = new Float32Array(r.length * 2); r.forEach((q, i) => { a[i * 2] = wx(q.lon); a[i * 2 + 1] = wy(q.lat); }); return a; });
      return { area, rings, box: merge(rings.map(boxOf)), size: rings.reduce((n, r) => n + Math.abs(shoelace(r)), 0) };
    });
    this.areaSel = spec.selected ?? '';
    this.canvas.setAttribute('role', 'img'); this.canvas.setAttribute('aria-label', spec.label); this.canvas.tabIndex = 0;
    // The picture answers to the keyboard, so it says how, and the description is read out with the label.
    // A drawn route says what its line is, in words, in the same breath: the coloured line is a picture, and
    // 1.1.1 asks for its text equivalent, not for a longer label.
    const help = document.createElement('p'); help.className = 'vh'; help.id = 'mapkeys' + ++mapNo;
    help.textContent = spec.route?.text ? `${spec.route.text} ${S.keys}` : S.keys;
    this.canvas.setAttribute('aria-describedby', help.id);
    const btn = (act: string, text: string, label: string, cls = '') => `<button type="button" class="${cls}" data-map-act="${act}" aria-label="${esc(label)}">${text}</button>`;
    const tools = document.createElement('div'); tools.className = 'maptools';
    tools.innerHTML = (spec.lead ?? '') + btn('in', '+', S.zoomIn) + btn('out', '&minus;', S.zoomOut) + btn('reset', '&#8982;', S.reset) + btn('big', '&#10530;', S.bigger);
    // Moving the map by dragging is not the only way to move it (WCAG 2.5.7): these four buttons do the same,
    // one tap at a time, for anyone who cannot hold and drag. They are also what a switch or a head pointer uses.
    const pad = document.createElement('div'); pad.className = 'mappan';
    pad.innerHTML = btn('left', '&#8592;', S.panLeft) + btn('up', '&#8593;', S.panUp) + btn('down', '&#8595;', S.panDown) + btn('right', '&#8594;', S.panRight);
    this.note.className = 'mapnote'; this.note.setAttribute('aria-live', 'polite');
    const frame = document.createElement('div'); frame.className = 'mapframe'; frame.append(this.canvas, help, tools, pad);
    pad.addEventListener('click', (e) => this.tool((e.target as HTMLElement).closest<HTMLElement>('[data-map-act]')?.dataset.mapAct, S));
    el.replaceChildren(frame, this.note);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(frame);
    this.mq.addEventListener('change', this.onScheme); this.mqc.addEventListener('change', this.onScheme);
    if (spec.style === 'subway' && spec.subway) { this.sub = new spec.subway.Painter(spec.subway.data); this.sel = selections.get(spec.key) ?? ''; }
    // A route named on a card is a button that chooses it.
    this.note.addEventListener('click', (e) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-route]')?.dataset.route; if (id && this.sub) { this.choose(id); this.canvas.focus({ preventScroll: true }); } });
    window.addEventListener('resize', this.onWindow);
    document.addEventListener('keydown', this.onKey);
    tools.addEventListener('click', (e) => this.tool((e.target as HTMLElement).closest<HTMLElement>('[data-map-act]')?.dataset.mapAct, S));
    this.listen();
    live.set(spec.key, this);
    this.resize(true);
    void loadMap(index).then((m) => { this.map = m; if (!m) this.say(`<p class="foot">${esc(S.noStreets)}</p>`); else if (!this.note.innerHTML) this.say(`<p class="foot">${esc(S.source(m.edited))}</p>`); this.redraw(); });
  }
  moveTo(cam: { cx: number; cy: number; s: number }): void { Object.assign(this, cam); this.touched = true; this.redraw(); }
  /**
   * Show `radiusMeters` around a point, eased over a fifth of a second — and simply done, under Reduce Motion.
   *
   * `goal` is where the move is headed, and it is remembered until the move lands. The page redraws itself for
   * reasons that have nothing to do with the map — a newer bundle arriving is the usual one — and a redraw
   * throws every map away and builds it again. Without `goal`, a redraw that landed inside those two hundred
   * milliseconds froze the camera one frame into the journey: the map ended up showing the whole city with a
   * dot on it, which is exactly what a person had just asked it not to do (found on the first headless run,
   * 2026-09-21). A move in flight now survives the rebuild, and the new map opens where the old one was going.
   */
  private goal: Cam | null = null;
  radiusTo(lat: number, lon: number, radiusMeters: number): void {
    this.glide(cameraForRadius({ lat, lon }, radiusMeters, this.w, this.h));
  }
  /** Highlight one outline and glide to it (`focusArea`). An area with no rings moves nothing: the wash still
   *  goes on, because "this one" is true whether or not the bundle can draw it. */
  areaTo(id: string, rings: readonly { lat: number; lon: number }[][]): void {
    this.areaSel = id;
    // The outline is REMEMBERED, not just travelled to. A map built into a flex column a moment ago has not
    // been laid out yet — the first live run at 375 px measured its frame at 24 px wide — and fitting an
    // outline into a box that size gives the widest camera there is, which is the whole region: the opposite of
    // what was asked for. So every resize re-frames the same outline until a person moves the map themselves,
    // which also means the framing survives turning the phone over.
    this.wantArea = rings;
    const to = this.w && this.h ? cameraForArea(rings, { w: this.w, h: this.h }) : null;
    if (to) this.glide(to); else this.redraw();
    this.settle();
  }
  /**
   * One frame later, check that the box we measured is the box the page really has.
   *
   * A map built into a flex column and measured in the same breath can be handed a rect the browser has not
   * finished working out — 24 px wide, on the first live run of the Areas tab — and a `ResizeObserver` never
   * fires for it, because from the observer's side nothing ever changed. So the box is read once more when the
   * frame is certainly settled, and only a real difference causes a refit: a good camera is left alone, mid
   * journey and all.
   */
  private settle(): void {
    requestAnimationFrame(() => {
      if (!this.wantArea) return;
      const r = this.canvas.parentElement?.getBoundingClientRect();
      if (r && r.width && r.height && (Math.abs(r.width - this.w) > 1 || Math.abs(r.height - this.h) > 1)) this.resize();
    });
  }
  private wantArea: readonly { lat: number; lon: number }[][] | null = null;
  /** A person's own hand on the map wins over any outline it was framing: from here it is their view. */
  private theirs(): void { this.wantArea = null; }
  private glide(to: Cam): void {
    if (this.slow.matches) { this.goal = null; this.put(to); return; }
    this.goal = to;
    const from = this.cam(); let u = 0;
    this.run((dt) => {
      u = Math.min(1, u + dt / ZOOM_MS);
      const e = ease(u);
      // The middle moves in a straight line; the zoom moves in equal steps of scale, which is what the eye reads
      // as one smooth movement rather than a lurch at the end.
      this.put({ cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, s: from.s * Math.pow(to.s / from.s, e) });
      if (u >= 1) this.goal = null;
      return u < 1;
    });
  }
  destroy(): void { this.release(); this.stopMotion(); this.cancelPick(); if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf); this.hoverRaf = 0; if (live.get(this.spec.key) === this) live.delete(this.spec.key); this.bar?.remove(); this.bar = null; this.ro.disconnect(); this.mq.removeEventListener('change', this.onScheme); this.mqc.removeEventListener('change', this.onScheme); window.removeEventListener('resize', this.onWindow); document.removeEventListener('keydown', this.onKey); cancelAnimationFrame(this.raf); if (this.goal) cameras.set(this.spec.key, this.goal); else if (this.touched) cameras.set(this.spec.key, { cx: this.cx, cy: this.cy, s: this.s }); document.body.classList.remove('mapbig'); }

  // -- camera
  private resize(first = false): void {
    const r = this.canvas.parentElement!.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return;
    // Subway badges keep out from under the buttons that float over the map (they swap corners in Arabic, so they are measured).
    if (this.sub) this.avoid = [...this.canvas.parentElement!.querySelectorAll('.maptools,.mappan')].map((n) => n.getBoundingClientRect()).filter((b) => b.width * b.height < (r.width * r.height) / 3).map((b) => [b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top]);
    this.dpr = dpr; this.w = r.width; this.h = r.height; this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) {
      const xs = this.spec.fit.map((q) => wx(q.lon)), ys = this.spec.fit.map((q) => wy(q.lat));
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), min = (this.spec.minMeters ?? 500) / M_PER_UNIT;
      const spanX = Math.max(maxX - minX, min) * 1.18, spanY = Math.max(maxY - minY, min) * 1.18;
      this.home = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s: (this.spec.cover ? Math.max : Math.min)(this.w / spanX, this.h / spanY) };
      const saved = cameras.get(this.spec.key);
      // `home` is the whole of `fit` and stays that way — it is what the reset button (&#8982;) goes back to, so
      // the four cities are one tap away however the map opened. `open` only changes where it opens.
      // An area to open on (the Areas tab) beats a radius, which beats the whole of `fit`.
      const o = this.spec.open, ar = this.spec.openArea && cameraForArea(this.spec.openArea, { w: this.w, h: this.h });
      Object.assign(this, saved ?? ar ?? (o ? cameraForRadius(o, o.radiusMeters, this.w, this.h) : this.home)); this.touched = !!saved;
    } else if (!this.touched) { this.resize(true); return; }     // the box changed size before anyone moved the map: fit again
    // An outline this map is framing: fit it again in the box it now really has. No glide — a resize is not a
    // journey, and a map that slid about every time the keyboard opened would be unusable.
    if (this.wantArea) {
      const to = cameraForArea(this.wantArea, { w: this.w, h: this.h });
      // A journey started from the wrong box is over: the destination has changed, so stop travelling to the
      // old one. Without this the glide's own frames land after the refit and undo it.
      if (to) { this.stopMotion(); this.goal = null; this.cx = to.cx; this.cy = to.cy; this.s = to.s; this.touched = true; }
    }
    this.redraw();
  }
  private cam(): Cam { return { cx: this.cx, cy: this.cy, s: this.s }; }
  private put(cam: Cam): void { this.cx = cam.cx; this.cy = cam.cy; this.s = cam.s; this.touched = true; this.redraw(); }
  private zoomAt(f: number, px = this.w / 2, py = this.h / 2): void { this.theirs(); this.put(zoomAbout(this.cam(), f, px, py, this.w, this.h)); }
  private pan(dx: number, dy: number): void { this.theirs(); this.put(panCam(this.cam(), dx, dy)); }
  // -- movement that carries on after the finger has gone: the fling, and the animated double-tap zoom.
  // One at a time, always stoppable, and never started at all under Reduce Motion (WCAG 2.3.3).
  private now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  private run(step: (dt: number) => boolean): void {
    this.stopMotion(); this.animAt = this.now(); this.animN = 0;
    const tick = () => {
      this.animId = 0;
      const t = this.now(), dt = Math.max(1, Math.min(64, t - this.animAt)); this.animAt = t;
      // The cap is not for a browser, where a fling dies in about a second: it is so a test whose frames run at
      // once can never spin.
      if (step(dt) && ++this.animN < 240) this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }
  private stopMotion(): void { if (this.animId) cancelAnimationFrame(this.animId); this.animId = 0; }
  /** A double tap, or a two-finger tap: the same zoom, eased over a fifth of a second so the eye can follow it. */
  private zoomTo(f: number, px: number, py: number): void {
    if (this.slow.matches) { this.zoomAt(f, px, py); return; }
    const from = this.cam(); let u = 0;
    this.run((dt) => { u = Math.min(1, u + dt / ZOOM_MS); this.put(zoomAbout(from, Math.pow(f, ease(u)), px, py, this.w, this.h)); return u < 1; });
  }
  private startFling(): void {
    if (this.slow.matches) return;
    let v = flingVelocity(this.path);
    if (Math.hypot(v.vx, v.vy) < FLING_START) return;
    this.run((dt) => { const r = flingFrame(this.cam(), v, dt); v = r.v; this.put(r.cam); return !r.done; });
  }
  /** A small inline map on a listing page sits in a page people scroll: one finger there belongs to the page, and
   *  two fingers move the map (the map's own words already say "Drag or use the arrows to move. Pinch … to zoom",
   *  and the four arrow buttons are on it either way). The Map tab's map and the full-screen dialog take one
   *  finger, and a mouse or a pen is never held back anywhere. */
  private oneFinger(kind: string | undefined): boolean {
    return kind !== 'touch' || !this.el.classList.contains('small') || this.el.classList.contains('big');
  }
  private cancelPick(): void { if (this.tapWait) { clearTimeout(this.tapWait); this.tapWait = 0; } }
  private tool(act: string | undefined, S: MapSpec['strings']): void {
    if (act && act !== 'big') this.theirs();
    const step = 0.35 * Math.min(this.w, this.h);
    if (act === 'in') this.zoomAt(1.6); else if (act === 'out') this.zoomAt(1 / 1.6);
    else if (act === 'left') this.pan(step, 0); else if (act === 'right') this.pan(-step, 0);
    else if (act === 'up') this.pan(0, step); else if (act === 'down') this.pan(0, -step);
    else if (act === 'reset') { Object.assign(this, this.home); this.touched = false; cameras.delete(this.spec.key); this.redraw(); }
    else if (act === 'big') {
      const big = this.el.classList.toggle('big'); document.body.classList.toggle('mapbig', big);
      const b = this.el.querySelector<HTMLElement>('[data-map-act="big"]')!; b.innerHTML = big ? '&times;' : '&#10530;'; b.setAttribute('aria-label', big ? S.smaller : S.bigger);
      // Full screen covers the page, so for the keyboard and for a screen reader it has to BE the page: everything
      // underneath is made inert (not focusable, not read), Escape closes it, and the cursor comes back to the
      // button that opened it (WCAG 2.4.3, 2.4.11, 2.1.2).
      //
      // It used to start below the top bar instead, to leave "Urgent help" in reach — but inert is what the page
      // behind a modal gets, so the bar (and, on a laptop, the whole side rail) sat there looking like buttons and
      // answering nothing: the worst of both (web review, 2026-09-20). Now the map really does cover the page, and
      // the buttons that must never be more than one tap away are brought INSIDE it. They are the page's own
      // buttons, cloned, so they carry their own words in whatever language the screen is in and keep working
      // through the app's own click handling.
      if (big) {
        this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', this.spec.label);
        // iOS Safari leaves `document.body` as the active element after a tap, so "what opened this" has to fall
        // back to the button itself or the cursor lands nowhere when the map closes (web review, 2026-09-20).
        const from = document.activeElement as HTMLElement | null;
        this.opener = from && from !== document.body && from !== document.documentElement ? from : b;
        this.bar = this.urgentBar();
        if (this.bar) this.el.prepend(this.bar);
        // The map's own box sits inside #app, so the parts of #app that are not it are made inert one by one too.
        this.hidden = coverTargets(this.el, document.body);
        for (const n of this.hidden) (n as HTMLElement).inert = true;
        this.canvas.focus();
      } else {
        this.el.removeAttribute('role'); this.el.removeAttribute('aria-modal'); this.el.removeAttribute('aria-label');
        this.bar?.remove(); this.bar = null;
        this.release();
        (this.opener ?? b).focus(); this.opener = null;
      }
    }
  }
  /** The page's own "Urgent help" — and its quick exit, on a screen that has one — copied into the full-screen
   *  map. Copies, not new buttons: they keep their words, their labels and the `data-go`/`data-exit` hooks the
   *  app already listens for, in every language, with nothing to keep in step. */
  private urgentBar(): HTMLElement | null {
    const find = (sel: string) => document.querySelector<HTMLElement>(`header.top ${sel}`) ?? document.querySelector<HTMLElement>(`nav.tabs ${sel}`);
    const wanted = ['[data-exit]', '.urgent'].map(find).filter((n): n is HTMLElement => !!n);
    if (!wanted.length) return null;
    const bar = document.createElement('div'); bar.className = 'mapbar';
    for (const n of wanted) { const copy = n.cloneNode(true) as HTMLElement; copy.removeAttribute('id'); bar.append(copy); }
    return bar;
  }
  private listen(): void {
    const c = this.canvas, at = (e: PointerEvent | WheelEvent | MouseEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    // A finger or a mouse puts the keyboard's ring away: it is the keyboard's cursor, and nothing about
    // pointing at the map changed.
    const when = (e: { timeStamp?: number }) => (typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : this.now());
    c.addEventListener('pointerdown', (e) => { this.theirs(); if (this.ringId) { this.ringId = ''; this.redraw(); }
      // A finger on the map stops whatever the map was still doing on its own, at once and where it is.
      this.stopMotion();
      c.setPointerCapture(e.pointerId);
      const q = at(e), t = when(e);
      this.pointers.set(e.pointerId, q);
      if (this.pointers.size === 1) {
        this.moved = 0; this.mostPts = 1; this.path = [{ ...q, t }];
        // The second tap of a double tap, held down: from here a drag up or down zooms about the first tap.
        this.dtz = isSecondTap(this.lastTap, { ...q, t }) ? { x: q.x, y: q.y, cam: this.cam() } : null;
        if (this.dtz) this.cancelPick();
      } else {
        this.dtz = null; this.mostPts = Math.max(this.mostPts, this.pointers.size);
        if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]; this.twoAt = t; this.twoMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; this.gripMoved = 0; }
      }
      this.grip = null;
    });
    c.addEventListener('blur', () => { if (this.ringId) { this.ringId = ''; this.redraw(); } });
    c.addEventListener('pointermove', (e) => {
      const was = this.pointers.get(e.pointerId); if (!was) return;
      const now = at(e); this.pointers.set(e.pointerId, now);
      if (this.pointers.size === 1) {
        this.hoverNow = '';                                  // a drag is not a hover: ask again when it ends
        this.moved += Math.abs(now.x - was.x) + Math.abs(now.y - was.y);
        this.path.push({ ...now, t: when(e) }); if (this.path.length > 24) this.path.shift();
        if (this.dtz) this.put(zoomAbout(this.dtz.cam, dragZoom(now.y - this.dtz.y), this.dtz.x, this.dtz.y, this.w, this.h));
        else if (this.oneFinger(e.pointerType)) this.pan(now.x - was.x, now.y - was.y);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const grip = gripOf(a, b);
        if (this.grip) { this.gripMoved += Math.abs(grip.d - this.grip.d) + Math.hypot(grip.mx - this.grip.mx, grip.my - this.grip.my); this.put(pinchCam(this.cam(), this.grip, grip, this.w, this.h)); }
        this.grip = grip;
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      this.grip = null;
      if (this.pointers.size) return;                       // a finger is still down: the gesture is not over
      const q = at(e), t = when(e), pts = this.mostPts, held = this.dtz;
      this.mostPts = 0; this.dtz = null;
      if (e.type !== 'pointerup') { this.lastTap = null; return; }   // cancelled (the page took the gesture)
      // The second tap was held: if it dragged, the zoom already happened under the finger; if it did not, it was
      // a plain double tap after all.
      if (held) { this.lastTap = null; if (isTap(this.moved, pts)) this.zoomTo(1.8, held.x, held.y); return; }
      // Two fingers put down and lifted without moving: zoom out, the other half of the double tap.
      if (pts === 2) { this.lastTap = null; if (this.gripMoved < GRIP_STILL && t - this.twoAt <= DOUBLE_MS) this.zoomTo(1 / 1.8, this.twoMid.x, this.twoMid.y); return; }
      if (isTap(this.moved, pts)) {
        const tap = { x: q.x, y: q.y, t };
        if (isSecondTap(this.lastTap, tap)) { this.cancelPick(); this.lastTap = null; this.zoomTo(1.8, q.x, q.y); return; }
        this.lastTap = tap;
        // On a touch screen a second tap can always follow, so selection waits out the double-tap window: a card
        // that flashes up and is then thrown away by a zoom is worse than a fifth of a second. A mouse gets its
        // card at once, exactly as it always did, and a double click selects and then zooms.
        if (e.pointerType === 'touch') this.tapWait = setTimeout(() => { this.tapWait = 0; this.pick(q); }, DOUBLE_MS) as unknown as number;
        else this.pick(q);
      } else if (this.oneFinger(e.pointerType)) this.startFling();
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    // The cursor. A mouse or a pen only: `pointertype` is 'touch' for a finger, and a finger has no cursor.
    c.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') this.hover(at(e)); });
    c.addEventListener('pointerleave', () => this.hover(null));
    // A trackpad pinch arrives as a wheel with ctrlKey. It is zoom, not scroll, and it must not reach the page.
    c.addEventListener('wheel', (e) => { e.preventDefault(); const q = at(e); this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : e.deltaMode ? 0.05 : 0.0022)), q.x, q.y); }, { passive: false });
    // Older iOS Safari answers a pinch with its own page zoom before any pointer event is sent. These three are
    // the only way to say no to it, and they have to be non-passive to be allowed to.
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) (c as HTMLElement).addEventListener(g, (ev: Event) => ev.preventDefault(), { passive: false });
    c.addEventListener('keydown', (e) => {
      const step = 60, act = mapKey(e);
      if (act === 'in') this.zoomAt(1.5); else if (act === 'out') this.zoomAt(1 / 1.5);
      else if (act === 'left') this.pan(step, 0); else if (act === 'right') this.pan(-step, 0); else if (act === 'up') this.pan(0, step); else if (act === 'down') this.pan(0, -step);
      else if (act === 'next') this.step(1); else if (act === 'prev') this.step(-1);
      else if (act === 'open') { if (!this.ringId) return; this.open(); }
      // Escape steps out of the features first and only then closes the full-screen map: one Escape, one thing.
      else if (act === 'escape' && !this.ringId && this.sel) { this.choose(''); e.stopPropagation(); }   // then the chosen route, then full screen
      else if (act === 'escape') { if (!this.ringId) return; this.ringId = ''; this.say(`<p class="foot">${esc(this.spec.strings.focusOff)}</p>`); this.shown = ''; this.redraw(); e.stopPropagation(); }   // (a chosen route's card comes back with the redraw)
      else return;
      e.preventDefault();
    });
  }

  // -- the roving focus: what is on screen, in order, and the ring that says where the keyboard is
  private viewBox(): Box { return [this.cx - this.w / 2 / this.s, this.cy - this.h / 2 / this.s, this.cx + this.w / 2 / this.s, this.cy + this.h / 2 / this.s]; }
  /** Everything on screen right now that a keyboard may land on, in order. Recomputed on every step, because
   *  panning and zooming change what is there — the ring stays on its own feature by id, not by position. */
  private features(): MapFeature[] {
    const view = this.viewBox(), out: (MapFeature & { kind: 'stop' | 'segment' | 'dot' | 'area' })[] = [], S = this.spec.strings;
    // A drawn route's own markers, in the order they are walked: start, every boarding and alighting, end.
    // `route` is the place in the trip, so N steps along the journey rather than round the screen.
    (this.spec.route?.marks ?? []).forEach((m, i) => {
      const x = this.X(wx(m.lon)), y = this.Y(wy(m.lat));
      if (x < 0 || y < 0 || x > this.w || y > this.h) return;
      out.push({ kind: 'stop', id: 'stop:' + i, route: i, d: 0, label: m.label, sub: m.sub ?? '', box: [x - 12, y - 12, x + 12, y + 12] });
    });
    this.segs.forEach((g, i) => {
      if (!touches(g.box, view)) return;
      const xs = [this.X(g.box[0]), this.X(g.box[2])], ys = [this.Y(g.box[1]), this.Y(g.box[3])];
      out.push({ kind: 'segment', id: 'seg:' + g.seg.id, route: i, d: 0, label: g.seg.name, sub: S.phase[g.seg.phase] ?? '',
        go: g.seg.id === this.spec.focus ? undefined : this.spec.segGo?.(g.seg.id),
        box: [Math.max(6, Math.min(...xs)), Math.max(6, Math.min(...ys)), Math.min(this.w - 6, Math.max(...xs)), Math.min(this.h - 6, Math.max(...ys))] });
    });
    // An outline is a feature like any other: N and P reach it, Enter opens its page, and the ring is drawn
    // round it. An area carries no listing and no dot, so nothing about the sensitive rules is in play here.
    for (const a of this.areas) {
      if (!touches(a.box, view)) continue;
      const xs = [this.X(a.box[0]), this.X(a.box[2])], ys = [this.Y(a.box[1]), this.Y(a.box[3])];
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      out.push({ kind: 'area', id: 'area:' + a.area.id, route: 0, d: Math.hypot(cx - this.w / 2, cy - this.h / 2),
        label: a.area.name, sub: a.area.sub, go: a.area.go,
        box: [Math.max(6, Math.min(...xs)), Math.max(6, Math.min(...ys)), Math.min(this.w - 6, Math.max(...xs)), Math.min(this.h - 6, Math.max(...ys))] });
    }
    for (const dot of focusableDots(this.spec.dots ?? [])) {
      const x = this.X(wx(dot.lon)), y = this.Y(wy(dot.lat));
      if (x < 0 || y < 0 || x > this.w || y > this.h) continue;
      out.push({ kind: 'dot', id: `dot:${dot.lat},${dot.lon},${dot.label}`, route: 0, d: Math.hypot(x - this.w / 2, y - this.h / 2),
        label: dot.label, sub: dot.sub ?? '', go: dot.go, dir: dot.dir, box: [x - 11, y - 11, x + 11, y + 11] });
    }
    const base = orderFeatures(out);
    if (!this.sub || !this.spec.subway) return base;
    // Subway style: today's order, kept exactly, and only added to (hubs, terminals, interchanges, routes).
    return this.spec.subway.order(base, this.sub.features().map((f) => ({ ...f, route: 0, sel: f.id })));
  }
  /** Subway style: choose a route, a stop, an interchange — or nothing. Kept across a redraw of the page. */
  private choose(id: string): void {
    this.sel = id; this.shown = ''; this.lastGlyph = id ? this.lastGlyph : '';
    if (id) selections.set(this.spec.key, id); else { selections.delete(this.spec.key); this.say(''); }
    if (id) this.sub?.need(id);
    this.redraw();
  }
  private step(dir: number): void {
    const list = this.features(), S = this.spec.strings;
    if (!list.length) { this.ringId = ''; this.redraw(); this.say(`<p class="foot">${esc(S.focusNone)}</p>`); return; }
    const at = list.findIndex((f) => f.id === this.ringId);
    const f = list[at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length]!;
    this.ringId = f.id;
    // 2.4.11: a ring half off the edge of the canvas is a ring that is obscured. Anything not well inside the
    // picture is brought to the middle before it is announced.
    const cx = (f.box[0] + f.box[2]) / 2, cy = (f.box[1] + f.box[3]) / 2, m = 40;
    if (cx < m || cy < m || cx > this.w - m || cy > this.h - m) this.pan(this.w / 2 - cx, this.h / 2 - cy);
    this.redraw();
    // The same card a tap produces — its words, and its "See details" button — plus what Enter will do.
    // What the keyboard could not be given (the caps of section 9) and what the painter left out: the list has them all.
    const added = list.filter((x) => x.kind !== 'segment' && x.kind !== 'dot').length;
    const more = this.sub && f === list[list.length - 1] ? Math.max(0, this.sub.features().length - added) + this.sub.more : 0;
    this.say(`<div class="mappick"><span><strong>${esc(f.label)}</strong>${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span>${dirBtn(f.dir, S)}${f.go ? `<button class="btn ghost" data-go="${esc(f.go)}">${esc(S.details)}</button>` : ''}</div><p class="vh">${esc(S.focusHint)}</p>${more && this.spec.subway ? `<p class="foot">${esc(this.spec.subway.more(more))}</p>` : ''}`);
  }
  /** Enter on the ring opens the same screen the card's own button opens — the app's `data-go` handling, not a
   *  second copy of it. A feature with nowhere to go (the stretch you are already on) simply stays put. */
  private open(): void {
    const f = this.sub ? this.features().find((x) => x.id === this.ringId) : undefined;
    if (f?.sel) { this.choose(f.sel); return; }
    this.note.querySelector<HTMLElement>('[data-go]')?.click();
  }
  private drawRing(c: CanvasRenderingContext2D, case_: string, focus: string): void {
    if (!this.ringId) return;
    const f = this.features().find((x) => x.id === this.ringId);
    if (!f) { this.ringId = ''; return; }
    const [x0, y0, x1, y1] = f.box, p = 7, r = 10;
    const path = () => { c.beginPath(); c.moveTo(x0 - p + r, y0 - p); c.arcTo(x1 + p, y0 - p, x1 + p, y1 + p, r); c.arcTo(x1 + p, y1 + p, x0 - p, y1 + p, r); c.arcTo(x0 - p, y1 + p, x0 - p, y0 - p, r); c.arcTo(x0 - p, y0 - p, x1 + p, y0 - p, r); c.closePath(); };
    c.setLineDash([]);
    // A casing under the ring, so the ring keeps its 3:1 wherever it lands — over a street, a park or a route.
    // 3 px of solid colour with 1.5 px of casing either side: 2.4.11, 2.4.13.
    c.strokeStyle = case_; c.lineWidth = 6; path(); c.stroke();
    c.strokeStyle = focus; c.lineWidth = 3; path(); c.stroke();
  }

  /** Parks are drawn unless a screen says otherwise; only the Map tab, which has a switch for them, ever does. */
  private parksOn = () => this.spec.parks !== false;

  // -- tap: a listing dot, then the greenway, then a park
  private X = (x: number) => (x - this.cx) * this.s + this.w / 2;
  private Y = (y: number) => (y - this.cy) * this.s + this.h / 2;
  private say(html: string): void { this.note.innerHTML = html; }
  /**
   * What is under a point on the map, in the app's own pick order:
   *
   *     listing dot → subway glyph → stop → greenway → route → AREA → park
   *
   * One function, so a tap and the mouse cursor can never disagree about what is tappable (Kyle, 2026-09-22).
   * It decides and returns; it changes nothing. `pick` acts on the answer; `hover` only asks whether there is
   * one. An area sits ahead of the parks and behind everything a person came to the map to find, and the
   * smallest area containing the point wins — a Detroit neighbourhood beats the Detroit city outline.
   */
  private probe(q: { x: number; y: number }): Hit | null {
    const S = this.spec.strings;
    let best: { d: number; dot: MapDot } | undefined;
    for (const dot of this.spec.dots ?? []) { const d = Math.hypot(this.X(wx(dot.lon)) - q.x, this.Y(wy(dot.lat)) - q.y); if (d < 24 && (!best || d < best.d)) best = { d, dot }; }
    if (best) return { kind: 'card', title: best.dot.label, sub: best.dot.sub ?? '', go: best.dot.go, dir: best.dot.dir };
    // Subway style: a station, a pill, a terminal, a marker or a badge, each with a 44-unit box of its own.
    const std = this.sub ? this.sub.rest : this.spec.overlays ?? [];
    const glyph = this.sub?.hit(q, this.lastGlyph);
    if (glyph) return { kind: 'glyph', glyph: glyph.glyph, sel: glyph.sel };
    // A stop or station on a switched-on layer: its name, and what kind of thing it is, in words.
    let stop: { d: number; name: string; label: string } | undefined;
    for (const o of std) for (const pt of o.points) {
      const d = Math.hypot(this.X(pt.x) - q.x, this.Y(pt.y) - q.y);
      if (d < 18 && (!stop || d < stop.d)) stop = { d, name: pt.name, label: o.label };
    }
    if (stop) return { kind: 'card', title: stop.name || stop.label, sub: stop.name ? stop.label : '' };
    let near: { d: number; seg: Segment } | undefined;
    for (const g of this.segs) for (const l of g.lines) for (let i = 0; i + 3 < l.length; i += 2) {
      const d = distToPiece(q.x, q.y, this.X(l[i]!), this.Y(l[i + 1]!), this.X(l[i + 2]!), this.Y(l[i + 3]!));
      if (d < 16 && (!near || d < near.d)) near = { d, seg: g.seg };
    }
    if (near) return { kind: 'card', title: near.seg.name, sub: S.phase[near.seg.phase] ?? '', go: near.seg.id === this.spec.focus ? undefined : this.spec.segGo?.(near.seg.id) };
    const line = this.sub?.hitLine(q);
    if (line) return { kind: 'glyph', glyph: this.lastGlyph, sel: line };
    // A route or a bike lane on a switched-on layer.
    let route: { d: number; name: string; label: string } | undefined;
    for (const o of this.sub ? [...std, ...(this.spec.overlays ?? []).filter((x) => x.id === 'go:bike_lanes')] : this.spec.overlays ?? []) for (const l of o.lines) {
      if (!touches(l.box, this.viewBox())) continue;
      for (let i = 0; i + 3 < l.pts.length; i += 2) {
        const d = distToPiece(q.x, q.y, this.X(l.pts[i]!), this.Y(l.pts[i + 1]!), this.X(l.pts[i + 2]!), this.Y(l.pts[i + 3]!));
        if (d < 14 && (!route || d < route.d)) route = { d, name: l.name, label: o.label };
      }
    }
    if (route) return { kind: 'card', title: route.name || route.label, sub: route.name ? route.label : '' };
    const X = this.cx + (q.x - this.w / 2) / this.s, Y = this.cy + (q.y - this.h / 2) / this.s;
    const area = this.areaAt(X, Y);
    if (area) return { kind: 'area', id: area.area.id, title: area.area.name, sub: area.area.sub, go: area.area.go };
    const park = !this.parksOn() ? undefined : this.map?.parks.find((a) => a.name && X >= a.box[0] && X <= a.box[2] && Y >= a.box[1] && Y <= a.box[3] && inside(X, Y, a.pts));
    return park ? { kind: 'card', title: park.name, sub: S.park } : null;
  }
  /** The smallest outline holding a world point, or none. */
  private areaAt(X: number, Y: number): { area: MapArea; size: number } | undefined {
    let found: { area: MapArea; size: number } | undefined;
    for (const a of this.areas) {
      if (X < a.box[0] || X > a.box[2] || Y < a.box[1] || Y > a.box[3]) continue;
      // `evenodd` over every ring at once, so Detroit's enclave holes are not part of Detroit.
      let hit = false;
      for (const r of a.rings) if (inside(X, Y, r)) hit = !hit;
      if (hit && (!found || a.size < found.size)) found = { area: a.area, size: a.size };
    }
    return found;
  }
  private pick(q: { x: number; y: number }): void {
    const S = this.spec.strings;
    // "Directions" comes FIRST on the card: on the Map tab it is the thing a person came for, and "See details"
    // is the longer road to the same place. It opens our own directions, on this phone (DECISIONS 2026-09-22).
    const card = (title: string, sub: string, go?: string, dir?: string) => this.say(`<div class="mappick"><span><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${dirBtn(dir, S)}${go ? `<button class="btn ghost" data-go="${esc(go)}">${esc(S.details)}</button>` : ''}</div>`);
    const hit = this.probe(q);
    if (hit?.kind === 'glyph') { this.lastGlyph = hit.glyph; return this.choose(hit.sel); }
    // A tap on the empty map, or on something that is not a route, lets a chosen route go.
    if (this.sel && hit?.kind !== 'card') this.choose('');
    if (!hit) return;
    // A tapped outline stays highlighted, and the highlight lives HERE rather than in the page: telling the page
    // would redraw it, and a redraw throws the map away — taking the card that was just opened with it.
    if (hit.kind === 'area') {
      this.areaSel = hit.id; this.redraw();
      // The Areas tab takes the tap itself (`onArea`): there the answer to a tap is the area's own page, not a
      // card offering to open it. Everywhere else the card is what it has always been.
      if (this.spec.onArea) { this.spec.onArea(hit.id); return; }
      return card(hit.title, hit.sub, hit.go);
    }
    card(hit.title, hit.sub, hit.go, hit.dir);
  }
  /**
   * The mouse cursor (Kyle, 2026-09-22): a hand over anything a click would open or name, and the grab hand
   * everywhere else, because everywhere else the map is a thing you drag. The hit test is `probe` — the very
   * same one the click runs — so the cursor can never promise something a click does not do. Once a frame at
   * most, and only for a mouse or a pen: a touch screen has no cursor and must pay nothing for this.
   */
  private hoverRaf = 0; private hoverAt: { x: number; y: number } | null = null; private hoverNow = '';
  private hover(q: { x: number; y: number } | null): void {
    this.hoverAt = q;
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      // '' rather than 'grab': an empty inline value hands the canvas back to style.css, which already says
      // `grab`, and — the point — `grabbing` while a button is held. An inline 'grab' would win over both.
      const want = this.hoverAt && !this.pointers.size && this.probe(this.hoverAt) ? 'pointer' : '';
      if (want === this.hoverNow) return;
      this.hoverNow = want;
      const style = (this.canvas as Partial<HTMLElement>).style;
      if (style) style.cursor = want;
    });
  }

  // -- drawing
  redraw(): void { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.draw()); }
  private trace(pts: Float32Array): void {
    const c = this.ctx; c.moveTo(this.X(pts[0]!), this.Y(pts[1]!));
    for (let i = 2; i < pts.length; i += 2) c.lineTo(this.X(pts[i]!), this.Y(pts[i + 1]!));
  }
  private draw(): void {
    const c = this.ctx, { w, h } = this, mpp = M_PER_UNIT / this.s;                        // meters per pixel
    const view: Box = this.viewBox();
    const col = { out: css('--map-out'), outInk: css('--map-out-ink'), land: css('--map-land'), park: css('--map-park'), parkInk: css('--map-park-ink'), bnd: css('--map-bnd'), road: css('--map-road'), main: css('--map-main'), fwy: css('--map-fwy'), ink: css('--map-ink'), halo: css('--map-land'), brand: css('--brand'), muted: css('--muted'), strong: css('--ink'), surface: css('--surface'), focus: css('--focus'), gwOpen: css('--gw-open'), gwBuild: css('--gw-build'), gwFund: css('--gw-fund'), gwPlan: css('--gw-plan'), gwCase: css('--gw-case'), routeWalk: css('--route-walk'), routeRide: css('--route-ride') };
    // Subway style (docs/MAP-STYLE.md): the painter works the frame out first, because its badges and names
    // outrank street names and because the basemap under it is quietened. `sub` is null in `standard`, and
    // every line below that mentions it then does exactly what it did before there was a second style.
    const sub = this.sub;
    const blocks = sub ? sub.begin({ c, w, h, s: this.s, cx: this.cx, cy: this.cy, overlays: this.spec.overlays ?? [], selection: this.sel, css, avoid: this.avoid,
      contrast: matchMedia('(forced-colors: active)').matches ? 'forced' : this.mqc.matches ? 'more' : 'plain',
      fontScale: Math.max(1, Math.min(1.5, (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16)) }) : [];
    const quiet = !!sub?.quiet;
    if (quiet) Object.assign(col, { park: css('--map-park-q'), parkInk: css('--map-park-ink-q'), road: css('--map-road-q'), main: css('--map-main-q'), fwy: css('--map-fwy-q'), ink: css('--map-ink-q') });
    c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]);
    c.fillStyle = this.map ? col.out : col.land; c.fillRect(0, 0, w, h);
    const labels: { name: string; pts: Float32Array; cls: number }[] = [];
    if (this.map) {
      // Outside the four cities. Two pale fills a step apart (1.20:1) were not a difference anyone could see, and
      // no colour can fix that without making the ground outside darker than the streets inside it. So the area
      // is a TEXTURE instead: sparse diagonal hatching whose own lines clear 3:1 against both fills, which reads
      // as "not our area" at a glance and passes 1.4.11 on the lines themselves (DECISIONS 2026-09-20).
      c.strokeStyle = col.outInk; c.lineWidth = 1; c.beginPath();
      for (let x = -h; x < w + h; x += 11) { c.moveTo(x, 0); c.lineTo(x + h, h); }
      c.stroke();
      c.fillStyle = col.land; c.beginPath(); for (const ring of this.map.boundary) { this.trace(ring); c.closePath(); } c.fill('evenodd');
      // The city edge is also a line, not only a change of shade: two pale fills a step apart are not a boundary
      // anyone can see (WCAG 1.4.11).
      c.strokeStyle = col.main; c.lineWidth = 1.5; c.stroke();
      // "City parks" off means off: no green shapes, no pocket-park dots, no names further down.
      if (this.parksOn()) {
        c.fillStyle = col.park; c.beginPath(); for (const a of this.map.parks) if (touches(a.box, view)) { this.trace(a.pts); c.closePath(); } c.fill();
        // Zoomed out, a pocket park is smaller than a pixel: mark it with a small dot so it can still be found.
        c.fillStyle = col.parkInk; c.beginPath();
        if (!this.spec.quiet) for (const a of this.map.parks) if (touches(a.box, view) && (a.box[2] - a.box[0]) * this.s < 7) { const x = this.X((a.box[0] + a.box[2]) / 2), y = this.Y((a.box[1] + a.box[3]) / 2); c.moveTo(x + 2, y); c.arc(x, y, 2, 0, 6.2832); }
        c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1;
      }
      // Every road is now drawn at a colour that really clears 3:1 against the land AND against a park (1.4.11).
      // Three things stop that turning the map into a grey slab, which is why the item was open until today:
      //  * a small street is a HAIRLINE. A 0.75 px line reads far lighter than its own swatch, so the mesh is a
      //    texture and the greenway, the layers and the dots still sit on top of it.
      //  * a small street only appears at the zoom where it means anything. It used to come in at 9 m/px, which
      //    is a whole district's worth of side streets at once; now it waits for 6, and the next size for 11.
      //  * width carries the hierarchy, not fade. Freeway, main road and side street are within a step of each
      //    other in colour and a long way apart in weight.
      const showCls = mpp < 6 ? 4 : mpp < 11 ? 3 : 2;
      const width = (cls: number) => Math.max(cls === 4 ? 0.9 : cls === 3 ? 1.2 : 1.6, Math.min(cls <= 2 ? 6.5 : 4.5, ([18, 20, 15, 10, 7][cls]!) / mpp));
      const widthQ = (cls: number) => (quiet ? Math.max(1, width(cls) * 0.8) : width(cls));   // quietened: thinner, never under 1
      const visible: Line[][] = [[], [], [], [], []];
      for (const r of this.map.roads) if (touches(r.box, view)) visible[r.cls]!.push(r);
      if (showCls > 2) for (const cell of this.map.cells) if (touches(cell.box, view)) for (const r of cell.roads) if (r.cls <= showCls && touches(r.box, view)) visible[r.cls]!.push(r);
      // Close in, the big roads get a casing in the land colour. It is only worth the pass when the lines are
      // wide enough for it to show, and it is what keeps a freeway readable where it runs through a park.
      if (mpp < 4 && !quiet) for (const cls of [2, 1, 0]) {
        const list = visible[cls]!; if (!list.length) continue;
        c.strokeStyle = col.land; c.lineWidth = width(cls) + 2.5;
        c.beginPath(); for (const r of list) this.trace(r.pts); c.stroke();
      }
      for (const cls of [4, 3, 2, 1, 0]) {
        const list = visible[cls]!; if (!list.length) continue;
        c.strokeStyle = cls === 0 ? col.fwy : cls <= 2 ? col.main : col.road; c.lineWidth = widthQ(cls);
        c.beginPath(); for (const r of list) this.trace(r.pts); c.stroke();
      }
      const labelCls = (mpp < 4.6 ? 4 : mpp < 8 ? 3 : mpp < 14 ? 2 : mpp < 30 ? 1 : 0) - (quiet ? 1 : 0);   // quietened: fewer names compete with badges
      for (const cls of [0, 1, 2, 3, 4]) if (cls <= labelCls) for (const r of visible[cls]!) if (r.name) labels.push({ name: r.name, pts: r.pts, cls });
    }
    if (this.spec.outline) {
      c.beginPath(); for (const ring of this.spec.outline) { ring.forEach((q, i) => (i ? c.lineTo(this.X(wx(q.lon)), this.Y(wy(q.lat))) : c.moveTo(this.X(wx(q.lon)), this.Y(wy(q.lat))))); c.closePath(); }
      c.globalAlpha = 0.12; c.fillStyle = col.brand; c.fill(); c.globalAlpha = 1; c.strokeStyle = col.strong; c.lineWidth = 2.5; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]);
    }
    // City and neighbourhood outlines (`place:areas`; Kyle, 2026-09-22: "The user needs to be able to see the
    // boundaries of the neighborhoods on the map"). A line and — from mid zoom — a name, and, for the one that
    // was tapped, a wash so the tap can be seen. **Never a fill that carries a value**: docs/13 rule 1 forbids a
    // choropleth, and a map that shades an area by a number is a league table with a picture on it.
    //
    // Every outline is drawn in EVERY band now. Until today a neighbourhood appeared only under 14 m/px, so the
    // Map tab — which opens on the whole city — showed four city edges and nothing else, and the 205 outlines a
    // person came for were invisible at the only zoom they ever saw. What stops 205 dotted outlines being a mesh
    // is not hiding them: it is the WEIGHT. At city zoom the line is 0.6 px, thinner than the thinnest street the
    // map draws there (1.6), with a 1-on-3-off dot; it reads as a faint lattice, and the dots, the transit lines
    // and the greenway all sit above it. `boundaryStyle` (bounds.ts) is the whole table, shared with the ports.
    const areaLabels: { name: string; x: number; y: number; d: number }[] = [];
    if (this.areas.length) {
      const bs = boundaryStyle(mpp);
      const trace = (rings: Float32Array[]) => { c.beginPath(); for (const r of rings) { this.trace(r); c.closePath(); } };
      const shown = this.areas.filter((a) => touches(a.box, view));
      for (const a of shown) {
        const on = a.area.id === this.areaSel, city = a.area.id.startsWith('city_');
        if (on) { trace(a.rings); c.globalAlpha = BOUNDARY_WASH_ALPHA; c.fillStyle = col.brand; c.fill('evenodd'); c.globalAlpha = 1; }
        // Dashed, so a boundary is never mistaken for a street: the map is full of grey lines and an area edge is
        // not one of them, and under forced colours the dash is the only thing left that says so. A city is drawn
        // a touch heavier than a neighbourhood — weight, never colour and never a fill. The selected one goes
        // solid, heavier still and in the focus colour.
        c.setLineDash(on ? [] : bs.dash); c.strokeStyle = on ? col.focus : col.bnd; c.lineWidth = on ? BOUNDARY_SELECTED_WIDTH : city ? bs.cityWidth : bs.width;
        trace(a.rings); c.stroke(); c.setLineDash([]);
        const wide = (a.box[2] - a.box[0]) * this.s;
        if (bs.names && wide > bs.nameMinPx) {
          const x = this.X((a.box[0] + a.box[2]) / 2), y = this.Y((a.box[1] + a.box[3]) / 2);
          if (x > 0 && x < w && y > 0 && y < h) areaLabels.push({ name: a.area.name, x, y, d: Math.hypot(x - w / 2, y - h / 2) });
        }
      }
      // Nearest the middle of the screen first, and no more than the band's cap: downtown has a dozen outlines in
      // one frame, and a name that loses the collision test is dropped rather than shrunk or overlapped.
      areaLabels.sort((p, q) => p.d - q.d); areaLabels.length = Math.min(areaLabels.length, bs.nameCap);
    }
    // Transport layers a person switched on (bus routes, the streetcar, bike lanes, stations). They are drawn
    // under the greenway and under the listing dots, so switching a layer on never hides the thing a screen is
    // about. Colour never carries the meaning alone: the switcher names every layer, and tapping names it again.
    for (const o of sub ? sub.rest : this.spec.overlays ?? []) {
      if (!o.lines.length) continue;
      const lw = Math.max(1.6, Math.min(o.width ?? 5, (o.width ?? 5) * 18 / mpp));
      // A casing first, exactly as the greenway has one. A bus route is 3:1 against the land and against a park,
      // but it crosses roads that are now 3:1 themselves, and no one colour can be 3:1 against both a near-white
      // land and a mid-grey street. The casing is what its 3:1 is measured against, all the way along (1.4.11).
      c.strokeStyle = col.gwCase; c.lineWidth = lw + 3; c.setLineDash([]);
      c.beginPath(); for (const l of o.lines) if (touches(l.box, view)) this.trace(l.pts); c.stroke();
      c.strokeStyle = css(o.css) || col.brand; c.lineWidth = lw; c.setLineDash((o.dash ?? []).map((d) => d * lw));
      c.beginPath(); for (const l of o.lines) if (touches(l.box, view)) this.trace(l.pts); c.stroke();
    }
    c.setLineDash([]);
    if (sub) sub.lines();                               // bike lanes, SMART, DDOT, trunks, QLINE, People Mover, the chosen route
    // Greenway, drawn like a transit line: one width the whole way, a casing so it reads over the streets, and a
    // colour and dash for each phase. Colour never carries the meaning alone: the key under the map says it in words,
    // and tapping a stretch names its phase. Where stretches meet, a station dot marks the join once you zoom in.
    const stroke = (g: { lines: Float32Array[] }, color: string, lw: number, dash: number[]) => { c.strokeStyle = color; c.lineWidth = lw; c.setLineDash(dash); c.beginPath(); for (const l of g.lines) this.trace(l); c.stroke(); };
    const gwW = Math.max(4.5, Math.min(9, 18 / mpp));
    const gwStyle: Record<string, { color: string; dash: number[] }> = {
      open: { color: col.gwOpen, dash: [] },
      under_construction: { color: col.gwBuild, dash: [gwW * 2.4, gwW * 1.5] },
      funded: { color: col.gwFund, dash: [gwW * 1.4, gwW * 1.3] },
      planned: { color: col.gwPlan, dash: [0.1, gwW * 1.9] },                    // round caps turn this into dots
    };
    const onScreen = this.segs.filter((g) => touches(g.box, view));
    const focused = this.spec.focus ? onScreen.filter((g) => g.seg.id === this.spec.focus) : [];
    // One casing pass under everything, so the route looks continuous even where phases change.
    for (const g of onScreen) stroke(g, col.gwCase, gwW + 4, []);
    // Then each phase, least built first, so an open stretch is never hidden by a dotted one.
    for (const phase of ['planned', 'funded', 'under_construction', 'open']) {
      const st = gwStyle[phase]!;
      for (const g of onScreen) if (g.seg.phase === phase) {
        c.globalAlpha = this.spec.focus && g.seg.id !== this.spec.focus ? 0.45 : 1;   // the chosen stretch stands out
        stroke(g, st.color, gwW, st.dash);
      }
    }
    c.globalAlpha = 1;
    for (const f of focused) { stroke(f, col.strong, gwW + 6, []); stroke(f, col.gwCase, gwW + 3, []); stroke(f, gwStyle[f.seg.phase]!.color, gwW, gwStyle[f.seg.phase]!.dash); }
    c.setLineDash([]);
    // Stations: where a stretch begins and ends. Only once they are far enough apart to be worth drawing.
    if (mpp < 14 && onScreen.length) {
      const r = Math.max(3, Math.min(6, gwW * 0.75)), seen: [number, number][] = [];
      c.fillStyle = col.gwCase; c.strokeStyle = col.ink; c.lineWidth = Math.max(1.5, r * 0.45);
      for (const g of onScreen) for (const l of g.lines) {
        for (const [ux, uy] of [[l[0]!, l[1]!], [l[l.length - 2]!, l[l.length - 1]!]] as [number, number][]) {
          const x = this.X(ux), y = this.Y(uy);
          if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
          if (seen.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < r * 2.5)) continue;
          seen.push([x, y]);
          c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); c.stroke();
        }
      }
    }

    // The one chosen itinerary, over the basemap, the layers and the greenway alike: on this screen the map is
    // about this trip and nothing else. A casing under every leg, exactly as a greenway stretch and a bus route
    // have one, so the line keeps its 3:1 over the land, over a park and over the streets it crosses (1.4.11).
    // Colour never carries the meaning alone: a ride is dashed in its agency's own tone, and every leg is also
    // a sentence in the numbered list below the map.
    const route = this.spec.route;
    if (route?.legs.length) {
      const rw = Math.max(4, Math.min(9, 20 / mpp));
      const traceLine = (line: readonly [number, number][]) => { c.beginPath(); line.forEach((p, i) => { const x = this.X(wx(p[0])), y = this.Y(wy(p[1])); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); };
      c.setLineDash([]); c.strokeStyle = col.gwCase;
      for (const leg of route.legs) { c.lineWidth = rw + 4; traceLine(leg.polyline); c.stroke(); }
      route.legs.forEach((leg, i) => {
        const on = route.active === i;
        c.strokeStyle = (leg.css && css(leg.css)) || (leg.kind === 'ride' ? col.routeRide : col.routeWalk) || col.focus;
        c.lineWidth = on ? rw + 2.5 : rw;
        c.setLineDash((leg.dash ?? []).map((d) => d * c.lineWidth));
        traceLine(leg.polyline); c.stroke();
      });
      c.setLineDash([]);
    }
    // Names. Bigger roads first, so they win when two names would overlap.
    // A name is a row of small circles along its text, so a slanted name only blocks the space it really covers.
    const placed: [number, number, number][] = [...blocks], named: { n: string; x: number; y: number }[] = [];
    const free = (x: number, y: number, a: number, tw: number, size: number) => {
      const r = size / 2 + 3, n = Math.max(1, Math.ceil(tw / (2 * r))), mine: [number, number, number][] = [];
      for (let i = 0; i < n; i++) { const d = n === 1 ? 0 : (i / (n - 1) - 0.5) * (tw - size); mine.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r]); }
      if (mine.some((m) => placed.some((o) => Math.hypot(m[0] - o[0], m[1] - o[1]) < m[2] + o[2]))) return false;
      placed.push(...mine); return true;
    };
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const l of labels) {
      const size = l.cls <= 1 ? 13 : l.cls <= 3 ? 12 : 11; c.font = `600 ${size}px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
      const tw = c.measureText(l.name).width, spot = this.labelSpot(l.pts, tw + 14);
      if (!spot || named.some((o) => o.n === l.name && Math.hypot(o.x - spot.x, o.y - spot.y) < 220)) continue;
      // The middle of the street may be taken by a cross street's name: slide along the street to find room.
      const room = (spot.len - tw - 10) / 2, ux = Math.cos(spot.a), uy = Math.sin(spot.a);
      const at = [0, 0.5, -0.5, 1, -1].map((f) => f * room).find((d) => free(spot.x + ux * d, spot.y + uy * d, spot.a, tw, size));
      if (at === undefined) continue;
      spot.x += ux * at; spot.y += uy * at;
      named.push({ n: l.name, x: spot.x, y: spot.y });
      c.save(); c.translate(spot.x, spot.y); c.rotate(spot.a); c.strokeStyle = col.halo; c.lineWidth = 3.5; c.strokeText(l.name, 0, 0); c.fillStyle = col.ink; c.fillText(l.name, 0, 0); c.restore();
    }
    // An area's name, over its middle. It goes through the same "is there room?" test as every other name, so an
    // outline never writes over a street name, and it is drawn before the parks so the bigger thing wins.
    if (areaLabels.length) {
      c.font = '700 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      for (const a of areaLabels) {
        const tw = c.measureText(a.name).width;
        if (!free(a.x, a.y, 0, tw, 13)) continue;
        c.strokeStyle = col.halo; c.lineWidth = 3.5; c.strokeText(a.name, a.x, a.y); c.fillStyle = col.strong; c.fillText(a.name, a.x, a.y);
      }
    }
    if (this.map && mpp < 7 && this.parksOn()) {
      c.font = 'italic 600 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      for (const a of this.map.parks) {
        if (!a.name || !touches(a.box, view) || (a.box[2] - a.box[0]) * this.s < 46) continue;
        const x = this.X((a.box[0] + a.box[2]) / 2), y = this.Y((a.box[1] + a.box[3]) / 2), tw = c.measureText(a.name).width;
        if (x < 0 || x > w || y < 0 || y > h || !free(x, y, 0, tw, 12)) continue;
        c.strokeStyle = col.park; c.lineWidth = 3.5; c.strokeText(a.name, x, y); c.fillStyle = col.parkInk; c.fillText(a.name, x, y);
      }
    }
    // Stops and stations. There are thousands of bus stops, so a dense layer waits until the map is close enough
    // for them to be separate things rather than a smear; the layer switcher says so, and the list below the map
    // shows them at any zoom.
    for (const o of sub ? sub.rest : this.spec.overlays ?? []) {
      if (!o.points.length) continue;
      const r = o.dense ? (mpp > 12 ? 0 : Math.max(2, Math.min(4, 30 / mpp))) : Math.max(3.5, Math.min(6.5, 45 / mpp));
      if (!r) continue;
      c.fillStyle = css(o.css) || col.brand; c.strokeStyle = col.surface; c.lineWidth = Math.max(1, r * 0.4);
      for (const q of o.points) {
        const x = this.X(q.x), y = this.Y(q.y);
        if (x < -6 || y < -6 || x > w + 6 || y > h + 6) continue;
        c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); if (o.ring) c.stroke();
      }
    }
    if (sub) sub.marks();                               // stops, interchanges, terminals, hubs, markers, badges
    const dot = (d: { lat: number; lon: number; css?: string }, fill: string, r: number) => { c.beginPath(); c.arc(this.X(wx(d.lon)), this.Y(wy(d.lat)), r, 0, 6.2832); c.fillStyle = (d.css && css(d.css)) || fill; c.fill(); c.lineWidth = 2.5; c.strokeStyle = col.surface; c.stroke(); };
    for (const d of this.spec.dots ?? []) dot(d, col.brand, 7);
    // Where the trip begins and ends, and every place a bus is got on or off. A boarding marker is a RING and
    // an end marker is solid, so the two are told apart without colour; both are named in the step list, and
    // N and P walk them in the order they happen.
    if (route?.marks.length) {
      const r = Math.max(5, Math.min(9, 30 / mpp));
      for (const m of route.marks) {
        const x = this.X(wx(m.lon)), y = this.Y(wy(m.lat));
        if (x < -12 || y < -12 || x > w + 12 || y > h + 12) continue;
        c.beginPath(); c.arc(x, y, r, 0, 6.2832);
        c.fillStyle = (m.kind === 'board' || m.kind === 'alight' ? col.routeRide : col.routeWalk) || col.focus;
        c.fill(); c.lineWidth = 2.5; c.strokeStyle = col.surface; c.stroke();
        if (m.kind === 'board' || m.kind === 'alight') { c.beginPath(); c.arc(x, y, r * 0.45, 0, 6.2832); c.fillStyle = col.surface; c.fill(); }
      }
    }
    if (sub) {
      sub.labels();
      // The card of whatever is chosen, shown again after the page was redrawn; a choice whose layer is gone is let go.
      if (this.sel && this.shown !== this.sel) { const html = sub.card(this.sel); if (html) { this.shown = this.sel; this.say(html); } else { this.sel = ''; selections.delete(this.spec.key); } }
    }
    if (this.spec.me) dot(this.spec.me, col.focus, 7);
    // Last of all, over everything: where the keyboard is.
    this.drawRing(c, col.gwCase, col.focus);
  }
  /** Middle of the longest nearly straight, on-screen run of a line that is at least `need` pixels long. */
  private labelSpot(pts: Float32Array, need: number): { x: number; y: number; a: number; len: number } | null {
    let best: { x: number; y: number; a: number; len: number } | null = null;
    let sx = 0, sy = 0, px = 0, py = 0, ang = 0, open = false;
    const close = () => {
      if (!open) return; open = false;
      const cl = clip(sx, sy, px, py, 8, 8, this.w - 8, this.h - 8); if (!cl) return;
      const len = Math.hypot(cl[2] - cl[0], cl[3] - cl[1]); if (len < need || (best && len <= best.len)) return;
      let a = Math.atan2(cl[3] - cl[1], cl[2] - cl[0]); if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
      best = { x: (cl[0] + cl[2]) / 2, y: (cl[1] + cl[3]) / 2, a, len };
    };
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = this.X(pts[i]!), ay = this.Y(pts[i + 1]!), bx = this.X(pts[i + 2]!), by = this.Y(pts[i + 3]!), a = Math.atan2(by - ay, bx - ax);
      // A short jog where a boulevard meets a cross street does not end the run; a real bend (over 17 degrees) does.
      if (open && Math.hypot(bx - ax, by - ay) > 6 && Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) > 0.3) close();
      if (!open) { sx = ax; sy = ay; ang = a; open = true; }
      px = bx; py = by;
    }
    close();
    return best;
  }
}

function distToPiece(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
/** Twice the signed area of a ring, in world units. Used for one thing: when two outlines hold a tap, the
 *  smaller one is the more specific answer. */
export function shoelace(pts: Float32Array): number {
  let a = 0;
  for (let i = 0, j = pts.length - 2; i + 1 < pts.length; j = i, i += 2) a += pts[j]! * pts[i + 1]! - pts[i]! * pts[j + 1]!;
  return a / 2;
}
export function inside(x: number, y: number, ring: Float32Array): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i]!, yi = ring[i + 1]!, xj = ring[j]!, yj = ring[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** Liang-Barsky: the part of a line inside a box, or null. */
export function clip(x0: number, y0: number, x1: number, y1: number, l: number, t: number, r: number, b: number): [number, number, number, number] | null {
  let u0 = 0, u1 = 1; const dx = x1 - x0, dy = y1 - y0;
  for (const [pp, qq] of [[-dx, x0 - l], [dx, r - x0], [-dy, y0 - t], [dy, b - y0]] as [number, number][]) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const u = qq / pp;
    if (pp < 0) { if (u > u1) return null; u0 = Math.max(u0, u); } else { if (u < u0) return null; u1 = Math.min(u1, u); }
  }
  return [x0 + u0 * dx, y0 + u0 * dy, x0 + u1 * dx, y0 + u1 * dy];
}
