import {
  badge, bundleAge, effectiveNow, helpAlong, matchTier, miles as milesBetween, nearestSegment, nextOccurrences, openNow, rank, search, searchTokens,
  type BundleRow, type OpenResult, type Query, type Ranked, type Schedule, type Segment,
} from '@detroithelp/query';
import strings from '../../../strings/en.json';
import { cached, refresh, type Bundle } from './data.js';
import { hoodList, hoodPage, loadIndicators, outline, type Hood, type Indicators } from './hoods.js';
import { icon } from './icons.js';
import { MapView, type MapDot, type MapSpec } from './map.js';
import { CATEGORIES, HARDCODED, NEEDS, TABS, type Need, type TabId } from './needs.js';
import { CONFIRM, LISTING_KINDS, PLACE_KINDS, build as buildReport, flush, preparePhoto, submit, uploadPhoto } from './report.js';
import { TRANSIT } from './transit.js';
import { FOOD_BENEFITS } from './benefits.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES, buildProposal, flushProposals, submitProposal } from './propose.js';
import { canSave, clearSaved, loadSaved, toggleSaved } from './saved.js';
import './style.css';

// ---- state: memory only. Nothing about what a person taps is ever written or sent. ----------
type View =
  | { v: 'tab'; tab: TabId } | { v: 'urgent' } | { v: 'about' } | { v: 'search' } | { v: 'saved' } | { v: 'add' } | { v: 'hoods'; lens?: string } | { v: 'hood'; id: string } | { v: 'greenway' } | { v: 'parks' }
  | { v: 'need'; id: string; refine?: string; all?: boolean }
  | { v: 'list'; cat: string } | { v: 'detail'; id: string } | { v: 'segment'; id: string };

