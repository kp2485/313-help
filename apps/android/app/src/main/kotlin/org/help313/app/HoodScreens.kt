// The Neighborhoods tab: the index of the City's 205 neighborhoods, and one page per neighborhood (docs/13).
// Kyle, 2026-09-21: neighborhood information gets its own tab, "not just on the web, in the apps too".
//
// Every rule and every number is in Hoods.kt, which `:core` runs on a plain JDK. This file lays them out and does
// nothing else: it decides no order, rounds no number, and hides no count.
//
// What this tab is not. It is not in the crisis path and nothing here is about a person: the numbers are public
// City datasets and our own list, and none of them comes from a report, from app usage, or from anything a phone
// sends (docs/13). "Your neighborhood" is worked out on this phone from a coarse fix MainActivity holds in memory
// for as long as the activity lives — never written down, never sent, never put in a link.
//
// There is no comparison between neighborhoods anywhere on these screens: no ranking, no sorting by a number, no
// colour that reads as a score. Each place is shown against itself over time, and against the whole city.
package org.help313.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import org.help313.query.BundleRow
import org.help313.query.LatLon
import org.help313.query.miles

// ---- the file, read once, when a neighborhood screen asks for it ----------------------------------------------

/**
 * The neighborhood numbers, read lazily and verified, exactly as the map's layers are (MapModel, BundleStore).
 *
 * `indicators/neighborhoods.json` is 387 KB and is on no screen a person in trouble opens, so `BundleCheck.loadedNow`
 * leaves it out of the start-up load and it is fetched only when this tab is opened. Wherever the bytes come from —
 * this app's verified copy, the snapshot inside the APK, or the published origin — they are checked against the
 * sha256 in the **signed** index before a byte of them is decoded (BundleStore.verifiedBytes). A file that does not
 * match is not used; it is never "close enough".
 *
 * One repo per process, like the bundle and the map: a font-scale change or a rotation must not decode it again.
 * Keyed by the file's own checksum, so a newer bundle replaces it and an unchanged one does not.
 */
object HoodRepo {

    private val main = Handler(Looper.getMainLooper())

    @Volatile
    var data: Indicators? = null
        private set

    /** True when the file could not be read. A screen says so; it never shows an empty list instead. */
    @Volatile
    var failed = false
        private set

    private var key = ""
    private var asking = false

    /** Set by whichever screen is on, cleared by it. */
    @Volatile
    var onChange: (() -> Unit)? = null

    /** Whether this bundle carries the file at all. An older bundle does not, and the tab says so. */
    fun offered(store: BundleStore): Boolean = store.bundle?.index?.files?.containsKey(HOOD_FILE) != null

    @Synchronized
    private fun claim(want: String): Boolean {
        if (asking) return false
        if (key == want && (data != null || failed)) return false
        asking = true
        return true
    }

    /**
     * Asks for the file if it is not already held. Returns at once; the screen redraws when [onChange] fires.
     * Never on the main thread: 387 KB of JSON and a SHA-256 over it is a dropped frame on a cheap phone.
     */
    fun want(store: BundleStore) {
        val want = store.bundle?.index?.files?.get(HOOD_FILE)?.sha256 ?: return
        if (!claim(want)) return
        Work.io {
            var read: Indicators? = null
            try {
                read = decodeIndicators(store.verifiedBytes(HOOD_FILE))
            } catch (t: Throwable) {
                if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "neighborhood numbers failed: $t")
            }
            synchronized(this) {
                key = want
                data = read
                failed = read == null
                asking = false
            }
            main.post { onChange?.invoke() }
        }
    }
}

// ---- the outline ------------------------------------------------------------------------------------------------

/**
 * One neighborhood's edge, drawn small and still. Not a map: nothing here pans, zooms, is tappable or moves at all,
 * so there is no animation to turn off and no gesture to learn. Everything below it says the same things in words.
 *
 * It is drawn with the app's own map arithmetic — [MapProjection] and [MapCamera] from MapData.kt, which `:core`
 * tests — so this outline sits on the city exactly where the Map tab would put it.
 */
