# Jobs lane A: public workforce system and job-loss benefits

Researched 2026-09-19 for 313 Help. Every fact below was read from the owner's own page with
`curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'` unless marked
otherwise. Aggregators (findhelp, Yelp, Waze, careeronestop, news) were used only to find candidates;
any fact that appears only there is labeled **aggregator-only** or **news-only**.
Staff names, emails and direct lines seen on pages were deliberately **not** recorded.

---

## Landscape (read this first)

A federal law called **WIOA** (Workforce Innovation and Opportunity Act) sends job-training money to
states. Michigan's Department of Labor and Economic Opportunity (**LEO**) passes it to **16 local
"Michigan Works! Agencies"**. Each one is overseen by a local workforce board and runs free walk-in or
appointment offices that are also branded as federal **American Job Centers**. **Our four cities are
split between two of these agencies.** **Detroit** is its own area ("Region M"). The Mayor's Workforce
Development Board oversees it, and the nonprofit **Detroit Employment Solutions Corporation (DESC)**
runs it. DESC's public brand is **Detroit at Work**: one call center, 313‑962‑WORK (9675), plus
**7 career centers** that DESC hires neighborhood nonprofits to operate (Gesher, ACCESS, MiSide,
SER's SERCO, Payne Pulliam, DCC, and possibly Ross). **Dearborn, Hamtramck and Highland Park** belong
to **SEMCA Michigan Works!** ("Region P"). SEMCA serves Wayne and Monroe counties *excluding the City
of Detroit* and has American Job Centers in **Dearborn** (6451 Schaefer, inside ACCESS) and
**Highland Park** (144 Manchester). The Downriver Community Conference (DCC) runs both. There is no
Hamtramck office; the Highland Park center is the nearest. (Correction to the brief: "Michigan
Works! Southeast" is a *different* agency, based in Ann Arbor and serving Washtenaw, Livingston,
Jackson, Lenawee and Hillsdale. It does not serve Dearborn.)

**How training is paid for:** eligible adults get a WIOA **Individual Training Account** (a voucher
for an approved program; DESC caps it at **$6,000 per year**, per DESC's 2024–27 plan revised July
2026), or a seat in a class DESC has contracted. PATH (cash-assistance families), SNAP work programs,
and Trade Adjustment Assistance also pay for training. State scholarships sit on top of that:
**Michigan Reconnect** (age 21+), the **Michigan Achievement Scholarship** (recent high school grads),
and **Detroit Promise** (Detroit grads).

**Other parts of the system:**
- **Unemployment pay (UIA)** is a separate state agency. To keep getting paid, a claimant must make a
  profile on **Pure Michigan Talent Connect** and meet Michigan Works! staff.
- **People with disabilities** go to **MRS**, and **blind people** to **BSBP**. Both are state
  agencies (WIOA Title IV).
- **Veterans** get state "Veterans' Career Advisors" who work inside Michigan Works! offices.
- **Adults 55+** use **SCSEP** (DAAA, The Senior Alliance, AARP Foundation/NCBA, Urban League).
- **Young people** have **Job Corps** (federal, live-in), **GDYT** (City of Detroit summer jobs) and
  **YouthBuild**.

### Who serves which city

| Need | Detroit | Hamtramck | Highland Park | Dearborn |
|---|---|---|---|---|
| Michigan Works! / American Job Center | Detroit at Work (DESC), 7 centers | SEMCA (no local office; nearest is Highland Park AJC) | SEMCA Highland Park AJC | SEMCA Dearborn AJC |
| Adult training money (WIOA) | DESC | SEMCA | SEMCA | SEMCA |
| Youth year-round | Detroit at Work (14–24); "Some programs accept Highland Park and Hamtramck residents" | same note + SEMCA youth | same note + SEMCA youth | SEMCA youth |
| YouthBuild (17–24) | yes | yes (stated) | yes (stated) | no |
| GDYT summer jobs | yes (Detroit residents only) | no, GDYT sends non-Detroit youth to SEMCA | no, same | no, same |
| PATH (cash assistance) | Detroit at Work centers | SEMCA | SEMCA | SEMCA |
| UIA office | Detroit Local Office, Cadillac Place | same | same | same (Detroit is closest) |
| SCSEP (55+) | DAAA; AARP Fdn/NCBA; Urban League | DAAA | DAAA | The Senior Alliance; AARP Fdn/NCBA; Urban League |
| Project Clean Slate | yes (Detroit residents) | no | no | no |
| Detroit Promise | yes | no | no | no |

---

## Part 1: Places (a street address people go to)

Status key: **verified-on-own-page** = the phone and street address are both plain text on the
owner's (or the operator's) page and I read them. **partial** = something is missing or
contradicted. **unverified** = only aggregators or news.

### Detroit at Work career centers (DESC, Michigan Works! Region M)

Shared facts for P1–P7 (all from https://detroitatwork.com/locations, HTTP 200, `dateModified`
2026-09-11):
- **Offers (plain words):** "Free help finding a job, getting training, and getting help with ID,
  rides and child care."
- **Cost:** free. Training is free if you qualify.
- **Eligible:** adults; most programs require **Detroit residents**. Proof you may work in the US is
  needed for services (help page).
