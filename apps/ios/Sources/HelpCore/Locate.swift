// The first time the Map tab is opened on this phone: our own card, and then — only if a person taps it — the
// system's permission sheet (Kyle, 2026-09-21; DECISIONS 2026-09-21).
//
// Why a card of our own first. A cold permission sheet explains nothing beyond the one line in Info.plist, and
// the honest answer to "why does a map of Detroit want my location?" is a sentence a person can read before
// anything is asked of them: "Your location stays on this phone. We never send it or save it." A sheet shown at
// the wrong moment is refused, and iOS asks only once — a refusal here costs the feature for good.
//
// What this file may remember: **one boolean**. That the card has been answered. Not the answer, not the
// authorization, and never a position. A position lives in `Here` (HelpApp/Views.swift) for as long as the app
// is open and goes nowhere else: not to a file, not to a report, not to a log (docs/08).
//
// The web and Android halves of this are apps/web/src/locate.ts and apps/android/.../Locate.kt. The three are
// held to the same table of cases.
import DetroitQuery
import Foundation

// MARK: - the four cities, as a box

/// CLAUDE.md: "Bbox sanity: lat 42.25–42.46, lon −83.33 to −82.91" (Dearborn reaches west to about −83.32).
/// The same numbers as `SERVICE_BBOX` in packages/query and `ServiceBox` on Android.
public enum ServiceBox {
    public static let latMin = 42.25, latMax = 42.46, lonMin = -83.33, lonMax = -82.91
}

/// Whether a point is inside Detroit, Hamtramck, Highland Park or Dearborn. A fix that is not a number is not
/// inside anything: the map is not moved somewhere undefined.
public func inServiceArea(lat: Double, lon: Double, slack: Double = 0) -> Bool {
    guard lat.isFinite, lon.isFinite else { return false }
    return lat >= ServiceBox.latMin - slack && lat <= ServiceBox.latMax + slack
        && lon >= ServiceBox.lonMin - slack && lon <= ServiceBox.lonMax + slack
}

public func inServiceArea(_ p: LatLon, slack: Double = 0) -> Bool { inServiceArea(lat: p.lat, lon: p.lon, slack: slack) }

/// Two miles, in metres. The shorter side of the map spans twice this: four miles across, the walk-and-bus city.
public let locateRadiusMeters = 3218.688

/// Where a map of Detroit looks when nobody has said where they are (Kyle, 2026-09-22: "the initial map
/// presentation needs to be much more zoomed in"; DECISIONS 2026-09-22).
///
/// The place is **Detroit City Hall** — the Coleman A. Young Municipal Center — which the app already carries,
/// in code, as the civic reference point of the `detroit` service area (`serviceAreas` in
/// apps/ios/Sources/DetroitQuery/Areas.swift, the Swift copy of packages/query/src/areas.ts). It is the
/// published address of a public building, which says nothing about anybody.
public let cityHall: LatLon = serviceAreas["detroit"]!.point!

/// How far north-west along Woodward the opening view is nudged, in miles, and the bearing of Woodward from
/// downtown measured off the map (Campus Martius to New Center): 31.9° west of north.
public let anchorNudgeMiles = 0.6, anchorBearingDegrees = -31.9

/// The centre of the opening view: **0.6 mile up Woodward from City Hall**, which is Grand Circus Park.
///
/// City Hall itself sits about a third of a mile from the river, so a two-mile box centred on it spends a third
/// of its height on Windsor and on the diagonal hatching that means "not our area" — a map whose lower half
/// answers nothing. Nudging the centre up Woodward puts the whole box on the city while keeping the same
/// landmark, and Woodward is the direction to nudge along because it is the street the box is being read from.
///
/// The number is pinned here rather than computed at run time so the three clients cannot drift, and it is
/// exactly `MAP_ANCHOR` in apps/web/src/locate.ts:
/// lat 42.3293 + 0.6·cos(31.9°)·1609.344/111320, lon −83.0452 − 0.6·sin(31.9°)·1609.344/(111320·cos 42.35°).
public let mapAnchor = LatLon(lat: 42.3366, lon: -83.0514)

/// Two miles, as everywhere else (Kyle, 2026-09-22: "always a 2-mile radius"). It used to be two and a half
/// here, on the reasoning that the anchor is the city's front door rather than where the person is; Kyle's
/// answer is that one radius people can learn is worth more than that distinction.
public let anchorRadiusMeters = locateRadiusMeters

