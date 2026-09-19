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
    "cadence_days": 45,             // category default, overridable per row
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
- `archived` — `{ "at", "reason", "replacement_id" }` on an archived row; `null` otherwise.
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
| `rec.center` / `rec.library` | Recreation centers and libraries | (Recreation tab, not triage) |
| `seniors` / `veterans` / `lgbtq` | Population tags (flags, not categories) |

## Identity & IDs

- IDs are stable slugs, never reused: `org_dhd`, `loc_newbethel_8430_linwood`, `svc_fh_mobile_pantry`, `sal_newbethel_fh_mobile_pantry`. Other prefixes: `alert_`, `rpt_` (report), `cond_` (condition report), `prop_` (proposal), `plc_` (place), `seg_` (greenway segment), `nbh_` (neighborhood), `ph_` (photo key), `emg_` (emergency number).
- In the HSDS export, each entity's `id` is a UUIDv5 made from our slug (HSDS 3 wants UUIDs); the slug rides along in that entity's `x_detroit.id`. Same slug, same UUID, every build.
- Sources that carry their own external IDs (open data, any future partner feed) keep them: we store them in `source.record_ref` and map, never overwrite ours.
- Archived rows keep their ID forever so old reports, alerts, and deep links resolve.

## Published dataset shape

- `data/hsds/services.json` — one file: every service as nested HSDS 3.2 (organization, service_at_locations, location, address, phones, schedules inside it), with `x_detroit` extensions. Committed on each publish.
- `data/bundle/v1/` — the app bundle, plain JSON (the web server compresses it in transit). Not committed.
  - `index.json` + `index.json.sig` — version, `generated_at`, `heartbeat`, `emergency_verified`, counts, and a SHA-256 and byte size for every file below. The signature covers the exact bytes of `index.json`.
  - `category/*.json` — one file per top-level category (food, harm, health, hygiene, rec, shelter, utilities, youth).
  - `alerts.json`, `archived.json`, `emergency.json`, `events.json`.
  - `places/greenway.json`, `places/parks.json`, `places/zips.json`.
  - `map/base.json`, `map/streets.json` (docs/06).
  - `indicators/neighborhoods.json` (docs/13).
- The app checks each file against the signed index before using it, swaps to a new bundle in one step, and refuses a bundle older than the one it already holds.

## Freshness rules (summary — full logic in 04)

- The phone derives staleness from `last_confirmed_at` / `checked_at_entry` and `cadence_days`; it is not a stored state (10-A3).
- Two or more open `closed_permanently`/`moved` reports with no confirm since → badge "{count} people said this was closed. Call first." There is no separate "flagged" state: the row is **still listed**, sorted last in its distance band (10-A1).
- Steward archives it → `archived` (kept, hidden, with reason and optional replacement).
- A change in an open-data source (a row dropped or changed) shows up in the nightly pull request; the row stays as it was until a steward decides. Sources glitch.
