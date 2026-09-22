// "Parks and paths": 302 City parks, the recreation centers, and the Joe Louis Greenway as **one row inside it**
// (Kyle, 2026-09-22: "This is not a Joe Louis Greenway app; it is just one component of the park system. It
// doesn't need to be as loud as it is on the main page." DECISIONS 2026-09-22).
//
// Before this, 302 parks had no page at all and 52 greenway stretches each had a full screen, a Home tile, a line
// on every listing detail and a line on every map in the app. That imbalance was an artefact of the order the two
// datasets arrived in, not a fact about the city.
//
// The one rule worth stating out loud: **the list is never ordered by a number about the park.** Nearest first
// when a location or a typed ZIP is known, A to Z when none is — never by acres, never by the kind of park, never
// by anything that would read as a ranking of places people live beside (docs/13, honesty rule 1).
// `parksOrderIsNeverByAnIndicator` in ParksTest holds it there.
//
// No `android.` import: `:core` compiles it and runs its tests on a plain JDK, over the real shipped
// `places/parks.json`.
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon
import kotlin.math.hypot

/** The file, in the signed bundle. Checked against the signed index before a byte of it is decoded. */
const val PARKS_FILE = "places/parks.json"

/**
 * One park, as the City publishes it. [address] is null where the City publishes none — a coordinate is never
 * turned into an address we then print (CLAUDE.md).
 */
class Park(
    val id: String,
    val name: String,
    val address: String?,
    /** The City's own words: "Park: Mini", "Park: Riverfront". Shown as written; never used to order the list. */
    val type: String?,
    val acres: Double?,
    val lat: Double?,
    val lon: Double?,
) {
    val point: LatLon? get() = if (lat != null && lon != null) LatLon(lat, lon) else null

    companion object {
        fun fromJson(j: Json): Park = Park(
            id = j["id"]?.str ?: "",
            name = j["name"]?.str ?: "",
            address = j["address"]?.str?.takeIf { it.isNotBlank() },
            type = j["type"]?.str?.takeIf { it.isNotBlank() },
            acres = j["acres"]?.num,
            lat = j["lat"]?.num,
            lon = j["lon"]?.num,
        )
    }
}

fun decodeParks(bytes: ByteArray): List<Park> =
    (Json.parse(bytes)["parks"]?.arr ?: emptyList()).map { Park.fromJson(it) }

/** For matching and for filing under a letter: the same folding the neighborhood index uses. */
private fun key(name: String): String = hoodSearchKey(name)

/** A to Z by the City's own name, with the raw name breaking a tie so one bundle always gives one order. */
fun parksAtoZ(list: List<Park>): List<Park> = list.sortedWith(compareBy({ key(it.name) }, { it.name }))

/** Straight-line distance in miles, flat, as everywhere else around Detroit. Only ever compared. */
fun parkMiles(p: Park, from: LatLon): Double? {
    val lat = p.lat ?: return null
    val lon = p.lon ?: return null
    return hypot((lat - from.lat) * 69.0, (lon - from.lon) * 69.0 * 0.74)
}

/**
 * The list a person sees: **nearest first when we know where they are, A to Z when we do not** — and nothing else,
 * ever. A park with no published coordinate cannot be measured, so it keeps its place at the end in name order
 * rather than being dropped or given an invented distance.
 */
fun parksInOrder(list: List<Park>, near: LatLon?): List<Park> {
    if (near == null) return parksAtoZ(list)
    val measured = ArrayList<Pair<Park, Double>>()
    val unmeasured = ArrayList<Park>()
    for (p in list) {
        val m = parkMiles(p, near)
        if (m == null) unmeasured.add(p) else measured.add(p to m)
    }
    measured.sortWith(compareBy({ it.second }, { key(it.first.name) }, { it.first.name }))
    return measured.map { it.first } + parksAtoZ(unmeasured)
}

fun parkById(list: List<Park>, id: String): Park? = list.firstOrNull { it.id == id }

/** How near counts as "help within a ten-minute walk" of a park, in miles — the same quarter mile the listing
 *  detail's "Near a park or path" row uses. */
const val PARK_HELP_MILES = 0.25

/** How near a greenway stretch has to be for a park page to name it, in miles. */
const val PARK_GREENWAY_MILES = 0.5

/**
 * The Riverwalk and the Dequindre Cut are **not in the City list we use** — `places/parks.json` has
 * "Dequindre-Emery" and "Dequindre-Grixdale" as small parks and no Riverwalk row at all. The screen says so rather
 * than implying the 302 rows are the whole park system (DECISIONS 2026-09-22). This is the string key it says it
 * with; the sentence itself lives in the strings files like every other word in the app.
 */
const val PARKS_GAP_KEY = "rec.paths_gap"
