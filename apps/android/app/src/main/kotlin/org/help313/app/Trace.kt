// Timing, for finding out where a cold start goes. Off unless something installs a sink, and the only thing that
// ever does is BundleStore when BuildConfig.DEBUG is true, so a release build runs with `sink == null` and pays
// one volatile read per labelled step.
//
// It exists because the first run of the app on 2026-09-20 waited about twenty seconds before any listing
// appeared, and guessing which part was slow would have been guessing. No android.* class here, so :core compiles
// it and the same labels can be timed in a plain JVM test.
package org.help313.app

object Trace {

    /** (label, milliseconds) -> somewhere a person can read it. Null means "do not time anything". */
    @Volatile
    var sink: ((String, Long) -> Unit)? = null

    inline fun <T> time(label: String, body: () -> T): T {
        val s = sink ?: return body()
        val started = System.nanoTime()
        val result = body()
        s(label, (System.nanoTime() - started) / 1_000_000L)
        return result
    }

    fun say(label: String, millis: Long) {
        sink?.invoke(label, millis)
    }
}
