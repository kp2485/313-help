// The Map tab: one map of the city, edge to edge, drawn on this phone from the signed bundle (docs/05 "Map tab").
// No tile server, no map company, nothing sent — and it works with no signal, from the snapshot inside the APK.
//
// The map is never the only way to reach a fact. "See this map as a list" shows everything that is switched on in
// words, every stretch and every dot is also a TalkBack node in reading order (MapView.Nodes), and a keyboard walks
// the same order with N and P. A picture that some people cannot see is an extra, never the answer.
package org.help313.app

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import org.help313.query.Query
import org.help313.query.Ranked
import org.help313.query.Segment
import org.help313.query.helpAlong
import org.help313.query.openNow
import org.help313.query.badge
import org.help313.query.rank

object MapScreen {

    // ---- the tab ---------------------------------------------------------------------------------------------

    fun tab(a: MainActivity): View {
        val root = FrameLayout(a)
        root.setBackgroundColor(UI.color(a, R.color.app_bg))

        val map = MapView(a)
        map.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        root.addView(map)

        val card = FrameLayout(a)
        val overlays = MapModel.overlays(a, a.store)
        map.overlays = overlays
        map.subway = MapModel.subwayScene(a, a.store)
        map.greenwayOn = MapModel.isOn(a, "place:greenway")
        map.parksOn = MapModel.isOn(a, "place:parks")
        map.here = a.near
        map.onSelect = { selection ->
            MapModel.selection = selection
            // A chosen route shows its stops: that asks for its network's stops layer and stops file, if not held.
            if (selection is MapSelection.Line) MapModel.loadNets(a, a.store)
            map.subway = MapModel.subwayScene(a, a.store)
            fillCard(a, card, selection, map.onSelect)
            map.invalidate()
        }

        val floating = controls(a, map)
        root.addView(floating)
        keepBadgesClearOf(a, map, floating, card)
        card.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM,
        )
        root.addView(card)
        fillCard(a, card, MapModel.selection, map.onSelect)

