// The first time the Map tab is opened on this phone: our own card, and then — only if a person taps it — the
// system's permission dialog (Kyle, 2026-09-21; DECISIONS 2026-09-21).
//
// Why a card of our own first. A cold permission dialog explains nothing, and the honest answer to "why does a
// map of Detroit want my location?" is a sentence a person can read before anything is asked of them: "Your
// location stays on this phone. We never send it or save it." Android also stops asking after two refusals, so a
// dialog shown at the wrong moment costs the feature for good.
//
// What this file may remember: **one boolean**. That the card has been answered. Not the answer, not the
// permission, and never a position. A position lives in MainActivity.near for as long as the activity is alive
// and goes nowhere else: not to a file, not to a report, not to a log (docs/08).
//
// No `android.` import in this file, on purpose: it is compiled and tested by `:core` on a plain JDK, beside the
// other rules where a mistake would be worst. The web and iPhone halves are apps/web/src/locate.ts and
// apps/ios/Sources/HelpCore/Locate.swift; the three are held to the same table of cases.
package org.help313.app

import org.help313.query.LatLon
import org.help313.query.SERVICE_AREAS
import java.io.File

// ---- the four cities, as a box ---------------------------------------------------------------------------------

/**
 * CLAUDE.md: "Bbox sanity: lat 42.25–42.46, lon −83.33 to −82.91" (Dearborn reaches west to about −83.32). The
 * same numbers as `SERVICE_BBOX` in packages/query and `ServiceBox` in apps/ios/Sources/HelpCore/Locate.swift.
 */
object ServiceBox {
    const val LAT_MIN = 42.25
    const val LAT_MAX = 42.46
    const val LON_MIN = -83.33
    const val LON_MAX = -82.91
}

/**
 * Whether a point is inside Detroit, Hamtramck, Highland Park or Dearborn. A fix that is not a number is not
 * inside anything: the map is not moved somewhere undefined.
 */
fun inServiceArea(lat: Double, lon: Double, slack: Double = 0.0): Boolean {
    if (lat.isNaN() || lon.isNaN() || lat.isInfinite() || lon.isInfinite()) return false
    return lat >= ServiceBox.LAT_MIN - slack && lat <= ServiceBox.LAT_MAX + slack &&
        lon >= ServiceBox.LON_MIN - slack && lon <= ServiceBox.LON_MAX + slack
}

fun inServiceArea(p: LatLon, slack: Double = 0.0): Boolean = inServiceArea(p.lat, p.lon, slack)

/** Two miles, in metres. The shorter side of the map spans twice this: four miles across, the walk-and-bus city. */
const val LOCATE_RADIUS_METERS = 3218.688

/**
 * Where a map of Detroit looks when nobody has said where they are (Kyle, 2026-09-22: "the initial map
 * presentation needs to be much more zoomed in"; DECISIONS 2026-09-22).
 *
 * The point is **Detroit City Hall** — the Coleman A. Young Municipal Center — which the app already carries, in
 * code, as the civic reference point of the `detroit` service area (`SERVICE_AREAS` in
 * apps/android/query/.../Areas.kt, the Kotlin copy of packages/query/src/areas.ts). Reused rather than re-typed,
 * so there is one Detroit-centre number on all three clients; and it is the published address of a public
 * building, which says nothing about anybody.
 */
val MAP_ANCHOR: LatLon = SERVICE_AREAS.getValue("detroit").point!!

/**
 * Two and a half miles, in metres: the anchor view is a little wider than the you-are-here view, because the
 * anchor is the city's front door and not where the person actually is.
 */
const val ANCHOR_RADIUS_METERS = 4023.36

