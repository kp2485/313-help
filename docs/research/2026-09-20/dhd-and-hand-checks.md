# The hand checks, done in a browser (2026-09-20)

> **Read this first — the summary table below is out of date, and the later sections of this same file supersede
> it (2026-09-20, later the same day).** This write-up was begun while `detroitmi.gov` was still blocking every
> attempt, and its "The short version" table and section 1 record that state: 38 rows blocked, 0 DHD import lines
> written, `health.dhd` empty, the shelter line unread. **All four of those are now wrong.** What actually
> happened, later the same day: **Kyle passed the bot challenge himself, in his own Chrome**, and asked for that
> session to be used one page at a time; **all 38 blocked rows were read** and set `status: active`,
> `entry_method: web`; that produced **24 live `health.dhd` listings** and one `transport` listing; and the
> shelter line **866-313-2520 matched** its own page. The rest of this file — every "read, page by page" section
> below — is the record of that work and is current. The stale table is left in place rather than rewritten,
> because a research note that gets quietly edited stops being evidence. See DECISIONS 2026-09-20, "Rows whose
> own site refuses scripts were read in a browser".
>
> One more thing to know about who did the reading: the browser reads were done by **an AI agent driving a
> browser, with Kyle approving the results as steward**, except the `detroitmi.gov` pages, whose human check was
> Kyle's own. No machine clicked a challenge, submitted a form or accepted a banner.

What this was: the worksheet `docs/CHECKS-2026-09-19.md` asks for "a person with a browser" to read pages
our scripts cannot. On 2026-09-20 those pages were opened in the built-in browser and read as text. Only the
organisation's own page counted. No form was submitted, no cookie banner was accepted, no bot challenge was
solved, and no staff name, email or direct line was copied down, even where a page printed one.

Nothing in `data/seed/` was changed by this pass. Every difference below is written up for a steward.

## The short version

| | Count |
|---|---|
| Rows read and matching (`ok`) | 10 |
| Rows read with a difference for a steward | 7 |
| Rows blocked by a bot challenge | 38 |
| DHD import lines written | 0 |

Blocked = the 18 DHD program rows (section 3), the 19 detroitmi.gov listing rows (section 2), and the
shelter-line row (section 1). All 38 are the same single cause.

## 1. detroitmi.gov: blocked, and that is the whole of sections 1, 2 (detroitmi part) and 3

Every detroitmi.gov address tried returned Cloudflare's "Performing security verification" interstitial with
an interactive **"Verify you are human"** box, and the page title "Just a moment...". Tried:

- `https://detroitmi.gov/departments/detroit-health-department`
- `https://detroitmi.gov/departments/detroit-health-department/programs-and-services`
- `https://detroitmi.gov/departments/housing-and-revitalization-department/homelessness`

The challenge was waited out twice (about 30 seconds in total) and retried three times across the session.
It never cleared by itself. **The box was not clicked.** That rule is not negotiable and it is also the
project's own rule: we identify our requests honestly and, when a site blocks them, a person checks by hand
rather than a machine disguising itself.

So on 2026-09-20 nothing was read from detroitmi.gov. Consequences:

- **`health.dhd` is still empty.** No DHD program page was opened, so `data/seed/incoming/2026-09-20-dhd-programs.txt`
  carries no import lines — only a note saying why. The 14 held rows and the conversion notes in
  `docs/research/2026-09-19-new-help/entry-dhd.md` stand unchanged.
- **The shelter line 866-313-2520 is still unread since 2026-09-18.** The number was not touched.
  `data/seed/emergency.csv` was not edited.
- The 19 recreation-centre, wellness-centre, Lifeline and HelpLine rows keep the phones, addresses and hours
  they already had.

What would fix this: a person opening these pages in their own everyday browser, where the challenge is not
aimed at them, and filling in section 3 of the worksheet. A machine cannot honestly get past it, and should
not try.

## 2. What was read, page by page

### Wayne Metro (waynemetro.org) — 5 rows, 2 ok, 3 with an hours difference

The site answers a browser normally (it gave our script HTTP 403).

The **Connect Center** row matches word for word: "Call Our Connect Center: (313) 388-9799 / Monday - Friday:
8am-6pm / Saturdays: 9am- 12pm". The home page also carries a standing banner that wait times are longer
than normal.

The location directory splits its sites into two groups, and our four walk-in rows do not follow that split:

- Under **"WAYNE METRO SERVICE CENTERS / OPEN TO THE PUBLIC MONDAY-THURSDAY 8:30AM - 12:00PM & 1:00PM - 5:00PM /
  WALK-INS WELCOME!"**: the Welcome Center (7310 Woodward, Suite 114, 48202) and Dresner (3700 Gilbert St, 48210).
  Both addresses match ours.
