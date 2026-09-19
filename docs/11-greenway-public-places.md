# 11 — Healthy Places: the Joe Louis Greenway, Parks, and Rec Sites

Status: **approved by Kyle 2026-09-18.** Changes scope set in 01. Built so far: segment ingest (52 segments, 20 open), on-device geometry (`packages/query/src/places.ts`), access-shed report, all 302 City parks, a Recreation tab, condition reports on open segments with an optional photo (photos are demo-only until the private bucket exists and we have legal advice), the app's own street map with the cross streets of each segment, and in-app neighborhood pages with a greenway lens (doc 13). **Layer B below is superseded by [doc 13](13-neighborhood-indicators.md): the public-data indicators now cover every Detroit neighborhood, with the greenway study area as one lens.** Facts marked **[checked]** were verified on the web on this date.

## Why this belongs in a help app (and the test for what doesn't)

01 says "not a general Detroit services app." That line stays. What changes: the app's subject becomes **help and healthy places** — things that are free, physical, near you, and good for you. A food pantry and a greenway trailhead pass the same test:

> Is it free (or nearly), open to anyone, a place you can go today, and does knowing about it make a Detroiter's week healthier or safer?

Parks, the greenway, rec centers, pools, splash pads, and free outdoor programs pass. Permits, taxes, and trash pickup still fail. **Golf courses mostly fail** — they charge fees — so the three city courses (Rouge Park, Chandler Park, and Rackham, which is in Huntington Woods, outside the city and outside our bbox **[checked]**) are listed as places with a `cost: paid` flag for completeness, carry their free programs (youth clinics, winter sledding/walking where offered) as services, and never appear in triage.

There is a harder reason this fits. For the app's primary user, public places **are** help:
- A park restroom and a working water fountain are hygiene resources for someone living outside.
- Splash pads, shade, and rec centers are the cooling network during a heat alert — already in 02.
- A lit, open greenway segment is how someone without a car gets to the pantry.

So the feature is not "a parks app bolted on." It is one map where the greenway is the spine and help hangs off it.

## Guardrail zero: crisis users pay nothing for this

- Home order doesn't change: emergency strip → alerts → needs → categories. Recreation (greenway, parks, rec centers) is its **own tab**; Home has one Recreation tile, next to Transit, below the help entry and events.
- Triage doesn't get a "get outside" entry. Triage is for need.
- Place data ships as its own bundle file (`places/greenway.json` + `places/parks.json`), fetched after the help categories. A phone that only ever loads food never downloads a trail map.
- Cut line for the hackathon is stated at the bottom. Help features win every conflict.

## What the greenway is (for the data model) **[checked]**

