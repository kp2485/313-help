// What a report *is*, and the one-day hash — the half of the report code that touches no android.* class and no
// BuildConfig, so it compiles and runs in a plain JVM test (:core, see apps/android/core/build.gradle.kts). The
// half that writes files and talks to the Worker is ReportStore.kt.
//
// This split exists for one reason: these are the privacy rules (docs/04, docs/08, audit A4), and a rule nobody
// can run is a rule nobody has checked. VerifyTest exercises everything in this file on every `:core:test`.
//
// What leaves the phone: a listing id, a kind, an optional note, a time at minute granularity, and a one-day
// hash. Nothing else exists to send. There is no account, no device id, no advertising id, no installation id
// that anybody but this phone can read, and no photo (photos are the web app's condition-report flow and are
// demo-only until the legal advice in docs/11 is in hand).
//
//     sha256(install_secret | target_id | detroit_day)
//
// The same phone reporting the same listing twice in a day counts once; two listings, or two days, give hashes
// nobody can connect.
package org.help313.app

import org.help313.query.Json
import org.help313.query.toWall
import org.help313.query.wallDateString
import java.security.MessageDigest

class Report(
    val targetId: String,
    val kind: String,
    val detail: String?,
    val observedAt: String,
    val clientNonce: String,
) {
    /** The closed schema the Worker accepts: an unknown field is a 400, so nothing extra is ever added here. */
    fun toJson(): String {
        val sb = StringBuilder("{")
        sb.append("\"target_id\":").append(quote(targetId))
        sb.append(",\"kind\":").append(quote(kind))
        if (!detail.isNullOrEmpty()) sb.append(",\"detail\":").append(quote(detail))
        sb.append(",\"observed_at\":").append(quote(observedAt))
        sb.append(",\"client_nonce\":").append(quote(clientNonce))
        return sb.append("}").toString()
    }

    companion object {
        fun quote(s: String): String {
            val sb = StringBuilder("\"")
            for (c in s) when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c.code < 0x20 -> sb.append(String.format("\\u%04x", c.code))
                else -> sb.append(c)
            }
            return sb.append("\"").toString()
        }

        fun fromJson(j: Json): Report? {
            val target = j["target_id"]?.str ?: return null
            return Report(
                target, j["kind"]?.str ?: return null, j["detail"]?.str,
                j["observed_at"]?.str ?: return null, j["client_nonce"]?.str ?: return null,
            )
        }
    }
}

val LISTING_KINDS = listOf("closed_permanently", "moved", "wrong_hours", "wrong_phone", "out_of_stock", "wrong_info")
const val CONFIRM_LISTING = "confirmed_ok"

/**
 * The report buttons one listing gets. "Out of supplies or food today" only makes sense where there are supplies:
 * offering it on an emergency room, a legal-aid office or a job centre is a question nobody can answer, and a
 * steward would get a queue of them (Android review, 2026-09-20 — this app offered it on every listing).
 *
 * Exactly the web app's rule, `LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category))`
 * in apps/web/src/main.ts, and the iPhone app's `ReportKinds.listing(for:)`. ParityTest holds the three together.
 */
fun listingKinds(category: String): List<String> =
    LISTING_KINDS.filter { it != "out_of_stock" || category.startsWith("food") || category.startsWith("harm") }

/** The rules a report follows. No file, no network, no Context: see ReportStore for those. */
object Reports {

    const val MAX_DETAIL = 280

    fun hex(b: ByteArray): String {
        val sb = StringBuilder(b.size * 2)
        for (x in b) {
            val v = x.toInt() and 0xff
            sb.append("0123456789abcdef"[v ushr 4]).append("0123456789abcdef"[v and 0x0f])
        }
        return sb.toString()
    }

    /** sha256(secret | target | day), with the day on a Detroit calendar. */
    fun nonce(secret: String, targetId: String, nowMillis: Long): String =
        hex(
            MessageDigest.getInstance("SHA-256")
                .digest("$secret|$targetId|${wallDateString(toWall(nowMillis))}".toByteArray(Charsets.UTF_8))
        )

    /** Minute granularity, as the Worker's schema requires; never seconds, never a time zone offset. */
    fun isoMinutesUtc(millis: Long): String = org.help313.query.isoUtc(millis).substring(0, 16) + "Z"

    /** Everything a report carries, given a secret this phone already holds. */
    fun build(secret: String, targetId: String, kind: String, detail: String, nowMillis: Long): Report {
        val text = detail.trim().take(MAX_DETAIL)
        return Report(
            targetId, kind, if (text.isEmpty()) null else text,
            isoMinutesUtc(nowMillis), nonce(secret, targetId, nowMillis),
        )
    }

    /** Worth trying again later: the server was busy, rate-limited us, timed out, or could not be reached. */
    fun retryable(status: Int): Boolean = status >= 500 || status == 429 || status == 408

    /**
     * The report as it should actually leave the phone: its one-day hash worked out again, now, from the secret
     * this phone holds now.
     *
     * "Make a new key" is a promise that nothing sent after it can be matched to anything sent before it. A report
     * that sat in the outbox with no signal and then went out carrying the *old* key would have broken that
     * promise silently, hours later — the web app found this first (apps/web/src/report.ts `withCurrentNonce`,
     * web review 2026-09-20) and this is the same fix, so the two apps behave identically.
     *
     * The day is the one the report was *observed* on, not today, so a report queued yesterday still dedupes
     * against yesterday's reports of the same listing rather than becoming a second one.
     */
    fun withCurrentNonce(secret: String, r: Report): Report {
        val observed = org.help313.query.parseInstant(r.observedAt) ?: return r
        return Report(r.targetId, r.kind, r.detail, r.observedAt, nonce(secret, r.targetId, observed))
    }
}
