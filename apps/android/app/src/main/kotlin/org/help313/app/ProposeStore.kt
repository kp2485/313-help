// The half of "Add a place that helps" that needs a phone: the queue file for when there is no signal, and the
// POST. What a proposal *is* and what may be in it are in Propose.kt, which `:core` runs on a plain JVM.
//
// It follows ReportStore's rules line for line, and for the same reasons (Android review, 2026-09-20):
//
//  1. **A lock is never held across the network.** Files are locked; the network is not.
//  2. **Writes are atomic** — a temp file, synced, then renamed — so a phone killed mid-write comes back with the
//     old queue rather than half of a new one.
//  3. **A queue that cannot be read is kept, not thrown away.** Somebody typed those words about a place they
//     know; the bytes are moved aside for a steward rather than flattened by the next write.
//  4. **Exactly one flush at a time**, so a proposal is never sent twice.
//
// **Nothing about the person goes out.** A proposal carries no install secret, no daily hash, no id of any kind —
// unlike a report, which needs one to be deduplicated. The request is Http.kt's: https, the one honest header,
// no cookies, no redirects, no query string.
package org.help313.app

import android.content.Context
import java.io.File

object ProposeStore {

    private val files = Any()
    private val flushing = java.util.concurrent.atomic.AtomicBoolean(false)

    /** How many are waiting, cached so a screen can say so without touching the disk on the main thread. */
    @Volatile
    var queued: Int = 0
        private set

    @Volatile
    var unreadable: Boolean = false
        private set

    private fun queueFile(c: Context) = File(c.filesDir, "outbox-proposals.json")
    private fun setAsideFile(c: Context) = File(c.filesDir, "proposals-unreadable-${System.currentTimeMillis()}.json")

    private fun setAsideFiles(c: Context): List<File> =
        (c.filesDir.listFiles() ?: emptyArray()).filter { it.name.startsWith("proposals-unreadable-") }

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

    private fun read(c: Context): ProposalOutbox.Stored {
        val stored = synchronized(files) {
            val f = queueFile(c)
            val text = if (!f.isFile) null else try { f.readText(Charsets.UTF_8) } catch (_: Throwable) { null }
            val s = ProposalOutbox.read(text)
            if (s.unreadable && f.isFile) runCatching { f.renameTo(setAsideFile(c)) }
            s
        }
        queued = stored.items.size
        if (stored.unreadable) unreadable = true
        return stored
    }

    private fun write(c: Context, items: List<Proposal>) {
        synchronized(files) { writeAtomically(queueFile(c), ProposalOutbox.write(items)) }
        queued = items.size.coerceAtMost(ProposalOutbox.MAX_QUEUED)
    }

    /** True when it went. Never called under a lock. Any 4xx that is not retryable will never succeed later. */
    private fun post(p: Proposal): Boolean {
        val apiRoot = Net.apiRoot(BuildConfig.BUNDLE_BASE) ?: return false
        return try {
            val conn = Http.open("$apiRoot/v1/proposals", Net.userAgent(BuildConfig.VERSION_NAME))
            try {
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("content-type", "application/json")
                conn.outputStream.use { it.write(p.toJson().toByteArray(Charsets.UTF_8)) }
                !Reports.retryable(conn.responseCode)
            } finally {
                conn.disconnect()
            }
        } catch (_: Throwable) {
            false
        }
    }

    /** Sends now if it can; otherwise keeps it on the phone and tries again later. Call off the main thread. */
    fun submit(c: Context, p: Proposal): Boolean {
        if (post(p)) {
            read(c)
            return true
        }
        write(c, read(c).items + p)
        return false
    }

    /** Tries everything waiting, keeping what did not go and anything typed while this was on the network. */
    fun flush(c: Context) {
        if (!flushing.compareAndSet(false, true)) return
        try {
            val tried = read(c).items
            if (tried.isEmpty()) return
            val left = tried.filterNot { post(it) }
            synchronized(files) {
                val current = ProposalOutbox.read(
                    queueFile(c).takeIf { it.isFile }?.let { runCatching { it.readText(Charsets.UTF_8) }.getOrNull() },
                ).items
                val next = ProposalOutbox.merge(tried, left, current)
                writeAtomically(queueFile(c), ProposalOutbox.write(next))
                queued = next.size.coerceAtMost(ProposalOutbox.MAX_QUEUED)
            }
        } catch (_: Throwable) {
            // Nothing is lost: what did not go is still in the file.
        } finally {
            flushing.set(false)
        }
    }

    /** Throw away everything waiting, without sending it — the same control the reports have. */
    fun clearQueue(c: Context) {
        write(c, emptyList())
        synchronized(files) { for (f in setAsideFiles(c)) runCatching { f.delete() } }
        unreadable = false
    }

    fun queuedCount(c: Context): Int = read(c).items.size
}
