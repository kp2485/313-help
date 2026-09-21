#!/bin/sh
# Release preflight, run as a build phase on every build (apps/ios/README.md).
#
# A Debug build passes straight through. A Release build stops here until the real origin and the two real release
# public keys are set, so a release can never ship pointing at localhost, at the placeholder host, pinning the
# throwaway development key, or pinning something that is not an Ed25519 public key at all. It reads the build
# settings, so it does not depend on when the Info.plist is processed.
#
# It never writes a key. Generating and holding the release keys is Kyle's job (docs/OPERATIONS.md); this script
# only refuses. The same rules are in Swift in Sources/HelpCore/{Verify,ReleaseRules}.swift, and `swift test`
# checks both — including a test that reads this file and fails when the two lists drift apart.
#
# Shape, in base64 rather than bytes, so this needs no decoder on a build machine: an SPKI Ed25519 public key is a
# fixed 12-byte header (hex 302a300506032b6570032100) and the 32-byte key. 44 bytes is 60 base64 characters, and
# those first 12 bytes are exactly the 16 characters "MCowBQYDK2VwAyEA".
set -eu

[ "${CONFIGURATION:-Debug}" = "Release" ] || exit 0

PLACEHOLDER_HOST="set-this-domain.invalid"
PLACEHOLDER_KEY="SET-RELEASE-KEY"
DEV_KEY="MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="

# SPKI header of an Ed25519 public key: hex 302a300506032b6570032100, which is this in base64.
SPKI_B64_PREFIX="MCowBQYDK2VwAyEA"
# 44 bytes of DER is 60 base64 characters, the last of which is the padding '='.
SPKI_B64_LEN=60

# The eight small-order points on Ed25519, which "verify" a signature nobody made, written as pinned keys would be.
# In the same order as BundleCheck.smallOrderKeys in Sources/HelpCore/Verify.swift:
#   0100000000000000000000000000000000000000000000000000000000000000  identity, (0, 1)
#   ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f  order 2
#   0000000000000000000000000000000000000000000000000000000000000000  order 4
#   0000000000000000000000000000000000000000000000000000000000000080  order 4, other sign
#   26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05  order 8
#   26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85
#   c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a
#   c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa
SMALL_ORDER="MCowBQYDK2VwAyEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
MCowBQYDK2VwAyEA7P///////////////////////////////////////38=
MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA=
MCowBQYDK2VwAyEAJuiVj8KyJ7BFw/SJ8u+Y8NXfrAXTxjM5sTgCiG1T/AU=
MCowBQYDK2VwAyEAJuiVj8KyJ7BFw/SJ8u+Y8NXfrAXTxjM5sTgCiG1T/IU=
MCowBQYDK2VwAyEAxxdqcD1N2E+6PAt2DRBnDyogU/osOczGTsf9d5KsA3o=
MCowBQYDK2VwAyEAxxdqcD1N2E+6PAt2DRBnDyogU/osOczGTsf9d5KsA/o="

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

# A pinned key must be a whole 44-byte SPKI Ed25519 public key and not one of the small-order points.
# DC_PIN_ACTIVE=hello used to sail through this script while the Swift refused it (iPhone review, 2026-09-20).
check_key() {
	name=$1
	value=$2
	[ ${#value} -eq $SPKI_B64_LEN ] || fail "$name is not a 44-byte SPKI Ed25519 public key (expected $SPKI_B64_LEN base64 characters, got ${#value})"
	case "$value" in
	"$SPKI_B64_PREFIX"*) ;;
	*) fail "$name does not begin with the Ed25519 SPKI header (hex 302a300506032b6570032100)" ;;
	esac
	case "$value" in
	*=) ;;
	*) fail "$name is not valid base64 for 44 bytes (it should end in '=')" ;;
	esac
	# Only the base64 alphabet, so a value cannot smuggle anything past the length check.
	case "$value" in
	*[!A-Za-z0-9+/=]*) fail "$name has characters that are not base64" ;;
	esac
	for bad in $SMALL_ORDER; do
		[ "$value" != "$bad" ] || fail "$name is a small-order Ed25519 point; it signs nothing and can never be pinned"
	done
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
check_key DC_PIN_ACTIVE "$active"
check_key DC_PIN_SPARE "$spare"

echo "Release preflight: origin and the two pinned keys are set."
