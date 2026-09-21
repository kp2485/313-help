// The app's own street map, in numbers only: no UIKit, no SwiftUI, no CoreGraphics, so `swift test` runs all of
// it on Linux as well. The SwiftUI screen (HelpApp/MapCanvas.swift) does nothing but paint what is worked out here.
//
// 313 Help draws its own map (DECISIONS 2026-09-18, "The app draws its own street map from City of Detroit open
// data"). No tile server is ever contacted, no map company learns where a person is looking, and the map works
// with no signal at all: the streets, parks, city outlines and transport layers are files inside the **signed**
// bundle, checked against the signed index before a byte of them is decoded (HelpApp/BundleStore.mapFile).
//
// The shapes and the arithmetic are a port of apps/web/src/map.ts, so the two apps draw the same city: the same
// flat projection, the same encoding, the same zoom clamps, the same hit tolerances.
import DetroitQuery
import Foundation

// MARK: - where a point on the earth is on the map

/// A flat projection around Detroit: one unit is one degree of latitude, longitudes squeezed by the cosine of
/// Detroit's latitude. Good to a few metres across a city, and it costs nothing to compute on a cheap phone.
public enum MapProjection {
    public static let lon0 = -83.1
    public static let lat0 = 42.35
    public static let k = cos(lat0 * .pi / 180)
    /// Metres in one unit (one degree of latitude).
    public static let metersPerUnit = 111_320.0

    public static func x(lon: Double) -> Double { (lon - lon0) * k }
    public static func y(lat: Double) -> Double { lat0 - lat }
    public static func lon(x: Double) -> Double { x / k + lon0 }
    public static func lat(y: Double) -> Double { lat0 - y }
    public static func point(_ p: LatLon) -> (x: Double, y: Double) { (x(lon: p.lon), y(lat: p.lat)) }
}

/// A rectangle in map units. Everything drawn is clipped against one of these first, because a phone should not
/// walk a polyline it cannot see.
public struct MapBox: Equatable, Sendable {
    public var minX: Double, minY: Double, maxX: Double, maxY: Double
    public init(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        self.minX = minX; self.minY = minY; self.maxX = maxX; self.maxY = maxY
    }
    /// The box that loses to every other box in `union`, and touches nothing.
    public static let empty = MapBox(minX: .infinity, minY: .infinity, maxX: -.infinity, maxY: -.infinity)
    public var isEmpty: Bool { minX > maxX || minY > maxY }
    public var width: Double { maxX - minX }
    public var height: Double { maxY - minY }
    public var centerX: Double { (minX + maxX) / 2 }
    public var centerY: Double { (minY + maxY) / 2 }
    public func intersects(_ o: MapBox) -> Bool { minX <= o.maxX && maxX >= o.minX && minY <= o.maxY && maxY >= o.minY }
    public func contains(x: Double, y: Double) -> Bool { x >= minX && x <= maxX && y >= minY && y <= maxY }
    public func union(_ o: MapBox) -> MapBox {
        MapBox(minX: min(minX, o.minX), minY: min(minY, o.minY), maxX: max(maxX, o.maxX), maxY: max(maxY, o.maxY))
    }
    public func expanded(by d: Double) -> MapBox { MapBox(minX: minX - d, minY: minY - d, maxX: maxX + d, maxY: maxY + d) }
    /// The box around a flat run of x, y pairs.
    public static func around(_ pts: [Double]) -> MapBox {
        var b = MapBox.empty
        var i = 0
        while i + 1 < pts.count {
            b.minX = min(b.minX, pts[i]); b.maxX = max(b.maxX, pts[i])
            b.minY = min(b.minY, pts[i + 1]); b.maxY = max(b.maxY, pts[i + 1])
            i += 2
        }
        return b
    }
    public static func around(_ points: [LatLon]) -> MapBox {
        var b = MapBox.empty
        for p in points {
            let q = MapProjection.point(p)
            b.minX = min(b.minX, q.x); b.maxX = max(b.maxX, q.x)
            b.minY = min(b.minY, q.y); b.maxY = max(b.maxY, q.y)
        }
        return b
    }
}

