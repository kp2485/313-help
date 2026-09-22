// 313 Help for iPhone: the same screens as the PWA, reading the same signed bundle. Zero PII:
// no account, no analytics, no identifier. Location is asked for only when the person taps "Use my location",
// held in memory, and never sent. Screens about domestic violence or a mental-health crisis show numbers first.
import CoreLocation
import DetroitQuery
import HelpCore
import SwiftUI
import UIKit

@main
struct Help313App: App {
    @StateObject private var store = BundleStore()
    @StateObject private var here = Here()
    @StateObject private var saved = Saved.shared
    @StateObject private var reporter = Reporter.shared
    @StateObject private var proposer = Proposer.shared
    @StateObject private var nav = AppNav()
    /// The Map tab's camera, layers and decoded shapes. It lives here rather than in the tab so that the city is
    /// decoded once per launch instead of every time the tab comes back.
    @State private var map = MapModel()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store).environmentObject(here).environmentObject(saved)
                .environmentObject(reporter).environmentObject(proposer).environmentObject(nav).environment(map)
                // The direction follows the words, not the phone's region: Arabic mirrors every screen, and
                // every layout is already written in leading/trailing terms (docs/ACCESSIBILITY-AUDIT-2026-09-20).
                .environment(\.layoutDirection, L.rightToLeft ? .rightToLeft : .leftToRight)
                .environment(\.locale, L.locale)
                // The app-switcher takes a picture of this window the moment it stops being active, and iOS keeps
                // that picture. A DV, crisis, treatment or assault screen must never be in it (docs/08, audit A8),
                // so the whole UI is covered while the app is not in front.
                .overlay { if phase != .active { PrivacyShield() } }
                .task {
                    // The flag that keeps the install key out of every backup is re-applied at each launch: a
                    // directory that was recreated comes back without it (HelpCore/DeviceState).
                    try? DeviceState.prepare()
                    Net.start(version: Config.version)
                    #if DEBUG
                    if MapStage.has("-mapTab") { nav.tab = .map }
                    map.applyStage()
                    #endif
                    await store.start()
                    await reporter.flush()
                    await proposer.flush()
                }
                // Back to the front: look for a newer list, and try anything either outbox is still holding.
                .onChange(of: phase) { _, p in
                    if p == .active { Task { await store.refresh(); await reporter.flush(); await proposer.flush() } }
                }
        }
    }
}

/// Which tab is showing, and one way to send every screen back to its first page. "Leave this page fast" uses it:
/// the stacks are thrown away, Home comes up, and a neutral page opens in the browser, so the app behind the
/// browser shows nothing about why it was open (the same thing `location.replace` does on the web).
@MainActor final class AppNav: ObservableObject {
    enum Tab: Hashable { case home, help, map, hoods, events }
    @Published var tab: Tab = .home
    /// Changing this rebuilds the navigation stacks, which pops every screen off them.
    @Published var rootID = UUID()

    func quickExit(_ open: (URL) -> Void) {
        tab = .home
        rootID = UUID()
        if let url = quickExitURL { open(url) }
    }
}

/// What the app-switcher gets to photograph: the app's name on its own colour, and nothing else.
struct PrivacyShield: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.brand, Color.brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
            Text(L.t("app.name")).font(.largeTitle.bold()).foregroundStyle(.white)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// The device location, only after a tap on "Use my location", and only in memory: never written down, never sent.
