// The chart model behind Table | Chart on a neighborhood's year panels (docs/13, 2026-09-22).
//
// These are the web's cases in `apps/web/test/hoodchart.test.ts` and the iPhone's in
// `apps/ios/Tests/HelpCoreTests/HoodChartTests.swift`, ported one for one: the same years, the same counts, the
// same points, segments, axis and sentence. If the three ever disagree, one of the three apps is drawing
// something the others are not.
//
// It runs on a plain JDK, under `:core` as well as `:app`: nothing here touches a Canvas, and the rule that a
// hidden count never becomes a value is exactly the kind of rule a mistake in would be worst.
package org.help313.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow

class HoodChartTest {

    private val years = listOf("2020", "2021", "2022", "2023", "2024", "2025")

    /** The web's SALES fixture. Since 2026-09-22 a small count is stated, not hidden (DECISIONS): 3 is 3. */
    private val sales = listOf(n(12), n(3), n(18), n(24), n(31), n(9))

    private fun n(v: Int) = HoodCount.of(v)

    private fun points(counts: List<HoodCount?>, soFar: String? = null): List<HoodChartPoint> =
        counts.mapIndexed { i, c -> HoodChartPoint(years[i], c, years[i] == soFar) }

    private fun one(
        counts: List<HoodCount?>,
        key: String = "x",
        tone: HoodTone = HoodTone.A,
        label: String = "x",
        soFar: String? = null,
    ) = HoodSeries(key, tone, label, points(counts, soFar))

    /** The app's own words, as the screen hands them in. */
    private val words: (String, Map<String, String>) -> String = { key, p ->
        val table = mapOf(
            "hood.days" to "{n} days",
            "hood.none_recorded" to "none recorded",
            "hood.so_far" to "{year} so far",
            "hood.chart_bar" to "{year}, {label}: {count}",
            "hood.chart_summary" to "The chart shows each year from {from} to {to}. Most in one year: {most}.",
            "hood.chart_peak" to "{label}, {count} in {year}",
            "hood.chart_peak_none" to "{label}, no year has a number we can show",
            "list.sep" to ", ",
        )
        var out = table[key] ?: "MISSING:$key"
        for ((k, v) in p) out = out.replace("{$k}", v)
        out
    }

    // ---- points, segments and blanks --------------------------------------------------------------------------

    @Test
    fun `a series becomes points segments and blanks and never mixes them up`() {
        val m = hoodChartModel(listOf(one(listOf(n(12), n(2), null, n(24), n(7), n(7)))))
        val s = m.series[0]
        assertEquals(
            listOf(HoodPointKind.VALUE, HoodPointKind.VALUE, HoodPointKind.NONE, HoodPointKind.VALUE, HoodPointKind.VALUE, HoodPointKind.VALUE),
            s.points.map { it.kind },
        )
        assertEquals(listOf("2022"), s.blanks)
        assertEquals(2, s.points[1].value)
        assertEquals(2.0 / m.top, s.points[1].frac, 1e-12)
        // No piece of line crosses the year with nothing recorded.
        assertEquals(listOf(0, 3, 4), s.segments.map { it.from })
        assertEquals(listOf(1, 4, 5), s.segments.map { it.to })
    }

    /** A 3 is drawn at 3: three quarters of an axis whose top is 4 (the web's case). */
    @Test
    fun `a small count is drawn at its value`() {
        val m = hoodChartModel(listOf(one(listOf(n(3), n(4), n(4), null, null, null))))
        assertEquals(4, m.top)
        assertEquals(HoodPointKind.VALUE, m.series[0].points[0].kind)
        assertEquals(0.75, m.series[0].points[0].frac, 1e-12)
        assertEquals(listOf(0, 1, 2, 3, 4), m.ticks)
    }

    /** A chart holds one unit: days are said as days, in the point and in the summary. */
    @Test
    fun `a chart holds one unit and says days as days`() {
        val days = HoodSeries("days", HoodTone.A, "Middle time to close", points(listOf(n(8), n(21), n(40), n(12), n(9), n(5))), HoodUnit.DAYS)
        val m = hoodChartModel(listOf(days))
        assertEquals(HoodUnit.DAYS, m.unit)
        assertEquals("2022, Middle time to close: 40 days", hoodPointText(m.series[0].points[2], "Middle time to close", words, HoodUnit.DAYS))
        assertTrue(hoodChartSummary(m, words).contains("Middle time to close, 40 days in 2022"))
        assertEquals(HoodUnit.COUNT, hoodChartModel(listOf(one(sales))).unit)
    }

