// The words for a trip plan, and the shape of the picture beside them. The Kotlin copy of
// apps/web/src/dirwords.ts and of the overlay `mapRoute` in apps/web/src/dirscreen.ts, line for line.
//
// No android.* class in this file, so `:core` compiles it and CI runs its table on a plain JDK. That is the
// point: the wording rules of schema/query-spec.md "Trip plans" are the part of Directions where a mistake is
// worst, and a rule that lives in a screen is a rule nothing CI runs will ever check.
//
// Three rules from DECISIONS 2026-09-22 are enforced HERE, not in the screen:
//  * the estimate is always a RANGE, from `Itinerary.range` (`minutesRange` in :query) — never a single number,
//    never a clock time, never an arrival time;
//  * a headway may only be read out as the agency's own sentence ("about every 15 min"), and only when the
//    agency published one. `waitMinutes` is our assumption and is never shown;
//  * no sentence here says safe, accessible, lit or step-free, and none may ever be added.
//
// The last walking leg ends at the street, so the last sentence is "Then about 40 m to the building"
// (`endOffMetres`). We route to the street outside, not to the door.
package org.help313.app

import org.help313.query.Itinerary
import org.help313.query.LatLon
import org.help313.query.PlanLeg
import org.help313.query.RideLeg
import org.help313.query.WalkLeg
import java.util.Locale
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/** The app's own `t`, passed in so this file knows nothing about `L`, the assets, or Android. */
typealias Say = (String, Map<String, String>) -> String

const val METRES_PER_MILE = 1609.344

/**
 * Every number in a directions sentence is formatted with [Locale.US], in all four languages, and that is
 * deliberate rather than an oversight. Arabic and Bengali ask this app for Western digits (`-u-nu-latn`, L.locale)
 * so a distance reads as it is signposted, Spanish-US writes `0.3` as the web does, and `String.format` with a
 * fixed locale is the one way to be sure a decimal point never becomes a comma in a sentence the tests pin.
 */
private val NUM: Locale = Locale.US

fun isRide(l: PlanLeg): Boolean = l is RideLeg
fun isWalk(l: PlanLeg): Boolean = l is WalkLeg

/** What a bus is called on screen: the short name a rider reads off the front of it, then the long one, then the
 *  id. Never invented, and never translated: it is the agency's own name for the route. */
fun routeName(l: RideLeg): String = l.routeShort.ifEmpty { l.routeLong.ifEmpty { l.routeId } }

/** Where the route is headed, as the agency writes it — only when it says something the short name does not. */
fun towardName(l: RideLeg): String = if (l.routeLong.isNotEmpty() && l.routeLong != l.routeShort) l.routeLong else ""

/**
 * A walking distance, in miles to one decimal. Never zero: a leg that rounds to 0.0 mi is still a walk somebody
 * has to do, and "0.0 mi" reads as "no distance at all". The floor is a tenth of a mile.
 */
fun dirDistance(t: Say, metres: Double): String {
    val mi = metres / METRES_PER_MILE
    return t("dir.dist_mi", mapOf("miles" to String.format(NUM, "%.1f", if (mi < 0.05) 0.1 else mi)))
}

/** The one distance that is NOT in miles: how far the street is from the door (`endOffMetres`). Metres, rounded
 *  to the metre, because that is the number the spec says a person is told. */
fun dirOffStreet(t: Say, metres: Double): String =
    t("dir.dist_m", mapOf("metres" to metres.roundToLong().toString()))

/** "Walk", "Bus 4", "Bus 4, then bus 16". One line, and the only place a route is named in a card's heading. */
fun itineraryTitle(t: Say, it: Itinerary): String {
    val rides = it.legs.filterIsInstance<RideLeg>()
    if (rides.isEmpty()) return t("dir.walk_card", emptyMap())
    if (rides.size == 1) return t("dir.bus_card", mapOf("route" to routeName(rides[0])))
    return t("dir.bus_card_two", mapOf("a" to routeName(rides[0]), "b" to routeName(rides[1])))
}

