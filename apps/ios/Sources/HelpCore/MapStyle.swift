// The two named styles for the transport layers (docs/MAP-STYLE.md): `standard`, which is the drawing the map has
// always had and is the default, and `subway`, the metro-diagram look a person may pick instead.
//
// Everything that decides WHAT is drawn lives here as pure functions over plain numbers: no UIKit, no SwiftUI, no
// CoreGraphics, so `swift test` holds it on Linux as well. HelpApp/MapSubway.swift only paints what these answer.
//
// The rule that matters most: `standard` is untouched. Its resolver hands back exactly the `MapLayerStyle` table
// and the two width functions of MapLayers.swift, it never looks at a route, and it never asks for a `.net.json`
// file (`netFilesWanted`). MapStyleTests holds all three.
import Foundation

// MARK: - the choice

public enum MapStyleChoice: String, Sendable, CaseIterable, Codable {
    case standard, subway
}

/// Whatever was written down, as a style. Anything that is not exactly "subway" is `standard`.
public func mapStyle(_ stored: String?) -> MapStyleChoice { stored == "subway" ? .subway : .standard }

/// The four layers whose lines the subway style redraws, and whose presence quietens the basemap.
public let subwayNetworkLayers = ["ddot_routes", "smart_routes", "qline", "people_mover"]

// MARK: - zoom bands

public enum ZoomBand: String, Sendable, CaseIterable { case far, mid, near }

/// far > 30 m per point, mid > 12, near at 12 and under — 12 is the threshold `standard` uses for dense stops.
/// A band changes only when the scale crosses an edge by 5 %, so a pinch that hovers on an edge does not flicker.
public func zoomBand(metersPerPoint mpp: Double, previous: ZoomBand? = nil) -> ZoomBand {
    guard let previous else { return mpp > 30 ? .far : mpp > 12 ? .mid : .near }
    let farEdge = previous == .far ? 30 * 0.95 : 30 * 1.05
    let nearEdge = previous == .near ? 12 * 1.05 : 12 * 0.95
    return mpp > farEdge ? .far : mpp > nearEdge ? .mid : .near
}

// MARK: - colour, as numbers

/// A colour as three bytes, so the contrast tables of docs/MAP-STYLE.md can be computed in a test.
public struct RGB: Equatable, Hashable, Sendable {
    public var r: UInt8, g: UInt8, b: UInt8
    public init(_ hex: UInt32) { r = UInt8((hex >> 16) & 255); g = UInt8((hex >> 8) & 255); b = UInt8(hex & 255) }
    public var hex: String { String(format: "#%02x%02x%02x", r, g, b) }

    /// WCAG relative luminance.
    public var luminance: Double {
        func lin(_ v: UInt8) -> Double {
            let c = Double(v) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }
    /// WCAG contrast ratio, 1…21.
    public static func contrast(_ a: RGB, _ b: RGB) -> Double {
        let (hi, lo) = (max(a.luminance, b.luminance), min(a.luminance, b.luminance))
        return (hi + 0.05) / (lo + 0.05)
    }
}

public enum MapScheme: String, Sendable, CaseIterable { case light, dark }

/// The `--tr-*` tokens of docs/MAP-STYLE.md section 4. Our own contrast-checked palette, not agency brand colours
/// (Kyle, 2026-09-21): every SMART colour fails 3:1 in one theme, and they mark service classes, not routes.
public enum TransitToken: String, Sendable, CaseIterable {
    case tr0, tr1, tr2, tr3, tr4, tr5, rail, dpm, trunk, bike, coach, pr, ring, fill
    public static func tone(_ n: Int) -> TransitToken { [.tr0, .tr1, .tr2, .tr3, .tr4, .tr5][((n % 6) + 6) % 6] }
}

public enum TransitPalette {
    private static let normal: [TransitToken: (UInt32, UInt32)] = [
        .tr0: (0xC8102E, 0xFF7A70), .tr1: (0x1D4ED8, 0x7AA7FF), .tr2: (0x0F766E, 0x4FD1C5),
        .tr3: (0x8A4B14, 0xE0A96D), .tr4: (0xBE185D, 0xFF8AC2), .tr5: (0x475569, 0xB6C2D2),
        .rail: (0x1F2937, 0xEEF2F6), .dpm: (0x86198F, 0xE59BF0), .trunk: (0x334155, 0xCBD5E1),
        .bike: (0x15803D, 0x6EE7A0), .coach: (0x7C2D12, 0xFDBA74), .pr: (0x1E40AF, 0x93B4FF),
        .ring: (0x1B2A22, 0xEEF5F0), .fill: (0xFFFFFF, 0x0A110E),
    ]
    /// Increase Contrast (section 4.4). The tokens not named there keep their values: all are already 8:1 or more.
    private static let more: [TransitToken: (UInt32, UInt32)] = [
        .tr0: (0x9B0C23, 0xFFA099), .tr1: (0x1E3A8A, 0xA8C5FF), .tr2: (0x0B4F4A, 0x8BE6DD),
        .tr3: (0x5F330D, 0xF0C596), .tr4: (0x831843, 0xFFB3D7), .tr5: (0x1E293B, 0xDBE3EE),
        .dpm: (0x581C5F, 0xF0C0F7), .bike: (0x14532D, 0xA7F3C5),
    ]
    public static func color(_ token: TransitToken, scheme: MapScheme, increasedContrast: Bool = false) -> RGB {
        let pair = (increasedContrast ? more[token] : nil) ?? normal[token]!
        return RGB(scheme == .light ? pair.0 : pair.1)
    }
    /// The words on a badge: white on the tone in light, the dark casing colour on the tone in dark.
    public static func badgeText(scheme: MapScheme) -> RGB { RGB(scheme == .light ? 0xFFFFFF : 0x0A110E) }

