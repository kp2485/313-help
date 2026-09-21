// Anonymous reports (docs/04), the Swift copy of apps/web/src/report.ts and outbox.ts.
// What leaves the phone: a listing or segment id, a kind, an optional note, a time, and a one-day hash.
// Nothing else exists to send: there is no account and no device id, and the Worker's schema is closed, so a
// seventh field would be a 400 rather than something stored.
import DetroitQuery
import Foundation

// ---- the random key, and the one-day hash made from it ----------------------------------------
/// A random key made on this phone. It is **never sent**: only `sha256(key ‖ target ‖ day)` leaves, so the same
/// phone reporting the same place twice in a day counts once, while two places or two days give hashes nobody can
/// connect (docs/08, audit A4). "Make a new key" on the privacy screen throws it away and makes another.
///
/// Every path that could fail throws. A key that could not be written is not returned as if it had been: the next
/// launch would read a different key, and a person who tapped "Make a new key" would have been told a new key was
/// made when the old one was still on disk (iPhone review, 2026-09-20).
public actor InstallKey {
    public enum Failure: Error, Equatable {
        /// The key file is there and cannot be read. We do not overwrite it: "Make a new key" is the only thing
        /// that replaces a key, and it says so.
        case unreadable
        case couldNotWrite
    }

    public static let shared = InstallKey(dir: DeviceState.dir)
    private let file: URL
    private var cached: String?
    public init(dir: URL) { file = dir.appendingPathComponent("install-key") }

    public func value() throws -> String {
        if let cached { return cached }
        let stored: Data?
        do { stored = try DeviceState.readStrict(file) } catch { throw Failure.unreadable }
        if let d = stored {
            guard let s = String(data: d, encoding: .utf8), isKey(s) else { throw Failure.unreadable }
            cached = s
            return s
        }
        return try make()
    }

    /// A new random key. Reports sent after this can't be matched to earlier ones, even on the same day.
    /// It replaces whatever is there, readable or not, because the person asked for exactly that.
    @discardableResult public func reset() throws -> String { try make() }

    /// True when the file holds a key we wrote: 64 lowercase hex characters.
    private func isKey(_ s: String) -> Bool { s.count == 64 && s.allSatisfy(\.isHexDigit) }

    private func make() throws -> String {
        let s = Hash.hex(Hash.randomBytes(32))
        do { try DeviceState.write(Data(s.utf8), to: file) } catch { throw Failure.couldNotWrite }
        cached = s
        return s
    }
}

/// `sha256(key | target | day)`, byte-for-byte what the web app sends. The day is the Detroit day.
public func dedupeNonce(secret: String, targetId: String, when: Date) -> String {
    Hash.sha256Hex(Data("\(secret)|\(targetId)|\(detroitDay(when))".utf8))
}

// ---- a report ----------------------------------------------------------------------------------
public enum ReportKinds {
    public static let listing = ["closed_permanently", "moved", "wrong_hours", "wrong_phone", "out_of_stock", "wrong_info"]
    // Condition reports are about things, never people (docs/11). There is deliberately no kind for a person, a
    // tent, a vehicle someone sleeps in, or "suspicious activity". Do not add one.
    public static let place = ["light_out", "glass_trash", "flooding_ice", "path_damaged", "overgrown", "broken_fixture", "restroom", "dumping"]
    public static let confirmListing = "confirmed_ok"
    public static let confirmPlace = "looks_good"
    /// "Out of supplies or food today" only makes sense where there are supplies (as in the web app).
    public static func listing(for category: String) -> [String] {
        listing.filter { $0 != "out_of_stock" || category.hasPrefix("food") || category.hasPrefix("harm") }
    }
}

public struct Report: Codable, Equatable, Sendable {
    public var targetId: String
    public var kind: String
    public var detail: String?
    public var observedAt: String
    public var clientNonce: String
    // The Worker's schema is closed: these names, and no others.
    public enum CodingKeys: String, CodingKey { case targetId = "target_id", kind, detail, observedAt = "observed_at", clientNonce = "client_nonce" }

    public init(targetId: String, kind: String, detail: String?, observedAt: String, clientNonce: String) {
        self.targetId = targetId
        self.kind = kind
        self.detail = detail
        self.observedAt = observedAt
        self.clientNonce = clientNonce
    }
}

/// Builds the report for one tap. The note is trimmed to 280 characters and dropped when it is empty; the time is
/// kept to the minute, never the second.
public func buildReport(targetId: String, kind: String, detail: String = "", when: Date = .now, secret: String) -> Report {
    let text = String(detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(280))
    return Report(targetId: targetId, kind: kind, detail: text.isEmpty ? nil : text,
                  observedAt: minuteStamp(when),
                  clientNonce: dedupeNonce(secret: secret, targetId: targetId, when: when))
}

