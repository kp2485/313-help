// What the map does under a thumb. The arithmetic of every gesture is a plain function in map.ts, held here to
// its own invariants; then the real MapView is driven through synthetic pointer events against the fake canvas,
// because "pinch zooms about the fingers" is a claim about the handlers, not only about the maths.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOUBLE_MS, DOUBLE_PX, FLING_STOP, PAN_X, PAN_Y, S_MAX, S_MIN, TAP_PX,
  MapView, dragZoom, ease, flingFrame, flingVelocity, gripOf, isSecondTap, isTap, panCam, pinchCam, wx, zoomAbout, type Cam,
} from '../src/map.js';
import { FakeEl, installPage } from './fakes.js';
import { baseSpec, serveBasemap } from './mapfixture.js';

const W = 390, H = 384;
const cam0: Cam = { cx: 0.01, cy: -0.02, s: 9000 };
/** Where a screen point lands on the map, which is the only thing "about a point" can mean. */
const world = (c: Cam, px: number, py: number) => ({ X: c.cx + (px - W / 2) / c.s, Y: c.cy + (py - H / 2) / c.s });

describe('the maths of a gesture', () => {
  it('zooming about a point leaves that point over the same place on the map', () => {
    for (const f of [1.8, 1 / 1.8, 1.05, 0.4]) for (const [px, py] of [[0, 0], [150, 220], [W, H], [W / 2, H / 2]]) {
      const before = world(cam0, px!, py!), after = world(zoomAbout(cam0, f, px!, py!, W, H), px!, py!);
      expect(after.X).toBeCloseTo(before.X, 12); expect(after.Y).toBeCloseTo(before.Y, 12);
    }
  });
  it('zoom keeps the two limits the whole app shares, and clamping still holds the point', () => {
    expect(zoomAbout(cam0, 1e6, 10, 10, W, H).s).toBeCloseTo(S_MAX, 6);
    expect(zoomAbout(cam0, 1e-6, 10, 10, W, H).s).toBeCloseTo(S_MIN, 6);
    const c = zoomAbout(cam0, 1e6, 10, 10, W, H);
    expect(world(c, 10, 10).X).toBeCloseTo(world(cam0, 10, 10).X, 12);
  });
  it('a pinch that also slides: the place under the fingers at the start is under them at the end', () => {
    let c = cam0;
    const a0 = { x: 100, y: 100 }, b0 = { x: 200, y: 200 };
    const start = world(c, ...[gripOf(a0, b0).mx, gripOf(a0, b0).my] as [number, number]);
    // three frames: spread apart, slide across, turn — one finger at a time, as a real hand does
    const frames: [{ x: number; y: number }, { x: number; y: number }][] = [
      [{ x: 80, y: 80 }, b0], [{ x: 80, y: 80 }, { x: 260, y: 260 }], [{ x: 120, y: 40 }, { x: 300, y: 210 }],
    ];
    let was = gripOf(a0, b0);
    for (const [a, b] of frames) { const now = gripOf(a, b); c = pinchCam(c, was, now, W, H); was = now; }
    const end = world(c, was.mx, was.my);
    expect(end.X).toBeCloseTo(start.X, 9); expect(end.Y).toBeCloseTo(start.Y, 9);
    expect(c.s).toBeGreaterThan(cam0.s);                       // the fingers did spread
  });
  it('a pan follows the finger and never lets the middle leave the city', () => {
    expect(panCam(cam0, 40, 0).cx).toBeCloseTo(cam0.cx - 40 / cam0.s, 12);
    const far = panCam(panCam(cam0, -1e7, -1e7), -1e7, -1e7);
    expect(far.cx).toBe(PAN_X); expect(far.cy).toBe(PAN_Y);
    expect(panCam(cam0, 1e7, 1e7).cx).toBe(-PAN_X);
  });
  it('a double tap is two taps close in time and place; nothing else is', () => {
    const first = { x: 100, y: 100, t: 1000 };
    expect(isSecondTap(first, { x: 105, y: 108, t: 1000 + DOUBLE_MS })).toBe(true);
    expect(isSecondTap(first, { x: 105, y: 108, t: 1000 + DOUBLE_MS + 1 })).toBe(false);
    expect(isSecondTap(first, { x: 100 + DOUBLE_PX + 1, y: 100, t: 1100 })).toBe(false);
    expect(isSecondTap(null, { x: 100, y: 100, t: 1100 })).toBe(false);
  });
  it('a tap is one finger that barely moved and never became a gesture', () => {
    expect(isTap(TAP_PX - 1, 1)).toBe(true);
    expect(isTap(TAP_PX, 1)).toBe(false);
    expect(isTap(0, 2)).toBe(false);                            // a pinch that happened to end still is not a tap
    expect(isTap(0, 1, true)).toBe(false);                      // the held second tap of a double tap
  });
  it('the fling reads the last moments of the drag, not the whole of it', () => {
    // A finger that crossed the map and then stopped dead for a while must not fling.
    const stopped = flingVelocity([{ x: 0, y: 0, t: 0 }, { x: 300, y: 0, t: 100 }, { x: 300, y: 0, t: 400 }]);
    expect(stopped.vx).toBe(0);
    const moving = flingVelocity([{ x: 0, y: 0, t: 0 }, { x: 40, y: 20, t: 950 }, { x: 80, y: 40, t: 1000 }]);
    expect(moving.vx).toBeCloseTo(0.8, 6); expect(moving.vy).toBeCloseTo(0.4, 6);
    expect(flingVelocity([]).vx).toBe(0);
    expect(flingVelocity([{ x: 0, y: 0, t: 0 }, { x: 9, y: 0, t: 3 }]).vx).toBe(0);   // too short to mean anything
  });
  it('momentum decays, carries a bounded distance, and dies at the pan limits', () => {
    let c: Cam = { cx: 0, cy: 0, s: 9000 }, v = { vx: -1.2, vy: 0 }, n = 0, done = false;
    const from = c.cx;
    while (!done && n++ < 2000) { const r = flingFrame(c, v, 16); c = r.cam; v = r.v; done = r.done; }
    expect(done).toBe(true);
    expect(Math.hypot(v.vx, v.vy)).toBeLessThan(FLING_STOP);
    // total carry is v/k pixels; it must be a real distance and a finite one
    const px = (c.cx - from) * 9000;
    expect(px).toBeGreaterThan(300); expect(px).toBeLessThan((1.2 / 0.0035) * 1.05);
    // and a fling that runs into the leash simply stops
    const stuck = flingFrame({ cx: PAN_X, cy: 0, s: 9000 }, { vx: -5, vy: 0 }, 16);
    expect(stuck.done).toBe(true); expect(stuck.cam.cx).toBe(PAN_X);
  });
  it('double-tap-and-drag: up is in, down is out, and coming back is exactly where you were', () => {
    expect(dragZoom(0)).toBe(1);
    expect(dragZoom(-100)).toBeGreaterThan(1);
    expect(dragZoom(100)).toBeLessThan(1);
    expect(dragZoom(-60) * dragZoom(60)).toBeCloseTo(1, 12);
  });
  it('the eased zoom starts at nothing and ends at all of it', () => {
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1); expect(ease(2)).toBe(1); expect(ease(-1)).toBe(0);
    expect(ease(0.5)).toBeGreaterThan(0.5);                     // ease-out: most of it early
  });
});

