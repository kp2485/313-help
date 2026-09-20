# E2: How treatment access works, the front doors, and the data

Research for 313 Help, 2026-09-19. Research only: nothing in the repo was changed.
Every request used `-A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`. "Script: yes" means a plain `curl` got the fact from the owner's own page. No bot protection was bypassed. No staff or clinician names, emails or direct lines are recorded here, though several owner pages print them.

## Summary in plain words

All four cities (Detroit, Hamtramck, Highland Park, Dearborn) are in Wayne County. There, publicly funded drug and alcohol treatment goes through one agency: the **Detroit Wayne Integrated Health Network (DWIHN)**. Its **ACCESS line, 1-800-241-4949**, is free, open 24/7, and answers in English, Spanish and Arabic. It is the same number the app already shows as the "Local mental health crisis line." A Substance Use Disorder Specialist on that line screens the caller and books an intake with one of DWIHN's roughly 51 SUD providers. The state's own county list gives this same number as the door to publicly funded SUD treatment, both for the City of Detroit and for Wayne County outside Detroit. DWIHN clearly pays for Medicaid members. It also says it serves people who are uninsured, and it runs grant-funded opioid and stimulant treatment for uninsured people. However, its SUD page words eligibility as "enrolled in Medicaid," so the rule for uninsured callers needs one phone call to confirm. There is no "same-day treatment" promise. Urgent callers get an appointment within 24–48 hours. People who are in crisis can walk in 24/7 at the DWIHN Care Center, 707 W. Milwaukee, Detroit. The national fallback is SAMHSA's National Helpline, 1-800-662-4357. The best machine-readable source of treatment facilities is SAMHSA's data (FindTreatment.gov, the National Directory XLSX, and the OTP Directory CSV). It is federal and public-domain, but it is survey-based and updated about once a year.

---

## 1. The public system: DWIHN

| Fact | Source (exact URL) | Script |
|---|---|---|
| ACCESS and crisis line **1-800-241-4949**: "Free · 24/7 · Confidential · Wayne County". It is described as "Call ACCESS to reach crisis counselors, schedule services, or request a mobile team." | https://dwihn.org/crisis-help | yes (200) |
| The **same number is the SUD front door**: "Call DWIHN Access at 1-800-241-4949 (TTY 711)" under "How to get help" with substance use. It also appears as the "24-Hour Helpline" for "a substance use disorder". | https://dwihn.org/programs-services/substance-use-help | yes |
| The ACCESS Call Center runs **"SUD Eligibility Screening by a Substance Use Disorder Specialist"** as a 24/7 service. Mental-health eligibility screenings run only Mon–Fri 8am–8pm; after hours, a clinician calls back the next business day. "No prior authorization required to call." | https://dwihn.org/programs-services/crisis-services/access-services | yes |
| **Who is eligible** (Access page): Wayne County residents who have a substance use disorder (among other conditions) **and** "Have active Medicaid, are Medicaid eligible, or are uninsured." | same | yes |
| **Contradiction to flag:** the SUD page says "Substance use services are available to Wayne County residents enrolled in Medicaid. Emergency services are available to anyone in crisis," and lists "Medicaid enrollment (or eligible, we can help you apply)". The crisis page FAQ says "Medicaid recipients, uninsured people, and underinsured individuals are all served." The SUD rights list includes "The right to receive services without being denied solely based on your inability to pay." **A person should call ACCESS and ask what happens for an uninsured adult who wants treatment. The app should not promise free treatment for everyone.** | SUD page, crisis page | yes |
| **Uninsured funding that exists:** State Opioid Response (SOR) funding pays for "Direct treatment services for uninsured and underinsured individuals in Wayne County" for opioid and stimulant use disorders, including MAT, therapy, case management and transport. About 300 people a year are served this way. The phrase "block grant" does not appear on DWIHN's public SUD pages I read. The MDHHS county page (below) says DWIHN's providers "charge on a sliding-fee scale based on income and insurance." In FindTreatment data, 16 of the 36 SA facilities in the four cities list "SAMHSA funding/block grants." | https://dwihn.org/programs-services/substance-use-help/opioid-prevention-treatment-recovery | yes |
| **What a caller is asked:** a real person answers, usually within 1–2 minutes. They may ask the caller's first name ("completely optional"), what is happening, and roughly where the caller is if someone needs to be sent. "A telephonic screen may be utilized." The caller can stay anonymous on the crisis line. For a routine call, ACCESS "will collect demographic information, then provide screening, linkage to a provider, and referrals." | crisis-help; access-services | yes |
| **Timing:** emergent calls get a warm transfer to crisis. Urgent calls get "An appointment will be scheduled within 24–48 hours." Routine calls get "Scheduling an intake appointment." **No "treatment on demand" or same-day promise was found.** | access-services | yes |
| **Walk-in, 24/7: DWIHN Care Center** (the "707 Crisis Care Center"), 707 W. Milwaukee Ave, Detroit 48202, (313) 989-9444. It serves adults and children and takes walk-ins. The page says "You do not need an ID, insurance card, or appointment" and a stay can last up to 72 hours. The site describes crisis services as help for "a mental health or substance use emergency." It is a crisis stabilization unit, **not a detox**. | crisis-help; https://dwihn.org/news/dwihn-crisis-care-center-marks-second-anniversary-increased-capacity-and-improved-care (June 10, 2026: "Anyone who needs services can call 313-989-9444, or people can walk in"; 32 beds; Behavioral Health Urgent Care added) | yes |
| Other 24/7 walk-in crisis units: Team Wellness Center East CSU, 6309 Mack Ave, Detroit 48207, **(313) 331-3435** on crisis-help, but the DWIHN PDF `COPE-CSU-Updated.pdf` gives (313) 969-5387, so there is a **number mismatch** and the web page should win. Team Wellness West CSU, 34290 Ford Rd, Westland, (313) 391-2753. The COPE CSU in Livonia closed on May 9, 2025. | crisis-help; https://www.dwihn.org/sites/default/files/2025-11/COPE-CSU-Updated.pdf | yes |
| Mobile Crisis Team 1-844-462-7474, 24/7. Clinicians come, not police, "unless there is an immediate safety threat." | crisis-help | yes |
| **Coverage of our four cities:** DWIHN serves all of Wayne County. The MDHHS county list names DWIHN, 800-241-4949, for both "City of Detroit" and "Wayne County (If inside the City of Detroit, see…)", so it covers Dearborn, Hamtramck and Highland Park. | https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/welcome/get-help-now-behavioral-health_1 | yes |
| Languages: "Services in English, Spanish, and Arabic"; TDD/TTY 711. | crisis-help | yes |
| Teen text option on the SUD page: "Prefer to text? Reach us at 313-488-4673 via ReachusDetroit.org". This number is not verified further. | SUD page | yes |

