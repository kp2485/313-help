# Navigation and information-architecture audit — 2026-09-22

Read-only audit of `apps/web`, `apps/ios/HelpApp` and `apps/android/.../org/help313/app` against docs/01, 05, 08,
11, 13, the accessibility audit of 2026-09-20/21 and the category audit of 2026-09-22.

**Method.** Every doc above read; all three clients read in source; the web app built (`pnpm build:bundle`) and
walked live at 375 px and 1280 px with a cleared IndexedDB, so the layer defaults and the Areas landing were
observed rather than inferred; the iPhone app walked on simulator `58DF0CC6`; the Android emulator was not
booted, so Android is audited from source and `apps/android/README.md`. Listing counts come from the freshly
built bundle (531 rows, 302 parks, 52 greenway segments, 11 transport layers).

Two owner directions frame it:

> **Kyle, 2026-09-22 (a):** "The most intuitive way for people to reach their neighborhood is through a map …
> offer the initial neighborhood selection on a map layer."
>
> **Kyle, 2026-09-22 (b):** "This is not a Joe Louis Greenway app; it is just one component of the park system.
> It doesn't need to be as loud as it is on the main page."

---

## Executive summary

The **Help path is in good shape**: food to a phone number is three taps on web and Android, two on iPhone, and
Urgent help is two taps from Home on web and iPhone. Nothing in the crisis path is broken. The ordering rules of
docs/05 hold on all three clients.

Everything *around* the Help path has drifted, in one recognisable pattern: **screens got built, entry points did
not.** Six things are reachable only by typing a name, only by opening a collapsed disclosure, only from inside a
modal sheet, or not at all:

1. **A Hamtramck, Highland Park or Dearborn resident has no area page** — the app tells them, by name, that they
   do not get one, and offers a generic city map instead. Three of our four cities are a dead end on the tab we
   just shipped.
2. **The Areas tab opens on a 205-row alphabetical list.** Nobody navigates a city that way; the outlines are
   already in the bundle and the map code already does point-in-polygon for parks. This is the change Kyle asked
   for and it is cheap.
3. **The Map tab's first open shows no help at all** on all three clients — greenway, parks and DDOT routes, and
   zero listings. The one tab named after the thing on it opens without the thing.
4. **iPhone has no browse-by-type at all**, so 24 listings (`hygiene.shower` 5, `youth` 19) are reachable only by
   free-text search. On web they sit behind a collapsed "Browse every kind of help"; Android has them as cards.
5. **302 City parks have no page.** They are 302 unclickable rows behind "See all 302 parks" on web and a run of
   names inside a sheet on iPhone and Android. Meanwhile **52 greenway segments each have a full screen** with
   help-nearby and condition reporting, a Home tile of its own, a line on every listing detail, a lens on the
   Areas tab, and a line drawn on *every map in the app* whether the screen is about it or not. That is Kyle's
   direction (b) in one paragraph: the greenway is louder than the entire park system it belongs to.
6. **Three clients, three tab bars, three Homes.** Android has six tabs (Search and Saved in the bar); iPhone
   Home has no Map, no Areas and no greenway, orders its quick needs by declaration order so "A place to sleep"
   outranks "Food", and its "Find free help" pushes a *second copy* of the Help tab inside the Home stack.

The recommendations below are one tab set (**Home · Help · Map · Areas**), one Home, an Areas tab whose landing is
a map of the four cities and their neighborhoods with the list as its second view, a Map tab that opens with help
on it, and one "Parks and paths" front door with the greenway as a row inside it.

---

## 1. Shortest path per user type

Taps are counted from a cold launch on Home, on the **web** app at 375 px, and do not count typing or an
operating-system permission dialog (both noted separately). Divergences on iPhone and Android are in the notes.

| User (docs/01) | What they came for | Path today | Taps now | Proposed | Taps after |
|---|---|---|---|---|---|
| Person in crisis — overdose | 911 and the steps | Home → Urgent help → 911 | **2** | unchanged | 2 |
| Person in crisis — not safe at home | DV hotline | Home → Help → "I'm not safe at home" → hotline | **3** | unchanged | 3 |
| Person in crisis — needs to talk | 988 | Home → Urgent help → 988 | **2** | unchanged | 2 |
| One concrete need — food | a phone number | Home → Food → Food today → Call | **3** | unchanged | 3 |
| One concrete need — Narcan | a phone number / an address | Home → Free Narcan → Call | **2** | unchanged | 2 |
| One concrete need — a shower | a place | Home → Help → open "Browse every kind of help" → Showers → Call | **4**, behind a collapsed disclosure | a "Shower or laundry" choice under "Clothes and baby things" (audit K5) | 4, in the open |
| One concrete need — something for a teenager | a place | Home → Help → open disclosure → Young people → Call | **4** (**iPhone: search only, no browse path at all**) | a "Kids and teens" need tile (audit K4) | 3 |
| Helper — "everything near this address" | a list near a ZIP | Home → Map → Type a ZIP → (type) → layer switcher → switch on 8 help layers → See this map as a list | **≈11** + typing | Map's help layers on by default + one "Show everything that helps" button + ZIP | **4** + typing |
| Helper — a place by name | the listing | Home → Search → (type) → card | **2** + typing | unchanged | 2 |
| Rider | fares, a phone number, a trip planner | Home → Map → scroll past map, layers and list | **1** + long scroll (**iPhone/Android: 2** — buried in a modal sheet) | "Getting around" reachable as a row on the Map tab on all three | 2 |
| Cyclist | MoGo and bike lanes | Home → Map → layer switcher → MoGo → bike lanes | **3** | unchanged | 3 |
| Cyclist | a greenway stretch | Home → Joe Louis Greenway tile → stretch | **2** | Home → Parks and paths → Joe Louis Greenway → stretch | **3** (deliberately one more) |
| Family in a park | a named park, where it is, what is in it | Home → Map → scroll → See all 302 parks → **no page exists** | **dead end** | Home → Parks and paths → park (nearest first) → park page | **2** |
| Neighbor — Detroit | their own neighborhood page | Home → Your neighborhood → Use my location → [OS prompt] → row | **3** + prompt | Areas tab (map, you-are-here) → tap the outline → See details | **3**, no prompt needed |
| Neighbor — Hamtramck / Highland Park / Dearborn | their own area page | Home → Your neighborhood → Use my location → "That spot is not in Detroit." | **dead end** | Areas tab → tap the city outline → See details | **3** |
| Speaker of Arabic or Bengali | anything above | same counts; web has a top-bar picker | same | same | same |
| Screen-reader / switch user | anything above | same counts; every map has a list | same | same | same |
| Keyboard user | a place on the map | focus the map → N/P walk → Enter | **3 keys** (web only; **iPhone has no roving focus**) | roving focus on iPhone too | 3 keys |
| Laptop user at a library | anything | side rail at ≥1024 px; same counts | same | same | same |
| First-time visitor, no signal | a phone number | Home shows 911, 988 and the overdose steps — **and nothing else**; the DV hotline, the crisis line, shelter and 211 all come from the bundle | **2** to 911; **dead end** for every other number | hardcode the 211 row and a "no list yet" line naming 211 in the Urgent sheet | 2 |

