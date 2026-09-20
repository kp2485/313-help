// Phone links. A listed number can carry an extension ("313-579-2100 ext. 4217"); run together, the digits would
// dial a stranger. The extension goes after a pause (",") so the phone dials the main number, waits, then keys it in.

const EXT = /\s*(?:ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i;

export function telHref(n: string): string {
  const m = EXT.exec(n);
  const main = (m ? n.slice(0, m.index) : n).replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1').replace(/^1(\d{10})$/, '+1$1');
  return `tel:${main}${m ? ',' + m[1] : ''}`;
}

/** The number as it is shown. Two rules, and both are accessibility rules:
 *  - `<bdi>` so a number keeps reading left to right inside Arabic text, which runs the other way;
 *  - the number and its extension are separate pieces, so at the largest text sizes a long number wraps
 *    BETWEEN them instead of running off the screen. `.callrow strong bdi` keeps each piece unbroken,
 *    so a number is never split in the middle and never truncated (CLAUDE.md). */
export function phoneParts(n: string): string[] {
  const m = EXT.exec(n);
  return m ? [n.slice(0, m.index).trim(), n.slice(m.index).trim()] : [n.trim()];
}
