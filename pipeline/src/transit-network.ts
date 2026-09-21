// What the subway-map style (docs/MAP-STYLE.md) needs to know about a transit network, worked out here once so
// that three clients never have to agree on geometry: which route each line belongs to, where routes share a
// street (and which side of it each one is drawn on), where a rider can change, where a route ends, and which
// colour of the fixed palette each route wears. Pure functions, no network, no clock: the same input always
// gives the same file, so a refresh is a reviewable diff.
//
// Everything here ADDS fields to the packed layer (format 2). `names`, `lines` and `points` keep the exact shape
// format 1 had, so a client that has not been updated keeps drawing what it drew before.

import { simplify, SCALE } from './ingest-basemap.js';

export type Pt = [number, number];                            // [lon, lat]

/** The packed format this file writes. 1 had names/lines/points only. */
export const FORMAT = 2;

// ---- the numbers the spec quotes (docs/MAP-STYLE.md "Data") --------------------------------------------------
/** Two routes share a street when their lines are this close, in metres … */
export const SHARE_M = 20;
/** … and point the same way (or the opposite way) within this many degrees. */
export const SHARE_DEG = 25;
/** How often a line is sampled to look for company, in metres. */
export const SAMPLE_M = 25;
/** A shared stretch shorter than this is folded into its neighbour: no jog for one block. */
export const MIN_RUN_M = 150;
/** Up to this many routes on one street are drawn side by side; more become one trunk. */
export const SIDE_BY_SIDE_MAX = 4;
/** Stops of two or more routes within this many metres are one interchange (the four corners of a crossing). */
export const INTERCHANGE_M = 75;
/** Stations of different systems within this many metres are one hub (a short walk, about two minutes). */
export const HUB_M = 150;
/** Line ends of one route closer than this are one terminal (the outbound end and the inbound start). */
export const TERMINAL_M = 250;
/** A stop belongs to a route's ordered list only if it is within this many metres of that route's line. */
export const STOP_ON_LINE_M = 60;
/** How many colours the bus palette has (docs/MAP-STYLE.md "Palette": tone 0…5). */
export const TONES = 6;

// ---- metres ---------------------------------------------------------------------------------------------
const LAT0 = 42.35;
const M_LAT = 111_132, M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
/** Local metres east and north of 0,0. Good to a fraction of a percent across the service area. */
export const toM = (pt: Pt): [number, number] => [pt[0] * M_LON, pt[1] * M_LAT];
export const distM = (a: Pt, b: Pt): number => { const p = toM(a), q = toM(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
export function lengthM(line: Pt[]): number { let d = 0; for (let i = 1; i < line.length; i++) d += distM(line[i - 1]!, line[i]!); return d; }

/** Snap to the packed grid (whole 1e-5 degrees from `origin`) and drop repeats, so vertex numbers computed
 *  here are the vertex numbers a phone sees after it decodes the line. */
export function quantise(line: Pt[], origin: Pt): Pt[] {
  const out: Pt[] = []; let px = NaN, py = NaN;
  for (const [lon, lat] of line) {
    const x = Math.round((lon - origin[0]) * SCALE), y = Math.round((lat - origin[1]) * SCALE);
    if (x === px && y === py) continue;
    out.push([origin[0] + x / SCALE, origin[1] + y / SCALE]); px = x; py = y;
  }
  return out;
}

/** The point `d` metres along a line, and the vertex it comes after. */
export function along(line: Pt[], d: number): { pt: Pt; after: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < line.length; i++) {
    const seg = distM(line[i - 1]!, line[i]!);
    if (left <= seg || i === line.length - 1) {
      const u = seg ? Math.min(1, left / seg) : 0, a = line[i - 1]!, b = line[i]!;
      return { pt: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], after: i - 1 };
    }
    left -= seg;
  }
  return { pt: line[0]!, after: 0 };
}

/** How far a point is from a line, and how far along the line the nearest place is. Metres. */
export function project(line: Pt[], pt: Pt): { off: number; at: number } {
  const [px, py] = toM(pt); let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = toM(line[i - 1]!), [bx, by] = toM(line[i]!);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
    if (d < best) { best = d; at = run + u * len; }
    run += len;
  }
  return { off: best, at };
}

