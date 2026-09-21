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
                Button(L.t("loc.off")) { here.forget() }
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
            HoodMoneyPanel(hood: hood, d: d)
            HoodConditionsPanel(hood: hood, d: d)
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
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.help_head"))
            if !hood.help.coverageChecked {
                Text(L.t("hood.thin")).font(.subheadline).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true).card()
            }
            Text(L.t(hood.help.total == 1 ? "hood.help_count_one" : "hood.help_count",
                     ["count": String(hood.help.total), "miles": HoodFormat.number(d.nearMiles, decimals: 1, locale: L.locale)]))
                .font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            let kinds = hood.help.kindsWithSomething
            if !kinds.isEmpty {
                HoodRows(kinds.map { (L.t("add.cat." + ($0.kind == "shelter" ? "shelter.emergency" : $0.kind)),
                                      HoodFormat.number(Double($0.count), decimals: 0, locale: L.locale), "") })
            }
            if !hood.help.noneListedYet.isEmpty {
                Text(L.t("hood.none_listed", ["kinds": hood.help.noneListedYet.map { L.t("hood.kind." + $0) }.joined(separator: L.t("list.sep"))]))
                    .font(.footnote).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
            }
            HoodSubHead(L.t("hood.nearest_head"))
            HoodRows(hoodNearestKinds.map { k in
                let mi = hood.help.nearestMiles[k] ?? nil
                return (L.t("hood.nearest." + k),
                        mi.map { L.t("miles", ["miles": HoodFormat.number($0, decimals: 1, locale: L.locale)]) } ?? L.t("hood.nearest_none"),
                        "")
            })
            HoodSubHead(L.t("hood.places_head", ["miles": HoodFormat.number(d.nearMiles, decimals: 1, locale: L.locale)]))
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
    private func plain(_ n: Int) -> String { HoodFormat.number(Double(n), decimals: 0, locale: L.locale) }
    private func miles(_ m: Double?) -> String {
        m.map { L.t("miles", ["miles": HoodFormat.number($0, decimals: 1, locale: L.locale)]) } ?? L.t("hood.none_found")
    }
}

/// 2. "Building, and whether people can stay" — home sales and building permits in ONE panel, so neither is ever
/// shown without the other (the web's honesty rule, and the reason the two tables are drawn together).
private struct HoodMoneyPanel: View {
    let hood: Hood
    let d: Indicators
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.money_head"))
            VStack(alignment: .leading, spacing: 14) {
                Text(L.t("hood.money_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HoodYearsTable(caption: L.t("hood.sales_caption"), d: d, hood: hood,
                               head: L.t("hood.median"), countHead: L.t("hood.sales"), missing: L.t("hood.too_few"),
                               value: { $0.medianPrice }, count: { $0.sales },
                               fmt: { HoodFormat.money($0, locale: L.locale) })
                HoodYearsTable(caption: L.t("hood.permits_caption"), d: d, hood: hood,
                               head: L.t("hood.permit_cost"), countHead: L.t("hood.permits"), missing: L.t("hood.too_few_permits"),
                               value: { $0.permitCost }, count: { $0.permits },
                               fmt: { HoodFormat.bigMoney($0, language: L.current, locale: L.locale) })
                HoodFoot(L.t("hood.money_note"))
                if d.sources.rentals != nil {
                    HoodRows([(L.t("hood.rentals"), per1000(hood.now?.rentalCerts), cityPer1000(d.cityNow?.rentalCerts))])
                    HoodFoot(L.t("hood.rentals_note"))
                }
            }.card()
        }
    }
    private func per1000(_ c: HoodCount?) -> String { hoodPer1000(c, parcels: hood.parcels) }
    private func cityPer1000(_ c: HoodCount?) -> String {
        HoodFormat.rate(c, parcels: d.cityParcels).map { L.t("hood.city_per_1000", ["rate": HoodFormat.rateText($0, locale: L.locale)]) } ?? ""
    }
}

