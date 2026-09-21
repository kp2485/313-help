// The two map styles (docs/MAP-STYLE.md), held to the spec's own tables and to the real files in the bundle.
// Plain numbers throughout, so this runs on Linux in CI.
import DetroitQuery
import Foundation
@testable import HelpCore
import XCTest

private let transitDir = repoRoot.appendingPathComponent("data/bundle/v1/map/transit")
private func shipped(_ name: String) throws -> Data {
    let url = transitDir.appendingPathComponent(name)
    try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "no built bundle here (pnpm build:bundle)")
    return try Data(contentsOf: url)
}

// MARK: - the choice, and where it is kept

final class MapStyleChoiceTests: XCTestCase {
    func testAnythingButSubwayIsStandard() {
        XCTAssertEqual(mapStyle(nil), .standard)
        XCTAssertEqual(mapStyle(""), .standard)
        XCTAssertEqual(mapStyle("Subway"), .standard)
        XCTAssertEqual(mapStyle("metro"), .standard)
        XCTAssertEqual(mapStyle("standard"), .standard)
        XCTAssertEqual(mapStyle("subway"), .subway)
    }

    private func tempDir() throws -> URL {
        let d = FileManager.default.temporaryDirectory.appendingPathComponent("mapstyle-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    func testTheStyleIsRememberedInTheSameFileAsTheLayers() throws {
        let dir = try tempDir()
        let first = MapLayerStore(dir: dir)
        XCTAssertEqual(first.style, .standard, "standard is the default")
        XCTAssertTrue(first.setStyle(.subway))
        XCTAssertTrue(first.toggle("go:qline"))
        let again = MapLayerStore(dir: dir)
        XCTAssertEqual(again.style, .subway)
        XCTAssertTrue(again.isOn("go:qline"))
        XCTAssertTrue(again.setStyle(.standard))
        XCTAssertEqual(MapLayerStore(dir: dir).style, .standard)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: dir.path), ["map-layers.json"],
                       "one file, the same one the layer choices are in")
    }

    /// Yesterday's file was a bare list of layer ids. It still reads, and the style is then `standard`.
    func testYesterdaysFileStillReads() throws {
        let dir = try tempDir()
        try Data(#"["go:mogo","place:parks"]"#.utf8).write(to: dir.appendingPathComponent("map-layers.json"))
        let store = MapLayerStore(dir: dir)
        XCTAssertEqual(store.on, ["go:mogo", "place:parks"])
        XCTAssertEqual(store.style, .standard)
    }

    func testAStyleNobodyKnowsReadsAsStandard() throws {
        let dir = try tempDir()
        try Data(#"{"on":["go:mogo"],"style":"neon"}"#.utf8).write(to: dir.appendingPathComponent("map-layers.json"))
        let store = MapLayerStore(dir: dir)
        XCTAssertEqual(store.style, .standard)
        XCTAssertEqual(store.on, ["go:mogo"])
    }
}

// MARK: - standard is untouched

final class StandardStyleTests: XCTestCase {
    /// Section 2 of the spec, written out. If this table moves, `standard` has changed, and it must not.
    private let table: [(id: String, color: String, width: Double, dash: [Double], ring: Bool, dense: Bool)] = [
        ("ddot_routes", "bus", 3.2, [], false, false), ("ddot_stops", "bus", 5, [], false, true),
        ("smart_routes", "smart", 2.8, [3, 2], false, false), ("smart_stops", "smart", 5, [], false, true),
        ("qline", "rail", 4, [], true, false), ("people_mover", "rail", 3.4, [], true, false),
        ("mogo", "bike", 5, [], true, false), ("bike_lanes", "bike", 2.4, [], false, false),
        ("stations", "rail", 5, [], true, false), ("intercity_bus", "rail", 2.6, [5, 3], true, false),
        ("park_ride", "smart", 5, [], true, false),
    ]

    func testTheStandardTableIsWhatItWas() {
        XCTAssertEqual(mapLayerStyles.count, table.count)
        for t in table {
            let s = mapLayerStyle("go:" + t.id)
            XCTAssertEqual(s, MapLayerStyle(color: t.color, width: t.width, dash: t.dash, ring: t.ring, dense: t.dense), t.id)
        }
    }

    /// The resolver's `standard` answer is the old table and the old two functions — whatever route, band, colour
    /// scheme or contrast setting it is handed. It reads none of them.
    func testTheStandardResolverIsTheOldDrawingAndReadsNothingElse() {
        let route = NetRoute(id: "rt_x", short: "4", long: "Woodward", tone: 3, frequent: true)
        for t in table {
            for mpp in [0.6, 3, 6, 11.9, 12, 12.1, 18, 30, 45, 90] {
                let s = mapLayerStyle("go:" + t.id)
                let want = ResolvedTransit.standard(StandardDrawing(
                    style: s, lineWidth: max(1.6, min(t.width, t.width * 18 / mpp)),
                    stopRadius: t.dense ? (mpp > 12 ? 0 : max(2, min(4, 30 / mpp))) : max(3.5, min(6.5, 45 / mpp))))
                for r in [nil, route] {
                    for scheme in MapScheme.allCases {
                        for more in [false, true] {
                            for band in ZoomBand.allCases {
                                let got = resolveTransitStyle(TransitStyleInput(style: .standard, layer: t.id, route: r, metersPerPoint: mpp,
                                                                                band: band, scheme: scheme, increasedContrast: more))
                                XCTAssertEqual(got, want, "\(t.id) at \(mpp)")
                            }
                        }
                    }
                }
            }
        }
    }

    /// `standard` never asks for a network file, whatever is switched on or selected.
    func testStandardNeverAsksForANetFile() {
        let available = ["ddot_routes": "map/transit/ddot_routes.net.json", "ddot_stops": "map/transit/ddot_stops.net.json",
                         "qline": "map/transit/qline.net.json"]
        let everything = available.keys.map { "go:" + $0 }
        XCTAssertTrue(netFilesWanted(style: .standard, layersOn: everything, available: available).isEmpty)
        XCTAssertTrue(netFilesWanted(style: .standard, layersOn: everything, available: available, alsoStopsOf: "ddot_stops").isEmpty)
        XCTAssertEqual(netFilesWanted(style: .subway, layersOn: ["go:qline"], available: available), ["qline": "map/transit/qline.net.json"])
        XCTAssertEqual(netFilesWanted(style: .subway, layersOn: ["go:ddot_routes"], available: available, alsoStopsOf: "ddot_stops").count, 2)
        XCTAssertTrue(netFilesWanted(style: .subway, layersOn: everything, available: [:]).isEmpty, "an old bundle has nothing to ask for")
    }

    func testTheBasemapIsQuietOnlyInSubwayAndNeverWithIncreaseContrast() {
        XCTAssertEqual(basemapTokens(style: .standard, networkOn: true, increasedContrast: false), .normal)
        XCTAssertEqual(basemapTokens(style: .subway, networkOn: false, increasedContrast: false), .normal)
        XCTAssertEqual(basemapTokens(style: .subway, networkOn: true, increasedContrast: false), .quiet)
        XCTAssertEqual(basemapTokens(style: .subway, networkOn: true, increasedContrast: true), .normal)
    }
}

// MARK: - zoom bands

final class ZoomBandTests: XCTestCase {
    func testTheEdgesAreThirtyAndTwelve() {
        XCTAssertEqual(zoomBand(metersPerPoint: 90), .far)
        XCTAssertEqual(zoomBand(metersPerPoint: 30.01), .far)
        XCTAssertEqual(zoomBand(metersPerPoint: 30), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 12.01), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 12), .near, "12 is where standard's dense stops appear")
        XCTAssertEqual(zoomBand(metersPerPoint: 0.6), .near)
    }

    func testABandChangesOnlyFivePercentPastAnEdge() {
        XCTAssertEqual(zoomBand(metersPerPoint: 31, previous: .mid), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 31.6, previous: .mid), .far)
        XCTAssertEqual(zoomBand(metersPerPoint: 29, previous: .far), .far)
        XCTAssertEqual(zoomBand(metersPerPoint: 28.4, previous: .far), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 12.5, previous: .near), .near)
        XCTAssertEqual(zoomBand(metersPerPoint: 12.7, previous: .near), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 11.5, previous: .mid), .mid)
        XCTAssertEqual(zoomBand(metersPerPoint: 11.3, previous: .mid), .near)
        XCTAssertEqual(zoomBand(metersPerPoint: 5, previous: .far), .near, "a jump across two bands lands where it should")
        XCTAssertEqual(zoomBand(metersPerPoint: 60, previous: .near), .far)
    }

    func testAPinchHoveringOnAnEdgeDoesNotFlicker() {
        var band = zoomBand(metersPerPoint: 29)
        var changes = 0
        for i in 0..<40 {
            let next = zoomBand(metersPerPoint: i % 2 == 0 ? 30.4 : 29.6, previous: band)
            if next != band { changes += 1; band = next }
        }
        XCTAssertEqual(changes, 0)
    }
}

