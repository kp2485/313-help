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
3. **Distance band**: 0–1 mi, 1–3 mi, 3+ mi. With no location, or for a row with no coordinates (hotlines), band 0. A domestic-violence row gets its band from its **service area** instead; see below.
4. **Wide-area key** (domestic violence only): a row whose service area is `statewide` or `national` sorts after every row with a local area. 0 for everything else, so it never moves an ordinary list.
5. **Reported-closed rows go last in their band** (still visible).
6. **Open key.** Mode `now`: open → closes soon → opens later today → call first (and `holiday`, which ranks exactly as `call_first` does) → opens another day → no upcoming time → unknown. Mode `week`: open now or any time in the next 7 days → call first (and `holiday`) → nothing this week → unknown. A `holiday` row never sorts above a row that is known to be open.
7. **Distance**, then **id** for a stable order. A domestic-violence row's distance is always `null` and contributes 0 here, so two rows in one area are separated only by the open key and their ids — never by anything derived from a location.

Distance comes before openness because many users have no car. There is no freshness key: time since a check never reorders a list; only reports do.

### Domestic-violence rows: service area, never a place

A `shelter.dv` row (and any sub-category of it) carries **no `address`, no `lat`/`lon`, and no `zip`** — the bundle is public and signed, so anything in it is published, and a shelter's address can get someone killed. The rule holds even when the shelter publishes its own address (DECISIONS 2026-09-20). A steward may instead record `service_area`: one value from a small closed list of **coarse public areas** — a whole city or larger — that the owner's own page names as where it serves or is based.

| `service_area` | Reference point (public, fixed, about the area) |
|---|---|
| `detroit` | Detroit City Hall (Coleman A. Young Municipal Center) |
| `dearborn` | Dearborn Administrative Center |
| `hamtramck` | Hamtramck City Hall |
| `highland_park` | Highland Park City Hall |
| `wayne_county` | the US Census Bureau's internal point for Wayne County (42.2847, −83.2620; a hand-picked "geographic centre" until 2026-09-24) |
| `wayne_county_west` | Westland City Hall, the largest city of western Wayne County |
| `wayne_county_downriver` | Taylor City Hall, the largest city of the Downriver communities |
| `oakland_county` | the US Census Bureau's internal point for Oakland County (42.6605, −83.3842; 2026-09-24) |
| `macomb_county` | the US Census Bureau's internal point for Macomb County (42.6716, −82.9115; 2026-09-24) |
| every other city and township in the area (71 ids, below) | the US Census Bureau's internal point for that place (`data/ingested/region.json`; 2026-09-24) |
| `statewide` | none — ranks after every local area |
| `national` | none — ranks after every local area |

The 71 place ids are the place's own id without `city_`: `allen_park`, `auburn_hills`, `berkley`, `birmingham`, `bloomfield_hills`, `bloomfield_township`, `center_line`, `chesterfield_township`, `clawson`, `clinton_township`, `commerce_township`, `dearborn_heights`, `eastpointe`, `ecorse`, `farmington`, `farmington_hills`, `ferndale`, `fraser`, `garden_city`, `grosse_pointe`, `grosse_pointe_farms`, `grosse_pointe_park`, `grosse_pointe_shores`, `grosse_pointe_woods`, `harper_woods`, `harrison_township`, `hazel_park`, `huntington_woods`, `inkster`, `lathrup_village`, `lincoln_park`, `livonia`, `macomb_township`, `madison_heights`, `melvindale`, `mount_clemens`, `new_baltimore`, `novi`, `oak_park`, `orion_township`, `pleasant_ridge`, `pontiac`, `redford_township`, `river_rouge`, `riverview`, `rochester`, `rochester_hills`, `romulus`, `roseville`, `royal_oak`, `royal_oak_township`, `shelby_township`, `southfield`, `southfield_township`, `southgate`, `st_clair_shores`, `sterling_heights`, `sylvan_lake`, `taylor`, `trenton`, `troy`, `utica`, `walled_lake`, `warren`, `waterford_township`, `wayne`, `west_bloomfield_township`, `westland`, `white_lake_township`, `wixom`, `wyandotte`.

