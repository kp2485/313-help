import {
  badge, bundleAge, effectiveNow, helpAlong, nearestSegment, nextOccurrences, openNow, rank,
  type BundleRow, type OpenResult, type Query, type Ranked, type Schedule, type Segment,
} from '@detroithelp/query';
import strings from '../../../strings/en.json';
import { cached, refresh, type Bundle } from './data.js';
import { CATEGORIES, HARDCODED, NEEDS, type Need } from './needs.js';
import { CONFIRM, LISTING_KINDS, PLACE_KINDS, build as buildReport, flush, submit } from './report.js';
import './style.css';

// ---- state: memory only. Nothing about what a person taps is ever written or sent. ----------
type View =
  | { v: 'home' } | { v: 'more' } | { v: 'about' } | { v: 'greenway' }
  | { v: 'need'; id: string; refine?: string; all?: boolean }
  | { v: 'list'; cat: string } | { v: 'detail'; id: string } | { v: 'segment'; id: string };

let bundle: Bundle | undefined;
let loadError = false;
let here: { lat: number; lon: number } | null = null;   // device location: this variable only, never stored
let locDenied = false;
const reported = new Map<string, 'sent' | 'queued'>();   // this visit only, so the thank-you stays put
const stack: View[] = [{ v: 'home' }];
const app = document.getElementById('app')!;

