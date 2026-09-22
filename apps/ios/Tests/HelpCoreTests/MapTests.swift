// The map, held to the same arithmetic as the web app's (apps/web/src/map.ts) and to the one rule that must never
// be got wrong: a listing that is never a dot. Everything here is plain numbers, so `swift test` runs it on Linux
// as well as on a Mac.
import DetroitQuery
import Foundation
import HelpCore
import XCTest

/// `Segment` comes from the bundle, so it has no memberwise initialiser: a test stretch is written as the JSON the
/// bundle carries and decoded the same way the app decodes it.
func testSegment(id: String, name: String? = nil, phase: String = "open", lines: [[[Double]]]) -> Segment {
    let json = """
    {"id":"\(id)","name":"\(name ?? id)","phase":"\(phase)","lines":\(lines)}
    """
    return try! bundleDecoder().decode(Segment.self, from: Data(json.utf8))
}

final class MapProjectionTests: XCTestCase {
    func testAPointProjectsAndComesBack() {
        let p = LatLon(lat: 42.3314, lon: -83.0458)               // Campus Martius
        let q = MapProjection.point(p)
        XCTAssertEqual(MapProjection.lat(y: q.y), p.lat, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lon(x: q.x), p.lon, accuracy: 1e-9)
    }

    func testNorthIsUpAndEastIsRight() {
        XCTAssertLessThan(MapProjection.y(lat: 42.45), MapProjection.y(lat: 42.26))   // further north, smaller y
        XCTAssertLessThan(MapProjection.x(lon: -83.3), MapProjection.x(lon: -82.95))
    }

    /// One degree of latitude is one unit; a degree of longitude is shorter this far north, by the cosine.
    func testAUnitIsADegreeOfLatitude() {
        XCTAssertEqual(MapProjection.y(lat: 41.35) - MapProjection.y(lat: 42.35), 1, accuracy: 1e-12)
        XCTAssertEqual(MapProjection.x(lon: -82.1) - MapProjection.x(lon: -83.1), MapProjection.k, accuracy: 1e-12)
        XCTAssertLessThan(MapProjection.k, 1)
    }

    func testABoxIsTheRectangleAroundThePoints() {
        let b = MapBox.around([0, 0, 2, -1, -3, 4])
        XCTAssertEqual(b.minX, -3); XCTAssertEqual(b.maxX, 2)
        XCTAssertEqual(b.minY, -1); XCTAssertEqual(b.maxY, 4)
        XCTAssertTrue(b.intersects(MapBox(minX: 1, minY: 1, maxX: 9, maxY: 9)))
        XCTAssertFalse(b.intersects(MapBox(minX: 9, minY: 9, maxX: 10, maxY: 10)))
        XCTAssertTrue(b.contains(x: 0, y: 0))
        XCTAssertFalse(b.contains(x: 5, y: 0))
        XCTAssertTrue(MapBox.empty.isEmpty)
        XCTAssertEqual(MapBox.empty.union(b), b)
    }
}

final class MapFileTests: XCTestCase {
    /// The bundle writes a line as a first point and then deltas, in hundred-thousandths of a degree from the
    /// file's own origin. Same decoding as `decodeLine` in apps/web/src/map.ts.
    func testAPolylineIsDeltasFromTheFilesOrigin() {
        let pts = MapFileDecoder.polyline([100_000, 200_000, -50_000, 0], origin: [-83.2, 42.3])
        XCTAssertEqual(pts.count, 4)
        XCTAssertEqual(MapProjection.lon(x: pts[0]), -82.2, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lat(y: pts[1]), 44.3, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lon(x: pts[2]), -82.7, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lat(y: pts[3]), 44.3, accuracy: 1e-9)
    }

    func testAnOddOrEmptyRunDecodesToNothingRatherThanCrashing() {
        XCTAssertEqual(MapFileDecoder.polyline([], origin: [-83.2, 42.3]), [])
        XCTAssertEqual(MapFileDecoder.polyline([5], origin: [-83.2, 42.3]), [])
        XCTAssertEqual(MapFileDecoder.polyline([5, 5], origin: []), [])
    }

    private let baseJSON = """
    {"source":{"last_edited":{"roads":"2025-09-30"}},"origin":[-83.2,42.3],
     "names":["Gratiot Ave"],"roads":[[0,-1,[0,0,1000,0]],[3,0,[0,0,0,1000]]],
     "park_names":["Palmer Park"],"parks":[[0,[0,0,500,0,0,500,-500,0]],[-1,[0,0,100,0,0,100]]],
     "boundary":[[0,0,2000,0,0,2000,-2000,0]]}
    """

