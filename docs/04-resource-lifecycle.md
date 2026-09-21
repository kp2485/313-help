# 04 — Resource Lifecycle: Add, Verify, Report, Expire, Archive

This is the part D Compassion — and most resource directories — never solved. A resource app is only as good as its worst listing, because the person who followed a dead listing to a locked door doesn't come back.

## How listings stay fresh: every mechanism, in one place

*Current as of 2026-09-21. The site is live and the nightly job is on (`PUBLISH_ENABLED=true`; first good run
2026-09-21 03:23 UTC). Each line names where it is enforced.*

| # | Mechanism | Where it lives |
|---|---|---|
| 1 | **Own-page rule.** Facts come from the organization's own page or a public agency's own data layer — never an aggregator, directory or news story. | docs/02 tiers; `data/sources.yaml` |
| 2 | **Machine match at entry.** A row goes live only when its phone and street number are found on its own page. Exceptions: a DV row publishes on its phone alone, by rule (it may never carry an address); a phone-only service is matched on its phone; an agency layer's row carries the layer's own date and its publisher's coordinate. | `pnpm check:sources`, `pipeline/src/page-match.ts` |
| 3 | **Script-refusing hosts are recorded, not worked around.** A host that refuses our honestly labeled fetcher is listed with the date; a person reads those pages in a browser. An empty 200 or a challenge page is *unreadable*, never a match or a mismatch. | `data/seed/script-refusing-hosts.csv` |
| 4 | **Badges say who looked.** `entry_method: auto_check` → "A program matched this to their website on {date}"; `web` → "Their website was read and matched on {date}". The build fails an `active` row that claims `auto_check` on a script-refusing host. | `pipeline/src/validate.ts`; `packages/query` badge rules |
| 5 | **Nightly re-check.** The publish job re-reads every active row's page with the same matcher. A miss or an unreadable page becomes a steward task ("Pages that changed"); nothing in the app changes until a person decides. | `.github/workflows/publish.yml` step 5; `check:sources --recheck` |
| 6 | **Open-data changes arrive as pull requests.** A changed station, greenway phase or street is a diff; merging it is the approval. Any phone, address or coordinate change from any source is held for a steward. | publish workflow step 4 |
| 7 | **Freshness computed on the device** from dated facts in the bundle, never frozen at build time. | `packages/query`, mirrored in Swift and Kotlin; fixtures `06-badge` |
| 8 | **One-tap anonymous reports and confirms.** Reports label and demote; they never hide. Two different phones saying "closed" puts the row last in its band with a warning. | `POST /v1/reports`; fixtures `07-rank` |
| 9 | **Stewards archive, with a reason; nothing is deleted.** Archived rows keep their link and say "Closed as of {date}". | `admin/`, D1, `archived.json` |
| 10 | **Unknown is never "open."** A schedule-derived "open" on a federal holiday (or its observed day) becomes `holiday`: usual hours, "Holiday today. Call first." A steward who learns a place is open sets `open_holidays`. Cancellations close any window they overlap. | `schema/query-spec.md` "Holidays"; fixtures `12-holidays` (40 cases) |
| 11 | **Emergency numbers match their owners' pages.** 911 and 988 are hardcoded; the other nine are re-checked nightly; a mismatch fails the release build and yesterday's bundle stays up. The script never rewrites a number. | `pnpm check:emergency`, `build:bundle:release` |
| 12 | **Signed bundles.** Ed25519; clients pin two keys and keep the copy they had if a new one fails. | `pipeline/src/sign.ts`; each client's verify step |
| 13 | **Old copies say so; retirement is deliberate.** Over 72 hours: "Call before you go." Over 30 days: "Call first, or call 211." `retired: true` points every phone at 211. | docs/12; fixtures `08-bundle-age` |

**The best next improvement is provider-verified listings** (docs/09): everything above notices a problem after
it exists; only the owner knows before. `owner_attest` is already a method in the schema and the badge rules.

## Principles

