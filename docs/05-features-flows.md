# 05 — Features & Flows

## Information architecture

```
Home
├─ Emergency strip (always visible, top)           911 · Shelter (HelpLine 866-313-2520) · More urgent numbers ▸ (988, crisis line, overdose steps)
├─ Active alerts (0–3 cards, auto-expire)          "Overnight respite open through Wed noon"
├─ "What do you need?" — the needs list itself, on Home (no interstitial)  →  Triage step 2 or results
├─ Categories grid       →  List/Map for a category
├─ Search               →  Name/address search incl. archived (warned)
└─ Menu: Language · Saved · Add a place · About & data sources · Report a problem with the app

Triage (2–4 taps, on-device)
Category list  ⇄  Map            (same result set; toggle)
Resource detail
Add a place
Saved (local only)
```

**Revised 2026-09-18 (Kyle): five tabs — Home · Help · Recreation · Transit · Events.** No profile tab; there is no profile.

- **Home**: a calm landing page — hero, one "Find free help" card, four quick needs, the next three City events, tiles into Recreation and Transit. No red, no emergency strip.
- **Help**: "What do you need?" lives here. Urgent needs come first under "Right now" (overdose, shelter tonight, not safe at home, need to talk), then "This week," then browse-by-type chips. Urgency is carried by order and wording, not color.
- **Recreation**: Joe Louis Greenway (map, segments, help within a 10-minute walk), City parks (302, nearest first with location), recreation centers, MoGo Access Pass.
- **Transit**: DDOT trip planner and real-time links, fares, free rides (People Mover, QLINE), phone numbers. Every listing with an address gets a **Bus directions** button.
- **Events**: the City calendar, read by the pipeline into the signed bundle, grouped by day; details link out.
- **Urgent help**: a button in the top bar of every screen (replaced by quick-exit on DV and crisis screens) opens the numbers sheet: 911, 988, shelter, crisis line, DV hotline, 211, plus the overdose steps. One tap from anywhere (Principle 3). 911 is the only red element in the app besides quick exit.

The earlier "emergency strip" and single-page Home described below are superseded by this structure; the rules about what each screen must show first are unchanged.

## Home

- **Emergency strip**: pinned, high contrast. Two fixed buttons (**911**, **Shelter**) plus "More urgent numbers," so it survives the largest text sizes on a 320dp screen. **911 and 988 are hardcoded and can never be overridden.** Other numbers come from `emergency.csv` through the signed bundle, so they can be corrected without a store release but not by a tampered feed (10-A5). Each must match what its owner currently publishes, machine-checked every 30 days (`pnpm check:emergency`); the release build fails otherwise.
- **Alerts**: cards with title, ends-at ("through Wed 12pm"), one action button. Hidden when none. Pulled from `alerts.json`; expired ones never render even if the bundle is stale (client checks `ends_at`).
- **"What do you need?"** is a heading, not a button: the needs are listed right on Home, one tap each (10-B13). Principle 3 path: need (1) → refinement if any (2) → **Call** (3).
- **Category grid**: Food · Shelter tonight · Narcan · Warm/Cool · Health · Utilities · Rent help · Showers · More.
- Small footer: "Data updated {relative time} · Works offline". Past 72 hours this becomes a banner ("Last updated 12 days ago — call before you go") and the alerts area says "Alerts may be missing"; past 30 and 120 days see doc 12.

## Triage — "Find what I need" (the D Compassion replacement)

Runs entirely on the device against the cached bundle. No answer is stored, transmitted, or remembered after the flow ends (the back stack is cleared on exit).

Step 1 — **What's going on?** (pick one)
- I need food
- I need a safe place to sleep tonight
- **Someone is overdosing right now**
- I want free Narcan to carry
- My lights, heat, or water are being shut off
- I need to see a doctor or nurse
- I need to talk to someone right now
- I'm not safe at home
- It's too hot / too cold where I am

Step 2 — one refinement, only if it changes the result:
- Food → *Today* (hot meals + any distribution today) vs *This week* (pantries + scheduled distributions) vs *Help paying* (SNAP/WIC/Double Up)
- Shelter → *Just me* vs *With kids* vs *I'm under 25* (routes to youth-specific CAM path/agencies) — no further questions
- Overdosing right now → no refinement, no list, no map: **Call 911**, then the rescue steps (check, call, give naloxone if you have it, rescue breaths, recovery position, stay). Nothing else on the screen.
- Narcan to carry → straight to results
- Utilities → *Electric/gas (DTE)* vs *Water (DWSD)*
- Doctor → *Today / urgent* vs *Regular care*

