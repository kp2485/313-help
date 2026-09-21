// Tests for the app itself, as opposed to DetroitQuery (which has the shared fixtures in Tests/DetroitQueryTests).
//
// These used to live in HelpAppTests/AppTests.swift and ran only as a target of the git-ignored Xcode project, so
// nothing in CI ever ran them (iPhone review, 2026-09-20). They are here now, against the HelpCore library, and
// `swift test` runs them on macOS and on Linux.
//
// Two small groups are guarded by `#if canImport(CryptoKit)`: the Ed25519 signature maths (no Ed25519 exists in
// the Swift standard library on Linux, and this repo takes no dependency to get one) and the backup flag (a file
// attribute that only Apple's file systems have). Everything around both — what shape a key may be, which keys and
// signatures are refused before any maths, the downgrade floor — runs everywhere.
#if canImport(CryptoKit)
import CryptoKit
#endif
import DetroitQuery
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking  // URLSession on Linux
#endif
import XCTest

@testable import HelpCore

func tempDir() -> URL {
    let d = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
}
func day(_ s: String) -> Date { parseInstant(s + "T15:00:00Z")! }

/// Bytes from a hex string, for the encoded points written out below.
func hexData(_ hex: String) -> Data {
    var out = Data()
    var i = hex.startIndex
    while i < hex.endIndex {
        let j = hex.index(i, offsetBy: 2)
        out.append(UInt8(hex[i..<j], radix: 16)!)
        i = j
    }
    return out
}

/// SPKI DER: the fixed 12-byte Ed25519 header, then the 32-byte key. The shape a pinned key has.
func spki(_ raw: Data) -> String {
    (Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]) + raw).base64EncodedString()
}

/// A well-formed public key that is not a small-order point. Only ever a *public* key, made here and thrown away:
/// this repo never carries a private key and a test never invents one for a release.
func somePublicKey() -> String {
    #if canImport(CryptoKit)
    return spki(Curve25519.Signing.PrivateKey().publicKey.rawRepresentation)
    #else
    var raw = Hash.randomBytes(32)
    raw[31] &= 0x3f                                   // keep y below q; the value need not be on the curve here
    return spki(raw)
    #endif
}

