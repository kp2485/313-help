// Loads the signed bundle, the same files the web and iPhone apps read (docs/06).
// Order: the verified copy on this phone, else the snapshot shipped inside the APK (so it works with no signal,
// ever), then a refresh in the background. A bundle whose signature does not match a pinned key, whose files do
// not match their checksums, or that is older than the one held, is refused and the old one stays.
//
// Nothing about the person is ever sent: these are plain https GETs with one header of ours — the fixed
// "313Help-Android/<version>" — no cookies, no cache, no redirects, no query string and no referrer. Everything
// about that is in Http.kt, which is the only place in this app that opens a connection. There is no analytics, no
// crash reporting and no network library; this is java.net.HttpURLConnection, which is in Android itself.
//
// (It used to say "no headers of ours", which was true and was the bug: with no User-Agent set, Android sent its
// own — "Dalvik/2.1.0 (Linux; U; Android 15; <model> Build/<id>)" — so the Android version, the phone model and
// its build id went out on every bundle GET and every report POST. Android review, 2026-09-20.)
//
// **One store per process.** The verified bundle and the one background thread live in the companion object, not
// in an activity: a configuration change used to build a second BundleStore, re-verify the signature and leak
// another Executor every time (Android review, 2026-09-20). The bundle is public, signed data with nothing about
// anyone in it, so holding it for the life of the process costs no privacy; the triage answers, which do, stay
// where they were — fields on MainActivity, gone when it is (docs/08).
package org.help313.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.help313.query.Alert
import org.help313.query.BundleRow
import org.help313.query.Json
import org.help313.query.Segment
import java.io.File
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

class BundleStore private constructor(context: Context) {

    companion object {
        private var instance: BundleStore? = null

        /** Besides `category/`, the files `load` has a use for. Anything else is checksummed and not parsed. */
        private val PARSED_AT_START =
            setOf("alerts.json", "emergency.json", "archived.json", "places/greenway.json", "events.json")

        /**
         * The one store this process has. An activity asks for it in `onCreate` and gets the same object across a
         * configuration change, a recreation or a second launch — so a font-scale change or a rotation does not
         * re-verify a signature, re-read 742 KB from the APK, or start another thread that nobody stops.
         */
        @Synchronized
        fun of(context: Context): BundleStore {
            val existing = instance
            if (existing != null) return existing
            val made = BundleStore(context)
            instance = made
            made.start()
            return made
        }

        /**
         * Called when the last activity is really finishing (not being recreated), so a debug build that is force
         * stopped does not leave a thread behind. The next launch builds a new store and re-verifies, which is the
         * point: nothing about a verified bundle is remembered across a process (apps/android/README.md, "Verifying
         * once per bundle version was considered and not done").
         */
        @Synchronized
        fun shutdown() {
            instance?.let {
                it.onChange = null
                it.worker.shutdownNow()
            }
            instance = null
        }
    }

    /**
     * The Application, not an Activity and not a plain Context. Typed as Application on purpose: this object is
     * held for the life of the process, so holding an activity here would be a leak — and stating the type is how
     * both a reader and `lint`'s StaticFieldLeak check can see that it is not one. The Application *is* the
     * process, so there is nothing here to outlive.
     */
    private val app: android.app.Application = context.applicationContext as android.app.Application
    private val cacheDir = File(app.filesDir, "bundle")
    private val pinned: List<String> = BuildConfig.PINNED_KEYS.filter { it.isNotBlank() }
    private val base: String = BuildConfig.BUNDLE_BASE
    private val userAgent: String = Net.userAgent(BuildConfig.VERSION_NAME)
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()

    @Volatile
    var bundle: LoadedBundle? = null
        private set

    @Volatile
    var loadFailed = false
        private set

    /** Called on the main thread whenever `bundle` changes. Set by whichever activity is on screen; cleared by it. */
    var onChange: (() -> Unit)? = null

