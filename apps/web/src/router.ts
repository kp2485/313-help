// Screens and the back button. The stack of screens lives in memory only. A browser history entry carries a random
// key and nothing else, so no need screen, search, or sensitive listing is ever written into the browser's history
// or session store (audit A8); the key finds the stack in memory. After a reload the keys are gone, and the URL's
// hash (only ever a public screen) is where the app starts again.

import { CATEGORIES, TABS, isPrivate, type TabId } from './needs.js';

/** A browse-by-type list that must leave no trace either, judged by the same `isPrivate` that decides a listing's
 *  own screen. A category screen names what a person was looking for just as plainly as a listing does:
 *  `#/c/treatment` sat in the address bar, "Drug and alcohol help" in the window title and in the browser's own
 *  history list, and Back after a quick exit landed straight back on it. The detail screens under those
 *  categories have been traceless since the start; the list above them was not (web review, 2026-09-20). */
export const isPrivateCat = (cat: string) => isPrivate(cat);

export type View =
  // `hoods` is a lens over the list (today only the greenway study area). The plain list of all 205 is the
  // Neighborhoods tab itself, at the same `#/n` it has always had.
  | { v: 'tab'; tab: TabId } | { v: 'urgent' } | { v: 'about' } | { v: 'privacy' } | { v: 'search' } | { v: 'saved' } | { v: 'add' } | { v: 'hoods'; lens: string } | { v: 'hood'; id: string } | { v: 'greenway' } | { v: 'parks' } | { v: 'park'; id: string }
  | { v: 'need'; id: string; refine?: string; all?: boolean }
  | { v: 'list'; cat: string } | { v: 'detail'; id: string } | { v: 'segment'; id: string };

const HOME: View = { v: 'tab', tab: 'home' };

/** The URL for a screen, or null for screens that must leave no trace. `sensitive(id)` says a listing is DV/crisis. */
export function hashFor(v: View, sensitive: (id: string) => boolean, path = '/'): string | null {
  // The Neighborhoods tab keeps the address its screen had before it was a tab: every `#/n` link a partner or a
  // resident saved still opens it, and Back and Forward walk the same trips they walked (2026-09-22).
  if (v.v === 'tab') return v.tab === 'home' ? path : v.tab === 'hoods' ? '#/n' : `#/${v.tab}`;
  if (v.v === 'detail') return sensitive(v.id) ? null : `#/r/${v.id}`;
  if (v.v === 'list') return isPrivateCat(v.cat) ? null : `#/c/${v.cat}`;
  if (v.v === 'greenway') return '#/greenway';
  if (v.v === 'segment') return `#/greenway/${v.id}`;
  if (v.v === 'parks') return '#/parks';
  // A park is a public place with a name and an address the City publishes: nothing about opening one says
  // anything about the person, so it keeps an address like a listing does (audit H4).
  if (v.v === 'park') return `#/park/${v.id}`;
  if (v.v === 'about') return '#/about';
  if (v.v === 'privacy') return '#/privacy';
  if (v.v === 'add') return '#/add';
  if (v.v === 'hoods') return `#/n/lens-${v.lens}`;
  if (v.v === 'hood') return `#/n/${v.id}`;
  return null; // the urgent sheet, search, saved places, and every "need" screen: no trace
}

