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

/// A listing with no published phone number shows no Call button at all, rather than a button that does nothing.
func hasPhone(_ row: BundleRow) -> Bool { row.phones.first != nil }

/// A place that is somewhere real but publishes no street address (the Wayne County naloxone and test-strip
/// stations, for example): the screen says so in words and offers directions to the point, and never prints a
/// made-up address.
func showsPointWithoutAddress(_ row: BundleRow) -> Bool {
    row.address == nil && !isSensitive(row.category) && row.lat != nil && row.lon != nil
}
