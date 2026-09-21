// Ed25519 signature verification, written out here because the phones this app is for cannot do it themselves:
// Android's own Ed25519 (java.security.Signature "Ed25519", through Conscrypt) arrives at API 33, and this app
// runs from API 24. The alternatives all cost megabytes of APK for one signature check at start-up.
//
// **One implementation, on every API level.** `verify` is the verification half of RFC 8032 section 5.1, using
// java.math.BigInteger for the field arithmetic and java.security.MessageDigest for SHA-512 (both on every Android
// version we support). There is no platform fast path any more, and the reasons are in the Android review of
// 2026-09-20:
//
//   - There is no software Ed25519 provider on Android to be fast *with*. This repository's own measurement found
//     that on an API 35 image the only Ed25519 services are in AndroidKeyStore and AndroidKeyStoreBCWorkaround,
//     which serve hardware-held keys and will not load a public key from bytes. The path never ran on any device
//     we have, so it bought nothing and was never exercised outside a unit test.
//   - "Only a yes counts" was not the safe rule it read as. `platformVerify` walked the installed providers and
//     returned the *first* one that offered KeyFactory/Ed25519, so a provider added by anything on the device
//     decided whether the strict code below ran at all; and when that provider had no Signature it fell back to
//     `Signature.getInstance("Ed25519")` from the *default* provider, initialised with a key object made by a
//     different one. A "yes" from that arrangement short-circuited the only implementation this repository can
//     reason about, on the app's single security decision.
//   - Two implementations that "must always agree" cannot be made to. Non-canonical encodings and small-order
//     points are the classic Ed25519 disagreements, cofactored and cofactorless verification differ on real
//     signatures, and the old comment admitted as much. One implementation has one accept/reject set, everywhere.
//
// The agreement test against the JVM's own SunEC is kept — in `VerifyTest`, where it belongs: it is worth knowing
// that this code matches a reference implementation, and worth nothing to ask a phone at start-up.
//
// **Small-order public keys are refused** (`isSmallOrder`). Under a public key of order 1, 2, 4 or 8, an all-zero
// 64-byte signature verifies *any* message in cofactorless Ed25519: h·A is the neutral point whatever h is, so
// [s]B − [h]A = [0]B − O = O = R. A release pins its keys at build time, so this is not reachable today — but the
// check costs three point doublings once per bundle and removes a whole class of "the key file was wrong" from
// ever being a forgery. The same eight points are refused by the release gate in app/build.gradle.kts, which reads
// the list at the bottom of this file so the two cannot disagree.
//
// It verifies only. There is no signing code here and no private key anywhere in this repository.
//
// ---------------------------------------------------------------------------------------------------------------
// Why this file was rewritten on 2026-09-20 (the numbers are in apps/android/README.md)
//
// The first version transcribed the RFC's reference code as literally as possible: `mod` for every reduction, the
// generic point addition used for doubling too, and two separate scalar multiplications. Measured on the emulator
// that was 3.9 seconds for one signature, and an old phone would be several times worse. Three changes, none of
// which relaxes a single check:
//
//  1. Reduction mod p by hand instead of BigInteger.mod. p is 2^255 - 19, so 2^255 ≡ 19 and a wide value folds
//     down with a shift, an and, and a multiply by 19 — no long division.
//  2. A dedicated doubling formula (dbl-2008-hwcd: 4 squarings and 4 multiplications) instead of adding a point
//     to itself with the general formula (9 multiplications, one of them by the curve constant d).
//  3. Shamir's trick: [s]B - [h]A is computed in one left-to-right pass over the bits of both scalars, sharing
//     the doublings, instead of two separate scalar multiplications.
//
// The coordinates were already extended/projective with a single inversion at the end — there is no modular
// inverse inside the point arithmetic at all, and the only `modPow`s left are the two point decompressions.
// ---------------------------------------------------------------------------------------------------------------
package org.help313.app

import java.math.BigInteger
import java.security.MessageDigest