1. **Nothing is ever deleted.** Rows are archived with a reason and, when possible, a replacement. History is data.
2. **Unknown is not "open."** A listing nobody has confirmed within its window is labeled with the plain fact ("Nobody has confirmed this since…"), and sorted down. We never imply currency we don't have — and we never say "verified" for something a person didn't check.
3. **Reports label; only people remove.** Reports are anonymous and forgeable (10-A1), so no number of them hides a row. They add a warning and sort it down, automatically. Only a steward archives.
4. **The person at the door is the fastest path to truth.** No institution maintains a feed for us (see 02), so nothing resolves a report automatically. The best evidence is someone physically there: a resident's report, a host's answer on the phone, a steward's visit. A published list never outranks the person standing at the empty box.
5. **Make reporting cheaper than complaining.** One tap from the detail screen. No account. No form longer than a tweet.
6. **Confirmation is the verification.** "Still open" taps from residents and helpers are how this directory stays current; there is no scheduled calling behind them. The button is as prominent as Call. Helpers (CHWs, librarians, outreach workers) who open the same rows every week are the real verifiers.

## States

```
                 ┌──────────┐
  add-a-resource │ proposed │ community/owner submitted, not visible
                 └────┬─────┘
     entry check      │ passes (see "How a row goes live" below)
                      ▼
                 ┌──────────┐
                 │  active  │  stays active until people report otherwise (no timers)
                 └────┬─────┘
                      │
      2 different     │  "closed"/"moved" reports
      phones          ▼
                 ┌──────────┐   steward accepts          ┌──────────┐
                 │ flagged  │ ────────────────────────▶  │ archived │  hidden; reason + replacement kept
                 └────┬─────┘                            └──────────┘
                      │ steward rejects after checking                        ▲
                      └──────────────▶ active                                │
                                                                              │
                 ┌───────────┐  owner or steward pauses (e.g. pantry on       │
                 │ suspended │  summer break) — hidden with "returns <date>" ──┘ (if never resumes)
                 └───────────┘
```

*2026-09-19: there is no `stale` state at all (no timers). `flagged` rows stay visible with a warning. The diagram's transitions otherwise hold.*

**How a row goes live.** A listing we researched goes from `proposed` to `active` when `pnpm check:sources` finds its phone number and street number on its own web page (`entry_method: auto_check`), or when a person reads the page in a browser because the site blocks scripts (`entry_method: web`). The two are **different badges**, because they are different claims about who looked, and since 2026-09-20 the build enforces the difference: an `active` row may claim `auto_check` only with a source URL, a check date, and a host that `data/seed/script-refusing-hosts.csv` does not record as refusing scripts by that date. A page that answers 200 with almost no text, or with a challenge or block page, is **unreadable** — never a match and never a mismatch.

**One exception, and only one: a domestic-violence row publishes on its phone alone, by rule** (Kyle, 2026-09-20; DECISIONS). Every other listing with no phone must show its house number on its own page. A `shelter.dv` row may never carry a street address at all — the build fails if it does, even when the shelter prints its own address — so asking for one would hold every such row for ever. What `pnpm check:sources` checks is what the row actually claims: the number a survivor will dial (`pipeline/src/page-match.ts`, `phoneOnlyByRule`). A DV row with no phone is held, with that reason named. The one thing a DV row may say about where it is, is a coarse `service_area` from the closed list in `packages/query/src/areas.ts` — a whole city or bigger, entered by a steward from the owner's own page, and never a ZIP, a neighbourhood or an address (schema/query-spec.md, docs/08).

**Archiving is a steward's act in the queue, not an edit to the seed.** There is no way to retire a row by editing `data/seed/resources.csv`: an `archived` row with no archive record (a date and one of the reasons below) fails the build, and the record itself is only ever written by the steward endpoint into D1, then applied at the next build. A duplicate is archived with reason `duplicate` and the surviving row as the replacement. One is owed today (OPERATIONS). A place sent from the app ("Add a place") waits in the steward queue. If it checks out, a steward adds it to `data/seed/resources.csv` by hand. Nothing in the queue goes live by itself.

