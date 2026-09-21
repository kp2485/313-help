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

**The directory.** 531 listings. 445 of them are researched rows, and a researched row goes live only once the
facts its owner prints **in digits** — the street number, and the phone number where the page prints one — have
been found on the organization's **own** web page. 392 were matched by `pnpm check:sources`; the other 53 are
pages that refuse scripts and were read in a browser instead. **The badge says which of the two happened** — "A
program matched this to their website on {date}" against "Their website was read and matched on {date}" — and since
2026-09-20 the build enforces it: a row whose host is recorded in `data/seed/script-refusing-hosts.csv` as refusing
scripts may not claim a script matched it. One row was claiming exactly that, and the check is what found it. Be clear about who did that reading: on 2026-09-20
those browser reads were **done by an AI agent driving a browser, and approved by Kyle as steward**, except the
`detroitmi.gov` pages, where the bot challenge was **passed by Kyle himself in his own Chrome** and the pages were
then read one at a time. No machine ever clicked a challenge. The remaining 86 listings come from two public
agencies' own data layers — 60 Detroit Health Department stations and 26 Wayne County ones — and have had **no
per-row check at all**: they carry their layer's own date and a badge that names only the list they came from.

Not every row carries every fact, and the app never pretends otherwise. **43 of the 531 have no phone number**,
because their owner publishes none: 26 Wayne County stations and 3 Health Department boxes (you cannot call a box),
12 Gleaners, Loaves and Fishes and Community Fridge food stops, one court self-help center, and Children's Hospital
of Michigan's emergency room, whose owner prints its number nowhere as digits — only as "(313) 745-KIDS", which we
will not do the arithmetic on ourselves. **44 have no street address**: 26 County stations that publish a
coordinate and nothing else, and 18 phone-only rows — hotlines, legal helplines and two door-to-door ride programs
with no door to walk into. A listing is publishable with a phone, a street address, **or** its publisher's own
coordinate; one of the three is enough, and a coordinate is never printed as if it were an address.

