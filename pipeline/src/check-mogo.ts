// Does MoGo's own feed say the bikes can be rented? (Kyle, 2026-10-23, after MoGo paused and nothing here noticed.)
//
// The map's MoGo layer comes from the City's "MoGo Stations" open-data layer, which is a list of docks and says
// nothing about whether they are in service: on 2026-10-23, the day after MoGo "closed for the season", that layer
// still listed all 81 stations and nothing in this repository had changed. MoGo's own GBFS feed had: every station
// reported is_renting=false. This is the first machine-watched status source, and it works like every other open
// data re-read: it writes one small committed file, a night on which only the date moved is committed without
// review, and any other change — paused, back, a feed that cannot be read, a station count that moved — opens a
// pull request for a person (pipeline/src/ingest-changes.ts). Nothing in the app changes by itself.
//
//   pnpm check:mogo            (nightly, from .github/workflows/publish.yml)
//
// The feed address is the one the public GBFS catalogue lists for "Mogo Detroit"
// (https://github.com/MobilityData/gbfs/blob/master/systems.csv). The feed is run for MoGo by Lyft (its
// feed_contact_email), with no reuse terms published; this reads one number out of it and keeps no copy.
// The request identifies itself as every pipeline request does (page-match.ts).
import { existsSync, readFileSync } from 'node:fs';
import { fetchPage } from './page-match.js';
import { p, today, writeJson } from './util.js';

export const MOGO_FEED = 'https://detroit.publicbikesystem.net/customer/gbfs/v3.0/station_status';
export const MOGO_STATUS = 'data/ingested/transit/mogo-status.json';

export interface MogoStatus {
  /** The day this was read (Detroit); the one field a nightly run may change without review. */
  fetched_at: string;
  feed: string;
  /** `open`: at least one station is renting. `paused`: stations exist and none is. `unreachable`: no answer, or not a feed. */
  state: 'open' | 'paused' | 'unreachable';
  /** Stations the feed lists, when it could be read. Bikes available are not kept: they move every hour. */
  stations?: number;
  renting?: number;
  /** The feed's own words for why it could not be read. */
  why?: string;
}

/** What the feed says, from its text. A body that is not a station_status feed is `unreachable`, with the reason. */
export function readStatus(body: string, day: string, feed = MOGO_FEED): MogoStatus {
  let stations: { is_renting?: unknown; is_installed?: unknown }[];
  try {
    const j = JSON.parse(body) as { data?: { stations?: unknown } };
    if (!Array.isArray(j.data?.stations)) return { fetched_at: day, feed, state: 'unreachable', why: 'no data.stations in the answer' };
    stations = j.data.stations as typeof stations;
  } catch {
    return { fetched_at: day, feed, state: 'unreachable', why: 'the answer is not JSON' };
  }
  const installed = stations.filter((s) => s.is_installed !== false);
  const renting = installed.filter((s) => s.is_renting === true).length;
  if (installed.length === 0) return { fetched_at: day, feed, state: 'unreachable', why: 'the feed lists no stations' };
  return { fetched_at: day, feed, state: renting > 0 ? 'open' : 'paused', stations: installed.length, renting };
}

/** Reads the feed and writes the status file. Returns what was written. */
export async function checkMogo(day = today(), fetcher = fetchPage): Promise<MogoStatus> {
  const res = await fetcher(MOGO_FEED);
  const status: MogoStatus = res.ok ? readStatus(res.html, day) : { fetched_at: day, feed: MOGO_FEED, state: 'unreachable', why: res.why };
  const file = p(MOGO_STATUS);
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as MogoStatus).state : undefined;
  writeJson(file, status);
  console.log(`MoGo feed: ${status.state}${status.stations !== undefined ? ` (${status.renting} of ${status.stations} stations renting)` : ` (${status.why})`}${before && before !== status.state ? ` — was ${before}; this opens a pull request for a person` : ''}`);
  return status;
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/check-mogo.ts')) {
  checkMogo().catch((e) => { console.error(String((e as Error).message)); process.exit(1); });
}
