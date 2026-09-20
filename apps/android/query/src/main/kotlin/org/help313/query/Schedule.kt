// Occurrences and open-now (schema/query-spec.md "Occurrences", "Open now").
// Port of packages/query/src/schedule.ts and apps/ios/Sources/DetroitQuery/Schedule.swift.
//
// The web app uses the `rrule` library. Here, as on iPhone, the few rule shapes the directory allows are evaluated
// directly, day by day, over a short window: 120 days of a handful of schedules is a few thousand integer
// comparisons, which is cheaper than any library and adds nothing to the APK. Both are held to the same fixtures.
package org.help313.query

private const val CLOSES_SOON_MINUTES = 30
private const val LOOKAHEAD_DAYS = 120
private const val DAY = 1440

/** nth = 2 for "second", -1 for "last", null for "every". weekday: 0 = Monday. */
internal data class DayRule(val nth: Int?, val weekday: Int)

private val CODES = mapOf("MO" to 0, "TU" to 1, "WE" to 2, "TH" to 3, "FR" to 4, "SA" to 5, "SU" to 6)
private val NTH_RE = Regex("^[+-]?[1-5]$")
private val MONTHDAY_RE = Regex("^-?\\d{1,2}$")

internal fun parseByday(s: String): List<DayRule>? {
    val out = ArrayList<DayRule>()
    for (raw in s.split(",")) {
        val t = raw.trim().uppercase()
        if (t.length < 2) return null
        val wd = CODES[t.substring(t.length - 2)] ?: return null
        val n = t.substring(0, t.length - 2)
        when {
            n.isEmpty() -> out.add(DayRule(null, wd))
            NTH_RE.matches(n) -> out.add(DayRule(n.toIntOrNull() ?: return null, wd))
            else -> return null
        }
    }
    return if (out.isEmpty()) null else out
}

internal fun parseBymonthday(s: String): List<Int>? {
    val out = ArrayList<Int>()
    for (raw in s.split(",")) {
        val t = raw.trim()
        if (!MONTHDAY_RE.matches(t)) return null
        val n = t.toIntOrNull() ?: return null
        if (n == 0 || n < -31 || n > 31) return null
        out.add(n)
    }
    return if (out.isEmpty()) null else out
}

/**
 * The pipeline's validator (assertScheduleValid). A schedule that fails it is skipped, never guessed at:
 * a guess could say "open".
 */