    // What the ratios in the spec are measured against (apps/web/src/style.css, 2026-09-21).
    public static func land(_ s: MapScheme) -> RGB { RGB(s == .light ? 0xF7F9F6 : 0x141F19) }
    public static func park(_ s: MapScheme) -> RGB { RGB(s == .light ? 0xC4E3C9 : 0x1C3B27) }
    public static func casing(_ s: MapScheme) -> RGB { RGB(s == .light ? 0xFFFFFF : 0x0A110E) }
    /// The ground Increase Contrast is measured against.
    public static func landMoreContrast(_ s: MapScheme) -> RGB { RGB(s == .light ? 0xFFFFFF : 0x0C1512) }
}

/// The `standard` basemap and layer colours — every `--map-*`, `--gw-*` and `--lyr-*` token of
/// apps/web/src/style.css, in its four values: light, dark, and each with Increase Contrast (the web's
/// `prefers-contrast: more`). The numbers live here, not in the app, so that `swift test` can hold them to the
/// web's own file, token for token, and to 3:1 for every pair a frame puts side by side (WCAG 1.4.11).
public enum MapToken: String, Sendable, CaseIterable {
    case out = "--map-out", outInk = "--map-out-ink", land = "--map-land", park = "--map-park", parkInk = "--map-park-ink"
    case road = "--map-road", main = "--map-main", freeway = "--map-fwy", ink = "--map-ink"
    case gwOpen = "--gw-open", gwBuild = "--gw-build", gwFund = "--gw-fund", gwPlan = "--gw-plan", gwCase = "--gw-case"
    case bus = "--lyr-bus", smart = "--lyr-smart", rail = "--lyr-rail", bike = "--lyr-bike"
}

public enum StandardPalette {
    /// light, dark, light with Increase Contrast, dark with Increase Contrast. Where the web's contrast blocks do
    /// not name a token it keeps its plain value, and so it does here.
    private static let table: [MapToken: (UInt32, UInt32, UInt32?, UInt32?)] = [
        .out: (0xE2E9E4, 0x060B09, 0xE8EEEA, 0x000000), .outInk: (0x768079, 0x76827A, 0x4E5853, 0xA9B8B0),
        .land: (0xF7F9F6, 0x141F19, 0xFFFFFF, 0x0C1512), .park: (0xC4E3C9, 0x1C3B27, 0xD8EFDC, 0x123020),
        .parkInk: (0x1D5A31, 0x9FDCB4, 0x0D3F1F, 0xCDF0DA),
        .road: (0x747D77, 0x75827A, 0x4F5A54, 0xA4B3AA), .main: (0x666F69, 0x88968D, 0x333C37, 0xC9D8CE),
        .freeway: (0x926C16, 0xA3863A, 0x6A4D08, 0xDCC079), .ink: (0x2B3A32, 0xD5E2DA, 0x101A15, 0xF2F8F4),
        .gwOpen: (0x0B6B43, 0x4FCF93, nil, nil), .gwBuild: (0xC2701A, 0xE3974A, nil, nil),
        .gwFund: (0x2F6F9E, 0x6AA9D6, nil, nil), .gwPlan: (0x7D8C84, 0x8EA79A, nil, nil), .gwCase: (0xFFFFFF, 0x0A110E, nil, nil),
        .bus: (0x1D4ED8, 0x7AA7FF, nil, nil), .smart: (0x0F766E, 0x4FD1C5, nil, nil),
        .rail: (0x7E22CE, 0xC79BFF, nil, nil), .bike: (0xC2410C, 0xFB923C, nil, nil),
    ]
    public static func color(_ token: MapToken, scheme: MapScheme, increasedContrast: Bool = false) -> RGB {
        let row = table[token]!
        let plain = scheme == .light ? row.0 : row.1
        return RGB(increasedContrast ? (scheme == .light ? row.2 : row.3) ?? plain : plain)
    }
}

// The `standard` basemap's furniture, as the web draws it (apps/web/src/map.ts `draw()`), in points.
/// The ground outside the four cities is a TEXTURE, not a shade: diagonal lines this far apart, this wide, in
/// `--map-out-ink`, which clears 3:1 against both fills. Two pale fills a step apart were 1.20:1.
public let mapHatchSpacing = 11.0, mapHatchWidth = 1.0
/// The city edge is a drawn line too, in `--map-main`.
public let mapBoundaryWidth = 1.5
/// Close in, the big roads (classes 2, 1, 0) get a casing in the land colour, this much wider than the road: it
/// is what keeps a freeway readable where it runs through a park. Not in the quietened basemap.
public let mapRoadCasingExtra = 2.5
public func mapRoadCasingShown(metersPerPoint: Double, quiet: Bool) -> Bool { metersPerPoint < 4 && !quiet }
/// Every transport line of `standard` lies on a casing in `--gw-case`, this much wider than the line (section 2):
/// the casing is what the line's 3:1 is measured against, all the way along.
public let mapLayerCasingExtra = 3.0

/// The quietened basemap (section 4.3): thinner, paler-but-legal streets and a paler park. Every street stays 3:1.
public struct QuietBasemap: Equatable, Sendable {
    public var road: RGB, main: RGB, freeway: RGB, park: RGB, parkInk: RGB, ink: RGB
    /// Street widths × 0.8, never under one point.
    public var widthFactor = 0.8
    /// Street names drop one class, so fewer names compete with badges.
    public var labelClassDrop = 1
    public static func tokens(_ s: MapScheme) -> QuietBasemap {
        s == .light
            ? QuietBasemap(road: RGB(0x818A84), main: RGB(0x7D8680), freeway: RGB(0xA2833D),
                           park: RGB(0xE3F1E5), parkInk: RGB(0x3F6B4C), ink: RGB(0x5A6760))
            : QuietBasemap(road: RGB(0x66756C), main: RGB(0x6C7B73), freeway: RGB(0x837039),
                           park: RGB(0x182C20), parkInk: RGB(0x7FB394), ink: RGB(0xA3B2A9))
    }
}

public enum BasemapKind: String, Sendable { case normal, quiet }

/// The basemap is quietened only in `subway`, only while a network layer is on, and **never** with Increase
/// Contrast: a person who asked for more contrast keeps every street at full strength.
public func basemapTokens(style: MapStyleChoice, networkOn: Bool, increasedContrast: Bool) -> BasemapKind {
    style == .subway && networkOn && !increasedContrast ? .quiet : .normal
}

// MARK: - widths (table 7.1)

public enum SubwayLineKind: String, Sendable, CaseIterable { case busFrequent, busLocal, rail, trunk }

public func subwayLineWidth(_ kind: SubwayLineKind, band: ZoomBand) -> Double {
    switch (kind, band) {
    case (.busFrequent, .far): return 3.5
    case (.busFrequent, .mid): return 5
    case (.busFrequent, .near): return 6
    case (.busLocal, .far): return 2.5
    case (.busLocal, .mid): return 3.5
    case (.busLocal, .near): return 4.5
    case (.rail, .far): return 4.5
    case (.rail, .mid): return 6
    case (.rail, .near): return 7
    case (.trunk, .far): return 5.5
    case (.trunk, .mid): return 8
    case (.trunk, .near): return 10
    }
}
/// Added to the line's width, half each side. Increase Contrast adds one more.
public func subwayCasing(band: ZoomBand, increasedContrast: Bool = false) -> Double {
    (band == .far ? 2 : band == .mid ? 3 : 4) + (increasedContrast ? 1 : 0)
}
public func subwayGap(band: ZoomBand) -> Double { band == .far ? 0 : band == .mid ? 1.5 : 2 }
/// One side-by-side step. Zero at far: every `off` is read as 0 and shared streets are drawn on the centre.
public func subwayStep(band: ZoomBand) -> Double {
    band == .far ? 0 : subwayLineWidth(.busFrequent, band: band) + subwayGap(band: band)
}
/// The bike lanes' double line: two strokes of `stroke`, `gap` apart. At far it is one 1.5-point line.
public func subwayBikeLine(band: ZoomBand) -> (stroke: Double, gap: Double) {
    band == .far ? (1.5, 0) : band == .mid ? (1.25, 2) : (1.5, 2.5)
}
/// Corner radius, badge spacing and simplification tolerance per band (sections 6 and 7.5).
public func subwayCornerRadius(band: ZoomBand) -> Double { band == .far ? 6 : band == .mid ? 10 : 14 }
public func subwayBadgeSpacingMeters(band: ZoomBand) -> Double { band == .far ? 8000 : band == .mid ? 3000 : 1200 }
public func subwaySimplifyMeters(band: ZoomBand) -> Double { band == .far ? 30 : band == .mid ? 10 : 0 }

// MARK: - style resolution

/// A shape that carries identity without colour (Differentiate Without Color, WCAG 1.4.1).
public enum TransitInlay: Equatable, Sendable {
    /// SMART: a `fill` stroke down the centre, a third of the line.
    case stripe(width: Double)
    /// QLINE: `fill` ties across the line, butt caps.
    case ties(width: Double, dash: [Double])
    /// People Mover: "›" every so many points along the loop, pointing the way it runs.
    case chevrons(every: Double, arm: Double, width: Double)
    /// Bike lanes: two thin strokes rather than one.
    case double(gap: Double)
}

public enum TransitMarker: Equatable, Sendable {
    case station(radius: Double, ring: Double)
    /// MoGo: a rounded square in `bike` with a `fill` ring and a `fill` dot.
    case dock(size: Double, corner: Double, ring: Double, dot: Double)
    /// Amtrak: a `fill` square ringed in `rail`, with a bar across it.
    case railStation(size: Double, corner: Double, ring: Double, barWidth: Double, barHeight: Double)
    /// Intercity coach: a `fill` diamond with a dashed `coach` ring.
    case coach(across: Double, ring: Double, dash: [Double])
    /// Park and ride: a `pr` rounded square with a bold P in `fill`.
    case parking(size: Double, corner: Double, letter: Double)
}

public struct TransitBadge: Equatable, Sendable {
    public var text: String
    public var fill: TransitToken
    public var height: Double
    public var fontSize: Double
    public init(text: String, fill: TransitToken, height: Double, fontSize: Double) {
        self.text = text; self.fill = fill; self.height = height; self.fontSize = fontSize
    }
}

/// `standard`: exactly what MapLayers.swift has always answered, and nothing else.
public struct StandardDrawing: Equatable, Sendable {
    public var style: MapLayerStyle
    public var lineWidth: Double
    public var stopRadius: Double
}

public struct SubwayDrawing: Equatable, Sendable {
    public var stroke: TransitToken?
    public var strokeRGB: RGB?
    public var width: Double = 0
    public var casing: TransitToken?
    public var casingWidth: Double = 0
    public var inlay: TransitInlay?
    public var marker: TransitMarker?
    /// From which band the marker is drawn at all.
    public var markerFrom: ZoomBand = .mid
    public var badge: TransitBadge?
    /// True when the badge is drawn in this band without the route being selected (far: rail and frequent only).
    public var badgeShown = false
    public init() {}
}

public enum ResolvedTransit: Equatable, Sendable {
    case standard(StandardDrawing)
    case subway(SubwayDrawing)
}

public struct TransitStyleInput: Sendable {
    public var style: MapStyleChoice
    /// The layer's id as the bundle names it: "ddot_routes", not "go:ddot_routes".
    public var layer: String
    public var route: NetRoute?
    public var metersPerPoint: Double
    public var band: ZoomBand
    public var scheme: MapScheme
    public var increasedContrast: Bool
    public init(style: MapStyleChoice, layer: String, route: NetRoute? = nil, metersPerPoint: Double,
                band: ZoomBand? = nil, scheme: MapScheme = .light, increasedContrast: Bool = false) {
        self.style = style; self.layer = layer; self.route = route; self.metersPerPoint = metersPerPoint
        self.band = band ?? zoomBand(metersPerPoint: metersPerPoint)
        self.scheme = scheme; self.increasedContrast = increasedContrast
    }
}

/// Which colour a route wears. **Read from the data**: `tone` is decided in the pipeline so three clients cannot
/// disagree. Rail and the People Mover are fixed. The agency's own `color` is carried in the file and not used.
public func routeColour(layer: String, route: NetRoute?) -> TransitToken {
    switch layer {
    case "qline": return .rail
    case "people_mover": return .dpm
    default: return .tone(route?.tone ?? 0)
    }
}

/// What a badge says: the route's short name; the first ten characters of the long one when there is none;
/// "FAST 461" for a frequent SMART route at near.
public func badgeText(layer: String, route: NetRoute, band: ZoomBand) -> String {
    let short = route.short.isEmpty ? String(route.long.prefix(10)) : route.short
    return layer == "smart_routes" && route.frequent && band == .near ? "FAST " + short : short
}

/// style × layer × route × zoom band × colour scheme × Increase Contrast → stroke, casing, marker, inlay, badge.
public func resolveTransitStyle(_ i: TransitStyleInput) -> ResolvedTransit {
    if i.style == .standard {
        // Nothing below this line is reached: no route, no band, no scheme, no net data.
        let s = mapLayerStyle("go:" + i.layer)
        return .standard(StandardDrawing(style: s,
                                         lineWidth: mapLayerLineWidth(s, metersPerPoint: i.metersPerPoint),
                                         stopRadius: mapStopRadius(dense: s.dense, metersPerPoint: i.metersPerPoint)))
    }
    let band = i.band, more = i.increasedContrast
    var d = SubwayDrawing()
    func paint(_ t: TransitToken) { d.stroke = t; d.strokeRGB = TransitPalette.color(t, scheme: i.scheme, increasedContrast: more) }
    func badge(_ route: NetRoute, _ t: TransitToken, always: Bool) {
        d.badge = TransitBadge(text: badgeText(layer: i.layer, route: route, band: band), fill: t,
                               height: band == .near ? 18 : 16, fontSize: band == .near ? 12 : 11)
        d.badgeShown = band != .far || always || route.frequent
    }
    let ringExtra = more ? 0.5 : 0
    switch i.layer {
    case "ddot_routes", "smart_routes":
        let t = routeColour(layer: i.layer, route: i.route)
        paint(t)
        d.width = subwayLineWidth(i.route?.frequent == true ? .busFrequent : .busLocal, band: band)
        d.casing = .fill; d.casingWidth = d.width + subwayCasing(band: band, increasedContrast: more)
        if i.layer == "smart_routes", band != .far { d.inlay = .stripe(width: d.width / 3) }
        if let r = i.route { badge(r, t, always: false) }
    case "qline":
        paint(.rail)
        d.width = subwayLineWidth(.rail, band: band)
        d.casing = .fill; d.casingWidth = d.width + subwayCasing(band: band, increasedContrast: more)
        d.inlay = .ties(width: max(1.5, d.width - 3), dash: [1.2 * d.width, 1.8 * d.width])
        d.marker = .station(radius: 4.5, ring: 2 + ringExtra)
        if let r = i.route { badge(r, .rail, always: true) }
    case "people_mover":
        paint(.dpm)
        d.width = subwayLineWidth(.rail, band: band)
        d.casing = .fill; d.casingWidth = d.width + subwayCasing(band: band, increasedContrast: more)
        if band != .far { d.inlay = .chevrons(every: band == .mid ? 90 : 120, arm: 5, width: 1.75) }
        d.marker = .station(radius: 4.5, ring: 2 + ringExtra)
        if let r = i.route { badge(r, .dpm, always: true) }
    case "ddot_stops", "smart_stops":
        paint(.ring)
        d.marker = .station(radius: 3, ring: 1.5 + ringExtra)
        d.markerFrom = .near
    case "bike_lanes":
        paint(.bike)
        let b = subwayBikeLine(band: band)
        d.width = b.stroke
        if b.gap > 0 { d.inlay = .double(gap: b.gap) }
    case "mogo":
        paint(.bike)
        d.marker = .dock(size: band == .near ? 11 : 9, corner: 2.5, ring: 1.5, dot: 1.5)
    case "stations":
        paint(.rail)
        d.marker = .railStation(size: band == .near ? 13 : 11, corner: 1.5, ring: 2.5, barWidth: 7, barHeight: 2)
    case "intercity_bus":
        paint(.coach)
        d.marker = .coach(across: band == .near ? 12 : 10, ring: 2, dash: [3, 2])
    case "park_ride":
        paint(.pr)
        d.marker = .parking(size: 14, corner: 3, letter: 10)
    default:
        paint(.tr5)
    }
    return .subway(d)
}

/// The `.net.json` files this style and these switched-on layers need. **Empty in `standard`, always.**
/// A stops layer's small file is wanted when that layer is on, or when a route of its network is selected.
public func netFilesWanted(style: MapStyleChoice, layersOn: [String],
                           available: [String: String], alsoStopsOf: String? = nil) -> [String: String] {
    guard style == .subway else { return [:] }
    var out: [String: String] = [:]
    for (layer, file) in available where layersOn.contains("go:" + layer) || layer == alsoStopsOf { out[layer] = file }
    return out
}

/// How one layer is actually drawn this frame. `subway` needs the layer's network file **held**; while it is still
/// coming, or when it could not be read, was refused or failed its checksum, the layer goes on drawing `standard`
/// (and the layers sheet says so). A held file never changes what `standard` draws.
public func drawnStyle(chosen: MapStyleChoice, netHeld: Bool) -> MapStyleChoice {
    chosen == .subway && netHeld ? .subway : .standard
}

// MARK: - the .net.json files

public struct NetEnd: Equatable, Sendable { public var x: Double, y: Double, name: String }

public struct NetRoute: Equatable, Sendable {
    public var id: String
    public var short: String
    public var long: String
    public var tone: Int
    /// The agency's own colours, where its feed publishes them. Carried, not drawn (section 4.2).
    public var color: String?
    public var text: String?
    public var frequent: Bool
    /// The agency's published weekday figure, in minutes. Worded as theirs, never as live.
    public var headway: Int?
    public var loop: Bool
    /// True when the line is a drawing through the stations rather than the owner's own track (the QLINE).
    public var derived: Bool
    public var lines: [Int]
    public var stops: [[Int]]
    public var ends: [NetEnd]

