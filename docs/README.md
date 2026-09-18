# Detroit Resident Resource App — Design Documents

Working name: **DetroitHelp** (placeholder — see 09-roadmap.md for naming). A standalone app, separate from CommunityChest, that rebuilds the intent of the Detroit Health Department's stalled "D Compassion" app the way it should have been built.

## One-sentence pitch

A resource app for every Detroiter that stores nothing about you, works on a cheap Android phone with bad signal, and never sends you to a pantry that closed last month.

## How to read these

| # | Doc | Read it when you want to know… |
|---|-----|-------------------------------|
| 01 | [Vision & scope](01-vision-scope.md) | Who it's for, what it is, what it is not, the principles every decision is tested against |
| 02 | [Data sources](02-data-sources.md) | What data exists, how we get it, how trustworthy it is, how often it changes |
| 03 | [Data model](03-data-model.md) | The schema (HSDS-aligned), freshness fields, category taxonomy |
| 04 | [Resource lifecycle](04-resource-lifecycle.md) | **The core of the app**: how resources are added, verified, reported, expired, archived |
| 05 | [Features & flows](05-features-flows.md) | Screens, the on-device "find what I need" flow, map, detail, reporting UI |
| 06 | [Architecture](06-architecture.md) | Pipeline, hosting, app stack, offline strategy, admin tool |
| 07 | [Gap analysis](07-gap-analysis.md) | What D Compassion had, what it lacked, what we add |
| 08 | [Privacy & safety](08-privacy-safety.md) | No-PII design, anonymous reporting, youth, harm-reduction content, App Store review |
| 09 | [Roadmap & open questions](09-roadmap.md) | Hackathon scope, v1, v2, decisions Kyle needs to make |
| 10 | [Adversarial audit](10-adversarial-audit.md) | Where docs 01–09 break their own rules, ranked, with fixes and a web fact-check. **Read before building.** |
| 11 | [Healthy places](11-greenway-public-places.md) | Proposal: Joe Louis Greenway, parks, rec sites; condition reports with photos under zero-PII; impact measurement |
| — | [DECISIONS.md](DECISIONS.md) | Decisions the docs don't cover; audit fixes awaiting approval |
| — | [CLAUDE.md](../CLAUDE.md) | Handoff instructions for Claude Code |

## Status

- 2026-09-18: Drafted for review. Nothing built yet. Audited the same day (doc 10); fixes are listed as *Proposed* in DECISIONS.md and are not yet applied to docs 01–09.
- DHD program staff are aware of this project and informally supportive of reusing the public information from the D Compassion build. DHD has not offered to maintain any data or feed, and there is no written authorization; the design assumes neither (see 02 and 08).

## The three ideas that make this app different

1. **Stores nothing.** No accounts, no intake, no contact info. Triage runs on the phone. There is no resident data to secure because there isn't any. This is also why it can ship without a city procurement process.
2. **Freshness is the product.** Every resource carries a verification date, a confidence level, and a one-tap "this is wrong / closed / moved" report. Resources age out visibly instead of silently lying.
3. **The data outlives the app.** Resources are published as an open, HSDS-shaped dataset that DHD, 211/CIE, or anyone else can consume. If the app dies, the directory doesn't.
