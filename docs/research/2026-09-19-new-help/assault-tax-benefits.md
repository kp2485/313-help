# Lane H: help after sexual assault, free tax help, help signing up for benefits

Research date: 2026-09-19. Everything below was read with `curl -A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'` unless the row says otherwise. Raw pages are saved in `scratchpad/laneH/`.

**Status key**
- **verified**: the owner's own page shows the fact.
- **partial**: some fields are verified and others are missing or disagree.
- **unverified**: we found it only through an aggregator, a news story or a third party, or the owner's page blocks scripts.

**Checker URL** is the one page where the phone number and the street address both appear as plain text. If no such page exists, the row says so.

No staff names, staff emails or direct lines are recorded here. Several owner pages print them, and we left them out on purpose.

---

## H1. Help after sexual assault (sensitive screen: 911 and hotline first, no map, quick exit)

### Overview

- **One program covers our whole area.** Avalon Healing Center used to be called the Wayne County SAFE Program (Sexual Assault Forensic Examiner Program). It is the only sexual-assault exam and advocacy program for all of Wayne County. It is free, open 24/7 and serves all ages and genders. A survivor does not have to report to police.
- **Avalon asks survivors to call first: 313-474-SAFE.** Its medical team then says whether to go to the nearest emergency room or to one of Avalon's clinic sites. Avalon names its sites: DMC Sinai-Grace Hospital, DMC Detroit Receiving Hospital, Children's Hospital of Michigan, Henry Ford St. John Hospital, Kids-TALK CAC, Avalon Taylor Site and Avalon Wellness Clinic. It **does not publish street addresses for the sites.** It publishes only its headquarters address.
  - Recommendation: show Avalon as a **call-first hotline**, not as a list of hospital places. Do not list the exam sites with addresses or map dots.
- **No hospital in our four cities publishes its own SANE page** that we could find.
  - dmc.org returns 403 to scripts.
  - The Corewell Health Dearborn Hospital Emergency page never mentions sexual assault.
  - A news story says every emergency department in Wayne County refers to Avalon. That is a news claim only.
- **The state guarantees the exam is free and needs no police report.** MDHHS "SAFE Response" says: "if you are a victim of sexual assault, you can get a forensic exam without being billed for it. A hospital, doctor or nurse cannot require a sexual assault victim to talk to the police in order to get a medical forensic examination." (michigan.gov/mdhhs … /resources-for-professionals/safe). This line is worth putting on the screen.
- **Guidance for directories** (NNEDV Safety Net, techsafety.org):
  - Offer a Quick Exit that goes to a neutral site. Our app already does this.
  - Warn that clearing history does not beat spyware or stalkerware.
  - Avoid third-party widgets, maps and embeds, because they leak the visit.
  - Collect no PII and no IPs.
  - Do not re-publish confidential shelter locations. Directories and "service provider websites that list resources" are named as a way those addresses leak.
  - The VOICES4 and MCEDSV pages both tell survivors to clear history and delete texts after contact.
  - This matches docs/08. It also argues for **no Save, no map and no Directions button** on these listings, even when an address is public.

### Hotlines (show first, after 911)

