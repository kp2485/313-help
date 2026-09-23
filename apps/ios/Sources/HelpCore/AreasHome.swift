// The Areas tab's own rules, as plain functions and named numbers (Kyle, 2026-09-22; DECISIONS 2026-09-22).
//
// The Swift half of `apps/web/src/areas.ts` and of `cameraForArea` in `apps/web/src/map.ts`, case for case. It is
// here, in HelpCore, and not in a SwiftUI screen, because `swift test` runs this target: the landing decision,
// the collapsing strip and the camera that frames one outline are arithmetic about a VIEW, and the iPhone must
// answer them exactly as the web does or the two apps are two different apps.
//
// Nothing in this file reads a position, stores anything, or knows what the network is. The landing decision is
// handed three booleans the screen has already worked out; the collapsing strip is handed a scroll offset; the
// camera is handed rings and a viewport.
import DetroitQuery
import Foundation

// MARK: - what the tab lands on

/// What the Areas tab lands on. Three cases and no fourth — and `outside` covers both ways a person can be
/// outside: a fix that came back beyond the four cities, and a fix inside the bounding box that no outline
/// holds. Both get the same plain sentence, because both are the same fact: we have nothing to say about that
/// spot. Nothing is ever given to the nearest outline instead.
public enum AreasLanding: String, Equatable, Sendable {
    /// The person's own area is known: the map opens zoomed to its outline, highlighted and named.
    case area
    /// Nobody has said where they are: the location card (location → cross street → ZIP).
    case ask
    /// A fix came back from outside the four cities, or from a spot no outline holds: the plain message.
    case outside
}

/// The landing, from what the device already knows. `areasLanding` in apps/web/src/areas.ts.
public func areasLanding(located: Bool, area: Bool, outside: Bool) -> AreasLanding {
    if outside { return .outside }
    if area { return .area }
    return located ? .outside : .ask
}

// MARK: - the map that shrinks to a strip, and the strip that collapses as you read

/// 38 % of the viewport: what the full-screen map shrinks to when an area page opens under it. Enough to keep
/// the tapped outline and its neighbours readable; small enough that the page below it starts with a heading and
/// a first paragraph rather than with nothing. `AREAS_STRIP_VH` on the web.
public let areasStripFraction = 0.38
/// 48 points: the compact bar the strip collapses to as a person reads down. It holds the Back button and the
/// area's name, so it can never be smaller than a 44-point target plus its padding. `AREAS_BAR_PX`.
public let areasBarPoints = 48.0
/// 8 points: how far a person has to scroll THE OTHER WAY before the strip changes its mind. Zero would make the
/// strip flicker on the hand-wobble at the end of every flick. `AREAS_TURN_PX`.
public let areasTurnPoints = 8.0
/// 240 ms: how long the shrink takes, and how long the collapse takes. Nothing at all under Reduce Motion, where
/// the strip still collapses and still comes back — it just arrives rather than travels. `AREAS_SHRINK_MS`.
public let areasShrinkMilliseconds = 240.0
/// How long the page is left alone after the strip changes size.
///
/// On the web, collapsing the strip makes the document shorter and the browser corrects the scroll position,
/// which reads as a person scrolling the other way and flaps the strip at about sixty times a second. A SwiftUI
/// header above a `ScrollView` cannot do that to itself — but the settling period is kept, and kept the same
/// number, because a scroll view that is mid-deceleration when the header changes height still reports a jump,
/// and because three clients disagreeing about a timing is how they drift apart.
public let areasSettleMilliseconds = areasShrinkMilliseconds + 80

/// True while the page is still rearranging itself after the strip changed size. The top of the page is the one
/// thing that answers through a settling period: scrolled all the way back is never ambiguous.
public func stripSettling(changedAt: Double, now: Double) -> Bool { now - changedAt < areasSettleMilliseconds }

/// Open: the whole strip, with the map in it. Shut: the compact bar, with Back and the name.
public enum StripState: String, Equatable, Sendable { case open, shut }

/// What the collapsing strip remembers between scroll events: where the page is, and where the last change of
/// direction happened. Two numbers and a word — no timers, no velocity, nothing that could drift.
public struct StripScroll: Equatable, Sendable {
    public var state: StripState
    public var y: Double
    public var pivot: Double
    public init(state: StripState, y: Double, pivot: Double) { self.state = state; self.y = y; self.pivot = pivot }
}

public func stripStart() -> StripScroll { StripScroll(state: .open, y: 0, pivot: 0) }