// ---- SHA-256, the one hash ------------------------------------------------------------------------
final class HashTests: XCTestCase {
    /// FIPS 180-4's own examples, so the copy CI exercises is known-good and not merely self-consistent.
    func testThePublishedVectors() {
        XCTAssertEqual(Hash.hex(PureSHA256.hash(Data())),
                       "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(Hash.hex(PureSHA256.hash(Data("abc".utf8))),
                       "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(Hash.hex(PureSHA256.hash(Data("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".utf8))),
                       "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
        XCTAssertEqual(Hash.hex(PureSHA256.hash(Data(repeating: UInt8(ascii: "a"), count: 1_000_000))),
                       "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
    }

    /// On a phone the app uses CryptoKit; the two must be the same function, including across a block boundary.
    func testTheTwoImplementationsAgree() {
        #if canImport(CryptoKit)
        for n in [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000] {
            let d = Data((0..<n).map { UInt8($0 % 251) })
            XCTAssertEqual(Hash.hex(PureSHA256.hash(d)), Hash.hex(Data(CryptoKit.SHA256.hash(data: d))), "\(n) bytes")
        }
        #endif
    }

    func testRandomBytesAreRandomAndTheRightLength() {
        XCTAssertEqual(Hash.randomBytes(32).count, 32)
        XCTAssertNotEqual(Hash.randomBytes(32), Hash.randomBytes(32))
    }
}

// ---- the per-target daily dedupe hash ------------------------------------------------------------
final class NonceTests: XCTestCase {
    /// The same value the web app produces: sha256("secret|target|Detroit day"), checked against
    /// `printf 'testsecret|sal_test_row|2026-09-20' | shasum -a 256`.
    func testMatchesTheWebApp() {
        XCTAssertEqual(dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: day("2026-09-20")),
                       "dcdbf48a5f7123692dbe4897f236aa9388e9073d951898ce1fb349dc66350264")
    }

    func testIsStableWithinADayAndUnlinkableAcrossDaysTargetsAndKeys() {
        let a = dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: day("2026-09-20"))
        // Same phone, same place, same day, a different hour: the server counts it once.
        XCTAssertEqual(a, dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: parseInstant("2026-09-20T23:30:00Z")!))
        // A different day, a different place, a different key: three hashes nobody can join up.
        XCTAssertNotEqual(a, dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: day("2026-09-21")))
        XCTAssertNotEqual(a, dedupeNonce(secret: "testsecret", targetId: "sal_other_row", when: day("2026-09-20")))
        XCTAssertNotEqual(a, dedupeNonce(secret: "anotherkey", targetId: "sal_test_row", when: day("2026-09-20")))
        XCTAssertEqual(a.count, 64)                           // the Worker's NONCE pattern is 64 hex characters
        XCTAssertTrue(a.allSatisfy(\.isHexDigit))
    }

    /// The day is Detroit's, not UTC's: 9pm on the 20th in Detroit is the 21st in UTC, and must still be the 20th.
    func testUsesTheDetroitDay() {
        XCTAssertEqual(dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: parseInstant("2026-09-21T01:00:00Z")!),
                       dedupeNonce(secret: "testsecret", targetId: "sal_test_row", when: day("2026-09-20")))
    }

    func testTheKeyIsRandomAndResettable() async throws {
        let key = InstallKey(dir: tempDir())
        let first = try await key.value()
        let again = try await key.value()
        XCTAssertEqual(first.count, 64)
        XCTAssertEqual(first, again)                          // the same key until it is reset
        let second = try await key.reset()
        let afterReset = try await key.value()
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(second, afterReset)
        // After a reset the same place on the same day gets a hash that can't be tied to the earlier one.
        XCTAssertNotEqual(dedupeNonce(secret: first, targetId: "sal_x", when: day("2026-09-20")),
                          dedupeNonce(secret: second, targetId: "sal_x", when: day("2026-09-20")))
    }

    /// Nothing in a built report but the five fields the Worker's closed schema allows.
    func testAReportCarriesNothingElse() throws {
        let r = buildReport(targetId: "sal_x", kind: "closed_permanently", detail: "  gate was locked  ",
                            when: parseInstant("2026-09-20T15:04:09Z")!, secret: "testsecret")
        let json = try JSONSerialization.jsonObject(with: try JSONEncoder().encode(r)) as! [String: Any]
        XCTAssertEqual(Set(json.keys), ["target_id", "kind", "detail", "observed_at", "client_nonce"])
        XCTAssertEqual(json["observed_at"] as? String, "2026-09-20T15:04Z")   // minutes, never seconds
        XCTAssertEqual(json["detail"] as? String, "gate was locked")
        // An empty note is left out rather than sent as an empty string.
        let quiet = buildReport(targetId: "sal_x", kind: "confirmed_ok", detail: "   ", when: .now, secret: "testsecret")
        let quietJSON = try JSONSerialization.jsonObject(with: try JSONEncoder().encode(quiet)) as! [String: Any]
        XCTAssertFalse(quietJSON.keys.contains("detail"))
    }

    func testANoteIsCutToWhatTheWorkerAccepts() {
        let r = buildReport(targetId: "sal_x", kind: "wrong_info", detail: String(repeating: "a", count: 400), secret: "s")
        XCTAssertEqual(r.detail?.count, 280)
    }

    /// Condition reports are about things, never people (docs/11).
    func testNoReportKindIsAboutAPerson() {
        for kind in ReportKinds.place + ReportKinds.listing {
            for word in ["person", "people", "tent", "camp", "vehicle", "suspicious", "loiter"] {
                XCTAssertFalse(kind.contains(word), "\(kind) names a person")
            }
        }
        // "Out of supplies" is offered where there are supplies, and nowhere else.
        XCTAssertTrue(ReportKinds.listing(for: "food.pantry").contains("out_of_stock"))
        XCTAssertFalse(ReportKinds.listing(for: "legal").contains("out_of_stock"))
    }

    // ---- "Make a new key" and a report that was already waiting ------------------------------------
    /// A report queued under the old key must not go out carrying the old key: that would let the server join it
    /// to everything sent before "Make a new key", hours later. The nonce is worked out again at send time, from
    /// the key this phone has now and the day the report was observed (iPhone review, 2026-09-20).
    func testAQueuedReportIsRenoncedWithTheKeyThePhoneHasNow() {
        let queued = buildReport(targetId: "sal_x", kind: "wrong_hours", when: day("2026-09-20"), secret: "oldkey")
        let afterReset = withCurrentNonce(queued, secret: "newkey")
        XCTAssertNotEqual(afterReset.clientNonce, queued.clientNonce)
        // Everything else about the report is untouched, including the day it dedupes against.
        XCTAssertEqual(afterReset.observedAt, queued.observedAt)
        XCTAssertEqual(afterReset.targetId, queued.targetId)
        XCTAssertEqual(afterReset.clientNonce,
                       dedupeNonce(secret: "newkey", targetId: "sal_x", when: day("2026-09-20")))
        // Nothing changes when the key has not changed.
        XCTAssertEqual(withCurrentNonce(queued, secret: "oldkey"), queued)
    }

    /// A key file that is there but unreadable is never quietly replaced, and a failed write is never reported as
    /// a success (iPhone review, 2026-09-20).
    func testAnUnreadableKeyIsAnErrorNotASilentNewKey() async throws {
        let dir = tempDir()
        let file = dir.appendingPathComponent("install-key")
        try Data("not a key".utf8).write(to: file)
        let key = InstallKey(dir: dir)
        do {
            _ = try await key.value()
            XCTFail("a key file we cannot use must be an error")
        } catch { XCTAssertEqual(error as? InstallKey.Failure, .unreadable) }
        // And it is still there: nothing overwrote it behind the person's back.
        XCTAssertEqual(try Data(contentsOf: file), Data("not a key".utf8))
        // "Make a new key" is the one thing that may replace it, because that is what the person asked for.
        let made = try await key.reset()
        let now = try await key.value()
        XCTAssertEqual(made.count, 64)
        XCTAssertEqual(now, made)
    }

    func testAKeyThatCannotBeWrittenFailsRatherThanPretending() async {
        // A directory that cannot be created: the key has nowhere to live.
        let blocked = tempDir().appendingPathComponent("file.txt")
        try? Data("x".utf8).write(to: blocked)
        let key = InstallKey(dir: blocked.appendingPathComponent("state"))
        do {
            _ = try await key.value()
            XCTFail("a key that could not be written must not be returned as if it had been")
        } catch { XCTAssertEqual(error as? InstallKey.Failure, .couldNotWrite) }
    }
}

// ---- the offline outbox ---------------------------------------------------------------------------
private actor Attempts {
    private(set) var items: [Report] = []
    func add(_ r: Report) { items.append(r) }
    var count: Int { items.count }
}

/// A sender that takes its time, so two flushes really do overlap.
private struct SlowSender: OutboxSender {
    let seen: Attempts
    let ok: Bool
    func send(_ item: Report) async -> Bool {
        await seen.add(item)
        try? await Task.sleep(nanoseconds: 60_000_000)
        return ok
    }
}

final class OutboxTests: XCTestCase {
    private func report(_ id: String) -> Report {
        buildReport(targetId: id, kind: "confirmed_ok", when: day("2026-09-20"), secret: "testsecret")
    }

    func testKeepsWhatCouldNotBeSentAndSendsItLater() async {
        let file = tempDir().appendingPathComponent("outbox.json")
        let seen = Attempts()
        // Offline: nothing goes, and the report waits on the phone.
        let offline = Outbox<Report>(file: file, max: 50, send: { await seen.add($0); return false })
        let sent = await offline.submit(report("sal_a"))
        let waitingOffline = await offline.waiting()
        XCTAssertEqual(sent, .queued)
        XCTAssertEqual(waitingOffline, 1)

        // Back online, the same file: the queue empties and nothing is sent twice.
        let online = Outbox<Report>(file: file, max: 50, send: { await seen.add($0); return true })
        await online.flush()
        let waitingAfter = await online.waiting()
        await online.flush()
        let tries = await seen.count
        XCTAssertEqual(waitingAfter, 0)
        XCTAssertEqual(tries, 2)                              // one failed try, one that went
    }

