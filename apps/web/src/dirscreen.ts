// Our own directions, computed on this phone (DECISIONS 2026-09-22).
//
// This whole file — and the Worker it starts, and `packages/query`'s routing with it — is a chunk of its own,
// asked for the first time somebody taps Directions. Nobody who never taps it downloads a byte of it.
//
// **The screen is traceless.** It is reached only through `{ v: 'directions' }`, which `hashFor` answers `null`
// for, so no destination is ever in the address bar, the browser's history list or the window title (the title
// is the plain "Directions · 313 Help"). The origin is worse than the destination and is treated as such: it
// lives in `main.ts`'s `here` for as long as the tab is open, it is passed to the Worker and to nothing else,
// and it is never written down, never put in a URL, and never sent anywhere. The two people this was built for
// are a survivor with no phone service and a person with no signal looking for food; where they are standing is
// the one fact that must never leave the device.
//
// **The words are the contract.** Every sentence comes from `dirwords.ts`, which the spec's wording rules are
// written into: the estimate is a range, a headway is only ever the agency's own sentence, nothing is called
// safe or accessible, and the last leg ends at the street.

import type { Itinerary } from '@313help/query';
import type { MapDot, MapRoute } from './map.js';
import type { Bundle, BundleIndex } from './data.js';
import type { FromWorker, ToWorker } from './dirworker.js';
import { OFF_ROUTE_M, type DirStep, type Say, currentStep, distance, isRide, itineraryTitle, legsLine, metresFromRoute, offStreet, rangeWords, routeText, steps, summary } from './dirwords.js';
import { streetFiles, transitLayers } from './dirfiles.js';

export interface DirPlace { lat: number; lon: number; name: string }

export interface DirDeps {
  t: Say;
  esc: (s: unknown) => string;
  icon: (name: string, cls?: string) => string;
  /** `main.ts`'s own `mapBox`, so every map in the app is built the one way. */
  mapBox: (o: { key: string; label: string; route?: MapRoute; dots?: MapDot[]; fit?: { lat: number; lon: number }[]; minMeters?: number; quiet?: boolean; me?: boolean }) => string;
  announce: (message: string) => void;
  /** `render(false)`: draw the screen again without moving the cursor. */
  rerender: () => void;
  /** The origin, or null. A variable in `main.ts` that dies with the page — never read from storage. */
  origin: () => { lat: number; lon: number } | null;
  /** How the origin was given: the device, a typed junction, a typed ZIP, or nothing yet. */
  originKind: () => 'me' | 'cross' | 'zip' | 'none';
  /** The words for a typed origin ("Woodward & Warren", "48201"), for the screen only. */
  originWords: () => string;
  /** The same three ways in the rest of the app offers, reused unchanged — the cross street first here. */
  originHtml: () => string;
  index: BundleIndex;
  transit: Bundle['transit'];
  /** `focusRadius` from map.ts, for following along. */
  centre: (key: string, lat: number, lon: number, metres: number) => boolean;
}

type Phase = 'need_origin' | 'loading' | 'building' | 'planning' | 'ready' | 'empty' | 'nofiles' | 'failed';

// ---- state: this visit only, and nothing in it is ever written or sent ------------------------
let dest: DirPlace | null = null;
let phase: Phase = 'need_origin';
let plans: Itinerary[] = [];
let chosen = -1;                                  // -1 is the list of ways; otherwise the index in `plans`
let stepList: DirStep[] = [];
let stepAt = -1;                                  // follow-along: which step is current, -1 for none
let offRoute = false;
let following = false;
let watchId: number | null = null;
let livePos: { lat: number; lon: number } | null = null;
let planFor = '';                                 // the origin+destination the plans on screen belong to
let refocus = '';                                 // where the cursor goes after the next redraw

// The Worker, and the graph inside it, live for the session: built once per bundle, on the first tap.
let worker: Worker | null = null;
let built = false;
let hasTransit = false;
let reqId = 0;
let noWorker = false;                             // this browser refused to start one; the screen says so

/** What the cursor should land on after this redraw, and then nothing. */
export const takeRefocus = (): string => { const s = refocus; refocus = ''; return s; };

const keyOf = (o: { lat: number; lon: number } | null, d: DirPlace | null) =>
  (o && d ? `${o.lat.toFixed(5)},${o.lon.toFixed(5)}>${d.lat.toFixed(5)},${d.lon.toFixed(5)}` : '');

