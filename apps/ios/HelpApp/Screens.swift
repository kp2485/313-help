// The screens that are about this phone rather than about a place: reporting a problem, saved places, and
// About / Your privacy (docs/05, docs/08). Their words come from strings/en.json and strings/es.json, the same
// keys the web app uses, so the two apps say the same thing.
import DetroitQuery
import HelpCore
import SwiftUI

/// A date in the phone's language, from a bundle timestamp.
func prettyDate(_ iso: String) -> String {
    guard let day = parseDay(String(iso.prefix(10))) else { return String(iso.prefix(10)) }
    let f = DateFormatter()
    f.dateStyle = .medium
    f.timeZone = TimeZone(identifier: "UTC")
    return f.string(from: Date(timeIntervalSince1970: Double(day) * 86400))
}

// ---- report a problem --------------------------------------------------------------------------
/// One tap to confirm, one tap to correct (docs/04). Places get the things-not-people list (docs/11).
/// Nothing here carries a name, a number or a location: see Reports.swift for exactly what is sent.
struct ReportBox: View {
    let targetId: String
    var isPlace = false
    var category = ""
    @EnvironmentObject var reporter: Reporter
    @State private var open = false
    @State private var note = ""

    private var kinds: [String] { isPlace ? ReportKinds.place : ReportKinds.listing(for: category) }