| # | Org / line | What it offers (plain words) | Cost / who | Phone exactly as printed (use) | Hours | Cities | Page read (status) | Checker URL | Status / notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **MDHHS / MCEDSV – VOICES4 Hotline** (Michigan's statewide line for sexual assault, DV and trafficking) | Talk, text or chat with a trained advocate. You don't have to give your name. They can connect you to local help. | Free, confidential, anonymous; anyone in Michigan, "4 hours ago or 40 years ago" | "1-855-864-2374" (michigan.gov); "855-VOICES4" and "855-864-2374" call or text (mcedsv.org); TTY "517-381-8470" | "24/7/365" | all 4 | michigan.gov/voices4 (200); mcedsv.org/hotline/ (200) | n/a (hotline; no address) | **verified.** **Disagreement:** the MDHHS Wayne County victim-services directory lists the text line as "866-238-1454". Both owner pages (michigan.gov/voices4 and mcedsv.org) say to text 855-864-2374, so use that. MCEDSV admin line (517) 347-7000 is not for survivors. |
| 2 | **Avalon Healing Center – 24-hour crisis line** (formerly Wayne County SAFE) | Call right after an assault, or any time later. A nurse and an advocate help you decide on an exam and meet you at a clinic, usually within an hour. Press 1 for the medical team or 2 for an advocate. | Free; all ages and genders; "despite where they live or where they were assaulted" | "313-474-SAFE" (tel 313-474-7233) | "staffed 24 hours a day, 7 days a week" | all 4 (Wayne County) | avalonhealing.org/ (200) | https://avalonhealing.org/ (crisis number and "601 Bagley St. Detroit, MI 48226" both on the page) | **verified.** **Bug on the owner's page:** avalonhealing.org/contact/ shows "313-474-SAFE" but its tel link dials +1 313-**475**-7233. Tell Avalon, and do not copy that link. Exam criteria for adults: within 120 hours, can consent, medically stable. After 120 hours, call the main line. |
| 3 | **RAINN – National Sexual Assault Hotline** | Talk or chat with someone any time. | Free | "800-656-HOPE" / "1-800-656-HOPE (4673)" (as printed on Avalon, SASHA Center, CHASS and DPD pages) | 24/7 (per third parties) | all | rainn.org: **403 Cloudflare block ("Sorry, you have been blocked")** for curl and WebFetch | n/a | **unverified on its own page: blocks scripts / needs a browser; a person must check.** The number agrees on 4 local owner pages. |
| 4 | **First Step (Western Wayne County Project on Domestic Assault)** | 24-hour help line for sexual assault and DV. Counseling and advocacy. They may send an advocate to go with you to the hospital. | Free, confidential | "(734) 722-6800" ("24-HOUR HELP LINE") | 24 hours | Wayne County; the page does **not** say whether it serves Detroit, Hamtramck, Highland Park or Dearborn. Its offices are in Plymouth, Wayne and Lincoln Park. | firststep-mi.org (200); /get-help/if-youve-been-sexually-assaulted/ (200) | n/a for our cities (offices are outside them) | **partial.** Its service area is not stated. The name says "Western Wayne". Treat it as a backup line, mainly for Dearborn, until a person asks. |
| 5 | **Detroit Police Victim's Assistance Program** | Free counseling for people who were sexually assaulted, one-on-one or in groups. Staff respond to assaults reported to DPD Sex Crimes and at Detroit Receiving Hospital. Help with victim-compensation claims. | Free, confidential | "(313) 833-1660" | "24 hours, 7 days a week" | Detroit | detroitmi.gov (200) | https://detroitmi.gov/departments/police-department/victims-assistance ("4707 St. Antoine Suite M-167 Detroit, MI 48201" plus phone) | **verified.** It is police-based. Some survivors will not want that, so list it after Avalon and VOICES4. |
| 6 | **ACCESS – Survivors of Violence Empowerment Programs** (Arabic and English) | Therapy, case management, legal help, support groups and transitional housing for survivors of sexual assault, DV and child abuse. | Free (grant-funded; not stated as free on the page); Wayne, Macomb, Oakland | "Phone: 313-348-4493" | not printed | Dearborn and all 4 | accesscommunity.org/survivors-of-violence-empowerment-programs (200) | **none.** The program page has no address. | **partial. Disagreement:** the MDHHS directory lists "313-348-4439 (Intake Line)" and a 24-hour line "833-STAND-4U (833-782-6348)". Neither appears on ACCESS's own page. A person should call and confirm which intake number is right. Do not show a location. |
| 7 | **CHASS – LA VIDA Partnership** (Spanish and English, Southwest Detroit) | Short-term counseling, support groups, court help and PPO help for DV and sexual assault survivors. Spanish speakers welcome. | "All services are free and confidential" | "313.849.3920" | not printed | Detroit (SW) | chasscenter.org/wellness/list/la_vida_partnership (200) | https://chasscenter.org/wellness/list/la_vida_partnership ("5635 West Fort Street Detroit, MI 48209" plus phone) | **verified.** The phone is CHASS's main line. Footer "©2023". |
| 8 | **SASHA Center** (Black-woman-led sexual-assault healing groups) | Free peer support groups for people who lived through sexual assault. | Free, confidential | "1-888-865-7055" "(THIS IS NOT A CRISIS LINE)" | not printed | Detroit | sashacenter.org (200) | **none.** It gives only "P.O. Box 2118 Detroit, MI 48211". | **verified (phone only).** The screen must say "not a crisis line". Footer "© 2010 - 2024". |

### Places (counseling, child advocacy, LGBTQ youth). Show below the hotlines, no map dots.