- **Phone (as printed):** `313-962-WORK (9675)` in the header, and `Please call 313-962-9675 to
  schedule an appointment for career coaching and casas testing.` This is the central call center and
  is what the page gives for every center.
- **Hours (as printed):** `Career Center Hours: Monday-Friday, 8 a.m.-5 p.m.`, plus
  `The following locations are open until 7 p.m. on Thursdays: Collingwood, Connor, E. Warren, Meyers, Michigan Ave.,  and W. Warren`,
  plus `All career centers are open late on Thursday 5-7pm.` (the two late-hour lines disagree about
  McNichols).
- **How to start:** call to book an appointment, or register online first
  (https://desclaunchpad.my.site.com/detroitatwork). The page says "Serving customers both in person
  and virtually." DCC's page says Detroit visits are "by APPOINTMENT ONLY".
- **Checker page:** https://detroitatwork.com/locations. Every street number and `313-962-9675`
  appear as plain text.
- **Unemployment help:** centers marked `*` offer "Unemployment Insurance Assistance".
- **2026 closures (as printed):** Jan 1, Jan 19, Feb 16, May 25, Jun 19, Jul 3, Sep 7, **Nov 3
  (Election Day)**, **Nov 11**, Nov 26, **Nov 27**, **Dec 24**, Dec 25, **Dec 31**. Worth encoding as
  closure dates.

| # | Center | Street address | Operator (source) | Note on DAW page | UIA help | Status |
|---|---|---|---|---|---|---|
| P1 | Meyers (Northwest Activities Center) | 18100 Meyers, Detroit 48235 | SERCO (SER Metro subsidiary). Source: SER's page, which is browser-only; search snippet only | none | yes `*` | verified-on-own-page (address+phone); operator unverified |
| P2 | E. Warren | 18017 E. Warren, Detroit 48224 | Payne Pulliam School. DESC partners page says PPS runs "an Eastside Career Center"; the address match is aggregator-only | none | yes `*` | verified (address+phone); operator partial |
| P3 | Conner (at WCCCD Eastern campus per MWDB page) | 5901 Conner, Detroit 48213 | DCC per search snippet only | `JOB SEARCH HUB` | no | verified (address+phone); operator unverified |
| P4 | Collingwood (Durfee Innovation Society) | 2470 Collingwood, Detroit 48206 | **Gesher Human Services**, confirmed on https://www.geshermi.org/careers-employment/ ("Collingwood / Detroit at Work") | none | yes `*` | verified-on-own-page |
| P5 | Michigan Ave (Southwest) | 9301 Michigan Ave, Detroit 48210 | **SERCO / SER Metro-Detroit**. DESC partners page names "our Michigan Avenue location" as SER's main office campus. Bilingual staff (DAW Bagley page) | none | yes `*` | verified-on-own-page |
| P6 | W. Warren | 16427 W. Warren, Detroit 48228 | **ACCESS**, confirmed on https://www.accesscommunity.org/contact ("ACCESS DETROIT CAREER CENTER … Michigan Works!; Workforce Development", `Phone: (313) 429-2469`) | none | yes `*` | verified-on-own-page (two phones exist, see contradictions) |
| P7 | W. McNichols | 24424 W. McNichols, Detroit 48219 | **MiSide** (formerly Development Centers / Southwest Solutions), confirmed on https://miside.org/miside-wealth/career-center (`313 - 246-6020`; `open Monday through Friday from 8AM to 5PM . On Wednesday, we're open until 7PM.`) | **`REFERRALS ONLY`** | no | verified-on-own-page; hours contradict DAW |

**P8, E. Seven Mile (Ross Innovative Employment Solutions): 14117 E. Seven Mile, Detroit 48205.
Status: unverified, possibly closed.** This center is **not** on the DAW locations page. It still
appears on the Michigan Works! Association Region M page (https://www.michiganworks.org/region-m,
200) and the stale Mayor's Workforce Board page, and DAW's own FAE&T page (2025-01-22) says "Get
connected to the three locations - Collingwood, E. 7mile, and Meyers". Operator and its phone
(313-308-0799) are aggregator-only. **Do not publish until a person calls 313-962-9675 and asks.**

**Closed: 2835 Bagley (Michigan Welcome Center).** https://detroitatwork.com/bagley-services-transition
(dateModified 2025-09-12) says Detroit at Work services there moved out "from September 30th". The
building is still run by MiSide Wealth. The Mayor's Workforce Board page
(https://workforcedetroit.com/key-initiatives/detroit-at-work/) still lists it. If any seed or
aggregator row has 2835 Bagley as a Detroit at Work center, **archive it with reason "moved"**.

**Flex (pop-up) sites, 1–3 p.m. on listed dates.** These are on the same DAW locations page: Campbell
Library (8733 W. Vernor), Mexican Mercado CDC (2826 Bagley), Redford Initiative (12065 Outer Drive),
Brilliant Detroit Brightmoor (15509 Heyden), DPL "Chandler Park Branch" (**printed as 5201 Woodward,
which is the Main Library's address; Chandler Park is a different branch, so this is a typo on their
page**), Latino Family Services (1145 Lawndale), and Butzel Family Center (7737 Kercheval). These
suit an *events* feed better than place rows. The date lists run Aug–Dec 2026 as printed.

### SEMCA Michigan Works! (Region P: Dearborn, Highland Park, and Hamtramck by area)

**P9. SEMCA Michigan Works! Dearborn American Job Center: verified on operator's page; SEMCA's own
page needs a browser**
- **Offers:** "Free help finding a job, and money for job training if you qualify." The same building
  is ACCESS's "One-Stop Employment and Human Services Center".
- **Cost:** free. **Eligible:** Dearborn and other Wayne County residents outside Detroit (SEMCA area).
- **Address:** 6451 Schaefer Rd., Dearborn, MI 48126. The MWA page adds "2nd Floor"; search snippets
  add "(Inside ACCESS)".
- **Phone (as printed on DCC page):** `Phone: 313-945-8380`. ACCESS prints `(313) 945-8380`. The
  Michigan Works! Association page prints `313.203.3366` (**contradiction**).
- **Hours (as printed):** `Monday - Friday: 8:00 AM - 5:00 PM`
- **Walk-in vs appointment:** not stated for Dearborn on DCC's page. The only "APPOINTMENT ONLY" text
  there is under the *Detroit* heading. An old DCC workforce page says "Walk-in Service Available" but
  also carries COVID mask rules, so it is stale.
- **Checker page:** https://dccwf.org/locations/ (HTTP 200). Also https://www.accesscommunity.org/contact (200).
- **Owner page:** https://semcamiworks.org/american-job-center/dearborn/ returns **403 to scripts**; a
  person must check it.

**P10. SEMCA Michigan Works! Highland Park American Job Center: verified on operator's page**
- **Offers / cost:** same as P9. **Serves:** Highland Park, and it is the nearest SEMCA center for
  **Hamtramck**.
- **Address:** 144 Manchester St., Highland Park, MI 48203
- **Phone (as printed):** `Phone: 313-826-0299`, which matches the MWA page `313.826.0299`.
- **Hours (as printed):** `Monday - Friday: 8:00 AM - 5:00 PM`
- **Checker page:** https://dccwf.org/locations/ (200). The SEMCA page
  https://semcamiworks.org/american-job-center/highland-park/ returns **403**.

### Unemployment, disability, veterans

**P11. Michigan UIA: Detroit Local Office (Cadillac Place): verified-on-own-page**
- **Offers:** "Free in-person help with an unemployment claim."
- **Cost:** free. **Eligible:** anyone with a Michigan unemployment claim, from any of our 4 cities.
- **Address:** `3024 W. Grand Blvd., Suite L-385, Detroit, MI 48202` (Sept 14, 2026 release). The
  Nov 17, 2025 release says "first floor at Cadillac Place, 3024 W. Grand Blvd."
- **Phone:** UIA does not give this office its own line. The statewide customer line is
  `Call 1-866-500-0017, Monday - Friday, 8 a.m. to 4:30 p.m.` TTY is `1-866-366-0004`.
- **Hours (as printed):** `All offices are open Monday through Friday, 8:00 a.m. – 5:00 p.m. Walk-ins will be accepted until 4:20 p.m., or as capacity allows.`
- **Walk-in vs appointment:** both. "Appointments remain the priority, but walk-ins are welcome as
  capacity allows." Visitors show photo ID to a guard. Appointments open up to 14 days ahead. There
  are self-service kiosks.
- **Checker page (both the address and the phone):**
  https://www.michigan.gov/leo/news/2025/11/17/detroit-unemployment-office-reopens-featuring-an-improved-user-experience
  (200). The hours and suite number are on
  https://www.michigan.gov/leo/news/2026/09/14/new-walk-in-option-available-at-all-unemployment-offices
  (200; that page lacks the phone).
- **Blocker:** the official office finder
  (https://www.michigan.gov/leo/bureaus-agencies/uia/contact/local-uia-offices) is a **JavaScript
  shell**. The list loads by script, so a person needs a browser to read it.

**P12. Bureau of Services for Blind Persons (BSBP): Detroit office: verified-on-own-page**
- **Offers:** "Free job training and job help for people who are blind or have low vision."
- **Cost:** free if eligible. **Eligible:** Michigan residents who are blind or visually impaired.
- **Address:** Cadillac Place, `3038 W. Grand Boulevard, Suite 4-450`, Detroit, MI 48202-6038
- **Phone (as printed):** `313-456-1646` (Detroit office). Statewide: `800-292-4200 or 517-241-1100`.
- **Hours:** not printed. **Walk-in or appointment:** not stated.
- **Checker page:** https://www.michigan.gov/leo/bureaus-agencies/bureau-of-services-for-blind-persons/bsbp-office-information (200)

**P13. Michigan Rehabilitation Services (MRS): Detroit/Dearborn offices: unverified (browser needed)**
- **Offers:** "Free help for people with disabilities to get ready for, find, and keep a job."
- **Phones (as printed on MRS home):** `Main phone: 517-241-5324`, `Toll-free phone: 800-605-6722`.
  Apply online through the MRS Online Application.
- The **office locator** (https://www.michigan.gov/leo/bureaus-agencies/mrs/office-locator) is a
  **JavaScript shell** with no addresses in its HTML. One search snippet gives "17411 Grand River Ave,
  Detroit 48227" (**aggregator-only; do not use**). **For now, ship MRS as a link-out.** A person must
  pull the Detroit, Dearborn or Taylor office rows in a browser.

**P14. VA Detroit Regional Benefit Office: Veteran Readiness & Employment (VR&E): verified-on-own-page**
- **Offers:** "Free job and school help for veterans with a service-connected disability, plus help
  with VA benefits."
- **Eligible:** veterans, service members and families.
- **Address:** `477 Michigan Avenue, Patrick V. McNamara Federal Building, 12th Floor`, Detroit, MI 48226
- **Phone (as printed):** `Call our VA benefits hotline at 800-827-1000 ( TTY: 711 ). We're here 8:00 a.m. to 9:00 p.m. ET, Monday through Friday.`
  The page's "main phone" is in a `<va-telephone contact="8008271000">` web component, so digit
  matching works on the HTML.
- **Hours (as printed):** `Mon : 8:00 a.m. to 4:00 p.m.` through `Fri : 8:00 a.m. to 4:00 p.m.`, and
  `Sat : Closed` / `Sun : Closed`.
- **Walk-in or appointment:** "available to be seen on a walk-in or appointment basis". VR&E is on
  the 12th floor.
- **Checker page:** https://www.va.gov/detroit-va-regional-benefit-office/ (200; redirected from
  benefits.va.gov/detroit). Last updated: November 13, 2025.

### Youth

**P15. Detroit Job Corps Center: partial (open status uncertain)**
- **Offers:** "Free live-in job training and high school diploma help for young people 16–24."
- **Eligible (as printed):** `are 16 through 24 years old`, `are low-income individuals`, plus
  citizenship or residency and background requirements.
- **Address:** `11801 Woodrow Wilson St`, Detroit, MI 48206
- **Phone (as printed):** `800-733-5627` (national admissions line, also shown as 800-733-JOBS) and
  `877-889-5627 TTY`. No local number is on the page.
- **Hours:** not printed. **How to start:** apply online or call.
- **Checker page:** https://detroit.jobcorps.gov/ (200)
- **Caveat:** the Labor Department paused contractor-run centers, including Detroit, in mid-2025. A
  search summary says a settlement filed Aug 10, 2026 rescinded the pause (**news/aggregator-only;
  not confirmed**). The center page itself shows no pause notice. **A person should call before we
  show it as enrolling.**

### Older workers (SCSEP, 55+)

The DESC 2024–27 plan (revised July 2026) lists SCSEP in our area as **Detroit Area Agency on Aging
1-A**, **The Senior Alliance 1-C**, the **AARP Foundation** (Wayne), and the **Urban League of Detroit
& SE Michigan** (Wayne).

**P16. Detroit Area Agency on Aging (DAAA): SCSEP: verified-on-own-page**
- **Offers:** "Paid part-time job training (about 20 hours a week) for people 55 and older with low income."
- **Cost:** free; the participant is *paid* minimum wage. **Eligible:** unemployed, 55+, under the
  income limits. Printed limits: 1 person $18,225; 2 people $24,650; 3 people $31,075. Those look like
  **2023** figures (125% of the poverty line), so they are **likely stale**.
- **Serves (DAAA areas page):** Detroit, **Hamtramck, Highland Park**, Harper Woods and the five
  Grosse Pointes.
- **Address:** `1333 Brewery Park Blvd., Ste 200`, Detroit, MI 48207
- **Phone (as printed):** `(313)446-4444` for SCSEP info, which is also the DAAA main line.
- **Hours:** not printed on this page.
- **Checker page:** https://www.detroitseniorsolution.org/programs/senior-community-service-employment-program-scsep/ (200)

**P17. The Senior Alliance (Area Agency on Aging 1-C): SCSEP: verified-on-own-page (main line)**
- **Offers / cost:** same kind of program as P16. **Eligible:** 55+, unemployed, under the income
  limits, and "registration with Michigan Works". **Serves:** **Dearborn** and the rest of Wayne
  County outside the DAAA area.
- **Address:** `3200 Greenfield Rd. Suite 100`, Dearborn, MI 48120
- **Phone (as printed):** `734.722.2830` (main). The page also lists a named staff member's direct
  line for SCSEP, which I **did not record** per the rule.
- **Hours (as printed):** `Monday – Friday | 8:30 a.m. – 4:30 p.m.`
- **Checker page:** https://thesenioralliance.org/services/senior-community-service-employment-program/ (200)

**P18. NCBA / AARP Foundation SCSEP: Detroit office: verified-on-own-page (operator relationship unclear)**
- **Offers:** paid part-time job training for people 55+ with low income. NCBA's page says priority
  goes to veterans, people over 65, people with disabilities, and others.
- **Address (as printed):** `The National Caucus and Center on Black Aging, Inc. AARP Foundation SCSEP 407 E. Fort Street, Suite 401 Detroit, MI 48226`
- **Phone (as printed):** `(313) 964-4821 Main`. The same block also prints a cell number, which I
  did not record.
- **Hours:** not printed for Michigan. **How to start:** an online inquiry form or call.
- **Checker page:** https://ncbainc.org/michigan-office/ (200)
- **Unclear:** the page names both NCBA and "AARP Foundation SCSEP". Findhelp lists the same address
  as "AARP Foundation – Detroit Office" covering Wayne County. aarp.org returned 200 but I did not
  confirm the address there. A person should confirm which organization answers.

**P19. Urban League of Detroit & SE Michigan: Urban Seniors Jobs Program (SCSEP): partial (phone only)**
- **Offers:** "Paid job training for people 55+ with low income." **Eligible (as printed):** `55 or
  older, low income, a resident of Wayne or Oakland County`.
- **Phone (as printed):** `313-831-5591`. **No street address on the page**, so it fails the checker.
- **Page:** https://www.deturbanleague.org/usjp (200, Wix site). Treat it as a link-out plus phone
  until a person finds an address on the owner's site.

---

## Part 2: Link-outs (programs you start online or by phone)

**L1. Detroit at Work: sign up and call center.** Anchor link-out for Detroit residents.
- https://detroitatwork.com/ (200). Register at https://desclaunchpad.my.site.com/detroitatwork.
- Phone `313-962-WORK (9675)`. Accessibility line `1-800-285-WORK. TTY: 711.`
- **Plain words:** "Free help finding a job or free training. Call or sign up online, then meet a
  career coach."
- The online account asks for the resident's email. That happens on their site, not ours.

**L2. Detroit at Work: job fairs and hiring events.** https://detroitatwork.com/events/jobfairs (200).
- Current listings as of 2026-09-19:
  - Sep 23, 10–1: Collingwood center. A job fair at Durfee "including felony-friendly employers".
  - Sep 24, 10–1: W. Warren center.
  - Sep 30 and Oct 28: military community job fairs at the Radisson in Southfield. Southfield is
    **outside our service area**.
- The listings carry staff emails and direct lines; **do not scrape those**. This suits an events
  feed, but a steward should enter the events by hand.

**L3. Detroit at Work: free job training (WIOA "training scholarships" / ITAs).** https://detroitatwork.com/training (200; dateModified 2026-09-17).
- **Plain words:** "Free job training in health care, IT, trucking, building trades and factory work
  for Detroiters who qualify."
- **Cost:** free if eligible. The funding cap is **$6,000 per year per person**, per the DESC plan
  (https://descmiworks.org/wp-content/uploads/DESC-regional-local-plan-PY-2024-through-2027-midcycle-revised-5-July-2026-clean-copy.pdf, p.131).
- **How to start:** call 313-962-9675. "Training programs are subject to change."
- **Stale:** the provider table on the page still shows **2025–26 dates** (Oct 2025 to Jun 2026) under
  "Current Fall/Winter Offerings". Link to the page; **do not copy the class list**.

**L4. Detroit at Work: GED / high school completion ("Learn to Earn").** https://detroitatwork.com/adult-education-gedhigh-school-completion (200; 2025-10-14).
- Free classes with Detroit Public Schools Community District (DPSCD) and other providers; in person,
  virtual or hybrid, day or evening.
- **As printed:** "the stipend portion of the program is currently closed", so **there is no pay right
  now**.
- **How to start:** sign up online. A center calls "within 3 days", then gives a reading and math test.
  Bring ID and your Social Security card.
- Lane D covers adult education in depth.

**L5. Detroit at Work: year-round youth program / WIOA Youth (ages 14–24).** https://detroitatwork.com/youth (200; 2026-06-03).
- Free help finishing school, job training, and paid work experience.
- **As printed:** `Participants must live in Detroit, be 14 – 24 years old … Some programs accept
  Highland Park and Hamtramck residents as well.`
- The youth provider list (https://detroitatwork.com/youth-providers, dateModified 2024-09-25, may be
  stale) is:
  - The Youth Connection, 300 River Place Dr Ste 1440
  - The Yunion, 1129 Oakman Blvd (printed as "Okman")
  - SER Metro East, 5555 Conner
  - SER Metro West, 9215 Michigan Ave
  - Urban Neighborhood Initiatives, 8300 Longworth
  - YMCA, 1401 Broadway Ste 3A
- Lane C covers youth.

**L6. Detroit at Work YouthBuild (ages 17–24).** https://detroitatwork.com/youthbuild (200; 2025-04-14).
- A paid pre-apprenticeship in building trades with GED help and job placement.
- **As printed:** `If you're a resident of Detroit, Highland Park, or Hamtramck, and between the ages
  of 17-24`.
- You apply through MiSide or SER youth programs.

**L7. Grow Detroit's Young Talent (GDYT): summer jobs.** https://gdyt.org/ (200).
- **As printed:** `ages 14 to 24. The 2026 GDYT Summer Youth Employment Application will open from
  March 13th – May 15th 2026.` That window is **closed now**; expect the next one in spring 2027.
- **Eligible:** `Live in the City of Detroit`. You can apply at 13 if you turn 14 by July 1. No income
  test. A lottery picks participants.
- **Pay:** $12.50–$15 an hour, or a $1,500–$2,000 stipend. Up to 120 hours over about 6 weeks,
  July–August.
- **Non-Detroit youth:** the GDYT youth page sends "non-Detroit residents ages 14 – 24" to
  **SEMCA's Youth Program** (SEMCA's site is browser-only).
- Contacts: DESC `+313.664.5575`; Connect Detroit `+313.967.5887`.

**L8. Detroit at Work: C.H.O.I.C.E.S. (ages 18–24).** https://detroitatwork.com/youth-services (200; 2026-05-11).
- Case management and job placement for young Detroiters "impacted by the justice system, school
  discipline, or community violence."
- The page gives no phone, so use 313-962-9675. It also covers JMG and WIOA Youth.

**L9. Detroit at Work: career services for people coming home from prison.** https://detroitatwork.com/help (200; 2026-02-04).
- **As printed:** for people released from state prison "within the last 5 months", or paroling in the
  next two months. Offers training, paid internships and bus help.
- **Phone:** `call 313-922-2232`. Lane C covers reentry.

**L10. Detroit at Work: expungement help.** https://detroitatwork.com/expungement-services (200; **dateModified 2022-04-11, old**).
- "FREE expungement"; call `313-962-WORK (9675)`. The page says it takes "up to 12 months".
- This appears to route to Project Clean Slate (L20). The eligibility text dates from 2021 law.

**L11. Detroit at Work: Food Assistance Employment & Training (FAE&T / SNAP E&T).** https://detroitatwork.com/food-assistance-employment-and-training (200; 2025-01-22).
- **As printed:** for people getting food assistance, "between the ages of 18 and 59, do not receive
  cash benefits from MDHHS". Job search help, training, and clothing, tools and transportation.
- Contact is a form or a call to DAW. It names "Collingwood, E. 7mile, and Meyers"; see P8.

**L12. Detroit at Work: T.R.A.D.E. Connect (union apprenticeship pipeline).** https://detroitatwork.com/detroit-at-work-trade-connect (200; 2026-08-04).
- Two weeks of readiness, then a 4-week pre-apprenticeship (Focus: HOPE, Goodwill, Build MI Future),
  then a 4-month paid interim apprenticeship with the Carpenters union.
- Start with the interest form. The page gives only a staff email; **do not record it**.

**L13. Detroit at Work: Construction Fast Track (STEP/Executive Order hiring).** https://detroitatwork.com/fast-track (200; 2025-01-30).
- Connects Detroiters to construction jobs under the City's executive order.
- Printed hours `Monday - Thursday 8:30 am – 4:30 pm`, call center 313-962-9675. The page also lists
  a staff cell phone, which I did not record.
- **STEP itself:** the City page
  (detroitmi.gov/…/construction-outreach-team/skilled-trades-employment-program) now returns 403 "We
  can't find the page". **DRAP:** there is no current page on detroitatwork.com (`/drap` is 404).
  Treat both names as retired unless a person finds a current page.

**L14. Michigan UIA: file or manage an unemployment claim.**
- https://www.michigan.gov/leo/bureaus-agencies/uia (200). You file and certify in **MiWAM**. The
  newer **MiUI** system is live for employer tax, and the page says claimants move over later.
- Phone `1-866-500-0017` (M–F 8–4:30), TTY `1-866-366-0004`. Appointments:
  https://www.michigan.gov/leo/bureaus-agencies/uia/schedule-an-appointment.
- **Register to Work rule (as printed):** make a Pure Michigan Talent Connect profile, then "Meet with
  staff from your local Michigan Works! office … at least one business day before the first
  certification." Page:
  https://www.michigan.gov/leo/bureaus-agencies/uia/uia-resources-for-claimants/finding-employment-work-search/register-to-work-requirement (200).
- **This is a key link:** Detroit at Work centers marked `*`, and the SEMCA AJCs, meet this rule.
- There is also free legal help for UIA appeals (the "Advocacy Program"), linked from the UIA contact
  page.

**L15. Pure Michigan Talent Connect (MiTalent.org): state job board.** https://www.mitalent.org/ (200).
- Search jobs and post a resume. Required for UIA claimants.
- Printed contact: `1-833-727-3495`. It also hosts **Michigan Training Connect**, the state list of
  approved training.

**L16. Michigan Works! statewide line.** https://www.michiganworks.org/michigan-works-network (200).
- `Call your One-Stop Service Center at 800-285-WORKS (9675)`. A good fallback for anyone unsure which
  agency covers them.

**L17. Michigan Rehabilitation Services (apply online).** https://www.michigan.gov/leo/bureaus-agencies/mrs (200). Toll-free `800-605-6722`. See P13.

**L18. Veterans' Employment Services (state staff inside Michigan Works!).** https://www.michigan.gov/leo/bureaus-agencies/wd/veterans (200).
- Veterans' Career Advisors and LVERs. **Priority of Service:** veterans and eligible spouses come
  first for all Labor Department-funded job services. They should "identify yourself as such to the
  Michigan Works! Service Center staff."
- Phone `1-800-285-WORKS (9675)`.
- **Michigan Veterans Affairs Agency:** `1-800-MICH-VET (1-800-642-4838)`, `Monday through Friday,
  8 a.m. to 4:50 p.m.`, from https://www.michigan.gov/mvaa (200). The michiganveterans.com server
  **refused the connection** (curl exit 7).
- I found no Detroit-specific veterans job office beyond P14 and the Michigan Works! centers. Lane C
  covers veterans.

**L19. MDHHS PATH (work program for families applying for cash assistance / FIP).**
- https://www.michigan.gov/mdhhs/assistance-programs/cash/path (200) and
  https://www.michigan.gov/leo/bureaus-agencies/wd/programs-services/partnership-accountability-training-hope- (200).
- **Plain words:** "If you apply for cash help (FIP), you first spend 10 days working with Michigan
  Works! on a job plan."
- **In Detroit**, the DESC plan says PATH services "are provided at the Detroit at Work One-Stop
  Service Centers"; the WIOA and PATH programs "are integrated at one location". **In Dearborn,
  Hamtramck and Highland Park**, PATH goes through SEMCA.
- People don't sign up for PATH on their own; MDHHS refers them. I found no PATH-specific address or
  phone on an official page.

**L20. Project Clean Slate (City of Detroit): free expungement.** Partial: phone only, no street address on the current page.
- https://detroitmi.gov/government/mayors-office/mayors-initiatives-and-programs/project-clean-slate (**HTTP 200 to curl in this session**).
- **Plain words:** "Free lawyers to help Detroit residents clear old convictions, which makes it easier
  to get a job."
- **Eligible:** current City of Detroit residents.
- **Phone (as printed):** `(313) 237-3024`.
- **How to start:** the online "Register Now" form. Updates go out by email every Tuesday.
- **Stale address:** "2 Woodward Ave, Suite 500 … (313) 224-4550" appears only on old
  law-department pages. Those now redirect to `…/project-clean-slate-unpublished/…` with **403**, so
  **do not use that address or number**.
- The About page lists staff names; I did not record them.

**L21. Michigan Reconnect.** https://www.michigan.gov/reconnect/about (200).
- **One line:** free tuition at your in-district community college (a discount out of district) if you
  are **at least 21**, **have lived in Michigan at least one year**, have a diploma or GED, and **don't
  already have an associate or bachelor's degree**.

**L22. Michigan Achievement Scholarship / Skills Scholarship / Community College Guarantee.** https://www.michigan.gov/mistudentaid/programs/michigan-achievement-scholarship (200).
- **One line:** for Michigan residents who finished high school or a GED **in 2023 or later**.
- The Community College Guarantee is tuition-free community college regardless of income.
- The Skills Scholarship pays up to $2,000 a year for 2 years of career training; you must enroll
  within 15 months of graduating. The university award is up to $5,500 a year.
- Career-training page: https://www.michigan.gov/mistudentaid/programs/michigan-achievement-scholarship/career-training

**L23. Detroit Promise.** https://www.detroitpromise.com/ (200).
- **One line:** a last-dollar scholarship for Detroit residents who graduate from a Detroit high
  school. It covers tuition for an associate degree, bachelor's degree or technical certificate at 32
  Michigan colleges.
- **As printed:** `As of July 1, 2026 , the Detroit Promise application is closed … The application
  will reopen in November 2026`. Community-college applicants can still use the contact form.
- Phone `313.596.0373`; the mailing address is a PO box (48232-0840).
- DAW's copy (https://detroitatwork.com/node/6653201) is **from 2021 and stale**.

---

## Part 3: Programs that are closed, gone, or stale (do not list as open)

| Program | Evidence | What to do |
|---|---|---|
| Skills for Life ($15/hr work + GED) | https://detroitatwork.com/skillsforlife returns **403 "Content Not Found"**. It was a 3-year ARPA program (news-only). The 2024 Career Guide page still links to it. | Do not list. |
| Learn to Earn stipend | "stipend portion … currently closed" (L4) | List only the free GED classes. |
| JumpStart (18-month stipend) | "JumpStart registrations are now CLOSED" (dateModified 2025-01-30) | Do not list. |
| "Detroit at Work Adult $100M Scholarship Fund" / "40 PLUS TRAINING PROGRAMS … pay $10-16/hr" | Only on the 2024 career-guide page; `/scholarships` is gone (403) | Do not list. Use L3. |
| DRAP | No current page (`/drap` 404). Described only on an old Mayor's board page and in a 2017 news story | Retired name. |
| STEP | City page gone (403 not-found) | Retired name; Fast Track (L13) is the live page. |
| Start Your Skilled Trades Career (renovator, $15/hr) | Page says "Classes postponed until further notice!" (2024-11-25) | Do not list. |
| DTE Tree Trim Academy / Demolition training | "Get Paid to Learn a Trade" page, dateModified **2022-05-24** | Stale. The 2025–26 training table shows Focus: HOPE "Tree Trimming" instead. |
| Goodwill as a Detroit at Work operator | Goodwill's own career-centers page lists only Oakland County (Pontiac, Novi). DESC's partners page still shows Goodwill. | Don't attribute any Detroit center to Goodwill. |
| 2835 Bagley center | Closed per DAW (see above) | Archive. |

---

## Part 4: Contradictions a steward should settle

1. **How many Detroit at Work centers.** The DAW locations page lists 7 (one is referrals-only). The
   DESC plan (July 2026) says "seven (7) Detroit at Work One-Stop Service Centers". The DESC home page
   and the DAW education page say "nine". The DAW employer page says "eight". The Michigan Works!
   Association lists 8 (including E. Seven Mile). The Mayor's board page lists 9 (including the closed
   Bagley). **Go with the DAW locations page (7) and ask about E. Seven Mile.**
2. **Hours.** DAW says 8–5 Monday–Friday. The DESC home page and DAW education page say "9 a.m. to 5
   p.m.". DAW gives two versions of late Thursday (six named centers vs "All career centers"). MiSide
   says McNichols stays open until 7 on **Wednesday**.
3. **Conner vs "Connor"**: the spelling differs within the DAW page itself.
4. **ACCESS W. Warren phone:** ACCESS prints (313) 429-2469; findhelp gives 313-203-3113
   (aggregator-only). DAW tells everyone to call 313-962-9675.
5. **SEMCA Dearborn phone:** 313-945-8380 on DCC's and ACCESS's pages vs 313.203.3366 on the
   Michigan Works! Association page.
6. **UIA Detroit office location text:** "first floor" (Nov 2025) vs "Suite L-385" (Sept 2026).
   Probably the same lobby-level suite.
7. **DAW flex site "Chandler Park Branch 5201 Woodward"**: wrong address (5201 Woodward is the Main
   Library).
8. **DAAA SCSEP income limits** look like 2023 numbers.

---

## Gaps and blockers

**Sites that refused scripts (HTTP 403). Not worked around; a person must check in a browser:**
- **semcamiworks.org** and **semca.org**, every page including PDFs. This is SEMCA's own page for the
  Dearborn and Highland Park AJCs, its youth program, PATH, and its local plan. I used the operator's
  (DCC's) page instead.
- **sermetro.org**. SER's page on which Detroit at Work centers SERCO runs (Meyers, Michigan Ave). Lane
  B will hit this too.

**JavaScript shells (the list loads by script, so a browser is needed):**
- UIA "Find Your Local UIA Office"
- **MRS Office Locator.** No MRS Detroit or Dearborn office address could be confirmed.

**Couldn't connect:** michiganveterans.com (curl exit 7). I used michigan.gov/mvaa instead.

**Parked domain, do not link:** `gesherhumanservices.org` (www and bare) serves a JS redirect to
`/lander`. The real Gesher site is **geshermi.org**.

**detroitmi.gov:** the brief said it blocks scripts, but in this session it returned **HTTP 200 with
real content** to the honest UA for the Project Clean Slate pages. Old or retired URLs returned
403/404 "can't find the page" (STEP, the old law-department PCS pages, the "group executive workforce"
page). So the 403s I saw came from missing pages, not bot blocking. It may behave differently at
other times; `check:emergency`-style checks should handle both cases.

**Facts I could not confirm on an owner page:**
- Which nonprofit runs **Meyers, E. Warren and Conner** (search snippets only; SER's page is blocked).
- Whether **14117 E. Seven Mile (Ross)** is still open.
- **Detroit Job Corps** open or enrolling status after the 2025 pause (the settlement is news-only).
- **MRS** local office addresses.
- **Project Clean Slate** street address (the current page has none).
- **Urban League** senior program address.
- **SEMCA youth program** offices for Hamtramck, Highland Park and Dearborn youth.
- The **"Jobs & Economy Team"**. I found no current City page by that name. The workforce side works
  through Detroit at Work/DESC, and the Mayor's Office workforce page is 404.
- Walk-in rules at the SEMCA AJCs.

**For the checker:**
- MiSide prints the phone as `313 - 246-6020` (spaces inside). Normalize digits before matching.
- VA's main number sits in a `<va-telephone contact="8008271000">` attribute. The hotline sentence
  also has it as plain text.
- DAW prints both `313-962-WORK (9675)` and `313-962-9675`. Match on the digits.

**PII:** DAW event, fast-track and trade-connect pages, the PCS About page, Gesher, NCBA, The Senior
Alliance and the MWA region pages all list named staff with emails or cell numbers. None were recorded.
Don't let any future scraper pull them.

## Pages fetched (HTTP status)

- **200:**
  - detroitatwork.com: /, /locations, /help, /training, /youth, /youth-services, /youthbuild,
    /youth-providers, /events/jobfairs, /bagley-services-transition,
    /adult-education-gedhigh-school-completion, /expungement-services,
    /food-assistance-employment-and-training, /detroit-at-work-trade-connect, /fast-track, /jumpstart,
    /career-guide, /resources-you, /education-pathways, /get-paid-learn-trade,
    /start-your-skilled-trades-career
  - descmiworks.org: /, /about-us/, /about-us/our-partners/, /opportunities/public-documents/, plus
    the plan PDF
  - gdyt.org: /, /youth, /frequently-asked-questions/youth-and-parents, /contacts
  - michiganworks.org: /region-l, /region-m, /region-n, /region-o, /region-p, /michigan-works-network
  - michigan.gov: UIA pages, LEO veterans, BSBP office info, MRS, PATH (MDHHS and LEO), /reconnect,
    /reconnect/about, Achievement Scholarship pages, /mvaa
  - Operator and partner sites: dccwf.org/locations/, accesscommunity.org/contact,
    miside.org/miside-wealth/career-center, geshermi.org/careers-employment/, paynepulliam.org (no
    address on it)
  - Other: detroit.jobcorps.gov, va.gov/detroit-va-regional-benefit-office/,
    detroitseniorsolution.org (SCSEP and areas pages), thesenioralliance.org (SCSEP),
    ncbainc.org/michigan-office/, deturbanleague.org/usjp, mitalent.org, detroitpromise.com,
    workforcedetroit.com (stale), detroitmi.gov (PCS pages)
- **403 (content removed):** detroitatwork.com /skillsforlife, /scholarships; detroitmi.gov STEP and
  the old PCS URLs
- **404:** detroitatwork.com /drap, /learn-to-earn, /apprenticeship
- **403 (blocks scripts):** semcamiworks.org, semca.org, sermetro.org
- **Connection refused:** michiganveterans.com
