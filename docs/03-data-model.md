# 03 — Data Model

## Why HSDS

The Open Referral **Human Services Data Specification (HSDS)** is the de facto standard for community resource directories; 211 systems and CIEs speak it. Modeling our data as HSDS (3.2) means:

- 211/CIE/DHD can ingest our dataset without a custom mapping.
- We can import any HSDS dataset a partner hands us.
- We don't reinvent Organization/Service/Location/Schedule and get them wrong.

We use HSDS **core entities as-is** and add a small set of **extension fields** for freshness, verification, reporting, and alerts. Extensions live in a namespaced object so the core stays valid HSDS.

## Core entities (HSDS)

```
Organization ─┬─< Service ─────< ServiceAtLocation >──── Location
              │      │                  │                  │
              │      ├─< Schedule       ├─< Schedule       ├─< Address
              │      ├─< Phone          ├─< Phone          ├─< Phone
              │      ├─< Eligibility    └─< Contact        └─< Accessibility
              │      └─< Taxonomy terms
              └─< Contact
```

- **Organization** — e.g. "Detroit Health Department", "Forgotten Harvest", "New Bethel Baptist Church".
- **Service** — e.g. "Mobile food pantry", "Narcan / harm reduction supplies", "WIC enrollment". One org, many services.
- **Location** — a physical place with lat/lon and address. A church is one Location hosting possibly several Services.
- **ServiceAtLocation** — the join: *this* service at *this* place, with its own schedule and phone. This is the row users actually see. Most app logic keys on `service_at_location.id`.
- **Schedule** — HSDS uses iCal RRULE fields (`freq`, `byday`, `dtstart`, `until`, `opens_at`, `closes_at`). A Forgotten Harvest mobile pantry "every Friday 1:30–2:30pm" is `FREQ=WEEKLY;BYDAY=FR` with open/close times. One-off events get `dtstart` = `until`. This is how we compute "next distribution" and "open now" correctly.

**What the phone computes from a schedule** is one of seven states — `open`, `closes_soon`, `closed`, `call_first`, `unknown`, `not_listed`, and, since 2026-09-20, **`holiday`**. They are defined once, in `schema/query-spec.md` ("Open now"), and typed once, as `OpenState` in `packages/query/src/types.ts`; nothing in these docs is the normative list. `holiday` is what a schedule-derived "open" becomes on one of the eleven US federal holidays (or the observed day when one falls at a weekend): it carries the schedule's own times as **usual** hours, never `closes_at` or `minutes_left`, ranks exactly where `call_first` ranks, and is never coloured as a kind of open. The holidays are a date rule computed on the device, so a phone with a three-month-old copy still knows what Christmas is; no list of dates is in the bundle. `always` rows (an emergency room, a crisis line) are untouched.
- **Phone, Address, Contact, Accessibility, Language, Eligibility** — per HSDS.

## Extension: `x_detroit` (per ServiceAtLocation, also allowed on Service/Location)

A real row: the app bundle's row for Auntie Na's Village food boxes (`data/bundle/v1/category/food.json`). The shape is `BundleRow` in `packages/query/src/types.ts`. There is no score: the row carries dated facts, and the phone works out the badge (04).

```json
{
  "id": "sal_auntie_na_s_free_food_boxes",
  "name": "Free food boxes, Auntie Na's Village",
  "org": "Auntie Na's Village",
  "category": "food.pantry",
  "what": "A free box of food, plus free clothes and hygiene kits.",
  "address": { "line1": "12028 Yellowstone St", "city": "Detroit", "zip": "48204" },
  "lat": 42.377459, "lon": -83.135296,
  "phones": [{ "number": "313-808-8940" }],
  "website": "https://www.auntienasvillage.org/",
  "availability": "scheduled",      // scheduled | always | call_first | unknown
  "schedules": [
    { "dtstart": "2026-09-14", "freq": "WEEKLY", "byday": "FR", "opens_at": "14:00", "closes_at": "17:00" },
    { "dtstart": "2026-09-14", "freq": "WEEKLY", "byday": "SA", "opens_at": "12:00", "closes_at": "14:00" }
  ],
  "flags": [],
  "status": "active",               // active | suspended | archived
  "facts": {
    "checked_at_entry": "2026-09-18",
    "entry_method": "auto_check",   // phone | in_person | web | community_confirm | owner_attest | auto_check
    "last_confirmed_at": null,
    "last_confirm_method": null,
    "reports": { "closed_open": 0, "closed_last_at": null, "wrong_open": 0 },
    "source": {
      "type": "seed_list",          // watched_page | open_data | partner_feed | press_release | seed_list | community | owner_feed
      "name": "Auntie Na's Village website",
      "url": "https://www.auntienasvillage.org/"
    }
  }
}
```

