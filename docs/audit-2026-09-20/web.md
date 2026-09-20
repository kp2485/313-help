# 313 Help — web app audit (evidence-based)

Scope: `/Users/kylepeterson/projects/313-help/apps/web`. Every claim below was checked against source,
tests, the built bundle, or a command run on 2026-09-20. Doc claims were not taken at face value.

## Commands run

| Command | Result |
|---|---|
| `pnpm --filter @313help/web typecheck` | passes (`tsc -p .`, no output, exit 0) |
| `pnpm --filter @313help/web test` | **66 passed, 1 failed** of 67. Failure: `web.test.ts:334` `ENOENT … .github/workflows/publish.yml` |
| `pnpm --filter @313help/web build` | passes. `index-*.js` 200.25 kB / **66.89 kB gzip**, `es-*.js` 56.46 kB / 17.40 kB gzip, CSS 18.17 kB / 4.54 kB gzip |
| `pnpm --filter @313help/web dev` + curl (server started and killed) | `/` 200; `/data/bundle/v1/index.json` 200; `…/index.json.sig` 200; `…/map/streets.json` 200 (334 kB); `…/category/food.json` 200 (161 kB); `…/indicators/neighborhoods.json` 200 (376 kB); `/admin/` 200; `/sw.js` 200; `/v1/health` 200 `{"ok":true}` (proxied to a `workerd` already running on 8787 — not started by me) |
| Ed25519 check in Node against the key baked into `dist` | signature verifies `true`; tampered index rejected `true`; **0 checksum mismatches of 29 files** |

Bundle in the checkout: `data/bundle/v1/index.json`, version `nogit-20260920T1539-2e0e0eca`,
`signing: "dev"`, `emergency_verified: true`, no `retired`, no `photos`. 418 listings across 20 category
files; 52 greenway segments; 302 parks; 205 neighborhoods; 37 ZIP centroids; **`alerts.json` = 0 items**;
**`archived.json` = 0 items**; **no `events.json`**.

## Findings

