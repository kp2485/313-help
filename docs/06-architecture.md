# 06 — Architecture

## Shape

```
  SOURCES                              PIPELINE (nightly + by hand)                 PUBLISH
  ─────────                            ───────────────────────────                  ───────
  City/DHD ArcGIS layers ──┐
  City calendar pages ─────┤   pipeline/src/ingest-*.ts → data/ingested/ (a change = a pull request)
  Hand research ───────────┼──▶  data/seed/ + data/ingested/ → normalize → validate (HSDS 3.2)
   (pnpm import:lines)     │     → dated facts + report counts from D1 → sign ──▶  Cloudflare Pages
  Alerts (pnpm alert:new) ─┤                                                        /data/bundle/v1/…
  Page watchers (planned) ─┘                                                        (data/hsds/ committed to git)
                                        ▲                                                │
  Steward queue (admin/) ───────────────┘  accept/reject, archive/restore, photos        ▼
        ▲                                                                     iPhone app · web app (also Android)
        │                                                                                │
  Cloudflare Worker + D1  ◀── POST /v1/reports, /v1/proposals, /v1/photos ───────────────┘
  (targets, reports, proposals, steward actions, overrides, photos)    R2: condition-report photos only
```

ArcGIS layers read today: DHD harm-reduction stations, recreation centers, police precincts and fire stations (`ingest-safe.ts`, 2026-09-22), Joe Louis Greenway segments, parks, ZIP areas, neighborhoods, and for docs/13 property sales, building permits, blight tickets, demolitions, Improve Detroit issues and parcels; for the street map, roads (with the City's five safety fields) and the city boundary. The four city pages read SEMCOG, the Census Bureau and Wayne County by hand (`ingest-cities.ts`, docs/13 "The four cities"). An ingested row's id is keyed to the publisher's own permanent record reference (`ingest-ids.ts`), never to the order a server answers in. Page watchers are planned, not built; what runs today is the nightly re-check of each listing's own page, which only raises steward tasks. Press releases are not read by a machine: a person writes the alert with `pnpm alert:new`.

Two halves, deliberately separated:

- **Static data plane** — a versioned bundle of JSON served from a CDN. No server logic in the read path. Cacheable, offline-friendly, ~free at any scale, survives any outage of the write plane.
- **Thin write plane** — one small API for anonymous reports and proposals, plus the steward tool. If it goes down, the app still works; reports just queue.

## Repo layout (monorepo)

```
313-help/
  data/
    seed/            hand-kept CSVs and alerts.json (listings, schedules, emergency numbers, alerts)
    sources.yaml     registry of sources: url, tier, publish or stage, field mapping
    ingested/        what the ingesters read from City open data — committed; a change comes as a pull request
    staging/         ingested rows held back (e.g. a layer too old to publish)
    hsds/            generated — services.json, committed on each publish so history is in git
    indicators/      generated, committed — neighborhoods.json (no outlines; every build; the four city pages since 2026-09-22) and greenway_access.json (access-report.ts)
    bundle/          generated — not committed (built in CI, deployed)
  packages/query/    shared query rules: open-now, next times, badges, ranking, places (TypeScript)
  pipeline/          TypeScript (Node 22). Flat: pipeline/src/*.ts, one file per job (ingest-*, build, normalize, validate, sign, …)
  api/               Cloudflare Worker (Hono) + D1 migrations
  admin/             steward queue: plain HTML, CSS and JS, no build step; served at /admin/ behind Cloudflare Access
  apps/
    ios/             SwiftUI, iOS 17+. Two SwiftPM libraries CI can run without Xcode: Sources/DetroitQuery (the Swift copy of the query rules, streets graph, walking and trip plans included, held to schema/fixtures) and Sources/HelpCore (the app's own non-screen logic — install key, outbox, saved rules, session, signature check, release rules, the map's pure parts, the areas and directions wording). HelpApp/ holds the screens and needs Xcode. Tests/: DetroitQueryTests, HelpCoreTests, AppParityTests — 364 tests (2026-09-22)
    web/             PWA — same bundle, read-only + reporting (still our Android answer)
    android/         Kotlin, platform Views, no dependencies (query/: a third copy of the shared rules, directions included; core/: the android-free files on a plain JVM; app/: the screens). Compiled, tested and run on an API 35 emulator (2026-09-20 on; 372 JVM tests in :query and :core)
  strings/           en.json, es.json, ar.json, bn.json — every word the app shows, the same keys in all four
  docs/              these design docs
  schema/            query-spec.md + fixtures/ (JSON in, expected answer out)
  .github/workflows/ ci.yml (tests), publish.yml (nightly publish)
```

## Pipeline

- Runs as `.github/workflows/publish.yml`: nightly at 08:00 UTC (04:00 in Detroit, 03:00 in winter) and by hand. It is **off** until the repository variable `PUBLISH_ENABLED` is `true`. In order, it:
  1. (City events: not read, DECISIONS 2026-09-19.)
  2. Checks the emergency numbers against their owners' pages (`pnpm check:emergency`) and stamps each match's date. A page that can't be read changes nothing. A page that shows a different number stamps `mismatch_on`, and the release build then fails until a person fixes `emergency.csv` (DECISIONS 2026-09-19).
  3. Runs the tests, builds the signed release bundle (pulling report counts and steward decisions from the Worker), builds the web app with the pinned public keys, deploys to Cloudflare Pages, and commits `data/hsds/` and the emergency check dates.
  4. Re-reads the other open-data sources. Nothing from this step is published: if anything changed, it opens a pull request.
  5. Re-reads each active listing's own web page (`check:sources --recheck`, the same strict matcher as the entry check) and sends every miss or unreadable page to the Worker as a steward task (`pnpm tasks:sync`). The app never changes because of it (DECISIONS 2026-09-19). This step can't fail the job, and the notes it writes into `data/seed/resources.csv` are not committed.
- Each source has its own ingester file; `normalize.ts` turns seed and ingested rows into bundle rows and HSDS entities with deterministic IDs.
- **Validate**: HSDS 3.2 JSON Schema + our own checks (Detroit bbox, phone format, known category, schedule parse). A schedule whose `until` is past on an active row is a warning, not an error.
- **Diff** is git: open-data changes land in `data/ingested/` on a branch and become a pull request. Merging it is the steward's approval. Rows a source drops are never auto-archived.
- **Facts, not scores:** the bundle carries dated facts per row (`checked_at_entry`, `last_confirmed_at`, method, open report counts) pulled from the seed and D1. The badge and the sort order are computed on the device by `packages/query` (10-A3).
- **Bundle**: per-category plain JSON (the host compresses it in transit), plus `alerts.json`, `archived.json`, `emergency.json`, `places/`, `map/`, `indicators/` (full list in 03). `index.json` has version = git SHA + build minute + an 8-character hash of the file checksums, per-file SHA-256 checksums, `generated_at`, `retired` (only when a person retires the directory), `photos` (only when a person turns photos on), and `emergency_verified`. `index.json.sig` is an Ed25519 signature over the exact bytes of `index.json`; clients pin two public keys and keep the old bundle if verification fails. Cloudflare Pages serves the app and `/data/bundle/v1/`; R2 is not used for the bundle.
- HSDS output committed to `data/hsds/` so every publish is a git commit — free audit trail and rollback.

## Routing core and directions (2026-09-22)

Directions are computed on the device from files the bundle already carries, and no new file was added for them (docs/05 "Directions"; the rules and every constant are in `schema/query-spec.md` "Streets graph", "Walking directions", "Trip plans"; the study is [research/2026-09-22-offline-directions.md](research/2026-09-22-offline-directions.md)).

```
  map/base.json + map/streets.json ──▶ buildStreetGraph (packages/query/src/streets.ts)   once per bundle, cached
        (already fetched, checksum-verified and kept for the map)     by the index's own SHA-256 of those files
                                              │  half-edge graph; a street's safety byte (the City's HIN,
                                              │  severity, lanes, speed, AADT fields, packed by ingest-basemap)
                                              ▼
  map/transit/*.json + *.net.json ──▶ buildTransitNetwork ──▶ plan(origin, destination)  (transit-plan.ts)
        (stops, routes, stops per route in travel order,          ranks walk-only, one ride, one change;
         published headways)                                       every walking leg is an A* walk (walk.ts)
```

- **Inputs** are the origin the map already holds in memory (a location allowed this visit, a typed cross street or ZIP centre) and the destination's published address or coordinate. Nothing is written down and nothing is sent: the web runs it in a classic Worker (`apps/web/src/dirworker.ts`) and the screen (`dirscreen.ts`, `dirwords.ts`) has no URL and no history entry; iOS is `HelpApp/Directions.swift` over `DetroitQuery`; Android is `app/.../Directions.kt`, compiled and tested in `:core` on a plain JDK.
- **What it may say** is fixed by the spec: published headways only (never real-time, never a timetable), every estimate a range, at most one bus change, the route ends at the street outside and says how far the door is, and no screen uses "safe" or "accessible". Three implementations, one spec, the same fixtures (`schema/fixtures/14-streets-walk.json`, `15-trip-plans.json`), and `packages/query/test/routing-real.test.ts` measures the committed basemap (about 23.6k nodes and 39.7k edges, 99.7 % in one piece).
- **Areas and city pages.** `indicators/neighborhoods.json` carries the 205 neighborhood outlines and, since 2026-09-22, `areas[]` — the four city outlines — plus the four city pages' numbers from `data/ingested/cities.json`. Point-in-polygon runs on the device (`apps/web/src/hoodfind.ts`, `HelpCore/Hoods.swift`, `:core`), so the Areas tab can open on the outline a person is standing in and the Map tab can draw every boundary (`apps/web/src/bounds.ts`, docs/MAP-STYLE.md §15) without a request. Every count in the file is the exact number the source returned (docs/13).

## Write API (Cloudflare Worker + D1)

Public endpoints (all anonymous). Rate limiting is a Cloudflare WAF rule in front of the Worker; the Worker never reads an IP or user-agent header. Request bodies are closed: an unknown field is a 400.
- `POST /v1/reports` — body per 03. The target must be in the `targets` list the pipeline syncs at each publish (422 if not). The same device, target, kind and day counts once. Returns 202.
- `POST /v1/proposals` — add-a-place. Stored as an open proposal. Returns 202 and a display-only reference code.
- `POST /v1/photos` — one JPEG for a condition report (docs/11). Refused if it carries any metadata. Returns a `ph_…` key. Answers 503 while the photo bucket is not set up.
- `GET /v1/health` — answers `{ok:true}`. **No client calls it** (corrected 2026-09-20: this line used to describe a "reporting available" indicator, which was never built; the app simply queues a report it cannot send).
- `POST /v1/owner/look`, `POST /v1/owner/confirm`, `POST /v1/owner/propose` — the people who run a listing, with the one-use link a steward emailed them (docs/14). `{key}` names the listing; "still right" records a dated `owner_attest`; "something changed" becomes a proposal with `target_id`, and a `shelter.dv` answer never keeps an address. An unknown, used or expired key always answers 404 `{"error":"this link has expired or was already used"}` and records nothing. No account, no email held.

Steward endpoints, behind Cloudflare Access (steward email allowlist, plus a service token for the pipeline). **Their bodies are closed schemas with size caps too, since 2026-09-20** — being behind a login is not a reason to accept a field nobody designed. An unknown field is a 400; a steward `note` is capped at 500 characters and `report_ids` at 500 ids; the request body itself is capped at 4 KB on the two resolve routes, 32 KB on the listing-status route, and 1 MB with a 20,000-id limit on `PUT /v1/steward/targets`, which used to read the body raw and uncapped. A bad listing id answers `{"error":"bad listing id"}`.
- `GET /v1/steward/queue` — open reports (not confirmations: those only feed the badge), proposals, and per target the number of different phones that said closed (`closed_phones`; the hashes never leave D1), and `owner_said_open`: listings whose owner said "still right" after a closed report (docs/14 D4).
- `POST /v1/steward/owner-links` `{target_id, category, source_url}` — makes a one-use, 30-day link for the people who run a listing and answers its key once; only the key's SHA-256 is stored. `GET /v1/steward/owner-links` — who was asked, when, and what they said; never a key or its hash (docs/14).
- `GET /v1/steward/aggregates` — counts and dates per target, steward decisions, and the circuit-breaker flag, for the bundle build. Closure and wrong-info counts are different phones, not reports; `open_after_closed` is the different phones that said "still open" after the latest closed report.
- `GET /v1/steward/photos/:key` — view one photo.
- `POST /v1/steward/reports/:id/resolve`, `POST /v1/steward/proposals/:id/resolve` — accept / reject / duplicate, with a reason code.
- `POST /v1/steward/reports/settle` — settle the reports the steward page showed on one target: only those ids, only on that target, only while still open, never a confirmation. A report that came in after the page loaded stays open.
- `POST /v1/steward/listings/:id/status` — archive, pause (suspend), or restore a listing; settles the closure reports among the `report_ids` the page showed.
- `POST /v1/steward/photos/:key/discard` — delete a photo now.
- `PUT /v1/steward/targets` — the pipeline sends the ids that exist.
- `PUT /v1/steward/tasks` — the pipeline sends the whole list from the nightly re-check; it replaces the open `source_check` tasks (ones no longer reported close as `resolved_by_check`; one a steward dismissed stays dismissed unless the result changes). `GET /v1/steward/tasks` lists the open ones; `POST /v1/steward/tasks/:id/dismiss` with `checked_fine` or `will_fix` closes one and logs it.

The Worker checks the Access token's signature itself. It keeps Access's public keys for an hour; a token naming a key it doesn't have makes it fetch them again (Access rotates keys), at most once per 5 minutes.

D1 tables: `targets`, `reports`, `proposals`, `steward_actions`, `report_counts`, `listing_overrides`, `photos`, `steward_tasks`. No `users` table for residents. Ever. No alerts: alerts live in `data/seed/alerts.json`.

Retention: raw reports 180 days, then aggregated to counts per target/kind/month and purged, together with any photo (one transaction). Proposals are purged 180 days after a steward settles them.

## Admin / steward tool

Boring on purpose. One page, `/admin/`, behind Cloudflare Access. On it, in order:
- A circuit-breaker banner when more than 5 listings were reported closed in one day (labels then freeze as they were: the aggregates count only reports made before the burst, until a person looks; DECISIONS 2026-09-19).
- Reported listings and places first, grouped by target, with the phone-call script inline and buttons to archive (closed, moved, program ended), mark it open and clear the reports, or close reports as fixed, can't confirm, spam, or "about a person: discard." A listing is highlighted when 2 or more different phones said closed, the same count that changes its badge. A button settles only the reports the page showed. A photo on a condition report shows here, with "Delete this photo now."
- Proposed new places: checked and listed, already listed, can't confirm, or not a fit.
- Pages that changed: the nightly re-check's tasks, with the listing's name and what its page no longer shows, and "Checked: it's fine" or "I'll fix it."
- How to publish now (`pnpm build:bundle`); otherwise the nightly job picks the changes up.
- "Archived by a steward", with a restore button on each.

Not built: a resource editor (stewards edit `data/seed/` in git), an alert composer (alerts are written with `pnpm alert:new`), a sources status screen, and a publish button.

## Client apps

### iOS (SwiftUI, iOS 17+)
- Kyle's home stack. Bundle loader → plain Codable cache → on-device query layer → views. The query layer is `DetroitQuery` (Swift, `apps/ios/Sources/DetroitQuery`): open-now, next times, badges, ranking, search and greenway distances, tested against the same `schema/fixtures` as the web.
- **The Map tab is a full-screen map drawn by the phone** (2026-09-21): the same signed `map/` files as the web, no MapKit and no tiles, the same layers, both styles (`standard` and `subway`, [MAP-STYLE.md](MAP-STYLE.md)), a persistent "See this map as a list", and VoiceOver actions that do what a tap does. The map's pure parts (projection, camera, hit-testing, layer rules, the layer store) live in `HelpCore` and run in CI. Also built: reports with an offline outbox, saved places, an About/privacy screen with a key reset, quick exit, an app-switcher shield, the Transit link-out, and language chosen from the phone's own language list. Since 2026-09-22: the Areas tab (a map zoomed to the outline a person stands in, the list one control away, an area page under a collapsing strip), the four city pages, the boundaries on the Map tab, the cross-street field, and the Directions screen (`HelpApp/Directions.swift`, the route drawn on our own map). Roadmap: photos. The origin and the two pinned keys are **build settings**, and a Release build refuses to start until they are real. Details: `apps/ios/README.md`.
- Local notifications only.
- Ships as Kyle Peterson / Linwood Technologies.

### Android — the PWA installs today; a native Kotlin client is built
The PWA (`apps/web`) installs on every Android phone: same bundle, offline, reporting works.

`apps/android` is a native client (2026-09-20), with a **Map tab since 2026-09-21** — the city drawn on the phone from the signed bundle, with the greenway, parks, listings by group, the eleven transport layers, a layer switcher, a text list, a card on tap, virtual accessibility nodes and a hardware-keyboard walk, in both map styles. Since 2026-09-22 it has the same four tabs as the other clients, the Areas tab as a map with the boundaries drawn, the city pages, and the Directions screen (`Directions.kt`, `DirWords.kt`, compiled and tested in `:core`). It follows the phone's language list. The debug APK carries **two permissions and no third-party code at all**. A Play release is on the roadmap; verification history and release blockers are in `apps/android/README.md`. CI builds `:query` and `:core` only and sets `HELP313_NO_ANDROID=1` on purpose: a workflow should not accept Google's SDK licence for this repository. It is deliberately not the Compose app this doc used to imagine: platform Views built in code, **no Jetpack Compose, no AndroidX and no dependency of any kind inside the APK**, `minSdk` 24 / `targetSdk` 35. The reader we design for is a cheap old phone, and Compose alone would cost 2–4 MB and work at every start and every frame. The Detroit wall-clock rule and Ed25519 verification are written out by hand (checked against the JVM's tz database and RFC 8032's vectors) because `java.time` needs API 26 and platform Ed25519 needs API 33. KMP / Flutter / React Native are still not worth a new stack. See `apps/android/README.md` for what is verified and what is not.

### Web (PWA)
- Vanilla TypeScript. **Map:** our own street map, drawn on a canvas from the signed bundle (`apps/web/src/map.ts`): no tile server, no map library, works offline. Must work with the map failing: every map screen also lists the same places and cross streets as text.
  - `pnpm ingest:basemap` reads three City open-data layers (roads with names, class and the five safety fields, park outlines, city boundary), plus the US Census Bureau's TIGER streets for Hamtramck, Highland Park and Dearborn and the outlines of all four cities (public domain; DECISIONS 2026-09-19), into `data/ingested/basemap/` (committed). Since 2026-09-22 each side of a city line has one authority — TIGER inside the three cities, the City outside, both clipped to the outline — one geometry keeps one name, and pieces of one street are chained across TIGER's small gaps (DECISIONS 2026-09-22). The build ships them as `map/base.json` (boundary, parks, freeways and arterials) and `map/streets.json` (every smaller street, in about 2-mile cells for fast drawing): about 170 KB gzipped together (2026-09-22 build). Both are in the signed index; a phone fetches them the first time a map opens, checks them against the index, and keeps them in IndexedDB.
  - Format: coordinates are whole numbers of 1e-5 degrees from the file's `origin`; a line is `[x0, y0, dx1, dy1, ...]`; a road is `[class, nameIndex, line]` with class 0 freeway to 4 local street.
  - The same ingest works out the streets each greenway segment crosses (`cross_streets` on the segment), so the facts on the map are also on the page as text.
- The service worker caches the app shell only (never `/data/`). Listings live in IndexedDB, stored only after the signature and checksum checks pass. IndexedDB also queues reports made with no signal.
- Also serves as the shareable deep-link target (`https://<domain>/#/r/sal_…`) that resolves for people without the app.

## Shared query semantics (one spec, three implementations)

Keep a single `schema/query-spec.md` + fixture tests (JSON in, expected ranking out) so the web app (`packages/query`, TypeScript), the iPhone app (`DetroitQuery`, Swift) and, since 2026-09-20, the Android app (`apps/android/query`, Kotlin) — three implementations — agree on: open-now evaluation across DST, "next 3 occurrences," distance banding (0–1 mi, 1–3, 3+), sort by freshness tier, the rule that reported-closed rows stay listed but go last in their band, and since 2026-09-22 the streets graph, walking directions and trip plans. 203 cases in 15 fixture files; the fixtures came first, then the clients.

## Hosting & cost

Cloudflare Pages + Workers + D1 + Access, plus R2 for photos when they are switched on: within free/near-free tiers at expected traffic. **Live since 2026-09-21 at <https://313help.com>**: Pages serves the app and the bundle with the `_headers` policy (CSP with `frame-ancestors 'none'`, `no-referrer`, `nosniff`, a Permissions-Policy — observed on the live response), the Worker answers at `/v1/*`, and `/admin/` and `/v1/steward/*` redirect to Cloudflare Access. Domain via Cloudflare, under a Cloudflare account made for the project, not a personal one, so it can be handed over (docs/OPERATIONS.md). GitHub Actions free tier for nightly runs. Raspberry Pi is **not** in the production path — it can run the pipeline locally for dev.

## Observability

**There are no Worker logs.** Workers Logs are off by configuration (`[observability.logs] enabled = false`, `invocation_logs = false`); the error and not-found handlers log nothing at all, not even the route pattern; and the only permitted `console` call is `api/src/log.ts`, whose message type is an allow-list of two fixed sentences about the nightly cron. Tests enforce both. So the only thing to watch is the public status line on the About screen ("Data last updated …") and the GitHub Actions log. Not built: pipeline run summaries in the admin tool (for now, read the GitHub Actions log), and an uptime check on `index.json`.

## Licensing

- Our dataset: **CC BY 4.0** (attribution keeps DHD and partners visible; matches HSDS's CC BY-SA docs spirit without forcing share-alike on 211).
- App code: **Apache-2.0** (`LICENSE`). Open source is a strong civic-trust signal and lets DHD or another city fork it.
- Source data keeps its own license; note it in `sources.yaml` and in-app attribution.
