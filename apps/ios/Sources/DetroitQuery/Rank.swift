// One ranking rule (schema/query-spec.md "Ranking"), port of packages/query/src/rank.ts:
//   eligibility -> preferred flags (if asked) -> distance band -> wide area -> reported-closed last
//   -> open-now / next-open -> distance -> id (no freshness key)
// Distance comes before everything except eligibility because many users have no car.
// A domestic-violence row has no coordinate at all, so it gets its band from its service area's public
// reference point instead, and never a distance (Areas.swift, docs/08, DECISIONS 2026-09-20).
import Foundation

public struct Query: Sendable {
    public var category: String?
    public var flags: [String] = []
    /// Rows with every one of these flags come first; nothing is left out ("I'm under 25": youth shelters first).
    public var prefer: [String] = []
    /// Device location or a typed ZIP's center. Held in memory only, never written or sent.
    public var near: LatLon?
    public var mode: String = "now"          // "now" | "week"
    public init(category: String? = nil, flags: [String] = [], prefer: [String] = [], near: LatLon? = nil, mode: String = "now") {
        self.category = category; self.flags = flags; self.prefer = prefer; self.near = near; self.mode = mode
    }
}

public struct Ranked: Sendable {
    public var row: BundleRow
    public var open: OpenResult
    public var badge: Badge
    public var miles: Double?
    public var band: Int
    public init(row: BundleRow, open: OpenResult, badge: Badge, miles: Double?, band: Int) { self.row = row; self.open = open; self.badge = badge; self.miles = miles; self.band = band }
}

private let earthMiles = 3958.8
public func miles(_ a: LatLon, _ b: LatLon) -> Double {
    let rad = { (d: Double) in d * .pi / 180 }
    let dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
    let h = pow(sin(dLat / 2), 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * pow(sin(dLon / 2), 2)
    return 2 * earthMiles * asin(sqrt(h))
}

private func band(_ mi: Double?) -> Int { guard let mi else { return 0 }; return mi <= 1 ? 0 : mi <= 3 ? 1 : 2 }

/// Band and wide-area key for a domestic-violence row. Every input is public and per-area: the person's own
/// location (which never leaves the device) and a city hall's coordinate that is identical for every shelter
/// serving that area. The row itself contributes nothing but the name of the area.
/// No location, or no service area: band 0 and wide 0, exactly as a row with no coordinates ranks today.
private func dvBand(_ row: BundleRow, near: LatLon?) -> (band: Int, wide: Int) {
    guard let near, let id = row.serviceArea, let area = serviceAreas[id] else { return (0, 0) }
    // statewide and national have no local centre: farthest band, and after every local area.
    guard let point = area.point else { return (2, 1) }
    let mi = miles(near, point)
    return (mi <= areaBandMiles.close ? 0 : mi <= areaBandMiles.mid ? 1 : 2, 0)
}

private func openKeyNow(_ o: OpenResult, today: String) -> Int {
    switch o.state {
    case .open: return 0
    case .closes_soon: return 1
    case .closed:
        guard let next = o.next ?? nil else { return 5 }
        return next.date == today ? 2 : 4
    // A holiday row ranks exactly where "call first" does: we do not know today's hours, so it never sorts above
    // a row that is known to be open (schema/query-spec.md "Holidays").
    case .call_first, .holiday: return 3
    default: return 6                           // unknown sorts last: never implied open
    }
}
private func openKeyWeek(_ row: BundleRow, _ o: OpenResult, now: Date, alerts: [Alert]) -> Int {
    switch o.state {
    case .open, .closes_soon: return 0
    case .call_first, .holiday: return 1
    case .unknown, .not_listed: return 3
    default:
        guard let next = nextOccurrences(row, now: now, n: 1, alerts: alerts).first else { return 2 }
        return next.start - nowWallMinutes(now) <= 7 * 1440 ? 0 : 2
    }
}

public func categoryMatches(_ category: String, _ q: String?) -> Bool { q == nil || category == q! || category.hasPrefix(q! + ".") }

public func rank(_ rows: [BundleRow], _ q: Query, now: Date, alerts: [Alert] = []) -> [Ranked] {
    let today = dayString(Int((Double(nowWallMinutes(now)) / 1440).rounded(.down)))
    let scored: [(Ranked, Int, Int)] = rows
        .filter { $0.status == "active" && categoryMatches($0.category, q.category) && q.flags.allSatisfy($0.flags.contains) }
        .map { row in
            // DV rows never carry coordinates and never get a distance (docs/08). Their band comes from the public
            // reference point of the area they serve, so proximity works without any fact that locates a shelter.
            // Since 2026-09-24 so does any row that names an area and has no coordinate (`servesByArea`).
            let dv = isDvCategory(row.category)
            let mi: Double? = { if !dv, let n = q.near, let lat = row.lat, let lon = row.lon { return miles(n, LatLon(lat: lat, lon: lon)) }; return nil }()
            let bw = servesByArea(row) ? dvBand(row, near: q.near) : (band: band(mi), wide: 0)
            let open = openNow(row, now: now, alerts: alerts)
            let key = q.mode == "week" ? openKeyWeek(row, open, now: now, alerts: alerts) : openKeyNow(open, today: today)
            return (Ranked(row: row, open: open, badge: badge(row, now: now), miles: mi, band: bw.band), key, bw.wide)
        }
    // Rows with 2+ standing closed reports stay visible but go last in their band (docs/04).
    let reported = { (r: Ranked) in r.badge.level == "reported_closed" ? 1 : 0 }
    let preferred = { (r: Ranked) in !q.prefer.isEmpty && q.prefer.allSatisfy(r.row.flags.contains) ? 0 : 1 }
    return scored.sorted { a, b in
        let (x, kx, wx) = a, (y, ky, wy) = b
        if preferred(x) != preferred(y) { return preferred(x) < preferred(y) }
        if x.band != y.band { return x.band < y.band }
        // Statewide and national DV lines after every local area. 0 for every other row, so ordinary lists are untouched.
        if wx != wy { return wx < wy }
        if reported(x) != reported(y) { return reported(x) < reported(y) }
        if kx != ky { return kx < ky }
        // A DV row's miles is always nil, so two shelters in one area are separated by the open key and the id only.
        if (x.miles ?? 0) != (y.miles ?? 0) { return (x.miles ?? 0) < (y.miles ?? 0) }
        return x.row.id < y.row.id
    }.map(\.0)
}
