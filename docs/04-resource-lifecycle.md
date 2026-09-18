# 04 — Resource Lifecycle: Add, Verify, Report, Expire, Archive

This is the part D Compassion — and most resource directories — never solved. A resource app is only as good as its worst listing, because the person who followed a dead listing to a locked door doesn't come back.

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
            steward   │ accept after the entry check       
                      ▼
                 ┌──────────┐   cadence passes with     ┌──────────┐
                 │  active  │ ──no verification──────▶  │  stale   │  visible, labeled, sorted down
                 └────┬─────┘ ◀──verify/confirm──────── └────┬─────┘
                      │                                      │
      2 independent   │  "closed"/"moved" reports            │ same
      within 30 days  ▼                                      ▼
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

*2026-09-18: `stale` is no longer a stored state; the phone derives it from dates. `flagged` rows stay visible with a warning. The diagram's transitions otherwise hold.*

**Default results show:** everything except `proposed`, `suspended`, and `archived`, sorted as described under "What the badge says."
**Search-by-name shows:** everything except `proposed`, with `flagged`/`archived` clearly warned ("Reported closed — call first" / "Closed as of Aug 2026").

## What the badge says (facts, not a score)

*Revised 2026-09-18 (DECISIONS.md): nobody phones listings on a schedule. The app is open source and meant to be handed over; it cannot depend on a standing verification job. Humans act on exceptions only. The price is that we stop saying "verified" and say what we know.*

The bundle ships facts per row: `checked_at_entry`, `last_confirmed_at`, `last_confirm_method`, open report counts by kind, `cadence_days`. **The phone computes the badge from those facts and today's date** (10-A3), so an offline phone ages its own data.

| What we know | Badge text |
|---|---|
| Confirmed within its window | "A visitor said this was open 4 days ago" / "Checked by phone 4 days ago" (method shown plainly; a tap is not a phone call) |
| Never confirmed, still inside its window | "Checked when added, Sept 18" |
| Past its window, no reports | "Nobody has confirmed this since Sept 18 — call first" |
| 1 open closed/moved report | "Someone reported this closed on Oct 2 — call first" |
| 2+ open closed/moved reports, no confirm since | "2 people reported this closed this week" — sorted last in its distance band, **still visible** (10-A1: reports never hide a row) |
| Steward archived | "Closed as of {date}. Try: {replacement}" |

Sort within a distance band: confirmed-in-window → checked-at-entry-in-window → past window → reported closed. A closed report outweighs a confirm of the same age. There is no numeric confidence shown or stored.

## How long a confirmation stays good (`cadence_days`)

Not a to-do list for anyone. It is only how fast a row's badge ages when nobody says anything.

| Category | Window | Why |
|---|---|---|
| Alerts/activations | Hard end date; expire automatically | By design |
| Mobile food distributions | 14 days | Schedules shift |
| Church/independent pantries | 45 days | Volunteer-run; holidays and summer breaks |
| Harm reduction stations | 45 days | Relocation, vandalism. Stock-outs are same-day signals (10-B4), not part of this |
| Shelter access points | 60 days | Hours change |
| Utility/rent assistance | 90 days | Funding cycles |
| DHD programs, rec centers, libraries, parks | 180 days | Stable institutions |
| Benefits link-outs | 365 days | Rarely change |

**The exception: safety-critical rows** (emergency strip numbers, crisis lines, shelter front door, DV hotlines — about 15 rows, listed in `data/seed/emergency.csv`). These are phoned every 30 days by whoever operates the app, and the release build fails if any `verified_by_call_on` is older than that. This is the one scheduled human job, about 20 minutes a month.

## Verification methods (cheapest first)

1. **Source still lists it** — the row is still present in its open-data layer or watched page. This is **not verification**; it only means the publisher hasn't removed it, and it never resets the clock. (If an org ever opts in to maintain its rows, a dated attestation from them does count — `method: owner_attest`.)
2. **Auto-checks** (nightly, no human): phone number format + carrier validity (via a lookup API, if budget allows; otherwise format only); website HTTP status; geocode sanity (address resolves within Detroit bbox); schedule sanity (no `until` in the past on an active row).
3. **Community confirm** — "Still open" tap from the detail screen. Sets `last_confirmed_at` (method `community_confirm`) unless there is a newer open closed-report on the row. Forgeable, so it is always displayed as what it is ("a visitor said…"), and a closed report outweighs it.
4. **Steward phone call** — used at entry and for exceptions only, never on a schedule (except the ~15 safety-critical rows). Script: "Are you still running the pantry? Days/times? Any ID or residency requirement? Okay to list?" Log method, date, who (role only).
5. **In-person** — outreach workers, Health Hub students, Kyle. Highest trust; log as `in_person`.

## Reporting (in-app, anonymous)

