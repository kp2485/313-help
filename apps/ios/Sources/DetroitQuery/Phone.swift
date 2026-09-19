// Phone links. Port of apps/web/src/phone.ts. A listed number can carry an extension ("313-579-2100 ext. 4217");
// run together, the digits would dial a stranger. The extension goes after a pause (",").
import Foundation

public func telLink(_ n: String) -> String {
    var main = n, ext: String?
    if let r = n.range(of: #"\s*(?:ext\.?|extension|x|#)\s*(\d{1,6})\s*$"#, options: [.regularExpression, .caseInsensitive]) {
        main = String(n[..<r.lowerBound])
        ext = String(n[r].filter(\.isNumber))
    }
    var digits = String(main.filter { $0.isASCII && ($0.isNumber || $0 == "+") })
    if digits.count == 10, digits.allSatisfy(\.isNumber) { digits = "+1" + digits }
    else if digits.count == 11, digits.hasPrefix("1"), digits.allSatisfy(\.isNumber) { digits = "+" + digits }
    return "tel:" + digits + (ext.map { "," + $0 } ?? "")
}