**Default results show:** everything except `proposed`, `suspended`, and `archived`, sorted as described under "What the badge says."
**Search-by-name shows:** everything except `proposed`, with `flagged`/`archived` clearly warned ("{count} people said this was closed. Call first." / "Closed as of {date}").

## What the badge says (facts, not a score)

*Revised 2026-09-18 (DECISIONS.md): nobody phones listings on a schedule. The app is open source and meant to be handed over; it cannot depend on a standing verification job. Humans act on exceptions only. The price is that we stop saying "verified" and say what we know.*

The bundle ships facts per row: `checked_at_entry`, `last_confirmed_at`, `last_confirm_method`, open report counts by kind. **The phone computes the badge from those facts** (10-A3). No timers (DECISIONS 2026-09-19): the wording changes only when people report something; time passing only changes the dates shown, and they are always shown.

| What we know | Badge text |
|---|---|
| Confirmed (any age) | "A visitor said this was open {days} days ago" / "We checked by phone {days} days ago" (method shown plainly; a tap is not a phone call) |
| Checked when added by a script (`auto_check`) | "A program matched this to their website on {date}" |
| Checked when added by a person reading the page (`web`) | "Their website was read and matched on {date}" |
| Checked when added, other methods | "Checked by phone when added, {date}" / "Checked in person when added, {date}" |
| From a public list with a known edit date; no person checked the row (`source_listed`) | "From the {source}, last updated {source_date}" |
| From a list with no date, and no person checked the row (`never_checked`) | "From the {source}. Nobody has checked it. Call first." |
| 1 open closed/moved report | "Someone said this was closed on {date}. Call first." |
| 2+ open closed/moved reports, no confirm since | "{count} people said this was closed. Call first." Sorted last in its distance band, **still visible** (10-A1: reports never hide a row) |
| Steward archived | "Closed as of {date}", then "Call 211 for other options." (Showing the replacement: not built yet.) |

Sort within a distance band: listings reported closed by 2 or more phones go last; everything else is sorted by open hours, then distance. How long ago something was checked never reorders a list. A closed report outweighs a confirm of the same age. There is no numeric confidence shown or stored.

## No timers on listings

*Decided 2026-09-19 (Kyle): "I don't want resources to disappear unless there is good reason, i.e. a person telling the app that the resource no longer exists."*

A listing never changes because time passed. There is no check-by date, no "stale" state, and no automatic "Call first." What a listing shows changes only when:

- people report it (closed, moved, wrong hours or phone) — it is labeled, and 2+ phones reporting it closed puts it last in its band;
- a visitor confirms it is still there;
- a steward archives, pauses or restores it;
- its own web page stops showing its phone or street number — then it goes to the steward queue (the nightly re-check); the app doesn't change until a person decides.

Alerts are different: they end at the time their owner announced (`ends_at`, 7 days at most).

**The exception: safety-critical rows** (the Urgent help numbers. **11 rows in `data/seed/emergency.csv`** as of 2026-09-20: 911, 988, Detroit's shelter line, Out-Wayne's shelter line for Dearborn, the DWIHN crisis line and its walk-in Care Center, the National Domestic Violence Hotline, 211, SAMHSA's helpline, Avalon, and Michigan's VOICES4 sexual-assault line). `pnpm check:emergency` reads each number's own page. A release build fails only when a page is read and shows a different number (a mismatch); a page that can't be fetched is logged for a person but doesn't stop a release (DECISIONS 2026-09-19). **Only 911 and 988 are never checked this way** — 211 is matched against mi211.org like every other number (corrected 2026-09-20; this line used to say 6 rows and exempt 211). The script never rewrites a number. If one stops matching, a person reads the page and decides.

## Verification methods (cheapest first)

