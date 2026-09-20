// Tests for the app itself, as opposed to DetroitQuery (which has the shared fixtures in Tests/DetroitQueryTests).
// These cover the four things that would be dangerous to get wrong and cheap to get wrong: the per-target daily
// dedupe hash, the offline outbox, what a saved list is allowed to hold, and refusing a bundle we can't verify.
//
// The files under test are compiled into this target directly (see the Xcode project), so no @testable import is
// needed and nothing here depends on a running app.
import CryptoKit
import DetroitQuery
import Foundation
import XCTest

private func tempDir() -> URL {
    let d = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString, isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
}
private func day(_ s: String) -> Date { parseInstant(s + "T15:00:00Z")! }

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

    func testTheKeyIsRandomAndResettable() async {
        let key = InstallKey(dir: tempDir())
        let first = await key.value()
        let again = await key.value()
        XCTAssertEqual(first.count, 64)
        XCTAssertEqual(first, again)                          // the same key until it is reset
        let second = await key.reset()
        let afterReset = await key.value()
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(second, afterReset)
        // After a reset the same place on the same day gets a hash that can't be tied to the earlier one.
        XCTAssertNotEqual(dedupeNonce(secret: first, targetId: "sal_x", when: day("2026-09-20")),
                          dedupeNonce(secret: second, targetId: "sal_x", when: day("2026-09-20")))
    }

    /// Nothing in a built report but the six fields the Worker's closed schema allows.
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
}

// ---- the offline outbox ---------------------------------------------------------------------------
private actor Attempts {
    private(set) var items: [Report] = []
    func add(_ r: Report) { items.append(r) }
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
        XCTAssertFalse(sent)
        XCTAssertEqual(waitingOffline, 1)

        // Back online, the same file: the queue empties and nothing is sent twice.
        let online = Outbox<Report>(file: file, max: 50, send: { await seen.add($0); return true })
        await online.flush()
        let waitingAfter = await online.waiting()
        await online.flush()
        let tries = await seen.items.count
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
        XCTAssertTrue(ok)
        XCTAssertEqual(emptyAfterSend, 0)
        XCTAssertFalse(no)
        XCTAssertEqual(stillWaiting, 1)
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

    @MainActor func testSavingIsOnThisPhoneNewestFirstAndCapped() {
        let dir = tempDir()
        let saved = Saved(dir: dir)
        saved.toggle("sal_a", category: "food.pantry")
        saved.toggle("sal_b", category: "food.pantry")
        XCTAssertEqual(saved.ids, ["sal_b", "sal_a"])
        saved.toggle("sal_dv", category: "shelter.dv")
        XCTAssertEqual(saved.ids, ["sal_b", "sal_a"])          // refused, silently: no button offers it
        saved.toggle("sal_a", category: "food.pantry")
        XCTAssertEqual(saved.ids, ["sal_b"])
        // It is on this phone, in a file, and comes back when the app is opened again.
        XCTAssertEqual(Saved(dir: dir).ids, ["sal_b"])
        for i in 0..<120 { saved.toggle("sal_x\(i)", category: "food.pantry") }
        XCTAssertEqual(saved.ids.count, 100)
        saved.clear()
        XCTAssertTrue(saved.ids.isEmpty)
        XCTAssertTrue(Saved(dir: dir).ids.isEmpty)
    }

    /// A listing saved before its category changed can still be removed.
    @MainActor func testAPrivateListingCanAlwaysBeRemoved() {
        let saved = Saved(dir: tempDir())
        saved.toggle("sal_a", category: "food.pantry")
        saved.toggle("sal_a", category: "treatment")
        XCTAssertTrue(saved.ids.isEmpty)
    }
}

// ---- a place with coordinates but no address, and a listing with no phone --------------------------
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
            XCTAssertFalse(showsPointWithoutAddress(row(point: (42.3, -83.1), category: category)))
        }
    }

    func testNoAddressAndNoPointMeansNoDirections() {
        XCTAssertNil(mapsDestination(row()))
        XCTAssertFalse(showsPointWithoutAddress(row()))
    }

    /// No published number, no Call button: the screens render one row per phone, and there are none.
    func testAListingWithNoPhoneOffersNoCall() {
        XCTAssertFalse(hasPhone(row(point: (42.3, -83.1))))
        XCTAssertTrue(hasPhone(row(phone: "313-555-0100")))
    }
}

