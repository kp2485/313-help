import * as rrulePkg from 'rrule';
import type { Alert, BundleRow, Occurrence, OpenResult, Schedule, WallMinutes } from './types.js';
import {
  dateToFloating, floatingToDateString, nowWallMinutes, parseScheduleDate, parseTime, toWall, wallMinutes,
} from './time.js';

// Node resolves rrule's CommonJS build (everything under `default`); bundlers resolve its ESM build
// (named exports). Take whichever is there.
type RRuleModule = typeof import('rrule');
// Reflect.get: a bundler sees the ESM build has no default export and warns about a plain `.default`.
const RRule: RRuleModule['RRule'] = (rrulePkg as unknown as RRuleModule).RRule ?? (Reflect.get(rrulePkg, 'default') as RRuleModule).RRule;

const CLOSES_SOON_MINUTES = 30;
const LOOKAHEAD_DAYS = 120;
const DAY = 1440;

const FREQ = { DAILY: RRule.DAILY, WEEKLY: RRule.WEEKLY, MONTHLY: RRule.MONTHLY, YEARLY: RRule.YEARLY } as const;
const WEEKDAY = { MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH, FR: RRule.FR, SA: RRule.SA, SU: RRule.SU } as const;

function parseByday(byday: string) {
  return byday.split(',').map((raw) => {
    const m = /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(raw.trim().toUpperCase());
    if (!m) throw new Error(`Bad BYDAY: ${raw}`);
    const day = WEEKDAY[m[2] as keyof typeof WEEKDAY];
    return m[1] ? day.nth(Number(m[1])) : day;
  });
}

function parseBymonthday(md: string): number[] {
  return md.split(',').map((raw) => {
    const t = raw.trim();
    const n = Number(t);
    if (!/^-?\d{1,2}$/.test(t) || n === 0 || n < -31 || n > 31) throw new Error(`Bad BYMONTHDAY: ${raw}`);
    return n;
  });
}

/**
 * Throws if the schedule cannot be evaluated. The pipeline calls this as a validator, and openNow skips a schedule
 * that fails it, so a bad schedule is never guessed at (a guess could say "open").
 */
export function assertScheduleValid(s: Schedule): void {
  parseScheduleDate(s.dtstart);
  if (s.until) parseScheduleDate(s.until);
  if (s.valid_from) parseScheduleDate(s.valid_from);
  if (s.valid_to) parseScheduleDate(s.valid_to);
  parseTime(s.opens_at);
  parseTime(s.closes_at);
  if (s.freq != null && !Object.hasOwn(FREQ, s.freq)) throw new Error(`Bad FREQ: ${s.freq}`);
  if (s.interval != null && !(Number.isInteger(s.interval) && s.interval >= 1)) throw new Error(`Bad INTERVAL: ${s.interval}`);
  // Only the shapes the spec defines (schema/query-spec.md "Occurrences"), so web and iPhone can't disagree.
  if (s.byday) {
    if (s.freq !== 'WEEKLY' && s.freq !== 'MONTHLY') throw new Error(`BYDAY needs FREQ=WEEKLY or MONTHLY: ${s.byday}`);
    // "2nd Tuesday" only means something within a month.
    if (s.freq === 'WEEKLY' && parseByday(s.byday).some((d) => d.n)) throw new Error(`A numbered BYDAY needs FREQ=MONTHLY: ${s.byday}`);
    parseByday(s.byday);
  }
  if (s.bymonthday) {
    if (s.freq !== 'MONTHLY') throw new Error(`BYMONTHDAY needs FREQ=MONTHLY: ${s.bymonthday}`);
    parseBymonthday(s.bymonthday);
  }
}

function isValid(s: Schedule): boolean {
  try { assertScheduleValid(s); return true; } catch { return false; }
}

/** Local calendar dates (floating) on which this schedule opens, within [from, to] inclusive. */
function occurrenceDates(s: Schedule, from: Date, to: Date): Date[] {
  const dtstart = dateToFloating(s.dtstart);
  let lo = from, hi = to;
  if (s.valid_from) { const v = dateToFloating(s.valid_from); if (v > lo) lo = v; }
  if (s.valid_to) { const v = dateToFloating(s.valid_to); if (v < hi) hi = v; }
  if (lo > hi) return [];

  if (!s.freq) {
    // One-off: a single date.
    return dtstart >= lo && dtstart <= hi ? [dtstart] : [];
  }
  const rule = new RRule({
    freq: FREQ[s.freq],
    interval: s.interval ?? 1,
    dtstart,
    until: s.until ? dateToFloating(s.until) : null,
    byweekday: s.byday ? parseByday(s.byday) : null,
    bymonthday: s.bymonthday ? parseBymonthday(s.bymonthday) : null,
  });
  return rule.between(lo, hi, true);
}

