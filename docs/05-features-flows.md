# 05 — Features & Flows

## Information architecture

```
Top bar, every screen:  Detroit Compass · [Urgent help]      (on DV and crisis screens: [Leave this page fast] instead)
Tab bar, every screen:  Home · Help · Recreation · Transit · Events

Home
├─ Español / English switch
├─ "What do you need today?" + tagline
├─ Search by name or street          →  Search
├─ Active alerts (cards, auto-expire)
├─ Find free help                    →  Help tab
├─ Quick needs: Food · A place to sleep · A doctor · Free Narcan   →  need screen
├─ Coming up: next 3 City events     →  Events tab
├─ Tiles: Recreation · Transit
└─ Footer: List updated {date} · Works offline · About this app
     About  →  Español / English switch · list version and signature · Neighborhoods

Help
├─ Search by name or street          →  Search
├─ Right now:  overdosing right now · a safe place to sleep tonight · not safe at home · need to talk
├─ This week:  food · doctor or nurse · lights, heat, or water · free Narcan · too hot or too cold
├─ Browse by type: Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people   →  list (+ map on request)
└─ More: Saved places · Add a place that helps

Recreation:  Joe Louis Greenway (map, segments  →  Neighborhoods) · City parks · Recreation centers and libraries · Bikes
Transit:     trip planner and real-time links, fares, free rides, phone numbers
Events:      City calendar, grouped by day

Urgent help (top bar): 911 · 988 · shelter · crisis line · DV hotline · 211 · overdose steps
Resource detail · Neighborhoods (from About and from greenway segments)
Report a problem with the app: not built.
```

**Revised 2026-09-18 (Kyle): five tabs — Home · Help · Recreation · Transit · Events.** No profile tab; there is no profile.

- **Home**: a calm landing page — the Español/English switch, hero, a search button, active alerts, one "Find free help" card, four quick needs, the next three City events, tiles into Recreation and Transit. No red, no emergency strip.
- **Help**: "What do you need?" lives here. Urgent needs come first under "Right now" (overdose, shelter tonight, not safe at home, need to talk), then "This week," then browse-by-type chips. Urgency is carried by order and wording, not color.
- **Recreation**: Joe Louis Greenway (map, segments, help within a 10-minute walk), City parks (302, nearest first with location), recreation centers, MoGo Access Pass.
- **Transit**: DDOT trip planner and real-time links, fares, free rides (People Mover, QLINE), phone numbers. Every listing with an address gets a **Bus directions** button.
- **Events**: the City calendar, read by the pipeline into the signed bundle, grouped by day; details link out.
- **Urgent help**: a button in the top bar of every screen (replaced by quick-exit on DV and crisis screens) opens the numbers sheet: 911, 988, shelter, crisis line, DV hotline, 211, plus the overdose steps. One tap from anywhere (Principle 3). 911 is the only red element in the app besides quick exit.

The earlier "emergency strip" and needs-on-Home layout are superseded by this structure; the rules about what each screen must show first are unchanged.

## Home

- Top to bottom: Español/English switch · "What do you need today?" and the tagline · the bundle-age banner when there is one · **Search by name or street** · alerts · **Find free help** (opens the Help tab) · four quick needs (Food · A place to sleep · A doctor · Free Narcan), one tap each · "Coming up" (the next 3 City events) · Recreation and Transit tiles · footer.
- **Alerts**: cards with title, plain-language body, a call button for each phone number, when it ends ("Until {when}"), and a link to where it was announced. Hidden when none. Pulled from `alerts.json`; expired ones never render even if the bundle is stale (client checks `ends_at`).
- **"What do you need?"** now heads the Help tab (see above). Principle 3 path: Help → need (1) → refinement if any (2) → **Call** (3); from Home, a quick need skips the first tap.
- **Browse by type** (Help tab chips): Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people.
- Small footer: "List updated {when} · Works offline". Past 72 hours this becomes a banner ("Last updated 12 days ago — call before you go") and the alerts area says "Alerts may be missing"; past 30 and 120 days see doc 12.

## Urgent help