**Not only domestic violence (2026-09-24, Kyle's choice (a)).** `servesByArea(row)` is true for every `shelter.dv` row
and for **any row that names a `service_area` and has no coordinate** — a phone-only local service (a ride program,
Meals on Wheels, nurse home visits) or a place the geocoder could not put on the map. Such a row is banded from its
area's reference point exactly as below, its `miles` is `null`, and a screen says "Serves {area}" (`servesAreaKey`).
A row with a coordinate ranks by the coordinate and may not name an area as well (the build refuses it; `pnpm geocode`
drops the area when it places a row). A non-DV row with no coordinate and no area still ranks in band 0, as a
hotline does. Held by `13-dv-service-area.json`.

The table lives in **code** (`packages/query/src/areas.ts`, mirrored in `Areas.swift` and `Areas.kt`), never in a row. Every shelter serving one area therefore shares one identical point, and that point is a city hall or a county's Census internal point, never a shelter. No ZIP codes and no neighbourhoods: an area must be a whole city or bigger.

**Banding.** With a location (shared or typed as a ZIP), a `shelter.dv` row with a local `service_area` gets a **coarse** band from the distance between the person and that area's reference point: **0–3 mi → 0, 3–10 mi → 1, over 10 mi → 2**. `statewide` and `national` get band 2 and the wide-area key 1. Without a location, and for a row with no `service_area`, the band is 0 and the wide-area key is 0 — exactly as today.

**`miles` is always `null`** on a ranked domestic-violence row, whatever its area. No client ever shows a distance, a map, a dot, directions, a bus link or a "near you" claim for one. The screen shows the area in words ("Serves Detroit"), a Call button, and one sentence: the shelter does not share its address; call and they will say where to go.

**Why this leaks nothing.** Every input to the band is public: the person's own location, which never leaves the device, and a city hall's coordinate, which is in code and identical for every shelter in that area. The band is a function of the area alone, so two shelters that serve the same area are always in the same band and are separated only by their open key and their ids. Ordering can tell a reader which area a row serves — which the screen says in words anyway — and nothing finer.

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

---

# Directions

Everything below runs on the device, on files the app already downloads and already checks against the signed
index. **No origin, no destination and no query ever leaves the phone** (DECISIONS 2026-09-22). There are no
driving directions: the City's Roads layer publishes no one-way field, so we could not give them honestly.

Three rules bind every client and are not negotiable in a port:

1. **Never real-time.** We hold no vehicle positions, no departure times and no timetable. A route's published
   headway is the only time-like fact we carry.
2. **Never "safe" or "accessible".** We have no sidewalk, curb-ramp or lighting data at all. A client may say
   what we used — streets, and the City's own High Injury Network — and nothing more.
3. **We route to the street outside, not to the door.** Every result carries `startOffMetres` /
   `endOffMetres` (`start_off_metres` / `end_off_metres` on an itinerary), and the screen says so.

## Streets graph

`packages/query/src/streets.ts`. Mirrored as `Streets.swift` and `Streets.kt`.

### Projection

One fixed reference latitude for the whole service area, so three clients get the same metre value for the
same two points:

| constant | value |
|---|---|
| `REF_LAT` | 42.35 |
| `M_PER_DEG_LAT` | 111132 |
| `M_PER_DEG_LON` | `111320 × cos(REF_LAT)` |
| `STREET_SCALE` | 1e5 (the packing every map file uses) |

### Build constants

| constant | value | what it does |
|---|---|---|
| `CELL_M` | 200 | grid cell the crossing search buckets segments into |
| `NODE_TOL_M` | 1 | two points this close are one node |
| `SNAP_M` | 12 | a dangling polyline end is pulled onto a line this close |
| `MIN_EDGE_M` | 0.01 | shorter than this is not an edge |
| `STREET_GRAPH_VERSION` | 1 | part of the cache key; bump it when any constant here changes |

### What is in the graph

Only **walkable, named** lines: `isWalkable(s) = s.cls !== 0 && s.name !== ''`. Class 0 is freeway and ramp,
which nobody walks; an unnamed line is one we could not describe in an instruction, so we never route on it
(95.6% of the polylines are named).

**Grade separation, and the rule for it.** The map has no bridge or tunnel field, so a crossing of two lines is
assumed to be a junction. `mayJoin(clsA, clsB)` returns false when **either** line is class 0, so no
freeway-over-street or street-over-freeway crossing can ever become a junction — and class 0 is not in the
walking graph at all. **Residual error, stated:** a *street* bridge over another street — the rail viaducts,
the Rouge crossings, a service drive over a sunken street — still becomes a junction. The real-data test
`packages/query/test/streets-real.test.ts` counts them; it is a known limit, not a silent one.

### Steps

1. Decode every street file (`decodeStreets`) and project to metres. Order is the file's order.
2. Bucket every segment into the `CELL_M` grid.
3. **Crossings**: inside each cell, test each pair of segments from different polylines for a proper
   intersection; both get a split at the crossing point. Order of discovery does not matter — splits are sorted
   per polyline by `(segment index, t)` before edges are made.
4. **Dangling ends**: for each polyline end, find the nearest segment of another polyline within `SNAP_M` and
   split *that* line at our endpoint (the other line is pulled to us, never the reverse).
5. **Nodes**: assigned in polyline order, deduped within `NODE_TOL_M`. Two clients therefore build the same
   node numbering from the same files.
6. **Edges**: consecutive nodes along each polyline, with the metre length and the polyline's way (name, class,
   safety byte). Undirected: each edge appears once from each end, in CSR (`head`, `edgeTo`, `edgeLen`,
   `edgeWay`), with `twinHalf` pointing at the same edge walked the other way.

