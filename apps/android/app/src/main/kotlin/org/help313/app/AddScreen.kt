// "Add a place that helps" (docs/04), the same form as the web's, field for field.
//
// What this screen collects is about a **place**: its name, the kind of help, what people get, where it is, when
// it is open, its public number, and how the person knows about it. It never asks who they are. The body that
// leaves the phone is the closed eight-key schema in Propose.kt and nothing else — no install secret, no daily
// hash, no location, no identifier — so `api/src/validate.ts` answers 400 to anything we accidentally add.
//
// Two things this screen is careful about, both accessibility:
//
//  - **Every error is beside the field it is about**, said out loud and focused, rather than one banner at the top
//    that leaves a person hunting. The web does the same (`add.e.<field>`).
//  - **What was typed survives a redraw.** The activity handles a font-scale change, dark mode, a language change
//    and multi-window itself and rebuilds the screen from the route; a form that emptied itself every time the
//    phone was turned would be unusable. The values live in [typed], a field in this process, cleared when the
//    screen is left for good — never a file and never savedInstanceState, which the system writes to disk.
package org.help313.app

import android.view.View
import android.widget.EditText

object AddScreen {

    /** What is in the form. In memory, for this process, about a place and never about a person. */
    private val typed = HashMap<String, String>()

    /** The fields a person has been told about, so nothing is marked wrong before they have had a go. */
    private var problems: List<String> = emptyList()

    /** Set once it has gone (or been queued), so the screen can say so instead of offering the form again. */
    private var sent: String? = null

    /**
     * How far down the form was. Picking a kind of help redraws the screen — that is how the chosen one is marked
     * — and a redraw is a new ScrollView, which starts at the top. Without this, choosing "Food" halfway down a
     * fourteen-item list threw the person back to the title every time.
     */
    private var scrolledTo = 0

    /** A fresh form. Called when the screen is opened from somewhere, not when it is redrawn. */
    fun reset() {
        typed.clear()
        problems = emptyList()
        sent = null
        scrolledTo = 0
    }

    /** The scroller this screen is built into, remembering where it was so a redraw does not lose the place. */
    private fun scroller(a: MainActivity, col: android.widget.LinearLayout): View {
        val s = UI.scroller(a, col)
        s.viewTreeObserver.addOnScrollChangedListener { scrolledTo = s.scrollY }
        if (scrolledTo > 0) s.post { s.scrollTo(0, scrolledTo) }
        return s
    }

    fun view(a: MainActivity): View {
        val col = UI.column(a, 16)
        val title = UI.text(a, L.t("add.title"), 24f, R.color.ink, bold = true)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) title.isAccessibilityHeading = true
        col.addView(title)