    func testTheBaseFileBecomesRoadsParksAndOutlines() throws {
        let m = try MapFileDecoder.baseMap(base: Data(baseJSON.utf8), streets: nil)
        XCTAssertEqual(m.edited, "2025-09-30")
        XCTAssertEqual(m.roads.count, 2)
        XCTAssertEqual(m.roads[0].cls, 0)
        XCTAssertEqual(m.roads[0].name, "", "a name index of -1 means the road has no name")
        XCTAssertEqual(m.roads[1].name, "Gratiot Ave")
        XCTAssertEqual(m.parks.map(\.name), ["Palmer Park", ""])
        XCTAssertEqual(m.boundary.count, 1)
        XCTAssertEqual(m.cells.count, 0, "no streets file: the map still draws, without the small streets")
        XCTAssertFalse(m.roads[0].box.isEmpty)
    }

    func testTheStreetsFileAddsOneCellPerSquare() throws {
        let streets = """
        {"grid":{},"cells":{"c_0_1":{"origin":[-83.2,42.3],"names":["Elm St"],"roads":[[4,0,[0,0,100,0]]]},
                            "c_0_0":{"origin":[-83.2,42.3],"names":[],"roads":[[4,-1,[0,0,0,100]]]}}}
        """
        let m = try MapFileDecoder.baseMap(base: Data(baseJSON.utf8), streets: Data(streets.utf8))
        XCTAssertEqual(m.cells.count, 2)
        // Sorted by key, so the same bundle always draws in the same order.
        XCTAssertEqual(m.cells[0].roads[0].name, "")
        XCTAssertEqual(m.cells[1].roads[0].name, "Elm St")
        XCTAssertFalse(m.cells[1].box.isEmpty)
    }

    func testATransportLayerCarriesLinesAndStops() throws {
        let json = """
        {"id":"ddot_routes","kind":"both","origin":[-83.2,42.3],"names":["Route 4","Gratiot & 7 Mile"],
         "lines":[[0,[0,0,1000,1000]]],"points":[[1,2000,3000],[-1,4000,5000]]}
        """
        let l = try MapFileDecoder.layer(Data(json.utf8))
        XCTAssertEqual(l.lines.count, 1)
        XCTAssertEqual(l.lines[0].name, "Route 4")
        XCTAssertEqual(l.points.map(\.name), ["Gratiot & 7 Mile", ""])
        XCTAssertEqual(MapProjection.lat(y: l.points[0].y), 42.33, accuracy: 1e-9)
    }

    func testAGreenwayStretchProjectsToDrawableLines() {
        let seg = testSegment(id: "seg_x", name: "Bagley", lines: [[[-83.076, 42.326], [-83.074, 42.327]]])
        let lines = MapFileDecoder.segmentLines(seg)
        XCTAssertEqual(lines.count, 1)
        XCTAssertEqual(lines[0].count, 4)
        XCTAssertEqual(MapProjection.lon(x: lines[0][0]), -83.076, accuracy: 1e-9)
    }

    /// The real files in the repository, so a change to the pipeline's encoding is caught here rather than on a
    /// phone. Skipped when the bundle has not been built (`pnpm build:bundle`).
    func testTheShippedBundleDecodes() throws {
        let dir = repoRoot.appendingPathComponent("data/bundle/v1/map")
        guard let base = try? Data(contentsOf: dir.appendingPathComponent("base.json")) else {
            throw XCTSkip("data/bundle/v1 has not been built here")
        }
        let streets = try? Data(contentsOf: dir.appendingPathComponent("streets.json"))
        let m = try MapFileDecoder.baseMap(base: base, streets: streets)
        XCTAssertGreaterThan(m.roads.count, 100)
        XCTAssertGreaterThan(m.parks.count, 100)
        XCTAssertFalse(m.boundary.isEmpty)
        XCTAssertEqual(m.edited.count, 10, "the road layer's edit date is a plain YYYY-MM-DD")
        // Everything is inside the bbox docs/CLAUDE.md gives for the service area, with a little room at the edges.
        let all = m.roads.reduce(MapBox.empty) { $0.union($1.box) }
        XCTAssertGreaterThan(MapProjection.lat(y: all.maxY), 42.1)
        XCTAssertLessThan(MapProjection.lat(y: all.minY), 42.6)
        XCTAssertGreaterThan(MapProjection.lon(x: all.minX), -83.6)
        XCTAssertLessThan(MapProjection.lon(x: all.maxX), -82.7)

        if let layer = try? Data(contentsOf: dir.appendingPathComponent("transit/qline.json")) {
            let l = try MapFileDecoder.layer(layer)
            XCTAssertGreaterThan(l.points.count, 5)
            XCTAssertTrue(l.points.allSatisfy { !$0.name.isEmpty })
        }
    }
}