---

## 2. Findings

### Critical — a user type cannot reach a resource, or a dead end on a crisis path

**C1 · Three of the four cities have no area page, and the app says so by name.**
*Client:* all three. *Screen:* Areas tab → "Your neighborhood".
*Evidence:* `strings/en.json:191` `hood.mine_outside` — "That spot is not in Detroit. Only Detroit neighborhoods
have pages."; `:201` `hood.only_detroit`. Web `apps/web/src/hoods.ts:133` renders that banner plus a button that
goes to the generic Map tab; iPhone `HoodsScreen.swift:188-204`; Android `HoodScreens.kt:300,310`. Hamtramck,
Highland Park and Dearborn are inside the service area (docs/01, Kyle 2026-09-19) and inside
`inServiceArea`/`Locate.kt:27-44`, so a resident there is told they are in the app and then told they are not.
*Fix:* whole-city area pages, exactly as `docs/research/2026-09-22-neighborhoods-three-cities.md` §3 specifies.
See §3 below; `hood.mine_outside` then fires only for a point outside all four outlines and needs rewording.

**C2 · On iPhone there is no browse-by-type at all; 24 listings are reachable only by typing a name.**
*Client:* iPhone. *Screen:* Help tab.
*Evidence:* the web's 19 `CATEGORIES` chips (`apps/web/src/needs.ts:123-143`) have no counterpart anywhere in
`apps/ios/HelpApp`; `home.categories` and `home.see_all` are shipped strings that iOS never reads. `hygiene`
(5 rows) and `youth` (19 rows) have no need screen on any client (category audit 2026-09-22, "Taxonomy
findings"), so on iPhone the only paths to them are `SearchView` (`Views.swift:788`, reached only from the Home
card) and switching on a map help layer. A parent looking for after-school programs, or a young person looking
for the Ruth Ellis drop-in, has to already know the name.
*Fix:* add the browse section to the iPhone Help tab (parity with web/Android), **and** close the underlying gap
with the need tiles recommended in the category audit (K4 "Something for my kids", K5 "Shower or laundry"), which
removes the reliance on browse on all three clients.

**C3 · With no signal on a first visit, the only numbers the app can produce are 911 and 988.**
*Client:* web. *Screen:* Home / Urgent help.
*Evidence:* `apps/web/src/main.ts:331-334` — with no bundle, Home draws `callButton('emg_911')`,
`callButton('emg_988')` and the overdose row. `emergency()` (`main.ts:162-172`) falls back to `HARDCODED`, which
is only those two (`needs.ts:203`); the DV hotline, the DWIHN crisis line, the shelter helpline, Avalon and 211
all come from `emergency.json` in the bundle. The Urgent sheet is a `standsAlone` screen (`main.ts:940`) and so
opens, but with six empty rows. docs/05 promises the sheet's seven numbers "one tap from anywhere". iPhone and
Android ship a snapshot in the app and are unaffected.
*Fix:* hardcode **211** alongside 911 and 988 (it is a three-digit national number, not a bundle fact), and have
the Urgent sheet print one honest line when the list has not arrived: "This phone has not downloaded the list
yet. 911, 988 and 211 always work."

### High — a resource reachable only by search or browse, or a client missing a flow the others have

**H1 · The Areas tab's landing is a 205-row alphabetical list with no map.**
*Client:* all three. *Evidence:* web `hoods.ts:124-146` (observed live: intro, sources, "Your neighborhood",
search box, A–Z / district radio, then 205 rows); iPhone `HoodsScreen.swift:88-115`; Android
`HoodScreens.kt:186-247`. The only map on the whole tab is the static, non-interactive outline on an individual
neighborhood page (`HoodOutlineView`, `isClickable=false`, `HoodScreens.kt:112-159`; `HoodOutlineMap`,
`HoodsScreen.swift:758-790`), and it links *out* to the Map tab, never in.
*Fix:* §3.

**H2 · The Map tab opens with no help on it.**
*Client:* all three. *Evidence:* `DEFAULT_LAYERS = ['place:greenway','place:parks','go:ddot_routes']` —
`apps/web/src/layers.ts:10`, `apps/ios/Sources/HelpCore/MapLayers.swift:101`,
`apps/android/.../MapLayers.kt:127`. Verified live on the web with a cleared IndexedDB: the three boxes ticked
are exactly those, and the "See this map as a list" disclosure has no "places that help" section at all. A person
who taps Map to find food must open the switcher and tick a box before the tab does anything the app is for.
*Fix:* §5, Q4.

**H3 · "Getting around" — fares, reduced-fare ID, phone numbers, trip planners — is inside a modal sheet on both
native clients.** *Client:* iPhone, Android. *Evidence:* iPhone `GettingAround` is rendered only from
`MapListSheet` (`MapScreen.swift:1076`); Android's equivalent lives in the map list screen behind the "≡" chip
(`MapScreen.kt:187,634-709`). On the web it is page content under the map (`main.ts:548`, `transitPanels()`).
A rider who never opens "See this map as a list" never finds the fares.
*Fix:* a "Getting around" row on the native Map tab beside the layers and list controls, opening the same view.

**H4 · 302 City parks have no page, and no client can open one.**
*Client:* all three. *Evidence:* web `parksList()` (`main.ts:552-556`) renders `<div class="row static">` — a
name, an address and a distance, with no link and no `data-go`; there is no `parks` detail `View` in
`router.ts:15-20`. iPhone and Android print park **names** only, as a joined run inside the map list
(`maplist.ts:28`, `MapScreen.swift:1011-1122`, `MapList.kt`). The bundle already carries id, name, address, type,
acres and coordinates per park (`data/bundle/v1/places/parks.json`). Compare: 52 greenway segments each have a
screen, a map, "Help within a 10-minute walk" and a condition report.
*Fix:* §6.

**H5 · Android has six tabs; Search and Saved are in the bar on Android only.**
*Client:* Android. *Evidence:* `MainActivity.kt:455-498` — Home, Help, Map, Areas, Search, Saved places. The web
has Search as a button on Home and Help (`main.ts:252`) and Saved under Help → More (`main.ts:358`); iPhone has
Search only on Home (`Views.swift:331`) and Saved in two places. Six 11-sp tabs at ordinary Arabic text is already
acknowledged as tight in the code's own comment (`MainActivity.kt:417-423`), and the horizontal scroller only
engages above font scale 1.3.
*Fix:* §4.

**H6 · On Android, Urgent help is not reachable from most screens.**
*Client:* Android. *Evidence:* only two entry points exist — the Home button (`Screens.kt:122`) and the Map tab
chip (`MapScreen.kt:182`). From Help, Search, Saved, Areas, any need, refinement, category, listing or area
screen it takes a trip back to Home. docs/05 and Principle 3 say "one tap from anywhere"; the code's own comments
at `Screens.kt:118-121` claim it.
*Fix:* put the Urgent help affordance in the app bar on every non-private screen, as iPhone does
(`Views.swift:194-212`) and as the web's `topBar()`/side rail do.

