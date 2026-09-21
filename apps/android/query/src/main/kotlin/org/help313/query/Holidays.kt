// Holidays (schema/query-spec.md "Holidays").
// Port of packages/query/src/holidays.ts and apps/ios/Sources/DetroitQuery/Holidays.swift.
//
// We do not know any place's holiday hours. A clinic's notice says "Closed Thanksgiving and Christmas" in prose
// nobody turned into a schedule, and no source hands us a holiday calendar. So on a holiday a schedule-derived
// "open" is a guess, and unknown is never rendered as open: openNow answers HOLIDAY instead.
//
// A holiday is a date rule computed here, never a list the bundle carries: a phone with a three-month-old copy of
// the list still knows that 25 December is Christmas. The eleven United States federal holidays, plus the observed
// day when a fixed-date one falls at a weekend. Nothing else — the day after Thanksgiving and Christmas Eve are
// deliberately out, because Detroit is largely open on them and calling a day a holiday costs a person the hours we
// do know (DECISIONS 2026-09-20).
package org.help313.query

/** The flag a steward sets on a row whose owner's page says it is open on holidays. */
const val OPEN_HOLIDAYS_FLAG = "open_holidays"

private const val MONDAY = 0
private const val THURSDAY = 3
private const val FRIDAY = 4
private const val SATURDAY = 5
private const val SUNDAY = 6

/** The five holidays on a fixed calendar date; these are the ones that get an observed day. */
private fun isFixedDate(m: Int, d: Int): Boolean =
    (m == 1 && d == 1) ||          // New Year's Day
        (m == 6 && d == 19) ||     // Juneteenth
        (m == 7 && d == 4) ||      // Independence Day
        (m == 11 && d == 11) ||    // Veterans Day
        (m == 12 && d == 25)       // Christmas Day

/** Is this day number (days since 1970-01-01, a Detroit wall-clock date) a holiday? */
fun isHoliday(day: Int): Boolean {
    val c = civil(day)
    val wd = weekday(day)
    if (isFixedDate(c.m, c.d)) return true

    // The Monday holidays, each pinned by the only week of the month its day can fall in.
    if (wd == MONDAY) {
        if (c.m == 1 && c.d in 15..21) return true      // Martin Luther King Jr. Day, 3rd Monday
        if (c.m == 2 && c.d in 15..21) return true      // Washington's Birthday, 3rd Monday
        if (c.m == 5 && c.d >= 25) return true          // Memorial Day, last Monday
        if (c.m == 9 && c.d <= 7) return true           // Labor Day, 1st Monday
        if (c.m == 10 && c.d in 8..14) return true      // Columbus / Indigenous Peoples' Day, 2nd Monday
    }
    if (wd == THURSDAY && c.m == 11 && c.d in 22..28) return true   // Thanksgiving, 4th Thursday

    // Observed days. Saturday -> the Friday before; Sunday -> the Monday after. Both days count, so Christmas 2027
    // (a Saturday) makes Friday the 24th a holiday and stays one itself. Looking at the neighbouring day rather than
    // at a list of dates is what makes 31 December 2027 come out right: 1 January 2028 is a Saturday.
    if (wd == FRIDAY) {
        val n = civil(day + 1)
        if (weekday(day + 1) == SATURDAY && isFixedDate(n.m, n.d)) return true
    }
    if (wd == MONDAY) {
        val p = civil(day - 1)
        if (weekday(day - 1) == SUNDAY && isFixedDate(p.m, p.d)) return true
    }
    return false
}

/** Is this YYYY-MM-DD a holiday? False for anything that is not a date. */
fun isHoliday(date: String): Boolean {
    val day = parseDay(date) ?: return false
    return isHoliday(day)
}
