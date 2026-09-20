# 09 — Roadmap & Open Questions

The short version, by horizon, is the **Roadmap** section of [/README.md](../README.md). This is the detailed
version: the build order that got us here, then every item with who it waits on, then the questions still open.

## Hackathon scope (this week)

Goal: a demo that is *real* — real data, real reporting, real freshness — not a mock. Judges open the app on a phone on the demo Wi-Fi and file a report that shows up in the steward queue. (Nothing is deployed yet; the laptop serves it. See DEMO.md.)

**Build order (CLAUDE.md's six steps; each is demoable on its own):**

| # | Step | Done |
|---|---|---|
| 1 | **Seed data + bundle** — `data/seed/` CSVs → `pipeline/` → signed `data/bundle/v1/` (HSDS-valid + `x_detroit`), with query fixtures before any UI. What shipped: 178 listings. 118 were checked at entry against their own site; 60 are DHD stations from DHD's own layer. | 2026-09-18 |
| 2 | **PWA (`apps/web`)** — Home, category lists, detail with open-now and next times, triage (9 entry points, a few results), offline. | 2026-09-18 |
| 3 | **`api/` Worker + D1** — `POST /v1/reports`, `POST /v1/proposals`, steward endpoints behind Cloudflare Access; report buttons and an offline queue in the app. | 2026-09-18 |
| 4 | **`admin/` steward queue** — reports and proposals, archive and restore with reasons. Demo: report a closure from a phone → it appears here → archive → rebuild → app shows "Closed as of today." A demo alert (`pnpm alert:new -- --demo`) shows auto-expiry live. | 2026-09-18 |
| 5 | **iOS** — SwiftUI shell reading the same bundle. | 2026-09-20: `DetroitQuery` passes the 111 fixtures in CI, and the SwiftUI screens compile and run in the simulator, with reports, saved places, About/privacy, a release gate and 28 app tests. Never run on a real device and never signed for one. |
| 6 | **Android (`apps/android`)** — a native Kotlin client: platform Views, no Compose, no AndroidX, no dependency of any kind in the APK, `minSdk` 24. `query/` is a **third** implementation of `schema/query-spec.md` against the same fixtures. | 2026-09-20: written, then **compiled, tested, assembled (a 1.13 MiB debug APK) and run — on an API 35 emulator only.** Never on a phone, and nothing below Android 15 has run it. The PWA remains the Android answer meanwhile. |

**Cut list if behind:** notifications, provider claim flow, GTFS.

**Demo script (3 min):** the City's app, as it is in the stores today: asks your name and phone number, 115 MB, about ten installs (say only what the store listings show) → what's inside it (30 sec) → "here's the version that ships": find food this week in 3 taps offline → file a report → steward archives → app updates → "and nobody at the city had to do anything for this to stay current" (show the badge line on a listing — page watchers are not built yet — then the greenway beat from doc 11). Close on: stores nothing, freshness is the product, data outlives the app. The beats, the commands and the fallbacks are in [DEMO.md](DEMO.md).

## Now — before this is usable in public

Nothing here is a feature. It is the list that stands between a built app and a public one.

### Deploy (all Kyle's accounts; [DEPLOY-HANDOFF-2026-09-20.md](DEPLOY-HANDOFF-2026-09-20.md) has the clicks)

1. `pnpm keys:generate` twice; `BUNDLE_SIGNING_KEY` as a GitHub secret, both public keys as `BUNDLE_PUBLIC_KEYS`, the spare private key offline. These are the three `STOP` lines `pnpm preflight` reports today.
2. Register the domain, create a project Cloudflare account and an empty Pages project, route the Worker at `https://<domain>/v1/*`, set `ALLOWED_ORIGIN`.
3. Apply the four D1 migrations `--remote`. They never have been. Until they are, every query the deployed Worker makes fails, the nightly cron included.
4. Deploy, then `pnpm smoke -- https://<origin> --i-own-this-origin`: it proves from outside what a checkout cannot see, including that the WAF rate-limit rule actually bites.
5. Set `PUBLISH_ENABLED`, run the publish workflow by hand once, read the log, then trust the schedule.

Also Kyle's, and not on the deploy list: Apple ($99/yr) and Google Play ($25) developer accounts, enrolled **as an organization** so the apps can be transferred (doc 12, DECISIONS 2026-09-18).

### Language reviews — before a public release, not after

Spanish, Arabic and Bengali are all built and **none has been read by a native speaker**. Arabic and Bengali were
machine-drafted on 2026-09-20 and DECISIONS keeps both Open until a speaker of each has read them. The reading
order, and where the drafter was least sure, is at the end of [CHECKS-2026-09-20.md](CHECKS-2026-09-20.md): the
overdose steps first, then crisis, domestic violence and sexual assault, then the freshness badges, then the
privacy screen, then the three newest keys (`clock.am`, `clock.pm`, `list.sep`). Kyle finds the reviewers; the
review itself is an outside party's work.

Two things wait on that reviewer rather than on us:

- **Searching in Arabic or Bengali returns nothing**, because every listing is written in English. The empty
  results screen needs one plain line saying so and offering the categories instead. We have deliberately not
  written it: guessing the wording is what this review exists to prevent.
- Whether the Bengali transliteration **এএম / পিএম** is what a Bengali reader would write for am and pm.

And two that are plain work: the **iPhone and Android apps still hard-code "am"/"pm"** (`HelpApp/Help.swift`,
`Format.kt`) instead of reading `clock.am`/`clock.pm` from the strings files, and **printing an Arabic screen**
puts a bare left-to-right URL in parentheses inside right-to-left text (cosmetic).

The overdose steps themselves still need a review by **DHD, MDHHS or counsel** before a public release, and the
copy must never promise legal protection (docs/08, 10-A7).

### The steward backlog ([CHECKS-2026-09-20.md](CHECKS-2026-09-20.md))

- **Five SER Metro-Detroit rows**: `sermetro.org` answers an honest browser but not our fetcher, so one look each in a browser, then `status=active`, `entry_method=web`.
- **15 calls owed**, each a fact an owner's own page does not settle: Wayne Metro's walk-in days, Cherry Hill's ID rule, which of two numbers Detroit Recovery Project's Westside office uses, the S.T.A.R. Center's address, and so on.
- **Tell DHD about the misprint** on its own page: the Open Door wellness center's phone is printed with nine digits after the area code. No digit was guessed; the listing cites the church's own page instead. Ask at the same time whether the center has a line of its own.
- **The John D. Dingell VA emergency room** stays `proposed` and only a person can release it: va.gov renders numbers through a script, so no automatic check will ever confirm that row. A steward confirms it by voice and sets it by hand (DECISIONS 2026-09-20).
- **Children's Hospital of Michigan's ER** has no Call button until somebody writes down the digits behind (313) 745-KIDS.
- **One import line never made it in**: Highland Park's "help with a property tax bill you cannot pay" (City of Highland Park Assessor). Import it, or say why not. **The cause is fixed:** `pnpm import:lines` now prints `skipped: id collision with <sal_id>` and counts it in the summary instead of dropping the line in silence, and a line correcting an address for the same organisation and phone prints an informational note.

### Work

- **Run the Android app on an old, cheap phone**, and at API 24 and API 30. The worst bug the first compile found (`List.getLast()`, API 35 only) would have crashed every phone from `minSdk` 24 to Android 14 and did not show up on the emulator. Measure the cold start while there: the hand-written Ed25519 check took about 20 seconds on an emulated arm64. If it is bad on real hardware the fix is to show the packaged snapshot first and verify in the background, never to weaken the check (DECISIONS 2026-09-20).
- **Assistive-technology user testing** on both clients — a screen reader, switch control, largest dynamic type, 400% zoom. The [accessibility audit](ACCESSIBILITY-AUDIT-2026-09-20.md) closed 21 failures and left 4 open with reasons; the ones a code review cannot find are the point.
- **A warming- and cooling-center alert workflow** ready before winter. The two empty categories are empty because they are alert-driven; `pnpm alert:new` exists, the owner's own announcement is the only source, and nobody has run the pass for a real activation yet.

## Next — the first three months

### Stores and clients

- **Android release work**: an app icon and launch artwork (today's is a placeholder mark, and lint asks for a monochrome one), `onBackPressed` → `OnBackInvokedCallback`, a signing config and upload key, instrumented tests, and the Play data-safety form ("no data collected, no data shared" — docs/08 has the wording). `:app` stays out of CI on purpose: it needs SDK packages under Google's licence, and a workflow should not accept a licence on this repository's behalf (`HELP313_NO_ANDROID=1`).
- **iPhone on TestFlight**, then the store. Release blockers are in `apps/ios/README.md`: the two pinned keys and the real origin (the build already refuses without them), a device build and signing, the store labels and the age rating questionnaire, and whether `apps/ios/Xcode/` stops being git-ignored.
- **iPhone parity with the web app**: the street map, neighborhood pages, transit, add-a-place, archived listings in search, a listing's own alerts, quick exit on private screens, an in-app language switch, a typed ZIP, parks, and the bundle-age banner on every list rather than only Home and Saved.
- **Android parity**: the street map, neighborhood pages, add-a-place, condition reports, ZIP sorting, and the link-outs the web app shows on several need screens. Also: the "Bus directions in the Transit app" button has never been seen in its visible state, which needs a phone with Transit installed.

### Licences and questions to outside parties

Every one of these is a body publishing its own open data with no licence statement. We record `unstated`, name the
owner on screen, and owe a question (DECISIONS 2026-09-20).

- **SEMCOG and the Michigan State Police** about the crash layer behind "Safe streets": attribution wording, the indemnification clause, and MSP's position on records that are theirs. **If either objects, delete `data/ingested/crashes.json` and rebuild — the panel disappears on its own.**
- **Wayne County** about reuse of the Well Wayne naloxone and test-strip station map. Nobody has asked yet.
- **Transit** (partners@transit.app) about the link: attribution wording, a name or logo rule, or nothing at all.
- **The City of Detroit** about its open-data portal's terms, for the layers behind the map, the parks, the ZIPs, the neighborhood indicators and the harm-reduction stations.
- **SMART and the Detroit People Mover**, whose GTFS feeds publish no terms, and **MDOT**, whose carpool-lot terms are a disclaimer.
- Accepted on purpose and not a question: **US DOT BTS Intercity Bus Atlas Stops is CC BY-NC 4.0.** Non-commercial and attribution-bound suits a free app, but it is a real condition.

### Sources we cannot currently read

- **Ask the City to let the pipeline read `detroitmi.gov`**, which has answered 403 to honestly labeled scripted requests since 2026-09-19. Effects today: City events keep the last good file, the shelter line's page is checked by a person, and 33 listings carry a "check by eye" note. We do not disguise our requests.
- **DDOT's own GTFS feed is marked CC0** — the clearest licence of the lot — and is behind that same block. Until a person downloads it or the City unblocks us, the bus layers come from the City's DDOT ArcGIS layers, last edited 2026-02-09, so a route changed since then is missing.

### Data and coverage

- **Call DWIHN** about whether it pays for treatment for uninsured Wayne County residents, and which address the Care Center uses today. Two of its own pages disagree.
- **Coverage passes for thin neighborhoods.** 29 of 205 neighborhoods have no food listed within half a mile of the neighborhood. The remaining gaps are mostly places that publish only on Facebook or in directories, which means a phone call rather than a script.
- **Highland Park has no emergency room and no urgent care with an owner page.** That is the city, not our reading — but it is the kind of gap a resident should be told about rather than left to discover.
- **The service-area edge case, for Kyle:** the nearest Henry Ford-GoHealth urgent care (26763 Ford Rd, Dearborn Heights) is inside our bounding box and outside the four named cities. Include it, or keep the named-cities rule? The bbox is a sanity check on coordinates, not a service area, and a rule bent once without deciding to stops being a rule.
- **First conversations** with Forgotten Harvest and Gleaners about a feed, and with 211/UWSEM CIE about taking the HSDS export.
- **`pnpm ingest:transit`** is monthly by hand today and not in the nightly publish. Decide whether it joins the workflow or stays deliberately manual (DECISIONS 2026-09-20).

### Photos

Condition-report photos are built and off at two switches. Before they go on for anyone but a demo:
**legal advice** (docs/11), the R2 bucket (Kyle), Turnstile or app attestation, and on-device face block-out. Until
the bucket exists the Worker answers 503 and the app sends the report without the photo and says so.

### Stewards

- **Name the first two community stewards** (names, not roles — a CHW, a librarian, a church coordinator, an outreach worker). Row count is capped by what the roster can verify (10-A6).
- Publish the privacy policy page at the app's domain; both stores may ask for it regardless.

## Later

- **Page watchers** on public program pages. They raise steward tasks and never change the app by themselves. What exists today is the nightly re-check of each listing's own page, which already works that way.
- **`signals.json`** on R2, rewritten every few minutes, for same-day signals with TTLs. "No food today" cannot wait for a nightly build (10-B4, Proposed).
- **Turnstile or app attestation** on the write API.
- **Provider self-listing**: a place claims its own rows, with email verification and row ownership. That address would be the only email this project ever holds, and it belongs to a provider, never a resident.
- **Local notifications** for saved places and alerts.
- **313SafeBeds** beyond a link-out, if and when their public status exists as something to embed.
- **Indicators still unbuilt** (docs/13 steps 4–6): a CDC PLACES tract map, foreclosures and evictions (no source found), council-district lens pages, and a record of which neighborhoods have had a coverage pass — `help.coverage_checked` can never be true today because the build never sets it.
- **GTFS "how do I get there"** with the nearest route.
- **The HSDS export handed to 211/CIE**, and a conversation about read access to 211's data.
- **Steward mobile mode** — verify-on-the-go for outreach workers.
- **Health Hub / QR-code distribution with DHD**, which was DHD's own distribution idea for D Compassion.
- **Handover, or a deliberate sunset.** Transfer the GitHub org, the Cloudflare account, the domain and the store listings; the new operator gets the spare key and generates a new active one. If nobody takes it, a person sets `"retired": true` in `data/seed/directory.json` and publishes once: every phone then says the list is no longer updated and points at 211, and the report buttons disappear. There is no heartbeat and no timer (doc 12, DECISIONS 2026-09-19).

## Where the numbers stand

- **531 listings** on 2026-09-20 (178 on 2026-09-18, 418 earlier on 2026-09-20), each checked once at entry against its own page; agency-layer rows carry the layer's own date instead. No scheduled re-verification (04). 44 of 46 categories filled; warming and cooling centers are alert-driven and empty on purpose.
- **326 rows in `data/seed/to-verify.csv`**, each with a reason it is held, and a `resolved` column filled in when one is settled — 71 carry a resolution. Nothing is ever deleted from that file.
- **Emergency numbers**: 11 rows. 911 and 988 are hardcoded; the other 9 are machine-matched against their owners' pages by `pnpm check:emergency`, 211 included.
- **503 tests** in `pnpm test` (query 111, api 80, pipeline 179, web 133), plus 111 Swift fixture cases and 28 iPhone app tests, plus Android's own JUnit tests and the same 111 fixtures again (see `apps/android/README.md` for that day's totals).
- **220 decisions recorded, 22 still open** (20 Open, 2 Proposed — [DECISIONS.md](DECISIONS.md)).

## Open questions — decisions for Kyle

1. **Name.** **Decided — see DECISIONS 2026-09-19: 313 Help.** Original question: needs to be findable, pronounceable in ES/AR, not confusable with a city product, domain available. Candidates to react to: *313Help*, *NearbyHelp Detroit*, *Detroit Doorway*, *OpenDoor Detroit*. (313SafeBeds already owns the "313" prefix in this space — coordinate with the 313SafeBeds team if you go that way.)
2. **Android path for the hackathon:** **Decided — DECISIONS 2026-09-19: the PWA is the Android app.** Since 2026-09-20 a native Kotlin client also exists in `apps/android`; it compiles, its tests pass and it has run on an API 35 emulator, and it is deliberately not Compose (DECISIONS 2026-09-20). It does not replace the PWA until it has run on a real phone and on something below Android 15.
3. **Code license:** **Decided — see DECISIONS 2026-09-18: Apache-2.0, dataset CC BY 4.0.** Original question: MIT vs Apache-2.0. Recommendation: Apache-2.0 (patent grant matters if a vendor ever forks it for a city). The app is open source and intended as a gift to the city — see doc 12 for what that requires.
4. **Analytics on or off at launch?** Recommendation: off for the hackathon; identifier-free aggregate counts at v1 with the About-screen disclosure. **Decided in practice (no analytics are built); to be recorded in DECISIONS.**
5. **Who are the first two community stewards?** Names, not roles.
6. **313SafeBeds involvement:** teammate on the hackathon, or partner via link-out only? (A link-out is what shipped: their card opens the shelter screen, above the lines.)
7. **Ask DHD the questions in 02** before or after the hackathon? (Recommendation: send once; assume silence.) The DHD phone misprint in CHECKS-2026-09-20 is a reason to make the call anyway.
8. **Map tiles on the PWA:** **Decided — see DECISIONS 2026-09-18: the app draws its own street map from City open data; no tile server.** Original question: OSM/Leaflet (free, attribution required) vs. MapLibre + a tile provider (nicer, may cost). Recommendation: Leaflet + OSM for the hackathon.
9. **Do we bundle the 2023 Council homelessness guide entries as `seed_list` (confidence 0.5) or only after a verification pass?** Recommendation: only entries verified this month; the rest stay in a `to-verify` CSV. **Followed:** unchecked entries sit in `data/seed/to-verify.csv`.
10. **Domain:** register now (Cloudflare) so deep links in the demo are real. **Still open:** `ALLOWED_ORIGIN` names `https://313help.com` and that hostname does not resolve, so nothing is live.
11. **JUnit 4 in `apps/android` is EPL-1.0** — non-permissive, and test-only: no phone ever sees it, and the whole fixture suite runs without it. CLAUDE.md says to ask before adding a non-permissive dependency, so this is the ask (DECISIONS 2026-09-20).
