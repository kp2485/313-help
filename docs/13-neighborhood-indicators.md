# 13 — Neighborhood Indicators (citywide)

2026-09-18. Kyle's direction: the public-data impact plan in doc 11 ("Layer B") applies to **every neighborhood in Detroit**, not only those along the Joe Louis Greenway. This doc replaces Layer B in doc 11. The greenway becomes one lens on a citywide picture.

## What it is

A public page per neighborhood ("How is Bagley doing?") plus a citywide view, inside the app, rebuilt by the pipeline from open data. No server, no accounts, **no resident data of any kind** — it never touches reports, app usage, or anything a phone sends. It answers three questions:

1. **What help can people here reach?** (from our own directory — nobody else has this)
2. **Is the neighborhood getting investment, and is blight going down?** (City open data)
3. **Are the people who live here able to stay?** (City open data — the honesty check on question 2)

## Geography

- **Unit: the City's `Current_City_of_Detroit_Neighborhoods` layer — 205 neighborhoods**, with council district and name. *[checked 2026-09-18: public ArcGIS layer, polygons, last edited 2023-12-06.]* These are the names residents use, which matters more than statistical neatness.
- **Lenses** (saved groupings of neighborhoods, same metrics):
  - *Joe Louis Greenway study area* — the City's own ½-mile planning-study layer, so our numbers line up with theirs (doc 11).
  - *Council district* (use the 2026 boundaries). (No district lens page yet; the neighborhood list is grouped by district.)
  - Later: Strategic Neighborhood Fund areas, a rec-center or park walkshed.
- City point data (sales, permits, blight tickets, demolitions, Improve Detroit issues, parcels) is counted by the City's own server: we ask for statistics grouped by each layer's own `neighborhood` field, so no record is downloaded and there is no point-in-polygon step. (Only our own listings, parks and greenway segments are matched to a neighborhood by its outline.) Tract-based data (Census, CDC PLACES) is shown **at tract level on a map, not re-apportioned** into neighborhoods; splitting modeled tract estimates across neighborhood lines manufactures precision that isn't there.

## Indicators

| Group | Indicator | Source *(all on data.detroitmi.gov unless noted; existence checked 2026-09-18, fields not yet)* | Shown as |
|---|---|---|---|
| **Help access** *(ours)* | Help listings inside or within ½ mile of the neighborhood, by category; "none listed yet" flags | Our bundle | Counts + list. Labeled as **directory coverage** until the directory is reasonably complete (see "Honesty rules") |
| | Distance from the neighborhood's center to the nearest listed food, clinic, Narcan and indoor place (rec center or library), in a straight line, **and which listing that is** (`help.nearest_id`, 2026-09-22) | Our bundle | Miles, on a row that opens that listing |
| | Parks, open greenway segments, rec centers within ½ mile | City parks / JLG / rec layers | Counts |
| | Stores that take a Bridge card (SNAP) inside or within ½ mile; straight-line miles from the center to the nearest one, and to the nearest grocery store / supermarket / super store among them. Restaurant Meals Program places left out (only some people can use them) | `SNAP_Retailer_Locations` (points: coordinates + a grocery flag only; 893 of 921) | Count + miles, with "most are corner stores and gas stations" |
| | DDOT bus stops inside or within ½ mile; miles to the nearest | `DDOT_Bus_Stops` (5,098 points, coordinates only; not the older `_102023` copy) | Count + miles, with "a stop nearby does not mean the bus comes often" |
| **Conditions** | Blight tickets per 1,000 parcels, per year | Blight Tickets | Trend vs. itself, and vs. city median |
| | Demolitions completed | Completed Demolitions | Count per year |
| | Illegal dumping / park / tree / street light issues reported, and median days to close | Improve Detroit Issues | Trend + days-to-close |
| | Fires in buildings per 1,000 parcels, per year. Only the 17 building-fire incident types in `FIRE_TYPES` (NFIRS names to 2025, NERIS "Fire - Structure Fire - …" from 2026), `exposure_number = 0` so one fire is one count. No medical, crash, alarm, smoke-scare, car or outdoor fires | `Fire_Incidents` | Per year, with the counted / not-counted list on the page |
| | Registered vacant buildings per 1,000 parcels, registrations issued in the past 12 months | `bseed_vacant_property_registrations` (rolling year; counts only, never the owner-name field) | Today's number + "counts owners who registered, not every empty building" |
| | Share of rated main-street **length** in poor condition (PASER 1–4 of 10). Each piece's latest real rating (`condition_year = year_last_evaluated`, 2021–2024); freeways (NFC 1–2) left out; the layer has no side streets. No neighborhood field: pieces are assigned by the point halfway along them, inside the outline, at ingest; only totals are written | `annual_pavement_conditions` | % of miles, with "main streets only" |
| **Investment** | Building permits issued (count, and estimated value where the field exists) | Building Permits | Per year |
| **Staying power** *(lead with these)* | Residential sales: count and median price | Property Sales | Per year, with small-number suppression |
| | Active rental certificates of compliance per 1,000 parcels (rentals that passed City inspection, in force today) | `bseed_active_residential_compliance_certificates` (counts only) | Today's number + "many rentals never register, so low can mean uninspected, not few" |
| | Tax foreclosures, eviction filings | Wayne County Treasurer / court data — **to find; may need a records request** | Per year |
| **Safe streets** | Crashes involving people walking or biking, and how many of those killed or seriously hurt someone | SEMCOG "Crash Locations, 2015-2024" (`crash2024_10year`); the records are the Michigan State Police's. **Licence accepted as it stands on 2026-09-22 (DECISIONS), indemnification clause included: SEMCOG's portal-wide [Copyright License Agreement](https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement) — a perpetual royalty-free licence to reproduce and publish, a required copyright notice printed on the panel itself, a one-way indemnification clause, and no third-party rights, which is why the State Police are named on the panel.** The City's own Traffic Crashes layer holds 2011 only | Plain counts over one 5-year window, with the years on screen, beside the whole-city number. Never a rate |
| **Health context** | Physical inactivity, poor mental health days, etc. | CDC PLACES (tract) | Map only, labeled "modeled estimate, about two years old — background, not a result" |

