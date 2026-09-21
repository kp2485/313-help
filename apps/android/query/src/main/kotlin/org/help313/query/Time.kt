// All schedule math happens on a floating America/Detroit wall clock (schema/query-spec.md "Time").
// A pantry's sign says "Fridays 1:30"; that is 1:30 on the wall in July and in December. The current instant is
// turned into Detroit wall time once, then compared wall to wall, so daylight saving time cannot break it.
//
// Port of packages/query/src/time.ts and apps/ios/Sources/DetroitQuery/Time.swift.
//
// Why the zone rule is written out here instead of java.time: java.time needs API 26, or core-library desugaring
// and the dependency that comes with it. This module has no dependencies at all, so it runs on API 24 phones and in
// a plain JVM test with nothing installed but Kotlin.
//
// **The rule is correct from 1987 onwards, and not before.** Two rules are implemented: the United States rule in
// force since 2007 (Energy Policy Act of 2005 — second Sunday in March to first Sunday in November) and the
// 1987-2006 one (first Sunday in April to last Sunday in October). Michigan has observed both without exception.
// An instant before 1987 is answered as Eastern Standard Time, the year round: the rule is clamped to the year it
// is valid from, so no daylight window is ever found in an earlier year. That is a defined answer rather than a
// correct one, and this file used to claim it was correct (Android review, 2026-09-20). Detroit's actual history is
// nothing like the rules here: the window was the last
// Sunday in April from 1976 to 1986, it started in January 1974 and in February 1975 under the Emergency Daylight
// Saving Time Energy Conservation Act, and Michigan did not observe daylight saving at all from 1969 to 1972, when
// the whole state sat on Eastern Standard Time the year round.
//
// Nothing in this app has a date before 1987 in it, and nothing ever will: every date here is a schedule a place
// published, a day a steward wrote down, or the moment a bundle was built. So the clamp is deliberate rather than a
// gap to fill — implementing forty years of repealed federal law would be code nobody can check against anything
// this app reads. `FixtureTest.theZoneRuleIsClampedBefore1987` pins what the clamp actually does at two instants
// where history and this file disagree, so the behaviour is documented rather than merely undefined.
//
// If the rule ever changes, this file and schema/query-spec.md change together.
package org.help313.query

/** Minutes past midnight 1970-01-01 on a floating Detroit wall clock (as if the wall time were UTC). */
typealias WallMinutes = Int

const val ZONE = "America/Detroit"

private const val EST_OFFSET = -300     // minutes
private const val DAY = 1440

data class Wall(val y: Int, val m: Int, val d: Int, val hh: Int, val mm: Int)

/** Days since 1970-01-01 for a calendar date (proleptic Gregorian). Pure arithmetic: no time zone involved. */
fun dayNumber(y: Int, m: Int, d: Int): Int {
    val a = (14 - m) / 12
    val yy = y + 4800 - a
    val mm = m + 12 * a - 3
    val jdn = d + (153 * mm + 2) / 5 + 365 * yy + yy / 4 - yy / 100 + yy / 400 - 32045
    return jdn - 2440588
}

data class CivilDate(val y: Int, val m: Int, val d: Int)

fun civil(day: Int): CivilDate {
    val z = day + 719468
    val era = (if (z >= 0) z else z - 146096) / 146097
    val doe = z - era * 146097
    val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    return CivilDate(yoe + era * 400 + (if (m <= 2) 1 else 0), m, d)
}

/** 0 = Monday ... 6 = Sunday. */
fun weekday(day: Int): Int = ((day + 3) % 7 + 7) % 7

private fun floorDiv(a: Int, b: Int): Int = Math.floorDiv(a, b)
private fun floorDivLong(a: Long, b: Long): Long = Math.floorDiv(a, b)

/** Day number of the nth Sunday of a month (n is 1-based). */
private fun nthSunday(y: Int, m: Int, n: Int): Int {
    val first = dayNumber(y, m, 1)
    val toSunday = (6 - weekday(first) + 7) % 7
    return first + toSunday + (n - 1) * 7
}

