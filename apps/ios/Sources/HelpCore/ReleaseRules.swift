// What a release build is allowed to ship: a real https origin and two real, different, well-formed pinned keys.
//
// `Scripts/preflight.sh` states the same rules in shell, because a build phase has to fail a build before any
// Swift of ours runs. `ReleaseRuleTests` reads that script as text and fails when the two drift apart.
//
// Nothing here is a secret. A pinned key is a *public* key; a private key never goes near this repo.
import Foundation

public enum ReleaseRules {
    /// Marked placeholders. A release that still holds one of these is not configured (Kyle sets the real values).
    public static let placeholderHost = "set-this-domain.invalid"
    public static let placeholderKey = "SET-RELEASE-KEY"
    /// The throwaway key the pipeline writes to `.keys/dev-ed25519.pem`. A release must never pin it.
    public static let devKey = "MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8="
}

/// Problems with a release's pinned keys; empty when there are exactly two different Ed25519 keys (active + spare),
/// neither of them the development key, both a full 44-byte SPKI key, and neither a small-order point.
public func releaseKeyProblems(_ keys: [String]) -> [String] {
    var out: [String] = []
    if keys.count != 2 { out.append("a release pins exactly two keys (active and spare); got \(keys.count)") }
    for (i, k) in keys.enumerated() {
        if k.isEmpty || k.contains(ReleaseRules.placeholderKey) {
            out.append("key \(i + 1) is still the placeholder; set the real release key")
        } else if BundleCheck.rawPinnedKey(k) != nil {
            if k == ReleaseRules.devKey { out.append("key \(i + 1) is the development key; a release must never pin it") }
        } else if let der = Data(base64Encoded: k), der.count == 44,
                  Hash.hex(der).hasPrefix(BundleCheck.spkiEd25519Prefix), !BundleCheck.isAcceptablePoint(Data(der.suffix(32))) {
            out.append("key \(i + 1) is a small-order Ed25519 point, which signs nothing; it can never be pinned")
        } else {
            out.append("key \(i + 1) is not a base64 SPKI Ed25519 public key (44 bytes beginning \(BundleCheck.spkiEd25519Prefix))")
        }
    }
    if keys.count == 2 && keys[0] == keys[1] { out.append("the active and spare keys are the same key") }
    return out
}

/// Everything wrong with a release build's configuration. Empty means it is ready to ship.
public func releaseProblems(bundleBase: String, apiBase: String, keys: [String]) -> [String] {
    var out: [String] = []
    for (name, value) in [("DCBundleBase", bundleBase), ("DCApiBase", apiBase)] {
        if value.isEmpty { out.append("\(name) is empty") }
        else if value.contains(ReleaseRules.placeholderHost) { out.append("\(name) is still the placeholder; set the real origin") }
        else if !value.hasPrefix("https://") { out.append("\(name) must be https in a release") }
    }
    return out + releaseKeyProblems(keys)
}
