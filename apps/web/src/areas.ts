// The Areas tab's own rules, as plain functions and named numbers (Kyle, 2026-09-22).
//
// Kyle, verbatim: "The Neighborhood home should be a map view by default showing the full screen map zoomed
// into the polygon of the neighborhood that the user is in, with a list option up in the top right for mobile
// users and next to the map for laptop web users." Then, on what a tap does: "tapping on a neighborhood full
// screen should then animate-shrink the map to the top (with a back button top left) and have the bottom
// portion of the screen display all the neighborhood content." Then, on that strip: "I want the map to
// disappear as the user scrolls down and have it still there when they scroll up."
//
// Everything in this file is arithmetic about a VIEW. Nothing here reads a position, stores anything, or knows
// what the network is: the landing decision is handed three booleans the page has already worked out, and the
// collapsing strip is handed a scroll offset. It is a module of its own so the iPhone and Android apps can be
// held to the same three answers and the same four numbers.

/** What the Areas tab lands on. */
export type AreasLanding =
  | 'area'        // the person's own area is known: the map opens zoomed to its outline, highlighted and named
  | 'ask'         // nobody has said where they are: the location card (location → cross street → City Hall)
  | 'outside';    // a fix came back from outside the four cities: the plain message, and the map stays

/**
 * The landing, from what the device already knows. Three cases and no fourth — and "outside" covers both ways a
 * person can be outside: a fix that came back beyond the four cities, and a fix inside the bounding box that no
 * outline holds. Both get the same plain sentence, because both are the same fact: we have nothing to say about
 * that spot. Nothing is ever given to the nearest outline instead (hoodfind.ts says the same, at the point).
 */
export function areasLanding(o: { located: boolean; area: boolean; outside: boolean }): AreasLanding {
  if (o.outside) return 'outside';
  if (o.area) return 'area';
  return o.located ? 'outside' : 'ask';
}

// ---- the map that shrinks to a strip, and the strip that collapses as you read ----------------------------

/**
 * The four numbers a porter needs. They are here, named, rather than in the stylesheet, because the iPhone and
 * Android apps have no stylesheet to read them out of.
 *
 * - `AREAS_STRIP_VH` — 38 % of the viewport: what the full-screen map shrinks to when an area page opens under
 *   it. Enough to keep the tapped outline and its neighbours readable; small enough that the page below it
 *   starts with a heading and a first paragraph rather than with nothing.
 * - `AREAS_BAR_PX` — 48: the compact bar the strip collapses to as a person reads down. It is what holds the
 *   Back button and the area's name, so it can never be smaller than a 44 px target plus its padding.
 * - `AREAS_TURN_PX` — 8: how far a person has to scroll THE OTHER WAY before the strip changes its mind. Zero
 *   would make the strip flicker on the hand-wobble at the end of every flick.
 * - `AREAS_SHRINK_MS` — 240: how long the shrink takes, and how long the collapse takes. Zero under Reduce
 *   Motion, where the strip still collapses and still comes back — it just arrives rather than travels.
 */
export const AREAS_STRIP_VH = 38, AREAS_BAR_PX = 48, AREAS_TURN_PX = 8, AREAS_SHRINK_MS = 240;

/**
 * How long the page is left alone after the strip changes size.
 *
 * Collapsing the strip makes the document shorter, and a browser that was scrolled near the bottom moves the
 * scroll position up to fit — by exactly the height the strip gave up. That move looks like a person scrolling
 * UP, which opens the strip, which makes the page taller, which moves the scroll back down… The first live run
 * flickered between the two at about 60 times a second. So for one settling period after a change, a scroll is
 * taken as the page rearranging itself rather than as a person changing their mind. The one exception is the
 * top of the page, which always opens: that is never ambiguous.
 */
export const AREAS_SETTLE_MS = AREAS_SHRINK_MS + 80;
export const stripSettling = (changedAt: number, now: number): boolean => now - changedAt < AREAS_SETTLE_MS;

/** Open: the whole strip, with the map in it. Shut: the compact bar, with Back and the name. */
export type StripState = 'open' | 'shut';
/** What the collapsing strip remembers between scroll events: where the page is, and where the last change of
 *  direction happened. Two numbers and a word — no timers, no velocity, nothing that could drift. */
export interface StripScroll { state: StripState; y: number; pivot: number }
export const stripStart = (): StripScroll => ({ state: 'open', y: 0, pivot: 0 });

/**
 * The collapsing-toolbar state machine, as one pure step: where the page is now, in, and what the strip should
 * be, out.
 *
 * - At the top of the page the strip is always open. Nothing else is honest: a person who has scrolled all the
 *   way back has asked for the map.
 * - Reading DOWN more than `AREAS_TURN_PX` past the last turn shuts it, so the page gets the whole screen.
 * - Scrolling back UP does NOT open it: the map returns only at the top of the page (Kyle, 2026-09-23: "when
 *   the user starts scrolling back up the map should not begin appearing"). A person re-reading a panel keeps
 *   the whole screen; the bar with Back and the name stays the whole time.
 *
 * Note what this is NOT: a scroll-position animation. `animation-timeline: scroll()` can tie a size to how far
 * down a page is, and that is a genuinely cheap way to shrink a header — but it cannot express "and come back
 * when they turn round", because the timeline has no direction. So the driver is a passive scroll listener with
 * one rAF in it (main.ts), and this function is the whole of the thinking it does.
 */
export function stripAt(was: StripScroll, y: number): StripScroll {
  const top = Math.max(0, y);
  if (top <= 0) return { state: 'open', y: 0, pivot: 0 };
  if (top === was.y) return { ...was, y: top };
  const down = top > was.y;
  // Which way we were already going: the pivot sits behind us when we were heading down.
  const wasDown = was.pivot <= was.y;
  const pivot = down === wasDown ? was.pivot : was.y;      // a turn moves the pivot to where it happened
  if (Math.abs(top - pivot) < AREAS_TURN_PX) return { state: was.state, y: top, pivot };
  return { state: down ? 'shut' : was.state, y: top, pivot };
}
