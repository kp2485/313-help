// 313 Help for iPhone: the same screens as the PWA, reading the same signed bundle. Zero PII:
// no account, no analytics, no identifier. Location is asked for only when the person taps "Use my location",
// held in memory, and never sent. Screens about domestic violence or a mental-health crisis show numbers first.
import CoreLocation
import DetroitQuery
import SwiftUI

@main
struct Help313App: App {
    @StateObject private var store = BundleStore()
    @StateObject private var here = Here()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).environmentObject(here)
                .task { await store.start() }
                .onChange(of: phase) { _, p in if p == .active { Task { await store.refresh() } } }
        }
    }
}

/// The device location, only after a tap on "Use my location", and only in memory: never written down, never sent.
/// The permission sheet appears on that tap and never at launch, and a refusal is answered in words, not silence.
@MainActor final class Here: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var point: LatLon?
    @Published var asking = false
    @Published var denied = false
    private let manager = CLLocationManager()
    private var wantsFix = false
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyHundredMeters }

    func ask() {
        denied = false
        switch manager.authorizationStatus {
        case .notDetermined: wantsFix = true; asking = true; manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: asking = true; manager.requestLocation()
        default: denied = true
        }
    }
    func forget() { point = nil; denied = false }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in
            switch m.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: if self.wantsFix { self.wantsFix = false; m.requestLocation() }
            case .denied, .restricted: self.wantsFix = false; self.asking = false; self.denied = true
            default: break
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations l: [CLLocation]) {
        guard let c = l.last?.coordinate else { return }
        Task { @MainActor in self.asking = false; self.denied = false; self.point = LatLon(lat: c.latitude, lon: c.longitude) }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError e: Error) {
        Task { @MainActor in self.asking = false; self.denied = true }
    }
}

struct RootView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        TabView {
            NavigationStack { HomeView() }.tabItem { Label(L.t("tab.home"), systemImage: "house") }
            NavigationStack { HelpView() }.tabItem { Label(L.t("tab.help"), systemImage: "heart") }
            NavigationStack { GreenwayView() }.tabItem { Label(L.t("tab.rec"), systemImage: "tree") }
            // Only when the list carries events (none today: DECISIONS 2026-09-19).
            if !(store.bundle?.events.isEmpty ?? true) {
                NavigationStack { EventsView() }.tabItem { Label(L.t("tab.events"), systemImage: "calendar") }
            }
        }
        .tint(Color.brand)
    }
}

/// "Urgent help" in the top bar of every screen: emergency numbers are one tap away from anywhere.
struct UrgentButton: ViewModifier {
    @State private var open = false
    func body(content: Content) -> some View {
        content.toolbar { ToolbarItem(placement: .topBarTrailing) {
            Button { open = true } label: { Label(L.t("strip.more"), systemImage: "phone") }.labelStyle(.titleAndIcon)
        } }
        .sheet(isPresented: $open) { NavigationStack { UrgentView() } }
    }
}
extension View { func urgentHelp() -> some View { modifier(UrgentButton()) } }

struct CallRow: View {
    let label: String, number: String
    var is911 = false
    var body: some View {
        if let url = telURL(number) {
            Link(destination: url) {
                HStack(spacing: 12) {
                    Image(systemName: "phone.fill").font(.body)
                    Text(label).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    Spacer(minLength: 8)
                    Text(number).font(.body.weight(.bold)).fixedSize()   // phone numbers never truncate
                }
                .foregroundStyle(is911 ? Color.white : Color.brandSoftInk)
                .padding(.horizontal, 16).padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading)
                .background(is911 ? Color.danger : Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
            }.accessibilityLabel(L.t("strip.call_label", ["label": label, "number": number]))
        }
    }
}

