# Category audit, 2026-09-22

Kyle asked: *"why is the main library categorized under clothes, showers and things? Audit record categorization."*

**Short answer.** Two faults stacked. `sal_detroit_public_main_library` was the one library filed under `connect`
("Phones and internet") while the other three are `rec.library`; and the Map tab's layer `things` ("Clothes, showers,
and things") held `goods`, `hygiene`, `kids`, `youth`, `pets` **and** `connect`. Both are fixed on this branch.

## Method

- Every published listing in a fresh `pnpm build:bundle` (**531**: seed rows plus the Detroit Narcan boxes, Wayne County
  stations, Gleaners PantryNet and the other ingested layers) and the **14 proposed** seed rows: **545 rows**.
- Each row's category was judged against the row's own words (`service_name`, `what`, `eligibility`, `flags`, org),
  then against its sibling rows (same org, same kind of door). Owner pages were read only where the row was unclear
  (Detroit Public Library Main and Bowen, Hamtramck and Dearborn libraries, Ruth Ellis drop-in). No aggregator was used
  and no block was worked around.
- Result: **508 correct** (13 of them defensible-but-noted, below) · **8 changed** · **29 left for Kyle**.
- Nothing was deleted, no id changed, no row was added. Each change is an edit with a dated `internal_note`.

## The rule (DECISIONS 2026-09-22, docs/03)

**One row per service. A row has exactly one category, and it says what that row offers** — not who runs it or what
building it is in. The model has no second-category field and does not need one: HSDS is one organization, one
location, several services, and the seed already works that way (Pope Francis Center: `food.meal`, `hygiene.shower`,
`shelter.day`; the Main Library building: TLC Center `jobs.find`, adult tutoring `learn.school`, Accounting Aid
`money.tax`). A second row enters like any other: a line in `data/seed/incoming/`, `proposed`, then the own-page check
(phone + street number). Rows of one family share a category.

## Rows changed (8)

| sal_id | old → new | The row's own words |
|---|---|---|
| `sal_detroit_public_main_library` | `connect` → `rec.library` | "Main Library … Anyone can come in to get out of the heat or cold". The building row, like Bowen, Hamtramck and Henry Ford Centennial. Now also on the "too hot or too cold" screen. |
| `sal_detroit_health_neighborhood_wellness_center_at_wcccd_nor` | `health.clinic` → `health.dhd` | "Neighborhood Wellness Center … Checks for blood pressure, diabetes, and cholesterol". The other six centers are `health.dhd`; it does not say you see a doctor. |
| `sal_access_benefits_help_at_the_east_dearborn_office`, `…_hamtramck_office`, `…_main_dearborn_office` | `food.benefits` → `money.benefits` | "Help signing up for food stamps, Medicaid, cash help, and State Emergency Relief" — the same offer as the six MDHHS offices under `money.benefits`. Under `food.*` they were listed among free groceries and never on the "signing up for benefits" screen. |
| `sal_city_of_help_with_a_highland_park_property_tax_bill_you_`, `sal_city_of_help_with_a_property_tax_bill_you_cannot_pay` (Hamtramck) | `money.tax` → `housing.owner` | "If you own and live in your home and cannot pay the property tax …". Same program as Detroit HOPE and Dearborn's poverty exemption, both `housing.owner`. `money.tax` is help filing a return. |
| `sal_passenger_recovery_free_recovery_coaching_hamtramck_cent` | `treatment.outpatient` → `treatment.recovery` | "Free recovery coaching and peer support, and meetings". Its twin at the same door is already `treatment.recovery` (the steward archive of the duplicate is still open, see its note). |

## Inconsistency families