    /** The crash chart: three series from the years, oldest first, walking / biking / badly hurt as A / B / C. */
    @Test
    fun `crash series are three lines from the years`() {
        val by = mapOf(
            "2021" to HoodCrashes(n(12), n(2), n(5)),
            "2020" to HoodCrashes(n(12), n(1), n(5)),
            "2022" to HoodCrashes(n(8), n(0), n(4)),
        )
        val s = hoodCrashSeries(by, "Walking", "Biking", "Killed or badly hurt")
        assertEquals(listOf("walk", "bike", "severe"), s.map { it.key })
        assertEquals(listOf(HoodTone.A, HoodTone.B, HoodTone.C), s.map { it.tone })
        assertEquals(listOf("2020", "2021", "2022"), s[0].points.map { it.year })
        assertEquals(listOf(1, 2, 0), s[1].points.map { it.count?.value })
        assertTrue(hoodCrashSeries(emptyMap(), "", "", "").isEmpty())
        val m = hoodChartModel(s)
        assertEquals("2022, Biking: 0", hoodPointText(m.series[1].points[2], "Biking", words))
    }

    @Test
    fun `the earliest of two equal peaks is named`() {
        val m = hoodChartModel(listOf(one(listOf(n(30), n(12), n(30), null, null, null))))
        assertEquals("2020", m.series[0].peakYear)
        assertEquals(30, m.series[0].peakValue)
    }

    // ---- the axis ---------------------------------------------------------------------------------------------

    @Test
    fun `the axis starts at zero ends on a round number and labels small values exactly`() {
        for (counts in listOf(listOf(5, 6, 7), listOf(12, 3, 18, 24, 31, 9), listOf(200, 410, 90), listOf(1, 1, 2), listOf(0, 0, 0))) {
            val m = hoodChartModel(listOf(HoodSeries("x", HoodTone.A, "x",
                counts.mapIndexed { i, c -> HoodChartPoint((2020 + i).toString(), n(c)) })))
            assertEquals("$counts", 0, m.ticks.first())
            assertTrue("$counts", m.top >= maxOf(1, counts.max()))
            assertEquals("$counts", m.top, m.ticks.last())
            assertTrue("$counts", m.ticks.size <= 6)
            for (p in m.series[0].points) assertTrue(p.frac <= 1.0)
        }
        assertEquals(listOf(0, 1, 2), hoodChartModel(listOf(one(listOf(n(1), n(1), n(2), null, null, null)))).ticks)
        assertEquals(1, hoodChartModel(listOf(one(listOf(n(0), n(0), n(0), null, null, null)))).top)
    }

    /** Two series share ONE axis: its top is the larger of the two, never one scale each. */
    @Test
    fun `two series share one axis`() {
        val m = hoodChartModel(listOf(one(sales, key = "s"), one(listOf(n(6), n(7), n(1), n(14), n(11), n(8)), key = "p", tone = HoodTone.B)))
        assertEquals(2, m.series.size)
        assertEquals(hoodChartModel(listOf(one(sales))).top, m.top)
        assertEquals(12.0 / m.top, m.series[0].points[0].frac, 1e-12)
        assertEquals(6.0 / m.top, m.series[1].points[0].frac, 1e-12)
    }

    @Test
    fun `an empty series has an axis of one and no peak`() {
        val m = hoodChartModel(listOf(one(listOf(null, null, null, null, null, null))))
        assertEquals(1, m.top)
        assertEquals(listOf(0, 1), m.ticks)
        assertNull(m.series[0].peakYear)
        assertFalse(hoodAnyValue(points(listOf(null, null, null, null, null, null))))
        assertTrue(hoodAnyValue(points(listOf(null, null, n(0), null, null, null))))
    }

    @Test
    fun `the step is always a one a two or a five times a power of ten`() {
        for (max in listOf(1, 4, 5, 9, 11, 37, 99, 205, 1234, 90_000)) {
            val step = hoodAxisStep(max)
            val head = step / 10.0.pow(floor(log10(step.toDouble()))).toInt()
            assertTrue("step $step for $max", head == 1 || head == 2 || head == 5)
            assertTrue("too many ticks for $max", (max + step - 1) / step <= 4)
        }
    }

    // ---- which lines are drawn --------------------------------------------------------------------------------

    @Test
    fun `the last line on cannot be switched off`() {
        val all = listOf(one(sales, key = "sales"), one(sales, key = "permits", tone = HoodTone.B))
        assertEquals(listOf("sales", "permits"), hoodShownSeries(all, emptySet()).map { it.key })
        assertEquals(listOf("sales"), hoodShownSeries(all, setOf("permits")).map { it.key })
        assertEquals(listOf("permits"), hoodShownSeries(all, setOf("sales")).map { it.key })
        // Both off is not a state the screen can reach, and if it ever were, something is still drawn.
        assertEquals(listOf("sales"), hoodShownSeries(all, setOf("sales", "permits")).map { it.key })
    }

    // ---- when a chart is offered at all -----------------------------------------------------------------------

