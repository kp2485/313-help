# Map styles for the transport layers

**Status:** spec, 2026-09-21, **settled after two implementations**. Data is built
(`pipeline/src/ingest-transit.ts`, `pipeline/src/transit-network.ts`); the web (`apps/web/src/subway.ts`) and the
iPhone (`apps/ios/Sources/HelpCore/MapStyle.swift`, `HelpApp/MapSubway.swift`) draw both styles; Android is next.
Where the two implementers found the first draft wrong, unclear or silent, this text was changed and both clients
were changed to match it — those places are marked **(settled)**. Written so a TypeScript canvas, a SwiftUI
`Canvas` and an Android `Canvas` produce the same picture from the same bundle.

Kyle, 2026-09-21: *"I want to make the map look more sexy. I want each transportation layer to look like a
subway map, on all 3 versions"* — and, the same day, after seeing the accessibility pass land: he likes the
map as it is, and wants the subway look **as an option, not a replacement**.

So there are **two named styles** for the 11 transport layers:

| style | what it is | default |
|---|---|---|
| `standard` | Exactly today's drawing (section 2). One colour per layer, a casing, dots for stops. | **yes, on all three clients** |
| `subway` | The metro-diagram look (sections 3–9). One line per *route*, badges, stations, interchanges. | no — a person picks it |

Units: **u** = 1 CSS px = 1 pt = 1 dp. **mpp** = metres per u at the map's current scale (`M_PER_UNIT / s` in
`apps/web/src/map.ts`). Every constant below is in u unless it says metres.

---

## 1. The control: "Map style"

- **Where:** inside the layers panel (web: the `<form class="layers">` under the map and in the full-screen
  sheet; iPhone: the layers sheet; Android: the layers bottom sheet), **above** the "Ways to get around" group,
  because it changes how that group is drawn and nothing else.
- **What:** one labelled group with two radio options, each with a one-line description. Web: a `<fieldset>`
  with a `<legend>` and two real `<input type="radio" name="mapstyle">`; iPhone: a `Picker` in `.inline` style
  (or two rows with `.accessibilityAddTraits(.isSelected)`), label + description as one accessibility element;
  Android: two `RadioButton` rows in a `selectableGroup()`, each row `Role.RadioButton`, 48 dp tall.
  Arrow keys move between the two on web; VoiceOver/TalkBack read "Subway lines, bus and rail drawn like a
  subway map, radio button, 2 of 2, not selected".