**Deliberately left out: crime.** A per-neighborhood crime panel stigmatizes blocks, feeds the people-reporting dynamic doc 11 designs out, and adds nothing the City's own dashboard doesn't already show. If a partner insists, it appears only at council-district scale, never per neighborhood. Crashes are not an exception to this: "Safe streets" counts what happened on the streets, says nothing about who was at fault, and is a road-design number, not a crime number.

## Honesty rules (every one is a build-time check or a fixed piece of page copy)

1. **No league tables.** No "best/worst neighborhoods" ranking anywhere. Each neighborhood is compared to itself over time first, then to the city median. Sorting the citywide table by a "badness" column is not offered.
2. **Small numbers are suppressed — where suppression protects somebody.** Revised 2026-09-22 (Kyle: "just use the actual number, there is no need to truncate or round anything"; DECISIONS). **Home sales and building permits state their real count, however small**: both are public transaction records the City already publishes with the address on them, so hiding a 3 protected nobody and only made our page say less than the source it cites. The page carries one plain sentence instead — "Small numbers change a lot from year to year." Everything else is unchanged and still shows "fewer than 5" under five: crashes (which are about people, and where the identification risk docs/11 designs against is real), blight tickets, completed demolitions, reported problems, building fires, rental certificates, vacant registrations and rated street pieces. **A median still needs at least 10 sales**, because the middle of three moves with any one of them; the count beside it is shown whatever it is.
3. **Rates need denominators we can defend.** Per-parcel or per-housing-unit from the City's parcel layer / ACS; never per "resident" from stale counts without saying the year.
4. **Descriptive, never causal.** Fixed copy on every page: "These numbers describe what happened here. They can't tell you why." Particularly for the greenway lens: the route wasn't placed at random, and before/after differences are not the greenway's "effect."
5. **Enforcement is not the same as condition.** Blight tickets measure where inspectors went as much as where blight is. Said on the chart, not in a footnote.
6. **Directory coverage is not service coverage.** Found 2026-09-18: with 91 listings, nine open greenway segments — including the new Warren–Joy–Intervale stretch — show *zero* help within a 10-minute walk. That says our directory is thin on the west side; it does not say the neighborhood has no pantry. Until a neighborhood's listings have had a coverage pass, its help-access panel reads "We haven't listed much here yet — tell us what we're missing" with the add-a-place link. This turns the weakest part of the data into the recruitment channel. **Status 2026-09-20:** that panel is built, but there is no record of which neighborhoods have had a pass — `help.coverage_checked` can never be true, because the build never sets it (the audit found this). So every neighborhood reads as unchecked, which is honest today and will stop being honest once passes start happening. With 531 listings, 29 of 205 neighborhoods still have no food listed within half a mile. The committed `data/indicators/greenway_access.json` is from an older bundle and understates today's coverage; re-run it (OPERATIONS, "How to run the greenway access report") before quoting it.
7. **Every number links to its source dataset and states its date.** Same freshness principle as the app: a panel whose source hasn't updated in a year says so.
8. **Rising prices are shown next to rising investment, always.** Investment without staying power is displacement. The page layout puts them side by side so neither can be screenshotted alone without effort.

