// All schedule math happens on a floating America/Detroit wall clock.
// A pantry's door sign says "Fridays 1:30"; that is 1:30 on the wall in July and in December.
// So we convert the current instant to Detroit wall time once, then compare wall to wall.
// No UTC offsets enter the schedule logic, which is why DST cannot break it.

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

export function parseTime(s: string): { hh: number; mm: number } {
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) throw new Error(`Bad time: ${s}`);
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 24 || mm > 59) throw new Error(`Bad time: ${s}`);
  return { hh, mm };
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
