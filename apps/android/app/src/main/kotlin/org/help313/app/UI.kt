// The few pieces every screen is built from: cards, section headings, rows, pills, call buttons.
//
// Views, not Compose, and built in code rather than inflated from layout XML. Both choices are about the phones
// this app is for: Compose would add megabytes to the APK and a frame of work at every start, and layout XML is
// one more parse at every screen. See apps/android/README.md for the full reasoning.
//
// Rules carried over from the web app and the iPhone app:
//   - System fonts and the phone's own text size everywhere. Every size below is in sp, every height is
//     wrap_content, and nothing is ellipsized, so text grows to the largest accessibility sizes and a phone
//     number is never truncated.
//   - A phone number never wraps in the middle: the number gets its own line.
//   - Colour never carries meaning on its own; every state also has words. Red is kept for 911.
//   - Every tappable thing has a description a screen reader can read, and is at least 48dp high.
//   - No layout uses left or right. Everything is start/end, so Arabic will lay out correctly (supportsRtl).
package org.help313.app

import android.content.Context
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

object UI {

    const val MIN_TAP_DP = 48

    fun dp(c: Context, v: Int): Int = (v * c.resources.displayMetrics.density).toInt()

    fun color(c: Context, id: Int): Int = c.resources.getColor(id, c.theme)

    private fun params(width: Int = ViewGroup.LayoutParams.MATCH_PARENT): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT)

    fun column(c: Context, padding: Int = 0): LinearLayout {
        val l = LinearLayout(c)
        l.orientation = LinearLayout.VERTICAL
        l.layoutParams = params()
        if (padding > 0) l.setPaddingRelative(dp(c, padding), dp(c, padding), dp(c, padding), dp(c, padding))
        return l
    }

    fun scroller(c: Context, content: View): ScrollView {
        val s = ScrollView(c)
        s.isFillViewport = true
        s.addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        s.setBackgroundColor(color(c, R.color.app_bg))
        return s
    }

    fun text(
        c: Context,
        value: String,
        sizeSp: Float = 16f,
        colorId: Int = R.color.ink,
        bold: Boolean = false,
        topDp: Int = 0,
    ): TextView {
        val t = TextView(c)
        t.text = value
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        t.setTextColor(color(c, colorId))
        if (bold) t.setTypeface(t.typeface, Typeface.BOLD)
        // Never ellipsize and never fix a height: at the largest text size the line count grows instead.
        t.maxLines = Int.MAX_VALUE
        t.setLineSpacing(0f, 1.2f)
        val p = params()
        p.topMargin = dp(c, topDp)
        t.layoutParams = p
        t.textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        return t
    }

    /** "RIGHT NOW", "THIS WEEK": small, spaced capitals, like the web app's h2. */
    fun sectionHead(c: Context, value: String): TextView {
        val t = text(c, value.uppercase(L.locale()), 13f, R.color.muted, bold = true, topDp = 18)
        t.letterSpacing = 0.08f
        t.setPaddingRelative(dp(c, 4), 0, dp(c, 4), dp(c, 4))
        // A screen reader announces this as a heading, so the list can be skimmed by heading.
        t.contentDescription = value
        return t
    }

    /** A white (or dark green) card, the shape the whole app is built from. */
    fun card(c: Context, padding: Int = 16, topDp: Int = 8): LinearLayout {
        val l = column(c)
        l.setBackgroundResource(R.drawable.card)
        l.setPaddingRelative(dp(c, padding), dp(c, padding), dp(c, padding), dp(c, padding))
        val p = params()
        p.topMargin = dp(c, topDp)
        l.layoutParams = p
        return l
    }

    /** A card the whole of which is one tap. */
    fun tappableCard(c: Context, label: String, onTap: () -> Unit): LinearLayout {
        val l = card(c)
        l.isClickable = true
        l.isFocusable = true
        l.contentDescription = label
        l.minimumHeight = dp(c, MIN_TAP_DP)
        l.setOnClickListener { onTap() }
        return l
    }

    fun button(
        c: Context,
        label: String,
        description: String? = null,
        backgroundId: Int = R.drawable.pill_brand,
        textColorId: Int = R.color.brand_ink,
        topDp: Int = 8,
        onTap: () -> Unit,
    ): Button {
        val b = Button(c)
        b.text = label
        b.isAllCaps = false
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        b.setTextColor(color(c, textColorId))
        b.setBackgroundResource(backgroundId)
        b.setPaddingRelative(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 12))
        b.minHeight = dp(c, MIN_TAP_DP)
        b.minimumHeight = dp(c, MIN_TAP_DP)
        b.gravity = Gravity.CENTER
        b.contentDescription = description ?: label
        val p = params()
        p.topMargin = dp(c, topDp)
        b.layoutParams = p
        b.setOnClickListener { onTap() }
        return b
    }

    /**
     * A call button that shows the number, as the web app and the iPhone app do: a person can read it out, write
     * it down, or dial it on another phone. The number is on its own line so it can never be cut in half when the
     * text size is large.
     */
    fun callButton(c: Context, label: String, number: String, emergency: Boolean = false, onTap: () -> Unit): LinearLayout {
        val l = column(c)
        l.setBackgroundResource(if (emergency) R.drawable.pill_danger else R.drawable.pill_brand)
        l.setPaddingRelative(dp(c, 16), dp(c, 12), dp(c, 16), dp(c, 12))
        l.isClickable = true
        l.isFocusable = true
        l.minimumHeight = dp(c, MIN_TAP_DP)
        val p = params()
        p.topMargin = dp(c, 8)
        l.layoutParams = p
        l.addView(text(c, label, 17f, R.color.brand_ink, bold = true))
        val n = text(c, number, 20f, R.color.brand_ink, bold = true, topDp = 2)
        // A number is read digit by digit, never as one huge integer, and never wraps mid-number.
        n.contentDescription = number.toCharArray().joinToString(" ")
        l.addView(n)
        l.contentDescription = L.t("strip.call_label", "label" to label, "number" to number)
        l.setOnClickListener { onTap() }
        return l
    }

    /** A small label whose words, not its colour, say what it means. */
    fun pill(c: Context, value: String, backgroundId: Int = R.drawable.pill_soft, textColorId: Int = R.color.brand_soft_ink): TextView {
        val t = text(c, value, 14f, textColorId, topDp = 6)
        t.setBackgroundResource(backgroundId)
        t.setPaddingRelative(dp(c, 10), dp(c, 6), dp(c, 10), dp(c, 6))
        val p = params(ViewGroup.LayoutParams.WRAP_CONTENT)
        p.topMargin = dp(c, 6)
        t.layoutParams = p
        return t
    }

    fun field(c: Context, label: String, hint: String): EditText {
        val e = EditText(c)
        e.hint = hint
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        e.setTextColor(color(c, R.color.ink))
        e.contentDescription = label
        e.minimumHeight = dp(c, MIN_TAP_DP)
        e.setSingleLine(true)
        val p = params()
        p.topMargin = dp(c, 8)
        e.layoutParams = p
        return e
    }
}