**H7 · On iPhone, "Find free help" pushes a second copy of the Help tab inside the Home stack.**
*Client:* iPhone. *Evidence:* `Views.swift:338` — `NavRow(... ) { HelpView() }`, rather than `nav.tab = .help`.
Two live instances of the same screen with different Back behaviour, and the Help tab in the bar does not light
up. *Fix:* select the tab.

**H8 · On Android a tab tap destroys the back stack.**
*Client:* Android. *Evidence:* `go(route)` clears the stack (`MainActivity.kt:325-329`) and every tab uses it. A
helper on a listing found through Search who glances at the Map loses the path back. Back from a tab root exits
the app (`:353-358`). Web keeps a per-tab memory stack (`router.ts:93`) — a tab is a fresh start there too, but
the browser's Back still walks the trail. iPhone preserves each tab's `NavigationStack` (observed: the Areas tab
restored a pushed listing detail).
*Fix:* pick one rule and write it in docs/05. Recommended: a tab tap returns to that tab's root; a second tap on
the already-selected tab scrolls to top; the stack is not destroyed.

**H9 · The Joe Louis Greenway lens on Android is unreachable dead code.**
*Client:* Android. *Evidence:* `HoodScreens.kt:188,213-216` implements `lens == "jlg"`, but every construction
site passes no lens (`MainActivity.kt:468`, `Screens.kt:148`, `Screens.kt:648`). Three shipped strings
(`hood.lens_jlg`, `_sub`, `_note`) are drawn by nothing; `hood.lens_jlg_sub` is read nowhere in the repo's
Android sources.
*Fix:* §6 recommends removing the lens row from the Areas landing on **all** clients (keeping the `#/n/lens-jlg`
URL working). On Android that turns dead code into a URL-only path, which is the honest state.

**H10 · Link-outs are absent on both native clients.**
*Client:* iPhone, Android. *Evidence:* iPhone has exactly one (`link.beds.safebeds`, `Help.swift:95`); Android
has the same plus listing websites and source URLs. The web's link sets for unemployment, Michigan Works!, the
child-care scholarship, Lifeline, Medicaid rides, MI Bridges, WIC, Double Up, free state ID, Clean Slate, MARR
and the rest (`apps/web/src/links.ts`) have no native equivalent, and the whole `link.*` family of strings ships
unused on iPhone. Two of the web's refinements are link-only ("Help paying for food", "I lost my job"), so those
two choices simply do not exist on a phone.
*Fix:* a `LinkCard` list on the native refinement/need screens, driven by the same `LINKS` table. This is the
largest single body of missing content on the native apps.

### Medium

**M1 · Home differs on all three clients.** Web: hero, search, alerts, Find free help, 6 quick needs, 3 tiles
(Map, greenway, Your neighborhood), footer. iPhone: hero, alerts, search, Find free help, 6 quick needs, **Saved**,
footer — no Map, no Areas, no greenway. Android: name, hero, **Urgent help button**, Find free help, **4** quick
needs, See all, Your neighborhood, alerts, About — no search, no Map tile. (`main.ts:329-349`;
`Views.swift:311-361`; `Screens.kt:110-169`.) *Fix:* §4.

**M2 · iPhone's quick needs are in the wrong order.** `Views.swift:340` filters the `needs` array by a set of six
ids, so the rendered order is the declaration order of `Help.swift:92-143`, not the order of the literal.
Observed on simulator: **A place to sleep · Help with drugs or alcohol · Food · A doctor · Free Narcan · A job or
training**. docs/05 and both other clients lead with Food. *Fix:* order explicitly.

**M3 · Android's Home alerts heading renders a raw placeholder.** `Screens.kt:156` calls `L.t("alert.from")` with
no parameter; `strings/en.json` defines it as "Starts {when}", so the section heading reads literally
**"Starts {when}"**. *Fix:* use a real heading key.

**M4 · Android's Home has only four quick needs** (`Screens.kt:134-141`: food, shelter, doctor, narcan). Missing:
"Help with drugs or alcohol" and "A job or training". *Fix:* six, as docs/05 says.

**M5 · No Share on either native client.** `canShare` (`apps/web/src/saved.ts`) and the web's `data-share` button
have no iOS `ShareLink` or Android `ACTION_SEND` counterpart. docs/05 lists Share among the detail screen's big
buttons. *Fix:* add, with the same `isPrivate` gate.

**M6 · No ZIP entry on any Map tab.** iPhone says so in code (`MapScreen.swift:253,517`); Android's `ZipBox` is
called from list screens and the Areas tab only; the web's Map tab *does* have the chip (`main.ts:542`). A person
who refuses location on a native Map tab gets words and no alternative, while every list screen offers a ZIP.
*Fix:* the shared location chip on the native Map tabs.

**M7 · Categories with a need screen and no listing in three of the four cities.** From the built bundle, by the
city on the row's address:

| top | Detroit | Hamtramck | Highland Park | Dearborn | no address |
|---|---|---|---|---|---|
| shelter | 7 | **0** | 1 | **0** | 4 |
| treatment | 24 | 1 | 2 | **0** | 0 |
| utilities | 4 | **0** | **0** | **0** | 5 |
| ids | 3 | **0** | **0** | **0** | 0 |
| connect | 2 | **0** | **0** | **0** | 0 |
| goods | 3 | **0** | **0** | **0** | 0 |
| hygiene | 4 | **0** | 1 | **0** | 0 |
| youth | 17 | **0** | 1 | **0** | 1 |
| assault | 3 | **0** | **0** | **0** | 0 |

Results are citywide, so no screen is *empty* — but a Dearborn resident asking for a bed tonight is shown Detroit
shelters with no word that there is nothing in their city. docs/13's honesty rule 6 ("directory coverage is not
service coverage") applies here as much as on an area page.
*Fix:* one line above a results list when the person's location or ZIP is in a city with no listing of that kind:
"We do not list any of these in {city} yet. The nearest are in Detroit."

**M8 · Near-empty need screens.** `connect` 2 rows (after the category audit moved the Main Library out),
`goods.clothes` 2, `goods.baby` 1, `kids.care` 1, `health.vision` 1, `food.benefits` 0. The category audit's
recommendations K2 and K8 are the fixes and are already written; they are navigation findings because "Phone,
internet, or a computer" is a full-width tile on the Help tab of all three clients that leads to two rows.

**M9 · No in-app language switch on either native client.** Intended (native follows the phone), and stated in
both READMEs. It is still a finding for one user type: an Arabic or Bengali speaker using a household phone set
to English cannot reach their language at all on iPhone or Android, while the same person on the web can, in one
tap. *Fix:* not necessarily a picker — a one-line row under About saying which languages the app has and how to
change the phone's language would close most of it honestly.

**M10 · Search behaves differently on all three.** Web and iPhone filter as you type with an announced count
(`main.ts:803`, `.searchable`); Android requires pressing a Search button, caps at 50, and loses its results on a
font-scale change or rotation because the results column is rebuilt only on tap (`Screens.kt:588-598`).
*Fix:* incremental search with the live count, as the other two.

