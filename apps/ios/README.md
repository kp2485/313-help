# 313 Help for iPhone

Three parts:

- **`Sources/DetroitQuery`**: the rules for open now, next times, badges, ranking, search and greenway distances. It is a Swift copy of `packages/query`, tested against the same `schema/fixtures` the web app uses. `swift test` runs on macOS, Linux and Windows (111 fixture cases).
- **`HelpApp/`**: the SwiftUI screens (iOS 17). They compile and run in the iOS Simulator (first built 2026-09-20 on Xcode 27; re-verified the same day on iPhone 16 Pro / iOS 18.0). They have not been run on a real iPhone and have never been signed for a device.
- **`HelpAppTests/`**: tests for the app itself — the daily dedupe hash, the outbox, saved-places rules and bundle verification. They run as the `Help313Tests` target of the Xcode project.
- **`Tests/AppParityTests`**: the needs list held to the web app's. It reads `HelpApp/Help.swift`, `apps/web/src/needs.ts` and `strings/*.json` as text and fails when the three disagree — a different need, a missing choice, a different category, or a string key the app asks for and `strings/en.json` does not have. It compiles nothing from `HelpApp/`, so it runs with `swift test` and needs no Xcode. Because it reads both files as text, both write a need's own settings (`first`, `intro`, `emptyKey`, `query`) **above** its `refine` list; keep it that way.

## Building it

The Xcode project lives in `apps/ios/Xcode/` (`Help313.xcodeproj`, shared scheme `Help313`, product "313 Help", bundle id `org.help313.app`, deployment target iOS 17). That folder is still git-ignored (`apps/ios/.gitignore`), so a fresh clone has to recreate it; the steps under "Making the project again" below say how, and the project file itself is a small hand-written `project.pbxproj` if you would rather copy one. Everything the project *points at* — the Swift files, the tests, the asset catalog, the privacy manifest and the scripts — lives outside that folder and is in the repo.

1. Build the data bundle first, from the repo root: `pnpm build:bundle` (a store build uses `pnpm build:bundle:release`, so the snapshot is signed with the release key). The build phase copies `data/bundle/v1` into the app, and a missing folder fails the build.
2. Open `apps/ios/Xcode/Help313.xcodeproj` in Xcode, pick an iPhone simulator, and Run. From the command line:
   ```sh
   cd apps/ios/Xcode
   xcodebuild -project Help313.xcodeproj -scheme Help313 \
     -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build
   xcodebuild -project Help313.xcodeproj -scheme Help313 \
     -destination 'platform=iOS Simulator,name=iPhone 16 Pro' test
   ```
   Then `xcrun simctl install booted "<built>/313 Help.app"` and `xcrun simctl launch booted org.help313.app`.
3. `swift test` from `apps/ios` runs the DetroitQuery fixtures and the parity tests, and is unaffected by the app target.

### How the project is wired

- The `HelpApp/*.swift` files are referenced in place (`../HelpApp/…`), not copied. Editing them in Xcode edits the files in the repo. Today: `Help.swift`, `Views.swift`, `Screens.swift`, `BundleStore.swift`, `Verify.swift`, `Config.swift`, `Reports.swift`, `Saved.swift`, `Listing.swift`, `Palette.swift`.
- `HelpApp/Assets.xcassets` (the app icon) and `HelpApp/PrivacyInfo.xcprivacy` are referenced in place too and are copied in by the Resources phase.
- `DetroitQuery` is a local Swift package reference to `apps/ios` (the `Package.swift` beside this README), linked into both targets.
- `strings/en.json` and `strings/es.json` are referenced in place from the repo root (`../../../strings/…`) and land flat in the app bundle, which is what `L.table(_:)` expects.
- **`Help313Tests`** is a unit-test bundle with no host app. It compiles `Config.swift`, `Reports.swift`, `Saved.swift`, `Listing.swift` and `Verify.swift` directly (no `@testable import`), plus `HelpAppTests/AppTests.swift`. 28 cases, all passing.
- Build phase "Release preflight" (`Scripts/preflight.sh`, first phase, runs every build): does nothing for Debug; refuses a Release build whose origin or pinned keys are still placeholders. See below.
- Run Script phase "Copy bundle snapshot" (runs every build, `ENABLE_USER_SCRIPT_SANDBOXING = NO` so it may read outside the project folder):
  ```sh
  rm -rf "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
  cp -R "$SRCROOT/../../../data/bundle/v1" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
  ```

### Where this build talks to (per configuration)