Optional keys, when they apply:
- `hours_text` — hours exactly as the source states them, when they could not be turned into a schedule. Shown as written; never used for "open now."
- `notice` — a short heads-up, e.g. "Enrollment is full. You can join the waitlist."
- `languages`, `eligibility`.
- `archived` — `{ "at", "reason", "replacement_id" }` on an archived row; `null` otherwise. It is never written in the seed CSV — an `archived` row with no archive record fails the build. A steward archives through the queue and the pipeline applies the D1 record at build time (docs/04, OPERATIONS).
- `flags` — plain string flags. Most describe a row (`walk_in`, `no_id_required`, `youth`, `reentry`, `immigrants`, `referral_only`, …) and are used for eligibility and for "prefer" in ranking. One changes a rule: **`open_holidays`**, set by a steward only when the owner's own page says the place is open on holidays, makes that row skip the holiday rule entirely. Nothing validates the spelling of a flag, so a typo does nothing rather than failing.
- `source.last_edited` — for open-data rows, the date the source layer was last edited.

`reports.closed_open` counts open "closed" / "moved" reports; `wrong_open` counts open wrong hours / phone / info reports.

In the HSDS export (`data/hsds/services.json`) the same fields sit in `service_at_location.x_detroit`, flat (no `facts` wrapper), next to our slug `id` and an `hsds_status` (`active`, `temporarily closed`, or `defunct`).

## Alerts / Activations (not HSDS — our own entity)

Time-boxed things that aren't permanent resources: cold-weather respite opens Fri 8pm–Tue 9am; cooling centers extend hours through Tuesday; a mobile pantry is cancelled this week.

```json
{
  "id": "alert_2026-01-19_cold",
  "kind": "activation",           // activation | cancellation | notice
  "category": "warming",          // free text, e.g. warming, cooling, food; "demo" for a demo alert
  "title": "Overnight respite open through Wed Jan 21, noon",
  "body_plain": "Walk in, no referral needed. Or call the Cold Weather Line.",
  "starts_at": "2026-01-19T14:00:00-05:00",
  "ends_at":   "2026-01-21T12:00:00-05:00",
  "targets": [],                  // listing ids (sal_) it applies to; a cancellation hides their times
  "locations": ["loc_drmm_13130_woodward", "loc_pope_francis_center"],
  "actions": [{"label": "Call Cold Weather Line", "tel": "+18663132520"}],
  "source": {"type": "press_release", "url": "https://detroitmi.gov/node/88141"},
  "status": "published"           // draft | published | expired | retracted
}
```

A person writes each alert with `pnpm alert:new` (into `data/seed/alerts.json`). It must name where it was announced (an https link), and lasts at most 7 days. A demo alert (`--demo`) gets category `demo`, says "Demo" in its title, lasts at most 3 hours, and cannot carry a phone number.

Expired alerts stay in the archive (they tell us which sites activate every winter — useful for pre-seeding next year).

## Reports (community feedback — anonymous)

```json
{
  "id": "rpt_…",                  // cond_… for a report about a place
  "target_id": "sal_newbethel_fh_pantry",
  "kind": "closed_permanently",   // listings: confirmed_ok | closed_permanently | moved | wrong_hours | wrong_phone | out_of_stock | wrong_info
                                  // places (seg_/plc_): looks_good | light_out | glass_trash | flooding_ice | path_damaged | overgrown | broken_fixture | restroom | dumping
  "detail": "Sign on door says pantry ended in August",   // optional, max 280 chars, phone numbers and emails masked before storage
  "suggested": { "hours": null, "address": null, "phone": null },  // optional structured correction; listings only
  "photo": null,                  // optional "ph_…" key from POST /v1/photos; places only
  "observed_at": "2026-09-18T13:40Z",   // cut to the minute (to the hour for places); future or older than 30 days -> null
  "submitted_at": "2026-09-18T13:41Z",  // set by the server, to the minute
  "client_nonce": "sha256(install_secret + target_id + day)",   // dedupes one device per target per day; unlinkable across targets and days
  "status": "open"                // open | accepted | rejected | duplicate
}
```

No IP retained, no device id retained. See 08.

## Taxonomy (category tags)

