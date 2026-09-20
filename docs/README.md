# 313 Help — Design Documents

**313 Help** (named 2026-09-19). A standalone app, separate from CommunityChest, that rebuilds the intent of the Detroit Health Department's "D Compassion" app (released by a vendor in 2025 as the "Detroit Compassion App") without collecting anything about the people who use it.

## One-sentence pitch

A resource app for every Detroiter that stores nothing about you, works on a cheap Android phone with bad signal, and never sends you to a pantry that closed last month.

## How to read these

| # | Doc | Read it when you want to know… |
|---|-----|-------------------------------|
| 01 | [Vision & scope](01-vision-scope.md) | Who it's for, what it is, what it is not, the principles every decision is tested against |
| 02 | [Data sources](02-data-sources.md) | What data exists, how we get it, how trustworthy it is, how often it changes |
| 03 | [Data model](03-data-model.md) | The schema (HSDS-aligned), freshness fields, category taxonomy |
| 04 | [Resource lifecycle](04-resource-lifecycle.md) | **The core of the app**: how resources are added, verified, reported, expired, archived |
| 05 | [Features & flows](05-features-flows.md) | Screens, the on-device "find what I need" flow, map, detail, reporting UI |
| 06 | [Architecture](06-architecture.md) | Pipeline, hosting, app stack, offline strategy, admin tool |
| 07 | [Gap analysis](07-gap-analysis.md) | What D Compassion had, what it lacked, what we add |
| 08 | [Privacy & safety](08-privacy-safety.md) | No-PII design, anonymous reporting, youth, harm-reduction content, App Store review |
| 09 | [Roadmap & open questions](09-roadmap.md) | Hackathon scope, v1, v2, decisions Kyle needs to make |
| 10 | [Adversarial audit](10-adversarial-audit.md) | Where docs 01–09 break their own rules, ranked, with fixes and a web fact-check. **Read before building.** |
| 11 | [Healthy places](11-greenway-public-places.md) | Approved: Joe Louis Greenway, parks, rec sites; condition reports with photos under zero-PII; impact measurement |
| 12 | [Gift & handoff](12-gift-and-handoff.md) | What "open-source gift to the city" demands of the design: unattended operation, old-copy notes and retiring on purpose, transfer checklist, costs |
| 13 | [Neighborhood indicators](13-neighborhood-indicators.md) | Citywide public-data picture for all 205 neighborhoods; honesty rules; the greenway as one lens |
| — | [research/](research/) | Source research: Wayne County data, the 2026-09-19 [new kinds of help](research/2026-09-19-new-help/README.md) (jobs, treatment, housing, legal, IDs and more), and [2026-09-20](research/2026-09-20/) (the held backlog, the hand checks read in a browser, the empty categories, emergency rooms and urgent care) |
| — | [AUDIT-2026-09-20.md](AUDIT-2026-09-20.md) | **What is active versus only planned**, checked in the code and data, with four detailed reports in [audit-2026-09-20/](audit-2026-09-20/) |
| — | [ACCESSIBILITY-AUDIT-2026-09-20.md](ACCESSIBILITY-AUDIT-2026-09-20.md) | Full WCAG 2.2 AA pass over the web app: 44 pass, 21 fixed, 4 open with reasons |
| — | [DEPLOY-HANDOFF-2026-09-20.md](DEPLOY-HANDOFF-2026-09-20.md) | **For Kyle**: the six deploy blockers, in order, with what each costs and what proves it |
| — | [CHECKS-2026-09-20.md](CHECKS-2026-09-20.md) | Steward worksheet: the differences found on 2026-09-20, the browser looks and the calls still owed |
| — | [REVIEW-2026-09-19.md](REVIEW-2026-09-19.md) | SWOT after the build-out, the plan to ship, and the decisions waiting on Kyle |
| — | [DEMO.md](DEMO.md) | Demo-day checklist: commands, the beats, what to do if something breaks |
| — | [OPERATIONS.md](OPERATIONS.md) | Running it locally, the regular work, first deployment (needs Kyle), secrets, handover |
| — | [DECISIONS.md](DECISIONS.md) | Decisions the docs don't cover; audit fixes awaiting approval |
| — | [CLAUDE.md](../CLAUDE.md) | Handoff instructions for Claude Code |

