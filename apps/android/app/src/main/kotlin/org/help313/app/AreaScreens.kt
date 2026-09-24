// The Areas tab as a **map**, and the whole-city pages a tap on it opens (Kyle, 2026-09-22: "The most intuitive
// way for people to reach their neighborhood is through a map … offer the initial neighborhood selection on a map
// layer." Audit §3; DECISIONS 2026-09-22).
//
// The tab used to land on a wall of 205 alphabetical names in which nobody could find their own area without
// either granting a location or already knowing the City's name for where they live ("Pride Area Community",
// "Evergreen Lahser 7/8"). It now lands on the outlines, with the person's own area already picked out when we
// know where they are, and the index is the same screen's second view behind one control.
//
// Two rules, both from docs/13 and both kept by construction rather than by remembering:
//   * **No choropleth, ever.** [AreaOutlineView] is handed outlines and names and nothing else — it could not
//     colour an area by a number if it were asked to.
//   * **No league table.** The index's three orders are A to Z, by council district, and nearest first, and a
//     distance to the middle of an outline says how far away a place is, never how good it is.
package org.help313.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.text.Editable
import android.text.TextWatcher
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.help313.query.LatLon

/**
 * Outlines, names, and one selected area — and nothing else. No dots, no transit, no greenway, no fill that
 * carries a value: the only fill is a wash of the brand colour on the one outline that was tapped.
 *
 * It replaces the still `HoodOutlineView` for the cases that need a tap; that view is still right for the single
 * outline at the top of a page, and this one draws that case too ([AreaOutlineView] with one area and no handler).
 *
 * **TalkBack** is given one virtual node per outline, because a custom View is otherwise one opaque picture. The
 * nodes are read in the order the pick order's tail runs — areas after the greenway and before the dots, and
 * cities before the neighborhoods inside them — so what a screen reader walks and what a finger finds agree.
 */
