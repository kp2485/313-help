// The Neighborhoods tab (docs/13, Kyle 2026-09-21: "not just on the web, in the apps too"): public numbers about
// each of Detroit's 205 neighborhoods — what help is nearby, homes and building, conditions, safe streets — with
// every number's source and date under it.
//
// This screen is a port of `hoodList` and `hoodPage` in apps/web/src/hoods.ts: the same panels, in the same order,
// with the same words and the same numbers. The rules themselves (decoding, which neighborhood a point is in,
// the order of the index, the search box, and how every number is written) live in HelpCore/Hoods.swift, where
// `swift test` runs them.
//
// What this tab does NOT do, deliberately (docs/13): no ranking of neighborhoods against each other, no colour
// that reads as a score, no per-neighborhood crime, and a count under five is the words "fewer than 5". Nothing
// here comes from a phone, a report, or app usage. "Use my location" is worked out on this phone against outlines
// that arrived in the signed bundle: the position is never written down and never sent (docs/08).
import Charts
import DetroitQuery
import HelpCore
import SwiftUI

// MARK: - the numbers, fetched when this tab is first opened

@MainActor
@Observable
final class HoodsModel {
    private(set) var indicators: Indicators?
    /// True when this bundle has no neighborhood numbers at all, or they could not be read. The screen then says
    /// so in words; it never shows an empty list as if there were nothing in Detroit.
    private(set) var failed = false
    private var key = ""
    private var asking = false

    /// Lazy, checksum first, decoded off the main actor — exactly as a map file is (MapModel.swift). A bundle
    /// that does not carry the file at all is the same answer as one we could not read: we say so.
    func load(from store: BundleStore) async {
        guard let src = store.mapSource(HoodsFile.name) else { failed = true; return }
        guard src.sha256 != key || indicators == nil, !asking else { return }
        asking = true
        defer { asking = false }
        do {
            indicators = try await MapLoader.shared.indicators(src)
            key = src.sha256
            failed = false
        } catch {
            failed = true
        }
    }
}

/// Where a tap on the map, on the index, or on "Your neighborhood" goes next. `hood` is any area id — a Detroit
/// neighborhood or one of the four cities — because both are the same page drawn from the same components.
enum HoodRoute: Hashable { case hood(String), index }

/// A to Z, grouped by council district, or nearest first. **None of the three is a ranking**: the City numbers
/// its districts, and a distance to the middle of an outline says how far away a place is, never how good it is
/// (docs/13, honesty rule 1). "Nearest first" is offered only when a location, a ZIP or a cross street is
/// already known, and the distance is worked out here, on the phone, from a point that never leaves it.
enum HoodGrouping: String, CaseIterable, Identifiable {
    case near, abc, district
    var id: String { rawValue }
    var label: String {
        switch self {
        case .near: return L.t("hood.order_near")
        case .abc: return L.t("hood.group_abc")
        case .district: return L.t("hood.group_district")
        }
    }
}

/// Which view of the Areas tab is showing. The map is the landing (audit §3.1); the index is the second view.
enum HoodsView: String { case map, list }

// MARK: - the tab

struct HoodsTabView: View {
    @EnvironmentObject private var store: BundleStore
    @Environment(MapModel.self) private var map
    @State private var model = HoodsModel()
    @State private var path: [HoodRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            HoodsIndexView(model: model)
                .navigationDestination(for: HoodRoute.self) { route in
                    switch route {
                    case .hood(let id):
                        if let d = model.indicators, let page = d.areaPage(id: id) { AreaPageView(page: page, d: d) }
                    case .index:
                        // "All 205 Detroit neighborhoods", from the Detroit city page: the index, not the map.
                        HoodsIndexView(model: model, startAs: .list)
                    }
                }
        }
        .task(id: store.bundle?.index.version) {
            await model.load(from: store)
            // The Areas tab lands on a map, so the outlines and the city under them are wanted here too.
            await map.loadAreas(from: store)
            await map.loadBase(from: store)
        }
    }
}

// MARK: - the index

struct HoodsIndexView: View {
    let model: HoodsModel
    /// The Detroit city page's "All 205 Detroit neighborhoods" arrives straight at the index.
    var startAs: HoodsView = .map
    @EnvironmentObject private var here: Here
    @Environment(MapModel.self) private var map
    /// Memory only, like every other search box in this app: never stored, never sent, never logged.
    @State private var find = ""
    @State private var grouping: HoodGrouping = .abc
    @State private var view: HoodsView?
    /// The outline a tap chose, this screen only.
    @State private var picked = ""
    @State private var navigate: String?