    func testKeepsOnlyTheNewestReportsSoTheQueueCannotGrowForever() async {
        let box = Outbox<Report>(file: tempDir().appendingPathComponent("outbox.json"), max: 3, send: { _ in false })
        for i in 0..<6 { _ = await box.submit(report("sal_\(i)")) }
        let waiting = await box.waiting()
        XCTAssertEqual(waiting, 3)
    }

    /// A report that was sent is gone from the phone; one that failed is not.
    func testAFailedItemStaysAndASentOneDoesNot() async {
        let file = tempDir().appendingPathComponent("outbox.json")
        let box = Outbox<Report>(file: file, max: 50, send: { $0.targetId == "sal_ok" })
        let ok = await box.submit(report("sal_ok"))
        let emptyAfterSend = await box.waiting()
        let no = await box.submit(report("sal_no"))
        await box.flush()
        let stillWaiting = await box.waiting()
        XCTAssertEqual(ok, .sent)
        XCTAssertEqual(emptyAfterSend, 0)
        XCTAssertEqual(no, .queued)
        XCTAssertEqual(stillWaiting, 1)
    }

    /// An actor does **not** hold its isolation across an `await`, so the two flushes the app starts (one at
    /// launch, one when it comes back to the front) used to read the same queue and send everything twice. The
    /// second flush now returns at once (iPhone review, 2026-09-20).
    func testTwoFlushesAtOnceDoNotSendAnythingTwice() async {
        let file = tempDir().appendingPathComponent("outbox.json")
        let seen = Attempts()
        let parked = Outbox<Report>(file: file, max: 50, send: { _ in false })
        for i in 0..<3 { _ = await parked.submit(report("sal_\(i)")) }

        let box = Outbox<Report>(file: file, max: 50, sender: SlowSender(seen: seen, ok: true))
        async let a: Void = box.flush()
        async let b: Void = box.flush()
        _ = await (a, b)
        let tries = await seen.count
        XCTAssertEqual(tries, 3, "each queued report was sent once, not once per flush")
        let waiting = await box.waiting()
        XCTAssertEqual(waiting, 0)
    }

    /// The person can throw away what is waiting; it is their phone and their report.
    func testWhatIsWaitingCanBeCountedAndThrownAway() async {
        let box = Outbox<Report>(file: tempDir().appendingPathComponent("outbox.json"), max: 50, send: { _ in false })
        for i in 0..<4 { _ = await box.submit(report("sal_\(i)")) }
        let before = await box.waiting()
        XCTAssertEqual(before, 4)
        let cleared = await box.clear()
        let after = await box.waiting()
        XCTAssertTrue(cleared)
        XCTAssertEqual(after, 0)
    }

    /// Only a busy, rate-limited, timed-out or unreachable server is worth another try. A 400 never will be.
    func testWhichAnswersAreWorthRetrying() {
        XCTAssertTrue(retryable(500)); XCTAssertTrue(retryable(503)); XCTAssertTrue(retryable(429)); XCTAssertTrue(retryable(408))
        XCTAssertFalse(retryable(202)); XCTAssertFalse(retryable(400)); XCTAssertFalse(retryable(422))
    }
}

// ---- saved places ------------------------------------------------------------------------------------
final class SavedTests: XCTestCase {
    /// A phone can be looked through by someone else (audit A8).
    func testTheseCanNeverBeSaved() {
        for category in ["shelter.dv", "health.mental", "health.mental.crisis", "treatment", "treatment.detox", "assault"] {
            XCTAssertFalse(canSave(category), "\(category) must not be savable")
        }
        for category in ["food.pantry", "shelter.emergency", "health.clinic", "jobs.find", "rec"] {
            XCTAssertTrue(canSave(category), "\(category) should be savable")
        }
    }

    func testSavingIsOnThisPhoneNewestFirstAndCapped() {
        let dir = tempDir()
        let saved = SavedStore(dir: dir)
        saved.toggle("sal_a", category: "food.pantry")
        saved.toggle("sal_b", category: "food.pantry")
        XCTAssertEqual(saved.ids, ["sal_b", "sal_a"])
        saved.toggle("sal_dv", category: "shelter.dv")
        XCTAssertEqual(saved.ids, ["sal_b", "sal_a"])          // refused, silently: no button offers it
        saved.toggle("sal_a", category: "food.pantry")
        XCTAssertEqual(saved.ids, ["sal_b"])
        // It is on this phone, in a file, and comes back when the app is opened again.
        XCTAssertEqual(SavedStore(dir: dir).ids, ["sal_b"])
        for i in 0..<120 { saved.toggle("sal_x\(i)", category: "food.pantry") }
        XCTAssertEqual(saved.ids.count, 100)
        saved.clear()
        XCTAssertTrue(saved.ids.isEmpty)
        XCTAssertTrue(SavedStore(dir: dir).ids.isEmpty)
    }

    /// A listing saved before its category changed can still be removed.
    func testAPrivateListingCanAlwaysBeRemoved() {
        let saved = SavedStore(dir: tempDir())
        saved.toggle("sal_a", category: "food.pantry")
        saved.toggle("sal_a", category: "treatment")
        XCTAssertTrue(saved.ids.isEmpty)
    }
}

// ---- what this phone keeps, and what a backup may have ------------------------------------------------
final class DeviceStateTests: XCTestCase {
    /// The install key, the outbox and the saved list must not be in an iCloud or a Finder backup: a backup is
    /// restored onto another phone, and the key is the one secret this app has (docs/08; iPhone review
    /// 2026-09-20). The flag is re-applied on every launch, because a directory that is recreated loses it.
    func testTheStateDirectoryIsKeptOutOfBackups() throws {
        #if canImport(Darwin)
        let dir = tempDir().appendingPathComponent("state", isDirectory: true)
        try DeviceState.prepare(dir)
        XCTAssertEqual(DeviceState.isExcludedFromBackup(dir), true)

        // Thrown away and made again — as a restore or a "clear everything" would — and prepared once more.
        try FileManager.default.removeItem(at: dir)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        XCTAssertNotEqual(DeviceState.isExcludedFromBackup(dir), true, "a fresh directory starts out backed up")
        try DeviceState.prepare(dir)
        XCTAssertEqual(DeviceState.isExcludedFromBackup(dir), true)

        // And the real one the app uses.
        try DeviceState.prepare()
        XCTAssertEqual(DeviceState.isExcludedFromBackup(DeviceState.dir), true)
        #endif
    }

