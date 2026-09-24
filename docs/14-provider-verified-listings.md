# 14 — Provider-verified listings (design note)

**Status: proposed, 2026-09-24. Nothing here is built.** This turns the roadmap's first item
([09](09-roadmap.md), "Now → 1") into a design. **Seven decisions are Kyle's**, and they are gathered in one place
(§4), each with the options and a recommendation. Nothing gets built until they are answered. What happens after that is in §6.

## 1. What it is for

Every check we run today notices a problem *after* it exists: a page stopped matching, or a visitor found a locked
door. The people who run a place know first. This lets them say so in one tap, with no account and no password:
**"Still right"**, or **"Something changed"**. It creates no resident data, and it does not make an owner
someone who can publish without a steward.

## 2. What already exists, and what does not

**Exists:**
- **The method.** `owner_attest` is one of the verification methods (`packages/query/src/types.ts:6`,
  docs/03). It can be a row's `entry_method` or `last_confirm_method`.
- **The words, in all four languages.** `badge.confirmed.owner_attest` reads "The people who run it checked this
  {days} days ago", and `badge.entry_checked.owner_attest` reads "Added by the people who run it, {date}"
  (`strings/en.json:6`, `:13`).
- **The badge rule** (`packages/query/src/freshness.ts`, `schema/query-spec.md` "Badges"). A confirm shows as
  `badge.confirmed.<method>`, and a closed report outweighs it.
- **The steward queue.** It is behind Cloudflare Access, with closed request schemas and size caps on every route,
  and the Worker logs nothing (CLAUDE.md).

**Does not exist:**
- **Nothing can produce `owner_attest` today.** `resources.csv` has no confirm columns (`pipeline/src/seed-io.ts`).
  The only confirm that reaches the bundle is the Worker's `community_confirm` aggregate
  (`pipeline/src/reports-sync.ts`). The badge fixtures (`schema/fixtures/06-badge.json`) have no `owner_attest`
  case.
- **The Worker has no secret, no signing code and no way to send email.** The bundle's Ed25519 key belongs to
  the publish job, not the Worker.
- **A proposal cannot point at an existing listing.** The `proposals` table has no `target_id`, so today a
  proposal can only describe a new place.
- **No contact address is held anywhere.** `data/seed` has no email column. The repository's history was swept
  of email addresses (DECISIONS), and `api/src/validate.ts` removes email patterns from free text before storing
  it.

## 3. The flow, as proposed

1. **A steward picks a listing and makes a link.** A new steward route, behind Access, creates a link for one
   listing that expires after 30 days. The steward sends it to the contact address printed on the organization's
   **own page**, never to an address typed into a form.
2. **The organization opens the link on 313help.com.** The key for that one listing rides in the part of the URL
   after `#`. Browsers never send that part to a server, and it is removed from the address bar as soon as the
   page reads it. The page shows the listing as residents see it, and two buttons.
3. **"Still right"** posts the key. The Worker checks it, records a dated `owner_attest` for that listing, and
   uses the key up. At the next publish the listing reads "The people who run it checked this 0 days ago".
4. **"Something changed"** opens the fields from "Add a place" with the listing's current values filled in. The
   answer becomes a proposal **for that listing**. Any change to a phone, address or coordinate waits for a
   steward, exactly as a change from any other source does (docs/10 A5).
5. **Silence changes nothing.** A listing whose owner never answers keeps the badge it had. No timers are added
   to listings (docs/04).

The resident never sees any of this, except that the badge becomes truer.

## 4. The decisions (Kyle's)

### D1. How the link is sent

| Option | Cost | New pieces | Risk |
|---|---|---|---|
| **(a) A steward sends it by hand**, from a project mailbox, with the text from a template | None beyond a mailbox | A "make a link" button in the steward queue | Slow if the list grows; depends on a person |
| (b) The Worker sends it, through Cloudflare's own email sending if that fits by then | Check Cloudflare's current terms and price | A mail binding, a verified sending domain, a secret | An unattended mailer keeps writing to organizations after nobody runs the app (docs/12) |
| (c) A third-party email service | A monthly bill | An account, an API key, a data-processing agreement | The same, plus an organization's address held by a vendor |

**Recommendation: (a), for the first round.** 213 organizations (D6) and a check every three months come to
roughly three emails a working day, which is a person's job and not a system's. It costs nothing, needs no new
secret for sending, and cannot keep mailing anybody once nobody is running the app. Revisit (b) once the first
round shows how many organizations answer.

### D2. Where the organization's address is kept

- **(a) Nowhere (recommended).** The steward reads the address off the organization's own page each time, which
  also re-checks that the page is still theirs. D1 records only the listing, the page it came from, the date the
  link was made, and whether it was used. "The only email we would ever hold" (docs/08) stays at zero.
- **(b) In a D1 table visible only to stewards.** This saves a look at a web page per email. It means an
  organization's address is held by us, which needs a removal path and a line in docs/08.
- **(c) In `data/seed`.** **Ruled out:** it is a public repository, and its history was swept of email addresses.

### D3. What a link is

**Recommendation: a random single-use key, stored in D1 only as a hash, with no new signing secret.** The Worker
makes 32 random bytes, stores the SHA-256 of them against the listing and an expiry, and puts the bytes in the
link. Checking a key is a lookup. A lost or forwarded link can be revoked by deleting its row. Nothing needs a new
Worker secret, and no dependency is added: WebCrypto is already in the Worker.

