// One activity, one back stack, five screens. No fragments, no navigation library, no AndroidX.
//
// Nothing about a person is kept here: the triage answers (the need and refinement chosen, and a location if one
// was asked for) live in these fields and nowhere else, and are dropped when the activity goes away
// (docs/08: triage answers live in memory only and are cleared on exit).
package org.help313.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import org.help313.query.LatLon
import org.help313.query.bundleAge
import org.help313.query.dayString
import org.help313.query.effectiveNow
import org.help313.query.nowWallMinutes
import org.help313.query.parseInstant
import org.help313.query.telLink
import android.app.Activity

class MainActivity : Activity() {

    lateinit var store: BundleStore
        private set

    /** Triage, in memory only. Never written to disk, never sent, gone when this activity is gone. */
    var near: LatLon? = null
    var locationRefused = false

    private val stack = ArrayList<() -> View>()
    private lateinit var content: FrameLayout
    private lateinit var tabs: LinearLayout

    private companion object {
        const val LOCATION_REQUEST = 41
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTheme(R.style.Theme_Help313)
        L.load(this)

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(UI.color(this, R.color.app_bg))

        content = FrameLayout(this)
        content.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
        )
        root.addView(content)

        tabs = buildTabs()
        root.addView(tabs)
        setContentView(root)

        store = BundleStore(this)
        store.onChange = { render() }
        store.start()

        go { Screens.home(this) }
    }

    override fun onResume() {
        super.onResume()
        // Anything a person reported while the phone had no signal goes now. Nothing else is ever sent.
        Thread { ReportStore.flush(this) }.start()
    }

    // ---- navigation ----------------------------------------------------------------------------------------

    /** Replaces the stack: used by the tab bar. */
    fun go(build: () -> View) {
        stack.clear()
        stack.add(build)
        render()
    }

    /** Adds a screen on top. */
    fun push(build: () -> View) {
        stack.add(build)
        render()
    }

    override fun onBackPressed() {
        if (stack.size > 1) {
            stack.removeAt(stack.size - 1)
            render()
        } else {
            super.onBackPressed()
        }
    }

    fun render() {
        if (stack.isEmpty()) return
        content.removeAllViews()
        val v = stack.last()()
        content.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun buildTabs(): LinearLayout {
        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.setBackgroundColor(UI.color(this, R.color.surface))
        bar.contentDescription = L.t("tabs.label")
        val items = listOf(
            "tab.home" to { go { Screens.home(this) } },
            "tab.help" to { go { Screens.help(this) } },
            "search.title" to { go { Screens.search(this) } },
            "saved.title" to { go { Screens.saved(this) } },
        )
        for ((key, action) in items) {
            val b = UI.button(this, L.t(key), backgroundId = 0, textColorId = R.color.brand, topDp = 0) { action() }
            b.setBackgroundColor(UI.color(this, R.color.surface))
            b.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            b.gravity = Gravity.CENTER
            bar.addView(b)
        }
        return bar
    }

    // ---- the things a screen needs -------------------------------------------------------------------------

    /**
     * Now, on this phone, corrected for a broken clock: a cheap phone that has lost its clock would otherwise be
     * told every pantry is closed (schema/query-spec.md "Time").
     */
    fun now(): Long = effectiveNow(System.currentTimeMillis(), store.bundle?.index?.generatedAt)

    /** Today, as a Detroit calendar day. */
    fun today(): String = dayString(Math.floorDiv(nowWallMinutes(now()), 1440))

    /** How old this phone's copy of the list is, in words, or null when it is fresh. */
    fun ageNote(): String? {
        val index = store.bundle?.index ?: return null
        val n = now()
        val age = bundleAge(index.generatedAt, index.retired, n)
        val built = parseInstant(index.generatedAt)
        val days = if (built == null) 0 else ((n - built) / 86_400_000L).toInt()
        return bundleAgeText(age, days, org.help313.query.detroitDay(index.generatedAt))
    }

    fun retired(): Boolean = store.bundle?.index?.retired == true

    /** 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5). */
    fun emergency(id: String): Pair<String, String>? {
        val fromBundle = store.bundle?.emergency?.firstOrNull { it.id == id }
        val number = HARDCODED[id] ?: fromBundle?.number ?: return null
        val label = fromBundle?.label ?: when (id) {
            "emg_911" -> "Emergency"
            "emg_988" -> "Suicide and crisis lifeline"
            else -> id
        }
        return label to number
    }

    fun dial(number: String) {
        // ACTION_DIAL, never ACTION_CALL: the phone's own dialler opens with the number in it and the person
        // presses the green button. The app never places a call by itself and needs no CALL_PHONE permission.
        openIntent(Intent(Intent.ACTION_DIAL, Uri.parse(telLink(number))))
    }

    fun openWeb(url: String) {
        openIntent(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    /**
     * Opens whatever map app the person has, at this place. Nothing is sent by us, and nothing about the person
     * goes into the link.
     *
     * `destination` is the street address when the place publishes one, and otherwise the coordinate itself (see
     * Listing.kt). Android's `geo:` scheme wants the point in the path and what to search for in `q`, which is
     * what apps/web/src/directions.ts hands an Android browser. A place with no coordinate at all — so far only a
     * listing that publishes an address and nothing else — gets `geo:0,0?q=<address>`, the documented form.
     */
    fun directions(lat: Double?, lon: Double?, destination: String) {
        val point = if (lat != null && lon != null) "$lat,$lon" else "0,0"
        openIntent(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$point?q=" + Uri.encode(destination))))
    }

    private fun openIntent(intent: Intent) {
        try {
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, L.t("detail.not_found"), Toast.LENGTH_SHORT).show()
        }
    }

    // ---- location, asked for only when it is tapped --------------------------------------------------------

    /**
     * Coarse location, and only ever in memory: it sorts the list by distance. It is never written down, never
     * sent, and never asked for at launch. Refusing it costs nothing but the sort order (docs/08).
     */
    fun askForLocation() {
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_REQUEST)
            return
        }
        useLastKnownLocation()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == LOCATION_REQUEST) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                useLastKnownLocation()
            } else {
                locationRefused = true
                render()
            }
            return
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    private fun useLastKnownLocation() {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager?
        var best: Location? = null
        try {
            for (provider in listOf(LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
                val l = lm?.getLastKnownLocation(provider) ?: continue
                if (best == null || l.time > best!!.time) best = l
            }
        } catch (_: SecurityException) {
            best = null
        }
        val found = best
        if (found == null) {
            locationRefused = true
        } else {
            near = LatLon(found.latitude, found.longitude)
            locationRefused = false
        }
        render()
    }
}