/// The permission sheet appears on that tap and never at launch, and a refusal is answered in words, not silence.
@MainActor final class Here: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var point: LatLon?
    @Published var asking = false
    @Published var denied = false
    /// The ZIP a person typed, when the point above is the middle of that ZIP rather than where they are. It is
    /// five digits in memory and nothing more: never written to a file, never sent, never put in a route. The
    /// screen says "Sorted by distance from ZIP 48226" so nobody mistakes it for a fix (docs/08).
    @Published var zip: String?
    /// The last thing typed was five digits we do not carry. The chip says so; the list stays on the whole city.
    @Published var zipUnknown = false
    /// The junction a person typed, when the point above is where two streets cross rather than a fix. Like the
    /// ZIP, it is words in memory and nothing more: never written to a file, never sent, never put in a route.
    /// It is what the screen says instead of "you" — "Sorted by distance from Woodward & Warren".
    @Published var cross: String?
    /// The ask has been running for ten seconds and nothing has come back (Kyle, 2026-09-22). The screen says
    /// what is taking the time and what would help, and offers a **Stop** that really stops the manager.
    @Published var slow = false

    /// Use the middle of a typed ZIP. Anything that is not a ZIP we carry leaves the list as it was and says so.
    func use(zip typed: String, from zips: ZipCenters) {
        switch lookUpZip(typed, in: zips) {
        case .found(let code, let center):
            stopAsking()
            point = center
            zip = code
            cross = nil
            zipUnknown = false
            denied = false
        case .unknown, .notAZip:
            zipUnknown = true
        }
    }

    /// Use a junction this phone worked out from the streets in the signed bundle (HelpCore/Intersections.swift).
    /// Nothing was asked of anybody and nothing was sent: the words and the point both die with the app.
    func use(cross words: String, at p: LatLon) {
        stopAsking()
        point = p
        cross = words
        zip = nil
        zipUnknown = false
        denied = false
    }
    private let manager = CLLocationManager()
    private var wantsFix = false
    /// The ten-second "Still looking…" timer and the five-minute cut-off. Both are cancelled by a fix, by a
    /// refusal, and by Stop.
    private var slowTask: Task<Void, Never>?
    private var giveUpTask: Task<Void, Never>?
    /// A hundred metres is as close as this app ever needs: the list sorts in bands of a mile and the map draws a
    /// dot. Reduced accuracy is accepted as it comes — `requestTemporaryFullAccuracy` is never called, here or
    /// anywhere (HelpCore/Locate.swift, docs/08).
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyHundredMeters }

    /// What iOS already knows, before anybody is asked anything. The Map tab's first open reads this and nothing
    /// else: `firstOpenAction` in HelpCore turns it into what the screen does.
    var permission: LocatePermission {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .prompt
        @unknown default: return .unknown
        }
    }
    /// True when iOS will not show the sheet again, so the answer is Settings rather than another tap here.
    var permanentlyDenied: Bool { permission == .denied }

    /**
     Ask for a fix, and keep listening.

     **The ten-second give-up is gone** (Kyle, 2026-09-22; `locateSlowSeconds` in HelpCore/Locate.swift). On a
     phone with no network a cold GPS fix is a walk outside and a few minutes of sky, and `requestLocation()`
     gives up on its own long before that — so this uses `startUpdatingLocation()` and stops at the first fix,
     at five minutes, or when a person taps Stop. After ten seconds the screen says what is happening and what
     would help, with the cross-street and ZIP ways in beside it the whole time.
     */
    func ask() {
        denied = false
        zipUnknown = false
        slow = false
        switch manager.authorizationStatus {
        case .notDetermined: wantsFix = true; asking = true; manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: beginListening()
        default: denied = true
        }
    }

    private func beginListening() {
        asking = true
        manager.startUpdatingLocation()
        slowTask?.cancel()
        slowTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(locateSlowSeconds))
            guard !Task.isCancelled, let self, self.asking else { return }
            self.slow = true
        }
        giveUpTask?.cancel()
        giveUpTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(locateGiveUpSeconds))
            guard !Task.isCancelled, let self, self.asking else { return }
            self.stopAsking()
            self.denied = true
        }
    }

    /// Stop really stops: the manager is told to stop, both timers are cancelled, and a fix that lands after
    /// this is dropped on the floor — so it can never move the map out from under somebody who has since typed
    /// a cross street.
    func stopAsking() {
        manager.stopUpdatingLocation()
        wantsFix = false
        asking = false
        slow = false
        slowTask?.cancel(); slowTask = nil
        giveUpTask?.cancel(); giveUpTask = nil
    }

    func forget() {
        stopAsking()
        point = nil; zip = nil; cross = nil; zipUnknown = false; denied = false
    }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in
            switch m.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways: if self.wantsFix { self.wantsFix = false; self.beginListening() }
            case .denied, .restricted: self.stopAsking(); self.denied = true
            default: break
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations l: [CLLocation]) {
        guard let c = l.last?.coordinate else { return }
        // A real fix replaces a typed ZIP or a typed junction: both were stands-in for exactly this.
        Task { @MainActor in
            guard self.asking else { return }                 // a fix after Stop is dropped on the floor
            self.stopAsking()
            self.denied = false; self.zip = nil; self.cross = nil; self.zipUnknown = false
            self.point = LatLon(lat: c.latitude, lon: c.longitude)
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError e: Error) {
        Task { @MainActor in
            guard self.asking else { return }
            // A momentary failure while the receiver is still warming up is not a refusal: keep listening, and
            // let the five-minute cut-off be the thing that gives up.
            if (e as? CLError)?.code == .locationUnknown { return }
            self.stopAsking()
            self.denied = true
        }
    }

    /// How the screen names where a list is sorted from, and what the Directions screen calls its start.
    var originKind: DirOriginKind { dirOriginKind(hasPoint: point != nil, zip: zip, cross: cross) }
    var originWords: String { zip ?? cross ?? "" }
}

