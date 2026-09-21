// Where the cursor was, named by something that will still be true after the page is drawn again.
//
// Every screen is one `innerHTML =`, so a redraw that is not a new screen — a map layer arriving, a newer list
// landing, a window crossing the laptop line — replaces the very control a person had their cursor in, and the
// cursor falls to <body>. A screen reader then starts the page again from the top, mid-sentence. The callers
// that already know where they want the cursor say so (`refocusSel`); this is for the ones that do not.
//
// Nothing here is stored or sent: it is a CSS selector held for the length of one redraw.

/** Every value below goes inside a quoted attribute selector, where a backslash and a double quote are the only
 *  two characters that need anything doing to them. (`CSS.escape` would also do, but it is a browser API and it
 *  escapes far more than a quoted value needs, so the same code would produce two different selectors in a
 *  browser and in a test.) An id is matched as `[id="…"]` for the same reason. */
const q = (s: string) => s.replace(/["\\]/g, '\\$&');

/** The hooks the app already puts on the things a person clicks. An id wins over all of them. */
const HOOKS = ['data-layer', 'data-layer-retry', 'data-go', 'data-save', 'data-share', 'data-loc', 'data-report', 'data-lang'];

export interface FocusEl {
  id?: string;
  tagName?: string;
  name?: string;
  getAttribute(name: string): string | null;
  closest(selector: string): { getAttribute(name: string): string | null } | null;
}

/** A selector for `el`, or '' when there is nothing stable to point at. `inside` says the element is part of the
 *  region about to be redrawn; anything outside it (the live region, the browser's own chrome) is left alone. */
export function focusSelector(el: FocusEl | null, inside: (el: FocusEl) => boolean): string {
  if (!el || !inside(el)) return '';
  if (el.id) return `[id="${q(el.id)}"]`;
  for (const a of HOOKS) {
    const v = el.getAttribute(a);
    if (v !== null) return `[${a}="${q(v)}"]`;
  }
  // A field inside a report box is named by that box, so two listings on one screen never swap cursors.
  const target = el.closest('.report')?.getAttribute('data-target') ?? null;
  const within = target === null ? '' : `.report[data-target="${q(target)}"] `;
  if (el.name) return `${within}[name="${q(el.name)}"]`;
  if (el.tagName === 'TEXTAREA' && within) return `${within}textarea`;
  return '';
}