| # | Org / program | What you get | Cost / who | Street address | Phone as printed (what for) | Hours | Walk-in / appt | Cities | Checker URL (curl) | Status / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 9 | **Avalon Healing Center – main office, counseling and advocacy** | One-on-one and group counseling, advocates, rides to appointments, help finding safe shelter, help with victim-compensation forms | Free; counseling for ages 12+ and for family or loved ones | 601 Bagley St., Detroit, MI 48226 | "MAIN NUMBER: 313-964-9701" (appointments); crisis "313-474-SAFE" | counseling appointments "Monday - Friday during business hours: 9am - 5pm" | appointment | all 4 | https://avalonhealing.org/ (200) | **verified.** The homepage says the new building "is officially open", but a banner on the same page still says "Our offices are moving to 601 Bagley St." Minor staleness. |
| 10 | **Avalon Wellness Clinic** (follow-up medical care) | Re-check injuries, STI and HIV testing, nPEP medicine follow-up, strangulation checks | Free | "located at our downtown Detroit Center" (601 Bagley, per the homepage). The clinic page has no street line. | "Call to schedule an appointment: 313-920-0470" | "Monday through Thursday, 8am - 6pm" | appointment | all 4 | **none on one page.** avalonhealing.org/services/wellness-clinic/ has the phone but not the street. | **partial.** That page prints staff names and emails. Not recorded. |
| 11 | **Kids-TALK Children's Advocacy Center** (The Guidance Center), Midtown Detroit | For children through age 17 who were abused, and their safe family members: an interview in a kid-friendly room, an advocate, a medical check and therapy | Interview and advocacy free; medical and therapy "regardless of ability to pay" | 40 East Ferry Street, Detroit MI 48202 | "313-833-2970" (Detroit site); Southgate "734-785-7716"; therapy line printed with a staff extension, not recorded | **not printed** | Mostly referral: Avalon says referrals come from law enforcement, CPS and Avalon. To report suspected abuse: MDHHS Centralized Intake "855-444-3911". | Detroit (serves all of Wayne County) | https://www.guidance-center.org/kids-talk/ (200) | **verified** (address and phone). No hours. Canton site "Opening in 2027". |
| 12 | **Ruth Ellis Center** (LGBTQ+ youth, Highland Park) | Drop-in center for LGBTQ+ youth ages 13–30: basic needs, health and behavioral-health clinic (with Henry Ford Health), housing help | Free / low-barrier | 95 Victor Street Highland Park, MI 48203 | "313-252-1950" | not printed on the pages read | drop-in (hours not printed) | Highland Park, Detroit | https://ruthelliscenter.org/what-we-do/ (200) | **partial.** It is not a sexual-assault program. Avalon lists it as a referral. Hours are unknown. |
| 13 | **YWCA Metro Detroit – Interim House** (DV shelter and services) | DV crisis line and advocacy. The page does not mention sexual-assault services. | Free | admin office "985 E. Jefferson Avenue, Suite 101, Detroit, MI 48207" (read via WebFetch). The shelter address is confidential; never list it. | "24-Hour Crisis Line: 313-861-5300"; admin "(313) 259-9922" | 24h line | call | Detroit | ywcadetroit.org: **curl 403** ("403 - Forbidden"); read with WebFetch | **partial / blocks scripts.** Better suited to the DV lane. Listed here only because the MDHHS directory groups it with SA services. |

### Link-outs

| Link | Why | Status |
|---|---|---|
| MCEDSV member programs, via the hotline and MDHHS directory: https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/find-services-in-your-area/dvs-resource-directory/wayne-county | The State's Wayne County list of DV and SA programs. Good for discovery only. | 200. **Errors seen on it:** "Sisters Against Abuse Society" shows 313-964-9701, which is Avalon's main number. The VOICES4 text number disagrees with VOICES4's own page. Kids-TALK is listed with the Guidance Center switchboard 734-785-7700. |
| MDHHS SAFE Response (free exam, no police report needed): https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/resources-for-professionals/safe | Source for the "free exam, no police needed" line | 200, verified |
| Michigan Track-Kit and Crime Victim Compensation: https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/assistance | Track your kit; help paying medical and counseling costs | 200, verified |
| Equality Michigan (LGBTQ+ victim services, statewide) | 313.537.7000; PO Box only. The page lists an "LGBTQ+ Intimate Partner Violence Hotline: 1-800-832-1901" (an out-of-state org's number). | equalitymi.org: **curl 403**, read via WebFetch. Partial. |
| Alternatives For Girls, 903 W. Grand Blvd, Detroit, MI 48208 | Crisis line "(888) AFG-3919"; walk-ins "Monday-Friday from 9am-9pm". Mainly shelter and outreach for girls and young women. | 200. Belongs in a youth or shelter lane more than here. |
| Wayne County Prosecutor, Victim Services Unit | Court-based advocate | waynecounty.com redirects to waynecountymi.gov, which returns **403 to scripts; a person must check** |

---

## H2. Free tax preparation (seasonal)

### Overview

- **The 2026 filing season (tax year 2025) is over.** In Detroit it was run by **Accounting Aid Society (AAS)** and **Wayne Metro**, and booked through United Way's **Get The Tax Facts** (getthetaxfacts.org, or call 2-1-1). This is confirmed by the City of Detroit news release.
  - Free if household income is "less than $69,000". Mostly in person, with "drop-and-go" and virtual options.
  - AARP Tax-Aide says it "is closed for the 2026 tax season" and generally runs "from February 1 to April 15". No 2027-season site lists are published yet anywhere we checked.
- **Help is open right now:** AAS's **2026 Summer/Fall tax sites**, **08/31/2026 – 10/16/2026**, page "Last Updated 08/31/2026". They do:
  - prior-year and amended returns
  - help with IRS and Michigan Treasury letters
  - Detroit HOPE property-tax exemption forms
- **Deadlines:**
  - **Michigan Home Heating Credit** (MI-1040CR-7): the claim deadline is **September 30, 2026** (michigan.gov/taxes). That is 11 days away, so worth flagging in the app now.
  - **Detroit HOPE exemption**: AAS says "The deadline for HOPE November 6, 2026".
- **Seasonal modeling:** each AAS site below is a place with RRULE-style weekly days plus a start and end date. Treat each season as its own schedule row with `valid_from`/`valid_to`. The Jan–Apr 2027 list must be re-researched in January.
- **Checker note:** accountingaidsociety.org is served from a CDN cache that returns **brotli-compressed bodies even when the request says `Accept-Encoding: identity`**. Our curl has no brotli, so `curl --compressed` returned an empty body on some pages. We read the text through the site's own WordPress JSON (`/wp-json/wp/v2/pages/...`). `pnpm check:emergency`-style checkers need brotli support. The site list itself lives at **accountingaidresources.org** (AAS's Wix site), which reads fine with curl.

