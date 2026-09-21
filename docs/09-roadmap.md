# 09 — Roadmap

The short version is the **Roadmap** section of [/README.md](../README.md); this is the fuller one. It lists
features, by horizon. Day-to-day working lists live elsewhere: the steward worksheet is
[CHECKS-2026-09-20.md](CHECKS-2026-09-20.md), open decisions and licence questions are the *Open* rows of
[DECISIONS.md](DECISIONS.md), and store-release checklists are in [apps/ios/README.md](../apps/ios/README.md) and
[apps/android/README.md](../apps/android/README.md).

## Where we are (2026-09-21)

The hackathon build order — seed data and signed bundle, the PWA, the Worker and D1, the steward queue, the
iPhone app, the Android app — is done, and the app is **live at <https://313help.com>**: a release-signed bundle of
531 listings, the write API at `/v1`, the steward queue behind Cloudflare Access, and a nightly publish job
(`.github/workflows/publish.yml`, `PUBLISH_ENABLED=true`). Status by date is in [README.md](README.md).

## Now

### 1. Provider-verified listings — the biggest freshness lever

Everything we do today notices a problem *after* it exists: a page stopped matching, a visitor found a locked
door. The only party who knows *before* is the organization itself. A script can notice that a page changed; only
the owner knows the pantry is moving next month. So the best single improvement to freshness is to make it
effortless for owners to confirm or fix their own listing — without creating accounts or holding resident data.

- **"Confirm or fix your listing."** A signed, expiring link is sent to the contact address printed on the
  organization's **own page** (never one typed into a form). Opening it shows the listing as residents see it,
  with two buttons: *Still right* and *Something changed*.
- *Still right* records a dated `owner_attest` confirmation. The method and its badge already exist in the
  schema and all four strings files: "The people who run it checked this {days} days ago."
- *Something changed* opens the same fields as "Add a place." Any phone, address or coordinate change is **held
  for a steward**, exactly like a change from any other source.
- No account, no password, no resident data. The provider contact address is the only address the project would
  hold, it belongs to an organization, and it is used for nothing else (docs/08).
- A gentle cadence: a reminder link every few months for listings with schedules, sooner for mobile pantries and
  seasonal programs. Silence changes nothing on screen; there are still no timers on listings (docs/04).
- DV rows keep their rule: a provider can confirm a phone line and a coarse service area, never an address.

### 2. Language and accessibility, with people

- Native-speaker review of Spanish, Arabic and Bengali: overdose, crisis, domestic-violence and sexual-assault
  screens first, then badges and the privacy screen ([CHECKS-2026-09-20.md](CHECKS-2026-09-20.md) §7).
- Sessions with people who use screen readers, switch control, large text and 400% zoom, following
  [ACCESSIBILITY-TEST-SCRIPT.md](ACCESSIBILITY-TEST-SCRIPT.md). The code audit is closed (44 pass, 27 fixed, 0
  open); this is the part only people can do.

### 3. Store releases

App Store and Google Play releases under an organization account, so the listings can be handed over with the
rest (docs/12). Both stores' privacy answers are the same sentence: no data collected, no data shared.

## Next

- **Page watchers.** Watch each owner's page and open a steward task the day it changes — hours, a closure
  notice, a new address — rather than only when the phone or street number stops matching. Watchers never change
  the app by themselves.
- **Same-day signals.** A small signed `signals.json`, refreshed through the day: "out of food today," a warming
  or cooling center opened, a mobile pantry cancelled. Each signal has an owner, a source and an expiry.
- **Partner feeds.** Gleaners and Forgotten Harvest distribution schedules from the food banks themselves, and an
  HSDS exchange with 211: they take our export, and we read theirs as a staged source.
- **Richer transit.** Stops in travel order in the text list, "which routes stop near this place," and GTFS-based
  trip hints computed on the device. Still no real-time tracking and no origin ever sent anywhere.
- **Client parity.** All three clients have the Map tab, its layers and both map styles, drawn from one spec.
  Next: neighborhood pages and add-a-place in both native apps.
