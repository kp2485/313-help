// "Type a cross street", beside "Use my location" and "Type a ZIP code" — the third way a person can say where
// they are (Kyle, 2026-09-22; DECISIONS 2026-09-22).
//
// Two streets is how people in Detroit say where they are, and it asks nothing of anybody: the answer is worked
// out on this phone from the street geometry the signed bundle already carries (Intersections.kt, which `:core`
// runs on a plain JDK). **The typed text is memory only** — it lives in one field on MainActivity for as long as
// the app is open and never reaches a file, a report, a link or the retained back stack (docs/08).
//
// This file is the field and the sentences around it. Every rule about what a name means and where two streets
// cross is in Intersections.kt.
package org.help313.app

import android.view.View
import android.widget.LinearLayout

object CrossBox {

    /**
     * The control, appended to a column a screen has already started.
     *
     * Three states. With a junction in use it says which one and offers to stop using it; closed it is one button;
     * open it is a field, a button, and whatever the last answer was — a junction, a short list to pick from, or
     * one plain sentence. **No refusal is ever a reason to guess at a point**: a street we do not have is named,
     * two streets that never meet are said to never meet, and the ZIP box is on the screen beside this the whole
     * time.
     */
    fun add(a: MainActivity, col: LinearLayout) {
        val using = a.crossText
        if (using != null) {
            col.addView(UI.text(a, L.t("loc.cross_using", "where" to using), 15f, R.color.muted, topDp = 8))
            col.addView(
                UI.button(a, L.t("loc.cross_off"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.clearCrossing()
                },
            )
            return
        }
        if (!a.crossWanted) {
            col.addView(
                UI.button(a, L.t("loc.cross"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.crossWanted = true
                    a.render()
                },
            )
            return
        }
        col.addView(UI.text(a, L.t("loc.cross_hint"), 14f, R.color.muted, topDp = 8))
        // Told not to be autofilled, learned from or suggested at, exactly as the search box is (UI.field): what a
        // person types here is where they are standing.
        val box = UI.field(a, L.t("loc.cross_label"), L.t("loc.cross_label"), suggestions = false)
        col.addView(box)
        val problem = UI.text(a, "", 15f, R.color.warn_ink, topDp = 4)
        problem.visibility = View.GONE
        col.addView(problem)
        val choices = UI.column(a)
        col.addView(choices)

        col.addView(
            UI.button(a, L.t("loc.cross_go")) {
                choices.removeAllViews()
                problem.visibility = View.GONE
                val typed = box.text.toString()
                val map = MapModel.base
                if (map == null) {
                    say(a, problem, box, L.t("home.loading"))
                    return@button
                }
                when (val out = Intersections.resolve(map, typed)) {
                    null -> say(a, problem, box, L.t("loc.cross_hint"))
                    is CrossOutcome.Point -> a.useCrossing(out.point, joinParts(listOf(out.a, out.b)))
                    is CrossOutcome.Street -> {
                        // One name is an honest answer and the screen says which kind of answer it is before the
                        // map moves: the middle of a street is not a corner.
                        say(a, problem, box, L.t("loc.cross_one_street", "street" to out.a))
                        a.useCrossing(out.point, out.a)
                    }
                    is CrossOutcome.NoCrossing -> say(a, problem, box, L.t("loc.cross_no_crossing", "a" to out.a, "b" to out.b))
                    is CrossOutcome.Unknown -> say(a, problem, box, L.t("loc.cross_unknown", "street" to out.unknown))
                    is CrossOutcome.Choices -> {
                        say(a, problem, box, L.t("loc.cross_choices_say", "count" to out.choices.size.toString()))
                        for (c in out.choices) {
                            val words = if (c.where.isEmpty()) {
                                joinParts(listOf(out.a, out.b))
                            } else {
                                L.t("loc.cross_choice", "a" to out.a, "b" to out.b, "where" to L.t("loc.where_${c.where}"))
                            }
                            val card = UI.tappableCard(a, words) { a.useCrossing(c.point, words) }
                            card.addView(UI.text(a, words, 17f, R.color.ink))
                            choices.addView(card)
                        }
                    }
                }
            },
        )
    }

    /** Shown and said out loud, so it reaches somebody who cannot see the field. */
    private fun say(a: MainActivity, problem: android.widget.TextView, box: android.widget.EditText, words: String) {
        problem.text = words
        problem.visibility = View.VISIBLE
        problem.announceForAccessibility(words)
        box.contentDescription = joinParts(listOf(L.t("loc.cross_label"), words))
    }
}