## Build

```
pnpm install             # needs pnpm 12 (see OPERATIONS.md)
pnpm test                # query fixture cases + pipeline, API and web tests
pnpm build:bundle        # data/seed + data/ingested -> data/hsds + data/bundle/v1 (signed, dev key)
pnpm ingest:opendata     # City open-data layers into data/ingested and data/staging, plus the greenway
                         # segments and the City's events, parks and ZIP areas
pnpm ingest:transit      # the 11 transport layers for the Map tab. By hand, about monthly — on purpose
                         # it is NOT in the nightly publish (DECISIONS 2026-09-20)
pnpm ingest:mymap        # Wayne County's Well Wayne Stations map (Google My Maps KML) -> data/ingested/
pnpm check:sources       # promote proposed rows whose source page matches
pnpm geocode             # fill coordinates in data/seed/resources.csv (U.S. Census geocoder)
pnpm smoke -- https://<origin> --i-own-this-origin   # ask a LIVE origin what preflight cannot see
```

Other scripts, explained in [OPERATIONS.md](OPERATIONS.md): `pnpm ingest:basemap`, `pnpm ingest:neighborhoods`, `pnpm ingest:treatment`, `pnpm check:emergency`, `pnpm import:lines`, `pnpm alert:new`, `pnpm keys:generate`, `pnpm build:bundle:release`.

`pnpm smoke` only ever sends requests the API must refuse — about thirty of them — so it can never store anything, and it refuses to run without `--i-own-this-origin`. Run it after any change to the Cloudflare Access policy or the WAF rate-limiting rule, and re-sign `api/edge-protections.md` in the same commit if either is removed.

`pnpm build:bundle:release` fails if an emergency number's own page was read and showed a different number (`mismatch_on`, from `pnpm check:emergency`) until a person fixes it, and unless `BUNDLE_SIGNING_KEY` is set. A page that can't be read never blocks it (DECISIONS 2026-09-19). `pnpm preflight` says whether a checkout is ready to deploy.

## Status

- 2026-09-20 (coordinated build): **528 listings, four tabs with one Map, an accessibility pass, an Android client written, and the deploy blockers cleared down to Kyle's own steps.**
  - *Data:* **528 listings**, up from 418. Every category in docs/03 now has at least one live listing except warming and cooling centers, which are alert-driven and empty on purpose. Two new kinds of help, `health.er` (emergency room) and `health.urgent` (urgent care) — they cannot be `health.clinic`, which means free or low-cost, and none of these places says it is. 26 Wayne County naloxone and test-strip stations arrive through a new reader for Google My Maps KML (`pnpm ingest:mymap`); they publish a city and a point and **no street address**, which the pipeline, the bundle, the web app and the iPhone app all now handle without inventing one. 23 Health Department programs are live at last.
  - *Tabs:* **Home · Help · Map · Events.** Recreation and Transit are one Map tab with a layer switcher, and **11 transport layers** (DDOT and SMART routes and stops, QLINE, People Mover, MoGo, bike lanes, Amtrak, intercity buses, park-and-ride) ride in the signed bundle, drawn on the device with no tile server and no runtime request to any of their owners. `pnpm ingest:transit`, run **by hand about monthly** — deliberately not in the nightly job.
  - *Laptops:* everything new sits inside `@media (min-width:64rem)`, so a phone — and a laptop at 400% zoom — renders exactly as before, pixel for pixel. The tab bar becomes a side rail with Urgent help first in it.
  - *Accessibility:* a full **WCAG 2.2 AA** pass: **44 pass, 21 failures found and fixed, 4 left open with reasons** ([ACCESSIBILITY-AUDIT-2026-09-20.md](ACCESSIBILITY-AUDIT-2026-09-20.md)). The big one: every live region in the app was being rebuilt by `innerHTML` and therefore never announced, so nothing that happened without a screen change was ever heard.
  - *iPhone:* reports with an offline outbox, saved places, an About and privacy screen with a key reset, and a release gate that refuses to build without a real origin and two real pinned keys. **28 app tests** beside the 111 shared fixture cases.
  - *Android:* `apps/android` now holds a Kotlin client — platform Views, no Compose, no AndroidX, no dependency of any kind in the APK, and a **third** implementation of the shared query rules. **It has never been compiled:** this Mac has no JDK, Kotlin, Gradle or Android SDK, and installing them is a download Kyle must OK. The PWA is still the Android answer.
  - *Deploy:* `api/edge-protections.md` is a signed attestation for the two protections no script can see; `pnpm smoke` proves them from outside against a live origin; `api/test/scheduled.test.ts` holds the first cron run to changing nothing. Kyle committed the real D1 database id.
  - *Checks:* `pnpm test` is **461** (query 111, api 80, pipeline 161, web 109), plus 111 Swift fixture cases and 28 iOS app tests. Differences for a steward are in **[CHECKS-2026-09-20.md](CHECKS-2026-09-20.md)**.
  - *Planned, not started:* **Arabic and Bengali.** Kyle asked that they wait until everything else is finished; each will be machine-drafted and each will need a native reviewer before it ships.

