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
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
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
        col.addView(UI.text(a, L.t("hood.mine_note"), 14f, R.color.muted, topDp = 6))
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
            if (found.size == 1) L.t("hood.find_one") else L.t("hood.find_count", "count" to hoodNumber(found.size, L.locale())),
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
        HoodRepo.onChange = { a.render() }
        HoodRepo.want(a.store)
        val d = HoodRepo.data
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
            col.addView(card)
        }
        val miles = hoodMiles(d.nearMiles)
        col.addView(
            UI.text(
                a,
                if (h.help.total == 1) L.t("hood.help_count_one", "miles" to miles)
                else L.t("hood.help_count", "count" to hoodNumber(h.help.total, L.locale()), "miles" to miles),
                16f, R.color.ink, topDp = 8,
            ),
        )
        for ((category, n) in h.help.by) {
            if (n <= 0) continue
            col.addView(pairRow(a, L.t(hoodCategoryKey(category)), hoodNumber(n, L.locale())))
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
            val value = L.t("miles", "miles" to String.format(L.locale(), "%.1f", mi))
            // The row opens the listing that distance belongs to, when this phone can find it — the same
            // arithmetic on the same signed data as the pipeline's (nearestListing). The number shown is always
            // the bundle's, so a page never states a distance the web would not.
            val row = nearestListing(a, h, kind)
            if (row == null) {
                col.addView(pairRow(a, label, value))
            } else {
                val card = UI.tappableCard(a, joinParts(listOf(label, row.name, value))) {
                    a.push(Route.Detail(row.id, row.category))
                }
                card.addView(UI.text(a, label, 16f, R.color.muted))
                card.addView(UI.text(a, row.name, 17f, R.color.ink, bold = true, topDp = 2))
                card.addView(UI.text(a, value, 15f, R.color.muted, topDp = 2))
                col.addView(card)
            }
        }

        col.addView(sub(a, L.t("hood.places_head", "miles" to miles)))
        col.addView(pairRow(a, L.t("hood.parks"), hoodNumber(h.places.parks, L.locale())))
        col.addView(pairRow(a, L.t("hood.rec_centers"), hoodNumber(h.places.recCenters, L.locale())))
        col.addView(pairRow(a, L.t("hood.greenway_open"), hoodNumber(h.places.greenwayOpen, L.locale())))
        h.places.snapStores?.let { col.addView(pairRow(a, L.t("hood.snap_stores"), hoodNumber(it, L.locale()))) }
        h.places.busStops?.let { col.addView(pairRow(a, L.t("hood.bus_stops"), hoodNumber(it, L.locale()))) }

        val nc = h.nearestCity ?: return
        col.addView(sub(a, L.t("hood.city_near_head")))
        for ((key, mi) in listOf("snap" to nc.snap, "grocery" to nc.grocery, "bus" to nc.bus)) {
            val value = if (mi == null) L.t("hood.none_found") else L.t("miles", "miles" to String.format(L.locale(), "%.1f", mi))
            col.addView(pairRow(a, L.t("hood.near.$key"), value))
        }
        col.addView(UI.text(a, L.t("hood.snap_note"), 14f, R.color.muted, topDp = 8))
    }

    /**
     * The listing the "nearest listed" row is about, found on this phone from the same signed list and the same
     * straight-line distance the pipeline used (`NEAREST` in pipeline/src/indicators.ts).
     *
     * A row is offered only when what this phone finds rounds to the very number the bundle published, so a tap can
     * never lead somewhere the printed distance does not describe. Sensitive and domestic-violence listings can
     * never be found here — they carry no coordinates at all (docs/08) — and are refused by name as well, so a DV
     * row can never appear on this panel and no distance to one can ever be drawn.
     */
    private fun nearestListing(a: MainActivity, h: Hood, kind: String): BundleRow? {
        val want = h.help.nearestMiles[kind] ?: return null
        val category = HOOD_NEAREST_CATEGORY[kind] ?: return null
        val rows = a.store.bundle?.rows ?: return null
        var best: BundleRow? = null
        var bestMiles = Double.MAX_VALUE
        for (r in rows) {
            if (r.status != "active") continue
            if (isSensitive(r.category) || isPrivate(r.category)) continue
            if (r.category != category && !r.category.startsWith("$category.")) continue
            val lat = r.lat ?: continue
            val lon = r.lon ?: continue
            val mi = miles(h.center, LatLon(lat, lon))
            if (mi < bestMiles) {
                bestMiles = mi
                best = r
            }
        }
        if (best == null) return null
        return if (Math.abs(Math.round(bestMiles * 10) / 10.0 - want) < 0.05) best else null
    }

    /** The categories the four "nearest listed" rows count, as pipeline/src/indicators.ts names them. */
    private val HOOD_NEAREST_CATEGORY = mapOf(
        "food" to "food", "clinic" to "health.clinic", "narcan" to "harm", "indoors" to "rec",
    )

    // ---- "Building, and whether people can stay" ---------------------------------------------------------------

    /**
     * Home sales and building permits in **one** panel, always (docs/13 honesty rule 8): investment without staying
     * power is displacement, and neither table can be photographed without the other without effort.
     */
    private fun moneyPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        col.addView(UI.sectionHead(a, L.t("hood.money_head")))
        col.addView(UI.text(a, L.t("hood.money_lede"), 16f, R.color.ink))
        yearTable(
            a, col, L.t("hood.sales_caption"), L.t("hood.median"), L.t("hood.sales"), L.t("hood.too_few"),
            hoodYearRows(h, d, { it.medianPrice }, count = { it.sales }),
        ) { hoodMoney(it, L.locale()) }
        yearTable(
            a, col, L.t("hood.permits_caption"), L.t("hood.permit_cost"), L.t("hood.permits"), L.t("hood.too_few_permits"),
            hoodYearRows(h, d, { it.permitCost }, count = { it.permits }),
        ) { bigMoney(it) }
        col.addView(UI.text(a, L.t("hood.money_note"), 14f, R.color.muted, topDp = 10))
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

    private fun conditionsPanel(a: MainActivity, col: LinearLayout, h: Hood, d: Indicators) {
        if (d.sources["blight"] == null) return
        col.addView(UI.sectionHead(a, L.t("hood.cond_head")))
        col.addView(UI.text(a, L.t("hood.cond_lede"), 16f, R.color.ink))
        yearTable(
            a, col, L.t("hood.blight_caption"), L.t("hood.blight_rate"), L.t("hood.blight"), L.t("hood.too_few_permits"),
            hoodYearRows(h, d, { hoodRate(it.blight, h.parcels) }, { hoodRate(it.blight, d.cityParcels) }, { it.blight }),
        ) { String.format(L.locale(), "%.0f", it) }
        col.addView(UI.text(a, L.t("hood.blight_note"), 14f, R.color.muted, topDp = 6))
        yearTable(
            a, col, L.t("hood.demo_caption"), L.t("hood.demolitions"), null, L.t("hood.lt5_or_none"),
            hoodYearRows(h, d, { it.demolitions?.value?.toDouble() }),
        ) { hoodNumber(it, L.locale()) }
        yearTable(
            a, col, L.t("hood.issues_caption"), L.t("hood.issue_days"), L.t("hood.issues"), L.t("hood.too_few_permits"),
            hoodYearRows(h, d, { it.issueDays }, count = { it.issues }),
        ) { L.t("hood.days", "n" to hoodNumber(it, L.locale())) }
        col.addView(UI.text(a, L.t("hood.issues_note", "types" to d.issueTypes.joinToString(L.t("list.sep"))), 14f, R.color.muted, topDp = 6))

        if (d.sources["fires"] != null) {
            yearTable(
                a, col, L.t("hood.fire_caption"), L.t("hood.blight_rate"), L.t("hood.fires"), L.t("hood.too_few_permits"),
                hoodYearRows(h, d, { hoodRate(it.fires, h.parcels) }, { hoodRate(it.fires, d.cityParcels) }, { it.fires }),
            ) { String.format(L.locale(), "%.1f", it) }
            col.addView(UI.text(a, L.t("hood.fire_note"), 14f, R.color.muted, topDp = 6))
            col.addView(UI.text(a, L.t("hood.fire_types"), 14f, R.color.muted, topDp = 6))
            col.addView(UI.text(a, d.fireTypes.joinToString(L.t("list.sep")), 14f, R.color.muted, topDp = 2))
        }
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
                    "pct" to hoodNumber(roads.poorPct, L.locale()),
                    "miles" to String.format(L.locale(), "%.1f", roads.miles ?: 0.0),
                )
            }
            val cityPct = d.cityNow?.roads?.poorPct
            val label = L.t(
                "hood.roads",
                "from" to (d.roadsYears?.first?.toString() ?: ""),
                "to" to (d.roadsYears?.second?.toString() ?: ""),
            )
            col.addView(pairRow(a, label, value, if (cityPct == null) "" else L.t("hood.city_pct", "pct" to hoodNumber(cityPct, L.locale()))))
            col.addView(UI.text(a, L.t("hood.roads_note"), 14f, R.color.muted, topDp = 6))
        }
    }

    // ---- "Safe streets" -------------------------------------------------------------------------------------------

    /**
     * Plain counts of crashes over the years the panel names, with the whole-city number beside each one. No rate
     * (no denominator we can defend), no ranking, no colour that reads as a score, no comparison with another
     * neighborhood, and nothing about who was at fault (docs/13). Drawn only when the bundle carries the numbers.
     */
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
            val city = pair.second?.value?.let { L.t("hood.crash_city", "count" to hoodNumber(it, L.locale())) } ?: ""
            col.addView(pairRow(a, L.t("hood.crash_$key"), hoodCountText(pair.first, L.locale()) { L.t(it) }, city))
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

    /** Half a mile, written as the reader's language writes a half. */
    private fun hoodMiles(n: Double): String =
        if (n == Math.floor(n)) hoodNumber(n, L.locale()) else String.format(L.locale(), "%.1f", n)

    /**
     * "$1.2 million" — the same compact wording the web's `bigMoney` prints.
     *
     * Android's own ICU does this, and only Android's: `java.text` has no compact format on a JDK 17, so this one
     * line lives here rather than in Hoods.kt, which `:core` compiles. The **rule** it follows is in `:core` and is
     * tested there — [hoodMoneyLocale] decides which language writes the amount, so a language that would put the
     * dollar sign at the far end gets the one that does not, exactly as on the web. Below Android 7 there is no
     * compact format at all and the amount is written out in full, which is longer but never wrong.
     */
    private fun bigMoney(n: Double): String {
        val locale = hoodMoneyLocale(L.locale())
        return try {
            val f = android.icu.text.CompactDecimalFormat.getInstance(
                locale, android.icu.text.CompactDecimalFormat.CompactStyle.LONG,
            )
            f.maximumFractionDigits = 1
            "$" + f.format(n)
        } catch (_: Throwable) {
            hoodMoney(n, L.locale())
        }
    }

    /** A count as of today, with its rate per 1,000 lots when the count can be shown and the base defended. */
    private fun per1000(c: HoodCount?, parcels: Int?): String {
        if (c == null) return L.t("hood.none_recorded")
        if (c.hidden) return L.t("hood.lt5")
        val r = hoodRate(c, parcels) ?: return hoodNumber(c.value!!, L.locale())
        return L.t("hood.per_1000", "count" to hoodNumber(c.value!!, L.locale()), "rate" to hoodRateText(r, L.locale()))
    }

    private fun cityPer1000(c: HoodCount?, parcels: Int?): String {
        val r = hoodRate(c, parcels) ?: return ""
        return L.t("hood.city_per_1000", "rate" to hoodRateText(r, L.locale()))
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
            val count = if (countHead == null) null else hoodCountText(r.count, L.locale()) { L.t(it) }
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
