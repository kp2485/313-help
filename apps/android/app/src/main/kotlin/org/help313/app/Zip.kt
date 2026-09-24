// "Type a ZIP code": the one way to say roughly where you are without being asked for your location.
//
// No android.* class here, so `:core` runs every rule on a plain JDK. The bundle carries one point per ZIP — its
// centre, and nothing else — in `places/zips.json`, which is checked against the sha256 in the **signed** index
// before a byte of it is decoded (BundleStore.verifiedBytes), exactly as every other bundle file is.
//
// **A typed ZIP is memory only.** It sorts a list and moves a map while the app is open, and that is all: it is
// never written to a file, never put in a link, never sent to the Worker, and never kept in a Route (Route.kt is
// what survives a recreation, and nothing there holds it). It is not sensitive — a ZIP is a hundred thousand
// people — but it is still something a person typed about themselves, and the rule for that in this app is that
// it stays on the phone.
//
// The web half is the ZIP control in apps/web/src/main.ts; the shared cases are `zip_cases` in
// schema/neighborhoods/points.json.
package org.help313.app

import org.help313.query.Json
import org.help313.query.LatLon

/** The bundle file that carries the ZIP centres. */
const val ZIP_FILE = "places/zips.json"

/**
 * `{ "zips": { "48226": [lat, lon], … } }` — every ZIP of every city and township a DDOT or SMART bus stops in
 * (37 while the area was four cities, until 2026-09-24).
 *
 * Throws on anything that is not that, and the caller treats a throw as "the ZIP list could not be read", never as
 * "there are no ZIPs".
 */
fun decodeZips(bytes: ByteArray): Map<String, LatLon> {
    val out = LinkedHashMap<String, LatLon>()
    for ((zip, point) in (Json.parse(bytes)["zips"]?.obj ?: emptyMap())) {
        val pair = point.arr
        val lat = pair.getOrNull(0)?.num ?: continue
        val lon = pair.getOrNull(1)?.num ?: continue
        out[zip] = LatLon(lat, lon)
    }
    return out
}

/**
 * What a person typed, as a ZIP, or null.
 *
 * Exactly five digits, and Latin ones: a keyboard set to Arabic or Bengali may write ٤٨٢٢٦, and a person typing
 * their own ZIP on their own phone should not have to know that the file we look it up in spells it the other way.
 * Spaces around it are ignored; anything else is not a ZIP and the screen says so rather than searching for it.
 */
fun cleanZip(typed: String): String? {
    val sb = StringBuilder(5)
    for (c in typed.trim()) {
        val digit = when (c) {
            in '0'..'9' -> c
            // Arabic-Indic and Bengali digits, in their own blocks, in order.
            in '٠'..'٩' -> '0' + (c - '٠')
            in '۰'..'۹' -> '0' + (c - '۰')
            in '০'..'৯' -> '0' + (c - '০')
            else -> return null
        }
        if (sb.length == 5) return null
        sb.append(digit)
    }
    return if (sb.length == 5) sb.toString() else null
}

/** What a typed ZIP turned out to be. Four answers, and each one has its own sentence on the screen. */
sealed class ZipAnswer {

    /** Not five digits. The field says so and nothing is looked up. */
    object NotAZip : ZipAnswer()

    /** Five digits, but not one the bundle carries (`loc.zip_unknown`). */
    object Unknown : ZipAnswer()

    /**
     * A ZIP the bundle carries whose centre is outside the service area's box. The list is for that area, so
     * sorting it by distance from somewhere else is a worse answer than not sorting it.
     */
    object Outside : ZipAnswer()

    /** A ZIP, and the point at the middle of it. */
    class Found(val zip: String, val point: LatLon) : ZipAnswer()
}

/**
 * The whole rule, in five lines, and the only place a typed ZIP becomes a point.
 *
 * `zips` may be empty — an older bundle, or a file that could not be read — and then every ZIP is [Unknown],
 * which is the honest answer and never a guess at a coordinate.
 */
fun lookupZip(zips: Map<String, LatLon>, typed: String): ZipAnswer {
    val zip = cleanZip(typed) ?: return ZipAnswer.NotAZip
    val point = zips[zip] ?: return ZipAnswer.Unknown
    if (!inServiceArea(point)) return ZipAnswer.Outside
    return ZipAnswer.Found(zip, point)
}
