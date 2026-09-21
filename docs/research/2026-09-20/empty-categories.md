# Filling the empty categories (2026-09-20)

Pages read 2026-09-20 with a plain request that says who we are. Every fact in the lines comes from the
owner's own page, named as `source_url` on that line. Aggregators (findhelp, MyRide2, 211, Yelp, news
stories, search snippets) were used only to find candidates and are never the source of a fact.

Files written by this pass, and nothing else:

- `data/seed/incoming/2026-09-20-empty-categories.txt` — 12 import lines
- `docs/research/2026-09-20/wayne-county-naloxone.csv` — 26 Wayne County stations, as a data file
- this note

Nothing was imported, checked, geocoded, built or committed.

## Which categories were empty

Counted from `data/seed/resources.csv` (`status == active`) against the 44 slugs in docs/03. Seven had no
active row:

| slug | what it is | what happened |
|---|---|---|
| `shelter.warming` | Warming centers | alert-driven, stays empty on purpose |
| `shelter.cooling` | Cooling centers | alert-driven, stays empty on purpose |
| `health.dhd` | Health Department programs | another agent owns the detroitmi.gov pages |
| `transport` | Bus passes, rides | **5 lines** |
| `treatment.crisis` | Walk-in crisis and sobering | **2 lines** |
| `treatment.recovery` | Recovery support | **4 lines** |
| `harm.supplies` | Test strips, safer-use supplies | **1 line + 26 station rows** |

`health.mental` (2 active) and `kids.care` (1 active) are thin but not empty, so they were left alone.

## Lines per category

**transport (5).** Detroit Area Agency on Aging medical rides (1333 Brewery Park); City of Dearborn rides
for people 60 and over (16901 Michigan Ave); Bridging Communities rides for older adults (6900 McGraw Ave);
SMART Connector (phone only); VA Detroit's Transportation Navigation Hub and Veterans Transportation
Service (phone only).

**treatment.crisis (2).** East Detroit Crisis Stabilization Unit, 6309 Mack Ave, open 24/7, from DWIHN's own
crisis page; ECHO Detroit's Engagement Center, 1851 West Grand Blvd, 23-hour stabilization.

**treatment.recovery (4).** ECHO Detroit's recovery community organization; Passenger Recovery's Recovery
Community Center, 3901 Christopher St; Detroit Recovery Project peer recovery support at both offices
(1121 E McNichols, 1145 W Grand Blvd).

**harm.supplies (1 line).** CHAG's Life Points outreach at 1300 W Fort St, worded only from CHAG's own
service list. Plus the 26 Wayne County stations below.

Ordering rules (docs/05) are untouched: nothing here changes the *Right now* screens, DWIHN's 24-hour line
and SAMHSA's helpline still come before every treatment listing, and the crisis rows carry `walk_in` so the
"somewhere I can go today" step lists them first.

## Wayne County's station map (Kyle decided 2026-09-20)

Source: **Well Wayne Stations Location Map**, published by the Wayne County Department of Health, Human and
Veterans Services at <https://endoverdosewayne.org/>. The map itself is a Google My Map embedded on that
page; its own data is at
`https://www.google.com/maps/d/kml?mid=1fXAp9hNo57tOnuFW1DOKiae7InicBpw&forcekml=1`. The map's own
description says **"Map updated: September 14, 2026"**, which is the layer's last-edited date.

97 stations countywide; 26 are in our service area: **Detroit 13, Dearborn 6, Hamtramck 5, Highland Park 2**
(the Dearborn Heights 2 are outside it). None of the 13 Detroit stations is one of the 60 Health Department
boxes in `data/ingested/dhd_harm_reduction.csv` — the nearest DHD box to any of them is 117 m away, at a
different site. So this is new coverage, not a duplicate layer.

Every station stocks naloxone (Narcan), fentanyl testing strips and xylazine testing strips, which is why
these are `harm.supplies` and not `harm.narcan`. The map's legend states red = 24/7, purple = "not 24/7,
usually Monday-Friday during normal business hours"; that sentence is the only hours fact the source gives.

**The County states no license.** The page carries no terms of use and no license statement. This is the same
footing as the Health Department layer in `data/sources.yaml` (`license: unstated`): facts only, attributed,
and flagged for a person to ask. Recorded as a proposed DECISIONS row below.

### How it should enter — an ingest script, not seed lines

Seed lines do not fit: `import:lines` needs a phone or a street address, and the County's map gives
**neither**. It gives a site name, a city, coordinates, a station type, whether it is 24/7, where on the
property the box sits, and sometimes the host's website. That is the shape of an ingested layer, so this
pass wrote the data file `docs/research/2026-09-20/wayne-county-naloxone.csv` in the same columns as
`data/ingested/dhd_harm_reduction.csv`, plus one: **`city`**.