final class MapCameraTests: XCTestCase {
    private func camera() -> MapCamera {
        MapCamera.fitting([LatLon(lat: 42.25, lon: -83.33), LatLon(lat: 42.46, lon: -82.91)],
                          width: 390, height: 700, cover: true)
    }

    func testFittingPutsTheCityInTheMiddle() {
        let c = camera()
        XCTAssertEqual(MapProjection.lat(y: c.centerY), 42.355, accuracy: 0.01)
        XCTAssertEqual(MapProjection.lon(x: c.centerX), -83.12, accuracy: 0.01)
        XCTAssertGreaterThan(c.scale, 0)
    }

    func testCoverFillsTheBoxAndFitShowsAllOfIt() {
        let pts = [LatLon(lat: 42.25, lon: -83.33), LatLon(lat: 42.46, lon: -82.91)]
        let cover = MapCamera.fitting(pts, width: 390, height: 700, cover: true)
        let fit = MapCamera.fitting(pts, width: 390, height: 700, cover: false)
        XCTAssertGreaterThan(cover.scale, fit.scale, "cover is always the closer of the two")
    }

    func testAPointOnTheScreenAndBack() {
        let c = camera()
        let x = MapProjection.x(lon: -83.05), y = MapProjection.y(lat: 42.33)
        XCTAssertEqual(c.mapX(c.screenX(x)), x, accuracy: 1e-9)
        XCTAssertEqual(c.mapY(c.screenY(y)), y, accuracy: 1e-9)
        XCTAssertEqual(c.screenX(c.centerX), 195, accuracy: 1e-9)
        XCTAssertEqual(c.screenY(c.centerY), 350, accuracy: 1e-9)
    }

    func testZoomingKeepsWhatIsUnderTheFingersUnderTheFingers() {
        let c = camera()
        let before = (x: c.mapX(120), y: c.mapY(500))
        let z = c.zoomed(by: 1.8, aroundX: 120, y: 500)
        XCTAssertEqual(z.mapX(120), before.x, accuracy: 1e-9)
        XCTAssertEqual(z.mapY(500), before.y, accuracy: 1e-9)
        XCTAssertEqual(z.scale, c.scale * 1.8, accuracy: 1e-6)
    }

    func testZoomStopsAtTheSameTwoLimitsAsTheWebMap() {
        var c = camera()
        for _ in 0..<40 { c = c.zoomed(by: 2) }
        XCTAssertEqual(c.scale, MapCamera.maxScale, accuracy: 1e-6)
        XCTAssertEqual(c.metersPerPoint, 0.6, accuracy: 1e-6)
        for _ in 0..<80 { c = c.zoomed(by: 0.5) }
        XCTAssertEqual(c.scale, MapCamera.minScale, accuracy: 1e-6)
        XCTAssertEqual(c.metersPerPoint, 90, accuracy: 1e-6)
    }

    func testPanningFollowsTheFingerAndCannotLoseTheCity() {
        let c = camera()
        let right = c.panned(dx: 50, dy: 0)
        XCTAssertLessThan(right.centerX, c.centerX, "dragging right moves the view west")
        var far = c
        for _ in 0..<200 { far = far.panned(dx: -400, dy: -400) }
        XCTAssertEqual(far.centerX, MapCamera.panLimitX, accuracy: 1e-12)
        XCTAssertEqual(far.centerY, MapCamera.panLimitY, accuracy: 1e-12)
    }

