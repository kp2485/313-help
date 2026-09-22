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

/// Where a tap on the index, or on "Your neighborhood", goes next.
enum HoodRoute: Hashable { case hood(String) }

/// A to Z, or grouped by council district. Neither is a ranking: the City numbers its districts, and that is all
/// the second one is (docs/13, honesty rule 1).
enum HoodGrouping: String, CaseIterable, Identifiable {
    case abc, district
    var id: String { rawValue }
    var label: String { L.t(self == .abc ? "hood.group_abc" : "hood.group_district") }
}

// MARK: - the tab

struct HoodsTabView: View {
    @EnvironmentObject private var store: BundleStore
    @State private var model = HoodsModel()
    @State private var path: [HoodRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            HoodsIndexView(model: model)
                .navigationDestination(for: HoodRoute.self) { route in
                    switch route {
                    case .hood(let id):
                        if let d = model.indicators, let h = d.hood(id: id) { HoodPageView(hood: h, d: d) }
                    }
                }
        }
        .task(id: store.bundle?.index.version) { await model.load(from: store) }
    }
}

// MARK: - the index

struct HoodsIndexView: View {
    let model: HoodsModel
    /// Memory only, like every other search box in this app: never stored, never sent, never logged.
    @State private var find = ""
    @State private var grouping: HoodGrouping = .abc

    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 10) {
            if let d = model.indicators {
                Text(L.t("hood.index_intro")).font(.body).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                MyHoodCard(d: d)
                Text(L.t("hood.only_detroit")).font(.footnote).foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Picker(L.t("hood.group_label"), selection: $grouping) {
                    ForEach(HoodGrouping.allCases) { g in Text(g.label).tag(g) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel(L.t("hood.group_label"))
                let shown = hoodsMatching(hoodsAlphabetical(d.neighborhoods), query: find)
                Text(shown.isEmpty ? L.t("hood.find_none")
                     : L.t(shown.count == 1 ? "hood.find_one" : "hood.find_count", ["count": String(shown.count)]))
                    .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                LazyVStack(alignment: .leading, spacing: 8, pinnedViews: []) {
                    ForEach(groups(of: shown), id: \.0) { title, hoods in
                        SectionHead(text: title)
                        ForEach(hoods) { h in HoodRowLink(hood: h) }
                    }
                }
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
        // The full word on the screen and in VoiceOver; the tab bar's own label is the short one (`tab.hoods`).
        .navigationTitle(L.t("tab.hoods_wide"))
        .urgentHelp()
    }

    /// The headings over the list: one per letter, or one per council district. Both are the A–Z list cut up; the
    /// order inside a heading is always the A–Z one (HelpCore).
    private func groups(of list: [Hood]) -> [(String, [Hood])] {
        switch grouping {
        case .district:
            return hoodsByDistrict(list).map { g in
                (g.district.map { L.t("hood.district", ["n": String($0)]) } ?? L.t("hood.no_district"), g.hoods)
            }
        case .abc:
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
            HoodCrashPanel(hood: hood, d: d, view: yearView)
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
            // Which counting rule each count uses, on its row (docs/13, "Counting rules"): a bus stop or a
            // Bridge-card store counts only inside the outline; a park or rec center inside or within half a mile.
            let near = L.t("hood.rule_near", ["miles": HoodFormat.loose(d.nearMiles)]), inside = L.t("hood.rule_inside")
            HoodSubHead(L.t("hood.places_head"))
            HoodRows([(L.t("hood.parks") + " (" + near + ")", plain(hood.places.parks), ""),
                      (L.t("hood.rec_centers") + " (" + near + ")", plain(hood.places.recCenters), ""),
                      (L.t("hood.greenway_open") + " (" + near + ")", plain(hood.places.greenwayOpen), "")]
                     + (hood.places.snapStores.map { [(L.t("hood.snap_stores") + " (" + inside + ")", plain($0), "")] } ?? [])
                     + (hood.places.busStops.map { [(L.t("hood.bus_stops") + " (" + inside + ")", plain($0), "")] } ?? []))
            HoodFoot(L.t("hood.places_note", ["miles": HoodFormat.loose(d.nearMiles)]))
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
private struct NearestHelpRow: View {
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
                HoodYearGroup(view: $view, chartName: "hood.chart_name_money",
                              series: [HoodChart.Series(key: "sales", tone: .a, label: L.t("hood.sales"), points: HoodChart.series(hood, d) { $0.sales }),
                                       HoodChart.Series(key: "permits", tone: .b, label: L.t("hood.permits"), points: HoodChart.series(hood, d) { $0.permits })]) {
                    HoodYearsTable(caption: L.t("hood.sales_caption"), d: d, hood: hood,
                                   head: L.t("hood.median"), countHead: L.t("hood.sales"), missing: L.t("hood.too_few"),
                                   value: { $0.medianPrice }, count: { $0.sales },
                                   fmt: { HoodFormat.money($0) })
                    HoodYearsTable(caption: L.t("hood.permits_caption"), d: d, hood: hood,
                                   head: L.t("hood.permit_cost"), countHead: L.t("hood.permits"), missing: L.t("hood.none_recorded"),
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

/// 3. "Conditions" — what the City recorded here, grouped into charts that share a unit and a meaning, the same
/// four groups as the web's `conditionsPanel`:
///
///   Blight tickets and buildings torn down   two COUNTS on one axis, each switchable
///   Problems reported                        a COUNT
///   Time to close                            DAYS — its own small chart, never a second axis on the count chart
///   Building fires                           a COUNT, on its own
///
/// each with a one-sentence lede saying what the number is and where it comes from, ONE Table | Chart control
/// for the whole panel, and an "at a glance" row of the latest year's figures above the charts. Empty buildings
/// registered and street condition are today's numbers, not years: tiles in that row and rows below, never a
/// chart. Every count is the real number (2026-09-22); a series the City has not published for this neighborhood
/// says so in one sentence.
private struct HoodConditionsPanel: View {
    let hood: Hood
    let d: Indicators
    @Binding var view: HoodViewChoice

    private var blight: HoodChart.Series { HoodChart.Series(key: "blight", tone: .a, label: L.t("hood.blight_tickets"), points: HoodChart.series(hood, d) { $0.blight }) }
    private var demo: HoodChart.Series { HoodChart.Series(key: "demo", tone: .b, label: L.t("hood.demolitions"), points: HoodChart.series(hood, d) { $0.demolitions }) }
    private var issues: HoodChart.Series { HoodChart.Series(key: "issues", tone: .a, label: L.t("hood.issues_reported"), points: HoodChart.series(hood, d) { $0.issues }) }
    private var days: HoodChart.Series { HoodChart.Series(key: "days", tone: .a, label: L.t("hood.issue_days"), points: HoodChart.daysSeries(hood, d), unit: .days) }
    private var fires: HoodChart.Series { HoodChart.Series(key: "fires", tone: .a, label: L.t("hood.fires_short"), points: HoodChart.series(hood, d) { $0.fires }) }
    private var anyChart: Bool {
        ([blight, demo, issues, days] + (d.sources.fires != nil ? [fires] : [])).contains { HoodChart.chartable($0.points) }
    }

    var body: some View {
        if d.sources.blight != nil {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("hood.cond_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("hood.cond_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodGlance(hood: hood, d: d)
                    if anyChart { HoodViewPicker(view: $view) }
                    HoodSubHead(L.t("hood.cond_blight_head"))
                    HoodCondGroup(view: $view, chartName: "hood.chart_name_cond", lede: "hood.cond_blight_lede", hood: hood, series: [blight, demo]) {
                        HoodYearsTable(caption: L.t("hood.blight_caption"), d: d, hood: hood,
                                       head: L.t("hood.blight_rate"), countHead: L.t("hood.blight"), missing: L.t("hood.none_recorded"),
                                       value: { HoodFormat.rate($0.blight, parcels: hood.parcels) },
                                       cityValue: { HoodFormat.rate($0.blight, parcels: d.cityParcels) },
                                       count: { $0.blight },
                                       fmt: { HoodFormat.number($0, decimals: 0) })
                        HoodYearsTable(caption: L.t("hood.demo_caption"), d: d, hood: hood,
                                       head: L.t("hood.demolitions"), countHead: nil, missing: L.t("hood.none_recorded"),
                                       value: { $0.demolitions?.shown.map(Double.init) }, count: nil,
                                       fmt: { HoodFormat.number($0, decimals: 0) })
                        HoodFoot(L.t("hood.blight_note"))
                    }
                    HoodSubHead(L.t("hood.cond_issues_head"))
                    HoodCondGroup(view: $view, chartName: "hood.chart_name_issues", lede: "hood.cond_issues_lede", hood: hood, series: [issues]) {
                        HoodYearsTable(caption: L.t("hood.issues_caption"), d: d, hood: hood,
                                       head: L.t("hood.issue_days"), countHead: L.t("hood.issues"), missing: L.t("hood.none_recorded"),
                                       value: { $0.issueDays }, count: { $0.issues },
                                       fmt: { L.t("hood.days", ["n": HoodFormat.number($0, decimals: 0)]) })
                    }
                    HoodSubHead(L.t("hood.cond_days_head"))
                    // The days table IS the problems table above (both columns are in it): in table view nothing
                    // is repeated, and in chart view one line says where the numbers are.
                    HoodCondGroup(view: $view, chartName: "hood.chart_name_days", lede: "hood.cond_days_lede", hood: hood, series: [days]) {
                        if view == .chart { HoodFoot(L.t("hood.cond_days_table")) }
                        // The City's own names for the kinds of problem it counts: one English run inside our sentence.
                        HoodFoot(L.t("hood.issues_note", ["types": ltr((d.issueTypes ?? []).joined(separator: L.t("list.sep")))]))
                    }
                    if d.sources.fires != nil {
                        HoodSubHead(L.t("hood.cond_fires_head"))
                        HoodCondGroup(view: $view, chartName: "hood.chart_name_fires", lede: "hood.cond_fires_lede", hood: hood, series: [fires]) {
                            HoodYearsTable(caption: L.t("hood.fire_caption"), d: d, hood: hood,
                                           head: L.t("hood.blight_rate"), countHead: L.t("hood.fires"), missing: L.t("hood.none_recorded"),
                                           value: { HoodFormat.rate($0.fires, parcels: hood.parcels) },
                                           cityValue: { HoodFormat.rate($0.fires, parcels: d.cityParcels) },
                                           count: { $0.fires },
                                           fmt: { HoodFormat.number($0, decimals: 1) })
                            HoodFoot(L.t("hood.fire_note"))
                            DisclosureGroup(L.t("hood.fire_types")) {
                                Text(ltr((d.fireTypes ?? []).joined(separator: "; "))).font(.footnote).foregroundStyle(Color.muted)
                                    .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .font(.footnote).tint(Color.brand)
                        }
                    }
                    HoodFoot(L.t("hood.small_numbers"))
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
private struct HoodCrashPanel: View {
    let hood: Hood
    let d: Indicators
    @Binding var view: HoodViewChoice
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
                    // The same crashes year by year — a table, or the same three-line chart every other year
                    // panel gets — when the bundle carries the years (2026-09-22).
                    let byYear = HoodChart.crashSeries(hood.crashesByYear, labels: (walk: L.t("hood.crash_walk_short"), bike: L.t("hood.crash_bike_short"), severe: L.t("hood.crash_severe_short")))
                    if !byYear.isEmpty {
                        Text(L.t("hood.crash_years_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                        HoodYearGroup(view: $view, chartName: "hood.chart_name_crashes", series: byYear) {
                            HoodCrashTable(hood: hood, d: d, byYear: hood.crashesByYear ?? [:], years: years)
                        }
                    }
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
        HoodFormat.count(c, none: L.t("hood.none_recorded"), grouped: true)
    }
    private func city(_ c: HoodCount?) -> String {
        c?.shown.map { L.t("hood.crash_city", ["count": HoodFormat.grouped(Double($0))]) } ?? ""
    }
}

/// The crashes by year: walking, biking, killed or badly hurt, one row per year and the window total last. At
/// the accessibility text sizes it is one stacked block per year, like every other table on this screen.
private struct HoodCrashTable: View {
    let hood: Hood
    let d: Indicators
    let byYear: [String: HoodCrashes]
    let years: [Int]
    @Environment(\.dynamicTypeSize) private var textSize
    private var heads: [String] { [L.t("hood.crash_walk_short"), L.t("hood.crash_bike_short"), L.t("hood.crash_severe_short")] }
    private func cells(_ c: HoodCrashes?) -> [String] {
        [c?.walk, c?.bike, c?.severe].map { HoodFormat.count($0, none: L.t("hood.none_recorded"), grouped: true) }
    }
    private var rows: [(String, [String])] {
        byYear.keys.sorted().map { ($0, cells(byYear[$0])) }
            + (hood.crashes.map { [(L.t("hood.crash_total", ["from": String(years[0]), "to": String(years[1])]), cells($0))] } ?? [])
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L.t("hood.crash_caption")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if textSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(rows, id: \.0) { r in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(r.0).font(.subheadline.weight(.bold)).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                            ForEach(Array(zip(heads, r.1)), id: \.0) { h, v in Text(h + L.t("list.sep") + v).fixedSize(horizontal: false, vertical: true) }
                        }
                        .font(.footnote).foregroundStyle(Color.muted).frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                    }
                }
            } else {
                Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
                    GridRow {
                        Text(L.t("hood.year")).gridColumnAlignment(.leading)
                        ForEach(heads, id: \.self) { Text($0) }
                    }
                    .font(.caption.weight(.bold)).foregroundStyle(Color.muted).accessibilityHidden(true)
                    Divider().gridCellUnsizedAxes(.horizontal).overlay(Color.line)
                    ForEach(rows, id: \.0) { r in
                        GridRow {
                            Text(r.0).font(.footnote.weight(.semibold)).foregroundStyle(Color.muted).accessibilityAddTraits(.isHeader)
                            ForEach(Array(zip(heads, r.1)), id: \.0) { h, v in
                                Text(v).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                                    .accessibilityLabel(r.0 + L.t("list.sep") + v + " " + h)
                            }
                        }
                    }
                }
                .font(.footnote).padding(.vertical, 4)
            }
        }
    }
}

/// "At a glance": the latest year's figure for each Conditions series, and today's two numbers, as a row of
/// stat tiles above the charts. Label over value, the value in the text ink (never a series colour), and no tile
/// coloured by size: nothing here is a score. VoiceOver reads each tile as one element: label, when, value.
private struct HoodGlance: View {
    let hood: Hood
    let d: Indicators
    @Environment(\.dynamicTypeSize) private var textSize

    private var tiles: [(label: String, when: String, value: String)] {
        var out: [(String, String, String)] = []
        let none = L.t("hood.none_recorded")
        let fields: [(HoodYear) -> Bool] = [{ $0.blight != nil }, { $0.demolitions != nil }, { $0.issues != nil }, { $0.fires != nil }]
        if let y = HoodFormat.latestYear(hood, d, fields: fields) {
            let ys = hood.years[y] ?? HoodYear()
            let when = Int(y) == d.partialYear ? L.t("hood.so_far", ["year": y]) : y
            out.append((L.t("hood.blight_tickets"), when, HoodFormat.count(ys.blight, none: none)))
            out.append((L.t("hood.demolitions"), when, HoodFormat.count(ys.demolitions, none: none)))
            out.append((L.t("hood.issues_reported"), when, HoodFormat.count(ys.issues, none: none)))
            out.append((L.t("hood.issue_days"), when, ys.issueDays.map { L.t("hood.days", ["n": HoodFormat.number($0, decimals: 0)]) } ?? none))
            if d.sources.fires != nil { out.append((L.t("hood.fires_short"), when, HoodFormat.count(ys.fires, none: none))) }
        }
        if d.sources.vacant != nil { out.append((L.t("hood.vacant_short"), L.t("hood.glance_today"), HoodFormat.count(hood.now?.vacantReg, none: none))) }
        if d.sources.pavement != nil {
            let v: String
            if let r = hood.now?.roads {
                v = r.poorPct.map { L.t("hood.roads_pct", ["pct": HoodFormat.loose($0), "miles": HoodFormat.number(r.miles ?? 0, decimals: 1)]) } ?? L.t("hood.roads_few")
            } else { v = L.t("hood.roads_none") }
            out.append((L.t("hood.roads_poor_short"), L.t("hood.glance_today"), v))
        }
        return out.map { (label: $0.0, when: $0.1, value: $0.2) }
    }

    var body: some View {
        let all = tiles
        if !all.isEmpty {
            HoodSubHead(L.t("hood.glance"))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: textSize.isAccessibilitySize ? 220 : 136), spacing: 8, alignment: .top)], alignment: .leading, spacing: 8) {
                ForEach(Array(all.enumerated()), id: \.offset) { _, t in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.label).font(.caption).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                        Text(t.when).font(.caption2).foregroundStyle(Color.muted)
                        Text(t.value).font(.title3.weight(.semibold)).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.appBg, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line, lineWidth: 1))
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// One chart's worth of the Conditions panel: a lede saying what the number means and where it comes from, then
/// the table or the chart. When the City has published nothing at all for this neighborhood in this series, one
/// sentence says so instead of a table of "none recorded".
private struct HoodCondGroup<Tables: View>: View {
    @Binding var view: HoodViewChoice
    let chartName: String
    let lede: String
    let hood: Hood
    let series: [HoodChart.Series]
    @ViewBuilder let tables: Tables
    var body: some View {
        Text(L.t(lede)).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
        if series.contains(where: { HoodChart.anyValue($0.points) }) {
            HoodYearGroup(view: $view, chartName: chartName, series: series, showPicker: false) { tables }
        } else {
            Text(L.t("hood.cond_none", ["name": hood.name])).font(.subheadline).foregroundStyle(Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.appBg, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

/// Table | Chart: one segmented control, the same one over every year panel.
private struct HoodViewPicker: View {
    @Binding var view: HoodViewChoice
    var body: some View {
        Picker(L.t("hood.view_label"), selection: $view) {
            ForEach(HoodViewChoice.allCases, id: \.self) { c in Text(L.t("hood.view_" + c.rawValue)).tag(c) }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel(L.t("hood.view_label"))
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

/// Which identity a line wears. IDENTITIES, never ends of a scale — nothing on this screen says good or bad. The
/// colours are the web's `--chart-a`, `--chart-b` and `--chart-c`, checked against the card in both themes; the
/// SHAPE of the point (circle, diamond, square) and the DASH of the line (solid, dashed, dash-dot) carry the same
/// difference with no colour at all.
extension HoodChart.Tone {
    var color: Color { switch self { case .a: Color.chartA; case .b: Color.chartB; case .c: Color.chartC } }
    var symbol: BasicChartSymbolShape { switch self { case .a: .circle; case .b: .diamond; case .c: .square } }
    var dash: [CGFloat] { switch self { case .a: []; case .b: [7, 4]; case .c: [7, 3, 1.5, 3] } }
}

/**
 One group of year panels: the Table | Chart control, then the picture or the tables.

 **The table is never traded away for a picture.** With VoiceOver running it stays on the screen under the chart,
 because a SwiftUI view that is off the screen is off the accessibility tree too — there is no "read it but do not
 show it" here the way the web's `.vh` class has one. That is also why Table is the default.

 The control appears only where a chart could say something: three years with something in them and at least one
 number to draw (`HoodChart.chartable`). A neighborhood with two years of sales keeps its table.
 */
private struct HoodYearGroup<Tables: View>: View {
    @Binding var view: HoodViewChoice
    let chartName: String
    /// The series, already read out of the years (`HoodChart.series`, `daysSeries`, `crashSeries`).
    let series: [HoodChart.Series]
    /// A panel with several charts draws ONE control above them all (`HoodViewPicker`) and passes `false` here.
    var showPicker: Bool = true
    @ViewBuilder let tables: Tables
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    /// Which lines are switched off, this screen only: a way of looking at a page, never stored, never sent.
    @State private var off: Set<String> = []

    private var drawable: [HoodChart.Series] { series.filter { HoodChart.chartable($0.points) } }

    var body: some View {
        let all = drawable
        if all.isEmpty {
            tables
        } else {
            let shown = HoodChart.shown(all, off: off)
            let m = HoodChart.model(shown)
            VStack(alignment: .leading, spacing: 10) {
                if showPicker { HoodViewPicker(view: $view) }
                if view == .chart {
                    VStack(alignment: .leading, spacing: 12) {
                        HoodLineChart(model: m)
                        if all.count > 1 { key(all: all, shown: shown) }
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
                        HoodKeySample(tone: s.tone)
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
}

/// The little shape beside a line of the key: the series' own marker, drawn rather than described, so the key
/// looks like the picture it explains.
private struct HoodKeySample: View {
    let tone: HoodChart.Tone
    var body: some View {
        Group {
            switch tone {
            case .a: Circle().fill(tone.color)
            case .b: Rectangle().fill(tone.color).rotationEffect(.degrees(45)).frame(width: 9, height: 9)
            case .c: Rectangle().fill(tone.color).frame(width: 10, height: 10)
            }
        }
        .frame(width: 14, height: 14)
        .accessibilityHidden(true)
    }
}

/**
 The whole chart: one pair of axes, one line per series switched on, and a point at every year with a value.

 Swift Charts rather than a Canvas, because it hands VoiceOver a real chart — each point is an element that reads
 "2023, Homes sold: 14", and the Audio Graph rotor works — where a Canvas is one opaque picture. It is a system
 framework on iOS 16 and the app's floor is 17, so nothing is added to the app to get it.

 A year with nothing recorded is a break in the line, never a zero.
 */
private struct HoodLineChart: View {
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
                // The line, piece by piece, so a year with nothing recorded breaks it.
                ForEach(s.segments) { g in
                    ForEach([g.from, g.to], id: \.self) { i in
                        LineMark(
                            x: .value(L.t("hood.year"), s.points[i].year),
                            y: .value(s.label, Double(s.points[i].value ?? 0)),
                            series: .value(s.label, s.key + "-" + String(g.from))
                        )
                        .foregroundStyle(s.tone.color)
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, dash: s.tone.dash))
                        .accessibilityHidden(true)
                    }
                }
                // The points: one per year that has a value, each one an element of its own to VoiceOver, saying
                // its exact figure in the chart's unit ("2022, Middle time to close: 40 days").
                ForEach(s.points.filter { $0.kind == .value }) { p in
                    PointMark(x: .value(L.t("hood.year"), p.year), y: .value(s.label, Double(p.value ?? 0)))
                        .symbol(s.tone.symbol)
                        .symbolSize(textSize.isAccessibilitySize ? 90 : 60)
                        .foregroundStyle(s.tone.color)
                        .accessibilityLabel(HoodChart.pointText(p, label: s.label, unit: model.unit, words: words))
                        .accessibilityValue(HoodChart.valueText(p.value ?? 0, unit: model.unit, words: words))
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
        .accessibilityLabel(L.t(model.unit == .days ? "hood.chart_plot_days" : "hood.chart_plot"))
    }
}

// MARK: - the pieces a panel is built from

/// A panel heading. It is a heading to VoiceOver as well as to the eye, so the rotor can jump between panels.
private struct HoodHead: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.title3.bold()).foregroundStyle(Color.ink)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct HoodSubHead: View {
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
private struct HoodFoot: View {
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
private struct HoodRows: View {
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
private func hoodPer1000(_ c: HoodCount?, parcels: Int?) -> String {
    guard let c else { return L.t("hood.none_recorded") }
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
private struct HoodYearsTable: View {
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
                count: count.map { HoodFormat.count($0(mine), none: L.t("hood.none_recorded")) },
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