- About 29 miles when complete (City sources say 29; the City's own dataset says 30; older sources 27.5 — say "about 29"). Runs through **Detroit, Dearborn, Hamtramck, and Highland Park**.
- Built and led by the City's General Services Department with a citizen advisory council; the **Joe Louis Greenway Partnership** is the nonprofit partner. How day-to-day operations split between them is not published — **ask**.
- Open as of late 2025: Warren → Joy → Intervale (about six miles of new trail), plus older connected pieces. More was scheduled for 2026; full loop targeted around 2030.
- The City publishes **Joe Louis Greenway Route Segments** as an ArcGIS feature service with a per-segment phase: Open / Under Construction / Funded / Unfunded. That field is the truth for "can I walk here today" — **Tier A**, ingest it.
- The Planning Department's Neighborhood Planning Study (finished Sept 2024) covers ~½ mile each side of the route and sets goals we should measure against: keep homeowners in place, preserve affordable housing, support small business and jobs. There's an open dataset of that study area — use it as the **impact geography** so our numbers line up with the City's.

## Three features

### 1. Places (browse and find)

**Resident sees:** the Recreation tab → list/map of nearby places. Each greenway segment shows **Open / Being built / Planned**. *(Not built; no amenity data exists:)* what's there — restroom, water, playground, splash pad, walking loop, shade, lighting, paved/accessible path, bus stop nearby — and free programs (yoga on the greenway, senior walking club, open gym) with "Next: Sat 9:00am," using the same schedule machinery as pantries.

**The bridge feature — "Help along the Greenway":** tap any trailhead or segment → "Within a 10-minute walk or roll": the pantry, the clinic, the Narcan station, the rec center, the library. And the reverse on every help listing near the route: "0.3 mi from the Joe Louis Greenway (Joy Rd entrance)." This is the screen to show a greenway judge: it treats the trail as infrastructure for reaching help, which is what the framework plan says it's for.

**Data model:**
- *(Not built; no amenity data exists. Today segments and parks ship as their own files, `places/greenway.json` and `places/parks.json`, not as HSDS Locations.)* A place is an HSDS **Location** with `x_detroit.place`:
  ```json
  { "kind": "park | greenway_segment | trailhead | rec_center | pool | splash_pad | golf",
    "phase": "open | under_construction | funded | planned",
    "amenities": ["restroom", "water", "playground", "shade", "lighting", "accessible_path"],
    "amenity_status": { "restroom": { "state": "seasonal", "open_months": "5-10" } },
    "cost": "free | paid",
    "geometry_ref": "greenway.geojson#seg_warren_joy" }
  ```
- Programs at places are ordinary HSDS **Services** (org = Detroit Parks & Recreation or the Partnership) joined by ServiceAtLocation. No new machinery. *(Not built.)*
- New ID prefixes `plc_` and `seg_` (DECISIONS.md). Segment IDs key off the City's segment name, and survive phase changes.
- Greenway geometry: simplified and shipped in `places/greenway.json` (about 23 KB). The app's own street map (docs/06) draws it offline; there is no tile server.

**Sources [checked]:**

| Source | Tier | Notes |
|---|---|---|
| JLG Route Segments (data.detroitmi.gov, ArcGIS feature service) | A | Has phase per segment. Layer last edited 2026-09-13. |
| JLG Planning Study Area | A | Impact geography. |
| City Parks | A | Boundaries, type, acreage — **no amenity fields**. |
| Recreation Centers | A | Already in 02. |
| City of Detroit Greenways | A | Dequindre Cut, RiverWalk links, etc. |
| Amenities, splash pads, pools, golf | — | **No open dataset found.** Seed by hand from the Parks & Rec site for places within ½ mile of open greenway segments first; then community confirms keep them honest. |
| Dearborn / Hamtramck / Highland Park segments | ? | Confirm the City's layer covers them; if not, ask the Partnership. |

Rights: none of those City datasets states a license **[checked]** — "unstated" is not "open." Add this to the DHD/City ask; 10-B12 applies.

**Freshness applies to places too.** "Restroom: open" is a claim, like pantry hours. Amenity states would carry the date they were checked and change on people's reports, like listings. An unknown restroom renders "Restroom — not sure if it's open," never "open."

### 2. Condition reports ("Tell the greenway team")

**Resident sees:** on any open greenway segment → **"Something need fixing?"** → one tap. (Parks have no report button yet.)

- Light out
- Broken glass or trash
- Flooding or ice
- Path damaged
- Overgrown / blocked
- Broken bench, fountain, or sign
- Restroom closed or not working
- Dumping
- 👍 Looks good today *(the positive confirm — same role as "Still open")*

Optional photo. Optional 280 characters. Done. Honest confirmation (`report.sent_place` in `strings/en.json`): **"Thanks. We can't promise when it gets fixed. If someone is hurt or in danger, call 911."** It does not say anyone passes it on, because nobody has agreed to receive it yet (see "The DHD lesson" below).

**The rule that defines this feature: reports are about things, never about people.**

There is no category for a person, a tent, a vehicle someone is sleeping in, "suspicious activity," or loitering, and free text that describes a person is dropped by the steward, not forwarded. This is not squeamishness. Research on complaint systems (Herring, *American Sociological Review*, 2019 **[checked]**) shows 311-style reporting becomes a main driver of policing unhoused people. The city's existing reporting app has a "Squatters Issue" type **[checked]**. Our primary user is the person those complaints get filed against. An app that offers them a bed with one hand cannot take reports on them with the other. If a reporter is worried about a person, the app offers what it's good at: "Someone need help? Here's who to call" → the outreach/HelpLine listing.

Say this rule out loud to the judge. It's a feature.

**Privacy design (zero-PII holds):**

| Risk | Design |
|---|---|
| GPS reveals where the reporter is standing | **The phone's location is not used at all.** The report names the segment whose screen is open. There is no cross-street picker. The server only ever sees a public segment ID. |
| Photo EXIF (GPS, device, time) | The file input asks for the camera. The phone re-draws the picture on a canvas (at most 1280 px), which keeps pixels only, then cuts any non-picture blocks the browser added. The server does not re-encode: it refuses any JPEG that still has an Exif, XMP, ICC, IPTC or comment block, and drops any bytes after the end of the image. A Worker test proves it, next to the no-IP test. |
| Faces, plates, house numbers in frame | Capture screen says "Take a picture of the problem, not of people." On-device face detection (lazy-loaded, only in the photo flow) blocks out faces with **solid boxes, not blur** — blur can be reversed **[checked]**. Detection fails or is unsupported → photo still sends but is tagged for steward review before forwarding. Steward can redact or discard. |
| Photos of people's homes accumulating into a neighborhood surveillance archive | Photos are **never public**, never in the bundle or the open dataset. Private bucket, steward/partner access only, **deleted 30 days after the report closes**. This is a stated exception to "nothing is deleted": that rule protects resource history, not images. (DECISIONS.md) |
| Anonymous image upload = abuse magnet (illegal content on our storage) | Nothing uploaded is ever served back to the public. Size/type caps, image re-encode (kills polyglot files), invisible Turnstile / app attestation, edge rate limit. Stewards get a one-click "discard and report" path and written guidance on legal reporting duties. **Get legal advice on this before photos ship publicly**; at the hackathon, photos are demo-only. |
| Linkable trail of one person's walk | Per-target nonce from audit A4: `sha256(secret ‖ target ‖ day)`. Five reports on five segments are five unlinkable hashes. For condition reports the observed time, the received time, and a photo's upload time are all stored to the hour. |
| Apple/Play labels | Declare "Photos or Videos — not linked to you" and "User Content" (audit B5). |

**Lifecycle (designed, not built):** `open → forwarded → acknowledged → fixed | wont_fix | duplicate`. Today a condition report is `open` until a steward closes it (accepted / rejected / duplicate, like any report). ID prefix `cond_`. *(Designed, not built from here to the end of this paragraph.)* Two reports of the same kind on the same segment within 7 days merge. Hazards that matter to the next walker (ice, flooding, light out) show on the segment as **"Reported 2 hours ago: ice near Joy Rd"** via `signals.json` (audit B4) after one steward tap or two matching reports — text only, never the photo. They expire (ice: 48h; light out: until fixed or 30 days).

**The adversarial questions a greenway judge should ask, answered:**

1. *"The city already has Improve Detroit. Why this?"* — Improve Detroit ties reports to accounts, emails, precise location, and device IDs **[checked]**, has no greenway request type **[checked]**, and is a City of Detroit tool, while a quarter of the route is in three other cities. We are the no-account, works-offline, segment-aware front end. We should **feed** it, not fight it: for Detroit segments, stewards forward via the public Open311 API (verify write access and terms) or a daily digest; for the other three cities, the digest goes to whoever the Partnership names.
2. *"Who reads these?"* — Best case, a named person at GSD or the Partnership gets a daily digest; the ask to the judge is "who should get this email?" But we don't depend on a yes (see "The DHD lesson" below): with no recipient, reports go to a public open-issues list, and the app says exactly that. What never ships is a button that implies someone official is reading when nobody is (Principle 8).
3. *"Will you tell residents it got fixed?"* — Yes, and that's the part 311 systems skip: the segment shows "Fixed Sept 22 — thanks to a neighbor's report." No account needed because the feedback is on the place, not to the person.

### 3. Impact ("Is the greenway helping?")

Two layers. Neither touches resident data.

**Layer A — what the app itself knows (small, honest):**
- Condition reports per segment per month, by kind; median days to "fixed"; "looks good" confirms per segment. This is a maintenance dashboard the Partnership doesn't have today.
- **Access shed:** for each open segment, the count of verified help resources within a 10-minute walk, by category — and the gaps ("no free food within ½ mile of the Intervale segment"). Recomputed every build; tracked over time. This measures the greenway as a connector, which no public dataset does.
- *Not* per-user anything. If analytics ever turn on (audit B7), place views are category-level weekly counts. We do not count "visits," and we say so: the right tool for visits is a **trail counter**, not a phone. Whether counters exist on the route is not published **[checked: could not verify]** — ask, and ingest them as an owner feed if they do.

**Layer B — superseded: see [doc 13](13-neighborhood-indicators.md) (citywide, all 205 neighborhoods; the greenway study area is one lens). The table below is kept for the greenway-specific caveats.**
A static, public dashboard page (built by the pipeline, no server) comparing the ½-mile planning-study area to the rest of the city and to itself over time, using open datasets **[checked, all exist on data.detroitmi.gov]**:

| Question the framework plan asks | Dataset | Caveat |
|---|---|---|
| Is blight going down? | Blight Tickets; Completed Demolitions; Improve Detroit Issues (dumping, park issues) | Tickets measure enforcement as much as blight. |
| Is investment arriving? | Building Permits | Permits ≠ benefit to current residents. |
| **Are residents being pushed out?** | Property Sales (price and volume trend); add tax-foreclosure and eviction-filing data if obtainable | This is the metric that keeps the dashboard honest. A greenway that raises prices and displaces neighbors is an impact too, and the planning study names it as the risk. Lead with it. |
| Is it safer to walk and bike? | Traffic Crashes (ped/bike involved) | Small numbers; show multi-year windows. |
| Crime | RMS Crime Incidents | **Recommend leaving this off v1.** Crime maps stigmatize blocks and invite the people-reporting dynamic we just designed out. If the Partnership wants it, aggregate to the whole corridor, never per segment. |
| Are people healthier? | CDC PLACES tract estimates (physical inactivity, obesity, mental distress) | Model-based, ~2-year lag **[checked]** — it **cannot** detect a greenway effect at tract level. Show as baseline context only, labeled as such. Do not let anyone put a PLACES delta on a slide as "impact." |

Honesty rules for Layer B: the route wasn't placed at random, so before/after differences are **descriptive, not causal**; every chart carries its caveat in plain words; segments are compared to themselves over time first, to the city second. A dashboard that overclaims will be torn apart by the first planner who sees it — and the judge is one.

## The DHD lesson, applied here

The help directory was first designed around DHD maintaining a spreadsheet. They never signalled they would. Assume the same of GSD and the Partnership until proven otherwise:

- **Places data** comes from the City's open layers plus our own hand-seeded amenities (later; none seeded yet). Nothing waits on the greenway team.
- **Condition reports** must be useful with no recipient. Fallback if nobody agrees to receive a digest: reports (structured fields only — kind, segment, date, status; never photos or free text) publish as an open dataset and a public "open issues on the greenway" page that block clubs, council staff, and reporters can read. The confirmation copy changes to match: "Thanks. This is now on the public list of greenway issues. We can't promise when it gets fixed." That is still an honest promise (Principle 8).
- **"Fixed" status** then comes from neighbors ("Looks good today" on a segment with an open issue closes it after a steward glance), not from the agency.
- A named recipient makes all of this better. It is an upgrade, not a dependency.

## What to ask the greenway team (one conversation)

1. Who would receive a daily condition digest — one person at GSD, one at the Partnership? For the Dearborn, Hamtramck, and Highland Park segments?
2. Are there trail counters? Can we get the counts as a feed?
3. Is there an amenity inventory (restrooms, fountains, lighting, call boxes) we can seed from? License for the route-segment and parks layers?
4. What three numbers would they most want to see every month? (Build Layer A around the answer, not around our guess.)
5. Would they put a small QR marker at trailheads? ("Scan to report or confirm" — presence-weighted reports, audit A1.6. Also the distribution channel for the whole app.)
6. Are they comfortable with the "things, not people" rule being stated publicly as joint policy?

## Hackathon slice (must not displace build steps 1–4 in CLAUDE.md)

In, ~half a day total, all riding on machinery the core already needs:
1. **Done, changed:** ingest JLG Route Segments + Recreation Centers + **all 302 City parks** (not only those near open segments) → `places/greenway.json` + `places/parks.json`. No amenities: no amenity data exists, so none were seeded.
2. **Done, changed:** a Recreation **tab** (not a tile-only screen) → list + segment phase. **"Help along the Greenway"** panel on segment detail and the "near the greenway" line on help listings.
3. **Done, changed:** condition report = the existing report endpoint with new `kind` values and `seg_`/`plc_` targets, in the same steward queue. **No snap-to-segment:** the report names the segment whose screen is open.
4. **Done:** photo — canvas re-draw + metadata-rejection test; stored privately; visible only in the steward queue. No face detection yet — capture-screen copy + steward review instead, and we say so. Demo-only until the bucket exists.
5. **Done, changed:** the static impact page became in-app neighborhood pages (doc 13) with a Joe Louis Greenway lens, including the property-sales trend, caveats included. The access-shed table is `data/indicators/greenway_access.json`.

Out until after the hackathon: face block-out, Open311 forwarding, hazard signals on segments, trail-counter feed, the full Layer B dashboard, pools/splash-pad seasonal alerts, golf.

**Demo beat (30 seconds, slots in after the steward-archive beat):** "Same app, same zero-PII pipeline, pointed at the greenway. Here's the Joy Road segment: open, its cross streets, and everything within a ten-minute walk that can help someone. A neighbor reports a light out — no account, the phone never sent its location, the photo has no metadata — and it lands in the same queue. And there is no button for reporting a person. On purpose."
