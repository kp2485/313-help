# Operations

How to run Detroit Compass. Written so someone other than Kyle could take it over in an afternoon (doc 12).

## Run it on your own machine

You need Node 22 and pnpm 12 (the version in `package.json` → `packageManager`). An older pnpm won't install. Get it with `corepack enable` or `npm i -g pnpm@12`.

```
pnpm install
pnpm build:bundle                                   # signed data bundle (dev key) into data/bundle/v1
pnpm --filter @detroithelp/api migrate:local        # local D1 database in api/.wrangler
pnpm --filter @detroithelp/api dev                  # write API on http://localhost:8787
pnpm --filter @detroithelp/web dev                  # the app on http://localhost:5173 (proxies /v1 to the API)
```

`wrangler dev` runs everything on your machine by default: the local D1 database and a fake photo bucket. It touches no Cloudflare account.

The steward queue is at **http://localhost:5173/admin/**. Locally, `api/.dev.vars` (git-ignored) holds `DEV_STEWARD=local`, which stands in for the Cloudflare Access login and is honored **only when the API is reached as localhost**.

To pull report counts and steward decisions into the bundle, and to tell the API which ids exist:
`REPORTS_API=http://localhost:8787 pnpm build:bundle`. Do not commit `data/hsds/` from a build that used local test reports; run a plain `pnpm build:bundle` first.

Reports only accept ids the API knows. Locally, add some:
`pnpm --filter @detroithelp/api exec wrangler d1 execute detroithelp --local --command "INSERT OR IGNORE INTO targets VALUES ('sal_csk_conner_meals','listing')"`.
In production the pipeline syncs every id at each publish.

## The demo loop (about two minutes, all local)

1. In the app, open a listing → **Something wrong?** → *Closed for good*. Do it again as *Moved* (one phone counts once per kind per day).
2. `REPORTS_API=http://localhost:8787 pnpm build:bundle`, reload: the listing now says **"2 people said this was closed. Call first."** It is still listed. Reports label; they never hide.
3. Open `/admin/`: the listing is at the top, highlighted, with the note (phone numbers already masked) and the phone script. Press **Archive: closed for good**.
4. Build again, reload: the listing is gone from results; its link says **"Closed as of {today}. Call 211 for other options."** `data/hsds/services.json` marks the service `defunct`, so a 211 importer won't treat it as live. Nothing was deleted.
5. Restore it: `/admin/` → **Archived by a steward** → *It's open again: restore it*, then a plain `pnpm build:bundle`.

## The regular work