// ---- helpers ----------------------------------------------------------------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const t = (key: string, p: Record<string, string | number> = {}) =>
  ((strings as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
const T = (key: string, p?: Record<string, string | number>) => esc(t(key, p));
const go = (view: View) => `data-go="${esc(JSON.stringify(view))}"`;
const now = () => effectiveNow(new Date(), bundle?.index.generated_at);
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}`;

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
}
function dayName(date: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(now());
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  if (diff === 0) return t('day.today');
  if (diff === 1) return t('day.tomorrow');
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
}
function prettyDate(d: string): string {
  return d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d.slice(0, 10))) : '';
}
function openText(o: OpenResult): string {
  switch (o.state) {
    case 'open': return o.closes_at ? t('open.open_until', { time: clock(o.closes_at) }) : t('open.open');
    case 'closes_soon': return t('open.closes_soon', { time: clock(o.closes_at!) });
    case 'closed': return o.cancelled_now ? t('open.cancelled') : o.next ? t('open.closed_next', { day: dayName(o.next.date), time: clock(o.next.opens_at) }) : t('open.closed_no_next');
    case 'call_first': return t('open.call_first');
    default: return t('open.unknown');
  }
}
function badgeText(row: BundleRow): { text: string; level: string } {
  const b = badge(row, now());
  const p = { ...b.params };
  for (const k of ['date', 'source_date'] as const) if (p[k]) p[k] = prettyDate(String(p[k]));
  return { text: t(b.key, p), level: b.level };
}
function emergency(id: string): { number: string; label: string; sms?: string } | null {
  const fromBundle = bundle?.emergency.find((e) => e.id === id);
  const number = (HARDCODED as Record<string, string>)[id] ?? fromBundle?.number;   // hardcoded always wins
  return number ? { number, label: fromBundle?.label ?? (id === 'emg_911' ? 'Emergency' : id === 'emg_988' ? 'Suicide and crisis lifeline' : number), sms: fromBundle?.sms } : null;
}
function callButton(id: string, big = false): string {
  const e = emergency(id);
  if (!e) return '';
  return `<a class="btn call ${big ? 'big' : ''} ${id === 'emg_911' ? 's911' : ''}" href="${telHref(e.number)}" aria-label="${T('strip.call_label', { label: e.label, number: e.number })}"><span>${esc(e.label)}</span><strong>${esc(e.number)}</strong></a>`;
}

// ---- pieces -----------------------------------------------------------------
function strip(): string {
  const shelter = emergency('emg_shelter_helpline');
  return `<nav class="strip" aria-label="Emergency numbers">
    <a class="s911" href="tel:911">${T('strip.911')}</a>
    ${shelter ? `<a href="${telHref(shelter.number)}" aria-label="${T('strip.call_label', { label: t('strip.shelter'), number: shelter.number })}">${T('strip.shelter')}</a>` : ''}
    <button ${go({ v: 'more' })}>${T('strip.more')}</button></nav>`;
}
function ageBanner(): string {
  if (!bundle) return '';
  const age = bundleAge(bundle.index, now());
  const days = Math.floor((now().getTime() - Date.parse(bundle.index.generated_at)) / 86400000);
  if (age === 'aging') return `<p class="banner warn">${T('bundle.aging', { days })} ${T('bundle.alerts_may_be_missing')}</p>`;
  if (age === 'old') return `<p class="banner warn">${T('bundle.old', { date: prettyDate(bundle.index.generated_at) })}</p>`;
  if (age === 'sunset') return `<p class="banner stop">${T('bundle.sunset')} <a href="tel:211">211</a></p>`;
  return '';
}
function header(title: string, quickExit = false): string {
  return `<header class="bar"><button class="back" data-back aria-label="${T('back')}">‹ ${T('back')}</button><h1 tabindex="-1">${esc(title)}</h1>
    ${quickExit ? `<button class="exit" data-exit>${T('safe.exit')}</button>` : ''}</header>`;
}
function locChip(): string {
  if (here) return `<p class="loc"><span>${T('loc.using')}</span> <button data-loc="off">${T('loc.off')}</button></p>`;
  return `<p class="loc"><button data-loc="on">${T('loc.use')}</button> <small>${T(locDenied ? 'loc.denied' : 'loc.note')}</small></p>`;
}
function card(r: Ranked, showDistance = true): string {
  const b = badgeText(r.row), ph = r.row.phones[0];
  return `<li class="card"><a class="cardlink" ${go({ v: 'detail', id: r.row.id })} href="#/r/${esc(r.row.id)}">
      <h3>${esc(r.row.name)}</h3><p>${esc(r.row.what)}</p>
      <p class="open ${r.open.state}">${esc(openText(r.open))}${showDistance && r.miles !== null ? ` · ${T('miles', { miles: r.miles.toFixed(1) })}` : ''}</p>
      ${r.row.notice ? `<p class="notice">${esc(r.row.notice)}</p>` : ''}
      <p class="badge ${b.level}">${esc(b.text)}</p></a>
    ${ph ? `<a class="btn" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.row.name })}">${T('detail.call')} ${esc(ph.number)}</a>` : ''}</li>`;
}
function results(query: Query, opts: { limit?: number; seeAll?: View; emptyKey?: string; noDistance?: boolean }): string {
  const ranked = rank(bundle!.rows, { ...query, ...(here && !opts.noDistance ? { near: here } : {}) }, now(), bundle!.alerts);
  if (!ranked.length) return `<p class="empty">${T(opts.emptyKey ?? 'results.none')} <a href="tel:211">211</a></p>`;
  const shown = opts.limit ? ranked.slice(0, opts.limit) : ranked;
  return `${opts.noDistance ? '' : locChip()}<ul class="cards">${shown.map((r) => card(r, !opts.noDistance)).join('')}</ul>
    ${opts.seeAll && ranked.length > shown.length ? `<button class="btn ghost" ${go(opts.seeAll)}>${T('results.see_all', { count: ranked.length })}</button>` : ''}`;
}

// One tap to confirm, one tap to correct (docs/04). Places get the things-not-people list (docs/11).
function reportBox(targetId: string, place: boolean, category = ''): string {
  const done = reported.get(targetId);
  if (done) return `<p class="banner ok" role="status">${T(done === 'queued' ? 'report.queued' : place ? 'report.sent_place' : 'report.sent')}</p>`;
  const kinds = place ? PLACE_KINDS : LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category));
  return `<section class="report" data-target="${esc(targetId)}">
    <button class="btn ghost" data-report="${place ? CONFIRM.place : CONFIRM.listing}">✓ ${T(place ? 'report.confirm.place' : 'report.confirm.listing')}</button>
    <details><summary>${T(place ? 'report.fix' : 'report.wrong')}</summary>${place ? `<p class="foot">${T('report.things_only')}</p>` : ''}
      <label>${T('report.note_label')}<textarea maxlength="280" rows="2"></textarea></label>
      <div class="kinds">${kinds.map((k) => `<button data-report="${k}">${T('report.kind.' + k)}</button>`).join('')}</div></details></section>`;
}

// ---- views ------------------------------------------------------------------
function home(): string {
  if (!bundle) return `${strip()}<main><h1>${T('app.name')}</h1><p>${T(loadError ? 'home.no_data' : 'home.loading')}</p></main>`;
  const sunset = bundleAge(bundle.index, now()) === 'sunset';
  const alerts = bundle.alerts.filter((a) => Date.parse(a.ends_at) > now().getTime() && Date.parse(a.starts_at) <= now().getTime());
  return `${strip()}<main>
    <h1 tabindex="-1">${T('app.name')}</h1><p class="tag">${T('app.tagline')}</p>${ageBanner()}
    ${alerts.length ? `<section aria-label="${T('home.alerts')}">${alerts.map((a) => `<div class="alert"><strong>${esc(a.title)}</strong>${a.body_plain ? `<p>${esc(a.body_plain)}</p>` : ''}${(a.actions ?? []).filter((x) => x.tel).map((x) => `<a class="btn" href="${telHref(x.tel!)}">${esc(x.label)}</a>`).join('')}</div>`).join('')}</section>` : ''}
    ${sunset ? '' : `<h2>${T('home.needs')}</h2><ul class="needs">${NEEDS.map((n) => `<li><button class="need ${n.stepsOnly ? 'urgent' : ''}" ${go({ v: 'need', id: n.id })}>${T('need.' + n.id)}</button></li>`).join('')}</ul>`}
    <h2>${T('home.categories')}</h2><ul class="grid">${CATEGORIES.map((c) => `<li><button ${go(c.view ? { v: c.view } : { v: 'list', cat: c.id })}>${T('cat.' + c.id)}</button></li>`).join('')}</ul>
    <p class="foot">${T('home.updated', { when: prettyDate(bundle.index.generated_at) })}</p></main>`;
}
function more(): string {
  return `${header(t('strip.more'))}<main class="stackbtns">${['emg_911', 'emg_988', 'emg_shelter_helpline', 'emg_dwihn_crisis', 'emg_ndvh', 'emg_211'].map((id) => callButton(id, true)).join('')}
    <button class="btn urgent" ${go({ v: 'need', id: 'overdose_now' })}>${T('need.overdose_now')}</button></main>`;
}
function need(view: Extract<View, { v: 'need' }>): string {
  const n = NEEDS.find((x) => x.id === view.id) as Need;
  const first = (n.first ?? []).map((id) => callButton(id, true)).join('');
  if (n.stepsOnly) {
    return `${header(t('od.title'))}<main><a class="btn call big s911" href="tel:911">${T('od.call')}</a>
      <ol class="steps">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${T('od.s' + i)}</li>`).join('')}</ol><p class="foot">${T('od.review_note')}</p></main>`;
  }
  const refine = n.refine && !view.refine
    ? `<ul class="needs">${n.refine.map((r) => `<li><button class="need" ${go({ v: 'need', id: n.id, refine: r.id })}>${T(`refine.${n.id}.${r.id}`)}</button></li>`).join('')}</ul>` : '';
  const query = n.refine ? n.refine.find((r) => r.id === view.refine)?.query : n.query;
  const dv = n.id === 'unsafe';
  return `${header(t('need.' + n.id), n.quickExit)}<main>
    ${n.intro ? `<p>${T(n.intro)}</p>` : ''}${first ? `<div class="stackbtns">${first}</div>` : ''}${dv ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    ${refine}${query ? results(query, { limit: view.all ? undefined : 3, seeAll: { ...view, all: true }, emptyKey: n.emptyKey, noDistance: dv }) : ''}</main>`;
}
function list(cat: string): string {
  const c = CATEGORIES.find((x) => x.id === cat);
  return `${header(t('cat.' + cat))}<main>${c?.query ? results(c.query, {}) : ''}</main>`;
}
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
function hoursLine(s: Schedule): string {
  const days = (s.byday ?? '').split(',').filter(Boolean).map((d) => { const m = /^([+-]?\d+)?(\w\w)$/.exec(d)!; return (m[1] ? `#${m[1]} ` : '') + t('day.' + m[2]); });
  const consecutive = days.length > 2 && (s.byday ?? '').split(',').every((d, i, a) => i === 0 || DAY_ORDER.indexOf(d) === DAY_ORDER.indexOf(a[i - 1]!) + 1);
  const label = !s.freq ? prettyDate(s.dtstart) : consecutive ? `${days[0]} – ${days[days.length - 1]}` : days.join(', ');
  return `<li><span>${esc(label)}</span> <span>${esc(clock(s.opens_at))} – ${esc(clock(s.closes_at))}${s.description ? ` · ${esc(s.description)}` : ''}</span></li>`;
}
function directionsHref(r: BundleRow): string {
  const q = encodeURIComponent(`${r.address!.line1}, ${r.address!.city}, MI ${r.address!.zip ?? ''}`);
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) return `https://maps.apple.com/?daddr=${q}`;
  if (/Android/.test(navigator.userAgent) && r.lat !== undefined) return `geo:${r.lat},${r.lon}?q=${q}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
function detail(id: string): string {
  const r = bundle!.rows.find((x) => x.id === id);
  if (!r) {
    const gone = bundle!.archived.find((x) => x.id === id);
    return `${header(gone?.name ?? t('app.name'))}<main><p class="banner warn">${gone ? T('badge.archived', { date: prettyDate(gone.archived.at) }) : T('detail.not_found')} ${T('detail.archived_try_211')} <a href="tel:211">211</a></p></main>`;
  }
  const b = badgeText(r), o = openNow(r, now(), bundle!.alerts), next = nextOccurrences(r, now(), 3, bundle!.alerts);
  const sensitive = r.category === 'shelter.dv' || r.category === 'health.mental';
  const gw = !sensitive && r.lat !== undefined && bundle!.greenway ? nearestSegment({ lat: r.lat, lon: r.lon! }, bundle!.greenway.segments, { openOnly: true, maxMiles: 0.5 }) : null;
  return `${header(r.name, sensitive)}<main class="detail">
    <p class="org">${esc(r.org)}</p><p class="badge ${b.level}">${esc(b.text)}</p><p class="open ${o.state}">${esc(openText(o))}</p>
    ${r.notice ? `<p class="notice">${esc(r.notice)}</p>` : ''}
    <div class="stackbtns">${r.phones.map((ph) => `<a class="btn call big" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.name })}"><span>${T('detail.call')}${ph.label ? ` · ${esc(ph.label)}` : ''}</span><strong>${esc(ph.number)}</strong></a>`).join('')}
      ${r.address ? `<a class="btn" href="${esc(directionsHref(r))}" aria-label="${T('detail.directions_label', { name: r.name })}">${T('detail.directions')}</a>` : ''}
      <button class="btn ghost" data-share="${esc(r.id)}">${T('detail.share')}</button></div>
    ${r.category === 'shelter.dv' ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    <h2>${T('detail.what')}</h2><p>${esc(r.what)}</p>
    ${r.eligibility ? `<h2>${T('detail.who')}</h2><p>${esc(r.eligibility)}</p>` : ''}
    ${r.schedules.length ? `<h2>${T('detail.hours')}</h2><ul class="hours">${r.schedules.map(hoursLine).join('')}</ul>` : ''}
    ${r.hours_text ? `<p>${T('detail.hours_as_listed', { text: r.hours_text })}</p>` : ''}
    ${next.length ? `<h2>${T('detail.next')}</h2><ul class="hours">${next.map((n) => `<li><span>${esc(dayName(n.date))}</span> <span>${esc(clock(n.opens_at))} – ${esc(clock(n.closes_at))}</span></li>`).join('')}</ul>` : ''}
    ${r.address ? `<address>${esc(r.address.line1)}<br>${esc(r.address.city)}, MI ${esc(r.address.zip ?? '')}</address><p class="foot">${T('detail.directions_note')}</p>` : ''}
    ${gw ? `<p><button class="link" ${go({ v: 'segment', id: gw.segment.id })}>${T('detail.near_greenway', { miles: gw.miles.toFixed(1), segment: gw.segment.name })}</button></p>` : ''}
    ${r.website ? `<p><a href="${esc(r.website)}" rel="noopener noreferrer">${T('detail.website')}</a></p>` : ''}
    <h2>${T('detail.source')}</h2><p>${esc(r.facts.source.name)}</p>${reportBox(r.id, false, r.category)}</main>`;
}

// Greenway drawn as plain SVG: no map tiles, no third party, works offline (audit B8).
function gwMap(segs: Segment[], focus?: Segment, dots: { lat: number; lon: number }[] = []): string {
  const pts = (focus ? focus.lines : segs.flatMap((s) => s.lines)).flat();
  const pad = focus ? 0.012 : 0.004;
  const minLon = Math.min(...pts.map((p) => p[0])) - pad, maxLon = Math.max(...pts.map((p) => p[0])) + pad;
  const minLat = Math.min(...pts.map((p) => p[1])) - pad, maxLat = Math.max(...pts.map((p) => p[1])) + pad;
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180), W = 320, scale = W / ((maxLon - minLon) * k), H = Math.max(120, (maxLat - minLat) * scale);
  const xy = (lon: number, lat: number) => `${((lon - minLon) * k * scale).toFixed(1)},${((maxLat - lat) * scale).toFixed(1)}`;
  const path = (s: Segment) => s.lines.map((l) => `<polyline points="${l.map((p) => xy(p[0], p[1])).join(' ')}" class="gw ${s.phase} ${focus && s.id === focus.id ? 'focus' : ''}"/>`).join('');
  return `<svg class="gwmap" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${T('gw.map_label')}">${segs.filter((s) => s.phase !== 'open').map(path).join('')}${segs.filter((s) => s.phase === 'open').map(path).join('')}
    ${dots.map((d) => `<circle cx="${xy(d.lon, d.lat).split(',')[0]}" cy="${xy(d.lon, d.lat).split(',')[1]}" r="5" class="dot"/>`).join('')}
    ${here ? `<circle cx="${xy(here.lon, here.lat).split(',')[0]}" cy="${xy(here.lon, here.lat).split(',')[1]}" r="6" class="me"/>` : ''}</svg>`;
}
function greenway(): string {
  const g = bundle!.greenway;
  if (!g) return `${header(t('gw.title'))}<main><p>${T('results.none')}</p></main>`;
  const group = (phase: string) => { const s = g.segments.filter((x) => x.phase === phase); return s.length ? `<h2>${T('gw.' + phase)} (${s.length})</h2><ul class="seglist">${s.map((x) => `<li><button ${go({ v: 'segment', id: x.id })}>${esc(x.name)}</button></li>`).join('')}</ul>` : ''; };
  return `${header(t('gw.title'))}<main><p>${T('gw.intro')}</p>${gwMap(g.segments)}${group('open')}${group('under_construction')}${group('funded')}${group('planned')}
    <p class="foot">${T('gw.source', { date: prettyDate(g.source.last_edited) })}</p></main>`;
}
function segment(id: string): string {
  const g = bundle!.greenway!, s = g.segments.find((x) => x.id === id);
  if (!s) return greenway();
  const near = helpAlong(bundle!.rows.filter((r) => r.category !== 'shelter.dv'), s);
  const ranked = rank(near.map((n) => n.row), {}, now(), bundle!.alerts);
  return `${header(s.name)}<main><p class="open ${s.phase === 'open' ? 'open' : 'closed'}">${T('gw.' + s.phase)}${s.phase === 'open' ? '' : ` · ${T('gw.not_open')}`}</p>
    ${gwMap(g.segments, s, near.map((n) => ({ lat: n.row.lat!, lon: n.row.lon! })))}
    <h2>${T('gw.help_along')}</h2>${ranked.length ? `<ul class="cards">${ranked.map((r) => card({ ...r, miles: near.find((n) => n.row.id === r.row.id)!.miles })).join('')}</ul>` : `<p class="empty">${T('gw.help_none')}</p>`}
    ${s.phase === 'open' ? reportBox(s.id, true) : ''}</main>`;
}
function about(): string {
  const i = bundle?.index;
  return `${header(t('about.title'))}<main>${[1, 2, 3, 4].map((n) => `<p>${T('about.p' + n)}</p>`).join('')}
    ${i ? `<p class="foot">${T('about.data', { version: i.version, date: prettyDate(i.generated_at) })} ${T(i.signing === 'release' ? 'about.sig_ok' : 'about.sig_dev')}</p>` : ''}<p class="foot">${T('about.open')}</p></main>`;
}

// ---- router: in-memory stack. Sensitive views never touch the URL (audit A8). ----------------
function hashFor(v: View): string | null {
  if (v.v === 'detail') { const r = bundle?.rows.find((x) => x.id === v.id); return r && (r.category === 'shelter.dv' || r.category === 'health.mental') ? null : `#/r/${v.id}`; }
  if (v.v === 'list') return `#/c/${v.cat}`;
  if (v.v === 'greenway') return '#/greenway';
  if (v.v === 'segment') return `#/greenway/${v.id}`;
  if (v.v === 'about') return '#/about';
  return null; // home, more, and every "need" screen: no trace
}
function fromHash(h: string): View {
  const m = /^#\/(r|c|greenway|about)(?:\/([\w.-]+))?$/.exec(h);
  if (!m) return { v: 'home' };
  if (m[1] === 'r' && m[2]) return { v: 'detail', id: m[2] };
  if (m[1] === 'c' && m[2]) return { v: 'list', cat: m[2] };
  if (m[1] === 'greenway') return m[2] ? { v: 'segment', id: m[2] } : { v: 'greenway' };
  return { v: 'about' };
}
function render(focus = true): void {
  const v = stack[stack.length - 1]!;
  const needsData = v.v !== 'home' && v.v !== 'more' && v.v !== 'about';
  app.innerHTML = needsData && !bundle ? home()
    : v.v === 'home' ? home() : v.v === 'more' ? more() : v.v === 'about' ? about() : v.v === 'need' ? need(v)
    : v.v === 'list' ? list(v.cat) : v.v === 'detail' ? detail(v.id) : v.v === 'greenway' ? greenway() : segment(v.id);
  if (focus) { window.scrollTo(0, 0); app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }
}
function navigate(view: View): void {
  stack.push(view);
  history.pushState({ n: stack.length }, '', hashFor(view) ?? (location.pathname + location.search));
  render();
}
window.addEventListener('popstate', () => { if (stack.length > 1) stack.pop(); else stack[0] = fromHash(location.hash); render(); });

