# Convert: dental, vision, child care, rides, pets (lane J)

Notes: docs/research/2026-09-19-new-help/dental-childcare-rides-pets.md. Incoming file: data/seed/incoming/2026-09-19-dental-care-rides-pets.txt. Pages read 2026-09-19.

## Held for a person
Ready to append to `data/seed/to-verify.csv` (`name,why_held,source_url`).

```csv
"Advantage Health Centers, 101 E Alexandrine St","The dental page lists this site, but no page says which sites have a dentist; the locations page loads by script, so phone and address are not on one page. Not in resources.csv",https://ahcdetroit.org/services/dental-services/
"Vision To Learn (free school eye exams and glasses)","School and Head Start only; families can't book a visit. The phone (313-481-1741) is printed only on a DPL event page, not VTL's own page; VTL's Detroit post is from 2016",https://visiontolearn.org/where-we-work/michigan/
"Eye Care for Michigan (Eye Care For Detroit): free glasses and College Park Vision Center, 7800 W. Outer Drive","The page doesn't say the walk-in clinic is at 7800 W. Outer Dr; exam cost and FAQ load by script; no hours",https://www.eyecarefordetroit.org/free-prescription-eyeglasses
"Matrix Head Start, 1400 Woodbridge","Owner page gives 1400 Woodbridge; the Head Start Association directory gives 2051 Rosa Parks Blvd Suite 1K. Confirm which is a center and which is the office",https://matrixheadstart.org/contact-us/
"MiSide EarlyYears Head Start, 19176 Northrop and 19750 Burt Rd","Phone conflict: miside.org prints (313) 591-4179 and (313) 504-4076; the still-live develctrs.org page prints (313) 246-6060 and (313) 977-9550",https://miside.org/miside-earlyyears/head-start-and-early-head-start
"The Order of the Fishermen Ministry Head Start, 10047 Grand River Ave","Phone and address on the owner page, but cost and ages are not stated",https://www.tofmhs.org/
"Focus: HOPE Center for Children (Strong Beginnings and GSRP), 1550 Oakman Blvd","Page shows two addresses (program 1550, main office 1400 Oakman) and no early-learning phone; GSRP section says '6 weeks to 4 years' (likely copy error); no longer Head Start though directories say so",https://www.focushope.edu/programs/early-learning/
"Wayne Metro Head Start (Hamtramck, Highland Park, Dearborn)","waynemetro.org blocks scripts (403); sites and phones come only from search snippets. Our only route to Head Start in those three cities. Check in a browser",https://www.waynemetro.org/headstart/
"New St. Paul Tabernacle Head Start, 15362 Southfield Dr","Owner site blocks scripts (403); address and phone only from the Head Start Association directory",https://nspheadstart.org/
"Renaissance Head Start, 13110 14th St","Owner domain looks parked (redirects to /lander); may be closed",http://www.renheadstart.org/
"Modivcare Michigan Medicaid rides (no health plan): 1-866-569-1902","Printed on the vendor's page, not on a current MDHHS page. Confirm with MDHHS before it goes on the rides screen",https://www.mymodivcare.com/members/mi/
"St. Patrick Senior Center medical rides, 58 Parsons St","Rides post is from Feb 2022 with no 2025-26 evidence; the rides line (313-831-2520) and the address are not on the same page",https://stpatsrctr.org/well-provide-transportation-to-medical-appointments/
"Detroit Health Department Rides to Care (pregnant women and new moms)","Program URL now redirects to a general page that doesn't mention it; 313-876-0000 only in a Dec 2025 news story. May have ended",https://detroitmi.gov/departments/detroit-health-department
"Michigan Humane Grosfeld Veterinary Clinic, 7887 Chrysler Drive","Verified (phone and address on the locations page; clinic hours Mon-Fri 8am-6pm on the clinic page), but the page never says low cost: deposits are $225 dog surgery, $100 cat surgery, $45 wellness. A person decides whether it fits 'low-cost pet care'",https://michiganhumane.org/locations-and-hours/
"Michigan Humane Caplan Family Pet Food Pantry","Free dog and cat food every 30 days at pop-up sites, but the distribution calendar is script-only; no places or times readable",https://michiganhumane.org/pet-food-access/
"All About Animals 'Detroit Pets For Life' (free spay/neuter in 48201, 48204, 48206, 48208)","Marked 'Limited time!' on the pricing page with no end date; not the owner's own program page (call 313-804-9152)",https://allaboutanimalsrescue.org/veterinary-services/all-about-pricing/
"Dog Aide dog food delivery (Detroit)","Phone conflict: page prints (313) 744-6DOG (744-6364) but the tap link dials 313-644-6364. A person must call to confirm",https://www.dogaide.com/outreach.html
"Detroit Animal Care and Control, 1431 E Ferry St","Mainly strays, adoptions and licenses; page carries a stale 2018 holiday notice; older sources give 7401 Chrysler Dr; rabies-shot price not on the page. Could be a pets row once a person confirms",https://detroitmi.gov/departments/general-services-department/detroit-animal-care-and-control/detroit-animal-care
```

