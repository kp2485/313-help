// "Parks and paths" — the front door, with the Joe Louis Greenway as one row inside it (Kyle, 2026-09-22: "This is
// not a Joe Louis Greenway app; it is just one component of the park system. It doesn't need to be as loud as it is
// on the main page." DECISIONS 2026-09-22).
//
// Before this, 302 parks were a run of names inside a map sheet with no page to open, and 52 greenway stretches had
// a screen each. A park is now two taps from Home; the greenway is three, and its stretch screens and their
// condition reports (docs/11) are untouched.
//
// The rules live in Parks.kt, which `:core` runs on a plain JDK — above all the one about the order: nearest first
// with a location, A to Z without one, and never by acres or by the kind of park (docs/13, honesty rule 1).
package org.help313.app

import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import org.help313.query.LatLon
import org.help313.query.Ranked
import org.help313.query.badge
import org.help313.query.openNow

/**
 * The park list, read lazily and verified, exactly as the ZIP centres and the neighborhood numbers are: the bytes
 * are checked against the sha256 in the **signed** index before they are decoded, wherever they came from.
 */
object ParkRepo {

    private val main = Handler(Looper.getMainLooper())

    @Volatile
    var parks: List<Park> = emptyList()
        private set

    @Volatile
    var failed = false
        private set

    private var key = ""
    private var asking = false

    @Synchronized
    private fun claim(want: String): Boolean {
        if (asking || key == want) return false
        asking = true
        return true
    }

    fun offered(store: BundleStore): Boolean = store.bundle?.index?.files?.containsKey(PARKS_FILE) == true

    /** The day the City last edited the layer, for the source line. Never frozen at build time. */
    fun sourceDate(store: BundleStore): String = store.bundle?.index?.generatedAt?.take(10) ?: ""

    fun want(store: BundleStore, then: () -> Unit) {
        val want = store.bundle?.index?.files?.get(PARKS_FILE)?.sha256 ?: return
        if (!claim(want)) return
        Work.io {
            var bad = false
            val read = try {
                decodeParks(store.verifiedBytes(PARKS_FILE))
            } catch (t: Throwable) {
                if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "park list failed: $t")
                bad = true
                emptyList()
            }
            synchronized(this) {
                key = want
                parks = read
                failed = bad
                asking = false
            }
            main.post { then() }
        }
    }
}

object ParkScreens {

    /** How many of the 302 are drawn before "See all 302 parks". A screen is not a scroll of a thousand rows. */
    private const val FIRST_FEW = 12

    /** Whether the whole list is drawn. In memory, for the life of this process: it says nothing about anybody. */
    private var showAll = false

    fun reset() {
        showAll = false
    }

    // ---- the screen -------------------------------------------------------------------------------------------

    fun screen(a: MainActivity): View {
        val col = UI.column(a, 16)
        col.addView(UI.text(a, L.t("rec.title"), 24f, R.color.ink, bold = true))
        col.addView(UI.text(a, L.t("rec.lede"), 16f, R.color.muted, topDp = 4))

        ParkRepo.want(a.store) { if (a.current() is Route.Parks) a.render() }
        val parks = ParkRepo.parks
        if (parks.isEmpty()) {
            col.addView(
                UI.text(
                    a,
                    L.t(if (ParkRepo.failed || !ParkRepo.offered(a.store)) "detail.not_found" else "home.loading"),
                    17f, R.color.muted, topDp = 16,
                ),
            )
            return UI.scroller(a, col)
        }

        // The three ways to say where you are, in the same order and with the same words as every other list.
        col.addView(UI.sectionHead(a, L.t("rec.parks")))
        locationControls(a, col)
        col.addView(UI.text(a, L.t(if (a.near == null) "rec.parks_abc" else "rec.parks_near"), 15f, R.color.muted, topDp = 6))

        val ordered = parksInOrder(parks, a.near)
        val drawn = if (showAll) ordered else ordered.take(FIRST_FEW)
        for (p in drawn) col.addView(parkCard(a, p))
        if (!showAll && ordered.size > drawn.size) {
            col.addView(
                UI.button(a, L.t("rec.all_parks", "count" to ordered.size.toString()),
                    backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    showAll = true
                    a.render()
                },
            )
        }
        col.addView(UI.text(a, L.t("rec.parks_source", "date" to ParkRepo.sourceDate(a.store)), 14f, R.color.muted, topDp = 8))
        // The City's list is not the whole park system, and the screen says so rather than implying it is.
        col.addView(UI.text(a, L.t(PARKS_GAP_KEY), 14f, R.color.muted, topDp = 6))

        recCenters(a, col)
        paths(a, col)
        return UI.scroller(a, col)
    }