| When | What | How long |
|---|---|---|
| About weekly | Work the exceptions queue: new proposals (one entry check each), listings with 2+ "closed" reports, machine-raised tasks | under an hour |
| Every month | `pnpm ingest:neighborhoods` and `pnpm ingest:basemap` refresh the neighborhood numbers and the street map from City open data (the nightly job does this on the 1st and opens a pull request). Read the diff, merge it | 5 minutes |
| Every month or so | `pnpm check:emergency` — reads each emergency number's own page. A mismatch means a published number changed: read the page, edit `data/seed/emergency.csv` by hand. A page that can't be fetched (the City's site blocks scripts) is checked in a normal browser and the date recorded | 5 minutes |
| When adding listings | Put one pipe-delimited line per listing in `data/seed/incoming/*.txt` (format at the top of `pipeline/src/import-lines.ts`), then `pnpm import:lines` → `pnpm check:sources` → `pnpm geocode` → `pnpm build:bundle`. Imported rows are `proposed` and invisible until their own source page matches. Hours become a schedule only if every part parses; otherwise they're shown as written with "call first." Rows whose site blocks scripts: read the page in a browser, then set `status=active`, `entry_method=web` | — |
| Monthly or so | `pnpm ingest:opendata`, then read the git diff of `data/ingested/`. A changed phone number or address is approved by committing it | 10 minutes |

If nobody does any of this, listings keep saying what they said, with their dates, and people's reports keep labeling them. Phones that haven't updated in a while say so. Nothing shuts down on its own; retiring the directory is a person's decision (below).

## Photos on condition reports

A photo shows up in the steward queue under its report, and nowhere else. Never share, post or forward one outside the greenway team. If it shows a person, a face, a license plate or a house number, press **Delete this photo now**: the report stays. Photos delete themselves 30 days after their report is closed. If a photo shows something illegal, delete nothing, close the laptop, and call Kyle: there are legal reporting duties, and written guidance for this is still owed (docs/11).

## How to publish an alert

An alert says something is happening now (warming centers open, a pantry closed today). Write it only from the owner's own announcement.

```
pnpm alert:new -- --title "Overnight warming centers are open" --body "Open tonight through Wednesday noon." --hours 60 --category warming --source-url https://detroitmi.gov/news/... --tel "Shelter help line=866-313-2520"
pnpm build:bundle        # or wait for the nightly publish
```

The command refuses an alert with no end time, one longer than 7 days, one with no source link, or a phone number that isn't a real number. The app hides the alert by itself at its end time, even offline. To cancel one listing's hours, add `--cancellation --target sal_...`; any opening that overlaps the alert's time is cancelled, and the alert shows on that listing's page. An alert starts now unless you say otherwise: `--day 2026-09-26` covers that whole Detroit day, and `--from "2026-09-26 13:00" --hours 3` starts later (Detroit time, at most 30 days ahead). For example:

```
pnpm alert:new -- --cancellation --target sal_... --day 2026-09-26 --title "Pantry closed Saturday" --source-url https://...
```

To take an alert back early, set its `status` to `retracted` in `data/seed/alerts.json`. Ended alerts stay in the file; nothing is deleted.

**For a demo:** `pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1`. The title and body say it is a demo, it lasts at most 3 hours, and it cannot carry a phone number. Never publish a made-up alert without `--demo`.

## How to add a steward

A steward is anyone who can open `/admin/`. There is no steward account in our code: the Cloudflare Access policy decides.

1. In the Cloudflare dashboard, open the Access application that covers `/admin/*` and `/v1/steward/*` (First deployment, step 5).
2. Add the person's email to the policy's allow list.
3. To take access away, remove the email. It takes effect at their next login.

Their email is recorded next to each decision they make (`steward_actions`) and is never published.

**Restoring a listing** someone archived by mistake: `/admin/` → **Archived by a steward** → *It's open again: restore it*. It comes back at the next build. Nothing was deleted.

## How to retire the directory on purpose

Only a person does this; no timer ever will (DECISIONS 2026-09-19).

1. Set `"retired": true` in `data/seed/directory.json` and commit it.
2. Publish (the nightly job, or `pnpm build:bundle:release` and deploy).

Every phone that gets that list shows "This list is no longer being updated. Call 211 and a person can help you find a place." and hides the report buttons and add-a-place. 911, 988 and the other urgent numbers stay.

To undo it: set it back to `false` and publish again.

## How to run the greenway access report

After a build, it counts the help within a 10-minute walk of each open greenway segment:

```
pnpm build:bundle
pnpm --filter @detroithelp/pipeline exec tsx src/access-report.ts
```

It prints a table and writes `data/indicators/greenway_access.json`. On 2026-09-19 every open segment had at least one listing nearby. "None listed yet" describes our directory, not the neighborhood (doc 13).

## First deployment — every step here needs Kyle's go-ahead (accounts, and a few dollars for a domain)

Nothing below has been done. The Cloudflare free tier covers all of it at expected traffic.

1. **Accounts that aren't personal.** A Cloudflare account and GitHub organization for the project, so they can be handed over.
2. **Signing keys.** `pnpm keys:generate` twice. Key 1 → GitHub Actions secret `BUNDLE_SIGNING_KEY`. Key 2 → offline (password manager + paper). Both *public* keys → `BUNDLE_PUBLIC_KEYS="key1,key2"` for the web build. Losing both private keys means shipping a new app build, so keep the spare safe.
3. **D1.** `wrangler d1 create detroithelp`, put the id in `api/wrangler.toml`, `wrangler d1 migrations apply detroithelp --remote`.
4. **Worker.** `wrangler deploy` from `api/`. Route it at `https://<domain>/v1/*` so the app and API share an origin (no CORS, no third party).
5. **Cloudflare Access.** One application covering `/v1/steward/*` **and `/admin/*`**. Never set `DEV_STEWARD` in production (it would do nothing anyway: the Worker only honors it on localhost). Policy: allow listed steward emails, plus one **service token** for the pipeline. Put the team domain and the application's AUD tag in `wrangler.toml` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). The Worker verifies the Access token itself and fails closed if these are empty.
6. **Rate limiting.** A WAF rate-limiting rule on `POST /v1/*`, per IP, about 10 per minute. This lives in the dashboard on purpose: the Worker code never touches an IP address, and a test keeps it that way.
7. **Logs.** `wrangler.toml` already turns invocation logs off. Leave Logpush off. Never add request logging.
8. **Pages.** Build `apps/web` with `BUNDLE_PUBLIC_KEYS` set; deploy `apps/web/dist` (it contains the bundle under `/data/bundle/v1/`).
9. **Nightly publish**: `.github/workflows/publish.yml` (written 2026-09-18, never run). It stays off until the repository variable `PUBLISH_ENABLED` is `true`; it also needs the variables `BUNDLE_PUBLIC_KEYS`, `REPORTS_API`, `PAGES_PROJECT` and the secrets below. City events publish by themselves; any other open-data change (an address, a greenway phase, a street) opens a pull request instead, and merging it is the approval. The order, as written in the workflow:
   1. City events (`ingest:city events`). If the page fails, the last good file stays.
   2. `pnpm check:emergency`. One bad night doesn't stop the job (`continue-on-error`).
   3. `pnpm test`.
   4. `pnpm build:bundle:release` with `BUNDLE_SIGNING_KEY`, `REPORTS_API`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`.
   5. Build the web app with `BUNDLE_PUBLIC_KEYS`.
   6. Deploy to Cloudflare Pages.
   7. Commit `data/hsds/`, the events file and `data/seed/emergency.csv`.
   8. Re-read open data (`ingest:opendata`, `ingest:greenway`, `ingest:city parks`, `ingest:city zips`; on the 1st of the month also `ingest:basemap` and `ingest:neighborhoods`).
   9. If any of that changed, open a pull request. Nothing from step 8 is published that night.

   An emergency number that has gone 30 days without a match stops the release build at step 4. Then nothing is deployed and yesterday's bundle stays up.

## Secrets (names only)

| Name | Where | What it is |
|---|---|---|
| `BUNDLE_SIGNING_KEY` | GitHub Actions | Ed25519 private key that signs `index.json` |
| spare signing key | offline only | Second pinned key, for rotation |
| `ACCESS_CLIENT_ID` / `ACCESS_CLIENT_SECRET` | GitHub Actions | Access service token the pipeline uses to read report counts and sync ids |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Deploys Pages (the Worker is deployed by hand with `wrangler deploy`) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Which Cloudflare account to deploy to |

Repository **variables** (not secret): `PUBLISH_ENABLED` (`true` turns the nightly publish on), `BUNDLE_PUBLIC_KEYS` (the two pinned public keys), `REPORTS_API` (the API's address), `PAGES_PROJECT` (the Cloudflare Pages project name).

## What the write API stores, completely

`targets`: every id the published dataset has, and whether it is a listing or a place (`seg_`/`plc_`). The pipeline syncs it at each publish. Reports can only name an id that is here.
`reports`: listing or place id, kind, optional note (phone numbers and emails masked before storage), optional suggested correction, observed time (to the minute; to the hour for places), submitted time (to the minute), a per-target daily hash, steward outcome, and `photo_key` when a photo came with a place report. After 180 days a report becomes a monthly count and the row is removed.
`report_counts`: what is left of old reports: id, kind, month, count.
`photos`: a random key, the upload minute, and which report it belongs to. The picture itself is in a private R2 bucket and is deleted 30 days after its report closes (one day if no report claimed it).
`proposals`: the place's name, category, what it offers, address (never for DV), public phone, schedule text, how the submitter knows, masked note.
`listing_overrides`: a steward's decision about a listing (archived, paused, or active again), the reason, a replacement id if there is one, and the minute. The pipeline applies these at build time.
`steward_actions`: steward email, action, reason code, optional note. Never published.
There is no table of residents, and no column anywhere for an IP address, device, user agent, or location.

## Handing it over

Transfer the GitHub org, the Cloudflare account, the domain, and the store listings; give the new operator the spare key and have them generate a new active key (ship an app build pinning new + spare). Everything else is in this repo.
