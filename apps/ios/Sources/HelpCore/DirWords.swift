// The words for a trip plan. Pure functions, no SwiftUI, no state: the wording contract of
// schema/query-spec.md "Trip plans" written out once, so `swift test` runs it on Linux and a test can hold all
// four languages to the same table. It is a case-for-case port of apps/web/src/dirwords.ts.
//
// Three rules from DECISIONS 2026-09-22 are enforced HERE, not in the screen:
//  * the estimate is always a RANGE, from `Itinerary.range` (`minutesRange` in DetroitQuery) — never a single
//    number, never a clock time, never an arrival time;
//  * a headway may only be read out as the agency's own sentence ("about every 15 min"), and only when the
//    agency published one. `waitMinutes` is our assumption and is never shown;
//  * no sentence here says safe, accessible, lit or step-free, and none may ever be added.
//
// The last walking leg ends at the street, so the last sentence is "Then about 40 m to the building"
// (`endOffMetres`). We route to the street outside, not to the door.
import DetroitQuery
import Foundation

/// The app's own `L.t`, passed in so this file knows nothing about i18n.
public typealias Say = (String, [String: String]) -> String

public let metresPerMile = 1609.344

/// What a bus is called on screen: the short name a rider reads off the front of it, then the long one, then the
/// id. Never invented, and never translated: it is the agency's own name for the route.
public func routeName(_ l: RideLeg) -> String {
    !l.routeShort.isEmpty ? l.routeShort : (!l.routeLong.isEmpty ? l.routeLong : l.routeId)
}
/// Where the route is headed, as the agency writes it — only when it says something the short name does not.
public func towardName(_ l: RideLeg) -> String {
    !l.routeLong.isEmpty && l.routeLong != l.routeShort ? l.routeLong : ""
}

/// A walking distance, in miles to one decimal. Never zero: a leg that rounds to 0.0 mi is still a walk somebody
/// has to do, and "0.0 mi" reads as "no distance at all". The floor is a tenth of a mile.
public func dirDistance(_ t: Say, metres: Double) -> String {
    let mi = metres / metresPerMile
    return t("dir.dist_mi", ["miles": HoodFormat.number(mi < 0.05 ? 0.1 : mi, decimals: 1)])
}
/// The one distance that is NOT in miles: how far the street is from the door (`endOffMetres`). Metres, rounded
/// to the metre, because that is the number the spec says a person is told.
public func dirOffStreet(_ t: Say, metres: Double) -> String {
    t("dir.dist_m", ["metres": HoodFormat.number(metres.rounded(.toNearestOrAwayFromZero), decimals: 0)])
}

/// "Walk", "Bus 4", "Bus 4, then bus 16". One line, and the only place a route is named in a card's heading.
public func itineraryTitle(_ t: Say, _ it: Itinerary) -> String {
    let rides = it.legs.compactMap(\.rideLeg)
    if rides.isEmpty { return t("dir.walk_card", [:]) }
    if rides.count == 1 { return t("dir.bus_card", ["route": routeName(rides[0])]) }
    return t("dir.bus_card_two", ["a": routeName(rides[0]), "b": routeName(rides[1])])
}

/// "walk 0.3 mi, ride 9 stops, walk 0.1 mi" — the shape of the trip, leg by leg, in the order it is walked.
public func legsLine(_ t: Say, _ it: Itinerary) -> String {
    it.legs.map { leg in
        switch leg {
        case .walk(let w): return t("dir.leg_walk", ["distance": dirDistance(t, metres: w.metres)])
        case .ride(let r): return r.stops == 1 ? t("dir.leg_ride_one", [:]) : t("dir.leg_ride", ["stops": String(r.stops)])
        }
    }.joined(separator: t("list.sep", [:]))
}

/// "about 25–40 min". ALWAYS a range: `Itinerary.range` is the only number this file reads for a duration.
public func rangeWords(_ t: Say, _ it: Itinerary) -> String {
    t("dir.range", ["lo": String(it.range.lo), "hi": String(it.range.hi)])
}

/// "about every 15 min", or nothing at all. The agency's own published headway on the first ride, and only when
/// it is a number — a route that publishes none says nothing, rather than our assumed wait dressed up as a fact.
public func headwayWords(_ t: Say, _ it: Itinerary) -> String {
    guard let first = it.legs.compactMap(\.rideLeg).first, let h = first.headwayMinutes, h > 0 else { return "" }
    return t("dir.every", ["minutes": HoodFormat.number(h, decimals: 0)])
}