/// The one-day hash is worked out again the moment the report actually leaves, never reused from the queue.
/// "Make a new key" is a promise that nothing sent after it can be matched to anything sent before; a report that
/// was queued under the old key and then posted carrying that old key would have broken that promise silently,
/// hours later. The day is the one the report was observed on, so a report queued yesterday still dedupes against
/// yesterday. This is `withCurrentNonce` in apps/web/src/report.ts, in Swift.
public func withCurrentNonce(_ r: Report, secret: String) -> Report {
    var out = r
    out.clientNonce = dedupeNonce(secret: secret, targetId: r.targetId, when: parseInstantOrNow(r.observedAt))
    return out
}

// ---- the outbox ----------------------------------------------------------------------------------
/// Worth trying again later: the server was busy, rate-limited us, timed out, or couldn't be reached.
public func retryable(_ status: Int) -> Bool { status >= 500 || status == 429 || status == 408 }

/// What happened to one report, in the words the screen uses. `failed` exists so that a phone that could not even
/// write the queue says so instead of promising to try later (iPhone review, 2026-09-20).
public enum SubmitOutcome: String, Sendable { case sent, queued, failed }

/// Anything that can try to send one queued item. A protocol, so a test can hand the outbox a slow or a flaky
/// sender without a network.
public protocol OutboxSender: Sendable {
    associatedtype Item
    func send(_ item: Item) async -> Bool
}

/// Things waiting to be sent, kept on this phone until they go (docs/05 "Offline").
///
/// An actor keeps two callers out of each other's way *between* suspension points, but it does **not** hold that
/// isolation across an `await`: two flushes (the app launching while it also comes back to the front) each read
/// the same queue and sent every item twice. `flushing` closes that door — a second flush while one is running
/// returns at once, and the one already running picks up anything added in the meantime (iPhone review,
/// 2026-09-20).
public actor Outbox<Item: Codable & Equatable & Sendable> {
    private let file: URL
    private let max: Int
    private let send: @Sendable (Item) async -> Bool
    private var flushing = false
    /// True when the last write to the queue file failed, so the UI can stop claiming things are waiting safely.
    public private(set) var lastWriteFailed = false

    public init(file: URL, max: Int, send: @escaping @Sendable (Item) async -> Bool) {
        self.file = file
        self.max = max
        self.send = send
    }

    public init<S: OutboxSender>(file: URL, max: Int, sender: S) where S.Item == Item {
        self.init(file: file, max: max, send: { await sender.send($0) })
    }

    private func queue() -> [Item] {
        guard let d = DeviceState.read(file), let q = try? JSONDecoder().decode([Item].self, from: d) else { return [] }
        return q
    }

    @discardableResult private func save(_ q: [Item]) -> Bool {
        guard let d = try? JSONEncoder().encode(Array(q.suffix(max))) else { lastWriteFailed = true; return false }
        do { try DeviceState.write(d, to: file); lastWriteFailed = false; return true }
        catch { lastWriteFailed = true; return false }
    }

    /// Sends now if it can; otherwise keeps it (the newest `max`) and tries again later.
    public func submit(_ item: Item) async -> SubmitOutcome {
        if await send(item) { return .sent }
        return save(queue() + [item]) ? .queued : .failed
    }

    /// Tries everything waiting; keeps what still didn't go, plus anything added while this was running.
    public func flush() async {
        if flushing { return }
        flushing = true
        defer { flushing = false }
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

    /// How many are waiting. Shown on the Your privacy screen, so nothing is queued out of sight.
    public func waiting() -> Int { queue().count }

    /// Throw away everything waiting, without sending it. Nothing waiting is worth keeping against a person's
    /// wishes: this is their phone and their report.
    @discardableResult public func clear() -> Bool { save([]) }
}

// ---- small time helpers ---------------------------------------------------------------------------
/// The Detroit calendar day, which is the day the dedupe hash is made from (DetroitQuery owns the wall clock).
func detroitDay(_ when: Date) -> String { wallDateString(toWall(when)) }

/// "2026-09-20T15:04Z": UTC, to the minute, never the second (docs/08).
func minuteStamp(_ when: Date) -> String {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    let p = c.dateComponents([.year, .month, .day, .hour, .minute], from: when)
    return String(format: "%04d-%02d-%02dT%02d:%02dZ", p.year!, p.month!, p.day!, p.hour!, p.minute!)
}

/// The `observed_at` we wrote, read back. DetroitQuery's parser already takes a stamp with no seconds.
func parseInstantOrNow(_ s: String) -> Date { parseInstant(s) ?? .now }
