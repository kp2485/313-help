// The chart model behind Table | Chart on a neighborhood's year panels (docs/13, 2026-09-22).
//
// These are the web's cases in `apps/web/test/hoodchart.test.ts` and the iPhone's in
// `apps/ios/Tests/HelpCoreTests/HoodChartTests.swift`, ported one for one: the same years, the same counts, the
// same points, segments, markers, axis and sentence. If the three ever disagree, one of the three apps is drawing
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
            "hood.lt5" to "fewer than 5",
            "hood.none_recorded" to "none recorded",
            "hood.so_far" to "{year} so far",
            "hood.chart_bar" to "{year}, {label}: {count}",
            "hood.chart_summary" to "The chart shows each year from {from} to {to}. Most in one year: {most}.",
            "hood.chart_peak" to "{label}, {count} in {year}",
            "hood.chart_peak_none" to "{label}, no year has a number we can show",
            "hood.chart_lt5_note" to "A year with fewer than 5 shows a hollow marker at a fixed height, not a value.",
            "list.sep" to ", ",
        )
        var out = table[key] ?: "MISSING:$key"
        for ((k, v) in p) out = out.replace("{$k}", v)
        out
    }

    // ---- points, segments, markers and blanks ----------------------------------------------------------------

    @Test
    fun `a series becomes points segments markers and blanks and never mixes them up`() {
        val m = hoodChartModel(listOf(one(listOf(n(12), HoodCount.HIDDEN, null, n(24), n(7), n(7)))))
        val s = m.series[0]
        assertEquals(
            listOf(HoodPointKind.VALUE, HoodPointKind.HIDDEN, HoodPointKind.NONE, HoodPointKind.VALUE, HoodPointKind.VALUE, HoodPointKind.VALUE),
            s.points.map { it.kind },
        )
        assertEquals(listOf("2021"), s.markers)
        assertEquals(listOf("2022"), s.blanks)
        assertNull(s.points[1].value)
        assertEquals(HOOD_MARKER_FRACTION, s.points[1].frac, 1e-12)
        // No piece of line crosses the year with nothing recorded; the pieces that touch the hidden one are dotted.
        assertEquals(listOf(0 to true, 3 to false, 4 to false), s.segments.map { it.from to it.dotted })
        assertEquals(listOf(1, 4, 5), s.segments.map { it.to })
    }

    /** The whole point of the marker: there is no path from a hidden count to a value. */
    @Test
    fun `a hidden count is never a value`() {
        val hidden = HoodCount.HIDDEN
        val m = hoodChartModel(listOf(one(listOf(hidden, hidden, hidden, n(40), hidden, hidden))))
        assertEquals(1, m.series[0].points.count { it.kind == HoodPointKind.VALUE })
        assertEquals(5, m.series[0].markers.size)
        for (p in m.series[0].points.filter { it.kind == HoodPointKind.HIDDEN }) {
            assertNull(p.value)
            assertEquals(HOOD_MARKER_FRACTION, p.frac, 1e-12)
        }
        assertEquals(10.0 / 96.0, HOOD_MARKER_FRACTION, 1e-12)
    }

    /** And it can never be lined up against a tick and read as a number. */
    @Test
    fun `a marker always sits below the first tick over zero`() {
        for (counts in listOf(listOf(5, 6, 7), listOf(12, 18, 24, 31, 9), listOf(200, 410, 90), listOf(6, 6, 6), listOf(1, 2, 3))) {
            val m = hoodChartModel(listOf(HoodSeries("x", HoodTone.A, "x",
                counts.mapIndexed { i, c -> HoodChartPoint((2020 + i).toString(), n(c)) })))
            val firstTick = m.ticks.first { it > 0 }
            assertTrue("top ${m.top}", HOOD_MARKER_FRACTION * m.top < firstTick)
        }
    }

    @Test
    fun `the earliest of two equal peaks is named`() {
        val m = hoodChartModel(listOf(one(listOf(n(30), n(12), n(30), null, null, null))))
        assertEquals("2020", m.series[0].peakYear)
        assertEquals(30, m.series[0].peakValue)
    }

    // ---- the axis ---------------------------------------------------------------------------------------------

    @Test
    fun `the axis starts at zero and never labels a value under five`() {
        for (counts in listOf(listOf(5, 6, 7), listOf(12, 3, 18, 24, 31, 9), listOf(200, 410, 90), listOf(1, 1, 2))) {
            val m = hoodChartModel(listOf(HoodSeries("x", HoodTone.A, "x",
                counts.mapIndexed { i, c -> HoodChartPoint((2020 + i).toString(), n(c)) })))
            assertEquals("$counts", 0, m.ticks.first())
            assertTrue("$counts", m.top >= 5)
            assertEquals("$counts", m.top, m.ticks.last())
            for (t in m.ticks) assertTrue("tick $t in $counts", t == 0 || t >= 5)
            for (p in m.series[0].points) assertTrue(p.frac <= 1.0)
        }
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
    fun `an all hidden series has an axis of five`() {
        val m = hoodChartModel(listOf(one(listOf(HoodCount.HIDDEN, HoodCount.HIDDEN, HoodCount.HIDDEN, null, null, null))))
        assertEquals(5, m.top)
        assertEquals(listOf(0, 5), m.ticks)
        assertNull(m.series[0].peakYear)
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
    fun `a chart is offered only for three years with at least one number to draw`() {
        assertTrue(hoodChartable(points(listOf(n(12), n(14), n(16), null, null, null))))
        assertFalse(hoodChartable(points(listOf(n(12), n(14), null, null, null, null))))
        assertFalse(hoodChartable(points(listOf(n(12), null, null, n(14), null, null))))
        assertFalse(hoodChartable(points(listOf(HoodCount.HIDDEN, HoodCount.HIDDEN, HoodCount.HIDDEN, null, null, null))))
        assertTrue(hoodChartable(points(listOf(HoodCount.HIDDEN, HoodCount.HIDDEN, n(7), null, null, null))))
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
    fun `a point says its year its series and its count and never a digit for a hidden one`() {
        val m = hoodChartModel(listOf(one(sales, label = "Homes sold")))
        assertEquals("2020, Homes sold: 12", hoodPointText(m.series[0].points[0], "Homes sold", words))
        assertEquals("2021, Homes sold: 3", hoodPointText(m.series[0].points[1], "Homes sold", words))
        val hid = hoodChartModel(listOf(one(listOf(HoodCount.HIDDEN, HoodCount.HIDDEN, HoodCount.HIDDEN, n(9), null, null), label = "Torn down")))
        assertEquals("2020, Torn down: fewer than 5", hoodPointText(hid.series[0].points[0], "Torn down", words))
        assertEquals("2024, Torn down: none recorded", hoodPointText(hid.series[0].points[4], "Torn down", words))
        val sofar = hoodChartModel(listOf(one(sales, label = "Homes sold", soFar = "2025")))
        assertEquals("2025 so far, Homes sold: 9", hoodPointText(sofar.series[0].points[5], "Homes sold", words))
    }

    @Test
    fun `the summary says what is drawn over which years and that hidden years are not drawn at a value`() {
        val m = hoodChartModel(listOf(one(listOf(HoodCount.HIDDEN, n(12), n(31), null, null, null), label = "Torn down")))
        val s = hoodChartSummary(m, words)
        assertEquals(
            "The chart shows each year from 2020 to 2025. Most in one year: Torn down, 31 in 2022. " +
                "A year with fewer than 5 shows a hollow marker at a fixed height, not a value.",
            s,
        )
        val plain = hoodChartModel(listOf(one(listOf(n(12), n(14), n(16), null, null, null), label = "Homes sold")))
        assertFalse(hoodChartSummary(plain, words).contains("hollow marker"))
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
