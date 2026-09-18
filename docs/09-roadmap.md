# 09 — Roadmap & Open Questions

## Hackathon scope (this week)

Goal: a demo that is *real* — real data, real reporting, real freshness — not a mock. Judges should be able to install the PWA on their own phone and file a report that shows up in the steward queue.

**Build order (each step is demoable on its own):**

1. **Seed data + bundle** — `data/seed/*.csv`: emergency numbers, 20 DHD programs (from the APK), 25 wellness stations (from the DHD list/press coverage), CAM access points, 6 warming/cooling/respite sites, ~30 food sites (Forgotten Harvest/Gleaners hosts + Capuchin + Focus: HOPE + a dozen churches, verified by a phone call or a current listing). Pipeline builds `bundle/v1`. **This alone is a demo.**
2. **PWA (apps/web)** — Home with emergency strip, category list, detail with open-now/next-occurrence, map optional. Installable, offline via service worker.
3. **Triage** — the on-device flow, 8 entry points, 3 results.
4. **Reporting** — Worker + D1, `POST /v1/reports`, detail-screen buttons, offline queue.
5. **Steward queue (minimal)** — one page listing reports and proposals with accept/reject/archive; republish button. Demo: report a closure from a phone → it appears here → archive → rebuild → app shows "Closed as of today."
6. **One alert** — a hand-written cold-weather activation with an `ends_at` an hour after the demo, to show auto-expiry live.
7. **iOS** — if time: SwiftUI shell reading the same bundle. If not, the PWA on an iPhone is the iOS demo.

**Cut list if behind:** map (list is fine), Saved, search, languages, notifications, provider claim flow, GTFS.

**Demo script (3 min):** the City's app, as it is in the stores today: asks your name and phone number, 115 MB, about ten installs (say only what the store listings show) → what's inside it (30 sec) → "here's the version that ships": find food this week in 3 taps offline → file a report → steward archives → app updates → "and nobody at the city had to do anything for this to stay current" (show a page-watcher task, then the greenway beat from doc 11). Close on: stores nothing, freshness is the product, data outlives the app.

## v1 (public beta, ~6–8 weeks after)

- Page watchers live on DHD's public harm-reduction and program pages. (No DHD feed or letter is assumed.)
- iOS on TestFlight, PWA public, Android native started.
- ~60–100 resources, each checked once at entry. No scheduled re-verification (04); the ~15 safety-critical rows are phoned monthly.
- Steward roster: Kyle + 3 community stewards (CHW, librarian, church coordinator, or outreach worker). Row count is capped by what this roster can verify (doc 10-A6).
- Spanish UI.
- Privacy policy, About/data sources, open dataset published, repo public.
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
- Council-district and neighborhood browsing.
- Health Hub / QR-code distribution program with DHD (DHD's original distribution idea for D Compassion).

## Open questions — decisions for Kyle

1. **Name.** Needs to be findable, pronounceable in ES/AR, not confusable with a city product, domain available. Candidates to react to: *DetroitHelp*, *313Help*, *NearbyHelp Detroit*, *Detroit Doorway*, *OpenDoor Detroit*. (313SafeBeds already owns the "313" prefix in this space — coordinate with the 313SafeBeds team if you go that way.)
2. **Android path for the hackathon:** PWA (recommended) vs. attempting Compose. Recommendation: PWA.
3. **Code license:** MIT vs Apache-2.0. Recommendation: Apache-2.0 (patent grant matters if a vendor ever forks it for a city). The app is open source and intended as a gift to the city — see doc 12 for what that requires.
4. **Analytics on or off at launch?** Recommendation: off for the hackathon; identifier-free aggregate counts at v1 with the About-screen disclosure.
5. **Who are the first two community stewards?** Names, not roles.
6. **313SafeBeds involvement:** teammate on the hackathon, or partner via link-out only?
7. **Ask DHD the four questions in 02** before or after the hackathon? (Recommendation: send once; assume silence.)
8. **Map tiles on the PWA:** OSM/Leaflet (free, attribution required) vs. MapLibre + a tile provider (nicer, may cost). Recommendation: Leaflet + OSM for the hackathon.
9. **Do we bundle the 2023 Council homelessness guide entries as `seed_list` (confidence 0.5) or only after a verification pass?** Recommendation: only entries verified this month; the rest stay in a `to-verify` CSV.
10. **Domain:** register now (Cloudflare) so deep links in the demo are real.
