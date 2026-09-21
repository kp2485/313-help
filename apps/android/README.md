# 313 Help for Android

Three Gradle modules:

- **`query/`** — the rules for open now, next times, badges, ranking, search and greenway distances. It is a
  Kotlin copy of `packages/query`, held to the same `schema/fixtures` the web app and the iPhone app are held to.
  Plain Kotlin/JVM with **no dependencies at all**, so it runs in a unit test on a laptop and compiles unchanged
  into the app. **Compiled and green.**
- **`core/`** — no sources of its own. It compiles the app's *android-free* files (`Ed25519.kt`, `Verify.kt`,
  `Net.kt`, `Http.kt`, `Outbox.kt`, `Route.kt`, `Trace.kt`, `Listing.kt`, `Needs.kt`, `ReportModel.kt`,
  `SavedRules.kt`, and since 2026-09-21 `MapData.kt`, `MapLayers.kt` and `Language.kt`) and runs the app's own unit
  tests against them on a plain JVM, so the signature check, the daily report hash, the needs list, the network
  policy, the report queue's rules, which screens are private, **the map's whole arithmetic and the one rule that
  says a listing is never a dot** are checked on every build whether or not anyone has an Android SDK.
  **Compiled and green.**
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
> below Android 15.
>
> **State on 2026-09-21 (second entry).** The optional **"subway" map style** of `docs/MAP-STYLE.md` is built, as
> the third client after the web and the iPhone: one line per route in the tone the pipeline gave it, badges,
> stations, interchange and hub pills, terminals, trunks with stacked badges, the QLINE's ties, the People Mover's
> loop with chevrons, a route card, a key, and the same reading order appended to. **`standard` is still the default
> and draws exactly as it did**; the choice is two radio buttons on the layers screen. See **"The Map tab"** below,
> which now covers both styles. Also fixed: the status pill reads "Friday, Sep 25" like the web and the iPhone (no
> short weekday, no year), and the system bars take their icon colour from the theme, so the navigation bar is
> readable in dark mode. Totals now: **16 + 174 + 174 JUnit tests and 190 fixture cases, 0 failures** (the shared
> fixtures grew from 181 to 190 on 2026-09-21; the older entries below keep the number that was true when they were
> written). The debug APK is **1,927,566 bytes (1.84 MiB)** on a clean build, up from 1.60 MiB: the six network
> files of the subway style, 330 KB raw, now travel in the snapshot so the style works with no signal.
>
> **State on 2026-09-21.** The **Map tab** was built: the city drawn on this phone from the signed bundle, with
> the greenway, our own listings by group, the eleven transport layers, a layer switcher, a text list, a card on
> tap, virtual accessibility nodes, and a hardware-keyboard walk. See **"The Map tab"** below. Totals now:
> **16 + 111 + 111 JUnit tests and 181 fixture cases, 0 failures**, of which 47 are the map's and the language
> choice's. The debug APK is
> **1,675,641 bytes (1.60 MiB)** on a clean build, up from 1.22 MiB, almost all of it the map files now shipped
> inside the APK so the map works on first run with no signal.
>
> **State on 2026-09-20 (third entry).** Two adversarial reviews went through this app and found sixteen defects,
> three of them serious enough to have shipped as bugs: a crash loop reachable before any signature was checked, a
> class of public key under which any bundle would verify, and a provider lookup that could skip the only
> verification code in this repository. All sixteen are dealt with below in
> **"What two adversarial reviews found"** — fourteen fixed, two narrowed and written down rather than fixed. The
> app was rebuilt, re-run on the emulator in English and Arabic, and put through a font-scale change mid-flow, a
> domestic-violence screen, a quick exit, and a key reset during a stalled outbox flush. Totals now:
> **11 + 61 + 61 JUnit tests and 181 fixture cases, 0 failures.**

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
./gradlew :query:test             # 16 tests: every case in schema/fixtures, plus tz (and the pre-1987 clamp),
                                  # phone, and the JSON reader including its depth and length caps
./gradlew :query:runFixtures      # the same 190 cases with no test framework on the classpath
./gradlew :core:test              # 174 tests: Ed25519 vs RFC 8032, small-order keys, the real bundle's signature,
                                  # the network and path rules, the report queue, which screens are private, the report
                                  # hash and schema, what cannot be saved, the needs parity test, the map's arithmetic,
                                  # and the two map styles (MapStyleTest: 63 tests)
./gradlew test                    # all of the above at once
```

`:core:test` checks the real signed bundle when there is one, so build it from the repository root first;
without one those three assertions print "no bundle built ... skipping" and the other 58 tests still run:

```sh
pnpm build:bundle                 # a store build uses pnpm build:bundle:release
```

The `:app` half needs the SDK, and all of these were run on 2026-09-20:

```sh
./gradlew :app:testDebugUnitTest  # the same VerifyTest, ParityTest and GuardsTest: 61 tests, 0 failures
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
both missing things — and, since the same day, refuses a small-order Ed25519 point offered as a key, in either of
its encodings, while letting two ordinary keys through).

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

## The Map tab

Built 2026-09-21, as the Android mirror of the iPhone Map tab (`apps/ios/Sources/HelpCore/MapData.swift`,
`MapLayers.swift`, `apps/ios/HelpApp/Map*.swift`) and of the web original (`apps/web/src/map.ts`). One map of
the city, edge to edge under the status bar, drawn on this phone from the signed bundle: **no tile server, no map
company, nothing sent, and it works with no signal at all** (DECISIONS 2026-09-18 and 2026-09-20).

### Where the pieces are

| file | what it is |
|---|---|
| `MapData.kt` (`:core`) | The projection, the delta decoder for `map/base.json`, `map/streets.json` and the eleven `map/transit/*.json` layers, the camera with its clamps, the flick, and hit testing. No `android.*` class. |
| `Locate.kt` (`:core`) | The Map tab's first open (2026-09-21): the four cities as a box, the two-mile radius, `firstOpenAction` (the same five lines as the web and the iPhone), and `LocateFlagStore` — one boolean, written atomically, and the only thing any of this keeps. Our own card comes first and **only** its "Use my location" button asks Android, for `ACCESS_COARSE_LOCATION` alone; Back is "Not now"; a fix outside the four cities moves nothing and says so. No `android.*` class. **The fix itself** comes from `MainActivity`: a last-known one from the network, passive or GPS provider, and — when the phone has none, which is what a fresh install looks like — **one** requested update, given up on after ten seconds and always unregistered. |
| `MapLayers.kt` (`:core`) | What may be drawn and what never may: the seven help groups, `mapDrawable`, the per-layer styles by **token name**, the zoom rules, the greenway phase dashes, the reading order, and the layer store. |
| `Language.kt` (`:core`) | `pickLanguage`: the first of the phone's own languages this app carries words for. |
| `MapStyle.kt` (`:core`) | The `subway` style, everything that is not pixels: zoom bands with hysteresis, the `--tr-*` palette and the quiet basemap **as numbers**, `resolveTransitStyle`, the network-file decoders, per-run simplification, offsets, corner rounding, badge anchors, the round-robin badge claim with the trunk-badge nudge, 48 dp hit testing, the reading-order caps, `netFilesWanted`. A port of `apps/ios/Sources/HelpCore/MapStyle.swift`. |
| `MapList.kt` (`:core`) | The transport part of "See this map as a list". It is never told the style, which is why the list is identical in both. |
| `DayWords.kt` (`:core`) | "Today" / "Tomorrow" / "Friday, Sep 25". |
| `MapSubway.kt` | The `subway` painter: cached geometry per route per band × scale bucket, the glyph plan, the tap board, and the key's drawn samples. A port of `apps/ios/HelpApp/MapSubway.swift`. |
| `MapPalette.kt` | The only place a token name becomes a colour. `res/values/colors.xml` and `values-night/` hold the values, so dark mode is Android's own. |
| `MapView.kt` | One `android.view.View` on an `android.graphics.Canvas`: the painter, the gestures, the keyboard, and the virtual accessibility nodes. |
| `MapModel.kt` | One model per process: the camera, what has been decoded, what is switched on, what is selected. |
| `MapScreen.kt` | The tab, the floating controls, the card a tap opens, the layer switcher, the text list, and one stretch of the greenway. |

