import {
  badge, bundleAge, effectiveNow, helpAlong, miles as milesBetween, nearestSegment, nextOccurrences, openNow, rank,
  type BundleRow, type OpenResult, type Query, type Ranked, type Schedule, type Segment,
} from '@detroithelp/query';
import strings from '../../../strings/en.json';
import { cached, refresh, type Bundle } from './data.js';
import { icon } from './icons.js';
import { CATEGORIES, HARDCODED, NEEDS, TABS, type Need, type TabId } from './needs.js';
import { CONFIRM, LISTING_KINDS, PLACE_KINDS, build as buildReport, flush, submit } from './report.js';
import { TRANSIT } from './transit.js';
import './style.css';

// ---- state: memory only. Nothing about what a person taps is ever written or sent. ----------
type View =
  | { v: 'tab'; tab: TabId } | { v: 'urgent' } | { v: 'about' } | { v: 'greenway' } | { v: 'parks' }
  | { v: 'need'; id: string; refine?: string; all?: boolean }
  | { v: 'list'; cat: string } | { v: 'detail'; id: string } | { v: 'segment'; id: string };

let bundle: Bundle | undefined;
let loadError = false;
let here: { lat: number; lon: number } | null = null;   // device location: this variable only, never stored
let locDenied = false;
const reported = new Map<string, 'sent' | 'queued'>();   // this visit only, so the thank-you stays put
const stack: View[] = [{ v: 'tab', tab: 'home' }];
const app = document.getElementById('app')!;

