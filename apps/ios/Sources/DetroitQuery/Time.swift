// All schedule math happens on a floating America/Detroit wall clock (schema/query-spec.md "Time").
// A pantry's sign says "Fridays 1:30"; that is 1:30 on the wall in July and in December. The current instant
// is turned into Detroit wall time once, then compared wall to wall, so daylight saving time can't break it.
//
// That one conversion asks Foundation for the zone, so this file carries **no zone rule of its own**: the system's
// copy of tzdata answers, and it is right for all of Detroit's history. The web does the same through `Intl`.
// Android cannot — java.time needs API 26 — so apps/android/query/.../Time.kt writes the United States rule out by
// hand and is correct from 1987, clamping anything earlier to Eastern Standard Time the year round (Android review,
// 2026-09-20). The three therefore agree on every date this app handles and can only differ before 1987. No fixture
// pins a pre-1987 instant, because the three would not agree on one; Android pins its own clamp in
// FixtureTest.theZoneRuleIsClampedBefore1987, which records that 1985-07-01T12:00Z reads as 07:00 there and 08:00
// here. Nothing in this app has a date that old: every date is a schedule a place published, a day a steward wrote
// down, or the moment a bundle was built.
import Foundation

public let zone = TimeZone(identifier: "America/Detroit")!
private let detroit: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = zone; return c }()

public struct Wall: Equatable { public var y, m, d, hh, mm: Int }

public func toWall(_ instant: Date) -> Wall {
    let c = detroit.dateComponents([.year, .month, .day, .hour, .minute], from: instant)
    return Wall(y: c.year!, m: c.month!, d: c.day!, hh: c.hour! % 24, mm: c.minute!)
}

/// Days since 1970-01-01 for a calendar date (proleptic Gregorian). Pure arithmetic: no time zone involved.
public func dayNumber(_ y: Int, _ m: Int, _ d: Int) -> Int {
    let a = (14 - m) / 12, yy = y + 4800 - a, mm = m + 12 * a - 3
    let jdn = d + (153 * mm + 2) / 5 + 365 * yy + yy / 4 - yy / 100 + yy / 400 - 32045
    return jdn - 2440588
}
public func civil(_ day: Int) -> (y: Int, m: Int, d: Int) {
    let z = day + 719468, era = (z >= 0 ? z : z - 146096) / 146097, doe = z - era * 146097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365, doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153, d = doy - (153 * mp + 2) / 5 + 1, m = mp < 10 ? mp + 3 : mp - 9
    return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
}
/// 0 = Monday ... 6 = Sunday.
public func weekday(_ day: Int) -> Int { ((day + 3) % 7 + 7) % 7 }

public func wallMinutes(_ w: Wall) -> Int { dayNumber(w.y, w.m, w.d) * 1440 + w.hh * 60 + w.mm }
public func nowWallMinutes(_ instant: Date) -> Int { wallMinutes(toWall(instant)) }

public func parseDay(_ s: String) -> Int? {
    let p = s.prefix(10).split(separator: "-")
    guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]), (1...12).contains(m), (1...31).contains(d) else { return nil }
    return dayNumber(y, m, d)
}
public func dayString(_ day: Int) -> String { let c = civil(day); return String(format: "%04d-%02d-%02d", c.y, c.m, c.d) }
/// A schedule date: exactly YYYY-MM-DD, and a day that exists (no 2026-02-30).
public func parseScheduleDay(_ s: String) -> Int? {
    guard s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil, let d = parseDay(s), dayString(d) == s else { return nil }
    return d
}
/// "HH:MM" on a 24-hour clock, exactly. 24:00 is the end of the day; nothing later.
public func parseClock(_ s: String) -> Int? {
    guard s.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil else { return nil }
    let p = s.split(separator: ":")
    guard let h = Int(p[0]), let m = Int(p[1]), h <= 24, m <= 59, h < 24 || m == 0 else { return nil }
    return h * 60 + m
}
public func wallDateString(_ w: Wall) -> String { String(format: "%04d-%02d-%02d", w.y, w.m, w.d) }
public func daysBetween(_ a: String, _ b: String) -> Int { (parseDay(b) ?? 0) - (parseDay(a) ?? 0) }

/// ISO 8601 instants as the bundle writes them: "2026-09-18T17:45Z", "…:30Z", "…:30.512Z", "…-04:00".
public func parseInstant(_ s: String) -> Date? {
    let chars = Array(s)
    guard chars.count >= 16, let day = parseDay(s) else { return nil }
    guard let hh = Int(String(chars[11...12])), let mi = Int(String(chars[14...15])) else { return nil }
    var i = 16, sec = 0.0
    if i < chars.count, chars[i] == ":" {
        var j = i + 1
        while j < chars.count, chars[j].isNumber || chars[j] == "." { j += 1 }
        sec = Double(String(chars[(i + 1)..<j])) ?? 0; i = j
    }
    var offset = 0
    if i < chars.count, chars[i] == "+" || chars[i] == "-" {
        let sign = chars[i] == "-" ? -1 : 1, rest = String(chars[(i + 1)...]).replacingOccurrences(of: ":", with: "")
        guard rest.count >= 4, let oh = Int(rest.prefix(2)), let om = Int(rest.dropFirst(2).prefix(2)) else { return nil }
        offset = sign * (oh * 60 + om)
    }
    let minutes = Double(day * 1440 + hh * 60 + mi - offset)
    return Date(timeIntervalSince1970: minutes * 60 + sec)
}

/// Cheap phones lose their clock. If the device says it is earlier than the moment the bundle was built,
/// the device is wrong; use the bundle's time instead.
public func effectiveNow(_ deviceNow: Date, bundleGeneratedAt: String?) -> Date {
    guard let s = bundleGeneratedAt, let built = parseInstant(s) else { return deviceNow }
    return deviceNow < built ? built : deviceNow
}