private class HoodOutlineView(context: Context, private val rings: List<List<LatLon>>) : View(context) {

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }

    init {
        isClickable = false
        isFocusable = false
        setBackgroundColor(UI.color(context, R.color.map_land))
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        // A fixed shape, not a fixed height in text: the outline carries no words, so it does not grow with the
        // phone's text size — the words under it do.
        setMeasuredDimension(w, (w * 0.58f).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density.toDouble()
        val points = rings.flatten()
        if (points.isEmpty()) return
        // The camera works in dp, like the Map tab's, so the outline is the same size on every screen.
        val cam = MapCamera.fitting(points, width / density, height / density, minMeters = 900.0)
        val path = Path()
        path.fillType = Path.FillType.EVEN_ODD
        for (ring in rings) {
            if (ring.size < 2) continue
            for ((i, p) in ring.withIndex()) {
                val x = (cam.screenX(MapProjection.pointX(p)) * density).toFloat()
                val y = (cam.screenY(MapProjection.pointY(p)) * density).toFloat()
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            path.close()
        }
        fill.color = UI.color(context, R.color.brand_soft)
        canvas.drawPath(path, fill)
        // The edge is a line as well as a change of shade, so it is visible without colour (WCAG 1.4.11).
        stroke.color = UI.color(context, R.color.brand)
        stroke.strokeWidth = 2f * density.toFloat()
        canvas.drawPath(path, stroke)
    }
}

// ---- the screens --------------------------------------------------------------------------------------------------

object HoodScreens {

    /**
     * How the index is ordered. A preference about a list, in memory for as long as this process lives, written
     * nowhere: it says nothing about anybody and there is no file for it to be in.
     */
    private var byDistrict = false

    /** Large text stacks every table row instead of laying it across the screen. */
    private fun stacked(a: MainActivity): Boolean = a.resources.configuration.fontScale > 1.3f

    private fun heading(v: View) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) v.isAccessibilityHeading = true
    }

    private fun sub(a: MainActivity, words: String): TextView {
        val t = UI.text(a, words, 18f, R.color.ink, bold = true, topDp = 14)
        heading(t)
        return t
    }

    // ---- the index --------------------------------------------------------------------------------------------

    fun index(a: MainActivity, lens: String?): View {
        val col = UI.column(a, 16)
        val title = L.t(if (lens == "jlg") "hood.lens_jlg" else "hood.title")
        val head = UI.text(a, title, 24f, R.color.ink, bold = true)
        heading(head)
        col.addView(head)
        col.addView(UI.text(a, L.t("hood.index_intro"), 16f, R.color.ink, topDp = 6))
        col.addView(UI.text(a, L.t("hood.index_sources"), 15f, R.color.muted, topDp = 6))

        HoodRepo.onChange = { a.render() }
        HoodRepo.want(a.store)
        val d = HoodRepo.data
        if (d == null) {
            col.addView(
                UI.text(
                    a,
                    L.t(if (HoodRepo.failed || !HoodRepo.offered(a.store)) "hood.unavailable" else "home.loading"),
                    17f, R.color.muted, topDp = 16,
                ),
            )
            return UI.scroller(a, col)
        }

        yourNeighborhood(a, col, d)

        // The filter and the ordering, over the whole list of names. Nothing typed here is stored, sent, or put in
        // a link, and the field asks the keyboard not to learn from it or offer to fill it (UI.field).
        val list = if (lens == "jlg") d.neighborhoods.filter { it.jlgStudyArea } else d.neighborhoods
        if (lens == "jlg") {
            col.addView(UI.text(a, L.t("hood.lens_jlg_note", "count" to list.size.toString()), 15f, R.color.muted, topDp = 12))
        }
        col.addView(sub(a, L.t("hood.find_label")))
        val box = UI.field(a, L.t("hood.find_label"), L.t("hood.find_label"), suggestions = false)
        col.addView(box)

        col.addView(UI.text(a, L.t("hood.group_label"), 15f, R.color.muted, topDp = 10))
        val toggle = UI.column(a)
        col.addView(toggle)

        val out = UI.column(a)
        col.addView(out)

        // The order buttons and the list are rebuilt in place, never by a.render(): a whole redraw would take the
        // keyboard away and lose what somebody had typed halfway through a name.
        drawToggle(a, toggle, out, d, list, box)
        drawList(a, out, d, list, "")

        box.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) = drawList(a, out, d, list, s?.toString() ?: "")
        })

        col.addView(UI.text(a, L.t("hood.only_detroit"), 15f, R.color.muted, topDp = 18))
        col.addView(
            UI.button(a, L.t("hood.mine_map"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                a.go(Route.Map)
            },
        )
        col.addView(UI.text(a, L.t("hood.describe"), 15f, R.color.muted, topDp = 14))
        return UI.scroller(a, col)
    }

    private fun drawToggle(
        a: MainActivity,
        toggle: LinearLayout,
        out: LinearLayout,
        d: Indicators,
        list: List<Hood>,
        box: android.widget.EditText,
    ) {
        toggle.removeAllViews()
        for ((key, wanted) in listOf("hood.group_abc" to false, "hood.group_district" to true)) {
            val on = byDistrict == wanted
            val b = UI.button(
                a, L.t(key),
                backgroundId = if (on) R.drawable.pill_brand else R.drawable.pill_soft,
                textColorId = if (on) R.color.brand_ink else R.color.brand_soft_ink,
                topDp = 6,
            ) {
                byDistrict = wanted
                drawToggle(a, toggle, out, d, list, box)
                drawList(a, out, d, list, box.text.toString())
            }
            // Which order is on is in the words a screen reader reads, not only in the colour of the button.
            b.contentDescription = joinParts(listOf(L.t("hood.group_label"), L.t(key)))
            b.isSelected = on
            toggle.addView(b)
        }
    }

    /**
     * "Your neighborhood", when this app already holds a coarse fix this session — and the button to ask for one
     * when it does not.
     *
     * The same flow, and the same refusals, as every other screen that offers it (Screens.listBody): the button is
     * never pressed for anybody, a refusal is never nagged at, and once Android has stopped putting its dialog up
     * the words say where the switch is instead of asking again. A fix from outside the four cities says so; a fix
     * inside them but outside Detroit says that only Detroit has neighborhood pages.
     */
    private fun yourNeighborhood(a: MainActivity, col: LinearLayout, d: Indicators) {
        col.addView(sub(a, L.t("hood.mine_head")))
        val here = a.near
        if (here == null) {
            col.addView(
                UI.button(a, L.t("loc.use"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.askForLocation()
                },
            )
            if (a.locationRefused) {
                col.addView(
                    UI.text(a, L.t(if (a.locationPermanentlyDenied()) "loc.denied_settings" else "loc.denied"), 15f, R.color.muted, topDp = 6),
                )
            }
            if (a.locateOutside) col.addView(UI.text(a, L.t("hood.mine_outside"), 15f, R.color.muted, topDp = 6))
            // Or type a ZIP: its centre decides, and a ZIP covers more than one neighborhood, which the page says.
            ZipBox.add(a, col)
            col.addView(UI.text(a, L.t("loc.note"), 14f, R.color.muted, topDp = 4))
            return
        }
        val mine = hoodAt(d, here)
        if (mine == null) {
            // Inside the four cities (MainActivity only keeps a fix that is) but outside every Detroit outline:
            // Hamtramck, Highland Park, Dearborn, or the river.
            col.addView(UI.text(a, L.t("hood.mine_outside"), 16f, R.color.ink, topDp = 6))
            col.addView(
                UI.button(a, L.t("hood.mine_map"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.go(Route.Map)
                },
            )
        } else {
            col.addView(nameCard(a, mine))
        }
        // A ZIP covers more than one neighborhood and the bundle carries only its centre, so a page reached that
        // way says as much rather than letting a person think the whole ZIP is this one place.
        a.nearZip?.let { col.addView(UI.text(a, L.t("hood.mine_zip", "zip" to it), 14f, R.color.muted, topDp = 6)) }
        col.addView(UI.text(a, L.t("hood.mine_note"), 14f, R.color.muted, topDp = 6))
        ZipBox.add(a, col)
    }

    /** One row of the index: the City's name for the place, and its district. */
    private fun nameCard(a: MainActivity, h: Hood): View {
        val card = UI.tappableCard(a, h.name) { a.push(Route.Hood(h.id)) }
        card.addView(UI.text(a, h.name, 18f, R.color.ink, bold = true))
        h.district?.let { card.addView(UI.text(a, L.t("hood.district", "n" to it.toString()), 14f, R.color.muted, topDp = 2)) }
        return card
    }

    private fun drawList(a: MainActivity, out: LinearLayout, d: Indicators, list: List<Hood>, query: String) {
        out.removeAllViews()
        val found = filterHoods(list, query)
        val count = UI.text(
            a,
            if (found.size == 1) L.t("hood.find_one") else L.t("hood.find_count", "count" to hoodNumber(found.size)),
            15f, R.color.muted, topDp = 10,
        )
        out.addView(count)
        if (found.isEmpty()) {
            out.addView(UI.text(a, L.t("hood.find_none"), 17f, R.color.muted, topDp = 12))
            return
        }
        if (byDistrict) {
            for (g in hoodsByDistrict(found)) {
                out.addView(sub(a, if (g.district == null) L.t("hood.no_district") else L.t("hood.district", "n" to g.district.toString())))
                for (h in g.items) out.addView(nameCard(a, h))
            }
        } else {
            for (g in hoodsByLetter(found)) {
                out.addView(sub(a, g.letter?.toString() ?: L.t("hood.letter_other")))
                for (h in g.items) out.addView(nameCard(a, h))
            }
        }
    }

    // ---- one neighborhood -----------------------------------------------------------------------------------

    fun page(a: MainActivity, id: String): View {
        yearGroups.clear()
        seriesOff.clear()
        HoodRepo.onChange = { a.render() }
        HoodRepo.want(a.store)
        val d = HoodRepo.data
        // `#/n/<id>` is one entry point for both kinds of area: one of Detroit's 205 neighborhoods, or one of the
        // four whole-city pages, drawn from the same pieces (Areas.kt; DECISIONS 2026-09-22).
        if (d != null) {
            (areaById(d, id) as? AreaPage.OfCity)?.let { return AreaScreens.page(a, it.area, d) }
        }
        val h = d?.hood(id)
        if (d == null || h == null) {
            val col = UI.column(a, 16)
            col.addView(
                UI.text(
                    a,
                    L.t(if (d != null) "detail.not_found" else if (HoodRepo.failed) "hood.unavailable" else "home.loading"),
                    17f, R.color.muted,
                ),
            )
            return UI.scroller(a, col)
        }

        val col = UI.column(a, 16)
        val title = UI.text(a, h.name, 24f, R.color.ink, bold = true)
        heading(title)
        col.addView(title)
        val where = joinParts(
            listOf(
                h.district?.let { L.t("hood.district", "n" to it.toString()) },
                if (h.jlgStudyArea) L.t("hood.in_jlg") else null,
            ),
        )
        if (where.isNotEmpty()) col.addView(UI.text(a, where, 15f, R.color.muted, topDp = 2))
        col.addView(UI.text(a, L.t("hood.describe"), 15f, R.color.ink, topDp = 8))

        val rings = hoodRings(h, d.origin)
        if (rings.any { it.size >= 2 }) {
            val outline = HoodOutlineView(a, rings)
            outline.contentDescription = L.t("map.label_hood", "name" to h.name)
            outline.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            p.topMargin = UI.dp(a, 12)
            outline.layoutParams = p
            col.addView(outline)
        }

        helpPanel(a, col, h, d)
        moneyPanel(a, col, h, d)
        conditionsPanel(a, col, h, d)
        crashPanel(a, col, h, d)
        sourcesPanel(a, col, d)
        return UI.scroller(a, col)
    }

    // ---- "Help people here can reach" -------------------------------------------------------------------------

    private fun helpPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.help_head")))
        if (!h.help.coverageChecked) {
            val card = UI.card(a)
            card.addView(UI.text(a, L.t("hood.thin"), 16f, R.color.ink))
            // "Tell us what we're missing" is a button, as it is on the web: the weakest part of the data is the
            // recruitment channel (docs/13 honesty rule 6).
            if (!a.retired()) {
                card.addView(
                    UI.button(a, L.t("add.title"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                        AddScreen.reset()
                        a.push(Route.Add)
                    },
                )
            }
            col.addView(card)
        }
        val miles = hoodMiles(d.nearMiles)
        col.addView(
            UI.text(
                a,
                if (h.help.total == 1) L.t("hood.help_count_one", "miles" to miles)
                else L.t("hood.help_count", "count" to hoodNumber(h.help.total), "miles" to miles),
                16f, R.color.ink, topDp = 8,
            ),
        )
        for ((category, n) in h.help.by) {
            if (n <= 0) continue
            col.addView(pairRow(a, L.t(hoodCategoryKey(category)), hoodNumber(n)))
        }
        if (h.help.noneListedYet.isNotEmpty()) {
            val kinds = h.help.noneListedYet.joinToString(L.t("list.sep")) { L.t("hood.kind.$it") }
            col.addView(UI.text(a, L.t("hood.none_listed", "kinds" to kinds), 15f, R.color.muted, topDp = 8))
        }

        col.addView(sub(a, L.t("hood.nearest_head")))
        for (kind in HOOD_NEAREST) {
            val mi = h.help.nearestMiles[kind]
            val label = L.t("hood.nearest.$kind")
            if (mi == null) {
                col.addView(pairRow(a, label, L.t("hood.nearest_none")))
                continue
            }
            val value = L.t("miles", "miles" to hoodFixed(mi, 1))
            // The row opens the very listing the bundle said that distance belongs to (`help.nearest_id`), so it
            // can never lead somewhere the printed distance does not describe. Nothing is worked out on the phone,
            // and a bundle without the field — or an id this phone's list does not have, or one naming a sensitive
            // listing — gets the plain row instead ([hoodNearestListing]).
            val row = nearestListing(a, h, kind)
            if (row == null) {
                col.addView(pairRow(a, label, value))
            } else {
                // One thing a screen reader reads, in the sentence the web uses: "Food: Exodus Food Pantry,
                // 1.0 mi. Open this listing."
                val spoken = L.t("hood.nearest_open", "kind" to label, "name" to row.name, "distance" to value)
                val card = UI.tappableCard(a, spoken) { a.push(Route.Detail(row.id, row.category)) }
                val kindLine = UI.text(a, label, 16f, R.color.muted)
                val nameLine = UI.text(a, row.name, 17f, R.color.ink, bold = true, topDp = 2)
                val milesLine = UI.text(a, value, 15f, R.color.muted, topDp = 2)
                for (line in listOf(kindLine, nameLine, milesLine)) {
                    line.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                    card.addView(line)
                }
                col.addView(card)
            }
        }

        // Which counting rule each count uses, on its row (docs/13, "Counting rules"): a bus stop or a Bridge-card
        // store counts only inside the outline; a park or rec center inside or within half a mile.
        val near = L.t("hood.rule_near", "miles" to miles)
        val inside = L.t("hood.rule_inside")
        col.addView(sub(a, L.t("hood.places_head")))
        col.addView(pairRow(a, L.t("hood.parks") + " (" + near + ")", hoodNumber(h.places.parks)))
        col.addView(pairRow(a, L.t("hood.rec_centers") + " (" + near + ")", hoodNumber(h.places.recCenters)))
        col.addView(pairRow(a, L.t("hood.greenway_open") + " (" + near + ")", hoodNumber(h.places.greenwayOpen)))
        h.places.snapStores?.let { col.addView(pairRow(a, L.t("hood.snap_stores") + " (" + inside + ")", hoodNumber(it))) }
        h.places.busStops?.let { col.addView(pairRow(a, L.t("hood.bus_stops") + " (" + inside + ")", hoodNumber(it))) }
        col.addView(UI.text(a, L.t("hood.places_note", "miles" to miles), 14f, R.color.muted, topDp = 6))

        val nc = h.nearestCity ?: return
        col.addView(sub(a, L.t("hood.city_near_head")))
        for ((key, mi) in listOf("snap" to nc.snap, "grocery" to nc.grocery, "bus" to nc.bus)) {
            val value = if (mi == null) L.t("hood.none_found") else L.t("miles", "miles" to hoodFixed(mi, 1))
            col.addView(pairRow(a, L.t("hood.near.$key"), value))
        }
        col.addView(UI.text(a, L.t("hood.snap_note"), 14f, R.color.muted, topDp = 8))
    }

    /** The listing a "nearest listed" row opens, from the id the bundle published. The rule is [hoodNearestListing]. */
    private fun nearestListing(a: MainActivity, h: Hood, kind: String): BundleRow? {
        val rows = a.store.bundle?.rows ?: return null
        return hoodNearestListing(h, kind) { id -> rows.firstOrNull { it.id == id } }
    }


    // ---- table or chart (2026-09-22) --------------------------------------------------------------------------

    /**
     * One group of year panels: the Table | Chart control, then the picture or the tables.
     *
     * **The table is never traded away for a picture.** With TalkBack running it stays under the chart, because an
     * Android view that is not on the screen is not in the accessibility tree either — there is no "read it but do
     * not show it" here the way the web's `.vh` class has one. That is also why Table is the default: it is the
     * view that carries every number.
     *
     * The control appears only where a chart could say something: three years with something in them and at least
     * one number to draw ([hoodChartable]). A neighborhood with two years of sales keeps its table.
     *
     * Only the body is rebuilt when the choice changes, never the whole screen, so the radio that was just chosen
     * keeps the focus and nothing above it moves.
     */
    private fun yearGroup(
        a: MainActivity,
        col: LinearLayout,
        chartNameKey: String,
        series: List<HoodSeries>,
        showPicker: Boolean = true,
        tables: (LinearLayout) -> Unit,
    ) {
        val drawable = series.filter { hoodChartable(it.points) }
        if (drawable.isEmpty()) {
            tables(col)
            return
        }
        val body = UI.column(a)
        fun draw() {
            body.removeAllViews()
            if (MapModel.hoodView(a) == HoodViewChoice.CHART) chart(a, body, chartNameKey, drawable, tables) else tables(body)
        }
        // A panel with several charts draws ONE control above them all (`viewPicker`) and passes `false` here:
        // this group then only follows the page-wide choice.
        if (!showPicker) {
            yearGroups.add { draw() }
            col.addView(body)
            draw()
            return
        }
        viewPicker(a, col)
        col.addView(body)
        yearGroups.add { draw() }
        draw()
    }

    /**
     * Table | Chart: two real radio buttons in a named group. One choice covers every panel on the page (MapModel
     * keeps it on this device, never sent); every other group and picker on the page is redrawn to match.
     */
    private fun viewPicker(a: MainActivity, col: LinearLayout) {
        col.addView(UI.text(a, L.t("hood.view_label"), 15f, R.color.muted, topDp = 12))
        val group = RadioGroup(a)
        group.orientation = RadioGroup.HORIZONTAL
        group.contentDescription = L.t("hood.view_label")

        val buttons = ArrayList<RadioButton>()
        for (choice in listOf(HoodViewChoice.TABLE, HoodViewChoice.CHART)) {
            val b = RadioButton(a)
            b.id = View.generateViewId()
            b.text = L.t("hood.view_" + if (choice == HoodViewChoice.TABLE) "table" else "chart")
            b.setTextColor(UI.color(a, R.color.ink))
            b.buttonTintList = android.content.res.ColorStateList.valueOf(UI.color(a, R.color.brand))
            b.minimumHeight = UI.dp(a, 48)
            b.setPaddingRelative(UI.dp(a, 6), UI.dp(a, 6), UI.dp(a, 16), UI.dp(a, 6))
            // Which view is on is in the words a screen reader reads, not only in the dot beside them.
            b.contentDescription = joinParts(listOf(L.t("hood.view_label"), b.text.toString()))
            buttons.add(b)
            group.addView(b)
            if (MapModel.hoodView(a) == choice) group.check(b.id)
        }
        // One choice covers every panel on the page, so every other panel is redrawn too — and its own radios are
        // moved to match, without their listener firing back (`syncing`). Only the bodies are rebuilt: the radio
        // that was just tapped keeps the focus and nothing above it moves.
        yearGroups.add {
            syncing = true
            group.check(buttons[if (MapModel.hoodView(a) == HoodViewChoice.CHART) 1 else 0].id)
            syncing = false
        }
        group.setOnCheckedChangeListener { _, checkedId ->
            if (syncing) return@setOnCheckedChangeListener
            val next = if (buttons[1].id == checkedId) HoodViewChoice.CHART else HoodViewChoice.TABLE
            MapModel.setHoodView(a, next)
            for (redraw in yearGroups.toList()) redraw()
            group.announceForAccessibility(
                L.t("hood.view_say", "name" to L.t("hood.view_" + if (next == HoodViewChoice.CHART) "chart" else "table")),
            )
        }
        col.addView(group)
    }

    /**
     * Every year group drawn on the page that is open, so that one Table | Chart choice moves all of them at once
     * — there is one flag, not one per panel (docs/13, 2026-09-22). Cleared when a page is built; a page that is
     * thrown away takes its closures with it.
     */
    private val yearGroups = ArrayList<() -> Unit>()
    /**
     * Which chart lines are switched off, on the page that is open. A way of looking at a page, never a fact
     * about anybody: memory only, cleared when a page is built, never written down and never sent.
     */
    private val seriesOff = HashSet<String>()

    /** True while a radio is being moved to match the flag, so its listener does not write the flag back. */
    private var syncing = false

    /** The picture, the key under it, and the sentence that says what it shows. */
    private fun chart(
        a: MainActivity,
        body: LinearLayout,
        chartNameKey: String,
        drawable: List<HoodSeries>,
        tables: (LinearLayout) -> Unit,
    ) {
        val shown = hoodShownSeries(drawable, seriesOff)
        val m = hoodChartModel(shown)
        val card = UI.card(a, topDp = 8)
        card.contentDescription = L.t(
            chartNameKey,
            "from" to (m.years.firstOrNull() ?: ""),
            "to" to (m.years.lastOrNull() ?: ""),
        )
        val view = HoodChartView(a, m) { tone -> toneColor(a, tone) }
        val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        p.topMargin = UI.dp(a, 4)
        view.layoutParams = p
        card.addView(view)

        // The key: one real checkbox per line, with its own sample. The last one left on is disabled and the line
        // under it says why, so the chart can never become an empty pair of axes. One line needs no key at all —
        // the panel's own name already says what is drawn.
        if (drawable.size > 1) {
            card.addView(UI.text(a, L.t("hood.chart_show"), 14f, R.color.muted, topDp = 10))
            for (s in drawable) {
                val on = shown.any { it.key == s.key }
                val only = on && shown.size == 1
                val box = android.widget.CheckBox(a)
                box.text = s.label
                box.isChecked = on
                box.isEnabled = !only
                box.setTextColor(UI.color(a, if (only) R.color.muted else R.color.ink))
                box.buttonTintList = android.content.res.ColorStateList.valueOf(UI.color(a, R.color.brand))
                box.minimumHeight = UI.dp(a, 48)
                box.contentDescription = joinParts(listOf(L.t("hood.chart_show"), s.label, if (only) L.t("hood.chart_only_one") else null))
                box.setOnCheckedChangeListener { _, checked ->
                    if (checked) seriesOff.remove(s.key) else seriesOff.add(s.key)
                    box.announceForAccessibility(
                        L.t(if (checked) "hood.chart_series_on" else "hood.chart_series_off", "name" to s.label),
                    )
                    body.removeAllViews()
                    chart(a, body, chartNameKey, drawable, tables)
                }
                val row = LinearLayout(a)
                row.orientation = LinearLayout.HORIZONTAL
                row.gravity = android.view.Gravity.CENTER_VERTICAL
                row.addView(box)
                row.addView(swatch(a, toneColor(a, s.tone), s.tone))
                card.addView(row)
            }
            if (shown.size == 1) card.addView(UI.text(a, L.t("hood.chart_only_one"), 14f, R.color.muted, topDp = 2))
        }
        card.addView(UI.text(a, hoodChartSummary(m) { k, args -> L.t(k, args) }, 14f, R.color.muted, topDp = 10))
        body.addView(card)
        // With TalkBack on, the table stays under the picture: it is the source of truth and is never hidden.
        if (touchExploration(a)) tables(body)
    }

    /** The three chart colours: the web's `--chart-a`, `--chart-b`, `--chart-c`, stepped for each theme in colors.xml. */
    private fun toneColor(a: MainActivity, tone: HoodTone): Int = UI.color(
        a,
        when (tone) { HoodTone.A -> R.color.chart_a; HoodTone.B -> R.color.chart_b; HoodTone.C -> R.color.chart_c },
    )

    /** The series' own marker, drawn at key size. */
    private fun swatch(a: MainActivity, color: Int, tone: HoodTone): View {
        val v = HoodKeySwatch(a, color, tone)
        val p = LinearLayout.LayoutParams(UI.dp(a, 16), UI.dp(a, 16))
        p.marginEnd = UI.dp(a, 8)
        p.marginStart = UI.dp(a, 2)
        v.layoutParams = p
        return v
    }

    /** Whether a screen reader is exploring by touch, which is when the tables stay under the pictures. */
    private fun touchExploration(a: MainActivity): Boolean {
        val m = a.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager
        return m?.isTouchExplorationEnabled == true
    }

    // ---- "Building, and whether people can stay" ---------------------------------------------------------------

    /**
     * Home sales and building permits in **one** panel, always (docs/13 honesty rule 8): investment without staying
     * power is displacement, and neither table can be photographed without the other without effort.
     */
    private fun moneyPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.money_head")))
        col.addView(UI.text(a, L.t("hood.money_lede"), 16f, R.color.ink))
        yearGroup(
            a, col, "hood.chart_name_money",
            listOf(
                HoodSeries("sales", HoodTone.A, L.t("hood.sales"), hoodChartSeries(h, d) { it.sales }),
                HoodSeries("permits", HoodTone.B, L.t("hood.permits"), hoodChartSeries(h, d) { it.permits }),
            ),
        ) { into ->
            yearTable(
                a, into, L.t("hood.sales_caption"), L.t("hood.median"), L.t("hood.sales"), L.t("hood.too_few"),
                hoodYearRows(h, d, { it.medianPrice }, count = { it.sales }),
            ) { hoodMoney(it) }
            yearTable(
                a, into, L.t("hood.permits_caption"), L.t("hood.permit_cost"), L.t("hood.permits"), L.t("hood.none_recorded"),
                hoodYearRows(h, d, { it.permitCost }, count = { it.permits }),
            ) { hoodBigMoney(it) }
        }
        col.addView(UI.text(a, L.t("hood.money_note"), 14f, R.color.muted, topDp = 10))
        col.addView(UI.text(a, L.t("hood.small_numbers"), 14f, R.color.muted, topDp = 6))
        // Where the prices went: the picture counts homes and permits, the table keeps the money. It appears and
        // disappears with the choice, so it is registered alongside the panels rather than fixed at build time.
        val moneyNote = UI.text(a, L.t("hood.chart_money_note"), 14f, R.color.muted, topDp = 6)
        fun syncMoneyNote() {
            moneyNote.visibility = if (MapModel.hoodView(a) == HoodViewChoice.CHART) View.VISIBLE else View.GONE
        }
        syncMoneyNote()
        yearGroups.add { syncMoneyNote() }
        col.addView(moneyNote)
        if (d.sources["rentals"] != null) {
            col.addView(
                pairRow(
                    a, L.t("hood.rentals"), per1000(h.now?.rentalCerts, h.parcels),
                    cityPer1000(d.cityNow?.rentalCerts, d.cityParcels),
                ),
            )
            col.addView(UI.text(a, L.t("hood.rentals_note"), 14f, R.color.muted, topDp = 6))
        }
    }

    // ---- "Conditions" --------------------------------------------------------------------------------------------

    /**
     * "Conditions": what the City recorded here, grouped into charts that share a unit and a meaning — the same four
     * groups as the web's `conditionsPanel` and the iPhone's: blight tickets and buildings torn down (two counts on
     * one axis, each switchable); problems reported (a count); time to close (DAYS, its own small chart, never a
     * second axis); building fires (a count). Each has a one-sentence lede saying what the number is and where it
     * comes from; ONE Table | Chart control covers the panel; an "at a glance" row of the latest year's figures sits
     * above the charts; a series the City has not published for this neighborhood says so in one sentence.
     */
    private fun conditionsPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        if (d.sources["blight"] == null) return
        col.addView(UI.sectionHead(a, L.t("hood.cond_head")))
        col.addView(UI.text(a, L.t("hood.cond_lede"), 16f, R.color.ink))
        glance(a, col, h, d)

        val blight = HoodSeries("blight", HoodTone.A, L.t("hood.blight_tickets"), hoodChartSeries(h, d) { it.blight })
        val demo = HoodSeries("demo", HoodTone.B, L.t("hood.demolitions"), hoodChartSeries(h, d) { it.demolitions })
        val issues = HoodSeries("issues", HoodTone.A, L.t("hood.issues_reported"), hoodChartSeries(h, d) { it.issues })
        val days = HoodSeries("days", HoodTone.A, L.t("hood.issue_days"), hoodDaysSeries(h, d), HoodUnit.DAYS)
        val fires = HoodSeries("fires", HoodTone.A, L.t("hood.fires_short"), hoodChartSeries(h, d) { it.fires })
        val hasFires = d.sources["fires"] != null
        val any = (listOf(blight, demo, issues, days) + if (hasFires) listOf(fires) else emptyList()).any { hoodChartable(it.points) }
        if (any) viewPicker(a, col)

        col.addView(sub(a, L.t("hood.cond_blight_head")))
        condGroup(a, col, "hood.chart_name_cond", "hood.cond_blight_lede", h, listOf(blight, demo)) { into ->
            yearTable(
                a, into, L.t("hood.blight_caption"), L.t("hood.blight_rate"), L.t("hood.blight"), L.t("hood.none_recorded"),
                hoodYearRows(h, d, { hoodRate(it.blight, h.parcels) }, { hoodRate(it.blight, d.cityParcels) }, { it.blight }),
            ) { hoodFixed(it, 0) }
            yearTable(
                a, into, L.t("hood.demo_caption"), L.t("hood.demolitions"), null, L.t("hood.none_recorded"),
                hoodYearRows(h, d, { it.demolitions?.value?.toDouble() }),
            ) { hoodNumber(it) }
        }
        col.addView(UI.text(a, L.t("hood.blight_note"), 14f, R.color.muted, topDp = 6))

        col.addView(sub(a, L.t("hood.cond_issues_head")))
        condGroup(a, col, "hood.chart_name_issues", "hood.cond_issues_lede", h, listOf(issues)) { into ->
            yearTable(
                a, into, L.t("hood.issues_caption"), L.t("hood.issue_days"), L.t("hood.issues"), L.t("hood.none_recorded"),
                hoodYearRows(h, d, { it.issueDays }, count = { it.issues }),
            ) { L.t("hood.days", "n" to hoodNumber(it)) }
        }
        col.addView(sub(a, L.t("hood.cond_days_head")))
        // The days table IS the problems table above (both columns are in it): in table view nothing is repeated,
        // and in chart view one line says where the numbers are.
        condGroup(a, col, "hood.chart_name_days", "hood.cond_days_lede", h, listOf(days)) { into ->
            if (MapModel.hoodView(a) == HoodViewChoice.CHART) into.addView(UI.text(a, L.t("hood.cond_days_table"), 14f, R.color.muted, topDp = 6))
        }
        col.addView(UI.text(a, L.t("hood.issues_note", "types" to d.issueTypes.joinToString(L.t("list.sep"))), 14f, R.color.muted, topDp = 6))

        if (hasFires) {
            col.addView(sub(a, L.t("hood.cond_fires_head")))
            condGroup(a, col, "hood.chart_name_fires", "hood.cond_fires_lede", h, listOf(fires)) { into ->
                yearTable(
                    a, into, L.t("hood.fire_caption"), L.t("hood.blight_rate"), L.t("hood.fires"), L.t("hood.none_recorded"),
                    hoodYearRows(h, d, { hoodRate(it.fires, h.parcels) }, { hoodRate(it.fires, d.cityParcels) }, { it.fires }),
                ) { hoodFixed(it, 1) }
            }
            col.addView(UI.text(a, L.t("hood.fire_note"), 14f, R.color.muted, topDp = 6))
            col.addView(UI.text(a, L.t("hood.fire_types"), 14f, R.color.muted, topDp = 6))
            col.addView(UI.text(a, d.fireTypes.joinToString(L.t("list.sep")), 14f, R.color.muted, topDp = 2))
        }
        col.addView(UI.text(a, L.t("hood.small_numbers"), 14f, R.color.muted, topDp = 8))
        if (d.sources["vacant"] != null) {
            val label = L.t(
                "hood.vacant",
                "from" to dateText(d.vacantPeriod?.first ?: ""),
                "to" to dateText(d.vacantPeriod?.second ?: ""),
            )
            col.addView(pairRow(a, label, per1000(h.now?.vacantReg, h.parcels), cityPer1000(d.cityNow?.vacantReg, d.cityParcels)))
            col.addView(UI.text(a, L.t("hood.vacant_note"), 14f, R.color.muted, topDp = 6))
        }
        if (d.sources["pavement"] != null) {
            val roads = h.now?.roads
            val value = when {
                roads == null -> L.t("hood.roads_none")
                roads.poorPct == null -> L.t("hood.roads_few")
                else -> L.t(
                    "hood.roads_pct",
                    "pct" to hoodNumber(roads.poorPct),
                    "miles" to hoodFixed(roads.miles ?: 0.0, 1),
                )
            }
            val cityPct = d.cityNow?.roads?.poorPct
            val label = L.t(
                "hood.roads",
                "from" to (d.roadsYears?.first?.toString() ?: ""),
                "to" to (d.roadsYears?.second?.toString() ?: ""),
            )
            col.addView(pairRow(a, label, value, if (cityPct == null) "" else L.t("hood.city_pct", "pct" to hoodNumber(cityPct))))
            col.addView(UI.text(a, L.t("hood.roads_note"), 14f, R.color.muted, topDp = 6))
        }
    }

    // ---- "Safe streets" -------------------------------------------------------------------------------------------

    /**
     * Plain counts of crashes over the years the panel names, with the whole-city number beside each one. No rate
     * (no denominator we can defend), no ranking, no colour that reads as a score, no comparison with another
     * neighborhood, and nothing about who was at fault (docs/13). Drawn only when the bundle carries the numbers.
     */
    /** One chart's worth of the Conditions panel: the lede, then the table or the chart — or, when the City has
     *  published nothing at all for this neighborhood in this series, one sentence saying so. */
    private fun condGroup(
        a: MainActivity,
        col: LinearLayout,
        chartNameKey: String,
        ledeKey: String,
        h: Hood,
        series: List<HoodSeries>,
        tables: (LinearLayout) -> Unit,
    ) {
        col.addView(UI.text(a, L.t(ledeKey), 15f, R.color.ink, topDp = 4))
        if (series.any { hoodAnyValue(it.points) }) {
            yearGroup(a, col, chartNameKey, series, showPicker = false, tables = tables)
        } else {
            val empty = UI.card(a, topDp = 8)
            empty.addView(UI.text(a, L.t("hood.cond_none", "name" to h.name), 15f, R.color.muted))
            col.addView(empty)
        }
    }

    /**
     * "At a glance": the latest year's figure for each Conditions series, and today's two numbers, as a row of
     * stat tiles above the charts. Label, when, value — one thing a screen reader reads per tile, the value in the
     * text ink (never a series colour), and no tile coloured by size: nothing here is a score.
     */
    private fun glance(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        val none = L.t("hood.none_recorded")
        val tiles = ArrayList<Triple<String, String, String>>()
        val y = hoodLatestYear(h, d, listOf({ it.blight }, { it.demolitions }, { it.issues }, { it.fires }))
        if (y != null) {
            val ys = h.year(y)
            val when_ = if (y.toIntOrNull() == d.partialYear) L.t("hood.so_far", "year" to y) else y
            tiles.add(Triple(L.t("hood.blight_tickets"), when_, hoodCountText(ys.blight) { L.t(it) }))
            tiles.add(Triple(L.t("hood.demolitions"), when_, hoodCountText(ys.demolitions) { L.t(it) }))
            tiles.add(Triple(L.t("hood.issues_reported"), when_, hoodCountText(ys.issues) { L.t(it) }))
            tiles.add(Triple(L.t("hood.issue_days"), when_, ys.issueDays?.let { L.t("hood.days", "n" to hoodNumber(it)) } ?: none))
            if (d.sources["fires"] != null) tiles.add(Triple(L.t("hood.fires_short"), when_, hoodCountText(ys.fires) { L.t(it) }))
        }
        if (d.sources["vacant"] != null) tiles.add(Triple(L.t("hood.vacant_short"), L.t("hood.glance_today"), hoodCountText(h.now?.vacantReg) { L.t(it) }))
        if (d.sources["pavement"] != null) {
            val roads = h.now?.roads
            val v = when {
                roads == null -> L.t("hood.roads_none")
                roads.poorPct == null -> L.t("hood.roads_few")
                else -> L.t("hood.roads_pct", "pct" to hoodNumber(roads.poorPct), "miles" to hoodFixed(roads.miles ?: 0.0, 1))
            }
            tiles.add(Triple(L.t("hood.roads_poor_short"), L.t("hood.glance_today"), v))
        }
        if (tiles.isEmpty()) return
        col.addView(sub(a, L.t("hood.glance")))
        // Two tiles a row at a plain text size, one at a large one, so a value is never squeezed.
        val perRow = if (stacked(a)) 1 else 2
        var row: LinearLayout? = null
        for ((i, t) in tiles.withIndex()) {
            if (i % perRow == 0) {
                row = LinearLayout(a)
                row.orientation = LinearLayout.HORIZONTAL
                val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                p.topMargin = UI.dp(a, 6)
                row.layoutParams = p
                col.addView(row)
            }
            val tile = UI.card(a, topDp = 0)
            val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            lp.marginEnd = if (i % perRow == perRow - 1) 0 else UI.dp(a, 6)
            tile.layoutParams = lp
            tile.isFocusable = true
            tile.contentDescription = joinParts(listOf(t.first, t.second, t.third))
            for ((view, _) in listOf(
                UI.text(a, t.first, 13f, R.color.muted) to 0,
                UI.text(a, t.second, 12f, R.color.muted, topDp = 1) to 0,
                UI.text(a, t.third, 20f, R.color.ink, bold = true, topDp = 2) to 0,
            )) {
                view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                tile.addView(view)
            }
            row!!.addView(tile)
        }
        // A last row with one tile in a two-tile grid keeps its half width, so the grid stays a grid.
        if (perRow == 2 && tiles.size % 2 == 1) {
            val filler = View(a)
            filler.layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
            row!!.addView(filler)
        }
    }

    private fun crashPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        val source = d.sources["crashes"] ?: return
        val crashes = h.crashes ?: return
        val years = d.crashYears ?: return
        col.addView(UI.sectionHead(a, L.t("hood.crash_head")))
        col.addView(
            UI.text(
                a,
                L.t("hood.crash_lede", "from" to years.first.toString(), "to" to years.second.toString()),
                16f, R.color.ink,
            ),
        )
        for ((key, pair) in listOf(
            "walk" to (crashes.walk to d.cityCrashes?.walk),
            "bike" to (crashes.bike to d.cityCrashes?.bike),
            "severe" to (crashes.severe to d.cityCrashes?.severe),
        )) {
            val city = pair.second?.value?.let { L.t("hood.crash_city", "count" to hoodNumber(it)) } ?: ""
            col.addView(pairRow(a, L.t("hood.crash_$key"), hoodCountText(pair.first) { L.t(it) }, city))
        }
        // The same crashes year by year — a table, or the same three-line chart every other year panel gets —
        // when the bundle carries the years (2026-09-22).
        val byYear = hoodCrashSeries(h.crashesByYear, L.t("hood.crash_walk_short"), L.t("hood.crash_bike_short"), L.t("hood.crash_severe_short"))
        if (byYear.isNotEmpty()) {
            col.addView(UI.text(a, L.t("hood.crash_years_lede"), 15f, R.color.ink, topDp = 8))
            yearGroup(a, col, "hood.chart_name_crashes", byYear) { into -> crashTable(a, into, h, years) }
        }
        col.addView(UI.text(a, L.t("hood.crash_note"), 14f, R.color.muted, topDp = 8))
        col.addView(
            UI.text(
                a,
                L.t("hood.crash_source", "source" to source.name, "records" to (d.crashRecordsFrom ?: "")),
                14f, R.color.muted, topDp = 6,
            ),
        )
        // SEMCOG asks for this sentence wherever their data is reproduced. It is theirs, so it stays in their
        // words — the same English on an Arabic, Bengali or Spanish screen — and it is marked English so a screen
        // reader says it in an English voice (WCAG 3.1.2). Never machine translated (CLAUDE.md).
        val notice = UI.text(a, SEMCOG_NOTICE, 13f, R.color.muted, topDp = 6)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            notice.textLocale = java.util.Locale.US
        }
        col.addView(notice)
    }

    /** The crashes by year: walking, biking, killed or badly hurt, one row per year and the window total last. */
    private fun crashTable(a: MainActivity, col: LinearLayout, h: Hood, years: Pair<Int, Int>) {
        val heads = listOf(L.t("hood.crash_walk_short"), L.t("hood.crash_bike_short"), L.t("hood.crash_severe_short"))
        fun cells(c: HoodCrashes?) = listOf(c?.walk, c?.bike, c?.severe).map { hoodCountText(it) { k -> L.t(k) } }
        val rows = h.crashesByYear.keys.sorted().map { it to cells(h.crashesByYear[it]) } +
            listOfNotNull(h.crashes?.let { L.t("hood.crash_total", "from" to years.first.toString(), "to" to years.second.toString()) to cells(it) })
        val card = UI.card(a, topDp = 12)
        val cap = UI.text(a, L.t("hood.crash_caption"), 16f, R.color.ink, bold = true)
        heading(cap)
        card.addView(cap)
        val wide = !stacked(a)
        if (wide) {
            val header = LinearLayout(a)
            header.orientation = LinearLayout.HORIZONTAL
            header.setPaddingRelative(0, UI.dp(a, 6), 0, UI.dp(a, 4))
            header.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            for ((words, weight) in listOf(L.t("hood.year") to 3f) + heads.map { it to 2f }) {
                val t = UI.text(a, words, 13f, R.color.muted, bold = true)
                t.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight)
                header.addView(t)
            }
            card.addView(header)
        }
        for ((year, values) in rows) {
            val row = UI.column(a)
            row.setPaddingRelative(0, UI.dp(a, 8), 0, UI.dp(a, 8))
            row.isFocusable = true
            row.contentDescription = joinParts(listOf(year) + heads.zip(values).map { joinParts(listOf(it.first, it.second)) })
            if (wide) {
                val line = LinearLayout(a)
                line.orientation = LinearLayout.HORIZONTAL
                line.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                val y = UI.text(a, year, 15f, R.color.ink, bold = true)
                y.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 3f)
                line.addView(y)
                for (v in values) {
                    val t = UI.text(a, v, 15f, R.color.ink)
                    t.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f)
                    line.addView(t)
                }
                row.addView(line)
            } else {
                val stack = UI.column(a)
                stack.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                stack.addView(UI.text(a, year, 16f, R.color.ink, bold = true))
                for ((hd, v) in heads.zip(values)) stack.addView(UI.text(a, joinParts(listOf(hd, v)), 15f, R.color.ink, topDp = 2))
                row.addView(stack)
            }
            val divider = View(a)
            divider.setBackgroundColor(UI.color(a, R.color.line))
            divider.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, UI.dp(a, 1) / 2))
            row.addView(divider)
            card.addView(row)
        }
        col.addView(card)
    }

    // ---- "Where these numbers come from" ---------------------------------------------------------------------------

    private fun sourcesPanel(a: MainActivity, col: LinearLayout, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.sources_head")))
        for (s in hoodSourceOrder(d)) {
            val line = joinParts(listOf(s.name, L.t("hood.updated", "date" to dateText(s.lastEdited))))
            if (s.url.isEmpty() || Net.webLink(s.url) == null) {
                col.addView(UI.text(a, line, 15f, R.color.ink, topDp = 6))
            } else {
                val card = UI.tappableCard(a, line) { a.openWeb(s.url) }
                card.addView(UI.text(a, s.name, 16f, R.color.ink))
                card.addView(UI.text(a, L.t("hood.updated", "date" to dateText(s.lastEdited)), 14f, R.color.muted, topDp = 2))
                col.addView(card)
            }
        }
        col.addView(UI.text(a, L.t("hood.source_ours"), 15f, R.color.ink, topDp = 8))
        col.addView(UI.text(a, L.t("hood.left_out"), 14f, R.color.muted, topDp = 8))
    }

    // ---- the pieces a panel is made of ------------------------------------------------------------------------------

    /** "0.5" of a mile, or a whole number of miles with no trailing zero. */
    private fun hoodMiles(n: Double): String =
        if (n == Math.floor(n)) hoodNumber(n) else hoodFixed(n, 1)

    /** A count as of today, with its rate per 1,000 lots when the count can be shown and the base defended. */
    private fun per1000(c: HoodCount?, parcels: Int?): String {
        if (c == null) return L.t("hood.none_recorded")
        val r = hoodRate(c, parcels) ?: return hoodNumber(c.value)
        return L.t("hood.per_1000", "count" to hoodNumber(c.value), "rate" to hoodRateText(r))
    }

    private fun cityPer1000(c: HoodCount?, parcels: Int?): String {
        val r = hoodRate(c, parcels) ?: return ""
        return L.t("hood.city_per_1000", "rate" to hoodRateText(r))
    }

    /**
     * One label and its number, as one thing a screen reader reads: "City parks, 4". The two TextViews inside are
     * not announced again, so nothing is read twice and the number is never read on its own with no label.
     *
     * At a large text size the pair stacks, so a long label and a long number never fight over one line and neither
     * is ever cut short.
     */
    private fun pairRow(a: MainActivity, label: String, value: String, note: String = ""): View {
        val row = UI.column(a)
        row.setPaddingRelative(UI.dp(a, 4), UI.dp(a, 8), UI.dp(a, 4), UI.dp(a, 8))
        row.isFocusable = true
        row.contentDescription = joinParts(listOf(label, value, note))
        val wide = !stacked(a)
        val line = if (wide) LinearLayout(a).also { it.orientation = LinearLayout.HORIZONTAL } else row
        val name = UI.text(a, label, 16f, R.color.ink)
        val number = UI.text(a, value, 16f, R.color.ink, bold = true, topDp = if (wide) 0 else 2)
        if (wide) {
            name.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 3f)
            number.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f)
            line.addView(name)
            line.addView(number)
            row.addView(line)
        } else {
            row.addView(name)
            row.addView(number)
        }
        name.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        number.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        if (note.isNotEmpty()) {
            val small = UI.text(a, note, 14f, R.color.muted, topDp = 2)
            small.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            row.addView(small)
        }
        val divider = View(a)
        divider.setBackgroundColor(UI.color(a, R.color.line))
        divider.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, UI.dp(a, 1) / 2))
        row.addView(divider)
        return row
    }

    /**
     * One table of years.
     *
     * **Every row is one thing a screen reader reads**, label and number together: "2023, Homes sold 14, Permits 9,
     * Whole city 118". A table read cell by cell, with the headings somewhere above, is a table nobody can follow
     * without sight. At a large text size each row stacks into label-and-number lines instead of columns, so no
     * number is ever squeezed or cut off.
     *
     * The bar is a picture of the number written beside it and nothing else: it is measured against the biggest year
     * in this one table, never against another neighborhood, and it carries no colour that reads as good or bad.
     */
    private fun yearTable(
        a: MainActivity,
        col: LinearLayout,
        caption: String,
        head: String,
        countHead: String?,
        missing: String,
        rows: List<HoodYearRow>,
        fmt: (Double) -> String,
    ) {
        val card = UI.card(a, topDp = 12)
        val cap = UI.text(a, caption, 16f, R.color.ink, bold = true)
        heading(cap)
        card.addView(cap)
        val wide = !stacked(a)
        if (wide) {
            val header = LinearLayout(a)
            header.orientation = LinearLayout.HORIZONTAL
            header.setPaddingRelative(0, UI.dp(a, 6), 0, UI.dp(a, 4))
            header.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            for ((words, weight) in listOfNotNull(
                L.t("hood.year") to 2f,
                head to 3f,
                countHead?.let { it to 2f },
                L.t("hood.city") to 2f,
            )) {
                val t = UI.text(a, words, 13f, R.color.muted, bold = true)
                t.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight)
                header.addView(t)
            }
            card.addView(header)
        }

        for (r in rows) {
            val year = if (r.soFar) L.t("hood.so_far", "year" to r.year) else r.year
            val value = r.value?.let { fmt(it) } ?: missing
            val count = if (countHead == null) null else hoodCountText(r.count) { L.t(it) }
            val city = r.cityValue?.let { fmt(it) } ?: ""
            val row = UI.column(a)
            row.setPaddingRelative(0, UI.dp(a, 8), 0, UI.dp(a, 8))
            row.isFocusable = true
            row.contentDescription = joinParts(
                listOf(
                    year,
                    joinParts(listOf(head, value)),
                    if (count == null) null else joinParts(listOf(countHead, count)),
                    if (city.isEmpty()) null else joinParts(listOf(L.t("hood.city"), city)),
                ),
            )
            if (wide) {
                val line = LinearLayout(a)
                line.orientation = LinearLayout.HORIZONTAL
                line.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                fun cell(words: String, weight: Float, bold: Boolean = false): View {
                    val t = UI.text(a, words, 15f, if (bold) R.color.ink else R.color.muted, bold = bold)
                    t.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight)
                    return t
                }
                line.addView(cell(year, 2f, bold = true))
                line.addView(cell(value, 3f, bold = r.value != null))
                if (count != null) line.addView(cell(count, 2f))
                line.addView(cell(city, 2f))
                row.addView(line)
                if (r.value != null) row.addView(bar(a, r.bar))
            } else {
                val stack = UI.column(a)
                stack.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                stack.addView(UI.text(a, year, 16f, R.color.ink, bold = true))
                stack.addView(UI.text(a, joinParts(listOf(head, value)), 15f, R.color.ink, topDp = 2))
                if (count != null) stack.addView(UI.text(a, joinParts(listOf(countHead, count)), 15f, R.color.muted, topDp = 2))
                if (city.isNotEmpty()) stack.addView(UI.text(a, joinParts(listOf(L.t("hood.city"), city)), 15f, R.color.muted, topDp = 2))
                row.addView(stack)
            }
            val divider = View(a)
            divider.setBackgroundColor(UI.color(a, R.color.line))
            divider.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, UI.dp(a, 1) / 2))
            row.addView(divider)
            card.addView(row)
        }
        col.addView(card)
    }

    /** The bar: a picture of the number beside it, never announced, never the only thing that says it. */
    private fun bar(a: MainActivity, width: Double): View {
        val line = LinearLayout(a)
        line.orientation = LinearLayout.HORIZONTAL
        line.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, UI.dp(a, 4))
        p.topMargin = UI.dp(a, 4)
        line.layoutParams = p
        val filled = View(a)
        filled.setBackgroundColor(UI.color(a, R.color.brand))
        filled.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, width.toFloat())
        line.addView(filled)
        val rest = View(a)
        rest.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, (1.0 - width).toFloat())
        line.addView(rest)
        return line
    }
}