/// A link to someone else's site (313SafeBeds), with its own words from strings/*.json.
struct LinkCard: View {
    let key: String, url: String
    var body: some View {
        if let u = URL(string: url) {
            VStack(alignment: .leading, spacing: 8) {
                Text(L.t("link.\(key).title")).font(.headline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                Text(L.t("link.\(key).body")).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                Link(destination: u) {
                    HStack(spacing: 8) {
                        Text(L.t("link.\(key).label")).font(.subheadline.weight(.semibold))
                        Image(systemName: "arrow.up.right.square")
                    }
                    .foregroundStyle(Color.brandSoftInk)
                    .padding(.horizontal, 14).padding(.vertical, 11).frame(maxWidth: .infinity)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(.plain)
            }.card()
        }
    }
}

struct EmergencyRows: View {
    @EnvironmentObject var store: BundleStore
    let ids: [String]
    var body: some View {
        ForEach(ids, id: \.self) { id in if let e = emergencyNumber(id, in: store.bundle) { CallRow(label: e.label, number: e.number, is911: id == "emg_911") } }
    }
}

struct UrgentView: View {
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("urgent.lede")).font(.body).foregroundStyle(Color.muted).padding(.bottom, 4)
            EmergencyRows(ids: ["emg_911", "emg_988", "emg_shelter_helpline", "emg_shelter_outwayne", "emg_dwihn_crisis", "emg_ndvh", "emg_avalon", "emg_211"])
            NavRow(title: L.t("need.overdose_now"), symbol: "waveform.path.ecg") { OverdoseView() }.padding(.top, 6)
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(L.t("strip.more")).navigationBarTitleDisplayMode(.inline)
    }
}

struct OverdoseView: View {
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 14) {
            EmergencyRows(ids: ["emg_911"])
            VStack(alignment: .leading, spacing: 14) {
                ForEach(1...6, id: \.self) { i in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(i)").font(.subheadline.weight(.bold)).foregroundStyle(Color.brandSoftInk)
                            .frame(width: 28, height: 28).background(Color.brandSoft, in: Circle())
                        Text(L.t("od.s\(i)")).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }.card()
            Text(L.t("od.review_note")).font(.footnote).foregroundStyle(Color.muted)
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(L.t("od.title")).navigationBarTitleDisplayMode(.inline)
    }
}

struct HomeView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(L.t("home.hero")).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                Text(L.t("app.tagline")).font(.body).foregroundStyle(.white.opacity(0.9)).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(.white).padding(22).frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Color.brand, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 22))
            if let b = store.bundle {
                AgeBanner(index: b.index)
                ForEach(b.alerts.filter { a in (parseInstant(a.startsAt) ?? .distantFuture) <= .now && (parseInstant(a.endsAt) ?? .distantPast) > .now }, id: \.id) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(a.title ?? "").font(.body.weight(.semibold)).foregroundStyle(Color.brandSoftInk)
                        if let body = a.bodyPlain { Text(body).font(.subheadline).foregroundStyle(Color.brandSoftInk) }
                    }
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 16))
                }
                NavigationLink { SearchView() } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Color.muted)
                        Text(L.t("search.open")).foregroundStyle(Color.muted)
                        Spacer()
                    }.card(padding: 14)
                }.buttonStyle(.plain)
                NavRow(title: L.t("home.help_title"), symbol: "heart", subtitle: L.t("home.help_sub")) { HelpView() }
                LazyVGrid(columns: tileColumns, spacing: 10) {
                    ForEach(needs.filter { ["food", "shelter", "doctor", "drugs", "job", "narcan"].contains($0.id) }) { n in
                        NavTile(title: L.t("quick." + n.id), symbol: n.symbol) { NeedView(need: n) }
                    }
                }
            } else {
                Text(L.t(store.loadFailed ? "home.no_data" : "home.loading")).foregroundStyle(Color.muted).card()
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("app.name")).urgentHelp()
    }
}

