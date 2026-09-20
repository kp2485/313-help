# 313 Help — audit of the iPhone app and the documented backlog

Audited 2026-09-20 against the working copy at `/Users/kylepeterson/projects/313-help`.
Everything below was checked in code or data. Where a doc makes a claim, the claim is
marked against what the files actually show.

**Two facts that affect the whole audit:**

- **This checkout has no `.git` and no `.github/`.** `ls -la /Users/kylepeterson/projects/313-help`
  shows neither. So `.github/workflows/publish.yml` — cited by `docs/OPERATIONS.md:113`,
  `CLAUDE.md` and `docs/README.md` — is **not present here**, and neither is any CI. One web
  test fails only for this reason (`apps/web/test/web.test.ts:318-335` asserts the workflow file).
  Every "CI runs it on every push" claim (`apps/ios/README.md:4`, `CLAUDE.md` build-order note)
  is unverifiable in this working copy.
- **`data/bundle/v1/index.json` has no `events.json`.** City events were dropped
  (DECISIONS 2026-09-19). The iPhone app still carries an Events tab and a `CityEvent` decoder;
  that code is dead until a real feed exists.

---

## Part 1 — The iPhone app (`apps/ios/`)

### What was run

| Check | Result |
|---|---|
| `swift test` in `apps/ios` | **Passes.** 5 XCTest cases; `fixtures: 111 cases, 0 failed` — every case in all ten `schema/fixtures/*.json` files (9+7+8+16+8+20+7+8+5+23 = 111). |
| `xcodebuild -project apps/ios/Xcode/Help313.xcodeproj -scheme Help313 -destination 'id=58DF0CC6-…' build` | **BUILD SUCCEEDED, 0 warnings.** The README's claim that the screens compile is true. |
| Every `L.t(...)` key used by `HelpApp/*.swift` (static and dynamic: `need.`, `tile.`, `quick.`, `refine.<need>.<refine>`, `od.s1..6`, `gw.<phase>`, `link.beds.safebeds.*`) resolved against `strings/en.json` | **All resolve.** `en.json` and `es.json` have identical key sets (759 each). |

### What works today

| Area | Evidence |
|---|---|
| Tabs: Home, Help, Recreation (greenway), Events (conditional) | `apps/ios/HelpApp/Views.swift:63-71` |
| Urgent help reachable from every screen; 911/988 hardcoded and unoverridable | `Views.swift:80-86` (`urgentHelp()` modifier applied on all 9 screens); `HelpApp/Help.swift:24,81` — `hardcoded[id] ?? fromBundle?.number`, so the bundle can never override |
| Works with **no bundle at all**: urgent numbers and overdose steps still render, because `hardcoded` needs no data | `Help.swift:81`; `Views.swift:135,153` |
| Overdose screen: 911 first, six steps, **never a list of places** | `Views.swift:150-167`; `Help.swift:42` (`stepsOnly: true`) |
| DV / crisis / treatment / assault screens: numbers before any list, no distance | `Help.swift:46-55`; `Views.swift:259,285,291` (`sensitive` suppresses `q.near` and the miles pill) |
| Ranked results using the shared rule, incl. the `prefer: ["youth"]` shelter route | `Help.swift:45`; `Sources/DetroitQuery/Rank.swift:62` |
| Location: asked only on the tap, held in memory, never written or sent; a refusal is answered in words | `Views.swift:24-58, 303-330` |
| Listing detail: badge, open-now, notice, all phone numbers with labels, Apple Maps directions, eligibility, next occurrences, hours text, source | `Views.swift:368-418` |
| Search (in memory only, never stored or sent) | `Views.swift:432-449` |
| Greenway segments by phase, cross streets, help within a 10-minute walk, DV rows filtered out | `Views.swift:451-489` |
| Signed-bundle loading: Ed25519 against pinned keys, per-file SHA-256, older bundle refused, verified copy cached with `.completeFileProtection`, shipped snapshot fallback for a first run offline | `HelpApp/BundleStore.swift:38-104` |
| Bundle-age banner (fresh/aging/old/retired) | `Views.swift:211-222` |
| English + Spanish, following the phone's language; a place's own words stay in English and are marked | `Help.swift:15-20`; `Views.swift:399` |
| Design system shared with the web app | `HelpApp/Palette.swift` (136 lines) |
| Accessibility: descriptive call labels, phone numbers `fixedSize()` so they never truncate | `Views.swift:99,104,355,362` |

`Sources/DetroitQuery` is at full parity with `packages/query`: every exported symbol in
`packages/query/src/index.ts:1-7` has a Swift counterpart (`openNow`, `nextOccurrences`,
`assertScheduleValid`→`scheduleIsValid`, `badge`, `bundleAge`, `rank`, `miles`, `search`,
`searchTokens`, `matchTier`, `normalizeText`, `helpAlong`, `nearestSegment`, `milesToSegment`,
`milesToLine`, `effectiveNow`, `toWall`, `wallDateString`, `daysBetween`), plus `telLink`
(`Sources/DetroitQuery/Phone.swift:5`), which on the web lives in `apps/web/src/phone.ts`.

### Gaps against the web app