struct RootView: View {
    @EnvironmentObject var store: BundleStore
    @EnvironmentObject var nav: AppNav
    var body: some View {
        TabView(selection: $nav.tab) {
            NavigationStack { HomeView() }.tabItem { Label(L.t("tab.home"), systemImage: "house") }.tag(AppNav.Tab.home)
            NavigationStack { HelpView() }.tabItem { Label(L.t("tab.help"), systemImage: "heart") }.tag(AppNav.Tab.help)
            // The web app folded Recreation and Transit into one Map tab (2026-09-20), and this tab is now the
            // same thing on the iPhone: a full-screen map of the city, drawn on the phone from the signed bundle,
            // with the greenway, our own listings, parks and the transport layers on it (Kyle, 2026-09-20). It
            // carries its own NavigationStack, so it is not wrapped in another one here.
            // Everything on it is also a list: "See this map as a list", and the greenway list under it.
            MapTabView().tabItem { Label(L.t("tab.map"), systemImage: "map") }.tag(AppNav.Tab.map)
            // Neighborhoods: public numbers about each of Detroit's 205, with its own tab because Kyle asked for
            // one (2026-09-21, "not just on the web, in the apps too"). The tab label is the SHORT word
            // (`tab.hoods`, "Areas"): "Neighborhoods" does not fit a phone's tab bar at the accessibility text
            // sizes, and the screen itself is titled with the full word. It is never in the crisis path.
            HoodsTabView().tabItem { Label(L.t("tab.hoods"), systemImage: "square.grid.2x2") }
                .accessibilityLabel(L.t("tab.hoods_wide"))
                .tag(AppNav.Tab.hoods)
            // Only when the list carries events (none today: DECISIONS 2026-09-19).
            if !(store.bundle?.events.isEmpty ?? true) {
                NavigationStack { EventsView() }.tabItem { Label(L.t("tab.events"), systemImage: "calendar") }.tag(AppNav.Tab.events)
            }
        }
        .id(nav.rootID)
        .tint(Color.brand)
    }
}