    /// The verified copy of the list is a cache: it belongs in Caches, which is not backed up and can be
    /// reclaimed, not in Application Support beside the key.
    func testTheBundleCacheLivesInCaches() {
        // The platform's own caches directory: Library/Caches on an iPhone or a Mac, ~/.cache on the Linux CI runner.
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].standardizedFileURL.path
        XCTAssertTrue(DeviceState.cacheDir.standardizedFileURL.path.hasPrefix(caches), DeviceState.cacheDir.path)
        XCTAssertFalse(DeviceState.cacheDir.path.contains("Application Support"), DeviceState.cacheDir.path)
    }

    /// A file that exists and cannot be read is an error, not "absent": absent would mean overwriting it.
    func testAnUnreadableFileIsNotMistakenForAMissingOne() throws {
        let dir = tempDir()
        XCTAssertNil(try DeviceState.readStrict(dir.appendingPathComponent("nothing-here")))
        // A directory where a file should be: it exists, and reading it as a file fails.
        let asDir = dir.appendingPathComponent("install-key", isDirectory: true)
        try FileManager.default.createDirectory(at: asDir, withIntermediateDirectories: true)
        XCTAssertThrowsError(try DeviceState.readStrict(asDir))
    }

    func testAWriteThatCannotHappenThrows() {
        let blocked = tempDir().appendingPathComponent("plain.txt")
        try? Data("x".utf8).write(to: blocked)
        XCTAssertThrowsError(try DeviceState.write(Data("y".utf8), to: blocked.appendingPathComponent("under/a/file")))
    }
}

