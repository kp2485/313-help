// Small rules about one listing, the Kotlin copy of apps/ios/HelpApp/Listing.swift and the web app's
// apps/web/src/directions.ts. Nothing here is about a person.
//
// Some rows are somewhere real but publish no street address a person could read out: the 26 Wayne County
// naloxone and test-strip stations (`sal_wws_*`, harm.supplies) have a point on a map and nothing else. Those
// still get directions, from the coordinate. **A coordinate is never printed as if it were an address**: it only
// ever goes to the maps app the person chose to open.
package org.help313.app

import org.help313.query.BundleRow
import org.help313.query.isDvCategory
import org.help313.query.serviceAreaKey

/**
 * What a maps app is asked for: the written address when the place publishes one, otherwise its point.
 * Null when there is neither, and null for a sensitive listing (domestic violence, mental-health crisis), whose
 * rows carry no coordinates at all and are never handed to a maps app (docs/08).
 */
fun mapsDestination(row: BundleRow): String? {
    if (isSensitive(row.category)) return null
    row.address?.let { return "${it.line1}, ${it.city}, MI ${it.zip ?: ""}" }
    val lat = row.lat
    val lon = row.lon
    if (lat != null && lon != null) return "$lat,$lon"
    return null
}

/**
 * The destination handed to the Transit app (transitapp.com), or null when we would be offering a link that
 * cannot work. The Kotlin copy of `transitAppDestination` in apps/ios/HelpApp/Listing.swift and
 * `transitAppQuery` in apps/web/src/directions.ts.
 *
 * The coordinate comes **first** here, which is the reverse of `mapsDestination` and is deliberate: Transit's own
 * documentation says "User's current location is taken into account when geocoding address strings"
 * (docs/research/2026-09-20/transit-app.md), so a point lands where the publisher put the place and an address
 * string does not. A coordinate is still never printed as if it were an address; it is only ever passed through.
 *
 * Sensitive listings are gated exactly as they are for Directions: a domestic-violence or mental-health-crisis
 * row is never handed to another app, so it gets no Transit link either. Treatment keeps its directions, because
 * people have to get there, so it keeps this too.
 */
fun transitAppDestination(row: BundleRow): String? {
    if (isSensitive(row.category)) return null
    val lat = row.lat
    val lon = row.lon
    if (lat != null && lon != null) return "$lat,$lon"
    row.address?.let { return "${it.line1}, ${it.city}, MI ${it.zip ?: ""}" }
    return null
}

/** A listing with no published phone number shows no Call button at all, rather than one that does nothing. */
fun hasPhone(row: BundleRow): Boolean = row.phones.isNotEmpty()

/**
 * The string key naming the coarse area a domestic-violence row serves ("area.detroit"), or null when the row
 * is not a DV row or a steward has recorded no area. It is the only thing such a row ever says about where it
 * is: no address, no ZIP, no coordinate, no distance, no map and no directions (docs/08).
 * A screen puts it into `safe.dv_serves` ("Serves {area}").
 */
fun serviceAreaStringKey(row: BundleRow): String? =
    if (isDvCategory(row.category)) serviceAreaKey(row.serviceArea) else null

/**
 * Every domestic-violence listing carries the one sentence `safe.dv_no_address`: the shelter does not share
 * its address, call and they will say where to go. True whatever area is recorded, and true when none is.
 */
fun saysNoAddress(row: BundleRow): Boolean = isDvCategory(row.category)

/**
 * A place that is somewhere real but publishes no street address. The screen says so in the source's own name
 * (`detail.where_no_address`) and offers directions to the point; it never invents an address.
 */
fun showsPointWithoutAddress(row: BundleRow): Boolean =
    row.address == null && !isSensitive(row.category) && row.lat != null && row.lon != null
