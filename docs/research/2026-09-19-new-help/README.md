# New kinds of help: research and entry, 2026-09-19

Kyle asked for job training and job-finding help ("Detroit at Work is one. SER in southwest Detroit does training. I don't know the whole landscape now, and I want it researched"), then for drug and alcohol treatment people can check into voluntarily, then for everything on the list of other gaps ("I want to do all of these"). This folder holds the research and the entry notes; DECISIONS.md holds the rules that came out of it.

**How it was done.** Eleven research passes, one per topic, read each organization's own pages with an honest user agent (`313help-research; open-source civic directory`). Aggregators and news were used only to find names. No staff names, emails or direct lines were recorded. A page that refused scripts was not worked around; it is marked for a person's browser check. Then four entry passes turned verified candidates into `data/seed/incoming/2026-09-19-*.txt` lines, and `pnpm check:sources` published only the rows whose phone number and street number it found on the owner's page.

**Result.** 132 new listings entered; **128 matched their own page** and are active, 4 wait for a person (a phone printed only in a PDF or on another page). **173 candidates are held** in `data/seed/to-verify.csv` (tagged `[2026-09-19 new kinds of help]`), each with the reason. **88 link-outs** (programs you apply for online) and **4 new urgent numbers** (SAMHSA, the DWIHN Care Center walk-in, Avalon, VOICES4), each matched on its owner's page.

| New listings | Count |
|---|---|
| Help finding a job (`jobs.find`) · Free job training (`jobs.training`) | 21 · 11 |
| GED, diploma, reading (`learn.school`) · English classes (`learn.english`) | 11 · 16 |
| Treatment: detox · live-in · at home · medicine for opioid addiction | 2 · 5 · 4 · 3 |
| Help after sexual assault (`assault`) | 2 |
| Rent and eviction (`housing.rent`) · Homeowners (`housing.owner`) | 4 · 5 |
| Free legal help · IDs | 11 · 2 |
| Free tax help · Help signing up for benefits | 5 · 7 |
| Dentist · Eye care · Child care · Clothes · Baby things · Day centers · Computers and internet · Pets | 6 · 1 · 1 · 2 · 1 · 2 · 3 · 3 |

## Files

| Topic | Research | Entry notes (held rows, link-outs, hotlines, updates to existing rows) |
|---|---|---|
| Public job system: Detroit at Work, SEMCA Michigan Works!, unemployment, state programs | [jobs-1-public-system.md](jobs-1-public-system.md) | [entry-jobs.md](entry-jobs.md) |
| Community training: SER, Focus: HOPE, MiSide, Goodwill, trades, unions | [jobs-2-community-training.md](jobs-2-community-training.md) | ″ |
| Groups: people with a record, youth, disability, 55+, veterans, immigrants | [jobs-3-specific-groups.md](jobs-3-specific-groups.md) | ″ |
| GED, reading, English, computer classes, colleges, libraries | [jobs-4-school-ged-english.md](jobs-4-school-ged-english.md) | ″ |
| Treatment places | [treatment-1-places.md](treatment-1-places.md) | [entry-treatment.md](entry-treatment.md) |
| Treatment system, data, licensing, scams, wording | [treatment-2-system-and-data.md](treatment-2-system-and-data.md) | ″ |
| Rent, eviction, homeowners | [housing.md](housing.md) | [entry-housing.md](entry-housing.md) |
| Legal help and ID documents | [legal-and-id.md](legal-and-id.md) | [entry-legal-id.md](entry-legal-id.md) |
| Sexual assault, free tax help, benefits help | [assault-tax-benefits.md](assault-tax-benefits.md) | [entry-assault-tax-benefits.md](entry-assault-tax-benefits.md) |
| Clothing and baby needs, day centers, phones and internet | [clothing-dropin-phones.md](clothing-dropin-phones.md) | [entry-basics.md](entry-basics.md) |
| Dentist and glasses, child care, rides, pets | [dental-childcare-rides-pets.md](dental-childcare-rides-pets.md) | [entry-dental-care-rides-pets.md](entry-dental-care-rides-pets.md) |

## The landscape in brief

- **Jobs.** Detroit is served by DESC / **Detroit at Work** (7 career centers on its own locations page, one line: 313-962-WORK; SER runs the Michigan Ave center in Southwest Detroit). **Dearborn, Hamtramck and Highland Park are served by SEMCA Michigan Works!** (job centers on Schaefer Rd in Dearborn and Manchester St in Highland Park). Training is paid for with WIOA vouchers (Detroit at Work caps them at $6,000 a year) or by nonprofits: Focus: HOPE, MiSide (Southwest Solutions' new name), Greening of Detroit, Goodwill, Per Scholas; unions open apprenticeship windows a few times a year. Closed: Skills for Life, JumpStart, Learn to Earn's pay, the 2835 Bagley center, Build Institute (paused), Ford's Southwest center at the Mercado.
- **School.** DPSCD adult ed now enrolls through Detroit at Work and an online form; its career-tech centers take high school students only. WCCCD runs free GED prep; Dearborn Adult Ed runs English classes at 10 sites. Reading Works, the old literacy network, is gone; its member centers (Siena, Dominican, All Saints, Mercy Education Project) still run.
- **Treatment.** DWIHN is the front door for all four cities (800-241-4949, 24/7). Walk in any hour: Salvation Army Harbor Light (detox), DWIHN Care Center (crisis, not detox), Team Wellness's crisis unit (held: two phones). **Dearborn and Hamtramck have no detox or live-in treatment**; Highland Park has Elmhurst's women's home and Rainbow's methadone clinic. No emergency room publishes a buprenorphine start program; no methadone clinic publishes new-patient intake hours.
- **Housing.** No general rent money is open in the four cities today. Detroit's Right to Counsel (free eviction lawyer, Detroit cases only) and UCHC (moved to 300 River Place) are the main doors; Lakeshore Legal Aid's Dearborn office is the only walk-in legal office found. Section 8 lists are all closed.
- **Sexual assault.** The old Wayne County SAFE program is **Avalon Healing Center**; it asks survivors to call first and doesn't publish its exam sites.

## Waiting on a person

- **Kyle:** the three Open rows in DECISIONS.md (call DWIHN; SAMHSA's directory as a staged source; Wayne County's naloxone map).
- **Stewards, before first publish:** call Sobriety House, Mariners Inn (sites last updated 2024) and CLASS (2022); enter Detroit at Work's 2026 closure days (listed in the jobs incoming file's header); pull nothing by hand for the dated links, since `until` hides them. Check `to-verify.csv` rows tagged `[2026-09-19 new kinds of help]`, starting with SER Metro-Detroit, UCHC, the Wayne County Clerk (birth certificates), Team Wellness, Passenger Recovery (Hamtramck's only walk-in recovery center), CEO Detroit, Comcast Internet Essentials and RAINN.
- **Updates to places already listed** are in each entry file's "Updates to existing rows" table (e.g., CHASS dental and treatment, American Indian Health's outpatient treatment, NOAH's mail service, the ACCESS benefits rows). None was applied: each changes an active row, so a person reads the page first.
- **Re-check dates:** Accounting Aid Society's fall tax sites end 2026-10-16 (schedules carry `valid_to`); 2027 tax sites in January; Ride to Rise (free student bus rides) around 2027-02-13; Detroit Promise reopens November 2026; GDYT summer jobs sign-up in spring 2027.
- **detroitmi.gov answered scripts normally on 2026-09-19**, unlike the day before. Keep the browser fallback; it may come and go.