        // Everything the tab needs, read and decoded off the main thread; the screen redraws when it arrives.
        MapModel.onChange = {
            if (a.current() is Route.Map) {
                map.overlays = MapModel.overlays(a, a.store)
                map.subway = MapModel.subwayScene(a, a.store)
                map.invalidate()
            }
        }
        MapModel.load(a, a.store)
        return root
    }

    /**
     * The map's own controls count as taken space (docs/MAP-STYLE.md 7.5): every button and pill floating over the
     * canvas, and the open card, is handed to the map as a box in dp after each layout, and entered before any badge
     * or name is placed — so no route's name is ever drawn under a button.
     */
    private fun keepBadgesClearOf(a: MainActivity, map: MapView, controls: View, card: View) {
        val density = map.resources.displayMetrics.density.toDouble()
        fun collect(v: View, into: ArrayList<LabelRect>, origin: IntArray) {
            if (v.visibility != View.VISIBLE) return
            if (v is ViewGroup && v !== card) {
                for (i in 0 until v.childCount) collect(v.getChildAt(i), into, origin)
                return
            }
            if (v.width == 0 || v.height == 0 || (v !is android.widget.TextView && v !== card)) return
            val at = IntArray(2)
            v.getLocationInWindow(at)
            into.add(
                LabelRect(
                    (at[0] - origin[0] + v.width / 2.0) / density, (at[1] - origin[1] + v.height / 2.0) / density,
                    v.width / density, v.height / density,
                ),
            )
        }
        val listener = android.view.ViewTreeObserver.OnGlobalLayoutListener {
            val origin = IntArray(2)
            map.getLocationInWindow(origin)
            val boxes = ArrayList<LabelRect>()
            // The map runs under the status bar: the clock and the battery float over the canvas like any button.
            if (a.barTop > 0) boxes.add(LabelRect(map.width / 2.0 / density, a.barTop / 2.0 / density, map.width / density, a.barTop / density))
            collect(controls, boxes, origin)
            if ((card as ViewGroup).childCount > 0) collect(card, boxes, origin)
            if (boxes != map.controlBoxes) {
                map.controlBoxes = boxes
                map.invalidate()
            }
        }
        map.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) = v.viewTreeObserver.addOnGlobalLayoutListener(listener)
            override fun onViewDetachedFromWindow(v: View) = v.viewTreeObserver.removeOnGlobalLayoutListener(listener)
        })
    }

    /**
     * The floating controls. Real buttons, never smaller than 48 dp, each with a description a screen reader reads;
     * they mirror for Arabic because they are laid out in start/end terms, and the map underneath never mirrors —
     * Detroit would be back to front (docs/ACCESSIBILITY-AUDIT-2026-09-20).
     */
    private fun controls(a: MainActivity, map: MapView): View {
        val column = LinearLayout(a)
        column.orientation = LinearLayout.VERTICAL
        column.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        // The map runs under the status bar; the controls do not. MainActivity keeps the rest of the app clear of
        // the bars and hands the top inset over for this one screen.
        column.setPadding(UI.dp(a, 12), a.barTop + UI.dp(a, 8), UI.dp(a, 12), UI.dp(a, 8))
        column.clipToPadding = false

        val top = LinearLayout(a)
        top.orientation = LinearLayout.HORIZONTAL
        top.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        // "Urgent help" keeps its words: it is the one control here that must be unmistakable at a glance. The
        // others are a glyph and a full spoken label, because five sets of words across the top of a phone leave
        // no map to look at — and a squeezed row is how "Use my location" ended up off the screen entirely on the
        // first emulator run.
        top.addView(chip(a, L.t("strip.more")) { a.push(Route.Urgent) })
        val spacer = View(a)
        spacer.layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        top.addView(spacer)
        top.addView(chip(a, L.t("map.layers"), "▤") { a.push(Route.MapLayers) })
        top.addView(chip(a, L.t("map.list_title"), "≡") { a.push(Route.MapList) })
        column.addView(top)

        val middle = View(a)
        middle.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        column.addView(middle)

        if (MapModel.baseFailed) {
            column.addView(UI.pill(a, L.t("map.no_streets"), R.drawable.pill_warn, R.color.warn_ink))
        }
        MapModel.base?.edited?.takeIf { it.isNotEmpty() }?.let {
            // Who the streets and parks come from, over the map itself. The whole sentence — with what a drag and a
            // pinch do — is in "See this map as a list", where there is room for it. Not read out here: the map's
            // own description carries it.
            val note = UI.pill(a, L.t("map.source", "date" to dateText(it)), R.drawable.pill_soft, R.color.brand_soft_ink)
            note.maxLines = 2
            note.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            column.addView(note)
        }
        if (a.locationRefused) {
            column.addView(UI.pill(a, L.t("loc.denied"), R.drawable.pill_warn, R.color.warn_ink))
        }

        val bottom = LinearLayout(a)
        // A column down the end edge, not a row: four controls in a row do not fit at font scale 2.0, and a column
        // mirrors for Arabic on its own because nothing here is written in left or right.
        bottom.orientation = LinearLayout.VERTICAL
        bottom.gravity = Gravity.END
        bottom.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        bottom.addView(chip(a, L.t("map.zoom_in"), "+") { MapModel.zoom(1.6); map.invalidate() })
        bottom.addView(chip(a, L.t("map.zoom_out"), "−") { MapModel.zoom(1 / 1.6); map.invalidate() })
        bottom.addView(chip(a, L.t("map.reset"), "⊕") { MapModel.reset(); map.invalidate() })
        bottom.addView(
            chip(a, L.t("loc.use"), "◎") {
                // Asked for only on this tap, used on this phone, never written down and never sent (docs/08).
                a.askForLocation()
            },
        )
        column.addView(bottom)
        return column
    }

    /**
     * A floating control: a real Button, never smaller than 48 dp, with its own words for a screen reader whatever
     * it shows on its face. A glyph on the face is never the whole control — the description is what TalkBack,
     * Voice Access and Switch Access read, and it is the same sentence the web and the iPhone use.
     */
    private fun chip(a: MainActivity, label: String, short: String = label, onTap: () -> Unit): View {
        val b = UI.button(
            a, short, description = label,
            backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 0, onTap = onTap,
        )
        val p = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        p.marginStart = UI.dp(a, 6)
        p.topMargin = UI.dp(a, 6)
        b.layoutParams = p
        b.minWidth = UI.dp(a, UI.MIN_TAP_DP)
        b.maxLines = 2
        return b
    }

    // ---- the card a tap opens --------------------------------------------------------------------------------

    /**
     * Name, what it is, and a way in. It never covers the whole map, and the map keeps working behind it, so a
     * person can look at one place and then the next without dismissing anything.
     */
    private fun fillCard(a: MainActivity, host: FrameLayout, selection: MapSelection?, select: (MapSelection?) -> Unit) {
        host.removeAllViews()
        if (selection == null) return
        val card = UI.card(a)
        // A trunk by Rosa Parks Transit Center lists seventeen routes, and at the largest text size a route card is
        // tall too: the card scrolls inside itself and never takes more than half the map.
        val scroller = object : android.widget.ScrollView(a) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) = super.onMeasure(
                widthMeasureSpec,
                View.MeasureSpec.makeMeasureSpec(a.resources.displayMetrics.heightPixels / 2, View.MeasureSpec.AT_MOST),
            )
        }
        scroller.isFillViewport = true
        val p = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM,
        )
        p.setMargins(UI.dp(a, 12), 0, UI.dp(a, 12), UI.dp(a, 12))
        scroller.layoutParams = p
        scroller.addView(card)

        fun head(kind: String, name: String) {
            card.addView(UI.text(a, kind, 14f, R.color.muted, bold = true))
            card.addView(UI.text(a, name, 20f, R.color.ink, bold = true, topDp = 2))
        }

        when (selection) {
            is MapSelection.Stretch -> {
                val s = a.store.bundle?.segments?.firstOrNull { it.id == selection.id }
                if (s != null) {
                    head(L.t("gw.title"), s.name)
                    // The phase is a word and the status is a word: never a colour on its own.
                    card.addView(UI.pill(a, L.t("gw." + s.phase)))
                    if (s.phase != "open") card.addView(UI.text(a, L.t("gw.not_open"), 15f, R.color.muted, topDp = 4))
                    card.addView(
                        UI.button(a, L.t("map.details"), description = L.t("map.details") + L.t("list.sep") + s.name) {
                            a.push(Route.Stretch(s.id))
                        },
                    )
                }
            }
            is MapSelection.Listing -> {
                val row = a.store.bundle?.rows?.firstOrNull { it.id == selection.id }
                if (row != null) {
                    head(mapLayerName("help:" + mapGroupId(row.category)), row.name)
                    if (row.what.isNotEmpty()) card.addView(UI.text(a, row.what, 15f, R.color.muted, topDp = 2))
                    card.addView(
                        UI.pill(a, openText(openNow(row, a.now(), a.store.bundle?.alerts.orEmpty()), a.today())),
                    )
                    // The number is shown, never truncated, and on its own line at any text size (UI.callButton).
                    row.phones.firstOrNull()?.let { phone ->
                        card.addView(
                            UI.callButton(a, phone.label ?: L.t("detail.call_label", "name" to row.name), phone.number) {
                                a.dial(phone.number)
                            },
                        )
                    }
                    card.addView(
                        UI.button(a, L.t("map.details"), description = L.t("map.details") + L.t("list.sep") + row.name) {
                            a.push(Route.Detail(row.id, row.category))
                        },
                    )
                }
            }
            is MapSelection.Park -> head(L.t("map.park"), selection.name)
            is MapSelection.Stop -> head(selection.layer, selection.name.ifEmpty { selection.layer })
            is MapSelection.Route -> head(selection.layer, selection.name.ifEmpty { selection.layer })
            is MapSelection.Line -> routeCard(a, card, selection)
            is MapSelection.Trunk -> {
                val net = MapModel.net(a.store, selection.layer)?.net
                val members = net?.routes.orEmpty().filter { selection.routeIds.contains(it.id) }
                head(mapLayerName("go:" + selection.layer), sentenceWithoutList(L.t("map.many_routes", "count" to members.size.toString(), "list" to "")))
                card.addView(routeButtons(a, selection.layer, members, select))
            }
            is MapSelection.Station -> {
                val name = MapModel.data(a.store, "go:" + selection.layer)?.points?.getOrNull(selection.index)?.name ?: ""
                head(mapLayerName("go:" + selection.layer), ltr(name.ifEmpty { mapLayerName("go:" + selection.layer) }))
                // Which routes stop here, from `serves` — once that small file is held. Each is a button.
                MapModel.routesAt(a.store, selection.layer, selection.index)?.let { (owner, list) ->
                    if (list.isNotEmpty()) {
                        card.addView(UI.text(a, sentenceWithoutList(L.t("map.stop_lines", "list" to "")), 15f, R.color.muted, topDp = 4))
                        card.addView(routeButtons(a, owner.net.id, list.map { owner.net.routes[it] }, select))
                    }
                }
            }
            is MapSelection.Interchange -> {
                val net = MapModel.net(a.store, selection.layer)?.net
                val at = net?.interchanges?.getOrNull(selection.index)
                if (net != null && at != null) {
                    head(sentenceWithoutList(L.t("map.change_here", "list" to "")), ltr(at.name.ifEmpty { net.agency }))
                    card.addView(routeButtons(a, selection.layer, at.routes.map { net.routes[it] }, select))
                }
            }
            is MapSelection.Hub -> {
                val hub = MapModel.hubs.firstOrNull { it.name == selection.name }
                if (hub != null) {
                    val on = MapModel.layersOn(a)
                    head(hub.layers.filter { on.contains("go:$it") }.joinToString(" · ") { mapLayerName("go:$it") }, ltr(hub.name))
                    val list = hub.stops.filter { on.contains("go:" + it.first) }
                        .joinToString(", ") { ltr(it.second) + " (" + mapLayerName("go:" + it.first) + ")" }
                    card.addView(UI.text(a, L.t("map.hub_walk", "list" to list), 16f, R.color.ink, topDp = 4))
                }
            }
        }
        host.addView(scroller)
    }

    /** Route, stop and station names are Latin, written by their owners: left to right inside an Arabic sentence. */
    private fun ltr(s: String): String = if (s.isEmpty()) s else "\u2066" + s + "\u2069"

    /**
     * The route card (docs/MAP-STYLE.md section 9): name and agency, "Frequent route" when the owner says so, the
     * owner's own weekday headway worded as theirs, how many stops, where it ends, and ONE link: the owner's trip
     * planner, opened by the app's one https-only opener. No arrival times, ever — nothing on this map is live.
     */
    private fun routeCard(a: MainActivity, card: LinearLayout, selection: MapSelection.Line) {
        val net = MapModel.net(a.store, selection.layer)?.net
        val route = net?.routes?.firstOrNull { it.id == selection.routeId }
        if (net == null || route == null) {
            card.addView(UI.text(a, mapLayerName("go:" + selection.layer), 20f, R.color.ink, bold = true))
            return
        }
        card.addView(UI.text(a, mapLayerName("go:" + selection.layer), 14f, R.color.muted, bold = true))
        card.addView(UI.text(a, L.t("map.route_card", "name" to ltr(route.label), "agency" to ltr(net.agency)), 20f, R.color.ink, bold = true, topDp = 2))
        if (route.frequent) card.addView(UI.pill(a, L.t("map.route_frequent")))
        route.headway?.let { card.addView(UI.text(a, L.t("map.route_every", "minutes" to it.toString()), 16f, R.color.ink, topDp = 4)) }
        if (route.stopCount > 0) card.addView(UI.text(a, L.t("map.route_stops", "count" to route.stopCount.toString()), 16f, R.color.ink, topDp = 2))
        val ends = LinkedHashSet(route.ends.map { it.name }.filter { it.isNotEmpty() })
        if (ends.isNotEmpty()) card.addView(UI.text(a, ends.joinToString(" – ") { ltr(it) }, 16f, R.color.muted, topDp = 2))
        // Facts, not claims: the QLINE's line is a drawing through its stations, and wherever the data says so, so
        // does the card.
        if (route.derived) card.addView(UI.text(a, L.t("map.key_qline"), 15f, R.color.muted, topDp = 4))
        plannerLink(net.system, net.agencyUrl)?.let { link ->
            val words = L.t("map.route_plan", "agency" to net.agency)
            card.addView(UI.button(a, words, description = words, backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) { a.openWeb(link) })
        }
    }

    /** One real Button per route, never smaller than 48 dp, wrapping like words. A tap selects that route. */
    private fun routeButtons(a: MainActivity, layer: String, routes: List<NetRoute>, select: (MapSelection?) -> Unit): View {
        val flow = FlowRow(a, UI.dp(a, 6))
        for (r in routes) {
            val b = UI.button(
                a, r.short.ifEmpty { r.label }, description = r.label,
                backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 0,
            ) { select(MapSelection.Line(layer, r.id)) }
            b.minWidth = UI.dp(a, UI.MIN_TAP_DP)
            b.minHeight = UI.dp(a, UI.MIN_TAP_DP)
            // Latin route numbers read left to right in every language.
            b.textDirection = View.TEXT_DIRECTION_LTR
            flow.addView(b, ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        return flow
    }

    /** Children left to right (right to left in Arabic), wrapping to a new row when the width runs out. */
    private class FlowRow(context: android.content.Context, private val gap: Int) : ViewGroup(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val width = MeasureSpec.getSize(widthMeasureSpec)
            var x = 0
            var y = gap
            var row = 0
            for (i in 0 until childCount) {
                val c = getChildAt(i)
                c.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
                if (x > 0 && x + c.measuredWidth > width) { x = 0; y += row + gap; row = 0 }
                x += c.measuredWidth + gap
                row = maxOf(row, c.measuredHeight)
            }
            setMeasuredDimension(width, y + row)
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val width = r - l
            val rtl = layoutDirection == View.LAYOUT_DIRECTION_RTL
            var x = 0
            var y = gap
            var row = 0
            for (i in 0 until childCount) {
                val c = getChildAt(i)
                if (x > 0 && x + c.measuredWidth > width) { x = 0; y += row + gap; row = 0 }
                val left = if (rtl) width - x - c.measuredWidth else x
                c.layout(left, y, left + c.measuredWidth, y + c.measuredHeight)
                x += c.measuredWidth + gap
                row = maxOf(row, c.measuredHeight)
            }
        }
    }

    // ---- what to show on the map -------------------------------------------------------------------------------

    fun layers(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("map.layers"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("map.layers_note"), 16f, R.color.muted, topDp = 4))

        val help = mapGroups.filter { g ->
            a.store.bundle?.rows.orEmpty().any {
                g.tops.contains(it.category.substringBefore('.')) && it.lat != null && !isSensitive(it.category)
            }
        }.map { "help:" + it.id }
        val places = buildList {
            if (a.store.bundle?.segments.orEmpty().isNotEmpty()) add("place:greenway")
            if (MapModel.parks.isNotEmpty()) add("place:parks")
        }
        val going = MapModel.transitLayers.map { "go:" + it.id }

        for ((headKey, ids) in listOf("map.group_help" to help, "map.group_places" to places, "map.group_go" to going)) {
            if (ids.isEmpty()) continue
            // "Map style" sits above "Ways to get around", because it changes how that group is drawn and nothing
            // else. Hidden when the bundle has no network files: there is then nothing to choose.
            if (headKey == "map.group_go" && MapModel.styleOffered) styleGroup(a, col)
            col.addView(UI.sectionHead(a, L.t(headKey)))
            for (id in ids) col.addView(layerRow(a, id))
        }
        // Flipping a switch redraws this screen, because a layer that fails to load grows a "Try again" under its
        // own row. Redrawing must not throw the person back to the top of a list of twenty: the position is kept
        // for as long as the process lives, and it is a scroll offset, not a fact about anybody.
        val scroller = UI.scroller(a, col)
        scroller.setOnScrollChangeListener { _, _, y, _, _ -> layersScroll = y }
        scroller.post { scroller.scrollTo(0, layersScroll) }
        return scroller
    }

    private var layersScroll = 0

    /**
     * Two real RadioButtons in a RadioGroup under a heading, each with its one-line description, so TalkBack says
     * "Subway lines, bus and rail drawn like a subway map, radio button, 2 of 2, not checked" by itself. The choice
     * applies at once, is announced, and is written to the same small file as the layer choices (MapLayerStore).
     * A network file that is still coming or could not be read says so here, per layer; that layer goes on drawing
     * `standard` beside the ones that arrived. Under it, the key in words — only for what is switched on.
     */
    private fun styleGroup(a: MainActivity, col: LinearLayout) {
        col.addView(UI.sectionHead(a, L.t("map.style")))
        val box = UI.card(a)
        val group = android.widget.RadioGroup(a)
        group.orientation = LinearLayout.VERTICAL
        group.contentDescription = L.t("map.style")
        val chosen = MapModel.style(a)
        val options = listOf(
            Triple(MapStyle.STANDARD, "map.style_standard", "map.style_standard_note"),
            Triple(MapStyle.SUBWAY, "map.style_subway", "map.style_subway_note"),
        )
        val ids = HashMap<Int, MapStyle>()
        for ((style, nameKey, noteKey) in options) {
            val b = android.widget.RadioButton(a)
            b.id = View.generateViewId()
            ids[b.id] = style
            val name = L.t(nameKey)
            val words = android.text.SpannableString(name + "\n" + L.t(noteKey))
            words.setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD), 0, name.length, 0)
            words.setSpan(android.text.style.RelativeSizeSpan(0.85f), name.length + 1, words.length, 0)
            b.text = words
            b.textSize = 17f
            b.setTextColor(UI.color(a, R.color.ink))
            b.minHeight = UI.dp(a, UI.MIN_TAP_DP)
            b.setPadding(b.paddingLeft, UI.dp(a, 6), b.paddingRight, UI.dp(a, 6))
            group.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            if (style == chosen) group.check(b.id)
        }
        group.setOnCheckedChangeListener { g, id ->
            val next = ids[id] ?: return@setOnCheckedChangeListener
            if (next == MapModel.style(a)) return@setOnCheckedChangeListener
            MapModel.setStyle(a, a.store, next)
            val name = L.t(if (next == MapStyle.SUBWAY) "map.style_subway" else "map.style_standard")
            a.render()
            // After the redraw, so the words are not cut off by the new screen's own first focus.
            a.window.decorView.post { a.window.decorView.announceForAccessibility(L.t("map.style_say", "name" to name)) }
            g.contentDescription = L.t("map.style")
        }
        box.addView(group)

        for (l in MapModel.transitLayers) {
            val name = mapLayerName("go:" + l.id, l.name)
            when (MapModel.netState(a, a.store, l.id)) {
                MapModel.LayerState.LOADING ->
                    box.addView(UI.text(a, joinParts(listOf(name, L.t("map.layer_loading"))), 14f, R.color.muted, topDp = 4))
                MapModel.LayerState.FAILED -> {
                    box.addView(UI.text(a, L.t("map.layer_failed", "name" to name), 14f, R.color.warn_ink, topDp = 4))
                    box.addView(
                        UI.button(
                            a, L.t("map.layer_retry"), description = L.t("map.layer_retry") + L.t("list.sep") + name,
                            backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink,
                        ) {
                            MapModel.retryNet(a, a.store, l.id)
                            a.render()
                        },
                    )
                }
                else -> Unit
            }
        }
        col.addView(box)

        if (chosen != MapStyle.SUBWAY) return
        fun on(id: String) = MapModel.isOn(a, "go:$id")
        val bus = on("ddot_routes") || on("smart_routes")
        val lines = listOf(
            Triple("frequent", "map.key_frequent", bus), Triple("local", "map.key_local", bus),
            Triple("smart", "map.key_smart", on("smart_routes")), Triple("trunk", "map.key_trunk", bus),
            Triple("station", "map.key_station", on("ddot_stops") || on("smart_stops") || on("qline") || on("people_mover")),
            Triple("change", "map.key_change", bus || (on("qline") && on("people_mover"))),
            Triple("end", "map.key_end", bus || on("qline")),
            Triple("qline", "map.key_qline", on("qline")), Triple("dpm", "map.key_dpm", on("people_mover")),
            Triple("bike", "map.key_bike", on("bike_lanes")),
        ).filter { it.third }
        if (lines.isEmpty()) return
        val key = UI.card(a)
        key.addView(UI.text(a, L.t("map.key"), 16f, R.color.ink, bold = true))
        for ((kind, wordsKey, _) in lines) {
            val row = LinearLayout(a)
            row.orientation = LinearLayout.HORIZONTAL
            row.gravity = Gravity.CENTER_VERTICAL
            row.addView(SubwayKeySample(a, kind))
            val words = UI.text(a, L.t(wordsKey), 15f, R.color.ink)
            (words.layoutParams as? LinearLayout.LayoutParams)?.let { it.width = 0; it.weight = 1f; it.marginStart = UI.dp(a, 8) }
            row.addView(words)
            key.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).also { it.topMargin = UI.dp(a, 4) })
        }
        col.addView(key)
    }

    /** A real Switch, so TalkBack, Switch Access and Voice Access all say "on" or "off" themselves. */
    private fun layerRow(a: MainActivity, id: String): View {
        val name = mapLayerName(id, MapModel.transitLayers.firstOrNull { "go:" + it.id == id }?.name ?: "")
        val box = UI.card(a)
        @Suppress("DEPRECATION")
        val toggle = android.widget.Switch(a)
        toggle.text = name
        toggle.textSize = 17f
        toggle.setTextColor(UI.color(a, R.color.ink))
        toggle.isChecked = MapModel.isOn(a, id)
        toggle.minHeight = UI.dp(a, UI.MIN_TAP_DP)
        toggle.setPadding(0, UI.dp(a, 6), 0, UI.dp(a, 6))
        toggle.setOnClickListener {
            MapModel.toggle(a, id)
            if (id.startsWith("go:")) {
                MapModel.loadOne(a, a.store, id)
                // Nothing in `standard`; in `subway`, the network file of a layer that has just been switched on.
                MapModel.loadNets(a, a.store)
            }
            a.store.bundle?.let { MapModel.rebuildDots(a, it.rows) }
            a.render()
        }
        box.addView(toggle)
        if (mapLayerStyle(id).dense && id.startsWith("go:")) {
            box.addView(UI.text(a, L.t("map.layer_zoom"), 14f, R.color.muted, topDp = 2))
        }
        // A layer that is switched on and could not be read says so, and asks again on a tap. It is never silently
        // remembered as "nothing".
        if (MapModel.isOn(a, id) && id.startsWith("go:") &&
            MapModel.state(a.store, id) == MapModel.LayerState.FAILED
        ) {
            box.addView(UI.text(a, L.t("map.layer_failed", "name" to name), 14f, R.color.warn_ink, topDp = 4))
            box.addView(
                UI.button(a, L.t("map.layer_retry"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    MapModel.retry(a, a.store, id)
                    a.render()
                },
            )
        }
        return box
    }

    // ---- see this map as a list ---------------------------------------------------------------------------------

    /**
     * Everything the map is showing, in words, in the same order the map is read in. This is the text alternative
     * the whole tab depends on, so it is a persistent control and not a hidden one.
     */
    fun list(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("map.list_title"), 24f, R.color.ink, bold = true))
        val bundle = a.store.bundle
        val overlays = MapModel.overlays(a, a.store)

        val tops = MapModel.switchedOnTops(a)
        val rows: List<Ranked> = if (tops.isEmpty() || bundle == null) {
            emptyList()
        } else {
            rank(mapDrawable(bundle.rows, tops), Query(near = a.near), a.now(), bundle.alerts)
        }
        val segments = if (MapModel.isOn(a, "place:greenway")) MapModel.segments.map { it.segment } else emptyList()
        val parks = if (MapModel.isOn(a, "place:parks")) MapModel.parks.sortedBy { it.name } else emptyList()

        if (rows.isEmpty() && segments.isEmpty() && parks.isEmpty() && overlays.isEmpty()) {
            col.addView(UI.text(a, L.t("map.list_none"), 17f, R.color.muted, topDp = 16))
            return UI.scroller(a, col)
        }

        // The greenway first, south to north, then the places: the same order the map is read in.
        if (segments.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("gw.title")))
            for (s in segments) {
                val card = UI.tappableCard(a, s.name + L.t("list.sep") + L.t("gw." + s.phase)) { a.push(Route.Stretch(s.id)) }
                card.addView(UI.text(a, s.name, 18f, R.color.ink, bold = true))
                card.addView(UI.text(a, L.t("gw." + s.phase), 15f, R.color.muted, topDp = 2))
                col.addView(card)
            }
        }
        if (rows.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("map.list_help", "count" to rows.size.toString())))
            for (r in rows.take(20)) {
                val card = UI.tappableCard(a, r.row.name) { a.push(Route.Detail(r.row.id, r.row.category)) }
                card.addView(UI.text(a, r.row.name, 18f, R.color.ink, bold = true))
                if (r.row.what.isNotEmpty()) card.addView(UI.text(a, r.row.what, 15f, R.color.muted, topDp = 2))
                card.addView(UI.pill(a, openText(r.open, a.today())))
                card.addView(UI.text(a, badgeText(r.badge), 14f, R.color.muted, topDp = 4))
                col.addView(card)
            }
            if (rows.size > 20) {
                col.addView(UI.text(a, L.t("map.list_more", "count" to (rows.size - 20).toString()), 14f, R.color.muted, topDp = 6))
            }
        }
        if (parks.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("rec.parks")))
            // Park, route and stop names are written by the City, never by us: one run of their words.
            col.addView(UI.text(a, names(parks.map { it.name }, 30), 16f, R.color.ink))
        }
        // The transport layers, from the STANDARD layer files only. `mapListSections` (MapList.kt, `:core`) is never
        // told the map style, so this list is the same list, to the character, in both (docs/MAP-STYLE.md section 9).
        for (section in mapListSections(overlays.map { MapListLayer(it.label, it.data) })) {
            col.addView(UI.sectionHead(a, section.title))
            if (section.names.isEmpty()) {
                col.addView(UI.text(a, L.t("map.list_unnamed", "count" to section.count.toString()), 16f, R.color.muted))
            } else {
                val head = section.names.joinToString(" · ")
                val words = if (section.more > 0) head + "\n" + L.t("map.list_more", "count" to section.more.toString()) else head
                col.addView(UI.text(a, words, 16f, R.color.ink))
            }
        }
        val sources = MapModel.transitLayers.filter { MapModel.isOn(a, "go:" + it.id) }
            .joinToString(" · ") {
                it.sourceName + " (" + L.t("map.layer_license", "name" to it.license) + L.t("list.sep") + dateText(it.fetchedAt) + ")"
            }
        if (sources.isNotEmpty()) {
            col.addView(UI.text(a, L.t("map.sources") + " " + sources, 14f, R.color.muted, topDp = 12))
            col.addView(UI.text(a, L.t("map.layer_filtered"), 14f, R.color.muted, topDp = 4))
        }
        // The streets and parks themselves, in full: who they come from, when they were last edited, and how to
        // move the map. Over the map there is only room for the first two lines of it.
        MapModel.base?.edited?.takeIf { it.isNotEmpty() }?.let {
            col.addView(UI.text(a, L.t("map.source", "date" to dateText(it)), 14f, R.color.muted, topDp = 12))
        }
        return UI.scroller(a, col)
    }

    private fun names(list: List<String>, limit: Int): String {
        val out = LinkedHashSet(list).toList()
        val head = out.take(limit).joinToString(" · ")
        return if (out.size > limit) head + "\n" + L.t("map.list_more", "count" to (out.size - limit).toString()) else head
    }

    // ---- one stretch of the greenway ----------------------------------------------------------------------------

    fun stretch(a: MainActivity, s: Segment): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, s.name, 24f, R.color.ink, bold = true))
        col.addView(UI.pill(a, L.t("gw." + s.phase)))
        if (s.phase != "open") col.addView(UI.text(a, L.t("gw.not_open"), 17f, R.color.ink, topDp = 6))
        col.addView(UI.text(a, L.t("gw.intro"), 16f, R.color.muted, topDp = 8))

        // The map is never the only way to get a fact: the streets this stretch crosses are listed in words
        // (DECISIONS 2026-09-18).
        if (s.crossStreets.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("gw.crosses")))
            col.addView(UI.text(a, joinParts(s.crossStreets), 17f, R.color.ink))
        }

        val bundle = a.store.bundle
        if (bundle != null) {
            val near = helpAlong(bundle.rows, s)
            col.addView(UI.sectionHead(a, L.t("gw.help_along")))
            if (near.isEmpty()) {
                col.addView(UI.text(a, L.t("gw.help_none"), 16f, R.color.muted))
            } else {
                for (n in near.take(20)) {
                    val row = n.row
                    val card = UI.tappableCard(a, row.name) { a.push(Route.Detail(row.id, row.category)) }
                    card.addView(UI.text(a, row.name, 18f, R.color.ink, bold = true))
                    if (row.what.isNotEmpty()) card.addView(UI.text(a, row.what, 15f, R.color.muted, topDp = 2))
                    card.addView(UI.pill(a, openText(openNow(row, a.now(), bundle.alerts), a.today())))
                    card.addView(UI.text(a, badgeText(badge(row, a.now())), 14f, R.color.muted, topDp = 4))
                    col.addView(card)
                }
            }
        }
        return UI.scroller(a, col)
    }
}
