// Small rules about one listing that the screens ask for and the app tests can check on their own.
// Nothing here is about a person.
import DetroitQuery
import Foundation

/// What to hand the maps app as a destination: the street address when the place publishes one, otherwise its
/// point on the map. A coordinate is **never** turned into a printed address — it is only ever passed through as
/// a coordinate. Sensitive listings (DV, mental-health crisis) carry no coordinates and get nothing here.
func mapsDestination(_ row: BundleRow) -> String? {
    if isSensitive(row.category) { return nil }
    if let a = row.address { return "\(a.line1), \(a.city), MI \(a.zip ?? "")" }
    if let lat = row.lat, let lon = row.lon { return "\(lat),\(lon)" }
    return nil
}

/// The destination handed to the **Transit app** (transitapp.com), whose own documented URL scheme is
/// `transit://directions?from=…&to=…` (docs/research/2026-09-20/transit-app.md). We send only `to`: their note
/// says a missing parameter uses the person's own location, which Transit asks for itself, on this phone. We pass
/// no origin and read none.
///
/// The publisher's coordinate comes first here, and the written address only when there is no coordinate — the
/// reverse of `mapsDestination`, on purpose, because Transit documents that it geocodes an address string with
/// the person's current location in mind. A coordinate is still only ever passed through, never printed.
/// A listing with no address and no coordinate, and every sensitive listing (DV, mental-health crisis), gets
/// nothing here: the same gate that withholds Directions withholds this.
func transitAppDestination(_ row: BundleRow) -> String? {
    if isSensitive(row.category) { return nil }
    if let lat = row.lat, let lon = row.lon { return "\(lat),\(lon)" }
    if let a = row.address { return "\(a.line1), \(a.city), MI \(a.zip ?? "")" }
    return nil
}

/// The link itself, or nil when we would be offering one that cannot work. Transit documents no https universal
/// link and no behaviour when the app is missing, so the screen also asks iOS whether anything can open the
/// scheme (`canOpen`, which is `UIApplication.canOpenURL` with `transit` in `LSApplicationQueriesSchemes`) and
/// leaves the row out when nothing can. "Directions" needs no other app and is always there.
func transitAppURL(_ row: BundleRow, canOpen: (URL) -> Bool) -> URL? {
    guard let dest = transitAppDestination(row),
          let q = dest.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
          let url = URL(string: "transit://directions?to=\(q)"), canOpen(url) else { return nil }
    return url
}

/// A listing with no published phone number shows no Call button at all, rather than a button that does nothing.
func hasPhone(_ row: BundleRow) -> Bool { row.phones.first != nil }

/// A place that is somewhere real but publishes no street address (the Wayne County naloxone and test-strip
/// stations, for example): the screen says so in words and offers directions to the point, and never prints a
/// made-up address.
func showsPointWithoutAddress(_ row: BundleRow) -> Bool {
    row.address == nil && !isSensitive(row.category) && row.lat != nil && row.lon != nil
}