    func testAPinchThatAlsoSlidesKeepsThePlaceUnderTheFingers() {
        // Two fingers spread, slide across the screen and turn, one frame at a time, exactly as the screen feeds
        // them in. Wherever their middle ends up, the place that was under it at the start is under it still.
        var c = camera()
        var was = (x: 150.0, y: 300.0)
        let start = (x: c.mapX(was.x), y: c.mapY(was.y))
        for step in [(f: 1.3, x: 160.0, y: 290.0), (f: 1.2, x: 210.0, y: 250.0), (f: 0.9, x: 190.0, y: 380.0)] {
            c = c.pinched(by: step.f, fromX: was.x, y: was.y, toX: step.x, y: step.y)
            was = (step.x, step.y)
        }
        XCTAssertEqual(c.mapX(was.x), start.x, accuracy: 1e-9)
        XCTAssertEqual(c.mapY(was.y), start.y, accuracy: 1e-9)
        XCTAssertGreaterThan(c.scale, camera().scale, "1.3 x 1.2 x 0.9 is still a spread")
    }

    func testAPinchThatDoesNotMoveChangesNothing() {
        let c = camera()
        let same = c.pinched(by: 1, fromX: 120, y: 200, toX: 120, y: 200)
        XCTAssertEqual(same.centerX, c.centerX, accuracy: 1e-12)
        XCTAssertEqual(same.centerY, c.centerY, accuracy: 1e-12)
        XCTAssertEqual(same.scale, c.scale, accuracy: 1e-9)
    }

    func testMomentumCarriesTheMapAndThenStops() {
        var c = camera()
        var fling = MapFling(vx: -900, vy: 0)
        XCTAssertTrue(fling.worthStarting)
        let from = c.centerX
        var done = false, frames = 0
        while !done, frames < 600 {
            let r = fling.step(c, seconds: 1.0 / 60)
            c = r.camera; fling = r.fling; done = r.done; frames += 1
        }
        XCTAssertTrue(done)
        XCTAssertLessThan(fling.speed, MapFling.stopSpeed)
        let carried = (c.centerX - from) * camera().scale
        XCTAssertGreaterThan(carried, 150, "a real flick carries the map a real distance")
        XCTAssertLessThan(carried, 900 / MapFling.decay * 1.05, "and never more than the speed allows")
        XCTAssertFalse(MapFling(vx: 10, vy: 10).worthStarting, "a finger that stopped does not throw the map")
    }

    func testMomentumDiesAtThePanLimitInsteadOfPushingThroughIt() {
        var c = camera()
        c.centerX = MapCamera.panLimitX
        c.centerY = 0
        let r = MapFling(vx: -4000, vy: 0).step(c, seconds: 1.0 / 60)
        XCTAssertTrue(r.done)
        XCTAssertEqual(r.camera.centerX, MapCamera.panLimitX, accuracy: 1e-12)
    }

    func testDoubleTapAndDragZoomsUpForInAndBackForExactlyWhereYouWere() {
        XCTAssertEqual(MapDragZoom.factor(dy: 0), 1, accuracy: 1e-12)
        XCTAssertGreaterThan(MapDragZoom.factor(dy: -100), 1)
        XCTAssertLessThan(MapDragZoom.factor(dy: 100), 1)
        XCTAssertEqual(MapDragZoom.factor(dy: -60) * MapDragZoom.factor(dy: 60), 1, accuracy: 1e-12)
        // and it is always measured from the camera the gesture started at, so there and back is a round trip
        let c = camera()
        let out = c.zoomed(by: MapDragZoom.factor(dy: -80), aroundX: 100, y: 400)
        let back = c.zoomed(by: MapDragZoom.factor(dy: 0), aroundX: 100, y: 400)
        XCTAssertGreaterThan(out.scale, c.scale)
        XCTAssertEqual(back.scale, c.scale, accuracy: 1e-9)
    }

    func testAFingersWidthBecomesADistanceOnTheMap() {
        let c = camera()
        XCTAssertEqual(c.mapDistance(points: 22) * c.scale, 22, accuracy: 1e-9)
        XCTAssertGreaterThan(c.mapDistance(points: 22), 0)
    }

    func testTheVisibleBoxIsWhatTheScreenShows() {
        let c = camera()
        let v = c.visible
        XCTAssertEqual(v.centerX, c.centerX, accuracy: 1e-12)
        XCTAssertEqual(v.width * c.scale, c.width, accuracy: 1e-9)
        XCTAssertEqual(v.height * c.scale, c.height, accuracy: 1e-9)
    }
}

