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
    "org/help313/app/Ed25519.kt",        // RFC 8032 verification
    "org/help313/app/Verify.kt",         // what makes a bundle acceptable
    "org/help313/app/Listing.kt",        // directions, call buttons, points with no address
    "org/help313/app/Needs.kt",          // the needs list, categories, the hardcoded numbers
    "org/help313/app/ReportModel.kt",    // what a report is, and the daily hash
    "org/help313/app/SavedRules.kt",     // what may not be saved at all
)

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
