import java.io.File
// Imported rather than written out: inside a Kotlin DSL build script `java` is the Java plugin's own extension, so
// `java.util.Base64` does not resolve ("Unresolved reference: util" — found on the first build with :app in it,
// 2026-09-20).
import java.util.Base64

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// The repository root, four levels up from apps/android/app.
val repoRoot: File = layout.projectDirectory.dir("../../..").asFile

// ---------------------------------------------------------------------------------------------------------------
// Pinned bundle keys (docs/06, audit A5; the same check as apps/web/src/keys.ts).
//
// The app refuses any list not signed by a key it pins, so a release that pins the wrong keys, or only one, cannot
// be fixed without shipping a new app. A debug build pins the development key, which is only ever a public key read
// out of the bundle that is already on disk. A release build must be given two different real public keys and
// fails here until it is. No private key is ever read, written, or invented by this file.
// ---------------------------------------------------------------------------------------------------------------

/** An Ed25519 public key in SPKI DER form is 44 bytes: this fixed 12-byte header, then the 32-byte key. */
val spkiEd25519 = "302a300506032b6570032100"

fun hexOfBase64(b64: String): String? = try {
    if (!Regex("^[A-Za-z0-9+/]+={0,2}$").matches(b64)) null
    else Base64.getDecoder().decode(b64).joinToString("") { "%02x".format(it) }
} catch (_: Exception) {
    null
}

// ---------------------------------------------------------------------------------------------------------------
// Small-order public keys, refused here as well as at verify time (Android review, 2026-09-20).
//
// A public key of order 1, 2, 4 or 8 makes [h]A the neutral point for every h, so in cofactorless Ed25519 an
// all-zero 64-byte signature verifies *any* message under it. This gate is the moment those keys would be baked
// into a store release and become unfixable without shipping a new app, so it is the moment to refuse them.
//
// The list is not written out twice. A build script cannot call the app's own code — it runs before anything is
// compiled — so it reads the list out of Ed25519.kt as text, between that file's markers, and fails the build if
// it does not find the number of entries that file says it has. One list, one file, and a gate that cannot
// silently end up checking against nothing (which is the failure mode a duplicated constant would have).
// ---------------------------------------------------------------------------------------------------------------

/** The 32-byte encodings of the small-order points, lowercase hex with the sign bit cleared, read from Ed25519.kt. */
val smallOrderKeys: Set<String> = run {
    val source = File(repoRoot, "apps/android/app/src/main/kotlin/org/help313/app/Ed25519.kt")
    val text = if (source.isFile) source.readText() else ""
    val from = text.indexOf("SMALL-ORDER PUBLIC KEYS (begin)")
    val to = text.indexOf("SMALL-ORDER PUBLIC KEYS (end)")
    val expected = Regex("SMALL_ORDER_COUNT\\s*=\\s*(\\d+)").find(text)?.groupValues?.get(1)?.toIntOrNull()
    if (from < 0 || to < from || expected == null) {
        throw GradleException(
            "313 Help: could not read the small-order key list out of ${source.absolutePath}. The release key gate " +
                "refuses public keys of order 1, 2, 4 and 8, and it reads them from that file between its " +
                "\"SMALL-ORDER PUBLIC KEYS\" markers. Do not delete either the markers or SMALL_ORDER_COUNT."
        )
    }
    val found = Regex("\"([0-9a-f]{64})\"").findAll(text.substring(from, to)).map { it.groupValues[1] }.toSet()
    if (found.size != expected) {
        throw GradleException(
            "313 Help: Ed25519.kt says SMALL_ORDER_COUNT = $expected small-order keys but the release gate found " +
                "${found.size} between its markers. A gate that reads the wrong number of keys is a gate that is " +
                "not checking, so this build stops here."
        )
    }
    found
}

/** True for any encoding of a point whose order divides 8. The sign bit carries no information here. */
fun isSmallOrderKey(rawHex: String): Boolean {
    if (rawHex.length != 64) return false
    val top = rawHex.substring(62).toIntOrNull(16) ?: return false
    return smallOrderKeys.contains(rawHex.substring(0, 62) + "%02x".format(top and 0x7f))
}

