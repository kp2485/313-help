import type { Badge, BundleRow } from './types.js';
import { daysBetween, toWall, wallDateString } from './time.js';

// The badge states what we know, computed on the device from dated facts (docs/04).
// It never says "verified" for something no person checked, and a bundle that sits
// on an offline phone for months ages here, not at build time.

const TIER = {
  confirmed: 0, entry_checked: 1, unconfirmed: 2, source_listed: 2, never_checked: 3,
  reported_once: 4, reported_closed: 5, archived: 6,
} as const;

const SOURCE_RECENT_DAYS = 90;

function day(s: string): string { return s.slice(0, 10); }

export function badge(row: BundleRow, now: Date): Badge {
  const today = wallDateString(toWall(now));
  const f = row.facts;

  if (row.status === 'archived') {
    return { level: 'archived', key: 'badge.archived', params: { date: row.archived?.at ? day(row.archived.at) : '' }, tier: TIER.archived };
  }

  // A closed report counts until someone confirms the place is open *after* it.
  const closedAt = f.reports.closed_last_at ? day(f.reports.closed_last_at) : null;
  const confirmedAt = f.last_confirmed_at ? day(f.last_confirmed_at) : null;
  const closedStands = f.reports.closed_open > 0 && closedAt !== null
    && (confirmedAt === null || confirmedAt <= closedAt);
  if (closedStands) {
    return f.reports.closed_open >= 2
      ? { level: 'reported_closed', key: 'badge.reported_closed', params: { count: f.reports.closed_open, date: closedAt! }, tier: TIER.reported_closed }
      : { level: 'reported_once', key: 'badge.reported_once', params: { date: closedAt! }, tier: TIER.reported_once };
  }

  if (confirmedAt && daysBetween(confirmedAt, today) <= f.cadence_days) {
    const days = Math.max(0, daysBetween(confirmedAt, today));
    return { level: 'confirmed', key: `badge.confirmed.${f.last_confirm_method ?? 'community_confirm'}`, params: { days, date: confirmedAt }, tier: TIER.confirmed };
  }

  const enteredAt = f.checked_at_entry ? day(f.checked_at_entry) : null;
  if (enteredAt && daysBetween(enteredAt, today) <= f.cadence_days) {
    return { level: 'entry_checked', key: `badge.entry_checked.${f.entry_method ?? 'web'}`, params: { date: enteredAt }, tier: TIER.entry_checked };
  }

  const lastTouch = [confirmedAt, enteredAt].filter((d): d is string => d !== null).sort().pop();
  if (lastTouch) {
    return { level: 'unconfirmed', key: 'badge.unconfirmed', params: { date: lastTouch }, tier: TIER.unconfirmed };
  }

  // Present in a source, never checked by a person. Source presence is not verification,
  // so the badge only states the fact: whose list it is and when they last edited it.
  // A list its publisher touched recently reads differently from one untouched since 2016.
  const srcDate = f.source.last_edited ? day(f.source.last_edited) : null;
  if (srcDate && daysBetween(srcDate, today) <= SOURCE_RECENT_DAYS) {
    return { level: 'source_listed', key: 'badge.source_listed', params: { source: f.source.name, source_date: srcDate }, tier: TIER.source_listed };
  }
  return {
    level: 'never_checked',
    key: 'badge.never_checked',
    params: { source: f.source.name, source_date: f.source.last_edited ? day(f.source.last_edited) : '' },
    tier: TIER.never_checked,
  };
}

/** Bundle-age stages for the banner and the dead-man switch (docs/12). */
export type BundleAge = 'fresh' | 'aging' | 'old' | 'sunset';

export function bundleAge(index: { generated_at: string; heartbeat: string }, now: Date): BundleAge {
  const hours = (now.getTime() - new Date(index.generated_at).getTime()) / 3600000;
  const today = wallDateString(toWall(now));
  const heartbeatDays = daysBetween(index.heartbeat.slice(0, 10), today);
  // An automated job can keep building bundles; only a human advances the heartbeat.
  if (hours > 120 * 24 || heartbeatDays > 120) return 'sunset';
  if (hours > 30 * 24) return 'old';
  if (hours > 72) return 'aging';
  return 'fresh';
}