// MARK: - what the map is made of

/// One drawn line: a street, a bus route, a bike lane. `points` is a flat run of x, y pairs in map units.
/// `cls` is the road class the City publishes: 0 is a freeway, 4 a residential street.
public struct MapLine: Equatable, Sendable {
    public var cls: Int
    public var name: String
    public var points: [Double]
    public var box: MapBox
    public init(cls: Int, name: String, points: [Double]) {
        self.cls = cls; self.name = name; self.points = points; self.box = MapBox.around(points)
    }
}

/// A closed shape: a park, or one ring of the city outline.
public struct MapArea: Equatable, Sendable {
    public var name: String
    public var points: [Double]
    public var box: MapBox
    public init(name: String, points: [Double]) {
        self.name = name; self.points = points; self.box = MapBox.around(points)
    }
}

/// One square of the street grid. The small streets are split into squares so that a zoomed-in map walks a few
/// hundred lines rather than forty thousand.
public struct MapCell: Equatable, Sendable {
    public var box: MapBox
    public var roads: [MapLine]
    public init(box: MapBox, roads: [MapLine]) { self.box = box; self.roads = roads }
}

/// A stop, a station, a dock: one named point on a switched-on layer.
public struct MapPoint: Equatable, Sendable {
    public var name: String
    public var x: Double
    public var y: Double
    public init(name: String, x: Double, y: Double) { self.name = name; self.x = x; self.y = y }
}

/// Everything `map/base.json` and `map/streets.json` carry, decoded once and kept in memory while the tab is open.
public struct BaseMap: Equatable, Sendable {
    public var roads: [MapLine]          // the big roads, at every zoom
    public var cells: [MapCell]          // the small streets, by square
    public var parks: [MapArea]
    public var boundary: [[Double]]      // the four cities' outlines, one flat x, y run per ring
    /// The day the City last edited the road layer. Shown under the map; never frozen at build time.
    public var edited: String
    public init(roads: [MapLine], cells: [MapCell], parks: [MapArea], boundary: [[Double]], edited: String) {
        self.roads = roads; self.cells = cells; self.parks = parks; self.boundary = boundary; self.edited = edited
    }
}

/// One switched-on transport layer's shapes (`map/transit/…`).
public struct MapLayerData: Equatable, Sendable {
    public var lines: [MapLine]
    public var points: [MapPoint]
    public init(lines: [MapLine], points: [MapPoint]) { self.lines = lines; self.points = points }
}

// MARK: - reading the files

/// The JSON in `map/*.json`, and how a run of deltas becomes a polyline. Every one of these files travels in the
/// signed bundle and is checked against the signed index's checksum before it reaches this code.
public enum MapFileDecoder {
    /// `[x0, y0, dx1, dy1, …]` in hundred-thousandths of a degree from `origin`, to a flat run of map x, y pairs.
    public static func polyline(_ enc: [Int], origin: [Double]) -> [Double] {
        guard origin.count >= 2 else { return [] }
        var out = [Double](); out.reserveCapacity(enc.count)
        var x = 0, y = 0
        var i = 0
        while i + 1 < enc.count {
            x += enc[i]; y += enc[i + 1]
            out.append(MapProjection.x(lon: origin[0] + Double(x) / 1e5))
            out.append(MapProjection.y(lat: origin[1] + Double(y) / 1e5))
            i += 2
        }
        return out
    }

