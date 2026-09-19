# 02 — Data Sources

Research snapshot as of 2026-09-18. "Verified" means the URL/feed was seen in a search result; "to verify" means the access method is a strong assumption that needs a five-minute check before Claude Code builds an ingester against it.

## Access tiers

- **Tier A — Machine-readable, open license.** Build an automated ingester. Diff on every fetch. **Machine-readable is not the same as current:** the ingester records the layer's last-edit date, rows enter as candidates in `data/staging/` and get the same one-time entry check as anything else, and staff contact names in a layer are never ingested. (Found 2026-09-18: the Recreation Centers layer was last edited Nov 2016.)
- **Tier B — Published but human-readable (web page, PDF, press release).** Semi-automated: scrape or parse, but a human confirms diffs before publish.
- **Tier C — Owned by a partner, not open.** Manual entry by us, or (only if a partner volunteers) a feed they maintain. Partnership or written permission required. **No Tier C feed exists today; don't plan around one.**
- **Tier D — Third-party aggregators.** Do NOT rehost. Use for gap-finding and cross-checking only; link out if useful. Respect ToS.

## Source inventory

### City of Detroit

| Source | What | Tier | Access | Refresh | Freshness risk | Notes |
|---|---|---|---|---|---|---|
| Detroit Open Data Portal (data.detroitmi.gov) | ArcGIS Hub; datasets have REST/GeoJSON endpoints | A | ArcGIS Hub API: each dataset exposes `/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson` (**to verify per dataset**) | Varies | Low for facilities | Council district boundaries changed on 2026-01-01. Use the "Council Districts 2026" layer |
| Recreation Centers dataset | Rec centers with addresses; these double as cooling centers. **Layer last edited 2016-11-16, 11 rows** | A (stale) | `RecCenters/FeatureServer/0` on services2.arcgis.com/qvkbeam7Wirps6zC | Rare | Hours change seasonally | Only staged (`data/staging/rec_centers.csv`), never published. The 16 rec centers in the app were entered by hand, each checked against its page on the City's site (see "Recreation centers page" below) |
| DHD Harm Reduction Wellness Stations | **Found 2026-09-18: the map is a public City layer, `DHD_Harm_Reduction_List_view`, 61 stations (3 vending machines, 54 newsstands, countertops, a wall mount), each with host phone, hours text, indoor/outdoor, and a stable GlobalID. Last edited 2026-08-26 — DHD does maintain this.** The old text list in the page HTML is commented out and partly wrong; don't use it | **A** | The public layer `DHD_Harm_Reduction_List_view`, read by `pnpm ingest:opendata` into `data/ingested/dhd_harm_reduction.csv` | DHD adds stations over time | **High** — stations move, get vandalized, run out of stock; "list will be updated as more are added" | 60 stations inside the city are published with the `source_listed` badge ("From the {list}, last updated {date}"), with no per-station check (Kyle, DECISIONS). Nobody phones them. Cadence 45 days. DHD has not offered to maintain a feed for us; a change to the layer arrives as a pull request that a steward merges |
| DHD program directory | The ~18 programs hardcoded in D Compassion (WIC, Lead Safe, SisterFriends, HIV/STI, CeaseFire, immunizations, animal care, vital records, etc.) (not in the directory yet) | B | Seed from DHD's public program pages (cross-check against the APK strings; the website wins), maintained by us with a page watcher (not built yet) | Rare | Low–medium (phone numbers, hours) | Include the public-health emergency line 313-933-3437 |
| Warming centers / cold-weather respite / cooling centers | Seasonal + ad-hoc activations announced by press release; respite sites e.g. DRMM 13130 Woodward, Pope Francis Center 2915 W Hancock; cooling = all rec centers + DPL branches | B | A person reads the City's announcement and writes the alert by hand with `pnpm alert:new` (no feed reader or parser exists) | Event-driven, often 24–96 hour windows | **Very high** — these expire by design | Model as **Alerts/Activations** with start/end, not as permanent resources. Same HelpLine number, 866-313-2520 |
| CAM Detroit (Coordinated Assessment Model) | Shelter access: 313-305-0311; in-person sites (Cass Community Social Services 11850 Woodrow Wilson; NOAH at Central 23 E Adams); camdetroit.org/cam-access-points | B | Static page; hours change | Occasional | Medium | Run by HRD/HAND, not DHD. **Number conflict (10-A9):** the City now sends shelter seekers to the Detroit Housing Resource HelpLine, 866-313-2520; camdetroit.org still shows 313-305-0311. The app uses the number the City publishes, 866-313-2520 (DECISIONS: "Use the currently published numbers"). Whichever is current is the front door for "I need a bed tonight" — never route around it |
| Council President's Homelessness Resource Guide (PDF, 2023) | Showers, shelters, warming/cooling, DV, veterans, youth/LGBTQ+ resources | B | PDF on detroitmi.gov | Stale | High — 2023 | Use as a **seed list to verify**, not as truth |
| Detroit Public Library | Branches double as daytime respite (heat and cold) | A/B | detroitpubliclibrary.org/locations; branches may be on the open data portal (**to verify**) | Rare | Low | Hours vary per branch |
| DDOT | Transit centers (vending station hosts), GTFS for "how do I get there" | A | GTFS static feed (see "DDOT GTFS" below) | Quarterly | Low | v2 feature; don't block hackathon on it |
| Police precincts | Safe places, listed in cold-weather releases | A | Open data portal | Rare | Low | Low priority |