- 2026-09-20 (audit): **[What is active versus only planned](AUDIT-2026-09-20.md).** The app, the data and the Worker are real and tested; nothing is deployed and nothing scheduled has ever run. (While the audit ran, this working copy had lost its `.git` and `.github/`, which made the workflows look missing and failed one test; both were restored the same day and everything was merged.) Six deploy blockers, 56 unfinished hand-checks, 12 open decisions. Two bugs found and fixed during the audit: the About screen would have printed a raw string key, and the tab bar reserved five columns for four tabs.

- 2026-09-20 (later): **313SafeBeds first for shelter, a modern iPhone app, and the City disclaimer removed.**
  - "I need a safe place to sleep tonight" now opens with **313SafeBeds** (313safebeds.com), above the shelter lines, in both apps. Its own page was read in a browser on 2026-09-20; we link to it and copy nothing from it (Kyle's call).
  - The iPhone screens follow the web design system: green palette in light and dark, cards, uppercase section headings, status pills, two-column tiles of one size, a red 911 row, call buttons that show the number. Apple's `LocationButton` is replaced by an ordinary SwiftUI button with the standard permission flow, because it drew its own label clipped.
  - The greenway is drawn **like a transit line**: one width with a casing, a colour and dash per phase, station dots at the joins, the chosen stretch bright and the rest dimmed, and a key in words under the map.
  - The **"Not an official City of Detroit app" line is removed everywhere** (both apps, both strings files, NOTICE, and the preflight check). See DECISIONS for what that leaves resting on the store listing.

- 2026-09-20: **SAMHSA's lists, a tighter Help tab, and the iPhone app's first build.**
  - *Treatment data:* `pnpm ingest:treatment` reads SAMHSA's National Directory and OTP list with DWIHN's provider directory, stages all 50 programs in the four cities with a decision and a reason, and writes import lines only where DWIHN names a program's own website; `check:sources` still decides. 5 new treatment listings are live (including the first in Hamtramck), 4 wait for a person, 20 are held. Sober homes, DUI-only programs and programs with no low-cost payment are never listed. A small built-in `.xlsx` reader, no new dependency.
  - *UI:* the Help tab fits about three phone screens instead of five — "Right now" keeps full sentences, the other two groups are tiles, and browsing by type is one row that opens. Home's shortcuts add drugs-or-alcohol help and jobs. Spanish loads only when chosen (main script 82 → 66 KB gzipped).
  - *Data:* 418 listings. 31 more food listings in the thinnest neighborhoods: 10 pantries, senior meals and food help researched one by one, then 14 Forgotten Harvest mobile stops and 7 Gleaners drive-up and walk-up sites, each from that food bank's own page (DECISIONS 2026-09-19) and call-first with the dates it publishes. Neighborhoods with no food listed within half a mile of the neighborhood: 29 of 205 (98 have none within half a mile of their center point). 288 rows now wait in `to-verify.csv`, each with a reason; the remaining food gaps are mostly places that publish only on Facebook or in directories, which need a phone call.
  - *Checks:* 211 is now checked against mi211.org like every other urgent number; only 911 and 988 are never checked.
  - *iPhone:* the SwiftUI screens compile and run in the simulator for the first time (one two-line fix), reading the signed snapshot offline. See `apps/ios/README.md`.
  - *Still blocked:* detroitmi.gov's bot protection comes and goes, so the Health Department's ~14 programs and the shelter line's page still need a person with a browser.

- 2026-09-19 (evening): **New kinds of help** (Kyle: jobs and training, drug and alcohol treatment, then "all of these"). Research in [research/2026-09-19-new-help/](research/2026-09-19-new-help/README.md): eleven topics, each organization read on its own pages. 132 listings entered, 128 matched their own page and are live (382 listings in the bundle now); 173 held for a person with reasons. New categories and a third Help group, "Work, school, and paperwork"; "I want help with drugs or alcohol" and "Help after sexual assault" under Right now, numbers first. Treatment and assault listings are private but findable (no save, no history, quick exit; address and map kept). 88 link-outs to programs you apply for online, in both languages, hiding themselves after an application closes. Four new urgent numbers, each matched on its owner's page. A shelter's address is shown only if the shelter publishes it (a build check). Three questions for Kyle are Open in DECISIONS.
- 2026-09-19 (later): **Kyle's review decisions built (Phases 1-2 of docs/REVIEW-2026-09-19.md) and Phase 3-4 started.**
  - *Safety and privacy:* cancellations close any window they overlap and show on the listing; schedules are validated strictly and never guessed at; phone links dial extensions correctly; urgent help and overdose steps work before the list loads; "I'm under 25" lists shelters, youth shelters first; the service worker never caches the API or steward page; photos have a switch, off by default; release web builds must pin two good keys; one strict page matcher for listings and emergency numbers; a release fails only on an emergency-number mismatch; City events dropped; the Worker's retention, masking, hour rule, CSRF, photo claim and restore fixes; one phone = one report.
  - *Reliability:* back/forward and links (history holds only a random key), first-load retry, a locked offline queue that keeps 429s, admin queue fixes, Access key rotation, the nightly re-check as steward tasks.
  - *Data:* HUDA walk-in hours, Brightmoor Connection call-first, two more shower listings, phones out of free text, wording fixes. A hand-check worksheet (docs/CHECKS-2026-09-19.md) for the pages scripts can't read and the DHD programs.
  - *Deploy readiness:* a privacy page with a key reset, "not an official City app" on Home (removed 2026-09-20, DECISIONS), `pnpm preflight`.
- 2026-09-19: **Upkeep.** Dependencies and CI brought up to date: pnpm 12, Node 22, Vite 8, Vitest 5, TypeScript 7, Wrangler 4; CI runs typecheck, tests, the bundle and the web build, plus the Swift `DetroitQuery` tests in the `swift:6.3-noble` container. Full data refresh: every source re-read, no source changes. detroitmi.gov now blocks scripts, so 33 listings and the shelter line's page need a person's check, and City events stay at the last good file (DECISIONS). Independent reviews of the code and docs done. Numbers today: 178 listings (118 seed rows, all active, plus 60 DHD stations); 93 of 205 neighborhoods with no food listed within half a mile; 0 open greenway segments with no help within a 10-minute walk; app JS about 57 KB gzipped plus 4 KB of CSS.
- 2026-09-18 (evening): **Everything in the hackathon scope is built** except what needs Kyle's accounts (domain, Cloudflare, signing keys), legal advice (public photos), or a Mac (compiling the iPhone screens). In this pass:
  - **178 listings.** 57 were researched on each organization's own site in Districts 1, 2, 3, 4 and 7 and published only after `check:sources` matched the phone number and street number on that page; four sites that block scripts were checked by a person in a browser. Neighborhoods with no food listed within half a mile went from 160 to 93 of 205.
  - **Street map** drawn on the phone from City open data: streets, parks, the greenway and cross streets, with no tile server (docs/06).
  - **Search, Type a ZIP, Saved places, Add a place, help paying for food** (docs/05).
  - **Neighborhood pages for all 205 neighborhoods** (docs/13 steps 2–4): help nearby, home sales next to building permits, and conditions (blight tickets per 1,000 lots, demolitions, time to close reported problems). No rankings; counts under 5 hidden. Crash data isn't available as current open data (DECISIONS).
  - **Photos on condition reports** (docs/11 hackathon slice): no metadata can reach storage, only stewards can see them, and they are deleted on time. Demo only until the legal advice is in hand.
  - **Spanish** for every screen; the words each place wrote about itself stay in English and are marked as such. Needs a native speaker's review.
  - **Alert tool** (`pnpm alert:new`, with a `--demo` mode) and the **nightly publish workflow**, which stays off until `PUBLISH_ENABLED` is set.
  - **iPhone:** `apps/ios` has `DetroitQuery`, a Swift copy of the query rules that passes all 77 fixtures (in CI), and the SwiftUI screens, which still need a first build in Xcode (see `apps/ios/README.md`).
- 2026-09-18: **Directory grew from 91 to 121 listings**: 16 City recreation centers, 2 libraries, and 12 help listings near greenway segments that had nothing nearby. Open segments with no help within a 10-minute walk: 9 → 3 (→ 0 after the District listings).
- 2026-09-18: **Build step 4 done** — `admin/` steward queue (plain HTML + JS, no build step): reported listings first, proposals, archive/restore with reasons, circuit-breaker banner. Steward decisions live in D1 and are applied at build time; the full demo loop (report → queue → archive → rebuild → "Closed as of today") runs locally. Repo made public (now `313-help`).
- 2026-09-18: **Redesign** — five tabs (Home · Help · Recreation · Transit · Events), green design system, Urgent help in the top bar instead of a red strip, City events and 302 parks in the bundle, bus directions on every listing. See 05 and DECISIONS.
- 2026-09-18: **Build step 3 done** — `api/` Worker (Hono) + D1 schema: anonymous reports and proposals, steward endpoints behind Cloudflare Access, retention, circuit breaker; report buttons and offline queue in the PWA; report facts flow into the bundle build. Runs locally end to end; **nothing is deployed** (see [OPERATIONS.md](OPERATIONS.md)). Next: `admin/` steward queue.
- 2026-09-18: **Build step 2 done** — `apps/web` PWA: needs list on Home, results, detail, greenway with offline SVG map, signed-bundle verification, IndexedDB offline, 29 KB gzipped. `pnpm --filter @313help/web dev`. Next: `api/` Worker + D1 for reports.
- 2026-09-18: **Build step 1 done** — seed CSVs, shared query package with fixtures, pipeline, HSDS 3.2-valid export, signed bundle (86 rows). Next: `apps/web` PWA.
- 2026-09-18: Drafted for review. Nothing built yet. Audited the same day (doc 10); fixes are listed as *Proposed* in DECISIONS.md and are not yet applied to docs 01–09.
- DHD program staff are aware of this project and informally supportive of reusing the public information from the D Compassion build. DHD has not offered to maintain any data or feed, and there is no written authorization; the design assumes neither (see 02 and 08).

## The three ideas that make this app different

1. **Stores nothing.** No accounts, no intake, no contact info. Triage runs on the phone. There is no resident data to secure because there isn't any. This is also why it can ship without a city procurement process.
2. **Freshness is the product.** Every resource carries the dates we know about it, a plain badge that says what those dates mean, and a one-tap "this is wrong / closed / moved" report. Resources age out visibly instead of silently lying.
3. **The data outlives the app.** Resources are published as an open, HSDS-shaped dataset that DHD, 211/CIE, or anyone else can consume. If the app dies, the directory doesn't.
