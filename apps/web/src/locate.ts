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
 * The point is **Detroit City Hall** — the Coleman A. Young Municipal Center — which is already in the app as a
 * civic reference point, in code, for the service areas a DV row may carry (`SERVICE_AREAS.detroit` in
 * packages/query/src/areas.ts). It is reused rather than re-typed so there is one Detroit-centre number on all
 * three clients, and it is a *published address of a public building*: it says nothing about anybody.
 */
export const MAP_ANCHOR: { lat: number; lon: number } = SERVICE_AREAS.detroit!.point!;

/** Two and a half miles, in metres: the anchor view is a little wider than the you-are-here view, because the
 *  anchor is the city's front door and not where the person actually is. */
export const ANCHOR_RADIUS_M = 4023.36;

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
 * all; ten seconds is long enough for a cold network fix and short enough that the card does not hang.
 */
export const LOCATE_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 };

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
 * The one place the browser is asked for a position. Coarse, cached, and given up on after ten seconds; called
 * straight out of a click every time. Returns false when this browser has no geolocation at all, which is
 * answered the same way a refusal is: in words, with the ZIP entry beside them.
 */
export function requestPosition(geo: Geolocation | undefined, ok: PositionCallback, fail: () => void): boolean {
  if (!geo) { fail(); return false; }
  geo.getCurrentPosition(ok, fail, LOCATE_OPTIONS);
  return true;
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
export function locateCardClick(answer: 'yes' | 'no', deps: { ask(): void; remember(): void; close(): void }): void {
  if (answer === 'yes') { deps.ask(); deps.remember(); return; }
  deps.close();
  deps.remember();
}

export interface LocateCardStrings { title: string; body: string; yes: string; no: string }

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
    <p class="locardbtns"><button class="btn" type="button" data-locate="yes">${esc(s.yes)}</button><button class="chip" type="button" data-locate="no">${esc(s.no)}</button></p>
  </div>`;
}
