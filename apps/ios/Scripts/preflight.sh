#!/bin/sh
# Release preflight, run as a build phase on every build (apps/ios/README.md).
#
# A Debug build passes straight through. A Release build stops here until the real origin and the two real release
# public keys are set, so a release can never ship pointing at localhost, at the placeholder host, or pinning the
# throwaway development key. It reads the build settings, so it does not depend on when the Info.plist is processed.
#
# It never writes a key. Generating and holding the release keys is Kyle's job (docs/OPERATIONS.md); this script
# only refuses. The same rules are in Swift in HelpApp/Config.swift, and the app tests check them there.
set -eu

[ "${CONFIGURATION:-Debug}" = "Release" ] || exit 0

PLACEHOLDER_HOST="set-this-domain.invalid"
PLACEHOLDER_KEY="SET-RELEASE-KEY"
DEV_KEY="MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="

fail() { echo "error: Release build refused: $1" >&2; exit 1; }

check_origin() {
	name=$1
	value=$2
	case "$value" in
	"") fail "$name is empty (set it on the Release configuration)" ;;
	*"$PLACEHOLDER_HOST"*) fail "$name is still the placeholder. Set the real origin on the Release configuration (docs/OPERATIONS.md)." ;;
	https://*) ;;
	*) fail "$name must be https in a release; got $value" ;;
	esac
}

check_origin DC_BUNDLE_BASE "${DC_BUNDLE_BASE:-}"
check_origin DC_API_BASE "${DC_API_BASE:-}"

active=${DC_PIN_ACTIVE:-}
spare=${DC_PIN_SPARE:-}
[ -n "$active" ] && [ -n "$spare" ] || fail "a release pins two keys (active and spare); set DC_PIN_ACTIVE and DC_PIN_SPARE to the two values of BUNDLE_PUBLIC_KEYS"
case "$active$spare" in
*"$PLACEHOLDER_KEY"*) fail "the pinned keys are still placeholders; set the two release public keys" ;;
esac
[ "$active" != "$spare" ] || fail "the active and spare keys are the same key"
[ "$active" != "$DEV_KEY" ] && [ "$spare" != "$DEV_KEY" ] || fail "a release must never pin the development key"

echo "Release preflight: origin and the two pinned keys are set."
