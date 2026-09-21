// The two things a person can hand the app besides a tap: a ZIP code they type instead of their location, and a
// place they know about that we do not list yet. Both are rules, so both live in HelpCore and run on Linux.
import XCTest
@testable import DetroitQuery
@testable import HelpCore

final class ZipTests: XCTestCase {

    private static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func zips() throws -> ZipCenters {
        let url = Self.root.appendingPathComponent("data/bundle/v1/" + ZipsFile.name)
        guard let data = try? Data(contentsOf: url) else { throw XCTSkip("data/bundle/v1 has not been built here") }
        return try ZipsFile.decode(data, sha256: BundleCheck.sha256Hex(data))
    }

    func testFiveDigitsOrItIsNotAZip() {
        XCTAssertEqual(normalizedZip("48226"), "48226")
        XCTAssertEqual(normalizedZip("  48226 "), "48226", "spaces around it are forgiven")
        XCTAssertNil(normalizedZip("4822"), "four digits is not a ZIP")
        XCTAssertNil(normalizedZip("482267"), "six is not either")
        XCTAssertNil(normalizedZip("48226-1234"), "a ZIP+4 is not what this looks up")
        XCTAssertNil(normalizedZip("4822a"))
        XCTAssertNil(normalizedZip(""))
        XCTAssertNil(normalizedZip("٤٨٢٢٦"), "Arabic-Indic digits are not the digits on the envelope")
    }

    func testAKnownZipGivesItsMiddleAndAnythingElseSaysSo() throws {
        let z = try zips()
        XCTAssertFalse(z.isEmpty)
        guard case .found(let zip, let center) = lookUpZip("48226", in: z) else {
            return XCTFail("48226 is downtown Detroit and should be in the bundle")
        }
        XCTAssertEqual(zip, "48226")
        XCTAssertTrue(inServiceArea(center), "a ZIP centre we carry is inside the four cities")
        // A real ZIP somewhere else, a made-up one, and something that is not a ZIP at all.
        XCTAssertEqual(lookUpZip("90210", in: z), .unknown)
        XCTAssertEqual(lookUpZip("00000", in: z), .unknown)
        XCTAssertEqual(lookUpZip("hello", in: z), .notAZip)
        XCTAssertEqual(lookUpZip("", in: z), .notAZip)
        // Every centre the bundle carries is a real point in the service area.
        for (zip, p) in z.points {
            XCTAssertEqual(zip.count, 5, "\(zip) is not a five-digit ZIP")
            XCTAssertTrue(inServiceArea(p, slack: 0.05), "\(zip) sits outside the four cities: \(p)")
        }
    }

    func testAFileWhoseBytesDoNotMatchTheSignedIndexIsRefused() throws {
        let url = Self.root.appendingPathComponent("data/bundle/v1/" + ZipsFile.name)
        guard let data = try? Data(contentsOf: url) else { throw XCTSkip("data/bundle/v1 has not been built here") }
        XCTAssertThrowsError(try ZipsFile.decode(data, sha256: String(repeating: "0", count: 64))) { e in
            XCTAssertEqual(e as? BundleError, .badChecksum(ZipsFile.name))
        }
    }

    /// The shared ZIP cases (`schema/neighborhoods/points.json`): the neighborhood a ZIP's middle falls in, the
    /// same answer the web app gives. A ZIP covers more than one neighborhood, which is why the screen says so
    /// rather than calling it "your neighborhood".
    func testTheSharedZipCases() throws {
        struct Case: Decodable { var name: String; var zip: String; var expect: [String] }
        struct File: Decodable { var zip_cases: [Case] }
        let file = try JSONDecoder().decode(File.self, from: try Data(contentsOf: Self.root.appendingPathComponent("schema/neighborhoods/points.json")))
        XCTAssertFalse(file.zip_cases.isEmpty)
        let z = try zips()
        let indicatorsURL = Self.root.appendingPathComponent("data/bundle/v1/" + HoodsFile.name)
        guard let data = try? Data(contentsOf: indicatorsURL) else { throw XCTSkip("data/bundle/v1 has not been built here") }
        let d = try HoodsFile.decode(data, sha256: BundleCheck.sha256Hex(data))
        for c in file.zip_cases {
            guard case .found(_, let center) = lookUpZip(c.zip, in: z) else {
                return XCTFail("\(c.name): the bundle does not carry ZIP \(c.zip)")
            }
            XCTAssertEqual(d.neighborhoods(forZipCenter: center).map(\.id), c.expect, c.name)
        }
    }
}

