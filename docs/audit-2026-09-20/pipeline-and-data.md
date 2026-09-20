# 313 Help — pipeline & data audit

Audited 2026-09-20 against the checkout at `/Users/kylepeterson/projects/313-help`.
Read-only: no file in the project was changed and no `data/`-writing script was run.

Commands run: `pnpm --filter @313help/pipeline test` (3 files, **113 tests pass**, 1.73 s),
`pnpm --filter @313help/query test` (**111 tests pass**), `pnpm --filter @313help/pipeline typecheck` (**exit 0**),
`pnpm preflight` (**6 STOP, 1 look, exit 1**). Everything else is file reading and Python counting.

Baseline facts computed from the checkout:

- `data/bundle/v1/index.json`: version `nogit-20260920T1539-2e0e0eca`, `generated_at 2026-09-20T15:39Z`,
  `emergency_verified: true`, `signing: "dev"`. Bundle files mtime 2026-09-20 11:39 EDT. **The bundle is current.**
- 418 live rows across 20 category files = 358 seed rows (`status: active`) + 60 DHD open-data rows.
- `data/seed/resources.csv`: 369 rows, 358 active + **11 `proposed`** (proposed rows are dropped in
  `pipeline/src/normalize.ts:31` and never reach the bundle or the HSDS export).

---

## Scripts in `pipeline/package.json`

Every one of the 17 scripts resolves to a file that exists in `pipeline/src/`. Last-used dates come from output
file mtimes and from date stamps written into the seed CSVs — **this checkout has no `.git` directory**, so git
history was not available as evidence.