final class MapHitTests: XCTestCase {
    func testDistanceToAPieceOfLine() {
        XCTAssertEqual(MapHit.distanceToSegment(0, 1, -1, 0, 1, 0), 1, accuracy: 1e-12)
        // Past the end of the piece: the distance is to the end, not to the infinite line.
        XCTAssertEqual(MapHit.distanceToSegment(3, 0, -1, 0, 1, 0), 2, accuracy: 1e-12)
        XCTAssertEqual(MapHit.distanceToSegment(0, 0, 1, 1, 1, 1), 2.0.squareRoot(), accuracy: 1e-12)
    }

    func testDistanceToAWholeLine() {
        let line: [Double] = [0, 0, 10, 0, 10, 10]
        XCTAssertEqual(MapHit.distanceToPolyline(5, 2, line), 2, accuracy: 1e-12)
        XCTAssertEqual(MapHit.distanceToPolyline(12, 5, line), 2, accuracy: 1e-12)
        XCTAssertEqual(MapHit.distanceToPolyline(0, 0, [3, 4]), 5, accuracy: 1e-12, "a one-point line is that point")
        XCTAssertEqual(MapHit.distanceToPolyline(0, 0, []), .infinity)
    }

    /// The real thing this is for: a finger 22 points wide lands on a greenway stretch it is near, and not on one
    /// a block away. The tolerance is in points and is turned into map units by the camera.
    func testAFingerNearAStretchSelectsItAndAFingerAwayDoesNot() {
        let c = MapCamera.fitting([LatLon(lat: 42.32, lon: -83.08), LatLon(lat: 42.34, lon: -83.06)],
                                  width: 390, height: 700)
        let seg = testSegment(id: "seg_x", name: "Bagley", lines: [[[-83.076, 42.326], [-83.074, 42.3268]]])
        let line = MapFileDecoder.segmentLines(seg)[0]
        let tol = c.mapDistance(points: 22)
        let onIt = (x: MapProjection.x(lon: -83.075), y: MapProjection.y(lat: 42.3264))
        XCTAssertLessThan(MapHit.distanceToPolyline(onIt.x, onIt.y, line), tol)
        let away = (x: MapProjection.x(lon: -83.075), y: MapProjection.y(lat: 42.3330))
        XCTAssertGreaterThan(MapHit.distanceToPolyline(away.x, away.y, line), tol)
    }

    func testInsideAPark() {
        let square: [Double] = [0, 0, 4, 0, 4, 4, 0, 4]
        XCTAssertTrue(MapHit.inside(2, 2, ring: square))
        XCTAssertFalse(MapHit.inside(5, 2, ring: square))
        XCTAssertFalse(MapHit.inside(-1, -1, ring: square))
        XCTAssertFalse(MapHit.inside(0, 0, ring: [0, 0, 1, 1]), "two points are not a shape")
    }
}

final class MapLayerRuleTests: XCTestCase {
    private struct Row { var category: String; var lat: Double? }
    private func drawable(_ rows: [Row], _ tops: [String]) -> [String] {
        mapDrawable(rows, tops: tops, category: { $0.category }, hasPoint: { $0.lat != nil }).map(\.category)
    }

    /// The rule the whole tab hangs on. Treatment and help after sexual assault are never drawn, whatever is
    /// switched on; a DV shelter and a mental-health crisis line are dropped row by row inside their own group.
    func testTheListingsThatAreNeverADot() {
        let rows = [
            Row(category: "food.pantry", lat: 42.3),
            Row(category: "shelter.emergency", lat: 42.3),
            Row(category: "shelter.dv", lat: 42.3),
            Row(category: "shelter.dv.transitional", lat: 42.3),
            Row(category: "health.clinic", lat: 42.3),
            Row(category: "health.mental", lat: 42.3),
            Row(category: "health.mental.crisis", lat: 42.3),
            Row(category: "treatment.detox", lat: 42.3),
            Row(category: "treatment", lat: 42.3),
            Row(category: "assault", lat: 42.3),
            Row(category: "assault.advocacy", lat: 42.3),
            Row(category: "harm.supplies", lat: 42.3),
            Row(category: "food.meal", lat: nil),
        ]
        let everything = mapGroups.flatMap(\.tops)
        XCTAssertEqual(drawable(rows, everything).sorted(),
                       ["food.pantry", "harm.supplies", "health.clinic", "shelter.emergency"],
                       "a private kind, a sensitive row, or a row with no point must never be drawn")
    }