| # | Gap | Status | Evidence | Waiting on |
|---|---|---|---|---|
| i1 | **Reports / "report a problem"** — no report box, no outbox, no `client_nonce`, no `install_secret`. The iPhone app never talks to the API at all. | not started | Web: `apps/web/src/report.ts`, `src/outbox.ts`, `main.ts:145` `reportBox()`. iOS: no `URLSession` POST anywhere — `BundleStore.swift:4` says "these are plain GETs" | work |
| i2 | **Add a place / proposals** | not started | Web `apps/web/src/propose.ts`, `main.ts:373` `addScreen()`; nothing in `apps/ios` | work |
| i3 | **Saved places** | not started | Web `apps/web/src/saved.ts`, `main.ts:363` `savedScreen()`; no equivalent on iOS | work |
| i4 | **The street map** — no map at all. `BundleStore` deliberately skips `map/` files. | not started | `BundleStore.swift:59,90` skip `map/`; web `apps/web/src/map.ts` (362 lines), `main.ts:315` `mapBox()` | work |
| i5 | **Neighborhood pages** (docs/13) — `indicators/` is skipped too | not started | `BundleStore.swift:59,90` skip `indicators/`; web `apps/web/src/hoods.ts`, `main.ts:386` | work |
| i6 | **Transit tab** | not started | Web `apps/web/src/transit.ts`, `main.ts:224` `transitTab()`; iOS `Views.swift:63-71` has four tabs, no transit | work |
| i7 | **Link-outs** (88 programs you apply for online, both languages, self-hiding when an application closes) | partly — only the one 313SafeBeds card | `Help.swift:64-65` says so in a comment; `Views.swift:110-129` `LinkCard` is the only link panel; web `apps/web/src/links.ts` + `main.ts:263` `linkPanels()` | work |
| i8 | **"Type a ZIP"** | not started | Web `apps/web/src/main.ts:113-116,522-524` using `places/zips.json`; iOS fetches `places/zips.json` but never decodes it (`BundleStore.swift:100` `default: break`) | work |
| i9 | **Photos on condition reports** | not started (and blocked upstream) | `apps/ios/README.md` says so; no `PHPicker`/`UIImage` anywhere in `HelpApp/` | Kyle (legal advice + R2 bucket) then work |
| i10 | **Condition reports on greenway segments** | not started | `SegmentView` (`Views.swift:468-489`) has no report path; web `main.ts:344` puts `reportBox(s.id, true)` on the segment screen | work |
| i11 | **Parks** — `places/parks.json` is fetched and checksummed but never decoded or shown | not started | `BundleStore.swift:100`; web `main.ts:219` `parksList()` | work |
| i12 | **About / Privacy / Credits screens** — so no privacy policy, no "who made this", no data-version line, no install-key reset | not started | Web `main.ts:400,411,424`; docs/08:61 requires the disclaimers "in-app under About". iOS has no such screen | work |
| i13 | **Archived listings are loaded but never shown.** A person who searches for a closed pantry sees nothing instead of "Closed as of {date} — call 211". | not started | `BundleStore.swift:97` decodes `archived.json`; `grep archived apps/ios/HelpApp/Views.swift` → no hits. Web: `main.ts:285-286,354,366` | work |
| i14 | **A listing's own alerts are not shown on its detail screen** (review weakness 2's last clause, fixed on the web, still open on iOS) | not started | Web `main.ts:292-295` renders alerts whose `targets` include the row; `Views.swift:368-418` does not | work |
| i15 | **The age / "your phone's copy is old" banner is on Home only.** DECISIONS 2026-09-19 (Accepted) says it must show "on every list and listing, not only Home" — the web app was changed, the iPhone app was not. | not started — **contradicts an Accepted decision** | `Views.swift:180` is the only `AgeBanner()`; `ResultsView` (`:275`) and `DetailView` (`:368`) have none | work |
| i16 | **No quick exit** on private screens (treatment, DV, crisis, assault) | not started — contradicts DECISIONS 2026-09-19 "treatment listings … quick exit" | Web `main.ts:86-90,491` (`data-exit` → `location.replace('https://www.weather.gov/')`); no equivalent on iOS | work |
| i17 | **No in-app language switch** — Spanish only if the whole phone is Spanish | partly | `Help.swift:15` `Locale.preferredLanguages.first?.hasPrefix("es")`; web has a switch at `main.ts:92` | work |
| i18 | Detail screen omits: the listing's website, the bus-directions link, the "near this greenway segment" link, the schedules list, and share | partly | Web `main.ts:294-310`; iOS `Views.swift:368-418` (`row.website` is decoded at `Models.swift:43` and never used) | work |
| i19 | **Events tab is dead code** — `events.json` is not in the bundle any more | n/a, should be removed or left dormant | `data/bundle/v1/index.json` file list has no `events.json`; `Views.swift:68` guards on a list that is always empty | work |

### Release blockers inside the iPhone app