Detail screen → **"Something wrong?"** → one tap:

- Closed for good
- Moved
- Hours are different
- Out of supplies / no food today *(shown for harm-reduction and food only)*
- Wrong phone number
- Something else (280 chars)
- ✅ **Still open, info is right** *(positive confirm, prominent)*

Optional structured correction (new hours picker, new address) shown after the tap, skippable. Optional "when did you see this?" defaulting to now.

Submission:
- Sent to `POST /v1/reports` with `client_nonce = sha256(install_secret ‖ target_id ‖ YYYY-MM-DD)`. The nonce dedupes one device's reports per target per day. It differs for every target and every day, so a helper's five reports cannot be linked into a trail. `install_secret` is random, generated on first launch, stored only on the device, resettable, and never sent.
- No IP logged (Cloudflare Worker: don't persist `cf-connecting-ip`). No timestamps finer than the minute.
- Offline: queued locally, sent on next connection. Show "We'll send this when you're back online."
- Rate limiting happens at Cloudflare's edge, keyed on IP that the Worker never reads or stores. Nonces are client-made and forgeable, so they dedupe honest devices only; they are not a security control (10-A1).

Abuse model: a competitor pantry or a troll mass-reporting closures. Mitigations: independent-nonce requirement (2 reports from the same nonce count once), steward review before archive, and reports never delete — worst case is a false "might be closed" badge for a day.

## Steward workflow

**Stewards** are trusted humans with a login to the admin tool (see 06) — Kyle plus community stewards (CHWs, librarians, church coordinators, outreach workers). No DHD seat is assumed. Stewards are the only people who can archive. Roles: `owner` (can edit own org's rows, can't archive others'), `steward` (city-wide), `admin`.

**Exceptions queue** — worked in one sitting, about weekly. Nothing in the app waits on it except archiving and new listings:
1. Proposed rows (add-a-place) — one check at entry (phone or web), accept/reject with reason. The entry check is not optional: it is what keeps scam numbers and private addresses out.
2. Rows with 2+ open closed/moved reports and no confirm since — one call or look; archive or clear.
3. Machine-raised tasks: watched page changed, row dropped from an open-data layer, website 404 twice, phone/address change held for approval (10-A5).
4. Pending alerts drafted from press releases — always human-published (10-B10).

Labeling and demotion happen automatically with no steward. If the queue is never worked, the directory degrades honestly (badges age, reported rows carry warnings) instead of lying. See doc 12 for what happens if nobody operates the app at all.

Every steward action is logged: role, what, when, reason code. The public dataset carries the structured log only — never free-text notes (10-B6).

## Adding a resource

Two entry points:

**Resident/helper: "Add a place that helps"** (in app). Fields: name, what they give (category chips), address (map pin or typed), days/times (simple picker → RRULE), phone (optional), notes, "how do you know?" (I run it / I volunteer there / I went there / I heard about it). Submits as `proposed`. Confirmation: "Thanks — someone will check this and it'll show up within a few days." *Note the honest promise: we say what actually happens.*

**Provider: "List your organization"** (web form, later in-app). Same fields plus org contact email for verification and a request to become an `owner` of the row. Owner email verification is the one place we hold a contact — for providers, not residents — see 08.

Church pantry fast path: pre-fill from Forgotten Harvest / Gleaners host lists so a volunteer only confirms schedule and phone. This is where most of Detroit's food capacity lives; make it a five-minute task.

## Archiving

- Steward archives with reason: `closed_permanently | moved (→ replacement_id) | duplicate (→ canonical_id) | never_existed | program_ended | seasonal_ended (→ suspended instead)`.
- Archived rows stay in the HSDS dataset with `x_detroit.archived` populated and `status: archived`; the app bundle includes them in a compact `archived.json` so deep links and search-by-name can explain what happened instead of 404ing.
- A resource archived ≤ 90 days ago still appears in search-by-name with "Closed as of {date}. Try: {replacement}". After 90 days, only via deep link.
- Un-archive is allowed (pantry reopened) — it returns to `proposed` and re-verifies.

## Expiry of alerts

Alerts carry `ends_at`. At `ends_at`, they leave the home screen automatically with no human action. A steward can extend or retract early. Expired alerts remain in the archive; in autumn the tool suggests "last winter these 3 sites activated — pre-draft?"

## Metrics that tell us if this is working

- % of visible rows confirmed inside their window (no target to staff against; it is a health reading, and it is published).
- Median days from second "closed" report to steward resolution.
- Reports per 1,000 detail views (healthy: 5–20; too low = button isn't found; too high = data's bad).
- Confirm-to-correction ratio (healthy directory ≈ 3:1).
- Proposed → accepted rate and time.
All computed from anonymous counts; no per-user metrics exist.
