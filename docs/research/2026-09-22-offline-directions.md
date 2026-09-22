# Offline directions from the data we already carry

2026-09-22. Research only. Nothing here has been built and nothing has been decided. It answers Kyle's question:
*"Assess the viability of implementing offline directions utilizing all the transportation data we have integrated."*

**Method and honesty.** Every number below was measured on the committed files in this checkout
(`data/ingested/basemap/`, `data/ingested/transit/`, `data/bundle/v1/`), not estimated, unless the line says
*estimate*. Prototypes were written in TypeScript/JS in a scratch directory and are throwaway: nothing in the
repository changed except this file. One read-only request was made to a source the pipeline already reads —
the City's own Roads layer metadata (`?f=json`, field list only, honest user-agent) — to answer the one-way
question; no rows were downloaded. Timings are on this Mac (Node 25); a cheap Android phone is assumed to be
**5–10× slower**, and that multiplier is applied everywhere it matters.

---

## 0. Summary

**Walking directions are viable today, on the data already in the bundle, with no new source, no new bytes and
no new dependency.** The committed street map has no topology as shipped — 82% of its polyline ends touch
nothing — but it does not need any: noding it on the phone (splitting every polyline where it crosses another)
takes **~180 ms here, so roughly 1–2 s on a cheap phone, once**, and yields a graph of **23,863 nodes and 40,342
edges in which 99.5% of nodes are one connected piece**. A* on it answers a walking query in **0.04 ms median,
2.5 ms p90, 12.6 ms worst case** over 200 cross-city pairs. It fits in ~1.3 MB of typed arrays.

**Bus directions without timetables are also viable, and are better than they sound.** We carry 9,543 stops,
81 routes, the routes each stop serves, and each route's stops **in travel order**. That is enough to build a
stop graph (12,495 ride edges, 9,611 walk-transfer edges) and plan a real itinerary — *walk to this stop, ride
this line to that stop, change here, ride that line* — in **1 ms median, 15 ms worst**. It cannot say when a bus
comes. DDOT publishes a weekday base frequency for all 37 of its routes (12–70 min), so we can honestly say
"about every N minutes on a weekday" for DDOT; SMART publishes none in what we hold.

**Timetables are the one thing we do not have and should not chase for the hackathon.** DDOT's own GTFS is CC0
but `detroitmi.gov` blocks scripts; SMART's is reachable but its `stop_times.txt` alone is 12 MB, and a
timetable goes stale every quarter, which under our own freshness rule makes it a wrong fact on a phone that
has not synced.

**Recommended first step: walking directions (Option A) — because they cost zero new bundle bytes and zero new
sources, and they are the leg every single trip has.** Then bus itineraries without times (Option B).

---

## 1. What we have vs what routing needs

### 1.1 Walking — the street layer

`pipeline/src/ingest-basemap.ts` was written to **draw** a map, not to route on one. It reads the City's Roads
layer plus TIGER for the three neighbour cities, keeps `cls` (5 classes) and `name`, joins block-long pieces of
the same street end to end (`mergeChains`), simplifies with Douglas–Peucker (4 units ≈ 4 m in `base.json`,
1.5 units ≈ 1.5 m in the cells), and buckets the small streets into 58 grid cells by each piece's midpoint.
Measured on the committed files:

| | measured |
|---|---|
| polylines (`base.json` + 58 cells) | **8,227** (7,837 walkable; 390 are `cls 0` freeway) |
| vertices | 31,222 |
| total length | **5,882 km** |
| named | 7,864 of 8,227 (95.6%) |
| one-way | **absent** — the City layer publishes no one-way field (see 1.2) |
| sidewalks, crossings, curb ramps | **absent** — no source ingested carries them |
| pedestrian permission | **absent** — TIGER's walkway/path codes (S1500, S1710…) are deliberately dropped by `tigerClass`, which maps only S1100/S1200/S1400 |

**Topology as shipped: effectively none.** Snapping polyline *endpoints* together:

| snap radius | nodes | dangling (degree 1) | junctions (degree ≥ 3) | components | largest component |
|---|---|---|---|---|---|
| 1 m | 13,444 | 11,006 (82%) | 450 | 5,327 | 31 nodes (0.2%) |
| 5 m | 13,189 | 10,663 (81%) | 552 | 5,194 | 33 (0.3%) |
| 10 m | 13,087 | 10,483 (80%) | 561 | 5,112 | 33 (0.3%) |
| 20 m | 12,549 | 9,580 (76%) | 662 | 4,656 | 68 (0.5%) |

This is exactly what `mergeChains` is supposed to do: Woodward is **one** polyline from end to end, and every
cross street crosses it *mid-line*, not at a shared endpoint. The lines visually cross; they do not meet.

**But noding fixes it, cheaply.** Split every polyline at every place it geometrically crosses another:

| | walkable streets only (`cls > 0`) |
|---|---|
| crossings found | **21,057** in 55 ms |
| graph | **23,856 nodes, 35,655 edges**, built in a further 38 ms |
| components | 496; largest **95.3%** of nodes |
| dead ends | 27.8% of nodes |

The remaining 4.7% is mostly T-junctions that simplification or the cell split pulled apart by a metre or two.
Pulling each dangling end onto a line within **12 m** closes it:

| | with 12 m end-snap |
|---|---|
| crossings + snapped ends | 21,057 + 13,987 |
| graph | **23,863 nodes, 40,342 edges**, total build **183 ms** (122 + 61) |
| components | **45**; largest **99.5%** of nodes |
| dead ends | 7.8% |

So the answer to "do the street layers give topology" is: **no as shipped, yes after ~180 ms of on-device work
on files the app already downloads.** Freeways must be excluded — they are `cls 0` and not walkable — and
excluding them also removes most false crossings at overpasses (we have no grade-separation field, so every
crossing is treated as a junction; bridges over the Rouge and the rail viaducts are the honest failure case).

**Quality of the result, measured:**

| | measured |
|---|---|
| detour ratio (route ÷ straight line), 300 pairs 0.3–2.5 km apart | median **1.27**, p90 1.46, worst 3.77 |
| pairs with ratio > 1.6 (a sign of a missing link) | 7.0% |
| listings (531; 21 have no coordinate) vs nearest graph node | median **39 m**, p75 70 m, p90 108 m, p99 185 m, worst 231 m |
| listings more than 100 m from any street node | 57 of 510 |

A 1.27 median detour is normal for Detroit's grid. The 39 m median snap distance is the honest limit: we route
to **the street in front of the door**, never to the door, because we have no address-point layer and no
building footprints.

### 1.2 What the City layer has that we throw away

The Roads layer (`City_of_Detroit_Roads/FeatureServer/0`) publishes 120 fields; the ingest requests four
(`OBJECTID, RDNAME, NFC, FCC`). Fields that matter here, read from the layer's own metadata today:

- **`LANES`, `POSTED_SPE`** (posted speed), **`AADT`** (traffic volume) — how big and fast the street is.
- **`HIN_2021`** (the City's own High Injury Network), **`HighSeverity`** — the City's own marking of the
  streets where people get hurt.
- **`Bikelanes`**, **`Greenway`**, **`Saferoutes`**, **`connect10bus`** — per-street, from the City itself.
- **No one-way field, and no sidewalk field.** There is a `Bearing`, which is not the same thing.

This is the single most useful finding for the safety question in §2: the City already tells us which streets
are its High Injury Network, per street, in the layer we already read. Adding four or five `outFields` is a
one-line change, no new source, no new licence question. It costs roughly 1 byte per polyline in the bundle.

No one-way means **driving directions are out** and should stay out. We do not want to give them anyway.

### 1.3 Transit — what the bundle carries

Measured on `data/ingested/transit/*.json` and `*.net.json`:

| | DDOT | SMART | QLINE | People Mover |
|---|---|---|---|---|
| routes | 37 | 42 | 1 | 1 |
| stops | 5,098 | 4,412 | 20 | 13 |
| route lines | 87 | 86 | 1 (derived) | 1 |
| stops in travel order | 37 of 37 | 42 of 42 | 1 | 1 |
| `serves` (routes per stop) | 5,096 of 5,098 non-empty | 4,412 of 4,412 | yes | yes |
| interchanges (2+ routes within 75 m) | 606 | 803 | — | — |
| trunks (> 4 routes on one street) | 5 | 10 | — | — |
| **headway published** | **37 of 37** (12–70 min weekday base) | **0** | 0 | 0 |
| `frequent` | 3 | 4 (FAST) | — | — |
| **timetables** | **none** | **none** | none | none |
| hubs across systems (150 m) | 4, in `source.json` | | | |

**Stop order reliability.** SMART and the People Mover publish it (`stop_times.txt`, read for `stop_sequence`
only — the times are read and discarded). DDOT's does not exist in the City's layers, so `ddotNetwork` orders a
route's stops by distance along its line, keeping those within 60 m. Tested: **no DDOT or SMART route has a
pattern covering less than 35% of the stops that name it**. But the derived DDOT order conflates directions on
two-way streets — route 3 Grand River's two patterns hold 161 and 162 of the 169 stops that name it, i.e. both
sides of the street in each. For "which stop do I ride to" that is harmless (the two sides are 20 m apart); for
anything involving times or direction it is not.

**Transit coverage of our own listings** (510 with coordinates): a bus or rail stop within **400 m for 471
(92%)**, within 800 m for 507 (99%); median walk to the nearest stop **58 m**. Transit is not the constraint.

### 1.4 Bike and greenway

`bike_lanes.json`: **343 lines, 109 street names** — drawn, not routable, and they are pieces of streets we
already have, so they belong as an *attribute* on the street graph (or straight from the City's `Bikelanes`
field, §1.2), not as separate edges. `jlg_segments.json`: **52 segments but only 204 vertices in total**, most
of them two-point lines — a schematic of the greenway, far too coarse to route along. The greenway is a named
thing to route *to*, and its `cross_streets` are already computed; it is not a path network.

### 1.5 What is missing, by mode

| mode | have | missing |
|---|---|---|
| **walking** | street geometry, names, 5 classes, 99.5%-connected after on-device noding | sidewalks, crossings, curb ramps, grade separation (bridges/underpasses treated as junctions), address points, paths through parks and parking lots, the greenway at usable resolution |
| **transit, topology** | stops, routes, `serves`, stops in travel order, interchanges, hubs, DDOT headway | SMART headway, direction reliability on DDOT two-way streets |
| **transit, times** | **nothing** | `stop_times`, `frequencies`, `calendar`/`calendar_dates`, `transfers` — none ingested from any feed |
| **bike** | streets + bike-lane attribute available | lane type/protection, one-way, trail surface, the greenway at usable resolution |
| **driving** | — | one-way, turn restrictions. Out of scope and should stay out |

---

## 2. Options

Common to A, B and C: **everything runs on the phone.** No origin, no destination and no query ever leaves the
device — which is a real, statable advantage over Google Maps and the Transit app, and the only kind of
directions that fits CLAUDE.md.

### Option A — walking directions on our street network

| | |
|---|---|
| **data to add** | **none required.** `map/base.json` + `map/streets.json` are already downloaded on first map open, checksum-verified against the signed index and kept in IndexedDB (`apps/web/src/map.ts`, `HelpCore/MapData.swift`, the Android equivalent). Optional, cheap: 4–5 more `outFields` from the City Roads layer we already read (`LANES`, `POSTED_SPE`, `HIN_2021`, `Bikelanes`) — same source, same licence, ~1 byte per polyline |
| **licence / cadence** | unchanged; the basemap refreshes when a steward runs `pnpm ingest:basemap` |
| **bundle cost** | **0 KB.** A *prebuilt* graph would cost 965 KB raw / **353 KB gzipped**, more than the whole street map (128 KB gz) — so build it on the device instead |
| **algorithm** | grid-indexed segment noding → 12 m dangling-end snap → A* with a straight-line heuristic on a CSR (compressed-row) graph in typed arrays |
| **on-device cost** | graph **23,863 nodes / 40,342 edges ≈ 1.3 MB** typed arrays. Build **183 ms here → ~1–2 s on a cheap phone, once per map-file version**, then cached. Query **0.04 ms median / 0.17 ms p90 / 2.45 ms max** at walking distances; **12.6 ms worst** over 200 whole-city pairs → still well under 150 ms on a cheap phone |
| **implementation size** | ~250–350 lines per client, pure arithmetic, no library. Web/pipeline share it via `packages/query`; iOS and Android re-implement against shared fixtures, exactly as `DetroitQuery` already does |
| **UI** | the route drawn as a line on our own map (the drawing code already exists in all three clients), a turn list of named streets with distances, and a walking time at a stated speed |
| **honesty / risk** | see §2.5 |

**Prototype, run on the real committed basemap.** Home = Woodward & W Grand Blvd; destination = *Free food
boxes, Auntie Na's Village*, 12028 Yellowstone St (`sal_auntie_na_s_free_food_boxes`, a real row in
`category/food.json`):

