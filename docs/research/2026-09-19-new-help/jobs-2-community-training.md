# Lane B: community groups that train people and help them find jobs

Researched 2026-09-19 for 313 Help. This is research only; nothing in the repo was changed.

## Overview

- **Scope:** nonprofits, union training centers and a few national training groups that serve Detroit, Hamtramck, Highland Park and Dearborn. Public career centers (Detroit at Work/DESC, Michigan Works!, UIA, MRS, Job Corps, SCSEP) belong to lane A. Reentry, youth, seniors, veterans and immigrants belong to lane C. GED, ESL and colleges belong to lane D. Where a lane-B group also runs one of those, I noted it under "Handoffs" and did not go deep.
- **Source of truth:** every fact below comes from the organization's own page unless it is marked *(aggregator only)* or *(news only)*. No staff names, emails or direct lines are recorded. Where a page prints only a staff person's line, the entry says so and leaves the phone blank.
- **Script check:** every "checker URL" was fetched with `curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`. The script then removed the HTML tags and looked for (a) the phone digits and (b) the street number on that one page. The result is shown as `curl 200, phone Y, street Y`.
- **Blocked sites:** SER Metro-Detroit (sermetro.org) and Wayne Metro (waynemetro.org) return **403 to scripts** (Sucuri firewall). I read their content with the WebFetch tool, which identifies itself honestly and does not work around the block, and I did not bypass anything. **Our checker cannot read these pages.** A person has to check them in a browser. Grand Circus and Capuchin Soup Kitchen (Earthworks) sit behind a Cloudflare block or challenge, so I recorded them as needing a browser and did not try to get past it.
- **Status key:** **verified** = phone, street address and program facts all appear on the org's own page, which scripts can read. **partial** = something is missing: no single page has both phone and address, the page blocks scripts, there is no public door, or the page may be stale. **unverified** = only an aggregator or the news confirms it, or I could not read the page.

## Quick table

| # | Org: program | Cost | Our cities | Checker URL (phone + street on one page) | Script | Status |
|---|---|---|---|---|---|---|
| 1 | SER Metro-Detroit: ReBuild Detroit (construction readiness) | Free + $700+ stipend | Detroit | sermetro.org/locations/ | 403 | partial |
| 2 | SER Metro-Detroit: Justice Impacted Services | Free (not stated) | Detroit, Wayne Co. | sermetro.org/locations/ | 403 | partial |
| 3 | SER Metro-Detroit: Center for Working Families | Not stated | Detroit | sermetro.org/locations/ | 403 | partial |
| 4 | SER Metro-Detroit: Adult Education Services (computer, VESL, job readiness), SW + FREC East | Not stated | Detroit | sermetro.org/locations/ | 403 | partial |
| 5 | SER Metro-Detroit: YouthBuild / Year Round Youth | Not stated | Detroit | sermetro.org/locations/ | 403 | partial (lane C) |
| 6 | Focus: HOPE: Workforce Development (IT, CNC, welding, CDL, CCMA, construction) | "FREE to most students" | Detroit + region | focushope.edu/contact/ | 200 Y/Y | **verified** |
| 7 | Goodwill of Greater Detroit: Career Academy (welding, construction, EVSE, customer service) | Not stated | Metro Detroit | goodwilldetroit.org/connect/find-a-location/ | 200 Y/Y | verified, but phone conflict |
| 8 | Goodwill: Flip the Script (Welcome Home, Education Recovery, SCSF) | Free to Wayne Co. residents (Education Recovery) | Detroit, Wayne Co. | goodwilldetroit.org/connect/find-a-location/ | 200 Y/Y | **verified** |
| 9 | MiSide (was Southwest Solutions): Earn + Learn | Free + stipends | Detroit, Hamtramck, Highland Park (+ veterans) | miside.org/miside-wealth/earn-learn | 200 Y/Y | **verified** |
| 10 | MiSide: Pre-Apprenticeship (construction, adults) | Free (stipend) | Detroit | miside.org/miwealth/Pre-ApprenticeshipPrograms | 200 Y/Y | **verified** |
| 11 | MiSide: Youth Academy (YouthBuild-style, 18–24) | Free + stipend | Detroit | miside.org/miwealth/miside-youth-academy | 200 Y/Y | **verified** (lane C) |
| 12 | MiSide Wealth: Center for Working Families (LISC FOC) | Not stated | Detroit | miside.org/contact-us | 200 Y/Y | verified (address from contact page) |
| 13 | Matrix Human Services: Workforce Development + Skills 2 Build (manufacturing, CMA, CHW) | Not stated | Detroit | matrixhumanservices.org/the-matrix-center/ | 200 Y/Y | verified (program page lacks address) |
| 14 | Urban League of Detroit & SE Mich.: Workforce Career Development Center | Not stated | Detroit | none (no page has both) | 200 | partial |
| 15 | Urban League: Urban Seniors Jobs Program (55+) | Paid training | Wayne/Oakland | none | 200 | partial (lane A/C) |
| 16 | Wayne Metro CAA: Growing Green / SWIFT / Career Institute (paid $16/hr training) | Free, paid stipend | Wayne County | waynemetro.org/employment/ | 403 | partial |
| 17 | ACCESS: Hamtramck Center (workforce + financial coaching) | Not stated | Hamtramck | accesscommunity.org/contact | 200 Y/Y | verified (thin program detail) |
| 18 | ACCESS: One-Stop Employment & Human Services Center (Dearborn) | Free (MW!) | Dearborn | accesscommunity.org/contact | 200 Y/Y | verified (lane A overlap) |
| 19 | ACCESS: Detroit Career Center (W. Warren) | Free (MW!) | Detroit | accesscommunity.org/contact | 200 Y/Y | verified, but address conflict |
| 20 | ACCESS: Business Development Program (small-business training, English/Arabic) | Not stated | Dearborn/metro | accesscommunity.org/contact | 200 Y/Y | verified |
| 21 | LAHC: Workforce Development & Education (WayneLINC career navigation) | "All programs are free" | Dearborn (Wayne Co.) | lahc.org/workforce-development/ | 200 Y/Y | **verified** |
| 22 | International Institute of Metro Detroit: Center for Working Families | Not stated | Detroit | iimd.org/center-for-working-families | 200 Y/Y | **verified** |
| 23 | Operation ABLE of Michigan (Spectrum Human Services) | Not stated | Detroit/Wayne | spectrumhuman.org/OperationAble | 200 Y/Y | verified (no dates, currency unclear) |
| 24 | The Greening of Detroit: Detroit Conservation Corps | Free + stipend up to $600 | Detroit, Hamtramck, Highland Park | greeningofdetroit.com/adult-training | 200 Y/Y | **verified** |
| 25 | DHDC: Entrepreneurship (free coaching, Side Hustle to CEO) | Free coaching | Detroit | dhdc1.org/programs/entrepreneurship/ | 200 Y/Y | **verified** |
| 26 | ProsperUs Detroit: Entrepreneur Training Program | No cost | Detroit, Hamtramck, Highland Park (+Inkster) | prosperusdetroit.org/training/ | 200 Y/Y | **verified** |
| 27 | TechTown Detroit: small business programs | Free consults; Retail Boot Camp $199 deposit, refunded | Wayne Co. | techtowndetroit.org/what-we-do/small-business-programs/ | 200 Y/Y | verified (low priority) |
| 28 | Per Scholas Detroit: IT support, cybersecurity, healthcare IT | No cost | Detroit area | perscholas.org/locations/detroit/ | 200 Y/Y (national phone) | verified |
| 29 | Year Up United: Detroit | Tuition-free | Detroit | none | 200 | partial |
| 30 | NPower Michigan: Tech Fundamentals | Free | Detroit | none (only staff lines) | 200 | partial |
| 31 | Michigan WDI (AFL-CIO): Access for All pre-apprenticeship (Highland Park) | Free + small stipend | Highland Park / Detroit | miwdi.org/locations/ | 200 Y/Y | verified (site location inferred) |
| 32 | Michigan WDI: Fast Track (paid construction work-based learning) | $18/hr stipend | Detroit projects | none (Lansing only) | 200 | partial |
| 33 | Detroit EITC (IBEW Local 58 + NECA): electrical apprenticeship | Paid apprenticeship; $30–$50 application fee | Metro Detroit | detroiteitc.org/apply/ | 200 Y/Y | **verified** (closed until spring 2027) |
| 34 | Plumbers Local 98 & MCA Detroit Training Center | Paid apprenticeship; buy books | Metro Detroit | plumbers98tc.org/contact | 200 Y/Y | **verified** (open until 12/18/2026) |
| 35 | Pipefitters Industry Training Center 636 | "Tuition-free" *(aggregator only)* | Metro Detroit | pipefitters636tc.org/contact/ | 200 Y/Y | verified (closed until December) |
| 36 | MRCC: Detroit Union Carpenters & Millwrights Skilled Training Center | Paid apprenticeship | Detroit | buildmifuture.com/locations/ | 200 Y/Y | **verified** |
| 37 | Iron Workers Local 25 | Paid apprenticeship; $50 application fee | Metro Detroit | ironworkers25.org/locations | 200 Y/Y | **verified** |
| 38 | Sheet Metal Workers Local 80 JATC | Paid apprenticeship; $40 cash test fee | Metro Detroit | smw80jac.org/apprenticeship | 200 Y/Y | **verified** |
| 39 | Operating Engineers 324 | Paid apprenticeship; $35 fee | Statewide | none | 200 | partial (dates not announced) |
| 40 | Bricklayers & Allied Craftworkers Local 2 | Not stated | Metro Detroit | none tested | 200 | partial |
| 41 | Laborers (LIUNA Training of Michigan / Local 1191) | No cost to members | Metro Detroit | none | 200 | partial / stale |
| 42 | BLAST Detroit: pre-apprenticeship | Not stated | Detroit | blastdetroit.org/program-offering/ | 200 Y/Y | partial (page last edited 2018) |
| 43 | Empowerment Plan: paid-to-learn jobs for parents in shelters | Paid job | Detroit | none (no phone on site) | 200 | partial |
| 44 | Cass Community Social Services: Green Industries | Paid job | Detroit | casscommunity.org/contact-us/locations/ | 200 Y/Y | partial (no intake info) |
| 45 | Jefferson East Inc.: Connected Learning Center + free small-business tech help | Free | Detroit (east) | jeffersoneast.org/contact | 200 Y/Y | partial (marginal fit) |
| 46 | Detroit Training Center: **FOR-PROFIT** | **Paid** ($3,000 / $6,000 shown) | Detroit | detroittraining.com/ | 200 Y/Y | verified, but flag it |

