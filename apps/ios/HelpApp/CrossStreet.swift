// The location card: the three ways a person can say where they are, the "Still looking…" state, and the
// cross-street field. The Swift half of `locChip`, `crossBox` and `slowBanner` in apps/web/src/main.ts.
//
// **Nothing here is written down and nothing is sent.** A typed junction is resolved on this phone against the
// street geometry in the signed bundle (HelpCore/Intersections.swift); what was typed lives in one `@State` that
// dies with the screen, and the point it becomes lives in `Here`, in memory, like every other position (docs/08).
import DetroitQuery
import HelpCore
import SwiftUI

/**
 "Use my location", "Type a cross street", "Type a ZIP code" — in the app's own words and colours (docs/05: asked
 on the tap, never at launch), and beside them whatever the phone is doing about it.

 `crossFirst` is the Directions screen and nothing else: there the cross-street field is opened and put ahead of
 "Use my location", because it is the only one of the three that works with no satellite and no signal at all,
 and that screen is the one a person with neither is on (DECISIONS 2026-09-22). The buttons, the handlers and
 the words are the same three everywhere; only the order changes.
 */
struct LocationChip: View {
    @EnvironmentObject private var here: Here
    @EnvironmentObject private var store: BundleStore
    @Environment(MapModel.self) private var map
    /// The Directions screen: the field is open before anything is tapped, and it comes first.
    var crossFirst = false
    /// Which field is showing. Tapping a chip opens one, exactly as on the web, so the common case stays buttons.
    @State private var typing: Field?
    @State private var zipText = ""
    @State private var crossText = ""
    @State private var outcome: CrossOutcome?
    /// True once this screen has asked for the street map. It is asked for on the first tap, never at launch.
    @State private var wantedStreets = false
    @FocusState private var focused: Field?

    enum Field: Hashable { case zip, cross }