// MARK: - the palette, measured

final class TransitPaletteTests: XCTestCase {
    /// docs/MAP-STYLE.md table 4.1, as printed: light hex, vs land / park / casing, then dark the same.
    private let spec: [(TransitToken, String, [Double], String, [Double])] = [
        (.tr0, "#c8102e", [5.56, 4.25, 5.88], "#ff7a70", [6.67, 4.85, 7.52]),
        (.tr1, "#1d4ed8", [6.33, 4.84, 6.70], "#7aa7ff", [7.10, 5.16, 8.00]),
        (.tr2, "#0f766e", [5.17, 3.96, 5.47], "#4fd1c5", [9.08, 6.61, 10.24]),
        (.tr3, "#8a4b14", [6.40, 4.90, 6.78], "#e0a96d", [8.12, 5.91, 9.16]),
        (.tr4, "#be185d", [5.70, 4.36, 6.04], "#ff8ac2", [7.80, 5.67, 8.79]),
        (.tr5, "#475569", [7.16, 5.48, 7.58], "#b6c2d2", [9.39, 6.83, 10.58]),
        (.rail, "#1f2937", [13.87, 10.61, 14.68], "#eef2f6", [15.06, 10.95, 16.98]),
        (.dpm, "#86198f", [7.78, 5.95, 8.24], "#e59bf0", [8.29, 6.03, 9.35]),
        (.trunk, "#334155", [9.78, 7.48, 10.35], "#cbd5e1", [11.41, 8.30, 12.87]),
        (.bike, "#15803d", [4.74, 3.63, 5.02], "#6ee7a0", [10.97, 7.98, 12.37]),
        (.coach, "#7c2d12", [8.85, 6.77, 9.37], "#fdba74", [10.04, 7.31, 11.33]),
        (.pr, "#1e40af", [8.24, 6.30, 8.72], "#93b4ff", [8.24, 5.99, 9.29]),
        (.ring, "#1b2a22", [14.16, 10.83, 14.99], "#eef5f0", [15.29, 11.12, 17.24]),
    ]

    func testContrastIsTheWCAGFormula() {
        XCTAssertEqual(RGB.contrast(RGB(0x000000), RGB(0xFFFFFF)), 21, accuracy: 1e-9)
        XCTAssertEqual(RGB.contrast(RGB(0x777777), RGB(0x777777)), 1, accuracy: 1e-9)
        XCTAssertEqual(RGB(0x1D4ED8).hex, "#1d4ed8")
    }

    func testEveryRatioInTheSpecsTableIsTheRatioOfThePalette() {
        for (token, lightHex, light, darkHex, dark) in spec {
            for (scheme, hex, want) in [(MapScheme.light, lightHex, light), (.dark, darkHex, dark)] {
                let c = TransitPalette.color(token, scheme: scheme)
                XCTAssertEqual(c.hex, hex, "\(token) \(scheme)")
                let against = [TransitPalette.land(scheme), TransitPalette.park(scheme), TransitPalette.casing(scheme)]
                for (bg, w) in zip(against, want) {
                    let got = RGB.contrast(c, bg)
                    XCTAssertEqual(got, w, accuracy: 0.0051, "\(token) \(scheme) on \(bg.hex)")
                    XCTAssertGreaterThanOrEqual(got, 3, "the floor is 3:1 everywhere")
                }
            }
        }
        // The fill is the casing on purpose; a station is read by its ring.
        for s in MapScheme.allCases { XCTAssertEqual(TransitPalette.color(.fill, scheme: s), TransitPalette.casing(s)) }
    }

    func testIncreaseContrastTonesAreTheSpecs() {
        let more: [(TransitToken, String, Double, String, Double)] = [
            (.tr0, "#9b0c23", 8.50, "#ffa099", 9.49), (.tr1, "#1e3a8a", 10.36, "#a8c5ff", 10.69),
            (.tr2, "#0b4f4a", 9.41, "#8be6dd", 12.78), (.tr3, "#5f330d", 10.68, "#f0c596", 11.60),
            (.tr4, "#831843", 9.65, "#ffb3d7", 11.21), (.tr5, "#1e293b", 14.63, "#dbe3ee", 14.35),
            (.dpm, "#581c5f", 12.03, "#f0c0f7", 12.01), (.bike, "#14532d", 9.11, "#a7f3c5", 14.38),
        ]
        for (token, lh, lr, dh, dr) in more {
            let l = TransitPalette.color(token, scheme: .light, increasedContrast: true)
            let d = TransitPalette.color(token, scheme: .dark, increasedContrast: true)
            XCTAssertEqual(l.hex, lh); XCTAssertEqual(d.hex, dh)
            XCTAssertEqual(RGB.contrast(l, TransitPalette.landMoreContrast(.light)), lr, accuracy: 0.0051, "\(token)")
            XCTAssertEqual(RGB.contrast(d, TransitPalette.landMoreContrast(.dark)), dr, accuracy: 0.0051, "\(token)")
        }
        // "Others keep their values (all already ≥ 8)".
        for token in [TransitToken.rail, .trunk, .coach, .pr, .ring] {
            for s in MapScheme.allCases {
                XCTAssertEqual(TransitPalette.color(token, scheme: s, increasedContrast: true), TransitPalette.color(token, scheme: s))
                XCTAssertGreaterThanOrEqual(RGB.contrast(TransitPalette.color(token, scheme: s), TransitPalette.landMoreContrast(s)), 8)
            }
        }
    }

    func testTheQuietBasemapKeepsEveryStreetLegal() {
        let l = QuietBasemap.tokens(.light), d = QuietBasemap.tokens(.dark)
        let rows: [(RGB, RGB, Double)] = [
            (l.road, TransitPalette.land(.light), 3.36), (d.road, TransitPalette.land(.dark), 3.49),
            (l.main, TransitPalette.land(.light), 3.55), (d.main, TransitPalette.land(.dark), 3.81),
            (l.freeway, TransitPalette.land(.light), 3.39), (d.freeway, TransitPalette.land(.dark), 3.50),
            // … and against the quiet PARK as well (2.78 / 2.81 / 2.75 / 2.81 before the road tokens moved, 2026-09-21).
            (l.road, l.park, 3.05), (l.main, l.park, 3.21), (l.freeway, l.park, 3.07),
            (d.road, d.park, 3.05), (d.main, d.park, 3.32), (d.freeway, d.park, 3.06),
            (l.ink, TransitPalette.land(.light), 5.60), (d.ink, TransitPalette.land(.dark), 7.66),
            (l.parkInk, l.park, 5.26), (d.parkInk, d.park, 6.18),
            // The casing is what separates a line from a street, all the way along.
            (TransitPalette.casing(.light), l.road, 3.56), (TransitPalette.casing(.light), l.main, 3.75), (TransitPalette.casing(.light), l.freeway, 3.59),
            (TransitPalette.casing(.dark), d.road, 3.93), (TransitPalette.casing(.dark), d.main, 4.29), (TransitPalette.casing(.dark), d.freeway, 3.95),
        ]
        for (a, b, want) in rows {
            XCTAssertEqual(RGB.contrast(a, b), want, accuracy: 0.0051, "\(a.hex) on \(b.hex)")
            XCTAssertGreaterThanOrEqual(RGB.contrast(a, b), 3)
        }
        // "Every transit token is ≥ 4.29 against --map-park-q (light) and ≥ 5.82 (dark)."
        let tokens = TransitToken.allCases.filter { $0 != .fill }
        XCTAssertEqual(tokens.map { RGB.contrast(TransitPalette.color($0, scheme: .light), l.park) }.min()!, 4.29, accuracy: 0.0051)
        XCTAssertEqual(tokens.map { RGB.contrast(TransitPalette.color($0, scheme: .dark), d.park) }.min()!, 5.82, accuracy: 0.0051)
    }

    func testBadgeWordsAreReadableOnEveryTone() {
        for s in MapScheme.allCases {
            for t in [TransitToken.tr0, .tr1, .tr2, .tr3, .tr4, .tr5, .rail, .dpm, .trunk] {
                for more in [false, true] {
                    XCTAssertGreaterThanOrEqual(
                        RGB.contrast(TransitPalette.badgeText(scheme: s), TransitPalette.color(t, scheme: s, increasedContrast: more)), 4.5, "\(t) \(s)")
                }
            }
        }
        XCTAssertEqual(RGB.contrast(TransitPalette.badgeText(scheme: .light), TransitPalette.color(.tr2, scheme: .light)), 5.47, accuracy: 0.0051)
        XCTAssertEqual(RGB.contrast(TransitPalette.badgeText(scheme: .dark), TransitPalette.color(.tr0, scheme: .dark)), 7.52, accuracy: 0.0051)
    }
}

