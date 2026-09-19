// One strict way to ask "does this page still show this listing?", shared by check-sources (listings) and
// check-emergency (emergency numbers). A page is read as a person would see it: scripts, styles and tags removed.
// A phone number counts only as a whole phone number on the page (or in one of its tel: links), never as digits
// that happen to run together. A street address counts only as its house number followed closely by its street.
// A page we couldn't read (an error, or bot protection) is "unreadable": that is never a mismatch.

import { parsePhone } from './util.js';

export type PageResult = { ok: true; html: string } | { ok: false; why: string };

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; detroithelp-sourcecheck; open-source civic directory)' };

/** Fetch a page once. Bot-protection challenges and error answers come back as unreadable, with the reason. */
export async function fetchPage(url: string): Promise<PageResult> {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: UA });
    if (res.headers.get('cf-mitigated') === 'challenge') return { ok: false, why: 'bot protection' };
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const html = await res.text();
    return isChallenge(html) ? { ok: false, why: 'bot protection' } : { ok: true, html };
  } catch (e) { return { ok: false, why: `fetch failed: ${(e as Error).message}` }; }
}

/**
 * A bot-protection challenge page, not the real page. Only the challenge's own markers count: ordinary pages
 * behind Cloudflare also load a "challenge-platform" script, and those are real pages.
 */
export const isChallenge = (html: string) => /<title>\s*Just a moment|window\._cf_chl_opt|cf-chl-widget|id="challenge-form"/i.test(html);

const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '-', mdash: '-', hyphen: '-' };

/** The words a person would see: no scripts, styles or tags; entities decoded; spaces collapsed. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Letters on a keypad, so "1-800-866-THAW" is 8008668429.
const keypad = (s: string) => s.toUpperCase().replace(/[A-Z]/g, (c) => String('22233344455566677778889999'[c.charCodeAt(0) - 65]));

/**
 * Every whole US phone number on the page, as 10 digits: written ones ("(313) 555-0100", "313.555.0100",
 * "1-866-313-2520", "1-800-866-THAW") and tel: links. Digits that merely sit next to each other don't count.
 */
export function phonesOn(html: string): Set<string> {
  const out = new Set<string>();
  const add = (raw: string) => { const d = keypad(raw).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); if (d.length === 10) out.add(d); };
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) add(decodeURIComponent(m[1]!).split(/[,;]/)[0]!);
  const text = pageText(html);
  // Area code in parentheses or followed by a separator; then 3 and 4 characters with a separator between. A
  // separator is a dot or dash with up to two spaces around it, or one or two spaces: "(313)-400-7040",
  // "(313) 922 - 0033", "313.555.0100", "313 555 0100".
  const sep = '(?:\\s{0,2}[.-]\\s{0,2}|\\s{1,2})';
  const written = new RegExp(`(?<![\\w-])(?:\\+?1${sep}?)?(?:\\(\\d{3}\\)(?:\\s{0,2}[.-]?\\s{0,2})|\\d{3}${sep})[0-9A-Z]{3}${sep}[0-9A-Z]{4}(?![\\w-])`, 'g');
  for (const m of text.matchAll(written)) add(m[0]);
  // Ten digits written with no separators at all.
  for (const m of text.matchAll(/(?<![\w-])(?:1)?\d{10}(?![\w-])/g)) add(m[0]);
  return out;
}

export const phoneOnPage = (html: string, number: string): boolean => {
  const ph = parsePhone(number);
  return !!ph && ph.number.length === 10 && phonesOn(html).has(ph.number);
};

const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'north', 'south', 'east', 'west', 'ne', 'nw', 'se', 'sw']);

/** The house number and the first real word of the street: "2959 W. Grand Blvd" -> ["2959", "grand"]. */
export function streetKey(line1: string): [string, string] | null {
  const m = /^\s*(\d+)[A-Za-z]?\s+(.+)$/.exec(line1);
  if (!m) return null;
  const word = m[2]!.split(/[\s.,]+/).map((w) => w.toLowerCase()).find((w) => /^[a-z]{3,}$/.test(w) && !DIRECTIONS.has(w));
  return word ? [m[1]!, word] : null;
}

/**
 * The house number, then the street name, with only a direction or a numbered street between them:
 * "2959 Martin Luther King Jr. Blvd", "14 W. 7 Mile Rd". "Suite 2959, on Martin…" does not count.
 */
export function addressOnPage(html: string, line1: string): boolean {
  const key = streetKey(line1);
  if (!key) return false;
  const [no, word] = key;
  const between = '(?:[\\s,]+(?:[nsew]|north|south|east|west|\\d+(?:st|nd|rd|th)?)\\.?)*';
  return new RegExp(`(?<![\\w-])${no}${between}[\\s,]+${word}\\b`, 'i').test(pageText(html));
}

export interface ListingFacts { phone?: string; phone2?: string; address_1?: string }

/**
 * Does the page show this listing? Every listed phone must be on it; a listing with no phone must show its
 * street address (house number and street). A listing with an address must show that too.
 */
export function listingOnPage(html: string, r: ListingFacts): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [k, v] of [['phone', r.phone], ['phone2', r.phone2]] as const) if (v && !phoneOnPage(html, v)) missing.push(`${k} ${v}`);
  if (r.address_1 && streetKey(r.address_1) && !addressOnPage(html, r.address_1)) missing.push(`street address "${r.address_1}"`);
  if (!r.phone && !r.phone2 && !(r.address_1 && streetKey(r.address_1))) missing.push('a phone or a street address with a house number to look for');
  return { ok: missing.length === 0, missing };
}