- A button in the top bar of every screen, so the numbers are one tap from anywhere (Principle 3). On DV and crisis screens that slot holds "Leave this page fast" instead, and the numbers are already first on the page.
- The sheet: 911 · Suicide and crisis lifeline (988) · Shelter tonight · Local mental health crisis line · Domestic violence hotline · Help finding services (211) · then "Someone is overdosing right now" with the steps. 911 is the only red row.
- **911 and 988 are hardcoded and can never be overridden.** Other numbers come from `emergency.csv` through the signed bundle, so they can be corrected without a store release but not by a tampered feed (10-A5). Each must match what its owner currently publishes, machine-checked within 30 days (`pnpm check:emergency`); the release build fails otherwise.

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
- Food → *Food today* (hot meals, `food.meal`; places open now or later today sort first) vs *Food this week* (every food listing; places with a time in the next 7 days sort first) vs *Help paying for food* (link-outs to MI Bridges for SNAP, Michigan WIC, and Double Up Food Bucks; no phone numbers, no eligibility rules copied)
- Shelter → *Just me* vs *With kids* vs *I'm under 25* (routes to youth-specific CAM path/agencies) — no further questions
- Overdosing right now → no refinement, no list, no map: **Call 911**, then the rescue steps (check, call, give naloxone if you have it, rescue breaths, recovery position, stay). Nothing else on the screen.
- Narcan to carry → straight to results (the stations list)
- Utilities → no refinement today: one list. (Later, if it changes the result: *Electric/gas (DTE)* vs *Water (DWSD)*.)
- Doctor → no refinement today: one list of clinics. (Later, if it changes the result: *Today / urgent* vs *Regular care*.)

Step 3 — **never a gate.** Results show immediately, citywide. An inline chip offers "Use my location" (permission asked only on that tap, never on launch) or "Type a ZIP code" (not stored); choosing either re-sorts in place.

Results — max 3 primary cards + "See all {count}". Ranking per `schema/query-spec.md`: eligibility → distance band → open-now/next-open → freshness → distance. Each card: name, one-line what-you-get, open now or next time, distance (once a location or ZIP is chosen), a notice if the listing has one, freshness badge, and a **Call** button. **Directions** and **Bus directions** are on the detail screen.

