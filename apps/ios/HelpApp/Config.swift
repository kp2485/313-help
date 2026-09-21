// Where this build talks to, which signing keys it will accept, and how old a list it will accept. All of it comes
// from the app bundle, and all of it is set per build configuration (see apps/ios/README.md): Debug points at
// `pnpm dev`; Release carries a marked placeholder so a release that nobody has configured cannot ship.
// `Scripts/preflight.sh` runs the same rules at build time and fails the Release build; `releaseProblems` in
// HelpCore is the same check in Swift, and `swift test` runs it.
//
// Nothing here is a secret. A pinned key is a *public* key; a private key never goes near this repo.
import Foundation
import HelpCore

enum Config {
    /// Marked placeholders, and the throwaway development key. The rules themselves live in HelpCore
    /// (ReleaseRules), where the tests can reach them without an app bundle.
    static let placeholderHost = ReleaseRules.placeholderHost
    static let placeholderKey = ReleaseRules.placeholderKey
    static let devKey = ReleaseRules.devKey

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

    /// What this build calls itself to a server: "313Help-iOS/0.1" and nothing about the phone (HelpCore/Net).
    static let version = string("CFBundleShortVersionString").isEmpty ? "0" : string("CFBundleShortVersionString")

    /// The oldest list this build will accept, written in at build time by `Scripts/verify-snapshot.swift`: the
    /// `generated_at` of the snapshot shipped inside the app. Without it a brand-new install held nothing, so any
    /// correctly signed old list counted as newer than nothing and a phone could be started months in the past
    /// (iPhone review, 2026-09-20). It is read even when the snapshot itself fails to load, which is the point.
    static let snapshotFloor: String? = {
        guard let url = Bundle.main.url(forResource: "bundle-floor", withExtension: "txt"),
              let s = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let floor = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return floor.isEmpty ? nil : floor
    }()

    /// A URL only when this build is actually pointed somewhere: an unconfigured release reaches nothing at all.
    static func url(_ base: String, _ path: String = "") -> URL? {
        guard !base.isEmpty, !base.contains(placeholderHost), let u = URL(string: base) else { return nil }
        return path.isEmpty ? u : u.appendingPathComponent(path)
    }
    static var bundleBaseURL: URL? { url(bundleBase) }
    static var reportsURL: URL? { url(apiBase, "v1/reports") }
}
