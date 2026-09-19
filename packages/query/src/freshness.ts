import type { Badge, BundleRow } from './types.js';
import { daysBetween, toWall, wallDateString } from './time.js';

// The badge states what we know, computed on the device from dated facts (docs/04).
// It never says "verified" for something no person checked.
//
// No artificial timers (DECISIONS 2026-09-19): a listing's wording changes only when people report
// something. Time passing changes nothing but the dates we show, and the dates are always shown, so a
// reader can judge "checked in September" for themselves.

/** Sort keys only; never shown. Ranking uses only the reported-closed level (docs: query-spec "Ranking"). */
const TIER = {
  confirmed: 0, entry_checked: 1, source_listed: 2, never_checked: 3,
  reported_once: 4, reported_closed: 5, archived: 6,
} as const;

/** The calendar day of a stored date, on a Detroit calendar. "2026-09-20T01:30Z" is still Sept 19 in Detroit. */
export function detroitDay(s: string): string {
  if (!s.includes('T')) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : wallDateString(toWall(d));
}

export function badge(row: BundleRow, now: Date): Badge {
  const today = wallDateString(toWall(now));
  const f = row.facts;

  if (row.status === 'archived') {
    return { level: 'archived', key: 'badge.archived', params: { date: row.archived?.at ? detroitDay(row.archived.at) : '' }, tier: TIER.archived };
  }

  // A closed report counts until someone confirms the place is open *after* it.
  const closedAt = f.reports.closed_last_at ? detroitDay(f.reports.closed_last_at) : null;
  const confirmedAt = f.last_confirmed_at ? detroitDay(f.last_confirmed_at) : null;
  const closedStands = f.reports.closed_open > 0 && (closedAt === null || confirmedAt === null || confirmedAt <= closedAt);
  if (closedStands) {
    return f.reports.closed_open >= 2
      ? { level: 'reported_closed', key: 'badge.reported_closed', params: { count: f.reports.closed_open, date: closedAt ?? '' }, tier: TIER.reported_closed }
      : { level: 'reported_once', key: 'badge.reported_once', params: { date: closedAt ?? '' }, tier: TIER.reported_once };
  }

  if (confirmedAt) {
    const days = Math.max(0, daysBetween(confirmedAt, today));
    return { level: 'confirmed', key: `badge.confirmed.${f.last_confirm_method ?? 'community_confirm'}`, params: { days, date: confirmedAt }, tier: TIER.confirmed };
  }

  if (f.checked_at_entry) {
    return { level: 'entry_checked', key: `badge.entry_checked.${f.entry_method ?? 'web'}`, params: { date: detroitDay(f.checked_at_entry) }, tier: TIER.entry_checked };
  }

  // On a publisher's list, never checked by a person. Presence in a source is not verification, so the
  // badge states only the fact: whose list it is and when they last edited it.
  if (f.source.last_edited) {
    return { level: 'source_listed', key: 'badge.source_listed', params: { source: f.source.name, source_date: detroitDay(f.source.last_edited) }, tier: TIER.source_listed };
  }
  return { level: 'never_checked', key: 'badge.never_checked', params: { source: f.source.name, source_date: '' }, tier: TIER.never_checked };
}

/**
 * How old this phone's copy of the list is. It says nothing about any listing: it tells the person their phone
 * may be missing recent reports. "retired" only when a person published a final list marked retired
 * (DECISIONS 2026-09-19: shutdown only by a person; no timer ever retires the directory).
 */
export type BundleAge = 'fresh' | 'aging' | 'old' | 'retired';

export function bundleAge(index: { generated_at: string; retired?: boolean }, now: Date): BundleAge {
  if (index.retired === true) return 'retired';
  const built = new Date(index.generated_at).getTime();
  if (Number.isNaN(built)) return 'old';                     // an unreadable date is never shown as fresh
  const hours = (now.getTime() - built) / 3600000;
  if (hours > 30 * 24) return 'old';
  if (hours > 72) return 'aging';
  return 'fresh';
}