/** Empty when there are exactly two different Ed25519 public keys (active + spare). Port of releaseKeyProblems. */
fun releaseKeyProblems(keys: List<String>): List<String> {
    val out = mutableListOf<String>()
    if (keys.size != 2) out += "a release pins exactly two keys (active and spare); got ${keys.size}"
    keys.forEachIndexed { i, k ->
        val h = hexOfBase64(k)
        if (h == null || h.length != 88 || !h.startsWith(spkiEd25519)) {
            out += "key ${i + 1} is not a base64 SPKI Ed25519 public key"
        } else if (isSmallOrderKey(h.substring(spkiEd25519.length))) {
            // Under such a key an all-zero signature verifies every message, so this is not a typo to warn about.
            out += "key ${i + 1} is a small-order Ed25519 point, under which any message verifies; it is not a key"
        }
    }
    if (keys.size == 2 && keys[0] == keys[1]) out += "the active and spare keys are the same key"
    return out
}

/** The public key the bundle on disk was signed with. Used for debug builds only, and only when it says "dev". */
fun devKeyFromSnapshot(): String? {
    val sig = File(repoRoot, "data/bundle/v1/index.json.sig")
    val index = File(repoRoot, "data/bundle/v1/index.json")
    if (!sig.isFile || !index.isFile) return null
    if (!Regex("\"signing\"\\s*:\\s*\"dev\"").containsMatchIn(index.readText())) return null
    return Regex("\"public_key\"\\s*:\\s*\"([^\"]+)\"").find(sig.readText())?.groupValues?.get(1)
}

fun releaseKeys(): List<String> =
    (providers.gradleProperty("bundlePublicKeys").orNull
        ?: providers.environmentVariable("BUNDLE_PUBLIC_KEYS").orNull
        ?: "")
        .split(",").map { it.trim() }.filter { it.isNotEmpty() }

fun bundleBase(): String =
    providers.gradleProperty("bundleBase").orNull
        ?: providers.environmentVariable("BUNDLE_BASE").orNull
        ?: "https://REPLACE-ME.invalid/data/bundle/v1/"

/** Everything wrong with this release's pinning, in words. Empty means it may be built. */
val releaseProblems: List<String> = run {
    val keys = releaseKeys()
    val dev = devKeyFromSnapshot()
    releaseKeyProblems(keys) +
        (if (dev != null && keys.contains(dev)) listOf("a release must not pin the development key") else emptyList()) +
        (if (bundleBase().contains("REPLACE-ME.invalid")) listOf("bundleBase is still the placeholder") else emptyList())
}

val releaseRefusal: String
    get() = "313 Help release build refused:\n  - " + releaseProblems.joinToString("\n  - ") +
        "\n\nSet -PbundlePublicKeys=<active>,<spare> (or BUNDLE_PUBLIC_KEYS) to the two base64 SPKI Ed25519 " +
        "public keys the published bundle is signed with, the same values as the web app's BUNDLE_PUBLIC_KEYS, " +
        "and -PbundleBase=https://<domain>/data/bundle/v1/. These are public keys. Never put a private key in " +
        "this repository."

