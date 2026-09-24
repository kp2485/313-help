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
