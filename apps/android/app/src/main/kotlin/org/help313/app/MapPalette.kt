// The map's colours, light and dark, exactly the tokens the web map draws with (apps/web/src/style.css as of
// 2026-09-21), including the contrast fixes of docs/ACCESSIBILITY-AUDIT-2026-09-20: every street now clears 3:1
// against the land and against a park, the city edge is a stroked line rather than a 1.20:1 change of shade, and
// the ground outside the service area is a hatch whose own lines clear 3:1 rather than a second pale fill.
//
// The values themselves are in res/values/colors.xml and res/values-night/colors.xml, so Android switches theme on
// its own and nothing here reads a preference. **MapView.kt never names a colour value**: the layer rules in
// MapLayers.kt carry a token name ("bus", "gwOpen"), and this file is the only place a name becomes a number. That
// is what makes the "subway" style (docs/MAP-STYLE.md) a table of tokens rather than an edit to the painter: its
// `--tr-*` tokens and the quietened basemap are NUMBERS in MapStyle.kt (where `:core` holds them to style.css, token
// for token, and computes the spec's contrast tables), and this file only picks the light or dark, plain or
// high-contrast value.
//
// Colour never carries a meaning on its own anywhere on this map: a greenway phase also has its own dash pattern
// and its own words, a status is words, and every layer is named in the switcher, in the tapped card and in the
// list (Differentiate Without Color).
package org.help313.app

import android.content.Context

class MapPalette(private val context: Context) {

    private fun c(id: Int) = UI.color(context, id)

    /** Light or dark, from the same configuration the resources above were resolved with. */
    val scheme: MapScheme =
        if ((context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        ) MapScheme.DARK else MapScheme.LIGHT

    /**
     * Whether this person asked the phone for more contrast. **`UiModeManager.getContrast()`, Android 14 and up** —
     * the one public, reflection-free answer the platform gives. `AccessibilityManager.isHighTextContrastEnabled` is
     * hidden until API 36 and this app does not reach for hidden methods, so on Android 7 to 13 the answer is "no":
     * the subway tones are then the plain ones, which already clear 3:1 everywhere (MapStyleTest), and the basemap
     * may be quietened. With it on: the high-contrast tones, casing + 1, rings + 0.5, and never a quiet basemap.
     */
    val highContrast: Boolean = try {
        android.os.Build.VERSION.SDK_INT >= 34 &&
            (context.getSystemService(android.app.UiModeManager::class.java)?.contrast ?: 0f) > 0f
    } catch (_: Throwable) {
        false
    }

    /** A `--tr-*` token of the subway style, as a colour for this theme and this contrast setting. */
    fun transit(token: TransitToken): Int = TransitPalette.color(token, scheme, highContrast).argb

    /** The words on a badge. */
    val badgeText: Int get() = TransitPalette.badgeText(scheme).argb

    /** The quietened basemap's six tokens (subway only, and never with high contrast: `basemapTokens`). */
    val quiet: QuietBasemap = QuietBasemap.tokens(scheme)

    // The ground
    val outside = c(R.color.map_out)
    val outsideInk = c(R.color.map_out_ink)
    val land = c(R.color.map_land)
    val park = c(R.color.map_park)
    val parkInk = c(R.color.map_park_ink)

    // The streets
    val road = c(R.color.map_road)
    val main = c(R.color.map_main)
    val freeway = c(R.color.map_fwy)
    val ink = c(R.color.map_ink)

    // Everything that sits on top
    val surface = c(R.color.surface)
    val greenwayCase = c(R.color.gw_case)
    val me = c(R.color.map_me)
    val brand = c(R.color.brand)

    /** The wash on the one area outline a tap picked out. It carries no number (docs/13, rule 1). */
    val brandSoft = c(R.color.brand_soft)

    /**
     * Every neighbourhood and city boundary, in one token (docs/MAP-STYLE.md section 15.2) — so a boundary is one
     * thing wherever it is drawn, in either map style. The high-contrast value is picked here, as the subway
     * tones are, rather than by the painter.
     */
    val boundary = c(if (highContrast) R.color.map_bnd_more else R.color.map_bnd)

    /**
     * The colour a layer style or a greenway phase names (MapLayers.kt), resolved here so that the rules stay free
     * of Android and `:core` can run them on a plain JDK.
     */
    fun named(key: String): Int = when (key) {
        "bus" -> c(R.color.lyr_bus)
        "smart" -> c(R.color.lyr_smart)
        "rail" -> c(R.color.lyr_rail)
        "bike" -> c(R.color.lyr_bike)
        "gwOpen" -> c(R.color.gw_open)
        "gwBuild" -> c(R.color.gw_build)
        "gwFund" -> c(R.color.gw_fund)
        "gwPlan" -> c(R.color.gw_plan)
        // The two tones one trip is drawn in (DirWords.rideToken). A ride names its agency's own layer token
        // above; "routeRide" is what an agency we carry no layer for falls back to.
        "routeWalk" -> c(R.color.route_walk)
        "routeRide" -> c(R.color.route_ride)
        else -> brand
    }

    /** The dot colour for one of our own listing groups (MAP_GROUPS). */
    fun group(id: String): Int = when (id) {
        "food" -> c(R.color.grp_food)
        "shelter" -> c(R.color.grp_shelter)
        "health" -> c(R.color.grp_health)
        "rec" -> c(R.color.grp_rec)
        "work" -> c(R.color.grp_work)
        "kids" -> c(R.color.grp_kids)
        "things" -> c(R.color.grp_things)
        "paperwork" -> c(R.color.grp_paperwork)
        else -> brand
    }
}
