// Search runs on the device (schema/query-spec.md "Search"); the typed text is never stored or sent.
// Port of packages/query/src/search.ts.
import Foundation

private func isLetter(_ c: Unicode.Scalar) -> Bool {
    switch c.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
    default: return false
    }
}
private func isWordScalar(_ c: Unicode.Scalar) -> Bool {
    if isLetter(c) { return true }
    switch c.properties.generalCategory {
    case .decimalNumber, .letterNumber, .otherNumber: return true
    default: return false
    }
}
private func isMark(_ c: Unicode.Scalar) -> Bool {
    switch c.properties.generalCategory {
    case .nonspacingMark, .spacingMark, .enclosingMark: return true
    default: return false
    }
}
private let apostrophes: Set<Unicode.Scalar> = ["'", "\u{2019}", "\u{2018}", "\u{02BC}"]

/// Lowercase; accents and other combining marks removed; letters and digits of any script kept. Apostrophes join
/// ("Mary's" → "marys"); a dot joins single-letter abbreviations ("U.S." → "us") and otherwise separates, like
/// every other character. Words are separated by one space.
public func normalizeText(_ s: String) -> String {
    let cs = Array(s.lowercased().decomposedStringWithCanonicalMapping.unicodeScalars.filter { !isMark($0) })
    var out = String.UnicodeScalarView(), seg = 0   // seg: letters since the word began or the last joining dot
    for (i, c) in cs.enumerated() {
        if isWordScalar(c) { out.append(c); seg += 1; continue }
        if apostrophes.contains(c), seg > 0 { continue }
        if c == ".", seg == 1, let last = out.last, isLetter(last), i + 1 < cs.count, isLetter(cs[i + 1]) { seg = 0; continue }
        if let last = out.last, last != " " { out.append(" ") }
        seg = 0
    }
    return String(out).trimmingCharacters(in: .whitespaces)
}

/// Words of the query. Fewer than 2 letters or digits in total: no tokens.
public func searchTokens(_ text: String) -> [String] {
    let words = normalizeText(text).split(separator: " ").map(String.init)
    return words.joined().unicodeScalars.count < 2 ? [] : words
}

private func hits(_ tokens: [String], _ fields: [String?]) -> Bool {
    let words = normalizeText(fields.compactMap { $0 }.joined(separator: " ")).split(separator: " ")
    return tokens.allSatisfy { t in words.contains { $0.hasPrefix(t) } }
}

/// 0: every token starts a word of the name. 1: of name or org. 2: of any searched text. nil: no match.
public func matchTier(_ tokens: [String], name: String, org: String? = nil, what: String? = nil, eligibility: String? = nil, street: String? = nil, zip: String? = nil) -> Int? {
    guard !tokens.isEmpty else { return nil }
    if hits(tokens, [name]) { return 0 }
    if hits(tokens, [name, org]) { return 1 }
    if hits(tokens, [name, org, what, eligibility, street, zip]) { return 2 }
    return nil
}

public func search(_ rows: [BundleRow], _ text: String, _ q: Query, now: Date, alerts: [Alert] = []) -> [Ranked] {
    let tokens = searchTokens(text)
    var tier: [String: Int] = [:]
    for r in rows { if let m = matchTier(tokens, name: r.name, org: r.org, what: r.what, eligibility: r.eligibility, street: r.address?.line1, zip: r.address?.zip) { tier[r.id] = m } }
    let ranked = rank(rows.filter { tier[$0.id] != nil }, q, now: now, alerts: alerts)
    return ranked.enumerated().sorted { a, b in
        let ta = tier[a.element.row.id]!, tb = tier[b.element.row.id]!
        return ta != tb ? ta < tb : a.offset < b.offset
    }.map(\.element)
}
