# 313 Help — Design Documents

**313 Help** (named 2026-09-19). A standalone app, separate from CommunityChest, that rebuilds the intent of the Detroit Health Department's "D Compassion" app (released by a vendor in 2025 as the "Detroit Compassion App") without collecting anything about the people who use it.

## One-sentence pitch

A resource app for every Detroiter that stores nothing about you, works on a cheap Android phone with bad signal, and never sends you to a pantry that closed last month. **Live at <https://313help.com>.**

## How to read these

| # | Doc | Read it when you want to know… |
|---|-----|-------------------------------|
| 01 | [Vision & scope](01-vision-scope.md) | Who it's for, what it is, what it is not, the principles every decision is tested against |
| 02 | [Data sources](02-data-sources.md) | What data exists, how we get it, how trustworthy it is, how often it changes |
| 03 | [Data model](03-data-model.md) | The schema (HSDS-aligned), freshness fields, category taxonomy |
| 04 | [Resource lifecycle](04-resource-lifecycle.md) | **The core of the app**: how resources are added, verified, reported, expired, archived |
| 05 | [Features & flows](05-features-flows.md) | Screens, the on-device "find what I need" flow, the Map tab and its layers, detail, reporting UI, the four languages |
| 06 | [Architecture](06-architecture.md) | Pipeline, hosting, the three app stacks, offline strategy, admin tool |
| 07 | [Gap analysis](07-gap-analysis.md) | What D Compassion had, what it lacked, what we add |
| 08 | [Privacy & safety](08-privacy-safety.md) | No-PII design, anonymous reporting, youth, harm-reduction content, App Store review |
| 09 | [Roadmap](09-roadmap.md) | Features by horizon (Now · Next · Later): provider-verified listings first, then the path from Detroit to Michigan to national, and a short list of open questions. The short version is in [/README.md](../README.md) |
| 10 | [Adversarial audit](10-adversarial-audit.md) | Where docs 01–09 break their own rules, ranked, with fixes and a web fact-check. **Read before building.** |
| 11 | [Healthy places](11-greenway-public-places.md) | Approved: Joe Louis Greenway, parks, rec sites; condition reports with photos under zero-PII; impact measurement |
| 12 | [Gift & handoff](12-gift-and-handoff.md) | What "open-source gift to the city" demands of the design: unattended operation, old-copy notes and retiring on purpose, transfer checklist, costs |
| 13 | [Neighborhood indicators](13-neighborhood-indicators.md) | Citywide public-data picture for all 205 neighborhoods; honesty rules; the greenway as one lens |
| 14 | [Provider-verified listings](14-provider-verified-listings.md) | "Is this listing right?": the people who run a place confirm or fix it with a one-use link a steward emails. Kyle's seven decisions, and what was built (2026-09-24) |
| — | [research/](research/) | Source research: Wayne County data, the 2026-09-19 [new kinds of help](research/2026-09-19-new-help/README.md) (jobs, treatment, housing, legal, IDs and more), [2026-09-20](research/2026-09-20/) (the held backlog, the hand checks read in a browser, the empty categories, emergency rooms and urgent care), and 2026-09-22: [offline directions](research/2026-09-22-offline-directions.md) from the data already in the bundle, and [neighborhood-level information](research/2026-09-22-neighborhoods-three-cities.md) for Hamtramck, Highland Park and Dearborn |
| — | [AUDIT-2026-09-20.md](AUDIT-2026-09-20.md) | **What is active versus only planned**, checked in the code and data, with four detailed reports in [audit-2026-09-20/](audit-2026-09-20/) |
| — | [CATEGORY-AUDIT-2026-09-22.md](CATEGORY-AUDIT-2026-09-22.md) | Every listing's category checked against its own words: 8 re-filed, the one-row-per-service rule, the eight map layers, and the judgement calls left for Kyle |
| — | [NAVIGATION-AUDIT-2026-09-22.md](NAVIGATION-AUDIT-2026-09-22.md) | Navigation and information architecture across the three clients, walked live: the findings behind the 2026-09-22 rebuild (one map opening rule, help on the Map, the Areas tab as a map, Parks and paths) |
| — | [CHECKS-2026-09-22.md](CHECKS-2026-09-22.md) | Steward worksheet for the police and fire stations: the pages a person still has to read, and the by-hand rows |
| — | [ACCESSIBILITY-AUDIT-2026-09-20.md](ACCESSIBILITY-AUDIT-2026-09-20.md) | Full WCAG 2.2 AA pass over the web app: 44 pass, 27 fixed, 0 open |
| — | [ACCESSIBILITY-TEST-SCRIPT.md](ACCESSIBILITY-TEST-SCRIPT.md) | The script for sessions with people who use assistive technology |
| — | [MAP-STYLE.md](MAP-STYLE.md) | The shared spec for the Map's two styles, Standard and Subway, on all three clients |
| — | [DEPLOY-HANDOFF-2026-09-20.md](DEPLOY-HANDOFF-2026-09-20.md) | The deploy runbook: the six steps, in order, with what each costs and what proves it. Done on 2026-09-20/21; kept for a handover or a rebuild |
| — | [CHECKS-2026-09-20.md](CHECKS-2026-09-20.md) | Steward worksheet: the differences found on 2026-09-20, the browser looks and the calls still owed, and **what a native reviewer of Arabic and Bengali should read first** |
| — | [CHECKS-2026-09-19.md](CHECKS-2026-09-19.md) | The previous worksheet. All 56 unfinished rows were worked on 2026-09-20; `pnpm preflight` still reads it |
| — | [REVIEW-2026-09-19.md](REVIEW-2026-09-19.md) | SWOT after the build-out, the plan to ship, and the decisions waiting on Kyle |
| — | [DEMO.md](DEMO.md) | Demo-day checklist: commands, the beats, what to do if something breaks |
| — | [OPERATIONS.md](OPERATIONS.md) | Running it locally, the regular work, deployment, secrets, handover |
| — | [DECISIONS.md](DECISIONS.md) | Decisions the docs don't cover; audit fixes awaiting approval |
| — | [CLAUDE.md](../CLAUDE.md) | Handoff instructions for Claude Code |
| — | [/README.md](../README.md) | The product's front page: who it is for, what is in it, how listings stay fresh, privacy, and the roadmap. Written for people who are not going to read these docs |

