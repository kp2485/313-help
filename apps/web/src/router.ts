// Screens and the back button. The stack of screens lives in memory only. A browser history entry carries a random
// key and nothing else, so no need screen, search, or sensitive listing is ever written into the browser's history
// or session store (audit A8); the key finds the stack in memory. After a reload the keys are gone, and the URL's
// hash (only ever a public screen) is where the app starts again.

import { CATEGORIES, TABS, type TabId } from './needs.js';

export type View =
  | { v: 'tab'; tab: TabId } | { v: 'urgent' } | { v: 'about' } | { v: 'privacy' } | { v: 'search' } | { v: 'saved' } | { v: 'add' } | { v: 'hoods'; lens?: string } | { v: 'hood'; id: string } | { v: 'greenway' } | { v: 'parks' }
  | { v: 'need'; id: string; refine?: string; all?: boolean }
  | { v: 'list'; cat: string } | { v: 'detail'; id: string } | { v: 'segment'; id: string };

const HOME: View = { v: 'tab', tab: 'home' };

/** The URL for a screen, or null for screens that must leave no trace. `sensitive(id)` says a listing is DV/crisis. */
export function hashFor(v: View, sensitive: (id: string) => boolean, path = '/'): string | null {
  if (v.v === 'tab') return v.tab === 'home' ? path : `#/${v.tab}`;
  if (v.v === 'detail') return sensitive(v.id) ? null : `#/r/${v.id}`;
  if (v.v === 'list') return `#/c/${v.cat}`;
  if (v.v === 'greenway') return '#/greenway';
  if (v.v === 'segment') return `#/greenway/${v.id}`;
  if (v.v === 'parks') return '#/parks';
  if (v.v === 'about') return '#/about';
  if (v.v === 'privacy') return '#/privacy';
  if (v.v === 'add') return '#/add';
  if (v.v === 'hoods') return v.lens ? `#/n/lens-${v.lens}` : '#/n';
  if (v.v === 'hood') return `#/n/${v.id}`;
  return null; // the urgent sheet, search, saved places, and every "need" screen: no trace
}

/** The screen for a URL hash. Anything it doesn't know opens Home, never a half-built screen. */
export function fromHash(h: string): View {
  // `map` was missing here while the Map tab's own URL is #/map, so a shared or bookmarked map link opened Home
  // and going back from the Map tab skipped it (found in the accessibility pass, 2026-09-20). `rec` and `transit`
  // are the tab ids the Map tab replaced: they still parse, and TABS below sends them to Home.
  const m = /^#\/(r|c|n|greenway|about|privacy|add|parks|help|map|rec|transit|events)(?:\/([\w.-]+))?$/.exec(h);
  if (!m) return HOME;
  if (m[1] === 'r') return m[2] ? { v: 'detail', id: m[2] } : HOME;
  if (m[1] === 'c') return m[2] && CATEGORIES.some((c) => c.id === m[2]) ? { v: 'list', cat: m[2] } : { v: 'tab', tab: 'help' };
  if (m[1] === 'n') return !m[2] ? { v: 'hoods' } : m[2].startsWith('lens-') ? { v: 'hoods', lens: m[2].slice(5) } : { v: 'hood', id: m[2] };
  if (m[1] === 'greenway') return m[2] ? { v: 'segment', id: m[2] } : { v: 'greenway' };
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
  const reset = (v: View) => { stack.length = 0; stack.push(v); hist.replaceState(remember(), ''); };

  return {
    stack,
    top: () => stack[stack.length - 1]!,
    /** First load: start where the URL says. */
    start(hash: string) { reset(fromHash(hash)); },
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
