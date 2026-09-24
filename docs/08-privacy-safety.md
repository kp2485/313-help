# 08 — Privacy, Safety, and Review

## The posture in one line

We can't leak what we never collect. Every design choice below is downstream of that.

## What is stored, where, and for how long

| Data | On device | Server | Retention |
|---|---|---|---|
| Resource bundle | Yes (cache) | CDN (public) | Versioned, public forever |
| Triage answers | RAM only during the flow | Never | Gone on exit |
| Location | Used in-memory for sorting and for where the Map tab is pointed; **never written** — not to IndexedDB or a file, not to the URL or the history, not to a log, a report or the map's remembered camera | Never | Gone when the tab or app is closed |
| "The Map tab's first-open card was answered" | Yes (local only): one boolean, and nothing else. Web IndexedDB, iPhone state file (excluded from backup), Android app-private file | Never | Until site data is cleared / the app is removed |
| Saved resources | Yes (local only). DV and crisis listings can't be saved | Never | Until user clears |
| Language choice | Yes (local only) | Never | Until user changes it or clears site data |
| Reports | Queued until sent | Yes, minus IP, minus device ID | 180 days raw, then aggregate counts only |
| Photos on condition reports (demo only until legal advice, docs/11) | Re-drawn on the phone without hidden data before sending | Private R2 bucket; only stewards can see them | Deleted 30 days after the report closes, or after 1 day if no report claimed it |
| Proposals (Add a place) | Queued until sent | Stored in D1: the place's details as typed (name, kind of help, what, address, times, phone, how you know, note). Nothing about the sender | Deleted 180 days after a steward settles it (DECISIONS 2026-09-19); an open proposal waits for a steward |
| `install_secret` | Yes (random) | Never sent; only per-target daily hashes of it (`client_nonce`), which cannot be linked to each other | Resets when the site's data is cleared, or with **"Make a new key"** on the Your privacy screen — built on the web app, iPhone and Android. A report already waiting in the queue is **hashed at the moment it is sent**, not when it was written, so a new key covers the backlog too; beside the button, "Delete what is waiting" (`privacy.queued_clear`) throws the queue away instead. On iPhone and Android the file is excluded from backup, so a restore onto a new phone does not bring the old key with it |
| An organization's email address | No | **Never stored** (docs/14 D2, 2026-09-24). A steward reads it off the organization's own page each time and sends the link by hand. What D1 keeps is the listing, the page, when the link was made and whether it was used (`owner_links`), and the dated "still right" (`owner_attests`) | Links: 180 days after they expire. Answers: kept, like report counts |
| Analytics | None | None. No analytics code exists | — |
| Steward identities | — | Cloudflare Access allowlist + action log | Operational |

No resident-side account, email, phone, name, or persistent identifier ever crosses the network. Deep links contain only resource IDs.

## Anonymous reporting — why it's safe enough

- `client_nonce = sha256(install_secret ‖ target_id ‖ date)` prevents one device from double-counting on a target within a day. Every target and every day gives a different hash, so the server cannot connect one person's reports into a trail of places. It is a dedupe aid for honest devices, not a security control — abuse is limited at Cloudflare's edge, which processes IP addresses in transit; we never read or store them.
- The Worker never reads the IP header (or the user-agent) at all; a test checks its source for that. It stores submission time at minute granularity, and to the hour for condition reports and their photos.
- **The Worker keeps no logs at all.** Workers Logs are off by configuration (`[observability.logs] enabled = false`, `invocation_logs = false`), because Cloudflare's own documentation says invocation logs capture request metadata and headers. The error and not-found handlers log **nothing** — the framework's default would have written a D1 error's statement and its bound values, a per-day dedupe hash among them — and the one permitted logging function can print only two fixed sentences about the nightly cron. Tests enforce the silence and that no other `console` call exists in `api/src`. Two things a config file cannot prove are deploy steps: confirm Observability → Logs is off in the dashboard, and that no account-level Logpush job for Workers Trace Events exists. Never paste `wrangler tail` output anywhere.
- Report text is limited to 280 chars and the UI copy says "Add a note if you want. Don't put your name or number." Before anything is stored, the Worker replaces phone numbers and email addresses with "[removed]" in every free-text field: a report's note and its suggested hours and address, and a proposal's "what people get," "days and times," and "Anything else we should know" (DECISIONS 2026-09-19). The fields that hold the place's own public phone number (a proposal's phone, a suggested phone) are kept as typed, as are the place's name and address.
- Abuse is bounded by design: no single report ever removes a resource (04).

