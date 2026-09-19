import { beforeEach, describe, expect, it, vi } from 'vitest';

// The phone's storage, in memory.
const store = new Map<string, unknown>();
vi.mock('../src/data.js', () => ({
  idbGet: async (k: string) => structuredClone(store.get(k)),
  idbSet: async (k: string, v: unknown) => { await new Promise((r) => setTimeout(r, 5)); store.set(k, structuredClone(v)); },
}));
const { outbox, retryable } = await import('../src/outbox.js');

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
});
