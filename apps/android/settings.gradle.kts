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

val sdk = androidSdkDir()
if (sdk != null) {
    include(":app")
} else {
    println(
        "313 Help: no Android SDK found, so only :query is in this build. " +
            "The app's screens are not compiled or checked by anything you run here. " +
            "Install the SDK and point at it (apps/android/README.md), then :app comes back on its own."
    )
}
