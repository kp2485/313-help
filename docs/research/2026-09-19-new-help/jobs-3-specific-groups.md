# Lane C: job help for specific groups (research, 2026-09-19)

Research only. Nothing in the repo was touched. Every page was fetched with
`curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`
(the raw HTML is in `scratchpad/c/`). "200" means curl could read the page. Aggregators (findhelp,
Yelp, news, careeronestop) were used only to find candidates. When a fact came only from one of
them, the entry says so. No staff names, staff emails or direct lines are recorded. Several pages
print them, and those were left out on purpose.

## Overview

- **44 organizations or programs looked at. 25 are usable candidates**, and 11 of those are
  **verified-on-own-page**: the org's own page shows the phone and the street address as plain
  text on one script-readable page. 14 are partial. The rest are notes: not a public door, outside
  our 4 cities, closed, or blocked to scripts.
- **The strongest public doors** are MiSide Youth Academy/YouthBuild and Earn + Learn, Goodwill
  Flip the Script "Welcome Home", Ruth Ellis Center Thriving Futures, Enter-Great 313, Legal Aid &
  Defender Association (expungement), STEP (Dearborn/Detroit), Central City Integrated Health IPS,
  DAAA SCSEP, the International Institute (IIMD) Center for Working Families, and Mercy Education
  Project. **Samaritas** and the **VA Detroit** work programs are verified too, but each has a catch
  (see their entries).
- **Big structural finding: "Southwest Solutions" now appears as "MiSide Community Impact
  Network" (miside.org).** It runs the same programs: Piquette Square, HVRP, SSVF, Center for Working
  Families, Adult Learning Lab, Detroit at Work W. McNichols career center. Lane B should know this.
  The rename is inferred from the matching program list, not from a name-change announcement.
- **Many programs in this lane are not public doors.** They serve only people already in a shelter
  (Covenant House, Pope Francis Center Bridge Housing, DRMM, COTS) or people a parole or probation
  agent refers (MDOC Reentry Services, CEO, Goodwill's SCSF, MiCRI). Those should be shown with the
  real public door (a crisis or intake line) or left out.
- **Dates:** "current" means 2025–2026 evidence on the org's own site, such as a dated post, a 2026
  schedule, or a 2026 program date. Where the only date is a copyright footer, the entry says so.

Legend: **V** = verified-on-own-page, **P** = partial, **U** = unverified.
"4 cities" = Detroit (DET), Hamtramck (HAM), Highland Park (HP), Dearborn (DBN).

---

## 1. People coming home from prison or with a record

### C1. Goodwill of Greater Detroit — Flip the Script: "Welcome Home" (Wayne County) — **V**
- **Offers:** Case manager, help removing barriers, GED prep, job training, job placement, money
  coaching, help finding other services. It is a reentry program.
- **Cost:** Not stated for Welcome Home. The same page says "All Services Are Free to Wayne County
  Residents" under its GED program (Education Recovery).
- **Who:** Age 18+, **Detroit resident**, now under federal parole or probation, state parole, Wayne
  County probation, Wayne County juvenile probation, or pre-trial, **or** a member of a Community
  Violence Intervention program. Bring proof of Detroit address and proof of justice-involved status.
- **Sister services on the same page:**
  - **Education Recovery:** GED, high-school diploma prep (ages 17–20), apprenticeship exam prep.
    Wayne County residents 16+. Free, with transportation help.
  - **Safer Communities Stronger Families:** Ages 16–39, MDOC probationers only, by court or
    probation referral. **Not a public door.**
- **Address/phone:** Flip the Script – Wayne County, **2777 East Grand Boulevard, Detroit, MI 48211**,
  **313.557.4848**.
- **Hours:** Not printed. **Door:** Phone or web form first. Walk-in is not stated.
- **Cities:** Welcome Home is DET only. Education Recovery covers all 4 (Wayne County).
- **Checker page (phone + street both plain text):**
  https://www.goodwilldetroit.org/connect/find-a-location/ (curl 200).
  The program page https://www.goodwilldetroit.org/the-good-we-do/flip-the-script/ (200) has only a
  contact form, with no phone or address.
- **Notes:** The page says the program has run 23 years. A change.org petition to reinstate $1.5M in
  state funding and a 2026 legislative spending request (both discovery-only) point to funding risk.
  A person should call to confirm intake is open.

### C2. Center for Employment Opportunities (CEO) Detroit — **U (blocks scripts)**
- **Offers:** Paid short-term work on a crew with daily pay, then help finding a full-time job, plus
  job coaching.
- **Who:** People recently home from prison who are on probation or parole. Findhelp (aggregator)
  says "referrals from probation and parole only."
- **Address/phone/hours:** Seen only in the search-engine snippet of ceoworks.org/locations/detroit:
  7310 Woodward Ave., Suite 701B, Detroit, MI 48202; (313) 752-0680; Mon–Fri 8:30AM–4:30PM.
- **Script access:** https://www.ceoworks.org/locations/detroit returns **403, Cloudflare "Attention
  Required"**. It blocks scripts and needs a browser, so a person must check it.
- **Door:** Probably referral-only, so it may not be a public door.

### C3. Nation Outside — Trauma-Informed Peer-Led Reentry (TIPLR), digital literacy, Clean Slate help — **V (contact)**
- **Offers:**
  - Peer mentors who have been to prison themselves.
  - Rides to appointments and **job interviews**.
  - Weekly coaching.
  - Help with housing and job barriers.
  - "From Prison to Pro" computer class, with an employment-readiness module covering resumes, online
    applications and interviews.
  - Clean Slate and expungement information and events.
  - Peer Navigator certification, which trains people to become paid peer navigators.
- **Cost:** Not stated.
- **Who:** People affected by the justice system, statewide.
- **Address/phone:** **7752 W. Vernor Hwy., Detroit, MI 48209**, **313.254.2483**.
- **Hours:** Not printed. **Door:** Phone or online.
- **Cities:** DET HQ, statewide service.
- **Checker page:** https://www.nationoutside.org/ (curl 200; Wix site, but the footer text is in
  the HTML).
