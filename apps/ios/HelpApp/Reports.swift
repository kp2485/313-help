// Anonymous reports (docs/04), the Swift copy of apps/web/src/report.ts and outbox.ts.
// What leaves the phone: a listing or segment id, a kind, an optional note, a time, and a one-day hash.
// Nothing else exists to send: there is no account and no device id, and the Worker's schema is closed, so a
// seventh field would be a 400 rather than something stored.
import Combine
import CryptoKit
import DetroitQuery
import Foundation

// ---- where this phone keeps its own things ---------------------------------------------------
/// Small pieces of state this phone keeps to itself (docs/08): the random key, the outbox, saved places.
/// Plain files in Application Support, protected while the phone is locked. Not iCloud, not the keychain:
/// deleting the app takes all of it, and nothing survives to be restored onto another phone.
enum DeviceState {
    static let dir: URL = {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("state", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()
    static func read(_ url: URL) -> Data? { try? Data(contentsOf: url) }
    static func write(_ data: Data, to url: URL) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}

// ---- the random key, and the one-day hash made from it ----------------------------------------
/// A random key made on this phone. It is **never sent**: only `sha256(key ‖ target ‖ day)` leaves, so the same
/// phone reporting the same place twice in a day counts once, while two places or two days give hashes nobody can
/// connect (docs/08, audit A4). "Make a new key" on the privacy screen throws it away and makes another.
actor InstallKey {
    static let shared = InstallKey(dir: DeviceState.dir)
    private let file: URL
    private var cached: String?
    init(dir: URL) { file = dir.appendingPathComponent("install-key") }

    func value() -> String {
        if let cached { return cached }
        if let d = DeviceState.read(file), let s = String(data: d, encoding: .utf8), s.count == 64, s.allSatisfy(\.isHexDigit) {
            cached = s
            return s
        }
        return make()
    }
    /// A new random key. Reports sent after this can't be matched to earlier ones, even on the same day.
    @discardableResult func reset() -> String { make() }

    private func make() -> String {
        let s = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }.map { String(format: "%02x", $0) }.joined()
        DeviceState.write(Data(s.utf8), to: file)
        cached = s
        return s
    }
}

/// `sha256(key | target | day)`, byte-for-byte what the web app sends. The day is the Detroit day.
func dedupeNonce(secret: String, targetId: String, when: Date) -> String {
    let day = wallDateString(toWall(when))
    return SHA256.hash(data: Data("\(secret)|\(targetId)|\(day)".utf8)).map { String(format: "%02x", $0) }.joined()
}

// ---- a report ----------------------------------------------------------------------------------
enum ReportKinds {
    static let listing = ["closed_permanently", "moved", "wrong_hours", "wrong_phone", "out_of_stock", "wrong_info"]
    // Condition reports are about things, never people (docs/11). There is deliberately no kind for a person, a
    // tent, a vehicle someone sleeps in, or "suspicious activity". Do not add one.
    static let place = ["light_out", "glass_trash", "flooding_ice", "path_damaged", "overgrown", "broken_fixture", "restroom", "dumping"]
    static let confirmListing = "confirmed_ok"
    static let confirmPlace = "looks_good"
    /// "Out of supplies or food today" only makes sense where there are supplies (as in the web app).
    static func listing(for category: String) -> [String] {
        listing.filter { $0 != "out_of_stock" || category.hasPrefix("food") || category.hasPrefix("harm") }
    }
}

struct Report: Codable, Equatable, Sendable {
    var targetId: String
    var kind: String
    var detail: String?
    var observedAt: String
    var clientNonce: String
    // The Worker's schema is closed: these names, and no others.
    enum CodingKeys: String, CodingKey { case targetId = "target_id", kind, detail, observedAt = "observed_at", clientNonce = "client_nonce" }
}

/// Builds the report for one tap. The note is trimmed to 280 characters and dropped when it is empty; the time is
/// kept to the minute, never the second.
func buildReport(targetId: String, kind: String, detail: String = "", when: Date = .now, secret: String) -> Report {
    let text = String(detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(280))
    let f = ISO8601DateFormatter(); f.timeZone = TimeZone(identifier: "UTC")
    return Report(targetId: targetId, kind: kind, detail: text.isEmpty ? nil : text,
                  observedAt: String(f.string(from: when).prefix(16)) + "Z",
                  clientNonce: dedupeNonce(secret: secret, targetId: targetId, when: when))
}

// ---- the outbox ----------------------------------------------------------------------------------
/// Worth trying again later: the server was busy, rate-limited us, timed out, or couldn't be reached.
func retryable(_ status: Int) -> Bool { status >= 500 || status == 429 || status == 408 }

/// Things waiting to be sent, kept on this phone until they go (docs/05 "Offline"). An actor, so two flushes
/// (the app starting while the phone comes back online) can't send the same item twice, and an item added while a
/// flush is writing back can't be lost.
actor Outbox<Item: Codable & Equatable & Sendable> {
    private let file: URL
    private let max: Int
    private let send: @Sendable (Item) async -> Bool

    init(file: URL, max: Int, send: @escaping @Sendable (Item) async -> Bool) {
        self.file = file
        self.max = max
        self.send = send
    }

    private func queue() -> [Item] {
        guard let d = DeviceState.read(file), let q = try? JSONDecoder().decode([Item].self, from: d) else { return [] }
        return q
    }
    private func save(_ q: [Item]) {
        if let d = try? JSONEncoder().encode(Array(q.suffix(max))) { DeviceState.write(d, to: file) }
    }

    /// Sends now if it can; otherwise keeps it (the newest `max`) and tries again later.
    func submit(_ item: Item) async -> Bool {
        if await send(item) { return true }
        save(queue() + [item])
        return false
    }

    /// Tries everything waiting; keeps what still didn't go, plus anything added while this was running.
    func flush() async {
        let queued = queue()
        if queued.isEmpty { return }
        var left: [Item] = []
        for item in queued {
            let ok = await send(item)
            if !ok { left.append(item) }
        }
        let added = queue().filter { item in !queued.contains(item) }
        save(left + added)
    }

    func waiting() -> Int { queue().count }
}

/// Posts one report. A plain JSON POST with no cookies and no referrer: the only thing that identifies it is the
/// day-hash inside the body.
@Sendable func postReport(_ r: Report) async -> Bool {
    guard let url = Config.reportsURL, let body = try? JSONEncoder().encode(r) else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = body
    req.httpShouldHandleCookies = false
    do {
        let (_, res) = try await URLSession.shared.data(for: req)
        return !retryable((res as? HTTPURLResponse)?.statusCode ?? 0)
    } catch { return false }
}

// ---- what the screens talk to --------------------------------------------------------------------
/// One report per target per screen visit, and the answer the person sees. The map is memory only: a phone that is
/// restarted has no record of what was reported, only the outbox of what has not gone yet.
@MainActor final class Reporter: ObservableObject {
    static let shared = Reporter()
    enum Outcome: String { case sent, queued }
    @Published private(set) var done: [String: Outcome] = [:]

    private let box = Outbox<Report>(file: DeviceState.dir.appendingPathComponent("outbox-reports.json"), max: 50, send: postReport)

    func submit(targetId: String, kind: String, detail: String = "") async {
        let report = buildReport(targetId: targetId, kind: kind, detail: detail, secret: await InstallKey.shared.value())
        done[targetId] = await box.submit(report) ? .sent : .queued
    }
    /// Tries the queue again: at launch, and every time the app comes back to the front.
    func flush() async { await box.flush() }
    func forget(_ targetId: String) { done[targetId] = nil }
}