/// "Urgent help" in the top bar of every screen: emergency numbers are one tap away from anywhere. On a screen
/// that carries a quick exit (DV, crisis, treatment, assault) the exit takes that place instead, exactly as in the
/// web app's top bar — those screens already lead with the hotline and 911 as call buttons, so nothing is lost.
struct UrgentButton: ViewModifier {
    var quickExit = false
    @State private var open = false
    @EnvironmentObject private var nav: AppNav
    @Environment(\.openURL) private var openURL
    func body(content: Content) -> some View {
        content.toolbar { ToolbarItem(placement: .topBarTrailing) {
            if quickExit {
                Button { nav.quickExit { openURL($0) } } label: { Label(L.t("safe.exit"), systemImage: "xmark.circle") }
                    .labelStyle(.titleAndIcon)
                    .accessibilityLabel(L.t("safe.exit"))
            } else {
                Button { open = true } label: { Label(L.t("strip.more"), systemImage: "phone") }.labelStyle(.titleAndIcon)
            }
        } }
        .sheet(isPresented: $open) { NavigationStack { UrgentView() } }
    }
}
extension View { func urgentHelp(quickExit: Bool = false) -> some View { modifier(UrgentButton(quickExit: quickExit)) } }

struct CallRow: View {
    let label: String, number: String
    var is911 = false
    /// A phone number is never allowed to wrap or be cut short. At the biggest text sizes the number will not fit
    /// beside its label, so it moves onto its own line instead of pushing the screen sideways.
    @Environment(\.dynamicTypeSize) private var textSize
    var body: some View {
        if let url = telURL(number) {
            Link(destination: url) {
                Group {
                    if textSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 12) {
                                Image(systemName: "phone.fill").font(.body)
                                Text(label).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Text(number).font(.body.weight(.bold)).minimumScaleFactor(0.6).lineLimit(1)
                        }
                    } else {
                        HStack(spacing: 12) {
                            Image(systemName: "phone.fill").font(.body)
                            Text(label).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                            Spacer(minLength: 8)
                            Text(number).font(.body.weight(.bold)).fixedSize()   // phone numbers never truncate
                        }
                    }
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
            // The last row on the sheet, under every number: docs/05's ordering does not move (DECISIONS 2026-09-22).
            if let safe = needs.first(where: { $0.id == "safe_now" }) {
                NavRow(title: L.t("need.safe_now"), symbol: safe.symbol) { NeedView(need: safe) }
            }
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
                // "Find free help" SELECTS the Help tab. It used to push a second copy of `HelpView` inside
                // Home's own stack — two live instances of one screen with different Back behaviour, and the
                // Help tab in the bar did not light up (navigation audit 2026-09-22, H7).
                TabRow(tab: .help, title: L.t("home.help_title"), symbol: "heart", subtitle: L.t("home.help_sub"))
                // The order of docs/05 and of the audit's one-Home recommendation (§4.2), written out here
                // rather than filtered out of `needs`, so what is on the screen is the order on this line and
                // cannot drift with that list (audit M2: the filter rendered declaration order, which led with
                // "A place to sleep").
                LazyVGrid(columns: tileColumns, spacing: 10) {
                    ForEach(quickNeeds) { n in
                        NavTile(title: L.t("quick." + n.id), symbol: n.symbol) { NeedView(need: n) }
                    }
                }
                // The three tiles the web app has and the iPhone did not (audit M1): the Map, the whole park
                // system, and the person's own area. Saved places moved to Help → More, where the web keeps
                // them, so Home has one entry to a screen rather than two (audit L1).
                LazyVGrid(columns: tileColumns, spacing: 10) {
                    TabTile(tab: .map, title: L.t("tab.map"), symbol: "map", subtitle: L.t("home.map_sub"))
                    if !b.parks.isEmpty {
                        NavTile(title: L.t("rec.title"), symbol: "tree") { ParksView() }
                    }
                    TabTile(tab: .hoods, title: L.t("home.hoods_title"), symbol: "square.grid.2x2", subtitle: L.t("home.hoods_sub"))
                }
                // When this phone last got updates, and the two screens that say what the app keeps and sends.
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("home.updated", ["when": prettyDate(b.index.generatedAt)]))
                        .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 16) {
                        NavigationLink { AboutView() } label: { Text(L.t("about.title")).font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }
                        NavigationLink { PrivacyView() } label: { Text(L.t("privacy.title")).font(.footnote.weight(.semibold)).foregroundStyle(Color.brand) }
                    }
                }.padding(.top, 8)
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
            // Browse by type: the web's 19 chips, folded away the same way (audit C2). Without it the iPhone
            // had no browse path at all, so showers and the places for young people could only be reached by
            // already knowing a name to type into Search.
            BrowseSection()
            // "More", where the web app keeps saved places and "Add a place that helps" (docs/04).
            SectionHead(text: L.t("help.more"))
            NavRow(title: L.t("saved.title"), symbol: "bookmark", subtitle: L.t("saved.sub")) { SavedView() }
            NavRow(title: L.t("add.title"), symbol: "plus", subtitle: L.t("add.sub")) { AddPlaceView() }
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
                        ResultsView(query: r.query, sensitive: need.sensitive, first: r.first, emptyKey: need.emptyKey,
                                    quickExit: need.quickExit)
                            .navigationTitle(L.t("refine.\(need.id).\(r.id)"))
                    }
                }
            }.padding(16) }
            .background(Color.appBg.ignoresSafeArea())
            .navigationTitle(L.t("need." + need.id)).navigationBarTitleDisplayMode(.inline)
            .urgentHelp(quickExit: need.quickExit)
        } else {
            ResultsView(query: need.query ?? Query(), categories: need.categories, sensitive: need.sensitive,
                        first: need.first, intro: need.intro,
                        firstLink: need.firstLink, emptyKey: need.emptyKey, quickExit: need.quickExit,
                        footnote: need.id == "safe_now" ? "safe_now.home" : nil,
                        also: need.also.map { (L.t("also.\(need.id).\($0.id)"), $0.query) })
                .navigationTitle(L.t("need." + need.id))
        }
    }
}