| # | Item | Status | Evidence | Waiting on |
|---|---|---|---|---|
| i20 | **Only the dev signing key is pinned.** `DCPinnedKeys` holds one key, and it is byte-for-byte the public half of `.keys/dev-ed25519.pem`. A release must pin the two release keys. | not started | `apps/ios/Xcode/Info.plist` `DCPinnedKeys` = `MCowBQYDK2VwAyEA8lho2BDn7lpQzqJrs9UHHB/3ScO2T8JUwXpSt/hFdZ8=`, which equals `openssl pkey -in .keys/dev-ed25519.pem -pubout -outform DER \| base64` | Kyle (keys) then work |
| i21 | **No release guard for the iPhone equivalent of review weakness 17.** The web build refuses a release that pins the wrong keys or a dev-signed bundle (`apps/web/vite.config.ts:20-32`, `apps/web/src/keys.ts:14-21`); nothing checks `apps/ios/Xcode/Info.plist`. `grep -rn "Info.plist\|DCPinned\|DCBundle" pipeline/src/` → no hits. | not started | as above | work |
| i22 | **`index.signing` is decoded and never checked** on iOS. The web app at least surfaces dev-vs-release on the About screen (`apps/web/src/main.ts:414`). | not started | `BundleStore.swift:9` declares `signing`; `grep signing apps/ios/HelpApp/` finds only that line | work |
| i23 | **`DCBundleBase` is `http://localhost:5173/…` and ATS `NSAllowsLocalNetworking` is on.** Both must go for any real build. | not started | `apps/ios/Xcode/Info.plist` | work |
| i24 | **No app icon, no launch-screen artwork, no asset catalog, no privacy manifest.** `find apps/ios -name '*.xcassets' -o -name '*.xcprivacy'` → nothing. | not started | `apps/ios/Xcode/Help313.xcodeproj/project.pbxproj:224` relies on `INFOPLIST_KEY_UILaunchScreen_Generation = YES` | work (icon), Kyle (store account) |
| i25 | **No tests for the app target.** `apps/ios/Tests/` contains only `DetroitQueryTests`. Nothing exercises `BundleStore`, the SwiftUI screens, or the needs table. | not started | `apps/ios/Tests/DetroitQueryTests/{FixtureTests,PhoneTests}.swift` are the only test files | work |
| i26 | **Never run on a device, never signed for one; the network refresh path, the "older bundle refused" path, the cached-copy path, calling, Apple Maps, and Spanish have never been exercised.** | not started | `apps/ios/README.md` "Known problems after the first build"; the build above signs with "Sign to Run Locally" | work (+ a device) |
| i27 | **`apps/ios/Xcode/` is git-ignored**, so the project that makes the app buildable is not in the repo. A fresh clone cannot build the app without recreating it by hand. | not started | `apps/ios/.gitignore`; `apps/ios/README.md` "Making the project again" | work (decide to unignore) |

### Untested on the iPhone, summarised

`DetroitQuery` is well covered (111 shared fixture cases + a DST case + calendar arithmetic +
2 phone cases). **Everything above that line is untested**: bundle verification, checksum
refusal, the older-bundle refusal, the cache, the needs table, every screen, the emergency
fallback, and the string table. The `L.t` key sweep in this audit was done by hand because no
test does it.

---

## Part 2 — The documented backlog

Four families: (2a) DECISIONS rows still Open / Proposed / Deferred, (2b) the 31 REVIEW
weaknesses re-checked in code, (2c) unfinished rows in the hand-check worksheet, and
(2d) everything the numbered docs call "not built", "later", "v1.1", "v2" or "planned".

### 2a. DECISIONS.md — every row whose status is Open, Proposed or Deferred (12 rows)