## Youth

This app is separate from CommunityChest specifically so youth-meetup safety questions and harm-reduction content don't tangle. Even so, young people will use this app (they should — Narcan saves their friends). Rules:
- No user-to-user contact features of any kind. Nothing to groom through.
- No collection of age, ever. No "are you under 18" gate — a gate is itself a data collection and a barrier to help.
- Harm-reduction content is factual and directive ("call 911, here's Narcan, here's how"), never moralizing and never promotional.
- Age rating: since 2025 Apple's tiers are 4+, 9+, 13+, 16+, and 18+. "Medical/Treatment Information" and "Alcohol, Tobacco, or Drug Use or References" will push the rating up; accept what it comes out to. The alternative is stripping Narcan, which defeats the purpose. Check the questionnaire and the result when submitting, including whether "Frequent/Intense Medical/Treatment Information" is the right selection.

## Harm-reduction content guidelines

- Narcan/naloxone: 911 first; how to recognize an overdose; step-by-step naloxone use with illustrations; stay with the person; Michigan's Good Samaritan law summary (verify current statute text before shipping). Source the medical content from DHD or MDHHS materials, attributed. Today: six text steps, unchanged since 2026-09-18, under the line **"Call 911 first. The Detroit Health Department approved these steps."** (Kyle, 2026-09-20: the City had these steps approved; the written record of that approval is still owed, DECISIONS). Earlier the same day the line read "No doctor has checked these steps yet", after a review found the original "These steps follow national public health guidance" named no source (`od.review_note`, reworded 2026-09-20; it used to say only "These steps follow national public health guidance," which told a reader where the steps came from but not that nobody qualified had read them). A review by DHD, MDHHS or counsel is still owed before a public release, and the note comes out only when it has happened. Not built yet: illustrations, the Good Samaritan summary.
- Test strips: what they are, where to get them, how to use — factual. (Not built yet.)
- Never list dealers, prices, or anything that reads as sourcing.
- Never store "I need Narcan" as a preference or history.

## Domestic violence & crisis

- "I'm not safe at home" results show hotline + 911 before any location — a shelter address can be dangerous to display to the wrong person; DV shelters are listed by intake phone only, never by address, map dot or distance, even when a shelter publishes its own address (DECISIONS 2026-09-19).
- **Any other shelter's address is published only if the shelter publishes it itself**, on its own site. An address found anywhere else (a federal roster, a directory, a news story, a partner's page) is never used; the shelter is listed by its intake phone instead (DECISIONS 2026-09-19). **This rule does not apply to `shelter.dv`, which is stricter: there is no case in which a DV shelter's address is published, not even its own.**

### "Get somewhere safe now" says nothing about why (2026-09-22)

The new last row of the urgent sheet (docs/05) lists police stations, fire stations and emergency rooms. A person
who is being watched may open it, so it is written to give a watcher nothing:

- **The screen names no reason.** "Get somewhere safe now" and "These places are open all night and have a phone
  you can use." are true of a person locked out, a person hurt, a person with nowhere to sleep and a person
  fleeing a violent house. The one line about home — *"If it is not safe at home, a police station or a hospital
  can help you call a shelter."* — is the only mention of home on the screen, and it names **no** kind of danger.
  The words "domestic violence", "abuse" and "shelter for women" appear nowhere on it, in any of the four
  languages; a test holds all four to that.
- **It is traceless like the rest of the sheet.** It writes no hash (`hashFor` returns `null` for every `need`
  view and for the sheet itself), so Back, history and a shared screen show nothing; the window title is the
  same "Find help" every list gets (`PURPOSE` in `apps/web/src/main.ts`), which is true of anybody.
- **The listings on it are ordinary listings**, not sensitive ones: a police station, a fire station and an
  emergency room all publish where they are, and a person has to get there, so they keep an address, a distance,
  a map dot, directions, Save and Share. Nothing about this screen loosens what `shelter.dv` or `health.mental`
  may carry — that set is unchanged, and the DV rule above is untouched.
- **Nothing about the choice leaves the device.** The list is ranked in memory from the location already held in
  memory; no category, no tap and no distance is written or sent, exactly as on every other need screen.

