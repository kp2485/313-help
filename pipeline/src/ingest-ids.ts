// Ids for rows read from an open-data source (DECISIONS 2026-09-22).
//
// An id is what a report, a saved place and a steward's decision hang on, so an id must never move from one
// record to another. Until 2026-09-21 an ingested id was minted from the address alone and the second record
// at a shared address got a name suffix, so which of two records held the plain id depended on the order the
// service happened to answer in. The City's Narcan layer has two boxes at 13601 W. McNichols; one night the
// service swapped them and `sal_hr_13601_w_mcnichols` silently changed from the Citgo record to the Amoco one.
//
// So: ids are keyed to the publisher's own permanent reference for the record.
//   * a record_ref we have handed an id to before KEEPS that id, whatever order it arrives in and even if its
//     name or its address text has changed (the changed text still shows up in the nightly pull request, which
//     is the point of the pull request);
//   * only a never-seen record_ref is minted a new id, and new records are minted in record_ref order so the
//     result does not depend on the answer's order either;
//   * an id that belonged to a record which has vanished from the source is NEVER handed to another record. It
//     is written to a committed `<source>.retired-ids.csv` tombstone — nothing is deleted, and if that record
//     comes back it gets its own id back.
//
// Sources without a permanent reference: Wayne County's Well Wayne Stations map is a published Google My Map
// and its KML carries no per-placemark id, so the best stable key it has is the city and site name it states
// ("[Hamtramck] Hamtramck City Hall"). The limit is real and worth saying plainly: if the County renames a
// station, we cannot tell that apart from a new station at the same site, so the renamed station gets a new id
// and the old one is retired.
//
// The City's Recreation Centers layer (`rec_centers`, staged) is the other one: data/sources.yaml maps no `ref`
// field for it, so its key is the site name alone, with the same limit. Giving a layer a `ref` later changes
// what its keys are, so the first run after that has no key it recognises: do it as a deliberate step, with a
// person reading the diff, not as a drive-by edit to data/sources.yaml.
// The Health Department's Narcan layer has a GlobalID and does not have this limit.

import { createHash } from 'node:crypto';
import { p, readCsv, type CsvRow } from './util.js';

export const RETIRED_COLUMNS = ['sal_id', 'record_ref', 'last_seen'];

/** One tombstone: an id that was handed out, the record it belonged to, and the last day that record was seen. */
export interface Retired { sal_id: string; record_ref: string; last_seen: string }

/** One record asking for an id. `key` is the publisher's reference; `base`/`alt` are slugs to mint from. */
export interface IdRequest { key: string; base: string; alt: string }

export interface PriorIds {
  /** record reference -> the id it already holds, from the file this source last committed. */
  ids: Map<string, string>;
  /** Ids of records that have since vanished from the source. Never handed to anything else. */
  retired: Retired[];
}

export const NO_PRIOR: PriorIds = { ids: new Map(), retired: [] };

/**
 * The publisher's own reference for a committed row: its record_ref, or — for a source that publishes none —
 * the city and name it states. One function for both kinds, so a missing GlobalID degrades the same way.
 */
export const recordKey = (r: CsvRow): string =>
  (r.record_ref ?? '').trim() || `${(r.city ?? '').trim()}|${(r.name ?? '').trim()}`;

/** Tombstones as plain CSV rows, ready for writeCsv. */
export const retiredRows = (retired: Retired[]): CsvRow[] => retired.map((t) => ({ ...t }));

/** Where a source's tombstones live: next to the file whose ids they retire. */
export const retiredPath = (dir: string, srcId: string) => p(dir, `${srcId}.retired-ids.csv`);

/** What a source committed last time: the ids it handed out, and the ids it has retired. */
export function readPrior(srcId: string, dirs = ['data/ingested', 'data/staging']): PriorIds {
  const ids = new Map<string, string>();
  const retired: Retired[] = [];
  for (const dir of dirs) {
    for (const r of readCsv(p(dir, `${srcId}.csv`))) {
      const key = recordKey(r);
      if (key && r.sal_id && !ids.has(key)) ids.set(key, r.sal_id);
    }
    for (const r of readCsv(retiredPath(dir, srcId))) {
      if (r.sal_id && r.record_ref && !retired.some((t) => t.sal_id === r.sal_id)) {
        retired.push({ sal_id: r.sal_id, record_ref: r.record_ref, last_seen: r.last_seen ?? '' });
      }
    }
  }
  return { ids, retired };
}

/**
 * One row per record reference. A source that answers twice for one reference is broken, and two rows sharing
 * an id would be worse than a dropped one, so the duplicate is reported and the row that sorts first is kept —
 * by what the row says, never by where in the answer it arrived.
 */
