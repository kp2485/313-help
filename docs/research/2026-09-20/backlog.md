# Working the held backlog — 2026-09-20

The 288 rows in `data/seed/to-verify.csv` each carry a reason they were held. This pass took the five Kyle named
first, then continued by resident value: housing, ID and paperwork, health, work, food.

**Method.** Every fact below was read today on the organisation's **own** page, through honest WebFetch requests
that identify themselves. No aggregator, no Facebook, no directory, no findhelp, no search snippet was used as a
source of fact — only, occasionally, to know which owner page to open. Where a site refused an honest request it was
left alone and put on the browser list; nothing was disguised or worked around, and no browser was driven (another
agent owns the browser). No hours were guessed. No staff name, email or direct line was recorded, even where a page
printed one (SER ReBuild's intake specialist, Goodwill's clubhouse director, St. Mary of Redford's volunteer line).

Resolved rows are written as import lines in `data/seed/incoming/2026-09-20-backlog.txt`, each with a comment naming
the `to-verify` row it clears.

## Outcomes

| Row (name in to-verify.csv) | Reason held | Outcome | Source read today |
|---|---|---|---|
| United Community Housing Coalition: eviction defense, 300 River Place Dr, Suite 1200 | Hours conflict on UCHC's own pages (4:30 vs 5:00) | **resolved** — not a contradiction: the contact page prints *office* hours to 5:00pm, the home page prints the hours to *call* for an appointment, to 4:30pm. The office is closed to walk-ins, so the line publishes the calling hours and records the difference in `notice`. Also picked up the Eviction Defense Helpline, 313-725-4646 | https://www.uchcdetroit.org/contact-us and https://www.uchcdetroit.org/ |
| United Community Housing Coalition: tax foreclosure prevention | Same hours conflict | **resolved** — same resolution; hotline 313-725-4560 and the address are both on the contact page | https://www.uchcdetroit.org/contact-us |
| Dearborn Housing Commission (Townsend Towers, Kennedy Plaza, Sisson Manor) | No phone on the page; Sisson Manor ZIP 48124 vs 48126 | **resolved** — the page now prints 311 or 313-943-2150, the office address (16901 Michigan Ave), hours 8am–5pm Mon–Fri, and ZIP 48126 for all three buildings | https://dearborn.gov/dearbornhousing |
| Legal Aid and Defender Association: civil housing and veterans legal help | Two addresses on its own page (7650 Second Ave vs 613 Abbott St) | **resolved** — the page labels 613 Abbott St as the *parking lot*. Office is 7650 Second Ave, Ste 120, 48202. Legal line 313-967-5800, veterans line 313-967-5635. Hours still not printed, so the line says "not stated" | https://ladadetroit.org/services/ |
| Hamtramck H.E.A.R.T. poverty exemption, 3401 Evaline St | The 2026 packet contradicts itself on the income limit | **resolved** — the assessor's own page states no income figure at all, so the packet's contradiction never reaches a resident. Address, phone (ext. 820) and hours (incl. Tuesday 10am–6pm) are all on the page | https://hamtramckcity.gov/departments/assessor/ |
| Highland Park poverty exemption, City Assessor, 12050 Woodward Ave | Board of Review page says 12505 Woodward | **resolved** — the poverty-exemption page prints 12050 Woodward with 313-252-0050 and Mon–Fri 8:30am–5pm. The 12505 is the outlier | https://highlandparkmi.gov/government/assessor/tax-assessing/poverty-exemption-application/ |
| Michigan Legal Help, 3rd Circuit Court Self-Help Center, 2 Woodward Ave, 19th Floor | No phone; two hour statements differ | **resolved, with a caveat** — the page now gives one set of hours: Mon–Fri 9am–3pm, last sign-in 1:30pm, Room 1911, free. There is still **no phone on any owner page**. `check-sources` permits a phone-less row when the house number is on the page, and "2 Woodward Ave" is. A steward should decide whether to publish a door with no number | https://michiganlegalhelp.org/self-help-centers/3rd-circuit-court-self-help-center |
| Avalon Wellness Clinic (follow-up care after assault) | Clinic page had the phone and hours but no street address | **resolved** — the page now prints 601 Bagley St, 313-920-0470, Mon–Thu 8am–6pm and "Free services" together | https://avalonhealing.org/services/wellness-clinic/ |
| Kids-TALK Children's Advocacy Center, 40 East Ferry St | Unclear whether a family can call directly | **resolved** — the page now says families may contact them directly, and states the cost (interview and advocacy free; medical and therapy regardless of ability to pay). Hours are still not printed | https://www.guidance-center.org/kids-talk/ |
| Passenger Recovery Community Center, 3901 Christopher St | Centre hours conflict (Wed–Sat vs Wed–Sun) | **resolved** — the services page now prints one set: Wed–Sat 12pm–8pm, Sun 1pm–8pm, with walk-in coaching Wed–Fri 2–4pm inside them. Address (Suite D), 313-288-0062 and "FREE Service" are on the same page | https://passengerrecovery.com/services/hamtramck-center |
| Alternatives For Girls Crisis Resource Center, 903 W. Grand Blvd | Walk-in hours on a page last changed 2024; unclear who is served | **resolved** — the page prints the address, phone, Mon–Fri 9am–9pm, "Walk-ins are welcome" and food/clothing/showers/referrals. Who is served is written as the page writes it ("community members in crisis"), with a note that the organisation's other programmes are for girls and young women. No cost is printed | https://alternativesforgirls.org/programs/crisis-resource-center/ |
| Detroit Rescue Mission, 3535 Third St (men) | Own site lists no direct phone | **resolved** — the locations page now prints 866-313-2520 beside 3535 Third Street (males only). It is the same number the City gives shelter seekers (audit A9), and it is DRMM's own choice of number | https://drmm.org/about-us/locations/ |
| DRMM Christian Guidance Center and Genesis House III, 19211 Anglin | CGC is "Men" on one page and "All Male and Female" on another | **half resolved** — the locations page now separates them: **Genesis House III, 19211 Anglin, women, 313-263-0077** is written as a line. The **Christian Guidance Center** is listed with no address at all, so that half **stays held** | https://drmm.org/about-us/locations/ |
| Central City Health, 10 Peterboro St | Site footer © 2020; DWIHN's 2026 list shows 1240 Third Ave | **resolved** — the home page prints 10 Peterboro St with 313-831-3160 and the sliding-fee statement ("No patient is ever denied care due to an inability to pay"). By our rules the owner's own page decides over DWIHN's list. The 1-800 number on that page belongs to someone else and was not recorded | https://www.centralcityhealth.com/ |
| SER Metro-Detroit Justice Impacted Services | sermetro.org blocks scripts | **resolved** — read on SER's own page: 9301 Michigan Ave, 313-846-2240, eligibility (18+, probation/parole or released within 24 months, Detroit or Wayne County), up to $1,000 in supports. No hours printed anywhere on SER's site | https://sermetro.org/program-service/justice-impacted-services/ |
| SER Metro-Detroit Center for Working Families and Adult Education (9301 Michigan; FREC East) | ZIP 48205 vs 48216 for Maddelein | **resolved, ZIP left blank** — both SER pages agree the street number is **15491** Maddelein; the ZIP still differs between SER's own pages, so the line carries no ZIP for geocoding to fill. Two lines written, one per door | https://sermetro.org/adult-education-services/ and https://sermetro.org/locations/ |
| SER Metro-Detroit YouthBuild and Year Round Youth | 5555 Conner printed with three ZIPs | **resolved, ZIP left blank** — 5555 Conner and 9215 Michigan Ave both carry 313-945-5200 on SER's locations page. The Conner ZIP is left blank; ages are not stated on their page, so the line says to call and ask | https://sermetro.org/locations/ |
| SER Metro-Detroit ReBuild Detroit (construction readiness) | Last cohort shown is Nov 10, 2025 | **needs a call** — the page is otherwise complete (9301 Michigan Ave, 313-945-5200 ext. 4299, Mon–Fri 9am–3pm, $700+ stipend, Detroit resident 18+ with a diploma/GED) but still advertises the November 10, **2025** cohort ten months later | https://sermetro.org/program-service/rebuild-detroit/ |
| Detroit at Work career center, W. Warren (ACCESS) | 16427 vs 14627 W. Warren on ACCESS's own pages | **resolved** — ACCESS's contact page prints **16427** W. Warren Avenue, Detroit 48228 with 313-429-2469, and Detroit at Work's locations page prints the same street number. 14627 is the outlier | https://www.accesscommunity.org/contact and https://detroitatwork.com/locations |
| Detroit at Work career center, W. McNichols (MiSide) | Late night Thursday on DAW, Wednesday on MiSide | **resolved** — Detroit at Work names the six centres open late on Thursday and **this is not one of them**, so no late night is published. Still marked REFERRALS ONLY. Address/phone from MiSide's contact page (24424 W. McNichols, 313-246-6020) | https://detroitatwork.com/locations and https://miside.org/contact-us |
| Detroit at Work career center, E. Seven Mile (Ross) | Not on the DAW locations page; may be closed | **should be dropped** — re-read today, Detroit at Work's locations page lists seven centres and E. Seven Mile is not among them. The only phone for it was aggregator-only. No owner evidence it exists | https://detroitatwork.com/locations |
| MiSide Wealth Center for Working Families, 2835 Bagley | 2835 Bagley questioned (DAW says its services moved out Sept 2025) | **resolved** — MiSide's own contact page still lists **MiSide Wealth, 2835 Bagley, Suite 800, Detroit 48216, 313-841-9641**. Whatever Detroit at Work moved out, MiSide is still there | https://miside.org/contact-us |
| MiSide Earn + Learn, 2835 Bagley Suite 800 | Same 2835 Bagley question | **part resolved** — the address is confirmed as above, but Earn + Learn has no phone or hours of its own on any MiSide page. Covered for now by the MiSide Wealth line; stays held as a separate service | https://miside.org/contact-us |
| Goodwill Career Academy, 3111 Grand River | Two phones on Goodwill's own pages | **resolved** — the line publishes 313-557-8635, the number printed beside the address on the page it cites, so the entry check reads the number it is citing. 557-8612 (programme page) noted in the import file | https://www.goodwilldetroit.org/connect/find-a-location/ |
| Goodwill A Place of Our Own Clubhouse, 1401 Ash St | Two phones | **resolved** — same rule: 313-931-0901 is printed beside 1401 Ash Street on the locations page. What the clubhouse offers and who can join were read on Goodwill's own programme page (18+, documented serious mental illness, Detroit or Wayne County) | https://www.goodwilldetroit.org/connect/find-a-location/ and https://www.goodwilldetroit.org/programs/a-place-of-our-own/ |
| SEMCA Michigan Works! Dearborn job center, 6451 Schaefer (inside ACCESS) | Two phones: 313-945-8380 vs 313-203-3366 | **resolved (fact), line not written** — ACCESS, whose building it is, prints "ONE-STOP EMPLOYMENT AND HUMAN SERVICES CENTER, 6451 Schaefer Road, Dearborn, MI 48126, (313) 945-8380" on its own contact page. 313-203-3366 is from the Michigan Works! Association, not the owner. A steward can add the line from this | https://www.accesscommunity.org/contact |
| Ford Resource and Engagement Center East | Ford's page prints both 15941 and 15491 Maddelein | **stays held** — SER, a tenant, prints **15491** on two of its own pages, which is evidence but not Ford's own page. Ford's page still contradicts itself | https://sermetro.org/adult-education-services/ |
| St. Patrick Senior Center daily lunch, 58 Parsons St | No single page has phone + address + the meal facts | **resolved, as written** — the contact page carries 58 Parsons St and (313) 833-7080; the meal facts come from St. Pat's own meals page. Their pages still say five days a week in one place and six in another and never say the meal is free, so the schedule is entered **as written** and the app will say "call first" | https://stpatsrctr.org/contact-us/ |
| Focus: HOPE Food for Seniors, 1300 Oakman Blvd and 9151 Chalmers | Already listed; new facts for a steward | **resolved as a note** — re-read today: all food centres Mon–Thu 8am–4pm, Fri 8am–noon; 60+; monthly income limits $1,957 (1), $2,644 (2), $3,332 (3), +$688 each; apply in person with photo ID and proof of address; 313-494-4600, home delivery 313-494-4980. No new line; the existing rows can take these facts | https://focushope.edu/food-for-seniors/ |
| S.T.A.R. Center methadone clinic | No street address on its own site | **needs a call** — re-read today. The site now gives hours (Mon–Fri 6am–2pm, Thu 6am–noon, Saturdays for dosing only) and cost ("$65/Week"), and takes Medicaid, Medicare and Healthy Michigan — but still prints **no street address anywhere** | https://starcenterinc.org/ |
| Detroit Recovery Project, Westside, 1145 W Grand Blvd | Appointment line printed as 824-8900 and 324-8900 | **needs a call** — the conflict is still live on the same page today: "(313) 324-8900" beside *Westside* and "call us at: 313-824-8900" as the appointment line. Held reason said to confirm before adding, so no line was written. (New fact: Eastside is 1121 E. McNichols with (313) 365-3100.) | https://www.recovery4detroit.com/services/ |
| Centers for Family Development, Samaritan Center, 5555 Conner Ave Ste 1038 | Page does not say the substance use programme runs there | **stays held / needs a call** — re-read today: the page lists both offices (2995 E. Grand Blvd 313-758-0150; Samaritan Center Ste 1038 313-308-0255) and eligibility (Wayne County adults or adolescents with Medicaid), but still never says which site runs the programme | https://centersforfamilydevelopment.org/index.php/programs/mentalhealth/substance.html |
| Detroit Phoenix Center youth drop-in | Drop-in page is JavaScript-only | **needs a call** — the contact page reads fine and gives 1420 Washington Blvd Ste 301, Detroit 48226, 313-482-0916. But the only hours on it are **donation drop-off** hours (Mon and Wed 11am–4pm, at Cody High School), not youth drop-in hours, and no ages are given | https://www.detroitphoenixcenter.org/contact |
| Church of the Messiah (231 E Grand Blvd, Waterworks 1.37 mi) | Church's own site shows no pantry days or hours | **needs a call** — re-read today: 231 East Grand Boulevard, Detroit 48207, (313) 633-5331 and a Sunday service time are on the page; still nothing about a pantry or a meal | https://churchofthemessiahdetroit.org/ |
| Urban League Workforce Career Development Center, 15770 James Couzens | No page has both the address and a phone | **should stay held** — the page reads fine and gives the address and the services, but there is **no phone on it at all**: it sends people to an online form. A job centre with no number is thin help; a steward should decide | https://www.deturbanleague.org/wcdc |
| Center for Employment Opportunities (CEO) Detroit | Site blocks scripts | **needs a browser** — ceoworks.org answered HTTP 403 to an honest WebFetch too. Not worked around | https://www.ceoworks.org/locations/detroit |
| Wayne County Clerk, Birth and Death Records, 400 Monroe St, Suite 605 | waynecountymi.gov refused our script (403) | **needs a browser** — and the ground has moved: **waynecounty.com is retired**. Every Clerk page (`birth-certificates.aspx`, `contact-us.aspx`, `birth-records.aspx`) now 302-redirects to `utility.waynecountymi.gov/wc_redirect.html`, a notice page with no content, and waynecountymi.gov itself refuses honest requests. A search result also hints the Detroit records counter may now be **640 Temple Street, Suite 625** rather than 400 Monroe — that is an aggregated hint, **not a source**, and must be checked on the Clerk's own page | https://www.waynecounty.com/elected/clerk/birth-certificates.aspx (302) |
| Capuchin shower program, Meldrum / Capuchin Soup Kitchen shower program (already held) | Page said "soon to" re-open; site 403s | **needs a browser** — cskdetroit.org still answered HTTP 403 to an honest WebFetch today | https://www.cskdetroit.org/services-offerings/shower-program/ |

## Needs a browser (verbatim list for the agent that owns the browser)

1. **https://www.ceoworks.org/locations/detroit** — Center for Employment Opportunities, Detroit.
   Look for, on CEO's own page: the **street address with city and ZIP**, a **public phone number**, the hours, who
   is eligible (is it parole/probation referral only, or can someone walk in?), and whether the transitional work is
   **paid daily**. Do not take any of this from a search snippet.

2. **https://www.waynecountymi.gov** → the **County Clerk's Vital Records / birth certificates** page.
   waynecounty.com is retired and every Clerk page now redirects here. Look for: the **street address and suite**
   where a person picks up a Detroit, Dearborn, Hamtramck or Highland Park **birth certificate** (our held row says
   400 Monroe St, Suite 605; a search result hints at 640 Temple Street, Suite 625 — confirm which on the Clerk's
   own page), the **public phone number** (we have 313-224-0270 only from the City's page), the **counter hours**,
   the **fee** for a certified copy, **what ID you must bring**, and whether there is any **fee waiver for a person
   without housing**. Also note whether same-day service is offered.

3. **https://www.cskdetroit.org/services-offerings/shower-program/** — Capuchin Soup Kitchen shower program, Meldrum.
   Look for: whether the shower program **is running now** (the old text said "soon to" re-open), the **days and
   hours**, the **street address**, and a **phone number**. While there, also open
   **https://www.cskdetroit.org/en/services-offerings/jefferson-house/** and check whether it prints **313-331-8900**
   and whether Capuchin's own page publishes the Jefferson House street address.

## Needs a phone call (with the question to ask)

1. **SER Metro-Detroit ReBuild Detroit**, 313-945-5200 — *"When does the next ReBuild Detroit apprenticeship
   readiness cohort start? Your page still lists November 10, 2025."* (Everything else on the page is usable.)
2. **Detroit Recovery Project, Westside**, 1145 W Grand Blvd — *"Which number do I call for an appointment at the
   Westside office: 313-324-8900 or 313-824-8900?"* Both are printed on the same page today. Never publish 824
   until this is settled.
3. **S.T.A.R. Center**, 313-493-4410 — *"What is the street address of your clinic?"* Their own site has hours and
   a price but no address at all.
4. **Detroit Phoenix Center**, 313-482-0916 — *"What days and hours is the youth drop-in open, what ages is it for,
   and is it at 1420 Washington Blvd?"*
5. **Church of the Messiah**, 313-633-5331 — *"Do you run a food pantry, and on what days and at what times?"*
6. **Centers for Family Development**, 313-758-0150 — *"Does the substance use programme run at the Samaritan
   Center on Conner, at East Grand Blvd, or both?"*
7. **Christian Guidance Center (DRMM)**, 313-263-0077 — *"What is the street address of the Christian Guidance
   Center, and does it take men, women, or both?"* Their locations page gives it no address.

## Two things worth a steward's eye

- **Wayne County's website has moved.** `waynecounty.com` is retired and redirects into `waynecountymi.gov`, which
  refuses honest automated requests. Three held rows depend on it (the Clerk's vital records, the Prosecutor's
  Victim Services Unit, Veterans Services). All three now need a person with a browser, not a re-run.
- **`sermetro.org` answers an honest WebFetch but not the pipeline's fetcher.** The four SER lines will not
  auto-promote through `check:sources`. Per `docs/OPERATIONS.md`, a steward opens each `source_url` once and sets
  `status=active`, `entry_method=web`.
