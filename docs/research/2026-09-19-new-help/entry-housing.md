# Convert: housing (2026-09-19)

Notes: `docs/research/2026-09-19-new-help/housing.md`. Incoming file: `data/seed/incoming/2026-09-19-housing.txt`.
UCHC hours were re-read on 2026-09-19 to settle the flagged conflict. Both pages still differ: contact page "Monday - Friday 8:30 am - 5:00 pm", home page "Monday - Friday: 8:30am - 4:30pm". The conflict is real, so UCHC is held.

## Held for a person

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"United Community Housing Coalition: eviction defense, 300 River Place Dr, Suite 1200","Hours conflict on UCHC's own pages (contact page Mon-Fri 8:30am-5:00pm; home page 8:30am-4:30pm). Phone 313-963-3310 and the new address are clear. The City HOPE page and 36th District Court FAQ still show the old 2727 Second Ave address and a 313-405-7726 number: do not use those",https://www.uchcdetroit.org/contact-us
"United Community Housing Coalition: tax foreclosure prevention","Same UCHC hours conflict (4:30 vs 5:00). Tax Foreclosure Hotline 313-725-4560 and the address are on the contact page",https://www.uchcdetroit.org/contact-us
"Legal Aid and Defender Association: civil housing and veterans legal help","Two addresses on its own page: footer 7650 Second Ave, Ste 120, 48202 vs header '613 Abbott St #630' (looks like a map widget). Footer says Copyright 2022. Hours not printed",https://ladadetroit.org/services/
"Detroit Tax Relief Fund","Program page refused our script (403). Phone 866-313-2520 is only on the City HOPE page. A person must check it is still funded",https://www.waynemetro.org/dtrf/
"Detroit Senior Accessibility Home Repair Fund","ARPA-funded (2024); no sign it is still open. Application site detroithousingnetwork.org refused our script (403)",https://detroitmi.gov/departments/housing-and-revitalization-department/homeowners/senior-accessibility-home-repair-fund
"Michigan Legal Services: probate to keep the family home","The probate program's PHONE field is blank; only the general law line 313-964-4130 exists, and the program page shows a staff email (not recorded). The River Place row covers the office",https://www.milegalservices.org/housing
"Hamtramck H.E.A.R.T. poverty exemption, 3401 Evaline St","The 2026 packet contradicts itself on the income limit ('add 75%' vs 'factor of 1.70'). Phone (313) 800-5233 ext. 820 and address are on the assessor page",https://hamtramckcity.gov/departments/assessor/
"Highland Park poverty exemption, City Assessor, 12050 Woodward Ave","Board of Review page says '12505 Woodward Ave'; every other page says 12050. Phone 313-252-0050 is City Hall main. Board of Review 2026: Jul 21 and Dec 15, 1-3pm",https://highlandparkmi.gov/government/assessor/tax-assessing/poverty-exemption-application/
"Dearborn Housing Commission (Townsend Towers, Kennedy Plaza, Sisson Manor)","No phone on the page; Sisson Manor ZIP is 48124 in one block and 48126 in another",https://dearborn.gov/dearbornhousing
"Wayne Metro rent help (Connect Center)","waynemetro.org refused our script (403). A person should check current rent-help programs in a browser before tagging the existing sal_wayne_metro_* rows housing.rent",https://www.waynemetro.org/
"36th District Court, 421 Madison St (where Detroit eviction hearings are)","Reference row, not a help listing. Right to Counsel lawyers are in room 417. A steward decides whether the rent screen shows the court. Its landlord-tenant FAQ still lists UCHC at the old address",https://www.36thdistrictcourtmi.gov/general-information/housing-resources
"Detroit Tenants Association / Detroit Tenant Union","Active in 2026 per news, but detroittenants.org did not answer and the only presence is social media. No owner page to check",
"City of Detroit Life & Legacy (free wills)","Page now returns 'Content Not Found' (403). May be unpublished",
"LISC / City 0% Interest Home Repair Loan","LISC page is written in the past tense and detroithomeloans.org is (c) 2014. Treat as ended unless LISC or the City confirms",https://www.lisc.org/detroit/our-initiatives/quality-affordable-housing/interest-home-repair-loan-program/
"Michigan tenant-landlord guide (Legislature PDF)","Not fetched; link-out candidate only after a person opens it",https://www.legislature.mi.gov/Publications/tenantlandlord.pdf
```

Not listed and not held (checked, closed or not ours): Renew Detroit (closed for good), ACCESS/Dearborn RMU rent grant (2021 COVID page), Michigan Housing Locator (now a commercial site), UCHC Home Repair Services (existing UCHC clients only), 19th/31st/30th District Courts (reference only; no tenant self-help), Wayne Metro Out-Wayne HARA office (Wyandotte, outside our cities).

## Link-outs

| need | title | body | label | url | checked |
|---|---|---|---|---|---|
| rent | Money for back rent or a deposit | State Emergency Relief can help with back rent, a deposit or moving costs if you have a court summons or judgment, are homeless, or have another listed emergency. The amount per household is limited. | Read about State Emergency Relief | https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/relocation | 2026-09-19 |
| rent | Apply for State Emergency Relief | Apply for State Emergency Relief online on MI Bridges. | Apply on MI Bridges | https://newmibridges.michigan.gov | 2026-09-19 |
| rent | Free lawyer at your Detroit eviction hearing | Go to your first court date and ask for the free lawyer. For Detroit cases, with household income up to 2 times the poverty line. | Read how Right to Counsel works | https://michiganlegalhelp.org/find-lawyer/detroit-right-counsel | 2026-09-19 |
| rent | Answer an eviction case online | A free online tool fills in the form you file to answer an eviction. It asks for a donation, but you do not need to pay. | Start your answer | https://michiganlegalhelp.org/resources/housing/do-it-yourself-answer-eviction-complaint | 2026-09-19 |
| rent | Guides about eviction | Guides on eviction for not paying rent, lockouts, subsidized housing, and setting aside a default. | Read eviction guides | https://michiganlegalhelp.org/resources/eviction | 2026-09-19 |
| rent | Section 8 waiting lists in Michigan | The state's list of open Section 8 (Housing Choice Voucher) waiting lists. None were open on Sept 19, 2026. | See the waiting lists | https://www.michigan.gov/mshda/rental/housing-choice-voucher/mshda-housing-choice-voucher-hcv-waiting-list-information | 2026-09-19 |
| rent | Find an affordable place to rent in Detroit | The City's rental search, with affordable listings. | Search Detroit Home Connect | https://homeconnect.detroitmi.gov/affordable | 2026-09-19 |
| rent | Rentals built with public money | The official list of rentals built with public money. Search by city or ZIP. | Search the rental directory | https://housing.state.mi.us/arhd/ | 2026-09-19 |
| rent | Apply for HOPE (Detroit property tax help) | Lower or wipe out this year's Detroit property tax if your income is low. Apply by 4:30pm on November 6, 2026. | Apply for HOPE | https://detroitmi.gov/government/mayors-office/chief-financial-officer/homeowners-property-exemption-hope | 2026-09-19 |
| rent | Apply for Detroit home repairs | One pre-application for Critical Home Repair and LeadSafe. Open until 5pm on September 22, 2026. | Pre-apply online | https://portal.neighborlysoftware.com/CITYOFDETROITMI/participant | 2026-09-19 |
| rent | Emergency help with a mortgage or taxes | State Emergency Relief can help with a mortgage, land contract or property tax payment. There is a lifetime limit. | Read about home ownership help | https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/home-ownership | 2026-09-19 |
| rent | Emergency home repairs | State Emergency Relief can help pay for essential home repairs, like a furnace. There are lifetime limits. | Read about home repair help | https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/home-repairs | 2026-09-19 |
| rent | House still in a late relative's name | Explains "tangled title" and where to get free or low-cost help keeping the family home. | Read about heirs' property | https://www.lisc.org/detroit/our-initiatives/quality-affordable-housing/heirs-property/ | 2026-09-19 |
| rent | Wayne County Probate Court | The court where you open an estate to put a house in the heirs' names. | Go to the Probate Court site | https://www.wcpc.us/ | 2026-09-19 |

Note: there is no homeowner need in the list, so the homeowner link-outs are under `rent` (housing). The HOPE and home-repair link-outs need a date check: pull the home-repair one after 2026-09-22 17:00. The LISC heirs page links to the City's Life & Legacy page, which is gone.

## Hotlines

| label | number | text/TTY | owner page | screen |
|---|---|---|---|---|
| Eviction Defense Hotline (UCHC) | 313-725-4646 | none printed | https://www.uchcdetroit.org/contact-us | rent (top) |
| Free legal help by phone (Lakeshore CALL line) | 888-783-8190 | none printed | https://lakeshorelegalaid.org/find-legal-help/ | rent (also a line in the legal file) |
| Detroit Housing Resource HelpLine (Right to Counsel, legal referrals) | 866-313-2520 | none printed | https://detroitmi.gov/departments/law-department/office-eviction-defense-right-counsel | rent (same number as sal_housing_helpline) |
| Tax Foreclosure Hotline (UCHC) | 313-725-4560 | none printed | https://www.uchcdetroit.org/contact-us | rent / homeowners |

The UCHC hotline numbers are on UCHC's own current page; only the office hours conflict, so the hotlines can go up while the office row waits.

## Updates to existing rows

| sal_id | change | source |
|---|---|---|
| sal_housing_helpline | Now also the Right to Counsel and legal-referral door (the new `Right to Counsel: free eviction lawyer` line uses the same number under housing.rent). No second service needed. | https://detroitmi.gov/departments/housing-and-revitalization-department/renters |
| sal_access_benefits_help_at_the_main_dearborn_office, sal_access_benefits_help_at_the_east_dearborn_office, sal_access_benefits_help_at_the_hamtramck_office | ACCESS helps people apply for State Emergency Relief (back rent with a court summons) and fill out housing applications. Consider showing these on the rent screen too. Do not list the ACCESS RMU rent grant (2021). | https://www.accesscommunity.org/human-services/basic-needs |
| sal_wayne_metro_* | Consider tagging housing.rent after a person confirms current rent help in a browser (site 403). | https://www.waynemetro.org/ |

## Counts

- Lines written: 9 (4 housing.rent, 5 housing.owner)
- Held: 15
- Link-outs: 14
- Hotlines: 4
- Updates: 3
