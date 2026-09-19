// The app's map. Streets, parks and the city boundary come from the signed bundle (map/base.json,
// map/streets.json: City of Detroit open data), so no map company ever learns where a person is looking,
// and the map keeps working offline. Everything is drawn on one canvas: fast on a cheap phone.
//
// The map is an extra, never the only way to get a fact: every screen that shows one also lists the same
// places and cross streets as text. If the map files can't be loaded, the greenway and the dots still draw.

import type { Segment } from '@313help/query';
import { fetchVerified, idbGet, idbSet, type BundleIndex } from './data.js';

// ---- world coordinates: flat projection around Detroit; one unit = one degree of latitude ----------------
const LON0 = -83.1, LAT0 = 42.35, K = Math.cos((LAT0 * Math.PI) / 180), M_PER_UNIT = 111320;
export const wx = (lon: number) => (lon - LON0) * K;
export const wy = (lat: number) => LAT0 - lat;
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

// ---- the view -----------------------------------------------------------------
export interface MapDot { lat: number; lon: number; label: string; go?: string }
export interface MapSpec {
  key: string;                                  // remembers pan and zoom while this screen is open
  label: string;                                // what a screen reader hears for the picture
  segments: Segment[]; focus?: string;          // greenway; `focus` is drawn bold
  outline?: { lat: number; lon: number }[][];   // a neighborhood's edge
  dots?: MapDot[]; me?: { lat: number; lon: number } | null;
  fit: { lat: number; lon: number }[];          // show at least these points at the start
  minMeters?: number;                           // never start closer than this many meters across
  quiet?: boolean;                              // a map about help, not parks: no dots for small parks, so the listing dots stand out
  cover?: boolean;                              // fill the box with the fit area (the wide city on a tall phone) instead of showing all of it
  strings: { zoomIn: string; zoomOut: string; reset: string; bigger: string; smaller: string; details: string; park: string; noStreets: string; source: (date: string) => string; phase: Record<string, string> };
  segGo?: (id: string) => string;               // data-go value for a greenway segment
}
const cameras = new Map<string, { cx: number; cy: number; s: number }>();
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class MapView {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private note = document.createElement('div');
  private cx = 0; private cy = 0; private s = 1; private home = { cx: 0, cy: 0, s: 1 };
  private w = 0; private h = 0; private raf = 0; private map: BaseMap | null = null;
  private touched = false; private pointers = new Map<number, { x: number; y: number }>(); private moved = 0; private pinch = 0;
  private segs: { seg: Segment; lines: Float32Array[]; box: Box }[];
  private ro: ResizeObserver; private mq = matchMedia('(prefers-color-scheme: dark)');
  private onScheme = () => this.redraw();

  constructor(private el: HTMLElement, private spec: MapSpec, index: BundleIndex) {
    const S = spec.strings;
    this.segs = spec.segments.map((seg) => { const lines = seg.lines.map((l) => { const a = new Float32Array(l.length * 2); l.forEach((pt, i) => { a[i * 2] = wx(pt[0]); a[i * 2 + 1] = wy(pt[1]); }); return a; }); return { seg, lines, box: merge(lines.map(boxOf)) }; });
    this.canvas.setAttribute('role', 'img'); this.canvas.setAttribute('aria-label', spec.label); this.canvas.tabIndex = 0;
    const btn = (act: string, text: string, label: string) => `<button type="button" data-map-act="${act}" aria-label="${label}">${text}</button>`;
    const tools = document.createElement('div'); tools.className = 'maptools';
    tools.innerHTML = btn('in', '+', S.zoomIn) + btn('out', '&minus;', S.zoomOut) + btn('reset', '&#8982;', S.reset) + btn('big', '&#10530;', S.bigger);
    this.note.className = 'mapnote'; this.note.setAttribute('aria-live', 'polite');
    const frame = document.createElement('div'); frame.className = 'mapframe'; frame.append(this.canvas, tools);
    el.replaceChildren(frame, this.note);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(frame);
    this.mq.addEventListener('change', this.onScheme);
    tools.addEventListener('click', (e) => this.tool((e.target as HTMLElement).closest<HTMLElement>('[data-map-act]')?.dataset.mapAct, S));
    this.listen();
    this.resize(true);
    void loadMap(index).then((m) => { this.map = m; if (!m) this.say(`<p class="foot">${S.noStreets}</p>`); else if (!this.note.innerHTML) this.say(`<p class="foot">${S.source(m.edited)}</p>`); this.redraw(); });
  }
  destroy(): void { this.ro.disconnect(); this.mq.removeEventListener('change', this.onScheme); cancelAnimationFrame(this.raf); if (this.touched) cameras.set(this.spec.key, { cx: this.cx, cy: this.cy, s: this.s }); document.body.classList.remove('mapbig'); }

  // -- camera
  private resize(first = false): void {
    const r = this.canvas.parentElement!.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width || !r.height) return;
    this.w = r.width; this.h = r.height; this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) {
      const xs = this.spec.fit.map((q) => wx(q.lon)), ys = this.spec.fit.map((q) => wy(q.lat));
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), min = (this.spec.minMeters ?? 500) / M_PER_UNIT;
      const spanX = Math.max(maxX - minX, min) * 1.18, spanY = Math.max(maxY - minY, min) * 1.18;
      this.home = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s: (this.spec.cover ? Math.max : Math.min)(this.w / spanX, this.h / spanY) };
      const saved = cameras.get(this.spec.key);
      Object.assign(this, saved ?? this.home); this.touched = !!saved;
    } else if (!this.touched) { this.resize(true); return; }     // the box changed size before anyone moved the map: fit again
    this.redraw();
  }
  private zoomAt(f: number, px = this.w / 2, py = this.h / 2): void {
    this.touched = true;
    const s = Math.max(M_PER_UNIT / 90, Math.min(M_PER_UNIT / 0.6, this.s * f));        // 90 m per pixel out, 0.6 m per pixel in
    const X = this.cx + (px - this.w / 2) / this.s, Y = this.cy + (py - this.h / 2) / this.s;
    this.cx = X - (px - this.w / 2) / s; this.cy = Y - (py - this.h / 2) / s; this.s = s; this.redraw();
  }
  private pan(dx: number, dy: number): void {
    this.touched = true;
    this.cx = Math.max(-0.25, Math.min(0.25, this.cx - dx / this.s)); this.cy = Math.max(-0.2, Math.min(0.2, this.cy - dy / this.s)); this.redraw();
  }
  private tool(act: string | undefined, S: MapSpec['strings']): void {
    if (act === 'in') this.zoomAt(1.6); else if (act === 'out') this.zoomAt(1 / 1.6);
    else if (act === 'reset') { Object.assign(this, this.home); this.touched = false; cameras.delete(this.spec.key); this.redraw(); }
    else if (act === 'big') {
      const big = this.el.classList.toggle('big'); document.body.classList.toggle('mapbig', big);
      // The big map starts under the top bar, so "Urgent help" (or quick exit) is still one tap away.
      this.el.style.top = big ? `${Math.max(0, document.querySelector('header.top')?.getBoundingClientRect().bottom ?? 0)}px` : '';
      const b = this.el.querySelector<HTMLElement>('[data-map-act="big"]')!; b.innerHTML = big ? '&times;' : '&#10530;'; b.setAttribute('aria-label', big ? S.smaller : S.bigger);
    }
  }
  private listen(): void {
    const c = this.canvas, at = (e: PointerEvent | WheelEvent | MouseEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, at(e)); if (this.pointers.size === 1) this.moved = 0; this.pinch = 0; });
    c.addEventListener('pointermove', (e) => {
      const was = this.pointers.get(e.pointerId); if (!was) return;
      const now = at(e); this.pointers.set(e.pointerId, now);
      if (this.pointers.size === 1) { this.moved += Math.abs(now.x - was.x) + Math.abs(now.y - was.y); this.pan(now.x - was.x, now.y - was.y); }
      else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoomAt(d / this.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinch = d; this.moved = 99;
      }
    });
    const up = (e: PointerEvent) => { if (!this.pointers.delete(e.pointerId)) return; this.pinch = 0; if (e.type === 'pointerup' && this.moved < 8 && !this.pointers.size) this.pick(at(e)); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); const q = at(e); this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), q.x, q.y); }, { passive: false });
    c.addEventListener('dblclick', (e) => { const q = at(e); this.zoomAt(1.8, q.x, q.y); });
    c.addEventListener('keydown', (e) => {
      const step = 60, k = e.key;
      if (k === '+' || k === '=') this.zoomAt(1.5); else if (k === '-') this.zoomAt(1 / 1.5);
      else if (k === 'ArrowLeft') this.pan(step, 0); else if (k === 'ArrowRight') this.pan(-step, 0); else if (k === 'ArrowUp') this.pan(0, step); else if (k === 'ArrowDown') this.pan(0, -step);
      else return;
      e.preventDefault();
    });
  }

  // -- tap: a listing dot, then the greenway, then a park
  private X = (x: number) => (x - this.cx) * this.s + this.w / 2;
  private Y = (y: number) => (y - this.cy) * this.s + this.h / 2;
  private say(html: string): void { this.note.innerHTML = html; }
  private pick(q: { x: number; y: number }): void {
    const S = this.spec.strings, esc = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const card = (title: string, sub: string, go?: string) => this.say(`<div class="mappick"><span><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${go ? `<button class="btn ghost" data-go="${esc(go)}">${esc(S.details)}</button>` : ''}</div>`);
    let best: { d: number; dot: MapDot } | undefined;
    for (const dot of this.spec.dots ?? []) { const d = Math.hypot(this.X(wx(dot.lon)) - q.x, this.Y(wy(dot.lat)) - q.y); if (d < 24 && (!best || d < best.d)) best = { d, dot }; }
    if (best) return card(best.dot.label, '', best.dot.go);
    let near: { d: number; seg: Segment } | undefined;
    for (const g of this.segs) for (const l of g.lines) for (let i = 0; i + 3 < l.length; i += 2) {
      const d = distToPiece(q.x, q.y, this.X(l[i]!), this.Y(l[i + 1]!), this.X(l[i + 2]!), this.Y(l[i + 3]!));
      if (d < 16 && (!near || d < near.d)) near = { d, seg: g.seg };
    }
    if (near) return card(near.seg.name, S.phase[near.seg.phase] ?? '', near.seg.id === this.spec.focus ? undefined : this.spec.segGo?.(near.seg.id));
    const X = this.cx + (q.x - this.w / 2) / this.s, Y = this.cy + (q.y - this.h / 2) / this.s;
    const park = this.map?.parks.find((a) => a.name && X >= a.box[0] && X <= a.box[2] && Y >= a.box[1] && Y <= a.box[3] && inside(X, Y, a.pts));
    if (park) card(park.name, S.park);
  }

  // -- drawing
  redraw(): void { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.draw()); }
  private trace(pts: Float32Array): void {
    const c = this.ctx; c.moveTo(this.X(pts[0]!), this.Y(pts[1]!));
    for (let i = 2; i < pts.length; i += 2) c.lineTo(this.X(pts[i]!), this.Y(pts[i + 1]!));
  }
  private draw(): void {
    const c = this.ctx, { w, h } = this, mpp = M_PER_UNIT / this.s;                        // meters per pixel
    const view: Box = [this.cx - w / 2 / this.s, this.cy - h / 2 / this.s, this.cx + w / 2 / this.s, this.cy + h / 2 / this.s];
    const col = { out: css('--map-out'), land: css('--map-land'), park: css('--map-park'), parkInk: css('--map-park-ink'), road: css('--map-road'), main: css('--map-main'), fwy: css('--map-fwy'), ink: css('--map-ink'), halo: css('--map-land'), brand: css('--brand'), muted: css('--muted'), strong: css('--ink'), surface: css('--surface'), focus: css('--focus') };
    c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]);
    c.fillStyle = this.map ? col.out : col.land; c.fillRect(0, 0, w, h);
    const labels: { name: string; pts: Float32Array; cls: number }[] = [];
    if (this.map) {
      c.fillStyle = col.land; c.beginPath(); for (const ring of this.map.boundary) { this.trace(ring); c.closePath(); } c.fill('evenodd');
      c.fillStyle = col.park; c.beginPath(); for (const a of this.map.parks) if (touches(a.box, view)) { this.trace(a.pts); c.closePath(); } c.fill();
      // Zoomed out, a pocket park is smaller than a pixel: mark it with a small dot so it can still be found.
      c.fillStyle = col.parkInk; c.beginPath();
      if (!this.spec.quiet) for (const a of this.map.parks) if (touches(a.box, view) && (a.box[2] - a.box[0]) * this.s < 7) { const x = this.X((a.box[0] + a.box[2]) / 2), y = this.Y((a.box[1] + a.box[3]) / 2); c.moveTo(x + 2, y); c.arc(x, y, 2, 0, 6.2832); }
      c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1;
      // Small streets appear as you zoom in; main roads are always there to get your bearings.
      const showCls = mpp < 9 ? 4 : mpp < 16 ? 3 : 2;
      const width = (cls: number) => Math.max(cls === 4 ? 0.8 : 1.2, Math.min(cls <= 2 ? 6.5 : 5, ([18, 20, 15, 11, 8][cls]!) / mpp));
      const visible: Line[][] = [[], [], [], [], []];
      for (const r of this.map.roads) if (touches(r.box, view)) visible[r.cls]!.push(r);
      if (showCls > 2) for (const cell of this.map.cells) if (touches(cell.box, view)) for (const r of cell.roads) if (r.cls <= showCls && touches(r.box, view)) visible[r.cls]!.push(r);
      for (const cls of [4, 3, 2, 1, 0]) {
        const list = visible[cls]!; if (!list.length) continue;
        c.strokeStyle = cls === 0 ? col.fwy : cls <= 2 ? col.main : col.road; c.lineWidth = width(cls);
        c.beginPath(); for (const r of list) this.trace(r.pts); c.stroke();
      }
      const labelCls = mpp < 4.6 ? 4 : mpp < 8 ? 3 : mpp < 14 ? 2 : mpp < 30 ? 1 : 0;
      for (const cls of [0, 1, 2, 3, 4]) if (cls <= labelCls) for (const r of visible[cls]!) if (r.name) labels.push({ name: r.name, pts: r.pts, cls });
    }
    if (this.spec.outline) {
      c.beginPath(); for (const ring of this.spec.outline) { ring.forEach((q, i) => (i ? c.lineTo(this.X(wx(q.lon)), this.Y(wy(q.lat))) : c.moveTo(this.X(wx(q.lon)), this.Y(wy(q.lat))))); c.closePath(); }
      c.globalAlpha = 0.12; c.fillStyle = col.brand; c.fill(); c.globalAlpha = 1; c.strokeStyle = col.strong; c.lineWidth = 2.5; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]);
    }
    // Greenway: open stretches are a solid green line; the rest is dashed and says so when tapped.
    const stroke = (g: { lines: Float32Array[] }, color: string, lw: number, dash: number[]) => { c.strokeStyle = color; c.lineWidth = lw; c.setLineDash(dash); c.beginPath(); for (const l of g.lines) this.trace(l); c.stroke(); };
    const gwW = Math.max(3, Math.min(7, 14 / mpp));
    for (const g of this.segs) if (g.seg.phase !== 'open' && touches(g.box, view)) stroke(g, col.muted, Math.max(2, gwW - 2), [2, 7]);
    for (const g of this.segs) if (g.seg.phase === 'open' && touches(g.box, view)) { stroke(g, col.surface, gwW + 3, []); stroke(g, col.brand, gwW, []); }
    const f = this.segs.find((g) => g.seg.id === this.spec.focus);
    if (f) { stroke(f, col.strong, gwW + 5, []); stroke(f, f.seg.phase === 'open' ? col.brand : col.surface, gwW, f.seg.phase === 'open' ? [] : [2, 9]); }
    c.setLineDash([]);

    // Names. Bigger roads first, so they win when two names would overlap.
    // A name is a row of small circles along its text, so a slanted name only blocks the space it really covers.
    const placed: [number, number, number][] = [], named: { n: string; x: number; y: number }[] = [];
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
    if (this.map && mpp < 7) {
      c.font = 'italic 600 12px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
      for (const a of this.map.parks) {
        if (!a.name || !touches(a.box, view) || (a.box[2] - a.box[0]) * this.s < 46) continue;
        const x = this.X((a.box[0] + a.box[2]) / 2), y = this.Y((a.box[1] + a.box[3]) / 2), tw = c.measureText(a.name).width;
        if (x < 0 || x > w || y < 0 || y > h || !free(x, y, 0, tw, 12)) continue;
        c.strokeStyle = col.park; c.lineWidth = 3.5; c.strokeText(a.name, x, y); c.fillStyle = col.parkInk; c.fillText(a.name, x, y);
      }
    }
    const dot = (d: { lat: number; lon: number }, fill: string, r: number) => { c.beginPath(); c.arc(this.X(wx(d.lon)), this.Y(wy(d.lat)), r, 0, 6.2832); c.fillStyle = fill; c.fill(); c.lineWidth = 2.5; c.strokeStyle = col.surface; c.stroke(); };
    for (const d of this.spec.dots ?? []) dot(d, col.brand, 7);
    if (this.spec.me) dot(this.spec.me, col.focus, 7);
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
