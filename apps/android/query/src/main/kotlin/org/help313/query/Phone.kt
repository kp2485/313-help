// Phone links. Port of apps/web/src/phone.ts and apps/ios/Sources/DetroitQuery/Phone.swift.
// A listed number can carry an extension ("313-579-2100 ext. 4217"); run together, the digits would dial a
// stranger. The extension goes after a pause (","), so the phone dials the main number, waits, then keys it in.
package org.help313.query

private val EXT = Regex("\\s*(?:ext\\.?|extension|x|#)\\s*(\\d{1,6})\\s*$", RegexOption.IGNORE_CASE)

fun telLink(n: String): String {
    val m = EXT.find(n)
    val main = if (m != null) n.substring(0, m.range.first) else n
    var digits = main.filter { it.isDigit() && it.code < 128 || it == '+' }
    if (digits.length == 10 && digits.all { it.isDigit() }) digits = "+1$digits"
    else if (digits.length == 11 && digits.startsWith("1") && digits.all { it.isDigit() }) digits = "+$digits"
    val ext = m?.groupValues?.get(1)
    return "tel:" + digits + (if (ext != null) ",$ext" else "")
}
