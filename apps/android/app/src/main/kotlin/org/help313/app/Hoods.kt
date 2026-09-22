// Neighborhood numbers (docs/13): "How is Bagley doing?" Public City data joined with our own listings by the
// pipeline, in one signed bundle file. Nothing here comes from a phone, a report, or app usage.
//
// No android.* class anywhere in this file, so `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test`
// runs every rule below on a plain JDK — the decode, where a point falls, the order of the index, and every number
// that reaches a screen. HoodScreens.kt does nothing but lay these answers out.
//
// This is a port, rule for rule, of apps/web/src/hoods.ts. The honesty rules that live in both files:
//
//   - **No league table.** Lists are alphabetical, or grouped by council district and alphabetical inside that.
//     Nothing here can sort by a number, and [hoodsAtoZ] and [hoodsByDistrict] are given the names only.
//   - **Every count is the real number, however small** (Kyle, 2026-09-22 — DECISIONS). Nothing in the file is
//     hidden, crashes included, and nothing here hides it: a 3 is a 3. A value an older file hid (`"lt5"`) reads
//     as nothing recorded, so an older list still draws every number it does have.
//   - **A rate needs a base we can defend** — at least 100 lots, or there is no rate ([hoodRate]).
//   - **Every number says where it came from and when** ([Indicators.sources]).
//   - **"None listed yet" describes our list, not the place.**
//   - Crime is left out on purpose, and crashes are a road-design number, never a crime number.
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon
import java.text.Normalizer
import java.util.Locale

// ---- what the bundle publishes ----------------------------------------------------------------------------------

/**
 * A count as the bundle publishes it: a whole number, exactly as the City's server returned it. Since 2026-09-22
 * there is no hidden value in the file at all; the type stays so that every field that is a count says so.
 * Absent altogether is "none recorded", which is a different sentence from any number.
 */
class HoodCount private constructor(val value: Int) {

    override fun equals(other: Any?): Boolean = other is HoodCount && other.value == value
    override fun hashCode(): Int = value
    override fun toString(): String = value.toString()

    companion object {
        fun of(n: Int): HoodCount = HoodCount(n)

        /** null when the field is not there at all — or is not a number: the `"lt5"` of a file built before
         *  2026-09-22 reads as nothing recorded, so an older list on a phone still draws what it does have. */
        fun fromJson(j: Json?): HoodCount? = j?.int?.let { HoodCount(it) }
    }
}

/** One year for one neighborhood, or for the whole city. Every field may be missing. */
class HoodYear(
    val sales: HoodCount? = null,
    val medianPrice: Double? = null,
    val permits: HoodCount? = null,
    val permitCost: Double? = null,
    val blight: HoodCount? = null,
    val demolitions: HoodCount? = null,
    val issues: HoodCount? = null,
    val issueDays: Double? = null,
    val fires: HoodCount? = null,
) {
    companion object {
        val EMPTY = HoodYear()

        fun fromJson(j: Json?): HoodYear {
            if (j == null) return EMPTY
            return HoodYear(
                sales = HoodCount.fromJson(j["sales"]),
                medianPrice = j["median_price"]?.num,
                permits = HoodCount.fromJson(j["permits"]),
                permitCost = j["permit_cost"]?.num,
                blight = HoodCount.fromJson(j["blight"]),
                demolitions = HoodCount.fromJson(j["demolitions"]),
                issues = HoodCount.fromJson(j["issues"]),
                issueDays = j["issue_days"]?.num,
                fires = HoodCount.fromJson(j["fires"]),
            )
        }
    }
}

/** Main-street ratings: how many pieces were rated, how many miles they are, and the share in poor shape. */
class HoodRoads(val pieces: HoodCount?, val miles: Double?, val poorPct: Double?) {
    companion object {
        fun fromJson(j: Json?): HoodRoads? = if (j == null) null else
            HoodRoads(HoodCount.fromJson(j["pieces"]), j["miles"]?.num, j["poor_pct"]?.num)
    }
}

/** Today's numbers, not a year's: rental certificates in force, vacant registrations of the past 12 months, roads. */
class HoodNow(val rentalCerts: HoodCount?, val vacantReg: HoodCount?, val roads: HoodRoads?) {
    companion object {
        fun fromJson(j: Json?): HoodNow? = if (j == null) null else HoodNow(
            HoodCount.fromJson(j["rental_certs"]),
            HoodCount.fromJson(j["vacant_reg"]),
            HoodRoads.fromJson(j["roads"]),
        )
    }
}

/**
 * "Safe streets" (docs/13): crashes the police wrote up that involved someone walking or biking, over the years the
 * panel names. Exact counts. **Never a rate** — docs/13 defines no denominator here.
 */
class HoodCrashes(val walk: HoodCount?, val bike: HoodCount?, val severe: HoodCount?) {
    companion object {
        fun fromJson(j: Json?): HoodCrashes? = if (j == null) null else HoodCrashes(
            HoodCount.fromJson(j["walk"]), HoodCount.fromJson(j["bike"]), HoodCount.fromJson(j["severe"]),
        )
        /** The same three counts for each year of the window (`crashes_by_year`, 2026-09-22), oldest first. */
        fun byYear(j: Json?): Map<String, HoodCrashes> {
            val out = LinkedHashMap<String, HoodCrashes>()
            for (k in (j?.obj?.keys ?: emptySet()).sorted()) fromJson(j!![k])?.let { out[k] = it }
            return out
        }
    }
}

