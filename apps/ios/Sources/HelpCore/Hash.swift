// SHA-256, the one hash this app needs: the per-target daily dedupe nonce (docs/08) and the checksum of every
// file in a signed bundle (docs/06).
//
// CryptoKit is an Apple framework and does not exist on Linux, where `swift test` runs in CI. Rather than take a
// dependency (CLAUDE.md prefers none), this file carries a small SHA-256 of its own and uses CryptoKit where it
// exists. `HashTests` checks the two against each other on Apple and against the published FIPS vectors
// everywhere, so the copy that CI exercises is the same function the phone uses.
#if canImport(CryptoKit)
import CryptoKit
#endif
import Foundation

public enum Hash {
    public static func sha256(_ data: Data) -> Data {
        #if canImport(CryptoKit)
        return Data(CryptoKit.SHA256.hash(data: data))
        #else
        return PureSHA256.hash(data)
        #endif
    }

    public static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
    public static func sha256Hex(_ data: Data) -> String { hex(sha256(data)) }

    /// 32 random bytes from the system's cryptographic generator (`SystemRandomNumberGenerator`, which is
    /// `arc4random_buf` on Apple and `getrandom` on Linux). Nothing about the phone goes into it.
    public static func randomBytes(_ count: Int) -> Data {
        var g = SystemRandomNumberGenerator()
        var out = Data(count: count)
        for i in 0..<count { out[i] = UInt8.random(in: 0...255, using: &g) }
        return out
    }
}

/// FIPS 180-4 SHA-256, written out plainly. It exists so the rules above can be tested where CryptoKit is not.
public enum PureSHA256 {
    private static let k: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]

    public static func hash(_ message: Data) -> Data {
        var h: [UInt32] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        var m = Data(message)
        let bits = UInt64(message.count) * 8
        m.append(0x80)
        while m.count % 64 != 56 { m.append(0) }
        for shift in stride(from: 56, through: 0, by: -8) { m.append(UInt8((bits >> UInt64(shift)) & 0xff)) }

        var w = [UInt32](repeating: 0, count: 64)
        m.withUnsafeBytes { raw in
            for block in stride(from: 0, to: raw.count, by: 64) {
                for i in 0..<16 {
                    let at = block + i * 4
                    w[i] = UInt32(raw[at]) << 24 | UInt32(raw[at + 1]) << 16 | UInt32(raw[at + 2]) << 8 | UInt32(raw[at + 3])
                }
                for i in 16..<64 {
                    let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
                    let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
                    w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
                }
                var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
                for i in 0..<64 {
                    let s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                    let ch = (e & f) ^ (~e & g)
                    let t1 = hh &+ s1 &+ ch &+ k[i] &+ w[i]
                    let s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                    let maj = (a & b) ^ (a & c) ^ (b & c)
                    let t2 = s0 &+ maj
                    hh = g; g = f; f = e; e = d &+ t1; d = c; c = b; b = a; a = t1 &+ t2
                }
                h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
                h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
            }
        }
        var out = Data(capacity: 32)
        for v in h { for shift in stride(from: 24, through: 0, by: -8) { out.append(UInt8((v >> UInt32(shift)) & 0xff)) } }
        return out
    }

    private static func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
}