/**
 * The opening view of the Map tab, as a point and a radius — the one decision behind "how far out does the map
 * open?", so the first view and "centre on me" are the same arithmetic ([MapCamera.forRadius]) with a different
 * centre. A location already known — allowed earlier, or the centre of a ZIP a person typed — wins and keeps
 * today's two-mile view; with none, the map opens on the anchor instead of the whole four-city region.
 *
 * Pure, and the same three lines on all three clients (`openingView` in apps/web/src/locate.ts and
 * apps/ios/Sources/HelpCore/Locate.swift). Nothing is stored: it is arithmetic about a view.
 */
fun openingView(here: LatLon?): Pair<LatLon, Double> =
    if (here != null) here to LOCATE_RADIUS_METERS else MAP_ANCHOR to ANCHOR_RADIUS_METERS

// ---- what the tab does when it opens ----------------------------------------------------------------------------

/** What the system already knows, before anybody is asked anything. */
enum class LocatePermission { GRANTED, DENIED, PROMPT, UNKNOWN }

enum class FirstOpenAction {
    /** Our own card, over the map. Only ever on a first open, and only once per install. */
    SHOW_CARD,

    /** Straight to the two-mile view: permission is already given, so the card has nothing left to explain. */
    CENTRE_ON_PERSON,

    /** A ZIP the person typed. They already said where to look, and a typed ZIP is not where they are. */
    CENTRE_ON_ZIP,

    /** The city, as before. */
    NONE,
}

/**
 * The whole decision, in five lines, shared by all three clients.
 *
 *  - A typed ZIP wins over everything: asking for a location on top of one a person chose is nagging.
 *  - Permission already given (say, "Use my location" on Home) means there is nothing to explain: go there.
 *  - Permission already refused means the dialog would not appear, so the card would be a dead end. The
 *    "Use my location" button stays, and says how to turn it on in Settings.
 *  - Otherwise the card, once; answering it is what stops it coming back.
 */
fun firstOpenAction(
    flagAnswered: Boolean,
    permission: LocatePermission,
    hasNearFromZip: Boolean,
): FirstOpenAction {
    if (hasNearFromZip) return FirstOpenAction.CENTRE_ON_ZIP
    if (permission == LocatePermission.GRANTED) return FirstOpenAction.CENTRE_ON_PERSON
    if (permission == LocatePermission.DENIED) return FirstOpenAction.NONE
    if (flagAnswered) return FirstOpenAction.NONE
    return FirstOpenAction.SHOW_CARD
}

// ---- the one thing this phone remembers --------------------------------------------------------------------------

/**
 * Whether the first-open card has been answered on this phone. A small file in the app's own private storage,
 * written atomically — a new file beside the old one, then a rename — exactly as [MapLayerStore] and SavedStore
 * are, and never `SharedPreferences`.
 *
 * It holds one byte's worth of meaning and nothing else. There is deliberately no place in it to put a position.
 */
class LocateFlagStore(private val dir: File) {

    private val file = File(dir, "map-locate.json")

    var answered: Boolean = false
        private set

    init {
        answered = try {
            org.help313.query.Json.parse(file.readBytes())["answered"]?.bool == true
        } catch (_: Throwable) {
            false
        }
    }

    /** Returns false only when it could not be written down; the card still closes, and comes back next launch. */
    fun markAnswered(): Boolean = write(true)

    /**
     * "Make a new key" and the rest of the clear-data flow leave this alone, exactly as they leave the layer
     * choices alone: it is a preference about a screen, not anything about a person. Here for a flow that does
     * want it back — uninstalling, and the tests.
     */
    fun forget(): Boolean = write(false)

    private fun write(value: Boolean): Boolean = try {
        answered = value
        dir.mkdirs()
        val temp = File(dir, "map-locate.json.new")
        temp.writeBytes("{\"answered\":$value}".toByteArray(Charsets.UTF_8))
        if (!temp.renameTo(file)) {
            // Some filesystems refuse a rename onto an existing file; the old answer is still on disk right up
            // to the delete.
            file.delete()
            if (!temp.renameTo(file)) throw java.io.IOException("could not replace ${file.name}")
        }
        true
    } catch (_: Throwable) {
        false
    }
}
