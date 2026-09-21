// Holidays (schema/query-spec.md "Holidays").
//
// We do not know any place's holiday hours. A clinic's notice says "Closed Thanksgiving and Christmas" in prose
// nobody turned into a schedule, and no source hands us a holiday calendar. So on a holiday a schedule-derived
// "open" is a guess, and unknown is never rendered as open. `openNow` turns it into `holiday` instead.
//
// A holiday is a **date rule computed here**, never a list the bundle carries: a phone with a three-month-old copy
// of the list still knows that 25 December is Christmas. The eleven United States federal holidays, plus the
// observed day when a fixed-date one falls at a weekend. Nothing else: the day after Thanksgiving and Christmas Eve
// are deliberately out, because Detroit is largely open on them and calling a day a holiday costs a person the
// hours we do know (DECISIONS 2026-09-20).
//
// Ported as-is to apps/ios/Sources/DetroitQuery/Holidays.swift and
// apps/android/query/src/main/kotlin/org/help313/query/Holidays.kt.

import { dateToFloating, parseDate } from './time.js';

/** The flag a steward sets on a row whose owner's page says it is open on holidays. */
export const OPEN_HOLIDAYS_FLAG = 'open_holidays';

/** 0 = Monday … 6 = Sunday, for a floating local-midnight date. */
function weekday(dt: Date): number {
  return (dt.getUTCDay() + 6) % 7;
}

const MONDAY = 0, THURSDAY = 3, FRIDAY = 4, SATURDAY = 5, SUNDAY = 6;

/** The five holidays on a fixed calendar date; these are the ones that get an observed day. */
function isFixedDate(m: number, d: number): boolean {
  return (m === 1 && d === 1)        // New Year's Day
    || (m === 6 && d === 19)         // Juneteenth
    || (m === 7 && d === 4)          // Independence Day
    || (m === 11 && d === 11)        // Veterans Day
    || (m === 12 && d === 25);       // Christmas Day
}

/** Is this YYYY-MM-DD (a Detroit wall-clock date) a holiday? */
export function isHoliday(date: string): boolean {
  const { m, d } = parseDate(date);
  const dt = dateToFloating(date);
  const wd = weekday(dt);

  if (isFixedDate(m, d)) return true;

  // The Monday holidays, each pinned by the only week of the month its day can fall in.
  if (wd === MONDAY) {
    if (m === 1 && d >= 15 && d <= 21) return true;        // Martin Luther King Jr. Day, 3rd Monday
    if (m === 2 && d >= 15 && d <= 21) return true;        // Washington's Birthday, 3rd Monday
    if (m === 5 && d >= 25) return true;                   // Memorial Day, last Monday
    if (m === 9 && d <= 7) return true;                    // Labor Day, 1st Monday
    if (m === 10 && d >= 8 && d <= 14) return true;        // Columbus / Indigenous Peoples' Day, 2nd Monday
  }
  if (wd === THURSDAY && m === 11 && d >= 22 && d <= 28) return true;   // Thanksgiving, 4th Thursday

  // Observed days. Saturday → the Friday before; Sunday → the Monday after. Both days count, so Christmas 2027
  // (a Saturday) makes Friday the 24th a holiday and stays one itself. Looking at the neighbouring day rather than
  // at a list of dates is what makes 31 December 2027 come out right: 1 January 2028 is a Saturday.
  const shift = (days: number) => {
    const n = new Date(dt.getTime() + days * 86400000);
    return { m: n.getUTCMonth() + 1, d: n.getUTCDate(), wd: weekday(n) };
  };
  if (wd === FRIDAY) { const n = shift(1); if (n.wd === SATURDAY && isFixedDate(n.m, n.d)) return true; }
  if (wd === MONDAY) { const p = shift(-1); if (p.wd === SUNDAY && isFixedDate(p.m, p.d)) return true; }
  return false;
}

/** A holiday a row is held to: the row's own `open_holidays` flag turns the whole rule off for that row. */
export function holidayApplies(flags: string[], date: string): boolean {
  return !flags.includes(OPEN_HOLIDAYS_FLAG) && isHoliday(date);
}
