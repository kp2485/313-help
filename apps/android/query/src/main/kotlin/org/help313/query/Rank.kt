// One ranking rule (schema/query-spec.md "Ranking", DECISIONS 10-B2), port of packages/query/src/rank.ts:
//   eligibility -> preferred flags (if asked) -> distance band -> reported-closed last -> open-now / next-open
//   -> distance -> id
// No freshness tier: time passing never reorders a list; only reports do (DECISIONS 2026-09-19).
// Distance comes before everything except eligibility because many users have no car.
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

private fun openKeyNow(o: OpenResult, today: String): Int = when (o.state) {
    OpenState.OPEN -> 0
    OpenState.CLOSES_SOON -> 1
    OpenState.CLOSED -> {
        val next = o.next
        if (next == null) 5 else if (next.date == today) 2 else 4
    }
    OpenState.CALL_FIRST -> 3
    else -> 6   // unknown sorts last: never implied open
}

private fun openKeyWeek(row: BundleRow, o: OpenResult, nowMillis: Long, alerts: List<Alert>): Int = when (o.state) {
    OpenState.OPEN, OpenState.CLOSES_SOON -> 0
    OpenState.CALL_FIRST -> 1
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
            // DV rows never carry coordinates, so they never get a distance (docs/08).
            val near = q.near
            val mi = if (near != null && row.lat != null && row.lon != null)
                miles(near, LatLon(row.lat, row.lon)) else null
            val open = openNow(row, nowMillis, alerts)
            val key = if (q.mode == "week") openKeyWeek(row, open, nowMillis, alerts) else openKeyNow(open, today)
            Ranked(row, open, badge(row, nowMillis), mi, bandOf(mi)) to key
        }

    // Rows with 2+ standing closed reports stay visible but go last in their band (docs/04).
    fun reported(r: Ranked) = if (r.badge.level == "reported_closed") 1 else 0
    fun preferred(r: Ranked) =
        if (q.prefer.isNotEmpty() && q.prefer.all { r.row.flags.contains(it) }) 0 else 1

    return scored.sortedWith(
        compareBy(
            { preferred(it.first) },
            { it.first.band },
            { reported(it.first) },
            { it.second },
            { it.first.miles ?: 0.0 },
            { it.first.row.id },
        )
    ).map { it.first }
}
