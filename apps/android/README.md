# 313 Help for Android

Three Gradle modules:

- **`query/`** — the rules for open now, next times, badges, ranking, search and greenway distances. It is a
  Kotlin copy of `packages/query`, held to the same `schema/fixtures` the web app and the iPhone app are held to.
  Plain Kotlin/JVM with **no dependencies at all**, so it runs in a unit test on a laptop and compiles unchanged
  into the app. **Compiled and green.**
- **`core/`** — no sources of its own. It compiles the app's *android-free* files (`Ed25519.kt`, `Verify.kt`,
  `Trace.kt`, `Listing.kt`, `Needs.kt`, `ReportModel.kt`, `SavedRules.kt`) and runs the app's own unit tests against them on
  a plain JVM, so the signature check, the daily report hash and the needs list are checked on every build
  whether or not anyone has an Android SDK. **Compiled and green.**
- **`app/`** — the screens, the signed-bundle loader and the report queue. Platform Android views (no Jetpack
  Compose, no AndroidX), minSdk 24. **Compiled, tested, built and run** for the first time on 2026-09-20.

> **State on 2026-09-20 (second entry).** Kyle, away at work, asked in chat that the Android SDK be installed and
> the SDK licence accepted on his behalf, naming exactly which packages that covered. It was done:
> `brew install --cask android-commandlinetools` (no `sudo`, no password), and **one** licence accepted,
> `android-sdk-license`, by installing `platform-tools`, `platforms;android-35` and `build-tools;35.0.0` — which
> prompt for that licence and no other. `sdkmanager --licenses` offers seven; the other six
> (`android-googletv-license`, `android-googlexr-license`, `android-sdk-arm-dbt-license`,
> `android-sdk-preview-license`, `google-gdk-license`, `mips-android-sysimage-license`) were **not** accepted,
> because nothing here needs them. The SDK is at `/opt/homebrew/share/android-commandlinetools`, named in
> `local.properties`, which is git-ignored.
>
> With that, `:app` compiled for the first time, its unit tests ran, `:app:assembleDebug` produced a
> **1,189,691-byte (1.13 MiB) APK** (clean build; an incremental one can be a little larger), and the app **ran
> on an emulator** (AOSP `android-35` arm64, no Play Services) — Home, the refine screens, a results list, a
> listing detail, Urgent help and Home in Arabic, all screenshotted. Five real errors were found and fixed; they
> are listed under "What the first compile found", and two of them would have broken the app on every phone
> below Android 15. Totals now:
> **8 + 32 + 32 JUnit tests and 111 fixture cases, 0 failures.**

## What Kyle has to do next

1. **Nothing about the SDK licence** — see the note above. What was accepted, and what was deliberately not, is
   written down there and in `docs/DECISIONS.md`. If the SDK is ever reinstalled, the same three packages and the
   same single licence are all this repository needs.
2. **Check the pinned versions.** `gradle/libs.versions.toml` pins AGP 8.7.3, Kotlin 2.0.21 and JUnit 4.13.2, and
   `gradle/wrapper/gradle-wrapper.properties` pins Gradle 8.11.1. All four have now actually been downloaded and
   exercised together, AGP included, and they work. Lint notes that AGP 9.4.1 exists; nothing here needs it, and
   the repository rule is that a new version must be a day old.
3. **Decide about the release blockers** at the bottom of this file. The APK that exists is a debug build; a store
   release still needs two real pinned keys, an icon, a signing config and the Play data-safety form.

## Building and testing

Everything in this section was run on 2026-09-20 and passed, the `:app` lines included. From `apps/android`:

```sh
./gradlew :query:test             # 8 tests: every case in schema/fixtures, plus tz, phone and JSON checks
./gradlew :query:runFixtures      # the same 111 cases with no test framework on the classpath
./gradlew :core:test              # 32 tests: Ed25519 vs RFC 8032, the real bundle's signature, the report
                                  # hash and schema, what cannot be saved, and the needs parity test
./gradlew test                    # all of the above at once
```

`:core:test` checks the real signed bundle when there is one, so build it from the repository root first;
without one those two assertions print "no bundle built ... skipping" and the other 30 tests still run:

```sh
pnpm build:bundle                 # a store build uses pnpm build:bundle:release
```

The `:app` half needs the SDK, and all of these were run on 2026-09-20:

```sh
./gradlew :app:testDebugUnitTest  # the same VerifyTest and ParityTest: 32 tests, 0 failures
./gradlew :app:assembleDebug      # the APK — the app packages a bundle snapshot, so build:bundle first
./gradlew :app:lintDebug          # 0 errors, 7 warnings (listed under "What the first compile found")
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Never time a start-up on a plain `assembleDebug`.** A debuggable APK is not compiled ahead of time by ART and
not given the baseline profile, so it can be ten times slower than the thing that ships. Use:

```sh
./gradlew :app:assembleDebug -PdebugLikeRelease=true   # same code, not debuggable, profile packaged
adb logcat -s Help313Timing                            # the phases of a cold start, debug builds only
```

See "Cold start" below for what those numbers were and what they mean.

Without an SDK, `:app` is not in the build at all: `settings.gradle.kts` prints one plain line saying so, and
`./gradlew :app:anything` fails with "project ':app' not found", which is the truth rather than a confusing
Android Gradle Plugin stack trace. The release gate in `app/build.gradle.kts` — two real pinned keys and a real
`bundleBase`, or no release build — is untouched by this and still fails a release that does not pin them
(checked again on 2026-09-20 with the SDK present: `:app:assembleRelease` stops at `checkReleaseKeys` and names
both missing things).

**`HELP313_NO_ANDROID=1` leaves `:app` out even when an SDK is installed.** This is how the JDK-only build is
tested on a laptop that has an SDK, and it is what CI sets. It matters more than it sounds: a GitHub ubuntu
runner ships a licensed Android SDK in `ANDROID_HOME`, so the `android-query` job was never the JDK-only build it
was written to be — it found that SDK, pulled `:app` in, and went red on 2026-09-20. Both paths are checked:

```sh
./gradlew :query:test :core:test :app:testDebugUnitTest :app:assembleDebug     # with the SDK
env -u ANDROID_HOME -u ANDROID_SDK_ROOT HELP313_NO_ANDROID=1 \
  ./gradlew :query:test :core:test                                            # as CI runs it
