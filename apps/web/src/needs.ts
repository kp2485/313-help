// The Help tab's "What do you need?" list (docs/05). Runs entirely on the device; nothing chosen
// here is stored or sent. Need screens never change the URL, so they leave no trace in history.

import type { Query } from '@313help/query';

export interface Need {
  id: string;
  icon: string;
  /** "now" needs are listed first, under "Right now", then "This week", then "Work, school, and paperwork" (later).
   *  Same calm styling throughout: urgency is carried by order and wording, not by color. */
  group: 'now' | 'soon' | 'later';
  /** Emergency numbers (by id in emergency.json) shown BEFORE any list. Principle 8: never ask what you can't act on. */
  first?: string[];
  /** A link set shown above even those numbers: today only 313SafeBeds on the shelter screen (Kyle, 2026-09-20). */
  firstLinks?: string;
  /** A choice leads to a list (`query`), to link-outs for programs that are not places (`links`, a key of LINKS in
   *  links.ts), or to both: the list first, then the links. `first` lets one choice put emergency numbers above its
   *  list even when the need itself has none: the emergency-room choice leads with 911 (DECISIONS 2026-09-20). */
  refine?: { id: string; query?: Query; links?: string; first?: string[] }[];
  query?: Query;
  /** A second list, under its own heading, BELOW the need's own list. It exists for one thing: a crisis screen
   *  keeps its hotlines and its crisis places first (docs/05 ordering), and the ongoing, non-crisis places come
   *  after them rather than being mixed in or hidden behind a tap. Its heading is `also.<need>.<id>`, and its
   *  rows are ordinary rows: a `health.support` listing keeps its address, map, Save, Share and its own URL. */
  also?: { id: string; query: Query };
  links?: string;
  /** No list at all: 911 and rescue steps only. A bystander must not be sent on an errand (audit A7). */
  stepsOnly?: boolean;
  sensitive?: boolean;
  quickExit?: boolean;
  intro?: string;
  emptyKey?: string;
}

