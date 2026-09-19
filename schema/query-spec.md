# Query spec — one spec, every client

The web app and pipeline import `packages/query`. iOS (and later Android) re-implement it. All of them must pass every case in `schema/fixtures/*.json`. If the spec and a fixture disagree, the fixture wins and the spec gets fixed.

## Time

- Everything is evaluated on a **floating America/Detroit wall clock**. Convert the current instant to Detroit wall time once; compare wall time to wall time. Schedule dates (`YYYY-MM-DD`) and times (`HH:MM`, 24h) are wall-clock values with no offset.
- This is why daylight saving cannot break open-now: a door sign that says "Fridays 1:30" means 1:30 on the wall in July and in December.
- If the device clock is earlier than the bundle's `generated_at`, the device clock is wrong; use `generated_at` as now.

## Occurrences

- A schedule is HSDS RRULE fields: `freq`, `interval`, `byday` (`MO,WE`, `2TU`, `-1FR`), `bymonthday`, `dtstart`, `until`, plus `valid_from` / `valid_to`, `opens_at`, `closes_at`.
- No `freq` means a single date (`dtstart`).
- **Valid shapes only.** Dates are exactly `YYYY-MM-DD` and must exist; times are exactly `HH:MM`, with `24:00` the latest; `freq` is one of DAILY, WEEKLY, MONTHLY, YEARLY; `interval` is a whole number of 1 or more; `byday` goes only with WEEKLY or MONTHLY, and a numbered day (`2TU`, `-1FR`, 1 to 5) only with MONTHLY; `bymonthday` (whole numbers, 1 to 31 or -1 to -31) only with MONTHLY. The pipeline refuses anything else. A client that meets one anyway skips that schedule; if none are left, the row is `unknown`. It never guesses.
- `closes_at <= opens_at` means the window runs past midnight into the next day. The occurrence belongs to the date it **opens**.
- A row may have several schedules; their occurrences merge in time order.
- HSDS has no exception dates. A **published cancellation alert** whose `targets` include the row cancels every occurrence whose window **overlaps** the alert's window at all, so a cancellation posted after a pantry opened closes it for the rest of that window. It also closes an `always` row while the alert's window lasts (`closed`, `next: null`, `cancelled_now: true`). Draft, expired-by-status, and retracted alerts do nothing.
- Look ahead 120 days.

## Open now

| Row | Result |
|---|---|
| status is not `active` | `not_listed` |
| availability `always` | `open` (unless a cancellation covers now; see above) |
| availability `call_first` | `call_first` |
| availability `unknown`, or `scheduled` with no valid schedules | `unknown` — **never rendered as open** |
| inside a window, 30+ minutes left | `open` + `closes_at`, `minutes_left` |
| inside a window, under 30 minutes left | `closes_soon` |
| otherwise | `closed` + `next` (or `next: null`), and `cancelled_now: true` if a cancelled window would have been open |

A window is open from `opens_at` inclusive to `closes_at` exclusive.

## Badge (freshness)

Computed on the device from dated facts. **No timers** (DECISIONS 2026-09-19): the wording changes only when people report something, never because time passed. Every badge shows its date, so a reader can judge "checked in September" for themselves. First match wins:

1. `archived` — status archived.
2. `reported_closed` — 2+ open closed/moved reports (counted per phone, not per kind), and no confirm dated **after** the latest one. A report with no date still counts.
3. `reported_once` — exactly 1 such report. A same-day confirm does not outweigh a report.
4. `confirmed` — a confirm exists (any age). The key carries the method (`badge.confirmed.phone` vs `badge.confirmed.community_confirm`): a tap is not a phone call. Shows how many days ago.
5. `entry_checked` — checked when added (any age). Shows the date.
6. `source_listed` — never checked by us, on a publisher's list with a known edit date. Names the list and its date and claims nothing else.
7. `never_checked` — no person has checked it and the list has no date. Being present in a source is not verification.

Dates are calendar days on a Detroit calendar: a timestamp of `2026-09-20T01:30Z` is Sept 19. Tiers exist as sort keys but only "reported closed" affects ranking. No number is ever shown.

## Ranking

1. **Eligibility**: active rows, category match (exact or prefix), every requested flag present.
2. **Distance band**: 0–1 mi, 1–3 mi, 3+ mi. With no location, or for a row with no coordinates (hotlines, DV), band 0.
3. **Reported-closed rows go last in their band** (still visible).
4. **Open key.** Mode `now`: open → closes soon → opens later today → call first → opens another day → no upcoming time → unknown. Mode `week`: open now or any time in the next 7 days → call first → nothing this week → unknown.
5. **Distance**, then **id** for a stable order.

Distance comes before openness because many users have no car. There is no freshness key: time since a check never reorders a list; only reports do.

## Search

Search runs on the device. The typed text is never stored, sent, or put in a URL.

1. **Normalize** both sides: lowercase, decompose (NFD), remove every combining mark (Unicode category M). Letters and digits of any script (categories L and N) are kept. Apostrophes (`'` `’` `‘` `ʼ`) inside a word are removed, joining it ("Mary's" → `marys`). A dot between two single letters is removed, joining them ("U.S.A." → `usa`). Anything else that is not a letter or digit (including any other dot) separates words.
2. **Tokens** are the words of the query. A query with fewer than 2 letters or digits in total (counted in Unicode code points) matches nothing.
3. A row **matches** when every token is the start of a word in the searched text. Match tier: 0 = name only; 1 = name + organization; 2 = name, organization, what, who, street, ZIP.
4. **Order**: match tier, then the one ranking rule above. Only active rows; archived rows (≤ 90 days) are matched by name by the client and shown apart, labeled.

## Bundle age

How old the phone's copy of the list is. It says nothing about any listing: it tells the person their phone may be missing recent reports, and the app shows it on every list and listing.

| Condition | Stage |
|---|---|
| copy ≤ 72 h old | `fresh` |
| > 72 h | `aging` — "Your phone last got updates N days ago. Call before you go." |
| > 30 days, or the build date can't be read | `old` — the same note, stronger |
| the published index says `retired: true` | `retired` — "This list is no longer being updated. Call 211." No report buttons. |

Only a person retires the directory, by publishing a final list marked retired. No timer and no heartbeat ever does.
