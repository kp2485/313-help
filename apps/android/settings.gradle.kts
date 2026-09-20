pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\\.google\\.testing\\.platform")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("androidx.*")
                includeGroupByRegex("com\\.google\\.testing\\.platform")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "help313"
include(":query")
// The app's android-free half — the signature check, the report rules, the needs list — compiled from :app's own
// source files and tested on a plain JVM. See core/build.gradle.kts.
include(":core")

// ---------------------------------------------------------------------------------------------------------------
// :query is plain Kotlin/JVM and needs nothing but a JDK, so it must build on a machine with no Android SDK.
// :app applies the Android Gradle Plugin, which cannot even configure without one, so it is included only when an
// SDK is actually there. This weakens nothing: :app, its unit tests and the release key gate in app/build.gradle.kts
// are unchanged, and a machine that has an SDK gets exactly the build it had before. A machine that does not gets a
// plain message saying so, and `./gradlew :app:...` then fails with "project ':app' not found", which is the truth.
//
// Found the way the Android tools themselves look: local.properties `sdk.dir`, then ANDROID_HOME, then
// ANDROID_SDK_ROOT, then the default install location.
// ---------------------------------------------------------------------------------------------------------------

fun androidSdkDir(): File? {
    val fromLocalProperties = File(rootDir, "local.properties")
        .takeIf { it.isFile }
        ?.let { java.util.Properties().apply { it.inputStream().use(::load) }.getProperty("sdk.dir") }
    val candidates = listOfNotNull(
        fromLocalProperties,
        System.getenv("ANDROID_HOME"),
        System.getenv("ANDROID_SDK_ROOT"),
        System.getProperty("user.home") + "/Library/Android/sdk",
        System.getProperty("user.home") + "/Android/Sdk",
    )
    // "platforms" is what AGP needs; an empty directory left behind by an uninstall must not count as an SDK.
    return candidates.map(::File).firstOrNull { File(it, "platforms").isDirectory }
}

// HELP313_NO_ANDROID=1 leaves :app out even when an SDK is sitting right there. This is not a convenience: a
// GitHub ubuntu runner ships a licensed Android SDK in ANDROID_HOME, so the android-query job, which is meant to
// be the JDK-only half, silently started configuring :app and went red (2026-09-20). The job now sets this, so
// what CI builds is a decision written down rather than a guess about what happens to be installed on a runner.
// It is also how the no-SDK path is tested on a laptop that has one.
val sdkOff = System.getenv("HELP313_NO_ANDROID") == "1"
val sdk = if (sdkOff) null else androidSdkDir()
if (sdk != null) {
    include(":app")
} else if (sdkOff) {
    println("313 Help: HELP313_NO_ANDROID=1, so :app is left out and only :query and :core are built.")
} else {
    println(
        "313 Help: no Android SDK found, so only :query is in this build. " +
            "The app's screens are not compiled or checked by anything you run here. " +
            "Install the SDK and point at it (apps/android/README.md), then :app comes back on its own."
    )
}