class AreaOutlineView(
    context: Context,
    private val areas: List<DrawnArea>,
    private val selectedId: String? = null,
    /**
     * Where this map OPENS: the rings of one outline, framed with [MapCamera.AREA_FIT_MARGIN] of room and never
     * closer than [MapCamera.AREA_MIN_MPP] ([MapCamera.forArea] — the same camera as the web's `cameraForArea`).
     * Null opens on all the outlines it was handed, which is the whole service area.
     */
    private val openRings: List<List<LatLon>>? = null,
    /**
     * Where this map opens when there is no outline to frame: a point and a radius in metres — the app's one
     * opening view ([openingView], Locate.kt), which is a location already known or the civic anchor. Without it
     * the map opens on everything it was handed, which is the whole service area at arm's length.
     */
    private val openAt: Pair<LatLon, Double>? = null,
    /** True for the tab's own landing and for the strip: fill the box given rather than take a fixed shape. */
    private val fillsBox: Boolean = false,
    private val onPick: ((DrawnArea) -> Unit)? = null,
) : View(context) {

    /** The single-outline case the old still view covered: one ring list, no tap, no name. */
    constructor(context: Context, rings: List<List<LatLon>>) :
        this(context, listOf(DrawnArea("one", "", true, rings)), "one", null, null, false, null)

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        style = Paint.Style.STROKE
    }

    private var camera: org.help313.app.MapCamera? = null

    /** Which outline is picked out: the one a keyboard has walked to, else the one the screen chose. */
    private val shownId: String? get() = walked ?: selectedId

    init {
        isClickable = onPick != null
        isFocusable = onPick != null
        setBackgroundColor(UI.color(context, R.color.map_land))
        if (onPick != null) contentDescription = L.t("map.label_areas")
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        if (fillsBox) {
            // The tab's landing and the strip: whatever room the parent gave, filled. A map that is the screen.
            setMeasuredDimension(w, MeasureSpec.getSize(heightSpec))
            return
        }
        // A fixed shape, not a fixed height in text: the picture carries no words that have to grow. The words
        // under it do, and at 200 % text the search box below is still on the first screen.
        setMeasuredDimension(w, (w * if (onPick == null) 0.58f else 0.92f).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // A new box is a new opening view, not the old camera stretched: the outline is framed again.
        camera = null
    }

    private fun cameraFor(): org.help313.app.MapCamera? {
        val density = resources.displayMetrics.density.toDouble()
        if (width == 0 || height == 0) return null
        val w = width / density
        val h = height / density
        // Zoomed into the polygon, when there is one to zoom into (Kyle, 2026-09-22). Handed no rings — or rings
        // the bundle does not carry — it falls back to all the outlines it was given, and never to a guess.
        openRings?.let { rings -> org.help313.app.MapCamera.forArea(rings, w, h)?.let { return it } }
        // No polygon to frame: the app's one opening view — a location already known, or the civic anchor.
        openAt?.let { (at, radius) -> return org.help313.app.MapCamera.forRadius(at, radius, w, h) }
        val points = areas.flatMap { it.rings.flatten() }
        if (points.isEmpty()) return null
        return org.help313.app.MapCamera.fitting(points, w, h, minMeters = 900.0)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density
        val cam = camera ?: cameraFor() ?: return
        camera = cam
        // The Areas tab's own weights (docs/MAP-STYLE.md 15.7): here the outlines are the subject, so they are
        // solid and heavier than the Map tab's dashed lattice.
        val style = areasMapBoundaryStyle(cam.metersPerPoint)
        for (area in areas) {
            val path = Path()
            path.fillType = Path.FillType.EVEN_ODD
            for (ring in area.rings) {
                if (ring.size < 2) continue
                for ((i, p) in ring.withIndex()) {
                    val x = (cam.screenX(MapProjection.pointX(p)) * density).toFloat()
                    val y = (cam.screenY(MapProjection.pointY(p)) * density).toFloat()
                    if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                path.close()
            }
            // The one selected outline gets a light wash of the brand colour. It carries NO number: it says
            // "this is the one you tapped" and nothing else (docs/13, rule 1 — no choropleth, ever).
            val picked = area.id == shownId
            if (picked) {
                fill.color = UI.color(context, R.color.brand_soft)
                canvas.drawPath(path, fill)
            }
            // [areasMapBoundaryStyle] (docs/MAP-STYLE.md 15.7): the same colour token as the Map tab, solid, and
            // the only difference between a city and a neighbourhood is weight.
            stroke.color = if (picked) UI.color(context, R.color.brand) else UI.color(context, R.color.map_bnd)
            stroke.strokeWidth =
                (if (picked) BOUNDARY_SELECTED_WIDTH else if (area.isCity) style.cityWidth else style.width).toFloat() * density
            stroke.pathEffect =
                if (picked || style.dash.isEmpty()) null
                else android.graphics.DashPathEffect(style.dash.map { (it * density).toFloat() }.toFloatArray(), 0f)
            canvas.drawPath(path, stroke)
        }
        stroke.pathEffect = null
        // Names last, over every outline, so one is never drawn under the next area's edge. The band decides
        // whether there are any, and the one that was tapped is always named — the card under the map names it
        // anyway, and a person who has just chosen a shape should see which one they chose.
        if (onPick == null || !style.names) return
        label.textSize = 13f * density
        halo.textSize = 13f * density
        halo.strokeWidth = 3.5f * density
        halo.color = UI.color(context, R.color.map_land)
        label.color = UI.color(context, R.color.map_bnd)
        // Nearest the middle of the screen first, capped, exactly as the Map tab's pass is.
        val middleX = width / 2f
        val middleY = height / 2f
        val wanted = areas
            .filter { it.name.isNotEmpty() }
            .mapNotNull { a -> centreOf(a, cam, density)?.let { Triple(a, it.first, it.second) } }
            .sortedBy { kotlin.math.hypot(it.second - middleX, it.third - middleY) }
            .take(style.nameCap)
        // A name that does not fit is dropped, never shrunk and never drawn over another one — the same rule the
        // Map tab's own pass follows. Without it the first live run drew "Brus[h Park]" through "Douglass" and
        // "Downtown" through "Greektown" (emulator, 2026-09-22).
        val placed = ArrayList<android.graphics.RectF>()
        for ((area, x, y) in wanted) {
            if (x < 0 || y < 0 || x > width || y > height) continue
            val half = label.measureText(area.name) / 2 + 4 * density
            val box = android.graphics.RectF(x - half, y - 9f * density, x + half, y + 9f * density)
            if (placed.any { android.graphics.RectF.intersects(it, box) }) continue
            placed.add(box)
            canvas.drawText(area.name, x, y, halo)
            canvas.drawText(area.name, x, y, label)
        }
    }

    private fun centreOf(area: DrawnArea, cam: org.help313.app.MapCamera, density: Float): Pair<Float, Float>? {
        val ring = area.rings.maxByOrNull { it.size } ?: return null
        if (ring.isEmpty()) return null
        val lat = ring.sumOf { it.lat } / ring.size
        val lon = ring.sumOf { it.lon } / ring.size
        return (cam.screenX(MapProjection.x(lon)) * density).toFloat() to (cam.screenY(MapProjection.y(lat)) * density).toFloat()
    }

    // ---- fingers ------------------------------------------------------------------------------------------

    /**
     * Drag to look around, pinch to zoom, tap to open. The same three gestures the Map tab has, over the same
     * camera arithmetic ([MapCamera.panned], [MapCamera.zoomed]) — a landing that opened zoomed into one polygon
     * and could not be moved would be a picture of a neighborhood rather than a map of the city.
     */
    private val gestures = android.view.GestureDetector(
        context,
        object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean = true

            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
                val cam = camera ?: return false
                val density = resources.displayMetrics.density.toDouble()
                camera = cam.panned(-dx / density, -dy / density)
                invalidate()
                return true
            }

            override fun onSingleTapUp(e: MotionEvent): Boolean {
                performClick()
                val pick = onPick ?: return false
                val cam = camera ?: return false
                val density = resources.displayMetrics.density
                val lat = MapProjection.lat(cam.mapY((e.y / density).toDouble()))
                val lon = MapProjection.lon(cam.mapX((e.x / density).toDouble()))
                // The smallest outline holding the tap wins, so a neighborhood beats the city it sits inside.
                areaHit(areas, lat, lon)?.let { pick(it) }
                return true
            }
        },
    )

    private val pinch = android.view.ScaleGestureDetector(
        context,
        object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {
                val cam = camera ?: return false
                val density = resources.displayMetrics.density.toDouble()
                camera = cam.zoomed(detector.scaleFactor.toDouble(), detector.focusX / density, detector.focusY / density)
                invalidate()
                return true
            }
        },
    )

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (onPick == null) return false
        // A map inside a scrolling page keeps the gesture it was given: without this a drag across the strip is
        // taken by the page under it and the map never moves.
        if (event.actionMasked == MotionEvent.ACTION_DOWN) parent?.requestDisallowInterceptTouchEvent(true)
        pinch.onTouchEvent(event)
        if (!pinch.isInProgress) gestures.onTouchEvent(event)
        if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
            parent?.requestDisallowInterceptTouchEvent(false)
        }
        return true
    }

    override fun performClick(): Boolean = super.performClick()

    // ---- a hardware keyboard ---------------------------------------------------------------------------------

    /** Which outline N and P have walked to, if any. A view state, never written anywhere. */
    private var walked: String? = null

    /**
     * **N and P walk the outlines, Enter opens one** — the same two keys the Map tab's own features answer to
     * (MapView.onKeyDown), and they keep working inside the strip, which is where a keyboard user swaps pages.
     * The walk is the same order a screen reader is given: the cities, then the neighborhoods, A to Z in each.
     */
    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent): Boolean {
        if (onPick == null || order.isEmpty()) return super.onKeyDown(keyCode, event)
        val step = when (keyCode) {
            android.view.KeyEvent.KEYCODE_N -> 1
            android.view.KeyEvent.KEYCODE_P -> -1
            android.view.KeyEvent.KEYCODE_ENTER, android.view.KeyEvent.KEYCODE_DPAD_CENTER -> {
                val at = order.firstOrNull { it.id == (walked ?: selectedId) } ?: return super.onKeyDown(keyCode, event)
                onPick.invoke(at)
                return true
            }
            else -> return super.onKeyDown(keyCode, event)
        }
        val at = order.indexOfFirst { it.id == (walked ?: selectedId) }
        val next = order[if (at < 0) (if (step > 0) 0 else order.size - 1) else (at + step + order.size) % order.size]
        walked = next.id
        invalidate()
        announceForAccessibility(next.name)
        return true
    }

    /**
     * Put a screen reader's cursor back on one outline's own node — what Back from an area page does, so the
     * person who opened a polygon is returned to it rather than to the top of the screen.
     */
    fun focusOutline(id: String) {
        val at = order.indexOfFirst { it.id == id }
        if (at < 0) return
        // **Only when something is listening.** `requestSendAccessibilityEvent` walks up to the ViewRootImpl and
        // throws `IllegalStateException: Accessibility off` when no service is running — so on every phone with
        // TalkBack switched off, which is nearly all of them, pressing Back crashed the app (emulator,
        // 2026-09-22). An announcement nobody is listening to is not worth a crash, or an event.
        val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE)
            as? android.view.accessibility.AccessibilityManager
        if (manager?.isEnabled != true) return
        @Suppress("DEPRECATION")
        val ev = AccessibilityEvent.obtain(AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED)
        ev.packageName = context.packageName
        ev.className = android.widget.Button::class.java.name
        ev.setSource(this, at)
        parent?.requestSendAccessibilityEvent(this, ev)
    }

    // ---- what a screen reader walks ---------------------------------------------------------------------------

    override fun getAccessibilityNodeProvider(): android.view.accessibility.AccessibilityNodeProvider? {
        if (onPick == null) return null
        return nodes
    }

    /** One virtual node per outline: cities first, then the neighborhoods inside them, A to Z within each. */
    private val order: List<DrawnArea> by lazy {
        areas.sortedWith(compareBy({ if (it.isCity) 0 else 1 }, { it.name }))
    }

    private val nodes = object : android.view.accessibility.AccessibilityNodeProvider() {

        override fun createAccessibilityNodeInfo(virtualViewId: Int): AccessibilityNodeInfo? {
            if (virtualViewId == HOST_ID) {
                val host = AccessibilityNodeInfo.obtain(this@AreaOutlineView)
                onInitializeAccessibilityNodeInfo(host)
                for (i in order.indices) host.addChild(this@AreaOutlineView, i)
                return host
            }
            val area = order.getOrNull(virtualViewId) ?: return null
            val node = AccessibilityNodeInfo.obtain(this@AreaOutlineView, virtualViewId)
            node.packageName = context.packageName
            node.className = android.widget.Button::class.java.name
            node.contentDescription = area.name
            node.isEnabled = true
            node.isFocusable = true
            node.isClickable = true
            node.isVisibleToUser = true
            node.isSelected = area.id == shownId
            node.addAction(AccessibilityNodeInfo.ACTION_CLICK)
            node.setParent(this@AreaOutlineView)
            // Without this the node has no source and the framework drops it, so the whole map stays one opaque
            // picture to a screen reader however good the list below it is (the same line as MapView.Nodes).
            node.setSource(this@AreaOutlineView, virtualViewId)
            val cam = camera
            val density = resources.displayMetrics.density
            val rect = Rect(0, 0, width, height)
            if (cam != null) {
                centreOf(area, cam, density)?.let { (x, y) ->
                    val pad = (24 * density).toInt()
                    rect.set((x - pad).toInt(), (y - pad).toInt(), (x + pad).toInt(), (y + pad).toInt())
                }
            }
            node.setBoundsInParent(rect)
            val onScreen = IntArray(2)
            getLocationOnScreen(onScreen)
            node.setBoundsInScreen(Rect(rect.left + onScreen[0], rect.top + onScreen[1], rect.right + onScreen[0], rect.bottom + onScreen[1]))
            return node
        }

        override fun findFocus(focus: Int): AccessibilityNodeInfo? = createAccessibilityNodeInfo(HOST_ID)

        override fun performAction(virtualViewId: Int, action: Int, arguments: android.os.Bundle?): Boolean {
            val area = order.getOrNull(virtualViewId) ?: return false
            if (action != AccessibilityNodeInfo.ACTION_CLICK) return false
            onPick?.invoke(area)
            return true
        }
    }

    private companion object {
        const val HOST_ID = View.NO_ID
    }
}