- **Remembered on the device only**, in the same store as the layer choices and under the same rules: web
  IndexedDB (`apps/web/src/layers.ts`, new key `style`), iPhone the excluded-from-backup state file, Android
  the app-private state file. Value `"standard"` or `"subway"`; anything else reads as `"standard"`. Never an
  account, never sent, not in any report or proposal body (the Worker's closed schemas would refuse it anyway).
- **Applies instantly.** Switching never reloads a layer that is already held. `standard → subway` asks for
  the `.net.json` file of each network layer that is on (section 10) and keeps drawing `standard` for that layer
  until its file arrives; if it cannot be read the layer stays `standard` and the existing "could not load /
  Try again" banner says so. `subway → standard` redraws at once from files already held. The exact loading and
  failure behaviour, as built, is in section 10.
- **Announced** through the existing live region: `map.style_say`.
- **The switch is hidden** when the bundle has no layer with a `net` entry (an old bundle): nothing to choose.

String keys (English here). All of them are in all four languages — `strings/en.json`, `es`, `ar`, `bn` — with
the same placeholders; a test on each client holds the key list. `map.stop_lines`, `map.change_here` and
`map.many_routes` must end in `: {list}` in every language, because a card prints the sentence without its list
above a row of route buttons.

| key | English |
|---|---|
| `map.style` | Map style |
| `map.style_standard` | Standard |
| `map.style_standard_note` | Each kind of transport in one colour |
| `map.style_subway` | Subway lines |
| `map.style_subway_note` | Bus and rail drawn like a subway map |
| `map.style_say` | Map style: {name} |
| `map.key` | What the lines mean |
| `map.key_frequent` | Thick line: a bus at least every 15 minutes on weekdays |
| `map.key_local` | Thin line: other bus routes |
| `map.key_smart` | Line with a light stripe down the middle: SMART |
| `map.key_trunk` | Wide dark line: many routes share this street |
| `map.key_station` | White circle: a stop |
| `map.key_change` | White pill: you can change here |
| `map.key_end` | Ring with a name: where a route ends |
| `map.key_qline` | Dark line with light ties: the QLINE. Drawn through its stations, not along the exact track |
| `map.key_dpm` | Purple loop with arrows: the People Mover, and the way it runs |
| `map.key_bike` | Thin double green line: bike lane |
| `map.route_card` | {name} · {agency} |
| `map.route_every` | About every {minutes} minutes on weekdays, the agency says |
| `map.route_frequent` | Frequent route |
| `map.route_stops` | {count} stops |
| `map.route_plan` | Plan a trip with {agency} |
| `map.stop_lines` | Routes that stop here: {list} |
| `map.change_here` | Change here: {list} |
| `map.hub_walk` | A short walk between: {list} |
| `map.many_routes` | {count} routes share this street: {list} |
| `map.list_more` | and {count} more *(already existed; also says what the keyboard / VoiceOver order left out)* |
| `map.done` | Done *(closes the layers sheet and the list sheet on a phone)* |
| `map.zoom` | Zoom *(the name of the zoom control for a screen reader)* |
| `map.layer_loading` | Loading *(said with a layer's name while its file is on the way)* |

---

## 2. `standard` — today's drawing, written down

Source of truth: `apps/web/src/map.ts` (the overlay passes in `draw()`) and `LAYER_STYLE` in
`apps/web/src/layerstyle.ts`, as of 2026-09-21. iPhone and Android copy this table; the web does not change.
The iPhone was brought to exact parity on 2026-09-21 (it had been drawing the pre-audit streets): the same tokens
in all four values, the same widths and zoom thresholds, the hatch, the casings. `StandardPaletteTests` reads
`style.css` and fails if a token differs.

**Reads only** `map/transit/<id>.json` (`names`, `lines`, `points`). It never reads a `.net.json` file, `net`,
or `hubs`, and draws the same whether or not they exist. Those layer files are byte-for-byte what they were on
2026-09-20 (a pipeline test holds the key list to `id, kind, origin, names, lines, points`).

| layer | token | line width *W* | dash (× lw) | points | ring |
|---|---|---|---|---|---|
| `ddot_routes` | `--lyr-bus` | 3.2 | solid | – | – |
| `ddot_stops` | `--lyr-bus` | – | – | dense | no |
| `smart_routes` | `--lyr-smart` | 2.8 | 3, 2 | – | – |
| `smart_stops` | `--lyr-smart` | – | – | dense | no |
| `qline` | `--lyr-rail` | (4) | – | sparse | yes |
| `people_mover` | `--lyr-rail` | (3.4) | – | sparse | yes |
| `mogo` | `--lyr-bike` | – | – | sparse | yes |
| `bike_lanes` | `--lyr-bike` | 2.4 | solid | – | – |
| `stations` | `--lyr-rail` | – | – | sparse | yes |
| `intercity_bus` | `--lyr-rail` | (2.6) | (5, 3) | sparse | yes |
| `park_ride` | `--lyr-smart` | – | – | sparse | yes |

- **Lines:** `lw = max(1.6, min(W, W × 18 / mpp))`. First one pass of **casing** for the whole layer:
  `--gw-case`, width `lw + 3`, solid. Then one pass of colour: width `lw`, dash array = the table's numbers × `lw`.
  Round caps and joins. Only lines whose box touches the view.
- **Points:** dense: nothing while `mpp > 12`, else radius `max(2, min(4, 30 / mpp))`, no ring. Sparse: radius
  `max(3.5, min(6.5, 45 / mpp))`, ring in `--surface`, ring width `max(1, r × 0.4)`.
- **Tokens** (light / dark): `--lyr-bus #1d4ed8 / #7aa7ff`, `--lyr-smart #0f766e / #4fd1c5`, `--lyr-rail #7e22ce /
  #c79bff`, `--lyr-bike #c2410c / #fb923c`, `--gw-case #ffffff / #0a110e`. `prefers-contrast` and forced-colors
  values are in `apps/web/src/style.css` and are copied, not re-invented.
- **The basemap under it** (both styles; `draw()` in `map.ts`, `MapPainter.draw` on iPhone):
  - *Ground:* fill `--map-out`; over it a **hatch** — diagonal lines at 45° (down to the right), **11 u** apart,
    **1 u** wide, `--map-out-ink` — then the service area's places filled `--map-land` (even-odd) and their edge stroked
    `--map-main` **1.5 u**. The hatch is what says "not our area": two pale fills were 1.20:1.
  - *Parks:* `--map-park`; a park narrower than 7 u gets a dot r 2 in `--map-park-ink` at 75 % (not in a small
    `quiet` map). Park names from `mpp < 7`, italic 600 12, only when the park is ≥ 46 u wide.
  - *Streets:* classes 0 (freeway) … 4 (side street). Classes 0–2 always; class 3 from **mpp < 11**; class 4 from
    **mpp < 6**. Width `max(min_c, min(max_c, base_c / mpp))` with `base = [18, 20, 15, 10, 7]`,
    `min = [1.6, 1.6, 1.6, 1.2, 0.9]`, `max = [6.5, 6.5, 6.5, 4.5, 4.5]`. Colour: class 0 `--map-fwy`, 1–2
    `--map-main`, 3–4 `--map-road`. Drawn 4 → 0. At **mpp < 4** classes 2, 1, 0 first get a casing in
    `--map-land`, width + **2.5** (never in the quietened basemap). Width and zoom carry the hierarchy, not fade.
  - *Street names:* class ≤ 4 at mpp < 4.6, ≤ 3 at < 8, ≤ 2 at < 14, ≤ 1 at < 30, else 0; size 13 / 12 / 12 / 12 / 11
    by class (0–1: 13, 2–3: 12, 4: 11), weight 600, halo 3.5 in `--map-land`.
  - *Tokens* (light / dark / light + more contrast / dark + more contrast): `--map-out #e2e9e4 / #060b09 / #e8eeea
    / #000000` · `--map-out-ink #768079 / #76827a / #4e5853 / #a9b8b0` · `--map-land #f7f9f6 / #141f19 / #ffffff /
    #0c1512` · `--map-park #c4e3c9 / #1c3b27 / #d8efdc / #123020` · `--map-park-ink #1d5a31 / #9fdcb4 / #0d3f1f /
    #cdf0da` · `--map-road #747d77 / #75827a / #4f5a54 / #a4b3aa` · `--map-main #666f69 / #88968d / #333c37 /
    #c9d8ce` · `--map-fwy #926c16 / #a3863a / #6a4d08 / #dcc079` · `--map-ink #2b3a32 / #d5e2da / #101a15 /
    #f2f8f4`. `--gw-*` and `--lyr-*` keep their values under more contrast. Every street is ≥ 3:1 against the
    land, a park **and** the ground outside; with more contrast ≥ 4.5:1.
- **Order:** ground → parks → streets → outline → **transport lines (layer order of the switcher)** → greenway →
  names → **transport points** → listing dots → "you are here" → focus ring.
- **Tap:** names the layer and the line or stop. **Keyboard N/P:** greenway stretches, then listing dots,
  nearest the middle first (`orderFeatures`). Transport features are not in the N/P order in `standard`.
- Basemap is **not** dimmed.

---

## 3. `subway` — principles

1. **The map stays geographic.** People use it to walk to a real stop, and the greenway, the listings and the
   street names share the canvas. Stops are drawn where they are. Lines follow their streets; the only liberty
   taken is a sideways shift of at most 1.5 line-steps where routes share a street (section 6).
2. **Transport is drawn in a metro diagram's language:** bold lines of uniform width with round caps and joins,
   a casing so they float above a quietened basemap; stations as white circles with a dark ring; places to
   change as white pills; ends of routes as a larger ring with a name; identity carried by a **badge** with the
   route's short name, repeated along the line.
3. **One line per route**, not one colour per layer. Route identity, colour, shared streets, interchanges and
   terminals are all worked out in the pipeline, so the three clients only draw.
4. **Colour is never the only carrier** (WCAG 1.4.1): every route has a text badge; every system differs by
   *shape* as well (solid / striped / tied / chevroned / double); the key says it in words; tapping names it;
   the text list is the same list as in `standard`.
5. **Nothing here is live.** No arrival times, no vehicle positions. `headway` is the agency's own published
   weekday figure, worded as theirs.

---

## 4. Tokens

Add these beside the `--lyr-*` tokens (web `style.css`; iPhone `MapPalette.swift`; Android `MapPalette.kt`).
Ratios are WCAG contrast, computed 2026-09-21 against the tokens **now** in `apps/web/src/style.css`:
light `--map-land #f7f9f6`, `--map-park #c4e3c9`, `--gw-case #ffffff`; dark `--map-land #141f19`,
`--map-park #1c3b27`, `--gw-case #0a110e`. Floor: **3.00** everywhere.

### 4.1 Lines and markers

| token | use | light | land | park | casing | dark | land | park | casing |
|---|---|---|---|---|---|---|---|---|---|
| `--tr-0` | bus tone 0, red | `#c8102e` | 5.56 | 4.25 | 5.88 | `#ff7a70` | 6.67 | 4.85 | 7.52 |
| `--tr-1` | bus tone 1, blue | `#1d4ed8` | 6.33 | 4.84 | 6.70 | `#7aa7ff` | 7.10 | 5.16 | 8.00 |
| `--tr-2` | bus tone 2, teal | `#0f766e` | 5.17 | 3.96 | 5.47 | `#4fd1c5` | 9.08 | 6.61 | 10.24 |
| `--tr-3` | bus tone 3, brown | `#8a4b14` | 6.40 | 4.90 | 6.78 | `#e0a96d` | 8.12 | 5.91 | 9.16 |
| `--tr-4` | bus tone 4, pink | `#be185d` | 5.70 | 4.36 | 6.04 | `#ff8ac2` | 7.80 | 5.67 | 8.79 |
| `--tr-5` | bus tone 5, slate | `#475569` | 7.16 | 5.48 | 7.58 | `#b6c2d2` | 9.39 | 6.83 | 10.58 |
| `--tr-rail` | QLINE line, Amtrak marker | `#1f2937` | 13.87 | 10.61 | 14.68 | `#eef2f6` | 15.06 | 10.95 | 16.98 |
| `--tr-dpm` | People Mover | `#86198f` | 7.78 | 5.95 | 8.24 | `#e59bf0` | 8.29 | 6.03 | 9.35 |
| `--tr-trunk` | trunk stroke, trunk badge | `#334155` | 9.78 | 7.48 | 10.35 | `#cbd5e1` | 11.41 | 8.30 | 12.87 |
| `--tr-bike` | bike lanes, MoGo | `#15803d` | 4.74 | 3.63 | 5.02 | `#6ee7a0` | 10.97 | 7.98 | 12.37 |
| `--tr-coach` | intercity bus | `#7c2d12` | 8.85 | 6.77 | 9.37 | `#fdba74` | 10.04 | 7.31 | 11.33 |
| `--tr-pr` | park and ride | `#1e40af` | 8.24 | 6.30 | 8.72 | `#93b4ff` | 8.24 | 5.99 | 9.29 |
| `--tr-ring` | station ring, pill ring | `#1b2a22` | 14.16 | 10.83 | 14.99 | `#eef5f0` | 15.29 | 11.12 | 17.24 |
| `--tr-fill` | station and pill fill, stripes, ties | `#ffffff` | – | – | – | `#0a110e` | – | – | – |

`--tr-fill` equals the casing on purpose; a station is read by its **ring** (`--tr-ring`), which is ≥ 10:1
against everything.

**Against streets.** As in `standard` (see the comment in `map.ts`), no colour can be 3:1 against both a
near-white ground and a mid-grey street. The **casing** is what separates a line from a street, all the way
along, and the casing against the (quietened, 4.3) street tokens is: light road 3.56 · main 3.75 · freeway 3.59;
dark road 3.93 · main 4.29 · freeway 3.95. Against the undimmed tokens (high-contrast mode, 4.4) it is higher.

**Badge text.** Light theme: `#ffffff` on the tone — 5.47 (teal) to 10.35 (trunk). Dark theme: `#0a110e` on the
tone — 7.52 (red) to 12.87. All ≥ 4.5.

**Green is kept for walking and cycling** (the greenway, bike lanes, MoGo). No bus or rail line is green, so the
greenway keeps its identity when every layer is on. Orange and ochre are left out too: they are the greenway's
"being built" phase and the freeways.

### 4.2 Which colour a route wears

Decided **in the pipeline**, so clients cannot disagree: `routes[i].tone` ∈ 0…5 → `--tr-<tone>`.

**(settled) Tones are handed out across ALL bus networks together**, not per file: a rider sees one street, and
the per-file version gave DDOT 4 Woodward and SMART 462 the same brown on Woodward. `assignTonesAcross`
(`transit-network.ts`) reads the committed `ddot_routes.net.json` and `smart_routes.net.json` themselves (so
refreshing one network still sees the other; `pnpm ingest:transit --derive` does it with no network at all):

- Two routes — of any agency — are **neighbours** when they are drawn side by side *in their own tones* for
  ≥ 300 m (`NEIGHBOUR_M`; within 20 m and 25°, sampled every 25 m, as for runs). A stretch where a route is
  inside a **trunk** of its own network does not count: there it wears `--tr-trunk`, not its tone.
- Routes are taken in **rider order across networks** (by the number on the bus; DDOT before SMART on a tie; no
  number last). Each takes the tone that costs it the fewest shared metres with neighbours already holding it,
  ties to the least-used tone, then the lowest number. Then a repair pass: a route that still clashes moves to a
  free tone, or takes a tone and pushes the neighbours holding it to tones free *for them* (one push, only when
  the total of clashing metres falls). If rider order does not come out clean, busiest-first and then a **fixed,
  seeded** series of shuffles are tried and the best kept. Deterministic: same files, same tones.
- Result today (79 routes): **no two neighbours share a tone, DDOT or SMART** — a test on the committed files
  holds that at zero, and that the files carry exactly what the function gives. Clients still only read `tone`.

**Agency colours are carried but not used by default** (`routes[i].color`, `.text` — only where the feed
publishes them: SMART and the People Mover; the City's DDOT layers publish none). Reason, measured: SMART's
`route_color` is a *service-class* colour shared by up to 17 routes, and **every one of its seven colours fails
3:1 in one theme** — `#00a2be` 2.87, `#e0792a` 2.86, `#67a333` 2.89 on the light ground; `#59327d` 1.76,
`#932274` 2.20, `#0055b7` 2.41 on the dark ground; FAST Woodward's `#ce2a2a` passes both (4.97 / 3.22). The
People Mover's own `#92278f` is 6.82 light / 2.35 dark; `--tr-dpm` is that purple, adjusted. **For Kyle:** see
section 13.

### 4.3 The quietened basemap (subway style only)

When the style is `subway` **and** at least one of `ddot_routes`, `smart_routes`, `qline`, `people_mover` is on,
the basemap swaps to these tokens. Every street stays ≥ 3:1 — today's accessibility fix is kept; the quiet
comes from thinner, paler-but-legal streets and a paler park, not from fading anything out.

| token | replaces | light | vs land | dark | vs land |
|---|---|---|---|---|---|
| `--map-road-q` | `--map-road` (4.01 / 4.22) | `#818a84` | 3.36 · park-q 3.05 | `#66756c` | 3.49 · park-q 3.05 |
| `--map-main-q` | `--map-main` (4.91 / 5.48) | `#7d8680` | 3.55 · park-q 3.21 | `#6c7b73` | 3.81 · park-q 3.32 |
| `--map-fwy-q` | `--map-fwy` (4.53 / 4.86) | `#a2833d` | 3.39 · park-q 3.07 | `#837039` | 3.50 · park-q 3.06 |
| `--map-park-q` | `--map-park` | `#e3f1e5` | fill | `#182c20` | fill |
| `--map-park-ink-q` | `--map-park-ink` | `#3f6b4c` | 5.26 on park-q | `#7fb394` | 6.18 on park-q |
| `--map-ink-q` | `--map-ink` (street names) | `#5a6760` | 5.60 | `#a3b2a9` | 7.66 |

**(settled)** A street crosses a park, so a quiet street is held to 3:1 against the quiet **park** as well as
the land — the first draft only computed the land, and the side street and the freeway were 2.78 / 2.81 (light)
and 2.75 / 2.81 (dark) over a park. The road and freeway tokens moved (the park did not, so every transit-vs-park
number below stands); each is still paler than the street it stands in for. Both computed-contrast tests hold
every quiet pair to ≥ 3.

Also: street widths × 0.8 (floor 1 u); the big-road casing pass (`mpp < 4`) is skipped; street names drop one
class (`labelCls − 1`), so fewer names compete with badges. Boundary, hatch, greenway, listing dots: unchanged.
Every transit token is ≥ 4.29 against `--map-park-q` (light) and ≥ 5.82 (dark).

### 4.4 More contrast, forced colours

- `prefers-contrast: more` (web), Increase Contrast (iPhone), high-contrast text (Android): **no quietened
  basemap** (4.3 is skipped); casing + 1 u; station rings + 0.5 u; tones become (light / dark, vs `#ffffff` /
  `#0c1512`): `--tr-0 #9b0c23` 8.50 / `#ffa099` 9.49 · `--tr-1 #1e3a8a` 10.36 / `#a8c5ff` 10.69 ·
  `--tr-2 #0b4f4a` 9.41 / `#8be6dd` 12.78 · `--tr-3 #5f330d` 10.68 / `#f0c596` 11.60 · `--tr-4 #831843` 9.65 /
  `#ffb3d7` 11.21 · `--tr-5 #1e293b` 14.63 / `#dbe3ee` 14.35 · `--tr-dpm #581c5f` 12.03 / `#f0c0f7` 12.01 ·
  `--tr-bike #14532d` 9.11 / `#a7f3c5` 14.38. Others keep their values (all already ≥ 8).
- `forced-colors: active` (web): every `--tr-0…5`, `--tr-dpm`, `--tr-coach`, `--tr-pr` → `LinkText`;
  `--tr-rail`, `--tr-trunk`, `--tr-ring` → `CanvasText`; `--tr-bike` → `GrayText`; `--tr-fill` → `Canvas`.
  All routes are then one colour, which is fine: badges, stripes, ties, chevrons and the double line still tell
  them apart. Selection uses `Highlight`.

---

## 5. Zoom bands

| band | mpp | lines | badges | stations | names |
|---|---|---|---|---|---|
| **far** | > 30 | all lines, side-by-side offsets **off** (every `off` read as 0), trunks as trunks | rail + `frequent` routes only (and the selected route); trunk badges | hubs only | hubs |
| **mid** | 12 < mpp ≤ 30 | all lines, offsets on | every route | + terminals, + interchanges with ≥ 3 routes, + all QLINE / People Mover / Amtrak / coach / P+R / MoGo markers; the selected route's stops | hubs; Amtrak stations; the selected thing |
| **near** | ≤ 12 | all lines, offsets on | every route | + every interchange, + every stop of a stops layer that is on (or of the selected route) | hubs; **terminals**; Amtrak stations; the selected thing; a stop's name on tap; QLINE and People Mover station names at mpp ≤ 6 |

**(settled) Terminal names are near-only; hub names are at every band.** The first draft had terminal names at
mid here and at near in 7.4. Both clients had followed 7.4, and they were right: at mid a terminal already
carries its route's badge, and thirty stop names downtown would crowd out the badges. 7.4 stands. At most 12
names a frame in all (section 12); a station's two platforms carry one name between them.

12 is the same threshold `standard` uses for dense stops, so the switcher's "zoom in to see stops" note stays true.
Hysteresis: a band changes only when mpp crosses the edge by 5 % (no flicker while pinching).

---

## 6. Geometry, identically on three platforms

All per route line of a `.net.json` file (section 10). `pts` = decoded vertices; `runs` = triples
`[from, off, n]`.

1. **Simplify, once per band, cached** (Douglas–Peucker, tolerance in metres: far 30, mid 10, near 0 = none),
   applied **to each run separately** so run boundaries survive.
2. **Offset** (mid and near). `step = W_freq(band) + gap(band)` (table 7.1). A run is shifted sideways by
   `off × step / 2` u, to the **left of the line's own direction of travel with north up** — on screen (y down),
   for a segment with screen direction `(dx, dy)` normalised, left is `(dy, −dx)`. The pipeline has already
   flipped the sign for lines running "backwards", so both directions of a route land on the same side and
   clients do no bearing logic. Per vertex inside a run: the mitre of the two neighbouring normals,
   `m = normalise(n_in + n_out)`, length `o / max(0.5, m · n_out)` (mitre limit 2). At a run boundary each run
   offsets the shared vertex with its own `off` and the path simply continues from one to the other: a short
   diagonal jog, never a gap. Runs with `n > 4` are **trunks**: `off` is 0 and they are drawn as in 7.3.
3. **Round the corners.** For every interior vertex P with unit directions `t_in`, `t_out`:
   `r = min(R(band), |prev P| / 2, |P next| / 2)`; `lineTo(P − r·t_in)`; `quadTo(P, P + r·t_out)`.
   `R` = far 6, mid 10, near 14. Skip when the turn is under 8°. This is `quadraticCurveTo` /
   `addQuadCurve` / `quadTo`, so the three agree to the pixel; it replaces Chaikin (same look, no extra points).
4. **Caps and joins:** round, always.

**(settled) Paths are cached per scale bucket**, as both clients found they had to: steps 2 and 3 depend on the
scale (an offset is in u, the geometry in metres), and rebuilding 14,000 vertices every frame of a pinch is the
whole frame budget. Build each line's path in **map units at the nearest step of a geometric scale ladder** and
draw it through one transform (translate for the pan, `scale(k)` for the remainder, with every stroke width and
dash divided by `k`). A pan rebuilds nothing; a pinch rebuilds once per step. The ladder's step is **at most
15 %** (web: 1.15, offsets and radii within 7 % between steps; iPhone: 2^(1/8) ≈ 1.09, within 4.5 %), and exact
on a step. Cache key: file key × band × bucket. Badge anchors, glyphs and hit boxes are screen-space and are not
cached this way.

Four things both implementers tripped on, all in the data's favour:
- **Clamp runs.** A run's `from` can equal the last vertex or repeat the previous run's `from` (the grid squeezed
  a run out). Clamp `from` to `[0, last]`, drop a run that is not after the one before it, and treat a line with
  no runs as one run `[0, 0, 1]`.
- **A route's own path ends at a trunk's first vertex** and starts again at its last: inside a trunk run the
  route draws nothing of its own (the trunk stroke is drawn once for everyone). Build three things per line:
  `own` (non-trunk runs, offset), `trunk` (trunk runs, centre line), and `all` (both, for the selected route and
  for the two rail lines, which never have trunks).
- **A closed loop starts mid-segment.** For `loop: true`, start the path at the midpoint of the first segment
  and end there, so the corner where the loop closes is rounded like every other.
- **Rail `.net.json` files have no `points`** (`points: []`): stations of the QLINE and the People Mover are the
  `points` of the *standard* layer file, which is always held when the layer is on. `serves` in the rail file
  indexes those points. The QLINE lists each station **twice** (two platforms, one name): draw both circles,
  print the name once.

Smoothing is done **on the device**, not shipped per band: three geometries would about double the two big
files (they are geometry-dominated: 12 of 42 KB and 28 of 59 KB gzipped), while steps 1–3 are O(vertices) over
about 14,000 vertices with both bus networks on (3,520 DDOT, 10,708 SMART), once per band change for step 1 and per frame only for lines in view.

---

## 7. Per-layer treatment (all 11)

### 7.1 Widths

| | far | mid | near |
|---|---|---|---|
| bus, `frequent` — `W_freq` | 3.5 | 5 | 6 |
| bus, other — `W_local` | 2.5 | 3.5 | 4.5 |
| QLINE, People Mover — `W_rail` | 4.5 | 6 | 7 |
| trunk | 5.5 | 8 | 10 |
| casing, added to the width (half each side) | + 2 | + 3 | + 4 |
| `gap` between side-by-side lines | – | 1.5 | 2 |
| bike lane: two strokes of / centre gap | 1 / 1.5 | 1.25 / 2 | 1.5 / 2.5 |

`frequent` comes only from the owner: DDOT's layer says `weekday_base_frequency ≤ 15` (today: 3 Grand River,
4 Woodward, 9 Jefferson); SMART's own names say FAST (261, 461, 462, 561). DDOT's "ConnectTen" brand is **not**
in its data, so it is not drawn.

### 7.2 The layers

| layer | subway drawing |
|---|---|
| **`ddot_routes`** | One **solid** line per route in its tone. Width by `frequent`. Badge = short name ("4"). |
| **`smart_routes`** | As DDOT, plus an **inline stripe**: a `--tr-fill` stroke down the centre, width = ⅓ of the line (mid and near only; at far SMART is solid). Badge = short name ("461"); `frequent` routes' badge reads "FAST 461" at near. Drawn **under** DDOT. Where SMART and DDOT share a street and both are on, DDOT's line sits on top; SMART is still named by its badges, its stripe either side of the overlap, and its stops. (Offsets are worked out per network file, so one layer alone never leaves a hole beside it.) |
| **`ddot_stops`, `smart_stops`** | Near band only: **station** = circle r 3, fill `--tr-fill`, ring `--tr-ring` 1.5. With `serves` loaded, a stop on the selected route is r 4.5, ring 2. At mid/far these layers draw nothing (their interchanges and terminals come from the routes file). |
| **`qline`** | `--tr-rail` line, `W_rail`, with **ties**: a second stroke in `--tr-fill`, width `W_rail − 3` (min 1.5), dash `[1.2 × W_rail, 1.8 × W_rail]`, butt caps. Stations from mid: r 4.5, ring 2. Terminals: Congress, Grand Blvd. Badge "QLINE". The line is `derived` — drawn through the stations; the key and the route card say so (`map.key_qline`). |
| **`people_mover`** | `--tr-dpm` **closed loop**, `W_rail`. **Direction chevrons**: every 90 u along the loop (mid), 120 u (near), none at far; each a "›" of two strokes 5 u long at ±35° to the direction of travel, `--tr-fill`, width 1.75, centred on the line, pointing the way `lines[0]` is ordered (the operator's own shape order). Stations from mid: r 4.5, ring 2. No terminals. Badge "DPM". |
| **`mogo`** | Not a line. Docked-bike marker: **rounded square** 9 × 9 (mid) / 11 × 11 (near), corner 2.5, fill `--tr-bike`, ring `--tr-fill` 1.5, with a `--tr-fill` dot r 1.5 in the centre. Far: not drawn. |
| **`bike_lanes`** | The secondary network: a **thin double line** in `--tr-bike` (table 7.1), no casing, drawn **under** every transit line. Never badged. At far, one 1.5 u line. Two ways to get the double line, both fine: two offset strokes (web), or — cheaper where the platform has it — ONE path stroked at `2 × stroke + gap` and then stroked again at `gap` with **destination-out** inside an offscreen layer (iPhone `drawLayer` + `.destinationOut`; Android `BlendMode.DstOut` inside `saveLayer`), which takes the middle back out. |
| **`stations`** (Amtrak) | **Square** 11 × 11 (mid) / 13 × 13 (near), corner 1.5, fill `--tr-fill`, ring `--tr-rail` 2.5, and a horizontal bar 7 × 2 in `--tr-rail` across the middle. Name shown from mid. |
| **`intercity_bus`** | **Diamond** (square turned 45°) 10 / 12 across, fill `--tr-fill`, ring `--tr-coach` 2 with dash `[3, 2]` — the dash it already has in `standard`. |
| **`park_ride`** | **"P" marker**: rounded square 14 × 14, corner 3, fill `--tr-pr`, a bold "P" 10 u in `--tr-fill`. |

### 7.3 Trunks — the exact rule

On any stretch, let *n* = the number of **distinct routes of the same network file** whose lines lie within
**20 m** of each other and within **25°** of parallel (either direction), sampled every 25 m; stretches under
150 m are folded into their neighbour (`SHARE_M`, `SHARE_DEG`, `SAMPLE_M`, `MIN_RUN_M`).

- *n* = 1: on the centre line. *n* = 2, 3, 4: **side by side**, in rider order, `off` = −1/+1, −2/0/+2,
  −3/−1/+1/+3 half-steps (far band: drawn on the centre, highest `frequent` then lowest route number on top).
- *n* ≥ 5: a **trunk**. Every member draws the same stroke, so draw it once per run: `--tr-trunk`, trunk width,
  normal casing. No member badges on the trunk. At each `trunks[]` anchor (pipeline: run midpoints clustered at
  400 m) draw one **stacked badge**: a `--tr-trunk` rounded rectangle listing the members' short names in rider
  order, separated by " · ", at most 6 names then "+N" (e.g. "3 · 4 · 16 · 23 · 29 · 42 +7"). Today: 5 DDOT
  anchors (the biggest, 17 routes, beside Rosa Parks Transit Center) and 10 SMART anchors.
  **(settled) A trunk badge may be nudged.** It speaks for up to 17 routes in the busiest part of the map, so
  unlike a route badge it is not dropped when its anchor is taken: try, in this order, vertical steps of
  `0, −1.5, +1.5, −3, +3, −4.5, +4.5, −6, +6, −7.5, +7.5` badge-heights, and at each step horizontal shifts of
  `0, −½, +½` badge-widths; first free spot wins; none free, it is dropped like any other.

### 7.4 Stations, interchanges, terminals, hubs

| glyph | data | shape |
|---|---|---|
| stop | stops layer `points` | circle r 3 (selected route: 4.5), fill `--tr-fill`, ring `--tr-ring` 1.5 (2) |
| **interchange** | `interchanges[]`: stops of ≥ 2 routes within **75 m**, `[x, y, name, routes, span]` | **pill**: a stadium around the segment `span` (the two stops of the group furthest apart, as offsets from x, y), height 9 (mid) / 11 (near), **corner radius = height / 2**, fill `--tr-fill`, ring `--tr-ring` 2. When the span is shorter than the height it is a circle — which is what it should be at mid zoom. |
| **terminal** | `routes[].ends[]`: real line ends (not where we clipped), clustered at 250 m, snapped to the route's nearest stop | ring r 6 (mid) / 7.5 (near), fill `--tr-fill`, ring **in the route's tone** 3, plus the route's badge beside it and, at near, the stop's name |
| **hub** | `places/transit.json` `hubs[]`: stations of **different systems** within **150 m** (today: Grand Circus Park ↔ Grand Circus; Financial District ↔ Congress; Detroit Amtrak ↔ coach ↔ QLINE Baltimore; Dearborn Amtrak ↔ coach) | pill as above around `span`, height 12 / 14, ring 2.5. Drawn when **two or more** of its layers are on. **(settled)** Placed from the file — `origin` + `at` + `span` (section 10) — never by looking stations up by name; the pill is always the whole `span`, whichever of the hub's layers are on. Named at every band. |

**Hit areas:** every station, pill, terminal, marker and badge answers a tap within a **44 × 44 pt / 48 × 48 dp /
44 × 44 CSS px** box centred on it, however small the glyph. When boxes overlap, the priority is the label
priority of section 8; a second tap in the same place cycles to the next thing under the finger.

### 7.5 Badges (roundels)

- Rounded rectangle, height 16 (far, mid) / 18 (near), corner radius 5, horizontal padding 5, min width = height.
  Fill = route tone (rail: `--tr-rail`, DPM: `--tr-dpm`); text `#ffffff` light / `#0a110e` dark; ring
  `--tr-fill` 1.5 so it lifts off its own line.
- Type: the **system font**, weight 700 (`system-ui` / `.system(size:weight:.bold)` / `FontWeight.Bold`),
  size 11 (far, mid) / 12 (near), tabular figures, no letter-spacing. Text is the route's `short`; if `short` is
  empty, the first 10 characters of `long`.
- **Always horizontal.** Badges are never rotated, so nothing is ever upside down. Street names keep today's
  rule (rotated along the street, flipped to read left-to-right).
- **Where** (`badgeAnchors`, pure): along the route's **first** line only (`routes[i].lines[0]`), at distances
  `spacing / 2 + k × spacing` metres from the line's start, k = 0, 1, 2 …; `spacing` = far 8,000 m, mid 3,000 m,
  near 1,200 m. World-anchored, so badges do not swim when the map pans. An anchor is skipped if it falls in a
  trunk run, within 24 u of a terminal, or off screen. Each terminal also carries its route's badge.
- **Cap: 24 badges a frame** (trunk badges count), counted as **placed**: a badge that finds no room (section 8)
  is dropped and does not use up one of the 24.
- **(settled) Order of claim — round-robin** (`badgeOrder`, pure, the same on every client):
  1. every badge of the **selected route**, nearest the screen centre first;
  2. then in **rounds**: every route's *first* badge (its nearest to the centre) before any route's *second*, and
     so on. Inside a round: **rail › trunk badges › `frequent` routes › the rest**, then rider order (by number,
     DDOT before SMART, no number last), then nearest the centre, then id.
  A trunk's stacked badge counts as a route of its own (so it is always in round one). A terminal's badge is one
  of its route's badges. The first draft's strict priority (all of route 1, then all of route 2 …) spent the 24
  on the low-numbered routes at mid zoom and left the high-numbered routes on screen with no name at all.
- **Keep clear of the map's own controls** (web: the zoom buttons and the arrow pad, read from the DOM each
  resize; a phone: whatever floats over the canvas): their boxes are entered as already taken before anything is
  placed, so no badge or name is drawn under a button.
- **Scale with text size:** badge and label sizes follow the platform's text scale up to × 1.5
  (Dynamic Type / `fontScale` / the root font size), heights and padding with them.

---

## 8. Labels

- Halo: 3.5 u stroke in `--map-land` under `--map-ink` text (as street names today), weight 600, size 12
  (13 for the selected thing).
- **Collision priority**, highest first: selected feature › terminals › hubs and interchanges › badges › stops ›
  street and park names. A lower one that does not fit is dropped, never shrunk or overlapped. Uses the
  existing circle-row test in `map.ts` (`free()`), with badges entered as their rectangle.
- Placement for a station name: right of the glyph, then left, above, below — first that is free.
- **RTL (Arabic):** route names and badges are Latin and stay left-to-right (`dir="ltr"` / isolate). The **map
  never mirrors**; the key, the route card and the layers panel do, as the rest of the app.

---

## 9. Selection, cards, key, list

**Tap a line** (nearest route line within 22 u; on a trunk, the card lists the members — `map.many_routes` —
and each is a button): the route draws last at width + 1.5 with an extra under-stroke in `--tr-sel`
(= `--tr-ring`; `Highlight` under forced colours; width + casing + 3); **every other transit line, badge and station is drawn at 35 % opacity**; its stops
appear (r 4.5) at mid and near — this asks for the network's stops layer **and** stops `.net.json` if not
held; until they come, only terminals and interchanges show. Greenway, listings and basemap are not dimmed.
The **card** (the existing map card) shows: `map.route_card` ("4 Woodward · DDOT"), "Frequent route" when
`frequent`, `map.route_every` when `headway` is present, `map.route_stops`, the terminals' names, and **one
link: the owner's trip planner** — the link the Map tab already carries for that agency in its "Trip planners"
section (one source of truth; the `agency_url` in the file is a fallback). No arrival times, ever.

**Tap a station:** name, then `map.stop_lines` from `serves` (each route a button that selects it).
**Tap an interchange or hub:** `map.change_here` / `map.hub_walk`. Tapping empty map clears the selection;
Escape does too.

**Keyboard (web) and the rotor / TalkBack traversal:** the N/P roving order of `standard` is kept and extended,
never reordered: greenway stretches → listing dots → **(subway only) hubs → terminals → interchanges in view,
nearest the middle first → routes in view, rider order**. Enter opens the card; on a route it selects it. The
focus ring is today's (`drawRing`), drawn round a glyph's 44 u box or, for a route, round its nearest badge.
Cap the extension at **40** features a view, and say "and {n} more" (`map.list_more`) — the list has them all.
**(settled) Inside the 40: every hub, at most 8 terminals, at most 20 interchanges (each nearest the middle
first), and routes take the rest — never fewer than 8.** Uncapped, downtown's hundred interchanges filled all 40
at mid and near zoom and the keyboard / VoiceOver never reached a route. A route is "in view" when one of its
lines crosses the view; where none of its badges or terminals is on screen (downtown most routes are inside a
trunk) the focus ring goes round a 44 u box at the place on its line nearest the middle of the view.

**The key**, in words, under the map when the style is `subway` and a network layer is on (a `<ul class="gwkey">`
like the greenway's; same strings on all three): the `map.key_*` lines of section 1, each with a small drawn
sample, only for what is on.

**The text list ("See this map as a list") is identical in both styles** — same headings, same rows, same
order, same links: help listings; greenway stretches; parks; and for each transport layer its name, a count,
and its route or stop names. The list reads the standard layer file only. On the web it is its own module
(`apps/web/src/maplist.ts`, which imports nothing and is never told the style), and a test renders it for both
styles and compares the HTML to the character. (The `subway` files allow more —
stops in travel order under each route — but that would be a change to the list in **both** styles and is a
separate decision; it is not part of this spec.)

---

## 10. Data

**Two files per network layer**, both in the signed index, both lazy (everything under `map/` is — `loadedNow`
on iPhone/Android, the `map/` filter in `apps/web/src/data.ts`):

| file | who reads it | contents |
|---|---|---|
| `map/transit/<id>.json` | both styles (it is all `standard` needs) | `id, kind, origin, names, lines, points` — **unchanged, byte for byte** |
| `map/transit/<id>.net.json` | `subway` only, fetched when the style is on and the layer is on | below; `v: 2` |

`places/transit.json` gains, per network layer, `net: { file, bytes, v, routes? }`, and at the top level `hubs`:

```
"hubs": [{ "origin": [-83.32, 42.22],            // (settled) what `at` and `span` count from: [lon, lat]
           "at": [26933, 11644],                  // the hub's centre, whole 1e-5 degrees from `origin`
           "span": [8, -66, 18, 41],              // the pill's two ends, as steps from `at` (south end first)
           "name": "Grand Circus Park", "layers": ["people_mover", "qline"],
           "stops": [{ "layer": "people_mover", "name": "Grand Circus Park" }, { "layer": "qline", "name": "Grand Circus Station" }] }]
```

Every hub carries its own `origin`, packed like every layer, so no client assumes a grid. (The first draft had
none: the web found hubs by matching station names among the layers that were on, the iPhone assumed the transit
grid's origin. Both now read `origin`; name-matching / the assumed origin remain only for a bundle built before
2026-09-21, which has no `origin`.) `stops` is for the card's words (`map.hub_walk`), not for placing anything.

Old clients ignore both (checked: web reads `.layers[]` fields by name; Swift `Decodable` ignores unknown keys;
Android does not read the file yet).

`<routes id>.net.json` (`ddot_routes`, `smart_routes`, and — with `serves` and `route_ids` folded in — `qline`,
`people_mover`). It stands on its own: in `subway` the routes layer is drawn from **this file alone**, so a
person who only ever uses `subway` never downloads the standard routes file.

```
{ "id", "kind": "line", "origin": [lon, lat], "names": [...],            // same packing as every layer
  "lines": [[nameIdx, [x0, y0, dx, dy, …]], …],                          // + a vertex wherever the company changes
  "v": 2, "system": "ddot", "agency": "DDOT", "agency_url"?: "…",
  "stops_layer": "ddot_stops", "stops_count": 5098,                      // stop numbers below index THAT file's points
  "routes": [{ "id": "rt_ddot_4", "short": "4", "long": "Woodward", "tone": 3,
               "color"?: "#ce2a2a", "text"?: "#ffffff",                   // only when the feed publishes them
               "frequent"?: true, "headway"?: 12, "loop"?: true, "derived"?: true,
               "lines": [6, 7],                                           // numbers in lines[]
               "stops": [[374, 368, …], […]],                             // one list per direction, in travel order
               "ends": [[x, y, nameIdx], …] }],
  "runs": [[from, off, n, from, off, n, …], …],                          // one flat list per line (section 6)
  "interchanges": [[x, y, nameIdx, [routeIdx, …], [dx1, dy1, dx2, dy2]], …],
  "trunks": [[x, y, [routeIdx, …]], …] }
```

**Loading and failure, as built (both clients).** A `.net.json` file goes through the same path as a layer:
looked up in the signed index, fetched, checked against its SHA-256, only then parsed; cached in memory by
`file:sha256`. It is asked for when the style is `subway` **and** the layer is on (or a selected route needs its
stops file). While it is on the way, and if it fails (not in the index, bad hash, network, not `v: 2`, or
malformed), **that layer goes on drawing `standard`** beside the ones that arrived — per layer, never all or
nothing — and a failure shows the usual "could not load · Try again" line inside the "Map style" group and is
announced; "Try again" forgets the failure and asks afresh. The web also lazy-loads the subway *code* as its own
chunk the first time the style is chosen; if that fails the whole map stays `standard` and says so. As built,
both clients **still fetch the standard layer file** for a layer that is on, because the text list, tap-to-name
and the fallback read it — so the sentence above about never downloading the standard routes file is what the
format allows, not what the clients do today. Selecting a route asks for its network's stops layer **and** stops
`.net.json` if not held; until they arrive only terminals and interchanges show.

`<stops id>.net.json`: `{ id, v, system, agency, routes_layer, route_ids: ["rt_…"], serves: [[routeIdx, …], …] }`
— `serves[i]` belongs to `points[i]` of the unchanged stops layer. The pair is always written in one run
(`pnpm ingest:transit ddot_stops` reads the whole DDOT network), and a test checks they agree.

New id prefix: **`rt_`** route (`rt_ddot_4`, `rt_smart_461`, `rt_qline`, `rt_dpm_dpm`). Stable: built from the
owner's route id; never reused.

**Where each fact comes from.** Route identity, names: the owners' fields. Colours: GTFS `route_color` /
`route_text_color` (SMART, People Mover). Stop order: GTFS `stop_times.txt` (SMART, People Mover — the trip
with the most stops on the longest shape each way). **DDOT: the City's ArcGIS layers carry no stop order**; a
stop row names its routes (`route_number`, e.g. "7, 32"), and a route's stops are ordered by distance along
its line, keeping those within **60 m** of it (`STOP_ON_LINE_M`); a stop further off still appears in `serves`.
QLINE: the City publishes stops, no track, so the line runs through the middle of each station's platform
pair, south to north, `derived: true`. People Mover: the operator's `shapes.txt`, closed, in travel order,
`loop: true`.

**Sizes** (bytes; gzip −9; 2026-09-21; the budget was raised to **256 KB** on 2026-09-24, when the area became every city and township a DDOT or SMART bus reaches and SMART's network came in whole: `smart_routes.net.json` is 71 KB, `smart_stops.json` 65 KB — DECISIONS 2026-09-24). Budget at the time: **every file ≤ 64 KB gzipped** (a test fails the build of
the data otherwise), lazy per layer, and **`standard` pays nothing**.

| file | raw | gz | note |
|---|---|---|---|
| `ddot_routes.json` | 24,385 | 10,396 | unchanged |
| `ddot_stops.json` | 173,581 | 55,145 | unchanged |
| `smart_routes.json` | 71,822 | 26,011 | unchanged |
| `smart_stops.json` | 159,643 | 52,318 | unchanged |
| `qline.json` / `people_mover.json` | 665 / 510 | 374 / 360 | unchanged |
| **`ddot_routes.net.json`** | 109,594 | **42,341** | new; tones across networks (2026-09-21) |
| **`ddot_stops.net.json`** | 26,320 | **4,889** | new |
| **`smart_routes.net.json`** | 165,896 | **58,563** | new; the closest to the 64 KB budget (65,536) |
| **`smart_stops.net.json`** | 25,350 | **4,188** | new |
| **`qline.net.json`** / **`people_mover.net.json`** | 702 / 1,112 | **391 / 606** | new |
| `places/transit.json` | + ~1.2 KB raw | | `net` entries and 4 hubs, each with its `origin`; travels with every bundle |

Considered and dropped: folding the new fields into the existing files (first attempt: DDOT routes 10 → 45 KB
gz, SMART 26 → 62 KB, paid by everyone, and it changed what `standard` draws for the two rail layers).

---

## 11. Draw order (both styles; *italics* = subway only)

1 ground, out-of-area hatch · 2 parks · 3 streets, minor → main → freeway · 4 city boundary · 5 neighbourhood
outline · 6 **bike lanes** · 7 *one casing pass for all SMART lines, then SMART lines, then stripes* · 8 *one
casing pass for all DDOT lines, then DDOT lines, local before frequent* · 9 *trunk strokes* · 10 *QLINE: casing,
line, ties* · 11 *People Mover: casing, line, chevrons* · 12 *selected route (under-stroke, casing, line)* ·
13 **greenway** (casing, phases, focus, its station dots) — **above all transit lines, with its own colours and
width, in both styles** · 14 street and park names · 15 stops · 16 *interchanges, terminals, hubs* · 17 point
markers (MoGo, P+R, coach, Amtrak) · 18 *badges and trunk badges* · 19 listing dots · 20 labels of selected /
terminals / hubs · 21 "you are here" · 22 keyboard focus ring.

(In `standard`, 6–11 are "transport lines in switcher order" and 15–17 are "transport points", as today.)

## 12. Performance budget

- Paths are **batched**: one path per casing pass per network (2 for a bus network: frequent and local widths),
  one path per route for colour (≤ 42), one for all stripes, one for all trunks. No per-segment strokes.
- Only lines whose box touches the view; offsets and corner rounding only for those.
- **Dim as ONE layer.** When a route is selected, everything else in transit is drawn into one offscreen layer
  and that layer is composited at 35 % (`drawLayer { opacity = 0.35 }`, `saveLayer(alpha)`; on the web
  `globalAlpha` per pass is close enough because the casing pass hides what is under it). Setting 35 % on each
  stroke instead makes overlaps add up and the casing show through the line. With Reduce Transparency (iPhone)
  nothing is faded: the under-stroke and the extra width still mark the route.
- Caps a frame: 24 badges · 12 station names · 400 stop glyphs (near; beyond that, draw the 400 nearest the
  centre and let the list carry the rest) · 120 interchange pills · 40 keyboard features.
- Target: transit passes ≤ 8 ms a frame on a mid-range phone with both bus networks on; band simplification
  ≤ 30 ms once per band change, off the main thread on iPhone/Android.
- Decoding a `.net.json` file happens once per bundle version, cached by `file:sha256` exactly as layers are.

## 13. Why this still honours the rules

- **Drawn on the device from the signed bundle.** Every new file is in the Ed25519-signed index and checked
  against its SHA-256 before it is parsed, like every layer. No tiles, no map company, no fonts or scripts
  fetched, no request to DDOT, SMART, M-1 RAIL, the People Mover, MoGo or anyone else at run time.
- **Nothing about the rider leaves the phone.** The style choice, the selected route and the map position are
  in memory or in the on-device layer store; none is in any request. Fetching `ddot_routes.net.json` tells the
  bundle host only that someone switched that layer on in that style — the same class of fact the lazy layer
  files already reveal, from a static host that keeps no IPs.
- **No real-time feed, no timetable.** `headway` is the City's published weekday base frequency, worded as the
  agency's; `frequent` is the owner's word, never ours.
- **Facts, not claims:** the QLINE line says it is drawn through its stations. A DDOT route's stop list says
  nothing about order it does not know — the order is geometric and the spec says so.
- **Sources are read-only, named at the top of the ingest, asked once, with our honest user-agent.** Licence
  attributions and the Open licence rows in DECISIONS (2026-09-20) are unchanged: same owners, same files.
- **Accessibility is kept, not traded:** `standard` is untouched and is the default; `subway` holds every line
  and marker to ≥ 3:1 in both themes, keeps streets ≥ 3:1 even when quietened, keeps the N/P order and only
  appends to it, keeps the identical text list, and never lets colour carry meaning alone.

### For Kyle to decide

1. **Agency brand colours.** Default here is our contrast-checked palette, because every SMART colour fails 3:1
   in one theme and they mark service classes, not routes. Option: honour `color` only for the routes where it
   passes in both themes (today that is FAST Woodward 461/462 alone). Say if you want that.
2. **`frequent` for DDOT = the City layer's weekday base frequency ≤ 15 min** (routes 3, 4, 9 today). ConnectTen
   is not in the data. OK, or should a steward keep a short list instead?
3. **The QLINE line is a drawing through its stations** (no public track layer; the QLINE GTFS is stale). OK to
   ship marked `derived`, or stations only until a track source exists?
4. **Stops in travel order in the text list** (possible now, in both styles) — a separate change to the list.
5. `rt_` joins the id prefixes in CLAUDE.md; `pnpm ingest:transit` still is not in the publish workflow
   (DECISIONS 2026-09-20, open).

---

## 14. Implementation checklist

Shared, pure, testable without pixels — write these first on each client, against the **same fixtures**
(proposed: `schema/fixtures/map-style/*.json`, generated once from the TypeScript version):

| function | in → out |
|---|---|
| `mapStyle(stored)` | anything → `"standard"` \| `"subway"` (default `standard`) |
| `zoomBand(mpp, previous)` | → `far` \| `mid` \| `near`, with the 5 % hysteresis |
| `routeColour(route, theme, contrast)` | → token name (`tone` → `--tr-N`; rail, DPM fixed) |
| `lineWidth(route, band)` / `casingWidth` / `step(band)` | → u (table 7.1) |
| `decodeNet(file)` | → routes, lines with runs, interchanges, trunks; refuses `v` ≠ 2 by falling back to `standard` |
| `offsetRun(pts, off, step)` | → shifted polyline (mitre limit 2) |
| `roundCorners(pts, R)` | → move / line / quad commands |
| `badgeAnchors(line, spacing, runs)` | → distances and points, skipping trunks |
| `badgeOrder(candidates, selected)` / `claimBadges(…, cap, place)` | → round-robin claim order (7.5); the ≤ 24 that were *placed* |
| `riderOrder(short, system, index)` | → one sortable number: bus number, DDOT before SMART, file order; no number last |
| `hubSpan(hub)` | → the pill's two ends from `origin` + `at` + `span` (old bundle: fall back) |
| `stationsFor(band, selection, layersOn)` | → which stops, interchanges (≥ 3 at mid), terminals, hubs draw |
| `hitTest(point, glyphs)` | → the thing under a 44 u box, by priority, cycling on repeat |
| `featureOrder(existing, subwayFeatures)` | → N/P order: today's order, then hubs, ≤ 8 terminals, ≤ 20 interchanges, routes; ≤ 40 added |
| `basemapTokens(style, networkOn, contrast)` | → normal or `-q` token set |

**Web (`apps/web`, TypeScript canvas)**
- [x] `layers.ts`: `loadStyle` / `saveStyle` beside the layer list; `main.ts`: the radio fieldset, `map.style_say`
      through `announce()`, focus returns to the chosen radio (`refocusSel`).
- [x] `style.css`: section 4 tokens for light, dark, `prefers-contrast: more` (both themes), `forced-colors`.
- [x] New `apps/web/src/subway.ts` with the pure functions; `map.ts` gains a `style` on `MapSpec` and one
      `drawSubway()` called in place of the overlay-lines and overlay-points passes when `style === 'subway'` —
      the `standard` passes are not edited.
- [x] `loadLayer` reused for `.net.json` (same checksum path, keyed `file:sha256`).
- [x] Tests (`apps/web/test`): every function above on the fixtures; style defaults to `standard`; switching
      styles makes no request for a held file; the list HTML is string-identical in both styles; every `--tr-*`
      token pair ≥ 3:1 computed from `style.css` (the audit's contrast helper); key strings exist ×4 languages.
- [ ] Screenshots (light and dark, 390 × 844): city-wide far; Woodward corridor mid (side-by-side + QLINE ties);
      Rosa Parks Transit Center near (trunk + stacked badge); People Mover loop with chevrons; route 4 selected;
      Grand Circus hub card; `prefers-contrast: more`; forced-colors; Arabic (RTL panel, LTR badges);
      and the same five views in `standard` to prove nothing moved.

**iPhone (`apps/ios`, SwiftUI `Canvas`)**
- [x] `HelpCore/MapStyle.swift`: the pure functions (`Sendable`, no UIKit); `HelpCore/MapData.swift`:
      `NetFile: Decodable` and `MapData.net(_:)`; `TransitLayer` gains optional `net`.
- [x] `MapPalette.swift`: `--tr-*` as `Color` sets for light / dark / Increase Contrast
      (`@Environment(\.colorSchemeContrast)`); `-q` basemap set.
- [x] `MapCanvas.swift`: `drawSubway(context:)` — `Path` per batch, `StrokeStyle(lineCap: .round, lineJoin:
      .round, dash:)`, `addQuadCurve` for corners, `context.opacity = 0.35` for the dimmed pass, badges with
      `context.draw(Text(...).font(.system(size:weight:.bold)))` resolved once per badge string.
- [x] `MapModel`: `style` stored in the excluded-from-backup state file; `.net.json` fetched through
      `BundleStore.get` (already checks the hash); decode off the main actor.
- [x] Layers sheet: the two-option picker; `AccessibilityNotification.Announcement(map.style_say)`.
      Accessibility: `accessibilityChildren` for hubs, terminals, interchanges, routes in the section 9 order;
      44 pt hit boxes.
- [x] Tests (`HelpCoreTests/MapStyleTests.swift`): the shared fixtures; decode the four real `.net.json` files
      from the bundle fixture; palette ratios ≥ 3:1.
- [ ] Screenshots: the web list, on iPhone 17 Pro light/dark, plus Dynamic Type XXL (badges scale, nothing clipped)
      and VoiceOver rotor order.

**Android (`apps/android`, Compose `Canvas`)** — implement this document as it now stands; every **(settled)**
item above is already what the other two clients do. From the two implementers, the things that cost them time:
- [ ] Android draws no transport layers yet: build `standard` first from section 2 (the basemap paragraph there
      is exact: hatch 11 / 1, edge 1.5, street widths and the 6 / 11 thresholds, the big-road casing under mpp 4,
      every transport line on a `--gw-case` casing of width + 3, all four values of every token), then `subway`.
- [ ] Badges: `badgeOrder` is round-robin with rank selected › rail › trunk › frequent › other; the cap counts
      badges *placed*; a trunk badge may be nudged (7.3); the map's own controls are taken space (7.5).
- [ ] TalkBack order: ≤ 40 added, of which ≤ 8 terminals and ≤ 20 interchanges, so routes are always reached (9).
- [ ] Hubs from `origin` + `at` + `span`; never match names unless the hub has no `origin` (10).
- [ ] Tones come from the file and are already distinct across DDOT and SMART; do not re-derive them (4.2).
- [ ] Geometry: clamp runs; a route's own path stops at a trunk's first vertex; a closed loop starts mid-segment;
      paths cached per band × scale bucket (step ≤ 15 %) and drawn through one transform (6).
- [ ] Rail `.net.json` files have no `points`: stations come from the standard layer file; the QLINE's station
      names come in pairs — print each once (6).
- [ ] Bike double line by `BlendMode.DstOut` inside a `saveLayer` (7.2); the selected-route dim as ONE
      `saveLayer` at alpha 0.35, not per stroke (12).
- [ ] Names: terminals near only, hubs at every band, 12 a frame (5).
- [ ] Quiet basemap tokens are the 2026-09-21 values (`--map-road-q #818a84 / #66756c`, `--map-fwy-q #a2833d /
      #837039`); hold every quiet street to ≥ 3:1 against the land AND the quiet park in the ratio test (4.3).
- [ ] Strings: every key of section 1 already exists in all four files, including `map.done`, `map.zoom`,
      `map.layer_loading`.
- [ ] `query` or `app` module `MapStyle.kt`: the pure functions; `NetFile` parsing with the JSON reader the
      bundle already uses (UTF-8 bytes; unknown keys ignored).
- [ ] `MapPalette.kt`: tokens for light / dark / high-contrast; `-q` set.
- [ ] `drawSubway(DrawScope)`: `Path` per batch, `Stroke(cap = StrokeCap.Round, join = StrokeJoin.Round,
      pathEffect = dashPathEffect(...))`, `quadraticTo` (`quadraticBezierTo` on older Compose), `alpha = 0.35f`,
      badges via `TextMeasurer` cached per string.
- [ ] Style in the app-private state file (no backup: `android:allowBackup` rules already exclude it); radio rows
      with `Modifier.selectable(role = Role.RadioButton)`; `announceForAccessibility` / live region for the change;
      48 dp hit boxes; TalkBack traversal order per section 9 via `semantics { traversalIndex }`.
- [ ] Tests (`ParityTest`-style): shared fixtures; real `.net.json` files decode; ratios ≥ 3:1.
- [ ] Screenshots: the same list on a Pixel-class emulator, light/dark, font scale 1.5, TalkBack on.

---

## 15. Neighbourhood and city boundaries (both styles)

**Status:** spec, 2026-09-22, built on the web (`apps/web/src/bounds.ts`, drawn in `map.ts`). iPhone and Android
next. Nothing here depends on the map style: boundaries are drawn identically in `standard` and `subway`, and
section 4.3's quietened basemap explicitly leaves them alone.

Kyle, 2026-09-22: *"The user needs to be able to see the boundaries of the neighborhoods on the map."*

Until that day the outlines layer (`place:areas`) was **off by default on the Map tab** and a neighbourhood was
drawn only under 14 m per pixel. The Map tab opens on the whole city, so in practice a person saw four city edges
and none of the 205 neighbourhoods they had come to find. Two things changed: the layer is in `DEFAULT_LAYERS`,
and every outline is drawn in every band — what keeps 205 of them from being a mesh is **weight**, not hiding.

### 15.1 The table

`boundaryStyle(mpp)` — pure, no theme, no stylesheet, no position. Units are **u** (1 CSS px = 1 pt = 1 dp), as
everywhere else in this document. The bands are section 5's, unchanged, so there is one ladder to port
(`city` is section 5's `far`).

| band | mpp | neighbourhood | city outline | dash (u, absolute) | names |
|---|---|---|---|---|---|
| **city** | > 30 | **1.1** | **1.5** | `[2, 2]` | **none** |
| **mid** | 12 – 30 | **1.6** | **2.4** | `[3, 3]` | yes, ≤ **12** a frame |
| **near** | < 12 | **2.2** | **3.0** | `[6, 3]` | yes, ≤ **12** a frame |

- **The dash is absolute**, not `× lineWidth` the way a transit dash is (section 2). A thin line whose dash
  scales with it stops being dashed; the dashed texture is what says "this is not a street". The **"on" length
  is never shorter than the stroke is wide** (a test holds it): a dash shorter than that reads as dust.
- **A city outline is heavier than a neighbourhood's, and that is the only difference between them.** Never a
  different colour, and never a fill: docs/13 rule 1 forbids a choropleth, and weight is the one channel that
  carries "bigger thing" without carrying a value.
- **At city zoom 1.1 u is still thinner than the thinnest street drawn there.** Section 2's basemap draws
  classes 0–2 above 11 mpp, and their width floor is 1.6. So a boundary is never mistaken for a road, and the
  lattice sits under everything. This is the one number a later "make it stronger" pass may not simply raise.
- **These numbers were strengthened twice, from the screenshots rather than from the table.** The first draft
  (0.6 / 1.1 / 1.8 on `[1, 3]`, `[2, 3]`, `[5, 3]`) vanished at city zoom under the help dots; the second
  (0.9 / 1.1 / 1.8) still read faint at mid zoom beside the streets, and the whole ask was that a person can
  SEE the boundary. **Porters: copy the table above, not an earlier draft of it.**
- **Names:** centred on the outline's bounding box, horizontal, never rotated, weight 700 size 13, halo 3.5 in
  `--map-land` — and **left-to-right on an Arabic screen like every other name on the map** (section 8: the map
  never mirrors). A name is offered only when its outline is at least **70 u** wide on screen
  (`BOUNDARY_NAME_MIN_PX`), the candidates are taken **nearest the middle of the screen first**, the band's cap
  is **12**, and each one still goes through the map's existing collision test (`free()` in `map.ts`): a name
  that does not fit is dropped, never shrunk and never overlapped. Area names are placed before park names and
  after street names, so the bigger thing wins.
- **The tapped / current outline**: solid, `--focus`, width **4**, with a wash of `--brand` at **0.08** over its
  rings (even-odd). That is a selection, not a value. (It was 3 when an ordinary outline was at most 1.6; it has
  to stay clear of the 3.0 a city outline now carries at near zoom.)
- **Hysteresis** is not applied here. A boundary has no badge to flicker and no cached geometry; recomputing a
  width on a band change costs nothing. (A porter that already has section 5's `zoomBand` with its 5 % hysteresis
  may reuse it; either answer is within a pixel.)

### 15.2 The token

| token | light | dark | light + more contrast | dark + more contrast | forced colours |
|---|---|---|---|---|---|
| `--map-bnd` | `#7a5588` | `#a98cbb` | `#5a3a6b` | `#cdb4da` | `GrayText` |

Contrast, computed from the tokens in `apps/web/src/style.css` (floor 3.00; the web test walks all four modes):

| pair | light | dark | light + contrast | dark + contrast |
|---|---|---|---|---|
| boundary / `--map-land` | 5.70 | 5.77 | 9.32 | 9.84 |
| boundary / `--map-park` | 4.36 | 4.20 | 7.68 | 7.58 |
| boundary / `--map-out` (the hatched ground outside the service area, which a place's outline runs along) | 4.88 | 6.75 | 7.92 | 11.14 |

For scale: a main road is 4.91 against the land in the light theme and a side street 4.01. The boundary now sits
just above the main road — which is the point. The first values (`#8d6a9a` / `#9f83b1`, land 4.26 / 5.13) cleared
the 3.00 floor and still read faint at mid zoom, because a 1.6 u dashed line has far less ink on the screen than
a 4 u solid road of the same swatch. Contrast is a floor, not the whole answer; the screenshots are the answer.

It is **deliberately not a street colour.** `--map-road`, `--map-main` and `--map-fwy` are all within a step of
each other in grey-green (section 2), and an administrative edge that wears one of them is not a boundary, it is
a road. A plum reads as "administrative" beside them, while the thin stroke and the gaps keep it quiet under the
help. Under forced colours it is a system keyword like every other map token, and the **dash** is then the only
thing telling it from a street — the same argument section 4.4 makes for the greenway's four phases.

Against the quietened basemap of section 4.3 nothing changes: the quiet park is lighter than the park in the
light theme and darker than it in the dark theme, so every ratio above is a floor.

### 15.3 Draw order

Boundaries are **step 4½** of section 11: after the streets (3) and the city fill and edge of the basemap, and
before bike lanes (6) and everything above them. So: **over the ground, the parks and the streets; under the
transit lines, the greenway, the listing dots, the labels and the focus ring.** Switching boundaries on can
never hide a place that helps. (Section 11's "4 city boundary · 5 neighbourhood outline" is this step; it is now
one pass with one table, and the neighbourhood is no longer conditional on the zoom.)

### 15.4 On by default, and the one-time migration

`place:areas` is in `DEFAULT_LAYERS` (`apps/web/src/layers.ts`). A phone that has never touched the switcher
simply gets it. A phone that **has** never reads the defaults again, so it would have gone on seeing no
boundaries for ever; adding the layer on every load instead would mean nobody could switch it off. So:

- a **version marker** lives beside the layer list (web: the `layers_v` key in the same IndexedDB store;
  iPhone: the excluded-from-backup state file; Android: the app-private state file), value `LAYERS_VERSION = 2`;
- on load, a stored list with **no marker, or an older one**, gains `place:areas` once (at the end, nothing else
  touched, the 30-layer cap still applied), and the marker is written;
- **every write of the layer list writes the marker too**, so a choice made after the migration — including
  "off" — is never migrated again.

### 15.5 In words

- The layer is named **`layer.place.areas` = "Neighborhood and city boundaries"** (reworded 2026-09-22 from
  "City and neighborhood outlines"; all four languages). That one string is the switcher's label, the key's row
  and the list's heading, so the three can never drift.
- **The key under the map** (`mapKeyHtml` in `apps/web/src/stylepanel.ts`, formerly `subwayKeyHtml`) carries a
  dotted boundary sample and that name whenever the layer is on, **in either map style**, under the one
  `map.key` heading it shares with the subway rows.
- **"See this map as a list"** gains a section with the same heading, a count, and the area names, bounded at 30
  with `map.list_more` — exactly as the parks section works, and the same answer the Areas tab's list gives.
- Nothing about the outline a person tapped is written down: the selection is a field on the view, the page is
  told through a callback, and `bounds.ts` touches no storage at all.

### 15.6 For the porters

- [x] Web: `bounds.ts`, `map.ts` (one pass), `layers.ts` (defaults + marker), `maplist.ts`, `stylepanel.ts`,
      `style.css` (`--map-bnd` ×4 modes, `.trkey i.bnd`), `apps/web/test/boundaries.test.ts`, the contrast walk
      in `web.test.ts`. Screenshots: `docs/img/map-boundaries/`.
- [x] iPhone (2026-09-22): `HelpCore/Boundaries.swift` with `boundaryBand` / `boundaryStyle` against the same
      table; `MapToken.boundary` carries `--map-bnd` in all four values (`MapStyle.swift`, resolved by
      `MapPalette.swift`); `MapCanvas` draws the pass between the streets and the transit lines, names
      nearest-centre-first through the map's own collision test; `defaultMapLayers` gains the layer and
      `layersVersion` / `migrateMapLayers` do the once-only migration in `state/map-layers.json`; the key row
      and the list section are in `MapScreen.swift`. `areasDrawn` no longer takes a zoom and
      `areaDetailMetersPerPoint` is gone. Tests: `HelpCoreTests/BoundariesTests.swift`, the contrast pairs in
      `MapStyleTests`, and `AppParityTests` reads this table out of `bounds.ts` and out of `Boundaries.swift`.
- [x] Android (2026-09-22): `app/src/main/kotlin/org/help313/app/Bounds.kt` in `:core` (the band table and the
      token in four modes), `MapPalette.boundary`, `map_bnd` / `map_bnd_more` in `res/values{,-night}/colors.xml`,
      the pass in `MapView.drawAreas` with the names in `drawNames` between the streets and the parks,
      `defaultMapLayers` gains the layer and `LAYERS_VERSION` / `migrateLayers` do the once-only migration in
      `files/map-layers.json`, the key row in `MapScreen.mapKey` and the list section in `MapScreen.list`.
      `drawnAreas` no longer takes a zoom and `AREAS_NAME_METERS_PER_DP` is gone. Held to this table by
      `ParityTest`, which reads `apps/web/src/bounds.ts`.
- Four things to get right, because they are where the web went wrong first: the dash is **absolute** and its
  "on" length is never under the stroke width; names are **capped and nearest-first**, not "whatever fits"; the
  migration marker must be written by **every** write of the layer list, not only by the migration; and the
  numbers in 15.1 are the **third** set — take them from the table, and look at your own screenshots before
  believing any of them.

### 15.7 The Areas tab's selection map

Kyle, 2026-09-23: *"the borders on the areas map should be more prominently visible on the selection map by
default."* On the Map tab a boundary sits under the streets, because streets and help are what that map is for.
On the Areas tab's map — the landing and the strip over an area page — a person is **choosing an outline**, so
the outline leads. `areasMapBoundaryStyle(mpp)` is 15.1 with three changes:

| band | neighbourhood | city | dash |
|---|---|---|---|
| `city` | 1.8 | 2.6 | solid |
| `mid` | 2.4 | 3.2 | solid |
| `near` | 3.0 | 3.6 | solid |

- **The streets under it are the quietened basemap** of section 4.3, never with Increase Contrast /
  `prefers-contrast: more`. Quiet streets are what lets a solid outline read as "not a street".
- **Under forced colours the web keeps 15.1**, dashed: there the dash is the only thing left that says so.
- Names, the cap, the colour token, the selected stroke (4.0, the focus colour, solid) and its wash are 15.1's,
  unchanged. The tapped outline is still the heaviest line on the map.
- Built on all three clients: `bounds.ts` / `map.ts` (a map handed `onArea`), `Boundaries.swift` /
  `AreasMapView`, and `Bounds.kt` / `AreaOutlineView` (which draws no streets, so only the widths apply). Tests:
  `apps/web/test/boundaries.test.ts`, `AreasMapBoundaryStyleTests`, `AreasTest`, and the parity readers.