## Architecture

- `pipeline/src/ingest-neighborhoods.ts` (`pnpm ingest:neighborhoods`) reads the neighborhood outlines and asks the City's server for per-neighborhood, per-year statistics (and today's rental, vacant-registration and street-rating numbers), into `data/ingested/neighborhoods.json` and `data/ingested/city_stats.json`, and the SNAP-store and bus-stop points into `data/ingested/city_points.json`. All layer URLs are at the top of that file. The nightly job re-reads them on the 1st of each month; a change comes as a pull request. `pipeline/src/indicators.ts` joins them with our listings, parks and the greenway at each bundle build.
- `pipeline/src/ingest-crashes.ts` (`pnpm ingest:crashes`) reads SEMCOG's crash layer once a year, by hand, and writes counts per neighborhood and year into `data/ingested/crashes.json`. It is **not** in the nightly job: the layer gains a year at a time (docs/OPERATIONS). SEMCOG's Copyright License Agreement, indemnification clause and all, was accepted on 2026-09-22 (DECISIONS).
- Output: one bundle file, `indicators/neighborhoods.json` (citywide numbers, lenses and all 205 neighborhoods). Each build also commits a copy without the outlines to `data/indicators/neighborhoods.json`, so every number's history is in git.
- **`help.nearest_id` (2026-09-22): which listing each "nearest" distance belongs to**, so a neighborhood page can open it instead of stating a distance nobody can act on. Same four keys as `help.nearest_miles`, each the `sal_` id of the very listing that number was measured to, or `null` exactly where the distance is `null`:

  ```json
  "help": {
    "nearest_miles": { "food": 1, "clinic": 1.6, "narcan": 1.1, "indoors": 2 },
    "nearest_id": {
      "food": "sal_exodus_food_pantry",
      "clinic": "sal_wayne_county_hamtramck_health_center",
      "narcan": "sal_wws_detroit_passenger_recovery",
      "indoors": "sal_detroit_parks_lasky_recreation_center"
    }
  }
  ```

  `nearest_miles` is unchanged and stays: a client that knows nothing of the ids prints exactly the distances it always did. A pick needs a coordinate, and **can never be a sensitive (`shelter.dv`, `health.mental`) or private (`treatment`, `assault`) listing** — `canBeNearest` in `pipeline/src/indicators.ts` refuses one whatever the kinds are mapped to, and the web checks the category again before it draws a link, because the numbers and the listings are two files. Ties are settled by miles, then `sal_` id, so one bundle always names the same place. Cost: the bundle file goes from 66.7 to 75.8 KB gz, and it is downloaded only when a neighborhood screen opens.
