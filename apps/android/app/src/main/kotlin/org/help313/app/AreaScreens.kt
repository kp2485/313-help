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
    private val onPick: ((DrawnArea) -> Unit)? = null,
) : View(context) {

    /** The single-outline case the old still view covered: one ring list, no tap, no name. */
    constructor(context: Context, rings: List<List<LatLon>>) :
        this(context, listOf(DrawnArea("one", "", true, rings)), "one", null)

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

    init {
        isClickable = onPick != null
        isFocusable = onPick != null
        setBackgroundColor(UI.color(context, R.color.map_land))
        if (onPick != null) contentDescription = L.t("map.label_areas")
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        // A fixed shape, not a fixed height in text: the picture carries no words that have to grow. The words
        // under it do, and at 200 % text the search box below is still on the first screen.
        setMeasuredDimension(w, (w * if (onPick == null) 0.58f else 0.92f).toInt())
    }

    private fun cameraFor(): org.help313.app.MapCamera? {
        val density = resources.displayMetrics.density.toDouble()
        val points = areas.flatMap { it.rings.flatten() }
        if (points.isEmpty() || width == 0 || height == 0) return null
        return org.help313.app.MapCamera.fitting(points, width / density, height / density, minMeters = 900.0)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density
        val cam = cameraFor() ?: return
        camera = cam
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
            if (area.id == selectedId) {
                fill.color = UI.color(context, R.color.brand_soft)
                canvas.drawPath(path, fill)
            }
            stroke.color = UI.color(context, if (area.isCity) R.color.brand else R.color.muted)
            stroke.strokeWidth = (if (area.isCity) 2f else 1.2f) * density
            // A neighborhood is a thin dashed line, a city a solid one, so the two are told apart without colour.
            stroke.pathEffect = if (area.isCity) null else android.graphics.DashPathEffect(floatArrayOf(6f * density, 4f * density), 0f)
            canvas.drawPath(path, stroke)
        }
        stroke.pathEffect = null
        // Names last, over every outline, so one is never drawn under the next area's edge.
        if (onPick == null) return
        label.textSize = 11f * density
        halo.textSize = 11f * density
        halo.strokeWidth = 3f * density
        halo.color = UI.color(context, R.color.map_land)
        label.color = UI.color(context, R.color.ink)
        // **The label rule** (DECISIONS 2026-09-22): a neighborhood is named only from the zoom at which its name
        // fits — about 70 dp of name over an area about a kilometre across. Below that, the four cities alone, and
        // the one outline that was tapped, which the card under the map names anyway.
        //
        // The neighborhood *outlines* are still drawn here, unlike on the Map tab's layer, because picking one is
        // this tab's whole job and a canvas that showed four shapes would have nothing to pick. What the rule
        // governs is the words, which are what would otherwise be 205 names on top of one another.
        val named = cam.metersPerPoint <= AREAS_NAME_METERS_PER_DP
        for (area in areas) {
            if (area.name.isEmpty()) continue
            if (!area.isCity && !named && area.id != selectedId) continue
            val box = centreOf(area, cam, density) ?: continue
            canvas.drawText(area.name, box.first, box.second, halo)
            canvas.drawText(area.name, box.first, box.second, label)
        }
    }

    private fun centreOf(area: DrawnArea, cam: org.help313.app.MapCamera, density: Float): Pair<Float, Float>? {
        val ring = area.rings.maxByOrNull { it.size } ?: return null
        if (ring.isEmpty()) return null
        val lat = ring.sumOf { it.lat } / ring.size
        val lon = ring.sumOf { it.lon } / ring.size
        return (cam.screenX(MapProjection.x(lon)) * density).toFloat() to (cam.screenY(MapProjection.y(lat)) * density).toFloat()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val pick = onPick ?: return false
        if (event.action != MotionEvent.ACTION_UP) return true
        val cam = camera ?: return true
        val density = resources.displayMetrics.density
        val lat = MapProjection.lat(cam.mapY((event.y / density).toDouble()))
        val lon = MapProjection.lon(cam.mapX((event.x / density).toDouble()))
        // The smallest outline holding the tap wins, so a neighborhood beats the city it sits inside (Areas.kt).
        areaHit(areas, lat, lon)?.let { pick(it) }
        return true
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
            node.isSelected = area.id == selectedId
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

    /** Which of the tab's two views is showing. In memory for the life of this process; it is about a screen. */
    private var asList = false

    /** Which outline is picked out, when a person has tapped one. Never written down. */
    private var picked: String? = null

    /** The index's order. "Nearest first" is offered only while a location or a ZIP is known. */
    private var order: String = "abc"

    fun reset() {
        asList = false
        picked = null
        order = "abc"
    }

    private fun heading(v: View) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) v.isAccessibilityHeading = true
    }

    // ---- the tab ------------------------------------------------------------------------------------------------

    /**
     * **One screen, two views, one control.** The map is the landing; "See this map as a list" swaps to the index
     * that has always been here, and "See this list as a map" swaps back — the same wording the Map tab uses.
     */
    fun tab(a: MainActivity, lens: String?): View {
        HoodRepo.onChange = { a.render() }
        HoodRepo.want(a.store)
        val d = HoodRepo.data
        if (d == null || lens != null || asList) {
            // The index is the same screen's second view. The greenway lens keeps its URL-reachable screen and is
            // never the landing (audit §6).
            val inner = HoodScreens.index(a, lens)
            if (d == null || lens != null) return inner
            return withSwitch(a, inner, toList = false)
        }
        return withSwitch(a, mapView(a, d), toList = true)
    }

    /** The one control that swaps the two views, pinned above whichever one is showing. */
    private fun withSwitch(a: MainActivity, inner: View, toList: Boolean): View {
        val wrap = UI.column(a)
        val button = UI.button(
            a, L.t(if (toList) "map.list_title" else "map.list_as_map"),
            backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 0,
        ) {
            asList = toList
            a.render()
        }
        button.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        wrap.addView(button)
        inner.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        wrap.addView(inner)
        return wrap
    }

    /** The landing: the outlines, the person's own area when we know it, and the card a tap opens. */
    private fun mapView(a: MainActivity, d: Indicators): View {
        val col = UI.column(a, 16)
        val head = UI.text(a, L.t("tab.hoods_wide"), 24f, R.color.ink, bold = true)
        heading(head)
        col.addView(head)
        col.addView(UI.text(a, L.t("hood.index_intro"), 16f, R.color.ink, topDp = 6))

        // A location or a typed ZIP already known this visit picks the person's own area out for them, so the page
        // is two taps away. Nothing new is asked of anybody: the first-open card belongs to the Map tab, and a
        // second copy of it here would be a second permission pattern, which docs/05 forbids.
        val here = a.near
        val mine = if (here == null) null else areaAt(d, here)
        if (picked == null) picked = mine?.id

        // The 205 outlines are drawn from the zoom at which a name fits; on this one small canvas that is the four
        // cities, plus the neighborhoods once a city has been picked.
        val inDetroit = picked?.let { id -> d.neighborhoods.any { it.id == id } } == true
        val areas = if (inDetroit || mine is AreaPage.OfNeighborhood) drawnAreas(d, 1.0) else drawnAreas(d, 99.0)
        val map = AreaOutlineView(a, areas, picked) { hit ->
            picked = hit.id
            a.render()
        }
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.topMargin = UI.dp(a, 12)
        map.layoutParams = lp
        col.addView(map)

        // The card under the map: the name, a sub-line, and "See details". The same shape as the Map tab's card.
        picked?.let { id ->
            areaById(d, id)?.let { page ->
                val card = UI.card(a)
                card.addView(UI.text(a, page.name, 20f, R.color.ink, bold = true))
                card.addView(UI.text(a, subLine(d, page), 15f, R.color.muted, topDp = 2))
                card.addView(
                    UI.button(a, L.t("hood.about_area")) { a.push(Route.Hood(id)) },
                )
                col.addView(card)
            }
        }

        if (here == null) {
            col.addView(UI.sectionHead(a, L.t("hood.mine_head")))
            ParkScreens.locationControls(a, col)
        } else if (mine == null) {
            col.addView(UI.text(a, L.t("hood.mine_outside"), 15f, R.color.muted, topDp = 10))
        }

        col.addView(UI.text(a, L.t("hood.index_sources"), 14f, R.color.muted, topDp = 14))
        col.addView(UI.text(a, L.t("hood.describe"), 14f, R.color.muted, topDp = 6))
        return UI.scroller(a, col)
    }

    /** "District 5" for a neighborhood, the city's own name for a whole-city area. */
    fun subLine(d: Indicators, page: AreaPage): String = when (page) {
        is AreaPage.OfCity -> L.t("city.area_sub")
        is AreaPage.OfNeighborhood ->
            page.neighborhood.district?.let { L.t("hood.district", "n" to it.toString()) } ?: cityNameOf(d, page)
    }

    // ---- one city page ---------------------------------------------------------------------------------------------

    /**
     * A whole-city page: Detroit, Hamtramck, Highland Park and Dearborn. The same pieces as a neighborhood page,
     * and **only the panels this area's own allow-list names**, in the fixed order of [CITY_PANELS].
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
        } else {
            col.addView(UI.text(a, L.t("city.no_neighborhoods", "city" to area.name), 15f, R.color.muted, topDp = 10))
            // The sentence the research doc requires on every non-Detroit page: these are not the same
            // measurements as Detroit's, so the two pages should not be read side by side.
            col.addView(UI.text(a, L.t("city.regional", "city" to area.name), 15f, R.color.muted, topDp = 6))
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