**An edge is a piece of a real street, not a straight chord between two junctions.** Each way keeps its own
vertices (`wayPts`, flat metres) and each edge records where it starts and ends along that way
(`edgeSegA`/`edgeTA` → `edgeSegB`/`edgeTB`). `edgeGeometry(g, half)` returns the vertices actually walked, in
travel order, with the two ends forced to the node coordinates — which also hides the up-to-12 m step a
snapped dangling end would otherwise draw. `sliceByFraction(pts, t0, t1)` cuts a part of that list by fraction
of its own length, which is how a route that starts or ends part-way along an edge is drawn. Snapping measures
against this geometry too, so `EdgePoint.t` is a fraction of the edge's **length**, not of a chord.

### The safety byte

One byte per polyline, carried in the street file as a top-level `safety: number[]` **parallel to `roads`**
(same length, same order). It is additive: a client that does not know the key ignores it, and a bundle built
before 2026-09-22 has none. Source: the City of Detroit Roads layer — the same layer and the same licence the
street geometry already comes from.

| bits | field | values |
|---|---|---|
| 0 | `HIN_2021` | on the City's High Injury Network |
| 1 | `HighSeverity` | the City's high-severity marking |
| 2–3 | `LANES` | 0 unknown, 1 = 1–2, 2 = 3–4, 3 = 5 or more |
| 4–5 | `POSTED_SPE` | 0 unknown, 1 = ≤ 25, 2 = 30–35, 3 = 40 or more |
| 6–7 | `AADT` | 0 unknown, 1 = < 5,000, 2 = 5,000–20,000, 3 = > 20,000 |

A byte of 0 means "this file told us nothing". `StreetGraph.hasSafety` is true only when a source file actually
carried the array, which is what decides between the two penalty tables below.

