import java.io.File

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
    else java.util.Base64.getDecoder().decode(b64).joinToString("") { "%02x".format(it) }
} catch (_: Exception) {
    null
}

/** Empty when there are exactly two different Ed25519 public keys (active + spare). Port of releaseKeyProblems. */
fun releaseKeyProblems(keys: List<String>): List<String> {
    val out = mutableListOf<String>()
    if (keys.size != 2) out += "a release pins exactly two keys (active and spare); got ${keys.size}"
    keys.forEachIndexed { i, k ->
        val h = hexOfBase64(k)
        if (h == null || h.length != 88 || !h.startsWith(spkiEd25519)) {
            out += "key ${i + 1} is not a base64 SPKI Ed25519 public key"
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
 * Map tiles and neighbourhood numbers are left out: they are large and are not needed to find help.
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
    from(src) {
        exclude("map/**", "indicators/**")
    }
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
