# 06 — Architecture

## Shape

```
  SOURCES                         PIPELINE (nightly + on-demand)                  PUBLISH
  ─────────                       ─────────────────────────────                  ───────
  Watched pages (DHD)─┐
  Open Data (ArcGIS) ─┤   ingest/*.ts  →  normalize → validate (HSDS) → diff
  Press releases ─────┼──▶            →  confidence scoring → bundle build  ──▶  Cloudflare Pages / R2
  Partner CSVs ───────┤                                                            /data/hsds/…
  Seed lists ─────────┘                                                            /data/bundle/v{N}/…
                                        ▲                                             │
  Admin/steward tool (web) ─────────────┘  accept/reject/archive/alerts               ▼
        ▲                                                                       iOS app · Android app · web
        │                                                                             │
  Cloudflare Worker + D1  ◀── POST /reports, POST /proposals ─────────────────────────┘
  (reports, proposals, steward actions, alerts drafts)
```

Two halves, deliberately separated:

- **Static data plane** — a versioned bundle of JSON served from a CDN. No server logic in the read path. Cacheable, offline-friendly, ~free at any scale, survives any outage of the write plane.
- **Thin write plane** — one small API for anonymous reports and proposals, plus the steward tool. If it goes down, the app still works; reports just queue.

## Repo layout (monorepo)

```
detroithelp/
  data/
    seed/            hand-curated CSVs (programs, emergency numbers, initial food sites)
    sources.yaml     registry of sources: url, tier, cadence, parser, owner contact
    hsds/            generated — committed on each publish so history is in git
    bundle/          generated — not committed (built in CI, uploaded)
  pipeline/          TypeScript (Node 22). ingest/, normalize/, validate/, score/, bundle/
  api/               Cloudflare Worker (Hono) + D1 schema + migrations
  admin/             steward web app (SvelteKit or plain HTML+htmx — keep it boring)
  apps/
    ios/             SwiftUI, iOS 17+
    android/         see decision below
    web/             PWA — same bundle, read-only + reporting (fastest Android reach)
  docs/              these design docs
  schema/            JSON Schema for x_detroit, alerts, reports, bundle index
```

## Pipeline

- Runs in GitHub Actions nightly (04:00 ET) and on manual dispatch / webhook from the admin tool.
- Each source has a parser producing `NormalizedRecord[]`; normalize maps to HSDS entities with deterministic IDs.
- **Validate**: HSDS JSON Schema + our extension schema + sanity (Detroit bbox, phone format, RRULE parse, no `until` in the past on active).
- **Diff** against the last published HSDS: added / changed / dropped rows. Rows dropped by a source → steward task; never auto-archived. Diff summary posted to the admin tool and (optional) a Slack/email.
- **Score** confidence (04) using D1's report/verification data pulled at build time.
- **Bundle**: denormalize `service_at_location` + joins into per-category gzipped JSON; `alerts.json`; `archived.json` (compact); `index.json` with version = git SHA + timestamp and per-file checksums. Upload to R2 behind Cloudflare; Pages serves `/data/*` with long cache + versioned paths.
- HSDS output committed to `data/hsds/` so every publish is a git commit — free audit trail and rollback.

## Write API (Cloudflare Worker + D1)

Endpoints (all JSON, all anonymous, all rate-limited by nonce and by Cloudflare):
- `POST /v1/reports` — body per 03. Validates target exists in current HSDS. Stores minus IP. Returns 202.
- `POST /v1/proposals` — add-a-place. Stores as `proposed`. Returns 202 and a display-only reference code.
- `POST /v1/provider/claim` — provider requests ownership; sends verification email (the only email we ever hold; see 08).
- `GET /v1/health` — for the app's "reporting available" indicator.
- Steward endpoints behind Cloudflare Access (SSO by email allowlist): queue, accept/reject, archive, alerts CRUD, trigger publish.

D1 tables: `reports`, `proposals`, `verifications`, `steward_actions`, `alerts`, `providers`. No `users` table for residents. Ever.

Retention: raw reports 180 days, then aggregated to counts per target/kind/month and purged.

## Admin / steward tool

Boring on purpose. Login via Cloudflare Access. Screens: Queue (flagged / proposed / stale / auto-check failures / pending alerts), Resource editor (all HSDS fields + x_detroit), Alert composer with a press-release paste box that pre-fills sites and dates, Sources status (last fetch, diff counts, errors), Publish button (runs the pipeline and shows the diff before upload). Phone-call script displayed inline on verification tasks.

## Client apps

### iOS (SwiftUI, iOS 17+)
- Kyle's home stack. Bundle loader → SwiftData/plain Codable cache → on-device query layer (open-now via RRULE evaluation, distance, confidence sort) → views.
- MapKit for the map (no third-party SDK); list-first architecture.
- Local notifications only.
- Ships as Kyle Peterson / Linwood Technologies.

### Android — decision needed (see 09)
Options, honestly ranked for *this* project:
1. **PWA first (apps/web)** — same bundle, installable, reporting works, reaches every Android phone this week. Missing: reliable background fetch, local notifications are limited. Ship this for the hackathon and for DHD's Android-heavy audience *now*.
2. **Kotlin + Jetpack Compose** — the right long-term native answer; parallels SwiftUI closely enough that Claude Code can port view-by-view. Plan for v1.1.
3. **KMP / Flutter / React Native** — not worth a new stack for two thin read-mostly clients over a static bundle.

### Web (PWA)
- SvelteKit or vanilla + Leaflet (OSM tiles) or MapLibre; must work with the map failing.
- Service worker caches the bundle; IndexedDB queues reports.
- Also serves as the shareable deep-link target (`detroithelp.org/r/sal_…`) that resolves for people without the app.

## Shared query semantics (one spec, three implementations)

Keep a single `query-spec.md` + fixture tests (JSON in, expected ranking out) so iOS, Android, and web agree on: open-now evaluation across DST, "next 3 occurrences," distance banding (0–1 mi, 1–3, 3+), confidence sort, stale/flagged visibility rules. Claude Code should implement the fixtures first, then the three clients.

## Hosting & cost

Cloudflare Pages + R2 + Workers + D1 + Access: within free/near-free tiers at expected traffic. Domain via Cloudflare (Kyle already has an account). GitHub Actions free tier for nightly runs. Raspberry Pi is **not** in the production path — it can run the pipeline locally for dev.

## Observability

Worker logs (no IPs persisted), pipeline run summaries in the admin tool, a public status line on the About screen ("Data last updated …"). Uptime check on `index.json`.

## Licensing

- Our dataset: **CC BY 4.0** (attribution keeps DHD and partners visible; matches HSDS's CC BY-SA docs spirit without forcing share-alike on 211).
- App code: MIT or Apache-2.0 — decide (09). Open source is a strong civic-trust signal and lets DHD or another city fork it.
- Source data keeps its own license; note it in `sources.yaml` and in-app attribution.
