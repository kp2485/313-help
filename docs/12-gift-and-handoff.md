# 12 — Gift & Handoff

2026-09-18. The app is open source and intended as a gift to the City of Detroit. Kyle builds it unpaid; hackathon prize money or a later city contract may cover the work, and may not. This doc says what that does to the design.

## The uncomfortable part first

A gift needs someone to receive it. So far:

- DHD, the most natural recipient, has not signalled it will maintain even a list (DECISIONS.md).
- D Compassion reached the app stores in 2025 only through an outside vendor, and has about ten installs (corrected 2026-09-18; see 07). The City can get an app published; what it has not shown is the capacity to keep one current.

So plan for three futures, in order of likelihood, and make the app safe in all of them:

1. **Kyle runs it, lightly, for a long time.** Most likely. Must cost almost nothing and take under an hour a week.
2. **Someone adopts it** — a city department, the Greenway Partnership, a nonprofit, 211, a university clinic. Must be transferable in an afternoon.
3. **Nobody runs it.** Kyle gets busy; no adopter. Must wind itself down without hurting anyone.

A crisis directory that is abandoned but still looks alive is worse than no app. Future 3 is the one the design must get right.

## Design rules that follow

### 1. Unattended by default
Everything that keeps the directory honest runs without a person: badges age on the phone, reports label rows automatically, alerts expire by their own end time, watched pages and open-data diffs raise tasks rather than needing someone to look. Steward work improves the data; its absence never makes the app lie. (This is why 04 dropped scheduled verification.)

### 2. Dead-man switch
Driven by the age of the newest signed bundle, computed on the phone — no server needed, works offline:

| Bundle age | App behavior |
|---|---|
| > 72 hours | "Last updated {n} days ago — call before you go." Alerts area: "Alerts may be missing." |
| > 30 days | Persistent banner on every list and detail: "This list hasn't been updated since {date}. Call first, or call 211." |
| > 120 days | Directory goes to **sunset mode**: emergency strip (911, 988, and the last-verified crisis numbers), "Call 211 for help finding services," and a read-only list marked "Old information from {date}." No triage results presented as current. No reporting UI. |

The pipeline also publishes a `heartbeat` date in `index.json` that only a human action advances (the monthly safety-number check). If the nightly job keeps building bundles but no human has touched anything for 120 days, sunset mode still triggers. An automated job must not be able to keep a dead project looking alive.

Sunset mode is reversible: one new signed bundle with a fresh heartbeat restores everything.

### 3. Transferable in an afternoon
- **No personal accounts in the path.** Apple/Play under the Linwood Technologies organization (both stores support transferring an app to another organization). Domain, Cloudflare account, and GitHub org are separate from Kyle's personal ones, so ownership can move without a rebuild.
- **Infrastructure as code.** `wrangler.toml`, D1 migrations, R2 bucket names, Access policy, and GitHub Actions workflows all live in the repo. Nothing is configured only in a dashboard, except the WAF rate-limit rule and the Access policy, which `docs/OPERATIONS.md` describes step by step.
- **Secrets inventory** in `docs/OPERATIONS.md` (names and purposes, never values): bundle signing key, Cloudflare API token, D1 binding. Includes the signing-key rotation procedure — the pinned public key is the one thing that needs an app release to change, so ship the app with **two** pinned keys (active + spare, spare kept offline) from day one.
- **`docs/OPERATIONS.md`**: the weekly pass, the 30-day emergency-number check (`pnpm check:emergency`), how to publish an alert, how to add a steward, how to trigger sunset on purpose, how to hand over.
- **A city that adopts it never has to touch resident data,** because there isn't any. Put that sentence at the top of any adoption conversation.

### 4. Forkable by another city
Detroit-specific things live in data and config, not code: bbox, time zone, category labels, emergency numbers, source registry, the `x_detroit` extension name (document it as an HSDS Profile). "Grand Rapids forks it in a weekend" is a stronger open-source story for judges than the license alone.

## Licenses (decided 2026-09-18)

- Code: **Apache-2.0**. The patent grant matters when a city's vendor forks it. `LICENSE` and `NOTICE` are in the repo.
- Our dataset: **CC BY 4.0**, with a per-row source license field, since we can only license what is ours (10-B12).
- Contributions: a DCO sign-off line, not a CLA. Low friction, and enough for a city's lawyers.
- The name "D Compassion" is DHD's. A gift should not arrive wearing the recipient's trademark without asking. Done: the repo was renamed `detroit-compass` before it went public.

## What it costs to keep alive

| Item | Yearly | Notes |
|---|---|---|
| Apple Developer Program (organization) | $99 | Nonprofits and governments can get a fee waiver — relevant if an adopter takes over |
| Google Play | $25 once | |
| Domain | ~$12 | |
| Cloudflare Pages / R2 / Workers / D1 / Access, GitHub Actions | $0 at expected traffic | Registering the domain and creating Cloudflare resources still need Kyle's go-ahead (CLAUDE.md) |
| **Total** | **~$110–135** | A modest hackathon prize covers several years of running costs |

The real cost is time. Build time is a one-off. Running time under the exceptions-only model: about an hour a week plus twenty minutes a month.

## On getting paid

Plainly, since it affects design choices and not just hopes:

- Once the code is Apache-2.0, the city cannot be charged for the software. What cities do pay for is **hosting, support, data stewardship, training, and new features** — a yearly service agreement. Build toward that being easy to buy: clear operations doc, a defined weekly/monthly workload, a list of what a paid steward would add (phone verification of high-churn rows, Spanish/Arabic translation upkeep, press-release alerts).
- Payment "later" from a city usually means a procurement cycle measured in quarters, and it goes more smoothly to an LLC with a W-9 and insurance than to an individual. If that path matters, those basics are worth having before the conversation.
- The Greenway Partnership and similar nonprofits can often fund small tech work through grants faster than a city department can contract. The places/condition-report work in doc 11 is the piece most likely to have a willing funder.
- None of this should be a dependency. The plan above works if nobody ever pays.

This is practical framing, not legal or financial advice.

## The pitch line this earns

"It costs about a hundred dollars a year to run, holds no resident data, and if everyone walks away from it, it tells people to call 211 instead of sending them to a closed door. It's Apache-licensed. It's yours if you want it."
