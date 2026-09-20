# Convert: SAMHSA staged treatment rows (2026-09-19)

Input: `data/staging/samhsa_treatment.csv`, `decision=staged` (22 rows).
Incoming file: `data/seed/incoming/2026-09-19-samhsa-staged.txt` (2 lines).
Earlier notes used: `docs/research/2026-09-19-new-help/treatment-1-places.md`, `entry-treatment.md`, and `data/seed/to-verify.csv`.
All pages were read on 2026-09-19 with curl using the UA `Mozilla/5.0 (compatible; 313help-research; open-source civic directory)`. One WebFetch read of metro-east.org, a page that loads its content by script and does not block us. No block was worked around. cskdetroit.org returns 403 to our UA, so it was left for a person.

Duplicate check: I checked `data/seed/resources.csv` and the other incoming files for every staged phone number and street number. The only match is Harbor Light, which is already listed at 3737 Lawton (`sal_the_salvation_salvation_army_harbor_light_detroit`). It is also in the treatment batch.

## Lines written (2)

| Staged row | Line | Source |
|---|---|---|
| NCADD GDA Vantage Point West, 16647 Wyoming | (313) 341-9891, 16647 Wyoming Street | https://ncadd-detroit.org/contact-us/ (© 2026) |
| Focus Program Inc, 9740 Conant Ste 5, Hamtramck | (248) 726-0127 (own site). SAMHSA's 248-914-3211 is not on the site | https://focusprograminc.com/contact-us/ (© 2026) |

## Held for a person

### New rows: ready to append to `data/seed/to-verify.csv`

```csv
"Life Challenge Ministries / Life Challenge Mental Health Services, 17667 Pierson St","Own site (lcministries.org/maps/, (c) 2026) shows 17667 Pierson and 313.531.0111. But the admissions page requires an entrance fee, and the induction-fees page says the program costs $1,200 unless other arrangements are made. The site never says whether Medicaid (SAMHSA's code) covers the licensed residential program. The site doesn't say whether the Pierson campus is for men or women (there is a separate 'Women Campus' link, and aggregators disagree). Christian program. Decide whether to list it and what cost to show",https://lcministries.org/maps/
"Spiritual Israels Community Outreach Program / Choice Community Housing and Outreach Agency, 2727 2nd Ave Ste 108","No website of its own found. Known only from SAMHSA's directory and aggregators. A person must call 313-965-7880",https://findtreatment.gov/
"Kim Logan Communication Clinic, 3011 W Grand Blvd Ste 423","Own site (drkiminspires.com, (c) 2023) is a private counseling practice's personal-brand site: it takes private insurance, sliding scale $95-$225 per hour, no Medicaid. It names 'substance abuse treatment' only for 'athletes, parole and probationary offenders'. Not free or clearly low-cost. Probably should not be listed",https://www.drkiminspires.com/contact-dr-kim-logan-communications-detroit-mi.html
"Salvation Army Harbor Light, 3737 Humboldt St (SAMHSA listing)","SAMHSA gives 3737 Humboldt and 313-361-6136. Harbor Light's own page gives 3737 Lawton Street and 313-556-5555, which is already listed. This is very likely the same campus. Do not add a second row unless a person finds a separate program at Humboldt",https://www.salvationarmyusa.org/mi/monroe/n-monroe-street/harbor-light/
"Positive Images outpatient, 4875 Coplin St","Own site gives only 13336-13340 E Warren Ave and 313-822-6940. It never mentions 4875 Coplin or 313-822-1148 (SAMHSA). The Positive Images address conflict is already held",https://www.positiveimageinc.org/
"Emmanuel House (men's residential, likely veterans), phone only","Its old site emmanuelhouseforvets.org now redirects to a gambling spam site (coolbeanzcoffeehouse.com). emmanuelhouserecovery.org returns an empty page. There is no current page of its own with a phone. SAMHSA lists no address, so any line would be phone only. Never use the aggregator address. Do NOT link either domain",https://findtreatment.gov/
"Jefferson House (Capuchin Soup Kitchen men's residential), phone only","cskdetroit.org returns 403 to our honest UA, so it was not read. A person should open https://www.cskdetroit.org/en/services-offerings/jefferson-house/ in a browser. If that page prints 313-331-8900, add a phone-only line, and add the address only if Capuchin's own page publishes it (aggregators say 8311 E Jefferson)",https://www.cskdetroit.org/en/services-offerings/jefferson-house/
```

### Already held in `data/seed/to-verify.csv`: do not append again (re-checked 2026-09-19, still unresolved)

| Staged row(s) | Existing hold | Re-read result |
|---|---|---|
| Detroit Recovery Project, 1145 W Grand Blvd | "Detroit Recovery Project, Westside" | Still prints "313-824-8900" in the appointment sentence and (313) 324-8900 next to "Westside" and 1145 West Grand Blvd in the footer. The page does not settle it. |
| Positive Images Residential I, Residential II (13336 E Warren), outpatient (13340 E Warren) | "Positive Images women's residential, 13336-13340 E Warren" | Own site (© 2023-2026) still prints only 13336-13340 E Warren and 313-822-6940. It doesn't address the 700 E Grand Blvd conflict. /locations is 404. SAMHSA's 822-1138, 822-1135 and 822-1135 x101 are not on the site. |
| Star Center, 13575 Lesure | "S.T.A.R. Center methadone clinic" | Still no street address on starcenterinc.org (© 2025). New fact for whoever calls: the page says "$65/Week". |
| Metro East, 13929 Harper | "Metro East Drug Treatment" | The page is still script-only. WebFetch sees only "Do Not Sell or Share My Personal Information". |
| DRMM Christian Guidance Center, 19211 Anglin | "DRMM Christian Guidance Center and Genesis House III" | Still conflicts. The locations page says "All Male and Female Facility". The support-services page says "Target Population: Men". SAMHSA's 313-263-0077 x4013 matches the "Addiction Helpline (313) 263-0077" but not the extension. |
| Wayne Health Tolan Park, 3901 Chrysler | "Wayne Health Tolan Park Methadone Clinic" | Same as before. The page gives "3901 Chrysler Dr, Suite 1A" and only the system line (877) 929-6342. It does not give 313-993-3964. A person could decide to list it with the 877 line. |
| VA John D. Dingell, 4646 John R | "VA Detroit substance use care" | 313-576-1000 still appears only in `va-telephone` attributes. The page text doesn't mention the opioid clinic. Veterans only: say so in eligibility if it is ever listed. |
| Nardin Park, Sunshine, Institute of Supportive Services | their three rows | Still no website of their own. The methadone clinics stay held. |
| Romancare, 9600 Dexter | "Romancare Health Services" | Still Facebook only, with provisional OTP certification. |

## Link-outs
None.

## Hotlines
None. The NCADD home page shows DWIHN's number 1-800-241-4949 correctly. Per the DWIHN rule, it is still not copied from a provider page.

## Updates to existing rows
None.

## Counts
- Staged rows: 22
- Lines written: 2 (NCADD Vantage Point West, Focus Program Hamtramck)
- Held: 20 staged rows. 7 are new to-verify lines. 13 are already covered by 11 existing to-verify rows (3 Positive Images rows share one).
- Link-outs: 0