struct ResultsView: View {
    @EnvironmentObject var store: BundleStore
    @EnvironmentObject var here: Here
    let query: Query
    /// Several categories in one list ("Get somewhere safe now"): the rows are narrowed by `inCategories`
    /// (HelpCore/MapLayers.swift) before one `rank` call orders the whole mixed list. Empty on every other
    /// screen, where `query.category` does the narrowing as before.
    var categories: [String] = []
    var sensitive = false
    var first: [String] = []
    var intro: String? = nil
    var firstLink: (key: String, url: String)? = nil
    /// What to say when nothing is listed, when the plain "we don't have anything yet" is not the right answer.
    var emptyKey: String? = nil
    /// "Leave this page fast" in the top bar instead of "Urgent help" (docs/08): the need's own setting.
    var quickExit = false
    /// One quiet line under the list. Today only "Get somewhere safe now", whose line about home names no kind
    /// of danger, so the screen stays as blank about why a person opened it as the sheet it hangs off (docs/08).
    var footnote: String? = nil
    /// A second list under its own heading, below the first one ("I need to talk to someone": 988 and the crisis
    /// places first, then the daytime places). Its rows are ordinary rows — the `sensitive` screen setting above
    /// belongs to the first list, and a row's own category decides everything else (Saved.isSensitive).
    var also: (title: String, query: Query)? = nil
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt)
        // The location goes into the ranker even on a sensitive screen: a DV row's `miles` comes back nil from the
        // ranker whatever is passed, so withholding it only stopped those rows from being banded by service area.
        // Nothing about the person leaves the device either way (docs/08).
        var q = query; q.near = here.point
        // A screen that mixes categories narrows the rows here and leaves `query.category` empty, so one `rank`
        // call orders the whole mixed list by the ordinary rules (open now, then distance).
        let pool = categories.isEmpty ? (store.bundle?.rows ?? []) : inCategories(store.bundle?.rows ?? [], categories)
        let ranked = rank(pool, q, now: now, alerts: store.bundle?.alerts ?? [])
        var alsoQ = also?.query ?? Query(); alsoQ.near = here.point
        let alsoRanked = also == nil ? [] : rank(store.bundle?.rows ?? [], alsoQ, now: now, alerts: store.bundle?.alerts ?? [])
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            if let intro { Text(L.t(intro)).font(.body).foregroundStyle(Color.muted) }
            if let firstLink { LinkCard(key: firstLink.key, url: firstLink.url) }
            if !first.isEmpty { EmergencyRows(ids: first) }
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote).foregroundStyle(Color.muted) }
            else { LocationChip() }
            if ranked.isEmpty { Text(L.t(emptyKey ?? "results.none") + " 211").foregroundStyle(Color.muted).card() }
            ForEach(ranked, id: \.row.id) { r in
                CardLink(r: r, showMiles: !sensitive) { DetailView(row: r.row) }
            }
            if let footnote { Text(L.t(footnote)).font(.footnote).foregroundStyle(Color.muted).padding(.top, 4) }
            if let also, !alsoRanked.isEmpty {
                Text(also.title).font(.title3.bold()).padding(.top, 8)
                ForEach(alsoRanked, id: \.row.id) { r in
                    CardLink(r: r, showMiles: true) { DetailView(row: r.row) }
                }
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).urgentHelp(quickExit: quickExit)
    }
}

