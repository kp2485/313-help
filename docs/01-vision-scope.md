# 01 — Vision & Scope

## Problem

Detroit has an enormous, fragmented safety net: city departments, DHD programs, 211, CAM, food banks, church pantries, rec centers, libraries, mutual aid. The information about it is scattered across press releases, PDFs, third-party aggregators, and word of mouth — and it goes stale fast. Mobile pantries move. Warming centers activate for four days and close. A Narcan newsstand gets relocated. Someone in crisis follows a two-year-old listing to a locked door.

The Health Department tried to solve this with D Compassion (built Dec 2024; released by a vendor in 2025 as the "Detroit Compassion App," about ten installs — corrected 2026-09-18, see 07). It asks residents for their name and phone number, its directory was hardcoded in the build we examined (so it couldn't be kept current), and that build had no back end. See 07-gap-analysis.md.

## Who it's for

**Service area:** Detroit, plus Hamtramck and Highland Park (inside Detroit's borders) and Dearborn (Kyle, 2026-09-19). Places in those four cities are listed; other suburbs are not.

Primary: **any Detroit resident who needs help right now** — food this week, a bed tonight, Narcan, utility shutoff help, a cooling center, a clinic. Assume: an older or budget Android phone, prepaid data that may be off, low tolerance for forms, possibly in crisis, possibly reading at a 6th-grade level, possibly Spanish-, Arabic-, or Bengali-speaking.

Secondary:
- **Helpers** — CHWs, church volunteers, librarians, outreach workers, SisterFriends, Health Hub students — who look things up on behalf of someone else and are the most likely people to report changes.
- **Resource providers** — a church running a Forgotten Harvest mobile pantry, a barbershop with a Narcan newsstand — who want to be listed and keep their listing right.
- **Everyone the Map and the neighborhood pages serve** (added 2026-09-21, as the app grew past crisis help): bus and rail riders (DDOT, SMART, QLINE, People Mover, Amtrak, intercity buses, park-and-ride, reduced-fare IDs, the Transit app hand-off); cyclists and MoGo users; families and older adults using parks, recreation centers and the Joe Louis Greenway; neighbors and block clubs reading their neighborhood page (help nearby, home sales beside permits, blight, Safe streets).
- **People who use assistive technology** — screen readers, keyboards, switches, large text — for whom every map is also a text list and the app is audited against WCAG 2.2 AA.
- **Data consumers** — 211/CIE, DHD, or anyone else who wants a clean, current dataset. *We do not assume any institution will maintain data for us.* As of 2026-09-18, DHD has not offered to maintain a list or a feed; the plan works without them.

## What it is

A **directory + triage + freshness system** for Detroit help resources:

- Browse and search resources by category, map, and "open now."
- Answer 2–4 taps ("I need food this week") and get the two or three resources that fit — computed on the device.
- See how fresh each listing is and report when it's wrong.
- Get time-boxed alerts (cold-weather respite activated, cooling centers open, mobile pantry today).
- Find recreation: the Joe Louis Greenway, City parks, and rec centers.
- Get transit links (DDOT, SMART, People Mover, QLINE, MoGo), see 11 transport layers on the map, and get bus directions to any listing — in the browser, or in the Transit app on a phone that has it.
- ~~See City events.~~ Dropped until the City publishes a real events feed (DECISIONS 2026-09-19).
- Read a page for each of the 205 neighborhoods: help nearby and public-data facts (doc 13).
- Works offline from a bundled snapshot.

## What it is NOT

- **Not an intake system.** It never asks who you are. "Someone will contact you" workflows belong to 211/CIE and CAM, where humans answer.
- **Not a city app.** Shipped by Kyle Peterson / Linwood Technologies. DHD content is public information, attributed; there is no written permission (see 08); the city's name is not on the store listing unless a written agreement says so.
- **Not a case-management or bed-management tool.** Real-time shelter availability is 313SafeBeds' domain; we link to it or embed its public status when it exists.
- **Not a general Detroit services app** (permits, taxes, trash pickup). Scope is *help and healthy places*: things that are free, physical, near you, and good for you — a pantry, a clinic, a park restroom, an open stretch of the Joe Louis Greenway (doc 11, approved 2026-09-18). Crisis paths don't change: Urgent help is one tap from every screen, and the Help tab leads with urgent needs.
- **Not a scraper that rehosts other directories.** We ingest sources we have rights to, attribute them, and add value through verification and reporting.

## Design principles (test every decision against these)

1. **Zero PII, by construction.** No accounts, no names, no phone numbers, no location history stored server-side. Reports are anonymous. If a feature needs PII, it's out of scope.
2. **Never lie about freshness.** Every listing shows when it was last checked and how (source type), and what people have reported. Listings change only when people report something, never because time passed (DECISIONS 2026-09-19). Unknown is shown as unknown, never as "open."
3. **Three taps to a phone number.** In crisis, the path to "call this" or "go here" must be shorter than the path to anything else. Emergency contacts are always one screen away.
4. **Works on the worst phone with no signal.** Offline-first, small bundle, no heavy map SDK required for core function, no login walls, no video.
5. **Plain language, multiple languages.** English first. Spanish, Arabic and Bengali are all built (2026-09-20), Arabic right to left; **none of the three has been read by a native speaker yet**, and no screen says otherwise. Reading level ≤ 6th grade for all UI copy.
6. **The data outlives the app.** Canonical data is a published, versioned, openly licensed dataset in an HSDS-shaped format. The app is one consumer of it.
7. **Assume nobody maintains anything.** The directory must stay honest if no institution ever lifts a finger: we watch public sources, the community flags and confirms, stewards verify, and rows nobody has checked decay visibly. An org that *wants* to own its rows (a church, a food bank, someday DHD) can opt in — that's a bonus, never a dependency.
8. **Never ask what you can't act on.** If the triage asks about safety, the very next screen is a number to call. (This is why the D Compassion intake was harmful, not just useless.)
9. **Ship small, ship real.** A directory with 60 verified resources beats one with 600 unverified ones.

## Success looks like

- A resident finds a real, open food distribution within 60 seconds on first launch, no account, no signal.
- A church volunteer adds their pantry's schedule in under five minutes and gets an honest confirmation: a person checks it first, which can take a few days.
- A closed resource reported by two people carries a "reported closed" warning after the next build and is archived at the next weekly steward pass — and if no steward ever comes, the warning stays.
- DHD edits its station layer; the nightly job opens a pull request with any change; a steward merges it, and the app reflects it — without anyone at DHD doing anything for us.
- 211/CIE can pull our dataset as HSDS and find nothing they can't parse.
