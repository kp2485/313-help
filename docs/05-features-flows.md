# 05 — Features & Flows

## Information architecture

```
Top bar, every screen:  313 Help · [Urgent help]      (on DV and crisis screens: [Leave this page fast] instead)
Tab bar, every screen:  Home · Help · Map · Neighborhoods · Events

Top bar (every tab): 313 Help · language (English · Español · العربية · বাংলা) · Urgent help
Home
├─ "What do you need today?" + tagline
├─ Search by name or street          →  Search
├─ Active alerts (cards, auto-expire)
├─ Find free help                    →  Help tab
├─ Quick needs: Food · A place to sleep · A doctor · Drugs or alcohol · Free Narcan · A job   →  need screen
├─ (Coming up: City events — hidden while there are none; dropped until a real feed, DECISIONS 2026-09-19)
├─ Tiles: Map · Parks and paths · Your neighborhood   (2026-09-22: the greenway tile became Parks and paths)
└─ Footer: Updated {date} · About this app · Your privacy
     About  →  list version and signature · one line to the Neighborhoods tab
     Your privacy  →  the docs/08 table in plain words · "Make a new key"

Help
├─ Search by name or street          →  Search
├─ Right now:  overdosing right now · a safe place to sleep tonight · not safe at home · need to talk
├─ This week:  food · doctor or nurse · lights, heat, or water · free Narcan · too hot or too cold
├─ Browse by type: Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people   →  list (+ map on request)
└─ More: Saved places · Add a place that helps

Map          one map with a layer switcher (free help by kind · parks · Joe Louis Greenway · city and
             neighborhood outlines · bus routes and stops · streetcar · People Mover · bike lanes and MoGo ·
             stations · park and ride), the same thing as a list under the map, then: Parks and paths,
             recreation centers and libraries, trip planners, fares, free rides, transit phone numbers,
             MoGo Access Pass
Parks and paths (2026-09-22)  →  every City park (each with its own page), the recreation centers, and the
             Joe Louis Greenway as ONE row  →  the greenway screen  →  its 52 stretches (condition reports
             unchanged)  →  Neighborhoods
Areas        the MAP of the four cities and Detroit's 205 neighborhoods, outlines only; the same screen's
             second view is the list (Nearest first when a location is known, else A–Z or by council
             district)  →  one neighborhood or one city (docs/13)
Events:      City calendar, grouped by day

Urgent help (top bar): 911 · 988 · shelter · crisis line · DV hotline · 211 · overdose steps
Resource detail · a neighborhood (from the Neighborhoods tab, Home, About, a greenway segment, or a link)
Report a problem with the app: not built.
```

**Revised 2026-09-22 (Kyle): five tabs — Home · Help · Map · Neighborhoods · Events**, of which a phone normally shows four, because Events still hides itself. Before 2026-09-22 there were four: Kyle's reason for the fifth was that the neighborhood pages "should have its own tab" instead of being buried on About. Its hash is the `#/n` the screen has always had, so every link made before the tab existed still opens it.

**Table | Chart on a neighborhood's year panels (2026-09-22, Kyle: "for the longitudinal data, we should give the
user the option on page to switch between a table and chart view for relevant data").** Every by-year panel on a
neighborhood page that has three years with something in them — homes sold beside building permits, blight
tickets, buildings torn down, problems reported, building fires — carries a two-way control above it: **Table**
(the default) or **Chart**. It is a real radio group on all three apps (a `role="radiogroup"` with two native
radios on the web, a segmented `Picker` on the iPhone, a `RadioGroup` on Android); one choice covers every panel
on the page, it is kept on the device in the same place as the map layer choices and is never sent, it applies at
once, it is announced, and the focus stays on the control that was just used. **The table is the accessible
source of truth either way**: on the web it stays in the page and is only visually hidden, and the picture points
at it with `aria-describedby`; on the phones, where a view that is off the screen is off the accessibility tree
too, the table stays under the chart whenever VoiceOver or TalkBack is running. The chart itself is described in
docs/13.

