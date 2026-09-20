# Convert: clothing, day centers, phones (lane I)

Notes: docs/research/2026-09-19-new-help/clothing-dropin-phones.md. Incoming file: data/seed/incoming/2026-09-19-basics.txt. Pages read 2026-09-19.

## Held for a person
Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`).

```csv
"Alternatives For Girls Crisis Resource Center, 903 W. Grand Blvd","Walk-in hours (Mon-Fri 9am-9pm) are on a page last changed April 2024; the contact page gives office hours Mon-Fri 9-5. Also confirm it serves any adult, not only girls and young women",https://alternativesforgirls.org/programs/crisis-resource-center/
"Cass Community Social Services resource room (clothes), 1534 Webb St","No owner page shows the phone and the Webb St address together, and the ZIP is not printed. Saturday 9-11:30am during the free clinic",https://casscommunity.org/services/health/
"Metropolitan Church of God Coral's Closet, 13400 Schaefer Hwy","Page prints only donation drop-off hours; no days or hours for getting clothes",https://www.mcogdetroit.org/clothes
"Wayne Metro diaper distribution, 4671 Parker St, Dearborn","Seen only on Idealist and search snippets (4th Wednesday monthly); waynemetro.org blocks scripts. Check in a browser",https://www.waynemetro.org/
"Detroit Phoenix Center youth drop-in","Drop-in page is JavaScript-only; hours, ages and lockers come only from search snippets; unclear whether the drop-in is at 1420 Washington Blvd. Check in a browser",https://www.detroitphoenixcenter.org/contact
"Cass Community Social Services Warming Center (Nov 15-Mar 31)","A seasonal 24/7 shelter by referral, not a day center; no address printed; referral number is 313-305-0311 (audit A9)",https://casscommunity.org/
"Cass Community Social Services drop-in day center (opened Dec 2024)","Not on Cass's own site; only a Nov 2024 news story; an 18-month grant may have ended. Call 313-883-2277",https://casscommunity.org/contact-us/locations/
"St. Vincent de Paul Detroit help line","Owner pages never mention clothing (their stores sell items); only aggregators claim free clothing. Could fit general help if a person confirms",https://svdpdetroit.org/Get-Help
"USPS General Delivery, Detroit Main Post Office","The rule is on pe.usps.com, but the Detroit office (1401 W Fort St per aggregators) is not confirmed on a USPS page; the locator is JavaScript-only",https://pe.usps.com/text/dmm300/508.htm
"Xfinity Internet Essentials (link-out)","xfinity.com blocks scripts; price and rules not read on the owner page. Check in a browser before linking",https://www.xfinity.com/learn/internet-service/internet-essentials
"Spectrum Internet Assist (link-out)","Not shown that Spectrum serves Detroit, Hamtramck, Highland Park or Dearborn",https://www.spectrum.com/internet/spectrum-internet-assist
"Grace in Action Southwest Equitable Internet Initiative ($10/month, 48209 and 48216)","Owner page returns 401; facts only from a Michigan Central press release (June 2025)",https://www.giacollectives.org/sw-equitable-internet-initiative
"PCs for People (low-cost computers)","No Michigan store on the locations page; shipping to Michigan not confirmed",https://www.pcsforpeople.org/eligibility/
"Dearborn Public Library mobile hotspots","Page still says hotspots work on the Sprint network (stale); loan period not shown",https://dearbornlibrary.org/mobile-hotspots/
"Friends of Parkside Tech Lab, 5000 Conner St #103","Connect 313 hub; phone and address on the owner page but no hours",https://www.friendsofparkside.org/
"MACC Development MACC Tech Hub, 7900 Mack Ave","Connect 313 hub; no hours printed; content may need a browser",https://www.maccdevelopment.com/macctechhub
"Bridging Communities tech hub, 6900 McGraw Ave","Named a tech hub by Connect 313, but its own page does not describe tech help; office hours only",https://bridgingcommunities.org/
"Lifeline apply site (lifelinesupport.org)","Refuses script connections; MPSC points to it as the place to apply. Check in a browser before we link to it",https://www.lifelinesupport.org/
```

## Link-outs

| title | body | label | url | checked | need |
|---|---|---|---|---|---|
| Diapers each month for babies under 3 | Diapers each month for children under 3 in Wayne, Oakland and Macomb counties. Fill out the online form every month and pick one pickup place. | Ask for diapers | https://www.detroitdiaperbank.com/diapers/ | 2026-09-19 | clothes-baby |
| Holiday clothes box for kids 4 to 13 | A holiday box with warm clothes, toys and books for kids 4 to 13 in Detroit, Highland Park, Hamtramck and some nearby cities (not Dearborn). Apply online by October 31, 2026; pickup places are announced in December. | Apply to Goodfellows | https://www.detroitgoodfellows.org/application/ | 2026-09-19 | clothes-baby |
| Money off your phone bill (Lifeline) | If you get SNAP, Medicaid, SSI or similar help, or have low income, you may get money off your phone or internet bill each month. Apply through a phone company that takes Lifeline. | Learn about Lifeline | https://www.michigan.gov/mpsc/consumer/telecommunications/lifeline | 2026-09-19 | phone |
| Phone companies that take Lifeline | The state's list of home phone and cell phone companies that take Lifeline. | See the list | https://www.michigan.gov/mpsc/consumer/telecommunications/lifeline/michigan-lifeline-providers | 2026-09-19 | phone |
| Who can get Lifeline | You may qualify if you get SNAP, Medicaid, SSI, Federal Public Housing or a Veterans Pension, or if your income is low. One Lifeline benefit per home. | Check if you qualify | https://www.usac.org/lifeline/consumer-eligibility/ | 2026-09-19 | phone |
| Low-cost home internet from AT&T | Lower-cost AT&T home internet if you get SNAP, SSI, WIC or school meals, or your income is low. The price and speed depend on your address. | See Access from AT&T | https://www.att.com/internet/access/ | 2026-09-19 | phone |
| Neighborhood internet: North End, Highland Park, Hamtramck | Community-run home internet for Detroit's North End, Highland Park and Hamtramck. Sign up online or call 313-236-4591. | Sign up for home internet | https://mynewcc.org/our-work/equitable-internet-initiative-eii/ | 2026-09-19 | phone |
| Places to use a computer in Detroit | A list of neighborhood places in Detroit where you can use a computer, get online and get help learning. | See the tech hub list | https://connect313.org/neighborhood-tech-hubs/ | 2026-09-19 | phone |
| Borrow a laptop or hotspot | Detroit and Highland Park residents can borrow a laptop, Chromebook or Wi-Fi hotspot with an adult library card. One of each per card. | Borrow from the library | https://detroitpubliclibrary.org/laptop-to-go-hotspot-to-go | 2026-09-19 | phone |

Notes on these:
- Diaper Bank: no pickup places are published (they appear only on the form), so no listing. Do not state the reply deadline: the English FAQ says Monday 5 pm, the Spanish text says Wednesday. The form asks for an email and identity on their side; we only link. The /diapers/ page does not itself say "free" (the FAQ does), so the body avoids the word. The 3434 Chene St address is a donations mailbox; do not map it.
- Goodfellows: the application page does not use the word "free". Could also be a dated `alert_` that ends 2026-10-31.
- Lifeline: link only to the MPSC pages and USAC, never to a carrier or reseller. The ACP ended in 2024; never show it. usac.org showed a government-shutdown banner; a person should see whether it is current.
- AT&T Access is the carrier's own official plan page, not a reseller. Its phone hours are in Central Time. A person decides whether a carrier's own low-income plan page is allowed under "official pages only" (Comcast is held above; no WOW! Michigan plan exists).
- EII: the page prints no price; its office address (7700 Second Ave) is not a service site.
- DPL Laptop-to-Go: this page says 90 days; the DPL services page says "up to 60 days", and another page says 18+ with photo ID and a $500 fee if not returned. The body leaves out the loan length until a person settles it.

## Hotlines

| label | number | text / TTY | owner page | screen |
|---|---|---|---|---|
| Lifeline Support Center (help applying) | 800-234-9473 | none printed | https://www.michigan.gov/mpsc/consumer/telecommunications/lifeline | phone |

## Updates to existing rows

| sal_id | what to change | source |
|---|---|---|
| sal_pope_francis_day_center | Hours already match (Mon-Sat 7-11am). Add "phone and internet" to `what` ("Mail, phone, and internet services"). Consider making this a `shelter.day` listing (or adding a `shelter.day` service at 438 Saint Antoine) so the day center shows under Day centers, not only meals. Switch `source_url` to the day-center page. The Bridge Housing Campus cold-weather shelter (2915 W Hancock) opens only in cold snaps, so it is an `alert_`, not a row. | https://popefranciscenter.org/our-work/day-center/ (modified 2025-09-10) |
| sal_noah_bag_lunch | Add the mail service: "You can use NOAH as your mailing address." Also drop-in casework: help replacing an ID or birth certificate and applying for SNAP or Medicaid. Still no clock times, so it stays call first. Consider a separate `shelter.day` service at 23 E Adams for mail and casework. The WAVE shower trailer comes "twice per week" (days not given). | https://noahatcentral.org/what-we-do/casework/ (modified 2025-02-21) |
| sal_ruth_ellis_drop_in | No change: hours already match the page. The page was last changed 2024-07-17, so a person should confirm the hours by phone. | https://ruthelliscenter.org/what-we-do/health-equity-outreach/ |
| sal_crossroads_sunday_meal | Three new services at this place are in the incoming file (clothes, baby things, computer lab). Crossroads also lists birth certificate and ID retrieval, Medicaid and SNAP enrollment and a notary on /clients; that belongs in the `ids` / `money.benefits` batch, not here. | https://crossroadsofmichigan.org/clients |
| sal_most_holy_food_pantry | No change. The clothing room is a new service line in the incoming file. | https://mhtdetroit.org/outreach/clothes-closet/ |
| sal_detroit_public_bowen_branch_library | `what` says "Free computers". DPL pages disagree on the guest-pass fee ($1 vs no charge); "free" is true with a DPL card. Consider "Free computers with a library card." | https://detroitpubliclibrary.org/locations/main (fees table on the DPL computers page) |
| sal_dearborn_public_henry_ford_centennial_library | No change needed. The page confirms computers with Microsoft Office, guest passes and Wi-Fi for anyone. The Bryant and Esper branches could be added from their own pages. | https://dearbornlibrary.org/computer-print-and-fax-access/ |
| sal_covenant_house_detroit | Outside this topic: its page also prints (313) 463-2500 for after hours and weekends (page last changed 2023-05-18). Relevant to audit A9. | Covenant House Michigan page (see notes) |

Other notes:
- City of Dearborn warming centers (Jan 23-25, 2026) opened only for a weather event: an `alert_`, not a listing. https://dearborn.gov/residents/emergency/2026/01/23/alert-city-warming-centers
- No owner page in our four cities offers lockers, bag storage or phone charging by name. There is also no regular free clothing or diapers in Dearborn or Hamtramck, and no day center outside Detroit and Highland Park.
- The Brilliant Detroit hubs, Matrix and Franklin Wright already carry clothes or diapers in their existing rows.

## Counts
- Lines written: 6 (goods.clothes 2, goods.baby 1, connect 3)
- Held: 18
- Link-outs: 9 (clothes-baby 2, phone 7)
- Hotlines: 1
- Updates to existing rows: 8
