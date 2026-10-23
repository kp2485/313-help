// The MoGo feed check (pipeline/src/check-mogo.ts). Never touches the network: the reader runs over small made-up
// feeds, and the committed status file is held to the shape the nightly diff relies on.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOGO_FEED, MOGO_STATUS, readStatus, type MogoStatus } from '../src/check-mogo.js';
import { onlyRefreshed } from '../src/ingest-changes.js';
import { p } from '../src/util.js';

const feed = (stations: object[]) => JSON.stringify({ last_updated: '2026-10-23T15:44:24Z', ttl: 30, data: { stations }, version: '3.0' });
const st = (is_renting: boolean, is_installed = true) => ({ station_id: '1', is_installed, is_renting, is_returning: is_renting, num_vehicles_available: is_renting ? 2 : 0 });

describe('what MoGo\'s feed says', () => {
  it('open while any installed station rents', () => {
    expect(readStatus(feed([st(true), st(false), st(true)]), '2026-10-23')).toEqual({ fetched_at: '2026-10-23', feed: MOGO_FEED, state: 'open', stations: 3, renting: 2 });
  });
  it('paused when stations exist and none rents — what the feed said on 2026-10-23', () => {
    const s = readStatus(feed(Array.from({ length: 81 }, () => st(false))), '2026-10-23');
    expect(s.state).toBe('paused');
    expect([s.stations, s.renting]).toEqual([81, 0]);
  });
  it('a station that is not installed counts for nothing', () => {
    expect(readStatus(feed([st(false, false), st(true, false)]), '2026-10-23').state).toBe('unreachable');
  });
  it('an answer that is not a feed is unreachable, with the reason, never paused', () => {
    expect(readStatus('<html>maintenance</html>', '2026-10-23')).toMatchObject({ state: 'unreachable', why: 'the answer is not JSON' });
    expect(readStatus('{"errorCode":"NOT_FOUND"}', '2026-10-23')).toMatchObject({ state: 'unreachable', why: 'no data.stations in the answer' });
  });
});

describe('the committed status file', () => {
  const file = p(MOGO_STATUS);
  it('exists, names the feed, and has one of the three states', () => {
    expect(existsSync(file)).toBe(true);
    const s = JSON.parse(readFileSync(file, 'utf8')) as MogoStatus;
    expect(s.feed).toBe(MOGO_FEED);
    expect(['open', 'paused', 'unreachable']).toContain(s.state);
    expect(s.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('a night on which only the date moved is a refresh; a change of state is for a person', () => {
    const before = JSON.stringify({ fetched_at: '2026-10-23', feed: MOGO_FEED, state: 'paused', stations: 81, renting: 0 });
    expect(onlyRefreshed(MOGO_STATUS, before, before.replace('2026-10-23', '2026-10-24'))).toBe(true);
    expect(onlyRefreshed(MOGO_STATUS, before, before.replace('"paused"', '"open"').replace('"renting":0', '"renting":60'))).toBe(false);
    expect(onlyRefreshed(MOGO_STATUS, before, before.replace('"paused"', '"unreachable"'))).toBe(false);
  });
});
