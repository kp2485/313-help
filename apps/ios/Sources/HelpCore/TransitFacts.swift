// "Getting around": trip planners, fares, free rides, phone numbers, the MoGo pass and the Transit app link-out.
// A Swift copy of `TRANSIT` in apps/web/src/transit.ts, which is where a steward edits these facts; TransitFactsTests
// reads that file as text and fails when a link, a number, a sentence or the `checked` date here differs from it.
//
// Every fact was read on its owner's own page on the `checked` date. We link out to trip planners rather than
// embed them: the app sends nothing about the rider, and nothing here is live. The words are English-only
// content, like a listing: what an owner says about its own service is never machine-translated.
import Foundation

public struct TransitFacts: Sendable {
    public struct Link: Equatable, Sendable, Identifiable {
        public var label: String, url: String
        /// Marks the one link that is an owner's own trip planner (or, for the two free rail lines, its own site),
        /// by the `system` a `.net.json` file names — the same mark apps/web/src/transit.ts carries.
        public var system: String?
        public init(label: String, url: String, system: String? = nil) { self.label = label; self.url = url; self.system = system }
        public var id: String { url + label }
        /// Whose page this is, in words a person can check before they tap: the host, without "www.".
        public var owner: String {
            let host = URLComponents(string: url)?.host ?? url
            return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        }
    }
    public struct Phone: Equatable, Sendable, Identifiable { public var label: String, number: String; public var id: String { number } }
    public struct Fact: Equatable, Sendable, Identifiable { public var icon: String, text: String; public var id: String { text } }
    public struct Section: Equatable, Sendable, Identifiable {
        public var title: String
        public var body: String?
        public var facts: [Fact] = []
        public var phones: [Phone] = []
        public var links: [Link] = []
        public var id: String { title }
    }
    public var checked: String
    public var sections: [Section]
    public var bike: (body: String, link: Link)

    public static let current = TransitFacts(
        checked: "2026-09-18",
        sections: [
            Section(title: "Plan a trip", body: "See which bus to take and when it comes.", links: [
                Link(label: "DDOT trip planner", url: "http://myddotbus.com/map?selector=tripplanner", system: "ddot"),
                Link(label: "When is my bus coming?", url: "http://www.myddotbus.com/home"),
                Link(label: "Transit app: live DDOT and SMART buses on your phone", url: "https://transitapp.com/"),
                Link(label: "Bus routes and schedules", url: "https://detroitmi.gov/departments/detroit-department-transportation/bus-schedules"),
            ]),
            Section(title: "What it costs", body: "One pass works on DDOT and SMART buses.", facts: [
                Fact(icon: "ticket", text: "4 hours: $2. All day: $5. 7 days: $22. 31 days: $70."),
                Fact(icon: "ticket", text: "Age 65 and up, people with disabilities, and people on Medicare pay less: 50 cents for 4 hours. You need a reduced fare ID from Rosa Parks Transit Center."),
                Fact(icon: "people", text: "Students in kindergarten through 12th grade ride DDOT free. Small children ride free with an adult."),
                Fact(icon: "check", text: "The People Mover and the QLINE streetcar are free to ride."),
            ], links: [
                Link(label: "Fares and how to pay", url: "https://detroitmi.gov/departments/detroit-department-transportation/transportation-fares"),
                Link(label: "Where to buy a pass", url: "https://detroitmi.gov/webapp/where-buy-transit-passes-map"),
                Link(label: "Buy a pass on your phone (Token Transit)", url: "https://tokentransit.com/app"),
            ]),
            Section(title: "Talk to a person", phones: [
                Phone(label: "DDOT customer service", number: "313-933-1300"),
                Phone(label: "DDOT Paratransit rides", number: "313-774-5555"),
                Phone(label: "SMART suburban buses", number: "866-962-5515"),
            ]),
            Section(title: "Other ways to get around", links: [
                Link(label: "People Mover (free)", url: "https://www.thepeoplemover.com/", system: "dpm"),
                Link(label: "QLINE streetcar (free)", url: "https://qlinedetroit.com/", system: "qline"),
                Link(label: "SMART trip planner", url: "https://www.smartbus.org/Schedules/Trip-Planner", system: "smart"),
            ]),
        ],
        bike: ("MoGo bike share has a $5 a year pass for people who get food assistance, Medicaid, or other state benefits. You sign up with MoGo, not here.",
               Link(label: "MoGo Access Pass", url: "https://mogodetroit.org/pricing/")))

    /// The owner's own trip planner for a network (`system` in a `.net.json` file) — **the same link** the
    /// "Getting around" section carries, so there is one source of truth. `nil` when we carry none, and the
    /// caller falls back to the `agency_url` in the file.
    public func planner(forSystem system: String) -> Link? {
        system.isEmpty ? nil : sections.flatMap(\.links).first { $0.system == system }
    }
}
