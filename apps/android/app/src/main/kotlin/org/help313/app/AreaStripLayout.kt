// The collapsing header an area page wears on the Areas tab (Kyle, 2026-09-22: "tapping on a neighborhood full
// screen should then animate-shrink the map to the top (with a back button top left) and have the bottom portion
// of the screen display all the neighborhood content"; then "I want the map to disappear as the user scrolls down
// and have it still there when they scroll up").
//
// **Platform APIs only.** This is a plain [ViewGroup] that coordinates an ordinary [ScrollView]'s scroll offset
// with the strip's drawn height. There is no CoordinatorLayout, no AppBarLayout and no ScrollingViewBehavior here,
// because this app carries no AndroidX at all (CLAUDE.md) — and the behaviour Kyle asked for is not one of
// CoordinatorLayout's anyway: "back the moment they turn round" is a direction, and a scroll-range behaviour has
// none. [stripAt] (AreasHome.kt) is the whole of the thinking; this class is the wiring.
//
// **Nothing here ever relayouts the page.** The scrolling view is measured and laid out once, with a top padding of
// the strip's FULL height and `clipToPadding = false`, so the page scrolls *under* the strip. Collapsing the strip
// moves the page with `translationY` and clips the strip's own drawing — a transform and a clip rectangle, neither
// of which changes `scrollY`, the scroll range, or where anything is laid out. That is what "no scroll jump on size
// change" means: there is nothing to jump, because nothing moved in layout.
package org.help313.app

import android.animation.ValueAnimator
import android.content.Context
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.ScrollView
import kotlin.math.max

/**
 * @param strip the map and the pinned bar, laid out at the strip's full height and clipped as it collapses.
 * @param page the area's own page, an ordinary [ScrollView].
 * @param onChanged told whenever the strip really changed state, so the screen can announce it.
 */
class AreaStripLayout(
    context: Context,
    private val strip: View,
    private val page: ScrollView,
    private val onChanged: (StripState) -> Unit = {},
) : ViewGroup(context) {

    private val barPx = UI.dp(context, AREAS_BAR_PX)

    /** The strip's whole height: [AREAS_STRIP_VH] % of the viewport, and never less than the pinned bar. */
    private var fullPx = barPx

    /** What is drawn now. It starts whole, because a page always opens with the map on it. */
    private var shownPx = -1

    private var scroll = stripStart()
    private var changedAt = 0L
    private var animator: ValueAnimator? = null

    init {
        // The page first, the strip second: later children are drawn on top, which is how the pinned bar stays
        // over the words sliding under it without either one being redrawn.
        page.clipToPadding = false
        addView(page)
        addView(strip)
        page.setOnScrollChangeListener { _, _, y, _, _ -> onPageScrolled(y) }
    }

    /** Where the page is, in dp — the units [stripAt]'s 8 dp turn is measured in. */
    private fun dpOf(px: Int): Int = (px / resources.displayMetrics.density).toInt()

    private fun animationsOn(): Boolean = try {
        android.provider.Settings.Global.getFloat(
            context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f,
        ) != 0f
    } catch (_: Throwable) {
        true
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        val h = MeasureSpec.getSize(heightSpec)
        fullPx = max(barPx, h * AREAS_STRIP_VH / 100)
        if (shownPx < 0) shownPx = fullPx
        shownPx = shownPx.coerceIn(barPx, fullPx)

        // The page is measured ONCE at this size and never again for a collapse: taller than the viewport by
        // exactly what the strip can give up, so that when the strip is shut the bottom of the page has arrived
        // on screen rather than run out.
        page.setPadding(0, fullPx, 0, 0)
        page.measure(
            MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(h + fullPx - barPx, MeasureSpec.EXACTLY),
        )
        strip.measure(
            MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(fullPx, MeasureSpec.EXACTLY),
        )
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        page.layout(0, 0, r - l, page.measuredHeight)
        apply()
    }

    /**
     * The one place the collapse is expressed: the strip is laid out shorter and the page is moved up by the
     * difference. Neither is a re-measure — the strip's children keep the sizes [onMeasure] gave them and are
     * clipped by their parent's new bounds, and the page is moved with a transform — so no view is measured
     * again, `scrollY` never changes, and there is no jump.
     *
     * The strip is **laid out** shorter rather than merely clipped, which was the first live run's bug: a clip is
     * about drawing only, so the collapsed strip went on taking every finger over the 38 % of the screen it was
     * no longer drawing, and a scroll UP there panned the hidden map instead of bringing the strip back
     * (emulator, 2026-09-22). A view's hit rectangle is its layout, so the layout is what has to shrink.
     */
    private fun apply() {
        val w = if (width > 0) width else strip.measuredWidth
        strip.layout(0, 0, w, shownPx)
        page.translationY = -(fullPx - shownPx).toFloat()
    }

    // ---- the driver ---------------------------------------------------------------------------------------

    private fun onPageScrolled(yPx: Int) {
        val y = dpOf(yPx)
        val at = SystemClock.uptimeMillis()
        // The page is still settling after the last change ([stripSettling]): a fling still being delivered when
        // the strip changed is not a person turning round. The top of the page is never ambiguous, so it answers
        // through a settling period like any other scroll.
        if (y > 0 && stripSettling(changedAt, at)) {
            scroll = scroll.copy(y = y, pivot = y)
            return
        }
        val next = stripAt(scroll, y)
        val was = scroll.state
        scroll = next
        if (next.state == was) return
        changedAt = at
        moveTo(if (next.state == StripState.SHUT) barPx else fullPx)
        onChanged(next.state)
    }

    /** 240 ms, or no journey at all when the phone's animator scale is zero — it still collapses, it arrives. */
    private fun moveTo(target: Int) {
        animator?.cancel()
        if (!animationsOn()) {
            shownPx = target
            apply()
            return
        }
        val from = shownPx
        if (from == target) return
        val a = ValueAnimator.ofInt(from, target)
        a.duration = AREAS_SHRINK_MS.toLong()
        a.addUpdateListener {
            shownPx = it.animatedValue as Int
            apply()
        }
        animator = a
        a.start()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        animator = null
    }

    /** For the tests and for a screen that wants to know: whether the map is whole or collapsed to its bar. */
    val state: StripState get() = scroll.state
}