`Route.Map`, `Route.MapLayers`, `Route.MapList` and `Route.Stretch` are ordinary routes, so Back works, none of
them is private, and `Route.keepable` still cuts a restored stack at the first private screen.

### Drawing

Everything is in dp: the canvas is scaled by the display density once, so every width and tolerance is the same
physical size as the iPhone's points and the web's CSS pixels. Everything is **batched per layer** — one `Path`
for all the class-3 streets, one `drawPoints` for five thousand bus stops, one `Path` per help group for about
fifteen hundred listing dots. **No colour is written in the painter**; the rules carry a token name.

Three things follow the web's 2026-09-21 accessibility pass rather than the iPhone's older numbers, because the
colours and the widths are one decision and cannot be taken apart:

- every street clears 3:1 against the land and against a park, and a small street is a **hairline**;
- a small street waits for 6 m/dp rather than 9, and the next class for 11 rather than 16;
- the ground outside the four cities is a **hatch** whose own lines clear 3:1, not a second pale fill (1.20:1);
- every transport line gets a **casing** under it, as the greenway has, which is what its contrast is measured
  against where it crosses a street.

`apps/ios` still has the older street numbers and the older `--map-road` / `--map-main` / `--map-fwy` values. The
ported tests pass either way, so this is written down rather than hidden: **the iPhone palette and street ladder
want the same pass.**

### The two styles

`docs/MAP-STYLE.md` is the spec, settled after the web and the iPhone had both built it; this is the third
implementation of it. **`standard`** is the drawing described above and is the default. **`subway`** redraws the
eleven transport layers — and nothing else — as a metro diagram on the same geographic map.

*Choosing.* "Map style" on the layers screen, above "Getting around": two real `RadioButton`s in a `RadioGroup`
under a heading, each with a one-line description, 48 dp tall. It is hidden when the bundle carries no network
files. The choice applies at once, is announced (`announceForAccessibility`, `map.style_say`), and is written to
the same atomic `map-layers.json` as the layer choices — now `{"on":[…],"style":"subway"}`; yesterday's bare list
still reads, and anything that is not the word `subway` is `standard`. Under the radios, in `subway` only, a key in
words with a small drawn sample beside each line, listing only what is switched on.

*Data.* Each network layer has a second file, `map/transit/<id>.net.json` (format 2): routes with their tone, runs
with their sideways offsets, trunks, interchanges, terminals, and which routes serve each stop. They are in the
APK snapshot and in the signed index, and they go through the same door as every layer: looked up in the signed
index, read, **checked against their SHA-256, and only then parsed** (`BundleStore.verifiedBytes`), off the main
thread, where the three bands are simplified too (`PreparedNet`). Nothing asks for one in `standard`
(`netFilesWanted` is empty — a test). While a file is on the way, or if it fails (not in the index, a bad hash, no
network, not format 2, malformed), **that layer goes on drawing `standard`** beside the ones that arrived, and the
"Map style" card says "could not load" with a "Try again" per layer. Rail network files carry no points: stations
are the standard layer's, and the QLINE's two platforms per station draw two discs and print one name. Hubs are
placed from `origin` + `at` + `span` in `places/transit.json`; stations are matched by name only for a bundle old
enough to have no `origin`.