1. **Source still lists it** — the row is still present in its open-data layer or watched page. This is **not verification**; it only means the publisher hasn't removed it. (If an org ever opts in to maintain its rows, a dated attestation from them does count — `method: owner_attest`.)
2. **Auto-checks** (no human): at entry, `pnpm check:sources` looks for the row's phone number and street number on its own web page. At every bundle build, `pipeline/src/validate.ts` checks that each phone number is a valid number, that coordinates are inside the Detroit bbox, and that schedules are well formed (it warns when an active row has a schedule that already ended). Each night the publish job reads every active row's page again with the same matcher (`check:sources --recheck`); a miss, or a page it can't read, becomes a steward task and changes nothing in the app.
3. **Community confirm** — "Still open" tap from the detail screen. Sets `last_confirmed_at` (method `community_confirm`) unless there is a newer open closed-report on the row. Forgeable, so it is always displayed as what it is ("a visitor said…"), and a closed report outweighs it.
4. **Steward phone call** — used at entry and for exceptions only, never on a schedule. Script: "Are you still running the pantry? Days/times? Any ID or residency requirement? Okay to list?" Log method, date, who (role only).
5. **In-person** — outreach workers, Health Hub students, Kyle. Highest trust; log as `in_person`.

## Reporting (in-app, anonymous)

Detail screen → **"Something wrong?"** → one tap:

- Closed for good
- Moved
- Hours are different
- Out of supplies / no food today *(shown for harm-reduction and food only)*
- Wrong phone number
- Something else
- ✅ **Still open, info is right** *(positive confirm, prominent)*

Any report can carry an optional note, up to 280 characters ("Add a note if you want. Don't put your name or number."). The API also accepts a suggested correction (new hours, address, or phone), but the app doesn't offer one yet. The report's time is the moment it is sent; there is no "when did you see this?" question.

Submission:
- Sent to `POST /v1/reports` with `client_nonce = sha256(install_secret ‖ target_id ‖ YYYY-MM-DD)`. The nonce dedupes one device's reports per target per day. It differs for every target and every day, so a helper's five reports cannot be linked into a trail. `install_secret` is random, made the first time it is needed, stored only on the device, and never sent. Clearing the site's data resets it, and so does **"Make a new key"** on the Your privacy screen, which all three clients now have. A queued report is hashed at the moment it is **sent**, not when it was written, so a new key covers the backlog; beside the button, "Delete what is waiting" throws the queue away instead.
- No IP logged: the Worker never reads the IP header at all, and a test checks its source for that. No timestamps finer than the minute.
- Offline: queued locally, sent on next connection. Show "Thanks. We'll send this when you're back online."
- Rate limiting happens at Cloudflare's edge, keyed on IP that the Worker never reads or stores. Nonces are client-made and forgeable, so they dedupe honest devices only; they are not a security control (10-A1).

Abuse model: a competitor pantry or a troll mass-reporting closures. Mitigations: independent-nonce requirement (2 reports from the same nonce count once), steward review before archive, and reports never delete — worst case is a false "might be closed" badge for a day.

## Steward workflow

