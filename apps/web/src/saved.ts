// Saved places (docs/05): listing ids kept on this phone only. Never sent, never synced, cleared with one tap.
// A phone can be looked through by someone else (audit A8), so listings for domestic violence and
// mental-health crisis cannot be saved at all, and the screen is named plainly: "Saved places."

import { idbGet, idbSet } from './data.js';

const NEVER = ['shelter.dv', 'health.mental'];
export const canSave = (category: string) => !NEVER.some((c) => category === c || category.startsWith(c + '.'));

export async function loadSaved(): Promise<string[]> {
  const ids = await idbGet<unknown>('saved');
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}

/** Returns the new list. Newest first; 100 at most. */
export async function toggleSaved(ids: string[], id: string, category: string): Promise<string[]> {
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : canSave(category) ? [id, ...ids].slice(0, 100) : ids;
  await idbSet('saved', next);
  return next;
}

export async function clearSaved(): Promise<string[]> { await idbSet('saved', []); return []; }