final class ProposalTests: XCTestCase {

    private let full: [String: String] = [
        "name": "Hope Kitchen", "category": "food", "what": "Free hot meals", "address": "123 Main St",
        "phone": "313-555-0100", "schedule_text": "Tuesdays 10 to 12", "how_known": "volunteer",
        "notes": "Around the back",
    ]

    func testAProposalCarriesTheFieldsTheWorkerAllowsAndNoOthers() throws {
        let p = try XCTUnwrap(buildProposal(full))
        let body = try JSONEncoder().encode(p)
        let keys = Set(try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any]).keys)
        // Exactly the eight names in `parseProposal` (api/src/validate.ts). A ninth would be a 400.
        XCTAssertEqual(keys, ["name", "category", "what", "address", "phone", "schedule_text", "how_known", "notes"])
        // Nothing about the person can even be expressed: no id, no key, no position, no time.
        for forbidden in ["client_nonce", "install_id", "lat", "lon", "device", "observed_at", "id"] {
            XCTAssertFalse(keys.contains(forbidden), "a proposal must not carry \(forbidden)")
        }
    }

    func testAnEmptyOptionalFieldIsNotSentAtAll() throws {
        var form = full
        for key in ["address", "phone", "schedule_text", "notes"] { form[key] = "   " }
        let p = try XCTUnwrap(buildProposal(form))
        let keys = Set(try XCTUnwrap(try JSONSerialization.jsonObject(with: try JSONEncoder().encode(p)) as? [String: Any]).keys)
        XCTAssertEqual(keys, ["name", "category", "what", "how_known"], "empty answers are left out, not sent blank")
    }

    func testTheFourRequiredAnswersAreRequired() {
        for key in ["name", "category", "what", "how_known"] {
            var form = full
            form[key] = ""
            XCTAssertNil(buildProposal(form), "a proposal without \(key) is not worth sending")
            XCTAssertTrue(missingProposalFields(form).contains(key))
        }
        XCTAssertEqual(missingProposalFields(full), [], "nothing is missing from a filled-in form")
        // In the form's own order, so the screen can put the cursor on the first one a person would reach.
        XCTAssertEqual(missingProposalFields([:]), ["name", "category", "what", "how_known"])
    }

    func testOnlyAKindOfHelpWeOfferedIsAccepted() {
        var form = full
        form["category"] = "shelter.dv"
        XCTAssertNil(buildProposal(form), "a DV shelter's address must never be collected, here least of all")
        XCTAssertFalse(proposalCategories.contains("shelter.dv"))
        form["category"] = "made_up"
        XCTAssertNil(buildProposal(form))
        form = full
        form["how_known"] = "read_about_it"
        XCTAssertNil(buildProposal(form), "how_known has to be one of the four the form offered")
    }

    func testLongAnswersAreTrimmedToWhatTheSchemaAllows() throws {
        var form = full
        form["name"] = String(repeating: "a", count: 400)
        form["what"] = String(repeating: "b", count: 400)
        form["notes"] = String(repeating: "c", count: 400)
        let p = try XCTUnwrap(buildProposal(form))
        XCTAssertEqual(p.name.count, 120)
        XCTAssertEqual(p.what.count, 280)
        XCTAssertEqual(p.notes?.count, 280)
    }

    /// The Swift list and the Worker's have to be the same list: a kind offered here that the Worker does not
    /// know is a 400 a person would see as "it just didn't work".
    func testTheKindsAndTheWaysOfKnowingMatchTheWorker() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let web = try String(contentsOf: root.appendingPathComponent("apps/web/src/propose.ts"), encoding: .utf8)
        func list(_ marker: String) -> [String] {
            guard let r = web.range(of: marker), let end = web[r.upperBound...].firstIndex(of: "]") else { return [] }
            return web[r.upperBound..<end].split(separator: ",").map {
                $0.trimmingCharacters(in: CharacterSet(charactersIn: " \n'\""))
            }.filter { !$0.isEmpty }
        }
        XCTAssertEqual(proposalHowKnown, list("export const HOW_KNOWN = ["))
        XCTAssertEqual(proposalCategories, list("export const PROPOSE_CATEGORIES = ["))
    }
}
