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

    private fun shipped(): Map<String, LatLon> {
        val f = File(root, "data/bundle/v1/$ZIP_FILE")
        assertTrue("run `pnpm build:bundle` first: no ${f.path}", f.isFile)
        return decodeZips(f.readBytes())
    }

    /** The real file the app ships, not a fixture. */
    @Test
    fun theShippedZipFileDecodes() {
        val zips = shipped()
        assertTrue("only ${zips.size} ZIPs", zips.size >= 30)
        assertTrue("48226 is downtown Detroit", zips.containsKey("48226"))
        for ((zip, point) in zips) {
            assertEquals("a ZIP that is not five digits: $zip", 5, zip.length)
            assertTrue("$zip is at ${point.lat}, ${point.lon}", point.lat > 42.0 && point.lat < 42.7)
            assertTrue("$zip is at ${point.lat}, ${point.lon}", point.lon < -82.5 && point.lon > -83.6)
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
        val zips = shipped()
        val found = lookupZip(zips, "48226")
        assertTrue("48226 should be a point", found is ZipAnswer.Found)
        assertEquals("48226", (found as ZipAnswer.Found).zip)
        assertTrue("48226 is in the service area", inServiceArea(found.point))

        assertTrue("letters are not a ZIP", lookupZip(zips, "hello") is ZipAnswer.NotAZip)
        assertTrue("a ZIP the bundle has never heard of", lookupZip(zips, "90210") is ZipAnswer.Unknown)
        // An empty list is an older bundle or a file that could not be read: every ZIP is unknown, and no point is
        // ever guessed at.
        assertTrue(lookupZip(emptyMap(), "48226") is ZipAnswer.Unknown)
        // A ZIP the bundle carries whose middle is outside the four cities is refused rather than used.
        val far = mapOf("99999" to LatLon(45.0, -90.0))
        assertTrue(lookupZip(far, "99999") is ZipAnswer.Outside)
    }

    /**
     * The shared cases: a ZIP's centre decides which neighborhood page it opens
     * (`zip_cases` in schema/neighborhoods/points.json, the same table the web and the iPhone app run).
     */
    @Test
    fun theSharedZipCasesLandWhereTheySay() {
        val zips = shipped()
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