| Family | Finding | Rule / outcome |
|---|---|---|
| Libraries | 3 × `rec.library`, Main × `connect` | Building = `rec.library`. **Applied.** |
| Neighborhood Wellness Centers | 6 × `health.dhd`, 1 × `health.clinic` | `health.dhd`. **Applied.** |
| Benefits sign-up | MDHHS × 6 `money.benefits`, ACCESS × 3 `food.benefits` | `money.benefits`. **Applied.** `food.benefits` is now empty. |
| Property-tax hardship | Detroit + Dearborn `housing.owner`, Hamtramck + Highland Park `money.tax` | `housing.owner`. **Applied.** |
| Recovery coaching | same door in `.outpatient` and `.recovery` | `.recovery`. **Applied.** |
| WIC | 6 × `health.dhd`; docs/03 names WIC under `food.benefits` | Deliberate (coordinator, 2026-09-20). **Kyle** (K2). |
| Narcan vs supplies | 27 `harm.supplies` rows all stock Narcan; Dearborn's Wagner deck box has test strips but is `harm.narcan` | Categories follow DECISIONS 2026-09-20; the *need screen* is the gap. **Kyle** (K1). |
| Day centers / showers | Pope Francis has three rows (meal, shower, day center); NOAH two; Ruth Ellis drop-in is `youth` plus a shower row | One row per service holds. Ruth Ellis drop-in: **Kyle** (K4). |
| Tax help at libraries | Accounting Aid rows at Main and Henry Ford Centennial are `money.tax` at the library's address | Correct: the service is tax help; the library is only the room. |
| `jobs.find` / `jobs.training` / `learn.*` | TLC Center (computer classes + résumé help), small-business classes × 3 in `jobs.training`, Enter-Great 313 support group in `jobs.find` (found through "I have a record") | Defensible, kept. |
| `legal` vs `housing.rent` | Eviction-only lawyers are `housing.rent`; Legal Aid and Defender's housing lawyer (eviction **and** foreclosure) is `legal` | Defensible, kept: eviction-only → `housing.rent`, broader → `legal`. |
| `housing.rent` | Two housing commissions (low-rent apartments, vouchers) under "rent / eviction help" | Defensible, kept. |
| `money.benefits` | Wayne County Veterans Services gives emergency money, not sign-up help | No better slug; kept. |
| `health.clinic` vs `health.urgent` / `.er` | Clean: every clinic row states sliding fee, free, or no one turned away (or is an FQHC); no urgent care claims it | Correct. |
| `treatment.*` | Clean apart from the row above | Correct. |
| `transport`, `ids`, `pets`, `utilities`, `assault`, `shelter.*`, `food.meal/.pantry/.mobile` | Clean | Correct. |

## Rows that deserve a second service row

By their own words these doors offer a second kind of help that its need screen cannot find today. None was added:
each needs an incoming line and the own-page check.

| Door | Has | Would add | Owner's page |
|---|---|---|---|
| Main Library, Bowen Branch (DPL) | `rec.library` | `connect` "Public computers" | **Supports it**: both location pages list "Public Computers" with the address and phone. Matters most: `connect` is down to 2 rows. |
| Henry Ford Centennial Library | `rec.library` | `connect` | Partly: the site has "Computer, Print, and Fax Access"; not on the page the row cites. |
| Hamtramck Public Library | `rec.library` | `connect` | **Does not**: its home page names no computers or Wi-Fi. The row's `what` says "Free computers, Wi-Fi" — a steward should find the page that says so or trim the sentence. |
| Capuchin Soup Kitchen, Conner | shower row ("and clean clothes") | `goods.clothes` | Not re-read. |
| Auntie Na's Village, Franklin Wright, Iroquois Ave Christ Lutheran, Matrix Human Services, Perfecting CDC, Twelfth Street Food Pantry, Ebenezer | `food.pantry` whose `what` names free clothes | `goods.clothes` | Not re-read; the `what` came from their pages. `goods.clothes` has only 2 rows, so this is the cheapest way to make that screen useful. |
| Brilliant Detroit hubs × 4 | `youth` ("free diapers, clothes, food") | `goods.baby` | Not re-read. |
| Ruth Ellis drop-in | `youth`, `hygiene.shower` | see K4 | Read: "hot and non-perishable food, clothing, hygiene kits, showers, laundry", ages 13 to 30. |

## Map layers: before → after (listings / with a dot)

| Before (7) | Rows | After (8) | Rows |
|---|---|---|---|
| Free food — `food` | 144 | Free food — `food` | 141 / 140 |
| Places to sleep — `shelter` | 9 / 8 | **Shelters and day centers** — `shelter` | 9 / 8 |
| Health and Narcan — `health`, `harm` | 167 | Health and Narcan — `health`, `harm` | 167 / 167 |
| Rec centers and libraries — `rec` | 19 | **Libraries, rec centers, and internet** — `rec`, `connect` | 22 / 22 |
| Jobs and school — `jobs`, `learn` | 64 / 63 | Jobs and school — `jobs`, `learn` | 64 / 63 |
| Clothes, showers, and things — `goods`, `hygiene`, `kids`, `youth`, `pets`, `connect` | 34 / 33 | **Kids and teens** — `kids`, `youth` (new, purple `#7e22ce` / `#d8b4fe`) | 20 / 19 |
| | | **Clothes, showers, and pets** — `goods`, `hygiene`, `pets` | 11 / 11 |
| Money, housing, and papers — `housing`, `utilities`, `money`, `legal`, `ids`, `transport` | 58 | **Money, housing, papers, and rides** — same tops | 61 / 48 |

