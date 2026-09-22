// The four cities and the 205 Detroit neighborhoods as one thing: an **area**, which has a page, an outline, and a
// place in the map's pick order (audit §3 and §5; DECISIONS 2026-09-22, "The Map tab opens with help on it; the
// outlines of the four cities and the 205 neighborhoods are a layer" and "Hamtramck, Highland Park, Dearborn and
// Detroit each have a city page").
//
// Two rules are the whole point of this file and are worth saying before any code:
//
//   * **A city page draws a panel because the area's own `panels` list says so, never because a number happens to
//     be present.** "Dearborn does not publish blight tickets" is then a fact in the signed bundle rather than a
//     habit of a screen, and three clients cannot quietly disagree about it. [cityPanels] is the allow-list, in
//     the one order they are drawn, and there is no other way to ask.
//   * **No choropleth, ever** (docs/13, honesty rule 1). Nothing in here hands a number to anything that draws,
//     and [areaHit] settles a tap by the SIZE of the outline, never by anything inside it.
//
// No `android.` import, so `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs every case on
// a plain JDK — including a decode of the real shipped `indicators/neighborhoods.json` (AreasTest.kt). It is the
// Kotlin half of apps/web/src/hoods.ts (`Area`, `CityRow`, `areaById`, `isArea`, `CITY_PANELS`, `cityPage`).
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon
import kotlin.math.abs

// ---- what the bundle carries -------------------------------------------------------------------------------------

/** A city in the index: its id, its name, and whether it has neighborhoods under it. */
class CityRow(val id: String, val name: String, val kind: String, val children: String) {
    /** True for Detroit alone today: the one city that publishes named sub-city outlines. */
    val hasNeighborhoods: Boolean get() = children == "neighborhood"

    companion object {
        fun fromJson(j: Json): CityRow = CityRow(
            id = j["id"]?.str ?: "",
            name = j["name"]?.str ?: "",
            kind = j["kind"]?.str ?: "city",
            children = j["children"]?.str ?: "none",
        )
    }
}

/**
 * Where one panel's numbers came from. The **notice** is the owner's own required sentence — SEMCOG ask for theirs
 * wherever their data is reproduced — so it is carried in their words, printed in their language, and never
 * rewritten or translated by us.
 */
class AreaSource(
    val name: String,
    val url: String,
    val license: String,
    val licenseUrl: String?,
    val notice: String?,
    val lastEdited: String,
    val recordsFrom: String?,
) {
    companion object {
        fun fromJson(j: Json): AreaSource = AreaSource(
            name = j["name"]?.str ?: "",
            url = j["url"]?.str ?: "",
            license = j["license"]?.str ?: "",
            licenseUrl = j["license_url"]?.str,
            notice = j["notice"]?.str,
            lastEdited = j["last_edited"]?.str ?: "",
            recordsFrom = j["records_from"]?.str,
        )
    }
}

/** A panel this city has no numbers for, and which of the two honest reasons it is. */
class MissingPanel(val panel: String, val why: String) {
    val notPublished: Boolean get() = why == "not_published"
    val noneRecorded: Boolean get() = why == "none_recorded"
}

/** New homes permitted in one year. `monthsReported` under 12 is a year the city did not report in full, which the
 *  page says out loud rather than passing an estimate off as a count. */
class PermitYear(val year: Int, val buildings: Int, val units: Int, val monthsReported: Int) {
    val partial: Boolean get() = monthsReported < 12
}

/** The pavement bands the regional survey publishes for a whole city. */
class RoadsBands(val pieces: Int, val miles: Double, val goodPct: Double, val fairPct: Double, val poorPct: Double)

/** Homes standing empty, from the federal estimate. */
class Vacancy(val housingUnits: Int, val vacant: Int, val pct: Double, val population: Int)

/**
 * One whole-city page. It is a [Hood] with extra keys, because it is the same page drawn with the same pieces —
 * the outline, the help panel, the nearest rows, the crash counts are shared code and not a copy.
 */