// ---- routes that share a street -----------------------------------------------------------------------------
export interface RouteLine { route: number; line: Pt[] }
export interface RunLine extends RouteLine {
  /** Flat triples, one per run: [first vertex of the run, offset, how many routes share it]. `offset` is in
   *  half-steps to the LEFT of the line's own direction of travel (north up): 0 on the centre, ±1 for two,
   *  −2/0/+2 for three, ±1/±3 for four. More than SIDE_BY_SIDE_MAX routes is a trunk: offset 0, n as counted. */
  runs: number[];
  /** Per run, the routes on it (own route included), smallest first. Not written to the file; used for trunks
   *  and for colouring. */
  sets: number[][];
}

// The side of the street a route is drawn on must not depend on which way that bus happens to be going, so
// "left" is measured against one fixed direction. The axis of doubt sits at 72° from east, in the gap between
// Gratiot (about 55°) and the north–south mile roads (90°): no Detroit street grid runs that way, so a run's
// chord never flips its side because of a wiggle.
const CANON: [number, number] = [Math.cos((-18 * Math.PI) / 180), Math.sin((-18 * Math.PI) / 180)];

/** For every line, the stretches it shares with other routes and the slot it takes there.
 *  Both directions of one route count once. Lines come back quantised, with a vertex at every run boundary. */