### Food

| Source | What | Tier | Access | Refresh | Freshness risk | Notes |
|---|---|---|---|---|---|---|
| Forgotten Harvest | Mobile pantry map at forgottenharvest.org/find-food; many sites are churches (e.g. New Bethel Baptist, 8430 Linwood — a Forgotten Harvest mobile pantry) | B → C | Public map (scrape **only with permission**); better: ask FH for a data feed or a partner spreadsheet. Phone 248-967-1500 | Weekly schedules; sites open/close monthly | **High** — schedules and sites shift | Highest-value partnership after DHD. Their "find food" data already has schedules; we add on-the-ground verification |
| Gleaners Community Food Bank | Mobile drive-up distributions (pantrynet.org/mobile-distribution-events), plus partner pantries, shelters, soup kitchens; 866-453-2637 | B → C | Public event listings; ask for feed | Weekly | High | Same approach as FH |
| Wayne County Food Finder | engage.waynecountymi.gov/foodfinder | B | Web map (**to verify** if ArcGIS-backed) | Unknown | Medium | Cross-check source |
| City food-access map by council district | An ArcGIS Experience (experience.arcgis.com/…/Search-by-Council-District) referenced in a 2026 pantry guide | A? | **To verify** — if this is a city feature layer of food resources it's a major Tier A source | Unknown | Unknown | Inspect the map's network calls to find the layer and its owner; no reply from DHD needed |
| Church pantries (independent) | Hundreds of churches host pantries or FH/Gleaners distributions | C | **Self-registration** via the app's "add a resource" flow + steward verification | Weekly schedules | High | This is the community-contribution case the lifecycle doc is built around |
| Capuchin Soup Kitchen, Focus: HOPE, Salvation Army Conner Creek, St. Suzanne Cody Rouge, Perry Outreach | Established food orgs | B | Their sites | Occasional | Medium | Seed list |
| Karmanos "Summer Food Pantry Resource Guide" (PDF, dated 6/29/26) | Curated list of pantries with schedules for Detroit & SE Michigan | B | PDF | Semi-annual | Medium | Excellent seed list with dates — but a PDF is a snapshot |
| Double Up Food Bucks, SNAP/MI Bridges, WIC | Benefits programs | B | State sites | Rare | Low | Link-outs, not locations |

### Health & harm reduction

| Source | What | Tier | Notes |
|---|---|---|---|
| DHD wellness stations | See above | B/A | The flagship |
| Michigan pharmacies (Narcan OTC) | Narcan is available without a prescription at most pharmacies | — | Don't try to list every pharmacy; show a one-line fallback on the Narcan screen |
| FQHCs (federally qualified health centers) | Listed on DetroitData/HRSA | A | HRSA data is open; low churn |
| 988 / crisis lines | 988 Suicide & Crisis Lifeline, DWIHN 24/7 line 800-241-4949 | — | In `data/seed/emergency.csv`; `pnpm check:emergency` matches each number against its owner's page |
| Detroit Public Health emergency line | 313-933-3437 | — | Static |

### Housing, utilities, legal

| Source | Notes |
|---|---|
| CAM (see above) | Front door for shelter |
| 313SafeBeds | Partner. Link/embed public bed status when available. Do not model beds ourselves |
| THAW, Wayne Metro Community Action Agency (Connect Center 313-388-9799; 734-284-6999 appears only on older flyers), DTE Energy assistance, Detroit Water & Sewerage assistance | Utility shutoff help — these are the "my utilities are being shut off" triage targets. Tier B |
| Detroit Housing Commission (313-877-8000) | Low-income housing |
| Eviction defense (Detroit right-to-counsel, 36th District Court self-help), UCHC | v1.1 |

