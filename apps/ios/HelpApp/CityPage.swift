// Whole-city area pages, and the map the Areas tab lands on (docs/13 "The four cities"; DECISIONS 2026-09-22;
// navigation audit C1 and §3). The Swift half of `cityPage` and of the map half of `hoodIndex` in
// apps/web/src/hoods.ts.
//
// Hamtramck, Highland Park and Dearborn publish nothing per neighborhood, so their page is the whole city. The
// rules the page keeps live in HelpCore/CityAreas.swift, where `swift test` runs them: a panel is drawn only
// when this area's own allow-list names it, every panel prints its own source and its owner's own notice, and
// `missing` is one plain sentence rather than a zero or an empty chart. No number from another city appears
// anywhere — there is no cross-city comparison on this page at all.
import Charts
import DetroitQuery
import HelpCore
import SwiftUI

/// One entry point for an area id: a Detroit neighborhood page, or a city page, from the same components.
struct AreaPageView: View {
    let page: AreaPage
    let d: Indicators
    /// False when the page is being drawn INSIDE something that already scrolls and already carries the screen's
    /// title and Urgent help — the Areas tab's strip (HoodsScreen.swift). The panels are identical either way.
    var chrome = true
    var body: some View {
        switch page {
        case .neighborhood(let h): HoodPageView(hood: h, d: d, chrome: chrome)
        case .city(let a): CityPageView(area: a, d: d, chrome: chrome)
        }
    }
}

// MARK: - one city

struct CityPageView: View {
    let area: Area
    let d: Indicators
    var chrome = true
    @EnvironmentObject private var nav: AppNav
    @Environment(MapModel.self) private var map

    /// Table or chart, for every year panel on this page at once — the same choice, in the same file, as a
    /// neighborhood page's (MapModel → MapLayerStore): this phone only, never sent.
    private var yearView: Binding<HoodViewChoice> {
        Binding(get: { map.hoodView }, set: { map.setHoodView($0) })
    }

    private var isDetroit: Bool { d.cityRows.first { $0.id == area.id }?.hasNeighborhoods == true }

    @ViewBuilder var body: some View {
        if chrome {
            ScrollView { stack }
                .background(Color.appBg.ignoresSafeArea())
                .navigationTitle(area.name).navigationBarTitleDisplayMode(.inline)
                .urgentHelp()
        } else {
            stack
        }
    }

