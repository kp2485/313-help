# CLAUDE.md — handoff for Claude Code

You are building **DetroitHelp** (working name), a zero-PII resource directory app for Detroit residents. Read `docs/README.md` first, then `docs/04-resource-lifecycle.md` and `docs/06-architecture.md`. Every design decision is in `docs/`; if a task conflicts with a doc, stop and ask rather than silently diverging. If you make a decision the docs don't cover, add it to `docs/DECISIONS.md` with a date and one-line rationale.

## Non-negotiables (from docs/01 and docs/08)

- No accounts, no names, no phone numbers, no emails, no persistent identifiers for residents — on device or server. If a feature seems to need one, it's out of scope.
- Never log or persist client IPs in the Worker. Timestamps at minute granularity.
- Triage answers live in memory only and are cleared on exit.
- Nothing is deleted from the dataset; rows are archived with reason.
- Every listing shows `last_verified_at`-derived freshness. Unknown is never rendered as "open."
- Emergency numbers are static in the app and overridden by the bundle; verify each before any release.
- Harm-reduction, DV, and crisis screens follow the ordering rules in docs/05 (911/hotline first).

## Build order for the hackathon (docs/09)

1. `data/seed/` CSVs → `pipeline/` → `data/bundle/v1/` (HSDS-valid + `x_detroit`). Fixture tests for open-now / next-occurrence / ranking in `schema/fixtures/` **before** any UI.
2. `apps/web/` PWA reading the bundle: Home, category list, detail, triage, offline.
3. `api/` Worker + D1: `POST /v1/reports`, `POST /v1/proposals`, steward endpoints behind Cloudflare Access.
4. `admin/` minimal steward queue + publish.
5. `apps/ios/` SwiftUI shell if time remains.

## Conventions

- TypeScript strict for pipeline/api/web; SwiftUI (iOS 17+) for iOS. Node 22. pnpm workspaces.
- IDs are stable slugs (`org_`, `loc_`, `svc_`, `sal_`, `alert_`, `rpt_`). Never reuse.
- Schedules are HSDS/iCal RRULE fields; compute occurrences with a tested library (`rrule` on web/pipeline; a small tested Swift implementation or `EventKit`-free custom evaluator on iOS). DST tests are required.
- Detroit time zone `America/Detroit` everywhere. Bbox sanity: lat 42.25–42.46, lon −83.29 to −82.91.
- Plain-language UI strings live in one `strings/en.json`; reading level ≤ 6th grade; no jargon ("Free groceries," not "Food pantry services").
- Accessibility: every action has a descriptive label; dynamic type must not truncate phone numbers.
- Commit `data/hsds/` on publish; never commit `data/bundle/`.
- Tests: fixtures for query semantics; schema validation for every bundle build; a Worker test that proves no IP or install_id reaches D1.

## Data sources

Registry in `data/sources.yaml` (see docs/02 for tiers and cadences). Do not scrape any Tier C/D source. Owner feeds are read-only; never write back.

## Things to ask Kyle before doing

- Registering a domain, creating Cloudflare resources, or anything that costs money.
- Adding a dependency with a non-permissive license.
- Any deviation from the zero-PII rules, even "temporary for debugging."
- Naming the app in user-facing strings (placeholder: DetroitHelp).
