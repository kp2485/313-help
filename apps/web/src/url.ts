// What may become a link. Every address the app prints comes from the signed bundle or from links.ts, but a
// link is the one place where a string turns into something the browser will *run*: `javascript:` in an href
// executes on our own origin, inside the page that holds the report queue and the install key. So the schemes
// are an allow-list, not a block-list, and anything else is printed as plain words instead (docs/08).
//
// `tel:` dials, `geo:` and `maps:` open the phone's map, and `transit:` is the Transit app's own documented
// link (docs/08, "Handing a place to another app"). Nothing else is ever a link.

const OK = new Set(['http:', 'https:', 'tel:', 'geo:', 'maps:', 'transit:']);

/** The address if it is one we will link to, otherwise null (print it as text). */
export function safeUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // A scheme-relative "//evil.example" inherits our scheme, so it is judged against a base of our own origin.
  try {
    const u = new URL(s, 'https://313.invalid/');
    if (!OK.has(u.protocol)) return null;
  } catch { return null; }
  return s;
}
