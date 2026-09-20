# 05 — Features & Flows

## Information architecture

```
Top bar, every screen:  313 Help · [Urgent help]      (on DV and crisis screens: [Leave this page fast] instead)
Tab bar, every screen:  Home · Help · Map · Events

Home
├─ Español / English switch
├─ "What do you need today?" + tagline
├─ Search by name or street          →  Search
├─ Active alerts (cards, auto-expire)
├─ Find free help                    →  Help tab
├─ Quick needs: Food · A place to sleep · A doctor · Free Narcan   →  need screen
├─ (Coming up: City events — hidden while there are none; dropped until a real feed, DECISIONS 2026-09-19)
├─ Tiles: Map · Joe Louis Greenway
└─ Footer: List updated {date} · Works offline · About this app
     About  →  Español / English switch · list version and signature · Neighborhoods

Help
├─ Search by name or street          →  Search
├─ Right now:  overdosing right now · a safe place to sleep tonight · not safe at home · need to talk
├─ This week:  food · doctor or nurse · lights, heat, or water · free Narcan · too hot or too cold
├─ Browse by type: Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people   →  list (+ map on request)
└─ More: Saved places · Add a place that helps

Map          one map with a layer switcher (free help by kind · parks · Joe Louis Greenway · bus routes and
             stops · streetcar · People Mover · bike lanes and MoGo · stations · park and ride), the same
             thing as a list under the map, then: the greenway, City parks, recreation centers and libraries,
             trip planners, fares, free rides, transit phone numbers, MoGo Access Pass
             Joe Louis Greenway (segments  →  Neighborhoods) and City parks keep their own screens
Events:      City calendar, grouped by day

Urgent help (top bar): 911 · 988 · shelter · crisis line · DV hotline · 211 · overdose steps
Resource detail · Neighborhoods (from About and from greenway segments)
Report a problem with the app: not built.
```

**Revised 2026-09-20 (Kyle): four tabs — Home · Help · Map · Events.** The Recreation and Transit tabs are one **Map** tab; everything either of them offered is still on it. No profile tab; there is no profile.

- **Home**: a calm landing page — the Español/English switch, hero, a search button, active alerts, one "Find free help" card, six quick needs, tiles into the Map tab and the greenway. No red, no emergency strip.
- **Help**: "What do you need?" lives here. Urgent needs come first under "Right now" (overdose, shelter tonight, not safe at home, need to talk), then "This week," then browse-by-type chips. Urgency is carried by order and wording, not color.
- **Map** (2026-09-20): one map of the city with a **layer switcher**, then everything Recreation and Transit used to carry. See "Map tab" below. Every listing with an address still gets a **Bus directions** button on its own screen.
- **Events**: the City calendar, read by the pipeline into the signed bundle, grouped by day; details link out.
- **Urgent help**: a button in the top bar of every screen (replaced by quick-exit on DV and crisis screens) opens the numbers sheet: 911, 988, shelter, crisis line, DV hotline, 211, plus the overdose steps. One tap from anywhere (Principle 3). 911 is the only red element in the app besides quick exit.

The earlier "emergency strip" and needs-on-Home layout are superseded by this structure; the rules about what each screen must show first are unchanged.

## Home

- Top to bottom: Español/English switch · "What do you need today?" and the tagline · the bundle-age banner when there is one · **Search by name or street** · alerts · **Find free help** (opens the Help tab) · four quick needs (Food · A place to sleep · A doctor · Free Narcan), one tap each · Recreation and Transit tiles · footer.
- **Alerts**: cards with title, plain-language body, a call button for each phone number, when it ends ("Until {when}"), and a link to where it was announced. Hidden when none. Pulled from `alerts.json`; expired ones never render even if the bundle is stale (client checks `ends_at`).
- **"What do you need?"** now heads the Help tab (see above). Principle 3 path: Help → need (1) → refinement if any (2) → **Call** (3); from Home, a quick need skips the first tap.
- **Browse by type** (Help tab chips): Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people.
- Small footer: "List updated {when} · Works offline". When this phone's copy is more than 72 hours old, every list and listing says so ("Your phone last got updates 12 days ago. Call before you go."); see doc 12.

## Urgent help