Fourteen more rows are sitting unpublished right now because nothing has confirmed them yet.
44 of the 46 categories in [docs/03](docs/03-data-model.md) have at least one live listing (`pnpm build:bundle`
reports "26 categories" for the same build: it counts the 21 top-level groups it writes plus five other tallies in
the same index — greenway segments, map cells, transport layers, parks and neighborhoods — not docs/03's 46
slugs); the two that are empty — warming centers and cooling centers — are empty on purpose, because they only
exist when somebody activates them. The largest groups: 144 food, 91 harm reduction (including 60 Health Department Narcan
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
| **Web (PWA)** — `apps/web` | The one anybody can use today. Vanilla TypeScript, 75.6 KB of JavaScript and 6.6 KB of CSS gzipped (each non-English language is a separate chunk, fetched only if chosen: Spanish 19.3 KB, Arabic 21.0 KB, Bengali 22.0 KB, all gzipped and measured from `apps/web/dist` on 2026-09-20), offline from IndexedDB, installable, reporting works. This is still the Android answer. |
| **iPhone** — `apps/ios` | SwiftUI, iOS 17+. Compiles and runs **in the Simulator only**. Never run on a real iPhone, never signed for one. Reports with an offline outbox, saved places, About/privacy with a key reset; no map, neighborhood pages or add-a-place yet. |
| **Android** — `apps/android` | Kotlin, platform Views, **no Compose, no AndroidX and no dependency of any kind inside the APK**, `minSdk` 24. Compiles, tests pass, and it has run **only on an API 35 emulator** — never on a phone, and never on anything below Android 15. The debug APK is 1.13 MiB and asks for two permissions, `INTERNET` and `ACCESS_COARSE_LOCATION`. |

**Nothing is signed for any app store**, and no store account exists.

**Tests.** `pnpm test` ran **644** tests in this checkout on 2026-09-20 (query 181, api 91, pipeline 192, web 180);
the count moves with every change, so treat it as a reading and not a promise. Beside them, `swift test` runs **73**
in three targets and Gradle runs **72** in two. The query rules exist three times — TypeScript, Swift, Kotlin —
against one spec (`schema/query-spec.md`) and **181 fixture cases** in `schema/fixtures/`, and all three run every
one of them. The fixtures are what keep the three honest.

Two things about the tests are worth saying plainly rather than hiding in a number. The parts of the phone apps
where a mistake is worst — the install key and its daily hash, the report outbox, what may not be saved, the one
network session, the signature check — used to live inside screens, which meant no workflow ever ran them. They
now live in a `HelpCore` library on iPhone (62 tests) and a `:core` module on Android (61) that compile without
Xcode or the Android SDK, so CI runs them on every push. And a new behavioural suite (`apps/web/test/behaviour.test.ts`,
36 tests) drives the app instead of grepping its source, which is how the accessibility audit found that every
live region was unannounced while a test counting them was green. **About 64 of the 114 tests in the older web
suite still assert on source text**; converting them is a standing job.

## Privacy, in one list

- **No accounts, no names, no phone numbers, no emails, no analytics.** None of it is collected, so none of it can
  leak. There is no resident table in the database and never will be.
- **Nothing that identifies a resident ever leaves the phone.** The only on-device secret is a random, resettable
  key used for one thing: `sha256(key ‖ target_id ‖ day)`, so one phone can't double-count one listing in one day.
  Every listing and every day gives a different hash, so the server cannot join a person's reports into a trail.
  **"Make a new key"** is on the privacy screen of all three apps, and a report already waiting to send is hashed
  at the moment it goes, not when it was written, so a new key covers the backlog too; beside it, "Delete what is
  waiting" throws the queue away instead. On iPhone and Android the key is kept out of backups, so restoring onto
  a new phone does not carry the old one across.
- **The Worker never reads an IP address or a user-agent header.** Not "doesn't log them" — never reads them. A
  test checks the source for it. Rate limiting is a Cloudflare rule at the edge, so the code never touches an IP.
- **The Worker keeps no logs.** Workers Logs are off by configuration (`[observability.logs] enabled = false` and
  `invocation_logs = false` in `api/wrangler.toml`), because Cloudflare's own documentation says invocation logs
  capture "request metadata, and headers." The error handlers log **nothing** — the framework's default would have
  written a database error's statement and its bound values, a report's dedupe hash among them — and the one
  permitted logging function can only print two fixed sentences about the nightly cron. Tests enforce both: that
  the handlers are silent, and that no other `console` call exists in the Worker. The price is honest: when a
  nightly pass fails, nothing anywhere says so in words.
- **Some screens leave no trace at all.** Treatment, help after sexual assault, domestic violence and
  mental-health crisis: no URL — not for the listing and, since 2026-09-20, not for the list either — no history
  entry that names anything, no page title, no saving, and **no Share button**. A link to one of those screens
  that somebody sends you is taken back out of the address bar the moment it opens. On iPhone the app covers
  itself in the app switcher; on Android those screens cannot be screenshotted and do not survive a rotation into
  any record the system keeps, while an ordinary listing still can be screenshotted, because people really do
  photograph an address.
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
  That is what the app is made of; what **enforces** it in the browser is stated exactly, because a promise is
  only as good as the thing that holds it. `apps/web/index.html` carries a Content-Security-Policy
  (`default-src 'self'`, `connect-src 'self'`, `base-uri 'none'`, `form-action 'none'`) and `no-referrer` as
  `<meta>` tags, which is the fallback a `file://` copy or a stale offline shell gets; a `<meta>` CSP cannot carry
  `frame-ancestors` at all. `apps/web/public/_headers` sends the same policy plus `frame-ancestors 'none'`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, `X-Frame-Options` and a `Permissions-Policy` as real
  response headers for `/*` — but Cloudflare Pages is what applies that file, and **no Pages site exists yet**, so
  those headers have never been served to anybody.
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
- **Badges state facts, never judgements.** "Matched their website when added, Sep 19, 2026." "From the {list},
  last updated {date}." "Nobody has checked it. Call first." The badge is computed **on the device** from the dates
  in the bundle, never frozen at build time, and unknown is never rendered as "open." Since 2026-09-20 the badge also says **who
  looked**: "A program matched this to their website on {date}" is not the same sentence as "Their website was read
  and matched on {date}," and a row may only claim the first if the build can see that its host was answering our
  script that day.
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
- **On a holiday the app stops claiming the door is open.** An RRULE that says "every Friday" says it about
  Christmas Day too, and on 2026-09-20 that meant 100 of the 183 listings with a schedule reported "Open" at noon
  on 25 December. None do now: a schedule-derived "open" on one of the eleven federal holidays (or the observed
  day, when one falls at a weekend) becomes **"Holiday today. Call first."** with the usual hours named beside it,
  and an upcoming time that lands on a holiday is labelled rather than dropped. Nobody's real holiday hours are in
  any source we read, which is the whole reason: unknown is never rendered as open. It is a date rule worked out
  on the phone, not a list in the bundle, so a three-month-old copy still knows what Christmas is. A steward who
  learns that a place really is open sets one flag on that row.
- **The bundle is Ed25519-signed** and clients pin two public keys. An unsigned or mis-signed bundle is refused
  and the phone keeps the copy it had. A pinned key has to be the right shape and must not be one of the known
  small-order keys, which would make every signature check pass — refused in both phone apps and in their release
  gates. A Release build of the iPhone app verifies the list it ships and will not later accept one older than it.
  The web app and Android have no such floor on a fresh install: that is on the roadmap.
- **We never disguise a request.** Our pipeline identifies itself honestly. `detroitmi.gov` currently answers 403
  to scripts and puts an interactive challenge in front of a browser, so those pages are read by hand instead.
  On 2026-09-20 that meant **Kyle passing the challenge himself, in his own Chrome**, and the pages being read one
  at a time in that session; the rest of the 53 browser-read rows were read by **an AI agent driving a browser,
  with Kyle approving the result as steward**. No challenge was clicked by a machine, no form was submitted and no cookie
  banner was accepted. That is recorded, not worked around.
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
- **248 decisions are written down; 26 are still open** (24 Open, 2 Proposed — [DECISIONS.md](docs/DECISIONS.md)).
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
| After the deploy, confirm in the dashboard that Observability → Logs is off for the Worker and that no account-level Logpush job for Workers Trace Events exists — two things a config file cannot prove. And never paste `wrangler tail` output anywhere: it streams live requests, URLs and headers | **Kyle** |
| A review of the overdose steps by DHD, MDHHS or counsel. Until it happens the screen says so in as many words: "Call 911 first. No doctor has checked these steps yet." | **outside party** |
| A native speaker's review of Spanish, Arabic and Bengali — crisis, overdose and domestic-violence screens first, then the three newest keys (`clock.am`, `clock.pm`, `list.sep`) | **Kyle** to find reviewers, then outside parties |
| Write the empty-search line for Arabic and Bengali. **Searching in either language returns nothing today**, because every listing is written in English; the screen should say so and offer the categories, in wording the native reviewer supplies rather than one we guess | **outside party**, then work |
| Make the iPhone and Android apps read "am"/"pm" from the strings files; both still hard-code them (`HelpApp/Help.swift`, `Format.kt`) | **work** |
| One line on the About screen saying this is an independent project — "An independent project. Not from the City of Detroit, DDOT, SMART or the Health Department." The app now shows layers named after all four of those agencies and says nowhere in itself that it is not theirs | **Kyle** (he removed the old line on 2026-09-20; this is a recommendation, not a reversal) |
| Serve the headers in `apps/web/public/_headers`. The `/*` block is written — CSP with `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, `X-Frame-Options`, a `Permissions-Policy` — but **Cloudflare Pages is what applies that file and no Pages site exists**, so it has never been served to anybody. Create the site, then check from outside with `pnpm smoke` | **Kyle** (the Pages site), then work |
| Settle SEMCOG's indemnification clause: accept the Copyright License Agreement knowingly, or remove the crash layer | **Kyle** |
| Write down the date and substance of the DHD conversation, or leave the claim of DHD's informal support off public pages. There is no record of it anywhere in this repository, and everything else here is held to "name the page and date it" | **Kyle** |
| Decide whether a personal email address belongs in a public repository. `api/edge-protections.md` carries Kyle's own (`kdpeters@gmail.com`) as the steward on the Cloudflare Access allow list. It is his to publish or not — the zero-PII rules are about residents — but it is the only personal address in the repo | **Kyle** |
| Work the steward worksheet: five SER rows to confirm in a browser, 15 calls owed, the DHD phone misprint to report, the VA emergency-room number to confirm by voice ([CHECKS-2026-09-20](docs/CHECKS-2026-09-20.md)) | **steward** |
| Import the one Highland Park tax-help line that never made it in. (The cause is fixed: `pnpm import:lines` now reports an id collision instead of dropping the line.) | **steward** |
| Run the Android app on an old, cheap phone and at API 24 and 30, and measure the cold start (the hand-written Ed25519 check took about 20 seconds on an emulator) | **work** |
| Test both apps with a screen reader and with switch control, with real assistive-technology users. On Android the autofill, keyboard-personalisation and heading flags are set in code and **verified by reading the code, nothing more** — no instrumented test runs, and no phone has been near TalkBack | **work** |
| Design a rollback floor for a fresh install on the web and Android. The iPhone has one: a Release build verifies the list it ships and refuses anything older. The other two only refuse a bundle older than the copy they already hold, so a phone that has just installed would take any validly signed bundle, however old | **work** |
| Keep converting the web tests from source greps to behavioural ones. A new suite drives the app (36 tests); about 64 of the 114 in the older suite still assert on the text of a source file, which is green when a line is dead and red when it is harmlessly rewritten | **work** |
| Put the iPhone's release enforcement into version control. `preflight.sh` and `verify-snapshot.swift` are committed, but the build phases that run them live in the git-ignored `apps/ios/Xcode/`, so a rebuilt project silently has no gate | **work** |

### Next — the first three months

| | Waits on |
|---|---|
| Apple and Google developer accounts **as an organization** (Linwood Technologies, so the apps can be handed over), signing configs, TestFlight and Play internal testing | **Kyle** ($99/yr and $25) |
| Android release work: app icon and launch artwork, `OnBackInvokedCallback`, instrumented tests, the Play data-safety form ("no data collected, no data shared") | **work** |
| iPhone parity: the map, neighborhood pages, transit, add-a-place, an in-app language switch, the age banner on every list (quick exit and the app-switcher shield are done) | **work** |
| Android parity: the map, neighborhood pages, link-outs, add-a-place, condition reports, ZIP sorting | **work** |
| Settle the licence questions we have flagged: SEMCOG about the indemnification clause in its Copyright License Agreement and the Michigan State Police about records that are theirs (and remove the crash layer if either objects), Wayne County about the Well Wayne station map — and about getting the file directly rather than through Google's undocumented My Maps KML endpoint — Transit about the link, and the City about its open-data layers that state no terms | **outside parties**, asked by **Kyle** |
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
| A key-revocation path. Nothing anywhere revokes a pinned public key, so a lost or stolen signing key means shipping new app builds to everybody. Worth designing before it is needed, not after. (The rollback floor is half-built: the iPhone has one, the web and Android do not — **Now**) | **work** |
| Provider self-listing: a place claims its own rows, with email verification — the only email this project would ever hold | **work** |
| Pre-warm the language chunks, so choosing a language works the first time with no signal. Today each non-English language is a separate file fetched on demand, and without a connection the app stays in English and says so (`lang.needs_net`) | **work** |
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
pnpm test                                   # 644 tests: query fixtures, pipeline, API, web
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

**Clear.** US Census Bureau TIGER/Line and TIGERweb — US government works, not protected by copyright. US DOT BTS
Amtrak Stations, published for unrestricted public use. HSDS 3.2 is Open Referral's open standard.

**Each organization's own website.** Most listings. We publish the facts a place publishes about itself, name the
page, and date it. More than 150 organizations; they are all named in [NOTICE](NOTICE).

**Stated terms we accept.**

- **US DOT BTS Intercity Bus Atlas Stops** is **CC BY-NC 4.0** — attribution and non-commercial. That suits a free
  app, and it is a real condition rather than a formality, accepted on purpose (DECISIONS 2026-09-20). It is the
  reason the code licence has a data carve-out: see [Licence](#licence).
- **SAMHSA's treatment directories.** The National Directory is in the public domain, but the publication states
  its own condition — it "may not be reproduced or distributed for a fee" — so it belongs here rather than under
  "Clear." `data/sources.yaml` records that condition beside the word "public domain." We use the lists to find
  and stage programs; every live row's facts come from the program's own page, and we charge nobody anything.
- **SEMCOG's crash layer**, whose records are the **Michigan State Police's** (CJIC), behind the "Safe streets"
  panel. SEMCOG's portal carries a **Copyright License Agreement**
  (<https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement>) covering everything it publishes:
  a perpetual, royalty-free licence to reproduce and publish, a **required** notice —
  *"Copyright © \<year\> SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is Prohibited."* — and
  a one-way clause under which the user indemnifies SEMCOG, plus a clause granting no third-party rights, which
  matters because the reports underneath are the State Police's and neither body has been asked. The required
  notice is reproduced in [NOTICE](NOTICE); **it is not yet on the Safe streets panel**, which today names SEMCOG
  and the State Police but does not carry the notice itself — a roadmap item below. **Two more things are open for
  Kyle, not settled:** whether to accept the indemnification clause knowingly, and MSP's position on records that
  are theirs. Either way the layer is counts only, read by hand about once a year, and deleting one file makes the
  panel disappear (DECISIONS 2026-09-20).

**No stated terms — flagged, and questions owed.** These are published by public bodies as their own open data,
which is the bar this project sets, but they state no licence. Each is recorded as `unstated`, names its owner in
the app, and is on the list of questions to ask:

- **City of Detroit open data** (`data.detroitmi.gov`): the portal carries a disclaimer and no licence grant.
  That covers DDOT bus routes and stops, QLINE stops, MoGo stations, bike lanes, the roads and city boundary
  behind the map, parks, ZIP areas, neighborhoods, the Health Department's harm-reduction stations, and the
  property, permit, blight, demolition and Improve Detroit layers behind the neighborhood pages. DDOT also
  publishes a GTFS feed its portal marks **CC0** — the clearest licence of the lot — which we cannot read because
  the site blocks scripts, so it waits for a person.
- **Wayne County's Well Wayne naloxone and test-strip station map** (`endoverdosewayne.org`). The content is the
  County's; the delivery is Google's — the map is a published Google My Map and we read its own KML endpoint,
  which Google documents nowhere. Asking the County for the file directly is on the list.
- **SMART's and the Detroit People Mover's GTFS feeds**, which publish no terms at all. **MDOT Carpool Lots**,
  whose terms are a disclaimer with no redistribution limit.
- **The Transit app's URL scheme.** Their developer page invites developers to use it and states no terms, no
  branding rule and no permission requirement. Silent is not the same as permissive, so until someone asks we use
  the plain word "Transit" in text, no logo, no asset of theirs, and nothing fetched from their servers.

## Licence

- **Code: Apache-2.0** ([LICENSE](LICENSE)). The patent grant matters if a city's vendor ever forks it — but a
  fork gets the **code** under Apache-2.0 and nothing more: the third-party data files in this repository are not
  Apache-2.0 licensed, and one of them (`data/ingested/transit/intercity_bus.json`) is CC BY-NC 4.0, so a
  commercial vendor would have to drop that file or get its publisher's permission.
- **Our dataset: CC BY 4.0**, with a per-row source licence field, because we can only license what is ours.
- **Source data keeps its own terms**, recorded per source. Apache-2.0 covers the source code only; the
  third-party data files under `data/ingested/` and `data/seed/` keep their publishers' terms. The carve-out is
  spelled out in **[data/LICENSE-DATA.md](data/LICENSE-DATA.md)**, with the same summary at the end of
  [LICENSE](LICENSE) and in [NOTICE](NOTICE).
- Contributions: a DCO sign-off line, not a CLA.

## Acknowledgements

The residents, volunteers, clergy, staff and outreach workers who run the places in this directory, and everyone
who reports a closed door or confirms an open one.

**This app rebuilds the intent of the Detroit Health Department's D Compassion app from public program
information.** DHD has not authorized it, has not offered to maintain any data or feed, and there is no written
authorization; the design assumes none. **Nothing here is endorsed by the City of Detroit**, the Health
Department, DDOT or SMART, and the City's name is not on the app. ("Not an official City of Detroit app" was
removed from the app itself on 2026-09-20 by the owner's decision — see [DECISIONS.md](docs/DECISIONS.md) — and
no store listing exists yet, so right now that distinction rests on pages like this one and not on anything a
resident sees. Putting one line back on the About screen is a roadmap item waiting on Kyle.)

Also: 313SafeBeds, whose work on shelter availability is where "where can I sleep tonight" belongs, and which the
shelter screen opens with — we link to them and copy nothing from them; and the food banks, public agencies and
standards bodies credited in [NOTICE](NOTICE).

---

**Read the design docs** — every decision in this project is written down, including the ones we got wrong:
[docs/README.md](docs/README.md) is the index.