/** A new Directions screen. Everything about the last one goes, including any plan still in flight. */
export function open(place: DirPlace, deps: DirDeps): void {
  dest = place;
  plans = []; chosen = -1; stepList = []; stepAt = -1; offRoute = false; planFor = '';
  stopFollowing();
  begin(deps);
}

/** Leaving the screen. The graph stays (it cost a second to build and belongs to the bundle, not the trip);
 *  the trip does not. */
export function close(): void {
  stopFollowing();
  dest = null; plans = []; chosen = -1; stepList = []; stepAt = -1; offRoute = false; planFor = '';
}

// ---- the work ---------------------------------------------------------------------------------

function post(msg: ToWorker, onReply: (r: FromWorker) => void): void {
  if (!worker) { onReply({ type: 'error', id: msg.id, message: 'no worker' }); return; }
  const w = worker;
  const listener = (e: MessageEvent<FromWorker>) => { if (e.data.id !== msg.id) return; w.removeEventListener('message', listener); onReply(e.data); };
  w.addEventListener('message', listener);
  w.postMessage(msg);
}

/**
 * Start the Worker, once per session.
 *
 * A **classic** worker, not a module one (`worker.format = 'iife'` in vite.config.ts): a module worker needs
 * Firefox 114, and the routing rules are 20 KB gzipped that must not end up in the main script just to keep a
 * same-thread fallback alive. A classic worker is supported by every browser that can run this app at all, and
 * it keeps the whole of the routing out of the first download for everyone who never taps Directions.
 */
function ensureWorker(): void {
  if (worker || noWorker) return;
  if (typeof Worker === 'undefined') { noWorker = true; return; }
  try { worker = new Worker(new URL('./dirworker.ts', import.meta.url)); } catch { noWorker = true; }
}

/** The map files, then the graph, then the plan. Each step says where it has got to, out loud and on screen. */
function begin(deps: DirDeps): void {
  const from = deps.origin();
  if (!dest) return;
  if (!from) { phase = 'need_origin'; deps.rerender(); return; }
  const key = keyOf(from, dest);
  if (planFor === key && phase === 'ready') return;                 // the same trip: nothing to do again
  if (built) { runPlan(from, dest, key, deps); return; }
  phase = 'loading';
  deps.rerender();
  void (async () => {
    try {
      ensureWorker();
      const [streets, layers] = await Promise.all([streetFiles(deps.index), transitLayers(deps.index, deps.transit)]);
      if (!streets.length) { phase = 'nofiles'; deps.rerender(); deps.announce(deps.t('dir.no_streets')); return; }
      phase = 'building';
      deps.rerender();
      deps.announce(deps.t('dir.building'));
      const id = ++reqId;
      post({ type: 'build', id, streets, layers }, (r) => {
        if (r.type !== 'ready') { phase = 'failed'; deps.rerender(); deps.announce(deps.t('dir.failed')); return; }
        built = true; hasTransit = r.transit;
        const now = deps.origin();
        if (now && dest) runPlan(now, dest, keyOf(now, dest), deps);
      });
    } catch { phase = 'failed'; deps.rerender(); deps.announce(deps.t('dir.failed')); }
  })();
}

function runPlan(from: { lat: number; lon: number }, to: DirPlace, key: string, deps: DirDeps): void {
  phase = 'planning';
  deps.rerender();
  const id = ++reqId;
  post({ type: 'plan', id, from, to: { lat: to.lat, lon: to.lon } }, (r) => {
    if (r.type !== 'plans') { phase = 'failed'; deps.rerender(); deps.announce(deps.t('dir.failed')); return; }
    plans = r.plans; planFor = key; chosen = -1; stepList = []; stepAt = -1; offRoute = false;
    phase = plans.length ? 'ready' : 'empty';
    refocus = plans.length ? '.dirways .dirway:first-child button' : '.dirmsg';
    deps.rerender();
    deps.announce(plans.length ? deps.t(plans.length === 1 ? 'dir.said_one_plan' : 'dir.said_plans', { count: plans.length }) : deps.t('dir.none'));
  });
}

