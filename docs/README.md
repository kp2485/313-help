# Detroit Compass — Design Documents

**Detroit Compass** (named 2026-09-18; older docs and internal package names say "DetroitHelp"). A standalone app, separate from CommunityChest, that rebuilds the intent of the Detroit Health Department's "D Compassion" app (released by a vendor in 2025 as the "Detroit Compassion App") without collecting anything about the people who use it.

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
| — | [REVIEW-2026-09-19.md](REVIEW-2026-09-19.md) | SWOT after the build-out, the plan to ship, and the decisions waiting on Kyle |
| — | [DEMO.md](DEMO.md) | Demo-day checklist: commands, the beats, what to do if something breaks |
| — | [OPERATIONS.md](OPERATIONS.md) | Running it locally, the regular work, first deployment (needs Kyle), secrets, handover |
| — | [DECISIONS.md](DECISIONS.md) | Decisions the docs don't cover; audit fixes awaiting approval |
| — | [CLAUDE.md](../CLAUDE.md) | Handoff instructions for Claude Code |

## Build

```
pnpm install             # needs pnpm 12 (see OPERATIONS.md)
pnpm test                # 77 query fixture cases + pipeline, API and web tests
pnpm build:bundle        # data/seed + data/ingested -> data/hsds + data/bundle/v1 (signed, dev key)
pnpm ingest:opendata     # City open-data layers into data/ingested and data/staging, plus the greenway
                         # segments and the City's events, parks and ZIP areas
pnpm check:sources       # promote proposed rows whose source page matches
pnpm geocode             # fill coordinates in data/seed/resources.csv (U.S. Census geocoder)
```

Other scripts, explained in [OPERATIONS.md](OPERATIONS.md): `pnpm ingest:basemap`, `pnpm ingest:neighborhoods`, `pnpm check:emergency`, `pnpm import:lines`, `pnpm alert:new`, `pnpm keys:generate`, `pnpm build:bundle:release`.

`pnpm build:bundle:release` fails until every emergency number in `data/seed/emergency.csv` (except the three-digit national ones) matched its owner's page within 30 days (`pnpm check:emergency`) or was phoned within 30 days, and `BUNDLE_SIGNING_KEY` is set. That is on purpose.

## Status

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
- 2026-09-18: **Build step 4 done** — `admin/` steward queue (plain HTML + JS, no build step): reported listings first, proposals, archive/restore with reasons, circuit-breaker banner. Steward decisions live in D1 and are applied at build time; the full demo loop (report → queue → archive → rebuild → "Closed as of today") runs locally. Repo renamed `detroit-compass` and made public.
- 2026-09-18: **Redesign** — five tabs (Home · Help · Recreation · Transit · Events), green design system, Urgent help in the top bar instead of a red strip, City events and 302 parks in the bundle, bus directions on every listing. See 05 and DECISIONS.
- 2026-09-18: **Build step 3 done** — `api/` Worker (Hono) + D1 schema: anonymous reports and proposals, steward endpoints behind Cloudflare Access, retention, circuit breaker; report buttons and offline queue in the PWA; report facts flow into the bundle build. Runs locally end to end; **nothing is deployed** (see [OPERATIONS.md](OPERATIONS.md)). Next: `admin/` steward queue.
- 2026-09-18: **Build step 2 done** — `apps/web` PWA: needs list on Home, results, detail, greenway with offline SVG map, signed-bundle verification, IndexedDB offline, 29 KB gzipped. `pnpm --filter @detroithelp/web dev`. Next: `api/` Worker + D1 for reports.
- 2026-09-18: **Build step 1 done** — seed CSVs, shared query package with fixtures, pipeline, HSDS 3.2-valid export, signed bundle (86 rows). Next: `apps/web` PWA.
- 2026-09-18: Drafted for review. Nothing built yet. Audited the same day (doc 10); fixes are listed as *Proposed* in DECISIONS.md and are not yet applied to docs 01–09.
- DHD program staff are aware of this project and informally supportive of reusing the public information from the D Compassion build. DHD has not offered to maintain any data or feed, and there is no written authorization; the design assumes neither (see 02 and 08).

## The three ideas that make this app different

1. **Stores nothing.** No accounts, no intake, no contact info. Triage runs on the phone. There is no resident data to secure because there isn't any. This is also why it can ship without a city procurement process.
2. **Freshness is the product.** Every resource carries the dates we know about it, a plain badge that says what those dates mean, and a one-tap "this is wrong / closed / moved" report. Resources age out visibly instead of silently lying.
3. **The data outlives the app.** Resources are published as an open, HSDS-shaped dataset that DHD, 211/CIE, or anyone else can consume. If the app dies, the directory doesn't.
