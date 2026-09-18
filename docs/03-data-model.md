# 03 — Data Model

## Why HSDS

The Open Referral **Human Services Data Specification (HSDS)** is the de facto standard for community resource directories; 211 systems and CIEs speak it. Modeling our data as HSDS (3.x — confirm the current minor version at docs.openreferral.org before coding) means:

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

```json
{
  "x_detroit": {
    "status": "active",            // proposed | verified | active | stale | flagged | suspended | archived
    "confidence": 0.86,            // 0..1, computed; see 04
    "source": {
      "type": "owner_feed",        // owner_feed | open_data | partner_feed | press_release | seed_list | community
      "name": "DHD Wellness Stations sheet",
      "url": "https://…",
      "fetched_at": "2026-09-18T04:00:00Z",
      "record_ref": "row:17"
    },
    "verification": {
      "last_verified_at": "2026-09-14T15:22:00Z",
      "method": "phone",           // owner_feed | phone | in_person | web | community_confirm | auto_check
      "by_role": "steward",        // owner | steward | community | system
      "cadence_days": 14           // category default, overridable per row
    },
    "reports": {
      "open_count": 0,
      "last_report_at": null,
      "last_report_kind": null
    },
    "flags": ["walk_in", "no_id_required", "no_referral"],
    "supplies": ["narcan", "test_strips", "condoms"],   // harm-reduction stations only
    "capacity_note": "First-come; usually gone by 2:15",
    "archived": null               // { "at": "...", "reason": "closed_permanently", "replacement_id": "..." }
  }
}
```

## Alerts / Activations (not HSDS — our own entity)

Time-boxed things that aren't permanent resources: cold-weather respite opens Fri 8pm–Tue 9am; cooling centers extend hours through Tuesday; a mobile pantry is cancelled this week.

```json
{
  "id": "alert_2026-01-19_cold",
  "kind": "activation",           // activation | cancellation | notice
  "category": "warming",          // warming | cooling | food | health | shelter | general
  "title": "Overnight respite open through Wed Jan 21, noon",
  "body_plain": "Walk in, no referral needed. Or call the Cold Weather Line.",
  "starts_at": "2026-01-19T14:00:00-05:00",
  "ends_at":   "2026-01-21T12:00:00-05:00",
  "locations": ["loc_drmm_13130_woodward", "loc_pope_francis_center"],
  "actions": [{"label": "Call Cold Weather Line", "tel": "+18663132520"}],
  "source": {"type": "press_release", "url": "https://detroitmi.gov/node/88141"},
  "status": "published"           // draft | published | expired | retracted
}
```

Expired alerts stay in the archive (they tell us which sites activate every winter — useful for pre-seeding next year).

## Reports (community feedback — anonymous)

```json
{
  "id": "rpt_…",
  "target_id": "sal_newbethel_fh_pantry",
  "kind": "closed_permanently",   // closed_permanently | moved | wrong_hours | out_of_stock | wrong_phone | wrong_info | confirmed_ok | new_info
  "detail": "Sign on door says pantry ended in August",   // optional, max 280 chars, no PII solicited
  "suggested": { "hours": null, "address": null, "phone": null },  // optional structured correction
  "observed_at": "2026-09-18T13:40:00-04:00",
  "submitted_at": "2026-09-18T13:41:10-04:00",
  "client_nonce": "sha256(app_install_id + day)",   // dedupe within a day; NOT an identity
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
| `food.benefits` | SNAP / WIC / Double Up | "Help paying for food" |
| `shelter.emergency` | Emergency shelter (CAM) | "I need a safe place tonight" |
| `shelter.warming` / `shelter.cooling` | Warming / cooling centers | (alert-driven) |
| `shelter.dv` | Domestic violence shelter | "I'm not safe at home" |
| `harm.narcan` | Free Narcan | "Someone might overdose" |
| `harm.supplies` | Test strips, safer-use supplies | |
| `health.clinic` | Free/low-cost clinic | "I need to see a doctor" |
| `health.mental` | Mental health / crisis | "I need to talk to someone" |
| `health.dhd` | Health Department programs | |
| `utilities` | Utility shutoff help | "My lights/heat/water are being shut off" |
| `housing.rent` | Rent / eviction help | "I'm behind on rent" |
| `hygiene.shower` | Showers / laundry | |
| `transport` | Bus passes, rides | |
| `youth` / `seniors` / `veterans` / `lgbtq` | Population tags (flags, not categories) |

## Identity & IDs

- IDs are stable slugs, never reused: `org_dhd`, `loc_newbethel_8430_linwood`, `svc_fh_mobile_pantry`, `sal_newbethel_fh_mobile_pantry`.
- Owner feeds supply their own external IDs; we store them in `source.record_ref` and map, never overwrite ours.
- Archived rows keep their ID forever so old reports, alerts, and deep links resolve.

## Published dataset shape

- `data/hsds/` — valid HSDS datapackage (organizations.json, services.json, locations.json, service_at_location.json, schedules.json, …) with `x_detroit` extensions.
- `data/bundle/v{N}/` — app-optimized denormalized bundle: one gzipped JSON per category + `alerts.json` + `index.json` (version, generated_at, counts, checksum). This is what the app downloads and caches.
- Everything versioned; the app pins a bundle version and upgrades atomically.

## Freshness rules (summary — full logic in 04)

- `last_verified_at` older than `cadence_days` → `stale`.
- Two independent `closed_permanently` reports within 30 days → `flagged` (hidden from default results, shown with warning if searched).
- Steward accept → `archived` (kept, hidden, with reason and optional replacement).
- Owner feed drops a row → `stale` (not archived) until a human confirms — feeds glitch.