struct AgeBanner: View {
    let index: BundleIndex
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: index.generatedAt)
        switch bundleAge(generatedAt: index.generatedAt, retired: index.retired ?? false, now: now) {
        case .aging: Text(L.t("bundle.aging", ["days": String(Int(now.timeIntervalSince(parseInstant(index.generatedAt) ?? now) / 86400))]) + " " + L.t("bundle.alerts_may_be_missing")).banner()
        case .old: Text(L.t("bundle.old", ["date": String(index.generatedAt.prefix(10))])).banner()
        case .retired: Text(L.t("bundle.sunset")).banner()
        case .fresh: EmptyView()
        }
    }
}
extension View {
    func banner() -> some View {
        font(.subheadline).foregroundStyle(Color.warnInk).padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct HelpView: View {
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("help.lede")).font(.body).foregroundStyle(Color.muted)
            // "Right now" keeps whole sentences; the rest are tiles, so the list still fits a phone.
            SectionHead(text: L.t("help.now"))
            ForEach(needs.filter(\.now)) { n in NavRow(title: L.t("need." + n.id), symbol: n.symbol) { NeedView(need: n) } }
            ForEach([false, true], id: \.self) { later in
                SectionHead(text: L.t(later ? "help.later" : "help.soon"))
                LazyVGrid(columns: tileColumns, spacing: 10) {
                    ForEach(needs.filter { $0.later == later && !$0.now }) { n in
                        NavTile(title: L.t("tile." + n.id), symbol: n.symbol) { NeedView(need: n) }
                    }
                }
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("home.needs")).urgentHelp()
    }
}

struct NeedView: View {
    let need: Need
    var body: some View {
        if need.stepsOnly { OverdoseView() }
        else if !need.refine.isEmpty {
            ScrollView { VStack(alignment: .leading, spacing: 10) {
                if let intro = need.intro { Text(L.t(intro)).font(.body).foregroundStyle(Color.muted) }
                if let fl = need.firstLink { LinkCard(key: fl.key, url: fl.url) }
                if !need.first.isEmpty { EmergencyRows(ids: need.first) }
                ForEach(need.refine) { r in
                    NavRow(title: L.t("refine.\(need.id).\(r.id)"), symbol: need.symbol) {
                        ResultsView(query: r.query, sensitive: need.sensitive).navigationTitle(L.t("refine.\(need.id).\(r.id)"))
                    }
                }
            }.padding(16) }
            .background(Color.appBg.ignoresSafeArea())
            .navigationTitle(L.t("need." + need.id)).navigationBarTitleDisplayMode(.inline).urgentHelp()
        } else {
            ResultsView(query: need.query ?? Query(), sensitive: need.sensitive, first: need.first, intro: need.intro, firstLink: need.firstLink)
                .navigationTitle(L.t("need." + need.id))
        }
    }
}

struct ResultsView: View {
    @EnvironmentObject var store: BundleStore
    @EnvironmentObject var here: Here
    let query: Query
    var sensitive = false
    var first: [String] = []
    var intro: String? = nil
    var firstLink: (key: String, url: String)? = nil
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        var q = query; if !sensitive { q.near = here.point }
        let ranked = rank(store.bundle?.rows ?? [], q, now: now, alerts: store.bundle?.alerts ?? [])
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            if let intro { Text(L.t(intro)).font(.body).foregroundStyle(Color.muted) }
            if let firstLink { LinkCard(key: firstLink.key, url: firstLink.url) }
            if !first.isEmpty { EmergencyRows(ids: first) }
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote).foregroundStyle(Color.muted) }
            else { LocationChip() }
            if ranked.isEmpty { Text(L.t("results.none") + " 211").foregroundStyle(Color.muted).card() }
            ForEach(ranked, id: \.row.id) { r in
                NavigationLink { DetailView(row: r.row) } label: { Card(r: r, showMiles: !sensitive) }.buttonStyle(.plain)
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).urgentHelp()
    }
}