let bundle: Bundle | undefined;
let loadError = false;
let here: { lat: number; lon: number } | null = null;   // device location, or a ZIP's center: this variable only, never stored
let hereZip = '';                                        // the ZIP a person typed, when `here` came from one
let locDenied = false, zipOpen = false, zipUnknown = false;
let savedIds: string[] = [];                             // listing ids saved on this phone (saved.ts); never sent
let proposed: { state: 'sent' | 'queued'; ref?: string } | null = null, proposeError = false;
let indicators: Indicators | null | undefined;           // neighborhood numbers (docs/13): fetched the first time a neighborhood screen opens
let listMap = false;                                      // "Show these on a map" is open on the current list
let searchText = '';                                     // memory only: never stored, sent, or put in the URL
const reported = new Map<string, 'sent' | 'queued' | 'sent_no_photo'>();   // this visit only, so the thank-you stays put
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
  if (here) return `<p class="loc">${icon('pin', 'sm')}<span>${T(hereZip ? 'loc.zip_using' : 'loc.using', { zip: hereZip })}</span> <button class="chip" data-loc="off">${T(hereZip ? 'loc.zip_off' : 'loc.off')}</button></p>`;
  // "Type a ZIP" (docs/05): for a person who would rather not share a location. The ZIP is looked up in the bundle, on the phone.
  const zip = !bundle?.zips ? '' : zipOpen
    ? `<form class="zipform" data-zip><label>${T('loc.zip_label')} <input name="zip" inputmode="numeric" autocomplete="off" pattern="[0-9]{5}" maxlength="5" required></label><button class="chip" type="submit">${T('loc.zip_go')}</button></form>`
    : `<button class="chip" data-loc="zip">${T('loc.zip')}</button>`;
  return `<div class="loc"><button class="chip" data-loc="on">${icon('pin', 'sm')}${T('loc.use')}</button>${zip}<small role="status">${T(zipUnknown ? 'loc.zip_unknown' : locDenied ? 'loc.denied' : 'loc.note')}</small></div>`;
}
const searchBtn = () => `<button class="searchbtn" ${go({ v: 'search' })}>${icon('search', 'sm')}<span>${T('search.open')}</span></button>`;
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
  // The map is closed until asked for, so the first Call button stays near the top. Never on the "not safe at home"
  // screen, and never a dot for a sensitive listing (those carry no coordinates in the first place).
  const pins = opts.noDistance ? [] : ranked.filter((r) => r.row.lat !== undefined && r.row.category !== 'shelter.dv' && r.row.category !== 'health.mental');
  const map = !pins.length ? '' : listMap
    ? `${mapBox({ key: 'list:' + JSON.stringify(query), label: t('map.label_list'), quiet: true, fit: pins.map((r) => ({ lat: r.row.lat!, lon: r.row.lon! })), minMeters: 1500, dots: pins.map((r) => ({ lat: r.row.lat!, lon: r.row.lon!, label: r.row.name, go: JSON.stringify({ v: 'detail', id: r.row.id }) })) })}<button class="chip" data-listmap>${T('map.hide')}</button>`
    : `<button class="chip" data-listmap>${icon('pin', 'sm')}${T('map.show', { count: pins.length })}</button>`;
  return `${opts.noDistance ? '' : locChip()}${map}<ul class="cards">${shown.map((r) => card(r, !opts.noDistance)).join('')}</ul>
    ${opts.seeAll && ranked.length > shown.length ? `<button class="btn ghost" ${go(opts.seeAll)}>${T('results.see_all', { count: ranked.length })}</button>` : ''}`;
}
// One tap to confirm, one tap to correct (docs/04). Places get the things-not-people list (docs/11).
function reportBox(targetId: string, isPlace: boolean, category = ''): string {
  const done = reported.get(targetId);
  if (done) return `<p class="banner ok" role="status">${icon('check', 'sm')} ${T(done === 'queued' ? 'report.queued' : isPlace ? 'report.sent_place' : 'report.sent')}${done === 'sent_no_photo' ? ` ${T('report.photo_failed')}` : ''}</p>`;
  const kinds = isPlace ? PLACE_KINDS : LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category));
  return `<section class="report" data-target="${esc(targetId)}">
    <button class="btn ghost" data-report="${isPlace ? CONFIRM.place : CONFIRM.listing}">${icon('check', 'sm')}${T(isPlace ? 'report.confirm.place' : 'report.confirm.listing')}</button>
    <details><summary>${T(isPlace ? 'report.fix' : 'report.wrong')}</summary>${isPlace ? `<p class="foot">${T('report.things_only')}</p>` : ''}
      <label>${T('report.note_label')}<textarea maxlength="280" rows="2"></textarea></label>
      ${isPlace ? `<label>${T('report.photo_label')}<input type="file" accept="image/*" capture="environment" data-photo></label><p class="foot">${T('report.photo_note')}</p>` : ''}
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
  return `<main><section class="hero"><h1 tabindex="-1">${T('home.hero')}</h1><p>${T('app.tagline')}</p></section>${ageBanner()}${sunset ? '' : searchBtn()}
    ${alerts.map((a) => `<div class="alert"><strong>${esc(a.title)}</strong>${a.body_plain ? `<p>${esc(a.body_plain)}</p>` : ''}${(a.actions ?? []).filter((x) => x.tel).map((x) => `<a class="btn" href="${telHref(x.tel!)}">${icon('phone', 'sm')}${esc(x.label)}</a>`).join('')}
      <p class="foot">${T('alert.until', { when: new Intl.DateTimeFormat('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' }).format(new Date(a.ends_at)) })}${a.source?.url ? ` · ${ext(a.source.url, t('alert.source'), 'link')}` : ''}</p></div>`).join('')}
    ${sunset ? '' : `<button class="feature" ${go({ v: 'tab', tab: 'help' })}><span class="rowic big">${icon('help')}</span><span class="rowtx"><strong>${T('home.help_title')}</strong><small>${T('home.help_sub')}</small></span>${icon('chevron', 'dim')}</button>
    <ul class="quick">${quick.map((n) => `<li><button ${go({ v: 'need', id: n.id })}>${icon(n.icon)}<span>${T('quick.' + n.id)}</span></button></li>`).join('')}</ul>`}
    ${ev.length ? `<div class="sechead"><h2>${T('home.events')}</h2><button class="link" ${go({ v: 'tab', tab: 'events' })}>${T('home.see_all')}</button></div><ul class="events">${ev.map(eventItem).join('')}</ul>` : ''}
    <div class="duo"><button class="tile" ${go({ v: 'tab', tab: 'rec' })}>${icon('rec')}<strong>${T('tab.rec')}</strong><small>${T('home.rec_sub', { count: openSegs })}</small></button>
      <button class="tile" ${go({ v: 'tab', tab: 'transit' })}>${icon('transit')}<strong>${T('tab.transit')}</strong><small>${T('home.transit_sub')}</small></button></div>
    <p class="foot">${T('home.updated', { when: prettyDate(bundle.index.generated_at) })} · <button class="link" ${go({ v: 'about' })}>${T('about.title')}</button></p></main>`;
}
function helpTab(): string {
  const group = (g: Need['group']) => `<ul class="rows">${NEEDS.filter((n) => n.group === g).map((n) => rowLink({ v: 'need', id: n.id }, n.icon, t('need.' + n.id))).join('')}</ul>`;
  return `<main><h1 class="page" tabindex="-1">${T('home.needs')}</h1><p class="lede">${T('help.lede')}</p>${searchBtn()}
    <h2>${T('help.now')}</h2>${group('now')}<h2>${T('help.soon')}</h2>${group('soon')}
    <h2>${T('home.categories')}</h2><ul class="chips">${CATEGORIES.map((c) => `<li><button class="chip lg" ${go({ v: 'list', cat: c.id })}>${icon(c.icon, 'sm')}${T('cat.' + c.id)}</button></li>`).join('')}</ul>
    <h2>${T('help.more')}</h2><ul class="rows">${rowLink({ v: 'saved' }, 'bookmark', t('saved.title'), t('saved.sub'))}${rowLink({ v: 'add' }, 'plus', t('add.title'), t('add.sub'))}</ul></main>`;
}
function recTab(): string {
  const g = bundle?.greenway, parks = bundle?.parks ?? [];
  const openCount = g?.segments.filter((s) => s.phase === 'open').length ?? 0;
  const nearParks = here ? [...parks].map((p) => ({ p, mi: milesBetween(here!, p) })).sort((a, b) => a.mi - b.mi).slice(0, 5) : [];
  const centers = rank(bundle?.rows ?? [], { category: 'rec', ...(here ? { near: here } : {}) }, now());
  return `<main><h1 class="page" tabindex="-1">${T('tab.rec')}</h1><p class="lede">${T('rec.lede')}</p>
    ${g ? `<button class="feature" ${go({ v: 'greenway' })}><span class="rowic big">${icon('path')}</span><span class="rowtx"><strong>${T('gw.title')}</strong><small>${T('rec.gw_sub', { count: openCount })}</small></span>${icon('chevron', 'dim')}</button>${mapBox({ key: 'rec', label: t('map.label_rec') })}` : ''}
    ${parks.length ? `<h2>${T('rec.parks')}</h2>${locChip()}${nearParks.length ? `<ul class="rows">${nearParks.map(({ p, mi }) => `<li><div class="row static"><span class="rowic">${icon('rec')}</span><span class="rowtx"><strong>${esc(p.name)}</strong><small>${[p.address, t('miles', { miles: mi.toFixed(1) })].filter(Boolean).map(esc).join(' · ')}</small></span></div></li>`).join('')}</ul>` : ''}
      <button class="btn ghost" ${go({ v: 'parks' })}>${T('rec.all_parks', { count: parks.length })}</button>` : ''}
    <h2>${T('rec.centers')}</h2>${centers.length ? `<ul class="cards">${centers.map((r) => card(r)).join('')}</ul>` : `<p class="empty">${T('rec.centers_none')}</p>`}
    ${TRANSIT.bike ? `<h2>${T('rec.bike')}</h2><div class="panel"><p>${esc(TRANSIT.bike.body)}</p>${ext(TRANSIT.bike.url, TRANSIT.bike.label)}</div>` : ''}</main>`;
}
function parksList(): string {
  const parks = [...(bundle?.parks ?? [])].sort((a, b) => (here ? milesBetween(here, a) - milesBetween(here, b) : a.name.localeCompare(b.name)));
  return `<main>${mapBox({ key: 'parks', label: t('map.label_parks'), ...(here ? { fit: [here], minMeters: 3000 } : { fit: CITY, cover: true }) })}${locChip()}<ul class="rows">${parks.map((p) => `<li><div class="row static"><span class="rowtx"><strong>${esc(p.name)}</strong><small>${[p.address, here ? t('miles', { miles: milesBetween(here, p).toFixed(1) }) : ''].filter(Boolean).map(esc).join(' · ')}</small></span></div></li>`).join('')}</ul>
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
  const chosen = n.refine?.find((r) => r.id === view.refine);
  const query = n.refine ? chosen?.query : n.query;
  if (chosen?.benefits) return `<main><p class="lede">${T('benefits.lede')}</p>${FOOD_BENEFITS.items.map((b) => `<h2>${esc(b.title)}</h2><div class="panel"><p>${esc(b.body)}</p><div class="stackbtns">${ext(b.url, b.label)}</div></div>`).join('')}
    <p class="foot">${T('benefits.note')} <a href="tel:211">211</a></p><p class="foot">${T('transit.checked', { date: prettyDate(FOOD_BENEFITS.checked) })}</p></main>`;
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
      <div class="two">${canSave(r.category) ? `<button class="btn ghost" data-save="${esc(r.id)}" aria-pressed="${savedIds.includes(r.id)}">${icon('bookmark', 'sm')}${T(savedIds.includes(r.id) ? 'saved.remove' : 'saved.add')}</button>` : ''}<button class="btn ghost" data-share="${esc(r.id)}">${T('detail.share')}</button></div>
      ${savedIds.includes(r.id) ? `<p class="foot" role="status">${T('saved.note')}</p>` : ''}</div>
    ${r.category === 'shelter.dv' ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    <h2>${T('detail.what')}</h2><p>${esc(r.what)}</p>${r.eligibility ? `<h2>${T('detail.who')}</h2><p>${esc(r.eligibility)}</p>` : ''}
    ${r.schedules.length ? `<h2>${T('detail.hours')}</h2><ul class="hours">${r.schedules.map(hoursLine).join('')}</ul>` : ''}${r.hours_text ? `<p>${T('detail.hours_as_listed', { text: r.hours_text })}</p>` : ''}
    ${next.length ? `<h2>${T('detail.next')}</h2><ul class="hours">${next.map((n) => `<li><span>${esc(dayName(n.date))}</span><span>${esc(clock(n.opens_at))} – ${esc(clock(n.closes_at))}</span></li>`).join('')}</ul>` : ''}
    ${r.address ? `<h2>${T('detail.where')}</h2><address>${esc(r.address.line1)}<br>${esc(r.address.city)}, MI ${esc(r.address.zip ?? '')}</address>${!sensitive && r.lat !== undefined ? mapBox({ key: 'r:' + r.id, label: t('map.label_place', { name: r.name }), small: true, quiet: true, fit: [{ lat: r.lat, lon: r.lon! }], minMeters: 650, dots: [{ lat: r.lat, lon: r.lon!, label: r.name }] }) : ''}<p class="foot">${T('detail.directions_note')}</p>` : ''}
    ${gw ? `<p><button class="link" ${go({ v: 'segment', id: gw.segment.id })}>${icon('path', 'sm')} ${T('detail.near_greenway', { miles: gw.miles.toFixed(1), segment: gw.segment.name })}</button></p>` : ''}
    ${r.website ? `<p>${ext(r.website, t('detail.website'), 'link')}</p>` : ''}
    <h2>${T('detail.source')}</h2><p>${esc(r.facts.source.name)}</p>${reportBox(r.id, false, r.category)}</main>` };
}
// Maps (map.ts): streets, parks and the greenway, drawn on the phone from the signed bundle. No third party.
// A screen asks for a map here; the views are attached after the screen is drawn.
let mapSpecs: MapSpec[] = [], mapViews: MapView[] = [];
const CITY = [{ lat: 42.256, lon: -83.287 }, { lat: 42.45, lon: -82.911 }];   // the whole city, for maps that are about parks
const segPoints = (segs: Segment[]) => segs.flatMap((x) => x.lines.flat().map(([lon, lat]) => ({ lat, lon })));
function mapBox(o: { key: string; label: string; focus?: string; dots?: MapDot[]; fit?: { lat: number; lon: number }[]; minMeters?: number; small?: boolean; cover?: boolean; quiet?: boolean; outline?: { lat: number; lon: number }[][] }): string {
  const segments = bundle?.greenway?.segments ?? [];
  const phase = Object.fromEntries(['open', 'under_construction', 'funded', 'planned'].map((ph) => [ph, t('gw.' + ph)]));
  mapSpecs.push({
    key: o.key, label: o.label, segments, focus: o.focus, dots: o.dots, minMeters: o.minMeters, cover: o.cover, quiet: o.quiet, outline: o.outline,
    me: here && !hereZip ? here : null,                       // a typed ZIP is not where the person is
    fit: o.fit?.length ? o.fit : segPoints(segments),
    segGo: (id) => JSON.stringify({ v: 'segment', id } satisfies View),
    strings: { zoomIn: t('map.zoom_in'), zoomOut: t('map.zoom_out'), reset: t('map.reset'), bigger: t('map.bigger'), smaller: t('map.smaller'), details: t('map.details'), park: t('map.park'), noStreets: t('map.no_streets'), source: (date) => t('map.source', { date: prettyDate(date) }), phase },
  });
  return `<div class="mapbox${o.small ? ' small' : ''}" data-map="${mapSpecs.length - 1}"></div>`;
}
function mountMaps(): void {
  if (!bundle) return;
  for (const el of app.querySelectorAll<HTMLElement>('.mapbox[data-map]')) mapViews.push(new MapView(el, mapSpecs[Number(el.dataset.map)]!, bundle.index));
}
function greenway(): string {
  const g = bundle!.greenway;
  if (!g) return `<main><p class="empty">${T('results.none')}</p></main>`;
  const group = (phase: string) => { const s = g.segments.filter((x) => x.phase === phase); return s.length ? `<h2>${T('gw.' + phase)} <span class="count">${s.length}</span></h2><ul class="rows">${s.map((x) => rowLink({ v: 'segment', id: x.id }, 'path', x.name)).join('')}</ul>` : ''; };
  return `<main><p class="lede">${T('gw.intro')}</p>${mapBox({ key: 'greenway', label: t('gw.map_label') })}${group('open')}${group('under_construction')}${group('funded')}${group('planned')}<p class="foot">${T('gw.source', { date: prettyDate(g.source.last_edited) })}</p></main>`;
}
function segment(s: Segment): string {
  const near = helpAlong(bundle!.rows.filter((r) => r.category !== 'shelter.dv'), s);
  const ranked = rank(near.map((n) => n.row), {}, now(), bundle!.alerts);
  return `<main><p class="meta"><span class="pill ${s.phase === 'open' ? 'open' : 'closed'}">${T('gw.' + s.phase)}</span></p>${s.phase === 'open' ? '' : `<p class="lede">${T('gw.not_open')}</p>`}
    ${mapBox({ key: 'seg:' + s.id, label: t('map.label_segment', { name: s.name }), focus: s.id, fit: segPoints([s]), minMeters: 700, dots: near.map((n) => ({ lat: n.row.lat!, lon: n.row.lon!, label: n.row.name, go: JSON.stringify({ v: 'detail', id: n.row.id }) })) })}
    ${s.cross_streets?.length ? `<h2>${T('gw.crosses')}</h2><p>${esc(s.cross_streets.join(' · '))}</p>` : ''}
    <h2>${T('gw.help_along')}</h2>${ranked.length ? `<ul class="cards">${ranked.map((r) => card({ ...r, miles: near.find((n) => n.row.id === r.row.id)!.miles })).join('')}</ul>` : `<p class="empty">${T('gw.help_none')}</p>`}
    ${s.phase === 'open' ? reportBox(s.id, true) : ''}
    ${bundle!.index.files['indicators/neighborhoods.json'] ? `<h2>${T('hood.about_area')}</h2><ul class="rows">${indicators ? (indicators.segments[s.id] ?? []).map((id) => indicators!.neighborhoods.find((n) => n.id === id)).filter((n): n is Hood => !!n).map((n) => rowLink({ v: 'hood', id: n.id }, 'info', n.name)).join('') : ''}${rowLink({ v: 'hoods', lens: 'jlg' }, 'path', t('hood.lens_jlg'))}</ul>` : ''}</main>`;
}
// Search: the text lives in one variable. It is never stored, sent, or put in the URL (docs/05).
function searchResults(): string {
  const tokens = searchTokens(searchText);
  if (!tokens.length) return `<p class="foot">${T('search.hint')}</p>`;
  const found = search(bundle!.rows, searchText, here ? { near: here } : {}, now(), bundle!.alerts);
  const closed = bundle!.archived.filter((a) => matchTier(tokens, a) !== null);
  if (!found.length && !closed.length) return `<p class="empty">${T('search.none')} <a href="tel:211">211</a></p>`;
  return `${found.length ? `${locChip()}<ul class="cards">${found.slice(0, 30).map((r) => card(r)).join('')}</ul>` : ''}
    ${closed.length ? `<h2>${T('search.closed_head')}</h2><ul class="rows">${closed.map((a) => rowLink({ v: 'detail', id: a.id }, 'info', a.name, t('badge.archived', { date: prettyDate(a.archived.at) }))).join('')}</ul>` : ''}`;
}
function searchScreen(): string {
  return `<main><label class="searchbox">${T('search.label')}<input id="q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="60" value="${esc(searchText)}"></label>
    <div id="searchout" aria-live="polite">${searchResults()}</div></main>`;
}
function savedScreen(): string {
  const rows = bundle!.rows.filter((r) => savedIds.includes(r.id) && canSave(r.category));
  const ranked = rank(rows, here ? { near: here } : {}, now(), bundle!.alerts).sort((a, b) => savedIds.indexOf(a.row.id) - savedIds.indexOf(b.row.id));
  const closed = bundle!.archived.filter((a) => savedIds.includes(a.id));
  if (!ranked.length && !closed.length) return `<main><p class="lede">${T('saved.note')}</p><p class="empty">${T('saved.none')}</p></main>`;
  return `<main><p class="lede">${T('saved.note')}</p><ul class="cards">${ranked.map((r) => card(r)).join('')}</ul>
    ${closed.length ? `<h2>${T('search.closed_head')}</h2><ul class="rows">${closed.map((a) => rowLink({ v: 'detail', id: a.id }, 'info', a.name, t('badge.archived', { date: prettyDate(a.archived.at) }))).join('')}</ul>` : ''}
    <button class="btn ghost" data-saved-clear>${T('saved.clear')}</button></main>`;
}
// Add a place (docs/04): about the place, never about the person sending it. A steward checks it before it can appear.
function addScreen(): string {
  if (proposed) return `<main><p class="banner ok" role="status">${icon('check', 'sm')} ${T(proposed.state === 'queued' ? 'add.queued' : 'add.sent')}${proposed.ref ? ` ${T('add.ref', { ref: proposed.ref })}` : ''}</p>
    <button class="btn ghost" data-add-again>${T('add.again')}</button></main>`;
  const field = (name: string, max: number, o: { required?: boolean; area?: boolean; hint?: string; mode?: string } = {}) => `<label>${T('add.f.' + name)}${o.required ? '' : ` <small>${T('add.optional')}</small>`}
    ${o.area ? `<textarea name="${name}" rows="2" maxlength="${max}" ${o.required ? 'required' : ''}></textarea>` : `<input name="${name}" maxlength="${max}" autocomplete="off" ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.required ? 'required' : ''}>`}${o.hint ? `<small>${T(o.hint)}</small>` : ''}</label>`;
  const radios = (name: string, ids: readonly string[], key: (id: string) => string) => `<fieldset><legend>${T('add.f.' + name)}</legend><div class="kinds">${ids.map((id) => `<label class="pick"><input type="radio" name="${name}" value="${id}" required><span>${esc(key(id))}</span></label>`).join('')}</div></fieldset>`;
  return `<main><p class="lede">${T('add.lede')}</p>${proposeError ? `<p class="banner warn" role="alert">${T('add.missing')}</p>` : ''}
    <form class="addform" data-add novalidate>${field('name', 120, { required: true })}${radios('category', PROPOSE_CATEGORIES, (id) => t('add.cat.' + id))}
      ${field('what', 280, { required: true, area: true, hint: 'add.h.what' })}${field('address', 200, { hint: 'add.h.address' })}${field('schedule_text', 200, { hint: 'add.h.schedule' })}${field('phone', 40, { mode: 'tel', hint: 'add.h.phone' })}
      ${radios('how_known', HOW_KNOWN, (id) => t('add.how.' + id))}${field('notes', 280, { area: true, hint: 'add.h.notes' })}
      <button class="btn" type="submit">${T('add.send')}</button><p class="foot">${T('add.privacy')}</p></form></main>`;
}
// Neighborhood pages (docs/13, hoods.ts). Not in the crisis path; the numbers load only when one of these screens opens.
function hoodScreen(v: Extract<View, { v: 'hoods' | 'hood' }>): { title: string; html: string } {
  if (indicators === undefined) { void loadIndicators(bundle!.index).then((d) => { indicators = d; render(false); }); }
  if (!indicators) return { title: t('hood.title'), html: `<main><p class="empty">${T(indicators === null ? 'hood.unavailable' : 'home.loading')}</p></main>` };
  const d = indicators, ui = {
    t, esc, date: prettyDate, link: (url: string, label: string) => ext(url, label, 'link'), go: (view: object) => go(view as View),
    map: (h: Hood) => mapBox({ key: 'hood:' + h.id, label: t('map.label_hood', { name: h.name }), quiet: false, outline: outline(h, d.origin), fit: outline(h, d.origin).flat(), minMeters: 900 }),
  };
  if (v.v === 'hoods') return { title: t(v.lens === 'jlg' ? 'hood.lens_jlg' : 'hood.title'), html: hoodList(d, ui, v.lens) };
  const h = d.neighborhoods.find((x) => x.id === v.id);
  return h ? { title: h.name, html: hoodPage(h, d, ui) } : { title: t('hood.title'), html: hoodList(d, ui) };
}
function about(): string {
  const i = bundle?.index;
  return `<main>${[1, 2, 3, 4].map((n) => `<p>${T('about.p' + n)}</p>`).join('')}
    ${i ? `<p class="foot">${T('about.data', { version: i.version, date: prettyDate(i.generated_at) })} ${T(i.signing === 'release' ? 'about.sig_ok' : 'about.sig_dev')}</p>` : ''}<p class="foot">${T('about.open')}</p>
    <h2>${T('hood.title')}</h2><ul class="rows">${rowLink({ v: 'hoods' }, 'info', t('hood.title'), t('hood.about_sub'))}</ul></main>`;
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
  if (v.v === 'add') return '#/add';
  if (v.v === 'hoods') return v.lens ? `#/n/lens-${v.lens}` : '#/n';
  if (v.v === 'hood') return `#/n/${v.id}`;
  return null; // the urgent sheet, search, saved places, and every "need" screen: no trace
}
function fromHash(h: string): View {
  const m = /^#\/(r|c|n|greenway|about|add|parks|help|rec|transit|events)(?:\/([\w.-]+))?$/.exec(h);
  if (!m) return { v: 'tab', tab: 'home' };
  if (m[1] === 'r' && m[2]) return { v: 'detail', id: m[2] };
  if (m[1] === 'c' && m[2]) return { v: 'list', cat: m[2] };
  if (m[1] === 'n') return !m[2] ? { v: 'hoods' } : m[2].startsWith('lens-') ? { v: 'hoods', lens: m[2].slice(5) } : { v: 'hood', id: m[2] };
  if (m[1] === 'greenway') return m[2] ? { v: 'segment', id: m[2] } : { v: 'greenway' };
  if (m[1] === 'about' || m[1] === 'parks' || m[1] === 'add') return { v: m[1] };
  return { v: 'tab', tab: m[1] as TabId };
}
const TAB_OF: Partial<Record<View['v'], TabId>> = { search: 'help', saved: 'help', add: 'help', hoods: 'home', hood: 'home', need: 'help', list: 'help', detail: 'help', greenway: 'rec', segment: 'rec', parks: 'rec' };
function render(focus = true): void {
  const v = stack[stack.length - 1]!;
  for (const m of mapViews) m.destroy();
  mapViews = []; mapSpecs = [];
  let title: string | undefined, body: string, exit = false;
  if (v.v === 'tab' || !bundle) { const tab = v.v === 'tab' ? v.tab : 'home'; body = !bundle || tab === 'home' ? homeTab() : tab === 'help' ? helpTab() : tab === 'rec' ? recTab() : tab === 'transit' ? transitTab() : eventsTab(); }
  else if (v.v === 'urgent') { title = t('strip.more'); body = urgent(); }
  else if (v.v === 'about') { title = t('about.title'); body = about(); }
  else if (v.v === 'search') { title = t('search.title'); body = searchScreen(); }
  else if (v.v === 'saved') { title = t('saved.title'); body = savedScreen(); }
  else if (v.v === 'add') { title = t('add.title'); body = addScreen(); }
  else if (v.v === 'hoods' || v.v === 'hood') { const hs = hoodScreen(v); title = hs.title; body = hs.html; }
  else if (v.v === 'need') { const n = NEEDS.find((x) => x.id === v.id)!; title = t(n.stepsOnly ? 'od.title' : 'need.' + n.id); exit = !!n.quickExit; body = need(v); }
  else if (v.v === 'list') { title = t('cat.' + v.cat); body = `<main>${results(CATEGORIES.find((c) => c.id === v.cat)?.query ?? {}, {})}</main>`; }
  else if (v.v === 'detail') { const d = detail(v.id); title = d.title; exit = d.exit; body = d.html; }
  else if (v.v === 'greenway') { title = t('gw.title'); body = greenway(); }
  else if (v.v === 'parks') { title = t('rec.parks'); body = parksList(); }
  else { const s = bundle.greenway?.segments.find((x) => x.id === v.id); title = s?.name ?? t('gw.title'); body = s ? segment(s) : greenway(); }
  const fromStack = stack.map((x) => (x.v === 'tab' ? x.tab : undefined)).filter(Boolean).pop();
  const active = v.v === 'tab' ? v.tab : fromStack ?? TAB_OF[v.v];
  app.innerHTML = topBar(title, exit) + body + tabBar(active);
  mountMaps();
  if (focus) { window.scrollTo(0, 0); app.querySelector<HTMLElement>(v.v === 'search' && !searchText ? '#q' : 'h1')?.focus({ preventScroll: true }); }
}
function navigate(view: View): void {
  if (view.v === 'tab') { stack.length = 0; searchText = ''; }   // a tab is a fresh start, not one more screen to back out of
  if (view.v !== 'detail') listMap = false;   // coming back from a place, the map is still open
  if (view.v === 'add') { proposed = null; proposeError = false; }
  stack.push(view);
  history.pushState({ n: stack.length }, '', hashFor(view) ?? location.pathname + location.search);
  render();
}
window.addEventListener('popstate', () => { if (stack.length > 1) stack.pop(); else stack[0] = fromHash(location.hash); render(); });

