// What the app does with the street files, on a plain JVM: the key, the decode, the three states, and the one
// call that plans a trip on its own window graph. The rules themselves are `:query`'s and are checked by
// schema/fixtures; this is the holding.
package org.help313.app

import org.help313.query.LatLon
import org.help313.query.PackedStreets
import org.help313.query.StreetGraphCache
import org.help313.query.TransitLayerFiles
import org.help313.query.WalkLeg
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DirectionsTest {

    private fun repo(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            if (File(dir, "schema/fixtures").isDirectory) return dir
            dir = dir.parentFile
        }
        throw IllegalStateException("repository not found")
    }

    private fun index(baseSha: String, streetsSha: String, foodSha: String = "irrelevant"): BundleIndex =
        BundleIndex(
            version = "1", generatedAt = "2026-09-22T00:00Z", retired = false, signing = "dev",
            emergencyVerified = true,
            files = mapOf(
                "map/base.json" to FileMeta(baseSha, 1),
                "map/streets.json" to FileMeta(streetsSha, 1),
                "category/food.json" to FileMeta(foodSha, 1),
            ),
        )

    @Test
    fun theKeyIsTheStreetFilesAndOnlyTheStreetFiles() {
        val a = Directions.graphKey(index("aa", "bb"))
        val b = Directions.graphKey(index("aa", "bb"))
        assertEquals("the same bundle is the same key", a, b)
        assertNotEquals("a new streets file is a new key", a, Directions.graphKey(index("aa", "cc")))
        assertEquals("64 hex characters", 64, a.length)
        // a category file changing is NOT a new graph
        assertEquals(a, Directions.graphKey(index("aa", "bb", "something else")))
    }

    @Test
    fun aBundleWithNoStreetFilesIsUnavailableNotAnError() {
        Directions.reset()
        val seen = ArrayList<String>()
        Directions.prepare("empty", { null }) { seen.add(it.javaClass.simpleName) }
        assertEquals(listOf("Building", "Unavailable"), seen)
        assertTrue(Directions.current() is Directions.State.Unavailable)
        Directions.reset()
    }

    @Test
    fun aBrokenFileIsUnavailableAndNeverThrows() {
        Directions.reset()
        var last: Directions.State? = null
        Directions.prepare("broken", { throw IllegalStateException("bad file") }) { last = it }
        assertTrue(last is Directions.State.Unavailable)
        Directions.reset()
    }

    /**
     * The hang found on 2026-09-23: Directions, then back while "Getting the map ready" is up, then Directions to
     * somewhere else. The second screen asked for the graph while the first build still ran and was answered by
     * nobody, so it waited for good. Now it is told `Building`, then the same result as the first caller.
     */
    @Test
    fun aSecondAskWhileTheFirstBuildRunsIsAnsweredToo() {
        Directions.reset()
        val reading = CountDownLatch(1)
        val release = CountDownLatch(1)
        var reads = 0
        val read: () -> Pair<List<PackedStreets>, List<TransitLayerFiles>>? = {
            reads++
            reading.countDown()
            release.await(10, TimeUnit.SECONDS)
            null                                           // the answer itself does not matter here, only that it comes
        }
        val first = ArrayList<String>()
        val builder = Thread { Directions.prepare("slow", read) { first.add(it.javaClass.simpleName) } }
        builder.start()
        assertTrue("the first build started", reading.await(10, TimeUnit.SECONDS))

        val second = ArrayList<String>()
        val done = CountDownLatch(1)
        Directions.prepare("slow", read) { second.add(it.javaClass.simpleName); if (it !is Directions.State.Building) done.countDown() }
        assertEquals("told at once that the map is being got ready", listOf("Building"), second)

        release.countDown()
        builder.join(10_000)
        assertTrue("the second caller hears the result", done.await(10, TimeUnit.SECONDS))
        assertEquals(listOf("Building", "Unavailable"), first)
        assertEquals(listOf("Building", "Unavailable"), second)
        assertEquals("the files were read once, not twice", 1, reads)

        // and nothing is left waiting: the next ask starts from the finished state
        val third = ArrayList<String>()
        Directions.prepare("other", { null }) { third.add(it.javaClass.simpleName) }
        assertEquals(listOf("Building", "Unavailable"), third)
        Directions.reset()
    }

    /** Two short streets that cross, in the bundle's own packed shape (the web's dirworker test uses the same). */
    private val crossing = PackedStreets(
        origin = doubleArrayOf(-83.05, 42.33),
        names = listOf("Woodward Ave", "Warren Ave"),
        roads = listOf(
            PackedStreets.Road(3, 0, intArrayOf(0, 0, 0, 200)),
            PackedStreets.Road(3, 1, intArrayOf(0, 100, 200, 0)),
        ),
    )

    @Test
    fun aPhoneWithStreetsAndNoTransitFilesStillGetsWalkingDirections() {
        Directions.reset()
        var ready: Directions.State.Ready? = null
        Directions.prepare("walk-only", { Pair(listOf(crossing), emptyList()) }) { if (it is Directions.State.Ready) ready = it }
        assertTrue("ready", ready != null)
        assertTrue("no transit files is no network, not a failure", ready!!.network == null)
        val plans = Directions.planTrip(ready!!, LatLon(42.33, -83.05), LatLon(42.331, -83.05))
        assertTrue("a walk", plans.isNotEmpty())
        for (p in plans) assertTrue(p.legs.all { it is WalkLeg })
        Directions.reset()
    }

    /**
     * A window graph is the streets round two points a person asked about, so it is never kept (schema/query-spec.md
     * "The trip window"): every plan builds its own, and nothing is left in the street-graph cache afterwards.
     */
    @Test
    fun aTripsWindowGraphIsBuiltForThePlanAndNeverKept() {
        Directions.reset()
        StreetGraphCache.clear()
        var ready: Directions.State.Ready? = null
        Directions.prepare("window", { Pair(listOf(crossing), emptyList()) }) { if (it is Directions.State.Ready) ready = it }
        val from = LatLon(42.33, -83.05)
        val to = LatLon(42.331, -83.05)
        val one = Directions.windowGraph(ready!!, from, to)
        val two = Directions.windowGraph(ready!!, from, to)
        assertTrue("a new graph for every plan", one !== two)
        assertEquals("no key: a window graph is never filed under anything", "", one.key)
        assertEquals(one.nodeCount, two.nodeCount)
        Directions.planTrip(ready!!, from, to)
        assertTrue("nothing reached the cache", !StreetGraphCache.holds("window"))
        Directions.reset()
    }

    @Test
    fun theFilesAreReadOnceAndATripBuildsOnlyItsWindow() {
        val base = File(repo(), "data/bundle/v1/map/base.json")
        val streets = File(repo(), "data/bundle/v1/map/streets.json")
        if (!base.isFile) {
            println("no bundle built (pnpm build:bundle) - skipping")
            return
        }
        Directions.reset()
        val files = Directions.streetFiles(base.readBytes(), if (streets.isFile) streets.readBytes() else null)
        assertTrue("base plus its cells", files.size > 1)
        var reads = 0
        val read: () -> Pair<List<PackedStreets>, List<TransitLayerFiles>>? = { reads++; Pair(files, emptyList()) }

        var ready: Directions.State.Ready? = null
        Directions.prepare("key-one", read) { if (it is Directions.State.Ready) ready = it }
        assertTrue("read", ready != null)
        assertTrue(Directions.isReady("key-one"))

        // the same key again is the held state: no second read of the files
        var again: Directions.State.Ready? = null
        Directions.prepare("key-one", read) { if (it is Directions.State.Ready) again = it }
        assertEquals("the files were read once", 1, reads)
        assertTrue("the same held files", again === ready)

        // The study's trip (Woodward at W Grand Blvd to 12028 Yellowstone): a walk-only window over the whole area is
        // still a small part of it, and it is built in well under the time the whole area takes.
        val t = System.currentTimeMillis()
        val g = Directions.windowGraph(ready!!, LatLon(42.3697, -83.0742), LatLon(42.377459, -83.135296))
        val ms = System.currentTimeMillis() - t
        println("window graph: ${g.nodeCount} nodes, ${g.edgeCount} edges, built in $ms ms on this JVM")
        assertTrue("${g.nodeCount} nodes", g.nodeCount in 1..60_000)
        assertTrue("built in $ms ms", ms < 10_000)
        Directions.reset()
    }
}