android {
    namespace = "org.help313.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.help313.app"
        // Android 7.0. Old, cheap phones are the point (docs/README.md). Nothing in this app needs more:
        // no java.time, no AndroidX, no Play Services. See README.md for what minSdk 21 would cost.
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // No test runner and no locale filter: the words come from the assets, and more languages (Arabic
        // among them) are coming, so nothing here should have to change to add one.
    }

    buildFeatures {
        buildConfig = true
        // Everything else off: no Compose, no view binding, no data binding, no AIDL, no RenderScript.
        viewBinding = false
        resValues = true
        shaders = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        debug {
            // `-PdebugLikeRelease=true` makes the debug build non-debuggable. That one word changes two things
            // that make every start-up measurement on a debug build meaningless otherwise:
            //
            //  - ART never compiles a debuggable app ahead of time and keeps it in the interpreter, so a method a
            //    cold start runs exactly once is interpreted from beginning to end. Measured on the emulator on
            //    2026-09-20: one Ed25519 signature check cost 4,436 ms debuggable and 332 ms not — thirteen times,
            //    from the same bytecode. `pm compile -m speed -f` does nothing about it; the flag is the cause.
            //  - AGP leaves the ART baseline profile (src/main/baseline-prof.txt) out of a debuggable APK, so the
            //    profile that the release build ships and relies on is not even in the file being measured.
            //
            // Nothing else changes: same code, same keys, same assets, and BuildConfig.DEBUG follows the flag,
            // which is why the timing logs are gated on IS_RELEASE instead. Use it to time a cold start, and plain
            // `assembleDebug` to debug.
            isDebuggable = !(project.findProperty("debugLikeRelease") == "true")
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            val dev = devKeyFromSnapshot()
            if (dev == null) {
                project.logger.warn(
                    "313 Help: no development public key found in data/bundle/v1. " +
                        "Run `pnpm build:bundle` from the repository root first; this debug build will refuse every list."
                )
            }
            buildConfigField("String[]", "PINNED_KEYS", "new String[]{${dev?.let { "\"$it\"" } ?: ""}}")
            buildConfigField("String", "BUNDLE_BASE", "\"${bundleBase()}\"")
            buildConfigField("boolean", "IS_RELEASE", "false")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // The refusal is a task, not a configuration-time throw, so that `./gradlew :query:test` still runs
            // on a machine that has no release keys. checkReleaseKeys below is what actually stops the build.
            val keys = releaseKeys()
            buildConfigField("String[]", "PINNED_KEYS", "new String[]{${keys.joinToString(",") { "\"$it\"" }}}")
            buildConfigField("String", "BUNDLE_BASE", "\"${bundleBase()}\"")
            buildConfigField("boolean", "IS_RELEASE", "true")
        }
    }

    packaging {
        resources {
            excludes += setOf("META-INF/*.kotlin_module", "META-INF/*.version", "DebugProbesKt.bin")
        }
    }

    lint {
        // Lint has never been run here (nothing has been compiled), so it does not fail the build yet. Turn
        // abortOnError on once `./gradlew :app:lint` has been run and its findings dealt with.
        abortOnError = false
        warningsAsErrors = false
        disable += setOf("GoogleAppIndexingWarning")
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/assets/app"))
    sourceSets["main"].res.srcDir(layout.buildDirectory.dir("generated/res/strings"))
    sourceSets["main"].java.srcDir("src/main/kotlin")
    sourceSets["test"].java.srcDir("src/test/kotlin")

    testOptions {
        unitTests.all {
            it.testLogging { showStandardStreams = true }
        }
    }
}

dependencies {
    implementation(project(":query"))
    testImplementation(libs.junit)
}

// ---------------------------------------------------------------------------------------------------------------
// One source of truth for words and data: strings/ and data/bundle/v1 are copied in at build time. Neither is
// duplicated in apps/android, and neither is committed here.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Copies every strings/<lang>.json into the assets (the app reads them at runtime, exactly as the iPhone app
 * does), and generates the handful of values Android itself needs as resources: the launcher label and the
 * accessibility label of the app. Everything else is read from the JSON, so a new key needs no Android change,
 * and a new language is one more entry in LANGS here and in L.LANGUAGES.
 */