app.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-go],[data-back],[data-exit],[data-loc],[data-share],[data-report],[data-listmap],[data-save],[data-saved-clear],[data-add-again]');
  if (!el) return;
  if (el.dataset.go) { ev.preventDefault(); navigate(JSON.parse(el.dataset.go) as View); }
  else if ('listmap' in el.dataset) { listMap = !listMap; render(false); }
  else if (el.dataset.save) { const row = bundle?.rows.find((x) => x.id === el.dataset.save); savedIds = await toggleSaved(savedIds, el.dataset.save, row?.category ?? ''); render(false); }
  else if ('savedClear' in el.dataset) { savedIds = await clearSaved(); render(false); }
  else if ('addAgain' in el.dataset) { proposed = null; render(); }
  else if (el.dataset.report) {
    const box = el.closest<HTMLElement>('.report')!, target = box.dataset.target!;
    // A photo, if there is one, is re-drawn without its hidden data and sent first; the report then names it.
    const file = box.querySelector<HTMLInputElement>('[data-photo]')?.files?.[0];
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    const photo = file ? await preparePhoto(file).then((b) => (b ? uploadPhoto(b) : null)) : null;
    const state = await submit(await buildReport(target, el.dataset.report, box.querySelector('textarea')?.value ?? '', new Date(), photo));
    reported.set(target, file && !photo && state === 'sent' ? 'sent_no_photo' : state);
    render(false);
  }
  else if ('back' in el.dataset) { if (stack.length > 1) history.back(); else navigate({ v: 'tab', tab: TAB_OF[stack[0]!.v] ?? 'home' }); }
  else if ('exit' in el.dataset) { stack.length = 0; location.replace('https://www.weather.gov/'); }   // replace(): this page leaves the back button too
  else if (el.dataset.loc === 'off') { here = null; hereZip = ''; redraw(); }
  else if (el.dataset.loc === 'zip') { zipOpen = true; zipUnknown = false; redraw(); app.querySelector<HTMLInputElement>('.zipform input')?.focus(); }
  else if (el.dataset.loc === 'on') {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { here = { lat: pos.coords.latitude, lon: pos.coords.longitude }; hereZip = ''; locDenied = zipUnknown = zipOpen = false; redraw(); },
      () => { locDenied = true; zipUnknown = false; redraw(); }, { maximumAge: 60000, timeout: 10000 });
  } else if (el.dataset.share) {
    const url = `${location.origin}/#/r/${el.dataset.share}`;   // a listing id only; nothing about the person
    try { if (navigator.share) await navigator.share({ url }); else await navigator.clipboard.writeText(url); } catch { /* cancelled */ }
  }
});
// On the search screen only the results are re-drawn, so the keyboard and the cursor stay put.
function redraw(): void {
  const out = stack[stack.length - 1]!.v === 'search' ? app.querySelector('#searchout') : null;
  if (out) out.innerHTML = searchResults(); else render(false);
}
app.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.id === 'q') { searchText = el.value; redraw(); }
});
app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  if ('add' in form.dataset) {
    const p = buildProposal(Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)])));
    if (!p) { proposeError = true; app.querySelector('.addform')?.insertAdjacentHTML('beforebegin', app.querySelector('.banner.warn') ? '' : `<p class="banner warn" role="alert">${T('add.missing')}</p>`); window.scrollTo(0, 0); return; }
    form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = true;
    void submitProposal(p).then((r) => { proposed = r; proposeError = false; render(); });
    return;
  }
  if (!('zip' in form.dataset)) return;
  const zip = String(new FormData(form).get('zip') ?? '').trim(), c = bundle?.zips?.[zip];
  if (c) { here = { lat: c[0], lon: c[1] }; hereZip = zip; zipOpen = zipUnknown = locDenied = false; } else zipUnknown = true;
  redraw();
});

