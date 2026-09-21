# Deploy handoff — 2026-09-20

For Kyle. Everything below needs an account only you have. Nothing here costs money except the domain.
Work top to bottom; `pnpm preflight` goes green as you go, and the last step turns the nightly publish on.

Run `pnpm preflight` first to see where you are. It prints one line per check; `STOP` blocks a deploy.
**Never paste a key or a token into this repository, into a doc, or into a chat.** Only names appear here.

## The six blockers

| # | Blocker | Where | Cost |
|---|---|---|---|
| 1 | Two signing keys, and the repository variables/secrets that hold them | your machine + GitHub | $0 |
| 2 | The D1 database id, and the migrations applied to it | terminal | $0 |
| 3 | `ALLOWED_ORIGIN` is the real https site | `api/wrangler.toml` | domain ~$12/yr |
| 4 | `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` | `api/wrangler.toml` | $0 |
| 5 | The Cloudflare Access policy exists — **and you sign for it** | dashboard + `api/edge-protections.md` | $0 |
| 6 | The WAF rate-limiting rule exists — **and you sign for it** | dashboard + `api/edge-protections.md` | $0 |

Blockers 5 and 6 are the ones no script can see. Preflight stays red until a dated line with your name is in
`api/edge-protections.md`, and `pnpm smoke` proves them from outside afterwards.

---

### 1. Signing keys

```
pnpm keys:generate          # twice: an active key and a spare
```

- Active **private** key → GitHub repository **secret** named `BUNDLE_SIGNING_KEY`.
- Spare **private** key → offline only (password manager and paper). Never in GitHub, never in the repo.
- Both **public** keys → GitHub repository **variable** named `BUNDLE_PUBLIC_KEYS`, as `active,spare`.

GitHub: *Settings → Secrets and variables → Actions*. Secrets tab for the first, Variables tab for the third.
Losing both private keys means shipping a new app build, because phones pin these two.

To see preflight go green locally: `BUNDLE_SIGNING_KEY="$(cat …)" BUNDLE_PUBLIC_KEYS="…,…" pnpm preflight`.

### 2. D1 (done 2026-09-20 — one step left)

```
wrangler d1 create 313-help                         # done: the id is in api/wrangler.toml
pnpm --filter @313help/api exec wrangler d1 migrations apply 313-help --remote
```

The four migrations have never been applied to the remote database. Until they are, every query the deployed
Worker makes fails, including the nightly cron. Do this **before** the first deploy.

### 3. Domain, Pages, Worker, origin

1. Register the domain and add it to Cloudflare (this is the only money).
2. Create an **empty** Pages project. Note its name; it becomes the repository variable `PAGES_PROJECT`.
   Do **not** connect Pages to Git: a Cloudflare build would ship a dev-signed bundle.
3. The Worker builds from Git (already set up): root directory `api`, deploy command `npx wrangler deploy`.
   Route it at `https://<domain>/v1/*` so the app and the API share one origin.
4. In `api/wrangler.toml` set `ALLOWED_ORIGIN = "https://<domain>"` and commit it.

### 4. Cloudflare Access — the application

Dashboard → **Zero Trust → Access → Applications → Add an application → Self-hosted**.

- Name it, e.g. *313 Help stewards*.
- Two paths on the same application: `<domain>/admin/*` **and** `<domain>/v1/steward/*`.
- Policy 1, *Allow*: **Emails** — each steward's email, one per line.
- Policy 2, *Service Auth*: a **service token** for the pipeline. Create it under *Access → Service Auth*.
  Its id and secret become the GitHub secrets `ACCESS_CLIENT_ID` and `ACCESS_CLIENT_SECRET`.
