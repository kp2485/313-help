// Ed25519 signature verification, written out here because the phones this app is for cannot do it themselves:
// Android's own Ed25519 (java.security.Signature "Ed25519", through Conscrypt) arrives at API 33, and this app
// runs from API 24. The alternatives all cost megabytes of APK for one signature check at start-up.
//
// This is the verification half of RFC 8032, section 5.1, transcribed from the reference code in that document's
// appendix, using java.math.BigInteger for the field arithmetic and java.security.MessageDigest for SHA-512
// (both present on every Android version we support). Verifying one signature is a few thousand BigInteger
// multiplications, a few tens of milliseconds even on a slow phone, and happens once when a bundle is loaded.
//
// It verifies only. There is no signing code here and no private key anywhere in this repository.
package org.help313.app

import java.math.BigInteger
import java.security.MessageDigest

object Ed25519 {
    private val ZERO: BigInteger = BigInteger.ZERO
    private val ONE: BigInteger = BigInteger.ONE
    private val TWO: BigInteger = BigInteger.valueOf(2)
    private val EIGHT: BigInteger = BigInteger.valueOf(8)

    /** p = 2^255 - 19 */
    private val P: BigInteger = TWO.pow(255).subtract(BigInteger.valueOf(19))

    /** The order of the base point: L = 2^252 + 27742317777372353535851937790883648493 */
    private val L: BigInteger = TWO.pow(252).add(BigInteger("27742317777372353535851937790883648493"))

    private fun modp(a: BigInteger): BigInteger = a.mod(P)

    /** Modular inverse by Fermat's little theorem; p is prime. */
    private fun inv(a: BigInteger): BigInteger = a.modPow(P.subtract(TWO), P)

    private val D: BigInteger = modp(BigInteger.valueOf(-121665).multiply(inv(BigInteger.valueOf(121666))))

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

    private fun add(p: Point, q: Point): Point {
        val a = modp(p.y.subtract(p.x).multiply(q.y.subtract(q.x)))
        val b = modp(p.y.add(p.x).multiply(q.y.add(q.x)))
        val c = modp(TWO.multiply(p.t).multiply(q.t).multiply(D))
        val d = modp(TWO.multiply(p.z).multiply(q.z))
        val e = b.subtract(a)
        val f = d.subtract(c)
        val g = d.add(c)
        val h = b.add(a)
        return Point(modp(e.multiply(f)), modp(g.multiply(h)), modp(f.multiply(g)), modp(e.multiply(h)))
    }

    private fun mul(scalar: BigInteger, point: Point): Point {
        var s = scalar
        var p = point
        var q = NEUTRAL
        while (s.signum() > 0) {
            if (s.testBit(0)) q = add(q, p)
            p = add(p, p)
            s = s.shiftRight(1)
        }
        return q
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
        var x = x2.modPow(P.add(BigInteger.valueOf(3)).divide(EIGHT), P)
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

    /**
     * True when `signature` (64 bytes) is a valid Ed25519 signature of `message` under `publicKey` (32 raw bytes).
     * Anything malformed is false; nothing throws, so a damaged file can only ever mean "refuse this bundle".
     */
    fun verify(publicKey: ByteArray, signature: ByteArray, message: ByteArray): Boolean {
        return try {
            if (publicKey.size != 32 || signature.size != 64) return false
            val a = decompress(publicKey) ?: return false
            val rBytes = signature.copyOfRange(0, 32)
            val r = decompress(rBytes) ?: return false
            val s = littleEndian(signature.copyOfRange(32, 64))
            if (s >= L) return false
            val h = littleEndian(sha512(rBytes, publicKey, message)).mod(L)
            equal(mul(s, BASE), add(r, mul(h, a)))
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
        val header = byteArrayOf(
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
        )
        for (i in header.indices) if (der[i] != header[i]) return null
        return der.copyOfRange(12, 44)
    }
}