### A DV shelter sorts by proximity without any fact that locates it (Kyle, 2026-09-20)

Kyle's ask was both halves at once: never publish a DV shelter's address, and still let a person see which shelters are near them, because people must call and the nearest line is the one to call first. The bundle is public and signed, so anything in it is published; proximity therefore has to work from something that is not about the shelter.

- **What a `shelter.dv` row may never carry**, whatever its owner's page prints: `address_1`, `zip`, `lat`, `lon`, a `location_name` that is a building or a street, and a `website` or `source_url` whose **path** is an address page (`/our-locations/`, `/visit-us`, `/100-main-street/`). All of it is a hard build error in `pipeline/src/validate.ts`, with tests, and `validateHsdsPrivacy` checks the published HSDS export on its own terms as well — a DV location there is `virtual`, with no `addresses` and no coordinates. `pnpm geocode` skips these rows even if someone types an address into one, and the typed address fails the build by itself.
- **What it may carry instead** is `service_area`: one id from a **closed list of coarse areas** — `detroit`, `dearborn`, `hamtramck`, `highland_park`, `wayne_county`, `wayne_county_west`, `wayne_county_downriver`, `oakland_county`, `macomb_county`, `statewide`, `national`. An area is a whole city or bigger. No ZIP codes, no neighbourhoods. A steward sets it only from what the owner's own page says, and it rides from `data/seed/resources.csv` through normalize into the bundle like any other column.
- **The reference points live in code, not in the data**: `packages/query/src/areas.ts`, mirrored in `Areas.swift` and `Areas.kt` and held to a parity test. Each area maps to one fixed public point — a city hall, or a county's geographic centre. The point is about the area; every shelter serving that area shares the same one.
- **Ranking**: with a location, a DV row's band comes from the distance between the person and its area's point, in coarse bands (0–3 mi, 3–10 mi, over 10 mi). `statewide` and `national` rank after every local area. A row with no area, and every row when no location was shared, ranks exactly as a coordinate-less row ranks today. The ranked result's `miles` is **always null** for a DV row, so no client can print a distance even by mistake.
- **What a screen shows**: the area in words ("Serves Detroit"), a Call button, and one sentence — *"For safety, this shelter does not share its address. Call and they will tell you where to go."* Never a distance, a map, a dot, directions, a bus link, a Transit link or a "near you" claim. 911 and the hotline-first ordering of docs/05 are unchanged, and quick exit, no Save, no Share and the traceless URL all stay.

**Thinking adversarially about it** (the questions asked on 2026-09-20, and the answers):