/// "Use my location", in the app's own words and colours (docs/05: asked on the tap, never at launch).
struct LocationChip: View {
    @EnvironmentObject var here: Here
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if here.point == nil {
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
                if here.denied { Text(L.t("loc.denied")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
                Text(L.t("loc.note")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 10) {
                    Text(L.t("loc.using")).font(.footnote).foregroundStyle(Color.muted)
                    Button(L.t("loc.off")) { here.forget() }.font(.footnote.weight(.semibold)).foregroundStyle(Color.brand)
                }
            }
        }
    }
}

struct Card: View {
    let r: Ranked
    var showMiles = true
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(r.row.name).font(.headline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted).padding(.top, 3)
            }
            Text(r.row.what).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Pill(text: openText(r.open), tone: Pill.tone(for: r.open.state))
                if showMiles, let mi = r.miles { Pill(text: L.t("miles", ["miles": String(format: "%.1f", mi)])) }
            }
            if let n = r.row.notice { Text(n).font(.footnote).foregroundStyle(Color.warnInk).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 10)) }
            Text(badgeText(r.badge)).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            if let phone = r.row.phones.first, let url = telURL(phone.number) {
                Link(destination: url) {
                    HStack(spacing: 10) {
                        Image(systemName: "phone.fill")
                        Text(L.t("detail.call")).fontWeight(.semibold)
                        Spacer(minLength: 8)
                        Text(phone.number).fontWeight(.bold).fixedSize()
                    }
                    .font(.subheadline).foregroundStyle(Color.brandSoftInk)
                    .padding(.horizontal, 14).padding(.vertical, 11).frame(maxWidth: .infinity)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("detail.call_label", ["name": r.row.name]))
            }
        }.card()
    }
}

struct DetailView: View {
    @EnvironmentObject var store: BundleStore
    let row: BundleRow
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt), alerts = store.bundle?.alerts ?? []
        let sensitive = row.category == "shelter.dv" || row.category == "health.mental"
        let open = openNow(row, now: now, alerts: alerts)
        let next = nextOccurrences(row, now: now, n: 3, alerts: alerts)
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                Text(row.org).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                Pill(text: openText(open), tone: Pill.tone(for: open.state))
                Text(badgeText(DetroitQuery.badge(row, now: now))).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                if let n = row.notice {
                    Text(n).font(.subheadline).foregroundStyle(Color.warnInk).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
                }
            }.card()
            ForEach(row.phones, id: \.number) { p in CallRow(label: L.t("detail.call") + (p.label.map { " · " + $0 } ?? ""), number: p.number) }
            if let a = row.address, let q = "\(a.line1), \(a.city), MI \(a.zip ?? "")".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let url = URL(string: "https://maps.apple.com/?daddr=\(q)") {
                Link(destination: url) {
                    HStack(spacing: 10) { Image(systemName: "mappin.and.ellipse"); Text(L.t("detail.directions")).fontWeight(.semibold); Spacer() }
                        .foregroundStyle(Color.brand).padding(.horizontal, 16).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                }.buttonStyle(.plain)
                Text(L.t("detail.directions_note")).font(.footnote).foregroundStyle(Color.muted)
            }
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote).foregroundStyle(Color.muted) }
            if L.spanish { Text(L.t("detail.in_english")).font(.footnote).foregroundStyle(Color.muted) }
            DetailSection(title: L.t("detail.what")) { Text(row.what).fixedSize(horizontal: false, vertical: true) }
            if let e = row.eligibility { DetailSection(title: L.t("detail.who")) { Text(e).fixedSize(horizontal: false, vertical: true) } }
            if !next.isEmpty {
                DetailSection(title: L.t("detail.next")) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(next, id: \.start) { o in
                            HStack { Text(o.date); Spacer(); Text("\(clock(o.opensAt)) – \(clock(o.closesAt))").foregroundStyle(Color.muted) }
                        }
                    }
                }
            }
            if let h = row.hoursText { DetailSection(title: L.t("detail.hours")) { Text(h).fixedSize(horizontal: false, vertical: true) } }
            if let a = row.address { DetailSection(title: L.t("detail.where")) { Text("\(a.line1)\n\(a.city), MI \(a.zip ?? "")").fixedSize(horizontal: false, vertical: true) } }
            DetailSection(title: L.t("detail.source")) { Text(row.facts.source.name).fixedSize(horizontal: false, vertical: true) }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(row.name).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