    @Test
    fun `a chart is offered only for three years with a number`() {
        assertTrue(hoodChartable(points(listOf(n(12), n(14), n(16), null, null, null))))
        assertTrue(hoodChartable(points(listOf(n(0), n(0), n(0), null, null, null))))
        assertFalse(hoodChartable(points(listOf(n(12), n(14), null, null, null, null))))
        assertFalse(hoodChartable(points(listOf(n(12), null, null, n(14), null, null))))
    }

    // ---- the labels under the axis ----------------------------------------------------------------------------

    @Test
    fun `years thin themselves rather than overlap once there are more than six`() {
        assertEquals(years, hoodAxisYears(years))
        val nine = (2017..2025).map { it.toString() }
        val shown = hoodAxisYears(nine)
        assertEquals("2017", shown.first())
        assertEquals("2025", shown.last())
        assertTrue(shown.size < nine.size)
    }

    // ---- the words --------------------------------------------------------------------------------------------

    @Test
    fun `a point says its year its series and its exact count`() {
        val m = hoodChartModel(listOf(one(sales, label = "Homes sold")))
        assertEquals("2020, Homes sold: 12", hoodPointText(m.series[0].points[0], "Homes sold", words))
        assertEquals("2021, Homes sold: 3", hoodPointText(m.series[0].points[1], "Homes sold", words))
        val small = hoodChartModel(listOf(one(listOf(n(3), n(1), n(0), n(9), null, null), label = "Torn down")))
        assertEquals("2020, Torn down: 3", hoodPointText(small.series[0].points[0], "Torn down", words))
        assertEquals("2022, Torn down: 0", hoodPointText(small.series[0].points[2], "Torn down", words))
        assertEquals("2024, Torn down: none recorded", hoodPointText(small.series[0].points[4], "Torn down", words))
        val sofar = hoodChartModel(listOf(one(sales, label = "Homes sold", soFar = "2025")))
        assertEquals("2025 so far, Homes sold: 9", hoodPointText(sofar.series[0].points[5], "Homes sold", words))
    }

    @Test
    fun `the summary says what is drawn over which years and each series biggest year`() {
        val m = hoodChartModel(listOf(one(listOf(n(2), n(12), n(31), null, null, null), label = "Torn down")))
        val s = hoodChartSummary(m, words)
        assertEquals("The chart shows each year from 2020 to 2025. Most in one year: Torn down, 31 in 2022.", s)
        assertFalse(s.contains("fewer than"))
        // Never a trend: the sentence describes, it does not explain (docs/13, honesty rule 4).
        for (word in listOf("rising", "falling", "better", "worse", "trend")) {
            assertFalse(word, s.lowercase().contains(word))
        }
    }

    @Test
    fun `two series are both named in one sentence`() {
        val m = hoodChartModel(listOf(
            one(sales, key = "s", label = "Homes sold"),
            one(listOf(n(6), n(7), n(1), n(14), n(11), n(8)), key = "p", tone = HoodTone.B, label = "Permits"),
        ))
        val s = hoodChartSummary(m, words)
        assertTrue(s.contains("Homes sold, 31 in 2024"))
        assertTrue(s.contains("Permits, 14 in 2023"))
    }

    // ---- what the phone remembers -----------------------------------------------------------------------------

    @Test
    fun `table is the default and only the word chart is chart`() {
        assertEquals(HoodViewChoice.TABLE, hoodViewOf(null))
        assertEquals(HoodViewChoice.TABLE, hoodViewOf("nonsense"))
        assertEquals(HoodViewChoice.TABLE, hoodViewOf("Chart"))
        assertEquals(HoodViewChoice.CHART, hoodViewOf("chart"))
    }

    @Test
    fun `the choice survives a relaunch and sits beside the layer choices in the same file`() {
        val dir = createTempDir()
        try {
            val first = MapLayerStore(dir)
            assertEquals(HoodViewChoice.TABLE, first.hoodView)
            first.toggle("go:qline")
            first.setHoodView(HoodViewChoice.CHART)

            val second = MapLayerStore(dir)
            assertEquals(HoodViewChoice.CHART, second.hoodView)
            assertTrue(second.isOn("go:qline"))
            assertEquals(MapStyle.STANDARD, second.style)
        } finally {
            dir.deleteRecursively()
        }
    }

    /** Yesterday's file, with no `hoodView` in it at all, still reads, and the view is then the default. */
    @Test
    fun `an older file reads as a table`() {
        val dir = createTempDir()
        try {
            java.io.File(dir, "map-layers.json").writeText("""{"on":["go:qline"],"style":"subway"}""")
            val store = MapLayerStore(dir)
            assertEquals(HoodViewChoice.TABLE, store.hoodView)
            assertEquals(MapStyle.SUBWAY, store.style)
        } finally {
            dir.deleteRecursively()
        }
    }

    @Suppress("DEPRECATION")
    private fun createTempDir(): java.io.File =
        java.io.File(System.getProperty("java.io.tmpdir"), "hoodchart-" + System.nanoTime()).also { it.mkdirs() }
}