- Copy the application's **Application Audience (AUD) tag** and your **team domain**
  (`<something>.cloudflareaccess.com`) into `api/wrangler.toml` as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`,
  and commit. The Worker verifies the token itself and fails closed while these are empty.
- Never set `DEV_STEWARD` in production. (It would do nothing: the Worker honours it only when its value is
  exactly `local` **and** neither `ACCESS_TEAM_DOMAIN` nor `ACCESS_AUD` is set — so filling the two fields above
  switches it off by itself. The request's `Host` is not part of the decision.)

### 5. The WAF rate-limiting rule

Dashboard → your domain → **Security → WAF → Rate limiting rules → Create rule**.

- Name: *313 Help write limit*.
- If incoming requests match: `URI Path` **starts with** `/v1/` **and** `Request Method` **equals** `POST`.
- Characteristics: **IP address** (the default). Keep it at IP; the Worker is never allowed to read one.
- Rate: **10 requests per 1 minute**. Then take action: **Block**, for **1 minute**, with a plain text response.

This is the only abuse control in the whole design. Until it exists, the only thing standing between the
database and a script is the per-day dedupe hash, which anyone can regenerate.

### 6. Sign for 4, 5 and 6 — then prove it

Open `api/edge-protections.md` and replace the two `not signed` lines at the bottom with what you saw:

```
access_policy: 2026-09-20 <your name> — Access app "<name>" covers /admin/* and /v1/steward/*; N emails, 1 service token
waf_rate_limit: 2026-09-20 <your name> — WAF rule "<name>": POST /v1/*, 10 a minute per IP, block 1 minute
```

Commit it. `pnpm preflight` should now show no `STOP` (with the two key variables set). Then, from outside:

```
pnpm smoke -- https://<domain> --i-own-this-origin
```

It asks the live origin the questions preflight can't: that the steward endpoints and `/admin/` refuse anyone
who is not signed in, that an unknown field is a 400, that CORS names only your site, that photos are off, and
that a short burst of writes gets rate-limited. It sends about thirty requests, all of them ones the API must
refuse, so it can never store anything. Only ever run it against this project's own origin.

Re-run it after any change to the Access policy or the WAF rule. If either is ever removed, set its line in
`api/edge-protections.md` back to `not signed` in the same commit.

### 6b. Check the logs are off, in the dashboard

`api/wrangler.toml` already sets `[observability.logs] enabled = false` and `invocation_logs = false`, and the
Worker's error handlers log nothing (Cloudflare's own docs say invocation logs capture "request metadata, and
headers"). Two things a config file cannot prove, so look at them once after the first deploy:

- Worker → **Observability → Logs**: off. If the dashboard has turned it on, turn it back off.
- Account → **Logpush**: no job for **Workers Trace Events**. An account-level job collects what the Worker's own
  setting cannot prevent.

And a standing rule for whoever debugs this later: **never paste `wrangler tail` output into an issue, a chat or a
document.** Tail streams live requests, URLs and headers past whoever is looking at the screen.

### 7. Turn the publish on, last

GitHub → *Settings → Secrets and variables → Actions*.

| Kind | Name | What it holds |
|---|---|---|
| Secret | `BUNDLE_SIGNING_KEY` | the active private key (step 1) |
| Secret | `ACCESS_CLIENT_ID` | the service token's id (step 4) |
| Secret | `ACCESS_CLIENT_SECRET` | the service token's secret (step 4) |
| Secret | `CLOUDFLARE_API_TOKEN` | a token that can deploy Pages |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | which account to deploy to |
| Variable | `BUNDLE_PUBLIC_KEYS` | the two public keys, `active,spare` |
| Variable | `REPORTS_API` | `https://<domain>` |
| Variable | `PAGES_PROJECT` | the Pages project name (step 3) |
| Variable | `PUBLISH_ENABLED` | **`true`, and only when everything above is done** |

Then run the workflow by hand once (*Actions → publish → Run workflow*) and read the log before trusting the
schedule. The job starts with `pnpm preflight`, so an unsigned line in `api/edge-protections.md` stops it before
anything is built or deployed. After it finishes, run `pnpm smoke` once more and open the site.

## What is deliberately not on this list

- **Photos.** Two switches are off and the R2 bucket does not exist. They stay that way until the legal advice
  in docs/11 is in hand (DECISIONS 2026-09-19).
- **The hand-check worksheet** (`docs/CHECKS-2026-09-19.md`), and its rows with no result yet. Preflight only asks you to look; it is
  human work owed before telling the public the address, not a deploy blocker.
- **App stores.** $99/yr and $25, and nothing in this list depends on them.

## The first night, and what it will do

The cron (`17 8 * * *`, daily) runs the 180-day report purge and the 30-day photo delete. On a fresh database
both find nothing and change nothing; without the R2 binding the photo pass does nothing at all and a report
that carries a photo waits rather than leave a picture behind. `api/test/scheduled.test.ts` holds the first run
to that. The one thing that will break it is skipping the `--remote` migrations in step 2.

The two passes are now independent: each runs in its own `try`/`catch`, so a photo pass that fails cannot stop
the retention pass, and neither can stop the other from being tried again tomorrow. A failure prints one of two
fixed sentences and nothing else — no ids, no error text — because that is the only thing the Worker is allowed
to print (`api/src/log.ts`). Which means **a failed pass is silent from outside**: the way you find out is that
counts stop moving, not a log line. With Workers Logs off there is deliberately nowhere else to look.

The nightly publish's last two steps (the page re-check and the steward tasks it raises) never fail the job and
never change the app: a flaky page must not block a publish.
