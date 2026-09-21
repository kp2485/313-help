// "Add a place that helps" (docs/04): a person tells us about free help we do not list yet, and a steward checks
// it before it can ever appear. The Swift half of the web's add form (apps/web/src/main.ts `addScreen`) and its
// `propose.ts`; the proposal itself, the closed schema and the validation live in HelpCore/Proposals.swift, where
// `swift test` runs them.
//
// What leaves the phone is what was typed about the PLACE. Nothing about the person: no account, no device id,
// no location, and no dedupe hash either — a proposal is not deduplicated, so unlike a report it carries no
// `client_nonce` and there is nothing to work out again when it finally goes. The Worker's schema is closed, so a
// ninth field would be a 400 rather than something quietly stored.
import HelpCore
import SwiftUI

/// Posts one proposal on the app's one cookie-less session (HelpCore/Net): no cookies, no credentials, no cache,
/// and a User-Agent that says only "313Help-iOS/<version>".
@Sendable func postProposal(_ p: Proposal) async -> Bool {
    guard let url = Config.proposalsURL else { return false }
    guard let body = try? JSONEncoder().encode(p) else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.httpBody = body
    req.httpShouldHandleCookies = false
    do {
        let (_, res) = try await Net.session.data(for: req)
        return !retryable((res as? HTTPURLResponse)?.statusCode ?? 0)
    } catch { return false }
}

/// What happened to the proposal on this screen, and the queue behind it — the same outbox actor the reports use
/// (HelpCore), in a file of its own so one cannot crowd out the other.
@MainActor final class Proposer: ObservableObject {
    static let shared = Proposer()
    @Published private(set) var outcome: SubmitOutcome?
    @Published private(set) var sending = false

    private let box = Outbox<Proposal>(file: DeviceState.dir.appendingPathComponent("outbox-proposals.json"),
                                       max: 10, send: postProposal)

    func submit(_ p: Proposal) async {
        sending = true
        defer { sending = false }
        outcome = await box.submit(p)
    }

    /// Tried again at launch and whenever the app comes back to the front, like the reports outbox.
    func flush() async { await box.flush() }
    func waiting() async -> Int { await box.waiting() }
    @discardableResult func clearQueue() async -> Bool { await box.clear() }
    func startOver() { outcome = nil }
}

// MARK: - the form

