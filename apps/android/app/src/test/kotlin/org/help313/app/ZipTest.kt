// A typed ZIP (Zip.kt): what counts as one, what the bundle knows about it, and what the screen says when it
// does not. Plain JVM, so `:core` runs it.
package org.help313.app

import org.help313.query.LatLon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ZipTest {

    private val root = File("../../..")

    /**
     * The ZIP centres out of the bundle, or **null when there is no bundle**: CI builds none (the android job is
     * JDK-only), so a test that needs the file returns early and prints the sentence GuardsTest prints, exactly as
     * HoodsTest does. Everything that does not need it — what counts as a ZIP, and what an empty list answers —
     * runs everywhere.
     */
    private fun shipped(): Map<String, LatLon>? {
        val f = File(root, "data/bundle/v1/$ZIP_FILE")
        if (!f.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return null
        }
        return decodeZips(f.readBytes())
    }

    /** The real file the app ships, not a fixture. */
    @Test
    fun theShippedZipFileDecodes() {
        val zips = shipped() ?: return
        // Every ZIP of every city and township a DDOT or SMART bus stops in (2026-09-24; 37 for four cities before).
        assertTrue("only ${zips.size} ZIPs", zips.size >= 100)
        assertTrue("48226 is downtown Detroit", zips.containsKey("48226"))
        for ((zip, point) in zips) {
            assertEquals("a ZIP that is not five digits: $zip", 5, zip.length)
            assertTrue("$zip is at ${point.lat}, ${point.lon}", inServiceArea(point))
        }
    }

    @Test
    fun fiveDigitsAndNothingElseIsAZip() {
        assertEquals("48226", cleanZip("48226"))
        assertEquals("48226", cleanZip("  48226 "))
        assertNull("four digits", cleanZip("4822"))
        assertNull("six digits", cleanZip("482260"))
        assertNull("letters", cleanZip("4822a"))
        assertNull("a ZIP+4 is not something the bundle knows", cleanZip("48226-1234"))
        assertNull("empty", cleanZip(""))
        assertNull("spaces inside", cleanZip("482 26"))
        // A keyboard set to Arabic or Bengali writes its own digits; a person typing their own ZIP should not have
        // to know which digits the file we look it up in uses.
        assertEquals("48226", cleanZip("٤٨٢٢٦"))
        assertEquals("48226", cleanZip("৪৮২২৬"))
    }

    @Test
    fun aZipBecomesAPointOrAPlainRefusal() {
        // An empty list is an older bundle or a file that could not be read: every ZIP is unknown, and no point is
        // ever guessed at. This half needs no bundle and runs everywhere.
        assertTrue(lookupZip(emptyMap(), "48226") is ZipAnswer.Unknown)
        assertTrue("letters are not a ZIP", lookupZip(emptyMap(), "hello") is ZipAnswer.NotAZip)
        // A ZIP a list carries whose middle is outside the service area is refused rather than used.
        assertTrue(lookupZip(mapOf("99999" to LatLon(45.0, -90.0)), "99999") is ZipAnswer.Outside)

        val zips = shipped() ?: return
        val found = lookupZip(zips, "48226")
        assertTrue("48226 should be a point", found is ZipAnswer.Found)
        assertEquals("48226", (found as ZipAnswer.Found).zip)
        assertTrue("48226 is in the service area", inServiceArea(found.point))

        assertTrue("a ZIP the bundle has never heard of", lookupZip(zips, "90210") is ZipAnswer.Unknown)
    }

    /**
     * The shared cases: a ZIP's centre decides which neighborhood page it opens
     * (`zip_cases` in schema/neighborhoods/points.json, the same table the web and the iPhone app run).
     */
    @Test
    fun theSharedZipCasesLandWhereTheySay() {
        val zips = shipped() ?: return
        val d = decodeIndicators(File(root, "data/bundle/v1/$HOOD_FILE").readBytes())
        val cases = org.help313.query.Json.parse(File(root, "schema/neighborhoods/points.json").readBytes())
        val list = cases["zip_cases"]!!.arr
        assertTrue("no shared ZIP cases", list.isNotEmpty())
        for (c in list) {
            val zip = c["zip"]!!.str!!
            val answer = lookupZip(zips, zip)
            assertTrue("$zip is not in the bundle", answer is ZipAnswer.Found)
            val found = hoodsForZip(d, (answer as ZipAnswer.Found).point)
            assertEquals(c["name"]?.str ?: zip, c["expect"]!!.arr.mapNotNull { it.str }, found.map { it.id })
        }
    }
}
