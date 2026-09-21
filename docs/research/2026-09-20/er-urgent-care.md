# Emergency rooms and urgent care / walk-in clinics in the service area

Researched 2026-09-20. Service area: Detroit, Hamtramck, Highland Park, Dearborn (bbox lat 42.25–42.46, lon −83.33 to −82.91).

Every fact in the tables comes from the organisation's **own page**, read today, with that page as `source_url`. Requests used
`curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'` and, for rendered pages, the WebFetch
reader with the same honest identification. Aggregators (Yelp, Solv, Zocdoc, Healthgrades, urgentcare.com,
urgentcarelocations.org) and the Wayne State Campus Health Center's "area after hours urgent care" referral page were used
**only to find candidates**; no fact on a line comes from them. No staff names, emails or direct lines were copied.

**Status key.** **V** = the phone number and the street number both appear as plain text on the checker URL, and so do the
hours quoted. **P** = partial (something missing or contradictory on the owner's own page). **U** = unverified (owner's site
refuses scripts or does not resolve).

Lines written: **17** in `data/seed/incoming/2026-09-20-er-urgent-care.txt` — 5 emergency rooms, 12 urgent care / walk-in
clinics. Nothing else in the tree was touched. `import:lines`, `check:sources`, `geocode` and `build` were **not** run.

---

## What was already in the seed

`data/seed/resources.csv` had **no** emergency room and **no** urgent care listing. Grepping for *hospital*, *emergency*,
*urgent care*, *Henry Ford*, *Corewell*, *Beaumont*, *Receiving*, *Sinai*, *DMC* returned only:

- `sal_health_center_at_henry_ford_high_school` — a school-based clinic, not urgent care.
- Library, tax-help and English-class rows that happen to sit in Henry Ford Centennial Library / Henry Ford College.
- `sal_team_wellness_center` (`treatment.outpatient`) and `sal_the_wellness_east_medical_center` (`health.clinic`) — both
  appear on Wayne State's after-hours referral list, but our rows describe different services; see "Already listed" below.
- `data/seed/to-verify.csv` already carries two relevant open items: **DMC Detroit Receiving peer recovery coaches**
  ("dmc.org blocks scripts (Cloudflare). A person must check in a browser", line 181) and two Henry Ford behavioural-health
  rows. dmc.org is **still** 403 today.

So every line in the incoming file is new; there are no duplicates to worry about.

---

## Taxonomy: two ids are needed

No existing category fits. `health.clinic` means **"Free/low-cost clinic"** (docs/03-data-model.md, line 140) and none of
these places say they are free or low-cost; putting a hospital ER or a for-profit urgent care under that label would make the
app say something the owner's page does not. The lines therefore use two ids that **do not exist yet**:

| Proposed id | Resident label (English, ≤6th grade) | Why it is separate |
|---|---|---|
| `health.er` | **Emergency room** | Open all day and night, for things that could kill or badly hurt you. Different advice, different hours, different cost from a clinic. |
| `health.urgent` | **Urgent care** | Walk in for a small illness or injury when a regular doctor cannot see you. Not for an emergency. |

Suggested Spanish labels for `strings/es.json` (a person who speaks Spanish should check them): `health.er` = "Sala de
emergencias"; `health.urgent` = "Atención urgente".

**I did not edit any of these files** (another agent owns the taxonomy, web code and strings). They are where the ids would
need to be added:

1. `docs/03-data-model.md` — the taxonomy table, next to the `health.clinic` / `health.dental` rows (about line 140–151).
2. `docs/DECISIONS.md` — a dated line, the way the 2026-09-19 "New categories" entry (line 147) records the last batch.
3. `strings/en.json` and `strings/es.json` — the same keys in both. Existing shape: `cat.health` at line 59 and
   `refine.doctor.dentist` at line 443, so the new keys would be `refine.doctor.er` and `refine.doctor.urgent`
   (plus `cat.*` entries only if the category tab list is meant to show them separately).
4. `apps/web/src/needs.ts` — the `doctor` need's `refine` list (lines 59–62), which today has `health.clinic`,
   `health.dental`, `health.vision`. The plain-language wording matters here: an ER entry must not be the first thing a
   person taps for a regular need, and 911 stays hardcoded and first on any "right now" screen (docs/05).