/// One titled block on a listing's screen: a heading, then its own card.
struct DetailSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHead(text: title)
            content().font(.body).foregroundStyle(Color.ink).frame(maxWidth: .infinity, alignment: .leading).card()
        }
    }
}

struct SearchView: View {
    @EnvironmentObject var store: BundleStore
    @State private var text = ""        // memory only: never stored, sent, or logged
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        let found = searchTokens(text).isEmpty ? [] : search(store.bundle?.rows ?? [], text, Query(), now: now, alerts: store.bundle?.alerts ?? [])
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            if searchTokens(text).isEmpty { Text(L.t("search.hint")).font(.body).foregroundStyle(Color.muted).card() }
            else if found.isEmpty { Text(L.t("search.none") + " 211").foregroundStyle(Color.muted).card() }
            ForEach(found.prefix(30), id: \.row.id) { r in
                NavigationLink { DetailView(row: r.row) } label: { Card(r: r) }.buttonStyle(.plain)
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: L.t("search.label")).autocorrectionDisabled()
        .navigationTitle(L.t("search.title")).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

struct GreenwayView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("gw.intro")).font(.body).foregroundStyle(Color.muted)
            ForEach(["open", "under_construction", "funded", "planned"], id: \.self) { phase in
                let segs = (store.bundle?.segments ?? []).filter { $0.phase == phase }
                if !segs.isEmpty {
                    SectionHead(text: L.t("gw." + phase))
                    ForEach(segs) { s in NavRow(title: s.name, symbol: "point.topleft.down.curvedto.point.bottomright.up") { SegmentView(segment: s) } }
                }
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(L.t("gw.title")).urgentHelp()
    }
}

struct SegmentView: View {
    @EnvironmentObject var store: BundleStore
    let segment: Segment
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        let near = helpAlong((store.bundle?.rows ?? []).filter { $0.category != "shelter.dv" }, segment)
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Pill(text: L.t("gw." + segment.phase), tone: segment.phase == "open" ? .open : .plain)
            if let cross = segment.crossStreets, !cross.isEmpty {
                DetailSection(title: L.t("gw.crosses")) { Text(cross.joined(separator: " · ")).fixedSize(horizontal: false, vertical: true) }
            }
            SectionHead(text: L.t("gw.help_along"))
            if near.isEmpty { Text(L.t("gw.help_none")).foregroundStyle(Color.muted).card() }
            ForEach(near, id: \.row.id) { n in
                NavigationLink { DetailView(row: n.row) } label: {
                    Card(r: Ranked(row: n.row, open: openNow(n.row, now: now), badge: DetroitQuery.badge(n.row, now: now), miles: n.miles, band: 0))
                }.buttonStyle(.plain)
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(segment.name).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

struct EventsView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        let today = wallDateString(toWall(.now))
        let events = (store.bundle?.events ?? []).filter { String(($0.endsAt ?? $0.startsAt).prefix(10)) >= today }.sorted { $0.startsAt < $1.startsAt }
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("events.lede")).font(.body).foregroundStyle(Color.muted)
            if events.isEmpty { Text(L.t("events.none")).foregroundStyle(Color.muted).card() }
            ForEach(events) { e in
                VStack(alignment: .leading, spacing: 6) {
                    Text(e.title).font(.headline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    Text([String(e.startsAt.prefix(10)), e.location].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(Color.muted)
                    if let url = URL(string: e.url) { Link(L.t("events.details"), destination: url).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand) }
                }.card()
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(L.t("tab.events")).urgentHelp()
    }
}