// ---- the real MapView, driven by pointer events ------------------------------------------------------------
let no = 0;
async function mapOn(more: { small?: boolean; media?: Record<string, boolean> } = {}) {
  const page = installPage({ width: W, height: H });
  Object.assign(page.media, more.media ?? {});
  const el = new FakeEl('div');
  if (more.small) el.classList.add('small');
  const view = new MapView(el as unknown as HTMLElement, baseSpec('gest' + ++no, []), serveBasemap());
  await new Promise((ok) => setTimeout(ok, 25));
  const canvas = page.canvases[page.canvases.length - 1]!;
  const priv = view as unknown as { cx: number; cy: number; s: number; X: (x: number) => number; Y: (y: number) => number; note: FakeEl };
  const cam = (): Cam => ({ cx: priv.cx, cy: priv.cy, s: priv.s });
  let clock = 1000;
  // `type` is part of the event, because the handlers read it: a pointerup is a tap and a pointercancel is not.
  const ev = (id: number, type: string, x: number, y: number, over: Record<string, unknown> = {}) =>
    canvas.fire(type, { type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: clock, ...over });
  const finger = (n: number) => ({ down: (x: number, y: number, o = {}) => ev(n, 'pointerdown', x, y, o), move: (x: number, y: number, o = {}) => ev(n, 'pointermove', x, y, o), up: (x: number, y: number, o = {}) => ev(n, 'pointerup', x, y, o) });
  return { view, canvas, cam, priv, finger, at: (ms: number) => { clock += ms; }, said: () => priv.note.innerHTML, destroy: () => view.destroy() };
}
const near = (a: number, b: number, d: number) => Math.abs(a - b) <= d;