/// 3. "Conditions" — blight tickets per 1,000 lots, demolitions, how long the City took to close a reported
/// problem, fires, empty buildings registered, and the share of main streets rated poor. Every one of them with
/// the sentence that says what it does NOT mean.
private struct HoodConditionsPanel: View {
    let hood: Hood
    let d: Indicators
    var body: some View {
        if d.sources.blight != nil {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("hood.cond_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("hood.cond_lede")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodYearsTable(caption: L.t("hood.blight_caption"), d: d, hood: hood,
                                   head: L.t("hood.blight_rate"), countHead: L.t("hood.blight"), missing: L.t("hood.too_few_permits"),
                                   value: { HoodFormat.rate($0.blight, parcels: hood.parcels) },
                                   cityValue: { HoodFormat.rate($0.blight, parcels: d.cityParcels) },
                                   count: { $0.blight },
                                   fmt: { HoodFormat.number($0, decimals: 0, locale: L.locale) })
                    HoodFoot(L.t("hood.blight_note"))
                    HoodYearsTable(caption: L.t("hood.demo_caption"), d: d, hood: hood,
                                   head: L.t("hood.demolitions"), countHead: nil, missing: L.t("hood.lt5_or_none"),
                                   value: { $0.demolitions?.shown.map(Double.init) }, count: nil,
                                   fmt: { HoodFormat.number($0, decimals: 0, locale: L.locale) })
                    HoodYearsTable(caption: L.t("hood.issues_caption"), d: d, hood: hood,
                                   head: L.t("hood.issue_days"), countHead: L.t("hood.issues"), missing: L.t("hood.too_few_permits"),
                                   value: { $0.issueDays }, count: { $0.issues },
                                   fmt: { L.t("hood.days", ["n": HoodFormat.number($0, decimals: 0, locale: L.locale)]) })
                    // The City's own names for the kinds of problem it counts: one English run inside our sentence.
                    HoodFoot(L.t("hood.issues_note", ["types": ltr((d.issueTypes ?? []).joined(separator: L.t("list.sep")))]))
                    if d.sources.fires != nil {
                        HoodYearsTable(caption: L.t("hood.fire_caption"), d: d, hood: hood,
                                       head: L.t("hood.blight_rate"), countHead: L.t("hood.fires"), missing: L.t("hood.too_few_permits"),
                                       value: { HoodFormat.rate($0.fires, parcels: hood.parcels) },
                                       cityValue: { HoodFormat.rate($0.fires, parcels: d.cityParcels) },
                                       count: { $0.fires },
                                       fmt: { HoodFormat.number($0, decimals: 1, locale: L.locale) })
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
                                   HoodFormat.rate(d.cityNow?.vacantReg, parcels: d.cityParcels).map { L.t("hood.city_per_1000", ["rate": HoodFormat.rateText($0, locale: L.locale)]) } ?? "")])
                        HoodFoot(L.t("hood.vacant_note"))
                    }
                    if d.sources.pavement != nil {
                        HoodRows([(L.t("hood.roads", ["from": String(d.roadsYears?.first ?? 0), "to": String(d.roadsYears?.last ?? 0)]),
                                   roadsValue,
                                   d.cityNow?.roads?.poorPct.map { L.t("hood.city_pct", ["pct": HoodFormat.number($0, decimals: 0, locale: L.locale)]) } ?? "")])
                        HoodFoot(L.t("hood.roads_note"))
                    }
                }.card()
            }
        }
    }
    private var roadsValue: String {
        guard let r = hood.now?.roads else { return L.t("hood.roads_none") }
        guard let pct = r.poorPct else { return L.t("hood.roads_few") }
        return L.t("hood.roads_pct", ["pct": HoodFormat.number(pct, decimals: 0, locale: L.locale),
                                      "miles": HoodFormat.number(r.miles ?? 0, decimals: 1, locale: L.locale)])
    }
}

/// 4. "Safe streets" — plain counts of crashes involving someone walking or biking, with the whole-city number
/// beside each. No rate, no ranking, nothing about who was at fault, and SEMCOG's notice in SEMCOG's own English.
private struct HoodCrashPanel: View {
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
        HoodFormat.count(c, locale: L.locale, none: L.t("hood.none_recorded"), fewerThanFive: L.t("hood.lt5"))
    }
    private func city(_ c: HoodCount?) -> String {
        c?.shown.map { L.t("hood.crash_city", ["count": HoodFormat.number(Double($0), decimals: 0, locale: L.locale)]) } ?? ""
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
    if c == .suppressed { return L.t("hood.lt5") }
    let n = c.shown ?? 0
    guard let r = HoodFormat.rate(c, parcels: parcels) else {
        return HoodFormat.number(Double(n), decimals: 0, locale: L.locale)
    }
    return L.t("hood.per_1000", ["count": HoodFormat.number(Double(n), decimals: 0, locale: L.locale),
                                 "rate": HoodFormat.rateText(r, locale: L.locale)])
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
                count: count.map { HoodFormat.count($0(mine), locale: L.locale, none: L.t("hood.none_recorded"), fewerThanFive: L.t("hood.lt5")) },
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