/**
 The collapsing-header state machine, as one pure step: where the page is now, in, and what the strip should be,
 out. `stripAt` in apps/web/src/areas.ts, line for line.

 - At the top of the page the strip is always open. Nothing else is honest: a person who has scrolled all the way
   back has asked for the map.
 - Reading DOWN more than `areasTurnPoints` past the last turn shuts it, so the page gets the whole screen.
 - Scrolling back UP does NOT open it: the map returns only at the top of the page (Kyle, 2026-09-23). The bar
   with Back and the name stays the whole time.
 */
public func stripAt(_ was: StripScroll, y: Double) -> StripScroll {
    let top = max(0, y)
    if top <= 0 { return StripScroll(state: .open, y: 0, pivot: 0) }
    if top == was.y { return StripScroll(state: was.state, y: top, pivot: was.pivot) }
    let down = top > was.y
    // Which way we were already going: the pivot sits behind us when we were heading down.
    let wasDown = was.pivot <= was.y
    let pivot = down == wasDown ? was.pivot : was.y          // a turn moves the pivot to where it happened
    if abs(top - pivot) < areasTurnPoints { return StripScroll(state: was.state, y: top, pivot: pivot) }
    return StripScroll(state: down ? .shut : was.state, y: top, pivot: pivot)
}

// MARK: - the camera that frames one area

/// 8 %: the outline's own box, grown by 8 % on every side, is what has to fit. Enough that the dashed edge is
/// never flush against the frame, small enough that a neighbourhood still fills the screen. `AREA_FIT_MARGIN`.
public let areaFitMargin = 0.08
/// 4 metres per point: the closest this camera will ever open, whatever it was handed. The smallest of the
/// City's 205 outlines is a few blocks across; fitting it exactly would open on a picture of six houses with no
/// streets a person could recognise. The map's own limit is 0.6 m/pt (`MapCamera.maxScale`) and a person can
/// still zoom all the way in by hand — this is only where it OPENS. `AREA_MIN_MPP`.
public let areaMinMetersPerPoint = 4.0

extension MapCamera {
    /**
     The camera that shows one area's outline: fit its rings, with `areaFitMargin` of room, inside the box.

     Pure — rings in, camera out — and portrait or landscape is decided by the box it is handed, so the same
     neighbourhood fits whichever way the phone is held. `min` of the two axes, so the WHOLE outline is on screen
     (unlike `cover`, which fills the box and lets the long axis run off it).

     Handed nothing — an area the bundle carries no outline for — it returns nil, and the caller keeps the view it
     already had. Never a guess, and never a camera pointed at 0°N 0°E.

     A whole city is handled by the other end of the same clamp: `minScale` is 90 m per point, so Detroit cannot
     open wider than the camera has ever allowed.
     */
    public static func forArea(_ rings: [[LatLon]], width: Double, height: Double) -> MapCamera? {
        var box = MapBox.empty
        for ring in rings { box = box.union(MapBox.around(ring)) }
        guard !box.isEmpty, box.minX.isFinite, box.minY.isFinite, box.maxX.isFinite, box.maxY.isFinite else { return nil }
        let w = max(1, width), h = max(1, height), grow = 1 + areaFitMargin * 2
        // A point, or a sliver: give it something to be wide, so the division below is never by zero.
        let least = 1 / MapProjection.metersPerUnit
        let spanX = max(box.width, least) * grow, spanY = max(box.height, least) * grow
        let fit = min(w / spanX, h / spanY)
        // The clamps, in this order: never closer than `areaMinMetersPerPoint`, never outside the camera's own two.
        let s = max(minScale, min(maxScale, MapProjection.metersPerUnit / areaMinMetersPerPoint, fit))
        return MapCamera(centerX: box.centerX, centerY: box.centerY, scale: s, width: w, height: h).clamped()
    }
}

// MARK: - which area a point is in

extension Indicators {
    /**
     The AREA a point is in: the Detroit neighborhood that holds it, or — for a point in Hamtramck, Highland Park
     or Dearborn, none of which publishes neighborhood outlines — the city that holds it. `areaAt` in
     apps/web/src/hoodfind.ts.

     Neighborhoods are asked first, so a Detroit point is never answered with "Detroit" when the app has a better
     answer for it, and the three other cities stop being a dead end. `nil` when no outline holds the point,
     which is still a real answer: the screen says so, and nothing is ever given to the nearest shape.
     */
    public func area(containing p: LatLon) -> AreaPage? {
        if let h = neighborhood(containing: p) { return .neighborhood(h) }
        guard p.lat.isFinite, p.lon.isFinite else { return nil }
        for a in (areas ?? []) where a.kind == "city" {
            let rings = hoodOutline(a.hood, origin: origin)
            guard let box = hoodBox(rings) else { continue }
            if p.lat < box.minLat || p.lat > box.maxLat || p.lon < box.minLon || p.lon > box.maxLon { continue }
            if hoodContains(rings: rings, p) { return .city(a) }
        }
        return nil
    }
}