**Android, 2026-09-22.** The Android app has the tab too, as **Home · Help · Map · Neighborhoods · Search · Saved places** — six, because that client keeps Search and Saved places in the bar rather than under Help. The bar shows the short label `tab.hoods` ("Areas") and tells a screen reader the whole word (`tab.hoods_wide`); above a font scale of about 1.3 it scrolls sideways so that no word is ever broken in the middle. Android also gained "Type a ZIP code" and "Add a place that helps" on the same day, so the three clients now offer the same ways to say roughly where you are and to tell us about a place we do not list. What Android still does not have is the Joe Louis Greenway lens row and an "About this area" link from a greenway stretch.

**Revised 2026-09-20 (Kyle): four tabs — Home · Help · Map · Events.** The Recreation and Transit tabs are one **Map** tab; everything either of them offered is still on it. No profile tab; there is no profile.

- **Home**: a calm landing page — hero, a search button, active alerts, one "Find free help" card, six quick needs, tiles into the Map tab and the greenway. No red, no emergency strip.
- **Help**: "What do you need?" lives here. Urgent needs come first under "Right now" (overdose, shelter tonight, not safe at home, need to talk), then "This week," then browse-by-type chips. Urgency is carried by order and wording, not color.
- **Map** (2026-09-20): one map of the city with a **layer switcher**, then everything Recreation and Transit used to carry. See "Map tab" below. Every listing with an address still gets a **Bus directions** button on its own screen.
- **Neighborhoods** (2026-09-22): public numbers about each of the City's 205 neighborhoods (docs/13). **Its landing became the MAP on 2026-09-22** (Kyle: *"the most intuitive way for people to reach their neighborhood is through a map … offer the initial neighborhood selection on a map layer"*; audit §3): one screen, two views, one control — **"See this map as a list" / "See this list as a map"**. The map is the four city outlines and the 205 neighborhood outlines and **nothing else** — no dot, no listing, no transport, no value-carrying fill — opening where every such map opens (the person, then a typed junction or ZIP, then the anchor) with the area they are in already picked out. N and P walk the outlines and Enter opens one, exactly as on the Map tab. The list view is the index the tab has always had, with a third order, **"Nearest first"**, offered only while a location or a ZIP is known — a distance to the middle of an outline is not a ranking of the place (docs/13, rule 1). The tab's own screen is, top to bottom: what these pages are and that we do not rank neighborhoods · the map or the list · **Your neighborhood**, worked out **on the device** by point-in-polygon against the outlines the bundle already carries (`apps/web/src/hoodfind.ts`; the shared cases are `schema/neighborhoods/points.json`) from a location already shared this visit or the centre of a typed ZIP, kept in memory and never sent or stored · the ordinary "Use my location" / "Type a ZIP code" chip, with no new permission pattern · **find a neighborhood**, search as you type, with a politely announced count · all 205, **Nearest first, A to Z or by council district** and never by any number (docs/13, rule 1: the index rows carry no indicator at all) · the four cities as rows to their own pages · where the numbers come from, linked. The tab label is short on the phone bar ("Areas") because "Neighborhoods" is three times the width of a fifth of a 320 px screen; the side rail, the window title and the screen's own heading say the whole word.
  - **On iPhone (2026-09-21)**: the same tab, in the same place, with the same panels in the same order and the same words, and "Your neighborhood" from either a location or a typed ZIP as on the web. The differences are the ones the platform forces: the index is a `.searchable` list with a segmented A–Z / by-district control, and the outline is drawn with the Map tab's own Canvas — a tap on it opens the Map tab centred on the neighborhood. `HelpCore/Hoods.swift` and `HelpCore/Zips.swift` hold the rules and are run by `swift test` against `schema/neighborhoods/points.json`, the same cases as the web, ZIPs included.
- **Events**: was the City calendar, grouped by day, with details linking out. **Dropped 2026-09-19** until the City publishes a real events feed, so the bundle carries no events and **the tab hides itself**; the code stays. (A tab bar that reserved a fifth column for it was a bug the 2026-09-20 audit found and fixed.)
- **Urgent help**: a button in the top bar of every screen (replaced by quick-exit on DV and crisis screens) opens the numbers sheet: 911, 988, shelter, crisis line, DV hotline, 211, plus the overdose steps. One tap from anywhere (Principle 3). 911 is the only red element in the app besides quick exit.