    /**
     * Anything at all that runs on the one background thread, wrapped so that nothing it throws can kill that
     * thread. `Throwable`, not `Exception`: a StackOverflowError from a hostile `index.json.sig` used to end the
     * executor's only thread, after which the app never loaded a list again and repeated the whole thing at every
     * start (Android review, 2026-09-20). A failure here can only ever mean "keep the copy we have".
     */
    private fun onWorker(what: String, body: () -> Unit) {
        try {
            worker.execute {
                try {
                    body()
                } catch (t: Throwable) {
                    if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "$what failed: $t")
                    if (bundle == null) publish(null, failed = true)
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // The store was shut down between the tap and here. There is nothing to do and nothing to say.
        }
    }

    /** Reads what is already on the phone, then refreshes. Never blocks the first screen on the network. */
    private fun start() {
        if (!BuildConfig.IS_RELEASE) {
            val launched = System.nanoTime()
            Trace.sink = { label, ms ->
                android.util.Log.i("Help313Timing", "$label ${ms} ms (at +${(System.nanoTime() - launched) / 1_000_000L} ms)")
            }
        }
        onWorker("start") {
            Trace.time("start.total") {
                val local = runCatching { Trace.time("start.cached") { load { name -> File(cacheDir, name).readBytes() } } }.getOrNull()
                val loaded = local
                    ?: runCatching { Trace.time("start.snapshot") { load { name -> readAsset("bundle-snapshot/$name") } } }.getOrNull()
                publish(loaded, failed = loaded == null)
            }
            // Saved places are read from disk on the main thread otherwise; prime the cache here instead.
            SavedStore.prime(app)
            if (!BuildConfig.IS_RELEASE) timeVerification()
            refresh()
        }
    }

    /**
     * Debug builds only, and only after the screen already has its list, so it delays nothing: how long one
     * signature check takes on *this* device.
     *
     * This is the tool for the question that is still open — "is it fast enough on a 2016 handset?". Plug the
     * phone in, install a debug build (`-PdebugLikeRelease=true`, or the numbers are meaningless: see
     * app/build.gradle.kts), and read `Help313Timing ed25519.software_path` out of logcat.
     *
     * It still prints whichever Ed25519 services the device has, because that is a fact worth knowing and how the
     * surprise of 2026-09-20 was found: an API 35 image has Ed25519 only in AndroidKeyStore and
     * AndroidKeyStoreBCWorkaround, both of which serve hardware-held keys and neither of which will load a public
     * key from bytes. There being no usable provider on any Android is why there is now one implementation and no
     * platform path at all (see Ed25519.kt).
     */
    private fun timeVerification() {
        try {
            val index = readAsset("bundle-snapshot/index.json")
            val sigJson = Json.parse(String(readAsset("bundle-snapshot/index.json.sig"), Charsets.UTF_8))
            val signature = BundleCheck.base64(sigJson["signature"]?.str ?: "") ?: return
            val key = pinned.firstNotNullOfOrNull { pin ->
                BundleCheck.base64(pin)?.let { Ed25519.rawKeyFromSpkiDer(it) }
            } ?: return
            for (p in java.security.Security.getProviders()) {
                val ed = p.services.filter { it.algorithm.contains("25519", true) }.map { "${it.type}/${it.algorithm}" }
                if (ed.isNotEmpty()) android.util.Log.i("Help313Timing", "provider ${p.name} has $ed (not used)")
            }
            Trace.time("ed25519.software_path") { Ed25519.verify(key, signature, index) }
        } catch (_: Throwable) {
            // A measurement is never allowed to matter.
        }
    }

    fun refresh() {
        onWorker("refresh") {
            if (base.contains("REPLACE-ME.invalid")) return@onWorker   // a build with no published home: snapshot only
            if (!Net.isHttps(base)) return@onWorker                    // and a build pointed anywhere else fetches nothing
            val fetched = LinkedHashMap<String, ByteArray>()
            fun get(name: String): ByteArray = fetched.getOrPut(name) { httpGet(base.trimEnd('/') + "/" + name) }

            val indexBytes = get("index.json")
            // verifiedIndex refuses an index naming a path this app will not use, so every name below is already
            // known to be a plain relative path. The check is repeated where the File and the URL are actually
            // built, because that is the line a future edit would add a name to.
            val index = BundleCheck.verifiedIndex(indexBytes, get("index.json.sig"), pinned)
            val current = bundle?.index
            if (current != null) {
                if (current.version == index.version) return@onWorker
                if (BundleCheck.refusesOlder(current, index)) throw BundleError.Older
            }
            for (name in index.files.keys) if (BundleCheck.loadedNow(name)) get(name)
            val next = load { name -> fetched[name] ?: throw BundleError.Unreadable("$name was not fetched") }

            // Only once every byte has been checked is anything written to the phone.
            cacheDir.deleteRecursively()
            for ((name, data) in fetched) {
                if (!Net.safeBundlePath(name)) throw BundleError.Unreadable("refusing to write $name")
                val f = File(cacheDir, name)
                f.parentFile?.mkdirs()
                f.writeBytes(data)
            }
            publish(next, failed = false)
        }
    }

    private fun publish(next: LoadedBundle?, failed: Boolean) {
        if (next != null) bundle = next
        loadFailed = failed && bundle == null
        main.post { onChange?.invoke() }
    }

    private fun readAsset(name: String): ByteArray = app.assets.open(name).use { it.readBytes() }

    /**
     * One file of the signed bundle that is **not** read at start (`BundleCheck.loadedNow` is false for it): the map
     * of the city, the transport layers, the park list. Its bytes, checked against the sha256 in the **signed**
     * index before a byte of them is decoded, wherever they came from:
     *
     *  1. the verified copy in this app's own storage,
     *  2. the snapshot shipped inside the APK, so the map works on first run with no signal ever,
     *  3. the published origin, if this build has one.
     *
     * A file that does not match its checksum is not used — it is never "close enough". Throws on anything that is
     * not right, and the caller treats that as "this layer could not be read", never as "this layer is empty".
     *
     * **Never called on the main thread.** MapRepo runs it on the shared io thread; a third of a megabyte of JSON
     * and a SHA-256 over it is a dropped frame on a cheap phone.
     */
    fun verifiedBytes(name: String): ByteArray {
        if (!Net.safeBundlePath(name)) throw BundleError.Unreadable("refusing to read $name")
        val want = bundle?.index?.files?.get(name)?.sha256
            ?: throw BundleError.Unreadable("$name is not in the signed index")

        val cached = File(cacheDir, name)
        if (cached.isFile) {
            val data = runCatching { cached.readBytes() }.getOrNull()
            if (data != null && BundleCheck.sha256Hex(data) == want) return data
        }
        val snapshot = runCatching { readAsset("bundle-snapshot/$name") }.getOrNull()
        if (snapshot != null && BundleCheck.sha256Hex(snapshot) == want) return snapshot

        if (base.contains("REPLACE-ME.invalid") || !Net.isHttps(base)) {
            throw BundleError.Unreadable("$name is not on this phone and this build has nowhere to fetch it from")
        }
        val fetched = httpGet(base.trimEnd('/') + "/" + name)
        if (BundleCheck.sha256Hex(fetched) != want) throw BundleError.BadChecksum(name)
        // Kept beside the rest of the verified copy, so the next open needs no signal. Written to a temporary name
        // and renamed, so a phone that loses power mid-write comes back with no file rather than half of one; a
        // refresh that clears the cache at the same moment costs at worst one re-read, never a bad file.
        runCatching {
            cached.parentFile?.mkdirs()
            val temp = File(cached.parentFile, cached.name + ".new")
            temp.writeBytes(fetched)
            if (!temp.renameTo(cached)) {
                cached.delete()
                temp.renameTo(cached)
            }
        }
        return fetched
    }

    /**
     * One https GET. Everything about the request — the one honest header, no cookies, no cache, no redirects, the
     * timeouts and the size ceiling — is Http.kt, so the bundle GET and the report POST cannot drift apart.
     */
    private fun httpGet(url: String): ByteArray {
        val conn = Http.open(url, userAgent)
        conn.requestMethod = "GET"
        try {
            if (conn.responseCode != 200) throw BundleError.Unreadable("server said ${conn.responseCode}")
            return Http.readBody(conn)
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

        var readMs = 0L
        var shaMs = 0L
        var parseMs = 0L
        var parseCpuMs = 0L
        for ((name, meta) in index.files) {
            if (!BundleCheck.loadedNow(name)) continue
            // Belt and braces: verifiedIndex has already refused an index that names anything but a plain relative
            // path, and this is where the name becomes a File or a URL.
            if (!Net.safeBundlePath(name)) throw BundleError.Unreadable("refusing to read $name")
            var t = System.nanoTime()
            val data = read(name)
            readMs += (System.nanoTime() - t) / 1_000_000L
            t = System.nanoTime()
            if (BundleCheck.sha256Hex(data) != meta.sha256) throw BundleError.BadChecksum(name)
            shaMs += (System.nanoTime() - t) / 1_000_000L
            // Checked, like every file, and then left alone: no screen in this app reads the parks, the transit
            // stops or the ZIP codes yet, and parsing them cost a tenth of the whole load to throw the result away.
            // Whoever adds a reader adds a branch below, and this line sends the file to it.
            if (!name.startsWith("category/") && name !in PARSED_AT_START) continue
            t = System.nanoTime()
            val cpu = android.os.SystemClock.currentThreadTimeMillis()
            val j = Json.parse(data)
            parseMs += (System.nanoTime() - t) / 1_000_000L
            parseCpuMs += android.os.SystemClock.currentThreadTimeMillis() - cpu
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
        Trace.say("load.read_files", readMs)
        Trace.say("load.sha256_files", shaMs)
        Trace.say("load.json_parse", parseMs)
        Trace.say("load.json_parse_cpu", parseCpuMs)
        return LoadedBundle(index, rows, alerts, emergency, archived, segments, events)
    }
}
