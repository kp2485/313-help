// Turning what the query rules computed into words. The wording itself always comes from strings/*.json:
// no sentence is ever built out of English fragments in code.
package org.help313.app

import org.help313.query.Badge
import org.help313.query.BundleAge
import org.help313.query.OpenResult
import org.help313.query.OpenState
import org.help313.query.parseClock
import org.help313.query.parseDay
import java.text.DateFormat
import java.util.Date
import java.util.TimeZone

/** "13:30" as a person reads it. */
fun clock(hhmm: String): String {
    val m = parseClock(hhmm) ?: return hhmm
    val h = m / 60
    val mm = m % 60
    val hour = (h + 11) % 12 + 1
    val suffix = if (h < 12 || h == 24) "am" else "pm"
    return if (mm > 0) "$hour:${if (mm < 10) "0$mm" else "$mm"} $suffix" else "$hour $suffix"
}

/** A YYYY-MM-DD shown in the reader's language. Dates are calendar days, so they are formatted in UTC. */
fun dateText(day: String): String {
    val d = parseDay(day) ?: return day
    val f = DateFormat.getDateInstance(DateFormat.MEDIUM, L.locale())
    f.timeZone = TimeZone.getTimeZone("UTC")
    return f.format(Date(d.toLong() * 86_400_000L))
}

/** Badge text from its key and dated facts (docs/04). The badge never says "verified". */
fun badgeText(b: Badge): String {
    val p = HashMap(b.params)
    for (k in listOf("date", "source_date")) p[k]?.let { if (it.isNotEmpty()) p[k] = dateText(it) }
    return L.t(b.key, p)
}

/** "Today" / "Tomorrow" when that is what it is, otherwise the date. `today` is a Detroit calendar day. */
fun dayText(day: String, today: String): String {
    val d = parseDay(day) ?: return day
    val t = parseDay(today) ?: return dateText(day)
    return when (d - t) {
        0 -> L.t("day.today")
        1 -> L.t("day.tomorrow")
        else -> dateText(day)
    }
}

/** Unknown is never rendered as open (schema/query-spec.md "Open now"). */
fun openText(o: OpenResult, today: String = ""): String = when (o.state) {
    OpenState.OPEN -> o.closesAt?.let { L.t("open.open_until", "time" to clock(it)) } ?: L.t("open.open")
    OpenState.CLOSES_SOON -> L.t("open.closes_soon", "time" to clock(o.closesAt ?: ""))
    OpenState.CLOSED -> {
        val next = o.next
        when {
            o.cancelledNow -> L.t("open.cancelled")
            next == null -> L.t("open.closed_no_next")
            else -> L.t("open.closed_next", "day" to dayText(next.date, today), "time" to clock(next.opensAt))
        }
    }
    OpenState.CALL_FIRST -> L.t("open.call_first")
    else -> L.t("open.unknown")
}

/**
 * How old this phone's copy of the list is (schema/query-spec.md "Bundle age"). It says nothing about any
 * listing: it tells the person their phone may be missing recent reports.
 */
fun bundleAgeText(age: BundleAge, days: Int, builtDay: String): String? = when (age) {
    BundleAge.FRESH -> null
    BundleAge.AGING -> L.t("bundle.aging", "days" to days.toString())
    BundleAge.OLD -> L.t("bundle.old", "date" to (if (builtDay.isEmpty()) "" else dateText(builtDay)))
    BundleAge.RETIRED -> L.t("bundle.sunset")
}