- A button in the top bar of every screen, so the numbers are one tap from anywhere (Principle 3). On DV and crisis screens that slot holds "Leave this page fast" instead, and the numbers are already first on the page.
- The sheet: 911 · Suicide and crisis lifeline (988) · Shelter tonight (Detroit, Hamtramck, Highland Park) · Shelter help (Dearborn) · Local mental health crisis line · Domestic violence hotline · Find help near you (211) · then "Someone is overdosing right now" with the steps. 911 is the only red row.
- **911 and 988 are hardcoded and can never be overridden.** Other numbers come from `emergency.csv` through the signed bundle, so they can be corrected without a store release but not by a tampered feed (10-A5). Each must match what its owner currently publishes, machine-checked within 30 days (`pnpm check:emergency`); the release build fails otherwise.

## Triage — "Find what I need" (the D Compassion replacement)

Runs entirely on the device against the cached bundle. No answer is stored, transmitted, or remembered after the flow ends (the back stack is cleared on exit).

Step 1 — **What's going on?** (pick one; three groups since 2026-09-19. *Right now* is full-sentence rows; the other two groups are two-column tiles with short labels, and "Browse every kind of help" opens to the category list. Home's six shortcuts: food, a place to sleep, a doctor, help with drugs or alcohol, a job, free Narcan.)
- *Right now:* **Someone is overdosing right now** · I need a safe place to sleep tonight · I'm not safe at home · I need to talk to someone right now · **I want help with drugs or alcohol** · **Help after sexual assault**
- *This week:* I need food · I need a doctor, dentist, or eye care · I'm behind on rent or might lose my home · My lights, heat, or water are being shut off · I need somewhere to go during the day · I need clothes, diapers, or baby things · I want free Narcan to carry · It's too hot / too cold where I am
- *Work, school, and paperwork:* I want a job or job training · I want my GED or to learn English · I need free legal help · I need an ID or birth certificate · Help with taxes or signing up for benefits · Help paying for child care or preschool · I need a phone, internet, or a computer · Rides to the doctor or cheaper bus fare · Help with my pet

