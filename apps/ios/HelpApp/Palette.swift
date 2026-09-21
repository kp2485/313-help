// The web app's design system (apps/web/src/style.css), in code, so no asset catalog is needed: the green palette
// for light and dark, and the few pieces every screen is built from (cards, section headings, pills, rows, tiles).
// Rules carried over from the web: system fonts and dynamic type everywhere, so text grows to the largest
// accessibility sizes and nothing truncates; phone numbers never wrap mid-number; colour never carries meaning on
// its own, every state also has words; red is kept for 911.
import DetroitQuery
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
    static let brandSoftInk = pair(0x0A5236, 0xA6EBC8)
    static let brandInk = pair(0xFFFFFF, 0x04140C)
    static let appBg = pair(0xF4F7F4, 0x0B1410)
    static let surface = pair(0xFFFFFF, 0x121E18)
    static let ink = pair(0x10201A, 0xE9F1EC)
    static let muted = pair(0x47584F, 0xA3B5AA)
    static let line = pair(0xD9E3DC, 0x25362D)
    static let warnBg = pair(0xFDF1D8, 0x33270A)
    static let warnInk = pair(0x6B4300, 0xFFD98A)
    static let danger = pair(0x8F1D1D, 0xE26A6A)
}

/// The app's background behind every screen, including Lists.
struct AppBackground: ViewModifier {
    func body(content: Content) -> some View {
        content.scrollContentBackground(.hidden).background(Color.appBg.ignoresSafeArea())
    }
}
/// A list row that carries its own card: no separators, no grouped-list chrome.
struct PlainRow: ViewModifier {
    func body(content: Content) -> some View {
        content.listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
    }
}
extension View {
    func appBackground() -> some View { modifier(AppBackground()) }
    func plainRow() -> some View { modifier(PlainRow()) }
    /// A white (or dark green) card, the shape the whole app is built from.
    func card(padding: CGFloat = 16) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.line, lineWidth: 1))
    }
}

/// "RIGHT NOW", "THIS WEEK": small, spaced capitals, like the web app's h2.
struct SectionHead: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.footnote.weight(.bold)).kerning(0.8).foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 14).padding(.bottom, 2)
    }
}

/// "Open now", "Closed now", a distance: a word first, a colour second.
struct Pill: View {
    let text: String
    var tone: Tone = .plain
    enum Tone { case open, closed, plain }
    /// "Open now" reads as open, "Closed now" as closed; "Call first" and "Hours unknown" carry no colour at all.
    static func tone(for state: OpenState) -> Tone {
        switch state {
        case .open, .closes_soon: return .open
        case .closed: return .closed
        // A holiday is never the open colour. The words say "Call first" and the colour agrees with them.
        case .holiday: return .closed
        case .call_first, .unknown, .not_listed: return .plain
        }
    }
    var body: some View {
        Text(text).font(.subheadline.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5)
            .background(tone == .open ? Color.brandSoft : tone == .closed ? Color.warnBg : Color.appBg, in: Capsule())
            .foregroundStyle(tone == .open ? Color.brandSoftInk : tone == .closed ? Color.warnInk : Color.muted)
    }
}

/// The rounded green square an icon sits in, on rows and tiles.
struct IconBadge: View {
    let symbol: String
    var big = false
    var body: some View {
        Image(systemName: symbol).font(big ? .title3 : .body).foregroundStyle(Color.brandSoftInk)
            .frame(width: big ? 44 : 38, height: big ? 44 : 38)
            .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: big ? 14 : 12))
    }
}

/// A full-width row that leads somewhere: icon, words, chevron. Used for the urgent needs, in their own words.
struct NavRow<Destination: View>: View {
    let title: String
    let symbol: String
    var subtitle: String? = nil
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 14) {
                IconBadge(symbol: symbol)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
            }.card()
        }.buttonStyle(.plain)
    }
}

/// A short tile, two to a row: the same screens in fewer words, so a long list still fits a phone.
struct NavTile<Destination: View>: View {
    let title: String
    let symbol: String
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: symbol).font(.body).foregroundStyle(Color.brand).frame(width: 24)
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, minHeight: tileHeight, alignment: .leading)
            .card(padding: 14)
        }.buttonStyle(.plain)
    }
}

/// Two equal columns, and one height for every tile, so the grid reads as a grid. A tile still grows if someone
/// turns text size up: nothing is ever cut off.
let tileColumns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
let tileHeight: CGFloat = 58