Step 3 — **never a gate.** Results show immediately, citywide. An inline chip offers "Use my location" (permission asked only on that tap, never on launch) or "Type a ZIP" (not stored); choosing either re-sorts in place.

Results — max 3 primary cards + "See all". Ranking per `schema/query-spec.md`: eligibility → distance band → open-now/next-open → freshness → distance. Each card: name, one-line what-you-get, open-now/next-open, distance, freshness badge, **Call** and **Directions** buttons.

Safety rules baked into the flow:
- "I'm not safe at home" → results screen opens with the DV hotline and 911 at the top *before* any list. (Principle 8: never ask what you can't act on.)
- "I need to talk to someone right now" → 988 and DWIHN crisis line first, then walk-in options.
- "Someone is overdosing right now" → 911 and rescue steps only (static, illustrated, offline). Never a station list: a bystander must not be sent on an errand (10-A7).
- "I want free Narcan to carry" → nearest stations, then "Narcan is also sold without a prescription at most pharmacies — ask at the counter," then the how-to card.

## List / Map

- Same query, two views. Map is optional for core function: the list must be fully usable with the map SDK failing to load.
- Filters: Open now · No ID needed · Walk-in · Wheelchair accessible · Spanish/Arabic spoken (from HSDS Language).
- Map pins colored by freshness badge, not by category (category is the icon). Stale = hollow pin. Flagged = never shown on map.
- Cluster at zoomed-out levels; don't render 400 pins.

## Resource detail

Top → bottom:
1. Name · category chip · freshness badge ("Verified 3 days ago" / "Might be out of date — call first" / "Reported closed").
2. **Open now / Next: Fri 1:30–2:30pm** computed from RRULE; for mobile distributions show the next 3 dates.
3. Big buttons: **Call** · **Directions** · **Share** (share a deep link — no personal data in the link).
4. What you get (plain language), who it's for, what to bring ("No ID needed" / "Bring proof of Detroit address"), languages.
5. Address, phone, website, hours table.
6. Source & attribution ("Listed by Detroit Health Department" / "Added by a community member, verified by phone 9/14").
7. **Something wrong? / Still open ✅** — the report row (see 04).
8. Related: other services at this location; "also nearby."

Archived rows render with a banner: "Closed as of {date}. {replacement ? 'Try {name}' : 'Call 211 for alternatives'}."

## Alerts detail

Title, plain-language body, window (start–end in local time), sites (each tappable), actions, source link ("City of Detroit press release, Jan 19"). Auto-hides at `ends_at`.

## Search

Name, address, keyword, org. Includes stale and (≤ 90 days) archived rows, clearly labeled. No search history stored.

## Saved

Local-only bookmarks (device storage). Useful for helpers who look things up repeatedly. Explicit copy: "Saved on this phone only." Clear-all button.

## Add a place

See 04. Two-screen form; address by map pin or text; schedule picker with presets ("Every week on…", "Once on…", "Monthly on the 2nd Tuesday"); "how do you know?" chips; submit → honest confirmation.

## Language

EN at launch; ES and AR next (RTL layout for AR — test early, it breaks tab bars and emergency strips). Bundle carries translations for resource *descriptions* where the owner supplied them; otherwise show EN with a "in English" marker rather than machine-translating safety-critical text.

## Accessibility

- Dynamic type up to accessibility sizes without truncating phone numbers.
- VoiceOver/TalkBack labels on every action; "Call New Bethel Baptist pantry" not "Call."
- Contrast ≥ 4.5:1; the emergency strip ≥ 7:1.
- All map functionality has a list equivalent.

## Offline

- First launch bundles a snapshot (`v{N}` at build time) so the app is useful with zero connectivity ever.
- On connect: fetch `index.json`, compare version, download only changed category files, swap atomically.
- Reports and add-a-place submissions queue locally.
- "Directions" falls back to showing the address large, plus nearest bus route name (v2, from GTFS) when maps can't load.

## Notifications (v2, opt-in, no server-side identity)

Local notifications only, scheduled on-device from bundle data: "Mobile pantry at New Bethel tomorrow 1:30pm" for a saved resource; "Cold-weather respite is open tonight" when an alert with `category: warming` arrives on a background fetch. No push tokens, no server knows who subscribed to what.

## Analytics

Aggregate counts only, computed from anonymous events without identifiers: category taps, triage entry choices, report kinds, detail views per resource (for the reports-per-view health metric). No session IDs, no device IDs, no location. Documented in-app under About. If this is still too much for the youth-facing posture, ship with analytics off.
