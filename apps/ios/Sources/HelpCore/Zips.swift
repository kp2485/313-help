// A ZIP code a person types, and the point at the middle of it (`places/zips.json` in the signed bundle).
//
// Why this exists at all: "Use my location" is not an answer for everyone. A phone with location turned off, a
// borrowed phone, a person who simply does not want to hand over where they are standing — all of them can still
// say "I'm around 48226" and get a list sorted from there. The web has had this since the first list screen
// (apps/web/src/main.ts, `data-zip`); this is the same thing in Swift.
//
// What it is NOT: it is not where the person is. It is the centre of a ZIP area, one point for the whole of it,
// and the screen says so. Nothing typed here is stored, sent, or put in a route: the ZIP lives in memory for as
// long as the app is open, exactly like a position from `Here` (docs/08).
import DetroitQuery
import Foundation

/// The ZIP areas the bundle carries, each as the one point at its middle.
public struct ZipCenters: Equatable, Sendable {
    public var source: HoodSource?
    /// "48226" → the middle of that ZIP.
    public var points: [String: LatLon]
    public init(source: HoodSource? = nil, points: [String: LatLon]) {
        self.source = source
        self.points = points
    }
    public var isEmpty: Bool { points.isEmpty }
}

public enum ZipsFile {
    /// The name this file has in the signed index. It is small and travels with the rest of the bundle.
    public static let name = "places/zips.json"

    /// Decode the ZIP centres — after the bytes have been held to the checksum the **signed** index gives them,
    /// like every other file this app believes.
    public static func decode(_ data: Data, sha256 expected: String) throws -> ZipCenters {
        guard BundleCheck.sha256Hex(data) == expected else { throw BundleError.badChecksum(name) }
        struct File: Decodable { var source: HoodSource?; var zips: [String: [Double]] }
        guard let file = try? JSONDecoder().decode(File.self, from: data) else { throw BundleError.notJSON }
        var points: [String: LatLon] = [:]
        for (zip, pair) in file.zips where pair.count >= 2 {
            // The file writes each centre as [lat, lon], which is the order `main.ts` reads it in.
            points[zip] = LatLon(lat: pair[0], lon: pair[1])
        }
        return ZipCenters(source: file.source, points: points)
    }
}

/// A typed ZIP, as the lookup wants it: five digits and nothing else. Spaces around it are forgiven; a ZIP+4, a
/// letter or four digits are not a ZIP this app knows what to do with, and it says so rather than guessing.
public func normalizedZip(_ typed: String) -> String? {
    let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count == 5, trimmed.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    return trimmed
}

/// What a typed ZIP turned out to be. Three answers, because they are three different sentences on the screen:
/// "sorted by distance from ZIP 48226", "we don't know that ZIP code", and the same for something that is not a
/// ZIP at all.
public enum ZipLookup: Equatable, Sendable {
    /// A ZIP the bundle carries, with the middle of it.
    case found(zip: String, center: LatLon)
    /// Five digits, but not one of ours: the list stays on the whole city.
    case unknown
    /// Not five digits at all.
    case notAZip
}

/// The middle of a typed ZIP, or why there isn't one. A ZIP outside the four cities is simply one the bundle does
/// not carry, and gets the same honest answer as a made-up one — this file ships Detroit, Hamtramck, Highland
/// Park and Dearborn, and nothing else.
public func lookUpZip(_ typed: String, in zips: ZipCenters) -> ZipLookup {
    guard let zip = normalizedZip(typed) else { return .notAZip }
    guard let center = zips.points[zip] else { return .unknown }
    return .found(zip: zip, center: center)
}

extension Indicators {
    /// The neighborhoods a typed ZIP touches, which today is the one its middle falls in. The bundle carries one
    /// point per ZIP and a ZIP covers more than one neighborhood, so the screen says as much (`hood.mine_zip`).
    /// It answers with a list, not one neighborhood, because the day the bundle carries ZIP outlines this is
    /// where the several they touch will come from — the same shape as the web's `hoodsForZip`.
    public func neighborhoods(forZipCenter center: LatLon) -> [Hood] {
        neighborhood(containing: center).map { [$0] } ?? []
    }
}
