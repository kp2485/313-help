// Checking a bundle before anything in it is believed (docs/06): the Ed25519 signature on index.json against the
// keys this build pins, then every file against the checksum the index gives. Pure functions, so the app tests can
// prove that a bundle signed with another key, or a file with one byte changed, is refused.
import CryptoKit
import DetroitQuery
import Foundation

struct BundleIndex: Codable {
    var version: String
    var generatedAt: String
    var retired: Bool?
    var signing: String
    var files: [String: FileMeta]
    struct FileMeta: Codable { var sha256: String; var bytes: Int }
}

enum BundleError: Error, Equatable { case badSignature, badChecksum(String), older, notJSON }

enum BundleCheck {
    static func sha256Hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    /// The index, only if one of the pinned public keys signed it. No key, no bundle: an unsigned or mis-signed
    /// list is refused outright, and a build that pins nothing can never accept one.
    static func verifiedIndex(_ indexData: Data, sig sigData: Data, pinned: [String]) throws -> BundleIndex {
        struct Sig: Codable { var signature: String }
        guard let decoded = try? JSONDecoder().decode(Sig.self, from: sigData), let sig = Data(base64Encoded: decoded.signature) else { throw BundleError.badSignature }
        // SPKI DER for Ed25519 is a fixed 12-byte header and the 32-byte key.
        let ok = pinned.contains { spki in
            guard let der = Data(base64Encoded: spki), der.count >= 32,
                  let key = try? Curve25519.Signing.PublicKey(rawRepresentation: der.suffix(32)) else { return false }
            return key.isValidSignature(sig, for: indexData)
        }
        guard ok else { throw BundleError.badSignature }
        guard let index = try? bundleDecoder().decode(BundleIndex.self, from: indexData) else { throw BundleError.notJSON }
        return index
    }

    /// A bundle older than the one this phone already trusts is refused, so nobody can push a phone backwards.
    static func refusesOlder(current: BundleIndex?, next: BundleIndex) -> Bool {
        guard let current else { return false }
        return next.generatedAt < current.generatedAt
    }

    /// Maps and neighborhood numbers are big and are loaded only when a screen asks for them.
    static func loadedNow(_ name: String) -> Bool { !name.hasPrefix("map/") && !name.hasPrefix("indicators/") }
}
