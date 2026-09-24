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

// ---- the service area, as a box --------------------------------------------------------------------------------

/**
 * Every city and township a DDOT or SMART bus stops in (Kyle, 2026-09-24; `pnpm ingest:region` writes the list and
 * the box round its outlines to data/ingested/region.json). It was four cities until 2026-09-24 (lat 42.25–42.46,
 * lon −83.33 to −82.91). The same numbers as `SERVICE_BBOX` in packages/query and `serviceBox` in
 * apps/ios/Sources/HelpCore/Locate.swift.
 */
object ServiceBox {
    const val LAT_MIN = 42.11
    const val LAT_MAX = 42.80
    const val LON_MIN = -83.57
    const val LON_MAX = -82.70
}

/**
 * Whether a point is inside the service area's box. A fix that is not a number is not inside anything: the map is
 * not moved somewhere undefined.
 */
fun inServiceArea(lat: Double, lon: Double, slack: Double = 0.0): Boolean {
    if (lat.isNaN() || lon.isNaN() || lat.isInfinite() || lon.isInfinite()) return false
    return lat >= ServiceBox.LAT_MIN - slack && lat <= ServiceBox.LAT_MAX + slack &&
        lon >= ServiceBox.LON_MIN - slack && lon <= ServiceBox.LON_MAX + slack
}

fun inServiceArea(p: LatLon, slack: Double = 0.0): Boolean = inServiceArea(p.lat, p.lon, slack)

/**
 * The whole service area as two corners: what the Map tab's reset button frames, and what an Areas map opens on when
 * it has no place to open on. The web's `REGION` in apps/web/src/main.ts (the four cities' corners until 2026-09-24).
 */
val REGION_CORNERS: List<LatLon> =
    listOf(LatLon(ServiceBox.LAT_MIN, ServiceBox.LON_MIN), LatLon(ServiceBox.LAT_MAX, ServiceBox.LON_MAX))

/** Two miles, in metres. The shorter side of the map spans twice this: four miles across, the walk-and-bus city. */
const val LOCATE_RADIUS_METERS = 3218.688

/**
 * Where a map of Detroit looks when nobody has said where they are (Kyle, 2026-09-22: "the initial map
 * presentation needs to be much more zoomed in"; DECISIONS 2026-09-22).
 *
 * The place is **Detroit City Hall** — the Coleman A. Young Municipal Center — which the app already carries, in
 * code, as the civic reference point of the `detroit` service area ([CITY_HALL]); it is the published address of
 * a public building and says nothing about anybody, and it is still what the app says in words ("City Hall").
 *
 * The *centre of the view* is **0.6 mile up Woodward from it**, which is Grand Circus Park. City Hall itself sits
 * about a third of a mile from the river, so a two-mile box centred on it spends a third of its height on Windsor
 * and on the hatching that means "not our area" — a map whose lower half answers nothing. Nudging the centre up
 * Woodward puts the whole box on the city while keeping the same landmark.
 *
 * The number is pinned here rather than computed at run time so the three clients cannot drift (the same constant
 * is `MAP_ANCHOR` in apps/web/src/locate.ts):
 * lat 42.3293 + 0.6·cos(31.9°)·1609.344/111320, lon −83.0452 − 0.6·sin(31.9°)·1609.344/(111320·cos 42.35°).
 */
val CITY_HALL: LatLon = SERVICE_AREAS.getValue("detroit").point!!

/** How far up Woodward the opening view is nudged, in miles, and Woodward's bearing from downtown measured off
 *  the map (Campus Martius to New Center): 31.9° west of north. */
const val ANCHOR_NUDGE_MILES = 0.6
const val ANCHOR_BEARING_DEG = -31.9

val MAP_ANCHOR: LatLon = LatLon(42.3366, -83.0514)

/**
 * Two miles, as everywhere else (Kyle, 2026-09-22: "always a 2-mile radius"). It used to be two and a half here,
 * on the reasoning that the anchor is the city's front door rather than where the person is; Kyle's answer is that
 * one radius people can learn is worth more than that distinction.
 */
const val ANCHOR_RADIUS_METERS = LOCATE_RADIUS_METERS

/**
 * The opening view of the Map tab, as a point and a radius — the one decision behind "how far out does the map
 * open?", so the first view and "centre on me" are the same arithmetic ([MapCamera.forRadius]) with a different
 * centre. A location already known — allowed earlier, or the centre of a ZIP a person typed — wins and keeps
 * today's two-mile view; with none, the map opens on the anchor instead of the whole service area.
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

// ---- how long we listen ------------------------------------------------------------------------------------------

/**
 * **The ten-second give-up is gone** (Kyle, 2026-09-22; DECISIONS 2026-09-22). Two of the first people this app is
 * for are a survivor whose service has been cut off and a person without housing and without signal, and on a
 * phone with no network a cold GPS fix is a walk outside and a few minutes of sky — not ten seconds. Giving up at
 * ten and saying "we couldn't get your location" was the app telling the truth about its own patience and a lie
 * about the phone's.
 *
 * So the ask runs for **five minutes**, and after **ten seconds** the screen says what is happening and what would
 * help ("Still looking…"), with **Stop looking** beside it and the cross-street and ZIP ways in on the screen the
 * whole time. Cancelling stops us listening, so a fix that lands after the person has typed a junction never moves
 * the map out from under them.
 */
const val LOCATE_SLOW_MS = 10_000L
const val LOCATE_TIMEOUT_MS = 300_000L

/** The three answers our own card takes. "Type a cross street" is an answer too: a person who says where they are
 *  has said where they are, so the card closes, the field opens, and it is not shown again. */
enum class LocateCardAnswer { YES, NO, CROSS }

/**
 * What either of the three buttons does, as a decision rather than as three listeners — the same table as
 * `locateCardClick` in apps/web/src/locate.ts, so the clients cannot drift on the one rule that matters: **every**
 * answer marks the card answered, and only "yes" asks the system for anything.
 */
class LocateCardEffect(val ask: Boolean, val openCrossStreet: Boolean, val close: Boolean, val remember: Boolean)

fun locateCardClick(answer: LocateCardAnswer): LocateCardEffect = when (answer) {
    LocateCardAnswer.YES -> LocateCardEffect(ask = true, openCrossStreet = false, close = false, remember = true)
    LocateCardAnswer.CROSS -> LocateCardEffect(ask = false, openCrossStreet = true, close = true, remember = true)
    LocateCardAnswer.NO -> LocateCardEffect(ask = false, openCrossStreet = false, close = true, remember = true)
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
