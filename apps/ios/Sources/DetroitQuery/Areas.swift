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
    // Every other city and township in the area (2026-09-24, DECISIONS): the area a phone-only local service or a row
    // the geocoder cannot place names, at the Census Bureau's internal point for that place (data/ingested/region.json).
    "allen_park": ServiceArea(point: LatLon(lat: 42.2595, lon: -83.2104), reference: "the US Census Bureau's internal point for Allen Park", wide: false),
    "auburn_hills": ServiceArea(point: LatLon(lat: 42.6747, lon: -83.2436), reference: "the US Census Bureau's internal point for Auburn Hills", wide: false),
    "berkley": ServiceArea(point: LatLon(lat: 42.4986, lon: -83.1853), reference: "the US Census Bureau's internal point for Berkley", wide: false),
    "birmingham": ServiceArea(point: LatLon(lat: 42.5448, lon: -83.2166), reference: "the US Census Bureau's internal point for Birmingham", wide: false),
    "bloomfield_hills": ServiceArea(point: LatLon(lat: 42.5814, lon: -83.2464), reference: "the US Census Bureau's internal point for Bloomfield Hills", wide: false),
    "bloomfield_township": ServiceArea(point: LatLon(lat: 42.5779, lon: -83.2745), reference: "the US Census Bureau's internal point for Bloomfield Township", wide: false),
    "center_line": ServiceArea(point: LatLon(lat: 42.4806, lon: -83.0274), reference: "the US Census Bureau's internal point for Center Line", wide: false),
    "chesterfield_township": ServiceArea(point: LatLon(lat: 42.6795, lon: -82.8063), reference: "the US Census Bureau's internal point for Chesterfield Township", wide: false),
    "clawson": ServiceArea(point: LatLon(lat: 42.5367, lon: -83.1504), reference: "the US Census Bureau's internal point for Clawson", wide: false),
    "clinton_township": ServiceArea(point: LatLon(lat: 42.5903, lon: -82.9169), reference: "the US Census Bureau's internal point for Clinton Township", wide: false),
    "commerce_township": ServiceArea(point: LatLon(lat: 42.5739, lon: -83.4957), reference: "the US Census Bureau's internal point for Commerce Township", wide: false),
    "dearborn_heights": ServiceArea(point: LatLon(lat: 42.3357, lon: -83.2888), reference: "the US Census Bureau's internal point for Dearborn Heights", wide: false),
    "eastpointe": ServiceArea(point: LatLon(lat: 42.4661, lon: -82.9463), reference: "the US Census Bureau's internal point for Eastpointe", wide: false),
    "ecorse": ServiceArea(point: LatLon(lat: 42.2496, lon: -83.1404), reference: "the US Census Bureau's internal point for Ecorse", wide: false),
    "farmington": ServiceArea(point: LatLon(lat: 42.4614, lon: -83.3784), reference: "the US Census Bureau's internal point for Farmington", wide: false),
    "farmington_hills": ServiceArea(point: LatLon(lat: 42.4856, lon: -83.3760), reference: "the US Census Bureau's internal point for Farmington Hills", wide: false),
    "ferndale": ServiceArea(point: LatLon(lat: 42.4592, lon: -83.1314), reference: "the US Census Bureau's internal point for Ferndale", wide: false),
    "fraser": ServiceArea(point: LatLon(lat: 42.5377, lon: -82.9467), reference: "the US Census Bureau's internal point for Fraser", wide: false),
    "garden_city": ServiceArea(point: LatLon(lat: 42.3244, lon: -83.3412), reference: "the US Census Bureau's internal point for Garden City", wide: false),
    "grosse_pointe": ServiceArea(point: LatLon(lat: 42.3839, lon: -82.9039), reference: "the US Census Bureau's internal point for Grosse Pointe", wide: false),
    "grosse_pointe_farms": ServiceArea(point: LatLon(lat: 42.3975, lon: -82.8892), reference: "the US Census Bureau's internal point for Grosse Pointe Farms", wide: false),
    "grosse_pointe_park": ServiceArea(point: LatLon(lat: 42.3740, lon: -82.9234), reference: "the US Census Bureau's internal point for Grosse Pointe Park", wide: false),
    "grosse_pointe_shores": ServiceArea(point: LatLon(lat: 42.4444, lon: -82.8737), reference: "the US Census Bureau's internal point for Grosse Pointe Shores", wide: false),
    "grosse_pointe_woods": ServiceArea(point: LatLon(lat: 42.4393, lon: -82.8990), reference: "the US Census Bureau's internal point for Grosse Pointe Woods", wide: false),
    "harper_woods": ServiceArea(point: LatLon(lat: 42.4390, lon: -82.9292), reference: "the US Census Bureau's internal point for Harper Woods", wide: false),
    "harrison_township": ServiceArea(point: LatLon(lat: 42.5876, lon: -82.8175), reference: "the US Census Bureau's internal point for Harrison Township", wide: false),
    "hazel_park": ServiceArea(point: LatLon(lat: 42.4619, lon: -83.0977), reference: "the US Census Bureau's internal point for Hazel Park", wide: false),
    "huntington_woods": ServiceArea(point: LatLon(lat: 42.4819, lon: -83.1681), reference: "the US Census Bureau's internal point for Huntington Woods", wide: false),
    "inkster": ServiceArea(point: LatLon(lat: 42.2939, lon: -83.3203), reference: "the US Census Bureau's internal point for Inkster", wide: false),
    "lathrup_village": ServiceArea(point: LatLon(lat: 42.4921, lon: -83.2273), reference: "the US Census Bureau's internal point for Lathrup Village", wide: false),
    "lincoln_park": ServiceArea(point: LatLon(lat: 42.2433, lon: -83.1813), reference: "the US Census Bureau's internal point for Lincoln Park", wide: false),
    "livonia": ServiceArea(point: LatLon(lat: 42.3972, lon: -83.3723), reference: "the US Census Bureau's internal point for Livonia", wide: false),
    "macomb_township": ServiceArea(point: LatLon(lat: 42.6749, lon: -82.9182), reference: "the US Census Bureau's internal point for Macomb Township", wide: false),
    "madison_heights": ServiceArea(point: LatLon(lat: 42.5073, lon: -83.1034), reference: "the US Census Bureau's internal point for Madison Heights", wide: false),
    "melvindale": ServiceArea(point: LatLon(lat: 42.2787, lon: -83.1822), reference: "the US Census Bureau's internal point for Melvindale", wide: false),
    "mount_clemens": ServiceArea(point: LatLon(lat: 42.5981, lon: -82.8815), reference: "the US Census Bureau's internal point for Mount Clemens", wide: false),
    "new_baltimore": ServiceArea(point: LatLon(lat: 42.6853, lon: -82.7377), reference: "the US Census Bureau's internal point for New Baltimore", wide: false),
    "novi": ServiceArea(point: LatLon(lat: 42.4785, lon: -83.4868), reference: "the US Census Bureau's internal point for Novi", wide: false),
    "oak_park": ServiceArea(point: LatLon(lat: 42.4649, lon: -83.1824), reference: "the US Census Bureau's internal point for Oak Park", wide: false),
    "orion_township": ServiceArea(point: LatLon(lat: 42.7569, lon: -83.2619), reference: "the US Census Bureau's internal point for Orion Township", wide: false),
    "pleasant_ridge": ServiceArea(point: LatLon(lat: 42.4715, lon: -83.1445), reference: "the US Census Bureau's internal point for Pleasant Ridge", wide: false),
    "pontiac": ServiceArea(point: LatLon(lat: 42.6492, lon: -83.2874), reference: "the US Census Bureau's internal point for Pontiac", wide: false),
    "redford_township": ServiceArea(point: LatLon(lat: 42.3948, lon: -83.2940), reference: "the US Census Bureau's internal point for Redford Township", wide: false),
    "river_rouge": ServiceArea(point: LatLon(lat: 42.2743, lon: -83.1242), reference: "the US Census Bureau's internal point for River Rouge", wide: false),
    "riverview": ServiceArea(point: LatLon(lat: 42.1735, lon: -83.1984), reference: "the US Census Bureau's internal point for Riverview", wide: false),
    "rochester": ServiceArea(point: LatLon(lat: 42.6866, lon: -83.1197), reference: "the US Census Bureau's internal point for Rochester", wide: false),
    "rochester_hills": ServiceArea(point: LatLon(lat: 42.6635, lon: -83.1592), reference: "the US Census Bureau's internal point for Rochester Hills", wide: false),
    "romulus": ServiceArea(point: LatLon(lat: 42.2213, lon: -83.3674), reference: "the US Census Bureau's internal point for Romulus", wide: false),
    "roseville": ServiceArea(point: LatLon(lat: 42.5076, lon: -82.9366), reference: "the US Census Bureau's internal point for Roseville", wide: false),
    "royal_oak": ServiceArea(point: LatLon(lat: 42.5078, lon: -83.1539), reference: "the US Census Bureau's internal point for Royal Oak", wide: false),
    "royal_oak_township": ServiceArea(point: LatLon(lat: 42.4498, lon: -83.1624), reference: "the US Census Bureau's internal point for Royal Oak Township", wide: false),
    "shelby_township": ServiceArea(point: LatLon(lat: 42.6731, lon: -83.0366), reference: "the US Census Bureau's internal point for Shelby Township", wide: false),
    "southfield": ServiceArea(point: LatLon(lat: 42.4746, lon: -83.2595), reference: "the US Census Bureau's internal point for Southfield", wide: false),
    "southfield_township": ServiceArea(point: LatLon(lat: 42.5204, lon: -83.2648), reference: "the US Census Bureau's internal point for Southfield Township", wide: false),
    "southgate": ServiceArea(point: LatLon(lat: 42.2047, lon: -83.2057), reference: "the US Census Bureau's internal point for Southgate", wide: false),
    "st_clair_shores": ServiceArea(point: LatLon(lat: 42.4930, lon: -82.8909), reference: "the US Census Bureau's internal point for St. Clair Shores", wide: false),
    "sterling_heights": ServiceArea(point: LatLon(lat: 42.5812, lon: -83.0303), reference: "the US Census Bureau's internal point for Sterling Heights", wide: false),
    "sylvan_lake": ServiceArea(point: LatLon(lat: 42.6168, lon: -83.3335), reference: "the US Census Bureau's internal point for Sylvan Lake", wide: false),
    "taylor": ServiceArea(point: LatLon(lat: 42.2253, lon: -83.2677), reference: "the US Census Bureau's internal point for Taylor", wide: false),
    "trenton": ServiceArea(point: LatLon(lat: 42.1403, lon: -83.1924), reference: "the US Census Bureau's internal point for Trenton", wide: false),
    "troy": ServiceArea(point: LatLon(lat: 42.5839, lon: -83.1455), reference: "the US Census Bureau's internal point for Troy", wide: false),
    "utica": ServiceArea(point: LatLon(lat: 42.6287, lon: -83.0233), reference: "the US Census Bureau's internal point for Utica", wide: false),
    "walled_lake": ServiceArea(point: LatLon(lat: 42.5372, lon: -83.4737), reference: "the US Census Bureau's internal point for Walled Lake", wide: false),
    "warren": ServiceArea(point: LatLon(lat: 42.4929, lon: -83.0250), reference: "the US Census Bureau's internal point for Warren", wide: false),
    "waterford_township": ServiceArea(point: LatLon(lat: 42.6620, lon: -83.3879), reference: "the US Census Bureau's internal point for Waterford Township", wide: false),
    "wayne": ServiceArea(point: LatLon(lat: 42.2769, lon: -83.3881), reference: "the US Census Bureau's internal point for Wayne", wide: false),
    "west_bloomfield_township": ServiceArea(point: LatLon(lat: 42.5667, lon: -83.3871), reference: "the US Census Bureau's internal point for West Bloomfield Township", wide: false),
    "westland": ServiceArea(point: LatLon(lat: 42.3192, lon: -83.3808), reference: "the US Census Bureau's internal point for Westland", wide: false),
    "white_lake_township": ServiceArea(point: LatLon(lat: 42.6550, lon: -83.5008), reference: "the US Census Bureau's internal point for White Lake Township", wide: false),
    "wixom": ServiceArea(point: LatLon(lat: 42.5228, lon: -83.5302), reference: "the US Census Bureau's internal point for Wixom", wide: false),
    "wyandotte": ServiceArea(point: LatLon(lat: 42.2107, lon: -83.1573), reference: "the US Census Bureau's internal point for Wyandotte", wide: false),
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

/// Whether a row is ranked, and described, by the coarse area it serves (areas.ts `servesByArea`, 2026-09-24): every
/// domestic-violence row, and any other row that names a service area and has no coordinate.
public func servesByArea(_ row: BundleRow) -> Bool {
    isDvCategory(row.category) || (row.serviceArea != nil && (row.lat == nil || row.lon == nil))
}

/// The string key for "Serves {area}" on a row described by its area, or nil (areas.ts `servesAreaKey`).
public func servesAreaKey(_ row: BundleRow) -> String? { servesByArea(row) ? serviceAreaKey(row.serviceArea) : nil }