    public init(id: String, short: String, long: String, tone: Int, color: String? = nil, text: String? = nil,
                frequent: Bool = false, headway: Int? = nil, loop: Bool = false, derived: Bool = false,
                lines: [Int] = [], stops: [[Int]] = [], ends: [NetEnd] = []) {
        self.id = id; self.short = short; self.long = long; self.tone = tone; self.color = color; self.text = text
        self.frequent = frequent; self.headway = headway; self.loop = loop; self.derived = derived
        self.lines = lines; self.stops = stops; self.ends = ends
    }

    /// "4 Woodward", and "QLINE" rather than "QLINE QLINE".
    public var label: String {
        if short.isEmpty { return long }
        if long.isEmpty || long.lowercased() == short.lowercased() { return short }
        return short + " " + long
    }
    /// How many different stops the route calls at, both directions together.
    public var stopCount: Int { Set(stops.flatMap { $0 }).count }
}

/// One stretch of a line: from this vertex, drawn `off` half-steps to the left, shared by `n` routes.
public struct NetRun: Equatable, Sendable {
    public var from: Int, off: Int, n: Int
    public init(from: Int, off: Int, n: Int) { self.from = from; self.off = off; self.n = n }
    /// More than four routes on one street is a trunk: drawn once, in the trunk colour, on the centre.
    public var isTrunk: Bool { n > 4 }
}

public struct NetLine: Equatable, Sendable {
    public var route: Int
    public var points: [Double]
    public var runs: [NetRun]
    public var box: MapBox
}

public struct NetInterchange: Equatable, Sendable {
    public var x: Double, y: Double
    public var name: String
    public var routes: [Int]
    /// The two ends of the pill, in map units.
    public var ax: Double, ay: Double, bx: Double, by: Double
}

public struct NetTrunk: Equatable, Sendable { public var x: Double, y: Double, routes: [Int] }

/// A whole `<routes>.net.json`, decoded. It stands on its own: the subway lines are drawn from this alone.
public struct TransitNet: Equatable, Sendable {
    public var id: String
    public var system: String
    public var agency: String
    public var agencyURL: String?
    public var stopsLayer: String
    public var routes: [NetRoute]
    public var lines: [NetLine]
    public var interchanges: [NetInterchange]
    public var trunks: [NetTrunk]
    /// Rail files fold the stops file in: `serves[i]` belongs to `points[i]` of the standard layer.
    public var serves: [[Int]]?
}

/// A `<stops>.net.json`: which routes call at each stop of the unchanged stops layer.
public struct TransitServes: Equatable, Sendable {
    public var id: String
    public var routesLayer: String
    public var routeIds: [String]
    public var serves: [[Int]]
}

/// A place where stations of different systems are a short walk apart (`places/transit.json` `hubs`).
public struct TransitHub: Equatable, Sendable, Identifiable {
    public struct Stop: Equatable, Sendable, Decodable { public var layer: String; public var name: String }
    public var x: Double, y: Double
    public var ax: Double, ay: Double, bx: Double, by: Double
    public var name: String
    public var layers: [String]
    public var stops: [Stop]
    public var id: String { "hub:" + name }
    /// Drawn when two or more of its layers are on.
    public func shows(layersOn: [String]) -> Bool { layers.filter { layersOn.contains("go:" + $0) }.count >= 2 }
}

public enum NetFileError: Error, Equatable { case unsupportedVersion(Int), malformed }

extension MapFileDecoder {
    /// Only for a bundle from before hubs carried their own `origin` (2026-09-21): the transit grid every transit
    /// layer uses (pipeline/src/ingest-transit.ts `ORIGIN`). A hub that says its origin is placed by what it says.
    public static let transitOrigin: [Double] = [-83.32, 42.22]

