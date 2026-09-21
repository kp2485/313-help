# Query spec — one spec, every client

The web app and pipeline import `packages/query`. iOS (and later Android) re-implement it. All of them must pass every case in `schema/fixtures/*.json`. If the spec and a fixture disagree, the fixture wins and the spec gets fixed.

## Time

- Everything is evaluated on a **floating America/Detroit wall clock**. Convert the current instant to Detroit wall time once; compare wall time to wall time. Schedule dates (`YYYY-MM-DD`) and times (`HH:MM`, 24h) are wall-clock values with no offset.
- This is why daylight saving cannot break open-now: a door sign that says "Fridays 1:30" means 1:30 on the wall in July and in December.
- If the device clock is earlier than the bundle's `generated_at`, the device clock is wrong; use `generated_at` as now.
- The web and the iPhone ask the platform's time-zone database for Detroit wall time (`Intl.DateTimeFormat`, `Foundation.Calendar`), which is right for all of history. Android has no such database below API 26 without a dependency, so `apps/android/query/src/main/kotlin/org/help313/query/Time.kt` writes the United States rule out by hand: **it is correct from 1987 and clamps anything earlier to Eastern Standard Time the year round.** The three agree on every date this app handles and can only differ before 1987, which is why no fixture pins a pre-1987 instant; Android's `FixtureTest.theZoneRuleIsClampedBefore1987` pins the clamp on its own.

## Occurrences

- A schedule is HSDS RRULE fields: `freq`, `interval`, `byday` (`MO,WE`, `2TU`, `-1FR`), `bymonthday`, `dtstart`, `until`, plus `valid_from` / `valid_to`, `opens_at`, `closes_at`.
- No `freq` means a single date (`dtstart`).
- **Valid shapes only.** Dates are exactly `YYYY-MM-DD` and must exist; times are exactly `HH:MM`, with `24:00` the latest; `freq` is one of DAILY, WEEKLY, MONTHLY, YEARLY; `interval` is a whole number of 1 or more; `byday` goes only with WEEKLY or MONTHLY, and a numbered day (`2TU`, `-1FR`, 1 to 5) only with MONTHLY; `bymonthday` (whole numbers, 1 to 31 or -1 to -31) only with MONTHLY. The pipeline refuses anything else. A client that meets one anyway skips that schedule; if none are left, the row is `unknown`. It never guesses.
- `closes_at <= opens_at` means the window runs past midnight into the next day. The occurrence belongs to the date it **opens**.
- A row may have several schedules; their occurrences merge in time order.
- HSDS has no exception dates. A **published cancellation alert** whose `targets` include the row cancels every occurrence whose window **overlaps** the alert's window at all, so a cancellation posted after a pantry opened closes it for the rest of that window. It also closes an `always` row while the alert's window lasts (`closed`, `next: null`, `cancelled_now: true`). Draft, expired-by-status, and retracted alerts do nothing.
- Look ahead 120 days.

## Holidays

We do not know any place's holiday hours. A clinic's own notice says "Closed Thanksgiving and Christmas" in prose nobody has turned into a schedule, and no source hands us a place's holiday calendar. So on a holiday a schedule-derived "open" is not knowledge, it is a guess — and unknown is never rendered as open (docs/01). On a holiday the rules hold a `scheduled` row's own hours up as **usual** hours and never claim the door is open.

A holiday is a **date rule computed on the device**, not a list the bundle carries: a phone with a three-month-old copy still knows that 25 December is Christmas. It is evaluated on the Detroit wall-clock date.

The eleven United States federal holidays:

| Holiday | Rule |
|---|---|
| New Year's Day | 1 January |
| Martin Luther King Jr. Day | 3rd Monday in January |
| Washington's Birthday | 3rd Monday in February |
| Memorial Day | last Monday in May |
| Juneteenth | 19 June |
| Independence Day | 4 July |
| Labor Day | 1st Monday in September |
| Columbus Day / Indigenous Peoples' Day | 2nd Monday in October |
| Veterans Day | 11 November |
| Thanksgiving | 4th Thursday in November |
| Christmas Day | 25 December |

Plus the **observed** day when one of the five fixed-date holidays falls at a weekend: Saturday → the Friday before, Sunday → the Monday after. Both days count. 25 December 2027 is a Saturday, so Friday the 24th (when the counters are shut) and Christmas Day itself are both holidays. 1 January 2028 is a Saturday, so Friday 31 December 2027 is a holiday. 4 July 2027 is a Sunday, so Monday the 5th is too.