/** "walk 0.3 mi, ride 9 stops, walk 0.1 mi" — the shape of the trip, leg by leg, in the order it is walked. */
fun legsLine(t: Say, it: Itinerary): String = it.legs.joinToString(t("list.sep", emptyMap())) { l ->
    when {
        l is WalkLeg -> t("dir.leg_walk", mapOf("distance" to dirDistance(t, l.metres)))
        (l as RideLeg).stops == 1 -> t("dir.leg_ride_one", emptyMap())
        else -> t("dir.leg_ride", mapOf("stops" to l.stops.toString()))
    }
}

/** "about 25–40 min". ALWAYS a range: `Itinerary.range` is the only number this file will read for a duration. */
fun rangeWords(t: Say, it: Itinerary): String =
    t("dir.range", mapOf("lo" to it.range[0].toString(), "hi" to it.range[1].toString()))

/**
 * "about every 15 min", or nothing at all. The agency's own published headway on the first ride, and only when it
 * is a number — a route that publishes none says nothing, rather than our assumed wait dressed up as a fact.
 */
fun headwayWords(t: Say, it: Itinerary): String {
    val first = it.legs.filterIsInstance<RideLeg>().firstOrNull()
    val h = first?.headwayMinutes ?: return ""
    if (h <= 0) return ""
    return t("dir.every", mapOf("minutes" to minutesWord(h)))
}

/** A headway is a whole number of minutes on every screen: "about every 15 min", never "every 15.0 min". */
private fun minutesWord(m: Double): String = m.roundToLong().toString()

/**
 * The headway a CARD says: the first ride of the trip that publishes one, which is not always the first ride.
 * [headwayWords] is the summary's rule and reads only the first ride, exactly as the web does in each place.
 */
fun cardHeadway(t: Say, it: Itinerary): String {
    val ride = it.legs.filterIsInstance<RideLeg>().firstOrNull { (it.headwayMinutes ?: 0.0) > 0 } ?: return ""
    return t("dir.every", mapOf("minutes" to minutesWord(ride.headwayMinutes!!)))
}

/** The whole card in one sentence: what a button is named, and what TalkBack is told. */
fun dirSummary(t: Say, it: Itinerary): String =
    listOf(itineraryTitle(t, it), legsLine(t, it), rangeWords(t, it), headwayWords(t, it))
        .filter { it.isNotEmpty() }.joinToString(" · ")

/** One numbered step: a sentence, and which leg of the plan it belongs to (the map highlights that leg). */
class DirStep(val text: String, val leg: Int)

/**
 * The numbered list, which is the source of truth for the whole screen (the map is the extra).
 *
 * Every sentence is built from the structured facts `:query` hands over — a street name, a compass word, a turn
 * word, a stop's own name, a count of stops — and nothing else. The rules never produce prose and this file never
 * adds a fact of its own.
 */
fun dirSteps(t: Say, it: Itinerary, destination: String): List<DirStep> {
    val out = ArrayList<DirStep>()
    it.legs.forEachIndexed { i, leg ->
        val last = i == it.legs.size - 1
        if (leg is WalkLeg) {
            leg.steps.forEachIndexed { k, s ->
                val dist = dirDistance(t, s.metres)
                val turn = s.turn
                out.add(
                    DirStep(
                        if (k == 0 || turn == null) {
                            t(
                                "dir.step_first",
                                mapOf("bearing" to t("dir.bearing." + s.bearing, emptyMap()), "street" to s.street, "distance" to dist),
                            )
                        } else {
                            t(
                                "dir.step_turn",
                                mapOf("turn" to t("dir.turn.$turn", emptyMap()), "street" to s.street, "distance" to dist),
                            )
                        },
                        i,
                    ),
                )
            }
            // A leg that ends at a stop names the stop, so the next sentence ("Board the 4 at …") is not the first
            // time a person hears where they are walking to. A leg with no steps at all (both ends on one edge)
            // still gets this one, so no leg is ever silent.
            val to = leg.toStop
            if (to != null && to.name.isNotEmpty()) {
                out.add(DirStep(t("dir.step_walk_to_stop", mapOf("distance" to dirDistance(t, leg.metres), "stop" to to.name)), i))
            } else if (last) {
                out.add(DirStep(t("dir.step_last", mapOf("distance" to dirDistance(t, leg.metres), "name" to destination)), i))
            } else if (leg.steps.isEmpty()) {
                out.add(DirStep(t("dir.step_walk", mapOf("distance" to dirDistance(t, leg.metres))), i))
            }
        } else {
            val ride = leg as RideLeg
            val route = routeName(ride)
            val toward = towardName(ride)
            out.add(
                DirStep(
                    if (toward.isNotEmpty()) {
                        t("dir.step_board", mapOf("route" to route, "stop" to ride.fromStop.name, "toward" to toward))
                    } else {
                        t("dir.step_board_plain", mapOf("route" to route, "stop" to ride.fromStop.name))
                    },
                    i,
                ),
            )
            out.add(
                DirStep(
                    if (ride.stops == 1) {
                        t("dir.step_ride_one", mapOf("stop" to ride.toStop.name))
                    } else {
                        t("dir.step_ride", mapOf("stops" to ride.stops.toString(), "stop" to ride.toStop.name))
                    },
                    i,
                ),
            )
            out.add(DirStep(t("dir.step_off", mapOf("stop" to ride.toStop.name)), i))
        }
    }
    // We route to the street outside, never to the door (query-spec "Directions", rule 3). Under five metres there
    // is nothing to say; above it, this is the last thing a person is told.
    if (it.endOffMetres >= 5) {
        out.add(DirStep(t("dir.step_end_off", mapOf("metres" to it.endOffMetres.roundToLong().toString())), it.legs.size - 1))
    }
    return out
}