    private static func unit(_ x: Int, _ y: Int, _ origin: [Double]) -> (Double, Double) {
        (MapProjection.x(lon: origin[0] + Double(x) / 1e5), MapProjection.y(lat: origin[1] + Double(y) / 1e5))
    }

    struct NetRouteFile: Decodable {
        var id: String, short: String?, long: String?, tone: Int?
        var color: String?, text: String?, frequent: Bool?, headway: Int?, loop: Bool?, derived: Bool?
        var lines: [Int]?, stops: [[Int]]?, ends: [[Int]]?
    }
    struct InterchangeFile: Decodable {
        var x: Int, y: Int, name: Int, routes: [Int], span: [Int]
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            x = try c.decode(Int.self); y = try c.decode(Int.self); name = try c.decode(Int.self)
            routes = try c.decode([Int].self); span = try c.decode([Int].self)
        }
    }
    struct TrunkFile: Decodable {
        var x: Int, y: Int, routes: [Int]
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            x = try c.decode(Int.self); y = try c.decode(Int.self); routes = try c.decode([Int].self)
        }
    }
    struct NetFile: Decodable {
        var id: String, v: Int
        var origin: [Double]?, names: [String]?, lines: [NamedLine]?
        var system: String?, agency: String?, agency_url: String?, stops_layer: String?, routes_layer: String?
        var routes: [NetRouteFile]?, runs: [[Int]]?, interchanges: [InterchangeFile]?, trunks: [TrunkFile]?
        var route_ids: [String]?, serves: [[Int]]?
    }
    private struct VersionOnly: Decodable { var v: Int? }

    /// A routes network. A file that is not format 2 is refused, and the layer goes on drawing `standard`.
    /// Anything that points outside the file (a route naming a line that is not there) is dropped, never trusted.
    public static func net(_ data: Data) throws -> TransitNet {
        let dec = JSONDecoder()
        let v = (try? dec.decode(VersionOnly.self, from: data))?.v ?? 0
        guard v == 2 else { throw NetFileError.unsupportedVersion(v) }
        let f = try dec.decode(NetFile.self, from: data)
        guard let origin = f.origin, origin.count >= 2, let fileLines = f.lines, let fileRoutes = f.routes else {
            throw NetFileError.malformed
        }
        let names = f.names ?? []
        func name(_ i: Int) -> String { i < 0 || i >= names.count ? "" : names[i] }

        var owner = [Int](repeating: -1, count: fileLines.count)
        let routes: [NetRoute] = fileRoutes.enumerated().map { ri, r in
            let mine = (r.lines ?? []).filter { $0 >= 0 && $0 < fileLines.count }
            for l in mine { owner[l] = ri }
            let ends: [NetEnd] = (r.ends ?? []).compactMap { e in
                guard e.count >= 3 else { return nil }
                let p = unit(e[0], e[1], origin)
                return NetEnd(x: p.0, y: p.1, name: name(e[2]))
            }
            return NetRoute(id: r.id, short: r.short ?? "", long: r.long ?? "", tone: r.tone ?? 0,
                            color: r.color, text: r.text, frequent: r.frequent ?? false, headway: r.headway,
                            loop: r.loop ?? false, derived: r.derived ?? false, lines: mine,
                            stops: r.stops ?? [], ends: ends)
        }
        let lines: [NetLine] = fileLines.enumerated().map { li, l in
            let pts = polyline(l.enc, origin: origin)
            let count = pts.count / 2
            var runs: [NetRun] = []
            let flat = f.runs.flatMap { li < $0.count ? $0[li] : nil } ?? []
            var k = 0
            while k + 2 < flat.count {
                let from = max(0, min(count - 1, flat[k]))
                if runs.last.map({ from > $0.from }) ?? true { runs.append(NetRun(from: from, off: flat[k + 1], n: flat[k + 2])) }
                k += 3
            }
            if runs.isEmpty || runs[0].from != 0 { runs.insert(NetRun(from: 0, off: 0, n: 1), at: 0) }
            return NetLine(route: owner[li], points: pts, runs: runs, box: MapBox.around(pts))
        }
        let interchanges: [NetInterchange] = (f.interchanges ?? []).map { c in
            let p = unit(c.x, c.y, origin)
            let s = c.span.count >= 4 ? c.span : [0, 0, 0, 0]
            let a = unit(c.x + s[0], c.y + s[1], origin), b = unit(c.x + s[2], c.y + s[3], origin)
            return NetInterchange(x: p.0, y: p.1, name: name(c.name),
                                  routes: c.routes.filter { $0 >= 0 && $0 < routes.count },
                                  ax: a.0, ay: a.1, bx: b.0, by: b.1)
        }
        let trunks: [NetTrunk] = (f.trunks ?? []).map { t in
            let p = unit(t.x, t.y, origin)
            return NetTrunk(x: p.0, y: p.1, routes: t.routes.filter { $0 >= 0 && $0 < routes.count })
        }
        return TransitNet(id: f.id, system: f.system ?? "", agency: f.agency ?? "", agencyURL: f.agency_url,
                          stopsLayer: f.stops_layer ?? "", routes: routes, lines: lines,
                          interchanges: interchanges, trunks: trunks, serves: f.serves)
    }

    /// A stops network's small file.
    public static func netServes(_ data: Data) throws -> TransitServes {
        let dec = JSONDecoder()
        let v = (try? dec.decode(VersionOnly.self, from: data))?.v ?? 0
        guard v == 2 else { throw NetFileError.unsupportedVersion(v) }
        let f = try dec.decode(NetFile.self, from: data)
        guard let serves = f.serves, let ids = f.route_ids else { throw NetFileError.malformed }
        return TransitServes(id: f.id, routesLayer: f.routes_layer ?? f.id, routeIds: ids, serves: serves)
    }

    struct HubFile: Decodable {
        /// What `at` and `span` count from ([lon, lat]). A bundle from before 2026-09-21 has none.
        var origin: [Double]?
        var at: [Int], span: [Int], name: String, layers: [String], stops: [TransitHub.Stop]
    }
    struct PlacesTransitFile: Decodable {
        struct Layer: Decodable {
            struct Net: Decodable { var file: String; var v: Int }
            var id: String
            var net: Net?
        }
        var layers: [Layer]
        var hubs: [HubFile]?
    }

    /// What `places/transit.json` says about the subway style: which layers carry a format-2 network file, and
    /// the hubs. An old bundle has neither, and the "Map style" control is then not offered at all.
    public static func transitExtras(_ data: Data) -> (netFiles: [String: String], hubs: [TransitHub]) {
        guard let f = try? JSONDecoder().decode(PlacesTransitFile.self, from: data) else { return ([:], []) }
        var files: [String: String] = [:]
        for l in f.layers { if let n = l.net, n.v == 2 { files[l.id] = n.file } }
        let hubs: [TransitHub] = (f.hubs ?? []).compactMap { h in
            guard h.at.count >= 2, h.span.count >= 4 else { return nil }
            let origin = (h.origin?.count ?? 0) >= 2 ? h.origin! : transitOrigin
            let p = unit(h.at[0], h.at[1], origin)
            let a = unit(h.at[0] + h.span[0], h.at[1] + h.span[1], origin)
            let b = unit(h.at[0] + h.span[2], h.at[1] + h.span[3], origin)
            return TransitHub(x: p.0, y: p.1, ax: a.0, ay: a.1, bx: b.0, by: b.1,
                              name: h.name, layers: h.layers, stops: h.stops)
        }
        return (files, hubs)
    }
}