/** What our own list holds here. [coverageChecked] is what the "we haven't listed much here yet" panel asks. */
class HoodHelp(
    val total: Int,
    val by: Map<String, Int>,
    val nearestMiles: Map<String, Double?>,
    /**
     * Which listing each "nearest listed" distance belongs to, when the bundle says (`help.nearest_id`).
     *
     * Optional on purpose: a bundle built before the field existed simply has none, and the page draws the same
     * plain rows it drew then. It is never worked out on the phone — a distance the pipeline published and a
     * listing this phone picked could disagree, and a row that opened the wrong place would be a wrong fact.
     */
    val nearestId: Map<String, String>,
    val noneListedYet: List<String>,
    val coverageChecked: Boolean,
) {
    companion object {
        fun fromJson(j: Json?): HoodHelp {
            val by = LinkedHashMap<String, Int>()
            for ((k, v) in (j?.get("by")?.obj ?: emptyMap())) v.int?.let { by[k] = it }
            val near = LinkedHashMap<String, Double?>()
            for ((k, v) in (j?.get("nearest_miles")?.obj ?: emptyMap())) near[k] = v.num
            val ids = LinkedHashMap<String, String>()
            // A null id is the bundle saying "nothing of this kind is listed", which is the same as no entry.
            for ((k, v) in (j?.get("nearest_id")?.obj ?: emptyMap())) v.str?.let { ids[k] = it }
            return HoodHelp(
                total = j?.get("total")?.int ?: 0,
                by = by,
                nearestMiles = near,
                nearestId = ids,
                noneListedYet = j?.strings("none_listed_yet") ?: emptyList(),
                coverageChecked = j?.get("coverage_checked")?.bool ?: false,
            )
        }
    }
}

/** Parks, recreation centers, open greenway, Bridge-card stores and bus stops inside or within half a mile. */
class HoodPlaces(
    val parks: Int,
    val recCenters: Int,
    val greenwayOpen: Int,
    val snapStores: Int?,
    val busStops: Int?,
) {
    companion object {
        fun fromJson(j: Json?) = HoodPlaces(
            parks = j?.get("parks")?.int ?: 0,
            recCenters = j?.get("rec_centers")?.int ?: 0,
            greenwayOpen = j?.get("greenway_open")?.int ?: 0,
            snapStores = j?.get("snap_stores")?.int,
            busStops = j?.get("bus_stops")?.int,
        )
    }
}

/** Straight-line miles from the middle of the neighborhood. A null is "none found", never a zero. */
class HoodNearestCity(val snap: Double?, val grocery: Double?, val bus: Double?) {
    companion object {
        fun fromJson(j: Json?): HoodNearestCity? = if (j == null) null else
            HoodNearestCity(j["snap"]?.num, j["grocery"]?.num, j["bus"]?.num)
    }
}

/** One open dataset, with the day its publisher last edited it. Every panel prints one of these. */
class HoodSource(val name: String, val url: String, val lastEdited: String) {
    companion object {
        fun fromJson(j: Json?): HoodSource? {
            val name = j?.get("name")?.str ?: return null
            return HoodSource(name, j["url"]?.str ?: "", j["last_edited"]?.str ?: "")
        }
    }
}

/**
 * One of the City's 205 neighborhoods. [rings] is the outline, delta encoded in hundred-thousandths of a degree
 * from [Indicators.origin], exactly as the map files are; [hoodRings] turns one into points.
 */
class Hood(
    val id: String,
    val name: String,
    val district: Int?,
    val jlgStudyArea: Boolean,
    val center: LatLon,
    val rings: List<IntArray>,
    val help: HoodHelp,
    val places: HoodPlaces,
    val nearestCity: HoodNearestCity?,
    val parcels: Int?,
    val years: Map<String, HoodYear>,
    val now: HoodNow?,
    val crashes: HoodCrashes?,
    /** The same three counts for each year of the window. Empty for a bundle built before 2026-09-22, and the
     *  panel then draws the totals and no chart. */
    val crashesByYear: Map<String, HoodCrashes> = emptyMap(),
) {
    fun year(y: String): HoodYear = years[y] ?: HoodYear.EMPTY

    companion object {
        fun fromJson(j: Json): Hood {
            val c = j["center"]?.arr ?: emptyList()
            val years = LinkedHashMap<String, HoodYear>()
            for ((k, v) in (j["years"]?.obj ?: emptyMap())) years[k] = HoodYear.fromJson(v)
            return Hood(
                id = j["id"]?.str ?: "",
                name = j["name"]?.str ?: "",
                district = j["district"]?.int,
                jlgStudyArea = j["jlg_study_area"]?.bool ?: false,
                // `center` is published as [lat, lon] — the one place the bundle writes that way round, because
                // pipeline/src/indicators.ts turns the layer's [lon, lat] over as it writes it. `origin`, a few
                // lines below, is still [lon, lat] like the map files.
                center = LatLon(c.getOrNull(0)?.num ?: 0.0, c.getOrNull(1)?.num ?: 0.0),
                rings = (j["rings"]?.arr ?: emptyList()).map { ring ->
                    val items = ring.arr
                    IntArray(items.size) { items[it].int ?: 0 }
                },
                help = HoodHelp.fromJson(j["help"]),
                places = HoodPlaces.fromJson(j["places"]),
                nearestCity = HoodNearestCity.fromJson(j["nearest_city"]),
                parcels = j["parcels"]?.int,
                years = years,
                now = HoodNow.fromJson(j["now"]),
                crashes = HoodCrashes.fromJson(j["crashes"]),
                crashesByYear = HoodCrashes.byYear(j["crashes_by_year"]),
            )
        }
    }
}

