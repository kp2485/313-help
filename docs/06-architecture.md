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

ArcGIS layers read today: DHD harm-reduction stations, recreation centers, Joe Louis Greenway segments, parks, ZIP areas, neighborhoods, and for docs/13 property sales, building permits, blight tickets, demolitions, Improve Detroit issues and parcels; for the street map, roads and the city boundary. Page watchers are planned, not built. Press releases are not read by a machine: a person writes the alert with `pnpm alert:new`.

Two halves, deliberately separated:

- **Static data plane** — a versioned bundle of JSON served from a CDN. No server logic in the read path. Cacheable, offline-friendly, ~free at any scale, survives any outage of the write plane.
- **Thin write plane** — one small API for anonymous reports and proposals, plus the steward tool. If it goes down, the app still works; reports just queue.

## Repo layout (monorepo)

```
detroit-compass/
  data/
    seed/            hand-kept CSVs and alerts.json (listings, schedules, emergency numbers, alerts)
    sources.yaml     registry of sources: url, tier, cadence, parser, owner contact
    ingested/        what the ingesters read from City open data — committed; a change comes as a pull request
    staging/         ingested rows held back (e.g. a layer too old to publish)
    hsds/            generated — services.json, committed on each publish so history is in git
    indicators/      generated, committed — neighborhoods.json (no outlines; every build) and greenway_access.json (access-report.ts)
    bundle/          generated — not committed (built in CI, deployed)
  packages/query/    shared query rules: open-now, next times, badges, ranking, places (TypeScript)
  pipeline/          TypeScript (Node 22). Flat: pipeline/src/*.ts, one file per job (ingest-*, build, normalize, validate, sign, …)
  api/               Cloudflare Worker (Hono) + D1 migrations
  admin/             steward queue: plain HTML, CSS and JS, no build step; served at /admin/ behind Cloudflare Access
  apps/
    ios/             SwiftUI, iOS 17+ (Sources/DetroitQuery: the Swift query library, tested; DetroitCompassApp/: SwiftUI screens, not compiled yet)
    web/             PWA — same bundle, read-only + reporting (also our Android answer)
  strings/           en.json, es.json — every word the app shows
  docs/              these design docs
  schema/            query-spec.md + fixtures/ (JSON in, expected answer out)
  .github/workflows/ ci.yml (tests), publish.yml (nightly publish)
```

## Pipeline

- Runs as `.github/workflows/publish.yml`: nightly at 08:00 UTC (04:00 in Detroit, 03:00 in winter) and by hand. It is **off** until the repository variable `PUBLISH_ENABLED` is `true`. In order, it:
  1. Refreshes City events and keeps the last good file if the page is down.
  2. Checks the emergency numbers against their owners' pages (`pnpm check:emergency`) and stamps each match's date. One bad night does not stop the publish; the release build does, once a number has gone 30 days without a match.
  3. Runs the tests, builds the signed release bundle (pulling report counts and steward decisions from the Worker), builds the web app with the pinned public keys, deploys to Cloudflare Pages, and commits `data/hsds/`, events and the emergency check dates.
  4. Re-reads the other open-data sources. Nothing from this step is published: if anything changed, it opens a pull request.
- Each source has its own ingester file; `normalize.ts` turns seed and ingested rows into bundle rows and HSDS entities with deterministic IDs.
- **Validate**: HSDS 3.2 JSON Schema + our own checks (Detroit bbox, phone format, known category, schedule parse). A schedule whose `until` is past on an active row is a warning, not an error.
- **Diff** is git: open-data changes land in `data/ingested/` on a branch and become a pull request. Merging it is the steward's approval. Rows a source drops are never auto-archived.
- **Facts, not scores:** the bundle carries dated facts per row (`checked_at_entry`, `last_confirmed_at`, method, open report counts, `cadence_days`) pulled from the seed and D1. Badge, staleness, and sort are computed on the device by `packages/query` (10-A3).
- **Bundle**: per-category plain JSON (the host compresses it in transit), plus `alerts.json`, `archived.json`, `emergency.json`, `events.json`, `places/`, `map/`, `indicators/` (full list in 03). `index.json` has version = git SHA + build minute + an 8-character hash of the file checksums, per-file SHA-256 checksums, `generated_at`, a human-advanced `heartbeat` date (doc 12), and `emergency_verified`. `index.json.sig` is an Ed25519 signature over the exact bytes of `index.json`; clients pin two public keys and keep the old bundle if verification fails. Cloudflare Pages serves the app and `/data/bundle/v1/`; R2 is not used for the bundle.
- HSDS output committed to `data/hsds/` so every publish is a git commit — free audit trail and rollback.

## Write API (Cloudflare Worker + D1)

Public endpoints (all anonymous). Rate limiting is a Cloudflare WAF rule in front of the Worker; the Worker never reads an IP or user-agent header. Request bodies are closed: an unknown field is a 400.
- `POST /v1/reports` — body per 03. The target must be in the `targets` list the pipeline syncs at each publish (422 if not). The same device, target, kind and day counts once. Returns 202.
- `POST /v1/proposals` — add-a-place. Stored as an open proposal. Returns 202 and a display-only reference code.
- `POST /v1/photos` — one JPEG for a condition report (docs/11). Refused if it carries any metadata. Returns a `ph_…` key. Answers 503 while the photo bucket is not set up.
- `GET /v1/health` — for the app's "reporting available" indicator.
- `POST /v1/provider/claim` — provider requests ownership; sends a verification email (the only email we would ever hold; see 08). **(later, v1.1; not built)**