**M11 · No "About this area" link from a greenway stretch on Android**, which web (`main.ts:785`) and the docs
both have. *Fix:* add, or drop the row everywhere (see §6, which keeps it).

### Low

**L1 · Duplicate entries to Saved** on iPhone (Home `Views.swift:344` and Help `:399`) and to the Areas tab on
Android (tab, Home card, About button — all three stack-clearing).
**L2 · Refinement rows reuse the parent's icon on iPhone** (`Views.swift:417`), so the seven-row "drugs" and
"doctor" menus are seven identical glyphs.
**L3 · Android's "Add a place" resets an in-progress form silently** on re-entry (`AddScreen.reset()` at both
entry points).
**L4 · Android process-level singletons** (`AddScreen`, `HoodScreens.byDistrict`, `MapScreen.layersScroll`) keep
screen state for the life of the process with no reset.
**L5 · Events.** The tab hides itself correctly on web and iPhone and does not exist on Android; `EventsView`,
`eventsTab()` and the `events.*` strings all ship. This is the documented state (DECISIONS 2026-09-19) and is
fine — recorded so the asymmetry is not re-found.
**L6 · Android's README says seven help layers**; the code has eight since the category audit
(`MapLayers.kt:25-34`). Doc drift.

---

## 3. Question 1 — Areas on the map. Specification.

### 3.1 The recommendation, in one line

**Keep the tab. Make its landing the map, with the Areas layer on; keep the list as the same screen's second
view; and add Areas as an off-by-default layer on the Map tab too, so a tap on an outline anywhere in the app
opens the same page.**

### 3.2 Why not the two alternatives

*Fold it into the Map tab entirely.* The layer would have to be **on by default** to be found, which fights the
one change the Map tab most needs (H2: it should open with **help** on it, not more chrome). It would also put
two unrelated jobs on one screen — "where is the nearest pantry" and "tell me about my area" — with one shared
camera, one shared layer memory and one shared pick order. And it would strand the tab's own content: the
"we don't rank neighborhoods" statement, the sources line, the A–Z/district index and the search box are page
content, not map furniture.

*Keep the tab exactly as it is (list landing).* This is what Kyle asked us to change, and the walk-through
supports him: the landing observed live is a wall of 205 names in which nobody can find their own area without
either granting a location or already knowing the City's name for where they live ("Pride Area Community",
"Evergreen Lahser 7/8").

*Tab-bar space.* Not a constraint today: Events hides itself, so web and iPhone show **four** tabs, verified live
at 375 px on both. Android shows six and should show four (H5). If Events ever returns, the short label
`tab.hoods` = "Areas" already exists for the 320 px case and is already what both phones draw.

*Cost of a second map.* One more canvas. The basemap is decoded once and cached by checksum (`map.ts:58`), the
camera is per-`key`, and the Areas map draws **no dots, no overlays and no transit** — only polygons already in
`indicators/neighborhoods.json`. It is the cheapest map in the app.

*The rule that sensitive listings never draw* is satisfied trivially: the Areas map has no listing layer at all.
When Areas is switched on as a layer on the Map tab, it adds polygons only; `mapDrawable` and `isSensitive` are
untouched.

### 3.3 What the layer draws

- **Four city outlines** — Detroit, Hamtramck, Highland Park, Dearborn — stroked, never filled with a value.
- **205 Detroit neighborhood outlines**, drawn only from the zoom at which a name fits (reuse the existing
  `showCls` threshold discipline from `map.ts`); below that zoom the city outlines alone.
- **Names** as the map already draws park and street names (`map.ts` label pass, halo, slant-aware).
- **The selected area** highlighted with the existing `outline` stroke plus a light fill at ≤8 % of the land
  colour — never a value-carrying fill. **No choropleth anywhere** (docs/13 honesty rule 1; the research doc says
  the same in §3.1).
- **Hamtramck, Highland Park and Dearborn are whole-city areas** with no children, so inside them the city
  outline is the only outline.
- Nothing else. No help dots, no transit, no greenway.

### 3.4 What a tap does

Reuse the existing pick chain and the existing card. `map.ts` already ends `pick()` with a park hit-test by
point-in-polygon (`inside(X, Y, a.pts)`, `map.ts:726`); areas slot in ahead of it with the same shape:

```
pick order (Map tab, Areas layer on):  listing dot → subway glyph → stop → greenway → route → AREA → park
pick order (Areas tab):                AREA only
AREA resolution: most specific wins — a Detroit neighborhood beats the Detroit city outline.
```

The card is the one the app already shows — `<div class="mappick">` with the name, a sub-line, and a
**"See details"** button that carries the ordinary `data-go` payload `{ v: 'hood', id }`. No new card pattern.
The sub-line is `hood.district` ("District 5") for a neighborhood and the city name for a whole-city area.

The keyboard walk gets them for free: areas become features in `features()` with `kind: 'area'`, ordered after
the greenway and before the dots, announced with the same card, opened with Enter.

### 3.5 "Your neighborhood" from the map

Nothing new is asked of the person. The Map tab's first-open card and the "you are here" dot already exist
(`locate.ts`, `firstOpenAction`), and the Areas tab already computes the answer on the device
(`hoodfind.ts hoodAt`). On the Areas tab:

- If a position or a typed ZIP is already known this visit, the map opens centred on it with the containing area
  **already selected and named**, and the first row under the map is that area — **two taps to the page**.
- If not, the ordinary location chip sits under the map (the same chip, the same handler, as everywhere else —
  `hoods.ts:138` already does this), and the first-open card is **not** repeated here: it belongs to the Map tab,
  and a second copy would be a second permission pattern, which docs/05 forbids.
- A fix outside all four outlines keeps today's honest message, reworded (see 3.7).

### 3.6 The list is the same thing, not a different screen

One screen, two views, one control: **"See this map as a list" / "See this list as a map"**, the wording the Map
tab already uses (`map.list_title`). The list view is today's index, with one addition and one change:

- **Addition:** when a location or ZIP is known, a **"Nearest first"** order joins "A to Z" and "By council
  district" — three radio buttons in the existing `hoodorder` fieldset, computed from the outline centres already
  in the bundle. This is the "list ordered by location" Kyle asked for and it is honest: distance to a centre is
  not a ranking of the place.
- **Change:** the list groups by **city** first (four groups), then A–Z or by district inside Detroit. The
  research doc §3.6 item 5 already calls for `groupHoods` to gain a "by city" grouping and `matchHoods` to cover
  the four city names.

No indicator may reach either function; the existing test that proves it extends to `areas`.

### 3.7 Bundle, strings and shared-rule changes

**Bundle** — exactly the additive shape in `docs/research/2026-09-22-neighborhoods-three-cities.md` §3.5: one
file, `indicators/neighborhoods.json`, gaining `cities[]` (id, name, kind, children, rings, center), `areas[]`
(the non-Detroit-neighborhood pages, each with an explicit `panels` allow-list), and `area_sources`. Existing
keys unchanged; a client that knows nothing of them prints exactly what it prints today. Budget **+3 to +5 KB
gzipped** on a file that is fetched only when the Areas tab opens.

