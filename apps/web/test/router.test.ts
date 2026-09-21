import { describe, expect, it } from 'vitest';
import { createRouter, fromHash, hashFor, type View } from '../src/router.js';
import { TABS } from '../src/needs.js';

// A browser's session history, enough to drive the router the way a phone does: push, back, forward, reload,
// and a link that changes only the hash. Popstate comes first, then hashchange if the hash changed.
function browser(sensitiveIds: string[] = []) {
  let entries: { state: unknown; url: string }[] = [{ state: null, url: '/' }], i = 0;
  const hashOf = (url: string) => (url.includes('#') ? url.slice(url.indexOf('#')) : '');
  const hist = {
    get state() { return entries[i]!.state; },
    pushState(state: unknown, _: string, url?: string | null) { entries = entries.slice(0, i + 1); entries.push({ state, url: url ?? entries[i]!.url }); i++; },
    replaceState(state: unknown, _: string, url?: string | null) { entries[i] = { state, url: url ?? entries[i]!.url }; },
  };
  const make = () => createRouter(hist, { sensitive: (id) => sensitiveIds.includes(id), path: () => '/' });
  let router = make();
  const go = (d: number) => {
    const before = hashOf(entries[i]!.url);
    i += d;
    router.popstate(entries[i]!.state, hashOf(entries[i]!.url));
    if (hashOf(entries[i]!.url) !== before) router.hashchange(hashOf(entries[i]!.url));
  };
  return {
    hist, get router() { return router; },
    url: () => entries[i]!.url, urls: () => entries.map((e) => e.url), states: () => entries.map((e) => e.state),
    back: () => go(-1), forward: () => go(1),
    reload() { router = make(); router.start(hashOf(entries[i]!.url)); },
    openLink(hash: string) { entries = entries.slice(0, i + 1); entries.push({ state: null, url: '/' + hash }); i++; router.popstate(null, hash); router.hashchange(hash); },
    top: () => router.top(),
  };
}

const need: View = { v: 'need', id: 'unsafe' }, detail: View = { v: 'detail', id: 'sal_a' }, help: View = { v: 'tab', tab: 'help' };

describe('back and forward', () => {
  it('back then forward returns to the same screen, with its own back stack', () => {
    const b = browser(); b.router.start('');
    b.router.navigate(help); b.router.navigate({ v: 'need', id: 'food' }); b.router.navigate(detail);
    b.back(); expect(b.top()).toEqual({ v: 'need', id: 'food' });
    b.back(); expect(b.top()).toEqual(help);
    b.forward(); expect(b.top()).toEqual({ v: 'need', id: 'food' });
    b.forward(); expect(b.top()).toEqual(detail);
    expect(b.router.stack).toHaveLength(3);
  });
  it('going back from a listing to a need screen stays on the need screen (the hashchange that follows is not a new link)', () => {
    const b = browser(); b.router.start('');
    b.router.navigate(help); b.router.navigate(need); b.router.navigate({ v: 'detail', id: 'sal_b' });
    b.back();
    expect(b.top()).toEqual(need);
    expect(b.router.stack).toEqual([help, need]);
  });
  it('a link opened while the app is open starts fresh there, and back returns to where the person was', () => {
    const b = browser(); b.router.start(''); b.router.navigate(help);
    b.openLink('#/r/sal_x');
    expect(b.router.stack).toEqual([{ v: 'detail', id: 'sal_x' }]);
    b.back(); expect(b.top()).toEqual(help);
  });
  it('after a reload, back uses the URL (the in-memory stack is gone) and never breaks', () => {
    const b = browser(); b.router.start(''); b.router.navigate(help); b.router.navigate({ v: 'list', cat: 'food' });
    b.reload(); expect(b.top()).toEqual({ v: 'list', cat: 'food' });
    b.back(); expect(b.top()).toEqual(help);
  });
});

describe('what the browser keeps', () => {
  it('history entries hold only a random key: no need, search or listing id', () => {
    const b = browser(['sal_dv']); b.router.start('');
    b.router.navigate(help); b.router.navigate(need); b.router.navigate({ v: 'detail', id: 'sal_dv' }); b.router.navigate({ v: 'search' });
    for (const s of b.states()) expect(s === null || (Object.keys(s as object).join() === 'k' && /^e\d+$/.test((s as { k: string }).k))).toBe(true);
    expect(JSON.stringify(b.states())).not.toMatch(/unsafe|sal_dv|search|need/);
  });
  it('need screens, search, and sensitive listings leave the URL as it was', () => {
    const b = browser(['sal_dv']); b.router.start('');
    b.router.navigate(help); b.router.navigate(need); b.router.navigate({ v: 'detail', id: 'sal_dv' });
    expect(b.urls()).toEqual(['/', '#/help', '/', '/']);
    expect(hashFor({ v: 'detail', id: 'sal_ok' }, () => false)).toBe('#/r/sal_ok');
  });
});

