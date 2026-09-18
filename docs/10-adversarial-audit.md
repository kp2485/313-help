# 10 — Adversarial Audit of Docs 01–09

Audit date: 2026-09-18. Method: read every doc as (a) a troll with `curl`, (b) an abusive partner holding the phone, (c) a stale phone that hasn't been online in months, (d) a burned-out volunteer steward, (e) an App Store reviewer, (f) a 211 engineer importing our data, (g) a hackathon judge. Facts marked **[checked]** were verified on the web on the audit date; see "Fact-check results" at the end.

> **Update, same day:** Kyle confirmed there is **no DHD spreadsheet and DHD has not signalled it will maintain anything.** Docs 01–09 were revised to drop that assumption (principle 7 is now "assume nobody maintains anything"). That retires the mechanism behind A2 and one leg of A5, and makes A6 the most important finding in this audit. Those three are annotated below.

The design is strong. Zero-PII by construction, static read plane, and "freshness is the product" are the right bets. The findings below are where the docs **break their own principles**. Nothing here says "start over."

Severity: **S1** = breaks a non-negotiable or can hurt someone; fix before any code. **S2** = will produce wrong behavior or an embarrassing demo; fix in the spec before the matching build step. **S3** = inconsistency or cleanup.

---

## S1 — fix before building

### A1. The "two independent reports" rule has zero sybil resistance
*Docs: 03 Reports, 04 Reporting + Abuse model, 06 Write API.*

`client_nonce` is computed by the client. The server cannot tell a real nonce from `openssl rand -hex 32`. "Independent nonces" therefore means "two HTTP requests." The rate limits (20/day per nonce, 3 per target per nonce) are keyed on the same attacker-chosen value, so they limit nothing.

Attack: 50 `curl` calls put every Narcan station in the city into `flagged`. 04 says flagged rows are **hidden from default results** and 05 says they are **never shown on the map**. They stay hidden until a volunteer steward clears each one by phone (and stations have no phone — see A6). 04's claim that the "worst case is a false 'might be closed' badge for a day" is wrong by the docs' own rules.

The same hole runs the other way: "Still open" confirms are forgeable too, so anyone can keep a dead listing looking verified forever (one confirm resets the clock on a row ≤ 45 days stale).

Fix (all compatible with zero-PII):
1. **Reports never hide anything on their own.** Two closed-reports → demote + "Reported closed — call first" badge, still visible. Only a steward (or an owner attestation, A2) changes visibility. This one change caps the blast radius of every other abuse path.
2. **Edge rate limiting by IP that we never see or store.** Cloudflare rate-limiting rules / the Workers rate-limit binding count per-IP at the edge; the Worker never reads or persists the IP. Say this honestly in 08 ("Cloudflare, our host, processes IP addresses in transit to block abuse; we never store them").
3. **Invisible Turnstile on the PWA; App Attest / Play Integrity on native** (v1). No puzzles — a CAPTCHA in a crisis app is a barrier — invisible mode only, and failure degrades to "queued for steward review," never to "blocked."
4. **Circuit breaker:** if more than N rows (say 5) or more than X% of a category get closed-reports in 24h, freeze automatic state changes and page a steward. Mass closure is an attack or a disaster; both need a human.
5. **Community confirms can extend verification by at most one cadence** and never twice in a row without an owner/steward verification in between. Show them honestly: "Someone said it was open 2 days ago" is a different badge from "Checked by phone 2 days ago."
6. **Presence-weighted reports (next-level, optional):** a QR sticker on the station/pantry door deep-links to the confirm screen with a per-site token. A report carrying the site token is worth more than one without. No identity involved, and it solves A6.

### A2. An owner feed that nobody touches reads as "Verified recently" forever
**Resolved by removal (2026-09-18).** There is no owner feed. 04 now says presence in any source is *not* verification and never resets the clock. The finding stays on record because the same trap reappears with open-data layers and watched pages: "the City's layer still lists it" must never turn a badge green. Original text:
*Docs: 04 Verification method 1, Principle 4; 03 Freshness rules; 01 Success.*

