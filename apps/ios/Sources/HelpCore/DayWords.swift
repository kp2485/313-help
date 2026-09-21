// How a day is said to a person: "Today", "Tomorrow", or "Friday, Sep 25" — never "2026-09-25". The same wording
// as `dayName` in apps/web/src/main.ts, so a closed listing reads the same on the web and on a phone.
//
// Pure: the caller hands in the day it is in Detroit, the two words from strings/*.json (`day.today`,
// `day.tomorrow`) and the locale, so `swift test` holds it on Linux with no clock and no bundle.
import DetroitQuery
import Foundation

public enum DayWords {
    public enum Kind: Equatable, Sendable { case today, tomorrow, other }

    /// `date` and `today` are calendar days, "YYYY-MM-DD" (a longer ISO string is read by its first ten characters).
    public static func kind(date: String, today: String) -> Kind? {
        guard let d = parseDay(date), let t = parseDay(today) else { return nil }
        return d == t ? .today : d == t + 1 ? .tomorrow : .other
    }

    /// The Detroit calendar day of an instant, "YYYY-MM-DD".
    public static func detroitDay(of instant: Date) -> String {
        let w = toWall(instant)
        return dayString(dayNumber(w.y, w.m, w.d))
    }

    /// A day that cannot be read is handed back as it came: a wrong date is worse than an odd-looking one.
    public static func name(date: String, today: String, locale: Locale,
                            todayWord: String, tomorrowWord: String) -> String {
        guard let kind = kind(date: date, today: today), let day = parseDay(date) else { return date }
        switch kind {
        case .today: return todayWord
        case .tomorrow: return tomorrowWord
        case .other:
            // A calendar day has no time zone: it is formatted in UTC from a UTC midnight, as the web does.
            let f = DateFormatter()
            f.locale = locale
            f.timeZone = TimeZone(identifier: "UTC")
            f.setLocalizedDateFormatFromTemplate("EEEEMMMd")
            return f.string(from: Date(timeIntervalSince1970: Double(day) * 86400))
        }
    }
}