Keep it small and resident-worded. Map to HSDS taxonomy terms (Open Eligibility / 211 LA taxonomy) in a lookup table so 211 sees standard codes; residents see these:

| Slug | Resident label | Triage entry point |
|---|---|---|
| `food.pantry` | Free groceries | "I need food this week" |
| `food.meal` | Free hot meals | "I need food today" |
| `food.mobile` | Mobile food distribution | (schedule-driven) |
| `food.benefits` | SNAP / WIC / Double Up | "Help paying for food" (link-outs to the programs, not listings) |
| `shelter.emergency` | Emergency shelter (CAM) | "I need a safe place tonight" |
| `shelter.warming` / `shelter.cooling` | Warming / cooling centers | (alert-driven) |
| `shelter.dv` | Domestic violence shelter | "I'm not safe at home" |
| `harm.narcan` | Free Narcan | "I want free Narcan to carry" |
| `harm.supplies` | Test strips, safer-use supplies | |
| `health.clinic` | Free/low-cost clinic | "I need to see a doctor" |
| `health.mental` | Mental health / crisis | "I need to talk to someone" |
| `health.dhd` | Health Department programs | |
| `utilities` | Utility shutoff help | "My lights/heat/water are being shut off" |
| `housing.rent` | Rent / eviction help | "I'm behind on rent" |
| `hygiene.shower` | Showers / laundry | |
| `transport` | Bus passes, rides | |
| `youth` | Young people | |
| `rec.center` / `rec.library` | Recreation centers and libraries | (Map tab, not triage — the Recreation tab was merged into it on 2026-09-20) |
| `treatment.crisis` / `.detox` / `.residential` / `.outpatient` / `.meds` / `.recovery` | Walk-in crisis and sobering · Detox · Live-in treatment · Treatment while living at home · Medicine for opioid addiction · Recovery support | "I want help with drugs or alcohol" (Right now; DWIHN's 24-hour line and SAMHSA's first) |
| `assault` | Help after sexual assault | "Help after sexual assault" (Right now; Avalon, VOICES4 and 911 first) |
| `health.dental` / `health.vision` | Dentist · Eye care and glasses | "I need a doctor, dentist, or eye care" |
| `health.er` / `health.urgent` | Emergency room · Urgent care | "I need a doctor, dentist, or eye care" → *Emergency room* (911 first on that screen) / *Urgent care*. Separate from `health.clinic`, which means free or low-cost: none of these places say they are, so calling them a free clinic would make the app say something the owner's page does not. An emergency room shows as open all day and night **only** where its own page says so. |
| `housing.owner` | Help for homeowners (tax exemptions, foreclosure, repairs) | "I'm behind on rent or might lose my home" → *I own my home* |
| `shelter.day` | Day centers | "I need somewhere to go during the day" |
| `goods.clothes` / `goods.baby` | Free clothes and coats · Diapers and baby things | "I need clothes, diapers, or baby things" |
| `jobs.find` / `jobs.training` | Help finding a job · Free job training | "I want a job or job training" (Work, school, and paperwork) |
| `learn.school` / `learn.english` | GED, diploma and reading · English classes | "I want my GED or to learn English" |
| `legal` | Free legal help | "I need free legal help" |
| `ids` | IDs and birth certificates | "I need an ID or birth certificate" |
| `money.tax` / `money.benefits` | Free tax help · Help signing up for benefits | "Help with taxes or signing up for benefits" |
| `kids.care` | Child care and preschool | "Help paying for child care or preschool" |
| `connect` | Free computers, internet and phones | "I need a phone, internet, or a computer" |
| `pets` | Pet care and food | "Help with my pet" |
| `seniors` / `veterans` / `lgbtq` / `youth` / `women` / `men` / `reentry` / `disability` / `immigrants` / `pregnant` / `paid_training` / `referral_only` / language (`spanish`, `arabic`, `bengali`) / access (`walk_in`, `appointment_required`, `no_id_required`, `sliding_fee`, `medicaid`) | Flags, not categories. `reentry` = for people with a record or coming home from prison; "I have a record" lists jobs with it first |

**46 slugs in all; 44 of them had at least one live listing on 2026-09-20.** The two that do not are
`shelter.warming` and `shelter.cooling`, which are alert-driven and empty on purpose.