- *Can the ordering, the band and the reference point be worked backwards into a location?* **No.** Both inputs are public: the person's own location, which never leaves the device, and a city hall's coordinate, which is in the source code and identical for every shelter serving that area. The band is a function of the area alone. Someone watching the order learns which area a row serves — which the screen says in words anyway — and nothing finer.
- *Can two shelters in one area be told apart by their order?* **No.** They always land in the same band, and the tie is broken by the open key (from their schedules) and then by their ids. Neither is location-derived, and `miles` is null for both, so the distance key contributes nothing.
- *Does the geocoder ever run on these rows?* **No** — `pipeline/src/geocode.ts` skips `shelter.dv` and anything under it, and a typed address fails the build before it could matter.
- *Does anything else in the project count or place a DV row by location?* **No, structurally:** the neighbourhood "help nearby" counts (`pipeline/src/indicators.ts`) and the greenway "help within a 10-minute walk" report (`helpAlong`, `pipeline/src/access-report.ts`) both begin by keeping only rows that have `lat` and `lon`; the Map tab's layers and lists go through `mapDrawable`, which needs a coordinate *and* excludes sensitive rows; and search match tier 2 reads `address.line1` and `address.zip`, which a DV row does not have.
- *Does anything already in the repository leak one?* **No DV shelter's street address exists anywhere** — not in `data/seed/`, `data/seed/incoming/`, `data/seed/to-verify.csv`, the bundle, the committed HSDS export, or any commit in the repository's history (audited 2026-09-20; 15 distinct versions of the three DV rows across all of git, none with an address). Two research notes sit near the line and neither crosses it: `docs/research/2026-09-19-new-help/assault-tax-benefits.md:58` records the YWCA's **administrative office** address, labelled as such, in the same cell as the sentence "The shelter address is confidential; never list it"; and `docs/research/2026-09-19-new-help/entry-assault-tax-benefits.md:30` carries a street address belonging to a different organisation (a youth shelter), on a line that repeats the same warning. **Decided 2026-09-21 (Kyle): the administrative office address was removed from that note**, and the standing rule is now: **no address of any kind — shelter, office, outreach site or mailing address — is kept anywhere in this repository for a domestic-violence organization**: not in seed data, `internal_note`, research notes, the bundle or the HSDS export (CLAUDE.md, DECISIONS 2026-09-21). The address still in git history is an administrative office the organization publishes itself; it is not a shelter location. The **National Domestic Violence Hotline carries `service_area: national`**, so it ranks after every local line and is never shown as local.
- Quick-exit: DV and mental-health screens (and their listings) have a visible "Leave this page fast" button in the top bar. It replaces the page with a weather site (`location.replace`), so Back does not return to the app. These screens never change the URL, so history shows nothing about them. All three clients have it now, at the same address: the web, the iPhone (`AppNav.quickExit`) and Android (`MainActivity.quickExit`, which also clears the retained screen stack and removes the task from recents).
- **The sensitive set is exactly two categories, and it did not move on 2026-09-22.** `SENSITIVE` in
  `apps/web/src/needs.ts` (mirrored by `sensitiveCategories` in `HelpCore/Saved.swift` and `SENSITIVE` in
  `Needs.kt`) is `shelter.dv` and `health.mental`, matched **whole or as a parent** — `c === s || c.startsWith(s + '.')`
  — never as a run of letters. So `health.mental.crisis` is hidden and `health.support` is not, and neither could
  change without changing that list. The category audit of 2026-09-22 added `health.support` (K3) **and deliberately
  left it out of this set**: it is ongoing, non-crisis mental-health support — a daytime clubhouse whose owner
  prints its street address and phone on its own locations page — and withholding the address of a walk-in day
  program helps nobody and stops someone getting there. A crisis line and a DV shelter are hidden because being
  found can get a person hurt; a clubhouse is not in that position. A `health.support` listing is therefore an
  ordinary listing: address, map dot, distance, directions, Save, Share and its own URL. If a crisis service is
  ever filed under it by mistake, that is a data error, not a rule change — the row belongs in `health.mental`.
  Tests on all three platforms pin both halves: a `health.mental` row still has no address, no dot, no Save, no
  Share and no URL, and the clubhouse row has all of them.
- **What "private" covers, and where it is decided.** One predicate, `isPrivate`, in `apps/web/src/needs.ts`: the `shelter.dv` and `health.mental` pair, plus `treatment` and `assault`. A private row cannot be saved, **cannot be shared** (`canShare = !isPrivate`), keeps the plain app name as the window title, and — since 2026-09-20 — its **category list** writes no hash either, not just its detail screen; an arriving private deep link is replaced out of the URL. Treatment and sexual-assault listings still keep their address, distance, map dot and directions, because people have to get there (DECISIONS 2026-09-19).
- **Nothing private survives the app switcher or a rotation.** The iPhone covers the whole window with a shield whenever the scene is not active. Android sets `FLAG_SECURE` **per screen** — on for a private screen, off again for an ordinary one, so a person can still screenshot a pantry's address — and keeps the screen stack across a configuration change in an in-process holder that is **truncated at the first private screen**, never in `savedInstanceState`, which the system writes into a record that outlives the app.
- **Nothing private survives a backup, either.** The iPhone's install key, outbox and saved places sit in a directory marked "exclude from backup", re-applied on every launch; the cached bundle lives in Caches, which no backup keeps. Android sets `allowBackup="false"`.
- 988 and DWIHN crisis line on every mental-health path.

## Authorization & branding (city relationship)

- **Plan of record: no letter.** The app lists only information DHD already publishes, attributed as "Source: Detroit Health Department public listings," with no DHD name in the title and no logo. (It also said "Not an official City of Detroit app." in About until 2026-09-20, when Kyle had the line removed everywhere; see the Disclaimers section below and DECISIONS. The distinction now rests on the store listing, on what we tell the City, and on the repository's own `README.md`. A first-launch screen is not built yet.) A one-page letter (permission to use the name/logo, confirmation it's not a city product) would be welcome and is worth one ask — but DHD has not signalled it will take on any role, so nothing depends on it, and we never imply endorsement.
- Store listing is under Kyle Peterson / Linwood Technologies. "City of Detroit" does not appear in the app name.
- Partner data (Forgotten Harvest, Gleaners) only with written permission or a feed they hand us; otherwise link out.