        val done = sent
        if (done != null) {
            val words = UI.text(a, L.t(done), 17f, R.color.ink, topDp = 12)
            words.isFocusable = true
            col.addView(words)
            col.addView(
                UI.button(a, L.t("add.again"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    reset()
                    a.render()
                },
            )
            return UI.scroller(a, col)
        }

        col.addView(UI.text(a, L.t("add.lede"), 16f, R.color.ink, topDp = 6))
        if (problems.isNotEmpty()) {
            col.addView(UI.pill(a, L.t("add.missing"), R.drawable.pill_warn, R.color.warn_ink))
        }

        var focusFirst: View? = null
        fun remember(name: String, field: EditText) {
            field.setText(typed[name] ?: "")
            field.addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a1: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a1: Int, b: Int, c: Int) = Unit
                override fun afterTextChanged(s: android.text.Editable?) {
                    typed[name] = s?.toString() ?: ""
                }
            })
        }

        /** One labelled field, with its hint, its optional marker, and its own error when it has one. */
        fun field(name: String, required: Boolean, hintKey: String? = null, lines: Int = 1, numeric: Boolean = false) {
            val label = if (required) L.t("add.f.$name") else joinParts(listOf(L.t("add.f.$name"), L.t("add.optional")))
            col.addView(UI.text(a, label, 16f, R.color.ink, bold = true, topDp = 16))
            hintKey?.let { col.addView(UI.text(a, L.t(it), 14f, R.color.muted, topDp = 2)) }
            // An error stops being shown the moment the field has something in it, rather than staying until the
            // next attempt to send: a sentence about an empty box, next to a box that is not empty, is a lie.
            val wrong = problems.contains(name) && typed[name].isNullOrBlank()
            val box = UI.field(a, label, label, suggestions = lines > 1, numeric = numeric, lines = lines)
            // The error is part of what the field is called, so a screen reader landing on it hears the sentence
            // rather than finding it by luck somewhere below.
            box.contentDescription = if (wrong) joinParts(listOf(label, L.t("add.e.$name"))) else label
            remember(name, box)
            col.addView(box)
            if (wrong) {
                col.addView(UI.text(a, L.t("add.e.$name"), 15f, R.color.warn_ink, topDp = 2))
                if (focusFirst == null) focusFirst = box
            }
        }

        /** One set of choices. Buttons, not a spinner: every choice is on the screen and each one is a tap target. */
        fun choices(name: String, ids: List<String>, key: (String) -> String) {
            val wrong = problems.contains(name) && typed[name] == null
            val head = UI.text(a, L.t("add.f.$name"), 16f, R.color.ink, bold = true, topDp = 18)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) head.isAccessibilityHeading = true
            col.addView(head)
            if (wrong) col.addView(UI.text(a, L.t("add.e.$name"), 15f, R.color.warn_ink, topDp = 2))
            for (id in ids) {
                val on = typed[name] == id
                val words = L.t(key(id))
                val b = UI.button(
                    a, words,
                    backgroundId = if (on) R.drawable.pill_brand else R.drawable.pill_soft,
                    textColorId = if (on) R.color.brand_ink else R.color.brand_soft_ink,
                    topDp = 6,
                ) {
                    typed[name] = id
                    a.render()
                }
                // Chosen or not is in the words a screen reader reads, not only in the colour of the button.
                b.contentDescription = if (on) joinParts(listOf(words, L.t("add.f.$name"))) else words
                b.isSelected = on
                if (wrong && focusFirst == null) focusFirst = b
                col.addView(b)
            }
        }

        field("name", required = true)
        choices("category", PROPOSE_CATEGORIES) { "add.cat.$it" }
        field("what", required = true, hintKey = "add.h.what", lines = 3)
        field("address", required = false, hintKey = "add.h.address")
        field("schedule_text", required = false, hintKey = "add.h.schedule")
        field("phone", required = false, hintKey = "add.h.phone")
        choices("how_known", HOW_KNOWN) { "add.how.$it" }
        field("notes", required = false, hintKey = "add.h.notes", lines = 3)

        col.addView(
            UI.button(a, L.t("add.send"), topDp = 20) {
                val proposal = buildProposal(typed)
                if (proposal == null) {
                    problems = proposalErrors(typed)
                    a.render()
                    return@button
                }
                problems = emptyList()
                send(a, proposal)
            },
        )
        col.addView(UI.text(a, L.t("add.privacy"), 14f, R.color.muted, topDp = 8))

        val out = scroller(a, col)
        // The first thing that is wrong takes the focus, and scrolling to it wins over where the form was.
        focusFirst?.let { wrong ->
            wrong.post {
                wrong.requestFocus()
                wrong.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED)
            }
        }
        return out
    }

    /**
     * Off the main thread, on the shared network thread: queueing writes a file and sending opens a connection.
     * A phone with no signal keeps it and says so; nothing is ever lost quietly.
     */
    private fun send(a: MainActivity, p: Proposal) {
        val app = a.applicationContext
        Work.net {
            val key = try {
                if (ProposeStore.submit(app, p)) "add.sent" else "add.queued"
            } catch (_: Throwable) {
                "add.queued"
            }
            a.runOnUiThread {
                sent = key
                if (a.current() is Route.Add) a.render()
                android.widget.Toast.makeText(a, L.t(key), android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }
}
