// The optional "Subway lines" map style (docs/MAP-STYLE.md). `standard` stays the default and never comes here:
// this file is its own download, fetched the first time a person picks the style, so nobody who leaves the map
// as it is pays for it.
//
// Everything that DECIDES something is a plain function at the top (style, zoom band, colour, width, geometry,
// badges, hit testing, keyboard order), held to tests and shared in shape with the iPhone and Android copies.
// The painter at the bottom only draws what those functions say. Route identity, colour, side-by-side offsets,
// trunks, interchanges and terminals all come worked out from the pipeline (`map/transit/<id>.net.json`, checked
// against the signed index like every layer); no bearing logic happens here. Nothing is live: no arrival times.

import { decodeLine, esc, wx, wy, type Overlay } from './map.js';
import { LAYER_STYLE } from './layerstyle.js';
import type { MapStyle } from './layers.js';

export type Band = 'far' | 'mid' | 'near';
export type Theme = 'light' | 'dark';
export type Contrast = 'plain' | 'more' | 'forced';
type Box = [number, number, number, number];
const M = 111320;                                                        // metres in one world unit (map.ts M_PER_UNIT)
export const NETWORK_LAYERS = ['ddot_routes', 'smart_routes', 'qline', 'people_mover'] as const;
export const BADGE_CAP = 24, NAME_CAP = 12, STOP_CAP = 400, PILL_CAP = 120, FEATURE_CAP = 40, HIT = 44, LINE_HIT = 22;
/** Of the 40 keyboard features, at most this many of one kind — so that downtown, where a hundred interchanges
 *  are in view, the keyboard still reaches the ROUTES. Hubs are never capped (there are four); routes take
 *  whatever room is left, which is never less than 40 − 4 − 8 − 20 = 8. */
export const FEATURE_KIND_CAP = { hub: Infinity, terminal: 8, interchange: 20, route: Infinity } as const;
/** Every strings key this file asks for, so a test can hold all four languages to it. */
export const SUBWAY_KEYS = ['map.route_card', 'map.route_every', 'map.route_frequent', 'map.route_stops', 'map.route_plan', 'map.stop_lines', 'map.change_here', 'map.hub_walk', 'map.many_routes', 'map.key_qline', 'map.list_more'] as const;

// ---- 1. which style, which band -------------------------------------------------------------------------------
export { mapStyle } from './layers.js';
const rawBand = (mpp: number): Band => (mpp > 30 ? 'far' : mpp > 12 ? 'mid' : 'near');
/** far > 30 m/u ≥ mid > 12 ≥ near. A band only changes once the scale is 5 % past the edge, so a pinch that
 *  hovers on 12 or 30 does not flicker between two drawings. */
export function zoomBand(mpp: number, previous?: Band): Band {
  const raw = rawBand(mpp);
  if (!previous || raw === previous) return raw;
  if (previous === 'far') return mpp > 30 * 0.95 ? 'far' : raw;
  if (previous === 'near') return mpp <= 12 * 1.05 ? 'near' : raw;
  return raw === 'far' ? (mpp > 30 * 1.05 ? 'far' : 'mid') : mpp <= 12 * 0.95 ? 'near' : 'mid';
}

// ---- 2. colour and width (section 4.2, table 7.1) ----------------------------------------------------------------
export interface RouteLook { tone: number; system: string; frequent?: boolean }
/** The token a route wears. The tone is read from the data (the pipeline hands tones out so neighbours differ);
 *  the two rail systems are fixed. Theme and contrast change the token's VALUE in style.css, never its name. */
export function routeColour(route: RouteLook, _theme?: Theme, _contrast?: Contrast): string {
  if (route.system === 'qline') return '--tr-rail';
  if (route.system === 'dpm') return '--tr-dpm';
  return `--tr-${((Math.trunc(route.tone) % 6) + 6) % 6}`;
}
const pick = <T>(band: Band, far: T, mid: T, near: T): T => (band === 'far' ? far : band === 'mid' ? mid : near);
const isRail = (system: string) => system === 'qline' || system === 'dpm';
export const lineWidth = (route: RouteLook, band: Band): number => (isRail(route.system) ? pick(band, 4.5, 6, 7) : route.frequent ? pick(band, 3.5, 5, 6) : pick(band, 2.5, 3.5, 4.5));
export const trunkWidth = (band: Band): number => pick(band, 5.5, 8, 10);
/** What the casing adds to a line's width (half each side); one unit more under "increase contrast". */
export const casingWidth = (band: Band, contrast: Contrast = 'plain'): number => pick(band, 2, 3, 4) + (contrast === 'more' ? 1 : 0);
/** The sideways distance between two neighbours on one street: a frequent line's width plus the gap. */
export const step = (band: Band): number => (band === 'far' ? 0 : pick(band, 0, 5, 6) + pick(band, 0, 1.5, 2));
const simplifyM = (band: Band): number => pick(band, 30, 10, 0);
const cornerR = (band: Band): number => pick(band, 6, 10, 14);
const badgeSpacingM = (band: Band): number => pick(band, 8000, 3000, 1200);

// ---- 3. the whole look of one thing, as data ---------------------------------------------------------------------
export interface Marker { shape: 'circle' | 'dock' | 'square' | 'diamond' | 'p'; size: number; corner: number; fill: string; ring: string; ringWidth: number; ringDash: number[] | null; inner: string | null }
export interface BadgeLook { fill: string; text: string; ring: string; ringWidth: number; height: number; font: number; radius: number; pad: number }
export interface Resolved {
  stroke: string | null; width: number;                 // the coloured line: a token and a width in u (0: no line)
  casing: string | null; casingWidth: number;           // the whole width of the stroke under it
  /** `standard`: multiples of the drawn width (map.ts multiplies). `subway`: u. */
  dash: number[] | null;
  stripe: { token: string; width: number } | null;      // SMART's light centre stripe
  ties: { token: string; width: number; dash: number[] } | null;   // the QLINE
  chevrons: { token: string; every: number; length: number; width: number; angle: number } | null;   // People Mover
  double: { stroke: number; gap: number } | null;       // bike lanes: two thin lines
  marker: Marker | null; badge: BadgeLook | null;
  /** `standard` only: how map.ts sizes points (dense stops wait for 12 m/u; sparse ones get a ring). */
  points: 'dense' | 'sparse' | null;
}
export interface LookQuery { style: MapStyle; layer: string; route?: RouteLook; band: Band; theme?: Theme; contrast?: Contrast; selected?: boolean }
const NONE: Resolved = { stroke: null, width: 0, casing: null, casingWidth: 0, dash: null, stripe: null, ties: null, chevrons: null, double: null, marker: null, badge: null, points: null };
const badgeLook = (fill: string, band: Band): BadgeLook => ({ fill, text: '--tr-fill', ring: '--tr-fill', ringWidth: 1.5, height: band === 'near' ? 18 : 16, font: band === 'near' ? 12 : 11, radius: 5, pad: 5 });
/** style × layer × route × zoom band × theme × contrast → stroke, casing, marker, dash, badge. Pure: the painter
 *  below draws exactly what this says, and `standard` answers from LAYER_STYLE alone. */