*Category audit, 2026-09-22 (DECISIONS; `docs/CATEGORY-AUDIT-2026-09-22.md`):* **a row has exactly one category, and it
says what that row offers.** A door with two kinds of help gets **two rows** under one `org_id` at one address (HSDS:
one organization, one location, several services), as Pope Francis Center has for its meals, showers and day center.
Rows of one family share a category: a library building is `rec.library` (its computers are in its `what`), a
Neighborhood Wellness Center is `health.dhd`, help signing up for benefits is `money.benefits`, a property-tax hardship
exemption is `housing.owner`, recovery coaching is `treatment.recovery`. Since that audit `food.benefits` has no rows
(the three that carried it were benefits sign-up offices), so 43 of the 46 slugs have a live listing. The 46 slugs are
`KNOWN_CATEGORIES` in `pipeline/src/validate.ts`. Map layers (`MAP_GROUPS`, eight of them) are listed in docs/05.

*Added 2026-09-20 (DECISIONS):* `health.er` and `health.urgent`. A row may now carry a **city and a point but no
street address** — Wayne County's naloxone and test-strip stations publish exactly that — and a coordinate is never
reverse-geocoded into an address we then print as a fact. In the HSDS export a location is `physical` when it has an
address **or** a point, and `virtual` only when it has neither.

*Added 2026-09-19 (DECISIONS):* the rows from `treatment` down. Treatment and `assault` listings are **private**: never saved and never in the browser history, with a quick exit, but they keep their address, distance and map dot (unlike DV and crisis listings, which are sensitive). Needs whose help is a program you apply for online (unemployment, Lifeline, child-care scholarships, Medicaid rides…) show link-outs to the owner's page (`apps/web/src/links.ts`), not listings.

## Identity & IDs

- IDs are stable slugs, never reused: `org_dhd`, `loc_newbethel_8430_linwood`, `svc_fh_mobile_pantry`, `sal_newbethel_fh_mobile_pantry`. Other prefixes: `alert_`, `rpt_` (report), `cond_` (condition report), `prop_` (proposal), `plc_` (place), `seg_` (greenway segment), `nbh_` (neighborhood), `ph_` (photo key), `emg_` (emergency number).
- In the HSDS export, each entity's `id` is a UUIDv5 made from our slug (HSDS 3 wants UUIDs); the slug rides along in that entity's `x_detroit.id`. Same slug, same UUID, every build.
- Sources that carry their own external IDs (open data, any future partner feed) keep them: we store them in `source.record_ref` and map, never overwrite ours.
- Archived rows keep their ID forever so old reports, alerts, and deep links resolve.

## Published dataset shape

- `data/hsds/services.json` — one file: every service as nested HSDS 3.2 (organization, service_at_locations, location, address, phones, schedules inside it), with `x_detroit` extensions. Committed on each publish.
- `data/bundle/v1/` — the app bundle, plain JSON (the web server compresses it in transit). Not committed.
  - `index.json` + `index.json.sig` — version, `generated_at`, `retired` (only when a person retires the directory), `emergency_verified`, counts, and a SHA-256 and byte size for every file below. The signature covers the exact bytes of `index.json`.
  - `category/*.json` — one file per top-level category (food, harm, health, hygiene, rec, shelter, utilities, youth, and since 2026-09-19 jobs, learn, treatment, housing, legal, ids, assault, money, goods, kids, connect, transport, pets).
  - `alerts.json`, `archived.json`, `emergency.json`. (~~`events.json`~~ — City events were dropped on 2026-09-19, so the build never writes this file and the Events tab hides itself. Corrected 2026-09-20.)
  - `places/greenway.json`, `places/parks.json`, `places/zips.json`, and since 2026-09-20 `places/transit.json` (the index of the transport layers, with each one's owner and licence text).
  - `map/base.json`, `map/streets.json` (docs/06), and since 2026-09-20 `map/transit/*.json` — the 11 transport
    layers, one file each, listed in `places/transit.json` and downloaded only when a person switches that layer on.
  - `indicators/neighborhoods.json` (docs/13).
- The app checks each file against the signed index before using it, swaps to a new bundle in one step, and refuses a bundle older than the one it already holds.

## Freshness rules (summary — full logic in 04)

- There is no staleness state. The phone shows the dates it has; only reports change what a listing says (DECISIONS 2026-09-19).
- Two or more open `closed_permanently`/`moved` reports with no confirm since → badge "{count} people said this was closed. Call first." There is no separate "flagged" state: the row is **still listed**, sorted last in its distance band (10-A1).
- Steward archives it → `archived` (kept, hidden, with reason and optional replacement).
- A change in an open-data source (a row dropped or changed) shows up in the nightly pull request; the row stays as it was until a steward decides. Sources glitch.
