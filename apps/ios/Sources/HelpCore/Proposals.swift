// "Add a place that helps" (docs/04), the Swift copy of apps/web/src/propose.ts.
//
// What leaves the phone is what a person typed about the PLACE: its name, the kind of help, what people get
// there, where and when, its public phone number, a note, and how they know about it. Nothing about the person:
// no account, no device id, no location, and — unlike a report — no dedupe hash either, because there is nothing
// to dedupe. A proposal is a thing a steward reads and checks before it can ever appear (docs/04).
//
// The Worker's schema is closed (`parseProposal`, api/src/validate.ts): these eight names and no others, each
// with a size cap. A ninth field is a 400, not something quietly stored, so this file builds exactly the eight
// and `swift test` holds the encoded body to them.
import DetroitQuery
import Foundation

/// How a person knows about the place, in the order the form offers them.
public let proposalHowKnown = ["run_it", "volunteer", "went_there", "heard"]

/// The kinds of help a person can offer a place for. There is deliberately **no** choice for a domestic-violence
/// shelter: those addresses must never be collected anywhere in this system (docs/08, CLAUDE.md), and the Worker
/// drops one even if something sends it.
public let proposalCategories = ["food", "shelter.emergency", "health", "harm", "utilities", "hygiene", "youth",
                                 "rec", "jobs", "learn", "treatment", "housing", "legal", "goods"]

/// The size caps the Worker enforces. Trimming here means a person is never told a long answer was rejected;
/// it is simply as long as the schema allows.
public let proposalLimits: [String: Int] = ["name": 120, "what": 280, "address": 200, "phone": 40,
                                            "schedule_text": 200, "notes": 280]

/// The four the form cannot do without, in the order it asks for them — so "the first empty one" is the first
/// one a person reading down the screen would reach.
public let proposalRequired = ["name", "category", "what", "how_known"]

public struct Proposal: Codable, Equatable, Sendable {
    public var name: String
    public var category: String
    public var what: String
    public var address: String?
    public var phone: String?
    public var scheduleText: String?
    public var howKnown: String
    public var notes: String?
    /// The Worker's schema is closed: these names, and no others. An Optional left nil is not encoded at all,
    /// which is the web's "empty ones left out".
    public enum CodingKeys: String, CodingKey {
        case name, category, what, address, phone, notes
        case scheduleText = "schedule_text", howKnown = "how_known"
    }

    public init(name: String, category: String, what: String, address: String? = nil, phone: String? = nil,
                scheduleText: String? = nil, howKnown: String, notes: String? = nil) {
        self.name = name
        self.category = category
        self.what = what
        self.address = address
        self.phone = phone
        self.scheduleText = scheduleText
        self.howKnown = howKnown
        self.notes = notes
    }
}

/// The required fields a person has not filled in, in the form's own order. Empty when there is nothing missing.
public func missingProposalFields(_ form: [String: String]) -> [String] {
    proposalRequired.filter { (form[$0] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/**
 Exactly the fields the Worker accepts, trimmed to its limits, with the empty ones left out — or `nil` when the
 form is not yet something worth sending.

 This is `buildProposal` in apps/web/src/propose.ts, rule for rule: the four required answers have to be there,
 the kind of help and "how do you know" have to be ones we offered, and nothing else is carried at all.
 */
public func buildProposal(_ form: [String: String]) -> Proposal? {
    func clean(_ key: String) -> String {
        let trimmed = (form[key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return String(trimmed.prefix(proposalLimits[key] ?? trimmed.count))
    }
    let name = clean("name"), what = clean("what")
    let category = (form["category"] ?? ""), how = (form["how_known"] ?? "")
    guard !name.isEmpty, !what.isEmpty,
          proposalCategories.contains(category), proposalHowKnown.contains(how) else { return nil }
    let optional = ["address", "phone", "schedule_text", "notes"].reduce(into: [String: String]()) { out, key in
        let v = clean(key)
        if !v.isEmpty { out[key] = v }
    }
    return Proposal(name: name, category: category, what: what,
                    address: optional["address"], phone: optional["phone"],
                    scheduleText: optional["schedule_text"], howKnown: how, notes: optional["notes"])
}
