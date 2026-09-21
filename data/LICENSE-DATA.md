# Licences for the data in this repository

**Apache-2.0 covers the source code. It does not cover the data files described here.**

The repository's code licence is [Apache-2.0](../LICENSE). The third-party data files under `data/ingested/` and
`data/seed/` are **not** licensed under Apache-2.0 and are not ours to license: each keeps its publisher's own
terms. Those terms are recorded per source in [`data/sources.yaml`](sources.yaml),
[`data/ingested/transit/source.json`](ingested/transit/source.json) and [NOTICE](../NOTICE), and every listing in
the app names its own source on screen.

The dataset this project publishes itself, `data/hsds/`, is **CC BY 4.0**, with a per-row source licence field,
because we can only license what is ours.

## The files that are not Apache-2.0

| File | Publisher | Terms |
|---|---|---|
| `data/ingested/transit/intercity_bus.json` | US DOT, Bureau of Transportation Statistics — NTAD Intercity Bus Atlas Stops | **CC BY-NC 4.0** (<https://creativecommons.org/licenses/by-nc/4.0/>). Attribution required; **not for commercial use**. **Not licensed under Apache-2.0.** Modified: filtered to Detroit, Hamtramck, Highland Park and Dearborn plus a surrounding margin, and reduced to the fields the app draws — 9 stops of the national file |
| `data/ingested/crashes.json` | SEMCOG, "Crash Locations, 2015-2024"; the underlying police reports are the **Michigan State Police's** (CJIC) | SEMCOG's portal-wide **Copyright License Agreement** (<https://maps-semcog.opendata.arcgis.com/pages/copyright-license-agreement>): a perpetual, royalty-free licence to reproduce, modify and publish, a **required** copyright notice (reproduced in [NOTICE](../NOTICE); printing it on the Safe streets panel is still owed), a one-way clause under which the user indemnifies SEMCOG, and a clause granting no third-party rights. **Open for Kyle:** accept the indemnification clause knowingly, or remove the layer. MSP has not been asked |
| Everything else under `data/ingested/` — the other transit layers, the basemap, the City's parks, points, stats and ZIP areas, the Joe Louis Greenway segments, the neighborhood indicators, the Health Department's harm-reduction stations | City of Detroit open data, SMART, Detroit People Mover, MDOT, US DOT BTS (Amtrak), US Census Bureau | Mixed, and mostly **unstated**: see `data/sources.yaml` and `data/ingested/transit/source.json` for each one. The Census files are US government works and the Amtrak layer is published for unrestricted public use; most City, SMART, People Mover and MDOT layers state a disclaimer and no licence grant, which is a flagged open question (`docs/DECISIONS.md`, 2026-09-20) |
| `data/ingested/wayne_well_wayne_stations.csv` | Wayne County Healthy Communities, "Well Wayne Stations" map | **Unstated.** Facts only, attributed to the County. The content is the County's; the delivery is Google's (a published Google My Map, read through its own KML endpoint). Asking the County is owed |
| `data/seed/*.csv` | Each row's own organisation, named per row | Facts a place publishes about itself, on its own page, named and dated per row. Our compilation of those facts is CC BY 4.0 with the rest of `data/hsds/`; what an organisation wrote about itself remains that organisation's |

## What that means for a fork

A fork gets the code under Apache-2.0, patent grant included, and the published dataset under CC BY 4.0. It does
not get the third-party files on those terms. A **commercial** fork in particular has to drop
`data/ingested/transit/intercity_bus.json` (the intercity bus layer on the Map tab) or get the publisher's
permission, and has to decide about SEMCOG's agreement for itself.
