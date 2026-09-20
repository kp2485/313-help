// Runs every case in schema/fixtures/*.json — the same files packages/query/test/fixtures.test.ts and
// apps/ios/Tests/DetroitQueryTests/FixtureTests.swift run. If the web, the iPhone and Android ever disagree about
// when a pantry is open, one of these fails.
//
// The logic lives here, in plain Kotlin with no test framework, so it can be run three ways:
//   ./gradlew :query:test          (JUnit, what CI runs)
//   ./gradlew :query:runFixtures   (no JUnit on the classpath)
//   kotlinc ... && java -cp ... org.help313.query.FixturesKt   (no Gradle at all)
package org.help313.query

import java.io.File
import kotlin.system.exitProcess

class FixtureResult(val ran: Int, val failures: List<String>)

private val DEFAULTS_JSON = """
{
  "org": "Test Org", "category": "food.pantry", "what": "Free groceries", "phones": [], "flags": [],
  "availability": "scheduled", "schedules": [], "status": "active",
  "facts": { "reports": { "closed_open": 0, "wrong_open": 0 }, "source": { "type": "seed_list", "name": "test" } }
}
"""

/** The fixtures' row defaults, merged the way the TypeScript and Swift runners merge them. */
private fun mergedRow(raw: Json): BundleRow {
    val defaults = Json.parse(DEFAULTS_JSON).obj
    val fields = LinkedHashMap<String, Json>(defaults)
    fields.putAll(raw.obj)
    fields["name"] = raw.obj["name"] ?: raw.obj["id"] ?: Json.Str("")
    // facts is merged one level deep: a fixture that gives only `reports` still gets the default `source`.
    val facts = LinkedHashMap<String, Json>(defaults.getValue("facts").obj)
    facts.putAll(raw.obj["facts"]?.obj ?: emptyMap())
    fields["facts"] = Json.Obj(facts)
    return BundleRow.fromJson(Json.Obj(fields))
}

/** vitest's toMatchObject: every key in `expected` must match; extra keys in `actual` are fine. */
@Suppress("UNCHECKED_CAST")
private fun matches(actual: Any?, expected: Json?): Boolean = when (expected) {
    null, is Json.Null -> actual == null
    is Json.Bool -> actual == expected.value
    is Json.Str -> actual is String && actual == expected.value
    is Json.Num -> when (actual) {
        is Number -> actual.toDouble() == expected.value
        is String -> actual == numberText(expected.value) || actual.toDoubleOrNull() == expected.value
        else -> false
    }
    is Json.Arr -> actual is List<*> && actual.size == expected.items.size &&
        actual.indices.all { matches(actual[it], expected.items[it]) }
    is Json.Obj -> {
        val m = actual as? Map<String, Any?>
        m != null && expected.fields.all { (k, v) ->
            // A key whose expected value is null must be present-and-null, or absent; anything else must match.
            if (v is Json.Null) m[k] == null else m.containsKey(k) && matches(m[k], v)
        }
    }
}

private fun numberText(d: Double): String =
    if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()

private fun openMap(o: OpenResult): Map<String, Any?> {
    val m = LinkedHashMap<String, Any?>()
    m["state"] = o.state.wire
    o.closesAt?.let { m["closes_at"] = it }
    o.minutesLeft?.let { m["minutes_left"] = it }
    if (o.state == OpenState.CLOSED) {
        m["next"] = o.next?.let { mapOf("date" to it.date, "opens_at" to it.opensAt, "closes_at" to it.closesAt) }
    }
    if (o.cancelledNow) m["cancelled_now"] = true
    return m
}

private fun badgeMap(b: Badge): Map<String, Any?> =
    mapOf("level" to b.level, "key" to b.key, "params" to b.params, "tier" to b.tier)

private fun queryOf(raw: Json?): Query {
    if (raw == null) return Query()
    val near = raw["near"]
    return Query(
        category = raw["category"]?.str,
        flags = raw.strings("flags"),
        prefer = raw.strings("prefer"),
        near = if (near != null && near["lat"]?.num != null && near["lon"]?.num != null)
            LatLon(near["lat"]!!.num!!, near["lon"]!!.num!!) else null,
        mode = raw["mode"]?.str ?: "now",
    )
}