// ---- a year panel drawn as a picture (docs/13, 2026-09-22) -----------------------------------------------------

/**
 * The whole chart: one pair of axes, one line per series switched on, and a point at every year with a value. A
 * plain [View] with a [Canvas] and no library at all, like every other drawing in this app (the map, the outline
 * above).
 *
 * **TalkBack gets a node per point**, not one picture: "2023, Homes sold: 14", "2022, Time to close: 40 days",
 * through the platform [AccessibilityNodeProvider] — the same mechanism MapView uses, for the same reason (there
 * is no AndroidX here). The table is still on the screen under it whenever TalkBack is running.
 *
 * A year with nothing recorded is a break in the line, never a zero. Each series is told apart three ways at once:
 * its colour, its point (circle, diamond, square) and its line (solid, dashed, dash-dot).
 */
private class HoodChartView(
    context: Context,
    private val model: HoodChartModel,
    private val colorOf: (HoodTone) -> Int,
) : View(context) {

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val ink = Paint(Paint.ANTI_ALIAS_FLAG)
    private val nodes = Nodes()
    private var accessibilityFocus = Int.MIN_VALUE
    /** Every point on the chart, in reading order, with where it was last drawn — for the TalkBack nodes. */
    private val marks = ArrayList<Pair<HoodSeriesModel, HoodPlotPoint>>()
    private val boxes = ArrayList<Rect>()

    init {
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = L.t(if (model.unit == HoodUnit.DAYS) "hood.chart_plot_days" else "hood.chart_plot")
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        // Taller at a large font scale, because the year labels and the tick labels grow with the text.
        val scale = resources.configuration.fontScale.coerceIn(1f, 2f)
        setMeasuredDimension(w, (resources.displayMetrics.density * 130f * scale).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        marks.clear()
        boxes.clear()
        val dp = resources.displayMetrics.density
        val text = 12f * dp * resources.configuration.fontScale.coerceIn(1f, 2f)
        ink.textSize = text
        val gutter = ink.measureText(hoodNumber(model.top)) + 6f * dp
        val bottom = height - (text + 6f * dp)
        val plot = bottom - 6f * dp
        val left = gutter + 8f * dp
        val right = width - 8f * dp

        // The grid: hairline, solid, one step off the surface. The data is the only loud thing on here.
        stroke.strokeWidth = 1f * dp
        stroke.pathEffect = null
        stroke.color = UI.color(context, R.color.line)
        ink.color = UI.color(context, R.color.muted)
        ink.textAlign = Paint.Align.RIGHT
        for (t in model.ticks) {
            val y = bottom - (t.toFloat() / model.top) * plot
            canvas.drawLine(gutter, y, right, y, stroke)
            canvas.drawText(hoodNumber(t), gutter - 4f * dp, y + text * 0.35f, ink)
        }

        val n = maxOf(1, model.years.size)
        fun xOf(i: Int) = if (n == 1) (left + right) / 2f else left + i * (right - left) / (n - 1)
        fun yOf(frac: Double) = bottom - (frac * plot).toFloat()

        // The lines first, so the points sit on top of them.
        for (s in model.series) {
            stroke.color = colorOf(s.tone)
            stroke.strokeWidth = 2f * dp
            stroke.pathEffect = when (s.tone) {
                HoodTone.A -> null
                HoodTone.B -> android.graphics.DashPathEffect(floatArrayOf(7f * dp, 4f * dp), 0f)
                HoodTone.C -> android.graphics.DashPathEffect(floatArrayOf(7f * dp, 3f * dp, 1.5f * dp, 3f * dp), 0f)
            }
            for (g in s.segments) {
                val a = s.points[g.from]
                val b = s.points[g.to]
                canvas.drawLine(xOf(a.index), yOf(a.frac), xOf(b.index), yOf(b.frac), stroke)
            }
        }
        stroke.pathEffect = null

        val r = 4f * dp
        for (s in model.series) {
            for (p in s.points) {
                if (p.kind == HoodPointKind.NONE) continue
                val x = xOf(p.index)
                val y = yOf(p.frac)
                fill.color = colorOf(s.tone)
                drawMarker(canvas, s.tone, x, y, r, fill)
                marks.add(s to p)
                // A touch target a finger can find, not the 8dp dot itself.
                val pad = 14f * dp
                boxes.add(Rect((x - pad).toInt(), (y - pad).toInt(), (x + pad).toInt(), (y + pad).toInt()))
            }
        }

        // The years under the axis, thinned so none is drawn over its neighbour, and never off the edge.
        var shown = hoodAxisYears(model.years)
        if (resources.configuration.fontScale > 1.3f && shown.size > 3) {
            shown = listOf(shown.first(), shown[shown.size / 2], shown.last())
        }
        ink.textAlign = Paint.Align.CENTER
        for ((i, y) in model.years.withIndex()) {
            if (y !in shown) continue
            val half = ink.measureText(y) / 2f
            canvas.drawText(y, xOf(i).coerceIn(half + 1f * dp, width - half - 1f * dp), height - 2f * dp, ink)
        }
        // The axis itself, over the feet of everything.
        stroke.color = UI.color(context, R.color.muted)
        stroke.strokeWidth = 1f * dp
        canvas.drawLine(gutter, bottom, right, bottom, stroke)
    }

    override fun getAccessibilityNodeProvider(): AccessibilityNodeProvider = nodes

    /** One virtual node per point, in the order the series and years run. */
    private inner class Nodes : AccessibilityNodeProvider() {

        private val host = View.NO_ID

        override fun createAccessibilityNodeInfo(virtualViewId: Int): AccessibilityNodeInfo? {
            if (virtualViewId == host) {
                val node = AccessibilityNodeInfo.obtain(this@HoodChartView)
                onInitializeAccessibilityNodeInfo(node)
                for (i in marks.indices) node.addChild(this@HoodChartView, i)
                return node
            }
            val mark = marks.getOrNull(virtualViewId) ?: return null
            val node = AccessibilityNodeInfo.obtain(this@HoodChartView, virtualViewId)
            node.packageName = context.packageName
            node.className = TextView::class.java.name
            node.contentDescription = hoodPointText(mark.second, mark.first.label, { k, args -> L.t(k, args) }, model.unit)
            node.setParent(this@HoodChartView)
            node.setSource(this@HoodChartView, virtualViewId)
            node.isEnabled = true
            node.isFocusable = true
            node.isVisibleToUser = true
            node.addAction(
                if (accessibilityFocus == virtualViewId) {
                    AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS
                } else {
                    AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS
                },
            )
            node.isAccessibilityFocused = accessibilityFocus == virtualViewId
            val r = boxes.getOrNull(virtualViewId) ?: Rect(0, 0, width, height)
            @Suppress("DEPRECATION")
            node.setBoundsInParent(r)
            val offset = IntArray(2)
            getLocationOnScreen(offset)
            node.setBoundsInScreen(Rect(r.left + offset[0], r.top + offset[1], r.right + offset[0], r.bottom + offset[1]))
            return node
        }

        override fun performAction(virtualViewId: Int, action: Int, arguments: android.os.Bundle?): Boolean {
            if (virtualViewId == host) return performAccessibilityAction(action, arguments)
            if (marks.getOrNull(virtualViewId) == null) return false
            return when (action) {
                AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS -> {
                    accessibilityFocus = virtualViewId
                    send(virtualViewId, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED)
                    true
                }
                AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS -> {
                    if (accessibilityFocus != virtualViewId) return false
                    accessibilityFocus = Int.MIN_VALUE
                    send(virtualViewId, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED)
                    true
                }
                else -> false
            }
        }

        private fun send(id: Int, type: Int) {
            if (!isShown) return
            val event = AccessibilityEvent.obtain(type)
            event.packageName = context.packageName
            event.className = TextView::class.java.name
            event.setSource(this@HoodChartView, id)
            parent?.requestSendAccessibilityEvent(this@HoodChartView, event)
        }
    }
}

/** The series' own point: a circle for A, a diamond for B, a square for C — a different SHAPE, not only a hue. */
private fun drawMarker(canvas: Canvas, tone: HoodTone, x: Float, y: Float, r: Float, paint: Paint) {
    when (tone) {
        HoodTone.A -> canvas.drawCircle(x, y, r, paint)
        HoodTone.B -> {
            val path = Path()
            path.moveTo(x, y - r); path.lineTo(x + r, y); path.lineTo(x, y + r); path.lineTo(x - r, y); path.close()
            canvas.drawPath(path, paint)
        }
        HoodTone.C -> canvas.drawRect(x - r * 0.9f, y - r * 0.9f, x + r * 0.9f, y + r * 0.9f, paint)
    }
}

/**
 * The little shape beside a line of the key: the series' own marker, drawn rather than described, so the key looks
 * like the picture it explains — a circle for the first line, a diamond for the second, a square for the third.
 */
private class HoodKeySwatch(
    context: Context,
    private val color: Int,
    private val tone: HoodTone,
) : View(context) {

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val dp = resources.displayMetrics.density
        val r = minOf(width, height) / 2f - 1.5f * dp
        fill.color = color
        drawMarker(canvas, tone, width / 2f, height / 2f, r, fill)
    }
}
