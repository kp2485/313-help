// Interface language (docs/05 "Language"): English and Spanish. Only the app's own words are translated.
// What a place says about itself (name, what you get, who it is for, hours notes) stays as its owner wrote it,
// in English, and the screen says so: safety facts are never machine-translated.
//
// The choice is a preference, not a fact about a person: it is kept on the phone only and never sent.

import en from '../../../strings/en.json';
import es from '../../../strings/es.json';
import { idbGet, idbSet } from './data.js';

export type Lang = 'en' | 'es';
const TABLES: Record<Lang, Record<string, string>> = { en, es };
let lang: Lang = 'en';

export const currentLang = () => lang;
/** For dates and times. Spanish as used in the United States: same calendar, same 12-hour clock. */
export const locale = () => (lang === 'es' ? 'es-US' : 'en-US');

/** A missing Spanish string falls back to English, never to a blank or a raw key. */
export function t(key: string, p: Record<string, string | number> = {}): string {
  return (TABLES[lang][key] ?? en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
}

export function pickLang(saved: unknown, browserLangs: readonly string[]): Lang {
  if (saved === 'en' || saved === 'es') return saved;
  return browserLangs.some((l) => l.toLowerCase().startsWith('es')) ? 'es' : 'en';
}

export async function initLang(): Promise<void> {
  lang = pickLang(await idbGet<string>('lang'), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export async function setLang(next: Lang): Promise<void> {
  lang = next;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  await idbSet('lang', lang);
}