    private var stack: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L.t("city.kind")).font(.subheadline).foregroundStyle(Color.muted)
            Text(L.t("hood.describe")).font(.subheadline).foregroundStyle(Color.warnInk)
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.warnBg, in: RoundedRectangle(cornerRadius: 12))
                .fixedSize(horizontal: false, vertical: true)
            let toMap = {
                map.show(LatLon(lat: area.hood.center[0], lon: area.hood.center[1]), radiusMeters: 4000)
                nav.tab = .map
            }
            // Under the Areas strip the outline is already on screen above the page (HoodPageView says why).
            if chrome { HoodOutlineMap(hood: area.hood, origin: d.origin, open: toMap) } else { OpenMapRow(open: toMap) }
            if isDetroit {
                HoodFoot(L.t("city.detroit_children"))
                NavigationLink(value: HoodRoute.index) {
                    HStack(spacing: 12) {
                        Text(L.t("city.see_neighborhoods")).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                    }.card(padding: 14)
                }.buttonStyle(.plain)
            } else {
                HoodFoot(L.t("city.no_neighborhoods", ["city": area.name]))
                HoodFoot(L.t("city.regional", ["city": area.name]))
            }
            // The allow-list, in its fixed order, and nothing else. A panel with no number is a bug the tests
            // catch, never a blank box on a person's screen.
            ForEach(cityPanelsShown(area), id: \.self) { panel in
                switch panel {
                case "help": helpPanel
                case "parks": parksPanel
                case "crashes": crashesPanel
                case "roads": roadsPanel
                case "vacancy": vacancyPanel
                case "permits": permitsPanel
                default: EmptyView()
                }
            }
            // "The Census Bureau recorded no new homes permitted in Highland Park…": absent, never zero.
            ForEach(area.missing.filter(\.noneRecorded), id: \.panel) { m in
                HoodFoot(L.t("city." + m.panel + "_none", ["city": area.name,
                                                           "from": String(d.permitYears?.first ?? 0),
                                                           "to": String(d.permitYears?.last ?? 0)]))
            }
            if !notPublished.isEmpty {
                HoodFoot(L.t("city.missing", ["city": area.name, "list": notPublished.joined(separator: L.t("list.sep"))]))
            }
            sourcesPanel
            HoodFoot(L.t("hood.left_out"))
        }.padding(16)
    }

    private var notPublished: [String] {
        area.missing.filter(\.notPublished).map { L.t("city.missing." + $0.panel) }
    }

    // MARK: the panels

    @EnvironmentObject private var store: BundleStore

    private var helpPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.help_head"))
            Text(L.t(area.hood.help.total == 1 ? "city.help_count_one"
                     : area.hood.help.total == 0 ? "city.help_none" : "city.help_count",
                     ["count": HoodFormat.grouped(Double(area.hood.help.total)), "city": area.name]))
                .font(.body).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            let kinds = area.hood.help.kindsWithSomething
            if !kinds.isEmpty {
                HoodRows(kinds.map { (L.t("add.cat." + ($0.kind == "shelter" ? "shelter.emergency" : $0.kind)),
                                      HoodFormat.grouped(Double($0.count)), "") })
            }
            if !area.hood.help.noneListedYet.isEmpty {
                HoodFoot(L.t("hood.none_listed", ["kinds": area.hood.help.noneListedYet.map { L.t("hood.kind." + $0) }
                    .joined(separator: L.t("list.sep"))]))
            }
            VStack(alignment: .leading, spacing: 12) {
                Text(L.t("hood.thin")).font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
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
            HoodSubHead(L.t("city.nearest_head"))
            VStack(spacing: 8) {
                ForEach(hoodNearestKinds, id: \.self) { kind in
                    NearestHelpRow(kind: kind, help: area.hood.help, rows: store.bundle?.rows ?? [])
                }
            }
            HoodFoot(L.t("city.nearest_note"))
            HoodFoot(L.t("hood.source_ours"))
        }
    }

    private var parksPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("city.parks_head"))
            VStack(alignment: .leading, spacing: 14) {
                HoodRows([(L.t("city.parks_count"), HoodFormat.grouped(Double(area.hood.places.parks)), "")]
                         + (area.parkAcres.map { [(L.t("city.parks_acres"), HoodFormat.grouped($0), "")] } ?? []))
                HoodFoot(L.t(isDetroit ? "city.parks_note_detroit" : "city.parks_note_semcog"))
                PanelSource(area: area, d: d, panel: "parks")
            }.card()
        }
    }

    /// The same counts and the same words as a neighborhood's, with this area's own source — and SEMCOG's own
    /// notice, because it is one of the four panels SEMCOG's data is behind.
    private var crashesPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.crash_head"))
            VStack(alignment: .leading, spacing: 14) {
                let years = d.crashYears ?? []
                Text(L.t("hood.crash_lede", ["from": String(years.first ?? 0), "to": String(years.last ?? 0)]))
                    .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HoodRows([(L.t("hood.crash_walk"), show(area.hood.crashes?.walk), ""),
                          (L.t("hood.crash_bike"), show(area.hood.crashes?.bike), ""),
                          (L.t("hood.crash_severe"), show(area.hood.crashes?.severe), "")])
                HoodFoot(L.t("hood.crash_note"))
                PanelSource(area: area, d: d, panel: "crashes")
            }.card()
        }
    }
    private func show(_ c: HoodCount?) -> String {
        HoodFormat.count(c, none: L.t("hood.none_recorded"), grouped: true)
    }

    @ViewBuilder private var roadsPanel: some View {
        if let b = area.roadsBands {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("city.roads_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("city.roads_lede", ["city": area.name, "year": String(d.pavementYear ?? 0)]))
                        .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodRows([(L.t("city.roads_good"), pct(b.goodPct), ""),
                              (L.t("city.roads_fair"), pct(b.fairPct), ""),
                              (L.t("city.roads_poor"), pct(b.poorPct), "")])
                    HoodFoot(L.t("city.roads_miles", ["miles": HoodFormat.number(b.miles, decimals: 1)]))
                    HoodFoot(L.t("city.roads_note"))
                    PanelSource(area: area, d: d, panel: "roads")
                }.card()
            }
        }
    }
    private func pct(_ n: Double) -> String { L.t("city.roads_pct", ["pct": HoodFormat.loose(n)]) }

    @ViewBuilder private var vacancyPanel: some View {
        if let v = area.vacancy {
            VStack(alignment: .leading, spacing: 10) {
                HoodHead(L.t("city.vacancy_head"))
                VStack(alignment: .leading, spacing: 14) {
                    Text(L.t("city.vacancy_lede", ["city": area.name,
                                                   "vacant": HoodFormat.grouped(Double(v.vacant)),
                                                   "units": HoodFormat.grouped(Double(v.housingUnits))]))
                        .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                    HoodRows([(L.t("city.vacancy_share"), L.t("city.vacancy_pct", ["pct": HoodFormat.loose(v.pct)]), "")])
                    HoodFoot(L.t("city.vacancy_note"))
                    PanelSource(area: area, d: d, panel: "vacancy")
                }.card()
            }
        }
    }

    /// New homes permitted, by year: a plain table, and a chart when there are three years to draw. A year the
    /// city did not report in full is named, with the number of months it did report — the Census Bureau
    /// estimates the rest, and a page that prints the number has to say so.
    private var permitsPanel: some View {
        let rows = area.permitsByYear ?? []
        let series = [HoodChart.Series(key: "permits", tone: .a, label: L.t("city.permits_units"),
                                       points: rows.map { HoodChart.Point(year: String($0.year), count: .number($0.units),
                                                                          partial: $0.monthsReported < 12) })]
        return VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("city.permits_head"))
            VStack(alignment: .leading, spacing: 14) {
                Text(L.t("city.permits_lede", ["city": area.name]))
                    .font(.subheadline).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
                HoodYearGroup(view: yearView, chartName: "city.chart_name_permits", series: series) {
                    PermitsTable(rows: rows)
                }
                HoodFoot(L.t("city.permits_note"))
                ForEach(rows.filter { $0.monthsReported < 12 }) { r in
                    HoodFoot(L.t("city.permits_partial", ["year": String(r.year), "city": area.name,
                                                          "months": String(r.monthsReported)]))
                }
                PanelSource(area: area, d: d, panel: "permits")
            }.card()
        }
    }

    private var sourcesPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HoodHead(L.t("hood.sources_head"))
            VStack(alignment: .leading, spacing: 10) {
                ForEach(d.sourcesOfArea(area), id: \.url) { s in
                    if let u = URL(string: s.url) {
                        Link(destination: u) {
                            VStack(alignment: .leading, spacing: 2) {
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
        }
    }
}

/// New homes permitted each year. The count belongs to the office that gives out the permit, so the table says
/// homes and buildings and nothing else — there is no city beside it, because there is no other city on this page.
private struct PermitsTable: View {
    let rows: [PermitYear]
    @Environment(\.dynamicTypeSize) private var textSize
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L.t("city.permits_caption")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if textSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(rows) { r in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(String(r.year)).font(.subheadline.weight(.bold)).foregroundStyle(Color.ink)
                                .accessibilityAddTraits(.isHeader)
                            Text(L.t("city.permits_units") + L.t("list.sep") + HoodFormat.grouped(Double(r.units)))
                            Text(L.t("city.permits_buildings") + L.t("list.sep") + HoodFormat.grouped(Double(r.buildings)))
                        }
                        .font(.footnote).foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                    }
                }
            } else {
                Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 8) {
                    GridRow {
                        Text(L.t("hood.year")).gridColumnAlignment(.leading)
                        Text(L.t("city.permits_units"))
                        Text(L.t("city.permits_buildings"))
                    }
                    .font(.caption.weight(.bold)).foregroundStyle(Color.muted)
                    .accessibilityHidden(true)
                    Divider().gridCellUnsizedAxes(.horizontal).overlay(Color.line)
                    ForEach(rows) { r in
                        GridRow {
                            Text(String(r.year)).font(.footnote.weight(.semibold)).foregroundStyle(Color.muted)
                                .accessibilityAddTraits(.isHeader)
                            cell(HoodFormat.grouped(Double(r.units)), String(r.year), L.t("city.permits_units"))
                            cell(HoodFormat.grouped(Double(r.buildings)), String(r.year), L.t("city.permits_buildings"))
                        }
                    }
                }
                .font(.footnote)
                .padding(.vertical, 4)
            }
        }
    }
    private func cell(_ text: String, _ year: String, _ column: String) -> some View {
        Text(text).foregroundStyle(Color.ink).fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(year + L.t("list.sep") + text + " " + column)
    }
}

