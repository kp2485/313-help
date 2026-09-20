// Loads the signed bundle, the same files the web and iPhone apps read (docs/06).
// Order: the verified copy on this phone, else the snapshot shipped inside the APK (so it works with no signal,
// ever), then a refresh in the background. A bundle whose signature does not match a pinned key, whose files do
// not match their checksums, or that is older than the one held, is refused and the old one stays.
//
// Nothing is ever sent: these are plain GETs with no headers of ours, no cookies, no query string, no referrer.
// There is no analytics, no crash reporting and no network library; this is java.net.HttpURLConnection, which is
// in Android itself.
package org.help313.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.help313.query.Alert
import org.help313.query.BundleRow
import org.help313.query.Json
import org.help313.query.Segment
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class EmergencyNumber(val id: String, val label: String, val number: String, val sms: String?, val hardcoded: Boolean)

class CityEvent(val id: String, val title: String, val startsAt: String, val endsAt: String?, val location: String?, val url: String)

class ArchivedRow(val id: String, val name: String, val category: String, val at: String, val reason: String)

class LoadedBundle(
    val index: BundleIndex,
    val rows: List<BundleRow>,
    val alerts: List<Alert>,
    val emergency: List<EmergencyNumber>,
    val archived: List<ArchivedRow>,
    val segments: List<Segment>,
    val events: List<CityEvent>,
)

class BundleStore(context: Context) {

    private val app = context.applicationContext
    private val cacheDir = File(app.filesDir, "bundle")
    private val pinned: List<String> = BuildConfig.PINNED_KEYS.filter { it.isNotBlank() }
    private val base: String = BuildConfig.BUNDLE_BASE
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()

    @Volatile
    var bundle: LoadedBundle? = null
        private set

    @Volatile
    var loadFailed = false
        private set

    /** Called on the main thread whenever `bundle` changes. */
    var onChange: (() -> Unit)? = null

    /** Reads what is already on the phone, then refreshes. Never blocks the first screen on the network. */
    fun start() {
        worker.execute {
            val local = runCatching { load { name -> File(cacheDir, name).readBytes() } }.getOrNull()
            val loaded = local ?: runCatching { load { name -> readAsset("bundle-snapshot/$name") } }.getOrNull()
            publish(loaded, failed = loaded == null)
            refresh()
        }
    }

    fun refresh() {
        worker.execute {
            if (base.contains("REPLACE-ME.invalid")) return@execute    // a build with no published home: snapshot only
            try {
                val fetched = LinkedHashMap<String, ByteArray>()
                fun get(name: String): ByteArray = fetched.getOrPut(name) { httpGet(base.trimEnd('/') + "/" + name) }

                val indexBytes = get("index.json")
                val index = BundleCheck.verifiedIndex(indexBytes, get("index.json.sig"), pinned)
                val current = bundle?.index
                if (current != null) {
                    if (current.version == index.version) return@execute
                    if (BundleCheck.refusesOlder(current, index)) throw BundleError.Older
                }
                for (name in index.files.keys) if (BundleCheck.loadedNow(name)) get(name)
                val next = load { name -> fetched[name] ?: throw BundleError.Unreadable("$name was not fetched") }

                // Only once every byte has been checked is anything written to the phone.
                cacheDir.deleteRecursively()
                for ((name, data) in fetched) {
                    val f = File(cacheDir, name)
                    f.parentFile?.mkdirs()
                    f.writeBytes(data)
                }
                publish(next, failed = false)
            } catch (_: Exception) {
                // Keep what we have; say so only when we have nothing at all.
                if (bundle == null) publish(null, failed = true)
            }
        }
    }

    private fun publish(next: LoadedBundle?, failed: Boolean) {
        if (next != null) bundle = next
        loadFailed = failed && bundle == null
        main.post { onChange?.invoke() }
    }

    private fun readAsset(name: String): ByteArray = app.assets.open(name).use { it.readBytes() }

    private fun httpGet(url: String): ByteArray {
        val u = URL(url)
        if (u.protocol != "https") throw BundleError.Unreadable("the list must come over https")
        val conn = u.openConnection() as HttpURLConnection
        // No headers of our own: no user id, no device id, nothing that would tell a server who is asking.
        conn.requestMethod = "GET"
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        try {
            if (conn.responseCode != 200) throw BundleError.Unreadable("server said ${conn.responseCode}")
            val out = ByteArrayOutputStream()
            conn.inputStream.use { input ->
                val buf = ByteArray(16 * 1024)
                var total = 0
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    total += n
                    if (total > 32 * 1024 * 1024) throw BundleError.Unreadable("file too large")
                    out.write(buf, 0, n)
                }
            }
            return out.toByteArray()
        } finally {
            conn.disconnect()
        }
    }

    /** Reads and checks every file the index lists. Throws on the first thing that is not right. */
    private fun load(read: (String) -> ByteArray): LoadedBundle {
        val index = BundleCheck.verifiedIndex(read("index.json"), read("index.json.sig"), pinned)
        val rows = ArrayList<BundleRow>()
        var alerts: List<Alert> = emptyList()
        var emergency: List<EmergencyNumber> = emptyList()
        var archived: List<ArchivedRow> = emptyList()
        var segments: List<Segment> = emptyList()
        var events: List<CityEvent> = emptyList()

        for ((name, meta) in index.files) {
            if (!BundleCheck.loadedNow(name)) continue
            val data = read(name)
            if (BundleCheck.sha256Hex(data) != meta.sha256) throw BundleError.BadChecksum(name)
            val j = Json.parse(String(data, Charsets.UTF_8))
            when {
                name.startsWith("category/") -> j.arr.forEach { rows.add(BundleRow.fromJson(it)) }
                name == "alerts.json" -> alerts = j.arr.map { Alert.fromJson(it) }
                name == "emergency.json" -> emergency = j.arr.map {
                    EmergencyNumber(
                        it["id"]?.str ?: "", it["label"]?.str ?: "", it["number"]?.str ?: "",
                        it["sms"]?.str, it["hardcoded"]?.bool ?: false,
                    )
                }
                name == "archived.json" -> archived = j.arr.map {
                    ArchivedRow(
                        it["id"]?.str ?: "", it["name"]?.str ?: "", it["category"]?.str ?: "",
                        it["archived"]?.get("at")?.str ?: "", it["archived"]?.get("reason")?.str ?: "",
                    )
                }
                name == "places/greenway.json" -> segments = (j["segments"]?.arr ?: emptyList()).map { Segment.fromJson(it) }
                name == "events.json" -> events = (j["events"]?.arr ?: emptyList()).map {
                    CityEvent(
                        it["id"]?.str ?: "", it["title"]?.str ?: "", it["starts_at"]?.str ?: "",
                        it["ends_at"]?.str, it["location"]?.str, it["url"]?.str ?: "",
                    )
                }
            }
        }
        return LoadedBundle(index, rows, alerts, emergency, archived, segments, events)
    }
}
