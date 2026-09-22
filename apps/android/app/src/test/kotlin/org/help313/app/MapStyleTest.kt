// The two map styles (docs/MAP-STYLE.md), held to the spec's own tables and to the real files in the bundle.
//
// **A case-for-case port of apps/ios/Tests/HelpCoreTests/MapStyleTests.swift**, in the same order, under the same
// names, plus what is Android's own: the 48 dp box, the settled trunk-badge nudge, the map's controls as taken space,
// the text list in both styles, and the `--tr-*` tokens read out of apps/web/src/style.css. Plain numbers
// throughout, so `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs all of it on a plain JDK.
package org.help313.app

import org.help313.query.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.Locale
import kotlin.math.abs
import kotlin.math.hypot

private val repoRoot = File("../../..")
private val transitDir = File(repoRoot, "data/bundle/v1/map/transit")

private fun shipped(name: String): ByteArray {
    val f = File(transitDir, name)
    assumeTrue("no built bundle here (pnpm build:bundle)", f.isFile)
    return f.readBytes()
}

private fun near(want: Double, got: Double, what: String = "", by: Double = 0.0051) =
    assertTrue("$what: wanted $want, got $got", abs(want - got) <= by)

// ---- the choice, and where it is kept ------------------------------------------------------------------------------

class MapStyleChoiceTest {

    @Test
    fun anythingButSubwayIsStandard() {
        assertEquals(MapStyle.STANDARD, mapStyleOf(null))
        assertEquals(MapStyle.STANDARD, mapStyleOf(""))
        assertEquals(MapStyle.STANDARD, mapStyleOf("Subway"))
        assertEquals(MapStyle.STANDARD, mapStyleOf("metro"))
        assertEquals(MapStyle.STANDARD, mapStyleOf("standard"))
        assertEquals(MapStyle.SUBWAY, mapStyleOf("subway"))
    }

    private fun tempDir(): File {
        val d = File(System.getProperty("java.io.tmpdir"), "mapstyle-" + java.util.UUID.randomUUID())
        d.mkdirs()
        d.deleteOnExit()
        return d
    }

    @Test
    fun theStyleIsRememberedInTheSameFileAsTheLayers() {
        val dir = tempDir()
        val first = MapLayerStore(dir)
        assertEquals("standard is the default", MapStyle.STANDARD, first.style)
        assertTrue(first.setStyle(MapStyle.SUBWAY))
        assertTrue(first.toggle("go:qline"))
        val again = MapLayerStore(dir)
        assertEquals(MapStyle.SUBWAY, again.style)
        assertTrue(again.isOn("go:qline"))
        assertTrue(again.setStyle(MapStyle.STANDARD))
        assertEquals(MapStyle.STANDARD, MapLayerStore(dir).style)
        assertEquals("one file, the same one the layer choices are in", listOf("map-layers.json"), dir.list()!!.toList())
        // `{on, style}`, the shape the web and the iPhone keep.
        val j = Json.parse(File(dir, "map-layers.json").readBytes())
        assertEquals("standard", j["style"]?.str)
        assertTrue(j["on"]!!.arr.mapNotNull { it.str }.contains("go:qline"))
    }

    /** Yesterday's file was a bare list of layer ids. It still reads, and the style is then `standard`. */
    @Test
    fun yesterdaysFileStillReads() {
        val dir = tempDir()
        File(dir, "map-layers.json").writeText("""["go:mogo","place:parks"]""")
        val store = MapLayerStore(dir)
        // A file from before the version marker gains the boundaries layer **once**, at the end, and nothing else
        // is touched (docs/MAP-STYLE.md section 15.4). The marker is written back at the same moment, so a person
        // who then switches the boundaries off is never migrated again — the next store reads the list as it is.
        assertEquals(listOf("go:mogo", "place:parks", AREAS_LAYER), store.on)
        assertEquals(MapStyle.STANDARD, store.style)
        store.set(listOf("go:mogo", "place:parks"))
        assertEquals("the migration ran a second time", listOf("go:mogo", "place:parks"), MapLayerStore(dir).on)
    }

    @Test
    fun aStyleNobodyKnowsReadsAsStandard() {
        val dir = tempDir()
        File(dir, "map-layers.json").writeText("""{"v":2,"on":["go:mogo"],"style":"neon"}""")
        val store = MapLayerStore(dir)
        assertEquals(MapStyle.STANDARD, store.style)
        assertEquals(listOf("go:mogo"), store.on)
    }
}

// ---- standard is untouched -----------------------------------------------------------------------------------------

class StandardStyleTest {

    private class Row(val id: String, val color: String, val width: Double, val dash: List<Double>, val ring: Boolean, val dense: Boolean)

    /** Section 2 of the spec, written out. If this table moves, `standard` has changed, and it must not. */
    private val table = listOf(
        Row("ddot_routes", "bus", 3.2, emptyList(), false, false), Row("ddot_stops", "bus", 5.0, emptyList(), false, true),
        Row("smart_routes", "smart", 2.8, listOf(3.0, 2.0), false, false), Row("smart_stops", "smart", 5.0, emptyList(), false, true),
        Row("qline", "rail", 4.0, emptyList(), true, false), Row("people_mover", "rail", 3.4, emptyList(), true, false),
        Row("mogo", "bike", 5.0, emptyList(), true, false), Row("bike_lanes", "bike", 2.4, emptyList(), false, false),
        Row("stations", "rail", 5.0, emptyList(), true, false), Row("intercity_bus", "rail", 2.6, listOf(5.0, 3.0), true, false),
        Row("park_ride", "smart", 5.0, emptyList(), true, false),
    )

    @Test
    fun theStandardTableIsWhatItWas() {
        assertEquals(table.size, mapLayerStyles.size)
        for (t in table) {
            assertEquals(t.id, MapLayerStyle(t.color, t.width, t.dash, t.ring, t.dense), mapLayerStyle("go:" + t.id))
            // Asked for in `subway`, the table answers the same: it is what a layer falls back to without its file.
            assertEquals(t.id, mapLayerStyle("go:" + t.id), mapLayerStyle("go:" + t.id, MapStyle.SUBWAY))
        }
    }

    /**
     * The resolver's `standard` answer is the old table and the old two functions — whatever route, band, colour
     * scheme or contrast setting it is handed. It reads none of them.
     */
    @Test
    fun theStandardResolverIsTheOldDrawingAndReadsNothingElse() {
        val route = NetRoute("rt_x", "4", "Woodward", 3, frequent = true)
        for (t in table) {
            for (mpp in listOf(0.6, 3.0, 6.0, 11.9, 12.0, 12.1, 18.0, 30.0, 45.0, 90.0)) {
                val s = mapLayerStyle("go:" + t.id)
                val want = ResolvedTransit.Standard(
                    StandardDrawing(
                        s, maxOf(1.6, minOf(t.width, t.width * 18 / mpp)),
                        if (t.dense) (if (mpp > 12) 0.0 else maxOf(2.0, minOf(4.0, 30 / mpp))) else maxOf(3.5, minOf(6.5, 45 / mpp)),
                    ),
                )
                for (r in listOf(null, route)) for (scheme in MapScheme.values()) for (more in listOf(false, true)) for (band in ZoomBand.values()) {
                    assertEquals("${t.id} at $mpp", want, resolveTransitStyle(TransitStyleInput(MapStyle.STANDARD, t.id, r, mpp, band, scheme, more)))
                }
            }
        }
    }

    /** `standard` never asks for a network file, whatever is switched on or selected. */
    @Test
    fun standardNeverAsksForANetFile() {
        val available = mapOf(
            "ddot_routes" to "map/transit/ddot_routes.net.json", "ddot_stops" to "map/transit/ddot_stops.net.json",
            "qline" to "map/transit/qline.net.json",
        )
        val everything = available.keys.map { "go:$it" }
        assertTrue(netFilesWanted(MapStyle.STANDARD, everything, available).isEmpty())
        assertTrue(netFilesWanted(MapStyle.STANDARD, everything, available, "ddot_stops").isEmpty())
        assertEquals(mapOf("qline" to "map/transit/qline.net.json"), netFilesWanted(MapStyle.SUBWAY, listOf("go:qline"), available))
        assertEquals(2, netFilesWanted(MapStyle.SUBWAY, listOf("go:ddot_routes"), available, "ddot_stops").size)
        assertTrue("an old bundle has nothing to ask for", netFilesWanted(MapStyle.SUBWAY, everything, emptyMap()).isEmpty())
    }

    @Test
    fun theBasemapIsQuietOnlyInSubwayAndNeverWithHighContrast() {
        assertEquals(BasemapKind.NORMAL, basemapTokens(MapStyle.STANDARD, true, false))
        assertEquals(BasemapKind.NORMAL, basemapTokens(MapStyle.SUBWAY, false, false))
        assertEquals(BasemapKind.QUIET, basemapTokens(MapStyle.SUBWAY, true, false))
        assertEquals(BasemapKind.NORMAL, basemapTokens(MapStyle.SUBWAY, true, true))
        // Quiet streets: × 0.8, never under one dp.
        near(1.0, mapQuietStreetWidth(4, 20.0), by = 1e-9)
        near(6.5 * 0.8, mapQuietStreetWidth(1, 2.0), by = 1e-9)
    }
}

// ---- zoom bands ------------------------------------------------------------------------------------------------------

class ZoomBandTest {

    @Test
    fun theEdgesAreThirtyAndTwelve() {
        assertEquals(ZoomBand.FAR, zoomBand(90.0))
        assertEquals(ZoomBand.FAR, zoomBand(30.01))
        assertEquals(ZoomBand.MID, zoomBand(30.0))
        assertEquals(ZoomBand.MID, zoomBand(12.01))
        assertEquals("12 is where standard's dense stops appear", ZoomBand.NEAR, zoomBand(12.0))
        assertEquals(ZoomBand.NEAR, zoomBand(0.6))
    }

