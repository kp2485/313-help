import type { Alert, BundleRow } from './types.js';
import { rank, type Query, type Ranked } from './rank.js';

// Search runs on the device over the bundle. The text a person types is never stored or sent.
// Spec: schema/query-spec.md "Search". Fixtures: schema/fixtures/10-search.json.

const LETTER = /^\p{L}$/u, WORD = /^[\p{L}\p{N}]$/u, MARK = /\p{M}/gu;
const APOSTROPHES = new Set(["'", '’', '‘', 'ʼ']);

/**
 * Lowercase; accents and other combining marks removed; letters and digits of any script kept. Apostrophes join
 * ("Mary's" → "marys"); a dot joins single-letter abbreviations ("U.S." → "us") and otherwise separates, like
 * every other character. Words are separated by one space.
 */
export function normalizeText(s: string): string {
  const cs = Array.from(s.toLowerCase().normalize('NFD').replace(MARK, ''));
  let out = '', seg = 0; // seg: letters since the word began or since the last joining dot
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    if (WORD.test(c)) { out += c; seg++; continue; }
    if (APOSTROPHES.has(c) && seg > 0) continue;
    if (c === '.' && seg === 1 && LETTER.test(out.at(-1) ?? '') && LETTER.test(cs[i + 1] ?? '')) { seg = 0; continue; }
    if (out && !out.endsWith(' ')) out += ' ';
    seg = 0;
  }
  return out.trim();
}

/** Words of the query. A query with fewer than 2 letters or digits in total has no tokens. */
export function searchTokens(text: string): string[] {
  const words = normalizeText(text).split(' ').filter(Boolean);
  return Array.from(words.join('')).length < 2 ? [] : words;
}

const hits = (tokens: string[], fields: (string | undefined)[]): boolean => {
  const words = normalizeText(fields.filter(Boolean).join(' ')).split(' ');
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
};

export type Searchable = Pick<BundleRow, 'name'> & Partial<Pick<BundleRow, 'org' | 'what' | 'eligibility' | 'address'>>;

/**
 * 0: every token starts a word of the name. 1: of the name or organization.
 * 2: of any searched text (name, organization, what, who, street, ZIP). null: no match.
 */
export function matchTier(tokens: string[], row: Searchable): 0 | 1 | 2 | null {
  if (!tokens.length) return null;
  if (hits(tokens, [row.name])) return 0;
  if (hits(tokens, [row.name, row.org])) return 1;
  if (hits(tokens, [row.name, row.org, row.what, row.eligibility, row.address?.line1, row.address?.zip])) return 2;
  return null;
}

/** Matching active rows: best match tier first, then the one ranking rule. */
export function search(rows: BundleRow[], text: string, q: Query, now: Date, alerts: Alert[] = []): Ranked[] {
  const tokens = searchTokens(text);
  const tier = new Map<string, number>();
  for (const r of rows) { const m = matchTier(tokens, r); if (m !== null) tier.set(r.id, m); }
  return rank(rows.filter((r) => tier.has(r.id)), q, now, alerts)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => tier.get(a.r.row.id)! - tier.get(b.r.row.id)! || a.i - b.i)
    .map((x) => x.r);
}
