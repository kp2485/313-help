// Ed25519 signature verification, written out here because the phones this app is for cannot do it themselves:
// Android's own Ed25519 (java.security.Signature "Ed25519", through Conscrypt) arrives at API 33, and this app
// runs from API 24. The alternatives all cost megabytes of APK for one signature check at start-up.
//
// So there are two paths, and they must always agree:
//
//  - `platformVerify` asks the platform. It answers null when this device has no Ed25519 provider (every Android
//    below 13), and otherwise gives its own true/false. It is used first because it is native code and takes
//    about a millisecond.
//  - `softwareVerify` is the verification half of RFC 8032, section 5.1, using java.math.BigInteger for the field
//    arithmetic and java.security.MessageDigest for SHA-512 (both on every Android version we support). It is the
//    only path below API 33, so it is the one that has to be fast on an old phone.
//
// VerifyTest runs the RFC 8032 vectors, the tampering cases and the real bundle through *both* and asserts they
// give the same answer, so neither can drift. (One caveat worth writing down: the two are not provably identical
// on pathological inputs — non-canonical encodings and small-order points are the classic disagreements between
// Ed25519 implementations. That cannot affect this app, whose signatures come from one signer using the standard
// canonical encoding, but it is why the software path is never skipped in the tests.)
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
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

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
     * The platform's own Ed25519 is asked first and the software path answers when there is none. A device that
     * has a provider never pays for the BigInteger arithmetic; a device that does not gets the same answer.
     */
    fun verify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean {
        if (publicKey.size != 32 || signature.size != 64) return false
        // A "yes" from the platform is enough. Anything else — no provider, or a provider that says no — is
        // settled by the software path, which is the RFC and is the only answer every Android below 13 ever gets.
        // So a provider that is missing, or odd, or wrong can never turn a good bundle into a refused one, and can
        // never make this app accept anything that API 24 would not accept.
        if (platformVerify(publicKey, signature, message) == true) return true
        return softwareVerify(publicKey, signature, message)
    }

    /**
     * The platform's answer, or null when this device has no usable Ed25519 provider — which is every Android
     * below 13 (API 33), and the whole reason the software path exists.
     *
     * The provider is chosen by asking every installed one, not by taking whatever `getInstance("Ed25519")`
     * happens to return. On an API 35 emulator (2026-09-20) that default is **AndroidKeyStore**, the hardware
     * key store, which cannot load a plain public key at all: the fast path silently never ran until this looked
     * the providers up itself. The one we want is Conscrypt (AndroidOpenSSL).
     */
    fun platformVerify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean? {
        if (publicKey.size != 32 || signature.size != 64) return false
        val spec = X509EncodedKeySpec(SPKI_HEADER + publicKey)
        for (provider in java.security.Security.getProviders()) {
            if (provider.getService("KeyFactory", "Ed25519") == null) continue
            val key = try {
                KeyFactory.getInstance("Ed25519", provider).generatePublic(spec)
            } catch (_: Exception) {
                continue
            }
            val verifier = try {
                Signature.getInstance("Ed25519", provider).also { it.initVerify(key) }
            } catch (_: Exception) {
                try {
                    Signature.getInstance("Ed25519").also { it.initVerify(key) }
                } catch (_: Exception) {
                    continue
                }
            }
            return try {
                verifier.update(message)
                verifier.verify(signature)
            } catch (_: Exception) {
                // A signature the provider cannot even parse is a signature that does not verify.
                false
            }
        }
        return null
    }

    /** RFC 8032 section 5.1 verification, done here. Used below API 33, and checked by the tests everywhere. */
    fun softwareVerify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean {
        return try {
            if (publicKey.size != 32 || signature.size != 64) return false
            val a = decompress(publicKey) ?: return false
            val rBytes = signature.copyOfRange(0, 32)
            val r = decompress(rBytes) ?: return false
            val s = littleEndian(signature.copyOfRange(32, 64))
            if (s >= L) return false
            val h = littleEndian(sha512(rBytes, publicKey, message)).mod(L)
            // [s]B - [h]A must be R. Subtracting is adding the negated point, which costs nothing here.
            Trace.time("ed25519.scalar_mul") { equal(doubleScalarMul(s, h, negate(a)), r) }
        } catch (_: Exception) {
            false
        }
    }

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
}
