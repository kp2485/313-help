#!/usr/bin/env bash
# Builds the signed Android release APK on this laptop and publishes it as a GitHub Release
# (docs/OPERATIONS.md, "Releasing the Android app"; DECISIONS 2026-10-08).
#
#   scripts/release-android.sh            build, verify, publish
#   scripts/release-android.sh --dry-run  build and verify only; print what would be published
#
# Needs, in the environment: HELP313_KEYSTORE, HELP313_KEYSTORE_PASSWORD, HELP313_KEY_ALIAS, HELP313_KEY_PASSWORD
# (the APK signing keystore, kept outside this repository). Optional: BUNDLE_PUBLIC_KEYS (else read from the
# repository variable with gh), BUNDLE_BASE (default https://313help.com/data/bundle/v1/), JAVA_HOME (default
# Homebrew's openjdk@17), ANDROID_HOME (default apps/android/local.properties' sdk.dir).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1

for v in HELP313_KEYSTORE HELP313_KEYSTORE_PASSWORD HELP313_KEY_ALIAS HELP313_KEY_PASSWORD; do
  [[ -n "${!v:-}" ]] || { echo "release-android: $v is not set (docs/OPERATIONS.md, \"Releasing the Android app\")."; exit 2; }
done
[[ -f "$HELP313_KEYSTORE" ]] || { echo "release-android: no keystore at $HELP313_KEYSTORE"; exit 2; }
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
[[ -x "$JAVA_HOME/bin/java" ]] || { echo "release-android: no JDK at $JAVA_HOME"; exit 2; }
SDK="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' apps/android/local.properties 2>/dev/null || true)}"
APKSIGNER=$(ls -d "$SDK"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)
[[ -x "${APKSIGNER:-}" ]] || { echo "release-android: apksigner not found under $SDK/build-tools"; exit 2; }
BUNDLE_BASE="${BUNDLE_BASE:-https://313help.com/data/bundle/v1/}"
KEYS="${BUNDLE_PUBLIC_KEYS:-$(gh variable get BUNDLE_PUBLIC_KEYS)}"

VERSION=$(sed -n 's/^ *versionName = "\(.*\)"/\1/p' apps/android/app/build.gradle.kts)
CODE=$(sed -n 's/^ *versionCode = \([0-9]*\)/\1/p' apps/android/app/build.gradle.kts)
TAG="android-v$VERSION"
[[ -n "$VERSION" && -n "$CODE" ]] || { echo "release-android: could not read versionName/versionCode"; exit 2; }

if [[ $DRY == 0 ]]; then
  [[ -z "$(git status --porcelain)" ]] || { echo "release-android: the working tree is not clean; a release is built from a commit."; exit 2; }
  [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "release-android: release from main, so the tag points at what residents got."; exit 2; }
  ! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "release-android: tag $TAG exists; bump versionName and versionCode first."; exit 2; }
  ! gh release view "$TAG" >/dev/null 2>&1 || { echo "release-android: release $TAG already exists."; exit 2; }
fi

echo "== 1/4 the bundle residents are using, release-signed, into data/bundle/v1"
BUNDLE_PUBLIC_KEYS="$KEYS" pnpm --silent fetch:bundle "$BUNDLE_BASE"
BUNDLE_VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("data/bundle/v1/index.json","utf8")).version)')

echo "== 2/4 :app:assembleRelease (pins both public keys, packages that bundle, signed with the laptop keystore)"
( cd apps/android && ./gradlew --no-daemon -q :app:assembleRelease -PbundlePublicKeys="$KEYS" -PbundleBase="$BUNDLE_BASE" )
APK=apps/android/app/build/outputs/apk/release/app-release.apk
[[ -f "$APK" ]] || { echo "release-android: no signed APK (only app-release-unsigned.apk?). Are the four HELP313_* variables set?"; exit 1; }

echo "== 3/4 verify the APK's signature and what it pins"
"$APKSIGNER" verify --min-sdk-version 24 --print-certs "$APK" | sed 's/^/   /'
# Belt and braces: the pinned keys and the bundle home really are in the APK that is about to be published.
# (No grep -q here: under pipefail it closes the pipe on the first match and unzip's SIGPIPE fails the line.)
DEX=$(unzip -p "$APK" classes.dex | strings)
grep -F "$(cut -d, -f1 <<<"$KEYS")" <<<"$DEX" >/dev/null || { echo "release-android: the active public key is not in the APK"; exit 1; }
grep -F "$(cut -d, -f2 <<<"$KEYS")" <<<"$DEX" >/dev/null || { echo "release-android: the spare public key is not in the APK"; exit 1; }
grep -F "$BUNDLE_BASE" <<<"$DEX" >/dev/null || { echo "release-android: $BUNDLE_BASE is not in the APK"; exit 1; }
unzip -l "$APK" | grep "assets/bundle-snapshot/index.json.sig" >/dev/null || { echo "release-android: no bundle snapshot in the APK"; exit 1; }

OUT="$ROOT/apps/android/app/build/outputs/release"
mkdir -p "$OUT"
cp "$APK" "$OUT/313help-$VERSION.apk"
( cd "$OUT" && shasum -a 256 "313help-$VERSION.apk" > "313help-$VERSION.apk.sha256" )
NOTES="$OUT/notes.md"
cat > "$NOTES" <<MD
**313 Help for Android, version $VERSION** (versionCode $CODE). Android 7.0 and up, about $(du -h "$APK" | cut -f1 | tr -d ' ')B, no Play Services, no third-party code.

**Install:** download \`313help-$VERSION.apk\` on the phone, open it, and allow installs from your browser when Android asks. To update later, install the newer APK over it; the same key signs every release.

**Check it:** \`shasum -a 256 313help-$VERSION.apk\` should print the hash in \`313help-$VERSION.apk.sha256\`.

**What it holds:** the list as published at $BUNDLE_BASE on the day of the build (bundle \`$BUNDLE_VERSION\`), so the app works offline from first open; it fetches the current list from the same address when it has a connection, and accepts only a list signed by one of the two keys it pins.

**Privacy:** no account, no name, no phone number, nothing about you leaves the phone; see https://github.com/kp2485/313-help/blob/main/docs/08-privacy-safety.md.

**Tested on:** the Android 15 emulator only. It has not yet been run on a phone, nor on any version below Android 15; please open an issue with the phone model and Android version if something is wrong.
MD

if [[ $DRY == 1 ]]; then
  echo "== dry run: would tag $TAG at $(git rev-parse --short HEAD) and publish $OUT/313help-$VERSION.apk with these notes:"
  cat "$NOTES"; exit 0
fi

echo "== 4/4 tag $TAG and publish the GitHub Release"
git tag -a "$TAG" -m "313 Help for Android $VERSION (bundle $BUNDLE_VERSION)"
git push origin "$TAG"
gh release create "$TAG" "$OUT/313help-$VERSION.apk" "$OUT/313help-$VERSION.apk.sha256" \
  --title "313 Help for Android $VERSION" --notes-file "$NOTES" --latest=false
echo "published: $(gh release view "$TAG" --json url -q .url)"
