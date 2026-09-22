// "Type a cross street" — resolved ON THIS DEVICE, from the street geometry the signed bundle already carries
// (Kyle, 2026-09-22; DECISIONS 2026-09-22: the map opens on the person's location, then on an intersection they
// type, then on City Hall).
//
// Why this file exists at all. A person who will not — or cannot — share a location still has to be able to say
// where they are, and the only honest way to let them is to take the two street names in their head and turn them
// into a point without asking anybody else. Every line below runs on the phone, over `map/base.json` and
// `map/streets.json`, which are already in the app. **Nothing is sent, and the typed text is never stored**: it
// lives in one field on MainActivity for as long as the screen is open, exactly like the search box, and it never
// reaches a file, a report or the retained back stack (docs/08).
//
// This is a port, case for case, of apps/web/src/intersections.ts: the same suffix and direction tables, the same
// number words, the same separators, the same 120 m merge, the same six-choice cap and the same ordering. It has
// no `android.` import, so `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs every one of
// its cases on a plain JDK — which is what holds the three clients to one answer (IntersectionsTest.kt, and the
// web's own table in apps/web/test/behaviour.test.ts).
package org.help313.app

import kotlin.math.abs
import kotlin.math.hypot

/** One named piece of street geometry, in the map's own units (MapProjection). */
class NamedLine(val name: String, val points: DoubleArray) {
    val box: MapBox = MapBox.around(points)
}

/** A street name as this file compares them, and the half of town it named, if it named one. */
data class StreetName(val name: String, val dir: String)

object Intersections {

    // ---- names --------------------------------------------------------------------------------------------------
    // The City writes "Woodward Ave", "E Warren Ave", "W 7 Mile Rd"; a person types "woodward", "Warren", "seven
    // mile". Both sides go through [normStreet], which throws away everything that is not the name itself.

    /** Street-type words, long and short. A name is the same name with or without one on the end. */
    private val SUFFIXES = setOf(
        "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "hwy", "highway",
        "ln", "lane", "ct", "court", "pkwy", "parkway", "ter", "terrace", "pl", "place", "cir", "circle",
        "way", "trl", "trail",
    )

    /** "E", "West", "N." — the side of town, not the name. Kept as one letter so "E Warren" and "East Warren"
     *  are one street, and set aside when the other side names no direction at all. */
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

