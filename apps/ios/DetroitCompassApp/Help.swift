// Words and needs, shared with the web app. Strings come from strings/en.json and strings/es.json (copied into the
// app by the build phase in README.md); the needs list mirrors apps/web/src/needs.ts.
import DetroitQuery
import Foundation

enum L {
    private static func table(_ lang: String) -> [String: String] {
        guard let url = Bundle.main.url(forResource: lang, withExtension: "json"), let d = try? Data(contentsOf: url),
              let t = try? JSONDecoder().decode([String: String].self, from: d) else { return [:] }
        return t
    }
    private static let en = table("en")
    private static let es = table("es")
    /// Spanish when the phone is set to Spanish. A missing string falls back to English, never to blank.
    static var spanish: Bool { Locale.preferredLanguages.first?.hasPrefix("es") ?? false }
    static func t(_ key: String, _ p: [String: String] = [:]) -> String {
        var s = (spanish ? es[key] : nil) ?? en[key] ?? key
        for (k, v) in p { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
        return s
    }
}

/// 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5).
let hardcoded = ["emg_911": "911", "emg_988": "988"]

struct Need: Identifiable {
    struct Refine: Identifiable { var id: String; var query: Query }
    var id: String
    var symbol: String
    var now: Bool                       // listed first, under "Right now"
    var first: [String] = []            // emergency numbers shown BEFORE any list
    var query: Query? = nil
    var refine: [Refine] = []
    var stepsOnly = false               // overdose: 911 and steps, never a list (audit A7)
    var sensitive = false               // no distance, no map, not saved
    var intro: String? = nil
}

let needs: [Need] = [
    Need(id: "overdose_now", symbol: "waveform.path.ecg", now: true, first: ["emg_911"], stepsOnly: true, sensitive: true),
    Need(id: "shelter", symbol: "bed.double", now: true, first: ["emg_shelter_helpline"], refine: [
        .init(id: "me", query: Query(category: "shelter.emergency")), .init(id: "kids", query: Query(category: "shelter.emergency")), .init(id: "young", query: Query(category: "youth"))]),
    Need(id: "unsafe", symbol: "shield", now: true, first: ["emg_ndvh", "emg_911"], query: Query(category: "shelter.dv"), sensitive: true, intro: "safe.dv_intro"),
    Need(id: "talk", symbol: "bubble.left", now: true, first: ["emg_988", "emg_dwihn_crisis"], query: Query(category: "health.mental"), sensitive: true, intro: "talk.intro"),
    Need(id: "food", symbol: "fork.knife", now: false, refine: [.init(id: "today", query: Query(category: "food.meal")), .init(id: "week", query: Query(category: "food", mode: "week"))]),
    Need(id: "doctor", symbol: "cross.case", now: false, query: Query(category: "health.clinic")),
    Need(id: "utilities", symbol: "bolt", now: false, query: Query(category: "utilities")),
    Need(id: "narcan", symbol: "shippingbox", now: false, query: Query(category: "harm.narcan")),
    Need(id: "hot_cold", symbol: "sun.max", now: false, query: Query(category: "rec"), intro: "hotcold.intro"),
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

func clock(_ hhmm: String) -> String {
    guard let m = parseClock(hhmm) else { return hhmm }
    let h = m / 60, mm = m % 60
    return "\((h + 11) % 12 + 1)\(mm > 0 ? String(format: ":%02d", mm) : "") \(h < 12 || h == 24 ? "am" : "pm")"
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
    default: return L.t("open.unknown")
    }
}