// MARK: - the subway resolver

final class SubwayStyleTests: XCTestCase {
    private func subway(_ layer: String, _ route: NetRoute? = nil, _ band: ZoomBand, more: Bool = false, scheme: MapScheme = .light) -> SubwayDrawing {
        guard case .subway(let d) = resolveTransitStyle(TransitStyleInput(style: .subway, layer: layer, route: route, metersPerPoint: 10,
                                                                          band: band, scheme: scheme, increasedContrast: more)) else {
            XCTFail("not a subway drawing"); return SubwayDrawing()
        }
        return d
    }
    private let woodward = NetRoute(id: "rt_ddot_4", short: "4", long: "Woodward", tone: 3, frequent: true, headway: 12)
    private let vernor = NetRoute(id: "rt_ddot_1", short: "1", long: "Vernor", tone: 0)
    private let fast = NetRoute(id: "rt_smart_461", short: "461", long: "FAST Woodward", tone: 1, color: "#ce2a2a", frequent: true)

    func testWidthsAreTable71() {
        let want: [(SubwayLineKind, [Double])] = [(.busFrequent, [3.5, 5, 6]), (.busLocal, [2.5, 3.5, 4.5]), (.rail, [4.5, 6, 7]), (.trunk, [5.5, 8, 10])]
        for (kind, w) in want { XCTAssertEqual(ZoomBand.allCases.map { subwayLineWidth(kind, band: $0) }, w) }
        XCTAssertEqual(ZoomBand.allCases.map { subwayCasing(band: $0) }, [2, 3, 4])
        XCTAssertEqual(ZoomBand.allCases.map { subwayCasing(band: $0, increasedContrast: true) }, [3, 4, 5])
        XCTAssertEqual(ZoomBand.allCases.map { subwayStep(band: $0) }, [0, 6.5, 8], "far: every off is read as 0")
        XCTAssertEqual(ZoomBand.allCases.map { subwayCornerRadius(band: $0) }, [6, 10, 14])
        XCTAssertEqual(ZoomBand.allCases.map { subwaySimplifyMeters(band: $0) }, [30, 10, 0])
        XCTAssertEqual(ZoomBand.allCases.map { subwayBadgeSpacingMeters(band: $0) }, [8000, 3000, 1200])
    }

    func testABusRouteWearsTheToneTheDataGivesItNotTheAgencysColour() {
        let d = subway("ddot_routes", woodward, .mid)
        XCTAssertEqual(d.stroke, .tr3)
        XCTAssertEqual(d.strokeRGB?.hex, "#8a4b14")
        XCTAssertEqual(d.width, 5); XCTAssertEqual(d.casing, .fill); XCTAssertEqual(d.casingWidth, 8)
        XCTAssertNil(d.inlay, "DDOT is a solid line")
        XCTAssertEqual(subway("ddot_routes", vernor, .mid).width, 3.5)
        XCTAssertEqual(subway("ddot_routes", vernor, .mid).stroke, .tr0)
        // SMART publishes #ce2a2a for this route; it is carried and not drawn.
        XCTAssertEqual(subway("smart_routes", fast, .mid).strokeRGB?.hex, "#1d4ed8")
        XCTAssertEqual(subway("ddot_routes", woodward, .mid, scheme: .dark).strokeRGB?.hex, "#e0a96d")
        XCTAssertEqual(subway("ddot_routes", woodward, .mid, more: true).strokeRGB?.hex, "#5f330d")
        XCTAssertEqual(subway("ddot_routes", woodward, .mid, more: true).casingWidth, 9, "Increase Contrast: casing + 1")
    }

    /// Differentiate Without Color: every system differs by shape as well as by colour.
    func testEverySystemHasAShapeOfItsOwn() {
        XCTAssertEqual(subway("smart_routes", fast, .mid).inlay, .stripe(width: 5.0 / 3))
        XCTAssertNil(subway("smart_routes", fast, .far).inlay, "at far SMART is solid")
        XCTAssertEqual(subway("qline", nil, .mid).inlay, .ties(width: 3, dash: [1.2 * 6, 1.8 * 6]))
        XCTAssertEqual(subway("qline", nil, .far).inlay, .ties(width: 1.5, dash: [1.2 * 4.5, 1.8 * 4.5]))
        XCTAssertEqual(subway("people_mover", nil, .mid).inlay, .chevrons(every: 90, arm: 5, width: 1.75))
        XCTAssertEqual(subway("people_mover", nil, .near).inlay, .chevrons(every: 120, arm: 5, width: 1.75))
        XCTAssertNil(subway("people_mover", nil, .far).inlay)
        XCTAssertEqual(subway("bike_lanes", nil, .mid).inlay, .double(gap: 2))
        XCTAssertEqual(subway("bike_lanes", nil, .near).width, 1.5)
        XCTAssertNil(subway("bike_lanes", nil, .far).inlay, "one 1.5 point line at far")
        XCTAssertNil(subway("bike_lanes", nil, .mid).casing, "bike lanes have no casing")
        XCTAssertNil(subway("bike_lanes", nil, .mid).badge, "and are never badged")
    }

    func testMarkers() {
        XCTAssertEqual(subway("mogo", nil, .mid).marker, .dock(size: 9, corner: 2.5, ring: 1.5, dot: 1.5))
        XCTAssertEqual(subway("mogo", nil, .near).marker, .dock(size: 11, corner: 2.5, ring: 1.5, dot: 1.5))
        XCTAssertEqual(subway("stations", nil, .near).marker, .railStation(size: 13, corner: 1.5, ring: 2.5, barWidth: 7, barHeight: 2))
        XCTAssertEqual(subway("intercity_bus", nil, .mid).marker, .coach(across: 10, ring: 2, dash: [3, 2]))
        XCTAssertEqual(subway("park_ride", nil, .mid).marker, .parking(size: 14, corner: 3, letter: 10))
        XCTAssertEqual(subway("ddot_stops", nil, .near).marker, .station(radius: 3, ring: 1.5))
        XCTAssertEqual(subway("ddot_stops", nil, .near).markerFrom, .near)
        XCTAssertEqual(subway("qline", nil, .mid).marker, .station(radius: 4.5, ring: 2))
        XCTAssertEqual(subway("qline", nil, .mid, more: true).marker, .station(radius: 4.5, ring: 2.5), "Increase Contrast: rings + 0.5")
        XCTAssertEqual(subway("stations", nil, .mid).stroke, .rail)
        XCTAssertEqual(subway("intercity_bus", nil, .mid).stroke, .coach)
        XCTAssertEqual(subway("park_ride", nil, .mid).stroke, .pr)
        XCTAssertEqual(subway("mogo", nil, .mid).stroke, .bike)
    }

    func testBadges() {
        XCTAssertEqual(subway("ddot_routes", woodward, .mid).badge, TransitBadge(text: "4", fill: .tr3, height: 16, fontSize: 11))
        XCTAssertEqual(subway("ddot_routes", woodward, .near).badge, TransitBadge(text: "4", fill: .tr3, height: 18, fontSize: 12))
        XCTAssertEqual(subway("smart_routes", fast, .mid).badge?.text, "461")
        XCTAssertEqual(subway("smart_routes", fast, .near).badge?.text, "FAST 461")
        // Far: rail and frequent routes only.
        XCTAssertTrue(subway("ddot_routes", woodward, .far).badgeShown)
        XCTAssertFalse(subway("ddot_routes", vernor, .far).badgeShown)
        XCTAssertTrue(subway("ddot_routes", vernor, .mid).badgeShown)
        let q = NetRoute(id: "rt_qline", short: "QLINE", long: "QLINE", tone: 0, derived: true)
        XCTAssertTrue(subway("qline", q, .far).badgeShown)
        XCTAssertEqual(subway("qline", q, .far).badge?.fill, .rail)
        XCTAssertEqual(q.label, "QLINE")
        XCTAssertEqual(woodward.label, "4 Woodward")
        XCTAssertEqual(badgeText(layer: "ddot_routes", route: NetRoute(id: "x", short: "", long: "Crosstown Express", tone: 0), band: .mid), "Crosstown ")
        XCTAssertEqual(trunkBadgeText(["3", "4", "16"]), "3 · 4 · 16")
        XCTAssertEqual(trunkBadgeText(["3", "4", "16", "23", "29", "42", "5", "6", "7", "8", "9", "10", "11"]), "3 · 4 · 16 · 23 · 29 · 42 +7")
        XCTAssertEqual(badgeWidth(textWidth: 6, height: 16), 16, "never narrower than it is tall")
        XCTAssertEqual(badgeWidth(textWidth: 30, height: 16), 40)
        XCTAssertEqual(subwayTextScale(0.8), 1); XCTAssertEqual(subwayTextScale(1.3), 1.3); XCTAssertEqual(subwayTextScale(3), 1.5)
    }