    /**
     * A street name as this file compares them: lower case, no accents, no punctuation, number words as digits, no
     * street-type word on the end, and any leading direction kept apart as a single letter.
     *
     * The direction is kept rather than thrown away, because Detroit really does have an East Warren and a West
     * Warren and they are different halves of one street: a person who types the half they mean should get it, and
     * a person who types neither should get both ([nameMatches]).
     */
    fun normStreet(raw: String?): StreetName {
        val flat = java.text.Normalizer.normalize(raw ?: "", java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .lowercase()
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
        return StreetName(words.joinToString(" "), dir)
    }

    /** Two names are the same street when the names match and neither side contradicts the other's direction. */
    fun nameMatches(typed: StreetName, known: StreetName): Boolean {
        if (typed.name != known.name) return false
        return typed.dir.isEmpty() || known.dir.isEmpty() || typed.dir == known.dir
    }

    // ---- what a person typed ------------------------------------------------------------------------------------

    /** The separators between two street names, in the words people actually use. */
    private val SPLIT = Regex("\\s+(?:and|at|&|@|x)\\s+|\\s*[/+]\\s*|\\s+&\\s+", RegexOption.IGNORE_CASE)

    /**
     * "Woodward and Warren", "Woodward & Warren", "Warren at Woodward", "Woodward/Warren" — or one street name on
     * its own. Returns the pieces exactly as typed; [normStreet] is what makes them comparable. `b` is empty for
     * one name.
     */
    fun parseCrossing(text: String?): Pair<String, String>? {
        val clean = (text ?: "").trim().replace(Regex("\\s+"), " ")
        if (clean.isEmpty()) return null
        val parts = clean.split(SPLIT).map { it.trim() }.filter { it.isNotEmpty() }
        if (parts.isEmpty()) return null
        if (parts.size == 1) return parts[0] to ""
        return parts[0] to parts[1]
    }

    // ---- the streets on this phone -------------------------------------------------------------------------------

    /** Every named piece of street geometry in the basemap: the city-wide roads, and the ones in the grid cells. */
    fun namedLines(map: BaseMap): List<NamedLine> {
        val out = ArrayList<NamedLine>()
        for (r in map.roads) if (r.name.isNotEmpty()) out.add(NamedLine(r.name, r.points))
        for (cell in map.cells) for (r in cell.roads) if (r.name.isNotEmpty()) out.add(NamedLine(r.name, r.points))
        return out
    }

    /** One street name, in one half of town, and every piece of it. */
    class StreetBucket(val dir: String, val lines: MutableList<NamedLine> = ArrayList())

    /**
     * Name -> every piece of that street. Built once per basemap and held by the map's own identity, so a new
     * bundle gets a new index: a few thousand short arrays on a cheap phone, and a person may type several guesses
     * in a row.
     */
    private val indexes = java.util.WeakHashMap<BaseMap, Map<String, List<StreetBucket>>>()

    fun streetIndex(map: BaseMap): Map<String, List<StreetBucket>> {
        indexes[map]?.let { return it }
        val byName = HashMap<String, MutableList<StreetBucket>>()
        for (l in namedLines(map)) {
            val n = normStreet(l.name)
            if (n.name.isEmpty()) continue
            val bucket = byName.getOrPut(n.name) { ArrayList() }
            val slot = bucket.firstOrNull { it.dir == n.dir } ?: StreetBucket(n.dir).also { bucket.add(it) }
            slot.lines.add(l)
        }
        val built: Map<String, List<StreetBucket>> = byName
        indexes[map] = built
        return built
    }

    /** Every piece of the street a person means, or an empty list. */
    fun linesFor(index: Map<String, List<StreetBucket>>, typed: String): List<NamedLine> {
        val n = normStreet(typed)
        if (n.name.isEmpty()) return emptyList()
        val bucket = index[n.name] ?: return emptyList()
        return bucket.filter { nameMatches(n, StreetName(n.name, it.dir)) }.flatMap { it.lines }
    }

    // ---- where two streets cross ---------------------------------------------------------------------------------

    /**
     * Where two straight pieces cross, or null. Plain segment intersection: no touching-at-a-shared-end special
     * case, because two City road records that share an end really do meet there.
     */
    fun segmentCross(
        ax: Double, ay: Double, bx: Double, by: Double,
        cx: Double, cy: Double, dx: Double, dy: Double,
    ): DoubleArray? {
        val rx = bx - ax
        val ry = by - ay
        val sx = dx - cx
        val sy = dy - cy
        val den = rx * sy - ry * sx
        if (den == 0.0) return null // parallel, or a piece of no length
        val t = ((cx - ax) * sy - (cy - ay) * sx) / den
        val u = ((cx - ax) * ry - (cy - ay) * rx) / den
        if (t < 0 || t > 1 || u < 0 || u > 1) return null
        return doubleArrayOf(ax + t * rx, ay + t * ry)
    }

    /**
     * Two crossings closer together than this are the same junction drawn twice (a boulevard's two carriageways, a
     * record split at a city line). 120 m is wider than any Detroit intersection and narrower than a block.
     */
    const val SAME_JUNCTION_M = 120.0

    /** At most this many choices are offered: a pair with more crossings than this is a service drive, and a list
     *  nobody can read is not a choice. */
    const val MAX_CHOICES = 6

    private fun overlaps(p: MapBox, q: MapBox, pad: Double): Boolean =
        p.minX - pad <= q.maxX && p.maxX + pad >= q.minX && p.minY - pad <= q.maxY && p.maxY + pad >= q.minY

    /**
     * Every place two streets cross, merged, north to south then west to east — so one bundle always offers the
     * same list in the same order. Map units in, lat/lon out.
     */
    fun crossingsOf(a: List<NamedLine>, b: List<NamedLine>): List<LatLonPoint> {
        // One unit of the projection is one degree of latitude (MapProjection.METERS_PER_UNIT).
        val pad = SAME_JUNCTION_M / MapProjection.METERS_PER_UNIT
        val hits = ArrayList<DoubleArray>()
        for (la in a) {
            for (lb in b) {
                if (!overlaps(la.box, lb.box, pad)) continue
                var i = 0
                while (i + 3 < la.points.size) {
                    var k = 0
                    while (k + 3 < lb.points.size) {
                        val p = segmentCross(
                            la.points[i], la.points[i + 1], la.points[i + 2], la.points[i + 3],
                            lb.points[k], lb.points[k + 1], lb.points[k + 2], lb.points[k + 3],
                        )
                        if (p != null) hits.add(p)
                        k += 2
                    }
                    i += 2
                }
            }
        }
        // A junction is one answer however many road records meet in it.
        val merged = ArrayList<DoubleArray>()
        for (p in hits) if (merged.none { hypot(it[0] - p[0], it[1] - p[1]) < pad }) merged.add(p)
        // y grows southwards in this projection, so ascending y is north to south.
        merged.sortWith(compareBy({ it[1] }, { it[0] }))
        return merged.map { LatLonPoint(MapProjection.lat(it[1]), MapProjection.lon(it[0])) }
    }

    /** The middle of the longest piece of one street: an honest answer to one name, and the screen says so. */
    fun midpointOf(lines: List<NamedLine>): LatLonPoint? {
        var bestLen = -1.0
        var bx = 0.0
        var by = 0.0
        for (l in lines) {
            var len = 0.0
            var i = 0
            while (i + 3 < l.points.size) {
                len += hypot(l.points[i + 2] - l.points[i], l.points[i + 3] - l.points[i + 1])
                i += 2
            }
            if (bestLen >= 0 && len <= bestLen) continue
            if (l.points.size < 2) continue
            // Halfway ALONG the street, not the middle of its box: a street that bends would otherwise be answered
            // with a point that is not on it.
            var run = 0.0
            var x = l.points[0]
            var y = l.points[1]
            i = 0
            while (i + 3 < l.points.size) {
                val d = hypot(l.points[i + 2] - l.points[i], l.points[i + 3] - l.points[i + 1])
                if (run + d >= len / 2) {
                    val f = if (d == 0.0) 0.0 else (len / 2 - run) / d
                    x = l.points[i] + (l.points[i + 2] - l.points[i]) * f
                    y = l.points[i + 1] + (l.points[i + 3] - l.points[i + 1]) * f
                    break
                }
                run += d
                x = l.points[i + 2]
                y = l.points[i + 3]
                i += 2
            }
            bestLen = len
            bx = x
            by = y
        }
        return if (bestLen < 0) null else LatLonPoint(MapProjection.lat(by), MapProjection.lon(bx))
    }

    /**
     * Which end of the street one of several crossings is at: "Woodward & 7 Mile — north / south". The axis is
     * whichever way the answers are actually spread, so two crossings of an east-west pair read east and west.
     */
    fun whereWords(points: List<LatLonPoint>): List<String> {
        if (points.size < 2) return points.map { "" }
        val latMax = points.maxOf { it.lat }
        val latMin = points.minOf { it.lat }
        val lonMax = points.maxOf { it.lon }
        val lonMin = points.minOf { it.lon }
        val byLat = (latMax - latMin) >= (lonMax - lonMin) * 0.74
        val mid = if (byLat) (latMax + latMin) / 2 else (lonMax + lonMin) / 2
        return points.map {
            if (byLat) (if (it.lat >= mid) "north" else "south") else (if (it.lon >= mid) "east" else "west")
        }
    }

    // ---- the answer ------------------------------------------------------------------------------------------------

    /**
     * The cache is keyed by the NORMALISED names, so it holds no more of what a person typed than
     * "woodward|warren" — and it is a plain map in this object, which dies with the process, never a file.
     */
    private val cache = LinkedHashMap<String, CrossOutcome>()

    /**
     * What "Woodward and Warren" means on this phone. Null only when nothing was typed at all.
     *
     * The five answers are the web's five, in the same order of preference: a name we do not have, one street on
     * its own, two streets that never meet, one junction, or a short list.
     */
    fun resolve(map: BaseMap, text: String?): CrossOutcome? {
        val parsed = parseCrossing(text) ?: return null
        val na = normStreet(parsed.first)
        val nb = normStreet(parsed.second)
        val key = "${na.dir}:${na.name}|${nb.dir}:${nb.name}"
        cache[key]?.let { return it }
        val index = streetIndex(map)
        val out: CrossOutcome = run {
            val a = linesFor(index, parsed.first)
            if (a.isEmpty()) return@run CrossOutcome.Unknown(parsed.first)
            if (parsed.second.isEmpty()) {
                val p = midpointOf(a)
                return@run if (p == null) CrossOutcome.Unknown(parsed.first) else CrossOutcome.Street(p, parsed.first)
            }
            val b = linesFor(index, parsed.second)
            if (b.isEmpty()) return@run CrossOutcome.Unknown(parsed.second)
            val hits = crossingsOf(a, b)
            if (hits.isEmpty()) return@run CrossOutcome.NoCrossing(parsed.first, parsed.second)
            if (hits.size == 1) return@run CrossOutcome.Point(hits[0], parsed.first, parsed.second)
            val kept = hits.take(MAX_CHOICES)
            val words = whereWords(kept)
            CrossOutcome.Choices(
                parsed.first, parsed.second,
                kept.mapIndexed { i, p -> CrossChoice(p, words.getOrElse(i) { "" }) },
            )
        }
        // Bounded, so a person typing guess after guess cannot grow it without end.
        if (cache.size >= 64) cache.remove(cache.keys.first())
        cache[key] = out
        return out
    }

    /** For the tests, and for a new bundle: crossings held from the old streets mean nothing about the new ones. */
    fun forget() {
        cache.clear()
        indexes.clear()
    }

    /** Unused by the screens; here so a caller need not know which file the projection lives in. */
    fun toWorld(p: LatLonPoint): DoubleArray = doubleArrayOf(MapProjection.x(p.lon), MapProjection.y(p.lat))

    /** Distance in metres, for the tests' real spot checks. Flat, like everything else around Detroit. */
    fun metersApart(a: LatLonPoint, b: LatLonPoint): Double = hypot(
        (a.lat - b.lat) * MapProjection.METERS_PER_UNIT,
        (a.lon - b.lon) * MapProjection.METERS_PER_UNIT * MapProjection.K,
    ).let { abs(it) }
}

/** A plain lat/lon, kept out of `org.help313.query.LatLon` so this file stands on its own. */
data class LatLonPoint(val lat: Double, val lon: Double)

/** One of several junctions, with the end of the street it is at ("north", "south", "east", "west", or ""). */
class CrossChoice(val point: LatLonPoint, val where: String)

/** What a typed cross street came to. */
sealed class CrossOutcome {
    /** One junction: the map goes there. */
    class Point(val point: LatLonPoint, val a: String, val b: String) : CrossOutcome()

    /** Two streets that cross more than once: a short list to pick from, each with the end it is at. */
    class Choices(val a: String, val b: String, val choices: List<CrossChoice>) : CrossOutcome()

    /** One street name: the middle of it, and a note saying that is what this is. */
    class Street(val point: LatLonPoint, val a: String) : CrossOutcome()

    /** Two streets we know that never meet. */
    class NoCrossing(val a: String, val b: String) : CrossOutcome()

    /** A name the bundle's streets do not carry. [unknown] names the first one we could not find. */
    class Unknown(val unknown: String) : CrossOutcome()
}