    @Test
    fun aBandChangesOnlyFivePercentPastAnEdge() {
        assertEquals(ZoomBand.MID, zoomBand(31.0, ZoomBand.MID))
        assertEquals(ZoomBand.FAR, zoomBand(31.6, ZoomBand.MID))
        assertEquals(ZoomBand.FAR, zoomBand(29.0, ZoomBand.FAR))
        assertEquals(ZoomBand.MID, zoomBand(28.4, ZoomBand.FAR))
        assertEquals(ZoomBand.NEAR, zoomBand(12.5, ZoomBand.NEAR))
        assertEquals(ZoomBand.MID, zoomBand(12.7, ZoomBand.NEAR))
        assertEquals(ZoomBand.MID, zoomBand(11.5, ZoomBand.MID))
        assertEquals(ZoomBand.NEAR, zoomBand(11.3, ZoomBand.MID))
        assertEquals("a jump across two bands lands where it should", ZoomBand.NEAR, zoomBand(5.0, ZoomBand.FAR))
        assertEquals(ZoomBand.FAR, zoomBand(60.0, ZoomBand.NEAR))
    }

    @Test
    fun aPinchHoveringOnAnEdgeDoesNotFlicker() {
        var band = zoomBand(29.0)
        var changes = 0
        for (i in 0 until 40) {
            val next = zoomBand(if (i % 2 == 0) 30.4 else 29.6, band)
            if (next != band) { changes++; band = next }
        }
        assertEquals(0, changes)
    }

    /** The path cache's ladder: a step of at most 15 % (docs/MAP-STYLE.md section 6), and exact on a step. */
    @Test
    fun theScaleLadderStepsByLessThanFifteenPercent() {
        for (b in listOf(60, 80, 100, 139)) {
            val step = subwayBucketScale(b + 1) / subwayBucketScale(b)
            assertTrue(step > 1 && step <= 1.15)
            assertEquals(b, subwayScaleBucket(subwayBucketScale(b)))
        }
        // Everything between two steps draws from the nearer one, so what is left for the canvas matrix is within 4.5 %.
        var s = MapCamera.MIN_SCALE
        while (s < MapCamera.MAX_SCALE) {
            val k = s / subwayBucketScale(subwayScaleBucket(s))
            assertTrue("$s", k > 1 / 1.045 && k < 1.045)
            s *= 1.013
        }
    }
}

// ---- the palette, measured ---------------------------------------------------------------------------------------------

class TransitPaletteTest {

    private class Spec(val token: TransitToken, val light: String, val lightRatios: List<Double>, val dark: String, val darkRatios: List<Double>)

    /** docs/MAP-STYLE.md table 4.1, as printed: light hex, vs land / park / casing, then dark the same. */
    private val spec = listOf(
        Spec(TransitToken.TR0, "#c8102e", listOf(5.56, 4.25, 5.88), "#ff7a70", listOf(6.67, 4.85, 7.52)),
        Spec(TransitToken.TR1, "#1d4ed8", listOf(6.33, 4.84, 6.70), "#7aa7ff", listOf(7.10, 5.16, 8.00)),
        Spec(TransitToken.TR2, "#0f766e", listOf(5.17, 3.96, 5.47), "#4fd1c5", listOf(9.08, 6.61, 10.24)),
        Spec(TransitToken.TR3, "#8a4b14", listOf(6.40, 4.90, 6.78), "#e0a96d", listOf(8.12, 5.91, 9.16)),
        Spec(TransitToken.TR4, "#be185d", listOf(5.70, 4.36, 6.04), "#ff8ac2", listOf(7.80, 5.67, 8.79)),
        Spec(TransitToken.TR5, "#475569", listOf(7.16, 5.48, 7.58), "#b6c2d2", listOf(9.39, 6.83, 10.58)),
        Spec(TransitToken.RAIL, "#1f2937", listOf(13.87, 10.61, 14.68), "#eef2f6", listOf(15.06, 10.95, 16.98)),
        Spec(TransitToken.DPM, "#86198f", listOf(7.78, 5.95, 8.24), "#e59bf0", listOf(8.29, 6.03, 9.35)),
        Spec(TransitToken.TRUNK, "#334155", listOf(9.78, 7.48, 10.35), "#cbd5e1", listOf(11.41, 8.30, 12.87)),
        Spec(TransitToken.BIKE, "#15803d", listOf(4.74, 3.63, 5.02), "#6ee7a0", listOf(10.97, 7.98, 12.37)),
        Spec(TransitToken.COACH, "#7c2d12", listOf(8.85, 6.77, 9.37), "#fdba74", listOf(10.04, 7.31, 11.33)),
        Spec(TransitToken.PR, "#1e40af", listOf(8.24, 6.30, 8.72), "#93b4ff", listOf(8.24, 5.99, 9.29)),
        Spec(TransitToken.RING, "#1b2a22", listOf(14.16, 10.83, 14.99), "#eef5f0", listOf(15.29, 11.12, 17.24)),
    )

    @Test
    fun contrastIsTheWCAGFormula() {
        near(21.0, RGB.contrast(RGB(0x000000), RGB(0xFFFFFF)), by = 1e-9)
        near(1.0, RGB.contrast(RGB(0x777777), RGB(0x777777)), by = 1e-9)
        assertEquals("#1d4ed8", RGB(0x1D4ED8).hex)
        assertEquals(0xFF1D4ED8.toInt(), RGB(0x1D4ED8).argb)
    }

    @Test
    fun everyRatioInTheSpecsTableIsTheRatioOfThePalette() {
        var checked = 0
        for (s in spec) {
            for ((scheme, hex, want) in listOf(Triple(MapScheme.LIGHT, s.light, s.lightRatios), Triple(MapScheme.DARK, s.dark, s.darkRatios))) {
                val c = TransitPalette.color(s.token, scheme)
                assertEquals("${s.token} $scheme", hex, c.hex)
                val against = listOf(TransitPalette.land(scheme), TransitPalette.park(scheme), TransitPalette.casing(scheme))
                for ((bg, w) in against.zip(want)) {
                    val got = RGB.contrast(c, bg)
                    near(w, got, "${s.token} $scheme on ${bg.hex}")
                    assertTrue("the floor is 3:1 everywhere", got >= 3)
                    checked++
                }
            }
        }
        assertEquals(78, checked)
        // The fill is the casing on purpose; a station is read by its ring. `--tr-sel` is the ring colour.
        for (s in MapScheme.values()) {
            assertEquals(TransitPalette.casing(s), TransitPalette.color(TransitToken.FILL, s))
            assertEquals(TransitPalette.color(TransitToken.RING, s), TransitPalette.color(TransitToken.SEL, s))
        }
    }

    @Test
    fun highContrastTonesAreTheSpecs() {
        class More(val token: TransitToken, val light: String, val lr: Double, val dark: String, val dr: Double)
        val more = listOf(
            More(TransitToken.TR0, "#9b0c23", 8.50, "#ffa099", 9.49), More(TransitToken.TR1, "#1e3a8a", 10.36, "#a8c5ff", 10.69),
            More(TransitToken.TR2, "#0b4f4a", 9.41, "#8be6dd", 12.78), More(TransitToken.TR3, "#5f330d", 10.68, "#f0c596", 11.60),
            More(TransitToken.TR4, "#831843", 9.65, "#ffb3d7", 11.21), More(TransitToken.TR5, "#1e293b", 14.63, "#dbe3ee", 14.35),
            More(TransitToken.DPM, "#581c5f", 12.03, "#f0c0f7", 12.01), More(TransitToken.BIKE, "#14532d", 9.11, "#a7f3c5", 14.38),
        )
        for (m in more) {
            val l = TransitPalette.color(m.token, MapScheme.LIGHT, true)
            val d = TransitPalette.color(m.token, MapScheme.DARK, true)
            assertEquals(m.light, l.hex); assertEquals(m.dark, d.hex)
            near(m.lr, RGB.contrast(l, TransitPalette.landMoreContrast(MapScheme.LIGHT)), "${m.token}")
            near(m.dr, RGB.contrast(d, TransitPalette.landMoreContrast(MapScheme.DARK)), "${m.token}")
        }
        // "Others keep their values (all already ≥ 8)".
        for (token in listOf(TransitToken.RAIL, TransitToken.TRUNK, TransitToken.COACH, TransitToken.PR, TransitToken.RING)) {
            for (s in MapScheme.values()) {
                assertEquals(TransitPalette.color(token, s), TransitPalette.color(token, s, true))
                assertTrue(RGB.contrast(TransitPalette.color(token, s), TransitPalette.landMoreContrast(s)) >= 8)
            }
        }
    }

    @Test
    fun theQuietBasemapKeepsEveryStreetLegal() {
        val l = QuietBasemap.tokens(MapScheme.LIGHT)
        val d = QuietBasemap.tokens(MapScheme.DARK)
        val landL = TransitPalette.land(MapScheme.LIGHT)
        val landD = TransitPalette.land(MapScheme.DARK)
        val caseL = TransitPalette.casing(MapScheme.LIGHT)
        val caseD = TransitPalette.casing(MapScheme.DARK)
        val rows = listOf(
            Triple(l.road, landL, 3.36), Triple(d.road, landD, 3.49), Triple(l.main, landL, 3.55), Triple(d.main, landD, 3.81),
            Triple(l.freeway, landL, 3.39), Triple(d.freeway, landD, 3.50),
            // … and against the quiet PARK as well (2.78 / 2.81 / 2.75 / 2.81 before the road tokens moved, 2026-09-21).
            Triple(l.road, l.park, 3.05), Triple(l.main, l.park, 3.21), Triple(l.freeway, l.park, 3.07),
            Triple(d.road, d.park, 3.05), Triple(d.main, d.park, 3.32), Triple(d.freeway, d.park, 3.06),
            Triple(l.ink, landL, 5.60), Triple(d.ink, landD, 7.66), Triple(l.parkInk, l.park, 5.26), Triple(d.parkInk, d.park, 6.18),
            // The casing is what separates a line from a street, all the way along.
            Triple(caseL, l.road, 3.56), Triple(caseL, l.main, 3.75), Triple(caseL, l.freeway, 3.59),
            Triple(caseD, d.road, 3.93), Triple(caseD, d.main, 4.29), Triple(caseD, d.freeway, 3.95),
        )
        for ((a, b, want) in rows) {
            near(want, RGB.contrast(a, b), "${a.hex} on ${b.hex}")
            assertTrue("${a.hex} on ${b.hex}", RGB.contrast(a, b) >= 3)
        }
        assertEquals(22, rows.size)
        // "Every transit token is ≥ 4.29 against --map-park-q (light) and ≥ 5.82 (dark)."
        val tokens = TransitToken.values().filter { it != TransitToken.FILL }
        near(4.29, tokens.minOf { RGB.contrast(TransitPalette.color(it, MapScheme.LIGHT), l.park) })
        near(5.82, tokens.minOf { RGB.contrast(TransitPalette.color(it, MapScheme.DARK), d.park) })
    }

