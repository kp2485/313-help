// Link-outs (docs/02, "Link-outs, not locations"): programs you apply for on the owner's own site, not places to go.
// Each set belongs to one need screen. Every page was opened on the set's `checked` date, and we state only what the
// owner's page says. The words live in strings/*.json as link.<set>.<id>.title|body|label, so they are translated
// like the rest of the app. We never ask anything about the person: applying happens on the owner's site.

/** `until`: the last Detroit calendar day the link is shown (an application window that closes). */
export interface LinkSet { checked: string; lede?: string; items: { id: string; url: string; until?: string }[] }

export const LINKS: Record<string, LinkSet> = {
  // Shown at the top of "I need a safe place to sleep tonight" (Kyle, 2026-09-20). 313SafeBeds is someone else's
  // tool: we link to it and copy nothing from it.
  beds: { checked: '2026-09-20', items: [{ id: 'safebeds', url: 'https://313safebeds.com/' }] },
  food: { checked: '2026-09-18', lede: 'benefits.lede', items: [
    { id: 'snap', url: 'https://newmibridges.michigan.gov/' },
    { id: 'wic', url: 'https://www.michigan.gov/mdhhs/assistance-programs/wic' },
    { id: 'double_up', url: 'https://doubleupfoodbucks.org/' },
  ] },
  rent: { checked: '2026-09-19', items: [
    { id: 'ser_rent', url: 'https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/relocation' },
    { id: 'right_to_counsel', url: 'https://michiganlegalhelp.org/find-lawyer/detroit-right-counsel' },
    { id: 'answer_eviction', url: 'https://michiganlegalhelp.org/resources/housing/do-it-yourself-answer-eviction-complaint' },
    { id: 'eviction_guides', url: 'https://michiganlegalhelp.org/resources/eviction' },
    { id: 'section8', url: 'https://www.michigan.gov/mshda/rental/housing-choice-voucher/mshda-housing-choice-voucher-hcv-waiting-list-information' },
    { id: 'home_connect', url: 'https://homeconnect.detroitmi.gov/affordable' },
    { id: 'rental_directory', url: 'https://housing.state.mi.us/arhd/' },
  ] },
  owner: { checked: '2026-09-19', items: [
    { id: 'hope', url: 'https://detroitmi.gov/government/mayors-office/chief-financial-officer/homeowners-property-exemption-hope', until: '2026-11-06' },
    { id: 'home_repair', url: 'https://portal.neighborlysoftware.com/CITYOFDETROITMI/participant', until: '2026-09-22' },
    { id: 'ser_mortgage', url: 'https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/home-ownership' },
    { id: 'ser_repairs', url: 'https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief/home-repairs' },
    { id: 'probate', url: 'https://www.wcpc.us/' },
  ] },
  legal: { checked: '2026-09-19', items: [
    { id: 'mlh', url: 'https://michiganlegalhelp.org/' },
    { id: 'lakeshore_apply', url: 'https://lakeshorelegalaid.org/find-legal-help/' },
    { id: 'clean_slate', url: 'https://www.michigan.gov/msp/services/chr/conviction-set-aside-public-information/michigan-clean-slate' },
    { id: 'wages', url: 'https://www.michigan.gov/leo/bureaus-agencies/ber/wage-and-hour' },
  ] },
  id: { checked: '2026-09-19', items: [
    { id: 'free_state_id', url: 'https://www.michigan.gov/sos/all-services/id-with-no-fee' },
    { id: 'birth_certificate', url: 'https://www.michigan.gov/mdhhs/doing-business/vitalrecords/order-a-copy-of-a-vital-record' },
    { id: 'id_guides', url: 'https://michiganlegalhelp.org/resources/ids-and-name-change' },
  ] },
  treatment: { checked: '2026-09-19', items: [
    { id: 'findtreatment', url: 'https://findtreatment.gov/' },
    { id: 'michigan', url: 'https://www.michigan.gov/opioids/find-help' },
  ] },
  recovery: { checked: '2026-09-19', items: [
    { id: 'marr', url: 'https://michiganarr.com/full-rr-operator-list-1' },
    { id: 'aa', url: 'https://waynecountyintergroup.org/' },
    { id: 'na', url: 'https://michigan-na.org/metro-detroit-region/' },
    { id: 'smart', url: 'https://meetings.smartrecovery.org/meetings/' },
    { id: 'alanon', url: 'https://al-anon.org/al-anon-meetings/find-an-al-anon-meeting/' },
  ] },
  supplies: { checked: '2026-09-19', items: [
    { id: 'ssp_map', url: 'https://www.michigan.gov/mdhhs/keep-mi-healthy/mentalhealth/drugcontrol/syringe-service-programs/find-a-syringe-service-program-near-me' },
  ] },
  assault: { checked: '2026-09-19', items: [
    { id: 'free_exam', url: 'https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/resources-for-professionals/safe' },
    { id: 'compensation', url: 'https://www.michigan.gov/mdhhs/safety-injury-prev/publicsafety/crimevictims/assistance' },
  ] },
  taxes: { checked: '2026-09-19', items: [
    { id: 'heating_credit', url: 'https://www.michigan.gov/taxes/questions/iit/accordion/heating/home-heating-credit-information-1', until: '2026-09-30' },
    { id: 'aas_video', url: 'https://www.accountingaidresources.org/taxsitelocations', until: '2026-10-07' },
    { id: 'irs_vita', url: 'https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers' },
    { id: 'irs_free_file', url: 'https://www.irs.gov/filing/irs-free-file-do-your-taxes-for-free' },
  ] },
  benefits: { checked: '2026-09-19', items: [
    { id: 'mibridges', url: 'https://newmibridges.michigan.gov/' },
    { id: 'ser', url: 'https://www.michigan.gov/mdhhs/assistance-programs/emergency-relief' },
    { id: 'mdhhs_office', url: 'https://www.michigan.gov/mdhhs/inside-mdhhs/county-offices/wayne' },
    { id: 'mi_options', url: 'https://www.michigan.gov/MDHHSmioptions' },
    { id: 'insurance_help', url: 'https://localhelp.healthcare.gov/' },
    { id: 'ssa_office', url: 'https://www.ssa.gov/locator' },
  ] },
  jobs_lost: { checked: '2026-09-19', items: [
    { id: 'uia_file', url: 'https://www.michigan.gov/leo/bureaus-agencies/uia' },
    { id: 'uia_visit', url: 'https://www.michigan.gov/leo/bureaus-agencies/uia/schedule-an-appointment' },
    { id: 'register_to_work', url: 'https://www.michigan.gov/leo/bureaus-agencies/uia/uia-resources-for-claimants/finding-employment-work-search/register-to-work-requirement' },
    { id: 'mitalent', url: 'https://www.mitalent.org/' },
    { id: 'wages', url: 'https://www.michigan.gov/leo/bureaus-agencies/ber/wage-and-hour' },
  ] },
  jobs: { checked: '2026-09-19', items: [
    { id: 'daw_signup', url: 'https://detroitatwork.com/' },
    { id: 'job_fairs', url: 'https://detroitatwork.com/events/jobfairs' },
    { id: 'mitalent', url: 'https://www.mitalent.org/' },
    { id: 'mi_works', url: 'https://www.michiganworks.org/michigan-works-network' },
    { id: 'youth', url: 'https://detroitatwork.com/youth' },
    { id: 'mrs', url: 'https://www.michigan.gov/leo/bureaus-agencies/mrs' },
    { id: 'veterans', url: 'https://www.michigan.gov/leo/bureaus-agencies/wd/veterans' },
  ] },
  training: { checked: '2026-09-19', items: [
    { id: 'daw_training', url: 'https://detroitatwork.com/training' },
    { id: 'youthbuild', url: 'https://detroitatwork.com/youthbuild' },
    { id: 'trade_connect', url: 'https://detroitatwork.com/detroit-at-work-trade-connect' },
    { id: 'fast_track', url: 'https://detroitatwork.com/fast-track' },
    { id: 'plumbers', url: 'https://www.plumbers98tc.org/apprenticeship', until: '2026-12-18' },
    { id: 'older_workers', url: 'https://www.deturbanleague.org/usjp' },
  ] },
  record: { checked: '2026-09-19', items: [
    { id: 'after_prison', url: 'https://detroitatwork.com/help' },
    { id: 'project_clean_slate', url: 'https://detroitmi.gov/government/mayors-office/mayors-initiatives-and-programs/project-clean-slate' },
    { id: 'clean_slate', url: 'https://www.michigan.gov/msp/services/chr/conviction-set-aside-public-information/michigan-clean-slate' },
  ] },
  school: { checked: '2026-09-19', items: [
    { id: 'daw_ged', url: 'https://detroitatwork.com/adult-education-gedhigh-school-completion' },
    { id: 'dpscd', url: 'https://www.detroitk12.org/enroll/adult-education' },
    { id: 'adult_ed_map', url: 'https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/adult-education/adult-education-service-locator' },
    { id: 'hse', url: 'https://www.michigan.gov/leo/bureaus-agencies/wd/education-training/hse' },
    { id: 'reconnect', url: 'https://www.michigan.gov/reconnect/about' },
    { id: 'achievement', url: 'https://www.michigan.gov/mistudentaid/programs/michigan-achievement-scholarship' },
  ] },
  clothes: { checked: '2026-09-19', items: [
    { id: 'goodfellows', url: 'https://www.detroitgoodfellows.org/application/', until: '2026-10-31' },
  ] },
  baby: { checked: '2026-09-19', items: [
    { id: 'diaper_bank', url: 'https://www.detroitdiaperbank.com/diapers/' },
  ] },
  phone: { checked: '2026-09-19', items: [
    { id: 'lifeline', url: 'https://www.michigan.gov/mpsc/consumer/telecommunications/lifeline' },
    { id: 'lifeline_providers', url: 'https://www.michigan.gov/mpsc/consumer/telecommunications/lifeline/michigan-lifeline-providers' },
    { id: 'library_laptops', url: 'https://detroitpubliclibrary.org/laptop-to-go-hotspot-to-go' },
    { id: 'tech_hubs', url: 'https://connect313.org/neighborhood-tech-hubs/' },
    { id: 'digital_skills', url: 'https://digital-detroit.p2pu.org/' },
    { id: 'eii', url: 'https://mynewcc.org/our-work/equitable-internet-initiative-eii/' },
    { id: 'att_access', url: 'https://www.att.com/internet/access/' },
  ] },
  childcare: { checked: '2026-09-19', items: [
    { id: 'cdc', url: 'https://www.michigan.gov/mileap/early-childhood-education/early-learners-and-care/cdc/parents' },
    { id: 'findprek', url: 'https://findprek.org/' },
    { id: 'great_start', url: 'https://greatstarttoquality.org/free-or-low-cost-programs/' },
    { id: 'starfish', url: 'https://www.starfishfamilyservices.org/services/early-childhood-education/' },
  ] },
  rides: { checked: '2026-09-19', items: [
    { id: 'medicaid_rides', url: 'https://www.michigan.gov/mdhhs/doing-business/providers/providers/billingreimbursement/non-emergency-medical-transportation' },
    { id: 'ddot_reduced', url: 'https://detroitmi.gov/departments/detroit-department-transportation/transportation-fares' },
    { id: 'ride_to_rise', url: 'https://detroitmi.gov/news/ride-rise-how-detroit-students-can-ride-ddot-bus-free' },
    { id: 'paratransit', url: 'https://detroitmi.gov/departments/detroit-department-transportation/detroit-paratransit' },
    { id: 'smart_reduced', url: 'https://www.smartbus.org/Fares/Reduced-Fares' },
    { id: 'dearborn_seniors', url: 'https://dearborn.gov/residents/services-adults-55/senior-transportation/senior-transportation' },
  ] },
  pets: { checked: '2026-09-19', items: [
    { id: 'grace', url: 'https://www.dogaide.com/project-grace.html' },
    { id: 'spay_van', url: 'https://allaboutanimalsrescue.org/veterinary-services/request-spay-or-neuter-appointment/request-a-transport-van-for-spayneuter-or-a-dental-cleaning/' },
  ] },
  dental: { checked: '2026-09-19', items: [
    { id: 'healthy_kids_dental', url: 'https://www.michigan.gov/mdhhs/assistance-programs/medicaid/portalhome/beneficiaries/programs/healthy-kids-healthy-kids-dental' },
  ] },
};
