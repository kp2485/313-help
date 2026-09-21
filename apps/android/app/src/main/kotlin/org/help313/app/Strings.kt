// Words, from strings/en.json, es.json, ar.json and bn.json (docs/05 "Language").
//
// There is one source of truth: the build copies those files out of the repository into the assets
// (:app:generateStrings), so a new key needs no Android change and the three apps can never drift. Android's own
// resource system holds only the launcher label, generated from the same files.
//
// Only the app's own words are translated. What a place says about itself (its name, what you get, who it is for,
// hours notes) stays as its owner wrote it: safety facts are never machine-translated (docs/05).
//
// Arabic is written right to left. Nothing here assumes a direction, and no layout in this app uses left or
// right: every layout is written in start/end terms, and the manifest declares supportsRtl, so Android mirrors
// the screens for an Arabic phone on its own. Adding a language is a new strings/<lang>.json, one line in
// LANGUAGES below, and one line in :app:generateStrings.
//
// Arabic and Bengali were drafted by machine on 2026-09-20 and have not yet been read by a native speaker
// (docs/DECISIONS.md). The app never says on screen that they were checked.
package org.help313.app

import android.content.Context
import org.help313.query.Json
import java.util.Locale

object L {

    /** The languages that have a strings file. The phone's own setting chooses; the choice is never sent. */
    val LANGUAGES = listOf("en", "es", "ar", "bn")

    private val tables = HashMap<String, Map<String, String>>()
    private var lang = "en"

    fun load(context: Context) {
        for (code in LANGUAGES) tables[code] = read(context, code)
        // The phone's own languages, in the person's order: the first one the app has words for. A phone set to
        // Urdu, then Arabic, then English gets Arabic, as it does on the iPhone (Help.swift). Never asked for,
        // never stored. LocaleList is API 24, which is minSdk. The choice itself is `pickLanguage` in Language.kt,
        // which has no android.* in it and is held to a test on a plain JDK; this reads the list and nothing more.
        val wanted = android.os.LocaleList.getDefault()
        lang = pickLanguage(
            wanted = (0 until wanted.size()).map { wanted[it].language },
            carried = LANGUAGES,
            hasWords = { tables[it]?.isNotEmpty() == true },
        )
    }

    /** The language in use. Only for choosing a date format; never stored, never sent. */
    fun current(): String = lang

    /**
     * For dates, times and numbers. Arabic and Bengali ask for Western digits (`-u-nu-latn`): a phone number has
     * to match the keypad and a time has to match the sign on the door (DECISIONS 2026-09-20).
     */
    fun locale(): Locale = when (lang) {
        "es" -> Locale.forLanguageTag("es-US")
        "ar" -> Locale.forLanguageTag("ar-u-nu-latn")
        "bn" -> Locale.forLanguageTag("bn-u-nu-latn")
        else -> Locale.US
    }

    private fun read(context: Context, code: String): Map<String, String> = try {
        val text = context.assets.open("strings/$code.json").use { String(it.readBytes(), Charsets.UTF_8) }
        Json.parse(text).obj.mapNotNull { (k, v) -> v.str?.let { k to it } }.toMap()
    } catch (_: Exception) {
        emptyMap()
    }

    /**
     * A missing translation falls back to English, never to a blank or a raw key.
     *
     * Three separate signatures rather than one with a default: with a default argument, `t(key)` and the
     * vararg form would both be applicable and the choice would rest on overload-resolution order.
     */
    fun t(key: String): String = fill(key, emptyMap())

    fun t(key: String, params: Map<String, String>): String = fill(key, params)

    fun t(key: String, vararg params: Pair<String, String>): String = fill(key, params.toMap())

    private fun fill(key: String, params: Map<String, String>): String {
        var s = tables[lang]?.get(key) ?: tables["en"]?.get(key) ?: key
        for ((k, v) in params) s = s.replace("{$k}", v)
        return s
    }
}
