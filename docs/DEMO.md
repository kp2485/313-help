# Demo day

This page is the checklist that makes the 3-minute demo run. **The app is live at <https://313help.com>**
(checked 2026-09-21: the page, `/data/bundle/v1/index.json` — 531 listings, `signing: release`, signature good
against the active pinned key — and `/v1/health` all answer). Judges open the live site on their own phones; the
report → steward → rebuild loop (beats 4–5) runs on the laptop, so the demo never files a test report against the
public directory. The live site carries what `main` last published: before the demo, check that anything you plan
to show from a newer branch (the Map styles, the language control in the top bar) is there, or show it locally.

## The night before

```
git pull && pnpm install
pnpm test                                        # 772 tests, all green
pnpm build:bundle                                # fresh signed bundle (dev key)
pnpm --filter @313help/api migrate:local         # local D1 in api/.wrangler
```

`pnpm build:bundle` should end with a line like *"531 rows in 26 categories, … signed (dev), emergency numbers
match their published sources."* If it says anything about a mismatch, stop and read it.

- Open the app on a phone on the same Wi-Fi: `pnpm --filter @313help/web dev -- --host`, then visit
  `http://<laptop-ip>:5173`. Open the **Map** tab once while online — the street map and any transport layer you
  plan to show are fetched the first time they are opened. Then turn on airplane mode, reopen the app, and check
  that Home, a results list and the map still draw.
- The City's site (detroitmi.gov) blocks scripts, so City events and the shelter-line check use the last good
  data. Nothing to do for the demo; the Events tab hides itself when there are no events.
- Say in the pitch that the store-listing facts about the City's current app are **only what the store listings
  show** ([docs/07](07-gap-analysis.md)).
- If you plan to show the iPhone app, build it first (`apps/ios/README.md`). Its Map tab is a full-screen map of
  the city with the same layers and both styles; open it once so the layers you will show are loaded.

## Ten minutes before

```
pnpm --filter @313help/api dev                   # tab 1, http://localhost:8787
pnpm --filter @313help/web dev                   # tab 2, http://localhost:5173
pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1
pnpm build:bundle
```

The demo alert says "Demo" in its title and body and disappears on its own an hour later, even offline. That expiry
is part of the demo. Never publish an alert without `--demo` unless its owner announced it.

On a laptop-width window the tab bar becomes a side rail with Urgent help at the top of it. A phone window looks
exactly as it always did. Decide which one you are showing and size the window before you start.

## The beats

| # | Say | Do |
|---|---|---|
| 1 | "The City's app asks for your name and phone number." | Show only what its store listings say. |
| 2 | "Here's the version that ships — and it is live." | Put **313help.com** on the screen and let people open it. Then Home → **Food** → *Food today*. Three taps, offline. Each card shows the badge and the freshness line computed on the phone. |
| 3 | "It knows the difference between free and not." | Home → **A doctor** → the six choices. **Emergency room** opens with 911 above the list; urgent care is its own thing; "clinic" in this app means free or low-cost, so an ER is never filed as one. |
| 4 | "One tap to say it's wrong. No account." | Open a listing → *Something wrong?* → *Closed for good*. |
| 5 | "A person decides, not an algorithm." | `/admin/` → the listing is at the top → **Archive: closed for good**. `REPORTS_API=http://localhost:8787 pnpm build:bundle` (a plain build does not read steward decisions), reload the phone: "Closed as of today." Nothing was deleted. |
| 6 | "Nobody at the City had to do anything." | The badge line on any listing ("Matched their website when added…"). Don't run `pnpm check:sources` in the demo: it rewrites `data/seed/resources.csv`. |
| 7 | "And here is the whole city, drawn on the phone." | **Map** tab → switch on **DDOT routes** and **bike lanes** → full screen → then **"See this map as a list."** No tile server, no map company, nothing contacted: it all rides in the signed bundle. Every dot on the map is also a line of text, which is why the map can fail safely. |
| 7a | "Same data, drawn like a subway map." | Layers → **Map style** → **Subway lines**: route badges, interchanges, terminals, the People Mover as a loop. Standard stays the default. With the map focused, **N** and **P** walk the features and Enter opens one — the map is operable from a keyboard, not only describable ([MAP-STYLE.md](MAP-STYLE.md)). |
| 7b | "And on the iPhone." | The iPhone app's **Map** tab: full screen, same signed bundle, same layers, same two styles, no MapKit tiles. |
| 8 | "Same machinery, pointed at the greenway." | Map → the greenway layer → a Conrail segment → cross streets and help within a 10-minute walk. Report *Broken glass or trash* with a photo, then show it in `/admin/`: no location, no metadata, and one tap deletes it. "There is no button to report a person." *(Photos are off by default — see the fallback below.)* |
| 9 | "And for every neighborhood, not just the greenway." | About → Neighborhoods → Bagley: home prices beside building permits, blight and demolitions, **Safe streets** walking and biking crash counts; "our list is short here," with the add-a-place button. No rankings, and counts under five are hidden. |
| 10 | "In four languages." | The language control in the top bar → **العربية**. The whole interface mirrors right to left. If asked: the translations were drafted by machine, a native-speaker review is on the roadmap, and nothing in the app claims otherwise. |
| 11 | Close | "It stores nothing. Freshness is the product. The data outlives the app." |

After the demo, restore the archived listing: `/admin/` → **Archived by a steward** → *It's open again: restore it*,
then `REPORTS_API=http://localhost:8787 pnpm build:bundle`, then a plain `pnpm build:bundle` so no test reports end
up in `data/hsds/`. Beat 10 leaves the language on the phone only; switch it back to English.

## If something breaks

- **App shows "can't load the list":** run `pnpm build:bundle` again, then reload. The app refuses a bundle whose
  signature doesn't match, which is the point. Say so, and move on — 911, 988 and the overdose steps are still one
  tap away with no list at all, which is also the point.
- **Reports don't reach the queue:** the API tab isn't running, or the id isn't known to it. Run
  `REPORTS_API=http://localhost:8787 pnpm build:bundle` once; it tells the API every id.
- **Map is blank or a layer is missing:** each layer is fetched the first time it is switched on. Open the Map tab
  and every layer you plan to show once while online. If it is still blank, use **"See this map as a list"** — it
  carries the same places, and the honest line is that the picture is an extra.
- **The photo button isn't there (beat 8):** photos are off unless both switches are on — `"photos": true` in
  `data/seed/directory.json` (then rebuild) and `PHOTOS_ENABLED=true` in `api/.dev.vars` (then restart the API).
  Set them before the demo or drop the photo half of the beat; the condition report itself works either way.
- **Someone asks whether the app is live:** yes — <https://313help.com>, a release-signed bundle, the write API at
  `/v1`, the steward queue behind Cloudflare Access, and a nightly publish job. The steward half of the demo runs
  on the laptop on purpose, so no practice report lands in the public queue.
- **Someone asks about the Android app:** a native Kotlin client with no third-party library in the APK, passing
  the same 190 fixture cases. It is not in the Play store yet (roadmap); the PWA installs on Android today.