- **Notes:**
  - The summer 2026 digital-literacy sessions were in **Ypsilanti**
    (https://www.nationoutside.org/bridging-the-digital-divide), so there is no current Detroit class
    date.
  - This is a support program, not a job-placement program. List it under reentry support.

### C4. Enter-Great 313 — weekly support group and J.I.L.L. reentry series — **V**
- **Offers:**
  - Weekly support group for returning citizens and families, with guest speakers and practical help.
  - **J.I.L.L. (Justice-Impacted Living & Learning):** 6-week series with a certificate, covering
    budgeting and credit, "Digital Power: AI-Enhanced Reentry", and counseling.
  - Online resume builder. Mentors.
- **Cost:** "No referral needed, no paperwork, no cost — just show up" (support group).
- **Who:** Returning citizens, family and supporters.
- **Where/when:**
  - Support group: "Every Tuesday, 6:00–7:30 PM at 1010 Antietam, Detroit" (no ZIP printed).
  - J.I.L.L.: "Thursdays, 5:15–7:30 PM for six consecutive weeks at Random Acts of Kindness, 1010
    Antietam, Detroit".
  - Office: **3127 E Canfield St, Detroit, MI 48207**, **313-444-9671**.
- **Door:** Walk-in (group).
- **Cities:** DET.
- **Checker page:** https://www.enter-great.org/programs/ (200). The office address and phone are
  both on it. The meeting address is a different building.
- **Notes:** © 2026. Small organization. Job help here is light (resume and life skills).

### C5. Legal Aid and Defender Association (LAD) — criminal record expungement — **V**
- **Offers:** Free civil legal help, including "Criminal Record Expungement and License
  Restoration".
- **Cost:** Free if you qualify by income (screening).
- **Who:** Low-income residents of Wayne, Oakland and Macomb counties.
- **Address/phone:** **7650 Second Ave, Ste 120, Detroit, MI 48202**, **(313) 967-5800** (intake line;
  313.967.5555 is administration).
- **Hours:** "during regular business hours" (not listed). **Door:** Online intake form first, or
  phone.
- **Cities:** All 4.
- **Checker page:** https://ladadetroit.org/services/ (200). Phone and street are both on it.

### C6. Lakeshore Legal Aid — expungement clinics — **P (no fixed address, by design)**
- **Offers:** Free help clearing a record at a clinic.
- **2026 Wayne County dates:** Mar 6, Jun 5, **Sep 3**, **Nov 6**. Clinics run 10am–1pm. "PRE-REGISTRATION
  IS REQUIRED", and the location is sent one week before.
- **Who:** Residents of Macomb, Oakland and Wayne counties.
- **Phone:** **(888) 783-8190**. The page gives no street address because the site changes each time.
- **Cities:** All 4.
- **Page:** https://lakeshorelegalaid.org/expungement/ (200).
- **Notes:** This fits as a dated event or online door, not a place. The next Wayne clinic is
  **Nov 6, 2026**.

### C7. Detroit Justice Center — legal services (expungement, license restoration, fines/fees, child-support debt) — **P (referral-only)**
- **Offers:**
  - Legal help removing record, license, warrant and debt barriers to work.
  - Community Legal Advocates run expungement clinics.
- **Door:** "we here at DJC only get legal clients from our referral partners." This is **not a
  public door** for attorney help. The attorneys do not take felony matters.
- **Address/phone:** **4731 Grand River Ave., Suite #200, Detroit, MI 48208**, **313-736-5957**.
- **Checker page:** https://detroitjustice.org/legal-services/ (200).
- **Contradiction:** Search snippets still show the **old** address, 1420 Washington Blvd Suite 301.
  The org's site now shows Grand River. That old suite is now printed by Detroit Phoenix Center (Y8).

### C8. Michigan Clean Slate (Michigan State Police) — link-out only — **V (online)**
- **Offers:** Explains automatic set-aside (some convictions are cleared with no application) and how
  to check your public record.
- **Cost:** Free.
- **Page:** https://www.michigan.gov/msp/services/chr/conviction-set-aside-public-information/michigan-clean-slate
  (200).
- **Note:** The Attorney General's Clean Slate URL that search returns
  (michigan.gov/ag/initiatives/expungement-assistance/automatic-expungements-michigan-clean-slate)
  now **404s**.

### C9. Detroit Rescue Mission Ministries — prisoner reentry and job training for residents — **P (residents only)**
- **Offers:**
  - Housing for homeless people coming home from prison, case management starting before release,
    and church mentors.
  - "Residents of DRMM programs are provided … vocational training, GED classes, job-readiness
    programs." Training partners include WCCCD, WSU and UM-Dearborn.
- **Door:** Job training is for residents. Reentry services start with in-reach before release.
- **Address/phone:** **150 Stimson Street, Detroit, MI 48201**, Main **(313) 993-4700** (also printed:
  Emergency Shelter 866-313-2520, Addiction Helpline (313) 263-0077).
- **Checker page:** https://drmm.org/services/ (200).
- **Note:** The older "Transitional Job program for ex-offenders" appears only in aggregator
  snippets, not on the current page.

### Not candidates (reentry)
- **MDOC Reentry Services (Offender Success):** Services start only when a **parole agent refers**
  the person. The Region 10 (Wayne/Oakland/Macomb) administrative agency is Health Management Systems
  of America, per https://www.michigan.gov/corrections/our-operations/osa/reentry-services/os-community-coordinator-contacts
  (200). The coordinator there is a named staff member, not recorded. At most, a family link-out to
  https://www.michigan.gov/corrections/our-operations/osa/reentry-services (200).
- **Michigan Citizen Reentry Initiative (MiCRI, state):** In-reach only, at Milan federal prison and
  residential reentry centers (Cherry Street Services, Detroit). Not a public door.
  https://www.michigan.gov/leo/bureaus-agencies/wd/programs-services/michigan-citizen-reentry-initiative (200).
- **Operation Get Down:** The search index shows its own homepage titled "Operation Get Down Closed
  operations in 2025." Direct fetch of https://operationgetdown.org/ = **403**. Treat as closed.
  A person can confirm.
- **JustUsNow:** Southfield office (24100 Southfield Rd), with a 626 (California) phone printed.
  Outside our cities. Skip.
- **"Safe & Sound", "Emerge":** No Detroit reentry program by those names was found.
- **The Returning Citizen:** A podcast, not a service.
- **DHDC "Freedom Ink" tattoo removal (for people leaving gang life or prison):** Details appear only
  on findhelp and an old City PDF. DHDC's own adult-services page mentions "tattoo removal" in one
  line with no details. **U**.
- **Detroit at Work reentry program (lane A):** A search snippet shows eligibility of "returned home
  from state prison within the last 5 months" and phone 313-922-2232. Lane A should verify.
- **SER Metro-Detroit reentry (lane B):** sermetro.org returns **403** to scripts.

---

## 2. Young people (14–24)

### Y1. MiSide (formerly Southwest Solutions?) — MiSide Youth Academy (YouthBuild) — **V**
- **Offers:**
  - Free 24-week construction training.
  - Earn a high-school diploma or GED.
  - MIOSHA 30, First Aid, Customer Service and NCCER certificates.
  - Rehab a home. **Stipend while you train.**
- **Cost:** "The program is free."
- **Who:** Ages 18–24, **Detroit resident**, valid state ID or license, **no** HS diploma or GED,
  interested in construction.
- **Where/when:** "Classes meet Monday to Friday from 9AM – 3PM at **4220 W. Vernor Hwy., Detroit, MI
  48209**."
- **Phone:** "To enroll … Call **313-297-0065**."
- **Cities:** DET.
- **Checker page:** https://miside.org/miwealth/miside-youth-academy (200).
- **Notes:**
  - Detroit at Work's YouthBuild page (https://detroitatwork.com/youthbuild, 200) says "For current
    YouthBuild opportunities, please refer to MiSide or SER Metro-Detroit youth programs." Its program
    text says Detroit, Highland Park or Hamtramck residents aged 17–24 qualify, which conflicts with
    MiSide's 18–24 Detroit-only rule. List MiSide's own rule.
  - **Sister program, MiSide Pre-Apprenticeship:** Ages 18+, driver's license or eligible to drive.
    Day class Mon–Fri 9AM–3PM, evening class Mon–Fri 4:30–7:30 PM, same address and phone. Page:
    https://miside.org/miwealth/Pre-ApprenticeshipPrograms (200).

### Y2. MiSide Wealth — Earn + Learn (adults, including returning citizens) — **V**
- **Offers:**
  - Paid training (stipends) for YouthBuild (18–24), truck driving (CDL-A), electrical and HVAC,
    customer service, and NCCER pre-apprenticeship.
  - GED, English, math and computer skills.
  - Help with transportation, clothes and tools. Job placement and follow-up.
- **Who:**
  - Veterans, **or** residents of **Detroit, Highland Park or Hamtramck** who are 18+ and are "a
    formerly incarcerated adult" or "a chronically unemployed adult".
  - Also required: work authorization, Selective Service registration (men), a drug screen, and a
    test above a 5th-grade level. Some trainings require WIOA eligibility.
- **Door:** Online interest form first.
- **Address/phone:** **MiSide Wealth, 2835 Bagley, Suite 800 (2nd Floor), Detroit, MI 48216**,
  **313.841.9641**.
- **Cities:** DET, HP, HAM.
- **Checker page:** https://miside.org/miside-wealth/earn-learn (200).
- **Stale flag:** Results cited are from 2023. The eligibility list has a garbled line ("A 18 years
  old").

### Y3. Ruth Ellis Center — Thriving Futures (LGBTQ+ ages 18–30) — **V**
- **Offers:**
  - Job-readiness workshops: strengths and career interests, resumes, finding **inclusive
    employers**, practice interviews.
  - 90 days of coaching after the course.
  - Mentors.
  - "Offers Compensation", meaning people are paid to take part.
- **Cost:** Free (participants are paid).
- **Who:** "Are you 18 to 30?" LGBTQ+ young people.
- **Address/phone:** **95 Victor Street, Highland Park, MI 48203**, **313-252-1950**.
- **Hours:** Not printed. **Door:** "Apply today" (online).
- **Cities:** HP, and all 4 in practice.
- **Checker page:** https://ruthelliscenter.org/what-we-do/thriving-futures/ (200).
- **Sensitivity:** The center prints its own address on every page, so publishing it is fine. Do not
  add anything about who attends. The drop-in center (ages 13–30) is on
  https://ruthelliscenter.org/what-we-do/health-equity-outreach/.

### Y4. Covenant House Michigan — Employment Center (youth 18–24) — **P (residents only)**
- **Offers:** Job coaching, training and placement for youth in Covenant House programs (Caritas
  shelter, Rights of Passage transitional living).
- **Door:** The job help is for youth staying there, so it is **not a public door**. The public door
  is the crisis line:
  - "9:00 am – 5:00 p.m. weekdays call Coordinated Access Model (CAM) **(313) 305-0311**"
  - "After hours and weekends … **(313) 463-2500**"
- **Campus:** **2959 Martin Luther King Jr Blvd, Detroit, MI 48208**, TEL **313-463-2000**.
- **Checker page:** https://covenanthousemi.org/detroit-programs/ (200).
- **Note:** List as youth shelter with job help, not as a job program.

### Y5. Alternatives For Girls — Workforce Development and Sew Great Detroit — **P (clients only)**
- **Offers:**
  - Job readiness and links to jobs and training for young women facing homelessness, domestic
    violence or trafficking.
  - A Grow Detroit's Young Talent (GDYT) worksite.
  - Sew Great Detroit trains women in industrial sewing and knitting.
- **Door:** Through AFG services. The page's "Get Help!" line is **888.234.3919**.
- **Address/phone:** Main office **(313) 361-4000**, **903 W. Grand Blvd, Detroit, MI 48208**.
- **Checker page:** https://alternativesforgirls.org/programs/workforce-development/ (200).
- **Sensitivity:** Serves survivors. AFG publishes this address itself. Do not describe the building
  as a shelter, and do not add details beyond what AFG prints.
- **Stale flag:** Footer © 2024.

### Y6. Detroit Hispanic Development Corporation (DHDC) — youth career pathways — **P**
- **Offers:**
  - "Career Pathways, College Access and Success": weekly workshops, hands-on projects, **paid summer
    internships**.
  - GDYT summer jobs.
  - Rides for Southwest Detroit youth.
- **Cost:** The AMO Innovation Hub after-school program runs mid-Oct–May with a **$50 registration
  fee**. The career-pathways cost is not stated.
- **Who:** Ages 5–24. Career pathways are for high-school students.
- **Address/phone:** **1211 Trumbull, Detroit MI, 48216**, **313.967.4880**.
- **Checker page:** https://www.dhdc1.org/programs/youth-development/ (200).
- **Note:** The adult-services page lists English classes, housing counseling and tattoo removal. No
  general adult job program is listed.

### Y7. Developing K.I.D.S. — free youth workforce program — **P (no phone on site)**
- **Offers:** Free job-skills program for ages 14–24, plus summits. It is a GDYT lead agency (apply
  through GDYT with referral code C1032).
- **When:** "Ages 14–17: Mondays or Tuesdays 4:00 PM - 6:30 PM … Ages 18–24: Tuesdays & Thursdays
  10:30 AM – 1:00 PM".
- **Address:** **24230 W. McNichols Rd., Detroit, MI 48219**.
- **Phone:** None on the site. The only contact is a staff-named email, not recorded. **Fails our
  phone + address rule.**
- **Pages:** https://www.developingkids.org/wfd (200) and /contact (200).

### Y8. Detroit Phoenix Center — internships and paid Summer Leadership Academy (homeless or at-risk youth) — **P**
- **Offers:**
  - Year-round paid internships and fellowships.
  - Paid Summer Leadership Academy (ages 14–24).
  - 12-week life-skills program including workforce development (ages 17–24).
  - Drop-in center (ages 12/13–24).
- **Address/phone:** **1420 Washington Blvd Ste 301** (no city or ZIP printed; downtown Detroit
  48226), **313.482.0916**.
- **Checker page:** https://www.detroitphoenixcenter.org/education (200).
- **Stale/contradiction flags:**
  - Page images and content are from 2021 and 2023.
  - The homepage contains pasted **Covenant House** text.
  - The suite printed here is the same one Detroit Justice Center used before it moved.
  - A person should confirm this is where youth actually go.

### Youth notes (not candidates or out of lane)
- **City Year Detroit** (AmeriCorps, ages 18–25, living stipend): https://www.cityyear.org/detroit/
  returns **403** to scripts. A secondary source says the 2026–27 application closed Sept 18. It is
  a paid service year rather than job help. Optional.
- **ACCESS WIOA youth (ages 14–21 or 16–21, Wayne County outside Detroit, so DBN/HAM/HP):** The ACCESS
  pages still cite the Workforce **Investment** Act and "Talent Investment Agency", so they are
  **stale**. A person should call ACCESS.
- **SEMCA Michigan Works! youth (Highland Park youth office; out-Wayne summer youth jobs covering
  HAM/HP/DBN):** Lane A's lane. semcamiworks.org returns **403** (blocks scripts).
- **Jobs for Michigan's Graduates:** In-school only, so not a public door. Not pursued.
- **SER YouthBuild/GED (18–24):** Lane B. **403**.
- **LA SED:** Has youth and senior centers, ESL and citizenship. No job service on its own site
  (https://lasedinc.org/, 200). Not a fit.
- **Dearborn city summer youth jobs:** No City of Dearborn youth-employment page was found.
- **Hamtramck youth jobs:** Only news says Hamtramck is a partner in the county summer youth program.

---

## 3. People with disabilities

### D1. Services To Enhance Potential (STEP) — supported employment — **V**
- **Offers:**
  - Supported employment: help getting and keeping a job with a job coach.
  - Job placement. Help moving from school to work.
  - "Benefits-2-Work" coaching on how work affects benefits.
  - Culinary arts program. Store and retail training.
- **Who:** People with disabilities or mental-health needs in Wayne County. Funded through the Detroit
  Wayne Integrated Health Network (DWIHN) and Community Living Services, so people usually must
  qualify for DWIHN services.
- **Phones:**
  - Intake **313-900-5057**.
  - Customer service 734-718-0483, "8 a.m. - 4 p.m. M-F except holidays".
- **Locations:**
  - Dearborn North Resource Center / corporate office, **2941 S. Gulley Road, Dearborn, MI 48124**,
    **(313) 278-3040**.
  - Dearborn South Resource Center, **15200 Mercantile Drive, Dearborn, MI 48120**, **(313) 827-0764**.
  - Detroit Resource Center, **4700 Beaufait, Detroit, MI 48207**, **(313) 267-9777**.
- **Cities:** DBN, DET.
- **Checker page:** https://stepcentral.org/ (200). All of the above are on it.
- **Currency:** The homepage still shows a 2/2/2022 weather notice, a COVID notice and © 2020. The
  site feed (https://stepcentral.org/feed/) has posts dated **June 2026**, so the organization is
  current.

### D2. Central City Integrated Health (CCH) — IPS supported employment — **V**
- **Offers:**
  - Help getting and keeping a regular job at minimum wage or more.
  - Resume help. Link to Michigan Rehabilitation Services (MRS).
  - Uniforms and work boots. Rides to work. Benefits (SSI) planning.
  - A "zero exclusion policy".
- **Who:** Adults with serious mental illness, including people facing homelessness or substance use,
  who are in CCH programs. The page says 62 people were "referred … through various other CCH
  programs" in 2024.
- **Cost:** Sliding fee for health services. The employment service cost is not stated separately.
- **Address/phone:** **10 Peterboro St., Detroit, MI 48201-2722**, "QUESTIONS? **313-831-3160**".
- **Checker page:** https://www.centralcityhealth.com/services/services/EMPLOYMENT-SERVICES (200).
- **Door:** Become a CCH client first.

### D3. Goodwill — A Place of Our Own Clubhouse — **P (phone conflict)**
- **Offers:** Paid "Transitional, Supported and Independent Employment", GED and college support,
  and a community for people living with mental illness.
- **Who:** 18+, "documented severe mental illness", living in Detroit or Wayne County. DWIHN-funded.
- **Phone conflict:**
  - The locations page says **A Place of Our Own Clubhouse, 1401 Ash Street, Detroit, MI 48208,
    313.931.0901** (https://www.goodwilldetroit.org/connect/find-a-location/, 200).
  - The program page (https://www.goodwilldetroit.org/the-good-we-do/a-place-of-our-own/, 200) says
    "CALL **(313) 557-8623**" and prints no address.
  - That page also points to the DWIHN access line, **1-800-241-4949**.
- A person must confirm which number is the clubhouse intake line.

### D4. Disability Network Wayne County Detroit (DNWCD) — job readiness and Pre-ETS for students — **P (stale)**
- **Offers:**
  - Help with resumes, applications and interviews. Job club.
  - Help on disclosing a disability and asking for accommodations. Assistive technology. Travel
    training.
  - Partners with MRS and the Bureau of Services for Blind Persons (BSBP).
  - **Pre-Employment Transition Services (Pre-ETS)** for students with disabilities: job exploration,
    work-based learning, workplace readiness, self-advocacy.
- **Cost:** "Costs range from no charge to fee-for-service."
- **Address/phone:** **7800 W. Outer Dr. LL01 - Lower Level, Detroit, MI 48235**, **(313) 923-1655**.
- **Hours:** Not on its own page. Findhelp says M–F 8:30–4:30.
- **Cities served (its own list):** Detroit, Dearborn, Hamtramck, Highland Park, and more.
- **Checker pages:** https://disabilitynetworkwcd.org/employment-job-readiness-services/ (200) and
  https://disabilitynetworkwcd.org/pre-employment-transitional-services-youth-training/ (200).
- **Stale flags:** © 2022. The employment page says "the **Disability Network Capital Area** offers…"
  (copied from another center's site). The site feed is empty. A person should confirm the services
  are current.

### D5. MiSide — Supported Employment (IPS) — **P**
- **Offers:** Job placement with ongoing support for people with serious and persistent mental illness
  who get counseling at MiSide (Southwest Counseling). It is one of ten DWIHN IPS agencies.
- **Program page:** https://miside.org/mihealth/supported-employment (200). No phone or address.
- **Nearest printed door:** Adult Counseling, **1700 Waterman, Detroit, MI 48209**, **313-841-8900**,
  "Monday through Friday, 8:30 AM - 5:00 PM" (https://miside.org/contact-us, 200).

### D6. DWIHN Access Center — front door to DWIHN-funded supported employment and clubhouses — **V (phone line)**
- **Offers:** Screening and referral to public mental-health and disability services, including IPS
  jobs programs and clubhouses.
- **Phone:** **1-800-241-4949**, "Free · 24/7 · Confidential".
- **Address:** **8726 Woodward Ave, Detroit, MI 48202**. Admin 313-833-2500.
- **Page:** https://dwihn.org/ (200).
- **Contradiction:** Search snippets and board-packet PDFs show **707 W. Milwaukee St.** DWIHN's
  homepage now prints 8726 Woodward.

### Out of area (disability)
- **Gesher Human Services (formerly JVS Human Services, merged with Kadima):** Southfield
  (29699 Southfield Rd, 248-559-5000; https://www.geshermi.org/, 200). **Outside our 4 cities.**
  Aggregators list a Detroit site at 4250 Woodward, but Gesher's own site doesn't show it. It
  announced a free "Women to Work" program on Sept 15, 2026.

---

## 4. Older workers (55+, plus one 40+ program)

### O1. Detroit Area Agency on Aging (DAAA) — SCSEP — **V** (lane A may also list SCSEP)
- **Offers:** Paid part-time job training at nonprofits and public sites, "an average of 20 hours a
  week", paid at least minimum wage, as a bridge to a regular job.
- **Who:** 55+, unemployed, low income. The printed guidelines are 1 person $18,225, 2 people
  $24,650, 3 people $31,075.
- **Address/phone:** **1333 Brewery Park Blvd., Ste 200, Detroit, MI 48207**, **313-446-4444**.
- **Checker page:** https://www.detroitseniorsolution.org/programs/senior-community-service-employment-program-scsep/ (200).
- **Stale flag:** $18,225 is 125% of the **2023** poverty line, so the income table is out of date.
  Show "low income" rather than the dollar amounts.

### O2. AARP Foundation SCSEP — Detroit office — **P/U**
- **Offers:** The same kind of paid SCSEP job training, plus job placement.
- **Who:** "age 55 or older, unemployed, and living on a low income"
  (https://www.aarp.org/aarp-foundation/our-work/income/scsep/, 200). National line 1-800-775-6776.
- **Detroit office:** 407 E. Fort Street, Suite 401, Detroit, MI 48226, (313) 964-4821. This appears
  only on **NCBA's** page (https://ncbainc.org/michigan-office/, 200), a different organization, and
  on aggregators. That page also prints a staff cell number, not recorded. No AARP-owned page with the
  Detroit address was found. A person must confirm.

### O3. Operation ABLE of Michigan (Spectrum Human Services affiliate) — ages 40+ — **P (possibly stale)**
- **Offers:**
  - Center for Working Families: career assessment, resume, training guidance, job placement,
    interview coaching, job clubs, money coaching.
  - "Bridge" math, reading and digital-literacy program with a small stipend.
  - Fee-for-service for people over the income limit.
- **Who:** "40 or older, low or moderate income and ready to go to work."
- **Address/phone:** **4750 Woodward Avenue - Suite 201, Detroit, MI 48201**, Administrative Office
  **(313) 832-0922**.
- **Checker page:** https://www.spectrumhuman.org/OperationAble (200). Services are at /OperationAble/Services (200).
- **Stale flags:**
  - No dated content. Text says "will soon be re-establishing" a networking group.
  - It still calls itself an access site for the City's 0% home repair loan.
  - The enrollment number printed on the services page is also listed as a named staff member's
    direct line, so it is not recorded.
  - A person must confirm the program still runs.

---

## 5. Veterans

### V1. VA Detroit (John D. Dingell VA Medical Center) — "Veteran Readiness and Employment programs" (Compensated Work Therapy) — **V, with a checker caveat**
- **Offers:**
  - "transitional work program" (supervised work experience).
  - "supported employment program" (long-term help for veterans with serious mental illness or
    physical disabilities).
  - "vocational assistance" for veterans in the residential program.
- **Who:** Veterans eligible for VA health care. The page template says "A referral is required".
- **Hours:** "Mon–Fri 8:00 a.m. to 4:30 p.m.; Sat/Sun Closed".
- **Address:** **4646 John R Street, Detroit, MI 48201-1916**.
- **Phone:** Main phone 313-576-1000.
- **Checker caveat:** On https://www.va.gov/detroit-health-care/locations/john-d-dingell-department-of-veterans-affairs-medical-center/
  (200), the phone appears **only inside `<va-telephone contact="3135761000">` attributes**, not as
  visible text. A text-only checker will miss it. A checker that reads attributes, or a digits-only
  match on raw HTML, will find it.
- **Cost:** Free (VA care).

### V2. MiSide — Homeless Veterans Reintegration Program (HVRP) — **P**
- **Offers:** Job training, job search and placement, help with transportation, clothes and tools,
  and follow-up for **homeless veterans**.
- **Who:** Homeless, and a veteran not dishonorably discharged. Serves Macomb and Wayne (Detroit).
- **Program page:** https://miside.org/miwealth/homeless-veterans-reintegration-program-hvrp (200). No
  phone or address. The nearest door is MiSide Wealth, 2835 Bagley, Suite 800, Detroit 48216,
  313-841-9641 (contact page).
- **Currency:** Cites 2023–24 and FY2024 results.

### V3. Volunteers of America Michigan — Veteran Employment and Training (HVRP) — **P**
- **Offers:** Job training and placement for homeless veterans, plus SSVF and transitional housing.
- **Phone:** "If you're a Veteran in need … call **(877) 509-VETS (8387)**."
- **Address:** Only the Southfield HQ is printed (26211 Central Park Blvd Suite 650, Southfield
  48076, (248) 945-0101). No Detroit street address, and which counties HVRP serves is not stated.
- **Page:** https://www.voami.org/services/veteran-services/ (200). A 2025 Impact Report is linked, so
  the org is current.

### V4. Michigan Veterans Affairs Agency (MVAA) — link-out — **V (phone line)**
- **Phone:** **1-800-MICH-VET (1-800-642-4838)**. The address is in Lansing.
- **Pages:** https://www.michigan.gov/mvaa (200). Employment section at /mvaa/employment-new.

### Veterans notes
- **Wayne County Veterans Services:** waynecountymi.gov returns **Akamai "Access Denied" (403)** to
  scripts, so a person must check. Aggregator only: 400 Monroe Suite 405, Detroit 48226,
  313-224-5045, Mon–Thu 9–3:30, "job referrals".
- **Detroit Vet Center:** Counseling, not jobs. 11214 East Jefferson Avenue, Detroit, MI 48214
  (https://www.va.gov/detroit-vet-center/, 200). Note only.
- **ACCESS veterans representative:** Listed on a stale ACCESS page. Don't list separately.

---

## 6. Immigrants, refugees, and people learning English

### I1. ACCESS — employment and training (Dearborn, Hamtramck, Detroit) — **P (contacts V, service text stale)**
- **Offers (from the job-seeker page):**
  - Job search help, resumes, workshops.
  - Help filing for unemployment.
  - **Interpretation and translation** for people with limited English.
  - Free computer Learning Lab (first come).
  - ESL and GED.
  - PATH for families referred by the state welfare office (TANF).
  - Refugee support services.
- **Who:** Employment services are "open to all job seekers". WIOA adult training covers "Wayne County,
  excluding the city of Detroit" (so DBN/HAM/HP).
- **Locations** (all on https://www.accesscommunity.org/contact, 200):
  - One-Stop Employment and Human Services Center (Michigan Works!), **6451 Schaefer Road, Dearborn,
    MI 48126**, **(313) 945-8380**.
  - ACCESS Hamtramck Center (Financial Coaching; Social Services; Workforce Development), **9301 Joseph
    Campau Street, Hamtramck, MI 48212**, **313-842-7726**. Also on
    https://www.accesscommunity.org/content/hamtramck-center (200).
  - ACCESS Detroit Career Center (Michigan Works!; Workforce Development), **16427 W. Warren Avenue,
    Detroit, MI 48228**, **(313) 429-2469**. This is probably a Detroit at Work center (lane A).
- **Hours:** Not printed.
- **Stale flags:** https://www.accesscommunity.org/employment-services/job-seeker-resources (200)
  cites 2013 numbers, the Workforce **Investment** Act and the "Talent Investment Agency". Only the
  addresses and phones should be trusted. Confirm the services by phone.

### I2. Samaritas — refugee employment services — **V (contacts), currency risk**
- **Offers:**
  - Job placement, English classes and tutoring, job training.
  - Help keeping a job "until refugees have been here for 5 years".
  - Match Grant (Detroit): training, placement and transportation.
- **Who:** Refugees and other refugee-program-eligible newcomers, within 5 years of arrival.
- **Phone:** "Refugee Employment Office at **(248) 423-2790**". Program-manager names and direct lines
  are also printed, not recorded.
- **Address:** Detroit office **8131 E. Jefferson Ave., Detroit, MI 48214**.
- **Checker page:** https://samaritas.org/new-americans/employment-education/ (200).
- **Risk:** The Jan 2025 federal refugee-admissions suspension and funding cuts led to layoffs
  (Crain's, Detroit News, discovery only). The employment line is a 248 number. A person should
  confirm Detroit employment services are running now.

### I3. International Institute of Metropolitan Detroit (IIMD) — Center for Working Families — **V**
- **Offers:**
  - Job coaching: applying for jobs, resumes, interviews, cover letters.
  - ESL, computer skills, GED classes.
  - Money coaching. Help signing up for benefits.
- **Who:** Low-income immigrants, refugees and U.S.-born residents.
- **Address/phone:** **111 E Kirby St, Detroit, MI 48202**, **(313) 871-8600**.
- **Checker page:** https://www.iimd.org/center-for-working-families (200). © 2025.
- **CNA training page** (https://www.iimd.org/education-and-training-classes/certified-nursing-assistant, 200):
  "FREE to qualified individuals", 15 weeks and 162 hours, English learners need CASAS 221+.
  Marked "Updated: April 10, 2023", so it may be stale.

### I4. Global Detroit / Michigan Global Talent Initiative — Skilled Immigrant Integration Program — **P (no phone)**
- **Offers:** For **college-educated** immigrants: help getting professional licenses, job-search
  skills and job placement, plus scholarships for credential evaluation.
- **Who:** International degree or advanced training, plus work authorization (per the Global Detroit
  article).
- **Address:** HQ **2050 15th Street, Suite 312, Detroit, MI 48216**
  (https://michiganglobaltalent.org/programs/, 200). Contact form only, no phone.

### I5. National Association of Yemeni Americans (NAYA) — social services incl. job leads — **P (light job help)**
- **Offers:** "assists with employment requirements, job leads, and availability", plus translation,
  interpretation and form help.
- **Address/phone:** Main Office **10415 Dix Ave, Dearborn, Michigan, 48120**, **313-842-8402**.
- **Hours:** "09:00 AM – 5:00 PM Mon -Fri. 10:00 AM – 2:00 PM Sat".
- **Checker page:** https://mynaya.org/ (200). Posts dated Jan 2026.
- **Error on page:** The Hamtramck office (NAYA behavioral health) is printed as "11521 Joseph Campau,
  Ste B Hamtramck, Michigan, **48120**". That is Dearborn's ZIP. Hamtramck is 48212.

### Immigrant notes
- **Arab American and Chaldean Council (ACC):** Its employment program is the **Oakland County** PATH
  refugee program (https://myacc.org/, 200; HQ Troy). Outside our cities for jobs.
- **Hamtramck Bangladeshi or Yemeni groups with job help:** None found beyond ACCESS Hamtramck and
  NAYA. The Bangladesh Association of Michigan is cultural. Detroit at Work's site offers a Bengali
  version, which is lane A.

---

## 7. Women

### W1. Mercy Education Project — Women's Program — **V** (lane D may also list)
- **Offers:** Free GED prep and adult basic education, plus "college, career, and job readiness
  preparation". Van rides within the service area. Some students get bus passes.
- **Cost:** "free of charge".
- **Who:** Women. The minimum age of 16 comes from aggregators; the own page doesn't print an age.
- **When:** "9:00 am to 1:30 pm, Monday through Thursday during the academic year". "year-round, open
  enrollment".
- **Phones:** Enroll at **313.410.2705** (program line) or by form. Main **313-963-5881**.
- **Address:** **1450 Howard St., Detroit, MI 48216**.
- **Checker page:** https://www.mercyed.net/womens-program (200).
- **Note:** https://www.mercyed.net/workforce-development (200) has an **empty body** to scripts
  (content is images or embeds), so a person must check it.

### W2. Alternatives For Girls — see Y5.

### Women notes
- **Dress for Success Michigan:** Based in **Ypsilanti**, outside our cities. Suiting needs a referral.
  The homepage still carries a 2020 COVID "closed until further notice" notice next to 2026 items, so
  it is contradictory. Skip, or offer as a far link-out.
- **Gesher "Women to Work":** Southfield, outside our cities (see Disability).
- **"Women's Justice":** No current Detroit program by that name was found.

---

## 8. People experiencing homelessness or very low income

### H1. Cass Community Social Services — Green Industries (paid jobs) — **P**
- **Offers:** Paid jobs "for people with significant barriers to employment": recycling, document
  shredding, making mud mats and coasters on the Cass campus.
- **How to apply:** Not stated.
- **Address/phone:** World Building, **11745 Rosa Parks Boulevard, Detroit, MI 48206**,
  **(313) 883-2277** (https://casscommunity.org/contact-us/locations/, 200).
- **Program pages:** https://casscommunity.org/services/vocational/ and /green-industries/ (200). No
  contact information on either.
- A person should ask how people get hired (likely Cass program participants).

### H2. Pope Francis Center — Day Center job referrals; job readiness for Bridge Housing residents — **P**
- **Offers:**
  - Day Center: "Resources for permanent supportive housing, **employment opportunities**, and recovery
    assistance" through partners.
  - Bridge Housing Campus: job-readiness services **for residents** (90–120 day stays).
- **Day Center:** **438 Saint Antoine Street, Detroit, MI 48226**. "Service Hours: Mon-Sat, 7-11am".
  Phone for both locations **313.964.2823**.
- **Checker page:** https://popefranciscenter.org/ (200). News dated Sept 17, 2026.

### Homelessness notes
- **COTS:** Passport to Self-Sufficiency job coaching is for **COTS families** (residents), so it is
  not a public door. 26 Peterboro, Suite 100, Detroit 48201, 313-831-3777 (https://cotsdetroit.org/, 200).
- **NOAH at Central:** Casework and referrals only, with no job program on its site. 23 East Adams,
  Detroit 48226, 313-965-5422.
- **Capuchin Soup Kitchen:** https://www.cskdetroit.org/ shows a **Cloudflare "Just a moment…"**
  challenge, so it blocks scripts. Aggregators mention job-readiness support and "On the Rise Bakery"
  (a jobs program for men). A person must check.
- **Detroit Rescue Mission:** see C9. **Covenant House:** Y4. **Detroit Phoenix Center:** Y8.

---

## 9. LGBTQ+

- **Ruth Ellis Center Thriving Futures:** see Y3. This is the main LGBTQ+ job program.
- **LGBT Detroit:** No workforce program on its own site (https://www.lgbtdetroit.org/, 200; 20025
  Greenfield Road, Detroit 48235, (313) 397-2127). Not a fit.

---

## Gaps and blockers

**Sites that block scripts (a person must check in a browser):**
- ceoworks.org (Cloudflare 403). CEO Detroit is the most important reentry jobs program we could not
  verify.
- cskdetroit.org (Cloudflare challenge).
- operationgetdown.org (403).
- sermetro.org and semcamiworks.org (403; lanes B and A).
- waynecountymi.gov (Akamai Access Denied).
- cityyear.org/detroit and dnmichigan.org (403).

**Phone and address don't both appear on one page:**
- Lakeshore Legal Aid clinics (no fixed site).
- Developing K.I.D.S. (no phone).
- Global Detroit/MGTI (no phone).
- VOA Michigan (no Detroit address).
- MiSide HVRP and Supported Employment program pages (contacts only on the separate contact page).
- Cass Green Industries (contacts only on the locations page).
- The Goodwill Flip the Script and Clubhouse program pages (contacts only on the locations page).
- **VA Detroit:** the phone is present only in HTML attributes. The checker should read raw HTML
  digits, or treat va.gov as a special case.

**Contradictions to hold for a steward:**
- Goodwill Clubhouse phone: 313.931.0901 on the locations page vs (313) 557-8623 on the program page.
- DWIHN address: 8726 Woodward on its homepage vs 707 W. Milwaukee in older documents.
- Detroit Justice Center address: 4731 Grand River now vs 1420 Washington in snippets.
- NAYA Hamtramck office printed with Dearborn's ZIP.
- YouthBuild eligibility: Detroit at Work says 17–24 and DET/HP/HAM; MiSide says 18–24 and Detroit only.
- DAAA SCSEP income table is from 2023.
- DNWCD page copied from another center ("Capital Area").
- Detroit Phoenix Center homepage contains Covenant House text.
- Dress for Success homepage still says closed for COVID.

**Currency not proven (no 2025–2026 date on the org's own pages):** Disability Network Wayne County
Detroit, Operation ABLE, the ACCESS employment text, the Detroit Phoenix Center program page, Cass
Green Industries.

**Funding risk:** Samaritas (2025 federal refugee cuts) and Flip the Script (petition over lost state
funding). Call before listing.

**Not public doors:** These serve only residents or referred people:
- MDOC Reentry Services, MiCRI, CEO (probably), Goodwill SCSF.
- Covenant House job center, DRMM job training, Pope Francis Center Bridge Housing, COTS.
- AFG workforce and CCH IPS (clients only).

In the app, show each with its real front door (a crisis or intake line, or the parole agent), or
leave it out.

**Out of area:** Gesher (formerly JVS), JustUsNow, Dress for Success Michigan, Arab American and
Chaldean Council jobs.

**Closed:** Operation Get Down (per its own site title in the search index; 2025).

**Sensitivity:** No organization asked for its address to be withheld. Alternatives For Girls, Ruth
Ellis Center, Covenant House and Detroit Phoenix Center all publish their addresses. Still:
- Present them by what they offer, not by who stays there.
- Never label AFG's building a shelter.
- For DV or trafficking survivors, follow the docs/05 ordering (hotline first). AFG's help line is
  888.234.3919.

**Overlap with other lanes:**
- DAAA SCSEP, AARP SCSEP and ACCESS Michigan Works! centers: lane A.
- MiSide (= Southwest Solutions?) and SER: lane B.
- Mercy Education Project and the IIMD ESL/GED classes: lane D.

**Not found:** Dearborn city summer youth jobs page; a Hamtramck-specific Bangladeshi or Yemeni job
program; "Safe & Sound", "Emerge", "Young Nation", "Detroit Youth Opportunity" as current programs;
any LGBT Detroit workforce program.