| Date | Status | What it is | Verified status in code | Evidence | Waiting on |
|---|---|---|---|---|---|
| 2026-09-18 | Proposed | `signals.json` on R2, rewritten every ~15 min, for same-day signals with TTLs (10-B4) | not started | no `signals` anywhere in `pipeline/`, `api/`, `apps/`; `api/wrangler.toml` has one R2 binding, for photos | **Kyle** (R2 bucket, costs money) |
| 2026-09-18 | Proposed | Enroll Apple/Play developer accounts as an organization (Linwood Technologies) (10-B5) | not started | `apps/ios/Xcode/.../project.pbxproj:218` `CODE_SIGN_STYLE = Automatic`, no team | **Kyle** (account, money) |
| 2026-09-18 | Open | Still not built from step 3: Turnstile or app attestation; `signals.json` | not started | no Turnstile token or widget in `api/src/` or `apps/web/src/` | **Kyle** (Cloudflare resources) |
| 2026-09-18 | Open | Indicators not built: crashes, CDC PLACES tract map, foreclosures and evictions, council-district lens pages, a record of which neighborhoods have had a coverage pass | not started | `data/bundle/v1/indicators/neighborhoods.json` keys are `center, district, help, jlg_study_area, now, parcels, places, rings, years` — no crash, PLACES, foreclosure or eviction field; `pipeline/src/indicators.ts:10` `HELP_TOPS` | crashes → **Kyle** (SEMCOG terms); the rest → **work** |
| 2026-09-18 | Open | Before photos are on for the public: legal advice, the R2 bucket, Turnstile or app attestation, on-device face block-out | not started (the *switch* is built and off) | `api/wrangler.toml` `PHOTOS_ENABLED = "false"`; `api/src/index.ts:75` returns 503 | **Kyle** (legal advice, bucket) |
| 2026-09-18 | Open | docs/13 "Safe streets" (crashes involving people walking or biking) — the City layer holds 2011 only | not started | as above; no crash ingest script in `pipeline/src/` | **Kyle** (SEMCOG) |
| 2026-09-18 | Open | Overdose steps need review by DHD, MDHHS or counsel before a public release | not started | `strings/en.json` `od.s1…od.s6` are shipped; `od.review_note` is the only hedge | **Kyle** (counsel / DHD) |
| 2026-09-19 | Open | "Not built: page watchers, the nightly `check:sources --recheck`, and machine-raised steward tasks" | **partly stale — two of the three are now built.** The re-check and the steward tasks exist end to end; only page watchers do not, and they were deliberately superseded | built: `pipeline/src/check-sources.ts:26,31`, `pipeline/src/tasks-sync.ts:13,19,31`, `api/src/index.ts:234-249`, `admin/admin.js:90` "Pages that changed". Not built: `grep -rni watcher` over `pipeline api apps packages admin data/sources.yaml` → **no hits**. Not scheduled: the only cron is `api/wrangler.toml crons = ["17 8 * * *"]` (retention) | **work** (schedule it) + **Kyle** (CI) |
| 2026-09-19 | Open | detroitmi.gov answers 403 to scripted requests | still open, but rescoped | City events removed entirely (`pipeline/src/ingest-city.ts:2-3,73`; no `events.json` in `data/bundle/v1/index.json`); the 2026-10-18 release cliff is gone (`pipeline/src/validate.ts:76-89` fails only on a mismatch); by-eye listings are **24**, not 33 (`grep -c "bot protection" data/seed/resources.csv`) | **Kyle** (ask the City) + **a steward** (the hand checks in 2c) |
| 2026-09-19 | Deferred | SEMCOG crash data waits until after the hackathon; the email about its terms is drafted | not started | no SEMCOG source in `data/sources.yaml` | **Kyle** (send the email) |
| 2026-09-19 | Open | Call DWIHN once: does it pay for treatment for uninsured Wayne County residents, and which address is the Care Center's | not started | `data/seed/emergency.csv` carries `emg_dwihn_care_center`; no note records a call | **Kyle / a steward** (one phone call) |
| 2026-09-19 | Open | Wayne County's naloxone and test-strip station map would fill Narcan outside Detroit, but states no license | not started | `data/sources.yaml` has no Wayne County naloxone source | **Kyle** (ask the County) |

**Counts: 9 Open, 2 Proposed, 1 Deferred.**

### 2b. REVIEW-2026-09-19 weaknesses 1–31, re-checked in code

Verdicts below come from reading the current code, not the doc. 24 of 34 numbered items
(1–31 plus 10a, 10b, 30a) are genuinely fixed.