    private var zips: ZipCenters { store.bundle?.zips ?? ZipCenters(points: [:]) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if here.point == nil {
                if here.slow { slowBanner }
                ways
                if typing == .cross { crossField }
                if typing == .zip { zipField }
                if here.denied {
                    Text(L.t(here.permanentlyDenied ? "loc.denied_settings" : "loc.denied"))
                        .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                }
                Text(L.t(here.zipUnknown ? "loc.zip_unknown" : "loc.note"))
                    .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                using
            }
        }
        .animation(nil, value: typing)
        .task(id: wantedStreets) { if wantedStreets { await map.ensureCrossStreets(from: store) } }
        .onAppear {
            guard crossFirst, typing == nil, here.point == nil else { return }
            openCross(focus: false)
        }
    }

    // MARK: the three ways in

    @ViewBuilder private var ways: some View {
        // A row that becomes a column when the words are large: three chips side by side cut each other up.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { chips }
            VStack(alignment: .leading, spacing: 10) { chips }
        }
    }

    @ViewBuilder private var chips: some View {
        ForEach(dirWays(crossFirst: crossFirst), id: \.rawValue) { way in
            switch way {
            case .use: useButton
            case .cross: if typing != .cross { chip(L.t("loc.cross")) { openCross(focus: true) } }
            case .zip:
                if !zips.isEmpty, typing != .zip {
                    chip(L.t("loc.zip")) { typing = .zip; here.zipUnknown = false; focused = .zip }
                }
            }
        }
    }

    private var useButton: some View {
        Button { here.ask() } label: {
            HStack(spacing: 8) {
                Image(systemName: "location.fill")
                Text(L.t("loc.use")).fontWeight(.semibold)
            }
            .font(.subheadline).foregroundStyle(Color.brandInk)
            .padding(.horizontal, 16).padding(.vertical, 11)
            .background(Color.brand, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(here.asking)
        .opacity(here.asking ? 0.6 : 1)
    }

    private func chip(_ title: String, _ go: @escaping () -> Void) -> some View {
        Button(action: go) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    /// What the screen says once it has a point: where the list is sorted from, and the way back.
    private var using: some View {
        HStack(spacing: 10) {
            Text(sortedFrom).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            Button(L.t(stopKey)) { here.forget(); zipText = ""; crossText = ""; outcome = nil; typing = nil }
                .font(.footnote.weight(.semibold)).foregroundStyle(Color.brand)
        }
    }
    private var sortedFrom: String {
        switch here.originKind {
        case .zip: return L.t("loc.zip_using", ["zip": here.zip ?? ""])
        case .cross: return L.t("loc.cross_using", ["where": here.cross ?? ""])
        default: return L.t("loc.using")
        }
    }
    private var stopKey: String {
        switch here.originKind {
        case .zip: return "loc.zip_off"
        case .cross: return "loc.cross_off"
        default: return "loc.off"
        }
    }

    // MARK: "Still looking…"

    /// The ask has been running ten seconds. It says what is taking the time and what actually helps, it leaves
    /// both the other ways in on the screen beside it, and it can be stopped. No spinner: a spinner says "wait"
    /// and says nothing about going outside.
    private var slowBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L.t("loc.slow")).font(.subheadline).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
            Button(L.t("loc.slow_stop")) {
                here.stopAsking()
                AccessibilityNotification.Announcement(L.t("loc.slow_stopped")).post()
            }
            .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: a typed ZIP

    /// Five digits and a "Sort" button. The keyboard is the number pad, and the field offers **no autofill**:
    /// `.postalCode` would have iOS offer the ZIP on this person's own contact card above the keyboard, which is
    /// their home address appearing on a screen they did not put it on.
    private var zipField: some View {
        HStack(spacing: 8) {
            TextField("", text: $zipText)
                .keyboardType(.numberPad)
                .textContentType(nil)
                .autocorrectionDisabled()
                .focused($focused, equals: .zip)
                .accessibilityLabel(L.t("loc.zip_label"))
                .onChange(of: zipText) { _, v in
                    let digits = v.filter(\.isNumber)
                    if digits != v || digits.count > 5 { zipText = String(digits.prefix(5)) }
                    if here.zipUnknown { here.zipUnknown = false }
                }
                .onSubmit(sortByZip)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(here.zipUnknown ? Color.warnInk : Color.line, lineWidth: 1))
            Button(L.t("loc.zip_go"), action: sortByZip)
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brandInk)
                .padding(.horizontal, 16).padding(.vertical, 11)
                .background(Color.brand, in: Capsule())
                .buttonStyle(.plain)
                .disabled(normalizedZip(zipText) == nil)
                .opacity(normalizedZip(zipText) == nil ? 0.6 : 1)
        }
    }

    private func sortByZip() {
        here.use(zip: zipText, from: zips)
        if here.point != nil { typing = nil; focused = nil }
    }

    // MARK: a typed cross street

    private func openCross(focus: Bool) {
        typing = .cross
        outcome = nil
        here.zipUnknown = false
        wantedStreets = true
        if focus { focused = .cross }
    }

    /// The field, then whatever this phone made of what was typed: a note, or a short list when two streets
    /// cross more than once (Woodward and 7 Mile do, on either side of the city) — a question, never a guess.
    private var crossField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                TextField("", text: $crossText)
                    .textInputAutocapitalization(.words)
                    .textContentType(nil)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .cross)
                    .accessibilityLabel(L.t("loc.cross_label"))
                    .onSubmit(resolveCross)
                    .onChange(of: crossText) { _, v in
                        if v.count > 60 { crossText = String(v.prefix(60)) }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(crossIsWrong ? Color.warnInk : Color.line, lineWidth: 1))
                Button(L.t("loc.cross_go"), action: resolveCross)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brandInk)
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .background(Color.brand, in: Capsule())
                    .buttonStyle(.plain)
                    .disabled(crossText.trimmingCharacters(in: .whitespaces).isEmpty)
                    .opacity(crossText.trimmingCharacters(in: .whitespaces).isEmpty ? 0.6 : 1)
            }
            Text(crossNote).font(.footnote).foregroundStyle(crossIsWrong ? Color.warnInk : Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if case .choices(_, _, let choices) = outcome {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(choices.enumerated()), id: \.offset) { _, c in
                        Button { take(c.point, words: crossWords(c)) } label: {
                            HStack(spacing: 10) {
                                Text(crossWords(c)).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 11)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func crossWords(_ c: CrossOutcome.Choice) -> String {
        guard case .choices(let a, let b, _) = outcome else { return "" }
        return L.t("loc.cross_choice", ["a": a, "b": b, "where": L.t("loc.where_" + c.whereWord)])
    }

    private var crossIsWrong: Bool {
        switch outcome {
        case .unknown, .noCrossing: return true
        default: return false
        }
    }

    private var crossNote: String {
        switch outcome {
        case .unknown(let street): return L.t("loc.cross_unknown", ["street": street])
        case .noCrossing(let a, let b): return L.t("loc.cross_no_crossing", ["a": a, "b": b])
        case .street(_, let a): return L.t("loc.cross_one_street", ["street": a])
        default: return map.crossFailed ? L.t("map.no_streets") : L.t("loc.cross_hint")
        }
    }

    private func resolveCross() {
        guard let streets = map.crossStreets else {
            outcome = nil
            AccessibilityNotification.Announcement(L.t("map.no_streets")).post()
            return
        }
        let answer = streets.resolve(crossText)
        outcome = answer
        switch answer {
        case .point(let p, let a, let b): take(p, words: "\(a) & \(b)")
        case .street(let p, let a): take(p, words: a)
        case .choices(_, _, let choices):
            AccessibilityNotification.Announcement(L.t("loc.cross_choices_say", ["count": String(choices.count)])).post()
        case .unknown, .noCrossing, .none:
            AccessibilityNotification.Announcement(crossNote).post()
        }
    }

    private func take(_ p: LatLon, words: String) {
        here.use(cross: words, at: p)
        typing = nil
        focused = nil
        crossText = ""
        outcome = nil
        AccessibilityNotification.Announcement(L.t("loc.cross_using", ["where": words])).post()
    }
}
