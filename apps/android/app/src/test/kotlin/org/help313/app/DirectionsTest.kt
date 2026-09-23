// What the app does with the street graph, on a plain JVM: the cache key, the decode, and the three states.
// The rules themselves are `:query`'s and are checked by schema/fixtures; this is the holding.
package org.help313.app

import org.help313.query.PackedStreets
import org.help313.query.StreetGraphCache
import org.help313.query.TransitLayerFiles
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

    @Test
    fun theGraphIsBuiltOnceAndThenComesFromTheCache() {
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
        assertTrue("built", ready != null)
        val g = ready!!.graph
        assertTrue("${g.nodeCount} nodes", g.nodeCount > 20_000)
        assertTrue("built in ${Directions.lastBuildMs} ms", Directions.lastBuildMs < 10_000)
        println("street graph: ${g.nodeCount} nodes, ${g.edgeCount} edges, built in ${Directions.lastBuildMs} ms on this JVM")

        // the same key again is the held state: no second read of the files, no second build
        var again: Directions.State.Ready? = null
        Directions.prepare("key-one", read) { if (it is Directions.State.Ready) again = it }
        assertEquals("the files were read once", 1, reads)
        assertTrue("the same graph object", again!!.graph === g)
        assertTrue(StreetGraphCache.holds("key-one"))
        assertTrue(Directions.isReady("key-one"))
        Directions.reset()
    }
}
