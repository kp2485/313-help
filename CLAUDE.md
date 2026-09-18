# CLAUDE.md — handoff for Claude Code

You are building **DetroitHelp** (working name), a zero-PII resource directory app for Detroit residents. Read `docs/README.md` first, then `docs/04-resource-lifecycle.md` and `docs/06-architecture.md`. Every design decision is in `docs/`; if a task conflicts with a doc, stop and ask rather than silently diverging. If you make a decision the docs don't cover, add it to `docs/DECISIONS.md` with a date and one-line rationale.

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

1. `data/seed/` CSVs → `pipeline/` → `data/bundle/v1/` (HSDS-valid + `x_detroit`). Fixture tests for open-now / next-occurrence / ranking in `schema/fixtures/` **before** any UI.
2. `apps/web/` PWA reading the bundle: Home, category list, detail, triage, offline.
3. `api/` Worker + D1: `POST /v1/reports`, `POST /v1/proposals`, steward endpoints behind Cloudflare Access.
4. `admin/` minimal steward queue + publish.
5. `apps/ios/` SwiftUI shell if time remains.

## Conventions

- TypeScript strict for pipeline/api/web; SwiftUI (iOS 17+) for iOS. Node 22. pnpm workspaces.
- IDs are stable slugs (`org_`, `loc_`, `svc_`, `sal_`, `alert_`, `rpt_`, plus `plc_` place, `seg_` greenway segment, `cond_` condition report, `prop_` proposal). Never reuse.
- Shared query semantics (open-now, next occurrences, badge, ranking) live in `packages/query` with the spec in `schema/query-spec.md` and fixtures in `schema/fixtures/`; web and pipeline import it, iOS re-implements against the same fixtures.
- Schedules are HSDS/iCal RRULE fields; compute occurrences with a tested library (`rrule` on web/pipeline, used in floating wall-clock mode only — see DECISIONS.md; a small tested Swift implementation or `EventKit`-free custom evaluator on iOS). DST tests are required.
- Detroit time zone `America/Detroit` everywhere. Bbox sanity: lat 42.25–42.46, lon −83.29 to −82.91.
- Plain-language UI strings live in one `strings/en.json`; reading level ≤ 6th grade; no jargon ("Free groceries," not "Food pantry services").
- Accessibility: every action has a descriptive label; dynamic type must not truncate phone numbers.
- Commit `data/hsds/` on publish; never commit `data/bundle/`.
- Tests: fixtures for query semantics; schema validation for every bundle build; a Worker test that proves no IP or install_id reaches D1.

## Data sources

Registry in `data/sources.yaml` (see docs/02 for tiers and cadences). Do not scrape any Tier C/D source. No institution maintains a feed for us (DHD included): stewards maintain `data/seed/`, page watchers only open steward tasks, and nothing auto-publishes from a watched page. All sources are read-only; never write back.

## Places and condition reports (docs/11, approved)

- Condition reports are about **things, never people**. No category, free-text path, or photo flow for a person, tent, vehicle someone sleeps in, or "suspicious activity." Do not add one, even if asked by a partner; raise it with Kyle.
- Raw GPS never leaves the device; the client snaps to a `seg_`/`plc_` id. Photos are re-encoded on device (no EXIF), rejected by the server if they carry EXIF, never public, deleted 30 days after the report closes.
- Neighborhood indicators (docs/13) use public datasets only, never app data. No rankings of neighborhoods, no per-neighborhood crime, small counts suppressed.

## Things to ask Kyle before doing

- Registering a domain, creating Cloudflare resources, or anything that costs money.
- Adding a dependency with a non-permissive license.
- Any deviation from the zero-PII rules, even "temporary for debugging."
- Naming the app in user-facing strings (placeholder: DetroitHelp).
