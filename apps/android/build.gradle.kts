// This file declares no plugins at all, on purpose, and that is what makes both halves of the build work.
//
// Each module requests its own plugin from gradle/libs.versions.toml: :query and :core request kotlin-jvm, :app
// requests the Android Gradle Plugin and kotlin-android. So a machine with no Android SDK, where :app is not in
// the build at all (settings.gradle.kts), never resolves or downloads AGP — which is the point, and is what CI
// relies on. Versions still come from one place, the version catalogue.
//
// Why not the usual `plugins { alias(...) apply false }` here: the first build with :app in it, on 2026-09-20,
// failed two different ways when this file named plugins.
//
//  - Naming only kotlin-jvm put org.jetbrains.kotlin:kotlin-gradle-plugin on the build classpath "with an unknown
//    version" — kotlin-jvm and kotlin-android are two ids from that same artifact — and :app's own
//    `alias(libs.plugins.kotlin.android)` then failed with "compatibility cannot be checked".
//  - Naming kotlin-android here as well got further and then failed inside kotlin-android with a missing
//    `com/android/build/gradle/api/BaseVariant`: a plugin declared in this script cannot see AGP's classes when
//    AGP is declared one level down in :app. Fixing that would mean naming AGP here too, and downloading it on
//    every SDK-less machine.
//
// Declaring nothing here avoids both: each module's request is resolved in its own right, the two that ask for the
// same Kotlin version share one classloader as Gradle normally arranges, and nothing pulls AGP in when :app is out.