## Build

```
pnpm install             # needs pnpm 12 (see OPERATIONS.md)
pnpm test                # query fixture cases + pipeline, API and web tests
pnpm build:bundle        # data/seed + data/ingested -> data/hsds + data/bundle/v1 (signed, dev key)
pnpm ingest:opendata     # City open-data layers into data/ingested and data/staging, plus the greenway
                         # segments, the police and fire stations, and the City's parks and ZIP areas
pnpm ingest:region       # the service area from the SMART and DDOT feeds and TIGER outlines -> data/ingested/region.json
                         # (run first: the basemap, ZIPs, city pages and station layers all read it)
pnpm ingest:cities       # the city pages (SEMCOG, Census, TIGER, Wayne County numbers for the first four) -> data/ingested/cities.json
pnpm ingest:transit      # the 11 transport layers for the Map tab. By hand, about monthly — on purpose
                         # it is NOT in the nightly publish (DECISIONS 2026-09-20)
pnpm ingest:mymap        # Wayne County's Well Wayne Stations map (Google My Maps KML) -> data/ingested/
pnpm check:sources       # promote proposed rows whose source page matches
pnpm geocode             # fill coordinates in data/seed/resources.csv (U.S. Census geocoder)
pnpm smoke -- https://<origin> --i-own-this-origin   # ask a LIVE origin what preflight cannot see
```

Other scripts, explained in [OPERATIONS.md](OPERATIONS.md): `pnpm ingest:basemap`, `pnpm ingest:neighborhoods`, `pnpm ingest:treatment`, `pnpm ingest:crashes`, `pnpm check:emergency`, `pnpm import:lines`, `pnpm alert:new`, `pnpm keys:generate`, `pnpm tasks:sync`, `pnpm build:bundle:release`.

`pnpm smoke` only ever sends requests the API must refuse — about thirty of them — so it can never store anything, and it refuses to run without `--i-own-this-origin`. Run it after any change to the Cloudflare Access policy or the WAF rate-limiting rule, and re-sign `api/edge-protections.md` in the same commit if either is removed.

`pnpm build:bundle:release` fails if an emergency number's own page was read and showed a different number (`mismatch_on`, from `pnpm check:emergency`) until a person fixes it, and unless `BUNDLE_SIGNING_KEY` is set. A page that can't be read never blocks it (DECISIONS 2026-09-19). `pnpm preflight` says whether a checkout is ready to deploy.

## Status — a short changelog

One or two lines per date; the reasoning behind each change is in [DECISIONS.md](DECISIONS.md) under the same date.

- **2026-09-24 — Wherever the buses go.** The service area is every city and township a DDOT or SMART bus stops in
  or runs through: 75 places in Wayne, Oakland and Macomb counties, worked out from the feeds by `pnpm
  ingest:region` (DECISIONS 2026-09-24). TIGER streets and SEMCOG parks outside Detroit; every DDOT and SMART route
  whole and tested to lie inside the outlines; directions build only the trip's window ([query-spec, "The trip
  window"](../schema/query-spec.md)); each place's own police line on its page; Oakland's and Macomb's shelter,
  crisis and sexual-assault lines beside Wayne's; 139 ZIPs; 77 Well Wayne stations. The 71 new places have an
  outline and their help, not yet statistics. Then the first pass of listings there: 1,075 published (723 → 1,798),
  each matched on its owner's page, 95 of them phone-only or unplaceable and ranked by a coarse area as DV rows are;
  federal fire, police, hospital, library and health-center records staged as candidates (`pnpm ingest:federal`);
  52 more waiting for a person with a browser (DECISIONS 2026-09-24).
