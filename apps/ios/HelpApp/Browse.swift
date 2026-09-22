// Three things the iPhone app did not have, and the web app has had for a while (navigation audit 2026-09-22):
// browse by type on the Help tab, one "Parks and paths" front door with a page for every park, and Home tiles
// that select a tab instead of pushing a second copy of a screen.
//
// Every list here is the ordinary ranked list, so nothing sensitive or private can appear in one, and no screen
// in this file asks for, holds or sends anything about a person.
import DetroitQuery
import HelpCore
import SwiftUI

// MARK: - Home: the six quick needs, in the order docs/05 and the audit give them

/// The audit's one-Home order (§4.2): Food · A place to sleep · A doctor · Help with drugs or alcohol ·
/// Free Narcan · A job or training. Written out as ids and looked up in order, so the screen's order is this
/// line and cannot drift with the declaration order of `needs` (audit M2). Exactly the `quick` literal in
/// `homeTab()`, apps/web/src/main.ts.
let quickNeedIds = ["food", "shelter", "doctor", "drugs", "narcan", "job"]
var quickNeeds: [Need] { quickNeedIds.compactMap { id in needs.first { $0.id == id } } }

// MARK: - Home: a row and a tile that SELECT a tab

/// "Find free help" selects the Help tab. It used to push a second `HelpView` into Home's own stack, so the app
/// held two live copies of one screen with different Back behaviour and the tab in the bar did not light up
/// (audit H7).
struct TabRow: View {
    let tab: AppNav.Tab
    let title: String
    let symbol: String
    var subtitle: String?
    @EnvironmentObject private var nav: AppNav
    var body: some View {
        Button { nav.tab = tab } label: {
            HStack(spacing: 14) {
                IconBadge(symbol: symbol)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
            }.card()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(subtitle.map { "\(title). \($0)" } ?? title)
    }
}

/// The same thing as a tile. The subtitle is in the accessible name rather than on the face of the tile, so two
/// tiles a row stay legible at the accessibility text sizes and a screen reader still hears the whole fact.
struct TabTile: View {
    let tab: AppNav.Tab
    let title: String
    let symbol: String
    var subtitle: String?
    @EnvironmentObject private var nav: AppNav
    var body: some View {
        Button { nav.tab = tab } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: symbol).font(.body).foregroundStyle(Color.brand).frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    if let subtitle {
                        Text(subtitle).font(.caption).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: tileHeight, alignment: .leading)
            .card(padding: 14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(subtitle.map { "\(title). \($0)" } ?? title)
    }
}

// MARK: - browse by type (audit C2)

/// The web app's 19 chips, in the web app's order (`CATEGORIES` in apps/web/src/needs.ts). Until this existed,
/// the iPhone had **no** browse path at all, so the 5 shower listings and the 19 for young people could only be
/// reached by already knowing a place's name and typing it into Search.
///
/// `AppParityTests` holds this list to the web's, id for id and in order.
let browseCategories: [(id: String, symbol: String, query: Query)] = [
    ("food", "fork.knife", Query(category: "food")),
    ("shelter", "bed.double", Query(category: "shelter.emergency")),
    ("health", "cross.case", Query(category: "health")),
    ("harm", "shippingbox", Query(category: "harm")),
    ("utilities", "bolt", Query(category: "utilities")),
    ("hygiene", "drop", Query(category: "hygiene")),
    ("youth", "figure.2.and.child.holdinghands", Query(category: "youth")),
    ("jobs", "briefcase", Query(category: "jobs")),
    ("learn", "book", Query(category: "learn")),
    ("treatment", "leaf", Query(category: "treatment")),
    ("housing", "key", Query(category: "housing")),
    ("legal", "building.columns", Query(category: "legal")),
    ("ids", "person.text.rectangle", Query(category: "ids")),
    ("money", "dollarsign.circle", Query(category: "money")),
    ("goods", "tshirt", Query(category: "goods")),
    ("kids", "figure.2.and.child.holdinghands", Query(category: "kids")),
    ("connect", "wifi", Query(category: "connect")),
    ("transport", "bus", Query(category: "transport")),
    ("pets", "pawprint", Query(category: "pets")),
]

/// "Browse every kind of help", folded away the way the web folds it, so it does not push the need tiles down.
struct BrowseSection: View {
    @State private var open = false
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.easeInOut(duration: 0.15)) { open.toggle() } } label: {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Color.brand)
                    Text(L.t("home.categories")).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.muted).rotationEffect(.degrees(open ? 90 : 0))
                }.card()
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityValue(open ? L.t("map.list_title") : "")
            if open {
                LazyVGrid(columns: tileColumns, spacing: 10) {
                    ForEach(browseCategories, id: \.id) { c in
                        NavTile(title: L.t("cat." + c.id), symbol: c.symbol) {
                            CategoryView(id: c.id, query: c.query)
                        }
                    }
                }
            }
        }
    }
}