export const NEEDS: Need[] = [
  { id: 'overdose_now', icon: 'pulse', group: 'now', first: ['emg_911'], stepsOnly: true, sensitive: true },
  { id: 'shelter', icon: 'bed', group: 'now', firstLinks: 'beds', first: ['emg_shelter_helpline', 'emg_shelter_outwayne'], refine: [
    { id: 'me', query: { category: 'shelter.emergency' } },
    { id: 'kids', query: { category: 'shelter.emergency' } },
    // Every emergency shelter, with the ones for young people first (DECISIONS 2026-09-19). Not after-school programs.
    { id: 'young', query: { category: 'shelter.emergency', prefer: ['youth'] } },
  ] },
  // DV: hotline and 911 before anything else; rows have no address and never show a distance.
  { id: 'unsafe', icon: 'shield', group: 'now', first: ['emg_ndvh', 'emg_911'], query: { category: 'shelter.dv' }, sensitive: true, quickExit: true, intro: 'safe.dv_intro' },
  // Crisis first: 988, DWIHN's line, then the crisis places (health.mental, sensitive). Under those, and only
  // under those, the daytime places a person can walk into (health.support) — ordinary listings with an address
  // (category audit 2026-09-22, K3). The screen itself stays traceless and keeps its quick exit.
  { id: 'talk', icon: 'chat', group: 'now', first: ['emg_988', 'emg_dwihn_crisis'], query: { category: 'health.mental' }, also: { id: 'support', query: { category: 'health.support' } }, sensitive: true, quickExit: true, intro: 'talk.intro' },
  // Treatment (DECISIONS 2026-09-19): DWIHN's 24-hour line is the front door for all four cities, then SAMHSA's.
  // Listings are private (not saved, not in history) but keep their address and distance: people have to get there.
  { id: 'drugs', icon: 'sprout', group: 'now', first: ['emg_dwihn_crisis', 'emg_dwihn_care_center', 'emg_samhsa'], quickExit: true, intro: 'drugs.intro', refine: [
    { id: 'today', query: { category: 'treatment', prefer: ['walk_in'] } },
    { id: 'detox', query: { category: 'treatment.detox' }, links: 'treatment' },
    { id: 'meds', query: { category: 'treatment.meds' }, links: 'treatment' },
    { id: 'stay', query: { category: 'treatment.residential' }, links: 'treatment' },
    { id: 'home', query: { category: 'treatment.outpatient' }, links: 'treatment' },
    { id: 'recovery', query: { category: 'treatment.recovery' }, links: 'recovery' },
    { id: 'supplies', query: { category: 'harm.supplies' }, links: 'supplies' },
  ] },
  // Like the DV screen: hotlines first, quick exit. Places keep an address only if they publish one.
  { id: 'assault', icon: 'shield', group: 'now', first: ['emg_avalon', 'emg_voices4', 'emg_911'], query: { category: 'assault' }, links: 'assault', quickExit: true, intro: 'assault.intro' },
  { id: 'food', icon: 'food', group: 'soon', refine: [
    { id: 'today', query: { category: 'food.meal', mode: 'now' } },
    { id: 'week', query: { category: 'food', mode: 'week' } },
    { id: 'paying', links: 'food' },
  ] },
  // Emergency rooms and urgent care are their own categories, because neither says it is free or low-cost the way
  // health.clinic does (DECISIONS 2026-09-20). The emergency room comes first and leads with 911; an emergency room
  // is only ever shown as open all day and night where its own page says so.
  { id: 'doctor', icon: 'health', group: 'soon', refine: [
    { id: 'er', query: { category: 'health.er' }, first: ['emg_911'] },
    { id: 'urgent', query: { category: 'health.urgent' } },
    { id: 'doctor', query: { category: 'health.clinic' } },
    // Detroit Health Department programs: shots, lead tests, WIC and the wellness centers. Their own category,
    // because they are city programs rather than a clinic that says it is free (coordinator, 2026-09-20).
    { id: 'dhd', query: { category: 'health.dhd' } },
    { id: 'dentist', query: { category: 'health.dental' }, links: 'dental' },
    { id: 'eyes', query: { category: 'health.vision' } },
    // Ongoing mental-health support that is not a crisis service: day programs a person can walk into. Also the
    // second half of "I need to talk to someone", where it sits below 988 and the crisis places (docs/05).
    { id: 'support', query: { category: 'health.support' } },
  ] },
  { id: 'home', icon: 'key', group: 'soon', refine: [
    { id: 'rent', query: { category: 'housing.rent' }, links: 'rent' },
    { id: 'own', query: { category: 'housing.owner' }, links: 'owner' },
  ] },
  { id: 'utilities', icon: 'bolt', group: 'soon', query: { category: 'utilities' } },
  { id: 'day', icon: 'clock', group: 'soon', query: { category: 'shelter.day' } },
  { id: 'things', icon: 'shirt', group: 'soon', refine: [
    { id: 'clothes', query: { category: 'goods.clothes' }, links: 'clothes' },
    { id: 'baby', query: { category: 'goods.baby' }, links: 'baby' },
  ] },
  // Every harm-reduction place that stocks naloxone, not only the Health Department's boxes: the whole `harm`
  // top-level, which is `harm.narcan` plus `harm.supplies` (Wayne County's Well Wayne stations and the Life
  // Points outreach), each of which says it gives out Narcan (Kyle, 2026-09-22; audit K1). Ranking is unchanged:
  // open now, then distance. Home's "Free Narcan" shortcut opens this same need, so it lists the same places.
  { id: 'narcan', icon: 'box', group: 'soon', query: { category: 'harm' }, intro: 'narcan.intro' },
  // Warming and cooling centers are announced as alerts. Day to day, libraries and recreation centers are the free indoor places.
  { id: 'hot_cold', icon: 'sun', group: 'soon', query: { category: 'rec' }, intro: 'hotcold.intro', emptyKey: 'hotcold.none' },
  { id: 'job', icon: 'work', group: 'later', refine: [
    { id: 'find', query: { category: 'jobs.find' }, links: 'jobs' },
    { id: 'training', query: { category: 'jobs.training' }, links: 'training' },
    { id: 'record', query: { category: 'jobs', prefer: ['reentry'] }, links: 'record' },
    { id: 'lost', links: 'jobs_lost' },
  ] },
  { id: 'school', icon: 'book', group: 'later', refine: [
    { id: 'ged', query: { category: 'learn.school' }, links: 'school' },
    { id: 'english', query: { category: 'learn.english' }, links: 'school' },
  ] },
  { id: 'legal', icon: 'scale', group: 'later', query: { category: 'legal' }, links: 'legal' },
  { id: 'id', icon: 'card', group: 'later', query: { category: 'ids' }, links: 'id' },
  { id: 'money', icon: 'coin', group: 'later', refine: [
    { id: 'taxes', query: { category: 'money.tax' }, links: 'taxes' },
    { id: 'benefits', query: { category: 'money.benefits' }, links: 'benefits' },
  ] },
  { id: 'childcare', icon: 'people', group: 'later', query: { category: 'kids.care' }, links: 'childcare' },
  { id: 'phone', icon: 'wifi', group: 'later', query: { category: 'connect' }, links: 'phone' },
  { id: 'rides', icon: 'transit', group: 'later', query: { category: 'transport' }, links: 'rides' },
  { id: 'pets', icon: 'paw', group: 'later', query: { category: 'pets' }, links: 'pets' },
];

/** Browse-by-type chips on the Help tab. The map and events have their own tabs. */
export const CATEGORIES: { id: string; icon: string; query: Query }[] = [
  { id: 'food', icon: 'food', query: { category: 'food' } },
  { id: 'shelter', icon: 'bed', query: { category: 'shelter.emergency' } },
  { id: 'health', icon: 'health', query: { category: 'health' } },
  { id: 'harm', icon: 'box', query: { category: 'harm' } },
  { id: 'utilities', icon: 'bolt', query: { category: 'utilities' } },
  { id: 'hygiene', icon: 'drop', query: { category: 'hygiene' } },
  { id: 'youth', icon: 'people', query: { category: 'youth' } },
  { id: 'jobs', icon: 'work', query: { category: 'jobs' } },
  { id: 'learn', icon: 'book', query: { category: 'learn' } },
  { id: 'treatment', icon: 'sprout', query: { category: 'treatment' } },
  { id: 'housing', icon: 'key', query: { category: 'housing' } },
  { id: 'legal', icon: 'scale', query: { category: 'legal' } },
  { id: 'ids', icon: 'card', query: { category: 'ids' } },
  { id: 'money', icon: 'coin', query: { category: 'money' } },
  { id: 'goods', icon: 'shirt', query: { category: 'goods' } },
  { id: 'kids', icon: 'people', query: { category: 'kids' } },
  { id: 'connect', icon: 'wifi', query: { category: 'connect' } },
  { id: 'transport', icon: 'transit', query: { category: 'transport' } },
  { id: 'pets', icon: 'paw', query: { category: 'pets' } },
];

