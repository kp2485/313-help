// Where this build talks to, and which signing keys it will accept. Both come from Info.plist, and both are set per
// build configuration (see apps/ios/README.md): Debug points at `pnpm dev`; Release carries a marked placeholder so a
// release that nobody has configured cannot ship. `Scripts/preflight.sh` runs the same rules at build time and fails
// the Release build; `releaseProblems` below is the same check in Swift, used by the app tests.
//
// Nothing here is a secret. A pinned key is a *public* key; a private key never goes near this repo.
import Foundation

enum Config {
    /// Marked placeholders. A release that still holds one of these is not configured (Kyle sets the real values).
    static let placeholderHost = "set-this-domain.invalid"
    static let placeholderKey = "SET-RELEASE-KEY"
    /// The throwaway key the pipeline writes to `.keys/dev-ed25519.pem`. A release must never pin it.
    static let devKey = "MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="

    private static func string(_ key: String) -> String {
        ((Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? "").trimmingCharacters(in: .whitespaces)
    }

    /// True for a Release build (Info.plist `DCRelease`, set from the build configuration).
    static let isRelease = string("DCRelease") == "YES"
    /// Where the published bundle lives, e.g. https://<domain>/data/bundle/v1/ .
    static let bundleBase = string("DCBundleBase")
    /// Where the Worker lives; `/v1/reports` hangs off it.
    static let apiBase = string("DCApiBase")
    /// Base64 SPKI Ed25519 public keys: active and spare. Empty entries (a Debug build has no spare) are dropped.
    static let pinnedKeys: [String] = ((Bundle.main.object(forInfoDictionaryKey: "DCPinnedKeys") as? [String]) ?? [])
        .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }

    /// A URL only when this build is actually pointed somewhere: an unconfigured release reaches nothing at all.
    static func url(_ base: String, _ path: String = "") -> URL? {
        guard !base.isEmpty, !base.contains(placeholderHost), let u = URL(string: base) else { return nil }
        return path.isEmpty ? u : u.appendingPathComponent(path)
    }
    static var bundleBaseURL: URL? { url(bundleBase) }
    static var reportsURL: URL? { url(apiBase, "v1/reports") }
}

// SPKI DER for Ed25519 is a fixed 12-byte header and then the 32-byte key: 44 bytes, 88 hex characters.
// This is the Swift copy of `releaseKeyProblems` in apps/web/src/keys.ts, and it is checked by the same rules.
private let spkiEd25519 = "302a300506032b6570032100"

private func spkiHex(_ base64: String) -> String? {
    guard let d = Data(base64Encoded: base64) else { return nil }
    return d.map { String(format: "%02x", $0) }.joined()
}

/// Problems with a release's pinned keys; empty when there are exactly two different Ed25519 keys (active + spare),
/// neither of them the development key.
func releaseKeyProblems(_ keys: [String]) -> [String] {
    var out: [String] = []
    if keys.count != 2 { out.append("a release pins exactly two keys (active and spare); got \(keys.count)") }
    for (i, k) in keys.enumerated() {
        if k.isEmpty || k.contains(Config.placeholderKey) { out.append("key \(i + 1) is still the placeholder; set the real release key") }
        else if let h = spkiHex(k), h.count == 88, h.hasPrefix(spkiEd25519) {
            if k == Config.devKey { out.append("key \(i + 1) is the development key; a release must never pin it") }
        } else { out.append("key \(i + 1) is not a base64 SPKI Ed25519 public key") }
    }
    if keys.count == 2 && keys[0] == keys[1] { out.append("the active and spare keys are the same key") }
    return out
}

/// Everything wrong with a release build's configuration. Empty means it is ready to ship.
func releaseProblems(bundleBase: String, apiBase: String, keys: [String]) -> [String] {
    var out: [String] = []
    for (name, value) in [("DCBundleBase", bundleBase), ("DCApiBase", apiBase)] {
        if value.isEmpty { out.append("\(name) is empty") }
        else if value.contains(Config.placeholderHost) { out.append("\(name) is still the placeholder; set the real origin") }
        else if !value.hasPrefix("https://") { out.append("\(name) must be https in a release") }
    }
    return out + releaseKeyProblems(keys)
}
