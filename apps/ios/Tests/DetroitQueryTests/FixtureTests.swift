// Runs every case in schema/fixtures/*.json, the same files packages/query/test/fixtures.test.ts runs.
// If the web and the phone ever disagree about when a pantry is open, one of these fails.
import Foundation
import XCTest
@testable import DetroitQuery

final class FixtureTests: XCTestCase {
    static let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../../schema/fixtures").standardizedFileURL

    static let defaults: [String: Any] = [
        "org": "Test Org", "category": "food.pantry", "what": "Free groceries", "phones": [], "flags": [],
        "availability": "scheduled", "schedules": [], "status": "active",
        "facts": ["reports": ["closed_open": 0, "wrong_open": 0], "source": ["type": "seed_list", "name": "test"]],
    ]

    func decode<T: Decodable>(_ type: T.Type, _ obj: Any) throws -> T {
        try bundleDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: obj))
    }

    func row(_ raw: [String: Any]) throws -> BundleRow {
        var r = Self.defaults.merging(raw) { _, new in new }
        r["name"] = raw["name"] ?? raw["id"]
        var facts = Self.defaults["facts"] as! [String: Any]
        for (k, v) in (raw["facts"] as? [String: Any]) ?? [:] { facts[k] = v }
        r["facts"] = facts
        return try decode(BundleRow.self, r)
    }

    /// Vitest's toMatchObject: every key in `expected` must match; extra keys in `actual` are fine.
    func matches(_ actual: Any?, _ expected: Any?) -> Bool {
        switch (actual, expected) {
        case (_, is NSNull): return actual == nil || actual is NSNull
        case let (a as [String: Any], e as [String: Any]): return e.allSatisfy { matches(a[$0.key], $0.value) }
        case let (a as Bool, e as NSNumber): return a == e.boolValue     // JSON true/false arrive as NSNumber
        case let (a?, e as NSNumber): return "\(a)" == e.stringValue || (Double("\(a)") ?? .nan) == e.doubleValue
        case let (a?, e as String): return "\(a)" == e
        case let (a as Bool, e as Bool): return a == e
        default: return false
        }
    }

    func dict(_ o: OpenResult) -> [String: Any] {
        var d: [String: Any] = ["state": o.state.rawValue]
        if let c = o.closesAt { d["closes_at"] = c }
        if let m = o.minutesLeft { d["minutes_left"] = m }
        if let n = o.next { d["next"] = n.map { ["date": $0.date, "opens_at": $0.opensAt, "closes_at": $0.closesAt] as Any } ?? NSNull() }
        if let u = o.usualHours { d["usual_hours"] = ["opens_at": u.opensAt, "closes_at": u.closesAt] }
        if o.cancelledNow { d["cancelled_now"] = true }
        return d
    }

    func iso(_ d: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        return f.string(from: d)
    }

    func query(_ raw: [String: Any]?) -> Query {
        var q = Query(category: raw?["category"] as? String, flags: raw?["flags"] as? [String] ?? [], prefer: raw?["prefer"] as? [String] ?? [], mode: raw?["mode"] as? String ?? "now")
        if let n = raw?["near"] as? [String: Double], let lat = n["lat"], let lon = n["lon"] { q.near = LatLon(lat: lat, lon: lon) }
        return q
    }

    // ---- directions (schema/query-spec.md "Streets graph", "Walking directions", "Trip plans") ----
    // The one wording of a result all three runners compare. Metres are rounded to 10 so a port never fails on
    // a last-digit difference; the two off-street distances are to the metre, because they are what a person is
    // told ("then about 40 m to the building").
    func r10(_ m: Double) -> Int { Int((m / 10).rounded()) * 10 }

    func walkSummary(_ r: WalkRoute?) -> String? {
        guard let r else { return nil }
        let steps = r.steps.map { "\($0.turn?.rawValue ?? "start") \($0.street) \($0.bearing.rawValue) \(r10($0.metres))" }
        return "\(steps.joined(separator: " > ")) | \(r10(r.metres)) m, off \(Int(r.startOffMetres.rounded()))/\(Int(r.endOffMetres.rounded()))"
    }

    func planSummary(_ p: Itinerary) -> String {
        let legs = p.legs.map { leg -> String in
            switch leg {
            case .walk(let w): return "walk \(r10(w.metres))m"
            case .ride(let r):
                let head = r.headwayMinutes.map { "every \(numberWord($0))" } ?? "no-headway"
                return "ride \(r.routeId) \(r.stops)st \(head)"
            }
        }
        return "\(legs.joined(separator: " > ")) [\(p.range.lo)-\(p.range.hi)]"
    }

    /// A headway prints the way JSON wrote it: `10`, not `10.0`.
    func numberWord(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(d) }

    func latLon(_ o: Any?) -> LatLon? {
        guard let m = o as? [String: Double], let lat = m["lat"], let lon = m["lon"] else { return nil }
        return LatLon(lat: lat, lon: lon)
    }

    func testEveryFixture() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: Self.dir.path).filter { $0.hasSuffix(".json") }.sorted()
        XCTAssertGreaterThanOrEqual(files.count, 10, "fixtures not found at \(Self.dir.path)")
        var ran = 0, skipped = 0, failures: [String] = []
        for file in files {
            let fx = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.dir.appendingPathComponent(file))) as! [String: Any]
            let rows = try ((fx["rows"] as? [[String: Any]]) ?? []).map(row)
            let alerts = try decode([Alert].self, fx["alerts"] ?? [])
            let segments = try decode([Segment].self, fx["segments"] ?? [])

            // Directions: one graph per fixture file, built once with and once without the City's safety
            // fields. The map files spell their own keys, so they use the plain decoder.
            let plain = directionsDecoder()
            let streets = try plain.decode([PackedStreets].self, from: JSONSerialization.data(withJSONObject: fx["streets"] ?? []))
            let transit = try plain.decode([TransitLayer].self, from: JSONSerialization.data(withJSONObject: fx["transit"] ?? []))
            var built: [Bool: StreetGraph] = [:]
            func graphOf(_ noSafety: Bool) -> StreetGraph {
                if let g = built[noSafety] { return g }
                let g = buildStreetGraph(noSafety ? streets.map(\.withoutSafety) : streets,
                                         key: "\(file)\(noSafety ? ":bare" : "")")
                built[noSafety] = g
                return g
            }
            let network = transit.isEmpty ? nil : buildTransitNetwork(transit)
            for c in fx["cases"] as! [[String: Any]] {
                let name = "\(file) — \(c["name"] as! String)"
                let now = parseInstant(c["now"] as! String)!
                let r = (c["row"] as? String).flatMap { id in rows.first { $0.id == id } }
                let seg = (c["segment"] as? String).flatMap { id in segments.first { $0.id == id } }
                let expect = c["expect"]
                var ok: Bool
                switch c["fn"] as! String {
                case "openNow": ok = matches(dict(openNow(r!, now: now, alerts: alerts)), expect)
                case "nextOccurrences":
                    // " holiday" marks an occurrence that opens on a holiday: labelled, never dropped.
                    let got = nextOccurrences(r!, now: now, n: c["n"] as? Int ?? 3, alerts: alerts).map { "\($0.date) \($0.opensAt)-\($0.closesAt)\($0.holiday ? " holiday" : "")" }
                    ok = got == expect as? [String]; if !ok { failures.append("\(name): got \(got)") ; ran += 1; continue }
                case "badge":
                    let b = badge(r!, now: now)
                    ok = matches(["level": b.level, "key": b.key, "params": b.params, "tier": b.tier] as [String: Any], expect)
                    if !ok { failures.append("\(name): got \(b)"); ran += 1; continue }
                case "rank":
                    let got = rank(rows, query(c["query"] as? [String: Any]), now: now, alerts: alerts).map(\.row.id)
                    ok = got == expect as? [String]; if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                // "<id> band<n> <no-distance|distance>": the band a row landed in, and whether the result object
                // carries a distance at all. A domestic-violence row must always read "no-distance".
                case "rankDetail":
                    let got = rank(rows, query(c["query"] as? [String: Any]), now: now, alerts: alerts)
                        .map { "\($0.row.id) band\($0.band) \($0.miles == nil ? "no-distance" : "distance")" }
                    ok = got == expect as? [String]; if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                case "search":
                    let got = search(rows, c["text"] as? String ?? "", query(c["query"] as? [String: Any]), now: now, alerts: alerts).map(\.row.id)
                    ok = got == expect as? [String]; if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                case "bundleAge":
                    let i = c["index"] as! [String: Any]
                    ok = bundleAge(generatedAt: i["generated_at"] as! String, retired: i["retired"] as? Bool ?? false, now: now).rawValue == expect as? String
                case "effectiveNow":
                    ok = iso(effectiveNow(now, bundleGeneratedAt: (c["index"] as! [String: Any])["generated_at"] as? String)) == expect as? String
                case "helpAlong": ok = helpAlong(rows, seg!).map(\.row.id) == expect as? [String]
                case "milesToSegment": ok = abs(milesToSegment(LatLon(lat: r!.lat!, lon: r!.lon!), seg!) - (expect as! Double)) < (c["tolerance"] as? Double ?? 0.01)
                case "nearestSegment":
                    let hit = nearestSegment(LatLon(lat: r!.lat!, lon: r!.lon!), segments, openOnly: c["openOnly"] as? Bool ?? false, maxMiles: c["maxMiles"] as? Double ?? .infinity)
                    ok = hit?.segment.id == expect as? String || (hit == nil && expect is NSNull)
                case "streetGraph":
                    let g = graphOf(c["no_safety"] as? Bool ?? false)
                    let got: [String: Int] = [
                        "nodes": g.nodeCount, "edges": g.edgeCount, "crossings": g.stats.crossings,
                        "snapped": g.stats.snapped, "components": g.stats.components,
                        "largest": g.stats.largestComponent, "dead_ends": g.stats.deadEnds, "skipped": g.stats.skipped,
                    ]
                    let want = (expect as! [String: Any]).mapValues { ($0 as! NSNumber).intValue }
                    ok = got == want
                    if !ok { failures.append("\(name): got \(got.sorted { $0.key < $1.key })"); ran += 1; continue }
                case "walk":
                    let g = graphOf(c["no_safety"] as? Bool ?? false)
                    let got = walkSummary(walkRoute(g, from: latLon(c["from"])!, to: latLon(c["to"])!))
                    let want = expect is NSNull ? nil : expect as? String
                    ok = got == want
                    if !ok { failures.append("\(name): got \(got ?? "nil")"); ran += 1; continue }
                case "plan":
                    let g = graphOf(c["no_safety"] as? Bool ?? false)
                    let got = plan(g, network!, from: latLon(c["from"])!, to: latLon(c["to"])!).map(planSummary)
                    ok = got == expect as? [String]
                    if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                // The trip window (16-trip-window.json): the first street file is the main roads, any others are
                // cells in key order. A window graph is built for the one case and dropped, as on the phone.
                case "planWindow":
                    let files = (c["no_safety"] as? Bool ?? false) ? streets.map(\.withoutSafety) : streets
                    let from = latLon(c["from"])!, to = latLon(c["to"])!
                    let w = tripWindow(network, from: from, to: to)
                    let g = buildStreetGraph(windowFiles(files[0], Array(files.dropFirst()), w), key: "\(file):window")
                    let got = plan(g, network!, from: from, to: to).map(planSummary)
                    ok = got == expect as? [String]
                    if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                case "transferStops":
                    let got = transferStops(network!, from: latLon(c["from"])!, to: latLon(c["to"])!)
                    ok = got == (expect as? [NSNumber])?.map(\.intValue)
                    if !ok { failures.append("\(name): got \(got)"); ran += 1; continue }
                case "windowRoads":
                    let w = tripWindow(network, from: latLon(c["from"])!, to: latLon(c["to"])!)
                    let kept = windowFiles(streets[0], Array(streets.dropFirst()), w)
                    let roads = kept.flatMap { f in f.roads.map { f.names.indices.contains($0.nameIdx) ? f.names[$0.nameIdx] : "" } }
                    let want = expect as! [String: Any]
                    ok = w.boxes.count == (want["boxes"] as! NSNumber).intValue && roads == want["roads"] as? [String]
                    if !ok { failures.append("\(name): got \(w.boxes.count) boxes, \(roads)"); ran += 1; continue }
                // A case whose `fn` this port does not implement yet — the directions rules land in TypeScript
                // first (schema/query-spec.md "Directions") and are ported afterwards. Counted and printed,
                // never silently passed, so the number falling through is visible in CI.
                default: skipped += 1; continue
                }
                ran += 1
                if !ok { failures.append(name) }
            }
        }
        print("fixtures: \(ran) cases, \(failures.count) failed, \(skipped) skipped (not implemented here yet)")
        XCTAssertGreaterThan(ran, 80)
        // Every `fn` the spec has is implemented here now, directions included (2026-09-22). A new one lands in
        // TypeScript first and falls through to `default` until it is ported; this is what makes that visible.
        XCTAssertEqual(skipped, 0, "\(skipped) fixture cases are not implemented in the Swift port")
        XCTAssertEqual(failures, [], failures.joined(separator: "\n"))
    }

    func testDaylightSavingDoesNotMoveDoorHours() {
        // Sunday 2026-11-01 02:00 the clocks go back. A 9am opening is 9am on the wall on both sides.
        let before = parseInstant("2026-10-31T13:30:00Z")!, after = parseInstant("2026-11-02T14:30:00Z")!
        XCTAssertEqual(toWall(before).hh, 9); XCTAssertEqual(toWall(after).hh, 9)
    }

    func testCalendarArithmetic() {
        for day in stride(from: -800, to: 40000, by: 37) { let c = civil(day); XCTAssertEqual(dayNumber(c.y, c.m, c.d), day) }
        XCTAssertEqual(weekday(dayNumber(2026, 9, 18)), 4)    // a Friday
        XCTAssertEqual(parseInstant("2026-09-18T13:45:00-04:00"), parseInstant("2026-09-18T17:45Z"))
    }
}