    @Test
    fun badgeWordsAreReadableOnEveryTone() {
        val tones = listOf(
            TransitToken.TR0, TransitToken.TR1, TransitToken.TR2, TransitToken.TR3, TransitToken.TR4, TransitToken.TR5,
            TransitToken.RAIL, TransitToken.DPM, TransitToken.TRUNK,
        )
        for (s in MapScheme.values()) for (t in tones) for (more in listOf(false, true)) {
            assertTrue("$t $s", RGB.contrast(TransitPalette.badgeText(s), TransitPalette.color(t, s, more)) >= 4.5)
        }
        near(5.47, RGB.contrast(TransitPalette.badgeText(MapScheme.LIGHT), TransitPalette.color(TransitToken.TR2, MapScheme.LIGHT)))
        near(7.52, RGB.contrast(TransitPalette.badgeText(MapScheme.DARK), TransitPalette.color(TransitToken.TR0, MapScheme.DARK)))
    }
}

// ---- the tokens are the web's, to the digit ----------------------------------------------------------------------------

class StyleSheetTest {

    /** `--token:#rrggbb` pairs of one block of apps/web/src/style.css; the first value in the block wins. */
    private fun tokens(css: String, from: String, to: String): Map<String, String> {
        val a = css.indexOf(from)
        val b = if (a < 0) -1 else css.indexOf(to, a + from.length)
        if (a < 0 || b < 0) return emptyMap()
        val out = LinkedHashMap<String, String>()
        for (m in Regex("(--[a-z0-9-]+):\\s*(#[0-9a-fA-F]{6})\\b").findAll(css.substring(a + from.length, b))) {
            out.putIfAbsent(m.groupValues[1], m.groupValues[2].lowercase())
        }
        return out
    }

    private val css: String by lazy { File(repoRoot, "apps/web/src/style.css").readText() }
    private val light by lazy { tokens(css, ":root {", "@media (prefers-color-scheme: dark)") }
    private val dark by lazy { tokens(css, "@media (prefers-color-scheme: dark)", ".mapbox") }
    private val moreLight by lazy { tokens(css, "@media (prefers-contrast: more) {", "@media (prefers-contrast: more) and") }
    private val moreDark by lazy { tokens(css, "@media (prefers-contrast: more) and (prefers-color-scheme: dark)", "@media (forced-colors: active)") }

    /**
     * Every `--tr-*` token, in all four values, and the six quiet-basemap tokens in both themes. The test PARSES the
     * web's own stylesheet, so a colour changed there and not here — or here and not there — fails the build.
     */
    @Test
    fun everySubwayTokenIsTheWebsInAllFourVariants() {
        assertEquals("the block was found", "#c8102e", light["--tr-0"])
        assertEquals("#ff7a70", dark["--tr-0"])
        assertEquals("#9b0c23", moreLight["--tr-0"])
        assertEquals("#ffa099", moreDark["--tr-0"])
        var checked = 0
        for (t in TransitToken.values()) {
            assertNotNull("${t.css} is not in style.css", light[t.css])
            assertEquals("${t.css} light", light[t.css], TransitPalette.color(t, MapScheme.LIGHT).hex)
            assertEquals("${t.css} dark", dark[t.css], TransitPalette.color(t, MapScheme.DARK).hex)
            assertEquals("${t.css} light, more contrast", moreLight[t.css] ?: light[t.css], TransitPalette.color(t, MapScheme.LIGHT, true).hex)
            assertEquals("${t.css} dark, more contrast", moreDark[t.css] ?: dark[t.css], TransitPalette.color(t, MapScheme.DARK, true).hex)
            checked += 4
        }
        // And the other way: a `--tr-*` token the web has and this app does not is a token somebody forgot.
        for (name in light.keys.filter { it.startsWith("--tr-") }) assertTrue(name, TransitToken.values().any { it.css == name })
        for ((scheme, block) in listOf(MapScheme.LIGHT to light, MapScheme.DARK to dark)) {
            for ((name, colour) in QuietBasemap.tokens(scheme).css) {
                assertEquals("$name $scheme", block[name], colour.hex)
                checked++
            }
            assertEquals(6, block.keys.count { it.endsWith("-q") })
        }
        assertEquals(15 * 4 + 12, checked)
        // The grounds the subway ratios are measured against are the web's own tokens.
        for ((scheme, block, more) in listOf(Triple(MapScheme.LIGHT, light, moreLight), Triple(MapScheme.DARK, dark, moreDark))) {
            assertEquals(block["--map-land"], TransitPalette.land(scheme).hex)
            assertEquals(block["--map-park"], TransitPalette.park(scheme).hex)
            assertEquals(block["--gw-case"], TransitPalette.casing(scheme).hex)
            assertEquals(more["--map-land"], TransitPalette.landMoreContrast(scheme).hex)
        }
    }

    /**
     * `standard` draws with Android resources, not with numbers in Kotlin: res/values/colors.xml by day and
     * values-night by night. They are held to the same stylesheet, so the two styles share one source of truth.
     */
    @Test
    fun theStandardMapColoursInTheResourcesAreTheWebsToo() {
        fun resources(path: String): Map<String, String> =
            Regex("<color name=\"([a-z_0-9]+)\">(#[0-9A-Fa-f]{6})</color>").findAll(File(path).readText())
                .associate { it.groupValues[1] to it.groupValues[2].lowercase() }
        val day = resources("../app/src/main/res/values/colors.xml")
        val night = resources("../app/src/main/res/values-night/colors.xml")
        val names = listOf(
            "map_out", "map_out_ink", "map_land", "map_park", "map_park_ink", "map_road", "map_main", "map_fwy", "map_ink",
            "gw_open", "gw_build", "gw_fund", "gw_plan", "gw_case", "lyr_bus", "lyr_smart", "lyr_rail", "lyr_bike",
        )
        for (n in names) {
            val token = "--" + n.replace('_', '-')
            assertEquals("$token light", light[token], day[n])
            assertEquals("$token dark", dark[token], night[n])
        }
    }
}

// ---- the subway resolver -------------------------------------------------------------------------------------------------

class SubwayStyleTest {

    private fun subway(layer: String, route: NetRoute? = null, band: ZoomBand, more: Boolean = false, scheme: MapScheme = MapScheme.LIGHT): SubwayDrawing {
        val r = resolveTransitStyle(TransitStyleInput(MapStyle.SUBWAY, layer, route, 10.0, band, scheme, more))
        if (r !is ResolvedTransit.Subway) fail("not a subway drawing")
        return (r as ResolvedTransit.Subway).drawing
    }

    private val woodward = NetRoute("rt_ddot_4", "4", "Woodward", 3, frequent = true, headway = 12)
    private val vernor = NetRoute("rt_ddot_1", "1", "Vernor", 0)
    private val fast = NetRoute("rt_smart_461", "461", "FAST Woodward", 1, color = "#ce2a2a", frequent = true)

    @Test
    fun widthsAreTable71() {
        val want = listOf(
            SubwayLineKind.BUS_FREQUENT to listOf(3.5, 5.0, 6.0), SubwayLineKind.BUS_LOCAL to listOf(2.5, 3.5, 4.5),
            SubwayLineKind.RAIL to listOf(4.5, 6.0, 7.0), SubwayLineKind.TRUNK to listOf(5.5, 8.0, 10.0),
        )
        for ((kind, w) in want) assertEquals(w, ZoomBand.values().map { subwayLineWidth(kind, it) })
        assertEquals(listOf(2.0, 3.0, 4.0), ZoomBand.values().map { subwayCasing(it) })
        assertEquals(listOf(3.0, 4.0, 5.0), ZoomBand.values().map { subwayCasing(it, true) })
        assertEquals("far: every off is read as 0", listOf(0.0, 6.5, 8.0), ZoomBand.values().map { subwayStep(it) })
        assertEquals(listOf(6.0, 10.0, 14.0), ZoomBand.values().map { subwayCornerRadius(it) })
        assertEquals(listOf(30.0, 10.0, 0.0), ZoomBand.values().map { subwaySimplifyMeters(it) })
        assertEquals(listOf(8000.0, 3000.0, 1200.0), ZoomBand.values().map { subwayBadgeSpacingMeters(it) })
        // 7.4: pills 9 / 11 and 12 / 14, rings 2 and 2.5; terminal rings r 6 / 7.5, ring 3; high contrast + 0.5.
        assertEquals(listOf(9.0, 9.0, 11.0), ZoomBand.values().map { subwayPillHeight(false, it) })
        assertEquals(listOf(12.0, 12.0, 14.0), ZoomBand.values().map { subwayPillHeight(true, it) })
        assertEquals(listOf(2.0, 2.5, 2.5, 3.0), listOf(subwayPillRing(false, false), subwayPillRing(false, true), subwayPillRing(true, false), subwayPillRing(true, true)))
        assertEquals(listOf(6.0, 6.0, 7.5), ZoomBand.values().map { subwayTerminalRadius(it) })
        assertEquals(listOf(3.0, 3.5), listOf(subwayTerminalRing(false), subwayTerminalRing(true)))
    }

    @Test
    fun aBusRouteWearsTheToneTheDataGivesItNotTheAgencysColour() {
        val d = subway("ddot_routes", woodward, ZoomBand.MID)
        assertEquals(TransitToken.TR3, d.stroke)
        assertEquals("#8a4b14", d.strokeRGB?.hex)
        assertEquals(5.0, d.width, 0.0); assertEquals(TransitToken.FILL, d.casing); assertEquals(8.0, d.casingWidth, 0.0)
        assertNull("DDOT is a solid line", d.inlay)
        assertEquals(3.5, subway("ddot_routes", vernor, ZoomBand.MID).width, 0.0)
        assertEquals(TransitToken.TR0, subway("ddot_routes", vernor, ZoomBand.MID).stroke)
        // SMART publishes #ce2a2a for this route; it is carried and not drawn.
        assertEquals("#1d4ed8", subway("smart_routes", fast, ZoomBand.MID).strokeRGB?.hex)
        assertEquals("#e0a96d", subway("ddot_routes", woodward, ZoomBand.MID, scheme = MapScheme.DARK).strokeRGB?.hex)
        assertEquals("#5f330d", subway("ddot_routes", woodward, ZoomBand.MID, more = true).strokeRGB?.hex)
        assertEquals("high contrast: casing + 1", 9.0, subway("ddot_routes", woodward, ZoomBand.MID, more = true).casingWidth, 0.0)
    }