The earlier "emergency strip" and needs-on-Home layout are superseded by this structure; the rules about what each screen must show first are unchanged.

## Home

- Top to bottom (**revised 2026-09-20**; the language control moved into the top bar 2026-09-21): "What do you need today?" and the tagline · the bundle-age banner when there is one · **Search by name or street** · alerts · **Find free help** (opens the Help tab) · **six quick needs** (Food · A place to sleep · A doctor · Help with drugs or alcohol · Free Narcan · A job), one tap each — the order is written out in `homeTab`, so it cannot drift with the needs list · three tiles, **Map**, **Parks and paths** (2026-09-22, in place of the greenway tile) and **Your neighborhood** · a footer with "Updated {date}", About and Your privacy.
- **Alerts**: cards with title, plain-language body, a call button for each phone number, when it ends ("Until {when}"), and a link to where it was announced. Hidden when none. Pulled from `alerts.json`; expired ones never render even if the bundle is stale (client checks `ends_at`).
- **"What do you need?"** now heads the Help tab (see above). Principle 3 path: Help → need (1) → refinement if any (2) → **Call** (3); from Home, a quick need skips the first tap.
- **Browse by type** (Help tab chips): Food · Shelter · Health · Free Narcan · Utility help · Showers · Young people.
- Small footer: "Updated {when}", then About this app and Your privacy. When this phone's copy is more than 72 hours old, every list and listing says so ("Your phone last got updates 12 days ago. Call before you go."); see doc 12.

## Urgent help

- A button in the top bar of every screen, so the numbers are one tap from anywhere (Principle 3). On DV and crisis screens that slot holds "Leave this page fast" instead, and the numbers are already first on the page.
- The sheet: 911 · Suicide and crisis lifeline (988) · Shelter tonight (Detroit, Hamtramck, Highland Park) · Shelter help (Dearborn) · Local mental health crisis line · Domestic violence hotline · Find help near you (211) · then "Someone is overdosing right now" with the steps · then "Get somewhere safe now". 911 is the only red row.
- **"Get somewhere safe now"** (added 2026-09-22, DECISIONS, Kyle's plan decision 3) is the last row on the sheet and never moves above a number: the ordering above is unchanged, this is a row underneath it. It opens the nearest places that are open all night and have a phone a person can use — police stations (`safe.police`), fire stations (`safe.fire`) and emergency rooms (`health.er`) in **one** list, ranked the ordinary way (open now, then distance; with no location, one settled order and the same ZIP-or-intersection prompt every list has). The screen leads with 911 itself — "These places are open all night and have a phone you can use. If you are in danger, call 911 first." — because the fastest way to get somewhere safe is often not to walk anywhere. It is traceless like the rest of the sheet: no hash, no history, the window title is only "Find help". The screen **never names domestic violence**; the one line about home reads "If it is not safe at home, a police station or a hospital can help you call a shelter.", so a person reading over a shoulder learns nothing (docs/08).
- **911 and 988 are hardcoded and can never be overridden.** Other numbers come from `emergency.csv` through the signed bundle, so they can be corrected without a store release but not by a tampered feed (10-A5). Each must be the number its owner currently publishes; `pnpm check:emergency` reads each page, and a release build fails when a page **was read and showed a different number**. A page that could not be read is logged for a person and never blocks a release (DECISIONS 2026-09-19; the earlier "within 30 days" rule was superseded).

## Triage — "Find what I need" (the D Compassion replacement)

Runs entirely on the device against the cached bundle. No answer is stored, transmitted, or remembered after the flow ends (the back stack is cleared on exit).

Step 1 — **What's going on?** (pick one; three groups since 2026-09-19. *Right now* is full-sentence rows; the other two groups are two-column tiles with short labels, and "Browse every kind of help" opens to the category list. Home's six shortcuts: food, a place to sleep, a doctor, help with drugs or alcohol, a job, free Narcan.)
- *Right now:* **Someone is overdosing right now** · I need a safe place to sleep tonight · I'm not safe at home · I need to talk to someone right now · **I want help with drugs or alcohol** · **Help after sexual assault** · **Get somewhere safe now** (2026-09-22; the same screen the urgent sheet's last row opens)
- *This week:* I need food · I need a doctor, dentist, or eye care · I'm behind on rent or might lose my home · My lights, heat, or water are being shut off · I need somewhere to go during the day · I need clothes, diapers, or baby things · I want free Narcan to carry · It's too hot / too cold where I am
- *Work, school, and paperwork:* I want a job or job training · I want my GED or to learn English · I need free legal help · I need an ID or birth certificate · Help with taxes or signing up for benefits · Help paying for child care or preschool · I need a phone, internet, or a computer · Rides to the doctor or cheaper bus fare · Help with my pet