**Stewards** are trusted humans with a login to the admin tool (see 06) — Kyle plus community stewards (CHWs, librarians, church coordinators, outreach workers). No DHD seat is assumed. Stewards are the only people who can archive. Today every steward signed in through Cloudflare Access has the same rights (city-wide). Separate roles come later: `owner` (can edit own org's rows, can't archive others') and `admin`.

**Exceptions queue** — worked in one sitting, about weekly. Nothing in the app waits on it except archiving and new listings:
1. Proposed rows (add-a-place) — one check at entry (phone or web), accept/reject with reason. An accepted place is then added to `data/seed/resources.csv` by hand. The entry check is not optional: it is what keeps scam numbers and private addresses out.
2. Rows with 2+ open closed/moved reports and no confirm since — one call or look; archive or clear.
3. Machine-raised tasks: watched page changed, row dropped from an open-data layer, website 404 twice, phone/address change held for approval (10-A5). The open-data part arrives as a nightly pull request (`.github/workflows/publish.yml`, on since 2026-09-21). A changed station, greenway phase, or street shows up as a diff, and merging it is the approval. The website check is the nightly re-check: under "Pages that changed" on the steward page, each listing whose own page no longer shows its phone or street address, or couldn't be read. The steward looks and presses "Checked: it's fine" or "I'll fix it" (then edits `data/seed/resources.csv`); the task closes itself when the page matches again.
4. Alerts — always written and published by a person (10-B10). Nothing drafts them from press releases. A steward writes one with `pnpm alert:new`, which requires an end time (7 days at most), a link to where it was announced, and a valid phone number if it has one. `--demo` makes a practice alert that says "Demo," lasts 3 hours at most, needs no link, and can't carry a phone number.

Labeling and demotion happen automatically with no steward. If the queue is never worked, the directory degrades honestly (badges age, reported rows carry warnings) instead of lying. See doc 12 for what happens if nobody operates the app at all.

Every steward action is logged in D1: who signed in, what, when, reason code, and an optional note. The log stays in D1 and is not published. The public dataset carries only the result: a row's status, and for an archived row its date, reason, and replacement (10-B6).

## Adding a resource

Two entry points:

**Resident/helper: "Add a place that helps"** (in app, on the Help tab under More). One screen. Fields: name of the place, what kind of help it is (one choice), what people get there, address (typed), days and times in your own words, the place's phone (optional), anything else, and "How do you know about it?" (I run it / I volunteer there / I went there / I heard about it). There is no choice for a domestic-violence shelter, and the API drops the address if one is sent anyway. It goes to the steward queue as a proposal. Confirmation: "Thanks. A person will check this place before it shows up. That can take a few days." *Note the honest promise: we say what actually happens.* Offline, it waits on the phone and sends when the phone is back online.

**Provider: "Confirm or fix your listing"** (roadmap, docs/09 — the biggest freshness lever). A signed, expiring link sent to the contact address on the organization's own page; *Still right* records an `owner_attest` confirmation, and any change is held for a steward. That address is the one contact the project would hold — a provider's, never a resident's — see 08.

Church food banks: a church that posts its own food-bank distribution on its own site may be listed from that page. We never copy Forgotten Harvest or Gleaners partner lists.

## Archiving

- Steward archives with reason: `closed_permanently | moved (→ replacement_id) | duplicate (→ canonical_id) | never_existed | program_ended | seasonal_ended (→ suspended instead)`.
- Archived rows stay in the HSDS dataset with `x_detroit.archived` populated and `status: archived`; the app bundle includes them in a compact `archived.json` so deep links and search-by-name can explain what happened instead of 404ing.
- A resource archived ≤ 90 days ago still appears in search-by-name, under "Closed places," with "Closed as of {date}". Its link opens a page that says "Closed as of {date}" and "Call 211 for other options." After 90 days it leaves `archived.json`, and a link to it shows "We can't find that listing. It may have been removed." with 211.
- Un-archive is allowed (pantry reopened). On the steward page, under "Archived by a steward," the button "It's open again: restore it" returns the row to `active` at the next build. Its open closure reports are cleared. A restore is recorded with the reason `restored`, never as a phone check: nobody called, so the badge must not say anyone did (DECISIONS 2026-09-19).

## Expiry of alerts

Alerts carry `ends_at`. At `ends_at`, they leave the home screen automatically with no human action. A steward can extend or retract early. Expired alerts remain in the archive. Later: in autumn the tool suggests "last winter these 3 sites activated — pre-draft?"

## Metrics that tell us if this is working

Not built yet.

- % of visible rows confirmed inside their window (no target to staff against; it is a health reading, and it is published).
- Median days from second "closed" report to steward resolution.
- Reports per 1,000 detail views (healthy: 5–20; too low = button isn't found; too high = data's bad).
- Confirm-to-correction ratio (healthy directory ≈ 3:1).
- Proposed → accepted rate and time.
All computed from anonymous counts; no per-user metrics exist.