/**
 * The route overlay's text equivalent (WCAG 1.1.1): what the coloured line on the canvas says, in words, for
 * anyone who cannot see it. It names the legs in order and nothing else — the steps below are the detail.
 */
fun routeText(t: Say, it: Itinerary): String =
    t("dir.route_text", mapOf("legs" to legsLine(t, it), "range" to rangeWords(t, it)))

// ---- the picture, as data ----------------------------------------------------------------------------------
// The overlay is a value, not a drawing: what the canvas puts on screen (MapView) and what TalkBack reads out
// (a node per marker) come from the same object, so the two can never describe different trips.

/** A walking leg is a solid line in its own tone; a ride wears the tone of the agency's own layer and its dash,
 *  so the map and the layer switcher never disagree about what a colour means. */
class DirRouteLeg(val ride: Boolean, val polyline: List<DoubleArray>, val colour: String, val dash: List<Double>)

/** Where the trip begins and ends, and every place a bus is got on or off. */
class DirRouteMark(val lat: Double, val lon: Double, val kind: String, val label: String, val sub: String)

class DirRoute(
    val legs: List<DirRouteLeg>,
    val marks: List<DirRouteMark>,
    /** The overlay's text equivalent (1.1.1), read out with the picture's own label. */
    val text: String,
    /** The leg the current step belongs to, drawn heavier. -1 for none. */
    val active: Int,
)

/** Which token a ride leg wears: the agency's own layer tone, so the map and the layer switcher agree. The names
 *  are MapPalette's (`named`), which is where a token becomes a number. */
private val AGENCY_TOKEN = listOf("ddot" to "bus", "smart" to "smart", "qline" to "rail", "dpm" to "rail")

fun rideToken(agency: String): String {
    val k = agency.lowercase(Locale.ROOT)
    for ((id, token) in AGENCY_TOKEN) if (k.contains(id)) return token
    return "routeRide"
}

/** A ride's dash, in multiples of the line's own width — the same 2.2 / 1.4 the web draws. */
val RIDE_DASH: List<Double> = listOf(2.2, 1.4)

/** One itinerary, ready for the canvas: a leg per line, a marker per start, boarding, alighting and end. */
fun dirRoute(t: Say, it: Itinerary, destination: String, active: Int): DirRoute {
    val legs = it.legs.map { l ->
        if (l is RideLeg) DirRouteLeg(true, l.polyline, rideToken(l.agency), RIDE_DASH)
        else DirRouteLeg(false, l.polyline, "routeWalk", emptyList())
    }
    val marks = ArrayList<DirRouteMark>()
    val first = it.legs.firstOrNull()
    val last = it.legs.lastOrNull()
    first?.polyline?.firstOrNull()?.let {
        marks.add(DirRouteMark(it[1], it[0], "start", t("dir.mark_start", emptyMap()), ""))
    }
    for (l in it.legs) {
        if (l !is RideLeg) continue
        l.polyline.firstOrNull()?.let { marks.add(DirRouteMark(it[1], it[0], "board", t("dir.mark_board", emptyMap()), l.fromStop.name)) }
        l.polyline.lastOrNull()?.let { marks.add(DirRouteMark(it[1], it[0], "alight", t("dir.mark_alight", emptyMap()), l.toStop.name)) }
    }
    last?.polyline?.lastOrNull()?.let {
        marks.add(DirRouteMark(it[1], it[0], "end", t("dir.mark_end", emptyMap()), destination))
    }
    return DirRoute(legs, marks, routeText(t, it), active)
}

