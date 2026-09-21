// Interface language (docs/05 "Language"): English, Spanish, Arabic and Bengali. Only the app's own words are
// translated. What a place says about itself (name, what you get, who it is for, hours notes) stays as its owner
// wrote it, in English, and the screen says so: safety facts are never machine-translated.
//
// The choice is a preference, not a fact about a person: it is kept on the phone only and never sent.
//
// Arabic and Bengali were drafted by machine on 2026-09-20 and have not yet been read by a native speaker
// (DECISIONS 2026-09-20). The app never claims otherwise on screen.

import en from '../../../strings/en.json';
import { idbGet, idbSet } from './data.js';

export type Lang = 'en' | 'es' | 'ar' | 'bn';

/** Every language, in the order the switch shows them, each named in its own words.
 *  A language's own name can only live here: a name has to be readable from inside every other language, so it
 *  cannot sit in a per-language strings file. Everything else about the switch comes from `strings/<lang>.json`. */
export const LANGS: readonly { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ar', name: 'العربية' },
  { code: 'bn', name: 'বাংলা' },
];
const isLang = (x: unknown): x is Lang => LANGS.some((l) => l.code === x);

/** The language control in the top bar (Kyle, 2026-09-20): one line, one control, the platform's own picker.
 *
 *  It lives here because everything it needs is here — the list, and each language's own name — and because a
 *  plain function that returns a string can be held to a test without a browser. The caller passes its own
 *  escaping and its own icon so this file keeps knowing nothing about the page.
 *
 *  A real `<select>`, not a menu of our own: on a cheap Android phone, and under Switch Control, VoiceOver or
 *  TalkBack, the operating system's own picker is the one thing certain to work, and none of the menu-button
 *  pattern is ours to get wrong. The visible name is the language in use, in its own words; every option
 *  carries its own `lang`, so a screen reader reads each name in the right voice (WCAG 3.1.2); and the name of
 *  the control itself ("Language") comes from the `<label>` that wraps it (4.1.2). */
export function langPicker(current: Lang, label: string, iconHtml: string, esc: (s: string) => string): string {
  const options = LANGS.map((l) => `<option value="${l.code}" lang="${l.code}"${l.code === current ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
  // The name is an `aria-label`, not text inside the `<label>`. A label that WRAPS a select has the select's
  // own subtree in it, and the name a browser computes from it comes out as "Language English Español العربية
  // বাংলা" — the whole list read back before anything else (checked live, 2026-09-21). The `<label>` stays,
  // because it is what makes the globe and the pill around it part of the control's hit area.
  return `<label class="langpick">${iconHtml}<select data-lang-select aria-label="${esc(label)}">${options}</select></label>`;
}

// English ships with the app. Every other language is its own small file, fetched only when it is chosen (or is
// the phone's language), so an English reader never downloads any of them. Each `import()` below is written out in
// full so the bundler gives each language its own chunk. Once fetched, the service worker keeps it for offline use.
const LOAD: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import('../../../strings/es.json'),
  ar: () => import('../../../strings/ar.json'),
  bn: () => import('../../../strings/bn.json'),
};
const TABLES: Partial<Record<Lang, Record<string, string>>> = { en };
let lang: Lang = 'en';

/** Load a language's words. False if they can't be fetched (no signal and never loaded): the app stays in English. */
async function load(l: Lang): Promise<boolean> {
  if (TABLES[l]) return true;
  if (l === 'en') return true;
  try { TABLES[l] = (await LOAD[l]()).default; return true; } catch { return false; }
}

export const currentLang = () => lang;
/**
 * For dates, times and numbers. Spanish as used in the United States: same calendar, same 12-hour clock.
 * Arabic and Bengali ask for Latin digits (`-u-nu-latn`): a phone number or a clock time has to match what a
 * person dials and what the sign on the door says (DECISIONS 2026-09-20).
 */
export const locale = () => ({ en: 'en-US', es: 'es-US', ar: 'ar-u-nu-latn', bn: 'bn-u-nu-latn' }[lang]);

/** A missing translation falls back to English, never to a blank or a raw key. */
export function t(key: string, p: Record<string, string | number> = {}): string {
  return (TABLES[lang]?.[key] ?? en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
}

export function pickLang(saved: unknown, browserLangs: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  // The phone's own order decides, not ours: the first of its languages we have words for wins.
  for (const want of browserLangs) {
    const code = want.toLowerCase().split('-')[0];
    if (isLang(code)) return code;
  }
  return 'en';
}

/** Languages that read right to left. The whole interface mirrors, because style.css uses logical properties. */
const RTL: readonly string[] = ['ar'];
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
