// 313 Help for iPhone: the same screens as the PWA, reading the same signed bundle. Zero PII:
// no account, no analytics, no identifier. Location is asked for only when the person taps "Use my location",
// held in memory, and never sent. Screens about domestic violence or a mental-health crisis show numbers first.
import CoreLocation
import CoreLocationUI
import DetroitQuery
import SwiftUI

@main
struct DetroitCompassApp: App {
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

/// The device location, only after a tap on the system location button, and only in memory.
@MainActor final class Here: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var point: LatLon?
    private let manager = CLLocationManager()
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyHundredMeters }
    func ask() { manager.requestLocation() }
    func forget() { point = nil }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations l: [CLLocation]) {
        guard let c = l.last?.coordinate else { return }
        Task { @MainActor in self.point = LatLon(lat: c.latitude, lon: c.longitude) }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError e: Error) {}
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
    var body: some View {
        if let url = telURL(number) {
            Link(destination: url) {
                HStack { Image(systemName: "phone.fill"); Text(label); Spacer(); Text(number).bold().fixedSize() }   // phone numbers never truncate
                    .padding().frame(maxWidth: .infinity).background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
            }.accessibilityLabel(L.t("strip.call_label", ["label": label, "number": number]))
        }
    }
}

struct EmergencyRows: View {
    @EnvironmentObject var store: BundleStore
    let ids: [String]
    var body: some View {
        ForEach(ids, id: \.self) { id in if let e = emergencyNumber(id, in: store.bundle) { CallRow(label: e.label, number: e.number) } }
    }
}

struct UrgentView: View {
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 12) {
            Text(L.t("urgent.lede")).foregroundStyle(.secondary)
            EmergencyRows(ids: ["emg_911", "emg_988", "emg_shelter_helpline", "emg_shelter_outwayne", "emg_dwihn_crisis", "emg_ndvh", "emg_211"])
            NavigationLink(L.t("need.overdose_now")) { OverdoseView() }.buttonStyle(.bordered)
        }.padding() }.navigationTitle(L.t("strip.more"))
    }
}

struct OverdoseView: View {
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 14) {
            EmergencyRows(ids: ["emg_911"])
            ForEach(1...6, id: \.self) { i in HStack(alignment: .top) { Text("\(i).").bold(); Text(L.t("od.s\(i)")) } }
            Text(L.t("od.review_note")).font(.footnote).foregroundStyle(.secondary)
        }.padding() }.navigationTitle(L.t("od.title"))
    }
}

struct HomeView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) { Text(L.t("home.hero")).font(.largeTitle.bold()); Text(L.t("app.tagline")) }
                .foregroundStyle(.white).padding(20).frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [Color.brand, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 22))
            if let b = store.bundle {
                AgeBanner(index: b.index)
                ForEach(b.alerts.filter { a in (parseInstant(a.startsAt) ?? .distantFuture) <= .now && (parseInstant(a.endsAt) ?? .distantPast) > .now }, id: \.id) { a in
                    VStack(alignment: .leading) { Text(a.title ?? "").bold(); if let body = a.bodyPlain { Text(body) } }
                        .padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 14))
                }
                NavigationLink { SearchView() } label: { Label(L.t("search.open"), systemImage: "magnifyingglass") }.buttonStyle(.bordered)
                ForEach(needs.filter { ["food", "shelter", "doctor", "narcan"].contains($0.id) }) { n in
                    NavigationLink { NeedView(need: n) } label: { Label(L.t("quick." + n.id), systemImage: n.symbol).frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.bordered)
                }
            } else {
                Text(L.t(store.loadFailed ? "home.no_data" : "home.loading"))
            }
        }.padding() }
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
extension View { func banner() -> some View { padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.yellow.opacity(0.18), in: RoundedRectangle(cornerRadius: 10)) } }