/// One listing on a list: the card leads to the listing, and the Call button under it is its own control, outside
/// the link. A link inside a link is dead on iOS — "Call" did nothing — and a screen reader reads two controls here,
/// "Crossroads of Michigan, open until 2 pm…" and "Call Crossroads of Michigan", in that order.
struct CardLink<Destination: View>: View {
    let r: Ranked
    var showMiles = true
    @Environment(\.dynamicTypeSize) private var textSize
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink(destination: destination) { Card(r: r, showMiles: showMiles) }.buttonStyle(.plain)
            if let phone = r.row.phones.first, let url = telURL(phone.number) {
                Link(destination: url) {
                    // As on CallRow: at the biggest text sizes the number takes its own line rather than
                    // being cut short or widening the screen.
                    Group {
                        if textSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 10) {
                                    Image(systemName: "phone.fill")
                                    Text(L.t("detail.call")).fontWeight(.semibold)
                                }
                                Text(phone.number).fontWeight(.bold).minimumScaleFactor(0.6).lineLimit(1)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            HStack(spacing: 10) {
                                Image(systemName: "phone.fill")
                                Text(L.t("detail.call")).fontWeight(.semibold)
                                Spacer(minLength: 8)
                                Text(phone.number).fontWeight(.bold).fixedSize()   // phone numbers never truncate
                            }
                        }
                    }
                    .font(.subheadline).foregroundStyle(Color.brandSoftInk)
                    .padding(.horizontal, 14).padding(.vertical, 11).frame(maxWidth: .infinity)
                    .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("detail.call_label", ["name": r.row.name]) + ", " + phone.number)
            }
            // Our own directions, from the row itself, exactly as the web's `card()` offers them: a results
            // list, a safe-now list, the map's own list. A sensitive row has no coordinate and gets no button.
            DirectionsButton(name: r.row.name, lat: r.row.lat, lon: r.row.lon, category: r.row.category)
        }.card()
    }
}