## Link-outs

| title | body | label | url | checked | need |
|---|---|---|---|---|---|
| Medicaid dental care for kids | Medicaid covers dental care for children and teens through Healthy Kids Dental. | Learn about Healthy Kids Dental | https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/beneficiaries/programs/healthy-kids-healthy-kids-dental | 2026-09-19 | benefits |
| Help paying for child care | The state helps pay for child care while you work, go to school or get training. Apply on MI Bridges or at your local MDHHS office. | Learn about child care help | https://www.michigan.gov/mileap/early-childhood-education/early-learners-and-care/cdc/parents | 2026-09-19 | childcare |
| Find child care and free preschool | Search for licensed child care, free PreK and Head Start near you. | Search for child care | https://greatstarttoquality.org/free-or-low-cost-programs/ | 2026-09-19 | childcare |
| Free PreK for 4-year-olds | All 4-year-olds in Wayne County qualify for GSRP, the free state PreK. Choose your top three places and apply online, or text 313-410-4588 for help. | Apply for free PreK | https://findprek.org/ | 2026-09-19 | childcare |
| Starfish Head Start and Early Head Start | Free early learning for babies to preschoolers at Starfish centers, many in Detroit, for families who are income eligible. Fill out an interest form and a Family Advocate will call. | Contact Starfish | https://www.starfishfamilyservices.org/services/early-childhood-education/ | 2026-09-19 | childcare |
| Medicaid ride phone numbers | If you have Medicaid, your health plan gives free rides to covered care. Call the ride number for your plan; most need 2 to 3 days' notice. | See ride phone numbers | https://www.michigan.gov/mdhhs/doing-business/providers/providers/billingreimbursement/non-emergency-medical-transportation | 2026-09-19 | rides |
| 50-cent DDOT bus fare | Pay 50 cents a ride if you are 65 or older, have a disability, have Medicare, or are a student. Apply for a Reduced Fare ID; photos are taken at the Rosa Parks Transit Center. | Get a DDOT Reduced Fare ID | https://detroitmi.gov/departments/detroit-department-transportation/transportation-fares | 2026-09-19 | rides |
| Free DDOT rides for Detroit students | Kids in grades K-12 who go to school in Detroit ride DDOT buses free. Just show your school ID. | Learn about Ride to Rise | https://detroitmi.gov/news/ride-rise-how-detroit-students-can-ride-ddot-bus-free | 2026-09-19 | rides |
| DDOT door-to-door rides for disabilities | Shared door-to-door rides for people whose disability keeps them from riding the bus. You must apply first; each ride is $2.50, cash only. | Learn about DDOT Paratransit | https://detroitmi.gov/departments/detroit-department-transportation/detroit-paratransit | 2026-09-19 | rides |
| Same-day DDOT paratransit rides | Paratransit riders can book a same-day ride as soon as one hour ahead, 6am to 7pm, Monday to Saturday. $2.50, cash only. | Learn about DDOT Now | https://detroitmi.gov/departments/detroit-department-transportation/detroit-paratransit | 2026-09-19 | rides |
| SMART bus: 50-cent fare, students free | Pay 50 cents a ride on SMART if you are 65 or older or have a disability. Students with a valid school ID ride free. | See SMART reduced fares | https://www.smartbus.org/Fares/Reduced-Fares | 2026-09-19 | rides |
| Dearborn rides for people 60 and older | Rides anywhere in Dearborn, including to the doctor, for residents 60 and older. $2 round trip; call 313-943-4083 at least 4 days ahead. | Learn about senior rides | https://dearborn.gov/residents/services-adults-55/senior-transportation/senior-transportation | 2026-09-19 | rides |
| Urgent rides for seniors in Dearborn | Rides for people 60 and older when nothing else works, not for regular trips. Call 734-722-2830, Monday to Friday, 8:30am to 4:30pm. | Learn about urgent senior rides | https://thesenioralliance.org/services/transportation/ | 2026-09-19 | rides |
| Spay and neuter van from Detroit | Drop your pet at a Detroit stop at 7 am. Your pet is fixed at the Warren clinic and comes back the next morning. | Book the van | https://allaboutanimalsrescue.org/veterinary-services/request-spay-or-neuter-appointment/request-a-transport-van-for-spayneuter-or-a-dental-cleaning/ | 2026-09-19 | pets |
| Free spay and neuter for Detroit dogs | Free spay or neuter, shots and a microchip for dogs that live in Detroit. No income or breed limits. Call or text 313-855-5866 for a voucher. | Get a Project GRACE voucher | https://www.dogaide.com/project-grace.html | 2026-09-19 | pets |

