// Saved places (docs/05), mirroring apps/web/src/saved.ts: listing ids kept on this phone only. Never sent,
// never synced, cleared with one tap. The screen is named plainly: "Saved places".
//
// Whether a listing may be saved at all is SavedRules.kt (`Saved.canSave`), which is android-free and is run by a
// plain JVM test on every build.
//
// Two corrections from the Android review of 2026-09-20:
//
//  - **In memory, read once.** Every listing detail and every draw of the Saved tab used to open and parse this
//    file on the main thread. The list is at most a hundred short ids, so it is read once — on the loader thread,
//    at start-up — and kept; writes go to disk in the background.
//  - **Writes are atomic.** `writeText` truncates first, so a phone killed mid-write left a broken file that
//    `load` caught and turned into "you have nothing saved". Temp file, then rename.
package org.help313.app

import android.content.Context
import org.help313.query.Json
import java.io.File

object SavedStore {

    private const val MAX = 100

    private val lock = Any()

    /** Null until the file has been read once. After that this is the list, and the file is only ever written. */
    @Volatile
    private var cache: List<String>? = null

    private fun file(c: Context) = File(c.filesDir, "saved.json")

    /** Reads the file on whatever thread calls this. BundleStore calls it on the loader thread at start-up. */
    fun prime(c: Context) {
        if (cache == null) synchronized(lock) { if (cache == null) cache = fromDisk(c) }
    }

    private fun fromDisk(c: Context): List<String> = try {
        val f = file(c)
        if (!f.isFile) emptyList() else Json.parse(f.readText(Charsets.UTF_8)).arr.mapNotNull { it.str }
    } catch (_: Throwable) {
        emptyList()
    }

    /** The saved ids. Free after the first read; on the main thread before that, it reads the file once. */
    fun load(c: Context): List<String> {
        cache?.let { return it }
        prime(c)
        return cache ?: emptyList()
    }

    /** Temp file, then rename: a kill mid-write leaves either the old list or the new one, never half of one. */
    private fun writeToDisk(c: Context, ids: List<String>) {
        synchronized(lock) {
            val target = file(c)
            val tmp = File(target.parentFile, target.name + ".tmp")
            java.io.FileOutputStream(tmp).use { out ->
                out.write(ids.joinToString(",", "[", "]") { Report.quote(it) }.toByteArray(Charsets.UTF_8))
                out.flush()
                out.fd.sync()
            }
            if (!tmp.renameTo(target)) tmp.delete()
        }
    }

    /** The new list, at once; the file catches up on a background thread so no tap waits on a disk write. */
    private fun set(c: Context, ids: List<String>): List<String> {
        cache = ids
        val app = c.applicationContext
        Work.io { writeToDisk(app, ids) }
        return ids
    }

    /** Returns the new list. Newest first; 100 at most. */
    fun toggle(c: Context, id: String, category: String): List<String> {
        val ids = load(c)
        return set(
            c,
            when {
                ids.contains(id) -> ids.filter { it != id }
                Saved.canSave(category) -> (listOf(id) + ids).take(MAX)
                else -> ids
            },
        )
    }

    fun clear(c: Context): List<String> = set(c, emptyList())
}
