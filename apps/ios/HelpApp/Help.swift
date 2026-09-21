// Words and needs, shared with the web app. Strings come from strings/en.json and strings/es.json (copied into the
// app by the build phase in README.md); the needs list mirrors apps/web/src/needs.ts.
import DetroitQuery
import Foundation
import HelpCore

enum L {
    /// Every language with a strings file. English is the fallback and ships first.
    /// Arabic and Bengali were drafted by machine on 2026-09-20 and have not been read by a native speaker yet
    /// (docs/DECISIONS.md). No screen says they were checked.
    static let languages = ["en", "es", "ar", "bn"]

    private static func table(_ lang: String) -> [String: String] {
        guard let url = Bundle.main.url(forResource: lang, withExtension: "json"), let d = try? Data(contentsOf: url),
              let t = try? JSONDecoder().decode([String: String].self, from: d) else { return [:] }
        return t
    }
    private static let en = table("en")
    private static let tables: [String: [String: String]] = Dictionary(uniqueKeysWithValues: languages.map { ($0, table($0)) })

    /// The phone's own language, if the app has words for it: the first of the phone's preferences that we carry.
    /// The choice is the phone's, never asked for and never stored.
    static let current: String = Locale.preferredLanguages
        .compactMap { code in languages.first { $0 == String(code.prefix(2)).lowercased() } }
        .first ?? "en"
    /// True when the app's own words are not English, so a screen can say that a place's words are still English.
    static var translated: Bool { current != "en" }
    /// Arabic reads right to left; SwiftUI mirrors every screen from this (Views.swift sets layoutDirection).
    static var rightToLeft: Bool { current == "ar" }
    /// For dates, times and numbers. Arabic and Bengali ask for Western digits, so a number reads as it is
    /// dialled and a time matches the sign on the door (DECISIONS 2026-09-20).
    static var locale: Locale {
        switch current {
        case "es": return Locale(identifier: "es_US")
        case "ar": return Locale(identifier: "ar@numbers=latn")
        case "bn": return Locale(identifier: "bn@numbers=latn")
        default: return Locale(identifier: "en_US")
        }
    }
    /// A missing translation falls back to English, never to a blank or a raw key.
    static func t(_ key: String, _ p: [String: String] = [:]) -> String {
        var s = tables[current]?[key] ?? en[key] ?? key
        for (k, v) in p { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
        return s
    }

    /// Words for a key that `strings/*.json` does not carry **yet**, with the English sentence written here so the
    /// screen shows a sentence rather than a raw key. It is deliberately not spelled the way a normal lookup is,
    /// because AppParityTests reads that spelling as a promise that `strings/en.json` already has the key.
    ///
    /// Nothing uses it today: the two error paths that did (`report.failed` and `privacy.reset_failed`, both added
    /// by the iPhone review of 2026-09-20) now have their words in all four string files, so they are ordinary
    /// lookups and the parity test covers them. It stays here for the next key that arrives before its words do.
    static func pending(_ key: String, english: String) -> String { tables[current]?[key] ?? en[key] ?? english }
}

/// 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5).
let hardcoded = ["emg_911": "911", "emg_988": "988"]

struct Need: Identifiable {
    /// One way to narrow a need. `first` is emergency numbers shown above that refinement's own list
    /// (the emergency room screen leads with 911).
    struct Refine: Identifiable { var id: String; var query: Query; var first: [String] = [] }
    var id: String
    var symbol: String
    var now: Bool                       // listed first, under "Right now"
    var later = false                   // listed last, under "Work, school, and paperwork"
    var first: [String] = []            // emergency numbers shown BEFORE any list
    var firstLink: (key: String, url: String)? = nil    // a link above even those (313SafeBeds on the shelter screen)
    var intro: String? = nil
    /// What an empty list says, when "we don't have anything listed" is not the right answer
    /// (warming and cooling centres: libraries and recreation centres are the everyday answer).
    var emptyKey: String? = nil
    var query: Query? = nil
    var stepsOnly = false               // overdose: 911 and steps, never a list (audit A7)
    var sensitive = false               // no distance, no map, not saved
    /// A visible "Leave this page fast" in the top bar (docs/08 "Quick-exit"), on the same needs the web app
    /// marks `quickExit` in apps/web/src/needs.ts. AppParityTests holds the two lists together.
    var quickExit = false
    /// Last, so that every setting of a need is written above its choices, as in apps/web/src/needs.ts.
    /// AppParityTests reads the two files side by side and relies on that order.
    var refine: [Refine] = []
}

let needs: [Need] = [
    Need(id: "overdose_now", symbol: "waveform.path.ecg", now: true, first: ["emg_911"], stepsOnly: true, sensitive: true),
    Need(id: "shelter", symbol: "bed.double", now: true, first: ["emg_shelter_helpline", "emg_shelter_outwayne"],
         firstLink: ("beds.safebeds", "https://313safebeds.com/"), refine: [
        .init(id: "me", query: Query(category: "shelter.emergency")), .init(id: "kids", query: Query(category: "shelter.emergency")), .init(id: "young", query: Query(category: "shelter.emergency", prefer: ["youth"]))]),   // youth shelters first
    Need(id: "unsafe", symbol: "shield", now: true, first: ["emg_ndvh", "emg_911"], intro: "safe.dv_intro", query: Query(category: "shelter.dv"), sensitive: true, quickExit: true),
    Need(id: "talk", symbol: "bubble.left", now: true, first: ["emg_988", "emg_dwihn_crisis"], intro: "talk.intro", query: Query(category: "health.mental"), sensitive: true, quickExit: true),
    // Treatment and sexual assault (DECISIONS 2026-09-19): numbers first. The iPhone app saves nothing and keeps no
    // history, so "private" needs no extra rule here; addresses and distance stay.
    Need(id: "drugs", symbol: "leaf", now: true, first: ["emg_dwihn_crisis", "emg_dwihn_care_center", "emg_samhsa"],
         intro: "drugs.intro", quickExit: true, refine: [
        .init(id: "today", query: Query(category: "treatment", prefer: ["walk_in"])), .init(id: "detox", query: Query(category: "treatment.detox")),
        .init(id: "meds", query: Query(category: "treatment.meds")), .init(id: "stay", query: Query(category: "treatment.residential")),
        .init(id: "home", query: Query(category: "treatment.outpatient")), .init(id: "recovery", query: Query(category: "treatment.recovery")),
        .init(id: "supplies", query: Query(category: "harm.supplies"))]),
    Need(id: "assault", symbol: "shield", now: true, first: ["emg_avalon", "emg_voices4", "emg_911"], intro: "assault.intro", query: Query(category: "assault"), quickExit: true),
    Need(id: "food", symbol: "fork.knife", now: false, refine: [.init(id: "today", query: Query(category: "food.meal", mode: "now")), .init(id: "week", query: Query(category: "food", mode: "week"))]),
    // Emergency room first, and that screen leads with 911 (mirrors apps/web/src/needs.ts).
    Need(id: "doctor", symbol: "cross.case", now: false, refine: [
        .init(id: "er", query: Query(category: "health.er"), first: ["emg_911"]),
        .init(id: "urgent", query: Query(category: "health.urgent")),
        .init(id: "doctor", query: Query(category: "health.clinic")),
        // Detroit Health Department programs: shots, lead tests, WIC and the wellness centres. Their own
        // category, because they are city programs rather than a clinic that says it is free (2026-09-20).
        .init(id: "dhd", query: Query(category: "health.dhd")),
        .init(id: "dentist", query: Query(category: "health.dental")),
        .init(id: "eyes", query: Query(category: "health.vision"))]),
    Need(id: "home", symbol: "key", now: false, refine: [.init(id: "rent", query: Query(category: "housing.rent")), .init(id: "own", query: Query(category: "housing.owner"))]),
    Need(id: "utilities", symbol: "bolt", now: false, query: Query(category: "utilities")),
    Need(id: "day", symbol: "clock", now: false, query: Query(category: "shelter.day")),
    Need(id: "things", symbol: "tshirt", now: false, refine: [.init(id: "clothes", query: Query(category: "goods.clothes")), .init(id: "baby", query: Query(category: "goods.baby"))]),
    Need(id: "narcan", symbol: "shippingbox", now: false, query: Query(category: "harm.narcan")),
    Need(id: "hot_cold", symbol: "sun.max", now: false, intro: "hotcold.intro", emptyKey: "hotcold.none", query: Query(category: "rec")),
    // The web app also shows link-outs (unemployment, Lifeline, child-care scholarships…) on these screens; the
    // iPhone lists places only until link-outs are built here.
    Need(id: "job", symbol: "briefcase", now: false, later: true, refine: [.init(id: "find", query: Query(category: "jobs.find")), .init(id: "training", query: Query(category: "jobs.training")), .init(id: "record", query: Query(category: "jobs", prefer: ["reentry"]))]),
    Need(id: "school", symbol: "book", now: false, later: true, refine: [.init(id: "ged", query: Query(category: "learn.school")), .init(id: "english", query: Query(category: "learn.english"))]),
    Need(id: "legal", symbol: "building.columns", now: false, later: true, query: Query(category: "legal")),
    Need(id: "id", symbol: "person.text.rectangle", now: false, later: true, query: Query(category: "ids")),
    Need(id: "money", symbol: "dollarsign.circle", now: false, later: true, refine: [.init(id: "taxes", query: Query(category: "money.tax")), .init(id: "benefits", query: Query(category: "money.benefits"))]),
    Need(id: "childcare", symbol: "figure.2.and.child.holdinghands", now: false, later: true, query: Query(category: "kids.care")),
    Need(id: "phone", symbol: "wifi", now: false, later: true, query: Query(category: "connect")),
    Need(id: "rides", symbol: "bus", now: false, later: true, query: Query(category: "transport")),
    Need(id: "pets", symbol: "pawprint", now: false, later: true, query: Query(category: "pets")),
]

func telURL(_ number: String) -> URL? { URL(string: telLink(number)) }

func emergencyNumber(_ id: String, in b: LoadedBundle?) -> (label: String, number: String)? {
    let fromBundle = b?.emergency.first { $0.id == id }
    guard let number = hardcoded[id] ?? fromBundle?.number else { return nil }   // hardcoded always wins
    return (fromBundle?.label ?? (id == "emg_911" ? "Emergency" : "Suicide and crisis lifeline"), number)
}

/// Badge text from its key and dated facts. Dates are shown in the phone's language.
func badgeText(_ b: Badge) -> String {
    var p = b.params
    for k in ["date", "source_date"] { if let d = p[k], let day = parseDay(d) {
        let f = DateFormatter(); f.dateStyle = .medium; f.timeZone = TimeZone(identifier: "UTC")
        p[k] = f.string(from: Date(timeIntervalSince1970: Double(day) * 86400)) } }
    return L.t(b.key, p)
}

/// "1:30 pm". am and pm come from `strings/*.json` (`clock.am`, `clock.pm`) — Arabic writes ص and م, and a
/// hard-coded "am" left an English word in the middle of an Arabic sentence (iPhone review, 2026-09-20).
func clock(_ hhmm: String) -> String {
    guard let m = parseClock(hhmm) else { return hhmm }
    let h = m / 60, mm = m % 60
    let half = L.t(h < 12 || h == 24 ? "clock.am" : "clock.pm")
    return "\((h + 11) % 12 + 1)\(mm > 0 ? String(format: ":%02d", mm) : "") \(half)"
}

func openText(_ o: OpenResult) -> String {
    switch o.state {
    case .open: return o.closesAt.map { L.t("open.open_until", ["time": clock($0)]) } ?? L.t("open.open")
    case .closes_soon: return L.t("open.closes_soon", ["time": clock(o.closesAt ?? "")])
    case .closed:
        if o.cancelledNow { return L.t("open.cancelled") }
        guard let next = o.next ?? nil else { return L.t("open.closed_no_next") }
        return L.t("open.closed_next", ["day": next.date, "time": clock(next.opensAt)])
    case .call_first: return L.t("open.call_first")
    // A holiday: the schedule's hours are the usual ones and say nothing about today (query-spec "Holidays").
    case .holiday: return L.t("open.holiday")
    default: return L.t("open.unknown")
    }
}

/// The detail screen's holiday line: the usual hours, and a plain "call before you go".
func holidayNote(_ o: OpenResult) -> String? {
    guard o.state == .holiday, let u = o.usualHours else { return nil }
    return L.t("detail.holiday", ["hours": "\(clock(u.opensAt)) - \(clock(u.closesAt))"])
}