- Heavy layers (blight tickets, permits) are added up by the City's server; raw records are never downloaded, let alone shipped to the browser.
- The pages are screens inside the app, `#/n` and `#/n/nbh_…`, drawn from that one signed file, which is downloaded only when a neighborhood screen opens. **Since 2026-09-22 `#/n` is a tab of its own** (docs/05): the same address, now the fourth tab, with an index that finds the person's own neighborhood on the device (`apps/web/src/hoodfind.ts`, cases in `schema/neighborhoods/points.json`), a search over the 205 names, and the list A–Z or by council district — never in an order any number could set. Charts follow one small, accessible chart style (large type, labeled directly, works without color).
- In the app: neighborhood pages are **not** in the crisis path — no need screen, no urgent sheet and no listing leads to one, and the numbers are still downloaded only when one of these screens opens. They are reachable from the **Neighborhoods tab** (2026-09-22; before that only from About, which is where Kyle found them buried), from Home's third tile, from one line on About, from a greenway segment ("About this neighborhood"), and by URL for partners. The web app and the iPhone app both have them, each with a Neighborhoods tab of its own (iPhone, 2026-09-21: the same panels, in the same order, with the same numbers and the same words; the rules are `apps/ios/Sources/HelpCore/Hoods.swift` and the screens are `apps/ios/HelpApp/HoodsScreen.swift`). **Android has them too since 2026-09-22**, as its own Neighborhoods tab, drawn from the same signed file with the same panels in the same order; where a point falls is `Zip.kt` and `Hoods.kt` in its `:core` module, held to the shared cases in `schema/neighborhoods/points.json`, and the whole file rides in the APK so the tab works with no signal. One Android caveat worth stating: that app only ever asks for a coarse location, which Android fuzzes onto a grid of a kilometre or two, so "Your neighborhood" there can name the neighborhood next door — a typed ZIP is the exact way to ask. `data/indicators/greenway_access.json` comes from `pipeline/src/access-report.ts`: after a bundle build, run `npx tsx src/access-report.ts` from `pipeline/` (there is no pnpm script for it).

**Table or chart (2026-09-22).** Every by-year panel with three years of numbers in it can be read as a table or
as a picture, and **Table is the default**: the table carries every number, and the picture carries none the table
does not. The chart is **one pair of axes with a line per series** — homes sold and building permits together, at
Kyle's request, because reading them apart was the thing the panel exists to prevent. One y-axis, never two: two
scales on one chart is a way of making any two lines say whatever you like, and both of these are counts of the
same kind. The key is **two real toggles** (checkboxes on the web and Android, switches on the iPhone), both on to
begin with, either switchable off, and **never both**: the last one on is disabled and the panel says "One line
has to stay on." Each line is told apart by three things at once — its colour, the shape of its point (a circle
and a diamond) and the pattern of its line (solid and dashed) — so the two are still two in grayscale, in print,
under forced colours and to a reader who sees no difference between the hues. Years run across, counts up from
zero, ticks at round numbers, and **no trend line, no whole-city line and no other neighborhood anywhere on it**.

**A count the pipeline hid is visible and is not a value** (Kyle, 2026-09-22: "the graphs are not showing counts
fewer than 5"). It is a HOLLOW marker of the series' own shape at a fixed height — a tenth of the plot, the same
constant on all three apps, always below the first tick over zero — and the line runs on through it as a dotted
piece, so the year is plainly there, its number is plainly not, and the gap never reads as a zero. The axis is
built so that it never labels a value between 0 and 5, and there is no code path from a hidden count to a length.
Since the change to honesty rule 2 above, the series that can still carry one are blight tickets, demolitions,
reported problems and fires; sales and permits state their number.

The chart shows **counts**; prices and permit costs stay in the table, and the chart view says so in one line.
Every point carries its own accessible name — "2023, Homes sold: 14" — and its value on hover and on keyboard
focus. The model (points, segments, markers, ticks, the summary sentence) is `apps/web/src/hoodchart.ts`, ported
case for case to `HelpCore/HoodChart.swift` and to `hoodChartModel` in Android's `Hoods.kt`, and held to the same
cases in all three test suites. It is drawn with no library anywhere: inline SVG on the web (which carries a
`<title>` per point and prints), Swift Charts on the iPhone (for the VoiceOver audio graph the framework gives for
free), and a plain `Canvas` on Android with one `AccessibilityNodeProvider` node per point.

## The four cities (2026-09-22)

**Detroit, Hamtramck, Highland Park and Dearborn each have a city page.** Kyle, 2026-09-22 (DECISIONS): build
and ship them now. The research behind this is `docs/research/2026-09-22-neighborhoods-three-cities.md`, read in
full before anything here was written.

**Why a whole-city page and not neighborhoods.** None of the other three cities runs an open-data portal, and
none of them publishes a named sub-city geography a resident lives in. Hamtramck's charter makes the city **one
ward**; Highland Park's three council districts exist and are drawn nowhere; Dearborn's only tiling polygons are
a garden-judging geography and a sewer-maintenance geography, neither of which is a neighborhood. Hamtramck is
2.1 square miles and Highland Park 3.0: split four ways, nearly every count would fall under the small-number
rule anyway. **We never invent a name or draw an outline of our own.** Dearborn's 27 Census tracts stay a later,
separate decision; SEMCOG's tract-to-city field is a dominant-MCD label rather than a containment (it over-counts
Detroit by 64,000 people and under-counts Dearborn by 21,000), so a tract page would have to assign tracts from
Census geometry first, and write the rule down.