"The row appeared in the owner's sheet on this fetch → verified." A Google Sheet that DHD last edited in 2026 will still be re-"verified" nightly in 2028 at base confidence 0.9. That is D Compassion's failure (hardcoded list goes stale) moved into a spreadsheet, with a green badge on top. It directly violates Principle 2.

Worse: "owner-feed rows auto-resolve" community reports. A resident reports the Narcan box is gone; the sheet still lists it; the report is dismissed by a cron job. The person standing at the empty box loses to the spreadsheet.

Fix: presence in a feed proves **the owner hasn't removed it**, not that anyone checked. Owner-feed rows are verified only when the owner attests: a per-row `last_checked` date column, or a sheet-level "I reviewed this list on ___" cell that stamps all rows. No attestation → rows decay on cadence like everything else. Community reports on owner rows are routed to the owner **and** still count toward the badge; only an owner attestation dated *after* the report resolves it.

### A3. Freshness is computed at build time, so offline phones lie
*Docs: 04 Confidence ("computed at bundle build time"), 05 Offline, 03 status `stale`.*

The bundle freezes `status`, `confidence`, and the badge on the day it was built. The app's headline promise is "works with zero connectivity ever," from a snapshot baked into the store binary. A phone that installs a four-month-old binary with data off sees every mobile pantry (7-day cadence) as **Verified recently**. The more offline the user — i.e. the more they match the primary persona — the more the app lies.

Fix:
- Bundle ships **facts** (`last_verified_at`, `method`, `cadence_days`, `source.type`, open report counts). **Clients compute** stale/badge/sort score from those facts and the device's current date. `stale` stops being a stored state. Put this in the shared query spec with fixtures ("same row, clock +40 days → badge flips").
- **Bundle-age banner:** when `generated_at` is older than 72h, Home shows "Last updated 12 days ago — call before you go," and the alerts area shows "Alerts may be missing" instead of silently showing none. An absent warming-center alert on a stale bundle is a false negative in January.
- Sanity-check the device clock against `generated_at` (a clock set before the bundle was built is wrong; cheap phones reset to 1970/2010).

### A4. `install_id` contradicts the non-negotiable, and the daily nonce links a person's day
*Docs: CLAUDE.md non-negotiable 1 vs 04/08.*

CLAUDE.md: "no persistent identifiers for residents — **on device or server**." 04/08: a random `install_id` UUID stored on the device. One of them has to change.

Separately, `sha256(install_id ‖ day)` is the same value on every report that day. Reports carry a target (a place) and `observed_at`. A helper who files five reports produces a server-side, linkable trail of where one person was, stop by stop. That is a location history, which Principle 1 rules out.

Fix: `client_nonce = sha256(install_secret ‖ target_id ‖ day)`. It still dedupes one device per target per day; it is unlinkable across targets as well as across days. The per-nonce daily cap disappears, which is fine — it never worked (A1) and the edge limiter replaces it. Then reword the non-negotiable to what we mean: "no identifier for a resident ever leaves the device; the only on-device secret is random, resettable, and used solely to derive per-target daily dedupe hashes." Log it in DECISIONS.md.

Also: the 03 example shows `submitted_at` with seconds (`13:41:10`) while 04/08 promise minute granularity. Truncate on the client, reject finer on the server, and cover it in the Worker test.

### A5. "Bundle wins" on emergency numbers + unsigned bundles + unreviewed owner feed = a phone-number hijack path
*Docs: 05 Home, 06 Pipeline, 02 Ingestion 1.*

