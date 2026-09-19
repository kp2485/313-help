// Greenway geometry (docs/11), all on the device. Port of packages/query/src/places.ts.
import Foundation

/// About a 10-minute walk or roll.
public let walkMiles = 0.5
private let milesPerDegLat = 69.09

/// Miles from a point to a polyline of [lon, lat]. Flat-earth projection; negligible error at city scale.
public func milesToLine(_ pt: LatLon, _ line: [[Double]]) -> Double {
    let kx = milesPerDegLat * cos(pt.lat * .pi / 180)
    let p = line.map { ((($0[0]) - pt.lon) * kx, ($0[1] - pt.lat) * milesPerDegLat) }
    if p.count == 1 { return hypot(p[0].0, p[0].1) }
    var best = Double.infinity
    for i in 0..<(p.count - 1) {
        let (ax, ay) = p[i], (bx, by) = p[i + 1], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
        let t = len2 == 0 ? 0 : max(0, min(1, -(ax * dx + ay * dy) / len2))
        best = min(best, hypot(ax + t * dx, ay + t * dy))
    }
    return best
}

public func milesToSegment(_ pt: LatLon, _ seg: Segment) -> Double { seg.lines.map { milesToLine(pt, $0) }.min() ?? .infinity }

/// Active rows within walking distance of a segment, nearest first. Rows without coordinates never appear.
public func helpAlong(_ rows: [BundleRow], _ seg: Segment, maxMiles: Double = walkMiles) -> [(row: BundleRow, miles: Double)] {
    rows.compactMap { r -> (row: BundleRow, miles: Double)? in
        guard r.status == "active", let lat = r.lat, let lon = r.lon else { return nil }
        let mi = milesToSegment(LatLon(lat: lat, lon: lon), seg)
        return mi <= maxMiles ? (r, mi) : nil
    }.sorted { $0.miles != $1.miles ? $0.miles < $1.miles : $0.row.id < $1.row.id }
}

/// Nearest segment: the "near the greenway" line (open only), and snapping a condition report to a segment id.
public func nearestSegment(_ pt: LatLon, _ segs: [Segment], openOnly: Bool = false, maxMiles: Double = .infinity) -> (segment: Segment, miles: Double)? {
    var best: (segment: Segment, miles: Double)?
    for s in segs where !openOnly || s.phase == "open" {
        let mi = milesToSegment(pt, s)
        if best == nil || mi < best!.miles { best = (s, mi) }
    }
    guard let b = best, b.miles <= maxMiles else { return nil }
    return b
}
