// "Type a cross street" — resolved ON THIS PHONE, from the street geometry the signed bundle already carries.
// The Kotlin copy of apps/web/src/intersections.ts (Kyle, 2026-09-22).
//
// Why this exists at all. A person who will not — or cannot — share a location still has to be able to say where
// they are, and the only honest way to let them is to take the two street names in their head and turn them into
// a point without asking anybody else. Every line below runs on the phone, over `map/base.json` and
// `map/streets.json`, which the Map tab has already downloaded and checked against the signed index. **Nothing is
// sent, and the typed text is never stored**: it lives in one field on the Directions screen for as long as that
// screen is open, exactly like the search box, and it never reaches a file, a link or a report (docs/08).
//
// No android.* class here, so `:core` holds it to the same table of cases the web is held to.
package org.help313.app

import org.help313.query.LatLon
import java.util.Locale
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

// ---- names ---------------------------------------------------------------------------------------------------
// The City writes "Woodward Ave", "E Warren Ave", "W 7 Mile Rd"; a person types "woodward", "Warren", "seven
// mile". Both sides go through [normStreet], which throws away everything that is not the name itself.

/** Street-type words, long and short. A name is the same name with or without one on the end. */
private val SUFFIXES = setOf(
    "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "hwy", "highway",
    "ln", "lane", "ct", "court", "pkwy", "parkway", "ter", "terrace", "pl", "place", "cir", "circle",
    "way", "trl", "trail",
)

/** "E", "West", "N.", "southbound" — the side of town, not the name. Kept as one letter so "E Warren" and
 *  "East Warren" are one street, and dropped when the other side has no direction at all. */
private val DIRECTIONS = mapOf(
    "e" to "e", "east" to "e", "w" to "w", "west" to "w", "n" to "n", "north" to "n", "s" to "s", "south" to "s",
    "ne" to "ne", "northeast" to "ne", "nw" to "nw", "northwest" to "nw",
    "se" to "se", "southeast" to "se", "sw" to "sw", "southwest" to "sw",
)

/** "Seven Mile" is "7 Mile" on every sign in the city, and a person may type either. */
private val NUMBER_WORDS = mapOf(
    "one" to "1", "two" to "2", "three" to "3", "four" to "4", "five" to "5",
    "six" to "6", "seven" to "7", "eight" to "8", "nine" to "9", "ten" to "10",
    "first" to "1", "second" to "2", "third" to "3", "fourth" to "4", "fifth" to "5",
    "sixth" to "6", "seventh" to "7", "eighth" to "8", "ninth" to "9", "tenth" to "10",
)

class StreetName(val name: String, val dir: String)

/**
 * A street name as this file compares them: lower case, no accents, no punctuation, number words as digits, no
 * street-type word on the end, and any leading direction kept as a single letter in [StreetName.dir].
 *
 * The direction is kept apart rather than thrown away, because Detroit really does have an East Warren and a West
 * Warren and they are different halves of one street: a person who types the half they mean should get it, and a
 * person who types neither should get both ([nameMatches]).
 */