/// One kind of help, listed by the ordinary rules. The same screen the web reaches with `#/c/<id>`.
struct CategoryView: View {
    let id: String
    let query: Query
    var body: some View {
        ResultsView(query: query)
            .navigationTitle(L.t("cat." + id)).navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Parks and paths (audit H4, and Kyle's direction (b) of 2026-09-22)

/// "This is not a Joe Louis Greenway app; it is just one component of the park system" (Kyle, 2026-09-22).
///
/// One front door for the whole park system: every City park, each with a page of its own; the recreation
/// centers and libraries; and the greenway as **one row** among them, leading to the screen it has always had,
/// with its 52 stretches and their condition reports untouched. What changed is the weight, not the content.
/// Before this screen existed, 302 parks were a run of names inside the Map tab's list sheet and no client
/// could open one.
struct ParksView: View {
    @EnvironmentObject var store: BundleStore
    @EnvironmentObject var here: Here
    var body: some View {
        let b = store.bundle
        let parks = parksInOrder(b?.parks ?? [], near: here.point)
        let segments = b?.segments ?? []
        let open = segments.filter { $0.phase == "open" }.count
        let now = effectiveNow(.now, bundleGeneratedAt: b?.index.generatedAt)
        var q = Query(category: "rec"); q.near = here.point
        let centers = rank(b?.rows ?? [], q, now: now, alerts: b?.alerts ?? [])
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text(L.t("rec.lede")).font(.body).foregroundStyle(Color.muted)
            LocationChip()
            if !segments.isEmpty {
                SectionHead(text: L.t("rec.paths"))
                NavRow(title: L.t("gw.title"), symbol: "point.topleft.down.curvedto.point.bottomright.up",
                       subtitle: L.t("rec.gw_row", ["open": String(open), "total": String(segments.count)])) { GreenwayView() }
                Text(L.t("rec.paths_gap")).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            SectionHead(text: L.t("rec.parks"))
            Text(L.t(here.point != nil ? "rec.parks_near" : "rec.parks_abc")).font(.footnote).foregroundStyle(Color.muted)
            ForEach(parks) { p in
                NavRow(title: p.name, symbol: "tree", subtitle: parkSubtitle(p, from: here.point)) { ParkView(park: p) }
            }
            if let edited = b?.parksEdited, !edited.isEmpty {
                Text(L.t("rec.parks_source", ["date": prettyDate(edited)])).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SectionHead(text: L.t("rec.centers"))
            if centers.isEmpty { Text(L.t("rec.centers_none")).foregroundStyle(Color.muted).card() }
            ForEach(centers, id: \.row.id) { r in CardLink(r: r) { DetailView(row: r.row) } }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(L.t("rec.title")).urgentHelp()
    }
}

/// Nearest first when a location or a typed ZIP is known, and A to Z otherwise. The same order the web's
/// `parksInOrder` produces, and it is honest either way: a distance to a park is a distance, not a ranking.
func parksInOrder(_ parks: [Park], near: LatLon?) -> [Park] {
    guard let near else { return parks.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } }
    var withMiles: [(park: Park, mi: Double)] = []
    for p in parks { withMiles.append((p, miles(near, LatLon(lat: p.lat, lon: p.lon)))) }
    withMiles.sort { $0.mi != $1.mi ? $0.mi < $1.mi : $0.park.name < $1.park.name }
    return withMiles.map(\.park)
}

/// What kind of park it is, how big, and how far — whichever of those the City actually published.
func parkSubtitle(_ p: Park, from: LatLon?) -> String? {
    var parts: [String] = []
    if let t = p.type, !t.isEmpty { parts.append(t) }
    if let a = p.acres, a > 0 { parts.append(L.t("rec.acres", ["acres": numberText(a)])) }
    if let from {
        let mi = miles(from, LatLon(lat: p.lat, lon: p.lon))
        parts.append(L.t("miles", ["miles": String(format: "%.1f", mi)]))
    }
    return parts.isEmpty ? nil : parts.joined(separator: L.t("list.sep"))
}

private func numberText(_ a: Double) -> String {
    a == a.rounded() ? String(Int(a)) : String(format: "%.1f", a)
}

/// One park (audit H4). Everything on it is already in `places/parks.json`: the City's own name for the place,
/// what kind of park it is, how big it is, the address where the City publishes one, and a coordinate — which is
/// what makes Directions and "help within a 10-minute walk" possible without asking anybody anything.
///
/// A coordinate is never printed as if it were an address (docs/08): a park the City gives no address for says
/// so in words and still offers directions to its point.
struct ParkView: View {
    @EnvironmentObject var store: BundleStore
    let park: Park
    var body: some View {
        let b = store.bundle
        let at = LatLon(lat: park.lat, lon: park.lon)
        let now = effectiveNow(.now, bundleGeneratedAt: b?.index.generatedAt)
        // The ordinary ranked list, narrowed to the help this park can actually be walked to — so nothing
        // sensitive or private can be in it, by the same rule as everywhere else.
        let rows: [BundleRow] = b?.rows ?? []
        let walkable: [BundleRow] = rows.filter { r in
            guard let lat = r.lat, let lon = r.lon, r.status == "active", !isPrivate(r.category) else { return false }
            return miles(at, LatLon(lat: lat, lon: lon)) <= walkMiles
        }
        var q = Query(); q.near = at
        let near = Array(rank(walkable, q, now: now, alerts: b?.alerts ?? []).prefix(5))
        let gw = nearestSegment(at, b?.segments ?? [], openOnly: true, maxMiles: 0.5)
        return ScrollView { VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                if let t = park.type, !t.isEmpty {
                    Text(t).font(.subheadline).foregroundStyle(Color.muted).environment(\.locale, Locale(identifier: "en"))
                }
                if let a = park.acres, a > 0 { Text(L.t("rec.acres", ["acres": numberText(a)])).font(.subheadline).foregroundStyle(Color.muted) }
                if let address = park.address, !address.isEmpty {
                    Text(address).font(.body).environment(\.locale, Locale(identifier: "en")).fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(L.t("rec.no_address")).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                }
            }.card()
            if let url = parkMapsURL(park) {
                Link(destination: url) {
                    HStack(spacing: 10) { Image(systemName: "mappin.and.ellipse"); Text(L.t("detail.directions")).fontWeight(.semibold); Spacer() }
                        .foregroundStyle(Color.brand).padding(.horizontal, 16).padding(.vertical, 13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L.t("detail.directions_label", ["name": park.name]))
                Text(L.t("detail.directions_note")).font(.footnote).foregroundStyle(Color.muted)
            }
            if let gw {
                SectionHead(text: L.t("rec.paths"))
                NavRow(title: gw.segment.name, symbol: "point.topleft.down.curvedto.point.bottomright.up",
                       subtitle: L.t("miles", ["miles": String(format: "%.1f", gw.miles)])) { SegmentView(segment: gw.segment) }
            }
            SectionHead(text: L.t("rec.help_near"))
            if near.isEmpty {
                Text(L.t("rec.help_near_none")).foregroundStyle(Color.muted).card().fixedSize(horizontal: false, vertical: true)
            }
            ForEach(near, id: \.row.id) { r in CardLink(r: r) { DetailView(row: r.row) } }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(park.name).navigationBarTitleDisplayMode(.inline).urgentHelp()
    }
}

/// Directions to a park: its street address where the City publishes one, else its own coordinate. The same
/// strict escaping as a listing's (`HelpCore/Listing.swift`), so nothing in a City-written address can add a
/// second parameter — an origin — to the link.
func parkMapsURL(_ park: Park) -> URL? { mapsURL(address: park.address, lat: park.lat, lon: park.lon) }
