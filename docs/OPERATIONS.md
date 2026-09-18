# Operations

How to run Detroit Compass. Written so someone other than Kyle could take it over in an afternoon (doc 12).

## Run it on your own machine

```
pnpm install
pnpm build:bundle                                   # signed data bundle (dev key) into data/bundle/v1
pnpm --filter @detroithelp/api migrate:local        # local D1 database in api/.wrangler
pnpm --filter @detroithelp/api dev                  # write API on http://localhost:8787
pnpm --filter @detroithelp/web dev                  # the app on http://localhost:5173 (proxies /v1 to the API)
```

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
5. Restore it. An archived listing has left the queue, so for now this is one call: `curl -X POST http://localhost:8787/v1/steward/listings/<id>/status -H "content-type: application/json" -d '{"status":"active"}'`, then a plain `pnpm build:bundle`. (A "recently archived" list with an undo button is the obvious next addition to the admin page.)

## The regular work

| When | What | How long |
|---|---|---|
| About weekly | Work the exceptions queue: new proposals (one entry check each), listings with 2+ "closed" reports, machine-raised tasks | under an hour |
| Every month | `pnpm ingest:neighborhoods` and `pnpm ingest:basemap` refresh the neighborhood numbers and the street map from City open data (the nightly job does this on the 1st and opens a pull request). Read the diff, merge it | 5 minutes |
| Every 30 days | `pnpm check:emergency` — confirms each emergency number still matches its owner's page. If it fails, a published number changed: read the page, edit `data/seed/emergency.csv` by hand | 5 minutes |
| When adding listings | Put one pipe-delimited line per listing in `data/seed/incoming/*.txt` (format at the top of `pipeline/src/import-lines.ts`), then `pnpm import:lines` → `pnpm check:sources` → `pnpm geocode` → `pnpm build:bundle`. Imported rows are `proposed` and invisible until their own source page matches. Hours become a schedule only if every part parses; otherwise they're shown as written with "call first." Rows whose site blocks scripts: read the page in a browser, then set `status=active`, `entry_method=web` | — |
| Monthly or so | `pnpm ingest:opendata`, then read the git diff of `data/ingested/`. A changed phone number or address is approved by committing it | 10 minutes |

If nobody does any of this, the app ages its own badges, warns after 30 days, and goes to sunset mode after 120 (doc 12). That is by design.

## How to publish an alert

An alert says something is happening now (warming centers open, a pantry closed today). Write it only from the owner's own announcement.

```
pnpm alert:new -- --title "Overnight warming centers are open" --body "Open tonight through Wednesday noon." \n     --hours 60 --category warming --source-url https://detroitmi.gov/news/... --tel "Shelter help line=866-313-2520"
pnpm build:bundle        # or wait for the nightly publish
```

The command refuses an alert with no end time, one longer than 7 days, one with no source link, or a phone number that isn't a real number. The app hides the alert by itself at its end time, even offline. To cancel one listing's hours for a day, add `--cancellation --target sal_...`. To take an alert back early, set its `status` to `retracted` in `data/seed/alerts.json`. Ended alerts stay in the file; nothing is deleted.

**For a demo:** `pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1`. The title and body say it is a demo, it lasts at most 3 hours, and it cannot carry a phone number. Never publish a made-up alert without `--demo`.

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
9. **Nightly publish**: `.github/workflows/publish.yml` (written 2026-09-18, never run). It stays off until the repository variable `PUBLISH_ENABLED` is `true`; it also needs the variables `BUNDLE_PUBLIC_KEYS`, `REPORTS_API`, `PAGES_PROJECT` and the secrets below. City events publish by themselves; any other open-data change (an address, a greenway phase, a street) opens a pull request instead, and merging it is the approval. In short: `ingest:opendata` → `check:emergency` → `build:bundle:release` with `REPORTS_API`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`, `BUNDLE_SIGNING_KEY` → commit `data/hsds/` → deploy. A failed check stops the publish; yesterday's bundle stays up.

## Secrets (names only)

| Name | Where | What it is |
|---|---|---|
| `BUNDLE_SIGNING_KEY` | GitHub Actions | Ed25519 private key that signs `index.json` |
| spare signing key | offline only | Second pinned key, for rotation |
| `ACCESS_CLIENT_ID` / `ACCESS_CLIENT_SECRET` | GitHub Actions | Access service token the pipeline uses to read report counts and sync ids |
| Cloudflare API token | GitHub Actions | Deploys Pages and the Worker |

## What the write API stores, completely

`reports`: listing or segment id, kind, optional note (phone numbers and emails masked before storage), optional suggested correction, observed time (to the minute; to the hour for places), submitted time (to the minute), a per-target daily hash, steward outcome. After 180 days a report becomes a monthly count and the row is removed.
`proposals`: the place's name, category, what it offers, address (never for DV), public phone, schedule text, how the submitter knows, masked note.
`steward_actions`: steward email, action, reason code, optional note. Never published.
There is no table of residents, and no column anywhere for an IP address, device, user agent, or location.

## Handing it over

Transfer the GitHub org, the Cloudflare account, the domain, and the store listings; give the new operator the spare key and have them generate a new active key (ship an app build pinning new + spare). Everything else is in this repo.
