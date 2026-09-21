// The screens. Every listing shows a freshness badge computed here, on the device, from the dated facts in the
// signed bundle (docs/04) — never a value frozen at build time, and never the word "verified" for something no
// person checked. Unknown hours are never rendered as open. Reports label rows; they never hide them.
package org.help313.app

import android.view.View
import android.widget.LinearLayout
import org.help313.query.BundleRow
import org.help313.query.OpenResult
import org.help313.query.OpenState
import org.help313.query.Query
import org.help313.query.Ranked
import org.help313.query.badge
import org.help313.query.nextOccurrences
import org.help313.query.openNow
import org.help313.query.rank
import org.help313.query.search as querySearch

object Screens {

    // ---- one screen, from a route ---------------------------------------------------------------------------

    /**
     * The screen a route names. This is the only way a screen is built, so everything that has to be true of
     * *every* screen — the "Leave this page fast" button on a private one, FLAG_SECURE (which MainActivity.render
     * sets from the same route) — happens in one place rather than being remembered screen by screen.
     */
    fun view(a: MainActivity, route: Route): View {
        val inner = build(a, route)
        return if (Route.isPrivate(route)) withQuickExit(a, inner) else inner
    }

    private fun build(a: MainActivity, route: Route): View = when (route) {
        is Route.Home -> home(a)
        is Route.Help -> help(a)
        is Route.Search -> search(a)
        is Route.Saved -> saved(a)
        is Route.About -> about(a)
        is Route.Urgent -> urgent(a)
        is Route.Map -> MapScreen.tab(a)
        is Route.MapLayers -> MapScreen.layers(a)
        is Route.MapList -> MapScreen.list(a)
        is Route.Stretch -> {
            // A route outlives a draw, so the stretch is looked up again: the bundle may have been refreshed since.
            val s = a.store.bundle?.segments?.firstOrNull { it.id == route.segmentId }
            if (s == null) {
                val col = UI.column(a, 16)
                col.addView(UI.text(a, L.t(if (a.store.bundle == null) "home.loading" else "detail.not_found"), 17f, R.color.muted))
                UI.scroller(a, col)
            } else {
                MapScreen.stretch(a, s)
            }
        }
        is Route.Need -> {
            val need = NEEDS.firstOrNull { it.id == route.needId }
            if (need == null) home(a) else needScreen(a, need)
        }
        is Route.Refine -> {
            val need = NEEDS.firstOrNull { it.id == route.needId }
            val refine = need?.refine?.firstOrNull { it.id == route.refineId }
            if (need == null || refine == null) home(a)
            else results(
                a, L.t("refine.${need.id}.${refine.id}"), refine.query,
                need.emptyKey, need.sensitive, refine.first,
            )
        }
        is Route.Category -> {
            val found = CATEGORIES.firstOrNull { it.first == route.categoryId }
            if (found == null) help(a) else results(a, L.t("cat.${found.first}"), found.second)
        }
        is Route.Detail -> {
            // A route outlives a draw, so the listing is looked up again: the bundle may have been refreshed, or
            // may not have arrived yet, since the person tapped.
            val row = a.store.bundle?.rows?.firstOrNull { it.id == route.rowId }
            if (row != null) {
                detail(a, row)
            } else {
                val col = UI.column(a, 16)
                col.addView(UI.text(a, L.t(if (a.store.bundle == null) "home.loading" else "detail.not_found"), 17f, R.color.muted))
                UI.scroller(a, col)
            }
        }
    }

