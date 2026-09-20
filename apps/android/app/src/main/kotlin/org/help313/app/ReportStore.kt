// The half of the report code that needs a phone: the random install secret on disk, the outbox for when there is
// no signal, and the POST. What a report *is*, and the one-day hash, are in ReportModel.kt, which has no android.*
// class in it and is therefore run by a plain JVM test on every build (:core).
//
// The only secret on the phone is random, resettable from the privacy screen, and used for one thing: the daily
// per-listing hash in ReportModel.kt. The secret itself never leaves the phone, and the file that holds it is
// excluded from backup (allowBackup is false for the whole app).
package org.help313.app

import android.content.Context
import org.help313.query.Json
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom

object ReportStore {

    private const val MAX_QUEUED = 50

    private fun secretFile(c: Context) = File(c.filesDir, "install-secret")
    private fun queueFile(c: Context) = File(c.filesDir, "outbox.json")

    /** Random, made on this phone, never sent. Clearing the app's data resets it. */
    @Synchronized
    fun installSecret(c: Context): String {
        val f = secretFile(c)
        if (f.isFile) {
            val s = f.readText().trim()
            if (s.length == 64) return s
        }
        return resetInstallSecret(c)
    }

    /** A new random key (About -> Privacy). Reports made after this cannot be matched to earlier ones. */
    @Synchronized
    fun resetInstallSecret(c: Context): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val s = Reports.hex(bytes)
        secretFile(c).writeText(s)
        return s
    }

    fun build(c: Context, targetId: String, kind: String, detail: String, nowMillis: Long): Report =
        Reports.build(installSecret(c), targetId, kind, detail, nowMillis)

    /** True when it went. False means it is on the phone and will be tried again. */
    private fun post(report: Report): Boolean {
        val base = BuildConfig.BUNDLE_BASE
        val apiRoot = base.substringBefore("/data/bundle/")
        if (apiRoot.contains("REPLACE-ME.invalid")) return false
        return try {
            val conn = URL("$apiRoot/v1/reports").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.useCaches = false
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("content-type", "application/json")
            conn.outputStream.use { it.write(report.toJson().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            // Any other 4xx will never succeed later; do not keep it.
            !Reports.retryable(code)
        } catch (_: Exception) {
            false
        }
    }

    @Synchronized
    private fun queue(c: Context): MutableList<Report> = try {
        val f = queueFile(c)
        if (!f.isFile) ArrayList()
        else Json.parse(f.readText(Charsets.UTF_8)).arr.mapNotNull { Report.fromJson(it) }.toMutableList()
    } catch (_: Exception) {
        ArrayList()
    }

    @Synchronized
    private fun writeQueue(c: Context, items: List<Report>) {
        queueFile(c).writeText(items.takeLast(MAX_QUEUED).joinToString(",", "[", "]") { it.toJson() }, Charsets.UTF_8)
    }

    /** Sends now if it can; otherwise keeps it on the phone and tries again later. Call off the main thread. */
    @Synchronized
    fun submit(c: Context, report: Report): Boolean {
        if (post(report)) return true
        writeQueue(c, queue(c) + report)
        return false
    }

    /** Tries everything waiting; keeps what still did not go. Call off the main thread. */
    @Synchronized
    fun flush(c: Context) {
        val waiting = queue(c)
        if (waiting.isEmpty()) return
        writeQueue(c, waiting.filterNot { post(it) })
    }

    fun queuedCount(c: Context): Int = queue(c).size
}
