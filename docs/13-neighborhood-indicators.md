# 13 — Neighborhood Indicators (citywide)

2026-09-18. Kyle's direction: the public-data impact plan in doc 11 ("Layer B") applies to **every neighborhood in Detroit**, not only those along the Joe Louis Greenway. This doc replaces Layer B in doc 11. The greenway becomes one lens on a citywide picture.

## What it is

A static, public page per neighborhood ("How is Bagley doing?") plus a citywide view, rebuilt by the pipeline from open data. No server, no accounts, **no resident data of any kind** — it never touches reports, app usage, or anything a phone sends. It answers three questions:

1. **What help can people here reach?** (from our own directory — nobody else has this)
2. **Is the neighborhood getting investment, and is blight going down?** (City open data)
3. **Are the people who live here able to stay?** (City open data — the honesty check on question 2)

## Geography

- **Unit: the City's `Current_City_of_Detroit_Neighborhoods` layer — 205 neighborhoods**, with council district and name. *[checked 2026-09-18: public ArcGIS layer, polygons, last edited 2023-12-06.]* These are the names residents use, which matters more than statistical neatness.
- **Lenses** (saved groupings of neighborhoods, same metrics):
  - *Joe Louis Greenway study area* — the City's own ½-mile planning-study layer, so our numbers line up with theirs (doc 11).
  - *Council district* (use the 2026 boundaries).
  - Later: Strategic Neighborhood Fund areas, a rec-center or park walkshed.
- Point data (permits, tickets, sales) is assigned to a neighborhood by point-in-polygon in the pipeline. Tract-based data (Census, CDC PLACES) is shown **at tract level on a map, not re-apportioned** into neighborhoods; splitting modeled tract estimates across neighborhood lines manufactures precision that isn't there.

## Indicators

| Group | Indicator | Source *(all on data.detroitmi.gov unless noted; existence checked 2026-09-18, fields not yet)* | Shown as |
|---|---|---|---|
| **Help access** *(ours)* | Verified help listings inside or within ½ mile of the neighborhood, by category; "none listed yet" flags | Our bundle | Counts + list. Labeled as **directory coverage** until the directory is reasonably complete (see "Honesty rules") |
| | Walk distance from the neighborhood's centre to the nearest open food, clinic, Narcan, cooling site | Our bundle | Miles |
| | Parks, open greenway segments, rec centers within ½ mile | City parks / JLG / rec layers | Counts |
| **Conditions** | Blight tickets per 1,000 parcels, 12-month rolling | Blight Tickets | Trend vs. itself, and vs. city median |
| | Demolitions completed | Completed Demolitions | Count per year |
| | Illegal dumping / park / tree issues reported, and median days to close | Improve Detroit Issues | Trend + days-to-close |
| **Investment** | Building permits issued (count, and estimated value where the field exists) | Building Permits | Per year |
| **Staying power** *(lead with these)* | Residential sales: count and median price | Property Sales | Per year, with small-number suppression |
| | Tax foreclosures, eviction filings | Wayne County Treasurer / court data — **to find; may need a records request** | Per year |
| **Safe streets** | Crashes involving people walking or biking | Traffic Crashes | 3-year windows |
| **Health context** | Physical inactivity, poor mental health days, etc. | CDC PLACES (tract) | Map only, labeled "modeled estimate, about two years old — background, not a result" |

**Deliberately left out: crime.** A per-neighborhood crime panel stigmatizes blocks, feeds the people-reporting dynamic doc 11 designs out, and adds nothing the City's own dashboard doesn't already show. If a partner insists, it appears only at council-district scale, never per neighborhood.

## Honesty rules (every one is a build-time check or a fixed piece of page copy)

1. **No league tables.** No "best/worst neighborhoods" ranking anywhere. Each neighborhood is compared to itself over time first, then to the city median. Sorting the citywide table by a "badness" column is not offered.
2. **Small numbers are suppressed.** Any count under 5 in a period shows as "fewer than 5"; medians need at least 10 sales. A neighborhood with 40 homes will otherwise swing wildly and mislead.
3. **Rates need denominators we can defend.** Per-parcel or per-housing-unit from the City's parcel layer / ACS; never per "resident" from stale counts without saying the year.
4. **Descriptive, never causal.** Fixed copy on every page: "These numbers describe what happened here. They can't tell you why." Particularly for the greenway lens: the route wasn't placed at random, and before/after differences are not the greenway's "effect."
5. **Enforcement is not the same as condition.** Blight tickets measure where inspectors went as much as where blight is. Said on the chart, not in a footnote.
6. **Directory coverage is not service coverage.** Found 2026-09-18: with 91 listings, nine open greenway segments — including the new Warren–Joy–Intervale stretch — show *zero* help within a 10-minute walk. That says our directory is thin on the west side; it does not say the neighborhood has no pantry. Until a neighborhood's listings have had a coverage pass, its help-access panel reads "We haven't listed much here yet — tell us what we're missing" with the add-a-place link. This turns the weakest part of the data into the recruitment channel.
7. **Every number links to its source dataset and states its date.** Same freshness principle as the app: a panel whose source hasn't updated in a year says so.
8. **Rising prices are shown next to rising investment, always.** Investment without staying power is displacement. The page layout puts them side by side so neither can be screenshotted alone without effort.

## Architecture

- `pipeline/src/indicators/` — one ingester per dataset (ArcGIS REST, paged, incremental by date field), point-in-polygon against the neighborhoods layer, aggregation to `data/indicators/{neighborhood_id}.json` + `citywide.json` + `lenses/*.json`. Committed monthly so history is in git; built in the same GitHub Action.
- Heavy layers (blight tickets, permits) are aggregated in the pipeline; raw records are never shipped to the browser.
- Pages are static HTML/JSON on the same host as the bundle. Charts follow one small, accessible chart style (large type, labeled directly, works without color).
- In the app: neighborhood pages are **not** in the crisis path. They're reachable from About, from a greenway segment ("About this neighborhood"), and by URL for partners. `greenway_access.json` (already built by `pipeline/src/access-report.ts`) is the first indicator file.

## Order of work

1. **Done:** greenway access shed (`data/indicators/greenway_access.json`).
2. **Done 2026-09-18:** neighborhood polygons ingested (`pnpm ingest:neighborhoods`); help-access panel for all 205 neighborhoods, built into the signed bundle as `indicators/neighborhoods.json` and shown in the app at `#/n` and `#/n/nbh_…` (from About and from each greenway segment).
3. **Done 2026-09-18:** Property Sales + Building Permits, 2019 to now, in one panel. Counts and medians are added up by the City's server per neighborhood, so no sale record (and no buyer or seller name) is ever downloaded. Sales are residential, arm's-length, over $1,000. The greenway lens is the 52 neighborhoods that overlap the City's eight study-area polygons (that layer holds study sub-areas, not neighborhood names).
4. **Done 2026-09-18:** blight tickets (per 1,000 parcels, with the enforcement caveat on the chart), completed demolitions, and Improve Detroit issues with median days to close. Only four issue types are counted (illegal dumping, trees, parks, street lights): types about people, such as "Squatters Issue," are left out on purpose.
5. Crashes; PLACES tract map.
6. Foreclosure and eviction sources, once found.

Steps 2–3 are the hackathon slice if the PWA is done; the rest is v1.

## Open questions for Kyle

- Whose page is this — ours, or offered to the City/Partnership to host? (It's static files; either works.)
- Is there a partner who would review the indicator list before it's public? A neighborhood-association umbrella group would be the right critic.
