import { beforeEach, describe, expect, it, vi } from 'vitest';

// The phone's storage, in memory.
const store = new Map<string, unknown>();
vi.mock('../src/data.js', () => ({
  idbGet: async (k: string) => structuredClone(store.get(k)),
  idbSet: async (k: string, v: unknown) => { await new Promise((r) => setTimeout(r, 5)); store.set(k, structuredClone(v)); },
}));
const { outbox, retryable } = await import('../src/outbox.js');
const report = await import('../src/report.js');

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));
beforeEach(() => store.clear());

describe('offline outbox (reports and proposals)', () => {
  it('rate-limited, busy, timed out or unreachable: kept to try again; any other answer: done', () => {
    for (const s of [429, 408, 500, 502, 503]) expect(retryable(s), String(s)).toBe(true);
    for (const s of [200, 201, 202, 400, 404, 413, 422]) expect(retryable(s), String(s)).toBe(false);
  });
  it('two flushes at once send each item exactly once', async () => {
    store.set('q', ['a', 'b', 'c']);
    const sent: string[] = [];
    const box = outbox<string>('q', 50, async (x) => { await tick(3); sent.push(x); return { sent: true }; });
    await Promise.all([box.flush(), box.flush()]);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(store.get('q')).toEqual([]);
  });
  it('an item that fails while a flush is running is kept, not overwritten by the flush', async () => {
    store.set('q', ['old']);
    const box = outbox<string>('q', 50, async (x) => { await tick(3); return x === 'old' ? { sent: true } : { sent: false }; });
    const flushing = box.flush();
    const r = await box.submit('new');
    await flushing;
    expect(r.sent).toBe(false);
    expect(store.get('q')).toEqual(['new']);
  });
  it('keeps only the newest items when full', async () => {
    const box = outbox<number>('q', 3, async () => ({ sent: false }));
    for (const n of [1, 2, 3, 4, 5]) await box.submit(n);
    expect(store.get('q')).toEqual([3, 4, 5]);
  });
  it('says how many are waiting, and throws them away when a person asks', async () => {
    const box = outbox<number>('q', 50, async () => ({ sent: false }));
    expect(await box.count()).toBe(0);
    for (const n of [1, 2, 3]) await box.submit(n);
    expect(await box.count()).toBe(3);
    await box.clear();
    expect(await box.count()).toBe(0);
    expect(store.get('q')).toEqual([]);
    // Clearing waits its turn like everything else, so a flush in flight cannot put them back.
    store.set('q', ['a', 'b']);
    const slow = outbox<string>('q', 50, async () => { await tick(4); return { sent: false }; });
    await Promise.all([slow.flush(), slow.clear()]);
    expect(await slow.count()).toBe(0);
  });
});

// "Make a new key" (Your privacy) promises that nothing sent after it can be matched to anything sent before.
// A report queued under the old key and posted later carried the OLD hash, hours after the UI said the key was
// reset (web review, 2026-09-20). The hash is now worked out at the moment the report leaves.
describe('a report waiting on the phone is hashed with the key it is finally sent under', () => {
  it('the same report gets a different one-day hash after the key is reset', async () => {
    const when = new Date('2026-09-18T17:45:00Z');
    const queuedYesterday = await report.build('sal_a', 'confirmed_ok', '', when);
    const first = await report.withCurrentNonce(queuedYesterday);
    expect(first.client_nonce).toBe(queuedYesterday.client_nonce);       // nothing changed yet
    await report.resetInstallSecret();
    const after = await report.withCurrentNonce(queuedYesterday);
    expect(after.client_nonce).not.toBe(first.client_nonce);
    expect(after.client_nonce).toMatch(/^[a-f0-9]{64}$/);
    // Everything else about the report is untouched: same place, same kind, same day.
    expect({ ...after, client_nonce: '' }).toEqual({ ...queuedYesterday, client_nonce: '' });
    // And the day is still the day it was SEEN, so yesterday's report still dedupes against yesterday.
    expect(after.client_nonce).toBe(await report.nonce('sal_a', when));
  });

  it('the queue remembers which places already have something waiting', async () => {
    store.set('queue', [{ target_id: 'sal_a', kind: 'confirmed_ok', observed_at: '2026-09-18T17:45Z', client_nonce: 'x' },
      { target_id: 'sal_a', kind: 'wrong_hours', observed_at: '2026-09-18T18:00Z', client_nonce: 'y' },
      { target_id: 'seg_b', kind: 'light_out', observed_at: '2026-09-18T18:10Z', client_nonce: 'z' }]);
    expect((await report.queuedTargets()).sort()).toEqual(['sal_a', 'seg_b']);
    expect(await report.queuedCount()).toBe(3);
    await report.clearQueue();
    expect(await report.queuedTargets()).toEqual([]);
  });
});