**A city page is a different kind of page from a neighborhood page, and it says so.** Every non-Detroit page
carries one fixed line: *"These numbers come from regional and national lists, because {city} does not publish
its own. They are not the same measurements as Detroit's neighborhood pages, so do not read the two side by
side."* There is **no cross-city comparison anywhere** — no table of four cities, no "Detroit median vs
Hamtramck," nothing sorted by anything. Each city is read on its own (honesty rule 1).

### The panels, and where each one comes from

| Panel | Detroit | Hamtramck | Highland Park | Dearborn | Source printed on the panel |
|---|---|---|---|---|---|
| Help nearby, and the nearest food / clinic / Narcan / indoor place | ● | ● | ● | ● | Our own directory |
| Parks, and acres | ● | ● | ● | ● | Detroit: the City's own parks layer. Others: SEMCOG parks |
| Safe streets (walking and biking crashes) | ● | ● | ● | ● | SEMCOG; records from the Michigan State Police |
| Street condition (PASER good / fair / poor) | ● | ● | ● | ● | SEMCOG, for Michigan's Transportation Asset Management Council |
| Empty homes (2020 Census) | ● | ● | ● | ● | SEMCOG's `mcd_2020`; the counts are the 2020 Census's |
| New homes permitted | ● | ● | **—** | ● | U.S. Census Bureau, Building Permits Survey |
| Homes sold, blight tickets, buildings torn down, problems reported, building fires, rental inspections, registered empty buildings | ● (per neighborhood) | — | — | — | Detroit only. **Absent, not zero, not blank** |

Measured on 2026-09-22, and every number on the page:
Detroit 302 parks / 4,968 acres, 1,044.9 rated miles (26% good, 43% fair, 31% poor), 55,638 of 309,913 homes
empty, 2,620 homes permitted in 2025. Hamtramck 3 parks / 15 acres, 12.4 rated miles (44/36/20), 772 of 8,911
empty, 4 homes permitted. Highland Park 4 parks / 13 acres, 21.0 rated miles (16/46/38), 1,220 of 5,137 empty.
Dearborn 49 parks / 853 acres, 141.1 rated miles (13/52/35), 2,399 of 39,334 empty, 22 homes permitted.

**Highland Park's permits panel is absent for a different reason from the rest, and says so.** The Building
Permits Survey recorded no new home authorised there in any published year. That is a real fact, so the page
prints the sentence — *"The Census Bureau recorded no new homes permitted in Highland Park in any year from 2021
to 2025, so there is no chart here."* — rather than five zeros beside Detroit's 2,620, which would be a
comparison the data cannot carry. In the bundle it is `missing: [{ panel: "permits", why: "none_recorded" }]`,
which is not the same value as `why: "not_published"`.

### Honesty rules that are specific to these pages

1. **The allow-list decides, not the numbers.** Each area carries `panels`, an explicit list, and a client draws
   a panel **because the area lists it**, never because a number happens to be present or absent. "Dearborn
   publishes no blight tickets" is therefore a fact in the signed bundle, not a habit of one client.
2. **Sources are per area, per panel.** `Indicators.sources` — the flat map all 205 neighborhoods share — stays
   exactly as it was and is still right for them. City pages use `areas[].sources`, which names a source key per
   panel, interned in `area_sources`. Detroit's parks come from the City and Hamtramck's from SEMCOG: two
   numbers that share a word never share a source line.
