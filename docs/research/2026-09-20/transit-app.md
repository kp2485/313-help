# The Transit app — what its own documentation says (read 2026-09-20)

Why we looked: Kyle asked for links to **Transit** (the app named "Transit", transitapp.com), which DDOT and
SMART riders use for real-time buses, so a person on a listing can plan the bus trip there in the app they
already have. Everything below comes from the owner's own pages. Nothing was scraped; each page was fetched
once, honestly identified, and read.

## The documented link format

**Source: <https://transitapp.com/developers>** (Transit's own developer page), section "Transit's URL scheme",
read 2026-09-20. Quoted from that page:

> If you're a developer, you can use our URL scheme to make your app launch Transit and show nearby routes or
> get directions for a particular location.

**Get directions**

| | |
|---|---|
| description | get transit directions between 2 locations |
| parameters | `from`: latitude-longitude pair or location string of origin<br>`to`: latitude-longitude pair or location string of destination |
| example | `transit://directions?from=Berri-UQAM&to=8194%20Drolet` |
| notes | "Leaving out a parameter will use the user's current location. User's current location is taken into account when geocoding address strings. Query strings are only supported in Transit 2.0+" |

**Show Nearby Lines** (documented on the same page, not used by us):

| | |
|---|---|
| parameters | `q`: latitude-longitude pair or location string to fetch nearby routes for |
| example | `transit://routes?q=45.5391,-73.5997` |

So: we send `transit://directions?to=<destination>` and **no `from`**. Leaving `from` out is the documented way
to let Transit use the person's own location, which it asks for itself, on their phone. We never pass a location
of a person and we never read one to build the link.

## What the documentation does **not** say

Checked and not found on any Transit-owned page:

- **No https universal link / App Link is documented.** `transit://` is the only documented form. There is no
  documented `https://transitapp.com/directions?...` equivalent, and no documented App Store / Play Store
  fallback for a device without the app. We did not invent one and we do not link to a guessed URL.
- **No documented behaviour when the app is not installed.** A custom scheme with no documented fallback fails
  silently (iOS) or shows a browser error (Android). This is the whole reason for the platform gating below.
- **No documented iOS-vs-Android difference.** The page gives one scheme for both.
- **No stated terms, branding rules, or permission requirement for linking.** The page invites developers to use
  the scheme ("you can use our URL scheme") and asks nothing in return. It is silent on attribution and logos.
  Because it is silent rather than permissive, we use **the plain word "Transit" in text only** — no logo, no
  icon, no asset of theirs, nothing loaded from their servers — and DECISIONS keeps the terms question **Open**.
- `api-doc.transitapp.com` is the data API (keys, rate limits, `partners@transit.app` for extended access). It is
  about fetching data, which we do not do, and it documents no deep link.
- `github.com/TransitApp` has no repository documenting deep links (the public repos are iOS helpers, GTFS tools
  and an ETA benchmark).

## What DDOT and SMART themselves say

We only describe a relationship an **owner page** states.

- **SMART — <https://www.smartbus.org/Ride-SMART-Bus-App>** ("Third Party Apps | for Android and IOS"), read
  2026-09-20. SMART's own page names **Transit app** in a list of third-party apps alongside Google Maps, Via,
  Apple Maps and Moovit, and says: "There are multiple apps available to download with realtime service updates,
  Rider Alerts and the ability to view other transit providers and ridesharing options nearby," and "All of these
  third party apps receive the SMART data to ensure you #know before you go so you can ride SMART with
  confidence."
  So the true sentence is: **SMART lists Transit as one of several third-party apps that get SMART's data.**
  It is not "SMART's app" and it is not an exclusive recommendation. SMART's own app is RideSMARTBus.
- **DDOT — not read.** DDOT's pages live on detroitmi.gov, which refuses our requests (HTTP 403 for
  `https://detroitmi.gov/departments/detroit-department-transportation`). Per CLAUDE.md we do **not** work around
  that, and we do not disguise the request. **So we have no DDOT page confirming anything about Transit, and the
  app says nothing about DDOT recommending it.** A steward who wants that sentence must open the DDOT page by
  hand and record what it says. Until then our wording is Transit's own description plus SMART's page.

Consequence for the UI copy: nowhere do we write "DDOT recommends Transit" or "the official DDOT app." The
link-out says what the app does and who owns it, and nothing about a partnership.

## What we decided from this (and why)

1. **`transit://directions?to=<destination>` only.** No `from`, no other parameter, no API key, no SDK, no
   script, no preconnect, no image from their servers. A plain `<a href>` (web) and one `openURL` (iOS). Nothing
   reaches transitapp.com until the person taps.
2. **Destination is the coordinate when the publisher gives one, otherwise the written address** — the reverse of
   the order our maps links use. Transit's own note says "User's current location is taken into account when
   geocoding address strings," so an address string is resolved with a fuzziness a coordinate does not have. A
   coordinate is still never printed as if it were an address; it is only ever passed through.
3. **Phones only.** Because no https fallback and no not-installed behaviour is documented, a `transit://` link
   on a laptop can only fail. Transit ships for iOS and Android only. The link is therefore gated on the same
   user-agent test `directionsHref` already uses (iPhone / iPad / Android), and on a laptop it is simply not
   shown. The existing "Bus directions" link, which needs no app, stays first and is never replaced.
4. **Only where directions are already offered.** Same gate as `transitHref`: a written address or the
   publisher's coordinate. DV and mental-health-crisis listings carry neither, so they get no Transit link, the
   same way they get no Directions and no Bus directions.

## Pages read on 2026-09-20

| Page | Owner | What it gave us |
|---|---|---|
| <https://transitapp.com/developers> | Transit | the URL scheme, `from`/`to`, the example, the notes |
| <https://api-doc.transitapp.com/> | Transit | data API only; no deep link |
| <https://github.com/TransitApp> | Transit | no deep-link documentation |
| <https://www.smartbus.org/Ride-SMART-Bus-App> | SMART | SMART names Transit among third-party apps |
| <https://www.smartbus.org/> | SMART | home page names SMART's own tools, not Transit |
| <https://detroitmi.gov/departments/detroit-department-transportation> | DDOT | **403, not read.** Not worked around |

Not used as a source, and worth naming so nobody confuses them later: **tokentransit.com** ("Token Transit") is a
different company — the fare-purchase app already linked on the Map tab — and its `tokentransit.com/app`
deeplinks have nothing to do with Transit's scheme. `moovit.com/developers/deeplinking` is Moovit's, a
competitor's. Neither documents anything about Transit.