export function sharedRuns(lines: RouteLine[], origin: Pt): RunLine[] {
  const q = lines.map((l) => ({ route: l.route, line: quantise(l.line, origin) }));
  // 1. sample every line
  interface S { x: number; y: number; b: number; route: number }
  const cell = 2 * SHARE_M, grid = new Map<string, S[]>();
  const perLine: { d: number; s: S }[][] = q.map((l) => {
    const total = lengthM(l.line), n = Math.max(1, Math.round(total / SAMPLE_M)), out: { d: number; s: S }[] = [];
    for (let i = 0; i <= n; i++) {
      const d = (total * i) / n, a = along(l.line, d), p0 = toM(l.line[a.after]!), p1 = toM(l.line[Math.min(l.line.length - 1, a.after + 1)]!);
      let b = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); if (b < 0) b += Math.PI; if (b >= Math.PI) b -= Math.PI;
      const [x, y] = toM(a.pt), s = { x, y, b, route: l.route };
      out.push({ d, s });
      const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
    }
    return out;
  });
  const tolB = (SHARE_DEG * Math.PI) / 180;
  const company = (s: S): number[] => {
    const found = new Set<number>([s.route]), cx = Math.floor(s.x / cell), cy = Math.floor(s.y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cy + j}`) ?? []) {
      if (o.route === s.route || found.has(o.route)) continue;
      const db = Math.abs(o.b - s.b), turn = Math.min(db, Math.PI - db);
      if (turn <= tolB && Math.hypot(o.x - s.x, o.y - s.y) <= SHARE_M) found.add(o.route);
    }
    return [...found].sort((a, b) => a - b);
  };
  // 2. runs of the same company, short ones folded into the run before (or after, for the first)
  return q.map((l, li) => {
    const samples = perLine[li]!;
    let runs: { from: number; set: number[] }[] = [];
    for (const { d, s } of samples) {
      const set = company(s), last = runs[runs.length - 1];
      if (!last || last.set.join() !== set.join()) runs.push({ from: d, set });
    }
    const total = samples[samples.length - 1]!.d;
    for (let pass = 0; pass < 4; pass++) {
      const kept: typeof runs = [];
      runs.forEach((r, i) => {
        const len = (runs[i + 1]?.from ?? total) - r.from;
        if (len < MIN_RUN_M && kept.length) return;                       // folded into the run before
        if (kept.length && kept[kept.length - 1]!.set.join() === r.set.join()) return;
        kept.push(r);
      });
      if (kept.length > 1 && (kept[1]!.from - kept[0]!.from) < MIN_RUN_M) { kept[1]!.from = 0; kept.shift(); }
      if (kept.length === runs.length) break;
      runs = kept;
    }
    runs[0]!.from = 0;
    // 3. a vertex at every boundary
    const pts = l.line.slice(), starts: number[] = [0];
    for (const r of runs.slice(1)) {
      const a = along(pts, r.from), [qp] = quantise([a.pt], origin) as [Pt];
      const same = (u: Pt, v: Pt) => Math.abs(u[0] - v[0]) < 1e-9 && Math.abs(u[1] - v[1]) < 1e-9;
      let idx: number;
      if (same(pts[a.after]!, qp)) idx = a.after;
      else if (same(pts[a.after + 1]!, qp)) idx = a.after + 1;
      else { pts.splice(a.after + 1, 0, qp); idx = a.after + 1; }
      starts.push(Math.max(idx, starts[starts.length - 1]!));
    }
    // 4. the slot
    const flat: number[] = [], sets: number[][] = [];
    runs.forEach((r, i) => {
      const from = starts[i]!, to = starts[i + 1] ?? pts.length - 1;
      if (i && from === starts[i - 1]) return;                              // squeezed out by the grid
      const n = r.set.length, k = r.set.indexOf(l.route);
      let off = n > SIDE_BY_SIDE_MAX ? 0 : 2 * k - (n - 1);
      const a = toM(pts[from]!), b = toM(pts[Math.max(to, from + 1)] ?? pts[from]!);
      if ((b[0] - a[0]) * CANON[0] + (b[1] - a[1]) * CANON[1] < 0) off = -off;
      flat.push(from, off === 0 ? 0 : off, n); sets.push(r.set);
    });
    return { route: l.route, line: pts, runs: flat, sets };
  });
}

/** Which routes run beside which for at least `minM` metres in total: the pairs that must not wear one colour. */
export function neighbours(lines: RunLine[], minM = 300): Map<number, Set<number>> {
  const shared = new Map<string, number>();
  for (const l of lines) l.sets.forEach((set, i) => {
    const from = l.runs[i * 3]!, to = l.runs[(i + 1) * 3] ?? l.line.length - 1, len = lengthM(l.line.slice(from, to + 1));
    for (const o of set) if (o !== l.route) { const k = `${l.route}|${o}`; shared.set(k, (shared.get(k) ?? 0) + len); }
  });
  const out = new Map<number, Set<number>>();
  for (const [k, len] of shared) {
    if (len < minM) continue;
    const [a, b] = k.split('|').map(Number) as [number, number];
    (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
    (out.get(b) ?? out.set(b, new Set()).get(b)!).add(a);
  }
  return out;
}

/** A palette tone (0…TONES−1) for each route, in route order: the least-used tone none of its neighbours has
 *  taken, ties to the lowest number. Routes that share a street therefore never share a colour while there are
 *  tones to go round; the badge carries the identity either way. */
export function assignTones(count: number, near: Map<number, Set<number>>, tones = TONES): number[] {
  const tone: number[] = new Array(count).fill(-1), used = new Array(tones).fill(0);
  for (let r = 0; r < count; r++) {
    const taken = new Set([...(near.get(r) ?? [])].map((o) => tone[o]).filter((t) => t !== undefined && t >= 0));
    let pick = -1;
    for (let t = 0; t < tones; t++) if (!taken.has(t) && (pick < 0 || used[t] < used[pick])) pick = t;
    if (pick < 0) for (let t = 0; t < tones; t++) if (pick < 0 || used[t] < used[pick]) pick = t;
    tone[r] = pick; used[pick]++;
  }
  return tone;
}

// ---- tones across every bus network at once ---------------------------------------------------------------------
// A rider sees one street, not one file: DDOT 4 and SMART 462 both run up Woodward, and the first version of this
// (tones handed out per network file) gave them the same brown. Tones are therefore settled over ALL bus networks
// together, from the packed `.net.json` files themselves — so a run that refreshes one network still sees the
// other, exactly as hubs are worked out from the committed layers.

/** The part of a routes `.net.json` file that colouring reads (and the one field it writes: `routes[].tone`). */
export interface ToneNet { system: string; origin: Pt; lines: [number, number[]][]; routes: { short: string; long?: string; tone: number; lines: number[] }[] }
/** Networks are coloured in this order when two routes carry the same number; anything else sorts after, by name. */
export const SYSTEM_ORDER = ['ddot', 'smart'];
/** Two routes are neighbours when they are drawn side by side, each in its own tone, for this many metres. */
export const NEIGHBOUR_M = 300;

const decodePacked = (enc: number[], origin: Pt): Pt[] => {
  const out: Pt[] = []; let x = 0, y = 0;
  for (let i = 0; i + 1 < enc.length; i += 2) { x = i ? x + enc[i]! : enc[i]!; y = i ? y + enc[i + 1]! : enc[i + 1]!; out.push([origin[0] + x / SCALE, origin[1] + y / SCALE]); }
  return out;
};
/** The order a rider would list routes in, across networks: by the number on the bus, then DDOT before SMART,
 *  then the order in the file. Routes without a number come last. Returns [net, route] pairs. */
export function riderOrder(nets: ToneNet[]): [number, number][] {
  const rank = (s: string) => { const i = SYSTEM_ORDER.indexOf(s); return i < 0 ? SYSTEM_ORDER.length : i; };
  const all = nets.flatMap((n, ni) => n.routes.map((r, ri) => ({ ni, ri, num: parseInt(r.short, 10), sys: rank(n.system), name: n.system })));
  return all.sort((a, b) => (Number.isFinite(a.num) ? a.num : 9e9) - (Number.isFinite(b.num) ? b.num : 9e9) || a.sys - b.sys || a.name.localeCompare(b.name) || a.ni - b.ni || a.ri - b.ri).map((x) => [x.ni, x.ri]);
}
/** How many metres each pair of routes — of any network — is drawn side by side IN ITS OWN TONE. A stretch where
 *  a route is part of a trunk (more than SIDE_BY_SIDE_MAX routes of its own network) does not count: there it
 *  wears the trunk colour, not its tone. Keys are `net:route`. */
export function sharedMetres(nets: ToneNet[]): Map<string, Map<string, number>> {
  interface S { x: number; y: number; b: number; key: string; net: number; len: number; trunk: boolean }
  const cell = 2 * SHARE_M, grid = new Map<string, S[]>(), all: S[] = [];
  nets.forEach((net, ni) => {
    const owner = new Map<number, number>();
    net.routes.forEach((r, ri) => r.lines.forEach((l) => owner.set(l, ri)));
    net.lines.forEach(([, enc], li) => {
      const ri = owner.get(li); if (ri === undefined) return;
      const line = decodePacked(enc, net.origin); if (line.length < 2) return;
      const total = lengthM(line), n = Math.max(1, Math.round(total / SAMPLE_M));
      for (let i = 0; i <= n; i++) {
        const a = along(line, (total * i) / n), p0 = toM(line[a.after]!), p1 = toM(line[Math.min(line.length - 1, a.after + 1)]!);
        let b = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); if (b < 0) b += Math.PI; if (b >= Math.PI) b -= Math.PI;
        const [x, y] = toM(a.pt), s: S = { x, y, b, key: `${ni}:${ri}`, net: ni, len: total / n, trunk: false };
        all.push(s);
        const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
      }
    });
  });
  const tolB = (SHARE_DEG * Math.PI) / 180;
  const company = (s: S): Map<string, S> => {
    const found = new Map<string, S>(), cx = Math.floor(s.x / cell), cy = Math.floor(s.y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cy + j}`) ?? []) {
      if (o.key === s.key || found.has(o.key)) continue;
      const db = Math.abs(o.b - s.b), turn = Math.min(db, Math.PI - db);
      if (turn <= tolB && Math.hypot(o.x - s.x, o.y - s.y) <= SHARE_M) found.set(o.key, o);
    }
    return found;
  };
  for (const s of all) s.trunk = [...company(s).values()].filter((o) => o.net === s.net).length + 1 > SIDE_BY_SIDE_MAX;
  const out = new Map<string, Map<string, number>>();
  for (const s of all) {
    if (s.trunk) continue;
    for (const [key, o] of company(s)) { if (o.trunk) continue; const m = out.get(s.key) ?? out.set(s.key, new Map()).get(s.key)!; m.set(key, (m.get(key) ?? 0) + s.len); }
  }
  return out;
}
/** A tone for every route of every bus network, handed out together, in rider order: the least-used tone that no
 *  neighbour (≥ NEIGHBOUR_M side by side, either way round, any agency) has taken, ties to the lowest number. If
 *  neighbours hold all six, the tone whose holders share the fewest metres with this route. Deterministic.
 *  Returns tones[net][route]. */