    var body: some View {
        if let outcome = reporter.done[targetId] {
            // A report that could not even be written to this phone says so. Telling somebody "we will keep
            // trying" when nothing was kept is the one answer this screen must never give (iPhone review,
            // 2026-09-20).
            let failed = outcome == .failed
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: failed ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(failed ? Color.warnInk : Color.brandSoftInk)
                Text(failed
                     ? L.t("report.failed")
                     : L.t(outcome == .queued ? "report.queued" : isPlace ? "report.sent_place" : "report.sent"))
                    .font(.subheadline).foregroundStyle(failed ? Color.warnInk : Color.brandSoftInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(failed ? Color.warnBg : Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Button { submit(isPlace ? ReportKinds.confirmPlace : ReportKinds.confirmListing) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark")
                        Text(L.t(isPlace ? "report.confirm.place" : "report.confirm.listing")).fontWeight(.semibold)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .font(.subheadline).foregroundStyle(Color.brandSoftInk)
                    .padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(.plain)

                DisclosureGroup(isExpanded: $open) {
                    VStack(alignment: .leading, spacing: 10) {
                        if isPlace {
                            Text(L.t("report.things_only")).font(.footnote).foregroundStyle(Color.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Text(L.t("report.note_label")).font(.subheadline).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        // The label above is the field's name; the field itself carries no second copy of it.
                        TextField("", text: $note, axis: .vertical)
                            .lineLimit(2...5).textFieldStyle(.roundedBorder).autocorrectionDisabled()
                            .accessibilityLabel(L.t("report.note_label"))
                            .onChange(of: note) { _, v in if v.count > 280 { note = String(v.prefix(280)) } }
                        ForEach(kinds, id: \.self) { kind in
                            Button { submit(kind) } label: {
                                Text(L.t("report.kind." + kind)).font(.subheadline.weight(.semibold))
                                    .fixedSize(horizontal: false, vertical: true)
                                    .foregroundStyle(Color.brand)
                                    .padding(.horizontal, 14).padding(.vertical, 11).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line, lineWidth: 1))
                            }.buttonStyle(.plain)
                        }
                    }.padding(.top, 8)
                } label: {
                    Text(L.t(isPlace ? "report.fix" : "report.wrong")).font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.brand).fixedSize(horizontal: false, vertical: true)
                }
                .tint(Color.brand)
            }.card()
        }
    }

    private func submit(_ kind: String) {
        let text = note
        note = ""
        open = false
        Task { await reporter.submit(targetId: targetId, kind: kind, detail: text) }
    }
}

// ---- saved places ------------------------------------------------------------------------------
/// The Save button on a listing. It is simply absent for a listing that can't be saved (docs/08): no button,
/// no explanation that would itself say something about the person.
struct SaveButton: View {
    let row: BundleRow
    @EnvironmentObject var saved: Saved
    var body: some View {
        if canSave(row.category) {
            let on = saved.contains(row.id)
            Button { saved.toggle(row.id, category: row.category) } label: {
                HStack(spacing: 10) {
                    Image(systemName: on ? "bookmark.fill" : "bookmark")
                    Text(L.t(on ? "saved.remove" : "saved.add")).fontWeight(.semibold).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .foregroundStyle(Color.brand).padding(.horizontal, 16).padding(.vertical, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L.t(on ? "saved.remove" : "saved.add") + ": " + row.name)
            .accessibilityAddTraits(on ? [.isSelected] : [])
            if on { Text(L.t("saved.note")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
        }
    }
}

struct SavedView: View {
    @EnvironmentObject var store: BundleStore
    @EnvironmentObject var saved: Saved
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        // In the order they were saved, and never a listing that can't be saved any more.
        let rows = saved.ids.compactMap { id in (store.bundle?.rows ?? []).first { $0.id == id && canSave($0.category) } }
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            if let b = store.bundle { AgeBanner(index: b.index) }
            Text(L.t("saved.note")).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            if rows.isEmpty { Text(L.t("saved.none")).foregroundStyle(Color.muted).card() }
            ForEach(rows, id: \.id) { row in
                CardLink(r: Ranked(row: row, open: openNow(row, now: now, alerts: store.bundle?.alerts ?? []),
                                   badge: DetroitQuery.badge(row, now: now), miles: nil, band: 0), showMiles: false) { DetailView(row: row) }
            }
            if !rows.isEmpty {
                Button(L.t("saved.clear")) { saved.clear() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand).padding(.top, 6)
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("saved.title")).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

// ---- About and Your privacy ---------------------------------------------------------------------
struct AboutView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach([1, 2, 3], id: \.self) { n in
                    Text(L.t("about.p\(n)")).font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                }
            }.card()
            if let i = store.bundle?.index {
                // What this phone is actually holding, and whether it was signed by the real key or a test one.
                Text(L.t("about.data", ["version": i.version, "date": prettyDate(i.generatedAt)]) + " "
                     + L.t(i.signing == "release" ? "about.sig_ok" : "about.sig_dev"))
                    .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            Text(L.t("about.open")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            NavRow(title: L.t("privacy.title"), symbol: "lock.shield", subtitle: L.t("privacy.sub")) { PrivacyView() }
            SectionHead(text: L.t("about.credits_h"))
            VStack(alignment: .leading, spacing: 8) {
                let sources = Set((store.bundle?.rows ?? []).map(\.facts.source.name)).count
                if sources > 0 { Bullet(L.t("about.credits_orgs", ["count": String(sources)])) }
                Bullet(L.t("about.credits_foodbanks"))
                Bullet(L.t("about.credits_city"))
                Bullet(L.t("about.credits_census"))
            }.card()
            Text(L.t("about.credits_thanks")).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            Text(L.t("about.maker")).font(.footnote).foregroundStyle(Color.muted)
            ContactLine()
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("about.title")).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

/// Who makes the app, and how to reach them (Kyle, 2026-09-19). An organization's address, not a resident's.
private let contactAddress = "kyle@linwoodtechnologies.com"
struct ContactLine: View {
    var body: some View {
        if let u = URL(string: "mailto:" + contactAddress) {
            Link(destination: u) {
                Text(L.t("about.contact") + " " + contactAddress).font(.footnote).foregroundStyle(Color.brand)
                    .fixedSize(horizontal: false, vertical: true)
            }.accessibilityLabel(L.t("about.contact") + " " + contactAddress)
        }
    }
}

/// One line in a plain list. The dot is drawn, not spoken: a screen reader reads the sentence and nothing else.
struct Bullet: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•").foregroundStyle(Color.muted).accessibilityHidden(true)
            Text(text).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.subheadline).foregroundStyle(Color.ink)
        .accessibilityElement(children: .combine)
    }
}

/// What this app keeps and sends, in plain words (docs/08). Everything here is true of the code: the app tests
/// check the parts that can be checked (the day-hash, the outbox, what a saved list may hold).
struct PrivacyView: View {
    @EnvironmentObject var reporter: Reporter
    @State private var didReset = false
    /// Set when "Make a new key" could not be carried out. The screen then says nothing was changed, rather than
    /// showing "Done. This phone has a new key." over a key that is still there (iPhone review, 2026-09-20).
    @State private var resetFailed = false
    @State private var didClearQueue = false
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("privacy.lede")).font(.body).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            SectionHead(text: L.t("privacy.phone_h"))
            VStack(alignment: .leading, spacing: 8) {
                ForEach(1...5, id: \.self) { n in Bullet(L.t("privacy.phone_\(n)")) }
            }.card()
            SectionHead(text: L.t("privacy.where_h"))
            Text(L.t("privacy.where")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).card()
            SectionHead(text: L.t("privacy.sent_h"))
            VStack(alignment: .leading, spacing: 8) {
                Bullet(L.t("privacy.sent_1"))
                Bullet(L.t("privacy.sent_2"))
            }.card()
            SectionHead(text: L.t("privacy.never_h"))
            Text(L.t("privacy.never")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true).card()
            // What is still waiting to be sent, and a way to throw it away: nothing is queued out of sight, and
            // what is on this phone is the person's to delete (the web app shows the same two things).
            if reporter.waiting > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("privacy.queued_note", ["count": String(reporter.waiting)]))
                        .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    Button(L.t("privacy.queued_clear")) { Task { didClearQueue = await reporter.clearQueue() } }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                }.card()
            } else if didClearQueue {
                Text(L.t("privacy.queued_cleared")).font(.subheadline).foregroundStyle(Color.brandSoftInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
            }
            SectionHead(text: L.t("privacy.reset_h"))
            Text(L.t("privacy.reset")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            if didReset {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.brandSoftInk)
                    Text(L.t("privacy.reset_done")).font(.subheadline).foregroundStyle(Color.brandSoftInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
                .accessibilityElement(children: .combine)
            } else {
                if resetFailed {
                    Text(L.t("privacy.reset_failed"))
                        .font(.subheadline).foregroundStyle(Color.warnInk).fixedSize(horizontal: false, vertical: true)
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 14))
                }
                Button {
                    // A reset that fails is never reported as a success: the button stays, and the line above says
                    // the old key is still here (iPhone review, 2026-09-20).
                    Task {
                        do { _ = try await InstallKey.shared.reset(); didReset = true; resetFailed = false }
                        catch { resetFailed = true }
                    }
                } label: {
                    Text(L.t("privacy.reset_btn")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                        .padding(.horizontal, 16).padding(.vertical, 13).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("privacy.reset_btn"))
                .accessibilityHint(L.t("privacy.reset"))
            }
            Text(L.t("about.maker")).font(.footnote).foregroundStyle(Color.muted).padding(.top, 6)
            ContactLine()
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .task { await reporter.count() }
        .navigationTitle(L.t("privacy.title")).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}
