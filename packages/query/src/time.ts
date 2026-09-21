// All schedule math happens on a floating America/Detroit wall clock.
// A pantry's door sign says "Fridays 1:30"; that is 1:30 on the wall in July and in December.
// So we convert the current instant to Detroit wall time once, then compare wall to wall.
// No UTC offsets enter the schedule logic, which is why DST cannot break it.
//
// The one conversion asks `Intl.DateTimeFormat` for the zone, so this file carries **no zone rule of its own**: the
// platform's copy of tzdata answers, and it is right for all of Detroit's history. The iPhone does the same through
// Foundation. Android cannot — java.time needs API 26 — so apps/android/query/.../Time.kt writes the United States
// rule out by hand and is correct from 1987, clamping anything earlier to Eastern Standard Time the year round
// (Android review, 2026-09-20). The three therefore agree on every date this app handles and can only differ before
// 1987. No fixture pins a pre-1987 instant, because the three would not agree on one; Android pins its own clamp in
// FixtureTest.theZoneRuleIsClampedBefore1987, which records that 1985-07-01T12:00Z reads as 07:00 there and 08:00
// here. Nothing in this app has a date that old: every date is a schedule a place published, a day a steward wrote
// down, or the moment a bundle was built.

import type { WallMinutes } from './types.js';

export const ZONE = 'America/Detroit';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

export interface Wall { y: number; m: number; d: number; hh: number; mm: number }

export function toWall(instant: Date): Wall {
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return { y: parts.year!, m: parts.month!, d: parts.day!, hh: parts.hour! % 24, mm: parts.minute! };
}

export function wallMinutes(w: Wall): WallMinutes {
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm) / 60000;
}

export function nowWallMinutes(instant: Date): WallMinutes {
  return wallMinutes(toWall(instant));
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new Error(`Bad date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** "HH:MM" on a 24-hour clock, exactly. 24:00 is the end of the day; nothing later. */
export function parseTime(s: string): { hh: number; mm: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad time: ${s}`);
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 24 || mm > 59 || (hh === 24 && mm !== 0)) throw new Error(`Bad time: ${s}`);
  return { hh, mm };
}

/** A schedule date: exactly YYYY-MM-DD, and a day that exists (no 2026-02-30). */
export function parseScheduleDate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Bad date: ${s}`);
  const dt = dateToFloating(s);
  if (floatingToDateString(dt) !== s) throw new Error(`Bad date: ${s}`);
  return dt;
}

/** Floating UTC Date at local midnight of a YYYY-MM-DD. */
export function dateToFloating(s: string): Date {
  const { y, m, d } = parseDate(s);
  return new Date(Date.UTC(y, m - 1, d));
}

export function floatingToDateString(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function wallDateString(w: Wall): string {
  return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateToFloating(b).getTime() - dateToFloating(a).getTime()) / 86400000);
}

/**
 * Cheap phones lose their clock. If the device says it is earlier than the moment
 * the bundle was built, the device is wrong; use the bundle's time instead.
 */
export function effectiveNow(deviceNow: Date, bundleGeneratedAt?: string | null): Date {
  if (!bundleGeneratedAt) return deviceNow;
  const built = new Date(bundleGeneratedAt);
  return deviceNow.getTime() < built.getTime() ? built : deviceNow;
}