Safety rules baked into the flow:
- "I'm not safe at home" → results screen opens with the DV hotline and 911 at the top *before* any list. (Principle 8: never ask what you can't act on.)
- "I need to talk to someone right now" → 988 and DWIHN crisis line first, then walk-in options.
- "Someone is overdosing right now" → 911 and rescue steps only (static text, works offline; illustrations not built yet). Never a station list: a bystander must not be sent on an errand (10-A7).
- "I want free Narcan to carry" → nearest stations. Not built yet: the line "Narcan is also sold without a prescription at most pharmacies — ask at the counter," and the how-to card.
- "I'm not safe at home" shows no distance and no map.

## List / Map

- Same query, two views. The map is closed until asked for ("Show these {count} on a map"), so the first **Call** button stays near the top. Every listed place with coordinates is a dot that opens its details. Sensitive listings (DV, mental-health crisis) never get a dot, and the "not safe at home" screen has no map. The list is fully usable if the map fails to load.
- The map is drawn on the phone from City of Detroit open data in the signed bundle (streets, parks, city edge). No tile server or map company is contacted (see 08, "Maps").
- Filters (not built yet): Open now · No ID needed · Walk-in · Wheelchair accessible · Spanish/Arabic spoken (from HSDS Language).
- Not built yet: dots colored by freshness badge, and clustering at zoomed-out levels.

## Resource detail

Top → bottom:
1. Name (in the top bar) · organization · open now or next time, computed from RRULE ("Open now until {time}" / "Closed now. Next: {day} {time}") · freshness badge, which states a fact and never says "verified" ("Matched their website when added, {date}" / "Nobody has confirmed this since {date}. Call first.") · a notice, if the listing has one.
2. Big buttons: **Call** (one per phone number) · **Directions** · **Bus directions** · **Save** · **Share** (share a deep link — no personal data in the link). DV and crisis listings have no Save button.
3. What you get (plain language), who it's for and what to bring ("No ID needed" / "Bring proof of Detroit address"). Languages: later.
4. Hours table, or "Hours as listed: {text}" when a list gave hours as text. "Next times": the next 3 dates.
5. Where: address, a small map (never for a sensitive listing), and "Directions open in a maps app, which will see the address."
6. "{miles} mi from the Joe Louis Greenway ({segment})" when an open segment is within half a mile. Tapping it opens the segment.
7. Website.
8. Where this came from: the name of the list or site the row came from.
9. **Still open, info is right** / **Something wrong?** — the report row (see 04).
10. Later: other services at this location; "also nearby."

Archived rows render with a banner: "Closed as of {date} Call 211 for other options." (Showing a replacement: later.)

## Alerts detail

Alerts are cards on Home; there is no separate alert screen yet. Each card: title, plain-language body, a call button for each phone number, when it ends ("Until {when}"), and a link, "Where this was announced." It shows only between its start and its `ends_at`, and hides itself at `ends_at`. Later: tappable sites and a start–end window.

## Search

"Search by name or street" on Home and on the Help tab. Every typed word must start a word in the listing: name first, then organization, then what you get, who it's for, street, and ZIP; then the usual ranking. Places closed in the last 90 days are matched by name and shown apart, under "Closed places." What you type lives only in memory: never stored, sent, or put in the URL, and cleared when a tab is tapped.

## Saved

"Saved places," under Help → More. Listing ids kept on this phone only; never sent. Useful for helpers who look things up repeatedly. DV and crisis listings can't be saved. Copy: "Saved on this phone only. We never see it. Anyone who uses this phone can see it." A "Remove all saved places" button. The screen leaves no URL.

## Add a place

See 04. One screen, under Help → More. The address is typed. Days and times are in your own words ("Like: every Tuesday 10 to 12, or the 2nd Saturday of the month."). "How do you know about it?" is one choice of four. There is no choice for a DV shelter. Submit → honest confirmation; offline, it waits on the phone.

## Language

English and Spanish are built. The app picks Spanish when the phone's language is Spanish, and an "Español / English" switch on Home and About changes it; the choice stays on the phone. Arabic is next (RTL layout — test early, it breaks tab bars). What a place wrote about itself stays in English, marked as English, with the line "This place's own words are shown in English, the way they wrote them." We never machine-translate safety-critical text. Later: the bundle may carry an owner's own translation of a description.

## Accessibility

- Dynamic type up to accessibility sizes without truncating phone numbers.
- VoiceOver/TalkBack labels on every action; "Call New Bethel Baptist pantry" not "Call."
- Body text contrast ≥ 7:1 and secondary text ≥ 4.5:1, in light and dark themes. Color never carries meaning alone.
- All map functionality has a list equivalent.

## Offline

- Web app: needs one online visit. After that it works offline from a verified copy of the list kept in IndexedDB. The service worker caches the app shell only, never the list.
- iPhone app: ships a snapshot of the list inside the app, so it is useful with zero connectivity ever.
- On connect (at start, when the app comes back into view at most every 15 minutes, and when the phone comes back online): fetch the signed `index.json` and check its signature. If it is newer, download every core file, check each against its checksum, then swap in one step. A bundle that fails a check, or is older than the one held, is refused.
- Reports and add-a-place submissions queue locally.
- The address is always shown as text on the detail screen. Later: nearest bus route name (v2, from GTFS).

## Notifications (v2, opt-in, no server-side identity)

Local notifications only, scheduled on-device from bundle data: "Mobile pantry at New Bethel tomorrow 1:30pm" for a saved resource; "Cold-weather respite is open tonight" when an alert with `category: warming` arrives on a background fetch. No push tokens, no server knows who subscribed to what.

## Analytics

None are collected. No analytics code exists in the app or the API. If counts are ever added, the plan was: aggregate counts only, computed from anonymous events without identifiers (category taps, triage entry choices, report kinds, detail views per resource for the reports-per-view health metric). No session IDs, no device IDs, no location. Documented in-app under About. If this is still too much for the youth-facing posture, ship with analytics off.
