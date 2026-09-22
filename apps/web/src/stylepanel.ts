// The "Map style" choice and the subway style's key, as HTML (docs/MAP-STYLE.md, sections 1 and 9). Plain
// functions of what they are given, so a test can read what a person is actually shown; main.ts supplies the
// words (`T` escapes, `t` does not) and says which layers are on.

import type { MapStyle } from './layers.js';

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Two real radio buttons in a fieldset with a legend, each with one line that says what it does, so the arrow
 *  keys, a switch and a screen reader already work. Nothing at all when the bundle has no subway data: there is
 *  nothing to choose between. `problems` is the "could not load / Try again" line, when there is one. */
export function styleSwitchHtml(o: { offered: boolean; style: MapStyle; T: (key: string) => string; problems?: string }): string {
  if (!o.offered) return '';
  const radio = (s: MapStyle) => `<label class="pick"><input type="radio" name="mapstyle" value="${s}" data-mapstyle="${s}"${o.style === s ? ' checked' : ''}><span>${o.T('map.style_' + s)} <small>${o.T(`map.style_${s}_note`)}</small></span></label>`;
  return `<fieldset class="mapstyle"><legend>${o.T('map.style')}</legend><div class="kinds">${radio('standard')}${radio('subway')}</div>${o.problems ?? ''}</fieldset>`;
}

/**
 * What the lines on the map mean, in words, each with a small drawn sample: only for what is switched on.
 *
 * Two things live in it. The dotted **boundary** line, whenever the outlines layer is on — in either map style,
 * because boundaries are drawn the same way in both (`areas` is the row's own words, or '' for no row) — and, in
 * the subway style, the transport rows. The QLINE's line is a drawing through its stations, and the key says so
 * whenever the data marks it `derived` (or has not arrived yet); if a real track ever ships, only the first
 * sentence is shown. One heading over the lot: two "What the lines mean" headings would be two keys.
 */
export function mapKeyHtml(o: { on: (layer: string) => boolean; derived?: boolean; areas?: string; t: (key: string) => string }): string {
  const bus = o.on('ddot_routes') || o.on('smart_routes'), rail = o.on('qline') || o.on('people_mover');
  const qline = o.derived === false ? o.t('map.key_qline').split(/[.।]\s/)[0]! : o.t('map.key_qline');
  // A line layer with no network of its own (bike lanes, MoGo) says nothing here on its own: that was true
  // before the boundary row existed and it stays true. The boundary row is its own reason for a key.
  const rows: [string, string, boolean][] = [
    ['bnd', o.areas ?? '', !!o.areas],
    ['freq', o.t('map.key_frequent'), bus], ['local', o.t('map.key_local'), bus], ['smart', o.t('map.key_smart'), o.on('smart_routes')], ['trunk', o.t('map.key_trunk'), bus],
    ['stop', o.t('map.key_station'), bus || rail || o.on('ddot_stops') || o.on('smart_stops')], ['change', o.t('map.key_change'), bus], ['end', o.t('map.key_end'), bus || o.on('qline')],
    ['qline', qline, o.on('qline')], ['dpm', o.t('map.key_dpm'), o.on('people_mover')], ['bike', o.t('map.key_bike'), o.on('bike_lanes')],
  ].filter((r, i) => r[2] && (i === 0 || bus || rail)) as [string, string, boolean][];
  if (!rows.length) return '';
  return `<h2 class="keyh">${escHtml(o.t('map.key'))}</h2><ul class="gwkey trkey">${rows.map(([cls, text]) => `<li><i class="${cls}"></i>${escHtml(text)}</li>`).join('')}</ul>`;
}