    private var showing: HoodsView { view ?? startAs }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            if let d = model.indicators {
                Text(L.t("hood.index_intro")).font(.body).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                if showing == .map { mapView }
                // The switch is a button, not a tab set: there are two views of one thing, and the wording says
                // which one you are about to get.
                Button(L.t(showing == .map ? "map.list_title" : "map.list_as_map")) {
                    view = showing == .map ? .list : .map
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                MyHoodCard(d: d)
                if showing == .list { list(d) }
                cities(d)
                Text(L.t("hood.index_sources")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                Text(L.t("hood.describe")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(L.t(model.failed ? "hood.unavailable" : "home.loading")).foregroundStyle(Color.muted).card()
            }
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .searchable(text: $find, placement: .navigationBarDrawer(displayMode: .always), prompt: L.t("hood.find_label"))
        .autocorrectionDisabled()
        // "Nearest first" is only an order once there is a point to measure from; it can never be left selected
        // after the location is switched off.
        .onChange(of: here.point) { _, p in if p == nil, grouping == .near { grouping = .abc } }
        .navigationDestination(item: $navigate) { id in
            if let d = model.indicators, let page = d.areaPage(id: id) { AreaPageView(page: page, d: d) }
        }
        // The full word on the screen and in VoiceOver; the tab bar's own label is the short one (`tab.hoods`).
        .navigationTitle(L.t("tab.hoods_wide"))
        .urgentHelp()
    }

    /// The landing: the four city outlines and the 205 neighbourhood outlines, and nothing else on the map.
    @ViewBuilder private var mapView: some View {
        AreasMapView(areas: map.areas, base: map.base, selected: $picked, open: { navigate = $0 })
        if let a = map.area(id: picked) {
            AreaCard(area: a) { navigate = a.id }
        }
        Text(L.t("hood.map_note")).font(.footnote).foregroundStyle(Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func list(_ d: Indicators) -> some View {
        Picker(L.t("hood.group_label"), selection: $grouping) {
            ForEach(orders) { g in Text(g.label).tag(g) }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(L.t("hood.group_label"))
        let shown = hoodsMatching(hoodsAlphabetical(d.neighborhoods), query: find)
        Text(shown.isEmpty ? L.t("hood.find_none")
             : L.t(shown.count == 1 ? "hood.find_one" : "hood.find_count", ["count": String(shown.count)]))
            .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
        LazyVStack(alignment: .leading, spacing: 8, pinnedViews: []) {
            ForEach(groups(of: shown), id: \.0) { title, hoods in
                if !title.isEmpty { SectionHead(text: title) }
                ForEach(hoods) { h in HoodRowLink(hood: h) }
            }
        }
    }

    /// The other three cities, as rows. They are outlines on the map too, but a list has to name them: a person
    /// who reads lists rather than pictures must reach a Hamtramck page in the same number of taps as a
    /// Detroiter reaches theirs, and "it is on the map" is not an answer to that.
    @ViewBuilder private func cities(_ d: Indicators) -> some View {
        if d.cityRows.isEmpty {
            Text(L.t("hood.only_detroit")).font(.footnote).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            SectionHead(text: L.t("city.list_head"))
            Text(L.t("city.list_note")).font(.footnote).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(d.cityRows) { c in
                NavigationLink(value: HoodRoute.hood(c.id)) {
                    HStack(spacing: 12) {
                        Text(L.rightToLeft ? ltr(c.name) : c.name)
                            .font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                    }.card(padding: 14)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(c.name)
            }
        }
    }

    /// "Nearest first" is offered only when a location, a typed ZIP or a typed cross street is already known.
    private var orders: [HoodGrouping] {
        here.point == nil ? [.abc, .district] : HoodGrouping.allCases
    }

    /// The headings over the list: one per letter, one per council district, or none at all when the order is by
    /// distance — a letter over a distance-ordered list is a heading that lies about the order under it.
    private func groups(of list: [Hood]) -> [(String, [Hood])] {
        switch grouping {
        case .near:
            guard let p = here.point else { return groupsAlphabetical(list) }
            return [("", hoodsNearestFirst(list, to: p))]
        case .district:
            return hoodsByDistrict(list).map { g in
                (g.district.map { L.t("hood.district", ["n": String($0)]) } ?? L.t("hood.no_district"), g.hoods)
            }
        case .abc:
            return groupsAlphabetical(list)
        }
    }

    private func groupsAlphabetical(_ list: [Hood]) -> [(String, [Hood])] {
        // The web's `groupHoods('abc')`: one group per first letter, and a name that starts with anything
        // else files last under "Other" — never first.
        var letters: [(String, [Hood])] = [], other: [Hood] = []
        for h in list {
            let key = hoodLetter(h)
            if key.isEmpty { other.append(h) }
            else if letters.last?.0 == key { letters[letters.count - 1].1.append(h) }
            else { letters.append((key, [h])) }
        }
        return letters + (other.isEmpty ? [] : [(L.t("hood.letter_other"), other)])
    }
}

/// One neighborhood on the index. Its name is the City's, not ours, so it is held together as one left-to-right
/// run inside an Arabic sentence, exactly as a route name is on the map (MapScreen.ltr).
struct HoodRowLink: View {
    let hood: Hood
    var body: some View {
        NavigationLink(value: HoodRoute.hood(hood.id)) {
            HStack(spacing: 12) {
                Text(L.rightToLeft ? ltr(hood.name) : hood.name)
                    .font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
            }.card(padding: 14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(hood.name)
    }
}

/// "Your neighborhood": worked out on this phone, from a position the person asked for and that goes nowhere.
/// A spot that is not in one of Detroit's 205 — Hamtramck, Highland Park, Dearborn, the river — says so plainly
/// and offers the map, rather than picking the nearest neighborhood and pretending.
struct MyHoodCard: View {
    let d: Indicators
    @EnvironmentObject private var here: Here
    @EnvironmentObject private var nav: AppNav
    @Environment(MapModel.self) private var map
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L.t("hood.mine_head")).font(.headline).foregroundStyle(Color.ink)
                .accessibilityAddTraits(.isHeader)
            if let p = here.point {
                if let h = d.neighborhood(containing: p) {
                    HoodRowLink(hood: h)
                    // A ZIP is not a neighborhood: it is one point for a whole area, and it usually covers
                    // several. The screen says which it looked in rather than calling it "yours".
                    if let zip = here.zip {
                        Text(L.t("hood.mine_zip", ["zip": zip])).font(.footnote).foregroundStyle(Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    Text(L.t("hood.mine_outside")).font(.subheadline).foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        map.show(p)
                        nav.tab = .map
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "map")
                            Text(L.t("hood.mine_map")).fontWeight(.semibold)
                        }
                        .font(.subheadline).foregroundStyle(Color.brandSoftInk)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L.t("hood.mine_map"))
                }
            }
            // Asking is the same control, with the same words and the same refusal handling, as every other
            // screen that offers it. Once there IS a position, this screen says its own thing: the shared chip
            // says "Sorted by distance from you", and nothing here is a list sorted by distance.
            if here.point == nil {
                LocationChip()
            } else {
                Button(L.t(here.zip == nil ? "loc.off" : "loc.zip_off")) { here.forget() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                Text(L.t("hood.mine_note")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.card()
    }
}

// MARK: - one neighborhood

struct HoodPageView: View {
    let hood: Hood
    let d: Indicators
    @EnvironmentObject private var nav: AppNav
    @Environment(MapModel.self) private var map

    /// Table or chart, for every year panel on this page at once. It is read from, and written to, the same file
    /// the map layer choices live in (MapModel → MapLayerStore): this phone only, never sent.
    private var yearView: Binding<HoodViewChoice> {
        Binding(get: { map.hoodView }, set: { map.setHoodView($0) })
    }

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            Text([hood.district.map { L.t("hood.district", ["n": String($0)]) }, hood.inJLG ? L.t("hood.in_jlg") : nil]
                .compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            Text(L.t("hood.describe")).font(.subheadline).foregroundStyle(Color.warnInk)
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
                .fixedSize(horizontal: false, vertical: true)
            HoodOutlineMap(hood: hood, origin: d.origin) {
                // Cheap, because the Map tab's camera is a handful of numbers: show the middle of this
                // neighborhood and hand the tab over. Nothing about the person is involved.
                map.show(LatLon(lat: hood.center[0], lon: hood.center[1]), radiusMeters: 1600)
                nav.tab = .map
            }
            HoodHelpPanel(hood: hood, d: d)
            HoodMoneyPanel(hood: hood, d: d, view: yearView)
            HoodConditionsPanel(hood: hood, d: d, view: yearView)
            HoodCrashPanel(hood: hood, d: d)
            HoodSourcesPanel(d: d)
        }.padding(16) }
        .background(Color.appBg.ignoresSafeArea())
        .navigationTitle(hood.name).navigationBarTitleDisplayMode(.inline)
        .urgentHelp()
    }
}

// MARK: - the panels, in the web page's order

/// 1. "Help people here can reach" — what our own list has in or near this neighborhood, how far the nearest of
/// each kind is, the City's parks and stops, and what we have nothing listed for yet.
private struct HoodHelpPanel: View {
    let hood: Hood
    let d: Indicators
    @EnvironmentObject private var store: BundleStore
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.help_head"))
            if !hood.help.coverageChecked {
                VStack(alignment: .leading, spacing: 12) {
                    Text(L.t("hood.thin")).font(.subheadline).foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    // "Tell us what we're missing" is a sentence with nothing behind it unless it leads
                    // somewhere. It leads to the same form the Help tab offers (docs/04).
                    NavigationLink { AddPlaceView() } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus")
                            Text(L.t("add.title")).fontWeight(.semibold).multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .font(.subheadline).foregroundStyle(Color.brandSoftInk)
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.brandSoft, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.plain)
                }.card()
            }
            Text(L.t(hood.help.total == 1 ? "hood.help_count_one" : "hood.help_count",
                     ["count": String(hood.help.total), "miles": HoodFormat.loose(d.nearMiles)]))
                .font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            let kinds = hood.help.kindsWithSomething
            if !kinds.isEmpty {
                HoodRows(kinds.map { (L.t("add.cat." + ($0.kind == "shelter" ? "shelter.emergency" : $0.kind)),
                                      String($0.count), "") })
            }
            if !hood.help.noneListedYet.isEmpty {
                Text(L.t("hood.none_listed", ["kinds": hood.help.noneListedYet.map { L.t("hood.kind." + $0) }.joined(separator: L.t("list.sep"))]))
                    .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            HoodSubHead(L.t("hood.nearest_head"))
            VStack(spacing: 8) {
                ForEach(hoodNearestKinds, id: \.self) { kind in
                    NearestHelpRow(kind: kind, help: hood.help, rows: store.bundle?.rows ?? [])
                }
            }
            HoodSubHead(L.t("hood.places_head", ["miles": HoodFormat.loose(d.nearMiles)]))
            HoodRows([(L.t("hood.parks"), plain(hood.places.parks), ""),
                      (L.t("hood.rec_centers"), plain(hood.places.recCenters), ""),
                      (L.t("hood.greenway_open"), plain(hood.places.greenwayOpen), "")]
                     + (hood.places.snapStores.map { [(L.t("hood.snap_stores"), plain($0), "")] } ?? [])
                     + (hood.places.busStops.map { [(L.t("hood.bus_stops"), plain($0), "")] } ?? []))
            if let nc = hood.nearestCity {
                HoodSubHead(L.t("hood.city_near_head"))
                HoodRows([(L.t("hood.near.snap"), miles(nc.snap), ""),
                          (L.t("hood.near.grocery"), miles(nc.grocery), ""),
                          (L.t("hood.near.bus"), miles(nc.bus), "")])
                HoodFoot(L.t("hood.snap_note"))
            }
        }
    }
    private func plain(_ n: Int) -> String { String(n) }
    private func miles(_ m: Double?) -> String {
        m.map { L.t("miles", ["miles": HoodFormat.number($0, decimals: 1)]) } ?? L.t("hood.none_found")
    }
}

/**
 One "nearest listed food / clinic / Narcan / library" row.

 When the bundle says which listing it is, and that listing is still here, and it is not one of the private kinds
 (HelpCore, `nearestListing`), the row names it and opens it — the distance stops being a fact with nowhere to go.
 Otherwise it is the plain row the web has always drawn: the kind, and how far away.
 */
struct NearestHelpRow: View {
    let kind: String
    let help: HoodHelp
    let rows: [BundleRow]
    @Environment(\.dynamicTypeSize) private var textSize

    private var milesText: String {
        (help.nearestMiles[kind] ?? nil).map { L.t("miles", ["miles": HoodFormat.number($0, decimals: 1)]) }
            ?? L.t("hood.nearest_none")
    }

    var body: some View {
        if let row = help.nearestListing(kind: kind, in: rows) {
            NavigationLink { DetailView(row: row) } label: { line(name: row.name, chevron: true) }
                .buttonStyle(.plain)
                // One control, read as one sentence, in the web's own words for it: "Food: Gleaners Community
                // Food Bank, 0.6 mi. Open this listing."
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L.t("hood.nearest_open", ["kind": L.t("hood.nearest." + kind),
                                                              "name": row.name, "distance": milesText]))
                .accessibilityAddTraits(.isButton)
        } else {
            line(name: nil, chevron: false)
        }
    }

    /// The label, laid out the way every other row on this page is — and stacked instead of side by side at the
    /// accessibility text sizes, so a distance is never cut short.
    @ViewBuilder private func line(name: String?, chevron: Bool) -> some View {
        let label = VStack(alignment: .leading, spacing: 3) {
            Text(L.t("hood.nearest." + kind)).font(.subheadline).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let name {
                // The place's own name, as its owner wrote it: one left-to-right run inside an Arabic screen.
                Text(L.rightToLeft ? ltr(name) : name).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        if textSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 4) {
                label
                Text(milesText).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                label.frame(maxWidth: .infinity, alignment: .leading)
                Text(milesText).font(.body.weight(.semibold)).foregroundStyle(Color.ink).fixedSize()
                if chevron {
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        }
    }
}

/// 2. "Building, and whether people can stay" — home sales and building permits in ONE panel, so neither is ever
/// shown without the other (the web's honesty rule, and the reason the two tables are drawn together).
private struct HoodMoneyPanel: View {
    let hood: Hood
    let d: Indicators
    @Binding var view: HoodViewChoice
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.money_head"))
            VStack(alignment: .leading, spacing: 14) {
                Text(L.t("hood.money_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HoodYearGroup(view: $view, chartName: "hood.chart_name_money", hood: hood, d: d,
                              series: [("sales", .a, L.t("hood.sales"), { $0.sales }),
                                       ("permits", .b, L.t("hood.permits"), { $0.permits })]) {
                    HoodYearsTable(caption: L.t("hood.sales_caption"), d: d, hood: hood,
                                   head: L.t("hood.median"), countHead: L.t("hood.sales"), missing: L.t("hood.too_few"),
                                   value: { $0.medianPrice }, count: { $0.sales },
                                   fmt: { HoodFormat.money($0) })
                    HoodYearsTable(caption: L.t("hood.permits_caption"), d: d, hood: hood,
                                   head: L.t("hood.permit_cost"), countHead: L.t("hood.permits"), missing: L.t("hood.too_few_permits"),
                                   value: { $0.permitCost }, count: { $0.permits },
                                   fmt: { HoodFormat.bigMoney($0, language: L.current) })
                }
                HoodFoot(L.t("hood.money_note"))
                HoodFoot(L.t("hood.small_numbers"))
                if view == .chart { HoodFoot(L.t("hood.chart_money_note")) }
                if d.sources.rentals != nil {
                    HoodRows([(L.t("hood.rentals"), per1000(hood.now?.rentalCerts), cityPer1000(d.cityNow?.rentalCerts))])
                    HoodFoot(L.t("hood.rentals_note"))
                }
            }.card()
        }
    }
    private func per1000(_ c: HoodCount?) -> String { hoodPer1000(c, parcels: hood.parcels) }
    private func cityPer1000(_ c: HoodCount?) -> String {
        HoodFormat.rate(c, parcels: d.cityParcels).map { L.t("hood.city_per_1000", ["rate": HoodFormat.rateText($0)]) } ?? ""
    }
}

/// 3. "Conditions" — blight tickets per 1,000 lots, demolitions, how long the City took to close a reported
/// problem, fires, empty buildings registered, and the share of main streets rated poor. Every one of them with
/// the sentence that says what it does NOT mean.
private struct HoodConditionsPanel: View {
    let hood: Hood
    let d: Indicators
    @Binding var view: HoodViewChoice
    var body: some View {
        if d.sources.blight != nil {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("hood.cond_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("hood.cond_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodYearGroup(view: $view, chartName: "hood.chart_name_blight", hood: hood, d: d,
                                  series: [("blight", .a, L.t("hood.blight"), { $0.blight })]) {
                        HoodYearsTable(caption: L.t("hood.blight_caption"), d: d, hood: hood,
                                       head: L.t("hood.blight_rate"), countHead: L.t("hood.blight"), missing: L.t("hood.too_few_permits"),
                                       value: { HoodFormat.rate($0.blight, parcels: hood.parcels) },
                                       cityValue: { HoodFormat.rate($0.blight, parcels: d.cityParcels) },
                                       count: { $0.blight },
                                       fmt: { HoodFormat.number($0, decimals: 0) })
                    }
                    HoodFoot(L.t("hood.blight_note"))
                    HoodYearGroup(view: $view, chartName: "hood.chart_name_demo", hood: hood, d: d,
                                  series: [("demo", .a, L.t("hood.demolitions"), { $0.demolitions })]) {
                        HoodYearsTable(caption: L.t("hood.demo_caption"), d: d, hood: hood,
                                       head: L.t("hood.demolitions"), countHead: nil, missing: L.t("hood.lt5_or_none"),
                                       value: { $0.demolitions?.shown.map(Double.init) }, count: nil,
                                       fmt: { HoodFormat.number($0, decimals: 0) })
                    }
                    HoodYearGroup(view: $view, chartName: "hood.chart_name_issues", hood: hood, d: d,
                                  series: [("issues", .a, L.t("hood.issues"), { $0.issues })]) {
                        HoodYearsTable(caption: L.t("hood.issues_caption"), d: d, hood: hood,
                                       head: L.t("hood.issue_days"), countHead: L.t("hood.issues"), missing: L.t("hood.too_few_permits"),
                                       value: { $0.issueDays }, count: { $0.issues },
                                       fmt: { L.t("hood.days", ["n": HoodFormat.number($0, decimals: 0)]) })
                    }
                    // The City's own names for the kinds of problem it counts: one English run inside our sentence.
                    HoodFoot(L.t("hood.issues_note", ["types": ltr((d.issueTypes ?? []).joined(separator: L.t("list.sep")))]))
                    if d.sources.fires != nil {
                        HoodYearGroup(view: $view, chartName: "hood.chart_name_fires", hood: hood, d: d,
                                      series: [("fires", .a, L.t("hood.fires"), { $0.fires })]) {
                            HoodYearsTable(caption: L.t("hood.fire_caption"), d: d, hood: hood,
                                           head: L.t("hood.blight_rate"), countHead: L.t("hood.fires"), missing: L.t("hood.too_few_permits"),
                                           value: { HoodFormat.rate($0.fires, parcels: hood.parcels) },
                                           cityValue: { HoodFormat.rate($0.fires, parcels: d.cityParcels) },
                                           count: { $0.fires },
                                           fmt: { HoodFormat.number($0, decimals: 1) })
                        }
                        HoodFoot(L.t("hood.fire_note"))
                        DisclosureGroup(L.t("hood.fire_types")) {
                            Text(ltr((d.fireTypes ?? []).joined(separator: "; "))).font(.footnote).foregroundStyle(Color.muted)
                                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .font(.footnote).tint(Color.brand)
                    }
                    if d.sources.vacant != nil {
                        HoodRows([(L.t("hood.vacant", ["from": prettyDate(d.vacantPeriod?.first ?? ""), "to": prettyDate(d.vacantPeriod?.last ?? "")]),
                                   hoodPer1000(hood.now?.vacantReg, parcels: hood.parcels),
                                   HoodFormat.rate(d.cityNow?.vacantReg, parcels: d.cityParcels).map { L.t("hood.city_per_1000", ["rate": HoodFormat.rateText($0)]) } ?? "")])
                        HoodFoot(L.t("hood.vacant_note"))
                    }
                    if d.sources.pavement != nil {
                        HoodRows([(L.t("hood.roads", ["from": String(d.roadsYears?.first ?? 0), "to": String(d.roadsYears?.last ?? 0)]),
                                   roadsValue,
                                   d.cityNow?.roads?.poorPct.map { L.t("hood.city_pct", ["pct": HoodFormat.number($0, decimals: 0)]) } ?? "")])
                        HoodFoot(L.t("hood.roads_note"))
                    }
                }.card()
            }
        }
    }
    private var roadsValue: String {
        guard let r = hood.now?.roads else { return L.t("hood.roads_none") }
        guard let pct = r.poorPct else { return L.t("hood.roads_few") }
        return L.t("hood.roads_pct", ["pct": HoodFormat.loose(pct),
                                      "miles": HoodFormat.number(r.miles ?? 0, decimals: 1)])
    }
}

/// 4. "Safe streets" — plain counts of crashes involving someone walking or biking, with the whole-city number
/// beside each. No rate, no ranking, nothing about who was at fault, and SEMCOG's notice in SEMCOG's own English.
struct HoodCrashPanel: View {
    let hood: Hood
    let d: Indicators
    var body: some View {
        if let src = d.sources.crashes, let c = hood.crashes, let years = d.crashYears, years.count >= 2 {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("hood.crash_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("hood.crash_lede", ["from": String(years[0]), "to": String(years[1])]))
                        .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodRows([(L.t("hood.crash_walk"), show(c.walk), city(d.cityCrashes?.walk)),
                              (L.t("hood.crash_bike"), show(c.bike), city(d.cityCrashes?.bike)),
                              (L.t("hood.crash_severe"), show(c.severe), city(d.cityCrashes?.severe))])
                    HoodFoot(L.t("hood.crash_note"))
                    // The dataset's name and the agency that publishes the records are theirs, written in
                    // English: each stays one left-to-right run inside the Arabic sentence, so its own commas
                    // and brackets do not end up at the end of the line (the web's `slot`, MapScreen's `ltr`).
                    HoodFoot(L.t("hood.crash_source", ["source": ltr(src.name), "records": ltr(d.crashRecordsFrom ?? "")]))
                    // SEMCOG's sentence, in SEMCOG's words, on every screen in every language: marked English so
                    // a screen reader says it in an English voice (WCAG 3.1.2), and never machine-translated.
                    Text(semcogNotice).font(.footnote).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .environment(\.locale, Locale(identifier: "en_US"))
                        .environment(\.layoutDirection, .leftToRight)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.card()
            }
        }
    }
    private func show(_ c: HoodCount) -> String {
        HoodFormat.count(c, none: L.t("hood.none_recorded"), fewerThanFive: L.t("hood.lt5"), grouped: true)
    }
    private func city(_ c: HoodCount?) -> String {
        c?.shown.map { L.t("hood.crash_city", ["count": HoodFormat.grouped(Double($0))]) } ?? ""
    }
}

/// 5. Where every number came from, and when it was last edited at the source. Our own list is named last.
private struct HoodSourcesPanel: View {
    let d: Indicators
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.sources_head"))
            VStack(alignment: .leading, spacing: 10) {
                ForEach(d.sources.inPageOrder, id: \.url) { s in
                    if let u = URL(string: s.url) {
                        Link(destination: u) {
                            VStack(alignment: .leading, spacing: 2) {
                                // The publisher's own name for the dataset, in English: held together as one
                                // left-to-right run, as every owner-written name on this screen is.
                                Text(ltr(s.name)).font(.subheadline.weight(.semibold)).foregroundStyle(Color.brand)
                                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(L.t("hood.updated", ["date": prettyDate(s.lastEdited)]))
                                    .font(.footnote).foregroundStyle(Color.muted)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .accessibilityLabel(s.name + L.t("list.sep") + L.t("hood.updated", ["date": prettyDate(s.lastEdited)]))
                    }
                }
                Text(L.t("hood.source_ours")).font(.subheadline).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }.card()
            HoodFoot(L.t("hood.left_out"))
        }
    }
}

// MARK: - table or chart (2026-09-22)

/// Which of the two identities a line wears. Two IDENTITIES, never two ends of a scale — nothing on this screen
/// says good or bad. The colours are the web's `--chart-a` and `--chart-b`, checked against the card in both
/// themes; the SHAPE of the point and the DASH of the line carry the same difference with no colour at all.
extension HoodChart.Tone {
    var color: Color { self == .a ? Color.chartA : Color.chartB }
    var symbol: BasicChartSymbolShape { self == .a ? .circle : .diamond }
    var dash: [CGFloat] { self == .a ? [] : [7, 4] }
}

/**
 One group of year panels: the Table | Chart control, then the picture or the tables.

 **The table is never traded away for a picture.** With VoiceOver running it stays on the screen under the chart,
 because a SwiftUI view that is off the screen is off the accessibility tree too — there is no "read it but do not
 show it" here the way the web's `.vh` class has one. That is also why Table is the default.

 The control appears only where a chart could say something: three years with something in them and at least one
 number to draw (`HoodChart.chartable`). A neighborhood with two years of sales keeps its table.
 */
struct HoodYearGroup<Tables: View>: View {
    @Binding var view: HoodViewChoice
    let chartName: String
    /// The series, already built. A neighborhood page builds them from its year table's own counts; a city page
    /// builds them from the rows the Census Bureau publishes. Either way the picture adds nothing the tables do
    /// not already say.
    let series: [HoodChart.Series]
    @ViewBuilder let tables: Tables
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    /// Which lines are switched off, this screen only: a way of looking at a page, never stored, never sent.
    @State private var off: Set<String> = []

    init(view: Binding<HoodViewChoice>, chartName: String, series: [HoodChart.Series],
         @ViewBuilder tables: () -> Tables) {
        _view = view
        self.chartName = chartName
        self.series = series
        self.tables = tables()
    }

    /// The neighborhood page's form: each series named by the count it reads out of a year.
    init(view: Binding<HoodViewChoice>, chartName: String, hood: Hood, d: Indicators,
         series: [(key: String, tone: HoodChart.Tone, label: String, count: (HoodYear) -> HoodCount?)],
         @ViewBuilder tables: () -> Tables) {
        self.init(view: view, chartName: chartName,
                  series: series.map {
                      HoodChart.Series(key: $0.key, tone: $0.tone, label: $0.label,
                                       points: HoodChart.series(hood, d, count: $0.count))
                  },
                  tables: tables)
    }

    private var drawable: [HoodChart.Series] { series.filter { HoodChart.chartable($0.points) } }

    var body: some View {
        let all = drawable
        if all.isEmpty {
            tables
        } else {
            let shown = HoodChart.shown(all, off: off)
            let m = HoodChart.model(shown)
            VStack(alignment: .leading, spacing: 10) {
                Picker(L.t("hood.view_label"), selection: $view) {
                    ForEach(HoodViewChoice.allCases, id: \.self) { c in Text(L.t("hood.view_" + c.rawValue)).tag(c) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel(L.t("hood.view_label"))
                if view == .chart {
                    VStack(alignment: .leading, spacing: 12) {
                        HoodLineChart(model: m)
                        if all.count > 1 { key(all: all, shown: shown) }
                        if m.series.contains(where: { !$0.markers.isEmpty }) { hiddenKey }
                        HoodFoot(HoodChart.summary(m) { k, p in L.t(k, p) })
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(L.t(chartName, ["from": m.years.first ?? "", "to": m.years.last ?? ""]))
                    if voiceOver { tables }
                } else {
                    tables
                }
            }
        }
    }

    /// The key: one real toggle per line, with its own sample. The last one left on is disabled and says why, so
    /// the chart can never become an empty pair of axes.
    @ViewBuilder private func key(all: [HoodChart.Series], shown: [HoodChart.Series]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L.t("hood.chart_show")).font(.footnote).foregroundStyle(Color.muted)
            ForEach(all) { s in
                let on = shown.contains { $0.key == s.key }
                let only = on && shown.count == 1
                Toggle(isOn: Binding(
                    get: { on },
                    set: { wanted in if wanted { off.remove(s.key) } else if !only { off.insert(s.key) } }
                )) {
                    HStack(spacing: 8) {
                        HoodKeySample(tone: s.tone, hollow: false)
                        Text(s.label).foregroundStyle(Color.ink)
                    }
                }
                .toggleStyle(.switch)
                .tint(Color.brand)
                .disabled(only)
                .accessibilityHint(only ? L.t("hood.chart_only_one") : "")
            }
            if shown.count == 1 && all.count > 1 {
                Text(L.t("hood.chart_only_one")).font(.footnote).foregroundStyle(Color.muted)
            }
        }
        .font(.subheadline)
    }

    private var hiddenKey: some View {
        HStack(spacing: 8) {
            HoodKeySample(tone: .a, hollow: true)
            Text(L.t("hood.chart_lt5"))
        }
        .font(.footnote).foregroundStyle(Color.muted)
        .accessibilityElement(children: .combine)
    }
}

/// The little shape beside a line of the key: the series' own marker, drawn rather than described, so the key
/// looks like the picture it explains.
struct HoodKeySample: View {
    let tone: HoodChart.Tone
    let hollow: Bool
    var body: some View {
        Group {
            if hollow {
                Circle().strokeBorder(Color.muted, lineWidth: 1.5)
            } else if tone == .a {
                Circle().fill(tone.color)
            } else {
                Rectangle().fill(tone.color).rotationEffect(.degrees(45)).frame(width: 9, height: 9)
            }
        }
        .frame(width: 14, height: 14)
        .accessibilityHidden(true)
    }
}

/**
 The whole chart: one pair of axes, one line per series switched on, a point at every year, and a hollow marker at
 every year the pipeline hid.

 Swift Charts rather than a Canvas, because it hands VoiceOver a real chart — each point is an element that reads
 "2023, Homes sold: 14", and the Audio Graph rotor works — where a Canvas is one opaque picture. It is a system
 framework on iOS 16 and the app's floor is 17, so nothing is added to the app to get it.

 A year the pipeline hid is NOT at a value: it is a hollow marker at a fixed height (`HoodChart.markerFraction`,
 the same constant on all three apps), below the first tick over zero, and the line goes on through it as a dotted
 piece — so the year is visibly there, its number is visibly not, and the gap never reads as a zero.
 */
struct HoodLineChart: View {
    let model: HoodChart.Model
    @Environment(\.dynamicTypeSize) private var textSize

    /// The shared thinning rule, and then a second pass for the accessibility text sizes, where a year is three
    /// times as wide: three labels — the first, the middle and the last — are what fits.
    private var shownYears: [String] {
        let years = HoodChart.axisYears(model.years)
        guard textSize.isAccessibilitySize, years.count > 3 else { return years }
        return [years[0], years[years.count / 2], years[years.count - 1]]
    }
    private func words(_ k: String, _ p: [String: String]) -> String { L.t(k, p) }

    var body: some View {
        Chart {
            ForEach(model.series) { s in
                // The line, piece by piece, so the pieces that touch a hidden year can be drawn differently.
                ForEach(s.segments) { g in
                    ForEach([g.from, g.to], id: \.self) { i in
                        LineMark(
                            x: .value(L.t("hood.year"), s.points[i].year),
                            y: .value(s.label, Double(s.points[i].value ?? 0) == 0 && s.points[i].kind == .hidden
                                      ? HoodChart.markerValue(top: model.top) : Double(s.points[i].value ?? 0)),
                            series: .value(s.label, s.key + "-" + String(g.from))
                        )
                        .foregroundStyle(s.tone.color)
                        .lineStyle(StrokeStyle(lineWidth: g.dotted ? 1.5 : 2,
                                               lineCap: .round,
                                               dash: g.dotted ? [1, 3] : s.tone.dash))
                        .accessibilityHidden(true)
                    }
                }
                // The points: one per year that has something, each one an element of its own to VoiceOver.
                ForEach(s.points.filter { $0.kind == .value }) { p in
                    PointMark(x: .value(L.t("hood.year"), p.year), y: .value(s.label, Double(p.value ?? 0)))
                        .symbol(s.tone.symbol)
                        .symbolSize(textSize.isAccessibilitySize ? 90 : 60)
                        .foregroundStyle(s.tone.color)
                        .accessibilityLabel(HoodChart.pointText(p, label: s.label, words: words))
                        .accessibilityValue(HoodFormat.grouped(Double(p.value ?? 0)))
                }
                // A hidden year: the series' own shape, HOLLOW, at a fixed height below the first tick. There is
                // no value under it to read, and the shape says so at a glance (docs/13, honesty rule 2).
                ForEach(s.points.filter { $0.kind == .hidden }) { p in
                    PointMark(x: .value(L.t("hood.year"), p.year),
                              y: .value(s.label, HoodChart.markerValue(top: model.top)))
                        .symbol {
                            HoodKeySample(tone: s.tone, hollow: true)
                        }
                        .accessibilityLabel(HoodChart.pointText(p, label: s.label, words: words))
                        .accessibilityValue(L.t("hood.lt5"))
                }
            }
        }
        // The years are the TABLE's years, in the table's order, and they stay left to right in every language:
        // they are numbers, and numbers are read that way.
        .chartXScale(domain: model.years)
        .chartYScale(domain: 0...Double(model.top))
        .chartYAxis { AxisMarks(position: .leading, values: model.ticks.map(Double.init)) { v in
            AxisGridLine().foregroundStyle(Color.line)
            AxisValueLabel { Text(HoodFormat.grouped(v.as(Double.self) ?? 0)).foregroundStyle(Color.muted) }
        } }
        .chartXAxis { AxisMarks(values: shownYears) { v in
            AxisValueLabel(orientation: textSize.isAccessibilitySize ? .vertical : .horizontal) {
                Text(v.as(String.self) ?? "").foregroundStyle(Color.muted)
            }
        } }
        .chartPlotStyle { plot in plot.padding(.horizontal, textSize.isAccessibilitySize ? 18 : 10) }
        .environment(\.layoutDirection, .leftToRight)
        .frame(height: textSize.isAccessibilitySize ? 260 : 170)
        .accessibilityLabel(L.t("hood.chart_plot"))
    }
}

// MARK: - the pieces a panel is built from

/// A panel heading. It is a heading to VoiceOver as well as to the eye, so the rotor can jump between panels.
struct HoodHead: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.title3.bold()).foregroundStyle(Color.ink)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
            .accessibilityAddTraits(.isHeader)
    }
}

struct HoodSubHead: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The small print under a panel: what a number does not mean, and where it came from.
struct HoodFoot: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.footnote).foregroundStyle(Color.muted)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A short list of label-and-value rows, with an optional whole-city figure under the value. At the accessibility
/// text sizes the value drops onto its own line rather than being cut short or pushing the screen sideways —
/// the same rule that keeps a phone number whole (Views.swift, CallRow).
struct HoodRows: View {
    let rows: [(String, String, String)]
    @Environment(\.dynamicTypeSize) private var textSize
    init(_ rows: [(String, String, String)]) { self.rows = rows }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                Group {
                    if textSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(r.0).font(.subheadline).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                            Text(r.1).font(.body.weight(.semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                            if !r.2.isEmpty { Text(r.2).font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true) }
                        }
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(r.0).font(.subheadline).foregroundStyle(Color.muted)
                                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(r.1).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                                    .fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.trailing)
                                if !r.2.isEmpty {
                                    Text(r.2).font(.footnote).foregroundStyle(Color.muted)
                                        .fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.trailing)
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                if i < rows.count - 1 { Divider().overlay(Color.line) }
            }
        }
        .padding(.horizontal, 14)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
    }
}