    func testWhatIsDrawnAtWhichZoom() {
        let far = stationsFor(band: .far, metersPerPoint: 60, hasSelection: true)
        XCTAssertTrue(far.hubs)
        XCTAssertFalse(far.terminals || far.railStations || far.markers || far.stops || far.selectedStops)
        XCTAssertEqual(far.interchangeMinRoutes, 0)
        let mid = stationsFor(band: .mid, metersPerPoint: 20, hasSelection: false)
        XCTAssertTrue(mid.terminals && mid.railStations && mid.markers)
        XCTAssertEqual(mid.interchangeMinRoutes, 3)
        XCTAssertFalse(mid.stops || mid.selectedStops || mid.terminalNames)
        XCTAssertTrue(stationsFor(band: .mid, metersPerPoint: 20, hasSelection: true).selectedStops)
        let near = stationsFor(band: .near, metersPerPoint: 8, hasSelection: false)
        XCTAssertEqual(near.interchangeMinRoutes, 2)
        XCTAssertTrue(near.stops && near.terminalNames)
        XCTAssertFalse(near.railStationNames)
        XCTAssertTrue(stationsFor(band: .near, metersPerPoint: 6, hasSelection: false).railStationNames)
    }
}

// MARK: - the real files

final class NetFileTests: XCTestCase {
    func testTheShippedNetworksDecode() throws {
        let ddot = try MapFileDecoder.net(try shipped("ddot_routes.net.json"))
        XCTAssertEqual(ddot.system, "ddot"); XCTAssertEqual(ddot.agency, "DDOT"); XCTAssertEqual(ddot.stopsLayer, "ddot_stops")
        XCTAssertGreaterThanOrEqual(ddot.routes.count, 30)
        XCTAssertEqual(ddot.routes.filter(\.frequent).map(\.short), ["3", "4", "9"], "frequent is the City's own weekday figure")
        XCTAssertEqual(ddot.routes.first { $0.short == "4" }?.label, "4 Woodward")
        XCTAssertTrue(ddot.routes.allSatisfy { (0...5).contains($0.tone) && $0.id.hasPrefix("rt_ddot_") })
        XCTAssertTrue(ddot.routes.allSatisfy { $0.color == nil }, "DDOT publishes no colours")
        XCTAssertFalse(ddot.trunks.isEmpty); XCTAssertFalse(ddot.interchanges.isEmpty)
        XCTAssertNil(ddot.serves)

        let smart = try MapFileDecoder.net(try shipped("smart_routes.net.json"))
        XCTAssertEqual(Set(smart.routes.filter(\.frequent).map(\.short)), ["261", "461", "462", "561"])
        XCTAssertNotNil(smart.routes.first?.color, "SMART's colours are carried (and not drawn)")
        XCTAssertEqual(smart.agencyURL, "https://smartbus.org")

        let qline = try MapFileDecoder.net(try shipped("qline.net.json"))
        XCTAssertEqual(qline.routes.map(\.id), ["rt_qline"])
        XCTAssertTrue(qline.routes[0].derived, "the QLINE line is a drawing through its stations, and says so")
        XCTAssertEqual(qline.routes[0].ends.count, 2)
        XCTAssertEqual(qline.serves?.count, 20)

        let dpm = try MapFileDecoder.net(try shipped("people_mover.net.json"))
        XCTAssertTrue(dpm.routes[0].loop); XCTAssertTrue(dpm.routes[0].ends.isEmpty, "a loop has no terminals")
        let loop = try XCTUnwrap(dpm.lines.first).points
        XCTAssertEqual(loop[0], loop[loop.count - 2]); XCTAssertEqual(loop[1], loop[loop.count - 1])

        for net in [ddot, smart, qline, dpm] {
            for (i, r) in net.routes.enumerated() {
                XCTAssertFalse(r.lines.isEmpty, r.id)
                for l in r.lines { XCTAssertEqual(net.lines[l].route, i) }
            }
            for l in net.lines {
                XCTAssertGreaterThanOrEqual(l.points.count, 4)
                XCTAssertEqual(l.runs.first?.from, 0)
                XCTAssertEqual(l.runs.map(\.from), l.runs.map(\.from).sorted())
                XCTAssertLessThan(l.runs.last!.from, l.points.count / 2)
                for r in l.runs { XCTAssertTrue(r.isTrunk ? r.off == 0 : abs(r.off) <= 3, "off is −3…3 half-steps, 0 on a trunk") }
                // Inside the service area's box, give or take the suburbs SMART reaches.
                XCTAssertTrue((41.9...42.9).contains(MapProjection.lat(y: l.box.centerY)))
                XCTAssertTrue((-83.8 ... -82.6).contains(MapProjection.lon(x: l.box.centerX)))
            }
            for c in net.interchanges {
                XCTAssertGreaterThanOrEqual(c.routes.count, 2)
                XCTAssertLessThan(hypot(c.ax - c.bx, c.ay - c.by) * MapProjection.metersPerUnit, 400, "a pill is a crossing, not a street")
            }
            for t in net.trunks { XCTAssertGreaterThan(t.routes.count, 4) }
        }
    }

    func testTheStopsFilesAgreeWithTheirStopsLayersAndTheirRoutes() throws {
        for system in ["ddot", "smart"] {
            let serves = try MapFileDecoder.netServes(try shipped("\(system)_stops.net.json"))
            let layer = try MapFileDecoder.layer(try shipped("\(system)_stops.json"))
            let net = try MapFileDecoder.net(try shipped("\(system)_routes.net.json"))
            XCTAssertEqual(serves.serves.count, layer.points.count, "serves[i] belongs to points[i]")
            XCTAssertEqual(serves.routeIds, net.routes.map(\.id))
            XCTAssertEqual(serves.routesLayer, "\(system)_routes")
            XCTAssertTrue(serves.serves.allSatisfy { $0.allSatisfy { $0 >= 0 && $0 < net.routes.count } })
            for r in net.routes { for list in r.stops { XCTAssertTrue(list.allSatisfy { $0 >= 0 && $0 < layer.points.count }, r.id) } }
        }
    }