*(2026-09-18: the Google Sheet leg is gone; the rest of the chain stands, and a watched page or open-data layer is the same kind of upstream we don't control.)* Chain: anyone who can alter an upstream source (originally the DHD Google Sheet; now a City page or data layer), or a leaked GitHub Actions secret, or one steward login → nightly pipeline → auto-publish at 0.9 confidence with no human in the loop → the bundle overrides the static emergency strip. `index.json` checksums come from the same origin as the files, so they detect corruption, not tampering. Result: a scam or harassment number on the crisis line of every phone by morning.

Fix:
- **911 and 988 are hardcoded and not overridable. Ever.** Other strip numbers are overridable only from the steward-reviewed emergency file, never from an ingested feed.
- **Any change to a phone number, address, or lat/lon on any row — including owner feeds — is held for steward approval.** So is any fetch that changes/drops more than ~10% of a source's rows. Tier A/owner feeds auto-publish only schedule/description changes.
- **Sign the bundle** (Ed25519; private key in CI secrets, public key pinned in the clients). Clients refuse an `index.json` whose signature fails and keep the old bundle. Small to build now, painful to retrofit.
- Two-person rule (or at least a 1-hour delay + notification to all stewards) for edits to the emergency file.

### A6. The verification workload doesn't fit the steward roster, so everything will go stale
**Resolved by redesign (2026-09-18, later).** Scheduled verification is gone. 04 now runs on exceptions only: one check at entry, a weekly pass over reported rows and machine-raised tasks, and a monthly call to ~15 safety-critical numbers. Badges state facts ("a visitor said this was open 4 days ago") instead of claiming "verified." The cost is accepted: a quiet listing can be dead and unreported; the app says how long it has been quiet rather than pretending to know.
**Now the top risk (2026-09-18).** With no DHD owner, every DHD row — 25 stations, ~18 programs — lands on the same volunteer roster. Changes made in 01–09: station cadence moved from 14 to 30 days; stations are verified by phoning the **host** (the barbershop, store, or transit center has a phone even though the newsstand doesn't); stock-outs travel as same-day signals (B4) rather than as verification; the v1 roster drops the assumed DHD seat; row count is capped by roster capacity. QR markers on DHD's stations need DHD's cooperation, so don't count on them there — ask hosts and churches individually instead.
*Docs: 04 cadences + steward workflow, 09 v1 roster.*

v1 target: 150+ resources, four stewards of whom three are volunteers, flagged SLA 24h. Count the calls: ~40 food sites on a 7-day schedule cadence ≈ 40 calls/week; ~50 pantries/shelters at 30 days ≈ 12/week; plus proposals and flags. And the 25 harm-reduction stations (14-day cadence) **have no phone** — a newsstand can't confirm it's stocked — so those are ~2 in-person visits a day.

What happens: the queue isn't worked, everything slides to "Might be out of date," users learn the badge means nothing, and the product's one differentiator is gone. The bus factor is Kyle.

Fix: design for the stewards you have.
- Make owner attestation (A2) and presence-weighted community confirms (A1.6, QR on the door/box) the primary verification for high-churn rows; reserve steward phone calls for proposals, flags, and rows nobody has confirmed.
- Lengthen cadences you can't honor (an honest 30-day cadence beats a fictional 7-day one), or cut the row count (Principle 9 already says so).
- Put the weekly verification load (rows due ÷ cadence) on the admin dashboard so the ceiling is visible before rows are added.
- Recruit verification partners per category, not generic stewards: DHD harm-reduction outreach already visits stations; FH/Gleaners drivers already visit sites.

### A7. The overdose flow sends a bystander on an errand
*Docs: 05 Triage safety rules, 08.*

"Someone might overdose / I need Narcan" is one entry that shows 911, then the nearest two stations. Those are two different people: someone next to a person turning blue **now**, and someone who wants to carry Narcan. For the first, a map to a newsstand 1.2 miles away is harmful; they need 911, rescue breathing, recovery position, stay until help comes — and nothing else on the screen. Split it: **"Someone is overdosing right now"** (911 + steps, no list) and **"I want free Narcan to carry"** (stations + pharmacy line + how-to).

Also: the Good Samaritan summary must be reviewed by DHD/MDHHS or counsel; Michigan's protection is narrow **[checked — see end]**. A cheerful over-summary could get someone arrested.

### A8. DV safety holes on the PWA — the platform you're shipping first
*Docs: 05, 08 DV.*

- "Quick exit returns to Home and clears the back stack" is a native concept. A PWA cannot clear browser history. If DV/crisis screens have their own URLs, they sit in history and autocomplete. Fix: sensitive flows hold state in memory with **no URL change** (or `history.replaceState` only), and quick-exit does `location.replace()` to a neutral external site (weather), per standard DV-site practice.
- **Saved** persists "DV hotline" / "Narcan" bookmarks on a phone an abuser may inspect. Fix: sensitive categories can't be saved, or saving them shows a one-line warning; the Saved tab label/icon stays bland.
- Tapping **Call** writes to the call log. One line on DV screens: "Your phone keeps a record of calls and texts."
- Make "DV rows have no address" a **schema rule**, not an editorial habit: the validator fails the build if a `shelter.dv` row has an address or lat/lon; the proposals endpoint strips addresses for that category; DV rows never show distance (distance from a known position narrows location).
- v2 local notifications for saved resources must never show sensitive categories on a lock screen.

### A9. The emergency strip's shelter number may already be dead **[checked]**
*Docs: 02 CAM row, 05 emergency strip, 07 ("Keep" the 313-305-0311 line), CLAUDE.md non-negotiable on emergency numbers.*

The docs put **CAM 313-305-0311** on the always-visible strip and call it "the correct front door for 'I need a bed tonight.'" The City's homelessness page and 2023+ reporting direct shelter seekers to the **Detroit Housing Resource HelpLine, 866-313-2520** (run by Wayne Metro), and local reporting says the CAM line was folded into it when the prior operator's contract ended in 2023; camdetroit.org still shows the old number. 02 lists 866-313-2520 only as the "Cold Weather Line." So the design's single most important phone number is unverified and possibly wrong, inherited from the D Compassion APK — the exact failure this app exists to prevent.

Fix: phone both numbers before any build. Until then, the strip's shelter button is 866-313-2520. Also: Wayne Metro's main Connect Center number is now listed as **313-388-9799**; 734-284-6999 survives only on older flyers. Add a release-blocking checklist (`data/seed/emergency.csv` with `verified_by_call_on` per row; the build fails if any is older than 30 days).

---

## S2 — fix in the spec before the matching build step

### B1. The confidence formula produces badges that contradict the states
Work the numbers in 04. Base is by **source type**, not by who verified it:
- A community-added pantry that Kyle verified in person yesterday: 0.4 × 1.0 = **0.40** → "Might be out of date." It can never exceed 0.55. The flagship church-pantry flow can never earn the good badge.
- A press-release row is "Verified recently" only on day 0 (0.7 × anything < 1 is < 0.7).
- An owner-feed Narcan station drops below 0.7 after **6 days** of a 14-day cadence, while its state is still `active`.
So badge, state, and the "≥ 85% verified within cadence" metric all disagree. Fix: **badge = f(state, days since verification ÷ cadence, method)**, plain and explainable. Keep a numeric score only as a sort key, and base it on the *latest verification method* (in_person > phone > owner attestation > site-token confirm > web > community confirm > feed presence), with source type as the prior for never-verified rows.

### B2. Three different ranking rules
05: open-now → confidence → distance. 04: stale after active *within a distance band*. 06: distance banding + confidence sort. Under 05's rule, a 0.9 DHD program 9 miles away outranks a 0.65 pantry three blocks away — for a person without a car. Pick one and put it in `query-spec.md`: **eligibility filter → distance band (0–1, 1–3, 3+ mi; no bands when location is unknown) → open-now/next-open → freshness → distance**. "Open now" should mean "open long enough to get there" (closing in < 30 min → "Closes soon"). For "food this week," the key is next occurrence, not open-now.

### B3. Schedule edge cases the spec doesn't cover
- HSDS schedules have no exception dates **[checked]**. A pantry closed Thanksgiving week needs a `cancellation` alert — and the query spec must say a cancellation alert **suppresses** "Open now"/next-occurrence for its targets. Today nothing links them.
- Overnight windows (respite 8pm–9am): `opens_at > closes_at` semantics are undefined. Add fixtures.
- No-schedule rows (hotlines, "call for hours"): need an explicit `always` / `call_first` state so "unknown is never open" doesn't hide 24/7 crisis lines behind an "hours unknown" label.
- `rrule` (JS) has real timezone/DST traps **[checked]**; the fixtures-first order in CLAUDE.md is right. Include: 2026-11-01 fall-back, 2027-03-14 spring-forward, a weekly event whose `dtstart` was in the other offset, BYDAY=2TU monthly, and an event spanning midnight.

### B4. Same-day signals can't travel on a nightly bundle
"Out of food today" is worthless tomorrow. Reports only affect the app at the next nightly build. And `out_of_stock` has no expiry — a three-week-old "empty" report would penalize a restocked station forever. Fix: a tiny `signals.json` (target → kind → count → last hour) that the Worker rewrites to R2 every ~15 minutes; clients fetch it opportunistically. It is still a static file, still no server logic on the read path. TTLs: "no food today" expires at local midnight; station stock-outs after 7 days or on the next confirm. Display as "Reported empty 2 hours ago," never as fact.

### B5. "Data Not Collected" will not be true once reporting ships
Apple counts data as collected when it's sent off-device and kept longer than needed to service the request **[checked]**. Anonymous report text is "User Content," not linked to identity. Declare it. The first-launch line "We don't collect your name, number, or location" is fine; "Data Not Collected" on the label is not. Photos (doc 11) add "Photos or Videos." Same logic on Play's Data safety form.

Related **[checked]**: Apple's age-rating tiers changed in 2025; "expect 17+" in 08 is out of date. And guideline 5.1.1(ix) pushes apps in regulated fields (health) toward submission by a legal entity — enroll Linwood Technologies as an **organization** account (needs a D-U-N-S number; start now, it takes days), not Kyle as an individual. 07's "shipped by an individual developer" line should change.

### B6. Free text is stored raw and partly published
08 masks phone/email patterns "before display" in the steward tool — so D1 holds the raw text for 180 days. And 04 publishes the steward action log "minus steward identity" — but call notes say things like "spoke to the pantry coordinator by name, she said…". Fix: mask at **ingest** (store only the masked text); publish only structured fields of the steward log (action, reason code, method, date) — never free-text evidence. Treat HSDS `contact` the same way: publish a named person only with their consent; default to role + public phone.

### B7. Analytics can't be both "identifier-free" and "detail views per resource"
A per-view beacon tells Cloudflare "this IP looked at a DV/Narcan listing at 02:14," even if we store only a counter. The reports-per-1,000-views metric isn't worth that. Options: drop the denominator (use reports per row per month); or batch on-device and send coarse category-level counts once a week at a random time. Ship with analytics **off** until this is decided (09 already recommends off for the hackathon; 05 reads as if it's on).

### B8. OSM tiles are a third-party privacy leak and against their usage policy at scale
Leaflet + `tile.openstreetmap.org` sends every pan/zoom (≈ where the user is looking, often where they are) plus IP to a third party, doesn't work offline, and OSM's policy restricts app-scale use **[checked]**. Fix: one Detroit-area **PMTiles** file (Protomaps, OSM-derived, ODbL attribution) on R2, same origin, rendered by MapLibre — cacheable by the service worker, so the map works offline too. Say in 08 that **Directions** hands the destination to Apple/Google Maps.

### B9. The anonymous write endpoints are an open mailbox
`/v1/proposals` is free text from the internet. Rows aren't visible until accepted (good), but 10,000 junk proposals bury the queue and someone can nominate an ex's home address as a "free stuff" spot, which a rushed steward might approve. Fix: the A1 protections apply to proposals too; collapse near-duplicates; "how do you know = I heard about it" proposals sort last; steward checklist requires confirming with the **listed party** that they consent to be listed (the phone script already asks "Okay to list?" — make it a required field).

### B10. Alerts: auto-publishing parsed press releases
04 plans "trusted parse → auto-publish with 1-hour retract window." A mis-parsed date sends someone to a closed building on a 9°F night, and an offline phone never receives the retraction. Activations are low-volume (a few dozen a year); keep a human in the loop permanently. Drop auto-publish from the roadmap.

### B11. HSDS consumers will import our dead rows as live
We keep archived rows in the HSDS export (good) but only mark them inside `x_detroit`. A 211 importer that ignores unknown fields gets closed pantries as active services. Map our state to the **core** HSDS fields **[checked]**: `service.status` (active / inactive / defunct / temporarily closed) and `assured_date` (= `last_verified_at`). Confirm how extensions are meant to be carried (see fact-check) before building the validator, or "finds nothing they can't parse" (01) fails on day one.

### B12. Hackathon seed plan contradicts the data-rights rules
09 step 1 seeds ~30 food sites "verified by a phone call **or a current listing**" from FH/Gleaners host lists. 02 and 08 say FH/Gleaners data only with written permission. Copying their listing isn't verification and isn't permitted by our own rule. Fix: a site goes in the seed only if **we** phoned it (then the facts are ours, `method: phone`) or it's from a source we may use; otherwise it goes in `to-verify.csv`. Also: you can only CC BY-license what you have rights to — `sources.yaml` needs a `license`/`rights` field per source and the published dataset needs a per-row source license.

### B13. Principle 3 (three taps to a phone number) fails on the main path
Home → "What do you need?" (1) → "I need food" (2) → "This week" (3) → "Near me?" (4) → **Call** (5). Fix: put the 8 needs directly on Home (kills a tap); never block on location — show citywide results immediately with an inline "Use my location" chip (kills another). Also the emergency strip — five "large tap targets" in one row — cannot coexist with accessibility text sizes on a 320dp screen. Two fixed buttons (**911**, **Shelter**) + "More urgent numbers" sheet, or a two-row strip.

---

## S3 — inconsistencies and cleanup

| # | Finding | Fix |
|---|---|---|
| C1 | 03's status enum includes `verified`; 04's state machine has no such state. | Drop it (verification is a fact on the row, not a state). |
| C2 | Un-archive returns a row to `proposed` (invisible) — a reopened, well-known pantry disappears from search while it waits. | Return to `active` with a fresh verification requirement, or show "Reopening — being checked." |
| C3 | CLAUDE.md referenced `docs/` while the docs sat at repo root. | Fixed in this commit series (moved to `docs/`). `docs/DECISIONS.md` and `strings/en.json` still don't exist; DECISIONS.md is added with this audit. |
| C4 | 02: "Council district boundaries change 2026-01-01" is written in the future tense on a doc dated 2026-09-18. | Reword; verify the current district layer. |
| C5 | 06 repo name `detroithelp/`, actual repo `DCompassion`. "D Compassion" is DHD's product name — fine for a private repo, not for a public one (01: "not confusable with a city product"). | Rename before the repo goes public. |
| C6 | 05: "first launch bundles a snapshot … zero connectivity ever" can't be true for a PWA (needs one online load). iOS Safari evicts non-installed sites' storage after ~7 days idle **[checked]** — the offline bundle, queued reports, and the install secret all vanish. | Say so; prompt install after the first successful use, not on launch. |
| C7 | `archived.json` grows forever in every bundle. | Bundle only ≤ 90-day archives (what search needs); deep links to older rows fetch on demand. |
| C8 | 04 success metric: "flagged by two people and disappears within 24 hours" — conflicts with A1's fix. | Reword to "is labeled within an hour (signals.json) and resolved by a steward within 24h." |
| C9 | "Spanish/Arabic spoken" filter and "No ID needed" rely on free text for most rows. | Make what-you-get / what-to-bring **structured chips** so they translate for free; free-text descriptions stay EN-marked. |
| C10 | Youth shelter path ("I'm under 25") has no number of its own. | Add the National Runaway Safeline and the local youth provider line to that result screen, verified. |
| C11 | 08's first-launch disclaimer is a blocking screen in a crisis app. | Non-blocking footer on first launch; full text in About. |
| C12 | Liability: a solo developer publishing health/crisis info. | Ship under the LLC, plain-language terms ("info can change, call first, 911 for emergencies"), ask an attorney about insurance. Not legal advice. |
| C13 | Demo risk: judges filing free-text reports into a live queue on a projector. | Demo queue shows structured fields only; free text collapsed by default. |
| C14 | Build order differs slightly between CLAUDE.md (triage inside step 2) and 09 (triage is step 3). | CLAUDE.md wins; align 09. |

---

## What the docs get right (keep under pressure)

- Static read plane / thin write plane. It makes most of the fixes above cheap (`signals.json`, PMTiles, signed bundles are all "one more static file").
- "Never route around CAM," "don't model beds," "don't scrape 211" — correct humility about other people's front doors.
- Alerts as a first-class, self-expiring entity, with the archive used to pre-draft next season.
- No age gate. No accounts. No push tokens.
- "Ship small, ship real": 60 verified rows. The audit's A6 is just this principle applied to staffing.

## Hackathon-critical subset

If only seven things change before code: **A9** (verify the shelter number), **A1.1** (reports never hide), **A3** (client-side freshness + bundle-age banner), **A4** (per-target nonce), **A5** (911/988 not overridable + held phone changes), **A7** (split the overdose entry), **B13** (needs on Home, no location gate). Each is a spec change that costs less to build than what it replaces.

---

## Fact-check results (web, 2026-09-18)

| Claim in docs | Result |
|---|---|
| HSDS "3.x — confirm minor version" (03) | Current line is **3.2** (3.2.x bugfix releases). `service.assured_date` and `service.status` (`active`, `inactive`, `defunct`, `temporarily closed`) exist. `schedule` has **no** exception-date field. Extra properties are allowed if documented; a **Profile** is the formal route for `x_detroit`. docs.openreferral.org (changelog, schema reference, extending). |
| "Expect 17+" (08) | **Out of date.** Apple's tiers since July 2025 are 4+/9+/13+/16+/18+. developer.apple.com/news/?id=ks775ehf |
| Ship as an individual (07, 08) | Guideline **5.1.1(ix)**: apps in highly regulated fields, healthcare included, "should be submitted by a legal entity … not by an individual developer." |
| "Data Not Collected" (08) | **Not available once reports are stored.** Apple: "collect" = sent off device and stored beyond servicing the request, linked or not. Declare User Content (not linked); photos → Photos or Videos. developer.apple.com/app-store/app-privacy-details |
| CAM 313-305-0311 (02, 05, 07) | **Conflicting — see A9.** City directs to 866-313-2520. detroitmi.gov HRD homelessness page; outliermedia.org HelpLine explainer; camdetroit.org. |
| DWIHN 800-241-4949; DHD 313-876-4000; PH emergency 313-933-3437; Gleaners 866-453-2637; Forgotten Harvest 248-967-1500 | Confirmed on the orgs' sites. Still call-verify before release. |
| Wayne Metro 734-284-6999 (02) | **Partly wrong.** Main Connect Center number on waynemetro.org is 313-388-9799. |
| Leaflet + OSM tiles (06, 09) | Allowed only best-effort, no SLA; **prefetch/offline caching is prohibited**, which rules it out for an offline PWA. PMTiles extract (ODbL attribution; BSD tooling) on our own origin is the fit. operations.osmfoundation.org/policies/tiles |
| "No IP logged" (04, 06, 08) | Workers Logs invocation logs include request metadata by default. Set `[observability.logs] invocation_logs = false`, leave Logpush off, never `console.log` headers. The rate-limit binding needs no storage on our side, but its key transits Cloudflare and counters are per-location/eventually consistent — log the choice in DECISIONS.md. |
| PWA offline storage (05) | iOS Safari deletes script-writable storage after 7 days without interaction for **non-installed** sites; home-screen apps are exempt. webkit.org/blog/14403 |
| `rrule` library (CLAUDE.md) | Risky: returns "UTC" dates meant to be read as local; open TZID/DST bugs; slow maintenance. **`rrule-temporal`** (MIT, Temporal-based, returns zoned date-times) is the better candidate. CLAUDE.md names `rrule`; changing it is a DECISIONS.md entry. Either way the DST fixtures decide. |
| Michigan Good Samaritan law (08) | Narrow: covers possession/use of a personal-use amount when evidence came from seeking medical help. Does not cover delivery, warrants, probation/parole, paraphernalia. Copy must never say "you can't be arrested." legislature.mi.gov MCL 333.7403 |
| Council districts change 2026-01-01 (02) | Confirmed and already in effect; ~9% of parcels changed district. Use the "Council Districts 2026" layer. |
