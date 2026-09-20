# 313 Help for Android

Three Gradle modules:

- **`query/`** — the rules for open now, next times, badges, ranking, search and greenway distances. It is a
  Kotlin copy of `packages/query`, held to the same `schema/fixtures` the web app and the iPhone app are held to.
  Plain Kotlin/JVM with **no dependencies at all**, so it runs in a unit test on a laptop and compiles unchanged
  into the app. **Compiled and green.**
- **`core/`** — no sources of its own. It compiles the app's *android-free* files (`Ed25519.kt`, `Verify.kt`,
  `Listing.kt`, `Needs.kt`, `ReportModel.kt`, `SavedRules.kt`) and runs the app's own unit tests against them on
  a plain JVM, so the signature check, the daily report hash and the needs list are checked on every build
  whether or not anyone has an Android SDK. **Compiled and green.**
- **`app/`** — the screens, the signed-bundle loader and the report queue. Platform Android views (no Jetpack
  Compose, no AndroidX), minSdk 24. **Still never compiled**: it applies the Android Gradle Plugin, which needs
  the Android SDK, which needs a licence agreement that nobody may accept on Kyle's behalf.

> **State on 2026-09-20.** A JDK 17 and Gradle were installed (`brew install openjdk@17 gradle`, no `sudo`, no
> licence click-through), the Gradle wrapper was generated and committed, and `:query` and `:core` now compile and
> pass: **31 JUnit tests and 111 fixture cases, 0 failures.** The compile found and fixed four real errors, listed
> under "What the first compile found". `:app` — every screen, `MainActivity`, `BundleStore`, `UI.kt`, `Screens.kt`
> — has still never been through a compiler. Nothing below changes that.

## What Kyle has to do next

1. **Decide about the Android SDK licence.** Installing the SDK means accepting Google's Android SDK Terms and
   Conditions. That is an agreement in Kyle's name, so it is his to accept, not an agent's. Nothing here needs
   it: `:query` and `:core` build without it, and CI runs them with a JDK alone. It buys the `:app` half — the
   screens compiling, `:app:assembleDebug`, and a phone or emulator to look at.
2. **When he wants that**, from `apps/android`:

   ```sh
   brew install --cask android-commandlinetools
   sdkmanager --licenses            # Kyle reads and accepts these; an agent must not
   sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
   echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # or wherever sdkmanager put it
   ```

   `settings.gradle.kts` then finds the SDK and puts `:app` back in the build on its own. Expect the first
   `:app` compile to find errors the way `:core`'s did — four in six files is the rate so far, and `:app` is
   1,351 lines of never-compiled Kotlin in eight files.
3. **Check the pinned versions.** `gradle/libs.versions.toml` pins AGP 8.7.3, Kotlin 2.0.21 and JUnit 4.13.2, and
   `gradle/wrapper/gradle-wrapper.properties` pins Gradle 8.11.1. Only Gradle, Kotlin and JUnit have actually been
   exercised; AGP 8.7.3 has never been downloaded. The repository rule is that a new version must be a day old.

## Building and testing

Everything in this section, except the `:app` lines, was run on 2026-09-20 and passed. From `apps/android`:

```sh
./gradlew :query:test             # 8 tests: every case in schema/fixtures, plus tz, phone and JSON checks
./gradlew :query:runFixtures      # the same 111 cases with no test framework on the classpath
./gradlew :core:test              # 23 tests: Ed25519 vs RFC 8032, the real bundle's signature, the report
                                  # hash and schema, what cannot be saved, and the needs parity test
./gradlew test                    # all of the above at once
```

`:core:test` checks the real signed bundle when there is one, so build it from the repository root first;
without one that single assertion prints "no bundle built ... skipping" and the other 22 tests still run:

```sh
pnpm build:bundle                 # a store build uses pnpm build:bundle:release
```

The `:app` half needs the SDK, and none of these has ever been run:

```sh
./gradlew :app:testDebugUnitTest  # the same VerifyTest and ParityTest, plus whatever :app adds later
./gradlew :app:assembleDebug      # the APK — the app packages a bundle snapshot, so build:bundle first
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Without an SDK, `:app` is not in the build at all: `settings.gradle.kts` prints one plain line saying so, and
`./gradlew :app:anything` fails with "project ':app' not found", which is the truth rather than a confusing
Android Gradle Plugin stack trace. The release gate in `app/build.gradle.kts` — two real pinned keys and a real
`bundleBase`, or no release build — is untouched by this and still fails a release that does not pin them.

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

That is the whole list. Nothing else in `Ed25519.kt`, `Verify.kt`, `Listing.kt`, `Needs.kt`, `ReportModel.kt`,
`SavedRules.kt`, `VerifyTest.kt` or `ParityTest.kt` was wrong, and no test needed changing to pass — the `.json`
in a comment is the only mistake the compiler found. `:app`'s remaining eight files (1,351 lines) have still
never been read by a compiler, and a `Screens.kt` of 448 lines should be expected to hold more than one.

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

## What has actually been verified

Compiled and run on 2026-09-20, on JDK 17 (Homebrew `openjdk@17` 17.0.20.1) and Gradle 8.11.1 through the
committed wrapper. **31 JUnit tests, 111 fixture cases, 0 failures.**

`./gradlew :query:test` — 8 tests:

- Every case in `schema/fixtures/*.json`: **111 of 111**, the same files and the same expectations
  `packages/query` and `apps/ios` are held to. Open-now, next occurrences, badges, ranking, search, bundle age,
  greenway distances.
- The Detroit wall-clock rule in `Time.kt` compared field by field against the JVM's own tz database, 2024–2031
  in 37-minute steps: **99,516 instants, no mismatches** — the spring-forward, fall-back and "1:30am twice"
  cases among them.
- Calendar arithmetic round-tripped at 1,103 dates spread over 40,800 days, `tel:` links with and without
  extensions, and the JSON reader on the shapes the bundle uses.

`./gradlew :core:test` — 23 tests, against `:app`'s own source files:

- `Ed25519.verify` against the RFC 8032 section 7.1 vectors (**3 of 3**), against tampered signatures, tampered
  messages and the wrong key (**all refused**), and against malformed input (**false, never a throw**).
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

Still unverified: **every screen**. `MainActivity.kt`, `Screens.kt`, `UI.kt`, `BundleStore.kt`, `Strings.kt`,
`Format.kt`, `ReportStore.kt` and `SavedStore.kt` — 1,351 lines — have never been compiled, and nothing has ever
run on a phone or an emulator.

## What it does and does not do yet

Written, never run:

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
  now runs them: they pass. The screen that shows them does not compile yet.
- The overdose screen: 911 and the steps, never a list of places (audit A7).
- Results ranked by the shared rule, with an optional "Use my location".
- Listing details: call buttons that show the number (none at all when the place publishes none), the freshness
  badge computed on the device, next times, directions, the source line, and the note that a place's own words
  are shown as they wrote them.
- Search over the bundle, on the device.
- Saved places, and reports with the daily hash and an outbox for when there is no signal.
- English and Spanish, following the phone's language.

Not built:

- The street map, neighbourhood pages, transit, City events, add-a-place, condition reports and photos.
- Link-outs (unemployment, Lifeline, child-care scholarships): the web app shows these on several need screens;
  Android lists places only, as the iPhone app does. The one exception is the 313SafeBeds card above the numbers
  on the shelter screen, whose words come from the strings files (`link.beds.safebeds.*`) like everything else.
  Two web refinements are link-outs and nothing else — "Help paying for food" and "I lost my job" — so they have
  no row here at all; `ParityTest` names them, so a new one cannot slip past unnoticed.
- ZIP-code sorting (the web app's alternative to location).

## Release blockers

1. **The `:app` half has never been compiled.** It needs the Android SDK, which needs the licence agreement
   accepted by Kyle. Everything below assumes it compiles first, and the first compile should be expected to
   find errors.
2. Two real pinned keys and a real `bundleBase` (the build refuses a release without them).
3. No app icon and no launch artwork: `res/drawable/ic_launcher_*.xml` is a placeholder mark.
4. No instrumented tests, no screenshot of a real screen, no run on a real phone, no signing config, no upload
   key, and no Play Store listing or data-safety form. The data-safety answers are "no data collected, no data
   shared"; docs/08 has the wording.
5. ~~No CI job.~~ Done on 2026-09-20: `.github/workflows/ci.yml` has an `android-query` job (ubuntu-24.04,
   `actions/setup-java@v5` temurin 17, then `./gradlew :query:test :core:test` and `./gradlew :query:runFixtures`
   from `apps/android`). It needs no Android SDK, and it is exactly the commands that were run on a laptop.
   One gap: the job does not build a data bundle, so `:core`'s real-bundle assertion prints "skipping" there.
   It does run locally after `pnpm build:bundle`, and the RFC 8032 vectors cover the signature code in CI.
6. `MainActivity.onBackPressed` is the deprecated form. It still works at `targetSdk` 35 but should move to
   `OnBackInvokedCallback` before a store release.