### Caching

`cachedStreetGraph(sha256, build)`. The key is `${STREET_GRAPH_VERSION}:${sha256}` where the hash is the map
file's own SHA-256 — the one already in the signed index. Nothing about a person is in the key. Two graphs are
kept (`STREET_GRAPH_CACHE_SIZE`).

**A trip's window is never cached** (2026-09-24). Its streets are the streets round the two points a person asked
about, so a cache of window graphs would be a record of their last trips, and the directions screen leaves no
trace. It does not need one: the whole area is 108,820 nodes and ~1 s to build on a laptop (5–10 s on a cheap
phone), which is why no client builds it for a trip; a trip's window is 2,000–3,500 nodes and 15–50 ms, built for
the one plan and dropped with it.

### Signatures

```ts
decodeStreets(file: PackedStreets): Street[]
buildStreetGraph(files: PackedStreets[], key?: string): StreetGraph
cachedStreetGraph(sha256: string, build: () => StreetGraph): StreetGraph
clearStreetGraphCache(): void
nearestEdgePoint(g: StreetGraph, pt: {lat, lon}, maxMetres = 2000): EdgePoint | null
mayJoin(clsA: number, clsB: number): boolean
isWalkable(s: {cls: number, name: string}): boolean
safetyByte({hin?, highSeverity?, lanes?, speed?, aadt?}): number
safetyHin(b) | safetyHighSeverity(b) | safetyLanes(b) | safetySpeed(b) | safetyAadt(b)
```

`PackedStreets = { origin: [lon, lat], names: string[], roads: [cls, nameIdx, encoded][], safety?: number[] }`
— exactly the shape of `map/base.json` and of each cell inside `map/streets.json`.

**How a client loads it.** `map/base.json` is one `PackedStreets`; `map/streets.json` is
`{ grid, cells: { "c_X_Y": PackedStreets } }`. Pass the base file and every cell the client holds, in a stable
order (the base first, then the cell keys sorted), and use the index's own SHA-256 of those files as the cache
key. Both files are already fetched, checksum-verified and kept on the device for the map, so directions cost
no new bytes at all.

`EdgePoint = { half, from, to, t, x, y, offMetres }`: the half-edge, its two nodes, how far along, the point in
metres, and how far off the street the asked-for point was.

`StreetGraph.stats = { polylines, skipped, crossings, snapped, components, largestComponent, deadEnds, buildMs }`
— numbers for tests, never for a screen.

## Walking directions

`packages/query/src/walk.ts`.

### Cost

`cost(edge) = metres × (1 + penalty(way))`, and A* uses straight-line distance as its heuristic, which stays
admissible because the penalty is never negative.

**When the file carries safety bytes** (`hasSafety`), the penalty is the sum, capped at `SAFETY_PENALTY.cap`:

| term | value |
|---|---|
| `hin` | 0.35 |
| `high_severity` | 0.20 |
| `lanes` (by bucket 0–3) | 0, 0, 0.10, 0.20 |
| `speed` (by bucket 0–3) | 0, 0, 0.10, 0.25 |
| `aadt` (by bucket 0–3) | 0, 0, 0.05, 0.15 |
| `cap` | 0.60 |

A cap of 0.60 says plainly what we are willing to do: walk up to 60% further to stay off the streets the City
itself marks as where people get hurt. That is the City's judgement, not ours.

**When it does not** (an older bundle, or an ingest the City refused), the penalty is by street class alone:
`CLASS_PENALTY = [0, 0.15, 0.10, 0.05, 0]` for classes 0–4.

**A turn costs `TURN_PENALTY_M = 40` metres of walking** when the street's name changes. On Detroit's grid
every route between two corners is exactly the same length, so with no turn penalty the tie is broken
arbitrarily and a person is handed a staircase of fifteen turns instead of three streets — measured: the
study's sample route went from 14 steps to 8. It never changes the distance that is **reported**; it decides
which of several equally long routes is the one described.