    /// A domestic-violence shelter publishes no address, and must never be on the map even if a coordinate turns
    /// up on the row anyway — from a bad merge, a future source, or a steward's mistake. The predicate refuses it
    /// on the category, never on whether a point happens to be there, and the whole tab (dots, the tap test and
    /// the map's own list) goes through this one function.
    func testADomesticViolenceRowIsNeverDrawnEvenWithACoordinate() {
        let rows = [Row(category: "shelter.dv", lat: 42.33),
                    Row(category: "shelter.dv.transitional", lat: 42.33),
                    Row(category: "health.mental", lat: 42.33),
                    Row(category: "shelter.emergency", lat: 42.33)]
        XCTAssertEqual(drawable(rows, ["shelter", "health"]), ["shelter.emergency"])
        XCTAssertTrue(isSensitive("shelter.dv"))
        XCTAssertFalse(canSave("shelter.dv"))
    }

    func testOnlySwitchedOnGroupsAreDrawn() {
        let rows = [Row(category: "food.pantry", lat: 42.3), Row(category: "jobs.find", lat: 42.3)]
        XCTAssertEqual(drawable(rows, ["food"]), ["food.pantry"])
        XCTAssertEqual(drawable(rows, []), [])
    }

    func testEveryTopLevelCategoryBelongsToExactlyOneGroup() {
        var seen: [String: Int] = [:]
        for g in mapGroups { for t in g.tops { seen[t, default: 0] += 1 } }
        XCTAssertTrue(seen.values.allSatisfy { $0 == 1 }, "a category in two groups would draw twice: \(seen)")
        for t in mapPrivateTops { XCTAssertNil(seen[t], "\(t) must not be in any layer at all") }
        XCTAssertEqual(mapGroupId(for: "harm.supplies"), "health")
        // Category audit, 2026-09-22: the same eight groups as the web, and nothing surprising in any of them.
        XCTAssertEqual(mapGroups.map(\.id), ["food", "shelter", "health", "rec", "work", "kids", "things", "paperwork"])
        XCTAssertEqual(mapGroupId(for: "connect"), "rec", "free computers sit with the libraries that offer them")
        XCTAssertEqual(mapGroupId(for: "youth"), "kids")
        XCTAssertEqual(mapGroupId(for: "kids.care"), "kids")
        XCTAssertEqual(mapGroups.first { $0.id == "things" }?.tops, ["goods", "hygiene", "pets"])
        XCTAssertEqual(mapGroupId(for: "nothing.like.this"), "")
    }

    func testDenseStopLayersWaitForTheZoom() {
        XCTAssertEqual(mapStopRadius(dense: true, metersPerPoint: 30), 0, "five thousand stops are a smear, not places")
        XCTAssertGreaterThan(mapStopRadius(dense: true, metersPerPoint: 8), 0)
        XCTAssertGreaterThan(mapStopRadius(dense: false, metersPerPoint: 30), 0, "twenty stations always draw")
        XCTAssertTrue(mapLayerStyle("go:ddot_stops").dense)
        XCTAssertFalse(mapLayerStyle("go:qline").dense)
        XCTAssertEqual(mapLayerStyle("go:intercity_bus").dash, [5, 3], "coaches are not a bus network")
        XCTAssertNotEqual(mapLayerStyle("go:intercity_bus").color, mapLayerStyle("go:ddot_routes").color)
    }

    func testStreetsAppearAsYouZoomIn() {
        XCTAssertEqual(mapStreetClassLimit(metersPerPoint: 40), 2, "far out: main roads only")
        XCTAssertEqual(mapStreetClassLimit(metersPerPoint: 5), 4)
        XCTAssertEqual(mapStreetLabelLimit(metersPerPoint: 40), 0)
        XCTAssertEqual(mapStreetLabelLimit(metersPerPoint: 3), 4)
        XCTAssertGreaterThan(mapStreetWidth(cls: 0, metersPerPoint: 5), mapStreetWidth(cls: 4, metersPerPoint: 5))
    }