/** Finds schema/fixtures by walking up from the working directory, or -Dfixtures.dir=... */
fun fixturesDir(): File {
    System.getProperty("fixtures.dir")?.let { return File(it) }
    var dir: File? = File(".").absoluteFile
    while (dir != null) {
        val candidate = File(dir, "schema/fixtures")
        if (candidate.isDirectory) return candidate
        dir = dir.parentFile
    }
    throw IllegalStateException("schema/fixtures not found from ${File(".").absolutePath}")
}

fun runFixtures(dir: File = fixturesDir()): FixtureResult {
    val files = (dir.listFiles() ?: emptyArray()).filter { it.name.endsWith(".json") }.sortedBy { it.name }
    check(files.size >= 10) { "fixtures not found at ${dir.absolutePath}" }
    var ran = 0
    val failures = ArrayList<String>()

    for (file in files) {
        val fx = Json.parse(file.readText(Charsets.UTF_8))
        val rows = (fx["rows"]?.arr ?: emptyList()).map { mergedRow(it) }
        val alerts = (fx["alerts"]?.arr ?: emptyList()).map { Alert.fromJson(it) }
        val segments = (fx["segments"]?.arr ?: emptyList()).map { Segment.fromJson(it) }

        for (c in fx["cases"]?.arr ?: emptyList()) {
            val name = "${file.name} - ${c["name"]?.str}"
            ran++
            val now = parseInstant(c["now"]?.str ?: "")
            if (now == null) { failures.add("$name: unreadable now"); continue }
            val row = c["row"]?.str?.let { id -> rows.firstOrNull { it.id == id } }
            val seg = c["segment"]?.str?.let { id -> segments.firstOrNull { it.id == id } }
            val expect = (c as Json.Obj).fields["expect"]
            val index = c["index"]

            fun fail(got: Any?) { failures.add("$name: got $got") }

            when (c["fn"]?.str) {
                "openNow" -> {
                    val got = openMap(openNow(row!!, now, alerts))
                    if (!matches(got, expect)) fail(got)
                }
                "nextOccurrences" -> {
                    val got = nextOccurrences(row!!, now, c["n"]?.int ?: 3, alerts)
                        .map { "${it.date} ${it.opensAt}-${it.closesAt}" }
                    if (!matches(got, expect)) fail(got)
                }
                "badge" -> {
                    val got = badgeMap(badge(row!!, now))
                    if (!matches(got, expect)) fail(got)
                }
                "rank" -> {
                    val got = rank(rows, queryOf(c["query"]), now, alerts).map { it.row.id }
                    if (!matches(got, expect)) fail(got)
                }
                "search" -> {
                    val got = search(rows, c["text"]?.str ?: "", queryOf(c["query"]), now, alerts).map { it.row.id }
                    if (!matches(got, expect)) fail(got)
                }
                "bundleAge" -> {
                    val got = bundleAge(index?.get("generated_at")?.str ?: "", index?.get("retired")?.bool ?: false, now).wire
                    if (!matches(got, expect)) fail(got)
                }
                "effectiveNow" -> {
                    val got = isoUtc(effectiveNow(now, index?.get("generated_at")?.str))
                    if (!matches(got, expect)) fail(got)
                }
                "helpAlong" -> {
                    val got = helpAlong(rows, seg!!).map { it.row.id }
                    if (!matches(got, expect)) fail(got)
                }
                "milesToSegment" -> {
                    val r = row!!
                    val got = milesToSegment(LatLon(r.lat!!, r.lon!!), seg!!)
                    val want = expect?.num ?: Double.NaN
                    val tolerance = c["tolerance"]?.num ?: 0.01
                    if (Math.abs(got - want) >= tolerance) fail(got)
                }
                "nearestSegment" -> {
                    val r = row!!
                    val hit = nearestSegment(
                        LatLon(r.lat!!, r.lon!!), segments,
                        openOnly = c["openOnly"]?.bool ?: false,
                        maxMiles = c["maxMiles"]?.num ?: Double.POSITIVE_INFINITY,
                    )
                    if (!matches(hit?.segment?.id, expect)) fail(hit?.segment?.id)
                }
                else -> failures.add("$name: unknown fn ${c["fn"]?.str}")
            }
        }
    }
    return FixtureResult(ran, failures)
}

fun main() {
    val r = runFixtures()
    println("fixtures: ${r.ran} cases, ${r.failures.size} failed")
    r.failures.forEach { println("  FAIL $it") }
    if (r.failures.isNotEmpty() || r.ran < 80) exitProcess(1)
}
