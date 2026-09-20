// Saved places (docs/05): listing ids kept on this phone only. Never sent, never synced, cleared with one tap.
// A phone can be looked through by someone else (audit A8), so listings for domestic violence, mental-health
// crisis, treatment and help after sexual assault cannot be saved at all (isPrivate), and the screen is named
// plainly: "Saved places."

import { idbGet, idbSet } from './data.js';
import { isPrivate } from './needs.js';

export const canSave = (category: string) => !isPrivate(category);

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
