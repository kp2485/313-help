// The routing rules against the real committed data, with no network at all. The Swift half of
// packages/query/test/routing-real.test.ts — the same bounds, on the same files.
//
// Like the pipeline's own convention, every case skips when the files are not in the checkout: `data/bundle/v1`
// is never committed, so a fresh clone runs the fixtures and skips these. What they hold on to is the shape of
// the real city — the numbers in docs/research/2026-09-22-offline-directions.md — so that a change to the
// noding, the snapping or the cost model has to be a decision somebody makes rather than a surprise.
import Foundation
import XCTest
@testable import DetroitQuery

final class RoutingRealTests: XCTestCase {
    static let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("../../../..").standardizedFileURL
    static var bundle: URL { root.appendingPathComponent("data/bundle/v1") }
    static var ingested: URL { root.appendingPathComponent("data/ingested/basemap") }

    static func json<T: Decodable>(_ type: T.Type, _ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? directionsDecoder().decode(T.self, from: data)
    }

    /// Base plus every cell, base first and the cell keys sorted — the order a client must load them in.
    static let streetFiles: [PackedStreets] = {
        struct Cells: Decodable { var cells: [String: PackedStreets] }
        if let base = json(PackedStreets.self, bundle.appendingPathComponent("map/base.json")),
           let cells = json(Cells.self, bundle.appendingPathComponent("map/streets.json")) {
            return [base] + cells.cells.keys.sorted().map { cells.cells[$0]! }
        }
        if let base = json(PackedStreets.self, ingested.appendingPathComponent("base.json")) {
            let dir = ingested.appendingPathComponent("cells")
            let names = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).sorted()
            return [base] + names.compactMap { json(PackedStreets.self, dir.appendingPathComponent($0)) }
        }
        return []
    }()

    struct Row: Decodable { var id: String; var name: String; var category: String; var lat: Double?; var lon: Double? }

    static let rows: [Row] = {
        let dir = bundle.appendingPathComponent("category")
        let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).filter { $0.hasSuffix(".json") }.sorted()
        return files.flatMap { f -> [Row] in
            struct Wrapped: Decodable { var rows: [Row] }
            let url = dir.appendingPathComponent(f)
            if let a = json([Row].self, url) { return a }
            return json(Wrapped.self, url)?.rows ?? []
        }
    }()

    static let layers: [TransitLayer] = {
        let dir = bundle.appendingPathComponent("map/transit")
        struct Head: Decodable { var id: String; var stopsLayer: String?; var routes: [PackedRoutes.Entry]?
            enum CodingKeys: String, CodingKey { case id, stopsLayer = "stops_layer", routes } }
        let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []).filter { $0.hasSuffix(".net.json") }.sorted()
        var out: [TransitLayer] = []
        for f in files {
            let url = dir.appendingPathComponent(f)
            guard let head = json(Head.self, url), head.routes != nil else { continue }   // a stops .net.json
            let stopsId = head.stopsLayer ?? head.id
            guard let stops = json(PackedPoints.self, dir.appendingPathComponent("\(stopsId).json")),
                  let routes = json(PackedRoutes.self, url) else { continue }
            let serves = stopsId != head.id ? json(PackedServes.self, dir.appendingPathComponent("\(stopsId).net.json")) : nil
            out.append(TransitLayer(stops: stops, routes: routes, serves: serves))
        }
        return out
    }()

    /// The street files are committed (`data/ingested/basemap`), so the graph cases run on a fresh clone. The
    /// listings and the transit layers are NOT: `data/bundle/v1` is built, never committed.
    static var has: Bool { !streetFiles.isEmpty }
    static var hasRows: Bool { rows.count >= 40 }

    static let graph: StreetGraph? = has ? buildStreetGraph(streetFiles, key: "real") : nil
    static let network: TransitNetwork? = has && !layers.isEmpty ? buildTransitNetwork(layers) : nil

    func skipUnlessData() throws {
        try XCTSkipUnless(Self.has, "no street files in this checkout — run `pnpm build:bundle`")
    }
    func skipUnlessRows() throws {
        try skipUnlessData()
        try XCTSkipUnless(Self.hasRows, "no built bundle in this checkout — run `pnpm build:bundle`")
    }
    func skipUnlessTransit() throws {
        try skipUnlessData()
        try XCTSkipUnless(Self.network != nil, "no transit layers in this checkout — run `pnpm build:bundle`")
    }

    // ---- the street graph ----------------------------------------------------------------------

    func testGraphIsTheSizeAndShapeTheStudyMeasured() throws {
        try skipUnlessData()
        let g = Self.graph!, s = g.stats
        // The study: 23,863 nodes, 40,342 edges, 45 components, largest 99.5%.
        XCTAssertGreaterThan(g.nodeCount, 20_000)
        XCTAssertLessThan(g.nodeCount, 28_000)
        XCTAssertGreaterThan(g.edgeCount, 34_000)
        XCTAssertLessThan(g.edgeCount, 46_000)
        XCTAssertGreaterThan(Double(s.largestComponent) / Double(g.nodeCount), 0.99)
        XCTAssertLessThan(Double(s.deadEnds) / Double(g.nodeCount), 0.15)
        XCTAssertGreaterThan(s.crossings, 15_000)
        XCTAssertGreaterThan(s.snapped, 5_000)
        print("streets graph: \(g.nodeCount) nodes, \(g.edgeCount) edges, \(s.components) components, "
            + "largest \(String(format: "%.1f", 100 * Double(s.largestComponent) / Double(g.nodeCount)))%, "
            + "dead ends \(String(format: "%.1f", 100 * Double(s.deadEnds) / Double(g.nodeCount)))%, "
            + "\(s.crossings) crossings + \(s.snapped) snapped ends, built in \(s.buildMs) ms")
    }

    func testCarriesTheCitysSafetyFields() throws {
        try skipUnlessData()
        let g = Self.graph!
        XCTAssertTrue(g.hasSafety)
        let onHin = g.waySafety.filter { safetyHin($0) }.count
        XCTAssertGreaterThan(onHin, 50)                 // the City's High Injury Network really is in there
        print("safety bytes: \(onHin) of \(g.waySafety.count) ways are on the City's High Injury Network")
    }

    func testBuildsFastEnoughToDoItOncePerBundle() throws {
        try skipUnlessData()
        // 183 ms on the study's Mac. This is a debug build of Swift with bounds checking on every array read,
        // and CI is slower again, so the bound is generous on purpose: what it catches is an accidental
        // quadratic, not a slow laptop.
        XCTAssertLessThan(Self.graph!.stats.buildMs, 30_000)
    }

    func testAnswersAWalkingRouteForTwentyListingPairsQuickly() throws {
        try skipUnlessRows()
        let g = Self.graph!
        let withCoords = Self.rows.filter { $0.lat != nil && $0.lon != nil }
        var seed = 7
        func rnd() -> Double { seed = (seed &* 1103515245 &+ 12345) & 0x7fffffff; return Double(seed) / Double(0x7fffffff) }
        var times: [Double] = [], found = 0
        for _ in 0..<20 {
            let a = withCoords[Int(rnd() * Double(withCoords.count))], b = withCoords[Int(rnd() * Double(withCoords.count))]
            let t = Date()
            let r = walkRoute(g, from: LatLon(lat: a.lat!, lon: a.lon!), to: LatLon(lat: b.lat!, lon: b.lon!))
            times.append(Date().timeIntervalSince(t) * 1000)
            if r != nil { found += 1 }
        }
        times.sort()
        print("20 listing pairs: median \(String(format: "%.1f", times[10])) ms, max \(String(format: "%.1f", times[19])) ms, \(found) routed")
        XCTAssertGreaterThanOrEqual(found, 18)
        // The target is 50 ms a route on a release build. `swift test` is unoptimised, so the bound here is on
        // the median and is an order of magnitude looser; the release figure is measured in the simulator.
        XCTAssertLessThan(times[10], 3_000)
    }

    // The study's own sample: Woodward at W Grand Blvd to Auntie Na's Village free food boxes, 12028 Yellowstone.
    func testReproducesTheStudysSampleRoute() throws {
        try skipUnlessData()
        let r = walkRoute(Self.graph!, from: LatLon(lat: 42.3697, lon: -83.0742), to: LatLon(lat: 42.377459, lon: -83.135296))
        let route = try XCTUnwrap(r)
        print("sample route: \(String(format: "%.2f", route.metres / 1000)) km (straight \(String(format: "%.2f", route.straightMetres / 1000)) km), "
            + "snapped \(Int(route.startOffMetres.rounded())) m / \(Int(route.endOffMetres.rounded())) m, \(route.settled) settled, "
            + "\(route.steps.count) steps: " + route.steps.filter { $0.metres > 100 }.map { "\($0.street) \(Int($0.metres.rounded()))" }.joined(separator: " > "))
        // The study measured 6.66 km on the shortest path and a 5.10 km straight line. The safety penalty may
        // move the route onto calmer streets, so the bound is on being a sane walking route, not one exact line.
        XCTAssertGreaterThan(route.metres, 5_000)
        XCTAssertLessThan(route.metres, 9_000)
        XCTAssertGreaterThan(route.straightMetres, 5_000)
        XCTAssertLessThan(route.startOffMetres, 120)
        XCTAssertLessThan(route.endOffMetres, 120)
        // it ends on the pantry's own street, and every step names a street a person can read off a sign
        XCTAssertEqual(route.steps.last?.street, "Yellowstone St")
        XCTAssertTrue(route.steps.allSatisfy { !$0.street.isEmpty })
        // the drawn line follows the streets, so it has far more vertices than it has turns
        XCTAssertGreaterThan(route.polyline.count, route.steps.count)
    }

    func testRoutesToTheStreetOutsideNeverToTheDoor() throws {
        try skipUnlessRows()
        let g = Self.graph!
        let withCoords = Self.rows.filter { $0.lat != nil && $0.lon != nil }.prefix(60)
        var off = 0.0, n = 0
        for row in withCoords {
            guard let r = walkRoute(g, from: LatLon(lat: 42.3314, lon: -83.0458), to: LatLon(lat: row.lat!, lon: row.lon!)) else { continue }
            off += r.endOffMetres; n += 1
            // the polyline's last point is a point on a street, which is not the listing's own coordinate
            let last = r.polyline[r.polyline.count - 1]
            XCTAssertEqual(metresBetween(LatLon(lat: last[1], lon: last[0]), LatLon(lat: row.lat!, lon: row.lon!)),
                           r.endOffMetres, accuracy: 1)
        }
        XCTAssertGreaterThan(n, 30)
        print("route ends: mean \(Int((off / Double(n)).rounded())) m from the door, over \(n) listings")
    }

    // ---- trip plans ----------------------------------------------------------------------------

    func testCarriesEveryStopAndRouteTheIngestPublished() throws {
        try skipUnlessTransit()
        let net = Self.network!
        XCTAssertGreaterThan(net.stops.count, 9_000)
        XCTAssertGreaterThan(net.routes.count, 70)
        let withHeadway = net.routes.filter { $0.headway != nil }
        XCTAssertGreaterThanOrEqual(withHeadway.count, 37)        // DDOT publishes one for all 37
        print("transit: \(net.stops.count) stops, \(net.routes.count) routes, \(withHeadway.count) with a published headway")
    }

    func testPutsAStopWithin400mOfMostListings() throws {
        try skipUnlessTransit()
        try skipUnlessRows()
        let net = Self.network!
        let withCoords = Self.rows.filter { $0.lat != nil && $0.lon != nil }
        let near = withCoords.filter { !stopsNear(net, LatLon(lat: $0.lat!, lon: $0.lon!), metres: 400).isEmpty }.count
        print("transit coverage: \(near) of \(withCoords.count) listings have a stop within 400 m "
            + "(\(Int((100 * Double(near) / Double(withCoords.count)).rounded()))%)")
        XCTAssertGreaterThan(Double(near) / Double(withCoords.count), 0.9)   // the study measured 92%
    }

    func testPlansTheStudysTripWithNoTimeAnywhereInIt() throws {
        try skipUnlessTransit()
        let net = Self.network!
        let t = Date()
        let plans = plan(Self.graph!, net, from: LatLon(lat: 42.3697, lon: -83.0742), to: LatLon(lat: 42.377459, lon: -83.135296))
        let ms = Date().timeIntervalSince(t) * 1000
        XCTAssertGreaterThan(plans.count, 0)
        for p in plans {
            let legs = p.legs.map { l -> String in
                switch l {
                case .walk(let w): return "walk \(Int(w.metres.rounded())) m"
                case .ride(let r): return "ride \(r.routeId) \(r.stops) stops" + (r.headwayMinutes.map { " every \(Int($0))" } ?? "")
                }
            }
            print("plan \(p.range.lo)-\(p.range.hi) min, \(p.changes) change(s), walk \(Int(p.walkMetres.rounded())) m: " + legs.joined(separator: " > "))
            XCTAssertLessThanOrEqual(p.changes, 1)
            XCTAssertGreaterThan(p.range.hi, p.range.lo)
            // every ride names its own stops, and a headway is either a published number or nothing
            for l in p.legs {
                guard let r = l.rideLeg else { continue }
                XCTAssertFalse(r.fromStop.name.isEmpty)
                XCTAssertTrue(r.headwayMinutes == nil || r.headwayMinutes! > 0)
                XCTAssertGreaterThan(r.polyline.count, 1)
            }
        }
        // the bus plans must be real DDOT or SMART routes, not something we made up
        let ridden = plans.flatMap { $0.legs.compactMap(\.rideLeg).map(\.routeId) }
        for id in ridden { XCTAssertTrue(net.routes.contains { $0.id == id }, id) }
        print("plan computed in \(Int(ms.rounded())) ms; routes offered: \(ridden.isEmpty ? "(walking only)" : ridden.joined(separator: ", "))")
    }

    func testWalksTheFourBlocksInsteadOfWaitingForABus() throws {
        try skipUnlessTransit()
        // Two points about 500 m apart downtown: a bus cannot beat walking once half a headway is counted.
        let plans = plan(Self.graph!, Self.network!, from: LatLon(lat: 42.3314, lon: -83.0458), to: LatLon(lat: 42.3353, lon: -83.0495))
        XCTAssertGreaterThan(plans.count, 0)
        XCTAssertTrue(plans[0].legs.allSatisfy { !$0.isRide })
    }
}
