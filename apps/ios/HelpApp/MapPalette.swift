// The map's colours. The `standard` basemap, the greenway and the layer colours are the web's own tokens
// (apps/web/src/style.css `--map-*`, `--gw-*`, `--lyr-*`) in all four of their values — light, dark, and each
// with Increase Contrast, the web's `prefers-contrast: more` — and the numbers live in HelpCore
// (`StandardPalette`), where `swift test` holds them to the web's file token for token and to 3:1 for every pair
// a frame puts side by side: every street against the land AND a park, the hatch outside the four cities against
// both grounds, every line against its casing (docs/ACCESSIBILITY-AUDIT-2026-09-20, WCAG 1.4.11).
//
// Colour never carries a meaning on its own anywhere on this map: a greenway phase also has its own dash pattern
// and its own words, a status is words, and every layer is named in the switcher, in the tapped card and in the
// list (Differentiate Without Color).
import HelpCore
import SwiftUI
import UIKit

private func mapPair(_ light: UInt32, _ dark: UInt32) -> Color {
    func c(_ v: UInt32) -> UIColor {
        UIColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
    }
    return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? c(dark) : c(light) })
}

extension Color {
    /// A colour from HelpCore's palette tables (the `--tr-*` tokens and the quietened basemap of docs/MAP-STYLE.md),
    /// where the numbers live so that `swift test` can hold them to the spec's contrast ratios. They arrive
    /// already resolved for light or dark and for Increase Contrast, so this is a plain colour, not a dynamic one.
    init(rgb c: RGB) { self.init(red: Double(c.r) / 255, green: Double(c.g) / 255, blue: Double(c.b) / 255) }
}

/// One of the web's map tokens as a dynamic colour: it follows light / dark AND Increase Contrast, wherever it is
/// used (the Canvas resolves it against the environment, as it does every other colour).
private func mapToken(_ t: MapToken) -> Color {
    func c(_ v: RGB) -> UIColor { UIColor(red: CGFloat(v.r) / 255, green: CGFloat(v.g) / 255, blue: CGFloat(v.b) / 255, alpha: 1) }
    return Color(uiColor: UIColor { traits in
        c(StandardPalette.color(t, scheme: traits.userInterfaceStyle == .dark ? .dark : .light,
                                increasedContrast: traits.accessibilityContrast == .high))
    })
}

enum MapColor {
    // The ground
    static let outside = mapToken(.out)                     // beyond the four cities, under the hatch
    static let outsideInk = mapToken(.outInk)               // the hatch itself: 3:1 against both grounds
    static let land = mapToken(.land)
    static let park = mapToken(.park)
    static let parkInk = mapToken(.parkInk)
    // The streets: all three clear 3:1 against the land and against a park; width carries the hierarchy
    static let road = mapToken(.road)
    static let main = mapToken(.main)
    static let freeway = mapToken(.freeway)
    static let ink = mapToken(.ink)                         // street names
    // The greenway, drawn like a transit line
    static let gwOpen = mapToken(.gwOpen)
    static let gwBuild = mapToken(.gwBuild)
    static let gwFund = mapToken(.gwFund)
    static let gwPlan = mapToken(.gwPlan)
    static let gwCase = mapToken(.gwCase)                   // the casing under the greenway AND under every transport line
    // The transport layers
    static let bus = mapToken(.bus)
    static let smart = mapToken(.smart)
    static let rail = mapToken(.rail)
    static let bike = mapToken(.bike)
    // Our own listings, one colour per help group
    static let grpFood = mapPair(0xA16207, 0xE3B341)
    static let grpShelter = mapPair(0x4338CA, 0xA5B4FC)
    static let grpHealth = mapPair(0xBE185D, 0xF9A8D4)
    static let grpRec = mapPair(0x15803D, 0x4FCF93)
    static let grpWork = mapPair(0x0E7490, 0x67E8F9)
    static let grpKids = mapPair(0x7E22CE, 0xD8B4FE)
    static let grpThings = mapPair(0x7C2D12, 0xFDBA74)
    static let grpPaperwork = mapPair(0x475569, 0xCBD5E1)
    /// Where this phone is, when the person asked for it.
    static let me = mapPair(0x0A57C2, 0x8AB8FF)
    /// A city or neighbourhood outline (`place:areas`): the web's `--muted` for the dashed line, `--ink` for the
    /// name, `--focus` for the one that was tapped. A boundary is a line and a name and never a shade.
    static let areaLine = mapPair(0x47584F, 0xA3B5AA)
    static let areaInk = mapPair(0x10201A, 0xE9F1EC)
    static let focus = mapPair(0x0A57C2, 0x8AB8FF)
    /// A trip, on a Directions map: the web's `--route-walk` and `--route-ride` (apps/web/src/style.css).
    static let routeWalk = mapPair(0x9D1B6A, 0xFF8AD4)
    static let routeRide = mapPair(0x00558F, 0x73C2FF)

    /// The name a layer style or a greenway phase carries (HelpCore/MapLayers.swift), resolved to a colour here so
    /// that the rules stay free of SwiftUI and `swift test` can reach them.
    static func named(_ key: String) -> Color {
        switch key {
        case "bus": return bus
        case "smart": return smart
        case "rail": return rail
        case "bike": return bike
        case "gwOpen": return gwOpen
        case "gwBuild": return gwBuild
        case "gwFund": return gwFund
        case "gwPlan": return gwPlan
        case routeWalkToken: return routeWalk
        case routeRideToken: return routeRide
        default: return .brand
        }
    }

    /// The dot colour for one of our own listing groups (MAP_GROUPS).
    static func group(_ id: String) -> Color {
        switch id {
        case "food": return grpFood
        case "shelter": return grpShelter
        case "health": return grpHealth
        case "rec": return grpRec
        case "work": return grpWork
        case "kids": return grpKids
        case "things": return grpThings
        case "paperwork": return grpPaperwork
        default: return .brand
        }
    }
}
