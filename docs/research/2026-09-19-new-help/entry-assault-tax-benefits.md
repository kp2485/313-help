# Convert: assault, tax and benefits (2026-09-19)

Incoming file: `data/seed/incoming/2026-09-19-assault-tax-benefits.txt` (14 lines: assault 2, money.tax 5, money.benefits 7).
Notes used: `docs/research/2026-09-19-new-help/assault-tax-benefits.md`. No pages were re-read.

## Held for a person

Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`):

```csv
"RAINN National Sexual Assault Hotline","rainn.org blocks scripts (Cloudflare). The number 800-656-4673 (800-656-HOPE) is printed on four local owner pages but not read on RAINN's own. A person must read it in a browser before it goes on the assault screen",https://www.rainn.org/
"First Step 24-hour help line (Western Wayne County)","Page does not say whether it serves Detroit, Hamtramck, Highland Park or Dearborn; offices are in Plymouth, Wayne and Lincoln Park. Ask before showing it, even as a backup for Dearborn",https://firststep-mi.org/get-help/if-youve-been-sexually-assaulted/
"ACCESS Survivors of Violence Empowerment Programs","Phone disagrees: 313-348-4493 on ACCESS's page vs 313-348-4439 (intake) and 833-782-6348 (833-STAND-4U) in the MDHHS directory; no address on the program page. Do not show a location",https://www.accesscommunity.org/survivors-of-violence-empowerment-programs
"SASHA Center support groups","Phone only (1-888-865-7055, ""THIS IS NOT A CRISIS LINE""), P.O. Box only; footer (c) 2010-2024 and no 2025-2026 evidence. If added, it must say it is not a crisis line",https://sashacenter.org/
"Avalon Wellness Clinic (follow-up care after assault)","Clinic page has the phone (313-920-0470) and hours (Mon-Thu 8am-6pm) but no street address; the home page says it is at the downtown center (601 Bagley). Could become a second phone on the Avalon line instead",https://avalonhealing.org/services/wellness-clinic/
"Kids-TALK Children's Advocacy Center, 40 East Ferry St","Address and phone (313-833-2970) are on the owner page, but no hours, and Avalon says referrals come from police, CPS and Avalon. Confirm whether a family can call directly before listing",https://www.guidance-center.org/kids-talk/
"Equality Michigan LGBTQ+ victim services","equalitymi.org blocks scripts (403); P.O. Box only. The page's IPV hotline (1-800-832-1901) belongs to an out-of-state organization",https://www.equalitymi.org/
"Wayne County Prosecutor Victim Services Unit","waynecountymi.gov blocks scripts (403). A person must check in a browser",https://www.waynecountymi.gov/
"Accounting Aid Society main office, 3031 W Grand Blvd","Suite disagrees: footer says Suite 621, contact page says Suite 470. Site also serves brotli-only bodies that our checker may not read",https://accountingaidsociety.org/
"Accounting Aid Society Low Income Taxpayer Clinic","No address on the page (phone 313-556-1920 ext. 1219); income table may be 2025 figures",https://accountingaidsociety.org/help-with-the-irs/
"Wayne Metro Tax Preparation Program","waynemetro.org blocks scripts (403); read only through WebFetch; page gives two income limits ($63,000 and $69,000) and no address",https://waynemetro.org/
"MDHHS Adult Medical District, 3040 W Grand Blvd Suite 4-250","Phone disagrees: 313-664-6944 on the office page, 313-664-6900 on the ZIP PDF",https://mdhhs.michigan.gov/CompositeDirPub/VignetteView.aspx?id=222
"MDHHS Greydale/Grand River District, 27260 Plymouth Rd, Redford","Office is in Redford, outside our four cities, but MDHHS sends Detroit ZIPs 48219 and 48235 here. Kyle decides whether to list it",https://mdhhs.michigan.gov/CompositeDirPub/VignetteView.aspx?id=213
"The Senior Alliance Medicare counseling (MI Options), Dearborn","Dearborn not named in the service-area list read; address is on the home page and the counseling phone (734-727-2067) on another page",https://thesenioralliance.org/
"Lakeshore Legal Aid help with benefit denials","No address on the home page; benefits and disability practice not confirmed on the pages read. Belongs to the legal lane",https://lakeshorelegalaid.org/
"Social Security field offices, Detroit and Dearborn","ssa.gov/locator blocks scripts (403). A person must look them up",https://www.ssa.gov/locator
"SOAR help applying for SSI/SSDI","MDHHS SOAR page is 404 and soarworks did not answer; only individual staff are named as contacts. Need an organization intake line",https://soarworks.samhsa.gov/
```

Not held, for another lane: Alternatives For Girls (903 W. Grand Blvd; walk-ins Mon-Fri 9am-9pm) is shelter and outreach for girls and young women, not an assault program. YWCA Interim House's crisis line is already listed (sal_ywca_interim_house_line); its shelter address is confidential and must never be listed.

## Link-outs

Checked 2026-09-19.

| title | body | label | url | need |
|---|---|---|---|---|
| A free exam, no police report needed | In Michigan you can get a forensic exam after sexual assault without being billed. No one can make you talk to police to get the exam. | Read the State's page | https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/resources-for-professionals/safe | assault screen (not in the need list) |
| Track your kit and get costs paid | Michigan can help crime victims pay medical and counseling costs. You can also track your sexual assault kit. | Read the State's page | https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/assistance | assault screen (not in the need list) |
| Book free tax help | Free tax help if your household makes less than $69,000. Book online or call 2-1-1. | Book with United Way | https://unitedwaysem.org/resources/tax-preparation-assistance/ | taxes |
| Free tax help by video | Accounting Aid Society does tax help over Zoom on some Tuesdays and Wednesdays. The last date listed is Oct 7, 2026. | See dates | https://www.accountingaidresources.org/taxsitelocations | taxes |
| Home Heating Credit: due Sept 30 | Michigan's Home Heating Credit helps pay heating costs. The deadline to send the form is September 30, 2026. | Read about the credit | https://www.michigan.gov/taxes/questions/iit/accordion/heating/home-heating-credit-information-1 | taxes |
| File your taxes free online | IRS Free File software is free if your adjusted gross income is $89,000 or less. | Go to IRS Free File | https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free | taxes |
| Free tax help from IRS volunteers | IRS-certified volunteers prepare taxes for free for people who generally make $69,000 or less. | Read the IRS page | https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers | taxes |
| Apply for benefits online | Apply online for Michigan benefits and find community partners who can help you apply. | Apply on MI Bridges | https://newmibridges.michigan.gov/ | benefits |
| State Emergency Relief | What Michigan's State Emergency Relief can help with, and how to apply on MI Bridges. | Read about SER | https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief | benefits |
| Find your MDHHS office | Find the Wayne County MDHHS office for your ZIP code. | Find my office | https://www.michigan.gov/mdhhs/inside-mdhhs/county-offices/wayne | benefits |
| Free Medicare counseling | Michigan's MI Options program gives free help with Medicare. | Read about MI Options | https://www.michigan.gov/MDHHSmioptions | benefits |
| Get help with health insurance | Find a trained helper near you who can help you sign up for health insurance. | Find local help | https://localhelp.healthcare.gov/ | benefits |
| Find your Social Security office | Look up the Social Security office for your ZIP code. | Find my office | https://www.ssa.gov/locator | benefits |

Notes: the Home Heating Credit link-out expires after 2026-09-30. The video tax help link-out expires after 2026-10-07. United Way's page still says "file your taxes in 2026"; keep it for the January season. AARP Tax-Aide is closed until February; do not link it until then. Michigan Treasury's free e-file page has last season's wording; left out.

## Hotlines

| Label | Number | Text / TTY | Owner page | Screen |
|---|---|---|---|---|
| Avalon Healing Center 24-hour crisis line (sexual assault; call first for an exam) | 313-474-7233 (printed 313-474-SAFE) | none; press 1 for the medical team, 2 for an advocate | https://avalonhealing.org/ | assault (first after 911). **Avalon's contact page has a bug: its tap-to-call link dials 313-475-7233, not 474.** Never copy that link; tell Avalon. Avalon asks survivors to call first and publishes no exam-site addresses, so no exam sites are listed. |
| VOICES4: Michigan sexual assault, domestic violence and trafficking hotline | 1-855-864-2374 (855-VOICES4), call or text | TTY 517-381-8470 | https://www.michigan.gov/voices4 (also https://mcedsv.org/hotline/) | assault. The MDHHS Wayne County directory lists the text line as 866-238-1454; both owner pages say to text 855-864-2374, so use that. |
| RAINN National Sexual Assault Hotline | 800-656-4673 (800-656-HOPE) | not read | https://www.rainn.org/ | assault. **Pending**: held until a person reads rainn.org in a browser. |
| MI Options Medicare help line | 1-800-803-7174 | none | https://www.michigan.gov/MDHHSmioptions | benefits |
| MDHHS statewide line | 844-464-3447 | none | owner page URL not recorded in the notes; a person must find it on michigan.gov before adding | benefits |

The screen line "You can get a free exam without talking to police" is sourced to the MDHHS SAFE page (link-out above). Detroit Police Victim's Assistance is a listing, not a hotline, so it shows below Avalon and VOICES4.

## Updates to existing rows

| sal_id | Change | Source |
|---|---|---|
| sal_chass_southwest | Add an assault service at this place: LA VIDA Partnership, "All services are free and confidential": short-term counseling, support groups, court and PPO help for survivors of domestic violence and sexual assault, in Spanish and English. Same phone (313-849-3920). No map dot on the assault screen. | https://chasscenter.org/wellness/list/la_vida_partnership |
| sal_access_benefits_help_at_the_east_dearborn_office | Same place (6451 Schaefer Rd, 313-203-1874) also runs the Center for Working Families: help getting ready for tax time and claiming credits, with tax prep done with Accounting Aid Society; budgeting coaching. Consider a money.tax service here. | https://www.accesscommunity.org/human-services/financial-stability |
| sal_access_benefits_help_at_the_main_dearborn_office, sal_access_benefits_help_at_the_east_dearborn_office, sal_access_benefits_help_at_the_hamtramck_office | These are benefits-application help (food, cash, SER, unemployment and FAFSA forms, translation). Consider moving them from food.benefits to money.benefits, or showing them on both screens. Steward decides. | https://www.accesscommunity.org/human-services/basic-needs |

## Counts

- Lines written: **14** (assault 2; money.tax 5, each with `notice=Open through Oct 16, 2026.`; money.benefits 7: six MDHHS offices and DAAA MI Options).
- Held: **17**.
- Link-outs: **13**. Hotlines: **5** (1 pending). Updates: **3**.
