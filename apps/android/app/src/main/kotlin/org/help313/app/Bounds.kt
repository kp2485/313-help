// How a neighbourhood or city boundary is drawn, at every zoom — the Kotlin half of apps/web/src/bounds.ts and
// the port of docs/MAP-STYLE.md section 15 (Kyle, 2026-09-22: "The user needs to be able to see the boundaries of
// the neighborhoods on the map").
//
// This file is the whole of the rule, as arithmetic: hand it metres per dp, get back a stroke width, a dash,
// whether names are drawn and how many. Nothing here reads a position, a theme or a resource — the colour is a
// TOKEN, resolved by MapPalette out of res/values/colors.xml, so dark mode and "increase contrast" reach the map
// through the machinery that already exists.
//
// No `android.` import, so `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test` holds every number
// here to the web's table on a plain JDK (ParityTest).
package org.help313.app

/**
 * The three zoom bands a boundary is drawn in. The cut points are exactly the ones the subway style already uses
 * (docs/MAP-STYLE.md section 5: far > 30, mid 12–30, near < 12), so there is one ladder to implement, not two.
 * `CITY` is that spec's `far`, renamed because at that zoom the whole city is on the screen.
 */
enum class BoundaryBand { CITY, MID, NEAR }

/** > 30 m/dp is [BoundaryBand.CITY]; 12–30 is MID; under 12 is NEAR. */
const val BOUNDARY_MID_MPP = 30.0
const val BOUNDARY_NEAR_MPP = 12.0

fun boundaryBand(metersPerPoint: Double): BoundaryBand = when {
    metersPerPoint > BOUNDARY_MID_MPP -> BoundaryBand.CITY
    metersPerPoint >= BOUNDARY_NEAR_MPP -> BoundaryBand.MID
    else -> BoundaryBand.NEAR
}

/**
 * At most 12 names a frame — the same cap the subway style puts on station names — and a name only where its
 * outline is at least 70 dp across, which is about what the shortest neighbourhood name needs.
 */
const val BOUNDARY_NAME_CAP = 12
const val BOUNDARY_NAME_MIN_PX = 70.0

/** The wash and the heavier solid stroke on the one outline that was tapped. A selection, never a value. */
const val BOUNDARY_WASH_ALPHA = 0.08
const val BOUNDARY_SELECTED_WIDTH = 4.0

/**
 * One band's drawing, in dp. [dash] is **absolute** — never multiplied by the line width the way a transit dash
 * is (docs/MAP-STYLE.md section 2). A thin line whose dash scales with it stops being dashed, and the dashed
 * texture is what says "this is not a street".
 */
data class BoundaryStyle(
    val band: BoundaryBand,
    /** A neighbourhood outline. */
    val width: Double,
    /** One of the four city outlines: a city is a bigger fact, and **weight is the only thing that says so** —
     *  never colour, and never a fill (docs/13 rule 1: no choropleth, ever). */
    val cityWidth: Double,
    val dash: List<Double>,
    val names: Boolean,
    val nameCap: Int,
    val nameMinPx: Double,
)

/**
 * Band → style. The whole table, in one place, the same three rows as `boundaryStyle` in apps/web/src/bounds.ts:
 *
 * | band | m/dp | neighbourhood | city | dash | names |
 * |---|---|---|---|---|---|
 * | `CITY` | > 30 | 1.1 | 1.5 | 2 on, 2 off | no |
 * | `MID` | 12–30 | 1.6 | 2.4 | 3 on, 3 off | yes, ≤ 12 |
 * | `NEAR` | < 12 | 2.2 | 3.0 | 6 on, 3 off | yes, ≤ 12 |
 *
 * Why these numbers (the spec's reasoning, kept here because a porter reads this file and not the web's):
 *
 * - **1.1 dp at city zoom is still thinner than the thinnest street drawn there.** The basemap draws classes 0–2
 *   above 11 m/dp and their width floor is 1.6 ([mapStreetWidth]), so a boundary can never be mistaken for a
 *   road, and 205 of them read as a lattice over the city rather than as a mesh. The old rule drew none of them
 *   at all below 14 m/dp, which is why a person who opened the Map tab saw no neighbourhoods.
 * - **The dash gets longer, not only thicker, as you come in**, and its "on" length is never shorter than the
 *   stroke is wide — a dash shorter than that reads as dust rather than as a line.
 * - **No names in the city band.** 205 names at 70 dp apiece do not fit, and a name dropped for want of room is
 *   worse than a band that never promised one.
 * - **These numbers are the THIRD set**, strengthened twice from screenshots rather than from the table. Take
 *   them from here, never from an earlier draft.
 */
fun boundaryStyle(metersPerPoint: Double): BoundaryStyle = when (boundaryBand(metersPerPoint)) {
    BoundaryBand.CITY -> BoundaryStyle(
        BoundaryBand.CITY, 1.1, 1.5, listOf(2.0, 2.0), names = false, nameCap = 0, nameMinPx = BOUNDARY_NAME_MIN_PX,
    )
    BoundaryBand.MID -> BoundaryStyle(
        BoundaryBand.MID, 1.6, 2.4, listOf(3.0, 3.0), names = true, nameCap = BOUNDARY_NAME_CAP, nameMinPx = BOUNDARY_NAME_MIN_PX,
    )
    BoundaryBand.NEAR -> BoundaryStyle(
        BoundaryBand.NEAR, 2.2, 3.0, listOf(6.0, 3.0), names = true, nameCap = BOUNDARY_NAME_CAP, nameMinPx = BOUNDARY_NAME_MIN_PX,
    )
}

/**
 * The Areas tab's map, where the outlines ARE the subject (Kyle, 2026-09-23: "the borders on the areas map should
 * be more prominently visible on the selection map by default"). docs/MAP-STYLE.md 15.7, `areasMapBoundaryStyle`
 * in apps/web/src/bounds.ts: **solid**, and heavier in every band (city 1.8 / 2.6, mid 2.4 / 3.2, near 3.0 / 3.6
 * — neighbourhood / city). The tapped outline keeps [BOUNDARY_SELECTED_WIDTH], its colour and its wash.
 */
fun areasMapBoundaryStyle(metersPerPoint: Double): BoundaryStyle {
    val s = boundaryStyle(metersPerPoint)
    val (width, cityWidth) = when (s.band) {
        BoundaryBand.CITY -> 1.8 to 2.6
        BoundaryBand.MID -> 2.4 to 3.2
        BoundaryBand.NEAR -> 3.0 to 3.6
    }
    return s.copy(width = width, cityWidth = cityWidth, dash = emptyList())
}

/**
 * The boundary colour, as numbers, in the four modes the spec's table names. The app draws with the Android
 * resource `R.color.map_bnd` (light and dark) and `R.color.map_bnd_more`; these are the same values, here, so
 * `:core` can compute the contrast ratios of section 15.2 on a plain JDK and hold them to their floor.
 */
object BoundaryPalette {
    private val plain = mapOf(MapScheme.LIGHT to RGB(0x7A5588), MapScheme.DARK to RGB(0xA98CBB))
    private val more = mapOf(MapScheme.LIGHT to RGB(0x5A3A6B), MapScheme.DARK to RGB(0xCDB4DA))

    fun color(scheme: MapScheme, highContrast: Boolean = false): RGB =
        (if (highContrast) more[scheme] else plain[scheme]) ?: plain.getValue(scheme)
}
