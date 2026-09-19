import { describe, expect, it } from 'vitest';
import { createRouter, fromHash, hashFor, type View } from '../src/router.js';

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

describe('links nobody can trust', () => {
  it('an unknown or broken link opens Home or Help, never a half-built screen', () => {
    expect(fromHash('#/c/not_a_category')).toEqual(help);
    expect(fromHash('#/c/food')).toEqual({ v: 'list', cat: 'food' });
    for (const h of ['#/nope', '#/r', '#/r/', '#/about/x', '#/help/x', '#/r/<script>', '', '#']) expect(fromHash(h), h).toEqual({ v: 'tab', tab: 'home' });
  });
});
