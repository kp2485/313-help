// Plain JVM tests for the parts a mistake would be worst in: the signature check and the daily report hash.
// Nothing here touches an android.* class, so `./gradlew :app:testDebugUnitTest` runs it with no emulator.
package org.help313.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class VerifyTest {

    private fun hex(s: String): ByteArray {
        val out = ByteArray(s.length / 2)
        for (i in out.indices) out[i] = ((Character.digit(s[i * 2], 16) shl 4) or Character.digit(s[i * 2 + 1], 16)).toByte()
        return out
    }

    /** RFC 8032 section 7.1 test vectors. */
    private val vectors = listOf(
        Triple(
            "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
            "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
        ),
        Triple(
            "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
            "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
        ),
        Triple(
            "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025", "af82",
            "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
        ),
    )

    @Test
    fun rfc8032Vectors() {
        for ((pub, msg, sig) in vectors) {
            assertTrue("vector $pub", Ed25519.verify(hex(pub), hex(sig), hex(msg)))
        }
    }

    @Test
    fun refusesATamperedSignatureOrMessage() {
        val (pub, msg, sig) = vectors[1]
        val badSig = hex(sig).copyOf()
        badSig[0] = (badSig[0].toInt() xor 1).toByte()
        assertFalse(Ed25519.verify(hex(pub), badSig, hex(msg)))

        val badMsg = hex(msg).copyOf()
        badMsg[0] = (badMsg[0].toInt() xor 1).toByte()
        assertFalse(Ed25519.verify(hex(pub), hex(sig), badMsg))

        val otherKey = hex(vectors[0].first)
        assertFalse(Ed25519.verify(otherKey, hex(sig), hex(msg)))
    }

    @Test
    fun refusesMalformedInputWithoutThrowing() {
        assertFalse(Ed25519.verify(ByteArray(0), ByteArray(64), ByteArray(0)))
        assertFalse(Ed25519.verify(ByteArray(32), ByteArray(0), ByteArray(0)))
        assertFalse(Ed25519.verify(ByteArray(32) { 0xff.toByte() }, ByteArray(64) { 0xff.toByte() }, ByteArray(3)))
    }

    @Test
    fun readsAnSpkiPublicKey() {
        // The form the bundle's .sig file and BUNDLE_PUBLIC_KEYS use.
        val der = BundleCheck.base64("MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8=")!!
        assertEquals(44, der.size)
        val raw = Ed25519.rawKeyFromSpkiDer(der)
        assertTrue(raw != null && raw.size == 32)
        assertTrue(Ed25519.rawKeyFromSpkiDer(ByteArray(44)) == null)
    }

    @Test
    fun base64RejectsRubbish() {
        assertTrue(BundleCheck.base64("not base64!!") == null)
        assertTrue(BundleCheck.base64("") == null)
        assertEquals("hello", String(BundleCheck.base64("aGVsbG8=")!!))
    }

    @Test
    fun checksumsAreLowercaseHex() {
        assertEquals(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            BundleCheck.sha256Hex(ByteArray(0)),
        )
    }

    @Test
    fun mapsAndIndicatorsAreNotLoadedUpFront() {
        assertFalse(BundleCheck.loadedNow("map/42.json"))
        assertFalse(BundleCheck.loadedNow("indicators/nbh_downtown.json"))
        assertTrue(BundleCheck.loadedNow("category/food.json"))
        assertTrue(BundleCheck.loadedNow("index.json"))
    }

    /**
     * The real signed bundle, when one has been built. This is the check that would have caught a mistake in the
     * SPKI parsing or in the signature code: it is the file the app actually reads.
     */
    @Test
    fun theBundleInTheRepositoryVerifiesAgainstItsOwnKey() {
        val dir = File("../../../data/bundle/v1")
        val index = File(dir, "index.json")
        val sig = File(dir, "index.json.sig")
        if (!index.isFile || !sig.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return
        }
        val sigText = sig.readText()
        val pin = Regex("\"public_key\"\\s*:\\s*\"([^\"]+)\"").find(sigText)!!.groupValues[1]
        val verified = BundleCheck.verifiedIndex(index.readBytes(), sig.readBytes(), listOf(pin))
        assertTrue(verified.files.isNotEmpty())

        // Every file it lists matches its checksum.
        for ((name, meta) in verified.files) {
            val f = File(dir, name)
            if (!f.isFile) continue
            assertEquals(name, meta.sha256, BundleCheck.sha256Hex(f.readBytes()))
        }

        // A key that did not sign it is refused, and so is a changed index.
        val otherPin = "MCowBQYDK2VwAyEA" + "A".repeat(43) + "="
        try {
            BundleCheck.verifiedIndex(index.readBytes(), sig.readBytes(), listOf(otherPin))
            throw AssertionError("a bundle signed by another key was accepted")
        } catch (_: BundleError) {
            // expected
        }
        try {
            BundleCheck.verifiedIndex(index.readBytes() + ' '.code.toByte(), sig.readBytes(), listOf(pin))
            throw AssertionError("a changed index was accepted")
        } catch (_: BundleError) {
            // expected
        }
    }

    @Test
    fun anEmptyPinListAcceptsNothing() {
        try {
            BundleCheck.verifiedIndex("{}".toByteArray(), "{}".toByteArray(), emptyList())
            throw AssertionError("a build with no pinned keys accepted a bundle")
        } catch (e: BundleError) {
            assertTrue(e is BundleError.NoKeys)
        }
    }

    @Test
    fun theDailyHashChangesWithTheDayAndTheTarget() {
        val secret = "0".repeat(64)
        val morning = org.help313.query.parseInstant("2026-09-18T14:00:00Z")!!
        val evening = org.help313.query.parseInstant("2026-09-18T23:00:00Z")!!
        val nextDay = org.help313.query.parseInstant("2026-09-19T14:00:00Z")!!

        // Same phone, same listing, same Detroit day: one hash, so two taps count once.
        assertEquals(Reports.nonce(secret, "sal_a", morning), Reports.nonce(secret, "sal_a", evening))
        // Another day, or another listing: hashes nobody can connect.
        assertTrue(Reports.nonce(secret, "sal_a", morning) != Reports.nonce(secret, "sal_a", nextDay))
        assertTrue(Reports.nonce(secret, "sal_a", morning) != Reports.nonce(secret, "sal_b", morning))
        assertTrue(Reports.nonce("1".repeat(64), "sal_a", morning) != Reports.nonce(secret, "sal_a", morning))
        assertEquals(64, Reports.nonce(secret, "sal_a", morning).length)
    }

    @Test
    fun aReportCarriesNothingButTheClosedSchema() {
        val json = Report("sal_a", "wrong_hours", "note", "2026-09-18T14:00Z", "a".repeat(64)).toJson()
        assertEquals(
            """{"target_id":"sal_a","kind":"wrong_hours","detail":"note","observed_at":"2026-09-18T14:00Z","client_nonce":"${"a".repeat(64)}"}""",
            json,
        )
        // No detail means no field at all: an unknown or empty field is a 400 from the Worker.
        assertFalse(Report("sal_a", "closed_permanently", null, "2026-09-18T14:00Z", "b".repeat(64)).toJson().contains("detail"))
        // Minute granularity, never seconds.
        assertFalse(json.contains("14:00:"))
    }

    @Test
    fun crisisListingsCannotBeSaved() {
        assertFalse(Saved.canSave("shelter.dv"))
        assertFalse(Saved.canSave("health.mental"))
        assertFalse(Saved.canSave("treatment.detox"))
        assertFalse(Saved.canSave("assault"))
        assertTrue(Saved.canSave("food.pantry"))
        assertTrue(Saved.canSave("rec"))
    }

    @Test
    fun theHardcodedNumbersAreTheHardcodedNumbers() {
        assertEquals("911", HARDCODED["emg_911"])
        assertEquals("988", HARDCODED["emg_988"])
        assertEquals(2, HARDCODED.size)
    }
}
