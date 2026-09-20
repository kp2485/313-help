// Interface language (docs/05 "Language"): English and Spanish. Only the app's own words are translated.
// What a place says about itself (name, what you get, who it is for, hours notes) stays as its owner wrote it,
// in English, and the screen says so: safety facts are never machine-translated.
//
// The choice is a preference, not a fact about a person: it is kept on the phone only and never sent.

import en from '../../../strings/en.json';
import { idbGet, idbSet } from './data.js';

export type Lang = 'en' | 'es';
// English ships with the app. Spanish is its own small file, fetched only when it is chosen (or is the phone's
// language), so an English reader never downloads it. Once fetched, the service worker keeps it for offline use.
const TABLES: Partial<Record<Lang, Record<string, string>>> = { en };
let lang: Lang = 'en';

/** Load a language's words. False if they can't be fetched (no signal and never loaded): the app stays in English. */
async function load(l: Lang): Promise<boolean> {
  if (TABLES[l]) return true;
  try { TABLES[l] = (await import('../../../strings/es.json')).default; return true; } catch { return false; }
}

export const currentLang = () => lang;
/** For dates and times. Spanish as used in the United States: same calendar, same 12-hour clock. */
export const locale = () => (lang === 'es' ? 'es-US' : 'en-US');

/** A missing Spanish string falls back to English, never to a blank or a raw key. */
export function t(key: string, p: Record<string, string | number> = {}): string {
  return (TABLES[lang]?.[key] ?? en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
}

export function pickLang(saved: unknown, browserLangs: readonly string[]): Lang {
  if (saved === 'en' || saved === 'es') return saved;
  return browserLangs.some((l) => l.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

/** Languages that read right to left. Arabic and Bengali are next (Bengali reads left to right); when a language
 *  is added here the whole interface mirrors, because style.css uses logical properties throughout. */
const RTL: readonly string[] = [];
export const dirFor = (l: string) => (RTL.includes(l) ? 'rtl' : 'ltr');
function apply(l: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = l;
  document.documentElement.dir = dirFor(l);
}

export async function initLang(): Promise<void> {
  const want = pickLang(await idbGet<string>('lang'), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  lang = (await load(want)) ? want : 'en';
  apply(lang);
}

/** Switch language. False (and nothing changes) if the words can't be fetched right now. */
export async function setLang(next: Lang): Promise<boolean> {
  if (!(await load(next))) return false;
  lang = next;
  apply(lang);
  await idbSet('lang', lang);
  return true;
}
