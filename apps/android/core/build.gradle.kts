plugins {
    alias(libs.plugins.kotlin.jvm)
}

// ---------------------------------------------------------------------------------------------------------------
// The app's android-free half, compiled and tested on a plain JVM.
//
// `:app` needs the Android SDK, which needs a licence agreement nobody can accept on Kyle's behalf, so on a
// machine without it `:app` is not even in the build (settings.gradle.kts) and its screens are compiled by
// nothing. But a good part of the app is ordinary Kotlin: the signature check, what a report is and its one-day
// hash, the maps/call rules, the needs list. Those are the parts where a mistake is worst, so this module
// compiles *those very files* — not copies of them — and runs the app's own unit tests against them.
//
// It adds nothing to the APK: `:app` compiles the same sources itself and does not depend on this module. If a
// file listed below ever grows an `android.` import, this build fails, which is the point.
// ---------------------------------------------------------------------------------------------------------------

kotlin {
    jvmToolchain(17)
}

val appMain = "../app/src/main/kotlin"
val appTest = "../app/src/test/kotlin"

sourceSets["main"].java.setSrcDirs(listOf(appMain))
sourceSets["test"].java.setSrcDirs(listOf(appTest))

kotlin.sourceSets["main"].kotlin.setSrcDirs(listOf(appMain))
kotlin.sourceSets["test"].kotlin.setSrcDirs(listOf(appTest))

// The android-free files, named one by one so that adding a screen never silently drags android.* in here.
kotlin.sourceSets["main"].kotlin.include(
    "org/help313/app/Trace.kt",          // debug-only timing hook (see Trace.kt)
    "org/help313/app/Ed25519.kt",        // RFC 8032 verification, and the small-order keys it refuses
    "org/help313/app/Verify.kt",         // what makes a bundle acceptable
    "org/help313/app/Net.kt",            // https, the one header, the api root, safe bundle paths, safe links
    "org/help313/app/Http.kt",           // the one place a connection is opened (java.net only)
    "org/help313/app/Outbox.kt",         // the report queue's own rules: caps, corruption, merge after a flush
    "org/help313/app/Route.kt",          // which screens are private, and what survives a recreation
    "org/help313/app/Listing.kt",        // directions, call buttons, points with no address
    "org/help313/app/Needs.kt",          // the needs list, categories, the hardcoded numbers
    "org/help313/app/ReportModel.kt",    // what a report is, the daily hash, and which kinds a listing offers
    "org/help313/app/SavedRules.kt",     // what may not be saved at all
    "org/help313/app/MapData.kt",        // the projection, the bundle's map files, the camera, hit testing
    "org/help313/app/MapLayers.kt",      // what the map may draw and what it must never draw; the layer store
    "org/help313/app/Language.kt",       // which of the four languages this phone gets
    "org/help313/app/MapStyle.kt",       // the subway style: bands, palette as numbers, network files, geometry, badges
    "org/help313/app/MapList.kt",        // "See this map as a list": never told the style, so identical in both
    "org/help313/app/DayWords.kt",       // "Today" / "Tomorrow" / "Friday, Sep 25"
    "org/help313/app/Locate.kt",         // the four cities as a box, the first-open decision, the answered flag
    "org/help313/app/Hoods.kt",          // the neighborhood numbers: the decode, where a point falls, the index order
    "org/help313/app/Zip.kt",            // a typed ZIP: what counts as one, and the point at the middle of it
    "org/help313/app/Propose.kt",        // what a proposal is, its closed body, and the queue's rules
    "org/help313/app/Directions.kt",     // which files the street graph is built from, its one key, its states
)

// Why the four new names above (Android review, 2026-09-20). :core used to cover Ed25519, Verify, ReportModel and
// SavedRules, but the *rules* inside BundleStore and ReportStore were mixed in with the Android that surrounds them
// and so were checked by nothing CI runs: which paths a signed index may name, what header goes out, where a report
// is posted, what happens to the queue when a flush and a tap overlap, and whether a screen may be photographed.
// Those are now Net.kt, Http.kt, Outbox.kt and Route.kt, with no android.* class in any of them, so
// `HELP313_NO_ANDROID=1 ./gradlew :core:test` runs every one of them on a plain JDK.

dependencies {
    api(project(":query"))
    testImplementation(libs.junit)
}

tasks.withType<Test>().configureEach {
    useJUnit()
    // Both tests find the repository by walking up from the module directory, exactly as they do under :app,
    // which sits at the same depth. Stated here so it cannot drift.
    workingDir = layout.projectDirectory.asFile
    testLogging { showStandardStreams = true }
}