object Ed25519 {
    private val ZERO: BigInteger = BigInteger.ZERO
    private val ONE: BigInteger = BigInteger.ONE
    private val TWO: BigInteger = BigInteger.valueOf(2)
    private val NINETEEN: BigInteger = BigInteger.valueOf(19)

    /** p = 2^255 - 19 */
    private val P: BigInteger = TWO.pow(255).subtract(NINETEEN)

    /** 2^255 - 1: the low 255 bits of a wide value, the half that is already smaller than 2^255. */
    private val MASK255: BigInteger = TWO.pow(255).subtract(ONE)

    /** The order of the base point: L = 2^252 + 27742317777372353535851937790883648493 */
    private val L: BigInteger = TWO.pow(252).add(BigInteger("27742317777372353535851937790883648493"))

    /** Exponents, worked out once. The first version rebuilt both of these on every call. */
    private val P_MINUS_2: BigInteger = P.subtract(TWO)
    private val SQRT_EXP: BigInteger = P.add(BigInteger.valueOf(3)).divide(BigInteger.valueOf(8))

    /**
     * a mod p, for an `a` of any size and either sign, without long division.
     *
     * 2^255 ≡ 19 (mod p), so splitting a into its low 255 bits and the rest and adding 19 times the rest is the
     * same number mod p and is much smaller. Two or three folds bring any product of two field elements down.
     */
    private fun modp(a: BigInteger): BigInteger {
        val negative = a.signum() < 0
        var x = if (negative) a.negate() else a
        while (x.bitLength() > 255) {
            x = x.and(MASK255).add(x.shiftRight(255).multiply(NINETEEN))
        }
        while (x >= P) x = x.subtract(P)
        return if (negative && x.signum() != 0) P.subtract(x) else x
    }

    /** Modular inverse by Fermat's little theorem; p is prime. Used only when decompressing a point. */
    private fun inv(a: BigInteger): BigInteger = a.modPow(P_MINUS_2, P)

    private val D: BigInteger = modp(BigInteger.valueOf(-121665).multiply(inv(BigInteger.valueOf(121666))))

    /** 2d, which is the only form of d the point addition needs. */
    private val D2: BigInteger = modp(D.shiftLeft(1))

    /** A square root of -1 modulo p. */
    private val SQRT_M1: BigInteger = TWO.modPow(P.subtract(ONE).divide(BigInteger.valueOf(4)), P)

    /** Extended homogeneous coordinates (X, Y, Z, T), as in the RFC's reference code. */
    private class Point(val x: BigInteger, val y: BigInteger, val z: BigInteger, val t: BigInteger)

    private val NEUTRAL = Point(ZERO, ONE, ONE, ZERO)

    private val BASE: Point by lazy {
        val by = modp(BigInteger.valueOf(4).multiply(inv(BigInteger.valueOf(5))))
        val bx = recoverX(by, 0) ?: error("base point")
        Point(bx, by, ONE, modp(bx.multiply(by)))
    }

    /** add-2008-hwcd, the general addition. Correct for equal, opposite and neutral points alike. */
    private fun add(p: Point, q: Point): Point {
        val a = modp(p.y.subtract(p.x).multiply(q.y.subtract(q.x)))
        val b = modp(p.y.add(p.x).multiply(q.y.add(q.x)))
        val c = modp(modp(p.t.multiply(q.t)).multiply(D2))
        val d = modp(p.z.multiply(q.z).shiftLeft(1))
        val e = b.subtract(a)
        val f = d.subtract(c)
        val g = d.add(c)
        val h = b.add(a)
        return Point(modp(e.multiply(f)), modp(g.multiply(h)), modp(f.multiply(g)), modp(e.multiply(h)))
    }

    /**
     * dbl-2008-hwcd with a = -1: four squarings and four multiplications, and no multiplication by d at all.
     * The general addition above costs nine multiplications, so every one of the 253 doublings in a verification
     * used to cost more than twice what it needs to.
     */
    private fun dbl(p: Point): Point {
        val aa = modp(p.x.multiply(p.x))
        val bb = modp(p.y.multiply(p.y))
        val cc = modp(p.z.multiply(p.z).shiftLeft(1))
        val sum = p.x.add(p.y)
        val e = modp(sum.multiply(sum)).subtract(aa).subtract(bb)
        val g = bb.subtract(aa)
        val f = g.subtract(cc)
        val h = aa.add(bb).negate()
        return Point(modp(e.multiply(f)), modp(g.multiply(h)), modp(f.multiply(g)), modp(e.multiply(h)))
    }

