// Only :query's plugin is declared here. The Android Gradle Plugin and kotlin-android are declared by :app itself
// (app/build.gradle.kts), because naming them here would make Gradle resolve and download them even on a machine
// with no Android SDK, where :app is not in the build at all (see settings.gradle.kts). Versions still come from
// gradle/libs.versions.toml either way, so there is still one place to change them.
plugins {
    alias(libs.plugins.kotlin.jvm) apply false
}
