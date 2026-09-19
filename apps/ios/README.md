# Detroit Compass for iPhone

Two parts:

- **`Sources/DetroitQuery`**: the rules for open now, next times, badges, ranking, search and greenway distances. It is a Swift copy of `packages/query`, tested against the same `schema/fixtures` the web app uses. `swift test` runs on macOS, Linux and Windows, and CI runs it on every push.
- **`DetroitCompassApp/`**: the SwiftUI screens (iOS 17). They need Xcode on a Mac. **They have not been compiled yet**: they were written on a Windows machine against the tested library. Expect small fixes on the first build.

## First build on a Mac

1. In Xcode: File → New → Project → iOS App, named "Detroit Compass", with interface SwiftUI and language Swift. Save it in `apps/ios/Xcode/`. The folder is git-ignored until the project settles.
2. Delete the generated `ContentView.swift` and the `…App.swift` file. Drag in the four files from `DetroitCompassApp/`, choosing **Create groups** and leaving **Copy items** unticked.
3. File → Add Package Dependencies → Add Local… → select `apps/ios`. Add the **DetroitQuery** library to the app target.
4. Resources: drag `strings/en.json` and `strings/es.json` from the repo root into the project, without copying. Add a Run Script build phase that copies the latest bundle, so the app works with no signal on first launch:
   ```sh
   rm -rf "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
   cp -R "$SRCROOT/../../../data/bundle/v1" "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/bundle-snapshot"
   ```
   Run `pnpm build:bundle` in the repo first. For a store build use `pnpm build:bundle:release`, so the snapshot is signed with the release key.
5. Info.plist keys:
   - `DCBundleBase` (String): `https://<domain>/data/bundle/v1/`
   - `DCPinnedKeys` (Array of String): the active and spare public keys, the same two values as `BUNDLE_PUBLIC_KEYS`. For a local build, use the dev key the web build prints.
   - `NSLocationWhenInUseUsageDescription`: "Your location stays on this phone. It sorts the list by distance and is never saved or sent."
6. Privacy manifest and App Store labels: no tracking and no data collected. Location is used only on the device. Photos are not in the iPhone app yet. docs/08 has the wording.

## What the iPhone app does and does not do yet

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