/** The whole of `indicators/neighborhoods.json`: the citywide numbers, the sources, and all 205 neighborhoods. */
class Indicators(
    val sources: Map<String, HoodSource>,
    val cityParcels: Int?,
    val issueTypes: List<String>,
    val fireTypes: List<String>,
    val cityNow: HoodNow?,
    val roadsYears: Pair<Int, Int>?,
    val vacantPeriod: Pair<String, String>?,
    val crashYears: Pair<Int, Int>?,
    val cityCrashes: HoodCrashes?,
    val crashRecordsFrom: String?,
    val statsFetchedAt: String,
    val cityCrashesByYear: Map<String, HoodCrashes> = emptyMap(),
    val firstYear: Int,
    val partialYear: Int,
    val nearMiles: Double,
    /** [lon, lat] that every ring's deltas are counted from. */
    val origin: DoubleArray,
    val city: Map<String, HoodYear>,
    val neighborhoods: List<Hood>,
    /** Greenway stretch id to the neighborhoods it runs through. */
    val segments: Map<String, List<String>>,
) {
    fun hood(id: String): Hood? = neighborhoods.firstOrNull { it.id == id }

    /** The years every table has a row for, oldest first — the citywide table's own years, as on the web. */
    val years: List<String> get() = city.keys.sorted()
}

// ---- reading the file --------------------------------------------------------------------------------------------

/**
 * The bundle file, decoded.
 *
 * The bytes are checked against the sha256 in the **signed** index before they reach here (BundleStore.verifiedBytes)
 * and [Json] caps its own depth and length, so a file that is not right throws rather than half-loading. Every caller
 * treats a throw as "the neighborhood numbers could not be read", never as "this neighborhood has no numbers".
 */
const val HOOD_FILE = "indicators/neighborhoods.json"

fun decodeIndicators(bytes: ByteArray): Indicators {
    val j = Json.parse(bytes)
    val sources = LinkedHashMap<String, HoodSource>()
    for ((k, v) in (j["sources"]?.obj ?: emptyMap())) HoodSource.fromJson(v)?.let { sources[k] = it }
    val city = LinkedHashMap<String, HoodYear>()
    for ((k, v) in (j["city"]?.obj ?: emptyMap())) city[k] = HoodYear.fromJson(v)
    val segments = LinkedHashMap<String, List<String>>()
    for ((k, v) in (j["segments"]?.obj ?: emptyMap())) segments[k] = v.arr.mapNotNull { it.str }
    val origin = j["origin"]?.arr ?: emptyList()
    fun ints(key: String): Pair<Int, Int>? {
        val a = j[key]?.arr ?: return null
        val from = a.getOrNull(0)?.int ?: return null
        val to = a.getOrNull(1)?.int ?: return null
        return from to to
    }
    fun days(key: String): Pair<String, String>? {
        val a = j[key]?.arr ?: return null
        val from = a.getOrNull(0)?.str ?: return null
        val to = a.getOrNull(1)?.str ?: return null
        return from to to
    }
    return Indicators(
        sources = sources,
        cityParcels = j["city_parcels"]?.int,
        issueTypes = j.strings("issue_types"),
        fireTypes = j.strings("fire_types"),
        cityNow = HoodNow.fromJson(j["city_now"]),
        roadsYears = ints("roads_years"),
        vacantPeriod = days("vacant_period"),
        crashYears = ints("crash_years"),
        cityCrashes = HoodCrashes.fromJson(j["city_crashes"]),
        cityCrashesByYear = HoodCrashes.byYear(j["city_crashes_by_year"]),
        crashRecordsFrom = j["crash_records_from"]?.str,
        statsFetchedAt = j["stats_fetched_at"]?.str ?: "",
        firstYear = j["first_year"]?.int ?: 0,
        partialYear = j["partial_year"]?.int ?: 0,
        nearMiles = j["near_miles"]?.num ?: 0.5,
        origin = DoubleArray(origin.size) { origin[it].num ?: 0.0 },
        city = city,
        neighborhoods = (j["neighborhoods"]?.arr ?: emptyList()).map { Hood.fromJson(it) },
        segments = segments,
    )
}

// ---- the outline, and where a point falls --------------------------------------------------------------------------

/**
 * One ring as latitude and longitude. The same delta encoding as the map files and the same arithmetic as
 * `outline` in apps/web/src/hoods.ts: each pair is added to the last, in hundred-thousandths of a degree from
 * [Indicators.origin].
 */
fun hoodRing(enc: IntArray, origin: DoubleArray): List<LatLon> {
    if (origin.size < 2) return emptyList()
    val out = ArrayList<LatLon>(enc.size / 2)
    var x = 0
    var y = 0
    var i = 0
    while (i + 1 < enc.size) {
        x += enc[i]
        y += enc[i + 1]
        out.add(LatLon(origin[1] + y / 1e5, origin[0] + x / 1e5))
        i += 2
    }
    return out
}

fun hoodRings(h: Hood, origin: DoubleArray): List<List<LatLon>> = h.rings.map { hoodRing(it, origin) }

/**
 * Whether a point is inside this neighborhood's outline: ray casting, counting crossings of every ring.
 *
 * **This runs on the phone and only on the phone.** It is how "Your neighborhood" is answered from a coarse fix that
 * MainActivity holds in memory: the fix is never written down, never sent, and never put in a URL (docs/08). The
 * City's outlines are in the signed bundle, so nothing is asked of anybody to answer it.
 *
 * A neighborhood may have more than one ring; a point inside an odd number of them is inside. Points exactly on an
 * edge fall on one side or the other and it does not matter which: the two neighborhoods either side are both a
 * true answer to "where am I".
 */