---

## Candidate details

### 1. SER Metro-Detroit: ReBuild Detroit (apprenticeship readiness)
- **Plain words:** Free 8-week class that gets you ready for a construction apprenticeship. You earn safety cards (OSHA 30, CPR) and get paid a stipend.
- **Offers:** applied math, reading, intro to building trades, OSHA 30, CPR/First Aid/AED, M.U.S.T. registration, WorkKeys/NCRC, capstone project. Help with transportation, work gear and tools.
- **Cost:** free. Stipend "$700+ (based on attendance and completion; subject to change)".
- **Eligible:** Detroit resident, 18+, unemployed or under-employed, HS diploma/GED, "Minimum 6th-grade reading/math level (assessed via CASAS test)". Fast-track is possible for people with work experience.
- **Where:** "9301 Michigan" (Main Office 9301 Michigan Avenue, Detroit, MI 48210).
- **Phone:** main (313) 846-2240 or (313) 945-5200. The page's intake extension belongs to a named staff person, so it is not recorded.
- **Hours:** class "Monday–Friday, 9:00 AM – 3:00 PM". No office hours printed.
- **Access:** online Program Inquiry Form, or call.
- **Cities:** Detroit.
- **Program page:** https://sermetro.org/program-service/adult-programs-services/ser-construction-talent-hub/rebuild-detroit-a-ser-skilled/ (curl 403).
- **Checker URL:** https://sermetro.org/locations/ has "9301 Michigan Avenue" and "(313) 846-2240" (read with WebFetch; curl 403).
- **Stale flag:** "Next Cohort Start: November 10, 2025", with no 2026 cohort shown. A person should confirm it is still running.
- **Status:** partial (script-blocked; cohort date is stale).

### 2. SER Metro-Detroit: Justice Impacted Services (Pathway Home IV)
- **Plain words:** Job training and job placement for people who were in jail or prison, plus up to $1,000 for things like work clothes, tools or getting a driver's license back.
- **Eligible:** 18+, "Currently on probation, parole, or released from correctional facility within past 24 months", lives in the City of Detroit or Wayne County. Pathway Home IV serves people before release.
- **Where/phone:** 9301 Michigan Ave, Detroit; (313) 846-2240 or (313) 945-5200.
- **Program page:** https://sermetro.org/program-service/justice-impacted-services/ (curl 403).
- **Cities:** Detroit plus the rest of Wayne County (that includes Dearborn, Hamtramck and Highland Park).
- **Status:** partial (403). Overlaps lane C (reentry).

### 3. SER Metro-Detroit: Center for Working Families
- **Plain words:** A coach helps you find a job, a coach helps with money and credit, and staff help you sign up for benefits.
- **Offers:** financial coaching, employment coaching (resume, interview, job search, training), income-support help (SNAP, Medicaid, utilities). LISC Detroit lists SER as a CWF partner.
- **Where/phone:** 9301 Michigan Ave; (313) 846-2240 / (313) 945-5200. The CWF contact on the page is a named staff person and is not recorded.
- **Page:** https://sermetro.org/program-service/adult-programs-services/center-for-working-families/ (403).
- **Status:** partial.

### 4. SER Metro-Detroit: Adult Education Services (SW Detroit + FREC East)
- **Plain words:** Free-to-join computer basics classes, English for work, and help with resumes and job searching.
- **Southwest (9301 Michigan Avenue, Detroit, MI 48210):** 12-week "Basic Computer Skills Classes" (NorthStar certificate), career coaching and job placement, job readiness workshops, VESL (English for work, hybrid).
- **East Side (15491 Maddelein St, Detroit, MI 48205):** career coaching, job placement, job readiness workshops. This is at the Ford Resource & Engagement Center East (Fisher Magnet Upper Academy).
- **Eligible:** 18+. **Cost:** not stated. Funded with Ford Philanthropy.
- **Page:** https://sermetro.org/adult-education-services/ (403).
- **Conflict:** SER's own Locations page lists "15491 Maddelein St, Detroit, MI 48216". The ZIP is wrong there; its Adult Ed page says 48205. See also FREC East below.
- **Status:** partial.