/** Every point of the trip, for a camera that has to show all of it. */
fun dirFitPoints(it: Itinerary): List<LatLon> = it.legs.flatMap { l -> l.polyline.map { LatLon(it[1], it[0]) } }

// ---- following along ---------------------------------------------------------------------------------------
// There is no rerouting here and there is not going to be: a phone that quietly changes the route under a person
// walking down a street at night is worse than one that says "you are off the route" and waits to be asked. The
// whole of the logic is: which step is nearest, and are we further than OFF_ROUTE_M from the line.

/** How far the person is from the route, in metres, before the screen says "you are off the route". */
const val OFF_ROUTE_M = 120.0

private const val M_PER_DEG_LAT = 111132.0
private val M_PER_DEG_LON = 111320.0 * cos(42.35 * Math.PI / 180.0)

fun metresFromRoute(at: LatLon, polylines: List<List<DoubleArray>>): Double {
    var best = Double.POSITIVE_INFINITY
    for (line in polylines) {
        for (i in 0 until line.size - 1) best = min(best, pointToPiece(at, line[i], line[i + 1]))
    }
    return best
}

/** Which step a person is on: the nearest one whose leg they are standing on, walking forwards. */
fun currentStep(at: LatLon, it: Itinerary, list: List<DirStep>): Int {
    var bestLeg = 0
    var bestD = Double.POSITIVE_INFINITY
    it.legs.forEachIndexed { i, l ->
        val d = metresFromRoute(at, listOf(l.polyline))
        if (d < bestD) { bestD = d; bestLeg = i }
    }
    val at_ = list.indexOfFirst { it.leg == bestLeg }
    return if (at_ < 0) 0 else at_
}

private fun pointToPiece(p: LatLon, a: DoubleArray, b: DoubleArray): Double {
    val px = p.lon * M_PER_DEG_LON
    val py = p.lat * M_PER_DEG_LAT
    val ax = a[0] * M_PER_DEG_LON
    val ay = a[1] * M_PER_DEG_LAT
    val bx = b[0] * M_PER_DEG_LON
    val by = b[1] * M_PER_DEG_LAT
    val dx = bx - ax
    val dy = by - ay
    val len2 = dx * dx + dy * dy
    val u = if (len2 != 0.0) max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2)) else 0.0
    return hypot(px - ax - u * dx, py - ay - u * dy)
}

// ---- where the trip starts ------------------------------------------------------------------------------------

/**
 * How the origin was given. The web's `originKind` (main.ts), as a value a table can be written against: a typed
 * ZIP wins over a typed junction, which wins over a fix, and with no point at all the screen asks.
 *
 * The order matters because all three can be set at once — a person who gave a fix and then typed a ZIP meant the
 * ZIP — and because the *words* differ: "From where you are" is a claim about a person that must never be made
 * about a ZIP they typed.
 */
enum class DirStart { NONE, ME, CROSS, ZIP }

fun dirStart(hasPoint: Boolean, zip: String?, cross: String?): DirStart = when {
    !hasPoint -> DirStart.NONE
    !zip.isNullOrEmpty() -> DirStart.ZIP
    !cross.isNullOrEmpty() -> DirStart.CROSS
    else -> DirStart.ME
}

/** "From where you are", "From ZIP 48201", "From Woodward & Warren". Never a coordinate, ever. */
fun dirFromWords(t: Say, kind: DirStart, words: String): String = when (kind) {
    DirStart.ME -> t("dir.from_me", emptyMap())
    DirStart.ZIP -> t("dir.from_zip", mapOf("zip" to words))
    DirStart.CROSS -> t("dir.from_here", emptyMap()) + words
    DirStart.NONE -> t("dir.from_head", emptyMap())
}