| Item | Status | Evidence | What is missing |
|---|---|---|---|
| **Home tab** | active | `src/main.ts:177-196` — lang switch, hero, age banner, search button, alerts, "Find free help", 6 quick needs, Rec/Transit tiles, footer (About, Privacy) | docs/05 §Home still says "four quick needs (Food · A place to sleep · A doctor · Free Narcan)"; code ships six (`main.ts:186`: food, shelter, doctor, drugs, job, narcan). Doc, not code, is stale. |
| **Help tab** | active | `main.ts:197-206`; "Right now" full rows, "This week" / "Work, school and paperwork" tiles, collapsed `<details class="browse">` with 19 category chips, More → Saved / Add | — |
| **Recreation tab** | active | `main.ts:207-218` — greenway feature card + map, nearest 5 parks, "all 302 parks", rec centers via `rank({category:'rec'})`, MoGo panel | — |
| **Transit tab** | active | `main.ts:224-230`, content in `src/transit.ts` (4 sections, 3 phone numbers, fares, `checked: '2026-09-18'`). Test `transit links go to official sites only, over a known list of hosts` | Static content, hand-checked; no GTFS, no "nearest bus route" (docs/05 marks that v2) |
| **Events tab** | **built but unreachable** | `eventsTab()` `main.ts:231-237` and `eventItem()` `:165-169` exist, but `shownTabs()` `main.ts:95` drops the tab unless `upcoming(1).length > 0`, and the bundle has no `events.json` (`index.json` file list). `render()` `:438` also rewrites `#/events` to Home. No `pipeline/src/ingest-events.ts` exists and no pipeline file writes `events.json`. | Intentional (DECISIONS 2026-09-19 "City events dropped"), but ~15 lines of view code, `strings` keys `events.*`, `home.events`, the `events` icon and the TABS entry are all dead today. docs/05's IA diagram still shows five tabs. |
| **Tab bar layout** | **bug** | `src/style.css:47` `.tabs { grid-template-columns:repeat(5,1fr) }` — hardcoded 5 columns while only 4 tabs render | The bar leaves an empty fifth column; tabs are left-shifted. Should be `repeat(var/auto,1fr)` or set from `shownTabs().length`. |
| **Need screens (23)** | active | `src/needs.ts:29-96`. Groups now/soon/later; `first` emergency numbers before any list; `stepsOnly` for overdose; `quickExit` on unsafe/talk/drugs/assault; `firstLinks: 'beds'` (313SafeBeds) above the shelter lines | — |
| **Refinements** | active | `needs.ts` `refine[]` for shelter (me/kids/young), food (today/week/paying), doctor, home, things, drugs (7), job (4), school, money; rendered `main.ts:248-250` | Utilities has no refinement — docs/05 already says "no refinement today" |
| **Overdose screen** | active | `main.ts:247` renders 911 + `od.s1..s6` only, no list, no map; test `the overdose-now screen has 911 and steps, and no list of places` | docs/05 flags illustrations and the "Narcan is also sold at pharmacies" line as not built — confirmed absent (`grep pharmac strings/en.json` → no match) |
| **Link-outs** | active | `src/links.ts` — 20+ sets, each with `checked` date and optional `until` expiry; `linkPanels()` `main.ts:263-267` filters expired items by Detroit day. Test `every link-out set a need names exists, is https, has a checked date, and has words in both languages` | — |
| **Search** | active | `searchScreen()`/`searchResults()` `main.ts:350-362`; live `input` handler `:508-511` re-renders only `#searchout`; text lives in one variable, never in the URL (`router.ts:28` returns null) | The "Closed places" branch (`main.ts:354,357`) can never show anything: `archived.json` has 0 rows. |
| **"Type a ZIP"** | active | `locChip()` `main.ts:110-117`, submit handler `:522-525`, looked up in `bundle.zips` (37 ZIPs in `places/zips.json`, centroid only). Test `a typed ZIP is never drawn as "you are here"` (`map.ts` `me` is null when `hereZip` set, `main.ts:320`) | — |
| **Use my location** | active | `main.ts:494-497`, permission requested only on the tap, `maximumAge:60000`; denial handled (`loc.denied`) | — |
| **Saved places** | active | `src/saved.ts` (IndexedDB `saved`, max 100, `canSave` blocks DV/crisis/treatment/assault), `savedScreen()` `main.ts:363-371`, `#/saved` has no URL | — |
| **Add a place** | active (client side) | `addScreen()` `main.ts:373-384`, `src/propose.ts` closed-field builder, 14 categories, no DV option. Tests cover fields and validation | End-to-end depends on `POST /v1/proposals`; the Worker is not deployed anywhere (docs/OPERATIONS) |
| **Reports** | active (client side) | `src/report.ts` — `sha256(secret‖target‖day)` nonce, closed body, `reportBox()` `main.ts:145-156`; confirm + 6 listing kinds + 8 place kinds; no "about a person" kind. Tests cover the hash, the Detroit day rollover, and field closure | Same: no deployed Worker |
| **Offline queue** | active | `src/outbox.ts` serialised with a promise chain; 50 reports / 10 proposals; retries 429/408/5xx only. 4 tests in `test/outbox.test.ts` incl. "two flushes at once send each item exactly once" | — |
| **Photos** | **built, flag off** | Input rendered only when `bundle.index.photos === true` (`main.ts:154`). `data/seed/directory.json` `"photos": false`; `index.json` has no `photos`; `api/wrangler.toml:29` `PHOTOS_ENABLED = "false"`; `api/src/index.ts:75` returns 503. `preparePhoto`/`plainJpeg` re-draw and strip all non-picture JPEG segments; tested | As designed (demo-only until legal advice, docs/11). Unreachable in every build today. |
| **Map — streets** | active | `map.ts:39-47,`draw()`:239+`; `map/base.json` + `map/streets.json` fetched on first map open, checksum-checked against the signed index, cached in IndexedDB (`map.ts:51-71`). Class-based road widths, zoom-dependent detail, collision-avoiding rotated labels | — |
| **Map — parks** | active | `map.ts` park fills, sub-pixel park dots (suppressed on `quiet` maps), italic park labels, tap-to-identify via point-in-polygon `inside()` | — |
| **Map — greenway** | active | Drawn like a transit line: casing pass, per-phase colour + dash, station dots at joins when `mpp < 14`, focused stretch bright and others at 0.45 alpha (`map.ts` draw). Word key under the map `main.ts:336` | — |
| **Map — listing dots** | active | `main.ts:137-140` (list map, closed until asked), `:305` (detail map), `:343` (segment map); sensitive categories never get a dot | Dots are **not** coloured by freshness and there is **no clustering** — docs/05 already lists both as not built. `dot(d, col.brand, 7)` for every dot. |
| **Map — ZIP areas** | **planned only** | `places/zips.json` is `{zip: [lat, lon]}` centroids used solely for "Type a ZIP" distance. `mapBox`'s `outline` option is used only for neighborhood rings (`main.ts:391`) | No ZIP polygons are drawn anywhere. docs/README's "ZIPs" behind the map means the ingest layer, not a drawn feature. |
| **Map — no third party** | active | Test `asks no other site for anything: no tile server, no URL at all`; CSP `connect-src 'self'` in `index.html:9` | — |
| **Neighborhood pages** | active | `src/hoods.ts` (205 hoods in `indicators/neighborhoods.json`), list + per-hood page with sales/permits in one panel, blight rate per 1,000 lots, demolitions, issue days, fires, vacants, roads, sources. 6 tests for the docs/13 honesty rules. Loaded lazily and checksum-checked (`hoods.ts:35-48`) | Reached only from About and from a greenway segment — no entry point from Home or Help (matches docs/05) |
| **Alerts** | **built, no data** | `alertBox()` `main.ts:172-176`; Home filter `:184` (started and not ended); per-listing alerts on detail `:292`; cancellations feed `openNow`/`nextOccurrences` via `packages/query` | `alerts.json` in the bundle is `[]`. The whole alert surface is untested by any rendering test and unexercised by real data. Alerts are written by hand (`pnpm alert:new`). |
| **Freshness badges** | active | `badgeText()` `main.ts:67-72` calls `badge(row, now())` from `packages/query/src/freshness.ts` — computed on device from dated facts, never frozen. Levels: archived / reported_closed / reported_once / confirmed / entry_checked / source_listed / never_checked. No key says "verified" | — |
| **Bundle-age banner** | active | `ageBanner()` `main.ts:99-107`; `bundleAge()` → `aging` > 72 h, `old` > 30 days. Injected into need/list/detail/segment/search/saved and the Rec tab (`main.ts:455`), and Home has its own slot | Will fire naturally as the bundle ages; not currently visible (bundle built today) |
| **Dead-man / sunset banner** | **built, never triggers** | `bundleAge()` returns `retired` only when `index.retired === true`; `data/seed/directory.json` has `"retired": false`, so `index.json` carries no `retired`. `retired()` `main.ts:109` also hides search, quick needs, report boxes and Add-a-place | Deliberate switch. `pipeline/src/preflight.ts:46` fails a deploy if it is ever true by accident. No test asserts the retired rendering. |
| **Language switching** | active | `src/i18n.ts` — English inlined, Spanish a separate dynamic `import('strings/es.json')` (confirmed by the separate 56 kB `es-*.js` chunk in the build), choice kept in IndexedDB, falls back to English if the fetch fails. `strings/en.json` and `es.json` both have **759 keys**; 3 tests check key parity, placeholder parity, and that 911/988/211 survive | A place's own words stay English and are labelled (`detail.in_english`) — confirmed `main.ts:302`. Arabic/RTL not started. |
| **Service worker** | active | `public/sw.js` — shell cache `shell-v2`, `skip()` excludes `/data`, `/v1`, `/admin`; navigate responses cached only on `r.ok`; registered only in PROD (`main.ts:573`). 3 tests run `sw.js` against a fake browser | — |
| **IndexedDB / offline data** | active | `src/data.ts` — single `kv` store; `cached()` first, then background `refresh()`; atomic single-`put` swap; `map/` and `indicators/` deferred; replay protection (`data.ts:74` refuses an older `generated_at`); all failures fall back to the held bundle | — |
| **Refresh cadence** | active | `checkForUpdate()` `main.ts:533-555` — at most every 15 min, on `visibilitychange`, on `online`, with exponential retry 5 s → 5 min when there is no bundle yet and a "Try again" button | — |
| **Signature verification / pinned keys** | active (dev); **release path unexercised** | `src/verify.ts` (@noble/ed25519, `zip215:false`), `data.ts:71` refuses an unmatched signature. Verified live: signature valid, tampered index rejected, 29/29 checksums match. **`dist` contains exactly one pinned key** (`MCowBQYDK2Vw…hFdZ8=`, derived from `.keys/dev-ed25519.pem`) | `vite.config.ts:19-35` enforces "exactly two good keys + a release-signed bundle" only when `WEB_RELEASE=1`. Nothing sets it: **`.github/` does not exist in this checkout** — no `publish.yml`, no `ci.yml`. That is the one failing test (`web.test.ts:334`). The release build has never been run. |
| **Quick exit** | active | `topBar(title, quickExit)` `main.ts:86-91`; `data-exit` handler `:491` clears the stack and `location.replace('https://www.weather.gov/')`. On for `unsafe`, `talk`, `drugs`, `assault` and for any private listing detail (`detail()` returns `exit: priv`) | — |
| **Dynamic type / no truncation** | active | `style.css` is rem-only (`:root` scale, `body` `1.0625rem`), no `text-overflow: ellipsis` anywhere, phone numbers `white-space:nowrap` (`style.css:31`), tap targets ≥ 2.75 rem | Never verified on a real device at accessibility text sizes; no test. |
| **Labels / a11y affordances** | active | `aria-label` on every icon-only control (back `:89`, map tools `map.ts:106-108`, canvas `role="img"` + `aria-label` + `tabIndex=0` + arrow/±keys `map.ts:176-183`), `aria-current="page"` on the active tab, `role="status"`/`role="alert"`/`aria-live` on banners and search output, `@media (forced-colors:active)` and `(prefers-reduced-motion)` blocks | No automated accessibility check and no contrast test; docs/05's ≥ 7:1 body contrast claim is unverified. |
| **Share deep link** | active | `main.ts:498-501` — `location.origin + '#/r/' + id`, `navigator.share` then clipboard fallback; nothing personal in the link | — |
| **Router / no-trace history** | active | `src/router.ts` — history entries hold only `{k: 'eN'}`; need screens, search, saved, urgent and sensitive listings return `null` from `hashFor`. 6 tests in `test/router.test.ts` | — |
| **Privacy screen + key reset** | active | `privacy()` `main.ts:400-410`, `resetInstallSecret()` `report.ts:24-26`; reachable from Home footer and About | — |
| **About screen** | active | `main.ts:411-418` — lang switch, 4 paragraphs, version + generated date + `signing` (`about.sig_dev` today), privacy link, neighborhoods link, credits computed from the listings' own sources | `index.emergency_verified` and `index.counts` are typed in `data.ts:9-10` but rendered nowhere. |
| **Report-a-problem-with-the-app** | **planned only** | docs/05:34 says "not built"; confirmed absent from `src/` | — |
| **Filters (Open now / No ID / walk-in / …)** | **planned only** | No filter UI in `src/`; `grep -rn "filters" apps/web/src` → nothing. docs/05:101 already flags it | — |
| **Local notifications** | **planned only** | No `Notification`, `showNotification` or push code in `src/` or `sw.js` | docs/05:155 marks it v2 |
| **Analytics** | correctly absent | Only the comment in `index.html:8`; no gtag/plausible/matomo/posthog/segment anywhere | — |
| **"Reporting available" indicator** | **planned only / doc overclaim** | docs/06:75 says `GET /v1/health` exists "for the app's 'reporting available' indicator". `grep -rn "v1/health" apps/web/src` → **no match**; only `api/src/index.ts:38` defines it | The web app never calls it and has no such indicator. |