export function resolveStyle(q: LookQuery): Resolved {
  const id = q.layer.replace(/^go:/, ''), band = q.band, contrast = q.contrast ?? 'plain';
  if (q.style === 'standard') {
    const s = LAYER_STYLE['go:' + id] ?? { css: '--lyr-bus' };
    const hasPoints = s.dense || s.ring;
    return { ...NONE, stroke: s.css, width: s.width ?? 5, casing: '--gw-case', casingWidth: (s.width ?? 5) + 3, dash: s.dash ?? null, points: hasPoints ? (s.dense ? 'dense' : 'sparse') : null };
  }
  const ringMore = contrast === 'more' ? 0.5 : 0, cw = casingWidth(band, contrast);
  if (id === 'ddot_routes' || id === 'smart_routes' || id === 'qline' || id === 'people_mover') {
    const system = q.route?.system ?? (id === 'qline' ? 'qline' : id === 'people_mover' ? 'dpm' : id === 'smart_routes' ? 'smart' : 'ddot');
    const route: RouteLook = { tone: q.route?.tone ?? 0, system, frequent: q.route?.frequent };
    const token = routeColour(route, q.theme, contrast), w = lineWidth(route, band) + (q.selected ? 1.5 : 0);
    const station = isRail(system) && band !== 'far' ? circle(4.5, 2 + ringMore) : null;
    return {
      ...NONE, stroke: token, width: w, casing: '--gw-case', casingWidth: w + cw, badge: badgeLook(token, band), marker: station,
      stripe: system === 'smart' && band !== 'far' ? { token: '--tr-fill', width: w / 3 } : null,
      ties: system === 'qline' ? { token: '--tr-fill', width: Math.max(1.5, w - 3), dash: [1.2 * w, 1.8 * w] } : null,
      chevrons: system === 'dpm' && band !== 'far' ? { token: '--tr-fill', every: band === 'mid' ? 90 : 120, length: 5, width: 1.75, angle: 35 } : null,
    };
  }
  if (id === 'ddot_stops' || id === 'smart_stops') return { ...NONE, marker: band === 'near' || q.selected ? (q.selected ? circle(4.5, 2 + ringMore) : circle(3, 1.5 + ringMore)) : null };
  if (id === 'bike_lanes') return band === 'far' ? { ...NONE, stroke: '--tr-bike', width: 1.5 } : { ...NONE, stroke: '--tr-bike', width: 0, double: { stroke: pick(band, 1, 1.25, 1.5), gap: pick(band, 1.5, 2, 2.5) } };
  if (band === 'far') return NONE;                                        // point markers wait for the mid band
  if (id === 'mogo') return { ...NONE, marker: { shape: 'dock', size: pick(band, 0, 9, 11), corner: 2.5, fill: '--tr-bike', ring: '--tr-fill', ringWidth: 1.5, ringDash: null, inner: '--tr-fill' } };
  if (id === 'stations') return { ...NONE, marker: { shape: 'square', size: pick(band, 0, 11, 13), corner: 1.5, fill: '--tr-fill', ring: '--tr-rail', ringWidth: 2.5 + ringMore, ringDash: null, inner: '--tr-rail' } };
  if (id === 'intercity_bus') return { ...NONE, marker: { shape: 'diamond', size: pick(band, 0, 10, 12), corner: 0, fill: '--tr-fill', ring: '--tr-coach', ringWidth: 2 + ringMore, ringDash: [3, 2], inner: null } };
  if (id === 'park_ride') return { ...NONE, marker: { shape: 'p', size: 14, corner: 3, fill: '--tr-pr', ring: '--tr-fill', ringWidth: 1.5, ringDash: null, inner: '--tr-fill' } };
  return NONE;
}
const circle = (r: number, ringWidth: number): Marker => ({ shape: 'circle', size: r * 2, corner: r, fill: '--tr-fill', ring: '--tr-ring', ringWidth, ringDash: null, inner: null });
/** The pill round an interchange or a hub, and the ring at the end of a route. */
export const pillLook = (kind: 'interchange' | 'hub', band: Band, contrast: Contrast = 'plain') => ({ height: kind === 'hub' ? (band === 'near' ? 14 : 12) : band === 'near' ? 11 : 9, fill: '--tr-fill', ring: '--tr-ring', ringWidth: (kind === 'hub' ? 2.5 : 2) + (contrast === 'more' ? 0.5 : 0) });
export const terminalLook = (band: Band, contrast: Contrast = 'plain') => ({ r: band === 'near' ? 7.5 : 6, fill: '--tr-fill', ringWidth: 3 + (contrast === 'more' ? 0.5 : 0) });

/** The basemap under subway lines is quietened — paler streets that still clear 3:1, a paler park — but only
 *  in the subway style, only while a network is on, and never for a person who asked for more contrast. */
export function basemapTokens(style: MapStyle, networkOn: boolean, contrast: Contrast): { quiet: boolean; road: string; main: string; fwy: string; park: string; parkInk: string; ink: string } {
  const quiet = style === 'subway' && networkOn && contrast === 'plain', q = quiet ? '-q' : '';
  return { quiet, road: '--map-road' + q, main: '--map-main' + q, fwy: '--map-fwy' + q, park: '--map-park' + q, parkInk: '--map-park-ink' + q, ink: '--map-ink' + q };
}

// ---- 4. the data (section 10) ----------------------------------------------------------------------------------------
export interface NetFile {
  id: string; origin: [number, number]; names: string[]; lines: [number, number[]][]; v: number; system: string; agency: string; agency_url?: string;
  stops_layer?: string; routes?: { id: string; short: string; long: string; tone: number; frequent?: boolean; headway?: number; loop?: boolean; derived?: boolean; lines: number[]; stops: number[][]; ends: [number, number, number][] }[];
  runs?: number[][]; interchanges?: [number, number, number, number[], number[]][]; trunks?: [number, number, number[]][];
  routes_layer?: string; route_ids?: string[]; serves?: number[][];
}
export interface Run { from: number; to: number; off: number; n: number }
export interface NetLine { route: number; pts: Float32Array; box: Box; runs: Run[]; cum: Float32Array }
export interface NetRoute extends RouteLook { idx: number; id: string; short: string; long: string; label: string; headway?: number; loop: boolean; derived: boolean; lines: number[]; stops: number[][]; stopCount: number; ends: { x: number; y: number; name: string }[]; box: Box; order: number }
export interface Net {
  id: string; system: string; agency: string; agencyUrl?: string; stopsLayer: string; origin: [number, number];
  routes: NetRoute[]; lines: NetLine[];
  interchanges: { x: number; y: number; name: string; routes: number[]; span: [number, number, number, number] }[];
  trunks: { x: number; y: number; routes: number[] }[];
  serves?: number[][];
}
const boxOf = (pts: ArrayLike<number>): Box => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i + 1 < pts.length; i += 2) { a = Math.min(a, pts[i]!); c = Math.max(c, pts[i]!); b = Math.min(b, pts[i + 1]!); d = Math.max(d, pts[i + 1]!); } return [a, b, c, d]; };
const touches = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
/** Rider order, across networks: by the number on the front of the bus, then DDOT before SMART, then the order in
 *  the file; a route with no number (QLINE, DPM) comes last. */
export const riderOrder = (short: string, idx: number, system = '') => { const n = parseInt(short, 10), sys = ['ddot', 'smart'].indexOf(system); return (Number.isFinite(n) ? n : 9000) * 1e6 + (sys < 0 ? 2 : sys) * 1000 + idx; };

/** A routes `.net.json` file, decoded. Null for anything that is not format 2 with routes — the caller then keeps
 *  drawing that layer in `standard`, which needs none of this. */
export function decodeNet(file: unknown): Net | null {
  const f = file as NetFile | null;
  if (!f || f.v !== 2 || !Array.isArray(f.routes) || !Array.isArray(f.lines) || !Array.isArray(f.origin)) return null;
  const name = (n: number) => (n < 0 ? '' : f.names[n] ?? ''), X = (x: number) => wx(f.origin[0] + x / 1e5), Y = (y: number) => wy(f.origin[1] + y / 1e5);
  const owner = new Map<number, number>();
  f.routes.forEach((r, ri) => r.lines.forEach((l) => owner.set(l, ri)));
  const lines: NetLine[] = f.lines.map(([, enc], li) => {
    const pts = decodeLine(enc, f.origin), flat = f.runs?.[li] ?? [0, 0, 1], runs: Run[] = [], last = pts.length / 2 - 1;
    for (let i = 0; i + 2 < flat.length; i += 3) runs.push({ from: Math.min(last, flat[i]!), to: Math.min(last, flat[i + 3] ?? last), off: flat[i + 1]!, n: flat[i + 2]! });
    const cum = new Float32Array(pts.length / 2);
    for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1]! + Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!) * M;
    return { route: owner.get(li) ?? 0, pts, box: boxOf(pts), runs: runs.filter((r) => r.to > r.from), cum };
  });
  const routes: NetRoute[] = f.routes.map((r, idx) => {
    const label = [r.short, r.long].filter(Boolean).filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i).join(' ');
    const boxes = r.lines.map((l) => lines[l]?.box).filter((b): b is Box => !!b);
    return {
      idx, id: r.id, short: r.short, long: r.long, label, tone: r.tone, system: f.system, frequent: !!r.frequent, headway: r.headway, loop: !!r.loop, derived: !!r.derived,
      lines: r.lines.filter((l) => !!lines[l]), stops: r.stops ?? [], stopCount: new Set((r.stops ?? []).flat()).size,
      ends: (r.ends ?? []).map(([x, y, n]) => ({ x: X(x), y: Y(y), name: name(n) })), order: riderOrder(r.short, idx, f.system),
      box: boxes.reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])] as Box, [Infinity, Infinity, -Infinity, -Infinity] as Box),
    };
  });
  return {
    id: f.id, system: f.system, agency: f.agency, agencyUrl: f.agency_url, stopsLayer: f.stops_layer ?? f.id, origin: f.origin, routes, lines,
    interchanges: (f.interchanges ?? []).map(([x, y, n, rs, sp]) => ({ x: X(x), y: Y(y), name: name(n), routes: rs, span: [X(x + (sp[0] ?? 0)), Y(y + (sp[1] ?? 0)), X(x + (sp[2] ?? 0)), Y(y + (sp[3] ?? 0))] })),
    trunks: (f.trunks ?? []).map(([x, y, rs]) => ({ x: X(x), y: Y(y), routes: rs })),
    ...(Array.isArray(f.serves) ? { serves: f.serves } : {}),
  };
}
/** A stops `.net.json` file: which routes call at each stop of the unchanged stops layer. */
export function decodeServes(file: unknown): number[][] | null {
  const f = file as NetFile | null;
  return f && f.v === 2 && Array.isArray(f.serves) ? f.serves : null;
}

// ---- 5. geometry (section 6) -------------------------------------------------------------------------------------------
/** Douglas–Peucker over flat x,y pairs. `tol` 0 keeps everything. */
export function simplify(pts: ArrayLike<number>, tol: number): number[] {
  const n = pts.length / 2;
  if (tol <= 0 || n < 3) return Array.from(pts);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; let far = -1, best = tol;
    const ax = pts[a * 2]!, ay = pts[a * 2 + 1]!, dx = pts[b * 2]! - ax, dy = pts[b * 2 + 1]! - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2]! - ax, py = pts[i * 2 + 1]! - ay, u = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0, d = Math.hypot(px - u * dx, py - u * dy);
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2]!, pts[i * 2 + 1]!);
  return out;
}
/** Shift a polyline (flat screen x,y; y down) `o` units to the LEFT of its own direction with north up: for a
 *  piece going (dx, dy), left is (dy, −dx). Inside the run each vertex moves along the mitre of its two normals,
 *  no further than twice the offset. The pipeline already flipped the sign for lines running "backwards". */