    func testTheGreenwayIsDrawnLeastBuiltFirstAndEveryPhaseHasItsOwnDash() {
        XCTAssertEqual(greenwayPhaseOrder.last, "open", "an open stretch is never hidden under a dotted one")
        XCTAssertTrue(greenwayPhaseStyle("open").dash.isEmpty)
        let dashes = greenwayPhaseOrder.map { greenwayPhaseStyle($0).dash }
        XCTAssertEqual(Set(dashes.map(\.description)).count, greenwayPhaseOrder.count,
                       "phases must differ by dash, not only by colour (Differentiate Without Color)")
        XCTAssertEqual(Set(greenwayPhaseOrder.map { greenwayPhaseStyle($0).color }).count, greenwayPhaseOrder.count)
        XCTAssertTrue(greenwayShowsStations(metersPerPoint: 8))
        XCTAssertFalse(greenwayShowsStations(metersPerPoint: 40))
        XCTAssertGreaterThan(greenwayWidth(metersPerPoint: 2), greenwayWidth(metersPerPoint: 40))
    }

    func testAStretchIsReadSouthToNorth() {
        func seg(_ id: String, _ lat: Double) -> Segment {
            testSegment(id: id, lines: [[[-83.1, lat], [-83.1, lat + 0.01]]])
        }
        let order = greenwaySegmentsInReadingOrder([seg("north", 42.42), seg("south", 42.28), seg("middle", 42.35)])
        XCTAssertEqual(order.map(\.id), ["south", "middle", "north"])
        // Two stretches that start at the same latitude keep a settled order between launches.
        let tie = greenwaySegmentsInReadingOrder([seg("b", 42.3), seg("a", 42.3)])
        XCTAssertEqual(tie.map(\.id), ["a", "b"])
    }

    func testPlacesAreReadNearestFirst() {
        struct P { var name: String; var x: Double; var y: Double }
        let list = [P(name: "far", x: 10, y: 0), P(name: "near", x: 1, y: 0), P(name: "middle", x: 4, y: 0)]
        let order = placesInReadingOrder(list, fromX: 0, fromY: 0, x: { $0.x }, y: { $0.y }, tieBreak: { $0.name })
        XCTAssertEqual(order.map(\.name), ["near", "middle", "far"])
    }
}

final class MapLayerStoreTests: XCTestCase {
    private func tempDir() throws -> URL {
        let d = FileManager.default.temporaryDirectory.appendingPathComponent("maplayers-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    /// Navigation audit 2026-09-22, H2: the Map tab used to open with no help on it at all — the one tab named
    /// after the thing on it opened without the thing. All eight help groups and the parks now; the greenway
    /// and the bus routes are one tap away in the switcher (Kyle, 2026-09-22).
    func testAFirstOpenShowsEveryKindOfHelpAndTheParks() throws {
        let store = MapLayerStore(dir: try tempDir())
        XCTAssertEqual(store.on, defaultMapLayers)
        XCTAssertEqual(defaultMapLayers.count, 10)
        for group in mapGroups { XCTAssertTrue(store.isOn("help:" + group.id), "the Map tab opens with help on it") }
        XCTAssertTrue(store.isOn("place:parks"))
        // And the boundaries, since 2026-09-22: a neighbourhood edge is how somebody says where they live, and
        // it was the one thing on this tab a person could not reach without knowing the switcher existed.
        XCTAssertTrue(store.isOn(areasLayerId))
        XCTAssertFalse(store.isOn("place:greenway"))
        XCTAssertFalse(store.isOn("go:ddot_routes"))
        XCTAssertFalse(store.isOn("go:ddot_stops"))
    }

    func testTheChoiceIsRememberedOnThisPhoneAndNowhereElse() throws {
        let dir = try tempDir()
        let first = MapLayerStore(dir: dir)
        XCTAssertTrue(first.toggle("go:qline"))          // off by default: switching it on, and written down
        XCTAssertTrue(first.toggle("place:parks"))       // on by default: switching it off, and written down
        let again = MapLayerStore(dir: dir)
        XCTAssertTrue(again.isOn("go:qline"))
        XCTAssertFalse(again.isOn("place:parks"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: dir.appendingPathComponent("map-layers.json").path),
                      "the choice is a file in the app's own state directory, never UserDefaults")
    }

    func testAPhoneCanNeverAskForAnUnboundedNumberOfFiles() throws {
        let store = MapLayerStore(dir: try tempDir())
        store.set((0..<100).map { "go:layer\($0)" })
        XCTAssertEqual(store.on.count, 30)
        for i in 0..<60 { store.toggle("help:g\(i)") }
        XCTAssertLessThanOrEqual(store.on.count, 30)
    }
}