struct HelpView: View {
    var body: some View {
        List {
            Section(L.t("help.now")) { ForEach(needs.filter(\.now)) { n in NavigationLink { NeedView(need: n) } label: { Label(L.t("need." + n.id), systemImage: n.symbol) } } }
            Section(L.t("help.soon")) { ForEach(needs.filter { !$0.now }) { n in NavigationLink { NeedView(need: n) } label: { Label(L.t("need." + n.id), systemImage: n.symbol) } } }
        }
        .navigationTitle(L.t("home.needs")).urgentHelp()
    }
}

struct NeedView: View {
    let need: Need
    var body: some View {
        if need.stepsOnly { OverdoseView() }
        else if !need.refine.isEmpty {
            List {
                if !need.first.isEmpty { EmergencyRows(ids: need.first) }
                ForEach(need.refine) { r in NavigationLink(L.t("refine.\(need.id).\(r.id)")) { ResultsView(query: r.query, sensitive: need.sensitive).navigationTitle(L.t("refine.\(need.id).\(r.id)")) } }
            }.navigationTitle(L.t("need." + need.id)).urgentHelp()
        } else {
            ResultsView(query: need.query ?? Query(), sensitive: need.sensitive, first: need.first, intro: need.intro).navigationTitle(L.t("need." + need.id))
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
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        var q = query; if !sensitive { q.near = here.point }
        let ranked = rank(store.bundle?.rows ?? [], q, now: now, alerts: store.bundle?.alerts ?? [])
        return List {
            if let intro { Text(L.t(intro)) }
            if !first.isEmpty { EmergencyRows(ids: first) }
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote) }
            else if here.point == nil { LocationButton(.shareCurrentLocation) { here.ask() }.labelStyle(.titleAndIcon); Text(L.t("loc.note")).font(.footnote) }
            else { Button(L.t("loc.off")) { here.forget() } }
            if ranked.isEmpty { Text(L.t("results.none") + " 211") }
            ForEach(ranked, id: \.row.id) { r in NavigationLink { DetailView(row: r.row) } label: { Card(r: r, showMiles: !sensitive) } }
        }.urgentHelp()
    }
}

struct Card: View {
    let r: Ranked
    var showMiles = true
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(r.row.name).font(.headline)
            Text(r.row.what).foregroundStyle(.secondary)
            HStack { Text(openText(r.open)).font(.subheadline.bold()); if showMiles, let mi = r.miles { Text(L.t("miles", ["miles": String(format: "%.1f", mi)])) } }
            if let n = r.row.notice { Text(n).font(.footnote) }
            Text(badgeText(r.badge)).font(.footnote).foregroundStyle(.secondary)
        }.padding(.vertical, 4)
    }
}

struct DetailView: View {
    @EnvironmentObject var store: BundleStore
    let row: BundleRow
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt), alerts = store.bundle?.alerts ?? []
        let sensitive = row.category == "shelter.dv" || row.category == "health.mental"
        ScrollView { VStack(alignment: .leading, spacing: 12) {
            Text(row.org).foregroundStyle(.secondary)
            Text(openText(openNow(row, now: now, alerts: alerts))).bold()
            Text(badgeText(badge(row, now: now))).font(.footnote)
            ForEach(row.phones, id: \.number) { p in CallRow(label: L.t("detail.call") + (p.label.map { " · " + $0 } ?? ""), number: p.number) }
            if let a = row.address, let q = "\(a.line1), \(a.city), MI \(a.zip ?? "")".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let url = URL(string: "https://maps.apple.com/?daddr=\(q)") {
                Link(destination: url) { Label(L.t("detail.directions"), systemImage: "mappin") }.buttonStyle(.bordered)
                Text(L.t("detail.directions_note")).font(.footnote).foregroundStyle(.secondary)
            }
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote) }
            if L.spanish { Text(L.t("detail.in_english")).font(.footnote).foregroundStyle(.secondary) }
            Text(L.t("detail.what")).font(.headline); Text(row.what)
            if let e = row.eligibility { Text(L.t("detail.who")).font(.headline); Text(e) }
            let next = nextOccurrences(row, now: now, n: 3, alerts: alerts)
            if !next.isEmpty { Text(L.t("detail.next")).font(.headline); ForEach(next, id: \.start) { o in Text("\(o.date)  \(clock(o.opensAt)) – \(clock(o.closesAt))") } }
            if let h = row.hoursText { Text(L.t("detail.hours_as_listed", ["text": h])) }
            if let a = row.address { Text(L.t("detail.where")).font(.headline); Text("\(a.line1)\n\(a.city), MI \(a.zip ?? "")") }
            Text(L.t("detail.source")).font(.headline); Text(row.facts.source.name)
        }.padding() }
        .navigationTitle(row.name).urgentHelp()
    }
}

