// The JUnit face of the fixture runner: this is what `./gradlew :query:test` and CI run.
// The work itself is in Fixtures.kt, which has no test-framework dependency.
package org.help313.query

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FixtureTest {

    @Test
    fun everyFixture() {
        val r = runFixtures()
        println("fixtures: ${r.ran} cases, ${r.failures.size} failed")
        assertTrue("only ${r.ran} cases ran; the fixtures did not load", r.ran > 80)
        assertEquals(emptyList<String>(), r.failures)
    }

    @Test
    fun daylightSavingDoesNotMoveDoorHours() {
        // Sunday 2026-11-01 02:00 the clocks go back. A 9am opening is 9am on the wall on both sides.
        val before = parseInstant("2026-10-31T13:30:00Z")!!
        val after = parseInstant("2026-11-02T14:30:00Z")!!
        assertEquals(9, toWall(before).hh)
        assertEquals(9, toWall(after).hh)
    }

    @Test
    fun fallBackHourHappensTwiceOnTheWall() {
        // Both of these are 1:30am in Detroit on 2026-11-01: the first on EDT, the second on EST.
        assertEquals(1, toWall(parseInstant("2026-11-01T05:30:00Z")!!).hh)
        assertEquals(1, toWall(parseInstant("2026-11-01T06:30:00Z")!!).hh)
        assertEquals(30, toWall(parseInstant("2026-11-01T06:30:00Z")!!).mm)
    }

    @Test
    fun springForwardSkipsTheHour() {
        // 2027-03-14 01:59 EST is followed by 03:00 EDT; nothing reads as 02:30.
        assertEquals(1, toWall(parseInstant("2027-03-14T06:59:00Z")!!).hh)
        assertEquals(3, toWall(parseInstant("2027-03-14T07:00:00Z")!!).hh)
    }

    @Test
    fun zoneAgreesWithTheJvmTimeZoneDatabase() {
        // The hand-written rule in Time.kt has to agree with tzdata. The JVM has a zone database; Android below
        // API 26 has no java.time, but this test runs on the JVM, so the rule is checked against tzdata here.
        val tz = java.util.TimeZone.getTimeZone(ZONE)
        val cal = java.util.Calendar.getInstance(tz)
        var checked = 0
        var millis = parseInstant("2024-01-01T00:07:00Z")!!
        val end = parseInstant("2031-01-01T00:07:00Z")!!
        while (millis < end) {
            cal.timeInMillis = millis
            val w = toWall(millis)
            assertEquals("year at $millis", cal.get(java.util.Calendar.YEAR), w.y)
            assertEquals("month at $millis", cal.get(java.util.Calendar.MONTH) + 1, w.m)
            assertEquals("day at $millis", cal.get(java.util.Calendar.DAY_OF_MONTH), w.d)
            assertEquals("hour at $millis", cal.get(java.util.Calendar.HOUR_OF_DAY), w.hh)
            assertEquals("minute at $millis", cal.get(java.util.Calendar.MINUTE), w.mm)
            checked++
            millis += 37 * 60 * 1000L      // 37 minutes: lands on both sides of every transition over 7 years
        }
        assertTrue(checked > 50_000)
    }

    @Test
    fun calendarArithmetic() {
        var day = -800
        while (day < 40_000) {
            val c = civil(day)
            assertEquals(day, dayNumber(c.y, c.m, c.d))
            day += 37
        }
        assertEquals(4, weekday(dayNumber(2026, 9, 18)))    // a Friday
        assertEquals(parseInstant("2026-09-18T13:45:00-04:00"), parseInstant("2026-09-18T17:45Z"))
    }

    @Test
    fun telLinksKeepExtensionsApart() {
        assertEquals("tel:+13135792100,4217", telLink("313-579-2100 ext. 4217"))
        assertEquals("tel:+13132247000", telLink("(313) 224-7000"))
        assertEquals("tel:988", telLink("988"))
        assertEquals("tel:+18007997233", telLink("1-800-799-7233"))
    }

    @Test
    fun jsonReaderHandlesTheShapesTheBundleUses() {
        val j = Json.parse("""{"a":[1,-2.5,1e3],"b":"é\n","c":null,"d":true,"e":{"f":[]}}""")
        assertEquals(3, j["a"]!!.arr.size)
        assertEquals(1000.0, j["a"]!!.arr[2].num!!, 0.0)
        assertEquals("é\n", j["b"]!!.str)
        assertEquals(null, j["c"])
        assertTrue(j.hasNullAt("c"))
        assertEquals(true, j["d"]!!.bool)
        assertEquals(0, j["e"]!!["f"]!!.arr.size)
    }

    /**
     * 20,000 open brackets, which is the shape of the attack the Android review found: the app parses
     * `index.json.sig` *before* any signature has been checked, so whatever answers for the bundle origin gets to
     * choose this input. Unbounded recursion made it a StackOverflowError — an Error, not an Exception — which
     * killed the loader thread and repeated at every start.
     *
     * The assertion is not only "it throws": it is that it throws a **JsonException**, which every caller already
     * treats as "refuse this file". An Error would pass an `assertThrows(Throwable)` and still be the bug.
     */
    @Test
    fun deeplyNestedJsonIsRefusedAndDoesNotOverflowTheStack() {
        for (size in listOf(100, 20_000, 200_000)) {
            val bombs = listOf("[".repeat(size), "{\"a\":".repeat(size), "[".repeat(size) + "]".repeat(size))
            for (text in bombs) {
                try {
                    Json.parse(text)
                    throw AssertionError("JSON nested $size deep was accepted")
                } catch (e: JsonException) {
                    assertTrue("the wrong JsonException: ${e.message}", e.message!!.contains("deep"))
                }
            }
        }
    }

    /** The bundle's own shapes are nowhere near the cap, and the cap is not off by one at the boundary. */
    @Test
    fun theNestingCapLeavesTheBundleRoomToBreathe() {
        val ok = "[".repeat(Json.MAX_DEPTH) + "]".repeat(Json.MAX_DEPTH)
        assertTrue("exactly MAX_DEPTH levels must parse", Json.parse(ok) is Json.Arr)
        try {
            Json.parse("[".repeat(Json.MAX_DEPTH + 1) + "]".repeat(Json.MAX_DEPTH + 1))
            throw AssertionError("one level past the cap was accepted")
        } catch (_: JsonException) {
            // expected
        }
        // The real index, the deepest thing the app reads, is well inside it.
        assertTrue(Json.MAX_DEPTH > 32)
    }

    /**
     * What the Detroit rule does before 1987, pinned as documented behaviour rather than left undefined.
     *
     * Time.kt's rules are the 1987-2006 and post-2007 United States ones. Detroit's real history before 1987 is
     * different — the last Sunday in April from 1976, early starts in 1974 and 1975, and no daylight saving at all
     * in Michigan from 1969 to 1972 — and the rule is clamped rather than extended: every pre-1987 instant is
     * answered as Eastern Standard Time, the year round. These two probes are the ones where that is visible, and
     * they are here so that a future change to the clamp is a decision somebody makes rather than a surprise.
     */
    @Test
    fun theZoneRuleIsClampedBefore1987() {
        // 1 July 1970, noon UTC. Michigan was on EST the year round in 1970, so history says 07:00 — and the
        // clamp, which finds no daylight window before 1987, agrees here by accident.
        val summer1970 = parseInstant("1970-07-01T12:00:00Z")!!
        assertEquals(Wall(1970, 7, 1, 7, 0), toWall(summer1970))

        // 1 July 1985, noon UTC. History says 08:00 (EDT: the 1976-1986 window ran from the last Sunday in April).
        // The clamp says 07:00. This is the disagreement, written down: the rule is valid from 1987.
        val summer1985 = parseInstant("1985-07-01T12:00:00Z")!!
        assertEquals(Wall(1985, 7, 1, 7, 0), toWall(summer1985))

        // And from 1987 the rule is the rule: 1 July 1987 is inside the first-Sunday-in-April window, so 08:00.
        assertEquals(Wall(1987, 7, 1, 8, 0), toWall(parseInstant("1987-07-01T12:00:00Z")!!))
        assertEquals(1987, ZONE_RULE_FROM_YEAR)
    }
}