5. `apps/ios/HelpApp/Help.swift` — the Swift copy of the same need list (line 57).
6. `strings` key/placeholder tests and any fixture in `schema/fixtures/` that enumerates categories.

A safety note for whoever writes the UI string: the ER label should not imply a visit is free or that an ER is the right
first stop. Nothing on any page read today states a price for an ER visit, so no line says anything about ER cost.

---

## Table 1 — Hospital emergency rooms (listed)

| # | Org / place | Address | Phone (what for) | Hours as printed | Checker URL | Status |
|---|---|---|---|---|---|---|
| 1 | Henry Ford Health: Henry Ford Hospital | 2799 W Grand Blvd, Detroit, MI 48202 | Emergency **(313) 916-1545**; Hospital Phone **(313) 916-2600** | "Emergency room open 24 hours, 7 days a week" | https://www.henryford.com/locations/henry-ford-hospital | V |
| 2 | Henry Ford Health: Henry Ford St. John Hospital (adult ER) | 22101 Moross Rd, Detroit, MI 48236 | Office Phone **(313) 343-4000** | "Adult and dedicated Pediatric Emergency Rooms open 24 hours, 7 days a week." | https://www.henryford.com/locations/st-john-hospital | V |
| 3 | Henry Ford Health: Henry Ford St. John Children's Hospital (children's ER) | 22101 Moross Rd, Detroit, MI 48236 | Office Phone **(313) 343-4000** | "Dedicated Pediatric Emergency Room open 24 hours, 7 days a week" / "Hours Open 24 hours, 7 days a week" | https://www.henryford.com/locations/st-john-childrens-hospital | V |
| 4 | Henry Ford Health: Henry Ford Medical Center – Fairlane (ER) | 19401 Hubbard Dr, Dearborn, MI 48126 | Main **(313) 982-8100**; Emergency **(313) 982-8261** | "Hours Emergency Room Open 24 hours, 7 days a week" | https://www.henryford.com/locations/fairlane | V |
| 5 | Corewell Health Dearborn Hospital Emergency | 18101 Oakwood Blvd., Dearborn, MI 48124 | **313-593-7440** (Main) | "Open 24 hours", Monday through Sunday | https://corewellhealth.org/locations/LOC0000193638/corewell-health-dearborn-hospital-emergency | V |

Notes.
- #2 and #3 are the same campus and the same main line. They are two lines because a parent looking for a children's ER
  should find one; the pages are separate on Henry Ford's own site and each prints its own ER sentence.
- #4 is a **freestanding emergency room inside a Henry Ford medical centre in Dearborn**, not a hospital. It is easy to miss
  and it is the only Henry Ford ER in Dearborn. Its page prints a separate emergency phone.