For the layer specifically, nothing more is needed: `rings` are already delta-encoded against `origin` and
`outline()` (`hoods.ts:61`) already decodes them.

**Shared rules** (`packages/query` semantics; `hoodfind.ts` / `HelpCore/Hoods.swift` / `Hoods.kt`):
1. `hoodAt` → `areaAt`: test four city boxes, then the neighborhoods of the city that hit. Cheaper than today.
2. `hoodsForZip` → `areasForZip`, able to return more than one answer and to say why (48203 is Highland Park
   *and* a Detroit neighborhood).
3. `matchHoods` covers the four city names; `groupHoods` gains `city` and `near`.
4. **Fixtures first** (CLAUDE.md build order): city-boundary cases, an enclave case for Hamtramck and for
   Highland Park, a straddling-ZIP case and an outside-all-four case added to `schema/neighborhoods/points.json`
   **before any screen changes**, with all three clients passing.

**Strings** (`strings/en.json` + `es`, with `ar`/`bn` machine drafts into the native-review queue):
- `hood.mine_outside` — reword: fires only outside all four cities. Draft: "That spot is outside Detroit,
  Hamtramck, Highland Park and Dearborn. This app only covers those four."
- `hood.only_detroit` — replace: "Detroit has a page for each of its 205 neighborhoods. Hamtramck, Highland Park
  and Dearborn have one page each, because those cities do not publish neighborhood outlines."
- `hood.city_page_note` — new, on every non-Detroit area page, verbatim from the research doc §3.3: "These
  numbers come from regional and national sources, because {city} does not publish its own. They are not the same
  measurements as Detroit's page, so the two pages should not be read side by side."
- `hood.order_near` — new: "Nearest first".
- `hood.group_city` — new: "By city".
- `map.list_as_map` — new: "See this list as a map".
- `layer.place.areas` — new: "City and neighborhood outlines".
- `tab.hoods_wide` — change from "Neighborhoods" to **"Neighborhoods and cities"** (the side rail, the window
  title and the screen heading); `tab.hoods` stays "Areas".
- Remove from the Areas landing: `hood.lens_jlg` / `_sub` rows (see §6); keep the keys for the URL-reachable
  lens screen.

**Per-client work**

| | Work |
|---|---|
| **Web** | `map.ts`: `areas?: { id, name, kind, rings, sub }[]` on `MapSpec`; draw pass after parks and before labels; name labels; selected highlight; `pick()` step; `features()` entry. `hoods.ts`: the landing becomes map + view switch + the existing index; three order radios; city grouping. `layers.ts`: add `place:areas` to the Map tab's menu (off by default). `router.ts`: unchanged — `#/n` and `#/n/<id>` already exist, and `#/n/cty_hamtramck` parses under the existing `[\w.-]+`. |
| **iPhone** | `HoodsScreen.swift`: the index gains a `MapCanvas`-backed area map at the top and a view switch; reuse `MapCanvas`/`MapPalette` rather than the Map tab's full `MapSurface`. The existing `HoodOutlineMap` becomes the selected-area case of the same view. Add the layer to `MapLayersSheet`. Keep `.searchable`. |
| **Android** | `HoodScreens.kt`: `HoodOutlineView` generalises to an `AreaMapView` with hit-testing and virtual accessibility nodes per area (the Map tab already has that pattern in `MapView.kt`). Add the layer to `MapLayers.kt` + the layers screen. Add the "Nearest first" order. |

### 3.8 Tap counts, before and after

| | Now | After |
|---|---|---|
| **A Detroiter reads about their own neighborhood** | **3 taps + an OS location prompt** (Home tile → Use my location → Allow → tap the row), or 2 taps + reading/typing against a 205-row list if they refuse | **3 taps, no prompt required** (Areas tab → tap the outline you recognise → See details) — and **2 taps** when a location or ZIP is already known this visit, because the map opens with the area selected and its row first |
| **A Hamtramck resident reads their city's page** | **impossible** — "That spot is not in Detroit. Only Detroit neighborhoods have pages." | **3 taps** (Areas tab → tap the Hamtramck outline → See details), or **2** with a location or ZIP already known |

---

## 4. Question 2 — the tab set and Home

### 4.1 One tab set, all three clients: **Home · Help · Map · Areas**

Events stays as it is: code kept, tab hidden while the bundle carries none (DECISIONS 2026-09-19). Android drops
Search and Saved from the bar.

| User type | Why this set |
|---|---|
| Person in crisis | Urgent help is in the bar/top bar on every screen, not a tab — it must not compete for one of four slots. Help is the second tab, left of centre, reachable by thumb. |
| One concrete need | Home's six shortcuts and Help's three groups are the whole path; a fifth tab would push Help's tile grid down. |
| Helper | Search does not need a tab: a helper arrives with a name or a street, and Search is the first control on Home and the first on Help. Saved is a return visit, not a front door — Help → More is right. |
| Rider, cyclist | Map is one tab and carries all eleven transport layers plus Getting around. |
| Family in a park | Map, and the new Parks and paths entry from Home (§6). |
| Neighbor | Areas is the fourth tab, and its landing is now a map (§3). |
| Arabic / Bengali | Four labels fit at 320 px in all four languages; six do not, which Android's own code comment concedes. |
| Screen reader / switch | Four targets, each with a full spoken name (`tab.hoods_wide`); Android's stack-clearing tab behaviour is fixed under H8. |
| Large text | Four tabs wrap to two lines at 320 px without a horizontal scroller; six need one. |

### 4.2 One Home, all three clients

Top to bottom:

1. **Hero** — `home.hero` + `app.tagline`.
2. **Bundle-age banner**, when there is one.
3. **Search by name or street**.
4. **Active alerts**, newest first, each with its call buttons and "Until {when}".
5. **Find free help** → *selects the Help tab* (not a pushed copy — H7).
6. **Six quick needs, in this order**: Food · A place to sleep · A doctor · Help with drugs or alcohol · Free
   Narcan · A job or training. (Fixes M2 on iPhone and M4 on Android.)
7. **Two tiles**: **Map** ("Help, parks, buses and paths") and **Your area** ("Help nearby, homes, streets").
   The greenway tile is **removed** — see §6.
8. **Footer**: "Updated {date}" · About this app · Your privacy.

Removed from Home: the Saved row (iPhone — it stays under Help → More), the Urgent help *button in the page body*
(Android — it belongs in the bar, H6), the greenway tile (web).
Added to Home: search (Android), the Map and Your-area tiles (iPhone), two more quick needs (Android).

---

## 5. Questions 3 and 4 — the Help flow and the Map tab

### Q3 · Help flow

**Screen count.** Help tab → need → (refinement) → results → detail = at most **four** screens after the tab, and
three of the four are optional: 9 of 23 needs have a refinement list, 13 go straight to a list, and
`overdose_now` goes straight to 911 and the steps. From Home a quick need skips the tab, so food to a Call button
is three taps (two on iPhone, where the result card itself carries the number).