- Under **"ACCESS WAYNE METRO AT ADDITIONAL LOCATIONS ... *appointment only"**: the East Client Service Center
  (5555 Conner St, 48213, "Inside the Ford Wellness Center at the Samaritan Center") and the West Client
  Service Center (18100 Meyers Rd, 48235, "Inside the Northwest Activities Center"). Both addresses match
  ours, but **neither is a walk-in site on the page**, and our rows give both the Monday-Thursday walk-in
  hours. For a steward: those two rows should probably lose their schedule and say appointment only, and may
  be worth the "inside ..." note so people can find the door.

One more thing for a steward: Wayne Metro's own two pages disagree. The home page says the walk-in block is
**Monday - Friday** 8:30am-12:00pm & 1:00pm-5:00pm; the location directory says **Monday-Thursday**. Our rows
say Monday-Thursday. Somebody should call before we print either.

### Capuchin Soup Kitchen (cskdetroit.org) — 4 rows, 3 ok, 1 gains hours

Meals at Conner and Meldrum match exactly, down to the dinner sitting being Monday to Friday with no dinner
on Saturdays. Showers at Conner match exactly.

Two things are new on their pages:

- The shower page now also lists **Meldrum Community Center, 1264 Meldrum St, (313) 579-2100 ext. 4217,
  Mondays, Wednesdays and Fridays 9:00 a.m. to 1:00 p.m.** We have no row for it. A steward may want one.
- The food-pantry page now gives hours for the Capuchin Services Center: **Monday - Friday 8:30 a.m. - 4:00 p.m.**
  Our row is call-first with no hours. The same page says a first appointment is needed for a needs
  assessment, and after that people can come back and shop the shelves; fresh produce is unlimited.

### YWCA Interim House (ywcadetroit.org) — 1 row, ok

"YWCA INTERIM HOUSE CRISIS LINE / 313-861-5300 / Available 24 hours a day, 7 days a week", and the same
number in the site header. The page also says a caller does not need to be in immediate danger. No address is
recorded for this row, which is right for a DV line; the only address the page gives is an administrative
office.

### St Raymond-Our Lady of Good Counsel (straymondolgc.org) — 1 row, **address differs**

The pantry facts match: "St Raymond Christian Service parish pantry is open Tuesdays 9:30 -11:00. In the
Community Center", and the parish office number 313-527-0525.

The address does not. The parish's own contact page prints **20103 Joann, Detroit, Michigan 48205**; our row
says **20055 Joann**. Not rewritten here — a steward decides. Worth noting that the pantry is "in the
Community Center", which may be a different building from the church office, so the right answer may be
neither number without a call.

The home page also prints a second number "for more information", attached to a parish volunteer role. Not
recorded: it is a person's line, not a public one.

### Islamic Center of Detroit (icdonline.org) — 1 row, ok

"Day/Time: Saturdays from 2 PM - 5 PM / Location: ICD - Islamic Center of Detroit - 14350 Tireman, Detroit,
MI 48228", and "Call us +(313)584-4143". Everything matches.

### Scott Memorial UMC (scottumc.org) — 1 row, ok, with eligibility to add

Phone (313) 836-6301 and 15361 Plymouth Road, Detroit 48227 both match. There are still no pantry days or
times on the page, so call-first is correct. New: the page says the food pantry "provides emergency food
assistance to residents within the following zip codes: 48227, 48228 and 48204".

### Brightmoor Artisans Collective (brightmoorartisans.org) — 1 row, **address wording differs**

`/contact` (HTTP 404 to our script) opens fine in a browser and shows "(313) 437-1057". The pantry's own page,
`https://brightmoorartisans.org/bmoor-nourished-free-pantry`, shows "Open Year Round / Friday 3:00 pm - 4:30
pm" and "Location: 22735 Fenkell **Ave.** Detroit MI 48223". Our row says "22735 Fenkell **St.**"

Two suggestions for a steward: move `source_url` to the pantry page (it carries the hours and the address,
and `/contact` carries only the phone), and consider the page's own plain-language facts — no ID or
registration, bring your own bag, there is usually a line at opening so come early, the pantry closes early
when supplies run out, and you may send a friend or neighbour to pick up for you.

## 3. The four held rows

All four were read, and three can simply be released by a steward.

**Corpus Christi emergency food** — released. The food-depot page opens fine in a browser and shows the
phone twice (313.537-5770 in the pantry text, 313.537.5770 in the address block), the address
19800 Pembroke Ave, Detroit, MI 48219-2145, that it is by appointment, and the service area (Hubbell east,
Telegraph west, Seven Mile south, Eight and a Half Mile north). The office hours on that page
(Mon/Tue/Thu/Fri 9am-4pm, closed Wednesday) belong to the parish office, not the pantry, so call-first stays.