/// A count as a person reads it, and its rate per 1,000 lots when there is a count to show and a base to defend.
func hoodPer1000(_ c: HoodCount?, parcels: Int?) -> String {
    guard let c else { return L.t("hood.none_recorded") }
    if c == .suppressed { return L.t("hood.lt5") }
    let n = c.shown ?? 0
    guard let r = HoodFormat.rate(c, parcels: parcels) else {
        return String(n)
    }
    return L.t("hood.per_1000", ["count": String(n),
                                 "rate": HoodFormat.rateText(r)])
}

/**
 One year-by-year table: a year, this neighborhood's number, how many there were, and the whole city beside it.

 It is a table and it says so: every cell carries its own row and column in its VoiceOver label ("2023, 14 homes
 sold"), and the year is a heading. At the accessibility text sizes it stops being a table at all and becomes one
 stacked block per year, so nothing is ever cut short (docs/ACCESSIBILITY-AUDIT-2026-09-20).

 There is no bar, no colour and no sorting: a neighborhood is compared with ITSELF over time and with the city as
 a whole, never with another neighborhood (docs/13).
 */
struct HoodYearsTable: View {
    let caption: String
    let d: Indicators
    let hood: Hood
    let head: String
    let countHead: String?
    let missing: String
    let value: (HoodYear) -> Double?
    var cityValue: ((HoodYear) -> Double?)?
    let count: ((HoodYear) -> HoodCount?)?
    let fmt: (Double) -> String
    @Environment(\.dynamicTypeSize) private var textSize