fun normStreet(raw: String?): StreetName {
    val flat = java.text.Normalizer.normalize(raw ?: "", java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase(Locale.ROOT)
        .replace(Regex("['’.]"), "")
        .replace(Regex("[^a-z0-9]+"), " ")
        .trim()
    var words = flat.split(" ").filter { it.isNotEmpty() }.map { NUMBER_WORDS[it] ?: it }
    var dir = ""
    if (words.size > 1 && DIRECTIONS.containsKey(words[0])) {
        dir = DIRECTIONS.getValue(words[0])
        words = words.drop(1)
    }
    // A street-type word only ever comes off the END, and never when it is the whole name ("Way", "Circle").
    while (words.size > 1 && SUFFIXES.contains(words[words.size - 1])) words = words.dropLast(1)
    // "Service Drive" is a kind of road, not Woodward: "M-1 Service Drive" keeps its own name.
    return StreetName(words.joinToString(" "), dir)
}

/** Two names are the same street when the names match and neither side contradicts the other's direction. */
fun nameMatches(typed: StreetName, known: StreetName): Boolean {
    if (typed.name != known.name) return false
    return typed.dir.isEmpty() || known.dir.isEmpty() || typed.dir == known.dir
}

// ---- what a person typed ----------------------------------------------------------------------------------------

/** The separators between two street names, in the words people actually use. */
private val SPLIT = Regex("\\s+(?:and|at|&|@|x)\\s+|\\s*[/+]\\s*", RegexOption.IGNORE_CASE)

class TypedCrossing(val a: String, val b: String)

/**
 * "Woodward and Warren", "Woodward & Warren", "Warren at Woodward", "Woodward/Warren" — or one street name on its
 * own. Returns the pieces exactly as typed; [normStreet] is what makes them comparable.
 */
fun parseCrossing(text: String?): TypedCrossing? {
    val clean = (text ?: "").trim().replace(Regex("\\s+"), " ")
    if (clean.isEmpty()) return null
    val parts = clean.split(SPLIT).map { it.trim() }.filter { it.isNotEmpty() }
    if (parts.isEmpty()) return null
    if (parts.size == 1) return TypedCrossing(parts[0], "")
    return TypedCrossing(parts[0], parts[1])
}

// ---- the streets on this phone -----------------------------------------------------------------------------------

/** One named piece of street geometry, in the map's own world coordinates ([MapProjection]). */
class NamedLine(val name: String, val pts: DoubleArray, val box: MapBox)

/** Every named piece of street geometry in the basemap: the city-wide roads, and the ones in the grid cells. */
fun namedLines(map: BaseMap): List<NamedLine> {
    val out = ArrayList<NamedLine>()
    for (r in map.roads) if (r.name.isNotEmpty()) out.add(NamedLine(r.name, r.points, r.box))
    for (cell in map.cells) for (r in cell.roads) if (r.name.isNotEmpty()) out.add(NamedLine(r.name, r.points, r.box))
    return out
}

/**
 * Name -> every piece of that street. Built once per basemap: 205 neighbourhoods' worth of streets on a cheap
 * phone is a few thousand short arrays, and a person may type several guesses in a row.
 */
class StreetIndex(map: BaseMap) {
    private class Bucket(val dir: String) { val lines = ArrayList<NamedLine>() }

    private val byName = HashMap<String, ArrayList<Bucket>>()

    init {
        for (l in namedLines(map)) {
            val n = normStreet(l.name)
            if (n.name.isEmpty()) continue
            val bucket = byName.getOrPut(n.name) { ArrayList() }
            (bucket.firstOrNull { it.dir == n.dir } ?: Bucket(n.dir).also { bucket.add(it) }).lines.add(l)
        }
    }

    /** Every piece of the street a person means, or an empty list. */
    fun linesFor(typed: String): List<NamedLine> {
        val n = normStreet(typed)
        if (n.name.isEmpty()) return emptyList()
        val bucket = byName[n.name] ?: return emptyList()
        return bucket.filter { nameMatches(n, StreetName(n.name, it.dir)) }.flatMap { it.lines }
    }
}

// ---- where two streets cross -----------------------------------------------------------------------------------

/** One degree of latitude, in metres: what one unit of the world coordinates is. */
private const val M_PER_UNIT = 111320.0

/** Two crossings closer together than this are the same junction drawn twice (a boulevard's two carriageways, a
 *  record split at a city line). 120 m is wider than any Detroit intersection and narrower than a block. */
const val SAME_JUNCTION_M = 120.0

/** At most this many choices are offered: a street pair with more crossings than this is a service drive, and a
 *  list nobody can read is not a choice. */
const val MAX_CHOICES = 6

/** Where two straight pieces cross, or null. Plain segment intersection: no touching-at-a-shared-end special case,
 *  because two City road records that share an end really do meet there. */
fun segmentCross(
    ax: Double, ay: Double, bx: Double, by: Double,
    cx: Double, cy: Double, dx: Double, dy: Double,
): DoubleArray? {
    val rx = bx - ax
    val ry = by - ay
    val sx = dx - cx
    val sy = dy - cy
    val den = rx * sy - ry * sx
    if (den == 0.0) return null                            // parallel, or a piece of no length
    val t = ((cx - ax) * sy - (cy - ay) * sx) / den
    val u = ((cx - ax) * ry - (cy - ay) * rx) / den
    if (t < 0 || t > 1 || u < 0 || u > 1) return null
    return doubleArrayOf(ax + t * rx, ay + t * ry)
}

private fun overlaps(p: MapBox, q: MapBox, pad: Double): Boolean =
    p.minX - pad <= q.maxX && p.maxX + pad >= q.minX && p.minY - pad <= q.maxY && p.maxY + pad >= q.minY

/** Every place two streets cross, already merged. World coordinates in, lat/lon out. */
fun crossingsOf(a: List<NamedLine>, b: List<NamedLine>): List<LatLon> {
    val pad = SAME_JUNCTION_M / M_PER_UNIT
    val hits = ArrayList<DoubleArray>()
    for (la in a) {
        for (lb in b) {
            if (!overlaps(la.box, lb.box, pad)) continue
            var i = 0
            while (i + 3 < la.pts.size) {
                var k = 0
                while (k + 3 < lb.pts.size) {
                    val p = segmentCross(
                        la.pts[i], la.pts[i + 1], la.pts[i + 2], la.pts[i + 3],
                        lb.pts[k], lb.pts[k + 1], lb.pts[k + 2], lb.pts[k + 3],
                    )
                    if (p != null) hits.add(p)
                    k += 2
                }
                i += 2
            }
        }
    }
    // Merge: a junction is one answer however many road records meet in it.
    val merged = ArrayList<DoubleArray>()
    for (p in hits) if (merged.none { hypot(it[0] - p[0], it[1] - p[1]) < pad }) merged.add(p)
    // North to south, then west to east: the same bundle always offers the same list in the same order.
    merged.sortWith(compareBy({ it[1] }, { it[0] }))
    return merged.map { LatLon(MapProjection.lat(it[1]), MapProjection.lon(it[0])) }
}

/** The middle of the longest piece of one street: an honest answer to one name, and the screen says so. */
fun midpointOf(lines: List<NamedLine>): LatLon? {
    var bestLen = -1.0
    var bx = 0.0
    var by = 0.0
    for (l in lines) {
        var len = 0.0
        var i = 0
        while (i + 3 < l.pts.size) {
            len += hypot(l.pts[i + 2] - l.pts[i], l.pts[i + 3] - l.pts[i + 1])
            i += 2
        }
        if (bestLen >= 0 && len <= bestLen) continue
        // Halfway ALONG the street, not the middle of its box: a street that bends would otherwise be answered
        // with a point that is not on it.
        if (l.pts.size < 2) continue
        var run = 0.0
        var x = l.pts[0]
        var y = l.pts[1]
        i = 0
        while (i + 3 < l.pts.size) {
            val d = hypot(l.pts[i + 2] - l.pts[i], l.pts[i + 3] - l.pts[i + 1])
            if (run + d >= len / 2) {
                val f = if (d != 0.0) (len / 2 - run) / d else 0.0
                x = l.pts[i] + (l.pts[i + 2] - l.pts[i]) * f
                y = l.pts[i + 1] + (l.pts[i + 3] - l.pts[i + 1]) * f
                break
            }
            run += d
            x = l.pts[i + 2]
            y = l.pts[i + 3]
            i += 2
        }
        bestLen = len
        bx = x
        by = y
    }
    return if (bestLen < 0) null else LatLon(MapProjection.lat(by), MapProjection.lon(bx))
}

/**
 * Which end of the street one of several crossings is at: "Woodward & 7 Mile — north / south". The axis is
 * whichever way the answers are actually spread, so two crossings of an east-west pair read east and west.
 *
 * The words are the string keys' own suffixes (`loc.where_north`), not sentences: the screen translates them.
 */
fun whereWords(points: List<LatLon>): List<String> {
    if (points.size < 2) return points.map { "" }
    var loLat = Double.POSITIVE_INFINITY
    var hiLat = Double.NEGATIVE_INFINITY
    var loLon = Double.POSITIVE_INFINITY
    var hiLon = Double.NEGATIVE_INFINITY
    for (p in points) {
        loLat = min(loLat, p.lat); hiLat = max(hiLat, p.lat)
        loLon = min(loLon, p.lon); hiLon = max(hiLon, p.lon)
    }
    val spanLat = hiLat - loLat
    val spanLon = (hiLon - loLon) * 0.74
    val byLat = spanLat >= spanLon
    val mid = if (byLat) (hiLat + loLat) / 2 else (hiLon + loLon) / 2
    return points.map {
        if (byLat) (if (it.lat >= mid) "north" else "south") else (if (it.lon >= mid) "east" else "west")
    }
}

/** One of several junctions of the same pair, and the end of the street it is at. */
class CrossChoice(val point: LatLon, val where: String)

sealed class CrossOutcome {
    /** One junction: the trip starts there. */
    class Point(val point: LatLon, val a: String, val b: String) : CrossOutcome()

    /** Two streets that cross more than once: a short list to pick from, each with the end it is at. */
    class Choices(val a: String, val b: String, val choices: List<CrossChoice>) : CrossOutcome()

    /** One street name: the middle of it, and a note saying that is what this is. */
    class Street(val point: LatLon, val a: String) : CrossOutcome()

    /** Two streets we know that never meet. */
    class NoCrossing(val a: String, val b: String) : CrossOutcome()

    /** A name the bundle's streets do not carry. [unknown] names the first one we could not find. */
    class Unknown(val unknown: String) : CrossOutcome()
}

/**
 * What this phone makes of what a person typed, or null when they typed nothing at all.
 *
 * The cache is keyed by the NORMALISED names, so it holds no more of what a person typed than "woodward|warren" —
 * and it is a field in this process, cleared with [forgetCrossings] when a new bundle arrives. Never a file.
 */
object Crossings {

    private var indexFor: BaseMap? = null
    private var index: StreetIndex? = null
    private val cache = HashMap<String, CrossOutcome>()

    @Synchronized
    fun forget() {
        indexFor = null
        index = null
        cache.clear()
    }

    @Synchronized
    private fun indexOf(map: BaseMap): StreetIndex {
        if (indexFor !== map || index == null) {
            indexFor = map
            index = StreetIndex(map)
            cache.clear()
        }
        return index!!
    }

    @Synchronized
    fun resolve(map: BaseMap, text: String?): CrossOutcome? {
        val parsed = parseCrossing(text) ?: return null
        val na = normStreet(parsed.a)
        val nb = normStreet(parsed.b)
        val key = "${na.dir}:${na.name}|${nb.dir}:${nb.name}"
        cache[key]?.let { return it }
        val idx = indexOf(map)
        val out = resolveWith(idx, parsed)
        cache[key] = out
        return out
    }

    private fun resolveWith(idx: StreetIndex, parsed: TypedCrossing): CrossOutcome {
        val a = idx.linesFor(parsed.a)
        if (a.isEmpty()) return CrossOutcome.Unknown(parsed.a)
        if (parsed.b.isEmpty()) {
            val p = midpointOf(a)
            return if (p != null) CrossOutcome.Street(p, parsed.a) else CrossOutcome.Unknown(parsed.a)
        }
        val b = idx.linesFor(parsed.b)
        if (b.isEmpty()) return CrossOutcome.Unknown(parsed.b)
        val hits = crossingsOf(a, b)
        if (hits.isEmpty()) return CrossOutcome.NoCrossing(parsed.a, parsed.b)
        if (hits.size == 1) return CrossOutcome.Point(hits[0], parsed.a, parsed.b)
        val kept = hits.take(MAX_CHOICES)
        val words = whereWords(kept)
        return CrossOutcome.Choices(parsed.a, parsed.b, kept.mapIndexed { i, p -> CrossChoice(p, words.getOrElse(i) { "" }) })
    }
}

/** For the tests and for a new bundle: the crossings held from the old one mean nothing about the new streets. */
fun forgetCrossings() = Crossings.forget()