    /** Every system differs by shape as well as by colour (WCAG 1.4.1). */
    @Test
    fun everySystemHasAShapeOfItsOwn() {
        assertEquals(TransitInlay.Stripe(5.0 / 3), subway("smart_routes", fast, ZoomBand.MID).inlay)
        assertNull("at far SMART is solid", subway("smart_routes", fast, ZoomBand.FAR).inlay)
        assertEquals(TransitInlay.Ties(3.0, listOf(1.2 * 6, 1.8 * 6)), subway("qline", null, ZoomBand.MID).inlay)
        assertEquals(TransitInlay.Ties(1.5, listOf(1.2 * 4.5, 1.8 * 4.5)), subway("qline", null, ZoomBand.FAR).inlay)
        assertEquals(TransitInlay.Chevrons(90.0, 5.0, 1.75), subway("people_mover", null, ZoomBand.MID).inlay)
        assertEquals(TransitInlay.Chevrons(120.0, 5.0, 1.75), subway("people_mover", null, ZoomBand.NEAR).inlay)
        assertNull(subway("people_mover", null, ZoomBand.FAR).inlay)
        assertEquals(TransitInlay.DoubleLine(2.0), subway("bike_lanes", null, ZoomBand.MID).inlay)
        assertEquals(1.5, subway("bike_lanes", null, ZoomBand.NEAR).width, 0.0)
        assertNull("one 1.5 dp line at far", subway("bike_lanes", null, ZoomBand.FAR).inlay)
        assertNull("bike lanes have no casing", subway("bike_lanes", null, ZoomBand.MID).casing)
        assertNull("and are never badged", subway("bike_lanes", null, ZoomBand.MID).badge)
    }

    @Test
    fun markers() {
        assertEquals(TransitMarker.Dock(9.0, 2.5, 1.5, 1.5), subway("mogo", null, ZoomBand.MID).marker)
        assertEquals(TransitMarker.Dock(11.0, 2.5, 1.5, 1.5), subway("mogo", null, ZoomBand.NEAR).marker)
        assertEquals(TransitMarker.RailStation(13.0, 1.5, 2.5, 7.0, 2.0), subway("stations", null, ZoomBand.NEAR).marker)
        assertEquals(TransitMarker.Coach(10.0, 2.0, listOf(3.0, 2.0)), subway("intercity_bus", null, ZoomBand.MID).marker)
        assertEquals(TransitMarker.Parking(14.0, 3.0, 10.0), subway("park_ride", null, ZoomBand.MID).marker)
        assertEquals(TransitMarker.Station(3.0, 1.5), subway("ddot_stops", null, ZoomBand.NEAR).marker)
        assertEquals(ZoomBand.NEAR, subway("ddot_stops", null, ZoomBand.NEAR).markerFrom)
        assertEquals(TransitMarker.Station(4.5, 2.0), subway("qline", null, ZoomBand.MID).marker)
        assertEquals("high contrast: rings + 0.5", TransitMarker.Station(4.5, 2.5), subway("qline", null, ZoomBand.MID, more = true).marker)
        assertEquals(TransitToken.RAIL, subway("stations", null, ZoomBand.MID).stroke)
        assertEquals(TransitToken.COACH, subway("intercity_bus", null, ZoomBand.MID).stroke)
        assertEquals(TransitToken.PR, subway("park_ride", null, ZoomBand.MID).stroke)
        assertEquals(TransitToken.BIKE, subway("mogo", null, ZoomBand.MID).stroke)
    }

    @Test
    fun badges() {
        assertEquals(TransitBadge("4", TransitToken.TR3, 16.0, 11.0), subway("ddot_routes", woodward, ZoomBand.MID).badge)
        assertEquals(TransitBadge("4", TransitToken.TR3, 18.0, 12.0), subway("ddot_routes", woodward, ZoomBand.NEAR).badge)
        assertEquals("461", subway("smart_routes", fast, ZoomBand.MID).badge?.text)
        assertEquals("FAST 461", subway("smart_routes", fast, ZoomBand.NEAR).badge?.text)
        // Far: rail and frequent routes only.
        assertTrue(subway("ddot_routes", woodward, ZoomBand.FAR).badgeShown)
        assertFalse(subway("ddot_routes", vernor, ZoomBand.FAR).badgeShown)
        assertTrue(subway("ddot_routes", vernor, ZoomBand.MID).badgeShown)
        val q = NetRoute("rt_qline", "QLINE", "QLINE", 0, derived = true)
        assertTrue(subway("qline", q, ZoomBand.FAR).badgeShown)
        assertEquals(TransitToken.RAIL, subway("qline", q, ZoomBand.FAR).badge?.fill)
        assertEquals("QLINE", q.label)
        assertEquals("4 Woodward", woodward.label)
        assertEquals("Crosstown ", badgeText("ddot_routes", NetRoute("x", "", "Crosstown Express", 0), ZoomBand.MID))
        assertEquals("3 · 4 · 16", trunkBadgeText(listOf("3", "4", "16")))
        assertEquals("3 · 4 · 16 · 23 · 29 · 42 +7", trunkBadgeText(listOf("3", "4", "16", "23", "29", "42", "5", "6", "7", "8", "9", "10", "11")))
        assertEquals("never narrower than it is tall", 16.0, badgeWidth(6.0, 16.0), 0.0)
        assertEquals(40.0, badgeWidth(30.0, 16.0), 0.0)
        assertEquals(1.0, subwayTextScale(0.8), 0.0); assertEquals(1.3, subwayTextScale(1.3), 0.0); assertEquals(1.5, subwayTextScale(3.0), 0.0)
    }

    @Test
    fun whatIsDrawnAtWhichZoom() {
        val far = stationsFor(ZoomBand.FAR, 60.0, true)
        assertTrue(far.hubs)
        assertFalse(far.terminals || far.railStations || far.markers || far.stops || far.selectedStops)
        assertEquals(0, far.interchangeMinRoutes)
        val mid = stationsFor(ZoomBand.MID, 20.0, false)
        assertTrue(mid.terminals && mid.railStations && mid.markers)
        assertEquals(3, mid.interchangeMinRoutes)
        assertFalse(mid.stops || mid.selectedStops || mid.terminalNames)
        assertTrue(stationsFor(ZoomBand.MID, 20.0, true).selectedStops)
        val near = stationsFor(ZoomBand.NEAR, 8.0, false)
        assertEquals(2, near.interchangeMinRoutes)
        assertTrue(near.stops && near.terminalNames)
        assertFalse(near.railStationNames)
        assertTrue(stationsFor(ZoomBand.NEAR, 6.0, false).railStationNames)
        assertEquals(listOf(24, 12, 400, 120, 40), listOf(SUBWAY_BADGE_CAP, SUBWAY_NAME_CAP, SUBWAY_STOP_CAP, SUBWAY_PILL_CAP, SUBWAY_FEATURE_CAP))
    }
}

// ---- the real files --------------------------------------------------------------------------------------------------------

class NetFileTest {

    @Test
    fun theShippedNetworksDecode() {
        val ddot = NetFileDecoder.net(shipped("ddot_routes.net.json"))
        assertEquals("ddot", ddot.system); assertEquals("DDOT", ddot.agency); assertEquals("ddot_stops", ddot.stopsLayer)
        assertTrue(ddot.routes.size >= 30)
        assertEquals("frequent is the City's own weekday figure", listOf("3", "4", "9"), ddot.routes.filter { it.frequent }.map { it.short })
        assertEquals("4 Woodward", ddot.routes.first { it.short == "4" }.label)
        assertTrue(ddot.routes.all { it.tone in 0..5 && it.id.startsWith("rt_ddot_") })
        assertTrue("DDOT publishes no colours", ddot.routes.all { it.color == null })
        assertTrue(ddot.trunks.isNotEmpty()); assertTrue(ddot.interchanges.isNotEmpty())
        assertNull(ddot.serves)

        val smart = NetFileDecoder.net(shipped("smart_routes.net.json"))
        assertEquals(setOf("261", "461", "462", "561"), smart.routes.filter { it.frequent }.map { it.short }.toSet())
        assertNotNull("SMART's colours are carried (and not drawn)", smart.routes.first().color)
        assertEquals("https://smartbus.org", smart.agencyUrl)

        val qline = NetFileDecoder.net(shipped("qline.net.json"))
        assertEquals(listOf("rt_qline"), qline.routes.map { it.id })
        assertTrue("the QLINE line is a drawing through its stations, and says so", qline.routes[0].derived)
        assertEquals(2, qline.routes[0].ends.size)
        assertEquals(20, qline.serves?.size)

        val dpm = NetFileDecoder.net(shipped("people_mover.net.json"))
        assertTrue(dpm.routes[0].loop); assertTrue("a loop has no terminals", dpm.routes[0].ends.isEmpty())
        val loop = dpm.lines.first().points
        assertEquals(loop[0], loop[loop.size - 2], 0.0); assertEquals(loop[1], loop[loop.size - 1], 0.0)

        for (net in listOf(ddot, smart, qline, dpm)) {
            for ((i, r) in net.routes.withIndex()) {
                assertTrue(r.id, r.lines.isNotEmpty())
                for (l in r.lines) assertEquals(i, net.lines[l].route)
            }
            for (l in net.lines) {
                assertTrue(l.points.size >= 4)
                assertEquals(0, l.runs.first().from)
                assertEquals(l.runs.map { it.from }.sorted(), l.runs.map { it.from })
                assertTrue(l.runs.last().from < l.points.size / 2)
                for (r in l.runs) assertTrue("off is −3…3 half-steps, 0 on a trunk", if (r.isTrunk) r.off == 0 else abs(r.off) <= 3)
                // Inside the service area's box, give or take the suburbs SMART reaches.
                assertTrue(MapProjection.lat(l.box.centerY) in 41.9..42.9)
                assertTrue(MapProjection.lon(l.box.centerX) in -83.8..-82.6)
            }
            for (c in net.interchanges) {
                assertTrue(c.routes.size >= 2)
                assertTrue("a pill is a crossing, not a street", hypot(c.ax - c.bx, c.ay - c.by) * MapProjection.METERS_PER_UNIT < 400)
            }
            for (t in net.trunks) assertTrue(t.routes.size > 4)
        }
    }