### 5. SER Metro-Detroit: Youth (hand to lane C)
- YouthBuild Learning Academy (14–24; East campus 5555 Conner, SW campus 9215 Michigan Ave, Detroit 48210), YouthBuild GED (18–24), Year Round Youth (14–24, WIOA/Detroit at Work). Phone 313-945-5200 ext. 2. Pages return 403.
- **Conflict:** the Locations page gives 5555 Conner as "48215" (Samaritan Center) and "48205" (YouthBuild East), and the homepage says "Samaritan Center: 5555 Conner, Detroit, MI 48213". Three different ZIPs for one building.

### 6. Focus: HOPE: Workforce Development & Education
- **Plain words:** Free job training for most students in computers/IT, machine shop (CNC), robotics and welding, forklift, truck driving (CDL), medical assistant, and construction. They also help you find a job.
- **Programs on page:** IT (15 weeks; CompTIA A+, Python PCEP); IT Developer (15 weeks); Industrial Manufacturing (15 weeks/300 hrs: forklift/hi-lo, CNC with NIMS credentials, FANUC robotics, flux-core welding); Industrial Manufacturing Pre-Apprenticeship with Macomb CC; Construction Pre-Apprenticeship (5 weeks/120 hrs); Logistics & Transportation CDL (10 weeks); Certified Clinical Medical Assistant (20-week hybrid, with Detroit at Work and Skilltrade); Hospitality Pilot (4 weeks, "Limited to Detroit residents only"); DTE Tree Trim Academy (7 weeks incl. CDL-B).
- **Cost:** "Our programs are scholarship based and FREE to most students."
- **Eligible:** HS diploma or GED for all programs. Pass a drug screen and physical if needed. Pass an admissions test (CASAS). Bring photo ID, Social Security card, birth certificate or passport, and diploma/GED.
- **Access:** appointment. "Online testing is conducted at 8:30am & 1:30pm M-TH by appointment only." Info sessions called "Workforce Wednesday" (next listed: "Wednesday, October 14, 1:30pm").
- **Where:** Workforce Development, 1360 Oakman Boulevard, Detroit, MI 48238. HQ is 1400 Oakman Boulevard.
- **Phone:** "Workforce Admissions 313.494.4300" (the program page prints it as "(313) 494-4300").
- **Hours:** no office hours printed; only the test times above.
- **Cities:** Detroit (open to the region).
- **Checker URL:** https://www.focushope.edu/contact/ (curl 200; phone Y, street "1360" Y). Program page https://www.focushope.edu/programs/job-training/ also passes (1400 Oakman in footer).
- **Updated:** job-training page modified 2026-09-01; contact page modified 2026-07-14 (WordPress API).
- **Flags:** "Enrollment for Tree Trim Academy will resume in Spring 2026", so that note is stale. News (WDET, 2026-06-05, *news only*) reports federal funding cuts, so program mix may change.
- **Status:** verified-on-own-page.

### 7. Goodwill of Greater Detroit: Career Academy
- **Plain words:** Training for skilled trades jobs (welding, construction, EV charger installation) and customer service, with help finding a job and getting to class.
- **Programs:** Welding; Intro to Construction; Customer Service Excellence (with CVS Health); EVSE (the page misspells it "ESVE").
- **Eligible:** 18+, HS diploma/GED, "Sixth-grade math & reading level", valid driver's license, Social Security card, birth certificate, "Drug and substance-abuse-free".
- **Cost:** not stated on the page (the homepage says Goodwill provides "free education, training and support services").
- **Where:** Career Academy, 3111 Grand River Avenue, Detroit, MI 48208.
- **Phone conflict:** the Career Academy page says "call (313) 557-8612". The Find-a-Location page says "313.557.8635". A person needs to confirm which is right.
- **Access:** online enroll form or phone.
- **Checker URL:** https://www.goodwilldetroit.org/connect/find-a-location/ (200; 313.557.8635 + 3111 on the page). The program page https://www.goodwilldetroit.org/the-good-we-do/career-academy/ has only a phone and no street.
- **Updated:** both pages modified 2026-09-10 (WordPress API).
- **Status:** verified-on-own-page, but the phone conflict must be resolved.

### 8. Goodwill of Greater Detroit: Flip the Script (Wayne County)
- **Plain words:** Help for people on probation or parole, or coming home from prison: coaching, GED classes, job training and job placement.
- **Programs:** *Welcome Home* (18+, Detroit resident under active federal parole/probation, MI parole, Wayne County probation, juvenile probation, pre-trial, or a Community Violence Intervention member. Bring proof of Detroit residence and proof of justice-involved status). *Education Recovery* (Wayne County residents 16+: GED prep, HS diploma prep for ages 17–20, CASAS prep, "Apprenticeship Entry Exam Preparation"; "All Services Are Free to Wayne County Residents"; transportation help and incentives). *Safer Communities Stronger Families* (probationers aged 16–39 under MDOC; needs court paperwork).
- **Where:** Flip the Script – Wayne County, 2777 East Grand Boulevard, Detroit, MI 48211. **Phone:** 313.557.4848.
- **Checker URL:** https://www.goodwilldetroit.org/connect/find-a-location/ (200; phone Y, street Y).
- **Updated:** program page 2026-05-04.
- **Status:** verified-on-own-page. Overlaps lane C (reentry); Education Recovery overlaps lane D.

