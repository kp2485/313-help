// Small rules about one listing that the screens ask for and the tests can check on their own.
// Nothing here is about a person.
import DetroitQuery
import Foundation

/// What to hand the maps app as a destination: the street address when the place publishes one, otherwise its
/// point on the map. A coordinate is **never** turned into a printed address — it is only ever passed through as
/// a coordinate. Sensitive listings (DV, mental-health crisis) carry no coordinates and get nothing here.
public func mapsDestination(_ row: BundleRow) -> String? {
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
public func transitAppDestination(_ row: BundleRow) -> String? {
    if isSensitive(row.category) { return nil }
    if let lat = row.lat, let lon = row.lon { return "\(lat),\(lon)" }
    if let a = row.address { return "\(a.line1), \(a.city), MI \(a.zip ?? "")" }
    return nil
}

// ---- building a link out of somebody else's text -------------------------------------------------
/// The only characters that are ever left as they are in a value we put in a query string: letters, digits, and
/// the four RFC 3986 "unreserved" marks. Everything else — `&`, `=`, `+`, `#`, `?`, `/`, a space, a comma — is
/// percent-encoded.
///
/// `.urlQueryAllowed` was the wrong set: it permits `&`, `=`, `+` and `#`, so a listing whose address read
/// "100 Main St&from=42.3,-83.0" would have put a *second* parameter into the maps link — an origin, which
/// docs/08 says we never send, injected out of a data field by whoever edited that row (iPhone review,
/// 2026-09-20). An address is somebody else's text; it is escaped like any other untrusted value.
private let valueAllowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))

/// One `name=value` pair, strictly encoded. Built by hand rather than with `URLComponents.queryItems`, which
/// leaves `&` and `+` alone in a value.
public func queryPair(_ name: String, _ value: String) -> String? {
    guard let v = value.addingPercentEncoding(withAllowedCharacters: valueAllowed) else { return nil }
    return "\(name)=\(v)"
}

/// Apple Maps, pointed at one destination and nothing else. No origin, ever.
public func mapsURL(_ row: BundleRow) -> URL? {
    guard let dest = mapsDestination(row), let pair = queryPair("daddr", dest) else { return nil }
    var c = URLComponents()
    c.scheme = "https"
    c.host = "maps.apple.com"
    c.path = "/"
    c.percentEncodedQuery = pair
    return c.url
}

/// Apple Maps, pointed at a destination that is not a listing — a City park (HelpApp/Browse.swift). The same
/// rule and the same strict escaping: the street address the City publishes, else the coordinate it publishes,
/// and **never an origin**. A coordinate passed to the maps app is still never printed as if it were an address.
public func mapsURL(address: String?, lat: Double, lon: Double) -> URL? {
    let dest = (address?.isEmpty == false) ? "\(address!), Detroit, MI" : "\(lat),\(lon)"
    guard let pair = queryPair("daddr", dest) else { return nil }
    var c = URLComponents()
    c.scheme = "https"
    c.host = "maps.apple.com"
    c.path = "/"
    c.percentEncodedQuery = pair
    return c.url
}

/// The Transit link itself, or nil when we would be offering one that cannot work. Transit documents no https
/// universal link and no behaviour when the app is missing, so the screen also asks iOS whether anything can open
/// the scheme (`canOpen`, which is `UIApplication.canOpenURL` with `transit` in `LSApplicationQueriesSchemes`)
/// and leaves the row out when nothing can. "Directions" needs no other app and is always there.
public func transitAppURL(_ row: BundleRow, canOpen: (URL) -> Bool) -> URL? {
    guard let dest = transitAppDestination(row), let pair = queryPair("to", dest) else { return nil }
    var c = URLComponents()
    c.scheme = "transit"
    c.host = "directions"
    c.percentEncodedQuery = pair
    guard let url = c.url, canOpen(url) else { return nil }
    return url
}

/// A listing with no published phone number shows no Call button at all, rather than a button that does nothing.
public func hasPhone(_ row: BundleRow) -> Bool { row.phones.first != nil }

// ---- domestic violence: an area in words, never a place -------------------------------------------------
/// The string key naming the coarse area a domestic-violence row serves ("area.detroit"), or nil when the row
/// is not a DV row or a steward has recorded no area. It is the only thing such a row ever says about where it
/// is: no address, no ZIP, no coordinate, no distance, no map and no directions (docs/08).
/// A screen puts it into `safe.dv_serves` ("Serves {area}").
public func serviceAreaStringKey(_ row: BundleRow) -> String? {
    guard isDvCategory(row.category) else { return nil }
    return serviceAreaKey(row.serviceArea)
}

/// Every domestic-violence listing carries the one sentence `safe.dv_no_address`: the shelter does not share
/// its address, call and they will say where to go. True whatever area is recorded, and true when none is.
public func saysNoAddress(_ row: BundleRow) -> Bool { isDvCategory(row.category) }

/// A place that is somewhere real but publishes no street address (the Wayne County naloxone and test-strip
/// stations, for example): the screen says so in words and offers directions to the point, and never prints a
/// made-up address.
public func showsPointWithoutAddress(_ row: BundleRow) -> Bool {
    row.address == nil && !isSensitive(row.category) && row.lat != nil && row.lon != nil
}

// ---- getting out of the app in a hurry ------------------------------------------------------------
/// Where "Leave this page fast" goes, the same neutral page the web app replaces itself with
/// (`apps/web/src/main.ts`: `location.replace('https://www.weather.gov/')`). A weather page is unremarkable in
/// anyone's history and belongs to nobody involved.
public let quickExitURLString = "https://www.weather.gov/"
public var quickExitURL: URL? { URL(string: quickExitURLString) }

/// Which screens carry the Quick exit control: the needs the web app marks `quickExit` (docs/08 "Quick-exit"),
/// and any listing that is private. The list is the needs' own ids, checked against apps/web/src/needs.ts by
/// AppParityTests.
public let quickExitNeeds = ["unsafe", "talk", "drugs", "assault"]
public func needHasQuickExit(_ id: String) -> Bool { quickExitNeeds.contains(id) }
public func listingHasQuickExit(_ category: String) -> Bool { isPrivate(category) }