describe('the map under a thumb', () => {
  it('two fingers zoom about their middle and pan with it, in one gesture', async () => {
    const m = await mapOn();
    const p1 = m.finger(1), p2 = m.finger(2);
    p1.down(100, 100); p2.down(200, 200);
    m.finger(1).move(100, 100);                               // the frame that sets the grip: nothing moves yet
    const start = world(m.cam(), 150, 150), was = m.cam();
    m.finger(1).move(80, 80); m.finger(2).move(260, 260);     // spread, and the middle slides to (170,170)
    const after = m.cam(), end = world(after, 170, 170);
    expect(after.s).toBeGreaterThan(was.s * 1.3);
    expect(near(end.X, start.X, 1e-6)).toBe(true);
    expect(near(end.Y, start.Y, 1e-6)).toBe(true);
    m.destroy();
  });
  it('one finger pans, and lets go with momentum that carries on and then stops', async () => {
    const m = await mapOn();
    const p = m.finger(1);
    p.down(200, 300);
    for (const y of [280, 250, 210, 170]) { m.at(16); p.move(200, y); }
    const held = m.cam();
    m.at(16); p.up(200, 150);
    const flung = m.cam();
    expect(flung.cy).toBeGreaterThan(held.cy);                // the map carried on in the same direction
    expect(flung.cy).toBeLessThanOrEqual(PAN_Y);
    m.destroy();
  });
  it('no momentum at all when the person asked for less motion', async () => {
    const m = await mapOn({ media: { 'prefers-reduced-motion': true } });
    const p = m.finger(1);
    p.down(200, 300);
    for (const y of [280, 250, 210, 170]) { m.at(16); p.move(200, y); }
    const held = m.cam();
    m.at(16); p.up(200, 150);
    expect(m.cam().cy).toBe(held.cy);
    m.destroy();
  });
  it('a double tap zooms in about the tap, and a two-finger tap zooms back out', async () => {
    const m = await mapOn({ media: { 'prefers-reduced-motion': true } });   // no animation: the end state, exactly
    const was = m.cam(), spot = world(was, 90, 260);
    const p = m.finger(1);
    p.down(90, 260); p.up(90, 260); m.at(120); p.down(90, 260); p.up(90, 260);
    const zoomed = m.cam();
    expect(zoomed.s).toBeCloseTo(was.s * 1.8, 6);
    expect(world(zoomed, 90, 260).X).toBeCloseTo(spot.X, 9);   // the tap stayed on the same place
    m.at(500);
    m.finger(1).down(100, 100); m.finger(2).down(200, 200); m.finger(1).up(100, 100); m.finger(2).up(200, 200);
    expect(m.cam().s).toBeCloseTo(zoomed.s / 1.8, 6);
    m.destroy();
  });
  it('the second tap, held, turns into a zoom about the first tap and selects nothing', async () => {
    const m = await mapOn({ media: { 'prefers-reduced-motion': true } });
    const was = m.cam(), spot = world(was, 150, 200);
    const p = m.finger(1);
    p.down(150, 200); p.up(150, 200); m.at(100);
    p.down(150, 200);
    m.at(16); p.move(150, 130);                                // held and dragged up: zoom in
    const zoomed = m.cam();
    expect(zoomed.s).toBeGreaterThan(was.s * 1.4);
    expect(world(zoomed, 150, 200).X).toBeCloseTo(spot.X, 9);
    m.at(16); p.move(150, 200);                                // back where it started: so is the map
    expect(m.cam().s).toBeCloseTo(was.s, 6);
    p.up(150, 200);
    await new Promise((ok) => setTimeout(ok, DOUBLE_MS + 40));
    expect(m.said()).not.toContain('Pantry');
    m.destroy();
  });
  it('a tap still picks a place — after the double-tap window, so no card flashes up and is thrown away', async () => {
    const m = await mapOn();
    const x = m.priv.X(wx(-83.06)), y = m.priv.Y(0.005);       // the fixture's one dot: 42.345, -83.06
    const p = m.finger(1);
    p.down(x, y); p.up(x, y);
    expect(m.said()).not.toContain('Pantry');                  // nothing yet: a second tap could still follow
    await new Promise((ok) => setTimeout(ok, DOUBLE_MS + 40));
    expect(m.said()).toContain('Pantry');
    m.destroy();
  });
  it('a mouse gets its card at once, and a double click selects and then zooms', async () => {
    const m = await mapOn();
    const x = m.priv.X(wx(-83.06)), y = m.priv.Y(0.005), was = m.cam();
    const p = m.finger(1);
    p.down(x, y, { pointerType: 'mouse' }); p.up(x, y, { pointerType: 'mouse' });
    expect(m.said()).toContain('Pantry');
    m.at(120); p.down(x, y, { pointerType: 'mouse' }); p.up(x, y, { pointerType: 'mouse' });
    expect(m.cam().s).toBeGreaterThan(was.s * 1.4);
    m.destroy();
  });
  it('a small inline map leaves one finger to the page and takes two; a mouse is never held back', async () => {
    const m = await mapOn({ small: true });
    const was = m.cam();
    const p = m.finger(1);
    p.down(200, 300); m.at(16); p.move(200, 200); m.at(16); p.up(200, 200);
    expect(m.cam()).toEqual(was);                              // the page scrolled; the map did not move
    m.at(500);
    m.finger(1).down(100, 100); m.finger(2).down(200, 200);
    m.finger(1).move(100, 100); m.finger(1).move(60, 60); m.finger(2).move(300, 300);
    expect(m.cam().s).toBeGreaterThan(was.s * 1.3);            // two fingers still pinch
    m.finger(1).up(60, 60); m.finger(2).up(300, 300);
    const pinched = m.cam();
    m.at(500);
    m.finger(3).down(200, 300, { pointerType: 'mouse' }); m.at(16); m.finger(3).move(200, 200, { pointerType: 'mouse' }); m.finger(3).up(200, 200, { pointerType: 'mouse' });
    expect(m.cam().cy).not.toBe(pinched.cy);
    m.destroy();
  });
  it('a trackpad pinch is a wheel with ctrlKey: it zooms about the pointer, and hard', async () => {
    const m = await mapOn();
    const plain = await mapOn();
    m.canvas.fire('wheel', { deltaY: -100, ctrlKey: true, clientX: 120, clientY: 90 });
    plain.canvas.fire('wheel', { deltaY: -100, clientX: 120, clientY: 90 });
    expect(m.cam().s).toBeGreaterThan(plain.cam().s * 1.5);
    expect(world(m.cam(), 120, 90).X).toBeCloseTo(world(plain.cam(), 120, 90).X, 9);
    m.destroy(); plain.destroy();
  });
});

