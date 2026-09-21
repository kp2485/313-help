// The half of the report code that needs a phone: the random install secret on disk, the outbox for when there is
// no signal, and the POST. What a report *is*, the one-day hash and `withCurrentNonce` are in ReportModel.kt; the
// queue's own rules are in Outbox.kt. Neither of those names an android.* class, so a plain JVM test runs them on
// every build (:core).
//
// The only secret on the phone is random, resettable from the privacy screen, and used for one thing: the daily
// per-listing hash in ReportModel.kt. The secret itself never leaves the phone, and the file that holds it is
// excluded from backup (allowBackup is false for the whole app).
//
// Four things here are corrections from the Android review of 2026-09-20:
//
//  1. **A lock is never held across the network.** Every method used to be `@Synchronized` on this object, and
//     `submit` and `flush` called `post` from inside that — so one report with no signal held the monitor for the
//     15-second connect plus the 30-second read, and anything else that touched the queue (a tap, "Make a new key",
//     the count on the privacy screen) blocked behind it. On the main thread that is an ANR. Files are locked; the
//     network is not.
//  2. **The one-day hash is worked out as the report leaves**, from the secret this phone holds *now*
//     (`Reports.withCurrentNonce`). "Make a new key" is otherwise a promise broken silently, hours later, by a
//     report that was queued under the old key. This is the web app's choice, mirrored exactly.
//  3. **Writes are atomic.** `writeText` truncates and then writes: a phone killed in between left a half-written
//     `outbox.json`, and `queue()` caught the parse error and returned an empty list, so the queue was silently
//     gone. Every write here goes to a temp file and is renamed, which is atomic on one file system.
//  4. **A queue that cannot be read is kept and reported.** The bytes are moved aside, not deleted, and
//     [unreadable] is true until the person is told (Screens.about shows it).
package org.help313.app

import android.content.Context
import java.io.File
import java.security.SecureRandom

object ReportStore {

    /** Held only while a file is read or written. Never while anything is on the network. */
    private val files = Any()

    /**
     * True while exactly one flush is running. A second flush returns at once rather than sending the same report
     * twice — the web app gets this from `outbox`'s promise chain; here it is one atomic boolean.
     */
    private val flushing = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * How many reports are waiting, and whether the file could be read at all, cached so that a screen can show
     * both without touching the disk on the main thread. Refreshed by every queue read and write.
     */
    @Volatile
    var queued: Int = 0
        private set

    @Volatile
    var unreadable: Boolean = false
        private set

    private fun secretFile(c: Context) = File(c.filesDir, "install-secret")
    private fun queueFile(c: Context) = File(c.filesDir, "outbox.json")
    /** A unique name, so moving a second broken file aside can never overwrite the first one. */
    private fun setAsideFile(c: Context) = File(c.filesDir, "outbox-unreadable-${System.currentTimeMillis()}.json")

    /** Every broken outbox kept beside the app's files, for a steward to look at and for `clearQueue` to remove. */
    private fun setAsideFiles(c: Context): List<File> =
        (c.filesDir.listFiles() ?: emptyArray()).filter { it.name.startsWith("outbox-unreadable-") }

