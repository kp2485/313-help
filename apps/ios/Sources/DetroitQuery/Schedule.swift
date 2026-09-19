// Occurrences and open-now (schema/query-spec.md "Occurrences", "Open now"). Port of packages/query/src/schedule.ts.
// The web uses the `rrule` library; here the few rule shapes the directory uses are evaluated directly, day by day,
// over a short window. Both are held to the same fixtures.
import Foundation

let closesSoonMinutes = 30
let lookaheadDays = 120

struct DayRule {
    let nth: Int?     // 2 = second, -1 = last; nil = every
    let weekday: Int  // 0 = Monday
}
private let codes = ["MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6]

func parseByday(_ s: String) -> [DayRule]? {
    var out: [DayRule] = []
    for raw in s.split(separator: ",") {
        let t = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard t.count >= 2, let wd = codes[String(t.suffix(2))] else { return nil }
        let n = String(t.dropLast(2))
        if n.isEmpty { out.append(DayRule(nth: nil, weekday: wd)) } else if let k = Int(n), k != 0 { out.append(DayRule(nth: k, weekday: wd)) } else { return nil }
    }
    return out
}

/// Throws-equivalent for the pipeline's validator: nil means the schedule can't be evaluated.
public func scheduleIsValid(_ s: Schedule) -> Bool {
    guard parseDay(s.dtstart) != nil, parseClock(s.opensAt) != nil, parseClock(s.closesAt) != nil else { return false }
    for d in [s.until, s.validFrom, s.validTo] { if let d, parseDay(d) == nil { return false } }
    if let b = s.byday, parseByday(b) == nil { return false }
    if let f = s.freq, !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].contains(f) { return false }
    return true
}

private func daysInMonth(_ y: Int, _ m: Int) -> Int { dayNumber(m == 12 ? y + 1 : y, m == 12 ? 1 : m + 1, 1) - dayNumber(y, m, 1) }

/// Does this schedule open on `day` (days since 1970-01-01)?
func opensOn(_ s: Schedule, _ day: Int) -> Bool {
    guard let start = parseDay(s.dtstart), day >= start else { return false }
    if let u = s.until.flatMap(parseDay), day > u { return false }
    guard let freq = s.freq else { return day == start }
    let every = max(1, s.interval ?? 1)
    let rules = s.byday.flatMap(parseByday)
    let c = civil(day), c0 = civil(start)
    switch freq {
    case "DAILY":
        return (day - start) % every == 0
    case "WEEKLY":
        // Weeks start on Monday (RFC 5545 default WKST); "every 2 weeks" counts from the week of dtstart.
        let week = (day - weekday(day) - (start - weekday(start))) / 7
        guard week % every == 0 else { return false }
        return rules.map { $0.contains { $0.weekday == weekday(day) } } ?? (weekday(day) == weekday(start))
    case "MONTHLY":
        guard ((c.y - c0.y) * 12 + (c.m - c0.m)) % every == 0 else { return false }
        let dim = daysInMonth(c.y, c.m)
        if let md = s.bymonthday {
            return md.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }.contains { $0 > 0 ? $0 == c.d : dim + $0 + 1 == c.d }
        }
        if let rules {
            return rules.contains { r in
                guard r.weekday == weekday(day) else { return false }
                guard let n = r.nth else { return true }
                return n > 0 ? (c.d - 1) / 7 + 1 == n : (dim - c.d) / 7 + 1 == -n
            }
        }
        return c.d == c0.d
    case "YEARLY":
        return (c.y - c0.y) % every == 0 && c.m == c0.m && c.d == c0.d
    default:
        return false
    }
}

func occurrences(_ row: BundleRow, nowMin: Int, days: Int) -> [Occurrence] {
    let today = Int((Double(nowMin) / 1440).rounded(.down))
    var out: [Occurrence] = []
    for s in row.schedules {
        guard let o = parseClock(s.opensAt), let c = parseClock(s.closesAt) else { continue }
        var lo = today - 1, hi = today + days            // yesterday too, for windows that run past midnight
        if let v = s.validFrom.flatMap(parseDay) { lo = max(lo, v) }
        if let v = s.validTo.flatMap(parseDay) { hi = min(hi, v) }
        guard lo <= hi else { continue }
        for d in lo...hi where opensOn(s, d) {
            let start = d * 1440 + o
            var end = d * 1440 + c
            if end <= start { end += 1440 }
            out.append(Occurrence(date: dayString(d), opensAt: s.opensAt, closesAt: s.closesAt, start: start, end: end))
        }
    }
    return out.sorted { $0.start != $1.start ? $0.start < $1.start : $0.end < $1.end }
}

/// Wall-clock windows of published cancellation alerts that name this row.
func cancelWindows(_ rowId: String, _ alerts: [Alert]) -> [(start: Int, end: Int)] {
    alerts.filter { $0.kind == "cancellation" && $0.status == "published" && ($0.targets ?? []).contains(rowId) }
        .compactMap { a in
            guard let s = parseInstant(a.startsAt), let e = parseInstant(a.endsAt) else { return nil }
            return (nowWallMinutes(s), nowWallMinutes(e))
        }
}
/// An occurrence is cancelled when it *opens* inside a cancellation window.
func isCancelled(_ o: Occurrence, _ w: [(start: Int, end: Int)]) -> Bool { w.contains { o.start >= $0.start && o.start < $0.end } }

public func nextOccurrences(_ row: BundleRow, now: Date, n: Int, alerts: [Alert] = []) -> [Occurrence] {
    guard row.status == "active", row.availability == "scheduled" else { return [] }
    let nowMin = nowWallMinutes(now), w = cancelWindows(row.id, alerts)
    return Array(occurrences(row, nowMin: nowMin, days: lookaheadDays).filter { $0.end > nowMin && !isCancelled($0, w) }.prefix(n))
}

public func openNow(_ row: BundleRow, now: Date, alerts: [Alert] = []) -> OpenResult {
    guard row.status == "active" else { return OpenResult(state: .not_listed) }
    if row.availability == "always" { return OpenResult(state: .open) }
    if row.availability == "call_first" { return OpenResult(state: .call_first) }
    // Unknown is never rendered as open.
    if row.availability == "unknown" || row.schedules.isEmpty { return OpenResult(state: .unknown) }

    let nowMin = nowWallMinutes(now), w = cancelWindows(row.id, alerts)
    let occ = occurrences(row, nowMin: nowMin, days: lookaheadDays).filter { $0.end > nowMin }
    var cancelledNow = false
    var current: Occurrence?
    for o in occ {
        if o.start > nowMin { break }
        if isCancelled(o, w) { cancelledNow = true; continue }
        if current == nil || o.end > current!.end { current = o }   // overlapping windows: the one open longest
    }
    if let cur = current {
        let left = cur.end - nowMin
        return OpenResult(state: left < closesSoonMinutes ? .closes_soon : .open, closesAt: cur.closesAt, minutesLeft: left)
    }
    let next = occ.first { $0.start > nowMin && !isCancelled($0, w) }
    return OpenResult(state: .closed, next: .some(next.map { .init(date: $0.date, opensAt: $0.opensAt, closesAt: $0.closesAt) }), cancelledNow: cancelledNow)
}