**E1's question about wrong DWIHN numbers.** I checked every `tel:` link on dwihn.org's home, crisis-help, substance-use-help, access-services, customer-service and contact-us pages. The access line is **1-800-241-4949** everywhere (written 1-800-241-4949 / (800) 241-4949 / 800-241-4949). **800-421-4949, 800-231-1127 and 800-841-4949 do not appear on any DWIHN page.** Those provider pages are wrong. Other numbers DWIHN publishes: Mobile Crisis 1-844-462-7474; Member Customer Service 888-490-9698 and 313-833-3232 (Mon–Fri); main line 313-833-2500 (8726 Woodward Ave); Care Center 313-989-9444; Pre-Admission Review for ED staff 313-696-0905; TTY 711.

**Other DWIHN data surfaces (for the pipeline):**
- **Provider directory CSV:** https://www.dwihn.org/sites/default/files/providers-practitioners/provider-directory.csv (script: yes). It is marked "Last Updated 04/06/2026"; HTTP Last-Modified is 2026-05-27; it has 1,131 location rows. Columns: PIHP, Organization Name, Location Name, Address, City, Zip, Phone, Accredited, Website, Accepting New People, Services, ADA, Payment Option List, Age. SUD-related rows (SUD / Methadone / Recovery Home / Opioid) in the four cities: **72 rows, 37 organizations**. That count includes prevention-only programs. None of those rows are in Dearborn or Hamtramck; 10 are in Highland Park. "Payment Option List" is empty for all 72, and "Accepting New People" is "No" on 58, which looks unreliable. This is useful for cross-checking which programs are in DWIHN's network. It is not a good source for listings on its own. The DWIHN site's terms were not reviewed.
- **CMS Provider Directory API (FHIR):** DWIHN publishes `https://fhir.pcesecure.com:9443/PCEFhirServer/DWC/metadata` on https://dwihn.org/customer-service/member-resources/health-wellness-support/dwihn-api. **The connection timed out from this machine.** Port 9443 appears to be blocked outbound here: a port-9443 test to another host also failed. **A person must test it from another network.** CMS rules require provider-directory APIs to be public. If it works, read only Organization, Location and HealthcareService; never Practitioner names.

## 2. Hotlines and link-outs (owner pages)