    // The files hold arrays rather than objects, to keep the bundle small: [cls, nameIndex, deltas],
    // [nameIndex, deltas], [nameIndex, x, y]. A name index of -1 means "this one has no name".
    struct ClassedLine: Decodable {
        var cls: Int, name: Int, enc: [Int]
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            cls = try c.decode(Int.self); name = try c.decode(Int.self); enc = try c.decode([Int].self)
        }
    }
    struct NamedLine: Decodable {
        var name: Int, enc: [Int]
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            name = try c.decode(Int.self); enc = try c.decode([Int].self)
        }
    }
    struct NamedPoint: Decodable {
        var name: Int, x: Int, y: Int
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            name = try c.decode(Int.self); x = try c.decode(Int.self); y = try c.decode(Int.self)
        }
    }
    struct RoadFile: Decodable {
        var origin: [Double]
        var names: [String]
        var roads: [ClassedLine]
    }
    struct BaseFile: Decodable {
        struct Source: Decodable {
            struct Edited: Decodable { var roads: String }
            var lastEdited: Edited
            enum CodingKeys: String, CodingKey { case lastEdited = "last_edited" }
        }
        var source: Source
        var origin: [Double]
        var names: [String]
        var roads: [ClassedLine]
        var parkNames: [String]
        var parks: [NamedLine]
        var boundary: [[Int]]
        enum CodingKeys: String, CodingKey {
            case source, origin, names, roads, parks, boundary
            case parkNames = "park_names"
        }
    }
    struct StreetsFile: Decodable { var cells: [String: RoadFile] }
    struct LayerFile: Decodable {
        var origin: [Double]
        var names: [String]
        var lines: [NamedLine]?
        var points: [NamedPoint]?
    }

    private static func name(_ i: Int, _ names: [String]) -> String {
        i < 0 || i >= names.count ? "" : names[i]
    }
    private static func roads(_ f: RoadFile) -> [MapLine] {
        f.roads.map { MapLine(cls: $0.cls, name: name($0.name, f.names), points: polyline($0.enc, origin: f.origin)) }
    }

    /// The city: big roads, the small streets by square, parks, outlines. Slow enough (a third of a megabyte of
    /// JSON) that it is always decoded off the main actor.
    public static func baseMap(base: Data, streets: Data?) throws -> BaseMap {
        let dec = JSONDecoder()
        let b = try dec.decode(BaseFile.self, from: base)
        var cells: [MapCell] = []
        if let streets, let s = try? dec.decode(StreetsFile.self, from: streets) {
            // Sorted by key, so the same bundle always draws in the same order and a screenshot can be compared.
            for key in s.cells.keys.sorted() {
                let lines = roads(s.cells[key]!)
                cells.append(MapCell(box: lines.reduce(MapBox.empty) { $0.union($1.box) }, roads: lines))
            }
        }
        let big = RoadFile(origin: b.origin, names: b.names, roads: b.roads)
        return BaseMap(
            roads: roads(big),
            cells: cells,
            parks: b.parks.map { MapArea(name: name($0.name, b.parkNames), points: polyline($0.enc, origin: b.origin)) },
            boundary: b.boundary.map { polyline($0, origin: b.origin) },
            edited: b.source.lastEdited.roads)
    }

    /// One transport layer (`map/transit/ddot_routes.json` and the rest).
    public static func layer(_ data: Data) throws -> MapLayerData {
        let f = try JSONDecoder().decode(LayerFile.self, from: data)
        return MapLayerData(
            lines: (f.lines ?? []).map { MapLine(cls: 1, name: name($0.name, f.names), points: polyline($0.enc, origin: f.origin)) },
            points: (f.points ?? []).map {
                MapPoint(name: name($0.name, f.names),
                         x: MapProjection.x(lon: f.origin[0] + Double($0.x) / 1e5),
                         y: MapProjection.y(lat: f.origin[1] + Double($0.y) / 1e5))
            })
    }

    /// A greenway stretch's polylines of [lon, lat], projected once so that drawing and tapping never re-project.
    public static func segmentLines(_ segment: Segment) -> [[Double]] {
        segment.lines.map { line in
            var out = [Double](); out.reserveCapacity(line.count * 2)
            for p in line where p.count >= 2 {
                out.append(MapProjection.x(lon: p[0]))
                out.append(MapProjection.y(lat: p[1]))
            }
            return out
        }
    }
}

// MARK: - the camera

/// What part of the map the screen is showing. Everything is in SwiftUI points, never pixels: `scale` is points
/// per map unit, so `metersPerPoint` is what decides which streets and which stops are worth drawing.
public struct MapCamera: Equatable, Sendable {
    public var centerX: Double
    public var centerY: Double
    public var scale: Double
    public var width: Double
    public var height: Double