The DHD layer enters like this today, and the County layer should enter the same way:

1. A registry entry in `data/sources.yaml`, tier A, next to `dhd_harm_reduction`:

   ```yaml
   - id: wayne_well_wayne_stations
     name: Wayne County Well Wayne Stations location map
     tier: A
     kind: google_mymap                # new kind: KML, not ArcGIS
     url: https://www.google.com/maps/d/kml?mid=1fXAp9hNo57tOnuFW1DOKiae7InicBpw&forcekml=1
     page: https://endoverdosewayne.org/
     license: unstated   # the County's page states none; ask. Facts only, attributed (DECISIONS 2026-09-20)
     mode: publish
     max_age_days: 90
     category: harm.supplies
     org: { id: org_wayne_hhvs, name: Wayne County Department of Health, Human and Veterans Services }
     id_prefix: wws
   ```

2. A reader beside `pipeline/src/ingest-arcgis.ts` (say `ingest-mymap.ts`) that fetches the KML, takes each
   `<Placemark>`'s `<name>`, `<description>` and `<coordinates>`, splits the `[City] Site name` convention
   into `city` and `name`, pulls `Website:`, `Station Type:`, `24/7 Access:` and `Location:` out of the
   description into `extra`, and writes `data/ingested/wayne_well_wayne_stations.csv`. The map's
   `Map updated:` date is `source_last_edited`; `max_age_days` is measured against it exactly as for ArcGIS.
   There is no per-placemark id in the KML, so `record_ref` stays empty and `sal_id` is the stable slug
   `sal_wws_<city>_<site name>`. Phone and address changes then show up as a git diff of the ingested CSV and
   are approved by merging it, like every other layer.

3. Two small changes in `pipeline/src/normalize.ts` → `fromIngested`, which today is written for the DHD
   boxes only:
   - it hardcodes `city: 'Detroit'` and requires `address_1`. This layer spans four cities and has **no**
     street addresses, so the row must take `r.city` and omit `address` when `address_1` is empty. A bundle
     row without an address is already legal (`fromSeed` omits it the same way); the map dot comes from the
     coordinates the County publishes, which are present for all 26.
   - the service name and `what` are hardcoded to Narcan. For `harm.supplies` they should say what the
     County says: free naloxone (Narcan), fentanyl testing strips and xylazine testing strips, no questions
     asked, plus the `Box_Location` sentence, plus the page's own caveat that supplies depend on
     availability.

   The `24 hrs` / empty `hours_text` split in the CSV is already what `fromIngested` expects: `24 hrs`
   becomes `always`, anything else is shown as written and never becomes open-now.

4. One row (`sal_wws_detroit_wayne_county_criminal_justice_complex`) is four devices at one site with mixed
   access, so its `hours_text` is empty and its `extra` carries `Box_Location1..4`. It publishes as
   "unknown", never as open. A steward may prefer to split it.

None of this was built: **no pipeline code was edited by this pass.**