class Area(
    val hood: Hood,
    val city: String,
    val kind: String,
    val panels: List<String>,
    /** panel -> the key of the [AreaSource] that panel's numbers came from. Nothing inherits a source. */
    val sources: Map<String, String>,
    val missing: List<MissingPanel>,
    val parkAcres: Double?,
    val roadsBands: RoadsBands?,
    val vacancy: Vacancy?,
    val permitsByYear: List<PermitYear>,
) {
    val id: String get() = hood.id
    val name: String get() = hood.name
    val isCity: Boolean get() = kind == "city"

    companion object {
        fun fromJson(j: Json): Area {
            val roads = j["roads_bands"]
            val vac = j["vacancy"]
            return Area(
                hood = Hood.fromJson(j),
                city = j["city"]?.str ?: "",
                kind = j["kind"]?.str ?: "city",
                panels = j.strings("panels"),
                sources = (j["sources"]?.obj ?: emptyMap()).mapValues { it.value.str ?: "" },
                missing = (j["missing"]?.arr ?: emptyList()).map {
                    MissingPanel(it["panel"]?.str ?: "", it["why"]?.str ?: "")
                },
                parkAcres = j["park_acres"]?.num,
                roadsBands = if (roads == null) null else RoadsBands(
                    pieces = roads["pieces"]?.int ?: 0,
                    miles = roads["miles"]?.num ?: 0.0,
                    goodPct = roads["good_pct"]?.num ?: 0.0,
                    fairPct = roads["fair_pct"]?.num ?: 0.0,
                    poorPct = roads["poor_pct"]?.num ?: 0.0,
                ),
                vacancy = if (vac == null) null else Vacancy(
                    housingUnits = vac["housing_units"]?.int ?: 0,
                    vacant = vac["vacant"]?.int ?: 0,
                    pct = vac["pct"]?.num ?: 0.0,
                    population = vac["population"]?.int ?: 0,
                ),
                permitsByYear = (j["permits_by_year"]?.arr ?: emptyList()).map {
                    PermitYear(
                        year = it["year"]?.int ?: 0,
                        buildings = it["buildings"]?.int ?: 0,
                        units = it["units"]?.int ?: 0,
                        monthsReported = it["months_reported"]?.int ?: 12,
                    )
                },
            )
        }
    }
}

// ---- the allow-list ------------------------------------------------------------------------------------------------

/**
 * **The allow-list, in the order a city page draws them.** A key that is not in here can never be drawn, and a key
 * in here is drawn only when this area lists it. Exactly `CITY_PANELS` in apps/web/src/hoods.ts.
 */
val CITY_PANELS: List<String> = listOf("help", "parks", "crashes", "roads", "vacancy", "permits")

/** The panels this area may draw, in the fixed order. Anything the area asks for that is not on the list is
 *  dropped here rather than somewhere a screen might forget to check. */
fun cityPanels(area: Area): List<String> = CITY_PANELS.filter { area.panels.contains(it) }

/** The source line for one panel, or null. Panels never share a source: Detroit's parks come from the City and
 *  Hamtramck's from SEMCOG, and two numbers that share a word must not share a line. */
fun panelSource(area: Area, d: Indicators, panel: String): AreaSource? {
    val key = area.sources[panel] ?: return null
    return d.areaSources[key]
}

/** Every source this page cites, once each, in the order the panels are drawn. */
fun areaSourcesOf(area: Area, d: Indicators): List<AreaSource> {
    val seen = LinkedHashSet<String>()
    for (p in cityPanels(area)) area.sources[p]?.let { seen.add(it) }
    for (k in area.sources.values) seen.add(k)
    return seen.mapNotNull { d.areaSources[it] }
}

// ---- finding an area -------------------------------------------------------------------------------------------------

/** A page an id names: one of Detroit's 205 neighborhoods, or one of the four whole-city areas. */
sealed class AreaPage {
    class OfNeighborhood(val neighborhood: Hood) : AreaPage()
    class OfCity(val area: Area) : AreaPage()

    /** The outline, the name and the help counts, whichever kind of area this is. */
    val hood: Hood get() = when (this) {
        is OfNeighborhood -> neighborhood
        is OfCity -> area.hood
    }

    val id: String get() = hood.id
    val name: String get() = hood.name
}

/** The page for an id, whichever kind of area it names, or null for an id this bundle does not carry. */
fun areaById(d: Indicators, id: String): AreaPage? {
    d.hood(id)?.let { return AreaPage.OfNeighborhood(it) }
    d.areas.firstOrNull { it.id == id }?.let { return AreaPage.OfCity(it) }
    return null
}

/**
 * The area a point falls in: **the four cities first, then the neighborhoods of the city that hit** — which is
 * both cheaper than walking 205 outlines and the reason a Hamtramck resident is no longer told they are not in the
 * app. Null only for a point outside all four cities, which stays a real and honest answer.
 *
 * The port of `areaAt` in apps/web/src/hoodfind.ts. Everything here runs on the phone, over outlines in the signed
 * bundle, from a fix that is never written down and never sent (docs/08).
 */
