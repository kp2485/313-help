# 04 — Resource Lifecycle: Add, Verify, Report, Expire, Archive

This is the part D Compassion — and most resource directories — never solved. A resource app is only as good as its worst listing, because the person who followed a dead listing to a locked door doesn't come back.

## Principles

1. **Nothing is ever deleted.** Rows are archived with a reason and, when possible, a replacement. History is data.
2. **Unknown is not "open."** A listing that hasn't been verified within its cadence is shown as stale, sorted down, and labeled. We never imply currency we don't have.
3. **Two sources beat one.** A single anonymous report never takes a resource down. Two independent reports hide it from default results; a steward archives it.
4. **Owners are the fastest path to truth.** If the row came from an owner feed (DHD's sheet), the feed's next fetch resolves most reports automatically. Community reports on owner rows are routed to the owner.
5. **Make reporting cheaper than complaining.** One tap from the detail screen. No account. No form longer than a tweet.
6. **Reward confirmation as much as correction.** "Still here, still open" reports reset the verification clock and are the cheapest verification we have.

## States

```
                 ┌──────────┐
  add-a-resource │ proposed │ community/owner submitted, not visible
                 └────┬─────┘
            steward   │ accept (or owner feed row appears)
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
                      │ steward rejects / owner feed confirms                 ▲
                      └──────────────▶ active                                │
                                                                              │
                 ┌───────────┐  owner or steward pauses (e.g. pantry on       │
                 │ suspended │  summer break) — hidden with "returns <date>" ──┘ (if never resumes)
                 └───────────┘
```

**Default results show:** `active` and `stale` (stale sorted after active within the same distance band, with a badge).
**Search-by-name shows:** everything except `proposed`, with `flagged`/`archived` clearly warned ("Reported closed — call first" / "Closed as of Aug 2026").

## Confidence score

Computed at bundle build time; drives sort order and badge. Never shown as a number to residents — shown as one of three badges: **Verified recently** / **Might be out of date** / **Reported closed**.

```
base by source type:    owner_feed 0.9 | partner_feed 0.85 | open_data 0.8 | press_release 0.7 | seed_list 0.5 | community 0.4
age decay:              × max(0.3, 1 − days_since_verified / (2 × cadence_days))
confirm boost:          + 0.05 per community "still open" in last 30 days (cap +0.15)
report penalty:         − 0.25 per open "closed/moved" report (independent nonces)
                        − 0.10 per open "wrong hours/phone" report
auto-check penalty:     − 0.15 if phone number failed validity, − 0.10 if website 404 two fetches in a row
clamp 0..1
```

Badges: ≥ 0.7 Verified recently; 0.4–0.7 Might be out of date; < 0.4 or state ≠ active → warning.

## Verification cadences by category

| Category | Cadence | Why |
|---|---|---|
| Alerts/activations | Hard end date — no cadence; expire automatically | By design |
| Harm reduction stations | 14 days | Vandalism, relocation, stock-outs |
| Mobile food distributions | 7 days (schedule) / 30 days (site) | Schedules shift weekly |
| Church/independent pantries | 30 days | Volunteer-run; holidays and summer breaks |
| Shelter / CAM access points | 30 days | Hours change |
| Utility/rent assistance programs | 90 days | Program cycles; funding runs out |
| DHD programs, rec centers, libraries | 90 days | Stable institutions |
| Benefits link-outs (SNAP, WIC) | 180 days | Rarely change |

Cadence is a per-row override; category value is the default.

## Verification methods (cheapest first)

1. **Owner feed fetch** — the row appeared in the owner's sheet/feed on this fetch → verified (`method: owner_feed`).
2. **Auto-checks** (nightly, no human): phone number format + carrier validity (via a lookup API, if budget allows; otherwise format only); website HTTP status; geocode sanity (address resolves within Detroit bbox); schedule sanity (no `until` in the past on an active row).
3. **Community confirm** — "Still open" tap from the detail screen. Resets clock only if ≥ 2 independent confirms in 30 days OR 1 confirm on a row ≤ 45 days stale.
4. **Steward phone call** — the standard for anything community-added or flagged. Script: "Are you still running the pantry? Days/times? Any ID or residency requirement? Okay to list?" Log method, date, who (role only).
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
- Sent to `POST /reports` with `client_nonce = sha256(install_id ‖ YYYY-MM-DD)`. The nonce dedupes one device's reports per day per target; it is not linkable across days and is never joined to anything else. `install_id` is a random UUID generated on first launch, stored only on the device, resettable.
- No IP logged (Cloudflare Worker: don't persist `cf-connecting-ip`). No timestamps finer than the minute.
- Offline: queued locally, sent on next connection. Show "We'll send this when you're back online."
- Rate limit: 20 reports/day per nonce, 3 per target per nonce. Silent drop beyond that.

Abuse model: a competitor pantry or a troll mass-reporting closures. Mitigations: independent-nonce requirement (2 reports from the same nonce count once), steward review before archive, owner-feed rows auto-resolve, and reports never delete — worst case is a false "might be closed" badge for a day.

## Steward workflow

**Stewards** are trusted humans with a login to the admin tool (see 06) — Kyle, a DHD data owner, ideally a couple of CHWs/librarians/church coordinators. Stewards are the only people who can archive. Roles: `owner` (can edit own org's rows, can't archive others'), `steward` (city-wide), `admin`.

Daily queue, sorted by urgency:
1. Flagged rows (2+ closed/moved reports) — call or check; archive or clear.
2. Proposed rows (add-a-resource submissions) — verify by phone; accept/reject with reason.
3. Stale rows past 2× cadence in high-risk categories (harm reduction, mobile food).
4. Auto-check failures.
5. Pending alerts parsed from press releases (first season only; later, trusted parse → auto-publish with 1-hour retract window).

Every steward action is logged: who (role + steward id), what, when, evidence (call notes). The log is part of the open dataset minus steward identity.

Target SLA: flagged → resolved within 24h; proposed → within 72h.

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

- % of active rows verified within cadence (target ≥ 85%).
- Median hours from first "closed" report to steward resolution.
- Reports per 1,000 detail views (healthy: 5–20; too low = button isn't found; too high = data's bad).
- Confirm-to-correction ratio (healthy directory ≈ 3:1).
- Proposed → accepted rate and time.
All computed from anonymous counts; no per-user metrics exist.
