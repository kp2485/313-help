// The web app's green palette (apps/web/src/style.css), light and dark. In code, so no asset catalog is needed.
import SwiftUI
import UIKit

private func pair(_ light: UInt32, _ dark: UInt32) -> Color {
    func c(_ v: UInt32) -> UIColor { UIColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1) }
    return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? c(dark) : c(light) })
}
extension Color {
    static let brand = pair(0x0B6B43, 0x4FCF93)
    static let brandDeep = pair(0x063F29, 0x0B6B43)
    static let brandSoft = pair(0xE0F0E6, 0x15311F)
}
