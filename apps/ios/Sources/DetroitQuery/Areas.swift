// Coarse service areas for domestic-violence rows, the Swift copy of packages/query/src/areas.ts
// (schema/query-spec.md, docs/08). Held to schema/fixtures/13-dv-service-area.json.
//
// A shelter.dv row never carries an address, a ZIP or a coordinate: the bundle is public and signed, so anything
// in it is published. It may carry a `service_area` instead — a whole city or bigger, never a ZIP and never a
// neighbourhood — and each area maps HERE, in code, to one fixed public reference point: a city hall. The point
// is about the area, never about a shelter, and every shelter serving one area shares the same point.
import Foundation

public struct ServiceArea: Sendable {
    /// The reference point, or nil for an area with no local centre (statewide, national).
    public let point: LatLon?
    /// What the point is, in plain words. For docs and tests; never shown to a person.
    public let reference: String
    /// statewide and national rank after every local area.
    public let wide: Bool
}

public let serviceAreas: [String: ServiceArea] = [
    "detroit": ServiceArea(point: LatLon(lat: 42.3293, lon: -83.0452), reference: "Detroit City Hall (Coleman A. Young Municipal Center)", wide: false),
    "dearborn": ServiceArea(point: LatLon(lat: 42.3224, lon: -83.1763), reference: "Dearborn Administrative Center", wide: false),
    "hamtramck": ServiceArea(point: LatLon(lat: 42.3934, lon: -83.0497), reference: "Hamtramck City Hall", wide: false),
    "highland_park": ServiceArea(point: LatLon(lat: 42.4055, lon: -83.0968), reference: "Highland Park City Hall", wide: false),
    "wayne_county": ServiceArea(point: LatLon(lat: 42.2847, lon: -83.2620), reference: "the US Census Bureau's internal point for Wayne County", wide: false),
    "wayne_county_west": ServiceArea(point: LatLon(lat: 42.3247, lon: -83.4001), reference: "Westland City Hall, the largest city of western Wayne County", wide: false),
    "wayne_county_downriver": ServiceArea(point: LatLon(lat: 42.2256, lon: -83.2696), reference: "Taylor City Hall, the largest city of the Downriver communities", wide: false),
    "oakland_county": ServiceArea(point: LatLon(lat: 42.6605, lon: -83.3842), reference: "the US Census Bureau's internal point for Oakland County", wide: false),
    "macomb_county": ServiceArea(point: LatLon(lat: 42.6716, lon: -82.9115), reference: "the US Census Bureau's internal point for Macomb County", wide: false),
    "statewide": ServiceArea(point: nil, reference: "no local centre: Michigan as a whole", wide: true),
    "national": ServiceArea(point: nil, reference: "no local centre: the United States", wide: true),
]

public func isServiceArea(_ id: String) -> Bool { serviceAreas[id] != nil }

/// The string key a screen uses to name the area in words ("Serves Detroit"). Text never lives in code.
public func serviceAreaKey(_ id: String?) -> String? {
    guard let id, isServiceArea(id) else { return nil }
    return "area.\(id)"
}

/// Deliberately coarser than the 0–1/1–3/3+ ladder ordinary rows use: an area is a whole city.
public let areaBandMiles: (close: Double, mid: Double) = (3, 10)

/// Every category the service-area rules cover: shelter.dv and anything under it.
public func isDvCategory(_ category: String) -> Bool { category == "shelter.dv" || category.hasPrefix("shelter.dv.") }
