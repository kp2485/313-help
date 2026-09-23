// The Areas tab's own rules, as plain functions and named numbers — the Kotlin half of apps/web/src/areas.ts
// (Kyle, 2026-09-22; DECISIONS 2026-09-22).
//
// Kyle, verbatim: "The Neighborhood home should be a map view by default showing the full screen map zoomed
// into the polygon of the neighborhood that the user is in, with a list option up in the top right for mobile
// users and next to the map for laptop web users." Then, on what a tap does: "tapping on a neighborhood full
// screen should then animate-shrink the map to the top (with a back button top left) and have the bottom
// portion of the screen display all the neighborhood content." Then, on that strip: "I want the map to
// disappear as the user scrolls down and have it still there when they scroll up."
//
// Everything in this file is arithmetic about a VIEW. Nothing here reads a position, stores anything, or knows
// what the network is: the landing decision is handed three booleans the screen has already worked out, and the
// collapsing strip is handed a scroll offset. No `android.` import, so `:core` compiles it and
// `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs every case on a plain JDK, against the web's own table.
package org.help313.app

import kotlin.math.abs
import kotlin.math.max

/** What the Areas tab lands on. The three cases of `AreasLanding` in apps/web/src/areas.ts, and no fourth. */
enum class AreasLanding {
    /** The person's own area is known: the map opens zoomed to its outline, highlighted and named. */
    AREA,

    /** Nobody has said where they are: the location card, over the anchor view. */
    ASK,

    /** A fix came back from outside the four cities, or from a spot no outline holds: the plain message. */
    OUTSIDE,
}

/**
 * The landing, from what the device already knows. Three cases and no fourth — and "outside" covers both ways a
 * person can be outside: a fix that came back beyond the four cities, and a fix inside the bounding box that no
 * outline holds. Both get the same plain sentence, because both are the same fact: we have nothing to say about
 * that spot. Nothing is ever given to the nearest outline instead ([areaAt] says the same, at the point).
 */
fun areasLanding(located: Boolean, area: Boolean, outside: Boolean): AreasLanding {
    if (outside) return AreasLanding.OUTSIDE
    if (area) return AreasLanding.AREA
    return if (located) AreasLanding.OUTSIDE else AreasLanding.ASK
}

// ---- the map that shrinks to a strip, and the strip that collapses as you read ------------------------------

/**
 * The four numbers a porter needs, the same four as `AREAS_STRIP_VH`, `AREAS_BAR_PX`, `AREAS_TURN_PX` and
 * `AREAS_SHRINK_MS` in apps/web/src/areas.ts. They are here, named, rather than in a dimens resource, because
 * ParityTest has to be able to hold them to the web's.
 *
 * - [AREAS_STRIP_VH] — 38 % of the viewport: what the full-screen map shrinks to when an area page opens under
 *   it. Enough to keep the tapped outline and its neighbours readable; small enough that the page below it
 *   starts with a heading and a first paragraph rather than with nothing.
 * - [AREAS_BAR_PX] — 48 dp: the compact bar the strip collapses to as a person reads down. It is what holds the
 *   Back button and the area's name, so it can never be smaller than a 48 dp target.
 * - [AREAS_TURN_PX] — 8 dp: how far a person has to scroll THE OTHER WAY before the strip changes its mind.
 *   Zero would make the strip flicker on the hand-wobble at the end of every flick.
 * - [AREAS_SHRINK_MS] — 240: how long the shrink takes, and how long the collapse takes. **Zero when the
 *   phone's animator scale is zero**, where the strip still collapses and still comes back — it just arrives
 *   rather than travels (the Android half of the web's Reduce Motion rule).
 */
const val AREAS_STRIP_VH = 38
const val AREAS_BAR_PX = 48
const val AREAS_TURN_PX = 8
const val AREAS_SHRINK_MS = 240

/**
 * How long the page is left alone after the strip changes size.
 *
 * On the web, collapsing the strip makes the document shorter and the browser corrects the scroll position,
 * which reads as a person scrolling UP and flickers the strip. This app never relayouts the scrolling content
 * when the strip changes size — the page keeps a fixed top inset and the strip is drawn over it — so the
 * correction cannot happen here. The settling period is kept all the same: a fling that is still being
 * delivered when the strip changes is the same ambiguity by another road, and three clients that answer a
 * scroll differently are three clients that have drifted. The one exception is the top of the page, which
 * always opens: that is never ambiguous.
 */
const val AREAS_SETTLE_MS = AREAS_SHRINK_MS + 80

fun stripSettling(changedAt: Long, now: Long): Boolean = now - changedAt < AREAS_SETTLE_MS

/** Open: the whole strip, with the map in it. Shut: the compact bar, with Back and the name. */
enum class StripState { OPEN, SHUT }

/**
 * What the collapsing strip remembers between scroll events: where the page is, and where the last change of
 * direction happened. Two numbers and a word — no timers, no velocity, nothing that could drift.
 */
data class StripScroll(val state: StripState, val y: Int, val pivot: Int)

fun stripStart(): StripScroll = StripScroll(StripState.OPEN, 0, 0)

/**
 * The collapsing-toolbar state machine, as one pure step: where the page is now, in, and what the strip should
 * be, out. The port of `stripAt` in apps/web/src/areas.ts, case for case.
 *
 * - At the top of the page the strip is always open. Nothing else is honest: a person who has scrolled all the
 *   way back has asked for the map.
 * - Reading DOWN more than [AREAS_TURN_PX] past the last turn shuts it, so the page gets the whole screen.
 * - Scrolling back UP does NOT open it: the map returns only at the top of the page (Kyle, 2026-09-23). The
 *   bar with Back and the name stays the whole time.
 *
 * [y] is in **dp**, not pixels: the turn threshold is a distance a thumb travels, and a pixel is a different
 * distance on every phone. The caller divides by the display density before it gets here.
 */
fun stripAt(was: StripScroll, y: Int): StripScroll {
    val top = max(0, y)
    if (top <= 0) return StripScroll(StripState.OPEN, 0, 0)
    if (top == was.y) return was.copy(y = top)
    val down = top > was.y
    // Which way we were already going: the pivot sits behind us when we were heading down.
    val wasDown = was.pivot <= was.y
    val pivot = if (down == wasDown) was.pivot else was.y     // a turn moves the pivot to where it happened
    if (abs(top - pivot) < AREAS_TURN_PX) return StripScroll(was.state, top, pivot)
    return StripScroll(if (down) StripState.SHUT else was.state, top, pivot)
}
