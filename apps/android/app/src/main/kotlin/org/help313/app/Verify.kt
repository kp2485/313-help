// What makes a bundle acceptable (docs/06, audit A5). Kept apart from BundleStore, and free of any android.*
// class, so every rule here is exercised by a plain JVM unit test.
//
// A bundle is used only when: index.json.sig carries an Ed25519 signature over index.json made by one of the two
// keys this build pins; every file the index lists matches its sha256; and it is not older than the copy already
// held. Anything else is refused and the old copy stays. Unsigned is never "probably fine".
package org.help313.app

import org.help313.query.Json
import java.security.MessageDigest

class FileMeta(val sha256: String, val bytes: Int)

class BundleIndex(
    val version: String,
    val generatedAt: String,
    val retired: Boolean,
    val signing: String,
    val emergencyVerified: Boolean,
    val files: Map<String, FileMeta>,
) {
    companion object {
        fun fromJson(j: Json) = BundleIndex(
            version = j["version"]?.str ?: "",
            generatedAt = j["generated_at"]?.str ?: "",
            retired = j["retired"]?.bool ?: false,
            signing = j["signing"]?.str ?: "",
            emergencyVerified = j["emergency_verified"]?.bool ?: false,
            files = (j["files"]?.obj ?: emptyMap()).mapValues { (_, v) ->
                FileMeta(v["sha256"]?.str ?: "", v["bytes"]?.int ?: 0)
            },
        )
    }
}

sealed class BundleError(message: String) : Exception(message) {
    object BadSignature : BundleError("the list is not signed by a key this app pins")
    class BadChecksum(val file: String) : BundleError("$file does not match its checksum")
    object Older : BundleError("the list offered is older than the one on this phone")
    object NoKeys : BundleError("this build pins no keys, so it can accept no list")
    class Unreadable(val why: String) : BundleError(why)
}

object BundleCheck {

    /** Map tiles and neighbourhood numbers are big and are not needed to find help; they load when opened. */
    fun loadedNow(name: String): Boolean = !name.startsWith("map/") && !name.startsWith("indicators/")

    fun refusesOlder(current: BundleIndex, next: BundleIndex): Boolean = next.generatedAt < current.generatedAt

    fun sha256Hex(data: ByteArray): String {
        val d = MessageDigest.getInstance("SHA-256").digest(data)
        val sb = StringBuilder(d.size * 2)
        for (b in d) {
            val v = b.toInt() and 0xff
            sb.append("0123456789abcdef"[v ushr 4])
            sb.append("0123456789abcdef"[v and 0x0f])
        }
        return sb.toString()
    }

    /**
     * The index, if the signature file names a signature one of `pinnedSpkiBase64` made over `indexBytes`.
     * `pinnedSpkiBase64` is what the build pinned: base64 SPKI DER Ed25519 public keys, active and spare.
     * The public key written inside the .sig file is never trusted; it is only a hint for a person reading it.
     */
    fun verifiedIndex(indexBytes: ByteArray, sigBytes: ByteArray, pinnedSpkiBase64: List<String>): BundleIndex {
        if (pinnedSpkiBase64.isEmpty()) throw BundleError.NoKeys
        val sigJson = try {
            Json.parse(String(sigBytes, Charsets.UTF_8))
        } catch (e: Exception) {
            throw BundleError.Unreadable("the signature file is not JSON")
        }
        if (sigJson["alg"]?.str != null && sigJson["alg"]?.str != "Ed25519") throw BundleError.BadSignature
        val signature = base64(sigJson["signature"]?.str ?: "") ?: throw BundleError.BadSignature

        val ok = Trace.time("verify.signature") {
            pinnedSpkiBase64.any { pin ->
                val der = base64(pin) ?: return@any false
                val raw = Ed25519.rawKeyFromSpkiDer(der) ?: return@any false
                Ed25519.verify(raw, signature, indexBytes)
            }
        }
        if (!ok) throw BundleError.BadSignature
        return try {
            BundleIndex.fromJson(Json.parse(String(indexBytes, Charsets.UTF_8)))
        } catch (e: Exception) {
            throw BundleError.Unreadable("the list index is not JSON")
        }
    }

    /** Standard base64 with optional padding; null for anything else. Written out so this file needs no android.util. */
    fun base64(s: String): ByteArray? {
        val text = s.trim()
        if (text.isEmpty()) return null
        val table = IntArray(128) { -1 }
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        for (i in alphabet.indices) table[alphabet[i].code] = i
        val out = java.io.ByteArrayOutputStream(text.length * 3 / 4 + 3)
        var buffer = 0
        var bits = 0
        for (c in text) {
            if (c == '=') break
            if (c.code >= 128) return null
            val v = table[c.code]
            if (v < 0) return null
            buffer = (buffer shl 6) or v
            bits += 6
            if (bits >= 8) {
                bits -= 8
                out.write((buffer shr bits) and 0xff)
            }
        }
        return out.toByteArray()
    }
}
