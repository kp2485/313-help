# Convert: jobs (2026-09-19)

Input: docs/research/2026-09-19-new-help/jobs-1-public-system.md, jobs-2-community-training.md, jobs-3-specific-groups.md, jobs-4-school-ged-english.md.
Output: data/seed/incoming/2026-09-19-jobs.txt (63 lines). No code changed, pnpm not run.

Re-reads (curl, honest UA) done only to settle the word "free": Detroit at Work /locations, dccwf.org/locations, the Greening adult-training page, MiSide pre-apprenticeship, DPL /tlc and /literacy-program do NOT say free, so those rows don't either. The Project Clean Slate, DPSCD adult ed, LAHC, DHDC entrepreneurship and Per Scholas ("No-Cost") pages do say it.

## Held for a person

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"Detroit at Work career center, W. Warren (ACCESS)","Address conflict on ACCESS's own pages: 16427 W. Warren (contact page, DAW) vs 14627 W. Warren (financial-stability page)",https://www.accesscommunity.org/contact
"Detroit at Work career center, W. McNichols (MiSide)","DAW marks it REFERRALS ONLY; late night is Thursday on DAW but Wednesday on MiSide's page",https://detroitatwork.com/locations
"Detroit at Work career center, E. Seven Mile (Ross)","Not on the DAW locations page; may be closed; operator phone is aggregator-only. Call 313-962-9675 and ask",https://www.michiganworks.org/region-m
"MiSide Earn + Learn, 2835 Bagley Suite 800","Notes disagree about 2835 Bagley: DAW says its services there moved out Sept 30, 2025; MiSide's pages still list programs there",https://miside.org/miside-wealth/earn-learn
"MiSide Wealth Center for Working Families, 2835 Bagley","Same 2835 Bagley question; program page has no address or phone (taken from contact page)",https://miside.org/contact-us
"MiSide Homeless Veterans Reintegration Program","Program page has no phone or address; only door is 2835 Bagley (see above)",https://miside.org/miwealth/homeless-veterans-reintegration-program-hvrp
"SEMCA Michigan Works! Dearborn job center, 6451 Schaefer (inside ACCESS)","Two phones: 313-945-8380 (DCC and ACCESS pages) vs 313-203-3366 (Michigan Works! Association page); SEMCA's own page blocks scripts",https://dccwf.org/locations/
"Detroit Job Corps Center","Federal pause of contractor-run centers in 2025; reopening is news-only. Call before showing as enrolling",https://detroit.jobcorps.gov/
"AARP Foundation / NCBA SCSEP, 407 E. Fort St","Page names both NCBA and AARP Foundation; no AARP-owned page with the address. Confirm who answers",https://ncbainc.org/michigan-office/
"Urban League Urban Seniors Jobs Program (55+)","Phone only; no street address on the page",https://www.deturbanleague.org/usjp
"Urban League Workforce Career Development Center, 15770 James Couzens","No page has both this address and a phone; HQ line may not reach it",https://www.deturbanleague.org/wcdc
"Michigan Rehabilitation Services, Detroit and Dearborn offices","Office locator loads by script; the only address seen is aggregator-only",https://www.michigan.gov/leo/bureaus-agencies/mrs/office-locator
"Goodwill Career Academy, 3111 Grand River","Two phones: (313) 557-8612 on the program page vs 313.557.8635 on the locations page",https://www.goodwilldetroit.org/connect/find-a-location/
"Goodwill A Place of Our Own Clubhouse, 1401 Ash St","Two phones: 313.931.0901 (locations page) vs (313) 557-8623 (program page)",https://www.goodwilldetroit.org/connect/find-a-location/
"SER Metro-Detroit ReBuild Detroit (construction readiness)","sermetro.org blocks scripts; last cohort shown is Nov 10, 2025",https://sermetro.org/locations/
"SER Metro-Detroit Justice Impacted Services","sermetro.org blocks scripts; a person must read it in a browser",https://sermetro.org/program-service/justice-impacted-services/
"SER Metro-Detroit Center for Working Families and Adult Education (9301 Michigan; FREC East)","sermetro.org blocks scripts; Maddelein ZIP 48205 vs 48216 on SER's own pages",https://sermetro.org/adult-education-services/
"SER Metro-Detroit YouthBuild and Year Round Youth","sermetro.org blocks scripts; 5555 Conner printed with three ZIPs (48205, 48213, 48215)",https://sermetro.org/locations/
"Wayne Metro Growing Green / SWIFT / Career Institute (paid training)","waynemetro.org blocks scripts; SWIFT is 16 weeks and 10 weeks on the same page; no training-site address",https://www.waynemetro.org/employment/
"Ford Resource and Engagement Center East","Same Ford page prints 15941 and 15491 Maddelein",https://www.fordphilanthropy.org/ford-community-centers
"Operation ABLE of Michigan (Spectrum Human Services)","No dated content; says it will soon re-establish a group; currency unknown",https://www.spectrumhuman.org/OperationAble
"Year Up United, Detroit","No street address or phone on the page",https://www.yearup.org/locations/detroit-mi
"NPower Michigan Tech Fundamentals","Only staff phone lines printed; no class dates",https://www.npower.org/locations/michigan/
"WDI Access for All pre-apprenticeship (Highland Park)","Class site is inferred from a video title; program page lists only the Lansing office",https://miwdi.org/accessforall/
"WDI Fast Track (paid construction work)","Only a Lansing contact; no eligibility or dates",https://miwdi.org/fast-track/
"Laborers Local 1191 apprenticeship","Training page is from 2017-2020",https://laborerslocal1191.org/Training-Information
"BLAST Detroit pre-apprenticeship","Page last edited 2018; entry is by agency referral",https://blastdetroit.org/program-offering/
"Empowerment Plan paid jobs for parents in shelters","No phone on the site; hiring form closed; hires through shelter referrals",
"Cass Community Green Industries (paid jobs)","No intake path, eligibility or hours; likely Cass participants only",https://casscommunity.org/services/vocational/
"Jefferson East Connected Learning Center","Hours differ between the contact page and the program page",https://www.jeffersoneast.org/contact
"Detroit Training Center","For-profit school; prices of $3,000 and $6,000 shown",https://detroittraining.com/
"TechTown small business programs","For business owners; Retail Boot Camp takes a $199 deposit",https://techtowndetroit.org/what-we-do/small-business-programs/
"Grand Circus","Site blocks scripts; may not be offering public bootcamps (snippet only)",
"Capuchin Earthworks Agriculture Training","Site shows a Cloudflare challenge; not verified",https://www.cskdetroit.org/
"Center for Employment Opportunities (CEO) Detroit","Site blocks scripts; facts only from a search snippet; likely parole/probation referral only",https://www.ceoworks.org/locations/detroit
"Detroit Justice Center legal services","Takes legal clients only from referral partners; old address still in search results",https://detroitjustice.org/legal-services/
"Central City Integrated Health supported employment (IPS)","For CCH clients only",https://www.centralcityhealth.com/services/services/EMPLOYMENT-SERVICES
"MiSide Supported Employment (IPS)","For MiSide counseling clients; no phone or address on the program page",https://miside.org/mihealth/supported-employment
"Disability Network Wayne County Detroit job readiness","Page copied from another center (Capital Area); copyright 2022; confirm services",https://disabilitynetworkwcd.org/employment-job-readiness-services/
"VA Detroit Compensated Work Therapy","Page says a referral is required; phone only in HTML attributes",https://www.va.gov/detroit-health-care/locations/john-d-dingell-department-of-veterans-affairs-medical-center/
"Samaritas refugee employment (8131 E. Jefferson)","2025 federal refugee cuts; employment line is a 248 number. Confirm Detroit services run",https://samaritas.org/new-americans/employment-education/
"Global Detroit Skilled Immigrant Integration Program","No phone; contact form only",https://michiganglobaltalent.org/programs/
"Volunteers of America Michigan veteran employment (HVRP)","No Detroit address; counties served not stated",https://www.voami.org/services/veteran-services/
"Developing K.I.D.S. youth workforce program","No phone on the site",https://www.developingkids.org/wfd
"Detroit Phoenix Center internships","Content from 2021-2023; homepage has Covenant House text; suite was Detroit Justice Center's",https://www.detroitphoenixcenter.org/education
"DHDC youth career pathways","Cost not stated for career pathways; after-school program has a $50 fee",https://www.dhdc1.org/programs/youth-development/
"Alternatives For Girls workforce development","For AFG clients; footer 2024",https://alternativesforgirls.org/programs/workforce-development/
"International Institute ESL classes","Page last updated April 2023; no current sessions",https://www.iimd.org/education-and-training-classes/esl
"International Institute CNA training","Page updated April 2023",https://www.iimd.org/education-and-training-classes/certified-nursing-assistant
"DPSCD adult English classes at Priest Elementary-Middle","State locator gives a different phone (313-457-2537); no class times",https://www.detroitk12.org/enroll/adult-education
"DPSCD adult English classes at Northern High School","State locator gives a different phone (313-872-0863); no class times",https://www.detroitk12.org/enroll/adult-education
"WCCCD adult education, Little Rock site","8801 Woodward on the web page vs 9000 Woodward in the Fall 2026 PDF",https://www.wcccd.edu/adult-education
"WCCCD Regional Training Center (CDL, trades)","No cohort dates; cost depends on grants; the page lacks a street number",https://www.wcccd.edu/locations/eastern-campus/regional-training-center
"Hamtramck Public Library English classes","Library's own page does not mention ESL (state locator only)",https://hamtramck.lib.mi.us/
"La Casa Guadalupana GED in Spanish and ESL","No phone or street address on its own site",https://lcgdetroit.org/
"ACCESS Adult and Family Learning ESL","No address or class times on the page",https://www.accesscommunity.org/education/adult-programs
"WSU Another Chance GED prep","Only the department office address; no class times or cost",https://clas.wayne.edu/afamstudies/programs/anotherchance
"St. Vincent and Sarah Fisher Center adult GED","Site blocks scripts; facts only from snippets",https://svsfcenter.org/programs/adult-education/
"Detroit Literacy Coalition","Site blocks scripts; address only from aggregators",https://detroitliteracy.org/
"Wayne Metro LEAPS adult education","Site blocks scripts; facts only from snippets",https://www.waynemetro.org/leaps/
"Alpha Technical Institute HiSET test site","For-profit; page does not mention HiSET; 4114 vs 5401 Schaefer",https://www.alphatechschool.com/testing-center-page/
"DPL Cisco IT study group and branch computer and resume classes","Summer catalog sessions end Sept 23-30, 2026; wait for the Fall catalog",https://detroitpubliclibrary.org/tta-catalog
"Wayne County Veterans Services job referrals","waynecountymi.gov blocks scripts; facts aggregator-only",
```

Not carried at all (not a public door, out of area, closed, or fee-based): DRMM job training and Covenant House / COTS / Pope Francis Bridge Housing job help (residents only); MDOC Reentry Services, MiCRI, Goodwill Safer Communities Stronger Families (referral only); Operation Get Down (closed 2025); Build Institute (paused end of 2025); We Want Green Too (grant ended); union training centers in Warren, Troy and Wixom (IBEW/EITC, Pipefitters, Iron Workers, Sheet Metal, Bricklayers; Plumbers is a link-out below); Gesher, JustUsNow, Dress for Success (outside the 4 cities); HFC English Language Institute ($350-$700 a class) and HFC Workforce courses; WCCCD Continuing Ed ($15 senior computer classes; could be added later); DPSCD career-technical centers (grades 10-12 only); Reading Works (domain parked); Detroit at Work flex pop-up sites (dated events, better for an events feed; one is printed with the wrong address, "Chandler Park Branch 5201 Woodward").

## Link-outs

| need | title | body | label | url | checked |
|---|---|---|---|---|---|
| jobs | Sign up with Detroit at Work | Detroit's job and training help. Sign up online or call, then meet a career coach. | Sign up at Detroit at Work | https://detroitatwork.com/ | 2026-09-19 |
| jobs | Job training paid for by Detroit at Work | Training in health care, IT, trucking, building trades and factory work for Detroiters who qualify. Programs change, so call first. | See training | https://detroitatwork.com/training | 2026-09-19 |
| jobs | Detroit at Work job fairs | Upcoming hiring events at Detroit at Work centers. | See job fairs | https://detroitatwork.com/events/jobfairs | 2026-09-19 |
| jobs | Jobs and school help for ages 14-24 | For Detroiters 14 to 24. Some programs accept Highland Park and Hamtramck residents too. | See youth programs | https://detroitatwork.com/youth | 2026-09-19 |
| jobs | YouthBuild: paid building-trades training | Paid pre-apprenticeship with GED help for ages 17 to 24 from Detroit, Highland Park or Hamtramck. Apply through MiSide or SER. | Read about YouthBuild | https://detroitatwork.com/youthbuild | 2026-09-19 |
| jobs | Summer jobs for Detroit youth (GDYT) | Paid summer jobs for Detroiters ages 14 to 24. The 2026 application closed May 15; check back in spring. | See Grow Detroit's Young Talent | https://gdyt.org/ | 2026-09-19 |
| jobs | Job help after state prison | Training, paid internships and bus help for people home from state prison in the last 5 months. Call 313-922-2232. | Read more | https://detroitatwork.com/help | 2026-09-19 |
| jobs | Job help if you get food assistance | Job search help, training, and help with clothes, tools and rides for people 18 to 59 on food assistance who don't get cash help. | Read more | https://detroitatwork.com/food-assistance-employment-and-training | 2026-09-19 |
| jobs | T.R.A.D.E. Connect: path into the Carpenters union | Job readiness, a 4-week pre-apprenticeship, then a paid 4-month apprenticeship with the Carpenters union. | Fill out the interest form | https://detroitatwork.com/detroit-at-work-trade-connect | 2026-09-19 |
| jobs | Construction Fast Track | Connects Detroiters to construction jobs on City projects. Call center 313-962-9675, Mon-Thu 8:30am-4:30pm. | Read about Fast Track | https://detroitatwork.com/fast-track | 2026-09-19 |
| jobs, jobs-lost | Michigan's job board (MiTalent) | Search jobs and post a résumé. People on unemployment must make a profile here. | Go to MiTalent | https://www.mitalent.org/ | 2026-09-19 |
| jobs | Find your Michigan Works! office | Every Michigan Works! office in the state. Call 800-285-9675. | Find an office | https://www.michiganworks.org/michigan-works-network | 2026-09-19 |
| jobs | Job help for people with disabilities (MRS) | State help to get ready for, find and keep a job. Apply online or call 800-605-6722. | Apply to MRS | https://www.michigan.gov/leo/bureaus-agencies/mrs | 2026-09-19 |
| jobs | Job help for veterans | Veterans and eligible spouses are served first at Michigan Works! offices. Tell the staff you are a veteran. | Read more | https://www.michigan.gov/leo/bureaus-agencies/wd/veterans | 2026-09-19 |
| jobs | Paid job training for ages 55+ (Urban League) | Paid job training for people 55 and older with low income in Wayne or Oakland County. Call 313-831-5591. | Read more | https://www.deturbanleague.org/usjp | 2026-09-19 |
| jobs | Plumbers apprenticeship: applications open | Paid 5-year plumbing apprenticeship. Applications close Dec 18, 2026, or when 200 people apply. | See how to apply | https://www.plumbers98tc.org/apprenticeship | 2026-09-19 |
| jobs-lost | File for unemployment | File and manage your claim online in MiWAM, or call 866-500-0017 (TTY 866-366-0004). | Go to UIA | https://www.michigan.gov/leo/bureaus-agencies/uia | 2026-09-19 |
| jobs-lost | Book an unemployment office visit | Make an appointment at an unemployment office, up to 14 days ahead. | Book a visit | https://www.michigan.gov/leo/bureaus-agencies/uia/schedule-an-appointment | 2026-09-19 |
| jobs-lost | Unemployment: the Register to Work rule | Make a MiTalent profile and meet Michigan Works! staff at least one business day before your first certification. | Read the rule | https://www.michigan.gov/leo/bureaus-agencies/uia/uia-resources-for-claimants/finding-employment-work-search/register-to-work-requirement | 2026-09-19 |
| school | Free GED classes through Detroit at Work | Free classes with DPSCD and others, in person or online, day or evening. The stipend is closed right now. | Sign up for classes | https://detroitatwork.com/adult-education-gedhigh-school-completion | 2026-09-19 |
| school | Sign up for DPSCD adult classes | Free adult classes for the GED, high school diploma, reading, math and English. | Sign up with DPSCD | https://www.detroitk12.org/enroll/adult-education | 2026-09-19 |
| school | GED and HiSET tests in Michigan | Michigan accepts GED and HiSET. Test fees are listed here, plus a voucher that may pay for one try per subject if funding allows. | See test costs | https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/hse | 2026-09-19 |
| school | Book the GED test | Sign up for the GED test at a center or online from home. | Go to GED.com | https://ged.com/ | 2026-09-19 |
| school | Book the HiSET test | Sign up for the HiSET test, in English or Spanish. | Go to HiSET | https://hiset.org/michigan/ | 2026-09-19 |
| school | Find adult classes near you | The State of Michigan's map of adult education classes. | Open the map | https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/adult-education/adult-education-service-locator | 2026-09-19 |
| school | Free community college at 21+ (Reconnect) | Free tuition at your local community college if you are 21+, lived in Michigan a year, have a diploma or GED, and no college degree. | Read about Reconnect | https://www.michigan.gov/reconnect/about | 2026-09-19 |
| school | College money for 2023+ grads | Michigan Achievement Scholarship, for people who finished high school or a GED in 2023 or later. | Read more | https://www.michigan.gov/mistudentaid/programs/michigan-achievement-scholarship | 2026-09-19 |
| school | Detroit Promise scholarship | College tuition for Detroit residents who graduated from a Detroit high school. The application reopens in November 2026. | Read about Detroit Promise | https://www.detroitpromise.com/ | 2026-09-19 |
| legal | Free record clearing for Detroiters | Project Clean Slate gives free legal help to Detroit residents who want old convictions cleared. Register online or call 313-237-3024. | Register with Project Clean Slate | https://detroitmi.gov/government/mayors-office/mayors-initiatives-and-programs/project-clean-slate | 2026-09-19 |
| legal | Free record-clearing clinic (Wayne County) | Lakeshore Legal Aid clinic, next on Nov 6, 2026, 10am-1pm. You must sign up first; they send the place a week before. Call 888-783-8190. | Sign up for a clinic | https://lakeshorelegalaid.org/expungement/ | 2026-09-19 |
| phone | Free computer classes and a free device | Digital Skills Detroit learning circles. Finish 15 hours of training and you can get a free device. Open to Detroit residents. | Find a class | https://digital-detroit.p2pu.org/ | 2026-09-19 |

Notes: the GDYT and Detroit Promise link-outs say the window is closed; re-date them in spring 2027 / Nov 2026. YouthBuild eligibility on DAW (17-24; DET/HP/HAM) differs from MiSide's own rule (18-24, Detroit only); the MiSide line uses MiSide's. The Lakeshore link-out may duplicate the legal batch (which also found Lakeshore); keep one. Michigan Clean Slate (MSP) is left to the legal batch.

## Hotlines

| label | number | text/TTY | owner page | screen |
|---|---|---|---|---|
| Detroit at Work call center (313-962-WORK) | 313-962-9675 | TTY 711; accessibility line 800-285-9675 | https://detroitatwork.com/ | jobs (Detroit) |
| Michigan Works! (outside Detroit) | 800-285-9675 | | https://www.michiganworks.org/michigan-works-network | jobs (Dearborn, Hamtramck, Highland Park) |
| Unemployment (UIA), Mon-Fri 8am-4:30pm | 866-500-0017 | TTY 866-366-0004 | https://www.michigan.gov/leo/bureaus-agencies/uia | jobs-lost |
| Michigan Veterans Affairs (1-800-MICH-VET), Mon-Fri 8am-4:50pm | 800-642-4838 | | https://www.michigan.gov/mvaa | jobs (veterans) |
| VA benefits, Mon-Fri 8am-9pm | 800-827-1000 | TTY 711 | https://www.va.gov/detroit-va-regional-benefit-office/ | jobs (veterans) |

## Updates to existing rows

| sal_id | change | source |
|---|---|---|
| sal_pope_francis_day_center | Day Center page also lists help with "employment opportunities" through partners; "Service Hours: Mon-Sat, 7-11am". Consider adding job referrals to `what` (check the hours against the row's schedule). | https://popefranciscenter.org/ |
| sal_dwihn_care_center | Not a jobs fact, found in passing: DWIHN's homepage now prints 8726 Woodward Ave for the Access Center (older documents say 707 W. Milwaukee). A person should confirm the Care Center row's address is still right, on DWIHN's own page. | https://dwihn.org/ |

Also for the legal batch: Legal Aid and Defender Association (7650 Second Ave, Ste 120; 313-967-5800) offers "Criminal Record Expungement and License Restoration" (https://ladadetroit.org/services/). This batch leaves it out so there is only one LAD row; that row should mention record clearing and carry `flags=reentry`.

## Counts

- Lines written: 63 (jobs.find 21, jobs.training 11, learn.school 12, learn.english 17, legal 1, money.benefits 1)
- Held for a person: 63
- Link-outs: 31
- Hotlines: 5
- Updates to existing rows: 2 (plus 1 note for the legal batch)