// ---- the one session every request goes through ------------------------------------------------------
final class NetTests: XCTestCase {
    /// No cookies in, no cookies out, no URL cache, no credentials, and a User-Agent that says who we are and
    /// nothing about the phone (iPhone review, 2026-09-20).
    func testTheSessionRemembersNothingAboutThePerson() {
        let c = Net.configuration(version: "0.1")
        XCTAssertEqual(Net.problems(c, version: "0.1"), [])
        XCTAssertNil(c.httpCookieStorage)
        XCTAssertFalse(c.httpShouldSetCookies)
        XCTAssertEqual(c.httpCookieAcceptPolicy, .never)
        XCTAssertNil(c.urlCache)
        XCTAssertNil(c.urlCredentialStorage)
        XCTAssertEqual(c.requestCachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testTheUserAgentIsHonestAndCarriesNothingAboutTheDevice() {
        let ua = Net.userAgent(version: "0.1")
        XCTAssertEqual(ua, "313Help-iOS/0.1")
        for leak in ["iPhone", "CFNetwork", "Darwin", "Mozilla", "arm64", "Mac", "AppleWebKit"] {
            XCTAssertFalse(ua.contains(leak), "the User-Agent must not mention \(leak)")
        }
    }

    /// One session for every request the app makes: the bundle GETs and the report POSTs both use it.
    func testTheAppUsesOneSessionForEverything() {
        Net.start(version: "0.1")
        XCTAssertEqual(Net.problems(Net.session.configuration, version: "0.1"), [])
        XCTAssertFalse(Net.session === URLSession.shared)
    }
}

// ---- a place with coordinates but no address, and links built out of somebody else's text -------------
final class ListingTests: XCTestCase {
    /// Built the way the app builds one: decoded from the bundle's own JSON shape.
    private func row(address: String? = nil, point: (Double, Double)? = nil,
                     phone: String? = nil, category: String = "harm.supplies") -> BundleRow {
        let bits = [
            #""id":"sal_x","name":"n","org":"o","category":"\#(category)","what":"w""#,
            address.map { #""address":{"line1":"\#($0)","city":"Detroit","zip":"48208"}"# },
            point.map { #""lat":\#($0.0),"lon":\#($0.1)"# },
            #""phones":[\#(phone.map { #"{"number":"\#($0)"}"# } ?? "")]"#,
            #""availability":"always","schedules":[],"flags":[],"status":"active""#,
            #""facts":{"reports":{"closed_open":0,"wrong_open":0},"source":{"type":"web","name":"Wayne County"}}"#,
        ].compactMap { $0 }
        return try! bundleDecoder().decode(BundleRow.self, from: Data("{\(bits.joined(separator: ","))}".utf8))
    }

    /// The Wayne County naloxone and test-strip stations (sal_wws_*) have a point and no street address.
    func testAPointWithNoAddressStillGetsDirections() {
        let station = row(point: (42.3378412, -83.1770116))
        // The destination is the coordinate itself, handed to the maps app as a coordinate.
        XCTAssertEqual(mapsDestination(station), "42.3378412,-83.1770116")
        XCTAssertTrue(showsPointWithoutAddress(station))
        XCTAssertNil(station.address)   // and no address is invented from it, here or anywhere
    }

    func testAStreetAddressIsUsedWhenThePlacePublishesOne() {
        let pantry = row(address: "2424 W Grand Blvd", point: (42.1, -83.1), category: "food.pantry")
        XCTAssertEqual(mapsDestination(pantry), "2424 W Grand Blvd, Detroit, MI 48208")
        XCTAssertFalse(showsPointWithoutAddress(pantry))
    }

    /// A DV or crisis listing never hands a maps app anything, with or without a coordinate.
    func testASensitiveListingIsNeverMapped() {
        for category in ["shelter.dv", "health.mental"] {
            XCTAssertNil(mapsDestination(row(point: (42.3, -83.1), category: category)))
            XCTAssertNil(mapsURL(row(point: (42.3, -83.1), category: category)))
            XCTAssertFalse(showsPointWithoutAddress(row(point: (42.3, -83.1), category: category)))
        }
    }

    /// Kyle, 2026-09-20: a DV shelter's only statement about where it is, is the coarse area it serves, in
    /// words. No address, no ZIP, no coordinate, no distance, no map, no directions.
    func testADvListingNamesAnAreaAndNothingElse() {
        let json = #"{"id":"sal_dv","name":"Crisis line","org":"o","category":"shelter.dv","what":"Call any time.","service_area":"detroit","phones":[{"number":"313-555-0100"}],"availability":"always","schedules":[],"flags":[],"status":"active","facts":{"reports":{"closed_open":0,"wrong_open":0},"source":{"type":"web","name":"t"}}}"#
        let dv = try! bundleDecoder().decode(BundleRow.self, from: Data(json.utf8))
        XCTAssertEqual(dv.serviceArea, "detroit")
        XCTAssertNil(dv.address); XCTAssertNil(dv.lat); XCTAssertNil(dv.lon)
        XCTAssertEqual(serviceAreaStringKey(dv), "area.detroit")
        XCTAssertTrue(saysNoAddress(dv))
        // Still nothing to hand another app, area or no area.
        XCTAssertNil(mapsDestination(dv)); XCTAssertNil(transitAppDestination(dv))
        XCTAssertFalse(showsPointWithoutAddress(dv))
        // A DV row with no area recorded still carries the sentence, and still names no key.
        let noArea = row(category: "shelter.dv")
        XCTAssertNil(serviceAreaStringKey(noArea)); XCTAssertTrue(saysNoAddress(noArea))
        // An ordinary listing is untouched by all of this.
        XCTAssertNil(serviceAreaStringKey(row(address: "1 Main St", category: "food.pantry")))
        XCTAssertFalse(saysNoAddress(row(category: "food.pantry")))
    }

    /// The band is a function of the area alone: two shelters serving one area always tie, and neither ever
    /// carries a distance, so nothing about the order can be read back as a place.
    func testDvRowsBandByTheirAreaAndNeverCarryADistance() {
        func dv(_ id: String, _ area: String?) -> BundleRow {
            let extra = area.map { #","service_area":"\#($0)""# } ?? ""
            let json = #"{"id":"\#(id)","name":"\#(id)","org":"o","category":"shelter.dv","what":"w"\#(extra),"phones":[{"number":"313-555-0100"}],"availability":"always","schedules":[],"flags":[],"status":"active","facts":{"reports":{"closed_open":0,"wrong_open":0},"source":{"type":"web","name":"t"}}}"#
            return try! bundleDecoder().decode(BundleRow.self, from: Data(json.utf8))
        }
        let rows = [dv("a", "detroit"), dv("b", "detroit"), dv("c", "dearborn"), dv("d", "national")]
        var q = Query(category: "shelter.dv")
        q.near = LatLon(lat: 42.35, lon: -83.06)
        let out = rank(rows, q, now: Date(timeIntervalSince1970: 1789753500))
        XCTAssertEqual(out.map(\.row.id), ["a", "b", "c", "d"])
        XCTAssertEqual(out.map(\.band), [0, 0, 1, 2])
        XCTAssertTrue(out.allSatisfy { $0.miles == nil })
    }

    func testNoAddressAndNoPointMeansNoDirections() {
        XCTAssertNil(mapsDestination(row()))
        XCTAssertNil(mapsURL(row()))
        XCTAssertFalse(showsPointWithoutAddress(row()))
    }

    // ---- a hostile address ---------------------------------------------------------------------------
    /// `.urlQueryAllowed` lets `&`, `=`, `+` and `#` through, so an address with "&from=…" in it added a *second*
    /// parameter — an origin, which docs/08 says we never send. Everything but letters, digits and `-._~` is
    /// escaped now, in both links (iPhone review, 2026-09-20).
    func testAnAddressCannotAddAParameterToAMapsLink() {
        let hostile = row(address: "100 Main St&from=42.331,-83.045&x=1#frag", category: "food.pantry")
        let url = mapsURL(hostile)!
        XCTAssertEqual(url.absoluteString,
                       "https://maps.apple.com/?daddr=100%20Main%20St%26from%3D42.331%2C-83.045%26x%3D1%23frag%2C%20Detroit%2C%20MI%2048208")
        // One parameter, named daddr, and no origin anywhere in the link.
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)!.percentEncodedQuery!
        XCTAssertEqual(query.filter { $0 == "&" }.count, 0)
        XCTAssertEqual(query.filter { $0 == "=" }.count, 1)
        XCTAssertFalse(url.absoluteString.lowercased().contains("from="))
        XCTAssertNil(url.fragment)
    }

    func testAnAddressCannotAddAParameterToATransitLink() {
        let hostile = row(address: "1 Main St&from=42.3,-83.0", category: "food.pantry")
        let url = transitAppURL(hostile, canOpen: { _ in true })!
        XCTAssertEqual(url.absoluteString, "transit://directions?to=1%20Main%20St%26from%3D42.3%2C-83.0%2C%20Detroit%2C%20MI%2048208")
        XCTAssertFalse(url.absoluteString.contains("&"))
        XCTAssertEqual(url.absoluteString.filter { $0 == "=" }.count, 1)
    }

    /// A plus sign is left alone by `.urlQueryAllowed` and means a space to many servers; it is escaped too.
    func testAPlusAndAHashAreEscaped() {
        let odd = row(address: "12+14 Elm St #3", category: "food.pantry")
        let url = mapsURL(odd)!
        XCTAssertTrue(url.absoluteString.contains("12%2B14"))
        XCTAssertTrue(url.absoluteString.contains("%233"))
    }

    // ---- the Transit app link (transitapp.com's own documented scheme) -------------------------------------
    // Always a destination and nothing else: no `from`, no origin, no identifier. And `canOpen` stands in for
    // iOS: when no app can open `transit://`, the screen offers no row rather than a row that does nothing.
    private let canOpenAnything: (URL) -> Bool = { _ in true }

    func testTransitAppGetsTheCoordinateWhenThePublisherGivesOne() {
        // A place with both: Transit gets the point, because it geocodes an address string loosely (its own docs).
        let pantry = row(address: "2424 W Grand Blvd", point: (42.3378412, -83.1770116), category: "food.pantry")
        XCTAssertEqual(transitAppDestination(pantry), "42.3378412,-83.1770116")
        XCTAssertEqual(transitAppURL(pantry, canOpen: canOpenAnything)?.absoluteString,
                       "transit://directions?to=42.3378412%2C-83.1770116")
    }

    func testTransitAppFallsBackToTheWrittenAddress() {
        let clinic = row(address: "2424 W Grand Blvd", category: "health.clinic")
        XCTAssertEqual(transitAppDestination(clinic), "2424 W Grand Blvd, Detroit, MI 48208")
        let url = transitAppURL(clinic, canOpen: canOpenAnything)
        XCTAssertEqual(url?.scheme, "transit")
        XCTAssertEqual(url?.absoluteString, "transit://directions?to=2424%20W%20Grand%20Blvd%2C%20Detroit%2C%20MI%2048208")
    }

    /// The same gate as Directions: a listing whose directions are withheld gets no Transit link either.
    func testTransitAppIsNeverOfferedForASensitiveListing() {
        for category in ["shelter.dv", "health.mental", "health.mental.crisis"] {
            XCTAssertNil(transitAppDestination(row(address: "1 Main St", point: (42.3, -83.1), category: category)))
            XCTAssertNil(transitAppURL(row(point: (42.3, -83.1), category: category), canOpen: canOpenAnything))
        }
    }

    /// Treatment keeps its directions (people have to get there), so it keeps the Transit link too.
    func testTransitAppIsOfferedForTreatment() {
        XCTAssertNotNil(transitAppURL(row(address: "1 Main St", category: "treatment.detox"), canOpen: canOpenAnything))
    }

    func testNoAddressAndNoPointMeansNoTransitLink() {
        XCTAssertNil(transitAppDestination(row()))
        XCTAssertNil(transitAppURL(row(), canOpen: canOpenAnything))
    }

    /// No Transit app on the phone, no row. Nothing about the person is part of the question or the link.
    func testNoTransitAppInstalledMeansNoRow() {
        let pantry = row(address: "2424 W Grand Blvd", point: (42.3, -83.1), category: "food.pantry")
        XCTAssertNil(transitAppURL(pantry, canOpen: { _ in false }))
        XCTAssertFalse(transitAppURL(pantry, canOpen: canOpenAnything)!.absoluteString.contains("from"))
    }

    /// No published number, no Call button: the screens render one row per phone, and there are none.
    func testAListingWithNoPhoneOffersNoCall() {
        XCTAssertFalse(hasPhone(row(point: (42.3, -83.1))))
        XCTAssertTrue(hasPhone(row(phone: "313-555-0100")))
    }

    // ---- getting out in a hurry ----------------------------------------------------------------------
    /// The same neutral page the web app leaves for, and the same screens that offer it (docs/08).
    func testQuickExitGoesWhereTheWebAppGoes() {
        XCTAssertEqual(quickExitURLString, "https://www.weather.gov/")
        XCTAssertNotNil(quickExitURL)
        for id in ["unsafe", "talk", "drugs", "assault"] { XCTAssertTrue(needHasQuickExit(id), id) }
        for id in ["food", "shelter", "doctor", "narcan"] { XCTAssertFalse(needHasQuickExit(id), id) }
        for category in ["shelter.dv", "health.mental", "treatment.detox", "assault"] {
            XCTAssertTrue(listingHasQuickExit(category), category)
        }
        XCTAssertFalse(listingHasQuickExit("food.pantry"))
    }
}

// ---- phone numbers, including an extension ------------------------------------------------------------
final class TelLinkTests: XCTestCase {
    /// The Meldrum showers row publishes "313-579-2100 ext. 4217". Run together those digits dial a stranger; the
    /// extension goes after a pause instead.
    func testAnExtensionDialsAfterAPause() {
        XCTAssertEqual(telLink("313-579-2100 ext. 4217"), "tel:+13135792100,4217")
        XCTAssertEqual(telLink("(313) 579-2100 x4217"), "tel:+13135792100,4217")
        XCTAssertEqual(telLink("313-579-2100"), "tel:+13135792100")
        XCTAssertEqual(telLink("1-800-273-8255"), "tel:+18002738255")
        XCTAssertEqual(telLink("988"), "tel:988")
        XCTAssertEqual(telLink("911"), "tel:911")
    }
}

// ---- refusing a bundle we can't verify ---------------------------------------------------------------
final class BundleCheckTests: XCTestCase {
    func index(_ generatedAt: String) -> Data {
        Data(#"{"version":"v1","generated_at":"\#(generatedAt)","signing":"dev","files":{}}"#.utf8)
    }
    func sigJSON(_ base64: String) -> Data { Data(#"{"signature":"\#(base64)"}"#.utf8) }

    // ---- what shape a pinned key may be, checked without any maths ---------------------------------
    /// `der.suffix(32)` of anything 32 bytes or longer accepted a raw key with no header, a key with junk in front
    /// of it, and a 44-byte blob with somebody else's header (iPhone review, 2026-09-20).
    func testAPinnedKeyMustBeExactlyFortyFourBytesWithTheEd25519Header() {
        let raw = Data(Hash.randomBytes(32).prefix(31) + [0x11])
        XCTAssertNotNil(BundleCheck.rawPinnedKey(spki(raw)))
        // The raw 32 bytes on their own: no header, refused.
        XCTAssertNil(BundleCheck.rawPinnedKey(raw.base64EncodedString()))
        // 44 bytes with a header that says something else (an X25519 key agreement key).
        let wrongHeader = Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00]) + raw
        XCTAssertNil(BundleCheck.rawPinnedKey(wrongHeader.base64EncodedString()))
        // The right header with junk in front of it, so the last 32 bytes still look like a key.
        XCTAssertNil(BundleCheck.rawPinnedKey((Data([0, 0, 0, 0]) + Data(base64Encoded: spki(raw))!).base64EncodedString()))
        // Too long, too short, not base64, empty.
        XCTAssertNil(BundleCheck.rawPinnedKey(spki(raw + Data([0]))))
        XCTAssertNil(BundleCheck.rawPinnedKey(spki(Data(raw.prefix(31)))))
        XCTAssertNil(BundleCheck.rawPinnedKey("hello"))
        XCTAssertNil(BundleCheck.rawPinnedKey(""))
    }

    /// The eight small-order points sign anything; a build that pinned one would "verify" a list nobody signed.
    func testTheSmallOrderPointsAreNeverAKey() {
        XCTAssertEqual(BundleCheck.smallOrderKeys.count, 8)
        XCTAssertEqual(Set(BundleCheck.smallOrderKeys).count, 8)
        XCTAssertTrue(BundleCheck.smallOrderKeys.contains("0100000000000000000000000000000000000000000000000000000000000000"),
                      "the identity element must be on the list")
        for hex in BundleCheck.smallOrderKeys {
            let raw = hexData(hex)
            XCTAssertFalse(BundleCheck.isAcceptablePoint(raw), hex)
            XCTAssertNil(BundleCheck.rawPinnedKey(spki(raw)), hex)
            XCTAssertFalse(releaseKeyProblems([spki(raw), somePublicKey()]).isEmpty, hex)
        }
    }

    /// A y that is not written the one canonical way (y >= q) is a second spelling of a key; refused.
    func testANonCanonicalPointIsRefused() {
        var q = Data([UInt8](repeating: 0xff, count: 32))
        q[0] = 0xed
        q[31] = 0x7f                                      // q itself
        XCTAssertFalse(BundleCheck.isAcceptablePoint(q))
        var above = q
        above[0] = 0xee                                   // q + 1
        XCTAssertFalse(BundleCheck.isAcceptablePoint(above))
        var below = q
        below[0] = 0xec                                   // q - 1 is a field element, but it is the order-2 point
        XCTAssertFalse(BundleCheck.isAcceptablePoint(below))
    }

    /// An all-zero signature is what an attacker sends hoping a small-order key was pinned. It never verifies.
    func testAnAllZeroSignatureIsRefusedUnderEveryKey() {
        XCTAssertFalse(BundleCheck.isUsableSignature(Data(repeating: 0, count: 64)))
        XCTAssertFalse(BundleCheck.isUsableSignature(Data(repeating: 1, count: 63)))
        XCTAssertTrue(BundleCheck.isUsableSignature(Data(repeating: 1, count: 64)))
        let zero = sigJSON(Data(repeating: 0, count: 64).base64EncodedString())
        // Even with a verifier that says yes to everything, the signature never reaches it.
        let yes: Ed25519Verify = { _, _, _ in true }
        for key in [somePublicKey()] + BundleCheck.smallOrderKeys.map({ spki(hexData($0)) }) {
            XCTAssertThrowsError(try BundleCheck.verifiedIndex(index("2026-09-20T12:00:00Z"), sig: zero, pinned: [key], verify: yes))
        }
    }

    /// A build that pins nothing, or pins only unusable values, can never accept a bundle — verifier or no.
    func testABuildThatPinsNothingAcceptsNothing() {
        let yes: Ed25519Verify = { _, _, _ in true }
        let data = index("2026-09-20T12:00:00Z")
        let sig = sigJSON(Data(repeating: 7, count: 64).base64EncodedString())
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: sig, pinned: [], verify: yes))
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: sig, pinned: ["hello"], verify: yes))
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: Data("{}".utf8), pinned: [somePublicKey()], verify: yes))
        // And with no way to check a signature at all, that is an error, not a pass.
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: sig, pinned: [somePublicKey()], verify: nil))
    }

    func testAChangedFileIsCaughtByItsChecksum() {
        let file = Data("[]".utf8)
        XCTAssertEqual(BundleCheck.sha256Hex(file), "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945")
        XCTAssertNotEqual(BundleCheck.sha256Hex(Data("[ ]".utf8)), BundleCheck.sha256Hex(file))
    }

    func testMapsAndNeighborhoodNumbersLoadLaterNotAtStart() {
        XCTAssertTrue(BundleCheck.loadedNow("category/food.json"))
        XCTAssertFalse(BundleCheck.loadedNow("map/streets.json"))
        XCTAssertFalse(BundleCheck.loadedNow("indicators/neighborhoods.json"))
    }

    // ---- the downgrade floor -------------------------------------------------------------------------
    private func parsed(_ generatedAt: String) throws -> BundleIndex {
        try bundleDecoder().decode(BundleIndex.self, from: index(generatedAt))
    }

    /// A fresh install trusted nothing yet, so any correctly signed old list was "newer than nothing" and a phone
    /// could be started months in the past. The snapshot the build shipped is the floor (iPhone review,
    /// 2026-09-20).
    func testAFreshInstallIsNeverRolledBackBelowTheShippedSnapshot() throws {
        let older = try parsed("2026-09-01T12:00:00Z"), newer = try parsed("2026-09-20T12:00:00Z")
        XCTAssertTrue(BundleCheck.refusesOlder(current: newer, next: older))
        XCTAssertFalse(BundleCheck.refusesOlder(current: older, next: newer))
        // Nothing held and no floor: the old behaviour, which is what the floor exists to fix.
        XCTAssertFalse(BundleCheck.refusesOlder(current: nil, next: older))
        // With the floor the shipped snapshot writes in, the same old list is refused on a brand-new install.
        XCTAssertTrue(BundleCheck.refusesOlder(current: nil, next: older, floor: "2026-09-20T12:00:00Z"))
        XCTAssertFalse(BundleCheck.refusesOlder(current: nil, next: newer, floor: "2026-09-20T12:00:00Z"))
        // The snapshot's own list is exactly at the floor and still loads.
        XCTAssertFalse(BundleCheck.refusesOlder(current: nil, next: newer, floor: newer.generatedAt))
        // The floor never lets a phone go back below what it already holds, either.
        XCTAssertTrue(BundleCheck.refusesOlder(current: newer, next: older, floor: "2026-08-01T00:00:00Z"))
    }

    // ---- the maths itself, where there is any ---------------------------------------------------------
    #if canImport(CryptoKit)
    private func signature(_ data: Data, _ key: Curve25519.Signing.PrivateKey) -> Data {
        sigJSON(try! key.signature(for: data).base64EncodedString())
    }
    private func pin(_ key: Curve25519.Signing.PrivateKey) -> String { spki(key.publicKey.rawRepresentation) }

    func testOnlyAPinnedKeyIsBelieved() throws {
        let ours = Curve25519.Signing.PrivateKey(), theirs = Curve25519.Signing.PrivateKey()
        let data = index("2026-09-20T12:00:00Z")
        let signed = signature(data, ours)
        XCTAssertEqual(try BundleCheck.verifiedIndex(data, sig: signed, pinned: [pin(ours)]).version, "v1")
        // The spare key is pinned too, and either one is enough.
        XCTAssertEqual(try BundleCheck.verifiedIndex(data, sig: signed, pinned: [pin(theirs), pin(ours)]).version, "v1")
        // Signed by somebody else, not signed at all, or not pinning anything: refused.
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: signature(data, theirs), pinned: [pin(ours)]))
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: Data("{}".utf8), pinned: [pin(ours)]))
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(data, sig: signed, pinned: []))
        // One byte of the list changed after it was signed: refused.
        XCTAssertThrowsError(try BundleCheck.verifiedIndex(index("2026-09-20T12:00:01Z"), sig: signed, pinned: [pin(ours)]))
    }

    func testAnOlderBundleIsRefusedAfterARealSignatureCheck() throws {
        let key = Curve25519.Signing.PrivateKey()
        let older = index("2026-09-01T12:00:00Z"), newer = index("2026-09-20T12:00:00Z")
        let a = try BundleCheck.verifiedIndex(older, sig: signature(older, key), pinned: [pin(key)])
        let b = try BundleCheck.verifiedIndex(newer, sig: signature(newer, key), pinned: [pin(key)])
        XCTAssertTrue(BundleCheck.refusesOlder(current: b, next: a))
        XCTAssertFalse(BundleCheck.refusesOlder(current: a, next: b))
    }
    #endif
}

