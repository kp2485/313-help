// One ranking rule (schema/query-spec.md "Ranking"), port of packages/query/src/rank.ts:
//   eligibility -> distance band -> reported-closed last -> open-now / next-open -> freshness -> distance -> id
// Distance comes before everything except eligibility because many users have no car.
import Foundation

public struct Query: Sendable {
    public var category: String?
    public var flags: [String] = []
    /// Device location or a typed ZIP's center. Held in memory only, never written or sent.
    public var near: LatLon?
    public var mode: String = "now"          // "now" | "week"
    public init(category: String? = nil, flags: [String] = [], near: LatLon? = nil, mode: String = "now") {
        self.category = category; self.flags = flags; self.near = near; self.mode = mode
    }
}

public struct Ranked: Sendable {
    public var row: BundleRow
    public var open: OpenResult
    public var badge: Badge
    public var miles: Double?
    public var band: Int
}

private let earthMiles = 3958.8
public func miles(_ a: LatLon, _ b: LatLon) -> Double {
    let rad = { (d: Double) in d * .pi / 180 }
    let dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
    let h = pow(sin(dLat / 2), 2) + cos(rad(a.lat)) * cos(rad(b.lat)) * pow(sin(dLon / 2), 2)
    return 2 * earthMiles * asin(sqrt(h))
}

private func band(_ mi: Double?) -> Int { guard let mi else { return 0 }; return mi <= 1 ? 0 : mi <= 3 ? 1 : 2 }

private func openKeyNow(_ o: OpenResult, today: String) -> Int {
    switch o.state {
    case .open: return 0
    case .closes_soon: return 1
    case .closed:
        guard let next = o.next ?? nil else { return 5 }
        return next.date == today ? 2 : 4
    case .call_first: return 3
    default: return 6                           // unknown sorts last: never implied open
    }
}
private func openKeyWeek(_ row: BundleRow, _ o: OpenResult, now: Date, alerts: [Alert]) -> Int {
    switch o.state {
    case .open, .closes_soon: return 0
    case .call_first: return 1
    case .unknown, .not_listed: return 3
    default:
        guard let next = nextOccurrences(row, now: now, n: 1, alerts: alerts).first else { return 2 }
        return next.start - nowWallMinutes(now) <= 7 * 1440 ? 0 : 2
    }
}

public func categoryMatches(_ category: String, _ q: String?) -> Bool { q == nil || category == q! || category.hasPrefix(q! + ".") }

public func rank(_ rows: [BundleRow], _ q: Query, now: Date, alerts: [Alert] = []) -> [Ranked] {
    let today = dayString(Int((Double(nowWallMinutes(now)) / 1440).rounded(.down)))
    let scored: [(Ranked, Int)] = rows
        .filter { $0.status == "active" && categoryMatches($0.category, q.category) && q.flags.allSatisfy($0.flags.contains) }
        .map { row in
            // DV rows never carry coordinates, so they never get a distance (docs/08).
            let mi: Double? = { if let n = q.near, let lat = row.lat, let lon = row.lon { return miles(n, LatLon(lat: lat, lon: lon)) }; return nil }()
            let open = openNow(row, now: now, alerts: alerts)
            let key = q.mode == "week" ? openKeyWeek(row, open, now: now, alerts: alerts) : openKeyNow(open, today: today)
            return (Ranked(row: row, open: open, badge: badge(row, now: now), miles: mi, band: band(mi)), key)
        }
    // Rows with 2+ standing closed reports stay visible but go last in their band (docs/04).
    let reported = { (r: Ranked) in r.badge.level == "reported_closed" ? 1 : 0 }
    return scored.sorted { a, b in
        let (x, kx) = a, (y, ky) = b
        if x.band != y.band { return x.band < y.band }
        if reported(x) != reported(y) { return reported(x) < reported(y) }
        if kx != ky { return kx < ky }
        if x.badge.tier != y.badge.tier { return x.badge.tier < y.badge.tier }
        if (x.miles ?? 0) != (y.miles ?? 0) { return (x.miles ?? 0) < (y.miles ?? 0) }
        return x.row.id < y.row.id
    }.map(\.0)
}
