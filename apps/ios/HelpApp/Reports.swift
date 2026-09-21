// What the screens talk to when a person taps "Still open" or one of the correction kinds. The report itself, the
// install key, the one-day hash and the outbox all live in HelpCore, where `swift test` checks them; this file is
// only the part that needs an app: the published state the screens watch, and the POST.
import Combine
import Foundation
import HelpCore

/// Posts one report. A plain JSON POST on the app's one session — no cookies, no credentials, no cache, and a
/// User-Agent that says only "313Help-iOS/<version>" (HelpCore/Net). The only thing that identifies it is the
/// day-hash inside the body, and that hash is worked out again here, at the moment it goes: a report that waited
/// in the outbox across "Make a new key" must not carry the old key's hash (apps/web/src/report.ts does the same).
@Sendable func postReport(_ queued: Report) async -> Bool {
    guard let url = Config.reportsURL else { return false }
    guard let secret = try? await InstallKey.shared.value() else { return false }
    guard let body = try? JSONEncoder().encode(withCurrentNonce(queued, secret: secret)) else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = body
    req.httpShouldHandleCookies = false
    do {
        let (_, res) = try await Net.session.data(for: req)
        return !retryable((res as? HTTPURLResponse)?.statusCode ?? 0)
    } catch { return false }
}

/// One report per target per screen visit, and the answer the person sees. The map is memory only: a phone that is
/// restarted has no record of what was reported, only the outbox of what has not gone yet.
@MainActor final class Reporter: ObservableObject {
    static let shared = Reporter()
    @Published private(set) var done: [String: SubmitOutcome] = [:]
    /// How many reports are waiting on this phone, for the Your privacy screen. Nothing is queued out of sight.
    @Published private(set) var waiting = 0

    private let box = Outbox<Report>(file: DeviceState.dir.appendingPathComponent("outbox-reports.json"), max: 50, send: postReport)

    func submit(targetId: String, kind: String, detail: String = "") async {
        guard let secret = try? await InstallKey.shared.value() else {
            // No usable key means no dedupe hash, so there is nothing honest to send. Say so rather than
            // promising to try later (iPhone review, 2026-09-20).
            done[targetId] = .failed
            return
        }
        let report = buildReport(targetId: targetId, kind: kind, detail: detail, secret: secret)
        done[targetId] = await box.submit(report)
        await count()
    }

    /// Tries the queue again: at launch, and every time the app comes back to the front.
    func flush() async {
        await box.flush()
        await count()
    }

    /// Throws away what is waiting, without sending it: it is this person's phone and their report.
    @discardableResult func clearQueue() async -> Bool {
        let ok = await box.clear()
        await count()
        return ok
    }

    func count() async { waiting = await box.waiting() }
    func forget(_ targetId: String) { done[targetId] = nil }
}