// MARK: - geometry (section 6)

/// A drawing instruction in map units. `quad` is `addQuadCurve` / `quadraticCurveTo` / `quadTo`.
public enum PathCommand: Equatable, Sendable {
    case move(Double, Double)
    case line(Double, Double)
    case quad(cx: Double, cy: Double, x: Double, y: Double)
}

public enum SubwayGeometry {
    /// Douglas–Peucker over a flat run of x, y pairs. `tolerance` is in the same units as the points.
    public static func simplify(_ pts: [Double], tolerance: Double) -> [Double] {
        let n = pts.count / 2
        guard tolerance > 0, n > 2 else { return pts }
        var keep = [Bool](repeating: false, count: n)
        keep[0] = true; keep[n - 1] = true
        var stack = [(0, n - 1)]
        while let (a, b) = stack.popLast() {
            guard b > a + 1 else { continue }
            var far = -1, best = tolerance
            for i in (a + 1)..<b {
                let d = MapHit.distanceToSegment(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1])
                if d > best { best = d; far = i }
            }
            if far >= 0 { keep[far] = true; stack.append((a, far)); stack.append((far, b)) }
        }
        var out = [Double](); out.reserveCapacity(pts.count)
        for i in 0..<n where keep[i] { out.append(pts[2 * i]); out.append(pts[2 * i + 1]) }
        return out
    }

    /// A line cut into its runs, each simplified **on its own** so that run boundaries survive.
    public struct PreparedRun: Equatable, Sendable {
        public var off: Int, n: Int
        public var points: [Double]
        public var isTrunk: Bool { n > 4 }
    }
    public static func prepare(_ line: NetLine, band: ZoomBand) -> [PreparedRun] {
        let tol = subwaySimplifyMeters(band: band) / MapProjection.metersPerUnit
        let count = line.points.count / 2
        return line.runs.enumerated().compactMap { i, r in
            let to = i + 1 < line.runs.count ? line.runs[i + 1].from : count - 1
            guard to > r.from else { return nil }
            let piece = Array(line.points[(2 * r.from)...(2 * to + 1)])
            return PreparedRun(off: r.off, n: r.n, points: simplify(piece, tolerance: tol))
        }
    }

    /// A run shifted sideways by `offset` (same units as the points), to the **left of its own direction of
    /// travel with north up**. y grows downwards here as on a screen, so for a direction (dx, dy) left is
    /// (dy, −dx). Inside the run a vertex moves along the mitre of its two normals, never more than twice as far.
    public static func offsetRun(_ pts: [Double], offset o: Double) -> [Double] {
        let n = pts.count / 2
        guard o != 0, n >= 2 else { return pts }
        // Unit normals per segment; a zero-length segment borrows its neighbour's.
        var nx = [Double](repeating: 0, count: n - 1), ny = nx
        var last: (Double, Double)?
        for i in 0..<(n - 1) {
            let dx = pts[2 * i + 2] - pts[2 * i], dy = pts[2 * i + 3] - pts[2 * i + 1], len = (dx * dx + dy * dy).squareRoot()
            if len > 0 { last = (dy / len, -dx / len) }
            if let l = last { nx[i] = l.0; ny[i] = l.1 }
        }
        if let first = (0..<(n - 1)).first(where: { nx[$0] != 0 || ny[$0] != 0 }) {
            for i in 0..<first { nx[i] = nx[first]; ny[i] = ny[first] }
        } else { return pts }
        var out = [Double](); out.reserveCapacity(pts.count)
        for i in 0..<n {
            let (ix, iy) = i == 0 ? (nx[0], ny[0]) : (nx[i - 1], ny[i - 1])
            let (ox, oy) = i == n - 1 ? (nx[n - 2], ny[n - 2]) : (nx[i], ny[i])
            var mx = ix + ox, my = iy + oy
            let ml = (mx * mx + my * my).squareRoot()
            if ml < 1e-12 { mx = ox; my = oy } else { mx /= ml; my /= ml }
            let k = o / max(0.5, mx * ox + my * oy)
            out.append(pts[2 * i] + mx * k); out.append(pts[2 * i + 1] + my * k)
        }
        return out
    }

    /// Round every corner with one quadratic curve: line to P − r·t_in, then a quad through P to P + r·t_out,
    /// r = min(R, half of each neighbouring segment). A turn under 8° is left alone. A closed line (the People
    /// Mover) starts half-way along its first segment, so the corner where it closes is rounded like the rest.
    public static func roundCorners(_ input: [Double], radius R: Double, closed: Bool = false) -> [PathCommand] {
        var pts = [Double](); pts.reserveCapacity(input.count)
        var i = 0
        while i + 1 < input.count {                            // drop repeats: a repeat has no direction
            if pts.count < 2 || pts[pts.count - 2] != input[i] || pts[pts.count - 1] != input[i + 1] {
                pts.append(input[i]); pts.append(input[i + 1])
            }
            i += 2
        }
        var n = pts.count / 2
        guard n >= 2 else { return [] }
        if closed, n >= 4, pts[0] == pts[pts.count - 2], pts[1] == pts[pts.count - 1] {
            let mx = (pts[0] + pts[2]) / 2, my = (pts[1] + pts[3]) / 2
            pts = [mx, my] + Array(pts[2...]) + [mx, my]
            n = pts.count / 2
        }
        var out: [PathCommand] = [.move(pts[0], pts[1])]
        let minTurn = cos(8 * Double.pi / 180)
        for v in 1..<(n - 1) where R > 0 {
            let px = pts[2 * v], py = pts[2 * v + 1]
            var ix = px - pts[2 * v - 2], iy = py - pts[2 * v - 1]
            var ox = pts[2 * v + 2] - px, oy = pts[2 * v + 3] - py
            let il = (ix * ix + iy * iy).squareRoot(), ol = (ox * ox + oy * oy).squareRoot()
            ix /= il; iy /= il; ox /= ol; oy /= ol
            if ix * ox + iy * oy > minTurn { out.append(.line(px, py)); continue }
            let r = min(R, il / 2, ol / 2)
            out.append(.line(px - r * ix, py - r * iy))
            out.append(.quad(cx: px, cy: py, x: px + r * ox, y: py + r * oy))
        }
        if R <= 0 { for v in 1..<(n - 1) { out.append(.line(pts[2 * v], pts[2 * v + 1])) } }
        out.append(.line(pts[2 * n - 2], pts[2 * n - 1]))
        return out
    }

    /// One line, ready to draw at one scale: the route's own stretches (offset, joined across run boundaries by a
    /// short diagonal, never a gap) and its trunk stretches (on the centre, drawn once in the trunk colour).
    public struct BuiltLine: Equatable, Sendable {
        public var route: Int
        public var box: MapBox
        /// The offset polylines, for hit-testing against what is actually drawn.
        public var own: [[Double]]
        public var trunk: [[Double]]
        public var ownCommands: [PathCommand]
        public var trunkCommands: [PathCommand]
    }

    /// `step` and `radius` are in map units (points ÷ scale): the device does no bearing logic, it only reads
    /// `off` and shifts left by `off × step / 2`.
    public static func build(route: Int, runs: [PreparedRun], step: Double, radius: Double, closed: Bool) -> BuiltLine {
        var own: [[Double]] = [], trunk: [[Double]] = []
        var open: [Double] = []
        func flush() { if open.count >= 4 { own.append(open) }; open = [] }
        for (i, r) in runs.enumerated() {
            if r.isTrunk {
                // The route's own stroke runs on to the trunk's first point, so there is never a gap under it.
                if !open.isEmpty, r.points.count >= 2 { open.append(r.points[0]); open.append(r.points[1]) }
                flush()
                trunk.append(r.points)
                if i + 1 < runs.count, !runs[i + 1].isTrunk, r.points.count >= 2 {
                    open = [r.points[r.points.count - 2], r.points[r.points.count - 1]]
                }
            } else {
                open.append(contentsOf: offsetRun(r.points, offset: Double(r.off) * step / 2))
            }
        }
        flush()
        let isLoop = closed && own.count == 1 && trunk.isEmpty
        var box = MapBox.empty
        for l in own + trunk { box = box.union(MapBox.around(l)) }
        return BuiltLine(route: route, box: box, own: own, trunk: trunk,
                         ownCommands: own.flatMap { roundCorners($0, radius: radius, closed: isLoop) },
                         trunkCommands: trunk.flatMap { roundCorners($0, radius: radius) })
    }

    // MARK: badges along a line

    public struct BadgeAnchor: Equatable, Sendable {
        public var meters: Double
        public var x: Double, y: Double
        /// The unit normal to the left of travel, and the run's `off`, so the badge sits on the shifted line.
        public var leftX: Double, leftY: Double
        public var off: Int
    }

    /// Where badges go: at `spacing / 2 + k × spacing` metres from the line's start. World-anchored, so badges do
    /// not swim when the map pans. An anchor inside a trunk run is skipped: a trunk has one stacked badge instead.
    public static func badgeAnchors(_ pts: [Double], runs: [NetRun], spacingMeters: Double) -> [BadgeAnchor] {
        let n = pts.count / 2
        guard n >= 2, spacingMeters > 0 else { return [] }
        var out: [BadgeAnchor] = []
        var want = spacingMeters / 2, walked = 0.0, run = 0
        for i in 0..<(n - 1) {
            while run + 1 < runs.count, runs[run + 1].from <= i { run += 1 }
            let dx = pts[2 * i + 2] - pts[2 * i], dy = pts[2 * i + 3] - pts[2 * i + 1]
            let len = (dx * dx + dy * dy).squareRoot() * MapProjection.metersPerUnit
            while len > 0, want <= walked + len {
                let u = (want - walked) / len
                if !(run < runs.count && runs[run].isTrunk) {
                    let ul = len / MapProjection.metersPerUnit
                    out.append(BadgeAnchor(meters: want, x: pts[2 * i] + dx * u, y: pts[2 * i + 1] + dy * u,
                                           leftX: dy / ul, leftY: -dx / ul, off: run < runs.count ? runs[run].off : 0))
                }
                want += spacingMeters
            }
            walked += len
        }
        return out
    }

    /// Evenly spaced places along a polyline given in **screen points**, with the direction of travel at each:
    /// the People Mover's chevrons.
    public static func marksAlong(_ pts: [Double], every: Double) -> [(x: Double, y: Double, angle: Double)] {
        guard every > 0 else { return [] }
        var out: [(Double, Double, Double)] = []
        var want = every / 2, walked = 0.0
        var i = 0
        while i + 3 < pts.count {
            let dx = pts[i + 2] - pts[i], dy = pts[i + 3] - pts[i + 1], len = (dx * dx + dy * dy).squareRoot()
            while len > 0, want <= walked + len {
                let u = (want - walked) / len
                out.append((pts[i] + dx * u, pts[i + 1] + dy * u, atan2(dy, dx)))
                want += every
            }
            walked += len
            i += 2
        }
        return out
    }
}

