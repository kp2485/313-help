# Convert: treatment (2026-09-19)

Incoming file: `data/seed/incoming/2026-09-19-treatment.txt` (14 lines).
Notes used: `docs/research/2026-09-19-new-help/treatment-1-places.md`, `treatment-2-system-and-data.md`.
Cross-checks only (not sources of any fact on a line): SAMHSA OTP CSV, DWIHN provider-directory CSV ("Last Updated 04/06/2026", `scratchpad/dwihn_provider_directory.csv`). Two quick owner-page re-reads on 2026-09-19: qbhrecovery.org/locations (the two 313-922 numbers are unlabeled; 855-838-4222 is "24/7 central intake") and recovery4detroit.com/services (outreach and naloxone named; syringes not named).

## Held for a person

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"Team Wellness Center East crisis unit, 6309 Mack","Phone mismatch: 313-331-3435 on DWIHN's crisis page and Team's home page, 313-969-5387 in DWIHN's CSU PDF. Team's own crisis-unit page is 404; confirm the unit is still at Team East",https://dwihn.org/crisis-help
"ECHO Detroit Engagement Center (sobering, 6 beds)","Only admissions number printed is a staff member's direct line; page never says the beds are at 1851 W Grand Blvd; ""beginning December 4th"" has no year. Ask ECHO for a general admissions line",https://www.echodetroit.org/services/engagement-center/
"DRMM Christian Guidance Center and Genesis House III, 19211 Anglin","Christian Guidance Center is ""Men"" on the services page and ""All Male and Female Facility"" on the locations page. DWIHN's 2026 list shows it at 19211 Anglin with 313-893-9747 and a second site at 91 Glendale, Highland Park, with 313-263-0077",https://drmm.org/about-us/locations/
"Positive Images women's residential, 13336-13340 E Warren","Own site says 13336-13340 E Warren Ave and 313-822-6940; aggregators and DWIHN's 2026 list also show 700 E Grand Blvd (and list the sites under SHAR). Call to confirm address, phone and how to get in",https://www.positiveimageinc.org/
"S.T.A.R. Center methadone clinic","No street address on its own site (phone 313-493-4410 only). SAMHSA and DWIHN list 13575 Lesure St, Detroit 48227",https://starcenterinc.org/
"Wayne Health Tolan Park Methadone Clinic, 3901 Chrysler Dr","Own page shows only the system-wide scheduling line 877-929-6342; SAMHSA's clinic line 313-993-3964 is not on the own page; intake hours not published",https://www.waynehealthcares.org/locations/tolan-park-research-clinic-methadone-clinic-2/
"Metro East Drug Treatment (methadone), 13929 Harper Ave","Known only from SAMHSA's OTP list; own site is a script-only shell, needs a browser. DWIHN's 2026 list shows Mariners Inn at this address with the same phone, 313-371-0055, which conflicts",https://www.metro-east.org/
"Nardin Park Recovery Center (methadone), 9605 Grand River Ave","Known only from SAMHSA's OTP list; no own website found. Hold until a person calls 313-834-5930",https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory
"Sunshine Treatment Institute (methadone), 4821 E McNichols Rd","Known only from SAMHSA's OTP list; no own website found. SAMHSA says Detroit, aggregators say Hamtramck (ZIP 48212 spans both)",https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory
"Institute of Supportive Services (methadone), 19940 Conant St","Known only from SAMHSA's OTP list; no own website found. ZIP 48234 on SAMHSA, 48219 on aggregators",https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory
"Romancare Health Services (methadone), 9600 Dexter Ave","Provisional certification on SAMHSA's OTP list; Facebook only, no own website. Phone 248-218-1198 (SAMHSA) vs 248-218-1199 (CDC NPIN, Facebook)",https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory
"VA Detroit substance use care, John D. Dingell VA Medical Center","Veterans only. Phone appears only in page attributes, not as text; page says ""with or without an appointment"" and ""A referral is required""",https://www.va.gov/detroit-health-care/locations/john-d-dingell-department-of-veterans-affairs-medical-center/
"Team Wellness Center Suboxone clinic","Own page does not say which of its three Detroit sites (2925 Russell, 6309 Mack, 11105 E Jefferson) runs the Suboxone clinic",https://teamwellnesscenter.com/suboxone/
"Covenant Community Care substance use treatment, 5716 Michigan Ave","Recovery scheduling phone is only in a tel: link (313-625-1336) and the same element's id says 313-554-3880. Place is already listed as sal_covenant_care_michigan_ave",https://www.covenantcommunitycare.org/health-services/substance-use-treatment-counselor-in-detroit
"Detroit Recovery Project, Westside, 1145 W Grand Blvd","Appointment line printed once as 313-824-8900 and elsewhere as (313) 324-8900 (DWIHN's 2026 list agrees with 324-8900). Confirm, then add as a line; never use 824",https://www.recovery4detroit.com/services/
"Henry Ford Behavioral Health, One Ford Place (addiction medicine)","Insurance-based; no low-cost or Medicaid wording on the page. Medicine for opioid use disorder at this site is inferred from a system page, not stated on the location page",https://www.henryford.com/locations/1-ford-place
"NSO 360 Neighborhood Wellness Centers (3 sites)","Substance use treatment named only in a list with ""most major insurance plans accepted""; no description of the program; one vanity line (1-888-360-WELL) for three sites",https://www.nso-mi.org/360-neighborhood-wellness-centers.html
"Central City Health, 10 Peterboro St","Site footer (c) 2020; DWIHN's 2026 list shows Central City Integrated Health at 1240 Third Ave instead. Page prints a wrong DWIHN number (see warning). Program is for serious mental illness plus substance use",https://www.centralcityhealth.com/
"Passenger Recovery Community Center, 3901 Christopher St","Free walk-in recovery coaching (Wed-Fri 2-4pm per services page), but center hours conflict (Wed-Sat on services page, Wed-Sun on contact page) and the page says ""Detroit/Hamtramck"" (ZIP 48211). Only walk-in option found in Hamtramck: one call settles it. Contact page prints a wrong DWIHN number",https://passengerrecovery.com/services/hamtramck-center
"Centers for Family Development, Samaritan Center, 5555 Conner Ave Ste 1038","Own page gives this second site and 313-308-0255 but does not say the substance use program runs there",https://centersforfamilydevelopment.org/index.php/programs/mentalhealth/substance.html
"ACCESS Behavioral Health, 6451 Schaefer Rd, Dearborn","Own site lists drug-use prevention, screening, naloxone and an overdose response team, but no drug or alcohol treatment program; only aggregators claim outpatient treatment",https://www.accesscommunity.org/node/323
"Arab American and Chaldean Council substance use treatment, Dearborn","Own site shows only the Troy headquarters; the Dearborn address (13840 W Warren) comes only from aggregators",https://myacc.org/programs-services/behavioral-health/
"DMC Detroit Receiving Hospital peer recovery coaches","Only a news item (MHA, 2026-09-14); dmc.org blocks scripts (Cloudflare). A person must check in a browser",https://www.dmc.org/
"Henry Ford Medical Center, Ford Road, Dearborn (behavioral health)","Addiction care not listed on the page; aggregators give a different address (5111 Auto Club Dr Ste 112 vs 5500 Auto Club Dr)",https://www.henryford.com/locations/ford-road
"CHAG syringe services, 1300 W Fort St","Own page names Narcan and mobile outreach but not syringe services; hours differ between the MDHHS PDF (Tue/Thu/Fri 9-3) and MDHHS map (Mon-Thu 9-4:30, Fri 9-3)",https://www.chagdetroit.org/our-services
"Detroit Recovery Project syringe services, 1121 E McNichols","Own page names outreach (Mon-Fri 9am-4pm, 313-400-3713) and naloxone but not syringes; the MDHHS PDF lists different hours",https://www.recovery4detroit.com/services/
"ECHO Detroit mobile syringe services","Mobile only, ""call for outreach times""; own page gives no schedule or public line",https://www.echodetroit.org/
"Safe Point mobile syringe services (Team Wellness Center)","On the MDHHS list (313-577-8385) but the schedule and program are not in the owner's page text",https://teamwellnesscenter.com/
"CHASS syringe services, 5635 W Fort St","On the MDHHS list (""call for times"") but syringe services are not named on CHASS's own page",https://www.chasscenter.org/
"UNIFIED (HIV Health and Beyond) Detroit office, 3968 Mt. Elliott","Website miunified.org shows a domain-parking page; a person must check the program still runs",https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/syringe-service-programs/find-a-syringe-service-program-near-me
```

### Warning: wrong DWIHN numbers printed on provider pages (never use them)

DWIHN's own pages give the access and crisis line as **800-241-4949** everywhere (E2 checked every `tel:` link on six dwihn.org pages). These provider pages print a different number. Never copy them into any row, label or hotline. A steward may tell each owner.

| Provider page | What it prints | Where |
|---|---|---|
| Sobriety House (https://www.sobrietyhouse.net/) | "Authorization via (Wellplace) 800-421-4949" (Wellplace was DWIHN's former vendor) | footer of every page. Its admissions page gives the right number. |
| Passenger Recovery (https://passengerrecovery.com/, contact page) | "DWHIN crisis hotline: (800) 231-1127" | contact page |
| Central City Health (https://www.centralcityhealth.com/, behavioral-health page) | "DWIHN Helpline : 1-800-841-4949" | behavioral-health page |

Related: Detroit Recovery Project prints its own appointment line once as 313-824-8900 (typo for 324-8900). Salvation Army Harbor Light's history text still routes some women through "SEMCA" (stale).

## Link-outs

Need for all: **drugs**. Checked 2026-09-19.

| title | body | label | url |
|---|---|---|---|
| Find a treatment place near you | The federal list of drug and alcohol treatment places. Each place on it is approved by the state. | Search FindTreatment.gov | https://findtreatment.gov/ |
| Michigan's drug and alcohol help page | Ways to find treatment, syringe service programs and recovery homes in Michigan. For a crisis, call or text 988. | Open Michigan's page | https://www.michigan.gov/opioids/find-help |
| Michigan's treatment map | The State's map of drug and alcohol treatment places. | Open the map | https://www.michigan.gov/opioids/find-help/misud-locator |
| Recovery homes certified in Michigan | MARR's list of recovery homes it has certified. The homes send in their own details, so call and check before you go. | See MARR's list | https://michiganarr.com/full-rr-operator-list-1 |
| Find a syringe service program | Michigan's map and list of syringe service programs. Times and places can change. | See the map | https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/syringe-service-programs/find-a-syringe-service-program-near-me |
| AA meetings in Detroit and Wayne County | Meeting lists and a 24-hour phone line from the Detroit and Wayne County AA office. | Find AA meetings | https://waynecountyintergroup.org/ |
| NA meetings in Metro Detroit | Narcotics Anonymous meeting lists and a 24/7 helpline for Metro Detroit. | Find NA meetings | https://michigan-na.org/metro-detroit-region/ |
| Meetings for family and friends | Al-Anon and Alateen meetings for people who love someone who drinks. | Find Al-Anon meetings | https://al-anon.org/al-anon-meetings/find-an-al-anon-meeting/ |
| SMART Recovery meetings | Find SMART Recovery meetings in person or online. | Find SMART meetings | https://meetings.smartrecovery.org/meetings/ |

Notes: the michigan.gov link to MARR (`michiganarr.com/full-operator-list`) is 404; use the URL above. Nar-Anon's finder blocks scripts (403), so it is not included until a person checks it. Do not copy any meeting list or any MARR contact; link only. Stay Well ended in 2023; do not link it.

## Hotlines

| Label | Number | Text / TTY | Owner page | Screen |
|---|---|---|---|---|
| DWIHN ACCESS: drug or alcohol treatment (Wayne County) | 800-241-4949 | TTY 711; English, Spanish, Arabic | https://dwihn.org/programs-services/substance-use-help | drugs (first). **Already emg_dwihn_crisis** ("Local mental health crisis line"). Kyle decides: second label or relabel; not a new number. |
| SAMHSA National Helpline | 1-800-662-4357 | TTY 1-800-487-4889; text your ZIP to 435748 (English only) | https://www.samhsa.gov/find-help/helplines/national-helpline | drugs |
| DWIHN Mobile Crisis Team | 1-844-462-7474 | none | https://dwihn.org/crisis-help | drugs / mental health crisis |
| AA Detroit and Wayne County, 24-hour line | 313-831-5550 | none | https://waynecountyintergroup.org/ | drugs (recovery meetings) |
| NA Metro Detroit helpline | 248-543-7200 | none | https://michigan-na.org/metro-detroit-region/helpline/ | drugs (recovery meetings) |
| Michigan Tobacco Quitlink | 1-800-784-8669 (printed 1-800-QUIT-NOW); Spanish 1-855-335-3569 | none | https://www.michigan.gov/mdhhs/keep-mi-healthy/chronicdiseases/tobacco/how-to-quit-tobacco | drugs (quit smoking) |
| Michigan Problem Gambling Helpline | 1-800-270-7117 | none | https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/gambling | drugs (gambling). MDHHS's county page shows "1-800-GAMBLER" instead; use the program page and flag the other. |

988 and 911 are hardcoded. The DWIHN Care Center (313-989-9444) is already a listing (see Updates).

## Updates to existing rows

| sal_id | Change | Source |
|---|---|---|
| sal_dwihn_care_center | Also show on the treatment crisis screen: DWIHN says crisis services cover "a mental health or substance use emergency". Say plainly it is not a detox. June 10, 2026 news: 32 beds and a Behavioral Health Urgent Care. | https://dwihn.org/crisis-help ; https://dwihn.org/news/dwihn-crisis-care-center-marks-second-anniversary-increased-capacity-and-improved-care |
| sal_dwihn_crisis_line (and emg_dwihn_crisis) | Same number is DWIHN's front door for drug and alcohol treatment; answers in English, Spanish and Arabic; TTY 711. Consider showing it on the treatment screen too. | https://dwihn.org/programs-services/substance-use-help |
| sal_chass_southwest | Add a treatment.meds service at this place: medicine for opioid use disorder and peer recovery support, in English and Spanish; sliding fee for people without coverage. | https://chasscenter.org/wellness/list/behavioral_health |
| sal_american_indian_medical_clinic | Add a treatment.outpatient service: outpatient substance use treatment and counseling; Behavioral Health hours Mon-Fri 9am-5pm, Thu 10:30am-7pm; open with or without insurance (sliding fee with proof of income). | https://aihfs.org/behavioral-health-care/ |
| sal_covenant_care_michigan_ave | Substance use treatment (Suboxone, Sublocade, counseling) is offered here Mon-Fri 9am-5pm; page says it serves southwest Detroit and Dearborn. Hold the service until the scheduling phone conflict is fixed (see Held). | https://www.covenantcommunitycare.org/health-services/substance-use-treatment-counselor-in-detroit |

## Counts

- Lines written: **14** (detox 2, residential 5, outpatient 4, meds 3; Highland Park 2, Detroit 12). harm.supplies 0, treatment.crisis 0, treatment.recovery 0.
- Held: **30** (24 treatment, 6 syringe services), plus 3 wrong-DWIHN-number warnings.
- Link-outs: **9**. Hotlines: **7**. Updates: **5**.