Step 2 — one refinement, only if it changes the result:
- Food → *Food today* (hot meals, `food.meal`; places open now or later today sort first) vs *Food this week* (every food listing; places with a time in the next 7 days sort first) vs *Help paying for food* (link-outs to MI Bridges for SNAP, Michigan WIC, and Double Up Food Bucks; no phone numbers, no eligibility rules copied)
- Shelter → *Just me* vs *With kids* vs *I'm under 25* (routes to youth-specific CAM path/agencies) — no further questions
- Overdosing right now → no refinement, no list, no map: **Call 911**, then the rescue steps (check, call, give naloxone if you have it, rescue breaths, recovery position, stay). Nothing else on the screen.
- Narcan to carry → straight to results: **every harm-reduction place that stocks naloxone**, which is the whole `harm` kind — the Detroit Health Department's boxes (`harm.narcan`) *and* Wayne County's Well Wayne stations and the Life Points outreach (`harm.supplies`), each of which says it gives out Narcan. Kyle, 2026-09-22 (category audit K1); before that the screen asked for `harm.narcan` alone and left out 26 stations in Hamtramck, Highland Park, Dearborn and Detroit. A line above the list says the County's stations also carry fentanyl and xylazine test strips. Ranking is the ordinary one: open now, then distance. Home's "Free Narcan" shortcut and the Help tab's tile open this same screen.
- Utilities → no refinement today: one list. (Later, if it changes the result: *Electric/gas (DTE)* vs *Water (DWSD)*.)
- Doctor → *Emergency room* (911 first) · *Urgent care* · *A doctor or nurse* (clinics) · *Health Department programs* · *A dentist* · *Eye care or glasses* · *Mental health support* (`health.support`: ongoing, non-crisis help such as a daytime clubhouse — added 2026-09-22, audit K3).
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
- "I need to talk to someone right now" → 988 and the DWIHN crisis line first, then the crisis places (`health.mental`, sensitive: no address, no dot, no distance, no Save, no Share). **Below those**, under its own heading "Places to go during the day", the ongoing non-crisis programs (`health.support`) — added 2026-09-22 (audit K3) and deliberately last, so nothing comes between a person in crisis and a number they can call. The screen itself stays traceless and keeps its quick exit; a `health.support` **listing** opened from it is an ordinary listing, with its address, its map, directions, Save, Share and its own URL, because its owner publishes the address and a person has to get there.
- "Someone is overdosing right now" → 911 and rescue steps only (static text, works offline; illustrations not built yet). Never a station list: a bystander must not be sent on an errand (10-A7).
- "I want free Narcan to carry" → the nearest places, boxes and County stations alike (see step 2). Not built yet: the line "Narcan is also sold without a prescription at most pharmacies — ask at the counter," and the how-to card.
- "I'm not safe at home" shows no distance and no map.
- "I want help with drugs or alcohol" and "Help after sexual assault" (DECISIONS 2026-09-19): numbers first, a quick exit, and **private listings**: never saved, never in the browser history, but with an address, distance and map dot so a person can get there.

## Map tab (2026-09-20; styles, keyboard and native maps 2026-09-21)

One tab replaces Recreation and Transit. Top to bottom:

1. **The map**, drawn on the phone from the signed bundle as before — no tile server, no map company, nothing sent.
2. **"What to show on the map"** — a layer switcher of real `<input type="checkbox">` in labelled `<fieldset>`s, in three groups:
   - *Free help*: one layer per group of our own listings, **derived from the category taxonomy** (`MAP_GROUPS` in `apps/web/src/needs.ts`): free food · shelters and day centers · health, Narcan and all-night stations (`health` + `harm` + `safe`, since 2026-09-22) · libraries, rec centers and internet (`rec` + `connect`) · jobs and school · kids and teens (`kids` + `youth`) · clothes, showers and pets (`goods` + `hygiene` + `pets`) · money, housing, papers and rides. Eight groups since the category audit of 2026-09-22 (`docs/CATEGORY-AUDIT-2026-09-22.md`): every label names what is in its layer, so nothing surprising sits in one. Every top-level category belongs to exactly one group (a test checks it).
   - *Parks and paths*: City parks · the Joe Louis Greenway · city and neighborhood outlines. Parks first
     (Kyle, 2026-09-22: the greenway is one component of the park system, not the headline).
     The **outlines** layer draws the four city boundaries and the 205 Detroit neighborhoods — a thin dashed
     line, a name from the zoom at which it fits (about 14 m per pixel; below that, the four cities alone), and
     a light wash on the one that was tapped. **Never a fill that carries a value**: docs/13's first honesty
     rule forbids a choropleth, so an outline may be drawn and named and never shaded by a number. The layer is
     handed no listing at all, so no sensitive row can reach it. A tap opens the same bottom card every other
     feature uses, with "See details" to that area's page.
   - *Getting around*: DDOT bus routes and stops · SMART bus routes and stops · QLINE · People Mover · MoGo bike stations · bike lanes · train and bus stations · intercity bus stops · park and ride lots.
   The choice is remembered **on this phone only** (`apps/web/src/layers.ts`, IndexedDB, like the language and saved places) and is never sent. **A first visit starts with every help layer on and City parks on; the greenway, the outlines and the bus routes off** (2026-09-22, audit H2 — the tab used to open as a street map with a green line on it and not one place that helps). A remembered choice always wins.
3. **"See this map as a list"** — everything switched on, in words: the help listings as cards, greenway stretches as rows, park names, and each transport layer's route and stop names with a count. Nothing on the map is reachable only by looking at it.
4. Then the rest of what Recreation and Transit carried: **Parks and paths** (the nearest parks as rows to their own pages, and "See all parks and paths"), recreation centers and libraries, trip planners, fares, free rides, transit phone numbers, and the MoGo Access Pass. The trip-planner list names the **Transit app** ("live DDOT and SMART buses on your phone") beside DDOT's own planner, as a link-out to transitapp.com like every other; the same link appears in the **"Rides to the doctor or cheaper bus fare"** link-outs, where it leads, because it is the free thing that answers "when is my bus coming?". Neither says DDOT or SMART recommends it: SMART's own page lists Transit among third-party apps that receive SMART data, DDOT's pages could not be read (`docs/research/2026-09-20/transit-app.md`), and we state only what an owner page states.

**The first time the Map tab is opened (2026-09-21).** Before any permission prompt, the map shows **our own
small card**: "See what is near you?" — "Your location stays on this phone. We never send it or save it." —
with **Use my location** and **Not now**. The card never covers the map (it is usable behind and around it),
Urgent help stays one tap away, Escape (web), Back (Android) and "Not now" all mean the same thing, and it works
at 320 px, in Arabic and at the largest text sizes. A cold system prompt is what gets refused; ours is the
sentence a person can read first, and on the web it is also what makes the prompt follow a real gesture.

Only **Use my location** asks the platform, and only ever **coarse** location: `getCurrentPosition` with
`enableHighAccuracy: false` on the web, `requestWhenInUseAuthorization` with hundred-metre accuracy on iPhone
(reduced accuracy is accepted; full accuracy is never requested), `ACCESS_COARSE_LOCATION` on Android (fine is
never requested). When a fix arrives **inside** the service area the map animates — instantly under Reduce
Motion — to a **two-mile radius** around the person: the shorter side of the screen spans four miles, clamped to
the map's existing zoom and pan limits, with the "you are here" dot and "Map centred near you" through the live
region. **Outside** Detroit, Hamtramck, Highland Park and Dearborn nothing moves and the screen says so, with
the ZIP entry beside it. A refusal, an error or a timeout dismisses the card, leaves the map where it was, and
shows the refused message; nothing ever asks again on its own — the "Use my location" button is the way to try,
and once the platform has stopped offering its prompt the words say where the switch is in Settings.