Step 2 — one refinement, only if it changes the result:
- Food → *Food today* (hot meals, `food.meal`; places open now or later today sort first) vs *Food this week* (every food listing; places with a time in the next 7 days sort first) vs *Help paying for food* (link-outs to MI Bridges for SNAP, Michigan WIC, and Double Up Food Bucks; no phone numbers, no eligibility rules copied)
- Shelter → *Just me* vs *With kids* vs *I'm under 25* (routes to youth-specific CAM path/agencies) — no further questions
- Overdosing right now → no refinement, no list, no map: **Call 911**, then the rescue steps (check, call, give naloxone if you have it, rescue breaths, recovery position, stay). Nothing else on the screen.
- Narcan to carry → straight to results (the stations list)
- Utilities → no refinement today: one list. (Later, if it changes the result: *Electric/gas (DTE)* vs *Water (DWSD)*.)
- Doctor → *A doctor or nurse* (clinics) vs *A dentist* vs *Eye care or glasses*.
- Drugs or alcohol → DWIHN's 24-hour line (the front door to publicly funded treatment in all of Wayne County) and SAMHSA's national helpline first, then: *Somewhere I can go today* (walk-in places first) · *Detox* · *Medicine for opioid addiction* · *Live-in treatment* · *Treatment while I live at home* · *Recovery support and meetings* (with a link to MARR's certified recovery homes; we never list homes ourselves) · *Safer-use supplies*. Quick exit. Listings are private (see below).
- Sexual assault → Avalon Healing Center's 24-hour line, the VOICES4 hotline (call or text) and 911 first, then the list. "The medical exam is free. You do not have to talk to the police to get one." Quick exit; private listings; no address for a program that doesn't publish one.
- Rent or home → *I rent* (free eviction lawyers and court help first: no general rent money is open today) vs *I own my home* (tax exemptions, foreclosure help, repairs).
- Job → *Help finding a job* · *Free job training* · *I have a record* (every job listing, the ones for people with a record first) · *I lost my job* (link-outs: unemployment, the State's job board, Michigan Works!).
- School → *GED, diploma, or reading* vs *English classes*.
- The other "Work, school, and paperwork" needs go straight to a list, followed by link-outs where the help is a program you apply for online (free state ID rules, the child-care scholarship and free PreK, Lifeline phones and low-cost internet, Medicaid rides and reduced fares, the IRS and Michigan free-filing pages).

Step 3 — **never a gate.** Results show immediately, citywide. An inline chip offers "Use my location" (permission asked only on that tap, never on launch) or "Type a ZIP code" (not stored); choosing either re-sorts in place.

Results — max 3 primary cards + "See all {count}". Ranking per `schema/query-spec.md`: eligibility → distance band → open-now/next-open → freshness → distance. Each card: name, one-line what-you-get, open now or next time, distance (once a location or ZIP is chosen), a notice if the listing has one, freshness badge, and a **Call** button. **Directions** and **Bus directions** are on the detail screen.

Safety rules baked into the flow:
- "I'm not safe at home" → results screen opens with the DV hotline and 911 at the top *before* any list. (Principle 8: never ask what you can't act on.)
- "I need to talk to someone right now" → 988 and DWIHN crisis line first, then walk-in options.
- "Someone is overdosing right now" → 911 and rescue steps only (static text, works offline; illustrations not built yet). Never a station list: a bystander must not be sent on an errand (10-A7).
- "I want free Narcan to carry" → nearest stations. Not built yet: the line "Narcan is also sold without a prescription at most pharmacies — ask at the counter," and the how-to card.
- "I'm not safe at home" shows no distance and no map.
- "I want help with drugs or alcohol" and "Help after sexual assault" (DECISIONS 2026-09-19): numbers first, a quick exit, and **private listings**: never saved, never in the browser history, but with an address, distance and map dot so a person can get there.

## Map tab (2026-09-20)

One tab replaces Recreation and Transit. Top to bottom:

1. **The map**, drawn on the phone from the signed bundle as before — no tile server, no map company, nothing sent.
2. **"What to show on the map"** — a layer switcher of real `<input type="checkbox">` in labelled `<fieldset>`s, in three groups:
   - *Free help*: one layer per group of our own listings, **derived from the category taxonomy** (`MAP_GROUPS` in `apps/web/src/needs.ts`): free food · places to sleep · health and Narcan · rec centers and libraries · jobs and school · clothes, showers and things · money, housing and papers. Every top-level category belongs to exactly one group (a test checks it).
   - *Parks and paths*: the Joe Louis Greenway · City parks.
   - *Getting around*: DDOT bus routes and stops · SMART bus routes and stops · QLINE · People Mover · MoGo bike stations · bike lanes · train and bus stations · intercity bus stops · park and ride lots.
   The choice is remembered **on this phone only** (`apps/web/src/layers.ts`, IndexedDB, like the language and saved places) and is never sent. A first visit starts with the greenway, parks and DDOT routes.
3. **"See this map as a list"** — everything switched on, in words: the help listings as cards, greenway stretches as rows, park names, and each transport layer's route and stop names with a count. Nothing on the map is reachable only by looking at it.
4. Then the rest of what Recreation and Transit carried: the greenway, City parks, recreation centers and libraries, trip planners, fares, free rides, transit phone numbers, and the MoGo Access Pass. The trip-planner list names the **Transit app** ("live DDOT and SMART buses on your phone") beside DDOT's own planner, as a link-out to transitapp.com like every other; the same link appears in the **"Rides to the doctor or cheaper bus fare"** link-outs, where it leads, because it is the free thing that answers "when is my bus coming?". Neither says DDOT or SMART recommends it: SMART's own page lists Transit among third-party apps that receive SMART data, DDOT's pages could not be read (`docs/research/2026-09-20/transit-app.md`), and we state only what an owner page states.

Rules that do not change:
- **Sensitive and private listings are never drawn.** Treatment and help after sexual assault are excluded from every layer (`PRIVATE_TOPS`), and inside a group a DV or mental-health-crisis listing is dropped row by row (`isSensitive`).
- **Colour never carries the meaning alone.** Each layer is named in the switcher, named again when you tap a route or a stop, and named in the list under the map.
- **Bus stops wait for the zoom.** There are thousands, so a dense point layer draws only once the map is close enough for stops to be separate things; the list shows them at any zoom, and the switcher says so.
- Unknown is never rendered as open, and freshness is still computed on the device.

Each transport layer is its own file in the signed bundle under `map/transit/`, **downloaded only when that layer is first switched on** and checked against the signed index, then kept for offline use. The small list of which layers exist travels with the bundle (`places/transit.json`), so the switcher draws offline. Sources, sizes and licence notes: `pipeline/src/ingest-transit.ts` and DECISIONS 2026-09-20.

## List / Map

- Same query, two views. The map is closed until asked for ("Show these {count} on a map"), so the first **Call** button stays near the top. Every listed place with coordinates is a dot that opens its details. Sensitive listings (DV, mental-health crisis) never get a dot, and the "not safe at home" screen has no map. The list is fully usable if the map fails to load.
- The map is drawn on the phone from City of Detroit open data in the signed bundle (streets, parks, city edge). No tile server or map company is contacted (see 08, "Maps").
- Filters (not built yet): Open now · No ID needed · Walk-in · Wheelchair accessible · Spanish/Arabic spoken (from HSDS Language).
- Not built yet: dots colored by freshness badge, and clustering at zoomed-out levels.

## Resource detail

Top → bottom:
1. Name (in the top bar) · organization · open now or next time, computed from RRULE ("Open now until {time}" / "Closed now. Next: {day} {time}") · freshness badge, which states a fact and never says "verified" ("Matched their website when added, {date}" / "Nobody has confirmed this since {date}. Call first.") · a notice, if the listing has one.
2. Big buttons: **Call** (one per phone number) · **Directions** · **Bus directions** · **Bus directions in the Transit app** (phones only, see below) · **Save** · **Share** (share a deep link — no personal data in the link). DV and crisis listings have no Save button.
   - **Bus directions** is first and needs no app: it opens a trip plan in the browser, wherever the person is.
   - **Bus directions in the Transit app** is an addition under it, for the app DDOT and SMART riders use for
     real-time buses. It is Transit's own documented link (`transit://directions?to=…`, `apps/web/src/directions.ts`
     and `apps/ios/HelpApp/Listing.swift`; sources in `docs/research/2026-09-20/transit-app.md`) and carries the
     **destination only** — no origin, ever; Transit asks the person for their location itself, on their phone.
     The destination is the publisher's coordinate when there is one, otherwise the written address.
     **Exactly the same gate as Bus directions:** an address or a coordinate. DV and crisis listings have
     neither, so they show no Directions, no Bus directions and no Transit link.
     **Phones only.** Transit documents no https link and no behaviour when the app is missing, and ships for iOS
     and Android only, so the web hides the link off a phone user-agent and iOS hides it unless the app is
     installed. We never guess a URL, never load anything of theirs, and never claim a partnership.
3. What you get (plain language), who it's for and what to bring ("No ID needed" / "Bring proof of Detroit address"). Languages: later.
4. Hours table, or "Hours as listed: {text}" when a list gave hours as text. "Next times": the next 3 dates.
5. Where: address, a small map (never for a sensitive listing), and "Directions open in another app, which will see where this place is." — worded for any app the person picks, maps or Transit, and true on a laptop too.
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

Four languages are built: English, Spanish, **Arabic** and **Bengali**. The app picks the first of the phone's own languages it has words for, and a switch on Home and About lists all four, each written in its own name (English · Español · العربية · বাংলা) with its own `lang` attribute; the choice stays on the phone and is never sent. **Each language other than English is a separate file, fetched only when it is chosen** (DECISIONS 2026-09-19), so an English reader downloads none of them; once fetched they are kept for offline use. With no signal and no saved copy the switch does nothing and the app stays in English. **Arabic reads right to left** and the whole interface mirrors — the stylesheet is written in logical properties, so there is no second stylesheet; the map itself never mirrors, because left is west in every language. Dates, times and numbers in Arabic and Bengali use Western digits, so a phone number reads as it is dialled (DECISIONS 2026-09-20). **Arabic and Bengali were drafted by machine on 2026-09-20 and no native speaker has read either one yet** (DECISIONS): no screen says they were checked, and a native reviewer is a condition of a public release, crisis screens first. What a place wrote about itself stays in English, marked as English, with the line "This place's own words are shown in English, the way they wrote them." We never machine-translate safety-critical text. Later: the bundle may carry an owner's own translation of a description.

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
