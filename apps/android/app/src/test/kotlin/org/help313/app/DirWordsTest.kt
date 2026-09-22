// Every sentence a trip plan is made of, in all four languages, held to one table — and the picture beside them,
// held to the shape the canvas draws from.
//
// This is the test the Directions screen is worth: DirWords.kt is where the wording rules of
// schema/query-spec.md "Trip plans" actually live, and a rule that is only true in a screen is a rule nothing CI
// runs will ever check. It is a plain-JVM test, so `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs it on a
// machine with no Android SDK, exactly as it runs the signature check and the report rules.
//
// Four languages, one table: the English sentences are pinned word for word, and every other language is held to
// the properties that are the contract rather than to a translation nobody here can read — no placeholder is left
// unfilled, no sentence is a raw key, no estimate is a single number, and nothing anywhere says safe or lit.
package org.help313.app

import org.help313.query.Itinerary
import org.help313.query.LatLon
import org.help313.query.PlanLeg
import org.help313.query.RideLeg
import org.help313.query.StopRef
import org.help313.query.WalkLeg
import org.help313.query.WalkStep
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class DirWordsTest {

    private val LANGS = listOf("en", "es", "ar", "bn")

    /** Tests run from `apps/android/app` (and from `apps/android/core`), so the repository root is three up. */
    private val root = File("../../..")

    private fun table(lang: String): Map<String, String> =
        org.help313.query.Json.parse(File(root, "strings/$lang.json").readText())
            .obj.mapNotNull { (k, v) -> v.str?.let { k to it } }.toMap()

    /** The app's own `L.t`, without Android: the same lookup, the same English fallback, the same substitution. */
    private fun say(lang: String): Say {
        val words = table(lang)
        val english = table("en")
        return { key, params ->
            var s = words[key] ?: english[key] ?: key
            for ((k, v) in params) s = s.replace("{$k}", v)
            s
        }
    }

    // ---- one trip, made of parts, so every branch of the wording is exercised ------------------------------

    private fun pt(lon: Double, lat: Double) = doubleArrayOf(lon, lat)

    /** Walk to a stop, ride nine stops on the 4, walk to the door. The shape most trips in this city have. */
    private fun busTrip(): Itinerary {
        val walkOne = WalkLeg(
            metres = 480.0, minutes = 6.0,
            steps = listOf(
                WalkStep("Woodward Ave", "north", null, 300.0),
                WalkStep("E Warren Ave", "east", "right", 180.0),
            ),
            polyline = listOf(pt(-83.06, 42.35), pt(-83.058, 42.353), pt(-83.054, 42.353)),
            toStop = StopRef(4, "Woodward & Warren"),
        )
        val ride = RideLeg(
            routeId = "rt_ddot_4", routeShort = "4", routeLong = "Woodward", agency = "DDOT",
            headwayMinutes = 15.0,
            fromStop = StopRef(4, "Woodward & Warren"), toStop = StopRef(13, "Woodward & Grand Blvd"),
            stops = 9, metres = 4200.0, minutes = 14.0, waitMinutes = 7.5,
            polyline = listOf(pt(-83.054, 42.353), pt(-83.05, 42.38), pt(-83.048, 42.39)),
        )
        val walkTwo = WalkLeg(
            metres = 160.0, minutes = 2.0,
            steps = listOf(WalkStep("Grand Blvd", "west", null, 160.0)),
            polyline = listOf(pt(-83.048, 42.39), pt(-83.05, 42.3905)),
            fromStop = StopRef(13, "Woodward & Grand Blvd"),
        )
        return itinerary(listOf(walkOne, ride, walkTwo), endOff = 40.0)
    }

    /** One walking leg, straight there. The plan a person four blocks away gets. */
    private fun walkTrip(): Itinerary = itinerary(
        listOf(
            WalkLeg(
                metres = 520.0, minutes = 7.0,
                steps = listOf(
                    WalkStep("Cass Ave", "south", null, 400.0),
                    WalkStep("W Canfield St", "west", "slight_right", 120.0),
                ),
                polyline = listOf(pt(-83.066, 42.35), pt(-83.066, 42.347), pt(-83.07, 42.347)),
            ),
        ),
        endOff = 3.0,
    )

    private fun itinerary(legs: List<PlanLeg>, endOff: Double) = Itinerary(
        legs = legs, changes = legs.count { it is RideLeg }.let { if (it > 0) it - 1 else 0 },
        walkMetres = legs.filterIsInstance<WalkLeg>().sumOf { it.metres },
        rideMetres = legs.filterIsInstance<RideLeg>().sumOf { it.metres },
        minutes = legs.sumOf { it.minutes },
        range = org.help313.query.minutesRange(legs.sumOf { it.minutes }),
        startOffMetres = 0.0, endOffMetres = endOff,
    )

    // ---- the table, in English, word for word --------------------------------------------------------------

    @Test
    fun theEnglishTable() {
        val t = say("en")
        val bus = busTrip()

        assertEquals("Bus 4", itineraryTitle(t, bus))
        assertEquals("walk 0.3 mi, ride 9 stops, walk 0.1 mi", legsLine(t, bus))
        assertEquals("about ${bus.range[0]}–${bus.range[1]} min", rangeWords(t, bus))
        assertEquals("about every 15 min", headwayWords(t, bus))
        assertEquals("about every 15 min", cardHeadway(t, bus))
        assertEquals("0.3 mi", dirDistance(t, 480.0))
        assertEquals("40 m", dirOffStreet(t, 40.0))

        assertEquals(
            listOf(
                "Walk north on Woodward Ave for 0.2 mi",
                "Turn right onto E Warren Ave and walk 0.1 mi",
                "Walk 0.3 mi to Woodward & Warren",
                "Board the 4 at Woodward & Warren toward Woodward",
                "Ride 9 stops to Woodward & Grand Blvd",
                "Get off at Woodward & Grand Blvd",
                "Walk west on Grand Blvd for 0.1 mi",
                "Walk 0.1 mi to Middle School",
                "Then about 40 m to the building",
            ),
            dirSteps(t, bus, "Middle School").map { it.text },
        )
        // Which leg each sentence belongs to, so the map can draw that leg heavier.
        assertEquals(listOf(0, 0, 0, 1, 1, 1, 2, 2, 2), dirSteps(t, bus, "Middle School").map { it.leg })

        val walk = walkTrip()
        assertEquals("Walk", itineraryTitle(t, walk))
        assertEquals("", headwayWords(t, walk))
        assertEquals(
            listOf(
                "Walk south on Cass Ave for 0.2 mi",
                "Bear right onto W Canfield St and walk 0.1 mi",
                "Walk 0.3 mi to Middle School",
            ),
            dirSteps(t, walk, "Middle School").map { it.text },
        )
    }

    /** A leg that rounds to nothing is still a walk somebody has to do: the floor is a tenth of a mile. */
    @Test
    fun aWalkIsNeverZeroMiles() {
        val t = say("en")
        assertEquals("0.1 mi", dirDistance(t, 1.0))
        assertEquals("0.1 mi", dirDistance(t, 0.0))
    }

    /** Under five metres there is nothing to say about the last few steps to the door. */
    @Test
    fun theLastFewMetresAreOnlySaidWhenThereAreSome() {
        val t = say("en")
        assertFalse(dirSteps(t, walkTrip(), "Somewhere").any { it.text.contains("to the building") })
        assertTrue(dirSteps(t, busTrip(), "Somewhere").any { it.text.contains("to the building") })
    }

    /** A route that publishes no headway says nothing, rather than our assumed wait dressed up as a fact. */
    @Test
    fun anAssumedWaitIsNeverSaidOutLoud() {
        val t = say("en")
        val ride = RideLeg(
            routeId = "rt_smart_140", routeShort = "140", routeLong = "140", agency = "SMART",
            headwayMinutes = null,
            fromStop = StopRef(0, "Michigan & Greenfield"), toStop = StopRef(1, "Michigan & Evergreen"),
            stops = 1, metres = 1600.0, minutes = 5.0, waitMinutes = 20.0,
            polyline = listOf(pt(-83.2, 42.33), pt(-83.22, 42.33)),
        )
        val trip = itinerary(listOf(ride), endOff = 0.0)
        assertEquals("", headwayWords(t, trip))
        assertEquals("", cardHeadway(t, trip))
        val everything = (dirSteps(t, trip, "There").map { it.text } + dirSummary(t, trip) + routeText(t, trip)).joinToString(" ")
        assertFalse("the assumed wait reached a screen", everything.contains("20"))
        assertEquals("ride 1 stop", legsLine(t, trip))
        assertEquals("Ride 1 stop to Michigan & Evergreen", dirSteps(t, trip, "There")[1].text)
    }

    // ---- the same table in all four languages ----------------------------------------------------------------

    /**
     * Every sentence, in every language: filled in, not a raw key, and never a claim this app does not make. The
     * Spanish, Arabic and Bengali wordings are not asserted line for line — nobody here can read them, and a test
     * that pinned a translation would only pin a machine's guess (DECISIONS 2026-09-20). What is asserted is what
     * has to be true of every one of them.
     */
    @Test
    fun everyLanguageSaysTheWholeTrip() {
        for (lang in LANGS) {
            val t = say(lang)
            for (trip in listOf(busTrip(), walkTrip())) {
                val said = dirSteps(t, trip, "Middle School").map { it.text } +
                    listOf(itineraryTitle(t, trip), legsLine(t, trip), rangeWords(t, trip), dirSummary(t, trip), routeText(t, trip))
                for (s in said) {
                    assertTrue("$lang: an empty sentence", s.isNotEmpty())
                    assertFalse("$lang: a placeholder was never filled in: $s", s.contains("{"))
                    assertFalse("$lang: a raw string key reached a screen: $s", s.startsWith("dir."))
                }
                // The estimate is a range, in every language: both ends of it are in the sentence.
                assertTrue("$lang: the low end is missing", rangeWords(t, trip).contains(trip.range[0].toString()))
                assertTrue("$lang: the high end is missing", rangeWords(t, trip).contains(trip.range[1].toString()))
            }
            // Western digits in all four, so a distance reads as it is signposted (DECISIONS 2026-09-20).
            assertEquals("$lang: a distance must be written in Western digits", true, dirDistance(t, 480.0).contains("0.3"))
        }
    }

    /**
     * No sentence in any language calls a route safe, lit, accessible or step-free — and none may ever be added.
     *
     * `dir.caveat` is the one key that may use those words, because it is the sentence that says the opposite:
     * "They are not checked for safety or lighting." It is left out of the scan and asserted on its own, so that
     * removing the disclaimer cannot quietly pass this test.
     */
    @Test
    fun nothingIsCalledSafe() {
        val forbidden = listOf("safe", "lit ", "well-lit", "accessible", "step-free", "seguro", "iluminad")
        for (lang in LANGS) {
            val words = table(lang)
            for ((k, v) in words) {
                if (!k.startsWith("dir.") || k == "dir.caveat") continue
                for (bad in forbidden) {
                    assertFalse("strings/$lang.json $k says \"$bad\"", v.lowercase().contains(bad))
                }
            }
            assertTrue("strings/$lang.json has lost the caveat", (words["dir.caveat"] ?: "").length > 40)
        }
        assertTrue(table("en")["dir.caveat"]!!.contains("not checked for safety"))
    }

    // ---- where a trip starts ---------------------------------------------------------------------------------

    /**
     * The start decision, as a table. All three can be set at once — a person who gave a fix and then typed a ZIP
     * meant the ZIP — and the words differ, because "From where you are" is a claim about a person that must never
     * be made about a ZIP they typed.
     */
    @Test
    fun theStartDecisionTable() {
        assertEquals(DirStart.NONE, dirStart(hasPoint = false, zip = null, cross = null))
        assertEquals("no point is no start, whatever was typed", DirStart.NONE, dirStart(false, "48201", "Woodward & Warren"))
        assertEquals(DirStart.ME, dirStart(true, null, null))
        assertEquals(DirStart.ME, dirStart(true, "", ""))
        assertEquals(DirStart.CROSS, dirStart(true, null, "Woodward & Warren"))
        assertEquals(DirStart.ZIP, dirStart(true, "48201", null))
        assertEquals("a typed ZIP wins over a typed junction", DirStart.ZIP, dirStart(true, "48201", "Woodward & Warren"))
    }

    @Test
    fun theStartIsSaidInWordsAndNeverAsACoordinate() {
        val t = say("en")
        assertEquals("From where you are", dirFromWords(t, DirStart.ME, ""))
        assertEquals("From ZIP 48201", dirFromWords(t, DirStart.ZIP, "48201"))
        assertEquals("From Woodward & Warren", dirFromWords(t, DirStart.CROSS, "Woodward & Warren"))
        assertEquals("Where are you starting?", dirFromWords(t, DirStart.NONE, ""))
        for (lang in LANGS) {
            val other = say(lang)
            for (kind in DirStart.values()) {
                val s = other(kind.name, emptyMap()).let { _ -> dirFromWords(other, kind, "48201") }
                assertFalse("$lang: a placeholder was never filled in: $s", s.contains("{"))
                assertFalse("$lang: a coordinate reached the start line", s.contains("42.3"))
            }
        }
    }

    // ---- the picture, as data ----------------------------------------------------------------------------------

    @Test
    fun theOverlayIsTheTripAndNothingElse() {
        val t = say("en")
        val bus = busTrip()
        val r = dirRoute(t, bus, "Middle School", active = 1)

        assertEquals(3, r.legs.size)
        assertEquals(listOf(false, true, false), r.legs.map { it.ride })
        // A walk is solid in the walk tone; a ride wears its own agency's layer tone and the dash.
        assertEquals(listOf("routeWalk", "bus", "routeWalk"), r.legs.map { it.colour })
        assertEquals(emptyList<Double>(), r.legs[0].dash)
        assertEquals(RIDE_DASH, r.legs[1].dash)
        assertEquals("the leg the current step belongs to is the one drawn heavier", 1, r.active)

        // Start, board, get off, end — in the order they happen, at the ends of the legs they belong to.
        assertEquals(listOf("start", "board", "alight", "end"), r.marks.map { it.kind })
        assertEquals(listOf("Start", "Get on the bus here", "Get off the bus here", "End"), r.marks.map { it.label })
        assertEquals(listOf("", "Woodward & Warren", "Woodward & Grand Blvd", "Middle School"), r.marks.map { it.sub })
        assertEquals(42.35, r.marks[0].lat, 1e-9)
        assertEquals(-83.06, r.marks[0].lon, 1e-9)
        assertEquals(42.3905, r.marks[3].lat, 1e-9)
        assertEquals(-83.05, r.marks[3].lon, 1e-9)

        // The overlay's text equivalent (WCAG 1.1.1): what the coloured line says, in words.
        assertEquals(
            "The line on the map is this trip: walk 0.3 mi, ride 9 stops, walk 0.1 mi, " +
                "about ${bus.range[0]}–${bus.range[1]} min. The numbered steps below say the same thing in words.",
            r.text,
        )
    }

    @Test
    fun aWalkingTripHasTwoMarkersAndNoBusColour() {
        val r = dirRoute(say("en"), walkTrip(), "Middle School", active = -1)
        assertEquals(listOf("start", "end"), r.marks.map { it.kind })
        assertEquals(listOf("routeWalk"), r.legs.map { it.colour })
        assertEquals(-1, r.active)
    }

    /** Every agency we carry a layer for wears that layer's tone, so the map and the switcher always agree. */
    @Test
    fun anAgencyWearsItsOwnLayersTone() {
        assertEquals("bus", rideToken("DDOT"))
        assertEquals("smart", rideToken("SMART"))
        assertEquals("rail", rideToken("QLINE"))
        assertEquals("rail", rideToken("Detroit People Mover (DPM)"))
        assertEquals("an agency with no layer falls back, it does not borrow another's", "routeRide", rideToken("Amtrak"))
    }

    @Test
    fun theWholeTripFitsInTheCamera() {
        val fit = dirFitPoints(busTrip())
        assertEquals(8, fit.size)
        assertEquals(42.35, fit.first().lat, 1e-9)
        assertEquals(42.3905, fit.last().lat, 1e-9)
    }

    // ---- following along ----------------------------------------------------------------------------------------

    @Test
    fun offTheRouteIsOneHundredAndTwentyMetres() {
        assertEquals(120.0, OFF_ROUTE_M, 0.0)
        val line = listOf(listOf(pt(-83.06, 42.35), pt(-83.06, 42.36)))
        assertEquals("standing on it", 0.0, metresFromRoute(LatLon(42.355, -83.06), line), 1.0)
        // A tenth of a degree of longitude is far more than 120 m; a thousandth is about 82 m.
        assertTrue(metresFromRoute(LatLon(42.355, -83.061), line) < OFF_ROUTE_M)
        assertTrue(metresFromRoute(LatLon(42.355, -83.064), line) > OFF_ROUTE_M)
    }

    @Test
    fun theCurrentStepIsTheFirstOneOfTheLegYouAreOn() {
        val t = say("en")
        val bus = busTrip()
        val steps = dirSteps(t, bus, "Middle School")
        // Standing on the ride's own line: the first sentence of the ride leg, which is "Board the 4 at…".
        assertEquals(3, currentStep(LatLon(42.38, -83.05), bus, steps))
        // Standing at the very start: the first sentence of all.
        assertEquals(0, currentStep(LatLon(42.35, -83.06), bus, steps))
    }

    /** A summary is one line and names the route, the legs, the range and the agency's own headway — in that order. */
    @Test
    fun theSummaryIsTheWholeCardInOneSentence() {
        val t = say("en")
        val bus = busTrip()
        assertEquals(
            "Bus 4 · walk 0.3 mi, ride 9 stops, walk 0.1 mi · about ${bus.range[0]}–${bus.range[1]} min · about every 15 min",
            dirSummary(t, bus),
        )
        assertNotEquals(dirSummary(t, bus), dirSummary(t, walkTrip()))
    }
}
