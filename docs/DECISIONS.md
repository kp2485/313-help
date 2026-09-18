# DECISIONS

Decisions the numbered docs don't cover, or where they were changed. One line of rationale each. **Proposed** = recommended by the audit (doc 10) or the places proposal (doc 11), waiting on Kyle. **Accepted** = in force; update the numbered doc to match.

| Date | Status | Decision | Rationale |
|---|---|---|---|
| 2026-09-18 | Accepted | Design docs live in `docs/`; CLAUDE.md stays at repo root. | CLAUDE.md and 06 already assumed this layout. |
| 2026-09-18 | Accepted | Public repo carries roles, not names, for DHD staff and partner contacts. | Public repo; people didn't agree to be named. |
| 2026-09-18 | Accepted | **No institution maintains data for us.** There is no DHD spreadsheet or feed and no authorization letter; none is assumed. Stewards maintain `data/seed/`; page watchers on public DHD pages open steward tasks and never auto-publish; `owner_feed`/`owner_attest` remain in the schema for orgs that opt in later. Docs 01–04, 06–09, README, CLAUDE.md updated. | Kyle, 2026-09-18: DHD did not respond as though it would maintain anything. |
| 2026-09-18 | Accepted | Harm-reduction station cadence 14 → 30 days, verified by phoning the host site; stock-outs carried as same-day signals. | 14 days assumed an owner. An honest 30 beats a fictional 14. |
| 2026-09-18 | Accepted | **No scheduled verification.** Humans act on exceptions only: check at entry, weekly pass over reported rows and machine-raised tasks, monthly calls to ~15 safety-critical rows. Badges state facts and never say "verified" for an unchecked row. (04, 10-A6) | Open-source gift with no paid operator; a standing calling job would not be staffed. |
| 2026-09-18 | Accepted | The app is open source and intended as a gift to the city. It must run unattended, degrade honestly, shut itself off safely, and be transferable. (doc 12) | Kyle, 2026-09-18. |
| 2026-09-18 | Accepted | Community reports never hide a row; they demote and label. Only a steward changes visibility. (10-A1) | Client nonces are forgeable, so "two independent reports" is two HTTP requests. |
| 2026-09-18 | Accepted | Presence in a source (open-data layer, watched page, any future feed) is never verification and never resets the clock. (10-A2) | "Still listed" only means the publisher hasn't removed it. |
| 2026-09-18 | Proposed | Bundle ships verification facts; clients compute stale/badge/sort from the device date. Bundle-age banner after 72h. (10-A3) | Build-time badges lie on offline phones. |
| 2026-09-18 | Proposed | `client_nonce = sha256(install_secret ‖ target_id ‖ day)`; reword the non-negotiable to "no identifier ever leaves the device." (10-A4) | Daily nonce links one person's reports into a location trail; on-device UUID contradicted CLAUDE.md as written. |
| 2026-09-18 | Proposed | 911 and 988 hardcoded, never overridable. Any phone/address/coordinate change on any row is held for steward approval. Bundles are Ed25519-signed; clients pin the public key. (10-A5) | Closes the sheet → pipeline → emergency strip hijack path. |
| 2026-09-18 | Proposed | Shelter button uses 866-313-2520 until both numbers are verified by phone. Emergency CSV carries `verified_by_call_on`; build fails if older than 30 days. (10-A9) | City now directs shelter seekers to the Housing Resource HelpLine. |
| 2026-09-18 | Proposed | Split the overdose triage entry into "overdosing right now" (911 + steps only) and "I want Narcan to carry." (10-A7) | Two different users; a map is harmful to the first. |
| 2026-09-18 | Proposed | Badge = f(state, age ÷ cadence, latest verification method). Numeric score is a sort key only. (10-B1) | Current formula can never give a phone-verified community pantry the good badge. |
| 2026-09-18 | Proposed | One ranking rule: eligibility → distance band → open-now/next-open → freshness → distance. (10-B2) | Docs had three; confidence-before-distance fails people without cars. |
| 2026-09-18 | Proposed | `signals.json` on R2, rewritten ~every 15 min, for same-day signals with TTLs. (10-B4) | "No food today" can't wait for a nightly build. |
| 2026-09-18 | Proposed | Self-hosted PMTiles basemap + MapLibre instead of Leaflet + OSM tile servers. (10-B8) | OSM policy forbids offline prefetch; third-party tiles leak where users look. |
| 2026-09-18 | Proposed | Evaluate `rrule-temporal` against `rrule` on the DST fixtures; pick the one that passes. (10-B3) | `rrule` has open TZID/DST bugs. CLAUDE.md names `rrule`, so this needs Kyle's OK. |
| 2026-09-18 | Proposed | Worker: `invocation_logs = false`, Logpush off, no header logging; edge rate limiting is the only IP-keyed control and we never read the IP. | Default Workers Logs capture request metadata. |
| 2026-09-18 | Proposed | Press-release alerts always need a human publish. No auto-publish, ever. (10-B10) | Offline phones can't receive a retraction. |
| 2026-09-18 | Proposed | Enroll Apple/Play developer accounts as an organization (Linwood Technologies). (10-B5) | App Review 5.1.1(ix). |
| 2026-09-18 | Proposed | Scope widens from "help for people in need" to "help and healthy places." See doc 11 for the guardrails. | Greenway/parks integration; changes 01 "What it is NOT." |
| 2026-09-18 | Proposed | New ID prefixes `plc_` (place), `seg_` (greenway segment), `cond_` (condition report). | CLAUDE.md lists the allowed prefixes; places need their own. |
| 2026-09-18 | Proposed | Condition-report photos are not part of the dataset: private bucket, steward-only, deleted 30 days after the report closes. | "Nothing is deleted" protects resource history; it must not become a photo archive of neighborhoods. |