### Search

The state is a **half-edge** — "walking along this edge, in this direction" — not a node, because that is what
makes a turn cost anything. Both ends are snapped with `nearestEdgePoint`; state `2 × edgeCount` is the virtual
start and `2 × edgeCount + 1` the goal. From the start, both directions of the start edge are entered, and the
goal is entered directly when both ends sit on one edge. Turning round in the middle of a street
(`twinHalf`) is not allowed. The heuristic is the straight line from where a state leaves you standing to the
goal, which stays admissible because no cost is negative.

Returns `null` when either end is further than `maxSnapMetres` (default 2000) from any street, or when the two
ends are in different pieces of the graph (0.5% of nodes are).

### Steps and wording

A step is a fact, never a sentence: `{ street, bearing, turn, metres }`. Consecutive edges with the same street
name are one step.

- `bearing`: eight winds, each 45° wide — `north, northeast, east, southeast, south, southwest, west,
  northwest` — from the direction of the step's first edge.
- `turn`: from the signed change of heading, positive to the right. `< 20°` `straight`; `< 45°`
  `slight_left`/`slight_right`; `≤ 135°` `left`/`right`; `≤ 160°` `sharp_left`/`sharp_right`; more `around`.
  The **first** step's turn is `null`.

The client writes the sentence ("Walk north on Woodward Ave for 0.3 mi; turn right onto Warren Ave"). The rules
never produce prose, and no client may add a word about safety, sidewalks, lighting or accessibility.

### Signatures

```ts
walkRoute(g, from: {lat, lon}, to: {lat, lon}, opts?: { maxSnapMetres?: number }): WalkRoute | null
routeBetween(g, a: EdgePoint, b: EdgePoint, from?, to?): WalkRoute | null
metresBetween(p, q): number
bearingWord(dx, dy): Bearing
turnWord(deltaDeg): Turn
wayPenalty(g, way): number
WALK_M_PER_S = 1.33   WALK_M_PER_MIN = 80
```

`WalkRoute = { metres, straightMetres, seconds, steps, polyline, startOffMetres, endOffMetres, settled }`.
`polyline` is `[lon, lat]` from the snapped start to the snapped end — never to either door.

## Trip plans

`packages/query/src/transit-plan.ts`. Kyle, 2026-09-22: *"I want integrated walking and bus routes for the best
user experience."* So there is **one** entry point. Walking on its own is one of the candidates it ranks, and
every walking leg — to the stop, between two stops at a change, from the stop — is a real A* walk on the street
graph, so the walking distance and the drawn line are the streets a person actually walks.

```ts
buildTransitNetwork(layers: TransitLayer[]): TransitNetwork
plan(g: StreetGraph, net: TransitNetwork, from: {lat, lon}, to: {lat, lon}, opts?: PlanOptions): Itinerary[]
stopsNear(net, pt, metres = ACCESS_M): { stop: number; metres: number }[]
minutesRange(minutes: number): [number, number]
```

`TransitLayer = { stops: PackedPoints, routes: PackedRoutes, serves?: PackedServes }` — the bundle's own files:
`map/transit/<id>.json`, `<routes id>.net.json`, `<stops id>.net.json` (docs/MAP-STYLE.md §10). Stop and route
numbers in a `TransitNetwork` are global across every layer passed in, which is what makes a DDOT↔SMART change
possible: the two agencies never share a stop id.

### The cost model

Minutes, and only minutes. There is no clock in it.