| # | Verdict | Evidence | Test? | Waiting on |
|---|---|---|---|---|
| 1 | **fixed** | `apps/web/src/main.ts:180-182` renders 911/988 and the overdose row with no bundle; `main.ts:437-438` `standsAlone`; `main.ts:75` hardcoded wins | **no** | work (a test) |
| 2 | **fixed** | overlap cancellation `packages/query/src/schedule.ts:110-114`; future days `:132`; always-open `:138-141`; a listing's own alerts `apps/web/src/main.ts:292-295` | fixtures yes (`schema/fixtures/05-cancellation.json`, 8 cases); the detail-page rendering, no | — |
| 3 | **fixed** | `pipeline/src/import-lines.ts:50,54,69-72` | yes `pipeline/test/pipeline.test.ts:310,316` | — |
| 4 | **fixed** | one strict matcher `pipeline/src/page-match.ts:33-44,53-67,147`; `check-emergency.ts:23` | yes `pipeline/test/pipeline.test.ts:272,287,298,88,100` | — |
| 5 | **fixed** | `packages/query/src/schedule.ts:29-35,50,55`; wired `pipeline/src/validate.ts:50-51` | yes `schema/fixtures/04-availability.json:232,242,252` (the *non-numeric* interval path is only covered indirectly) | — |
| 6 | **fixed** | `data/seed/resources.csv:30` Covenant House → `shelter.emergency` + `flags=youth`; `apps/web/src/needs.ts:35`; `packages/query/src/rank.ts:84` | yes `apps/web/test/web.test.ts:54-59` | — |
| 7 | **fixed** | `apps/web/src/phone.ts:4-9` → `tel:+13135792100,4217`; Swift copy `apps/ios/Sources/DetroitQuery/Phone.swift:5` | yes `apps/web/test/web.test.ts:382`; `apps/ios/Tests/DetroitQueryTests/PhoneTests.swift` | — |
| 8 | **fixed** | `pipeline/src/ingest-arcgis.ts:33,60,114-118`; same guards `ingest-city.ts:61,64` | yes `pipeline/test/pipeline.test.ts:158,172` | — |
| 9 | **fixed** | `packages/query/src/freshness.ts:18-22` `detroitDay()` used at `:25,29,34-35,50,56` | yes `schema/fixtures/06-badge.json:446` | — |
| 10 | **fixed in data, unpinned** | Brightmoor → `call_first`, no rows in `data/seed/schedules.csv` (`data/seed/resources.csv:109`); HUDA walk-in only `data/seed/schedules.csv:95` | **no** — a re-import could silently undo either | work (a test) |
| 10a | **fixed** | `apps/web/src/needs.ts:128-129` `SENSITIVE` now includes `health.mental`; `main.ts:340` filters `helpAlong` | yes `apps/web/test/web.test.ts:296` | — |
| 10b | **fixed** | `api/src/index.ts:180,182` force `reason = 'restored'`; `pipeline/src/reports-sync.ts:35-39` | yes `api/test/api.test.ts:458`, `pipeline/test/pipeline.test.ts:203` | — |
| 11 | **fixed** | `apps/web/public/sw.js:4,11-13` — `/data`, `/v1`, `/admin` skipped; only `/` can become the offline app | yes `apps/web/test/web.test.ts:361,368` (real `sw.js` in a fake browser) | — |
| 12 | **fixed** | `api/src/index.ts:300,305-310` — one `db.batch`, photo-bearing rows only excluded when there is no bucket | yes `api/test/photo.test.ts:173,186`; `api/test/api.test.ts:495` | — |
| 13 | **fixed** | `api/src/index.ts:20,55,82`; `api/src/validate.ts:38-43,73` | yes `api/test/api.test.ts:91,95` | — |
| 14 | **fixed, with a stated caveat** | masking `api/src/validate.ts:62,88,91,92`; retention `api/src/index.ts:309` | yes `api/test/api.test.ts:135,140,505` | — (caveat: *open* proposals are still kept indefinitely, by decision) |
| 15 | **fixed** | CSRF `api/src/index.ts:107-114`; framing `apps/web/public/_headers:5-10` | yes `api/test/api.test.ts:386,397,410,417,427`; `pipeline/test/preflight.test.ts:41` | — |
| 16 | **fixed** | `api/src/index.ts:75` `PHOTOS_ENABLED !== 'true'` → 503; client flag `pipeline/src/build.ts:142,149` → `apps/web/src/main.ts:154` | yes `api/test/photo.test.ts:103` | — |
| 17 | **fixed (web only)** | `apps/web/vite.config.ts:20-32` + `apps/web/src/keys.ts:14-21` | yes `apps/web/test/web.test.ts:318-335` — **but that test cannot pass here**, it also asserts `.github/workflows/publish.yml`, which is absent | — (the iPhone has no equivalent guard: see i21) |
| 18 | **fixed, one residual** | distinct-phone counting `api/src/index.ts:219-224`; label held `packages/query/src/freshness.ts:36-37`; breaker `index.ts:214-216` | yes `api/test/api.test.ts:194,204`; `schema/fixtures/06-badge.json:471-510` | **work** — the breaker's `since` is a rolling 24 h, so a sustained flood can keep it tripped and delay every real closure label by up to a day; nothing escalates a persistently-tripped breaker beyond `pipeline/src/build.ts:51` |
| 19 | **fixed** | `apps/web/src/router.ts:73-88`; wired `main.ts:563-564` | yes, real behavior `apps/web/test/router.test.ts:34-62` | — |
| 20 | **fixed** | `apps/web/src/main.ts:558` forces the retry when there is no bundle; backoff `:547-550` | **no** | work (a test) |
| 21 | **fixed** | `apps/web/src/outbox.ts:10,13-18,23,27-33`; `report.ts:85`; `propose.ts:29` | yes, real behavior `apps/web/test/outbox.test.ts:15,19,27` | — |
| 22 | **still open (partial)** | `apps/web/src/main.ts:455` covers `need, list, detail, segment, search, saved` + the `rec` tab; the **`greenway`, `parks`, `hoods` and `hood`** screens still get none, against `docs/12-gift-and-handoff.md:29`. On iPhone it is Home only (see i15) | no | **work** |
| 23 | **fixed by removal** | no `heartbeat` in any source; `pipeline/src/build.ts:142-148` takes `retired` only from `data/seed/directory.json` | yes `pipeline/test/pipeline.test.ts:642-647` | — |
| 24 | **fixed** | `admin/queue.js:15,20-21,25`; server `api/src/index.ts:123,158-167,189` | yes `api/test/admin.test.ts:16,20,24,28`; `api/test/api.test.ts:227-243` | — |
| 25 | **mostly fixed** | router (7 tests), outbox (4), service worker executed for real (`apps/web/test/web.test.ts:338-376`). Still ~28 of 60 `it()`s in `web.test.ts` assert on source text read with `readFileSync` (`:406,413,421`) | — | **work** |
| 26 | **still open** | `.keys/` holds only `dev-ed25519.pem`; `api/wrangler.toml` `database_id = "0000…"`, empty `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`; `data/bundle/v1/index.json` `"signing": "dev"`, version `nogit-20260920T1539-…`. New since the review: `pipeline/src/preflight.ts` + `pipeline/test/preflight.test.ts` | — | **Kyle** (domain, Cloudflare, keys) |
| 27 | **still open, rescoped** | events removed, not frozen (`pipeline/src/ingest-city.ts:2-3,73`); no 2026-10-18 cliff (`pipeline/src/validate.ts:76-89`); `data/seed/emergency.csv:3` shelter line `verified_published_on=2026-09-19`; by-eye listings **24**, not 33 | — | **Kyle** (ask the City) + **a steward** |
| 28 | **partly fixed** | the Xcode project now exists and **builds** (verified in Part 1); no CI builds it — there is no `.github` at all. Reports, saved places, map and neighborhood pages are still missing (i1–i5) | `swift test` yes; app target no | **work** |
| 29 | **mostly fixed; (b) still short** | (a) **29 of 205**, not 93, from `data/indicators/neighborhoods.json` at `near_miles 0.5`; (b) **4** DHD rows (`data/seed/resources.csv:115,225,313,314`) against ~18 promised at `docs/02-data-sources.md:21`; (c) **4** shower listings (`resources.csv:10,57,120,121`, matches `counts.hygiene: 4`); (d) **1** free-text phone left (`resources.csv:344`). Directory is now 369 rows / 358 active | **no count is asserted by any test** | (b) **a steward** (CHECKS §3); the rest, done |
| 30 | **built, not scheduled; watchers dropped** | `pipeline/src/check-sources.ts:6-9,38`; `pipeline/src/tasks-sync.ts:19-37`; `api/src/index.ts:234-249`; `admin/queue.js:28-36`. "Nightly" is manual: `package.json` scripts only, no workflow | yes `pipeline/test/pipeline.test.ts:688-711`; `api/test/api.test.ts:332-405` | **work** + **Kyle** (CI) |
| 30a | **three-digit gate fixed; council districts still open** | `pipeline/src/check-emergency.ts:23` → `shortCodeOnPage` (`page-match.ts:70-71`); `data/seed/emergency.csv:8` `emg_211`, `verified_published_on 2026-09-20`. Districts still come from a layer last edited **2023-12-06** (`pipeline/src/ingest-neighborhoods.ts:105,153`; `data/indicators/neighborhoods.json` → `sources.neighborhoods`) and `apps/web/src/hoods.ts:68,92` prints "Council District {n}" with no caveat | yes `pipeline/test/pipeline.test.ts:100-120` | **work** (a caveat line) |
| 31 | **one done, one withdrawn, rest open** | privacy page **built** `apps/web/src/main.ts:400-409` + `strings/en.json:312-330`, reachable at `main.ts:194,415`, with the install-key reset at `main.ts:472`. "Not an official City app" line was **deliberately removed** 2026-09-20 (`docs/DECISIONS.md:164`) — not a gap. Photo duties, overdose-steps review, store labels and the org developer account are all open | — | **Kyle** (legal, accounts) |