describe('what the map source promises about touch', () => {
  const src = readFileSync(join(__dirname, '../src/map.ts'), 'utf8');
  const style = readFileSync(join(__dirname, '../src/style.css'), 'utf8');
  it('a finger down stops whatever the map was still doing by itself', () => {
    // Synthetic frames in a test all run at once, so "the fling stopped" is a claim about this line.
    expect(src).toContain('this.stopMotion();\n      c.setPointerCapture(e.pointerId);');
  });
  it('older iOS Safari is told no before it zooms the page', () => {
    expect(src).toContain("for (const g of ['gesturestart', 'gesturechange', 'gestureend']) (c as HTMLElement).addEventListener(g, (ev: Event) => ev.preventDefault(), { passive: false });");
    expect(src).toContain("c.addEventListener('wheel', (e) => { e.preventDefault();");
  });
  it('the canvas keeps the gesture, and only a small inline map hands one finger back to the page', () => {
    expect(style).toMatch(/\.mapframe canvas \{[^}]*touch-action:none/);
    expect(style).toMatch(/\.mapframe canvas \{[^}]*-webkit-user-select:none/);
    expect(style).toMatch(/\.mapframe canvas \{[^}]*-webkit-touch-callout:none/);
    expect(style).toMatch(/\.mapframe \{[^}]*overscroll-behavior:contain/);
    expect(style).toContain('.mapbox.small:not(.big) .mapframe canvas { touch-action:pan-y; }');
  });
});
