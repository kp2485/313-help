# Convert: legal help and ID (2026-09-19)

Notes: `docs/research/2026-09-19-new-help/legal-and-id.md`. Incoming file: `data/seed/incoming/2026-09-19-legal-id.txt`.
Two pages were re-read on 2026-09-19 to settle single facts: Wayne State's immigration clinic (no public way in: "receives the majority of its clients through referrals" and points people to a directory) and Sugar Law Center (no cost is printed on the contact or home page).
LAD (Legal Aid and Defender) is held in `convert-housing.md`; it is not repeated here.

## Held for a person

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"Wayne County Clerk, Birth and Death Records, 400 Monroe St, Suite 605","This is where Detroit, Dearborn, Hamtramck and Highland Park birth certificates come from (the Detroit Health Department closed its Vital Records Division in December 2013). waynecountymi.gov refused our script (403); phone 313-224-0270 and the address were read only on the City's page. A person must check the Clerk's own page for fees, hours (City page says 8:00am-4:30pm) and any fee waiver for people without housing",https://detroitmi.gov/departments/detroit-health-department/programs-and-services/birth-and-death-certificates
"Michigan Secretary of State branch offices (Dearborn, Hamtramck, 6 in Detroit; none in Highland Park)","Branches have no public phone; no single page has a phone and a branch address. The branch list PDF is from 2024. Dearborn is 5090 Schaefer Rd in the fax PDF and a 2026 release but 5094 in a 2025 release. Re-check each office in the scheduler",https://www.michigan.gov/sos/faqs/resources/secretary-of-state-offices
"Social Security offices (Detroit, Dearborn, Hamtramck area)","ssa.gov/locator refused our script (403). A person must look up the offices in a browser",https://www.ssa.gov/locator/
"Michigan Legal Help, 3rd Circuit Court Self-Help Center, 2 Woodward Ave, 19th Floor","No phone on the page, and two hour statements differ (9am-3pm with sign-in by 1:30pm vs 9am-noon and 1pm-3pm)",https://michiganlegalhelp.org/self-help-centers/3rd-circuit-court-self-help-center
"Michigan Legal Help self-help desk at Detroit Justice Center, 4731 Grand River Ave","Michigan Legal Help lists public hours (Mon-Thu 9am-5pm), but Detroit Justice Center's own site says appointment only and clients come only from referral partners. No phone on the MLH page",https://detroitjustice.org/legal-services/
"Detroit Justice Center, Legal Services and Community Legal Advocates","Referral only ('we here at DJC only get legal clients from our referral partners'); no public way in",https://detroitjustice.org/faqs/
"Street Democracy","Referral only ('referred by a partner straight to a lawyer'); no hours or cost printed",https://www.streetdemocracy.org/get-help
"Wayne State Law Asylum and Immigration Law Clinic","Mostly referral: 'receives the majority of its clients through referrals from community partner organizations' and sends individuals to an outside directory. No public way in on its page (re-read 2026-09-19)",https://law.wayne.edu/academics/clinics/immigration
"University of Detroit Mercy Law clinics","Only the law school main line 313-596-0200 is on the owner page; clinic lines and cost appear only on aggregators",https://law.udmercy.edu/academics/experiential-education/clinics.php
"Sugar Law Center, 4605 Cass Ave","Phone 313-993-4505, address and Mon-Fri 9am-5pm are on the page, but no cost is printed (re-read 2026-09-19), so it is not clearly free or low-cost. Several sub-pages are COVID-era",https://www.sugarlaw.org/contact
"Free Michigan birth certificate for people experiencing homelessness","Only on an advocacy page (MCAH) and a search snippet of the law; the Legislature page returned 502 and the MDHHS provider page is 404. Caseworker note, not a resident listing",https://www.mihomeless.org/vital-documents/
"Michigan United (DACA and citizenship help), 4405 Wesson St","On the federal roster, but miunited.org refused our script (403)",https://www.justice.gov/eoir/media/1398081/dl
```

Not listed and not held: Elder Law of Michigan's senior legal hotline (appears discontinued; Lakeshore's CALL line and NLSM's Elder Law center replace it), CHASS immigration (on the roster but its own site shows no immigration service), Great Lakes Legal (fee-based), Catholic Charities / Samaritas / Global Detroit (no recognized office in our cities).

## Link-outs

| need | title | body | label | url | checked |
|---|---|---|---|---|---|
| legal | Free legal help, forms and guides | Michigan's free self-help website, with forms, guides and a tool to find legal help. | Go to Michigan Legal Help | https://michiganlegalhelp.org/ | 2026-09-19 |
| legal | Clear an old conviction | Explains which old convictions clear on their own and when, and the limits. | Read about Clean Slate | https://www.michigan.gov/msp/services/chr/conviction-set-aside-public-information/michigan-clean-slate | 2026-09-19 |
| legal | Get your driver's license back | Free clinics to learn how to get a driver's license back. You still have to pay fines and fees. Sign up ahead. | See Road to Restoration clinics | https://www.michigan.gov/sos/license-id/road-to-restoration | 2026-09-19 |
| jobs-lost | Report unpaid wages | File a complaint about unpaid wages, overtime or sick time. | File a wage complaint | https://www.michigan.gov/leo/bureaus-agencies/ber/wage-and-hour | 2026-09-19 |
| legal | Apply for free legal help online | Lakeshore Legal Aid checks if you can get a free lawyer. People with low income and seniors qualify for help. Apply by phone or online. | Apply with Lakeshore Legal Aid | https://lakeshorelegalaid.org/find-legal-help/ | 2026-09-19 |
| id | Order a Michigan birth certificate | Order a copy by mail, online, by phone, at a drop box, or by appointment in Lansing. It can take 8 to 10 weeks. | Order from the State | https://www.michigan.gov/mdhhs/doing-business/vitalrecords/order-a-copy-of-a-vital-record | 2026-09-19 |
| id | Get a state ID with no fee | Who can get a state ID for free (like people 65 and older, veterans, and people without housing) and what to bring. | See who gets a free ID | https://www.michigan.gov/sos/all-services/id-with-no-fee | 2026-09-19 |
| id | IDs and name changes | Guides about getting ID papers and changing your name. | Read ID guides | https://michiganlegalhelp.org/resources/ids-and-name-change | 2026-09-19 |

Notes: Road to Restoration has no clinic scheduled in our four cities for the rest of 2026 (only Hancock Sept 22 and Iron Mountain Sept 23, both in the UP); a steward may prefer to leave it off until a local one is listed. For the no-fee ID, people without housing must bring BOTH a homeless verification letter from a public agency AND an HMIS photo ID (as printed). The State birth-certificate page does not mention the homeless fee waiver.

## Hotlines

| label | number | text/TTY | owner page | screen |
|---|---|---|---|---|
| Free legal help by phone (Lakeshore CALL line) | 888-783-8190 | none printed | https://lakeshorelegalaid.org/find-legal-help/ | legal (top); also a line in the incoming file |
| Worker rights line for immigrant workers and farmworkers (MIRC and Farmworker Legal Services) | 800-968-4046 | none printed | https://michiganimmigrant.org/immigration-legal-services | legal |
| Secretary of State (IDs and licenses) | 888-767-6424 (888-SOS-MICH) | none printed | https://www.michigan.gov/sos/faqs/resources/secretary-of-state-offices | id (staffed Mon-Fri 8:30am-5pm; branches have no public phone) |

## Updates to existing rows

| sal_id | change | source |
|---|---|---|
| sal_pope_francis_day_center | Same place offers free rotating medical, dental and legal clinics, and a Secretary of State mobile unit visits so guests can get ID. Day center service hours "Monday-Saturday from 7am - 11am". Clinic and mobile-unit dates are not printed. Consider a `legal` / `ids` service at this location. The /get-help/ page still shows old winter shelter notices. | https://popefranciscenter.org/our-work/day-center/ |
| sal_noah_bag_lunch | Same org and address (23 East Adams): drop-in casework helps people without a home get a state ID and birth certificate, and use NOAH's address for mail. Hours not printed. Consider an `ids` service at this location. | https://noahatcentral.org/what-we-do/casework/ |
| sal_access_benefits_help_at_the_east_dearborn_office | Same address (6451 Schaefer Rd): ACCESS Immigration and Citizenship, help from DOJ-accredited staff with citizenship, green cards and family papers. NOT free: "fee for service", with a sliding fee for low income. The center's main line on /contact is 313-945-8380 (the immigration page shows only a staff member's direct line: do not use). Consider a `legal` service with flags immigrants,sliding_fee. | https://www.accesscommunity.org/contact |

## Counts

- Lines written: 13 (11 legal, 2 ids)
- Held: 12
- Link-outs: 8
- Hotlines: 3
- Updates: 3