    /**
     * Write, then rename. `File.renameTo` within one directory is a rename on the same file system, which is
     * atomic: a reader sees either the old file or the new one, never half of either. `fd.sync()` first, because a
     * rename that reaches the disk before the bytes do is the same bug with an extra step.
     */
    private fun writeAtomically(target: File, text: String) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        java.io.FileOutputStream(tmp).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.flush()
            out.fd.sync()
        }
        if (!tmp.renameTo(target)) {
            tmp.delete()
            throw java.io.IOException("could not replace ${target.name}")
        }
    }

    /** Random, made on this phone, never sent. Clearing the app's data resets it. */
    fun installSecret(c: Context): String = synchronized(files) {
        val f = secretFile(c)
        if (f.isFile) {
            val s = try { f.readText().trim() } catch (_: Throwable) { "" }
            if (s.length == 64) return s
        }
        return newSecret(c)
    }

    /**
     * A new random key (About -> Privacy). Reports made after this cannot be matched to earlier ones — including
     * the ones still waiting in the outbox, whose hashes are recomputed as they leave.
     *
     * Call this off the main thread. It makes 32 random bytes, hashes nothing, and writes one small file, but
     * SecureRandom's first use in a process can block on the kernel's entropy pool and the write is a disk write:
     * on the main thread the reviewer measured the UI frozen for 3.6 seconds.
     */
    fun resetInstallSecret(c: Context): String = synchronized(files) { newSecret(c) }

    private fun newSecret(c: Context): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val s = Reports.hex(bytes)
        writeAtomically(secretFile(c), s)
        return s
    }

    fun build(c: Context, targetId: String, kind: String, detail: String, nowMillis: Long): Report =
        Reports.build(installSecret(c), targetId, kind, detail, nowMillis)

    // ---- the queue ---------------------------------------------------------------------------------------------

    /** What is in the file, and whether it could be read. Locked, but only for as long as the read takes. */
    private fun read(c: Context): Outbox.Stored {
        val stored = synchronized(files) {
            val f = queueFile(c)
            val text = if (!f.isFile) null else try { f.readText(Charsets.UTF_8) } catch (_: Throwable) { null }
            val s = Outbox.read(text)
            // Keep the bytes we could not read, rather than letting the next write flatten them. They are the
            // person's own reports; a steward can look at the file, and nothing is thrown away on a guess. The file
            // is only removed from its old name once it is safely at the new one — a failed move leaves it where it
            // is, which is worse for us and better for the person than deleting it.
            if (s.unreadable && f.isFile) {
                runCatching { f.renameTo(setAsideFile(c)) }
            }
            s
        }
        queued = stored.items.size
        if (stored.unreadable) unreadable = true
        return stored
    }

    private fun write(c: Context, items: List<Report>) {
        synchronized(files) { writeAtomically(queueFile(c), Outbox.write(items)) }
        queued = items.size.coerceAtMost(Outbox.MAX_QUEUED)
    }

    /** True when it went. False means it is on the phone and will be tried again. Never called under a lock. */
    private fun post(report: Report): Boolean {
        val apiRoot = Net.apiRoot(BuildConfig.BUNDLE_BASE) ?: return false
        return try {
            val conn = Http.open("$apiRoot/v1/reports", Net.userAgent(BuildConfig.VERSION_NAME))
            try {
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("content-type", "application/json")
                conn.outputStream.use { it.write(report.toJson().toByteArray(Charsets.UTF_8)) }
                // Any other 4xx will never succeed later; do not keep it.
                !Reports.retryable(conn.responseCode)
            } finally {
                conn.disconnect()
            }
        } catch (_: Throwable) {
            false
        }
    }

    /** Sends now if it can; otherwise keeps it on the phone and tries again later. Call off the main thread. */
    fun submit(c: Context, report: Report): Boolean {
        // The hash is already current for a report made a moment ago, but going through the same call as a queued
        // one means there is exactly one place the rule lives.
        if (post(Reports.withCurrentNonce(installSecret(c), report))) {
            read(c)                      // refresh the count a screen may be showing
            return true
        }
        write(c, read(c).items + report)
        return false
    }

    /**
     * Tries everything waiting; keeps what still did not go, and keeps anything a person queued while this was on
     * the network. Call off the main thread.
     */
    fun flush(c: Context) {
        if (!flushing.compareAndSet(false, true)) return
        try {
            val tried = read(c).items
            if (tried.isEmpty()) return
            // The secret is read again for *each* report, not once for the flush. A flush of a full outbox with no
            // signal takes up to 45 seconds per report, and "Make a new key" can be tapped in the middle of it: with
            // the secret read once up front, everything still queued behind that tap would go out under the old key
            // and the promise the button makes would be false for them. Reading a 64-byte file per report costs
            // nothing next to the request it precedes, and it is what the web app does (`withCurrentNonce` fetches
            // the secret on every call).
            val left = tried.filterNot { post(Reports.withCurrentNonce(installSecret(c), it)) }
            // Re-read under the lock: submit() may have added to the file while we were away.
            synchronized(files) {
                val current = Outbox.read(
                    queueFile(c).takeIf { it.isFile }?.let { runCatching { it.readText(Charsets.UTF_8) }.getOrNull() },
                ).items
                val next = Outbox.merge(tried, left, current)
                writeAtomically(queueFile(c), Outbox.write(next))
                queued = next.size.coerceAtMost(Outbox.MAX_QUEUED)
            }
        } catch (_: Throwable) {
            // Nothing is lost: what did not go is still in the file.
        } finally {
            flushing.set(false)
        }
    }

    /** How many are waiting. Reads the file, so call it off the main thread; screens read [queued] instead. */
    fun queuedCount(c: Context): Int = read(c).items.size

    /**
     * Throw away everything waiting, without sending it. Nothing waiting is worth keeping against a person's
     * wishes: this is their phone and their report (the web app's `clearQueue`). Call off the main thread.
     */
    fun clearQueue(c: Context) {
        write(c, emptyList())
        // "Delete what is waiting" means all of it, including anything that had to be set aside because it could
        // not be read. A person asking for it to be gone is asking about the bytes, not about our bookkeeping.
        synchronized(files) { for (f in setAsideFiles(c)) runCatching { f.delete() } }
        unreadable = false
    }
}