val generateStrings by tasks.registering {
    // English is the fallback and must exist; "values" is English, "values-<lang>" is everything else.
    val langs = listOf("en", "es", "ar", "bn")
    val files = langs.associateWith { File(repoRoot, "strings/$it.json") }
    val assetsOut = layout.buildDirectory.dir("generated/assets/app/strings")
    val resOut = layout.buildDirectory.dir("generated/res/strings")
    files.values.forEach { inputs.file(it) }
    outputs.dir(assetsOut)
    outputs.dir(resOut)
    doLast {
        val absent = files.filterValues { !it.isFile }.keys
        if (absent.isNotEmpty()) {
            throw GradleException("strings/${absent.joinToString(".json, strings/")}.json are missing from ${repoRoot.absolutePath}")
        }
        val assets = assetsOut.get().asFile
        assets.mkdirs()
        for ((lang, file) in files) file.copyTo(File(assets, "$lang.json"), overwrite = true)

        // A very small reader: these two keys are all Android's own resource system needs.
        fun value(text: String, key: String): String {
            val m = Regex("\"" + Regex.escape(key) + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(text)
                ?: throw GradleException("strings file has no \"$key\"")
            return m.groupValues[1].replace("\\\"", "\"").replace("\\\\", "\\")
        }
        fun xmlEscape(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("'", "\\'").replace("\"", "\\\"")

        fun write(lang: String) {
            val dir = if (lang == "en") "values" else "values-$lang"
            val text = files.getValue(lang).readText(Charsets.UTF_8)
            val d = File(resOut.get().asFile, dir)
            d.mkdirs()
            File(d, "strings.xml").writeText(
                """<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from strings/$lang.json by :app:generateStrings. Do not edit. -->
<resources>
    <string name="app_name">${xmlEscape(value(text, "app.name"))}</string>
    <string name="app_tagline">${xmlEscape(value(text, "app.tagline"))}</string>
</resources>
""",
                Charsets.UTF_8,
            )
        }
        for (lang in langs) write(lang)
    }
}

/**
 * The snapshot of the signed bundle that ships inside the APK, so the app works on first run with no signal ever
 * (docs/05 "Offline"). Build it first from the repository root: `pnpm build:bundle`. It is never committed here.
 *
 * The **map** travels with it (2026-09-21): the Map tab draws the city from `map/base.json`, `map/streets.json` and
 * the eleven `map/transit/` layers, and a map that needs a network to appear the first time is not the offline map
 * docs/05 promises. The files are checked against the signed index before a byte of them is decoded, exactly as
 * they are when they come off the network (BundleStore.verifiedBytes). What is still left out:
 *
 * The subway style's network files travel with it too (2026-09-21, six of them, 330 KB raw): the style is a person's
 * choice on the layers screen, and a choice that needs a network the first time it is made is not the offline map
 * either. They are lazy all the same: nothing reads one until that style is on and that layer is on.
 *
 * The neighbourhood numbers travel with it too (2026-09-22), now that the Neighborhoods tab exists: one file of
 * about 380 KB, which compresses to a fraction of that in the APK. It is lazy in exactly the same way — nothing
 * reads it until that tab is opened (BundleCheck.loadedNow leaves it out of the start-up load) — and it is checked
 * against the signed index before a byte of it is decoded. A tab that needed a network the first time it was
 * opened would not be the offline app docs/05 promises, and the neighborhood a person is standing in is worked
 * out from the outlines in this very file.
 *
 * Nothing is left out of the snapshot any more. No glob is written out in this comment on purpose: Kotlin nests
 * block comments, so a slash-star inside one opens a second and silently swallows the task below (found
 * 2026-09-21, when the snapshot task vanished from the build and the map had no files to read).
 */
val copyBundleSnapshot by tasks.registering(Copy::class) {
    val src = File(repoRoot, "data/bundle/v1")
    doFirst {
        if (!File(src, "index.json").isFile || !File(src, "index.json.sig").isFile) {
            throw GradleException(
                "No signed bundle at ${src.absolutePath}. Run `pnpm build:bundle` from the repository root first " +
                    "(a store build uses `pnpm build:bundle:release`, so the snapshot carries the release signature)."
            )
        }
    }
    from(src)
    into(layout.buildDirectory.dir("generated/assets/app/bundle-snapshot"))
}

/**
 * The release gate (audit A5). A release build stops here unless it pins two different real public keys and has
 * a real home to fetch from. Nothing is ever invented: if the keys are missing, the build fails and says so.
 */
val checkReleaseKeys by tasks.registering {
    group = "verification"
    description = "Refuses a release build that does not pin two real Ed25519 public keys."
    val problems = releaseProblems
    val message = releaseRefusal
    doLast {
        if (problems.isNotEmpty()) throw GradleException(message)
    }
}

tasks.configureEach {
    if (name == "assembleRelease" || name == "bundleRelease" || name == "installRelease") {
        dependsOn(checkReleaseKeys)
    }
}

tasks.named("preBuild") {
    dependsOn(generateStrings, copyBundleSnapshot)
}
