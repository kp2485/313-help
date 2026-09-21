// Shapes of the signed bundle (docs/03, packages/query/src/types.ts). Decoded with .convertFromSnakeCase.
import Foundation

public struct Schedule: Codable, Equatable, Sendable {
    public var freq: String?          // DAILY | WEEKLY | MONTHLY | YEARLY; nil = one date only
    public var interval: Int?
    public var byday: String?         // "MO,WE" or "2TU" or "-1FR"
    public var bymonthday: String?    // "1,15"
    public var dtstart: String
    public var until: String?
    public var validFrom: String?
    public var validTo: String?
    public var opensAt: String        // HH:MM wall clock in America/Detroit
    public var closesAt: String       // closes_at <= opens_at means the window runs past midnight
    public var description: String?
}

public struct Facts: Codable, Equatable, Sendable {
    public struct Reports: Codable, Equatable, Sendable { public var closedOpen: Int; public var closedLastAt: String?; public var wrongOpen: Int; public var openAfterClosed: Int? }
    public struct Source: Codable, Equatable, Sendable { public var type: String; public var name: String; public var url: String?; public var lastEdited: String? }
    public var checkedAtEntry: String?
    public var entryMethod: String?
    public var lastConfirmedAt: String?
    public var lastConfirmMethod: String?
    public var reports: Reports
    public var source: Source
}

public struct BundleRow: Codable, Equatable, Sendable, Identifiable {
    public struct Address: Codable, Equatable, Sendable { public var line1: String; public var city: String; public var zip: String? }
    public struct Phone: Codable, Equatable, Sendable { public var number: String; public var label: String? }
    public struct Archived: Codable, Equatable, Sendable { public var at: String; public var reason: String; public var replacementId: String? }
    public var id: String
    public var name: String
    public var org: String
    public var category: String
    public var what: String
    public var eligibility: String?
    public var address: Address?
    public var lat: Double?
    public var lon: Double?
    public var phones: [Phone]
    public var website: String?
    public var availability: String   // scheduled | always | call_first | unknown
    public var hoursText: String?
    public var notice: String?
    public var schedules: [Schedule]
    public var flags: [String]
    public var languages: [String]?
    public var status: String         // active | suspended | archived
    public var archived: Archived?
    public var facts: Facts
}

public struct Alert: Codable, Equatable, Sendable {
    public struct Action: Codable, Equatable, Sendable { public var label: String; public var tel: String?; public var url: String? }
    public var id: String
    public var kind: String           // activation | cancellation | notice
    public var category: String?
    public var title: String?
    public var bodyPlain: String?
    public var startsAt: String
    public var endsAt: String
    public var targets: [String]?
    public var actions: [Action]?
    public var status: String
}

public struct Segment: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var phase: String          // open | under_construction | funded | planned
    public var typology: String?
    public var crossStreets: [String]?
    /// Polylines of [lon, lat].
    public var lines: [[[Double]]]
}

public struct LatLon: Equatable, Sendable { public var lat: Double; public var lon: Double; public init(lat: Double, lon: Double) { self.lat = lat; self.lon = lon } }

public struct Occurrence: Equatable, Sendable {
    public var date: String
    public var opensAt: String
    public var closesAt: String
    public var start: Int             // minutes on a floating Detroit wall clock
    public var end: Int
    /// This window opens on a holiday, so its hours are the usual ones and not a promise. Labelled, never dropped.
    public var holiday: Bool = false
}

public enum OpenState: String, Sendable { case open, closes_soon, closed, call_first, unknown, not_listed, holiday }

public struct OpenResult: Equatable, Sendable {
    public struct Next: Equatable, Sendable { public var date: String; public var opensAt: String; public var closesAt: String }
    public struct UsualHours: Equatable, Sendable { public var opensAt: String; public var closesAt: String }
    public var state: OpenState
    public var closesAt: String? = nil
    public var minutesLeft: Int? = nil
    /// Set only for `closed`: nil inside means "no upcoming time".
    public var next: Next?? = nil
    public var cancelledNow: Bool = false
    /// `holiday` only: what the schedule says about today, offered as usual hours and never as "open".
    public var usualHours: UsualHours? = nil
}

public struct Badge: Equatable, Sendable {
    public var level: String
    public var key: String            // into strings/en.json; the text never lives in code
    public var params: [String: String]
    public var tier: Int              // sort key only; never shown
}

public func bundleDecoder() -> JSONDecoder {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    return d
}