// ---- helpers ----------------------------------------------------------------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const t = (key: string, p: Record<string, string | number> = {}) =>
  ((strings as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
const T = (key: string, p?: Record<string, string | number>) => esc(t(key, p));
const go = (view: View) => `data-go="${esc(JSON.stringify(view))}"`;
const now = () => effectiveNow(new Date(), bundle?.index.generated_at);
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}`;
const ext = (url: string, label: string, cls = 'btn ghost') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon('out', 'sm')}</a>`;

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
}
const detroitDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(d);
function dayName(date: string): string {
  const diff = Math.round((Date.parse(date) - Date.parse(detroitDay(now()))) / 86400000);
  if (diff === 0) return t('day.today');
  if (diff === 1) return t('day.tomorrow');
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
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
function emergency(id: string): { number: string; label: string } | null {
  const fromBundle = bundle?.emergency.find((e) => e.id === id);
  const number = (HARDCODED as Record<string, string>)[id] ?? fromBundle?.number;   // hardcoded always wins
  return number ? { number, label: fromBundle?.label ?? (id === 'emg_911' ? 'Emergency' : id === 'emg_988' ? 'Suicide and crisis lifeline' : number) } : null;
}
function callButton(id: string): string {
  const e = emergency(id);
  if (!e) return '';
  return `<a class="callrow ${id === 'emg_911' ? 'is911' : ''}" href="${telHref(e.number)}" aria-label="${T('strip.call_label', { label: e.label, number: e.number })}">${icon('phone')}<span>${esc(e.label)}</span><strong>${esc(e.number)}</strong></a>`;
}

// ---- chrome -----------------------------------------------------------------
const logo = `<svg class="logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M16 7l2.6 6.4L25 16l-6.4 2.6L16 25l-2.6-6.4L7 16l6.4-2.6z" fill="var(--bg)"/></svg>`;
function topBar(title?: string, quickExit = false): string {
  const urgentBtn = `<button class="urgent" ${go({ v: 'urgent' })}>${icon('phone', 'sm')}<span>${T('strip.more')}</span></button>`;
  if (!title) return `<header class="top"><div class="brand">${logo}<span>${T('app.name')}</span></div>${urgentBtn}</header>`;
  return `<header class="top inner"><button class="iconbtn" data-back aria-label="${T('back')}">${icon('back')}</button><h1 tabindex="-1">${esc(title)}</h1>
    ${quickExit ? `<button class="exit" data-exit>${T('safe.exit')}</button>` : urgentBtn}</header>`;
}
function tabBar(active?: TabId): string {
  return `<nav class="tabs" aria-label="${T('tabs.label')}">${TABS.map((x) => `<button ${go({ v: 'tab', tab: x.id })} ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${T('tab.' + x.id)}</span></button>`).join('')}</nav>`;
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
function locChip(): string {
  if (here) return `<p class="loc">${icon('pin', 'sm')}<span>${T('loc.using')}</span> <button class="chip" data-loc="off">${T('loc.off')}</button></p>`;
  return `<p class="loc"><button class="chip" data-loc="on">${icon('pin', 'sm')}${T('loc.use')}</button> <small>${T(locDenied ? 'loc.denied' : 'loc.note')}</small></p>`;
}
const rowLink = (view: View, ic: string, title: string, sub = '') =>
  `<li><button class="row" ${go(view)}><span class="rowic">${icon(ic)}</span><span class="rowtx"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevron', 'sm dim')}</button></li>`;

function card(r: Ranked, showDistance = true): string {
  const b = badgeText(r.row), ph = r.row.phones[0];
  return `<li class="card"><a class="cardlink" ${go({ v: 'detail', id: r.row.id })} href="#/r/${esc(r.row.id)}">
      <h3>${esc(r.row.name)}</h3><p class="what">${esc(r.row.what)}</p>
      <p class="meta"><span class="pill ${r.open.state}">${esc(openText(r.open))}</span>${showDistance && r.miles !== null ? `<span class="pill plain">${T('miles', { miles: r.miles.toFixed(1) })}</span>` : ''}</p>
      ${r.row.notice ? `<p class="notice">${esc(r.row.notice)}</p>` : ''}<p class="fresh ${b.level}">${esc(b.text)}</p></a>
    ${ph ? `<a class="btn" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.row.name })}">${icon('phone', 'sm')}${T('detail.call')} <strong>${esc(ph.number)}</strong></a>` : ''}</li>`;
}
function results(query: Query, opts: { limit?: number; seeAll?: View; emptyKey?: string; noDistance?: boolean }): string {
  const ranked = rank(bundle!.rows, { ...query, ...(here && !opts.noDistance ? { near: here } : {}) }, now(), bundle!.alerts);
  if (!ranked.length) return `<p class="empty">${T(opts.emptyKey ?? 'results.none')} <a href="tel:211">211</a></p>`;
  const shown = opts.limit ? ranked.slice(0, opts.limit) : ranked;
  return `${opts.noDistance ? '' : locChip()}<ul class="cards">${shown.map((r) => card(r, !opts.noDistance)).join('')}</ul>
    ${opts.seeAll && ranked.length > shown.length ? `<button class="btn ghost" ${go(opts.seeAll)}>${T('results.see_all', { count: ranked.length })}</button>` : ''}`;
}
// One tap to confirm, one tap to correct (docs/04). Places get the things-not-people list (docs/11).
function reportBox(targetId: string, isPlace: boolean, category = ''): string {
  const done = reported.get(targetId);
  if (done) return `<p class="banner ok" role="status">${icon('check', 'sm')} ${T(done === 'queued' ? 'report.queued' : isPlace ? 'report.sent_place' : 'report.sent')}</p>`;
  const kinds = isPlace ? PLACE_KINDS : LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category));
  return `<section class="report" data-target="${esc(targetId)}">
    <button class="btn ghost" data-report="${isPlace ? CONFIRM.place : CONFIRM.listing}">${icon('check', 'sm')}${T(isPlace ? 'report.confirm.place' : 'report.confirm.listing')}</button>
    <details><summary>${T(isPlace ? 'report.fix' : 'report.wrong')}</summary>${isPlace ? `<p class="foot">${T('report.things_only')}</p>` : ''}
      <label>${T('report.note_label')}<textarea maxlength="280" rows="2"></textarea></label>
      <div class="kinds">${kinds.map((k) => `<button data-report="${k}">${T('report.kind.' + k)}</button>`).join('')}</div></details></section>`;
}