## Disclaimers (short, plain, in-app under About; a first-launch screen, one screen and one tap, is not built yet)

Today's text in About:
- "This app lists free help from the City of Detroit and community groups. Info can change. If it's an emergency, call 911."
- "We don't collect your name, number, or location. There are no accounts. What you tap stays on this phone."
- ~~"Not an official City of Detroit app."~~ Removed everywhere on 2026-09-20 (Kyle; see DECISIONS). Nothing in the app now says it is not the City's app, so the store listing and any City conversation carry that on their own.
- "Each listing says where it came from and when someone last checked it. If nobody has checked it, we say so."

## App Store / Play review notes

- Apple guideline areas to expect: 1.4 (physical harm — medical info must be sourced), 5.1.1 (data collection — reports and proposals are text people send us. `apps/ios/HelpApp/PrivacyInfo.xcprivacy` declares exactly one collected type, **Other User Content**, not linked to the person and not used for tracking, with no tracking domains and no required-reason APIs — that is possible because what the app keeps lives in plain protected files rather than `UserDefaults` or the keychain. **The App Store nutrition label must say the same thing**, and **Photos must be added to both** if photo reports ever ship. No analytics exist. Check the manifest and the label against each other when submitting), 4.2 (minimum functionality — a directory with map, offline, and reporting clears it).
- Play: Data safety form — declare "no data collected/shared" if accurate; the Health category may require a privacy policy URL anyway; publish one.
- Both stores: a privacy policy page at the app's domain, plain language, matching the table above.

## Open-source & data license

Publishing the dataset (CC BY 4.0) and code (Apache-2.0, decided 2026-09-18) is part of the safety story: anyone, including DHD, can audit that we do what we say.

## Maps

The street map is part of the signed bundle and is drawn on the phone (docs/06). No map company, tile server, or third party is contacted, so nobody learns where a person is looking. The map files are downloaded whole, the same two files for everyone, the first time a person opens a map. The map moves to a person's location only after they have asked it to: on a first open the Map tab shows **our own card** and the platform is asked only if "Use my location" is tapped; on a later open it centres again only where permission is still granted (docs/05, DECISIONS 2026-09-21). Only coarse location is ever requested. The location dot is drawn on the phone, a typed ZIP is never drawn as a location, and a position outside the four cities moves nothing. **The position itself is never stored** — including in the camera the map remembers between screens, which is a few numbers in memory that die with the page and are written to no store on any client. The one thing kept is the boolean above. **Directions** and **Bus directions** still hand the destination address to the maps app the person chooses; the screen says so.

## Handing a place to another app (maps, and the Transit app)

Three buttons on a listing open something outside this app: **Directions** (the phone's maps app), **Bus
directions** (a trip plan in the browser) and, on a phone, **Bus directions in the Transit app**
(`transit://directions?to=…`, Transit's own documented link — `docs/research/2026-09-20/transit-app.md`). What a
third party learns is the same in all three, and it is the smallest thing that can work:

- **Only when the person taps.** Nothing is contacted until then: a plain `<a href>` on the web, one `openURL` on
  iOS. No SDK, no script, no preconnect, no icon or font from their servers, nothing loaded from transitapp.com
  while the screen is open. The CSP stays `default-src 'self'` and the service worker still ignores every origin
  but ours (a test checks all of this).
- **Only the destination.** The address the place publishes, or its coordinate. **Never an origin, never the
  person's location, never an identifier** — Transit's link takes a `from` parameter and we leave it out, which is
  their documented way of letting the app ask for the person's own location itself, on their phone.
- **Nothing about what the person was looking for.** The link says where a place is; it does not say it was found
  under Narcan, treatment, or a shelter search.
- **Never where directions are withheld.** DV and mental-health-crisis listings carry no address and no
  coordinate, so all three buttons are absent, the Transit one included. Treatment and sexual-assault listings
  keep their directions, because people have to get there, and so keep the Transit link.
- **Not an endorsement.** Transit is a company's app, linked like any other link-out and named as theirs. iOS asks
  the system whether the app is installed (`LSApplicationQueriesSchemes`) so it can hide a link that would do
  nothing; that question is local and sends nothing.