| constant | value | meaning |
|---|---|---|
| `WALK_M_PER_MIN` | 80 | walking pace (1.33 m/s) |
| `BUS_M_PER_MIN` | 280 | an average city bus, stops included (~17 km/h). **An average, never a schedule.** |
| `WAIT_FRACTION_OF_HEADWAY` | 0.5 | boarding wait = half the published headway |
| `DEFAULT_WAIT_MIN` | 15 | the assumed wait where no headway is published (SMART, QLINE, People Mover) |
| `CHANGE_PENALTY_MIN` | 5 | the cost of changing vehicle, on top of wait and walk |
| `MAX_CHANGES` | 1 | **hard cap.** A plan with more changes and no times is a maze, not advice |
| `ACCESS_M` | 400 | straight-line radius for access stops (92% of listings have one) |
| `MAX_ACCESS_STOPS` | 8 | access stops considered at each end |
| `TRANSFER_WALK_M` | 150 | longest walk at a change |
| `MAX_WALK_ONLY_M` | 4828 | walking alone is always offered up to 3 miles |
| `MAX_PLANS` | 3 | how many itineraries come back |

**Where a change can happen.** At the same stop, or at any stop within `TRANSFER_WALK_M` on foot — which
covers the `interchanges` groups in a `.net.json` file (stops of two or more routes within 75 m) without
needing them, and covers a DDOT↔SMART change, which no interchange group can, because the two agencies never
share a stop id. The walk between the two stops is a routed walk like any other, so a "change" that the
streets cannot actually join is never offered.

`minutes = Σ walk metres ÷ 80 + Σ ride metres ÷ 280 + Σ wait + changes × 5`, where each ride's wait is
`headway ÷ 2` when the agency publishes one and `DEFAULT_WAIT_MIN` when it does not. Half a headway is what
makes a frequent route beat an infrequent one honestly: DDOT's 12-minute route costs 6 minutes of waiting, its
70-minute route costs 35.

Ride distance is the sum of straight-line distances between consecutive stops of the pattern — the owner's own
stop order, never a guess about direction.

### Ranking

`minutes`, then fewer changes, then less walking, then fewer ride stops, then the first route's id. One
itinerary per *sequence of routes*: the same routes never come back twice, and pure walking counts as `walk`.

### The wording contract

- The estimate leaves as a **range** and a client must show it as one: `range: [lo, hi]` from `minutesRange`,
  `lo = max(5, floor(0.85 m ÷ 5) × 5)`, `hi = ceil(1.25 m ÷ 5) × 5`, at least 5 minutes wide. "About 25 to 40
  minutes." **Never a single number, never a clock time, never an arrival time.**
- `headway_minutes` may only be read out as the agency's own sentence — "about every 45 minutes on a weekday" —
  and only when it is a number. `wait_minutes` is our assumption and is **not** shown as a time.
- No leg may be called safe, accessible, lit or step-free.
- The last walking leg ends at the street: the screen says "then about N m to the building" from
  `end_off_metres`.
- The owner's own trip planner stays on the screen beside ours, as the checked alternative.

### Shapes

```ts
WalkLeg = { kind: 'walk', metres, minutes, steps: WalkStep[], polyline, to_stop?, from_stop? }
RideLeg = { kind: 'ride', route_id, route_short, route_long, agency, headway_minutes: number | null,
            from_stop: {index, name}, to_stop: {index, name}, stops, metres, minutes, wait_minutes, polyline }
Itinerary = { legs: PlanLeg[], changes, walk_metres, ride_metres, minutes, range: [lo, hi],
              start_off_metres, end_off_metres }
```

`plan()` returns `[]` when nothing works — nothing within walking distance, and no route within one change. A
client says so; it never invents a leg.

## The trip window

`packages/query/src/window.ts`. Mirrored as `Window.swift` and `Window.kt`. Since the service area became every
city and township a DDOT or SMART bus stops in (2026-09-24), the street map is seven times the size it was. A phone
still holds the one street file, but it builds a graph only of **where the plan can walk**, and every such place is
known from the two ends and the bus network before a street is read:

| box | round | padding |
|---|---|---|
| the start, and the end | the point | `END_PAD_M` = `ACCESS_M` + 800 = 1,200 m |
| the walk between them, only when `metresBetween(from, to)` ≤ `MAX_WALK_ONLY_M` | the box of the two points | `WALK_PAD_M` = 800 m |
| each stop of `transferStops(net, from, to)` | the stop | `TRANSFER_PAD_M` = `TRANSFER_WALK_M` + 800 = 950 m |

Boxes are in degrees: `metres / M_PER_DEG_LAT` north and south, `metres / M_PER_DEG_LON` east and west. They come
in that order (start, end, the walk if any, then each transfer stop in ascending stop number).

**`transferStops`** runs `plan`'s step 2 without building anything: for each of the `MAX_ACCESS_STOPS` nearest
stops within `ACCESS_M` of the start, each route and pattern calling there that does **not** also call within
`ACCESS_M` of the end, and each later stop `x` on that pattern, every stop `y ≠ x` within `TRANSFER_WALK_M` of `x`
on a different route whose same pattern calls at a stop near the end after `y`. Both `x` and `y` are returned,
de-duplicated, ascending. There is no cap: it is a superset of every change `plan` can make.

**`windowFiles(base, cells, window)`** keeps every street whose **own** box touches a box of the window: first the
main-road file (`map/base.json`), then each cell of `map/streets.json` in ascending key order (JavaScript string
order — `cells` is that list, the one every client already builds from), each cut down to its touching streets in the file's own order (`roadsInBoxes`, which keeps `safety` in
step). A cell with none is dropped. A street's box is taken over its decoded vertices, inclusive at the edges. A
street is never chosen by the cell it is filed in: a cell holds a street by its midpoint, and a merged suburban
street can pass the start with its midpoint two cells away (measured: it moved a Southfield plan's first walk from
165 m to 367 m before this rule).

**The promise:** a plan on the window is the plan on the whole map, except where the whole map's best walk leaves
the padding. `16-trip-window.json` holds it on the fixture network; `packages/query/test/routing-real.test.ts`
holds it on the real area for five named trips and 24 pairs of listings.

## Fixtures for the directions

`schema/fixtures/14-streets-walk.json`, `15-trip-plans.json` and `16-trip-window.json`. Two new keys at the top of a fixture file:
`streets` (an array of `PackedStreets`, exactly the bundle's own shape) and `transit` (an array of
`TransitLayer`). Three new `fn` kinds, and a case may carry `from` / `to` (`{lat, lon}`) and `no_safety`
(build the graph as though the files carried no `safety` array — what an older bundle looks like).

| `fn` | what it compares |
|---|---|
| `streetGraph` | `{ nodes, edges, crossings, snapped, components, largest, dead_ends, skipped }`, exactly |
| `walk` | one string, or `null` when there is no route |
| `plan` | one string per itinerary, in rank order |
| `planWindow` | the same strings as `plan`, on the graph of `windowFiles(streets[0], streets[1…], tripWindow(…))` |
| `transferStops` | the stop numbers, ascending |
| `windowRoads` | `{ boxes, roads }`: how many boxes, and the name of every kept street in build order |

The strings, which are the contract between the three implementations:

```
walk   "<turn|start> <street> <bearing> <metres/10>  >  … | <metres/10> m, off <start>/<end>"
plan   "<leg> > <leg> > … [<lo>-<hi>]"
leg    "walk <metres/10>m"  |  "ride <route_id> <n>st every <headway>"  |  "ride <route_id> <n>st no-headway"
```

Metres are rounded to the nearest 10 so a port never fails on a last digit; the two off-street distances are
rounded to the metre, because they are what a person is told ("then about 40 m to the building").

**The native runners skip an `fn` they do not implement yet**, count it, and print the count
(`fixtures: N cases, 0 failed, 13 skipped`). That is what lets the rules land in TypeScript first and the Swift
and Kotlin ports follow in their own pull requests — but a skipped case is never a passed one, and the
TypeScript suite runs every case in every file.
