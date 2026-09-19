# 09 — Roadmap & Open Questions

## Hackathon scope (this week)

Goal: a demo that is *real* — real data, real reporting, real freshness — not a mock. Judges open the app on a phone on the demo Wi-Fi and file a report that shows up in the steward queue. (Nothing is deployed yet; the laptop serves it. See DEMO.md.)

**Build order (CLAUDE.md's five steps; each is demoable on its own):**

| # | Step | Done |
|---|---|---|
| 1 | **Seed data + bundle** — `data/seed/` CSVs → `pipeline/` → signed `data/bundle/v1/` (HSDS-valid + `x_detroit`), with query fixtures before any UI. What shipped: 178 listings. 118 were checked at entry against their own site; 60 are DHD stations from DHD's own layer. | 2026-09-18 |
| 2 | **PWA (`apps/web`)** — Home, category lists, detail with open-now and next times, triage (9 entry points, a few results), offline. | 2026-09-18 |
| 3 | **`api/` Worker + D1** — `POST /v1/reports`, `POST /v1/proposals`, steward endpoints behind Cloudflare Access; report buttons and an offline queue in the app. | 2026-09-18 |
| 4 | **`admin/` steward queue** — reports and proposals, archive and restore with reasons. Demo: report a closure from a phone → it appears here → archive → rebuild → app shows "Closed as of today." A demo alert (`pnpm alert:new -- --demo`) shows auto-expiry live. | 2026-09-18 |
| 5 | **iOS** — SwiftUI shell reading the same bundle. | Partly: `DetroitQuery` passes the fixtures in CI; the SwiftUI screens are not compiled yet (needs a Mac). Until then, the web app on an iPhone is the iOS demo. |

**Cut list if behind:** notifications, provider claim flow, GTFS.

**Demo script (3 min):** the City's app, as it is in the stores today: asks your name and phone number, 115 MB, about ten installs (say only what the store listings show) → what's inside it (30 sec) → "here's the version that ships": find food this week in 3 taps offline → file a report → steward archives → app updates → "and nobody at the city had to do anything for this to stay current" (show the badge line on a listing — page watchers are not built yet — then the greenway beat from doc 11). Close on: stores nothing, freshness is the product, data outlives the app.

## v1 (public beta, ~6–8 weeks after)

- Page watchers on DHD's public program pages (not built yet). (No DHD feed or letter is assumed.)
- iOS on TestFlight, PWA public, Android native started.
- 178 listings today, each checked once at entry (the DHD stations carry the list's own date instead). No scheduled re-verification (04); emergency numbers are machine-matched against their owners' pages (`pnpm check:emergency`).
- Steward roster: Kyle + 3 community stewards (CHW, librarian, church coordinator, or outreach worker). Row count is capped by what this roster can verify (doc 10-A6).
- Spanish UI. **Done 2026-09-18** (needs a native speaker's review).
- Privacy policy, About/data sources, open dataset published. Repo public: **done 2026-09-18** (`detroit-compass`).
- First conversation with Forgotten Harvest/Gleaners about a feed.

## v1.1

- Android native (Compose).
- Arabic (RTL), Bengali.
- Provider self-listing with email verification and row ownership.
- Press-release watcher for activations (steward-confirmed).
- Local notifications for saved resources and alerts.
- 313SafeBeds link/embed when their public status exists.

## v2

- GTFS "how do I get there" with nearest route.
- HSDS export handed to 211/UWSEM CIE; explore read access to 211 data.
- Steward mobile mode (verify-on-the-go for outreach workers).
- Council-district lens. (Neighborhood pages for all 205 neighborhoods are done.)
- Health Hub / QR-code distribution program with DHD (DHD's original distribution idea for D Compassion).

## Open questions — decisions for Kyle

1. **Name.** **Decided — see DECISIONS 2026-09-19: 313 Help** (was Detroit Compass, 2026-09-18). Original question: needs to be findable, pronounceable in ES/AR, not confusable with a city product, domain available. Candidates to react to: *DetroitHelp*, *313Help*, *NearbyHelp Detroit*, *Detroit Doorway*, *OpenDoor Detroit*. (313SafeBeds already owns the "313" prefix in this space — coordinate with the 313SafeBeds team if you go that way.)
2. **Android path for the hackathon:** PWA (recommended) vs. attempting Compose. Recommendation: PWA. **Decided in practice (the PWA is the Android app); to be recorded in DECISIONS.**
3. **Code license:** **Decided — see DECISIONS 2026-09-18: Apache-2.0, dataset CC BY 4.0.** Original question: MIT vs Apache-2.0. Recommendation: Apache-2.0 (patent grant matters if a vendor ever forks it for a city). The app is open source and intended as a gift to the city — see doc 12 for what that requires.
4. **Analytics on or off at launch?** Recommendation: off for the hackathon; identifier-free aggregate counts at v1 with the About-screen disclosure. **Decided in practice (no analytics are built); to be recorded in DECISIONS.**
5. **Who are the first two community stewards?** Names, not roles.
6. **313SafeBeds involvement:** teammate on the hackathon, or partner via link-out only?
7. **Ask DHD the questions in 02** before or after the hackathon? (Recommendation: send once; assume silence.)
8. **Map tiles on the PWA:** **Decided — see DECISIONS 2026-09-18: the app draws its own street map from City open data; no tile server.** Original question: OSM/Leaflet (free, attribution required) vs. MapLibre + a tile provider (nicer, may cost). Recommendation: Leaflet + OSM for the hackathon.
9. **Do we bundle the 2023 Council homelessness guide entries as `seed_list` (confidence 0.5) or only after a verification pass?** Recommendation: only entries verified this month; the rest stay in a `to-verify` CSV. **Followed:** unchecked entries sit in `data/seed/to-verify.csv`.
10. **Domain:** register now (Cloudflare) so deep links in the demo are real.
