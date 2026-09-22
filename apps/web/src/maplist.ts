// "See this map as a list": everything the map is showing, in words (docs/MAP-STYLE.md section 9). A plain
// function of what it is given — and it is given the STANDARD layer files only, never a `.net.json` file and never
// the map style — so the list is identical in `standard` and `subway`: same headings, same rows, same order, same
// links. A test (test/subway.test.ts) holds it to that. main.ts supplies the words (`T` escapes, `t` does not),
// the cards and the links. Bounded lists, so a cheap phone never draws thousands of rows.

export interface MapListInput<R, S extends { id: string; name: string; phase: string }> {
  rows: readonly R[];                                                     // help listings on the map, ranked
  overlays: readonly { label: string; lines: readonly { name: string }[]; points: readonly { name: string }[] }[];   // transport layers that are on and held
  parks: readonly { name: string }[]; segments: readonly S[];
  /** The neighbourhood and city outlines the map is drawing, when that layer is on — the same words the map puts
   *  over them, for a person who is reading the list instead of the picture (and for a screen reader, which the
   *  canvas cannot serve). `areasLabel` is the section's heading, the switcher's own wording. */
  areas?: readonly { name: string }[]; areasLabel?: string;
  /** A layer that is switched on but could not be read says so here too, not only in the switcher: the list is
   *  where a person looks when the map shows nothing. HTML, already escaped. */
  problems: readonly string[];
  T: (key: string, p?: Record<string, string | number>) => string; t: (key: string, p?: Record<string, string | number>) => string;
  owner: (s: unknown) => string; icon: (name: string, cls?: string) => string;
  card: (row: R) => string; segmentRow: (seg: S) => string; allParks: string;
}
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function mapListHtml<R, S extends { id: string; name: string; phase: string }>(o: MapListInput<R, S>): string {
  const { T } = o;
  // Route, stop and park names are written by the City, never by us: one English run, marked as one (WCAG 3.1.2),
  // so an Arabic screen keeps the whole list left to right instead of reordering it around every "·".
  const names = (list: string[], limit = 40) => `<p>${o.owner([...new Set(list)].filter(Boolean).slice(0, limit).join(' · '))}</p>${new Set(list).size > limit ? `<p class="foot">${T('map.list_more', { count: new Set(list).size - limit })}</p>` : ''}`;
  const parts = [
    o.rows.length ? `<h3>${T('map.list_help', { count: o.rows.length })}</h3><ul class="cards">${o.rows.slice(0, 20).map((r) => o.card(r)).join('')}</ul>${o.rows.length > 20 ? `<p class="foot">${T('map.list_more', { count: o.rows.length - 20 })}</p>` : ''}` : '',
    o.segments.length ? `<h3>${T('gw.title')}</h3><ul class="rows">${o.segments.map((s) => o.segmentRow(s)).join('')}</ul>` : '',
    o.parks.length ? `<h3>${T('rec.parks')} <span class="count">${o.parks.length}</span></h3>${names(o.parks.map((p) => p.name), 30)}${o.allParks}` : '',
    o.areas?.length && o.areasLabel ? `<h3>${escHtml(o.areasLabel)} <span class="count">${o.areas.length}</span></h3>${names(o.areas.map((a) => a.name), 30)}` : '',
    ...o.overlays.map((ov) => {
      const list = [...ov.lines.map((l) => l.name), ...ov.points.map((q) => q.name)].filter(Boolean);
      const count = ov.lines.length + ov.points.length;
      return `<h3>${escHtml(ov.label)} <span class="count">${count}</span></h3>${list.length ? names(list) : `<p class="foot">${T('map.list_unnamed', { count })}</p>`}`;
    }),
    ...o.problems,
  ].filter(Boolean);
  if (!parts.length) return `<h2>${T('map.list_title')}</h2><p class="empty">${T('map.list_none')}</p>`;
  // The heading lives inside the summary, so the sections below it are h3s under an h2 and the outline has no gap.
  return `<details class="browse maplist"><summary>${o.icon('info', 'sm')}<h2 class="sumh">${T('map.list_title')}</h2>${o.icon('chevron', 'sm turn dim')}</summary><div class="maplistbody">${parts.join('')}</div></details>`;
}