// ---- tabs -------------------------------------------------------------------
type CityEvent = NonNullable<Bundle['events']>[number];
function upcoming(limit?: number): CityEvent[] {
  const today = detroitDay(now());
  const ev = (bundle?.events ?? []).filter((e) => (e.ends_at ?? e.starts_at).slice(0, 10) >= today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return limit ? ev.slice(0, limit) : ev;
}
function eventItem(e: CityEvent): string {
  const time = e.starts_at.length > 10 ? clock(e.starts_at.slice(11, 16)) : '';
  return `<li class="event"><div class="when"><span>${esc(new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(e.starts_at.slice(0, 10))))}</span><strong>${Number(e.starts_at.slice(8, 10))}</strong></div>
    <div><h3>${esc(e.title)}</h3><p class="what">${[time, e.location].filter(Boolean).map(esc).join(' · ')}</p>${e.url ? ext(e.url, t('events.details'), 'link') : ''}</div></li>`;
}
function homeTab(): string {
  if (!bundle) return `<main><section class="hero"><h1 tabindex="-1">${T('home.hero')}</h1><p>${T(loadError ? 'home.no_data' : 'home.loading')}</p></section></main>`;
  const sunset = bundleAge(bundle.index, now()) === 'sunset';
  const alerts = bundle.alerts.filter((a) => Date.parse(a.ends_at) > now().getTime() && Date.parse(a.starts_at) <= now().getTime());
  const ev = upcoming(3), openSegs = bundle.greenway?.segments.filter((s) => s.phase === 'open').length ?? 0;
  const quick = ['food', 'shelter', 'doctor', 'narcan'].map((id) => NEEDS.find((n) => n.id === id)!);
  return `<main><section class="hero"><h1 tabindex="-1">${T('home.hero')}</h1><p>${T('app.tagline')}</p></section>${ageBanner()}
    ${alerts.map((a) => `<div class="alert"><strong>${esc(a.title)}</strong>${a.body_plain ? `<p>${esc(a.body_plain)}</p>` : ''}${(a.actions ?? []).filter((x) => x.tel).map((x) => `<a class="btn" href="${telHref(x.tel!)}">${esc(x.label)}</a>`).join('')}</div>`).join('')}
    ${sunset ? '' : `<button class="feature" ${go({ v: 'tab', tab: 'help' })}><span class="rowic big">${icon('help')}</span><span class="rowtx"><strong>${T('home.help_title')}</strong><small>${T('home.help_sub')}</small></span>${icon('chevron', 'dim')}</button>
    <ul class="quick">${quick.map((n) => `<li><button ${go({ v: 'need', id: n.id })}>${icon(n.icon)}<span>${T('quick.' + n.id)}</span></button></li>`).join('')}</ul>`}
    ${ev.length ? `<div class="sechead"><h2>${T('home.events')}</h2><button class="link" ${go({ v: 'tab', tab: 'events' })}>${T('home.see_all')}</button></div><ul class="events">${ev.map(eventItem).join('')}</ul>` : ''}
    <div class="duo"><button class="tile" ${go({ v: 'tab', tab: 'rec' })}>${icon('rec')}<strong>${T('tab.rec')}</strong><small>${T('home.rec_sub', { count: openSegs })}</small></button>
      <button class="tile" ${go({ v: 'tab', tab: 'transit' })}>${icon('transit')}<strong>${T('tab.transit')}</strong><small>${T('home.transit_sub')}</small></button></div>
    <p class="foot">${T('home.updated', { when: prettyDate(bundle.index.generated_at) })} · <button class="link" ${go({ v: 'about' })}>${T('about.title')}</button></p></main>`;
}
function helpTab(): string {
  const group = (g: Need['group']) => `<ul class="rows">${NEEDS.filter((n) => n.group === g).map((n) => rowLink({ v: 'need', id: n.id }, n.icon, t('need.' + n.id))).join('')}</ul>`;
  return `<main><h1 class="page" tabindex="-1">${T('home.needs')}</h1><p class="lede">${T('help.lede')}</p>
    <h2>${T('help.now')}</h2>${group('now')}<h2>${T('help.soon')}</h2>${group('soon')}
    <h2>${T('home.categories')}</h2><ul class="chips">${CATEGORIES.map((c) => `<li><button class="chip lg" ${go({ v: 'list', cat: c.id })}>${icon(c.icon, 'sm')}${T('cat.' + c.id)}</button></li>`).join('')}</ul></main>`;
}
function recTab(): string {
  const g = bundle?.greenway, parks = bundle?.parks ?? [];
  const openCount = g?.segments.filter((s) => s.phase === 'open').length ?? 0;
  const nearParks = here ? [...parks].map((p) => ({ p, mi: milesBetween(here!, p) })).sort((a, b) => a.mi - b.mi).slice(0, 5) : [];
  const centers = rank(bundle?.rows ?? [], { category: 'shelter.cooling', ...(here ? { near: here } : {}) }, now());
  return `<main><h1 class="page" tabindex="-1">${T('tab.rec')}</h1><p class="lede">${T('rec.lede')}</p>
    ${g ? `<button class="feature" ${go({ v: 'greenway' })}><span class="rowic big">${icon('path')}</span><span class="rowtx"><strong>${T('gw.title')}</strong><small>${T('rec.gw_sub', { count: openCount })}</small></span>${icon('chevron', 'dim')}</button>${gwMap(g.segments)}` : ''}
    ${parks.length ? `<h2>${T('rec.parks')}</h2>${locChip()}${nearParks.length ? `<ul class="rows">${nearParks.map(({ p, mi }) => `<li><div class="row static"><span class="rowic">${icon('rec')}</span><span class="rowtx"><strong>${esc(p.name)}</strong><small>${[p.address, t('miles', { miles: mi.toFixed(1) })].filter(Boolean).map(esc).join(' · ')}</small></span></div></li>`).join('')}</ul>` : ''}
      <button class="btn ghost" ${go({ v: 'parks' })}>${T('rec.all_parks', { count: parks.length })}</button>` : ''}
    <h2>${T('rec.centers')}</h2>${centers.length ? `<ul class="cards">${centers.map((r) => card(r)).join('')}</ul>` : `<p class="empty">${T('rec.centers_none')}</p>`}
    ${TRANSIT.bike ? `<h2>${T('rec.bike')}</h2><div class="panel"><p>${esc(TRANSIT.bike.body)}</p>${ext(TRANSIT.bike.url, TRANSIT.bike.label)}</div>` : ''}</main>`;
}
function parksList(): string {
  const parks = [...(bundle?.parks ?? [])].sort((a, b) => (here ? milesBetween(here, a) - milesBetween(here, b) : a.name.localeCompare(b.name)));
  return `<main>${locChip()}<ul class="rows">${parks.map((p) => `<li><div class="row static"><span class="rowtx"><strong>${esc(p.name)}</strong><small>${[p.address, here ? t('miles', { miles: milesBetween(here, p).toFixed(1) }) : ''].filter(Boolean).map(esc).join(' · ')}</small></span></div></li>`).join('')}</ul>
    <p class="foot">${T('rec.parks_source', { date: prettyDate(bundle?.parks_source?.last_edited ?? '') })}</p></main>`;
}
function transitTab(): string {
  return `<main><h1 class="page" tabindex="-1">${T('tab.transit')}</h1><p class="lede">${T('transit.lede')}</p>
    ${TRANSIT.sections.map((s) => `<h2>${esc(s.title)}</h2><div class="panel">${s.body ? `<p>${esc(s.body)}</p>` : ''}
      ${(s.facts ?? []).map((f) => `<p class="fact">${icon(f.icon, 'sm')}<span>${esc(f.text)}</span></p>`).join('')}
      <div class="stackbtns">${(s.phones ?? []).map((p) => `<a class="callrow" href="${telHref(p.number)}">${icon('phone')}<span>${esc(p.label)}</span><strong>${esc(p.number)}</strong></a>`).join('')}${(s.links ?? []).map((l) => ext(l.url, l.label)).join('')}</div></div>`).join('')}
    <p class="foot">${T('transit.tip')}</p><p class="foot">${T('transit.checked', { date: prettyDate(TRANSIT.checked) })}</p></main>`;
}
function eventsTab(): string {
  const ev = upcoming();
  const days = [...new Set(ev.map((e) => e.starts_at.slice(0, 10)))];
  return `<main><h1 class="page" tabindex="-1">${T('tab.events')}</h1><p class="lede">${T('events.lede')}</p>
    ${ev.length ? days.map((d) => `<h2>${esc(dayName(d))}</h2><ul class="events">${ev.filter((e) => e.starts_at.slice(0, 10) === d).map(eventItem).join('')}</ul>`).join('') : `<p class="empty">${T('events.none')}</p>`}
    ${bundle?.events_source ? `<p class="foot">${T('events.source', { date: prettyDate(bundle.events_source.fetched_at) })} ${ext(bundle.events_source.page, t('events.all'), 'link')}</p>` : ''}</main>`;
}

// ---- pushed screens ---------------------------------------------------------
function urgent(): string {
  return `<main><p class="lede">${T('urgent.lede')}</p><div class="stackbtns">${['emg_911', 'emg_988', 'emg_shelter_helpline', 'emg_dwihn_crisis', 'emg_ndvh', 'emg_211'].map(callButton).join('')}</div>
    <ul class="rows">${rowLink({ v: 'need', id: 'overdose_now' }, 'pulse', t('need.overdose_now'), t('urgent.od_sub'))}</ul></main>`;
}
function need(view: Extract<View, { v: 'need' }>): string {
  const n = NEEDS.find((x) => x.id === view.id) as Need;
  const first = (n.first ?? []).map(callButton).join('');
  if (n.stepsOnly) return `<main><div class="stackbtns">${first}</div><ol class="steps">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${T('od.s' + i)}</li>`).join('')}</ol><p class="foot">${T('od.review_note')}</p></main>`;
  const refine = n.refine && !view.refine ? `<ul class="rows">${n.refine.map((r) => rowLink({ v: 'need', id: n.id, refine: r.id }, n.icon, t(`refine.${n.id}.${r.id}`))).join('')}</ul>` : '';
  const query = n.refine ? n.refine.find((r) => r.id === view.refine)?.query : n.query;
  const dv = n.id === 'unsafe';
  return `<main>${n.intro ? `<p class="lede">${T(n.intro)}</p>` : ''}${first ? `<div class="stackbtns">${first}</div>` : ''}${dv ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    ${refine}${query ? results(query, { limit: view.all ? undefined : 3, seeAll: { ...view, all: true }, emptyKey: n.emptyKey, noDistance: dv }) : ''}</main>`;
}
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
function hoursLine(s: Schedule): string {
  const codes = (s.byday ?? '').split(',').filter(Boolean);
  const days = codes.map((d) => { const m = /^([+-]?\d+)?(\w\w)$/.exec(d)!; return (m[1] ? `#${m[1]} ` : '') + t('day.' + m[2]); });
  const run = days.length > 2 && codes.every((d, i) => i === 0 || DAY_ORDER.indexOf(d) === DAY_ORDER.indexOf(codes[i - 1]!) + 1);
  const label = !s.freq ? prettyDate(s.dtstart) : run ? `${days[0]} – ${days[days.length - 1]}` : days.join(', ');
  return `<li><span>${esc(label)}</span><span>${esc(clock(s.opens_at))} – ${esc(clock(s.closes_at))}${s.description ? ` · ${esc(s.description)}` : ''}</span></li>`;
}
const placeQ = (r: BundleRow) => encodeURIComponent(`${r.address!.line1}, ${r.address!.city}, MI ${r.address!.zip ?? ''}`);
function directionsHref(r: BundleRow): string {
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent)) return `https://maps.apple.com/?daddr=${placeQ(r)}`;
  if (/Android/.test(navigator.userAgent) && r.lat !== undefined) return `geo:${r.lat},${r.lon}?q=${placeQ(r)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${placeQ(r)}`;
}
function detail(id: string): { title: string; html: string; exit: boolean } {
  const r = bundle!.rows.find((x) => x.id === id);
  if (!r) {
    const gone = bundle!.archived.find((x) => x.id === id);
    return { title: gone?.name ?? t('app.name'), exit: false, html: `<main><p class="banner warn">${gone ? T('badge.archived', { date: prettyDate(gone.archived.at) }) : T('detail.not_found')} ${T('detail.archived_try_211')} <a href="tel:211">211</a></p></main>` };
  }
  const b = badgeText(r), o = openNow(r, now(), bundle!.alerts), next = nextOccurrences(r, now(), 3, bundle!.alerts);
  const sensitive = r.category === 'shelter.dv' || r.category === 'health.mental';
  const gw = !sensitive && r.lat !== undefined && bundle!.greenway ? nearestSegment({ lat: r.lat, lon: r.lon! }, bundle!.greenway.segments, { openOnly: true, maxMiles: 0.5 }) : null;
  return { title: r.name, exit: sensitive, html: `<main class="detail"><p class="org">${esc(r.org)}</p>
    <p class="meta"><span class="pill ${o.state}">${esc(openText(o))}</span></p><p class="fresh ${b.level}">${esc(b.text)}</p>${r.notice ? `<p class="notice">${esc(r.notice)}</p>` : ''}
    <div class="stackbtns">${r.phones.map((ph) => `<a class="callrow" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.name })}">${icon('phone')}<span>${T('detail.call')}${ph.label ? ` · ${esc(ph.label)}` : ''}</span><strong>${esc(ph.number)}</strong></a>`).join('')}
      ${r.address ? `<div class="two"><a class="btn ghost" href="${esc(directionsHref(r))}" aria-label="${T('detail.directions_label', { name: r.name })}">${icon('pin', 'sm')}${T('detail.directions')}</a>
        <a class="btn ghost" href="https://www.google.com/maps/dir/?api=1&destination=${placeQ(r)}&travelmode=transit" target="_blank" rel="noopener noreferrer">${icon('transit', 'sm')}${T('detail.bus')}</a></div>` : ''}
      <button class="btn ghost" data-share="${esc(r.id)}">${T('detail.share')}</button></div>
    ${r.category === 'shelter.dv' ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    <h2>${T('detail.what')}</h2><p>${esc(r.what)}</p>${r.eligibility ? `<h2>${T('detail.who')}</h2><p>${esc(r.eligibility)}</p>` : ''}
    ${r.schedules.length ? `<h2>${T('detail.hours')}</h2><ul class="hours">${r.schedules.map(hoursLine).join('')}</ul>` : ''}${r.hours_text ? `<p>${T('detail.hours_as_listed', { text: r.hours_text })}</p>` : ''}
    ${next.length ? `<h2>${T('detail.next')}</h2><ul class="hours">${next.map((n) => `<li><span>${esc(dayName(n.date))}</span><span>${esc(clock(n.opens_at))} – ${esc(clock(n.closes_at))}</span></li>`).join('')}</ul>` : ''}
    ${r.address ? `<h2>${T('detail.where')}</h2><address>${esc(r.address.line1)}<br>${esc(r.address.city)}, MI ${esc(r.address.zip ?? '')}</address><p class="foot">${T('detail.directions_note')}</p>` : ''}
    ${gw ? `<p><button class="link" ${go({ v: 'segment', id: gw.segment.id })}>${icon('path', 'sm')} ${T('detail.near_greenway', { miles: gw.miles.toFixed(1), segment: gw.segment.name })}</button></p>` : ''}
    ${r.website ? `<p>${ext(r.website, t('detail.website'), 'link')}</p>` : ''}
    <h2>${T('detail.source')}</h2><p>${esc(r.facts.source.name)}</p>${reportBox(r.id, false, r.category)}</main>` };
}
// Greenway drawn as plain SVG: no map tiles, no third party, works offline (audit B8).
function gwMap(segs: Segment[], focus?: Segment, dots: { lat: number; lon: number }[] = []): string {
  const pts = (focus ? focus.lines : segs.flatMap((s) => s.lines)).flat();
  const pad = focus ? 0.012 : 0.004;
  const minLon = Math.min(...pts.map((p) => p[0])) - pad, maxLon = Math.max(...pts.map((p) => p[0])) + pad;
  const minLat = Math.min(...pts.map((p) => p[1])) - pad, maxLat = Math.max(...pts.map((p) => p[1])) + pad;
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180), W = 320, scale = W / ((maxLon - minLon) * k), H = Math.max(120, (maxLat - minLat) * scale);
  const xy = (lon: number, lat: number): [string, string] => [((lon - minLon) * k * scale).toFixed(1), ((maxLat - lat) * scale).toFixed(1)];
  const path = (s: Segment) => s.lines.map((l) => `<polyline points="${l.map((p) => xy(p[0], p[1]).join(',')).join(' ')}" class="gw ${s.phase} ${focus && s.id === focus.id ? 'focus' : ''}"/>`).join('');
  const dot = (d: { lat: number; lon: number }, cls: string, r: number) => { const [x, y] = xy(d.lon, d.lat); return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`; };
  return `<svg class="gwmap" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="${T('gw.map_label')}">${segs.filter((s) => s.phase !== 'open').map(path).join('')}${segs.filter((s) => s.phase === 'open').map(path).join('')}
    ${dots.map((d) => dot(d, 'dot', 5)).join('')}${here ? dot(here, 'me', 6) : ''}</svg>`;
}
function greenway(): string {
  const g = bundle!.greenway;
  if (!g) return `<main><p class="empty">${T('results.none')}</p></main>`;
  const group = (phase: string) => { const s = g.segments.filter((x) => x.phase === phase); return s.length ? `<h2>${T('gw.' + phase)} <span class="count">${s.length}</span></h2><ul class="rows">${s.map((x) => rowLink({ v: 'segment', id: x.id }, 'path', x.name)).join('')}</ul>` : ''; };
  return `<main><p class="lede">${T('gw.intro')}</p>${gwMap(g.segments)}${group('open')}${group('under_construction')}${group('funded')}${group('planned')}<p class="foot">${T('gw.source', { date: prettyDate(g.source.last_edited) })}</p></main>`;
}
function segment(s: Segment): string {
  const g = bundle!.greenway!;
  const near = helpAlong(bundle!.rows.filter((r) => r.category !== 'shelter.dv'), s);
  const ranked = rank(near.map((n) => n.row), {}, now(), bundle!.alerts);
  return `<main><p class="meta"><span class="pill ${s.phase === 'open' ? 'open' : 'closed'}">${T('gw.' + s.phase)}</span></p>${s.phase === 'open' ? '' : `<p class="lede">${T('gw.not_open')}</p>`}
    ${gwMap(g.segments, s, near.map((n) => ({ lat: n.row.lat!, lon: n.row.lon! })))}
    <h2>${T('gw.help_along')}</h2>${ranked.length ? `<ul class="cards">${ranked.map((r) => card({ ...r, miles: near.find((n) => n.row.id === r.row.id)!.miles })).join('')}</ul>` : `<p class="empty">${T('gw.help_none')}</p>`}
    ${s.phase === 'open' ? reportBox(s.id, true) : ''}</main>`;
}
function about(): string {
  const i = bundle?.index;
  return `<main>${[1, 2, 3, 4].map((n) => `<p>${T('about.p' + n)}</p>`).join('')}
    ${i ? `<p class="foot">${T('about.data', { version: i.version, date: prettyDate(i.generated_at) })} ${T(i.signing === 'release' ? 'about.sig_ok' : 'about.sig_dev')}</p>` : ''}<p class="foot">${T('about.open')}</p></main>`;
}

