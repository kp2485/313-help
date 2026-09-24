// Hours, in words: a clock time, a date, and one line of a listing's schedule. One definition for every page that
// shows them — the app's listing screen (main.ts) and the page the people who run a listing check it on (owner.ts)
// — so a listing's hours read the same wherever they are shown. Nothing here reads the map or the page.

import type { Schedule } from '@313help/query';
import { currentLang, locale, t } from './i18n.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** What a place wrote about itself, marked as English wherever the page is in another language (3.1.2). */
const ownWords = (s: unknown) => (currentLang() === 'en' ? esc(s) : `<span lang="en">${esc(s)}</span>`);

/** A clock time. The digits stay Western in every language (DECISIONS 2026-09-20), but "am" and "pm" are our own
 *  two words and are translated like any other: Arabic writes ص and م, and `Intl` already says so in the alert
 *  lines, so leaving English here made one screen say both. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${t(h < 12 || h === 24 ? 'clock.am' : 'clock.pm')}`;
}
/** A clock time (or a range of them) ready to sit inside a right-to-left sentence as one left-to-right run. */
export const clockHtml = (...parts: string[]) => `<bdi>${parts.map(esc).join(' – ')}</bdi>`;

export function prettyDate(d: string): string {
  return d ? new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d.slice(0, 10))) : '';
}

const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
/** The days a schedule runs on, in our own words: "Mon – Fri", "Mon, Wed", "#2 Tue", or its one date. */
function daysLabel(s: Schedule): string {
  const codes = (s.byday ?? '').split(',').filter(Boolean);
  const days = codes.map((d) => { const m = /^([+-]?\d+)?(\w\w)$/.exec(d)!; return (m[1] ? `#${m[1]} ` : '') + t('day.' + m[2]); });
  const run = days.length > 2 && codes.every((d, i) => i === 0 || DAY_ORDER.indexOf(d) === DAY_ORDER.indexOf(codes[i - 1]!) + 1);
  // "Mon, Wed, Fri": the comma is the list separator of the language reading it, not always a Latin one.
  return !s.freq ? prettyDate(s.dtstart) : run ? `${days[0]} – ${days[days.length - 1]}` : days.join(t('list.sep'));
}
/** One schedule as one line of the hours list: the days in our own words, then the times. */
export function hoursLine(s: Schedule): string {
  return `<li><span>${esc(daysLabel(s))}</span><span>${clockHtml(clock(s.opens_at), clock(s.closes_at))}${s.description ? ` · ${ownWords(s.description)}` : ''}</span></li>`;
}
/** The same line as plain text, for a form a person edits (owner.ts). */
export function hoursPlain(s: Schedule): string {
  return `${daysLabel(s)} ${clock(s.opens_at)} – ${clock(s.closes_at)}${s.description ? ` · ${s.description}` : ''}`;
}
