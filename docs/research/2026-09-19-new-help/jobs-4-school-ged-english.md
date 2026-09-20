# Lane D: finishing school, reading, English, computer skills, community colleges

Researched 2026-09-19 for 313 Help. Research only; nothing in the repo was touched.
Every script request used `-A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`. Sites that refused scripts were not worked around.
No staff names, staff emails or direct lines are recorded. Where a page prints a number next to a staff name, I say so and leave the number out.

## Overview

- **DPSCD adult education changed.** GED, high school completion and basic reading/math intake now go through Detroit at Work career centers plus an online form. The old East and West adult ed campuses are closed. Addresses you will still see on aggregators (16164 Asbury Park, 13840 Lappin, 5680 Konkel, 2111 Mullane) are **stale; do not use them**. ESL stays at three DPSCD schools. The one DPSCD adult site with a printed address is the Adult Education Center at Detroit Lions Academy (2001 W. Warren), which is also DPSCD's GED test center.
- **The DPSCD career and technical centers do not take adults today.** Breithaupt, Randolph and Golightly are for grades 10–12 only, and Crockett is a high school. The adult evening and weekend training there was a 2017–2019 Detroit at Work program. Detroit at Work's current training list names none of the centers. **Do not list them as adult programs.**
- **Reading Works (Detroit's adult literacy network) appears defunct.** readingworksdetroit.org is a parked GoDaddy domain. Its former member programs are listed one by one below. The ones confirmed current are MiSide (formerly Southwest Solutions), Siena, Dominican, All Saints and Mercy.
- **Highland Park has no adult education of its own that I could find.** The school district site says nothing about it, McGregor Library is still closed, and the "Career Academy/Adult Education" listings exist only on aggregators. The nearest options are on Woodward just south of the city line: DPSCD ESL at Northern High School (9026 Woodward) and WCCCD adult ed at Little Rock (8801 Woodward).
- **Best discovery source:** the State of Michigan Adult Education Service Locator. It has a public ArcGIS layer at `https://gisp.mcgi.state.mi.us/arcgis/rest/services/LEO/AdultEducationSites/MapServer/0` with fields for ABE, HSE, HSC, ESL, GED testing and HiSET testing. I used it only to find candidates. Some of its provider addresses are stale (for example, Dearborn is still shown at 18700 Audette), so it is not a source of truth.
- **Status counts:** 22 verified on the owner's own page, 13 partial, 5 unverified or blocked. Plus official test link-outs.

## Summary table

| ID | Org, program | City | Cost | Status | Checker URL (phone + street no. both on page) | HTTP |
|---|---|---|---|---|---|---|
| D01 | DPSCD Adult Ed Center @ Detroit Lions Academy (GED/HSC/ABE) | Detroit | Free | verified | https://www.detroitk12.org/enroll/adult-education | 200 |
| D02 | DPSCD GED test center (same site) | Detroit | GED fee (see D41) | verified | same | 200 |
| D03 | DPSCD ESL at Priest Elementary-Middle | Detroit (SW) | Free | partial (no class times) | same | 200 |
| D04 | DPSCD ESL at Maybury Elementary | Detroit (SW) | Free | partial | same | 200 |
| D05 | DPSCD ESL at Northern High School | Detroit (near HP) | Free | partial | same | 200 |
| D06 | WCCCD Adult Ed (GED prep): Northwest Campus | Detroit | Free (PDF) | verified | https://www.wcccd.edu/adult-education | 200 |
| D07 | WCCCD Adult Ed: Eastern Campus | Detroit | Free (PDF) | verified | same | 200 |
| D08 | WCCCD Adult Ed: Little Rock site | Detroit (near HP) | Free (PDF) | partial (address conflict) | same | 200 |
| D09 | WCCCD Regional Training Center (CDL, trades) | Detroit | Often no cost (grants) | partial | https://www.wcccd.edu/locations/eastern-campus (RTC page lacks street no.) | 200 |
| D10 | WCCCD Continuing Ed incl. senior computer classes | Detroit | Low fee | verified | https://www.wcccd.edu/continuing-education | 200 |
| D11 | WCCCD campuses (college classes; Reconnect link-out is lane A) | Detroit | Tuition / Reconnect | verified | campus pages (see block) | 200 |
| D12 | Henry Ford College English Language Institute | Dearborn | Low cost, not free | verified | https://www.hfcc.edu/eli | 200 |
| D13 | Henry Ford College Workforce & Professional Development | Dearborn | Fee | verified | https://www.hfcc.edu/wfpd | 200 |
| D14 | Dearborn Adult Ed: GED prep | Dearborn | Free (see note) | verified | https://dearbornschools.org/services/ged-general-education-development/ | 200 |
| D15 | Dearborn Adult Ed: ESL (10 sites) | Dearborn | No registration fees | verified | https://dearbornschools.org/services/english-for-students-of-other-languages-esl-adult-education/ | 200 |
| D16 | Dearborn Adult Ed: High School Completion | Dearborn | not stated | verified (use D14 page for checker) | D14 URL | 200 |
| D17 | Hamtramck Adult Ed (Horizon HS): ESL, ABE, GED, HSC | Hamtramck | Free | verified | https://www.hamtramckschools.org/our-schools/horizon-high-school-adult-education/ | 200 |
| D18 | Hamtramck Public Library (HPS ESL site) | Hamtramck | Free | partial | https://hamtramck.lib.mi.us/ | 200 |
| D19 | Detroit Public Library TLC Center (job and computer help) | Detroit | Free | verified | https://detroitpubliclibrary.org/tlc | 200 |
| D20 | DPL Literacy Program for Adults | Detroit | Free | verified (checker = TLC page) | https://detroitpubliclibrary.org/tlc | 200 |
| D21 | DPL Cisco IT study group | Detroit | Free | verified, schedule ends 2026-09-23 | https://detroitpubliclibrary.org/tlc | 200 |
| D22 | DPL branch computer and résumé classes (Campbell, Bowen, Franklin…) | Detroit | Free | verified per branch; catalog quarterly | branch pages (see block) | 200 |
| D23 | MiSide Adult Learning Lab (ex-Southwest Solutions) | Detroit (SW) | Free for eligible | verified | https://miside.org/miside-wealth/adult-literacy | 200 |
| D24 | All Saints Literacy Center | Detroit (SW) | Free ($10 book donation asked, per aggregator) | verified | https://allsaintsliteracy.org/ | 200 |
| D25 | Siena Literacy Center | Detroit (NW) | Free | verified | https://www.sienaliteracy.org/faq | 200 |
| D26 | Dominican Literacy Center | Detroit (E) | Free | verified | https://www.dlcliteracy.org/contact/ | 200 |
| D27 | Mercy Education Project, Women's Program | Detroit (SW/Corktown) | Free | verified | https://www.mercyed.net/womens-program | 200 |
| D28 | LA SED ESL | Detroit (SW) | not stated | verified (no class times) | https://lasedinc.org/adulteducation/ | 200 |
| D29 | Detroit Hispanic Development Corp ESL | Detroit (SW) | not stated on own page | verified | https://www.dhdc1.org/programs/adult-services/ | 200 |
| D30 | La Casa Guadalupana (GED in Spanish, ESL, computers) | Detroit (SW) | not stated | partial (no phone/address on own site) | none | 200 |
| D31 | International Institute of Metro Detroit ESL (+ CNA) | Detroit | Free to qualified | partial (stale page, 2023) | https://www.iimd.org/education-and-training-classes/esl | 200 |
| D32 | ACCESS Adult & Family Learning ESL | Dearborn | not stated | partial (no address on page) | none | 200 |
| D33 | WSU Another Chance (GED prep) | Detroit | not stated | partial | https://clas.wayne.edu/afamstudies/programs/anotherchance (dept office address only) | 200 |
| D34 | St. Vincent and Sarah Fisher Center Adult GED | Detroit (E) | Free (per search snippet) | unverified: blocks scripts | a person must check | 403 |
| D35 | Detroit Literacy Coalition | Detroit | ? | unverified: blocks scripts | a person must check | 403 |
| D36 | Wayne Metro LEAPS adult ed (Hamtramck and Detroit) | Hamtramck/Detroit | ? | unverified: blocks scripts | a person must check | 403 |
| D37 | Human-I-T Digital Empowerment Center (7 Mile) | Detroit | Free classes; low-cost devices | verified | https://www.human-i-t.org/7-mile/ | 200 |
| D38 | Connect 313 Neighborhood Tech Hubs (list) | Detroit | Free | partial (addresses only) | none | 200 |
| D39 | Digital Skills Detroit (learning circles + free device) | Detroit | Free | partial (circle list is JS) | none | 200 |
| D40 | Alpha Technical Institute: HiSET test site | Dearborn | HiSET fee | partial | https://www.alphatechschool.com/testing-center-page/ | 200 |
| D41 | Official GED / HiSET link-outs + Michigan costs and vouchers | statewide | see block | verified (michigan.gov) | link-out, no place | 200 |

"verified" means the phone and street number both appear as plain text on the named page. I checked this automatically on each saved page.

---

## Per-candidate detail

### DPSCD, Detroit Public Schools Community District (Office of Adult Education)

Source page for D01–D05: https://www.detroitk12.org/enroll/adult-education (HTTP 200, script-readable). The page says: "We offer free adult education classes." Programs: Adult Basic Education (skills below 8th grade), HSE/GED prep, High School Completion, ESL. "DPSCD is an authorized GED® … test center." Enrollment: "Enroll now!" links to a Microsoft Form (`https://forms.cloud.microsoft/r/z29h1NRQW2`) with the caption "Scan QR code to register for high school equivalency or high school completion." No printed page date; the QR image was uploaded in Aug 2026, which suggests the page is current.
Companion intake page (lane A's site): https://detroitatwork.com/adult-education-gedhigh-school-completion. It says adult ed is "100% tuition free", offered in person, virtually or hybrid, day or evening. Steps: sign up, get a call from a career center "within 3 days", take a reading and math test, then bring ID and Social Security card. Help line: "(313) 962-9675 (WORK)". It also says: "DPSCD's English as a Second Language program (ESL) will remain at its same locations." That page has **no street address**.
Broken links: DPSCD's "Adult Education Nav" links "Detroit at Work" and "ESL Locations" point to `detroitk12org-3xx-us-east1-01.preview.finalsitecdn.com` preview URLs. The site owner should fix these.

**D01. DPSCD Adult Education Center @ Detroit Lions Academy**
- Offers: free classes to get your GED or finish your high school diploma, plus reading and math help.
- Cost: free. Eligible: adults (DPSCD adult ed; no age printed on the page; Detroit at Work flow is 18+ adult job seekers).
- Address: 2001 W. Warren, Detroit, MI 48208
- Phone as printed: "Phone: (313) 335-1026" (site line). The page lists it under "Testing Locations" with "Programs: ABE, HSE, HSC".
- Hours/class times: not printed. The Detroit at Work page says only "Class schedule (day or evening)".
- Access: online form first, or through Detroit at Work (313-962-9675). Not walk-in.
- Serves: Detroit.
- Checker URL: https://www.detroitk12.org/enroll/adult-education (200)
- Contradiction: the state locator lists a DPSCD "Adult Education Center" with phone 313-873-7927, which is Northern High School's number on DPSCD's page. The locator also lists DPSCD adult ed at "Detroit at Work – Durfee Career Center" (2470 Collingwood) and "Detroit at Work – Ross Career Center". Treat the career centers as lane A listings that host DPSCD classes.
- Status: **verified-on-own-page** (phone and address). Class times are unknown.

**D02. DPSCD GED test center (Detroit Lions Academy)**
- Offers: a place to take the official GED test.
- Same address and phone as D01. The state locator also lists DPSCD as a GED test site with 313-335-1026.
- Cost: the GED fee (D41). Booking is through GED.com.
- Status: **verified-on-own-page**.

**D03. DPSCD ESL: Priest Elementary-Middle**
- Offers: free English classes for adults who speak another language.
- Address: 7840 Wagner, Detroit, MI 48210. Phone as printed: "(313) 849-3705" (school line).
- Class times: not printed. Access: call the school. Serves: Detroit (Southwest).
- Checker: https://www.detroitk12.org/enroll/adult-education (200)
- Contradiction: the state locator gives 313-457-2537 for this site.
- Status: **partial**. Phone and address are verified; class times are missing.

**D04. DPSCD ESL: Maybury Elementary School**
- Address: 4410 Porter Street, Detroit, MI 48209-2429. Phone as printed: "Phone: (313) 466-7115".
- Class times: not printed. Serves: Detroit (Southwest). The state locator agrees on the phone.
- Status: **partial**.

**D05. DPSCD ESL: Northern High School**
- Address: 9026 Woodward, Detroit, MI 48202. Phone as printed: "(313) 873-7927".
- Class times: not printed. Serves: Detroit. This is the closest adult ESL to Highland Park.
- Contradiction: the state locator gives 313-872-0863.
- Status: **partial**.

**Not listing: DPSCD career and technical centers.** Evidence:
- https://www.detroitk12.org/academics/college-career-readiness/career-technical-education says "Must be a high school sophomore, junior or senior."
- Breithaupt (9300 Hubbell, (313) 866-9550) and Randolph (17101 Hubbell, (313) 494-7100) home pages mention only grades 10–12. golightly.detroitk12.org did not resolve.
- workforcedetroit.com describes adult evening training at Randolph (2017) and Breithaupt (2019) but gives no current dates.
- detroitatwork.com's "Career Technical Education" page now redirects to /training, and that list names none of the centers.

### WCCCD, Wayne County Community College District

**D06–D08. WCCCD Adult Education (GED prep)**. Source: https://www.wcccd.edu/adult-education (200).
- Offers: classes to get your GED, plus free tutoring and job-search tips.
- Cost: the web page does not say. The **Fall 2026 Continuing Education schedule PDF** (`https://www.wcccd.edu/Pdfs/Course%20Schedule/CE_FALL_Schedule_2026.pdf`, p.13) says "Courses are offered at no cost to participants" and "WE WILL PAY FOR YOUR GED! Restrictions apply". Bring a driver's license or State ID and your Social Security card.
- Eligible: "18 years of age or older". You must complete the college admission application and a 3-hour orientation with the TABE test.
- Phone: the page prints a program number next to a named staff member, so I did not record it. Use the main line "313-496-2600" (page footer, district office at 801 W. Fort). The PDF prints a general GED info line: "CALL 313-496-2634".
- Serves: Detroit, Hamtramck and Highland Park are in WCCCD's district. Dearborn is Henry Ford College's district.
- D06 **Northwest Campus**, 8200 West Outer Drive, Detroit, MI 48219. "Classes are held Monday -Thursday from 9:30am - 1:30pm & 5:00pm - 9:00pm". Campus main "(313) 943-4000" (campus page).
- D07 **Eastern Campus**, 5901 Conner Street, Detroit, MI 48213. "Classes are held Monday -Thursday from 9:30am - 1:30pm & 5:00pm - 9:00pm". Campus main "(313) 922-3311".
- D08 **Little Rock Urban Institute**, 8801 Woodward, Detroit, MI 48202. "Monday - Thursday from 9:30am to 1:30pm". **Contradiction:** the Fall 2026 PDF says "Little Rock Urban Center 9000 Woodward, Detroit, MI 48202". The PDF also lists the Downtown campus (1001 W. Fort) as a GED class site, but the web page does not. A person must check which is right.
- Downriver (Taylor) is also listed but is outside our area.
- Checker: https://www.wcccd.edu/adult-education has 8200, 5901, 8801 and 313-496-2600.
- Status: D06 and D07 **verified-on-own-page**; D08 **partial** (address conflict).

**D09. WCCCD Regional Training Center (Eastern Campus)**. Source: https://www.wcccd.edu/locations/eastern-campus/regional-training-center (200).
- Offers: short job-training courses (2–10 weeks, 20–40 hours a week): CDL Class A (courses "every eight (8) weeks"), construction trades (OSHA 30, lead and asbestos abatement), skilled trades (welding, CNC, HVAC, diesel), computer training, and an online entrepreneurship class run with Detroit at Work.
- Cost: "generally delivered through grant awards and partnerships at no cost to our trainees", depending on funding.
- Phone as printed: "Phone: 313-496-2600". The RTC page does **not** print 5901 Conner, so use the Eastern Campus page (5901 Conner + (313) 922-3311) for the checker.
- Workforce Development line: "Contact us at (313) 496-2809" (https://www.wcccd.edu/center-for-workforce-and-economic-development, with 801 W. Fort Street).
- No dates for current cohorts. Status: **partial**.

**D10. WCCCD School of Continuing Education**. Source: https://www.wcccd.edu/continuing-education (200).
- Offers: low-cost short classes, including basic computer classes. The "Silver Circle" classes for older adults include "Mature Learners Internet and You", "FEE: $15.00", Fall 2026 sessions at Downtown, Eastern and Northwest (for example, Northwest Sat 9–11 AM, 10/17/26–10/31/26). There are also Word, Excel and keyboarding classes.
- Term (Fall 2026 PDF): "Fall Classes Begin … Monday, August 24, 2026"; "Fall Classes End … Saturday, December 12, 2026". Walk-in and online registration hours: "Monday – Thursday 8:30 a.m. – 7:00 p.m.; Friday 8:30 a.m. – 4:30 p.m." **This schedule expires 2026-12-12.**
- Seniors: "Senior Citizens who are residents of the District and 60 years of age or older may enroll in the college tuition-free. (THIS EXCLUDES CERTIFICATE COURSES)". Seats as available; fees for books and supplies still apply.
- Phone as printed: "Main Number: (313) 496-2704" (801 West Fort Street 1st floor). The page also lists every campus address and phone.
- Status: **verified-on-own-page**.

**D11. WCCCD campuses (college classes; Michigan Reconnect link-out is lane A)**
- Curtis L. Ivery Downtown Campus: 1001 W. Fort Street, Detroit, MI 48226. "Main Number: (313) 496-2758". https://www.wcccd.edu/locations/curtis-l-ivery-downtown-campus (200)
- Eastern Campus: 5901 Conner Street, Detroit, MI 48213. "Main Number: (313) 922-3311". https://www.wcccd.edu/locations/eastern-campus (200)
- Northwest Campus: 8200 West Outer Drive, Detroit, MI 48219. "Main Number: (313) 943-4000". https://www.wcccd.edu/locations/northwest-campus (200)
- No hours are printed on the campus pages. Status: **verified-on-own-page** (place records).
- Not ESL: the Downtown "Language Institute" teaches foreign languages. WCCCD's credit ESL courses (ESL 100–102) are regular tuition.

### Henry Ford College (Dearborn)

**D12. HFC English Language Institute (ELI)**. Source: https://www.hfcc.edu/eli (200).
- Offers: English classes (reading, speaking, listening, writing, grammar) during the day, in the evening or on Saturday, all year.
- Cost: **low cost, not free.** From https://www.hfcc.edu/eli/taking-classes: non-credit classes are $700 per 6-hour-a-week class and $350 per 3-hour class. For-credit classes charge tuition, which is in-district for Dearborn School District residents. The CaMLA placement test is free. For residents who need free ESL, Dearborn Adult Ed (D15) is the better listing.
- Address: Liberal Arts Building (K), K-201, Henry Ford College, 5101 Evergreen Rd., Dearborn, MI 48128. Phone as printed: "313-845-9624".
- Hours: "Hours during Fall Semester: Monday - Friday: 8:00 a.m. - 4:30 p.m." (office). "Open enrollment."
- Status: **verified-on-own-page**.

**D13. HFC Workforce and Professional Development (MTEC)**. Sources: https://www.hfcc.edu/wfpd and /wfpd/classes-training (200).
- Offers: paid, non-credit trade and technology courses. Examples: "Trade Related Preparation, $320 per student" (48 hours, math, blueprints and measuring), "Shop Arithmetic, $212", "Machine Tool Blueprint Reading, $212", industrial sewing ($130–$165).
- Location: "Michigan Technical Educ Center (MT)". Phone as printed: "313-317-6600". Fall hours "Monday - Friday: 8:00 a.m. - 4:30 p.m.". Campus 5101 Evergreen Rd. Serves Dearborn and the region.
- Status: **verified-on-own-page**. Lower priority because it is fee-based.
- Not listing: HFC "Eligible Career Pathway Programs" (https://www.hfcc.edu/eligible-career-pathways), the 2-for-1 high school diploma plus college certificate program with Dearborn Adult Ed. The page returns the site's own "Access denied" page (HTTP 403, with full HFC site chrome), while other HFC pages return 200. It may be unpublished. **A person must check it in a browser.**

### Dearborn Public Schools Adult & Community Education

Offices and registration moved to Henry Ford College in 2024 (Building K registration). Department page: https://dearbornschools.org/departments/adult-community-education/ (200). It prints: "Adult Education (313) 317-5600 — Registration is by appointment only." Important dates: "Aug 5, 2026 first day of registration. We will start making reg. appointments from early June." **The department page has no street address**, so use the program pages for the checker. adulted.dearbornschools.org redirects to the department page. The old blog URL /adulteducationblog/class-info/ returns 410 Gone.

**D14. Dearborn Adult Ed: GED prep**. https://dearbornschools.org/services/ged-general-education-development/ (200)
- Offers: free classes to get ready for the GED (reading, writing, social studies, math, science). Adults who test below 9th grade go to basic skills classes first.
- Eligible: 18+ as of September 1; 9th-grade reading and math for GED classes.
- Place: Henry Ford College, Building K, 5101 Evergreen Rd. Dearborn, MI 48128. Phone as printed: "(313) 317-5600".
- Times as printed: "Day classes … Monday through Friday from 8:30-10:30; 10:30-12:30, and 1-3:00. Classes are 12 weeks. Evening classes … Tuesday and Thursday evenings from 5:30 pm to 8:30 pm. Classes are 15 weeks." Term start dates are not printed; registration opened Aug 5, 2026.
- Cost: the GED page does not say. The ESL page says "No registration fees." Treat as free, but confirm.
- Access: appointment only. Serves: Dearborn.
- Status: **verified-on-own-page**.

**D15. Dearborn Adult Ed: ESL**. https://dearbornschools.org/services/english-for-students-of-other-languages-esl-adult-education/ (200)
- Offers: free English classes (beginning, intermediate, advanced) that also cover skills for work and parenting. "No registration fees." Placement test at registration.
- Eligible: 18+ as of Sept 1 and not enrolled in high school.
- Day sites (as printed): Henry Ford College, Building K, 5101 Evergreen Road, Dearborn, MI 48128 · LAHC, 5275 Kenilworth St, Dearborn, MI 48126 · Bint Jebail Cultural Center, 14201 Prospect St Bldg. 2, Dearborn, MI 48126 · Salina Intermediate School, 2623 Salina St, Dearborn, MI 48120 · Al-Huda Islamic Association, 8835 Warren Ave, Dearborn, MI 48126 · Imam Mahdi Association of Marjaeya 22000 Garrison St, Dearborn MI 48124.
- Day times: "two-hour classes that meet for 12 weeks Monday through Friday from 8:30-10:30, or 10:30-12:30 or 1:00-3:00."
- Evening sites and times (as printed): "5:30 pm to 8:30 pm, Henry Ford College, Building K" · "4:30 pm to 7:30 pm, Fordson High School, 13800 Ford Rd, Dearborn, 48126" · "4:30 pm to 7:30 pm, Geer Park Elementary School, 14767 Prospect, Dearborn 48126" · "6 pm to 7:30 pm, Becker Elementary School, 10821 Henson, Dearborn 48126". Evening classes are "three-hour classes that meet for 15 weeks Tuesday and Thursday".
- Phone: "Call Adult Education at 313-317-5600".
- Also available: U.S. citizenship test prep (https://dearbornschools.org/services/united-states-citizenship-test-prep/).
- Contradiction: the state locator also lists Miller Elementary and Woodworth Middle as ESL sites, which this page omits, and gives 313-317-5707 for most sites.
- Status: **verified-on-own-page** (for 5101 Evergreen). Each partner site should become its own location record under the same service.

**D16. Dearborn Adult Ed: High School Completion**. https://dearbornschools.org/services/high-school-completion/ (200)
- Offers: classes to earn a real high school diploma. Classes are online, so you need internet at home ("Classes are offered…" per the older blog; the current page says only that each class earns 1/2 credit). A minimum of 19 credits is required. Bring transcripts to registration.
- Eligible: 18+ as of Sept 1. Phone: "Call 313-317-5600 for a registration appointment."
- This page has **no street address**. Use the D14 page for the checker.
- Status: **verified** (via D14 page).
- Not listing: GEAR-D (free 15-week GED plus health credential program with Michigan Works!). The only source is a 2019 blog post; there is no 2025–26 evidence.

### Hamtramck

**D17. Hamtramck Adult Education (Horizon High School / Adult Education)**
- Offers: free classes in English (ESL), basic reading and math, GED (HSE) prep, and high school completion online.
- Cost: flyer says "Offering FREE classes in ESL, ABE, HSE (GED), & HSC". A news article (Yemeni American) mentions a "$10 fee for registration"; that is news only and conflicts with the flyer.
- Address: 3225 Caniff Street, Hamtramck, MI 48212.
- Phones:
  - School page: "Phone: 313-893-2214" (school main).
  - English flyer: "CALL FOR APPOINTMENT (313) 591-7404" (program appointment line). Flyer: `https://hamtramckschools-cdn.fxbrt.com/downloads/hzn/files/esl_english_banner.pdf`, also in Arabic and Bangla.
  - The department page (https://www.hamtramckschools.org/departments/adult-education/) lists only named staff with their lines. Not recorded.
- Times as printed on the flyer: "All Programs ae offered on Mondays, Tuesdays, Wednesdays, and Thursdays." ESL, ABE and GED: "MORNING 9:00 A.M.-11:30 A.M.; AFTERNOON 12:00 P.M.-2:30 P.M.; EVENING 4:00 P.M.-7:30 P.M."; "HSC 4:00 P.M.-7:30 P.M."
- **Flyer age:** PDF created 2022-07-26; server last-modified 2024-12-18. The school page has 2026 news (Sept 16, 2026), but the times may be old.
- Access: appointment. Serves: Hamtramck (and nearby Detroit).
- Checker: https://www.hamtramckschools.org/our-schools/horizon-high-school-adult-education/ (200) has 313-893-2214 and 3225 Caniff.
- Contradiction: the department page and the school page name different administrators, so one is stale.
- The state locator lists other HPS adult ed sites: Hamtramck Public Library (ESL) and Hamtramck High School Community Center (ABE, HSE, ESL).
- Status: **verified-on-own-page** (phone and address). Times come from a 2022 flyer and need a person to confirm.

**D18. Hamtramck Public Library (ESL site)**
- Own site: https://hamtramck.lib.mi.us/ (200). It prints "2360 Caniff Hamtramck, MI 48212" and "(313)733-6821". Hours as printed: "Monday - 9am-5pm; Tuesday- 9am-5pm; Wednesday - 9am-5pm; Thursday - 9am-7pm; Friday - 9am-5pm".
- ESL at the library is shown only in the state locator (as an HPS adult ed ESL site) and in news and YouTube session videos through Nov 2025. The library's own page does not mention ESL, job help or computer classes. hamtramcklibrary.org did not resolve.
- Status: **partial**.

### Detroit Public Library

**D19. DPL Technology, Literacy & Career (TLC) Center, Main Library**. https://detroitpubliclibrary.org/tlc (200)
- Offers (all free): computer classes (email and basics through Microsoft Office), one-on-one help with your phone or laptop, résumé building, one-on-one résumé review, and help finding job fairs and training.
- Address: Main Library TLC, 5201 Woodward Ave., Detroit, Michigan 48202. Phone as printed: "(313) 481-1363".
- Hours as printed ("Main Library TLC Center Hours"): Monday 10am - 6pm; Tuesday 12pm - 8pm; Wednesday 12pm - 8pm; Thursday 10am - 6pm; Friday 10am - 6pm; Saturday 10am - 6pm; Sunday Closed.
- Access: résumé review is by appointment ("Schedule yours by calling (313) 481-1363"). Other help is walk-in.
- Contradiction: https://detroitpubliclibrary.org/services/career-and-employment-assistance prints "313-421-1363", which is probably a typo for 481-1363. Report it to DPL.
- Stale: /services/computer-classes still says "THERE IS NO CHARGE FOR A COMPUTER GUEST PASS DURING THE COVID EMERGENCY" and also says a guest pass costs $1.
- Status: **verified-on-own-page**.

**D20. DPL Literacy Program for Adults**. https://detroitpubliclibrary.org/literacy-program (200)
- Offers: free one-on-one reading and writing tutoring at the Main Library.
- Eligible: "18+ with beginner to intermediate reading skills". You must commit "2 hours a week for 10 months in-person at Main" and take a 1-hour placement test.
- Schedule: "The Literacy Program will run January through November and includes one 2-month seasonal break. Tutors and learners will be accepted on a rolling basis."
- Apply: "To apply, please call 313-481-1363."
- This page has **no street address**, so use the TLC page for the checker.
- Status: **verified** (via TLC page).

**D21. DPL IT job training (Cisco Networking Academy study group)**. Source: Summer 2026 Technology Training Catalog PDF (`https://d2qp1eesgvzzix.cloudfront.net/uploads/files/TTA-Catalog-Summer-2026-drft-3.pdf`).
- Offers: free online IT support classes plus an in-person study group toward the Cisco Certified Support Technician credential.
- Times: "All Study Groups take place in the TLC at the Main Library on Wednesdays from 6:00 to 7:30 pm." The last listed session is "Wednesdays, September 9, 16 & 23". Registration: "Contact the TLC at (313) 481-1363".
- **Expires 2026-09-23.** The Fall catalog is not yet posted (as of 2026-09-19 the newest on /tta-catalog is "Summer 2026 (July - September)").
- Status: **verified**, but the schedule is about to lapse. List the service only if it can be re-dated.

**D22. DPL branch computer and job classes**. Catalog page: https://detroitpubliclibrary.org/tta-catalog (200), released quarterly. The Summer 2026 catalog lists "Ask a Tech" one-on-one help and résumé classes by branch.
- **Campbell Branch** (Southwest): 8733 W. Vernor Hwy., branch phone "313-481-1550". Checker: https://detroitpubliclibrary.org/locations/campbell (200). Summer catalog: Ask a Tech "Tuesdays, July 14 & 28, August 4 & 18, September 15 & 29: 2:00 – 3:00 pm; Call 313-481-1550 for an appointment".
- **Bowen Branch** (Southwest): 3648 Vernor Hwy., branch phone "(313) 481-1540". Checker: https://detroitpubliclibrary.org/locations/bowen (200). Ask a Tech on listed Mondays and Wednesdays, 11:00 am – Noon, through Sept 28.
- **Franklin Branch**: 13651 E McNichols, "313-481-1741". Offers "Digital Skills Detroit – Basic Computer Skills Class + Free Laptop" (6 weeks, 2 hrs/week, 10 seats, in-person registration only). The listed session was **Tuesday, April 14, 2026, 5:30pm – 7:30pm (past)**. Event page: https://detroitpubliclibrary.org/events/event/1986250812649 (200).
- Also in the catalog: résumé writing at Duffield (by appointment, 313-481-1710), Elmwood Park (Thursdays 2–3 pm through Sept 24) and Parkman; Indeed Resume Builder at Conely.
- All class dates in the Summer catalog **end 2026-09-30**.
- Status: **verified** per branch (phone and address). The dated sessions need the Fall 2026 catalog.

### Adult literacy nonprofits (former Reading Works partners and others)

**D23. MiSide Adult Learning Lab (formerly Southwest Solutions)**. https://miside.org/miside-wealth/adult-literacy (200)
- Offers: free classes to improve reading, math, computer skills and English, get ready for the GED, plus job and career help and citizenship classes.
- Cost: "These services are free for eligible participants." (The old swsol.org page mentions "a small registration fee".)
- Eligible: "at least 18 years old and moving toward a goal of finding employment or improving their work situation. Eligible adults do not need to reside in Detroit."
- Address: 4214 W. Vernor, Detroit, MI 48209 ("across from Clark Park"). Phone: "Reach us at 313-451-8055".
- Times as printed: ESL "Morning & Evening 9:00 a.m. – 12:00 p.m. / 5:00 p.m. – 8:00 p.m."; GED Prep "Monday – Thursday 9:00 a.m. – 12:00 p.m. / 1:00 p.m. – 4:00 p.m."; the lab runs "9:00 A.M. - 8:00 P.M. Monday through Thursday, with office hours by appointment on Friday", in person and virtually.
- Note: the page carries a "Summer Registration for ESL Classes" banner with no year.
- The swsol.org contact page confirms the address and phone ("Adult Learning Lab (Previously Southwest Solutions) 4214 West Vernor Highway … 313.451.8055").
- Status: **verified-on-own-page**. Update the organization name to MiSide.

**D24. All Saints Literacy Center**. https://allsaintsliteracy.org/ (200)
- Offers: free one-on-one tutoring for adults in reading, writing, math, English speaking and computer skills, in person, virtual or online self-study.
- Cost: "Our adult literacy programs are provided for free". An aggregator mentions a requested $10 textbook donation, which does not appear on the own page.
- Address: 3553 W. Vernor Hwy., Suite D, Detroit, MI 48216. Phone as printed: "Phone: (313) 635-4549". The learners page says "Call / text (313) 635-4549".
- Hours as printed ("Center Hours"): Monday – 9am-5pm; Tuesday – 9am-5pm; Wednesday – 9am-8pm; Thursday – 9am-5pm; Friday – 9am-5pm.
- Access: call to schedule an orientation, then an assessment.
- Current: the about page mentions March 2026.
- Status: **verified-on-own-page**.

**D25. Siena Literacy Center (Northwest Detroit)**. https://www.sienaliteracy.org/ , /program , /faq (200; Wix, but the text is script-readable)
- Offers: free help with reading, math and English (ESL) through tutoring, small classes and a computer lab, plus GED classes.
- Cost: "No. It is entirely free." Eligible: "Adults ages 18+. All levels of education welcome." Commit 5 hrs/week.
- Address: 16888 Trinity, Detroit, MI 48219. Phone: "313-532-8404".
- Times as printed: "open office hours, Monday-Thursday, 10 am - 8 pm". "GED: Classes are from 5-8 pm on Mondays and Tuesdays" at the satellite St. Suzanne Cody Rouge Community Resource Center. That address is **not printed** on Siena's pages. Program year "July1-June 30".
- Waitlist: "average wait time for a tutor was three months".
- Access: orientation, then placement test. Sign up online or by phone.
- Status: **verified-on-own-page**. Link it to the ProLiteracy and Dominican Rea network.

**D26. Dominican Literacy Center (East side)**. https://www.dlcliteracy.org/contact/ (200)
- Offers: free tutoring and classes for adults: GED, reading, math, ESL, and a computer lab.
- Cost: "Becoming a DLC student is easy – and free".
- Address: 5555 Conner Street, Suite 1414, Detroit, Michigan 48213. Phone: "(313) 267-1000".
- Hours as printed: "Monday & Wednesday 8 a.m. – 8 p.m.; Tuesday & Thursday 8 a.m. – 6 p.m.; Friday 9 a.m. – 2 p.m". The computer lab keeps the same hours.
- Access: intake form or call, then State of Michigan Adult Learning Plan, then orientation.
- Current: 2026 spelling bee (Sept 24, 2026). The state locator lists ABE, ASE, HSE and ESL here.
- Status: **verified-on-own-page**.

**D27. Mercy Education Project: Women's Program**. https://www.mercyed.net/womens-program (200)
- Offers: free classes for **women** to build reading and math skills and pass the GED, plus job-readiness help.
- Cost: "free of charge". Van rides are available inside the service area; some students outside it get bus passes.
- Address: 1450 Howard St., Detroit, MI 48216. Phones as printed: enrollment "call 313.410.2705"; main "313-963-5881".
- Times as printed: "The program runs from 9:00 am to 1:30 pm, Monday through Thursday during the academic year." "year-round, open enrollment."
- Eligible: women (gender-specific).
- Status: **verified-on-own-page**. Its Workforce Development page is nearly empty.

**D33. WSU Another Chance (Wayne State University)**. https://clas.wayne.edu/afamstudies/programs/anotherchance (200)
- Offers: GED preparation classes and tutoring for adults.
- Eligible (from /about): 18+, no diploma or GED, Michigan ID and Social Security card, TABE reading at 4th grade or above.
- Phone as printed: "313-577-9079". The only address on the page is the department office (656 W. Kirby St., Detroit, MI 48202). Classes run at partner sites ("Detroit Hispanic Development Corporation, ACCESS, New Prospect Baptist Church, Detroit Literacy Coalition"); the list may be old. The state locator lists "Wayne State University-Online Distance Learning, 5057 Woodward Ave Rm 6".
- No class times or cost are printed.
- Status: **partial**.

**D34. St. Vincent and Sarah Fisher Center: Adult GED Program**
- svsfcenter.org returns **403 to scripts** (/programs/adult-education/ and /contact/). I did not work around it. **A person must check it in a browser.**
- Search snippets only (not a source): "free, personalized tutoring", 18+, "five locations across Detroit", East Campus 14061 Lappin St., Detroit, MI 48205, (313) 535-9200. The state locator lists it as an HSE provider and a GED test site ("SVSF Center", 313-535-9200).
- Status: **unverified**.

**D35. Detroit Literacy Coalition**
- detroitliteracy.org returns **403 to scripts**. Aggregators (Yelp, "updated Feb 2026") show 4445 W Outer Dr, Detroit.
- Status: **unverified. A person must check it.**

**Not listing: Reading Works.** readingworksdetroit.org redirects to `/lander`, a GoDaddy parking page, so the organization appears to be defunct. Siena's resources page still links to it, which is stale.

### English classes (ESL): Southwest Detroit, Hamtramck, Dearborn

**D28. LA SED (Latin Americans for Social and Economic Development): ESL and citizenship**. https://lasedinc.org/adulteducation/ (200)
- Offers: English classes for Spanish speakers in three levels (the first level is taught in Spanish), plus citizenship interview prep.
- Where: "LA SED Senior and Youth Center, located at 7150 W. Vernor St., Detroit, MI". Phone: "For more information or to schedule an appointment, please call 313-841-1419". The footer labels this the Youth line.
- Times: "Our program runs during the fall and winter semesters." No class times or dates are printed. Aggregators and news say 10 a.m.–1 p.m. and 5–8 p.m. Mon–Thu with childcare, which is not on the own page. Citizenship sessions run "mid-January … mid-December".
- Cost: not stated.
- Status: **verified-on-own-page** (phone and address). Times and cost are missing. Copyright ©2025.

**D29. Detroit Hispanic Development Corporation: English communication classes**. https://www.dhdc1.org/programs/adult-services/ (200)
- Offers: English classes for work, community and family, "offered Monday-Thursday in person and online, in the morning and evening". Also case management referrals and "GED referral services". State funded.
- Address: 1211 Trumbull, Detroit MI, 48216. Phone: "313.967.4880".
- Cost: not stated on the own page. findhelp says free (aggregator only).
- Status: **verified-on-own-page**.

**D30. La Casa Guadalupana**. https://lcgdetroit.org/ , /esl-english-class , /ged-prep-classes (200)
- Offers: GED classes **taught in Spanish** (four subjects, materials included, morning and evening "based on the schedule for each semester"), ESL (beginner, intermediate, advanced), and a basic computer skills workshop (Word, Excel, email). 18+.
- The own pages print **no phone and no street address**. Booking is through a Google Calendar link ("AGENDA UNA CITA").
- State locator (not a source of truth): 4330 Central St, Detroit 48210, 313-551-4402, with ABE, HSE, ESL and family literacy.
- Current: gala Oct 22, 2026.
- Status: **partial**. Ask the owner to print the address and phone, or a person must confirm.

**D31. International Institute of Metropolitan Detroit (IIMD): ESL**. https://www.iimd.org/education-and-training-classes/esl (200)
- Offers: free English classes (beginner, intermediate, advanced). The page describes an "Intensive ONLINE ESL training course … over 15 weeks … FREE to qualified individuals". You must be a Michigan resident with a driver's license or State ID, and take a placement test on the first day.
- Address: 111 E Kirby St, Detroit, MI 48202. Phone: "(313) 871-8600" (main line; the page also names staff, not recorded).
- **Stale:** "Published: August 25, 2021 | Updated: April 10, 2023". There are no current session dates. The education index also shows a no-cost 15-week CNA course on a 2021 post.
- The state locator lists IIMD for ESL, IET and IELCE. Connect 313 lists IIMD as a City-certified Tech Hub.
- Status: **partial**. A person must confirm the 2026 sessions.

**D32. ACCESS: Adult & Family Learning ESL (Dearborn)**. https://www.accesscommunity.org/education/adult-programs (200)
- Offers: semester-long English classes in five levels, all year. "Open registration is held three times a year."
- Phone: "Phone: (313) 203-3406" (program line; the page also prints it with a staff name).
- The page gives **no address**. The ACCESS contact page lists HQ at 2651 Saulino Court, Dearborn, MI 48120, and the state locator puts this ESL program there.
- No times, dates or cost are printed.
- Status: **partial**.

**D36. Wayne Metro Community Action Agency: LEAPS adult education**
- waynemetro.org/leaps/ returns **403 to scripts**. Search snippets claim GED and ESL in Hamtramck and Detroit, "September through June". It is not in the state locator.
- Status: **unverified. A person must check it.**

### Free computer and digital-skills help

**D37. Human-I-T Digital Empowerment Center (7 Mile)**. https://www.human-i-t.org/7-mile/ (200)
- Offers: free computer classes, a free open computer lab with one-on-one help, and low-cost refurbished laptops and hotspots. Bigger discounts go to members with income under 200% of the federal poverty level.
- Address: 6375 W. 7 Mile Rd, Suite 101, Detroit, MI 48221. Phone as printed: "Phone: (313) 612-9990 (Call or walk in)".
- Times as printed:
  - "Digital Literacy (Beginner) · Every Tuesday · 11:30 AM – 1:30 PM"
  - "Artificial Intelligence (Beginner) · Every Wednesday · 11:30 AM – 1:30 PM"
  - "Co-working & Open Lab: Tue–Fri · 1:30 – 6:00 PM (Call to confirm space)"
  - Center "Mon–Sat: 10 AM – 7 PM"
  - Classes are "Capped at 25 seats. RSVP weekly."
- Stale bits: two creative classes say "(Ends Jun 22)". The instructor names on the page are not recorded.
- Status: **verified-on-own-page**. Sells devices, so flag it as partly commercial.

**D38. Connect 313: Neighborhood Tech Hubs**. https://connect313.org/neighborhood-tech-hubs/ (200)
- Offers: places to use a computer and internet and get digital help.
- The page lists addresses only, no phones or hours. It names Digital Navigator host sites, 12 neighborhood hubs and City of Detroit Certified Tech Hubs. The hubs include DPL Main, Campbell, Bowen, Douglass, Duffield, Edison, Elmwood Park, Franklin, Jefferson, Knapp and Redford branches; IIMD (111 E. Kirby); Bridging Communities (6900 McGraw); Cody Rouge Community Action Alliance (19321 W. Chicago); and others.
- Contradiction: "East Side Community Network 401 Connor Street" vs "4401 Conner St" elsewhere on the same page.
- Status: **partial**. Use it for discovery; each hub needs its own page. The City's Digital Equity pages are on detroitmi.gov, which blocks scripts.

**D39. Digital Skills Detroit (learning circles)**. https://digital-detroit.p2pu.org/ (200)
- Offers: free, hands-on computer, internet and smartphone basics, telehealth and homebuying. "Participants who complete 15 hours of training are eligible to receive a free device." "Open to all Detroit residents."
- The list of current learning circles loads by JavaScript, so it is not readable by script. There is no phone or address. This is the same program as DPL Franklin's 6-week class (D22).
- Status: **partial**.

Not listing:
- **Grace in Action Collectives** (1725 Lawndale, SW Detroit): youth ages 16–20, web design and screen-print collectives. Belongs to lane C (youth).
- **TechTown**: entrepreneur-focused, no resident digital-literacy class found.

### GED / HiSET testing and link-outs

**D40. Alpha Technical Institute: HiSET test site (Dearborn)**. https://www.alphatechschool.com/testing-center-page/ (200)
- The page prints "4114 Schaefer Rd Dearborn, MI 48126" and "+1(313) 846-0070". It does **not** mention HiSET in text; HiSET appears only in the state locator and nld.org.
- Contradiction: an aggregator gives 5401 Schaefer.
- Status: **partial**.

**D41. Official test link-outs and Michigan rules**. Source: https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/hse (200, script-readable). The older URL `/high-school-equivalency-ged-hiset-tasc` returns 404.
- Michigan accepts **GED®** and **HiSET®**. TASC ended in Dec 2020.
- GED at a test center: "$43.50 per subject (4 subjects) Total: $174 (without retakes)". Can also be taken online from home.
- HiSET at a center: "$26 per subject (5 subjects) + $30 annual administration fee … Total: $160"; "HiSET® Test at Home $41 per subject … Total: $235". Available in English and Spanish.
- **HSE-to-School voucher:** "Based on available funding", it covers one attempt per subject for eligible Michigan residents 16+. Ages 16–17 need an age waiver. New GED requirement: a score of 150 or higher on GED Ready within the last 90 days. Vouchers take 7–10 business days.
  - Search snippets said the program paused GED vouchers on April 24, 2026. The current page does not say this and lists new requirements instead. Treat vouchers as "subject to funding".
- Link-outs: https://ged.com/ (200; test-center finder is JavaScript), https://hiset.org/michigan/ (200), Michigan Adult Education Service Locator https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/adult-education/adult-education-service-locator (200).
- Local test sites:
  - DPSCD, Detroit Lions Academy (D02): **verified**.
  - SER Metro YouthBuild Learning Academy (313-945-5200, state locator only): lane B.
  - SVSF Center (D34): blocked.
  - WCCCD offers "WE WILL PAY FOR YOUR GED! Restrictions apply" for its students (D06–D08).
  - I found no evidence that WCCCD or HFC run a public GED test center. The Pearson VUE listing at 5901 Conner comes from a third-party site, so a person must check.

---

## Gaps and blockers

1. **Blocked for scripts (403). A person must check in a browser:**
   - svsfcenter.org (St. Vincent and Sarah Fisher Center, D34)
   - detroitliteracy.org (Detroit Literacy Coalition, D35)
   - waynemetro.org/leaps (Wayne Metro LEAPS, D36)
   - hfcc.edu/eligible-career-pathways (HFC's own "Access denied" page; may be unpublished)
   - detroitmi.gov (City Digital Equity / Tech Hub pages, known to block)
2. **Class times missing on the owner's page:**
   - DPSCD ESL sites (D03–D05) and DPSCD GED/HSC (D01)
   - LA SED (D28), DHDC (D29), ACCESS (D32), La Casa Guadalupana (D30), WSU Another Chance (D33)
3. **Schedules about to expire:**
   - DPL Summer 2026 Technology Training Catalog ends **2026-09-30**; Cisco study group ends **2026-09-23**. The Fall catalog was not posted as of 2026-09-19.
   - WCCCD Fall 2026 CE term ends **2026-12-12**.
   - Human-I-T creative classes "Ends Jun 22".
   - MiSide "Summer Registration" banner has no year.
4. **Stale or conflicting facts to hold for steward review:**
   - WCCCD Little Rock: "8801 Woodward" (web) vs "9000 Woodward" (Fall 2026 PDF); the Downtown campus is listed as a GED site only in the PDF.
   - DPSCD site phones differ from the state locator (Priest, Northern, Adult Ed Center).
   - DPSCD nav links point to finalsite preview URLs.
   - Old DPSCD adult ed campuses (Asbury Park, Lappin, Konkel, Mullane) still appear on aggregators.
   - Hamtramck: flyer from 2022; "FREE" vs a news report of a $10 fee; two pages name different administrators.
   - DPL career page prints 313-421-1363 (probably a typo for 481-1363); DPL computer page still has a COVID guest-pass note.
   - IIMD ESL page last updated April 2023; CNA post from 2021.
   - Alpha Technical Institute: 4114 vs 5401 Schaefer.
   - Connect 313: "401 Connor" vs "4401 Conner".
   - State locator shows Dearborn Adult Ed at old 18700 Audette admin address.
5. **No street address on the owner's own page:**
   - La Casa Guadalupana (D30) has no phone either.
   - ACCESS ESL (D32).
   - Detroit at Work adult ed page (lane A).
   - Dearborn HSC and department pages (use the GED or ESL page instead).
   - DPL literacy page (use the TLC page).
   - WCCCD RTC page (use the Eastern Campus page).
6. **Phones not recorded because they are printed beside a staff name:**
   - WCCCD adult ed "District Contact" line.
   - Hamtramck adult ed department-page lines.
   - For these, record the main or school line instead.
7. **Highland Park:** no adult ed, library or computer-class provider found inside the city. List the nearby Woodward options (D05, D08) with "near Highland Park".
8. **Dearborn Public Library:** only online job resources (LearningExpress, résumé builder) and computer access. I found no in-person job, ESL or computer classes on its own pages, so it is not listed.
9. **Cost unstated on the owner's page:** LA SED, DHDC, La Casa Guadalupana, ACCESS, WSU, Dearborn GED and HSC. Do not show "free" until confirmed.
10. **Not current or not adult; excluded:**
    - DPSCD career and technical centers (high school only).
    - Reading Works (domain parked).
    - GEAR-D (2019).
    - WCCCD Language Institute (foreign languages, not ESL).
    - WCCCD free cybersecurity course (Downriver/Taylor, outside the area).
    - Michael Berry Career Center (Dearborn Heights, high school CTE).
    - detroitmetroadulted.com (no response).

## Notes for other lanes (found in passing)

- **A (public system):**
  - The Detroit at Work adult-ed intake is (313) 962-9675, and the page has no address.
  - The Detroit at Work locations page lists "Detroit Public Library, Chandler Park Branch 5201 Woodward Ave". 5201 Woodward is the Main Library, so that entry is wrong.
  - The Detroit at Work /training page still shows cohort dates from 2025 (e.g., 10/20/25–12/08/2025; 09/22/25–01/16/26).
  - The Detroit at Work /training page lists WCCCD-NW Pharmacy Technician and Dental Assisting.
  - DPSCD adult ed is hosted at the Durfee (2470 Collingwood) and Ross career centers, per the state locator.
  - ACCESS runs a Detroit Career Center at 16427 W. Warren ((313) 429-2469), a One-Stop at 6451 Schaefer, Dearborn ((313) 945-8380), and a Hamtramck Center at 9301 Joseph Campau (313-842-7726).
  - Michigan HSE-to-School voucher details are in D41.
- **B (nonprofits):**
  - SER Metro YouthBuild Learning Academy is a GED test site (313-945-5200).
  - SER Youth Reengagement Center at 9301 Michigan Ave is an ABE site, per the state locator.
  - NPower and Per Scholas are free IT training programs.
- **C (special populations):**
  - WCCCD tuition waiver for in-district residents 60+ (excludes certificate courses), plus $15 "Silver Circle" computer classes for seniors.
  - Mercy Education Project is women-only; it also runs a girls' program.
  - Grace in Action youth collectives (ages 16–20).
  - LA SED, Dearborn Adult Ed and Siena offer citizenship prep.
  - DPL Library for the Blind and Physically Handicapped.