### 2c. `docs/CHECKS-2026-09-19.md` — unfinished rows

**56 table rows still have an empty Result cell**, plus **4 questions** in §6 that need a
person's answer but have no Result column. Nothing in the file has been filled in.

| Section | Unfinished rows | What kind of check |
|---|---|---|
| §1 The shelter line | 1 | Read 866-313-2520 on the City's homelessness page in a browser (the release no longer blocks on it, but it has not been read since 2026-09-18) |
| §2 Listings whose page scripts can't read — detroitmi.gov 19, waynemetro.org 5, cskdetroit.org 4, ywcadetroit.org 1, straymondolgc.org 1, icdonline.org 1, scottumc.org 1, brightmoorartisans.org 1 | **33** | Open each page in a normal browser and compare phone, address and hours against the listing. (Note: `data/seed/resources.csv` now carries **24** rows marked "bot protection", so the worksheet is a little ahead of the data) |
| §3 Detroit Health Department programs | **18** | Transcription: open each DHD program page and copy page URL, phone, address, hours, who it's for, cost. Only 4 DHD rows exist today |
| §4 Dearborn / Hamtramck / Highland Park | 1 | One held listing whose address the matcher can't read because the page splits the word ("Cher\<span\>ry H\</span\>ill") |
| §5 Districts 5 and 6 | 2 | Two held food listings: Corpus Christi (bot protection) and God's Storehouse (script-drawn page; its phone looks like a sample number and needs confirming) |
| §6 Food-bank distribution hosts | 1 (+4 questions) | One held Gleaners row (the matcher can't match a street starting with "St."), plus four judgement calls about Forgotten Harvest phone numbers and times |
| **Total** | **56 rows + 4 questions** | All of it waits on **a steward / a person with a browser or a phone** |

### 2d. "Not built / later / v1.1 / v2 / planned" in the numbered docs

| Doc:line | Item | Status | Evidence | Waiting on |
|---|---|---|---|---|
| 02:21 | The ~18 DHD programs | partly — 4 of ~18 | `data/seed/resources.csv:115,225,313,314` | a steward (CHECKS §3) |
| 02:28 | DDOT GTFS "how do I get there" (v2) | not started | no GTFS anywhere; `apps/web/src/transit.ts` only links out | work |
| 02:62 | Eviction defense, 36th District Court self-help, UCHC (v1.1) | not started | no such rows in `data/seed/resources.csv` | work |
| 02:83, 06:13, 09:23, DEMO:19 | Page watchers on DHD pages | not started, **and superseded** | `grep -rni watcher` over the code → no hits; `docs/DECISIONS.md:105` drops them | resolved by decision; docs still describe them |
| 02:89 | Press-release watcher for activations | not started | alerts are written by hand with `pnpm alert:new` | work |
| 04:60, 05:118 | Showing an archived row's replacement | not started | `replacement_id` exists in the type (`packages/query/src/types.ts:68`) and in `data.ts:18`, but `apps/web/src/main.ts:286` renders only the banner + 211 | work |
| 04:129, 06:76, 07:28, 08:20 | Provider self-listing / `POST /v1/provider/claim` / owner email (v1.1) | not started | `grep -rn provider api/src/*.ts` → no hits | work |
| 04:142 | Alert tool suggesting last winter's activations | not started | `pipeline/src/alert-new.ts` has no history suggestion | work |
| 04:146 | Metrics that say whether this is working (5 named) | not started — the doc says so outright | no metrics code anywhere | work |
| 05:34 | "Report a problem with the app" | not started | no such screen in `apps/web/src/main.ts` | work |
| 05:76 | Utilities refinement (DTE vs DWSD) | not started | `apps/web/src/needs.ts` has one flat utilities list | work |
| 05:92 | Overdose rescue-step illustrations | not started | `od.s1…s6` are text only | work (+ the same review as DECISIONS' overdose row) |
| 05:93 | "Narcan is also sold without a prescription at most pharmacies" line and the how-to card | not started | `grep -rn -i pharmac strings/en.json apps/web/src` → no hits | work |
| 05:101 | Map filters: open now · no ID · walk-in · wheelchair · language | not started | no filter UI; `grep` for the strings finds nothing | work |
| 05:102 | Map dots coloured by freshness badge; clustering when zoomed out | not started | `apps/web/src/map.ts` draws one dot style | work |
| 05:109 | Languages spoken, on a listing | not started | `languages` is decoded (`packages/query/src/types.ts`) and never rendered | work |
| 05:116 | Other services at this location; "also nearby" | not started | not in `detail()` (`apps/web/src/main.ts:282-310`) | work |
| 05:122 | A separate alert screen | not started (by design) | alerts are Home cards, `main.ts:172` | work |
| 05:153 | Nearest bus route name from GTFS (v2) | not started | as 02:28 | work |
| 05:155, 07:16, 10:108 | Notifications (v2, opt-in, no server identity) | not started | no `Notification`/push code in `apps/web/src` or `public/sw.js` | work |
| 06:105 | Admin: a resource editor, an alert composer, a sources status screen, a publish button | not started — the doc says so | `admin/` is the report/proposal/task queue only (`admin/admin.js`) | work |
| 06:116 | Android native (Kotlin + Compose) | not started | **resolved by decision**: "Android is the web app" (`docs/DECISIONS.md`, 2026-09-19) | resolved |
| 06:136 | Pipeline run summaries in the admin tool; an uptime check | not started | `admin/admin.js` has no run summary | work |
| 08:19 | "a reset button is not built yet" for `install_secret` | **DONE — the doc is stale** | `apps/web/src/main.ts:472` `resetInstallSecret()`, `src/report.ts:24`, banner at `main.ts:408` | doc fix only |
| 08:43 | Verify Michigan's Good Samaritan statute text before shipping | not started | no statute text is shipped today, which is the safe state | Kyle / counsel |
| 08:44 | Test-strip content (what they are, where, how to use) | not started | `grep -rn "test strip" strings/en.json apps/web/src` → no hits | work |
| 08:61 | A first-launch disclaimer screen (one screen, one tap) | not started | no first-run screen in `apps/web/src/main.ts` | work |
| 09:31 (v1.1) | Arabic (RTL), Bengali | not started | only `strings/en.json` and `strings/es.json` exist | work |
| 09:31 (v1.1) | 313SafeBeds link/embed when their public status exists | partly — the link is live, the embed is not | `apps/web/src/main.ts:255-262`, `apps/ios/HelpApp/Help.swift:44` | Kyle (partnership) |
| 09:40 (v2) | HSDS export handed to 211 / UWSEM CIE | not started | `data/hsds/` is built and committed; nobody has been given it | Kyle |
| 09:40 (v2) | Steward mobile mode | not started | `admin/` is a desktop page | work |
| 09:40 (v2) | Council-district lens pages | not started | no `lens-district` route in `apps/web/src/router.ts:26` beyond the generic lens | work (and 30a's caveat first) |
| 09:40 (v2) | Health Hub / QR-code distribution with DHD | not started | — | Kyle (DHD) |
| 09:48 Q5 | Who are the first two community stewards? Names, not roles | not started | no steward roster in the repo | **Kyle** |
| 09:48 Q6 | 313SafeBeds: teammate or link-out partner? | partly — link-out shipped 2026-09-20 | `docs/DECISIONS.md` 2026-09-20 row | **Kyle** |
| 09:48 Q7 | Ask DHD the questions in doc 02, before or after the hackathon? | not started | — | **Kyle** |
| 09:48 Q10 | Register the domain now so demo deep links are real | not started | `api/wrangler.toml` `ALLOWED_ORIGIN = "http://localhost:5173"` | **Kyle** (money) |
| 11:39, 11:44, 11:142 | Amenities on segments and parks (restroom, water, play) | not started — no amenity data exists | `data/bundle/v1/places/greenway.json` segments carry phase, typology, cross streets, lines only | work + a data source |
| 11:44 | Places as HSDS Locations (today they ship as their own files) | not started | `places/greenway.json`, `places/parks.json` in `data/bundle/v1/index.json` | work |
| 11:53 | Programs at places as HSDS Services | not started | — | work |
| 11:107 | Condition-report lifecycle `open → forwarded → acknowledged → fixed / wont_fix / duplicate` | designed, not built | today a report is `open` until a steward closes it (`api/src/index.ts`, `admin/queue.js`) | work |
| 11:165 | Out until after the hackathon: face block-out, Open311 forwarding, hazard signals on segments, trail-counter feed, the full Layer B dashboard, pool/splash-pad seasonal alerts, golf | not started (7 items) | none present in `apps/web/src` or `api/src` | work; face block-out also **Kyle** (photo legal advice) |
| 13:19 | Later: Strategic Neighborhood Fund areas; a rec-centre or park walkshed | not started | not in `pipeline/src/indicators.ts` | work |
| 13:77 | Open question: also offer the data to the City or the Joe Louis Greenway Partnership? | not started | — | **Kyle** |
| 13:77 | Open question: a partner to review the indicator list before it is public? | not started | — | **Kyle** |
| README:63 | Spanish needs a native speaker's review | not started | `strings/es.json` is machine-assisted; no reviewer named | **Kyle** (find a reviewer) |
| OPERATIONS:108-140 | First deployment, steps 1–9 (non-personal accounts, signing keys, D1, Worker, Access, WAF rate limit, logs, Pages, nightly publish) | not started — "Nothing below has been done" | `.keys/` has only the dev key; `api/wrangler.toml` placeholders | **Kyle** (all nine) |

---

## Counts

### Open backlog items by who they wait on

Counting rule: one item = one row in the tables above that is **not** "done". The iPhone gaps
(i1–i27) are counted once each; the CHECKS worksheet is counted per row.

| Waiting on | Count | Made up of |
|---|---|---|
| **Kyle** — money, accounts, legal advice, or a decision only he can make | **27** | 10 DECISIONS rows or parts of rows (signals.json ×2, store accounts, Turnstile, photos, crashes, safe-streets crashes, overdose review, SEMCOG, Wayne County map, the DWIHN call) · REVIEW 26, 27 (the ask to the City), 31 · roadmap open questions 5, 6, 7, 10 · doc 13's two open questions · the HSDS handover to 211/CIE · Health Hub with DHD · a native Spanish reviewer · the nine OPERATIONS deployment steps (counted as one) · iPhone i20 (release signing keys) |
| **A steward / a person with a browser or a phone** | **60** | all **56** unfinished rows of `docs/CHECKS-2026-09-19.md` + its **4** §6 judgement questions. Closing these also closes REVIEW 27 and the DHD half of REVIEW 29 |
| **Just work (code)** | **61** | 26 of the 27 iPhone items (i1–i19 gaps, i21–i27 release items; i20 is Kyle's) · 6 REVIEW items (18's residual, 22, 25, 28, 30's scheduling, 30a's caveat) · 1 REVIEW test debt (10, an unpinned data fix) · 28 "not built / later / v1.1 / v2" doc items in 2d marked *work* |

**Headline:** 12 DECISIONS rows open (9 Open, 2 Proposed, 1 Deferred) · 10 of the 34 REVIEW
items not fully closed (24 verified fixed) · 56 hand-check rows + 4 questions · ~45 distinct
"not built" doc items · 27 iPhone gaps and release items. Just under **40 % of everything
still open is one person reading a page or making a call**, not code; of the rest, roughly
**two-thirds is work** and **one-third needs Kyle's money, accounts or legal advice**.

### Doc claims this audit found stale

| Claim | Where | What is true |
|---|---|---|
| "CI runs it on every push"; `.github/workflows/publish.yml` | `apps/ios/README.md:4`, `CLAUDE.md`, `docs/OPERATIONS.md:113`, `docs/README.md` | **There is no `.github` directory and no `.git` in this working copy.** One web test (`apps/web/test/web.test.ts:334`) fails for exactly this reason |
| "a reset button is not built yet" | `docs/08-privacy-safety.md:19` | It is built (`apps/web/src/main.ts:472`) |
| "Not built: page watchers, the nightly `check:sources --recheck`, and machine-raised steward tasks" | `docs/DECISIONS.md` 2026-09-19 Open row | The re-check and the steward tasks are built; only page watchers are not, and they were superseded |
| "33 listings can only be checked by eye" | `docs/REVIEW-2026-09-19.md:27`, `docs/CHECKS-2026-09-19.md` §2 | `data/seed/resources.csv` now marks **24** |
| "93 of 205 neighborhoods with no food listed nearby" | `docs/REVIEW-2026-09-19.md:29` | **29 of 205** at half a mile, from `data/indicators/neighborhoods.json` |
| "only 2 shower listings", "two phone numbers in free text" | `docs/REVIEW-2026-09-19.md:29` | 4 showers; 1 free-text phone left (`data/seed/resources.csv:344`) |
| "The iPhone screens have never been compiled" | `docs/REVIEW-2026-09-19.md:28` | They compile and the build succeeds with 0 warnings (verified today) |
| "the same 77 fixture cases" | `docs/README.md:72`, review strengths | 111 cases today, all passing in Swift |
| "'list is old' banners … on every list and listing" | `docs/DECISIONS.md` 2026-09-19 (Accepted) | The web app misses `greenway`, `parks`, `hoods`, `hood`; the iPhone app shows it on Home only |
