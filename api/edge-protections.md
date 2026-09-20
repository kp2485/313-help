# Edge protections — signed by a person

Two of the things this app depends on are not in this repository and no script can create them. They live in the
Cloudflare dashboard, on purpose:

- **The Access policy.** One Cloudflare Access application covering `/admin/*` **and** `/v1/steward/*`, with the
  steward emails on its allow list and one service token for the pipeline (docs/OPERATIONS.md, First deployment
  step 5). Without it the steward pages are either shut to everyone or open to everyone.
- **The WAF rate-limiting rule.** A rate-limiting rule on `POST /v1/*`, per IP, about 10 a minute
  (step 6). It lives at the edge because the Worker's code is never allowed to read an IP address.

`pnpm preflight` cannot see either one. So a person says here, by name and with a date, that they made them. The two
lines at the bottom of this file are what preflight reads; until both are signed, a deploy is blocked.

**Do not sign a line you have not seen with your own eyes in the dashboard.** This is an attestation, not a to-do
list. After signing, prove it from outside:

```
pnpm smoke -- https://<domain> --i-own-this-origin
```

A line is written as `key: YYYY-MM-DD Name — what you saw`, for example:

    access_policy: 2026-09-20 A Person — Access app "313 Help stewards" covers /admin/* and /v1/steward/*; 3 emails and 1 service token
    waf_rate_limit: 2026-09-20 A Person — WAF rule "313 Help write limit": POST /v1/* , 10 per minute per IP, block 1 minute

If either protection is taken away, changed, or moved to another account, set its line back to `not signed` in the
same commit. Re-sign both when the dashboard changes hands. Preflight asks for a fresh look after 180 days.

access_policy: 2026-09-20 Kyle Peterson — Access app "313 Help stewards" covers /admin/* and /v1/steward/*; 1 email (kdpeters@gmail.com) and 1 service token (313help-pipeline)
waf_rate_limit: 2026-09-20 Kyle Peterson — WAF rule "313 Help write limit": POST /v1/*, block 2 requests per 10 seconds per IP (Free plan's shortest window; ~12/min), block duration 10 seconds