    private fun negate(p: Point): Point = Point(modp(p.x.negate()), p.y, p.z, modp(p.t.negate()))

    /**
     * [s]B + [h]Q in one pass (Shamir's trick). The two scalars share the doublings, so this costs 253 doublings
     * and about 190 additions rather than the 506 doublings and 254 additions of two separate multiplications.
     */
    private fun doubleScalarMul(s: BigInteger, h: BigInteger, q: Point): Point {
        val table = arrayOf(NEUTRAL, BASE, q, add(BASE, q))
        var acc = NEUTRAL
        var i = maxOf(s.bitLength(), h.bitLength()) - 1
        while (i >= 0) {
            acc = dbl(acc)
            val index = (if (s.testBit(i)) 1 else 0) or (if (h.testBit(i)) 2 else 0)
            if (index != 0) acc = add(acc, table[index])
            i--
        }
        return acc
    }

    private fun equal(p: Point, q: Point): Boolean =
        modp(p.x.multiply(q.z).subtract(q.x.multiply(p.z))).signum() == 0 &&
            modp(p.y.multiply(q.z).subtract(q.y.multiply(p.z))).signum() == 0

    /** The x of a compressed point, or null when the encoding names no point on the curve. */
    private fun recoverX(y: BigInteger, sign: Int): BigInteger? {
        if (y >= P) return null
        val y2 = modp(y.multiply(y))
        val x2 = modp(y2.subtract(ONE).multiply(inv(modp(D.multiply(y2).add(ONE)))))
        if (x2.signum() == 0) return if (sign == 0) ZERO else null
        var x = x2.modPow(SQRT_EXP, P)
        if (modp(x.multiply(x).subtract(x2)).signum() != 0) x = modp(x.multiply(SQRT_M1))
        if (modp(x.multiply(x).subtract(x2)).signum() != 0) return null
        if (x.testBit(0) != (sign == 1)) x = P.subtract(x)
        return x
    }

    private fun littleEndian(bytes: ByteArray): BigInteger = BigInteger(1, bytes.reversedArray())

    private fun decompress(encoded: ByteArray): Point? {
        if (encoded.size != 32) return null
        val n = littleEndian(encoded)
        val sign = if (n.testBit(255)) 1 else 0
        val y = n.clearBit(255)
        val x = recoverX(y, sign) ?: return null
        return Point(x, y, ONE, modp(x.multiply(y)))
    }

    private fun sha512(vararg parts: ByteArray): ByteArray {
        val md = MessageDigest.getInstance("SHA-512")
        for (p in parts) md.update(p)
        return md.digest()
    }

