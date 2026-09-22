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