// MARK: - a whole network, prepared once

/// What the painter needs from one network file: each band's simplified runs and badge anchors, worked out once
/// (off the main actor) when the file is decoded, never per frame.
public struct PreparedNet: Equatable, Sendable {
    public var net: TransitNet
    public var runs: [ZoomBand: [[SubwayGeometry.PreparedRun]]]
    public var anchors: [ZoomBand: [[SubwayGeometry.BadgeAnchor]]]

    public init(_ net: TransitNet) {
        self.net = net
        var runs: [ZoomBand: [[SubwayGeometry.PreparedRun]]] = [:]
        var anchors: [ZoomBand: [[SubwayGeometry.BadgeAnchor]]] = [:]
        for band in ZoomBand.allCases {
            runs[band] = net.lines.map { SubwayGeometry.prepare($0, band: band) }
            // Badges ride along a route's FIRST line only.
            anchors[band] = net.routes.map { r in
                guard let first = r.lines.first, first < net.lines.count else { return [] }
                let line = net.lines[first]
                return SubwayGeometry.badgeAnchors(line.points, runs: line.runs, spacingMeters: subwayBadgeSpacingMeters(band: band))
            }
        }
        self.runs = runs; self.anchors = anchors
    }

    /// Every line at one scale. `scale` is points per map unit.
    public func built(band: ZoomBand, scale: Double) -> [SubwayGeometry.BuiltLine] {
        let step = subwayStep(band: band) / scale, radius = subwayCornerRadius(band: band) / scale
        return zip(net.lines, runs[band] ?? []).compactMap { line, r in
            guard line.route >= 0, line.route < net.routes.count else { return nil }   // a line no route owns is not drawn
            return SubwayGeometry.build(route: line.route, runs: r, step: step, radius: radius,
                                 closed: net.routes[line.route].loop)
        }
    }
}

