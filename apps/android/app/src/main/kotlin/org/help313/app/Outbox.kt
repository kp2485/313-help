// The rules the report queue follows, with no file and no Context in them, so :core runs all of them on a plain
// JVM. ReportStore.kt is the half that reads and writes `outbox.json`.
//
// Three of these rules are corrections from the Android review of 2026-09-20:
//
//  1. **A queue that cannot be read is kept, not thrown away.** `queue()` caught every exception and returned an
//     empty list, so a file half-written when the phone was killed silently became "you had nothing waiting" and
//     the next write flattened it. Reports are the one thing a person gave this app on purpose. [read] now says
//     which it is — read, or unreadable — and ReportStore keeps the bytes aside and tells the person.
//  2. **Reports queued while a flush is in flight are not lost.** A flush reads the queue, spends up to 45 seconds
//     on the network, then writes back what did not go. Anything added in between used to be overwritten.
//     [merge] does the write-back as a multiset subtraction instead: what we tried and failed, plus everything
//     that appeared while we were away.
//  3. **The one-day hash is recomputed as the report leaves**, never reused from the file — see
//     `Reports.withCurrentNonce` in ReportModel.kt. That is the web app's choice (apps/web/src/report.ts,
//     `withCurrentNonce`) and this app now mirrors it exactly, so "Make a new key" is true of what is waiting as
//     well as of what is sent next.
package org.help313.app

import org.help313.query.Json

object Outbox {

    /** The newest 50 are kept. The same number as the web app's `outbox('queue', 50, post)`. */
    const val MAX_QUEUED = 50

    /**
     * What was in the file. `unreadable` is the honest third answer: not "empty", which is a claim about what the
     * person did, but "this phone could not read what it wrote", which is a thing to tell them.
     */
    class Stored(val items: List<Report>, val unreadable: Boolean)

    /** Nothing waiting, which is different from a file that could not be read. */
    val EMPTY = Stored(emptyList(), unreadable = false)

    /**
     * The queue in a file's text. A file that is not the array of reports it should be is `unreadable`, and its
     * contents are never guessed at: a partial write is not half a queue.
     */
    fun read(text: String?): Stored {
        if (text == null) return EMPTY
        if (text.isBlank()) return EMPTY
        val parsed = try {
            Json.parse(text)
        } catch (_: Throwable) {
            return Stored(emptyList(), unreadable = true)
        }
        if (parsed !is Json.Arr) return Stored(emptyList(), unreadable = true)
        val items = ArrayList<Report>()
        for (entry in parsed.items) {
            // One bad entry makes the file unreadable rather than quietly shortening the queue.
            items += Report.fromJson(entry) ?: return Stored(emptyList(), unreadable = true)
        }
        return Stored(items, unreadable = false)
    }

    /** The text to write: the newest [MAX_QUEUED], in the same shape [read] accepts. */
    fun write(items: List<Report>): String =
        items.takeLast(MAX_QUEUED).joinToString(",", "[", "]") { it.toJson() }

    /**
     * What the queue should hold after a flush: everything that still did not go, plus anything a person queued
     * while the flush was on the network.
     *
     * `tried` is what the flush took out of the file, `left` the ones that failed, and `current` what the file
     * holds now. The subtraction is a multiset one — two identical reports are two reports — and it is done on the
     * stored JSON, so a report is matched by what it actually is and not by object identity across a file read.
     */
    fun merge(tried: List<Report>, left: List<Report>, current: List<Report>): List<Report> {
        val outstanding = tried.map { it.toJson() }.toMutableList()
        val added = current.filterNot { outstanding.remove(it.toJson()) }
        return left + added
    }
}