- **Steward mobile mode.** Verify-on-the-go for outreach workers: open the queue on a phone, confirm in person,
  logged as `in_person`.
- **Coverage passes.** Neighborhoods where the list is thin, Highland Park's urgent-care gap, and a recorded
  "coverage checked" date per neighborhood so an empty list can say whether anyone has looked.
- **Holiday hours from owners.** The holiday rule is honest ("Holiday today. Call first."); provider confirmation
  is how real holiday hours arrive.

## Later

- **Photos on condition reports**, after the legal review in docs/11: storage, abuse protection on the write API,
  and on-device face block-out first.
- **Search in every language** — listings are written in English today; search by category words and translated
  service names.
- **Local notifications** for saved places and alerts, scheduled on the device.
- **Signing-key rotation and revocation**, and a rollback floor for fresh installs on every client.
- **More neighborhood lenses** (docs/13): council districts, CDC PLACES health estimates by tract.
- **313SafeBeds** beyond a link, if their public status becomes something to embed.
- **Health Hub and QR-code distribution** with community partners.

## Beyond Detroit: Michigan, then national

### Why the design travels

A city is **a signed bundle plus a service-area config, not a fork.**

- **Region config, not code.** What is Detroit-specific is data: a region id, a bounding box, the time zone, the
  holiday calendar, taxonomy labels, the emergency numbers file, and the coarse-area reference points used to
  sort DV lines — a closed list that already includes `statewide` and `national`.
- **Standard data.** The export is HSDS 3.2, the format 211s and state directories already exchange.
- **National sources already wired.** SAMHSA's treatment directory, US DOT NTAD (Amtrak, intercity bus), Census
  TIGER (streets and boundaries), and GTFS for any transit agency. 911, 988, the National DV Hotline and SAMHSA's
  helpline are already in the emergency list.
- **Zero PII travels.** There is no resident data, so there is no per-state privacy re-engineering, no data
  processing agreement and no procurement hurdle.
- **The steward model scales by region.** Each region gets its own steward team, the same queue, and the same
  own-page rule. Row count is capped by what a roster can verify, so quality does not dilute with size.
- **The language framework is generic**: a strings file per language, loaded on demand, right-to-left handled.

### The steps

1. **Multi-region bundles.** Gather today's Detroit values — now a handful of constants and seed files — into one
   region config; publish `data/bundle/v1/<region>/` with one signed index each; add a region picker, or
   auto-select from a typed ZIP — on the device, as today.
2. **A second Michigan city as the proof.** Flint, Grand Rapids, or Wayne County beyond the four cities: new seed
   CSVs, a new config, local stewards, no fork.
3. **A Michigan base layer.** Statewide programs and hotlines from state open data and Michigan 211, under every
   Michigan region, so a small town starts with something true.
4. **Region in a box.** A hosted service for cities and nonprofits: we run the pipeline, signing, hosting and the
   steward queue; they bring stewards. The open-source path stays complete for anyone who prefers to self-host.
5. **A national directory of regional bundles**, sharing the national hotlines and sources, each region's data
   published as open HSDS.

### Sustainability

The code and the data stay an open-source gift; Detroit costs about $110 a year to run (docs/12). Growth is paid
for by **optional hosting and support contracts** with cities, health departments and nonprofits, and by grants.
**Never ads, never data** — there is no resident data to sell, by construction.

## Open questions for the owner

1. Who are the first two community stewards? Names, not roles.
2. Which organizations pilot provider verification — the food banks' partner pantries, or DHD programs?
3. Which Michigan city is the second region, and who are its stewards?
4. Hosted service: under Linwood Technologies, or a nonprofit set up for it?
5. The service-area edge: include places inside the bounding box but outside the four named cities (the nearest
   urgent care to parts of Dearborn is in Dearborn Heights)?
6. Licence questions still to ask (SEMCOG/MSP, Wayne County, the City's open-data terms, Transit) — see the Open
   rows in [DECISIONS.md](DECISIONS.md).