    /** The recreation centers and libraries, as ordinary listing cards from the signed bundle. */
    private fun recCenters(a: MainActivity, col: LinearLayout) {
        col.addView(UI.sectionHead(a, L.t("rec.centers")))
        val bundle = a.store.bundle
        val rows = inCategories(bundle?.rows.orEmpty(), listOf("rec"))
        if (rows.isEmpty()) {
            col.addView(UI.text(a, L.t("rec.centers_none"), 16f, R.color.muted, topDp = 6))
            return
        }
        val now = a.now()
        for (row in org.help313.query.rank(rows, org.help313.query.Query(near = a.near), now, bundle?.alerts.orEmpty())) {
            val card = UI.tappableCard(a, row.row.name) { a.push(Route.Detail(row.row.id, row.row.category)) }
            card.addView(UI.text(a, row.row.name, 18f, R.color.ink, bold = true))
            if (row.row.what.isNotEmpty()) card.addView(UI.text(a, row.row.what, 16f, R.color.muted, topDp = 2))
            col.addView(card)
        }
    }

    /**
     * The paths: **one row** for the Joe Louis Greenway, to the screen it has always had, and one for the bike
     * lanes, which are a map layer rather than a page.
     */
    private fun paths(a: MainActivity, col: LinearLayout) {
        col.addView(UI.sectionHead(a, L.t("rec.paths")))
        val segments = a.store.bundle?.segments.orEmpty()
        if (segments.isNotEmpty()) {
            val open = segments.count { it.phase == "open" }
            val label = L.t("gw.title")
            val card = UI.tappableCard(a, label) { a.push(Route.Stretch(segments.first().id)) }
            card.addView(UI.text(a, label, 18f, R.color.ink, bold = true))
            card.addView(
                UI.text(a, L.t("rec.gw_row", "open" to open.toString(), "total" to segments.size.toString()),
                    16f, R.color.muted, topDp = 2),
            )
            col.addView(card)
        }
        val bikes = UI.tappableCard(a, L.t("rec.bike_lanes")) {
            // The bike lanes are a map layer, not a page: switch it on and open the tab, so the row does what it
            // says rather than dropping somebody on a map with nothing new on it.
            if (!MapModel.isOn(a, "go:bike_lanes")) MapModel.toggle(a, "go:bike_lanes")
            a.go(Route.Map)
        }
        bikes.addView(UI.text(a, L.t("rec.bike_lanes"), 18f, R.color.ink, bold = true))
        bikes.addView(UI.text(a, L.t("rec.bike_lanes_sub"), 16f, R.color.muted, topDp = 2))
        col.addView(bikes)
    }

    /** One row of the list: the City's name for the park, its kind, its acreage and how far away it is. */
    private fun parkCard(a: MainActivity, p: Park): View {
        val card = UI.tappableCard(a, p.name) { a.push(Route.Park(p.id)) }
        card.addView(UI.text(a, p.name, 18f, R.color.ink, bold = true))
        // The City's own words for the kind of park. Shown, never used to order the list.
        p.type?.let { card.addView(UI.text(a, it, 15f, R.color.muted, topDp = 2)) }
        val here = a.near
        if (here != null) {
            parkMiles(p, here)?.let {
                card.addView(UI.text(a, L.t("miles", "miles" to String.format(L.locale(), "%.1f", it)), 14f, R.color.muted, topDp = 2))
            }
        }
        return card
    }

    // ---- one park -----------------------------------------------------------------------------------------------

