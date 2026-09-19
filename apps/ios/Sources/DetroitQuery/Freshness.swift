// The badge states what we know, computed on the device from dated facts (docs/04, schema/query-spec.md "Badge").
// It never says "verified" for something no person checked. Port of packages/query/src/freshness.ts.
import Foundation

private let tier = ["confirmed": 0, "entry_checked": 1, "unconfirmed": 2, "source_listed": 2, "never_checked": 3, "reported_once": 4, "reported_closed": 5, "archived": 6]
private let sourceRecentDays = 90
private func day(_ s: String) -> String { String(s.prefix(10)) }

public func badge(_ row: BundleRow, now: Date) -> Badge {
    let today = wallDateString(toWall(now)), f = row.facts
    func make(_ level: String, _ key: String, _ params: [String: String]) -> Badge { Badge(level: level, key: key, params: params, tier: tier[level]!) }

    if row.status == "archived" { return make("archived", "badge.archived", ["date": row.archived.map { day($0.at) } ?? ""]) }

    // A closed report counts until someone confirms the place is open *after* it.
    let closedAt = f.reports.closedLastAt.map(day), confirmedAt = f.lastConfirmedAt.map(day)
    if f.reports.closedOpen > 0, let closedAt, confirmedAt == nil || confirmedAt! <= closedAt {
        return f.reports.closedOpen >= 2
            ? make("reported_closed", "badge.reported_closed", ["count": String(f.reports.closedOpen), "date": closedAt])
            : make("reported_once", "badge.reported_once", ["date": closedAt])
    }
    if let c = confirmedAt, daysBetween(c, today) <= f.cadenceDays {
        return make("confirmed", "badge.confirmed.\(f.lastConfirmMethod ?? "community_confirm")", ["days": String(max(0, daysBetween(c, today))), "date": c])
    }
    let enteredAt = f.checkedAtEntry.map(day)
    if let e = enteredAt, daysBetween(e, today) <= f.cadenceDays {
        return make("entry_checked", "badge.entry_checked.\(f.entryMethod ?? "web")", ["date": e])
    }
    if let last = [confirmedAt, enteredAt].compactMap({ $0 }).sorted().last {
        return make("unconfirmed", "badge.unconfirmed", ["date": last])
    }
    // Present in a source, never checked by a person: state whose list it is and when they last edited it.
    let src = f.source.lastEdited.map(day)
    if let s = src, daysBetween(s, today) <= sourceRecentDays {
        return make("source_listed", "badge.source_listed", ["source": f.source.name, "source_date": s])
    }
    return make("never_checked", "badge.never_checked", ["source": f.source.name, "source_date": src ?? ""])
}

public enum BundleAge: String, Sendable { case fresh, aging, old, sunset }

/// Bundle-age stages for the banner and the dead-man switch (docs/12). Only a person advances the heartbeat.
public func bundleAge(generatedAt: String, heartbeat: String, now: Date) -> BundleAge {
    let hours = now.timeIntervalSince(parseInstant(generatedAt) ?? now) / 3600
    let heartbeatDays = daysBetween(String(heartbeat.prefix(10)), wallDateString(toWall(now)))
    if hours > 120 * 24 || heartbeatDays > 120 { return .sunset }
    if hours > 30 * 24 { return .old }
    if hours > 72 { return .aging }
    return .fresh
}