// Behaviour, driven through the same fake history a phone drives: what the address bar holds, and what Back
// finds there. Treatment and help after sexual assault are private (needs.ts PRIVATE_TOPS), so their browse-by-
// type list is as traceless as their listings — it used to write `#/c/treatment` and keep it (web review).
describe('a private kind of help leaves no trace, list screen included', () => {
  const treatment: View = { v: 'list', cat: 'treatment' }, food: View = { v: 'list', cat: 'food' };

  it('no URL, so no window title either; an ordinary category keeps both', () => {
    expect(hashFor(treatment, () => false, '/')).toBeNull();
    expect(hashFor({ v: 'list', cat: 'assault' }, () => false, '/')).toBeNull();
    expect(hashFor(food, () => false, '/')).toBe('#/c/food');
  });
  it('walking to it leaves the URL alone', () => {
    const b = browser(); b.router.start('');
    b.router.navigate(help); b.router.navigate(treatment); b.router.navigate({ v: 'detail', id: 'sal_t' });
    expect(b.urls()).toEqual(['/', '#/help', '/', '#/r/sal_t']);
  });
  it('quick exit, then Back: the browser has no trip to a treatment screen to go back to', () => {
    const b = browser(); b.router.start('');
    b.router.navigate(help);
    b.router.navigate(treatment);
    // Quick exit empties the stack and replaces the page. What the browser keeps is what matters.
    b.router.stack.length = 0;
    expect(b.urls().join(' ')).not.toMatch(/treatment/);
    expect(JSON.stringify(b.states())).not.toMatch(/treatment/);
  });
  it('a link that ARRIVES at a private screen is taken out of the address bar at once', () => {
    // A shared or bookmarked link, opened cold. Before this, `#/r/sal_dv` sat in the address bar for as long as
    // the screen was open, and stayed in the browser's own history list afterwards.
    const dv = browser(['sal_dv']);
    dv.router.start('#/r/sal_dv');
    expect(dv.top()).toEqual({ v: 'detail', id: 'sal_dv' });
    expect(dv.url()).toBe('/');
    // And the same link followed while the app is already open.
    const open = browser(['sal_dv']); open.router.start(''); open.router.navigate(help);
    open.openLink('#/c/treatment');
    expect(open.top()).toEqual(treatment);
    expect(open.url()).toBe('/');
    // An ordinary screen is left exactly where it was: nothing else changes.
    const ok = browser(); ok.router.start('#/c/food');
    expect(ok.url()).toBe('#/c/food');
  });
});

describe('links nobody can trust', () => {
  it('an unknown or broken link opens Home or Help, never a half-built screen', () => {
    expect(fromHash('#/c/not_a_category')).toEqual(help);
    expect(fromHash('#/c/food')).toEqual({ v: 'list', cat: 'food' });
    for (const h of ['#/nope', '#/r', '#/r/', '#/about/x', '#/help/x', '#/r/<script>', '', '#']) expect(fromHash(h), h).toEqual({ v: 'tab', tab: 'home' });
  });
});

describe('every tab can be reached by its own URL', () => {
  // The Map tab writes #/map; before 2026-09-20 nothing read it back, so a shared map link opened Home.
  it('a tab URL round-trips', () => {
    for (const tab of TABS.map((x) => x.id)) {
      const h = hashFor({ v: 'tab', tab }, () => false, '/');
      expect(fromHash(h ?? '/')).toEqual({ v: 'tab', tab });
    }
  });
  it('a tab that no longer exists opens Home, never a half-built screen', () => {
    expect(fromHash('#/transit')).toEqual({ v: 'tab', tab: 'home' });
    expect(fromHash('#/nonsense')).toEqual({ v: 'tab', tab: 'home' });
  });
});

// Review, 2026-09-20: on a cold load the list has not loaded yet, so nobody knows whether an id is private.
// The app's `sensitive` fails closed until it does, then calls retrace().
describe('a listing link that arrives before the list has loaded', () => {
  function coldLoad(privateIds: string[]) {
    let loaded = false;
    const entries = [{ state: null as unknown, url: '/' }];
    const hist = {
      get state() { return entries[0]!.state; },
      pushState() { throw new Error('not used'); },
      replaceState(state: unknown, _: string, url?: string | null) { entries[0] = { state, url: url ?? entries[0]!.url }; },
    };
    const router = createRouter(hist, { sensitive: (id) => !loaded || privateIds.includes(id), path: () => '/' });
    return { router, url: () => entries[0]!.url, open(hash: string) { entries[0]!.url = '/' + hash; router.start(hash); }, listLoads() { loaded = true; router.retrace(); } };
  }

  it('takes a private listing out of the address bar at once, and never puts it back', () => {
    const b = coldLoad(['sal_dv_x']);
    b.open('#/r/sal_dv_x');
    expect(b.url()).toBe('/');
    expect(b.router.top()).toEqual({ v: 'detail', id: 'sal_dv_x' });
    b.listLoads();
    expect(b.url()).toBe('/');
  });

  it('gives a public listing its address back once the list says it is public', () => {
    const b = coldLoad(['sal_dv_x']);
    b.open('#/r/sal_pantry');
    expect(b.url()).toBe('/');
    b.listLoads();
    expect(b.url()).toBe('#/r/sal_pantry');
    expect(b.router.top()).toEqual({ v: 'detail', id: 'sal_pantry' });
  });
});