Nothing is hardcoded in the Info.plist any more. `Info.plist` (Debug) and `Info-Release.plist` (Release) both read `$(DC_…)` build settings, and `HelpApp/Config.swift` reads them back at runtime.

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
```

It refuses: an empty or non-https origin, the placeholder host, fewer than two keys, the same key twice, a key that is not a base64 SPKI Ed25519 public key, the placeholder keys, and the development key. The same rules are in Swift in `Config.swift` (`releaseProblems`, `releaseKeyProblems` — the Swift copy of `apps/web/src/keys.ts`) and are covered by `ReleaseConfigTests`. Neither the script nor the app ever writes or invents a key: generating and holding the release private keys is Kyle's job. Verified 2026-09-20: the Release build fails as above, and passes with two real keys and an https origin supplied on the command line.

### Making the project again (or by hand in Xcode)

1. File → New → Project → iOS App, named "313 Help", interface SwiftUI, language Swift, saved in `apps/ios/Xcode/`.
2. Delete the generated `ContentView.swift` and the `…App.swift` file. Drag in the Swift files from `HelpApp/`, choosing **Create groups** and leaving **Copy items** unticked. Drag in `HelpApp/Assets.xcassets` and `HelpApp/PrivacyInfo.xcprivacy` the same way.
3. File → Add Package Dependencies → Add Local… → select `apps/ios`. Add the **DetroitQuery** library to the app target.
4. Drag `strings/en.json` and `strings/es.json` in from the repo root, without copying, and add the "Copy bundle snapshot" Run Script phase above, plus a first Run Script phase containing `"$SRCROOT/../Scripts/preflight.sh"`.
5. Add a **Unit Testing Bundle** target named `Help313Tests` with **no** host application. Add `HelpAppTests/AppTests.swift` and, from `HelpApp/`, `Config.swift`, `Reports.swift`, `Saved.swift`, `Listing.swift` and `Verify.swift` to its Compile Sources; link **DetroitQuery**. Share the `Help313` scheme and add `Help313Tests` to its Test action.
6. Set `INFOPLIST_FILE` to `Info.plist` for Debug and `Info-Release.plist` for Release, add the `DC_…` settings from the table above, set `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`, the deployment target to iOS 17, and iPhone only.

### The app icon

`HelpApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png` is generated locally, not downloaded:

```sh
swift apps/ios/Scripts/make-icon.swift apps/ios/HelpApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png
```

It draws the web app's mark (`apps/web/public/icon.svg`): the deep-green square, a white pin, a green cross cut out of it. One 1024×1024 opaque image, which is all iOS 17 and later need.

### The privacy manifest

`HelpApp/PrivacyInfo.xcprivacy` declares no tracking, no tracking domains, no collected data types and no required-reason APIs, and the file says in comments why each of those is true. It is truthful today because the app keeps its own state in files it creates (not `UserDefaults`), never reads file timestamps or free disk space, and has no third-party SDK. **If any of that changes, the manifest changes in the same commit.**

## What the iPhone app does and does not do yet

It does:
- Home with active alerts and the bundle-age banner; the Help needs list in its three groups; refine screens; results ranked by the shared rule, with "Use my location" (asked on the tap, held in memory, never sent). The needs, their choices and their categories are exactly `apps/web/src/needs.ts`, and `AppParityTests` fails if they stop being. "I need a doctor" offers, in this order, the emergency room (which leads with 911), urgent care, a doctor or nurse, Health Department programs, a dentist and eye care.
- Urgent help from every screen, with 911 and 988 hardcoded; the overdose screen with 911 first and no list of places; DV, crisis, treatment and assault screens with numbers before any list and no distance.
- Listing details, search, greenway segments with help nearby, City events (dormant: the bundle has no events).
- Loading the signed bundle: signature and checksums checked, an older bundle refused, a verified copy kept on the phone, and the shipped snapshot as the first-run fallback.
- **Reports** (2026-09-20). "Still open, info is right" or one of the correction kinds on a listing; "Looks good today" or a things-only condition report on an open greenway segment. What leaves the phone is a target id, a kind, an optional 280-character note, a minute-precision time, and `sha256(install key ‖ target ‖ Detroit day)` — the Worker's closed schema and nothing else. A report that can't be sent waits in an outbox on the phone (newest 50) and goes out at the next launch or when the app comes back to the front.
- **Saved places** (2026-09-20). Listing ids on this phone only, newest first, 100 at most, cleared with one tap. Never for a DV, mental-health-crisis, treatment or sexual-assault listing: those listings simply have no Save button.
- **Places that publish a point but no street address** (2026-09-20) — the 26 Wayne County naloxone and test-strip stations (`sal_wws_*`, `harm.supplies`). Directions now go to the coordinate (`maps.apple.com/?daddr=<lat>,<lon>`) instead of being hidden, and "Where" says, in the source's own name, that it gives no street address (`detail.where_no_address`). **A coordinate is never printed as if it were an address.** A listing with no published phone shows no Call button, on the card or the listing. The rules are in `HelpApp/Listing.swift` (`mapsDestination`, `showsPointWithoutAddress`, `hasPhone`) and covered by `ListingTests`, including that a DV or crisis listing is never handed to a maps app at all.
- **About and Your privacy** (2026-09-20), reachable from the bottom of Home. About shows the list version, its date and whether it was signed with the release key or a test key; Your privacy has the plain-language table from docs/08 and **"Make a new key"**, which throws the install key away and makes a new random one.
- English and Spanish, following the phone's language.

Not yet: add-a-place (proposals), the street map, neighborhood pages, transit, link-outs beyond the one 313SafeBeds card, archived listings on search, a listing's own alerts on its detail screen, quick exit on private screens, an in-app language switch, a typed ZIP, parks, photos on condition reports. The age banner is on Home and Saved places but not yet on every list and listing. These screens exist in the web app; the iPhone can open the web app for them until they are ported.

### Verified in the simulator, 2026-09-20 (iPhone 16 Pro, iOS 18.0)

- Save on a listing, and the saved list; the file written is `Library/Application Support/state/saved.json`, holding ids and nothing else.
- A report with no server reachable: queued, and the on-disk queue holds exactly `target_id`, `kind`, `observed_at` (minutes) and `client_nonce` — no note when none was typed, no id of any kind.
- The dedupe hash matches the web app's byte for byte: the queued nonce equals `printf '<key>|sal_crossroads_sunday_meal|2026-09-20' | shasum -a 256`.
- The outbox flush: with a stand-in server on `localhost:5173`, relaunching the app sent `POST /v1/reports`, `content-type: application/json`, exactly those four fields, no cookie header, and a 202 emptied the queue.
- "Make a new key": the file `Library/Application Support/state/install-key` changed, and the screen said so.
- The condition-report list on a greenway segment: things only, no category about a person, no photo flow.
- A `sal_wws_` station (ACCESS, Dearborn): no Call button anywhere, Directions present and opening Apple Maps at the coordinate, and "Where" reading "Wayne County Well Wayne Stations location map does not give a street address for this spot."
- "I need a doctor" shows its six choices in the web app's order, "Health Department programs" lists the 24 `health.dhd` rows, and "Emergency room" opens with the red 911 button above the list. A row whose own page prints no dialable number (Children's Hospital of Michigan) shows its notice and no Call button.
- Largest Dynamic Type (`accessibility-extra-extra-extra-large`): Home, a results list, a listing, Saved places and Urgent help all readable, nothing clipped horizontally, and **every phone number shown whole**.

## Known problems

- Not exercised yet: a real network refresh from a published `DC_BUNDLE_BASE`, the "older bundle refused" path against a live server, calling a number on a real phone, Apple Maps directions, and Spanish (needs a Spanish simulator).
- Never run on a device and never signed for one; the simulator builds sign with "Sign to Run Locally".
- No launch-screen artwork beyond `INFOPLIST_KEY_UILaunchScreen_Generation`.
- `apps/ios/Xcode/` is git-ignored, so the project file and the two Info.plists are not in the repo. Unignore it once it settles, or rebuild it from the steps above.
- `Scripts/preflight.sh` restates the release rules in shell that `Config.swift` states in Swift. They must be changed together; `ReleaseConfigTests` covers the Swift half only.
- ~~`detail.where_no_address` ends "The map shows where it is," and `detail.directions_note` says the maps app "will see the address."~~ Both were reworded on 2026-09-20 and now say only what is true on a phone with no in-app map ("Use Directions to find it", "which will see where this place is"). Nothing left to do here.
- The greenway tab is titled with `gw.title` because `tab.rec` was retired on 2026-09-20 when the web app merged Recreation and Transit into a Map tab. The iPhone has no map, so it keeps a greenway tab.

## Release blockers left

| # | Item | Waiting on |
|---|---|---|
| i20 | The two release public keys (`DC_PIN_ACTIVE`, `DC_PIN_SPARE`) and the real origin. The build now refuses to ship without them. | **Kyle** (generate and hold the keys; register the domain) |
| i26 | A device build, signing, and an Apple developer account | **Kyle** (account), then work |
| i27 | `apps/ios/Xcode/` is git-ignored | a decision to unignore it |
| — | Store labels and the age rating questionnaire (docs/08) | **Kyle** |
| — | The overdose steps still need a review by DHD, MDHHS or counsel before a public release | **Kyle** |