export function offsetRun(pts: ArrayLike<number>, o: number): number[] {
  const n = pts.length / 2, out: number[] = new Array(n * 2);
  if (!o || n < 2) return Array.from(pts);
  const nx: number[] = [], ny: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = pts[i * 2 + 2]! - pts[i * 2]!, dy = pts[i * 2 + 3]! - pts[i * 2 + 1]!, len = Math.hypot(dx, dy);
    if (len) { nx.push(dy / len); ny.push(-dx / len); } else { nx.push(nx[i - 1] ?? 0); ny.push(ny[i - 1] ?? 0); }
  }
  for (let i = 0; i < n; i++) {
    const ax = nx[Math.max(0, i - 1)]!, ay = ny[Math.max(0, i - 1)]!, bx = nx[Math.min(n - 2, i)]!, by = ny[Math.min(n - 2, i)]!;
    let mx = ax + bx, my = ay + by; const ml = Math.hypot(mx, my);
    if (ml < 1e-9) { mx = bx; my = by; } else { mx /= ml; my /= ml; }
    const k = o / Math.max(0.5, mx * bx + my * by);
    out[i * 2] = pts[i * 2]! + mx * k; out[i * 2 + 1] = pts[i * 2 + 1]! + my * k;
  }
  return out;
}
/** Path commands as flat numbers: 0 x y = moveTo, 1 x y = lineTo, 2 cx cy x y = quadraticCurveTo. */
export type Cmds = number[];
/** Round every corner of a polyline with one quadratic curve: stop `r` short of the vertex, curve through it.
 *  r = min(R, half of either neighbouring piece); a turn under 8° is left alone. */
export function roundCorners(pts: ArrayLike<number>, R: number, out: Cmds = []): Cmds {
  const n = pts.length / 2;
  if (n < 2) return out;
  out.push(0, pts[0]!, pts[1]!);
  for (let i = 1; i < n - 1; i++) {
    const px = pts[i * 2]!, py = pts[i * 2 + 1]!, ax = px - pts[i * 2 - 2]!, ay = py - pts[i * 2 - 1]!, bx = pts[i * 2 + 2]! - px, by = pts[i * 2 + 3]! - py;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!la || !lb) continue;
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    if (R <= 0 || turn < (8 * Math.PI) / 180) { out.push(1, px, py); continue; }
    const r = Math.min(R, la / 2, lb / 2);
    out.push(1, px - (ax / la) * r, py - (ay / la) * r, 2, px, py, px + (bx / lb) * r, py + (by / lb) * r);
  }
  out.push(1, pts[n * 2 - 2]!, pts[n * 2 - 1]!);
  return out;
}
export function replay(c: CanvasRenderingContext2D, cmds: Cmds): void {
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i]!;
    if (op === 0) { c.moveTo(cmds[i + 1]!, cmds[i + 2]!); i += 3; } else if (op === 1) { c.lineTo(cmds[i + 1]!, cmds[i + 2]!); i += 3; } else { c.quadraticCurveTo(cmds[i + 1]!, cmds[i + 2]!, cmds[i + 3]!, cmds[i + 4]!); i += 5; }
  }
}

/** Where a route's badges sit: along one line at spacing/2 + k × spacing metres from its start — anchored to the
 *  world, so they do not swim when the map pans — skipping any that fall on a trunk. Each comes back with the
 *  world point, the run it is on and the piece's direction, so the painter can shift it with its line. */
export function badgeAnchors(line: Pick<NetLine, 'pts' | 'cum' | 'runs'>, spacing: number): { d: number; x: number; y: number; off: number; dx: number; dy: number }[] {
  const out: { d: number; x: number; y: number; off: number; dx: number; dy: number }[] = [], total = line.cum[line.cum.length - 1] ?? 0;
  let seg = 1;
  for (let d = spacing / 2; d < total; d += spacing) {
    while (seg < line.cum.length - 1 && line.cum[seg]! < d) seg++;
    const run = line.runs.find((r) => seg - 1 >= r.from && seg - 1 < r.to);
    if (run && run.n > 4) continue;
    const a = seg - 1, span = line.cum[seg]! - line.cum[a]!, u = span ? (d - line.cum[a]!) / span : 0;
    const ax = line.pts[a * 2]!, ay = line.pts[a * 2 + 1]!, bx = line.pts[seg * 2]!, by = line.pts[seg * 2 + 1]!;
    out.push({ d, x: ax + (bx - ax) * u, y: ay + (by - ay) * u, off: run?.off ?? 0, dx: bx - ax, dy: by - ay });
  }
  return out;
}
export interface BadgeCandidate { key: string; route: string; cls: 'selected' | 'rail' | 'trunk' | 'frequent' | 'other'; order: number; d: number }
const CLS = { selected: 0, rail: 1, trunk: 2, frequent: 3, other: 4 } as const;
/** The order badges claim room in (section 7.5), the same on every client:
 *  1. every badge of the chosen route, nearest the middle of the screen first;
 *  2. then ROUND-ROBIN: every route's first badge (its nearest to the middle) before any route's second, and so
 *     on; inside one round by rank — rail, trunk badges, frequent routes, the rest — then rider order.
 *  Strict priority (all of route 1, then all of route 2 …) spent the 24 on the low numbers and left the
 *  high-numbered routes on screen with no name at all. A trunk's stacked badge is its own "route". */
export function badgeOrder<T extends BadgeCandidate>(candidates: readonly T[], selected = ''): T[] {
  const isSel = (b: T) => b.cls === 'selected' || (!!selected && b.route === selected);
  const byD = [...candidates].sort((a, b) => a.d - b.d || a.key.localeCompare(b.key)), turn = new Map<T, number>(), seen = new Map<string, number>();
  for (const b of byD) { const n = seen.get(b.route) ?? 0; turn.set(b, isSel(b) ? 0 : n); seen.set(b.route, n + 1); }
  return byD.sort((a, b) => Number(isSel(b)) - Number(isSel(a)) || turn.get(a)! - turn.get(b)! || (isSel(a) ? 0 : CLS[a.cls] - CLS[b.cls]) || a.order - b.order || a.d - b.d || a.key.localeCompare(b.key));
}
/** The badges that draw this frame: `badgeOrder`, until 24 have been PLACED. `place` says whether a badge found
 *  room (one that does not fit is dropped, never shrunk or overlapped, and does not use up one of the 24). */
export function claimBadges<T extends BadgeCandidate>(candidates: readonly T[], cap = BADGE_CAP, selected = '', place: (b: T) => boolean = () => true): T[] {
  const out: T[] = [];
  for (const b of badgeOrder(candidates, selected)) { if (out.length >= cap) break; if (place(b)) out.push(b); }
  return out;
}

/** What stands on the map at each zoom (section 5). `layersOn` are layer ids without the `go:` prefix. */
export function stationsFor(band: Band, selection: string, layersOn: readonly string[]): { stopLayers: string[]; selectedStops: boolean; interchangeMin: number; terminals: boolean; markers: boolean; railStations: boolean; hubs: boolean } {
  const bus = layersOn.includes('ddot_routes') || layersOn.includes('smart_routes');
  return {
    stopLayers: band === 'near' ? ['ddot_stops', 'smart_stops'].filter((l) => layersOn.includes(l)) : [],
    selectedStops: band !== 'far' && selection.startsWith('route:'),
    interchangeMin: !bus || band === 'far' ? Infinity : band === 'mid' ? 3 : 2,
    terminals: band !== 'far', markers: band !== 'far', railStations: band !== 'far', hubs: true,
  };
}

export interface Glyph { id: string; x: number; y: number; prio: number; w?: number; h?: number }
/** The thing under a finger: anything whose 44 × 44 box (or its own box, if bigger) holds the point, the highest
 *  priority first, then the nearest. Tapping the same place again moves on to the next thing under the finger. */
export function hitTest<T extends Glyph>(p: { x: number; y: number }, glyphs: readonly T[], last = ''): T | null {
  const under = glyphs.filter((g) => Math.abs(g.x - p.x) <= Math.max(HIT, g.w ?? 0) / 2 && Math.abs(g.y - p.y) <= Math.max(HIT, g.h ?? 0) / 2)
    .sort((a, b) => a.prio - b.prio || Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y) || a.id.localeCompare(b.id));
  if (!under.length) return null;
  const at = under.findIndex((g) => g.id === last);
  return under[(at + 1) % under.length]!;
}

export interface SubFeature { kind: 'hub' | 'terminal' | 'interchange' | 'route'; d: number; order: number }
const KIND = { hub: 0, terminal: 1, interchange: 2, route: 3 } as const;
/** The keyboard's N/P order. Today's order is kept exactly and only added to: greenway, places, then hubs,
 *  terminals and interchanges (nearest the middle first), then routes in rider order — 40 of those at most, and
 *  of those at most 8 terminals and 20 interchanges (FEATURE_KIND_CAP), so routes are always reached. */