### Places (Summer/Fall 2026 season, run by Accounting Aid Society)

Common to every row:
- Org: Accounting Aid Society (VITA)
- Cost: free
- Phone as printed: "Call 313-556-1920 or schedule online!"
- Access: "Appointments are preferred; walk-in services may be available but are not guaranteed."
- Checker URL for all rows: **https://www.accountingaidresources.org/taxsitelocations** (200; the phone and every site address are on this page)
- What you get: someone prepares past-year or amended returns for you, helps with IRS or Treasury letters, and does Detroit HOPE forms.
- Income limit: AAS's main page says "households making less than $69,000 a year" (last modified 2026-02-27).
- Season: 2026-08-31 to 2026-10-16. The page says "*Schedule Subject to Change".
- Days below are read from the dated calendar on the page.

| # | Site | Street address | Hours as printed | Days (from calendar) | Last date listed | City served | Status / notes |
|---|---|---|---|---|---|---|---|
| 1 | Detroit Public Library – Main Branch | 5201 Woodward, Detroit, MI 48202 | "10am - 3pm" | Mondays and Thursdays | Thu 10/15/2026 | Detroit | **verified.** Some days carry notes like "Sites Close at 2pm" (9/3, 10/1) or "Sites Close at 12pm" (Mondays 9/14, 9/21, 9/28). The page does not make clear which site each note applies to; a person should read it. |
| 2 | Fisher Magnet Academy – FCC East ("FREC East" in calendar) | 15491 Maddelein St., Detroit, MI 48205 | "9am - 3pm" | Mondays and Wednesdays | Wed 10/14/2026 | Detroit | **verified.** The name disagrees: "FCC East" in the list vs "FREC East" in the calendar. |
| 3 | La Sed Senior and Youth Center | 7150 W. Vernor Hwy, Detroit, MI 48209 | "9am - 3pm" | Tuesdays and Thursdays | Thu 10/15/2026 | Detroit | **verified.** "¡Hablamos español!" |
| 4 | Northwest Financial Hub | 7800 W Outer Dr, LL20, Detroit, MI 48235 | "9am - 3pm" | Monday–Friday | Fri 10/16/2026 | Detroit | **verified** |
| 5 | Dearborn Henry Ford Centennial Library | 16301 Michigan Ave., Dearborn, MI 48126 | "10am - 3pm" | Thursdays | Thu 10/15/2026 | Dearborn | **verified** |
| 6 | VITA ACE (virtual) | Zoom ("Link sent morning of appointment") | "9am - 3pm" | Tuesdays and Wednesdays (some weeks) | Wed 10/7/2026 | all 4 | **verified.** Online, not a place. |

