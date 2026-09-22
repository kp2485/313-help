# 313 Help for iPhone

Four parts:

- **`Sources/DetroitQuery`**: the rules for open now, next times, badges, ranking, search, greenway distances and — since 2026-09-22 — the streets graph, walking directions and whole trip plans. It is a Swift copy of `packages/query`, tested against the same `schema/fixtures` the web app uses. `swift test` runs on macOS, Linux and Windows: **203 fixture cases, none skipped**.
- **`Sources/HelpCore`**: the parts of the app itself that are not a screen — the install key and its daily dedupe hash, what a report is and what the Worker's closed schema allows, the outbox, the saved-places rules, the one session every request goes through, the signed-bundle check (key shape, the small-order deny-list, checksums, the downgrade floor), what a release build may ship, and **the map**: the projection, the bundle's own map-file format, the camera, hit-testing, which layers exist and how each is drawn, the never-drawn predicate and the reading order VoiceOver gets (`MapData.swift`, `MapLayers.swift`). No UIKit, no SwiftUI, no Combine, so `swift test` runs it too. **These used to live in `HelpApp/` and were tested only inside the git-ignored Xcode project, which meant CI never ran them** (iPhone review, 2026-09-20).
- **`HelpApp/`**: the SwiftUI screens (iOS 17). They compile and run in the iOS Simulator (first built 2026-09-20 on Xcode 27; re-verified the same day on iPhone 16 Pro / iOS 18.0). They have not been run on a real iPhone and have never been signed for a device.
- **`Tests/`**: `HelpCoreTests` (the app's own rules — since 2026-09-22 including `DirWordsTests`, the whole trip-plan wording contract in all four languages against the same table as `apps/web/test/directions.test.ts`, and `CityAreasTests`, the areas layer's hit test and reading order and the city page's allow-list), `DetroitQueryTests` (the shared fixtures) and `AppParityTests` — the needs list held to the web app's. Parity reads `HelpApp/Help.swift`, `apps/web/src/needs.ts` and `strings/*.json` as text and fails when the three disagree: a different need, a missing choice, a different category, a screen that gained or lost its **quick exit**, or a string key the app asks for and `strings/en.json` does not have. It compiles nothing from `HelpApp/`, so it runs with `swift test` and needs no Xcode. Because it reads both files as text, both write a need's own settings (`first`, `intro`, `emptyKey`, `quickExit`, `query`) **above** its `refine` list; keep it that way.

## The Areas tab IS a map (2026-09-22)

Kyle, 2026-09-22: *"The Neighborhood home should be a map view by default showing the full screen map zoomed into the polygon of the neighborhood that the user is in, with a list option up in the top right"*; then *"tapping on a neighborhood full screen should then animate-shrink the map to the top (with a back button top left)"*; then *"I want the map to disappear as the user scrolls down and have it still there when they scroll up."* The iPhone mirrors the web (DECISIONS 2026-09-22; `apps/web/src/areas.ts`, `cameraForArea` in `apps/web/src/map.ts`).

- **The landing** is the map filling the tab under the top bar and above the tab bar — Urgent help, the title and the tabs all stay, and nothing is made inert. Only the outlines are on it: no dot, no listing, no value-carrying fill.
- **Where it opens.** On the polygon the phone has worked out from a position, a typed cross street or the centre of a typed ZIP: `MapCamera.forArea` fits the rings with an **8 %** margin, never closer than **4 m per point** and never wider than the map's own 90 m per point. The area is the Detroit neighborhood that holds the point, else the city that does (`Indicators.area(containing:)`), so Hamtramck, Highland Park and Dearborn residents land on their own outline. It is highlighted and named ("You are in Eastern Market"). Nothing known: the location card over the anchor view, gliding to the polygon when it is answered — arriving without travelling under Reduce Motion. Outside the four cities: the plain "The map stays on the city."
- **Map | List** is two real buttons in the map's top corner, 44 points tall, each with `.isSelected` and a value a screen reader reads; it mirrors to the leading corner in Arabic, because the controls mirror and the map never does. The choice lives on `HoodsModel`, which is made once and dies with the app: **the map is the default every launch.** The list is the index the tab has always had, opening nearest-first when there is a point to measure from.
- **Opening an area** keeps the map: `AreaStripScreen` pins it as a strip **38 %** of the screen tall with the outline framed, a Back button ("Back to the map") and the name at its top **leading** corner, and the area's own page scrolling under it. Tapping another outline in the strip swaps the page rather than pushing a second screen. Reading down collapses the strip to a **48-point** bar and turning round brings it back (`stripAt`, an 8-point turn, a 320 ms settling period); the height is the only thing that changes, so the map stays in the view and in the accessibility tree and nothing ever moves the scroll position. Reduce Motion collapses and returns without travelling. The scroll offset comes from `onScrollGeometryChange` on iOS 18 and from a zero-height `GeometryReader` inside the scroll view on iOS 17, which is the deployment target.
- **The rules are in HelpCore** (`Sources/HelpCore/AreasHome.swift`: the landing table, the strip machine, the four numbers, the camera, and which area holds a point) and `Tests/HelpCoreTests/AreasHomeTests.swift` ports `apps/web/test/areas-map.test.ts` case for case. `Tests/AppParityTests/AreasHomeParityTests.swift` holds the numbers and the eight `hood.*` strings to the web's own files.
- **Fixed on the way (2026-09-22):** `Indicators.init(from:)` is hand-written and never decoded `cities`, `areas`, `area_sources`, `pavement_year` or `permit_years`, so **every city page was silently missing on the phone** however good the bundle was — the city rows in the index, the Dearborn and Hamtramck pages, and the city outlines the Areas map now lands on. The five lines are back and `CityAreasTests`' bundle cases run instead of skipping.

## The Neighborhoods tab (2026-09-21)

Public numbers about each of Detroit's 205 neighborhoods (docs/13), in a tab of its own — Kyle asked for one, "not just on the web, in the apps too". The tab bar is **Home · Help · Map · Neighborhoods**, with Events still hiding itself; the bar's label is the short word (`tab.hoods`, "Areas") because "Neighborhoods" does not fit a fifth of a phone bar at the accessibility text sizes, while the screen, its title and VoiceOver all say the whole word (`tab.hoods_wide`).

- **`Sources/HelpCore/Hoods.swift`** is the whole of the rules, so `swift test` runs them on Linux too: decoding `indicators/neighborhoods.json` (its bytes held to the checksum in the **signed** index before anything in it is believed), which neighborhood a point is in (ray casting, on the phone, against outlines that came with the bundle), the A–Z and by-district order, the search box, and how every number is written — a count under five as the words "fewer than 5", dollars with the sign in front in every language, a rate per 1,000 lots only when there is a count to show and at least a hundred lots to divide by.
- **`HelpApp/HoodsScreen.swift`** is the screens: a searchable index with an A–Z / by-district control and "Your neighborhood", and a neighborhood page carrying the web's panels in the web's order — help nearby, building and whether people can stay, conditions, Safe streets with SEMCOG's notice in SEMCOG's English, sources with dates. The outline is drawn with the Map tab's own `Canvas`; tapping it opens the Map tab centred there. Year tables become stacked blocks at the accessibility text sizes, and every cell reads as "2023, 14 Homes sold".
- The numbers file is fetched and decoded the way a map file is (`MapLoader.indicators`): lazily, off the main actor, checksum first, and kept for one bundle at a time.
- **Location** reuses the existing on-device flow (`Here`, `LocationChip`) and its refusal handling. The point stays in memory, is never written down and is never sent; a point outside Detroit's 205 — Dearborn, Hamtramck, Highland Park, the river — is answered in words with the Map tab offered, never by naming the nearest neighborhood.
- **Held to the web**: `Tests/HelpCoreTests/HoodTests.swift` runs the shared coordinates in `schema/neighborhoods/points.json` case for case, and `AppParityTests` fails when the panels of `apps/web/src/hoods.ts` and of this screen fall out of order, when the SEMCOG notice differs by a byte, or when the kinds of help drift from the pipeline's `HELP_TOPS`.
- **"Your neighborhood" from a typed ZIP** as well as from a location (`hood.mine_zip`): the bundle carries one point per ZIP, so the screen says which ZIP it looked in rather than calling the answer "yours". The shared `zip_cases` run in `ZipProposalTests`.
- **The nearest food, clinic, Narcan and indoor place open their listing** when the bundle says which one it is (`help.nearest_id`, 2026-09-21). The id has to be in the list this phone holds and the listing must not be private or sensitive, or the row stays a plain distance — the numbers and the listings are two files under one signature, so the category is checked again here (`HoodHelp.nearestListing`, HelpCore).
- **"Tell us what we're missing"** on the thin-coverage note opens the add-a-place form below.

## Add a place that helps (2026-09-21)

The Swift half of the web's add form and `apps/web/src/propose.ts`, reached from the Help tab's "More" and from a thin neighborhood page.

- **`Sources/HelpCore/Proposals.swift`**: the proposal, its closed JSON encoding, the four required answers, the size caps, and the two closed lists — the kinds of help offered (no domestic-violence shelter: that address must never be collected, docs/08) and the four ways of knowing. `swift test` holds the encoded body to exactly the eight names `parseProposal` accepts in api/src/validate.ts, and proves nothing about the person can be in it.
- **`HelpApp/AddPlace.swift`**: the form, and `Proposer` — the same outbox actor the reports use, in a file of its own, so a proposal made with no signal is kept and sent later. A proposal carries **no dedupe hash**: it is not deduplicated, so there is nothing to work out again when it goes, and the reports' re-nonce-at-flush rule does not apply.
- A missing required answer is marked on the field itself, announced, and the cursor goes to the first one — everything already typed stays.
- Checked against a stub Worker on localhost (2026-09-21): the body was `{name, category, what, how_known}` and nothing else, no cookie header, `User-Agent: 313Help-iOS/0.1`.

## Typing a ZIP instead of sharing a location (2026-09-21)

`LocationChip` now offers "Type a ZIP code" beside "Use my location", wherever the chip appears — the same pair the web has always had. `Sources/HelpCore/Zips.swift` decodes `places/zips.json` (checksum first), validates five digits, and answers `found` / `unknown` / `notAZip`; the ZIP and the point it stands for live in memory only, like a location, and go nowhere. The field deliberately sets **no** `textContentType`: postal-code autofill would have iOS offer this person's own home ZIP above the keyboard, which is their address appearing on a screen they did not put it on.

All of `Tests/` runs with `swift test` from `apps/ios`, which is what the `ios-query` job in CI runs. Two small groups are compiled out where they cannot run: the Ed25519 signature maths (CryptoKit is Apple-only, and this package takes no third-party dependency to get Ed25519 on Linux) and the backup flag (an Apple file attribute). Everything around both — the shape a pinned key may take, the eight small-order points, an all-zero signature, the downgrade floor, the dedupe hash, the report schema, the outbox, the saved rules — runs on Linux as well. **Run `swift test` on a Mac before shipping**; CI on its own does not exercise the signature maths.

## Building it

The Xcode project lives in `apps/ios/Xcode/` (`Help313.xcodeproj`, shared scheme `Help313`, product "313 Help", bundle id `org.help313.app`, deployment target iOS 17). That folder is still git-ignored (`apps/ios/.gitignore`), so a fresh clone has to recreate it; the steps under "Making the project again" below say how, and the project file itself is a small hand-written `project.pbxproj` if you would rather copy one. Everything the project *points at* — the Swift files, the asset catalog, the privacy manifest and the scripts — lives outside that folder and is in the repo. There is **one** target, the app: the tests are all in the SwiftPM package.

1. Build the data bundle first, from the repo root: `pnpm build:bundle` (a store build uses `pnpm build:bundle:release`, so the snapshot is signed with the release key). The build phase copies `data/bundle/v1` into the app, **checks its signature against the keys that configuration pins**, and fails a Release build if it does not match. A missing folder fails the build.
2. Open `apps/ios/Xcode/Help313.xcodeproj` in Xcode, pick an iPhone simulator, and Run. From the command line:
   ```sh
   cd apps/ios/Xcode
   xcodebuild -project Help313.xcodeproj -scheme Help313 \
     -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build
   ```
   Then `xcrun simctl install booted "<built>/313 Help.app"` and `xcrun simctl launch booted org.help313.app`.
3. `swift test` from `apps/ios` runs every test there is. `xcodebuild … test` has nothing to run: the scheme's Test action is empty on purpose.

### How the project is wired

- The `HelpApp/*.swift` files are referenced in place (`../HelpApp/…`), not copied. Editing them in Xcode edits the files in the repo. Today: `Help.swift`, `Views.swift`, `Screens.swift`, `BundleStore.swift`, `Config.swift`, `Reports.swift`, `Saved.swift`, `Palette.swift`, `HoodsScreen.swift`, `AddPlace.swift`, `Browse.swift`, the navigation work of 2026-09-22's five — `CrossStreet.swift`, `CityPage.swift`, `Directions.swift`, `DirectionsEntry.swift`, `RouteOverlay.swift` — and the Map tab's five: `MapScreen.swift`, `MapModel.swift`, `MapCanvas.swift`, `MapSubway.swift`, `MapPalette.swift`.
- `HelpApp/Assets.xcassets` (the app icon) and `HelpApp/PrivacyInfo.xcprivacy` are referenced in place too and are copied in by the Resources phase.
- `DetroitQuery` and `HelpCore` are local Swift package products from `apps/ios` (the `Package.swift` beside this README), linked into the app target.
- `strings/en.json`, `es.json`, `ar.json` and `bn.json` are referenced in place from the repo root (`../../../strings/…`) and land flat in the app bundle, which is what `L.table(_:)` expects. `Info.plist` lists the same four under `CFBundleLocalizations`, so iOS offers them in `Locale.preferredLanguages`.
- Build phase "Release preflight" (`Scripts/preflight.sh`, first phase, runs every build): does nothing for Debug; refuses a Release build whose origin or pinned keys are still placeholders, malformed, or a small-order point. See below.
- Run Script phase "Copy and check bundle snapshot" (runs every build, `ENABLE_USER_SCRIPT_SANDBOXING = NO` so it may read outside the project folder). It copies `data/bundle/v1` in, then runs `Scripts/verify-snapshot.swift` against the keys **this configuration pins**:
  - the snapshot's `index.json.sig` must be a good Ed25519 signature over `index.json` by a pinned key, and every file must match its checksum. A Release build that does not is **failed**; a Debug build only warns, so a laptop with a half-built bundle can still run the app.
  - it writes the snapshot's own `generated_at` to `bundle-floor.txt` in the app bundle. `Config.snapshotFloor` reads it and `BundleCheck.refusesOlder` treats it as the oldest list this build will ever accept, so a **fresh install** cannot be handed a correctly signed but months-old bundle (before, a phone that held nothing had nothing to compare against).
  - it runs `swift` with `SDKROOT` unset: inside a build phase that variable points at the iOS SDK, and the script is a small macOS program.

### Where this build talks to (per configuration)

Nothing is hardcoded in the Info.plist. `Info.plist` (Debug) and `Info-Release.plist` (Release) both read `$(DC_…)` build settings, and `HelpApp/Config.swift` reads them back at runtime.

| Setting | Debug | Release |
|---|---|---|
| `DC_RELEASE` | `NO` | `YES` |
| `DC_BUNDLE_BASE` | `http://localhost:5173/data/bundle/v1/` (`pnpm dev` in `apps/web`) | `https://set-this-domain.invalid/data/bundle/v1/` — **placeholder** |
| `DC_API_BASE` | `http://localhost:5173/` (Vite proxies `/v1` to the Worker) | `https://set-this-domain.invalid/` — **placeholder** |
| `DC_PIN_ACTIVE` | the dev public key, derived from `.keys/dev-ed25519.pem` the way `apps/web/vite.config.ts` does it (`openssl pkey -in .keys/dev-ed25519.pem -pubout -outform DER \| base64`) | `SET-RELEASE-KEY-ACTIVE` — **placeholder** |
| `DC_PIN_SPARE` | empty (Debug pins one key; empty entries are dropped at runtime) | `SET-RELEASE-KEY-SPARE` — **placeholder** |

`Info.plist` also carries `NSAppTransportSecurity` → `NSAllowsLocalNetworking`, **only** so the local `http://localhost:5173` refresh works. `Info-Release.plist` does not have it, and a Release build's Info.plist was checked to confirm it (2026-09-20).

**To configure a release** (Kyle): set `DC_BUNDLE_BASE`, `DC_API_BASE`, `DC_PIN_ACTIVE` and `DC_PIN_SPARE` on the Release configuration to the real origin and the two values of `BUNDLE_PUBLIC_KEYS` (docs/OPERATIONS.md). Until then `Scripts/preflight.sh` fails the build with, for example:

```
error: Release build refused: DC_BUNDLE_BASE is still the placeholder. Set the real origin on the Release configuration (docs/OPERATIONS.md).
error: Release build refused: DC_PIN_ACTIVE is not a 44-byte SPKI Ed25519 public key (expected 60 base64 characters, got 5)
```

It refuses: an empty or non-https origin, the placeholder host, fewer than two keys, the same key twice, the placeholder keys, the development key, anything that is not a whole 44-byte base64 SPKI Ed25519 public key (the header `302a300506032b6570032100`, which is `MCowBQYDK2VwAyEA` in base64), and any of the **eight small-order Ed25519 points**, which "verify" a signature nobody made. The same rules are in Swift in `Sources/HelpCore/{Verify,ReleaseRules}.swift` and are covered by `ReleaseRuleTests` and `BundleCheckTests`, including a test that reads `preflight.sh` and `verify-snapshot.swift` as text and fails if the three lists drift apart. Neither the script nor the app ever writes or invents a key: generating and holding the release private keys is Kyle's job. Checked 2026-09-20: `DC_PIN_ACTIVE=hello` and a pinned small-order point each exit 1; two well-formed distinct keys with an https origin pass.

### Making the project again (or by hand in Xcode)

1. File → New → Project → iOS App, named "313 Help", interface SwiftUI, language Swift, saved in `apps/ios/Xcode/`.
2. Delete the generated `ContentView.swift` and the `…App.swift` file. Drag in **every** Swift file from `HelpApp/` (twenty-one today: the list under "How the project is wired"), choosing **Create groups** and leaving **Copy items** unticked. Drag in `HelpApp/Assets.xcassets` and `HelpApp/PrivacyInfo.xcprivacy` the same way.
3. File → Add Package Dependencies → Add Local… → select `apps/ios`. Add **both** the `DetroitQuery` and `HelpCore` libraries to the app target.
4. Drag `strings/en.json`, `es.json`, `ar.json` and `bn.json` in from the repo root, without copying. Add a first Run Script phase containing `"$SRCROOT/../Scripts/preflight.sh"`, and a last Run Script phase "Copy and check bundle snapshot":
   ```sh
   set -eu
   RES="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
   SNAP="$RES/bundle-snapshot"; FLOOR="$RES/bundle-floor.txt"
   rm -rf "$SNAP"
   cp -R "$SRCROOT/../../../data/bundle/v1" "$SNAP"
   : > "$FLOOR"
   if [ "${CONFIGURATION:-Debug}" = "Release" ]; then
       env -u SDKROOT swift "$SRCROOT/../Scripts/verify-snapshot.swift" "$SNAP" "$FLOOR" "${DC_PIN_ACTIVE:-}" "${DC_PIN_SPARE:-}"
   else
       env -u SDKROOT swift "$SRCROOT/../Scripts/verify-snapshot.swift" "$SNAP" "$FLOOR" "${DC_PIN_ACTIVE:-}" "${DC_PIN_SPARE:-}" || echo "warning: the snapshot does not verify against this build's pinned keys"
   fi
   ```
5. No test target. The tests are `swift test` in the package; leave the scheme's Test action empty.
6. Set `INFOPLIST_FILE` to `Info.plist` for Debug and `Info-Release.plist` for Release, add the `DC_…` settings from the table above, set `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`, the deployment target to iOS 17, and iPhone only.

### The app icon

`HelpApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png` is generated locally, not downloaded:

```sh
swift apps/ios/Scripts/make-icon.swift apps/ios/HelpApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png
```

It draws the web app's mark (`apps/web/public/icon.svg`): the deep-green square, a white pin, a green cross cut out of it. One 1024×1024 opaque image, which is all iOS 17 and later need.

### The privacy manifest

`HelpApp/PrivacyInfo.xcprivacy` declares no tracking, no tracking domains, no required-reason APIs, and **one** collected data type: "Other user content" (`NSPrivacyCollectedDataTypeOtherUserContent`), not linked to identity, not used for tracking, for App Functionality. That is the optional note a person may type on a report: it is transmitted off the device and kept in D1 for 180 days, which is what Apple means by "collect", even though the note is about a place rather than about the person. docs/08 ("App Store / Play review notes") says to declare User Content for exactly this, and the manifest used to declare nothing at all (iPhone review, 2026-09-20).

Nothing else is declared and nothing else may be: a location is used on the device to sort by distance and is never written down or sent, saved places never leave the phone, there is no analytics code and no third-party SDK, and the app keeps its own state in files it creates rather than in `UserDefaults`. **If any of that changes, the manifest changes in the same commit** — including adding `PhotosorVideos` if photo condition reports ever ship (docs/11).

## What this app keeps on the phone, and how

- `Library/Application Support/state/` holds the random install key, the outbox, and the saved list. The directory is marked **excluded from backup**, and the flag is re-applied at every launch, because a directory that is recreated comes back without it. Without that flag the install key — the one secret this app has — went into an iCloud or Finder backup and was restored onto whatever phone the person signed in to next, which is the opposite of what docs/08 promises (iPhone review, 2026-09-20). On a phone the files are also written with complete file protection, so they are unreadable while the phone is locked.
- The verified copy of the signed list lives in `Library/Caches/bundle/`, where it is never backed up and the system may reclaim it. It used to sit in Application Support beside the key.
- Nothing is written with a silent `try?` any more: a key that could not be written, a key file that exists and cannot be read, and a report that could not be queued all reach the screen as themselves. "Make a new key" never says "Done" unless a new key is on disk.
- Every request the app makes — the bundle GETs and the report POSTs — goes through **one ephemeral `URLSession`** with no cookie store, no cookies accepted or sent, no URL cache and no credential storage, identifying itself as `313Help-iOS/<version>` and nothing else. It used to be `URLSession.shared`, which keeps cookies: a server could have handed this install a stable identifier (iPhone review, 2026-09-20).

## What the iPhone app does and does not do yet

It does:
- Home with active alerts and the bundle-age banner; the Help needs list in its three groups; refine screens; results ranked by the shared rule, with "Use my location" (asked on the tap, held in memory, never sent). The needs, their choices and their categories are exactly `apps/web/src/needs.ts`, and `AppParityTests` fails if they stop being. "I need a doctor" offers, in this order, the emergency room (which leads with 911), urgent care, a doctor or nurse, Health Department programs, a dentist and eye care.
- Urgent help from every screen, with 911 and 988 hardcoded; the overdose screen with 911 first and no list of places; DV, crisis, treatment and assault screens with numbers before any list and no distance.
- **A privacy shield and a quick exit** (2026-09-20). The whole UI is covered by a plain branded panel whenever the app is not active, so the picture iOS keeps for the app switcher can never show a DV, crisis, treatment or assault screen (docs/08, audit A8). On those four needs and on every private listing, the top bar carries **"Leave this page fast"** in place of Urgent help — the same swap the web app's top bar makes — which throws away every navigation stack, returns to Home, and opens `https://www.weather.gov/`, the same neutral page `location.replace` sends the web app to. A private listing also keeps its name off the navigation bar (the bar shows "313 Help") and prints it in the page instead, so a parent screen's Back button does not carry it. `AppParityTests` holds the four needs to `apps/web/src/needs.ts`, and to the one list `HelpCore` keeps.
- **The Map tab** (2026-09-21): a full-screen map of the city, edge to edge under the status bar, with the tab bar left in place so leaving it is one tap. See "The Map tab" below.
- Listing details, search, greenway segments with help nearby, City events (dormant: the bundle has no events).
- Loading the signed bundle: signature and checksums checked, an older bundle refused — including one older than the snapshot this build shipped — a verified copy kept in Caches, and the shipped snapshot as the first-run fallback. A pinned key must be a whole 44-byte SPKI Ed25519 key and never a small-order point, and an all-zero signature is refused before any maths.
- **Reports** (2026-09-20). "Still open, info is right" or one of the correction kinds on a listing; "Looks good today" or a things-only condition report on an open greenway segment. What leaves the phone is a target id, a kind, an optional 280-character note, a minute-precision time, and `sha256(install key ‖ target ‖ Detroit day)` — the Worker's closed schema and nothing else. A report that can't be sent waits in an outbox on the phone (newest 50) and goes out at the next launch or when the app comes back to the front. **The day-hash is worked out again at the moment a queued report is actually sent**, from the key the phone has then, so a report that waited across "Make a new key" cannot be joined to anything sent before it (this is `withCurrentNonce` in `apps/web/src/report.ts`). Two flushes at once (launch, and coming back to the front) can no longer send everything twice: an actor does not hold its isolation across an `await`, so the outbox has a `flushing` guard.
- **Saved places** (2026-09-20). Listing ids on this phone only, newest first, 100 at most, cleared with one tap. Never for a DV, mental-health-crisis, treatment or sexual-assault listing: those listings simply have no Save button.
- **Places that publish a point but no street address** (2026-09-20) — the 26 Wayne County naloxone and test-strip stations (`sal_wws_*`, `harm.supplies`). Directions go to the coordinate instead of being hidden, and "Where" says, in the source's own name, that it gives no street address (`detail.where_no_address`). **A coordinate is never printed as if it were an address.** A listing with no published phone shows no Call button. The rules are in `Sources/HelpCore/Listing.swift` and covered by `ListingTests`, including that a DV or crisis listing is never handed to a maps app at all.
- **Links built out of somebody else's text are escaped strictly** (2026-09-20). `Directions` and the Transit link percent-encode everything but letters, digits and `-._~`. `.urlQueryAllowed` let `&`, `=`, `+` and `#` through, so a listing whose address read `100 Main St&from=42.3,-83.0` would have added a second parameter — an origin — to the maps link, which docs/08 says we never send (iPhone review, 2026-09-20).
- **About and Your privacy** (2026-09-20), reachable from the bottom of Home. About shows the list version, its date and whether it was signed with the release key or a test key; Your privacy has the plain-language table from docs/08, **how many reports are still waiting** with a control to delete them unsent, and **"Make a new key"**, which throws the install key away and makes a new random one.
- English, Spanish, Arabic and Bengali, following the phone's language. am/pm come from `clock.am` / `clock.pm` and list separators from `list.sep`, so an Arabic time reads "2 م" rather than "2 pm".

- **Our own directions, the areas layer, the city pages and the cross-street field** (2026-09-22). The whole of
  the navigation audit's deferred list; see "The navigation work of 2026-09-22" below.

Not yet: link-outs beyond the one 313SafeBeds card, archived listings on search, a listing's own alerts on its detail screen, an in-app language switch, photos on condition reports. The age banner is on Home and Saved places but not yet on every list and listing. These screens exist in the web app; the iPhone can open the web app for them until they are ported.

## The navigation work of 2026-09-22

`docs/NAVIGATION-AUDIT-2026-09-22.md` found that on this phone *screens got built and entry points did not*. What
has landed here so far, and what has not.

### Done

- **The directions rules** (`Sources/DetroitQuery/{Streets,Walk,TransitPlan}.swift`), a case-for-case port of
  `packages/query/src/{streets,walk,transit-plan}.ts`: the noded street graph, the half-edge A\* with its 40 m
  turn penalty and the City's own safety-byte penalties, and whole trip plans of walking and riding legs. The
  13 fixture cases the Swift runner used to **skip** now run — `fixtures: 203 cases, 0 failed, 0 skipped` — and
  the runner fails if that skip count is ever anything but zero. `RoutingRealTests` runs the same bounds as
  `packages/query/test/routing-real.test.ts` against a built bundle and skips without one; the two
  implementations agree exactly on the committed basemap (23,863 nodes, 40,342 edges, 45 components). The graph
  is built off the main actor and cached by `StreetGraphCache`, keyed by the map files' own sha256.
- **`Sources/HelpCore/Intersections.swift`** — "type a cross street", resolved on this phone from the street
  geometry the signed bundle already carries. The parse table, the name normaliser, the 120 m junction merge
  and the where-words are the web's, and `IntersectionsTests` runs the same table plus the real streets. What a
  person types lives in one object that dies with the screen; the cache is keyed by the *normalised* names.
- **The anchor view**: `mapAnchor` is the web's `MAP_ANCHOR`, 0.6 mile up Woodward from City Hall, and one
  radius — two miles — for both the first open and "centre on me" (Kyle, 2026-09-22).
- **Browse by type on the Help tab** (audit C2). The 19 chips of `apps/web/src/needs.ts`, in that order, folded
  away as the web folds them. Before this there was **no** browse path here at all, so the five shower listings
  and the nineteen for young people could only be reached by already knowing a name to type into Search.
- **Parks and paths** (audit H4; Kyle's direction (b)): one front door for the whole park system, with a page
  for each of the 302 City parks — kind, acres, the address where the City publishes one and an honest line
  where it does not, Directions, the greenway stretch within half a mile, and the help within a ten-minute
  walk. The greenway is one row inside it, and its screen and its 52 stretch screens are untouched.
- **One Home** (audit M1, M2, H7, L1): six quick needs in docs/05's order, led by Food; "Find free help"
  *selects* the Help tab instead of pushing a second copy of it into Home's stack; Map, Parks and paths and
  Your area as tiles; Saved places under Help → More only.
- **The Map tab opens with help on it** (audit H2), matching the web's `DEFAULT_LAYERS`: all eight help groups
  and the parks; the greenway and the bus routes off. Verified on simulator `58DF0CC6` from a fresh install.

`AppParityTests` holds the chips, the quick-need order, the first-open layers, the tab set and Home's own
controls to the web's files, so none of the six can drift back.

### Done, part two: the screens (later on 2026-09-22)

The five things the list below used to say were waiting. Every one of them mirrors the web's own files — the
Directions screen is `apps/web/src/{dirwords,dirscreen,dirfiles,dirworker}.ts`, the areas layer and the city
pages are the `areas` halves of `apps/web/src/{map,hoods}.ts`, and the cross-street field and the slow-GPS
banner are `locChip`, `crossBox` and `slowBanner` in `apps/web/src/main.ts`.

- **The cross-street field on the location card** (`HelpApp/CrossStreet.swift`). `LocationChip` now offers all
  three ways in — "Use my location", "Type a cross street", "Type a ZIP code" — wherever it appears, and the
  junction is resolved on this phone from the street geometry the signed bundle already carries
  (`HelpCore/Intersections.swift`). Two streets that cross more than once are a short list to pick from, named
  by the end of the street they are at; a street we do not know, and a pair that never meets, are sentences.
  What is typed lives in one `@State` that dies with the screen.
- **The slow-GPS state.** `Here` keeps listening for **five minutes** (`startUpdatingLocation`, not
  `requestLocation`, which gives up on its own in ten seconds), says "Still looking…" after ten
  (`locateSlowSeconds`) with what would help and a real **Stop**, and a fix that lands after Stop is dropped on
  the floor — so it can never move the map out from under somebody who has since typed a cross street.
- **The `place:areas` layer** (`HelpCore/CityAreas.swift`, painted in `MapCanvas.swift`). The four city outlines
  and Detroit's 205, dashed so a boundary is never mistaken for a street, named once their own name fits
  (`areaDetailMetersPerPoint`, the web's `AREA_DETAIL_MPP`), and the one that was tapped washed — **never a fill
  that carries a value**. A tap picks the smallest outline holding it, so a neighbourhood beats the city it sits
  inside, and Detroit's enclaves are holes rather than parts of it. The pick order is the web's — dot, glyph,
  stop, greenway, route, **area**, park — and the VoiceOver order is segment → area → dot (`orderFeatures`).
  Off by default on the Map tab; the Areas tab opens with it on.
- **The Areas tab lands on a map** (`HelpApp/CityPage.swift`, `AreasMapView`), with the index as the second view
  behind "See this map as a list" and **"Nearest first"** offered there whenever a location, a typed ZIP or a
  typed cross street is known (`hoodsNearestFirst`, which is still not a ranking — docs/13, rule 1).
- **City pages** (`CityPageView`): six panels, drawn **only** when this area's own `panels` allow-list names
  them, in `cityPanels` order, each printing its own source, its own "Records from…" and its owner's own
  required notice — SEMCOG's four panels each carry SEMCOG's sentence with SEMCOG's own year. `missing` is one
  plain sentence; Table | Chart works on the permits panel like every other year panel.
- **"Getting around" as a labelled row and the location control on the Map tab** (audit H3, M6): both sit under
  the round buttons at the top, where the keyboard the cross-street field opens cannot reach them.
- **The Directions screen** (`HelpApp/Directions.swift`, `DirectionsEntry.swift`, `RouteOverlay.swift`;
  `HelpCore/DirWords.swift`). Reached from a listing's own screen (the primary button, with the maps-app
  link-outs moved under "Other apps"), from every results row and the safe-now list, from a park page and from
  the map's own card, where "Directions" comes first as it does on the web. The start is a position, a cross
  street, a ZIP or the question — **with the cross-street field open and first**, because it is the only one of
  the three that works with no satellite and no signal, and this is the screen a person with neither is on. The
  street graph is built off the main actor, once per bundle, while the screen says "Getting the map ready…";
  `plan()` gives up to three itinerary cards; choosing one draws the route on a `Canvas` — walking solid in the
  walk token, rides in the agency's colour with the ride dash, over a casing, the active leg thicker, and start,
  board, alight and end markers with an inner ring on the two that involve a bus — beside the numbered steps,
  which are the source of truth. Follow-along is `CLLocation`, the current step and `offRouteMetres` (120 m) and
  nothing else: **there is no rerouting**, by design. The caveat pair is on every state of the screen, including
  the one that is still thinking.

**Traceless.** Nothing about a trip is written anywhere: not the destination, not the origin, not the plan. The
destination is a value on a navigation stack; the origin lives in `Here` for as long as the app is open and is
passed to `plan()` and to nothing else. The privacy shield covers this screen like every other, and a sensitive
listing — a DV shelter, a crisis line — carries no coordinate and gets no Directions button at all.

### Not done yet

- Photos on condition reports, an in-app language switch, archived listings on search, a listing's own alerts on
  its detail screen. The age banner is on Home and Saved places but not yet on every list and listing.

## The Map tab

One tab, one map, drawn by this phone. **No tile server is ever contacted and no map company learns where a
person is looking** (DECISIONS 2026-09-18, "The app draws its own street map from City of Detroit open data").
MapKit is not used for the map: its tiles are somebody else's server. The map works with no signal at all, from
the snapshot shipped inside the app.

**The first open** (2026-09-21): the tab draws **our own card** over the map — "See what is near you?", "Your
location stays on this phone. We never send it or save it.", **Use my location** · **Not now** — before iOS is
asked anything. Only that button calls `requestWhenInUseAuthorization`, and only ever coarsely
(`kCLLocationAccuracyHundredMeters`; reduced accuracy is accepted and `requestTemporaryFullAccuracy` is never
called). A fix inside the four cities moves the camera to a **two-mile radius** (`MapCamera.forRadius`, tested
in HelpCore), instantly under Reduce Motion; a fix outside them moves nothing and says so. The card is not
`.isModal` — the map keeps working behind it — and its elements are read first. The decision is
`firstOpenAction` in `HelpCore/Locate.swift`, shared word for word with the web and Android; the only thing
stored is a boolean in `LocateFlagStore` (`map-locate.json`, in the excluded-from-backup state directory).
**The Info.plist purpose string** (`NSLocationWhenInUseUsageDescription`, in the git-ignored `Xcode/` folder)
should read: *"Your location stays on this phone. It sorts the list by distance and centres the map near you,
and is never saved or sent."*

**What it draws**, in the web app's order and style (`apps/web/src/map.ts` is the original):

- the four cities' outlines — a change of shade **and** a stroked line, because two pale fills a step apart are
  not a boundary anyone can see (accessibility audit 2026-09-20, item 10) — parks, and the streets, with small
  streets and street names appearing as you zoom in;
- the **Joe Louis Greenway** like a transit line: one width the whole way, a casing under it, a colour **and a
  dash pattern** for each phase, station dots where stretches meet, and the chosen stretch bright with the rest
  dimmed;
- our own listings as dots, one colour per help group;
- the transport layers — DDOT and SMART routes and stops, QLINE, People Mover, MoGo, bike lanes, the stations,
  intercity coaches (their own style, so they are not mistaken for a bus network) and park-and-ride. The two
  five-thousand-point stop layers wait until the map is close enough for a stop to be a place rather than a
  smear; the switcher says so and the list shows them at any zoom.

**Sensitive and private listings are never drawn.** Help with drugs or alcohol and help after sexual assault are
dropped as whole kinds, and a domestic-violence shelter or a mental-health crisis line is dropped row by row —
including one that somehow carries a coordinate. The rule is one function, `mapDrawable` in
`Sources/HelpCore/MapLayers.swift`, used by the dots, by the tap test and by the map's own list, and
`MapLayerRuleTests` holds it to a fixture of the exact rows it must refuse.

**What is verified before it is drawn.** `map/base.json`, `map/streets.json` and each `map/transit/*.json` are
read from the verified copy on this phone, else the snapshot inside the app, else the published origin — and in
every case the bytes must match the checksum in `index.json`, which a pinned key signed. A file that does not
match is not used. Reading and decoding happen on an actor off the main actor (`MapLoader`), and the decoded
city is kept in memory for the session.

**How it is used.** Drag to pan, pinch to zoom, double-tap to zoom in, and on-screen **+ / −**, "back to the
starting view" and "use my location". Location is asked for **only** when that button is tapped (When-In-Use),
is held in memory, is never written down or sent, and a refusal is answered in words. Tapping a greenway stretch,
a listing dot, a stop, a route or a park opens a card in a bottom sheet — the map keeps working behind it — with
the thing's name, what it is in words, a **Call** button with the number visible, and a button into the full
screen. "What to show on the map" is real `Toggle`s in the web app's three groups; the choice is a file in the
app's own state directory (**not `UserDefaults`** — the privacy manifest declares no required-reason API) and is
never sent.

**Accessibility.** A `Canvas` is one opaque picture to VoiceOver, so the things on it are also real buttons:
`.accessibilityChildren` offers the greenway stretches south to north, then the listing dots nearest the middle
of the screen first, each labelled ("Joe Louis Greenway, Conrail (Warren to Joy), Open to walk and bike. See
details") and each doing what a tap does. **"See this map as a list"** is a persistent control, not a hidden one,
and shows everything switched on in words — the greenway list among it, which is how that screen is now reached.
The zoom control is one `.accessibilityAdjustableAction`; every floating button is 44 points, carries a label, a
Voice Control name and a Large Content Viewer entry; phases are told apart by dash pattern and by words, statuses
by words. The floating buttons' symbols are a fixed size (the Large Content Viewer shows them big instead), but
every word in the cards grows to AX5 and a phone number is never cut short. Urgent help is a floating button on
this tab, since the map has no navigation bar; the privacy shield and the quick exit are unchanged.

**Frame time** is logged in Debug only (`MapFrameClock`, a plain average over 30 frames; nothing is written to
disk and a Release build has none of it). Paths are batched per layer — one path per road class, one for a whole
bus network, one for every stop — rather than filled point by point, and street-name widths are measured once per
name and kept, which was most of a frame.

### Two map styles: `standard` and `subway` (docs/MAP-STYLE.md)

The transport layers can be drawn two ways. **`standard` is the default and is exactly the drawing above**;
`subway` is the metro-diagram look — one line per route in its own colour, badges, white stations, pills where a
rider can change, rings where a route ends — and a person picks it in the layers sheet ("Map style", above
"Getting around"). The choice is in the same excluded-from-backup file as the layer choices
(`state/map-layers.json`, now `{"on": […], "style": "subway"}`; yesterday's bare list still reads), never in
`UserDefaults`, never sent. It applies at once and is announced (`map.style_say`). **The control is not offered at
all when the bundle carries no `map/transit/<id>.net.json` files.**

- **Where the rules live.** `Sources/HelpCore/MapStyle.swift`, pure and Linux-clean: `mapStyle`, `zoomBand`
  (30 / 12 m per point, 5 % hysteresis), the `--tr-*` palette and the quietened basemap **as numbers** (so the
  tests compute the spec's contrast tables from them), table 7.1's widths, `resolveTransitStyle` (style × layer ×
  route × band × colour scheme × Increase Contrast → stroke, casing, inlay, marker, badge), the `.net.json`
  decoder (format 2 only; anything else throws and the layer stays `standard`), per-run Douglas–Peucker,
  `offsetRun` (left of travel, mitre limit 2), `roundCorners` (one quad per corner), `badgeAnchors`,
  `claimBadges` (24 a frame), `stationsFor`, `subwayHitTest` (44-point boxes, a second tap cycles),
  `featureOrder` (VoiceOver's order is only ever appended to) and `basemapTokens`.
  `HelpApp/MapSubway.swift` only paints what those answer.
- **`standard` is untouched, and a test says so.** `StandardStyleTests` holds the eleven-row table of spec
  section 2, proves the resolver's `standard` answer is the old table and the old two width functions whatever
  route, band, scheme or contrast it is handed, and proves `netFilesWanted` is empty in `standard`. In the
  painter, the standard passes skip only an overlay marked `subway`, and an overlay is marked so only when the
  style is chosen **and** that layer's network file is held (`drawnStyle`).
- **Loading.** A network file is asked for only in `subway`, only for a layer that is on (or the stops of a
  selected route), through the same `MapLoader` path as every map file: verified copy, shipped snapshot, origin —
  **sha256 against the signed index before a byte is decoded** — then decoded and prepared for all three bands
  off the main actor (62 ms for both bus networks in a Debug build on a laptop). While it is coming the layers
  sheet shows a spinner and the layer is drawn `standard`; if it cannot be read the layer **stays `standard`**
  and the existing "could not load · Try again" line says so.
- **Colour is read from the data** (`routes[i].tone` → `--tr-N`); agency colours are carried and not drawn
  (Kyle, 2026-09-21). `frequent` is whatever the file says. Side-by-side offsets and trunks are read from `runs`
  and `trunks`: the phone does no bearing logic. The QLINE line ships as drawn through its stations, and the key
  and its route card say so in words (`map.key_qline`) because the data marks it `derived`.
- **Colour is never the only carrier.** SMART has a light stripe, the QLINE has ties, the People Mover has
  chevrons the way it runs, bike lanes are a double line, MoGo / Amtrak / coach / park-and-ride are four
  different shapes, every route has a text badge, and the key says all of it in words with a drawn sample.
  **Increase Contrast** (`colorSchemeContrast == .increased`) switches to the spec's high-contrast tones, adds a
  point of casing and half a point of ring, and **never quietens the basemap**; the basemap is quietened only in
  `subway` with a network layer on. **Reduce Transparency**: a selected route fades nothing; its dark
  under-stroke and extra width still mark it.
- **Selection.** Tap a line (22 points; the drawn, shifted line is what is tested): it is drawn last with a
  dark under-stroke, every other transit line, badge and station goes to 35 % as one layer, its stops appear,
  and the card shows "4 Woodward · DDOT", "Frequent route", the agency's own weekday figure worded as theirs,
  the stop count, where it ends, and **one link: the owner's trip planner** — the same link "Getting around"
  carries (`TransitFacts.planner(forSystem:)`). On a trunk the card lists the routes and each is a button. A
  station lists the routes that stop there; an interchange and a hub say where you can change. No real-time
  data, ever. The greenway stays above every transit line in both styles.
- **Speed.** Paths are built once per zoom band **and scale bucket** (an eighth of an octave: a drag reuses
  everything, a pinch rebuilds a few times; offsets are then within 4.5 % of exact), **one `Path` per route**,
  kept in map units and stroked through the camera's transform with widths divided by the scale, so a frame
  copies no geometry. Badge widths are measured once per string.
- **The list is identical in both styles**, and reads the standard layer files only.

**"Getting around"** is now in "See this map as a list" (both styles): trip planners, fares, free rides, phone
numbers (real `tel:` rows), the MoGo Access Pass and the Transit app link-out. It is a Swift copy of
`apps/web/src/transit.ts` (`Sources/HelpCore/TransitFacts.swift`) and `TransitFactsTests` fails when a link, a
number, a sentence, a `system` mark or the `checked` date differs. Every link-out names its owner (the host)
before the tap and opens with `openURL`.

**A closed listing now says the day by name** — "Closed now. Next: Friday, Sep 25 3:30 pm", "Tomorrow", "Today" —
as the web's `dayName` does, through `DayWords` in HelpCore (tested, including Spanish and Arabic-with-Western-
digits), instead of printing "2026-09-25".

**Debug-only launch arguments** (`MapStage`, compiled out of Release) put the map somewhere known so a
screenshot or a frame-time run can be repeated: `-mapTab`, `-mapStyle subway`, `-mapLayers ddot_routes,qline`,
`-mapAt 42.3314,-83.0458,8`, `-mapSelect ddot_routes:rt_ddot_4`, `-mapSheet layers|list`,
`-mapSheetScroll style`, `-mapBench` (drags the map in a circle for ten seconds).

### Verified in the simulator, 2026-09-22, the navigation work (iPhone 16 Pro, iOS 18.0, `58DF0CC6`)

- The Map tab opens with the three ways in under the round buttons and a labelled **Buses and getting around**
  row. "Type a cross street" → "Woodward and Warren" resolved on the phone, the map moved there, and every list
  then read "Sorted by distance from Woodward & Warren".
- The **Areas** tab landed on the outlines map. Tapping Dearborn washed its outline and opened a card —
  "Whole city · Dearborn · See details" — and the page drew the help, parks, crashes, roads, vacancy and permits
  panels in that order, each with its own source line, "Records from Michigan's Transportation Asset Management
  Council", and SEMCOG's own notice with its own year on each one (© 2025 on pavement, © 2024 on the 2020
  Census totals, © 2026 on parks).
- **Directions** from the safe-now list ("From Woodward & Warren") and from a map card ("From where you are",
  with `xcrun simctl location`, cleared afterwards): three cards — Walk, Bus 851, Bus 8 then bus 4 — with the
  range, the agency's own headway and the caveat pair. The walking route drew magenta over the real streets with
  start and end markers; the bus route drew the walk legs solid and the 851 in SMART's colour with the ride
  dash and an inner ring on the boarding and alighting markers. **Follow along** highlighted step 1 and the
  button became "Stop following".
- **Arabic** (`-AppleLanguages "(ar)"`): the whole of Directions mirrors, the numbers stay Western, the place's
  own name stays one left-to-right run, and the map does not mirror.
- **Dynamic Type AX3** (`simctl ui content_size accessibility-extra-large`): the location card and the
  "Buses and getting around" row grow and wrap, and nothing is cut short.
- **Not verified here: VoiceOver's own reading of the new elements** — the UI-inspection tools in this
  environment still cannot read a live tree (see below). The area outlines and the step list are ordinary
  SwiftUI elements with the labels the tests hold.

### Verified in the simulator, 2026-09-21, subway style (iPhone 16 Pro, iOS 18.0)

- Both styles, light and dark, at the Woodward corridor (mid), downtown with the People Mover loop and its
  chevrons (near), Rosa Parks Transit Center (trunks and stacked badges) and the whole city (far: frequent and
  rail badges, trunk badges, offsets off); route 4 and the QLINE selected; Increase Contrast light and dark;
  Arabic (sheet and card mirror, **the map and its badges do not**); AX3 text (badges grow to × 1.5, the card's
  words grow and scroll); the key with its samples; "Getting around" in the list.
- **Frame time while dragging**, Debug build, simulator, DDOT + SMART routes with the greenway and parks
  (`MapFrameClock`, average / worst of 30-frame windows):

  | band | `standard` | `subway`, first version | `subway`, as shipped |
  |---|---|---|---|
  | far (60 m/pt) | 3.2 / 4.9 ms | 3.5 / 6.4 ms | 3.2 / 6.9 ms |
  | mid (20 m/pt) | 5.7 / 8.9 ms | 11.9 / 21.9 ms | **7.2 / 17.1 ms** |
  | near (8 m/pt) | 7.3 / 10.9 ms | 16.4 / 32.4 ms | **10.3 / 22.9 ms** |

  The first version copied every visible line into a fresh per-route path through a transform each frame; the
  shipped one strokes cached paths through the context's transform. So `subway` costs about 1.5 ms (mid) to
  3 ms (near) a frame over `standard` here — inside the spec's 8 ms for the transit passes. The worst frames are
  the ones where a scale bucket is rebuilt. Not measured on a phone.
- **Not verified: VoiceOver's reading of the picker and of the appended elements** (the UI-inspection tools still
  cannot read a live tree here, see above). The picker is a system inline `Picker`; the appended elements are
  the same `Button`s the greenway stretches use.

### Verified in the simulator, 2026-09-21 (iPhone 16 Pro, iOS 18.0)

- The map draws from the shipped snapshot: city outlines, parks, streets and their names, the greenway in four
  phase styles, DDOT routes, food dots. Light **and** dark (screenshots of both).
- Tapping a greenway stretch selected it (bright, the rest dimmed), the sheet showed "Joe Louis Greenway ·
  Conrail (Warren to Joy) · Open to walk and bike · Joy Rd, Tireman Ave", and "See details" pushed the existing
  segment screen with its "Help within a 10-minute walk" list.
- Tapping a food dot showed "Free food · Food pantry, In the Trenches · Closed now. Next: … · Call 313-554-3533
  · See details".
- The layer switcher toggles, and the choice is written to `Library/Application Support/state/map-layers.json`
  (checked on disk) and survives a relaunch.
- "See this map as a list": 143 places as cards, then the greenway stretches with their phase in words.
- **Arabic** (`-AppleLanguages "(ar)"`): the controls and the tab bar mirror, the attribution reads right to
  left — and **the map itself does not mirror**; Detroit is the right way round.
- **Dynamic Type AX3**: the card's words grow and scroll, and "313-554-3533" is shown whole on its own line.
- **Frame time while dragging** with DDOT and SMART routes *and* both stop layers on, plus the greenway and the
  food dots, zoomed in far enough for the stops to draw: **18.8 ms average / 41.4 ms worst** over 30 frames
  before the label-width cache, **15.9 ms / 36.7 ms** after it. That is the simulator on a laptop, which draws
  a `Canvas` on the CPU; it has not been measured on a phone.
- **Not verified here: the accessibility tree itself.** Both UI-inspection tools in this environment fail
  because this Xcode keeps `SimulatorKit.framework` in `Contents/SharedFrameworks` rather than where they look
  for it, so the segment buttons were not read back out of a live tree. They are ordinary SwiftUI `Button`s
  inside `.accessibilityChildren`, and the tap they perform is the one that was verified by hand above — but
  somebody should run Accessibility Inspector (or VoiceOver) over this tab before it ships.

### Verified in the simulator, 2026-09-20 (iPhone 16 Pro, iOS 18.0)

Earlier that day: Save and the saved list; a queued report holding exactly `target_id`, `kind`, `observed_at` and `client_nonce`; the dedupe hash matching the web app's byte for byte; an outbox flush against a stand-in server with no cookie header; the condition-report list on a greenway segment; a `sal_wws_` station (ACCESS, Dearborn) with no Call button and Directions to its coordinate; "I need a doctor" and its six choices; largest Dynamic Type with every phone number shown whole.

After the review fixes, on the same simulator:

- `Library/Application Support/state` carries `com.apple.metadata:com_apple_backup_excludeItem = com.apple.MobileBackup`, checked with `xattr -l` on the app's container.
- The Release preflight refuses `DC_PIN_ACTIVE=hello` and a pinned small-order point, and passes two well-formed keys (exit codes checked).
- The build phase verified the shipped snapshot against the Debug pin and wrote `bundle-floor.txt` (`2026-09-20T23:41Z`) into the app bundle.
- A DV need screen ("I'm not safe at home") shows the hotline and 911 first and carries the quick exit in place of Urgent help; its listing shows "313 Help" as the navigation title with the real name in the page, and no address, Directions or Save. Tapping the quick exit opened weather.gov and left the app on Home.
- "Make a new key" changed `install-key` on disk and said so.
- Arabic (`-AppleLanguages '(ar)'`): the three tab labels — الرئيسية, مساعدة, خريطة — fit the tab bar with nothing cut off at the edge, and a closed listing reads "مغلق الآن. التالي: 2026-09-25 2 م" with the Arabic م rather than an English "pm".
- Apple Maps opened from a `sal_wws_` station's Directions with the strictly escaped coordinate.

Not re-checked by hand: the app-switcher snapshot itself (synthetic gestures cannot open the switcher in this simulator), so the shield is verified by code and by the app resuming correctly, not by a photograph of the switcher.

## Known problems

- ~~**Two error messages are English-only for now.**~~ Fixed on 2026-09-20: `report.failed` ("This phone could not save your report…") and `privacy.reset_failed` ("This phone could not make a new key…") are in all four `strings/*.json` files, the screens use ordinary `L.t` lookups, and `AppParityTests` therefore covers both. The web app and Android now show the same two sentences where the same failures can happen. `L.pending(_:english:)` stays in `Help.swift`, unused, for the next key that arrives before its words do.
- ~~**The greenway tab is labelled `tab.map`.**~~ Fixed on 2026-09-21: that tab is now the map itself (see "The
  Map tab"), and the greenway list is reached from the map's own list. Two things about it are worth a second
  opinion: the map has **no navigation bar**, so Urgent help is a floating button rather than a bar button; and
  the attribution over the map is clipped to two lines, with the whole sentence (including what a drag and a
  pinch do) in "See this map as a list".
- **Three English words on the Map tab** (still true after the 2026-09-21 strings pass, which added the 26 map-style keys but not these; the third, `map.layer_loading` ("Loading"), is new: the VoiceOver label of the spinner shown while a subway network file is coming). `map.done` ("Done", the button that closes the layer and list sheets) and
  `map.zoom` ("Zoom", the name VoiceOver gives the +/− control) are not in `strings/*.json` yet, so they go
  through `L.pending(_:english:)` and read in English in every language. They need adding to all four files.
- **Map labels do not scale with Dynamic Type.** Street and park names on the canvas are drawn at a fixed size,
  as they are on the web; the text alternative ("See this map as a list") is what grows. The same is true of the
  floating buttons' symbols, which have a Large Content Viewer entry instead.
- **The quick exit and Urgent help both render as an icon alone** in the navigation bar at default text size, even with `.labelStyle(.titleAndIcon)`; the accessibility label is the full sentence. An ⊗ is not as plain as "Leave this page fast".
- **CI does not run the Ed25519 maths.** `swift test` on Linux runs every rule around the signature check but compiles the CryptoKit half out, and this package has no third-party dependency to get Ed25519 on Linux (swift-crypto would be the obvious one, Apache-2.0, if that is ever wanted). A Mac `swift test` does run it. The same is true of the backup-flag test.
- Not exercised yet: a real network refresh from a published `DC_BUNDLE_BASE`, the "older bundle refused" path against a live server, calling a number on a real phone, and Spanish (needs a Spanish simulator).
- Never run on a device and never signed for one; the simulator builds sign with "Sign to Run Locally".
- No launch-screen artwork beyond `INFOPLIST_KEY_UILaunchScreen_Generation`.
- `apps/ios/Xcode/` is git-ignored, so the project file and the two Info.plists are not in the repo. Unignore it once it settles, or rebuild it from the steps above.
- `Scripts/preflight.sh` and `Scripts/verify-snapshot.swift` restate in shell and in a standalone script what `Sources/HelpCore` states in Swift. They must be changed together; `ReleaseRuleTests` reads both files and fails when the key rules drift apart, which catches a missing rule but not a differently-worded one.

## Release blockers left

| # | Item | Waiting on |
|---|---|---|
| i20 | The two release public keys (`DC_PIN_ACTIVE`, `DC_PIN_SPARE`) and the real origin. The build now refuses to ship without them, and refuses a snapshot they did not sign. | **Kyle** (generate and hold the keys; register the domain) |
| i26 | A device build, signing, and an Apple developer account | **Kyle** (account), then work |
| i27 | `apps/ios/Xcode/` is git-ignored | a decision to unignore it |
| i28 | `report.failed` and `privacy.reset_failed` in all four string files | the strings owner |
| — | Store labels and the age rating questionnaire (docs/08). The privacy manifest now declares Other User Content, not linked, not tracking — the nutrition label must match. | **Kyle** |
| — | The overdose steps still need a review by DHD, MDHHS or counsel before a public release | **Kyle** |
