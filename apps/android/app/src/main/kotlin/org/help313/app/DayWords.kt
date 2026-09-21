// How a day is said to a person: "Today", "Tomorrow", or "Friday, Sep 25" — never "2026-09-25", and never a year.
// The same wording as `dayName` in apps/web/src/main.ts and as apps/ios/Sources/HelpCore/DayWords.swift, so a closed
// listing reads the same on the web and on both phones.
//
// Pure, and no android.* class: the caller hands in the day it is in Detroit, the two words from the strings files
// (`day.today`, `day.tomorrow`) and the locale, so `:core:test` holds it on a plain JDK with no clock and no bundle.
//
// The weekday is the locale's own LONG name. The strings files carry only the short forms (`day.MO` is "Mon"), which
// are for the hours table; the web and the iPhone both print the long one here.
package org.help313.app

import org.help313.query.parseDay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DayWords {

    enum class Kind { TODAY, TOMORROW, OTHER }

    /** [date] and [today] are calendar days, "YYYY-MM-DD". Null when either cannot be read. */
    fun kind(date: String, today: String): Kind? {
        val d = parseDay(date) ?: return null
        val t = parseDay(today) ?: return null
        return if (d == t) Kind.TODAY else if (d == t + 1) Kind.TOMORROW else Kind.OTHER
    }

    /**
     * Weekday, month, day — in the order that language writes them. `java.text` has no "best pattern for this
     * skeleton" on a plain JDK (that is `android.text.format.DateFormat`, which `:core` cannot see), so the four
     * orders are written down; the names themselves are the locale's own.
     */
    private fun pattern(locale: Locale): String = when (locale.language) {
        "en" -> "EEEE, MMM d"
        "ar" -> "EEEE، d MMM"
        else -> "EEEE, d MMM"
    }

    /** "Friday, Sep 25". A calendar day has no time zone: it is formatted in UTC from a UTC midnight, as the web does. */
    fun long(date: String, locale: Locale): String {
        val day = parseDay(date) ?: return date
        val f = SimpleDateFormat(pattern(locale), locale)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(day.toLong() * 86_400_000L))
    }

    /** A day that cannot be read is handed back as it came: a wrong date is worse than an odd-looking one. */
    fun name(date: String, today: String, locale: Locale, todayWord: String, tomorrowWord: String): String =
        when (kind(date, today)) {
            Kind.TODAY -> todayWord
            Kind.TOMORROW -> tomorrowWord
            Kind.OTHER -> long(date, locale)
            // No "today" to compare with: still a day by name, never the raw ISO date.
            null -> long(date, locale)
        }
}