export function featureOrder<A, B extends SubFeature>(existing: readonly A[], subway: readonly B[]): (A | B)[] {
  const extra = [...subway].sort((a, b) => KIND[a.kind] - KIND[b.kind] || (a.kind === 'route' ? a.order - b.order : a.d - b.d));
  const count = { hub: 0, terminal: 0, interchange: 0, route: 0 };
  return [...existing, ...extra.filter((f) => ++count[f.kind] <= FEATURE_KIND_CAP[f.kind]).slice(0, FEATURE_CAP)];
}

/** The two ends of a hub's pill, in world units. The file says where: `origin` + `at` + `span`, packed like every
 *  layer (section 10). Only a bundle from before `origin` was written falls back to finding the hub's stations
 *  by NAME among the layers that are on (a name can be used twice in one layer — "Detroit" — so the pair is the
 *  closest two of different layers, and the rest join if within 400 m). */
export function hubSpan(hub: Hub, overlays: readonly Pick<Overlay, 'id' | 'points'>[] = []): [{ x: number; y: number }, { x: number; y: number }] | null {
  if (Array.isArray(hub.origin) && hub.origin.length >= 2 && hub.span.length >= 4) {
    const P = (dx: number, dy: number) => ({ x: wx(hub.origin![0] + (hub.at[0] + dx) / 1e5), y: wy(hub.origin![1] + (hub.at[1] + dy) / 1e5) });
    return [P(hub.span[0]!, hub.span[1]!), P(hub.span[2]!, hub.span[3]!)];
  }
  const cands = hub.stops.map((st) => (overlays.find((o) => o.id === 'go:' + st.layer)?.points ?? []).filter((q) => q.name === st.name));
  let seed: { x: number; y: number } | null = null, gap = Infinity;
  cands.forEach((A, i) => cands.forEach((B, j) => { if (j > i) for (const p of A) for (const q of B) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < gap) { gap = d; seed = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; } } }));
  if (!seed || gap * M > 400) return null;
  const at: { x: number; y: number } = seed;
  const pts = cands.map((A) => A.slice().sort((p, q) => Math.hypot(p.x - at.x, p.y - at.y) - Math.hypot(q.x - at.x, q.y - at.y))[0]).filter((q): q is { name: string; x: number; y: number } => !!q && Math.hypot(q.x - at.x, q.y - at.y) * M <= 400);
  let a = pts[0]!, b = pts[1]!, far = -1;
  for (const p of pts) for (const q of pts) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d > far) { far = d; a = p; b = q; } }
  return [a, b];
}

// ---- 6. the painter -------------------------------------------------------------------------------------------------------
export interface Hub { origin?: [number, number]; at: [number, number]; span: number[]; name: string; layers: string[]; stops: { layer: string; name: string }[] }
export interface SubwayData {
  nets: Record<string, Net>;                                           // routes layers that are on and have arrived
  stops: Record<string, { points: { name: string; x: number; y: number }[]; serves?: number[][] }>;   // stops layers held, on or not
  hubs: Hub[]; on: string[];                                           // layer ids, no `go:`
  t: (key: string, p?: Record<string, string | number>) => string;
  label: (layer: string) => string;
  planner: (system: string, agency: string, fallback?: string) => string;   // the owner's trip-planner link, as HTML
  want: (stopsLayer: string) => void;                                  // ask for a stops layer a chosen route needs
}
export interface FrameEnv { c: CanvasRenderingContext2D; w: number; h: number; s: number; cx: number; cy: number; overlays: readonly Overlay[]; selection: string; contrast: Contrast; fontScale: number; css: (token: string) => string; avoid?: readonly Box[] }
interface Placed { id: string; kind: 'badge' | 'name'; x: number; y: number; w: number; h: number; text: string; fill?: string; size: number; dim: boolean }
interface Pill { id: string; ax: number; ay: number; bx: number; by: number; h: number; ringWidth: number; dim: boolean }
interface Dot { id: string; x: number; y: number; look: Marker; ringToken?: string; dim: boolean }
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const geomCache = new WeakMap<NetLine, Partial<Record<Band, number[][]>>>();
const pathCache = new WeakMap<object, { key: string; colour: Cmds; trunk: Cmds; full: Cmds }>();
const laneCache = new WeakMap<object, { key: string; a: Cmds; b: Cmds }>();

export class SubwayPainter {
  private band: Band | undefined;
  private env!: FrameEnv; private looks!: ReturnType<typeof stationsFor>;
  private placed: Placed[] = []; private pills: Pill[] = []; private dots: Dot[] = []; private ends: (Dot & { token: string })[] = [];
  glyphs: (Glyph & { label: string })[] = [];
  /** Per route in view, the badge anchor or terminal nearest the middle — drawn or not. The keyboard lands there
   *  when the route's badge lost its place to another, so a route on screen is never out of reach. */
  private spots = new Map<string, { x: number; y: number; d: number }>();
  private feats: ReturnType<SubwayPainter['findFeatures']> | null = null;      // worked out once a frame, and only if the keyboard asks
  /** Standard overlays this frame still needs drawn the old way: a network whose `.net.json` has not arrived. */
  rest: Overlay[] = [];
  quiet = false; more = 0;
  /** Paths are built at the nearest step of a 15 % scale ladder and drawn through one `scale(k)`, so a pinch
   *  rebuilds geometry once every few frames instead of every frame; offsets and radii are exact on a step and
   *  within 7 % between steps. */
  private sq = 1; private k = 1;
  constructor(private data: SubwayData) {}

  private X = (x: number) => (x - this.env.cx) * this.env.s + this.env.w / 2;
  private Y = (y: number) => (y - this.env.cy) * this.env.s + this.env.h / 2;
  private inView = (x: number, y: number, pad = 12) => x >= -pad && y >= -pad && x <= this.env.w + pad && y <= this.env.h + pad;
  private onNets(): Net[] { return ['smart_routes', 'ddot_routes', 'qline', 'people_mover'].map((id) => this.data.nets[id]).filter((n): n is Net => !!n && this.data.on.includes(n.id)); }
  private selRoute(): { net: Net; route: NetRoute } | null {
    const m = /^route:(\w+):(\d+)$/.exec(this.env.selection); if (!m) return null;
    const net = this.data.nets[m[1]!], route = net?.routes[Number(m[2])];
    return net && route ? { net, route } : null;
  }

