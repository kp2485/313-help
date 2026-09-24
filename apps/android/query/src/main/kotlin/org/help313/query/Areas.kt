// Coarse service areas for domestic-violence rows, the Kotlin copy of packages/query/src/areas.ts and
// apps/ios/Sources/DetroitQuery/Areas.swift (schema/query-spec.md, docs/08).
// Held to schema/fixtures/13-dv-service-area.json.
//
// A shelter.dv row never carries an address, a ZIP or a coordinate: the bundle is public and signed, so anything
// in it is published. It may carry a `service_area` instead — a whole city or bigger, never a ZIP and never a
// neighbourhood — and each area maps HERE, in code, to one fixed public reference point: a city hall. The point
// is about the area, never about a shelter, and every shelter serving one area shares the same point.
package org.help313.query

data class ServiceArea(
    /** The reference point, or null for an area with no local centre (statewide, national). */
    val point: LatLon?,
    /** What the point is, in plain words. For docs and tests; never shown to a person. */
    val reference: String,
    /** statewide and national rank after every local area. */
    val wide: Boolean,
)

val SERVICE_AREAS: Map<String, ServiceArea> = linkedMapOf(
    "detroit" to ServiceArea(LatLon(42.3293, -83.0452), "Detroit City Hall (Coleman A. Young Municipal Center)", false),
    "dearborn" to ServiceArea(LatLon(42.3224, -83.1763), "Dearborn Administrative Center", false),
    "hamtramck" to ServiceArea(LatLon(42.3934, -83.0497), "Hamtramck City Hall", false),
    "highland_park" to ServiceArea(LatLon(42.4055, -83.0968), "Highland Park City Hall", false),
    "wayne_county" to ServiceArea(LatLon(42.2847, -83.2620), "the US Census Bureau's internal point for Wayne County", false),
    "wayne_county_west" to ServiceArea(LatLon(42.3247, -83.4001), "Westland City Hall, the largest city of western Wayne County", false),
    "wayne_county_downriver" to ServiceArea(LatLon(42.2256, -83.2696), "Taylor City Hall, the largest city of the Downriver communities", false),
    "oakland_county" to ServiceArea(LatLon(42.6605, -83.3842), "the US Census Bureau's internal point for Oakland County", false),
    "macomb_county" to ServiceArea(LatLon(42.6716, -82.9115), "the US Census Bureau's internal point for Macomb County", false),
    // Every other city and township in the area (2026-09-24, DECISIONS): the area a phone-only local service or a row
    // the geocoder cannot place names, at the Census Bureau's internal point for that place (data/ingested/region.json).
    "allen_park" to ServiceArea(LatLon(42.2595, -83.2104), "the US Census Bureau's internal point for Allen Park", false),
    "auburn_hills" to ServiceArea(LatLon(42.6747, -83.2436), "the US Census Bureau's internal point for Auburn Hills", false),
    "berkley" to ServiceArea(LatLon(42.4986, -83.1853), "the US Census Bureau's internal point for Berkley", false),
    "birmingham" to ServiceArea(LatLon(42.5448, -83.2166), "the US Census Bureau's internal point for Birmingham", false),
    "bloomfield_hills" to ServiceArea(LatLon(42.5814, -83.2464), "the US Census Bureau's internal point for Bloomfield Hills", false),
    "bloomfield_township" to ServiceArea(LatLon(42.5779, -83.2745), "the US Census Bureau's internal point for Bloomfield Township", false),
    "center_line" to ServiceArea(LatLon(42.4806, -83.0274), "the US Census Bureau's internal point for Center Line", false),
    "chesterfield_township" to ServiceArea(LatLon(42.6795, -82.8063), "the US Census Bureau's internal point for Chesterfield Township", false),
    "clawson" to ServiceArea(LatLon(42.5367, -83.1504), "the US Census Bureau's internal point for Clawson", false),
    "clinton_township" to ServiceArea(LatLon(42.5903, -82.9169), "the US Census Bureau's internal point for Clinton Township", false),
    "commerce_township" to ServiceArea(LatLon(42.5739, -83.4957), "the US Census Bureau's internal point for Commerce Township", false),
    "dearborn_heights" to ServiceArea(LatLon(42.3357, -83.2888), "the US Census Bureau's internal point for Dearborn Heights", false),
    "eastpointe" to ServiceArea(LatLon(42.4661, -82.9463), "the US Census Bureau's internal point for Eastpointe", false),
    "ecorse" to ServiceArea(LatLon(42.2496, -83.1404), "the US Census Bureau's internal point for Ecorse", false),
    "farmington" to ServiceArea(LatLon(42.4614, -83.3784), "the US Census Bureau's internal point for Farmington", false),
    "farmington_hills" to ServiceArea(LatLon(42.4856, -83.3760), "the US Census Bureau's internal point for Farmington Hills", false),
    "ferndale" to ServiceArea(LatLon(42.4592, -83.1314), "the US Census Bureau's internal point for Ferndale", false),
    "fraser" to ServiceArea(LatLon(42.5377, -82.9467), "the US Census Bureau's internal point for Fraser", false),
    "garden_city" to ServiceArea(LatLon(42.3244, -83.3412), "the US Census Bureau's internal point for Garden City", false),
    "grosse_pointe" to ServiceArea(LatLon(42.3839, -82.9039), "the US Census Bureau's internal point for Grosse Pointe", false),
    "grosse_pointe_farms" to ServiceArea(LatLon(42.3975, -82.8892), "the US Census Bureau's internal point for Grosse Pointe Farms", false),
    "grosse_pointe_park" to ServiceArea(LatLon(42.3740, -82.9234), "the US Census Bureau's internal point for Grosse Pointe Park", false),
    "grosse_pointe_shores" to ServiceArea(LatLon(42.4444, -82.8737), "the US Census Bureau's internal point for Grosse Pointe Shores", false),
    "grosse_pointe_woods" to ServiceArea(LatLon(42.4393, -82.8990), "the US Census Bureau's internal point for Grosse Pointe Woods", false),
    "harper_woods" to ServiceArea(LatLon(42.4390, -82.9292), "the US Census Bureau's internal point for Harper Woods", false),
    "harrison_township" to ServiceArea(LatLon(42.5876, -82.8175), "the US Census Bureau's internal point for Harrison Township", false),
    "hazel_park" to ServiceArea(LatLon(42.4619, -83.0977), "the US Census Bureau's internal point for Hazel Park", false),
    "huntington_woods" to ServiceArea(LatLon(42.4819, -83.1681), "the US Census Bureau's internal point for Huntington Woods", false),
    "inkster" to ServiceArea(LatLon(42.2939, -83.3203), "the US Census Bureau's internal point for Inkster", false),
    "lathrup_village" to ServiceArea(LatLon(42.4921, -83.2273), "the US Census Bureau's internal point for Lathrup Village", false),
    "lincoln_park" to ServiceArea(LatLon(42.2433, -83.1813), "the US Census Bureau's internal point for Lincoln Park", false),
    "livonia" to ServiceArea(LatLon(42.3972, -83.3723), "the US Census Bureau's internal point for Livonia", false),
    "macomb_township" to ServiceArea(LatLon(42.6749, -82.9182), "the US Census Bureau's internal point for Macomb Township", false),
    "madison_heights" to ServiceArea(LatLon(42.5073, -83.1034), "the US Census Bureau's internal point for Madison Heights", false),
    "melvindale" to ServiceArea(LatLon(42.2787, -83.1822), "the US Census Bureau's internal point for Melvindale", false),
    "mount_clemens" to ServiceArea(LatLon(42.5981, -82.8815), "the US Census Bureau's internal point for Mount Clemens", false),
    "new_baltimore" to ServiceArea(LatLon(42.6853, -82.7377), "the US Census Bureau's internal point for New Baltimore", false),
    "novi" to ServiceArea(LatLon(42.4785, -83.4868), "the US Census Bureau's internal point for Novi", false),
    "oak_park" to ServiceArea(LatLon(42.4649, -83.1824), "the US Census Bureau's internal point for Oak Park", false),
    "orion_township" to ServiceArea(LatLon(42.7569, -83.2619), "the US Census Bureau's internal point for Orion Township", false),
    "pleasant_ridge" to ServiceArea(LatLon(42.4715, -83.1445), "the US Census Bureau's internal point for Pleasant Ridge", false),
    "pontiac" to ServiceArea(LatLon(42.6492, -83.2874), "the US Census Bureau's internal point for Pontiac", false),
    "redford_township" to ServiceArea(LatLon(42.3948, -83.2940), "the US Census Bureau's internal point for Redford Township", false),
    "river_rouge" to ServiceArea(LatLon(42.2743, -83.1242), "the US Census Bureau's internal point for River Rouge", false),
    "riverview" to ServiceArea(LatLon(42.1735, -83.1984), "the US Census Bureau's internal point for Riverview", false),
    "rochester" to ServiceArea(LatLon(42.6866, -83.1197), "the US Census Bureau's internal point for Rochester", false),
    "rochester_hills" to ServiceArea(LatLon(42.6635, -83.1592), "the US Census Bureau's internal point for Rochester Hills", false),
    "romulus" to ServiceArea(LatLon(42.2213, -83.3674), "the US Census Bureau's internal point for Romulus", false),
    "roseville" to ServiceArea(LatLon(42.5076, -82.9366), "the US Census Bureau's internal point for Roseville", false),
    "royal_oak" to ServiceArea(LatLon(42.5078, -83.1539), "the US Census Bureau's internal point for Royal Oak", false),
    "royal_oak_township" to ServiceArea(LatLon(42.4498, -83.1624), "the US Census Bureau's internal point for Royal Oak Township", false),
    "shelby_township" to ServiceArea(LatLon(42.6731, -83.0366), "the US Census Bureau's internal point for Shelby Township", false),
    "southfield" to ServiceArea(LatLon(42.4746, -83.2595), "the US Census Bureau's internal point for Southfield", false),
    "southfield_township" to ServiceArea(LatLon(42.5204, -83.2648), "the US Census Bureau's internal point for Southfield Township", false),
    "southgate" to ServiceArea(LatLon(42.2047, -83.2057), "the US Census Bureau's internal point for Southgate", false),
    "st_clair_shores" to ServiceArea(LatLon(42.4930, -82.8909), "the US Census Bureau's internal point for St. Clair Shores", false),
    "sterling_heights" to ServiceArea(LatLon(42.5812, -83.0303), "the US Census Bureau's internal point for Sterling Heights", false),
    "sylvan_lake" to ServiceArea(LatLon(42.6168, -83.3335), "the US Census Bureau's internal point for Sylvan Lake", false),
    "taylor" to ServiceArea(LatLon(42.2253, -83.2677), "the US Census Bureau's internal point for Taylor", false),
    "trenton" to ServiceArea(LatLon(42.1403, -83.1924), "the US Census Bureau's internal point for Trenton", false),
    "troy" to ServiceArea(LatLon(42.5839, -83.1455), "the US Census Bureau's internal point for Troy", false),
    "utica" to ServiceArea(LatLon(42.6287, -83.0233), "the US Census Bureau's internal point for Utica", false),
    "walled_lake" to ServiceArea(LatLon(42.5372, -83.4737), "the US Census Bureau's internal point for Walled Lake", false),
    "warren" to ServiceArea(LatLon(42.4929, -83.0250), "the US Census Bureau's internal point for Warren", false),
    "waterford_township" to ServiceArea(LatLon(42.6620, -83.3879), "the US Census Bureau's internal point for Waterford Township", false),
    "wayne" to ServiceArea(LatLon(42.2769, -83.3881), "the US Census Bureau's internal point for Wayne", false),
    "west_bloomfield_township" to ServiceArea(LatLon(42.5667, -83.3871), "the US Census Bureau's internal point for West Bloomfield Township", false),
    "westland" to ServiceArea(LatLon(42.3192, -83.3808), "the US Census Bureau's internal point for Westland", false),
    "white_lake_township" to ServiceArea(LatLon(42.6550, -83.5008), "the US Census Bureau's internal point for White Lake Township", false),
    "wixom" to ServiceArea(LatLon(42.5228, -83.5302), "the US Census Bureau's internal point for Wixom", false),
    "wyandotte" to ServiceArea(LatLon(42.2107, -83.1573), "the US Census Bureau's internal point for Wyandotte", false),
    "statewide" to ServiceArea(null, "no local centre: Michigan as a whole", true),
    "national" to ServiceArea(null, "no local centre: the United States", true),
)