**Not** holidays: the day after Thanksgiving, Christmas Eve, and every other day some people take off. They are not federal holidays and Detroit is largely open on them — pantries, clinics and urgent cares keep their hours. Calling a day a holiday costs a person the hours we do know, so the list stops at the days where nearly every notice in `data/seed/` says the door is locked. A service that really shuts on Black Friday is a `valid_to`/`valid_from` gap or an alert on that one row, not a new rule for all 184 listings.

Nothing else moves. `interval` counting, `byday` and the 120-day lookahead never skip a holiday: a holiday changes what we are willing to **say**, not which dates a rule generates.

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
| any of those three that would claim open on a holiday | `holiday` + `usual_hours` — **never rendered as open** (below) |

A window is open from `opens_at` inclusive to `closes_at` exclusive.

### Holiday

For an `active`, `scheduled` row **without** the `open_holidays` flag, compute the result as above, then:

- `open` or `closes_soon` whose current window **opens on** a holiday date → `holiday`, carrying that window's times as `usual_hours` (`opens_at`, `closes_at`).
- `closed` whose `next` is today, when today is a holiday ("opens later today") → `holiday`, carrying `next`'s times as `usual_hours`.

A `holiday` result never carries `closes_at` or `minutes_left`: there is nothing to count down to. It is not a kind of open, and no screen may colour it as one.

The rule follows the day a window **opens**, not the day it ends. A warming centre listed 22:00–02:00 stays `open` through the small hours of Christmas morning, because that window opened on Christmas Eve, which is an ordinary evening; the window that opens at 22:00 on Christmas Day is a `holiday`.

A `closed` row whose next time is a **future** holiday still says "Closed now. Next: Thursday 9am". That date is a fact about the schedule, not a claim about that day, and the "Next times" list is where the holiday shows: every occurrence that opens on a holiday date is flagged `holiday`, and screens label it "Holiday. Call first." Occurrences are never dropped for being on a holiday — reports and rules label rows, they never hide them.

`always` is untouched: `always` means the owner's page says always (an emergency room, a crisis line), and a 24-hour door is a 24-hour door on Christmas. `call_first` and `unknown` are untouched too; they already tell a person to call.

**The escape hatch.** A row carrying the flag `open_holidays` (a `flags` value in `data/seed/resources.csv`) skips all of this and is computed as though no day were a holiday. A steward sets it only when the owner's own page says the place is open on holidays. It is an ordinary flag, so it rides from the CSV through normalize into the bundle with no new field anywhere.

## Badge (freshness)

Computed on the device from dated facts. **No timers** (DECISIONS 2026-09-19): the wording changes only when people report something, never because time passed. Every badge shows its date, so a reader can judge "checked in September" for themselves. First match wins:

1. `archived` — status archived.
2. `reported_closed` — 2+ open closed/moved reports (counted per phone, not per kind) that still stand. A closed report stands until as many **different phones** say "still open" after the latest closed report (`open_after_closed`) as said closed, or until a person's phone check (`last_confirm_method: phone`) dated a later day. A newer confirm date alone clears nothing: one tap can't undo real reports (review 18, Kyle 2026-09-19). A report with no date still counts.
3. `reported_once` — exactly 1 such report that still stands. A phone check the same day does not outweigh it.
4. `confirmed` — a confirm exists (any age). The key carries the method (`badge.confirmed.phone` vs `badge.confirmed.community_confirm`): a tap is not a phone call. Shows how many days ago.
5. `entry_checked` — checked when added (any age). Shows the date.
6. `source_listed` — never checked by us, on a publisher's list with a known edit date. Names the list and its date and claims nothing else.
7. `never_checked` — no person has checked it and the list has no date. Being present in a source is not verification.

Dates are calendar days on a Detroit calendar: a timestamp of `2026-09-20T01:30Z` is Sept 19. Tiers exist as sort keys but only "reported closed" affects ranking. No number is ever shown.

## Ranking

1. **Eligibility**: active rows, category match (exact or prefix), every requested flag present.
2. **Preferred flags** (only when the query asks, e.g. "I'm under 25" prefers `youth`): rows carrying every preferred flag come first. Nothing is left out.
3. **Distance band**: 0–1 mi, 1–3 mi, 3+ mi. With no location, or for a row with no coordinates (hotlines, DV), band 0.
4. **Reported-closed rows go last in their band** (still visible).
5. **Open key.** Mode `now`: open → closes soon → opens later today → call first (and `holiday`, which ranks exactly as `call_first` does) → opens another day → no upcoming time → unknown. Mode `week`: open now or any time in the next 7 days → call first (and `holiday`) → nothing this week → unknown. A `holiday` row never sorts above a row that is known to be open.
6. **Distance**, then **id** for a stable order.

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
