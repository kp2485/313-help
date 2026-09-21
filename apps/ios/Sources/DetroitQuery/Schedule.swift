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
        if n.isEmpty { out.append(DayRule(nth: nil, weekday: wd)) }
        else if n.range(of: #"^[+-]?[1-5]$"#, options: .regularExpression) != nil, let k = Int(n) { out.append(DayRule(nth: k, weekday: wd)) }
        else { return nil }
    }
    return out
}

func parseBymonthday(_ s: String) -> [Int]? {
    var out: [Int] = []
    for raw in s.split(separator: ",", omittingEmptySubsequences: false) {
        let t = raw.trimmingCharacters(in: .whitespaces)
        guard t.range(of: #"^-?\d{1,2}$"#, options: .regularExpression) != nil, let n = Int(t), n != 0, (-31...31).contains(n) else { return nil }
        out.append(n)
    }
    return out
}

/// The pipeline's validator (assertScheduleValid). A schedule that fails it is skipped, never guessed at.
public func scheduleIsValid(_ s: Schedule) -> Bool {
    guard parseScheduleDay(s.dtstart) != nil, parseClock(s.opensAt) != nil, parseClock(s.closesAt) != nil else { return false }
    for d in [s.until, s.validFrom, s.validTo] { if let d, parseScheduleDay(d) == nil { return false } }
    if let f = s.freq, !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].contains(f) { return false }
    if let i = s.interval, i < 1 { return false }
    // Only the shapes the spec defines, so web and iPhone can't disagree.
    if let b = s.byday {
        guard s.freq == "WEEKLY" || s.freq == "MONTHLY", let rules = parseByday(b) else { return false }
        if s.freq == "WEEKLY", rules.contains(where: { $0.nth != nil }) { return false }   // "2nd Tuesday" needs a month
    }
    if let md = s.bymonthday { guard s.freq == "MONTHLY", parseBymonthday(md) != nil else { return false } }
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
            return (parseBymonthday(md) ?? []).contains { $0 > 0 ? $0 == c.d : dim + $0 + 1 == c.d }
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
    // A row a steward marked `open_holidays` is computed as though no day were a holiday (the owner's page says so).
    let holidays = !row.flags.contains(openHolidaysFlag)
    var out: [Occurrence] = []
    for s in row.schedules where scheduleIsValid(s) {
        guard let o = parseClock(s.opensAt), let c = parseClock(s.closesAt) else { continue }
        var lo = today - 1, hi = today + days            // yesterday too, for windows that run past midnight
        if let v = s.validFrom.flatMap(parseDay) { lo = max(lo, v) }
        if let v = s.validTo.flatMap(parseDay) { hi = min(hi, v) }
        guard lo <= hi else { continue }
        for d in lo...hi where opensOn(s, d) {
            let start = d * 1440 + o
            var end = d * 1440 + c
            if end <= start { end += 1440 }
            // The occurrence belongs to the date it opens, so that is the date the holiday rule asks about: a
            // window that opened on Christmas Eve and runs to 2am is an ordinary evening's window.
            out.append(Occurrence(date: dayString(d), opensAt: s.opensAt, closesAt: s.closesAt, start: start, end: end,
                                  holiday: holidays && isHoliday(day: d)))
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
/// An occurrence is cancelled when it overlaps a cancellation window at all, so a cancellation posted after a pantry
/// opened closes it for the rest of that window.
func isCancelled(_ o: Occurrence, _ w: [(start: Int, end: Int)]) -> Bool { w.contains { o.start < $0.end && o.end > $0.start } }

public func nextOccurrences(_ row: BundleRow, now: Date, n: Int, alerts: [Alert] = []) -> [Occurrence] {
    guard row.status == "active", row.availability == "scheduled" else { return [] }
    let nowMin = nowWallMinutes(now), w = cancelWindows(row.id, alerts)
    return Array(occurrences(row, nowMin: nowMin, days: lookaheadDays).filter { $0.end > nowMin && !isCancelled($0, w) }.prefix(n))
}

public func openNow(_ row: BundleRow, now: Date, alerts: [Alert] = []) -> OpenResult {
    guard row.status == "active" else { return OpenResult(state: .not_listed) }
    if row.availability == "always" {
        // Always open, unless a published cancellation covers right now.
        let nowMin = nowWallMinutes(now)
        return cancelWindows(row.id, alerts).contains { nowMin >= $0.start && nowMin < $0.end }
            ? OpenResult(state: .closed, next: .some(nil), cancelledNow: true) : OpenResult(state: .open)
    }
    if row.availability == "call_first" { return OpenResult(state: .call_first) }
    // Unknown is never rendered as open.
    // So is a schedule that can't be read: it is skipped, and with none left the listing is unknown.
    if row.availability == "unknown" || !row.schedules.contains(where: scheduleIsValid) { return OpenResult(state: .unknown) }

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
        // A window that opens on a holiday tells us the usual hours and nothing about today. Never "open".
        if cur.holiday { return usualHours(cur) }
        let left = cur.end - nowMin
        return OpenResult(state: left < closesSoonMinutes ? .closes_soon : .open, closesAt: cur.closesAt, minutesLeft: left)
    }
    let next = occ.first { $0.start > nowMin && !isCancelled($0, w) }
    // "Opens later today" on a holiday is the same guess as "open now" on a holiday. A next time on a *later* day
    // stands as written: the date is a fact about the schedule, and the next-times list carries the holiday label.
    if let n = next, n.holiday, n.date == dayString(Int((Double(nowMin) / 1440).rounded(.down))) { return usualHours(n) }
    return OpenResult(state: .closed, next: .some(next.map { .init(date: $0.date, opensAt: $0.opensAt, closesAt: $0.closesAt) }), cancelledNow: cancelledNow)
}

/// The `holiday` result: the schedule's own times, offered as usual hours. No `closesAt`, nothing to count down to.
private func usualHours(_ o: Occurrence) -> OpenResult {
    OpenResult(state: .holiday, usualHours: .init(opensAt: o.opensAt, closesAt: o.closesAt))
}