    /** Rail network files have no points of their own: the stations are the STANDARD layer's, and `serves` indexes them. */
    @Test
    fun railStationsComeFromTheStandardLayerAndTheQLinesComeInPairs() {
        for (layer in listOf("qline", "people_mover")) {
            val raw = Json.parse(shipped("$layer.net.json"))
            assertTrue("$layer.net.json carries no points", raw["points"]!!.arr.isEmpty())
            val net = NetFileDecoder.net(shipped("$layer.net.json"))
            val stations = MapFileDecoder.layer(shipped("$layer.json")).points
            assertEquals(stations.size, net.serves!!.size)
            assertTrue(net.routes[0].stops.flatten().all { it in stations.indices })
        }
        // The QLINE lists each station twice — two platforms, one name: both circles are drawn, the name printed once.
        val names = MapFileDecoder.layer(shipped("qline.json")).points.map { it.name }
        val first = firstOfEachName(names)
        assertEquals(20, names.size)
        assertTrue(names.toSet().size < names.size)
        assertEquals(names.toSet().size, first.count { it })
        assertEquals(listOf(true, false, true, false), firstOfEachName(listOf("A", "A", "B", "")))
    }

    @Test
    fun theStopsFilesAgreeWithTheirStopsLayersAndTheirRoutes() {
        for (system in listOf("ddot", "smart")) {
            val serves = NetFileDecoder.netServes(shipped("${system}_stops.net.json"))
            val layer = MapFileDecoder.layer(shipped("${system}_stops.json"))
            val net = NetFileDecoder.net(shipped("${system}_routes.net.json"))
            assertEquals("serves[i] belongs to points[i]", layer.points.size, serves.serves.size)
            assertEquals(net.routes.map { it.id }, serves.routeIds)
            assertEquals("${system}_routes", serves.routesLayer)
            assertTrue(serves.serves.all { list -> list.all { it >= 0 && it < net.routes.size } })
            for (r in net.routes) for (list in r.stops) assertTrue(r.id, list.all { it >= 0 && it < layer.points.size })
        }
    }

    @Test
    fun theLayerListNamesTheNetFilesAndTheHubs() {
        val file = File(repoRoot, "data/bundle/v1/places/transit.json")
        assumeTrue("no built bundle here", file.isFile)
        val extras = NetFileDecoder.transitExtras(file.readBytes())
        assertEquals(setOf("ddot_routes", "ddot_stops", "smart_routes", "smart_stops", "qline", "people_mover"), extras.netFiles.keys)
        assertEquals("map/transit/qline.net.json", extras.netFiles["qline"])
        assertEquals(4, extras.hubs.size)
        val gcp = extras.hubs.first { it.name == "Grand Circus Park" }
        assertEquals(listOf("people_mover", "qline"), gcp.layers)
        near(42.3364, MapProjection.lat(gcp.y), by = 0.002)
        near(-83.0507, MapProjection.lon(gcp.x), by = 0.002)
        val origins = Json.parse(file.readBytes())["hubs"]!!.arr.map { it["origin"]?.arr?.size }
        assertEquals("every hub says what its numbers count from", listOf(2, 2, 2, 2), origins)
        assertFalse("a hub is drawn when two or more of its layers are on", gcp.shows(listOf("go:qline")))
        assertTrue(gcp.shows(listOf("go:qline", "go:people_mover")))
        // Every network file the layer list names is in the signed index, with a checksum: that is the only way in.
        val index = Json.parse(File(repoRoot, "data/bundle/v1/index.json").readBytes())["files"]!!
        for (f in extras.netFiles.values) assertEquals(f, 64, index[f]?.get("sha256")?.str?.length)
    }

    /**
     * A hub is placed by the `origin` it carries — never by an assumption, and never by looking its stations up by
     * name. Only a bundle from before `origin` (2026-09-21) falls back: to the names, and failing that to the grid.
     */
    @Test
    fun aHubIsPlacedByItsOwnOrigin() {
        fun hub(origin: String, held: Map<String, List<MapPoint>> = emptyMap()): TransitHub {
            val json = """{"layers":[],"hubs":[{$origin"at":[1000,2000],"span":[-10,0,10,0],"name":"H","layers":["qline","people_mover"],""" +
                """"stops":[{"layer":"qline","name":"Q"},{"layer":"people_mover","name":"P"}]}]}"""
            return NetFileDecoder.transitExtras(json.toByteArray(), held).hubs.first()
        }
        val stations = mapOf(
            "qline" to listOf(MapPoint("Q", MapProjection.x(-83.05), MapProjection.y(42.33))),
            "people_mover" to listOf(MapPoint("P", MapProjection.x(-83.051), MapProjection.y(42.331)), MapPoint("P", 0.2, 0.2)),
        )
        val said = hub(""""origin":[-83.0,42.0],""")
        near(-83.0 + 0.01, MapProjection.lon(said.x), by = 1e-9); near(42.0 + 0.02, MapProjection.lat(said.y), by = 1e-9)
        near(0.0002, MapProjection.lon(said.bx) - MapProjection.lon(said.ax), by = 1e-9)
        assertEquals("with an origin, names are never consulted", said, hub(""""origin":[-83.0,42.0],""", stations))
        val old = hub("")
        near(NetFileDecoder.transitOrigin[0] + 0.01, MapProjection.lon(old.x), by = 1e-9)
        val byName = hub("", stations)
        near(-83.0505, MapProjection.lon(byName.x), by = 1e-9); near(42.3305, MapProjection.lat(byName.y), by = 1e-9)
        assertEquals(listOf("qline" to "Q", "people_mover" to "P"), byName.stops)
    }

    /** An old bundle: no `net`, no `hubs`. Nothing to choose, so the control is not offered. */
    @Test
    fun anOldBundleOffersNoStyle() {
        val old = """{"layers":[{"id":"qline","kind":"both","file":"map/transit/qline.json"}]}"""
        val extras = NetFileDecoder.transitExtras(old.toByteArray())
        assertTrue(extras.netFiles.isEmpty()); assertTrue(extras.hubs.isEmpty())
        assertTrue(NetFileDecoder.transitExtras("not json".toByteArray()).netFiles.isEmpty())
        val v3 = """{"layers":[{"id":"qline","net":{"file":"x.net.json","v":3}}]}"""
        assertTrue("a format this app cannot read is not offered", NetFileDecoder.transitExtras(v3.toByteArray()).netFiles.isEmpty())
    }

    // -- failure falls back to standard

    private fun refused(json: String): NetFileException = try {
        NetFileDecoder.net(json.toByteArray())
        throw AssertionError("decoded: $json")
    } catch (e: NetFileException) {
        e
    }

    @Test
    fun aFormatThisAppCannotReadIsRefused() {
        assertEquals(3, refused("""{"id":"qline","v":3,"origin":[-83.32,42.22],"names":[],"lines":[],"routes":[]}""").version)
        assertEquals(0, refused("""{"id":"qline","origin":[-83.32,42.22],"names":[],"lines":[]}""").version)
        assertEquals("unreadable", refused("{").reason)
        assertEquals("malformed", refused("""{"id":"x","v":2}""").reason)
        try {
            NetFileDecoder.netServes("""{"id":"x","v":2}""".toByteArray())
            fail("decoded")
        } catch (e: NetFileException) {
            assertEquals("malformed", e.reason)
        }
    }

    /**
     * The rule the model follows (MapModel.overlays): a layer is drawn `subway` only once its network is held. Until
     * then — still coming, refused, failed its checksum — it is drawn `standard`.
     */
    @Test
    fun aLayerWithoutItsNetworkIsDrawnStandard() {
        assertEquals(MapStyle.STANDARD, drawnStyle(MapStyle.SUBWAY, false))
        assertEquals(MapStyle.SUBWAY, drawnStyle(MapStyle.SUBWAY, true))
        assertEquals("a held file never changes standard", MapStyle.STANDARD, drawnStyle(MapStyle.STANDARD, true))
        assertEquals(MapStyle.STANDARD, drawnStyle(MapStyle.STANDARD, false))
    }

    @Test
    fun aFileThatPointsOutsideItselfIsNotTrusted() {
        val odd = """
        {"id":"t","v":2,"origin":[-83.32,42.22],"names":["A"],"lines":[[0,[0,0,100,0,100,0]]],
         "routes":[{"id":"rt_a","short":"A","long":"","tone":9,"lines":[0,7],"stops":[],"ends":[[1,2,5],[1]]}],
         "runs":[[0,1,2,99,0,1]],"interchanges":[[0,0,-1,[0,4],[1,1]]],"trunks":[[0,0,[0,1,2,3,4,5]]]}
        """
        val net = NetFileDecoder.net(odd.toByteArray())
        assertEquals("line 7 is not in the file", listOf(0), net.routes[0].lines)
        assertEquals(1, net.routes[0].ends.size); assertEquals("", net.routes[0].ends[0].name)
        assertEquals("a run start past the end is clamped", listOf(NetRun(0, 1, 2), NetRun(2, 0, 1)), net.lines[0].runs)
        assertEquals(listOf(0), net.interchanges[0].routes)
        assertEquals(listOf(0), net.trunks[0].routes)
        assertEquals("a tone outside 0…5 wraps rather than crashing", TransitToken.TR3, routeColour("t", net.routes[0]))
        // A run that is not after the one before it is dropped; a line with no runs at all is one run.
        val squeezed = odd.replace("[0,1,2,99,0,1]", "[0,1,2,1,2,2,1,3,3]")
        assertEquals(listOf(NetRun(0, 1, 2), NetRun(1, 2, 2)), NetFileDecoder.net(squeezed.toByteArray()).lines[0].runs)
        assertEquals(listOf(NetRun(0, 0, 1)), NetFileDecoder.net(odd.replace("[0,1,2,99,0,1]", "").toByteArray()).lines[0].runs)
    }
}

// ---- geometry ----------------------------------------------------------------------------------------------------------------

class SubwayGeometryTest {

    private fun d(vararg v: Double) = doubleArrayOf(*v)
    private fun same(want: DoubleArray, got: DoubleArray, what: String = "") =
        assertEquals(what, want.toList(), got.toList())