The **only** thing remembered is a boolean: that the card was answered (web: the same IndexedDB the layer
choices use; iPhone: the excluded-from-backup state file; Android: the atomic app-private file). The position is
never written anywhere — see [08-privacy-safety.md](08-privacy-safety.md). If permission was already given, the
first open skips the card and goes straight to the two-mile view; if a ZIP has already been typed, the map
centres on the ZIP's point and the card is not shown. The card never appears on a private or sensitive screen,
the map still never draws sensitive rows, and DV rows still show no distance. DECISIONS 2026-09-21.

**Where a map that opens on "where you are" opens (revised 2026-09-22; Kyle's plan decisions).** The rule is
about **every** such map — the Map tab and the Areas tab — and it has three steps and one radius:

1. **A location known** (allowed earlier this visit, or just allowed on the card, or the centre of a typed ZIP,
   or a junction the person typed): a **two-mile** view around that point.
2. **Otherwise the card**, which now offers three choices: "Use my location", **"Type a cross street"**, and
   "Not now". The cross street is resolved **on the device** from the street geometry the signed bundle already
   carries — see "Type a cross street" below.
3. **Otherwise the anchor**: a **two-mile** view around a point **0.6 mile up Woodward from Detroit City Hall**
   (lat 42.3366, lon −83.0514 — Grand Circus Park), which is what the app says in words ("City Hall"). The
   nudge is there because City Hall is a third of a mile from the river, so a box centred on it spent a third of
   its height on Windsor and on the hatching that means "not our area". The radius came down from two and a half
   miles to two so that there is **one** radius in the app rather than two (Kyle, 2026-09-22).

The whole four-city region stays one press of the map's reset button away. The opening view and "centre on me"
are the same function (`cameraForRadius` / `MapCamera.forRadius`) with a different centre, on all three clients.

**"Type a cross street" (2026-09-22).** A field taking "Woodward and Warren", "Woodward & Warren", "Warren at
Woodward", "Woodward/Warren" or one street name, resolved entirely on the device (`apps/web/src/intersections.ts`)
by intersecting two named polylines from `map/base.json` and `map/streets.json`. Names are matched with case,
punctuation, "and"/"&"/"at", street-type words (Ave/St/Rd/Blvd/Dr/Hwy and their full forms), number words
("Seven Mile" = "7 Mile") and E/W/N/S prefixes set aside; a typed direction narrows, no typed direction matches
either half. Crossings within 120 m of each other are one junction. Two streets that cross more than once give a
short list, each named by the end of the street it is at ("Dequindre & Davison — north"); one street name gives
the middle of it, with a line saying so; a name we do not have says so **by name** and offers the ZIP entry;
two streets that never meet say that. **The typed text is memory only**: never stored, never sent, never in the
URL or the history — the same rule as the search box (docs/08). The cache holds normalised names only.

**No signal, slow GPS (2026-09-22).** The location request no longer gives up after ten seconds; it runs for
five minutes. At ten seconds the screen says "Still looking… Getting your location can take a few minutes with
no service. Go outside or near a window.", with **Stop looking** beside it and the cross-street and ZIP entries
still on the screen the whole time. Cancelling stops us listening, so a fix that lands after the person has
typed a cross street never moves the map out from under them.

**Two map styles (2026-09-21).** The layers panel has a **Map style** choice: **Standard** (each kind of transport
in one color — the default on every client) and **Subway lines** (bus and rail drawn like a subway map: route
badges, shared-street runs side by side, interchanges, terminals, the People Mover as a loop, the QLINE line
drawn through its stations and marked `derived`). The subway drawing code and each network's `.net.json` file
are separate, signed downloads fetched only when the style is chosen; the standard files did not change by a
byte. The text list is identical in both styles. [MAP-STYLE.md](MAP-STYLE.md) is the shared spec for all three
clients; the choice is kept on the phone and never sent.

**Keyboard and screen reader.** With the map focused, the arrows pan, **N** and **P** walk the features on screen
(the greenway in route order, then places nearest the middle; in Subway style up to 40 route features are
appended), **Enter** opens one, **Escape** steps back out, and Tab always leaves the map. Each step is announced
through the map's live region with the card a tap would show.

**The language control is in the top bar** (2026-09-21): one native `<select>` — a globe and the language in use,
in its own name — between the app's name and Urgent help, on the four tabs and About. It is not drawn on pushed
screens or in the full-screen map's bar (DECISIONS 2026-09-21).

**iPhone:** the Map tab is a full-screen map, edge to edge, with the tab bar left in place; layers and the style
choice are in a sheet; "See this map as a list" is a persistent control; no MapKit and no tiles
([apps/ios/README.md](../apps/ios/README.md)). **Android** (2026-09-21): a Map tab drawn from the same signed files — the greenway, parks, listings by group, the
eleven transport layers, a layer switcher, a text list, a card on tap, virtual accessibility nodes and a
hardware-keyboard walk — in the Standard style; the Subway style is on the roadmap
([apps/android/README.md](../apps/android/README.md)).

Rules that do not change:
- **Sensitive and private listings are never drawn.** Treatment and help after sexual assault are excluded from every layer (`PRIVATE_TOPS`), and inside a group a DV or mental-health-crisis listing is dropped row by row (`isSensitive`).
- **Colour never carries the meaning alone.** Each layer is named in the switcher, named again when you tap a route or a stop, and named in the list under the map.
- **Bus stops wait for the zoom.** There are thousands, so a dense point layer draws only once the map is close enough for stops to be separate things; the list shows them at any zoom, and the switcher says so.
- Unknown is never rendered as open, and freshness is still computed on the device.

Each transport layer is its own file in the signed bundle under `map/transit/`, **downloaded only when that layer is first switched on** and checked against the signed index, then kept for offline use. The small list of which layers exist travels with the bundle (`places/transit.json`), so the switcher draws offline. Sources, sizes and licence notes: `pipeline/src/ingest-transit.ts` and DECISIONS 2026-09-20.

## Parks and paths (2026-09-22)

Kyle, 2026-09-22 (b): *"This is not a Joe Louis Greenway app; it is just one component of the park system. It
doesn't need to be as loud as it is on the main page."* One front door, reached from Home and from the Map tab:

- The map (the greenway **is** drawn here, because this screen is about the paths) and the ordinary location chip.
- **Paths**: the Joe Louis Greenway as **one row** — "20 of 52 stretches open" — to the screen it has always had,
  with its 52 stretch screens, their cross streets, "Help within a 10-minute walk" and their condition reports
  (docs/11) untouched. Under it, the gap named out loud: the Riverwalk and the Dequindre Cut are not in the City
  list we use, so they are not here.
- **City parks**, all 302, **nearest first when a location or a ZIP is known and A to Z when none is** — never by
  acres, by kind of park or by any other number (docs/13, rule 1). Every row opens **a park page**: the City's
  name for it, what kind of park and how big, the address where the City publishes one, a small map, Directions,
  Bus directions, "See on the map", the greenway stretch when one is within half a mile, and the help within a
  ten-minute walk. All of it from `places/parks.json`; nothing new was asked of anybody.
- **Recreation centers and libraries**, then **bike lanes** as a row to the Map tab with that layer.

**Where the greenway is drawn.** Inverted on 2026-09-22: a map draws the greenway only when it is **asked** to.
Asked: the Map tab (when that layer is on), the greenway screen, a stretch, this screen, and a park page whose
park touches an open stretch. Not asked, and no longer drawn: the results-list map, the listing-detail map, the
Areas map, a neighbourhood outline. **Cut on the same day**: the Home tile's live open-segment count
(`rec.gw_sub`, removed), the Map tab's full-width greenway feature button, the greenway's name from `map.lede`,
and the "Neighborhoods along the Joe Louis Greenway" lens row from the Areas landing and from `hoodList` — the
`#/n/lens-jlg` URL keeps working and keeps its own note.

## The mouse cursor (2026-09-22)

On the map canvas the cursor is a **pointing hand over anything a click would open or name** — a listing dot, a
greenway stretch, a park, an area outline, a transit line or station — and the **grab** hand everywhere else,
because everywhere else the map is a thing you drag. The hand is decided by the very same hit test as the click
(`probe` in `apps/web/src/map.ts`), so it can never promise something a click does not do; it is worked out once
a frame at most, only for a mouse or a pen, and a drag is not a hover. Elsewhere in the app, `summary` rows, tick
boxes, radios and selects gained the hand, and anything switched off says so with the default arrow instead.

## List / Map

- Same query, two views. The map is closed until asked for ("Show these {count} on a map"), so the first **Call** button stays near the top. Every listed place with coordinates is a dot that opens its details. Sensitive listings (DV, mental-health crisis) never get a dot, and the "not safe at home" screen has no map. The list is fully usable if the map fails to load.
- The map is drawn on the phone from City of Detroit open data in the signed bundle (streets, parks, city edge). No tile server or map company is contacted (see 08, "Maps").
- Filters (not built yet): Open now · No ID needed · Walk-in · Wheelchair accessible · Spanish/Arabic spoken (from HSDS Language).
- Not built yet: dots colored by freshness badge, and clustering at zoomed-out levels.

## Resource detail

Top → bottom:
1. Name (in the top bar) · organization · open now or next time, computed from RRULE ("Open now until {time}" / "Closed now. Next: {day} {time}") · freshness badge, which states a fact and never says "verified" and which distinguishes who looked ("A program matched this to their website on {date}" for a script's match, "Their website was read and matched on {date}" for a person's browser read, "Nobody has checked it. Call first." for neither) · a notice, if the listing has one.
   **On a holiday** a row whose schedule would have said "Open" says "Holiday today. Call first." instead, with a line naming its usual hours ("Today is a holiday. The usual hours are {hours}, but they may be different today. Call before you go."), and an occurrence in "Next times" that falls on a holiday is labelled "Holiday. Call first." rather than dropped. Nobody's holiday hours are in any source we read, so the app stops claiming and starts saying what it knows (`schema/query-spec.md`, "Holidays").
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
6. **"Near a park or path"** (revised 2026-09-22): whichever of the nearest City park and the nearest open
   greenway stretch is closer, within a quarter of a mile, and both open a page. It used to be a greenway-only
   row at half a mile — one path named on every listing in the app and 302 parks named on none (audit §6).
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

Four languages are built: English, Spanish, **Arabic** and **Bengali**. The app picks the first of the phone's own languages it has words for, and a control in the top bar (a native select, since 2026-09-21; before that a row of links on Home and About) lists all four, each written in its own name (English · Español · العربية · বাংলা) with its own `lang` attribute; the choice stays on the phone and is never sent. **Each language other than English is a separate file, fetched only when it is chosen** (DECISIONS 2026-09-19), so an English reader downloads none of them; once fetched they are kept for offline use. With no signal and no saved copy the switch does nothing and the app stays in English. **Arabic reads right to left** and the whole interface mirrors — the stylesheet is written in logical properties, so there is no second stylesheet; the map itself never mirrors, because left is west in every language. Dates, times and numbers in Arabic and Bengali use Western digits, so a phone number reads as it is dialled (DECISIONS 2026-09-20). **Arabic and Bengali were drafted by machine on 2026-09-20 and no native speaker has read either one yet** (DECISIONS): no screen says they were checked, and a native reviewer is a condition of a public release, crisis screens first. What a place wrote about itself stays in English, marked as English, with the line "This place's own words are shown in English, the way they wrote them." We never machine-translate safety-critical text. Later: the bundle may carry an owner's own translation of a description.

**Details settled by the 2026-09-20 walk-through of every screen in Arabic and Bengali:** "am" and "pm" are translated strings (`clock.am`, `clock.pm`) while the digits beside them stay Western, and the list separator is a string (`list.sep`) — on all three clients. Dollar amounts are written the way the record writes them (`$85,000`), falling back to `en-US` where a language's own `Intl` rules do not lead with the sign. The uppercase, letter-spaced section headings apply only under `:lang(en)` and `:lang(es)`, because letter-spacing breaks Arabic joining and Bengali conjuncts. A phone number and its extension sit inside **one** `<bdi>`, so nothing can reorder into a number a person would misdial. **Known limit: searching in Arabic or Bengali returns nothing**, because every listing is written in English; the empty state needs one honest line about that, and its wording waits on the native reviewer (CHECKS-2026-09-20 §7).

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