## Holds, and why

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"St. Patrick Senior Center rides, 58 Parsons St","Their services page says only 'St. Pat has long provided transportation services - both to and from the center, and to medical appointments' with no cost, area, booking, phone, address or hours. The 2022 rides post is still the only page with a number. Held since 2026-09-19",https://stpatsrctr.org/category/advocacy-home-services/
"MyRide2 (AgeWays) ride finder, 855-697-4332","A finder, not a ride: it refers older and disabled adults in four counties to other providers. Belongs on the rides link-out list, not as a listing, if a steward wants it",https://www.myride2.com/
"City of Highland Park senior SMART transportation","The page describes SMART's own Connector service and prints SMART's number (866) 962-5515 plus city hall's 313-252-0050 and 12050 Woodward Ave. Not listed separately so the same ride is not listed twice. Check whether Highland Park runs anything of its own",https://www.highlandparkmi.gov/services/senior-program/smart-transportation/
"Wayne County Healthy Communities, 9021 Joseph Campau, Hamtramck","Hosts a Well Wayne Station vending machine per the County map, but its own site names only primary care, OB-GYN, dental, pediatrics, behavioral health and immunization. No harm reduction named, so no harm.supplies listing. Would be a health.clinic candidate for a separate pass",https://www.waynecountyhealthy.com/
"SOOAR, 122 South St, Belleville","Own page names clean needles, syringes and naloxone with phone 734-697-9511, but Belleville is outside the service area (Detroit, Hamtramck, Highland Park, Dearborn)",https://www.sooar-nonprofit.org/harmreduction
"Face Addiction Now (FAN) headquarters, 43800 Garfield Rd, Clinton Twp","20+ chapters and monthly public meetings, but the headquarters is in Macomb County and no Detroit chapter page gives its own address, phone and times together. Recovery-support link-out candidate",https://faceaddictionnow.org/support
"ECHO Detroit admissions line and second number","The Engagement Center page prints a named staff member's number (313-629-0991), an extension line (313-894-8444 ext. 1110) and an unlabelled (313) 638-1195. None is listed: staff names and direct lines are never published. A steward may confirm which is the public line",https://www.echodetroit.org/services/engagement-center/
"Team East Clinic address conflict (sal_team_east_clinic)","Our row says 'Team East Clinic, 11105 Jefferson Avenue'. Team Wellness's own services page puts Team East Clinic at 6309 Mack Ave (24/7) and 11105 E Jefferson Ave under 'Team Jefferson'. One of the two is wrong; not touched by this pass",https://teamwellnesscenter.com/services/
"DWIHN Care Center, 707 W Milwaukee, under treatment","Already listed as sal_dwihn_care_center (health.mental) and as emg_dwihn_care_center. The 'somewhere I can go today' step queries category: treatment, so the Care Center never appears there. A steward decides: leave it, re-tag it, or add a treatment.crisis row",https://dwihn.org/programs-services/crisis-services
"Six Detroit syringe service programs (CHAG, Detroit Recovery Project, ECHO, Safe Point/Team Wellness, CHASS, UNIFIED)","Read again 2026-09-20: none of the six names syringe services on its own page, which is why they were held on 2026-09-19. The holds stand. CHAG's page does name 'Wound care training and supplies' and 'Free NARCAN Kits & Training', which is all the new harm.supplies line claims",https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/syringe-service-programs/find-a-syringe-service-program-near-me
```

## Needs a person with a browser

| What to open | What to check |
|---|---|
| <https://detroitmi.gov/departments/detroit-department-transportation/transportation-fares> | Answers scripts with **403**. The DDOT Reduced Fare ID: who qualifies, the 50-cent fare, whether 360 Michigan Ave and (313) 933-1300 are still printed there, and the photo/drop-off hours. It is a real counter with hours, so it could be a `transport` listing rather than only a link-out. |
| <https://detroitmi.gov/departments/detroit-health-department/programs-and-services/rides-care> | **403** to scripts. "Rides to Care" free round-trip rides for pregnant women, new mothers and caregivers of babies under one. A news story gives 313-570-6845; `to-verify.csv` already holds it as possibly ended. The Health Department's pages belong to the other agent, so it is only flagged here. |
| <https://www.accesscommunity.org/> (substance use / harm reduction) | ACCESS Dearborn hosts a 24/7 Well Wayne Station. The substance-use page could not be found from the site map by script (guessed URLs 404). Find the real page and check whether ACCESS names naloxone or supplies with its own address and phone. |
| <https://www.ruthelliscenter.org/> (Health and Wellness Center) | Highland Park, hosts a station. The health-centre page could not be found by script (404). Check address, phone, hours and whether it names harm reduction. |
| <https://www.waynemetro.org/> | Known **403** to scripts, still. Wayne Metro is the only likely route to rides in Hamtramck, Highland Park and Dearborn outside the city programs. |
| <https://endoverdosewayne.org/> Well Wayne Station Program guide (PDF) | The homepage links a program guide and a dashboard. Worth a person's eye for a licence or terms statement before the layer publishes, and for the supply-availability wording. |

## Proposed DECISIONS rows (2026-09-20)

Not written to `docs/DECISIONS.md` by this pass; Kyle or a steward adds them.

- **2026-09-20 — Wayne County's Well Wayne Stations map is a publishable source, facts only and attributed.**
  Kyle decided it today; the County's page states no licence, so it enters on the same footing as the
  Health Department layer (`license: unstated`) and someone must ask the County before we rely on it.
- **2026-09-20 — Wayne County stations are `harm.supplies`, not `harm.narcan`.** Every station stocks
  fentanyl and xylazine testing strips as well as naloxone, and that is the difference between the two
  categories.
- **2026-09-20 — an ingested layer may carry a city and no street address.** The County publishes a site
  name and coordinates but no addresses. `fromIngested` currently hardcodes Detroit and requires an
  address; a bundle row without an address is already legal, and a map dot from the publisher's own
  coordinates is honest. We never reverse-geocode a coordinate into an address we then publish as a fact.
- **2026-09-20 — a ride program may publish with a phone and no street address.** SMART Connector and the
  VA's transportation hub have nowhere to walk in, and their own pages print no street number. Requiring a
  house number would keep real help out of an empty category. The rule stays for anything with a door.
- **2026-09-20 — CHAG's Life Points is listed under `harm.supplies` on its own words only.** Its page names
  "Wound care training and supplies" and "Free NARCAN Kits & Training" but not syringes or test strips, so
  the listing says exactly that and no more. The syringe-service hold from 2026-09-19 stands.