    @Test
    fun simplifyKeepsEndsAndDropsWhatIsWithinTolerance() {
        val line = d(0.0, 0.0, 1.0, 0.01, 2.0, 0.0, 3.0, 1.0, 4.0, 0.0)
        same(line, SubwayGeometry.simplify(line, 0.0), "near band: none")
        same(d(0.0, 0.0, 2.0, 0.0, 3.0, 1.0, 4.0, 0.0), SubwayGeometry.simplify(line, 0.05))
        same(d(0.0, 0.0, 4.0, 0.0), SubwayGeometry.simplify(line, 5.0))
    }

    @Test
    fun runsAreSimplifiedSeparatelySoBoundariesSurvive() {
        // A straight line: simplification would drop every middle vertex, but vertex 2 starts a run.
        val pts = d(0.0, 0.0, 0.001, 0.0, 0.002, 0.0, 0.003, 0.0, 0.004, 0.0)
        val runs = SubwayGeometry.prepare(NetLine(0, pts, listOf(NetRun(0, -1, 2), NetRun(2, 0, 1))), ZoomBand.FAR)
        assertEquals(listOf(listOf(0.0, 0.0, 0.002, 0.0), listOf(0.002, 0.0, 0.004, 0.0)), runs.map { it.points.toList() })
        assertEquals(listOf(-1, 0), runs.map { it.off })
    }

    /** Left of travel with north up. y grows downwards, so heading east the left side is smaller y. */
    @Test
    fun offsetIsToTheLeftOfTravel() {
        same(d(0.0, -2.0, 10.0, -2.0), SubwayGeometry.offsetRun(d(0.0, 0.0, 10.0, 0.0), 2.0))
        same(d(10.0, 2.0, 0.0, 2.0), SubwayGeometry.offsetRun(d(10.0, 0.0, 0.0, 0.0), 2.0), "heading west, left is south")
        same(d(-2.0, 0.0, -2.0, -10.0), SubwayGeometry.offsetRun(d(0.0, 0.0, 0.0, -10.0), 2.0), "heading north, left is west")
        same(d(0.0, 2.0, 10.0, 2.0), SubwayGeometry.offsetRun(d(0.0, 0.0, 10.0, 0.0), -2.0))
        same(d(0.0, 0.0, 10.0, 0.0), SubwayGeometry.offsetRun(d(0.0, 0.0, 10.0, 0.0), 0.0))
    }

    @Test
    fun aCornerIsMitredAndTheMitreIsLimitedToTwo() {
        // East then north: a right angle, turning left. The inside corner moves by o·√2 along the diagonal.
        val bend = SubwayGeometry.offsetRun(d(0.0, 0.0, 10.0, 0.0, 10.0, -10.0), 1.0)
        near(9.0, bend[2], by = 1e-9); near(-1.0, bend[3], by = 1e-9)
        // A hairpin: without the limit the mitre would run off to infinity.
        val hairpin = SubwayGeometry.offsetRun(d(0.0, 0.0, 10.0, 0.0, 0.0, 0.2), 1.0)
        assertTrue(hypot(hairpin[2] - 10, hairpin[3] - 0) <= 2 + 1e-9)
        // A repeated vertex has no direction of its own and borrows its neighbour's.
        same(d(0.0, -1.0, 0.0, -1.0, 10.0, -1.0), SubwayGeometry.offsetRun(d(0.0, 0.0, 0.0, 0.0, 10.0, 0.0), 1.0))
    }

    @Test
    fun cornersAreRoundedWithOneQuadEach() {
        val cmds = SubwayGeometry.roundCorners(d(0.0, 0.0, 10.0, 0.0, 10.0, 10.0), 3.0)
        assertEquals(listOf(PathCommand.Move(0.0, 0.0), PathCommand.Line(7.0, 0.0), PathCommand.Quad(10.0, 0.0, 10.0, 3.0), PathCommand.Line(10.0, 10.0)), cmds)
        // r = min(R, half of each neighbouring segment)
        assertEquals(PathCommand.Line(2.0, 0.0), SubwayGeometry.roundCorners(d(0.0, 0.0, 4.0, 0.0, 4.0, 10.0), 3.0)[1])
        // A turn under 8 degrees is left alone.
        assertEquals(
            listOf(PathCommand.Move(0.0, 0.0), PathCommand.Line(10.0, 0.0), PathCommand.Line(20.0, 1.0)),
            SubwayGeometry.roundCorners(d(0.0, 0.0, 10.0, 0.0, 20.0, 1.0), 3.0),
        )
        assertEquals(
            listOf(PathCommand.Move(0.0, 0.0), PathCommand.Line(10.0, 0.0), PathCommand.Line(10.0, 10.0)),
            SubwayGeometry.roundCorners(d(0.0, 0.0, 10.0, 0.0, 10.0, 10.0), 0.0),
        )
        assertEquals(emptyList<PathCommand>(), SubwayGeometry.roundCorners(d(1.0, 1.0), 3.0))
    }

    @Test
    fun aClosedLoopIsRoundedWhereItCloses() {
        val square = d(0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0)
        val cmds = SubwayGeometry.roundCorners(square, 2.0, closed = true)
        assertEquals(PathCommand.Move(5.0, 0.0), cmds.first()); assertEquals(PathCommand.Line(5.0, 0.0), cmds.last())
        assertEquals("all four corners, the closing one too", 4, cmds.count { it is PathCommand.Quad })
    }

    @Test
    fun sideBySideRunsJoinWithAJogAndATrunkIsDrawnOnce() {
        val runs = listOf(
            SubwayGeometry.PreparedRun(0, 1, d(0.0, 0.0, 10.0, 0.0)), SubwayGeometry.PreparedRun(2, 3, d(10.0, 0.0, 20.0, 0.0)),
            SubwayGeometry.PreparedRun(0, 7, d(20.0, 0.0, 30.0, 0.0)), SubwayGeometry.PreparedRun(-1, 2, d(30.0, 0.0, 40.0, 0.0)),
        )
        val b = SubwayGeometry.build(0, runs, 2.0, 0.0, false)
        assertEquals(listOf(listOf(20.0, 0.0, 30.0, 0.0)), b.trunk.map { it.toList() })
        assertEquals(2, b.own.size)
        // Centre, a jog to two half-steps left, and on to where the trunk begins: never a gap. A route's own path
        // ENDS at the trunk's first vertex and starts again at its last.
        same(d(0.0, 0.0, 10.0, 0.0, 10.0, -2.0, 20.0, -2.0, 20.0, 0.0), b.own[0])
        same(d(30.0, 0.0, 30.0, 1.0, 40.0, 1.0), b.own[1])
        // Far band: step 0, so every off is read as 0 and the line runs down the centre.
        same(d(0.0, 0.0, 10.0, 0.0, 10.0, 0.0, 20.0, 0.0, 20.0, 0.0), SubwayGeometry.build(0, runs, 0.0, 0.0, false).own[0])
    }

    @Test
    fun badgesAreWorldAnchoredAndSkipTrunks() {
        // 0.1 of a unit is 11,132 m. Spacing 3,000 m: 1500, 4500, 7500, 10500.
        val pts = d(0.0, 0.0, 0.05, 0.0, 0.1, 0.0)
        val all = SubwayGeometry.badgeAnchors(pts, listOf(NetRun(0, 0, 1)), 3000.0)
        assertEquals(listOf(1500.0, 4500.0, 7500.0, 10500.0), all.map { it.meters })
        near(1500 / MapProjection.METERS_PER_UNIT, all[0].x, by = 1e-12)
        near(-1.0, all[0].leftY, by = 1e-12); near(0.0, all[0].leftX, by = 1e-12)
        // The second half is a trunk: its anchors (7500, 10500) are skipped.
        val some = SubwayGeometry.badgeAnchors(pts, listOf(NetRun(0, 1, 2), NetRun(1, 0, 6)), 3000.0)
        assertEquals(listOf(1500.0, 4500.0), some.map { it.meters })
        assertEquals(listOf(1, 1), some.map { it.off })
        assertTrue(SubwayGeometry.badgeAnchors(pts, emptyList(), 0.0).isEmpty())
    }

    @Test
    fun chevronsAreEvenlySpacedAndPointTheWayTheLoopRuns() {
        val marks = SubwayGeometry.marksAlong(d(0.0, 0.0, 200.0, 0.0, 200.0, 100.0), 90.0)
        assertEquals(listOf(45.0, 135.0, 200.0), marks.map { it.x })
        assertEquals(listOf(0.0, 0.0, 25.0), marks.map { it.y })
        near(0.0, marks[0].angle, by = 1e-12)
        near(Math.PI / 2, marks[2].angle, by = 1e-12)
    }

    /** Where the keyboard's ring goes for a route with no badge on screen: the place on its line nearest the middle. */
    @Test
    fun thePlaceOnALineNearestAPoint() {
        val at = SubwayGeometry.nearestOn(d(0.0, 0.0, 10.0, 0.0, 10.0, 10.0), 4.0, 3.0)!!
        assertEquals(listOf(4.0, 0.0, 3.0), at.toList())
        assertEquals(listOf(10.0, 10.0), SubwayGeometry.nearestOn(d(0.0, 0.0, 10.0, 0.0, 10.0, 10.0), 30.0, 30.0)!!.take(2))
        assertNull(SubwayGeometry.nearestOn(d(), 0.0, 0.0))
    }

