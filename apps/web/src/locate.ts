// The first time the Map tab is opened on this phone: our own card, and then — only if a person taps it — the
// browser's permission prompt (Kyle, 2026-09-21; DECISIONS 2026-09-21).
//
// Why a card of our own first. A cold permission prompt explains nothing, and the honest answer to "why does a
// map want my location?" is a sentence, not a browser chrome string a person cannot read: "Your location stays
// on this phone. We never send it or save it." Browsers also penalise sites that ask without a gesture — Chrome
// and Firefox will refuse the prompt outright, or hold it against the origin — so the card is not politeness, it
// is the only way the prompt is worth asking at all.
//
// What this file may remember: **one boolean**. That the card has been answered. Not the answer, not the
// permission, and never a position. A position lives in one variable in main.ts for as long as the tab is open
// and goes nowhere else: not to IndexedDB, not to the URL, not into the history, not into a report (docs/08).

import { SERVICE_AREAS, SERVICE_BBOX, inServiceArea } from '@313help/query';
import { idbGet, idbSet } from './data.js';

export { SERVICE_BBOX, inServiceArea };

/** Two miles, in metres. The shorter side of the map spans twice this: four miles across, the walk-and-bus city. */
export const LOCATE_RADIUS_M = 3218.688;

/**
 * Where a map of Detroit looks when nobody has said where they are (Kyle, 2026-09-22: "the initial map
 * presentation needs to be much more zoomed in"; DECISIONS 2026-09-22).
 *
 * The place is **Detroit City Hall** — the Coleman A. Young Municipal Center — which is already in the app as a
 * civic reference point, in code, for the service areas a DV row may carry (`SERVICE_AREAS.detroit` in
 * packages/query/src/areas.ts). It is a *published address of a public building*: it says nothing about anybody,
 * and it is still what the app says in words ("City Hall").
 */
export const CITY_HALL: { lat: number; lon: number } = SERVICE_AREAS.detroit!.point!;

/** How far north-west along Woodward the opening view is nudged, in miles, and the bearing of Woodward from
 *  downtown measured off the map (Campus Martius to New Center): 31.9° west of north. */
export const ANCHOR_NUDGE_MILES = 0.6, ANCHOR_BEARING_DEG = -31.9;

/**
 * The centre of the opening view: **0.6 mile up Woodward from City Hall**, which is Grand Circus Park.
 *
 * City Hall itself sits about a third of a mile from the river, so a two-mile box centred on it spends a third
 * of its height on Windsor and on the diagonal hatching that means "not our area" — a map whose lower half
 * answers nothing. Nudging the centre up Woodward puts the whole box on the city while keeping the same
 * landmark, and Woodward is the direction to nudge along because it is the street the box is being read from.
 *
 * The number is pinned here rather than computed at run time so the three clients cannot drift:
 * lat 42.3293 + 0.6·cos(31.9°)·1609.344/111320, lon −83.0452 − 0.6·sin(31.9°)·1609.344/(111320·cos 42.35°).
 */
export const MAP_ANCHOR: { lat: number; lon: number } = { lat: 42.3366, lon: -83.0514 };

/** Two miles, as everywhere else (Kyle, 2026-09-22: "always a 2-mile radius"). It used to be two and a half
 *  here, on the reasoning that the anchor is the city's front door rather than where the person is; Kyle's
 *  answer is that one radius people can learn is worth more than that distinction. */
export const ANCHOR_RADIUS_M = LOCATE_RADIUS_M;

/**
 * The opening view of the Map tab, as a point and a radius — the one decision behind "how far out does the map
 * open?", so that the first view and "centre on me" are the same arithmetic (`cameraForRadius`) with a different
 * centre. A location already known — allowed earlier this visit, or the centre of a ZIP a person typed — wins
 * and keeps today's two-mile view; with none, the map opens on the anchor instead of the whole four-city region.
 *
 * Pure, and the same three lines on all three clients (`openingView` in apps/ios/Sources/HelpCore/Locate.swift
 * and apps/android/.../Locate.kt). Nothing here is stored: it is arithmetic about a view.
 */
export function openingView(here?: { lat: number; lon: number } | null): { lat: number; lon: number; radiusMeters: number } {
  return here ? { lat: here.lat, lon: here.lon, radiusMeters: LOCATE_RADIUS_M } : { ...MAP_ANCHOR, radiusMeters: ANCHOR_RADIUS_M };
}

/**
 * Coarse is enough, and coarse is what we ask for: the list is sorted in bands of a mile, and the dot on the map
 * is a dot. `maximumAge` accepts a fix from the last five minutes, which on most phones means no new GPS fix at
 * all.
 *
 * **The ten-second timeout is gone** (Kyle, 2026-09-22). Two of the first people this app is for are a survivor
 * whose service has been cut off and a person without housing and without signal, and on a phone with no network
 * a cold GPS fix is a walk outside and a few minutes of sky — not ten seconds. Giving up at ten and saying "we
 * couldn't get your location" was the app telling the truth about its own patience and a lie about the phone's.
 * So the ask now runs for five minutes, and after ten seconds the screen says what is happening and what would
 * help, with the cross-street and ZIP ways in beside it the whole time.
 */
export const LOCATE_SLOW_MS = 10000;
export const LOCATE_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 300000, timeout: 300000 };

