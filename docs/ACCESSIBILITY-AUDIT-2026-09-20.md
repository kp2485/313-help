# Accessibility audit — 313 Help web app, 2026-09-20

Full pass against **WCAG 2.2 Level AA** of `apps/web/` (every screen) and a lighter pass over `admin/`.
Method: (a) code review, criterion by criterion; (b) the app running at `localhost:5173` — accessibility tree
on every screen, keyboard-only walks, the full-screen map, both themes, 320 px reflow, 200 % text, the
1.4.12 text-spacing override, and contrast computed numerically from the tokens in `apps/web/src/style.css`.

**Result: 44 pass · 21 failures found and fixed · 4 open.** The fixes that can be held still are guarded by
23 new tests in `apps/web/test/web.test.ts` (`describe('accessibility: …')`) and `apps/web/test/router.test.ts`.

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

### Open (4)

| SC | Item | Why it is open |
|----|------|----------------|
| 1.4.11 | **Minor residential streets on the map are 1.47:1 (light) / 1.44:1 (dark) against the land fill.** | Raising every street to 3:1 needs roughly `#8f9c94` on near-white, which turns the map into a grey slab and buries the things that carry meaning — the greenway, the layer lines, the listing dots, the street *names* (11.31:1). Main roads, freeways and the city edge were raised instead. Justification: the street mesh is context, not content; every map in the app is also a text list of the same places, and no fact is reachable only through the picture (docs/05). **Kyle's call.** |
| 1.4.11 | **`--map-out` (outside the four cities) is 1.20:1 / 1.13:1 against the land fill.** | Same reason. Partly mitigated: the boundary is now a stroked line at 3.46:1. |
| 2.4.2 | **Need screens, search, Saved and private listings have no page title of their own.** | Deliberate. A browser can record a title in its own history UI, and "I am not safe at home" must never appear there (docs/08, audit A8). Privacy wins; the trade-off is written down. |
| 1.1.1 / 2.1.1 | **The map's dots and lines cannot be reached or activated with a keyboard** — only `pick()` on a pointer tap gives the little card. | The equivalent exists and is complete: "See this map as a list" lists every dot, stretch, park, route and stop with the same links. Making thousands of canvas features individually focusable is not the right fix; the honest statement is that the picture is an extra. |

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
| **main road `--map-main` / `--map-land`** | **3.46** (was 2.02) | 3 | **fixed** |
| **freeway `--map-fwy` / `--map-land`** | **3.57** (was 1.75) | 3 | **fixed** |
| minor street `--map-road` / `--map-land` | 1.47 | 3 | **open** |
| outside the city `--map-out` / `--map-land` | 1.20 | 3 | **open** (boundary now stroked at 3.46) |
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
| **main road `--map-main` / `--map-land`** | **3.62** (was 2.23) | 3 | **fixed** |
| **freeway `--map-fwy` / `--map-land`** | **4.05** (was 2.95) | 3 | **fixed** |
| minor street `--map-road` / `--map-land` | 1.44 | 3 | **open** |
| outside the city `--map-out` / `--map-land` | 1.13 | 3 | **open** |
| greenway open · built · funded · planned / land | 8.61 · 7.09 · 6.66 · 6.57 | 3 | pass |
| greenway open / its casing | 9.71 | 3 | pass |
| `--lyr-bus` / land · park | 7.10 · 5.16 | 3 | pass |
| `--lyr-smart` / land · park | 9.08 · 6.61 | 3 | pass |
| `--lyr-rail` / land · park | 7.71 · 5.61 | 3 | pass |
| `--lyr-bike` / land · park | 7.48 · 5.44 | 3 | pass |
| `--grp-*` / land | 8.50 – 11.69 | 3 | pass |
| `--grp-*` / park | 6.18 – 8.50 | 3 | pass |

A note on the warning and alert **backgrounds** (`--warn-bg` on `--bg`, 1.04:1 / 1.28:1): these are not
reported as failures. 1.4.11 covers what identifies a component or its state; these fills group text that
already carries its own meaning in words and meets 4.5:1 against its own background.

---

## 3. Criterion by criterion

`P` pass · `F` found and fixed · `O` open · `—` no content of that kind.

**1.1.1** P — every icon is `aria-hidden focusable="false"`, every canvas is `role="img"` with a sentence for a
label, the one real `<img>` (admin photos) has alt text. See also open item 4.
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
**1.4.11** F (#7, #9, #10) · O (2 map fills).
**1.4.12** F (#21) — re-verified with the standard override applied; no clipping anywhere.
**1.4.13** P — nothing appears on hover or focus except the skip link, which is dismissible by moving focus,
does not obscure anything after #14, and persists while focused.
**2.1.1** F (#12) — full keyboard walk of every screen, including the layer switcher (real checkboxes), the
disclosure widgets, the canvas and the forms.
**2.1.2** F (#13).
**2.1.4** P — no single-character shortcuts. The canvas's `+`/`-`/arrows only fire while it has focus.
**2.2.1 / 2.2.2** P — nothing times out, nothing moves by itself, nothing auto-updates under the reader. The
10 s geolocation timeout is a request timeout, not a limit on the person. The bundle refresh never replaces a
screen mid-read.
**2.3.1** P — no flashing.
**2.4.1** P — skip button first in the DOM at both widths, landmarks present.
**2.4.2** F (#1) · O (private screens, deliberate).
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
**2.4.13** P — the focus ring is 3 px solid on all sides with a 2 px offset.
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

**Still open from that walk-through**, and listed in [CHECKS-2026-09-20.md](CHECKS-2026-09-20.md) §6:

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

`apps/web/src/main.ts` · `map.ts` · `style.css` · `i18n.ts` · `phone.ts` · `router.ts` · `needs.ts` ·
`apps/web/test/web.test.ts` (+23 tests) · `apps/web/test/router.test.ts` (+2) ·
`strings/en.json` and `strings/es.json` (+23 keys each, 4 reworded) ·
`admin/index.html` · `admin/admin.js` · `admin/admin.css`.

Cost: gzipped JS 69.83 → 71.65 KB, CSS 5.91 → 6.42 KB. Phone layout unchanged except where a fix required it:
control outlines are a shade darker (#7), the hero green is a shade deeper (#8), main roads and freeways on the
map are darker (#9), the city edge has a line (#10), and every map frame gained four small arrow buttons at its
bottom-inline-start corner (#11).
