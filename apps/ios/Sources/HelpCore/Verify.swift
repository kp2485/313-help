// Checking a bundle before anything in it is believed (docs/06): the Ed25519 signature on index.json against the
// keys this build pins, then every file against the checksum the index gives. Pure functions, so the tests can
// prove that a bundle signed with another key, or a file with one byte changed, is refused.
//
// The signature *maths* is CryptoKit's on a phone. Everything around it — what shape a pinned key may be, which
// keys are refused outright, what a signature may not be, and which bundle is too old to accept — is plain byte
// work here, so `swift test` checks it on Linux as well (apps/ios/README.md).
#if canImport(CryptoKit)
import CryptoKit
#endif
import DetroitQuery
import Foundation

public struct BundleIndex: Codable, Sendable {
    public var version: String
    public var generatedAt: String
    public var retired: Bool?
    public var signing: String
    public var files: [String: FileMeta]
    public struct FileMeta: Codable, Sendable { public var sha256: String; public var bytes: Int }
}

public enum BundleError: Error, Equatable {
    case badSignature
    case badChecksum(String)
    case older
    case notJSON
    /// No way to check an Ed25519 signature on this platform. It is an error, never a pass.
    case noVerifier
}

/// Given the 32 raw bytes of a public key, a signature and the bytes that were signed: did that key sign them?
public typealias Ed25519Verify = @Sendable (_ rawKey: Data, _ signature: Data, _ message: Data) -> Bool

public enum BundleCheck {
    public static func sha256Hex(_ data: Data) -> String { Hash.sha256Hex(data) }

    // ---- what a pinned key may be ---------------------------------------------------------------
    /// SPKI DER for an Ed25519 public key is a fixed 12-byte header and the 32-byte key: 44 bytes exactly.
    public static let spkiEd25519Prefix = "302a300506032b6570032100"

    /// The eight points of small order on Ed25519, in their canonical encodings: the identity (0, 1), the point of
    /// order 2, the two of order 4, and the four of order 8. A signature verifies under any of them for messages
    /// an attacker did not choose, so a build that pinned one would "verify" a list nobody signed. None of these is
    /// ever a real signing key; refusing them costs nothing and closes the hole (iPhone review, 2026-09-20).
    public static let smallOrderKeys = [
        "0100000000000000000000000000000000000000000000000000000000000000",   // identity, (0, 1)
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",   // order 2, (0, -1)
        "0000000000000000000000000000000000000000000000000000000000000000",   // order 4
        "0000000000000000000000000000000000000000000000000000000000000080",   // order 4, other sign
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",   // order 8
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
    ]

    /// q = 2^255 - 19, little-endian, which is what an encoded point's y is compared against.
    private static let fieldOrderLE: [UInt8] = {
        var p = [UInt8](repeating: 0xff, count: 32)
        p[0] = 0xed
        p[31] = 0x7f
        return p
    }()

    /// The 32 raw bytes of a pinned key, or nil when the value is not a key this app will ever accept.
    ///
    /// It takes the whole thing or nothing: `der.suffix(32)` of anything 32 bytes or longer used to be enough,
    /// which accepted a raw key with no header, a key with junk in front of it, and a 44-byte blob whose header
    /// said something else entirely (iPhone review, 2026-09-20).
    public static func rawPinnedKey(_ base64: String) -> Data? {
        guard let der = Data(base64Encoded: base64.trimmingCharacters(in: .whitespaces)), der.count == 44 else { return nil }
        let hex = Hash.hex(der)
        guard hex.hasPrefix(spkiEd25519Prefix) else { return nil }
        let raw = der.suffix(32)
        guard isAcceptablePoint(Data(raw)) else { return nil }
        return Data(raw)
    }

    /// A 32-byte encoded point we are willing to treat as a signing key: not one of the small-order points, and
    /// its y written the one canonical way (y < q), so two spellings of the same key cannot both be pinned.
    public static func isAcceptablePoint(_ raw: Data) -> Bool {
        guard raw.count == 32 else { return false }
        if smallOrderKeys.contains(Hash.hex(raw)) { return false }
        var y = [UInt8](raw)
        y[31] &= 0x7f                                     // the top bit is the sign of x, not part of y
        for i in stride(from: 31, through: 0, by: -1) {
            if y[i] != fieldOrderLE[i] { return y[i] < fieldOrderLE[i] }
        }
        return false                                      // y == q is not a number in the field
    }

    /// A signature that could never be a real one: the wrong length, or all zeros. An all-zero signature is the
    /// shape an attacker sends when they are hoping a small-order key was pinned; it is refused before any maths.
    public static func isUsableSignature(_ sig: Data) -> Bool {
        sig.count == 64 && sig.contains { $0 != 0 }
    }

    // ---- the check itself -------------------------------------------------------------------------
    #if canImport(CryptoKit)
    /// CryptoKit's Ed25519. The only place this app does the maths.
    public static let systemVerify: Ed25519Verify? = { raw, sig, msg in
        guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: raw) else { return false }
        return key.isValidSignature(sig, for: msg)
    }
    #else
    /// No Ed25519 on this platform (Linux, where the tests run): there is nothing to check a signature with, so a
    /// caller gets `BundleError.noVerifier` rather than a bundle.
    public static let systemVerify: Ed25519Verify? = nil
    #endif

    /// The index, only if one of the pinned public keys signed it. No key, no bundle: an unsigned or mis-signed
    /// list is refused outright, and a build that pins nothing can never accept one.
    public static func verifiedIndex(_ indexData: Data, sig sigData: Data, pinned: [String],
                                     verify: Ed25519Verify? = BundleCheck.systemVerify) throws -> BundleIndex {
        struct Sig: Codable { var signature: String }
        guard let decoded = try? JSONDecoder().decode(Sig.self, from: sigData),
              let sig = Data(base64Encoded: decoded.signature), isUsableSignature(sig) else { throw BundleError.badSignature }
        let keys = pinned.compactMap(rawPinnedKey)
        guard !keys.isEmpty else { throw BundleError.badSignature }
        guard let verify else { throw BundleError.noVerifier }
        guard keys.contains(where: { verify($0, sig, indexData) }) else { throw BundleError.badSignature }
        guard let index = try? bundleDecoder().decode(BundleIndex.self, from: indexData) else { throw BundleError.notJSON }
        return index
    }

    /// A bundle older than the one this phone already trusts is refused, so nobody can push a phone backwards.
    ///
    /// `floor` is the snapshot this build shipped with (Release writes it in at build time). Without it a *fresh*
    /// install trusted nothing yet, so any correctly signed old list was newer than nothing at all and a phone
    /// could be started off months in the past (iPhone review, 2026-09-20).
    public static func refusesOlder(current: BundleIndex?, next: BundleIndex, floor: String? = nil) -> Bool {
        let held = [current?.generatedAt, floor].compactMap { $0 }.max()
        guard let held else { return false }
        return next.generatedAt < held
    }

    /// Maps and neighborhood numbers are big and are loaded only when a screen asks for them.
    public static func loadedNow(_ name: String) -> Bool { !name.hasPrefix("map/") && !name.hasPrefix("indicators/") }
}