    public init(centerX: Double, centerY: Double, scale: Double, width: Double, height: Double) {
        self.centerX = centerX; self.centerY = centerY; self.scale = scale; self.width = width; self.height = height
    }

    /// 90 m per point zoomed out (the whole city on a phone), 0.6 m per point zoomed in (one doorway). The same
    /// two limits the web map uses, so neither app can be zoomed somewhere the other cannot follow.
    public static let minScale = MapProjection.metersPerUnit / 90
    public static let maxScale = MapProjection.metersPerUnit / 0.6
    /// Detroit and its neighbours sit well inside this; it stops a flung finger from losing the city entirely.
    public static let panLimitX = 0.25
    public static let panLimitY = 0.2

    public var metersPerPoint: Double { MapProjection.metersPerUnit / scale }
    public func screenX(_ x: Double) -> Double { (x - centerX) * scale + width / 2 }
    public func screenY(_ y: Double) -> Double { (y - centerY) * scale + height / 2 }
    public func mapX(_ sx: Double) -> Double { centerX + (sx - width / 2) / scale }
    public func mapY(_ sy: Double) -> Double { centerY + (sy - height / 2) / scale }
    /// A distance on the screen, in map units: how a 44-point finger becomes a tolerance the geometry understands.
    public func mapDistance(points: Double) -> Double { points / scale }

    public var visible: MapBox {
        MapBox(minX: centerX - width / 2 / scale, minY: centerY - height / 2 / scale,
               maxX: centerX + width / 2 / scale, maxY: centerY + height / 2 / scale)
    }

    /// Zoom about a point on the screen, so what is under the fingers stays under the fingers.
    public func zoomed(by factor: Double, aroundX px: Double, y py: Double) -> MapCamera {
        var c = self
        let s = max(Self.minScale, min(Self.maxScale, scale * factor))
        let X = centerX + (px - width / 2) / scale, Y = centerY + (py - height / 2) / scale
        c.scale = s
        c.centerX = X - (px - width / 2) / s
        c.centerY = Y - (py - height / 2) / s
        return c.clamped()
    }
    public func zoomed(by factor: Double) -> MapCamera { zoomed(by: factor, aroundX: width / 2, y: height / 2) }

    /// Drag: the map follows the finger, which is the opposite sign to the centre moving.
    public func panned(dx: Double, dy: Double) -> MapCamera {
        var c = self
        c.centerX = centerX - dx / scale
        c.centerY = centerY - dy / scale
        return c.clamped()
    }

    public func clamped() -> MapCamera {
        var c = self
        c.scale = max(Self.minScale, min(Self.maxScale, scale))
        c.centerX = max(-Self.panLimitX, min(Self.panLimitX, centerX))
        c.centerY = max(-Self.panLimitY, min(Self.panLimitY, centerY))
        return c
    }

    public func resized(width: Double, height: Double) -> MapCamera {
        var c = self; c.width = width; c.height = height; return c
    }

    /// The opening view: at least these points on the screen, never closer than `minMeters` across. `cover` fills
    /// the box instead of fitting inside it — the wide city on a tall phone, as on the web's Map tab.
    public static func fitting(_ points: [LatLon], width: Double, height: Double,
                               minMeters: Double = 500, cover: Bool = false) -> MapCamera {
        guard width > 0, height > 0, !points.isEmpty else {
            return MapCamera(centerX: 0, centerY: 0, scale: minScale, width: max(width, 1), height: max(height, 1)).clamped()
        }
        let box = MapBox.around(points)
        let least = minMeters / MapProjection.metersPerUnit
        let spanX = max(box.width, least) * 1.18, spanY = max(box.height, least) * 1.18
        let fit = cover ? max(width / spanX, height / spanY) : min(width / spanX, height / spanY)
        return MapCamera(centerX: box.centerX, centerY: box.centerY, scale: fit, width: width, height: height).clamped()
    }

