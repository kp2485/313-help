# Neighborhood-level information for Hamtramck, Highland Park and Dearborn

2026-09-22. Research only. Nothing here has been built and nothing has been decided. It answers Kyle's question:
*"Is there neighborhood-level information for the other three cities like Detroit's, and how would we integrate it?"*

**Method and honesty.** Everything below was read from the owner's own site or its own ArcGIS server, with a
user-agent that names this project. Where a site refused that request, this doc says so and stops there — no
retry with a disguised request, and no scraping of any Tier C/D source (CLAUDE.md, docs/02). No record holding a
person's name was downloaded: every count in this doc came back from a server-side `outStatistics` query, the
same pattern `pipeline/src/ingest-neighborhoods.ts` already uses. Layer fields were checked; **values were
checked only where a number is printed below.**

---

## 0. Summary

**Short answer: no — not like Detroit's, and it will never be like Detroit's.** Detroit's 205-neighborhood pages
exist because the *City of Detroit* runs an open-data portal that puts a `neighborhood` column on nine of its
own operational layers, so its own server does the counting. None of the other three cities has anything
comparable — none of them has an open-data portal at all — and two of them are too small for a sub-city page to
survive the small-number rule in docs/13.

What we can honestly build instead:

| | Detroit | Dearborn | Hamtramck | Highland Park |
|---|---|---|---|---|
| Population (2020 Census) | 639,111 | 109,976 | 28,433 | 8,977 |
| Land | 88,788 acres | 15,518 acres | 1,337 acres (2.1 sq mi) | 1,901 acres (3.0 sq mi) |
| Named neighborhood polygons published by the city | **Yes, 205** | No | No | No |
| Council | 7 districts | 7 at-large | 6 at-large, one ward | 2 at-large + 3 districts, **boundaries unpublished** |
| **Recommended unit** | neighborhood (unchanged) | **whole city now; Census tracts later, if a tract page can be made honest** | **whole city** | **whole city** |
| Panels we could ship from an existing public source | 14 | 10 | 10 | 9 |

The three new pages are **whole-city pages** built almost entirely from **regional and federal** sources that
already cover all four cities — SEMCOG, Wayne County, and the U.S. Census — plus our own directory. That is a
different kind of page from a Detroit neighborhood page, and it must look and read like one.

Three findings drive the recommendation:

1. **We already have the hardest parts.** The bundle already carries all four **city outlines** (TIGER, public
   domain, `pipeline/src/ingest-basemap.ts`), the **ZIPs** for all four cities, and **five-year pedestrian and
   bicycle crash counts for all four cities**, already committed and already suppressed
   (`data/ingested/crashes.json`: Hamtramck walk 69 / bike 29 / severe 15; Highland Park 28 / 12 / 9;
   Dearborn 147 / 122 / 41). `pipeline/src/ingest-crashes.ts` reads all four cities today and then throws the
   three away.
2. **The biggest single unlock is SEMCOG**, which publishes region-wide layers keyed by a community code
   (`semmcd`: Detroit 5, Dearborn 1025, Hamtramck 1090, Highland Park 1100): pavement condition, parks with
   amenities, residential building permits, census geography with 2020 counts, and the crash layer we already
   use. **This makes the open SEMCOG licence question (DECISIONS 2026-09-20) much more load-bearing than it is
   today.** Today one panel depends on it. Under this plan, most of three cities' pages would.
3. **Seven Detroit panels cannot be extended at all**: arm's-length residential **sales**, **blight tickets**,
   **demolitions**, **reported problems and days to close**, **fires**, **rental certificates** and **vacant
   registrations**. No public, machine-readable, name-free source exists for any of them outside Detroit, and
   the assessing and permit systems all three cities use (BS&A) prohibits automated access outright. Those
   panels must be **absent** on the three city pages — not estimated, not shown as zero, and not quietly filled
   with a different kind of number that happens to share a word.

---

## 1. Geography: what each city publishes

### 1.1 Boundaries and sub-city units