- The former Ascension St. John is now **Henry Ford St. John**, and henryford.com serves it (there is also a
  `/locations/st-john-hospital-former` URL in Henry Ford's sitemap; the live page is `/locations/st-john-hospital`).

## Table 2 — Urgent care / walk-in clinics (listed)

| # | Org / place | Address | Phone | Hours as printed | Cost / insurance as printed | Checker URL | Status |
|---|---|---|---|---|---|---|---|
| 6 | Henry Ford Same-Day Care – Ford Road | 5500 Auto Club Dr, Dearborn, MI 48126 | (313) 425-4500 | "Monday and Tuesday 8:00 a.m. – 6:00 p.m.; Wednesday, Thursday and Friday 7:00 a.m. – 5:00 p.m." | nothing printed | https://www.henryford.com/locations/ford-road/walk-in-clinic | V |
| 7 | Corewell Health Urgent Care – Dearborn | 23100 Michigan Ave., Dearborn, MI 48124 | 313-263-7584 | Monday–Sunday "8:00am to 8:00pm" | nothing printed | https://corewellhealth.org/locations/LOC0000193752/corewell-health-urgent-care-dearborn | V |
| 8 | Get Well Urgent Care – Detroit | 19335 Grand River Ave, Detroit, MI 48223 | (313) 955-0000 | "Mon – Fri 8am – 7pm / Sat – Sun 8am – 5pm" | nothing printed | https://getwellurgent.com/locations/detroit/ | V |
| 9 | Get Well Urgent Care – Dearborn | 13244 W Warren Ave, Dearborn, MI 48126 | (313) 380-1200 | "Mon – Fri 8am – Midnight / Sat – Sun 8am – 9pm" | nothing printed | https://getwellurgent.com/locations/dearborn/ | V |
| 10 | 1st Choice Urgent Care – Dearborn East | 12841 Ford Road, Dearborn, MI 48126 | (313) 710-4199 | "Sunday … Saturday Open 24 Hours", "OPEN 24HRS A DAY \| 365 DAYS A YEAR" | "low fees so that uninsured patients can still see a physician"; Medicare, Medicaid and most major carriers | https://firstchoiceucc.com/urgent-care-dearborn-michigan-east/ | V |
| 11 | 1st Choice Urgent Care – Dearborn West | 23455 Michigan Avenue, Dearborn, MI 48124 | (313) 438-6094 | "Sunday–Saturday 9:00 AM - 9:00 PM"; "Holidays 9:00 AM - 5:00 PM" | same wording as #10 | https://firstchoiceucc.com/urgent-care-dearborn-michigan-west/ | V |
| 12 | HMC Urgent Care | 7542 Wyoming Ave, Dearborn, MI 48126 | 313-415-1515 | "Monday to Friday, 9:00 AM to 11:00 PM. Saturday and Sunday, 11:00 AM to 11:00 PM." | "No insurance? No problem — we still see you"; "Most insurance plans accepted" | https://www.hmcurgentcare.com/ | V |
| 13 | West Dearborn Urgent Care | 2421 Monroe St #102, Dearborn, MI 48124 | (313) 447-0888 | "Monday – Sunday, 10:00 am – 8:00 pm" | "almost all health insurance plans"; "affordable care for self pay patrons" | https://wdearbornuc.com/ | V |
| 14 | Community Urgent Care | 1816 Grindley Park Street (at Outer Drive), Dearborn, MI 48124 | 313-792-1200 | "Open Daily: 7 AM -10 PM"; "Major Holiday Hours: 10 AM - 4 PM"; closed Thanksgiving and Christmas | nothing printed | https://cuc-dearborn.com/hours-locationhours-location-3/hours-location/ | P (see below) |
| 15 | Specialty Urgent Care – Dearborn | 13530 Michigan Ave, Suite 120, Dearborn, MI 48126 | (313) 582-0100 | **two contradictory sets on the same page** (see below) | "prices starting at $80 for testing onsite"; Medicare, Medicaid, most major plans; Spanish speakers | https://urgentcare-mi.com/urgent-care-dearborn-michigan/ | P |
| 16 | The Family Doc Clinic & Urgent Care – Hamtramck | 9800 Conant Suite A, Hamtramck, MI 48212 | (313) 424-4449 | **not printed anywhere on the site** | nothing printed | https://thefamilydocmi.com/urgent-and-primary-care-in-hamtramck/ | P |
| 17 | Hamtramck Medical Urgent Care | 9740 Conant St, Hamtramck, MI 48212 | 313-265-3140 | **not printed anywhere on the site** | "accept most insurance plans" | https://hamtramckmedicalurgentcare.com/ | P |

Issues on the partial rows.
- **#14 Community Urgent Care.** Its home page says "Monday through Friday: 8am - 8pm"; its own Hours & Location page — the
  only page that also carries the street address — says "Open Daily: 7 AM -10 PM". The listing uses the Hours & Location
  page, because that is the page the entry checker reads, and the holiday wording is in `notice`. A person should ring once
  and settle which is current.
- **#15 Specialty Urgent Care.** One block on the page says "Extended Clinic Hours: Monday – Saturday: 9:00 AM – 6:00 PM
  Closed Sundays"; the footer on the same page says "Clinic Hours: Monday through Sunday 8:00 am - 8:00 pm"; a third line
  says "Extended hours … including weekends 8 a.m. – 8 p.m.". The line records the contradiction as written, so the listing
  says **call first** rather than guessing. This is deliberate.
- **#16, #17.** Neither Hamtramck clinic prints hours on any page of its own site (checked home, location and contact pages,
  and the raw HTML). Both say "call first". Both say walk-ins are welcome, which is why they are listed at all.

---

## Held, and why

### Needs a person with a browser

