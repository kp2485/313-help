# 07 — Gap Analysis: D Compassion vs. this app

Source: reverse-engineering of `com.detroithealthdepartment.dcompassion` v1.0 (built 2024-12-10, .NET MAUI Blazor Hybrid, Radzen UI, Android only). The directory content is public program information; DHD staff are informally supportive; no written authorization exists and none is assumed (see 08).

## What D Compassion had

| Feature | As built | Keep? |
|---|---|---|
| Home screen with shelter emergency line (313-305-0311) | Static text + tel link | **Keep** — becomes the emergency strip, add CAM/Cold Weather/988/Narcan |
| Services directory (~18 DHD programs, phone + website) | Hardcoded strings in the DLL | **Keep the content**, re-verified against DHD's public pages and maintained by us |
| Intake wizard: services of interest → contact info → household → housing (living situation, problems, utilities threatened, feel safe, need safe place now) → Hunger Vital Sign (2 q) → transportation | Answers only controlled which steps appeared; nothing saved, nothing sent, nothing tailored | **Replace** with on-device triage that returns results and stores nothing |
| Contact info + household profile pages | In-memory only; "saved!" toast was cosmetic | **Drop** — no profile |
| "Someone will contact you within X time" | Placeholder; no back end | **Drop** — route "contact me" needs to 211/CIE |
| "Keep your profile updated to get notified" | No notification capability existed | **Replace** with local, opt-in reminders (v2) |
| Contributors page | "COMING SOON" | Becomes About & data sources with real attribution |
| Bootstrap/FontAwesome UI in a WebView | Functional, generic | Native UI |

## What it lacked (and what we add)

| Gap | Consequence in D Compassion | Our answer |
|---|---|---|
| No back end | Nothing worked past the UI | Static data plane + thin anonymous write plane (06) |
| No data ownership model | Directory could only change with a code release | Watched public sources, community reports, stewards, open HSDS dataset — no dependency on any institution maintaining a feed (03, 04) |
| No freshness concept | A wrong phone number lived forever | Verification dates, cadences, confidence badges (04) |
| No way to report a problem | Residents had no voice | One-tap anonymous reports + "still open" confirms (04, 05) |
| No way to add a resource | Only DHD programs existed; no food, no churches, no mutual aid | Add-a-place + provider self-listing + church pantry fast path (04) |
| No archiving | Closed resources would have remained listed | Archive with reason and replacement, visible history (04) |
| No time-boxed events | Warming/cooling/respite activations couldn't be represented | Alerts entity with start/end (03) |
| No map, no distance, no "open now" | Directory was a flat list | Map + list, RRULE-based open-now and next-occurrence (05) |
| No offline | WebView app on a phone with no data = blank | Bundled snapshot, offline-first (05, 06) |
| No iOS | Half the city excluded | iOS native + PWA now, Android native next |
| Collected PII with no protection | Blocked by city review; ethically wrong for a crisis app | Zero PII by construction (08) |
| Hardcoded to DHD only | Couldn't grow | Multi-org: city, food banks, churches, partners |
| English only | Excluded SW Detroit, Dearborn-adjacent, Bangladeshi communities | ES/AR/BN roadmap (05) |
| No accessibility work | Generic WebView | Dynamic type, screen readers, contrast targets (05) |
| App store submission never happened | Nobody at the city could complete it | Shipped independently by Linwood Technologies using public information, clearly marked as not a city app (08) |

## What we deliberately don't add

- Intake / referral capture (belongs to 211, CIE, CAM).
- Bed counts (313SafeBeds).
- Accounts, favorites synced to a server, chat, or anything requiring identity.
- Case notes for CHWs — a real need, but it's PII and a different product.