fun isServiceArea(id: String): Boolean = SERVICE_AREAS.containsKey(id)

/** The string key a screen uses to name the area in words ("Serves Detroit"). Text never lives in code. */
fun serviceAreaKey(id: String?): String? = if (id != null && isServiceArea(id)) "area.$id" else null

/** Deliberately coarser than the 0–1/1–3/3+ ladder ordinary rows use: an area is a whole city. */
const val AREA_BAND_CLOSE_MILES = 3.0
const val AREA_BAND_MID_MILES = 10.0

/** Every category the service-area rules cover: shelter.dv and anything under it. */
fun isDvCategory(category: String): Boolean =
    category == "shelter.dv" || category.startsWith("shelter.dv.")

/**
 * Whether a row is ranked, and described, by the coarse area it serves (areas.ts `servesByArea`, 2026-09-24): every
 * domestic-violence row, and any other row that names a service area and has no coordinate.
 */
fun servesByArea(row: BundleRow): Boolean =
    isDvCategory(row.category) || (row.serviceArea != null && (row.lat == null || row.lon == null))

/** The string key for "Serves {area}" on a row described by its area, or null (areas.ts `servesAreaKey`). */
fun servesAreaKey(row: BundleRow): String? = if (servesByArea(row)) serviceAreaKey(row.serviceArea) else null