// ---- what a release build is allowed to ship ----------------------------------------------------------
final class ReleaseRuleTests: XCTestCase {
    private static let pair = [somePublicKey(), somePublicKey()]
    private var good: [String] { ReleaseRuleTests.pair }

    func testTwoRealKeysAndARealOriginPass() {
        XCTAssertEqual(releaseProblems(bundleBase: "https://313help.org/data/bundle/v1/", apiBase: "https://313help.org/", keys: good), [])
    }

    func testAnUnconfiguredReleaseIsRefused() {
        let problems = releaseProblems(bundleBase: "https://\(ReleaseRules.placeholderHost)/data/bundle/v1/",
                                       apiBase: "https://\(ReleaseRules.placeholderHost)/",
                                       keys: ["\(ReleaseRules.placeholderKey)-ACTIVE", "\(ReleaseRules.placeholderKey)-SPARE"])
        XCTAssertEqual(problems.count, 4)
        XCTAssertTrue(problems.allSatisfy { $0.contains("placeholder") })
    }

    func testAReleaseNeverPinsOneKeyTheSameKeyTwiceOrTheDevelopmentKey() {
        XCTAssertFalse(releaseKeyProblems([good[0]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems([good[0], good[0]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems([ReleaseRules.devKey, good[1]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems(["not a key", good[1]]).isEmpty)
        XCTAssertTrue(releaseKeyProblems(good).isEmpty)
    }

    func testAReleaseIsHttpsOnly() {
        XCTAssertTrue(releaseProblems(bundleBase: "http://313help.org/data/bundle/v1/", apiBase: "https://313help.org/", keys: good)
            .contains { $0.contains("https") })
    }

    /// The development key is a real 44-byte SPKI key, so it has to be refused by name rather than by shape.
    func testTheDevelopmentKeyIsAWellFormedKeyRefusedByName() {
        XCTAssertNotNil(BundleCheck.rawPinnedKey(ReleaseRules.devKey))
        XCTAssertTrue(releaseKeyProblems([ReleaseRules.devKey, good[1]]).contains { $0.contains("development key") })
    }

    // ---- the shell copy of these rules ---------------------------------------------------------------
    /// `Scripts/preflight.sh` has to fail a Release build before any Swift of ours runs, so it restates these
    /// rules in shell. This keeps the two from drifting: the reviewer's `DC_PIN_ACTIVE=hello` passed the script
    /// while the Swift refused it (iPhone review, 2026-09-20).
    func testThePreflightScriptChecksTheSameThings() throws {
        let script = try String(contentsOf: repoRoot.appendingPathComponent("apps/ios/Scripts/preflight.sh"), encoding: .utf8)
        XCTAssertTrue(script.contains(ReleaseRules.placeholderHost))
        XCTAssertTrue(script.contains(ReleaseRules.placeholderKey))
        XCTAssertTrue(script.contains(ReleaseRules.devKey))
        XCTAssertTrue(script.contains(BundleCheck.spkiEd25519Prefix), "the script must check the SPKI prefix")
        XCTAssertTrue(script.contains("44"), "the script must check the key is 44 bytes")
        for hex in BundleCheck.smallOrderKeys {
            XCTAssertTrue(script.contains(hex), "preflight.sh is missing the small-order point \(hex)")
        }
    }

    /// The Release build phase that checks the shipped snapshot uses the same rules again (item 4 of the review).
    func testTheSnapshotScriptChecksTheSameThings() throws {
        let script = try String(contentsOf: repoRoot.appendingPathComponent("apps/ios/Scripts/verify-snapshot.swift"), encoding: .utf8)
        XCTAssertTrue(script.contains(BundleCheck.spkiEd25519Prefix))
        for hex in BundleCheck.smallOrderKeys {
            XCTAssertTrue(script.contains(hex), "verify-snapshot.swift is missing the small-order point \(hex)")
        }
    }
}

/// This file is `apps/ios/Tests/HelpCoreTests/CoreTests.swift`, so the repository root is five levels up.
let repoRoot: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent()
