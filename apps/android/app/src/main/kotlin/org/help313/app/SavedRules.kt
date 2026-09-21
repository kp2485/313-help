// The one rule about saving that must never be got wrong, kept where a plain JVM test can run it (:core).
// The list itself lives on the phone and is in SavedStore.kt.
//
// A phone can be looked through by someone else (audit A8), so listings for domestic violence, mental-health
// crisis, treatment and help after sexual assault cannot be saved at all.
package org.help313.app

object Saved {
    fun canSave(category: String): Boolean = !isPrivate(category)
}
