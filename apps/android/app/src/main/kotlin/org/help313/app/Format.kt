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

/**
 * "13:30" as a person reads it: "1:30 pm".
 *
 * "am" and "pm" come from the strings files (`clock.am`, `clock.pm`), like every other word in the app. They were
 * written out in English here, which was the one place a sentence *was* built out of English fragments (Android
 * review, 2026-09-20): Arabic writes ص and م, Bengali writes পূর্বাহ্ণ and অপরাহ্ণ, and all four files have had
 * both keys all along. The web app does this at apps/web/src/main.ts:100 and the iPhone app in Help.swift:152.
 */
fun clock(hhmm: String): String {
    val m = parseClock(hhmm) ?: return hhmm
    val h = m / 60
    val mm = m % 60
    val hour = (h + 11) % 12 + 1
    val suffix = L.t(if (h < 12 || h == 24) "clock.am" else "clock.pm")
    return if (mm > 0) "$hour:${if (mm < 10) "0$mm" else "$mm"} $suffix" else "$hour $suffix"
}

/**
 * Parts of one line joined by the reader's own list separator (`list.sep`), not always a Latin comma and space.
 * Empty parts are dropped, so a place with no ZIP code does not get a line ending in a separator.
 */
fun joinParts(parts: List<String?>): String =
    parts.filter { !it.isNullOrBlank() }.joinToString(L.t("list.sep"))

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

/**
 * The weekday a calendar day falls on, in the reader's own words (`day.MO` … `day.SU`). 1970-01-01, day 0, was a
 * Thursday, so the week starts there; the modulo is written twice over so a day before 1970 cannot give a negative
 * index. The words come from the strings files like every other word in the app; nothing is built out of English here.
 */
fun weekdayText(day: String): String {
    val d = parseDay(day) ?: return ""
    val keys = listOf("TH", "FR", "SA", "SU", "MO", "TU", "WE")
    return L.t("day." + keys[((d % 7) + 7) % 7])
}

/**
 * "Today" / "Tomorrow" when that is what it is, otherwise **the day by name and the date, with no year** —
 * "Friday, Sep 25". `today` is a Detroit calendar day.
 *
 * The rule is [DayWords], which is pure and tested on a plain JDK; this only hands it the app's two words and the
 * reader's locale. It reads exactly like the web (`dayName` in apps/web/src/main.ts) and the iPhone
 * (HelpCore/DayWords.swift). Until 2026-09-21 this printed "Fri, Sep 25, 2026": a short weekday out of the hours
 * table's strings, and a year nobody needs to be told on a pill about next Friday.
 */
fun dayText(day: String, today: String): String =
    DayWords.name(day, today, L.locale(), L.t("day.today"), L.t("day.tomorrow"))

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
    // A holiday: the schedule's hours are the usual ones and say nothing about today (query-spec "Holidays").
    OpenState.HOLIDAY -> L.t("open.holiday")
    else -> L.t("open.unknown")
}

/** The detail screen's holiday line: the usual hours, and a plain "call before you go". Null when it is not one. */
fun holidayNote(o: OpenResult): String? {
    val u = o.usualHours ?: return null
    if (o.state != OpenState.HOLIDAY) return null
    return L.t("detail.holiday", "hours" to (clock(u.opensAt) + " - " + clock(u.closesAt)))
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