    fun page(a: MainActivity, id: String): View {
        ParkRepo.want(a.store) { if (a.current() is Route.Park) a.render() }
        val p = parkById(ParkRepo.parks, id)
        val col = UI.column(a, 16)
        if (p == null) {
            col.addView(
                UI.text(a, L.t(if (ParkRepo.parks.isEmpty() && !ParkRepo.failed) "home.loading" else "detail.not_found"), 17f, R.color.muted),
            )
            return UI.scroller(a, col)
        }
        col.addView(UI.text(a, p.name, 24f, R.color.ink, bold = true))
        p.type?.let { col.addView(UI.text(a, it, 16f, R.color.muted, topDp = 2)) }
        p.acres?.let {
            col.addView(UI.text(a, L.t("rec.acres", "acres" to String.format(L.locale(), "%.1f", it)), 16f, R.color.muted, topDp = 2))
        }

        // The outline the map already carries, drawn small and still, from the City's own park shapes.
        outline(a, col, p)

        col.addView(UI.sectionHead(a, L.t("detail.where")))
        val address = p.address
        if (address != null) {
            col.addView(UI.text(a, address, 17f, R.color.ink))
        } else {
            // A coordinate is never printed as if it were an address (CLAUDE.md).
            col.addView(UI.text(a, L.t("rec.no_address"), 17f, R.color.ink))
        }
        val destination = address ?: p.point?.let { "${it.lat},${it.lon}" }
        if (destination != null) {
            col.addView(
                UI.button(a, L.t("detail.directions"), description = L.t("detail.directions_label", "name" to p.name),
                    backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.directions(p.lat, p.lon, destination)
                },
            )
            if (a.canOpenTransitApp()) {
                col.addView(
                    UI.button(a, L.t("detail.bus_app"), description = L.t("detail.bus_app_label", "name" to p.name),
                        backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                        a.transitApp(destination)
                    },
                )
            }
            col.addView(UI.text(a, L.t("detail.directions_note"), 14f, R.color.muted, topDp = 4))
        }
        p.point?.let { point ->
            col.addView(
                UI.button(a, L.t("rec.on_the_map"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    MapModel.center(point)
                    a.go(Route.Map)
                },
            )
        }

        helpNearby(a, col, p)
        return UI.scroller(a, col)
    }

    /** The park's own shape, from `map/base.json`, drawn the way a neighborhood's outline is. */
    private fun outline(a: MainActivity, col: LinearLayout, p: Park) {
        val base = MapModel.base ?: return
        val shape = base.parks.firstOrNull { it.name.equals(p.name, ignoreCase = true) } ?: return
        val ring = ArrayList<LatLon>()
        var i = 0
        while (i + 1 < shape.points.size) {
            ring.add(LatLon(MapProjection.lat(shape.points[i + 1]), MapProjection.lon(shape.points[i])))
            i += 2
        }
        if (ring.size < 3) return
        val view = AreaOutlineView(a, listOf(ring))
        view.contentDescription = L.t("map.label_hood", "name" to p.name)
        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = UI.dp(a, 12)
        view.layoutParams = lp
        col.addView(view)
    }

    /**
     * "Help within a 10-minute walk" — the same quarter mile, and the same words, as the greenway's stretch
     * screens. A park with no published point cannot have one, and says nothing rather than guessing.
     */
    private fun helpNearby(a: MainActivity, col: LinearLayout, p: Park) {
        val point = p.point ?: return
        col.addView(UI.sectionHead(a, L.t("rec.help_near")))
        val bundle = a.store.bundle
        val now = a.now()
        // The same rule as the map's dots: a sensitive row is never given a distance or a place on a map, so it is
        // never a row here either (mapDrawable, MapLayers.kt).
        val near = mapDrawable(bundle?.rows.orEmpty(), mapGroups.flatMap { it.tops })
            .mapNotNull { row ->
                val lat = row.lat ?: return@mapNotNull null
                val lon = row.lon ?: return@mapNotNull null
                val miles = kotlin.math.hypot((lat - point.lat) * 69.0, (lon - point.lon) * 69.0 * 0.74)
                if (miles <= PARK_HELP_MILES) row to miles else null
            }
            .sortedBy { it.second }
        if (near.isEmpty()) {
            col.addView(UI.text(a, L.t("rec.help_near_none"), 16f, R.color.muted, topDp = 6))
            return
        }
        for ((row, miles) in near.take(8)) {
            val card = UI.tappableCard(a, row.name) { a.push(Route.Detail(row.id, row.category)) }
            card.addView(UI.text(a, row.name, 18f, R.color.ink, bold = true))
            if (row.what.isNotEmpty()) card.addView(UI.text(a, row.what, 16f, R.color.muted, topDp = 2))
            val r = Ranked(row, openNow(row, now, bundle?.alerts.orEmpty()), badge(row, now), miles, 0)
            card.addView(UI.pill(a, openText(r.open, a.today())))
            card.addView(UI.text(a, L.t("miles", "miles" to String.format(L.locale(), "%.1f", miles)), 14f, R.color.muted, topDp = 2))
            col.addView(card)
        }
    }

    /**
     * The three ways to say where you are, in one place: the location button, the cross street, the ZIP. Shared
     * with the Areas tab so the two screens cannot drift apart (and so a person who refused once is never nagged).
     */
    fun locationControls(a: MainActivity, col: LinearLayout) {
        if (a.near == null) {
            col.addView(
                UI.button(a, L.t("loc.use"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.askForLocation()
                },
            )
            // Five minutes of listening, with one honest line after ten seconds and a way to stop (DECISIONS
            // 2026-09-22). The other two ways in stay on the screen the whole time.
            if (a.locateSlow) {
                col.addView(UI.text(a, L.t("loc.slow"), 15f, R.color.muted, topDp = 6))
                if (a.canStopLooking) {
                    col.addView(
                        UI.button(a, L.t("loc.slow_stop"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                            a.stopLookingForLocation()
                        },
                    )
                }
            }
            if (a.locationRefused) {
                col.addView(
                    UI.text(a, L.t(if (a.locationPermanentlyDenied()) "loc.denied_settings" else "loc.denied"), 15f, R.color.muted, topDp = 6),
                )
            }
            if (a.locateOutside) col.addView(UI.text(a, L.t("hood.mine_outside"), 15f, R.color.muted, topDp = 6))
        } else if (a.nearZip == null && a.crossText == null) {
            col.addView(UI.text(a, L.t("loc.using"), 15f, R.color.muted, topDp = 8))
            col.addView(
                UI.button(a, L.t("loc.off"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.near = null
                    a.render()
                },
            )
        }
        CrossBox.add(a, col)
        ZipBox.add(a, col)
        col.addView(UI.text(a, L.t("loc.note"), 14f, R.color.muted, topDp = 4))
    }
}
