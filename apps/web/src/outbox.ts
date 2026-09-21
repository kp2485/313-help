// Things waiting to be sent (reports, proposals), kept on this phone until they go (docs/05 "Offline").
// One queue operation at a time: two flushes (the app starting while the phone comes back online) can't send the
// same item twice, and an item added while a flush is writing back can't be lost.

import { idbGet, idbSet } from './data.js';

export type Sent<R> = { sent: true; result?: R } | { sent: false };

/** Worth trying again later: the server was busy, rate-limited us, timed out, or couldn't be reached. */
export const retryable = (status: number) => status >= 500 || status === 429 || status === 408;

export function outbox<T, R = undefined>(key: string, max: number, send: (item: T) => Promise<Sent<R>>) {
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <V>(fn: () => Promise<V>): Promise<V> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    /** Sends now if it can; otherwise keeps it (the newest `max`) and tries again later. */
    async submit(item: T): Promise<Sent<R>> {
      const r = await send(item);
      if (!r.sent) await locked(async () => idbSet(key, [...((await idbGet<T[]>(key)) ?? []), item].slice(-max)));
      return r;
    },
    /** How many are waiting. Shown on the Your privacy screen, so nothing is queued out of sight. */
    count: () => locked(async () => ((await idbGet<T[]>(key)) ?? []).length),
    /** Throw away everything waiting, without sending it. Nothing waiting is worth keeping against a person's
     *  wishes: this is their phone and their report. */
    clear: () => locked(async () => { await idbSet(key, []); }),
    /** Tries everything waiting; keeps what still didn't go. */
    flush: () => locked(async () => {
      const queue = (await idbGet<T[]>(key)) ?? [];
      if (!queue.length) return;
      const left: T[] = [];
      for (const item of queue) if (!(await send(item)).sent) left.push(item);
      await idbSet(key, left);
    }),
  };
}
