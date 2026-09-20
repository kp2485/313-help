# 313 Help — server-side and operations audit

Audited 2026-09-20 against `/Users/kylepeterson/projects/313-help`. Every status below was checked in code, config,
or by running a read-only command; doc claims were not taken at face value.

## How this checkout was exercised

| Command | Result |
|---|---|
| `git rev-parse --is-inside-work-tree` | `fatal: not a git repository` — **this directory is not a git repo at all** (no `.git`). Nothing here is under version control locally. |
| `ls .github` | `No such file or directory`. `find . -name "*.yml" -o -name "*.yaml"` (excl. node_modules) returns only `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `data/sources.yaml`. **No CI workflow and no publish workflow exist in this checkout.** |
| `pnpm --filter @313help/api test` | 3 files, **68 tests, all pass** (883 ms) |
| `pnpm --filter @313help/api typecheck` | clean (`tsc -p .`, no output) |
| `pnpm test` (all packages) | query 111 pass, pipeline 113 pass, api 68 pass, **web 66 pass / 1 fail**: `apps/web/test/web.test.ts:334` — `ENOENT … /313-help/.github/workflows/publish.yml`. The repo's own test suite is red solely because the publish workflow file is absent here. |
| `pnpm preflight` | 6 STOP, 4 ok, 1 look → exit 1 (item-by-item below) |
| `wrangler d1 migrations apply 313-help --local` | all 4 migrations applied cleanly |
| `wrangler dev --port 8787 --local` + curl | full public and steward flow exercised end to end (details below). Worker stopped; `api/.wrangler` and the temporary `api/.dev.vars` were deleted afterwards, leaving `api/` exactly as found. |

## Endpoint-by-endpoint

All line numbers are `api/src/index.ts` unless noted.

| Endpoint | What it does | Status | Evidence | Missing |
|---|---|---|---|---|
| CORS/no-store middleware `/v1/*` (:30) | ACAO from `ALLOWED_ORIGIN`, `Vary`, `Cache-Control: no-store`, 204 on OPTIONS | active locally | curl `OPTIONS /v1/reports` → 204 with `Access-Control-Allow-Origin: http://localhost:5173` | `ALLOWED_ORIGIN` still localhost (preflight STOP) |
| `GET /v1/health` (:38) | `{ok:true}` for the app's "reporting available" dot | active locally | curl → `200 {"ok":true}` | — |
| `POST /v1/reports` (:46) | closed-schema parse, target must exist, per-day dedupe, minute/hour coarsening, masking, optional photo claim in one D1 batch | active locally, built but not deployed | curl: unknown field → `400 {"error":"unknown field: install_id"}`; unknown target → 422; 3 posts from 2 nonces → 2 rows; `detail` stored as `call [removed] they moved`; `sal_` row `submitted_at 2026-09-20T16:29Z`, `seg_` row `2026-09-20T16:00Z` and `observed_at 2026-09-20T15:00Z`. Tests: "counts one device once per target, kind and day", "masks phone numbers and emails in free text BEFORE storing it", "place reports keep only the hour" (api.test.ts:78–108) | no Turnstile/attestation (DECISIONS 2026-09-18 row 58 still Open) |
| `POST /v1/photos` (:73) | JPEG-only, size cap, `checkJpeg` metadata refusal, private R2 put, key row | built, **off by switch**, bucket does not exist | curl → `503 {"error":"photos are off"}`; `PHOTOS_ENABLED = "false"` in `api/wrangler.toml`; photo.test.ts "is off unless the switch is on, even with a bucket" | R2 bucket (needs Kyle), legal advice (docs/11), face block-out |
| `POST /v1/proposals` (:86) | add-a-place, masked free text, no DV address, display-only ref | active locally | curl → `202 {"accepted":true,"ref":"886D5B"}`; stored `what` = `Free groceries call [removed] or [removed]`, `submitted_at 2026-09-20T16:28Z`; tests "never stores an address for a domestic violence shelter" | — |
| Steward gate `/v1/steward/*` (:96) | Access JWT verify or localhost `DEV_STEWARD`; JSON content type + same-Origin on writes | active locally, Access side unconfigured | with no `.dev.vars`: every steward route → `401 {"error":"not signed in"}`. With `DEV_STEWARD=audit`: reads 200. Writes: form content-type → `415 {"error":"send JSON"}`; `origin: https://evil.example` → `403 {"error":"not from the steward page"}`; `origin: http://localhost:5173` → 200 | `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` are empty strings in `wrangler.toml` → **the Worker fails closed; no steward could sign in to a deployed copy today** |
| `GET /v1/steward/queue` (:122) | open non-confirmation reports, `closed_phones` counts, open proposals | active locally | curl returned both reports, `"closed_phones":{"sal_audit_demo":2}`, no `client_nonce` in the payload; test "the queue says how many different phones said closed, and never sends the hashes" | — |
| `GET /v1/steward/photos/:key` (:130) | steward-only photo view | built but unreachable | no R2 bucket; `PHOTOS` binding is the local fake only | bucket |
| `POST /v1/steward/photos/:key/discard` (:135) | delete now, null the report's key, log it | built but unreachable | photo.test.ts "a steward can discard a photo at once; the report stays" | bucket |
| `POST /v1/steward/reports/:id/resolve`, `…/proposals/:id/resolve` (:154, :169) | status + reason code + action log | active locally | test "queue, resolve with a reason code, and log who did it" | — |
| `POST /v1/steward/reports/settle` (:158) | settle only the ids the page showed, on that target, still open, never a confirmation | active locally | tests at api.test.ts:233–275 | — |
| `POST /v1/steward/listings/:id/status` (:173) | archive/suspend/restore → `listing_overrides`, settles shown closure reports, logs | active locally | curl archive → `{"ok":true}`; aggregates then showed the override and the target dropped out of open counts; `steward_actions` row `dev:audit / listing.archived / closed_permanently` | — |
| `PUT /v1/steward/targets` (:196) | pipeline syncs the ids that exist | active locally | called by `pipeline/src/reports-sync.ts:60` (`pushTargets`), used from `build.ts:16` | needs the Access service token in production |
| `GET /v1/steward/aggregates` (:206) | counts/dates per target, overrides, circuit-breaker flag | active locally | curl: `closed_open:2, open_after_closed:0`; after 6 closed reports on 6 targets → `{"circuit_breaker":true,"targets":[]}` with overrides still present — labels freeze, steward decisions don't (DECISIONS 2026-09-19 rows 67 and 133) | — |
| `PUT /v1/steward/tasks` (:234) | replaces the open `source_check` set | active locally | curl → `{"ok":true,"opened":1,"cleared":0}`; tests at api.test.ts:337–382 | only fed by the nightly job, which does not exist here |
| `GET /v1/steward/tasks` (:259) | open tasks for the admin page | active locally | curl returned the task with detail and `checked_on` | — |
| `POST /v1/steward/tasks/:id/dismiss` (:264) | `checked_fine` / `will_fix`, logged in the same batch | active locally | test "a dismissed task stays dismissed while the check says the same thing" | — |
| `POST /v1/provider/claim` | provider ownership + email | **planned only** | named in docs/06 "later, v1.1; not built"; no route in `api/src/index.ts` | everything |

## D1 schema, migrations, retention, breaker, masking

| Item | Status | Evidence | Missing |
|---|---|---|---|
| Migrations `0001_init` … `0004_tasks` | active locally; **never applied to a remote D1** | `wrangler d1 migrations apply --local` applied all four; `database_id = "00000000-…-000000000000"` placeholder in `api/wrangler.toml` | `wrangler d1 create 313-help` (needs Kyle) |
| Eight tables, no resident identifiers | active | `api/migrations/0001_init.sql`, `0002`, `0003`, `0004`. Grep of the live local schema for `ip`, `user_agent`, `device`, `latitude`, `longitude` returned nothing | — |
| Zero-PII source scan | active and enforced | api.test.ts:85 scans every file in `api/src/` for `connecting-ip\|forwarded-for\|real-ip\|user-agent\|console.log\|req.raw.cf\|.cf`; my own grep over `api/src/` found only the comment on line 3 | — |
| Masking (`mask`, `api/src/validate.ts:21`) | active, verified live | stored proposal and report both show `[removed]`; covers report detail, suggested hours/address, proposal what/schedule/notes; phone fields deliberately kept | — |
| 180-day retention + proposal purge (`retention`, :298) | built, runs on cron; **cron never fires because nothing is deployed** | `crons = ["17 8 * * *"]` in `wrangler.toml`; `scheduled` at :317; `curl /cdn-cgi/handler/scheduled` → 200 locally; tests "turns reports older than 180 days into monthly counts", "counts and removes in one step", "removes proposals settled more than 180 days ago" | a deployed Worker |
| Photo retention (`photoRetention`, :281) | built, unreachable | photo.test.ts:159–195, incl. "without the bucket, a report with a photo waits rather than leave the picture behind" | bucket |
| Circuit breaker (:212–:226) | active, verified live | 6 targets closed in 24 h → `circuit_breaker: true`, `targets: []`; `pipeline/src/reports-sync.ts` applies counts as sent; admin.js renders the banner | — |
| Rate limiting | **planned only — nothing in code, by design** | `api/wrangler.toml` trailing comment says the WAF rule lives in the dashboard; DECISIONS 2026-09-18 row 53. No rate-limit code or binding anywhere in `api/src/` | the WAF rule itself (dashboard, needs Kyle's account). **Until it exists there is no abuse control at all**, only per-day dedupe |
| CSRF on steward writes | active, verified live | 415 / 403 / 200 results above; DECISIONS 2026-09-19 row 121; tests at api.test.ts:383–436 | — |
| Clickjacking headers | built, unverified in production | `apps/web/public/_headers` (`frame-ancestors 'none'`, `X-Frame-Options: DENY` for `/admin` and `/admin/*`); test "the steward page cannot be framed" reads that file; preflight checks it | depends on Cloudflare Pages actually serving `_headers` |

## Admin steward page

| Item | Status | Evidence |
|---|---|---|
| `admin/` page (5 files, no build step) | active locally | `admin/index.html`, `admin.js` (132 lines), `queue.js`, `queue.d.ts`, `admin.css`. Served in dev by the Vite plugin at `/admin` (`apps/web/vite.config.ts` `bundleFiles()`), copied to `dist/admin` on build |
| What it can do | reported listings/places grouped and ranked, phone script, archive (3 reasons) / restore, settle-what-was-shown, proposals (4 outcomes), "Pages that changed" tasks, circuit-breaker banner, archived list with restore, a "run `pnpm build:bundle`" note | `admin/admin.js` `render()` and the click handler; `admin/queue.js` `groupReports`/`settleBody`/`taskItem`; tested headlessly in `api/test/admin.test.ts` (8 tests) |
| Local auth | `DEV_STEWARD` in `api/.dev.vars`, localhost-only | verified: without the file every steward route 401s; with it, reads return data. **`api/.dev.vars` does not exist in this checkout**, so a fresh clone's admin page shows "Not signed in" until someone creates it (documented in OPERATIONS) |
| Production auth | planned only | one Cloudflare Access application must cover `/admin/*` **and** `/v1/steward/*` (OPERATIONS step 5). Nothing in the repo configures it; `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` are empty |
| No publish button, no resource editor, no alert composer | by design | docs/06 "Not built" list matches the code |

## Publishing, CI, keys

| Item | Status | Evidence | Missing |
|---|---|---|---|
| `.github/workflows/publish.yml` | **does not exist here** | `ls .github` → no such directory; no yml anywhere. Docs describe 11 steps in detail (OPERATIONS 120–137, docs/06:56) as "written 2026-09-18, never run" — in this checkout it is not written either | the file itself (or a copy from the GitHub repo) |
| `.github/workflows/ci.yml` | **does not exist here** | docs/06:51 lists it in the repo layout | same |
| `PUBLISH_ENABLED` | planned only | referenced only in prose and in `preflight.ts:73`'s closing line; no code reads it | the workflow and the repo variable |
| Local publish path `pnpm build:bundle` | active | `data/bundle/v1/` exists with `index.json`, `index.json.sig`, `category/`, `places/`, `map/`, `indicators/`, `alerts.json`, `archived.json`, `emergency.json` | — |
| Nightly re-check pieces the workflow would call | built | `pipeline/src/check-sources.ts` (`--recheck` writes `data/staging/recheck.json`), `pipeline/src/tasks-sync.ts` (`syncTasks`, refuses to send when the list is missing). Note DECISIONS row 97 (2026-09-19) still says these are "Not built" — that row is stale; the code exists | nothing to run them on a schedule |
| Signing keys | dev key only | `.keys/dev-ed25519.pem` exists (one throwaway key). Release path refuses a dev key: `apps/web/vite.config.ts` `pinnedKeys()` under `WEB_RELEASE=1` | two real Ed25519 keys via `pnpm keys:generate`, active one into `BUNDLE_SIGNING_KEY`, both public halves into `BUNDLE_PUBLIC_KEYS`, spare offline (needs Kyle) |
| Secrets inventory | documented only | OPERATIONS "Secrets (names only)" table: `BUNDLE_SIGNING_KEY`, spare key, `ACCESS_CLIENT_ID`/`SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | all of them; none exist |

## `pnpm preflight`, item by item

Source: `pipeline/src/preflight.ts`. Output of the run above:

| # | Check | Result | What it means here |
|---|---|---|---|
| 1 | `BUNDLE_PUBLIC_KEYS` pins two different Ed25519 keys | **STOP** | env unset; only the dev key exists |
| 2 | `BUNDLE_SIGNING_KEY` is set and is a private key | **STOP** | env unset |
| 3 | the signing key is one of the two pinned keys | **STOP** | follows from 1 and 2 |
| 4 | `api/wrangler.toml` has the real D1 database id | **STOP** | still the all-zeros placeholder |
| 5 | `ALLOWED_ORIGIN` is the https site, not localhost | **STOP** | `http://localhost:5173` |
| 6 | Access team domain and AUD are set | **STOP** | both empty strings → steward endpoints fail closed |
| 7 | photos are off in the Worker | ok | `PHOTOS_ENABLED = "false"` |
| 8 | `DEV_STEWARD` is not in `wrangler.toml` | ok | it isn't |
| 9 | the directory is not marked retired | ok | `data/seed/directory.json` |
| 10 | the photo field is off in the app | ok | same file |
| 11 | no emergency number has a page that showed a different number | ok | no `mismatch_on` in `data/seed/emergency.csv` |
| 12 | the steward page can't be framed | ok | `apps/web/public/_headers` |
| 13 | the app is named 313 Help in strings, manifest, title | ok | — |
| 14 | the hand-check worksheet is done | look | **56 rows in `docs/CHECKS-2026-09-19.md` still have no result** |

Preflight does **not** check for the publish workflow, `PUBLISH_ENABLED`, the R2 bucket, or the WAF rule — it only prints a
reminder line about `PUBLISH_ENABLED`. That is a gap: five of the six STOPs are about deployment, but two dashboard-only
controls (WAF rate limit, Access policy) have no check at all.

## What still needs Kyle's accounts or money

| Thing | Cost | Blocking |
|---|---|---|
| Non-personal Cloudflare account + GitHub org | $0 | everything below |
| Domain | ~$12/yr | `ALLOWED_ORIGIN`, same-origin routing, Pages |
| D1 database (`wrangler d1 create`) | $0 | the whole write plane |
| Worker deploy + route | $0 | reports, proposals, steward queue |
| Cloudflare Access application + steward allowlist + pipeline service token | $0 | the admin page and every steward endpoint in production |
| WAF rate-limiting rule on `POST /v1/*` | $0 | the only abuse control that exists in the design |
| R2 bucket `313-help-photos` | $0 | photos — plus the legal advice in docs/11 before the switch flips |
| Cloudflare Pages project | $0 | serving the app, the bundle and `/admin/` |
| GitHub Actions variables and secrets | $0 | the nightly publish |
| Apple Developer / Play | $99/yr + $25 | store releases only |

## Biggest gaps

1. **No workflows, and no git.** `.github/` is absent entirely — no `publish.yml`, no `ci.yml` — and this directory is not a git repository. Everything docs/06 and OPERATIONS say about the nightly publish describes a file that is not here, and docs/12's "GitHub Actions workflows all live in the repo" is false for this checkout.
2. **The repo's own test suite is red** because of that one missing file (`apps/web/test/web.test.ts:334`). Anyone running `pnpm test` today sees a failure that has nothing to do with the code under test — and the publish workflow itself was supposed to run `pnpm test` as step 3.
3. **Nothing is deployed.** No D1 (placeholder id), no Worker, no Pages, no R2, no Access. Six preflight STOPs, all of them deployment prerequisites needing Kyle's accounts.
4. **Access is unconfigured, so a deployed Worker would lock every steward out.** `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are empty strings; `verifyAccess` fails closed. This is correct fail-closed behavior, but it means step 4 (deploy) without step 5 (Access) yields an admin page nobody can use.
5. **Rate limiting exists only as a comment.** By deliberate design there is no code — but the WAF rule is not created either, so today the entire abuse defense is the per-target-per-day nonce, which any client can regenerate. This is the one privacy-motivated tradeoff whose other half is still missing.
6. **The cron retention pass has never run.** `retention` and `photoRetention` are well tested and work locally (`/cdn-cgi/handler/scheduled` → 200), but the 180-day purge and the 30-day photo delete are promises that only a deployed Worker keeps.
7. **Photos: two switches off, plus a missing bucket and missing legal advice.** The code is complete and thoroughly tested (27 tests incl. Exif/XMP/ICC/IPTC refusal and the two-reports-race case), so this is a governance gap, not an engineering one — but four things must land together before it ships.
8. **`docs/DECISIONS.md` row 97 (2026-09-19) is stale**: it says page re-checks and machine-raised steward tasks are "not built", while `pipeline/src/check-sources.ts --recheck`, `pipeline/src/tasks-sync.ts`, migration `0004_tasks.sql` and four Worker routes all exist and pass tests. Later rows 125/126 supersede it but the Open row was never closed.
9. **56 unchecked rows in the hand-check worksheet** (`docs/CHECKS-2026-09-19.md`), flagged "look" rather than "stop" — human work owed before a public release, not a code gap.
10. **Preflight has blind spots.** It cannot see the two dashboard-only controls it most depends on (Access policy, WAF rule), nor the existence of the publish workflow, nor whether the R2 bucket exists. A checkout could pass every STOP and still deploy an unprotected API.