/** The one thing kept: whether the first-open card has been answered on this phone. */
const FLAG = 'locate_asked';
export async function locateAnswered(): Promise<boolean> {
  return (await idbGet<unknown>(FLAG)) === true;
}
/** Returns false when it could not be written down; the card still closes, and comes back next time. */
export async function rememberLocateAnswered(): Promise<boolean> {
  try { await idbSet(FLAG, true); return true; } catch { return false; }
}

export type LocatePermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** What the browser already knows, without asking anybody anything. Safari has no Permissions API for this. */
export async function locatePermission(nav: Partial<Navigator> = typeof navigator === 'undefined' ? {} : navigator): Promise<LocatePermission> {
  if (!nav.geolocation) return 'denied';
  try {
    const st = await nav.permissions?.query({ name: 'geolocation' as PermissionName });
    if (st?.state === 'granted' || st?.state === 'denied' || st?.state === 'prompt') return st.state;
  } catch { /* not supported, or not allowed to ask: treat it as unknown */ }
  return 'unknown';
}

export type FirstOpenAction = 'showCard' | 'centreOnPerson' | 'centreOnZip' | 'none';

/**
 * What the Map tab does when it opens. The same four answers, in the same order, on all three clients
 * (`firstOpenAction` in apps/ios/Sources/HelpCore/Locate.swift and apps/android/.../Locate.kt), held to the same
 * table of cases.
 *
 * - A ZIP a person typed wins over everything: they already said where to look, and a typed ZIP is not where
 *   they are, so we never ask for a location on top of it.
 * - Permission already given (say, "Use my location" on Home) means the card has nothing to explain: go there.
 * - Permission already refused means the prompt would not appear, so the card would be a dead end.
 * - Otherwise: the card, once, and never again once it has been answered.
 */
export function firstOpenAction(flagAnswered: boolean, permission: LocatePermission, hasNearFromZip: boolean): FirstOpenAction {
  if (hasNearFromZip) return 'centreOnZip';
  if (permission === 'granted') return 'centreOnPerson';
  if (permission === 'denied') return 'none';
  if (flagAnswered) return 'none';
  return 'showCard';
}

/**
 * The one place the browser is asked for a position. Coarse, cached, and called straight out of a click every
 * time. Returns a way to **cancel** — the ask can now run for minutes, so "I've changed my mind" has to be a
 * real button and not a wait. `slow` is called once, after ten seconds, if nothing has come back yet.
 *
 * Cancelling does not stop the browser's own request (there is no API for that); it stops us listening, which is
 * the whole of what cancelling means here. Either callback after a cancel is dropped on the floor, so a fix that
 * lands after the person has typed a cross street never moves the map out from under them.
 */
export interface LocateAsk { cancel(): void }
export function requestPosition(geo: Geolocation | undefined, ok: PositionCallback, fail: () => void, slow?: () => void): LocateAsk {
  if (!geo) { fail(); return { cancel() { /* nothing was asked */ } }; }
  let live = true;
  const timer = slow ? setTimeout(() => { if (live) slow(); }, LOCATE_SLOW_MS) : undefined;
  const done = () => { live = false; clearTimeout(timer); };
  geo.getCurrentPosition((p) => { if (!live) return; done(); ok(p); }, () => { if (!live) return; done(); fail(); }, LOCATE_OPTIONS);
  return { cancel: done };
}

/**
 * What a fix means: a point in the four cities, or a point that is not. Nothing in between, and no third answer
 * for "close enough" — the edge of Dearborn is the edge of what this app knows anything about.
 */
export const positionOutcome = (lat: number, lon: number): 'inside' | 'outside' =>
  (inServiceArea(lat, lon) ? 'inside' : 'outside');

/**
 * What either button on the card does. `ask` runs FIRST and synchronously on "Use my location", because the
 * click is the gesture the browser wants to see behind the prompt; remembering that the card was answered is a
 * write to IndexedDB, and awaiting that first would throw the gesture away.
 */
export function locateCardClick(answer: 'yes' | 'no' | 'cross', deps: { ask(): void; remember(): void; close(): void; cross?(): void }): void {
  if (answer === 'yes') { deps.ask(); deps.remember(); return; }
  // "Type a cross street" is an answer to the card too: the card closes, the field opens, and the card is not
  // shown again — a person who said where they are has said where they are.
  if (answer === 'cross') { deps.close(); deps.cross?.(); deps.remember(); return; }
  deps.close();
  deps.remember();
}

export interface LocateCardStrings { title: string; body: string; yes: string; no: string; cross: string }

/**
 * Our card, over the map and never across all of it: the map keeps drawing, panning and answering behind it, and
 * Urgent help stays where it was. `aria-modal="false"` on purpose — this takes nothing away, so nothing behind it
 * is made inert and nothing is trapped. The cursor is moved to the heading when it opens and handed back to the
 * "Use my location" button when it closes (WCAG 2.4.3).
 */
export function locateCardHtml(s: LocateCardStrings, esc: (v: string) => string): string {
  return `<div class="locard" role="dialog" aria-modal="false" aria-labelledby="locardh" aria-describedby="locardb">
    <h2 id="locardh" tabindex="-1">${esc(s.title)}</h2>
    <p id="locardb">${esc(s.body)}</p>
    <p class="locardbtns"><button class="btn" type="button" data-locate="yes">${esc(s.yes)}</button><button class="chip" type="button" data-locate="cross">${esc(s.cross)}</button><button class="chip" type="button" data-locate="no">${esc(s.no)}</button></p>
  </div>`;
}
