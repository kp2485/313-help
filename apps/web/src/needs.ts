// The "What do you need?" list (docs/05). Runs entirely on the device; nothing chosen here is
// stored or sent. Sensitive needs never change the URL, so they leave no trace in browser history.

import type { Query } from '@detroithelp/query';

export interface Need {
  id: string;
  /** Emergency numbers (by id in emergency.json) shown BEFORE any list. Principle 8: never ask what you can't act on. */
  first?: string[];
  refine?: { id: string; query: Query }[];
  query?: Query;
  /** No list at all: 911 and rescue steps only. A bystander must not be sent on an errand (audit A7). */
  stepsOnly?: boolean;
  sensitive?: boolean;
  quickExit?: boolean;
  /** strings key for the intro line on the results screen */
  intro?: string;
  emptyKey?: string;
}

export const NEEDS: Need[] = [
  { id: 'food', refine: [
    { id: 'today', query: { category: 'food.meal', mode: 'now' } },
    { id: 'week', query: { category: 'food', mode: 'week' } },
  ] },
  { id: 'shelter', first: ['emg_shelter_helpline'], refine: [
    { id: 'me', query: { category: 'shelter.emergency' } },
    { id: 'kids', query: { category: 'shelter.emergency' } },
    { id: 'young', query: { category: 'youth' } },
  ] },
  { id: 'overdose_now', first: ['emg_911'], stepsOnly: true, sensitive: true },
  { id: 'narcan', query: { category: 'harm.narcan' } },
  { id: 'utilities', query: { category: 'utilities' } },
  { id: 'doctor', query: { category: 'health.clinic' } },
  { id: 'talk', first: ['emg_988', 'emg_dwihn_crisis'], query: { category: 'health.mental' }, sensitive: true, quickExit: true, intro: 'talk.intro' },
  // DV: hotline and 911 before anything else; rows have no address and never show a distance.
  { id: 'unsafe', first: ['emg_ndvh', 'emg_911'], query: { category: 'shelter.dv' }, sensitive: true, quickExit: true, intro: 'safe.dv_intro' },
  { id: 'hot_cold', query: { category: 'shelter.cooling' }, emptyKey: 'hotcold.none' },
];

export const CATEGORIES: { id: string; query?: Query; view?: 'greenway' | 'about' }[] = [
  { id: 'food', query: { category: 'food' } },
  { id: 'shelter', query: { category: 'shelter.emergency' } },
  { id: 'harm', query: { category: 'harm' } },
  { id: 'health', query: { category: 'health' } },
  { id: 'utilities', query: { category: 'utilities' } },
  { id: 'hygiene', query: { category: 'hygiene' } },
  { id: 'youth', query: { category: 'youth' } },
  { id: 'greenway', view: 'greenway' },   // one tile, last row: crisis users pay nothing for it (docs/11)
  { id: 'about', view: 'about' },
];

// 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5).
export const HARDCODED = { emg_911: '911', emg_988: '988' } as const;