    private func row(_ year: String) -> (year: String, value: String, count: String?, city: String) {
        let mine = hood.years[year] ?? HoodYear(), theirs = d.city[year] ?? HoodYear()
        let v = value(mine), cv = (cityValue ?? value)(theirs)
        return (year: Int(year) == d.partialYear ? L.t("hood.so_far", ["year": year]) : year,
                value: v.map(fmt) ?? missing,
                count: count.map { HoodFormat.count($0(mine), none: L.t("hood.none_recorded"), fewerThanFive: L.t("hood.lt5")) },
                city: cv.map(fmt) ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(caption).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if textSize.isAccessibilitySize { stacked } else { grid }
        }
    }

    /// The table proper: one row per year, the whole city in the last column.
    private var grid: some View {
        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
            GridRow {
                Text(L.t("hood.year")).gridColumnAlignment(.leading)
                Text(head)
                if countHead != nil { Text(countHead!) }
                Text(L.t("hood.city"))
            }
            .font(.caption.weight(.bold)).foregroundStyle(Color.muted)
            .accessibilityHidden(true)          // every cell below repeats its column in its own label
            Divider().gridCellUnsizedAxes(.horizontal).overlay(Color.line)
            ForEach(d.years, id: \.self) { y in
                let r = row(y)
                GridRow {
                    Text(r.year).font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                        .accessibilityAddTraits(.isHeader)
                    cell(r.value, r.year, head)
                    if let c = r.count { cell(c, r.year, countHead ?? "") }
                    cell(r.city.isEmpty ? "—" : r.city, r.year, L.t("hood.city"))
                }
            }
        }
        .font(.footnote)
        .padding(.vertical, 4)
    }

    /// The accessibility sizes: no columns at all, one block per year, so a long number is never cut short.
    private var stacked: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(d.years, id: \.self) { y in
                let r = row(y)
                VStack(alignment: .leading, spacing: 3) {
                    Text(r.year).font(.subheadline.weight(.bold)).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                    Text(head + L.t("list.sep") + r.value).fixedSize(horizontal: false, vertical: true)
                    if let c = r.count, let h = countHead { Text(h + L.t("list.sep") + c).fixedSize(horizontal: false, vertical: true) }
                    if !r.city.isEmpty { Text(L.t("hood.city") + L.t("list.sep") + r.city).fixedSize(horizontal: false, vertical: true) }
                }
                .font(.footnote).foregroundStyle(Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
    }

    /// "2023, 14 homes sold": the number, and the row and column it sits in, so it means something read aloud on
    /// its own. The digits never shrink and never truncate.
    private func cell(_ text: String, _ year: String, _ column: String) -> some View {
        Text(text)
            .foregroundStyle(Color.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(year + L.t("list.sep") + text + " " + column)
    }
}

// MARK: - the outline

/// A small, still picture of where this neighborhood is: its own outline on the city's, drawn on this phone from
/// the signed bundle with the same Canvas and the same projection as the Map tab. No tile server, nothing fetched,
/// nothing sent. It is decoration and a shortcut, never the only way to a fact — every number is in the words
/// below it — so VoiceOver gets one button with one sentence and not a picture to puzzle over.
struct HoodOutlineMap: View {
    let hood: Hood
    let origin: [Double]
    let open: () -> Void
    @Environment(\.accessibilityReduceTransparency) private var plainBackgrounds

    var body: some View {
        let rings = hoodOutline(hood, origin: origin)
        Button(action: open) {
            GeometryReader { geo in
                Canvas { ctx, size in
                    let cam = MapCamera.fitting(rings.flatMap { $0 }, width: size.width, height: size.height, minMeters: 900)
                    var shape = Path()
                    for ring in rings {
                        var flat: [Double] = []
                        flat.reserveCapacity(ring.count * 2)
                        for p in ring { let q = MapProjection.point(p); flat.append(q.x); flat.append(q.y) }
                        MapPainter.trace(flat, cam: cam, into: &shape, close: true)
                    }
                    ctx.fill(shape, with: .color(Color.brandSoft), style: FillStyle(eoFill: true))
                    ctx.stroke(shape, with: .color(Color.brand), lineWidth: 2)
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
            .frame(height: 150)
            .background(plainBackgrounds ? Color.surface : Color.appBg, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L.t("map.label_hood", ["name": hood.name]))
        .accessibilityHint(L.t("hood.mine_map"))
    }
}
