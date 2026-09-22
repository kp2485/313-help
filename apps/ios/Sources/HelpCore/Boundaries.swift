// How a neighbourhood or city boundary is drawn, at every zoom (Kyle, 2026-09-22: "The user needs to be able to
// see the boundaries of the neighborhoods on the map"). The Swift half of `apps/web/src/bounds.ts`; the spec,
// with the reasoning, is docs/MAP-STYLE.md section 15.
//
// This file is the whole of the rule, as arithmetic: hand it metres per point, get back a stroke width, a dash,
// whether names are drawn and how many. Nothing here reads a position, a theme or a palette — the colour is a
// TOKEN, resolved by `MapPalette.swift` the way every other map colour is, so dark mode and Increase Contrast
// reach the boundary through the machinery that already exists.
//
// Until 2026-09-22 a neighbourhood was drawn only under 14 metres per point, and the Map tab opens on the whole
// city: a person saw four city edges and none of the 205 outlines they had come to find. Every outline is drawn
// in every band now. What keeps 205 of them from being a mesh is the WEIGHT, not hiding them.
import Foundation

/// The three zoom bands a boundary is drawn in. The cut points are exactly the ones the subway style already
/// uses (docs/MAP-STYLE.md section 5: far > 30, mid 12–30, near < 12), so there is one ladder to implement, not
/// two. `city` is that spec's `far`, renamed because at that zoom the whole city is on the screen.
public enum BoundaryBand: String, Equatable, Sendable, CaseIterable { case city, mid, near }

/// > 30 m/pt is `city`; 12–30 is `mid`; under 12 is `near`.
public let boundaryMidMetersPerPoint = 30.0, boundaryNearMetersPerPoint = 12.0

public func boundaryBand(_ metersPerPoint: Double) -> BoundaryBand {
    metersPerPoint > boundaryMidMetersPerPoint ? .city : metersPerPoint >= boundaryNearMetersPerPoint ? .mid : .near
}

/// At most 12 names a frame — the same cap the subway style puts on station names — and a name only where its
/// outline is at least 70 points across, which is about what the shortest neighbourhood name needs.
public let boundaryNameCap = 12, boundaryNameMinPoints = 70.0
/// The one outline that was tapped: solid, in the focus colour, heavier than a city outline's 3.0 at near zoom,
/// with a wash of the brand colour over its rings. That is a selection, never a value (docs/13 rule 1).
public let boundarySelectedWidth = 4.0, boundaryWashAlpha = 0.08

public struct BoundaryStyle: Equatable, Sendable {
    public var band: BoundaryBand
    /// Stroke width in points for a neighbourhood outline.
    public var width: Double
    /// Stroke width for one of the four city outlines: a city is a bigger fact than a neighbourhood, and the
    /// only thing that says so is weight — never colour, and never a fill.
    public var cityWidth: Double
    /// Dash in points, **absolute** — not multiplied by the line width the way a transit dash is. A hairline
    /// whose dash scales with it stops being dashed, and the dotted texture is what says "not a street".
    public var dash: [Double]
    /// Whether a boundary carries its name in this band.
    public var names: Bool
    /// At most this many names a frame, so a city-wide view of 205 outlines is never a wall of words.
    public var nameCap: Int
    /// A name is only offered when its outline is at least this many points wide on screen.
    public var nameMinPoints: Double
}

/**
 Band → style. The whole table, in one place (docs/MAP-STYLE.md 15.1).

 | band | m/pt | neighbourhood | city | dash | names |
 |---|---|---|---|---|---|
 | `city` | > 30 | 1.1 | 1.5 | 2 on, 2 off | no |
 | `mid` | 12–30 | 1.6 | 2.4 | 3 on, 3 off | yes, ≤ 12 |
 | `near` | < 12 | 2.2 | 3.0 | 6 on, 3 off | yes, ≤ 12 |

 - **1.1 points at city zoom is still thinner than the thinnest street drawn there** (classes 0–2, floor 1.6), so
   a boundary can never be mistaken for a road and 205 of them read as a lattice rather than as a mesh. This is
   the one number a later "make it stronger" pass may not simply raise.
 - **The dash gets longer, not just thicker, as you come in.** A 2-on-2-off dot is a texture; a 6-on-3-off dash
   is a line with gaps. The "on" length is never shorter than the stroke is wide — below that it reads as dust.
 - **No names in the city band.** 205 names at 70 points apiece do not fit, and a name dropped for want of room
   is worse than a band that never promised one.
 - These are the **third** set of numbers: two earlier drafts were too faint on real screenshots. Take them from
   the table above, and look at your own screenshots before believing any of them.
 */
public func boundaryStyle(_ metersPerPoint: Double) -> BoundaryStyle {
    switch boundaryBand(metersPerPoint) {
    case .city:
        return BoundaryStyle(band: .city, width: 1.1, cityWidth: 1.5, dash: [2, 2],
                             names: false, nameCap: 0, nameMinPoints: boundaryNameMinPoints)
    case .mid:
        return BoundaryStyle(band: .mid, width: 1.6, cityWidth: 2.4, dash: [3, 3],
                             names: true, nameCap: boundaryNameCap, nameMinPoints: boundaryNameMinPoints)
    case .near:
        return BoundaryStyle(band: .near, width: 2.2, cityWidth: 3, dash: [6, 3],
                             names: true, nameCap: boundaryNameCap, nameMinPoints: boundaryNameMinPoints)
    }
}