/// The source line for one panel: the owner, when it was last edited, whose records they are, and the notice
/// that owner requires. The notice is the owner's own sentence, so it stays in their words and their language —
/// SEMCOG's is printed on each of the four panels SEMCOG's data is behind, exactly where the web prints it.
struct PanelSource: View {
    let area: Area
    let d: Indicators
    let panel: String
    var body: some View {
        if let s = d.areaSource(area.sources[panel]) {
            VStack(alignment: .leading, spacing: 4) {
                if let u = URL(string: s.url) {
                    Link(destination: u) {
                        Text(ltr(s.name) + " · " + L.t("hood.updated", ["date": prettyDate(s.lastEdited)]))
                            .font(.footnote.weight(.semibold)).foregroundStyle(Color.brand)
                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityLabel(s.name + L.t("list.sep") + L.t("hood.updated", ["date": prettyDate(s.lastEdited)]))
                }
                if let who = s.recordsFrom, !who.isEmpty {
                    HoodFoot(L.t("city.records_from", ["who": ltr(who)]))
                }
                if let notice = s.notice, !notice.isEmpty {
                    Text(notice).font(.footnote).foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .environment(\.locale, Locale(identifier: "en_US"))
                        .environment(\.layoutDirection, .leftToRight)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

// MARK: - the map the Areas tab lands on

/**
 The Areas tab's map (Kyle, 2026-09-22; DECISIONS 2026-09-22).

 It is the landing, and it fills the tab: the four city outlines and the 205 neighbourhood outlines, nothing else
 on it — no dot, no listing, no number, and never a fill that carries a value. It opens ZOOMED TO the outline the
 phone has worked out a person is standing in (`MapCamera.forArea`, HelpCore), highlighted; an answer that lands
 after it has opened GLIDES to that outline, and simply arrives under Reduce Motion.

 **A tap on an outline here is not a card offering to open a page; it IS the page opening** (the web's `onArea`).
 The same view is what an area page wears as a strip across its top, at a smaller height, with the outline the
 page is about framed in it — one map, two heights.

 It draws itself, on this phone, from the signed bundle: no tile server is ever contacted (DECISIONS 2026-09-18).
 */
struct AreasMapView: View {
    let areas: [AreaOutline]
    let base: BaseMap?
    @Binding var selected: String
    /// A tap on an outline. On the landing it opens that area's page; in a strip it swaps the page underneath.
    let open: (String) -> Void
    /// The outline this map opens on, already decoded. Empty — an area the bundle carries no outline for, or
    /// nobody has said where they are — and it opens on the four cities instead, which is where it always did.
    var openOn: [[LatLon]] = []
    /// The id of that outline. It is what tells this view an ANSWER has arrived: when it changes, the camera
    /// travels to the new outline rather than being rebuilt around it.
    var openId: String = ""
    /// How tall. `nil` fills whatever it is given: the landing hands it the tab, the strip hands it 38 %.
    var height: CGFloat?
    /// The landing map is the tab, edge to edge; a strip is too. A map inside a page is a rounded card.
    var framed = true
    /// Where VoiceOver's cursor is among the outlines, so Back from an area page can put it back on the polygon
    /// it was opened from. Optional: only the landing needs it.
    var focus: AccessibilityFocusState<String?>.Binding?

    @Environment(\.accessibilityReduceTransparency) private var plainBackgrounds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @State private var camera = MapCamera(centerX: 0, centerY: 0, scale: MapCamera.minScale, width: 1, height: 1)
    @State private var sized = false
    @State private var lastDrag: CGSize = .zero
    @State private var lastPinch: CGFloat = 1

    /// The four corners of the service area, as the Map tab uses them.
    private let corners = [LatLon(lat: 42.255, lon: -83.29), LatLon(lat: 42.45, lon: -82.91)]

    private var shown: [AreaOutline] {
        areasDrawn(areas, view: camera.visible)
    }

    var body: some View {
        GeometryReader { geo in
            Canvas(opaque: false, rendersAsynchronously: false) { ctx, size in
                // The outlines are this map's subject (docs/MAP-STYLE.md 15.7): solid and heavier, over quiet
                // streets — unless Increase Contrast is on, which keeps every street at full strength.
                MapPainter.draw(MapScene(camera: camera, base: base, drawParks: false, areas: shown,
                                         areaSelected: selected, areasMap: true,
                                         quietFor: contrast == .increased ? nil : (scheme == .dark ? .dark : .light),
                                         plainColors: plainBackgrounds),
                                into: ctx, size: size)
            }
            .onAppear { fit(geo.size) }
            .onChange(of: geo.size) { _, s in fit(s) }
            // An answer arriving after the map opened: travel to the outline, or simply be there (WCAG 2.3.3).
            .onChange(of: openId) { _, _ in glide() }
            .contentShape(Rectangle())
            .gesture(drag)
            .simultaneousGesture(pinch)
            .simultaneousGesture(SpatialTapGesture(count: 1).onEnded { e in
                let x = camera.mapX(e.location.x), y = camera.mapY(e.location.y)
                guard let a = areaAt(shown, x: x, y: y) else { return }
                selected = a.id
                open(a.id)
            })
            // A Canvas is one opaque picture to VoiceOver, so every outline is also a real button, in the
            // reading order the shared rules give: nearest the middle of the screen first.
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L.t("map.label_areas"))
            .accessibilityHint(L.t("hood.map_note"))
            .accessibilityChildren { elements }
        }
        // Arabic mirrors the controls; a map must not mirror, or Detroit is back to front.
        .environment(\.layoutDirection, .leftToRight)
        .frame(maxWidth: .infinity, maxHeight: height == nil ? .infinity : nil)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: framed ? 14 : 0))
        .overlay {
            if framed { RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 1) }
        }
    }

    /// One real button per outline. They stay in the tree whatever the map is doing — a strip that has collapsed
    /// is a map that is merely small, never a map that has gone.
    @ViewBuilder private var elements: some View {
        let items = Array(placesInReadingOrder(shown, fromX: camera.centerX, fromY: camera.centerY,
                                               x: { $0.box.centerX }, y: { $0.box.centerY },
                                               tieBreak: { $0.id }).prefix(40))
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { a in
                let label = "\(a.name), \(a.sub). \(L.t("map.details"))"
                Button(label) { selected = a.id; open(a.id) }
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(a.id == selected ? [.isButton, .isSelected] : .isButton)
                    .modifier(AreaFocus(id: a.id, focus: focus))
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
        }
    }

    private func fit(_ size: CGSize) {
        guard size.width > 1, size.height > 1 else { return }
        if sized { camera = camera.resized(width: size.width, height: size.height).clamped(); return }
        sized = true
        camera = MapCamera.forArea(openOn, width: size.width, height: size.height)
            ?? MapCamera.fitting(corners, width: size.width, height: size.height, cover: true)
    }

    /// The camera travels to the outline an answer named. Nothing is stored and nothing is sent: a fix becomes a
    /// camera and an id, both of which die with the screen (docs/08).
    private func glide() {
        guard sized, let cam = MapCamera.forArea(openOn, width: camera.width, height: camera.height) else { return }
        if reduceMotion { camera = cam }
        else { withAnimation(.easeOut(duration: areasShrinkMilliseconds / 1000)) { camera = cam } }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                camera = camera.panned(dx: v.translation.width - lastDrag.width, dy: v.translation.height - lastDrag.height)
                lastDrag = v.translation
            }
            .onEnded { _ in lastDrag = .zero }
    }
    private var pinch: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0)
            .onChanged { v in
                let mid = CGPoint(x: v.startLocation.x + lastDrag.width, y: v.startLocation.y + lastDrag.height)
                camera = camera.zoomed(by: v.magnification / lastPinch, aroundX: mid.x, y: mid.y)
                lastPinch = v.magnification
            }
            .onEnded { _ in lastPinch = 1 }
    }
}