/** The screen for a URL hash. Anything it doesn't know opens Home, never a half-built screen. */
export function fromHash(h: string): View {
  // `map` was missing here while the Map tab's own URL is #/map, so a shared or bookmarked map link opened Home
  // and going back from the Map tab skipped it (found in the accessibility pass, 2026-09-20). `rec` and `transit`
  // are the tab ids the Map tab replaced: they still parse, and TABS below sends them to Home.
  const m = /^#\/(r|c|n|greenway|about|privacy|add|parks|park|help|map|rec|transit|events)(?:\/([\w.-]+))?$/.exec(h);
  if (!m) return HOME;
  if (m[1] === 'r') return m[2] ? { v: 'detail', id: m[2] } : HOME;
  if (m[1] === 'c') return m[2] && CATEGORIES.some((c) => c.id === m[2]) ? { v: 'list', cat: m[2] } : { v: 'tab', tab: 'help' };
  // `#/n` is the Neighborhoods tab; `#/n/lens-jlg` a lens over it; `#/n/nbh_…` one neighborhood. A lens with no
  // name is not half a screen: it opens the tab.
  if (m[1] === 'n') return !m[2] ? { v: 'tab', tab: 'hoods' } : m[2].startsWith('lens-') ? (m[2].length > 5 ? { v: 'hoods', lens: m[2].slice(5) } : { v: 'tab', tab: 'hoods' }) : { v: 'hood', id: m[2] };
  if (m[1] === 'greenway') return m[2] ? { v: 'segment', id: m[2] } : { v: 'greenway' };
  if (m[1] === 'park') return m[2] ? { v: 'park', id: m[2] } : { v: 'parks' };
  if (m[1] === 'about' || m[1] === 'privacy' || m[1] === 'parks' || m[1] === 'add') return m[2] ? HOME : { v: m[1] };
  return !m[2] && TABS.some((x) => x.id === m[1]) ? { v: 'tab', tab: m[1] as TabId } : HOME;
}

export interface HistoryLike {
  readonly state: unknown;
  pushState(state: unknown, unused: string, url?: string | null): void;
  replaceState(state: unknown, unused: string, url?: string | null): void;
}

export function createRouter(hist: HistoryLike, opts: { sensitive: (id: string) => boolean; path: () => string }) {
  const stack: View[] = [HOME];
  const snapshots = new Map<string, View[]>();   // memory only
  let n = 0;
  const remember = () => { const k = `e${++n}`; snapshots.set(k, stack.map((v) => ({ ...v }) as View)); return { k }; };
  const known = (state: unknown) => {
    const k = (state as { k?: unknown } | null)?.k;
    return typeof k === 'string' ? snapshots.get(k) : undefined;
  };
  const same = (a: View | undefined, b: View) => JSON.stringify(a) === JSON.stringify(b);
  // A screen we arrive AT has to be made traceless too, not only one we navigate to. A shared or bookmarked
  // `#/r/sal_national_dv_hotline` (or `#/c/treatment`) otherwise sat in the address bar for as long as the screen
  // was open, in front of whoever was looking over the person's shoulder, and stayed in the browser's history
  // list afterwards. So every reset rewrites the URL to the screen's own address, or to the plain path when the
  // screen has none (web review, 2026-09-20).
  const reset = (v: View) => { stack.length = 0; stack.push(v); hist.replaceState(remember(), '', hashFor(v, opts.sensitive, opts.path()) ?? opts.path()); };

  return {
    stack,
    top: () => stack[stack.length - 1]!,
    /** First load: start where the URL says. */
    start(hash: string) { reset(fromHash(hash)); },
    /** What `sensitive` knows has changed (the list loaded): write the top screen's address again, or take it away. */
    retrace() {
      const v = stack[stack.length - 1];
      if (v) hist.replaceState(hist.state, '', hashFor(v, opts.sensitive, opts.path()) ?? opts.path());
    },
    /** A new screen. A tab is a fresh start, not one more screen to back out of. */
    navigate(view: View) {
      if (view.v === 'tab') stack.length = 0;
      stack.push(view);
      hist.pushState(remember(), '', hashFor(view, opts.sensitive, opts.path()) ?? opts.path());
    },
    /** Back or forward (or a link that only changed the hash). Returns true when the screen changed. */
    popstate(state: unknown, hash: string): boolean {
      const snap = known(state);
      if (snap) { stack.length = 0; stack.push(...snap.map((v) => ({ ...v }) as View)); return true; }
      const v = fromHash(hash);
      if (same(stack[stack.length - 1], v) && stack.length === 1) return false;
      reset(v);
      return true;
    },
    /** A shared link opened while the app is open. Back/forward already handled it (popstate comes first). */
    hashchange(hash: string): boolean {
      if (known(hist.state)) return false;
      const v = fromHash(hash);
      if (same(stack[stack.length - 1], v)) return false;
      reset(v);
      return true;
    },
  };
}
