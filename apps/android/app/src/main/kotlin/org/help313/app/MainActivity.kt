// One activity, one back stack, five screens. No fragments, no navigation library, no AndroidX.
//
// Nothing about a person is kept here: the triage answers (the need and refinement chosen, and a location if one
// was asked for) live in these fields and nowhere else, and are dropped when the activity goes away
// (docs/08: triage answers live in memory only and are cleared on exit). `onSaveInstanceState` is deliberately not
// overridden — the system writes that Bundle to disk on its own schedule, so it is not "memory only".
//
// **Configuration changes are handled here, not by being recreated** (Android review, 2026-09-20). The manifest
// used to declare only orientation|screenSize|keyboardHidden, so changing the font size, turning on dark mode,
// changing the phone's language or entering multi-window destroyed and rebuilt the activity: the back stack was
// cleared, the person was dropped back on Home, the bundle was verified again from scratch, and another Executor
// was started and never stopped. All of those configurations are declared now and answered in
// `onConfigurationChanged`, which re-reads the words and redraws the screen the person is on. If the activity is
// recreated anyway, `Route.Retained` puts the public part of the stack back (see Route.kt for why only that part).
package org.help313.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
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

    /**
     * A ZIP somebody typed, and whether the field is open (docs/05 "Type a ZIP"; Zip.kt).
     *
     * Both are fields on this activity and nowhere else: not a file, not `savedInstanceState`, not a Route. A ZIP
     * is not sensitive — it is a hundred thousand people — but it is still something a person typed about
     * themselves, and in this app that stays on the phone and dies with the process.
     */
    var nearZip: String? = null
    var zipWanted = false

    /**
     * A junction somebody typed ("Woodward & Warren"), in their own words, for the one line that says where a trip
     * starts. The point it resolved to is [near] like any other; this is only how to say it.
     *
     * The third way to answer "where are you?", beside a fix and a ZIP, and the only one that needs no satellite
     * and no signal at all: it is worked out on this phone from the streets the bundle already carries
     * (Intersections.kt). Memory only, exactly like [nearZip] — never a file, never a link, never a Route.
     */
    var nearCross: String? = null

    /** A point a person named by typing a junction. The list sorts from it exactly as it does from a fix. */
    fun useCross(point: LatLon, words: String) {
        near = point
        nearCross = words
        nearZip = null
        zipWanted = false
        locationRefused = false
        locateOutside = false
        render()
    }

    /** A typed ZIP becomes the point the list is sorted from. The point is the middle of the ZIP, not a person. */
    fun useZip(zip: String, point: LatLon) {
        nearZip = zip
        nearCross = null
        near = point
        zipWanted = false
        locationRefused = false
        locateOutside = false
        if (current() is Route.Map) MapModel.show(point)
        render()
    }

    /** "Stop using this ZIP": back to the whole city, and nothing about it is left anywhere. */
    fun clearZip() {
        nearZip = null
        nearCross = null
        near = null
        zipWanted = false
        render()
    }

    /**
     * The Map tab's first open (docs/05, DECISIONS 2026-09-21). All three are in memory: our own card waiting to
     * be answered, a fix that came from outside the four cities, and "the decision has already been made this
     * launch". The one thing that outlives the launch is the answered flag, in [locateFlags] — a boolean, and
     * nothing else. The position itself is [near] and is never written down.
     */
    var locateCard = false
    var locateOutside = false
    private var locateChecked = false
    val locateFlags: LocateFlagStore by lazy { LocateFlagStore(filesDir) }

    /** What Android already knows, before anybody is asked anything. Coarse only; fine is never requested. */
    fun locatePermission(): LocatePermission = when {
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ->
            LocatePermission.GRANTED
        // Android says nothing about "never asked" directly. A permission that is not granted and whose rationale
        // is not wanted is one the system will no longer put a dialog up for: for us that is the same as refused,
        // because the card's one button would do nothing.
        !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION) && locateFlags.answered ->
            LocatePermission.DENIED
        else -> LocatePermission.PROMPT
    }

    /** True when Android will not put the dialog up again, so the answer is Settings rather than another tap. */
    fun locationPermanentlyDenied(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            locateFlags.answered && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION)

    /**
     * What the Map tab does when it opens. Once per launch. [firstOpenAction] is the whole decision and is the
     * same function on the web and on the iPhone, held to the same table of cases (Locate.kt).
     *
     * Called from the **top** of `MapScreen.tab()`, while that screen is still being built, and it therefore does
     * not draw anything itself: it sets [locateCard] and lets the controls below it read the flag on the way past.
     * Calling [render] from in here instead put the card on a view that the half-finished `tab()` then replaced,
     * so the card never reached the screen (found on the first emulator run, 2026-09-21). Anything that has to
     * happen after the screen exists — the permission dialog — is posted.
     */
    fun mapTabOpened() {
        if (locateChecked) return
        locateChecked = true
        // "A typed ZIP wins over everything" (Locate.kt) means a ZIP, not any point at all: this used to pass
        // `near != null`, which is also true of a fix the person had already given us.
        when (firstOpenAction(locateFlags.answered, locatePermission(), nearZip != null)) {
            FirstOpenAction.SHOW_CARD -> locateCard = true
            FirstOpenAction.CENTRE_ON_PERSON -> content.post { askForLocation() }
            FirstOpenAction.CENTRE_ON_ZIP -> near?.let { MapModel.show(it) }
            FirstOpenAction.NONE -> Unit
        }
    }

    /** "Not now", Back, or the card answered some other way: closed, and never opened again on this phone. */
    fun closeLocateCard() {
        if (!locateCard) return
        locateCard = false
        locateFlags.markAnswered()
        render()
    }

    private val stack = ArrayList<Route>()

    /** The kind of screen drawn last, so that "left Directions" is a thing this activity can know. */
    private var lastDrawn: Route? = null
    private lateinit var content: FrameLayout
    private lateinit var tabs: LinearLayout
    /** Holds the tab row, or the sideways scroller around it at the largest text sizes. See rebuildTabs. */
    private lateinit var tabBar: FrameLayout
    private lateinit var root: LinearLayout

    /**
     * The status bar, the navigation bar and any display cutout, as the system last reported them. Every screen but
     * the Map tab is padded clear of all of it; the map is drawn under the status bar and pads its own floating
     * controls by [barTop] instead (Route.isFullBleedTop).
     */
    private val bars = android.graphics.Rect()

    /** How far down the status bar and any cutout reach, in pixels. Read by the Map tab's controls. */
    val barTop: Int get() = bars.top

    private companion object {
        const val LOCATION_REQUEST = 41
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTheme(R.style.Theme_Help313)
        L.load(this)

        root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(UI.color(this, R.color.app_bg))

        content = FrameLayout(this)
        content.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
        )
        root.addView(content)

        tabBar = FrameLayout(this)
        root.addView(tabBar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        rebuildTabs()
        setContentView(root)
        // After setContentView, never before: window.insetsController is backed by the decor view, which does not
        // exist until the content is set, and asking for it early threw a NullPointerException on first run.
        keepClearOfSystemBars(root)

        // One store per process, not one per activity: a recreation does not re-verify the signature, does not
        // re-read the bundle out of the APK, and does not start a second loader thread (BundleStore.of).
        store = BundleStore.of(this)
        store.onChange = { render() }

        // Back where the person was, if the system rebuilt this activity — and only the public part of the stack.
        val restored = Route.Retained.take()
        stack.clear()
        stack.addAll(restored ?: listOf(Route.Home))
        Trace.time("ui.first_render") { render() }
    }

    override fun onDestroy() {
        super.onDestroy()
        // A dead activity must not be called back into, whether it is finishing or being rebuilt.
        if (store.onChange != null) store.onChange = null
        MapModel.onChange = null
        HoodRepo.onChange = null
        // A trip is never carried over an activity's death, finishing or not: the plan, the steps, the position
        // watch and the view the follow-along was drawing into all go now.
        DirectionsScreen.close(this)
        if (isFinishing) {
            // Really leaving: the route stack, the background thread and the loader all go. Nothing about this
            // session outlives it (docs/08, "cleared on exit").
            Route.Retained.clear()
            Work.shutdown()
            BundleStore.shutdown()
        } else {
            Route.Retained.put(stack)
        }
    }

    /**
     * Font scale, dark mode, language, multi-window, rotation, a keyboard being plugged in: all of these are
     * declared in the manifest and answered here, so the activity is never rebuilt for them and the person stays on
     * the screen they were on.
     *
     * The words and the colours both come from resources that have just changed, so the answer is to load the
     * strings again and rebuild the current screen — which is cheap, because a screen is built in code from a route
     * (Route.kt) and nothing is cached between draws.
     */
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        L.load(this)
        applyBarIcons()
        root.setBackgroundColor(UI.color(this, R.color.app_bg))
        rebuildTabs()
        render()
    }

    /**
     * Pads the whole screen clear of the status bar, the navigation bar and any display cutout, and asks for dark
     * status-bar icons because the app's background is light.
     *
     * This is not decoration. At targetSdk 35 on Android 15 the system draws every app edge to edge and ignores
     * `android:statusBarColor`, which is what the theme was relying on. Run for the first time on 2026-09-20, the
     * app drew its title under the clock and put the tab bar underneath the navigation bar — and the navigation
     * bar took the taps, so the bottom half of "Home", "Help", "Search" and "Saved places" did nothing at all.
     *
     * No AndroidX here, so the insets are read from the platform: the typed API on Android 11 and up, and the old
     * systemWindowInset* getters on 7.0 to 10, which is what minSdk 24 still has to work on.
     */
    private fun keepClearOfSystemBars(root: View) {
        root.setOnApplyWindowInsetsListener { _, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val system = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                bars.set(system.left, system.top, system.right, system.bottom)
            } else {
                @Suppress("DEPRECATION")
                bars.set(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
            }
            applyBarPadding()
            insets
        }
        applyBarIcons()
    }

    /**
     * Dark icons on the system bars in the light theme, light icons in the dark one — **from the theme, both bars**.
     * The background behind them is @color/app_bg: nearly white by day, where the default light icons were all but
     * invisible, and nearly black at night, where the "light bar" flags this used to set unconditionally left dark
     * icons on a dark navigation bar (seen on the emulator, 2026-09-21). Asked again whenever the configuration
     * changes, because the activity handles dark mode itself and is not rebuilt for it.
     */
    private fun applyBarIcons() {
        val night = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        // With three-button navigation the system lays a scrim behind the buttons, in a colour it works out once from
        // the theme the activity STARTED with — so after a switch to dark it stayed pale, under icons that had just
        // turned light. This app pads itself clear of the bar and paints @color/app_bg behind it, so the scrim is
        // not needed: the icons' contrast is against our own background, by day and by night.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val both = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (night) 0 else both, both)
        } else {
            @Suppress("DEPRECATION")
            var flags = window.decorView.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                flags = flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
            }
            if (!night) {
                @Suppress("DEPRECATION")
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    @Suppress("DEPRECATION")
                    flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                }
            }
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = flags
        }
    }

    /**
     * Pads the whole screen clear of the system bars — except on the Map tab, where the map runs under the status
     * bar and the controls carry the inset themselves. Called whenever the insets change and on every draw, because
     * the answer depends on which screen is open.
     */
    private fun applyBarPadding() {
        val top = if (Route.isFullBleedTop(current())) 0 else bars.top
        root.setPadding(bars.left, top, bars.right, bars.bottom)
    }

    override fun onResume() {
        super.onResume()
        // Anything a person reported while the phone had no signal goes now. Nothing else is ever sent.
        // One shared background thread, not a new one per resume: a configuration change used to start another
        // (Android review, 2026-09-20). ReportStore.flush refuses to run twice at once by itself.
        val app = applicationContext
        Work.net { ReportStore.flush(app) }
        // And any place somebody added while the phone had no signal (docs/05 "Offline").
        Work.net { ProposeStore.flush(app) }
    }

    // ---- navigation ----------------------------------------------------------------------------------------

    /** Replaces the stack: used by the tab bar. */
    fun go(route: Route) {
        stack.clear()
        stack.add(route)
        render()
    }

    /** Adds a screen on top. */
    fun push(route: Route) {
        stack.add(route)
        render()
    }

    /** The screen showing now, for the rules that depend on it (FLAG_SECURE, "Leave this page fast"). */
    fun current(): Route = if (stack.isEmpty()) Route.Home else stack[stack.size - 1]

    override fun onBackPressed() {
        // A card open over the map is the innermost thing on screen, so Back closes that first — one Back, one
        // thing, the same rule Escape follows inside the map itself (MapView.onKeyDown).
        if (current() is Route.Map && locateCard) {
            // Back is "Not now", the same answer Escape gives on the web.
            closeLocateCard()
            return
        }
        if (current() is Route.Map && MapModel.selection != null) {
            MapModel.selection = null
            render()
            return
        }
        if (stack.size > 1) {
            stack.removeAt(stack.size - 1)
            render()
        } else {
            super.onBackPressed()
        }
    }

    fun render() {
        if (stack.isEmpty()) stack.add(Route.Home)
        // Indexed on purpose, not `stack.last()`. At compileSdk 35 java.util.List has getLast() (SequencedCollection,
        // new in API 35), which Kotlin reads as a synthetic property; had that bound, it would have called a method
        // that does not exist below API 35, so every phone from minSdk 24 up to Android 14 would have thrown
        // NoSuchMethodError on the first screen (found by the first :app compile, 2026-09-20). Indexing binds to
        // List.get, which has always been there.
        val route = stack[stack.size - 1]
        // Leaving Directions ends the trip: the plan, the chosen way, the current step and the position watch all
        // go. "Leaving" is a screen that WAS Directions and now is not, which is why the last one drawn is
        // remembered rather than the stack being asked — opening Directions draws the screen behind it first.
        if (lastDrawn is Route.Directions && route !is Route.Directions) DirectionsScreen.close(this)
        lastDrawn = route
        // One place decides whether this screen may be photographed, so a screen added later cannot forget. See
        // Route.isPrivate and apps/android/README.md for why this is per-screen rather than for the whole app.
        keepOutOfScreenshots(Route.isPrivate(route))
        applyBarPadding()
        // The map hands its redraws to whatever view is on screen; a view that has been thrown away must not be
        // called back into. The Map tab sets this again as it is built.
        if (route !is Route.Map) MapModel.onChange = null
        // The same rule for the neighborhood numbers: a screen that has been thrown away is never called back into.
        if (route !is Route.Hoods && route !is Route.Hood) HoodRepo.onChange = null
        content.removeAllViews()
        content.addView(
            Screens.view(this, route),
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
    }

    /**
     * FLAG_SECURE on the domestic-violence, crisis, treatment and assault screens: no recents thumbnail, no
     * screenshot, no screen recording, and nothing on an external display. The recents thumbnail is the one that
     * matters most — it is drawn by the system, it survives the app being closed, and it is what somebody else
     * sees when they pick the phone up and press the square button.
     *
     * Set and cleared on every draw, because the flag belongs to the window rather than the view: a screen that set
     * it on the way in and did not clear it on the way out would silently make the whole app unphotographable.
     */
    private fun keepOutOfScreenshots(on: Boolean) {
        if (on) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
    }

    /**
     * "Leave this page fast", on the screens Route.isPrivate names — the same button the web app puts in its top bar
     * on the same screens, going to the same address (Net.QUICK_EXIT_URL).
     *
     * It opens the weather in a browser and then takes this app's task away, so the back button does not come back
     * here and the app is not sitting in recents either. The route stack goes with it.
     */
    fun quickExit() {
        Route.Retained.clear()
        stack.clear()
        openWeb(Net.QUICK_EXIT_URL)
        finishAndRemoveTask()
    }

    /**
     * The tab bar, built from scratch — because whether it scrolls depends on the text size, which is one of the
     * configurations this activity handles itself rather than being recreated for.
     *
     * Six tabs since Neighborhoods arrived. Up to about 1.3x they share the width equally, as four did and then
     * five did. Past that, six words will not fit across a phone however they are laid out, and Android's answer to
     * a word that will not fit is to break it in the middle ("Searc / h") — so above that size each tab takes the
     * room its word needs and the bar scrolls sideways, which leaves every word whole and every tab reachable, by
     * finger and by screen reader. The scrolling bar is used **only** at those sizes: measured unbounded, a row of
     * six Arabic words is wider than the phone even at the ordinary size, and a tab half off the screen for every
     * Arabic reader would be a worse answer than the equal shares they had before (emulator, 2026-09-22).
     */
    private fun rebuildTabs() {
        tabBar.removeAllViews()
        tabBar.setBackgroundColor(UI.color(this, R.color.surface))
        tabs = LinearLayout(this)
        tabs.orientation = LinearLayout.HORIZONTAL
        tabs.setBackgroundColor(UI.color(this, R.color.surface))
        fillTabs(tabs)
        if (!tabsScroll()) {
            tabBar.addView(
                tabs,
                FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
            )
            return
        }
        val scroller = HorizontalScrollView(this)
        scroller.isFillViewport = true
        scroller.isHorizontalScrollBarEnabled = false
        scroller.setBackgroundColor(UI.color(this, R.color.surface))
        scroller.addView(
            tabs,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT),
        )
        tabBar.addView(
            scroller,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
        )
    }

    private fun tabsScroll(): Boolean = resources.configuration.fontScale > 1.3f

    private fun fillTabs(bar: LinearLayout) {
        bar.contentDescription = L.t("tabs.label")
        // Home · Help · Map · Neighborhoods, then the two that were already here (Kyle, 2026-09-21: neighborhood
        // information gets its own tab, "not just on the web, in the apps too").
        //
        // The bar shows `tab.hoods` — "Areas", the short variant the strings files carry — because six words have
        // to share one line at any text size and "Neighborhoods" is the longest word in the app. A screen reader is
        // told the whole word instead (`tab.hoods_wide`), so nothing is abbreviated for the person who cannot see
        // that the bar is narrow.
        val items = listOf(
            Triple("tab.home", null, Route.Home),
            Triple("tab.help", null, Route.Help),
            Triple("tab.map", null, Route.Map),
            Triple("tab.hoods", "tab.hoods_wide", Route.Hoods()),
            Triple("search.title", null, Route.Search),
            Triple("saved.title", null, Route.Saved),
        )
        for ((key, spoken, route) in items) {
            val b = UI.button(
                this, L.t(key), description = spoken?.let { L.t(it) },
                backgroundId = 0, textColorId = R.color.brand, topDp = 0,
            ) { go(route) }
            b.setBackgroundColor(UI.color(this, R.color.surface))
            b.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            b.gravity = Gravity.CENTER
            // Six tabs since Neighborhoods arrived (2026-09-22), five since the Map tab (2026-09-21), four before
            // that. At 17 sp with 16 dp of padding each side, "Saved places" was broken in the middle of a word
            // ("Saved place / s"). The bar is the one place in this app that has a fixed width to share, so it gets
            // its own smaller size and thinner padding; nothing is ellipsized and the words still grow with the
            // phone's text size — a word that will not fit wraps onto a second line and the bar gets taller.
            b.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 11f)
            b.setPaddingRelative(UI.dp(this, 2), UI.dp(this, 10), UI.dp(this, 2), UI.dp(this, 10))
            // In the scrolling bar a tab takes the width its word needs (see rebuildTabs).
            if (tabsScroll()) {
                b.layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                )
                b.setSingleLine(true)
                // Never "Searc…": a tab that does not fit makes the bar wider, it does not lose letters.
                b.ellipsize = null
            }
            bar.addView(b)
        }
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

    /**
     * A website from the signed bundle, or one of our own link cards. **https only** (Net.webLink).
     *
     * ACTION_VIEW hands a string to whatever app claims the scheme in it. The bundle is signed, but signed is not
     * the same as safe to hand over: a `content://` or an app-private scheme reaching ACTION_VIEW is a request made
     * on this app's behalf to an app nobody chose, and the address a person taps should be the kind of thing they
     * expect. So the schemes are an allow-list, as they are in apps/web/src/url.ts, and everything else is not a
     * link. The other three schemes this app opens — tel:, geo:, transit: — are built here from parts and are never
     * taken from data.
     */
    fun openWeb(url: String) {
        val safe = Net.webLink(url)
        if (safe == null) {
            Toast.makeText(this, L.t("detail.not_found"), Toast.LENGTH_SHORT).show()
            return
        }
        openIntent(Intent(Intent.ACTION_VIEW, Uri.parse(safe)))
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

    /**
     * Opens the trip in the Transit app, using Transit's own documented URL scheme,
     * `transit://directions?to=<destination>` (docs/research/2026-09-20/transit-app.md).
     *
     * **Only `to`, never `from`.** Transit's note says leaving a parameter out uses the person's own location,
     * which Transit asks for itself, on their phone. This app passes no origin and reads none: nothing about the
     * person is in the link, and nothing reaches transitapp.com until the person taps. No SDK, no key, no logo,
     * nothing fetched from their servers.
     */
    fun transitApp(destination: String) {
        openIntent(Intent(Intent.ACTION_VIEW, Uri.parse("transit://directions?to=" + Uri.encode(destination))))
    }

    /**
     * Whether anything on this phone can open a `transit://` link. Transit documents no https fallback and no
     * behaviour when the app is missing, so a link offered to a phone without it could only fail: the screen
     * leaves the button out instead. "Directions" needs no other app and is always there.
     *
     * The question is answered locally by the package manager and sends nothing. It needs the `<queries>` entry
     * in AndroidManifest.xml, without which Android 11 and up would always answer no.
     */
    fun canOpenTransitApp(): Boolean =
        Intent(Intent.ACTION_VIEW, Uri.parse("transit://directions?to=0,0"))
            .resolveActivity(packageManager) != null

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
        locateOutside = false
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            // ACCESS_COARSE_LOCATION only, here and nowhere else: fine location is deliberately never requested.
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_REQUEST)
            return
        }
        useLastKnownLocation()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == LOCATION_REQUEST) {
            locateCard = false
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                useLastKnownLocation()
            } else {
                // Refused. The map stays exactly where it was, and nothing asks again on its own: the
                // "Use my location" button is the way to try, and says where the switch is once Android has
                // stopped putting the dialog up (docs/08: never nag).
                locationRefused = true
                render()
            }
            return
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    /**
     * A fix this phone already had, or — when it has none — **one** fix asked for and then stopped.
     *
     * The last-known fix alone was not enough: a phone that has not been asked for its location lately has none
     * at all, and the first thing a person saw after granting the permission was "We couldn't get your location"
     * (found on the first emulator run, 2026-09-21). So when there is nothing to hand we ask for a single
     * update, give up after ten seconds like the web does, and remove the listener either way. The request is
     * coarse: the permission is `ACCESS_COARSE_LOCATION` and nothing else is ever asked for, so whatever a
     * provider hands back has already been coarsened by Android.
     */
    private fun useLastKnownLocation() {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager?
        var best: Location? = null
        try {
            for (provider in listOf(LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER, LocationManager.GPS_PROVIDER)) {
                val l = lm?.getLastKnownLocation(provider) ?: continue
                if (best == null || l.time > best!!.time) best = l
            }
        } catch (_: SecurityException) {
            best = null
        }
        if (best == null && lm != null && askOneFix(lm)) return
        arrived(best)
    }

    /** True when a single update was asked for and [arrived] will be called later — once, whatever happens. */
    private fun askOneFix(lm: LocationManager): Boolean {
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) } ?: return false
        var done = false
        lateinit var listener: android.location.LocationListener
        val giveUp = Runnable {
            if (done) return@Runnable
            done = true
            runCatching { lm.removeUpdates(listener) }
            arrived(null)
        }
        listener = object : android.location.LocationListener {
            override fun onLocationChanged(location: Location) {
                if (done) return
                done = true
                content.removeCallbacks(giveUp)
                runCatching { lm.removeUpdates(this) }
                arrived(location)
            }

            // Required on API 24–28; a provider going away is simply no fix.
            override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        return try {
            lm.requestLocationUpdates(provider, 0L, 0f, listener, mainLooper)
            content.postDelayed(giveUp, 10_000)
            true
        } catch (_: SecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    /** What to do with a fix, or with the absence of one. The one place any of that is decided. */
    private fun arrived(found: Location?) {
        locateCard = false
        if (found == null) {
            locationRefused = true
        } else if (!inServiceArea(found.latitude, found.longitude)) {
            // Outside Detroit, Hamtramck, Highland Park and Dearborn: the map does not move, and the words say
            // why. The point is not kept either — sorting a Detroit list by distance from another state is a
            // worse answer than not sorting it at all.
            near = null
            locationRefused = false
            locateOutside = true
        } else {
            near = LatLon(found.latitude, found.longitude)
            // A fix is not a junction somebody typed: the words that said where they were go with it.
            nearCross = null
            locationRefused = false
            locateOutside = false
            // In memory only, as everywhere else: the map moves there, and nothing is written down or sent.
            // Two miles in every direction, which is the whole of what "near me" means here.
            if (current() is Route.Map) MapModel.show(near!!)
        }
        render()
    }
}
