// The badge states what we know, computed on the device from dated facts (docs/04, schema/query-spec.md "Badge").
// It never says "verified" for something no person checked. No artificial timers (DECISIONS 2026-09-19): the wording
// changes only when people report something; time passing changes nothing but the dates shown.
// Port of packages/query/src/freshness.ts.
import Foundation

private let tier = ["confirmed": 0, "entry_checked": 1, "source_listed": 2, "never_checked": 3, "reported_once": 4, "reported_closed": 5, "archived": 6]

/// The calendar day of a stored date, on a Detroit calendar. "2026-09-20T01:30Z" is still Sept 19 in Detroit.
public func detroitDay(_ s: String) -> String {
    guard s.contains("T"), let d = parseInstant(s) else { return String(s.prefix(10)) }
    return wallDateString(toWall(d))
}

public func badge(_ row: BundleRow, now: Date) -> Badge {
    let today = wallDateString(toWall(now)), f = row.facts
    func make(_ level: String, _ key: String, _ params: [String: String]) -> Badge { Badge(level: level, key: key, params: params, tier: tier[level]!) }

    if row.status == "archived" { return make("archived", "badge.archived", ["date": row.archived.map { detroitDay($0.at) } ?? ""]) }

    // A closed report counts until someone confirms the place is open *after* it. A report with no date still counts.
    let closedAt = f.reports.closedLastAt.map(detroitDay), confirmedAt = f.lastConfirmedAt.map(detroitDay)
    if f.reports.closedOpen > 0, closedAt == nil || confirmedAt == nil || confirmedAt! <= closedAt! {
        return f.reports.closedOpen >= 2
            ? make("reported_closed", "badge.reported_closed", ["count": String(f.reports.closedOpen), "date": closedAt ?? ""])
            : make("reported_once", "badge.reported_once", ["date": closedAt ?? ""])
    }
    if let c = confirmedAt {
        return make("confirmed", "badge.confirmed.\(f.lastConfirmMethod ?? "community_confirm")", ["days": String(max(0, daysBetween(c, today))), "date": c])
    }
    if let e = f.checkedAtEntry { return make("entry_checked", "badge.entry_checked.\(f.entryMethod ?? "web")", ["date": detroitDay(e)]) }
    // On a publisher's list, never checked by a person: state whose list it is and when they last edited it.
    if let s = f.source.lastEdited { return make("source_listed", "badge.source_listed", ["source": f.source.name, "source_date": detroitDay(s)]) }
    return make("never_checked", "badge.never_checked", ["source": f.source.name, "source_date": ""])
}

/// How old this phone's copy of the list is. "retired" only when a person published a final list marked retired.
public enum BundleAge: String, Sendable { case fresh, aging, old, retired }

public func bundleAge(generatedAt: String, retired: Bool = false, now: Date) -> BundleAge {
    if retired { return .retired }
    guard let built = parseInstant(generatedAt) else { return .old }   // an unreadable date is never shown as fresh
    let hours = now.timeIntervalSince(built) / 3600
    if hours > 30 * 24 { return .old }
    if hours > 72 { return .aging }
    return .fresh
}