function toOccurrence(s: Schedule, date: Date): Occurrence {
  const o = parseTime(s.opens_at), c = parseTime(s.closes_at);
  const base = date.getTime() / 60000;
  const start = base + o.hh * 60 + o.mm;
  let end = base + c.hh * 60 + c.mm;
  if (end <= start) end += DAY; // runs past midnight
  return { date: floatingToDateString(date), opens_at: s.opens_at, closes_at: s.closes_at, start, end };
}

/** Wall-clock windows of published cancellation alerts that name this row. */
function cancelWindows(rowId: string, alerts: Alert[]): { start: WallMinutes; end: WallMinutes }[] {
  return alerts
    .filter((a) => a.kind === 'cancellation' && a.status === 'published' && a.targets?.includes(rowId))
    .map((a) => ({
      start: wallMinutes(toWall(new Date(a.starts_at))),
      end: wallMinutes(toWall(new Date(a.ends_at))),
    }));
}

function isCancelled(o: Occurrence, windows: { start: WallMinutes; end: WallMinutes }[]): boolean {
  // An occurrence is cancelled when it overlaps a cancellation window at all, so a cancellation posted after a
  // pantry opened closes it for the rest of that window.
  return windows.some((w) => o.start < w.end && o.end > w.start);
}

function allOccurrences(row: BundleRow, nowMin: WallMinutes, days: number): Occurrence[] {
  const today = new Date(Math.floor(nowMin / DAY) * DAY * 60000);
  const from = new Date(today.getTime() - 86400000); // yesterday, for overnight windows
  const to = new Date(today.getTime() + days * 86400000);
  const out: Occurrence[] = [];
  for (const s of row.schedules.filter(isValid)) {
    for (const d of occurrenceDates(s, from, to)) out.push(toOccurrence(s, d));
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function nextOccurrences(row: BundleRow, now: Date, n: number, alerts: Alert[] = []): Occurrence[] {
  if (row.status !== 'active' || row.availability !== 'scheduled') return [];
  const nowMin = nowWallMinutes(now);
  const windows = cancelWindows(row.id, alerts);
  return allOccurrences(row, nowMin, LOOKAHEAD_DAYS)
    .filter((o) => o.end > nowMin && !isCancelled(o, windows))
    .slice(0, n);
}

export function openNow(row: BundleRow, now: Date, alerts: Alert[] = []): OpenResult {
  if (row.status !== 'active') return { state: 'not_listed' };
  if (row.availability === 'always') {
    // Always open, unless a published cancellation covers right now.
    const nowMin = nowWallMinutes(now);
    return cancelWindows(row.id, alerts).some((w) => nowMin >= w.start && nowMin < w.end) ? { state: 'closed', next: null, cancelled_now: true } : { state: 'open' };
  }
  if (row.availability === 'call_first') return { state: 'call_first' };
  // Unknown is never rendered as open.
  // So is a schedule that can't be read: it is skipped, and with none left the listing is unknown.
  if (row.availability === 'unknown' || !row.schedules.some(isValid)) return { state: 'unknown' };

  const nowMin = nowWallMinutes(now);
  const windows = cancelWindows(row.id, alerts);
  const occ = allOccurrences(row, nowMin, LOOKAHEAD_DAYS).filter((o) => o.end > nowMin);

  let cancelledNow = false;
  let current: Occurrence | undefined;
  for (const o of occ) {
    if (o.start > nowMin) break;
    if (isCancelled(o, windows)) { cancelledNow = true; continue; }
    // Overlapping windows: keep the one that stays open longest.
    if (!current || o.end > current.end) current = o;
  }
  if (current) {
    const left = current.end - nowMin;
    return {
      state: left < CLOSES_SOON_MINUTES ? 'closes_soon' : 'open',
      closes_at: current.closes_at,
      minutes_left: left,
    };
  }
  const next = occ.find((o) => o.start > nowMin && !isCancelled(o, windows));
  return {
    state: 'closed',
    next: next ? { date: next.date, opens_at: next.opens_at, closes_at: next.closes_at } : null,
    ...(cancelledNow ? { cancelled_now: true } : {}),
  };
}
