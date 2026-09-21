// Search runs on the device over the bundle (schema/query-spec.md "Search"). The text a person types is never
// stored, sent, or put in a URL. Port of packages/query/src/search.ts.
// Fixtures: schema/fixtures/10-search.json.
package org.help313.query

import java.text.Normalizer

private fun isLetter(cp: Int): Boolean = when (Character.getType(cp).toByte()) {
    Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER,
    Character.MODIFIER_LETTER, Character.OTHER_LETTER -> true
    else -> false
}

private fun isWordChar(cp: Int): Boolean {
    if (isLetter(cp)) return true
    return when (Character.getType(cp).toByte()) {
        Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER -> true
        else -> false
    }
}

private fun isMark(cp: Int): Boolean = when (Character.getType(cp).toByte()) {
    Character.NON_SPACING_MARK, Character.COMBINING_SPACING_MARK, Character.ENCLOSING_MARK -> true
    else -> false
}

private val APOSTROPHES = setOf('\''.code, 0x2019, 0x2018, 0x02BC)

private fun codePoints(s: String): IntArray {
    val out = IntArray(s.codePointCount(0, s.length))
    var i = 0
    var n = 0
    while (i < s.length) {
        val cp = s.codePointAt(i)
        out[n++] = cp
        i += Character.charCount(cp)
    }
    return out
}

/**
 * Lowercase; accents and other combining marks removed; letters and digits of any script kept. Apostrophes join
 * ("Mary's" -> "marys"); a dot joins single-letter abbreviations ("U.S." -> "us") and otherwise separates, like
 * every other character. Words are separated by one space.
 */
fun normalizeText(s: String): String {
    val decomposed = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD)
    val cs = codePoints(decomposed).filter { !isMark(it) }
    val out = StringBuilder()
    var lastCp = -1
    var seg = 0   // letters since the word began or since the last joining dot
    for (i in cs.indices) {
        val c = cs[i]
        if (isWordChar(c)) {
            out.appendCodePoint(c); lastCp = c; seg++; continue
        }
        if (c in APOSTROPHES && seg > 0) continue
        if (c == '.'.code && seg == 1 && lastCp >= 0 && isLetter(lastCp) &&
            i + 1 < cs.size && isLetter(cs[i + 1])
        ) { seg = 0; continue }
        if (out.isNotEmpty() && lastCp != ' '.code) { out.append(' '); lastCp = ' '.code }
        seg = 0
    }
    return out.toString().trim()
}

/** Words of the query. A query with fewer than 2 letters or digits in total has no tokens. */
fun searchTokens(text: String): List<String> {
    val words = normalizeText(text).split(" ").filter { it.isNotEmpty() }
    val joined = words.joinToString("")
    return if (joined.codePointCount(0, joined.length) < 2) emptyList() else words
}

private fun hits(tokens: List<String>, fields: List<String?>): Boolean {
    val words = normalizeText(fields.filterNotNull().joinToString(" ")).split(" ")
    return tokens.all { tok -> words.any { it.startsWith(tok) } }
}

/**
 * 0: every token starts a word of the name. 1: of the name or organization. 2: of any searched text
 * (name, organization, what, who, street, ZIP). null: no match.
 */
fun matchTier(
    tokens: List<String>,
    name: String,
    org: String? = null,
    what: String? = null,
    eligibility: String? = null,
    street: String? = null,
    zip: String? = null,
): Int? {
    if (tokens.isEmpty()) return null
    if (hits(tokens, listOf(name))) return 0
    if (hits(tokens, listOf(name, org))) return 1
    if (hits(tokens, listOf(name, org, what, eligibility, street, zip))) return 2
    return null
}

fun matchTier(tokens: List<String>, row: BundleRow): Int? =
    matchTier(tokens, row.name, row.org, row.what, row.eligibility, row.address?.line1, row.address?.zip)

/** Matching active rows: best match tier first, then the one ranking rule. */
fun search(
    rows: List<BundleRow>,
    text: String,
    q: Query,
    nowMillis: Long,
    alerts: List<Alert> = emptyList(),
): List<Ranked> {
    val tokens = searchTokens(text)
    val tier = HashMap<String, Int>()
    for (r in rows) matchTier(tokens, r)?.let { tier[r.id] = it }
    val ranked = rank(rows.filter { tier.containsKey(it.id) }, q, nowMillis, alerts)
    return ranked.withIndex()
        .sortedWith(compareBy({ tier.getValue(it.value.row.id) }, { it.index }))
        .map { it.value }
}