// ---------------------------------------------------------------------------------------------------------------

object AreaScreens {

    /**
     * Which of the tab's two faces is showing. **The map is the default every time the tab opens** (Kyle,
     * 2026-09-22): this is a field on an object that lives as long as the process, it is never written to a file
     * and never put in a Route, and [reset] puts it back. The choice is about a screen, and it dies with the
     * launch.
     */
    private var asList = false

    /** Which outline is picked out. Never written down: it is worked out again from a fix that never leaves. */
    private var picked: String? = null

    /** The area whose page is open UNDER THE STRIP, in place, on this same tab. Null is the landing map. */
    private var openId: String? = null

    /** Set for exactly one draw: announce the page that just opened and put the cursor on its heading. */
    private var announceOpen = false

    /** Set for exactly one draw: announce which face the switch just moved to. */
    private var announceSwitch = false

    /** Set for exactly one draw after Back: the outline a screen reader's cursor is returned to. */
    private var focusBackTo: String? = null

    fun reset() {
        asList = false
        picked = null
        openId = null
        announceOpen = false
        announceSwitch = false
        focusBackTo = null
    }

    /**
     * **System Back closes the area page and leaves the map whole again**, which is exactly what the Back button
     * in the strip does — one control, one meaning (Kyle, 2026-09-22). True when there was something to close.
     *
     * Called from MainActivity.onBackPressed before the route stack is touched, because the page is not a pushed
     * screen: it is this tab wearing a strip.
     */
    fun onBack(): Boolean {
        val was = openId ?: return false
        // The highlight stays: a person who comes back from an area's page is returned to that area's outline.
        picked = was
        openId = null
        announceOpen = false
        focusBackTo = was
        return true
    }