/** The origin changed under us (a fix arrived, a junction was typed, "Use my location" was switched off). */
export function originChanged(deps: DirDeps): void {
  if (!dest) return;
  const from = deps.origin();
  if (!from) { phase = 'need_origin'; plans = []; chosen = -1; planFor = ''; stopFollowing(); deps.rerender(); return; }
  if (keyOf(from, dest) === planFor) return;
  begin(deps);
}

// ---- following along ---------------------------------------------------------------------------
// There is no rerouting here and there is not going to be: a phone that quietly changes the route under a
// person walking down a street at night is worse than one that says "you are off the route" and waits to be
// asked. The whole of the logic is: which step is nearest, and are we further than OFF_ROUTE_M from the line.

function stopFollowing(): void {
  if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null; following = false; livePos = null;
}
function startFollowing(deps: DirDeps): void {
  if (following || typeof navigator === 'undefined' || !navigator.geolocation) return;
  following = true;
  watchId = navigator.geolocation.watchPosition((p) => {
    livePos = { lat: p.coords.latitude, lon: p.coords.longitude };
    const it = plans[chosen];
    if (!it) return;
    const was = stepAt, wasOff = offRoute;
    offRoute = metresFromRoute(livePos, it.legs.map((l) => l.polyline)) > OFF_ROUTE_M;
    stepAt = currentStep(livePos, it, stepList);
    // The map keeps the person in view. `centre` eases the move, and does not under Reduce Motion — map.ts's
    // `radiusTo` already answers that media query, so there is nothing to decide here.
    deps.centre('dir', livePos.lat, livePos.lon, 400);
    if (stepAt !== was || offRoute !== wasOff) {
      deps.rerender();
      deps.announce(offRoute ? deps.t('dir.off_route') : deps.t('dir.follow_say', { n: stepAt + 1, total: stepList.length, text: stepList[stepAt]?.text ?? '' }));
    }
  }, () => { stopFollowing(); deps.rerender(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 300000 });
}

// ---- the screen ---------------------------------------------------------------------------------

/** Which token a ride leg wears: the agency's own layer tone, so the map and the layer switcher agree. */
const AGENCY_CSS: Record<string, string> = { ddot: '--lyr-bus', smart: '--lyr-smart', qline: '--lyr-rail', dpm: '--lyr-rail' };
function rideCss(agency: string): string {
  const k = agency.toLowerCase();
  for (const [id, token] of Object.entries(AGENCY_CSS)) if (k.includes(id)) return token;
  return '--route-ride';
}

/** One itinerary, ready for the canvas: a leg per line, a marker per start, boarding, alighting and end. */
export function mapRoute(t: Say, it: Itinerary, destination: string, active: number): MapRoute {
  const legs: MapRoute['legs'] = it.legs.map((l) => (l.kind === 'walk'
    ? { kind: 'walk' as const, polyline: l.polyline, css: '--route-walk' }
    : { kind: 'ride' as const, polyline: l.polyline, css: rideCss(l.agency), dash: [2.2, 1.4] }));
  const marks: MapRoute['marks'] = [];
  const first = it.legs[0], last = it.legs[it.legs.length - 1];
  if (first?.polyline.length) marks.push({ lat: first.polyline[0]![1], lon: first.polyline[0]![0], kind: 'start', label: t('dir.mark_start'), sub: '' });
  for (const l of it.legs) {
    if (!isRide(l)) continue;
    const a = l.polyline[0], b = l.polyline[l.polyline.length - 1];
    if (a) marks.push({ lat: a[1], lon: a[0], kind: 'board', label: t('dir.mark_board'), sub: l.from_stop.name });
    if (b) marks.push({ lat: b[1], lon: b[0], kind: 'alight', label: t('dir.mark_alight'), sub: l.to_stop.name });
  }
  if (last?.polyline.length) { const p = last.polyline[last.polyline.length - 1]!; marks.push({ lat: p[1], lon: p[0], kind: 'end', label: t('dir.mark_end'), sub: destination }); }
  return { legs, marks, text: routeText(t, it), active };
}

const fitPoints = (it: Itinerary) => it.legs.flatMap((l) => l.polyline.map(([lon, lat]) => ({ lat, lon })));

/** The whole screen. Called by `main.ts`'s renderer like any other screen's function. */
export function html(deps: DirDeps): string {
  const { t, esc } = deps;
  const T = (k: string, p?: Record<string, string | number>) => esc(t(k, p));
  if (!dest) return `<main><p class="empty">${T('dir.none')}</p></main>`;
  const head = `<p class="lede">${T('dir.to', { name: '' })}<span lang="en">${esc(dest.name)}</span></p>
    <p class="foot dircaveat">${T('dir.caveat')}</p><p class="foot dircaveat">${T('dir.caveat_times')}</p>`;
  if (phase === 'need_origin') {
    // The cross-street field comes first here, and not on any other screen: it is the only one of the three
    // that works with no signal at all, and this screen is the one a person with no signal is on.
    return `<main class="dir">${head}<h2>${T('dir.from_head')}</h2><p class="foot">${T('dir.from_hint')}</p>${deps.originHtml()}</main>`;
  }
  const from = originLine(deps);
  if (phase === 'loading' || phase === 'building' || phase === 'planning') {
    // Not a live region: the app has one, outside the part of the page a redraw replaces, and `announce()` is
    // what puts these sentences in it. A region built by the redraw that fills it is never announced at all.
    return `<main class="dir">${head}${from}<p class="banner plain dirmsg">${T(phase === 'planning' ? 'dir.planning' : 'dir.building')}</p></main>`;
  }
  if (phase === 'nofiles') return `<main class="dir">${head}${from}<p class="banner warn dirmsg" tabindex="-1">${T('dir.no_streets')}</p></main>`;
  if (phase === 'failed') return `<main class="dir">${head}${from}<p class="banner warn dirmsg" tabindex="-1">${T('dir.failed')} <button class="chip" data-dir-act="retry">${T('dir.retry')}</button></p></main>`;
  if (phase === 'empty') return `<main class="dir">${head}${from}<p class="empty dirmsg" tabindex="-1">${T('dir.none')}</p></main>`;
  return chosen < 0 ? `<main class="dir">${head}${from}${waysHtml(deps)}</main>` : `<main class="dir">${head}${from}${stepsHtml(deps)}</main>`;
}

/** Where this trip starts, in words, and the way back to changing it. Never a coordinate, ever. */
function originLine(deps: DirDeps): string {
  const { t, esc } = deps;
  const kind = deps.originKind(), words = deps.originWords();
  const said = kind === 'me' ? esc(t('dir.from_me')) : kind === 'zip' ? esc(t('dir.from_zip', { zip: words })) : `${esc(t('dir.from_here', { where: '' }))}<span lang="en">${esc(words)}</span>`;
  return `<p class="loc dirfrom">${deps.icon('pin', 'sm')}<span>${said}</span> <button class="chip" data-dir-act="restart">${esc(t('dir.change_start'))}</button></p>`;
}

/** Up to three ways to get there, in the planner's own rank order, each one a card that is also a button. */
function waysHtml(deps: DirDeps): string {
  const { t, esc } = deps;
  return `<h2>${esc(t('dir.ways_head'))}</h2><ul class="dirways">${plans.map((it, i) => {
    const head = esc(itineraryTitle(t, it)), legs = esc(legsLine(t, it)), range = esc(rangeWords(t, it));
    const every = it.legs.filter(isRide).map((l) => (typeof l.headway_minutes === 'number' && l.headway_minutes > 0 ? t('dir.every', { minutes: l.headway_minutes }) : '')).find(Boolean) ?? '';
    return `<li class="dirway"><button class="row" data-dir-pick="${i}" aria-label="${esc(t('dir.choose_label', { summary: summary(t, it) }))}">
      <span class="rowtx"><strong>${head}</strong><small>${legs} · ${range}${every ? ` · ${esc(every)}` : ''}</small></span>
      <span class="chip plain">${esc(t('dir.choose'))}</span></button></li>`;
  }).join('')}</ul>${hasTransit ? '' : `<p class="foot">${esc(t('dir.walk_only'))}</p>`}`;
}

/** The chosen way: the map, then the numbered steps, which are what the screen actually promises. */
function stepsHtml(deps: DirDeps): string {
  const { t, esc } = deps;
  const it = plans[chosen]!;
  stepList = steps(t, it, dest!.name);
  const route = mapRoute(t, it, dest!.name, stepAt >= 0 ? (stepList[stepAt]?.leg ?? -1) : -1);
  const map = deps.mapBox({
    key: 'dir', label: t('map.label_route', { name: dest!.name }), route, minMeters: 500, quiet: true,
    fit: fitPoints(it), me: true,
    dots: [{ lat: dest!.lat, lon: dest!.lon, label: dest!.name }],
  });
  const canFollow = typeof navigator !== 'undefined' && !!navigator.geolocation;
  return `<h2>${esc(itineraryTitle(t, it))} <span class="pill plain">${esc(rangeWords(t, it))}</span></h2>
    ${map}
    <div class="stackbtns"><div class="two">
      <button class="btn ghost" data-dir-act="ways">${deps.icon('back', 'sm turn')}${esc(t('dir.other_ways'))}</button>
      ${canFollow ? `<button class="btn ghost" data-dir-act="follow" aria-pressed="${following}">${deps.icon('pin', 'sm')}${esc(t(following ? 'dir.follow_stop' : 'dir.follow'))}</button>` : ''}
    </div></div>
    ${offRoute ? `<p class="banner warn" role="note">${esc(t('dir.off_route'))} <button class="chip" data-dir-act="again">${esc(t('dir.plan_again'))}</button></p>` : ''}
    <h3 class="sub">${esc(t('dir.steps_head'))}</h3>
    <ol class="dirsteps" tabindex="0" aria-describedby="dirkeys">${stepList.map((s, i) => `<li${i === stepAt ? ' class="now" aria-current="step"' : ''}><bdi>${esc(s.text)}</bdi></li>`).join('')}</ol>
    <p class="vh" id="dirkeys">${esc(t('dir.steps_keys'))}</p>
    <p class="foot">${esc(t('dir.caveat'))}</p>`;
}

// ---- what the screen's own buttons do -------------------------------------------------------------

/** True when this element was one of ours and has been dealt with. */
export function onClick(el: HTMLElement, deps: DirDeps): boolean {
  const pick = el.dataset.dirPick;
  if (pick !== undefined) {
    chosen = Number(pick); stepAt = -1; offRoute = false;
    refocus = '.dirsteps li:first-child, h2';
    deps.rerender();
    deps.announce(deps.t('dir.chose_say', { summary: summary(deps.t, plans[chosen]!) }));
    return true;
  }
  const act = el.dataset.dirAct;
  if (!act) return false;
  if (act === 'ways') { chosen = -1; stopFollowing(); refocus = '.dirways .dirway:first-child button'; deps.rerender(); return true; }
  if (act === 'retry' || act === 'again') { built = built && act === 'again'; planFor = ''; begin(deps); return true; }
  if (act === 'restart') { chosen = -1; plans = []; planFor = ''; phase = 'need_origin'; stopFollowing(); refocus = '.crossform input, [data-loc="cross"]'; deps.rerender(); return true; }
  if (act === 'follow') {
    if (following) { stopFollowing(); stepAt = -1; } else startFollowing(deps);
    refocus = '[data-dir-act="follow"]';
    deps.rerender();
    deps.announce(deps.t(following ? 'dir.follow_on_say' : 'dir.follow_off_say'));
    return true;
  }
  return false;
}

/** The keyboard, on the steps: N and P walk them, exactly as they walk the map's own features. */
export function onKey(key: string, deps: DirDeps): boolean {
  if (chosen < 0 || !stepList.length) return false;
  if (key !== 'n' && key !== 'N' && key !== 'p' && key !== 'P') return false;
  const dir = key === 'n' || key === 'N' ? 1 : -1;
  stepAt = stepAt < 0 ? (dir > 0 ? 0 : stepList.length - 1) : (stepAt + dir + stepList.length) % stepList.length;
  refocus = '.dirsteps li.now';
  deps.rerender();
  deps.announce(deps.t('dir.follow_say', { n: stepAt + 1, total: stepList.length, text: stepList[stepAt]?.text ?? '' }));
  return true;
}

/** For the tests and for the report: what is on screen, without a DOM. */
export const state = () => ({ phase, plans: plans.length, chosen, steps: stepList.length, stepAt, offRoute, following, hasTransit, livePos: livePos !== null });
/** Used by the tests only: forget the graph so a fresh case starts from nothing. */
export function reset(): void { close(); worker?.terminate(); worker = null; noWorker = false; built = false; hasTransit = false; phase = 'need_origin'; }

export { distance, offStreet, summary };