- **2026-09-22 — Directions, one tab set, and the Areas map.** Offline walking and bus directions on all three
  clients, from the street graph and transit files already in the bundle: A* with the City's own safety fields as
  the penalty, published headways only, ranges never times, at most one change, traceless
  ([research](research/2026-09-22-offline-directions.md)). The tab set becomes Home · Help · Map · Areas on
  every client after the [navigation audit](NAVIGATION-AUDIT-2026-09-22.md): every map opens on your location,
  else a typed cross street, else City Hall, two miles around; the Map tab opens with help on it and the
  neighborhood and city boundaries on by default at every zoom ([MAP-STYLE §15](MAP-STYLE.md)); the Areas tab
  is a map zoomed to the outline you stand in, the list one control away, an area page under a collapsing
  strip; the greenway is one row inside Parks and paths. City pages for Hamtramck, Highland Park and Dearborn
  ([research](research/2026-09-22-neighborhoods-three-cities.md); SEMCOG's agreement accepted as it stands).
  Neighborhood pages: exact numbers everywhere (no small-count suppression, crashes included), bus stops and
  Bridge-card stores counted strictly inside the outline, Table | Chart on the by-year panels. "Get somewhere
  safe now": 51 police and fire stations as listings ([CHECKS-2026-09-22.md](CHECKS-2026-09-22.md)); the
  [category audit](CATEGORY-AUDIT-2026-09-22.md) built, Narcan queries every place that stocks it, ingested ids
  keyed to the publisher's record. Basemap: TIGER streets clipped to the city line, one name per geometry.
  582 listings; `pnpm test` 1,252; 203 fixture cases in 15 files.
- **2026-09-21 — Live, and the Map grows up.** Deployed at <https://313help.com>: a release-signed bundle (531
  listings), the write API at `/v1`, the steward queue behind Cloudflare Access, and the nightly publish switched
  on (`PUBLISH_ENABLED=true`). The four open accessibility items closed (44 pass, 27 fixed, 0 open); the map is
  operable from a keyboard (N/P/Enter). Language control moved into the top bar; native apps follow the phone's
  language list. Two map styles, Standard and Subway ([MAP-STYLE.md](MAP-STYLE.md)), on all three apps; the
  iPhone and Android each get a full-screen Map tab with the common touch gestures. DV lines sort by coarse service area and
  no address of any kind is kept for a DV organization. README rewritten as a showcase; roadmap now covers
  provider-verified listings and expansion to Michigan and beyond. `pnpm test` 772; 190 fixture cases.
- **2026-09-20 (adversarial review).** Five reviewers, fixed the same day: the `holiday` open-now state (no
  "Open" on Christmas), two entry-check badges checked by the build against script-refusing hosts, crash counts
  that cannot be un-suppressed by subtraction, a Worker that logs nothing, traceless lists and no Share on private
  screens, the iPhone secret kept out of backups, behavioural tests, `HelpCore` and `:core` in CI.
- **2026-09-20 (evening).** Root README; "Bus directions in the Transit app" (destination only); Android's first
  compile and run; `import:lines` reports id collisions; am/pm, currency and list separators made translatable.
- **2026-09-20 (coordinated build).** 531 listings; emergency rooms and urgent care; 26 Wayne County stations;
  tabs become Home · Help · Map · Events with 11 transport layers; laptop layout; the WCAG 2.2 AA pass; iPhone
  reports, saved places and privacy screen; the Android client written; Arabic and Bengali built.
- **2026-09-20 (earlier).** [What is active versus planned](AUDIT-2026-09-20.md); 313SafeBeds first on the shelter
  screen; the iPhone design system; the greenway drawn like a transit line; SAMHSA's lists feed treatment
  listings; 418 listings.
- **2026-09-19.** New kinds of help (jobs, treatment, housing, legal, IDs and more; 382 listings); Kyle's review
  decisions built ([REVIEW-2026-09-19.md](REVIEW-2026-09-19.md)); no timers on listings; dependencies and CI
  brought up to date; the app named 313 Help.
- **2026-09-18.** Design docs drafted and audited (doc 10); build steps 1–4 done in a day — seed data and signed
  bundle, the PWA, the Worker and D1, the steward queue; the street map drawn on the phone; 205 neighborhood
  pages; Spanish; 178 listings; repo made public.

On DHD: program staff are aware of the project and informally supportive of reusing the public information from
the D Compassion build (**Kyle's account; no written record in this repository**). DHD has not offered to maintain
any data or feed and there is no written authorization; the design assumes neither (02, 08). By Kyle's decision
(DECISIONS 2026-09-20) this sentence stays in `docs/` and nowhere else.

## The three ideas that make this app different

1. **Stores nothing.** No accounts, no intake, no contact info. Triage runs on the phone. There is no resident data to secure because there isn't any. This is also why it can ship without a city procurement process.
2. **Freshness is the product.** Every resource carries the dates we know about it, a plain badge that says what those dates mean, and a one-tap "this is wrong / closed / moved" report. Resources age out visibly instead of silently lying.
3. **The data outlives the app.** Resources are published as an open, HSDS-shaped dataset that DHD, 211/CIE, or anyone else can consume. If the app dies, the directory doesn't.