/**
 * Is this moment, expressed in local STANDARD time, inside Detroit's daylight saving window?
 * Boundaries in local standard time: start 02:00 on the DST start date, end 01:00 on the DST end date
 * (02:00 daylight time, which is 01:00 standard). That is what makes the 1:30am that happens twice on fall-back
 * night come out as 01:30 both times, which fixture 02-overnight.json checks.
 */
/** The first year this file's rules are actually the rules Detroit kept. Before it, [isDaylight] clamps. */
const val ZONE_RULE_FROM_YEAR = 1987

private fun isDaylight(standardMinutes: Long): Boolean {
    val actual = civil(floorDivLong(standardMinutes, DAY.toLong()).toInt()).y
    // Clamped, and said out loud rather than implied. The window is computed for 1987 even for a 1970 instant, and
    // a 1970 instant is never inside a 1987 window, so every pre-1987 moment comes out as Eastern Standard Time.
    // Defined, documented, and not what Detroit did — see the top of this file. No date this app handles is that
    // old, and FixtureTest.theZoneRuleIsClampedBefore1987 holds this behaviour still.
    val y = if (actual < ZONE_RULE_FROM_YEAR) ZONE_RULE_FROM_YEAR else actual
    val start: Int
    val end: Int
    if (y >= 2007) {
        start = nthSunday(y, 3, 2)          // second Sunday in March
        end = nthSunday(y, 11, 1)           // first Sunday in November
    } else {
        start = nthSunday(y, 4, 1)          // 1987-2006: first Sunday in April
        var last = nthSunday(y, 10, 5)      // last Sunday in October
        if (civil(last).m != 10) last -= 7
        end = last
    }
    val startMin = start.toLong() * DAY + 120
    val endMin = end.toLong() * DAY + 60
    return standardMinutes >= startMin && standardMinutes < endMin
}

/** Detroit wall-clock fields of an instant (epoch milliseconds). */
fun toWall(instantMillis: Long): Wall {
    val w = wallMinutes(instantMillis)
    val c = civil(floorDiv(w, DAY))
    val inDay = w - floorDiv(w, DAY) * DAY
    return Wall(c.y, c.m, c.d, inDay / 60, inDay % 60)
}

/** Detroit wall-clock minutes of an instant (epoch milliseconds). */
fun nowWallMinutes(instantMillis: Long): WallMinutes = wallMinutes(instantMillis)

private fun wallMinutes(instantMillis: Long): Int {
    val utc = floorDivLong(instantMillis, 60_000L)
    val standard = utc + EST_OFFSET
    return (if (isDaylight(standard)) standard + 60 else standard).toInt()
}

fun wallMinutes(w: Wall): WallMinutes = dayNumber(w.y, w.m, w.d) * DAY + w.hh * 60 + w.mm

/** Day number of a YYYY-MM-DD (or the date part of a longer string). Null if it is not a date. */
fun parseDay(s: String): Int? {
    if (s.length < 10) return null
    val y = s.substring(0, 4).toIntOrNull() ?: return null
    if (s[4] != '-' || s[7] != '-') return null
    val m = s.substring(5, 7).toIntOrNull() ?: return null
    val d = s.substring(8, 10).toIntOrNull() ?: return null
    if (m !in 1..12 || d !in 1..31) return null
    return dayNumber(y, m, d)
}

fun dayString(day: Int): String {
    val c = civil(day)
    return pad4(c.y) + "-" + pad2(c.m) + "-" + pad2(c.d)
}

private fun pad2(n: Int) = if (n < 10) "0$n" else "$n"
private fun pad4(n: Int) = when {
    n < 10 -> "000$n"; n < 100 -> "00$n"; n < 1000 -> "0$n"; else -> "$n"
}