**God's Storehouse** — released, and both of Kyle's questions are answered. The contact page prints
**313-867-1234** twice ("Call Us" and "CALL NOW"), so it is genuinely their published number and not a
sample, and gives "Location 18301 John R, Detroit MI 48203". The ministries page says "Grocery Distribution —
Every Tuesday & Saturday ... No income verification required — just come." One caution: the page gives no
time of day, and it does not actually say the groceries are handed out at 18301 John R — that is the
ministry's contact address. Call-first should stay. The same page lists hot showers on Tuesday mornings with
"call 313-867-1234 for location", which could be a second listing.

**Food Hub at St. Cunegunda** — released. The PantryNet entry reads, in full for our purposes:
name "Food Hub at St. Cunegunda", phone "(313) 963-8880", address "5900 St. Lawrence Street, Detroit, MI
48210", appointment required, and every day in its hours object empty. That is exactly what our row says.
The hold was only the matcher's inability to handle a street beginning with "St."

**Cherry Hill Helping Hand** — address confirmed, but **the church's site contradicts itself on eligibility**.
The home page prints "24110 Cherry Hill Road / Dearborn, MI 48124" and "313 - 563 - 4800" as plain text (the
split-word page code is only on the ministry page), so our address and phone are right. Both pages agree on
first and third Wednesday, 9:30 a.m. to 12:00 noon, that weather or a church event can close it ("best to
call ahead"), and one person per household. But:

| | Ministry page | Home page |
|---|---|---|
| Identification | "No financial information or identification is required" | "a picture I.D. is required" |
| How often | "once per month" | "once every other month" |
| Zip codes | "open to anyone ... regardless of zip code" | not stated |
| First visit | not stated | "If it is your first time, please come before 11:30 a.m." |

We should not print either rule until somebody asks the church which is current. Getting this wrong sends
someone across town for nothing, or tells them to bring an ID they do not have.

## 4. What a steward has to decide

1. **The two Wayne Metro client service centres** (East, West): appointment only on the page, walk-in hours in
   our data. Which is right?
2. **Wayne Metro walk-in days**: Monday-Thursday or Monday-Friday? Their own two pages disagree.
3. **St Raymond**: 20055 or 20103 Joann, and is the pantry at the church address or the Community Center?
4. **Brightmoor**: Fenkell Ave, not St; and move `source_url` to the pantry page.
5. **Cherry Hill**: ID or no ID, monthly or every other month.
6. **Capuchin Services Center**: add Monday-Friday 8:30-4:00 and "first visit by appointment".
7. **Scott Memorial**: add the 48227 / 48228 / 48204 eligibility.
8. **Three new listings worth having**: Capuchin shower program at Meldrum (Mon/Wed/Fri 9-1), God's Storehouse
   showers (Tuesday mornings, call for location), and possibly nothing else — everything else read today was
   already listed.
9. **Release the holds** on Corpus Christi, God's Storehouse and St. Cunegunda.
10. **detroitmi.gov**: 38 rows still need a person on an ordinary browser. That includes the shelter line and
    the whole DHD programme list. This is the one thing in the worksheet that a machine cannot finish.

---

# Second pass, same day (2026-09-20)

The coordinator sent a second browser list: the pages in `er-urgent-care.md` and `backlog.md` that refuse
scripts. detroitmi.gov was skipped on purpose this time — Kyle is doing that himself. Same rules: owner's own
page only, no bot challenge touched, no form submitted, no staff name, email or direct line recorded.

Written by this pass: **10 import lines** in `data/seed/incoming/2026-09-20-browser-read.txt`, and this
section. Nothing was imported, checked, geocoded, built or committed.

| | Count |
|---|---|
| Pages read that yielded a listing | 10 |
| Questions answered without a listing | 4 |
| Sites that still could not be read | 2 |
| Blocked by a bot challenge | 0 |

Not one bot challenge appeared in this pass. Every site the earlier scripted runs recorded as "403 / blocked"
— dmc.org, childrensdmc.org, concentra.com, ceoworks.org, waynecountymi.gov, va.gov — opened normally in a
browser. What stopped the scripts was refusal of automated requests, not a challenge a person has to clear.

## The DMC hospitals, and which one has the ER

DMC keeps **two** pages per hospital: the hospital page and a separate "… - Emergency" page. This matters,
because the hospital pages for Detroit Receiving and Harper print, under a heading that just says "Hours",
only *"Visiting hours are from 8 a.m. until 8 p.m."* Taking that as the ER's hours would tell someone the
emergency room shuts at eight. Each **- Emergency** page prints "Monday: Open 24 hrs … Sunday: Open 24 hrs",
and those are the pages the lines use.

| ER | Address | Phone | Does its own page say 24 hours? |
|---|---|---|---|
| DMC Detroit Receiving Hospital - Emergency | 4201 St. Antoine Boulevard, Detroit, MI 48201 | 313.745.3000 | Yes, all seven days |
| DMC Harper University Hospital - Emergency | 3990 John R Street, Detroit, MI 48201 | 313.745.8040 | Yes, all seven days, plus "delivers care 24/7" and "walk-in emergency room" |
| DMC Sinai-Grace Hospital - Emergency | 6071 W. Outer Drive, Detroit, MI 48235 | 313.966.3300 | Yes, all seven days, plus "around-the-clock care" |
| Children's Hospital of Michigan - Emergency | 3901 Beaubien Boulevard, Detroit, MI 48201 | printed only as "(313) 745-KIDS" | Yes, all seven days |

**Harper or Hutzel?** DMC's own location list tags Detroit Receiving, Harper, Sinai-Grace, Children's and
Huron Valley-Sinai as "Emergency". **DMC Hutzel Women's Hospital is tagged "Hospital" only.** Hutzel shares
Harper's address (3990 John R Street) and phone, and its hospital page happens to print "Open 24 hrs" for
every day, but DMC does not call it an emergency room. So: **Harper is the ER at 3990 John R; there is no
Hutzel line.** The other two DMC ERs (Huron Valley-Sinai, Commerce Township; Children's Troy) are outside the
service area.

**The Children's phone.** The hospital prints its number nowhere as digits — only "(313) 745-KIDS", on the
location list, the hospital page and the ER page alike. Converting the letters would be our arithmetic, not
their published number, so that line carries the address and **no phone**, with a notice saying why. A
steward can add the digits after one call.

## John D. Dingell VA Medical Center

The address (4646 John R Street, Detroit, MI 48201-1916) and the facility hours ("Mon: 24/7" through "Sun:
24/7") are plain text. The emergency-care section says, in the VA's own words, **"The John D. Dingell Medical
Center emergency department is open 24/7 including holidays"**, "Visit our office, walk-in visits only" and
"A referral is not required".

The phones are the catch the earlier pass found, and the browser does not fix it the way we hoped: va.gov
renders every number through a `<va-telephone>` custom element, which stayed unrendered here, so the page
shows "Main phone: ," with nothing between. The numbers *are* in the page's own markup, as attributes:

| What the page labels it | Number in the page's markup |
|---|---|
| Main phone | `contact="3135761000"` |
| VA health connect | `contact="8339401624"` |
| Emergency Department - Primary | `contact="3135764436"` |
| Emergency Department - Secondary | `contact="3135764437"` |

That is the owner publishing the number, so the line uses the emergency department number with the main line
as a second number. **But no automatic check will ever confirm it**: `check:sources` looks for the number as
text and will not find it in any form we write. The line carries a notice saying so, and a steward should
confirm by phone before it goes live. This one is worth a call rather than a click.

## Urgent care, and the three that are not

**Concentra Downtown Detroit** reads fine in a browser. 2630 East Jefferson Ave., Detroit, MI 48207,
313.259.7990, and the centre is labelled **"WALK-IN CLINIC"** with "Urgent Care" among the services listed.
Hours: Monday to Friday 7 a.m.–6 p.m., Saturday 10 a.m.–2 p.m. It is occupational health first, so the line
says "It is mainly a work-injury clinic" and a steward may still prefer to drop it. The address and phone
Wayne State's referral list gave are confirmed by Concentra's own page.

**City Urgent Care Detroit — still unreadable, and not a block.** `cityurgentcaredetroit.com` gives a
Cloudflare **DNS resolution error** over http and does not load over https. The domain does not resolve. No
listing, and it may not exist any more.

**Team Wellness Center — not urgent care, and it settles our address conflict.** The site opens at
`teamwellnesscenter.com`. Its services page lists primary care, mental health, family and child services,
substance abuse (a Suboxone clinic), dental, crisis stabilization, and health and social services. **Nothing
on it says urgent care or walk-in**, so no `health.urgent` line. But it answers the held question in
`empty-categories.md` outright:

> **Team East Clinic — 6309 Mack Ave., Detroit, MI 48207, (313) 331-3435, 24/7**
> **Team Jefferson — 11105 E Jefferson Ave., Detroit, MI 48214, (313) 332-0257, Mon–Fri 9:00AM–5:00PM**

Our row `sal_team_east_clinic` says "Team East Clinic, 11105 Jefferson Avenue". On Team Wellness's own site
that address belongs to **Team Jefferson**, and it keeps ordinary weekday hours; Team East is the 24/7 site on
Mack. **A steward has to fix one of the two**, and it matters: the row we publish as a 24-hour door points at
a building that closes at five.

**The Wellness Plan — still will not load.** `thewellnessplan.org` did not load in the browser either, with
or without `www`, over http or https. Same result as the script. Our existing
`sal_the_wellness_east_medical_center` row is untouched; nothing new can be said about it until the site is
back.

## Wayne County: the Clerk's counter, settled

The County's site opens fine in a browser. `waynecounty.com` really is retired, but
`waynecountymi.gov/Services/Records/Birth-Certificates` is live and answers every question in the brief:

| Question | The Clerk's own page |
|---|---|
| Address and suite | **400 Monroe Street, Suite 605, Detroit, MI 48226.** The "640 Temple Street, Suite 625" hint was wrong. Births *outside* the City of Detroit are Suite 610 in the same building |
| Public phone | **(313) 967-6938** |
| Counter hours | Mon, Tue, Wed and Fri 8:00 AM – 4:00 PM; Thursday 8:00 AM – 7:00 PM; **closed for lunch 12:00–1:00 PM, Monday–Friday** |
| Fee | $24 first certified copy, $7 each additional copy of the same record. Age 65+ buying their own: $2 first, $3 each additional. Mail: money order or certified cheque, no personal cheques |
| ID required | Driver's licence or state ID. If you have neither, **two** other pieces of ID that require a signature — social security card, voter registration card, passport, school ID, work ID. ID must be presented at the time of the request |
| Fee waiver for someone without housing | **The page states none.** Not "no" — simply nothing on the page. Worth asking the Clerk |
| Same-day service | Not stated. In-person is **appointment only**, through the County's eScheduler |

**A difference to note:** our held row carried 313-224-0270, which came from the City's page. The Clerk's own
page gives (313) 967-6938. The line uses the Clerk's number.

**Wayne County Veterans Services** also reads fine: International Center Building, **400 Monroe St. Suite
405**, Monday–Friday 8:00 a.m.–4:30 p.m., office phone **(313) 224-5045**, and a list of what they can help
with — food, furniture, moving costs, utilities, rent, mortgage, property taxes, emergency home repairs, car
repairs and payments, burial. The page is careful to say it does **not** handle VA medical or disability
benefits. Listed as `money.benefits` with the `veterans` flag. The Garden City satellite is outside the
service area.

**Wayne County Prosecutor, Victim Services Unit — read, nothing to list.** The page describes the service
well (court help, referrals, PPO instructions, help preparing to testify, notification of court events, all
at no charge), but the **only** contact it prints is the unit's director by name, with her direct number and
her email. We never publish a staff name, direct line or email, and there is no public unit number or counter
address on the page. The hold stands. Somebody could ask the Prosecutor's office for a public line.

## CEO Detroit

Opens fine. **7310 Woodward Ave., Suite 701B, Detroit, MI 48202**, **(313) 752-0680**, "Hours: Monday through
Friday, from 8:30AM to 4:30PM". Eligibility, in CEO's own words, is "exclusively to people recently released
from incarceration".

**Paid daily: yes, and plainly.** The model page says participants get "up to four days a week of
transitional work on a crew and daily pay", and "At the end of every shift, participants are paid". There is a
paid orientation first, four days a week on a crew, job coaching on the days they are not working, and a year
of support after a full-time job starts.

**Referral or walk-in: the page does not say.** Neither the Detroit page nor the model page states how a
person starts. The Detroit page offers only an email address for would-be participants, which we do not
publish. The line says "call first" and the notice records the gap honestly rather than guessing.

Incidentally, CEO Detroit is at 7310 Woodward — the same building as Wayne Metro's Welcome Center and the
Mission Cafe from the first pass. Three listings, one address, different suites.

## ACCESS and Ruth Ellis

**ACCESS Dearborn — no harm-reduction page exists to read.** The behavioral health page describes counselling,
psychiatry, case management and peer support, and lists its programmes; the public health page lists a
"Substance Use and Tobacco Prevention/Cessation Program" by name only. Searching both pages for naloxone,
Narcan, opioid, overdose and harm reduction returns **nothing**. Neither page gives a street address or a
site phone for that programme. So ACCESS hosts a 24/7 Well Wayne Station, but says nothing about it on its
own site: no listing, and the hold in `empty-categories.md` stands unchanged.

**Ruth Ellis Health & Wellness Centers — listed.** The page was found through the site's own sitemap
(`/what-we-do/health-and-wellness-centers/`; the site's menu is drawn by code and carries no link to it). It
describes integrated clinics run with Henry Ford Health for ages 13 to 30: primary care, checkups, shots,
hearing and vision screening, STI and HIV prevention, testing and treatment, gender-affirming care including
hormone therapy, psychiatric evaluation, and therapy. The sentence that makes it a `health.clinic` is theirs:
**"There are no out-of-pocket costs for doctor visits, lab work, or medications."** No harm reduction is
named anywhere, so the station hold stands there too. The page gives no clinic hours and no separate address
for the second centre inside the Ruth Ellis Clairmount Center, so the line carries the centre's own address
and phone (95 Victor Street, Highland Park, 313-252-1950) and says call first.

**Wayne Metro walk-in days** were answered in the first pass and the answer has not changed: the location
directory says **Monday–Thursday**, the home page says **Monday–Friday**, and only a call will settle it.

## What a steward has to decide, from this pass

1. **`sal_team_east_clinic` points at the wrong building.** 6309 Mack is Team East and is 24/7; 11105 E
   Jefferson is Team Jefferson and closes at five. Fix before the next publish.
2. **The Clerk's phone** changes from 313-224-0270 (the City's page) to 313-967-6938 (the Clerk's own).
3. **Children's Hospital of Michigan ER** has no dialable number until somebody rings 745-KIDS and writes the
   digits down.
4. **The VA's numbers** can never pass an automatic check. Confirm by phone, then set the row by hand.
5. **Concentra**: list an employer-health walk-in clinic, or not?
6. **`health.er` and `health.urgent` still are not on any screen.** The taxonomy in docs/03 now carries both,
   but until `apps/web/src/needs.ts` and the iOS copy query them, these ten rows go nowhere a resident can
   see. That is the same gap `health.dhd` has.
7. **Ask the Wayne County Clerk** whether any fee waiver exists for a person without housing. A $24 birth
   certificate is a wall for exactly the people who need one to get an ID, a job or a bed.

# detroitmi.gov, read in Kyle's Chrome (2026-09-20, second pass)

Kyle passed detroitmi.gov's human check himself, in his own Chrome, and asked for that session to be used.
Every detroitmi.gov page below was then opened in that one tab, one at a time. **No challenge was clicked, no
form was submitted, nothing was signed into, and no cookie banner was accepted.** Only City of Detroit pages
were opened. No staff name, email or direct line was copied down, even where a page printed one (the vision
and hearing contact block prints a named person's address; the lead, behavioral health and food safety blocks
print team mailboxes).

That closes all 38 rows the first pass had to leave blocked.

| | Count |
|---|---|
| detroitmi.gov rows read today | 38 of 38 |
| of those, matching our data (`ok`) | 17 |
| of those, with something new or different for a steward | 3 |
| the shelter line | **match** |
| DHD program worksheet rows filled | 18 of 18 (two of them by finding the programme no longer exists) |
| import lines written | 24 (`health.dhd` × 23, `transport` × 1) |

## 1. The shelter line matches

`https://detroitmi.gov/departments/housing-and-revitalization-department/homelessness` prints
**866-313-2520**, twice, which is exactly what `data/seed/emergency.csv` publishes. `emergency.csv` was not
touched — a match is recorded here and in the worksheet, and a steward decides what, if anything, changes.

The page adds hours our HelpLine listing does not have: the line runs "during business hours Monday-Friday
from 8 AM to 6 PM and Saturday 9 AM to 12 PM", and outside those hours the same number reaches Street
Outreach, "from 6 PM to 8 AM on the weekdays and 24/7 on the weekends and all major holidays". The plain
reading for a resident is: it is always worth calling, but before 6pm on a weekday you get housing help and
after 6pm you get an outreach team. A steward should decide the wording; the listing stays call-first until
then, because a schedule that said "open 24/7" would tell someone at 2am they can get a bed by calling, which
is not what the page says.

Three other people's numbers on that page, recorded only as notes: Michigan's Domestic Violence Hotline
1-866-864-2338, 988, and DWIHN's 24-hour Helpline 1-800-241-4949.

## 2. The 19 listing rows: 17 match exactly, 2 have something to decide

Fifteen recreation centres, the WCCCD wellness centre and Tindal all matched their pages **word for word** —
phone, street and every opening block. That is a good sign for the pipeline: those rows came from the City's
own open-data layer and they are still right. Full quotes are in the worksheet.

Small things a steward may want, none of which change a fact a resident relies on:

- **Five pages have been renamed and now redirect**: `/clemente-center` → `/clemente-recreation-center`,
  `/coleman-young-community-center` → `/coleman-young-recreation-center`, `/crowell-community-center` →
  `/crowell-recreation-center`, `/heilmann-community-center` → `/heilmann-recreation-center`,
  `/patton-community-center` → `/patton-recreation-center`. Ours still work, but the source_urls could follow.
  Two of those centres are also **renamed on the page itself** (Coleman A. Young Recreation Center, Patton
  Recreation Center) while their own address block still says "Community Center".
- **Two TTY lines are new**: Butzel Family Center and Coleman A. Young both print "TTY: 711 or 800-649-3777".
  Worth having, given the accessibility rule in CLAUDE.md.
- **AB Ford's park is shut, the centre is not**: "The park is currently closed for the park improvement
  project but the Center will be open normal hours during construction." A person walking to the park would
  want to know; an alert or a line in the listing would carry it.
- A membership is required for programmes at recreation centres (the fee table appears on the centre pages:
  youth 5 and under free, 6-12 $5, teen 13-17 $7, adult 18-59 $25, senior 60 and over no charge). Our rows do
  not say this. It does not stop anyone walking in, so it is a "what" note, not eligibility.

Two rows carry a real difference:

**Lifeline H2O is closed to new applicants.** The DWSD page's top banner: "Enrollment for Lifeline H2O is
currently full. To receive an update when the program is accepting new applications, please complete the form
at lifeline.detroitmi.gov." Customers already enrolled as of June 2026 keep benefits through 30 June 2027 if
they stay current. Our row says none of this. Somebody on a shutoff notice who calls (313) 267-8000 expecting
to sign up today will be told no. The phone and the absence of an address are both right; the row needs a
sentence, and a steward has to write it. (Also on the page, for whoever writes it: the bill is "as low as $34
per month"; eligibility is household income at or below 200% of the federal poverty level, a current DWSD
account and a working meter inside the home; and since February 2026 a past-due balance no longer disqualifies
anyone.)

**The HelpLine listing gains hours** — see section 1.

## 3. The 18 DHD programme rows

All 18 are filled in the worksheet. Two of them are filled by discovering that the programme is not there:

- **Animal care and control** is not on DHD's programmes list at all in 2026. The full list was read from the
  page; there is no animal page under the Health Department. Whatever the D Compassion list said, it would now
  have to come from another City department's own page.
- **Healthy Homes** likewise has no page of that name. The nearest DHD pages are Bed Bugs, Environmental
  Health and Safety, the Childhood Lead Prevention Program, and Water Testing in Schools and Childcare
  Centers.

Three more resolve differently than the worksheet assumed:

- **Vital records are not a DHD service.** DHD's own page says the city "closed its Vital Records Division
  permanently in December 2013" and sends people to the Wayne County Clerk's Birth and Death Records Division,
  400 Monroe Street Suite 605, Detroit MI 48226, 313 224-0270, 8:00 am to 4:30 pm. That belongs under `ids`
  from the Clerk's own page, not from DHD's, so no line was written here. (Another agent's pass this same day
  found the Clerk publishes 313-967-6938; those two numbers should be reconciled by a person.)
- **"Rides to Care" no longer exists under that name.** The page is "Resources and Services for Medical Care
  Transportation", and DHD runs no rides: it points to Medicaid non-emergency medical transportation ("call
  your provider"), 2-1-1, and 313-961-BABY. It is a link-out. The held to-verify row can be closed.
- **Lead Safe Detroit** is DHD's **Childhood Lead Prevention Program**; the old name survives only on the
  satellite centre's page.

### The page that was worth the whole trip

`.../programs-and-services/detroit-health-department-satellite-services-center` is one page listing a dozen
programmes with a phone and a day for each, at one address (5555 Conner St., Suite 2224, Detroit 48213,
(313) 876-4554). It is where **Ceasefire Detroit** finally has a number (313-224-1257, call for an
appointment) and where Children's Special Health Care Services, iDecide Detroit, Infant Safe Sleep, the
961-BABY line, the Fatherhood Program and the Safe Routes Ambassadors Program are all written down. Most of
its clinics run monthly ("Every 2nd Tuesday", "Every 3rd Monday"), so those listings say "call first" and carry
the printed words.

> **Correction, 2026-09-20 (later the same day).** "Which our schedule parser cannot express" was wrong. A
> numbered monthly BYDAY **is** supported: `packages/query/src/schedule.ts` accepts `FREQ=MONTHLY` with
> `BYDAY=2TU` or `BYDAY=1WE,3WE` (and rejects a numbered BYDAY only with `FREQ=WEEKLY`), which is exactly the
> rule DECISIONS 2026-09-19 records — "Monthly days may be entered as MONTHLY schedules by hand". So "Every 2nd
> Tuesday" can be entered as a real schedule and computed as open-now. These rows are call-first because the
> **line importer** reads weekly hours only and nobody has entered them by hand yet, not because the rules cannot
> hold them. Entering them is steward work, and until then call-first with the printed words is still honest.

### Two DHD pages that disagree with each other

Recorded, not resolved, because only DHD can settle them:

1. **Satellite immunization hours.** The immunizations page's contact block says "Every Wednesday,
   9:00AM-4:00PM (last client at 3:30PM)". The satellite page says "Every Wednesday 9:00 a.m. to 4:30 p.m."
   Half an hour matters to somebody who leaves work early. That row is deliberately call-first.
2. **The Woodward WIC ZIP.** The WIC page says 9053 Woodward, Detroit, MI **48202**; the locations page says
   **48235**. No ZIP was entered for that clinic. (48202 is the plausible one, but plausible is not read.)

The same two pages also spell the Samaritan Center's street both **Connor** and **Conner**.

### One phone number that cannot be right

The Neighborhood Wellness Center at **The Open Door, Church of God in Christ**, 12411 East Seven Mile Road,
48205, has its phone printed as **"(313) 526-34205"** — nine digits after the area code's three. No line was
written for it. Everything else about the site is there (Tuesday, Wednesday and Thursday, 10 a.m. to 6 p.m.),
so one phone call to DHD turns it into a listing.

### What was found that we did not have

Six Neighborhood Wellness Centers besides the WCCCD one, and six WIC clinics with real hours. Those twelve
sites, plus the main clinic, the satellite centre, and the named programmes, are the 23 `health.dhd` lines in
`data/seed/incoming/2026-09-20-dhd-programs.txt`. Until a screen queries `health.dhd` (see
`docs/research/2026-09-19-new-help/entry-dhd.md`, point 2) none of them will appear to a resident, which is a
decision for Kyle, not a data problem.

Programmes deliberately **not** written as listings, because no street address is printed with them: Harm
Reduction and Behavioral Health (both 313-938-3677), the HIV/STI Program outreach line (313-569-6023), food
safety complaints (313-876-0135) and the Safe Routes Ambassadors Program (313-418-8982). The Behavioral Health
page also prints DWIHN's helpline, address and number; that is another organisation's fact and must come from
DWIHN's own pages before we publish it.

## 4. DDOT: yes, there is a reduced fare counter

`/departments/detroit-department-transportation/transportation-fares` answers Kyle's question plainly.
"Reduced Fare applications and cards are processed at the Rosa Parks Transit Center, 360 Michigan Ave.
Detroit, MI 48226. Pictures are taken 8:00 a.m. to 3:30 p.m. Monday – Friday", and a filled-out form "can also
be dropped off Monday – Friday from 8:00 a.m. to 3:30 p.m." The phone on the page is DDOT Customer Service
**(313) 933-1300** (also 3-1-1; TDD/TTY 7-1-1), so the row has both a phone and a street number and one
`transport` line was written.

Who it is for, in the page's words: "$0.50 to eligible seniors, disabled riders, Medicare recipients and
students"; seniors are "age 65 and older and must present their reduced fare ID card upon boarding"; students
are "those between ages 5 and 18" with "a current school ID card"; "Children less than 44 inches tall ride
free when accompanied by a full-fare paying adult"; and, in a banner of its own, "Students now ride DDOT buses
for free!" Fares, should anyone want them later: 4-Hour Dart $2 / $0.50, 24-Hour $5 / $2, 7-Day Dart $22 /
$10, 31-Day Dart $70 / $29, 7-Day DDOT $17 / $8, 31-Day DDOT $50 / $17.

## 5. What a steward has to decide, from this pass

1. **Lifeline H2O**: say on the listing that enrollment is full, and how.
2. **The HelpLine's hours**: 8-6 weekdays and 9-12 Saturday for housing, the same number for Street Outreach
   at all other times. One sentence, in plain words, without implying a bed is available at 2am.
3. **The shelter line 866-313-2520**: matched today. Nothing to change unless a steward wants the read date
   recorded in `emergency.csv` — Claude did not touch that file.
4. **The Open Door wellness centre's phone**, and **the Woodward WIC ZIP**, and **the satellite
   immunization closing time**: three questions, one phone call to DHD.
5. **Renamed rec-centre pages and two TTY lines**: small edits, no urgency.
6. **AB Ford**: the park is closed for construction, the centre is not. Worth saying.
7. **`health.dhd` still has no screen.** Twenty-three new rows now sit in a category no resident can reach.
   Either a screen queries it, or some of these rows belong on screens that already exist (the wellness
   centres look like `health.clinic`, iDecide like `health.clinic`, WIC like `food.benefits`).
8. **Rec-centre memberships**: a fee table exists for programmes. Decide whether listings should say so.