    private fun heading(v: View) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) v.isAccessibilityHeading = true
    }

    /** No motion at all when the phone's animator scale is zero — the same question MapView asks. */
    private fun animationsOn(a: MainActivity): Boolean = try {
        android.provider.Settings.Global.getFloat(
            a.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f,
        ) != 0f
    } catch (_: Throwable) {
        true
    }

    // ---- the tab ------------------------------------------------------------------------------------------------

    /**
     * **The Areas tab IS a map** (Kyle, 2026-09-22; DECISIONS 2026-09-22). It lands full screen on the polygon the
     * person is standing in, the list is one control away, and opening an area shrinks the map to a strip with the
     * page scrolling under it.
     *
     * The map fills the tab under the app bar and above the tab bar — Urgent help, Search and the four tabs all
     * stay where they are, and nothing is made inert. It is deliberately not the Map tab's edge-to-edge treatment:
     * a tab that takes the app bar away is not a tab.
     */
    fun tab(a: MainActivity, lens: String?): View {
        HoodRepo.onChange = { a.render() }
        HoodRepo.want(a.store)
        val d = HoodRepo.data
        // The greenway lens keeps its own screen and is never the landing (audit §6); with no numbers yet there is
        // no outline to draw, so the index says so in words.
        if (d == null || lens != null) return HoodScreens.index(a, lens)
        openId?.let { id ->
            areaById(d, id)?.let { return areaPageInPlace(a, d, it) }
            // An id this bundle no longer carries: back to the map rather than half a page.
            openId = null
        }
        if (asList) return listFace(a)
        return mapFace(a, d)
    }

    /**
     * **The Map | List switch**: two real buttons, 48 dp, each saying whether it is the one showing rather than
     * handing a screen reader a word whose meaning changes underneath it.
     *
     * It is laid out with `gravity = END`, so it sits in the top-right corner of an English screen and mirrors to
     * the top-left of an Arabic one — the corner a right-to-left reader starts from, which is what Kyle's "top
     * right" means there. The web does the same thing with `inset-inline-end`.
     */
    private fun switchRow(a: MainActivity, onMap: Boolean): View {
        val row = LinearLayout(a)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = android.view.Gravity.END
        row.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        for ((wantList, key) in listOf(false to "hood.switch_map", true to "hood.switch_list")) {
            val on = onMap != wantList
            val b = UI.button(
                a, L.t(key),
                // Which one is showing is in the words a screen reader reads, not only in the colour of a pill.
                description = joinParts(listOf(L.t("hood.switch_label"), L.t(key))),
                backgroundId = if (on) R.drawable.pill_brand else R.drawable.pill_soft,
                textColorId = if (on) R.color.brand_ink else R.color.brand_soft_ink,
                topDp = 0,
            ) {
                if (asList == wantList) return@button
                asList = wantList
                announceSwitch = true
                a.render()
            }
            b.isSelected = on
            b.minWidth = UI.dp(a, AREAS_BAR_PX)
            b.minHeight = UI.dp(a, AREAS_BAR_PX)
            b.minimumHeight = UI.dp(a, AREAS_BAR_PX)
            b.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15f)
            val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            p.marginStart = UI.dp(a, 6)
            b.layoutParams = p
            row.addView(b)
        }
        // Said out loud on the switch, because the whole screen changes under a person who cannot see it change.
        if (announceSwitch) {
            announceSwitch = false
            row.post { row.announceForAccessibility(L.t(if (asList) "hood.say_list" else "hood.say_map")) }
        }
        return row
    }

    /** The list face: the index that has always been here, with the switch above it in the same corner. */
    private fun listFace(a: MainActivity): View {
        val wrap = UI.column(a)
        val head = UI.column(a)
        head.setPaddingRelative(UI.dp(a, 12), UI.dp(a, 8), UI.dp(a, 12), UI.dp(a, 4))
        head.addView(switchRow(a, onMap = false))
        wrap.addView(head)
        val index = HoodScreens.index(a, null)
        index.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        wrap.addView(index)
        return wrap
    }

    /**
     * **The landing.** A full-screen map of the outlines and nothing else, opened zoomed to the person's own
     * polygon when their area is known — the Detroit neighborhood that holds the point, else the city that does
     * ([areaAt]) — highlighted and named. Unknown: the location card over the anchor view, which moves to the
     * polygon the moment it is answered. Outside the service area: the plain message, and the map stays.
     */
    private fun mapFace(a: MainActivity, d: Indicators): View {
        val here = a.near
        val mine = if (here == null) null else areaAt(d, here)
        if (picked == null) picked = mine?.id
        val land = areasLanding(located = here != null, area = mine != null, outside = a.locateOutside)

        val on = picked?.let { areaById(d, it) } ?: mine
        val root = FrameLayout(a)
        root.setBackgroundColor(UI.color(a, R.color.app_bg))
        val map = areaMap(a, d, on, onPick = { hit -> openArea(a, hit.id) })
        root.addView(
            map,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        // Over the map, never across it: a column of WRAP_CONTENT height that is not itself clickable, so every
        // finger that misses a control lands on the city underneath.
        val over = UI.column(a)
        over.setPaddingRelative(UI.dp(a, 12), UI.dp(a, 8), UI.dp(a, 12), UI.dp(a, 8))
        over.addView(switchRow(a, onMap = true))
        when (land) {
            // "You are in Eastern Market", over the polygon it is about.
            AreasLanding.AREA -> on?.let { over.addView(UI.pill(a, L.t("hood.here_is", "name" to it.name))) }
            // The plain message. The map is never taken away: it stays on the city under it.
            AreasLanding.OUTSIDE ->
                over.addView(UI.pill(a, L.t("map.locate_outside"), R.drawable.pill_warn, R.color.warn_ink))
            // Nobody has said where they are: the three ways in, on a card over the anchor view. Nothing new is
            // asked of anybody — the same card and the same refusals as every other screen that offers it.
            AreasLanding.ASK -> {
                val card = UI.card(a, padding = 14, topDp = 8)
                card.addView(UI.text(a, L.t("hood.mine_head"), 17f, R.color.ink, bold = true))
                ParkScreens.locationControls(a, card)
                over.addView(card)
            }
        }
        root.addView(
            over,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
        )
        // Back from an area page puts a screen reader's cursor on that area's own outline, not at the top of a
        // screen it has already read.
        focusBackTo?.let { id ->
            focusBackTo = null
            map.post { map.focusOutline(id) }
        }
        return root
    }

    /** One outline map: the layer, the highlight, and the camera that frames the chosen polygon. */
    private fun areaMap(
        a: MainActivity,
        d: Indicators,
        on: AreaPage?,
        onPick: (DrawnArea) -> Unit,
    ): AreaOutlineView {
        // All 205 outlines, always, unlike the Map tab's layer: picking one is this tab's whole job, and a canvas
        // that showed four shapes would have nothing to pick. What the label rule governs is the NAMES, which
        // AreaOutlineView applies at the zoom it ends up at (boundaryStyle, docs/MAP-STYLE.md section 15).
        val areas = drawnAreas(d)
        val rings = on?.let { hoodRings(it.hood, d.origin) }?.takeIf { r -> r.any { it.size >= 2 } }
        return AreaOutlineView(a, areas, on?.id, rings, openingView(a.near), true, onPick)
    }

    /** A tap on a polygon IS the page opening (Kyle, 2026-09-22), in place, on this same tab. */
    private fun openArea(a: MainActivity, id: String) {
        picked = id
        openId = id
        announceOpen = true
        a.render()
    }

    /**
     * **The area page, in place.** The map shrinks to a strip at the top of the tab, [AREAS_STRIP_VH] % of the
     * viewport, with the polygon framed and highlighted and a Back button in its top-START corner; the whole area
     * page scrolls under it, and reading down collapses the strip to its [AREAS_BAR_PX] dp bar ([AreaStripLayout]).
     *
     * Tapping another outline in the strip swaps the page under it, which is the same call a tap on the landing
     * makes. Back — the button, or the system's — leaves the map whole again with the highlight where it was.
     */
    private fun areaPageInPlace(a: MainActivity, d: Indicators, area: AreaPage): View {
        val body = when (area) {
            is AreaPage.OfNeighborhood -> HoodScreens.page(a, area.id)
            is AreaPage.OfCity -> page(a, area.area, d)
        }
        val scroller = body as? android.widget.ScrollView
            ?: UI.scroller(a, UI.column(a).also { it.addView(body) })

        val strip = FrameLayout(a)
        strip.setBackgroundColor(UI.color(a, R.color.app_bg))
        val map = areaMap(a, d, area, onPick = { hit -> if (hit.id != area.id) openArea(a, hit.id) })
        strip.addView(
            map,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        strip.addView(
            bar(a, area),
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, UI.dp(a, AREAS_BAR_PX)),
        )

        val wrap = AreaStripLayout(a, strip, scroller)
        // The heading of the page that just opened is where a screen reader's cursor belongs — not the top of a
        // screen that has not changed, and not the strip, which is where it already was.
        if (announceOpen) {
            announceOpen = false
            wrap.post {
                wrap.announceForAccessibility(area.name)
                firstHeading(scroller)?.performAccessibilityAction(
                    AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null,
                )
            }
        }
        // The map arrives rather than travels when the phone's animator scale is zero (WCAG 2.3.3, and the
        // Android half of the web's Reduce Motion rule).
        if (animationsOn(a)) {
            map.alpha = 0f
            map.animate().alpha(1f).setDuration(AREAS_SHRINK_MS.toLong()).start()
        }
        return wrap
    }

    /** The pinned bar: Back in the top-START corner, and the area's name beside it. */
    private fun bar(a: MainActivity, area: AreaPage): View {
        val row = LinearLayout(a)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = android.view.Gravity.CENTER_VERTICAL
        row.setBackgroundColor(UI.color(a, R.color.surface))
        row.setPaddingRelative(UI.dp(a, 8), 0, UI.dp(a, 12), 0)
        val back = UI.button(
            a, L.t("hood.back_map"), backgroundId = R.drawable.pill_soft,
            textColorId = R.color.brand_soft_ink, topDp = 0,
        ) {
            if (onBack()) a.render()
        }
        back.minWidth = UI.dp(a, AREAS_BAR_PX)
        back.minimumHeight = UI.dp(a, AREAS_BAR_PX)
        back.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14f)
        back.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        row.addView(back)
        val name = UI.text(a, area.name, 17f, R.color.ink, bold = true)
        name.setSingleLine(true)
        name.ellipsize = android.text.TextUtils.TruncateAt.END
        val p = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        p.marginStart = UI.dp(a, 8)
        name.layoutParams = p
        heading(name)
        row.addView(name)
        return row
    }

    /** The first line of words on a page, which on every one of these pages is its heading. */
    private fun firstHeading(v: View): View? {
        if (v is TextView && v.text.isNotEmpty()) return v
        if (v is ViewGroup) {
            for (i in 0 until v.childCount) firstHeading(v.getChildAt(i))?.let { return it }
        }
        return null
    }

    /** "District 5" for a neighborhood, the city's own name for a whole-city area. */
    fun subLine(d: Indicators, page: AreaPage): String = when (page) {
        is AreaPage.OfCity -> L.t("city.area_sub")
        is AreaPage.OfNeighborhood ->
            page.neighborhood.district?.let { L.t("hood.district", "n" to it.toString()) } ?: cityNameOf(d, page)
    }

    // ---- one city page ---------------------------------------------------------------------------------------------

    /**
     * A whole-place page: Detroit, Hamtramck, Highland Park and Dearborn, and since 2026-09-24 every other city and
     * township a DDOT or SMART bus stops in. The same pieces as a neighborhood page, and **only the panels this
     * area's own allow-list names**, in the fixed order of [CITY_PANELS].
     *
     * Every panel prints its own source, with its own date and its own required notice. Nothing inherits, and no
     * number from another city appears anywhere: there is no cross-city comparison on this page at all.
     */
    fun page(a: MainActivity, area: Area, d: Indicators): View {
        val col = UI.column(a, 16)
        val title = UI.text(a, area.name, 24f, R.color.ink, bold = true)
        heading(title)
        col.addView(title)
        col.addView(UI.text(a, L.t("city.kind"), 15f, R.color.muted, topDp = 2))
        col.addView(UI.text(a, L.t("hood.describe"), 15f, R.color.ink, topDp = 8))

        val rings = hoodRings(area.hood, d.origin)
        if (rings.any { it.size >= 2 }) {
            val outline = AreaOutlineView(a, rings)
            outline.contentDescription = L.t("map.label_hood", "name" to area.name)
            val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            p.topMargin = UI.dp(a, 12)
            outline.layoutParams = p
            col.addView(outline)
        }

        val detroit = cityOf(d, area.id)?.hasNeighborhoods == true
        if (detroit) {
            col.addView(UI.text(a, L.t("city.detroit_children"), 15f, R.color.muted, topDp = 10))
            col.addView(
                UI.button(a, L.t("city.see_neighborhoods"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.go(Route.Hoods())
                },
            )
        } else if (isOutlineOnly(d, area)) {
            // A place with nothing but the help panel (every city and township a bus reaches, 2026-09-24) says just
            // that: it has no regional numbers to warn about, and nobody has checked what it publishes.
            col.addView(UI.text(a, L.t("city.outline_only", "city" to area.name), 15f, R.color.muted, topDp = 10))
        } else {
            col.addView(UI.text(a, L.t("city.no_neighborhoods", "city" to area.name), 15f, R.color.muted, topDp = 10))
            // The sentence the research doc requires on every non-Detroit page: these are not the same
            // measurements as Detroit's, so the two pages should not be read side by side.
            col.addView(UI.text(a, L.t("city.regional", "city" to area.name), 15f, R.color.muted, topDp = 6))
        }

        // The place's own police line (emergency.json `area`, 2026-09-24), under the words that say 911 comes first:
        // on this page and nowhere else. Nothing is drawn when the bundle has none for this place.
        val police = placeNumbers(a.store.bundle?.emergency.orEmpty(), area.id)
        if (police.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("city.police_head")))
            col.addView(UI.text(a, L.t("city.police_lede", "city" to area.name), 15f, R.color.ink, topDp = 4))
            for (e in police) col.addView(UI.callButton(a, e.label, e.number) { a.dial(e.number) })
        }

        // **The allow-list.** A panel is drawn because this area lists it, never because a number is present.
        for (panel in cityPanels(area)) when (panel) {
            "help" -> helpPanel(a, col, area, d)
            "parks" -> parksPanel(a, col, area, d, detroit)
            "crashes" -> crashesPanel(a, col, area, d)
            "roads" -> roadsPanel(a, col, area, d)
            "vacancy" -> vacancyPanel(a, col, area, d)
            "permits" -> permitsPanel(a, col, area, d)
        }

        // What this city records nothing of, and what it does not publish at all: absent, never zero, never an
        // empty chart, and always with the honest reason.
        val years = d.permitYears
        for (m in area.missing.filter { it.noneRecorded }) {
            col.addView(
                UI.text(
                    a,
                    L.t(
                        "city.${m.panel}_none", "city" to area.name,
                        "from" to (years.firstOrNull()?.toString() ?: ""), "to" to (years.lastOrNull()?.toString() ?: ""),
                    ),
                    15f, R.color.muted, topDp = 10,
                ),
            )
        }
        val notPublished = area.missing.filter { it.notPublished }.map { L.t("city.missing.${it.panel}") }
        if (notPublished.isNotEmpty()) {
            col.addView(
                UI.text(a, L.t("city.missing", "city" to area.name, "list" to joinParts(notPublished)), 15f, R.color.muted, topDp = 10),
            )
        }

        col.addView(UI.sectionHead(a, L.t("hood.sources_head")))
        for (s in areaSourcesOf(area, d)) col.addView(sourceRow(a, s))
        col.addView(UI.text(a, L.t("hood.source_ours"), 14f, R.color.muted, topDp = 6))
        col.addView(UI.text(a, L.t("hood.left_out"), 14f, R.color.muted, topDp = 6))
        return UI.scroller(a, col)
    }

    /** One panel's source line: the owner, when it was last edited, whose records they are, and their notice. */
    private fun sourceLine(a: MainActivity, col: LinearLayout, area: Area, d: Indicators, panel: String) {
        val s = panelSource(area, d, panel) ?: return
        col.addView(sourceRow(a, s))
    }

    private fun sourceRow(a: MainActivity, s: AreaSource): View {
        val card = UI.column(a)
        val line = UI.text(a, joinParts(listOf(s.name, L.t("hood.updated", "date" to s.lastEdited))), 14f, R.color.muted, topDp = 6)
        card.addView(line)
        s.recordsFrom?.let { card.addView(UI.text(a, L.t("city.records_from", "who" to it), 13f, R.color.muted, topDp = 2)) }
        // The owner's own required sentence, in the owner's own words and language. Never rewritten, never
        // translated by us (SEMCOG ask for theirs wherever their data is reproduced).
        s.notice?.let {
            val n = UI.text(a, it, 13f, R.color.muted, topDp = 2)
            n.textLocale = java.util.Locale.ENGLISH
            card.addView(n)
        }
        if (s.url.isNotEmpty()) {
            card.addView(
                UI.button(a, s.name, backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 4) {
                    a.openWeb(s.url)
                },
            )
        }
        return card
    }

    private fun pair(a: MainActivity, col: LinearLayout, label: String, value: String) {
        val row = UI.column(a)
        row.addView(UI.text(a, label, 16f, R.color.ink, topDp = 4))
        row.addView(UI.text(a, value, 18f, R.color.ink, bold = true))
        row.contentDescription = joinParts(listOf(label, value))
        col.addView(row)
    }

    private fun helpPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.help_head")))
        val total = area.hood.help.total
        col.addView(
            UI.text(
                a,
                when (total) {
                    0 -> L.t("city.help_none", "city" to area.name)
                    1 -> L.t("city.help_count_one", "city" to area.name)
                    else -> L.t("city.help_count", "count" to total.toString(), "city" to area.name)
                },
                16f, R.color.ink, topDp = 6,
            ),
        )
        col.addView(UI.text(a, L.t("hood.source_ours"), 14f, R.color.muted, topDp = 6))
    }

    private fun parksPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators, detroit: Boolean) {
        col.addView(UI.sectionHead(a, L.t("city.parks_head")))
        pair(a, col, L.t("city.parks_count"), area.hood.places.parks.toString())
        area.parkAcres?.let { pair(a, col, L.t("city.parks_acres"), String.format(L.locale(), "%,.0f", it)) }
        col.addView(UI.text(a, L.t(if (detroit) "city.parks_note_detroit" else "city.parks_note_semcog"), 14f, R.color.muted, topDp = 6))
        sourceLine(a, col, area, d, "parks")
    }

    private fun crashesPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.crash_head")))
        val years = d.crashYears
        col.addView(
            UI.text(
                a,
                L.t("hood.crash_lede", "from" to (years?.first?.toString() ?: ""), "to" to (years?.second?.toString() ?: "")),
                16f, R.color.ink, topDp = 6,
            ),
        )
        val c = area.hood.crashes
        // A count of people hurt or killed stays "fewer than 5" — the one place a real number is withheld.
        pair(a, col, L.t("hood.crash_walk"), countWords(c?.walk))
        pair(a, col, L.t("hood.crash_bike"), countWords(c?.bike))
        pair(a, col, L.t("hood.crash_severe"), countWords(c?.severe))
        col.addView(UI.text(a, L.t("hood.crash_note"), 14f, R.color.muted, topDp = 6))
        sourceLine(a, col, area, d, "crashes")
    }

    private fun roadsPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators) {
        val b = area.roadsBands ?: return
        col.addView(UI.sectionHead(a, L.t("city.roads_head")))
        col.addView(
            UI.text(a, L.t("city.roads_lede", "city" to area.name, "year" to (d.pavementYear?.toString() ?: "")), 16f, R.color.ink, topDp = 6),
        )
        for ((key, pct) in listOf("city.roads_good" to b.goodPct, "city.roads_fair" to b.fairPct, "city.roads_poor" to b.poorPct)) {
            pair(a, col, L.t(key), L.t("city.roads_pct", "pct" to String.format(L.locale(), "%.0f", pct)))
        }
        col.addView(UI.text(a, L.t("city.roads_miles", "miles" to String.format(L.locale(), "%.1f", b.miles)), 14f, R.color.muted, topDp = 6))
        col.addView(UI.text(a, L.t("city.roads_note"), 14f, R.color.muted, topDp = 4))
        sourceLine(a, col, area, d, "roads")
    }

    private fun vacancyPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators) {
        val v = area.vacancy ?: return
        col.addView(UI.sectionHead(a, L.t("city.vacancy_head")))
        col.addView(
            UI.text(
                a,
                L.t(
                    "city.vacancy_lede", "city" to area.name,
                    "vacant" to String.format(L.locale(), "%,d", v.vacant),
                    "units" to String.format(L.locale(), "%,d", v.housingUnits),
                ),
                16f, R.color.ink, topDp = 6,
            ),
        )
        pair(a, col, L.t("city.vacancy_share"), L.t("city.vacancy_pct", "pct" to String.format(L.locale(), "%.0f", v.pct)))
        col.addView(UI.text(a, L.t("city.vacancy_note"), 14f, R.color.muted, topDp = 6))
        sourceLine(a, col, area, d, "vacancy")
    }

    /** Whether the permit panel is drawn as a table or as a chart. Table is the default, on every platform. */
    private fun permitsPanel(a: MainActivity, col: LinearLayout, area: Area, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("city.permits_head")))
        col.addView(UI.text(a, L.t("city.permits_lede", "city" to area.name), 16f, R.color.ink, topDp = 6))
        val rows = area.permitsByYear
        val body = UI.column(a)
        col.addView(tableOrChart(a, body) { drawPermits(a, body, area, rows) })
        col.addView(body)
        drawPermits(a, body, area, rows)
        col.addView(UI.text(a, L.t("city.permits_note"), 14f, R.color.muted, topDp = 6))
        for (r in rows.filter { it.partial }) {
            col.addView(
                UI.text(
                    a,
                    L.t("city.permits_partial", "year" to r.year.toString(), "city" to area.name, "months" to r.monthsReported.toString()),
                    13f, R.color.muted, topDp = 4,
                ),
            )
        }
        sourceLine(a, col, area, d, "permits")
    }

    /** Table or Chart, the same control and the same remembered choice as a neighborhood's year panels. */
    private fun tableOrChart(a: MainActivity, body: LinearLayout, redraw: () -> Unit): View {
        val row = LinearLayout(a)
        row.orientation = LinearLayout.HORIZONTAL
        for ((choice, key) in listOf(HoodViewChoice.TABLE to "hood.view_table", HoodViewChoice.CHART to "hood.view_chart")) {
            val on = MapModel.hoodView(a) == choice
            val b = UI.button(
                a, L.t(key),
                backgroundId = if (on) R.drawable.pill_brand else R.drawable.pill_soft,
                textColorId = if (on) R.color.brand_ink else R.color.brand_soft_ink,
                topDp = 6,
            ) {
                MapModel.setHoodView(a, choice)
                a.render()
            }
            b.isSelected = on
            b.contentDescription = joinParts(listOf(L.t("hood.view_label"), L.t(key)))
            val p = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            p.marginEnd = UI.dp(a, 6)
            b.layoutParams = p
            row.addView(b)
        }
        return row
    }

    /**
     * The years, as rows. **The table is in the page either way** — the chart is drawn beside it rather than
     * instead of it, because a picture is not an alternative to the numbers for somebody who cannot see it.
     */
    private fun drawPermits(a: MainActivity, body: LinearLayout, area: Area, rows: List<PermitYear>) {
        body.removeAllViews()
        if (rows.isEmpty()) return
        body.addView(UI.text(a, L.t("city.permits_caption"), 14f, R.color.muted, topDp = 6))
        for (r in rows) {
            val line = joinParts(
                listOf(
                    r.year.toString(),
                    L.t("city.permits_units") + " " + String.format(L.locale(), "%,d", r.units),
                    L.t("city.permits_buildings") + " " + String.format(L.locale(), "%,d", r.buildings),
                ),
            )
            body.addView(UI.text(a, line, 16f, R.color.ink, topDp = 4))
        }
    }

    private fun countWords(c: HoodCount?): String = hoodCountText(c) { L.t(it) }
}
