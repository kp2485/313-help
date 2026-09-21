// Which language the app speaks. One rule, in one pure function, so it can be held to a test rather than to a phone.
//
// No android.* class here on purpose: `:core` compiles it and `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs it on
// a plain JDK. Strings.kt is the Android half — it reads `LocaleList.getDefault()` and hands the list to this.
package org.help313.app

/**
 * The first language on the phone's own list that this app actually carries words for, or English.
 *
 * A phone set to Urdu, then Arabic, then English gets Arabic, exactly as the iPhone app does (Help.swift): the
 * person's *order* is the answer, not the first language we happen to recognise and not the phone's single
 * "primary" locale. It is never asked for, never stored and never sent.
 *
 * [hasWords] is asked as well as [carried] because a strings file that failed to load is a language this app cannot
 * speak, whatever the build intended: falling through to the next choice is better than a screen of raw keys.
 *
 * @param wanted the phone's languages in the person's own order, as two-letter codes ("ur", "ar", "en").
 * @param carried the languages this build ships (L.LANGUAGES).
 * @param hasWords whether that language's table actually loaded.
 */
fun pickLanguage(wanted: List<String>, carried: List<String>, hasWords: (String) -> Boolean = { true }): String =
    wanted.firstOrNull { it in carried && hasWords(it) } ?: "en"