export function oneRowPerRecord(rows: CsvRow[]): { rows: CsvRow[]; warnings: string[] } {
  const byKey = new Map<string, CsvRow>();
  const warnings: string[] = [];
  const order = (r: CsvRow) => `${r.name ?? ''}|${r.address_1 ?? ''}|${r.city ?? ''}`;
  for (const r of [...rows].sort((a, b) => order(a).localeCompare(order(b)))) {
    const key = recordKey(r);
    if (byKey.has(key)) { warnings.push(`two records share the reference "${key}"; keeping "${byKey.get(key)!.name}"`); continue; }
    byKey.set(key, r);
  }
  return { rows: rows.filter((r) => byKey.get(recordKey(r)) === r), warnings };
}

const shortHash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);

export interface Assigned {
  /** record reference -> the id this run gives it. */
  ids: Map<string, string>;
  warnings: string[];
  /** The tombstone table to commit: what was retired before, plus anything that vanished tonight. */
  retired: Retired[];
  /** Records that were in the last committed file and are not in this answer. Reported, never silently dropped. */
  vanished: Retired[];
  kept: number;
  minted: number;
}

/**
 * Give every record an id, independent of the order the source returned them.
 * `lastSeen` is the date to stamp on a record that has just vanished.
 */
export function assignIds(prefix: string, requests: IdRequest[], prior: PriorIds, lastSeen: string): Assigned {
  const warnings: string[] = [];
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  const retiredByKey = new Map(prior.retired.map((t) => [t.record_ref, t]));

  // A source that answers twice for one reference is broken; say so and keep the first, in a fixed order, so
  // the file does not wobble from run to run while a person sorts it out with the publisher.
  const byKey = new Map<string, IdRequest>();
  for (const r of [...requests].sort((a, b) => `${a.key}|${a.base}|${a.alt}`.localeCompare(`${b.key}|${b.base}|${b.alt}`))) {
    if (byKey.has(r.key)) { warnings.push(`two records share the reference "${r.key}"; keeping the first`); continue; }
    byKey.set(r.key, r);
  }

  // 1. A record we have handed an id to before keeps it — including one coming back from the tombstones.
  const revived = new Set<string>();
  for (const [key] of byKey) {
    const had = prior.ids.get(key) ?? retiredByKey.get(key)?.sal_id;
    if (!had) continue;
    if (retiredByKey.has(key) && !prior.ids.has(key)) revived.add(key);
    ids.set(key, had);
    taken.add(had);
  }

  // 2. An id whose record has vanished is retired, not freed. Nothing else may ever be given it.
  const vanished: Retired[] = [];
  for (const [key, id] of prior.ids) {
    if (byKey.has(key)) continue;
    taken.add(id);
    vanished.push({ sal_id: id, record_ref: key, last_seen: lastSeen });
  }
  for (const t of prior.retired) if (!revived.has(t.record_ref)) taken.add(t.sal_id);

  // 3. Only a never-seen reference is minted, in reference order: the address, then the name, then a short
  //    stable hash of the reference itself, so a new box at an occupied address never disturbs the old one.
  let minted = 0;
  for (const r of [...byKey.values()].filter((x) => !ids.has(x.key)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const base = `${prefix}${r.base}`;
    const h = shortHash(r.key);
    let id = [base, `${base}_${r.alt}`, `${base}_${h}`].find((c) => c && !taken.has(c));
    for (let n = 2; !id; n++) if (!taken.has(`${base}_${h}_${n}`)) id = `${base}_${h}_${n}`;
    ids.set(r.key, id);
    taken.add(id);
    minted++;
  }

  // A layer that lists one address twice is usually one box entered twice. It is a person's job, not a
  // program's, so it is a warning that rides into the nightly pull request a steward reads.
  const atAddress = new Map<string, string[]>();
  for (const r of byKey.values()) atAddress.set(r.base, [...(atAddress.get(r.base) ?? []), r.alt]);
  for (const [base, names] of [...atAddress].sort()) {
    if (names.length > 1) warnings.push(`two records at one address in one category ("${base}": ${names.sort().join(', ')}); likely a duplicate in the layer — someone should look or call`);
  }
  for (const t of vanished) warnings.push(`${t.sal_id} (${t.record_ref}) is no longer in the source; its id is retired and will never be given to another record`);

  const retired = [...prior.retired.filter((t) => !revived.has(t.record_ref)), ...vanished]
    .sort((a, b) => a.sal_id.localeCompare(b.sal_id));
  return { ids, warnings, retired, vanished, kept: ids.size - minted, minted };
}

/**
 * The guard. By construction an id cannot move, so this can only fire if the minting above is ever changed
 * wrongly — which is exactly when we want the run to stop before it writes anything or opens a pull request.
 */
export function assertNoMovedIds(srcId: string, prior: PriorIds, rows: CsvRow[]): void {
  const moved: string[] = [];
  for (const r of rows) {
    const had = prior.ids.get(recordKey(r));
    if (had && had !== r.sal_id) moved.push(`${recordKey(r)} held ${had} and would now be ${r.sal_id}`);
  }
  if (moved.length) {
    throw new Error(`${srcId}: an id would move to a different record. Nothing was written.\n  ${moved.join('\n  ')}`);
  }
}