| Script / file | Status | Evidence | Missing |
|---|---|---|---|
| `test` → vitest | **active** | 113 tests pass across `pipeline/test/{pipeline,preflight,treatment}.test.ts`; covers validation, emergency rules, ingest paging, page matching, hours parsing, alerts, indicators, re-check tasks, and the real built bundle (`pipeline/test/pipeline.test.ts:603-683`) | no test asserts the *absence* of `.github/workflows/publish.yml`, which docs claim exists |
| `typecheck` → `tsc -p .` | **active** | exit 0 | — |
| `build:bundle` → `src/build.ts` | **active** | bundle + `data/hsds/services.json` + `data/indicators/neighborhoods.json` all written 2026-09-20 11:39 | `signing: "dev"`; a release build has never been produced (no `BUNDLE_SIGNING_KEY`) |
| `ingest:opendata` → `src/ingest-arcgis.ts` | **active** | `data/ingested/dhd_harm_reduction.csv` 60 rows, all `source_last_edited=2026-08-26`, mtime 2026-09-19 09:43; `data/staging/rec_centers.csv` 11 rows | not re-run since 2026-09-19; only `kind: arcgis` sources are handled (`ingest-arcgis.ts:100`) |
| `ingest:greenway` → `src/ingest-greenway.ts` | **active** | `data/ingested/jlg_segments.json`, 52 segments (20 open, 9 under construction, 9 funded, 14 planned) | — |
| `ingest:city` → `src/ingest-city.ts` | **active** | `city_parks.json` 302 parks, `city_zips.json` 37 ZIP centroids | City events deliberately not read (`ingest-city.ts:2`); no `events.json` in the bundle, as doc 02 says and `pipeline/test/pipeline.test.ts:650` asserts |
| `ingest:neighborhoods` → `src/ingest-neighborhoods.ts` | **active** | `neighborhoods.json` (205), `city_stats.json` 340 KB, `city_points.json` 133 KB, `stats_fetched_at: 2026-09-19` | monthly refresh is a CI job that does not exist |
| `ingest:basemap` → `src/ingest-basemap.ts` | **active** | `data/ingested/basemap/` = `base.json` + `crossings.json` + 58 cells; bundle `map/streets.json` 334 KB | — |
| `ingest:treatment` → `src/ingest-treatment.ts` | **active** | `data/staging/samhsa_treatment.csv` 50 rows (Detroit 43, HP 4, Dearborn 2, Hamtramck 1), mtime 2026-09-19 15:40; `data/seed/incoming/samhsa-treatment.txt` | 4 of the 19 treatment rows imported are still `proposed` (their own pages don't show the phone/street) |
| `import:lines` → `src/import-lines.ts` | **active** | 22 files in `data/seed/incoming/`, 332 non-blank lines, latest `2026-09-20-food-banks.txt` | — |
| `check:sources` → `src/check-sources.ts` | **active (promote mode only)** | 31 rows carry `checked_at_entry = 2026-09-20`; 344 of 358 active rows are `entry_method: auto_check`, 14 `web`; 33 rows carry a "source page could not be read" note | **`--recheck` (the nightly re-check) has never been run**: `data/staging/recheck.json` does not exist |
| `check:emergency` → `src/check-emergency.ts` | **active** | 9 non-hardcoded rows in `data/seed/emergency.csv` carry `verified_published_on` 2026-09-19/2026-09-20; no `mismatch_on` anywhere; `emergency_verified: true` in the index | `emg_shelter_outwayne` was read by a person (site 403s to scripts) but recorded in `verified_published_on`, not `verified_by_call_on` |
| `tasks:sync` → `src/tasks-sync.ts` | **built but unused** | implemented + 4 tests (`pipeline.test.ts:685-724`); Worker side exists (`api/src/index.ts:234`, `:259`) | needs `data/staging/recheck.json` (absent) **and** `REPORTS_API` (unset). Never run |
| `alert:new` → `src/alert-new.ts` | **built but unused** | 6 tests (`pipeline.test.ts:448-489`); `data/seed/alerts.json` is `[]`, bundle `alerts.json` is `[]` (3 bytes) | no alert has ever been written, including a demo one |
| `preflight` → `src/preflight.ts` | **active** | 6 STOPs: both key checks, the signing-key check, D1 `database_id`, `ALLOWED_ORIGIN`, Access team/AUD. 1 look: 56 unfinished rows in `docs/CHECKS-2026-09-19.md` | all 6 STOPs are deploy config, none is a data problem |
| `keys:generate` → `src/keys.ts` | **used once (dev)** | `.keys/dev-ed25519.pem` written 2026-09-19 14:33 | no release key pair; `BUNDLE_PUBLIC_KEYS` unset, so no client can pin anything yet |
| `geocode` → `src/geocode.ts` | **active, by hand** | 399 of 418 bundle rows carry lat/lon; the 19 without are hotlines/phone-only services + the 3 DV rows (correctly excluded at `geocode.ts:18`) | — |
| *(no script)* `src/access-report.ts` | **built, output stale** | `data/indicators/greenway_access.json` mtime 2026-09-19 09:43: 20 open segments, **49** listings within ½ mile, 18 segments flagged. Recomputing the same measure against the current 418-row bundle gives **114** listings, 16 flagged, 3 segments with nothing at all | never re-run after the last two builds; docs/13 honesty rule 6 still quotes the even older "91 listings / nine segments" figure |

Library modules with no script (all exercised by tests): `normalize.ts`, `validate.ts`, `page-match.ts`,
`reports-sync.ts`, `indicators.ts`, `sign.ts`, `seed-io.ts`, `util.ts`, `xlsx.ts`.

---

## Sources in `data/sources.yaml`

| Source id | Declared | Reality | Evidence |
|---|---|---|---|
| `dhd_harm_reduction` | tier A, `mode: publish`, `max_age_days: 90` | **active, published** | 60 rows → `harm.narcan` in the bundle; badge level `source_listed` ("From the {list}, last updated 2026-08-26"), `checked_at_entry: null`, `entry_method: null` on all 60 |
| `rec_centers` | tier A (2016 layer), `mode: stage` | **staged only, as designed** | 11 rows in `data/staging/rec_centers.csv`, zero in the bundle. The 16 live `rec.center` rows are hand-entered seed rows |
| `jlg_route_segments` | tier A | **active** | 52 segments in `places/greenway.json`, with `cross_streets` merged from the basemap |
| `samhsa_treatment_directory` | tier A, `mode: stage` | **active, staged** | 50 rows in `data/staging/samhsa_treatment.csv` with a decision + reason per row |
| `samhsa_otp_directory` | tier A, `mode: stage` | **active** | merged into the same staging CSV (`otp_certification`, `otp_read` columns) |
| `dwihn_provider_directory` | tier A, matching only | **active** | `dwihn_website`, `dwihn_accepting_new`, `dwihn_updated` columns populated |

Layers used by the pipeline but **not** in `sources.yaml` (named at the top of their ingest scripts, which doc 02
says is intended): city parks, ZIP areas, roads, neighborhoods, parcels, sales, permits, blight, demolitions,
Improve Detroit issues, fires, rentals, vacant registrations, pavement, SNAP retailers, DDOT bus stops — 13 source
entries appear in the built `indicators/neighborhoods.json`.

**Named in docs, never ingested:** DDOT GTFS, DPL branches, police precincts, City calendar/events, the DHD
program directory + its page watcher, Forgotten Harvest, Gleaners, Wayne County Food Finder, the council-district
food-access map, HRSA FQHC list, Karmanos/Council-President PDFs, Wayne County foreclosure and eviction data,
CDC PLACES, crash data. None has an ingester; each is a hand-research input at best.

---

## Data state

| Item | Status | Evidence |
|---|---|---|
| HSDS export | **active and valid** | `data/hsds/services.json` 952 KB: 354 services, 418 `service_at_location`s, 205 organizations, all `status: active`, `assured_date` on 353 (the 60 DHD rows share one service with no dated check, correctly). Validated at every build against the compiled 3.2 schema cached in `.cache/hsds-3.2-service.json` (`validate.ts:118`); the build would have thrown otherwise |
| Schema / row validation | **active, strong** | `validate.ts` enforces id/category/status/availability/encoding, DV-rows-have-no-address, shelter address must come from the shelter's own site, bbox, phone parse, schedule shape, and a contact-name/email leak check. 17 tests |
| Query fixtures | **active** | 111 cases / 76 rows in 10 files, all passing. By function: `openNow` 39, `search` 23, `badge` 20, `nextOccurrences` 9, `rank` 7, `bundleAge` 6, `nearestSegment` 3, `effectiveNow` 2, `helpAlong` 1, `milesToSegment` 1 |
| Query rules **untested** | gap | `FREQ=YEARLY`; negative `byday` (`-1FR`) and negative `bymonthday` (zero occurrences in any fixture); `mode: "week"` has exactly 1 case; `prefer` flags 2 cases; no fixture exercises a DV row (`shelter.dv` appears 0 times) through `rank`; `helpAlong` and `milesToSegment` have 1 case each |
| Freshness / badge rules | **built, barely exercised by real data** | `packages/query/src/freshness.ts` implements all 7 levels + `bundleAge`, 20+6 fixture cases. In the real bundle every row is `entry_checked` (358) or `source_listed` (60): **0 rows** have `last_confirmed_at`, **0** have any report count, **0** are archived or suspended. `reported_once`, `reported_closed`, `confirmed`, `archived` and `never_checked` have never been produced by real data |
| Report / proposal sync into the bundle | **built, never connected** | `reports-sync.ts` (`fetchAggregates`/`applyAggregates`/`pushTargets`) + 6 tests; Worker endpoints exist (`api/src/index.ts:196`, `:206`). Without `REPORTS_API` the build uses zeros (`build.ts:52`), which is what the shipped bundle shows. Proposals never enter the pipeline at all — a steward hand-copies into `resources.csv`, as doc 04 states |
| Nightly re-check + steward tasks | **planned/inert** | `check:sources --recheck` never run, `data/staging/recheck.json` absent, `tasks:sync` refuses without it, `REPORTS_API` unset, and **no CI exists** to run any of it |
| Publish workflow | **missing entirely** | `.github/workflows/publish.yml` is referenced by `docs/README.md`, `docs/04`, `docs/06`, `docs/OPERATIONS.md:120` ("written 2026-09-18, never run") and `CLAUDE.md`. There is **no `.github` directory** and no `.yml` file anywhere in the repo except `pnpm-lock.yaml`/`pnpm-workspace.yaml`/`data/sources.yaml` |
| Git-based steward approval | **not possible in this checkout** | no `.git`, no `.gitignore`. The whole "a change arrives as a pull request / merging the diff is the approval" model (doc 02 §2, doc 04 step 3, 10-A5) has nothing behind it here. `gitSha()` returns `nogit`, which is why the bundle version starts `nogit-` |
| Neighborhood indicators | **active, complete through doc-13 step 5** | 205 neighborhoods, 52 in the greenway lens, 205 with `parcels` and `nearest_city`, 204 with `now`. All 13 source entries present. **All six 2026-09-19-approved measures are computed**: SNAP stores (`places.snap_stores`, `nearest_city.snap`/`.grocery`), bus stops (`places.bus_stops`, `nearest_city.bus`), rental certificates (`now.rental_certs`), building fires (`years.*.fires`, 17 `fire_types`), vacant registrations (`now.vacant_reg`, period 2025-09-19→2026-09-16), main-street pavement (`now.roads.poor_pct`, `roads_years [2021,2024]`). Small-number suppression is real: 1,495 `lt5` markers in the committed file |
| Indicators **not** built | as documented | crashes (no current source), CDC PLACES tract map, foreclosures, evictions — absent from the output, matching doc 13 steps 6–7 |
| Indicators dead field | gap | `help.coverage_checked` is `false` for **all 205** neighborhoods: `build.ts` never passes `coverageChecked` to `buildIndicators` (`indicators.ts:45`), so honesty rule 6's "coverage pass" flag can never flip |
| Directory coverage | thin | **152 of 205** neighborhoods have at least one of food/health/harm with zero listings; **7** have zero help of any kind within ½ mile |
| `to-verify.csv` | **active backlog, 288 rows** | by batch tag: `2026-09-19 new kinds of help` 173, `2026-09-20 food and shower gaps` 65, `2026-09-20 food gaps, round 2` 15, `2026-09-19 DHD programs` 14, `2026-09-19 SAMHSA treatment` 7, untagged 14. By cause: **60** mention a blocked/403/bot-protected page, ~45 a missing or contradictory schedule, 16 a phone problem. Top hosts: detroitmi.gov 22, waynemetro.org 8, accesscommunity.org 5, miside.org 5, karmanos.org 5 |
| Emergency numbers | **checked and clean** | 11 rows (doc 04 still says "6 rows"). 911 and 988 hardcoded; the other 9 all carry `verified_published_on` 2026-09-19/20 and no `mismatch_on`. `validateEmergency` would warn past 30 days and fail a release on a mismatch |
| Alerts | **built, zero data** | `alerts.json` `[]`; `validateAlerts` runs at every build; `alert:new` has 6 tests |
| Photos | **off everywhere, nothing in the pipeline** | `data/seed/directory.json` `photos: false`, `PHOTOS_ENABLED` not true (preflight ok). The pipeline contains no photo code at all — photos are Worker/admin only |
| Archived rows | **path untested by real data** | `archived.json` is `[]`; zero rows in any file have `status: archived` or `suspended`, so the ≤90-day archive window, replacement ids and the `archived` badge have only fixture coverage |

### Listing counts by category (from the built bundle)

food 140 · harm 64 · jobs 32 · health 30 · learn 27 · rec 19 · treatment 19 · youth 18 · money 12 · legal 11 ·
shelter 10 · housing 9 · utilities 9 · hygiene 4 · connect 3 · goods 3 · pets 3 · assault 2 · ids 2 · kids 1.

Sub-categories with **zero rows**: `shelter.warming`, `shelter.cooling`, `harm.supplies`, `health.dhd`,
`transport`, `treatment.crisis`, `treatment.recovery`. Note `transport` is a top-level category in doc 03 and in
`validate.ts`'s CATEGORY regex and in `HELP_TOPS`, yet no `category/transport.json` file is ever produced, and
`health.dhd` is empty even though doc 02 devotes a whole row to the ~18 DHD programs.

Thin but non-zero: `kids.care` 1, `health.vision` 1, `goods.baby` 1, `health.mental` 2, `ids` 2, `assault` 2,
`shelter.day` 2, `treatment.detox` 2.

---

## Biggest gaps

1. **`.github/workflows/publish.yml` does not exist**, though five documents describe it as written. There is also
   no `.git` and no `.gitignore`, so the entire "open-data change → pull request → steward merges" approval model
   and the "never commit `data/bundle/`" rule are unenforced here. Nothing automated can run.
2. **The nightly re-check has never run once.** `check:sources --recheck` produces `data/staging/recheck.json`;
   the file is absent, `tasks:sync` refuses without it, and `REPORTS_API` is unset. Doc 04's only mechanism for
   noticing that a listing's page stopped showing its phone number is dormant.
3. **The whole report/confirm half of the lifecycle is inert in data.** All 418 rows ship `closed_open: 0`,
   `wrong_open: 0`, `last_confirmed_at: null`. The code and tests are good; no real report has ever reached a build.
4. **No release-signed bundle has ever been built.** `signing: "dev"`, no `BUNDLE_SIGNING_KEY`, no pinned
   `BUNDLE_PUBLIC_KEYS` — three of preflight's six STOPs. Clients pin two keys that do not exist yet.
5. **`data/indicators/greenway_access.json` is stale and now wrong.** Committed 2026-09-19 from a much smaller
   bundle (49 listings, 18 flagged segments); recomputing against today's bundle gives 114 listings and 16 flagged,
   with only 3 segments having nothing at all. `access-report.ts` still has no pnpm script, so it is easy to forget.
6. **`help.coverage_checked` can never become true** — `build.ts` never supplies `coverageChecked`, so docs/13
   honesty rule 6 ("until a neighborhood's listings have had a coverage pass") is unimplementable as written.
   Related: 152 of 205 neighborhoods are missing food, health or harm listings, and 7 have nothing at all.
7. **Seven sub-categories are empty**, two of them structurally: `transport` is declared everywhere (doc 03,
   `validate.ts`, `HELP_TOPS`, `access-report.ts`) but no row and no bundle file exists, and `health.dhd` is empty
   despite doc 02 promising the ~18 DHD programs. `shelter.warming`/`.cooling` are alert-driven and there are no
   alerts, so the warming/cooling path has never been exercised end to end.
8. **288 rows sit in `to-verify.csv`, 60 of them blocked by bot protection**, and 11 researched listings are stuck
   in `proposed` and invisible. The single biggest cause is detroitmi.gov (22 rows) and other sites answering 403
   to scripts — the auto-check gate is doing its job, but there is no person-in-a-browser queue behind it except
   `docs/CHECKS-2026-09-19.md`, which still has 56 unanswered rows (preflight "look").
9. **Fixture coverage has real holes**: `FREQ=YEARLY`, negative `byday`/`bymonthday`, `mode: "week"` (1 case),
   `prefer` flags (2 cases), DV rows through `rank` (0 cases), and `helpAlong`/`milesToSegment` (1 case each).
   iOS re-implements against these fixtures, so an untested rule is an untested rule on two platforms.
10. **Doc drift worth fixing**: doc 04 says emergency.csv holds 6 rows (it holds 11); doc 13 honesty rule 6 quotes
    "91 listings / nine open segments" (now 418 / 3); doc 03 lists `events.json` and a `transport` category among
    the bundle's files, neither of which is produced. All three are documentation, not code, but each currently
    states something the data contradicts.