| Line | Number / URL | Owner page | Script | Notes |
|---|---|---|---|---|
| **SAMHSA National Helpline** | **1-800-662-4357** (1-800-662-HELP); TTY 1-800-487-4889; text your ZIP to **435748** (HELP4U) | https://www.samhsa.gov/find-help/helplines/national-helpline | yes | "free, confidential, 24/7, 365-day-a-year", English and Spanish; texting is English only. "No, we do not provide counseling." It refers uninsured callers "to your state office… state-funded treatment programs." "We will not ask you for any personal information," though they may ask for a ZIP. Page last updated 06/09/2023. |
| **FindTreatment.gov** | https://findtreatment.gov/ | SAMHSA | JS shell (a person views it in a browser; data endpoint below) | The FTC tells people to "start at FindTreatment.gov". |
| **MDHHS Opioid "Find Help"** | https://www.michigan.gov/opioids/find-help | MDHHS | yes | Says "For a substance use disorder (SUD) crisis call or text 988." Links to the SAMHSA Helpline, the MiSUD Locator, SSP finder, MARR and MARCO directories, and the MSP Angel Program. |
| MiSUD Locator | https://www.michigan.gov/opioids/find-help/misud-locator | MDHHS | page yes; the map is an embedded Power BI (`app.powerbigov.us/view?r=…`) that **needs a browser** | Link only. |
| MDHHS county list | https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/welcome/get-help-now-behavioral-health_1 | MDHHS | yes | Confirms DWIHN 800-241-4949 for Detroit and for Wayne County. |
| "Stay Well" | https://www.michigan.gov/staywell → stay-well-program-resources | MDHHS | yes | **Ended.** "Live Stay Well programming ended in 2023." Do not list it. |
| **Michigan Problem Gambling Helpline** | **1-800-270-7117**, 24/7 | https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/gambling | yes | **Mismatch:** the MDHHS county list shows "1-800-GAMBLER" for Detroit. The gambling program's own page says 800-270-7117. Use the program page and flag the other for a person. |
| **Michigan Tobacco Quitlink** | **1-800-QUIT-NOW (1-800-784-8669)**; Spanish **1-855-335-3569** (DÉJELO-YA) | https://www.michigan.gov/mdhhs/keep-mi-healthy/chronicdiseases/tobacco/how-to-quit-tobacco | yes | 24/7. Free coaching and nicotine replacement "may be available to certain callers." Counseling in English, Spanish and Arabic. |
| 988 | 988 (call/text) | already hardcoded | n/a | MDHHS names 988 for SUD crisis. |
| MSP Angel Program | https://www.michigan.gov/msp/divisions/grantscommunityservices/angel | MSP | yes | Walk into any MSP post during business hours and ask for help. Low priority: it starts at a police post. Link only, if at all. |

**Mutual-help meeting finders.** Link to these. Never copy their lists: each list is owned by its fellowship, marked "All Rights Reserved" or unlicensed, and changes weekly.

| Fellowship | Local owner / URL | Script | Notes |
|---|---|---|---|
| AA | Detroit & Wayne County Intergroup, https://waynecountyintergroup.org/: **24-hour hotline 313-831-5550**, office 4750 Woodward Ave Suite 311 | yes | Also A.A. of Greater Detroit (Ferndale central office), https://www.aaferndale.org/, hotline (248) 541-6565. Area 33, https://aa-semi.org/meetings/, covers Wayne County ("© 2026 … All Rights Reserved"). National finder: https://www.aa.org/find-aa (yes). |
| NA | Metro Detroit Region, https://michigan-na.org/metro-detroit-region/: **24/7 helpline 248-543-7200** (https://michigan-na.org/metro-detroit-region/helpline/) | yes | The region publishes a monthly meeting list. |
| Al-Anon / Alateen | https://al-anon.org/al-anon-meetings/find-an-al-anon-meeting/ | page yes; the search is JS ("Loading Meeting Search…") and **needs a browser** | Michigan area site https://miafg.org/ answers 200 but was not read further. |
| Nar-Anon | https://www.nar-anon.org/find-a-meeting | **403 to scripts; needs a browser; a person must check** | |
| SMART Recovery | https://meetings.smartrecovery.org/meetings/ ("SMARTfinder") | page yes; the search is interactive | |

## 3. SAMHSA / FindTreatment.gov as a data source

**The three official products (all federal, SAMHSA):**