export function assignTonesAcross(nets: ToneNet[], tones = TONES, minM = NEIGHBOUR_M): number[][] {
  const shared = sharedMetres(nets), near = new Map<string, Map<string, number>>();
  for (const [a, m] of shared) for (const [b, len] of m) {
    const w = Math.max(len, shared.get(b)?.get(a) ?? 0); if (w < minM) continue;
    (near.get(a) ?? near.set(a, new Map()).get(a)!).set(b, w); (near.get(b) ?? near.set(b, new Map()).get(b)!).set(a, w);
  }
  const rider = riderOrder(nets), total = (tn: Map<string, number>) => { let c = 0; for (const [a, m] of near) for (const [b, w] of m) if (a < b && tn.get(a) === tn.get(b)) c += w; return c; };
  // Two starting orders, and the better result is kept: rider order (so low numbers get the first tones), and
  // the routes with the most neighbours first (rider order between equals), which is harder to corner.
  const busiest = rider.slice().sort((p, q) => (near.get(`${q[0]}:${q[1]}`)?.size ?? 0) - (near.get(`${p[0]}:${p[1]}`)?.size ?? 0));
  let kept: Map<string, number> | null = null;
  // … and, only if neither comes out clean, a fixed series of shuffles of rider order (a seeded generator, so the
  // same files always give the same tones).
  let seed = 313; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const orders: (() => [number, number][])[] = [() => rider, () => busiest, ...Array.from({ length: 300 }, () => () => { const o = rider.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j]!, o[i]!]; } return o; })];
  for (const make of orders) { const tn = paint(make()); if (!kept || total(tn) < total(kept)) kept = tn; if (!total(kept)) break; }
  return nets.map((n, ni) => n.routes.map((_, ri) => kept!.get(`${ni}:${ri}`)!));

  function paint(order: [number, number][]): Map<string, number> {
  const tone = new Map<string, number>(), used = new Array(tones).fill(0) as number[];
  for (const [ni, ri] of order) {
    const key = `${ni}:${ri}`, cost = new Array(tones).fill(0) as number[];
    for (const [o, w] of near.get(key) ?? []) { const t = tone.get(o); if (t !== undefined) cost[t]! += w; }
    let pick = 0;
    for (let t = 1; t < tones; t++) if (cost[t]! < cost[pick]! || (cost[t] === cost[pick] && used[t]! < used[pick]!)) pick = t;
    tone.set(key, pick); used[pick]!++;
  }
  // Rider order alone can paint itself into a corner (a late route whose neighbours already hold all six). So:
  // go round again. A route that still shares a tone with a neighbour moves to a free tone; if it has none, it
  // takes a tone and the neighbours holding that tone move to tones free FOR THEM (one push, never a chain).
  // A move is kept only when it lowers the total of shared metres, so this always ends.
  const costs = (key: string): number[] => { const c = new Array(tones).fill(0) as number[]; for (const [o, w] of near.get(key) ?? []) c[tone.get(o)!]! += w; return c; };
  for (let pass = 0, moved = true; moved && pass < 20; pass++) {
    moved = false;
    for (const [ni, ri] of order) {
      const key = `${ni}:${ri}`, mine = tone.get(key)!, cost = costs(key);
      if (!cost[mine]) continue;
      let best: { gain: number; t: number; push: [string, number][] } | null = null;
      for (let t = 0; t < tones; t++) {
        if (t === mine) continue;
        const push: [string, number][] = []; let left = 0;
        tone.set(key, t);
        for (const [o, w] of near.get(key) ?? []) {
          if (tone.get(o) !== t) continue;
          const oc = costs(o), free = oc.findIndex((c, i) => i !== t && c === 0);
          if (free >= 0 && !push.some(([q]) => near.get(o)?.has(q) && push.find(([x]) => x === q)![1] === free)) push.push([o, free]); else left += w;
        }
        tone.set(key, mine);
        const gain = cost[mine]! - left;
        if (gain > 0 && (!best || gain > best.gain)) best = { gain, t, push };
      }
      if (best) { tone.set(key, best.t); for (const [o, t] of best.push) tone.set(o, t); moved = true; }
    }
  }
  return tone;
  }
}
/** Pairs of neighbours that still wear one tone (there are only six): what a test and the ingest log report. */
export function toneClashes(nets: ToneNet[], minM = NEIGHBOUR_M): { a: string; b: string; metres: number }[] {
  const shared = sharedMetres(nets), out: { a: string; b: string; metres: number }[] = [];
  const label = (k: string) => { const [ni, ri] = k.split(':').map(Number) as [number, number]; return `${nets[ni]!.system} ${nets[ni]!.routes[ri]!.short || nets[ni]!.routes[ri]!.long || ri}`; };
  const toneOf = (k: string) => { const [ni, ri] = k.split(':').map(Number) as [number, number]; return nets[ni]!.routes[ri]!.tone; };
  const done = new Set<string>();
  for (const [a, m] of shared) for (const [b, len] of m) {
    const pair = [a, b].sort().join('|'); if (done.has(pair)) continue; done.add(pair);
    const w = Math.max(len, shared.get(b)?.get(a) ?? 0);
    if (w >= minM && toneOf(a) === toneOf(b)) out.push({ a: label(a), b: label(b), metres: Math.round(w) });
  }
  return out.sort((p, q) => q.metres - p.metres || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
/** Write the tones into the files' own `routes[].tone`. Returns how many routes changed. */
export function retone(nets: ToneNet[]): number {
  const tones = assignTonesAcross(nets); let changed = 0;
  nets.forEach((n, ni) => n.routes.forEach((r, ri) => { if (r.tone !== tones[ni]![ri]) { r.tone = tones[ni]![ri]!; changed++; } }));
  return changed;
}

// ---- places on the network ---------------------------------------------------------------------------------
/** Greedy clusters, first come first served in the order given: a point joins the first cluster whose seed is
 *  within `radius` metres, else starts one. Callers sort first, so the answer never depends on file order. */
export function cluster<T>(items: T[], at: (t: T) => Pt, radius: number): T[][] {
  const out: { seed: Pt; list: T[] }[] = [], cell = radius, grid = new Map<string, number[]>();
  for (const it of items) {
    const p = at(it), [x, y] = toM(p), cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let home = -1;
    for (let i = -1; i <= 1 && home < 0; i++) for (let j = -1; j <= 1 && home < 0; j++)
      for (const c of grid.get(`${cx + i},${cy + j}`) ?? []) if (distM(out[c]!.seed, p) <= radius) { home = c; break; }
    if (home < 0) { home = out.push({ seed: p, list: [] }) - 1; const k = `${cx},${cy}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(home); }
    out[home]!.list.push(it);
  }
  return out.map((c) => c.list);
}
/** The two points of a group that are furthest apart (the ends of the capsule drawn round them), in a fixed order. */
export function span(pts: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [pts[0]!, pts[0]!], far = -1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = distM(pts[i]!, pts[j]!); if (d > far) { far = d; best = [pts[i]!, pts[j]!]; } }
  return best[0][1] < best[1][1] || (best[0][1] === best[1][1] && best[0][0] <= best[1][0]) ? best : [best[1], best[0]];
}
export const centre = (pts: Pt[]): Pt => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

export interface NetStop { id: string; name: string; pt: Pt; routes: number[]; dir?: string }
export interface NetRoute {
  id: string; short: string; long: string; color?: string; text?: string; frequent?: boolean; headway?: number;
  loop?: boolean; derived?: boolean;
}
export interface Network {
  system: string; agency: string; agency_url?: string;
  routes: NetRoute[];
  /** One line per route and direction (or per clipped piece). `dir` is the owner's word for the direction. */
  lines: (RouteLine & { dir?: string })[];
  stops: NetStop[];
  /** Where the owner publishes stop order (GTFS stop_times): route -> patterns of stop ids, in travel order. */
  patterns?: Map<number, string[][]>;
}

export interface PackedRoute {
  id: string; short: string; long: string; tone: number; color?: string; text?: string; frequent?: true; headway?: number;
  loop?: true; derived?: true; lines: number[]; stops: number[][]; ends: [number, number, number][];
}
export interface PackedNetwork {
  routesLayer: Record<string, unknown> & { lines: [number, number[]][]; routes: PackedRoute[] };
  stopsLayer: Record<string, unknown> & { points: [number, number, number][]; serves: number[][] };
}

const enc = (line: Pt[], origin: Pt): number[] => {
  const out: number[] = []; let px = 0, py = 0;
  line.forEach(([lon, lat], i) => { const x = Math.round((lon - origin[0]) * SCALE), y = Math.round((lat - origin[1]) * SCALE); out.push(i ? x - px : x, i ? y - py : y); px = x; py = y; });
  return out;
};
const xy = (pt: Pt, origin: Pt): [number, number] => [Math.round((pt[0] - origin[0]) * SCALE), Math.round((pt[1] - origin[1]) * SCALE)];

/** The stops file a network's numbers point at, when it is not ours to lay out: the layer the standard style
 *  already ships (`names` + `points`), left exactly as it is. */
export interface BaseStops { names: string[]; points: [number, number, number][] }

/** A whole network into `routesLayer` (its lines, routes, runs, interchanges and trunks — a file that stands on
 *  its own) and `stopsLayer` (the stops, plus `serves`: the routes that call at each one).
 *  With `base`, the stops are NOT laid out again: every stop number here is a number in `base.points`, so the
 *  extra facts can travel in a small file beside a stops layer that stays byte for byte what it was.
 *  `keepEnd` says whether a line end is a real end of the route (true) or only where we clipped it. */
export function packNetwork(net: Network, ids: { routes: string; stops: string }, origin: Pt, tol: number, keepEnd: (pt: Pt) => boolean, base?: BaseStops): PackedNetwork {
  // Stops first: their order in the file is the number everything else points at.
  const stops = net.stops.slice().sort((a, b) => a.pt[1] - b.pt[1] || a.pt[0] - b.pt[0] || a.id.localeCompare(b.id));
  const sNames: string[] = base ? base.names : [], sSeen = new Map<string, number>();
  const sName = (n: string) => (n ? sSeen.get(n) ?? (sSeen.set(n, sNames.push(n) - 1), sNames.length - 1) : -1);
  const points = base ? base.points : stops.map((s) => [sName(s.name), ...xy(s.pt, origin)] as [number, number, number]);
  const stopIdx = new Map<string, number>();
  if (base) {
    const at = new Map<string, number>();
    base.points.forEach(([n, x, y], i) => { const k = `${x},${y}|${n < 0 ? '' : base.names[n] ?? ''}`; if (!at.has(k)) at.set(k, i); });
    for (const s of stops) { const i = at.get(`${xy(s.pt, origin).join()}|${s.name}`); if (i !== undefined) stopIdx.set(s.id, i); }
  } else stops.forEach((s, i) => stopIdx.set(s.id, i));
  const serves: number[][] = points.map(() => []);
  for (const s of stops) { const i = stopIdx.get(s.id); if (i !== undefined) serves[i] = [...new Set([...serves[i]!, ...s.routes])].sort((a, b) => a - b); }

  // Lines, in route order then direction, with shared runs worked out over the simplified shapes.
  const order = net.lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.route - b.l.route || (a.l.dir ?? '').localeCompare(b.l.dir ?? '') || a.i - b.i).map((x) => x.l);
  const run = sharedRuns(order.map((l) => ({ route: l.route, line: simplify(l.line, tol) })), origin).map((r, i) => ({ ...r, dir: order[i]!.dir }));
  const usable = run.filter((r) => r.line.length > 1);
  const tones = assignTones(net.routes.length, neighbours(usable));
  const names: string[] = [], seen = new Map<string, number>();
  const nameIdx = (n: string) => (n ? seen.get(n) ?? (seen.set(n, names.push(n) - 1), names.length - 1) : -1);
  const label = (r: NetRoute) => [r.short, r.long].filter(Boolean).filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i).join(' ');
  net.routes.forEach((r) => nameIdx(label(r)));                          // route names first, in route order

  const routes: PackedRoute[] = net.routes.map((r, ri) => {
    const mine = usable.map((l, i) => ({ l, i })).filter((x) => x.l.route === ri);
    const members = stops.filter((s) => s.routes.includes(ri));
    // Ordered stops: the owner's own order where it is published; otherwise by distance along the line that
    // goes the stop's way, keeping only stops within STOP_ON_LINE_M of it.
    let ordered: number[][];
    const pats = net.patterns?.get(ri);
    if (pats?.length) ordered = pats.map((p) => p.map((id) => stopIdx.get(id)).filter((x): x is number => x !== undefined)).filter((p) => p.length > 1);
    else {
      ordered = mine.map(({ l }) => members
        .filter((s) => !s.dir || !l.dir || s.dir === l.dir || !mine.some((o) => o.l.dir === s.dir))
        .map((s) => ({ s, p: project(l.line, s.pt) })).filter((x) => x.p.off <= STOP_ON_LINE_M)
        .sort((a, b) => a.p.at - b.p.at).map((x) => stopIdx.get(x.s.id)).filter((x): x is number => x !== undefined)).filter((p) => p.length > 1);
    }
    // Ends: line ends that are real (not where we clipped), clustered, named after the route's nearest stop.
    const closed = mine.length > 0 && mine.every(({ l }) => distM(l.line[0]!, l.line[l.line.length - 1]!) <= TERMINAL_M);
    const loop = r.loop ?? (closed && mine.length === 1);
    const tips = loop ? [] : mine.flatMap(({ l }) => [l.line[0]!, l.line[l.line.length - 1]!]).filter(keepEnd).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const ends = cluster(tips, (t) => t, TERMINAL_M).map((g) => {
      const c = centre(g), near = members.map((s) => ({ s, d: distM(s.pt, c) })).sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id))[0];
      const at = near && near.d <= TERMINAL_M ? near.s.pt : c;
      return [...xy(at, origin), near && near.d <= TERMINAL_M ? nameIdx(near.s.name) : -1] as [number, number, number];
    });
    return {
      id: r.id, short: r.short, long: r.long, tone: tones[ri]!,
      ...(r.color ? { color: r.color.toLowerCase() } : {}), ...(r.text ? { text: r.text.toLowerCase() } : {}),
      ...(r.frequent ? { frequent: true as const } : {}), ...(r.headway ? { headway: r.headway } : {}),
      ...(loop ? { loop: true as const } : {}), ...(r.derived ? { derived: true as const } : {}),
      lines: mine.map((x) => x.i), stops: ordered, ends,
    };
  });

  // Interchanges: stops of 2+ routes within INTERCHANGE_M of each other.
  const interchanges = cluster(stops.filter((s) => s.routes.length), (s) => s.pt, INTERCHANGE_M)
    .map((g) => ({ g, set: [...new Set(g.flatMap((s) => s.routes))].sort((a, b) => a - b) }))
    .filter((c) => c.set.length > 1)
    .map((c) => {
      const name = c.g.map((s) => s.name).sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? '';
      // The capsule's two ends, as steps from its centre: the two stops of the group that are furthest apart.
      const [a, b] = span(c.g.map((s) => s.pt)), m = xy(centre(c.g.map((s) => s.pt)), origin), pa = xy(a, origin), pb = xy(b, origin);
      return [...m, nameIdx(name), c.set, [pa[0] - m[0], pa[1] - m[1], pb[0] - m[0], pb[1] - m[1]]] as [number, number, number, number[], number[]];
    });

  // Trunks: where more than SIDE_BY_SIDE_MAX routes share a street, one anchor for the stacked badge.
  const trunkMid: { pt: Pt; set: number[] }[] = [];
  for (const l of usable) l.sets.forEach((set, i) => {
    if (set.length <= SIDE_BY_SIDE_MAX) return;
    const from = l.runs[i * 3]!, to = l.runs[(i + 1) * 3] ?? l.line.length - 1, piece = l.line.slice(from, to + 1);
    if (piece.length > 1) trunkMid.push({ pt: along(piece, lengthM(piece) / 2).pt, set });
  });
  trunkMid.sort((a, b) => a.pt[1] - b.pt[1] || a.pt[0] - b.pt[0]);
  const trunks = cluster(trunkMid, (t) => t.pt, 400).map((g) =>
    [...xy(centre(g.map((t) => t.pt)), origin), [...new Set(g.flatMap((t) => t.set))].sort((a, b) => a - b)] as [number, number, number[]]);

  const head = { v: FORMAT, system: net.system, agency: net.agency, ...(net.agency_url ? { agency_url: net.agency_url } : {}) };
  return {
    routesLayer: {
      id: ids.routes, kind: 'line', origin, names,
      lines: usable.map((l) => [nameIdx(label(net.routes[l.route]!)), enc(l.line, origin)] as [number, number[]]),
      points: [], ...head, stops_layer: ids.stops, stops_count: points.length,
      routes, runs: usable.map((l) => l.runs), interchanges, trunks,
    },
    stopsLayer: {
      id: ids.stops, kind: 'point', origin, names: sNames, lines: [], points, ...head, routes_layer: ids.routes,
      route_ids: net.routes.map((r) => r.id), serves, unmatched: stops.length - stopIdx.size,
    },
  };
}

// ---- hubs: stations of different systems a short walk apart ---------------------------------------------------
export interface HubStation { layer: string; name: string; pt: Pt }
/** `origin` is what `at` and `span` are counted from ([lon, lat]; whole 1e-5 degrees, like every layer). It is
 *  written on every hub so that a client never has to assume which grid a hub is on. */
export interface Hub { origin: Pt; at: [number, number]; span: number[]; name: string; layers: string[]; stops: { layer: string; name: string }[] }
export function hubs(stations: HubStation[], origin: Pt, radius = HUB_M): Hub[] {
  const sorted = stations.slice().sort((a, b) => a.pt[1] - b.pt[1] || a.pt[0] - b.pt[0] || a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  return cluster(sorted, (s) => s.pt, radius)
    .filter((g) => new Set(g.map((s) => s.layer)).size > 1)
    .map((g) => {
      const seen = new Set<string>(), stops = g.map((s) => ({ layer: s.layer, name: s.name })).filter((s) => !seen.has(`${s.layer}|${s.name}`) && seen.add(`${s.layer}|${s.name}`));
      const [a, b] = span(g.map((s) => s.pt));
      const m = xy(centre(g.map((s) => s.pt)), origin), pa = xy(a, origin), pb = xy(b, origin);
      return { origin, at: m, span: [pa[0] - m[0], pa[1] - m[1], pb[0] - m[0], pb[1] - m[1]], name: g.map((s) => s.name).sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!, layers: [...new Set(g.map((s) => s.layer))].sort(), stops };
    });
}