    /** SPKI DER for an Ed25519 public key: this fixed 12-byte header, then the 32 raw bytes. */
    private val SPKI_HEADER = byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    )

    /**
     * True when `signature` (64 bytes) is a valid Ed25519 signature of `message` under `publicKey` (32 raw bytes).
     * Anything malformed is false; nothing throws, so a damaged file can only ever mean "refuse this bundle".
     *
     * RFC 8032 section 5.1, cofactorless, and the only implementation — on API 24 and on API 35 alike, so the set
     * of things this app accepts does not depend on which phone it is running on. See the header of this file for
     * why the platform provider path was removed.
     */
    fun verify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean {
        return try {
            if (publicKey.size != 32 || signature.size != 64) return false
            val a = decompress(publicKey) ?: return false
            // A key of order 1, 2, 4 or 8 makes [h]A the neutral point for every h, under which the all-zero
            // signature verifies any message at all. Refused before anything is hashed.
            if (isSmallOrder(a)) return false
            val rBytes = signature.copyOfRange(0, 32)
            val r = decompress(rBytes) ?: return false
            val s = littleEndian(signature.copyOfRange(32, 64))
            if (s >= L) return false
            val h = littleEndian(sha512(rBytes, publicKey, message)).mod(L)
            // [s]B - [h]A must be R. Subtracting is adding the negated point, which costs nothing here.
            Trace.time("ed25519.scalar_mul") { equal(doubleScalarMul(s, h, negate(a)), r) }
        } catch (_: Throwable) {
            false
        }
    }

    /**
     * Kept as the old name so the one public entry point has one meaning. `verify` *is* the software path now;
     * this exists because the tests, the timing hook in BundleStore and apps/android/README.md all name it.
     */
    fun softwareVerify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean =
        verify(publicKey, signature, message)

    /**
     * True for the eight points whose order divides 8 — the neutral point, the one point of order 2, the two of
     * order 4 and the four of order 8. [8]P is the neutral point for exactly those and for nothing else, so three
     * doublings settle it, whatever encoding the key arrived in. The two non-canonical encodings of small-order
     * points (y = p and y = p + 1) never reach here at all: `recoverX` refuses any y that is not less than p.
     */
    private fun isSmallOrder(p: Point): Boolean = isNeutral(dbl(dbl(dbl(p))))

    /** The same question about 32 raw key bytes. False for anything that is not a point on the curve. */
    fun isSmallOrderKey(publicKey: ByteArray): Boolean {
        val a = decompress(publicKey) ?: return false
        return isSmallOrder(a)
    }

    /** (X : Y : Z) is the neutral point when X is 0 and Y = Z, in any representative. */
    private fun isNeutral(p: Point): Boolean =
        modp(p.x).signum() == 0 && modp(p.y.subtract(p.z)).signum() == 0

    /**
     * The 32 raw key bytes inside a base64 SPKI DER Ed25519 public key (the form the bundle's .sig file and
     * BUNDLE_PUBLIC_KEYS use: a fixed 12-byte header, then the key). Null if it is not one.
     */
    fun rawKeyFromSpkiDer(der: ByteArray): ByteArray? {
        if (der.size == 32) return der
        if (der.size != 44) return null
        for (i in SPKI_HEADER.indices) if (der[i] != SPKI_HEADER[i]) return null
        return der.copyOfRange(12, 44)
    }

    // -----------------------------------------------------------------------------------------------------------
    // SMALL-ORDER PUBLIC KEYS (begin)
    //
    // Every encoding of a point whose order divides 8, with the sign bit cleared. `verify` does not need this list
    // — it refuses these points by arithmetic ([8]A = O), which is stronger because it needs no list to be
    // complete. The list exists for two other readers:
    //
    //   - the release gate in app/build.gradle.kts, which cannot run app code at configuration time and reads
    //     these lines out of this file as text, between the markers, expecting exactly SMALL_ORDER_COUNT of them;
    //   - VerifyTest, which puts all of them (each with the sign bit both ways, so 14 encodings) through `verify`
    //     with an all-zero signature and asserts every one is refused. That is what ties the arithmetic to the list
    //     and would catch either one drifting.
    //
    // Seven values, fourteen encodings, eight points: y = 0 and y = p give the same two order-4 points, and y = 1
    // and y = p + 1 the same neutral point. The two y >= p forms are the classic non-canonical encodings; they are
    // here because the *gate* compares bytes, while `recoverX` refuses them outright at verify time.
    // (Source: the same set libsodium's crypto_core_ed25519_is_valid_point blacklists.)
    const val SMALL_ORDER_COUNT = 7

    val SMALL_ORDER_KEYS: List<String> = listOf(
        "0000000000000000000000000000000000000000000000000000000000000000", // y = 0, order 4
        "0100000000000000000000000000000000000000000000000000000000000000", // y = 1, the neutral point
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05", // order 8
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a", // order 8
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", // y = p - 1, order 2
        "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", // y = p, non-canonical 0
        "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", // y = p + 1, non-canonical 1
    )
    // SMALL-ORDER PUBLIC KEYS (end)
    // -----------------------------------------------------------------------------------------------------------
}