3. **SEMCOG's notice is printed on every SEMCOG-sourced panel**, in SEMCOG's own English, marked `lang="en"`,
   never machine-translated. On a city page that is four panels: parks, crashes, street condition and empty
   homes. It is not printed on the Census permits panel, which is not SEMCOG's.
4. **Suppression is unchanged in scope.** Crash counts — counts of people hurt — keep "fewer than 5" and stay
   five-year totals. Parks, acres, rated miles, homes, permits and parcels are the real number however small
   (DECISIONS 2026-09-22): three parks is `3`.
5. **"Empty homes" is not Detroit's "registered empty buildings."** One counts homes with nobody in them on one
   day in 2020; the other counts owners who filed a registration in the past twelve months. Same word, different
   fact, and the panel says which.
6. **PASER's three groups are the raters' own.** We never average the ten ratings into a score, and the shares
   are of *rated miles*, adding to exactly 100. A street on a city line is counted for both cities, and the
   panel says so.
7. **Help nearby counts what is inside the city outline**, not within half a mile of it: half a mile outside
   Hamtramck is Detroit, and Detroit's listings are not Hamtramck's. The "nearest" rows are measured over every
   listing, so the nearest pantry to the middle of Hamtramck may be in Detroit — which is the useful answer, and
   the page says it. `canBeNearest` still refuses a sensitive or private listing.

### What we will not read, and will not link

**BS&A Online** runs assessing, tax and permits for all three smaller cities and its terms prohibit any
automated access, and purport to prohibit linking without written consent. We do not scrape it, we do not "check
it by hand at scale," and we do not deep-link it from a listing. That one paragraph is what closes off sales and
local permits for the three cities. **Dearborn's DearbornConnect** service-request layer carries reporter names
and free text and is excluded on principle (docs/11). **HUD's USPS vacancy data** answered an honest request
with an empty body at every URL, so we have no licence text for it at all and do not use it; the 2020 Census
count answers the same question with no licence problem. **Highland Park's CLEMIS crime map** is recorded here
only so nobody proposes it: docs/13 leaves crime out, and that does not change because a different city
publishes it.

### Architecture

- `pipeline/src/ingest-cities.ts` (`pnpm ingest:cities`, by hand) reads the six layers into
  `data/ingested/cities.json`. Every count is added up by the owner's own server; no parcel, park or road record
  is downloaded and no name field is ever requested. SEMCOG gains a pavement year each January and the Building
  Permits Survey an annual file each spring.
- `buildAreas` in `pipeline/src/indicators.ts` joins them with our listings and the crash totals at each bundle
  build, and writes `cities[]`, `areas[]` and `area_sources` into the **same** `indicators/neighborhoods.json`.
  One file means one fetch, one signature and one place the honesty rules are enforced.
- **Additive, and tested as such.** `neighborhoods`, `sources` and `city` are byte-for-byte what they were, so
  the iPhone and Android apps — which do not know about city pages yet — keep printing exactly what they
  printed. Cost: the file goes from 75.8 to 77.4 KB gzipped, and it is still downloaded only when an area screen
  opens.
- The web draws it at `#/n/city_<slug>`: the address the Neighborhoods tab has always had, so no route was
  invented and `#/c/` stays the categories tab. `areaById` finds either kind of id and `areaPage` draws
  whichever it found, from the same components (`apps/web/src/hoods.ts`).
- The four ids, for the Map tab's Areas layer and for the other clients: **`city_detroit`, `city_hamtramck`,
  `city_highland_park`, `city_dearborn`.** A tap inside Detroit should prefer the neighborhood outline over the
  city outline — most specific first.
- **The iPhone and Android apps must mirror the models and the panels** before they show a city page: the `Area`
  model with its `panels` allow-list, `missing` with both reasons, per-panel `sources` out of `area_sources`,
  the SEMCOG notice on the four SEMCOG panels, and the six panels in the order `CITY_PANELS` fixes. Until then
  they ignore `areas` entirely, which is exactly what an older client does.

