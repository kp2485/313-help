# Detroit Health Department programs: conversion notes (2026-09-19)

## What happened

Every detroitmi.gov page answered our honest script request (`-A 'Mozilla/5.0 (compatible; 313help-research; open-source civic directory)'`) with **HTTP 403 and a Cloudflare "Just a moment..." challenge page** on 2026-09-19 (about 19:37 UTC). Tried, all 403:

- https://detroitmi.gov/ (HEAD)
- https://detroitmi.gov/departments/detroit-health-department
- https://detroitmi.gov/departments/detroit-health-department/programs-and-services
- .../programs-and-services/immunizations
- .../programs-and-services/vision-and-hearing-screening
- .../programs-and-services/wic
- .../programs-and-services/sisterfriends-detroit
- https://detroitmi.gov/departments/detroit-health-department/detroit-health-department-locations

Per the rule, I did not work around it (no browser UA, no WebFetch, no other site). There are no earlier DHD program notes in `docs/research/` to convert. So **no facts were read today, and no import lines were written**. I did not create `data/seed/incoming/2026-09-19-dhd-programs.txt`, because an import file with no lines would only be a header.

The DHD program pages need a person's browser check. The worksheet for that is already in `docs/CHECKS-2026-09-19.md`, section 3.

## Held for a person

These are ready to add to `data/seed/to-verify.csv`. The source_url is the DHD programs page, because I could not open the program pages to learn their exact URLs. I did not guess URLs.

```
"Detroit Health Department WIC clinics","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read DHD's WIC page for clinic addresses, phone, hours. WIC in Dearborn/Hamtramck/Highland Park is Wayne County's (see docs/research/2026-09-19-wayne-county-sources.md)",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department Lead Safe Detroit (lead testing, home lead help)","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the program page",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department SisterFriends Detroit (pregnancy support)","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the program page",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department HIV/STI testing","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the program page (sensitive care: no staff names)",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department HIV/STI treatment and PrEP","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the program page (sensitive care: no staff names)",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department CeaseFire Detroit","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the program page and decide if it is a place, a phone line, or neither",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department Animal Care and Control","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. A person must read the page (would go under pets)",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department maternal and child health / home visiting","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. Program name from the D Compassion list; may not match DHD's current name",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department Healthy Homes","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department food safety and environmental health complaints","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. Probably a phone line or online form, not a place",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department harm reduction (services other than the wellness stations)","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. The 60 stations are already in the app from the City's open-data layer",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department community health workers / health hubs","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. Check against the existing Neighborhood Wellness Center row before adding",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department behavioral health / substance use navigation","[2026-09-19 DHD programs] detroitmi.gov served a bot challenge (403) to our script; nothing read. Any DWIHN number must come from DWIHN's own pages",https://detroitmi.gov/departments/detroit-health-department/programs-and-services
"Detroit Health Department public health emergency line (313-933-3437)","[2026-09-19 DHD programs] Number is in docs/02 only; detroitmi.gov served a bot challenge (403), so it was not read on DHD's page today. Would be a hotline, not a listing",https://detroitmi.gov/departments/detroit-health-department
```

**Already held, no new row:** "Detroit Health Department Immunizations Clinic, 100 Mack" stays in to-verify.csv as it is. I could not re-read the immunizations page (403), so the stale and conflicting hours are still not resolved. I suggest adding to its why_held: "; 2026-09-19 re-read attempt blocked (403 bot challenge)". The "Rides to Care" row also stays held as it is.

**Skipped on purpose:**
- Vital records and birth certificates. This is not a DHD service. It is held under the Wayne County Clerk.
- Detroit ID. Already listed as `sal_detroit_health_detroit_id_health_department` and `sal_detroit_health_detroit_id_patton_recreation_center`.
- Vision and hearing checks for kids. Already listed as `sal_detroit_health_vision_and_hearing_checks_for_kids`.
- Neighborhood Wellness Center, WCCCD Northwest. Already listed as `sal_detroit_health_neighborhood_wellness_center_at_wcccd_nor`.

## Link-outs

None. No DHD page could be read.

## Hotlines

None were confirmed today. 313-933-3437 is a candidate (held above).

## Updates to existing rows

None. None of the four existing DHD rows could be re-read.

## Things a person must decide

1. **Is the block new?** CLAUDE.md-era notes say detroitmi.gov answered scripts normally on 2026-09-19. As of about 19:37 UTC that day it serves a Cloudflare challenge again. docs/02 line 91 already notes this happens. A person has two options: fill in the DHD worksheet in `docs/CHECKS-2026-09-19.md` §3 in a browser (Claude then converts it), or retry the script later.
2. **`health.dhd` is not on any screen.** It is in the taxonomy (docs/03), but `apps/web/src/needs.ts` does not query it. DHD rows filed under it would not appear anywhere until a screen is added. Some programs may belong on existing screens instead. For example, Animal Care goes under `pets`, and CeaseFire or navigation lines under a "Right now" screen.
3. **WIC in the other three cities is run by Wayne County, not DHD.** The Hamtramck clinic is in the Wayne County notes. Should the WIC screen list both?

## Counts

- Import lines written: 0. No incoming file was created.
- Held (new to-verify lines above): 14
- Existing held rows left as they are: 2 (Immunizations, Rides to Care)
- Link-outs: 0
- Hotlines: 0
- Skipped as duplicates or not DHD: 4 existing rows, plus vital records
