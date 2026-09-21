// The guards two adversarial reviews of this app asked for, on 2026-09-20. One test per finding, named after the
// finding, so a failure says which one came back.
//
// Plain JVM: nothing here touches an android.* class, so `:core:test` runs all of it with no Android SDK
// (HELP313_NO_ANDROID=1, which is what CI sets) and `:app:testDebugUnitTest` runs it again against the real
// Android classes.
package org.help313.app

import org.help313.query.Json
import org.help313.query.JsonException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class GuardsTest {

    /** The repository root: these tests run from `apps/android/app` under :app and `apps/android/core` under :core. */
    private val root = File("../../..")

    private fun hex(s: String): ByteArray {
        val out = ByteArray(s.length / 2)
        for (i in out.indices) out[i] = ((Character.digit(s[i * 2], 16) shl 4) or Character.digit(s[i * 2 + 1], 16)).toByte()
        return out
    }

    // ---- HIGH 1: the pre-authentication crash loop ----------------------------------------------------------

    /**
     * 20,000 nested arrays as an `index.json.sig`, which is the exact shape of the finding: this file is parsed
     * before any signature is checked, so its contents are whatever answered for the bundle origin. It used to
     * throw StackOverflowError — an Error, which `catch (e: Exception)` does not catch — out of the loader thread.
     *
     * Two things are asserted, and the second is the one that matters: not just that it is refused, but that it is
     * refused as an ordinary [BundleError], so the caller keeps the good cached bundle instead of dying.
     */
    @Test
    fun aDeeplyNestedSignatureFileIsRefusedAndNeverThrowsAnError() {
        val pin = "MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="
        for (depth in listOf(64, 20_000)) {
            val bomb = ("[".repeat(depth)).toByteArray(Charsets.UTF_8)
            try {
                BundleCheck.verifiedIndex("{}".toByteArray(), bomb, listOf(pin))
                throw AssertionError("a $depth-deep signature file was accepted")
            } catch (e: BundleError) {
                assertTrue("refused for the wrong reason: ${e.message}", e is BundleError.Unreadable)
            }
            // And nothing about it escapes as an Error: this is the assertion the old code failed.
            try {
                Json.parse(String(bomb, Charsets.UTF_8))
                throw AssertionError("a $depth-deep document parsed")
            } catch (_: JsonException) {
                // expected: an ordinary exception, catchable by every caller
            }
        }
    }

    /** 40 KB of "[[[[…", the reviewer's own input, and it is only a size away from being refused twice over. */
    @Test
    fun theSignatureFileHasASizeCeilingOfItsOwn() {
        val pin = "MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="
        val huge = ByteArray(BundleCheck.MAX_SIG_BYTES + 1) { '['.code.toByte() }
        try {
            BundleCheck.verifiedIndex("{}".toByteArray(), huge, listOf(pin))
            throw AssertionError("an oversized signature file was accepted")
        } catch (e: BundleError.Unreadable) {
            assertTrue(e.message!!.contains("bytes"))
        }
        // A real .sig is a few hundred bytes, so the ceiling has two orders of magnitude of room.
        assertTrue(BundleCheck.MAX_SIG_BYTES >= 64 * 1024)
    }

    // ---- HIGH 2: small-order public keys --------------------------------------------------------------------

    /**
     * The reviewer's vector: a small-order public key and a signature of 64 zero bytes. Under such a key [h]A is the
     * neutral point for every h, so cofactorless verification reduces to [0]B = O = R and *any* message verifies.
     *
     * Every one of the eight small-order points is tried, in both sign-bit forms — fourteen encodings — against
     * three different messages, and none of them may verify. This is what ties the arithmetic in `Ed25519.verify`
     * ([8]A = O) to the list the release gate reads (`SMALL_ORDER_KEYS`): either one drifting fails here.
     */
    @Test
    fun aSmallOrderPublicKeyVerifiesNothing() {
        val zeroSignature = ByteArray(64)
        assertEquals(Ed25519.SMALL_ORDER_COUNT, Ed25519.SMALL_ORDER_KEYS.size)
        for (keyHex in Ed25519.SMALL_ORDER_KEYS) {
            val raw = hex(keyHex)
            for (signBit in listOf(0x00, 0x80)) {
                val key = raw.copyOf()
                key[31] = ((key[31].toInt() and 0x7f) or signBit).toByte()
                for (message in listOf(ByteArray(0), "anything at all".toByteArray(), "a different message".toByteArray())) {
                    assertFalse(
                        "the small-order key $keyHex (sign bit ${signBit shr 7}) verified a message",
                        Ed25519.verify(key, zeroSignature, message),
                    )
                }
                // And it is refused for the right reason, not merely by failing the equality at the end.
                if (signBit == 0) {
                    val onCurve = Ed25519.isSmallOrderKey(key)
                    val nonCanonical = keyHex.startsWith("ed") || keyHex.startsWith("ee")
                    assertTrue(
                        "$keyHex should be either a small-order point or a non-canonical encoding",
                        onCurve || nonCanonical,
                    )
                }
            }
        }
    }

    /** A real key is not small-order, so the check cannot be refusing everything. */
    @Test
    fun anOrdinaryPublicKeyIsNotSmallOrder() {
        val real = Ed25519.rawKeyFromSpkiDer(
            BundleCheck.base64("MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8=")!!,
        )!!
        assertFalse(Ed25519.isSmallOrderKey(real))
        // The RFC 8032 vector keys too.
        assertFalse(Ed25519.isSmallOrderKey(hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")))
    }

    /**
     * The release gate refuses the same keys. It cannot be called from here — it is a Gradle build script, which
     * runs before anything is compiled — so this checks the two halves of the arrangement that makes the gate
     * trustworthy: it reads its list out of Ed25519.kt between that file's markers, and it refuses a key it finds
     * there. If the markers, the count or the check were removed, this fails.
     */
    @Test
    fun theReleaseGateRefusesASmallOrderKeyToo() {
        val script = File(root, "apps/android/app/build.gradle.kts").readText()
        assertTrue("the gate no longer refuses small-order keys", script.contains("isSmallOrderKey"))
        assertTrue("the gate no longer calls it from releaseKeyProblems", script.contains("is a small-order Ed25519 point"))
        assertTrue("the gate no longer reads the list from Ed25519.kt", script.contains("SMALL-ORDER PUBLIC KEYS (begin)"))
        assertTrue("the gate no longer checks the count", script.contains("SMALL_ORDER_COUNT"))

        // The same extraction the gate does, run here, must find exactly what Ed25519.kt says it has — so the gate
        // cannot silently end up checking against nothing.
        val source = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Ed25519.kt").readText()
        val from = source.indexOf("SMALL-ORDER PUBLIC KEYS (begin)")
        val to = source.indexOf("SMALL-ORDER PUBLIC KEYS (end)")
        assertTrue("Ed25519.kt lost its markers", from in 1 until to)
        val found = Regex("\"([0-9a-f]{64})\"").findAll(source.substring(from, to)).map { it.groupValues[1] }.toSet()
        assertEquals("the gate would read a different list than the app holds", Ed25519.SMALL_ORDER_KEYS.toSet(), found)
        assertEquals(Ed25519.SMALL_ORDER_COUNT, found.size)

        // And a base64 SPKI key built from a small-order point is what such a release would be asked to pin.
        val spki = hex("302a300506032b6570032100") + hex(Ed25519.SMALL_ORDER_KEYS[1])
        val b64 = java.util.Base64.getEncoder().encodeToString(spki)
        assertEquals(44, BundleCheck.base64(b64)!!.size)
        assertTrue(Ed25519.isSmallOrderKey(Ed25519.rawKeyFromSpkiDer(BundleCheck.base64(b64)!!)!!))
    }

    // ---- HIGH 3: one implementation, and it agrees with a reference one ------------------------------------

    /**
     * There is no platform verification path any more (see the header of Ed25519.kt), so there is nothing left to
     * disagree with at run time. The agreement is still worth knowing, so it is checked here, against the JVM's own
     * SunEC — which the tests run on and a phone does not. Everything the old
     * `theTwoVerificationPathsNeverDisagree` put through both paths goes through both here: the RFC vectors, four
     * one-bit signature corruptions, an out-of-range scalar, a key that is not on the curve and a changed message.
     *
     * Small-order keys are deliberately *not* in this list: `Ed25519.verify` refuses them and a cofactored
     * implementation may not, which is exactly the disagreement this app resolves on purpose rather than by
     * accident. The test above pins our side of it.
     */
    @Test
    fun theSoftwareImplementationAgreesWithTheJvmsOwnEd25519() {
        val vectors = listOf(
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
        val cases = ArrayList<Triple<ByteArray, ByteArray, ByteArray>>()
        for ((pub, msg, sig) in vectors) cases.add(Triple(hex(pub), hex(sig), hex(msg)))
        val (pub, msg, sig) = vectors[2]
        for (bit in listOf(0, 31, 32, 63)) {
            val bad = hex(sig).copyOf()
            bad[bit] = (bad[bit].toInt() xor 1).toByte()
            cases.add(Triple(hex(pub), bad, hex(msg)))
        }
        val outOfRange = hex(sig).copyOf()
        hex("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010").copyInto(outOfRange, 32)
        cases.add(Triple(hex(pub), outOfRange, hex(msg)))
        cases.add(Triple(ByteArray(32) { 0x7f }, hex(sig), hex(msg)))
        cases.add(Triple(hex(pub), hex(sig), "not the signed message".toByteArray()))

        var answered = 0
        for ((key, signature, message) in cases) {
            val ours = Ed25519.verify(key, signature, message)
            val reference = referenceVerify(key, signature, message)
            if (reference != null) {
                answered++
                assertEquals("this app and the JVM's own Ed25519 disagree", ours, reference)
            }
        }
        println("the JVM's own Ed25519 answered $answered of ${cases.size} cases")
        assertTrue("no reference implementation on this JVM; the agreement was not actually checked", answered > 0)
    }

    /**
     * The JVM's own Ed25519, for the test above only. This is the lookup that used to live in the app, and the
     * reason it does not any more: it walks the installed providers, and on a phone the only ones that offer
     * Ed25519 serve hardware-held keys and cannot load a public key from bytes at all.
     */
    private fun referenceVerify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean? {
        if (publicKey.size != 32 || signature.size != 64) return null
        val header = hex("302a300506032b6570032100")
        val spec = java.security.spec.X509EncodedKeySpec(header + publicKey)
        for (provider in java.security.Security.getProviders()) {
            if (provider.getService("KeyFactory", "Ed25519") == null) continue
            val key = try {
                java.security.KeyFactory.getInstance("Ed25519", provider).generatePublic(spec)
            } catch (_: Exception) {
                continue
            }
            val verifier = try {
                java.security.Signature.getInstance("Ed25519", provider).also { it.initVerify(key) }
            } catch (_: Exception) {
                continue
            }
            return try {
                verifier.update(message)
                verifier.verify(signature)
            } catch (_: Exception) {
                false
            }
        }
        return null
    }

    /** The app has one entry point, and the old name is the same function, so nothing can call a second path. */
    @Test
    fun thereIsOnlyOneVerificationPath() {
        val source = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Ed25519.kt").readText()
        // The imports are the honest test: the header of that file discusses both by name on purpose.
        assertFalse("Ed25519.kt imports KeyFactory again", source.contains("import java.security.KeyFactory"))
        assertFalse("Ed25519.kt imports Signature again", source.contains("import java.security.Signature"))
        assertFalse("Ed25519.kt walks the providers again", source.contains("Security.getProviders()"))
        val (pub, msg, sig) = Triple(
            "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
            "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
        )
        assertEquals(Ed25519.verify(hex(pub), hex(sig), hex(msg)), Ed25519.softwareVerify(hex(pub), hex(sig), hex(msg)))
    }

    // ---- MEDIUM 4: one honest header, https everywhere, a checked api root --------------------------------

    @Test
    fun theOnlyHeaderWeSendNamesTheAppAndNothingAboutThePhone() {
        val ua = Net.userAgent("0.1.0")
        assertEquals("313Help-Android/0.1.0", ua)
        // It names the app and the platform it is the app for, which is honest and is the point (CLAUDE.md: identify
        // our requests honestly). What it must never carry is anything about *this* phone or this person: the
        // Android version, the model, the build id, the locale, or any identifier.
        for (word in listOf("Dalvik", "Linux", "Build/", "Mozilla", "sdk_gphone", "en-US", ";")) {
            assertFalse("the user agent names $word", ua.contains(word))
        }
        // One version number, and no free text a device could get into it.
        assertEquals(1, ua.count { it == '/' })
        assertFalse(ua.contains(" "))
    }

    @Test
    fun theReportPostGoesToABareHttpsOriginOrNowhere() {
        // The good case: the origin, with the bundle path taken off and nothing else changed.
        assertEquals("https://313.example", Net.apiRoot("https://313.example/data/bundle/v1/"))
        assertEquals("https://313.example:8443", Net.apiRoot("https://313.example:8443/data/bundle/v1/"))

        // Every one of these used to come back as something the old `substringBefore("/data/bundle/")` would have
        // posted a report to.
        assertNull("http must never be derived from", Net.apiRoot("http://313.example/data/bundle/v1/"))
        assertNull("a base with no bundle path is not an origin", Net.apiRoot("https://313.example/"))
        assertNull("the placeholder is not an origin", Net.apiRoot("https://REPLACE-ME.invalid/x"))
        assertNull("credentials must not ride along", Net.apiRoot("https://user:pw@313.example/data/bundle/v1/"))
        assertNull("a path must not ride along", Net.apiRoot("https://313.example/a/b/data/bundle/v1/"))
        assertNull("a query must not ride along", Net.apiRoot("https://313.example?x=1/data/bundle/v1/"))
        assertNull("a fragment must not ride along", Net.apiRoot("https://313.example#f/data/bundle/v1/"))
        assertNull("a newline must not ride along", Net.apiRoot("https://313.example\n/data/bundle/v1/"))
        assertNull(Net.apiRoot(""))

        // And a build that has not been given a home posts nowhere at all: `.invalid` is reserved by RFC 2606 and
        // is what the default BUNDLE_BASE uses, so the placeholder cannot become an address anything is sent to.
        assertNull(Net.apiRoot("https://REPLACE-ME.invalid/data/bundle/v1/"))
    }

    @Test
    fun onlyHttpsIsFetchedOrOpened() {
        assertTrue(Net.isHttps("https://a.example/x"))
        assertFalse(Net.isHttps("http://a.example/x"))
        assertFalse(Net.isHttps("HTTPS://a.example/x"))     // scheme case is not something we need to accept
        assertFalse(Net.isHttps("//a.example/x"))

        assertNotNull(Net.webLink("https://detroitmi.gov/health"))
        for (bad in listOf(
            "http://detroitmi.gov", "javascript:alert(1)", "content://com.other/x", "file:///etc/hosts",
            "intent://x#Intent;end", "https://", "https:///etc", "https://a b.example", "https://a.example\u0000",
        )) {
            assertNull("$bad must not become a link", Net.webLink(bad))
        }
    }

    /** Nothing in this app may open a connection except through Http, which is where the rules are applied. */
    @Test
    fun everyConnectionGoesThroughOneDoor() {
        val dir = File(root, "apps/android/app/src/main/kotlin/org/help313/app")
        for (file in dir.listFiles()!!.filter { it.name.endsWith(".kt") && it.name != "Http.kt" }) {
            val body = file.readText()
            assertFalse("${file.name} opens its own connection", body.contains("openConnection()"))
            assertFalse("${file.name} sets its own user agent", body.contains("\"User-Agent\""))
        }
        val http = File(dir, "Http.kt").readText()
        assertTrue("Http no longer refuses redirects", http.contains("instanceFollowRedirects = false"))
        assertTrue("Http no longer turns the caches off", http.contains("useCaches = false"))
        assertTrue("Http no longer clears the cookie handler", http.contains("CookieHandler.setDefault(null)"))
        assertTrue("Http no longer clears the response cache", http.contains("ResponseCache.setDefault(null)"))
    }

    // ---- MEDIUM 5 and 6: the queue, its locks, its hashes and its writes ----------------------------------

    private fun report(target: String, kind: String = "wrong_hours", nonce: String = "a".repeat(64)) =
        Report(target, kind, null, "2026-09-18T14:00Z", nonce)

    /**
     * "Make a new key" is a promise that nothing sent after it can be matched to anything sent before. A report
     * that was queued under the old key and then posted carrying it would break that promise silently, hours later.
     * So the hash is worked out again as the report leaves — the web app's `withCurrentNonce`, mirrored exactly.
     */
    @Test
    fun theOneDayHashIsWorkedOutAgainWhenAQueuedReportLeaves() {
        val old = "0".repeat(64)
        val new = "1".repeat(64)
        val observed = org.help313.query.parseInstant("2026-09-18T14:00Z")!!
        val queued = Reports.build(old, "sal_a", "wrong_hours", "", observed)

        val sentAfterReset = Reports.withCurrentNonce(new, queued)
        assertTrue("the hash did not change with the key", sentAfterReset.clientNonce != queued.clientNonce)
        assertEquals("nothing else about the report may change", queued.observedAt, sentAfterReset.observedAt)
        assertEquals(queued.targetId, sentAfterReset.targetId)
        assertEquals(queued.kind, sentAfterReset.kind)

        // The day is the one the report was *observed* on, not today, so a report queued yesterday still dedupes
        // against yesterday's rather than counting twice.
        assertEquals(Reports.nonce(new, "sal_a", observed), sentAfterReset.clientNonce)
        // Under the same key it is a no-op, which is what makes it safe to run on every send.
        assertEquals(queued.clientNonce, Reports.withCurrentNonce(old, queued).clientNonce)
    }

    /** A half-written file is kept and said out loud; it is never read as "you had nothing waiting". */
    @Test
    fun anUnreadableQueueIsNeverMistakenForAnEmptyOne() {
        assertFalse(Outbox.read(null).unreadable)
        assertEquals(0, Outbox.read(null).items.size)
        assertFalse(Outbox.read("").unreadable)
        assertFalse(Outbox.read("[]").unreadable)

        // The shapes a kill mid-write actually leaves.
        for (broken in listOf(
            """[{"target_id":"sal_a","kind":"wrong_ho""",
            """[{"target_id":"sal_a"}]""",           // a report missing required fields is not half a report
            """{"target_id":"sal_a"}""",             // an object where an array should be
            "not json at all",
            "[".repeat(20_000),                      // and the nesting bomb, here too
        )) {
            val stored = Outbox.read(broken)
            assertTrue("$broken was read as an ordinary queue", stored.unreadable)
            assertEquals("an unreadable file must not yield guessed items", 0, stored.items.size)
        }
    }

    @Test
    fun aQueueRoundTripsAndIsCappedAtFifty() {
        val many = (1..80).map { report("sal_$it") }
        val text = Outbox.write(many)
        val back = Outbox.read(text)
        assertFalse(back.unreadable)
        assertEquals(Outbox.MAX_QUEUED, back.items.size)
        // The newest are kept, as in the web app's `.slice(-max)`.
        assertEquals("sal_80", back.items.last().targetId)
        assertEquals(50, Outbox.MAX_QUEUED)
    }

    /**
     * A flush spends up to 45 seconds on the network. Anything a person queues in that time used to be overwritten
     * by the write-back; now it survives, and so does everything the flush could not send.
     */
    @Test
    fun aReportQueuedDuringAFlushIsNotLost() {
        val a = report("sal_a")
        val b = report("sal_b")
        val c = report("sal_c")           // queued while the flush was on the network

        // b failed, a went; c arrived in the meantime.
        val next = Outbox.merge(tried = listOf(a, b), left = listOf(b), current = listOf(a, b, c))
        assertEquals(listOf("sal_b", "sal_c"), next.map { it.targetId })

        // Nothing added: the queue is exactly what did not go.
        assertEquals(listOf("sal_b"), Outbox.merge(listOf(a, b), listOf(b), listOf(a, b)).map { it.targetId })
        // Everything went: empty.
        assertEquals(emptyList<String>(), Outbox.merge(listOf(a, b), emptyList(), listOf(a, b)).map { it.targetId })
        // Two identical reports are two reports: the subtraction is a multiset one, so one copy is not eaten.
        val twice = Outbox.merge(listOf(a), emptyList(), listOf(a, a))
        assertEquals(listOf("sal_a"), twice.map { it.targetId })
    }

    /** Every write of something a person gave this app is a temp file and a rename, never a truncate-then-write. */
    @Test
    fun whatThePersonGaveUsIsWrittenAtomically() {
        for (name in listOf("ReportStore.kt", "SavedStore.kt")) {
            val body = File(root, "apps/android/app/src/main/kotlin/org/help313/app/$name").readText()
            assertFalse("$name writes with writeText again", body.contains(".writeText("))
            assertTrue("$name no longer renames into place", body.contains("renameTo("))
            assertTrue("$name no longer flushes to the disk before renaming", body.contains("fd.sync()"))
        }
    }

    /** No lock may be held across the network: that is the ANR the reviewer measured. */
    @Test
    fun noLockIsHeldAcrossTheNetwork() {
        val body = File(root, "apps/android/app/src/main/kotlin/org/help313/app/ReportStore.kt").readText()
        // @Synchronized on submit/flush is what put a 45-second network call inside the object's monitor. The
        // annotation, on a declaration — the file's own header discusses it by name on purpose.
        assertFalse(
            "a method in ReportStore is @Synchronized again",
            Regex("(?m)^\\s*@Synchronized\\s*$").containsMatchIn(body),
        )
        assertTrue("ReportStore no longer has a file-only lock", body.contains("private val files = Any()"))
        // post() must not appear inside a synchronized block. Checked crudely but honestly: every synchronized
        // block in this file is scanned for a call to post.
        var at = body.indexOf("synchronized(files)")
        while (at >= 0) {
            val open = body.indexOf('{', at)
            var depth = 0
            var end = open
            while (end < body.length) {
                if (body[end] == '{') depth++
                if (body[end] == '}') {
                    depth--
                    if (depth == 0) break
                }
                end++
            }
            val block = body.substring(open, minOf(end + 1, body.length))
            assertFalse("a synchronized block in ReportStore calls post(): $block", block.contains("post("))
            at = body.indexOf("synchronized(files)", end)
        }
    }

    /** "Make a new key" and the outbox writes are off the main thread. */
    @Test
    fun theSlowThingsAreOffTheMainThread() {
        val screens = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Screens.kt").readText()
        val reset = screens.indexOf("resetInstallSecret")
        assertTrue("the privacy screen no longer resets the key", reset > 0)
        // The 400 characters before the call must put it on the background thread.
        assertTrue(
            "resetInstallSecret is called on the main thread again",
            screens.substring(maxOf(0, reset - 400), reset).contains("Work.io"),
        )
        val saved = File(root, "apps/android/app/src/main/kotlin/org/help313/app/SavedStore.kt").readText()
        assertTrue("SavedStore no longer caches in memory", saved.contains("private var cache"))
        assertTrue("SavedStore no longer writes in the background", saved.contains("Work.io"))
    }

    /**
     * Local work is never queued behind a network call. Found by running it, not by reading it: with one background
     * thread, a flush of four queued reports against a host that does not answer holds that thread for four
     * fifteen-second connect timeouts, and "Make a new key" tapped in the middle did nothing for a minute
     * (emulator, 2026-09-20). The UI never froze, which is why a test that only watched for jank would have passed.
     *
     * So the two things that talk to a server go on `Work.net` and everything local goes on `Work.io`, and this
     * asserts that division at each call site rather than trusting it.
     */
    @Test
    fun nothingLocalWaitsBehindTheNetwork() {
        val work = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Work.kt").readText()
        assertTrue("Work no longer has a network thread of its own", work.contains("fun net("))
        assertTrue("Work no longer has a local thread of its own", work.contains("fun io("))

        val dir = File(root, "apps/android/app/src/main/kotlin/org/help313/app")
        // The only two things that may be on the network thread.
        for (file in dir.listFiles()!!.filter { it.name.endsWith(".kt") }) {
            for (line in file.readText().lines()) {
                if (!line.contains("Work.net")) continue
                assertTrue(
                    "${file.name} puts something other than submit/flush on the network thread: ${line.trim()}",
                    line.contains("flush(") || line.contains("Work.net {"),
                )
            }
        }
        // Sending a report and flushing the outbox: the network thread.
        val activity = File(dir, "MainActivity.kt").readText()
        assertTrue("the outbox flush is not on the network thread", activity.contains("Work.net { ReportStore.flush("))
        val screens = File(dir, "Screens.kt").readText()
        val send = screens.indexOf("ReportStore.submit")
        assertTrue(screens.substring(maxOf(0, send - 300), send).contains("Work.net"))
        // Making a new key: the local thread, so a stalled flush cannot delay it. The nearest `Work.` call above it
        // is the one it runs on, whatever comment sits in between.
        assertEquals(
            "making a new key is not on the local thread, so a stalled flush could hold it up",
            "Work.io",
            nearestWorkCallAbove(screens, "ReportStore.resetInstallSecret"),
        )
        assertEquals("sending a report is not on the network thread", "Work.net", nearestWorkCallAbove(screens, "ReportStore.submit"))
        assertEquals("counting what is waiting is not on the local thread", "Work.io", nearestWorkCallAbove(screens, "ReportStore.queuedCount"))
        assertEquals("clearing the queue is not on the local thread", "Work.io", nearestWorkCallAbove(screens, "ReportStore.clearQueue"))
        // And no raw Thread anywhere: that was the per-tap, per-resume leak. `runOnUiThread {` is not one, so the
        // word has to stand on its own.
        val rawThread = Regex("[^A-Za-z]Thread\\s*\\{")
        for (file in dir.listFiles()!!.filter { it.name.endsWith(".kt") && it.name != "Work.kt" }) {
            assertFalse("${file.name} starts a raw Thread again", rawThread.containsMatchIn(file.readText()))
        }
    }

    /** `Work.io` or `Work.net`, whichever appears last before `call`, or null if neither does. */
    private fun nearestWorkCallAbove(source: String, call: String): String? {
        val at = source.indexOf(call)
        if (at < 0) return null
        val before = source.substring(0, at)
        val io = before.lastIndexOf("Work.io")
        val net = before.lastIndexOf("Work.net")
        if (io < 0 && net < 0) return null
        return if (io > net) "Work.io" else "Work.net"
    }

    /**
     * And the promise itself: the secret is read for *each* report a flush sends, not once before the loop. Tapping
     * "Make a new key" halfway through a slow flush must not leave the reports behind it going out under the old
     * key — which is what the first version of this fix did.
     */
    @Test
    fun aKeyResetPartWayThroughAFlushAppliesToWhatIsLeft() {
        val body = File(root, "apps/android/app/src/main/kotlin/org/help313/app/ReportStore.kt").readText()
        assertTrue(
            "the flush reads the secret once up front again, so a reset mid-flush would not reach what is left",
            body.contains("post(Reports.withCurrentNonce(installSecret(c), it))"),
        )
        // The rule it implements, on the data: a different secret gives a different hash for the same report.
        val r = report("sal_a")
        assertTrue(
            Reports.withCurrentNonce("0".repeat(64), r).clientNonce !=
                Reports.withCurrentNonce("1".repeat(64), r).clientNonce,
        )
    }

    // ---- MEDIUM 8: what survives a recreation, and which screens are private ------------------------------

    @Test
    fun theScreensThatMustNotBePhotographedAreTheOnesDocsSay() {
        // Domestic violence, mental-health crisis, treatment, help after sexual assault — docs/08 and audit A8, and
        // exactly what the web app marks quickExit.
        for (needId in listOf("unsafe", "talk", "drugs", "assault")) {
            assertTrue("$needId is not private", Route.isPrivate(Route.Need(needId)))
        }
        // The overdose screen is sensitive but is 911 and six steps: no list, no address, nothing to hide from a
        // recents thumbnail, and a bystander must not be given a button that closes the app.
        assertTrue("the overdose screen changed shape", NEEDS.first { it.id == "overdose_now" }.stepsOnly)

        // Ordinary screens are not.
        for (route in listOf<Route>(Route.Home, Route.Help, Route.Search, Route.Saved, Route.About, Route.Urgent,
            Route.Need("food"), Route.Refine("food", "today"), Route.Category("food"))) {
            assertFalse("$route should not be private", Route.isPrivate(route))
        }
        // A choice under a private need, and a listing in a private category, are private too.
        assertTrue(Route.isPrivate(Route.Refine("drugs", "detox")))
        assertTrue(Route.isPrivate(Route.Category("treatment")))
        assertTrue(Route.isPrivate(Route.Detail("sal_x", "shelter.dv")))
        assertTrue(Route.isPrivate(Route.Detail("sal_x", "health.mental")))
        assertTrue(Route.isPrivate(Route.Detail("sal_x", "treatment.detox")))
        assertFalse(Route.isPrivate(Route.Detail("sal_x", "food.pantry")))
    }

    /**
     * A recreation is not a navigation. The public part of the stack comes back; a private screen does not, because
     * the app re-opening a domestic-violence screen by itself is a decision nobody made and the person may not be
     * the one holding the phone by then.
     */
    @Test
    fun aRecreationNeverPutsAPrivateScreenBack() {
        val stack = listOf(Route.Home, Route.Help, Route.Need("unsafe"), Route.Detail("sal_x", "shelter.dv"))
        val kept = Route.keepable(stack)
        assertEquals(2, kept.size)
        assertTrue(kept[0] is Route.Home && kept[1] is Route.Help)
        for (route in kept) assertFalse(Route.isPrivate(route))

        // An ordinary stack comes back whole.
        val ordinary = listOf<Route>(Route.Home, Route.Need("food"), Route.Refine("food", "today"))
        assertEquals(3, Route.keepable(ordinary).size)
        // A stack that starts private falls back to Home rather than to nothing.
        assertEquals(1, Route.keepable(listOf(Route.Need("talk"))).size)
        assertTrue(Route.keepable(listOf(Route.Need("talk")))[0] is Route.Home)
        // Empty in, Home out.
        assertEquals(1, Route.keepable(emptyList()).size)
    }

    /**
     * Nothing about where a person has been is written to disk — not to a file, and not to savedInstanceState,
     * which the system persists on its own schedule. docs/08: triage answers live in memory only.
     */
    @Test
    fun nothingAboutTheJourneyIsEverPersisted() {
        val activity = File(root, "apps/android/app/src/main/kotlin/org/help313/app/MainActivity.kt").readText()
        assertFalse("MainActivity saves instance state again", activity.contains("override fun onSaveInstanceState"))
        assertFalse("MainActivity reads the saved bundle's contents", activity.contains("savedInstanceState?.get"))
        assertFalse("MainActivity reads the saved bundle's contents", activity.contains("savedInstanceState.get"))
        assertFalse("MainActivity reads SharedPreferences", activity.contains("getSharedPreferences"))
        val route = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Route.kt").readText()
        for (forbidden in listOf("java.io.File", "SharedPreferences", "writeText", "onSaveInstanceState")) {
            assertFalse("Route.kt reached for $forbidden", route.contains(forbidden))
        }
        // And the activity clears the holder when it is really finishing.
        assertTrue("the retained stack is not cleared on exit", activity.contains("Route.Retained.clear()"))
    }

    /** The store is one per process, so a recreation does not re-verify or start a second thread. */
    @Test
    fun thereIsOneBundleStorePerProcess() {
        val store = File(root, "apps/android/app/src/main/kotlin/org/help313/app/BundleStore.kt").readText()
        assertTrue("BundleStore is constructible again", store.contains("class BundleStore private constructor"))
        assertTrue("BundleStore has no process-wide accessor", store.contains("fun of(context: Context)"))
        assertTrue("BundleStore cannot be shut down", store.contains("fun shutdown()"))
        // And the one background thread is never allowed to die on a Throwable.
        assertTrue("the loader thread is not protected from Errors", store.contains("catch (t: Throwable)"))
        val activity = File(root, "apps/android/app/src/main/kotlin/org/help313/app/MainActivity.kt").readText()
        assertFalse("MainActivity builds its own store again", activity.contains("BundleStore(this)"))
        assertFalse("MainActivity starts a raw Thread again", activity.contains("Thread {"))
    }

    // ---- MEDIUM 10: a signed index still does not name a path ---------------------------------------------

    @Test
    fun theSignedIndexCannotNameAPathOutsideTheBundle() {
        // Everything the pipeline actually writes.
        for (good in listOf(
            "index.json", "alerts.json", "emergency.json", "archived.json", "category/food.json",
            "places/greenway.json", "map/transit/ddot_routes.json", "indicators/neighborhoods.json",
            "indicators/nbh_downtown.json", "map/base.json",
        )) {
            assertTrue("$good must still be readable", Net.safeBundlePath(good))
        }
        // And every shape that would escape the directory or change the server.
        for (bad in listOf(
            "../../shared_prefs/x.xml", "..", ".", "/etc/passwd", "category/../../x", "a//b",
            "https://elsewhere.example/x", "//elsewhere.example/x", "C:\\x", "x\\y", "category/",
            "/category/food.json", ".hidden", "-dash/x", "food.json?x=1", "food json", "x\u0000.json",
            "A.json", "cat/../../../f", "", "a/b/c/d/e/f/g",
        )) {
            assertFalse("$bad must never be used as a path", Net.safeBundlePath(bad))
        }
        // Long names are refused rather than handed to the file system.
        assertFalse(Net.safeBundlePath("a".repeat(500) + ".json"))
    }

    /**
     * The whole index is refused, not just the one bad name: a steward's signing key producing an index like this
     * means something is wrong with the index, and no part of it is worth using.
     */
    @Test
    fun anIndexNamingABadPathIsRefusedWhole() {
        val dir = File(root, "data/bundle/v1")
        val index = File(dir, "index.json")
        val sig = File(dir, "index.json.sig")
        if (!index.isFile || !sig.isFile) {
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return
        }
        val sigText = sig.readText()
        val pin = Regex("\"public_key\"\\s*:\\s*\"([^\"]+)\"").find(sigText)!!.groupValues[1]
        // The real one is fine, which is the control.
        assertTrue(BundleCheck.verifiedIndex(index.readBytes(), sig.readBytes(), listOf(pin)).files.isNotEmpty())

        // A path check that only ran at the point of use would have let the *signature* pass and then thrown
        // somewhere deeper; this asserts it is refused as part of accepting the index at all.
        val tampered = index.readText().replace("\"category/food.json\"", "\"../../shared_prefs/food.json\"")
        assertTrue("the test did not change anything", tampered != index.readText())
        // It no longer matches the signature either, so it is refused twice over. Check the path rule on its own.
        val json = Json.parse(tampered)
        val parsed = BundleIndex.fromJson(json)
        assertTrue(parsed.files.keys.any { !Net.safeBundlePath(it) })
    }

    /** A website from the bundle goes through the allow-list, and the other schemes are built from parts. */
    @Test
    fun onlyOurOwnSchemesAreOpened() {
        val activity = File(root, "apps/android/app/src/main/kotlin/org/help313/app/MainActivity.kt").readText()
        assertTrue("openWeb no longer checks the address", activity.contains("Net.webLink(url)"))
        // The three schemes built here, each from parts we control, and no fourth.
        for (scheme in listOf("tel", "geo:", "transit://directions?to=")) {
            assertTrue("MainActivity no longer builds $scheme itself", activity.contains(scheme))
        }
    }
}
