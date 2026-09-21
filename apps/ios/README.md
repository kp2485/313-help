# 313 Help for iPhone

Four parts:

- **`Sources/DetroitQuery`**: the rules for open now, next times, badges, ranking, search and greenway distances. It is a Swift copy of `packages/query`, tested against the same `schema/fixtures` the web app uses. `swift test` runs on macOS, Linux and Windows (181 fixture cases).
- **`Sources/HelpCore`**: the parts of the app itself that are not a screen — the install key and its daily dedupe hash, what a report is and what the Worker's closed schema allows, the outbox, the saved-places rules, the one session every request goes through, the signed-bundle check (key shape, the small-order deny-list, checksums, the downgrade floor) and what a release build may ship. No UIKit, no SwiftUI, no Combine, so `swift test` runs it too. **These used to live in `HelpApp/` and were tested only inside the git-ignored Xcode project, which meant CI never ran them** (iPhone review, 2026-09-20).
- **`HelpApp/`**: the SwiftUI screens (iOS 17). They compile and run in the iOS Simulator (first built 2026-09-20 on Xcode 27; re-verified the same day on iPhone 16 Pro / iOS 18.0). They have not been run on a real iPhone and have never been signed for a device.
- **`Tests/`**: `HelpCoreTests` (the app's own rules), `DetroitQueryTests` (the shared fixtures) and `AppParityTests` — the needs list held to the web app's. Parity reads `HelpApp/Help.swift`, `apps/web/src/needs.ts` and `strings/*.json` as text and fails when the three disagree: a different need, a missing choice, a different category, a screen that gained or lost its **quick exit**, or a string key the app asks for and `strings/en.json` does not have. It compiles nothing from `HelpApp/`, so it runs with `swift test` and needs no Xcode. Because it reads both files as text, both write a need's own settings (`first`, `intro`, `emptyKey`, `quickExit`, `query`) **above** its `refine` list; keep it that way.

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

- The `HelpApp/*.swift` files are referenced in place (`../HelpApp/…`), not copied. Editing them in Xcode edits the files in the repo. Today: `Help.swift`, `Views.swift`, `Screens.swift`, `BundleStore.swift`, `Config.swift`, `Reports.swift`, `Saved.swift`, `Palette.swift`.
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
2. Delete the generated `ContentView.swift` and the `…App.swift` file. Drag in the Swift files from `HelpApp/`, choosing **Create groups** and leaving **Copy items** unticked. Drag in `HelpApp/Assets.xcassets` and `HelpApp/PrivacyInfo.xcprivacy` the same way.
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
- Listing details, search, greenway segments with help nearby, City events (dormant: the bundle has no events).
- Loading the signed bundle: signature and checksums checked, an older bundle refused — including one older than the snapshot this build shipped — a verified copy kept in Caches, and the shipped snapshot as the first-run fallback. A pinned key must be a whole 44-byte SPKI Ed25519 key and never a small-order point, and an all-zero signature is refused before any maths.
- **Reports** (2026-09-20). "Still open, info is right" or one of the correction kinds on a listing; "Looks good today" or a things-only condition report on an open greenway segment. What leaves the phone is a target id, a kind, an optional 280-character note, a minute-precision time, and `sha256(install key ‖ target ‖ Detroit day)` — the Worker's closed schema and nothing else. A report that can't be sent waits in an outbox on the phone (newest 50) and goes out at the next launch or when the app comes back to the front. **The day-hash is worked out again at the moment a queued report is actually sent**, from the key the phone has then, so a report that waited across "Make a new key" cannot be joined to anything sent before it (this is `withCurrentNonce` in `apps/web/src/report.ts`). Two flushes at once (launch, and coming back to the front) can no longer send everything twice: an actor does not hold its isolation across an `await`, so the outbox has a `flushing` guard.
- **Saved places** (2026-09-20). Listing ids on this phone only, newest first, 100 at most, cleared with one tap. Never for a DV, mental-health-crisis, treatment or sexual-assault listing: those listings simply have no Save button.
- **Places that publish a point but no street address** (2026-09-20) — the 26 Wayne County naloxone and test-strip stations (`sal_wws_*`, `harm.supplies`). Directions go to the coordinate instead of being hidden, and "Where" says, in the source's own name, that it gives no street address (`detail.where_no_address`). **A coordinate is never printed as if it were an address.** A listing with no published phone shows no Call button. The rules are in `Sources/HelpCore/Listing.swift` and covered by `ListingTests`, including that a DV or crisis listing is never handed to a maps app at all.
- **Links built out of somebody else's text are escaped strictly** (2026-09-20). `Directions` and the Transit link percent-encode everything but letters, digits and `-._~`. `.urlQueryAllowed` let `&`, `=`, `+` and `#` through, so a listing whose address read `100 Main St&from=42.3,-83.0` would have added a second parameter — an origin — to the maps link, which docs/08 says we never send (iPhone review, 2026-09-20).
- **About and Your privacy** (2026-09-20), reachable from the bottom of Home. About shows the list version, its date and whether it was signed with the release key or a test key; Your privacy has the plain-language table from docs/08, **how many reports are still waiting** with a control to delete them unsent, and **"Make a new key"**, which throws the install key away and makes a new random one.
- English, Spanish, Arabic and Bengali, following the phone's language. am/pm come from `clock.am` / `clock.pm` and list separators from `list.sep`, so an Arabic time reads "2 م" rather than "2 pm".

Not yet: add-a-place (proposals), the street map, neighborhood pages, transit, link-outs beyond the one 313SafeBeds card, archived listings on search, a listing's own alerts on its detail screen, an in-app language switch, a typed ZIP, parks, photos on condition reports. The age banner is on Home and Saved places but not yet on every list and listing. These screens exist in the web app; the iPhone can open the web app for them until they are ported.

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
- **The greenway tab is labelled `tab.map`.** Its own name (`gw.title`, "مسار Joe Louis Greenway" in Arabic) does not fit a tab bar item and was cut off at the edge of the screen. The tab holds what the web app's Map tab holds on this phone — the greenway — so it takes that tab's word; the screen itself is still titled "Joe Louis Greenway". The iPhone still has no map, so a person who taps "Map" gets a list of greenway stretches. Worth a second opinion.
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