**Refinements that always have one option: none.** Checked on all three clients — the minimum is two everywhere
(`needs.ts:62-119`, `Help.swift:92-143`, `Needs.kt:49-145`). The web's link-only choices ("Help paying for food",
"I lost my job") are the only single-purpose rows, and they are extra options, not lone ones. Two of them are
simply absent on the native clients (H10), which is the real defect.

**Screens that duplicate a Home shortcut.** All six quick needs open the same `NeedView`/`need()` as their Help
tab row — that is the design and it is fine. The real duplicates are iPhone's second `HelpView` (H7), iPhone's two
Saved rows and Android's three Areas entries (L1).

**Categories with a need screen and no results in some city.** Table at M7. Nine top-level kinds have nothing at
all in Dearborn, eight nothing in Hamtramck. Fix: one honest line above the results.

**"Everything near this address".** The Map's list plus ZIP is the answer on paper and is not findable in
practice: it costs about eleven taps (see §1) because no help layer is on by default and the list is behind a
collapsed disclosure. Recommended fixes, in order of value:
1. Ship help layers on by default (Q4 below) — this alone takes the path from ~11 taps to 4.
2. Add **"Show everything that helps"** / **"Show nothing"** buttons inside the "Free help" fieldset, which set
   or clear all eight group ids in one write (`setLayers` already exists, `layers.ts:24`).
3. Say so where a helper will see it: one line under the search box on the Help tab — "Looking for everything
   near one address? Use the Map and type a ZIP code."

### Q4 · Map tab

**Layer defaults on first open — change them.** Today: greenway, parks, DDOT routes; zero listings (H2). The tab
opens as a street map with a green line on it.

> **Recommended default: `help:food` · `place:parks` · `go:ddot_routes`.**

Food is the largest layer (141 rows), the most-asked-for need, and the one whose value is obviously spatial.
Parks stay because they are the other thing a map is for. DDOT routes stay because they are how people get to
either. **The greenway comes off the default** — it is one path inside a 302-park system (§6), it is on the
default today only because it was the Recreation tab's headline, and it is one tap away in the switcher. Health
and Narcan (167 rows) is the obvious second candidate; two help layers on at once is legible at city zoom, and if
the owner prefers a busier first view it should be `help:food` + `help:health`.

**Standard / Subway placement.** Correct where it is on all three — inside the layer panel, immediately above
"Getting around", because it only changes how transport is drawn. Keep it hidden when the bundle carries no
`.net.json` (already true on all three). No change.

**The list alternative.** Web: a `<details>` collapsed by default, inside the side column. iPhone and Android: a
modal sheet behind an icon-only chip. Recommendation: keep the disclosure on the web but **open it by default
when no help layer is on**, so a map with nothing on it is never the whole screen; on native, keep the sheet but
give the chip a visible text label ("List"), because an icon-only control is the single hardest thing to find on
those two tabs and it is the accessibility equivalent of the whole map.

**Transit facts under the map.** Right on the web (page content). Wrong on native (H3): move "Getting around" to a
labelled row on the Map tab that opens the same view.