### Referral networks (partners, not sources)

| Source | Notes |
|---|---|
| Michigan 211 / UWSEM CIE | The authoritative human-services database, **not open data**. Their format aligns with HSDS. Goal: publish our dataset as HSDS so 211 can consume it and, eventually, negotiate read access. Don't scrape 211 |
| findhelp.org, Lemon Tree (foodhelpline.org), 1degree.org, freefood.org | Tier D aggregators. Lemon Tree's crowd-sourced "average wait time" and "reviews" model is worth studying for our reporting UX. Do not rehost their data |

### Recreation, transit, events (added 2026-09-18, all checked that day)

| Source | What | Tier | Notes |
|---|---|---|---|
| City Parks layer (`city_parks/FeatureServer/0`) | 302 parks: name, address, type, acreage, coordinates. **No amenities.** Last edited 2026-09-14 | A | `pnpm ingest:opendata` → `data/ingested/city_parks.json`. A staff-owned `Parks_v2` layer has amenity columns but was last edited 2022 and isn't published by the open-data account: not used |
| City calendar (detroitmi.gov/Calendar-and-Events) | ~70 upcoming events | B | **No RSS, iCal, or JSON feed exists** (every candidate URL is 404 or blocked). Since about 2026-09-19 detroitmi.gov answers scripted requests with a bot-protection challenge, and we don't get around it. **Not read; no events ship** until the City offers a feed (DECISIONS 2026-09-19). Ask the City for one. |
| Recreation centers page | 17 centers, each with a subpage for address, phone, hours | B | 16 are listed, entered by hand and each checked against its City page by `pnpm check:sources`. The 2016 open-data layer is only staged |
| DDOT / SMART / People Mover / QLINE / MoGo | Links, fares, phone numbers | B | In `apps/web/src/transit.ts` with a `checked` date. The City's pages disagree about which app they recommend (Bus Tracker, Token Transit, Transit), so we list them without calling one official. MoGo's Access Pass asks for a state benefits case number: link out only |
| DDOT GTFS (`ddot_gtfs.zip`, 9.4 MB, updated 2026-09-02) | Stops, routes, schedules | A | Not ingested yet. Next step for "nearest stop" on each listing |

## Ingestion strategy summary

1. **Seed CSVs in the repo are the first pipeline** (`data/seed/*.csv`, maintained by stewards by pull request). A **page watcher** on DHD's public program pages is planned (not built yet): it would hash the relevant section nightly and open a steward task when it changes. We never auto-publish from a watched page. There is no DHD spreadsheet and none is planned; if any org later volunteers a feed, it plugs in as one more source.
2. **Open data ingesters** (all read-only; output is committed, so a change shows up as a git diff):
   - `pnpm ingest:opendata` runs three: the ArcGIS layers in `data/sources.yaml` (DHD stations → `data/ingested/`; rec centers → staged only in `data/staging/`), the Joe Louis Greenway segments, and the City's events, parks and ZIP areas.
   - `pnpm ingest:neighborhoods`: the 205 neighborhoods and their public-data numbers (doc 13).
   - `pnpm ingest:basemap`: streets, parks and the city boundary for the app's map.
   Libraries and precincts are not ingested yet.
3. **Alerts** for activations (warming/cooling/respite) are written by a person with `pnpm alert:new` from the owner's announcement. A press-release watcher is planned (not built yet); it would only draft, and a person always publishes.
4. **Food listings** — each site was researched on the organization's own site and checked with `pnpm check:sources` (or read by a person in a browser when the site blocks scripts). Nothing is copied from Forgotten Harvest or Gleaners lists. A church that hosts their distribution may be listed when the church's own site says so. In parallel, ask FH and Gleaners for a feed.
5. **Community add/report** — see 04.

**Note, 2026-09-19:** detroitmi.gov and the City calendar began answering 403 to scripted requests. Events keep the last good file; listings and the shelter line whose page is on that site need a person's check (DECISIONS).

## What to ask DHD for (optional — nothing blocks on a reply)

DHD has been informally supportive but has not signalled it will maintain anything. Send this once; build as if the answer is silence.

- Is the council-district food-access ArcGIS map a DHD product, and is its layer public?
- The current DHD program list with a named contact per program.
- Whether they'll introduce us to Forgotten Harvest / Gleaners data contacts.