    @Test
    fun theRealNetworksBuildInEveryBand() {
        val t0 = System.nanoTime()
        val ddot = PreparedNet(NetFileDecoder.net(shipped("ddot_routes.net.json")))
        val smart = PreparedNet(NetFileDecoder.net(shipped("smart_routes.net.json")))
        val prepared = (System.nanoTime() - t0) / 1e6
        for (p in listOf(ddot, smart)) {
            val raw = p.net.lines.sumOf { it.points.size / 2 }
            fun vertices(b: ZoomBand) = p.runs.getValue(b).sumOf { line -> line.sumOf { it.points.size / 2 } }
            assertTrue(vertices(ZoomBand.FAR) < vertices(ZoomBand.MID)); assertTrue(vertices(ZoomBand.MID) < vertices(ZoomBand.NEAR))
            assertTrue("near is not simplified (run boundaries are counted twice)", vertices(ZoomBand.NEAR) >= raw)
            for (band in ZoomBand.values()) {
                val mpp = when (band) { ZoomBand.FAR -> 60.0; ZoomBand.MID -> 20.0; ZoomBand.NEAR -> 6.0 }
                val built = p.built(band, MapProjection.METERS_PER_UNIT / mpp)
                assertEquals(p.net.lines.size, built.size)
                for (b in built) {
                    assertFalse(b.box.isEmpty)
                    for (l in b.own + b.trunk) assertTrue(l.all { it.isFinite() })
                }
                assertFalse("both bus networks have trunks", built.all { it.trunk.isEmpty() })
                assertTrue(p.anchors.getValue(band).any { it.isNotEmpty() })
            }
            // Offsets never exceed 1.5 steps (three half-steps), mitre limit 2.
            val scale = MapProjection.METERS_PER_UNIT / 20
            val step = subwayStep(ZoomBand.MID) / scale
            val built = p.built(ZoomBand.MID, scale)
            for ((li, line) in p.net.lines.withIndex()) {
                for (poly in built[li].own) {
                    var i = 0
                    while (i + 1 < poly.size) {
                        assertTrue(MapHit.distanceToPolyline(poly[i], poly[i + 1], line.points) <= step * 1.5 * 2 + 12 / MapProjection.METERS_PER_UNIT)
                        i += 2
                    }
                }
            }
        }
        // The People Mover: one closed loop, one path, started mid-segment so the closing corner is rounded too.
        val dpm = PreparedNet(NetFileDecoder.net(shipped("people_mover.net.json")))
        val loop = dpm.built(ZoomBand.NEAR, MapProjection.METERS_PER_UNIT / 3).single()
        val first = loop.ownCommands.first() as PathCommand.Move
        val last = loop.ownCommands.last() as PathCommand.Line
        assertEquals(first.x, last.x, 0.0); assertEquals(first.y, last.y, 0.0)
        val raw = dpm.net.lines[0].points
        near((raw[0] + raw[2]) / 2, first.x, by = 1e-12); near((raw[1] + raw[3]) / 2, first.y, by = 1e-12)
        println("prepared both bus networks (three bands each) in ${"%.1f".format(prepared)} ms")
    }
}

// ---- badges, taps, reading order -------------------------------------------------------------------------------------------

class SubwayBadgeTest {

    private fun c(id: String, rank: BadgeRank, order: Long, x: Double, y: Double = 0.0, d: Double = 0.0) =
        BadgeCandidate(id, id, rank, order, LabelRect(x, y, 20.0, 16.0), d)

    @Test
    fun neverMoreThanTwentyFour() {
        val many = (0 until 60).map { c("b$it", BadgeRank.OTHER, it.toLong(), it * 40.0) }
        assertEquals(24, claimBadges(many).size)
        assertEquals(24, SUBWAY_BADGE_CAP)
    }

    @Test
    fun theOrderOfClaim() {
        val got = claimBadges(
            listOf(
                c("local", BadgeRank.OTHER, 1, 0.0, d = 50.0), c("trunk", BadgeRank.TRUNK, 0, 50.0), c("freq", BadgeRank.FREQUENT, 9, 100.0),
                c("rail", BadgeRank.RAIL, 0, 150.0), c("sel", BadgeRank.SELECTED, 30, 200.0),
                c("local-far", BadgeRank.OTHER, 1, 250.0, d = 90.0), c("local-near", BadgeRank.OTHER, 1, 300.0, d = 10.0),
            ),
            cap = 5,
        )
        // Settled 2026-09-21, one order for all three clients: selected › rail › trunks › frequent › the rest.
        assertEquals(listOf("sel", "rail", "trunk", "freq", "local-near"), got.map { it.id })
        assertEquals(2, BadgeRank.TRUNK.ordinal); assertEquals(3, BadgeRank.FREQUENT.ordinal)
    }

    /** Round-robin runs ACROSS ranks: a frequent route's second badge waits until every other route has its first. */
    @Test
    fun theRoundRobinRunsAcrossRanksAndTheSelectedRouteIsExempt() {
        val all = listOf(
            c("f-0", BadgeRank.FREQUENT, 4, 0.0, d = 1.0), c("f-1", BadgeRank.FREQUENT, 4, 40.0, d = 2.0), c("o-0", BadgeRank.OTHER, 31, 80.0, d = 5.0),
            c("o-1", BadgeRank.OTHER, 31, 120.0, d = 6.0), c("s-1", BadgeRank.SELECTED, 60, 160.0, d = 90.0), c("s-0", BadgeRank.SELECTED, 60, 200.0, d = 3.0),
        )
        assertEquals(listOf("s-0", "s-1", "f-0", "o-0", "f-1", "o-1"), badgeOrder(all).map { it.id })
    }

    @Test
    fun riderOrderRunsAcrossNetworks() {
        val keys = listOf(Triple("461", "smart", 19), Triple("4", "ddot", 3), Triple("4", "smart", 0), Triple("QLINE", "qline", 0), Triple("16", "ddot", 14))
        val sorted = keys.sortedBy { riderOrder(it.first, it.second, it.third) }
        assertEquals(listOf("ddot 4", "smart 4", "ddot 16", "smart 461", "qline QLINE"), sorted.map { "${it.second} ${it.first}" })
    }

    /** Every route in a rank is named once before any is named twice. */
    @Test
    fun everyRouteGetsABadgeBeforeAnyGetsASecond() {
        val all = ArrayList<BadgeCandidate>()
        for (route in 0 until 30) for (k in 0 until 3) all.add(c("r$route-$k", BadgeRank.OTHER, route.toLong(), route * 40.0, k * 40.0, k.toDouble()))
        val got = claimBadges(all)
        assertEquals(24, got.size)
        assertEquals("24 different routes, not the first 8 three times each", 24, got.map { it.order }.toSet().size)
        assertTrue("and each route's badge is the one nearest the middle", got.all { it.id.endsWith("-0") })
    }

    @Test
    fun aBadgeThatDoesNotFitIsDroppedNeverOverlapped() {
        val got = claimBadges(listOf(c("a", BadgeRank.FREQUENT, 0, 0.0), c("b", BadgeRank.OTHER, 1, 10.0), c("c", BadgeRank.OTHER, 2, 60.0)))
        assertEquals(listOf("a", "c"), got.map { it.id })
        // Terminals, hubs and interchanges come first: a badge never sits on one.
        val pill = LabelRect(60.0, 0.0, 12.0, 12.0)
        assertEquals(listOf("a"), claimBadges(listOf(c("a", BadgeRank.FREQUENT, 0, 0.0), c("c", BadgeRank.OTHER, 2, 60.0)), listOf(pill)).map { it.id })
        // A dropped badge does not use up one of the 24: the cap counts badges PLACED.
        val crowd = (0 until 30).map { c("x$it", BadgeRank.OTHER, it.toLong(), 0.0) } + (0 until 30).map { c("y$it", BadgeRank.OTHER, 100L + it, 100.0 + it * 40) }
        assertEquals(24, claimBadges(crowd).size)
    }

    /**
     * (settled, 7.3) A trunk badge is NOT dropped when its anchor is taken: it tries vertical steps of 0, ∓1.5, ∓3 …
     * badge-heights, and at each step 0, −½, +½ badge-widths; the first free spot wins. A route badge never moves.
     */
    @Test
    fun aTrunkBadgeMayBeNudgedAndARouteBadgeMayNot() {
        assertEquals(33, trunkBadgeNudges.size)
        assertEquals(listOf(0.0 to 0.0, -0.5 to 0.0, 0.5 to 0.0, 0.0 to -1.5, -0.5 to -1.5, 0.5 to -1.5, 0.0 to 1.5), trunkBadgeNudges.take(7))
        assertEquals(listOf(0.0, -1.5, 1.5, -3.0, 3.0, -4.5, 4.5, -6.0, 6.0, -7.5, 7.5), trunkBadgeNudges.map { it.second }.distinct())
        val pill = LabelRect(100.0, 100.0, 80.0, 20.0)
        val trunk = c("trunk", BadgeRank.TRUNK, -1, 100.0, 100.0)
        val got = claimBadges(listOf(trunk), listOf(pill)).single()
        // Every shift at step 0 still touches the pill; one and a half badge-heights up is the first that clears it.
        assertEquals(LabelRect(100.0, 100.0 - 1.5 * 16, 20.0, 16.0), got.rect)
        assertEquals("a free anchor is left alone", trunk.rect, claimBadges(listOf(trunk)).single().rect)
        assertTrue("a route's badge is dropped, never moved", claimBadges(listOf(c("r", BadgeRank.RAIL, 0, 100.0, 100.0)), listOf(pill)).isEmpty())
        val wall = LabelRect(100.0, 100.0, 400.0, 400.0)
        assertTrue("none free: dropped like any other", claimBadges(listOf(trunk), listOf(wall)).isEmpty())
    }

    /** The map's own controls count as taken space: nothing is drawn under a button. */
    @Test
    fun noBadgeIsPlacedUnderAControl() {
        val zoomIn = LabelRect(340.0, 600.0, 48.0, 48.0)
        val got = claimBadges(listOf(c("under", BadgeRank.RAIL, 0, 330.0, 590.0), c("clear", BadgeRank.OTHER, 5, 100.0, 100.0)), listOf(zoomIn))
        assertEquals(listOf("clear"), got.map { it.id })
        // Street names give way to the same boxes, as rows of circles.
        assertTrue(zoomIn.touchesCircle(310.0, 600.0, 9.0)); assertFalse(zoomIn.touchesCircle(300.0, 600.0, 9.0))
        assertTrue(zoomIn.touchesCircle(340.0, 600.0, 1.0))
    }

    /** Android's touch target is 48 dp (the iPhone's 44 pt): the same test, scaled to it. */
    @Test
    fun aTapFindsThe48DpBoxAndASecondTapMovesOn() {
        assertEquals(48.0, SUBWAY_HIT_BOX, 0.0); assertEquals(22.0, SUBWAY_LINE_HIT, 0.0)
        val glyphs = listOf(
            HitGlyph("stop", HitKind.STOP, 100.0, 100.0), HitGlyph("pill", HitKind.INTERCHANGE, 110.0, 100.0),
            HitGlyph("end", HitKind.TERMINAL, 118.0, 104.0), HitGlyph("far", HitKind.HUB, 300.0, 300.0),
        )
        assertEquals("a 3 dp stop still has a 48 dp box, and a terminal outranks it", "end", subwayHitTest(101.0, 101.0, glyphs)?.id)
        assertEquals("pill", subwayHitTest(101.0, 101.0, glyphs, "end")?.id)
        assertEquals("stop", subwayHitTest(101.0, 101.0, glyphs, "pill")?.id)
        assertEquals("and round again", "end", subwayHitTest(101.0, 101.0, glyphs, "stop")?.id)
        assertEquals("23.5 dp away is inside the box", "stop", subwayHitTest(76.5, 100.0, glyphs)?.id)
        assertNull(subwayHitTest(75.0, 100.0, glyphs))
        assertNull(subwayHitTest(200.0, 200.0, glyphs))
        // The iPhone's numbers, with its box handed in: the function is the same function.
        assertEquals("stop", subwayHitTest(78.5, 100.0, glyphs, box = 44.0)?.id)
        assertNull(subwayHitTest(77.0, 100.0, glyphs, box = 44.0))
    }

