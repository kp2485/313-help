// The screens. Every listing shows a freshness badge computed here, on the device, from the dated facts in the
// signed bundle (docs/04) — never a value frozen at build time, and never the word "verified" for something no
// person checked. Unknown hours are never rendered as open. Reports label rows; they never hide them.
package org.help313.app

import android.view.View
import android.widget.LinearLayout
import org.help313.query.BundleRow
import org.help313.query.Query
import org.help313.query.Ranked
import org.help313.query.badge
import org.help313.query.nextOccurrences
import org.help313.query.openNow
import org.help313.query.rank
import org.help313.query.search as querySearch

object Screens {

    // ---- Home ----------------------------------------------------------------------------------------------

    fun home(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("app.name"), 28f, R.color.brand, bold = true))
        col.addView(UI.text(a, L.t("home.hero"), 20f, R.color.ink, topDp = 4))

        noteBar(a, col)

        if (a.store.bundle == null) {
            col.addView(UI.text(a, if (a.store.loadFailed) L.t("home.no_data") else L.t("home.loading"), 17f, R.color.muted, topDp = 16))
            if (a.store.loadFailed) {
                col.addView(UI.callButton(a, L.t("home.retry"), "211") { a.dial("211") })
            }
            return UI.scroller(a, col)
        }

        // Urgent help is reachable from every screen, and 911 and 988 are always the first two.
        col.addView(UI.button(a, L.t("strip.more"), topDp = 16) { a.push { urgent(a) } })

        col.addView(UI.sectionHead(a, L.t("home.help_title")))
        col.addView(UI.text(a, L.t("home.help_sub"), 16f, R.color.muted))
        for (key in listOf("quick.food", "quick.shelter", "quick.doctor", "quick.narcan")) {
            val needId = when (key) {
                "quick.food" -> "food"; "quick.shelter" -> "shelter"; "quick.doctor" -> "doctor"; else -> "narcan"
            }
            val need = NEEDS.first { it.id == needId }
            val card = UI.tappableCard(a, L.t(key)) { a.push { needScreen(a, need) } }
            card.addView(UI.text(a, L.t(key), 18f, R.color.ink, bold = true))
            col.addView(card)
        }

        col.addView(UI.button(a, L.t("home.see_all"), topDp = 16) { a.go { help(a) } })

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
            a.push { about(a) }
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
                val card = UI.tappableCard(a, label) { a.push { needScreen(a, need) } }
                card.addView(UI.text(a, label, 18f, R.color.ink, bold = true))
                col.addView(card)
            }
        }

        col.addView(UI.sectionHead(a, L.t("home.categories")))
        for ((id, query) in CATEGORIES) {
            val label = L.t("cat.$id")
            val card = UI.tappableCard(a, label) { a.push { results(a, label, query) } }
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
                val card = UI.tappableCard(a, label) {
                    // A choice may bring its own numbers: the emergency-room list leads with 911.
                    a.push { results(a, label, r.query, need.emptyKey, need.sensitive, r.first) }
                }
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

        val q = if (sensitive) query else query.copy(near = a.near)
        val ranked = rank(bundle.rows, q, a.now(), bundle.alerts)
        if (ranked.isEmpty()) {
            col.addView(UI.text(a, L.t(emptyKey ?: "results.none"), 17f, R.color.muted, topDp = 16))
            return UI.scroller(a, col)
        }
        for (r in ranked) col.addView(listingCard(a, r, showDistance = !sensitive))
        return UI.scroller(a, col)
    }

    /** One row in a list: name, what you get, open now, the badge, and how far. Never a bare colour. */
    private fun listingCard(a: MainActivity, r: Ranked, showDistance: Boolean): View {
        val card = UI.tappableCard(a, r.row.name) { a.push { detail(a, r.row) } }
        card.addView(UI.text(a, r.row.name, 18f, R.color.ink, bold = true))
        if (r.row.what.isNotEmpty()) card.addView(UI.text(a, r.row.what, 16f, R.color.muted, topDp = 2))
        card.addView(UI.pill(a, openText(r.open, a.today())))
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
        col.addView(UI.pill(a, openText(open, a.today())))
        col.addView(UI.text(a, badgeText(badge(row, now)), 15f, R.color.muted, topDp = 8))
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

        // Addresses and distances are shown for everything except the sensitive categories, whose rows carry no
        // coordinates at all (docs/08).
        if (!isSensitive(row.category)) {
            val addr = row.address
            if (addr != null) {
                col.addView(UI.sectionHead(a, L.t("detail.where")))
                col.addView(UI.text(a, addr.line1 + ", " + addr.city + (addr.zip?.let { " $it" } ?: ""), 17f, R.color.ink))
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
                col.addView(UI.text(a, dayText(o.date, a.today()) + " " + clock(o.opensAt) + "-" + clock(o.closesAt), 16f, R.color.ink, topDp = 2))
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
        for (kind in LISTING_KINDS) {
            card.addView(UI.button(a, L.t("report.kind.$kind"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                send(a, row.id, kind, note.text.toString())
            })
        }
        card.addView(UI.text(a, L.t("add.privacy"), 14f, R.color.muted, topDp = 8))
        return card
    }

    private fun send(a: MainActivity, targetId: String, kind: String, detail: String) {
        val nowMillis = a.now()
        Thread {
            // Building the report reads (or makes) the install secret, and sending it touches the network:
            // neither belongs on the main thread.
            val r = ReportStore.build(a, targetId, kind, detail, nowMillis)
            val sent = ReportStore.submit(a, r)
            a.runOnUiThread {
                android.widget.Toast.makeText(a, L.t(if (sent) "report.sent" else "report.queued"), android.widget.Toast.LENGTH_LONG).show()
            }
        }.start()
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

        val od = NEEDS.first { it.id == "overdose_now" }
        val card = UI.tappableCard(a, L.t("od.title")) { a.push { needScreen(a, od) } }
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
        val box = UI.field(a, L.t("search.label"), L.t("search.label"))
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
        for (k in listOf("about.p1", "about.p2", "about.data")) col.addView(UI.text(a, L.t(k), 16f, R.color.ink, topDp = 8))
        val signing = a.store.bundle?.index?.signing
        col.addView(UI.text(a, L.t(if (signing == "dev") "about.sig_dev" else "about.sig_ok"), 15f, R.color.muted, topDp = 12))

        col.addView(UI.sectionHead(a, L.t("privacy.title")))
        col.addView(UI.text(a, L.t("privacy.lede"), 16f, R.color.ink))
        for (k in listOf("privacy.phone_1", "privacy.phone_2", "privacy.phone_3", "privacy.phone_4", "privacy.phone_5")) {
            col.addView(UI.text(a, L.t(k), 16f, R.color.ink, topDp = 6))
        }
        col.addView(UI.text(a, L.t("privacy.reset"), 16f, R.color.ink, topDp = 12))
        col.addView(UI.button(a, L.t("privacy.reset_btn"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
            ReportStore.resetInstallSecret(a)
            android.widget.Toast.makeText(a, L.t("privacy.reset_done"), android.widget.Toast.LENGTH_LONG).show()
        })
        return UI.scroller(a, col)
    }
}
