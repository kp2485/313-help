# Accessibility audit — 313 Help web app, 2026-09-20

Full pass against **WCAG 2.2 Level AA** of `apps/web/` (every screen) and a lighter pass over `admin/`.
Method: (a) code review, criterion by criterion; (b) the app running at `localhost:5173` — accessibility tree
on every screen, keyboard-only walks, the full-screen map, both themes, 320 px reflow, 200 % text, the
1.4.12 text-spacing override, and contrast computed numerically from the tokens in `apps/web/src/style.css`.

**Result on 2026-09-20: 44 pass · 21 failures found and fixed · 4 open.** The fixes that can be held still are
guarded by 23 new tests in `apps/web/test/web.test.ts` (`describe('accessibility: …')`) and
`apps/web/test/router.test.ts`.

> **Second pass, 2026-09-21 — the four open items are closed.** They were accepted on 2026-09-20 only because
> nobody had a fix on the table that did not cost more than it bought. All four now have one; six more defects
> were found on the way and fixed with them. **Result today: 0 open.** What is left is
> [what only a person can settle](#5-what-a-real-assistive-technology-user-still-has-to-test), which is a
> roadmap item and now has a script of its own: [ACCESSIBILITY-TEST-SCRIPT.md](ACCESSIBILITY-TEST-SCRIPT.md).
> Everything below from 2026-09-20 is left exactly as it was written; §1a, §2 and §5 carry the second pass.

Screens covered: Home · Help (every need screen, every refinement, the triage rows) · results lists ·
listing detail (including the address-less `sal_wws_*` rows and the private/sensitive listings with quick
exit) · Urgent help · overdose steps · search · ZIP entry · Saved · Add a place · both report flows ·
Map tab (layer switcher, "See this map as a list", canvas map, full screen, greenway, segment, parks) ·
neighbourhood pages · About/privacy including the key reset · offline, first-load, error and update states ·
language switch · both themes · the ≥1024 px side rail · print.

---

## 1. What was wrong, and what was done

### Fixed (21)

| # | SC | What was wrong | Fix |
|---|----|----------------|-----|
| 1 | 2.4.2 Page Titled (A) | `document.title` was `313 Help` on every screen. A browser tab, a window list and a voice command ("switch to…") all named the app, never the screen. | `main.ts` `render()` sets `<title>` per screen. A screen that must leave no trace (`hashFor` returns null: every need screen, search, saved, a DV/crisis/treatment listing) keeps the plain app name, because a browser may put a title in its own history list. |
| 2 | 4.1.3 Status Messages (AA) | Every `role="status"` was rebuilt by `app.innerHTML = …`. A live region created with its text already in it is not announced, so nothing the app did without changing screen was ever heard: report sent, report queued offline, place saved, key reset, ZIP not known, location refused, layer switched, language switched, proposal sent. | One live region, made once, appended to `document.body` outside `#app` (`announce()` in `main.ts`). Every one of those actions now calls it. `main.ts:*` — guarded by a test that there is exactly one `role="status"` left in the source. |
| 3 | 4.1.3 / 2.4.3 | The search results **were** a live region: every keystroke read the whole list again. | `#searchout` is no longer live. A short `#searchsay` count ("140 places found.") is, and it is the same element on every keystroke. `search.count` in both languages. |
| 4 | 2.4.3 Focus Order (A) | 11 handlers called `render(false)`, which replaces the whole page. Focus fell to `<body>`: after tapping "Still open", "Save", "Show these on a map", "Use my location", a ZIP, or the language switch, a keyboard or switch user restarted at the top of the page. | `refocusSel` — the handler names where the cursor goes, `render()` puts it there. The report thank-you and the key-reset banner are `tabindex="-1"` and take the cursor, since the button they replace is gone. |
| 5 | 3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA) | "Add a place" showed one banner ("Please fill in the name, the kind of help…") and nothing on the fields. No `aria-invalid`, no per-field message, no focus move. | Each empty required field gets `aria-invalid`, a 2 px red border **and** a sentence beside it (`add.e.*`, four new keys ×2 languages); the cursor goes to the first one. |
| 6 | 3.3.7 Redundant Entry (AA) | *Introduced by fix #5 and then fixed:* redrawing the form to show the errors wiped everything already typed. | `addValues` holds what was typed, in memory only; every field and radio comes back filled. Cleared when the screen is left or the proposal goes. |
| 7 | 1.4.11 Non-text Contrast (AA) | `--line` (#d9e3dc light / #25362d dark) drew the outline of every control *and* every divider, at **1.31:1 / 1.34:1**. An empty text box, a chip, an outline button and a map tool had nothing else to show they were there. | New `--edge` token (**3.38:1 / 3.31:1**, computed) for anything you press or type in; `--line` stays for dividers. Applied to inputs, textareas, the file picker, `.pick`, `.chip`, `.btn.ghost`, `.searchbtn`, `.urgent`, `.iconbtn`, `.maptools`, `.mappan`, `.kinds button`, `.quick.tiles`, `button.row`, `.feature`, the tab bar's edge — and to `admin/admin.css`. |
| 8 | 1.4.3 Contrast (AA) | The hero paragraph was `rgb(255 255 255 / .88)` over a gradient whose lightest stop was `#15935d`: **3.39:1** (white itself would only have reached 3.92:1). Normal-size text needs 4.5. | Gradient stop → `#0f7d4e`, paragraph → solid white: **5.17:1**. A test reads the stop out of the CSS and checks it. |
| 9 | 1.4.11 | Map main roads **2.02:1**, freeways **1.75:1** against the land fill — the two lines people actually orient by. | `--map-main` → `#7e8881` / `#63796c` (**3.46 / 3.62**), `--map-fwy` → `#a87c18` / `#907640` (**3.57 / 4.05**). |
| 10 | 1.4.11 | The city boundary was a **1.20:1 / 1.13:1** change of fill and nothing else. | `map.ts` also strokes the boundary with `--map-main`. |
| 11 | 2.5.7 Dragging Movements (AA) | The map could only be panned by dragging. Zoom had buttons; panning had none. | Four arrow buttons (`.mappan`, bottom-inline-start of every map frame), labelled, 36 px, logical positioning, mirrored in RTL, hidden in print. |
| 12 | 2.1.1 Keyboard (A) / 1.1.1 | The canvas took arrow keys and `+`/`-` but said so nowhere. | A visually-hidden paragraph (`map.keys`) tied to the canvas with `aria-describedby`, in both languages. |
| 13 | 2.4.11 Focus Not Obscured (AA), 2.1.2 No Keyboard Trap (A) | The full-screen map was a `position:fixed` box over a page that stayed fully focusable. Tab walked into invisible controls behind it; Escape closed it but the cursor went nowhere. | `role="dialog"` + `aria-modal`, everything outside the box made `inert`, focus to the canvas on open and back to the button that opened it on close, `inert` released in `destroy()`. Verified live. |
| 14 | 2.4.11 | At ≥1024 px the skip button, when focused, sat on top of the rail's first button (Urgent help). | `.skip:focus-visible` is offset past the rail (15.5 rem, 17 rem at ≥1600 px). |
| 15 | 4.1.2 Name, Role, Value (A) | Two "Urgent help" buttons existed at wide widths, one hidden by CSS. Fragile, and a CSS slip would give a screen reader two identical controls. | `topBar()` simply does not draw it when `wide.matches`. |
| 16 | 4.1.2 | The Save button carried `aria-pressed` **and** changed its own label — a screen reader said "Saved. Tap to remove, pressed". | `aria-pressed` dropped; the label says what happens and `announce()` confirms it. |
| 17 | 1.3.1 Info and Relationships (A) | "See this map as a list" put `<h3>`s straight under the page `<h1>`; every bare results list did the same. | An `<h2>` inside the disclosure's `<summary>` for the map list; a visually-hidden `<h2>` (`results.head`) above the cards on category, need, search and saved screens. No level is skipped on any screen now. |
| 18 | 1.3.5 Identify Input Purpose (AA) | The ZIP field was `autocomplete="off"` — the one field on the site that asks for something about the person. | `autocomplete="postal-code"`, plus `aria-describedby` to the note and `aria-invalid` when the ZIP is unknown. Nothing is stored or sent either way; see DECISIONS for the trade-off. |
| 19 | 3.1.2 Language of Parts (AA) | On a Spanish screen, everything a place wrote about itself was read with Spanish pronunciation. Only `r.what` was marked. | `owner()` marks name, what, eligibility, notice, org, phone labels, schedule notes, addresses, alert titles and bodies, event titles and locations, park names, greenway names, source names and the whole transit panel as `lang="en"` whenever the interface is not English. |
| 20 | 1.4.10 Reflow (AA) / CLAUDE.md | `.callrow strong { white-space:nowrap }` made "313-579-2100 ext. 4217" a single unbreakable 22-character run. At the largest text sizes it pushed the page sideways. | `phoneParts()` splits number and extension; each piece is `<bdi>` and unbreakable on its own, so a long number wraps *between* them and never in the middle. Both pieces are also now LTR-locked, which is what Arabic needs. |
| 21 | 1.4.12 Text Spacing (AA) | `.when` (the date chip on an event) was a fixed `height:3.5rem`. | `min-height` + padding. Re-checked with the 1.4.12 override applied: nothing clips anywhere. |

Also fixed along the way (not a WCAG criterion, found by the keyboard walk): **`#/map` did not parse.** The Map
tab writes `#/map`, but `fromHash()` in `router.ts` never listed `map`, so a shared or bookmarked map link
opened Home and Back from the Map tab skipped it. Fixed, with a round-trip test for every tab.

### Open (4) — *all four closed on 2026-09-21; see §1a. The reasoning below is kept as the record of why they
were accepted at the time.*

| SC | Item | Why it is open |
|----|------|----------------|
| 1.4.11 | **Minor residential streets on the map are 1.47:1 (light) / 1.44:1 (dark) against the land fill.** | Raising every street to 3:1 needs roughly `#8f9c94` on near-white, which turns the map into a grey slab and buries the things that carry meaning — the greenway, the layer lines, the listing dots, the street *names* (11.31:1). Main roads, freeways and the city edge were raised instead. Justification: the street mesh is context, not content; every map in the app is also a text list of the same places, and no fact is reachable only through the picture (docs/05). **Kyle's call.** |
| 1.4.11 | **`--map-out` (outside the four cities) is 1.20:1 / 1.13:1 against the land fill.** | Same reason. Partly mitigated: the boundary is now a stroked line at 3.46:1. |
| 2.4.2 | **Need screens, search, Saved and private listings have no page title of their own.** | Deliberate. A browser can record a title in its own history UI, and "I am not safe at home" must never appear there (docs/08, audit A8). Privacy wins; the trade-off is written down. |
| 1.1.1 / 2.1.1 | **The map's dots and lines cannot be reached or activated with a keyboard** — only `pick()` on a pointer tap gives the little card. | The equivalent exists and is complete: "See this map as a list" lists every dot, stretch, park, route and stop with the same links. Making thousands of canvas features individually focusable is not the right fix; the honest statement is that the picture is an extra. |

---

## 1a. Second pass, 2026-09-21: the four open items, and what else the re-run found

Kyle: *"Resolve all issues in the accessibility audit."* The whole method of the first pass was run again over
the app as it stands today, which is not the app that was audited: Arabic and Bengali have landed, and with them
the holiday pill, the failed-layer messages, the Transit link, the Safe streets panel, the About line, the
delete-the-queue control, the full-screen dialog with its cloned Urgent help bar, and printing in a
right-to-left language.

### The four

| # | SC | Was | Is now | Evidence |
|---|----|-----|--------|----------|
| O1 | 1.4.11 | **Minor residential streets 1.47:1 light / 1.44:1 dark.** Raising them to 3:1 was judged to turn the map into a grey slab. | **4.01:1 / 4.22:1** against the land, **3.07:1 / 3.07:1** against a park — and the map is not a slab, because three other things changed with the colour. (a) A small street is a **hairline**: 0.9 px at the zoom it first appears, so it is a texture, not a wall. (b) It only appears at the zoom where it means something: `showCls` was 9 m/px, it is now **6** (and the next size up 16 → **11**), so a whole district's side streets no longer arrive at once. (c) **Width**, not fade, carries the hierarchy — freeway, main road and side street are within a step of each other in colour and a long way apart in weight, and close in (under 4 m/px) the big roads get a casing in the land colour. Road colours are also now measured against a **park**, because a street crosses one; that was never checked before. | `apps/web/src/style.css` tokens · `map.ts` `draw()` · the contrast test now walks all three road classes against land, park and the out-of-area ground, in both themes **and** with "increase contrast" on (§2) · screenshots at three zooms, light and dark |
| O2 | 1.4.11 | **`--map-out` (outside the four cities) 1.20:1 / 1.13:1.** | **Not a fill any more.** No colour can fix it: to reach 3:1 against the land, the ground outside the cities would have to be darker than the streets inside them. So the area is drawn as a **texture** — sparse diagonal hatching, 11 px apart, in a new `--map-out-ink` at **3.31:1** against its own ground and **3.86:1** against the land inside the boundary (4.95 / 4.23 dark). The stroked boundary from fix #10 stays. What identifies the area is now a line, and the line passes. | `map.ts` `draw()`, the hatch pass · `--map-out-ink` in both themes · in the contrast table below |
| O3 | 2.4.2 | **Need screens, search, Saved, Urgent help and private listings had no title of their own** — every one of them was the bare app name, which is four identical windows in a task switcher and a 2.4.2 failure in the letter. Deliberate, because a browser writes a title into its own history list. | **Named by what they are FOR, never by what they are about**: "Find help · 313 Help" (every need screen and every private category list), "Search · 313 Help", "Saved · 313 Help", "Listing · 313 Help", "Urgent help · 313 Help". Each of those is equally true of somebody looking for a food pantry, so nothing is revealed — docs/08's rule is about what a title can *give away*, and these give away nothing. The specific name is still the `<h1>` the cursor lands on, and it is now also **said out loud** through the live region when such a screen opens. Whether that lands once or twice under a real screen reader is question 2 in the test script. | `main.ts` `PURPOSE` and `render()` · verified live: `#/c/treatment` → title "Find help · 313 Help", hash cleared, live region "Drug and alcohol help"; `#/c/food` → "Food · 313 Help", hash kept · two tests in `web.test.ts` (the second enumerates every traceless screen through `hashFor` so a new one cannot be forgotten, and checks the five titles in all four languages name no need) |
| O4 | 2.1.1 / 1.1.1 | **The map's dots and lines could not be reached with a keyboard.** The text list was offered as the equivalent, and it is complete — but "there is a list" is not a reason for the picture to be dead. | **A roving focus on the map.** With the picture focused, **N** and **P** walk the features that are on screen, **Enter** opens one, **Escape** steps back out to the map. Order is stable and meaningful: the greenway first, stretch by stretch along the route, then places, nearest the middle of the screen first. Each one is announced through the map's own live region with the same card a tap produces — name, what kind of help, open or closed — plus "Press Enter for details." The ring is 3 px of `--focus` with 1.5 px of casing either side (2.4.13), and the map **pans to bring a feature in from the edge before announcing it** (2.4.11). It works inside the full-screen dialog; a finger, a mouse or leaving the picture puts the ring away, so pointing at the map is unchanged. | `map.ts` `mapKey`, `features()`, `step()`, `drawRing()`, `focusableDots()`, `orderFeatures()` · four behavioural tests in `behaviour.test.ts` · verified live at 1280 px: N centred "Bagley (16th to 15th)", further N reached "GHIB (Junction, Fort, Campbell, Jefferson, Green)" then the places, Enter opened "Bowen Branch Library" |

**Why N and P and not Tab.** Tab has to keep walking *out* of the map, or the map is a keyboard trap (2.1.2),
and the arrows have to keep panning it, or the one way to move the map without dragging is gone (2.5.7). A bare
letter is read only while the picture itself has focus, which is the exception 2.1.4 makes for a single-character
shortcut; a letter with Ctrl, Cmd or Alt is left to the browser and to the screen reader. All of that is a plain
function, `mapKey`, so the choice is held to a test rather than to a browser. The keys are written out in the
map's own keyboard help (`map.keys`), in all four languages.

**Nothing sensitive is ever in the ring.** The dots a keyboard can land on go through `mapDrawable` — the one
predicate in `needs.ts` that decides what the map may draw at all — not through a second copy of the rule. A dot
that never said what kind of place it is is not walked either: it fails closed. A test drives a mixed list
(a soup kitchen, a DV shelter, a crisis line, a treatment program, a sexual-assault service, a warming centre)
and asserts the two survivors, and asserts that the result is *identical* to `mapDrawable`'s own.

### Six more, found by re-running the method on today's app

| # | SC | What was wrong | Fix |
|---|----|----------------|-----|
| 22 | 1.4.11, 1.4.3 | **`prefers-contrast: more` did nothing to the map, and `forced-colors: active` could not.** A canvas is painted by hand, so no system setting reaches it: a Windows high-contrast desktop got the app's own greens and greys, and "Increase contrast" got exactly the same map as everybody else. | Both are now answered **through the tokens**, because those are what `map.ts` reads every frame. `prefers-contrast: more` pushes every map colour past its own requirement (roads to 7.18:1 light / 8.49:1 dark) and pulls the park fill back towards the land so the things drawn on it keep their distance; `forced-colors: active` points every map token at a system keyword (`Canvas`, `CanvasText`, `GrayText`, `LinkText`, `Highlight`). A test enumerates every token `map.ts` reads and fails if one is missing from the forced-colours block, and a second test asserts that "increase contrast" really is *more* contrast on every pair, not different contrast. Colour is down to five values there, which is why the greenway's four states are told apart by dash pattern as well; the test holds that too. |
| 23 | 1.4.10, 1.3.2 | **Printing in Arabic or Bengali put a bare left-to-right URL inside right-to-left text.** `a[href^="http"]::after { content:" (" attr(href) ")" }` — the brackets took the paragraph's direction, so the opening bracket came out at the far end of the line and the address read backwards through it. Listed as "cosmetic" in the 2026-09-20 right-to-left pass. | `direction:ltr; unicode-bidi:isolate` on the generated run. The whole `(https://…)` stays together and the right way round in every language. |
| 24 | 1.4.11 (admin) | **The steward queue's "look at this one first" was a thicker orange border and nothing else** — no words. A steward who cannot tell two borders apart had no way to know which listing two different phones had reported closed. | A sentence in the row: "Look at this one first: *n* different phones said it closed or moved." `admin/admin.js`, with a test in `api/test/admin.test.ts`. |
| 25 | 1.4.11 (admin) | **The steward page had no forced-colours rules at all.** It is one long page of boxes whose only separator is a border, so a high-contrast desktop lost the boxes, the buttons and the disabled state (`opacity:.5`, which forced colours ignores). | A `forced-colors: active` block for `.item`, `button`, `pre`, `.empty`, `.tag`, `.flash` and the breaker, `Highlight`/`HighlightText` for the primary button and `GrayText` for a disabled one — plus a `prefers-contrast: more` block for the greys a steward reads all day. |
| 26 | 4.1.2 | **The language control's accessible name was the whole list.** (Introduced and fixed the same day, with the top-bar change below.) A `<label>` that *wraps* a `<select>` takes the select's own subtree into the name a browser computes, so the control read as "Language English Español العربية বাংলা" before anything else. Found by reading the computed name out of the running page. | `aria-label` on the select. The `<label>` stays, because it is what makes the globe and the pill around it part of the hit area. The name is now exactly "Language". |
| 27 | 1.4.10 (Kyle, 2026-09-21) | **The language row took a line of its own under the top bar**, on Home and About only. | It is one compact control **inside** the top bar on the four tabs and About: a native `<select>` in a pill with a globe, the language in use shown in its own name, every option carrying its own `lang`. A native select and not a menu of ours: on a cheap Android phone, and under Switch Control, VoiceOver and TalkBack, the operating system's own picker is the one thing certain to work, and none of the menu-button pattern is ours to get wrong. Verified live on one line at 320, 375 and 1280 px, in English and Arabic, light and dark. At 320 px three things do not fit and Urgent help may not give way, so **below 30 rem the app's mark is hidden from the eye and kept for a screen reader** (never `display:none`); from 30 rem up it comes back. On a pushed screen the control is not drawn at all — the bar there is already a back button, an owner-written name and either Urgent help or the quick exit — and the tabs are one tap from everywhere. It is not cloned into the full-screen map's bar. Behaviour is unchanged: the choice stays on the phone, the lazy chunk still loads, the offline message still announces, the cursor stays on the control, and print hides it. |

### Re-checked and already passing (no change needed)

- **Target size (2.5.8).** Measured again on every screen including the ones added since: the holiday pill is
  text inside a card, not a target; "Try again" on a failed layer is a 44 px chip; the Transit link, the
  delete-the-queue button and the About line are all `.btn` (48 px) or `.link` (32 px, and inline links in prose
  are exempt anyway); the pan arrows are 36 px; the new language pill is 44 px. Call is 48 px (`.btn`) and
  60 px (`.callrow`). Nothing is under 24 px.
- **Text spacing (1.4.12)** and **reflow (1.4.10)** with the standard override applied, at 320 px, in all four
  languages: `scrollWidth === 320`, nothing clipped, nothing sideways. Re-checked with the top bar's new control
  in place, which is the only thing that changed the bar's arithmetic.
- **Focus visible (2.4.7)** on the controls added since: the layer "Try again" chip, the delete-the-queue
  button and the language select all take the one global 3 px ring; the select's pill also takes a `--focus`
  border through `:has(select:focus-visible)`, so the ring is never a bare rectangle over a rounded pill.
- **Names, roles and states (4.1.2)** read out of the running page on Home, Help, Map, a listing, search, Saved,
  Add a place, Urgent help, About and Your privacy, at 320 and 1280 px, in English and Arabic.
- **The full-screen dialog and its cloned Urgent help bar** behave as fix #13 describes, and the roving focus
  works inside it.
- **The Safe streets panel** and **the About line** carry the wording their own tests pin, and neither uses
  colour alone.

---

## 2. Contrast, both themes, computed

Every value below is computed from the custom properties in `apps/web/src/style.css` by the same formula the
test uses (WCAG relative luminance). **Bold** rows are the ones this audit changed. Text needs 4.5:1; outlines,
rings and meaningful graphics need 3:1.

### Light

| Pair | Ratio | Need | |
|---|---|---|---|
| body text `--ink` / `--bg` | 15.65 | 4.5 | pass |
| body text `--ink` / `--surface` | 16.89 | 4.5 | pass |
| pill text `--ink` / `--sunken` | 14.61 | 4.5 | pass |
| secondary `--muted` / `--bg` | 7.01 | 4.5 | pass |
| secondary `--muted` / `--surface` | 7.56 | 4.5 | pass |
| `.pill.plain`, `.empty` `--muted` / `--sunken` | 6.54 | 4.5 | pass |
| link `--brand` / `--bg` | 6.08 | 4.5 | pass |
| link `--brand` / `--surface` | 6.57 | 4.5 | pass |
| green button `--brand-ink` / `--brand` | 6.57 | 4.5 | pass |
| green button hovered / `--brand-strong` | 9.92 | 4.5 | pass |
| open pill `--brand-soft-ink` / `--brand-soft` | 7.82 | 4.5 | pass |
| outline button `--brand-soft-ink` / `--surface` | 9.24 | 4.5 | pass |
| freshness warning + field error `--warn-ink` / `--warn-bg` | 7.72 | 4.5 | pass |
| **911 row and quick exit `--danger-ink` / `--danger`** | 8.89 | 4.5 | pass |
| **hero paragraph white / lightest gradient stop** | **5.17** (was 3.39) | 4.5 | **fixed** |
| street name `--map-ink` / `--map-land` | 11.31 | 4.5 | pass |
| park name `--map-park-ink` / `--map-park` | 5.93 | 4.5 | pass |
| focus ring `--focus` / `--bg` | 6.17 | 3 | pass |
| focus ring `--focus` / `--surface` | 6.66 | 3 | pass |
| **control outline `--edge` / `--surface`** | **3.38** (`--line` was 1.31) | 3 | **fixed** |
| **control outline `--edge` / `--bg`** | **3.13** (`--line` was 1.22) | 3 | **fixed** |
| **main road `--map-main` / `--map-land`** | **4.91** (was 2.02, then 3.46) | 3 | **fixed** |
| **freeway `--map-fwy` / `--map-land`** | **4.53** (was 1.75, then 3.57) | 3 | **fixed** |
| **minor street `--map-road` / `--map-land`** | **4.01** (was 1.47) | 3 | **fixed 2026-09-21** |
| **every road over a park** (`--map-road`/`--map-main`/`--map-fwy` / `--map-park`) | **3.07 · 3.75 · 3.47** | 3 | **new pair, 2026-09-21** |
| **every road over the ground outside the cities** | **3.44 · 4.21 · 3.88** | 3 | **new pair, 2026-09-21** |
| **the hatch outside the cities `--map-out-ink` / `--map-out`** | **3.31** (the fill it replaced was 1.20) | 3 | **fixed 2026-09-21** |
| **`--map-out-ink` / `--map-land`** (the boundary the hatch draws) | **3.86** | 3 | **fixed 2026-09-21** |
| **casing under a route or the focus ring `--gw-case` / `--map-road`** | **4.25** | 3 | **new pair, 2026-09-21** |
| **the ring round a listing dot `--surface` / `--map-road`** | **4.25** | 3 | **new pair, 2026-09-21** |
| **the map's keyboard focus ring `--focus` / `--gw-case`** | **6.66** | 3 | **new, 2026-09-21** |
| **every `--lyr-*` on its casing** | 5.18 – 6.98 | 3 | **new pair, 2026-09-21** |
| **every `--grp-*` inside its own ring** | 4.92 – 9.37 | 3 | **new pair, 2026-09-21** |
| greenway open / land | 6.20 | 3 | pass |
| greenway being built / land | 3.53 | 3 | pass |
| greenway funded / land | 5.10 | 3 | pass |
| greenway planned / land | 3.33 | 3 | pass |
| greenway open / its casing | 6.57 | 3 | pass |
| `--lyr-bus` / land · park | 6.33 · 4.84 | 3 | pass |
| `--lyr-smart` / land · park | 5.17 · 3.96 | 3 | pass |
| `--lyr-rail` / land · park | 6.60 · 5.05 | 3 | pass |
| `--lyr-bike` / land · park | 4.89 · 3.74 | 3 | pass |
| `--grp-food` / land · park | 4.65 · 3.56 | 3 | pass |
| `--grp-shelter` / land · park | 7.47 · 5.71 | 3 | pass |
| `--grp-health` / land · park | 5.70 · 4.36 | 3 | pass |
| `--grp-rec` / land · park | 4.74 · 3.63 | 3 | pass |
| `--grp-work` / land · park | 5.06 · 3.87 | 3 | pass |
| `--grp-things` / land · park | 8.85 · 6.77 | 3 | pass |
| `--grp-paperwork` / land · park | 7.16 · 5.48 | 3 | pass |

### Dark

| Pair | Ratio | Need | |
|---|---|---|---|
| body text `--ink` / `--bg` | 16.28 | 4.5 | pass |
| body text `--ink` / `--surface` | 14.91 | 4.5 | pass |
| pill text `--ink` / `--sunken` | 15.49 | 4.5 | pass |
| secondary `--muted` / `--bg` | 8.69 | 4.5 | pass |
| secondary `--muted` / `--surface` | 7.96 | 4.5 | pass |
| `.pill.plain`, `.empty` `--muted` / `--sunken` | 8.27 | 4.5 | pass |
| link `--brand` / `--bg` | 9.52 | 4.5 | pass |
| link `--brand` / `--surface` | 8.72 | 4.5 | pass |
| green button `--brand-ink` / `--brand` | 9.62 | 4.5 | pass |
| green button hovered / `--brand-strong` | 12.61 | 4.5 | pass |
| open pill `--brand-soft-ink` / `--brand-soft` | 10.29 | 4.5 | pass |
| outline button `--brand-soft-ink` / `--surface` | 12.53 | 4.5 | pass |
| freshness warning + field error `--warn-ink` / `--warn-bg` | 10.83 | 4.5 | pass |
| **911 row and quick exit `--danger-ink` / `--danger`** | 6.09 | 4.5 | pass |
| **hero paragraph white / lightest gradient stop** | **5.17** (was 3.39) | 4.5 | **fixed** (the hero does not re-tint in dark mode) |
| street name `--map-ink` / `--map-land` | 12.68 | 4.5 | pass |
| park name `--map-park-ink` / `--map-park` | 7.85 | 4.5 | pass |
| focus ring `--focus` / `--bg` | 9.25 | 3 | pass |
| focus ring `--focus` / `--surface` | 8.48 | 3 | pass |
| **control outline `--edge` / `--surface`** | **3.31** (`--line` was 1.34) | 3 | **fixed** |
| **control outline `--edge` / `--bg`** | **3.61** (`--line` was 1.47) | 3 | **fixed** |
| **main road `--map-main` / `--map-land`** | **5.48** (was 2.23, then 3.62) | 3 | **fixed** |
| **freeway `--map-fwy` / `--map-land`** | **4.86** (was 2.95, then 4.05) | 3 | **fixed** |
| **minor street `--map-road` / `--map-land`** | **4.22** (was 1.44) | 3 | **fixed 2026-09-21** |
| **every road over a park** | **3.07 · 3.99 · 3.54** | 3 | **new pair, 2026-09-21** |
| **every road over the ground outside the cities** | **4.94 · 6.41 · 5.69** | 3 | **new pair, 2026-09-21** |
| **the hatch `--map-out-ink` / `--map-out` · `--map-land`** | **4.95 · 4.23** (the fill it replaced was 1.13) | 3 | **fixed 2026-09-21** |
| **casing `--gw-case` / `--map-road`** · **dot ring `--surface` / `--map-road`** | **4.76 · 4.27** | 3 | **new pair, 2026-09-21** |
| **the map's keyboard focus ring `--focus` / `--gw-case`** | **9.44** | 3 | **new, 2026-09-21** |
| **every `--lyr-*` on its casing** · **every `--grp-*` inside its ring** | 8.00 – 10.24 · 8.60 – 11.83 | 3 | **new pair, 2026-09-21** |
| greenway open · built · funded · planned / land | 8.61 · 7.09 · 6.66 · 6.57 | 3 | pass |
| greenway open / its casing | 9.71 | 3 | pass |
| `--lyr-bus` / land · park | 7.10 · 5.16 | 3 | pass |
| `--lyr-smart` / land · park | 9.08 · 6.61 | 3 | pass |
| `--lyr-rail` / land · park | 7.71 · 5.61 | 3 | pass |
| `--lyr-bike` / land · park | 7.48 · 5.44 | 3 | pass |
| `--grp-*` / land | 8.50 – 11.69 | 3 | pass |
| `--grp-*` / park | 6.18 – 8.50 | 3 | pass |

### With "increase contrast" on (`prefers-contrast: more`), 2026-09-21

Every pair above is computed a third and fourth time with the override applied, and a test asserts that not one
of them goes *down*. The map's own numbers:

| pair | light | light + contrast | dark | dark + contrast |
|---|---|---|---|---|
| minor street / land | 4.01 | **7.18** | 4.22 | **8.49** |
| minor street / park | 3.07 | **5.92** | 3.07 | **6.54** |
| main road / land | 4.91 | **11.40** | 5.48 | **12.55** |
| freeway / land | 4.53 | **7.84** | 4.86 | **10.48** |
| the hatch / its own ground | 3.31 | **6.27** | 4.95 | **10.17** |
| the casing / a road | 4.25 | **7.18** | 4.76 | **8.74** |

Under `forced-colors: active` there are no numbers to compute: every map token points at a system keyword, so
the contrast is whatever the person chose, which is the point. What a test can hold there is that **no map
token is left behind** — it enumerates every custom property `map.ts` reads and fails if one is missing from the
block — and that colour is never the only difference, since the greenway's four states also differ by dash.

A note on the warning and alert **backgrounds** (`--warn-bg` on `--bg`, 1.04:1 / 1.28:1): these are not
reported as failures. 1.4.11 covers what identifies a component or its state; these fills group text that
already carries its own meaning in words and meets 4.5:1 against its own background.

---

## 3. Criterion by criterion

`P` pass · `F` found and fixed · `O` open · `—` no content of that kind.

**1.1.1** P — every icon is `aria-hidden focusable="false"`, every canvas is `role="img"` with a sentence for a
label, the one real `<img>` (admin photos) has alt text. Open item 4 is closed (2026-09-21): the picture is
now operable as well as described, and the text list beside it is unchanged.
**1.2.x** — no audio or video anywhere.
**1.3.1** F (#17) — landmarks (`banner`/`nav`/`main`), one `<h1>` per screen, real `<ul>`/`<ol>`/`<table>`/
`<fieldset>`/`<legend>`, labels tied to every field. Heading levels now unbroken on all 20 screens.
**1.3.2** P — DOM order is reading order at both widths (`render()` puts the rail before the page only where the
rail is on the left).
**1.3.3** P — nothing is identified by shape, size or position alone.
**1.3.4** P — no orientation lock; checked in both.
**1.3.5** F (#18).
**1.4.1** P — every state has words as well as colour: open/closed/unknown/call-first pills, the greenway key
(colour **and** dash pattern **and** a named legend), map dots named in the tap card and in the list, the
invalid-field border paired with a sentence.
**1.4.3** F (#8); full table above.
**1.4.4** P — `rem` throughout, `-webkit-text-size-adjust:100%`, no `maximum-scale`. Re-checked at 200 %: no
truncation; the one overflow risk (long phone numbers) is #20.
**1.4.5** P — no text in images; the app draws no text as picture except map labels, which are canvas-rendered
live text and are also listed in words.
**1.4.10** F (#20) — 320 px verified on Home, Help, Map, category, detail, Add, Search: `scrollWidth === 320`,
no element past the viewport.
**1.4.11** F (#7, #9, #10, and on 2026-09-21 #22, #24, #25 and open items O1 and O2) — **no open pair left**:
every road is measured against the land, a park and the ground outside the cities; the out-of-area ground is a
hatch, not a fill; routes, dots and the map's focus ring are measured against the casing that is actually under
them; and both `prefers-contrast: more` and `forced-colors: active` are answered on the canvas.
**1.4.12** F (#21) — re-verified with the standard override applied, again on 2026-09-21 with the language
control in the top bar; no clipping anywhere.
**1.4.13** P — nothing appears on hover or focus except the skip link, which is dismissible by moving focus,
does not obscure anything after #14, and persists while focused.
**2.1.1** F (#12, and on 2026-09-21 open item O4) — full keyboard walk of every screen, including the layer
switcher (real checkboxes), the disclosure widgets, the canvas and the forms. The canvas is now **operable**,
not only pannable: N and P walk the features on screen, Enter opens one, Escape steps back out.
**2.1.2** F (#13).
**2.1.4** P — no single-character shortcuts. The canvas's `+`/`-`/arrows only fire while it has focus.
**2.2.1 / 2.2.2** P — nothing times out, nothing moves by itself, nothing auto-updates under the reader. The
10 s geolocation timeout is a request timeout, not a limit on the person. The bundle refresh never replaces a
screen mid-read.
**2.3.1** P — no flashing.
**2.4.1** P — skip button first in the DOM at both widths, landmarks present.
**2.4.2** F (#1, and on 2026-09-21 open item O3) — every screen has a title of its own; a traceless one is
named by what it is for, and its own name is said out loud instead.
**2.4.3** F (#4, #13).
**2.4.4 / 2.4.9** P — every link and button reads on its own ("Call · 313-579-2100", "See details",
"Health Department programs"). External links carry `rel="noopener noreferrer"` and an icon.
**2.4.5** P — search, the Help tab list, the map list, categories and the tab bar are five ways to the same
listing.
**2.4.6** P — headings and labels describe; reading level checked on every string touched.
**2.4.7** P — one global `:focus-visible` rule at 3 px, ≥6.17:1 in light and ≥8.48:1 in dark; the canvas has
its own inset ring so it is not clipped by `overflow:hidden`.
**2.4.11** F (#13, #14).
**2.4.12** P — nothing sticky covers a focused control after #14; the top bar is above the page, never over it.
**2.4.13** P — the focus ring is 3 px solid on all sides with a 2 px offset. The map's own ring, drawn on the
canvas, is 3 px of `--focus` over 1.5 px of casing either side, at 6.66:1 / 9.44:1 against that casing.
**2.5.1** P — no multipoint or path gesture is required: pinch has `+`/`-`, and after #11 drag has arrows.
**2.5.2** P — everything acts on `click`/`pointerup`, and the map's tap only fires when the pointer moved less
than 8 px.
**2.5.3** P — every visible label is contained in its accessible name (checked on the call rows, which add the
number to the label).
**2.5.4** P — no motion actuation.
**2.5.7** F (#11).
**2.5.8** P — measured live on every screen: no control is under 24 × 24 CSS px. Call buttons are 48 px
(`.btn`) and 60 px (`.callrow`); tabs 52 px; chips, pickers, map tools and the quick exit 44 px; the pan
arrows 36 px; inline links in prose are exempt and are 32 px tall anyway.
**3.1.1** P — `<html lang>` is set at start-up and on every switch.
**3.1.2** F (#19).
**3.2.1 / 3.2.2** P — nothing changes context on focus or on input. Typing in search redraws results below
the box and leaves the cursor in it; ticking a layer redraws the map and returns the cursor to that tick.
**3.2.3 / 3.2.4** P — the tab bar, Urgent help and the report block are in the same place and worded the same
way on every screen.
**3.2.6 Consistent Help** P — "Urgent help" is on every screen (top bar on a phone, first in the rail on a
laptop) and 211 appears in every empty state and error. Nothing was needed.
**3.3.1 / 3.3.3** F (#5).
**3.3.2** P — every field has a visible label; optional ones say "optional"; hints sit under the field.
**3.3.4** P — no legal, financial or data-deleting action. "Clear saved places" is local and reversible by
saving again; the steward's archive is confirmed and never deletes.
**3.3.7 Redundant Entry** F (#6) — the ZIP is asked once and reused across screens; nothing else is asked twice.
**3.3.8 Accessible Authentication** — there is no authentication. That is the point of the app.
**4.1.2** F (#15, #16) — measured live: **no control anywhere is without an accessible name.**
**4.1.3** F (#2, #3).

---

## 4. Right-to-left readiness (for the Arabic and Bengali work)

Done here, so the next agent starts from a clean sheet:

- **No physical `left`/`right` remains in `apps/web/src/style.css` or `admin/admin.css.`** A test fails the
  build if `margin/padding/border-left|right` or `text-align:left|right` come back. Converted:
  `.searchbtn` alignment, `ul.plain` indent, `table.years` alignment and caption, `.count` margin,
  `.maptools` corner. The new `.mappan` is logical from the start.
- **Direction is set, not assumed.** `i18n.ts` has `RTL` and `dirFor()`, and `apply()` sets both
  `documentElement.lang` and `documentElement.dir` on start-up and on every switch. Adding `'ar'` to `RTL` is
  the whole change on this side.
- **Chevrons and back arrows carry `class="ic … turn"`** and `[dir="rtl"] .ic.turn { transform:scaleX(-1) }`
  mirrors them. The external-link arrow deliberately does **not** turn. The pan arrows mirror left/right only.
- **Phone numbers and addresses are `<bdi>`.** `phoneParts()` splits a number from its extension and wraps each
  piece; `<address lang="en">` wraps its two lines. Numbers read left to right inside right-to-left text and
  never break in the middle.
- **Font stacks exist for both scripts**, using faces the platforms already ship (no web font — the page's own
  CSP forbids third-party origins): `:lang(ar)` Geeza Pro / Noto Naskh Arabic / Droid Arabic Naskh / Segoe UI;
  `:lang(bn)` Kohinoor Bangla / Noto Sans Bengali / Nirmala UI. Scoped by `:lang()`, so English and Spanish
  render exactly as before.
- **`owner()` already marks every untranslated place-written string as `lang="en"`**, which matters far more in
  Arabic and Bengali than it does in Spanish. Use it for anything new.

Both of the two things left for that agent are done (2026-09-20, Arabic and Bengali pass):
1. ~~The hero's radial gradient starts at `0% 0%`~~ — `[dir="rtl"] .hero` starts it at `100% 0%`, so the light
   is at the top inline-start corner, where the heading begins, in both directions.
2. ~~`@media (min-width:48rem) .tabs` centres the floating tab bar with a physical `translateX(50%)`~~ — it is
   now `inset-inline:0; margin-inline:auto`, centred by the writing direction with nothing left to flip.

Four more right-to-left defects were found by looking at the running app in Arabic, and fixed:

3. **The pan arrows under the map were mirrored, and the map is not.** `[dir="rtl"] .mappan button[data-map-act=
   "left"|"right"] { transform:scaleX(-1) }` flipped the glyphs while the flex row also reversed their order, so
   the leftmost button showed ← and moved the map east. The map never mirrors — left is west in every language —
   so the pad no longer flips any glyph. *(Correction, 2026-09-20 evening, from the Arabic and Bengali
   walk-through: the fix written here was `direction:ltr` on the pad; in the code today it is
   `[dir="rtl"] .mappan { flex-direction:row-reverse; }`, which keeps west on the left without overriding the
   pad's own text direction. The outcome described above is what ships.)*
4. **The app called itself "Help 313".** "313 Help" is a number and a word; in a right-to-left paragraph the
   space between them takes the paragraph's direction and the two runs swap. The header wraps the name in
   `<bdi>`, and the seven Arabic strings that name "313 Help", "Section 8" or "Michigan Works!" wrap them in
   U+2066/U+2069 isolates.
5. **English sentences lost their full stops to the other end of the line.** Everything a place wrote about
   itself is `lang="en"` (`owner()`), which says what language it is but not which way it runs:
   `[dir="rtl"] [lang="en"] { direction:ltr; unicode-bidi:isolate; }` keeps an English run whole inside an
   Arabic screen.
6. **The list version on About broke across the line.** `about.data` now receives the version wrapped in
   isolates, so a hash like `09cca4a-20260920T1906-32a1add44` stays one left-to-right run.

**Added the same evening (2026-09-20), from a second walk-through of every screen in Arabic and Bengali.** These
are additions to the done list above, not revisions of it:

7. **The owner-written heading in the top bar** is now marked `lang="en"`, like every other string a place wrote
   about itself, so it keeps its own direction inside a right-to-left bar.
8. **A phone extension stayed with its number.** The number and its extension are wrapped in **one** outer
   `<bdi class="tel">` rather than two siblings, so "…-2100 ext. 4217" cannot be reordered into something a
   person would misdial.
9. **The next-times row and the emergency-number labels** were walked in both languages and read in order.
10. **Uppercase and letter-spaced section headings apply only under `:lang(en)` and `:lang(es)`.** Letter-spacing
    breaks Arabic joining and Bengali conjuncts, so the same heading keeps its own letterforms and only loses the
    styling.
11. **"am"/"pm" are translated strings** (`clock.am`, `clock.pm`) while digits stay Western, and the list
    separator is a string (`list.sep`). All three are new keys and join the native-review queue; the Bengali
    "এএম/পিএম" is a transliteration a reviewer may well change.
12. **Dollar amounts are written the way the record writes them** (`$85,000`), falling back to `en-US` where a
    language's own `Intl` rules do not lead with the sign.

**Still open from that walk-through**, and listed in [CHECKS-2026-09-20.md](CHECKS-2026-09-20.md) §7:

- **Searching in Arabic or Bengali always returns nothing**, because every listing is written in English. That is
  not a bug in the search; it needs a one-line hint on the empty state, worded with the native reviewer rather
  than guessed at.
- **Print in Arabic** puts a bare left-to-right URL in parentheses inside right-to-left text. Cosmetic.
- **The iPhone and Android apps still hard-code "am"/"pm"** (`HelpApp/Help.swift`, `Format.kt`). A roadmap item,
  not a web defect.

---

## 5. What a real assistive-technology user still has to test

None of this can be settled by code review or by a headless browser. It needs people, ideally Detroit residents
who use these tools daily.

**This is a roadmap item, not an open failure** (Kyle, 2026-09-21). Nothing here is a defect we know about and
have not fixed; it is a set of questions only a person with the tool in their hands can answer. Since
2026-09-21 it has a script somebody can run in about an hour without knowing anything about the code:
**[ACCESSIBILITY-TEST-SCRIPT.md](ACCESSIBILITY-TEST-SCRIPT.md)** — the tasks, what should be heard, and what
counts as a pass. Results go back into §1 (a failure) or are ticked off here with the date, the tool and the
list version (a pass), so the list shrinks instead of being re-run from the top every time.

Two questions were **added** by the 2026-09-21 fixes and are the ones we most want answered:

- **Does a traceless screen get announced once, or twice?** The window title there says only what the screen is
  for ("Find help · 313 Help"), so the live region says which screen it actually is — while the cursor is also
  moving to the `<h1>` that carries the same words. A reader may say it once, twice, or drop the polite one. If
  it is twice, the live announcement should come out. Script task 2.
- **Can a switch user reach N and P at all?** The map's roving focus is the fix for 2.1.1, and it is driven by
  two letters. If a switch setup cannot send letters, the honest answer is that the text list is still doing the
  work for those people, and we should say so here rather than claim the picture is operable for everyone.
  Script task 3.

- **VoiceOver (iOS) and TalkBack (Android)** on the whole crisis path: Home → "I am not safe at home" → the
  hotline row → quick exit. Does the quick exit actually get you out fast under a screen reader, and is
  anything read aloud that would give the screen away?
- **Whether `announce()` really lands.** A polite live region competes with whatever the reader is already
  saying. Is "Thanks. We got it." heard after tapping "Still open", or swallowed?
- **The map.** `role="img"` on a canvas with a one-sentence label is the honest minimum. Whether people reach
  for "See this map as a list" instead, and whether that list is usable at 300 rows, is a question for users.
- **Switch control and voice control** (Voice Control / Voice Access): does every control's spoken name match
  what is printed on it? 2.5.3 passes on inspection; it is worth confirming out loud, especially on the call
  rows where the label adds the number.
- **Braille display** on the listing screen: whether the freshness badge and the open/closed pill read in a
  sensible order next to the name.
- **Screen magnification at 400 %** on a real laptop, with the rail collapsing to the phone layout.
- **Reading level with people, not formulas.** Every string touched here was checked against the ≤6th-grade
  rule by reading it; that is not the same as watching someone read it.
- **Windows: NVDA and JAWS in forced-colors (high contrast) mode.** The rules are in place and were reasoned
  about, but nobody has run the app in it.
- **Cognitive load on the overdose steps.** Six numbered steps with 911 above them: right under stress?

---

## 6. Files touched

**2026-09-21, second pass.** `apps/web/src/map.ts` (road colours and widths, the out-of-area hatch, casings, the
whole roving focus: `mapKey`, `orderFeatures`, `focusableDots`, `features`, `step`, `open`, `drawRing`) ·
`style.css` (map tokens, `prefers-contrast: more` ×2, `forced-colors: active`, the print bidi fix, `.langpick`,
the top bar) · `main.ts` (`PURPOSE` titles, the traceless announcement, dot `category` and `sub`, the top-bar
language control) · `i18n.ts` (`langPicker`) · `icons.ts` (a globe) · `focus.ts` (the new hook) ·
`apps/web/test/web.test.ts` (+6, and the contrast walk now covers all map tokens ×2 themes ×2 contrast settings)
· `apps/web/test/behaviour.test.ts` (+9) · `api/test/admin.test.ts` (+1) · `admin/admin.js` · `admin/admin.css` ·
`strings/{en,es,ar,bn}.json` (+9 keys each, 1 reworded) · this file · `docs/ACCESSIBILITY-TEST-SCRIPT.md` (new).
Cost: gzipped JS 75.6 → 77.7 KB, CSS 6.6 → 7.0 KB.

**2026-09-20, first pass.**
`apps/web/src/main.ts` · `map.ts` · `style.css` · `i18n.ts` · `phone.ts` · `router.ts` · `needs.ts` ·
`apps/web/test/web.test.ts` (+23 tests) · `apps/web/test/router.test.ts` (+2) ·
`strings/en.json` and `strings/es.json` (+23 keys each, 4 reworded) ·
`admin/index.html` · `admin/admin.js` · `admin/admin.css`.

Cost: gzipped JS 69.83 → 71.65 KB, CSS 5.91 → 6.42 KB. Phone layout unchanged except where a fix required it:
control outlines are a shade darker (#7), the hero green is a shade deeper (#8), main roads and freeways on the
map are darker (#9), the city edge has a line (#10), and every map frame gained four small arrow buttons at its
bottom-inline-start corner (#11).