## Order of work

1. **Done:** greenway access shed (`data/indicators/greenway_access.json`).
2. **Done 2026-09-18:** neighborhood polygons ingested (`pnpm ingest:neighborhoods`); help-access panel for all 205 neighborhoods, built into the signed bundle as `indicators/neighborhoods.json` and shown in the app at `#/n` and `#/n/nbh_…` (from About and from each greenway segment).
3. **Done 2026-09-18:** Property Sales + Building Permits, 2019 to now, in one panel. Counts and medians are added up by the City's server per neighborhood, so no sale record (and no buyer or seller name) is ever downloaded. Sales are residential, arm's-length, over $1,000. The greenway lens is the 52 neighborhoods that overlap the City's eight study-area polygons (that layer holds study sub-areas, not neighborhood names).
4. **Done 2026-09-18:** blight tickets (per 1,000 parcels, with the enforcement caveat on the chart), completed demolitions, and Improve Detroit issues with median days to close. Only four issue types are counted (illegal dumping, trees, parks, street lights): types about people, such as "Squatters Issue," are left out on purpose.
5. **Done 2026-09-19** (Kyle approved the six layers; fields checked that day): stores that take a Bridge card and bus stops (help section), active rental certificates (staying-power panel), building fires, vacant-building registrations and main-street pavement (conditions). Counts are added up by the City's server by each layer's `neighborhood` field; SNAP stores and bus stops are downloaded as coordinates only (`data/ingested/city_points.json`) because "within ½ mile" needs the point; pavement pieces are downloaded as rating + length + line and only per-neighborhood totals are kept. The rental, fire and vacant layers carry addresses and owner names: we ask them for counts only. The ingest prints any new fire type that looks like a building fire but isn't in `FIRE_TYPES`, for a person to look at.
6. **Crashes: done 2026-09-20** (Kyle's call, and re-recorded on 2026-09-20: the licence is **not** unstated, as that decision said — SEMCOG publishes a portal-wide Copyright License Agreement with a required notice and a one-way indemnification clause, and the records are the Michigan State Police's — DECISIONS 2026-09-20, "SEMCOG's terms were described wrongly"). `pipeline/src/ingest-crashes.ts` (`pnpm ingest:crashes`, by hand, about once a year) reads SEMCOG's crash layer for the four cities, keeps only crashes with a person walking or biking, and turns them into counts per neighborhood per year by mode and by whether someone was killed or seriously hurt. Everything else about a crash is dropped as it is read: no crash id, no date or time beyond the year, no ages, no driver, vehicle, alcohol or hit-and-run fields, and no coordinates in the output. Counts under 5 become `lt5` before anything is written. `data/ingested/crashes.json` is committed; the bundle carries the 5-year totals only; the page is the "Safe streets" panel.
   **Its limits, all on the page or in this doc.** (a) The window is 2020 to 2024, the five most recent complete years the layer offers: it starts in the first COVID year, and a crash from 2025 is not in it yet. (b) A crash is placed by the neighborhood outline it falls in, so a crash on a street that forms a boundary can land on either side; of 3,043 crashes read on 2026-09-20, 2,486 fell inside a Detroit outline and the rest were in the other three cities or outside every outline. (c) "Killed or seriously hurt" counts **crashes**, not people, and does not say who was hurt — the walker, the rider or someone in a vehicle. (d) Most neighborhoods have fewer than 5 biking crashes and fewer than 5 serious ones in five years, so those numbers read "fewer than 5" (182 of 205 neighborhoods have at least one hidden number). (e) No rate: this doc defines no denominator for crashes. Walking counts without knowing how many people walk there is not a risk, and street-mile and population denominators both need a decision that has not been made.
7. PLACES tract map; foreclosure and eviction sources, once found.

Steps 2–6 are done. Step 7 is v1: PLACES and the foreclosure and eviction sources are not started.

## Open questions for Kyle

- Whose page is this? Decided 2026-09-18: it lives in the app (DECISIONS). Still open: whether to also offer the data to the City or the Joe Louis Greenway Partnership.
- Is there a partner who would review the indicator list before it's public? A neighborhood-association umbrella group would be the right critic.