/// The scale a geometry cache is keyed on: an eighth of an octave, so a drag (one scale) reuses every path and a
/// pinch rebuilds them a few times rather than every frame. Offsets are then within 4.5 % of exact.
public func subwayScaleBucket(_ scale: Double) -> Int { Int((log2(max(scale, 1e-9)) * 8).rounded()) }
public func subwayBucketScale(_ bucket: Int) -> Double { pow(2, Double(bucket) / 8) }

// MARK: - what is drawn at which zoom

public struct StationPlan: Equatable, Sendable {
    public var hubs = true
    public var terminals = false
    /// Interchanges of at least this many routes; 0 means none.
    public var interchangeMinRoutes = 0
    public var railStations = false
    public var markers = false
    /// Every stop of a stops layer that is on.
    public var stops = false
    /// The selected route's own stops.
    public var selectedStops = false
    public var terminalNames = false
    public var railStationNames = false
}

public func stationsFor(band: ZoomBand, metersPerPoint: Double, hasSelection: Bool) -> StationPlan {
    var p = StationPlan()
    guard band != .far else { return p }
    p.terminals = true; p.railStations = true; p.markers = true
    p.interchangeMinRoutes = band == .mid ? 3 : 2
    p.selectedStops = hasSelection
    p.stops = band == .near
    p.terminalNames = band == .near
    p.railStationNames = metersPerPoint <= 6
    return p
}

// MARK: - badges: who gets one of the 24

public struct LabelRect: Equatable, Sendable {
    public var x: Double, y: Double, width: Double, height: Double      // centre and size, in points
    public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height }
    public func overlaps(_ o: LabelRect, margin: Double = 2) -> Bool {
        abs(x - o.x) * 2 < width + o.width + margin * 2 && abs(y - o.y) * 2 < height + o.height + margin * 2
    }
}

