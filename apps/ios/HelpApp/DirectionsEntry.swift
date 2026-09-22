// The ways into the Directions screen, and the one piece of it that talks to CoreLocation.
//
// A destination is a value on a navigation stack: it is never in a URL, never in a file, never in a report. A
// sensitive listing — a domestic-violence shelter, a mental-health crisis line — carries no coordinate and gets
// no button at all, exactly as it gets no address and no maps link (docs/08, HelpCore/Listing.swift).
import CoreLocation
import DetroitQuery
import HelpCore
import SwiftUI

/**
 "Directions", wherever a row or a card offers one. `primary` is the filled button on a listing's own screen;
 everywhere else it is the quiet one. The port of `dirButton` in apps/web/src/main.ts.
 */
struct DirectionsButton: View {
    let name: String
    let lat: Double?
    let lon: Double?
    var category = ""
    var primary = false

    var body: some View {
        if let to = dirDestination(name: name, lat: lat, lon: lon, category: category) {
            NavigationLink { DirectionsView(to: to) } label: {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.and.ellipse").accessibilityHidden(true)
                    Text(L.t("dir.open")).fontWeight(.semibold).multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .font(.subheadline)
                .foregroundStyle(primary ? Color.brandInk : Color.brand)
                .padding(.horizontal, 16).padding(.vertical, 13)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(primary ? AnyShapeStyle(Color.brand) : AnyShapeStyle(Color.surface),
                            in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(primary ? Color.clear : Color.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L.t("dir.open_label", ["name": name]))
        }
    }
}

/**
 Following along: a position, on this phone, for as long as the button is on.

 It is `CLLocationManager` and nothing else — no route matching on anybody's server, no identifier, nothing
 written down. The fix goes to one closure, which works out which step is nearest and whether the person is more
 than 120 m from the line, and is then dropped. Stopping really stops the manager.
 */
@MainActor
@Observable
final class DirFollower: NSObject, CLLocationManagerDelegate {
    /// Where the phone last said it was, this screen only, so the map can draw the dot. Never stored.
    private(set) var at: LatLon?
    private let manager = CLLocationManager()
    private var onFix: ((LatLon) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        // Following a walking route wants the better fix; it is still never written down and never sent.
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 10
    }

    func start(_ onFix: @escaping (LatLon) -> Void) {
        self.onFix = onFix
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
        case .notDetermined: manager.requestWhenInUseAuthorization()
        default: break
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
        onFix = nil
        at = nil
    }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in
            guard self.onFix != nil else { return }
            switch m.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: m.startUpdatingLocation()
            default: break
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations l: [CLLocation]) {
        guard let c = l.last?.coordinate else { return }
        Task { @MainActor in
            guard let onFix = self.onFix else { return }
            let p = LatLon(lat: c.latitude, lon: c.longitude)
            self.at = p
            onFix(p)
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError e: Error) { }
}