| What | URL | What to read off the page |
|---|---|---|
| **DMC Detroit Receiving Hospital** (ER) | https://www.dmc.org/locations/detail/dmc-detroit-receiving-hospital | Street address, ER phone, and whether the page prints "24 hours" |
| **DMC Harper University Hospital / Hutzel Women's Hospital** | https://www.dmc.org/ → Locations | Which of the two has the ER, its address, phone, hours wording |
| **DMC Sinai-Grace Hospital** (ER) | https://www.dmc.org/ → Locations | Address, ER phone, hours wording |
| **DMC Children's Hospital of Michigan** (children's ER) | https://www.childrensdmc.org/ | Address, ER phone, hours wording |
| **DMC emergency-room overview** | https://www.dmc.org/services/emergency-room | The list of DMC ERs, to be sure none is missed |
| **John D. Dingell VA Medical Center** (ER) | https://www.va.gov/detroit-health-care/locations/john-d-dingell-department-of-veterans-affairs-medical-center/ | **The main phone number.** The address (4646 John R Street, Detroit, MI 48201-1916) and the hours ("Mon…Sun : 24/7", "Emergency care … immediate treatment for serious, life-threatening health emergencies") are plain text, but every phone number on va.gov loads by script and is not in the page source, so the listing cannot publish yet |
| **Concentra – Downtown Detroit** | https://www.concentra.com/urgent-care-centers/michigan/detroit/downtown-detroit-urgent-care/ | Whether the public can walk in (not only employer/occupational), plus address, phone, hours. Wayne State's referral page gives 2630 East Jefferson Avenue, Detroit 48207, 313-259-7990, but that is not Concentra's own page |
| **City Urgent Care – Detroit** | https://cityurgentcaredetroit.com/ | Address, phone, hours. Wayne State's page gives 13403 W Seven Mile Rd Suite A, Detroit 48235, 313-308-2444 |
| **Team Wellness Center** | https://www.teamwellnesscenter.org/ | Whether any of its Detroit sites is a walk-in medical urgent care as Wayne State's list implies, or only behavioural health |
| **The Wellness Plan, East Area Medical Center** | https://thewellnessplan.org/ | Whether it takes walk-ins; we already list this place as `health.clinic` (`sal_the_wellness_east_medical_center`), so this may only be a detail-text change |

Why each is held:
- **dmc.org and childrensdmc.org return HTTP 403 to any script**, with our honest user agent, today (matching the note
  already in `to-verify.csv` line 181). Per the brief, no workaround was attempted. Four hospitals and a children's hospital
  — the largest gap in this lane by far.
- **va.gov** serves the address and the hours as plain text but injects the phone numbers with JavaScript, so the rule
  "publishes only when its own page shows its phone number and street number" is not met yet.
- **concentra.com returns 403 to scripts** (403 on the home page too).
- **cityurgentcaredetroit.com** fails the TLS handshake over HTTPS (`SSLV3_ALERT_HANDSHAKE_FAILURE`) and answers **409** over
  HTTP. Not a block we should route around.
- **teamwellnesscenter.org** and **thewellnessplan.org** did not connect at all today (curl exit 6, code 000), with and
  without `www`, over both schemes.

### Dropped after reading the owner's page