### Dead or unreachable code found

- `eventsTab()`, `eventItem()`, the Home "Coming up" block, the `events` TABS entry and icon, and the
  `events.*` / `home.events` / `home.see_all` string keys (`main.ts:159-169, 191, 231-237`).
- Search's "Closed places" branch and `savedScreen()`'s closed list — `archived.json` is empty.
- The entire alert surface — `alerts.json` is empty.
- The photo input, `preparePhoto`, `uploadPhoto` — gated on `index.photos`, which is never set.
- The sunset/retired rendering path — gated on `index.retired`, which is never set.
- Truly unused strings keys (not built dynamically): `strip.text_label`, `results.title`,
  `results.first_call`, `detail.source_line`, `od.call`.
- Unused icon: `bike` (40 defined, 39 used).
- Unused bundle-index fields in the client: `emergency_verified`, `counts`.

### Test coverage shape

67 tests across `test/web.test.ts` (56), `test/router.test.ts` (6 within 4 describes), `test/outbox.test.ts` (4).
`vite.config.ts:68` sets `test: { environment: 'node' }` — **no DOM, no rendering test anywhere**. Roughly
half of `web.test.ts` works by `readFileSync`-ing `src/main.ts`/`map.ts`/`router.ts` and regex-matching the
source text (e.g. `:303` asserts `mapSrc` contains `querySelector('header.top')`; `:406` greps for
`localStorage`). Those tests are good privacy tripwires but they prove nothing about what renders. No test
calls `homeTab()`, `helpTab()`, `need()`, `detail()`, `results()`, `shownTabs()` or `ageBanner()`.

