// Search runs on the device (schema/query-spec.md "Search"); the typed text is never stored or sent.
// Port of packages/query/src/search.ts.
import Foundation

/// Lowercase, accents removed, anything that is not a letter or digit becomes a space.
public func normalizeText(_ s: String) -> String {
    let folded = s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX")).lowercased()
    var out = "", space = false
    for ch in folded.unicodeScalars {
        if (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") { out.unicodeScalars.append(ch); space = false }
        else if !space { out.append(" "); space = true }
    }
    return out.trimmingCharacters(in: .whitespaces)
}

/// Words of the query. Fewer than 2 letters or digits in total: no tokens.
public func searchTokens(_ text: String) -> [String] {
    let words = normalizeText(text).split(separator: " ").map(String.init)
    return words.joined().count < 2 ? [] : words
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