Steward endpoints, behind Cloudflare Access (steward email allowlist, plus a service token for the pipeline):
- `GET /v1/steward/queue` — open reports and proposals.
- `GET /v1/steward/aggregates` — counts and dates per target, steward decisions, and the circuit-breaker flag, for the bundle build.
- `GET /v1/steward/photos/:key` — view one photo.
- `POST /v1/steward/reports/:id/resolve`, `POST /v1/steward/proposals/:id/resolve` — accept / reject / duplicate, with a reason code.
- `POST /v1/steward/listings/:id/status` — archive, pause (suspend), or restore a listing.
- `POST /v1/steward/photos/:key/discard` — delete a photo now.
- `PUT /v1/steward/targets` — the pipeline sends the ids that exist.

D1 tables: `targets`, `reports`, `proposals`, `steward_actions`, `report_counts`, `listing_overrides`, `photos`. No `users` table for residents. Ever. No alerts: alerts live in `data/seed/alerts.json`.

Retention: raw reports 180 days, then aggregated to counts per target/kind/month and purged.

## Admin / steward tool

Boring on purpose. One page, `/admin/`, behind Cloudflare Access. On it, in order:
- A circuit-breaker banner when more than 5 listings were reported closed in one day (closure reports then change no badges until a person looks).
- Reported listings and places first, grouped by target, with the phone-call script inline and buttons to archive (closed, moved, program ended), mark it open and clear the reports, or close reports as fixed, can't confirm, spam, or "about a person: discard." A photo on a condition report shows here, with "Delete this photo now."
- Proposed new places: checked and listed, already listed, can't confirm, or not a fit.
- How to publish now (`pnpm build:bundle`); otherwise the nightly job picks the changes up.
- "Archived by a steward", with a restore button on each.

Not built: a resource editor (stewards edit `data/seed/` in git), an alert composer (alerts are written with `pnpm alert:new`), a sources status screen, and a publish button.

## Client apps

### iOS (SwiftUI, iOS 17+)
- Kyle's home stack. Bundle loader → plain Codable cache → on-device query layer → views. The query layer is `DetroitQuery` (Swift, `apps/ios/Sources/DetroitQuery`): open-now, next times, badges, ranking, search and greenway distances, tested against the same `schema/fixtures` as the web.
- No map on iPhone yet; list-first. The SwiftUI screens have not been compiled yet (they need a Mac).
- Local notifications only.
- Ships as Kyle Peterson / Linwood Technologies.

### Android — the web app
The Android answer is the PWA (`apps/web`): same bundle, installable, reporting works, reaches every Android phone. Missing: reliable background fetch; local notifications are limited. A native app (Kotlin + Jetpack Compose) comes later only if the PWA falls short. KMP / Flutter / React Native are not worth a new stack for two thin read-mostly clients over a static bundle.

### Web (PWA)
- Vanilla TypeScript. **Map:** our own street map, drawn on a canvas from the signed bundle (`apps/web/src/map.ts`): no tile server, no map library, works offline. Must work with the map failing: every map screen also lists the same places and cross streets as text.
  - `pnpm ingest:basemap` reads three City open-data layers (roads with names and class, park outlines, city boundary) into `data/ingested/basemap/` (committed, about 450 KB). The build ships them as `map/base.json` (boundary, parks, freeways and arterials) and `map/streets.json` (every smaller street, in about 2-mile cells for fast drawing): about 140 KB gzipped together. Both are in the signed index; a phone fetches them the first time a map opens, checks them against the index, and keeps them in IndexedDB.
  - Format: coordinates are whole numbers of 1e-5 degrees from the file's `origin`; a line is `[x0, y0, dx1, dy1, ...]`; a road is `[class, nameIndex, line]` with class 0 freeway to 4 local street.
  - The same ingest works out the streets each greenway segment crosses (`cross_streets` on the segment), so the facts on the map are also on the page as text.
- The service worker caches the app shell only (never `/data/`). Listings live in IndexedDB, stored only after the signature and checksum checks pass. IndexedDB also queues reports made with no signal.
- Also serves as the shareable deep-link target (`https://<domain>/#/r/sal_…`) that resolves for people without the app.

## Shared query semantics (one spec, two implementations)

Keep a single `schema/query-spec.md` + fixture tests (JSON in, expected ranking out) so the web app (`packages/query`, TypeScript) and the iPhone app (`DetroitQuery`, Swift) agree on: open-now evaluation across DST, "next 3 occurrences," distance banding (0–1 mi, 1–3, 3+), sort by freshness tier, and the rule that reported-closed rows stay listed but go last in their band. The fixtures came first, then the clients.

## Hosting & cost

Cloudflare Pages + R2 (photos only) + Workers + D1 + Access: within free/near-free tiers at expected traffic. None of it is created yet. Domain via Cloudflare, under a Cloudflare account made for the project, not a personal one, so it can be handed over (docs/OPERATIONS.md). GitHub Actions free tier for nightly runs. Raspberry Pi is **not** in the production path — it can run the pipeline locally for dev.

## Observability

Worker logs (the Worker logs no requests and reads no IPs), a public status line on the About screen ("Data last updated …"). Not built: pipeline run summaries in the admin tool (for now, read the GitHub Actions log), and an uptime check on `index.json`.

## Licensing

- Our dataset: **CC BY 4.0** (attribution keeps DHD and partners visible; matches HSDS's CC BY-SA docs spirit without forcing share-alike on 211).
- App code: **Apache-2.0** (`LICENSE`). Open source is a strong civic-trust signal and lets DHD or another city fork it.
- Source data keeps its own license; note it in `sources.yaml` and in-app attribution.