// ---- refusing a bundle we can't verify -------------------------------------------------------------
final class BundleCheckTests: XCTestCase {
    private func index(_ generatedAt: String) -> Data {
        Data(#"{"version":"v1","generated_at":"\#(generatedAt)","signing":"dev","files":{}}"#.utf8)
    }
    private func signature(_ data: Data, _ key: Curve25519.Signing.PrivateKey) -> Data {
        Data(#"{"signature":"\#(try! key.signature(for: data).base64EncodedString())"}"#.utf8)
    }
    private func pin(_ key: Curve25519.Signing.PrivateKey) -> String {
        // SPKI DER: the fixed 12-byte Ed25519 header, then the raw key. The same shape a pinned key has.
        (Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]) + key.publicKey.rawRepresentation).base64EncodedString()
    }

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

    func testAChangedFileIsCaughtByItsChecksum() {
        let file = Data("[]".utf8)
        XCTAssertEqual(BundleCheck.sha256Hex(file), "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945")
        XCTAssertNotEqual(BundleCheck.sha256Hex(Data("[ ]".utf8)), BundleCheck.sha256Hex(file))
    }

    func testAnOlderBundleIsRefused() throws {
        let key = Curve25519.Signing.PrivateKey()
        let older = index("2026-09-01T12:00:00Z"), newer = index("2026-09-20T12:00:00Z")
        let a = try BundleCheck.verifiedIndex(older, sig: signature(older, key), pinned: [pin(key)])
        let b = try BundleCheck.verifiedIndex(newer, sig: signature(newer, key), pinned: [pin(key)])
        XCTAssertTrue(BundleCheck.refusesOlder(current: b, next: a))
        XCTAssertFalse(BundleCheck.refusesOlder(current: a, next: b))
        XCTAssertFalse(BundleCheck.refusesOlder(current: nil, next: a))
    }

    func testMapsAndNeighborhoodNumbersLoadLaterNotAtStart() {
        XCTAssertTrue(BundleCheck.loadedNow("category/food.json"))
        XCTAssertFalse(BundleCheck.loadedNow("map/streets.json"))
        XCTAssertFalse(BundleCheck.loadedNow("indicators/neighborhoods.json"))
    }
}

// ---- what a release build is allowed to ship ----------------------------------------------------------
final class ReleaseConfigTests: XCTestCase {
    /// Two well-formed Ed25519 public keys, in the base64 SPKI form a pinned key takes. They are only public keys,
    /// made here and thrown away: this repo never carries a private key, and a test never invents one for a release.
    private static func publicKey() -> String {
        (Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])
         + Curve25519.Signing.PrivateKey().publicKey.rawRepresentation).base64EncodedString()
    }
    private static let pair = [publicKey(), publicKey()]
    private var good: [String] { ReleaseConfigTests.pair }

    func testTwoRealKeysAndARealOriginPass() {
        XCTAssertEqual(releaseProblems(bundleBase: "https://313help.org/data/bundle/v1/", apiBase: "https://313help.org/", keys: good), [])
    }

    func testAnUnconfiguredReleaseIsRefused() {
        let problems = releaseProblems(bundleBase: "https://\(Config.placeholderHost)/data/bundle/v1/",
                                       apiBase: "https://\(Config.placeholderHost)/",
                                       keys: ["\(Config.placeholderKey)-ACTIVE", "\(Config.placeholderKey)-SPARE"])
        XCTAssertEqual(problems.count, 4)
        XCTAssertTrue(problems.allSatisfy { $0.contains("placeholder") })
    }

    func testAReleaseNeverPinsOneKeyTheSameKeyTwiceOrTheDevelopmentKey() {
        XCTAssertFalse(releaseKeyProblems([good[0]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems([good[0], good[0]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems([Config.devKey, good[1]]).isEmpty)
        XCTAssertFalse(releaseKeyProblems(["not a key", good[1]]).isEmpty)
        XCTAssertTrue(releaseKeyProblems(good).isEmpty)
    }

    func testAReleaseIsHttpsOnly() {
        XCTAssertTrue(releaseProblems(bundleBase: "http://313help.org/data/bundle/v1/", apiBase: "https://313help.org/", keys: good)
            .contains { $0.contains("https") })
    }

    /// An unconfigured build reaches nothing at all, rather than a host somebody else could register.
    func testAPlaceholderOriginIsNeverTurnedIntoAURL() {
        XCTAssertNil(Config.url("https://\(Config.placeholderHost)/data/bundle/v1/"))
        XCTAssertNil(Config.url(""))
        XCTAssertNotNil(Config.url("https://313help.org/", "v1/reports"))
    }
}