/// The whole card in one sentence: what a button is named, and what an announcement says.
public func dirSummary(_ t: Say, _ it: Itinerary) -> String {
    [itineraryTitle(t, it), legsLine(t, it), rangeWords(t, it), headwayWords(t, it)]
        .filter { !$0.isEmpty }.joined(separator: " · ")
}

/// One numbered step: a sentence, and which leg of the plan it belongs to (the map highlights that leg).
public struct DirStep: Equatable, Sendable, Identifiable {
    public var text: String
    public var leg: Int
    public var index: Int
    public var id: Int { index }
    public init(text: String, leg: Int, index: Int) { self.text = text; self.leg = leg; self.index = index }
}

/**
 The numbered list, which is the source of truth for the whole screen (the map is the extra).

 Every sentence is built from the structured facts `DetroitQuery` hands over — a street name, a compass word, a
 turn word, a stop's own name, a count of stops — and nothing else. The rules never produce prose and this file
 never adds a fact of its own.
 */
public func dirSteps(_ t: Say, _ it: Itinerary, destination: String) -> [DirStep] {
    var out: [DirStep] = []
    func push(_ leg: Int, _ text: String) { out.append(DirStep(text: text, leg: leg, index: out.count)) }
    for (i, leg) in it.legs.enumerated() {
        let last = i == it.legs.count - 1
        switch leg {
        case .walk(let w):
            for (k, s) in w.steps.enumerated() {
                let dist = dirDistance(t, metres: s.metres)
                if k == 0 || s.turn == nil {
                    push(i, t("dir.step_first", ["bearing": t("dir.bearing." + s.bearing.rawValue, [:]),
                                                 "street": s.street, "distance": dist]))
                } else {
                    push(i, t("dir.step_turn", ["turn": t("dir.turn." + s.turn!.rawValue, [:]),
                                                "street": s.street, "distance": dist]))
                }
            }
            // A leg that ends at a stop names the stop, so the next sentence ("Board the 4 at …") is not the
            // first time a person hears where they are walking to. A leg with no steps at all (both ends on one
            // edge) still gets this one, so no leg is ever silent.
            if let stop = w.toStop, !stop.name.isEmpty {
                push(i, t("dir.step_walk_to_stop", ["distance": dirDistance(t, metres: w.metres), "stop": stop.name]))
            } else if last {
                push(i, t("dir.step_last", ["distance": dirDistance(t, metres: w.metres), "name": destination]))
            } else if w.steps.isEmpty {
                push(i, t("dir.step_walk", ["distance": dirDistance(t, metres: w.metres)]))
            }
        case .ride(let r):
            let route = routeName(r), toward = towardName(r)
            push(i, toward.isEmpty
                 ? t("dir.step_board_plain", ["route": route, "stop": r.fromStop.name])
                 : t("dir.step_board", ["route": route, "stop": r.fromStop.name, "toward": toward]))
            push(i, r.stops == 1
                 ? t("dir.step_ride_one", ["stop": r.toStop.name])
                 : t("dir.step_ride", ["stops": String(r.stops), "stop": r.toStop.name]))
            push(i, t("dir.step_off", ["stop": r.toStop.name]))
        }
    }
    // We route to the street outside, never to the door (query-spec "Directions", rule 3). Under five metres
    // there is nothing to say; above it, this is the last thing a person is told.
    if it.endOffMetres >= 5 {
        push(max(0, it.legs.count - 1),
             t("dir.step_end_off", ["metres": HoodFormat.number(it.endOffMetres.rounded(.toNearestOrAwayFromZero), decimals: 0)]))
    }
    return out
}

/// The route overlay's text equivalent (WCAG 1.1.1): what the coloured line on the canvas says, in words, for
/// anyone who cannot see it. It names the legs in order and nothing else — the steps below are the detail.
public func dirRouteText(_ t: Say, _ it: Itinerary) -> String {
    t("dir.route_text", ["legs": legsLine(t, it), "range": rangeWords(t, it)])
}

// MARK: - following along

/// How far the person is from the route, in metres, for the one piece of follow-along logic there is: "you are
/// off the route — tap to plan again". There is no rerouting, by design.
public let offRouteMetres = 120.0

private let mPerDegLat = 111_132.0
private let mPerDegLon = 111_320.0 * cos(42.35 * .pi / 180)