    @Test
    fun theReadingOrderIsOnlyEverAppendedTo() {
        val existing = listOf("seg:a", "seg:b", "row:1")
        val got = featureOrder(existing, listOf("hub:1"), listOf("end:1", "end:2"), listOf("x:1"), listOf("rt:1", "rt:2"))
        assertEquals("what standard reads first, subway reads first, in the same order", existing, got.items.take(3))
        assertEquals(listOf("hub:1", "end:1", "end:2", "x:1", "rt:1", "rt:2"), got.items.drop(3))
        assertEquals(0, got.more)
        val crowded = featureOrder(existing, emptyList(), emptyList(), (0 until 100).map { "x:$it" }, listOf("rt:1"))
        // Downtown: a hundred interchanges and thirty terminals must not keep TalkBack from the ROUTES.
        assertEquals(3 + 20 + 1, crowded.items.size); assertEquals("rt:1", crowded.items.last()); assertEquals(80, crowded.more)
        val downtown = featureOrder(existing, listOf("hub:1"), (0 until 30).map { "end:$it" }, (0 until 100).map { "x:$it" }, (0 until 50).map { "rt:$it" })
        assertEquals(3 + 40, downtown.items.size)
        assertEquals(SUBWAY_TERMINAL_FEATURE_CAP, downtown.items.count { it.startsWith("end:") })
        assertEquals(SUBWAY_INTERCHANGE_FEATURE_CAP, downtown.items.count { it.startsWith("x:") })
        assertEquals("40 − 1 − 8 − 20", 11, downtown.items.count { it.startsWith("rt:") })
        assertEquals("rt:10", downtown.items.last()); assertEquals(181 - 40, downtown.more)
        assertEquals(existing, featureOrder(existing, emptyList(), emptyList(), emptyList(), emptyList<String>()).items)
        // Routes never fewer than 8, however crowded: every hub there is (4), 8 ends, 20 interchanges, then routes.
        val worst = featureOrder(emptyList(), (0 until 4).map { "hub:$it" }, (0 until 99).map { "end:$it" }, (0 until 999).map { "x:$it" }, (0 until 79).map { "rt:$it" })
        assertEquals(8, worst.items.count { it.startsWith("rt:") })
        assertEquals(40, worst.items.size)
    }
}

// ---- the text list is the same list in both styles ------------------------------------------------------------------------

class MapListTest {

    private fun layer(id: String) = MapListLayer(id, MapFileDecoder.layer(shipped("$id.json")))

    private fun render(sections: List<MapListSection>): String =
        sections.joinToString("\n") { "${it.title}|${it.count}|${it.names.joinToString(" · ")}|${it.more}" }

    /**
     * "See this map as a list" is identical in both styles — same headings, same rows, same order — because it is
     * never told the style and reads the standard layer file only. Rendered once as `standard` sees the world (no
     * network file anywhere) and once as `subway` does (every network decoded and held, a route selected), and
     * compared to the character.
     */
    @Test
    fun theListIsIdenticalInBothStyles() {
        val ids = listOf("ddot_routes", "smart_routes", "qline", "people_mover", "ddot_stops", "mogo")
        val standard = render(mapListSections(ids.map { layer(it) }))

        val held = listOf("ddot_routes", "smart_routes", "qline", "people_mover").associateWith { PreparedNet(NetFileDecoder.net(shipped("$it.net.json"))) }
        assertEquals(4, held.size)
        assertEquals(ids.size, netFilesWanted(MapStyle.SUBWAY, ids.map { "go:$it" }, ids.associateWith { "map/transit/$it.net.json" }).size)
        val subway = render(mapListSections(ids.map { layer(it) }))

        assertEquals(standard, subway)
        assertTrue(standard.startsWith("ddot_routes|87|"))
        // The list's function takes a label and a standard layer file, and nothing else: no style, no network.
        val wanted = listOf("java.util.List", "int")
        val method = Class.forName("org.help313.app.MapListKt").declaredMethods.first { it.name == "mapListSections" }
        assertEquals(wanted, method.parameterTypes.map { it.name })
        val fields = MapListLayer::class.java.declaredFields.map { it.type.simpleName }.sorted()
        assertEquals(listOf("MapLayerData", "String"), fields)
    }

    @Test
    fun namesAreSaidOnceAndTheRestAreCounted() {
        val data = MapLayerData(emptyList(), (0 until 50).flatMap { listOf(MapPoint("Stop $it", 0.0, 0.0), MapPoint("Stop $it", 0.0, 0.0)) } + MapPoint("", 0.0, 0.0))
        val s = mapListSections(listOf(MapListLayer("Stops", data))).single()
        assertEquals(101, s.count); assertEquals(40, s.names.size); assertEquals(10, s.more)
        assertEquals("Stop 0", s.names.first())
    }
}

// ---- the words for a day, and the owners' trip planners -------------------------------------------------------------------

class DayWordsTest {

    private fun name(d: String, today: String, l: Locale = Locale.US) = DayWords.name(d, today, l, "Today", "Tomorrow")

    @Test
    fun todayTomorrowAndThenTheDayByName() {
        assertEquals("Today", name("2026-09-21", "2026-09-21"))
        assertEquals("Tomorrow", name("2026-09-22", "2026-09-21"))
        assertEquals("Friday, Sep 25", name("2026-09-25", "2026-09-21"))
        assertEquals("across a month", "Tomorrow", name("2026-10-01", "2026-09-30"))
        assertEquals("across a year", "Tomorrow", name("2027-01-01", "2026-12-31"))
        assertEquals("yesterday is a date, not a word", "Sunday, Sep 20", name("2026-09-20", "2026-09-21"))
        assertFalse("never the raw ISO date, and never a year", name("2026-09-25", "2026-09-21").contains("2026"))
    }

    @Test
    fun theDayIsNamedInThePhonesLanguage() {
        val es = name("2026-09-25", "2026-09-21", Locale.forLanguageTag("es-US"))
        assertTrue(es, es.lowercase().contains("viernes"))
        assertFalse(es, es.contains("2026"))
        val ar = name("2026-09-25", "2026-09-21", Locale.forLanguageTag("ar-u-nu-latn"))
        assertTrue("Western digits, as everywhere in the app: $ar", ar.contains("25"))
        val bn = name("2026-09-25", "2026-09-21", Locale.forLanguageTag("bn-u-nu-latn"))
        assertTrue(bn, bn.contains("25") && !bn.contains("2026"))
    }

    @Test
    fun aDayThatCannotBeReadIsHandedBack() {
        assertEquals("soon", name("soon", "2026-09-21"))
        assertNull(DayWords.kind("2026-09-25", ""))
        assertEquals("with no today to compare with, still a day by name", "Friday, Sep 25", name("2026-09-25", ""))
        assertEquals(DayWords.Kind.OTHER, DayWords.kind("2026-09-25", "2026-09-21"))
    }
}

class TransitPlannerTest {

    /** apps/web/src/transit.ts is where a steward edits these links; the route card must use the same ones. */
    @Test
    fun thePlannersAreTheWebApps() {
        val ts = File(repoRoot, "apps/web/src/transit.ts").readText()
        val marked = Regex("url: '([^']+)', system: '([a-z]+)'").findAll(ts).associate { it.groupValues[2] to it.groupValues[1] }
        assertEquals(marked, transitPlanners)
    }

    /** ONE link, and only ever https: the app's one opener (`Net.webLink`) refuses everything else. */
    @Test
    fun aRouteCardsLinkIsHttpsOrThereIsNone() {
        assertEquals("https://www.smartbus.org/Schedules/Trip-Planner", plannerLink("smart", "https://smartbus.org"))
        assertEquals("https://qlinedetroit.com/", plannerLink("qline", null))
        assertEquals("https://www.thepeoplemover.com/", plannerLink("dpm", "http://www.thepeoplemover.com"))
        // DDOT's own planner is plain http today and its file carries no agency_url: no link, not an exception.
        assertNull(plannerLink("ddot", null))
        assertEquals("the file's own https address is the fallback", "https://example.org/", plannerLink("ddot", "https://example.org/"))
        assertNull(plannerLink("amtrak", "javascript:alert(1)"))
    }

    @Test
    fun aCardPrintsTheSentenceWithoutItsList() {
        assertEquals("Routes that stop here", sentenceWithoutList("Routes that stop here: "))
        assertEquals("17 routes share this street", sentenceWithoutList("17 routes share this street: "))
        // All four languages end these three in ": {list}" (docs/MAP-STYLE.md section 1); held here for the files.
        for (lang in listOf("en", "es", "ar", "bn")) {
            val words = Json.parse(File(repoRoot, "strings/$lang.json").readBytes())
            for (key in listOf("map.stop_lines", "map.change_here", "map.many_routes")) {
                assertTrue("$lang $key", words[key]!!.str!!.trimEnd().endsWith(": {list}"))
            }
            for (key in subwayStringKeys) assertNotNull("$lang $key", words[key]?.str)
        }
    }
}

/** Every string key the subway style uses on this app. All four files carry all of them. */
private val subwayStringKeys = listOf(
    "map.style", "map.style_standard", "map.style_standard_note", "map.style_subway", "map.style_subway_note", "map.style_say",
    "map.key", "map.key_frequent", "map.key_local", "map.key_smart", "map.key_trunk", "map.key_station", "map.key_change",
    "map.key_end", "map.key_qline", "map.key_dpm", "map.key_bike", "map.route_card", "map.route_every", "map.route_frequent",
    "map.route_stops", "map.route_plan", "map.stop_lines", "map.change_here", "map.hub_walk", "map.many_routes", "map.list_more",
    "map.layer_loading", "map.layer_failed", "map.layer_retry",
)