Environment note: this checkout is **not a git repository** (`git rev-parse` → fatal), which is why the
bundle version begins `nogit-` and why `.github/` is absent. The docs' "diff is git / steward merges a pull
request" approval path and the `data/hsds/` commit-on-publish audit trail cannot run here.

## Biggest gaps

1. **No CI or publish workflow exists.** `.github/` is absent; `publish.yml` and `ci.yml` are described in
   docs/06:51,56 and README:45. This is the one failing test and it means the *release* build path
   (`WEB_RELEASE=1`, two pinned keys, release-signed bundle) has never once been executed.
2. **The app ships with one pinned key.** Only the dev key is baked into `dist`. The two-key rule in
   `keys.ts`/`vite.config.ts` is well tested as a function but has never gated a real build.
3. **The fifth tab is gone but the CSS still reserves five columns** (`style.css:47`) — a visible layout
   defect on every screen, and a sign the Events removal was done in TS only.
4. **Events is dead weight**: view code, strings, icon and tab entry with no producer in the pipeline and no
   path to reach it. Either remove it or state plainly in docs/05 that the IA is four tabs.
5. **Nothing renders in the test suite.** Node environment, source-text regexes. Ordering rules that
   docs/05 calls safety-critical (numbers before lists on DV/crisis/overdose screens) are asserted against
   `needs.ts` data, not against produced HTML.
6. **Three whole surfaces are code-only because their data is empty**: alerts (0), archived/"Closed places"
   (0), events (absent). A demo will show none of them.
7. **Photos and the sunset banner are permanently off** in every build today (`directory.json`
   `photos:false, retired:false`, `PHOTOS_ENABLED="false"`, API 503). Correct per docs/11, but they should
   not be counted as shipped features.
8. **docs/06 overclaims the health check**: the "reporting available" indicator does not exist in the web app.
9. **docs/05 §Home is stale** (four quick needs vs. six in code) and its IA diagram still shows five tabs.
10. **Write plane is undeployed**, so reports, proposals and photos are only ever exercised against a local
    `workerd`. Offline queueing is well tested in isolation; the round trip is not tested at all.
