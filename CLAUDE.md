# CLAUDE.md — handoff for Claude Code

You are building **Detroit Compass** (named by Kyle 2026-09-18; internal package names still say `detroithelp`), a zero-PII app that points Detroit residents to free help, recreation, transit, and City events. Read `docs/README.md` first, then `docs/04-resource-lifecycle.md` and `docs/06-architecture.md`. Every design decision is in `docs/`; if a task conflicts with a doc, stop and ask rather than silently diverging. If you make a decision the docs don't cover, add it to `docs/DECISIONS.md` with a date and one-line rationale.

## Non-negotiables (from docs/01 and docs/08)

- No accounts, no names, no phone numbers, no emails for residents. **No identifier for a resident ever leaves the device.** The only on-device secret is random, resettable, and used solely to derive per-target daily dedupe hashes: `sha256(install_secret ‖ target_id ‖ day)`. If a feature seems to need more, it's out of scope.
- Never log or persist client IPs in the Worker. The Worker source never reads an IP or user-agent header at all (rate limiting is a Cloudflare WAF rule); request bodies are closed schemas, so an unknown field is a 400. `api/test` enforces all of this. Timestamps at minute granularity.
- Triage answers live in memory only and are cleared on exit.
- Nothing is deleted from the dataset; rows are archived with reason.
- Every listing shows freshness **computed on the device** from dated facts in the bundle (never frozen at build time). Badges state facts; never say "verified" for something no person checked. Unknown is never rendered as "open." Reports label rows; they never hide them.
- 911 and 988 are hardcoded and never overridable. Other emergency numbers come from `data/seed/emergency.csv` via the **signed** bundle. We use the number its owner currently publishes: `pnpm check:emergency` must find each number on its source page (or a person logs a call) within 30 days, or a release build fails. The script never rewrites a number; a mismatch is a person's job. Any phone/address/coordinate change from any source is held for steward approval.
- Bundles are Ed25519-signed; clients pin two public keys (active + spare) and refuse unsigned or mis-signed bundles.
- Harm-reduction, DV, and crisis screens follow the ordering rules in docs/05 (911/hotline first).

## Build order for the hackathon (docs/09)

Steps 1–4 were done on 2026-09-18. Step 5: `apps/ios` has `DetroitQuery`, the Swift copy of the query rules, passing every fixture in CI; the SwiftUI screens are written but have not been compiled (needs a Mac).


1. `data/seed/` CSVs → `pipeline/` → `data/bundle/v1/` (HSDS-valid + `x_detroit`). Fixture tests for open-now / next-occurrence / ranking in `schema/fixtures/` **before** any UI.
2. `apps/web/` PWA reading the bundle: Home, category list, detail, triage, offline.
3. `api/` Worker + D1: `POST /v1/reports`, `POST /v1/proposals`, steward endpoints behind Cloudflare Access.
4. `admin/` minimal steward queue. Publishing is `.github/workflows/publish.yml` (off until `PUBLISH_ENABLED` is set) or a local `pnpm build:bundle`.
5. `apps/ios/` SwiftUI shell if time remains.

## Conventions

- TypeScript strict for pipeline/api/web; SwiftUI (iOS 17+) for iOS. Node 22. pnpm 12 workspaces: dependency install scripts run only when listed under `allowBuilds` in `pnpm-workspace.yaml`, and new package versions must be a day old.
- IDs are stable slugs (`org_`, `loc_`, `svc_`, `sal_`, `alert_`, `rpt_`, plus `plc_` place, `seg_` greenway segment, `cond_` condition report, `prop_` proposal, `nbh_` neighborhood, `ph_` photo key, `emg_` emergency number). HSDS ids are UUIDv5 of the slug; the slug rides in `x_detroit.id`. Never reuse.
- Shared query semantics (open-now, next occurrences, badge, ranking) live in `packages/query` with the spec in `schema/query-spec.md` and fixtures in `schema/fixtures/`; web and pipeline import it, iOS re-implements against the same fixtures.
- Schedules are HSDS/iCal RRULE fields; compute occurrences with a tested library (`rrule` on web/pipeline, used in floating wall-clock mode only — see DECISIONS.md; a small tested Swift implementation or `EventKit`-free custom evaluator on iOS). DST tests are required.
- Detroit time zone `America/Detroit` everywhere. Bbox sanity: lat 42.25–42.46, lon −83.29 to −82.91.
- Plain-language UI strings live in `strings/en.json`, with `strings/es.json` carrying the same keys (tests check keys and placeholders); reading level ≤ 6th grade; no jargon ("Free groceries," not "Food pantry services"). What a place wrote about itself is never machine-translated.
- Accessibility: every action has a descriptive label; dynamic type must not truncate phone numbers.
- Commit `data/hsds/` on publish; never commit `data/bundle/`.
- Tests: fixtures for query semantics; schema validation for every bundle build; a Worker test that proves no IP or install_id reaches D1.

## Data sources

Registry in `data/sources.yaml` for the layers that become listings (see docs/02 for tiers and cadences); the City layers behind the map, parks, ZIPs, events and neighborhood numbers are named at the top of their ingest scripts (`pipeline/src/ingest-*.ts`). Do not scrape any Tier C/D source. No institution maintains a feed for us (DHD included): stewards maintain `data/seed/`; a change in an open-data source arrives as a pull request and is published only when a steward merges it. Page watchers are planned, not built, and would only open steward tasks. All sources are read-only; never write back. Identify our requests honestly; if a site blocks them, check by hand rather than disguising the request.

## Places and condition reports (docs/11, approved)

- Condition reports are about **things, never people**. No category, free-text path, or photo flow for a person, tent, vehicle someone sleeps in, or "suspicious activity." Do not add one, even if asked by a partner; raise it with Kyle.
- Raw GPS never leaves the device; a condition report names the segment whose screen the person opened. Photos are re-drawn on device and stripped of every non-picture block, refused by the server if they carry Exif or any other metadata block, never public, and deleted 30 days after the report closes. Photos are demo-only until the legal advice in docs/11 is in hand.
- Neighborhood indicators (docs/13) use public datasets and our own listings only; never reports, usage, or anything a phone sends. No rankings of neighborhoods, no per-neighborhood crime, small counts suppressed.

## Things to ask Kyle before doing

- Registering a domain, creating Cloudflare resources, or anything that costs money.
- Adding a dependency with a non-permissive license.
- Any deviation from the zero-PII rules, even "temporary for debugging."
- Changing the app's name. It is **Detroit Compass** and lives in `app.name` in `strings/en.json` and `strings/es.json`, the web manifest, and the page title.
