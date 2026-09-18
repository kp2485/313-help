# 08 — Privacy, Safety, and Review

## The posture in one line

We can't leak what we never collect. Every design choice below is downstream of that.

## What is stored, where, and for how long

| Data | On device | Server | Retention |
|---|---|---|---|
| Resource bundle | Yes (cache) | CDN (public) | Versioned, public forever |
| Triage answers | RAM only during the flow | Never | Gone on exit |
| Location | Used in-memory for sorting; never written | Never | — |
| Saved resources | Yes (local only) | Never | Until user clears |
| Reports | Queued until sent | Yes, minus IP, minus device ID | 180 days raw, then aggregate counts only |
| `install_secret` | Yes (random) | Never sent; only per-target daily hashes of it (`client_nonce`), which cannot be linked to each other | User can reset in About |
| Provider claim email | No | Yes — for providers only, verification + row ownership | Until provider removes it |
| Analytics | Aggregate counters only | Aggregate counters only | 13 months |
| Steward identities | — | Cloudflare Access allowlist + action log | Operational |

No resident-side account, email, phone, name, or persistent identifier ever crosses the network. Deep links contain only resource IDs.

## Anonymous reporting — why it's safe enough

- `client_nonce = sha256(install_secret ‖ target_id ‖ date)` prevents one device from double-counting on a target within a day. Every target and every day gives a different hash, so the server cannot connect one person's reports into a trail of places. It is a dedupe aid for honest devices, not a security control — abuse is limited at Cloudflare's edge, which processes IP addresses in transit; we never read or store them.
- The Worker discards `cf-connecting-ip` and stores submission time at minute granularity.
- Report text is limited to 280 chars and the UI copy says "Don't include your name or phone number." Steward tool auto-masks anything matching a phone/email pattern before display.
- Abuse is bounded by design: no single report ever removes a resource (04).

## Youth

This app is separate from CommunityChest specifically so youth-meetup safety questions and harm-reduction content don't tangle. Even so, young people will use this app (they should — Narcan saves their friends). Rules:
- No user-to-user contact features of any kind. Nothing to groom through.
- No collection of age, ever. No "are you under 18" gate — a gate is itself a data collection and a barrier to help.
- Harm-reduction content is factual and directive ("call 911, here's Narcan, here's how"), never moralizing and never promotional.
- Age rating: expect 17+ on Apple due to "Medical/Treatment Information" and "Alcohol, Tobacco, or Drug Use or References" — accept it; the alternative is stripping Narcan, which defeats the purpose. Check whether "Frequent/Intense Medical/Treatment Information" is the right selection when submitting.

## Harm-reduction content guidelines

- Narcan/naloxone: 911 first; how to recognize an overdose; step-by-step naloxone use with illustrations; stay with the person; Michigan's Good Samaritan law summary (verify current statute text before shipping). Source the medical content from DHD or MDHHS materials, attributed.
- Test strips: what they are, where to get them, how to use — factual.
- Never list dealers, prices, or anything that reads as sourcing.
- Never store "I need Narcan" as a preference or history.

## Domestic violence & crisis

- "I'm not safe at home" results show hotline + 911 before any location — a shelter address can be dangerous to display to the wrong person; DV shelters are listed by intake phone only, never by address, unless the shelter explicitly lists its address publicly.
- Quick-exit: DV and mental-health screens have a visible "leave quickly" button that returns to Home and clears the back stack.
- 988 and DWIHN crisis line on every mental-health path.

## Authorization & branding (city relationship)

- **Plan of record: no letter.** The app lists only information DHD already publishes, attributed as "Source: Detroit Health Department public listings," with no DHD name in the title, no logo, and "Not an official City of Detroit app" on first launch and in About. A one-page letter (permission to use the name/logo, confirmation it's not a city product) would be welcome and is worth one ask — but DHD has not signalled it will take on any role, so nothing depends on it, and we never imply endorsement.
- Store listing is under Kyle Peterson / Linwood Technologies. "City of Detroit" does not appear in the app name.
- Partner data (Forgotten Harvest, Gleaners) only with written permission or a feed they hand us; otherwise link out.

## Disclaimers (short, plain, in-app under About and on first launch — one screen, one tap)

- "This app lists help from the City of Detroit and community organizations. Info can change. If it's an emergency, call 911."
- "We don't collect your name, number, or location. Reports you send are anonymous."
- "Not an official City of Detroit app."

## App Store / Play review notes

- Apple guideline areas to expect: 1.4 (physical harm — medical info must be sourced), 5.1.1 (data collection — we can honestly declare "Data Not Collected" if analytics ship off or are truly identifier-free; verify against the nutrition-label definitions), 4.2 (minimum functionality — a directory with map, offline, and reporting clears it).
- Play: Data safety form — declare "no data collected/shared" if accurate; the Health category may require a privacy policy URL anyway; publish one.
- Both stores: a privacy policy page at the app's domain, plain language, matching the table above.

## Open-source & data license

Publishing the dataset (CC BY 4.0) and code (MIT/Apache — decide) is part of the safety story: anyone, including DHD, can audit that we do what we say.

## Maps

The street map is part of the signed bundle and is drawn on the phone (docs/06). No map company, tile server, or third party is contacted, so nobody learns where a person is looking. The map files are downloaded whole, the same two files for everyone. The map does not move to the person's location on its own; the location dot is drawn on the phone only after "Use my location," and a typed ZIP is never drawn as a location. **Directions** and **Bus directions** still hand the destination address to the maps app the person chooses; the screen says so.