**Full-screen mode.** Web has a toggle with a proper `role="dialog"`, inert page, cloned Urgent help bar and
Escape (accessibility audit fix #13). iPhone is permanently full-screen with floating controls — a different but
coherent answer. **Android has no full-screen mode at all** and no need for one, since its map is already
edge-to-edge. No change recommended; record the difference in docs/05 so it is not re-found as a bug.

**"Getting around" content.** Keep as is (fares, reduced-fare ID, free rides, phone numbers, planners, MoGo
Access Pass, the Transit app hand-off). One change: it should be reachable in two taps on every client.

**Should Events be a layer?** **No.** There are no events (DECISIONS 2026-09-19), and when a feed arrives an
event is a *time* first and a place second — it belongs on a day-grouped list, which is what the hidden tab
already is. A layer whose contents change hourly also breaks the tab's one promise, that every map is a list you
can read offline. Revisit only if the City publishes a feed with stable coordinates.

---

## 6. Kyle's direction (b) — the greenway is one part of the park system

### 6.1 What is loud today

| Where | Joe Louis Greenway (52 segments, 20 open) | City parks (302) |
|---|---|---|
| Web Home | **One of three tiles**, with a live count: "20 parts of the Joe Louis Greenway are open" (`main.ts:345`, `home.rec_sub`) | **Nothing** |
| Web Map tab lede | named in `map.lede`: "See help, parks, **the greenway**, and ways to get around" | named |
| Web Map tab body | an `<h2>Joe Louis Greenway</h2>` + a full-width `feature` button, **above** parks (`main.ts:544`) | `<h2>City parks</h2>`, five nearest as **static, unclickable rows**, then "See all 302 parks" (`main.ts:545-546`) |
| Layer switcher | first item in "Parks and paths"; **on by default** | second item; on by default |
| Every other map in the app | **drawn on all of them** — `mapBox()` adds `bundle.greenway.segments` unless a caller opts out, and only the greenway screen ever does (`main.ts:661`). It is on the listing-detail map, the results-list map, the parks map and the neighborhood-outline map | drawn too, but as ground, not as a feature |
| Listing detail | a dedicated row: "{miles} mi from the Joe Louis Greenway ({segment})", within half a mile (`main.ts:650`) | no "nearest park" row exists |
| Areas tab | a lens row, "Neighborhoods along the Joe Louis Greenway", on the landing **and** inside the list (`hoods.ts:144,156`) | none |
| Area page | `hood.in_jlg` line + `hood.greenway_open` count | `hood.parks` count |
| Own screens | a greenway screen **and 52 segment screens**, each with a map, cross streets, "Help within a 10-minute walk" and a condition report | **no park screen of any kind** |
| iPhone | no Home tile; `GreenwayView` + `SegmentView` reachable only from the map list sheet | names only, inside the same sheet |
| Android | no Home tile; stretch screens from a map tap or the map list; a dead JLG lens (H9) | names only |
| README | "Cyclists and MoGo users — MoGo stations, bike lanes and the Joe Louis Greenway, **segment by segment**" | "Families and older adults — 302 parks, recreation centers…" |

The imbalance is a web-and-data artefact: the greenway arrived with a segment-level dataset and a
condition-report flow (docs/11) while parks arrived as a flat point layer, so the greenway got screens and parks
got a list. Nothing about the city justifies it.

### 6.2 What to do

**One front door called "Parks and paths", with the greenway as a row inside it.**

| | Before | After |
|---|---|---|
| **Home tile 2** | "Joe Louis Greenway — 20 parts … are open" | **"Parks and paths"** — "302 parks, rec centers and the Joe Louis Greenway" → the new Parks screen |
| **New Parks screen** | — | nearest parks first (location/ZIP chip), each row a **link to a park page**; then "Recreation centers and libraries" (the 20 `rec` listings, as cards); then **one row**: "Joe Louis Greenway — 20 of 52 parts open" → today's greenway screen, unchanged, with its 52 segment screens and their condition reports unchanged |
| **New park page** | — | name, type, acres, address, a small map, **Directions** and **Bus directions**, the nearest recreation center, and the greenway stretch when one is within half a mile. All of it is already in `places/parks.json` |
| **Map tab body** | `<h2>Joe Louis Greenway</h2>` feature button, then `<h2>City parks</h2>` | one `<h2>Parks and paths</h2>`: nearest parks, "See all 302 parks", then one greenway row |
| **Map layer group** | greenway first, parks second, both on by default | **parks first and on by default; greenway second and off by default** (§5 Q4). Group label "Parks and paths" is already right |
| **`map.lede`** | "See help, parks, **the greenway**, and ways to get around, all on one map." | "See help, parks and paths, and ways to get around, all on one map." |
| **Every map's default** | `mapBox()` draws greenway segments unless told not to | inverted: `mapBox()` draws them only when **asked**. Keep them on: the Map tab (layer on), the greenway screen, a segment screen, a park page whose park touches an open stretch. Drop them from: the results-list map, the listing-detail map, the parks map, the area-outline map |
| **Listing detail row** | greenway-only: "{miles} mi from the Joe Louis Greenway ({segment})" | one row, "Near a park or path", showing whichever of {nearest open greenway stretch, nearest park} is closer, within a quarter mile. The greenway keeps its link; a park gets one |
| **Areas landing** | a "Neighborhoods along the Joe Louis Greenway" lens row | **removed** from the landing and from `hoodList` on all three clients. The `#/n/lens-jlg` URL keeps working, and the lens keeps its own note. (On Android this row never existed — H9.) |
| **Area page** | keeps `hood.in_jlg` and `hood.greenway_open` | unchanged — one line among parks, rec centers and bus stops is the right weight |
| **README / docs/05 / docs/01** | greenway named ahead of parks in the Map description and in the cyclist row | swap the order; docs/01 line 30 "Find recreation: the Joe Louis Greenway, City parks, and rec centers" → "Find recreation: 302 City parks, recreation centers and the Joe Louis Greenway" |

**Copy to cut:** the Home tile's live open-segment count (`home.rec_sub`) — a number that changes as the City
builds is exactly what makes the tile feel like the app's headline. The Map tab's `feature` button for the
greenway. The greenway's name from `map.lede`. The lens row's two strings from the Areas landing.

**What does not change:** the greenway screen, the 52 segment screens, `gw.help_along` ("Help within a 10-minute
walk"), cross streets, the phase key, and the condition-report flow of docs/11 — all correct, all kept, all now
reached through Parks and paths.

**Tap counts.**

| | Now | After |
|---|---|---|
| To a named park's page | **dead end** (a static row in a 302-row list) | **2 taps** (Home → Parks and paths → park, nearest first) |
| To the parks list at all | 2 taps + a scroll past the greenway section | 1 tap |
| To a greenway stretch | **2 taps** (Home tile → stretch) | **3 taps** (Home → Parks and paths → Joe Louis Greenway → stretch) |
| To the greenway on a map | on by default, everywhere | 2 taps (Map → layer), and it is still drawn on its own screens |

That is the rebalance: a park goes from unreachable to two taps; the greenway goes from two to three and stops
appearing on maps that are not about it.

*Not in scope and worth recording:* the Detroit Riverwalk and the Dequindre Cut are **not in the data as paths**
— `places/parks.json` has "Dequindre-Emery" and "Dequindre-Grixdale" as small parks, and no Riverwalk row at all.
Belle Isle is one row with no acreage detail. Presenting "the park system" honestly at some point means naming
that gap on the Parks screen rather than implying the 302 rows are everything.

---

## 7. Question 5 — cross-client consistency

✓ present · ◐ partial or differently placed · ✗ absent. "Should change" names the client to move, not the design.

| Screen / flow | Web | iPhone | Android | Should change |
|---|---|---|---|---|
| Tab set | Home·Help·Map·Areas (+Events hidden) | same | **6 tabs** (+Search, +Saved) | **Android → four** (H5) |
| Home: search | ✓ | ✓ | ✗ | **Android** (M1) |
| Home: alerts | ✓ | ✓ | ◐ heading renders `{when}` | **Android** (M3) |
| Home: quick needs | ✓ 6, food first | ◐ 6, **wrong order** | ◐ **4** | **iPhone** (M2), **Android** (M4) |
| Home: Map tile | ✓ | ✗ | ✗ | both native (M1) |
| Home: Areas tile | ✓ | ✗ | ✓ | **iPhone** |
| Home: greenway tile | ✓ | ✗ | ✗ | **web → remove** (§6) |
| Home: Saved row | ✗ (under Help) | ✓ duplicate | ✗ (a tab) | **iPhone → remove** (L1) |
| Help: Right now / This week / Work | ✓ | ✓ | ✓ | — |
| Help: browse by type | ◐ behind a collapsed disclosure | **✗** | ✓ 19 cards | **iPhone** (C2); web should open the disclosure when a need tile cannot serve |
| Help: Saved / Add a place under More | ✓ | ✓ | ◐ Add only | Android, with H5 |
| Need → refinement → results → detail | ✓ | ✓ | ✓ | — |
| Link-outs on need screens | ✓ ~21 sets | ✗ (1) | ✗ (1) | **both native** (H10) |
| `hygiene.shower` reachable | ◐ browse only | **✗ search only** | ◐ browse only | all — add the need tiles (K5) |
| `youth` reachable | ◐ browse only | **✗ search only** | ◐ browse only | all — add the need tiles (K4) |
| Events | ◐ hides itself | ◐ hides itself | ✗ no code | fine as is (L5) |
| Map: layer switcher | ✓ inline | ✓ sheet | ✓ screen | — |
| Map: default layers | ◐ no help | ◐ no help | ◐ no help | **all three** (H2) |
| Map: Standard / Subway | ✓ | ✓ | ✓ | — |
| Map: see as list | ◐ collapsed disclosure | ◐ modal, icon-only chip | ◐ modal, icon-only chip | label the native chips |
| Map: transit facts | ✓ page content | ✗ sheet-only | ✗ sheet-only | **both native** (H3) |
| Map: ZIP entry | ✓ | ✗ | ✗ | **both native** (M6) |
| Map: full screen | ✓ toggle + dialog | ◐ always full | ✗ (edge-to-edge) | none — document it |
| Map: keyboard walk (N/P) | ✓ | **✗** | ✓ hardware keyboard | **iPhone** |
| Greenway screen + segments | ✓ from Home and Map | ◐ map list sheet only | ◐ map tap / map list only | after §6, all reach it via Parks and paths |
| Greenway lens on Areas | ✓ | ✗ | ✗ dead code (H9) | **web → remove** (§6) |
| "About this area" from a stretch | ✓ | ✗ | ✗ | both native (M11) |
| Park detail | **✗** | **✗** | **✗** | **all three** (H4) |
| Area pages (Detroit) | ✓ | ✓ | ✓ | — |
| Area pages (other 3 cities) | **✗** | **✗** | **✗** | **all three** (C1) |
| Area landing as a map | ✗ | ✗ | ✗ | **all three** (§3) |
| ZIP entry on lists | ✓ | ✓ | ✓ | — |
| Saved | ✓ Help → More | ✓ two places | ✓ a tab | consolidate under Help → More |
| Search | ✓ incremental + count | ✓ incremental | ◐ button-driven, loses results | **Android** (M10) |
| Share | ✓ | ✗ | ✗ | **both native** (M5) |
| Quick exit | ✓ | ✓ | ✓ | — |
| Add a place | ✓ | ✓ | ✓ | — |
| Urgent help on every screen | ✓ (top bar / side rail) | ✓ (toolbar) | **✗ two screens only** | **Android** (H6) |
| Bus directions (browser trip plan) | ✓ | ◐ Directions + Transit-app link only — no browser trip plan (observed on simulator) | not found in the detail screen — confirm | both native |
| Language switch | ✓ picker | ✗ follows the phone | ✗ follows the phone | intended; see M9 |
| Tab tap behaviour | fresh start, Back still walks | preserves each tab's stack | **destroys the stack** | **Android** (H8) |

---

## 8. Question 6 — language, accessibility, offline

**Arabic and Bengali.** Paths are the same length in all four languages: nothing in the IA is keyed to a string.
The web mirrors in logical properties with no second stylesheet and the map never mirrors, which is right. Two
findings. (a) **Android's tab bar only scrolls above font scale 1.3** (`MainActivity.kt:453`), so six tabs at
ordinary Arabic text still share the width equally — the code's own comment concedes it; dropping to four tabs
(H5) removes the problem rather than papering over it. (b) **Neither native client can be switched to Arabic or
Bengali at all** on a phone set to English (M9). Also still open from CHECKS-2026-09-20 §7: **searching in Arabic
or Bengali returns nothing**, because every listing is written in English, and the empty state has no honest line
about it yet — that is a navigation dead end for the exact user the search box is most useful to, and its wording
waits on the native reviewer.

**Screen reader.** The web is in good shape: a skip link, one live region outside `#app`, per-screen titles named
by purpose on traceless screens, `h1` focus on every navigation, no skipped heading levels, and the map's roving
focus announced through the map's own region. Gaps: **iPhone has no roving focus on the map canvas** (the web's
O4 fix has no iOS counterpart in `MapCanvas.swift`), so the picture is dead to VoiceOver and the list sheet is
the only equivalent — which is exactly the argument the 2026-09-20 audit rejected for the web. On Android, a tab
tap destroys the stack (H8), which for a screen-reader user means the Back gesture stops meaning what it meant a
moment ago.

**Keyboard.** Web: Tab always leaves the map, arrows pan, N/P walk, Enter opens, Escape steps out — verified in
`mapKey` and its tests. The Areas layer must join `features()` so the same three keys reach an area; nothing else
about the walk changes. Android has a hardware-keyboard walk. iPhone has none.

**2× text.** The web reflows at 320 px with the 1.4.12 override applied and nothing clips (accessibility audit
§1a). The one place the recommendations here add pressure is the Areas landing, which gains a map above the
index: the map must have a `min-height` in `rem` and must not push the search box off the first screen at 200 %.
Android's six tabs at 2× need the scroller; four do not.

**Offline, first open.** iPhone and Android ship a snapshot and are fine. The web needs one online visit, and
what it can do with none is 911, 988 and the overdose steps — **not** the DV hotline, the crisis line, shelter or
211 (C3). Everything else degrades honestly: the bundle-age banner, the "could not load" retry with exponential
backoff, per-layer failure lines with "Try again", queued reports and proposals, and the language switch that
says out loud when a language file cannot be fetched. After a first visit, every screen in this audit works
offline except the transport layer files a person has never switched on, which say so.

---

## 9. Prioritised implementation list

**First — the dead ends (this sprint)**

1. **C1 · Whole-city area pages for Hamtramck, Highland Park and Dearborn.** Blocked on one owner decision: the
   SEMCOG licence (research doc §4, question 1), which most of those three pages depend on. Fixtures first.
2. **C2 · Browse-by-type on the iPhone Help tab**, plus the K4/K5 need tiles on all three so `youth` and
   `hygiene.shower` stop depending on browse at all.
3. **H2 · Map layer defaults** → `help:food` · `place:parks` · `go:ddot_routes`. One constant per client, three
   tests. The single cheapest improvement in this document.
4. **C3 · Hardcode 211; honest line in the Urgent sheet when the list has not arrived.**
5. **H6 · Urgent help in the Android app bar on every non-private screen.**

**Second — Areas on the map (§3)**

6. Bundle: `cities[]`, `areas[]`, `area_sources`; fixtures in `schema/neighborhoods/points.json`; `areaAt`,
   `areasForZip`, `matchHoods`, `groupHoods` on all three clients — **before any screen**.
7. Web: the area polygon layer in `map.ts`, the Areas landing as map + list with a view switch, "Nearest first",
   grouping by city, `place:areas` on the Map tab.
8. iPhone and Android: the same, on their own canvases.
9. Strings: the eight keys in §3.7, with `ar`/`bn` drafts into the native-review queue.

**Third — parks over the greenway (§6)**

10. Web: the Parks and paths screen, the park page, the Home tile swap, the Map tab body, `map.lede`, the
    inverted `mapBox()` greenway default, the "Near a park or path" row, the lens row removed.
11. Layer order and defaults inside "Parks and paths".
12. iPhone and Android: the Parks screen and park page; "Getting around" as a labelled row (H3).
13. README, docs/01 line 30 and docs/05's Map section reordered.

**Fourth — client parity**

14. **H10 · Link-outs on the native clients**, driven by the same `LINKS` table. Largest body of missing content.
15. **H5 · Android to four tabs**; Search on Home and Help, Saved under Help → More.
16. **H7 · iPhone's "Find free help" selects the Help tab**; **M2** quick-need order; **M4/M3** Android Home.
17. **H8 · One tab-tap rule**, written into docs/05 and implemented on Android.
18. **M5 · Share** on both native clients; **M6 · ZIP on the native Map tabs**; **M10 · incremental Android
    search**; **M11 · "About this area" from a stretch**.
19. **H4** is delivered by step 10; **H9** by step 10's lens removal.

**Fifth — honesty and polish**

20. **M7 · "We do not list any of these in {city} yet"** above a results list, driven by the person's city.
21. **M8 · K2 and K8** from the category audit, so "Phone, internet, or a computer" is not a tile leading to two
    rows.
22. iPhone roving focus on the map canvas (parity with the web's O4).
23. The Arabic/Bengali empty-search line (CHECKS-2026-09-20 §7), wording from the native reviewer.
24. **L1–L4, L6** — duplicate entries, refinement icons, Android form reset and singletons, README layer count.

**Deferred, with reasons**

- **Events as a map layer** — no. See §5 Q4.
- **A language picker on the native clients** — the phone's own setting is the right mechanism; ship the
  explanatory row under About instead (M9).
- **Android full-screen map** — not needed; the map is already edge-to-edge.
- **Dearborn census-tract pages** — a separate decision, per the research doc §3.2, and probably "no" on today's
  sources.
- **The Riverwalk and the Dequindre Cut as paths** — not in the data; name the gap before filling it.
