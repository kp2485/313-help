// One ranking rule (schema/query-spec.md "Ranking", DECISIONS 10-B2), port of packages/query/src/rank.ts:
//   eligibility -> preferred flags (if asked) -> distance band -> wide area -> reported-closed last
//   -> open-now / next-open -> distance -> id
// No freshness tier: time passing never reorders a list; only reports do (DECISIONS 2026-09-19).
// Distance comes before everything except eligibility because many users have no car.
// A domestic-violence row has no coordinate at all, so it gets its band from its service area's public
// reference point instead, and never a distance (Areas.kt, docs/08, DECISIONS 2026-09-20).
package org.help313.query

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class Query(
    /** Category slug or prefix: "food" matches "food.pantry". */
    val category: String? = null,
    /** Every flag listed must be on the row. */
    val flags: List<String> = emptyList(),
    /** Rows with every one of these flags come first; nothing is left out ("I'm under 25": youth shelters first). */
    val prefer: List<String> = emptyList(),
    /** Device location or a typed ZIP's centre. Held in memory only, never written or sent. */
    val near: LatLon? = null,
    /** "now": who is open right now. "week": who has a time in the next 7 days. */
    val mode: String = "now",
)

data class Ranked(
    val row: BundleRow,
    val open: OpenResult,
    val badge: Badge,
    val miles: Double?,
    val band: Int,
)

private const val EARTH_MILES = 3958.8

fun miles(a: LatLon, b: LatLon): Double {
    fun rad(d: Double) = d * Math.PI / 180.0
    val dLat = rad(b.lat - a.lat)
    val dLon = rad(b.lon - a.lon)
    val h = sin(dLat / 2) * sin(dLat / 2) +
        cos(rad(a.lat)) * cos(rad(b.lat)) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * EARTH_MILES * asin(sqrt(h))
}

/** No location known, or a phone-only service: band 0, reachable from anywhere. */
private fun bandOf(mi: Double?): Int = when {
    mi == null -> 0
    mi <= 1 -> 0
    mi <= 3 -> 1
    else -> 2
}

/**
 * Band and wide-area key for a domestic-violence row. Every input is public and per-area: the person's own
 * location (which never leaves the device) and a city hall's coordinate that is identical for every shelter
 * serving that area. The row itself contributes nothing but the name of the area.
 *
 * No location, or no service area: band 0 and wide 0, exactly as a row with no coordinates ranks today.
 */
private fun dvBand(row: BundleRow, near: LatLon?): Pair<Int, Int> {
    val area = row.serviceArea?.let { SERVICE_AREAS[it] }
    if (near == null || area == null) return 0 to 0
    // statewide and national have no local centre: farthest band, and after every local area.
    val point = area.point ?: return 2 to 1
    val mi = miles(near, point)
    return (if (mi <= AREA_BAND_CLOSE_MILES) 0 else if (mi <= AREA_BAND_MID_MILES) 1 else 2) to 0
}

private fun openKeyNow(o: OpenResult, today: String): Int = when (o.state) {
    OpenState.OPEN -> 0
    OpenState.CLOSES_SOON -> 1
    OpenState.CLOSED -> {
        val next = o.next
        if (next == null) 5 else if (next.date == today) 2 else 4
    }
    // A holiday row ranks exactly where "call first" does: we do not know today's hours, so it never sorts above a
    // row that is known to be open (schema/query-spec.md "Holidays").
    OpenState.CALL_FIRST, OpenState.HOLIDAY -> 3
    else -> 6   // unknown sorts last: never implied open
}

private fun openKeyWeek(row: BundleRow, o: OpenResult, nowMillis: Long, alerts: List<Alert>): Int = when (o.state) {
    OpenState.OPEN, OpenState.CLOSES_SOON -> 0
    OpenState.CALL_FIRST, OpenState.HOLIDAY -> 1
    OpenState.UNKNOWN, OpenState.NOT_LISTED -> 3
    else -> {
        val next = nextOccurrences(row, nowMillis, 1, alerts).firstOrNull()
        if (next != null && next.start - nowWallMinutes(nowMillis) <= 7 * 1440) 0 else 2
    }
}

fun categoryMatches(category: String, q: String?): Boolean =
    q == null || category == q || category.startsWith("$q.")

fun rank(rows: List<BundleRow>, q: Query, nowMillis: Long, alerts: List<Alert> = emptyList()): List<Ranked> {
    val today = dayString(Math.floorDiv(nowWallMinutes(nowMillis), 1440))

    val scored = rows
        .filter { it.status == "active" }
        .filter { categoryMatches(it.category, q.category) }
        .filter { row -> q.flags.all { row.flags.contains(it) } }
        .map { row ->
            // DV rows never carry coordinates and never get a distance (docs/08). Their band comes from the public
            // reference point of the area they serve, so proximity works without any fact that locates a shelter.
            val near = q.near
            val dv = isDvCategory(row.category)
            val mi = if (!dv && near != null && row.lat != null && row.lon != null)
                miles(near, LatLon(row.lat, row.lon)) else null
            // Since 2026-09-24 so does any row that names an area and has no coordinate (`servesByArea`).
            val bw = if (servesByArea(row)) dvBand(row, near) else bandOf(mi) to 0
            val open = openNow(row, nowMillis, alerts)
            val key = if (q.mode == "week") openKeyWeek(row, open, nowMillis, alerts) else openKeyNow(open, today)
            Triple(Ranked(row, open, badge(row, nowMillis), mi, bw.first), key, bw.second)
        }

    // Rows with 2+ standing closed reports stay visible but go last in their band (docs/04).
    fun reported(r: Ranked) = if (r.badge.level == "reported_closed") 1 else 0
    fun preferred(r: Ranked) =
        if (q.prefer.isNotEmpty() && q.prefer.all { r.row.flags.contains(it) }) 0 else 1

    return scored.sortedWith(
        compareBy(
            { preferred(it.first) },
            { it.first.band },
            // Statewide and national DV lines after every local area. 0 for every other row, so ordinary lists
            // are untouched.
            { it.third },
            { reported(it.first) },
            { it.second },
            // A DV row's miles is always null, so two shelters in one area are separated by the open key and the
            // id only.
            { it.first.miles ?: 0.0 },
            { it.first.row.id },
        )
    ).map { it.first }
}
