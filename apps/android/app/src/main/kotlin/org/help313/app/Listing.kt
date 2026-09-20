// Small rules about one listing, the Kotlin copy of apps/ios/HelpApp/Listing.swift and the web app's
// apps/web/src/directions.ts. Nothing here is about a person.
//
// Some rows are somewhere real but publish no street address a person could read out: the 26 Wayne County
// naloxone and test-strip stations (`sal_wws_*`, harm.supplies) have a point on a map and nothing else. Those
// still get directions, from the coordinate. **A coordinate is never printed as if it were an address**: it only
// ever goes to the maps app the person chose to open.
package org.help313.app

import org.help313.query.BundleRow

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

/** A listing with no published phone number shows no Call button at all, rather than one that does nothing. */
fun hasPhone(row: BundleRow): Boolean = row.phones.isNotEmpty()

/**
 * A place that is somewhere real but publishes no street address. The screen says so in the source's own name
 * (`detail.where_no_address`) and offers directions to the point; it never invents an address.
 */
fun showsPointWithoutAddress(row: BundleRow): Boolean =
    row.address == null && !isSensitive(row.category) && row.lat != null && row.lon != null
