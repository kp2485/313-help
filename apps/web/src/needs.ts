// The Help tab's "What do you need?" list (docs/05). Runs entirely on the device; nothing chosen
// here is stored or sent. Need screens never change the URL, so they leave no trace in history.

import type { Query } from '@detroithelp/query';

export interface Need {
  id: string;
  icon: string;
  /** "now" needs are listed first, under "Right now". Same calm styling as the rest: urgency is
   *  carried by order and wording, not by color. */
  group: 'now' | 'soon';
  /** Emergency numbers (by id in emergency.json) shown BEFORE any list. Principle 8: never ask what you can't act on. */
  first?: string[];
  /** A choice leads to a list (`query`) or, for programs that are not places, to link-outs (`benefits`). */
  refine?: { id: string; query?: Query; benefits?: boolean }[];
  query?: Query;
  /** No list at all: 911 and rescue steps only. A bystander must not be sent on an errand (audit A7). */
  stepsOnly?: boolean;
  sensitive?: boolean;
  quickExit?: boolean;
  intro?: string;
  emptyKey?: string;
}

export const NEEDS: Need[] = [
  { id: 'overdose_now', icon: 'pulse', group: 'now', first: ['emg_911'], stepsOnly: true, sensitive: true },
  { id: 'shelter', icon: 'bed', group: 'now', first: ['emg_shelter_helpline'], refine: [
    { id: 'me', query: { category: 'shelter.emergency' } },
    { id: 'kids', query: { category: 'shelter.emergency' } },
    { id: 'young', query: { category: 'youth' } },
  ] },
  // DV: hotline and 911 before anything else; rows have no address and never show a distance.
  { id: 'unsafe', icon: 'shield', group: 'now', first: ['emg_ndvh', 'emg_911'], query: { category: 'shelter.dv' }, sensitive: true, quickExit: true, intro: 'safe.dv_intro' },
  { id: 'talk', icon: 'chat', group: 'now', first: ['emg_988', 'emg_dwihn_crisis'], query: { category: 'health.mental' }, sensitive: true, quickExit: true, intro: 'talk.intro' },
  { id: 'food', icon: 'food', group: 'soon', refine: [
    { id: 'today', query: { category: 'food.meal', mode: 'now' } },
    { id: 'week', query: { category: 'food', mode: 'week' } },
    { id: 'paying', benefits: true },
  ] },
  { id: 'doctor', icon: 'health', group: 'soon', query: { category: 'health.clinic' } },
  { id: 'utilities', icon: 'bolt', group: 'soon', query: { category: 'utilities' } },
  { id: 'narcan', icon: 'box', group: 'soon', query: { category: 'harm.narcan' } },
  // Warming and cooling centers are announced as alerts. Day to day, libraries and recreation centers are the free indoor places.
  { id: 'hot_cold', icon: 'sun', group: 'soon', query: { category: 'rec' }, intro: 'hotcold.intro', emptyKey: 'hotcold.none' },
];

/** Browse-by-type chips on the Help tab. Recreation, transit and events have their own tabs. */
export const CATEGORIES: { id: string; icon: string; query: Query }[] = [
  { id: 'food', icon: 'food', query: { category: 'food' } },
  { id: 'shelter', icon: 'bed', query: { category: 'shelter.emergency' } },
  { id: 'health', icon: 'health', query: { category: 'health' } },
  { id: 'harm', icon: 'box', query: { category: 'harm' } },
  { id: 'utilities', icon: 'bolt', query: { category: 'utilities' } },
  { id: 'hygiene', icon: 'drop', query: { category: 'hygiene' } },
  { id: 'youth', icon: 'people', query: { category: 'youth' } },
];

export const TABS = [
  { id: 'home', icon: 'home' }, { id: 'help', icon: 'help' }, { id: 'rec', icon: 'rec' },
  { id: 'transit', icon: 'transit' }, { id: 'events', icon: 'events' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

/** Domestic violence and mental-health crisis listings: no URL, no map dot, no distance, can't be saved (docs/08, 10-A8). */
export const SENSITIVE = ['shelter.dv', 'health.mental'];
export const isSensitive = (category: string) => SENSITIVE.some((c) => category === c || category.startsWith(c + '.'));

// 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5).
export const HARDCODED = { emg_911: '911', emg_988: '988' } as const;
