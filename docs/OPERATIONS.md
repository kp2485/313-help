# Operations

How to run 313 Help. Written so someone other than Kyle could take it over in an afternoon (doc 12).

## Run it on your own machine

You need Node 22 and pnpm 12 (the version in `package.json` → `packageManager`). An older pnpm won't install. Get it with `corepack enable` or `npm i -g pnpm@12`. `/README.md` has the same steps in shorter form for a first-time contributor.

```
pnpm install
pnpm test                                           # 503 tests (query 111, api 80, pipeline 179, web 133)
pnpm build:bundle                                   # signed data bundle (dev key) into data/bundle/v1
pnpm --filter @313help/api migrate:local        # local D1 database in api/.wrangler
pnpm --filter @313help/api dev                  # write API on http://localhost:8787
pnpm --filter @313help/web dev                  # the app on http://localhost:5173 (proxies /v1 to the API)
```

`wrangler dev` runs everything on your machine by default: the local D1 database and a fake photo bucket. It touches no Cloudflare account.

The steward queue is at **http://localhost:5173/admin/**. Locally, `api/.dev.vars` (git-ignored) holds `DEV_STEWARD=local`, which stands in for the Cloudflare Access login and is honored **only when the API is reached as localhost**.

To pull report counts and steward decisions into the bundle, and to tell the API which ids exist:
`REPORTS_API=http://localhost:8787 pnpm build:bundle`. Do not commit `data/hsds/` from a build that used local test reports; run a plain `pnpm build:bundle` first.

Reports only accept ids the API knows. Locally, add some:
`pnpm --filter @313help/api exec wrangler d1 execute 313-help --local --command "INSERT OR IGNORE INTO targets VALUES ('sal_csk_conner_meals','listing')"`.
In production the pipeline syncs every id at each publish.

## The demo loop (about two minutes, all local)

1. In the app, open a listing → **Something wrong?** → *Closed for good*. Then do the same from a **second phone or a second browser profile** (a private window works too). One phone counts once per listing per day, even if it says both *Closed for good* and *Moved*, so it takes two phones to reach 2.
2. `REPORTS_API=http://localhost:8787 pnpm build:bundle`, reload: the listing now says **"2 people said this was closed. Call first."** It is still listed. Reports label; they never hide.
3. Open `/admin/`: the listing is at the top, highlighted, with the note (phone numbers already masked) and the phone script. Press **Archive: closed for good**.
4. Build again, reload: the listing is gone from results; its link says **"Closed as of {today}. Call 211 for other options."** `data/hsds/services.json` marks the service `defunct`, so a 211 importer won't treat it as live. Nothing was deleted.
5. Restore it: `/admin/` → **Archived by a steward** → *It's open again: restore it*, then a plain `pnpm build:bundle`.

## The regular work