private func pointToPiece(_ p: LatLon, _ a: [Double], _ b: [Double]) -> Double {
    let px = p.lon * mPerDegLon, py = p.lat * mPerDegLat
    let ax = a[0] * mPerDegLon, ay = a[1] * mPerDegLat, bx = b[0] * mPerDegLon, by = b[1] * mPerDegLat
    let dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    let u = len2 == 0 ? 0 : max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return hypot(px - ax - u * dx, py - ay - u * dy)
}

/// The shortest distance from a point to any piece of any of these lines ([lon, lat] pairs).
public func metresFromRoute(_ at: LatLon, _ polylines: [[[Double]]]) -> Double {
    var best = Double.infinity
    for line in polylines {
        var i = 0
        while i + 1 < line.count {
            if line[i].count >= 2, line[i + 1].count >= 2 {
                best = min(best, pointToPiece(at, line[i], line[i + 1]))
            }
            i += 1
        }
    }
    return best
}

/// Which step a person is on: the nearest one whose leg they are standing on, walking forwards.
public func currentStep(_ at: LatLon, _ it: Itinerary, _ list: [DirStep]) -> Int {
    var bestLeg = 0, bestD = Double.infinity
    for (i, l) in it.legs.enumerated() {
        let poly: [[Double]]
        switch l {
        case .walk(let w): poly = w.polyline
        case .ride(let r): poly = r.polyline
        }
        let d = metresFromRoute(at, [poly])
        if d < bestD { bestD = d; bestLeg = i }
    }
    return list.firstIndex { $0.leg == bestLeg } ?? 0
}

/// Every leg's drawn line, in leg order.
public func legPolylines(_ it: Itinerary) -> [[[Double]]] {
    it.legs.map { l in
        switch l {
        case .walk(let w): return w.polyline
        case .ride(let r): return r.polyline
        }
    }
}

// MARK: - the colour a leg is drawn in

/// Which token a ride leg wears: the agency's own layer tone, so the map and the layer switcher agree. Exactly
/// `AGENCY_CSS` / `rideCss` in apps/web/src/dirscreen.ts, with the web's CSS custom properties written as the
/// palette names this app uses (HelpApp/MapPalette.swift).
public let routeWalkToken = "routeWalk"
public let routeRideToken = "routeRide"
private let agencyTokens: [(id: String, token: String)] = [
    ("ddot", "bus"), ("smart", "smart"), ("qline", "rail"), ("dpm", "rail"),
]
public func rideToken(agency: String) -> String {
    let k = agency.lowercased()
    for (id, token) in agencyTokens where k.contains(id) { return token }
    return routeRideToken
}

/// The dash a ride leg is drawn with, in multiples of the drawn width (the web's `dash: [2.2, 1.4]`).
public let rideDash: [Double] = [2.2, 1.4]

// MARK: - where a trip starts

/// How the origin was given. The same four answers as the web's `originKind` (apps/web/src/main.ts).
public enum DirOriginKind: String, Equatable, Sendable, CaseIterable {
    /// The device said so.
    case me
    /// A junction the person typed.
    case cross
    /// A ZIP the person typed.
    case zip
    /// Nothing yet: the screen asks.
    case none
}

/// Which of the three ways in a screen offers, and in what order.
public enum DirWay: String, Equatable, Sendable { case cross, use, zip }

/**
 The start decision, as one table.

 A ZIP wins over a cross street and a cross street over a plain fix only in the sense that whichever was given
 LAST is what the screen is using: `Here` replaces one with the other. This function answers the other question —
 given what is held now, what does the screen say it is starting from?
 */
public func dirOriginKind(hasPoint: Bool, zip: String?, cross: String?) -> DirOriginKind {
    guard hasPoint else { return .none }
    if let z = zip, !z.isEmpty { return .zip }
    if let c = cross, !c.isEmpty { return .cross }
    return .me
}

/**
 The three ways in, in the order a screen offers them.

 `crossFirst` is the Directions screen and nothing else: there the cross-street field is opened and put ahead of
 "Use my location", because it is the only one of the three that works with no satellite and no signal at all,
 and that screen is the one a person with neither is on (DECISIONS 2026-09-22).
 */
public func dirWays(crossFirst: Bool) -> [DirWay] {
    crossFirst ? [.cross, .use, .zip] : [.use, .cross, .zip]
}

/// What the screen is doing, in the one enum the web calls `Phase` (apps/web/src/dirscreen.ts).
public enum DirPhase: String, Equatable, Sendable {
    case needOrigin, loading, building, planning, ready, empty, noFiles, failed
}