The alternative is a signed link (HMAC with a new Worker secret) that needs no table. It cannot be revoked or
used only once without adding a table back, and it needs a secret set on the live site.

A link is not a deep link for residents. docs/08's rule that "deep links contain only resource IDs" is about
links residents share, and a resident never receives one of these.

### D4. Whether "Still right" can outweigh a report that a place is closed

- **Today:** a closed report stands until enough visitors say "still open" after it, or until a steward's phone
  check dated later (`freshness.ts`).
- **docs/10 A2** proposed that an owner attestation dated after the report should resolve it.
- **Recommendation: it should not, on its own.** An attestation after a closed report puts the listing at the
  top of the steward queue instead. The steward calls, and records the call as they do today. The audit's own
  warning, "The person standing at the empty box loses to the spreadsheet," applies just as much to a one-tap
  confirm. If Kyle chooses A2's rule instead, it is a change to `freshness.ts` and to its Swift and Kotlin copies,
  with new fixtures in `06-badge.json`.

### D5. What "Something changed" becomes

**Recommendation: a proposal with a `target_id`.** Migration `0005` adds a nullable `target_id` column to
`proposals`. The steward queue shows the listing's current values beside the proposed ones, and an accepted
change is copied into `data/seed/resources.csv` by hand, as accepted proposals are today. The alternative is the
unused `reports.suggested` path, which covers hours, address and phone. It mixes an owner's correction in with
residents' reports, and it cannot change a name or a description.

### D6. Which listings are asked

On 2026-09-24, 481 of the 537 active rows in `data/seed/resources.csv`, from 213 organizations, cite a page on the
organization's own domain. (Counted by comparing the last two parts of each row's `source_url` host with those of
its `website` host.)

- **First round: those.** Food and schedule rows go first, since those change most often. City, county and
  state agency pages (about 30 organizations) come later, because a department inbox is rarely one person's job.
- **Not in this design:** the 46 pantries that come from Gleaners' PantryNet (they have no page of their own;
  the roadmap's partner-feeds item covers them), and the open-data layers (DHD's boxes, Wayne County's stations,
  police and fire). Those are agencies' own published data and not an organization's own page.
- **Domestic-violence rows** can confirm a phone and a coarse service area only, and the page shows no address,
  because none exists (CLAUDE.md).
- **Private kinds.** The link's page is a steward-made page, not a resident screen. It writes no history entry
  and leaves no key in the URL, the same as every private screen.

### D7. How often, and what happens when nobody runs it

**Recommendation:**
- **Cadence:** every three months for listings with a schedule, and every month for mobile pantries and
  seasonal programs, as the roadmap says.
- **When nobody runs it:** with D1 (a), nothing is sent when nobody is running the app. That is the right way to
  fail for an organization's inbox (docs/12, "Nobody runs it"). The confirmations already recorded keep ageing on
  the device, in plain words, like every other badge.

## 5. Rules it keeps

- **Nothing about a resident is involved.** The flow has no resident in it at all.
- **The Worker still logs nothing** and reads no IP or user-agent header.
  - The new public routes (`POST /v1/owner/confirm`, `POST /v1/owner/propose`) are closed schemas with size caps:
    the key, and the "Add a place" fields.
  - Times are kept to the minute.
  - A failed key check answers with a single fixed error and records nothing.
- **An owner's word is shown as an owner's word.** The badge says "The people who run it checked this", never
  "verified" (CLAUDE.md).
- **Every phone, address or coordinate change waits for a steward** (docs/10 A5).
- **Only a steward publishes**, at the nightly build, as now.

**Threats, and what bounds them:**
- **A forwarded or stolen link:** it works for one listing, once, for 30 days. It can only add an owner's
  confirmation, which a closed report still outweighs (D4), or propose a change that a steward reads first.
- **A look-alike email (phishing):**
  - The email comes from a person at a known project address.
  - The link only ever points at `313help.com`.
  - The page never asks for a password, a payment or a personal detail.
  - A short paragraph in docs/OPERATIONS.md tells stewards what our emails never contain.
- **A compromised mailbox at the organization:** the same limits as a stolen link.

## 6. After the decisions: what gets built, in order

1. **D1 migration `0005`:**
   - an `owner_links` table (hashed key, listing, source page, made, expires, used)
   - `owner_attests` (listing, minute)
   - `proposals.target_id`
2. **Worker routes, each with tests in `api/test`:**
   - steward "make a link"
   - public confirm and propose
   - the aggregates route carrying each listing's latest attestation
3. **Pipeline:** `reports-sync.ts` sets `last_confirmed_at` and `last_confirm_method: owner_attest` from the
   aggregates, when that is newer than the community confirm.
4. **The rules:** `owner_attest` fixtures in `schema/fixtures/06-badge.json`, passing in `packages/query`,
   `DetroitQuery` and `apps/android/query`. They need no rule changes unless D4 goes A2's way.
5. **The web page** at `/confirm`: the key from the fragment, the listing, the two buttons, all four languages.
6. **The steward queue:** the "make a link" button with an email template, the owner proposals shown against
   the current values, and attestations that follow a closed report moved to the top.
7. **Docs:** docs/08's provider-email row, docs/06's routes, docs/04's verification methods and
   docs/OPERATIONS.md.

**What needs Kyle before it goes live (CLAUDE.md):**
- **A `--remote` D1 migration.**
- **A WAF rate rule** for the two new public routes.
- **A project mailbox** if D1 is (a).
- **No new dependency.** No new Worker secret either, if D3 goes as recommended.