### 9. MiSide (formerly Southwest Solutions): Earn + Learn
- **Plain words:** Free job training with pay while you learn: truck driving (CDL-A), electrical/heating and cooling, construction, customer service. Includes GED help, rides and work clothes.
- **Eligible:** Veterans, or residents of **Detroit, Highland Park or Hamtramck** who are formerly incarcerated or chronically unemployed (the page's third bullet is garbled: "A 18 years old"). Must be authorized to work, registered with Selective Service (if male), WIOA-eligible for some trainings, pass a drug screen, and "Test above a fifth-grade level in math and reading". The page also calls it "open to low-income Detroiters and residents of Highland Park and Hamtramck, as well as veterans."
- **Cost:** free. "Stipends during training contingent on attendance and participation".
- **Where:** MiSide Wealth, 2835 Bagley, Suite 800 (2nd Floor), Detroit, Michigan 48216. **Phone:** 313.841.9641.
- **Access:** online interest form, or call.
- **Checker URL:** https://miside.org/miside-wealth/earn-learn (200; Y/Y).
- **Also on page:** State-endorsed Apprenticeship Readiness (MARC) program with the Carpenters (MRCC) as sponsor. Most recent results cited are from 2023.
- **Stale site warning:** the old domain **swsol.org is still live** and shows older text (a different eligibility list, a sixth-grade test level, a staff intake line, and 2013–2014 outcome numbers). Link only to miside.org. The org merged with Development Centers in 2023 and is now "MiSide Community Impact Network" (*news only* for the merger date; miside.org confirms the name).
- **Status:** verified-on-own-page.

### 10. MiSide: Pre-Apprenticeship Program (construction, adults 18+)
- **Plain words:** Free construction training where you fix up real houses, earn safety and trade certificates, and get paid a stipend. There are day and evening classes.
- **Offers:** NCCER pre-apprentice credential, MIOSHA 30, First Aid, Customer Service, Lead and Asbestos certificates, M.U.S.T. certificate, HS diploma/HSE instruction if needed, stipend, on-the-job training. The page says "you are guaranteed employment or an interview with a local union." Partners include MRCC (carpenters) and Bricklayers Local 2.
- **Eligible:** 18+, "Driver's License or eligible to drive", interested in a construction trade.
- **Where:** 4220 W. Vernor Hwy., Detroit, MI 48209. **Phone:** "Call 313-297-0065" (enrollment line).
- **Hours:** "Day program: Monday to Friday from 9AM – 3PM"; "Evening program: Monday -Friday from 4:30 PM – 7:30 PM".
- **Checker URL:** https://miside.org/miwealth/Pre-ApprenticeshipPrograms (200; Y/Y).
- **Status:** verified-on-own-page.

### 11. MiSide Youth Academy (ages 18–24 without a diploma; lane C overlap)
- **Plain words:** Free 24-week program for young adults without a diploma. You learn construction, work toward a diploma or GED, and get a stipend.
- **Eligible:** 18–24, Detroit resident, valid state ID or license, no HS diploma/GED, interested in a construction trade.
- **Where/hours:** "Monday to Friday from 9AM – 3PM at 4220 W. Vernor Hwy., Detroit, MI 48209". **Phone:** "Call 313-297-0065".
- **Checker URL:** https://miside.org/miwealth/miside-youth-academy (200; Y/Y).
- **Status:** verified-on-own-page. The results section cites 2019 figures.

### 12. MiSide Wealth: Center for Working Families (LISC Financial Opportunity Center)
- **Plain words:** Free coaching on jobs, money and benefits.
- **Page says:** "MiSide Wealth is proud to be a LISC Financial Opportunity Center." Services are financial coaching, workforce development coaching and income-support coaching. The page lists no address or phone.
- **Where/phone (contact page):** MiSide Wealth (Southwest Detroit), 2835 Bagley, Suite 800, Detroit, MI 48216, "313 - 841 - 9641".
- **Checker URL:** https://miside.org/contact-us (200; Y/Y). Program page: https://miside.org/miwealth/miside-wealths-center-working-families-model.
- **Status:** verified (address and phone taken from the contact page).

### 13. Matrix Human Services: Workforce Development Services + Skills 2 Build
- **Plain words:** Free-to-ask career coaching and job search help on Detroit's east side, plus training for manufacturing, medical assistant and community health worker jobs.
- **Workforce Development Services (Adult page):** one-on-one career coaching, resume and job search help, employment referrals. Matrix also runs SNAP employment help ("Are you a SNAP recipient … seeking employment?") and financial coaching. LISC lists Matrix as a CWF partner.
- **Skills 2 Build:** "Current training opportunities include Manufacturing, Certified Medical Assistant, and Community Health Worker programs." Interest form online.
- **Where:** The Matrix Center, 13560 E McNichols Rd, Detroit, MI 48205. **Phone:** "Call 313-526-4000 to contact Matrix staff" (Matrix Center page). The main office line on every page is (313) 962-5255.
- **Cost/eligibility:** not stated.
- **Checker URL:** https://www.matrixhumanservices.org/the-matrix-center/ (200; Y/Y). The Skills 2 Build page https://www.matrixhumanservices.org/skills-2-build/ has only (313) 962-5255 and no street address.
- **Updated:** Skills 2 Build 2026-07-01; Adult 2026-01-13; Matrix Center page 2025-02-25.
- **Status:** verified (the address comes from the Matrix Center page, not the program page).

### 14. Urban League of Detroit & Southeastern Michigan: Workforce Career Development Center
- **Plain words:** Help with resumes, job leads, mock interviews and a computer lab.
- **Page says:** services "are open to all who are seeking help with employment leads". They are located at the "Family and Community Development Center located at 15770 James Couzens Freeway in Detroit Michigan". Registration is online.
- **Phone:** only the HQ line, "313-832-4600", on the contact page with HQ address 208 Mack Ave. Detroit, MI 48201. **No page has both the WCDC address and a phone.**
- **Pages:** https://www.deturbanleague.org/wcdc (200; street Y, phone N); https://www.deturbanleague.org/contact-us (200; HQ Y/Y).
- **Status:** partial. A person should confirm which phone reaches the James Couzens site.

### 15. Urban League: Urban Seniors Jobs Program (55+)
- **Plain words:** Paid job training for low-income people aged 55 and up.
- **Page says:** 55+, low income, Wayne or Oakland County resident. "PAID employment training". "call: 313-831-5591". No address on the page.
- **Page:** https://www.deturbanleague.org/usjp (200; phone Y, street N).
- **Status:** partial. This is probably an SCSEP grantee, so hand it to lane A/C.

### 16. Wayne Metro Community Action Agency: paid job training
- **Plain words:** Get paid $16 an hour while you train for green jobs (weatherization, solar) or customer service jobs.
- **Growing Green:** 10 weeks, "up to 34 hours per week", "$16 an hour stipends"; OSHA 10, Lead RRP, weatherization certifications.
- **SWIFT (Solar & Weatherization Impact-Free Training):** 16 weeks (8 weatherization + 8 solar), "$16 an hour". The page's FAQ also says "10 week", which contradicts it.
- **Career Institute:** customer service pathway, "10 weeks long, 34 hours per week", "$16 an hour".
- **Eligible (all):** 18+, income eligible, HS diploma/GED, pass a criminal background check and a drug screen. Documents: ID, SSN, water bill, lease, proof of income or TANF/SNAP/SER/SSI enrollment.
- **Phone:** Connect Center (313) 388-9799. Homepage hours via WebFetch: "Monday-Friday: 8am-6pm", "Saturday: 9am-12pm". Mailing address on the employment page: 7310 Woodward Ave, Suite 800, Detroit MI 48202.
- **Pages:** https://www.waynemetro.org/employment/, /growing-green/, /swift/, /career-institute/. **All return 403 to curl (Sucuri firewall).**
- **Cities:** Wayne County (all four cities).
- **Status:** partial (script-blocked). A person must check in a browser. Wayne Metro is also a LISC CWF partner.

### 17. ACCESS: Hamtramck Center
- **Plain words:** ACCESS office in Hamtramck with job help and money coaching.
- **Page says:** "ACCESS HAMTRAMCK CENTER, Financial Coaching; Social Services; Workforce Development, 9301 Joseph Campau Street, Hamtramck, MI 48212, Phone: 313-842-7726".
- **Checker URL:** https://www.accesscommunity.org/contact (200; Y/Y).
- **Gap:** no program page describes the Hamtramck workforce services, hours, cost or eligibility.
- **Status:** verified for the location; program details unverified. **This is the only Hamtramck-sited workforce door I could verify.**

### 18. ACCESS: One-Stop Employment and Human Services Center (Dearborn)
- **Page says:** "Behavioral Health; Business Development Program; Michigan Works!; Social Services, 6451 Schaefer Road, Dearborn, MI 48126, Phone: (313) 945-8380". The financial-stability page lists the CWF Social Services Department at the same address, "Phone: 313.203.1874".
- **Services (job-seeker page):** case management, resume help, job club, workshops, WIOA (for "Wayne County, excluding the city of Detroit"), PATH (TANF referrals), refugee support, veterans' rep, Learning Lab.
- **Stale flag:** the job-seeker page https://www.accesscommunity.org/employment-services/job-seeker-resources quotes 2013 numbers and "WIA". The Career Path project page lists partners that may no longer be current.
- **Checker URL:** https://www.accesscommunity.org/contact (200; Y/Y).
- **Status:** verified location; mostly lane A (Michigan Works!).

### 19. ACCESS: Detroit Career Center (Michigan Works!/Workforce Development)
- **Contact page:** "16427 W. Warren Avenue, Detroit, MI 48228, Phone: (313) 429-2469".
- **Conflict:** the financial-stability page says "ACCESS Detroit One Stop Career Center 14627 W. Warren … Office: 313 429-2469". The street numbers are transposed; one of them is wrong.
- **Checker URLs:** https://www.accesscommunity.org/contact (16427) and https://www.accesscommunity.org/human-services/financial-stability (14627). Both return 200, Y/Y.
- **Status:** verified, but the address conflict must be resolved. Lane A overlap (probably a Detroit at Work center).

### 20. ACCESS: Business Development Program
- **Plain words:** Free-to-ask help starting a small business: a business coach, workshops, and a 5–7 week class in English or Arabic.
- **Page says:** "5-7 Week training for aspiring entrepreneurs in both English and Arabic … call 313-842-7010". The address is not on that page.
- **Checker URL:** https://www.accesscommunity.org/contact (HQ 2651 Saulino Court, Dearborn, MI 48120, "Phone: (313) 842-7010"; 200 Y/Y). Program page: https://www.accesscommunity.org/employment-services/entrepreneur-resources.
- **Cost:** not stated. **Status:** verified (the address comes from the contact page).

### 21. LAHC (Leaders Advancing and Helping Communities), Dearborn: Workforce Development & Education
- **Plain words:** Free career coaching, help getting your driver's license back, computer classes and English classes, in English, Arabic and Spanish.
- **Page says:** "All programs are free and offered in English, Arabic, and Spanish." WayneLINC – Career Navigation (personal coaching, career planning, "Support with driving privilege reinstatement", childcare and transportation help); financial literacy; digital literacy ("Online Job Skills"); ESL; youth leadership.
- **Where:** 5275 Kenilworth St., Dearborn, MI 48126. **Phone:** (313) 846-8480. No hours printed.
- **Checker URL:** https://lahc.org/workforce-development/ (200; Y/Y). Modified 2026-09-14.
- **Flag:** news (*news only*, WXYZ and Arab American News, Aug 2026) reports a new $3M behavioral health and workforce hub. Its address is not on lahc.org, so a person should check whether workforce services moved.
- **Status:** verified-on-own-page.

### 22. International Institute of Metropolitan Detroit: Center for Working Families
- **Plain words:** Job coaching (resumes, interviews), money coaching and help signing up for benefits. Also ESL, computer and GED classes.
- **Page says:** joined the Greater Detroit CWF network in July 2019. Offers workforce development coaching, financial coaching and income-support coaching.
- **Where/phone:** 111 E Kirby St, Detroit, MI 48202; (313) 871-8600 (main line). findhelp lists 313-600-7618 for CWF (*aggregator only*, not used).
- **Checker URL:** https://www.iimd.org/center-for-working-families (200; Y/Y). Page footer © 2025.
- **Status:** verified-on-own-page. Eligibility and cost are not stated. The immigrant focus overlaps lane C.

### 23. Operation ABLE of Michigan (Spectrum Human Services)
- **Plain words:** Job search help and training for adults, especially people in mid-career and older.
- **Page says:** "helps adults find employment via personalized searches, job placement, occupational training and career transition services. Our special niche is helping adults at midcareer and beyond." Also a LISC CWF partner.
- **Where/phone:** 4750 Woodward Avenue - Suite 201, Detroit, MI 48201; (313) 832-0922.
- **Hours:** not on the own page. findhelp says M–F 8–5 (*aggregator only*).
- **Checker URL:** https://www.spectrumhuman.org/OperationAble (200; Y/Y).
- **Flag:** the page has no dates and its success stories look old. Currency needs a phone check.
- **Status:** verified location; currency unverified.

### 24. The Greening of Detroit: Detroit Conservation Corps (adult workforce training)
- **Plain words:** Free 5–6 week training to work in tree care or landscaping, with a stipend up to $600. Most felony records are OK.
- **Courses:** Certified Tree Artisan; Certified Landscape Technician (CPR/First Aid, MIOSHA 10, landscape certification, financial literacy, work readiness). Cohort 76.1 includes Snow Removal Certification.
- **Eligible:** 18+, resident of **Detroit, Hamtramck or Highland Park**, "have a barrier to employment. Most felony convictions are welcome." "Must pass a , Physical, and Covid-19 Test, and Drug Screening upon completion" (sic).
- **2026 cohorts on page:** 75: 8/10/26–9/18/26; **76: 10/5/26–11/13/26**; 76.1: 11/30/2026–12/11/2026.
- **Where:** 13000 West McNichols Rd, Detroit, MI 48235. **Phone:** main (313)237-8733. A second number on the page sits next to a staff email and is not recorded.
- **Access:** online sign-up.
- **Checker URL:** https://www.greeningofdetroit.com/adult-training (200; Y/Y).
- **Status:** verified-on-own-page. **Strong candidate; serves 3 of our 4 cities.**

### 25. Detroit Hispanic Development Corporation (DHDC): Entrepreneurship & Wealth Building
- **Plain words:** Free one-on-one business coaching in English or Spanish and a "Side Hustle to CEO" class.
- **Offers:** free 1-on-1 coaching, free branding/marketing coaching, grant info, Side Hustle to CEO and Hustle & Grow workshops, Fantazma pop-up market for vendors. The contact person on the page is a named staff member and is not recorded.
- **Where/phone:** 1211 Trumbull, Detroit MI, 48216; 313.967.4880.
- **Checker URL:** https://www.dhdc1.org/programs/entrepreneurship/ (200; Y/Y). Modified 2026-07-29.
- **Note:** DHDC's Adult Services are ESL (lane D) with GED referrals only. DHDC lists no job-placement program.
- **Status:** verified-on-own-page.

### 26. ProsperUs Detroit: Entrepreneur Training Program
- **Plain words:** A free 12-week class to plan and start your own business, with 10 hours of one-on-one coaching. Offered in Spanish too.
- **Cost:** "No Cost: All expenses including classes, one-on-one meetings, and a textbook are funded by the Michigan Economic Development Corporation Small Business Support Hub."
- **Eligible:** "people who live and/or operate their business in Detroit, Hamtramck, Highland Park or Inkster". There is an application and maybe an interview; some applicants are sent to Business 101 first. Priority goes to low-income BIPOC and immigrant applicants.
- **Timing:** "We will be accepting applications for the Spring 2027 Entrepreneur Training Program soon!" (not open today).
- **Where/phone:** 950 Selden St, Suite 330, Detroit, MI 48201; (313) 586-0655; "By appointment only".
- **Checker URL:** https://prosperusdetroit.org/training/ (200; Y/Y). Modified 2026-08-24.
- **Status:** verified-on-own-page.

### 27. TechTown Detroit: small business programs (low priority)
- **Page says:** free 25-minute consultations with strategists; Coaching Up (one-on-one help for Wayne County small businesses); The Shop ("This free program"); Retail Boot Camp ("$0 to apply ($199 if accepted, refunded after successful completion"; the Intensive edition closes Oct. 8). It is part of the MEDC Small Business Support Hub with ProsperUs, Eastern Market, Michigan SBDC and BUILD.
- **Where/phone:** 440 Burroughs Street, Detroit, MI 48202; (313) 879-5250.
- **Checker URL:** https://techtowndetroit.org/what-we-do/small-business-programs/ (200; Y/Y).
- **Status:** verified. This serves business owners, not job seekers, and the Retail Boot Camp deposit means it is not fully free.

### 28. Per Scholas Detroit
- **Plain words:** Free 15-week tech training (IT support, cybersecurity, healthcare IT) with career coaching and help getting hired.
- **Cost:** "no-cost tuition", "do not ever ask for payment or income sharing". The page also says "Per Scholas does not pay learners to attend", and offers optional 0% loans for living costs.
- **Next starts on page:** AI-Enabled IT Support (Remote) Nov 2, 2026, apply by Oct 19, 2026; Cybersecurity (Remote) Nov 23, 2026, apply by Nov 9; Healthcare IT Technician (Hybrid) Dec 7, 2026, apply by Nov 23.
- **Where:** 3031 W. Grand Blvd., Suite 545, Detroit, MI 48202. **Phone:** only the national line, "718-991-8400". The page lists staff names; none are recorded.
- **Checker URL:** https://perscholas.org/locations/detroit/ (200; Y/Y with the national phone).
- **Oddity:** the site's Locations menu does not list Detroit, but the Detroit page is live with future dates.
- **Status:** verified-on-own-page (no local phone).

### 29. Year Up United: Detroit
- **Page says:** ages 18–29, "tuition-free", tracks in Banking and Customer Success, start date "Fall / October 2026". It prints "Detroit, MI 48226" with no street and no phone.
- **Page:** https://www.yearup.org/locations/detroit-mi (200).
- **Status:** partial (no street, no phone). Lane C overlap (young adults).

### 30. NPower Michigan: Tech Fundamentals
- **Page says:** trains "young adults, military veterans, and military spouses of Detroit". Office: 116 Lothrop Street, Detroit, MI 48202. The only phones printed are named staff lines, so none are recorded.
- **Aggregator/news only:** free program; ages 18–26 and veterans; about 20 weeks.
- **Page:** https://www.npower.org/locations/michigan/ (200).
- **Status:** partial (no org phone; no current class dates on the page).

### 31. Michigan Workforce Development Institute (WDI, Michigan AFL-CIO): Access for All
- **Plain words:** Free 9-week (300-hour) class that prepares you to apply to union construction apprenticeships. It includes a small stipend and help with rides and childcare.
- **Credentials:** OSHA 30, First Aid/CPR, asbestos/lead/silica awareness, NABTU certificate (MC3).
- **Eligible:** WorkKeys Level 4 in Applied Math, Reading and Locating Information (they will help if you score lower), 18+ with a valid driver's license, HS diploma/GED, pass drug test, background check and physical, reliable transportation, panel interview.
- **Where:** WDI runs the "Highland Park MI Works! Service Center, 144 East Manchester St., Highland Park, MI 48203, Phone : (313) 826-0299". The Access for All page links a video titled "Access For All and OE324 Partner in Highland Park" but does not state the class site outright.
- **Checker URL:** https://miwdi.org/locations/ (200; Y/Y). The program page https://miwdi.org/accessforall/ lists only the Lansing office, (517) 372-0784.
- **Status:** verified-on-own-page for the Highland Park site; the class location is inferred. **This is the only Highland Park-sited workforce door found** besides the MW! center itself (lane A).

### 32. WDI + Michigan Building Trades: Fast Track
- **Page says:** a 4-month program placing participants with subcontractors "on major building projects within the city of Detroit", 40 hrs/week, "stipend based on $18 an hour". Only the Lansing contact is printed.
- **Page:** https://miwdi.org/fast-track/ (200). No eligibility and no dates.
- **Status:** partial.

### 33. Detroit Electrical Industry Training Center (IBEW Local 58 + SE Michigan NECA)
- **Plain words:** A paid apprenticeship to become an electrician. You work and earn from week one, and the schooling leaves you with no debt. There is a small fee to apply.
- **Programs:** Inside Wireman (5 yr), Sound/Communication/Data (3 yr), Residential (3 yr).
- **Apply:** online account first, then the application while the portal is open. "**Application Portal is Closed. Application dates will be posted the spring of 2027**". Fees: "Inside Program: $50.00 … Residential: $30.00". Need to be 17+ with one year of HS algebra and a diploma or GED. No computer? You can apply at the facility "between the hours of 9am-3pm" on application day. The page also points to a Summer Worker Program.
- **Where/phone:** 2277 E 11 Mile Rd Suite 1, Warren, MI 48092; 586-751-6600 ("between the hours of 9am-4pm, Monday-Friday").
- **Checker URL:** https://detroiteitc.org/apply/ (200; Y/Y). Modified 2026-08-26.
- **Cities:** serves metro Detroit; the site is in Warren, outside our area.
- **Status:** verified-on-own-page.

### 34. Plumbers Local 98 & MCA Detroit Training Center
- **Plain words:** A paid 5-year apprenticeship to become a plumber. **Applications are open now** until Dec 18, 2026, or until 200 people apply.
- **Needs:** 18 by class start, valid driver's license, diploma/transcript/GED, WorkKeys scores (Applied Math 6, Graphic Literacy 5, Workplace Documents 5) and Wiesen Mechanical Aptitude raw 48, all taken at a proctored site such as a Michigan Works! center or community college. Apprentices buy their own books.
- **Where/phone:** 1911 Ring Drive, Troy, MI 48083; 248-585-1435; "Monday - Friday 7:00 AM - 3:30 PM".
- **Checker URL:** https://www.plumbers98tc.org/contact (200; Y/Y). Program info: https://www.plumbers98tc.org/apprenticeship.
- **Status:** verified-on-own-page.

### 35. Pipefitters Industry Training Center 636
- **Page says:** "Application period is now closed. We will begin accepting applications in December." Classes usually start "every April and October". Links to free WorkKeys prep.
- **Where/phone:** 636 Executive Drive, Troy, MI 48083; "Telephone: +248 585-0636" (the homepage prints "(248) 585-0636").
- **Checker URL:** https://pipefitters636tc.org/contact/ (200; Y/Y).
- **Cost:** "tuition-free" appears only on the union site and in search snippets (*aggregator only* here).
- **Status:** verified-on-own-page.

### 36. Michigan Regional Council of Carpenters & Millwrights: Detroit training center
- **Plain words:** A paid 4-year apprenticeship for carpenters, millwrights and floor layers. The training center is in Detroit.
- **Apply:** "Request an application: Text MRCCAPP to (855) 424-2562". Apprentices start at 55–70% of journeyworker pay.
- **Where/phone:** Detroit Union Carpenters and Millwrights Skilled Training Center, 11687 American Ave, Detroit, MI 48204; (248) 541-2740.
- **Checker URL:** https://www.buildmifuture.com/locations/ (200; Y/Y). How to apply: https://www.buildmifuture.com/how-to-apply/.
- **Status:** verified-on-own-page. No dates or windows are posted, so it appears rolling (unconfirmed).

### 37. Iron Workers Local 25
- **Apply:** online application, "The application fee is $50", then bring 4 original documents (driver's license, birth certificate, SS card, diploma/transcript/GED) to an appointment. About 3 hours of aptitude testing.
- **Where/phone:** Iron Workers Local 25 Training Center, 50490 W. Pontiac Trail, Wixom, MI 48393; "Ph# 248-960-2130".
- **Checker URL:** https://www.ironworkers25.org/locations (200; Y/Y). Guide: https://ironworkers25.org/online-application-guide.
- **Status:** verified-on-own-page (the site is outside our area).

### 38. Sheet Metal Workers Local 80 JATC
- **Apply:** "Monday - Friday by appointment." Bring a diploma/GED and a driver's license, plus "$40 cash testing fee" (non-refundable). The entrance exam is the Bennett Mechanical plus 3 WorkKeys tests; search snippets say it is held in January and July.
- **Where/phone:** 32700 Dequindre Road, Warren; (586) 979-5190.
- **Checker URL:** https://www.smw80jac.org/apprenticeship (200; Y/Y).
- **Status:** verified-on-own-page.

### 39. Operating Engineers Local 324 (heavy equipment, stationary engineer)
- **Page says:** "THE NEXT … APPLICATION DATES HAVE NOT BEEN ANNOUNCED". "$35 non-refundable application fee", 17+, Michigan driver's license and residency, WorkKeys scores (lists "SEMCA Michigan Works Highland Park – (313) 826-0299" and "Wayne Community College –313.992.3311" as test sites). There is a sign-up form for alerts. Search snippets say the last window was April 6–10, 2026 and filled within hours.
- **Page:** https://www.oe324.org/application/ (200). No training-center address or phone on the page.
- **Status:** partial.

### 40. Bricklayers & Allied Craftworkers Local 2 (Michigan)
- **Page:** https://www.michiganbricklayers.org/application (200) is an embedded JotForm with no text. The footer lists the Warren Office, 21031 Ryan Rd., Warren, MI 48091, (586) 754-0888. A 12-week pre-job program is *aggregator only*.
- **Status:** partial (a person needs to open the form to see requirements and dates).

### 41. Laborers (LIUNA Training of Michigan / Laborers' Local 1191 Detroit)
- **Page says:** the apprenticeship takes 4,000 work hours plus 300 training hours, with "no out of pocket cost to LIUNA Laborers" (*aggregator snippet*). Entry is through the local union. Local 1191: 2161 West Grand Boulevard, Detroit, MI 48208, (313) 894-2241.
- **Pages:** https://www.lt-mi.org/apprenticeship/ (200); https://laborerslocal1191.org/Training-Information (200, **stale: 2017 class notice, "Roll Call Dates 2019-2020"**).
- **Status:** partial / stale.

### 42. BLAST Detroit: pre-apprenticeship
- **Page says:** 8-week, 240-hour apprenticeship readiness program; MIOSHA-30, NCRC. Requirements include "16 years or older" and "Michigan Works-DESC -MRS- DHS Referrals", WorkKeys Level 4.
- **Where/phone/hours:** 6357 East Jefferson Ave, Detroit, MI 48207; (313) 818-3311; "Monday—Friday: 10:00AM–7:00PM".
- **Checker URL:** https://blastdetroit.org/program-offering/ (200; Y/Y).
- **Flag:** WordPress says the page was **last modified 2018-04-23**, and entry is by agency referral.
- **Status:** partial (currency unverified).

### 43. Empowerment Plan
- **Plain words:** A full-time paid job sewing coats for parents leaving homeless shelters, with GED classes, driver's ed and coaching built into paid time.
- **Page says:** hires through "local shelter partners … informational sessions at various shelters … referrals". 60% production, 40% programs. Graduates average $16.00/hr.
- **Where:** 7640 Kercheval Ave. Detroit, MI 48214. **No phone on the site.** The "Join Our Team" link opens a Google Form that is **closed**.
- **Status:** partial (no phone; not a walk-in door; hiring may be paused).

### 44. Cass Community Social Services: Green Industries
- **Page says:** jobs for "people with significant barriers to employment" making mud mats and coasters, recycling, and document shredding on Cass's campus. No intake path, eligibility or hours are given.
- **Where/phone:** World Building, 11745 Rosa Parks Boulevard, Detroit, MI 48206; (313) 883-2277.
- **Checker URL:** https://casscommunity.org/contact-us/locations/ (200; Y/Y). Program page modified 2025-11-18.
- **Status:** partial. It is probably open only to Cass program participants; a person should call.

### 45. Jefferson East Inc.: Connected Learning Center & small-business tech help (marginal)
- **Offers:** free computers and internet for job search; free self-paced AI and financial-literacy mini-courses; free one-on-one tech help for small businesses. There is no job training or placement.
- **Where:** Neighborhood Resource Hub, 14300 E. Jefferson Ave, Detroit, MI 48215 (enter on Lakewood St.). Phones: Housing Services 313-314-6414; Rivertown office "Main: 313-331-7939" (300 River Place Drive). Program contacts on the pages are named staff and are not recorded.
- **Hours conflict:** the contact page says "NEW Hours Tuesdays, Wednesdays, & Thursdays | 9:30 AM- 2:30 PM". The CLC page says "Tuesdays & Wednesdays 10:00 AM - 2:30 PM" and drop-in "10:00 AM - 4:00 PM".
- **Checker URL:** https://www.jeffersoneast.org/contact (200; Y/Y with 313-314-6414).
- **Status:** partial (marginal fit for a jobs listing).

### 46. Detroit Training Center: **FOR-PROFIT, paid**
- **Offers:** heavy equipment operator, drywall finishing, MIG welding, forklift, OSHA 10/30, residential builders license class.
- **Cost:** the heavy-equipment page shows "$3,000.00" and "$6,000.00", with refunds prorated. The own site does not say whether Detroit at Work pays for residents.
- **Where/phone:** 23323 Schoolcraft, Detroit, MI, 48223; (313) 221-5876.
- **Checker URL:** https://detroittraining.com/ (200; Y/Y).
- **Status:** verified, but **flag it as for-profit and paid**. Do not list it as free help. If it is listed at all, say so plainly.

---

## Checked and excluded (ended, paused, not a public door, or no jobs program)

- **Build Institute:** its own site says the board "made the decision to pause operations at the end of 2025". Registration says "Check back for our 2026 Programs Schedule". **Do not list.**
- **Ford Resource & Engagement Center (FREC) Southwest at the Mercado:** Ford's own page says "The Mercado services closed in March 2024". Partners moved: SER at 9301 Michigan Ave; Southwest Detroit Immigrant & Refugee Center legal clinics; LA SED at 4138 W. Vernor. **Do not list FREC SW as a place.**
- **FREC East (Detroit, East):** still open per Ford ("job placement services", "Monday – Friday: 8 a.m. – 9 p.m. Saturday: 9 a.m. – 4 p.m. Sunday: Closed", "Phone: 313-733-1240"). **Address conflict on the same Ford page:** "15941 Maddelein" in the address line vs "15491 Maddelein St." in the legal-clinic line. SER prints "15491 Maddelein" (ZIP 48205 on one page, 48216 on another). 15491 looks right, but a person must confirm. Jobs work there is SER's (see #4). Checker URL https://www.fordphilanthropy.org/ford-community-centers (200; phone Y, "15941" Y).
- **LA SED:** its own site lists only ESL, citizenship, youth and seniors, with no employment program. The ESL goes to lane D (7150 W. Vernor St., 313-841-1419).
- **Congress of Communities:** its site lists no workforce program today.
- **Neighborhood Service Organization (NSO):** no employment program on the main site. The YouthLink page is orphaned (not linked from the homepage, © 2017, 9641 Harper Ave., "(313) 961-4890, ext. 8221"). Treat it as stale and hand to lane C for a check.
- **Detroit Rescue Mission Ministries:** "job training" appears only inside its residential treatment services, so there is no public job-training door.
- **Brilliant Detroit:** a family/early-childhood hub model, with no adult workforce program found.
- **We Want Green Too:** its own page says the EGLE training grant is done and they are "working towards securing additional funding". Not currently running.
- **Grand Circus:** Cloudflare blocks scripts (curl 403 "Sorry, you have been blocked"), and WebFetch also got 403. A search snippet (*aggregator only*) says it "is not currently offering public bootcamps". Unverified. A person should check in a browser before listing.
- **Capuchin Soup Kitchen: Earthworks Agriculture Training (EAT):** Cloudflare challenge (curl 403, "cf-mitigated: challenge"). Unverified; needs a browser. It could be a good free farm-job training program for Detroiters if it is still running.
- **Goodwill "Detroit Career Center":** the page exists but is empty (modified 2025-07-17). The Career Centers page says Goodwill "currently operate[s] two Oakland County Michigan Works! One Stop Service Centers (Pontiac and Novi)". **Goodwill runs no Detroit career center now** (tell lane A).
- **Southwest Solutions (swsol.org):** the legacy site is still online with old numbers and an old career-center address. The org is now **MiSide**, so use miside.org only.
- **Catholic Charities of Southeast Michigan:** LISC lists it as a CWF partner, but I found no CWF or employment page on its own site. Not verified.
- **Michigan Building Trades "Building Futures":** no Michigan program by that name found. The closest matches are MUST Construction Careers (mustcareers.org, not checked), WDI Access for All (#31) and Fast Track (#32).
- **MiCareerQuest:** a career-exploration event for high school students, not a door for residents. Not researched further.
- **Emerging Industries Training Institute (EITI):** a Detroit at Work training provider (5555 Conner per aggregator/Detroit at Work PDF). Its own site (trainandemploy.org) was not checked. Hand to lane A with the other DAW providers.

## Handoffs to other lanes

- **Lane A (public system):**
  - SER runs Detroit at Work centers at Northwest Activities Center (18100 Meyers Rd, 48235) and Southwest (9301 Michigan Ave, 48210). The SER page says "(313) 962-9675" and "Monday-Wednesday: 8:00 AM – 5:00 PM, Thursday: 8:00 AM – 7:00 PM (extended), Friday: 8:00 AM – 5:00 PM" (curl 403).
  - MiSide's Detroit at Work center: miside.org says "24424 W. McNichols, Detroit, 48219, 313 - 246-6020", "open Monday through Friday from 8AM to 5PM. On Wednesday, we're open until 7PM". The legacy swsol.org says 2835 Bagley (via 313-962-9675). **The late-night day conflicts: SER says Thursday, MiSide says Wednesday.**
  - ACCESS Detroit Career Center, W. Warren: 16427 vs 14627 conflict (see #19).
  - ACCESS Dearborn One-Stop at 6451 Schaefer is a Michigan Works! site.
  - Gesher Human Services (formerly JVS) Detroit at Work center at 4250 Woodward (*aggregator/Yelp only*).
  - WDI operates the SEMCA Michigan Works! Highland Park center (144 E. Manchester St., (313) 826-0299).
  - WayneLINC (a Wayne County career-navigation program; SEMCA hub) is delivered at LAHC and appears on Wayne Metro's site.
  - Urban League USJP (55+) looks like a senior jobs program (SCSEP-type).
- **Lane C (special populations):** SER Justice Impacted/Pathway Home IV; Goodwill Flip the Script; SER YouthBuild and Year Round Youth; MiSide Youth Academy; NSO YouthLink (stale); Year Up and NPower (young adults); BLAST (16+); Empowerment Plan (parents in shelters); Operation ABLE (mid-career and older); IIMD (immigrants).
- **Lane D (education):** MiSide Adult Learning Lab (4214 W. Vernor, Detroit, MI 48209; 313-451-8055; GED and ESL; "9:00 A.M. - 8:00 P.M. Monday through Thursday"); LA SED ESL; DHDC ESL; SER VESL and computer classes; Matrix online HS diploma; ACCESS Learning Lab.

## Gaps and blockers

1. **Script-blocked sites.** SER Metro-Detroit and Wayne Metro (Sucuri, curl 403) are two of the most important Detroit providers, and our checker cannot read them. Grand Circus and Capuchin/Earthworks sit behind Cloudflare and are unverified. The pipeline needs a "checked by a person" path for these, or the sites must be asked to allowlist our honest user-agent.
2. **Conflicting facts that a person must settle before listing:**
   - Goodwill Career Academy phone: (313) 557-8612 vs 313.557.8635.
   - ACCESS Detroit Career Center: 16427 vs 14627 W. Warren.
   - FREC East: 15491 vs 15941 Maddelein (and ZIP 48205 vs 48216 on SER's page).
   - SER 5555 Conner: ZIP 48205 / 48213 / 48215.
   - MiSide's Detroit at Work center: 24424 W. McNichols (miside.org) vs 2835 Bagley (legacy swsol.org).
   - Detroit at Work extended hours: Thursday (SER) vs Wednesday (MiSide).
   - Wayne Metro SWIFT length: 16 vs 10 weeks.
   - Jefferson East hub hours.
3. **Stale or undated pages:** SER ReBuild's last listed cohort is Nov 10, 2025. BLAST's page was last edited in 2018. The Laborers Local 1191 site is from 2017–2020. ACCESS job-seeker text is from 2013 (WIA-era). The Cass Green Industries and Operation ABLE pages carry no dates. The swsol.org legacy site is still indexed.
4. **Program page has no street or no phone (checker needs a second page):** Goodwill Career Academy, Matrix Skills 2 Build, MiSide CWF, ACCESS Business Development, Urban League WCDC (no page pairs its James Couzens address with any phone), Year Up (no street or phone), NPower (only staff lines), OE 324, WDI Fast Track, Empowerment Plan (no phone anywhere). For these, the "checker URL" above is a contact or locations page, and the program is tied to it by a person's judgment.
5. **Hamtramck and Highland Park are thin.** The only verified sited doors are the ACCESS Hamtramck Center (9301 Joseph Campau; workforce services are named but not described) and WDI Access for All at the Highland Park Michigan Works! center. Programs open to their residents but held elsewhere: MiSide Earn + Learn, Greening of Detroit Conservation Corps, ProsperUs, Detroit at Work YouthBuild (lane A/C).
6. **Dearborn:** LAHC (verified) and ACCESS (verified locations; stale program text). The new LAHC workforce hub address is in the news only.
7. **Union apprenticeships have fees and windows.** Application fees are $30–$50 (EITC, Ironworkers, OE 324) and $40 cash (Sheet Metal). Windows are narrow and seasonal: EITC spring 2027; Pipefitters December; Plumbers open until Dec 18, 2026; OE 324 not announced. The paid apprenticeship itself is free to the apprentice, but "free" should not be used without that nuance. Most training centers are in Warren, Troy or Wixom, outside our 4 cities. Freshness badges for these need the window dates as dated facts.
8. **Aggregator-only facts not used:** the IIMD CWF phone 313-600-7618, Operation ABLE hours, the Pipefitters "tuition-free" wording, the Grand Circus status, EITI's address and phone, and Gesher/JVS at 4250 Woodward.
9. **Not researched for time:** MUST Construction Careers, IUPAT/Finishing Trades Institute, Cement Masons, Roofers, Insulators, Elevator Constructors, Michigan SBDC (free business consulting), Eastern Market/Detroit Kitchen Connect, Arab American & Chaldean Council (web presence found only via aggregators), Rebel Nell, COTS and Pope Francis Center employment help (lane C).