| Candidate | Why it is not listed |
|---|---|
| Henry Ford-GoHealth Urgent Care | Henry Ford's own sitemap lists exactly these GoHealth centres: Berkley, Bruce Township, Canton, Chesterfield, Clinton Township, Commerce, **Dearborn Heights**, Fraser, Livonia, Southfield, Southgate, St. Clair Shores, Taylor, West Bloomfield, Wonderland Village. **None is in Detroit, Dearborn, Hamtramck or Highland Park.** The nearest, 26763 Ford Rd, Dearborn Heights 48127 (313-827-1022, Mon–Fri 8:00 am–8:00 pm, Sat–Sun 9:00 am–5:00 pm), sits inside our bounding box but in a city the service area does not name (Kyle, 2026-09-19). **A decision for Kyle:** include it, or keep the named-cities rule? |
| Henry Ford walk-in clinics generally | The only `/locations/*/walk-in-clinic` pages on henryford.com are Bloomfield Township, Chelsea, Columbus, East Michigan, **Ford Road**, Grosse Pointe, Macomb-Richmond, North Street, Royal Oak, Sterling Heights, Woodhaven. Only Ford Road (Dearborn) is in the area, and it is listed (#6) |
| Henry Ford Medical Center – Detroit Northwest, 7800 Outer Dr W | Its own page says the site "currently offers limited services, including primary care, rehabilitation and retail pharmacy" and names **no** walk-in or same-day clinic. Wayne State's referral list still calls it "Henry Ford Same Day Care—Detroit Northwest"; Henry Ford's page does not |
| Henry Ford Medical Center – Harbortown, 3370 E Jefferson Ave | Family medicine, X-ray and occupational health with fixed office hours. No urgent care or walk-in wording on its page |
| Henry Ford Medical Center – Hamtramck, 9100 Brombach St | Primary care, paediatrics and OB/GYN, Mon–Fri 8–5. No walk-in or urgent care wording. (Worth remembering when the clinic lane is next revisited) |
| Henry Ford Medical Center – New Center One | Specialty and diagnostic services only |
| Woodland Urgent Care, 22341 W Eight Mile Rd, Detroit | Its operator's site (urgentcaremanagement.net) now lists only Ashtabula OH, Adrian, Southgate and Warren — **no Detroit clinic**. It may have closed. Held until someone can confirm |
| Vernor Urgent Care, 3456 Vernor Highway, Detroit | vernorurgentcare.com is a parked domain (a JavaScript redirect to `/lander`). No owner page |
| NovaHealth Urgent Care ("walk-in clinic Detroit MI") | Its own page gives the address as 25775 W 10 Mile Rd, Suite B, **Southfield** — outside the area, despite the page title |
| NextCare Urgent Care | Its Michigan page lists only Livonia and Waterford Twp |
| MedCare Urgent Care | Redford, Wyandotte, Eastpointe, Dearborn Heights — none in the area |
| CityDoc "Highland Park" urgent care | CityDoc is in **Highland Park, Dallas, Texas** (10759 Preston Rd.). A search-engine trap |
| Highland Park General Hospital | Appears only on aggregator sites (urgentcarelocations.org, yellowpages). No owner page exists; the hospital closed long ago. Several Woodward Ave and Glendale Ave "urgent care" entries for 48203 come from the same aggregators with no owner page behind them |
| Wayne State Campus Health Center, 5285 Anthony Wayne Dr | Its own page prints the address, 313-577-5041 and "Monday-Friday 9:00 am to 5:30 pm", but nothing saying the public may walk in — it reads as a student health centre and it refers people elsewhere for urgent care. Held for a person to decide |
| Concentra generally | Occupational medicine first; the brief says skip unless the page shows public walk-in care, and the page cannot be read (above) |

### Already listed elsewhere in the seed (do not duplicate)

The FQHC and low-cost clinics that take walk-ins — CHASS, Covenant Community Care, Advantage Health, Detroit Community
Health Connection, The Wellness Plan, HUDA, ACCESS, Western Wayne, Wayne County Healthy Communities (Hamtramck) — are already
in `resources.csv` as `health.clinic`. None of them calls itself an urgent care on its own page, so none was moved or copied
into `health.urgent`. If the taxonomy owner would rather see "walk in without an appointment" as a flag across clinics than
as a category, `walk_in` already exists as a flag and several of those rows carry it.

---

## Coverage, honestly

- **Detroit:** 3 emergency rooms listed (Henry Ford Hospital, Henry Ford St. John adult, Henry Ford St. John children's) and
  **1** urgent care (Get Well, Grand River). The city's four DMC hospitals, the Children's Hospital of Michigan and the VA
  are all blocked or script-only, so Detroit's ER coverage is roughly half of what it should be, and its urgent-care
  coverage is thin because most of the candidates (Concentra, City Urgent Care, Vernor, Woodland) have no readable owner
  page today. **This lane is not finished until a person opens the browser list above.**
- **Dearborn:** 2 emergency rooms and 9 urgent care clinics. Good coverage.
- **Hamtramck:** no hospital. 2 walk-in clinics, neither of which publishes hours.
- **Highland Park:** **nothing found with an owner page.** Highland Park has had no hospital since Highland Park General
  closed, and every "Highland Park urgent care" hit today was either an aggregator record with no owner page behind it or a
  clinic in Highland Park, Texas or Illinois. The nearest listed help is in Detroit or Hamtramck. This is a real gap in the
  city, not a gap in our reading.