app.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-go],[data-back],[data-exit],[data-loc],[data-share],[data-report]');
  if (!el) return;
  if (el.dataset.go) { ev.preventDefault(); navigate(JSON.parse(el.dataset.go) as View); }
  else if (el.dataset.report) {
    const box = el.closest<HTMLElement>('.report')!, target = box.dataset.target!;
    const note = box.querySelector('textarea')?.value ?? '';
    reported.set(target, await submit(await buildReport(target, el.dataset.report, note)));
    render(false);
  }
  else if ('back' in el.dataset) { if (stack.length > 1) history.back(); else { stack[0] = { v: 'home' }; history.replaceState(null, '', location.pathname); render(); } }
  else if ('exit' in el.dataset) { stack.length = 0; location.replace('https://www.weather.gov/'); }   // replace(): this page leaves the back button too
  else if (el.dataset.loc === 'off') { here = null; render(false); }
  else if (el.dataset.loc === 'on') {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { here = { lat: pos.coords.latitude, lon: pos.coords.longitude }; locDenied = false; render(false); },
      () => { locDenied = true; render(false); }, { maximumAge: 60000, timeout: 10000 });
  } else if (el.dataset.share) {
    const url = `${location.origin}/#/r/${el.dataset.share}`;   // a listing id only; nothing about the person
    try { if (navigator.share) await navigator.share({ url }); else await navigator.clipboard.writeText(url); } catch { /* cancelled */ }
  }
});

// ---- start ------------------------------------------------------------------
async function start(): Promise<void> {
  stack[0] = fromHash(location.hash);
  render(false);
  bundle = await cached();
  if (bundle) render(false);
  try { const next = await refresh(bundle); if (next) { bundle = next; render(false); } }
  catch (e) { console.warn('bundle refresh failed; keeping what we have', e); if (!bundle) { loadError = true; render(false); } }
  void flush();
  window.addEventListener('online', () => void flush());
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'cache', urls: performance.getEntriesByType('resource').map((r) => r.name) });
  }
}
void start();