| When | What | How long |
|---|---|---|
| About weekly | Work the exceptions queue at `/admin/`: listings 2+ phones reported closed (highlighted), other corrections, new proposals (one entry check each), and **Pages that changed**: listings whose own web page, read again each night, no longer shows the phone number or street address we list, or could not be read. Open the page (`source_url` in `data/seed/resources.csv`). If the place changed, fix its row and press *I'll fix it*; if the page just moved things around, press *Checked: it's fine*. Either way the task stays closed until the check says something different. A task closes itself when the page matches again. The app never changes because of one | under an hour |
| Every month | `pnpm ingest:neighborhoods` and `pnpm ingest:basemap` refresh the neighborhood numbers and the street map from City open data (the nightly job does this on the 1st and opens a pull request). Read the diff, merge it | 5 minutes |
| Every month, **by hand** | `pnpm ingest:transit` — the 11 transport layers on the Map tab. It is **deliberately not in `publish.yml`** (DECISIONS 2026-09-20): monthly by hand is the decision, because these layers change slowly and unevenly (bike lanes were edited 2026-09-19, the City's DDOT layers 2026-02-09, SMART's feed 2026-08-26) and each one's licence is still an open question. Read the diff of `data/ingested/transit/` and merge it; `source.json` records each owner and its licence text | 5 minutes |
| Every year, **by hand**, when SEMCOG publishes a new crash year (it normally republishes each autumn) | `pnpm ingest:crashes` — the "Safe streets" numbers on neighborhood pages. It is **deliberately not in `publish.yml`** (DECISIONS 2026-09-20): the layer gains one year at a time, so a nightly run would only re-read the same years, and the licence is unsettled — SEMCOG publishes no terms for the layer and the records are the Michigan State Police's. The script picks the five most recent complete years by itself, so nothing needs editing; read the diff of `data/ingested/crashes.json` (counts only, no crash record) and merge it, then `pnpm build:bundle`. **If SEMCOG or MSP objects, delete `data/ingested/crashes.json` and rebuild: the panel disappears on its own.** | 5 minutes |
| When Wayne County updates its map | `pnpm ingest:mymap` — the Well Wayne naloxone and test-strip stations, read from the map's own KML. The map prints its own "Map updated" date and that becomes `source_last_edited`; past `max_age_days` (90) the rows lose the `source_listed` badge. Read the diff of `data/ingested/wayne_well_wayne_stations.csv` and merge it | 5 minutes |
| Every month or so | `pnpm check:emergency` — reads each emergency number's own page. A mismatch means a published number changed: read the page, edit `data/seed/emergency.csv` by hand. A page that can't be fetched (the City's site blocks scripts) is checked in a normal browser and the date recorded | 5 minutes |
| Every year, and when SAMHSA posts a new directory | `pnpm ingest:treatment` re-reads SAMHSA's treatment directory and OTP list and DWIHN's provider list. Read the diff of `data/staging/samhsa_treatment.csv` and the warnings: a treatment listing on none of the lists may have closed (check it); new programs whose own site DWIHN names arrive in `data/seed/incoming/samhsa-treatment.txt` and go through the steps below. Update `SAMHSA_DIRECTORY` in `pipeline/src/ingest-treatment.ts` when SAMHSA publishes a new edition | 30 min |
| When adding listings | Put one pipe-delimited line per listing in `data/seed/incoming/*.txt` (format at the top of `pipeline/src/import-lines.ts`), then `pnpm import:lines` → `pnpm check:sources` → `pnpm geocode` → `pnpm build:bundle`. Imported rows are `proposed` and invisible until their own source page matches. Hours become a schedule only if every part parses; otherwise they're shown as written with "call first." Rows whose site blocks scripts: read the page in a browser, then set `status=active`, `entry_method=web`. **Read the importer's summary, not just its exit code:** a line whose `sal_id` already exists is skipped and says so (`skipped: id collision with <sal_id>`), counted in the summary — it used to be dropped in silence, which is how one line of a 25-line file went missing on 2026-09-20. A line that corrects an address for the same organisation and phone prints an informational note instead. Either way the fix is to give the new listing a name that distinguishes it, or to edit the existing row | — |
| When a listing can't be finished | Add a row to `data/seed/to-verify.csv` saying what is missing and on which page. **Nothing is ever deleted from that file.** When a hold is settled, leave the row and its original `why_held` where they are and fill in the fourth column, `resolved` (added 2026-09-20), with the date, the outcome, and the `sal_id` if it became a listing. 288 rows on 2026-09-19; 326 on 2026-09-20, of which 71 carry a resolution | — |
| Monthly or so | `pnpm ingest:opendata`, then read the git diff of `data/ingested/`. A changed phone number or address is approved by committing it | 10 minutes |

If nobody does any of this, listings keep saying what they said, with their dates, and people's reports keep labeling them. Phones that haven't updated in a while say so. Nothing shuts down on its own; retiring the directory is a person's decision (below).

## Photos on condition reports

**Photos are off** (DECISIONS 2026-09-19) until the legal advice in docs/11 is in hand. Two switches, and both must be on: `"photos": true` in `data/seed/directory.json` shows the photo field in the app (after the next publish), and the Worker variable `PHOTOS_ENABLED = "true"` in `api/wrangler.toml` accepts uploads (after the next deploy). While either is off, reports go without photos and `POST /v1/photos` answers 503. To test locally, put `PHOTOS_ENABLED=true` in `api/.dev.vars` and set the directory flag, then build.

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
pnpm --filter @313help/pipeline exec tsx src/access-report.ts
```

It prints a table and writes `data/indicators/greenway_access.json`. On 2026-09-19 every open segment had at least one listing nearby. "None listed yet" describes our directory, not the neighborhood (doc 13). **The committed file is from an older bundle** (49 listings, 18 segments flagged) and understates today's coverage, so re-run it before quoting it.

## First deployment — every step here needs Kyle's go-ahead (accounts, and a few dollars for a domain)

**Doing it once, in order, with the exact clicks: [docs/DEPLOY-HANDOFF-2026-09-20.md](DEPLOY-HANDOFF-2026-09-20.md).**
This section is the reference; that one is the checklist. Run `pnpm preflight` before and after each step.

The Cloudflare free tier covers all of it at expected traffic.

1. **Accounts that aren't personal.** A Cloudflare account and GitHub organization for the project, so they can be handed over.
2. **Signing keys.** `pnpm keys:generate` twice. Key 1 → GitHub Actions secret `BUNDLE_SIGNING_KEY`. Key 2 → offline (password manager + paper). Both *public* keys → `BUNDLE_PUBLIC_KEYS="key1,key2"` for the web build. Losing both private keys means shipping a new app build, so keep the spare safe.
3. **D1.** `wrangler d1 create 313-help`, put the id in `api/wrangler.toml`, `wrangler d1 migrations apply 313-help --remote`. The database was created and its id committed on 2026-09-20; the migrations have **not** been applied to it. Do that before the first deploy, or every query the Worker makes — including the nightly cron — fails.
4. **Worker, deployed from Git** (Kyle, 2026-09-20). In the Cloudflare project: **Root directory `api`**, deploy command `npx wrangler deploy`. Pointing it at the repository root fails — this is a pnpm workspace and the root has no Worker config on purpose. Route the Worker at `https://<domain>/v1/*` so the app and the API share an origin (no CORS, no third party). Do step 3 first: a deploy with the placeholder database id will not work. The R2 photo binding is commented out in `api/wrangler.toml` so the first deploy succeeds; uncomment it only after the bucket exists and the legal advice in docs/11 is in hand. A one-off deploy by hand is the same command from `api/`.
5. **Cloudflare Access.** One application covering `/v1/steward/*` **and `/admin/*`**. Never set `DEV_STEWARD` in production (it would do nothing anyway: the Worker only honors it on localhost). Policy: allow listed steward emails, plus one **service token** for the pipeline. Put the team domain and the application's AUD tag in `wrangler.toml` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). The Worker verifies the Access token itself and fails closed if these are empty.
6. **Rate limiting.** A WAF rate-limiting rule on `POST /v1/*`, per IP, about 10 per minute. This lives in the dashboard on purpose: the Worker code never touches an IP address, and a test keeps it that way.
   **Then sign for 5 and 6.** No script can see a dashboard, so a person says in `api/edge-protections.md`, by name and with a date, that the Access application and the rate-limiting rule exist. `pnpm preflight` stops a deploy until both lines are signed, and the nightly publish runs preflight before it builds anything. If either protection is removed or moved, set its line back to `not signed` in the same commit.
   **Then prove it from outside:** `pnpm smoke -- https://<domain> --i-own-this-origin`. It asks a live origin what a checkout cannot know: that the steward endpoints and `/admin/` refuse anyone not signed in, that an unknown field is a 400, that CORS names only our site, that photos are off, and that a short burst of writes is rate-limited. Every request it sends is one the API must refuse, so it can never store anything; it names itself honestly and is only ever run against our own origin. Run it after the first deploy and after any change to the Access policy or the WAF rule.
7. **Logs.** `wrangler.toml` already turns invocation logs off. Leave Logpush off. Never add request logging.
8. **Pages: the site is published by the workflow, not by a Cloudflare Git build** (Kyle, 2026-09-20). `.github/workflows/publish.yml` builds the release-signed bundle, builds `apps/web` with `BUNDLE_PUBLIC_KEYS` and `WEB_RELEASE=1`, and deploys `apps/web/dist` (which contains the bundle under `/data/bundle/v1/`) to the Pages project named in the `PAGES_PROJECT` variable. Create the empty Pages project, then let step 9 fill it. Do not also connect Pages to Git: a Cloudflare build would ship a dev-signed bundle and phones would pin the dev key.
9. **Nightly publish**: `.github/workflows/publish.yml` (written 2026-09-18, never run). It stays off until the repository variable `PUBLISH_ENABLED` is `true`; it also needs the variables `BUNDLE_PUBLIC_KEYS`, `REPORTS_API`, `PAGES_PROJECT` and the secrets below. Any open-data change (an address, a greenway phase, a street) opens a pull request instead, and merging it is the approval. The order, as written in the workflow:
   1. (City events: not read, DECISIONS 2026-09-19.)
   2. `pnpm check:emergency`. One bad night doesn't stop the job (`continue-on-error`).
   3. `pnpm test`, then `pnpm preflight`: the keys, the Worker's config, and the signed lines in `api/edge-protections.md`. Any `stop` ends the job before anything is built or deployed.
   4. `pnpm build:bundle:release` with `BUNDLE_SIGNING_KEY`, `REPORTS_API`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`.
   5. Build the web app with `BUNDLE_PUBLIC_KEYS` and `WEB_RELEASE=1`: it refuses unless exactly two different keys (active and spare) are pinned and the list it copies in is release-signed.
   6. Deploy to Cloudflare Pages.
   7. Commit `data/hsds/` and `data/seed/emergency.csv`. Nothing else is committed to `main` by the job.
   8. Re-read open data (`ingest:opendata`, `ingest:greenway`, `ingest:city parks`, `ingest:city zips`; on the 1st of the month also `ingest:basemap` and `ingest:neighborhoods`).
   9. If any of that changed, open a pull request. Nothing from step 8 is published that night.
   10. `check:sources --recheck`: read each active listing's own page again with the same strict matcher used at entry, and write `data/staging/recheck.json` (git-ignored). It also writes notes into `data/seed/resources.csv` on the runner; those are never committed.
   11. `pnpm tasks:sync`: send that list to the Worker (`PUT /v1/steward/tasks`, with `REPORTS_API` and the Access service token). It shows up under **Pages that changed** on `/admin/`. If step 10 didn't finish, nothing is sent.

   Steps 10 and 11 run even if an earlier step failed, and never fail the job (`continue-on-error`): a flaky page never blocks a publish, and nothing in the app changes because of them (DECISIONS 2026-09-19).

   An emergency number whose own page shows a different number (`mismatch_on`, set by step 2) stops the release build at step 4 until a person fixes `emergency.csv`. Then nothing is deployed and yesterday's bundle stays up. A page that can't be read never stops it (DECISIONS 2026-09-19).

## Secrets (names only)

| Name | Where | What it is |
|---|---|---|
| `BUNDLE_SIGNING_KEY` | GitHub Actions | Ed25519 private key that signs `index.json` |
| spare signing key | offline only | Second pinned key, for rotation |
| `ACCESS_CLIENT_ID` / `ACCESS_CLIENT_SECRET` | GitHub Actions | Access service token the pipeline uses to read report counts, sync ids and send the nightly re-check's tasks |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Deploys Pages (the Worker is deployed by hand with `wrangler deploy`) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Which Cloudflare account to deploy to |

Repository **variables** (not secret): `PUBLISH_ENABLED` (`true` turns the nightly publish on), `BUNDLE_PUBLIC_KEYS` (the two pinned public keys), `REPORTS_API` (the API's address), `PAGES_PROJECT` (the Cloudflare Pages project name).

## What the write API stores, completely

`targets`: every id the published dataset has, and whether it is a listing or a place (`seg_`/`plc_`). The pipeline syncs it at each publish. Reports can only name an id that is here.
`reports`: listing or place id, kind, optional note (phone numbers and emails masked before storage), optional suggested correction (hours and address masked the same way; a suggested phone is kept), observed and submitted time (to the minute; to the hour for places), a per-target daily hash, steward outcome, and `photo_key` when a photo came with a place report. After 180 days a report becomes a monthly count and the row is removed, together with its photo.
`report_counts`: what is left of old reports: id, kind, month, count.
`photos`: a random key, the upload hour, and which report it belongs to. The picture itself is in a private R2 bucket and is deleted 30 days after its report closes (one day if no report claimed it), or when its report becomes a monthly count, whichever comes first.
`proposals`: the place's name, category, what it offers and schedule text (both masked like a note), address (never for DV), public phone, how the submitter knows, masked note. Removed 180 days after a steward settles it; an open proposal waits for a steward.
`listing_overrides`: a steward's decision about a listing (archived, paused, or active again), the reason (`restored` for active again: a restore is never recorded as a phone check), a replacement id if there is one, and the minute. The pipeline applies these at build time.
`steward_tasks`: tasks the machine raised for a steward. Today only the nightly re-check: a listing id, `missing` or `unreadable`, the page matcher's own words (which of the listing's published phone numbers or street address it could not find, or why the page could not be read), the day, and whether it is open, dismissed by a steward (`checked_fine` or `will_fix`), or closed because the page matched again.
`steward_actions`: steward email, action, reason code, optional note. Never published.
There is no table of residents, and no column anywhere for an IP address, device, user agent, or location.

## Handing it over

Transfer the GitHub org, the Cloudflare account, the domain, and the store listings; give the new operator the spare key and have them generate a new active key (ship an app build pinning new + spare). Everything else is in this repo.
