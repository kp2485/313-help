# 313 Help for iPhone

Two parts:

- **`Sources/DetroitQuery`**: the rules for open now, next times, badges, ranking, search and greenway distances. It is a Swift copy of `packages/query`, tested against the same `schema/fixtures` the web app uses. `swift test` runs on macOS, Linux and Windows, and CI runs it on every push.
- **`HelpApp/`**: the SwiftUI screens (iOS 17). They need Xcode on a Mac. They **now compile and run in the iOS Simulator** (first built 2026-09-20 on Xcode 27, iPhone 16 Pro, iOS 26 simulator). They have not been run on a real iPhone and have never been signed for a device.

## Building it

The Xcode project lives in `apps/ios/Xcode/` (`Help313.xcodeproj`, scheme `Help313`, product "313 Help", bundle id `org.help313.app`, deployment target iOS 17). That folder is still git-ignored (`apps/ios/.gitignore`), so a fresh clone has to recreate it; the steps under "Making the project again" below say how, and the project file itself is a small hand-written `project.pbxproj` if you would rather copy one.

1. Build the data bundle first, from the repo root: `pnpm build:bundle` (a store build uses `pnpm build:bundle:release`, so the snapshot is signed with the release key). The build phase copies `data/bundle/v1` into the app, and a missing folder fails the build.
2. Open `apps/ios/Xcode/Help313.xcodeproj` in Xcode, pick an iPhone simulator, and Run. From the command line:
   ```sh
   cd apps/ios/Xcode
   xcodebuild -project Help313.xcodeproj -scheme Help313 \
     -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build
   ```
   Then `xcrun simctl install booted "<built>/313 Help.app"` and `xcrun simctl launch booted org.help313.app`.
3. `swift test` from `apps/ios` still runs the DetroitQuery fixtures (111 cases) and is unaffected by the app target.

### How the project is wired

- The four `HelpApp/*.swift` files are referenced in place (`../HelpApp/…`), not copied. Editing them in Xcode edits the files in the repo.
- `DetroitQuery` is a local Swift package reference to `apps/ios` (the `Package.swift` beside this README), linked into the app target.
- `strings/en.json` and `strings/es.json` are referenced in place from the repo root (`../../../strings/…`) and land flat in the app bundle, which is what `L.table(_:)` expects.
- Run Script phase "Copy bundle snapshot" (runs every build, `ENABLE_USER_SCRIPT_SANDBOXING = NO` so it may read outside the project folder):
  ```sh
  rm -rf "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
  cp -R "$SRCROOT/../../../data/bundle/v1" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
  ```
- `apps/ios/Xcode/Info.plist` (merged with the generated one) holds:
  - `DCBundleBase` — currently `http://localhost:5173/data/bundle/v1/` for a local build against `pnpm dev` in `apps/web`. A real build uses `https://<domain>/data/bundle/v1/`.
  - `DCPinnedKeys` — one entry for local work: the dev public key, derived from `.keys/dev-ed25519.pem` the same way `apps/web/vite.config.ts` does it (`openssl pkey -in .keys/dev-ed25519.pem -pubout -outform DER | base64`). A release build must carry the **two** release keys, the same values as `BUNDLE_PUBLIC_KEYS`, and never the dev key.
  - `NSLocationWhenInUseUsageDescription` — "Your location stays on this phone. It sorts the list by distance and is never saved or sent."
  - `NSAppTransportSecurity` → `NSAllowsLocalNetworking` — only so the local `http://localhost:5173` refresh works. **Remove it for any real build**; the published bundle is HTTPS.
- Privacy manifest and App Store labels: no tracking and no data collected. Location is used only on the device. Photos are not in the iPhone app yet. docs/08 has the wording. The privacy manifest file itself is not in the project yet.

### Making the project again (or by hand in Xcode)

1. File → New → Project → iOS App, named "313 Help", interface SwiftUI, language Swift, saved in `apps/ios/Xcode/`.
2. Delete the generated `ContentView.swift` and the `…App.swift` file. Drag in the four files from `HelpApp/`, choosing **Create groups** and leaving **Copy items** unticked.
3. File → Add Package Dependencies → Add Local… → select `apps/ios`. Add the **DetroitQuery** library to the app target.
4. Drag `strings/en.json` and `strings/es.json` in from the repo root, without copying, and add the Run Script phase above.
5. Add the Info.plist keys above; set the deployment target to iOS 17 and iPhone only.

### Fixes the first build needed

- `Views.swift` lines 217 and 279: `badge(row, now:)` had to become `DetroitQuery.badge(row, now:)`. Swift resolved the bare name to SwiftUI's `View.badge(_:)` instance method instead of the library's global function. Nothing else in the four files changed, and `Sources/DetroitQuery` was not touched.

## What the iPhone app does and does not do yet

Seen running in the simulator (2026-09-19, no network, reading the shipped `bundle-snapshot`): Home, the Help needs list in its three groups (Right now / This week / Work, school, and paperwork), the refine screens, results lists with real listings, badge lines and "Call first for hours", and the overdose screen with 911 first and no list of places.

The screens follow the web app's design system (`HelpApp/Palette.swift`): the same green palette in light and dark, cards on a tinted background, uppercase section headings, pills whose colour follows the words, two-column tiles of one size, a red 911 row, and call buttons that show the number.

It does:
- Home with active alerts and the bundle-age banner.
- Urgent help from every screen, with 911 and 988 hardcoded.
- The Help needs list, including the overdose steps with 911 first and no list of places.
- Listing results ranked by the shared rule, with "Use my location" through Apple's one-time location button.
- Listing details, search, greenway segments with help nearby and their cross streets, and City events.
- Loading the signed bundle: signature and checksums checked, an older bundle refused, a verified copy kept on the phone.
- English and Spanish, following the phone's language.

Not yet:
- Reports and add-a-place.
- Saved places.
- The street map.
- Neighborhood pages.
- Transit.

These screens exist in the web app. The iPhone can open the web app for them until they are ported.

Known problems after the first build:
- *(Fixed 2026-09-20.)* Apple's `LocationButton` drew its own label clipped ("urrent Location") whatever it was given. It is gone: `LocationChip` in Views.swift is an ordinary SwiftUI button with the standard CoreLocation flow (`Here.ask()` asks for permission on the tap, never at launch, and a refusal shows "We couldn't get your location. The list is for the whole city."). `CoreLocationUI` is no longer imported.
- Not exercised yet, because the simulator run was offline against the shipped snapshot: the network refresh from `DCBundleBase`, the "older bundle refused" path, the cached-copy-on-the-phone path, calling a number, Apple Maps directions, Spanish (needs a Spanish simulator), City events, greenway segments and search.
- No app icon, no launch screen artwork, no privacy manifest, no tests for the app target, and no device build or signing. `TARGETED_DEVICE_FAMILY` is iPhone only and the app is portrait only.
- `apps/ios/Xcode/` is git-ignored, so the project file is not in the repo yet. Unignore it once it settles, or rebuild it from the steps above.