  /** Work the frame out: band, what is left for `standard`, and where every glyph, badge and name goes. Returns
   *  circles the street names must keep clear of (badges and names outrank them). */
  begin(env: FrameEnv): [number, number, number][] {
    this.env = env; this.sq = Math.pow(1.15, Math.round(Math.log(env.s) / Math.log(1.15))); this.k = env.s / this.sq;
    const mpp = M / env.s, band = (this.band = zoomBand(mpp, this.band)), D = this.data, fs = env.fontScale, c = env.c;
    this.looks = stationsFor(band, env.selection, D.on);
    this.quiet = basemapTokens('subway', NETWORK_LAYERS.some((id) => D.on.includes(id)), env.contrast).quiet;
    this.rest = env.overlays.filter((o) => { const id = o.id.replace(/^go:/, ''); return (NETWORK_LAYERS as readonly string[]).includes(id) && !D.nets[id]; });
    this.placed = []; this.pills = []; this.dots = []; this.ends = []; this.glyphs = []; this.more = 0; this.feats = null;
    const view: Box = [env.cx - env.w / 2 / env.s, env.cy - env.h / 2 / env.s, env.cx + env.w / 2 / env.s, env.cy + env.h / 2 / env.s];
    const sel = this.selRoute(), dimAll = !!sel, mid = (x: number, y: number) => Math.hypot(x - env.w / 2, y - env.h / 2);
    const taken: Box[] = [...(env.avoid ?? [])];
    const fits = (x: number, y: number, w: number, h: number) => { const b: Box = [x - w / 2 - 2, y - h / 2 - 2, x + w / 2 + 2, y + h / 2 + 2]; if (b[0] < 2 || b[1] < 2 || b[2] > env.w - 2 || b[3] > env.h - 2 || taken.some((o) => touches(o, b))) return false; taken.push(b); return true; };
    const hold = (x: number, y: number, w: number, h: number) => taken.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
    const text = (s: string, size: number, weight = 700) => { c.font = `${weight} ${size * fs}px ${FONT}`; return c.measureText(s).width; };
    const name = (id: string, s: string, x: number, y: number, r: number, size: number, dim: boolean): boolean => {
      if (!s) return false;
      const tw = text(s, size, 600), h = size * fs + 4, gap = r + 4;
      for (const [dx, dy] of [[gap + tw / 2, 0], [-gap - tw / 2, 0], [0, -gap - h / 2], [0, gap + h / 2]] as [number, number][]) if (fits(x + dx, y + dy, tw + 4, h)) { this.placed.push({ id, kind: 'name', x: x + dx, y: y + dy, w: tw, h, text: s, size, dim }); return true; }
      return false;
    };
    const badge = (id: string, s: string, x: number, y: number, fill: string, dim: boolean, beside = -1): boolean => {
      const look = badgeLook(fill, band), h = look.height * fs, w = Math.max(h, text(s, look.font) + look.pad * 2 * fs);
      // On its own line a badge sits on the line; beside a terminal it goes right, left, above, below: first that fits.
      // A trunk's stacked badge speaks for up to 17 routes in the busiest part of the map, so it may step up or down to find room.
      const spots = beside === -2 ? [0, -1.5, 1.5, -3, 3, -4.5, 4.5, -6, 6, -7.5, 7.5].flatMap((dy) => [0, -0.5, 0.5].map((dx) => [dx * w, dy * h])) : beside < 0 ? [[0, 0]] : [[1, 0], [-1, 0], [0, -1], [0, 1]].map(([dx, dy]) => [dx! * (w / 2 + beside + 3), dy! * (h / 2 + beside + 3)]);
      for (const [dx, dy] of spots as [number, number][]) { const bx = x + dx, by = y + dy; if (fits(bx, by, w, h)) { this.placed.push({ id, kind: 'badge', x: bx, y: by, w, h, text: s, fill, size: look.font, dim }); this.glyphs.push({ id, x: bx, y: by, prio: 3, w, h, label: s }); return true; } }
      return false;
    };

    // Hubs: stations of different systems a short walk apart, drawn when two or more of their layers are on.
    D.hubs.forEach((hub, i) => {
      if (hub.layers.filter((l) => D.on.includes(l)).length < 2) return;
      const ends = hubSpan(hub, env.overlays); if (!ends) return;
      const [a, b] = ends, look = pillLook('hub', band, env.contrast), x = this.X((a.x + b.x) / 2), y = this.Y((a.y + b.y) / 2);
      if (!this.inView(x, y, 30)) return;
      this.pills.push({ id: 'hub:' + i, ax: this.X(a.x), ay: this.Y(a.y), bx: this.X(b.x), by: this.Y(b.y), h: look.height, ringWidth: look.ringWidth, dim: false });
      this.glyphs.push({ id: 'hub:' + i, x, y, prio: 2, w: Math.abs(this.X(a.x) - this.X(b.x)) + look.height, h: Math.abs(this.Y(a.y) - this.Y(b.y)) + look.height, label: hub.name });
    });

    // Terminals, then interchanges, of every network that is on.
    const nets = this.onNets(), badges: (BadgeCandidate & { text: string; x: number; y: number; fill: string; dim: boolean; end?: boolean; r?: number })[] = [];
    const badgeText = (net: Net, r: NetRoute) => (net.system === 'smart' && r.frequent && band === 'near' ? 'FAST ' : '') + (r.short || r.long.slice(0, 10));
    const cls = (net: Net, r: NetRoute): BadgeCandidate['cls'] => (isRail(net.system) ? 'rail' : r.frequent ? 'frequent' : 'other');
    const farOK = (net: Net, r: NetRoute) => band !== 'far' || isRail(net.system) || !!r.frequent || (sel?.route === r);
    for (const net of nets) {
      const tl = terminalLook(band, env.contrast);
      if (this.looks.terminals) for (const r of net.routes) r.ends.forEach((e, i) => {
        const x = this.X(e.x), y = this.Y(e.y); if (!this.inView(x, y)) return;
        const id = `end:${net.id}:${r.idx}:${i}`, token = routeColour(r), dim = dimAll && sel!.route !== r;
        this.ends.push({ id, x, y, token, dim, look: { ...circle(tl.r, tl.ringWidth), ring: token } });
        this.glyphs.push({ id, x, y, prio: 1, label: e.name || r.label });
        badges.push({ key: id + ':b', route: `${net.id}:${r.idx}`, cls: cls(net, r), order: r.order, d: mid(x, y), text: badgeText(net, r), x, y, fill: token, dim, end: true, r: tl.r });
      });
      if (this.looks.interchangeMin < Infinity) {
        const look = pillLook('interchange', band, env.contrast);
        const seen = net.interchanges.map((ix, i) => ({ ix, i, x: this.X(ix.x), y: this.Y(ix.y) })).filter((q) => q.ix.routes.length >= this.looks.interchangeMin && this.inView(q.x, q.y)).sort((p, q) => mid(p.x, p.y) - mid(q.x, q.y));
        this.more += Math.max(0, seen.length - PILL_CAP);
        for (const q of seen.slice(0, PILL_CAP)) {
          const id = `ix:${net.id}:${q.i}`, dim = dimAll && !(sel!.net === net && q.ix.routes.includes(sel!.route.idx));
          this.pills.push({ id, ax: this.X(q.ix.span[0]), ay: this.Y(q.ix.span[1]), bx: this.X(q.ix.span[2]), by: this.Y(q.ix.span[3]), h: look.height, ringWidth: look.ringWidth, dim });
          this.glyphs.push({ id, x: q.x, y: q.y, prio: 2, label: q.ix.name });
        }
      }
    }
    // Stops: a stops layer that is on (near only), the stops of a chosen route (mid and near), rail stations.
    const stopDot = (layer: string, i: number, q: { name: string; x: number; y: number }, look: Marker, dim: boolean) => { const x = this.X(q.x), y = this.Y(q.y); if (this.inView(x, y, 6)) this.dots.push({ id: `stop:${layer}:${i}`, x, y, look, dim }); };
    const chosen = new Set<number>(sel && this.looks.selectedStops ? sel.route.stops.flat() : []);
    for (const layer of new Set([...this.looks.stopLayers, ...(sel && this.looks.selectedStops && !isRail(sel.net.system) ? [sel.net.stopsLayer] : [])])) {
      const pts = D.stops[layer]?.points; if (!pts) continue;
      const mine = sel?.net.stopsLayer === layer, all = this.looks.stopLayers.includes(layer);
      const plain = resolveStyle({ style: 'subway', layer, band: 'near', contrast: env.contrast }).marker!, big = resolveStyle({ style: 'subway', layer, band, contrast: env.contrast, selected: true }).marker!;
      pts.forEach((q, i) => { const on = mine && chosen.has(i); if (on || all) stopDot(layer, i, q, on ? big : plain, dimAll && !on); });
    }
    if (this.dots.length > STOP_CAP) { this.dots.sort((a, b) => Number(a.dim) - Number(b.dim) || mid(a.x, a.y) - mid(b.x, b.y)); this.more += this.dots.length - STOP_CAP; this.dots.length = STOP_CAP; }
    for (const net of nets) if (isRail(net.system) && this.looks.railStations) {
      const look = resolveStyle({ style: 'subway', layer: net.id, band, contrast: env.contrast }).marker!;
      (env.overlays.find((o) => o.id === 'go:' + net.id)?.points ?? []).forEach((q, i) => stopDot(net.id, i, q, look, dimAll && sel!.net !== net));
    }
    for (const d of this.dots) this.glyphs.push({ id: d.id, x: d.x, y: d.y, prio: 4, label: '' });
    // MoGo, Amtrak, coaches, park and ride: their own shapes, from the same points `standard` draws as dots.
    if (this.looks.markers) for (const o of env.overlays) {
      const id = o.id.replace(/^go:/, ''), look = (NETWORK_LAYERS as readonly string[]).includes(id) || id.endsWith('_stops') ? null : resolveStyle({ style: 'subway', layer: id, band, contrast: env.contrast }).marker;
      if (look) o.points.forEach((q, i) => { const x = this.X(q.x), y = this.Y(q.y); if (!this.inView(x, y)) return; this.dots.push({ id: `mk:${id}:${i}`, x, y, look, dim: dimAll }); this.glyphs.push({ id: `mk:${id}:${i}`, x, y, prio: 4, label: q.name }); });
    }

    // Room is claimed in the spec's order: the chosen thing, terminals, hubs and interchanges, badges, stop names.
    for (const p of this.pills) hold((p.ax + p.bx) / 2, (p.ay + p.by) / 2, Math.abs(p.ax - p.bx) + p.h, Math.abs(p.ay - p.by) + p.h);
    for (const e of this.ends) hold(e.x, e.y, e.look.size + 4, e.look.size + 4);
    const picked = this.glyphs.find((g) => g.id === env.selection);
    if (picked?.label && !env.selection.startsWith('route:')) name('sel', picked.label, picked.x, picked.y, 8, 13, false);
    // Badges along the lines, and one stacked badge per trunk.
    for (const net of nets) {
      for (const r of net.routes) {
        if (!farOK(net, r) || !r.lines.length || !touches(r.box, view)) continue;
        const line = net.lines[r.lines[0]!]!, o = step(band) / 2, token = routeColour(r);
        for (const a of badgeAnchors(line, badgeSpacingM(band))) {
          const len = Math.hypot(a.dx, a.dy) || 1, x = this.X(a.x) + (a.dy / len) * a.off * o, y = this.Y(a.y) - (a.dx / len) * a.off * o;
          if (!this.inView(x, y, 0) || this.ends.some((e) => Math.hypot(e.x - x, e.y - y) < 24)) continue;
          badges.push({ key: `badge:${net.id}:${r.idx}:${Math.round(a.d)}`, route: `${net.id}:${r.idx}`, cls: cls(net, r), order: r.order, d: mid(x, y), text: badgeText(net, r), x, y, fill: token, dim: dimAll && sel!.route !== r });
        }
      }
      net.trunks.forEach((tk, i) => {
        const x = this.X(tk.x), y = this.Y(tk.y); if (!this.inView(x, y, 0)) return;
        const names = tk.routes.map((ri) => net.routes[ri]).filter((r): r is NetRoute => !!r).sort((p, q) => p.order - q.order).map((r) => r.short || r.long.slice(0, 10));
        badges.push({ key: `trunk:${net.id}:${i}`, route: `trunk:${net.id}:${i}`, cls: 'trunk', order: i, d: mid(x, y), text: names.slice(0, 6).join(' · ') + (names.length > 6 ? ` +${names.length - 6}` : ''), x, y, fill: '--tr-trunk', dim: dimAll });
      });
    }
    // Hubs are named at every zoom (they outrank badges); a terminal is named close in only, after its badge.
    for (const p of this.pills) if (p.id.startsWith('hub:')) name(p.id + ':n', D.hubs[Number(p.id.slice(4))]!.name, (p.ax + p.bx) / 2, (p.ay + p.by) / 2, p.h / 2 + Math.hypot(p.ax - p.bx, p.ay - p.by) / 2, 12, false);
    this.spots = new Map();
    for (const b of badges) if (b.cls !== 'trunk') { const had = this.spots.get(b.route); if (!had || b.d < had.d) this.spots.set(b.route, { x: b.x, y: b.y, d: b.d }); }
    // A terminal's badge sits beside its ring; a line's badge on its line; a trunk's may step aside. 24 PLACED at most.
    claimBadges(badges.filter((b) => band !== 'far' || b.cls !== 'other' || (sel && b.route === `${sel.net.id}:${sel.route.idx}`)), BADGE_CAP, sel ? `${sel.net.id}:${sel.route.idx}` : '',
      (b) => (b.end ? badge(b.key.replace(/:b$/, ':badge'), b.text, b.x, b.y, b.fill, b.dim, b.r!) : badge(b.key, b.text, b.x, b.y, b.fill, b.dim, b.cls === 'trunk' ? -2 : -1)));
    if (band === 'near') for (const e of this.ends) { const g = this.glyphs.find((x) => x.id === e.id); if (g?.label && this.placed.filter((p) => p.kind === 'name').length < NAME_CAP) name(e.id + ':n', g.label, e.x, e.y, e.look.size / 2 + 2, 12, e.dim); }
    // QLINE and People Mover station names, close in.
    if (mpp <= 6) for (const d of this.dots) {
      const m = /^stop:(qline|people_mover):(\d+)$/.exec(d.id); if (!m || this.placed.filter((p) => p.kind === 'name').length >= NAME_CAP) continue;
      name(d.id + ':n', env.overlays.find((o) => o.id === 'go:' + m[1])?.points[Number(m[2])]?.name ?? '', d.x, d.y, d.look.size / 2 + 1, 12, d.dim);
    }
    for (const g of this.glyphs) if (g.id === env.selection) g.prio = 0;
    // Street and park names keep clear of all of it: each box goes in as a row of the circles map.ts already uses.
    const out: [number, number, number][] = [];
    for (const b of taken) { const h = b[3] - b[1], w = b[2] - b[0], r = h / 2, n = Math.max(1, Math.ceil(w / h)); for (let i = 0; i < n; i++) out.push([b[0] + r + (n === 1 ? (w - h) / 2 : ((w - h) * i) / (n - 1)), (b[1] + b[3]) / 2, r]); }
    return out;
  }

