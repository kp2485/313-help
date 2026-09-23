# The City of Detroit's food map, cross-referenced (2026-09-23)

Kyle, 2026-09-23: *"deep dive into merging the city's food map into our app."* Social media is out of scope for now.

## What the map is

- **App:** "City of Detroit - Food Pantry Finder", an ArcGIS Experience (<https://experience.arcgis.com/experience/67edf7a2d5b14c398b03dacd6d610f97>), item last changed 2026-01-05.
- **Layer:** `food_bank_finder_data` (<https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/food_bank_finder_data/FeatureServer/0>), in the City of Detroit's ArcGIS organization (`detroitmi`, the same one our parks, ZIP and rec-center layers come from). Owner account `topsoil.integration_detroitmi`; public; **no licence, description, maintainer or contact stated** on the layer, the web map or the app.
- **Last edited 2025-11-21** (data) and 2025-11-11 (schema): ten months before this note. Some rows show it: GenesisHOPE's "Nov. 20 and Dec. 20" drive-ups and ACC's "Nov. 6, Nov. 7, Nov. 13" are last year's dates.
- **97 rows** (Detroit only; no Hamtramck, Highland Park or Dearborn): name, street address, phone (92), hours in words (96), a coordinate (97), a `Type` (Pantry 49, Hot Meal 7, both 2, blank 39), council district and neighbourhood. No website field, no eligibility, no "free" flag.

## How it comes in

`data/sources.yaml` `city_food_map`, read by `pnpm --filter @313help/pipeline ingest:opendata` like the DHD layer. It is **`mode: stage`**: rows land in `data/staging/city_food_map.csv` as candidates and are never published on their own, for two reasons:

1. **Too old to publish.** The registry's rule (`max_age_days: 90`) would stage a layer this old even if it were set to publish.
2. **The facts are the hosts', not the City's.** DHD's Narcan boxes are published straight from DHD's layer because DHD runs them. A church pantry's day and phone belong to the church; the City's map is a good second source and a lead list, but it is not the owner (docs/02, DECISIONS 2026-09-19).

The nightly publish already re-reads every ArcGIS source and opens a pull request when one changes, so **when the City edits this map, the change arrives as a reviewable diff.** Ids are stable across a City overwrite (`ref: Name+Address`; the layer has no GlobalID and two ICNA pantries share a name).

## Cross-reference with our data

| Result | Rows | What to do |
|---|---|---|
| Already in the app as food | 62 | Nothing new, but see the three tables below: phones, days, and schedules the City states that we don't. |
| **New to us** | 17 | Call, or find the host's own page. |
| Held in `to-verify.csv` | 12 | The City is now a second source for each; a call settles most. |
| A place we list for something else | 6 | A second service row (`food.*`) at the same door, after a check. |

### New to us (17)

| Name | Address | Phone (City) | Hours (City) | Type |
|---|---|---|---|---|
| Mission City Food Pantry | 20405 Schoolcraft St | 313-541-3531 | 2nd and 4th Friday of the month from 1:00pm-3:00pm | Pantry |
| Bread of Life Food Pantry | W Outer Dr | 313-928-8305 | 4th Saturday of the month from 7:30am-10:00am | Pantry |
| Redeemed Christian Fellowship | 18641 Wyoming St | 313-208-2537 | Wednesdays 1:00pm-2:00pm | — |
| Crossroads - East | 21230 Moross Rd | 313-822-5200 | Sundays 11:00am-2:00pm | Hot Meal |
| Bailey Temple | 5370 McKinley St | (313) 334-8320 | Tuesdays from 12:30pm-2:30pm and Sundays from 12:30pm-1pm | — |
| Food Hub @ St. Cunegunda (Drive-up only) | 5900 Saint Lawrence St | 313-843-4714 | Mondays, Tuesdays, and Wednesdays by appointment | Pantry |
| Holy Redeemer Food Pantry | 1721 Junction St | 313-842-3450 | Tuesdays from 11:00am to 12:00pm | Pantry |
| Military Avenue Evangelical | 1002 Military St | 313-407-2093 | 10:00am after Sunday Service on the 4th Sunday of the month | Pantry, Hot Meal |
| New Mt Hermon | 3225 S Deacon St | 313-928-2828 | Call phone number for up-to-date hours | — |
| Sainte Anne's Pantry | 1000 Sainte Anne St | 313-496-1701 | 3rd Wednesdays of the month, from 10:00am-12:00pm | Pantry |
| The Really Living Corp | 18966 Greenfield Rd | www.thereallylivingcorp.com | Mondays and Thursdays 10:00am-12:00pm | Pantry |
| Unify Detroit/Bethel A.M.E. Church | 5050 Saint Antoine St | 313-831-8810 | 2nd & 4th Wednesday of each month, from 1:00pm - 3:00pm | Pantry |
| SDM2 Education Project | 19470 Lenore Ave | 313-918-9050 | Tuesdays from 1:00pm - 3:00pm | Pantry |
| Tabernacle Missionary Baptist | 2080 W Grand Blvd | 313-899-8943 | Wednesdays 10:00am - while supplies last | Pantry |
| Body of Christ International | 9555 Saint Marys St | 313-848-9359 | Fridays from 9:00am - 11:00am | Pantry |
| Micah Nevah Non-Profit Corporation | 15924 Fenkell St | — | Thursdays and Fridays, from 10:00am - 4:00pm | Pantry |
| Core City Neighborhoods | 3301 23rd St | 313-721-7608 | Tuesdays and Thursdays, from 3:00pm - 6:00pm | Pantry |

The Really Living Corp's "phone" field holds a website; Micah Nevah has no phone; New Mt Hermon says "call for up-to-date hours" (and is already held as New Mt. Hermon Missionary Baptist, 3325 S. Deacon — the City gives 3225).

### Held leads the City also lists (12)

| Name | Address | Hours (City) | Why we held it |
|---|---|---|---|
| Developing K.I.D.S. | 24230 W McNichols Rd | Every Tuesday 10:00am - 1:00pm (Ticket # given around 8:45 AM) (Line starts at 9 AM) | [2026-09-19 new kinds of help] No phone on the site |
| Salvation Army Harding | 3735 Harding St | Pantry is appointment only Monday - Friday from 9:00am-3:00pm | [2026-09-19 SAMHSA treatment] SAMHSA gives 3737 Humboldt and 313-361-6136. Harbor Light's |
| Cass Community Social Services | 11744 Rosa Parks Blvd | 3rd Monday of the month, from 1:00pm-4:00pm | Own page gives no address or times |
| Detroit Area Agency on Aging | 1333 Park Ave | Lunch Meal Program, 1 meal per day for 5 days. Christmas and Thanksgiving meal program, must register through the meal line number. | [2026-09-20 food and shower gaps] The page is headed '2024 Congregate Meal Sites' and says |
| GenesisHOPE | 7200 Mack Ave | Drive-up on Nov. 20 and Dec. 20 at 10:00am | [2026-09-20 food and shower gaps] City map lists drive-up dates (Nov 20, Dec 20) and a pan |
| Grace Temple | 12521 Dexter Ave | 2nd Thursday of every month, from 10:00am to 4:30pm | [2026-09-20 food and shower gaps] The owner's contact page has the address and phone (313- |
| Sacred Heart Church/Saint Vincent | 3451 Rivard St | 3rd Wednesday of the month from 10:00am - 12:00pm | [2026-09-20 food and shower gaps] City map lists 3rd Wednesday 10am-12pm, 313-831-1356; th |
| Project Healthy Community - Meyers | 14000 W Seven Mile | 4th Thursday of every month, from 8:30am-11:00am. Also from 8:30am-11:00am on Nov. 26 and Dec. 18. | [2026-09-20 food and shower gaps] Owner page links only a 2023 schedule and prints no addr |
| ACC | 110 W Seven Mile | Nov. 6, Nov. 7, Nov. 13 and every following Thursday starting at 9:00am-while supplies last | [2026-09-19 new kinds of help] Phone disagrees: 313-348-4493 on ACCESS's page vs 313-348-4 |
| Church of Messiah | 231 E Grand Blvd | Wednesdays from 10:00am-12:00pm, Saturdays from 8:00am-10:30am | [2026-09-20 food and shower gaps] City map lists a pantry Wed 10am-12pm and Sat 8-10:30am; |
| Michigan Veterans Foundation | 4626 Grand River Ave | Wednesdays from 11:00am - 1:00pm | [2026-09-20 food and shower gaps] City map lists a Wednesday 11am-1pm pantry; the foundati |
| Feed Your Neighbor | 12530 Mack Ave | 3rd Mondays of the month, from 2:00pm - 4:00pm | [2026-09-20 food and shower gaps] City map and the Karmanos 2026 guide both list 3rd Monda |

### Places we list for something else (6)

| Name | Address | Phone (City) | Hours (City) | We list it as |
|---|---|---|---|---|
| Bethel Baptist Church | 5715 Holcomb Ave | 313-923-3060 | Monday, Tuesday, Friday, from 9:30am-5:00pm | health.dhd |
| Hartford Memorial Baptist Church | 14000 W Seven Mile Rd | 313-861-1285 | Mondays 11:30-4:00pm and Wednesdays 7:30am-12:00pm | health.dhd |
| Wayne Metro's Food Support | 7310 Woodward Ave | 313-388-9799 | Call for an appointment | jobs.find |
| MiSide (Drive-up only) | 3553 W Vernor Hwy | 313-481-3102 | Every other Thursday from 1:30pm - 2:30pm | learn.english |
| Laskey Recreational Center (Drive-up only) | 13200 Fenelon St | 313-628-2030 | Drive Up Every other Wednesday 1:30pm - 2:30pm | rec.center |
| Alternative for girls | 903 W Grand Blvd | 313-645-6572 | 1st and 3rd Thursdays of the month, from 8:30am - 11:00am | shelter.day |

### Days that disagree (3)

| Our row | Our days | City's days | City's words |
|---|---|---|---|
| `sal_crossroads_sunday_meal` | SU | SU, WE | Sundays Hot Meals served from 11:00am-2:00pm. Wednesdays walk-up groceries from 11:00am-1:00pm |
| `sal_greater_northwest_food_pantry` | TH | WE | Wednesdays from 8:30am to 11:00am |
| `sal_community_services_food_pantry_and_meals` | SA, TH | TH | Thursdays 10:00am-2:00pm |

### A phone the City gives that our row does not carry (19)

Eleven are Forgotten Harvest stops where we carry only Forgotten Harvest's main line: the City gives the host's own number. Never copy a number in without checking it (docs/04: a phone change is held for a steward).

| Our row | Our phone | City's phone |
|---|---|---|
| `sal_caring_community_food_pantry` | — | 313-836-4987 |
| `sal_forgotten_harvest_mobile_food_pantry_at_new_bethel_bapti` | 248-967-1500 (Forgotten Harvest main line) | 313-894-5788 |
| `sal_csk_shoppers_choice_pantry` | (313) 925-1370 | 313-925-0514 |
| `sal_forgotten_harvest_mobile_food_pantry_at_greater_emmanuel` | 248-967-1500 (Forgotten Harvest main line) | 313-864-7170 |
| `sal_forgotten_harvest_mobile_food_pantry_at_jalen_rose_leade` | 248-967-1500 (Forgotten Harvest main line) | 313-397-3333 |
| `sal_my_father_s_food_pantry` | 313-936-1537 | 313-882-3000 |
| `sal_greater_northwest_food_pantry` | 313-757-7722 | 313-345-9111 |
| `sal_gleaners_community_gleaners_fresh_market_at_western_inte` | — | 1-866-GLEANER (453-2637) |
| `sal_gleaners_community_gleaners_drive_up_food_at_urban_neigh` | — | 313-841-4447 |
| `sal_salvation_army_grandale_corps_food_pantry` | 313-835-3736 | 313-835-3736 ext 801 |
| `sal_tri_unity_enterprise_food_pantry` | 313-491-7890 ext. 13 | 313-491-7890 |
| `sal_pure_word_food_pantry_and_meals` | 313-936-7039 | 313-531-2900 |
| `sal_forgotten_harvest_mobile_food_pantry_at_gompers_brightmo` | 248-967-1500 (Forgotten Harvest main line) | 313-494-7495 |
| `sal_forgotten_harvest_mobile_food_pantry_at_nexus_detroit` | 248-967-1500 (Forgotten Harvest main line) | 313-451-2703 |
| `sal_forgotten_harvest_mobile_food_pantry_at_northwestern_com` | 248-967-1500 (Forgotten Harvest main line) | 313-533-5664 |
| `sal_forgotten_harvest_mobile_food_pantry_at_lift_up_a_child_` | 248-967-1500 (Forgotten Harvest main line) | 586-541-8339 |
| `sal_forgotten_harvest_mobile_food_pantry_at_grace_church_of_` | 248-967-1500 (Forgotten Harvest main line) | (313) 527-4944 |
| `sal_forgotten_harvest_mobile_food_pantry_at_jesus_tabernacle` | 248-967-1500 (Forgotten Harvest main line) | 313-372-3110 |
| `sal_forgotten_harvest_mobile_food_pantry_at_first_baptist_in` | 248-967-1500 (Forgotten Harvest main line) | 313-835-5477 |

### A regular pattern the City states and our row does not (35)

These rows are call-first or "some Fridays" in the app because the owner's page gave no pattern. Confirmed by a call, each can carry a real schedule and show open-now.

| Our row | What we say now | City's words |
|---|---|---|
| `sal_forgotten_harvest_mobile_food_pantry_at_new_bethel_bapti` | Tuesdays. The church says 7:30am to noon; Forgotte | Tuesdays at 8:30am |
| `sal_brightmoor_connection_client_choice_food_pantry` | Mon 1-6pm, Tue 2-7pm, Wed 10am-1pm, by appointment | Monday, Tuesday 2-7pm (Last client with appointment seen at 6:30) |
| `sal_corpus_christi_emergency_food` | By appointment. Call first. | By app. only; Thursdays |
| `sal_forgotten_harvest_mobile_food_pantry_at_greater_emmanuel` | Some Saturdays noon-2pm. Forgotten Harvest lists t | 3rd Saturday of the month |
| `sal_forgotten_harvest_mobile_food_pantry_at_jalen_rose_leade` | Some Wednesdays 11:30am-1:30pm. Forgotten Harvest | Wednesdays 11:30am-1:00pm |
| `sal_bethany_lutheran_bethany_food_bank` | 2nd and 4th Wednesday of each month at 12:30pm | 2nd and 4th Wednesay of the month 12:30-2pm (Appointments only, the week of) |
| `sal_matrix_human_food_pantry_and_clothing_closet` | Food give-away on Tuesdays. Their site gives no ti | Every 2nd and 4th Tuesday of each month, from 2:00pm-5:00pm |
| `sal_my_father_s_food_pantry` | Check-in 9am-11am. 2nd and 4th Saturdays, January | 2nd and 4th Saturday of each month, from 9:00am-11:00am |
| `sal_nativity_of_nativity_pantry` | — | Thursdays from 1:00pm-4:00pm |
| `sal_twelfth_street_food_pantry` | Alternating Fridays 10am-12pm and 1pm-3pm; the web | Every other Friday starting Nov. 7, from 10:00am-12:00pm and 1:00pm-3:00pm |
| `sal_catholic_charities_mercy_food_pantry` | By appointment. The center is open Mon-Fri 9am-3pm | Mondays and Wednesdays from 10:00am-3:00pm |
| `sal_noah_bag_lunch` | — | Mondays - Thursdays, 10:30am - 2:00pm |
| `sal_iroquois_avenue_friday_food_pantry` | Every Friday except the first Friday of the month, | 2nd, 3rd, & 4th Friday of the Month from 9:30am to 12:00pm |
| `sal_gleaners_community_gleaners_fresh_market_at_western_inte` | Wednesdays 4:30pm-6pm. Gleaners' weekly hours for | Wednesdays - Drive Up from 4:30pm - 6:30pm |
| `sal_gleaners_community_gleaners_drive_up_food_at_urban_neigh` | Some Fridays and Sundays 1:30pm-2:30pm. Gleaners l | Fridays from 1:30pm - 2:30pm Drive-Up only |
| `sal_salvation_army_grandale_corps_food_pantry` | Mon-Fri 12:30pm-4:30pm, by appointment | By appointment only Tuesday - Friday, from 1:00pm-3:00pm |
| `sal_salvation_army_temple_corps_food_pantry` | Thu 10am-11:30am, by appointment | Thursdays from 10:00am to 11:30am |
| `sal_perry_outreach_food_boxes` | — | Mondays - Wednesdays from 10:00am-2:00pm |
| `sal_tri_unity_enterprise_food_pantry` | 4th Friday 9am-noon, by appointment | Every 4th Friday of the month, from 10am-2pm |
| `sal_forgotten_harvest_mobile_food_pantry_at_gompers_brightmo` | Some Fridays 9:30am-11:30am. Forgotten Harvest lis | 2nd & 4th Fridays of the month, from 9:00am-11:30am |
| `sal_forgotten_harvest_mobile_food_pantry_at_nexus_detroit` | Some Wednesdays 2:30pm-4:30pm. Forgotten Harvest l | Wednesdays from 2:00pm-6:00pm |
| `sal_forgotten_harvest_mobile_food_pantry_at_northwestern_com` | Some Thursdays 9am-11am. Forgotten Harvest lists t | Thursdays from 8:30am-while supplies last |
| `sal_god_s_storehouse_free_groceries` | Tuesdays and Saturdays. Their site gives no times. | Tuesdays and Saturdays from 8:00am-11:30am |
| `sal_forgotten_harvest_mobile_food_pantry_at_lift_up_a_child_` | Some Thursdays 2pm-4pm. Forgotten Harvest lists th | 1st and 3rd Thursdays of the month, from 2:00pm-4:00pm |
| `sal_forgotten_harvest_mobile_food_pantry_at_grace_church_of_` | Some Fridays 9am-noon. Forgotten Harvest lists the | 2nd and 4th Fridays of the month, from 9:00am-12:00pm |
| `sal_pilgrim_baptist_food_for_the_soul_food_program` | Weekly. Their site does not give the day or time. | Thursdays from 9:00am-12:00pm |
| `sal_gleaners_community_gleaners_drive_up_food_at_new_paradig` | Some Fridays 9am-10am. Gleaners lists the dates ah | Every other Friday from 9:00am - 10:00am |
| `sal_perfecting_community_community_care_center` | — | By appointment Mon - Thurs. from 9:00am-5:00pm, and 9:00am-1:00pm Friday. Drive-up pantry on 4th Wednesday of every month from 1:30pm-2:30pm. |
| `sal_st_john_s_hot_meal` | — | 3rd Friday of every month, from 9:00am-1:00pm |
| `sal_scott_memorial_food_pantry` | — | 3rd Thursdays of the month, from 12:00pm-2:00pm. |
| `sal_straight_gate_drive_thru_food_pantry` | 1st and 4th Thursdays of each month, starting at 9 | 1st and 4th Thursdays of the month, from 9:00am - while supplies last |
| `sal_forgotten_harvest_mobile_food_pantry_at_jesus_tabernacle` | Some Wednesdays 9am-noon. Forgotten Harvest lists | Wednesdays from 9:00am - 12:00pm |
| `sal_forgotten_harvest_mobile_food_pantry_at_first_baptist_in` | Some Wednesdays 9am-11am. Forgotten Harvest lists | Wednesdays from 9:00am - 11:00am |
| `sal_greater_quinn_food_pantry` | Mon-Fri 9am-3pm, by appointment | Mon-Fri 9:00am - 3:00pm |
| `sal_icna_relief_michigan_muslim_family_services` | 2nd Saturday of every month 11am-1pm | 2nd Saturday of the month, 11:00am-1:00pm |

## The call sheet

One call settles a row. Ask the same four things every time, and write the answer and the date in the row's `internal_note`:

1. Do you still give out free food at *this address*?
2. Which days and times? Is it every week, or which weeks of the month?
3. Does anyone need an appointment, an ID, or to live in a certain area?
4. Is this the best number for people to call?

Order: the 17 new and 12 held first (they add places), then the 35 patterns (they turn "call first" into open-now), then the 19 phones and 3 day conflicts.

## Open

- **Licence:** none stated; the same footing as the City's transit layers (DECISIONS 2026-09-20). Ask the City, with the transit layers.
- **Who maintains it:** unknown. Worth asking the City who updates the Food Pantry Finder and how often; if it becomes current again, a steward could decide to publish from it with an honest "from the City's food map" badge.
