# Demo day

The 3-minute script is in docs/09. This page is the checklist that makes it run. Everything runs on one laptop. Nothing here is deployed or costs money.

## The night before

```
git pull && pnpm install
pnpm test                                            # everything green
pnpm build:bundle                                    # fresh signed bundle (dev key)
pnpm --filter @313help/api migrate:local
```

- Open the app on a phone on the same Wi-Fi: `pnpm --filter @313help/web dev -- --host`, then visit `http://<laptop-ip>:5173`. On the phone, turn on airplane mode once and reopen the app, to show that it works offline.
- The City's site (detroitmi.gov) now blocks scripts, so events and the shelter-line check use the last good data. Nothing to do for the demo.
- Say in the pitch that the store listing facts about the City's current app are **only what the store listings show** (docs/09).

## Ten minutes before

```
pnpm --filter @313help/api dev                   # tab 1
pnpm --filter @313help/web dev                   # tab 2
pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1
pnpm build:bundle
```

The demo alert says "Demo" in its title and body and disappears on its own an hour later, even offline. That expiry is part of the demo. Never publish an alert without `--demo` unless its owner announced it.

## The beats

| # | Say | Do |
|---|---|---|
| 1 | "The City's app asks for your name and phone number." | Show only what its store listings say. |
| 2 | "Here's the version that ships." | Home → **Food** → *Food this week*. Three taps, offline. Tap **Show these on a map**. |
| 3 | "One tap to say it's wrong. No account." | Open a listing → *Something wrong?* → *Closed for good*. |
| 4 | "A person decides, not an algorithm." | `/admin/` → the listing is at the top → **Archive: closed for good**. `REPORTS_API=http://localhost:8787 pnpm build:bundle` (a plain build does not read steward decisions), reload the phone: "Closed as of today." |
| 5 | "Nobody at the City had to do anything." | The badge line on any listing ("Matched their website when added…"). Don't run `pnpm check:sources` in the demo: it rewrites `data/seed/resources.csv`. |
| 6 | "Same machinery, pointed at the greenway." | Recreation → a Conrail segment → cross streets and help within a 10-minute walk. Report *Broken glass or trash* with a photo, then show it in `/admin/`: no location, no metadata, and one tap deletes it. "There is no button to report a person." |
| 7 | "And for every neighborhood, not just the greenway." | About → Neighborhoods → Bagley: home prices next to building permits; "our list is short here," with the add-a-place button. |
| 8 | "En español también." | Home → **Español**. |
| 9 | Close | "It stores nothing. Freshness is the product. The data outlives the app." |

After the demo, restore the archived listing: `/admin/` → **Archived by a steward** → *It's open again: restore it*, then `REPORTS_API=http://localhost:8787 pnpm build:bundle`, then a plain `pnpm build:bundle` so no test reports end up in `data/hsds/`.

## If something breaks

- **App shows "can't load the list":** run `pnpm build:bundle` again, then reload. The app refuses a bundle whose signature doesn't match, which is the point.
- **Reports don't reach the queue:** the API tab isn't running, or the id isn't known to it. Run `REPORTS_API=http://localhost:8787 pnpm build:bundle` once; it tells the API every id.
- **Map is blank:** it loads the street map the first time it opens. Open it once while online before the demo.