public struct BadgeCandidate: Equatable, Sendable {
    /// The settled order (docs/MAP-STYLE.md 7.5, the same on every client): the selected route, rail, trunk
    /// badges, frequent routes, the rest.
    public enum Rank: Int, Sendable, Comparable {
        case selected = 0, rail, trunk, frequent, other
        public static func < (a: Rank, b: Rank) -> Bool { a.rawValue < b.rawValue }
    }
    public var id: String
    public var text: String
    public var rank: Rank
    /// The route's place in rider order (`riderOrder`); for a trunk badge, its own number. Badges of one route
    /// share one `rank` and one `order`, which is how a route's badges are known to belong together.
    public var order: Int
    public var rect: LabelRect
    public var distanceToCentre: Double
    public init(id: String, text: String, rank: Rank, order: Int, rect: LabelRect, distanceToCentre: Double) {
        self.id = id; self.text = text; self.rank = rank; self.order = order; self.rect = rect; self.distanceToCentre = distanceToCentre
    }
}

public let subwayBadgeCap = 24

/// Rider order across networks: by the number on the front of the bus, then DDOT before SMART, then the order in
/// the file; a route with no number (QLINE, DPM) comes last. The same key the web uses.
public func riderOrder(short: String, system: String, index: Int) -> Int {
    let digits = short.prefix { $0.isASCII && $0.isNumber }
    let n = Int(digits) ?? 9000
    let sys = ["ddot", "smart"].firstIndex(of: system) ?? 2
    return n * 1_000_000 + sys * 1000 + index
}

/// The order badges claim room in: every badge of the selected route first (nearest the middle first); then
/// ROUND-ROBIN — every route's first badge (its nearest to the middle) before any route's second, and so on —
/// and inside one round by rank (rail, trunk badges, frequent routes, the rest), then rider order.
/// Claimed strictly route by route, the first few routes in rider order took all 24 at city zoom and the other
/// thirty lines on the screen had no name at all (seen in the simulator, 2026-09-21).
public func badgeOrder(_ candidates: [BadgeCandidate]) -> [BadgeCandidate] {
    var turn: [String: Int] = [:]
    var seen: [String: Int] = [:]
    for c in candidates.sorted(by: { $0.distanceToCentre != $1.distanceToCentre ? $0.distanceToCentre < $1.distanceToCentre : $0.id < $1.id }) {
        let key = "\(c.rank.rawValue)|\(c.order)"
        turn[c.id] = c.rank == .selected ? 0 : seen[key, default: 0]
        seen[key, default: 0] += 1
    }
    return candidates.sorted { a, b in
        if (a.rank == .selected) != (b.rank == .selected) { return a.rank == .selected }
        let (ta, tb) = (turn[a.id] ?? 0, turn[b.id] ?? 0)
        if ta != tb { return ta < tb }
        if a.rank != b.rank { return a.rank < b.rank }
        if a.order != b.order { return a.order < b.order }
        if a.distanceToCentre != b.distanceToCentre { return a.distanceToCentre < b.distanceToCentre }
        return a.id < b.id
    }
}

/// The badges that draw this frame: `badgeOrder`, until 24 are PLACED. A badge that would sit on something
/// already placed (`taken`: terminals, hubs, interchanges — all of higher priority — and the badges before it)
/// is dropped, never shrunk or overlapped, and does not use up one of the 24.
public func claimBadges(_ candidates: [BadgeCandidate], taken: [LabelRect] = [], cap: Int = subwayBadgeCap) -> [BadgeCandidate] {
    var placed = taken, out: [BadgeCandidate] = []
    for c in badgeOrder(candidates) {
        if out.count >= cap { break }
        if placed.contains(where: { $0.overlaps(c.rect) }) { continue }
        placed.append(c.rect); out.append(c)
    }
    return out
}

/// How wide a badge is: text width plus 5 points each side, never narrower than it is tall.
public func badgeWidth(textWidth: Double, height: Double, padding: Double = 5) -> Double { max(height, textWidth + padding * 2) }

/// Badges and labels follow the text size, up to × 1.5.
public func subwayTextScale(_ platformScale: Double) -> Double { max(1, min(1.5, platformScale)) }

/// A trunk's stacked badge: the members' short names in rider order, six at most, then "+N".
public func trunkBadgeText(_ shorts: [String]) -> String {
    let head = shorts.prefix(6).joined(separator: " · ")
    return shorts.count > 6 ? head + " +\(shorts.count - 6)" : head
}

// MARK: - tapping

public struct HitGlyph: Equatable, Sendable {
    public enum Kind: Int, Sendable { case selected = 0, terminal, hub, interchange, badge, marker, stop }
    public var id: String
    public var kind: Kind
    public var x: Double, y: Double
    public init(id: String, kind: Kind, x: Double, y: Double) { self.id = id; self.kind = kind; self.x = x; self.y = y }
}

/// Everything whose 44 × 44 point box holds the finger, in the label priority of section 8 and then nearest first.
public func subwayHits(x: Double, y: Double, glyphs: [HitGlyph], box: Double = 44) -> [HitGlyph] {
    glyphs.filter { abs($0.x - x) <= box / 2 && abs($0.y - y) <= box / 2 }
        .sorted { a, b in
            if a.kind.rawValue != b.kind.rawValue { return a.kind.rawValue < b.kind.rawValue }
            let da = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y), db = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y)
            return da != db ? da < db : a.id < b.id
        }
}

/// The thing a tap selects. A second tap in the same place moves on to the next thing under the finger.
public func subwayHitTest(x: Double, y: Double, glyphs: [HitGlyph], previous: String? = nil) -> HitGlyph? {
    let hits = subwayHits(x: x, y: y, glyphs: glyphs)
    guard !hits.isEmpty else { return nil }
    if let previous, let i = hits.firstIndex(where: { $0.id == previous }) { return hits[(i + 1) % hits.count] }
    return hits[0]
}

// MARK: - reading order

public let subwayFeatureCap = 40
/// Of the 40, at most this many terminals and interchanges — so that downtown, where a hundred interchanges are
/// in view, VoiceOver still reaches the ROUTES. Hubs are never capped (there are four); routes take whatever room
/// is left, which is never less than 40 − 4 − 8 − 20 = 8.
public let subwayTerminalFeatureCap = 8, subwayInterchangeFeatureCap = 20

/// VoiceOver's order is `standard`'s order, **only ever appended to**: what was there first stays first and in
/// the same order, then hubs, terminals, interchanges (nearest the middle first — the caller sorts them) and
/// routes in rider order. At most 40 are added, of which at most 8 terminals and 20 interchanges; `more` is how
/// many the list still has.
public func featureOrder<T>(existing: [T], hubs: [T], terminals: [T], interchanges: [T], routes: [T],
                            cap: Int = subwayFeatureCap) -> (items: [T], more: Int) {
    let extra = hubs + terminals.prefix(subwayTerminalFeatureCap) + interchanges.prefix(subwayInterchangeFeatureCap) + routes
    let all = hubs.count + terminals.count + interchanges.count + routes.count
    return (existing + extra.prefix(cap), max(0, all - min(cap, extra.count)))
}
