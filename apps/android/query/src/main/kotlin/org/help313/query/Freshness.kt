// The badge states what we know, computed on the device from dated facts (docs/04, schema/query-spec.md "Badge").
// It never says "verified" for something no person checked. No artificial timers (DECISIONS 2026-09-19): the
// wording changes only when people report something; time passing changes nothing but the dates shown, and the
// dates are always shown, so a reader can judge "checked in September" for themselves.
//
// Port of packages/query/src/freshness.ts and apps/ios/Sources/DetroitQuery/Freshness.swift.
package org.help313.query

/** Sort keys only; never shown. Ranking uses only the reported-closed level. */
private val TIER = mapOf(
    "confirmed" to 0, "entry_checked" to 1, "source_listed" to 2, "never_checked" to 3,
    "reported_once" to 4, "reported_closed" to 5, "archived" to 6,
)

/** The calendar day of a stored date, on a Detroit calendar. "2026-09-20T01:30Z" is still Sept 19 in Detroit. */
fun detroitDay(s: String): String {
    if (!s.contains("T")) return s.take(10)
    val instant = parseInstant(s) ?: return s.take(10)
    return wallDateString(toWall(instant))
}

private fun make(level: String, key: String, params: Map<String, String>) =
    Badge(level, key, params, TIER.getValue(level))

fun badge(row: BundleRow, nowMillis: Long): Badge {
    val today = wallDateString(toWall(nowMillis))
    val f = row.facts

    if (row.status == "archived") {
        return make("archived", "badge.archived", mapOf("date" to (row.archived?.at?.let { detroitDay(it) } ?: "")))
    }

    // A closed report stands until as many different phones say "still open" after it as said closed, so one tap
    // cannot undo real reports (review 18, Kyle 2026-09-19), or until a person's phone check on a later day.
    val closedAt = f.reports.closedLastAt?.let { detroitDay(it) }
    val confirmedAt = f.lastConfirmedAt?.let { detroitDay(it) }
    val personChecked = f.lastConfirmMethod == "phone" && confirmedAt != null && closedAt != null && confirmedAt > closedAt
    val closedStands = f.reports.closedOpen > 0 && !personChecked && (f.reports.openAfterClosed ?: 0) < f.reports.closedOpen
    if (closedStands) {
        return if (f.reports.closedOpen >= 2) {
            make("reported_closed", "badge.reported_closed",
                mapOf("count" to f.reports.closedOpen.toString(), "date" to (closedAt ?: "")))
        } else {
            make("reported_once", "badge.reported_once", mapOf("date" to (closedAt ?: "")))
        }
    }

    if (confirmedAt != null) {
        val days = maxOf(0, daysBetween(confirmedAt, today))
        return make(
            "confirmed",
            "badge.confirmed." + (f.lastConfirmMethod ?: "community_confirm"),
            mapOf("days" to days.toString(), "date" to confirmedAt),
        )
    }

    if (f.checkedAtEntry != null) {
        return make(
            "entry_checked",
            "badge.entry_checked." + (f.entryMethod ?: "web"),
            mapOf("date" to detroitDay(f.checkedAtEntry)),
        )
    }

    // On a publisher's list, never checked by a person. Presence in a source is not verification, so the badge
    // states only the fact: whose list it is and when they last edited it.
    if (f.source.lastEdited != null) {
        return make("source_listed", "badge.source_listed",
            mapOf("source" to f.source.name, "source_date" to detroitDay(f.source.lastEdited)))
    }
    return make("never_checked", "badge.never_checked", mapOf("source" to f.source.name, "source_date" to ""))
}

/**
 * How old this phone's copy of the list is. It says nothing about any listing: it tells the person their phone may
 * be missing recent reports. RETIRED only when a person published a final list marked retired (DECISIONS
 * 2026-09-19: shutdown only by a person; no timer ever retires the directory).
 */
fun bundleAge(generatedAt: String, retired: Boolean, nowMillis: Long): BundleAge {
    if (retired) return BundleAge.RETIRED
    // An unreadable build date is never shown as fresh.
    val built = parseInstant(generatedAt) ?: return BundleAge.OLD
    val hours = (nowMillis - built) / 3_600_000.0
    if (hours > 30 * 24) return BundleAge.OLD
    if (hours > 72) return BundleAge.AGING
    return BundleAge.FRESH
}
