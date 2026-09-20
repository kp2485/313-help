# E1: Drug and alcohol treatment places in or serving Detroit, Hamtramck, Highland Park and Dearborn

Research date: 2026-09-19. Lane E1 (the places). This is research only; nothing in the repo was changed.

## Overview

- I checked 39 candidates: 30 are listing-ready or nearly so, and 9 are blocked, unverified, or outside our cities. Every phone and address was checked against the provider's own page, fetched with `curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`. All fetches were on 2026-09-19. Aggregators (findhelp, rehab.com, recovery.com and similar) were used only to find names. The one exception I relied on is SAMHSA's **federal Opioid Treatment Program (OTP) directory CSV** (`https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory/export?page&_format=csv`, HTTP 200). It is a government list, not an ad directory, and it is the best list of methadone clinics. It shows **11 certified OTPs in our four cities: 10 in Detroit and 1 in Highland Park (Rainbow). It lists none in Hamtramck or Dearborn.** The nearest one outside our cities is Premier Services in Dearborn Heights, which is not Dearborn.
- **Walk-in or 24/7 entry is real in Detroit.** Salvation Army Harbor Light (detox, 24/7 walk-in), Sobriety House (men, "Walk-Ins 24/7"), the DWIHN Care Center and Team Wellness East crisis units (24/7 walk-in, no ID or insurance needed), ECHO Detroit's Engagement Center (for people who are intoxicated), and QBH, Elmhurst and DRMM (24/7 intake lines).
- **Most publicly funded residential and detox beds are reached through DWIHN's access line (800-241-4949).** Several providers say so outright: Mariners Inn, Elmhurst, Sobriety House, SHAR, STAR, and Rainbow. For the app, the "how to get in" text is often "walk in, or call DWIHN and ask for this place." E2 owns the details of the DWIHN system.
- **Dearborn and Hamtramck are thin.** No detox, residential program, or methadone clinic in either city appears on a provider's own site. Dearborn has ACCESS (Arabic mental health, plus drug-use prevention and overdose response) and Henry Ford Ford Road (behavioral health). Hamtramck has Passenger Recovery's recovery community center, which is free and has walk-in hours. **Highland Park is well served:** Rainbow Center (methadone) and Elmhurst's Naomi's Nest (women's residential).
- **Nine pages print a wrong or conflicting number.** See "Contradictions and stale data" at the end. Three of them print a **wrong DWIHN crisis/access number**. The app must not copy footer numbers from provider pages without a person checking them.

Legend. **Status** is one of three values:
- **verified-on-own-page**: the provider's own page shows the phone digits and the street number as plain text on one URL.
- **partial**: the provider's own page confirms the service, but the phone and address are not both plain text on one page, or a key fact is missing.
- **unverified**: only a government directory or aggregators confirm it, or the site is blocked.

**Check URL** is the one page where the phone and the street number both appear. All HTTP statuses are 200 unless noted.

---

## Summary table

| # | Place | City | Level of care | Walk-in / same day | Cost | Status |
|---|---|---|---|---|---|---|
| 1 | DWIHN Care Center (707) | Detroit | Crisis (mental health + substance use) | Walk-in 24/7, all ages | Free, no insurance needed | verified |
| 2 | Team Wellness Center East crisis unit | Detroit | Crisis | Walk-in 24/7, adults | Medicaid, sliding fee | verified |
| 3 | ECHO Detroit Engagement Center | Detroit | Sobering / engagement (23-hour) | Admissions 24/7 (6 beds) | Free | partial |
| 4 | Salvation Army Harbor Light, Detroit | Detroit | Detox, residential, outpatient, Suboxone/Vivitrol | Walk-in 24/7 | Not stated on page | verified |
| 5 | Detroit Rescue Mission Ministries (DRMM) Christian Guidance Center / Genesis House III | Detroit | Detox, residential, outpatient, women's program | 24/7 helpline | DWIHN, SAMHSA, donors cover uninsured | verified |
| 6 | Quality Behavioral Health (QBH), E. Grand Blvd | Detroit | Detox, residential | 24/7 central intake | Not stated on page | verified |
| 7 | QBH Medbury | Detroit | Detox, residential, methadone clinic | 24/7 central intake | Not stated on page | verified |
| 8 | QBH central intake / Gratiot | Detroit | Outpatient, medication treatment | 24/7 intake line | Not stated on page | verified |
| 9 | Sobriety House | Detroit | Residential + outpatient (men) | "Walk-Ins 24/7" | Via DWIHN | verified (phone conflict) |
| 10 | Mariners Inn | Detroit | Residential, IOP (men 18+) | Front desk helps; entry via DWIHN | Medicaid, sliding fee, DWIHN | verified |
| 11 | SHAR Main | Detroit | Residential (men + women's unit), outpatient, Vivitrol | 24/7; DWIHN authorization | DWIHN, insurance | verified |
| 12 | Elmhurst Home, James Oden Center | Detroit | Residential + outpatient (men) | Residential intake 24/7 | Nobody turned away; DWIHN referral | verified |
| 13 | Elmhurst Home, Naomi's Nest | **Highland Park** | Residential + outpatient (women) | Residential intake 24/7 | Nobody turned away; DWIHN referral | verified |
| 14 | Positive Images | Detroit | Women's residential + outpatient (pregnant women, mothers with kids) | Not stated | Not stated | verified (address conflicts with aggregators) |
| 15 | New Light Recovery Center | Detroit | Methadone clinic + Suboxone, Vivitrol | Hours printed | Not stated | verified |
| 16 | Rainbow Center of Michigan | **Highland Park** | Methadone clinic | 24-hour access line | DWIHN provider | verified |
| 17 | STAR Center | Detroit | Methadone clinic | Hours printed | Medicaid/Medicare via DWIHN | partial (no address on own site) |
| 18 | Wayne Health, Tolan Park Methadone Clinic | Detroit | Methadone + buprenorphine | Not stated | Medicaid letter posted | partial |
| 19 | Metro East | Detroit | Methadone clinic | ? | ? | unverified (site needs a browser) |
| 20 | Nardin Park Recovery Center | Detroit | Methadone clinic | ? | ? | unverified (no own site found) |
| 21 | Sunshine Treatment Institute | Detroit | Methadone clinic | ? | ? | unverified (no own site found) |
| 22 | Institute of Supportive Services | Detroit | Methadone clinic | ? | ? | unverified (no own site found) |
| 23 | Romancare Health Services | Detroit | Methadone clinic (provisional certification) | ? | ? | unverified (Facebook only) |
| 24 | VA Detroit (John D. Dingell) | Detroit | Veterans only: outpatient, residential, methadone | "with or without an appointment" | VA | partial |
| 25 | Team Wellness Center Suboxone clinic | Detroit | Office-based buprenorphine | "walk-ins are welcome" (news/aggregator only) | Medicaid, sliding fee | verified |
| 26 | CHASS Center | Detroit (SW) | Medication for opioid use disorder at a community health center; English/Spanish | Not stated | Sliding fee | verified |
| 27 | Covenant Community Care, Michigan Ave | Detroit (SW) | Suboxone/Sublocade, counseling | Not stated | Not stated on SUD page | partial |
| 28 | Detroit Recovery Project | Detroit | Outpatient, medication for opioid use disorder, peer recovery, re-entry | Hours on aggregators only | Not stated | verified (phone typo on page) |
| 29 | Henry Ford Health, One Ford Place | Detroit | Addiction medicine, medication-assisted treatment (MAT) | "same-day access" (system-wide claim) | Insurance | verified |
| 30 | NSO 360 Neighborhood Wellness Centers | Detroit | Primary care + substance use treatment | "Same day, next day" appointments | "Most major insurance" | partial (vanity phone number) |
| 31 | Central City Health | Detroit | Co-occurring (serious mental illness + substance use) | Not stated | Sliding fee, nobody refused | verified (wrong DWIHN number on page) |
| 32 | Passenger Recovery Community Center | **Hamtramck**/Detroit (48211) | Recovery support, peer coaching | Walk-ins Wed–Fri 2–4 pm | Free | verified |
| 33 | CLASS Agency | Detroit | Outpatient (adults, teens, children) | No | Not stated | verified (footer dated 2022) |
| 34 | Centers for Family Development (formerly Black Family Development) | Detroit | Outpatient/IOP, adults + adolescents | No | Medicaid required | verified |
| 35 | American Indian Health & Family Services | Detroit (SW) | Outpatient substance use treatment | No | Insured or sliding fee | verified |
| 36 | ACCESS Behavioral Health | **Dearborn** | Arabic mental health; drug-use prevention; overdose response team | No | Sliding fee | partial (no drug or alcohol treatment program on own site) |
| 37 | Arab American and Chaldean Council (ACC) | Dearborn? | "Substance abuse & co-occurring treatment" | ? | ? | unverified (no Dearborn address on own site) |
| 38 | DMC Detroit Receiving Hospital emergency department (peer recovery coaches) | Detroit | Emergency room + peer coaches | 24/7 emergency room | ED | unverified (Cloudflare blocks scripts) |
| 39 | Henry Ford Medical Center, Ford Road | **Dearborn** | Behavioral health (addiction not confirmed) | No | Insurance | partial |

---

## A. Crisis and sobering

### 1. DWIHN Care Center (707 W. Milwaukee), a crisis stabilization unit (CSU)
- **Plain words:** A calm place to go when things are really bad with drugs, alcohol, or your mind. Open day and night. You can stay up to 3 days. You do not need ID or insurance.
- **Level:** crisis. The page says the unit handles "a mental health or substance use emergency". It does **not** say it takes people who are very intoxicated; ECHO (below) is the place built for that.
- **Walk-in (quote):** "CSUs are open 24/7. Walk in without an appointment. Adults and children both welcome." Also: "You do not need an ID, insurance card, or appointment." Stay: "up to 72 hours".
- **Cost:** "no insurance is needed".
- **Eligible:** adults and children.
- **Address:** 707 W. Milwaukee Ave, Detroit, MI 48202.
- **Phone:** (313) 989-9444 (the Care Center line printed on the page). DWIHN's 24/7 line is 1-800-241-4949 and its mobile crisis line is 1-844-462-7474 (E2 owns these).
- **Hours:** "Open 24/7".
- **Serves:** Wayne County, so all four cities.
- **Check URL:** https://dwihn.org/crisis-help (also https://dwihn.org/programs-services/crisis-services, same content). HTTP 200.
- **Status:** verified-on-own-page.

### 2. Team Wellness Center, Team East crisis stabilization unit
- **Plain words:** A crisis center for adults, open day and night, for mental health or drug and alcohol crises.
- **Level:** crisis.
- **Walk-in:** On DWIHN's page it is marked "Adults Walk-in 24/7". Team's own site says "24/7 Crisis Hotline: (888) 813-TEAM" and "Call 24/7 (888) 813-8326".
- **Cost (Team's own page):** "We accept most major insurances, including Medicaid, and for the uninsured, we offer services on a sliding fee scale based on income."
- **Address:** 6309 Mack Ave., Detroit, MI 48207.
- **Phone:** (313) 331-3435. This is the clinic line on both DWIHN's page and Team's page. Team's 24/7 line is (888) 813-8326.
- **Check URL:** https://teamwellnesscenter.com/ (both 6309 Mack and (313) 331-3435 are in the text). Team's `/crisis-stabilization/` page returns **404**. A 2020 City of Detroit flyer lists a referral line, 313-969-5387, which I did not verify.
- **Status:** verified-on-own-page. A person should confirm the CSU is still at Team East, since the old CSU page is gone. DWIHN's page, dated 2026, still lists it.

### 3. ECHO Detroit Engagement Center (run by SHAR for DWIHN)
- **Plain words:** A safe place to rest while you are drunk or high, watched over by staff, with recovery coaches who have been there too. Showers, snacks and laundry. They help you find treatment when you are ready.
- **Level:** sobering / engagement center, 23-hour stays. The page calls it "The 1st Short-Term Stabilization Facility in Detroit & Wayne County".
- **Who it's for (quote):** "Designed for individuals experiencing intoxication from alcohol or other substances." The page also says it is "unaffiliated with the criminal justice system" and "not homeless shelters and do not function as mental health crisis centers."
- **Admission (quote):** "*We have limited bed space (6 beds) beginning December 4th." and "Admissions and Staffing available 24/7". **The only admissions number printed is a named staff member's direct line, so I did not record it.** Org lines: (313) 556-5222, and the desk line 313-894-8444 ext. 1110.
- **Cost:** "free, confidential" (home page). **Eligible:** "adults in Wayne County".
- **Address:** 1851 West Grand Blvd., Detroit, MI 48208. This is ECHO's and SHAR Academy's address, printed under "Engagement Center" in the site footer. **The page never says in plain words that the beds are at this address; a person should confirm.**
- **Check URL:** https://www.echodetroit.org/services/engagement-center/ (has "1851 West Grand Blvd." and "(313)556-5222"). Page dateModified 2026-06-30.
- **Status:** partial. The "beginning December 4th" line has no year. News from November 2025 about a different, Macomb County engagement center suggests ECHO's opened around December 2024 or December 2025; I could not pin it down.

### 38. DMC Detroit Receiving Hospital emergency department (peer recovery coaches)
- **Plain words:** A hospital emergency room, open all the time. Peer coaches there help people get into treatment.
- **Evidence:** a Michigan Health & Hospital Association news item dated **2026-09-14** says DMC's Peer Recovery Coach program made "more than 4,500 screenings and 3,900 referrals for admission to residential treatment" over four years, with coaches at Detroit Receiving. This is news only, not DMC's own page.
- **Own site:** dmc.org returned **403 with a Cloudflare "Just a moment..." challenge. It blocks scripts, so a person must check** the address, phone, and whether the ED starts buprenorphine.
- **Status:** unverified. I found **no own-page evidence** that any hospital ED in our four cities publishes a "come here to start buprenorphine" or bridge-clinic program (Henry Ford, DMC, Ascension, Corewell). Research papers mention ED buprenorphine in Detroit, but nothing is published for patients.

---

## B. Detox (withdrawal management) and residential treatment

### 4. The Salvation Army Harbor Light, Detroit campus
- **Plain words:** A safe place to stop using, with nurses, for 3 to 5 days. After that you can stay for treatment (30 to 90 days) or come for outpatient visits. Suboxone and Vivitrol are offered. Christian-run.
- **Level:** detox ("Sub-Acute Detox", "Length: 3-5 days"), residential ("30-90 days"), IOP and outpatient, and Suboxone/Vivitrol.
- **Walk-in (quote):** "Harbor Light provides prompt response 24/7 to meet the needs of walk-ins and referrals ready for treatment." Also: "Walk in or call to meet with a Care Coordinator 24 hours a day, 7 days a week". The history section says: "Detox programs have 24 hour admittance".
- **Eligible:** "male and female adults physically and mentally able to participate in the program". Pregnant women and women with children: "Intensive Outpatient for Pregnant/Women with Children" (the Evangeline Center, Detroit only).
- **Cost:** **not stated on the page.**
- **Address:** 3737 Lawton Street, Detroit, MI 48208. **Phone:** 313-556-5555 ("Our treatment team is ready 24/7").
- **Check URL:** https://www.salvationarmyusa.org/mi/monroe/n-monroe-street/harbor-light/. The path says "monroe", but this is the whole Harbor Light system page and lists the Detroit campus first. The page's JSON shows updatedAt 2026-09-15. The Detroit-specific page (https://www.salvationarmyusa.org/usa-central-territory/great-lakes/metro-detroit/detroit-harbor-light/) has **no phone or address**, and the old `centralusa.salvationarmy.org/MetroDetroit/harbor-light/` now redirects to the Metro Detroit home page.
- **Stale:** the history text says women outside Detroit and Highland Park "can be admitted with a referral from SEMCA". SEMCA stopped managing SUD referrals years ago; DWIHN handles them now. Do not copy that line.
- **Status:** verified-on-own-page.

### 5. Detroit Rescue Mission Ministries (DRMM): Christian Guidance Center and Genesis House III
- **Plain words:** Detox with nurses and a doctor, then a live-in program for up to 90 days. Genesis House III is for women. Christian-run; the spiritual part is voluntary (per aggregators; not re-checked on the own page).
- **Level:** "Withdrawal Management (formerly called sub-acute detoxification)", "Residential", "Women Specialty Services", "Outpatient and Intensive outpatient".
- **Access:** "24/7 Addiction Helpline: 313-263-0077" and "Call our 24/7 Addiction Helpline". Referrals: the page says residents come by referral from "courts, police, treatment hotlines and agencies".
- **Cost (quote):** "Individuals with addictions who do not meet their guidelines and have no insurance are provided treatment through contributions made by our individual donors." MDOC, SAMHSA and DWIHN fund referrals.
- **Eligible:** Christian Guidance Center is listed as "Men" on the support-services page but as "(All Male and Female Facility)" on the locations page. **That conflicts.** Genesis House III is for women.
- **Address:** 19211 Anglin Street, Detroit, MI 48234. The locations page prints it once, under Genesis House III. Aggregators put Christian Guidance Center at the same address.
- **Check URL:** https://drmm.org/about-us/locations/ (has "19211 Anglin Street" and "313-263-0077"). Services page: https://drmm.org/services/support-services/.
- **2026 evidence:** a Recovery Month post dated Sept 9, 2026, and DWIHN-sponsored billboards in September 2026.
- **Status:** verified-on-own-page. The men/women conflict should go to a steward.

### 6–8. Quality Behavioral Health (QBH)
- **Plain words:** Detox with nurses and a doctor watching you around the clock, then a live-in program. QBH also runs a methadone clinic and mobile methadone vans.
- **Level:** "Withdrawal Management, Residential & Recovery" at two Detroit sites; "Outpatient and Medication Assisted Treatment" at Gratiot. 6821 Medbury is also a federally certified methadone clinic (SAMHSA OTP list, certified 2020-10-05).
- **Access (quote):** "24/7 central intake" and "We’re available 24/7 to provide immediate access to care." The detox page says "Staff is present 24/7".
- **Sites and phones (as printed):**
  - 751 East Grand Blvd, Detroit, MI 48207: 313-922-2222 and 313-922-3333.
  - 6821 Medbury St, Detroit, MI 48211: 313-922-2222 and 313-922-3333. SAMHSA lists this OTP at (313) 922-3333.
  - 7220 Gratiot, Detroit, MI 48213 (central intake): 855-838-4222.
- **Cost / eligibility:** not stated on these pages. The FAQ shows the residential rules are for adults and mentions "Minors are not allowed to smoke", which suggests minors may be served. **Unclear.**
- **Check URL:** https://www.qbhrecovery.org/locations/ (all three addresses and phones; modified 2025-10-28).
- **Status:** verified-on-own-page.

### 9. Sobriety House
- **Plain words:** A place for men to live while getting treatment (about 30 days), plus outpatient visits.
- **Level:** residential (up to 30 days, per the admissions page) and outpatient. **Men only** ("Adult male residential & outpatient treatment center"; "ALL MALES ARE WELCOMED").
- **Walk-in (quote):** "ADMINISTRATION HOURS Mon-Fri 8:30am - 4:30pm / Walk-Ins 24/7".
- **Access:** the admissions page says intake starts "by phone or personal request for interview by Screening Staff at 1-800-241-4949" (DWIHN).
- **Address:** 2081 W. Grand Blvd., Detroit, MI 48208. **Phone:** (313) 895-0500.
- **Check URL:** https://www.sobrietyhouse.net/ (https works). Modified 2024-05-20; © 2024.
- **Problem:** the footer on every page says "Authorization via (Wellplace) 800-421-4949". **Wellplace is DWIHN's former vendor, and 800-421-4949 is not DWIHN's number (800-241-4949).** Never copy the footer number.
- **Status:** verified-on-own-page (address + main phone). The site shows no activity since 2024, so a person should call to confirm it is still open.

### 10. Mariners Inn
- **Plain words:** A place for men to live while getting treatment, often for men without a home. Outpatient groups afterward. There is also a gambling program.
- **Level:** residential; IOP for "adults age 18 and older" (IOP is 9 or more hours of group and counseling a week while living at home). Gambling-disorder residential program too.
- **Eligible:** residential is for "men who are at least 18 years of age and have substance use or co-occurring disorders".
- **Access (quote):** "Clients interested in services should dial the Detroit Wayne Mental Health Authority’s 24-hour access line (800-241-4949). Clients who many need assistance with this process can visit our front service desk for assistance."
- **Cost:** the insurance page lists several plans (as images). The text says Mariners Inn accepts "the majority of PPO Commercial products" and works with DWIHN.
- **Address:** 445 Ledyard St. Detroit, Michigan 48201. **Phone:** (313) 962-9446 (main).
- **Check URL:** https://www.marinersinn.org/residential-treatment-programs. The IOP page shows only a named staff extension, which I did not record.
- **Status:** verified-on-own-page.

### 11. SHAR (Self-Help Addiction Rehabilitation), SHAR Main
- **Plain words:** A place to live while getting treatment, up to 120 days. There is a unit for women. Vivitrol shots are offered after you have been off opioids for 7 to 10 days.
- **Level:** residential (up to 120 days), outpatient, a "Ladies Speciality Unit", Vivitrol, recovery housing.
- **Hours / access (quote):** "SHAR Main (Detroit) 24/7 Member must call 1-800-241-4949 for complete assessment and authorization."
- **Address:** 1852 W. Grand Blvd., Detroit, MI 48208. **Phone:** (313) 894-8444. The home page also lists info lines (313) 894-8276 and customer service (877) 815-2070.
- **Check URL:** https://sharinc.org/ (address + phone in LOCATIONS). Programs page: https://sharinc.org/programs---services.html. © 2025.
- **Status:** verified-on-own-page.

### 12–13. Elmhurst Home: James Oden Center (men, Detroit) and Naomi's Nest (women, **Highland Park**)
- **Plain words:** A place to live while getting treatment, 14 days to 90 days. Separate homes for men and women. Outpatient visits after.
- **Level:** residential (short- and long-term), OP/IOP, recovery housing. The home page says Elmhurst has been a certified community behavioral health clinic (CCBHC) since 2021: "we are required to serve anyone who requests care ... regardless of their ability to pay, place of residence, or age".
- **Cost (quote):** "NO ONE IS TURNED AWAY FOR AN INABILITY TO PAY AND THERE IS A DISCOUNTED/SLIDING FEE SCHEDULE". The women's page says people entering "DO NOT need: Insurance, Money, or Material Possessions."
- **Access (quote):** "Residential Intake: 24 hours/7 days". Residents need "A referral from Detroit Wayne Integrated Health Network 1-800-241-4949) and/or ... parole or probation agents, Wayne County Sheriff's Office, or a District Court".
- **Sites:**
  - James Oden Center (men): 12007 Linwood, Detroit, MI 48206, (313) 867-1090.
  - Naomi's Nest (women): 245 Pitkin, Highland Park, MI 48203, (313) 865-1500.
  - The admin office is 12010 Linwood; customer service is (313) 707-0539.
- **Check URL:** https://ehinc.org/ (both sites with phones). Women's page: https://ehinc.org/womens-specialty-program. Recent items: a PREA report for Oct 2024–Sept 2025 and a 2025 Toys for Tots post.
- **Status:** verified-on-own-page. Naomi's Nest is **one of the few residential options in Highland Park.**

### 14. Positive Images, Inc.
- **Plain words:** A home for women getting treatment, including pregnant women and moms who bring their kids. Childcare is on site.
- **Level:** women's residential ("family-style residence serving women with children or pregnant women") and outpatient ("Register for Our Residential or Outpatient Treatment Program").
- **Address (own site):** 13336-13340 E Warren Ave., Detroit, MI 48215. **Phone:** 313-822-6940.
- **Check URL:** https://www.positiveimageinc.org/ (footer "2023 - 2026"). Services: https://www.positiveimageinc.org/advocacy-groups-services.
- **Conflict:** aggregators list 700 East Grand Boulevard, Detroit 48207, (313) 702-1301. The own site wins, but a person should call.
- **Cost / how to enter:** not stated.
- **Status:** verified-on-own-page (address + phone).

### 24. VA Detroit Health Care: John D. Dingell VA Medical Center (veterans only)
- **Plain words:** For veterans. Counseling, groups, medicine, and a live-in program for addiction.
- **Level:** outpatient, residential, and a federally certified methadone clinic (SAMHSA list: 4646 John R. St., 313-576-1000).
- **Walk-in:** the SUD section says "Visit our office, with or without an appointment" but also "A referral is required". **That conflicts.** Service hours are Mon–Sat 8:00 a.m. to 4:30 p.m. The ED is open 24/7.
- **Address:** 4646 John R Street, Detroit, MI 48201-1916. **Phone:** 313-576-1000 (main). It appears only in `va-telephone contact="..."` attributes, **not as plain text**, so our checker would miss it unless it reads attributes.
- **Check URL:** https://www.va.gov/detroit-health-care/locations/john-d-dingell-department-of-veterans-affairs-medical-center/.
- **Status:** partial.

---

## C. Methadone clinics (opioid treatment programs, OTPs)

Source for the full list: the SAMHSA OTP directory CSV (federal). Only the providers' own sites confirm hours and intake.

### 15. New Light Recovery Center
- **Plain words:** A clinic that gives methadone (or Suboxone or Vivitrol) to stop opioid cravings and withdrawal, plus counseling.
- **Level:** OTP (methadone maintenance, "Methadone-To-Abstinence Program"), Suboxone, Vivitrol, women's specialty, cocaine groups, acupuncture.
- **Hours (quote):** "Monday - Friday: 6:00am - 3:00pm / Saturday 8:00am - 10:00am / Sunday: Closed". New-patient intake hours are **not published**.
- **Address:** 300 W. McNichols, Detroit, MI 48203. This is on the Detroit/Highland Park line; some aggregators say Highland Park. **Phone:** (313) 867-8015.
- **Check URL:** https://www.nlrc.net/ (also /services). The SAMHSA list matches (certified 2003).
- **Status:** verified-on-own-page.

### 16. Rainbow Center of Michigan, Highland Park clinic
- **Plain words:** A methadone clinic with counseling.
- **Eligible (quote):** "We serve individuals from 21 years of age to 70+ years." **People aged 18–20 are not served here.**
- **Access:** 1-800-965-7754 ("24hr Access#") and 313-673-1008 ("24Hr Emergency#"). The page says services are available "24 hours/7 days, 365 days of the year by calling the DWIHN access line at 800-241-4949 or our 800# listed above." DWIHN member provider.
- **Address:** 12501 Hamilton Ave., Highland Park 48203. **Phone:** 313-865-1580 (main).
- **Check URL:** https://rainbowcm.com/ (redirects to /index.html). The admissions page has no text content.
- **Status:** verified-on-own-page. **This is the only methadone clinic in Highland Park.**

### 17. S.T.A.R. Center, Inc.
- **Plain words:** A methadone clinic.
- **Hours (quote):** "Our office is open from 6:00AM-2:00PM Monday-Friday with the exception of Thursday (open 6:00AM-12:00PM) for all of our services. We are open Saturdays for only dosing."
- **Cost / access (quote):** "If you are a resident of Wayne County and have Medicare, Medicaid, or HMP, you can call 800-241-4949 and inquire for covered treatment. You can request to be placed at Star Center."
- **Phone:** (313) 493-4410. **Address:** **not on its own site**. SAMHSA lists 13575 Lesure St., Detroit, MI 48227.
- **Check URL:** none. https://starcenterinc.org/ has the phone only (© 2025).
- **Status:** partial.

### 18. Wayne Health: Tolan Park Research Clinic / Methadone Clinic
- **Plain words:** A university clinic that gives methadone or buprenorphine, with counseling and groups.
- **Address:** 3901 Chrysler Dr, Suite 1A, Detroit, MI 48201. The two location pages spell it differently: "3901 Chrysler Drive,Ste 1A".
- **Phone on own page:** (877) 929-6342, printed as "(877) WAYNE-HC or (877) 929-6342". This is a system-wide scheduling line. SAMHSA lists the clinic's own line as (313) 993-3964, which does **not** appear on the own page.
- **Cost:** the page links a "Medicaid Patient Letter".
- **Check URL:** https://www.waynehealthcares.org/locations/tolan-park-research-clinic-methadone-clinic-2/ (duplicate: `...-3/`). Service description: https://www.waynehealthcares.org/find-a-service/psychiatry-and-behavioral-health/addiction-and-substance-abuse/.
- **Status:** partial. Intake hours are not published.

### 19–23. Methadone clinics I could not verify on their own sites
All five are on the SAMHSA OTP CSV (fields as printed there). None should be listed until a person calls.

| Program (SAMHSA name) | Street | City / ZIP | Phone (SAMHSA) | Cert. | Own-site status |
|---|---|---|---|---|---|
| Metro East Drug Treatment | 13929 Harper Ave. | Detroit 48213 | (313) 371-0055 | Certified 2004 | https://www.metro-east.org/ returns a script-only shell (empty in curl and WebFetch). **Needs a browser; a person must check.** |
| Nardin Park Recovery Center | 9605 Grand River Ave. | Detroit 48204 | (313) 834-5930 | Certified 2004 | No own site found (nardinpark.org is an unrelated church). |
| Sunshine Treatment Institute, PLLC | 4821 E McNichols Road | Detroit 48212-1720 | (313) 826-6063 | Certified 2008 | No own site found. Aggregators say "Hamtramck"; the ZIP 48212 spans both cities. |
| Institute of Supportive Services, Inc. | 19940 Conant St. Suites A, B & C | Detroit 48234 | (313) 733-4528 | Certified 2018 | No own site found. Aggregators give the wrong ZIP (48219). |
| Romancare Health Services | 9600 Dexter Ave | Detroit 48206 | 248-218-1198 | **Provisional** | Facebook only. The CDC NPIN listing gives 248-218-1199, which conflicts. |

---

## D. Buprenorphine (Suboxone) and other medications outside methadone clinics

### 25. Team Wellness Center: Suboxone clinic (office-based opioid treatment)
- **Plain words:** A clinic where a doctor can prescribe Suboxone and you also get counseling.
- **Eligible (quote):** "You are 18 years or older and have been dependent on painkillers or heroin for more than a year". **This is a barrier; the app should not repeat it as a rule.**
- **Cost (quote):** "Team Wellness Center provides substance abuse treatment to all patients, regardless of their ability to pay. For those without insurance, we offer a sliding fee scale based on income."
- **Walk-in:** a patient review on the page says "just walk in". That is not a policy statement, so I recorded walk-in as not stated.
- **Sites (own page):**
  - Eastern Market Clinic: 2925 Russell St., Detroit, MI 48207, (313) 396-5300.
  - Team East: 6309 Mack Ave., Detroit, MI 48207, (313) 331-3435.
  - Team Jefferson: 11105 E Jefferson Ave., Detroit, MI 48214, (313) 332-0257.
  - The page does not say which sites run the Suboxone clinic.
- **Check URL:** https://teamwellnesscenter.com/ (addresses + phones). Program page: https://teamwellnesscenter.com/suboxone/.
- **Status:** verified-on-own-page for the addresses. Which site offers Suboxone is unknown.

### 26. CHASS Center (community health center, southwest Detroit)
- **Plain words:** A neighborhood health center that can treat opioid addiction with medicine. Staff speak English and Spanish.
- **Services (quote):** "MAT (Medication Assisted Treatment) for Opioid Use Disorder", "Peer recovery support". Services "are provided in English and Spanish".
- **Cost (quote):** "For those without coverage, services are provided on a sliding fee scale based on household size and income."
- **Address:** 5635 West Fort Street, Detroit, MI 48209. **Phone:** 313.849.3920.
- **Check URL:** https://chasscenter.org/wellness/list/behavioral_health (© 2023 footer).
- **Status:** verified-on-own-page.

### 27. Covenant Community Care, Michigan Avenue (Recovery)
- **Plain words:** A health center with counseling and Suboxone or Sublocade to help you stop opioids.
- **Services:** "MAT (Suboxone, Sublocade, etc) focused SUD Counseling", "12 Step and Harm Reduction Approaches". The location page says it serves southwest Detroit **and Dearborn**.
- **Hours for the SUD block (as printed):** Mon–Fri 9:00am – 5:00pm ("appointments after 5:00pm available upon request").
- **Address:** 5716 Michigan Ave, Detroit, MI 48210.
- **Phone:** the recovery scheduling line is **only in a `tel:` link, not as plain text**. The href is (313)625-1336, and the same element's id attribute says "(313) 554-3880". **That conflicts.** Plain-text numbers on the location page are after-hours or fax lines.
- **Check URL:** https://www.covenantcommunitycare.org/health-services/substance-use-treatment-counselor-in-detroit (address plain; phone not plain).
- **Status:** partial.

### 29. Henry Ford Health: One Ford Place (Behavioral Health, Addiction Medicine)
- **Plain words:** A Henry Ford clinic for addiction and mental health, with a doctor who can prescribe medicine for addiction.
- **Evidence:** the MAT page says MAT is offered at "Henry Ford Behavioral Health – Detroit". The One Ford Place page lists "Addiction Medicine" and says services include "addiction". The system addiction page claims "same-day access". That claim is system-wide, not specific to this site.
- **Hours (Behavioral Health, as printed):** Monday and Tuesday 8:00 a.m. – 7:00 p.m.; Wednesday and Thursday 8:00 a.m. – 6:00 p.m.; Friday 8:00 a.m. – 4:00 p.m.
- **Address:** 1 Ford Place, Detroit, MI 48202. **Phone:** (313) 874-6677 (Behavioral Health).
- **Check URL:** https://www.henryford.com/locations/1-ford-place.
- **Cost:** insurance-based. Medicaid and uninsured patients are not addressed.
- **Status:** verified-on-own-page. Henry Ford's detox and residential are at Maplegrove, West Bloomfield, **outside our cities**.

### 30. NSO (Neighborhood Service Organization): 360 Neighborhood Wellness Centers
- **Plain words:** A neighborhood doctor's office that also treats drug and alcohol problems.
- **Quote:** "Same day, next day, in-person and virtual/phone visits appointments." Services include "Substance Use Treatment" and "Most major insurance plans accepted".
- **Hours:** Mon–Fri 8:30 a.m. – 5 p.m. at each site.
- **Sites (as printed):** 882 Oakman, Suite F, Detroit 48238; 3426 Mack Avenue, Detroit 48207; 8600 Woodward Avenue, Detroit 48202.
- **Phone:** "1-888-360-WELL" is printed in letters, which spells 1-888-360-9355. **Our checker looks for digits and will not find it.** NSO's main line (313) 961-4890 appears on other NSO pages.
- **Check URL:** https://www.nso-mi.org/360-neighborhood-wellness-centers.html.
- **Note:** NSO's COPE crisis program ended on 2025-11-16 (home page notice).
- **Status:** partial.

(Also see #4 Harbor Light for Suboxone/Vivitrol, #11 SHAR for Vivitrol, #7 QBH for methadone, and #28 Detroit Recovery Project for medication for opioid use disorder.)

---

## E. Outpatient treatment and recovery support

### 28. Detroit Recovery Project (DRP)
- **Plain words:** Free-feeling, peer-run help: outpatient counseling, medicine for opioid addiction, recovery coaches, help after jail, HIV and hepatitis C testing, and a mobile medical van.
- **Level:** outpatient SUD, medication for opioid use disorder (primary care and the mobile unit), peer recovery, re-entry, case management, harm reduction outreach. The page says DRP is a certified community behavioral health clinic (CCBHC).
- **Sites and phones (own page):**
  - Eastside: 1121 East McNichols Rd., Detroit, MI 48203, (313) 365-3100.
  - Westside: 1145 West Grand Blvd., Detroit, MI 48208, (313) 324-8900.
  - "24 Hours Crisis Services Line (833) DRP-HEAL" (letters).
  - Outreach fixed site at 1121 E. McNichols: 313-400-3713, "Monday thru Friday 9AM to 4PM". Mobile unit: 313-400-2258.
- **Typo on page:** "To make an appointment ... call us at: 313-824-8900". Every other place says (313) **3**24-8900. Flag it; do not use 824.
- **Check URL:** https://www.recovery4detroit.com/services/ (© 2026 in text).
- **Status:** verified-on-own-page. Walk-in hours are not stated on the own page.

### 32. Passenger Recovery Community Center (Hamtramck)
- **Plain words:** A free place run by people in recovery. You can drop in, talk to a recovery coach, and join groups. Help in many of Hamtramck's languages, and for Deaf and hard of hearing people.
- **Level:** recovery support (peer coaching, groups such as SMART Recovery). **Not licensed treatment.**
- **Walk-in (quote):** "Walk-Ins: Wednesday through Friday – 2pm – 4pm". Appointments: "Wednesday through Friday – 12pm – 2pm". Center hours: "Wednesday – Saturday: 12:00pm – 8:00pm". **The contact page instead says "open Wednesday - Sunday", which conflicts.**
- **Cost:** "FREE Service!". Languages: "Translation for most of Hamtramck's languages and dialects available, as well as Deaf/Hard of Hearing assistance."
- **Address:** 3901 Christopher Street, Suite D, Detroit/Hamtramck, MI 48211 ("Right Side Entrance"). The page itself says "Detroit/Hamtramck", so a person should confirm which city to show.
- **Phone:** 313-288-0062.
- **Check URL:** https://passengerrecovery.com/services/hamtramck-center (`/services` redirects here). © 2026.
- **Problem:** the contact page gives "the DWHIN crisis hotline: (800) 231-1127". **That is not DWIHN's number (1-800-241-4949).** Flag it; never copy.
- **Status:** verified-on-own-page. **The only walk-in option I found in Hamtramck.**

### 33. CLASS Agency (Changing Lives and Staying Sober)
- **Plain words:** Counseling for drug and alcohol problems for adults, teens, and kids.
- **Level (quote):** "licensed by the State of Michigan-LARA ... to provide Prevention, Intervention, and Substance Use Disorder (SUD) Treatment" and CARF-accredited "to provide outpatient SUD treatment for adults, teens, and children". **This is a youth option.**
- **Address:** 22000 Grand River Ave, Detroit, MI 48219. **Phone:** 313.412.2160. **Hours:** "Mon-Fri 9am-5pm Closed Sat/Sun".
- **Check URL:** https://www.class-agency.org/contacts. The footer says © 2022, but the City of Detroit Health Department's current (© 2026) Behavioral Health page lists CLASS as a community partner.
- **Status:** verified-on-own-page. A person should confirm current operations.

### 34. Centers for Family Development (formerly Black Family Development, Inc.)
- **Plain words:** Counseling at the clinic or at home for teens or adults with drug or alcohol problems, and their families.
- **Level:** "HOPE and Substance Use Disorder Outpatient & Intensive Outpatient Treatment"; also "Woman's Hope Relapse Prevention" (court-referred women).
- **Eligible (quote):** "Adults or adolescents, and their family members facing substance use disorders who live in Wayne County who have Medicaid insurance."
- **Address:** 2995 E. Grand Blvd, Detroit, MI 48202. **Phone:** 313-758-0150 (intake). A second site, the Samaritan Center at 5555 Conner Ave. Ste 1038, Detroit 48213, is 313-308-0255.
- **Check URL:** https://centersforfamilydevelopment.org/index.php/programs/mentalhealth/substance.html (modified 2025-09-29). The old blackfamilydevelopment.org URLs now redirect to the new name.
- **Status:** verified-on-own-page.

### 35. American Indian Health & Family Services (AIHFS)
- **Plain words:** A clinic, rooted in Native culture, that offers counseling for drug and alcohol problems. It also serves other people who need care.
- **Services (quote):** "Outpatient Substance Abuse Treatment and Counseling".
- **Who (quote):** "American Indian/Alaska Native individuals, families and other underserved populations in SE MI".
- **Cost (quote):** "open to persons with or without insurance ... if a person does not have insurance they must bring proof of income to qualify for the sliding fee discount".
- **Hours (Behavioral Health, as printed):** "Mon – Fri: 9am – 5pm, Except Thurs: 10:30am – 7pm".
- **Address:** 4880 Lawndale, Detroit, MI 48210. **Phone:** (313) 846-6030.
- **Check URL:** https://aihfs.org/behavioral-health-care/ (2026 uploads on site).
- **Status:** verified-on-own-page.

### 31. Central City Health
- **Plain words:** A clinic for people who live with serious mental illness and also have drug or alcohol problems.
- **Level:** co-occurring. It runs an Integrated Dual Disorder Treatment program (IDDT) and ACT, an in-home team. For MAT, the page refers people to "starcenterinc.org".
- **Cost (quote):** "No patient is ever denied care due to an inability to pay."
- **Address:** 10 Peterboro St., Detroit, MI 48201-2722. **Phone:** 313-831-3160.
- **Check URL:** https://www.centralcityhealth.com/ (the footer says © 2020).
- **Problem:** the behavioral-health page says "Substance Use Disorders (SUD) : DWIHN Helpline : 1-800-841-4949". **That number is wrong (it should be 800-241-4949).** Flag it; never copy.
- **Status:** verified-on-own-page (address + phone). SUD-only clients may be a poor fit, since the program is built for co-occurring conditions.

### 10 (again). Mariners Inn IOP: see block B (adults 18+, men and women per the IOP text, which says "adults").

---

## F. Dearborn, Hamtramck, Highland Park: what exists

**Dearborn**
- **36. ACCESS Behavioral Health.** Arabic/English mental health care: counseling, psychiatry, case management, peer support. Behavioral Health is at 6451 Schaefer Road, Dearborn, MI 48126, 313-945-8138 (check URL: https://www.accesscommunity.org/health-wellness/contact). ACCESS's own site lists **drug-use prevention, SBIRT screening, naloxone, and an "Overdose Response Team (Dearborn Police Department partnership)"** (https://www.accesscommunity.org/node/323; program line "Substance Use Advocacy Response Team (313) 614-0509"). It does **not** list a drug or alcohol treatment program; aggregators claim outpatient SUD treatment with buprenorphine. Status: **partial.** Useful as a linkage point for Arabic speakers, but not a treatment listing until a person confirms.
- **37. Arab American and Chaldean Council (ACC).** The behavioral-health page lists "SUBSTANCE ABUSE & CO-OCCURING TREATMENT" (https://myacc.org/programs-services/behavioral-health/). The own site shows only the Troy HQ (363 W. Big Beaver, (248) 559-1990). Aggregators list 13840 West Warren Avenue, Dearborn 48126. Status: **unverified.** A person must call.
- **39. Henry Ford Medical Center, Ford Road.** 5500 Auto Club Dr, Dearborn, MI 48126, (313) 425-4500. The page lists behavioral health but does not clearly list addiction care. Aggregators list a "Henry Ford Behavioral Health – Dearborn" at 5111 Auto Club Dr Ste 112, which conflicts. Check URL: https://www.henryford.com/locations/ford-road. Status: **partial.**
- Covenant Community Care, Michigan Ave (#27), says it serves Dearborn.
- **Not SUD:** Corewell Health Behavioral Health Clinic, 18200 Oakwood Blvd (opened 2025/2026; the press release dates conflict), is psychiatric only.
- **No methadone clinic, detox, or residential program in Dearborn.** Premier Services of Michigan (25639 Ford Rd., **Dearborn Heights**, 313-277-3293, SAMHSA-certified OTP) is the nearest methadone clinic. It is outside our four cities; list it only if Kyle wants "nearby" places.

**Hamtramck**
- **32. Passenger Recovery Community Center**: walk-in peer support, free, multilingual.
- Sunshine Treatment Institute (4821 E McNichols, 48212) is a methadone clinic that aggregators place in Hamtramck, but SAMHSA says Detroit and I found no own site.
- DRMM's OASIS returning-citizen housing is in Highland Park, not Hamtramck.
- **No licensed treatment program was confirmed inside Hamtramck on an own page.**

**Highland Park**
- **16. Rainbow Center of Michigan**: methadone clinic, ages 21+.
- **13. Elmhurst Naomi's Nest**: women's residential, 24/7 intake.
- New Light Recovery Center (#15, 300 W. McNichols) is on the border and is listed as Detroit 48203.
- DRMM also runs OASIS returning-citizen transitional housing at 13220 Woodward Ave, Highland Park, 313-859-5050 (housing, not treatment; drmm.org/about-us/locations/).

---

## G. Special groups (cross-reference)

- **Pregnant women and mothers with children:** Positive Images (#14), Harbor Light's Evangeline Center (#4), Elmhurst Naomi's Nest (#13, custody support), DRMM Genesis House III (#5; aggregators say postpartum and resident children), New Light women's specialty (#15). DWIHN's page mentions "Women Specialty Services" (E2). None of the own pages states "pregnant women go first" as a rule. That rule is a Michigan and federal requirement; E2 should confirm the wording before we show it.
- **Youth under 18:** CLASS Agency (#33: teens and children), Centers for Family Development (#34: adolescents with Medicaid), DWIHN's page says SUD services cover "ages 11 to 65+". **No youth detox or residential program was found in our cities.** The Adolescent Addiction Recovery Center is in Troy, outside our cities.
- **People leaving jail or prison:** Detroit Recovery Project re-entry (#28), Harbor Light MDOC programs (#4, MDOC-referred), DRMM (#5, MDOC referrals) and OASIS housing, Elmhurst corrections program (#12), SHAR (#11, "individuals under correctional supervision"). Wayne County jail MOUD exists in research and technical-assistance documents (WSU Center for Behavioral Health and Justice), but there is no public intake point; do not list it.
- **Veterans:** VA Detroit (#24).
- **Deaf / hard of hearing:** Passenger Recovery (#32). Harbor Light's Deaf program is in Monroe, outside our cities.
- **Languages:** Arabic (ACCESS #36, ACC #37); Spanish (CHASS #26); Hamtramck languages (Passenger #32).

---

## Considered and not listed

- **Sacred Heart Rehabilitation Center:** its own locations page (https://sacredheartcenter.com/contact.html) has **no Detroit site**; the nearest are Madison Heights and Richmond. The "17131 Gitre St, Detroit" women's site appears only in aggregators and is likely closed. It is outside our cities.
- **Hegira Health / Oakdale Recovery Center:** the detox and residential site is in Canton (43825 Michigan Ave), outside our cities.
- **Henry Ford Maplegrove** (West Bloomfield), Brighton, and Eastwood (Southfield): outside our cities.
- **Community Programs Inc.** and **Personal Dynamics:** no current web presence found; possibly closed or renamed. Not listed.
- **Abundant Community Recovery Services** (aggregators: 1670 Oakman Blvd): its own site returns **404** on both the home and services pages. Possibly closed. Not listed.
- **Latino Family Services** (1145 Lawndale, 313-279-3232): its own services page now lists only "Substance Abuse Referrals". It is a referral agency, not treatment.
- **Advantage Health Centers:** its own home page says only "We provide treatment for those struggling with addiction and mental health related challenges". There are no specifics; a person must check before listing it.
- **Apex Behavioral Health** (Dearborn): aggregators only; no own site checked.
- **Detroit Health Department:** no treatment. Its Behavioral Health page offers education, naloxone, SSP licensing, case management and referrals (313-938-3677). E2 covers harm reduction.
- **Corewell Health Dearborn Behavioral Health Clinic:** psychiatric only.

---

## Contradictions and stale data (for a steward)

1. Sobriety House footer: "Authorization via (Wellplace) 800-421-4949". This is a wrong number and a defunct vendor; the admissions page correctly says 1-800-241-4949.
2. Passenger Recovery contact page: "DWHIN crisis hotline: (800) 231-1127". This is a wrong number.
3. Central City Health: "DWIHN Helpline : 1-800-841-4949". This is a wrong number.
4. Detroit Recovery Project: the appointment line is printed as "313-824-8900" in one place and as (313) 324-8900 everywhere else.
5. Covenant Community Care: the Call button's href is (313)625-1336, but its id is "(313) 554-3880".
6. DRMM: Christian Guidance Center is "Men" on the services page and "All Male and Female Facility" on the locations page.
7. Passenger Recovery: the center is open "Wednesday - Sunday" on the contact page and "Wednesday – Saturday" on the services page.
8. VA: "with or without an appointment" appears next to "A referral is required".
9. Positive Images: the own site says 13336-13340 E Warren Ave, 313-822-6940; aggregators say 700 E Grand Blvd, 313-702-1301.
10. Institute of Supportive Services: SAMHSA gives ZIP 48234; aggregators give 48219.
11. Romancare: SAMHSA gives 248-218-1198; CDC NPIN and Facebook give 248-218-1199.
12. Harbor Light: its history text still routes non-Detroit women through "SEMCA", which is stale.
13. ECHO Engagement Center: "(6 beds) beginning December 4th" has no year. The only admissions line is a named staff member's direct line.
14. Team Wellness `/crisis-stabilization/` returns 404, although DWIHN still lists the Team East CSU.
15. Henry Ford Dearborn: the own page says 5500 Auto Club Dr; aggregators say 5111 Auto Club Dr Ste 112.

## Gaps and blockers

- **Sites that block scripts or need a browser (a person must check):** Metro East (https://www.metro-east.org/ is a script-only shell) and DMC (dmc.org returns 403 with a Cloudflare challenge). I did not work around either.
- **No own website:** Nardin Park, Sunshine Treatment Institute, Institute of Supportive Services, Romancare. These are 4 of the 11 methadone clinics in our cities, known only from SAMHSA's federal list. They need a phone check by a person before listing.
- **Phones our checker cannot see:** VA (in `va-telephone` attributes), Covenant (in a `tel:` href only), and NSO and DRP ("1-888-360-WELL", "(833) DRP-HEAL" in letters). The checker should either read `tel:` hrefs and attributes and translate letter numbers, or a person should confirm these.
- **Intake hours for new methadone patients are not published** by any OTP. NLRC and STAR publish clinic and dosing hours only.
- **Cost is often missing:** Harbor Light, QBH and Positive Images do not state cost or insurance on their own pages. Most say or imply "call DWIHN" (E2).
- **No published ED buprenorphine or bridge program** for patients at Henry Ford, DMC, Ascension or Corewell in our cities.
- **Dearborn and Hamtramck have no detox, residential or methadone program on any own page.** Linkage options in Dearborn (ACCESS) are prevention and mental health, not treatment.
- **Youth:** outpatient only (CLASS, Centers for Family Development). No youth detox or residential in our cities.
- **LARA license and FindTreatment.gov listing:** I did not look these up per provider; E2 owns those systems. Self-statements seen: CLASS "licensed by the State of Michigan-LARA"; SHAR "licensed by the State of Michigan"; QBH "licensed by the State of Michigan and accredited by CARF International and The Joint Commission"; Rainbow "licensed by the State of Michigan", "certified by SAMHSA"; Sobriety House, Mariners Inn, Elmhurst and DRMM mention CARF. SAMHSA OTP certification is listed above.
- **Sites showing no activity since 2024 or earlier** (footer or last-modified date): Sobriety House (2024), Mariners Inn (© 2024), Team Wellness (© 2023), CHASS (© 2023), CLASS (© 2022), Central City (© 2020). A person should call each before first publish.

## Notes for E2 (tripped over)

- Three provider pages print a wrong DWIHN number (items 1–3 above). The app should always use the signed-bundle DWIHN number, never one scraped from a provider page.
- The DWIHN crisis page (https://dwihn.org/crisis-help) lists three CSUs: 707 W. Milwaukee (adults and children), Team East at 6309 Mack (adults), and Team West at 34290 Ford Rd, Westland (adults, outside our cities). It also lists a mobile crisis line, 1-844-462-7474.
- DWIHN's SUD page: "Substance use services are available to Wayne County residents enrolled in Medicaid" (or eligible), "Serves ages 11 to 65+", 14 recovery-housing providers, and the SUD Health Home program.
- Wayne County "Well Wayne Stations": "255+ free vending machines and kiosks" for naloxone and test strips, per DWIHN's opioid page.
- The Detroit Health Department licenses syringe service programs (Behavioral Health page).
