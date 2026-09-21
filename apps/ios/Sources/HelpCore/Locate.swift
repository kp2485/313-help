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
