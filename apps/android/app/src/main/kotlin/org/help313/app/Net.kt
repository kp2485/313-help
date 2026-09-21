// Everything about *what* this app is allowed to fetch, send and open, with no android.* class and no network
// call in it, so :core runs every rule on a plain JVM (apps/android/core/build.gradle.kts). Http.kt is the thin
// part that actually opens a connection; this file is the policy it obeys.
//
// Three rules live here, and each one exists because of a real finding in the Android review of 2026-09-20:
//
//  1. **One honest header, and never the phone's.** Nothing here ever set a User-Agent, so `HttpURLConnection`
//     sent Android's default — "Dalvik/2.1.0 (Linux; U; Android 15; sdk_gphone64_arm64 Build/AE3A.240806.005)" —
//     on every bundle GET and every report POST. That is the Android version, the device model and the build id
//     of the phone, handed to a server on a request that is meant to carry nothing about the person at all
//     (docs/08). It is also a fingerprint good enough to group a few requests together. So the header is set, to
//     one fixed string that names the app and its version and nothing about the device.
//  2. **https, everywhere, including the POST.** `BundleStore.httpGet` already refused anything else; the report
//     POST did not, and derived its address from `BUNDLE_BASE` by string surgery, so a build pointed at an
//     unexpected base could have posted a report — the one thing this app ever sends — to whatever came out.
//  3. **A signed index still does not get to name a file path.** The index is Ed25519-signed, but a signed
//     "../../shared_prefs/x" is still a path escape, and a signed "https://elsewhere/" appended to a base URL is
//     still a different server. Signed means "this came from our steward", not "this is safe to concatenate".
package org.help313.app

/** The policy: what may be fetched, what may be sent, what may be opened, and what a file may be called. */
object Net {

    /**
     * The only header this app adds to any request. It names the app and its version, and it names nothing about
     * the phone: no Android version, no model, no build id, no locale, no identifier of any kind.
     *
     * It is deliberately *not* empty and not a lie. CLAUDE.md's rule for the data sources is to identify our
     * requests honestly and never to disguise them; the same rule applies to our own server. A steward reading a
     * log should be able to tell an Android request from a browser one, and that is all this gives them.
     */
    fun userAgent(versionName: String): String = "313Help-Android/$versionName"

    /**
     * Where "Leave this page fast" goes. The same address the web app uses (`location.replace` in
     * apps/web/src/main.ts): a weather page is the most ordinary thing a phone could be showing, it is plausible for
     * anyone to have open, and it belongs to nobody involved. The three apps use one address on purpose, so that
     * what someone learns on one is true of the others.
     */
    const val QUICK_EXIT_URL = "https://www.weather.gov/"

    /** True for exactly one scheme. Written out rather than taken from java.net.URL so :core can test it. */
    fun isHttps(url: String): Boolean = url.startsWith("https://")

    /**
     * The origin this build posts reports to, derived from the pinned `BUNDLE_BASE`, or null when the base is not
     * something we are willing to derive an origin from.
     *
     * The old form was `base.substringBefore("/data/bundle/")`, whose result was never looked at: a base with no
     * "/data/bundle/" in it came back unchanged (so the POST went to the bundle path itself), and a base carrying
     * a userinfo or a query came back with it attached. This returns a bare `https://host[:port]` or nothing.
     */
    fun apiRoot(bundleBase: String): String? {
        if (!isHttps(bundleBase)) return null
        val marker = "/data/bundle/"
        val at = bundleBase.indexOf(marker)
        if (at < 0) return null
        val root = bundleBase.substring(0, at)
        if (!isBareHttpsOrigin(root)) return null
        // `.invalid` is reserved by RFC 2606 and can never be a real server, so it is what the placeholder build
        // uses. A build that has not been given a home posts nowhere at all rather than trying and failing.
        if (root.endsWith(".invalid") || root.contains(".invalid:")) return null
        return root
    }

    /**
     * `https://host` or `https://host:port`, and nothing else: no path, no query, no fragment, no `user:pass@`,
     * no whitespace, no control character, no credentials smuggled in as a host.
     */
    fun isBareHttpsOrigin(s: String): Boolean {
        if (!isHttps(s)) return false
        val host = s.removePrefix("https://")
        if (host.isEmpty() || host.length > 253) return false
        if (host.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f }) return false
        if (host.any { it == '/' || it == '?' || it == '#' || it == '@' || it == '\\' }) return false
        val name = host.substringBefore(':')
        val port = if (host.contains(':')) host.substringAfter(':') else null
        if (port != null && (port.isEmpty() || !port.all { it.isDigit() } || (port.toIntOrNull() ?: 0) !in 1..65535)) return false
        if (name.isEmpty() || name.startsWith('.') || name.endsWith('.') || name.contains("..")) return false
        return name.all { it.isLetterOrDigit() || it == '.' || it == '-' }
    }

    /**
     * A file name from the signed index that this app is willing to use as both a path under `filesDir` and a
     * suffix on the bundle URL: lowercase letters, digits, `.`, `-`, `_`, joined by single `/`, with no segment
     * that is empty, `.` or `..`, no leading slash, no drive letter, no backslash, and a length a file system will
     * take. Everything the pipeline writes (`index.json`, `category/food.json`, `places/greenway.json`,
     * `map/42.json`, `indicators/nbh_downtown.json`) passes; nothing that escapes `cacheDir` or changes host does.
     */
    fun safeBundlePath(name: String): Boolean {
        if (name.isEmpty() || name.length > 200) return false
        if (name.startsWith('/') || name.endsWith('/')) return false
        if (name.contains('\\') || name.contains(':')) return false
        val parts = name.split('/')
        if (parts.size > 6) return false
        for (part in parts) {
            if (part.isEmpty() || part == "." || part == "..") return false
            if (part.startsWith('.') || part.startsWith('-')) return false
            if (!part.all { it in 'a'..'z' || it in '0'..'9' || it == '.' || it == '-' || it == '_' }) return false
        }
        return true
    }

    /**
     * An address this app will hand to `ACTION_VIEW`, or null. https only: a website from the signed bundle is a
     * website, and every other scheme the app opens (`tel:`, `geo:`, `transit:`) is built here from parts, never
     * taken from data. This is the Kotlin half of apps/web/src/url.ts, which is an allow-list for the same
     * reason — a link is where a string turns into something another program will run.
     */
    fun webLink(url: String): String? {
        val s = url.trim()
        if (!isHttps(s) || s.length > 2000) return null
        if (s.any { it.isWhitespace() || it.code < 0x20 || it.code == 0x7f }) return null
        // "https://" and nothing after it is not a link, and neither is "https:///path".
        val rest = s.removePrefix("https://")
        val host = rest.substringBefore('/').substringBefore('?').substringBefore('#')
        return if (isBareHttpsOrigin("https://$host")) s else null
    }
}