/// `accessibilityFocused` needs a real binding; the strip's map has nowhere to put the cursor back to and passes
/// none. One modifier, so the map itself stays free of the `if let`.
private struct AreaFocus: ViewModifier {
    let id: String
    let focus: AccessibilityFocusState<String?>.Binding?
    @ViewBuilder func body(content: Content) -> some View {
        if let focus { content.accessibilityFocused(focus, equals: id) } else { content }
    }
}

/**
 The Map | List switch (Kyle: "a list option up in the top right for mobile users").

 Two real buttons, each saying whether it is the one showing — `.isSelected` and a value a screen reader reads —
 rather than one control whose word changes meaning underneath it. It rides in the map's top corner: the top
 RIGHT of an English screen and the top LEFT of an Arabic one, because it is laid out in the interface's own
 direction (the map inside it is not), and that is the corner a right-to-left reader starts from.

 44 points tall, which is the smallest a control on a map may be.
 */
struct AreasSwitch: View {
    let showing: HoodsView
    let choose: (HoodsView) -> Void
    var body: some View {
        HStack(spacing: 2) {
            button(.map, L.t("hood.switch_map"), L.t("hood.say_map"))
            button(.list, L.t("hood.switch_list"), L.t("hood.say_list"))
        }
        .padding(2)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L.t("hood.switch_label"))
    }
    private func button(_ id: HoodsView, _ word: String, _ said: String) -> some View {
        let on = showing == id
        return Button { if !on { choose(id) } } label: {
            Text(word)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(on ? Color.brandSoftInk : Color.brand)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(minWidth: 60, minHeight: 44)
                .background(on ? Color.brandSoft : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(word)
        .accessibilityValue(on ? said : "")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