    /**
     * A private screen with "Leave this page fast" pinned above it — the same button, in the same place, going to
     * the same address as the web app's (docs/05, `safe.exit`). It is outside the scroller on purpose: it has to be
     * reachable without scrolling, at any text size, at the moment somebody needs it.
     */
    private fun withQuickExit(a: MainActivity, inner: View): View {
        val wrap = UI.column(a)
        val exit = UI.button(
            a, L.t("safe.exit"),
            backgroundId = R.drawable.pill_warn, textColorId = R.color.warn_ink, topDp = 0,
        ) { a.quickExit() }
        exit.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
        )
        wrap.addView(exit)
        inner.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        wrap.addView(inner)
        return wrap
    }

    // ---- Home ----------------------------------------------------------------------------------------------

    fun home(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("app.name"), 28f, R.color.brand, bold = true))
        col.addView(UI.text(a, L.t("home.hero"), 20f, R.color.ink, topDp = 4))

        noteBar(a, col)

        // Urgent help is reachable from every screen, and 911 and 988 are always the first two. It is added here,
        // above the "still checking the list" line and before any listing, because 911 and 988 are hardcoded
        // (audit A5) and need no bundle at all: making a person in trouble wait on a signature check would be the
        // one delay in this app that could actually hurt someone. Nothing below this line is shown until the
        // bundle's signature has passed.
        col.addView(UI.button(a, L.t("strip.more"), topDp = 16) { a.push(Route.Urgent) })

        if (a.store.bundle == null) {
            col.addView(UI.text(a, if (a.store.loadFailed) L.t("home.no_data") else L.t("home.loading"), 17f, R.color.muted, topDp = 16))
            if (a.store.loadFailed) {
                col.addView(UI.callButton(a, L.t("home.retry"), "211") { a.dial("211") })
            }
            return UI.scroller(a, col)
        }

        col.addView(UI.sectionHead(a, L.t("home.help_title")))
        col.addView(UI.text(a, L.t("home.help_sub"), 16f, R.color.muted))
        for (key in listOf("quick.food", "quick.shelter", "quick.doctor", "quick.narcan")) {
            val needId = when (key) {
                "quick.food" -> "food"; "quick.shelter" -> "shelter"; "quick.doctor" -> "doctor"; else -> "narcan"
            }
            val card = UI.tappableCard(a, L.t(key)) { a.push(Route.Need(needId)) }
            card.addView(UI.text(a, L.t(key), 18f, R.color.ink, bold = true))
            col.addView(card)
        }

        col.addView(UI.button(a, L.t("home.see_all"), topDp = 16) { a.go(Route.Help) })

        val alerts = a.store.bundle?.alerts.orEmpty().filter { it.status == "published" && it.kind != "cancellation" }
        if (alerts.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("alert.from")))
            for (al in alerts.take(5)) {
                val card = UI.card(a)
                card.addView(UI.text(a, al.title.orEmpty(), 17f, R.color.ink, bold = true))
                al.bodyPlain?.let { card.addView(UI.text(a, it, 16f, R.color.muted, topDp = 4)) }
                col.addView(card)
            }
        }

        col.addView(UI.button(a, L.t("about.title"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 20) {
            a.push(Route.About)
        })
        return UI.scroller(a, col)
    }

    /** The bundle-age line, on every list and listing. It says nothing about any listing. */
    private fun noteBar(a: MainActivity, col: LinearLayout) {
        a.ageNote()?.let {
            val warn = UI.pill(a, it, R.drawable.pill_warn, R.color.warn_ink)
            warn.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
            ).also { p -> p.topMargin = UI.dp(a, 12) }
            col.addView(warn)
        }
    }

    // ---- Help: the needs list ------------------------------------------------------------------------------

    fun help(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("home.help_title"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("help.lede"), 16f, R.color.muted, topDp = 4))
        noteBar(a, col)

        for ((group, headKey) in listOf("now" to "help.now", "soon" to "help.soon", "later" to "help.later")) {
            col.addView(UI.sectionHead(a, L.t(headKey)))
            for (need in NEEDS.filter { it.group == group }) {
                val label = L.t("need.${need.id}")
                val card = UI.tappableCard(a, label) { a.push(Route.Need(need.id)) }
                card.addView(UI.text(a, label, 18f, R.color.ink, bold = true))
                col.addView(card)
            }
        }

        col.addView(UI.sectionHead(a, L.t("home.categories")))
        for ((id, _) in CATEGORIES) {
            val label = L.t("cat.$id")
            val card = UI.tappableCard(a, label) { a.push(Route.Category(id)) }
            card.addView(UI.text(a, label, 17f, R.color.ink))
            col.addView(card)
        }
        return UI.scroller(a, col)
    }

    // ---- One need ------------------------------------------------------------------------------------------

    fun needScreen(a: MainActivity, need: Need): View {
        val col = UI.column(a, 16)
        val title = L.t("need.${need.id}")
        col.addView(UI.text(a, title, 24f, R.color.ink, bold = true))
        need.intro?.let { col.addView(UI.text(a, L.t(it), 17f, R.color.ink, topDp = 8)) }

        // A link above even the numbers: today only 313SafeBeds on the shelter screen. It is someone else's tool,
        // and the card says so in our own words (strings/*.json), which are translated like the rest of the app.
        need.firstLink?.let { (key, url) ->
            val card = UI.card(a)
            card.addView(UI.text(a, L.t("link.$key.title"), 17f, R.color.ink, bold = true))
            card.addView(UI.text(a, L.t("link.$key.body"), 16f, R.color.muted, topDp = 4))
            card.addView(UI.button(a, L.t("link.$key.label"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                a.openWeb(url)
            })
            col.addView(card)
        }

        // Numbers before any list (principle 8: never ask what you cannot act on). On the crisis screens the
        // ordering rules in docs/05 put 911 or the hotline first, which is the order in Needs.kt.
        for (id in need.first) {
            val e = a.emergency(id) ?: continue
            col.addView(UI.callButton(a, e.first, e.second, emergency = id == "emg_911") { a.dial(e.second) })
        }

        // Overdose: 911 and the steps, never a list of places. A bystander must not be sent on an errand (A7).
        if (need.stepsOnly) {
            col.addView(UI.sectionHead(a, L.t("urgent.od_sub")))
            for (i in 1..6) {
                val card = UI.card(a)
                card.addView(UI.text(a, L.t("od.s$i"), 17f, R.color.ink))
                col.addView(card)
            }
            col.addView(UI.text(a, L.t("od.review_note"), 15f, R.color.muted, topDp = 12))
            return UI.scroller(a, col)
        }

        if (need.refine.isNotEmpty()) {
            for (r in need.refine) {
                val label = L.t("refine.${need.id}.${r.id}")
                // A choice may bring its own numbers: the emergency-room list leads with 911. Route.Refine looks
                // both the need and the choice up again when the screen is drawn, so the list, the numbers and the
                // empty-list wording cannot drift from what Needs.kt says.
                val card = UI.tappableCard(a, label) { a.push(Route.Refine(need.id, r.id)) }
                card.addView(UI.text(a, label, 18f, R.color.ink, bold = true))
                col.addView(card)
            }
            return UI.scroller(a, col)
        }

        need.query?.let { q ->
            return results(a, title, q, need.emptyKey, need.sensitive)
        }
        return UI.scroller(a, col)
    }

    // ---- A list of listings --------------------------------------------------------------------------------

    fun results(
        a: MainActivity,
        title: String,
        query: Query,
        emptyKey: String? = null,
        sensitive: Boolean = false,
        first: List<String> = emptyList(),
    ): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, title, 24f, R.color.ink, bold = true))
        noteBar(a, col)

        // Numbers before the list, when this choice brings its own (principle 8: never ask what you cannot act on).
        for (id in first) {
            val e = a.emergency(id) ?: continue
            col.addView(UI.callButton(a, e.first, e.second, emergency = id == "emg_911") { a.dial(e.second) })
        }

        val bundle = a.store.bundle
        if (bundle == null) {
            col.addView(UI.text(a, L.t("home.loading"), 17f, R.color.muted, topDp = 12))
            return UI.scroller(a, col)
        }

        // Distance sorts the list; a sensitive listing never gets one (docs/08), which the ranking rule already
        // guarantees because those rows carry no coordinates.
        if (!sensitive) {
            if (a.near == null) {
                col.addView(UI.button(a, L.t("loc.use"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.askForLocation()
                })
                if (a.locationRefused) col.addView(UI.text(a, L.t("loc.denied"), 15f, R.color.muted, topDp = 6))
            } else {
                col.addView(UI.text(a, L.t("loc.using"), 15f, R.color.muted, topDp = 8))
            }
            col.addView(UI.text(a, L.t("loc.note"), 14f, R.color.muted, topDp = 4))
        }

        // The location still goes to `rank` on a sensitive screen: a domestic-violence row uses it only to work
        // out which coarse area is nearest (org.help313.query.SERVICE_AREAS) and its `miles` comes back null
        // regardless, so nothing below can print a distance. What `sensitive` turns off is the screen: the
        // location button, the "using your location" line and the mileage.
        val q = query.copy(near = a.near)
        val ranked = rank(bundle.rows, q, a.now(), bundle.alerts)
        if (ranked.isEmpty()) {
            col.addView(UI.text(a, L.t(emptyKey ?: "results.none"), 17f, R.color.muted, topDp = 16))
            return UI.scroller(a, col)
        }
        for (r in ranked) col.addView(listingCard(a, r, showDistance = !sensitive))
        return UI.scroller(a, col)
    }

    /** The open-now pill. A holiday is never the open colour: the words say "Call first" and the colour agrees. */
    private fun openPill(a: MainActivity, o: OpenResult): View =
        if (o.state == OpenState.HOLIDAY) UI.pill(a, openText(o, a.today()), R.drawable.pill_warn, R.color.warn_ink)
        else UI.pill(a, openText(o, a.today()))

    /** One row in a list: name, what you get, open now, the badge, and how far. Never a bare colour. */
    private fun listingCard(a: MainActivity, r: Ranked, showDistance: Boolean): View {
        val card = UI.tappableCard(a, r.row.name) { a.push(Route.Detail(r.row.id, r.row.category)) }
        card.addView(UI.text(a, r.row.name, 18f, R.color.ink, bold = true))
        if (r.row.what.isNotEmpty()) card.addView(UI.text(a, r.row.what, 16f, R.color.muted, topDp = 2))
        card.addView(openPill(a, r.open))
        // A domestic-violence row's one statement about where it is: the coarse area, in words. Never a distance.
        serviceAreaStringKey(r.row)?.let { key ->
            card.addView(UI.text(a, L.t("safe.dv_serves", "area" to L.t(key)), 14f, R.color.muted, topDp = 2))
        }
        card.addView(UI.text(a, badgeText(r.badge), 14f, R.color.muted, topDp = 6))
        if (showDistance) r.miles?.let {
            card.addView(UI.text(a, L.t("miles", "miles" to String.format(L.locale(), "%.1f", it)), 14f, R.color.muted, topDp = 2))
        }
        r.row.notice?.let { card.addView(UI.pill(a, it, R.drawable.pill_warn, R.color.warn_ink)) }
        return card
    }

    // ---- One listing ---------------------------------------------------------------------------------------

    fun detail(a: MainActivity, row: BundleRow): View {
        val col = UI.column(a, 16)
        val bundle = a.store.bundle
        val now = a.now()
        col.addView(UI.text(a, row.name, 24f, R.color.ink, bold = true))
        if (row.org.isNotEmpty() && row.org != row.name) col.addView(UI.text(a, row.org, 16f, R.color.muted, topDp = 2))
        noteBar(a, col)

        val open = openNow(row, now, bundle?.alerts.orEmpty())
        col.addView(openPill(a, open))
        col.addView(UI.text(a, badgeText(badge(row, now)), 15f, R.color.muted, topDp = 8))
        holidayNote(open)?.let { col.addView(UI.pill(a, it, R.drawable.pill_warn, R.color.warn_ink)) }
        row.notice?.let { col.addView(UI.pill(a, it, R.drawable.pill_warn, R.color.warn_ink)) }

        // Call buttons show the number, so a person can read it, write it down, or dial it elsewhere. A listing
        // with no published number (the Wayne County naloxone stations) shows no Call button at all.
        for (p in row.phones) {
            val label = p.label ?: L.t("detail.call_label", "name" to row.name)
            col.addView(UI.callButton(a, label, p.number) { a.dial(p.number) })
        }

        if (row.what.isNotEmpty()) {
            col.addView(UI.sectionHead(a, L.t("detail.what")))
            col.addView(UI.text(a, row.what, 17f, R.color.ink))
        }
        row.eligibility?.let {
            col.addView(UI.sectionHead(a, L.t("detail.who")))
            col.addView(UI.text(a, it, 17f, R.color.ink))
        }

        // A domestic-violence row says where it is in words and nothing else: the coarse area it serves, then the
        // one sentence about why there is no address. No map, no dot, no distance, no directions (docs/08).
        serviceAreaStringKey(row)?.let { key ->
            col.addView(UI.text(a, L.t("safe.dv_serves", "area" to L.t(key)), 17f, R.color.ink))
        }
        if (saysNoAddress(row)) col.addView(UI.text(a, L.t("safe.dv_no_address"), 15f, R.color.muted))

        // Addresses and distances are shown for everything except the sensitive categories, whose rows carry no
        // coordinates at all (docs/08).
        if (!isSensitive(row.category)) {
            val addr = row.address
            if (addr != null) {
                col.addView(UI.sectionHead(a, L.t("detail.where")))
                // The separator is the reader's own (`list.sep`), not always a Latin comma and space.
                col.addView(UI.text(a, joinParts(listOf(addr.line1, addr.city, addr.zip)), 17f, R.color.ink))
            } else if (showsPointWithoutAddress(row)) {
                // Somewhere real that publishes no street address: say so in the source's own name, and let
                // Directions below open the point. A coordinate is never printed as if it were an address.
                col.addView(UI.sectionHead(a, L.t("detail.where")))
                col.addView(UI.text(a, L.t("detail.where_no_address", "source" to row.facts.source.name), 17f, R.color.ink))
            }
            mapsDestination(row)?.let { destination ->
                col.addView(UI.button(a, L.t("detail.directions"), description = L.t("detail.directions_label", "name" to row.name),
                    backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.directions(row.lat, row.lon, destination)
                })
                // Bus directions in the Transit app, and only when the phone actually has it: Transit documents
                // no fallback for a phone without it, so the button is left out rather than offered and broken.
                // Never a replacement for Directions above, and never an endorsement — the word "Transit" in
                // text, no logo, nothing loaded from their servers (docs/research/2026-09-20/transit-app.md).
                transitAppDestination(row)?.let { busDestination ->
                    if (a.canOpenTransitApp()) {
                        col.addView(UI.button(a, L.t("detail.bus_app"), description = L.t("detail.bus_app_label", "name" to row.name),
                            backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                            a.transitApp(busDestination)
                        })
                    }
                }
                col.addView(UI.text(a, L.t("detail.directions_note"), 14f, R.color.muted, topDp = 4))
            }
        }

        col.addView(UI.sectionHead(a, L.t("detail.hours")))
        row.hoursText?.let { col.addView(UI.text(a, L.t("detail.hours_as_listed", "text" to it), 16f, R.color.muted)) }
        val next = nextOccurrences(row, now, 3, bundle?.alerts.orEmpty())
        if (next.isEmpty()) {
            col.addView(UI.text(a, openText(open, a.today()), 16f, R.color.ink))
        } else {
            for (o in next) {
                // A holiday occurrence is labelled, never dropped (query-spec "Holidays").
                val line = dayText(o.date, a.today()) + " " + clock(o.opensAt) + "-" + clock(o.closesAt) +
                    if (o.holiday) " \u00b7 " + L.t("hours.holiday") else ""
                col.addView(UI.text(a, line, 16f, if (o.holiday) R.color.warn_ink else R.color.ink, topDp = 2))
            }
        }

        row.website?.let {
            col.addView(UI.button(a, L.t("detail.website"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                a.openWeb(it)
            })
        }

        // What a place wrote about itself is shown as they wrote it, and the screen says so.
        col.addView(UI.text(a, L.t("detail.in_english"), 14f, R.color.muted, topDp = 12))
        col.addView(UI.text(a, L.t("detail.source_line", "source" to row.facts.source.name), 14f, R.color.muted, topDp = 4))

        if (Saved.canSave(row.category)) {
            val saved = SavedStore.load(a).contains(row.id)
            col.addView(UI.button(a, if (saved) L.t("saved.remove") else L.t("saved.add"),
                backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 16) {
                SavedStore.toggle(a, row.id, row.category)
                a.render()
            })
            col.addView(UI.text(a, L.t("saved.note"), 14f, R.color.muted, topDp = 4))
        }

        // A retired list has no report buttons (schema/query-spec.md "Bundle age").
        if (!a.retired()) col.addView(report(a, row))
        return UI.scroller(a, col)
    }

    /** Reports label a row; they never hide it. Nothing identifying is sent: see ReportModel.kt. */
    private fun report(a: MainActivity, row: BundleRow): View {
        val card = UI.card(a, topDp = 20)
        card.addView(UI.text(a, L.t("report.wrong"), 17f, R.color.ink, bold = true))
        val note = UI.field(a, L.t("report.note_label"), L.t("report.note_label"))
        card.addView(UI.button(a, L.t("report.confirm.listing"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
            send(a, row.id, CONFIRM_LISTING, "")
        })
        card.addView(note)
        // Not every kind on every listing: "Out of supplies or food today" is only offered where there are supplies,
        // exactly as the web app and the iPhone app do it (listingKinds in ReportModel.kt, checked by ParityTest).
        // This screen used to offer it on an emergency room (Android review, 2026-09-20).
        for (kind in listingKinds(row.category)) {
            card.addView(UI.button(a, L.t("report.kind.$kind"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                send(a, row.id, kind, note.text.toString())
            })
        }
        card.addView(UI.text(a, L.t("add.privacy"), 14f, R.color.muted, topDp = 8))
        return card
    }

    private fun send(a: MainActivity, targetId: String, kind: String, detail: String) {
        val nowMillis = a.now()
        val app = a.applicationContext
        // Building the report reads (or makes) the install secret, and sending it touches the network: neither
        // belongs on the main thread. The shared network thread, not a new one per tap.
        // Building reads (or writes) the install secret and queueing writes a file, and this phone's own storage can
        // refuse both. Then nothing was sent and nothing is waiting, so the toast says that (`report.failed`, the
        // sentence the iPhone shows) instead of thanking a person for a report that does not exist.
        Work.net {
            val key = try {
                val r = ReportStore.build(app, targetId, kind, detail, nowMillis)
                if (ReportStore.submit(app, r)) "report.sent" else "report.queued"
            } catch (_: Throwable) {
                "report.failed"
            }
            a.runOnUiThread {
                android.widget.Toast.makeText(a, L.t(key), android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    // ---- Urgent help ---------------------------------------------------------------------------------------

    /**
     * Reachable from every screen. 911 and 988 are hardcoded and are always first; everything below them comes
     * from the signed bundle's emergency.json, in the order a steward published (docs/05).
     */
    fun urgent(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("strip.more"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("urgent.lede"), 17f, R.color.ink, topDp = 4))

        a.emergency("emg_911")?.let { e -> col.addView(UI.callButton(a, e.first, e.second, emergency = true) { a.dial(e.second) }) }
        a.emergency("emg_988")?.let { e -> col.addView(UI.callButton(a, e.first, e.second) { a.dial(e.second) }) }

        val card = UI.tappableCard(a, L.t("od.title")) { a.push(Route.Need("overdose_now")) }
        card.addView(UI.text(a, L.t("od.title"), 18f, R.color.ink, bold = true))
        card.addView(UI.text(a, L.t("urgent.od_sub"), 16f, R.color.muted, topDp = 2))
        col.addView(card)

        for (e in a.store.bundle?.emergency.orEmpty()) {
            if (e.id == "emg_911" || e.id == "emg_988") continue
            col.addView(UI.callButton(a, e.label, e.number) { a.dial(e.number) })
        }
        return UI.scroller(a, col)
    }

    // ---- Search --------------------------------------------------------------------------------------------

    /** Runs on the device over the bundle. What is typed is never stored, never sent, never put in a URL. */
    fun search(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("search.title"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("search.hint"), 15f, R.color.muted, topDp = 4))
        // No autofill, no personalised keyboard learning, no suggestion strip: what is typed here is a street or the
        // name of a clinic, and it stays on this phone (UI.field).
        val box = UI.field(a, L.t("search.label"), L.t("search.label"), suggestions = false)
        col.addView(box)
        val out = UI.column(a)
        col.addView(UI.button(a, L.t("search.title")) {
            out.removeAllViews()
            val bundle = a.store.bundle
            if (bundle == null) {
                out.addView(UI.text(a, L.t("home.loading"), 17f, R.color.muted, topDp = 12))
            } else {
                val hits = querySearch(bundle.rows, box.text.toString(), Query(near = a.near), a.now(), bundle.alerts)
                if (hits.isEmpty()) out.addView(UI.text(a, L.t("search.none"), 17f, R.color.muted, topDp = 12))
                else for (r in hits.take(50)) out.addView(listingCard(a, r, showDistance = true))
            }
        })
        col.addView(out)
        return UI.scroller(a, col)
    }

    // ---- Saved places --------------------------------------------------------------------------------------

    fun saved(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("saved.title"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("saved.sub"), 16f, R.color.muted, topDp = 4))
        val ids = SavedStore.load(a)
        val bundle = a.store.bundle
        val rows = bundle?.rows.orEmpty().filter { ids.contains(it.id) }.sortedBy { ids.indexOf(it.id) }
        if (rows.isEmpty()) {
            col.addView(UI.text(a, L.t("saved.none"), 17f, R.color.muted, topDp = 16))
            return UI.scroller(a, col)
        }
        for (row in rows) {
            val r = Ranked(row, openNow(row, a.now(), bundle?.alerts.orEmpty()), badge(row, a.now()), null, 0)
            col.addView(listingCard(a, r, showDistance = false))
        }
        col.addView(UI.button(a, L.t("saved.clear"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink, topDp = 16) {
            SavedStore.clear(a)
            a.render()
        })
        return UI.scroller(a, col)
    }

    // ---- About and privacy ---------------------------------------------------------------------------------

    fun about(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("about.title"), 24f, R.color.ink, bold = true))
        // Who this is not from comes second, straight after what the app is (Kyle, 2026-09-20).
        for (k in listOf("about.p1", "about.independent", "about.p2", "about.p3")) col.addView(UI.text(a, L.t(k), 16f, R.color.ink, topDp = 8))
        // The list this phone is holding. It used to print the sentence with its {version} and {date} still in it.
        a.store.bundle?.index?.let { i ->
            col.addView(UI.text(a, L.t("about.data", "version" to i.version, "date" to i.generatedAt.take(10)), 15f, R.color.muted, topDp = 8))
        }
        val signing = a.store.bundle?.index?.signing
        col.addView(UI.text(a, L.t(if (signing == "dev") "about.sig_dev" else "about.sig_ok"), 15f, R.color.muted, topDp = 12))

        col.addView(UI.sectionHead(a, L.t("privacy.title")))
        col.addView(UI.text(a, L.t("privacy.lede"), 16f, R.color.ink))
        for (k in listOf("privacy.phone_1", "privacy.phone_2", "privacy.phone_3", "privacy.phone_4", "privacy.phone_5")) {
            col.addView(UI.text(a, L.t(k), 16f, R.color.ink, topDp = 6))
        }
        // What is waiting to be sent, so nothing is queued out of sight, and a way to throw it away. Both are the
        // web app's (`queuedCount`, `clearQueue`). The count is read in the background and cached, so drawing this
        // screen never opens a file on the main thread.
        val app = a.applicationContext
        val countWhenDrawn = ReportStore.queued
        val unreadableWhenDrawn = ReportStore.unreadable
        Work.io {
            ReportStore.queuedCount(app)
            // Draw again only if reading the file changed the answer. Without that condition this screen would
            // redraw itself forever, because drawing it is what starts the read.
            if (ReportStore.queued != countWhenDrawn || ReportStore.unreadable != unreadableWhenDrawn) {
                a.runOnUiThread { if (a.current() is Route.About) a.render() }
            }
        }
        if (ReportStore.queued > 0 || ReportStore.unreadable) {
            if (ReportStore.queued > 0) {
                col.addView(UI.text(a, L.t("privacy.queued_note", "count" to ReportStore.queued.toString()), 16f, R.color.ink, topDp = 12))
            }
            // The control is here whenever there is anything to delete, including bytes that could not be read:
            // otherwise the one case where a person most wants them gone is the case with no button.
            col.addView(UI.button(a, L.t("privacy.queued_clear"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                Work.io {
                    ReportStore.clearQueue(app)
                    a.runOnUiThread {
                        android.widget.Toast.makeText(a, L.t("privacy.queued_cleared"), android.widget.Toast.LENGTH_LONG).show()
                        a.render()
                    }
                }
            })
        }
        // A queue that could not be read is said out loud, never silently dropped: those were somebody's reports,
        // and the bytes are kept beside the app's files for a steward to look at (ReportStore.read).
        if (ReportStore.unreadable) {
            col.addView(UI.pill(a, L.t("privacy.queued_unreadable"), R.drawable.pill_warn, R.color.warn_ink))
        }

        col.addView(UI.text(a, L.t("privacy.reset"), 16f, R.color.ink, topDp = 12))
        col.addView(UI.button(a, L.t("privacy.reset_btn"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
            // Off the main thread: SecureRandom's first use in a process can wait on the kernel's entropy pool and
            // this writes a file. On the main thread the reviewer measured the UI frozen for 3.6 seconds (Android
            // review, 2026-09-20). What is already waiting in the outbox is not orphaned by this — every queued
            // report's one-day hash is worked out again from the new key as it leaves (Reports.withCurrentNonce),
            // so the promise the button makes is true of them too.
            Work.io {
                // The write can fail (a full or read-only data directory). Then the old key is still the key, and
                // the screen says exactly that rather than claiming a new one (strings `privacy.reset_failed`).
                val made = try { ReportStore.resetInstallSecret(app); true } catch (_: Throwable) { false }
                a.runOnUiThread {
                    val words = L.t(if (made) "privacy.reset_done" else "privacy.reset_failed")
                    android.widget.Toast.makeText(a, words, android.widget.Toast.LENGTH_LONG).show()
                }
            }
        })
        return UI.scroller(a, col)
    }
}