// One Map tab instead of the old Recreation and Transit tabs (Kyle, 2026-09-20). Everything both tabs offered is
// still on it: the greenway, parks, recreation centers, bus and streetcar facts, fares and phone numbers.
// Neighborhoods became a tab on 2026-09-22 (Kyle): the numbers about each of the City's 205 neighborhoods were
// reachable only from a line on the About screen, where nobody looks. Its own hash is still `#/n`, so every link
// and bookmark made before the tab existed opens the same screen. Events still hides itself when the bundle
// carries none, so a phone normally shows four.
export const TABS = [
  { id: 'home', icon: 'home' }, { id: 'help', icon: 'help' }, { id: 'map', icon: 'pin' }, { id: 'hoods', icon: 'district' }, { id: 'events', icon: 'events' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

/** One map layer per group of our own listings, derived from the category taxonomy above. Eight groups since the
 *  category audit of 2026-09-22 (docs/CATEGORY-AUDIT-2026-09-22.md); the iPhone and Android apps carry the same list.
 *  `tops` are top-level categories (the part before the first dot). Every top-level category a listing can carry
 *  belongs to exactly one group, except the private ones, which are never drawn (see PRIVATE_TOPS below). */
export const MAP_GROUPS: { id: string; icon: string; tops: string[] }[] = [
  { id: 'food', icon: 'food', tops: ['food'] },
  { id: 'shelter', icon: 'bed', tops: ['shelter'] },
  { id: 'health', icon: 'health', tops: ['health', 'harm'] },
  // Free computers and internet sit with the libraries and rec centers that offer them (category audit, 2026-09-22).
  { id: 'rec', icon: 'rec', tops: ['rec', 'connect'] },
  { id: 'work', icon: 'work', tops: ['jobs', 'learn'] },
  // Their own layer since 2026-09-22: child care, after-school programs and places for young people used to sit
  // under "Clothes, showers, and things", where nobody would look for them.
  { id: 'kids', icon: 'people', tops: ['kids', 'youth'] },
  // Every label names what is in its layer: this one is clothes and baby things, showers and laundry, and pet help.
  { id: 'things', icon: 'shirt', tops: ['goods', 'hygiene', 'pets'] },
  { id: 'paperwork', icon: 'card', tops: ['housing', 'utilities', 'money', 'legal', 'ids', 'transport'] },
];
/** Never a layer, never a dot: treatment and help after sexual assault are private (PRIVATE), and inside the
 *  groups above a single listing is still dropped when it is sensitive (shelter.dv, health.mental). */
export const PRIVATE_TOPS = ['treatment', 'assault'];

/** Domestic violence and mental-health crisis listings: no URL, no map dot, no distance, can't be saved (docs/08, 10-A8). */
export const SENSITIVE = ['shelter.dv', 'health.mental'];
export const isSensitive = (category: string) => SENSITIVE.some((c) => category === c || category.startsWith(c + '.'));
/** Treatment and help after sexual assault (DECISIONS 2026-09-19): never saved and never in the browser's history, and
 *  the detail screen has the quick exit. Unlike the sensitive listings they keep an address, a map dot and a distance,
 *  because people have to get there. Every sensitive listing is private too. */
export const PRIVATE = ['treatment', 'assault'];
export const isPrivate = (category: string) => isSensitive(category) || PRIVATE.some((c) => category === c || category.startsWith(c + '.'));

/** The listings a set of switched-on help layers may put on the map. Two rules, and both have to hold: the
 *  private kinds (treatment, help after sexual assault) are dropped as whole top-level kinds, and inside any
 *  other group a single sensitive listing (a DV shelter, a mental-health crisis line) is dropped row by row.
 *  A row also needs a coordinate, because a dot is what this is for.
 *
 *  It lives here, beside the rules it enforces, so it can be held to a fixture of the exact rows it must never
 *  draw rather than to the shape of the line that used to do it inside main.ts. */
export function mapDrawable<T extends { category: string; lat?: number }>(rows: readonly T[], tops: readonly string[]): T[] {
  return rows.filter((r) => {
    if (r.lat === undefined) return false;
    const top = r.category.split('.')[0]!;
    return !isSensitive(r.category) && !PRIVATE_TOPS.includes(top) && tops.includes(top);
  });
}

// 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5).
export const HARDCODED = { emg_911: '911', emg_988: '988' } as const;