fun areaAt(d: Indicators, lat: Double, lon: Double): AreaPage? {
    val city = d.areas.firstOrNull {
        it.isCity && it.hood.rings.isNotEmpty() && hoodContains(it.hood, d.origin, lat, lon)
    } ?: return null
    if (cityOf(d, city.id)?.hasNeighborhoods == true) {
        hoodAt(d, lat, lon)?.let { return AreaPage.OfNeighborhood(it) }
    }
    return AreaPage.OfCity(city)
}

fun areaAt(d: Indicators, p: LatLon): AreaPage? = areaAt(d, p.lat, p.lon)

fun cityOf(d: Indicators, id: String): CityRow? = d.cities.firstOrNull { it.id == id }

/** The city an area belongs to, by name, for the sub-line under a name on the map card and in the index. */
fun cityNameOf(d: Indicators, area: AreaPage): String = when (area) {
    is AreaPage.OfCity -> area.area.name
    is AreaPage.OfNeighborhood -> d.cities.firstOrNull { it.hasNeighborhoods }?.name ?: ""
}

// ---- the layer, and what a tap on it finds --------------------------------------------------------------------------

/**
 * One outline the map may draw: an id, a name, whether it is a whole city, and its rings as lat/lon. The map is
 * handed **no number at all** about the area, which is how docs/13's rule 1 is kept by construction rather than by
 * remembering.
 */
class DrawnArea(val id: String, val name: String, val isCity: Boolean, val rings: List<List<LatLon>>) {

    /** The area the outline encloses, in square degrees. Only ever compared with another one of these. */
    val size: Double = rings.sumOf { ring ->
        if (ring.size < 3) {
            0.0
        } else {
            var s = 0.0
            var j = ring.size - 1
            for (i in ring.indices) {
                s += (ring[j].lon + ring[i].lon) * (ring[j].lat - ring[i].lat)
                j = i
            }
            abs(s / 2)
        }
    }

    fun contains(lat: Double, lon: Double): Boolean {
        var inside = false
        for (ring in rings) {
            if (ring.size < 3) continue
            var j = ring.size - 1
            for (i in ring.indices) {
                val a = ring[i]
                val b = ring[j]
                if ((a.lat > lat) != (b.lat > lat)) {
                    val cut = (b.lon - a.lon) * (lat - a.lat) / (b.lat - a.lat) + a.lon
                    if (lon < cut) inside = !inside
                }
                j = i
            }
        }
        return inside
    }
}

/**
 * The outlines the layer draws: the four cities and all 205 neighborhoods, **at every zoom**.
 *
 * It used to hide the neighborhoods above 14 m per dp, on the reasoning that a name that does not fit should not
 * be promised. The Map tab opens on the whole city, so in practice a person saw four city edges and none of the
 * 205 they had come to find (Kyle, 2026-09-22: "The user needs to be able to see the boundaries of the
 * neighborhoods on the map"; docs/MAP-STYLE.md section 15). What keeps 205 outlines from being a mesh is now
 * **weight** — [boundaryStyle] — and the NAMES are what the zoom still governs, capped at twelve a frame.
 */
fun drawnAreas(d: Indicators): List<DrawnArea> {
    val out = ArrayList<DrawnArea>()
    for (a in d.areas) {
        if (!a.isCity || a.hood.rings.isEmpty()) continue
        out.add(DrawnArea(a.id, a.name, true, hoodRings(a.hood, d.origin)))
    }
    for (h in d.neighborhoods) {
        if (h.rings.isEmpty()) continue
        out.add(DrawnArea(h.id, h.name, false, hoodRings(h, d.origin)))
    }
    return out
}

/**
 * Which outline a tap found: **the smallest one holding the point wins**, so a Detroit neighborhood beats the
 * Detroit outline it sits inside, and a whole-city area is only ever the answer where no neighborhood covers the
 * tap. Never a number about the area, and never the nearest outline — a tap outside every outline is a miss.
 */
fun areaHit(areas: List<DrawnArea>, lat: Double, lon: Double): DrawnArea? =
    areas.filter { it.contains(lat, lon) }.minWithOrNull(compareBy({ it.size }, { it.id }))

/**
 * The map's pick order (DECISIONS 2026-09-22): an area sits **behind everything a person came to the map to find
 * and ahead of a park**. Written down once, here, so the canvas, the keyboard walk and the tests cannot drift.
 *
 * The keyboard walk (N/P) is the reverse of the tail of it — segment, then area, then dot — because the walk goes
 * from the biggest thing to the smallest and a tap goes from the smallest to the biggest.
 */
val MAP_PICK_ORDER: List<String> = listOf("dot", "glyph", "stop", "greenway", "route", "area", "park")

/** The order TalkBack and a hardware keyboard walk the map's virtual nodes in. */
val MAP_WALK_ORDER: List<String> = listOf("segment", "area", "dot")