struct AddPlaceView: View {
    @EnvironmentObject private var proposer: Proposer
    /// Everything typed, by the field name the Worker uses. Memory only: it is gone when the screen is.
    @State private var form: [String: String] = [:]
    /// The required fields left empty when Send was last tapped, so each one can say so on itself.
    @State private var missing: [String] = []
    @FocusState private var focus: String?

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 12) {
            if let outcome = proposer.outcome, outcome != .failed {
                sent(queued: outcome == .queued)
            } else {
                Text(L.t("add.lede")).font(.body).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                if proposer.outcome == .failed {
                    Text(L.t("report.failed")).font(.subheadline).foregroundStyle(Color.warnInk)
                        .fixedSize(horizontal: false, vertical: true).padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 14))
                }
                if !missing.isEmpty {
                    Text(L.t("add.missing")).font(.subheadline).foregroundStyle(Color.warnInk)
                        .fixedSize(horizontal: false, vertical: true).padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityAddTraits(.isHeader)
                }
                // The same fields in the same order as the web form.
                field("name", required: true)
                picks("category", proposalCategories) { L.t("add.cat." + $0) }
                field("what", required: true, lines: 2, hint: "add.h.what")
                field("address", hint: "add.h.address")
                field("schedule_text", hint: "add.h.schedule")
                field("phone", hint: "add.h.phone", keyboard: .phonePad)
                picks("how_known", proposalHowKnown) { L.t("add.how." + $0) }
                field("notes", lines: 2, hint: "add.h.notes")
                Button(action: send) {
                    Text(L.t("add.send")).font(.body.weight(.semibold)).foregroundStyle(Color.brandInk)
                        .padding(.horizontal, 18).padding(.vertical, 14).frame(maxWidth: .infinity)
                        .background(Color.brand, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(proposer.sending)
                .opacity(proposer.sending ? 0.6 : 1)
                Text(L.t("add.privacy")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("add.title")).navigationBarTitleDisplayMode(.inline)
        .onDisappear { proposer.startOver() }
        .urgentHelp()
    }

    // MARK: what a filled-in form does

    private func send() {
        guard let proposal = buildProposal(form) else {
            // Say which answers are missing, mark each one, and put the cursor on the first a person reading down
            // the screen would reach (WCAG 3.3.1, 3.3.3). Everything already typed stays exactly where it is.
            missing = missingProposalFields(form)
            focus = missing.first
            UIAccessibility.post(notification: .announcement, argument: L.t("add.missing"))
            return
        }
        missing = []
        focus = nil
        Task { await proposer.submit(proposal) }
    }

    private func sent(queued: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.brandSoftInk)
                Text(L.t(queued ? "add.queued" : "add.sent")).font(.subheadline).foregroundStyle(Color.brandSoftInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Button(L.t("add.again")) { form = [:]; missing = []; proposer.startOver() }
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
        }
    }

    // MARK: the pieces of the form

    private func binding(_ name: String) -> Binding<String> {
        Binding(get: { form[name] ?? "" }, set: { form[name] = $0 })
    }

    /// One written answer. A missing required one says so **on itself**, not only in the banner at the top, so a
    /// person using a screen reader hears the problem when they reach the field.
    private func field(_ name: String, required: Bool = false, lines: Int = 1, hint: String? = nil,
                       keyboard: UIKeyboardType = .default) -> some View {
        let wrong = missing.contains(name)
        return VStack(alignment: .leading, spacing: 6) {
            Text(L.t("add.f." + name) + (required ? "" : " " + L.t("add.optional")))
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            TextField("", text: binding(name), axis: lines > 1 ? .vertical : .horizontal)
                .lineLimit(lines > 1 ? lines...(lines + 3) : 1...1)
                .keyboardType(keyboard)
                .autocorrectionDisabled(name == "phone")
                .focused($focus, equals: name)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(wrong ? Color.warnInk : Color.line, lineWidth: 1))
                .accessibilityLabel(L.t("add.f." + name))
                .accessibilityValue(wrong ? L.t("add.e." + name) : "")
                .accessibilityHint(hint.map { L.t($0) } ?? "")
                .onChange(of: form[name] ?? "") { _, v in
                    let cap = proposalLimits[name] ?? v.count
                    if v.count > cap { form[name] = String(v.prefix(cap)) }
                    if wrong, !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        missing.removeAll { $0 == name }
                    }
                }
            if wrong {
                Text(L.t("add.e." + name)).font(.footnote).foregroundStyle(Color.warnInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let hint {
                Text(L.t(hint)).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
        }.card(padding: 14)
    }

    /// One answer chosen from a list — the kind of help, and how a person knows about the place. A row each, so
    /// every choice is a full-width target and nothing is cut off at the largest text sizes.
    private func picks(_ name: String, _ ids: [String], label: @escaping (String) -> String) -> some View {
        let wrong = missing.contains(name)
        return VStack(alignment: .leading, spacing: 6) {
            Text(L.t("add.f." + name)).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if wrong {
                Text(L.t("add.e." + name)).font(.footnote).foregroundStyle(Color.warnInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 6) {
                ForEach(ids, id: \.self) { id in
                    let on = form[name] == id
                    Button {
                        form[name] = id
                        missing.removeAll { $0 == name }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(on ? Color.brand : Color.muted)
                            Text(label(id)).font(.subheadline).foregroundStyle(Color.ink)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 11)
                        .background(on ? Color.brandSoft : Color.surface, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? Color.brand : Color.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label(id))
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
            .focused($focus, equals: name)
        }.card(padding: 14)
    }
}