```
  origin snapped 47 m to the street, destination 45 m
  6.66 km on foot (5.10 km straight line), ~83 min at 1.33 m/s
  A*: 999 nodes settled in 2.1 ms
  W Grand Blvd    3196 m
  Grand River Ave 1768 m
  Beverly Ct       272 m
  Cascade St      1065 m
  Burlingame St     83 m
  Yellowstone St   273 m
```

Six named streets, all real, ending on the pantry's own block. That is a usable turn list.

### Option B — A, plus which bus lines connect the two ends (topology only, no times)

| | |
|---|---|
| **data to add** | **none.** Everything needed is already in `map/transit/` and the `.net.json` files, downloaded per layer on demand and checksum-verified the same way |
| **bundle cost** | 0 KB new; the two big stop layers are 55 KB and 52 KB gz and are already fetched when a person switches those layers on. Fetching them for directions instead of drawing is the only change |
| **algorithm** | a stop graph: **12,495 ride edges** (consecutive stops in each route's travel order) + **9,611 walk-transfer edges** (stops within 150 m, which is what makes DDOT↔SMART changes possible — they never share a stop id), then Dijkstra with distance as the cost, a multiplier on walking and a fixed penalty per change of vehicle |
| **on-device cost** | 9,543 stops, ~22k edges: small. **1 ms median, 2 ms p90, 15 ms max** over 200 real listing-to-listing pairs → under 150 ms on a cheap phone |
| **implementation size** | ~200 lines per client on top of A |
| **UI** | *walk to this stop → ride this line → change here → ride that line → walk to the door*, with each leg's distance, both walking legs drawn by A*, and **"about every 45 minutes on a weekday"** only where DDOT publishes it. Never a departure time, never a live position |

**Prototype, same origin and destination:**

```
  walk to W Grand Bl & Lodge Service Dr
  ride DDOT 42  3113 m : W Grand Bl & Lodge Service Dr -> Rosa Parks & Calvert   (about every 60 min on a weekday)
  walk           46 m : Rosa Parks & Calvert -> Calvert & Rosa Parks
  ride DDOT 38  3227 m : Calvert & Rosa Parks -> Elmhurst & Yellowstone          (about every 60 min on a weekday)
  then walk to the door.    2 rides, computed in 4.3 ms
```

Elmhurst & Yellowstone is the pantry's own corner. This is a correct, useful answer, and it was produced from
files already in the bundle.

**The measured weakness, stated plainly.** Without times, "best" can only mean "least distance", and least
distance over-changes. Over 200 random listing pairs, with a 700 m penalty per change: 30 one-ride, 68 two-ride,
61 three-ride, 34 with four or more. Raising the penalty to 3,000 m moves it to 37 one-ride, 107 two-ride, 39
three-ride, 8 with four or more. A plan with three changes and no times is not advice; it is a maze.
**The UI must cap it at one change and say "no simple bus trip" otherwise** — 92% of our listings have a stop
within 400 m, so a cap is affordable.

A cheaper variant (routes-in-common only, no itinerary) runs in 0.4 ms but is worse, not better: over 200 pairs
it found a shared route for 30 and a shared *stop id* for 94, and gave up on 76, because it cannot see the
75–150 m transfers the full stop graph uses. There is no reason to build the cheap variant.

### Option C — full timetable routing (GTFS `stop_times`)

| | |
|---|---|
| **data to add** | SMART's GTFS (reachable, no terms published — already an Open row in DECISIONS 2026-09-20) and DDOT's GTFS (CC0, but `detroitmi.gov` answers scripts with 403; a person must download it by hand, or the City must unblock us) |
| **size** | SMART's `stop_times.txt` alone is **12 MB** (already noted in `ingest-transit.ts`). *Estimate:* a compact on-device timetable for ~81 routes and ~9,500 stops is on the order of **300–500 KB gzipped** — more than doubling the current 2.4 MB bundle's transit share, and that is before calendars and exceptions |
| **cadence** | **quarterly, and unannounced.** Board-approved service changes, plus holiday and detour exceptions that arrive in `calendar_dates` days ahead |
| **algorithm** | RAPTOR or CSA; both are well-suited to on-device, both need a trip index and a per-day service calendar |
| **cost** | the algorithm is not the problem; the data freshness is |
| **the blocker** | **a stale offline timetable is a wrong fact, and our freshness rule (CLAUDE.md, docs/04) says a listing's freshness is computed on the device from dated facts.** A phone that has not synced for three weeks would print "the 4 leaves at 3:12" with total confidence. The only honest forms are: refuse to show times when the feed's `feed_end_date` has passed or the bundle is older than N days; and never, under any circumstance, present a scheduled time as a live one |

Not recommended now. Worth revisiting only after DDOT GTFS access is settled, because a timetable for SMART
alone would be worse than none: riders would read "no times" on DDOT as "no service".

### Option D — keep link-outs, improved

Today (`apps/web/src/directions.ts`, docs/08): Apple/Google/`geo:` for **Directions**, Google transit for
**Bus directions**, `transit://directions?to=…` for the Transit app. docs/08 is explicit — *"Only the
destination… Never an origin"*.

**Adding the origin to a deep link is a change to what leaves the phone, and a significant one.** Today a
third party learns *which place a person tapped*. With an origin it learns *where that person is standing*,
which is the one thing every rule in CLAUDE.md and docs/08 exists to prevent. `transit://directions` does
accept a `from`, and Transit's own docs say omitting it uses the phone's own location — which is precisely why
we omit it: the person's location then goes from their phone to Transit's app on their phone, and we never
touch it. **Do not add an origin.** If it were ever wanted it would need Kyle's explicit decision, a DECISIONS
row, and per-trip consent on screen; it is not a free improvement.

What *can* honestly improve about D: keep the owners' own planners as the permanent, checked alternative
beside our own directions (§2.5), and keep `transit://` as the answer for "when is my bus coming?", which we
will never answer ourselves.

### 2.5 Honesty, safety and privacy — how we bound the risk

Nothing leaves the phone in A, B or C. That is the easy half. The hard half is that **a wrong walking route on
a dark street at night is a safety problem, and "we computed it offline" is no defence.** Proposed bounds,
all of them derived from data we have or can get from the same City layer:

1. **Only named streets.** 95.6% of our polylines are named; route only on named ones and every instruction can
   be read aloud and checked against a street sign. An unnamed edge is a line we cannot describe.
2. **Never through a freeway** (`cls 0`), and never along a street whose `cls` and `LANES`/`POSTED_SPE` say it
   is a highway-grade road with no crossing — a rule we can only state once we ingest those fields.
3. **Prefer calmer streets using the City's own marking.** `HIN_2021` / `HighSeverity` is the City of Detroit's
   own High Injury Network. Weighting against it is the City's judgement, not ours. Where the greenway or a
   bike lane runs the same way, prefer it.
4. **Never claim a route is safe, accessible, lit, or has a sidewalk.** We have no sidewalk, curb-ramp or
   lighting data at all, and dynamic type must not hide that. The screen says what we used: *"Streets only. We
   do not know about sidewalks, curb ramps or lighting on this route."* Under docs/05's badge rule, a badge
   states a fact; "we do not know" is the fact here.
5. **Always show the owner's planner beside our route**, exactly as today, labelled as the checked alternative.
   Our directions are an offline convenience, not a replacement for DDOT's or SMART's own planner.
6. **Never real-time, never a departure time we did not get from a current timetable.** A headway sentence
   names its day type and its source ("DDOT publishes 45 minutes, weekday base").
7. **Say where the route starts and ends.** We route to the street in front of the door (median 39 m away, up
   to 231 m), not to the door. The screen must say "to the street outside", and the last leg stays the
   address, which is already printed as text.
8. **Bridges and underpasses are the known failure case.** With no grade-separation field, noding treats an
   overpass as a junction. Excluding freeways removes most of them; rail viaducts and the Rouge crossings
   remain. This is a stated limit, not a silent one.

---

## 3. Recommendation

**Stage 1 — Option A, walking only (recommended first).** Zero new bundle bytes, zero new sources, zero new
licence questions, and it is the leg of every trip. It reuses the map files, the checksum path and the drawing
code that all three clients already have.

**Stage 1b — the four extra `outFields`** (`LANES`, `POSTED_SPE`, `HIN_2021`, `Bikelanes`) in
`ingest-basemap.ts`. One line of ingest, ~1 byte per polyline, and it is what makes bound 3 above possible.
Do it with Stage 1, not after.

**Stage 2 — Option B, bus itineraries without times**, capped at one change, with DDOT's published headway and
nothing else time-like. This is where the app starts doing something Google cannot: answering with no signal.

**Stage 3 — ask, then decide.** Ask DDOT for GTFS access (their portal item is CC0; only the bot protection is
in the way) and ask SMART to publish terms and a headway field. Only with DDOT's feed in hand does Option C
become a question worth asking.

**Do not do Option D's origin change.** Ever, without an explicit decision from Kyle.

### Effort, per client

| | pipeline | web | iOS | Android | fixtures |
|---|---|---|---|---|---|
| Stage 1 (walking) | 1 line (`outFields`) + a bbox/connectivity assertion | ~350 lines | ~350 lines Swift in `HelpCore` | ~350 lines Kotlin, **no library** | noding + A* cases in `schema/fixtures/`, as `DetroitQuery` does |
| Stage 2 (bus) | — | ~200 | ~200 | ~200 | itinerary cases |

Android ships zero libraries and this needs none: it is grid bucketing, line intersection, a binary heap and
Dijkstra/A*, all in primitive arrays. iOS likewise needs nothing beyond `HelpCore`.

### Bundle-size budget

**0 KB for Stage 1 and Stage 2.** Stage 1b is ~1 byte per polyline (~8 KB raw, under 3 KB gz). A prebuilt graph
(353 KB gz) is explicitly rejected: it is bigger than the street map it would be built from. Stage 3, if ever,
is a 300–500 KB gz *estimate* that needs its own decision.

### DECISIONS-worthy rules, if any of this is built

1. **Directions are computed on the device and nothing about a trip ever leaves the phone** — no origin, no
   destination, no query, to anyone, including in a link-out. docs/08's "only the destination" stands for
   link-outs and is not relaxed.
2. **Never real-time.** We hold no live positions and will not infer one. A headway is labelled with its day
   type and its publisher; a timetable time, if ever shown, is refused once its feed's end date has passed.
3. **Never claim a route is safe or accessible.** We have no sidewalk, curb-ramp or lighting data. The screen
   says so on every route.
4. **Route only on named streets, never on freeways, and prefer the City's own calmer streets.**
5. **We route to the street outside, not to the door** (median 39 m, up to 231 m), and the screen says so.
6. **The owner's own trip planner stays on the screen beside ours**, as the checked alternative.
7. **Timetable freshness:** if timetables are ever carried, they are a dated fact like any other and are
   suppressed — not shown stale — when their own dates have passed.

---

## 4. What was prototyped, and what was not

Prototyped and measured (throwaway JS, scratch directory, nothing committed): polyline noding, the 12 m
end-snap, the CSR graph, A* with timings and a turn list, the transit stop graph with transfers and a full
itinerary, listing-coverage statistics, and the packed-graph size comparison.

**Not done:** no client code was written or compiled; no Swift or Kotlin was benchmarked (the 5–10× cheap-phone
multiplier is an assumption, not a measurement); no GTFS `stop_times` was downloaded, so the Option C size is
an estimate; the extra Roads `outFields` were read from the layer's **metadata only** — their values were never
downloaded, so their coverage across Detroit is unverified; and no route produced here was walked or checked
against the ground by a person.