private val DATE_RE = Regex("^\\d{4}-\\d{2}-\\d{2}$")
private val TIME_RE = Regex("^\\d{2}:\\d{2}$")

/** A schedule date: exactly YYYY-MM-DD, and a day that exists (no 2026-02-30). */
fun parseScheduleDay(s: String): Int? {
    if (!DATE_RE.matches(s)) return null
    val d = parseDay(s) ?: return null
    return if (dayString(d) == s) d else null
}

/** "HH:MM" on a 24-hour clock, exactly. 24:00 is the end of the day; nothing later. Returns minutes past midnight. */
fun parseClock(s: String): Int? {
    if (!TIME_RE.matches(s)) return null
    val h = s.substring(0, 2).toIntOrNull() ?: return null
    val m = s.substring(3, 5).toIntOrNull() ?: return null
    if (h > 24 || m > 59 || (h == 24 && m != 0)) return null
    return h * 60 + m
}

fun wallDateString(w: Wall): String = pad4(w.y) + "-" + pad2(w.m) + "-" + pad2(w.d)

/** Whole days between two YYYY-MM-DD dates (b - a). */
fun daysBetween(a: String, b: String): Int = (parseDay(b) ?: 0) - (parseDay(a) ?: 0)

/** ISO 8601 instants as the bundle writes them: "2026-09-18T17:45Z", "...:30Z", "...:30.512Z", "...-04:00". */
fun parseInstant(s: String): Long? {
    if (s.length < 16) return null
    val day = parseDay(s) ?: return null
    if (s[10] != 'T' && s[10] != 't' && s[10] != ' ') return null
    val hh = s.substring(11, 13).toIntOrNull() ?: return null
    if (s[13] != ':') return null
    val mi = s.substring(14, 16).toIntOrNull() ?: return null
    var i = 16
    var secondsMillis = 0L
    if (i < s.length && s[i] == ':') {
        var j = i + 1
        while (j < s.length && (s[j].isDigit() || s[j] == '.')) j++
        val secs = s.substring(i + 1, j).toDoubleOrNull() ?: return null
        secondsMillis = Math.round(secs * 1000.0)
        i = j
    }
    var offset = 0
    if (i < s.length && (s[i] == '+' || s[i] == '-')) {
        val sign = if (s[i] == '-') -1 else 1
        val rest = s.substring(i + 1).replace(":", "")
        if (rest.length < 4) return null
        val oh = rest.substring(0, 2).toIntOrNull() ?: return null
        val om = rest.substring(2, 4).toIntOrNull() ?: return null
        offset = sign * (oh * 60 + om)
    }
    val minutes = day.toLong() * DAY + hh * 60 + mi - offset
    return minutes * 60_000L + secondsMillis
}

/** "2026-09-18T08:00:00.000Z" — the shape the fixtures compare effectiveNow against. */
fun isoUtc(millis: Long): String {
    val totalMs = Math.floorMod(millis, 86_400_000L).toInt()
    val day = floorDivLong(millis, 86_400_000L).toInt()
    val c = civil(day)
    val ms = totalMs % 1000
    val sec = totalMs / 1000 % 60
    val min = totalMs / 60_000 % 60
    val hour = totalMs / 3_600_000
    return pad4(c.y) + "-" + pad2(c.m) + "-" + pad2(c.d) + "T" + pad2(hour) + ":" + pad2(min) + ":" + pad2(sec) +
        "." + (if (ms < 10) "00$ms" else if (ms < 100) "0$ms" else "$ms") + "Z"
}

/**
 * Cheap phones lose their clock. If the device says it is earlier than the moment the bundle was built,
 * the device is wrong; use the bundle's time instead.
 */
fun effectiveNow(deviceNowMillis: Long, bundleGeneratedAt: String?): Long {
    val built = bundleGeneratedAt?.let { parseInstant(it) } ?: return deviceNowMillis
    return if (deviceNowMillis < built) built else deviceNowMillis
}
