# 313 Help

[![ci](https://github.com/kp2485/313-help/actions/workflows/ci.yml/badge.svg)](https://github.com/kp2485/313-help/actions/workflows/ci.yml)

A resource app for every Detroiter that stores nothing about you, works on a cheap Android phone with bad signal,
and never sends you to a pantry that closed last month.

**Status: not yet live.** The apps, the data and the write API are built and tested; nothing is deployed. See
[Status](#status) for exactly what is left.

## What it is, and who it is for

Detroit's safety net is real and enormous, and the information about it is scattered and goes stale fast. Mobile
pantries move. Warming centers open for four days and close. A Narcan newsstand gets relocated. Someone in crisis
follows a two-year-old listing to a locked door.

313 Help is a directory, a triage flow and a freshness system for free help in **Detroit, Hamtramck, Highland Park
and Dearborn**. You open it, answer two to four taps ("I need food this week"), and get the few places that fit,
ranked on your own phone, with the dates behind every claim on screen. It works with no signal and no account.

It is built for, in this order:

- **A resident who needs help right now** — food this week, a bed tonight, Narcan, a shutoff notice, a clinic.
  Assume an old phone, prepaid data that may be off, no patience for forms, maybe in crisis, maybe reading at a
  6th-grade level, maybe in Spanish, Arabic or Bengali.
- **The people who look things up for them** — community health workers, librarians, church volunteers, outreach
  workers. They are also the people most likely to tell us a listing is wrong.
- **City and Health Department staff, and anyone else who wants the data** — the directory is published as an
  open, HSDS-shaped dataset, separately from the app.

What it is not: not an intake system, not case management, not a bed-management tool (that is
[313SafeBeds](https://313safebeds.com), which the shelter screen opens with), and not a City of Detroit product.
It is shipped by Kyle Peterson / Linwood Technologies. See [docs/01](docs/01-vision-scope.md).

## The three ideas

1. **It stores nothing.** No accounts, no intake, no contact details, no analytics. The triage runs on the phone.
   There is no resident data to secure because there isn't any — which is also why it can ship without a
   procurement process.
2. **Freshness is the product.** Every listing carries the dates we actually know about it, a plain badge that
   says what those dates mean, and a one-tap "this is wrong / closed / moved." Listings age out visibly instead of
   quietly lying. Nothing ever says "verified" unless a person verified it.
3. **The data outlives the app.** The directory is published as an open HSDS 3.2 dataset under CC BY 4.0. If the
   app dies, the data doesn't.

## What is in it today

Every number here comes from running `pnpm build:bundle`, `pnpm test` and `pnpm preflight` in this checkout on
2026-09-20, or from reading the code.

**The directory.** 531 listings. A researched row goes live only once its phone number and street number have been
found on the organization's **own** web page — by `pnpm check:sources`, or by a person reading the page in a
browser when the site blocks scripts. Rows that come from a public agency's own data layer carry that layer's date
instead. Fourteen rows are sitting unpublished right now because nothing has confirmed them yet.
44 of the 46 categories in [docs/03](docs/03-data-model.md) have at least one live listing; the two
that are empty — warming centers and cooling centers — are empty on purpose, because they only exist when
somebody activates them. The largest groups: 144 food, 91 harm reduction (including 60 Health Department Narcan
stations and 26 Wayne County naloxone and test-strip stations), 79 health, 37 jobs, 27 treatment, 27 learning,
19 recreation, 19 youth, 15 money, 13 legal, 12 shelter, 12 housing.

Health includes **9 emergency rooms and 13 urgent care centers**. They are deliberately not filed as clinics:
"clinic" in this app means free or low-cost, and none of these places says it is. The emergency-room screen opens
with 911.

**The Map tab.** The street map is drawn on the phone from City open data and US Census TIGER files that ride in
the signed bundle — no tile server, no map library, nothing contacted, works offline. On it you can switch on the
greenway (52 segments), 302 City parks, help by category, and **11 transport layers**: DDOT routes and stops,
SMART routes and stops, QLINE, the People Mover, MoGo, bike lanes, Amtrak stations, intercity bus stops and
park-and-ride lots. Everything drawn on the map is also a text list of the same places, so no fact is reachable
only through a picture.

**Neighborhood pages** for all 205 Detroit neighborhoods: what help is listed nearby, home sales beside building
permits, blight and demolition counts, time to close reported problems, and pedestrian and bicycle crash counts.
No rankings, no per-neighborhood crime, and counts under five are suppressed ([docs/13](docs/13-neighborhood-indicators.md)).

**Four languages.** English, Español, العربية and বাংলা, each a separate file fetched only when chosen, with
Arabic mirroring the whole interface right to left. **Arabic and Bengali were drafted by machine and no native
speaker has read either one yet**, and Spanish is still waiting for a native reviewer too. Nothing in the app
claims otherwise, and a native review of the crisis screens is a condition of a public release. What a place wrote
about itself is never machine-translated, in any language.

**Accessibility.** A full pass against WCAG 2.2 Level AA over every web screen: **44 pass, 21 failures found and
fixed, 4 left open with written reasons** ([the audit](docs/ACCESSIBILITY-AUDIT-2026-09-20.md)). The worst one
found: every live region in the app was being rebuilt by `innerHTML` and therefore never announced, so nothing
that happened without a screen change was ever heard.

**Three clients, and their honest states:**

| | State |
|---|---|
| **Web (PWA)** — `apps/web` | The one anybody can use today. Vanilla TypeScript, 72.8 KB of JavaScript and 6.6 KB of CSS gzipped (each non-English language is a separate 19–22 KB chunk, fetched only if chosen), offline from IndexedDB, installable, reporting works. This is still the Android answer. |
| **iPhone** — `apps/ios` | SwiftUI, iOS 17+. Compiles and runs **in the Simulator only**. Never run on a real iPhone, never signed for one. Reports with an offline outbox, saved places, About/privacy with a key reset; no map, neighborhood pages or add-a-place yet. |
| **Android** — `apps/android` | Kotlin, platform Views, **no Compose, no AndroidX and no dependency of any kind inside the APK**, `minSdk` 24. Compiles, tests pass, and it has run **only on an API 35 emulator** — never on a phone, and never on anything below Android 15. The debug APK is 1.13 MiB and asks for two permissions, `INTERNET` and `ACCESS_COARSE_LOCATION`. |

**Nothing is signed for any app store**, and no store account exists.

**Tests.** `pnpm test` runs **503** tests (query 111, api 80, pipeline 179, web 133). Beside them: 111 Swift
fixture cases and 28 iPhone app tests, and on Android its own JUnit tests — the signature check against RFC 8032,
the daily report hash, the saving rules, the needs-parity check — plus the same 111 fixture cases run twice, once
with no test framework on the classpath at all. The query rules exist three times — TypeScript, Swift, Kotlin — against one spec
(`schema/query-spec.md`) and one set of fixtures (`schema/fixtures/`). The fixtures are what keep the three honest.

## Privacy, in one list

- **No accounts, no names, no phone numbers, no emails, no analytics.** None of it is collected, so none of it can
  leak. There is no resident table in the database and never will be.
- **Nothing that identifies a resident ever leaves the phone.** The only on-device secret is a random, resettable
  key used for one thing: `sha256(key ‖ target_id ‖ day)`, so one phone can't double-count one listing in one day.
  Every listing and every day gives a different hash, so the server cannot join a person's reports into a trail.
- **The Worker never reads an IP address or a user-agent header.** Not "doesn't log them" — never reads them. A
  test checks the source for it. Rate limiting is a Cloudflare rule at the edge, so the code never touches an IP.
- **Triage answers live in memory** and are gone when you leave. Location is used for sorting and never written or
  sent. Saved places and your language are on the phone only.
- **Report text is capped at 280 characters** and the Worker replaces phone numbers and email addresses with
  "[removed]" before storing anything. Request bodies are closed schemas: an unknown field is a 400.
- **Raw reports are kept 180 days**, then become monthly counts. Condition-report photos are off; when they are
  ever switched on they are re-drawn on the phone, refused if they carry any metadata block, visible only to
  stewards, and deleted 30 days after the report closes.
- **The map contacts nobody.** It is part of the signed bundle and drawn on the device, so no map company learns
  where anyone is looking.
- **What a third party learns when you tap a link-out:** three buttons open something outside the app —
  **Directions** (your maps app), **Bus directions** (a trip planner in the browser) and **Bus directions in the
  Transit app**. All three hand over **only the destination**: the address the place publishes, or its coordinate.
  Never your location, never an origin, never an identifier, and never what you were searching for. Nothing is
  contacted until you tap — no SDK, no script, no preconnect, no font or icon from their servers. Domestic-violence
  and mental-health-crisis listings carry no address or coordinate at all, so all three buttons are simply absent.
- **Condition reports are about things, never people.** There is no category, no free-text path and no photo flow
  for a person, a tent, or "suspicious activity," and there will not be one.

The whole table of what is stored, where, and for how long is [docs/08](docs/08-privacy-safety.md).

## How the data stays honest

- **Own-page rule.** A listing's facts come from the organization's own website, or from a public agency's own
  data layer. Not from an aggregator, not from a news story, not from a directory. `pnpm check:sources` reads each
  candidate's source page and refuses to publish the row until the phone number and street number are actually on
  it. Rows that can't be finished wait in `data/seed/to-verify.csv` with a reason — 326 rows today, 71 of them now
  settled, and nothing is ever deleted from that file.
- **A shelter's address is published only if the shelter publishes it itself.** Domestic-violence shelters are
  listed by intake phone only, never by address, map dot or distance, even when they publish an address.
- **Badges state facts, never judgements.** "Matched their website when added, Sep 19, 2026." "Nobody has checked
  it. Call first." The badge is computed **on the device** from the dates in the bundle, never frozen at build
  time, and unknown is never rendered as "open."
- **Reports label rows; they never hide them.** Two different phones saying a place closed puts a warning on it. A
  person, not an algorithm, archives it — and nothing is ever deleted. An archived listing keeps its link and says
  "Closed as of {date}. Call 211 for other options," and the HSDS export marks it `defunct`.
- **Steward approval for every change that matters.** A changed phone number, address or coordinate from any
  source is held until a person approves it. Open-data changes arrive as a pull request; merging it is the
  approval.
- **Emergency numbers are held to the number their owner currently publishes.** 911 and 988 are hardcoded and can
  never be overridden. `pnpm check:emergency` reads each of the other 9 numbers' own pages; a page that shows a
  different number fails a release build until a person fixes it. The script never rewrites a number. A page that
  can't be read is logged for a person, not treated as a failure. A misprinted number is never repaired by
  guessing the digits.
- **The bundle is Ed25519-signed** and clients pin two public keys. An unsigned or mis-signed bundle is refused
  and the phone keeps the copy it had.
- **We never disguise a request.** Our pipeline identifies itself honestly. `detroitmi.gov` currently answers 403
  to scripts, so those pages are read by a person in a browser instead. That is recorded, not worked around.
- **If nobody ever does any of this,** listings keep saying what they said, with their dates, phones that haven't
  updated in a while say so, and nothing quietly becomes a lie. Retiring the directory is a person's decision, and
  there is no timer anywhere.

## Status

Checked on 2026-09-20, in this checkout:

- **The site is not yet live.** `ALLOWED_ORIGIN` in `api/wrangler.toml` is `https://313help.com`, and that
  hostname does not resolve, so no resident can reach anything. A Cloudflare account exists with a real D1
  database and a Worker project that builds from this repository (its build check runs on every pull request);
  whether that Worker is serving anything was not checked, and there is no Pages site for the app.
- **`pnpm preflight` reports 3 things to fix, all Kyle's:** two pinned public keys
  (`BUNDLE_PUBLIC_KEYS`), the active private signing key (`BUNDLE_SIGNING_KEY`), and the check that the signing
  key is one of the two pinned ones. Everything else it can see is green, including the real D1 database id and a
  person's signature that the Cloudflare Access policy and the WAF rate-limiting rule exist.
- **The four D1 migrations have never been applied to the remote database**, and nothing scheduled has ever run:
  not the nightly publish (off until `PUBLISH_ENABLED` is set), not the report purge, not the photo delete.
- **Condition-report photos are off**, at two switches, until the legal advice in [docs/11](docs/11-greenway-public-places.md)
  is in hand.
- **One hand-check row still has no result**, which preflight reports as something to look at rather than a
  blocker: the human work owed before telling the public an address is not a deploy gate.
- **220 decisions are written down; 22 are still open** (20 Open, 2 Proposed — [DECISIONS.md](docs/DECISIONS.md)).
  Most of the open ones are licence questions to ask and phone calls to make.

The step-by-step deploy list, with what each step costs and what proves it, is
[DEPLOY-HANDOFF-2026-09-20.md](docs/DEPLOY-HANDOFF-2026-09-20.md). Running it costs roughly $110 a year plus a $25
one-off — the Apple developer program, a domain and a Play account; Cloudflare and GitHub Actions are free at the
traffic expected ([docs/12](docs/12-gift-and-handoff.md)).

## Roadmap

By horizon, not by date. Every item says what it waits on: **Kyle** (an account, a key, money, or a decision), a
**steward** (a person reading a page or making a call), an **outside party** (an answer we've asked for), or just
**work**. The detailed version, with the build order and the open questions, is
[docs/09](docs/09-roadmap.md).

### Now — what stands between this and being usable in public

| | Waits on |
|---|---|
| Generate the two signing keys, set `BUNDLE_SIGNING_KEY` and `BUNDLE_PUBLIC_KEYS`, turn `pnpm preflight` green | **Kyle** |
| Point the domain at Cloudflare, create the Pages project and the Worker route, apply the four D1 migrations `--remote` (the Cloudflare account, the D1 database and the Worker's Git build already exist) | **Kyle** |
| Deploy, then `pnpm smoke -- https://<origin> --i-own-this-origin` to prove the Access policy and the rate-limit rule from outside | **Kyle**, then work |
| Turn the nightly publish on (`PUBLISH_ENABLED`), run it by hand once, read the log | **Kyle** |
| A native speaker's review of Spanish, Arabic and Bengali — crisis, overdose and domestic-violence screens first, then the three newest keys (`clock.am`, `clock.pm`, `list.sep`) | **Kyle** to find reviewers, then outside parties |
| Write the empty-search line for Arabic and Bengali. **Searching in either language returns nothing today**, because every listing is written in English; the screen should say so and offer the categories, in wording the native reviewer supplies rather than one we guess | **outside party**, then work |
| Make the iPhone and Android apps read "am"/"pm" from the strings files; both still hard-code them (`HelpApp/Help.swift`, `Format.kt`) | **work** |
| A review of the overdose steps by DHD, MDHHS or counsel | **outside party** |
| Work the steward worksheet: five SER rows to confirm in a browser, 15 calls owed, the DHD phone misprint to report, the VA emergency-room number to confirm by voice ([CHECKS-2026-09-20](docs/CHECKS-2026-09-20.md)) | **steward** |
| Import the one Highland Park tax-help line that never made it in. (The cause is fixed: `pnpm import:lines` now reports an id collision instead of dropping the line.) | **steward** |
| Run the Android app on an old, cheap phone and at API 24 and 30, and measure the cold start (the hand-written Ed25519 check took about 20 seconds on an emulator) | **work** |
| Test both apps with a screen reader and with switch control, with real assistive-technology users | **work** |

### Next — the first three months

| | Waits on |
|---|---|
| Apple and Google developer accounts **as an organization** (Linwood Technologies, so the apps can be handed over), signing configs, TestFlight and Play internal testing | **Kyle** ($99/yr and $25) |
| Android release work: app icon and launch artwork, `OnBackInvokedCallback`, instrumented tests, the Play data-safety form ("no data collected, no data shared") | **work** |
| iPhone parity: the map, neighborhood pages, transit, add-a-place, quick exit on private screens, an in-app language switch, the age banner on every list | **work** |
| Android parity: the map, neighborhood pages, link-outs, add-a-place, condition reports, ZIP sorting | **work** |
| Settle the licence questions we have flagged: SEMCOG and the Michigan State Police about the crash layer (and remove the layer if either objects), Wayne County about the Well Wayne station map, Transit about the link, the City about its open-data layers that state no terms | **outside parties**, asked by **Kyle** |
| Ask the City to let the pipeline read `detroitmi.gov` again, or download DDOT's CC0 GTFS feed by hand | **Kyle** / **steward** |
| Call DWIHN about treatment for uninsured Wayne County residents, and which address the Care Center uses today | **Kyle** |
| Legal advice before condition-report photos are switched on; then the R2 bucket, Turnstile or app attestation, and on-device face block-out | **Kyle** |
| Coverage passes for the neighborhoods where our list is thin, and for Highland Park, which has no emergency room and no urgent care with an owner page | **steward** |
| Decide the service-area edge case: the nearest Henry Ford-GoHealth urgent care is in Dearborn Heights, inside our bounding box and outside the four named cities | **Kyle** |
| A warming- and cooling-center alert workflow ready before winter, written only from an owner's own announcement | **steward** |
| Name the first two community stewards | **Kyle** |
| First conversations with Forgotten Harvest and Gleaners about a feed, and with 211/CIE about taking the HSDS export | **Kyle** |
| Put `pnpm ingest:transit` on a monthly schedule, or keep it by hand on purpose | **work** |

### Later

| | Waits on |
|---|---|
| Page watchers on public program pages, raising steward tasks and never changing the app by themselves | **work** |
| `signals.json` for same-day signals ("no food today") that can't wait for a nightly build | **work** |
| Turnstile or app attestation on the write API | **work** |
| Provider self-listing: a place claims its own rows, with email verification — the only email this project would ever hold | **work** |
| Local notifications for saved places and alerts | **work** |
| A council-district lens, a CDC PLACES tract map, and a record of which neighborhoods have had a coverage pass | **work** |
| "How do I get there" from GTFS, with the nearest route | **work** |
| A steward mobile mode for outreach workers verifying on the go | **work** |
| Health Hub and QR-code distribution with DHD — their original idea for D Compassion | **outside party** |
| Hand the whole thing to a steward organization, or run the documented sunset: a person sets `retired: true`, every phone says the list is no longer updated and points at 211, and nothing pretends to be alive ([docs/12](docs/12-gift-and-handoff.md)) | **Kyle** |

## Quick start for developers

You need **Node 22** and **pnpm 12** (an older pnpm will not install this workspace — `corepack enable`, or
`npm i -g pnpm@12`).

```sh
pnpm install
pnpm typecheck                              # TypeScript strict, every workspace
pnpm test                                   # 503 tests: query fixtures, pipeline, API, web
pnpm build:bundle                           # data/seed + data/ingested -> data/hsds + a signed data/bundle/v1 (dev key)
pnpm --filter @313help/api migrate:local    # a local D1 database in api/.wrangler
pnpm --filter @313help/api dev              # the write API on http://localhost:8787
pnpm --filter @313help/web dev              # the app on http://localhost:5173 (proxies /v1 to the API)
pnpm preflight                              # is this checkout ready to deploy? one line per check
```

The steward queue is at **http://localhost:5173/admin/**. `wrangler dev` runs the database and a fake photo
bucket on your own machine and touches no Cloudflare account. To pull report counts and steward decisions into the
bundle, build with `REPORTS_API=http://localhost:8787 pnpm build:bundle` — and run a plain `pnpm build:bundle`
afterwards so no test reports end up in `data/hsds/`.

The iPhone app: `pnpm build:bundle`, then open `apps/ios/Xcode/Help313.xcodeproj` (see
[apps/ios/README.md](apps/ios/README.md) — the Xcode folder is git-ignored and the README says how to recreate it).
Android: `cd apps/android && ./gradlew test` needs only a JDK; the screens need the Android SDK
([apps/android/README.md](apps/android/README.md)).

Other scripts — the ingesters, `pnpm check:sources`, `pnpm check:emergency`, `pnpm import:lines`,
`pnpm alert:new`, `pnpm keys:generate`, `pnpm smoke` — are explained in
[OPERATIONS.md](docs/OPERATIONS.md).

### Repo map

```
313-help/
  data/seed/         hand-kept CSVs and alerts.json: the listings, schedules, emergency numbers, holds
  data/sources.yaml  the source registry: url, tier, publish or stage, field mapping
  data/ingested/     what the ingesters read from open data — committed, so a change is a pull request
  data/hsds/         generated and committed on publish: the open HSDS 3.2 dataset
  data/bundle/       generated, never committed: the signed bundle the apps read
  packages/query/    the shared query rules in TypeScript: open now, next times, badges, ranking
  schema/            query-spec.md and fixtures/ — one spec, three implementations
  pipeline/          Node 22 + TypeScript: one file per job (ingest-*, build, normalize, validate, sign, …)
  api/               the Cloudflare Worker (Hono) and the D1 migrations
  admin/             the steward queue: plain HTML, CSS and JS, no build step, behind Cloudflare Access
  apps/web/          the PWA
  apps/ios/          SwiftUI, plus DetroitQuery (the Swift copy of the rules)
  apps/android/      Kotlin, platform Views, plus query/ (the Kotlin copy of the rules)
  strings/           en.json, es.json, ar.json, bn.json — every word the app shows
  docs/              every design decision, and why
```

## How to help

**Report a wrong listing.** Open it in the app and tap *Something wrong?*. No account, and it takes one tap. This
is the single most useful thing anyone can do.

**Steward.** Work the exceptions queue at `/admin/` for about an hour a week: listings that people reported
closed, new places proposed, and pages whose own website stopped saying what we list. [OPERATIONS.md](docs/OPERATIONS.md)
describes the whole job; [CHECKS-2026-09-20.md](docs/CHECKS-2026-09-20.md) is the current worksheet.

**Translate or review.** Spanish, Arabic and Bengali all exist and none has been read by a native speaker.
[CHECKS-2026-09-20.md](docs/CHECKS-2026-09-20.md) ends with exactly which strings to read first and where the
drafter was least sure. Start with the overdose, crisis and domestic-violence screens.

**Test it with the tools you actually use.** A screen reader, switch control, largest dynamic type, 400% zoom, an
eight-year-old Android phone on 3G. The [accessibility audit](docs/ACCESSIBILITY-AUDIT-2026-09-20.md) says what was
checked and what is still open; real users will find what a code review cannot.

**Write code.** Issues and pull requests are welcome. Contributions carry a DCO sign-off line, not a CLA.

Before you send a change, these are not negotiable:

1. **Zero PII.** No identifier for a resident may ever leave the device — not for debugging, not temporarily. If a
   feature seems to need one, it is out of scope. The Worker may not read an IP or user-agent header at all.
2. **Facts come from the owner's own page.** Not an aggregator, not a directory, not a news story. Any phone,
   address or coordinate change is held for a steward.
3. **Do not scrape a Tier C or D source** ([docs/02](docs/02-data-sources.md)), and never write back to a source.
4. **Never work around a block.** Identify requests honestly; if a site refuses us, a person reads it in a browser.
   Do not make our requests look like a browser's.
5. **Badges state facts.** Never say "verified" for something no person checked, and never render unknown as open.
6. **Condition reports are about things, never people.** Do not add a category, a text path or a photo flow for a
   person, a tent, a vehicle someone sleeps in, or "suspicious activity" — even if a partner asks.
7. **If you decide something the docs don't cover, add a row to [DECISIONS.md](docs/DECISIONS.md)** with the date
   and a one-line reason. If a task conflicts with a doc, stop and ask.

## Data sources and licences

The full registry is `data/sources.yaml` and [docs/02](docs/02-data-sources.md); every listing in the app names its
own source on screen, and [NOTICE](NOTICE) credits everyone together. Summarised honestly:

**Clear.** US Census Bureau TIGER/Line and TIGERweb, and SAMHSA's treatment directories — US government works, not
protected by copyright. US DOT BTS Amtrak Stations, published for unrestricted public use. HSDS 3.2 is Open
Referral's open standard.

**Each organization's own website.** Most listings. We publish the facts a place publishes about itself, name the
page, and date it. More than 150 organizations; they are all named in [NOTICE](NOTICE).

**Stated terms we accept.** US DOT BTS Intercity Bus Atlas Stops is **CC BY-NC 4.0** — attribution and
non-commercial. That suits a free app, and it is a real condition rather than a formality, accepted on purpose
(DECISIONS 2026-09-20).

**No stated terms — flagged, and questions owed.** These are published by public bodies as their own open data,
which is the bar this project sets, but they state no licence. Each is recorded as `unstated`, names its owner in
the app, and is on the list of questions to ask:

- **City of Detroit open data** (`data.detroitmi.gov`): the portal carries a disclaimer and no licence grant.
  That covers DDOT bus routes and stops, QLINE stops, MoGo stations, bike lanes, the roads and city boundary
  behind the map, parks, ZIP areas, neighborhoods, the Health Department's harm-reduction stations, and the
  property, permit, blight, demolition and Improve Detroit layers behind the neighborhood pages. DDOT also
  publishes a GTFS feed its portal marks **CC0** — the clearest licence of the lot — which we cannot read because
  the site blocks scripts, so it waits for a person.
- **SEMCOG's crash layer**, whose records are the **Michigan State Police's**. Used for counts only, by hand, once
  a year. Neither body has been asked yet. If either objects, deleting one file makes the panel disappear.
- **Wayne County's Well Wayne naloxone and test-strip station map** (`endoverdosewayne.org`).
- **SMART's and the Detroit People Mover's GTFS feeds**, which publish no terms at all. **MDOT Carpool Lots**,
  whose terms are a disclaimer with no redistribution limit.
- **The Transit app's URL scheme.** Their developer page invites developers to use it and states no terms, no
  branding rule and no permission requirement. Silent is not the same as permissive, so until someone asks we use
  the plain word "Transit" in text, no logo, no asset of theirs, and nothing fetched from their servers.

## Licence

- **Code: Apache-2.0** ([LICENSE](LICENSE)). The patent grant matters if a city's vendor ever forks it.
- **Our dataset: CC BY 4.0**, with a per-row source licence field, because we can only license what is ours.
- **Source data keeps its own terms**, recorded per source.
- Contributions: a DCO sign-off line, not a CLA.

## Acknowledgements

The residents, volunteers, clergy, staff and outreach workers who run the places in this directory, and everyone
who reports a closed door or confirms an open one.

**Detroit Health Department program staff are aware of this project and informally supportive of reusing the
public information from the D Compassion build.** DHD has not offered to maintain any data or feed, and there is
no written authorization; the design assumes neither. Nothing here is endorsed by the City of Detroit, and the
City's name is not on the app. ("Not an official City of Detroit app" was removed from the app itself on
2026-09-20 by the owner's decision — see [DECISIONS.md](docs/DECISIONS.md) — so that distinction now rests on the
store listing and on what we say in places like this one.)

Also: 313SafeBeds, whose work on shelter availability is where "where can I sleep tonight" belongs, and which the
shelter screen opens with — we link to them and copy nothing from them; and the food banks, public agencies and
standards bodies credited in [NOTICE](NOTICE).

---

**Read the design docs** — every decision in this project is written down, including the ones we got wrong:
[docs/README.md](docs/README.md) is the index.
