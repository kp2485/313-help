#!/usr/bin/env swift
// Checks the bundle snapshot that a build is about to ship inside the app, and writes down the oldest list that
// build will ever accept.
//
// Why: the "Copy bundle snapshot" build phase copied `data/bundle/v1` in without looking at it, so a Release build
// made on a laptop that had last run `pnpm build:bundle` (the *dev* key) shipped a snapshot the app itself then
// refused — an app with no offline data at all. And because a fresh install held nothing, the downgrade check had
// nothing to compare against, so any correctly signed old list was accepted as "newer than nothing" (iPhone
// review, 2026-09-20).
//
// Usage:  swift verify-snapshot.swift <snapshot-dir> <floor-file> <pinned-key-base64>...
//   - fails (exit 1) when index.json.sig is not a good signature over index.json by one of the pinned keys, or
//     when any file listed in the index does not match its checksum;
//   - writes the snapshot's own `generated_at` to <floor-file>, which the app ships as `bundle-floor.txt` and
//     reads as the floor for `BundleCheck.refusesOlder`.
//
// It runs with `swift`, which is on every machine that can build this app, and needs nothing else installed —
// `openssl` and `python3` are not guaranteed on a build machine. CryptoKit is, because the build machine is a Mac.
//
// The key rules below are the same ones as Sources/HelpCore/Verify.swift, restated because a script cannot import
// the package. `ReleaseRuleTests.testTheSnapshotScriptChecksTheSameThings` fails if the two drift apart.
import CryptoKit
import Foundation

let spkiEd25519Prefix = "302a300506032b6570032100"

/// The eight small-order points on Ed25519, which "verify" a signature nobody made. Never a signing key.
let smallOrderKeys = [
    "0100000000000000000000000000000000000000000000000000000000000000",   // identity, (0, 1)
    "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",   // order 2
    "0000000000000000000000000000000000000000000000000000000000000000",   // order 4
    "0000000000000000000000000000000000000000000000000000000000000080",   // order 4, other sign
    "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",   // order 8
    "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
    "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
    "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
]

func hex(_ d: Data) -> String { d.map { String(format: "%02x", $0) }.joined() }

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    exit(1)
}

/// The 32 raw bytes of a pinned key: exactly 44 bytes of DER, the Ed25519 header, and not a small-order point.
func rawPinnedKey(_ base64: String) -> Data? {
    guard let der = Data(base64Encoded: base64.trimmingCharacters(in: .whitespaces)), der.count == 44,
          hex(der).hasPrefix(spkiEd25519Prefix) else { return nil }
    let raw = Data(der.suffix(32))
    guard !smallOrderKeys.contains(hex(raw)) else { return nil }
    var y = [UInt8](raw)
    y[31] &= 0x7f
    var q = [UInt8](repeating: 0xff, count: 32)
    q[0] = 0xed
    q[31] = 0x7f
    for i in stride(from: 31, through: 0, by: -1) where y[i] != q[i] {
        return y[i] < q[i] ? raw : nil
    }
    return nil
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 3 else { fail("usage: verify-snapshot.swift <snapshot-dir> <floor-file> <pinned-key-base64>...") }
let dir = URL(fileURLWithPath: args[0], isDirectory: true)
let floorFile = URL(fileURLWithPath: args[1])
let pinned = args.dropFirst(2).map { $0 }.filter { !$0.isEmpty }

guard let indexData = try? Data(contentsOf: dir.appendingPathComponent("index.json")) else {
    fail("no index.json in \(dir.path). Run `pnpm build:bundle` (or `pnpm build:bundle:release`) first.")
}
guard let sigData = try? Data(contentsOf: dir.appendingPathComponent("index.json.sig")) else {
    fail("no index.json.sig in \(dir.path): the snapshot is not signed.")
}

struct Sig: Decodable { var signature: String }
guard let sigText = try? JSONDecoder().decode(Sig.self, from: sigData),
      let signature = Data(base64Encoded: sigText.signature), signature.count == 64,
      signature.contains(where: { $0 != 0 }) else { fail("index.json.sig does not hold a usable Ed25519 signature.") }

let keys = pinned.compactMap(rawPinnedKey)
guard !keys.isEmpty else {
    fail("none of the \(pinned.count) pinned key(s) is a 44-byte SPKI Ed25519 public key (or one is a small-order point). Check DC_PIN_ACTIVE and DC_PIN_SPARE on this configuration.")
}
let signedByAPinnedKey = keys.contains { raw in
    guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: raw) else { return false }
    return key.isValidSignature(signature, for: indexData)
}
guard signedByAPinnedKey else {
    fail("""
        the bundle snapshot in \(dir.path) is not signed by a key this configuration pins. A Release build would \
        ship a snapshot the app itself refuses, leaving the app with no offline data. Build the bundle with the \
        release key (`pnpm build:bundle:release`) and try again.
        """)
}

struct Index: Decodable {
    var version: String
    var generated_at: String
    var files: [String: Meta]
    struct Meta: Decodable { var sha256: String; var bytes: Int }
}
guard let index = try? JSONDecoder().decode(Index.self, from: indexData) else { fail("index.json is signed but is not the index JSON.") }

for (name, meta) in index.files {
    guard let data = try? Data(contentsOf: dir.appendingPathComponent(name)) else {
        fail("the snapshot is missing \(name), which its signed index lists.")
    }
    let sum = hex(Data(SHA256.hash(data: data)))
    guard sum == meta.sha256 else { fail("\(name) in the snapshot does not match the checksum in the signed index.") }
}

// The floor: this build will never accept a list older than the one it ships with, even on a first launch.
do { try Data(index.generated_at.utf8).write(to: floorFile, options: .atomic) }
catch { fail("could not write the bundle floor to \(floorFile.path): \(error)") }

print("Bundle snapshot: \(index.version) of \(index.generated_at), signed by a pinned key, \(index.files.count) files checked.")