/// What a card says. It never carries its own background: CardLink puts it on one.
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
                // A domestic-violence shelter publishes no address, so it can have no distance. What it can say is
                // who it serves, which is the thing a person actually needs in order to choose (HelpCore/Listing).
                if let area = serviceAreaStringKey(r.row) { Pill(text: L.t("safe.dv_serves", ["area": L.t(area)])) }
            }
            if let n = r.row.notice { Text(n).font(.footnote).foregroundStyle(Color.warnInk).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 10)) }
            Text(badgeText(r.badge)).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct DetailView: View {
    @EnvironmentObject var store: BundleStore
    @Environment(\.openURL) private var openURL
    let row: BundleRow
    var body: some View {
        let now = effectiveNow(.now, bundleGeneratedAt: store.bundle?.index.generatedAt), alerts = store.bundle?.alerts ?? []
        let sensitive = isSensitive(row.category)
        // A private listing (DV, crisis, treatment, assault) keeps its name off the navigation bar, which is what
        // the parent screen's Back button and any screenshot of it would carry. The name is in the page instead,
        // where it belongs to this screen only (docs/08, audit A8; iPhone review 2026-09-20).
        let priv = isPrivate(row.category)
        let open = openNow(row, now: now, alerts: alerts)
        let next = nextOccurrences(row, now: now, n: 3, alerts: alerts)
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                if priv {
                    Text(row.name).font(.title3.bold()).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                }
                Text(row.org).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                Pill(text: openText(open), tone: Pill.tone(for: open.state))
                Text(badgeText(DetroitQuery.badge(row, now: now))).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                if let note = holidayNote(open) {
                    Text(note).font(.subheadline).foregroundStyle(Color.warnInk).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
                }
                if let n = row.notice {
                    Text(n).font(.subheadline).foregroundStyle(Color.warnInk).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading).background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
                }
            }.card()
            ForEach(row.phones, id: \.number) { p in CallRow(label: L.t("detail.call") + (p.label.map { L.t("list.sep") + $0 } ?? ""), number: p.number) }
            // Directions to the street address when the place publishes one, and otherwise to its point on the
            // map (the Wayne County naloxone stations have coordinates and no address). The coordinate is passed
            // to the maps app as a coordinate; it is never printed as if it were an address.
            // The destination is escaped strictly (HelpCore/Listing), so an address that reads "…&from=42.3,-83.0"
            // cannot put a second parameter — an origin — into the link.
            // **Our own directions come first** and are the primary button (DECISIONS 2026-09-22): they are
            // computed on this phone, work with no signal, and tell nobody where the person is going. The links
            // that hand the place to somebody else's app are kept, under "Other apps", where the screen says
            // plainly that the app will see the place.
            DirectionsButton(name: row.name, lat: row.lat, lon: row.lon, category: row.category, primary: true)
            if let url = mapsURL(row) {
                DisclosureGroup(L.t("dir.other_apps")) {
                    VStack(alignment: .leading, spacing: 10) {
                        Link(destination: url) {
                            HStack(spacing: 10) { Image(systemName: "mappin.and.ellipse"); Text(L.t("detail.directions")).fontWeight(.semibold); Spacer() }
                                .foregroundStyle(Color.brand).padding(.horizontal, 16).padding(.vertical, 13)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L.t("detail.directions_label", ["name": row.name]))
                        // The same trip in the Transit app, when this phone has it: Transit's own documented
                        // scheme, the destination and nothing else (Listing.swift). An addition, not an
                        // endorsement and not a partnership.
                        if let turl = transitAppURL(row, canOpen: { UIApplication.shared.canOpenURL($0) }) {
                            Button { openURL(turl) } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "bus")
                                    Text(L.t("detail.bus_app")).fontWeight(.semibold).multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: "arrow.up.forward.square")
                                }
                                .foregroundStyle(Color.brand).padding(.horizontal, 16).padding(.vertical, 13)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L.t("detail.bus_app_label", ["name": row.name]))
                        }
                        Text(L.t("dir.other_apps_note")).font(.footnote).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .font(.subheadline.weight(.semibold)).tint(Color.brand)
                Text(L.t("detail.directions_note")).font(.footnote).foregroundStyle(Color.muted)
            }
            // Saved places are kept on this phone only, and a private listing has no Save button at all (docs/08).
            SaveButton(row: row)
            if sensitive { Text(L.t("safe.calls_note")).font(.footnote).foregroundStyle(Color.muted) }
            // A shelter that keeps its address secret says so plainly, and says who it serves, rather than simply
            // showing nothing where an address would be.
            if saysNoAddress(row) {
                Text(L.t("safe.dv_no_address")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            if let area = serviceAreaStringKey(row) {
                Text(L.t("safe.dv_serves", ["area": L.t(area)])).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if L.translated { Text(L.t("detail.in_english")).font(.footnote).foregroundStyle(Color.muted) }
            DetailSection(title: L.t("detail.what")) { Text(row.what).fixedSize(horizontal: false, vertical: true) }
            if let e = row.eligibility { DetailSection(title: L.t("detail.who")) { Text(e).fixedSize(horizontal: false, vertical: true) } }
            if !next.isEmpty {
                DetailSection(title: L.t("detail.next")) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(next, id: \.start) { o in
                            // A holiday occurrence is labelled, never dropped (query-spec "Holidays").
                            HStack {
                                // "Today" / "Tomorrow" / "Saturday, Sep 26", never "2026-09-26". The pill above
                                // has said it that way since DayWords landed; this list was still printing the
                                // raw ISO day, which is not a date most people read (2026-09-21).
                                Text(dayName(o.date, now: now))
                                Spacer()
                                Text("\(clock(o.opensAt)) – \(clock(o.closesAt))" + (o.holiday ? " · " + L.t("hours.holiday") : ""))
                                    .foregroundStyle(o.holiday ? Color.warnInk : Color.muted)
                            }
                        }
                    }
                }
            }
            if let h = row.hoursText { DetailSection(title: L.t("detail.hours")) { Text(h).fixedSize(horizontal: false, vertical: true) } }
            if let a = row.address {
                DetailSection(title: L.t("detail.where")) { Text("\(a.line1)\n\(a.city), MI \(a.zip ?? "")").fixedSize(horizontal: false, vertical: true) }
            } else if showsPointWithoutAddress(row) {
                // Somewhere real that publishes no street address: say so in the source's own name, and leave
                // Directions above to open the point. Never invent an address from the coordinate.
                DetailSection(title: L.t("detail.where")) {
                    Text(L.t("detail.where_no_address", ["source": row.facts.source.name])).fixedSize(horizontal: false, vertical: true)
                }
            }
            DetailSection(title: L.t("detail.source")) { Text(row.facts.source.name).fixedSize(horizontal: false, vertical: true) }
            // Tell us it's wrong. Nothing about the person goes with it (docs/04): see Reports.swift.
            ReportBox(targetId: row.id, category: row.category)
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(priv ? L.t("app.name") : row.name).navigationBarTitleDisplayMode(.inline)
        .urgentHelp(quickExit: priv)
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
                CardLink(r: r) { DetailView(row: r.row) }
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
        let near = helpAlong((store.bundle?.rows ?? []).filter { !isSensitive($0.category) }, segment)
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Pill(text: L.t("gw." + segment.phase), tone: segment.phase == "open" ? .open : .plain)
            if let cross = segment.crossStreets, !cross.isEmpty {
                DetailSection(title: L.t("gw.crosses")) { Text(cross.joined(separator: L.t("list.sep"))).fixedSize(horizontal: false, vertical: true) }
            }
            SectionHead(text: L.t("gw.help_along"))
            if near.isEmpty { Text(L.t("gw.help_none")).foregroundStyle(Color.muted).card() }
            ForEach(near, id: \.row.id) { n in
                CardLink(r: Ranked(row: n.row, open: openNow(n.row, now: now), badge: DetroitQuery.badge(n.row, now: now), miles: n.miles, band: 0)) { DetailView(row: n.row) }
            }
            // A condition report is about a thing, never a person (docs/11), and it names the segment whose screen
            // this is: no coordinate, raw or rounded, ever leaves the phone.
            if segment.phase == "open" { ReportBox(targetId: segment.id, isPlace: true) }
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
                    Text([String(e.startsAt.prefix(10)), e.location].compactMap { $0 }.joined(separator: L.t("list.sep"))).font(.subheadline).foregroundStyle(Color.muted)
                    if let url = URL(string: e.url) { Link(L.t("events.details"), destination: url).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand) }
                }.card()
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea()).navigationTitle(L.t("tab.events")).urgentHelp()
    }
}