struct SearchView: View {
    @EnvironmentObject var store: BundleStore
    @State private var text = ""        // memory only: never stored, sent, or logged
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        let found = searchTokens(text).isEmpty ? [] : search(store.bundle?.rows ?? [], text, Query(), now: now, alerts: store.bundle?.alerts ?? [])
        List {
            if searchTokens(text).isEmpty { Text(L.t("search.hint")).foregroundStyle(.secondary) }
            else if found.isEmpty { Text(L.t("search.none") + " 211") }
            ForEach(found.prefix(30), id: \.row.id) { r in NavigationLink { DetailView(row: r.row) } label: { Card(r: r) } }
        }
        .searchable(text: $text, prompt: L.t("search.label")).autocorrectionDisabled()
        .navigationTitle(L.t("search.title")).urgentHelp()
    }
}

struct GreenwayView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        List {
            Text(L.t("gw.intro"))
            ForEach(["open", "under_construction", "funded", "planned"], id: \.self) { phase in
                let segs = (store.bundle?.segments ?? []).filter { $0.phase == phase }
                if !segs.isEmpty { Section(L.t("gw." + phase)) { ForEach(segs) { s in NavigationLink(s.name) { SegmentView(segment: s) } } } }
            }
        }.navigationTitle(L.t("gw.title")).urgentHelp()
    }
}

struct SegmentView: View {
    @EnvironmentObject var store: BundleStore
    let segment: Segment
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        let near = helpAlong((store.bundle?.rows ?? []).filter { $0.category != "shelter.dv" }, segment)
        List {
            Text(L.t("gw." + segment.phase)).bold()
            if let cross = segment.crossStreets, !cross.isEmpty { Section(L.t("gw.crosses")) { Text(cross.joined(separator: " · ")) } }
            Section(L.t("gw.help_along")) {
                if near.isEmpty { Text(L.t("gw.help_none")) }
                ForEach(near, id: \.row.id) { n in NavigationLink { DetailView(row: n.row) } label: {
                    Card(r: Ranked(row: n.row, open: openNow(n.row, now: now), badge: badge(n.row, now: now), miles: n.miles, band: 0)) } }
            }
        }.navigationTitle(segment.name).urgentHelp()
    }
}

struct EventsView: View {
    @EnvironmentObject var store: BundleStore
    var body: some View {
        let today = wallDateString(toWall(.now))
        let events = (store.bundle?.events ?? []).filter { String(($0.endsAt ?? $0.startsAt).prefix(10)) >= today }.sorted { $0.startsAt < $1.startsAt }
        List {
            Text(L.t("events.lede"))
            if events.isEmpty { Text(L.t("events.none")) }
            ForEach(events) { e in
                VStack(alignment: .leading, spacing: 4) {
                    Text(e.title).font(.headline)
                    Text([String(e.startsAt.prefix(10)), e.location].compactMap { $0 }.joined(separator: " · ")).foregroundStyle(.secondary)
                    if let url = URL(string: e.url) { Link(L.t("events.details"), destination: url) }
                }
            }
        }.navigationTitle(L.t("tab.events")).urgentHelp()
    }
}