// ---- start ------------------------------------------------------------------
let lastCheck = 0;
async function checkForUpdate(): Promise<void> {
  if (Date.now() - lastCheck < 15 * 60000) return;
  lastCheck = Date.now();
  // A new list brings new neighborhood numbers: forget the old ones, and load again when a neighborhood screen asks.
  try { const next = await refresh(bundle); if (next) { bundle = next; indicators = undefined; render(false); } }
  catch (e) { console.warn('bundle refresh failed; keeping what we have', e); if (!bundle) { loadError = true; render(false); } }
}
async function start(): Promise<void> {
  stack[0] = fromHash(location.hash);
  render(false);
  bundle = await cached();
  savedIds = await loadSaved();
  if (bundle) render(false);
  await checkForUpdate();
  void flush(); void flushProposals();
  window.addEventListener('online', () => { void flush(); void flushProposals(); void checkForUpdate(); });
  // An installed app can stay open for days. Look for a newer list whenever it comes back into view
  // (at most every 15 minutes), so nobody is reading last week's list on a phone that has signal.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  // A shared link opened while the app is already open only changes the hash.
  window.addEventListener('hashchange', () => { const v = fromHash(location.hash); if (JSON.stringify(v) !== JSON.stringify(stack[stack.length - 1])) { stack.length = 0; stack.push(v); render(); } });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'cache', urls: performance.getEntriesByType('resource').map((r) => r.name) });
  }
}
void start();