fun hoodContains(h: Hood, origin: DoubleArray, lat: Double, lon: Double): Boolean {
    if (lat.isNaN() || lon.isNaN() || lat.isInfinite() || lon.isInfinite()) return false
    var inside = false
    for (ring in hoodRings(h, origin)) {
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

/** A quick reject before the crossings are counted: 205 outlines, one point, on a cheap phone. */
private fun hoodBoxHolds(h: Hood, origin: DoubleArray, lat: Double, lon: Double): Boolean {
    var minLat = Double.POSITIVE_INFINITY
    var maxLat = Double.NEGATIVE_INFINITY
    var minLon = Double.POSITIVE_INFINITY
    var maxLon = Double.NEGATIVE_INFINITY
    for (ring in hoodRings(h, origin)) {
        for (c in ring) {
            if (c.lat < minLat) minLat = c.lat
            if (c.lat > maxLat) maxLat = c.lat
            if (c.lon < minLon) minLon = c.lon
            if (c.lon > maxLon) maxLon = c.lon
        }
    }
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
}

/**
 * The neighborhood a point falls in, or null — which is a real answer and the honest one: the City's outlines
 * cover Detroit, so a point in Hamtramck, Highland Park, Dearborn, Windsor or the lake is in none of them and the
 * screen says so (`hood.mine_outside`) rather than naming whichever outline happens to be nearest.
 *
 * The list is walked in its published order and the first hit wins, so the answer never depends on any number.
 * The port of `hoodAt` in apps/web/src/hoodfind.ts; the cases both are held to are
 * `schema/neighborhoods/points.json`.
 */
fun hoodAt(d: Indicators, lat: Double, lon: Double): Hood? = d.neighborhoods.firstOrNull {
    it.rings.isNotEmpty() && hoodBoxHolds(it, d.origin, lat, lon) && hoodContains(it, d.origin, lat, lon)
}

fun hoodAt(d: Indicators, p: LatLon): Hood? = hoodAt(d, p.lat, p.lon)

/**
 * A typed ZIP. The bundle carries one point per ZIP — its centre — and a ZIP covers more than one neighborhood,
 * so this answers with the neighborhood that centre falls in and a screen says as much (`hood.mine_zip`). An empty
 * list when the centre is outside every Detroit outline.
 *
 * It answers with a list, not one neighborhood, because the day the bundle carries ZIP outlines this is where the
 * several they touch will come from. The port of `hoodsForZip` in apps/web/src/hoodfind.ts. **No screen on this
 * phone asks it yet**: Android has no "type a ZIP" box, so this is the rule, held to the shared cases, waiting for
 * the box rather than a second rule written later.
 */
fun hoodsForZip(d: Indicators, centre: LatLon): List<Hood> = listOfNotNull(hoodAt(d, centre))

// ---- the order of the index, and finding a name ---------------------------------------------------------------------

/** NFD, with the combining marks the decomposition has just split off dropped rather than compared. */
private fun stripMarks(s: String): String {
    val flat = Normalizer.normalize(s, Normalizer.Form.NFD)
    val sb = StringBuilder(flat.length)
    for (c in flat) {
        if (Character.getType(c) == Character.NON_SPACING_MARK.toInt()) continue
        sb.append(c)
    }
    return sb.toString()
}

/**
 * The key a name is **filed** under: its accents and its case taken off, and nothing else.
 *
 * Punctuation is kept, because it is what decides the order between "Gratiot Town/Kettering" and
 * "Gratiot-Findlay". Comparing these keys by character gives the same order as the web's `name.localeCompare(name)`
 * for all 205 of the City's names, which `theIndexIsAlphabeticalAndGrouped` checks against the real file — so the
 * index reads the same way in a browser and on a phone.
 *
 * `java.text.Normalizer` is in the JDK and in Android since API 9, so this file stays android-free.
 */
fun foldHoodName(s: String): String = stripMarks(s).lowercase(Locale.ROOT)

/**
 * The key a name is **searched** by: accents and case off, and every run of anything that is not a letter or a
 * digit turned into one space. The port of `foldName` in apps/web/src/hoodfind.ts.
 */
fun hoodSearchKey(s: String): String {
    val flat = foldHoodName(s)
    val sb = StringBuilder(flat.length)
    var space = false
    for (c in flat) {
        if (c in 'a'..'z' || c in '0'..'9') {
            if (space && sb.isNotEmpty()) sb.append(' ')
            space = false
            sb.append(c)
        } else {
            space = true
        }
    }
    return sb.toString()
}

/**
 * Whether this name answers what somebody typed.
 *
 * A typed word matches when a **word of the name starts with it**, and every word typed has to match something:
 * "park" finds "Palmer Park" and "Park Grove" but not "Sparkle", and "north cork" finds "North Corktown". Typing
 * nothing matches everything, so the list starts whole rather than empty. Port of `matchHoods` in
 * apps/web/src/hoodfind.ts, held to it by the same cases.
 */
fun hoodMatches(name: String, query: String): Boolean {
    val words = hoodSearchKey(query).split(' ').filter { it.isNotEmpty() }
    if (words.isEmpty()) return true
    val parts = hoodSearchKey(name).split(' ').filter { it.isNotEmpty() }
    return words.all { w -> parts.any { it.startsWith(w) } }
}

/**
 * The names that match, in the order the whole list is in. **A filter narrows a list; it never re-ranks one**
 * (docs/13 honesty rule 1).
 */
fun filterHoods(list: List<Hood>, query: String): List<Hood> = hoodsAtoZ(list.filter { hoodMatches(it.name, query) })

/**
 * A to Z by the City's own name.
 *
 * **Never by a number** (docs/13 honesty rule 1: no league tables). This takes the names and nothing else, so it
 * has nothing to rank by even if somebody asked it to; `indexOrderNeverDependsOnANumber` in HoodsTest holds it
 * there. Ties fall back to the raw name so two names that fold the same still have one fixed order.
 */
fun hoodsAtoZ(list: List<Hood>): List<Hood> =
    list.sortedWith(compareBy({ foldHoodName(it.name) }, { it.name }))

/** The letter a name is filed under, or null for one that starts with a digit or a symbol (`hood.letter_other`). */
fun hoodLetter(h: Hood): Char? = hoodSearchKey(h.name).firstOrNull()?.takeIf { it in 'a'..'z' }?.uppercaseChar()

/** One heading of the A–Z list. The group with no letter is filed **last**, under "Other", never first. */
class HoodLetterGroup(val letter: Char?, val items: List<Hood>)

fun hoodsByLetter(list: List<Hood>): List<HoodLetterGroup> {
    val sorted = hoodsAtoZ(list)
    val letters = sorted.mapNotNull { hoodLetter(it) }.distinct().sorted()
    val groups = letters.map { l -> HoodLetterGroup(l, sorted.filter { hoodLetter(it) == l }) }
    val other = sorted.filter { hoodLetter(it) == null }
    return if (other.isEmpty()) groups else groups + HoodLetterGroup(null, other)
}

/**
 * One council district, alphabetical inside. The districts this list actually has, in number order, then the
 * neighborhoods with none listed.
 */
class HoodDistrictGroup(val district: Int?, val items: List<Hood>)

fun hoodsByDistrict(list: List<Hood>): List<HoodDistrictGroup> {
    val sorted = hoodsAtoZ(list)
    val districts = sorted.mapNotNull { it.district }.distinct().sorted()
    val groups = districts.map { d -> HoodDistrictGroup(d, sorted.filter { it.district == d }) }
    val none = sorted.filter { it.district == null }
    return if (none.isEmpty()) groups else groups + HoodDistrictGroup(null, none)
}

// ---- the numbers, in words -------------------------------------------------------------------------------------------

/**
 * Per 1,000 lots, or nothing at all.
 *
 * A base under 100 lots has no rate — docs/13 honesty rule 3, rates need a denominator we can defend, and a
 * hundredth of a neighborhood makes any count look enormous. The same conditions as `rate` in apps/web/src/hoods.ts.
 */
fun hoodRate(c: HoodCount?, parcels: Int?): Double? {
    val n = c?.value ?: return null
    if (parcels == null || parcels < 100) return null
    return n.toDouble() / parcels * 1000
}

// ---- every number written by hand ----------------------------------------------------------------------------------
//
// **No locale-dependent formatter anywhere below this line** (CI, 2026-09-22). `NumberFormat` and `String.format`
// answer differently on different JDKs, different ICU versions and different Android releases: a rate that reads
// "9.9" on a phone read "9,9" on a CI runner whose default locale was not English, and a test that passes on one
// machine and fails on another teaches nobody anything. The arithmetic here is the whole of it — a long, a
// remainder and a comma every three digits — so a number reads the same on a 2016 handset, on a reviewer's laptop
// and in CI.
//
// It is also the rule the four languages need. Every digit is Latin and the dollar sign leads the amount in all of
// them (DECISIONS 2026-09-20): a price is something a person may have to say out loud, write down, or type into a
// search, and Arabic's own currency format puts the sign at the far end ("85,000 US$") while Bengali shortens the
// word. This is the same decision `dollars` makes in apps/web/src/hoods.ts, taken once here rather than per
// language.

/** Digits with a comma every three, Latin, no matter the language. Negative numbers keep their sign. */
fun hoodDigits(n: Long): String {
    if (n < 0) return "-" + hoodDigits(-n)
    val plain = n.toString()
    val sb = StringBuilder(plain.length + plain.length / 3)
    for ((i, c) in plain.withIndex()) {
        if (i > 0 && (plain.length - i) % 3 == 0) sb.append(',')
        sb.append(c)
    }
    return sb.toString()
}

/**
 * `n` rounded to `places` decimals, on the **exact** value the Double holds, half away from zero.
 *
 * `BigDecimal(double)` is the exact binary value rather than the decimal somebody typed, which is what makes this
 * agree with JavaScript's `toFixed` to the digit: 9.95 is really 9.94999999999999928, so both write "9.9", while
 * `Math.round(9.95 * 10)` writes "10.0" because the multiplication rounds up to 99.5 on the way. The web, the
 * phone and CI all print the same number, and no locale is consulted at any point.
 */
private fun round(n: Double, places: Int): java.math.BigDecimal =
    java.math.BigDecimal(n).setScale(places, java.math.RoundingMode.HALF_UP)

private fun rounded(n: Double): Long = round(n, 0).toLong()

/** `n` to `places` decimals: 9.94 is "9.9", 9.96 is "10.0", 999.5 to no decimals is "1,000". */
fun hoodFixed(n: Double, places: Int): String {
    val value = round(n, places)
    if (places == 0) return hoodDigits(value.toLong())
    val plain = value.abs().toPlainString()
    val dot = plain.indexOf('.')
    val whole = if (dot < 0) plain else plain.substring(0, dot)
    val rest = if (dot < 0) "" else plain.substring(dot + 1)
    val sign = if (value.signum() < 0) "-" else ""
    return sign + hoodDigits(whole.toLong()) + "." + rest.padEnd(places, '0')
}

/** A rate as the page writes it: one decimal below ten, none at ten and above, so "0.8" and "14" both read. */
fun hoodRateText(r: Double): String = if (r < 10) hoodFixed(r, 1) else hoodFixed(r, 0)

/** "$85,000": the amount the sale record and the permit wrote, to the dollar. */
fun hoodMoney(n: Double): String = "$" + hoodDigits(rounded(n))

/**
 * "$107.8 million": a large amount in words a person can hold in their head, as the web's `bigMoney` writes it.
 *
 * The scale words are **English in every language**, which is a deliberate and stated exception, not an oversight:
 * the strings files carry no word for "thousand", "million" or "billion", and inventing four translations in code
 * would break the rule that no sentence in this app is built out of fragments. The web reaches the same English
 * for Arabic and Bengali by its own fallback and differs only in Spanish ("$107.8 millones"). Noted for a steward:
 * three string keys would close it.
 */
fun hoodBigMoney(n: Double): String {
    val words = listOf(1_000.0 to "thousand", 1_000_000.0 to "million", 1_000_000_000.0 to "billion")
    if (n < words[0].first) return hoodMoney(n)
    var at = 0
    while (at + 1 < words.size && n >= words[at + 1].first) at++
    var value = round(n / words[at].first, 1)
    // Rounded first, then the word is chosen again: $999,950,000 is "$1 billion", never "$1000 million".
    if (value.toDouble() >= 1000 && at + 1 < words.size) {
        at++
        value = round(n / words[at].first, 1)
    }
    val whole = value.toDouble() == Math.floor(value.toDouble())
    val written = if (whole) hoodDigits(value.toLong()) else hoodFixed(value.toDouble(), 1)
    return "$" + written + " " + words[at].second
}

/** A plain count. Latin digits, grouped with commas, in all four languages. */
fun hoodNumber(n: Int): String = hoodDigits(n.toLong())

fun hoodNumber(n: Double): String = hoodDigits(rounded(n))

/**
 * A count as a screen says it: the number, or "none recorded" for one the City never wrote down. The words come
 * from the strings files; nothing here is built out of English fragments.
 */
fun hoodCountText(c: HoodCount?, words: (String) -> String): String =
    if (c == null) words("hood.none_recorded") else hoodNumber(c.value)

/** The latest year with a number in any of the given fields: the year the "at a glance" row names. */
fun hoodLatestYear(h: Hood, d: Indicators, fields: List<(HoodYear) -> HoodCount?>): String? =
    d.years.reversed().firstOrNull { y -> fields.any { it(h.year(y)) != null } }

// ---- a year table ---------------------------------------------------------------------------------------------------

/**
 * One row of a year table: the year, this neighborhood's value, the whole city's, and the count beside it.
 *
 * [bar] is how long the bar is drawn, 0 to 1, against the biggest value in this table — a picture of the same number
 * that is already written next to it, never a colour that reads as a score and never a comparison with anywhere else.
 */
class HoodYearRow(
    val year: String,
    val soFar: Boolean,
    val value: Double?,
    val cityValue: Double?,
    val count: HoodCount?,
    val bar: Double,
)

/**
 * A whole table, worked out. The same shape as `yearsTable` in apps/web/src/hoods.ts: the years are the citywide
 * table's own, a year with no value shows the "missing" wording instead of a bar, and the partial year is labelled.
 */
fun hoodYearRows(
    h: Hood,
    d: Indicators,
    value: (HoodYear) -> Double?,
    cityValue: ((HoodYear) -> Double?)? = null,
    count: ((HoodYear) -> HoodCount?)? = null,
): List<HoodYearRow> {
    val years = d.years
    var max = 1.0
    for (y in years) value(h.year(y))?.let { if (it > max) max = it }
    return years.map { y ->
        val v = value(h.year(y))
        HoodYearRow(
            year = y,
            soFar = y.toIntOrNull() == d.partialYear,
            value = v,
            cityValue = (cityValue ?: value)(d.city[y] ?: HoodYear.EMPTY),
            count = count?.invoke(h.year(y)),
            bar = if (v == null) 0.0 else maxOf(0.03, minOf(1.0, v / max)),
        )
    }
}

// ---- what the page is made of ----------------------------------------------------------------------------------------

/**
 * SEMCOG asks for this sentence wherever their data is reproduced, and it is theirs, so it stays in their words: the
 * same English on an Arabic, Bengali or Spanish screen, marked as English for a screen reader, never machine
 * translated. Byte for byte the same string as `SEMCOG_NOTICE` in apps/web/src/hoods.ts, which ParityTest checks.
 */
const val SEMCOG_NOTICE = "Copyright © 2025 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."

/**
 * The panels of a neighborhood page, in the order they are drawn, by the string key of each heading.
 *
 * This is the order in apps/web/src/hoods.ts, and ParityTest reads that file and compares. It is here rather than in
 * the screen so that the order is a fact the JDK can check, not a shape a reviewer has to scroll through.
 */
val HOOD_PANELS: List<String> = listOf(
    "hood.help_head",
    "hood.money_head",
    "hood.cond_head",
    "hood.crash_head",
    "hood.sources_head",
)

/** The four kinds the "nearest listed" list names, in the order the web names them. */
val HOOD_NEAREST: List<String> = listOf("food", "clinic", "narcan", "indoors")

/**
 * The listing a "nearest listed" row opens, or null for a plain row that opens nothing.
 *
 * Four ways to get null, and each of them is the safe answer:
 *  - the bundle carries no `nearest_id` at all (an older one), or none for this kind;
 *  - the id names a listing this phone's copy of the list does not have;
 *  - the listing is **sensitive or private** — a domestic-violence or mental-health-crisis row. Those carry no
 *    coordinates and so can never be the nearest anything, but the rule is written here rather than relied upon,
 *    because a row of that kind must never appear on a public neighborhood page and must never carry a distance
 *    (docs/08, CLAUDE.md).
 */
fun hoodNearestListing(h: Hood, kind: String, lookup: (String) -> org.help313.query.BundleRow?): org.help313.query.BundleRow? {
    val id = h.help.nearestId[kind] ?: return null
    val row = lookup(id) ?: return null
    if (isSensitive(row.category) || isPrivate(row.category)) return null
    return row
}

/**
 * The sources listed at the foot of a page, in the web's order, leaving out the ones this bundle has none of. The
 * neighborhood layer itself comes last, because it is the geography rather than a number.
 */
fun hoodSourceOrder(d: Indicators): List<HoodSource> = listOf(
    "sales", "permits", "rentals", "blight", "demolitions", "issues", "fires", "vacant", "pavement",
    "parcels", "snap", "bus_stops", "crashes", "neighborhoods",
).mapNotNull { d.sources[it] }

/**
 * The category key a help count is labelled with. The bundle counts `shelter` as a top-level kind; the app's own
 * word for it is the emergency-shelter one, exactly as the web does it.
 */
fun hoodCategoryKey(category: String): String =
    "add.cat." + (if (category == "shelter") "shelter.emergency" else category)

// ---- a year panel drawn as a picture (docs/13, 2026-09-22) -----------------------------------------------------
//
// Kyle, 2026-09-22: "for the longitudinal data, we should give the user the option on page to switch between a
// table and chart view for relevant data" — and, later the same day, lines rather than bars, with "Homes sold" and
// "Building permits" on the SAME chart and selectable. And every number exact, later still ("I want exact
// numbers"; DECISIONS): there is no hidden count in the dataset any more, so there is no marker for one. This is
// the Kotlin half of `apps/web/src/hoodchart.ts` and of `HelpCore/HoodChart.swift`, ported case for case and held
// to the same numbers in HoodChartTest.
//
// The rules docs/13 sets, and how each one survives being drawn:
//
//  1. **No ranking, no comparison with another neighborhood.** A chart holds ONE neighborhood's own years: no
//     whole-city line, no trend line, no colour that means good or bad. The colours are identities, never a
//     scale, and there is ONE y-axis, never two — a series in a different UNIT (days to close) gets a chart of
//     its own.
//  2. **A year with nothing recorded is a break in the line, never a zero.**
//  3. **The table is the source of truth**, and stays on the screen for TalkBack either way (HoodScreens.kt).
//  4. **Three ways to tell lines apart, at once**: colour, point shape (circle, diamond, square) and line pattern
//     (solid, dashed, dash-dot). Never more than three series on one chart.

/** Which way a neighborhood's year panels are drawn. **Table is the default**, on every platform. */
enum class HoodViewChoice { TABLE, CHART }

/** Whatever was stored, read safely: only the exact word "chart" is chart; anything else is a table. */
fun hoodViewOf(stored: String?): HoodViewChoice = if (stored == "chart") HoodViewChoice.CHART else HoodViewChoice.TABLE

/** One year of one series, exactly as the bundle gives it: a number, or nothing recorded. */
class HoodChartPoint(val year: String, val count: HoodCount?, val soFar: Boolean = false)

/** Which identity a series wears: a colour, a marker shape and a line pattern, all three. At most three. */
enum class HoodTone { A, B, C }

/** What the numbers are: a count of things, or a number of days. A chart holds ONE unit (rule 1). */
enum class HoodUnit { COUNT, DAYS }

/** One series before it is measured against the others. [key] is what a checkbox switches. */
class HoodSeries(val key: String, val tone: HoodTone, val label: String, val points: List<HoodChartPoint>, val unit: HoodUnit = HoodUnit.COUNT)

enum class HoodPointKind { VALUE, NONE }

/** A year of a series, placed. [frac] is its height as a share of the top of the axis, 0 to 1. */
class HoodPlotPoint(
    val year: String,
    val index: Int,
    val soFar: Boolean,
    val kind: HoodPointKind,
    /** The number, when there is one to show. */
    val value: Int?,
    val frac: Double,
)

/** A piece of the line between two neighbouring years. */
class HoodSegment(val from: Int, val to: Int)

class HoodSeriesModel(
    val key: String,
    val tone: HoodTone,
    val label: String,
    val points: List<HoodPlotPoint>,
    val segments: List<HoodSegment>,
    /** The years with nothing recorded at all: a place on the axis, no marker, and a break in the line. */
    val blanks: List<String>,
    /** The tallest year, for the summary sentence; null when there is nothing to draw. */
    val peakYear: String?,
    val peakValue: Int?,
)

class HoodChartModel(
    val years: List<String>,
    val series: List<HoodSeriesModel>,
    /** The top of the axis: the first round number at or above the tallest value, never under 1. */
    val top: Int,
    /** 0, then every labelled value, ending at [top]. */
    val ticks: List<Int>,
    val unit: HoodUnit = HoodUnit.COUNT,
)

/** 1, 2, 5, 10, 20, 50, … — the only step sizes an axis may use, so a tick is always a round number. */
fun hoodAxisStep(max: Int): Int {
    var scale = 1
    repeat(12) {
        for (s in intArrayOf(1, 2, 5)) {
            val step = s * scale
            if ((max + step - 1) / step <= 4) return step
        }
        scale *= 10
    }
    return scale
}

/**
 * The whole picture, worked out from the rows — no pixels yet, so the same arithmetic runs in a JVM test and on a
 * phone. Only the series that are switched on are handed in, so the axis follows what is on the screen.
 */
fun hoodChartModel(series: List<HoodSeries>): HoodChartModel {
    val years = series.firstOrNull()?.points?.map { it.year } ?: emptyList()
    val max = series.flatMap { s -> s.points.mapNotNull { it.count?.value } }.maxOrNull() ?: 0
    val step = hoodAxisStep(maxOf(max, 1))
    val top = maxOf(1, ((max + step - 1) / step) * step)
    val ticks = ArrayList<Int>()
    var t = 0
    while (t <= top) { ticks.add(t); t += step }
    if (ticks.lastOrNull() != top) ticks.add(top)

    return HoodChartModel(
        years = years,
        top = top,
        ticks = ticks,
        unit = series.firstOrNull()?.unit ?: HoodUnit.COUNT,
        series = series.map { s ->
            val points = s.points.mapIndexed { index, p ->
                val n = p.count?.value
                if (n != null) HoodPlotPoint(p.year, index, p.soFar, HoodPointKind.VALUE, n, n.toDouble() / top)
                else HoodPlotPoint(p.year, index, p.soFar, HoodPointKind.NONE, null, 0.0)
            }
            // The line runs between two neighbouring years whenever both have a value. A year with nothing
            // recorded breaks it, because joining across one would draw a number nobody counted.
            val segments = ArrayList<HoodSegment>()
            for (i in 0 until maxOf(0, points.size - 1)) {
                if (points[i].kind == HoodPointKind.VALUE && points[i + 1].kind == HoodPointKind.VALUE) segments.add(HoodSegment(i, i + 1))
            }
            // The tallest year, and the EARLIEST of them when two are equal, so one bundle always names one year.
            var peak: HoodPlotPoint? = null
            for (p in points) if (p.kind == HoodPointKind.VALUE && (peak == null || p.value!! > peak.value!!)) peak = p
            HoodSeriesModel(
                key = s.key, tone = s.tone, label = s.label, points = points, segments = segments,
                blanks = points.filter { it.kind == HoodPointKind.NONE }.map { it.year },
                peakYear = peak?.year, peakValue = peak?.value,
            )
        },
    )
}

/**
 * Whether a series is worth offering a chart of at all: three years with a number in them. Two points is a line
 * between two dots, not a shape worth a control.
 */
fun hoodChartable(points: List<HoodChartPoint>): Boolean = points.count { it.count != null } >= 3

/** Whether a series has anything at all: one year with a number. Otherwise the panel says the City has not
 *  published it for this neighborhood, instead of a table of "none recorded". */
fun hoodAnyValue(points: List<HoodChartPoint>): Boolean = points.any { it.count != null }

/** A value in the chart's unit, as words: "14", or "12 days". */
fun hoodValueText(n: Int, unit: HoodUnit, words: (String, Map<String, String>) -> String): String =
    if (unit == HoodUnit.DAYS) words("hood.days", mapOf("n" to hoodNumber(n))) else hoodNumber(n)

/**
 * Which series are drawn, given what has been switched off. **Never nothing**: the last one left on cannot be
 * switched off, so the chart is never an empty pair of axes, and its control is disabled with a line saying why.
 */
fun hoodShownSeries(all: List<HoodSeries>, off: Set<String>): List<HoodSeries> {
    val on = all.filter { it.key !in off }
    return if (on.isEmpty()) all.take(1) else on
}

/**
 * Which years get a label under the axis: every one while they fit, then every other one once there are more than
 * six, so a year is never drawn over its neighbour at a large font scale.
 */
fun hoodAxisYears(years: List<String>): List<String> {
    if (years.size <= 6) return years
    // Counting back from the LAST year, not forward from the first: stepping forward and then adding the last as
    // well puts two labels side by side whenever the count is even, and "2025 2026" ran into each other at a font
    // scale of 2 (emulator, 2026-09-22). The first year comes back only when it is not next to the earliest kept.
    val keep = HashSet<Int>()
    var i = years.size - 1
    while (i >= 0) { keep.add(i); i -= 2 }
    if (!keep.contains(0) && (keep.minOrNull() ?: 0) >= 2) keep.add(0)
    return years.filterIndexed { index, _ -> keep.contains(index) }
}

/** One count of one neighborhood, year by year, in the order the table prints — the web's `seriesOf`. */
fun hoodChartSeries(h: Hood, d: Indicators, count: (HoodYear) -> HoodCount?): List<HoodChartPoint> =
    d.years.map { y -> HoodChartPoint(y, count(h.year(y)), y.toIntOrNull() == d.partialYear) }

/** The days to close, which the file carries as a decimal median, as a whole number of days. */
fun hoodDaysSeries(h: Hood, d: Indicators): List<HoodChartPoint> =
    d.years.map { y -> HoodChartPoint(y, h.year(y).issueDays?.let { HoodCount.of(rounded(it).toInt()) }, y.toIntOrNull() == d.partialYear) }

/**
 * The three crash series of one place, year by year (oldest first), from its `crashes_by_year`. Empty when the
 * bundle carries the window only. Walking / biking / badly hurt wear A / B / C.
 */
fun hoodCrashSeries(byYear: Map<String, HoodCrashes>, walk: String, bike: String, severe: String): List<HoodSeries> {
    if (byYear.isEmpty()) return emptyList()
    val years = byYear.keys.sorted()
    fun pts(pick: (HoodCrashes) -> HoodCount?) = years.map { HoodChartPoint(it, byYear[it]?.let(pick)) }
    return listOf(
        HoodSeries("walk", HoodTone.A, walk, pts { it.walk }),
        HoodSeries("bike", HoodTone.B, bike, pts { it.bike }),
        HoodSeries("severe", HoodTone.C, severe, pts { it.severe }),
    )
}

/**
 * What one point says on its own: "2023, Homes sold: 14", "2021, Time to close: 12 days". The sentences are the
 * app's own words, handed in.
 */
fun hoodPointText(p: HoodPlotPoint, label: String, words: (String, Map<String, String>) -> String, unit: HoodUnit = HoodUnit.COUNT): String {
    val year = if (p.soFar) words("hood.so_far", mapOf("year" to p.year)) else p.year
    val count = when (p.kind) {
        HoodPointKind.VALUE -> hoodValueText(p.value!!, unit, words)
        HoodPointKind.NONE -> words("hood.none_recorded", emptyMap())
    }
    return words("hood.chart_bar", mapOf("year" to year, "label" to label, "count" to count))
}

/**
 * The sentence under the picture: what is drawn, over which years, and the biggest year of each series. A fact
 * about this neighborhood's own years, never a trend: these numbers describe and do not explain (docs/13, rule 4).
 */
fun hoodChartSummary(m: HoodChartModel, words: (String, Map<String, String>) -> String): String {
    val most = m.series.joinToString(words("list.sep", emptyMap())) { s ->
        val year = s.peakYear
        val value = s.peakValue
        if (year == null || value == null) {
            words("hood.chart_peak_none", mapOf("label" to s.label))
        } else {
            words("hood.chart_peak", mapOf("label" to s.label, "count" to hoodValueText(value, m.unit, words), "year" to year))
        }
    }
    return words(
        "hood.chart_summary",
        mapOf("from" to (m.years.firstOrNull() ?: ""), "to" to (m.years.lastOrNull() ?: ""), "most" to most),
    )
}