```

With no Gradle at all, the query fixtures still run with nothing but a JDK and `kotlinc` (written down in 2026-09
and not re-run since Gradle arrived):

```sh
kotlinc query/src/main/kotlin query/src/test/kotlin -include-runtime -d /tmp/query.jar
java -cp /tmp/query.jar org.help313.query.FixturesKt
```

## What the first compile found

This code was written without a compiler, so the first real compile on 2026-09-20 is the only evidence of how
trustworthy the rest of it is. `:query` (1,233 lines, nine files) compiled **clean on the first attempt** and
every fixture passed first time. The app's android-free files had one real error, and its two test files had two
more:

1. `Needs.kt:22` — a KDoc line reading `strings/*.json`. Kotlin block comments **nest**, so `/*` inside the
   comment opened a second one, and the file's remaining 140 lines were swallowed: "Syntax error: Parameter name
   expected", then "Unclosed comment" at the last line. Reworded.
2. `ParityTest.kt:115` and `ParityTest.kt:325` — the same `strings/*.json` in two KDoc comments, with the same
   effect. Reworded.

Nothing else in `Ed25519.kt`, `Verify.kt`, `Listing.kt`, `Needs.kt`, `ReportModel.kt`, `SavedRules.kt`,
`VerifyTest.kt` or `ParityTest.kt` was wrong, and no test needed changing to pass.

### And what the first `:app` compile and the first run found, later the same day

The prediction above — that 1,351 lines of never-compiled Kotlin in eight files would hold more than one mistake
— was roughly right, but not where it was expected. `Screens.kt`, all 448 lines of it, compiled clean. Every
error was in the plumbing, and the two worst were found by *running* the app, not by compiling it.

**Stopped the build from configuring at all:**

3. `build.gradle.kts` (the root) declared `kotlin-jvm` with `apply false` and left `:app` to declare
   `kotlin-android` itself. `kotlin-jvm` and `kotlin-android` are two plugin ids from the *same* artifact, so the
   root declaration put it on the classpath "with an unknown version" and `:app`'s request failed with
   "compatibility cannot be checked". Naming `kotlin-android` in the root too got further and then failed inside
   it on a missing `com/android/build/gradle/api/BaseVariant`, because a plugin declared in the root script
   cannot see AGP's classes when AGP is declared in `:app`. The root now declares **nothing**, each module
   requests its own, and AGP is still never resolved on a machine with no SDK. The file says all this.
4. `app/build.gradle.kts:25` — `java.util.Base64.getDecoder()`. In a Kotlin DSL build script `java` is the Java
   plugin's own extension, so this read as a property chain: "Unresolved reference: util". Imported instead.
   This is in `releaseKeyProblems`, part of the release key gate, which had therefore never been compiled either;
   it works, and still refuses a release.

**Would have crashed every phone we are aiming at:**

5. `MainActivity.kt:106` — `stack.last()()`, where `stack` is `ArrayList<() -> View>`. At compileSdk 35
   `java.util.List` has `getLast()` (SequencedCollection, new in API 35), which Kotlin reads as a synthetic
   property `stack.last`; the elements being functions, `stack.last()` already means `getLast().invoke()` and is
   a `View`, so the second `()` failed with "Unresolved reference 'invoke'". The compile error is the small half.
   Had it compiled, it would have bound to a method that **does not exist below API 35**, and every phone from
   minSdk 24 up to Android 14 — which is the whole point of this app — would have thrown `NoSuchMethodError` on
   the first screen it drew. It is `stack[stack.size - 1]()` now, and a comment says why. `:app`'s other `.first`
   calls all take a lambda, so they are the ordinary stdlib ones; `./gradlew :app:lintDebug` reports no `NewApi`
   findings at all.

**Found by running it, not by compiling it:**

6. Nothing applied window insets. At `targetSdk` 35 on Android 15 the system draws every app edge to edge and
   ignores `android:statusBarColor`, which is exactly what `themes.xml` was relying on. On first run the title
   was drawn on top of the status-bar clock, the status-bar icons were white on the app's near-white background,
   and the tab bar sat underneath the navigation bar — which took the taps, so the lower half of "Home", "Help",
   "Search" and "Saved places" did nothing at all. `MainActivity.keepClearOfSystemBars` now pads the root clear
   of the system bars and any display cutout and asks for dark bar icons, by the typed API on Android 11 and up
   and the old `systemWindowInset*` getters on 7.0 to 10. No AndroidX was added to do it.
7. The first attempt at that fix crashed on launch: `window.insetsController` is backed by the decor view, which
   does not exist until `setContentView`, so asking for it before threw a `NullPointerException` and the activity
   never started. It is called after `setContentView` now. Worth writing down because it is the one bug in this
   list that only a real run could find — it is not a compile error, not a lint finding, and no unit test here
   starts an activity.

Lint (`:app:lintDebug`, run for the first time) reports **0 errors and 7 warnings**: a redundant launcher label,
a newer AGP being available (three times), two unused resources (`ic_launcher_round`, `app_tagline`) and a
missing monochrome launcher icon. None of them is a bug; the icon ones are already release blocker 3.

## The choices, and why

**The app's android-free half is compiled and tested without the SDK.** `:app` cannot be configured without an
Android SDK, and an SDK cannot be installed without accepting a licence agreement on Kyle's behalf. Rather than
let that leave the whole app unchecked, the parts where a mistake is worst are written with no `android.` import
in them, and `core/build.gradle.kts` names those files one by one and compiles them into a plain JVM module with
`:app`'s own tests. It compiles the same files, not copies: there is one `Ed25519.kt`. It adds nothing to the
APK, because `:app` compiles those sources itself and does not depend on `:core`. If a screen ever pulls
`android.` into one of the named files, `:core` stops compiling, which is the point.

Two files were split on 2026-09-20 to make that line clean, with no change in behaviour:

- `ReportModel.kt` (what a report is, the closed JSON schema, `sha256(secret ‖ target ‖ detroit day)`, the
  minute-granularity timestamp, which HTTP statuses are worth retrying) and `ReportStore.kt` (the install secret
  on disk, the outbox, the POST). The privacy rules are all in the first one, and it is run on every build.
- `SavedRules.kt` (`Saved.canSave` — what may never be saved at all, audit A8) and `SavedStore.kt` (the list on
  the phone).

**Views, not Compose.** The pitch in `docs/README.md` is a cheap, old phone with bad signal. Compose adds
roughly 2–4 MB to a shrunk APK and a measurable amount of work at every start and every frame; the whole of this
app, Kotlin standard library included, is a fraction of that. The screens here are built in code from a handful
of helpers in `UI.kt` rather than inflated from layout XML, which removes one more parse per screen. Nothing in
`query/` depends on this: if the size cost ever becomes acceptable, Compose can be dropped on top of the same
module without touching a line of the rules.

**No AndroidX, and no dependency of any kind in the APK.** Not AppCompat, not RecyclerView, not coroutines, not
Play Services, not Firebase, no analytics, no crash reporting, no HTTP library. The app is `android.app.Activity`,
the platform view classes, `java.net.HttpURLConnection` and the Kotlin standard library. JUnit 4 is the only
declared library and it is test-only; it never reaches a phone. Everything Gradle actually downloaded on
2026-09-20 was Apache-2.0 (Gradle 8.11.1, the Kotlin 2.0.21 plugin and standard library, `org.jetbrains:annotations`)
except two test-only jars: JUnit 4.13.2 under the Eclipse Public Licence 1.0 and its `hamcrest-core` 1.3 under
BSD-3-Clause. EPL-1.0 is not permissive — flagged for Kyle, and already Open in `docs/DECISIONS.md`. It is not
distributed, and `./gradlew :query:runFixtures` runs all 111 fixture cases with no test framework on the
classpath at all (CI runs that too), so dropping JUnit would cost only the `:core` and `:app` unit tests.

**minSdk 24 (Android 7.0, 2016).** Nothing in the app needs more. Going to 21 would reach a few more phones but
would need either core-library desugaring or a rewrite of the odd API; going to 26 would buy `java.time` and the
platform's own Ed25519 (which only actually arrives at 33 anyway). Neither is worth it. `targetSdk` is 35.

**The time zone is written out, not taken from the platform.** `java.time` needs API 26 or a desugaring
dependency, so `query/src/main/kotlin/.../Time.kt` carries the United States daylight-saving rule directly (and
the 1987–2006 rule for older stored dates). This is the riskiest hand-written thing in the module, so
`FixtureTest.zoneAgreesWithTheJvmTimeZoneDatabase` walks 2024–2031 in 37-minute steps and compares every field
against the JVM's own tz database.

**Ed25519 is written out too.** Android's own Ed25519 arrives at API 33; BouncyCastle and Tink each cost
megabytes. `Ed25519.kt` is the verification half of RFC 8032 over `BigInteger` — one signature check per bundle
load, a few tens of milliseconds even on a slow phone. It verifies only; there is no signing code and no private
key anywhere in this repository.

**A small JSON reader instead of a serialization library.** `query/src/main/kotlin/.../Json.kt`, about 150
lines, read-only and strict. It keeps both modules dependency-free and, unlike Android's `org.json`, it works in
a plain JVM unit test, which is where the fixtures run.

**The needs list is checked against the web app's, not trusted.** `apps/web/src/needs.ts` is the source of truth
for "What do you need?" (docs/05) and `Needs.kt` restates it in Kotlin, which is exactly the kind of copy that
rots: this module was written before the emergency-room, urgent-care and Health Department choices existed.
`app/src/test/kotlin/.../ParityTest.kt` reads `needs.ts`, `Needs.kt` and the strings files as text and fails on a
different need, a missing choice, a different category, or a string key the app asks for that `strings/en.json`
does not have (`tab.rec` and `tab.transit` were retired on 2026-09-20). The iPhone app has the same test in Swift.
Both files write a need's own settings above its `refine` list, because the test reads them positionally. The two
refinements that lead only to link-outs (`food.paying`, `job.lost`) are named in the test as deliberate omissions,
so a *new* link-only choice fails it until someone decides. It ran for the first time on 2026-09-20 (as part of
`:core:test`, so it runs without the SDK) and passed: the two lists agree.

**One source of truth for words and data.** `:app:generateStrings` copies `strings/en.json` and
`strings/es.json` into the assets at build time and generates the two values Android's own resource system needs
(the launcher label). `:app:copyBundleSnapshot` copies `data/bundle/v1` into the assets. Neither is committed
here. A new string key needs no Android change at all.

## Privacy, as the app is written

- Permissions: `INTERNET`, and `ACCESS_COARSE_LOCATION` which is strictly optional, asked for only when someone
  taps "Use my location", held in memory for the life of the screen, never written to disk and never sent. No
  advertising id, no `READ_PHONE_STATE`, no `CALL_PHONE` (a call opens the phone's own dialler with the number
  in it), no storage permission.
- `allowBackup="false"` and empty data-extraction rules, so the random install secret behind the daily report
  hash is never copied off the device.
- Triage answers (the need chosen, the refinement, a location) are fields on `MainActivity` and nowhere else.
- Reports carry a listing id, a kind, an optional note, a UTC time at minute granularity, and
  `sha256(install_secret ‖ target_id ‖ detroit_day)`. Nothing else exists to send. The secret is random and is
  reset from the privacy screen.
- Bundle fetches are plain HTTPS GETs with no header of ours, no cookies, no query string and no referrer.
- Domestic violence, mental-health crisis, treatment and sexual-assault listings cannot be saved (audit A8).

## Pinned keys and the release gate

The app refuses any list not signed by a key it pins.

- **Debug** pins the development public key, read out of `data/bundle/v1/index.json.sig` at build time, and only
  when that bundle says `"signing": "dev"`. If there is no bundle, the build warns and the app pins nothing,
  which means it accepts nothing.
- **Release** fails the build unless it is given two different, valid, base64 SPKI Ed25519 public keys, neither
  of which is the development key, and a real `bundleBase`:

  ```sh
  ./gradlew :app:assembleRelease \
    -PbundlePublicKeys=<active>,<spare> \
    -PbundleBase=https://<domain>/data/bundle/v1/
  ```

  These are **public** keys, the same values as the web app's `BUNDLE_PUBLIC_KEYS`. The check is a port of
  `apps/web/src/keys.ts`. No private key is read, written or invented anywhere in `apps/android`.

## Cold start, and where the twenty seconds went

On 2026-09-20 the first run of the app on the emulator waited about twenty seconds before any listing appeared,
and the suspicion was the hand-written `BigInteger` Ed25519 verification. It was measured before anything was
changed, with `Trace.kt` and `adb logcat -s Help313Timing`, and the answer was only partly that.

**Where the time went.** One cold start, API 35 arm64 emulator on an Apple-silicon Mac, plain `assembleDebug`:

| phase | ms |
| --- | --- |
| first screen drawn (`ui.first_render`) | 33 |
| **Ed25519 signature on `index.json`** | **3,949** |
| reading the 20 bundle files from the APK | 12 |
| SHA-256 of all 742 KB of them | 1 |
| parsing that JSON | 935 |
| everything, to the first listing | 5,193 |

So: the signature really was the single biggest item, the checksums cost nothing, and JSON parsing was second.
Verification already ran off the main thread, once, over `index.json` only — every other file is checked by
SHA-256 against that signed index, which is right and was left alone.

But the 3,949 ms was not mostly arithmetic. The same code, in the same emulator, took **4,436 ms the first time
it ran in a process and 94 ms the second time**. A cold start runs each of those methods exactly once, so ART's
JIT never gets a second chance and the whole verification is interpreted — and **ART never compiles a debuggable
app ahead of time at all**. `adb shell pm compile -m speed -f` changes nothing, because the debuggable flag is
the cause. Built non-debuggable, the *unchanged* code fell from 4,436 ms to **332 ms**.

That is the bulk of the twenty seconds: an interpreted signature check and an interpreted JSON reader in a build
that can never be compiled. No release build is debuggable, so most of what was being measured does not ship.

**What was changed.**

1. **The screen never waits for the signature.** Home used to return early with nothing but a loading line while
   the bundle was checked. It now shows **Urgent help** first — 911 and 988 are hardcoded and need no bundle —
   and the loading line under it, and *no listing at all* until the signature has passed. Checked on the
   emulator: while the check is running the screen reads "313 Help / What do you need today? / Urgent help /
   Getting the list…", and the listings appear only afterwards.
2. **A baseline profile** (`app/src/main/baseline-prof.txt`) naming the verification methods and the JSON reader,
   so ART compiles them at install time instead of interpreting them once. No dependency, no plugin, supported
   from Android 7.0, and it cannot change behaviour — a line ART does not understand is ignored. AGP packages it
   into the release APK (and into `-PdebugLikeRelease=true`), never into a debuggable one.
3. **Faster verification, same checks.** `Ed25519.kt` was rewritten: reduction mod p by hand instead of
   `BigInteger.mod` (p is 2^255 − 19, so a fold beats a long division), a dedicated doubling formula instead of
   adding a point to itself with the general one, and Shamir's trick so [s]B − [h]A shares its doublings instead
   of being two scalar multiplications. The coordinates were already projective with no inversion in the point
   arithmetic. Measured warm, best of twelve, in one process on the emulator: **38 ms → 24 ms**; on the JVM,
   5.6 ms → 3.3 ms. About 1.7×, which is what the operation count predicts (roughly 6,800 field multiplications
   down to 3,700) — a real gain, and much smaller than the interpreter effect above.
4. **The platform's Ed25519 is used when there is one** — and there is not one. `Ed25519.verify` now asks every
   installed provider, and on an API 35 image the only Ed25519 services are in `AndroidKeyStore` and
   `AndroidKeyStoreBCWorkaround`, which serve hardware-held keys and will not load a public key from bytes.
   `KeyFactory.getInstance("Ed25519")` returns `AndroidKeyStore` and then throws, which is why the first attempt
   at this silently never ran. So the software path is what runs on every Android, API 33 or not. The platform
   path stays, because it costs one lookup and will light up by itself on a device whose provider does support
   it, and because a "yes" from it is the only thing it is allowed to decide: anything else falls through to the
   software path, so a missing or odd provider can never refuse a good bundle or accept what API 24 would not.
   `VerifyTest` puts the RFC 8032 vectors, four one-bit signature corruptions, an out-of-range scalar, a key that
   is not on the curve and a changed message through **both** paths and asserts they never disagree.

**Before and after, same emulator.** Times to the first listing, and the signature check inside them:

| build | signature | to first listing | first paint |
| --- | --- | --- | --- |
| before, `assembleDebug` | 3.9–5.2 s | 5.2–7.5 s | 33 ms (loading line only) |
| after, `assembleDebug` | 4.3–4.9 s | 6.7–7.6 s | 26–46 ms (**Urgent help**) |
| after, `-PdebugLikeRelease=true` | **0.27–1.06 s** | 2.8–5.8 s | 13–101 ms (**Urgent help**) |

Two honest notes about that table. A debuggable build barely improves, because it is interpreter-bound and the
arithmetic hardly matters there; the row that resembles what ships is the third. And this emulator is noisy — the
same build varied from 268 ms to 1,060 ms across five cold starts, and its GPU takes over a second to draw a
frame — so the cold-start columns are ranges, not measurements, and the clean comparison is the warm, best-of-N
one in point 3.

**What is now the slowest part: JSON.** With the signature down, reading 742 KB of bundle JSON with the
hand-written reader in `packages/query`'s Kotlin twin is the largest item left, 0.8–4.0 s on this emulator. That
is the next thing to look at, and it is not a signature question.

**Verifying once per bundle version was considered and not done.** The idea: after a bundle passes, remember its
index hash in app-private storage, and on later cold starts re-hash the index and skip the signature check when
it has not changed. It was rejected on two grounds.

*It would weaken the check.* The argument for it is that anyone who can write app-private storage can already
replace the app's data — but that is not true of this app as it stands. The copy in `filesDir` is re-verified
against a pinned key every time it is read, so a forged `index.json` written there is refused today; with a
remembered hash, the forger writes the hash too and it is accepted. That is a real defence, and CLAUDE.md's rule
is that a client refuses a mis-signed bundle, not that it refuses one the first time. (The narrower version —
remembering only the snapshot inside the APK, whose bytes are already covered by the APK signature — would
weaken nothing, because forging the memo would only skip a check on bytes that are authenticated anyway.)

*And it is not worth it.* Even that safe narrow version now saves a few hundred milliseconds out of a path that
is dominated by JSON parsing, behind a screen that is usable in 20 ms and already shows 911 and 988. Buying that
with a cache whose safety every future reader has to re-derive is a bad trade. The measurement pointed at the
baseline profile and the JSON reader instead, and neither of those touches the signature at all.

**Still open: a real, cheap phone.** Every number here is from an emulator on an Apple-silicon Mac, which is far
faster than the phones this app is for — a 2016 handset is plausibly five to ten times slower, which would put
one software verification in the region of a second or two rather than a few hundred milliseconds. That is a
guess, not a measurement. It is off the main thread and behind a screen that already works, so the guess being
wrong is survivable, but the number has to come from a real device before a release. `BundleStore` prints
`ed25519.software_path` on every debug start for exactly that: install `-PdebugLikeRelease=true` on the phone and
read logcat. `VerifyTest.oneSoftwareVerificationIsWellUnderASecond` holds the JVM to a 1-second budget so that a
future rewrite of the field arithmetic cannot quietly put this back.

## What has actually been verified

Compiled and run on 2026-09-20, on JDK 17 (Homebrew `openjdk@17` 17.0.20.1) and Gradle 8.11.1 through the
committed wrapper, with the Android SDK added later the same day. **72 JUnit test runs (8 in :query, 32 in
:core, and the same 32 again under :app against the real Android classes) and 111 fixture cases, 0 failures.**
Re-run on 2026-09-20 after the cold-start work, with two tests added: the two verification paths never disagree,
and one software verification stays inside a one-second budget.

`./gradlew :query:test` — 8 tests:

- Every case in `schema/fixtures/*.json`: **111 of 111**, the same files and the same expectations
  `packages/query` and `apps/ios` are held to. Open-now, next occurrences, badges, ranking, search, bundle age,
  greenway distances.
- The Detroit wall-clock rule in `Time.kt` compared field by field against the JVM's own tz database, 2024–2031
  in 37-minute steps: **99,516 instants, no mismatches** — the spring-forward, fall-back and "1:30am twice"
  cases among them.
- Calendar arithmetic round-tripped at 1,103 dates spread over 40,800 days, `tel:` links with and without
  extensions, and the JSON reader on the shapes the bundle uses.

`./gradlew :core:test` — 32 tests, against `:app`'s own source files:

- `Ed25519.verify` against the RFC 8032 section 7.1 vectors (**3 of 3**), against tampered signatures, tampered
  messages and the wrong key (**all refused**), and against malformed input (**false, never a throw**). Every one
  of those goes through the software path explicitly as well as through `verify`, and ten cases — the vectors,
  four one-bit signature corruptions, `s` equal to the group order, a key that is not on the curve and a changed
  message — through the platform path too, asserting the two **never disagree**.
- One software verification of the real signature finishes well inside a second (2 ms on the JVM the tests run
  on; the budget is 1,000 ms, so a slow rewrite of the field arithmetic fails the build).
- The real `data/bundle/v1/index.json.sig` **verifies**, a changed index is **refused**, a build that pins no
  key **accepts nothing**, and every file the index lists matches its sha256 under the app's own hashing.
- The one-day report hash: same phone, same listing, same Detroit day gives one hash; another day, another
  listing or another secret gives hashes nobody can connect; always 64 hex characters.
- A report carries the closed schema and nothing else, with no `detail` field when there is no note, and a time
  at minute granularity.
- Domestic violence, mental-health crisis, treatment and sexual-assault listings **cannot be saved**; 911 and
  988 are the two hardcoded numbers and there are no others.
- Directions: a street address when the place publishes one, the coordinate when it does not, **nothing at all**
  for a sensitive listing, and no Call button without a published number.
- The needs parity test: `Needs.kt` and `apps/web/src/needs.ts` list the same needs in the same order with the
  same choices, categories, modes, `prefer` and `first`; every key the app asks for exists in `strings/en.json`
  and `strings/es.json`; the retired `tab.rec` and `tab.transit` are asked for nowhere.

`./gradlew :app:testDebugUnitTest` — the same 24 tests again, this time compiled against the real Android
classes and run on the SDK's own JVM, so the files `:core` checks are checked a second time in their actual home.

**And, on 2026-09-20, the app ran.** Emulator, AOSP `system-images;android-35;default;arm64-v8a` (no Google Play
Services), API 35, 1080×2340. Debug APK installed with `adb install`. No crash, no exception in logcat after the
insets fix. What was seen with human eyes, in this order:

- **Home** — the "Urgent help" button, the three need groups, "See all", "About this app". The signed bundle
  snapshot was verified on the device and the list appeared. (On a cold start this took about 20 seconds on the
  emulator: `Ed25519.kt` is `BigInteger` arithmetic and an emulated arm64 is slow. Worth measuring on a real
  cheap phone before a release — see blocker 7.)
- **"I need food"**, then **"Food today"** — a ranked results list, each card carrying the badge and the
  freshness line computed on the device ("Call first for hours", "Matched their website when added, Sep 19,
  2026"), and "Use my location" above them with "Your location stays on this phone. We never save or send it."
- **A listing detail** — Cass Community Social Services: the call button showing the number in full, "What you
  get", "Where" with the street address, Directions, Hours, Website, the line saying the place's own words are
  shown as they wrote them, and Save.
- **Urgent help** — 911 first and in red, 988 second, then "Someone is overdosing", then the shelter, mental
  health and helpline numbers from the signed bundle. The order docs/05 asks for.
- **Home in Arabic** (`adb shell cmd locale set-app-locales ... --locales ar`) — every string in Arabic, the
  layout mirrored right to left, and the tab bar reversed so "الرئيسية" is on the right. The app follows the
  phone's language with no setting of its own, and the four strings files ship in the APK
  (`assets/strings/{en,es,ar,bn}.json`).

The APK itself was unpacked and checked: **two permissions only**, `INTERNET` and `ACCESS_COARSE_LOCATION`;
`allowBackup="false"`; `usesCleartextTraffic="false"`; no AndroidX, no Play Services, no Firebase, no HTTP or
JSON library — nothing under `androidx/`, `com/google/` or any third-party package at all.

Still unverified: **a real phone**. Everything above is an emulator on a laptop. There are still no instrumented
tests, nothing has run on hardware, and nothing below Android 15 has run the app at all — which matters, because
the worst bug found today was one that only shows up below Android 15.

## What it does and does not do yet

Written, and now compiled and run (the five screens marked **seen** were looked at on an emulator on
2026-09-20; the rest compile and are covered by unit tests but have not been opened):

- Home with the bundle-age line and published alerts.
- Urgent help, reachable from every screen, with 911 and 988 hardcoded and the rest from the signed bundle.
- The Help needs list in its three groups, the refine screens, and browse-by-type. The needs, their choices and
  their categories are exactly `apps/web/src/needs.ts` (checked by `ParityTest`), including the emergency room
  (which leads with 911 above its list), urgent care and Health Department programmes under "I need a doctor".
- Places that publish a point but no street address — the 26 Wayne County naloxone and test-strip stations
  (`sal_wws_*`, `harm.supplies`). Directions go to the coordinate (`geo:<lat>,<lon>?q=<lat>,<lon>`) instead of
  being hidden, and "Where" says, in the source's own name, that it gives no street address
  (`detail.where_no_address`). **A coordinate is never printed as if it were an address**, a maps app is never
  opened for a domestic-violence or crisis listing, and a listing with no published number shows no Call button.
  The rules are in `Listing.kt` (`mapsDestination`, `hasPhone`, `showsPointWithoutAddress`), and `ParityTest`
  now runs them: they pass. The screen that shows them compiles now, and its detail view was **seen**.
- **Bus directions in the Transit app** on a listing detail, added 2026-09-20 to match the web and iPhone apps.
  Transit's own documented scheme, `transit://directions?to=<destination>`, and **never a `from`**: Transit's
  note says leaving it out uses the person's own location, which Transit asks for itself, so this app passes no
  origin and reads none (docs/research/2026-09-20/transit-app.md). The destination is the publisher's coordinate
  first and the written address only when there is no coordinate — the reverse of the maps link, because Transit
  geocodes address strings loosely by its own documentation. Sensitive rows are gated exactly as Directions is,
  so a domestic-violence or crisis listing gets no bus link; treatment keeps one. The rule is
  `Listing.kt:transitAppDestination` and the six `ParityTest` cases mirror the iPhone app's six. The button is
  **hidden when the phone has no Transit app**: Transit documents no https fallback and no not-installed
  behaviour, so `MainActivity.canOpenTransitApp()` asks the package manager first, which needs the `<queries>`
  entry in the manifest. That question is answered locally and sends nothing; no list of installed apps is read
  or stored. Nothing is fetched from transitapp.com, there is no SDK and no logo — the plain word "Transit" in
  text, from the strings files (`detail.bus_app`, `detail.bus_app_label`), like everything else.
  **Seen on the emulator in its hidden state** (an AOSP image has no Transit app, and `cmd package
  resolve-activity` confirms nothing handles the scheme, so the button is correctly absent while Directions
  stays). The button in its *visible* state has not been seen by anyone: it needs a phone with Transit on it.
- The overdose screen: 911 and the steps, never a list of places (audit A7).
- Results ranked by the shared rule, with an optional "Use my location".
- Listing details: call buttons that show the number (none at all when the place publishes none), the freshness
  badge computed on the device, next times, directions, the source line, and the note that a place's own words
  are shown as they wrote them.
- Search over the bundle, on the device.
- Saved places, and reports with the daily hash and an outbox for when there is no signal.
- English, Spanish, Arabic and Bengali, following the phone's language, right-to-left layout included.
  All four ship in the APK as `assets/strings/<lang>.json`; Arabic was **seen** on the emulator.

Not built:

- The street map, neighbourhood pages, transit *screens* (the Transit app link above is a link-out on a listing,
  not a transit feature), City events, add-a-place, condition reports and photos.
- Link-outs (unemployment, Lifeline, child-care scholarships): the web app shows these on several need screens;
  Android lists places only, as the iPhone app does. The one exception is the 313SafeBeds card above the numbers
  on the shelter screen, whose words come from the strings files (`link.beds.safebeds.*`) like everything else.
  Two web refinements are link-outs and nothing else — "Help paying for food" and "I lost my job" — so they have
  no row here at all; `ParityTest` names them, so a new one cannot slip past unnoticed.
- ZIP-code sorting (the web app's alternative to location).

## Release blockers

1. ~~The `:app` half has never been compiled.~~ Done on 2026-09-20: it compiles, its tests pass, it assembles and
   it runs. See the two sections above for the five errors that first compile and first run found.
2. Two real pinned keys and a real `bundleBase` (the build refuses a release without them). Checked again with
   the SDK present: `:app:assembleRelease` stops at `checkReleaseKeys` and names what is missing.
3. No app icon and no launch artwork: `res/drawable/ic_launcher_*.xml` is a placeholder mark. Lint also asks for
   a monochrome icon, and `ic_launcher_round` is unused.
4. **Nothing has run on a real phone, and nothing has run below Android 15.** The emulator run on 2026-09-20 was
   API 35 only. This is the biggest remaining gap and it is not a formality: the worst bug found that day
   (`stack.last()` binding to an API 35 method) would have crashed every phone from minSdk 24 to Android 14 and
   would not have shown up on the emulator that was used. A device or emulator at API 24 and at API 30 should be
   run before a release. There are still no instrumented tests, no signing config, no upload key, and no Play
   Store listing or data-safety form. The data-safety answers are "no data collected, no data shared"; docs/08
   has the wording.
5. ~~No CI job.~~ Done on 2026-09-20: `.github/workflows/ci.yml` has an `android-query` job (ubuntu-24.04,
   `actions/setup-java@v5` temurin 17, then `./gradlew :query:test :core:test` and `./gradlew :query:runFixtures`
   from `apps/android`). **It builds `:query` and `:core` only, and that is now a decision rather than an
   accident**: the job sets `HELP313_NO_ANDROID=1`. It did not, and an ubuntu runner ships a licensed Android SDK
   in `ANDROID_HOME`, so the job quietly pulled `:app` in and went red the moment `:app` became buildable.
   `:app` is deliberately left out of CI: it needs SDK packages under Google's licence, and a workflow should not
   be accepting a licence on this repository's behalf. The screens are compiled on a laptop that has the SDK.
   One gap, unchanged: the job builds no data bundle, so `:core`'s real-bundle assertion prints "skipping" there.
   It does run locally after `pnpm build:bundle`, and the RFC 8032 vectors cover the signature code in CI.
6. `MainActivity.onBackPressed` is the deprecated form. It still works at `targetSdk` 35 — it was used on the
   emulator and worked — but it should move to `OnBackInvokedCallback` before a store release. It is the only
   warning the Kotlin compiler emits.
7. **Cold start, mostly fixed, but never measured on an old phone.** The twenty-second wait of 2026-09-20 was
   found and dealt with — see "Cold start, and where the twenty seconds went" for the measurements, what changed
   and why the verify-once-per-version cache was rejected. What is *not* done: every number is from an emulator
   on an Apple-silicon Mac, and a 2016 phone is plausibly five to ten times slower. One software Ed25519
   verification has to be timed on a real cheap phone before a release (`-PdebugLikeRelease=true`, then
   `adb logcat -s Help313Timing`). Nothing about the check was weakened, and nothing will be: if the number on a
   real phone is bad, the answer is the JSON reader, which is now the larger half of the wait.
8. The "Bus directions in the Transit app" button has never been seen in its visible state, because that needs a
   phone with the Transit app on it. Its rule is unit-tested and its hidden state was checked; the tap itself has
   not been. DECISIONS keeps the question of Transit's linking terms **Open**.
