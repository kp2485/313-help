# Query spec — one spec, every client

The web app and pipeline import `packages/query`. iOS (and later Android) re-implement it. All of them must pass every case in `schema/fixtures/*.json`. If the spec and a fixture disagree, the fixture wins and the spec gets fixed.

## Time

- Everything is evaluated on a **floating America/Detroit wall clock**. Convert the current instant to Detroit wall time once; compare wall time to wall time. Schedule dates (`YYYY-MM-DD`) and times (`HH:MM`, 24h) are wall-clock values with no offset.
- This is why daylight saving cannot break open-now: a door sign that says "Fridays 1:30" means 1:30 on the wall in July and in December.
- If the device clock is earlier than the bundle's `generated_at`, the device clock is wrong; use `generated_at` as now.

## Occurrences

- A schedule is HSDS RRULE fields: `freq`, `interval`, `byday` (`MO,WE`, `2TU`, `-1FR`), `bymonthday`, `dtstart`, `until`, plus `valid_from` / `valid_to`, `opens_at`, `closes_at`.
- No `freq` means a single date (`dtstart`).
- `closes_at <= opens_at` means the window runs past midnight into the next day. The occurrence belongs to the date it **opens**.
- A row may have several schedules; their occurrences merge in time order.
- HSDS has no exception dates. A **published cancellation alert** whose `targets` include the row suppresses every occurrence that *opens* inside the alert's window. Draft, expired-by-status, and retracted alerts do nothing.
- Look ahead 120 days.

## Open now

| Row | Result |
|---|---|
| status is not `active` | `not_listed` |
| availability `always` | `open` |
| availability `call_first` | `call_first` |
| availability `unknown`, or `scheduled` with no schedules | `unknown` — **never rendered as open** |
| inside a window, 30+ minutes left | `open` + `closes_at`, `minutes_left` |
| inside a window, under 30 minutes left | `closes_soon` |
| otherwise | `closed` + `next` (or `next: null`), and `cancelled_now: true` if a cancelled window would have been open |

A window is open from `opens_at` inclusive to `closes_at` exclusive.

## Badge (freshness)

Computed on the device from dated facts. First match wins:

1. `archived` — status archived.
2. `reported_closed` — 2+ open closed/moved reports, and no confirm dated **after** the latest one.
3. `reported_once` — exactly 1 such report. A same-day confirm does not outweigh a report.
4. `confirmed` — `last_confirmed_at` within `cadence_days`. String key carries the method (`badge.confirmed.phone` vs `badge.confirmed.community_confirm`): a tap is not a phone call.
5. `entry_checked` — `checked_at_entry` within `cadence_days`.
6. `unconfirmed` — has a date, but past its window.
7. `source_listed` — never checked by us, but it is on a publisher's list that the publisher edited within 90 days. The badge names the list and its date and claims nothing else. Same sort tier as `unconfirmed`.
8. `never_checked` — no person has ever checked it and the source is old or undated. Being present in a source is not verification.

Tiers in that freshness order (confirmed = 0) are sort keys only. No number is ever shown.

## Ranking

1. **Eligibility**: active rows, category match (exact or prefix), every requested flag present.
2. **Distance band**: 0–1 mi, 1–3 mi, 3+ mi. With no location, or for a row with no coordinates (hotlines, DV), band 0.
3. **Reported-closed rows go last in their band** (still visible).
4. **Open key.** Mode `now`: open → closes soon → opens later today → call first → opens another day → no upcoming time → unknown. Mode `week`: open now or any time in the next 7 days → call first → nothing this week → unknown.
5. **Freshness tier.**
6. **Distance**, then **id** for a stable order.

Distance comes before openness and freshness because many users have no car.

## Search

Search runs on the device. The typed text is never stored, sent, or put in a URL.

1. **Normalize** both sides: remove accents, lowercase, turn anything that is not a letter or digit into a space.
2. **Tokens** are the words of the query. A query with fewer than 2 letters or digits in total matches nothing.
3. A row **matches** when every token is the start of a word in the searched text. Match tier: 0 = name only; 1 = name + organization; 2 = name, organization, what, who, street, ZIP.
4. **Order**: match tier, then the one ranking rule above. Only active rows; archived rows (≤ 90 days) are matched by name by the client and shown apart, labeled.

## Bundle age

| Condition | Stage |
|---|---|
| bundle ≤ 72 h old | `fresh` |
| > 72 h | `aging` — banner; "alerts may be missing" |
| > 30 days | `old` — persistent warning |
| > 120 days, **or** `heartbeat` > 120 days old | `sunset` (docs/12) |

`heartbeat` only advances by human action, so an automated job cannot keep an abandoned directory looking alive.
