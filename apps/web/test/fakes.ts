// A page and a 2D canvas small enough to hold in a test, and honest enough that map.ts cannot tell. The vitest
// environment is Node with no DOM, so `installPage()` puts the handful of globals MapView touches in place, and
// every canvas it makes hands out a context that writes down each call and each property it is given — the
// drawing, as a list of lines, which is what a test can hold still.
//
// Also `FakeWorker`, the directions Worker with nothing behind it, for driving dirscreen.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FromWorker, ToWorker } from '../src/dirworker.js';

export type Call = string;
const fmt = (v: unknown): string => (typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : Array.isArray(v) ? `[${v.map(fmt).join(',')}]` : String(v));

/** A 2D context that records. Text is measured at 6 px a character, so label placement is repeatable. */
export function fakeContext(log: Call[]): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(_, k: string) {
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6 });
      if (k in state) return state[k];
      return (...a: unknown[]) => { log.push(`${k}(${a.map(fmt).join(',')})`); };
    },
    set(_, k: string, v) { state[k] = v; log.push(`${k}=${fmt(v)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

export class FakeEl {
  children: FakeEl[] = []; parentElement: FakeEl | null = null; listeners: Record<string, ((e: unknown) => void)[]> = {};
  attrs: Record<string, string> = {}; dataset: Record<string, string> = {}; className = ''; id = ''; textContent = ''; innerHTML = ''; tabIndex = -1; inert = false;
  width = 0; height = 0; log: Call[] = [];
  classList = { list: new Set<string>(), contains: (c: string) => this.classList.list.has(c), toggle: (c: string, on?: boolean) => { const want = on ?? !this.classList.list.has(c); if (want) this.classList.list.add(c); else this.classList.list.delete(c); return want; }, remove: (c: string) => this.classList.list.delete(c), add: (c: string) => this.classList.list.add(c) };
  private ctx: CanvasRenderingContext2D | null = null;
  constructor(public tag: string, private box = { width: 0, height: 0 }) {}
  getContext() { return (this.ctx ??= fakeContext(this.log)); }
  setAttribute(k: string, v: string) { this.attrs[k] = v; } getAttribute(k: string) { return this.attrs[k] ?? null; } removeAttribute(k: string) { delete this.attrs[k]; } hasAttribute(k: string) { return k in this.attrs; }
  append(...kids: FakeEl[]) { for (const k of kids) { k.parentElement = this; this.children.push(k); } } prepend(...kids: FakeEl[]) { this.append(...kids); }
  replaceChildren(...kids: FakeEl[]) { this.children = []; this.append(...kids); }
  remove() { /* not in a tree that matters */ } contains(n: unknown): boolean { return n === this || this.children.some((c) => c.contains(n)); }
  addEventListener(type: string, f: (e: unknown) => void) { (this.listeners[type] ??= []).push(f); } removeEventListener() { /* nothing to undo */ }
  fire(type: string, e: Record<string, unknown> = {}) { for (const f of this.listeners[type] ?? []) f({ preventDefault() {}, stopPropagation() {}, target: this, ...e }); }
  getBoundingClientRect() { return { left: 0, top: 0, ...this.box }; }
  querySelector(): FakeEl | null { return null; } querySelectorAll(): FakeEl[] { return []; }
  setPointerCapture() { /* no pointer */ } focus() { /* no cursor */ } click() { /* nothing */ }
}

/** The custom properties of one theme, as the browser would hand them to `getComputedStyle`. */
export function themeTokens(theme: 'light' | 'dark' = 'light'): Record<string, string> {
  const css = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
  const read = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  const light = read(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
  return theme === 'light' ? light : { ...light, ...read(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('* { box-sizing'))) };
}

export interface Page { canvases: FakeEl[]; media: Record<string, boolean>; frames: number }
/** Globals for one MapView: a document that makes FakeEls, a window, media queries that answer from `media`,
 *  frames that run at once, and computed styles that answer from style.css. `size` is the map frame's box. */
export function installPage(size = { width: 390, height: 384 }, tokens = themeTokens()): Page {
  const page: Page = { canvases: [], media: {}, frames: 0 };
  const g = globalThis as unknown as Record<string, unknown>;
  const doc = new FakeEl('html');
  g.document = {
    documentElement: doc, body: new FakeEl('body'), activeElement: null,
    createElement: (tag: string) => { const e = new FakeEl(tag, tag === 'div' ? size : { width: 0, height: 0 }); if (tag === 'canvas') page.canvases.push(e); return e; },
    addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  };
  g.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  g.getComputedStyle = () => ({ getPropertyValue: (n: string) => tokens[n] ?? '', fontSize: '16px' });
  g.matchMedia = (q: string) => ({ get matches() { return Object.entries(page.media).some(([k, v]) => v && q.includes(k)); }, addEventListener() {}, removeEventListener() {} });
  g.ResizeObserver = class { observe() {} disconnect() {} };
  g.requestAnimationFrame = (f: () => void) => { page.frames++; f(); return 0; };
  g.cancelAnimationFrame = () => {};
  return page;
}

/** The directions Worker with nothing behind it. Install it with `vi.stubGlobal('Worker', FakeWorker)`.
 *  `answer` decides what it says back, if anything (it may call dirworker.ts's own `handle`); `fail` is the
 *  browser reporting that the script could not be loaded or run. */
export class FakeWorker extends EventTarget {
  static made: FakeWorker[] = [];
  static answer: ((m: ToWorker) => FromWorker | null) = () => null;
  sent: ToWorker[] = [];
  terminated = false;
  constructor(public readonly url: URL | string) { super(); FakeWorker.made.push(this); }
  postMessage(m: ToWorker): void {
    this.sent.push(m);
    const reply = FakeWorker.answer(m);
    if (reply) queueMicrotask(() => { if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: reply })); });
  }
  terminate(): void { this.terminated = true; }
  fail(kind: 'error' | 'messageerror' = 'error'): void { this.dispatchEvent(new Event(kind)); }
}
