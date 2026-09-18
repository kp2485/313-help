import * as rrulePkg from 'rrule';
import type { Alert, BundleRow, Occurrence, OpenResult, Schedule, WallMinutes } from './types.js';
import {
  dateToFloating, floatingToDateString, nowWallMinutes, parseTime, toWall, wallMinutes,
} from './time.js';

// Node resolves rrule's CommonJS build (everything under `default`); bundlers resolve its ESM build
// (named exports). Take whichever is there.
type RRuleModule = typeof import('rrule');
const RRule: RRuleModule['RRule'] = (rrulePkg as unknown as RRuleModule).RRule ?? (rrulePkg as unknown as { default: RRuleModule }).default.RRule;

const CLOSES_SOON_MINUTES = 30;
const LOOKAHEAD_DAYS = 120;
const DAY = 1440;

const FREQ = { DAILY: RRule.DAILY, WEEKLY: RRule.WEEKLY, MONTHLY: RRule.MONTHLY, YEARLY: RRule.YEARLY } as const;
const WEEKDAY = { MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH, FR: RRule.FR, SA: RRule.SA, SU: RRule.SU } as const;

function parseByday(byday: string) {
  return byday.split(',').map((raw) => {
    const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(raw.trim().toUpperCase());
    if (!m) throw new Error(`Bad BYDAY: ${raw}`);
    const day = WEEKDAY[m[2] as keyof typeof WEEKDAY];
    return m[1] ? day.nth(Number(m[1])) : day;
  });
}

/** Throws if the schedule cannot be evaluated. The pipeline calls this as a validator. */
export function assertScheduleValid(s: Schedule): void {
  dateToFloating(s.dtstart);
  if (s.until) dateToFloating(s.until);
  if (s.valid_from) dateToFloating(s.valid_from);
  if (s.valid_to) dateToFloating(s.valid_to);
  parseTime(s.opens_at);
  parseTime(s.closes_at);
  if (s.byday) parseByday(s.byday);
  if (s.freq && !(s.freq in FREQ)) throw new Error(`Bad FREQ: ${s.freq}`);
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
    bymonthday: s.bymonthday ? s.bymonthday.split(',').map((n) => Number(n.trim())) : null,
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
  // An occurrence is cancelled when it *opens* inside a cancellation window.
  return windows.some((w) => o.start >= w.start && o.start < w.end);
}

function allOccurrences(row: BundleRow, nowMin: WallMinutes, days: number): Occurrence[] {
  const today = new Date(Math.floor(nowMin / DAY) * DAY * 60000);
  const from = new Date(today.getTime() - 86400000); // yesterday, for overnight windows
  const to = new Date(today.getTime() + days * 86400000);
  const out: Occurrence[] = [];
  for (const s of row.schedules) {
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
  if (row.availability === 'always') return { state: 'open' };
  if (row.availability === 'call_first') return { state: 'call_first' };
  // Unknown is never rendered as open.
  if (row.availability === 'unknown' || row.schedules.length === 0) return { state: 'unknown' };

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
