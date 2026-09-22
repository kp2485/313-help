// Which screen is open, as data rather than as a closure. No android.* class here, so :core runs the two rules that
// matter on a plain JVM: which screens are private, and what may be kept across an activity recreation.
//
// Why this exists (Android review, 2026-09-20). The back stack used to be `ArrayList<() -> View>`: a list of
// lambdas, each holding the activity that made it. Two things followed.
//
//  - Nothing could survive a recreation. The manifest declared only orientation|screenSize|keyboardHidden, so a
//    font-scale change, dark mode, a locale change or entering multi-window recreated the activity — and the person
//    was thrown back to Home from wherever they were, four taps into "I need a doctor". The activity now handles
//    those configurations itself *and*, if it is recreated anyway, puts the stack back from [Retained].
//  - Nothing could decide anything about a screen. Whether to set FLAG_SECURE, and whether to offer "Leave this
//    page fast", are properties of the screen, and a closure has no properties. [isPrivate] answers both, in one
//    place, from the route — so a screen added later inherits the rule instead of having to remember it.
//
// **Nothing here is ever written to disk.** Not to savedInstanceState either, which the system writes to disk on
// its own schedule: docs/08 says triage answers live in memory only and are cleared on exit, and which need
// somebody tapped is a triage answer. [Retained] is a field in this process; it dies with the process, and the
// activity clears it when it is really finishing. Private screens are not even kept there — see [keepable].
package org.help313.app

/** One screen. Everything a screen needs to be rebuilt is in here; nothing about a person is. */
sealed class Route {

    object Home : Route()
    object Help : Route()
    object Search : Route()
    object Saved : Route()
    object About : Route()
    object Urgent : Route()

    /** The Map tab: the city itself, edge to edge (docs/05 "Map tab", DECISIONS 2026-09-20). */
    object Map : Route()

    /** What to show on the map. A preference about a map, kept on this phone (MapLayerStore). */
    object MapLayers : Route()

    /** "See this map as a list": the text alternative the whole tab depends on. */
    object MapList : Route()

    /**
     * The Neighborhoods tab: the index of the City's 205 neighborhoods (docs/13, Kyle 2026-09-21 — "not just on
     * the web, in the apps too").
     */
    class Hoods(val lens: String? = null) : Route()

    /**
     * One neighborhood's numbers. The id is the City's own `nbh_` slug for a place on a public map, so it is not
     * private and the screen joins the retained stack like any other public one ([keepable]).
     */
    class Hood(val hoodId: String) : Route()

    /**
     * "Add a place that helps" (docs/04). Not private: what is typed here is about a place, never about the person
     * typing it, and a form half filled in is worth having back after a rotation.
     */
    object Add : Route()

    /** One stretch of the Joe Louis Greenway. */
    class Stretch(val segmentId: String) : Route()

    /**
     * "Parks and paths": the 302 City parks, the recreation centers, and the greenway as one row inside it
     * (DECISIONS 2026-09-22). It replaced the greenway's own tile on Home.
     */
    object Parks : Route()

    /** One park's page. The id is the City's own `plc_park_` slug for a public place, so it is not private. */
    class Park(val parkId: String) : Route()

    /** One need's screen: its numbers, and either its choices or its list. */
    class Need(val needId: String) : Route()

    /** One choice under a need ("Food today", "Detox", "Emergency room"). */
    class Refine(val needId: String, val refineId: String) : Route()

    /** A browse-by-type list from the Help screen. */
    class Category(val categoryId: String) : Route()

    /** One listing. The category rides along so that [isPrivate] can answer before the bundle has loaded. */
    class Detail(val rowId: String, val category: String) : Route()

    companion object {

        /**
         * True for a screen that must not appear in the recents thumbnail or a screenshot, and that offers "Leave
         * this page fast": domestic violence, mental-health crisis, treatment, and help after sexual assault.
         *
         * It is the same set as `isPrivate` in Needs.kt (docs/08, audit A8) and the same set the web app marks
         * `quickExit` in apps/web/src/needs.ts — one rule, three apps. A need's own flag is used where there is one,
         * because a need can be private before any category is known (the drugs screen is a list of choices).
         */
        fun isPrivate(route: Route): Boolean = when (route) {
            is Need -> needIsPrivate(route.needId)
            is Refine -> needIsPrivate(route.needId) ||
                needOf(route.needId)?.refine?.firstOrNull { it.id == route.refineId }?.query?.category
                    ?.let { isPrivate(it) } == true
            is Category -> CATEGORIES.firstOrNull { it.first == route.categoryId }?.second?.category
                ?.let { isPrivate(it) } == true
            is Detail -> isPrivate(route.category)
            else -> false
        }

        /**
         * True for the one screen that is drawn under the status bar. Every other screen is padded clear of the
         * system bars by MainActivity; the map runs behind them and pads its own floating controls instead, so the
         * city fills the phone and no control is ever under the clock (docs/05 "Map tab").
         */
        fun isFullBleedTop(route: Route): Boolean = route is Map

        private fun needOf(id: String): org.help313.app.Need? = NEEDS.firstOrNull { it.id == id }

        private fun needIsPrivate(id: String): Boolean {
            val need = needOf(id) ?: return false
            return need.sensitive || need.quickExit || need.query?.category?.let { isPrivate(it) } == true
        }

        /**
         * The part of a back stack that may be put back after a recreation: everything up to, but not including,
         * the first private screen.
         *
         * A recreation is not a navigation. If the system rebuilds the activity while a domestic-violence screen is
         * open — because the phone's language changed, or it went into multi-window, or the process was trimmed and
         * the task resumed — landing back on that screen is the app deciding to re-open it, and the person may not
         * be the one holding the phone by then. So it lands on the last ordinary screen instead, which is the safe
         * direction to be wrong in. Everything before the private screen is public: Home, the needs list, a food
         * list. (Handling the common configuration changes in the activity means this path is rare to begin with.)
         */
        fun keepable(stack: List<Route>): List<Route> {
            val at = stack.indexOfFirst { isPrivate(it) }
            val kept = if (at < 0) stack else stack.subList(0, at)
            return if (kept.isEmpty()) listOf(Home) else kept.toList()
        }
    }

    /**
     * The back stack, for the life of this process and no longer. Not a file, not savedInstanceState, not a
     * Bundle the system may persist: a field, cleared by MainActivity.onDestroy when the activity is finishing.
     */
    object Retained {
        @Volatile
        private var stack: List<Route>? = null

        fun put(routes: List<Route>) {
            stack = keepable(routes)
        }

        /** What to restore, or null. Reading it does not consume it; `clear` is explicit. */
        fun take(): List<Route>? = stack

        fun clear() {
            stack = null
        }
    }
}