/// **The ten-second timeout is gone** (Kyle, 2026-09-22). Two of the first people this app is for are a survivor
/// whose service has been cut off and a person without housing and without signal, and on a phone with no
/// network a cold GPS fix is a walk outside and a few minutes of sky — not ten seconds. Giving up at ten and
/// saying "we couldn't get your location" was the app telling the truth about its own patience and a lie about
/// the phone's. So the ask runs on, and after ten seconds the screen says what is happening and what would help,
/// with the cross-street and ZIP ways in beside it the whole time, and a **Stop** that is a real button.
public let locateSlowSeconds = 10.0
/// Five minutes, and then the ask stops on its own: the same `timeout: 300000` the web passes the browser. A
/// receiver that has not found the sky in five minutes is not going to, and a manager left running is a battery
/// a person without housing cannot spare.
public let locateGiveUpSeconds = 300.0

/// The opening view of the Map tab, as a point and a radius — the one decision behind "how far out does the map
/// open?", so the first view and "centre on me" are the same arithmetic (`MapCamera.forRadius`) with a different
/// centre. A location already known — allowed earlier, or the centre of a ZIP a person typed — wins and keeps
/// today's two-mile view; with none, the map opens on the anchor instead of the whole four-city region.
///
/// Pure, and the same three lines on all three clients (`openingView` in apps/web/src/locate.ts and
/// apps/android/.../Locate.kt). Nothing is stored: it is arithmetic about a view.
public func openingView(_ here: LatLon?) -> (center: LatLon, radiusMeters: Double) {
    here.map { ($0, locateRadiusMeters) } ?? (mapAnchor, anchorRadiusMeters)
}

// MARK: - what the tab does when it opens

/// What the system already knows, before anybody is asked anything. `.unknown` is for a state a future iOS adds.
public enum LocatePermission: String, Equatable, Sendable {
    case granted, denied, prompt, unknown
}

public enum FirstOpenAction: String, Equatable, Sendable {
    /// Our own card, over the map. Only ever on a first open, and only once per install.
    case showCard
    /// Straight to the two-mile view: permission is already given, so the card has nothing left to explain.
    case centreOnPerson
    /// A ZIP the person typed. They already said where to look, and a typed ZIP is not where they are.
    case centreOnZip
    /// The city, as before.
    case none
}

/**
 The whole decision, in five lines, shared by all three clients.

 - A typed ZIP wins over everything: asking for a location on top of one a person chose is nagging.
 - Permission already given (say, "Use my location" on Home) means there is nothing to explain: go there.
 - Permission already refused means the sheet would not appear, so the card would be a dead end — and iOS will
   not show it again anyway. The "Use my location" button stays, and says how to turn it on in Settings.
 - Otherwise the card, once; answering it is what stops it coming back.
 */
public func firstOpenAction(flagAnswered: Bool, permission: LocatePermission, hasNearFromZip: Bool) -> FirstOpenAction {
    if hasNearFromZip { return .centreOnZip }
    if permission == .granted { return .centreOnPerson }
    if permission == .denied { return .none }
    if flagAnswered { return .none }
    return .showCard
}

// MARK: - the one thing this phone remembers

/**
 Whether the first-open card has been answered on this phone. A small file in the app's own state directory —
 the same directory as the layer list and the install key, excluded from every backup — and never `UserDefaults`,
 for the same reason nothing else here is: the privacy manifest declares no required-reason API, and the app
 keeps its own state in files it creates.

 It holds one byte's worth of meaning and nothing else. There is deliberately no place in it to put a position.
 */
public final class LocateFlagStore {
    private let file: URL
    public private(set) var answered: Bool

    public init(dir: URL) {
        file = dir.appendingPathComponent("map-locate.json")
        let d = DeviceState.read(file)
        if let d, let saved = try? JSONDecoder().decode(Saved.self, from: d) { answered = saved.answered }
        else { answered = false }
    }

    private struct Saved: Codable { var answered: Bool }

    /// Returns false only when it could not be written down; the card still closes, and comes back next launch.
    @discardableResult public func markAnswered() -> Bool {
        answered = true
        guard let d = try? JSONEncoder().encode(Saved(answered: true)) else { return false }
        do { try DeviceState.write(d, to: file); return true } catch { return false }
    }

    /// "Make a new key" and the rest of the clear-data flow leave this alone, exactly as they leave the layer
    /// choices alone: it is a preference about a screen, not anything about a person. Here for a flow that does
    /// want it back — erasing the app, and the tests.
    @discardableResult public func forget() -> Bool {
        answered = false
        guard let d = try? JSONEncoder().encode(Saved(answered: false)) else { return false }
        do { try DeviceState.write(d, to: file); return true } catch { return false }
    }
}
