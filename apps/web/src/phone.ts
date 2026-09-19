// Phone links. A listed number can carry an extension ("313-579-2100 ext. 4217"); run together, the digits would
// dial a stranger. The extension goes after a pause (",") so the phone dials the main number, waits, then keys it in.

const EXT = /\s*(?:ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i;

export function telHref(n: string): string {
  const m = EXT.exec(n);
  const main = (m ? n.slice(0, m.index) : n).replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1').replace(/^1(\d{10})$/, '+1$1');
  return `tel:${main}${m ? ',' + m[1] : ''}`;
}
