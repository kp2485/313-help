// Saved places (docs/05), mirroring apps/web/src/saved.ts: listing ids kept on this phone only. Never sent,
// never synced, cleared with one tap. The screen is named plainly: "Saved places".
//
// Whether a listing may be saved at all is SavedRules.kt (`Saved.canSave`), which is android-free and is run by a
// plain JVM test on every build.
package org.help313.app

import android.content.Context
import org.help313.query.Json
import java.io.File

object SavedStore {

    private const val MAX = 100

    private fun file(c: Context) = File(c.filesDir, "saved.json")

    @Synchronized
    fun load(c: Context): List<String> = try {
        val f = file(c)
        if (!f.isFile) emptyList() else Json.parse(f.readText(Charsets.UTF_8)).arr.mapNotNull { it.str }
    } catch (_: Exception) {
        emptyList()
    }

    @Synchronized
    private fun write(c: Context, ids: List<String>) {
        file(c).writeText(ids.joinToString(",", "[", "]") { Report.quote(it) }, Charsets.UTF_8)
    }

    /** Returns the new list. Newest first; 100 at most. */
    @Synchronized
    fun toggle(c: Context, id: String, category: String): List<String> {
        val ids = load(c)
        val next = when {
            ids.contains(id) -> ids.filter { it != id }
            Saved.canSave(category) -> (listOf(id) + ids).take(MAX)
            else -> ids
        }
        write(c, next)
        return next
    }

    @Synchronized
    fun clear(c: Context): List<String> {
        write(c, emptyList())
        return emptyList()
    }
}