// ---- router: in-memory stack. Need screens and sensitive listings never touch the URL (audit A8). ----
function hashFor(v: View): string | null {
  if (v.v === 'tab') return v.tab === 'home' ? location.pathname : `#/${v.tab}`;
  if (v.v === 'detail') { const r = bundle?.rows.find((x) => x.id === v.id); return r && (r.category === 'shelter.dv' || r.category === 'health.mental') ? null : `#/r/${v.id}`; }
  if (v.v === 'list') return `#/c/${v.cat}`;
  if (v.v === 'greenway') return '#/greenway';
  if (v.v === 'segment') return `#/greenway/${v.id}`;
  if (v.v === 'parks') return '#/parks';
  if (v.v === 'about') return '#/about';
  return null; // the urgent sheet and every "need" screen: no trace
}
function fromHash(h: string): View {
  const m = /^#\/(r|c|greenway|about|parks|help|rec|transit|events)(?:\/([\w.-]+))?$/.exec(h);
  if (!m) return { v: 'tab', tab: 'home' };
  if (m[1] === 'r' && m[2]) return { v: 'detail', id: m[2] };
  if (m[1] === 'c' && m[2]) return { v: 'list', cat: m[2] };
  if (m[1] === 'greenway') return m[2] ? { v: 'segment', id: m[2] } : { v: 'greenway' };
  if (m[1] === 'about' || m[1] === 'parks') return { v: m[1] };
  return { v: 'tab', tab: m[1] as TabId };
}
const TAB_OF: Partial<Record<View['v'], TabId>> = { need: 'help', list: 'help', detail: 'help', greenway: 'rec', segment: 'rec', parks: 'rec' };
function render(focus = true): void {
  const v = stack[stack.length - 1]!;
  let title: string | undefined, body: string, exit = false;
  if (v.v === 'tab' || !bundle) { const tab = v.v === 'tab' ? v.tab : 'home'; body = !bundle || tab === 'home' ? homeTab() : tab === 'help' ? helpTab() : tab === 'rec' ? recTab() : tab === 'transit' ? transitTab() : eventsTab(); }
  else if (v.v === 'urgent') { title = t('strip.more'); body = urgent(); }
  else if (v.v === 'about') { title = t('about.title'); body = about(); }
  else if (v.v === 'need') { const n = NEEDS.find((x) => x.id === v.id)!; title = t(n.stepsOnly ? 'od.title' : 'need.' + n.id); exit = !!n.quickExit; body = need(v); }
  else if (v.v === 'list') { title = t('cat.' + v.cat); body = `<main>${results(CATEGORIES.find((c) => c.id === v.cat)?.query ?? {}, {})}</main>`; }
  else if (v.v === 'detail') { const d = detail(v.id); title = d.title; exit = d.exit; body = d.html; }
  else if (v.v === 'greenway') { title = t('gw.title'); body = greenway(); }
  else if (v.v === 'parks') { title = t('rec.parks'); body = parksList(); }
  else { const s = bundle.greenway?.segments.find((x) => x.id === v.id); title = s?.name ?? t('gw.title'); body = s ? segment(s) : greenway(); }
  const fromStack = stack.map((x) => (x.v === 'tab' ? x.tab : undefined)).filter(Boolean).pop();
  const active = v.v === 'tab' ? v.tab : fromStack ?? TAB_OF[v.v];
  app.innerHTML = topBar(title, exit) + body + tabBar(active);
  if (focus) { window.scrollTo(0, 0); app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }
}
function navigate(view: View): void {
  if (view.v === 'tab') stack.length = 0;   // a tab is a fresh start, not one more screen to back out of
  stack.push(view);
  history.pushState({ n: stack.length }, '', hashFor(view) ?? location.pathname + location.search);
  render();
}
window.addEventListener('popstate', () => { if (stack.length > 1) stack.pop(); else stack[0] = fromHash(location.hash); render(); });

app.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-go],[data-back],[data-exit],[data-loc],[data-share],[data-report]');
  if (!el) return;
  if (el.dataset.go) { ev.preventDefault(); navigate(JSON.parse(el.dataset.go) as View); }
  else if (el.dataset.report) {
    const box = el.closest<HTMLElement>('.report')!, target = box.dataset.target!;
    reported.set(target, await submit(await buildReport(target, el.dataset.report, box.querySelector('textarea')?.value ?? '')));
    render(false);
  }
  else if ('back' in el.dataset) { if (stack.length > 1) history.back(); else navigate({ v: 'tab', tab: TAB_OF[stack[0]!.v] ?? 'home' }); }
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