fun scheduleIsValid(s: Schedule): Boolean {
    if (parseScheduleDay(s.dtstart) == null) return false
    if (parseClock(s.opensAt) == null || parseClock(s.closesAt) == null) return false
    for (d in listOf(s.until, s.validFrom, s.validTo)) if (d != null && parseScheduleDay(d) == null) return false
    val freq = s.freq
    if (freq != null && freq !in setOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY")) return false
    val interval = s.interval
    if (interval != null && interval < 1) return false
    // Only the shapes the spec defines, so the web, the iPhone and Android cannot disagree.
    if (s.byday != null) {
        if (freq != "WEEKLY" && freq != "MONTHLY") return false
        val rules = parseByday(s.byday) ?: return false
        // "2nd Tuesday" only means something within a month.
        if (freq == "WEEKLY" && rules.any { it.nth != null }) return false
    }
    if (s.bymonthday != null) {
        if (freq != "MONTHLY") return false
        if (parseBymonthday(s.bymonthday) == null) return false
    }
    return true
}

private fun daysInMonth(y: Int, m: Int): Int =
    dayNumber(if (m == 12) y + 1 else y, if (m == 12) 1 else m + 1, 1) - dayNumber(y, m, 1)

/** Does this schedule open on `day` (days since 1970-01-01)? */
internal fun opensOn(s: Schedule, day: Int): Boolean {
    val start = parseDay(s.dtstart) ?: return false
    if (day < start) return false
    val until = s.until?.let { parseDay(it) }
    if (until != null && day > until) return false
    val freq = s.freq ?: return day == start
    val every = maxOf(1, s.interval ?: 1)
    val rules = s.byday?.let { parseByday(it) }
    val c = civil(day)
    val c0 = civil(start)
    return when (freq) {
        "DAILY" -> (day - start) % every == 0
        "WEEKLY" -> {
            // Weeks start on Monday (RFC 5545 default WKST); "every 2 weeks" counts from the week of dtstart.
            val week = (day - weekday(day) - (start - weekday(start))) / 7
            if (week % every != 0) false
            else if (rules != null) rules.any { it.weekday == weekday(day) }
            else weekday(day) == weekday(start)
        }
        "MONTHLY" -> {
            if (((c.y - c0.y) * 12 + (c.m - c0.m)) % every != 0) return false
            val dim = daysInMonth(c.y, c.m)
            val md = s.bymonthday
            when {
                md != null -> (parseBymonthday(md) ?: emptyList()).any { if (it > 0) it == c.d else dim + it + 1 == c.d }
                rules != null -> rules.any { r ->
                    if (r.weekday != weekday(day)) false
                    else when (val n = r.nth) {
                        null -> true
                        else -> if (n > 0) (c.d - 1) / 7 + 1 == n else (dim - c.d) / 7 + 1 == -n
                    }
                }
                else -> c.d == c0.d
            }
        }
        "YEARLY" -> (c.y - c0.y) % every == 0 && c.m == c0.m && c.d == c0.d
        else -> false
    }
}

internal fun occurrences(row: BundleRow, nowMin: WallMinutes, days: Int): List<Occurrence> {
    val today = Math.floorDiv(nowMin, DAY)
    val out = ArrayList<Occurrence>()
    for (s in row.schedules) {
        if (!scheduleIsValid(s)) continue
        val o = parseClock(s.opensAt) ?: continue
        val c = parseClock(s.closesAt) ?: continue
        var lo = today - 1              // yesterday too, for windows that run past midnight
        var hi = today + days
        s.validFrom?.let { parseDay(it) }?.let { if (it > lo) lo = it }
        s.validTo?.let { parseDay(it) }?.let { if (it < hi) hi = it }
        if (lo > hi) continue
        for (d in lo..hi) {
            if (!opensOn(s, d)) continue
            val start = d * DAY + o
            var end = d * DAY + c
            if (end <= start) end += DAY
            out.add(Occurrence(dayString(d), s.opensAt, s.closesAt, start, end))
        }
    }
    out.sortWith(compareBy({ it.start }, { it.end }))
    return out
}

internal data class CancelWindow(val start: WallMinutes, val end: WallMinutes)

/** Wall-clock windows of published cancellation alerts that name this row. */
internal fun cancelWindows(rowId: String, alerts: List<Alert>): List<CancelWindow> =
    alerts.filter { it.kind == "cancellation" && it.status == "published" && it.targets.contains(rowId) }
        .mapNotNull {
            val s = parseInstant(it.startsAt) ?: return@mapNotNull null
            val e = parseInstant(it.endsAt) ?: return@mapNotNull null
            CancelWindow(nowWallMinutes(s), nowWallMinutes(e))
        }

/**
 * An occurrence is cancelled when it overlaps a cancellation window at all, so a cancellation posted after a
 * pantry opened closes it for the rest of that window.
 */
internal fun isCancelled(o: Occurrence, windows: List<CancelWindow>): Boolean =
    windows.any { o.start < it.end && o.end > it.start }

fun nextOccurrences(row: BundleRow, nowMillis: Long, n: Int, alerts: List<Alert> = emptyList()): List<Occurrence> {
    if (row.status != "active" || row.availability != "scheduled") return emptyList()
    val nowMin = nowWallMinutes(nowMillis)
    val windows = cancelWindows(row.id, alerts)
    return occurrences(row, nowMin, LOOKAHEAD_DAYS)
        .filter { it.end > nowMin && !isCancelled(it, windows) }
        .take(n)
}

fun openNow(row: BundleRow, nowMillis: Long, alerts: List<Alert> = emptyList()): OpenResult {
    if (row.status != "active") return OpenResult(OpenState.NOT_LISTED)
    if (row.availability == "always") {
        // Always open, unless a published cancellation covers right now.
        val nowMin = nowWallMinutes(nowMillis)
        val covered = cancelWindows(row.id, alerts).any { nowMin >= it.start && nowMin < it.end }
        return if (covered) OpenResult(OpenState.CLOSED, next = null, cancelledNow = true) else OpenResult(OpenState.OPEN)
    }
    if (row.availability == "call_first") return OpenResult(OpenState.CALL_FIRST)
    // Unknown is never rendered as open. Nor is a schedule that cannot be read: it is skipped, and with none
    // left the listing is unknown.
    if (row.availability == "unknown" || row.schedules.none { scheduleIsValid(it) }) return OpenResult(OpenState.UNKNOWN)

    val nowMin = nowWallMinutes(nowMillis)
    val windows = cancelWindows(row.id, alerts)
    val occ = occurrences(row, nowMin, LOOKAHEAD_DAYS).filter { it.end > nowMin }

    var cancelledNow = false
    var current: Occurrence? = null
    for (o in occ) {
        if (o.start > nowMin) break
        if (isCancelled(o, windows)) { cancelledNow = true; continue }
        // Overlapping windows: keep the one that stays open longest.
        val held = current
        if (held == null || o.end > held.end) current = o
    }
    val cur = current
    if (cur != null) {
        val left = cur.end - nowMin
        return OpenResult(
            state = if (left < CLOSES_SOON_MINUTES) OpenState.CLOSES_SOON else OpenState.OPEN,
            closesAt = cur.closesAt,
            minutesLeft = left,
        )
    }
    val next = occ.firstOrNull { it.start > nowMin && !isCancelled(it, windows) }
    return OpenResult(
        state = OpenState.CLOSED,
        next = next?.let { NextTime(it.date, it.opensAt, it.closesAt) },
        cancelledNow = cancelledNow,
    )
}