| City | Unit published | Source | Format / cadence | Licence as stated | Verdict |
|---|---|---|---|---|---|
| Detroit | 205 named neighborhoods | `Current_City_of_Detroit_Neighborhoods` ([layer](https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/Current_City_of_Detroit_Neighborhoods/FeatureServer/0)) | ArcGIS REST, polygons; last edited 2023-12-06 | **Unstated** (portal disclaimer only) | In use |
| Dearborn | `District_v2`, **14 polygons, numbered, no names** ([layer](https://services.arcgis.com/2RWy3QS9pyfJe2ZU/arcgis/rest/services/District_v2/FeatureServer/0)) | City of Dearborn ArcGIS org `2RWy3QS9pyfJe2ZU` | ArcGIS REST; data last edited 2024-04-15 | **None stated** (empty `copyrightText`) | **Do not use, and the reason matters.** These are the **City Beautiful Commission's garden and decoration judging districts** — the paired AGOL items are "City Beautiful District Map" and `Beautiful_Bounday`, and `Parcel22` is described as "Parcel shapefile for City Beautiful". The City's own press releases describe **17** districts where the layer has 14. Only attribute is `ID`; `ID` 14 has a shape area ~200× the others, so it is an outside/background polygon. Presenting a decorating-contest geography as neighborhoods would be a misrepresentation |
| Dearborn | `Quadrants`, 4 polygons: NE, NW, SE, SW ([layer](https://services.arcgis.com/2RWy3QS9pyfJe2ZU/arcgis/rest/services/Quadrants/FeatureServer/0)) | same org | ArcGIS REST | **None stated** | **Do not use.** Its AGOL item says *"Used on 'Manhole Map with Quadrants'. Move to enterprise portal website. 3-10-2026"* — a sewer-maintenance geography, flagged for retirement |
| Dearborn | **Neighborhood association map**, 12 named associations ([page](https://dearborn.gov/neighborhoods), [PDF, April 2026](https://dearborn.gov/sites/default/files/2026-04/Neighborhood%20Association%20Map%20April%202026.pdf)) | City | **PDF only**; irregular | None stated | The closest thing to named Dearborn neighborhoods (Country Club Estates, Dearborn Hills, Ford Homes Historic District, Golfview Oaks, Morley Area, River Bend, Snow Woods, Southwestern Outer Drive, Springwells Park, West Lane, Concerned Residents for South Dearborn, DFNA). But the page itself says *not all areas of Dearborn have active associations*: **it is not a tiling of the city**, so it cannot be a unit that every Dearborn address falls into |
| Hamtramck | **None, and none is possible from the charter.** Charter Ch. 2 §2-01: the city is **"one ward"**; all 6 councilmembers are at-large ([charter](https://codelibrary.amlegal.com/codes/hamtramck/latest/hamtramck_mi/0-0-0-12218), [council](https://hamtramckcity.gov/city/city-council/)) | — | — | — | **Hamtramck owns no GIS at all** — its own CED page links Wayne County's viewer. Assessing is BS&A lookup only. The official domain is `hamtramckcity.gov` |
| Highland Park | **3 council districts exist but are not drawn anywhere.** The council page names two at-large members and District 1, 2 and 3 members ([council](https://www.highlandparkmi.gov/government/city-council/)); the charter separately says the city "shall constitute one ward" | — | — | — | **No map, no boundary description, no GIS.** The city's entire spatial publishing is three undated PDFs ([maps page](https://highlandparkmi.gov/services/community-economic-development/maps/)). **Asking the city for the three district boundaries is a cheap, concrete ask** |
| All four | City outlines | U.S. Census **TIGER** `Places_CouSub_ConCity_SubMCD/MapServer/4` ([TIGERweb](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb)) | ArcGIS REST; yearly vintage (2025 current) | **No licence stated**; a U.S. federal work, and data.gov tags the TIGER tract series CC0-1.0 (§4) | **Already ingested and already in the bundle** (`ingest-basemap.ts`, `NEIGHBOR_CITIES`) |
| All four | 2020 Census tracts | SEMCOG `tracts_2020` ([layer](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/tracts_2020/FeatureServer/0)), or TIGER direct | ArcGIS REST; last edited 2024-12-14 | SEMCOG agreement / public domain at Census | See §1.3 — **the tract-to-city field is not trustworthy** |
| All four | 2020 Census city totals | SEMCOG `mcd_2020` ([layer](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/mcd_2020/FeatureServer/0)) | ArcGIS REST | SEMCOG agreement | Population, housing units, **vacant units and vacancy rate** for all four cities |
| All four | ZIP areas | Already in the bundle (`data/ingested/city_zips.json`; the three cities' ZIPs 48203, 48212, 48120, 48124, 48126, 48128 come from Census ZCTAs) | — | Public domain (Census) | Already used by "Your neighborhood" |

### 1.2 Council districts and wards

| City | Council | District polygons? |
|---|---|---|
| Dearborn | **7 seats, all at-large** ([dearborn.gov](https://dearborn.gov/government)). A November 2025 charter proposal would move to 7 districts + 2 at-large ([FOX 2](https://www.fox2detroit.com/news/dearborn-prop-1-city-votes-change-wards-council-members-charter)) | **None exist today.** If the charter change passes and districts are drawn, that becomes the obvious unit for Dearborn and this decision should be revisited |
| Hamtramck | 6 councilmembers, all at-large; charter says one ward | None, and none can exist |
| Highland Park | 2 at-large + Districts 1, 2, 3 | **The districts exist and the boundaries are not published.** Ask |

Dearborn's ArcGIS org also publishes `Precincts_2025`, `Polling_2025` and `Voting_Precincts` — **election
precincts, not districts.** Precincts are redrawn for administrative convenience and are not a geography anyone
lives in, so they are not a candidate unit.

### 1.3 A finding that matters: SEMCOG's tract-to-city field is approximate

Counting tracts by SEMCOG's own `semmcd` field gives:

| City | Tracts by `semmcd` | Population summed over those tracts | Actual 2020 city population (`mcd_2020`) | Difference |
|---|---|---|---|---|
| Detroit | 295 | 703,302 | 639,111 | **+64,191** |
| Dearborn | 27 | 88,728 | 109,976 | **−21,248** |
| Hamtramck | 7 | 28,428 | 28,433 | −5 |
| Highland Park | 5 | 8,059 | 8,977 | −918 |

Detroit's tracts over-count by 64,000 people and Dearborn's under-count by 21,000. So `semmcd` on the tract
layer is a **dominant-MCD label, not a containment**: tracts on the Detroit/Dearborn line and around the
Hamtramck and Highland Park enclaves get filed under whichever city holds most of them.

**Consequence for the design.** A Dearborn tract page cannot be built by filtering on `semmcd`. If tracts are
ever used, they must be assigned from Census geometry against the TIGER place outline we already ingest, the
rule must be written down, and the page must say plainly that a tract is a statistical area that can cross a
city line. That is a real cost, and it is the main reason §3 recommends **whole-city pages first** and tracts
only as a later, separately-decided step.

---

## 2. The numbers, panel by panel

### 2.1 Regional and federal sources that cover all four cities

All checked 2026-09-22 unless noted. `semmcd` codes: Detroit 5, Dearborn 1025, Hamtramck 1090, Highland Park 1100.

| Source | Owner | What | Format / cadence | Licence exactly as stated | Machine-readable | Covers the 3 cities? |
|---|---|---|---|---|---|---|
| [`crash2024_10year`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/crash2024_10year/FeatureServer/0) | SEMCOG (records are Michigan State Police's) | Pedestrian and bicycle crashes, `community` and `YEAR` fields | ArcGIS REST; a new year each autumn | SEMCOG [Copyright License Agreement](https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement) — perpetual royalty-free grant, a **required** notice, a one-way indemnification clause, no third-party rights. **Open for Kyle** (DECISIONS 2026-09-20) | Yes; server-side counts only | **Yes, and already counted.** `data/ingested/crashes.json` holds 2020–2024 totals for all four cities today |
| [`Pavement_Condition_2003_to_2024`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/Pavement_Condition_2003_to_2024/FeatureServer/80) | SEMCOG, for Michigan's Transportation Asset Management Council | PASER 1–10 per road piece, `SEMMCDL`/`SEMMCDR`, `LENMI`, `NFC`, one column per year `AS_OF_03`…`AS_OF_24` | ArcGIS REST; a new year each January. Data last edited 2025-01-26. A 2025 map layer also exists (`Pav03to25_for_map_diss_Multipart`) | Same SEMCOG agreement; the layer itself carries **no `copyrightText`** | Yes | **Yes.** Rated pieces / miles: Detroit 29,066 / 1,042.8; Dearborn 2,264 / 131.9; **Hamtramck 212 / 10.9**; **Highland Park 717 / 19.6** |
| [`park_poly_2023_view`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/park_poly_2023_view/FeatureServer/0) | SEMCOG | Park polygons with `semmcd`, acres, owner, and ~45 amenity flags (play area, restrooms, pool, courts, trails…) | ArcGIS REST; data last edited 2026-09-15 | Same SEMCOG agreement; no `copyrightText` | Yes | **Yes.** Parks / acres: Detroit 304 / 5,047; Dearborn 49 / 853; **Hamtramck 3 / 14.6**; **Highland Park 4 / 13.4**. Richer than Detroit's own parks layer, which has no amenities at all (docs/02) |
| [`mcd_2020`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/mcd_2020/FeatureServer/0) | SEMCOG, from the 2020 Census | Population, households, housing units, **vacant units and vacancy rate**, age split, per city | ArcGIS REST; last edited 2024-12-14 | Same SEMCOG agreement (underlying counts are Census, public domain) | Yes | **Yes.** Vacant housing units / rate: Detroit 55,638 / 18.0%; Dearborn 2,399 / 6.1%; **Hamtramck 772 / 8.7%**; **Highland Park 1,220 / 23.7%** |
| [`tracts_2020`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/tracts_2020/FeatureServer/0) | SEMCOG | Same fields, per tract | ArcGIS REST | Same | Yes | Yes, **but see §1.3** |
| [`PermitsbyMCD`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/PermitsbyMCD/FeatureServer/0) | SEMCOG | **Residential units permitted**, one `total` per community, latest year | ArcGIS REST | Same | Yes | Yes, but the numbers show why it is weak: Detroit 1,108; Dearborn 29; **Hamtramck 0; Highland Park 0** |
| [`Residential_Building_Permit_Points_2025`](https://services1.arcgis.com/xUx8EjNc6egUPYWh/arcgis/rest/services/Residential_Building_Permit_Points_2025/FeatureServer/0) | SEMCOG | One point per residential permit: `city_id`, `dm_year_permit`, `housing_units`, `dm_value`, `address`. **No owner or applicant name field** | ArcGIS REST; one layer per vintage | Same | Yes; counts server-side, so no address is downloaded | Partly. 2025: Dearborn 21 permits / 21 units; **Hamtramck 8 / 21; Highland Park 0 rows; Detroit 0 rows** — Detroit appears to be absent from this layer, so it cannot be the four-city permits source |
| [`Parcels_AssessmentData`](https://services1.arcgis.com/b6rkZNtCd6Mx2gvB/arcgis/rest/services/Parcels_AssessmentData/FeatureServer/0) | Wayne County | Parcel polygons with `Muni`, `PropertyClass`, `Homestead` (% principal-residence exemption). **Holds `OwnerName` / `OwnerAddress` — server-side statistics only, never `outFields`** | ArcGIS REST; last edited 2026-09 | **None stated**; the County GIS page carries a disclaimer only | Yes | **Yes — this is the denominator.** Parcels: Detroit 377,940; Dearborn 34,379; **Hamtramck 6,876; Highland Park 6,334** |
| [ACS 5-year, Census Data API](https://www.census.gov/data/developers/data-sets/acs-5year.html) | U.S. Census Bureau | Income, poverty, vehicle access, broadband, at place **and** tract level, each variable with an `E` estimate and an `M` margin of error | JSON API; yearly. Latest vintage as of today: **2020–2024, released 2025-12-11** | **No licence is stated.** The [API terms](https://www.census.gov/data/developers/about/terms-of-service.html) require the notice *"This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau."* and forbid using the data to identify any individual. Public-domain status rests on 17 U.S.C. §105, not on a sentence the Bureau publishes — see §4 | Yes; **an API key is required** (a keyless request returns *"A valid key must be included with each data API request"*) | Yes, all four at place level |
| [Census Building Permits Survey](https://www.census.gov/construction/bps/) | U.S. Census Bureau | Buildings, units and value authorised, per permit-issuing **place**, split 1-unit / 2 / 3–4 / 5+ | Comma-delimited `.txt` per region ([Midwest](https://www2.census.gov/econ/bps/Place/Midwest%20Region/)); monthly + annual. 2025 annual released 2026-05-14; `mw2025a.txt` is 8,025 lines | None stated. Authorised under Title 13 with an exception to confidentiality for public records | Yes, plain text, no blocking | **Yes — all four verified in `mw2025a.txt`, 2025 annual.** Detroit 662 one-unit buildings / 662 units / $47.6M plus 30 buildings / 1,478 units in 5+; **Dearborn 22 / 22 / $8.46M; Hamtramck 4 / 4 / $1.09M; Highland Park 0 across every class.** Scope quote: *"new privately-owned housing units authorized by building permits"* — **new residential construction only** |
| [TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | U.S. Census Bureau | Place, tract, block-group, ZCTA polygons | Shapefile + TIGERweb REST; yearly. **2025 vintage**, boundaries as of 2025-01-01. `tl_2025_26_tract.zip` is 5.4 MB | The TIGER pages state **no licence**; [catalog.data.gov](https://catalog.data.gov/dataset/series-information-for-census-tract-state-based-tiger-line-shapefiles-current) tags the tract series **CC0-1.0** | Yes | Yes; **already in use** |
| [CDC PLACES](https://www.cdc.gov/places/), [tract dataset](https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-Census-Tract-D/cwsq-ngmh) | CDC | 40 modeled tract-level health measures; 2025 release, from BRFSS 2023/2022 | Socrata API, no key needed; yearly | Socrata `license` field: **"Public Domain"** | Yes | **Yes — Wayne County MI tracts confirmed by live query.** CDC's own caveat, which must be on screen: *"Because the small area model cannot detect effects due to local interventions, users are cautioned against using these estimates for program or policy evaluations."* |

### 2.2 What each Detroit panel can and cannot become

"Same source" means the identical dataset covers all four cities. "Different source" means a panel with the same
*question* but a different owner, which docs/13 honesty rule 7 says must be named on the panel itself.

| Detroit panel (docs/13) | Detroit source | Dearborn | Hamtramck | Highland Park | Note |
|---|---|---|---|---|---|
| Help nearby, nearest food/clinic/Narcan/indoors | **Our own bundle** | **Yes** | **Yes** | **Yes** | Same code, same file. Needs a city centre (or the tract centre) instead of a neighborhood centre. Honesty rule 6 ("directory coverage is not service coverage") matters *more* here: our directory is thinnest outside Detroit |
| Parks, rec centres, greenway | City parks layer + JLG | **Yes**, SEMCOG parks | **Yes** | **Yes** | Different source. The greenway is Detroit-only and the panel must simply be absent elsewhere |
| SNAP stores | City `SNAP_Retailer_Locations` | **Yes**, via USDA | **Yes** | **Yes** | Detroit's copy stops at the city line, but the original is federal: USDA FNS publishes the national [SNAP Retailer Location data](https://usda-snap-retailers-usda-fns.hub.arcgis.com/datasets/USDA-FNS::snap-retailer-location-data/) as an open ArcGIS feature service, queryable anonymously with no key. A U.S. government work. **Values not yet checked for the three cities** |
| Bus stops | City `DDOT_Bus_Stops` | **Yes, already in the bundle** | **Yes** | **Yes** | `pnpm ingest:transit` already ships `smart_stops.json` and `ddot_stops.json` in `places/transit.json` (docs/02, eleven layers). SMART serves Dearborn; DDOT reaches Hamtramck and Highland Park. No new source is needed — only a count against the city outline |
| Property **sales**, count and median | City Assessor | **No** | **No** | **No** | **No public, name-free, machine-readable source exists.** Wayne County's Register of Deeds holds names; BS&A is a per-parcel lookup under vendor terms. This panel must be absent |
| Building **permits** | City BSEED (all permits) | Weak | Weak | **No** | The Census Building Permits Survey is the best four-city source, but it covers **new residential construction only**: 2025 gave Dearborn 22 units, Hamtramck 4, **Highland Park 0**. Showing "0 permits" beside Detroit's all-permits number would be a wrong comparison. Either a clearly-labelled *new homes permitted* panel, absent where the count is zero across every year, or no panel at all |
| **Blight tickets** per 1,000 parcels | City | **No** | **No** | **No** | No equivalent published. Absent |
| **Demolitions** | City | **No** | **No** | **No** | No equivalent published. Absent |
| Reported problems + days to close (Improve Detroit) | City | **No** (see §2.4) | **No** | **No** | Dearborn's request layer carries reporter names and is excluded on principle |
| **Fires** in buildings | Detroit Fire Department | **No** | **No** | **No** | Confirmed dead end. **NFIRS was retired on 2026-01-31** ([sunset notice](https://www.usfa.fema.gov/nfirs/sunset/)); its archive stops at 2024/25 and reporting was voluntary, so the three departments may not be in it. Michigan's Bureau of Fire Services publishes dashboards, [not data](https://www.michigan.gov/lara/bureau-list/bfs/nfirs). Its successor, [NERIS Public](https://neris.fsri.org/public), offers a rolling 60-day window whose terms are unread. None of the three cities publishes fire data. **Absent, never zero** |
| **Vacant** buildings | City BSEED registrations (rolling 12 months) | Different question | Different question | Different question | The only four-city number is **2020 Census vacant housing units**. That counts empty *homes on Census day*, not registrations. Same word, different fact — the panel must say which |
| **Roads** (% of rated main-street miles poor) | City `annual_pavement_conditions` | **Yes** | **Yes** | **Yes** | SEMCOG's TAMC layer covers all four with the same PASER method. Strong case for moving **all four cities**, Detroit included, onto the one source rather than showing Detroit from one owner and its neighbours from another |
| **Safe streets** crashes | SEMCOG | **Yes, today** | **Yes, today** | **Yes, today** | Already computed and committed |
| Rental certificates | City BSEED | **No** | **No** | **No** | Absent |
| Health context | CDC PLACES (tract) | Yes | Yes | Yes | Map only, labelled, as docs/13 already requires |
| — new — | | | | | **Owner-occupancy**: share of parcels with a 100% homestead exemption, from Wayne County's parcel layer, counted server-side. Available for all four. A "staying power" number that works everywhere |

### 2.3 What is missing everywhere

Tax foreclosures and eviction filings are still unsourced for all four cities
(docs/research/2026-09-19-wayne-county-sources.md §A). Nothing found this round changes that. The state court
data is city-level, hand-copied, and the 36th District Court's own system holds tenant names and forbids bulk
downloads.

Two sources worth ruling out explicitly, so nobody re-researches them:

- **[data.michigan.gov](https://data.michigan.gov/) has nothing usable.** Its catalog API answers an honest
  request, but the only city-level series is fiscal (Treasury's F65 local-unit financial reports). MDHHS's
  "Green Book" assistance caseloads (`GB_FIPALL`, `GB_FAMMED`, …) are **county-level and last updated
  2019-02-28**. No city-level health, food-assistance or housing indicator exists there for our three cities.
- **Data Driven Detroit cannot be cited today.** [datadrivendetroit.org](https://datadrivendetroit.org/)
  publishes reports and an ArcGIS Hub, but the Hub's DCAT feed at the domain its portal redirects to served
  **Oakland County's catalog**, no licence is stated anywhere reachable, no update dates are given, and nothing
  states that it covers Hamtramck, Highland Park or Dearborn. A person would have to open the Hub in a browser
  and record the real catalog URL, licence and dates before we could use it as a source.

### 2.4 The cities' own sites

**None of the three runs an open-data portal.** No ArcGIS Hub site, no CKAN, no Socrata. Dearborn is the only
one with its own GIS, and it is an unadvertised ArcGIS REST endpoint with no Hub, no metadata, no stated licence
and no stated cadence. Everything transactional in all three is outsourced to BS&A (and, for Highland Park,
CLEMIS).

**BS&A Online blocks us outright, and this is the single most important line in this section.** Its
[terms](https://bsaonline.com/TermsOfUse/BsaoTermsOfUse) state:

> "BS&A Software expressly prohibits the use of any software, including scripts, bots, automated processes,
> devices or any processes (including but not limited to crawlers, browser plug-ins and add-ons, or any other
> technological or manual methods) to scrape data, content, products or services made available by or through
> bsaonline.com."

> "Linking to information provided through this service for purposes commercial or otherwise is prohibited
> without the prior written consent of BS&A Software."

Dearborn (uid 599), Hamtramck (uid 621) and Highland Park (uid 728) all use it, and all three show owner names.
**BS&A is out of bounds for ingest, and we should not deep-link it either.** That closes off assessing, sales
and permits for all three cities in one sentence.

**Dearborn — the only city with machine-readable layers of its own** (org `2RWy3QS9pyfJe2ZU`; every layer's
`copyrightText` is empty, so licence is **none stated**, and none states a cadence):

| What | Layer / URL | Usable? |
|---|---|---|
| Building permits | [BS&A](https://bsaonline.com/SiteSearch/AdvancedRecordSearch?uid=599) | **No.** Lookup only, scraping prohibited, applicant names in records |
| Code enforcement, demolitions | [property-maintenance page](https://dearborn.gov/residents/home-property/property-maintenance-requirements/property-maintenance-requirements) | **No.** Narrative HTML; no ticket or violation data published at all |
| Service requests / 311 | [DearbornConnect](https://connect.dearborn.gov/), an Esri *Citizen Problem Reporter* deployment (not SeeClickFix / GOGov / Citibot) | **No.** `Requests_public` carries `pocfirstname`, `poclastname`, `created_user`, `assignedto` and free-text `details`. **There is no name-free aggregate and no public dashboard.** Excluded on principle, docs/11 |
| Fire | `Fire_Station`, `Fire_PrePlanning` | Stations yes, **incidents no** |
| Parks | [`Parks/FeatureServer/12`](https://services.arcgis.com/2RWy3QS9pyfJe2ZU/arcgis/rest/services/Parks/FeatureServer/12) | **Polygons have no names** — fields are `OBJECTID` and `Shape` only. The names, addresses, acreage and amenities for 41 parks are in the [draft 2026-2030 Parks Master Plan PDF](https://dearborn.gov/sites/default/files/2025-10/10.1.25%20DRAFT%20Dearborn%20Parks%20&%20Recreation%20Master%20Plan.pdf). Joining the two by hand is feasible and is the best piece of Dearborn-specific work available — but SEMCOG's parks layer already gives us 49 named Dearborn parks with amenities, so it is not on the critical path |
| Vacant property registry | [ordinance §11-303](https://codelibrary.amlegal.com/codes/dearborn/latest/dearborn_mi/0-0-0-7436) | Registry exists in law; **contents not published** |
| Police calls for service | [ARX Community dashboard](https://portal.arxcommunity.com/dashboards/community/mi-ci-dearborn-pd), monthly | Charts only, city-wide. Out of scope by docs/13 anyway |
| Other named layers | `Precincts_2025`, `Polling_2025`, `RoadClosures_public`, `CommAssets1`, `DDAs_Boundaries`, `CDBGBlock`, `DBNBoundary` | Well-formed, but none is an indicator |

**Hamtramck.** PDFs and forms. The genuinely useful item is the [parks page](https://hamtramckcity.gov/community/parks/):
7 named parks with addresses and amenities in plain HTML — the best owner-published parks data of the three, and
a good cross-check on SEMCOG's count of 3. A [Target Market Analysis housing study](https://hamtramckcity.gov/wp-content/uploads/2024/06/Target-Market-Analysis-Housing-Study-Final-Report.pdf)
(2024) is the nearest thing to an indicator report. Vacant-property registration and rental certification both
exist as PDF forms; **neither register is published.** Code enforcement is phone and email only — no online
reporting, no ticket data, no dashboard.

**Highland Park.** [Three map PDFs](https://highlandparkmi.gov/services/community-economic-development/maps/),
undated, and that is the whole of its spatial publishing. Building permits are handled by **email, in person,
or a flash drive**. "Report blight online" [redirects](https://www.highlandparkmi.gov/services/public-works/report-blight-online/)
to CLEMIS's police citizen-reporting system, which collects the reporter's identity and publishes no list. Its
[parks page](https://www.highlandparkmi.gov/services/parks-recreation/) names **no park at all** except the
Ernest T. Ford Recreation Center — so SEMCOG's 4 parks is the only source there is. One lead worth noting: the
city runs a [block-club registration](https://www.highlandparkmi.gov/community/highland-park-block-clubs/block-club-registration-form/)
form, so an internal block-club registry may exist. It is not published, and it would be a Tier C ask.

Highland Park's PD publishes a [CLEMIS crime map](https://www.highlandparkmi.gov/services/police-department/clemis-public-crime-search/),
updated daily. **Recorded here so nobody proposes it later: docs/13 deliberately leaves crime out, and that
does not change because a different city publishes it.**

---

## 3. Recommended design: delving into cities and neighborhoods on a map

### 3.1 The map-first entry

The Map tab already draws all four city outlines from TIGER (`ingest-basemap.ts`), so the entry point costs
nothing new in the bundle.

```
Neighborhoods tab
  └─ a map of the service area, four city outlines, nothing shaded    ← no colour-by-number: that is a ranking
     ├─ tap Detroit        → Detroit city page, with "205 neighborhoods" and the A–Z / by-district index
     │                        └─ tap a neighborhood outline → the neighborhood page we ship today
     ├─ tap Dearborn       → Dearborn city page
     ├─ tap Hamtramck      → Hamtramck city page
     └─ tap Highland Park  → Highland Park city page
  └─ "Find my area"  → device location or a typed ZIP → the city, then the neighborhood if the city has them
  └─ the A–Z list still exists and still works with no map and no location
```

**The map must never be shaded by an indicator.** Choropleth is a league table with the sort hidden
(docs/13 honesty rule 1). Outlines and labels only.

### 3.2 The honest unit per city

- **Detroit — neighborhood.** Unchanged.
- **Hamtramck — whole city.** 2.1 sq mi, 28,433 people, 6,876 parcels, 3 parks, 10.9 rated road miles. Split
  four ways, nearly every count lands under 5 and is suppressed. One page is the honest unit and it is also the
  useful one: for a resident, Hamtramck *is* the neighborhood.
- **Highland Park — whole city.** 3.0 sq mi, 8,977 people. Same reasoning, more strongly.
- **Dearborn — whole city first.** 110,000 people over 24 sq mi genuinely does have internal variation, and a
  single page hides it. But the city publishes no named unit, its 14 numbered `District_v2` polygons say nothing
  about what they are, and the tract-to-city assignment is not clean (§1.3). Ship the whole-city page, and treat
  **27 Census tracts** as a separate, later decision — worth taking only if (a) tract assignment is done from
  Census geometry and written down, (b) the page calls a tract a tract and shows its number, not a made-up
  neighborhood name, and (c) enough panels survive small-number suppression at tract scale to be worth the
  screen. On today's sources the answer is probably no: at tract scale Dearborn would have crashes, ACS and
  PLACES, and little else.

**Never invent a name.** "West Dearborn," "Springwells Park," "Aviation Sub" are real names residents use, but
no city source publishes outlines for them. Dearborn's own PDF names twelve **neighborhood associations** and
says in the same breath that they do not cover the whole city, and the tidy alphabetical neighborhood lists that
turn up in search results come from commercial aggregators (Tier D, never rehosted). Naming an outline we drew
ourselves would be exactly the "verified" problem CLAUDE.md forbids, in map form.

### 3.3 Panels per city, with the source named on each

A panel appears **only** where a public source for that city exists. Every panel prints its own source line and
date, per-city, so no two cities' numbers can be read as the same measurement unless they are.

| Panel | Detroit nbhd | Detroit city | Dearborn | Hamtramck | Highland Park | Source printed on the panel |
|---|---|---|---|---|---|---|
| Help nearby (ours) | ● | ● | ● | ● | ● | "Our directory, {n} places, updated {date}" |
| Parks and what's in them | ● | ● | ● | ● | ● | Detroit: City parks layer. Others: SEMCOG parks |
| Bus stops and Bridge-card stores nearby | ● | ● | ● | ● | ● | DDOT/SMART, already in `places/transit.json`; USDA FNS for SNAP outside Detroit |
| Safe streets (walk/bike crashes) | ● | ● | ● | ● | ● | SEMCOG, records from Michigan State Police, 2020–2024 + the required notice |
| Roads in poor condition | ● | ● | ● | ● | ● | Detroit: City. Others: SEMCOG/TAMC — **or all four from SEMCOG**, recommended |
| Empty homes | — | — | ● | ● | ● | "2020 Census: {n} of {m} homes were empty" — **a different fact from Detroit's registrations panel and labelled as such** |
| Homes lived in by their owner | ● | ● | ● | ● | ● | Wayne County parcels, % with a full homestead exemption |
| New homes permitted | — | ● | ● | ● | **—** | Census Building Permits Survey, **new residential construction only**. Absent for Highland Park: every class was 0 in 2025 |
| Sales, blight tickets, demolitions, reported problems, fires, rentals, vacant registrations | ● | ● | — | — | — | Detroit only. **Absent, not zero, not blank** — the page says "The City of Dearborn does not publish this" with no empty chart |
| Income, poverty, no car, no broadband | (later) | (later) | ● | ● | ● | ACS 5-year {vintage}, with margins of error (§3.4) |
| Health context | map | map | map | map | map | CDC PLACES, modeled, labelled |

The fixed copy from docs/13 rule 4 stays on every page. One new line is needed on every non-Detroit page:

> These numbers come from regional and national sources, because {city} does not publish its own. They are not
> the same measurements as Detroit's page, so the two pages should not be read side by side.

And the other direction, for the honesty rule against rankings: **no cross-city comparison anywhere.** No
"Detroit median vs Hamtramck," no four-city table sorted by anything. Each city is compared to itself over time.

### 3.4 ACS margins of error

ACS is a survey, and at tract and small-city level the margin of error is often large enough to swallow the
estimate. Three rules, all build-time checks, matching the spirit of docs/13 rule 2:

1. **Carry the MOE in the bundle**, always, beside the estimate. Never ship an estimate alone.
2. **Suppress when the estimate is not usable.** If the 90% MOE is more than half the estimate
   (coefficient of variation above ~30%), the number is not published — it shows as "too uncertain to say,"
   the same treatment as "fewer than 5."
3. **Show the range, not a false point.** Render "about 18% (somewhere between 14% and 22%)" rather than
   "18.3%". No sparkline of ACS over vintages: overlapping 5-year samples are not a trend, and drawing one
   would be the same mistake as a rank.

Small-city ACS is exactly where this bites: Highland Park's 5-year sample is small, so several of its estimates
will fail rule 2 and simply not appear. That is the correct outcome.

### 3.5 Bundle shape

**Recommendation: one file, extended additively — keep `indicators/neighborhoods.json`.** Not a file per city.

Reasons: "Find my area" needs every outline at once, so splitting costs an extra fetch on the one flow that has
to be instant; one file means one signature, one freshness date, and one place the honesty rules are enforced;
Android ships the whole file inside the APK so the tab works offline, and four files is four things to keep in
step; and the whole thing stays small (below).

The shape, with the same backwards-compatibility discipline used for `nearest_id` on 2026-09-22 — **nothing
existing changes, a client that knows nothing of the new keys keeps printing exactly what it printed**:

```jsonc
{
  // unchanged, Detroit only, exactly as today
  "neighborhoods": [ /* 205 Hood rows */ ],
  "sources": { /* the Detroit sources map, unchanged */ },
  "city": { /* Detroit's per-year stats, unchanged */ },

  // new
  "cities": [
    { "id": "cty_detroit",       "name": "Detroit",       "kind": "city",
      "children": "neighborhood", "rings": [ /* encoded, same origin */ ], "center": [lat, lon] },
    { "id": "cty_dearborn",      "name": "Dearborn",      "kind": "city", "children": "none",  "rings": [...] },
    { "id": "cty_hamtramck",     "name": "Hamtramck",     "kind": "city", "children": "none",  "rings": [...] },
    { "id": "cty_highland_park", "name": "Highland Park", "kind": "city", "children": "none",  "rings": [...] }
  ],
  "areas": [                       // every page that is NOT a Detroit neighborhood
    { "id": "cty_hamtramck", "city": "cty_hamtramck", "kind": "city",
      "help": { ... }, "places": { ... }, "crashes": { ... }, "now": { ... },
      "panels": ["help","parks","crashes","roads","vacant_census","homestead","acs"],
      "sources": { "parks": "src_semcog_parks", "roads": "src_semcog_pavement", ... }
    }
    // later, if tracts are taken: { "id": "trc_26163580100", "city": "cty_dearborn", "kind": "tract", ... }
  ],
  "area_sources": { "src_semcog_parks": { "name": "...", "url": "...", "last_edited": "...",
                                          "license": "...", "notice": "..." } }
}
```

Three points that are not cosmetic:

- **`sources` must become per-area-per-panel.** Today `Indicators.sources` is one flat map shared by all 205
  neighborhoods, which is right when every panel has one owner. With four cities it stops being right, and
  "never mix sources silently" turns into a schema requirement, not a copy requirement. `area_sources` is
  interned so the strings appear once.
- **`kind` is `city` | `neighborhood` | `tract` | `district`.** `district` is reserved and unused; nothing
  should ship under it until a city publishes named districts.
- **`panels` is an explicit allow-list per area.** A client draws a panel because the area lists it, never
  because a number happens to be present or absent. That makes "absent, not zero" a property of the data.

**Size.** Today `indicators/neighborhoods.json` is 611 KB raw / **75.2 KB gzipped**, with 205 outlines averaging
10.2 points each after simplification. Adding four city outlines (a city outline is more detailed than a
neighborhood's — budget ~60–100 points each after the same simplification) plus three whole-city data rows is
roughly **+3 to +5 KB gzipped**. Adding Dearborn's 27 tracts later, with a reduced panel set, is roughly a
further **+4 to +6 KB gzipped**. Both are far below the cost of a second signed file, and the file is still
fetched only when the Neighborhoods tab opens.

### 3.6 What the three clients need

The shared rule module stays the single source of truth: `packages/query` semantics, `apps/web/src/hoodfind.ts`
on web, `apps/ios/Sources/HelpCore/Hoods.swift` on iPhone, `Hoods.kt` / `Zip.kt` on Android, all held to the
same cases in `schema/neighborhoods/points.json`.

1. **Two-level point-in-polygon.** `hoodAt` becomes `areaAt`: test the four city outlines first, then, only if
   that city has children, the neighborhoods inside it. Cheaper than today (four boxes instead of 205 before
   any ray casting), and it removes the current behaviour where a point in Hamtramck returns `null`.
2. **`hood.mine_outside` changes meaning and mostly disappears.** Today it is the honest answer for a point in
   any of the three cities. After this it should fire only for a point outside all four outlines. The string
   needs rewording and both Spanish and English keys need to move together (`strings/en.json`, `strings/es.json`).
3. **ZIP lookup gets better, not worse.** `hoodsForZip` already returns a list. 48212 → Hamtramck, 48203 →
   Highland Park *and* a Detroit neighborhood (the ZIP straddles the line), 48120/48124/48126/48128 → Dearborn.
   The screen must be able to show more than one answer and say why.
4. **Android's coarse location caveat gets worse, and must be said.** Android fuzzes coarse location to a
   kilometre or two (docs/13). Hamtramck is 2.1 sq mi — that fuzz can land a Hamtramck resident in Detroit and
   vice versa. On Android, the city-level answer should be offered as "Hamtramck or nearby Detroit — is this
   right?" rather than asserted, with the typed ZIP as the exact route.
5. **Search and index.** `matchHoods` and `groupHoods` need a third grouping, "by city," and the search must
   cover the four city names as well as the 205 neighborhood names. Both new orders are still name orders; no
   indicator may reach either function, and the existing test that proves it must be extended to `areas`.
6. **The map tap target.** Tapping inside a city outline on the Map tab opens that city's page. Inside Detroit,
   the neighborhood outline wins over the city outline — most specific first, the same rule as the
   point-in-polygon.
7. **Fixtures before UI**, as always (CLAUDE.md build order): add city-boundary cases, an enclave case
   (a point in Hamtramck, a point in Highland Park), a straddling-ZIP case and an outside-all-four case to
   `schema/neighborhoods/points.json` before any screen is written, and make all three clients pass them.

---

## 4. Licence questions for Kyle

Six questions, in the order they block work.

**1. SEMCOG's Copyright License Agreement — the big one, and it gets bigger.**
[The agreement](https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement) applies portal-wide;
every dataset in SEMCOG's DCAT feed carries *"By using this data, you agree to the SEMCOG Copyright License
Agreement."* and *"When using this data, please Source: SEMCOG."*

- Grant: *"Subject to the terms and conditions of this Agreement, Licensor hereby grants Licensee a perpetual,
  non-exclusive, royalty-free license to use, reproduce, modify, distribute, publish, transmit, display and/or
  create derivative works of the Works."*
- Required notice: *"Copyright © 2019 SEMCOG. All Rights Reserved. Reproduction or Use Without Permission is
  Prohibited."* (our code inserts the layer's own year — `NOTICE()` in `ingest-crashes.ts`)
- No third-party rights: *"nothing in this Agreement will be deemed to be a grant…to use any third-party
  rights…unless such consent, approval, or agreement is first obtained by Licensee."*
- Indemnification: the licensee indemnifies SEMCOG against losses, claims, judgments, penalties and costs
  arising from breach or third-party claims; SEMCOG indemnifies back only for IP-infringement claims arising
  from authorised use. Governing law: Michigan.

This is already an Open row in DECISIONS (2026-09-20) for one panel. Under this plan it would carry **pavement,
parks, permits, census geography and crashes for three cities** — most of what those pages are. Deciding it is a
prerequisite, not a follow-up. Two sub-points: the required notice is still **not printed on the Safe streets
panel** (docs/13 says so), and the four sentences above were retrieved through SEMCOG's public ArcGIS item API
because the Hub page renders empty to a script — **a person should copy them from the rendered page before we
record them as verbatim in docs/02.**

**2. HUD's USPS vacancy data — recommend we do not use it.** Every huduser.gov URL tried
([dataset page](https://www.huduser.gov/portal/datasets/usps.html), the portal, the login, the data-licence
page) returned an **empty body** to an honest request. No 403, no challenge — just nothing. We therefore have
**no licence text at all**. Secondary sources say access is limited to registered government and non-profit
users under a sublicense tied to a stated purpose, which is exactly the kind of term that governs republishing
derived counts in a public signed bundle. Unless a person logs in and reads the agreement, this source stays
out. **The 2020 Census vacant-housing count (§2.1) answers the same question with no licence problem**, and is
the recommended substitute.

**3. Census: "public domain" needs rewording in our docs.** Neither the ACS API terms nor the Open Data page
states public domain. The correct line is: *no licence stated; a U.S. federal work, not subject to domestic
copyright (17 U.S.C. §105); the tract TIGER series is tagged CC0-1.0 on data.gov.* If we call the Data API —
even at build time — the terms require the notice *"This product uses the Census Bureau Data API but is not
endorsed or certified by the Census Bureau."* That notice needs a home, and it is worth a DECISIONS line.

**4. Wayne County's parcel layer states no licence** and holds `OwnerName`. Using it as the parcel denominator
and for an owner-occupancy share means asking a name-bearing layer for counts only — the same rule we already
apply to Detroit's sales layer, but a new owner. This was already flagged on 2026-09-19 and is still open.

**5. Dearborn's ArcGIS layers state no licence**, the same footing as Detroit's portal. Only relevant if we end
up using anything of theirs; on this plan we do not.

**6. BS&A Online is not a licence question, it is a closed door**, and it is recorded here so it is never
reopened by accident. Its terms prohibit any automated access and even purport to prohibit linking without
written consent (§2.4). All three cities' assessing, tax and permit systems sit behind it. We do not scrape it,
we do not "check it by hand at scale," and we should not deep-link it from a listing.

**7. NERIS Public terms are unread.** Only relevant if a fire panel is ever attempted outside Detroit, which on
today's evidence it should not be.

---

## 5. Sites that refused an honest script request

**No city site refused.** dearborn.gov, hamtramckcity.gov, highlandparkmi.gov, both ArcGIS hosts and
bsaonline.com all answered an honest, named request. (BS&A answered; its *terms* are what rule it out, not a
block.)

Two sources could not be read, and neither was worked around:

| Source | What happened |
|---|---|
| [huduser.gov](https://www.huduser.gov/portal/datasets/usps.html) (HUD USPS vacancy) | **Every URL returned an empty body** — the dataset page, the portal, the login and the data-licence page. No 403 and no challenge, just nothing. We therefore have no licence text at all, and the source stays out (§4) |
| [SEMCOG's licence page](https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement) and other ArcGIS Hub pages | Render empty to a script (JavaScript-only shells). The agreement text was read instead from SEMCOG's own public ArcGIS item API, which is the same content by a documented route. **A person should still copy the four sentences from the rendered page** before docs/02 quotes them as verbatim |

Three large PDFs exceeded the fetch tool's size limit and were not read: Hamtramck's Master Plan Update and both
of Highland Park's master plans. That is our limit, not a refusal — they need a manual download. **Highland
Park's master plan is the one remaining place a named neighborhood geography for that city could be hiding.**

---

## 6. Open questions

- **Is a whole-city page for Hamtramck and Highland Park worth building at all**, given that most of it would be
  our own directory plus three or four regional numbers? The argument for yes: those two cities are in the
  service area, their residents currently get a dead end from "Your neighborhood," and the crash and parks
  numbers are real. The argument for no: it invites a comparison with Detroit's page that the data cannot
  support.
- **Should Detroit's roads panel move to SEMCOG** so that all four cities' road numbers are the same
  measurement? It would make the panel comparable and cost one more dependency on the SEMCOG licence.
- **Ask the three cities directly.** None of them has been asked. Three concrete, small asks:
  **Highland Park** — the boundaries of council Districts 1, 2 and 3, which exist and are drawn nowhere.
  **Dearborn** — a named neighborhoods or association-boundary layer in the ArcGIS org they already run, rather
  than the PDF; and, if the November 2025 charter change created council districts, those polygons.
  **Hamtramck** — nothing to ask about geography (one ward), but the parks list and the vacant-property register
  would both be useful as data rather than PDFs.
- **Read the two master plans we could not open.** Hamtramck's Master Plan Update and Highland Park's Master
  Land Use Plan both exceeded the fetch size limit. Highland Park's is the last plausible hiding place for a
  named sub-city geography in that city.
- **Is "owner-occupancy from the homestead exemption" acceptable?** It comes from a Wayne County layer that
  holds owner names. We would only ever ask its server for counts, the same rule already applied to Detroit's
  sales layer — but it is a new source and a new owner (docs/research/2026-09-19-wayne-county-sources.md §Notes).