    func testTheLayerListNamesTheNetFilesAndTheHubs() throws {
        let url = repoRoot.appendingPathComponent("data/bundle/v1/places/transit.json")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: url.path), "no built bundle here")
        let extras = MapFileDecoder.transitExtras(try Data(contentsOf: url))
        XCTAssertEqual(Set(extras.netFiles.keys), ["ddot_routes", "ddot_stops", "smart_routes", "smart_stops", "qline", "people_mover"])
        XCTAssertEqual(extras.netFiles["qline"], "map/transit/qline.net.json")
        XCTAssertEqual(extras.hubs.count, 4)
        let gcp = try XCTUnwrap(extras.hubs.first { $0.name == "Grand Circus Park" })
        XCTAssertEqual(gcp.layers, ["people_mover", "qline"])
        XCTAssertEqual(MapProjection.lat(y: gcp.y), 42.3364, accuracy: 0.002)
        XCTAssertEqual(MapProjection.lon(x: gcp.x), -83.0507, accuracy: 0.002)
        let raw = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let origins = ((raw?["hubs"] as? [[String: Any]]) ?? []).map { $0["origin"] as? [Double] }
        XCTAssertEqual(origins.count, 4); XCTAssertTrue(origins.allSatisfy { $0?.count == 2 }, "every hub says what its numbers count from")
        XCTAssertFalse(gcp.shows(layersOn: ["go:qline"]), "a hub is drawn when two or more of its layers are on")
        XCTAssertTrue(gcp.shows(layersOn: ["go:qline", "go:people_mover"]))
    }

    /// A hub is placed by the `origin` it carries — never by an assumption. Only a bundle from before `origin`
    /// (2026-09-21) falls back to the transit grid.
    func testAHubIsPlacedByItsOwnOrigin() {
        func hub(_ origin: String) -> TransitHub? {
            let json = #"{"layers":[],"hubs":[{\#(origin)"at":[1000,2000],"span":[-10,0,10,0],"name":"H","layers":["qline","people_mover"],"stops":[]}]}"#
            return MapFileDecoder.transitExtras(Data(json.utf8)).hubs.first
        }
        let said = hub(#""origin":[-83.0,42.0],"#)!, old = hub("")!
        XCTAssertEqual(MapProjection.lon(x: said.x), -83.0 + 0.01, accuracy: 1e-9); XCTAssertEqual(MapProjection.lat(y: said.y), 42.0 + 0.02, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lon(x: said.bx) - MapProjection.lon(x: said.ax), 0.0002, accuracy: 1e-9)
        XCTAssertEqual(MapProjection.lon(x: old.x), MapFileDecoder.transitOrigin[0] + 0.01, accuracy: 1e-9)
    }

    /// An old bundle: no `net`, no `hubs`. Nothing to choose, so the control is not offered.
    func testAnOldBundleOffersNoStyle() {
        let old = #"{"layers":[{"id":"qline","kind":"both","file":"map/transit/qline.json"}]}"#
        let extras = MapFileDecoder.transitExtras(Data(old.utf8))
        XCTAssertTrue(extras.netFiles.isEmpty); XCTAssertTrue(extras.hubs.isEmpty)
        XCTAssertTrue(MapFileDecoder.transitExtras(Data("not json".utf8)).netFiles.isEmpty)
        let v3 = #"{"layers":[{"id":"qline","net":{"file":"x.net.json","v":3}}]}"#
        XCTAssertTrue(MapFileDecoder.transitExtras(Data(v3.utf8)).netFiles.isEmpty, "a format this app cannot read is not offered")
    }

    // MARK: failure falls back to standard

    func testAFormatThisAppCannotReadIsRefused() {
        let v3 = #"{"id":"qline","v":3,"origin":[-83.32,42.22],"names":[],"lines":[],"routes":[]}"#
        XCTAssertThrowsError(try MapFileDecoder.net(Data(v3.utf8))) { XCTAssertEqual($0 as? NetFileError, .unsupportedVersion(3)) }
        let v1 = #"{"id":"qline","origin":[-83.32,42.22],"names":[],"lines":[]}"#
        XCTAssertThrowsError(try MapFileDecoder.net(Data(v1.utf8))) { XCTAssertEqual($0 as? NetFileError, .unsupportedVersion(0)) }
        XCTAssertThrowsError(try MapFileDecoder.net(Data("{".utf8)))
        XCTAssertThrowsError(try MapFileDecoder.net(Data(#"{"id":"x","v":2}"#.utf8))) { XCTAssertEqual($0 as? NetFileError, .malformed) }
        XCTAssertThrowsError(try MapFileDecoder.netServes(Data(#"{"id":"x","v":2}"#.utf8)))
    }

    /// The rule the model follows (MapModel.subwayReady): a layer is drawn `subway` only once its network is
    /// held. Until then — still coming, refused, failed its checksum — it is drawn `standard`.
    func testALayerWithoutItsNetworkIsDrawnStandard() {
        XCTAssertEqual(drawnStyle(chosen: .subway, netHeld: false), .standard)
        XCTAssertEqual(drawnStyle(chosen: .subway, netHeld: true), .subway)
        XCTAssertEqual(drawnStyle(chosen: .standard, netHeld: true), .standard, "a held file never changes standard")
        XCTAssertEqual(drawnStyle(chosen: .standard, netHeld: false), .standard)
    }

    func testAFileThatPointsOutsideItselfIsNotTrusted() throws {
        let odd = """
        {"id":"t","v":2,"origin":[-83.32,42.22],"names":["A"],"lines":[[0,[0,0,100,0,100,0]]],
         "routes":[{"id":"rt_a","short":"A","long":"","tone":9,"lines":[0,7],"stops":[],"ends":[[1,2,5],[1]]}],
         "runs":[[0,1,2,99,0,1]],"interchanges":[[0,0,-1,[0,4],[1,1]]],"trunks":[[0,0,[0,1,2,3,4,5]]]}
        """
        let net = try MapFileDecoder.net(Data(odd.utf8))
        XCTAssertEqual(net.routes[0].lines, [0], "line 7 is not in the file")
        XCTAssertEqual(net.routes[0].ends.count, 1); XCTAssertEqual(net.routes[0].ends[0].name, "")
        XCTAssertEqual(net.lines[0].runs, [NetRun(from: 0, off: 1, n: 2), NetRun(from: 2, off: 0, n: 1)], "a run start past the end is clamped")
        XCTAssertEqual(net.interchanges[0].routes, [0])
        XCTAssertEqual(net.trunks[0].routes, [0])
        XCTAssertEqual(routeColour(layer: "t", route: net.routes[0]), .tr3, "a tone outside 0…5 wraps rather than crashing")
    }
}

// MARK: - geometry

final class SubwayGeometryTests: XCTestCase {
    func testSimplifyKeepsEndsAndDropsWhatIsWithinTolerance() {
        let line: [Double] = [0, 0, 1, 0.01, 2, 0, 3, 1, 4, 0]
        XCTAssertEqual(SubwayGeometry.simplify(line, tolerance: 0), line, "near band: none")
        XCTAssertEqual(SubwayGeometry.simplify(line, tolerance: 0.05), [0, 0, 2, 0, 3, 1, 4, 0])
        XCTAssertEqual(SubwayGeometry.simplify(line, tolerance: 5), [0, 0, 4, 0])
    }

    func testRunsAreSimplifiedSeparatelySoBoundariesSurvive() {
        // A straight line: simplification would drop every middle vertex, but vertex 2 starts a run.
        let pts: [Double] = [0, 0, 0.001, 0, 0.002, 0, 0.003, 0, 0.004, 0]
        let line = NetLine(route: 0, points: pts, runs: [NetRun(from: 0, off: -1, n: 2), NetRun(from: 2, off: 0, n: 1)], box: .around(pts))
        let runs = SubwayGeometry.prepare(line, band: .far)
        XCTAssertEqual(runs.map(\.points), [[0, 0, 0.002, 0], [0.002, 0, 0.004, 0]])
        XCTAssertEqual(runs.map(\.off), [-1, 0])
    }

    /// Left of travel with north up. y grows downwards, so heading east the left side is smaller y.
    func testOffsetIsToTheLeftOfTravel() {
        XCTAssertEqual(SubwayGeometry.offsetRun([0, 0, 10, 0], offset: 2), [0, -2, 10, -2])
        XCTAssertEqual(SubwayGeometry.offsetRun([10, 0, 0, 0], offset: 2), [10, 2, 0, 2], "heading west, left is south")
        XCTAssertEqual(SubwayGeometry.offsetRun([0, 0, 0, -10], offset: 2), [-2, 0, -2, -10], "heading north, left is west")
        XCTAssertEqual(SubwayGeometry.offsetRun([0, 0, 10, 0], offset: -2), [0, 2, 10, 2])
        XCTAssertEqual(SubwayGeometry.offsetRun([0, 0, 10, 0], offset: 0), [0, 0, 10, 0])
    }

    func testACornerIsMitredAndTheMitreIsLimitedToTwo() {
        // East then north: a right angle, turning left. The inside corner moves by o·√2 along the diagonal.
        let bend = SubwayGeometry.offsetRun([0, 0, 10, 0, 10, -10], offset: 1)
        XCTAssertEqual(bend[2], 9, accuracy: 1e-9); XCTAssertEqual(bend[3], -1, accuracy: 1e-9)
        // A hairpin: without the limit the mitre would run off to infinity.
        let hairpin = SubwayGeometry.offsetRun([0, 0, 10, 0, 0, 0.2], offset: 1)
        XCTAssertLessThanOrEqual(hypot(hairpin[2] - 10, hairpin[3] - 0), 2 + 1e-9)
        // A repeated vertex has no direction of its own and borrows its neighbour's.
        XCTAssertEqual(SubwayGeometry.offsetRun([0, 0, 0, 0, 10, 0], offset: 1), [0, -1, 0, -1, 10, -1])
    }

    func testCornersAreRoundedWithOneQuadEach() {
        let cmds = SubwayGeometry.roundCorners([0, 0, 10, 0, 10, 10], radius: 3)
        XCTAssertEqual(cmds, [.move(0, 0), .line(7, 0), .quad(cx: 10, cy: 0, x: 10, y: 3), .line(10, 10)])
        // r = min(R, half of each neighbouring segment)
        XCTAssertEqual(SubwayGeometry.roundCorners([0, 0, 4, 0, 4, 10], radius: 3)[1], .line(2, 0))
        // A turn under 8 degrees is left alone.
        XCTAssertEqual(SubwayGeometry.roundCorners([0, 0, 10, 0, 20, 1], radius: 3), [.move(0, 0), .line(10, 0), .line(20, 1)])
        XCTAssertEqual(SubwayGeometry.roundCorners([0, 0, 10, 0, 10, 10], radius: 0), [.move(0, 0), .line(10, 0), .line(10, 10)])
        XCTAssertEqual(SubwayGeometry.roundCorners([1, 1], radius: 3), [])
    }

    func testAClosedLoopIsRoundedWhereItCloses() {
        let square: [Double] = [0, 0, 10, 0, 10, 10, 0, 10, 0, 0]
        let cmds = SubwayGeometry.roundCorners(square, radius: 2, closed: true)
        XCTAssertEqual(cmds.first, .move(5, 0)); XCTAssertEqual(cmds.last, .line(5, 0))
        XCTAssertEqual(cmds.filter { if case .quad = $0 { return true }; return false }.count, 4, "all four corners, the closing one too")
    }

    func testSideBySideRunsJoinWithAJogAndATrunkIsDrawnOnce() {
        let runs = [SubwayGeometry.PreparedRun(off: 0, n: 1, points: [0, 0, 10, 0]),
                    SubwayGeometry.PreparedRun(off: 2, n: 3, points: [10, 0, 20, 0]),
                    SubwayGeometry.PreparedRun(off: 0, n: 7, points: [20, 0, 30, 0]),
                    SubwayGeometry.PreparedRun(off: -1, n: 2, points: [30, 0, 40, 0])]
        let b = SubwayGeometry.build(route: 0, runs: runs, step: 2, radius: 0, closed: false)
        XCTAssertEqual(b.trunk, [[20, 0, 30, 0]])
        XCTAssertEqual(b.own.count, 2)
        // Centre, a jog to two half-steps left, and on to where the trunk begins: never a gap.
        XCTAssertEqual(b.own[0], [0, 0, 10, 0, 10, -2, 20, -2, 20, 0])
        XCTAssertEqual(b.own[1], [30, 0, 30, 1, 40, 1])
        // Far band: step 0, so every off is read as 0 and the line runs down the centre.
        let far = SubwayGeometry.build(route: 0, runs: runs, step: 0, radius: 0, closed: false)
        XCTAssertEqual(far.own[0], [0, 0, 10, 0, 10, 0, 20, 0, 20, 0])
    }

    func testBadgesAreWorldAnchoredAndSkipTrunks() {
        // 0.1 of a unit is 11,132 m. Spacing 3,000 m: 1500, 4500, 7500, 10500.
        let pts: [Double] = [0, 0, 0.05, 0, 0.1, 0]
        let all = SubwayGeometry.badgeAnchors(pts, runs: [NetRun(from: 0, off: 0, n: 1)], spacingMeters: 3000)
        XCTAssertEqual(all.map(\.meters), [1500, 4500, 7500, 10500])
        XCTAssertEqual(all[0].x, 1500 / MapProjection.metersPerUnit, accuracy: 1e-12)
        XCTAssertEqual(all[0].leftY, -1, accuracy: 1e-12); XCTAssertEqual(all[0].leftX, 0, accuracy: 1e-12)
        // The second half is a trunk: its anchors (7500, 10500) are skipped.
        let some = SubwayGeometry.badgeAnchors(pts, runs: [NetRun(from: 0, off: 1, n: 2), NetRun(from: 1, off: 0, n: 6)], spacingMeters: 3000)
        XCTAssertEqual(some.map(\.meters), [1500, 4500])
        XCTAssertEqual(some.map(\.off), [1, 1])
        XCTAssertTrue(SubwayGeometry.badgeAnchors(pts, runs: [], spacingMeters: 0).isEmpty)
    }

    func testChevronsAreEvenlySpacedAndPointTheWayTheLoopRuns() {
        let marks = SubwayGeometry.marksAlong([0, 0, 200, 0, 200, 100], every: 90)
        XCTAssertEqual(marks.map(\.x), [45, 135, 200])
        XCTAssertEqual(marks.map(\.y), [0, 0, 25])
        XCTAssertEqual(marks[0].angle, 0, accuracy: 1e-12)
        XCTAssertEqual(marks[2].angle, .pi / 2, accuracy: 1e-12)
    }

    func testTheRealNetworksBuildInEveryBand() throws {
        let t0 = Date()
        let ddot = PreparedNet(try MapFileDecoder.net(try shipped("ddot_routes.net.json")))
        let smart = PreparedNet(try MapFileDecoder.net(try shipped("smart_routes.net.json")))
        let prepared = Date().timeIntervalSince(t0)
        for p in [ddot, smart] {
            let raw = p.net.lines.reduce(0) { $0 + $1.points.count / 2 }
            func vertices(_ b: ZoomBand) -> Int { p.runs[b]!.reduce(0) { $0 + $1.reduce(0) { $0 + $1.points.count / 2 } } }
            XCTAssertLessThan(vertices(.far), vertices(.mid)); XCTAssertLessThan(vertices(.mid), vertices(.near))
            XCTAssertGreaterThanOrEqual(vertices(.near), raw, "near is not simplified (run boundaries are counted twice)")
            for band in ZoomBand.allCases {
                let built = p.built(band: band, scale: MapProjection.metersPerUnit / (band == .far ? 60 : band == .mid ? 20 : 6))
                XCTAssertEqual(built.count, p.net.lines.count)
                for b in built {
                    XCTAssertFalse(b.box.isEmpty)
                    for l in b.own + b.trunk { XCTAssertTrue(l.allSatisfy { $0.isFinite }) }
                }
                XCTAssertFalse(built.allSatisfy { $0.trunk.isEmpty }, "both bus networks have trunks")
                XCTAssertTrue(p.anchors[band]!.contains { !$0.isEmpty })
            }
            // Offsets never exceed 1.5 steps (three half-steps), mitre limit 2.
            let scale = MapProjection.metersPerUnit / 20, step = subwayStep(band: .mid) / scale
            for (line, b) in zip(p.net.lines, p.built(band: .mid, scale: scale)) {
                for poly in b.own {
                    var i = 0
                    while i + 1 < poly.count {
                        XCTAssertLessThanOrEqual(MapHit.distanceToPolyline(poly[i], poly[i + 1], line.points), step * 1.5 * 2 + 12 / MapProjection.metersPerUnit)
                        i += 2
                    }
                }
            }
        }
        print("prepared both bus networks (three bands each) in \(String(format: "%.1f", prepared * 1000)) ms")
    }
}

// MARK: - badges, taps, reading order

final class SubwayBadgeTests: XCTestCase {
    private func c(_ id: String, _ rank: BadgeCandidate.Rank, _ order: Int, x: Double, y: Double = 0, d: Double = 0) -> BadgeCandidate {
        BadgeCandidate(id: id, text: id, rank: rank, order: order, rect: LabelRect(x: x, y: y, width: 20, height: 16), distanceToCentre: d)
    }

    func testNeverMoreThanTwentyFour() {
        let many = (0..<60).map { c("b\($0)", .other, $0, x: Double($0) * 40) }
        XCTAssertEqual(claimBadges(many).count, 24)
        XCTAssertEqual(subwayBadgeCap, 24)
    }

    func testTheOrderOfClaim() {
        let got = claimBadges([c("local", .other, 1, x: 0, d: 50), c("trunk", .trunk, 0, x: 50), c("freq", .frequent, 9, x: 100),
                               c("rail", .rail, 0, x: 150), c("sel", .selected, 30, x: 200),
                               c("local-far", .other, 1, x: 250, d: 90), c("local-near", .other, 1, x: 300, d: 10)], cap: 5)
        // Settled 2026-09-21, one order for all three clients: selected › rail › trunks › frequent › the rest.
        XCTAssertEqual(got.map(\.id), ["sel", "rail", "trunk", "freq", "local-near"])
        XCTAssertEqual(BadgeCandidate.Rank.trunk.rawValue, 2); XCTAssertEqual(BadgeCandidate.Rank.frequent.rawValue, 3)
    }

    /// Round-robin runs ACROSS ranks: a frequent route's second badge waits until every other route has its first.
    func testTheRoundRobinRunsAcrossRanksAndTheSelectedRouteIsExempt() {
        let all = [c("f-0", .frequent, 4, x: 0, d: 1), c("f-1", .frequent, 4, x: 40, d: 2), c("o-0", .other, 31, x: 80, d: 5),
                   c("o-1", .other, 31, x: 120, d: 6), c("s-1", .selected, 60, x: 160, d: 90), c("s-0", .selected, 60, x: 200, d: 3)]
        XCTAssertEqual(badgeOrder(all).map(\.id), ["s-0", "s-1", "f-0", "o-0", "f-1", "o-1"])
    }

    func testRiderOrderRunsAcrossNetworks() {
        let keys = [("461", "smart", 19), ("4", "ddot", 3), ("4", "smart", 0), ("QLINE", "qline", 0), ("16", "ddot", 14)]
        let sorted = keys.sorted { riderOrder(short: $0.0, system: $0.1, index: $0.2) < riderOrder(short: $1.0, system: $1.1, index: $1.2) }
        XCTAssertEqual(sorted.map { "\($0.1) \($0.0)" }, ["ddot 4", "smart 4", "ddot 16", "smart 461", "qline QLINE"])
    }

    /// Every route in a rank is named once before any is named twice.
    func testEveryRouteGetsABadgeBeforeAnyGetsASecond() {
        var all: [BadgeCandidate] = []
        for route in 0..<30 { for k in 0..<3 { all.append(c("r\(route)-\(k)", .other, route, x: Double(route) * 40, y: Double(k) * 40, d: Double(k))) } }
        let got = claimBadges(all)
        XCTAssertEqual(got.count, 24)
        XCTAssertEqual(Set(got.map(\.order)).count, 24, "24 different routes, not the first 8 three times each")
        XCTAssertTrue(got.allSatisfy { $0.id.hasSuffix("-0") }, "and each route's badge is the one nearest the middle")
    }

    func testABadgeThatDoesNotFitIsDroppedNeverOverlapped() {
        let got = claimBadges([c("a", .frequent, 0, x: 0), c("b", .other, 1, x: 10), c("c", .other, 2, x: 60)])
        XCTAssertEqual(got.map(\.id), ["a", "c"])
        // Terminals, hubs and interchanges come first: a badge never sits on one.
        let pill = LabelRect(x: 60, y: 0, width: 12, height: 12)
        XCTAssertEqual(claimBadges([c("a", .frequent, 0, x: 0), c("c", .other, 2, x: 60)], taken: [pill]).map(\.id), ["a"])
    }

    func testATapFindsThe44PointBoxAndASecondTapMovesOn() {
        let glyphs = [HitGlyph(id: "stop", kind: .stop, x: 100, y: 100), HitGlyph(id: "pill", kind: .interchange, x: 110, y: 100),
                      HitGlyph(id: "end", kind: .terminal, x: 118, y: 104), HitGlyph(id: "far", kind: .hub, x: 300, y: 300)]
        XCTAssertEqual(subwayHitTest(x: 101, y: 101, glyphs: glyphs)?.id, "end", "a 3-point stop still has a 44-point box, and a terminal outranks it")
        XCTAssertEqual(subwayHitTest(x: 101, y: 101, glyphs: glyphs, previous: "end")?.id, "pill")
        XCTAssertEqual(subwayHitTest(x: 101, y: 101, glyphs: glyphs, previous: "pill")?.id, "stop")
        XCTAssertEqual(subwayHitTest(x: 101, y: 101, glyphs: glyphs, previous: "stop")?.id, "end", "and round again")
        XCTAssertEqual(subwayHitTest(x: 78.5, y: 100, glyphs: glyphs)?.id, "stop", "21.5 points away is inside the box")
        XCTAssertNil(subwayHitTest(x: 77, y: 100, glyphs: glyphs))
        XCTAssertNil(subwayHitTest(x: 200, y: 200, glyphs: glyphs))
    }

    func testTheReadingOrderIsOnlyEverAppendedTo() {
        let existing = ["seg:a", "seg:b", "row:1"]
        let got = featureOrder(existing: existing, hubs: ["hub:1"], terminals: ["end:1", "end:2"], interchanges: ["x:1"], routes: ["rt:1", "rt:2"])
        XCTAssertEqual(Array(got.items.prefix(3)), existing, "what standard reads first, subway reads first, in the same order")
        XCTAssertEqual(Array(got.items.dropFirst(3)), ["hub:1", "end:1", "end:2", "x:1", "rt:1", "rt:2"])
        XCTAssertEqual(got.more, 0)
        let crowded = featureOrder(existing: existing, hubs: [], terminals: [], interchanges: (0..<100).map { "x:\($0)" }, routes: ["rt:1"])
        // Downtown: a hundred interchanges and thirty terminals must not keep VoiceOver from the ROUTES.
        XCTAssertEqual(crowded.items.count, 3 + 20 + 1); XCTAssertEqual(crowded.items.last, "rt:1"); XCTAssertEqual(crowded.more, 80)
        let downtown = featureOrder(existing: existing, hubs: ["hub:1"], terminals: (0..<30).map { "end:\($0)" },
                                    interchanges: (0..<100).map { "x:\($0)" }, routes: (0..<50).map { "rt:\($0)" })
        XCTAssertEqual(downtown.items.count, 3 + 40)
        XCTAssertEqual(downtown.items.filter { $0.hasPrefix("end:") }.count, subwayTerminalFeatureCap)
        XCTAssertEqual(downtown.items.filter { $0.hasPrefix("x:") }.count, subwayInterchangeFeatureCap)
        XCTAssertEqual(downtown.items.filter { $0.hasPrefix("rt:") }.count, 11, "40 − 1 − 8 − 20")
        XCTAssertEqual(downtown.items.last, "rt:10"); XCTAssertEqual(downtown.more, 181 - 40)
        XCTAssertEqual(featureOrder(existing: existing, hubs: [], terminals: [], interchanges: [], routes: [String]()).items, existing)
    }
}

// MARK: - the words for a day, and the transit facts

final class DayWordsTests: XCTestCase {
    private let en = Locale(identifier: "en_US")
    private func name(_ d: String, _ today: String, _ l: Locale? = nil) -> String {
        DayWords.name(date: d, today: today, locale: l ?? en, todayWord: "Today", tomorrowWord: "Tomorrow")
    }

    func testTodayTomorrowAndThenTheDayByName() {
        XCTAssertEqual(name("2026-09-21", "2026-09-21"), "Today")
        XCTAssertEqual(name("2026-09-22", "2026-09-21"), "Tomorrow")
        XCTAssertEqual(name("2026-09-25", "2026-09-21"), "Friday, Sep 25")
        XCTAssertEqual(name("2026-10-01", "2026-09-30"), "Tomorrow", "across a month")
        XCTAssertEqual(name("2027-01-01", "2026-12-31"), "Tomorrow", "across a year")
        XCTAssertEqual(name("2026-09-20", "2026-09-21"), "Sunday, Sep 20", "yesterday is a date, not a word")
        XCTAssertFalse(name("2026-09-25", "2026-09-21").contains("2026"), "never the raw ISO date")
    }

    func testTheDayIsNamedInThePhonesLanguage() {
        let es = name("2026-09-25", "2026-09-21", Locale(identifier: "es_US"))
        XCTAssertTrue(es.lowercased().contains("viernes"), es)
        let ar = name("2026-09-25", "2026-09-21", Locale(identifier: "ar@numbers=latn"))
        XCTAssertTrue(ar.contains("25"), "Western digits, as everywhere in the app: \(ar)")
    }

    func testADayThatCannotBeReadIsHandedBack() {
        XCTAssertEqual(name("soon", "2026-09-21"), "soon")
        XCTAssertNil(DayWords.kind(date: "2026-09-25", today: ""))
    }

    /// 03:30 UTC on the 22nd is still the evening of the 21st in Detroit.
    func testTodayIsDetroitsDay() {
        XCTAssertEqual(DayWords.detroitDay(of: Date(timeIntervalSince1970: 1_790_047_800)), "2026-09-21")
    }
}

final class TransitFactsTests: XCTestCase {
    /// apps/web/src/transit.ts is where a steward edits these facts. Every sentence, link, label, number and the
    /// `checked` date in the Swift copy must be in it, and nothing in it may be missing here.
    func testTheFactsAreTheWebApps() throws {
        let ts = try String(contentsOf: repoRoot.appendingPathComponent("apps/web/src/transit.ts"), encoding: .utf8)
        let f = TransitFacts.current
        XCTAssertTrue(ts.contains("checked: '\(f.checked)'"), "the date the facts were last read differs from transit.ts")
        var mine: [String] = [f.bike.body, f.bike.link.label, f.bike.link.url]
        for s in f.sections {
            mine.append(s.title); if let b = s.body { mine.append(b) }
            mine += s.facts.map(\.text) + s.phones.flatMap { [$0.label, $0.number] } + s.links.flatMap { [$0.label, $0.url] }
        }
        for m in mine { XCTAssertTrue(ts.contains("'\(m)'"), "not in transit.ts: \(m)") }
        // The links marked as an owner's trip planner are the same ones, for the same systems.
        let marked = f.sections.flatMap(\.links).filter { $0.system != nil }
        XCTAssertEqual(marked.count, ts.components(separatedBy: ", system: '").count - 1)
        for l in marked { XCTAssertTrue(ts.contains("url: '\(l.url)', system: '\(l.system!)'"), "\(l.label) is not marked \(l.system!) in transit.ts") }
        // And the other way: every quoted url and phone number in transit.ts is here.
        let body = ts.components(separatedBy: "export const TRANSIT").last ?? ""
        let quoted = body.components(separatedBy: "'").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        for q in quoted where q.hasPrefix("http") || q.range(of: #"^\d{3}-\d{3}-\d{4}$"#, options: .regularExpression) != nil {
            XCTAssertTrue(mine.contains(q), "transit.ts has \(q); the iPhone does not")
        }
    }

    func testEveryLinkNamesItsOwnerAndARouteCardUsesTheSameLink() {
        let f = TransitFacts.current
        XCTAssertEqual(f.planner(forSystem: "ddot")?.url, "http://myddotbus.com/map?selector=tripplanner")
        XCTAssertEqual(f.planner(forSystem: "smart")?.owner, "smartbus.org")
        XCTAssertEqual(f.planner(forSystem: "qline")?.owner, "qlinedetroit.com")
        XCTAssertEqual(f.planner(forSystem: "dpm")?.owner, "thepeoplemover.com")
        XCTAssertNil(f.planner(forSystem: "amtrak"))
        for l in f.sections.flatMap(\.links) + [f.bike.link] {
            XCTAssertFalse(l.owner.isEmpty); XCTAssertFalse(l.owner.contains("/"), l.owner)
        }
    }
}


// MARK: - the STANDARD basemap: the web's tokens, to the digit, and 3:1 for every pair a frame puts side by side

final class StandardPaletteTests: XCTestCase {
    /// `--token:#rrggbb` pairs of one block of apps/web/src/style.css.
    private func tokens(in css: String, from start: String, to end: String) -> [String: String] {
        guard let a = css.range(of: start), let b = css.range(of: end, range: a.upperBound..<css.endIndex) else { return [:] }
        var out: [String: String] = [:]
        let block = String(css[a.upperBound..<b.lowerBound])
        let re = try! NSRegularExpression(pattern: "(--[a-z0-9-]+):\\s*(#[0-9a-fA-F]{6})\\b")
        for m in re.matches(in: block, range: NSRange(block.startIndex..., in: block)) {
            let k = String(block[Range(m.range(at: 1), in: block)!]), v = String(block[Range(m.range(at: 2), in: block)!]).lowercased()
            if out[k] == nil { out[k] = v }
        }
        return out
    }

    func testEveryTokenIsTheWebsInAllFourVariants() throws {
        let css = try String(contentsOf: repoRoot.appendingPathComponent("apps/web/src/style.css"), encoding: .utf8)
        let light = tokens(in: css, from: ":root {", to: "@media (prefers-color-scheme: dark)")
        let dark = tokens(in: css, from: "@media (prefers-color-scheme: dark)", to: ".mapbox")
        let moreLight = tokens(in: css, from: "@media (prefers-contrast: more) {", to: "@media (prefers-contrast: more) and")
        let moreDark = tokens(in: css, from: "@media (prefers-contrast: more) and (prefers-color-scheme: dark)", to: "@media (forced-colors: active)")
        XCTAssertEqual(light["--map-road"], "#747d77", "the block was found, and it is the post-audit street colour")
        for t in MapToken.allCases {
            let name = t.rawValue
            XCTAssertEqual(StandardPalette.color(t, scheme: .light).hex, light[name], "\(name) light")
            XCTAssertEqual(StandardPalette.color(t, scheme: .dark).hex, dark[name], "\(name) dark")
            XCTAssertEqual(StandardPalette.color(t, scheme: .light, increasedContrast: true).hex, moreLight[name] ?? light[name], "\(name) light, more contrast")
            XCTAssertEqual(StandardPalette.color(t, scheme: .dark, increasedContrast: true).hex, moreDark[name] ?? dark[name], "\(name) dark, more contrast")
        }
        // The subway palette's grounds are these same tokens.
        for s in MapScheme.allCases {
            XCTAssertEqual(TransitPalette.land(s), StandardPalette.color(.land, scheme: s)); XCTAssertEqual(TransitPalette.park(s), StandardPalette.color(.park, scheme: s))
            XCTAssertEqual(TransitPalette.casing(s), StandardPalette.color(.gwCase, scheme: s))
            XCTAssertEqual(TransitPalette.landMoreContrast(s), StandardPalette.color(.land, scheme: s, increasedContrast: true))
        }
    }

    /// The pairs of apps/web/test/web.test.ts NON_TEXT that are the map's own: a street is measured against the
    /// land AND a park AND the ground outside; the hatch against both grounds; a line against its casing; the casing
    /// against a street. Names are text: 4.5:1.
    func testEveryPairAFramePutsSideBySideReachesThreeToOneInAllFourVariants() {
        for s in MapScheme.allCases { for more in [false, true] {
            func c(_ t: MapToken) -> RGB { StandardPalette.color(t, scheme: s, increasedContrast: more) }
            var pairs: [(String, MapToken, MapToken)] = []
            for r in [MapToken.road, .main, .freeway] { pairs += [("\(r) on land", r, .land), ("\(r) over a park", r, .park), ("\(r) outside the cities", r, .out)] }
            pairs += [("hatch on its own ground", .outInk, .out), ("hatch against the land", .outInk, .land), ("casing over a street", .gwCase, .road)]
            for g in [MapToken.gwOpen, .gwBuild, .gwFund, .gwPlan] { pairs += [("\(g) on land", g, .land), ("\(g) on its casing", g, .gwCase)] }
            for l in [MapToken.bus, .smart, .rail, .bike] { pairs += [("\(l) on land", l, .land), ("\(l) over a park", l, .park), ("\(l) on its casing", l, .gwCase)] }
            for (what, fg, bg) in pairs { XCTAssertGreaterThanOrEqual(RGB.contrast(c(fg), c(bg)), 3, "\(what), \(s)\(more ? ", more contrast" : "")") }
            XCTAssertGreaterThanOrEqual(RGB.contrast(c(.ink), c(.land)), 4.5); XCTAssertGreaterThanOrEqual(RGB.contrast(c(.parkInk), c(.park)), 4.5)
            if more { for (fg, bg) in [(MapToken.road, MapToken.land), (.main, .land), (.freeway, .land), (.outInk, .out)] {
                XCTAssertGreaterThanOrEqual(RGB.contrast(c(fg), c(bg)), RGB.contrast(StandardPalette.color(fg, scheme: s), StandardPalette.color(bg, scheme: s)) - 0.005, "more contrast is MORE")
                XCTAssertGreaterThanOrEqual(RGB.contrast(c(fg), c(bg)), 4.5)
            } }
        } }
        // The numbers the audit quotes for the streets, so a change here is a change there.
        XCTAssertEqual(RGB.contrast(StandardPalette.color(.road, scheme: .light), StandardPalette.color(.land, scheme: .light)), 4.01, accuracy: 0.0051)
        XCTAssertEqual(RGB.contrast(StandardPalette.color(.road, scheme: .dark), StandardPalette.color(.land, scheme: .dark)), 4.22, accuracy: 0.0051)
    }

    /// Width and zoom carry the street hierarchy, as the web's `draw()`: the same thresholds and the same numbers.
    func testStreetWeightsAndZoomThresholdsAreTheWebs() {
        XCTAssertEqual([5.9, 6, 10.9, 11, 40].map { mapStreetClassLimit(metersPerPoint: $0) }, [4, 3, 3, 2, 2])
        for (cls, mpp, want) in [(4, 5.0, 1.4), (4, 20.0, 0.9), (3, 20.0, 1.2), (3, 1.0, 4.5), (2, 50.0, 1.6), (1, 2.0, 6.5), (0, 6.0, 3.0)] {
            XCTAssertEqual(mapStreetWidth(cls: cls, metersPerPoint: mpp), want, accuracy: 1e-9, "class \(cls) at \(mpp)")
        }
        XCTAssertEqual(mapHatchSpacing, 11); XCTAssertEqual(mapHatchWidth, 1); XCTAssertEqual(mapBoundaryWidth, 1.5)
        XCTAssertEqual(mapLayerCasingExtra, 3); XCTAssertEqual(mapRoadCasingExtra, 2.5)
        XCTAssertTrue(mapRoadCasingShown(metersPerPoint: 3.9, quiet: false)); XCTAssertFalse(mapRoadCasingShown(metersPerPoint: 4, quiet: false)); XCTAssertFalse(mapRoadCasingShown(metersPerPoint: 2, quiet: true))
    }
}