    /// One step of a two-finger gesture: zoom about where the fingers' middle WAS, then follow it to where it is
    /// NOW. In that order, the map point under the middle when the gesture began stays under it however the hand
    /// spreads and slides — which is what makes panning DURING a pinch feel like one gesture and not two. The web
    /// map composes the same two steps in the same order (`pinchCam` in apps/web/src/map.ts).
    public func pinched(by factor: Double, fromX ax: Double, y ay: Double, toX bx: Double, y by: Double) -> MapCamera {
        zoomed(by: factor, aroundX: ax, y: ay).panned(dx: bx - ax, dy: by - ay)
    }
}

// MARK: - momentum

/// What is left of a drag after the finger has gone. Points per second, decaying towards nothing; the camera's
/// own pan limits are what stop it, so a flick can never throw the map off the city.
public struct MapFling: Equatable, Sendable {
    /// e-foldings per second: about a second of carry, the same feel as the web map's `FLING_K` per millisecond.
    public static let decay = 3.5
    /// Below this the map has stopped, whatever the arithmetic says.
    public static let stopSpeed = 20.0
    /// A drag slower than this at the moment it ended never meant to throw anything.
    public static let startSpeed = 350.0

    public var vx: Double
    public var vy: Double
    public init(vx: Double, vy: Double) { self.vx = vx; self.vy = vy }

    public var speed: Double { (vx * vx + vy * vy).squareRoot() }
    public var worthStarting: Bool { speed >= Self.startSpeed }

    /// One frame: where the camera goes, what is left of the speed, and whether that was the last of it.
    public func step(_ camera: MapCamera, seconds dt: Double) -> (camera: MapCamera, fling: MapFling, done: Bool) {
        let next = camera.panned(dx: vx * dt, dy: vy * dt)
        let left = MapFling(vx: vx * exp(-Self.decay * dt), vy: vy * exp(-Self.decay * dt))
        let stuck = next.centerX == camera.centerX && next.centerY == camera.centerY
        return (next, left, stuck || left.speed < Self.stopSpeed)
    }
}

/// Double tap and hold, then drag: up zooms in, down zooms out, about the tap. The factor is measured against the
/// scale the gesture started at, never the last frame, so dragging back puts the map exactly where it was.
public enum MapDragZoom {
    public static let pointsPerE = 140.0
    public static func factor(dy: Double) -> Double { exp(-dy / pointsPerE) }
}

// MARK: - tapping

/// Distances and insideness, all in map units. The screen converts a finger's 44 points into a tolerance with
/// `MapCamera.mapDistance(points:)` and asks these; nothing here knows what a pixel is.
public enum MapHit {
    /// Distance from a point to one piece of a line.
    public static func distanceToSegment(_ px: Double, _ py: Double,
                                         _ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double {
        let dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
        let t = len2 == 0 ? 0 : max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        return ((px - ax - t * dx) * (px - ax - t * dx) + (py - ay - t * dy) * (py - ay - t * dy)).squareRoot()
    }

    /// Distance from a point to a flat run of x, y pairs. A one-point "line" is just that point.
    public static func distanceToPolyline(_ px: Double, _ py: Double, _ pts: [Double]) -> Double {
        guard pts.count >= 2 else { return .infinity }
        if pts.count == 2 { return ((px - pts[0]) * (px - pts[0]) + (py - pts[1]) * (py - pts[1])).squareRoot() }
        var best = Double.infinity
        var i = 0
        while i + 3 < pts.count {
            best = min(best, distanceToSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]))
            i += 2
        }
        return best
    }

    /// Ray casting: is the point inside this ring?
    public static func inside(_ px: Double, _ py: Double, ring: [Double]) -> Bool {
        var hit = false
        let n = ring.count
        guard n >= 6 else { return false }
        var i = 0, j = n - 2
        while i < n - 1 {
            let xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1]
            if (yi > py) != (yj > py), px < (xj - xi) * (py - yi) / (yj - yi) + xi { hit.toggle() }
            j = i; i += 2
        }
        return hit
    }
}