  // -- steps 6 to 12: bike lanes, SMART, DDOT, trunks, QLINE, People Mover, the chosen route ------------------------------
  lines(): void {
    const { c, s, w, h, cx, cy, css, contrast } = this.env, band = this.band!, sel = this.selRoute(), view: Box = [cx - w / 2 / s, cy - h / 2 / s, cx + w / 2 / s, cy + h / 2 / s];
    const dim = sel ? 0.35 : 1, caseCol = css('--gw-case'), fill = css('--tr-fill');
    const k = this.k;
    c.save(); c.translate(w / 2 - cx * s, h / 2 - cy * s); c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash([]);
    const stroke = (col: string, lw: number, list: Cmds[], dash: number[] = [], cap: CanvasLineCap = 'round') => { if (!list.length) return; c.strokeStyle = col; c.lineWidth = lw / k; c.setLineDash(dash.map((d) => d / k)); c.lineCap = cap; c.beginPath(); for (const cm of list) replay(c, cm); c.stroke(); };
    // 6. Bike lanes: the secondary network, under every transit line, never badged.
    const lanes = this.env.overlays.find((o) => o.id === 'go:bike_lanes');
    if (lanes) {
      const look = resolveStyle({ style: 'subway', layer: 'bike_lanes', band, contrast }), a: Cmds[] = [], b: Cmds[] = [];
      for (const l of lanes.lines) if (touches(l.box, view)) { const p = this.lane(l, look.double ? (look.double.stroke + look.double.gap) / 2 : 0); a.push(p.a); if (look.double) b.push(p.b); }
      c.globalAlpha = dim; stroke(css(look.stroke!), look.double?.stroke ?? look.width, [...a, ...b]);
    }
    // 7–8. One network at a time, SMART under DDOT: casing, the lines (local under frequent, low numbers on top), stripes.
    const trunks: Cmds[] = [], cw = casingWidth(band, contrast);
    const drawNet = (net: Net) => {
      const routes = net.routes.filter((r) => r.lines.some((l) => touches(net.lines[l]!.box, view))).sort((p, q) => Number(!!p.frequent) - Number(!!q.frequent) || q.order - p.order);
      const paths = new Map<NetRoute, Cmds[]>();
      for (const r of routes) paths.set(r, r.lines.filter((l) => touches(net.lines[l]!.box, view)).map((l) => { const p = this.path(net.lines[l]!, net, r); trunks.push(p.trunk); return p.colour; }));
      c.globalAlpha = dim;
      for (const freq of [false, true]) { const some = routes.filter((r) => !!r.frequent === freq); if (some.length) stroke(caseCol, lineWidth(some[0]!, band) + cw, some.flatMap((r) => paths.get(r)!)); }
      for (const r of routes) {
        const look = resolveStyle({ style: 'subway', layer: net.id, route: r, band, contrast });
        stroke(css(look.stroke!), look.width, paths.get(r)!);
        if (look.ties) stroke(fill, look.ties.width, paths.get(r)!, look.ties.dash, 'butt');
      }
      for (const freq of [false, true]) { const some = routes.filter((r) => !!r.frequent === freq), look = some[0] && resolveStyle({ style: 'subway', layer: net.id, route: some[0], band, contrast }); if (look?.stripe) stroke(fill, look.stripe.width, some.flatMap((r) => paths.get(r)!)); }
      const loop = routes.find((r) => r.loop), chev = loop && resolveStyle({ style: 'subway', layer: net.id, route: loop, band, contrast }).chevrons;
      if (loop && chev) { c.strokeStyle = fill; c.lineWidth = chev.width / k; c.setLineDash([]); c.beginPath(); this.chevrons(net.lines[loop.lines[0]!]!, chev); c.stroke(); }
    };
    for (const net of this.onNets()) if (!isRail(net.system)) drawNet(net);
    // 9. Trunks: where five or more routes share a street, one wide stroke for all of them.
    const live = trunks.filter((t) => t.length);
    if (live.length) { c.globalAlpha = dim; stroke(caseCol, trunkWidth(band) + cw, live); stroke(css('--tr-trunk'), trunkWidth(band), live); }
    // 10–11. The QLINE (casing, line, ties), then the People Mover (casing, line, chevrons).
    for (const net of this.onNets()) if (isRail(net.system)) drawNet(net);
    // 12. The chosen route, last: an under-stroke, its casing, its line a little wider — whole, trunks included.
    if (sel) {
      c.globalAlpha = 1;
      const look = resolveStyle({ style: 'subway', layer: sel.net.id, route: sel.route, band, contrast, selected: true }), full = sel.route.lines.map((l) => this.path(sel.net.lines[l]!, sel.net, sel.route).full);
      stroke(css('--tr-sel'), look.casingWidth + 3, full); stroke(caseCol, look.casingWidth, full); stroke(css(look.stroke!), look.width, full);
      if (look.stripe) stroke(fill, look.stripe.width, full);
      if (look.ties) stroke(fill, look.ties.width, full, look.ties.dash, 'butt');
      if (look.chevrons) { c.strokeStyle = fill; c.lineWidth = look.chevrons.width / k; c.setLineDash([]); c.lineCap = 'round'; c.beginPath(); this.chevrons(sel.net.lines[sel.route.lines[0]!]!, look.chevrons); c.stroke(); }
    }
    c.restore(); c.globalAlpha = 1; c.setLineDash([]); c.lineCap = 'round';
  }
  /** One line's path at this scale, in scaled world units (the frame adds the pan with one translate, so a pan
   *  costs no geometry at all). Simplified once per band; offset and rounded once per scale. */
  private path(line: NetLine, net: Net, route: NetRoute): { colour: Cmds; trunk: Cmds; full: Cmds } {
    const band = this.band!, s = this.sq, key = `${band}:${s}`, had = pathCache.get(line);
    if (had?.key === key) return had;
    const bands = geomCache.get(line) ?? {}; geomCache.set(line, bands);
    const runs = (bands[band] ??= line.runs.map((r) => simplify(line.pts.subarray(r.from * 2, r.to * 2 + 2), simplifyM(band) / M)));
    const o = step(band) / 2, R = cornerR(band), colour: Cmds = [], trunk: Cmds = [], whole: number[] = [];
    let open: number[] = [];
    const close = () => { if (open.length >= 4) roundCorners(open, R, colour); open = []; };
    line.runs.forEach((r, i) => {
      const scaled = runs[i]!.map((v) => v * s), isTrunk = r.n > 4 && !isRail(net.system);
      if (isTrunk) { close(); roundCorners(scaled, R, trunk); whole.push(...scaled); return; }
      const shifted = offsetRun(scaled, r.off * o); open.push(...shifted); whole.push(...shifted);
    });
    close();
    // A loop is closed: start in the middle of its first piece, so the corner where it closes is rounded too.
    if (route.loop && whole.length >= 6) {
      const mx = (whole[0]! + whole[2]!) / 2, my = (whole[1]! + whole[3]!) / 2, n = whole.length;
      const shut = Math.hypot(whole[n - 2]! - whole[0]!, whole[n - 1]! - whole[1]!) < 0.01;
      colour.length = 0; roundCorners([mx, my, ...whole.slice(2), ...(shut ? [] : [whole[0]!, whole[1]!]), mx, my], R, colour);
    }
    const made = { key, colour, trunk, full: route.loop ? colour : roundCorners(whole, R) };
    pathCache.set(line, made);
    return made;
  }
  private lane(l: { pts: Float32Array }, o: number): { a: Cmds; b: Cmds } {
    const s = this.sq, key = `${o}:${s}`, had = laneCache.get(l);
    if (had?.key === key) return had;
    const scaled = Array.from(l.pts, (v) => v * s), made = { key, a: roundCorners(offsetRun(scaled, o), 0), b: o ? roundCorners(offsetRun(scaled, -o), 0) : [] };
    laneCache.set(l, made);
    return made;
  }
  /** "›" marks along the loop, pointing the way the operator's own shape runs. */
  private chevrons(line: NetLine, look: NonNullable<Resolved['chevrons']>): void {
    const c = this.env.c, s = this.sq, k = this.k, p = line.pts, a = (look.angle * Math.PI) / 180, every = look.every / k, length = look.length / k; let next = every / 2, run = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i]! * s, ay = p[i + 1]! * s, dx = p[i + 2]! * s - ax, dy = p[i + 3]! * s - ay, len = Math.hypot(dx, dy);
      while (len && next <= run + len) {
        const u = (next - run) / len, ux = dx / len, uy = dy / len, tx = ax + dx * u + (ux * 2) / k, ty = ay + dy * u + (uy * 2) / k;
        for (const sign of [1, -1]) { const rx = ux * Math.cos(a) - uy * Math.sin(a) * sign, ry = uy * Math.cos(a) + ux * Math.sin(a) * sign; c.moveTo(tx - rx * length, ty - ry * length); c.lineTo(tx, ty); }
        next += every;
      }
      run += len;
    }
  }

  // -- steps 15 to 18: stops, interchanges / terminals / hubs, point markers, badges ------------------------------------------
  marks(): void {
    const { c, css } = this.env, fill = css('--tr-fill'), ring = css('--tr-ring');
    c.setLineDash([]); c.lineCap = 'round';
    const alpha = (dim: boolean) => { c.globalAlpha = dim ? 0.35 : 1; };
    for (const d of this.dots) if (d.id.startsWith('stop:')) { alpha(d.dim); this.marker(d); }
    for (const p of this.pills) {
      alpha(p.dim); const r = p.h / 2, ang = Math.atan2(p.by - p.ay, p.bx - p.ax);
      c.beginPath(); c.arc(p.ax, p.ay, r, ang + Math.PI / 2, ang - Math.PI / 2); c.arc(p.bx, p.by, r, ang - Math.PI / 2, ang + Math.PI / 2); c.closePath();
      c.fillStyle = fill; c.fill(); c.strokeStyle = ring; c.lineWidth = p.ringWidth; c.stroke();
    }
    for (const e of this.ends) { alpha(e.dim); this.marker(e, css(e.token)); }
    for (const d of this.dots) if (d.id.startsWith('mk:')) { alpha(d.dim); this.marker(d); }
    c.direction = 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle';            // route names are Latin: never mirrored
    for (const b of this.placed) if (b.kind === 'badge') {
      alpha(b.dim); const look = badgeLook(b.fill!, this.band!), r = Math.min(look.radius * this.env.fontScale, b.h / 2), x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
      c.beginPath(); c.moveTo(x0 + r, y0); c.arcTo(x0 + b.w, y0, x0 + b.w, y0 + b.h, r); c.arcTo(x0 + b.w, y0 + b.h, x0, y0 + b.h, r); c.arcTo(x0, y0 + b.h, x0, y0, r); c.arcTo(x0, y0, x0 + b.w, y0, r); c.closePath();
      c.fillStyle = css(look.fill); c.fill(); c.strokeStyle = css(look.ring); c.lineWidth = look.ringWidth; c.stroke();
      c.font = `700 ${look.font * this.env.fontScale}px ${FONT}`; c.fillStyle = css(look.text); c.fillText(b.text, b.x, b.y + 0.5);
    }
    c.globalAlpha = 1;
  }
  private marker(d: Dot, ringCol?: string): void {
    const { c, css } = this.env, m = d.look, half = m.size / 2;
    const box = (sz: number, corner: number) => { const x0 = d.x - sz / 2, y0 = d.y - sz / 2; c.beginPath(); c.moveTo(x0 + corner, y0); c.arcTo(x0 + sz, y0, x0 + sz, y0 + sz, corner); c.arcTo(x0 + sz, y0 + sz, x0, y0 + sz, corner); c.arcTo(x0, y0 + sz, x0, y0, corner); c.arcTo(x0, y0, x0 + sz, y0, corner); c.closePath(); };
    if (m.shape === 'circle') { c.beginPath(); c.arc(d.x, d.y, half, 0, 6.2832); }
    else if (m.shape === 'diamond') { c.beginPath(); c.moveTo(d.x, d.y - half); c.lineTo(d.x + half, d.y); c.lineTo(d.x, d.y + half); c.lineTo(d.x - half, d.y); c.closePath(); }
    else box(m.size, m.corner);
    c.fillStyle = css(m.fill); c.fill(); c.strokeStyle = ringCol ?? css(m.ring); c.lineWidth = m.ringWidth; c.setLineDash(m.ringDash ?? []); c.stroke(); c.setLineDash([]);
    if (!m.inner) return;
    c.fillStyle = css(m.inner);
    if (m.shape === 'dock') { c.beginPath(); c.arc(d.x, d.y, 1.5, 0, 6.2832); c.fill(); }
    else if (m.shape === 'square') c.fillRect(d.x - 3.5, d.y - 1, 7, 2);
    else if (m.shape === 'p') { c.direction = 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 10px ${FONT}`; c.fillText('P', d.x, d.y + 0.5); }
  }
  // -- step 20: names of the chosen thing, terminals, hubs, rail stations --------------------------------------------------------
  labels(): void {
    const { c, css } = this.env;
    c.direction = 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const n of this.placed) if (n.kind === 'name') {
      c.globalAlpha = n.dim ? 0.35 : 1; c.font = `600 ${n.size * this.env.fontScale}px ${FONT}`;
      c.strokeStyle = css('--map-land'); c.lineWidth = 3.5; c.strokeText(n.text, n.x, n.y); c.fillStyle = css('--map-ink'); c.fillText(n.text, n.x, n.y);
    }
    c.globalAlpha = 1;
  }

  // -- tap, keyboard, cards ---------------------------------------------------------------------------------------------------------
  /** The glyph a tap lands on (44-unit boxes, by priority; the same place again moves on to the next one).
   *  `glyph` is what was hit, `sel` what that chooses: a badge chooses its route, a terminal's badge its terminal. */
  hit(p: { x: number; y: number }, last = ''): { glyph: string; sel: string } | null {
    const g = hitTest(p, this.glyphs, last);
    return g ? { glyph: g.id, sel: g.id.replace(/^badge:(\w+):(\d+):.*$/, 'route:$1:$2').replace(/^(end:\w+:\d+:\d+):badge$/, '$1') } : null;
  }
  /** The nearest route line within 22 units of a tap; on a trunk, the trunk. '' for nothing. */
  hitLine(p: { x: number; y: number }): string {
    const { s, w, h, cx, cy } = this.env, k = this.k, px = (p.x - (w / 2 - cx * s)) / k, py = (p.y - (h / 2 - cy * s)) / k;
    let best = LINE_HIT / k, found = '';
    for (const net of this.onNets()) for (const r of net.routes) for (const l of r.lines) {
      const made = pathCache.get(net.lines[l]!); if (!made || made.key !== `${this.band}:${this.sq}`) continue;
      for (const [cm, trunk] of [[made.colour, false], [made.trunk, true]] as [Cmds, boolean][]) {
        const d = nearCmds(cm, px, py);
        if (d < best) { best = d; found = trunk ? this.trunkAt(net, r, p) : `route:${net.id}:${r.idx}`; }
      }
    }
    return found;
  }
  private trunkAt(net: Net, r: NetRoute, p: { x: number; y: number }): string {
    const near = net.trunks.map((t, i) => ({ i, t, d: Math.hypot(this.X(t.x) - p.x, this.Y(t.y) - p.y) })).filter((q) => q.t.routes.includes(r.idx)).sort((a, b) => a.d - b.d)[0];
    return near ? `trunk:${net.id}:${near.i}` : `route:${net.id}:${r.idx}`;
  }
  /** Hubs, terminals, interchanges and routes in view, for the keyboard; the ring goes round a glyph's 44-unit
   *  box or, for a route, round its nearest badge. */
  features(): (SubFeature & { id: string; label: string; sub: string; box: Box })[] {
    return (this.feats ??= this.findFeatures());
  }
  private findFeatures(): (SubFeature & { id: string; label: string; sub: string; box: Box })[] {
    const { w, h } = this.env, mid = (x: number, y: number) => Math.hypot(x - w / 2, y - h / 2), out: (SubFeature & { id: string; label: string; sub: string; box: Box })[] = [];
    const box = (g: Glyph): Box => { const bw = Math.max(HIT, g.w ?? 0) / 2, bh = Math.max(HIT, g.h ?? 0) / 2; return [g.x - bw + 7, g.y - bh + 7, g.x + bw - 7, g.y + bh - 7]; };
    for (const g of this.glyphs) {
      const kind = g.id.startsWith('hub:') ? 'hub' : /^end:\w+:\d+:\d+$/.test(g.id) ? 'terminal' : g.id.startsWith('ix:') ? 'interchange' : null;
      if (kind && g.x >= 0 && g.y >= 0 && g.x <= w && g.y <= h) out.push({ kind, id: g.id, d: mid(g.x, g.y), order: 0, label: g.label, sub: this.sub(g.id), box: box(g) });
    }
    for (const net of this.onNets()) for (const r of net.routes) {
      const mine = this.glyphs.filter((g) => g.id.startsWith(`badge:${net.id}:${r.idx}:`) || g.id.startsWith(`end:${net.id}:${r.idx}:`)).sort((a, b) => mid(a.x, a.y) - mid(b.x, b.y))[0];
      const spot = this.spots.get(`${net.id}:${r.idx}`) ?? this.onLine(net, r), at = mine ?? (spot && spot.x >= 0 && spot.y >= 0 && spot.x <= w && spot.y <= h ? { ...spot, w: HIT - 14, h: HIT - 14 } : null);
      if (at) out.push({ kind: 'route', id: `route:${net.id}:${r.idx}`, d: mid(at.x, at.y), order: r.order, label: r.label, sub: net.agency, box: [at.x - (at.w ?? 30) / 2, at.y - (at.h ?? 16) / 2, at.x + (at.w ?? 30) / 2, at.y + (at.h ?? 16) / 2] });
    }
    return out;
  }
  /** Where the keyboard lands on a route that has no badge or terminal on screen (downtown most routes are inside
   *  a trunk, which carries no member badges): the place on its line nearest the middle of the view. */
  private onLine(net: Net, r: NetRoute): { x: number; y: number; d: number } | null {
    const { w, h, s, cx, cy } = this.env, view: Box = [cx - w / 2 / s, cy - h / 2 / s, cx + w / 2 / s, cy + h / 2 / s];
    if (this.band === 'far' && !isRail(net.system) && !r.frequent) return null;                  // far: the routes that are named at far
    let best: { x: number; y: number; d: number } | null = null;
    for (const l of r.lines) {
      const line = net.lines[l]; if (!line || !touches(line.box, view)) continue;
      const p = line.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i]!, ay = p[i + 1]!, dx = p[i + 2]! - ax, dy = p[i + 3]! - ay, l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2)) : 0;
        const x = this.X(ax + dx * u), y = this.Y(ay + dy * u), d = Math.hypot(x - w / 2, y - h / 2);
        if (x >= 22 && y >= 22 && x <= w - 22 && y <= h - 22 && (!best || d < best.d)) best = { x, y, d };
      }
    }
    return best;
  }
  private routesList(net: Net, idx: readonly number[]): NetRoute[] { return idx.map((i) => net.routes[i]).filter((r): r is NetRoute => !!r).sort((a, b) => a.order - b.order); }
  private sub(id: string): string {
    const D = this.data, p = id.split(':');
    if (p[0] === 'hub') return D.t('map.hub_walk', { list: D.hubs[Number(p[1])]!.stops.filter((s) => D.on.includes(s.layer)).map((s) => `${s.name} (${D.label(s.layer)})`).join(', ') });
    const net = D.nets[p[1] ?? ''];
    if (p[0] === 'ix' && net) return D.t('map.change_here', { list: this.routesList(net, net.interchanges[Number(p[2])]?.routes ?? []).map((r) => r.label).join(', ') });
    if (p[0] === 'end' && net) return `${net.routes[Number(p[2])]?.label ?? ''} · ${net.agency}`;
    return '';
  }
  /** The card for whatever is chosen, as HTML for the map's note. Route names are Latin and stay left to right
   *  inside an Arabic card; a route is a button that chooses it. No arrival times, ever. */
  card(id: string): string {
    if (!this.env) return '';
    const D = this.data, p = id.split(':'), kind = p[0], net = D.nets[p[1] ?? ''];
    const ltr = (s: string) => `<bdi dir="ltr" lang="en">${esc(s)}</bdi>`;
    const buttons = (n: Net, idx: readonly number[]) => `<div class="routebtns">${this.routesList(n, idx).map((r) => `<button type="button" class="chip" data-route="route:${esc(n.id)}:${r.idx}">${ltr(r.label)}</button>`).join('')}</div>`;
    const wrap = (title: string, lines: string[], extra = '') => `<div class="mappick route"><span><strong>${title}</strong>${lines.filter(Boolean).map((l) => `<small>${l}</small>`).join('')}</span>${extra}</div>`;
    if (kind === 'route' && net) {
      const r = net.routes[Number(p[2])]; if (!r) return '';
      const ends = [...new Set(r.ends.map((e) => e.name).filter(Boolean))];
      return wrap(esc(D.t('map.route_card', { name: '⁦' + r.label + '⁩', agency: net.agency })), [
        r.frequent ? esc(D.t('map.route_frequent')) : '', r.headway ? esc(D.t('map.route_every', { minutes: r.headway })) : '',
        r.stopCount ? esc(D.t('map.route_stops', { count: r.stopCount })) : '', ends.length ? ltr(ends.join(' · ')) : '',
        r.derived ? esc(D.t('map.key_qline')) : '',
      ], D.planner(net.system, net.agency, net.agencyUrl));
    }
    if (kind === 'trunk' && net) { const tk = net.trunks[Number(p[2])]; return tk ? wrap(esc(D.t('map.many_routes', { count: tk.routes.length, list: '' }).replace(/[:：]\s*$/, '')), [], buttons(net, tk.routes)) : ''; }
    if (kind === 'ix' && net) { const ix = net.interchanges[Number(p[2])]; return ix ? wrap(ltr(ix.name || net.agency), [esc(D.t('map.change_here', { list: '' }).replace(/[:：]\s*$/, ''))], buttons(net, ix.routes)) : ''; }
    if (kind === 'end' && net) { const r = net.routes[Number(p[2])], e = r?.ends[Number(p[3])]; return r && e ? wrap(ltr(e.name || r.label), [esc(net.agency)], buttons(net, [r.idx])) : ''; }
    if (kind === 'hub') { const hub = D.hubs[Number(p[1])]; return hub ? wrap(ltr(hub.name), [esc(this.sub(id))]) : ''; }
    if (kind === 'stop') {
      const layer = p[1]!, i = Number(p[2]), name = (D.stops[layer]?.points ?? this.env.overlays.find((o) => o.id === 'go:' + layer)?.points)?.[i]?.name ?? '';
      const owner = Object.values(D.nets).find((n) => n.stopsLayer === layer), serves = (D.stops[layer]?.serves ?? owner?.serves)?.[i] ?? [];
      return wrap(ltr(name || D.label(layer)), [name ? esc(D.label(layer)) : '', owner && serves.length ? esc(D.t('map.stop_lines', { list: '' }).replace(/[:：]\s*$/, '')) : ''], owner && serves.length ? buttons(owner, serves) : '');
    }
    if (kind === 'mk') { const o = this.env.overlays.find((x) => x.id === 'go:' + p[1]), name = o?.points[Number(p[2])]?.name ?? ''; return wrap(ltr(name || o?.label || ''), [name ? esc(o?.label ?? '') : '']); }
    return '';
  }
  /** A chosen route needs its stops: ask for the stops layer (and what calls where) if this phone has not got it. */
  need(id: string): void {
    const m = /^route:(\w+):/.exec(id), net = m && this.data.nets[m[1]!];
    if (net && !isRail(net.system) && (!this.data.stops[net.stopsLayer]?.points || !this.data.stops[net.stopsLayer]?.serves)) this.data.want(net.stopsLayer);
  }
}
function nearCmds(cm: Cmds, x: number, y: number): number {
  let best = Infinity, px = 0, py = 0;
  for (let i = 0; i < cm.length;) {
    const op = cm[i]!, ex = cm[i + (op === 2 ? 3 : 1)]!, ey = cm[i + (op === 2 ? 4 : 2)]!;
    if (op !== 0) { const dx = ex - px, dy = ey - py, l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / l2)) : 0; best = Math.min(best, Math.hypot(x - px - u * dx, y - py - u * dy)); }
    px = ex; py = ey; i += op === 2 ? 5 : 3;
  }
  return best;
}