Notes on these:
- Healthy Kids Dental: a search result says Delta Dental becomes the only plan on Oct 1, 2026, but the MDHHS alert URL returned 404. Leave that out until a person confirms. The page's age wording is mixed ("under age 19", "through age 20"), so the body gives no age.
- CDC scholarship: the program moved from MDHHS to MiLEAP. The income chart is dated August 2026 (family of 4: $5,500 a month gross at application). We left the chart out of the body; the page carries it.
- findprek.org vs Wayne RESA: RESA says GSRP eligibility is income-based; findprek.org (run by Wayne RESA) says all 4-year-olds in Wayne County qualify. The body uses findprek's wording, which matches PreK for All. The page says "Text"; the notes also say call.
- Medicaid rides: the MDHHS page links the PDF "MHP NEMT Contacts" (revised 05/14/2026). The PDF also lists plan staff and direct lines; if the app ever shows plan ride numbers, copy only the member lines (see notes J3 #2). Which plans serve Wayne County isn't stated, so the app should say "call the number on your plan card".
- DDOT: there is no low-income fare. The reduced-fare card office is at 360 Michigan Ave (drop-off and photos Mon-Fri 8am-3:30pm, (313) 933-1300); per the brief it stays a link-out rather than a transport place.
- Ride to Rise: the City's Aug 13, 2026 post calls it "a six-month initiative" with no start or end date. Set a recheck around 2027-02-13.
- DDOT Paratransit: the page prints (313) 578-8268 for eligibility; an older PDF in search results says 578-8286. The owner page wins.
- All About Animals van: prices (dogs $150, cats $50) are on a separate pricing page, so the body leaves them out.
- Project GRACE: the page shows only "Detroit, MI 48207", no street address, so it is a link-out.

## Hotlines

| label | number | text / TTY | owner page | screen |
|---|---|---|---|---|
| Medicaid Beneficiary Help Line (not sure which ride line to call) | 1-800-642-3195 | none printed | https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/beneficiaries/support | rides (also benefits) |
| MyRide2: one call to find a ride (seniors and adults with disabilities) | 1-855-697-4332 (1-855-MYRIDE2) | TTY (800) 649-3777 | https://www.myride2.com/ | rides |
| Detroit Area Agency on Aging Information & Assistance (Detroit, Hamtramck, Highland Park seniors; includes rides) | 313-446-4444 | none printed | https://www.detroitseniorsolution.org/information-assistance/ | rides |

## Updates to existing rows

| sal_id | what to change | source |
|---|---|---|
| sal_chass_southwest | Add dental to `what`: cleanings, fluoride, fillings and pulling teeth. "For those without coverage, most services are provided on a sliding fee scale. A minimum payment is required at the time of service." Add flag `sliding_fee`. There is no dental-only phone or hours, so no separate line. The contact page also says "van service in select zip codes" for patients (detail text). | https://www.chasscenter.org/health/list/Dental-Care ; https://www.chasscenter.org/contact |
| sal_covenant_care_michigan_ave | Separate `health.dental` line added in the incoming file (dental line (313) 554-3880, Mon-Fri 8am-4pm). Detail text: nitrous at Joy Rd and Michigan Ave only; Mobile Dental visits schools, Head Start and shelters and is "not available for individual patient request"; "Lyft transportation is available at no cost for qualifying patients". | https://www.covenantcommunitycare.org/health-services/dental-offices-in-detroit ; https://www.covenantcommunitycare.org/mobile-dental |
| sal_covenant_community_care_moross | Separate `health.dental` line added (313-626-2620, Mon-Fri 8am-4pm), which matches the row's "dentist closes at 4pm". | same dental page |
| sal_covenant_care_joy_rd | Separate `health.dental` line added (main line, dental hours Mon 8-4:30, Tue 8-6:30, Wed-Thu 8-4:30, Fri 8-1). The existing row has no dental hours. | same dental page |
| sal_advantage_health_west_mcnichols, sal_advantage_health_oakman | Detail text: dental "accepts most insurances and Medicare… Payment plans are available… accepting new patients of all ages". The page doesn't say which sites have a dentist, so the "dentist" in `what` should be confirmed by phone. | https://ahcdetroit.org/services/dental-services/ |
| sal_detroit_community_dr_feleta_wilson_health_center, sal_detroit_community_nolan_family_medical_center, sal_detroit_community_dr_sophie_womack_health_center | No change: the page confirms dental at these three only (East Riverside has none), which matches our rows. | https://www.dchcquality.org/our-services |
| sal_access_medical_center, sal_western_wayne_dearborn_health_center | No change: neither offers dental or eye care in our area, and neither row claims to. | https://www.accesscommunity.org/health-wellness/medical ; https://wwfhc.org/locations/ |

Other notes:
- No dentist was found in Dearborn or Highland Park. Hamtramck has only the existing Hamtramck Health Center row. The nearest are UDM (Corktown) and Covenant Michigan Ave.
- Wayne Health / Kresge Eye Institute is excluded: specialty care, not low cost.
- No recurring free dental days, no Lions eyeglass program with a working owner page, and no current owner page for the adult Medicaid dental benefit.
- waynemetro.org blocks scripts, which may also affect the existing Wayne Metro utility rows' automatic check.

## Counts
- Lines written: 11 (health.dental 6, health.vision 1, kids.care 1, pets 3; transport 0)
- Held: 18
- Link-outs: 15 (benefits 1, childcare 4, rides 8, pets 2)
- Hotlines: 3
- Updates to existing rows: 7