*Drawing*, in the spec's order: bike lanes (one path stroked wide, then the middle taken out with
`PorterDuff.Mode.DST_OUT` inside a `saveLayer`), SMART under DDOT (one casing pass, then each route in its tone,
local before frequent, SMART's centre stripe), trunks once per network, the QLINE with its ties, the People Mover
as a closed loop started mid-segment with direction chevrons, the selected route, **then the greenway above all
transit**, street names, stops, interchange and hub pills, terminal rings, the point markers (MoGo rounded square,
Amtrak square with a bar, intercity dashed diamond, park-and-ride "P"), badges, listing dots, station names. A
selected route dims everything else in transit as **one** `saveLayerAlpha` at 35 %, lies on a `--tr-sel`
under-stroke, is drawn through its trunk stretches, and shows its stops (which asks for its network's stops layer
and stops file if they are not held). The basemap is quietened — paler but still 3:1 streets at 0.8 width, a paler
park, one class fewer street names, no big-road casing — only in `subway`, only while a network layer is on, and
**never with high contrast**.

*Geometry is never rebuilt per frame.* Each route's geometry is built once per zoom band × scale bucket (a ladder
of 2^(1/8), a 9 % step, inside the spec's 15 %) in dp at the bucket's scale, and drawn through the canvas matrix
with every width and dash divided by what is left of the scale. A drag builds nothing; a pinch builds once per
step; the debug frame log counts the builds. **One deviation, measured:** the solid passes are drawn with
`Canvas.drawLines` from the cached path *flattened to segments* (a quad corner becomes one to three chords, a third
of a dp from the curve at most; round caps make a run of segments the same shape as a round-joined line), not with
`drawPath`. A long stroked `Path` under a matrix that changes every frame is rasterised on the CPU and uploaded as
a mask per path per frame, and with 79 routes `dumpsys gfxinfo` on the emulator showed a median frame of **800 ms
against 250 ms for `standard`**; from segments it is **550 ms**. The cached `Path` is still what the QLINE's dashed
ties are stroked from. The emulator's translated GPU is a poor guide to a phone's — the *CPU* side of a frame is
about 1 to 9 ms in `standard` and 4 to 17 ms in `subway` with both bus networks on, of which the subway passes are
2 to 12 ms against the spec's budget of 8 (`adb logcat -s Help313Timing`, non-debuggable build) — so **this wants measuring on a real cheap phone
before anyone calls it fast.** Putting every route of a network into one path was tried and was far worse.

*High contrast.* `UiModeManager.getContrast()` (Android 14 and up) is the one public, reflection-free answer the
platform gives; `AccessibilityManager.isHighTextContrastEnabled` is hidden until API 36 and this app does not call
hidden methods. So on Android 14+ a raised contrast setting gives the spec's high-contrast tones, casing + 1, rings
+ 0.5 and no quiet basemap; on Android 7 to 13 the answer is "no" and the plain tones — which already clear 3:1
everywhere — are used. `standard` had no high-contrast variant before and still has none.

*Cards.* A route: name and agency, "Frequent route" when the owner says so, the owner's own weekday headway worded
as theirs, the number of stops, where it ends, the `map.key_qline` sentence wherever the data marks a line
`derived`, and **one** link — the owner's trip planner, the same link `apps/web/src/transit.ts` marks for that
system (a test reads that file), opened by the app's one https-only opener. DDOT's planner is plain `http` today
and its file has no `agency_url`, so **a DDOT route card has no link on Android**, rather than an exception to the
https rule. A station, an interchange, a trunk: the routes as real buttons, 48 dp, each selecting its route. A hub:
the stations a short walk apart. Route and station names are Latin and stay left to right inside an Arabic card;
badges are horizontal, Latin and left to right; the map never mirrors. Nothing is live: no arrival times, ever.

*Held to the web.* The `--tr-*` tokens and the six quiet-basemap tokens are numbers in `MapStyle.kt`, and
`StyleSheetTest` **parses `apps/web/src/style.css`** and fails on any token that differs, in all four values
(light, dark, and each with more contrast); the same test holds `res/values*/colors.xml` to it for `standard`.
`TransitPaletteTest` computes the spec's own tables: all 78 ratios of table 4.1 to two decimals and ≥ 3:1, the 16
high-contrast ratios, and 22 quiet-basemap pairs — every quiet street against the land **and** the quiet park.

### Gestures

Everything a person expects of a phone map, out of `GestureDetector` and `ScaleGestureDetector` and nothing else
(Kyle, 2026-09-21). No rotation and no tilt on purpose: north stays up, so the city on the screen matches the
city outside, the street names stay the right way up, and the N/P walk and the TalkBack order stay the plain
south-to-north order they are.

- **Drag** pans, and a flick carries on and settles (`MapFling`, constant deceleration, stopped by the camera's
  own clamp and by nothing else).
- **Pinch** zooms about the point between the fingers **and pans with it**: `MapCamera.pinched` applies the
  focal point's own movement and then the span change, so a hand that spreads and slides does both.
- **Double tap** zooms in about the tap over about 200 ms. It fires on the second tap's *lift*, and only when
  that touch did not become a drag, so it never swallows the one below.
- **Double tap and drag** ("quick scale") zooms with one thumb; `isQuickScaleEnabled` is set explicitly.
- **Two fingers tapped once** zooms out.
- **A tap** selects what is under it — only a touch that moved less than the system's own slop and was never
  part of a two-finger gesture.
- Nothing animates when the phone is set to do without motion (animator duration scale 0): a flick lands where
  the finger left it and a zoom happens in one step.
- The view takes the gesture from whatever is underneath on touch-down and gives it back on the way up.

### Accessibility

A custom `View` is one opaque picture to TalkBack, so the things on the map are offered as **virtual nodes**
through a platform `AccessibilityNodeProvider` — not AndroidX's `ExploreByTouchHelper`, because this app has no
libraries at all. One node per greenway stretch in route order (south to north), then the places on screen
nearest the middle first, each a real `Button` with its own words, its own bounds on screen, `ACTION_CLICK` wired
to the same selection a tap makes, accessibility-focus events, and `TYPE_VIEW_HOVER_ENTER` for explore by touch.
`uiautomator dump` serialises them, which is how they were checked.

A hardware keyboard walks the same order: arrows pan, `+`/`-` zoom, `N`/`P` step through what is on screen,
Enter opens, Escape steps out. Tab is deliberately not bound, so it still leaves the map (WCAG 2.1.2).

In `subway` the same order is **only ever appended to**: after the greenway and the listings come every hub, at
most 8 route ends and at most 20 interchanges (each nearest the middle first), then the routes in view in rider
order — 40 added at most, so routes are always reached, never fewer than 8 (`featureOrder`). What the cap left out
is said with the map's own name ("and 97 more"); the list has them all. A route's ring goes round its nearest
placed badge, or the place on its line nearest the middle of the view. Every station, pill, terminal, marker and
badge answers a tap inside a **48 × 48 dp** box, by the spec's label priority, and a second tap in the same place
moves on to the next thing under the finger; a route line answers within 22 dp. The map's own buttons, the status
bar and the open card are entered as taken space, so no badge or name is drawn under a control.

The map is never the only way to reach a fact: **"See this map as a list"** shows everything switched on in
words, in the same order the map is read in — and it is **the same list in both styles**, because the code that
builds it is never told the style (`MapList.kt`; a test, and a `uiautomator dump` of the screen in each style).

### What is never drawn

`mapDrawable` is the one rule the whole tab hangs on, and dots, the tap test, the virtual nodes and the list all
go through it: help with drugs or alcohol and help after sexual assault are dropped as whole top-level kinds, and
a domestic-violence or mental-health-crisis listing is dropped row by row — **on its category, never on whether a
coordinate happens to be there**. A test hands it a `shelter.dv` row with a coordinate on it and it is refused.

### The map inside the APK

`map/**` now travels in the APK snapshot (`copyBundleSnapshot`), because a map that needs a network the first
time is not the offline map docs/05 promises — the six `.net.json` files of the subway style included, since a
style a person can pick has to work the first time with no signal too. Left out: `indicators/`. Every file is checked against the sha256 in the
**signed** index before a byte of it is decoded, wherever it came from — the verified copy on this phone, the
APK snapshot, or the published origin, in that order (`BundleStore.verifiedBytes`). A clean debug APK went from
1,282,907 bytes (1.22 MiB) to 1,675,641 bytes (1.60 MiB): 846 KB of map JSON, compressed; with the network files
and the subway code it is **1,927,566 bytes (1.84 MiB)**.

### Still to do on this tab

- **Measure the subway style on a real, cheap phone** (see "The two styles"): the emulator cannot say whether a
  frame is fast.
- A DDOT route card has no trip-planner link, because DDOT's planner is `http`. If DDOT publishes an https
  address, it goes in `apps/web/src/transit.ts` and `transitPlanners`, and a test keeps the two the same.
- After the map style changes, the layers screen is rebuilt and TalkBack's focus starts again from the top of it;
  the change itself is announced.
- `standard` has no high-contrast variant on Android (the web and the iPhone have one).

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

## What two adversarial reviews found

Sixteen findings, 2026-09-20, after the app had compiled and run. Every one is listed, with the test that would
catch it coming back. The three marked **HIGH** are the ones that mattered.

**HIGH 1 — a crash loop before anything was authenticated.** `Verify.kt` parsed `index.json.sig` with the JSON
reader in `packages/query`'s Kotlin twin **before checking any signature**, and that reader recursed once per
nesting level with no cap. 40 KB of `[[[[[…` from whoever answered for the bundle origin was 40,000 stack frames
and a `StackOverflowError` — an `Error`, which `catch (e: Exception)` in `BundleStore` did not catch. It ended the
loader thread, so the app never loaded a list again, and it happened again at every start. Fixed in three places,
because one would have been enough and three is the point: `Json.parse` now caps depth at 64 and length at 16 MiB
and throws its own ordinary exception; `verifiedIndex` caps the signature file at 64 KiB and the index at 1 MiB and
catches `Throwable`; and every task on the loader thread is wrapped so that nothing it throws can take the thread
with it. A bad download can only ever mean "keep the copy we have".
*Tests: `FixtureTest.deeplyNestedJsonIsRefusedAndDoesNotOverflowTheStack` (tried at 20,000 and 200,000 deep),
`FixtureTest.theNestingCapLeavesTheBundleRoomToBreathe`,
`GuardsTest.aDeeplyNestedSignatureFileIsRefusedAndNeverThrowsAnError`,
`GuardsTest.theSignatureFileHasASizeCeilingOfItsOwn`.*

**HIGH 2 — a key under which any bundle verified.** Eight points on Curve25519 have order 1, 2, 4 or 8. Under a
public key that is one of them, `[h]A` is the neutral point whatever `h` is, so cofactorless verification reduces
to `[0]B = O = R` and a signature of 64 zero bytes verifies **any** message. Neither the release key gate nor
`Ed25519` refused them. Now both do, and by different means on purpose: `Ed25519.verify` refuses by arithmetic
(`[8]A` must not be the neutral point), which needs no list to be complete and covers any encoding that decompresses
at all; the gate in `app/build.gradle.kts`, which runs before anything is compiled and cannot call app code, reads
the seven byte encodings out of `Ed25519.kt` between that file's markers and fails the build if it does not find
the number that file says it has — so the gate cannot quietly end up checking against nothing. The two
non-canonical encodings (`y = p`, `y = p + 1`) are refused at verify time as "not a point" and by the gate as bytes.
*Tests: `GuardsTest.aSmallOrderPublicKeyVerifiesNothing` (all 8 points, both sign bits — 14 encodings — against
three messages, with the reviewer's all-zero signature), `GuardsTest.anOrdinaryPublicKeyIsNotSmallOrder`,
`GuardsTest.theReleaseGateRefusesASmallOrderKeyToo`. Also run by hand: `:app:assembleRelease` with a small-order key
stops at `checkReleaseKeys` and says "key 1 is a small-order Ed25519 point, under which any message verifies; it is
not a key", for the canonical and the sign-bit-set form alike, while two ordinary keys still get through.*

**HIGH 3 — the platform verification path is gone.** `verify` asked the platform first and took a "yes" as final.
Two things were wrong with that. The lookup returned the *first* provider offering `KeyFactory/Ed25519`, so
something else installed on the device decided whether this repository's code ran at all; and when that provider had
no `Signature`, it fell back to the **default** provider's `Signature`, initialised with a key object built by a
different one. The path is removed entirely, and the measurement this repository already had is why: there is no
software Ed25519 provider on Android to be fast with. The emulator's own provider list, printed again on
2026-09-20, is exactly the trap —

```
provider AndroidOpenSSL has [ConscryptHpke/DHKEM_X25519_...]        (not used)
provider AndroidKeyStoreBCWorkaround has [Signature/Ed25519]        (not used)
provider AndroidKeyStore has [KeyPairGenerator/ED25519, KeyFactory/ED25519]  (not used)
```

— `AndroidKeyStore` offers the `KeyFactory` (and cannot load a public key from bytes), `AndroidKeyStoreBCWorkaround`
offers the `Signature`, and the old code would have picked the first and then reached for the default provider's
second. So: one strict RFC 8032 implementation, the same accept/reject set on API 24 and API 35. The agreement with
a reference implementation is still checked — in the unit tests, against the JVM's own SunEC, which the tests run on
and a phone does not have.
*Tests: `GuardsTest.theSoftwareImplementationAgreesWithTheJvmsOwnEd25519` (the RFC vectors, four one-bit signature
corruptions, `s = L`, an off-curve key and a changed message — 9 of 10 cases answered by SunEC on this JDK),
`GuardsTest.thereIsOnlyOneVerificationPath`, `VerifyTest.oneImplementationAnswersEveryCaseTheSameWayHoweverItIsCalled`.*

**MEDIUM 4 — the phone's own name was going out on every request.** Nothing set a `User-Agent`, so
`HttpURLConnection` sent Android's default: `Dalvik/2.1.0 (Linux; U; Android 15; <model> Build/<id>)` — the Android
version, the device model and the build id, on requests this README described as carrying nothing about the person.
Every connection now goes through one door, `Http.kt`, which sets the fixed `313Help-Android/<versionName>` and
nothing else, clears the process-wide `CookieHandler` and `ResponseCache`, turns off the connection's own cache and
refuses redirects. The report POST now requires https like the bundle GET, and no longer derives its address with
`substringBefore("/data/bundle/")` and uses whatever comes out: `Net.apiRoot` returns a bare `https://host[:port]`
or nothing at all. The comments in `BundleStore.kt` and `AndroidManifest.xml` that said "no headers of our own" are
corrected — that sentence was true and was the bug.
*Tests: `GuardsTest.theOnlyHeaderWeSendNamesTheAppAndNothingAboutThePhone`,
`GuardsTest.theReportPostGoesToABareHttpsOriginOrNowhere`, `GuardsTest.onlyHttpsIsFetchedOrOpened`,
`GuardsTest.everyConnectionGoesThroughOneDoor`.*

**MEDIUM 5 — a lock held across the network, and a privacy control on the main thread.** Every method on
`ReportStore` was `@Synchronized` on the object and `submit`/`flush` called `post` from inside that, so one report
with no signal held the monitor for a 15-second connect plus a 30-second read and everything else that touched the
queue waited behind it. And "Make a new key" ran `SecureRandom` and a disk write on the main thread — the reviewer
froze the UI for 3.6 seconds. Now a lock is held only while a file is read or written, never while anything is on
the network, and the slow things run in the background. What is waiting is shown on the privacy screen with a
"Delete what is waiting" control, as the web app does. And the queued reports are not orphaned by a new key: each
one's one-day hash is worked out again, from the secret this phone holds at that moment, as it leaves — the web
app's `withCurrentNonce`, mirrored exactly.
*Tests: `GuardsTest.noLockIsHeldAcrossTheNetwork` (it walks every `synchronized` block in the file and fails if one
calls `post`), `GuardsTest.theSlowThingsAreOffTheMainThread`,
`GuardsTest.theOneDayHashIsWorkedOutAgainWhenAQueuedReportLeaves`, `GuardsTest.nothingLocalWaitsBehindTheNetwork`,
`GuardsTest.aKeyResetPartWayThroughAFlushAppliesToWhatIsLeft`.*

> **Two of these were found by running it, not by reading it, and both were in the fix rather than the original.**
> The first version of the fix put all background work on one thread. A flush of four queued reports against a host
> that does not answer holds that thread for four fifteen-second connect timeouts — so "Make a new key", queued
> behind it, did nothing for a full minute. The UI never froze, which is exactly why watching for jank would have
> passed it: a privacy control that appears to have worked and has not is worse than a slow one. `Work.kt` now has
> two threads, one for the two calls that talk to a server and one for everything local, which is the "never let the
> network hold up something local" rule of the locks, one level up. The second: the flush read the install secret
> *once* before its loop, so a key reset halfway through a slow flush would still have sent everything behind it
> under the old key. It reads the secret per report now, as the web app does.

**MEDIUM 6 — a kill mid-write threw away a person's reports.** `outbox.json` and `saved.json` were written with
`writeText`, which truncates and then writes; a phone killed in between left a half-written file, and `queue()`
caught the parse error and returned an empty list, so the queue was silently gone and the next write flattened it.
Both files are now written to a temp file, `fsync`ed and renamed, which is atomic on one file system. And an outbox
that cannot be read is no longer read as "you had nothing waiting": the bytes are moved aside under a unique name
for a steward to look at, and the person is told, in words, that some reports could not be read and that nothing was
deleted (`privacy.queued_unreadable`, added to all four language files).
*Tests: `GuardsTest.anUnreadableQueueIsNeverMistakenForAnEmptyOne` (the shapes a kill actually leaves, the nesting
bomb among them), `GuardsTest.aQueueRoundTripsAndIsCappedAtFifty`, `GuardsTest.aReportQueuedDuringAFlushIsNotLost`,
`GuardsTest.whatThePersonGaveUsIsWrittenAtomically`.*

**MEDIUM 7 — "Out of supplies or food today" on an emergency room.** The web app and the iPhone app both filter
that report kind to the food and harm-reduction categories; this app offered all six kinds on every listing, so a
steward's queue would have filled with an unanswerable question about a hospital. `listingKinds(category)` in
`ReportModel.kt` is now the same rule, and `ParityTest` reads the web app's line and the iPhone app's line as text
so a change in either fails here.
*Test: `ParityTest.theOutOfSuppliesButtonIsOnlyOfferedWhereThereAreSupplies`. Seen on the emulator: the six kinds on
a food pantry, the five on Corewell Health Dearborn Hospital's emergency room.*

**MEDIUM 8 — a configuration change threw the person back to Home.** Only `orientation|screenSize|keyboardHidden`
were declared, so changing the font size, turning on dark mode, changing the phone's language or entering
multi-window destroyed and rebuilt the activity: the back stack was cleared, the bundle was verified all over again,
and another `Executor` was started and never stopped. Three changes. Every configuration the app can answer itself
is declared and answered in `onConfigurationChanged`, which re-reads the words and redraws the screen the person is
on. The verified bundle and the loader thread live in one process-level `BundleStore`, so a recreation never
re-verifies and never starts a second thread, and the executors are stopped in `onDestroy` when the activity is
really finishing. And the back stack is now data — `Route.kt` — rather than a list of closures, so it can survive a
recreation.

**What was chosen for the stack, and why.** An **in-process retained holder**, and deliberately *not*
`savedInstanceState`. docs/08 is a non-negotiable: triage answers live in memory only and are cleared on exit, and
which need somebody tapped *is* a triage answer. `savedInstanceState` is written to disk by the system on its own
schedule, so it is not "memory only" — `onSaveInstanceState` is not overridden at all, and a test asserts it stays
that way. `Route.Retained` is a field in this process: it dies with the process, and `onDestroy` clears it when the
activity is finishing. It also keeps only the **public** part of the stack, truncated before the first private
screen. A recreation is not a navigation: if the system rebuilds the activity while a domestic-violence screen is
open, re-opening that screen is the app deciding to, and the person may not be the one holding the phone by then. So
it lands on the last ordinary screen instead.
*Tests: `GuardsTest.aRecreationNeverPutsAPrivateScreenBack`, `GuardsTest.nothingAboutTheJourneyIsEverPersisted`,
`GuardsTest.thereIsOneBundleStorePerProcess`. Seen on the emulator: four screens deep in "I need food → Food today",
the font scale changed to 1.5 and back to 1.0 — the screen stayed on "Food today" both times, the process id did not
change, and no `verify.signature` appeared in logcat, so the bundle was not re-verified. And after
`adb shell am kill`, the app opens on **Home**: there is no `shared_prefs` directory and no route file on disk, only
`install-secret` and `outbox.json`.*

**MEDIUM 9 — text fields, screenshots and a way out.** The search box and the report note are now set up so the
rest of Android does not take a copy: `IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS` (API 26+), so an autofill
service is not offered the chance to fill — and therefore to *save* — a search for a shelter;
`IME_FLAG_NO_PERSONALIZED_LEARNING`, so a keyboard does not learn from it; and no suggestion strip on the search box,
which is a street or the name of a clinic. The note keeps its suggestions, because it is prose somebody is writing.
`FLAG_SECURE` keeps the domestic-violence, crisis, treatment and assault screens out of the recents thumbnail, out
of screenshots and off an external display. And those screens carry **"Leave this page fast"**, the same button the
web app has, going to the same address.

**Per-screen, not app-wide, and that is a decision.** The recents thumbnail is the one that matters: it is drawn by
the system, it outlives the app being closed, and it is what somebody else sees when they pick the phone up and
press the square button. But making the whole app unphotographable would take away something people actually use —
screenshotting an address or a phone number to send to someone who is helping them. The compromise only works
because it cannot be forgotten: the flag is set *and cleared* on every draw, from the route, in
`MainActivity.render`, so a screen added later inherits the rule instead of having to opt in, and a screen that set
it on the way in cannot leave it set on the way out.
*Tests: `GuardsTest.theScreensThatMustNotBePhotographedAreTheOnesDocsSay`,
`ParityTest.theSameScreensOfferAQuickExitInEveryApp` (which reads `quickExit` out of `apps/web/src/needs.ts`).
Seen on the emulator: on "I'm not safe at home", `dumpsys window` shows `fl=... SECURE ...` and `screencap` returns
a blank 17 KB PNG for a 1080×2340 screen; going back to the Help screen, `SECURE` is gone. In Arabic the same screen
reads `غادر هذه الصفحة بسرعة` and is equally secure. Tapping it opened `https://www.weather.gov/` and the app's task
left the recents list (`dumpsys activity recents` puts it under `mHiddenTasks`, not under `Recent tasks`).*

**MEDIUM 10 — a signed index still does not get to name a path.** The index is Ed25519-signed, but a signed
`../../shared_prefs/x` is still a path escape out of `filesDir`, and a signed name carrying `://` appended to the
bundle base is still a different server. Signed means "a steward published this", not "this is safe to
concatenate" — and the signing key is the one thing a release cannot rotate quickly. `Net.safeBundlePath` is a
strict relative-path rule, and an index naming anything else is refused **whole**, as part of accepting it at all,
rather than throwing somewhere deeper; the check is repeated where the `File` and the URL are actually built,
because that is the line a future edit would add a name to. `ACTION_VIEW` on a website from the bundle now goes
through an https allow-list (`Net.webLink`), as `apps/web/src/url.ts` does, and the other three schemes the app
opens — `tel:`, `geo:`, `transit:` — are built from parts and never taken from data.
*Tests: `GuardsTest.theSignedIndexCannotNameAPathOutsideTheBundle` (every name the pipeline actually writes, and
twenty shapes that escape), `GuardsTest.anIndexNamingABadPathIsRefusedWhole`, `GuardsTest.onlyOurOwnSchemesAreOpened`.*

**LOW 11 — section headings are headings now.** `UI.sectionHead` set a `contentDescription` and a comment claimed a
screen reader announced it as a heading. It did not: a description is *what* to read, not *what kind of thing* it
is, so "jump to next heading" found nothing on any screen. `setAccessibilityHeading(true)` is called on API 28 and
up; below that Android has no way to say it. **Not observable through `uiautomator dump`**, which does not serialise
that attribute, so this one is verified by reading the code and not by a screen reader — the honest state of it.

**LOW 12 — "Call Emergency, 9 1 1".** The digit-by-digit description sat on the inner `TextView`, which is not
focusable and sits inside a container with its own description, so a screen reader never reached it and read "911"
as nine hundred and eleven. The spoken form is on the focusable row now, and the two lines inside are excluded from
the accessibility tree so nothing is said twice. *Checked on the emulator: the clickable, focusable row's
`content-desc` is `Call Emergency, 9 1 1` and the inner `911` node has an empty one.*

**LOW 13 — saved places are not read from disk on the main thread.** Every listing detail and every draw of the
Saved tab opened and parsed `saved.json`. It is read once, on the loader thread at start-up, and kept in memory;
writes go to disk in the background. *Test: `GuardsTest.theSlowThingsAreOffTheMainThread`.*

**LOW 14 — the time zone rule is honest about 1987 now.** `Time.kt` claimed the 1987–2006 rule was "kept for older
stored dates", as if dates before 1987 were handled. Detroit's real history is nothing like the rules in that file:
the window was the last Sunday in April from 1976 to 1986, it started in January 1974 and February 1975 under the
Emergency Daylight Saving Time Energy Conservation Act, and **Michigan did not observe daylight saving at all from
1969 to 1972**. Rather than implement forty years of repealed federal law that nothing in this app can exercise —
every date here is a schedule a place published, a day a steward wrote down, or the moment a bundle was built — the
rule is **clamped and documented**: an instant before 1987 is answered as Eastern Standard Time, the year round.
Defined, written down at the top of the file, and pinned by a test rather than left undefined.
*Test: `FixtureTest.theZoneRuleIsClampedBefore1987`, with two probe instants. 1 July 1970 noon UTC comes out 07:00,
which history agrees with by accident (Michigan was on EST that year); 1 July 1985 noon UTC comes out 07:00 where
history says 08:00, and that disagreement is the documented behaviour. 1 July 1987 comes out 08:00, where the rule
is the rule.*

**LOW 15 — "am" and "pm" come from the strings files.** `Format.clock` wrote them out in English, which made it the
one place in the app where a sentence was built from English fragments. It reads `clock.am` and `clock.pm` now, and a
list is joined with `list.sep`; all four language files have had all three keys all along. *Seen on the emulator in
Arabic: `مغلق الآن. التالي: 25‏/09‏/2026 2 م` and `... 10 ص`, and an address as
`8330 E. Jefferson، Detroit، 48214` with the Arabic comma rather than a Latin one.*

**LOW 16 — the words are outside the signed bundle, and this says so.** `Strings.kt` reads
`assets/strings/{en,es,ar,bn}.json`, which the build copies out of `strings/` at package time. Those files are
**not** in the Ed25519-signed bundle and are not checksummed against it. That is correct and is not a gap: they are
part of the APK, so they are covered by the APK's own signature, which Android verifies at install and which the app
cannot be made to ignore. The signed bundle exists to authenticate data that arrives **over the network** after the
app is installed; the app's own words never do. What a *place* wrote about itself does come from the bundle, and is
signed. The one thing to keep in mind: adding a new language is a new APK, not a new bundle.

### CI: the rules are in `:core` now

`:core` covered `Ed25519`, `Verify`, `ReportModel` and `SavedRules`, but the *rules* inside `BundleStore` and
`ReportStore` were mixed in with the Android around them and so were checked by nothing CI ran. Four files were
split out, with no `android.` import in any of them, and named in `core/build.gradle.kts`:

| file | what CI now runs |
| --- | --- |
| `Net.kt` | the one header, https only, the api root, safe bundle paths, the link allow-list |
| `Http.kt` | compiled, and asserted to be the only place a connection is opened |
| `Outbox.kt` | the queue's caps, what an unreadable file means, the merge after a flush |
| `Route.kt` | which screens are private, and what may survive a recreation |

So `HELP313_NO_ANDROID=1 ./gradlew :query:test :core:test` — which is exactly what the `android-query` job runs —
covers all of it on a plain JDK. Checked both ways on 2026-09-20.

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
distributed, and `./gradlew :query:runFixtures` runs all 190 fixture cases with no test framework on the
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
  reset from the privacy screen — and a report that was waiting in the outbox when that happened has its hash
  worked out again from the new key as it leaves, so "Make a new key" is true of what is queued as well as of what
  is sent next.
- Bundle fetches and report posts are https, with **one header of ours**: the fixed `313Help-Android/<versionName>`,
  which names the app and nothing about the phone. No cookies (the process-wide `CookieHandler` is set to null), no
  cache (nor a `ResponseCache`), no redirects, no query string and no referrer. One place opens every connection,
  `Http.kt`, so this cannot drift between the GET and the POST. **There is no debug exception for cleartext**: no
  `networkSecurityConfig`, no localhost alias, `usesCleartextTraffic="false"` in every build. An emulator can point
  at an https address, and a debug-only hole is a hole somebody forgets to close.
- Domestic violence, mental-health crisis, treatment and sexual-assault listings cannot be saved (audit A8), are
  kept out of the recents thumbnail and out of screenshots (`FLAG_SECURE`, set from the route on every draw), are
  never restored by an activity recreation, and carry "Leave this page fast".
- The search box and the report note ask Android not to autofill them, not to let the keyboard learn from them, and
  (the search box) not to offer suggestions.
- Nothing about where a person has been is written anywhere: no `SharedPreferences`, no `onSaveInstanceState`, no
  route file. The back stack is a field in this process and dies with it.

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
4. ~~**The platform's Ed25519 is used when there is one**~~ — **removed on 2026-09-20, later the same day.** The
   finding was that there is no software Ed25519 provider on Android to be fast with (an API 35 image has it only in
   `AndroidKeyStore` and `AndroidKeyStoreBCWorkaround`, both for hardware-held keys), so the path never ran — and
   that as written it could let an unrelated provider decide whether this repository's verification code ran at all,
   and then verify with the *default* provider's `Signature` using another provider's key object. There is one
   implementation now, on every API level, with one accept/reject set. See **HIGH 3** under "What two adversarial
   reviews found". The agreement with a reference implementation is kept in the unit tests, against the JVM's own
   SunEC.

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

**What was the slowest part after that: JSON.** With the signature down, reading 742 KB of bundle JSON with the
hand-written reader in `packages/query`'s Kotlin twin was the largest item left, 0.8–4.0 s on this emulator. It
was measured and dealt with later the same day: see "JSON, measured" below.

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

## JSON, measured

`load.json_parse` was 0.8–4.0 s on the API 35 arm64 emulator, for about 742 KB in 20 files. Measured on
2026-09-20 before anything was changed, and the first thing the measurement said was that **most of that number
was not parsing.**

**What the 0.8–4.0 s was made of.** `BundleStore.load` now prints `load.json_parse_cpu` beside
`load.json_parse`: the first is the time the loader thread actually ran
(`SystemClock.currentThreadTimeMillis`), the second is the clock on the wall. Same build, same emulator, six
cold starts: **wall 700–2,860 ms, CPU 380–650 ms.** The rest is the thread waiting for a core. This AVD has
`hw.gpu.enabled=no`, so the guest draws the first frame in software on the same four cores the loader wants —
logcat shows `Davey! duration=5023ms` for that frame — and in the same starts `load.read_files`, which is 12 ms
of work, took anything from 33 to 690 ms. A phone with a GPU does not have that particular fight, so **the wall
numbers from this emulator overstate the wait and the CPU numbers are the ones to compare.**

To get the emulator's scheduling out of the way, the reader was also timed alone: `:query` dexed with `d8` and
run with `dalvikvm64` on the same emulator, parsing the same files the app loads at start, plus
`BundleRow.fromJson` for the 531 rows. "Fresh process" is one parse in a new ART process with the JIT on and
nothing compiled ahead — what a cold start sees. "Warm" is the best of 40 in one process — what compiled code
costs.

| reader, alone | ART, fresh process (7 runs) | ART, warm | JVM, warm |
| --- | --- | --- | --- |
| before: `String`, a character at a time | 104–211 ms, median 147 | 58.7 ms | 4.2 ms |
| after: UTF-8 bytes | 45–101 ms, median 55 | 9.4 ms | 2.2 ms |
| `BundleRow.fromJson`, unchanged | 15–56 ms, median 25 | 1.3–2.0 ms | 0.5 ms |

**What was changed**, all of it in `query/.../Json.kt`, with no new dependency and the same `Json` tree out:

1. **It reads the bytes.** `Json.parse(ByteArray)` walks the UTF-8 as it came off the disk. Every character the
   grammar cares about is ASCII, and an ASCII byte never occurs inside a longer UTF-8 sequence, so only the text
   between two quotes is ever decoded. The 742 KB is no longer copied into one big `String` first, and a byte
   read is one instruction where `String.charAt` was a call — which matters most exactly when the code is being
   interpreted. `Json.parse(String)` is still there for the small files and the tests; it encodes and calls the
   same reader, so there is one reader, not two.
2. **A string with no escape in it is decoded once**, straight from its bytes, with no `StringBuilder`. That is
   nearly every string in the bundle. One with a backslash takes the builder, a run at a time.
3. **Object keys are decoded once per file.** A category file says `"id"`, `"name"`, `"facts"` five hundred
   times; a 256-slot table hands back the same `String`, whose hash is then already computed. ASCII keys of up
   to 32 bytes, at most 128 of them, so a hostile file cannot make it grow.
4. **Maps and lists are built at their final size**, at the closing bracket, from one stack the parser keeps —
   no `LinkedHashMap` rehash, no `ArrayList` regrowth.
5. **Plain decimals are read in place.** Up to 15 digits and the power of ten under them are both exact in a
   `Double`, so one division is correctly rounded: bit for bit what `Double.parseDouble` gives. Exponents, long
   mantissas and everything odd still go through `toDoubleOrNull` as before.

And one thing in `BundleStore.load`: **`places/parks.json`, `places/transit.json` and `places/zips.json` are
checksummed and not parsed.** No Android screen reads them; they were being parsed — about a tenth of the
bytes — and the result dropped. Whoever adds a reader adds the name to `PARSED_AT_START`. (One consequence, said
out loud: a malformed `parks.json` whose checksum matches the signed index no longer refuses the whole bundle on
Android. Only the publisher can produce that file, and the pipeline's schema validation is where it is caught.)

The depth cap, the size ceiling and "anything it cannot read throws `JsonException`" are as they were. Positions
in messages are byte offsets now. Two places are *stricter* than before and none is looser: a `\u` escape must
be four hex digits (`toIntOrNull(16)` used to let a sign through), and a number may only contain ASCII digits.

**Held to the old reader.** The reader it replaced is kept word for word in
`query/src/test/.../ReferenceJson.kt`, and `JsonParityTest` requires the same tree or the same refusal from
both: every file in `schema/fixtures`, every file of the bundle when `data/bundle/v1` exists (43 files on
2026-09-20), about a hundred awkward inputs (escapes at either end, surrogates, repeated keys, more keys than
the table holds, every object size from 0 to 40, malformed everything), and 200,000 random decimals compared
with `toDouble()` by their raw bits. All 181 fixture cases still pass; TypeScript/Kotlin/Swift parity is
untouched, because nothing downstream of the `Json` tree changed.

**Before and after, in the app.** Same emulator, `-PdebugLikeRelease=true`, six to eight cold starts each,
`load.json_parse` / `load.json_parse_cpu`:

| build on the emulator | before, wall | before, CPU | after, wall | after, CPU |
| --- | --- | --- | --- | --- |
| as `adb install` leaves it (`status=verify`: interpreted, then JIT) | 700–2,860 ms, median ~1,200 | 380–650 ms, median ~510 | 210–1,050 ms, median ~550 | 80–430 ms, median ~170 |
| after `pm compile -m speed -f` (everything compiled ahead) | 780–3,390 ms, median ~1,180 | 370–1,060 ms, median ~480 | 140–605 ms, median ~320 | 45–113 ms, median ~80 |

Roughly a third of the CPU interpreted and a sixth compiled; the wall time follows it down but stays two to five
times the CPU for the reason above. `start.snapshot` — signature, read, checksum, parse, rows — went from
1.1–5.4 s to 0.7–3.0 s, and its floor is now the signature (about 250 ms) and the wait for a core.

**Something the measurement turned up about the baseline profile.** After `adb install`,
`dumpsys package` says `status=verify` for this app: nothing was compiled ahead, profile or no profile. The
profile is packaged (`assets/dexopt/baseline.prof` is in the APK), but what *applies* one on a sideloaded
install is `androidx.profileinstaller`, which this app does not have; without it the profile is used when the
Play Store installs the app, and not by `adb install` or a shared APK. So the second row above is what a Play
install should resemble and the first is what a sideloaded APK gets — and the first is where reading bytes
helps most. Adding `profileinstaller` would be this app's first runtime dependency; that is Kyle's call and has
not been made. `baseline-prof.txt` was updated for the reader's new methods either way.

**Considered, measured against, and not done.**

- *Parsing a category only when its screen opens.* Home needs no rows at all, so this would take nearly all of
  the parse off the cold start. But search, saved places and a listing opened by id all read every row, so
  `LoadedBundle.rows` would have to become something that loads on demand, holding checksummed bytes (or
  re-reading and re-checking them) until asked, and every reader of it would need a "not yet" state. That is a
  lot of new states to buy back what is now 50–100 ms of compiled work behind a screen that already shows 911
  and 988. If a real cheap phone says otherwise, this is the next lever, and `load.json_parse_cpu` is the label
  that will say so.
- *Parsing categories in parallel.* The whole parse is about 55 ms alone in a fresh process; the most a second
  thread could return is some tens of milliseconds, on the cores the first frame is already short of, and
  "one store, one background thread" is a property this file leans on elsewhere. Not worth it.

**Still open** is the same thing as above: a real, cheap phone. `load.json_parse` and `load.json_parse_cpu`
are printed on every debug start for that.

## What has actually been verified

Compiled and run on 2026-09-20, on JDK 17 (Homebrew `openjdk@17` 17.0.20.1) and Gradle 8.11.1 through the
committed wrapper, with the Android SDK added later the same day. **138 JUnit test runs (16 in :query, 61 in
:core, and the same 61 again under :app against the real Android classes) and 181 fixture cases, 0 failures.**
Re-run on 2026-09-20 after the cold-start work, with two tests added: the two verification paths never disagree,
and one software verification stays inside a one-second budget.

`./gradlew :query:test` — 16 tests (11 until the JSON reader was rewritten on 2026-09-20; the other five are
`JsonParityTest`, see "JSON, measured"):

- Every case in `schema/fixtures/*.json`: **181 of 181**, the same files and the same expectations
  `packages/query` and `apps/ios` are held to. Open-now, next occurrences, badges, ranking, search, bundle age,
  greenway distances.
- The Detroit wall-clock rule in `Time.kt` compared field by field against the JVM's own tz database, 2024–2031
  in 37-minute steps: **99,516 instants, no mismatches** — the spring-forward, fall-back and "1:30am twice"
  cases among them.
- Calendar arithmetic round-tripped at 1,103 dates spread over 40,800 days, `tel:` links with and without
  extensions, and the JSON reader on the shapes the bundle uses.

`./gradlew :core:test` — 61 tests, against `:app`'s own source files:

- `Ed25519.verify` against the RFC 8032 section 7.1 vectors (**3 of 3**), against tampered signatures, tampered
  messages and the wrong key (**all refused**), and against malformed input (**false, never a throw**). Ten cases —
  the vectors, four one-bit signature corruptions, `s` equal to the group order, a key that is not on the curve and
  a changed message — also go through the **JVM's own SunEC**, asserting this implementation and a reference one
  never disagree (9 of the 10 answered by SunEC on this JDK; the tenth it will not take as input).
- **Small-order public keys are refused.** All eight points whose order divides 8, in both sign-bit forms — fourteen
  encodings — with the all-zero 64-byte signature that would otherwise verify every message, against three different
  messages. The list the release gate reads out of `Ed25519.kt` is asserted to be the same one, so the arithmetic and
  the gate cannot drift apart.
- **The JSON reader cannot be made to overflow the stack**, and an `index.json.sig` — which is parsed before any
  signature is checked — is refused as an ordinary error at 20,000 levels deep, at 200,000, and above 64 KiB.
- **The network policy**: one fixed header that names no device, https only for the bundle GET *and* the report POST,
  an api root that is a bare origin or nothing, an https allow-list before anything reaches `ACTION_VIEW`, and one
  place in the app that opens a connection at all.
- **A signed index still cannot name a file path**: every name the pipeline writes is accepted, and twenty shapes
  that would escape `filesDir` or change the server are refused — and the whole index with them.
- **The report queue**: a half-written file is kept and reported rather than read as empty, the cap is the web app's
  fifty newest, a report queued while a flush is on the network is not lost, and a queued report's one-day hash is
  worked out again from the current key as it leaves.
- **Which screens are private**, and that an activity recreation never puts one of them back.
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

`./gradlew :app:testDebugUnitTest` — the same 61 tests again, this time compiled against the real Android
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

**And again, after the review fixes, on the same emulator.** What was checked by hand this time, in this order:

- **A cold start** — Urgent help drawn in 12 ms, the signature 4.3 s (a plain debuggable build, so interpreted; see
  "Cold start" above), the list up at 6.6 s. No exception in logcat.
- **A font-scale change mid-flow** — four screens into "I need food → Food today", `font_scale` set to 1.5 and back
  to 1.0. The screen **stayed on "Food today"** both times, the process id did not change, and no `verify.signature`
  appeared, so the bundle was not re-verified. (Rapid tab-switching *can* skip frames — each screen is rebuilt in
  code on every draw, and a 40-card Help screen is real work — but a configuration change no longer destroys and
  rebuilds anything.)
- **A domestic-violence screen** — "Leave this page fast" at the top, `dumpsys window` showing `fl=... SECURE ...`,
  and `screencap` returning a blank 17 KB PNG for a 1080×2340 screen. Going back to the Help screen, `SECURE` is
  gone. The same screen in Arabic: `غادر هذه الصفحة بسرعة`, equally secure.
- **The quick exit** — opened `https://www.weather.gov/` and the app's task left the recents list entirely
  (`dumpsys activity recents` puts it under `mHiddenTasks`, not under `Recent tasks`).
- **Arabic** — am/pm as `ص` and `م` from the strings files (`... 25‏/09‏/2026 2 م`), and an address joined with the
  Arabic comma (`8330 E. Jefferson، Detroit، 48214`) rather than a Latin one.
- **The report buttons** — six kinds on a food pantry, five on Corewell Health Dearborn Hospital's emergency room:
  no "Out of supplies or food today".
- **Airplane mode, three reports queued, then "Make a new key" during a stalled flush.** The build was pointed at
  `https://10.255.255.1/…` so every send really hangs for its full 15-second connect timeout. The privacy screen
  read "4 waiting to send from this phone" with "Delete what is waiting"; the key changed within 4 seconds of the
  tap; and **zero** `Choreographer: Skipped frames` lines came from the app's process across 24 taps during it. (The
  first version of the fix failed exactly here — see the note under MEDIUM 5.)
- **A killed process** — `adb shell am kill` while on "Food today"; the app reopens on **Home**, and
  `/data/data/.../` holds no `shared_prefs` and no route file, only `install-secret` and `outbox.json`.

The APK itself was unpacked and checked again: **two permissions only**, `INTERNET` and `ACCESS_COARSE_LOCATION`;
`allowBackup="false"`; `usesCleartextTraffic="false"`; no AndroidX, no Play Services, no Firebase, no HTTP or
JSON library — nothing under `androidx/`, `com/google/` or any third-party package at all. 1,251,867 bytes
(1.19 MiB) — about 60 KB more than before the review fixes.

Two things in this round are **not** observable from outside and are verified by reading the code rather than by
watching it: `setAccessibilityHeading(true)` and the text fields' autofill and IME flags. `uiautomator dump` does
not serialise any of them, and confirming them properly needs a screen reader and an autofill service on the device.

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
  All four ship in the APK as `assets/strings/<lang>.json`; Arabic was **seen** on the emulator, on the Map tab
  too — where the controls mirror and **the map itself does not**, because a mirrored Detroit is the wrong city.
- **The Map tab** (2026-09-21): the city, the greenway, our own listings by group, the eleven transport layers,
  a layer switcher, a text list, a card on tap, virtual accessibility nodes and a keyboard walk. **Seen** on the
  emulator in light and dark, in English and Arabic, at font scale 2.0, and with all eighteen layers on.
- **The Neighborhoods tab** (2026-09-22; Kyle, 2026-09-21: "not just on the web, in the apps too"). The index of
  the City's 205 neighborhoods — a filter, A–Z or by council district, and "Your neighborhood" when this app
  already holds a coarse fix or a typed ZIP — and a page per neighborhood with the web's panels in the web's
  order: help nearby by kind and the four nearest listed places, home sales beside building permits, conditions,
  the Safe streets crash panel with SEMCOG's notice in English, and the sources with their dates. The numbers,
  the outline, where a point falls, the order of the index and every formatted number are in `Hoods.kt`, which
  `:core` runs on a plain JDK; `HoodScreens.kt` only lays them out. The tab label is `tab.hoods` ("Areas") and a
  screen reader is told the whole word (`tab.hoods_wide`). **Seen** on the emulator in light and dark, in English
  and Arabic, at font scale 2.0, with a fix inside Detroit and one in Dearborn, and with a ZIP typed.
  - `indicators/neighborhoods.json` now ships in the APK snapshot (about 105 KiB compressed), so the tab works
    on first run with no signal; it stays lazy, read only when the tab is opened and checked against the signed
    index before a byte of it is decoded.
  - **"Your neighborhood" is a coarse answer.** This app only ever asks for `ACCESS_COARSE_LOCATION`, and Android
    fuzzes a coarse fix onto a grid of a kilometre or two — so on the emulator a fix in Corktown named Hubbard
    Richard, the neighborhood next door. That is the right trade (a neighborhood page is not worth a precise
    location) and the screen says the answer was worked out on this phone, but it is worth knowing: the name is a
    starting point, not a statement about where somebody is standing. Typing a ZIP is exact about what it is.
  - **No neighborhood number is formatted by a locale-aware formatter.** Grouping, decimals and dollars are
    arithmetic in `Hoods.kt` (`hoodDigits`, `hoodFixed`, `hoodMoney`, `hoodBigMoney`), so a phone, a laptop and a
    CI runner with a German default locale all print "9.9" and "$85,000". The rounding is done on the exact
    binary value with `BigDecimal`, which is what makes it agree with JavaScript's `toFixed` to the digit.
- **"Type a ZIP code"** (2026-09-22), wherever this app offers "Use my location": the Home and category lists and
  the Neighborhoods tab. The bundle carries one point per ZIP (`places/zips.json`, 37 of them) and the whole rule
  — five digits, Latin or Arabic-Indic or Bengali, known, and inside the four cities — is `Zip.kt` in `:core`.
  A typed ZIP is **memory only**: a field on the activity, never a file, never `savedInstanceState`, never a
  Route, never sent. **Seen** on the emulator: 48226 opens Downtown, 90210 says we do not know it.
- **"Add a place that helps"** (2026-09-22), from the Help screen and from a neighborhood page's "we haven't
  listed much here yet" panel. The same form as the web's, field for field, with each error beside the field it
  is about, said out loud and focused. The body is the closed eight-key schema `POST /v1/proposals` accepts
  (`Propose.kt`, tested against `api/src/validate.ts`'s own key list) — **nothing about the person is in it**: no
  install secret, no daily hash, no location, no identifier. With no signal it is queued in
  `outbox-proposals.json`, written atomically, and flushed on the next resume. **Seen** on the emulator: the
  queued path, the per-field errors, and the queue file holding exactly the four keys that were filled in.

Not built:

- Transit *screens* (the Transit app link above is a link-out on a listing, not a transit feature), City events,
  condition reports and photos.
- Link-outs (unemployment, Lifeline, child-care scholarships): the web app shows these on several need screens;
  Android lists places only, as the iPhone app does. The one exception is the 313SafeBeds card above the numbers
  on the shelter screen, whose words come from the strings files (`link.beds.safebeds.*`) like everything else.
  Two web refinements are link-outs and nothing else — "Help paying for food" and "I lost my job" — so they have
  no row here at all; `ParityTest` names them, so a new one cannot slip past unnoticed.
- A **lens** page for the Joe Louis Greenway neighborhoods. `Route.Hoods` carries the lens and the index filters
  by it, but no screen offers the row yet, and a greenway stretch has no "About this area" link to the
  neighborhoods it runs through as the web's does.
- Three string keys that would close the last gap between the two apps' wording: a word for "thousand", "million"
  and "billion". `hoodBigMoney` writes them in English in all four languages, which is what the web falls back to
  for Arabic and Bengali and differs only in Spanish ("$107.8 millones").

## Release blockers

1. ~~The `:app` half has never been compiled.~~ Done on 2026-09-20: it compiles, its tests pass, it assembles and
   it runs. See the two sections above for the five errors that first compile and first run found.
2. Two real pinned keys and a real `bundleBase` (the build refuses a release without them). Checked again with
   the SDK present: `:app:assembleRelease` stops at `checkReleaseKeys` and names what is missing. Since
   2026-09-20 the gate also refuses a public key of order 1, 2, 4 or 8 — under such a key an all-zero signature
   verifies any message — reading the eight points out of `Ed25519.kt` so the gate and the runtime check cannot
   disagree (see HIGH 2 above).
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

9. **Two things from the 2026-09-20 reviews are verified by reading, not by running**: the accessibility heading
   (LOW 11) and the text fields' autofill and IME flags (MEDIUM 9). `uiautomator dump` serialises none of them.
   Confirming them needs TalkBack and an autofill service on a device, which is the same session as release
   blocker 4.
10. **Rapid navigation can skip frames.** Every screen is rebuilt in code on every draw — there is no view recycling
   and no `RecyclerView` — so tapping between tabs as fast as possible skipped 81 frames once on this emulator. It
   is not a lock, a disk read or the network (all of those were moved off the main thread and measured at zero
   skipped frames while a flush was stalled), and it is the same cost the app has always had for opening a screen.
   A long list is the case to watch on a cheap phone.
7. **Cold start, mostly fixed, but never measured on an old phone.** The twenty-second wait of 2026-09-20 was
   found and dealt with — see "Cold start, and where the twenty seconds went" for the measurements, what changed
   and why the verify-once-per-version cache was rejected. What is *not* done: every number is from an emulator
   on an Apple-silicon Mac, and a 2016 phone is plausibly five to ten times slower. One software Ed25519
   verification has to be timed on a real cheap phone before a release (`-PdebugLikeRelease=true`, then
   `adb logcat -s Help313Timing`). Nothing about the check was weakened, and nothing will be: if the number on a
   real phone is bad, the next lever is reading each category when it is first opened (see "JSON, measured",
   which is also where the JSON reader, once the larger half of the wait, was measured and rewritten).
8. The "Bus directions in the Transit app" button has never been seen in its visible state, because that needs a
   phone with the Transit app on it. Its rule is unit-tested and its hidden state was checked; the tap itself has
   not been. DECISIONS keeps the question of Transit's linking terms **Open**.