1. **FindTreatment.gov JSON API.** Endpoint: `https://findtreatment.gov/locator/exportsAsJson/v2`. Documentation: https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf (v1.12, **August 17, 2026**; script: yes).
   - Parameters: `sAddr="lat,lng"`, `limitType` (0 state / 1 county / 2 meters), `limitValue` (Michigan state ID = **2**), `sType` (sa/mh/both), `sCodes`, `pageSize` up to 2000, `page`, `sort`.
   - The guide says `sAddr` is "{lng},{lat}", **but that order returned 0 rows. "lat,lng" is what works**, which matches the guide's own examples.
   - **Access terms:** the FAQ and the API Request Form say "To access the FindTreatment.gov API, please complete the registration form" (https://findtreatment.gov/api-request-form). The form asks for organization, the server's external IP addresses, intended use, request frequency, and a technical contact. The guide calls readers "the approved user." **The endpoint did answer my unauthenticated requests** (HTTP 200, CloudFront, `cache-control: max-age=600`), and robots.txt allows all. **The honest path is to register before any automated ingester runs.** Registration needs a contact person and fixed IPs, so it is Kyle's decision.
   - Freshness (FAQ): "updated annually from facility responses to… N-SUMHSS. New facilities… are added monthly. Updates to facility names, addresses, telephone numbers, and services are made weekly for facilities informing SAMHSA of changes." **Rows carry no per-facility date**, so the app could only say "From SAMHSA's FindTreatment.gov, read {date}".
   - Every listed facility is "licensed, certified, or otherwise approved for inclusion by the state substance use/mental health treatment authority." SAMHSA "does not regulate" facilities.
   - **Fields per row:** name1/name2, street1/2, city, state, zip, phone, intake1, hotline1, website, latitude/longitude, typeFacility (SA/MH/OTP), plus coded services. The service categories are: Type of Care, Service Setting (outpatient/IOP/residential short and long/detox/hospital), Opioid Medications (bup/methadone/naltrexone), Detox (alcohol/opioid/benzo…), Payment accepted (incl. **"No payment accepted"**, Medicaid, "SAMHSA funding/block grants", cash), **Payment assistance ("Sliding fee scale", "Payment assistance")**, Language (Spanish, sign language, other; "Other Languages" names Arabic, Bengali absent), Age, Sex, Special groups, Recovery supports, Ancillary, and License/Certification type.
   - **Missing:** there are **no license numbers**, only the *type* of licensing authority. There are **no hours**. There is **no walk-in field** for SUD care; the only walk-in value is "Psychiatric emergency walk-in services" under mental health. There is no per-row "last verified" date. The 53 OTP-type rows in Michigan have `services: null`.
   - **Counts (Michigan state query, 788 rows; 2026-09-19):** 351 SA, 384 MH, 53 OTP statewide. **In the four cities: 36 SA + 11 OTP = 47** (Detroit 29 SA + 10 OTP; Highland Park 4 SA + 1 OTP; Dearborn 3 SA; Hamtramck 0 SA, 1 MH). There are also 27 MH-typed facilities in the four cities that list substance use treatment. **In the bbox:** 58 SA/OTP.
   - Among the 36 SA in the four cities: Medicaid 33; sliding fee 24; payment assistance 19; SAMHSA block grant 16; "No payment accepted" 0; Spanish 11; Arabic 6; buprenorphine 18; methadone 8; detox 8 (residential detox 3); short-term residential 8; long-term residential 7; sober or halfway housing 6; licensed by state SUD agency 30; DUI-only programs 7. 18 have an intake line and 35 have a website.
2. **National Directory of Drug and Alcohol Use Treatment Facilities 2025 (XLSX + PDF).** Page: https://www.samhsa.gov/data/data-we-collect/n-sumhss-national-substance-use-and-mental-health-services-survey/national-directories (script: yes).
   - XLSX: https://www.samhsa.gov/data/sites/default/files/reports/rpt57009/2025_SU_Facilities_for_All_City_All.xlsx (2.0 MB; Last-Modified 2026-03-06). It has 13,460 facilities, 407 in Michigan and **47 in the four cities** (Detroit 40, Highland Park 4, Dearborn 2, Hamtramck 1). Columns: name, address, phone, intake lines, and a coded `service_code_info` string. The second sheet is the code key (224 codes).
   - It reflects the **2024 survey**, so it is a year older than the API.
   - **License:** the PDF front matter reads: "This publication is in the public domain and may be reproduced or copied without permission from SAMHSA. Citation of the source is appreciated. However, this publication may not be reproduced or distributed for a fee without the specific, written authorization." The app is free, so that condition is met.
   - No registration is needed. This is the cleanest Tier A file.
3. **SAMHSA Opioid Treatment Program Directory (CSV export).** Page: https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory ("Last Updated: 01/14/2026"). Export: `https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory/export?page&_format=csv` (script: yes; the CSV is generated live).
   - 2,110 programs. Fields: Program Name, Street, City, State, Zip, Phone, Certification (Certified/Provisional), First Full Certification Date.
   - **11 OTPs in the four cities** (10 Detroit, 1 Highland Park). One of them, Romancare, is "Provisional". Dearborn Heights has one more, outside our area.
   - For corrections, the page says "OTPs who need to update their directory information should contact otp-help@jbsinternational.com."

**Buprenorphine practitioner locator.** The old SAMHSA URL (`…/treatment-practitioner-locator`) now redirects to findtreatment.gov. It lists individual clinicians by name. **Do not collect it.** The facility-level "Buprenorphine used in Treatment" code is enough.

**How current it looks:** the API guide was revised 2026-08-17. The National Directory was released in 2026 from 2024 survey data. The OTP page was updated 2026-01-14 and its CSV is live. The DWIHN CSV was updated 2026-04-06. For listings, treat all of these as "matched SAMHSA's list on {date}" and **never** as "verified".

## 4. Licensing check (Michigan)

- SUD programs are licensed by **LARA, Bureau of Community and Health Systems (BCHS)**. Every SUD program must hold a state license. The official lookup is the **"MI-SLS Health Facility License Search"** at https://statelicensing.apps.lara.state.mi.us/ (linked from https://www.michigan.gov/lara/bureau-list/bchs/verify-lic and https://www.michigan.gov/lara/bureau-list/bchs/non-long-term-care; both pages script: yes). It covers "Hospitals, Hospices, Homes for the Aged, Surgery Centers, Nursing Homes, and **Substance Use Disorder Programs**" and, according to the LARA pages, includes inspection and complaint reports.
- **The search app is an Angular single-page app. A script gets only `<app-root>Loading...</app-root>`. It needs a browser, and a person must check.** I did not call its hidden API. Several LARA SUD-licensure URLs found by search now return 404 (e.g. `/lara/bureau-list/bchs/substance-use-disorder-licensure`).
- **No public downloadable list** of licensed SUD programs was found. A FOIA request to LARA is the honest route to a bulk list (https://www.michigan.gov/foia). BCHS contact per the search results: 517-241-1970, bchs-statelicensing@michigan.gov. That comes only from search snippets, since the page 404s now.
- Indirect proxy: SAMHSA lists only programs "approved for inclusion by the state substance use… authority". In FindTreatment's LCA field, 30 of the 36 SA facilities in the four cities say "State substance use treatment agency".
- The SUD recipient-rights poster and the regional rights contacts are PDFs linked from the non-long-term-care page.

## 5. Recovery housing

- **MARR** (Michigan Association of Recovery Resources, Holland, MI) is "the sole Michigan NARR Affiliate". It certifies homes to NARR standards (Levels 1–4) and publishes the directory. Site: https://michiganarr.com/ (script: yes; GoDaddy site). The directory is **"FULL RR Operator List"**, https://michiganarr.com/full-rr-operator-list-1, script: yes. **The link on michigan.gov, `michiganarr.com/full-operator-list`, is now 404**, so tell MDHHS or just link the working URL.
  - 102 operators statewide. **15 in Wayne County**, nearly all Detroit and Highland Park.
  - Each entry has level, gender, MAT acceptance, "felony friendly", ADA, rates, and a named staff contact with email. **Do not copy those contacts.**
  - Disclaimer: "The data listed below was provided by operators… no warranty is given or implied… Do not make any decisions… based solely on the data." The page has a complaint route through MARR's contact form, 616-489-MARR.
- DWIHN: "DWIHN contracts with 14 recovery housing providers with over 50 locations… All DWIHN recovery homes are NARR or MMARR certified and are audited annually" (SUD page). MARR entries show DWIHN paying room and board for its referrals.
- State: MSHDA's Recovery Housing Investment Program funds "certified recovery housing" from opioid-settlement money, $3.37M for FY2026–27. Priority counties are chosen partly by "existing MARR certified housing". Source: https://www.michigan.gov/mshda/homeless/homeless-and-special-housing-needs-programs/recovery-housing-investment-program (script: yes).
- **Michigan does not license recovery residences.** I found **no Michigan statute or official page** that requires certification for all homes. Claims that "state law requires state-funded agencies to refer only to certified homes" appear **only on vendor or aggregator sites** (vanderburghhouse.com, soberlivingapp.com), not on an official page. Treat them as unconfirmed.
- **Federal anti-brokering law:** 18 U.S.C. § 220 (EKRA) makes it a crime to pay or receive "any remuneration (including any kickback, bribe, or rebate)… in return for referring a patient… to a recovery home, clinical treatment facility, or laboratory". The penalty is up to $200,000 and 10 years per occurrence. Source: https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section220&num=0&edition=prelim (script: yes).
- **Recommendation:** **do not list individual homes.** Link to MARR's operator list, and to DWIHN ACCESS, which funds and places people in certified homes. Reasons: homes are unlicensed; entries change often; the only contacts are personal staff lines; the scam risk is highest here; and MARR itself disclaims accuracy. If a steward ever lists one, it should be MARR-certified only, and the badge should say "On MARR's certified list, {date}", not "certified by us".

## 6. Syringe services and harm-reduction supplies (`harm.supplies`)

**The state list** is MDHHS "Find a Syringe Service Program Near Me": https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/syringe-service-programs/find-a-syringe-service-program-near-me (script: yes). The page says "PDF printable map last updated: July 2026" and "Times and locations subject to change."
- PDF: https://www.michigan.gov/mdhhs/-/media/Project/Websites/mdhhs/SSP/SSP-Directory_new---4-16-26.pdf (script: yes).
- Google My Maps "2026 Harm Reduction Agency Directory": KML at `https://www.google.com/maps/d/kml?mid=1uB035V9ODgDQIZi2GX4HuXO95Y7qD_-0&forcekml=1` (script: yes; 147 placemarks, about 35 in our bbox, most of them mobile stops).
- "All syringe service programs in Michigan provide naloxone at no cost" (https://www.michigan.gov/opioids/find-help).

**Detroit SSP operators on the MDHHS list.** Each needs its own page confirmed by a person. **There are no fixed SSP sites in Dearborn, Hamtramck or Highland Park.** Outside Detroit, the Wayne County entries are SOOAR in Inkster (mobile) and a Corewell teen center in Taylor (appointment only).

| Operator | Fixed / mobile | From MDHHS PDF | Owner page check |
|---|---|---|---|
| Community Health Awareness Group (CHAG) | Fixed 1300 W Fort St, Detroit 48226, 313-963-3434; plus about 8 mobile stops | PDF: Tue/Thu/Fri 9–3. **KML says Mon–Thu 9–4:30, Fri 9–3 (mismatch).** | https://www.chagdetroit.org/our-services (yes): mobile "Life Points Outreach Program… eight outreach sites… 10 hours per week", Narcan. Syringe services are not named in the script-readable text, so a person must confirm. |
| Detroit Recovery Project (DRP) | Fixed 1121 E. McNichols, Detroit 48203; mobile unit | PDF: Mon & Tue 1–4, Wed 9–12, Fri 9–2 | **Owner page https://www.recovery4detroit.com/services/ (yes): Street Outreach fixed location "Monday thru Friday 9AM to 4PM", 313-400-3713; Mobile Unit 313-400-2258, "Locations vary… call or text."** The owner page wins, so the PDF is out of date. |
| ECHO Detroit | Mobile; base at SHAR Academy, 1851 W Grand Blvd, Detroit 48208 | "Call for outreach times" | https://www.echodetroit.org/ (yes). ECHO also runs the **Engagement Center**, "The 1st Short-Term Stabilization Facility in Detroit & Wayne County": a 23-hour, 6-bed sobering and peer-linkage center for intoxicated adults, "Admissions and Staffing available 24/7". The only admission number on the page is a named staff person's line, so it is not recorded; a person should ask ECHO for a general line. Source: https://www.echodetroit.org/services/engagement-center/ |
| Safe Point (Team Wellness Center) | Mobile stops (Mt. Elliott, Eastern Market, 7 Mile, Fenkell) | 313-577-8385 | https://teamwellnesscenter.com/ (yes); the SSP schedule was not found in script-readable text. |
| CHASS Center | 5635 W Fort St, Detroit 48209, 313-849-3920 | "Call for times" | https://www.chasscenter.org/ (yes); SSP not named in the text. |
| UNIFIED (HIV Health & Beyond), Detroit office | 3968 Mt. Elliott, Detroit 48207, Mon–Fri 9–5 | 734-572-9355 | **www.miunified.org shows a DNS-parking page ("This domain is registered for one of our customers"), so a person must check.** |

**Free naloxone and test strips (not syringes) in the three non-Detroit cities.** Wayne County HHVS runs **"Well Wayne Stations"**: vending machines and newsstands with naloxone, fentanyl test strips and xylazine test strips, "No ID, no prescription." The program site is https://endoverdosewayne.org/ (script: yes; "Wayne County Department of Health, Human, and Veterans Services"; the page shows only 22 stations). Its **full list is a Google My Maps KML**, `https://www.google.com/maps/d/kml?mid=1fXAp9hNo57tOnuFW1DOKiae7InicBpw&forcekml=1` (script: yes). The KML description says **"Map updated: September 14, 2026"**. It has 97 placemarks: **Dearborn 6, Hamtramck 5, Highland Park 2**, Detroit 13 (which may overlap DHD's layer), and 51 in our bbox. Each placemark has station type, "24/7 Access: Yes/No", indoor or outdoor placement, and a website. **This fills `harm.narcan`/`harm.supplies` for Dearborn, Hamtramck and Highland Park.** DHD's layer covers Detroit only. The KML carries no license. Treat it like the DHD layer: staged, with a `source_listed` badge, and a steward confirms with Wayne County HHVS. DWIHN's page claims "255+" stations, but the map has 97 placemarks, some with several units, so don't quote a count.

MDHHS also has a "Narcan Vending Machines" map, KML `mid=1W-AhICd89o-740l0rUlEbLMUmJNSPyU`, titled "2026 SSP Narcan Directory". It has 564 placemarks, 36 in the bbox, including bars, gas stations and dispensaries. These are mostly naloxone boxes, with few details and no hours. **Do not ingest it.** It is useful only for cross-checking.

## 7. Scams and safety

- **FTC consumer alert (June 5, 2025).** Dishonest businesses buy search ads that **impersonate treatment centers**, "using another center's name… when the number really belongs to the dishonest business". It advises "Don't assume a phone number that comes up in search results belongs to a legitimate business… Go directly to a company or organization's website… start at FindTreatment.gov." Source: https://consumer.ftc.gov/consumer-alerts/2025/06/are-you-looking-treatment-opioid-addiction-or-dependence-avoid-search-scam (script: yes)
- **FTC v. Evoke Wellness (June 11, 2025).** Google ads with Evoke call-center numbers "effectively impersonated other treatment clinics"; telemarketers then redirected callers. The case was brought under the **Opioid Addiction Recovery Fraud Prevention Act of 2018**, which allows civil penalties. Source: https://www.ftc.gov/business-guidance/blog/2025/06/enforcing-opioid-addiction-recovery-fraud-prevention-act-ftcs-settlement-evoke-wellness-what-it (script: yes)
- **Michigan AG warning (Feb 29, 2024).** People searching online for Pine Rest reached "patient brokers" through fake ads. The brokers claimed Pine Rest had no beds and diverted callers out of state, "sometimes as far as California." Source: https://www.michigan.gov/ag/news/press-releases/2024/02/29/ag-nessel-warns-michigan-residents-about-potential-substance-abuse-patient-brokering-scheme (script: yes)
- **Federal EKRA, 18 U.S.C. § 220:** paying or receiving money for referrals to recovery homes or treatment facilities is a crime (see §5).
- **Google Ads policy:** Google "restricts the promotion of recovery-oriented drug and alcohol addiction services… if certified by Google." Source: https://support.google.com/adspolicy/answer/176031 (script: yes). The LegitScript detail appears only on aggregator sites. An ad being allowed is **not** evidence that a helpline is legitimate.
- **Rules a directory should follow** (proposed; add to DECISIONS if adopted):
  1. Record a phone number only from the owner's own page or a government list, never from a search ad, a "Sponsored" result, or a site that is not the owner's.
  2. **No generic "addiction hotline" or 1-8xx number that isn't a government or fellowship line.** Front doors are DWIHN, SAMHSA, 988 and 911 only.
  3. No listings from aggregators (rehab.com, recovery.com, addictionhelp, sober.com and the like, which are Tier D). No out-of-state residential programs.
  4. Show whether a place is in DWIHN's network or on SAMHSA's list, as a dated fact.
  5. Show a plain line: "We never get paid for sending you anywhere. If someone asks you to travel out of state or says the place you called is full, call DWIHN at 800-241-4949."
  6. Stewards re-check every treatment phone number against its owner page with `check:sources`, and any number change is held for approval, as the rules already require.
  7. Never list individual sober homes (§5).
  8. Report abuse at ReportFraud.ftc.gov.

## 8. Wording

- **NIDA "Words Matter"** (https://nida.nih.gov/nidamed-medical-health-professionals/health-professions-education/words-matter-terms-to-use-avoid-when-talking-about-addiction; script: yes):
  - Use person-first language and "let individuals choose how they are described."
  - Avoid "addict", "user", "abuser", "junkie", "alcoholic", "drunk", "clean/dirty", "habit", "abuse", "former/reformed addict", and "opioid substitution/replacement."
  - Use "person with a substance use disorder", "person in recovery", "not drinking or taking drugs", "misuse" (for prescriptions), and **"medication for opioid use disorder (MOUD)"**. NIDA now prefers MOUD to "MAT", because "MAT implies that medication should have a supplemental or temporary role".
  - MDHHS has an anti-stigma page as well: https://www.michigan.gov/opioids/find-help ("End the Stigma").
- **Suggested screen titles** (plain, 6th-grade level, no jargon; Spanish needs a human translator):
  - Triage entry: **"I want help with drugs or alcohol"**.
  - Refinements, only if they change the result: "Help today" (call or walk in) / "Medicine for opioids (like methadone or Suboxone)" / "A place to stay while I stop" (residential) / "Someone I love needs help" (family: DWIHN coaching line, Al-Anon, Nar-Anon).
  - Category labels: "Drug and alcohol treatment" (not "SUD services"); "Detox (help getting through withdrawal)"; "Recovery meetings"; "Free test strips and Narcan"; "Clean needles and supplies" (for SSPs, a common plain term; the alternative is "Safer-use supplies").
  - Supportive line: "You don't have to stop first to ask for help." DWIHN's own copy says "You do not need to be at your worst to ask for help."
  - Avoid "addict", "rehab" as the only word (use "treatment"), "clean", and "abuse".

---

## Recommendation

**Front doors on the treatment screen, in this order:**
1. **DWIHN ACCESS, 800-241-4949: "Free, 24/7, for anyone in Wayne County."** This is the real door to publicly funded treatment in all four cities. It is already in `emergency.csv` as `emg_dwihn_crisis`, labeled "Local mental health crisis line". Keep that row. For the treatment screen, either add a second label or row, such as "Drug or alcohol treatment (Wayne County)", with the same number and `source_url` https://dwihn.org/programs-services/substance-use-help, or relabel the row "Mental health and drug or alcohol help (24/7)". Either way `check:emergency` will match the number on the SUD page. Kyle decides; this is not a new number.
2. **Walk in now (crisis): DWIHN Care Center, 707 W. Milwaukee, Detroit, 24/7, (313) 989-9444.** Label it honestly: "If you're in crisis. Not a detox." It is sensitive, so it gets no map dot, per the existing rule for mental-health crisis listings.
3. **SAMHSA National Helpline, 1-800-662-4357** (English/Spanish; TTY 1-800-487-4889; text ZIP to 435748). This is the national referral fallback.
4. **988**, hardcoded: "call or text if you're in crisis." **911** stays first only on the overdose screen, which keeps its "911 and rescue steps only" rule.
5. Then listings (E1) and link-outs: FindTreatment.gov, meeting finders (AA Wayne County 313-831-5550, NA Metro Detroit 248-543-7200, Al-Anon, SMART), MARR's list, Quitlink 1-800-784-8669, and Problem Gambling 1-800-270-7117.

**Can FindTreatment/SAMHSA be a staged Tier A source?** **Yes, with conditions:**
- (a) **Start from the public-domain National Directory XLSX** and the **OTP Directory CSV**. Both are downloadable, need no registration, carry a clear public-domain notice, and are small.
- (b) Use the **FindTreatment API only after Kyle registers** through the API request form. It gives fresher data and payment and language fields.
- (c) All rows go to `data/staging/` as candidates. They get the one-time entry check, a badge "On SAMHSA's treatment list, read {date}", and never "verified".
- (d) Keep only facility-level rows. Drop MH-only rows. Never touch the practitioner locator.
- (e) Before listing, cross-check against DWIHN's provider CSV for "in DWIHN's network". Use LARA's MI-SLS in a browser for a license spot check.
- (f) SAMHSA gives no hours and no walk-in flag, so listings say "Call first" and show no "open now". **Unknown is never rendered as open.**

**Link vs. list:**

| List (steward-checked) | Link only |
|---|---|
| Treatment facilities (from SAMHSA + DWIHN, per E1) | Recovery homes (MARR list) |
| OTPs | Meeting schedules (each fellowship owns its list) |
| Well Wayne stations for the 3 non-Detroit cities | MiSUD locator, FindTreatment.gov, MSP Angel |
| SSP fixed sites and mobile schedules, from owner pages | |
| ECHO Engagement Center, once a general number is known | |

## Blockers / needs a person

1. **Uninsured eligibility at DWIHN is ambiguous** (Access page vs SUD page). One call to ACCESS should settle it before any "free" wording.
2. **FindTreatment API registration** needs Kyle's decision: a named technical contact and server IPs. It is not needed for the XLSX or the CSV.
3. **LARA MI-SLS license search is a JS app**, so there is no scriptable license check. Checks are by hand, or a FOIA request for a bulk list.
4. **DWIHN FHIR provider-directory endpoint (port 9443) timed out from here.** Retest from another network.
5. Blocked or JS-only pages: Nar-Anon (403), Al-Anon search, SMARTfinder, MiSUD (Power BI), FindTreatment UI. Link only.
6. Mismatches to resolve:
   - Team Wellness East CSU phone: 313-331-3435 (web) vs 313-969-5387 (DWIHN PDF).
   - DRP SSP hours: owner page vs MDHHS PDF.
   - CHAG hours: PDF vs KML.
   - Gambling helpline: 800-270-7117 vs "1-800-GAMBLER" on the MDHHS county page.
   - MARR link on michigan.gov is 404.
   - UNIFIED's website is parked.
7. The ECHO Engagement Center publishes only a staff member's direct line. Ask for a general admissions number.
8. The Well Wayne KML and the MDHHS KMLs carry no license. A steward should confirm reuse with Wayne County HHVS and MDHHS before publishing, same as the DHD approach.
