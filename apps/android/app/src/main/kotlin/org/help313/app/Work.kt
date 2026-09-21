// One background thread for everything that is not the bundle loader: the report queue, "Make a new key", writing
// the saved list. `java.util.concurrent` only, so there is no android.* class here and :core compiles it.
//
// Background threads for everything that is not the bundle loader. `java.util.concurrent` only, no android.* class
// except the debug log line.
//
// It exists because of two findings in the Android review of 2026-09-20. `Thread { … }.start()` was called from
// `onResume` and from every report tap, so a configuration change — a font-scale change, dark mode, a locale
// change, entering multi-window — started another one; and "Make a new key" ran `SecureRandom` and a disk write on
// the main thread, which froze the UI for 3.6 seconds.
//
// **Two threads, and the split is the point.** The first version of this file had one, and that was wrong in a way
// only the emulator showed (measured 2026-09-20): a flush of four queued reports with nothing answering takes four
// fifteen-second connect timeouts, and "Make a new key" queued behind it on the same thread did nothing for a
// minute. The UI never froze — but a privacy control that appears to have worked and has not is worse than a slow
// one. So:
//
//   - [net] is for the two things that talk to a server, `ReportStore.submit` and `ReportStore.flush`. One thread,
//     so sends are serialised and cannot interleave in the queue file, and so a person cannot make the app open
//     fifty connections by tapping fifty times.
//   - [io] is for the things that only touch this phone: making a new key, writing the saved list, counting what is
//     waiting. It can never be blocked by a network call, because nothing on it makes one.
//
// It is the same rule as the locks in ReportStore — the network is never allowed to hold up something local — one
// level up.
package org.help313.app

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory

object Work {

    private fun factory(name: String) = ThreadFactory { r ->
        Thread(r, name).also {
            it.isDaemon = true
            // Below the main thread: nothing here is what the person is looking at.
            it.priority = Thread.NORM_PRIORITY - 1
        }
    }

    private var local: ExecutorService = Executors.newSingleThreadExecutor(factory("help313-io"))
    private var network: ExecutorService = Executors.newSingleThreadExecutor(factory("help313-net"))

    /** Something that only touches this phone: a key, a small file, a count. Never waits on a server. */
    fun io(body: () -> Unit) = run(local, "local work", body)

    /** Something that talks to the server: sending a report, or flushing the outbox. */
    fun net(body: () -> Unit) = run(network, "network work", body)

    private fun run(pool: ExecutorService, what: String, body: () -> Unit) {
        try {
            pool.execute {
                try {
                    body()
                } catch (t: Throwable) {
                    // A background failure never takes its thread with it; the next task still runs.
                    if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "$what failed: $t")
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // Shut down between the tap and here. Nothing to do.
        }
    }

    /** Called from MainActivity.onDestroy when the activity is really finishing, not being recreated. */
    @Synchronized
    fun shutdown() {
        local.shutdownNow()
        network.shutdownNow()
        local = Executors.newSingleThreadExecutor(factory("help313-io"))
        network = Executors.newSingleThreadExecutor(factory("help313-net"))
    }
}
