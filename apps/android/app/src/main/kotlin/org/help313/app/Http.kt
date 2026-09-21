// The only place in this app that opens a connection. `java.net` and nothing else — no android.* class, so :core
// compiles it on a plain JVM, and no HTTP library, so nothing is added to the APK (apps/android/README.md).
//
// Every request this app makes goes through `open`, which is what makes the promises in docs/08 checkable in one
// place rather than repeated in two files that can drift:
//
//   - **https or nothing.** Net.isHttps, and the manifest's usesCleartextTraffic="false" behind it.
//   - **One header of ours**, the fixed "313Help-Android/<version>" (Net.userAgent). Before this, nothing set a
//     User-Agent, so Android's default went out: its version, the device model and the build id, on a request
//     meant to say nothing about the phone (Android review, 2026-09-20).
//   - **No cookies.** HttpURLConnection sends and stores cookies through whatever CookieHandler is installed
//     process-wide. Nothing here installs one, but "nothing installs one" is not the same as "there is none": a
//     library, or a future line of our own, could. So the default is set to null, once, and read back.
//   - **No caches.** Neither the connection's own cache nor a process-wide ResponseCache. The bundle is verified
//     against a pinned key every time it is read, so a cached copy buys nothing and a cached *report* POST would
//     be a copy of the one thing this app sends sitting on disk.
//   - **No redirects.** A 301 to another host is a request we never agreed to make, so it is a failure instead.
//   - **No query string and no referrer**, which is a property of the callers: every URL is a path under the
//     pinned bundle base, or the pinned api root plus "/v1/reports".
package org.help313.app

import java.net.CookieHandler
import java.net.HttpURLConnection
import java.net.ResponseCache
import java.net.URL

object Http {

    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 30_000

    /** 32 MiB. Nothing we publish is a tenth of this; it is a ceiling on what a hostile origin can make us hold. */
    const val MAX_BODY_BYTES = 32 * 1024 * 1024

    /**
     * Turned off once, on the first connection this process makes. Reading the handlers back and setting them to
     * null is cheap and means the guarantee does not rest on nobody ever having installed one.
     */
    private var quietened = false

    @Synchronized
    private fun quieten() {
        if (quietened) return
        CookieHandler.setDefault(null)
        ResponseCache.setDefault(null)
        quietened = true
    }

    /** True when this process holds no cookie jar and no response cache. Used by the tests. */
    fun isQuiet(): Boolean = CookieHandler.getDefault() == null && ResponseCache.getDefault() == null

    /**
     * A connection with every one of the rules above applied. `userAgent` comes from BuildConfig.VERSION_NAME at
     * the call site, so this file needs no Android class to know the app's version.
     */
    fun open(url: String, userAgent: String): HttpURLConnection {
        if (!Net.isHttps(url)) throw BundleError.Unreadable("$url is not https")
        quieten()
        val conn = URL(url).openConnection() as HttpURLConnection
        // The one header of ours. Everything else HttpURLConnection sends is protocol (Host, Connection,
        // Accept-Encoding) and says nothing about the phone or the person.
        conn.setRequestProperty("user-agent", userAgent)
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.defaultUseCaches = false
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        return conn
    }

    /** The body, up to [MAX_BODY_BYTES]. Anything longer is refused rather than held. */
    fun readBody(conn: HttpURLConnection): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        conn.inputStream.use { input ->
            val buf = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                total += n
                if (total > MAX_BODY_BYTES) throw BundleError.Unreadable("file too large")
                out.write(buf, 0, n)
            }
        }
        return out.toByteArray()
    }
}
