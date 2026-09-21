// Greenway geometry (docs/11), all on the device. Port of packages/query/src/places.ts.
//   - "Help along the Greenway": rows within a 10-minute walk of a segment
//   - "0.3 mi from the Joe Louis Greenway" on a help listing
//   - snapping a condition report to a segment id, so raw GPS never leaves the phone
package org.help313.query

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min

/** About a 10-minute walk or roll. */
const val WALK_MILES = 0.5

private const val MILES_PER_DEG_LAT = 69.09

/** Miles from a point to a polyline of [lon, lat]. Flat-earth projection; negligible error at city scale. */
fun milesToLine(pt: LatLon, line: List<DoubleArray>): Double {
    if (line.isEmpty()) return Double.POSITIVE_INFINITY
    val kx = MILES_PER_DEG_LAT * cos(pt.lat * Math.PI / 180.0)
    val xs = DoubleArray(line.size)
    val ys = DoubleArray(line.size)
    for (i in line.indices) {
        xs[i] = (line[i][0] - pt.lon) * kx
        ys[i] = (line[i][1] - pt.lat) * MILES_PER_DEG_LAT
    }
    if (line.size == 1) return hypot(xs[0], ys[0])
    var best = Double.POSITIVE_INFINITY
    for (i in 0 until line.size - 1) {
        val ax = xs[i]; val ay = ys[i]
        val dx = xs[i + 1] - ax; val dy = ys[i + 1] - ay
        val len2 = dx * dx + dy * dy
        val t = if (len2 == 0.0) 0.0 else maxOf(0.0, minOf(1.0, -(ax * dx + ay * dy) / len2))
        best = min(best, hypot(ax + t * dx, ay + t * dy))
    }
    return best
}

fun milesToSegment(pt: LatLon, seg: Segment): Double =
    seg.lines.minOfOrNull { milesToLine(pt, it) } ?: Double.POSITIVE_INFINITY

data class NearbyRow(val row: BundleRow, val miles: Double)

/**
 * Active rows within walking distance of a segment, nearest first.
 * Rows without coordinates (hotlines, DV) never appear.
 */
fun helpAlong(rows: List<BundleRow>, seg: Segment, maxMiles: Double = WALK_MILES): List<NearbyRow> =
    rows.asSequence()
        .filter { it.status == "active" && it.lat != null && it.lon != null }
        .map { NearbyRow(it, milesToSegment(LatLon(it.lat!!, it.lon!!), seg)) }
        .filter { it.miles <= maxMiles }
        .sortedWith(compareBy({ it.miles }, { it.row.id }))
        .toList()

data class SegmentHit(val segment: Segment, val miles: Double)

/**
 * Nearest segment to a point. Used two ways: the "near the greenway" line on a listing (openOnly, so we never
 * send someone to a trail that is not built), and snapping a condition report to a segment id on the device.
 */
fun nearestSegment(
    pt: LatLon,
    segs: List<Segment>,
    openOnly: Boolean = false,
    maxMiles: Double = Double.POSITIVE_INFINITY,
): SegmentHit? {
    var best: SegmentHit? = null
    for (segment in segs) {
        if (openOnly && segment.phase != "open") continue
        val mi = milesToSegment(pt, segment)
        val held = best
        if (held == null || mi < held.miles) best = SegmentHit(segment, mi)
    }
    val found = best ?: return null
    return if (found.miles <= maxMiles) found else null
}