What to bring (AAS, https://www.accountingaidresources.org/what-to-bring):
- photo ID, and Social Security cards for everyone on the return; spouses filing jointly must both be there
- all W-2s and your last 2025 pay stub
- any 1099s, SSA-1099 or SSI letter, the MDHHS Client Annual Statement and the child support statement
- bank routing and account numbers ("Required for Federal Refunds")
- for the Home Heating Credit: heating costs from 11/01/2024 to 10/31/2025
- for the Homestead Property Tax Credit: 2025 taxable value and tax bills, or your lease and 2025 rent receipts

### Year-round help (places / phone)

| # | Org / program | What you get | Cost / who | Address | Phone as printed | Hours | Cities | Checker URL | Status / notes |
|---|---|---|---|---|---|---|---|---|---|
| 7 | **Accounting Aid Society – main office** (tax prep booking; Home Heating Credit, Homestead credit and HOPE help) | Book a free tax appointment. Get help with the Michigan Home Heating Credit and the Detroit HOPE property-tax exemption. | Free, under $69,000 | Footer: "3031 West Grand Blvd, Suite 621 Detroit, Michigan 48202". The contact page says "Suite 470". | "(313) 556-1920" | not printed | all 4 | https://accountingaidsociety.org/ (footer has both). **Brotli caveat above.** | **partial: suite number disagrees (621 vs 470).** The contact page was modified 2026-01-10. |
| 8 | **Accounting Aid Society – Low Income Taxpayer Clinic (LITC)** | Free legal help if you got an IRS letter, are audited, owe back taxes, need a payment plan, had your identity stolen or were denied the EITC | Free; income at or below 250% of poverty (1 person "$37,650", 4 people "$78,000"; 2025 figures) | same office | "(313) 556-1920 ext. 1219" (LITC intake line; also shown as a tel link) | not printed | all 4 | accountingaidsociety.org/help-with-the-irs/ (read via WP JSON, modified 2025-06-16). No address on that page. | **partial.** The income table may be a year old. |
| 9 | **Wayne Metro Community Action Agency – Tax Preparation Program** | Free tax prep by IRS-certified preparers. Can file up to 3 past years. Self-prep online if income is up to $89,000. | Free; "income of up to $69,000" | **none printed on the tax page** | "(313) 388-9799" | "available year-round" (no hours) | all 4 (Wayne County) | none | **unverified by script: waynemetro.org returns 403 to curl; read via WebFetch.** WebFetch reports the page gives two income limits ($63,000 and $69,000). A person must check. |
| 10 | **ACCESS – Center for Working Families** (Dearborn) | Help getting ready for tax time and claiming credits. Actual prep is "Coordinate[d] service delivery with Accounting Aid Society". Also budgeting coaching. | Free, low to moderate income | ACCESS One-Stop, 6451 Schaefer Road, Dearborn, MI 48126 | "Phone: 313.203.1874" | not printed | Dearborn | https://www.accesscommunity.org/human-services/financial-stability (200) | **verified** (address and phone). **Disagreement:** this page gives the Detroit One Stop as "14627 W. Warren", but the ACCESS contact page says "16427 W. Warren Avenue Detroit, MI 48228". A staff financial-educator email is printed there and not recorded. |
| 11 | **Detroit Public Library branches** (AAS pop-up sites in the Jan–Apr season) | Example: "Accounting Aid Society Tax Assistance", Douglass branch, "Thursday, March 26, 2026", "11:00am - 5:00pm". "library staff cannot set appointments". | Free | branch address not in the event text | "313-556-1920" (AAS) | seasonal | Detroit | detroitpubliclibrary.org/events/event/1804311447109 (200) | **verified as 2026-season evidence.** Re-check DPL's "Tax Preparation Assistance & Legal Aid" event category in January 2027. |

### Link-outs

| Link | What it says (owner's page) | Status |
|---|---|---|
| Get The Tax Facts (United Way SE Michigan): https://unitedwaysem.org/resources/tax-preparation-assistance/ (getthetaxfacts.org redirects here) | Free if income is under $69,000. Online booking with AAS and Wayne Metro for Wayne, Oakland, Macomb and Washtenaw. Call 2-1-1. | 200, verified. Still says "Schedule now to file your taxes in 2026". No site list. |
| IRS VITA/TCE page: https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers | "People who generally make $69,000 or less". Locator phone "800-906-9887". AARP Tax-Aide "888-227-7669". "Page Last Reviewed or Updated: 12-Aug-2026" | 200, verified |
| IRS VITA locator: https://freetaxassistance.for.irs.gov/s/sitelocator (irs.treasury.gov/freetaxprep now redirects to irs.gov) | Salesforce JS app. curl gets an empty "Loading" shell. | **needs a browser.** The IRS says it is "updated regularly from February through April". |
| IRS Free File: https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free | Guided software free at "$89,000 adjusted gross income (AGI) or less". Updated 12-Jun-2026. | 200, verified |
| Michigan Treasury "E-file for FREE": https://www.michigan.gov/taxes/efile/iit/efile-for-free | Free federal and MI returns, "including City of Detroit", through listed vendors (e.g., "AGI is $32,000, or less" for 1040NOW; "$51,000 or less" for OLT). "Information about software developers will be published as it becomes available for tax year 2025." | 200, verified. Stale wording for the next season. |
| Michigan Home Heating Credit: https://www.michigan.gov/taxes/questions/iit/accordion/heating/home-heating-credit-information-1 | "The deadline for submitting this form is September 30, 2026." | 200, verified |
| Michigan Free Tax Help: https://michiganfreetaxhelp.org/free-tax-prep-locations/ (the brief's "mifreetaxhelp.org" does not resolve) | "Call the number 2-1-1 or text your zip code to 898211". Lists no Wayne County sites. | **curl 403; read via WebFetch.** It is an aggregator run by CEDAM (per search), so use it for discovery only. |
| AARP Tax-Aide: https://taxaide.aarpfoundation.org/ | "closed for the 2026 tax season". Generally "February 1 to April 15". Locator at aarp.org is JS. | 200, verified. No Detroit, Hamtramck, Highland Park or Dearborn sites found. |
| Taxpayer Advocate / IRS local office | The IRS office locator (apps.irs.gov/app/office-locator/) is a JS app. The IRS "contact my local office in Michigan" URL now redirects to the national page. The appointment line is "844-545-5640" (the IRS TAC appointment line, per search). | **needs a browser.** An IRS PDF from 2024 gives TAS at 985 Michigan Ave, Suite 609, Detroit; that is stale and unverified. |

Not found or not usable: SER Metro-Detroit's virtual VITA page (**403**). No Hamtramck- or Highland Park-specific VITA site was found for 2026. "CAMP" from the brief could not be matched to any Detroit tax program.

---

## H3. Help signing up for benefits (people who help you apply)

### Overview

- **MDHHS county offices.**
  - The MDHHS page for each district office gets its details from an iframe at `https://mdhhs.michigan.gov/CompositeDirPub/VignetteView.aspx?id=NNN`. That iframe page has the address and the information phone as plain text, so **use the iframe URL as the checker URL.** The michigan.gov wrapper page holds only the street, in its meta description.
  - Office hours are **not printed** on these pages.
  - MDHHS statewide line: "844-464-3447".
- **Which office serves which ZIP:** MDHHS PDF "Wayne County District Offices Zip Code Assignments", dated "Wednesday, October 8, 2025" (…/DHS-WayneCountyZips.pdf):
  - **Hamtramck (48212)** and **Highland Park (48203)** go to Hamtramck/Woody Plaza.
  - **Dearborn (48120, 48121, 48124, 48126, 48128)** goes to **Greenfield/Joy** in Detroit.
  - Detroit ZIPs are split across 6 offices (table below).
- **MI Bridges Community Partners.**
  - MDHHS does run a partner program with "Navigation Partner" agencies that give one-on-one help applying.
  - The partner finder is inside newmibridges.michigan.gov, which is a **Salesforce JS app. curl gets only a "Loading" shell.** No public navigator list or download was found.
  - Link out to MI Bridges and 2-1-1 rather than listing partners, unless a person exports the list by hand.
- **Medicare help:** Michigan's MMAP is now called **"MI Options"**, the State Health Insurance Assistance Program. The statewide line is "1-800-803-7174".
  - Detroit Area Agency on Aging covers Detroit, Hamtramck and Highland Park.
  - The Senior Alliance, based in Dearborn, covers western Wayne and Downriver.
  - DAAA's old .com page still says "MMAP"; its .org page says "MI Options".
- **Health-insurance (ACA) navigators:** no Michigan navigator organization page was found. Use the link-out LocalHelp.HealthCare.gov, which is a JS app.
- **SSI/SSDI help (SOAR):**
  - The MDHHS SOAR page URL from search results now returns **404**. soarworks.samhsa.gov did not answer curl (status 000).
  - Search snippets list only **individual staff** as Detroit SOAR contacts. That is not recordable, and no org intake line was found.
  - Recommendation: link-out only, until a steward gets an org-level SOAR intake line.
- **Social Security field offices:** ssa.gov/locator returns **403 (Akamai "Access Denied") to scripts.** A person must look up the Detroit and Dearborn field offices by hand.

### Places

| # | Org / program | What you get (plain) | Cost / who | Street address | Phone as printed (what for) | Hours | Walk-in / appt | Cities / ZIPs served | Checker URL (curl) | Status / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **MDHHS – Hamtramck/Woody Plaza District** | Apply for or ask about food help (FAP), cash, Medicaid and State Emergency Relief | Free | 12140 Joseph Campau St., Hamtramck, MI 48212 | "313-892-0180" (information); fax 313-892-9990 | not printed | not stated | 48201, 48202, **48203 (Highland Park)**, 48208, 48211, **48212 (Hamtramck)**, 48216, 48226 | https://mdhhs.michigan.gov/CompositeDirPub/VignetteView.aspx?id=214 (200) | **verified** |
| 2 | **MDHHS – Greenfield/Joy District** | same | Free | 8655 Greenfield, Detroit, MI 48228 | "313-943-5200" (information) | not printed | not stated | **Dearborn 48120, 48121, 48124, 48126, 48128**; 48135, 48223, 48228 | …VignetteView.aspx?id=212 (200) | **verified. Disagreement:** the ZIP PDF prints "Detroit, MI 48236" for this office, but the iframe says 48228. Use 48228. |
| 3 | **MDHHS – Grandmont Service Center** | same | Free | 17455 Grand River Ave, Detroit, MI 48227 | "313-493-7801" (information) | not printed | not stated | 48204, 48221, 48227, 48238 | …?id=210 (200) | **verified** |
| 4 | **MDHHS – Southwest Service Center** | same | Free | 2524 Clark Street, Detroit, MI 48209 | "313-554-8300" (information) | not printed | not stated | 48101, 48122, 48192, 48206, 48209, 48210, 48217, 48218, 48229 | …?id=207 (200) | **verified** |
| 5 | **MDHHS – Conner Service Center** | same | Free | 4733 Conner, Detroit, MI 48215 | "313-926-8600" (information) | not printed | not stated | 48207, 48214, 48224, 48234 | …?id=206 (200) | **verified** |
| 6 | **MDHHS – Gratiot/Seven Mile District** | same | Free | 4733 Conner, Suite G 7, Detroit, MI 48215 | "313-372-6200" (information) | not printed | not stated | 48205, 48213, 48215, 48225, 48230, 48236 | …?id=211 (200) | **verified.** It shares a building with Conner. |
| 7 | **MDHHS – Greydale/Grand River District** (outside our cities; serves NW Detroit ZIPs) | same | Free | 27260 Plymouth Rd., Redford, MI 48239 | "734-762-3900" (information) | not printed | not stated | Detroit 48219, 48235; 48239, 48240 | …?id=213 (200) | **verified.** It is outside our bounding box area, but Detroit residents in 48219 and 48235 are sent here. |
| 8 | **MDHHS – Adult Medical District** (Medicaid-specific) | Medicaid cases for certain adults | Free | 3040 West Grand Blvd., Suite 4-250, Detroit, MI 48202 | iframe: "313-664-6944"; ZIP PDF: "313.664.6900" | not printed | not stated | county-wide (specialized) | …?id=222 (200) | **partial: phone disagrees (6944 vs 6900).** |
| 9 | **ACCESS – Social Services (MDHHS application help)** (Arabic and English) | Help applying for MDHHS food and cash help and **State Emergency Relief (SER)**, unemployment certifications, FAFSA and housing forms, and Arabic–English translation | Free | 6451 Schaefer Rd, Dearborn Mi (page text; ZIP 48126 from the contact page) | "313-203-1874" | not printed | not stated | Dearborn | https://www.accesscommunity.org/human-services/basic-needs (200) | **verified** (the ZIP is on a different page) |
| 10 | ACCESS – Social Services, Saulino Ct | same | Free | 2651 Saulino Ct, Dearborn Mi (ZIP 48120 per contact page) | "313-203-3392" | not printed | not stated | Dearborn | same URL | **verified.** It is also ACCESS HQ (313) 842-7010. |
| 11 | ACCESS – Hamtramck Center | same, plus financial coaching | Free | 9301 Joseph Campau Ave, Hamtramck Mi (ZIP 48212 per contact page) | "313-842-7726" | not printed | not stated | Hamtramck | same URL | **verified** |
| 12 | **Detroit Area Agency on Aging – MI Options (formerly MMAP)** | Free, unbiased Medicare counseling: plans, drug coverage, Medicaid, fraud | Free; people with Medicare and caregivers | 1333 Brewery Park Blvd., Ste 200, Detroit, MI 48207 | "313-446-4444" (DAAA main); "1-800-803-7174" (MI Options) | not printed | call | Detroit, Hamtramck, Highland Park (plus Harper Woods and the Grosse Pointes) | https://www.detroitseniorsolution.org/programs/mi-options/ (200) | **verified.** The service area is from /areas-we-serve/. |
| 13 | **The Senior Alliance (AAA 1-C) – Medicare Counseling (SHIP / MI Options)** | Free one-on-one Medicare help | Free | 3200 Greenfield Rd., Suite 100, Dearborn, MI 48120 | "734.727.2067" (Medicare counseling); main "734.722.2830"; statewide "800.803.7174" ("8:00 a.m. to 8:00 p.m. Monday-Friday") | "8:00 a.m. to 4:00 p.m. Monday through Friday" | call or referral form | "southern and western Wayne County" (34 communities). **Dearborn is not named in the list we read; confirm.** | https://thesenioralliance.org/ (address in footer and main phone) | **partial.** The Medicare page has the phone; the homepage has the address. |
| 14 | **Lakeshore Legal Aid** (help with benefit denials, e.g. SSI, Medicaid, FAP) | Free legal help if you are low-income | Free, income-based | **not found on the homepage** | "(888) 783-8190" ("Apply by phone") | not printed | phone or online intake | all 4 (per its known service area; not confirmed on page) | none | **partial.** Its benefits and disability practice is not confirmed on the pages read. |

### Link-outs

| Link | Why | Status |
|---|---|---|
| MI Bridges: https://newmibridges.michigan.gov/ | Apply online and find community partners | **JS app, browser only** |
| MDHHS State Emergency Relief: https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief | What SER covers; the "Apply Here" link goes to MI Bridges | 200, verified |
| MDHHS Wayne County offices plus ZIP PDF: https://www.michigan.gov/mdhhs/inside-mdhhs/county-offices/wayne | "Find Your Wayne County Office by Zip Code" | 200, verified (PDF dated 2025-10-08) |
| MDHHS long-term care / MI Options: https://www.michigan.gov/MDHHSmioptions (redirects to …/acls/long-term-services-and-supports) | "call 1-800-803-7174" | 200, verified |
| HealthCare.gov local help: https://localhelp.healthcare.gov/ (redirects to healthcare.gov/find-local-help/) | Find a certified navigator | JS shell. Needs a browser. |
| SSA office locator: https://www.ssa.gov/locator | Find the Social Security field office by ZIP | **403 Access Denied (Akamai), browser only** |
| MDHHS Navigation Partner info: https://www.michigan.gov/mdhhs/doing-business/mibridgespartners/become/navigation-partner | Explains navigators; not a finder | 200, but the body did not render in curl |
| Michigan 2-1-1 | Screening and referral to the partners above | discovery only (aggregator) |

---

## Gaps and blockers

1. **Blocks scripts / needs a browser (a person must check):**
   - RAINN (Cloudflare block)
   - dmc.org (hospital pages)
   - Wayne County Prosecutor (waynecountymi.gov 403)
   - waynemetro.org, ywcadetroit.org, equalitymi.org, michiganfreetaxhelp.org, sermetro.org. These return the same 75 KB "403 - Forbidden" page, probably a shared host WAF. Some were read with WebFetch, but our checker will fail on them.
   - ssa.gov/locator (Akamai)
   - IRS VITA locator and IRS office locator (JS)
   - MI Bridges partner search (Salesforce JS)
   - HealthCare.gov local help (JS)
2. **accountingaidsociety.org serves brotli to every client.** `curl` without brotli gets an unreadable or empty body. Either add brotli support to the checker, or check AAS through accountingaidresources.org, which carries the phone and all site addresses.
3. **Sexual-assault exam sites have no published addresses.** Avalon names 7 sites but gives addresses for none except its HQ, and asks for a call first. No hospital in our cities publishes its own SANE page (DMC blocked, Corewell Dearborn silent). We recommend showing Avalon as a call-first hotline and not listing hospitals.
4. **Contradictions to resolve with owners:**
   - Avalon contact-page tel link dials 313-475-7233 instead of 474.
   - VOICES4 text number: 866-238-1454 in the MDHHS directory vs 855-864-2374 on the owner pages.
   - ACCESS survivor line: 313-348-4493 on the ACCESS page vs 313-348-4439 plus 833-STAND-4U in the MDHHS directory.
   - AAS suite number: 621 vs 470.
   - AAS site name: FCC vs FREC East.
   - ACCESS Detroit address: 14627 vs 16427 W. Warren.
   - MDHHS Greenfield/Joy ZIP: 48236 vs 48228.
   - MDHHS Adult Medical phone: 6944 vs 6900.
   - Wayne Metro income limit: $63,000 vs $69,000.
   - MDHHS directory lists Sisters Against Abuse Society with Avalon's phone.
5. **Missing hours** for Kids-TALK, Ruth Ellis, every MDHHS office, ACCESS and DAAA. These must stay "hours unknown", never "open".
6. **Seasonal:**
   - The AAS summer/fall 2026 sites end **2026-10-16**. The Jan–Apr 2027 VITA and AARP lists do not exist yet; re-research in January 2027.
   - The Home Heating Credit deadline is **2026-09-30** and HOPE is **2026-11-06**.
7. **No public navigator lists:**
   - MI Bridges Navigation Partners (JS only)
   - ACA navigators (no Michigan org page found)
   - SOAR: only individual staff contacts are published, and those are not recordable
   - Social Security field offices (blocked)
8. **Service area unclear:**
   - First Step (Western Wayne): does it serve Dearborn or Detroit?
   - The Senior Alliance: Dearborn is not named on the page read.
   - Lakeshore Legal Aid: Detroit office address not on its homepage.