`shelter.dv` and `health.mental` rows are never drawn and are not counted; `treatment` and `assault` stay private.
Changed together: `apps/web/src/needs.ts` + `style.css`, `apps/ios/Sources/HelpCore/MapLayers.swift` +
`HelpApp/MapPalette.swift`, `apps/android/.../MapLayers.kt` + `MapPalette.kt` + both `colors.xml`, the four string
files, and the tests that pin the groups on each platform. The new colour passes the 3:1 map tests in all four themes.

**Native-review queue (machine drafts, es / ar / bn):** `layer.help.shelter`, `layer.help.rec`, `layer.help.kids`
(new key), `layer.help.things`, `layer.help.paperwork`.

## Taxonomy findings

- **Unreachable from any screen:** `shelter.warming`, `shelter.cooling` (alert-driven, no rows; on purpose).
- **Reachable only from "Browse every kind of help", from no need screen:** `hygiene.shower` (5 rows) and `youth`
  (19 rows). A web test now pins both lists, so a new category cannot ship without a way to reach it.
- **Empty:** `food.benefits` (after this audit), `shelter.warming`, `shelter.cooling`.
- **Near-empty:** `kids.care` 1, `goods.baby` 1, `health.vision` 1, `goods.clothes` 2, `connect` 2.
- **Junk drawer:** `youth` — Brilliant Detroit family houses for ages 0–8 (8), after-school and tutoring (8), the
  National Runaway Safeline, Kids-TALK (help for an abused child) and the Ruth Ellis drop-in. Its label is
  "Young people", but most of it is for parents of young children.
- **Build check:** the category regex in `pipeline/src/validate.ts` became the exported list `KNOWN_CATEGORIES` (46,
  tested). The reachability and one-layer checks live in `apps/web/test/web.test.ts`, which reads that list; putting
  them inside `validate.ts` would make the pipeline import the web app.

## Judgement calls for Kyle (not applied)

| # | Rows | Question | Recommendation |
|---|---|---|---|
| K1 | 27 `harm.supplies` + `sal_dearborn_department_free_narcan_and_test_strips_at_the_w` | "I want free Narcan" lists only `harm.narcan`, so none of the 27 Wayne County stations (Hamtramck, Dearborn, Highland Park) appear, though every one stocks Narcan. The Dearborn Wagner box has test strips but is `harm.narcan`, and looks like the same door as `sal_wws_dearborn_wagner_place_parking_garage`. | Make the Narcan need query `harm`; then re-file the Wagner row as `harm.supplies` and have a steward check the duplicate. Do both together or the Dearborn box drops off the Narcan screen. |
| K2 | 6 WIC rows | `health.dhd` (coordinator, 2026-09-20) or `food.benefits` (docs/03)? | Move to `food.benefits` and give "Help paying for food" a list as well as its links; today that screen has no listings and the category is empty. |
| K3 | `sal_goodwill_industries_a_place_of_our_own_clubhouse` | A daytime clubhouse under `health.mental`, which is *sensitive*: no address shown, no dot, listed after 988 on "I need to talk to someone". | Needs a non-crisis slug (e.g. `health.mental` split into `.crisis` / `.support`); until then keep. |
| K4 | `youth` (19), incl. `sal_ruth_ellis_drop_in`, `sal_the_guidance_kids_talk_children_s_advocacy_center`, `sal_national_runaway_safeline` | Split the drawer? | `kids.programs` for after-school, tutoring and Brilliant Detroit with a need tile ("Something for my kids"); Ruth Ellis drop-in → `shelter.day` with the `youth` flag; decide whether Kids-TALK should be private like `assault`. |
| K5 | `hygiene.shower` (5) | No need screen. | Add a "shower or laundry" choice to "I need clothes, diapers, or baby things", or to the day-center need. |
| K6 | `sal_detroit_health_vision_and_hearing_checks_for_kids` | The only `health.vision` row says "They do not give glasses"; every other DHD program is `health.dhd`. | Keep (it is an eye check, and it keeps the screen from being empty); look for a real glasses program. |
| K7 | proposed `sal_ser_metro_detroit_youth_reengagement_center` | "Help getting back into school" filed `jobs.training`. | `learn.school` when a steward approves it. |
| K8 | Libraries | After the fix the "phone, internet, or a computer" screen lists 2 places. | Import `connect` rows for Main and Bowen (pages support it), rather than let that need also list `rec.library`. |
| K9 | Layer count | 8 help layers instead of 7. | Keep 8; the alternative was "Jobs, school, and kids", which hides after-school programs behind jobs. |
