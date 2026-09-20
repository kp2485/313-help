import {
  badge, bundleAge, effectiveNow, helpAlong, matchTier, miles as milesBetween, nearestSegment, nextOccurrences, openNow, rank, search, searchTokens,
  type Alert, type BundleRow, type OpenResult, type Query, type Ranked, type Schedule, type Segment,
} from '@313help/query';
import { LANGS, currentLang, initLang, locale, setLang, t, type Lang } from './i18n.js';
import { phoneParts, telHref } from './phone.js';
import { cached, refresh, type Bundle } from './data.js';
import { hoodList, hoodPage, loadIndicators, outline, type Hood, type Indicators } from './hoods.js';
import { icon } from './icons.js';
import { MapView, loadLayer, type LayerData, type MapDot, type MapSpec, type Overlay } from './map.js';
import { CATEGORIES, HARDCODED, MAP_GROUPS, NEEDS, PRIVATE_TOPS, TABS, isPrivate, isSensitive, type Need, type TabId } from './needs.js';
import { loadLayers, toggleLayer } from './layers.js';
import { createRouter, hashFor, type View } from './router.js';
import { CONFIRM, LISTING_KINDS, PLACE_KINDS, build as buildReport, flush, preparePhoto, resetInstallSecret, submit, uploadPhoto } from './report.js';
import { TRANSIT } from './transit.js';
import { LINKS } from './links.js';
import { HOW_KNOWN, PROPOSE_CATEGORIES, buildProposal, flushProposals, submitProposal } from './propose.js';
import { canSave, clearSaved, loadSaved, toggleSaved } from './saved.js';
import { directionsHref, transitAppHref, transitHref } from './directions.js';
import './style.css';

// ---- state: memory only. Nothing about what a person taps is ever written or sent. ----------
let bundle: Bundle | undefined;
let loadError = false;
let here: { lat: number; lon: number } | null = null;   // device location, or a ZIP's center: this variable only, never stored
let hereZip = '';                                        // the ZIP a person typed, when `here` came from one
let locDenied = false, zipOpen = false, zipUnknown = false;
let savedIds: string[] = [];                             // listing ids saved on this phone (saved.ts); never sent
let proposed: { state: 'sent' | 'queued'; ref?: string } | null = null, proposeError = false;
let missing: string[] = [];                              // which "Add a place" fields were left empty, for the error text
// What a person typed into "Add a place", kept while the screen is redrawn to show what is missing: nobody is
// ever made to type it all again (WCAG 3.3.7). Memory only, cleared when the screen is left or the form is sent.
let addValues: Record<string, string> = {};
let indicators: Indicators | null | undefined;           // neighborhood numbers (docs/13): fetched the first time a neighborhood screen opens
let listMap = false;                                      // "Show these on a map" is open on the current list
let searchText = '';                                     // memory only: never stored, sent, or put in the URL
let searchCount = '';                                    // "12 places found": what the live region says after a keystroke
let layersOn: string[] = [];                             // map layers switched on (layers.ts): this phone only
const layerFiles = new Map<string, LayerData | null>();  // layer shapes already loaded, this visit only
let refocusSel = '';
let refocus = '';                                        // a layer switch to put the cursor back on after redrawing
// Where the cursor goes after a redraw that is not a new screen (a report sent, a place saved, the map opened on a
// list). Without this the whole page is replaced under the person's feet and the keyboard starts again at the top.
const reported = new Map<string, 'sent' | 'queued' | 'sent_no_photo'>();   // this visit only, so the thank-you stays put
const app = document.getElementById('app')!;
// The back stack (router.ts): memory only; the browser's history holds a random key per entry and nothing else.
const sensitiveId = (id: string) => { const r = bundle?.rows.find((x) => x.id === id); return !!r && isPrivate(r.category); };
const router = createRouter(history, { sensitive: sensitiveId, path: () => location.pathname + location.search });
/** True when a screen may be named in the browser's own window title and history list. */
const traceable = (v: View) => hashFor(v, sensitiveId, location.pathname) !== null;
const stack = router.stack;

// ---- helpers ----------------------------------------------------------------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const T = (key: string, p?: Record<string, string | number>) => esc(t(key, p));
const go = (view: View) => `data-go="${esc(JSON.stringify(view))}"`;
const now = () => effectiveNow(new Date(), bundle?.index.generated_at);
const ext = (url: string, label: string, cls = 'btn ghost') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon('out', 'sm')}</a>`;
// What a place wrote about itself is never translated (docs/05). On a Spanish (or Arabic, or Bengali) screen those
// words must still be marked as English, so a screen reader switches voice instead of reading English with Spanish
// rules (WCAG 3.1.2). `owner()` is for anything a place, a city dataset or an alert wrote; `T()` is for our words.
const owner = (s: unknown) => (currentLang() === 'en' ? esc(s) : `<span lang="en">${esc(s)}</span>`);
/** A phone number, ready to show: unbreakable pieces, each one left-to-right even inside right-to-left text. */
const phoneHtml = (n: string) => phoneParts(n).map((p) => `<bdi>${esc(p)}</bdi>`).join(' ');
// One live region for the whole app, outside #app so a redraw never destroys it: a screen reader only announces a
// change inside a region that was already there. Everything the app does without moving the screen (a report sent,
// a place saved, a ZIP that isn't ours, a layer switched on) says so here.
let sayEl: HTMLElement | null = null;
function announce(message: string): void {
  if (!sayEl) { sayEl = document.createElement('p'); sayEl.className = 'vh'; sayEl.setAttribute('role', 'status'); sayEl.setAttribute('aria-live', 'polite'); document.body.append(sayEl); }
  sayEl.textContent = '';                                  // an identical message twice in a row is still announced
  setTimeout(() => { if (sayEl) sayEl.textContent = message; }, 60);
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
}
const detroitDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(d);
function dayName(date: string): string {
  const diff = Math.round((Date.parse(date) - Date.parse(detroitDay(now()))) / 86400000);
  if (diff === 0) return t('day.today');
  if (diff === 1) return t('day.tomorrow');
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
}
function prettyDate(d: string): string {
  return d ? new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d.slice(0, 10))) : '';
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
  return `<a class="callrow ${id === 'emg_911' ? 'is911' : ''}" href="${telHref(e.number)}" aria-label="${T('strip.call_label', { label: e.label, number: e.number })}">${icon('phone')}<span>${esc(e.label)}</span><strong>${phoneHtml(e.number)}</strong></a>`;
}

// ---- chrome -----------------------------------------------------------------
const logo = `<svg class="logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M16 7l2.6 6.4L25 16l-6.4 2.6L16 25l-2.6-6.4L7 16l6.4-2.6z" fill="var(--bg)"/></svg>`;
function topBar(title?: string, quickExit = false): string {
  // On a wide screen Urgent help lives in the side rail (tabBar puts it there), so the top bar does not draw a
  // second copy at all: two buttons with the same name, one of them hidden by CSS, is a trap for a screen reader.
  const urgentBtn = wide.matches ? '' : `<button class="urgent" ${go({ v: 'urgent' })}>${icon('phone', 'sm')}<span>${T('strip.more')}</span></button>`;
  // The name is `<bdi>`: on a right-to-left screen "313 Help" is a number and a word, and without an isolate the
  // two swap places and the app calls itself "Help 313".
  if (!title) return `<header class="top"><div class="brand">${logo}<bdi>${T('app.name')}</bdi></div>${urgentBtn}</header>`;
  return `<header class="top inner"><button class="iconbtn" data-back aria-label="${T('back')}">${icon('back', 'turn')}</button><h1 tabindex="-1">${esc(title)}</h1>
    ${quickExit ? `<button class="exit" data-exit>${T('safe.exit')}</button>` : urgentBtn}</header>`;
}
// Every language names itself in its own words and carries its own `lang`, so an Arabic reader can find Arabic on
// an English screen and a screen reader says each name in the right voice (WCAG 3.1.2). The one in use is not a
// button: it is marked as the current choice instead, so nobody taps what they already have.
const langBtn = () => `<nav class="langrow" aria-label="${T('lang.switch')}">${LANGS.map((l) => (l.code === currentLang()
  ? `<span class="langnow" lang="${l.code}" aria-current="true">${esc(l.name)}</span>`
  : `<button class="link" data-lang="${l.code}" lang="${l.code}">${esc(l.name)}</button>`)).join('')}</nav>`;
// The Events tab shows only when the list carries upcoming events (none today: DECISIONS 2026-09-19).
const shownTabs = () => TABS.filter((x) => x.id !== 'events' || upcoming(1).length > 0);
// A laptop or a desktop (Kyle, 2026-09-20). On a wide screen the tab bar is a rail down the side, so it is drawn
// before the page instead of after it: what the keyboard reaches follows what the eye sees, at either width.
// A phone, and a laptop zoomed to 400%, are both narrow and get the phone layout untouched.
const wide = matchMedia('(min-width: 64rem)');
function tabBar(active?: TabId): string {
  // In the rail, Urgent help is the first thing and the top bar drops its copy (style.css hides it), so the
  // numbers are still one click from every screen (Principle 3).
  const urgentFirst = wide.matches ? `<button class="urgent" ${go({ v: 'urgent' })}>${icon('phone', 'sm')}<span>${T('strip.more')}</span></button>` : '';
  return `<nav class="tabs" aria-label="${T('tabs.label')}">${urgentFirst}${shownTabs().map((x) => `<button ${go({ v: 'tab', tab: x.id })} ${x.id === active ? 'aria-current="page"' : ''}>${icon(x.icon)}<span>${T('tab.' + x.id)}</span></button>`).join('')}</nav>`;
}
function ageBanner(): string {
  if (!bundle) return '';
  const age = bundleAge(bundle.index, now());
  const days = Math.floor((now().getTime() - Date.parse(bundle.index.generated_at)) / 86400000);
  if (age === 'aging') return `<p class="banner warn" role="note">${T('bundle.aging', { days })} ${T('bundle.alerts_may_be_missing')}</p>`;
  if (age === 'old') return `<p class="banner warn" role="note">${T('bundle.old', { date: prettyDate(bundle.index.generated_at) })}</p>`;
  if (age === 'retired') return `<p class="banner stop" role="note">${T('bundle.sunset')} <a href="tel:211">211</a></p>`;
  return '';
}
/** Retired only when a person published a final list marked retired: no report buttons, no new places. */
const retired = () => bundle?.index.retired === true;
function locChip(): string {
  if (here) return `<p class="loc">${icon('pin', 'sm')}<span>${T(hereZip ? 'loc.zip_using' : 'loc.using', { zip: hereZip })}</span> <button class="chip" data-loc="off">${T(hereZip ? 'loc.zip_off' : 'loc.off')}</button></p>`;
  // "Type a ZIP" (docs/05): for a person who would rather not share a location. The ZIP is looked up in the bundle, on the phone.
  const zip = !bundle?.zips ? '' : zipOpen
    // autocomplete="postal-code" names the field's purpose, which is what WCAG 1.3.5 asks for and what lets a
    // browser (or a person's own autofill) finish it. Nothing is stored or sent by us either way (DECISIONS).
    ? `<form class="zipform" data-zip><label>${T('loc.zip_label')} <input name="zip" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" maxlength="5" required aria-describedby="locnote"${zipUnknown ? ' aria-invalid="true"' : ''}></label><button class="chip" type="submit">${T('loc.zip_go')}</button></form>`
    : `<button class="chip" data-loc="zip">${T('loc.zip')}</button>`;
  return `<div class="loc"><button class="chip" data-loc="on">${icon('pin', 'sm')}${T('loc.use')}</button>${zip}<small id="locnote">${T(zipUnknown ? 'loc.zip_unknown' : locDenied ? 'loc.denied' : 'loc.note')}</small></div>`;
}
const searchBtn = () => `<button class="searchbtn" ${go({ v: 'search' })}>${icon('search', 'sm')}<span>${T('search.open')}</span></button>`;
// `own` marks a title a place or a city dataset wrote (a park, a greenway stretch, a listing): it is never
// translated, so on a Spanish screen it is marked as English (WCAG 3.1.2).
const rowLink = (view: View, ic: string, title: string, sub = '', own = false) =>
  `<li><button class="row" ${go(view)}><span class="rowic">${icon(ic)}</span><span class="rowtx"><strong>${own ? owner(title) : esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevron', 'sm turn dim')}</button></li>`;

function card(r: Ranked, showDistance = true): string {
  const b = badgeText(r.row), ph = r.row.phones[0];
  return `<li class="card"><a class="cardlink" ${go({ v: 'detail', id: r.row.id })} href="#/r/${esc(r.row.id)}">
      <h3>${owner(r.row.name)}</h3><p class="what">${owner(r.row.what)}</p>
      <p class="meta"><span class="pill ${r.open.state}">${esc(openText(r.open))}</span>${showDistance && r.miles !== null ? `<span class="pill plain">${T('miles', { miles: r.miles.toFixed(1) })}</span>` : ''}</p>
      ${r.row.notice ? `<p class="notice">${owner(r.row.notice)}</p>` : ''}<p class="fresh ${b.level}">${esc(b.text)}</p></a>
    ${ph ? `<a class="btn" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.row.name })}">${icon('phone', 'sm')}${T('detail.call')} <strong>${phoneHtml(ph.number)}</strong></a>` : ''}</li>`;
}
function results(query: Query, opts: { limit?: number; seeAll?: View; emptyKey?: string; noDistance?: boolean; linksBelow?: boolean }): string {
  const ranked = rank(bundle!.rows, { ...query, ...(here && !opts.noDistance ? { near: here } : {}) }, now(), bundle!.alerts);
  // Nothing listed: say so plainly. When the screen has links to programs below, point there instead of to 211.
  if (!ranked.length) return opts.linksBelow ? `<p class="empty">${T('results.none_links')}</p>` : `<p class="empty">${T(opts.emptyKey ?? 'results.none')} <a href="tel:211">211</a></p>`;
  const shown = opts.limit ? ranked.slice(0, opts.limit) : ranked;
  // The map is closed until asked for, so the first Call button stays near the top. Never on the "not safe at home"
  // screen, and never a dot for a sensitive listing (those carry no coordinates in the first place).
  const pins = opts.noDistance ? [] : ranked.filter((r) => r.row.lat !== undefined && !isSensitive(r.row.category));
  const map = !pins.length ? '' : listMap
    ? `${mapBox({ key: 'list:' + JSON.stringify(query), label: t('map.label_list'), quiet: true, fit: pins.map((r) => ({ lat: r.row.lat!, lon: r.row.lon! })), minMeters: 1500, dots: pins.map((r) => ({ lat: r.row.lat!, lon: r.row.lon!, label: r.row.name, go: JSON.stringify({ v: 'detail', id: r.row.id }) })) })}<button class="chip" data-listmap>${T('map.hide')}</button>`
    : `<button class="chip" data-listmap>${icon('pin', 'sm')}${T('map.show', { count: pins.length })}</button>`;
  return `${opts.noDistance ? '' : locChip()}${map}<h2 class="vh">${T('results.head')}</h2><ul class="cards">${shown.map((r) => card(r, !opts.noDistance)).join('')}</ul>
    ${opts.seeAll && ranked.length > shown.length ? `<button class="btn ghost" ${go(opts.seeAll)}>${T('results.see_all', { count: ranked.length })}</button>` : ''}`;
}
// One tap to confirm, one tap to correct (docs/04). Places get the things-not-people list (docs/11).
function reportBox(targetId: string, isPlace: boolean, category = ''): string {
  if (retired()) return '';
  const done = reported.get(targetId);
  // The thank-you replaces the buttons, so it is where the cursor goes; the live region says the same thing.
  if (done) return `<section class="report" data-target="${esc(targetId)}"><p class="banner ok" tabindex="-1">${icon('check', 'sm')} ${T(done === 'queued' ? 'report.queued' : isPlace ? 'report.sent_place' : 'report.sent')}${done === 'sent_no_photo' ? ` ${T('report.photo_failed')}` : ''}</p></section>`;
  const kinds = isPlace ? PLACE_KINDS : LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category));
  return `<section class="report" data-target="${esc(targetId)}">
    <button class="btn ghost" data-report="${isPlace ? CONFIRM.place : CONFIRM.listing}">${icon('check', 'sm')}${T(isPlace ? 'report.confirm.place' : 'report.confirm.listing')}</button>
    <details><summary>${T(isPlace ? 'report.fix' : 'report.wrong')}</summary>${isPlace ? `<p class="foot">${T('report.things_only')}</p>` : ''}
      <label>${T('report.note_label')}<textarea maxlength="280" rows="2"></textarea></label>
      ${isPlace && bundle?.index.photos === true ? `<label>${T('report.photo_label')}<input type="file" accept="image/*" capture="environment" data-photo></label><p class="foot">${T('report.photo_note')}</p>` : ''}
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
  return `<li class="event"><div class="when"><span>${esc(new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' }).format(new Date(e.starts_at.slice(0, 10))))}</span><strong>${Number(e.starts_at.slice(8, 10))}</strong></div>
    <div><h3>${owner(e.title)}</h3><p class="what">${time ? esc(time) + (e.location ? ' · ' : '') : ''}${e.location ? owner(e.location) : ''}</p>${e.url ? ext(e.url, t('events.details'), 'link') : ''}</div></li>`;
}
const whenFmt = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit' }).format(new Date(iso));
/** One alert card. An alert that hasn't started yet (a cancellation posted ahead) says when it starts. */
function alertBox(a: Alert): string {
  const later = Date.parse(a.starts_at) > now().getTime();
  return `<div class="alert"><strong>${owner(a.title)}</strong>${a.body_plain ? `<p>${owner(a.body_plain)}</p>` : ''}${(a.actions ?? []).filter((x) => x.tel).map((x) => `<a class="btn" href="${telHref(x.tel!)}">${icon('phone', 'sm')}${owner(x.label)}</a>`).join('')}
      <p class="foot">${later ? `${T('alert.from', { when: whenFmt(a.starts_at) })} · ` : ''}${T('alert.until', { when: whenFmt(a.ends_at) })}${a.source?.url ? ` · ${ext(a.source.url, t('alert.source'), 'link')}` : ''}</p></div>`;
}
function homeTab(): string {
  // No list yet (first visit with no signal, or a load that failed): the numbers that never depend on it, and the
  // overdose steps, are still one tap away.
  if (!bundle) return `<main><section class="hero"><h1 tabindex="-1">${T('home.hero')}</h1><p>${T(loadError ? 'home.no_data' : 'home.loading')}${loadError ? ` <a href="tel:211">211</a>` : ''}</p>${loadError ? `<button class="btn ghost" data-retry>${T('home.retry')}</button>` : ''}</section>
    <div class="stackbtns">${callButton('emg_911')}${callButton('emg_988')}</div>
    <ul class="rows">${rowLink({ v: 'need', id: 'overdose_now' }, 'pulse', t('need.overdose_now'), t('urgent.od_sub'))}</ul></main>`;
  const sunset = retired();
  const alerts = bundle.alerts.filter((a) => Date.parse(a.ends_at) > now().getTime() && Date.parse(a.starts_at) <= now().getTime());
  const ev = upcoming(3), openSegs = bundle.greenway?.segments.filter((s) => s.phase === 'open').length ?? 0;
  const quick = ['food', 'shelter', 'doctor', 'drugs', 'job', 'narcan'].map((id) => NEEDS.find((n) => n.id === id)!);
  return `<main>${langBtn()}<section class="hero"><h1 tabindex="-1">${T('home.hero')}</h1><p>${T('app.tagline')}</p></section>${ageBanner()}${sunset ? '' : searchBtn()}
    ${alerts.map(alertBox).join('')}
    ${sunset ? '' : `<button class="feature" ${go({ v: 'tab', tab: 'help' })}><span class="rowic big">${icon('help')}</span><span class="rowtx"><strong>${T('home.help_title')}</strong><small>${T('home.help_sub')}</small></span>${icon('chevron', 'turn dim')}</button>
    <ul class="quick">${quick.map((n) => `<li><button ${go({ v: 'need', id: n.id })}>${icon(n.icon)}<span>${T('quick.' + n.id)}</span></button></li>`).join('')}</ul>`}
    ${ev.length ? `<div class="sechead"><h2>${T('home.events')}</h2><button class="link" ${go({ v: 'tab', tab: 'events' })}>${T('home.see_all')}</button></div><ul class="events">${ev.map(eventItem).join('')}</ul>` : ''}
    <div class="duo"><button class="tile" ${go({ v: 'tab', tab: 'map' })}>${icon('pin')}<strong>${T('tab.map')}</strong><small>${T('home.map_sub')}</small></button>
      <button class="tile" ${go({ v: 'greenway' })}>${icon('path')}<strong>${T('gw.title')}</strong><small>${T('home.rec_sub', { count: openSegs })}</small></button></div>
    <p class="foot">${T('home.updated', { when: prettyDate(bundle.index.generated_at) })} · <button class="link" ${go({ v: 'about' })}>${T('about.title')}</button> · <button class="link" ${go({ v: 'privacy' })}>${T('privacy.title')}</button></p>
    </main>`;
}
function helpTab(): string {
  // "Right now" stays as full sentences, one per row: urgency is carried by order and words. The rest are short tiles,
  // two to a row, so the whole list fits in about two screens on a small phone. Browsing by type is folded away.
  const rows = (g: Need['group']) => `<ul class="rows">${NEEDS.filter((n) => n.group === g).map((n) => rowLink({ v: 'need', id: n.id }, n.icon, t('need.' + n.id))).join('')}</ul>`;
  const tiles = (g: Need['group']) => `<ul class="quick tiles">${NEEDS.filter((n) => n.group === g).map((n) => `<li><button ${go({ v: 'need', id: n.id })}>${icon(n.icon)}<span>${T('tile.' + n.id)}</span></button></li>`).join('')}</ul>`;
  return `<main><h1 class="page" tabindex="-1">${T('home.needs')}</h1><p class="lede">${T('help.lede')}</p>${searchBtn()}
    <h2>${T('help.now')}</h2>${rows('now')}<h2>${T('help.soon')}</h2>${tiles('soon')}<h2>${T('help.later')}</h2>${tiles('later')}
    <details class="browse"><summary>${icon('search', 'sm')}<span>${T('home.categories')}</span>${icon('chevron', 'sm turn dim')}</summary><ul class="chips">${CATEGORIES.map((c) => `<li><button class="chip lg" ${go({ v: 'list', cat: c.id })}>${icon(c.icon, 'sm')}${T('cat.' + c.id)}</button></li>`).join('')}</ul></details>
    <h2>${T('help.more')}</h2><ul class="rows">${rowLink({ v: 'saved' }, 'bookmark', t('saved.title'), t('saved.sub'))}${(retired() ? '' : rowLink({ v: 'add' }, 'plus', t('add.title'), t('add.sub')))}</ul></main>`;
}
// ---- the Map tab (Kyle, 2026-09-20): one tab in place of Recreation and Transit --------------------------
// The map draws whatever layers a person switched on, and everything on it is also a list below, so the map is
// never the only way to reach a fact. Layer choices live on this phone (layers.ts) and are never sent.
// Help layers come from the category taxonomy (needs.ts MAP_GROUPS); treatment and sexual-assault listings are
// never drawn at all, and inside a group a DV or crisis listing is dropped too (isSensitive).
const LAYER_STYLE: Record<string, { css: string; width?: number; dash?: number[]; dense?: boolean; ring?: boolean }> = {
  'go:ddot_routes': { css: '--lyr-bus', width: 3.2 },
  'go:ddot_stops': { css: '--lyr-bus', dense: true },
  'go:smart_routes': { css: '--lyr-smart', width: 2.8, dash: [3, 2] },
  'go:smart_stops': { css: '--lyr-smart', dense: true },
  'go:qline': { css: '--lyr-rail', width: 4, ring: true },
  'go:people_mover': { css: '--lyr-rail', width: 3.4, ring: true },
  'go:mogo': { css: '--lyr-bike', ring: true },
  'go:bike_lanes': { css: '--lyr-bike', width: 2.4 },
  'go:stations': { css: '--lyr-rail', ring: true },
  'go:park_ride': { css: '--lyr-smart', ring: true },
};
const layerName = (id: string, fallback = '') => { const k = 'layer.' + id.replace(':', '.'); const s = t(k); return s === k ? fallback || id : s; };
/** The layers on offer today: our own listing groups, the places we already ship, then the transport layers. */
function layerMenu(): { group: string; items: { id: string; icon: string; name: string; note?: string }[] }[] {
  const help = MAP_GROUPS.filter((g) => (bundle?.rows ?? []).some((r) => g.tops.includes(r.category.split('.')[0]!) && r.lat !== undefined && !isSensitive(r.category)))
    .map((g) => ({ id: 'help:' + g.id, icon: g.icon, name: layerName('help:' + g.id) }));
  const places = [
    ...(bundle?.greenway ? [{ id: 'place:greenway', icon: 'path', name: layerName('place:greenway') }] : []),
    ...(bundle?.parks?.length ? [{ id: 'place:parks', icon: 'rec', name: layerName('place:parks') }] : []),
  ];
  const go2 = (bundle?.transit?.layers ?? []).map((l) => ({ id: 'go:' + l.id, icon: 'transit', name: layerName('go:' + l.id, l.name), ...(LAYER_STYLE['go:' + l.id]?.dense ? { note: t('map.layer_zoom') } : {}) }));
  return [{ group: 'map.group_help', items: help }, { group: 'map.group_places', items: places }, { group: 'map.group_go', items: go2 }].filter((s) => s.items.length > 0);
}
const layerOn = (id: string) => layersOn.includes(id);
/** Listings a switched-on help layer puts on the map, already ranked. Private kinds are never in this list. */
function layerRows(): Ranked[] {
  const tops = MAP_GROUPS.filter((g) => layerOn('help:' + g.id)).flatMap((g) => g.tops);
  if (!tops.length) return [];
  const rows = (bundle?.rows ?? []).filter((r) => r.lat !== undefined && !isSensitive(r.category)
    && !PRIVATE_TOPS.includes(r.category.split('.')[0]!) && tops.includes(r.category.split('.')[0]!));
  return rank(rows, here ? { near: here } : {}, now(), bundle?.alerts ?? []);
}
const groupOf = (category: string) => MAP_GROUPS.find((g) => g.tops.includes(category.split('.')[0]!))?.id ?? '';
/** The transport layers that are on, with their shapes if those have arrived. Missing ones are asked for once. */
function overlays(): Overlay[] {
  const out: Overlay[] = [];
  for (const l of bundle?.transit?.layers ?? []) {
    const id = 'go:' + l.id;
    if (!layerOn(id)) continue;
    if (!layerFiles.has(l.file)) {
      layerFiles.set(l.file, null);
      void loadLayer(bundle!.index, l.file).then((d) => { layerFiles.set(l.file, d); render(false); });
      continue;
    }
    const data = layerFiles.get(l.file);
    if (data) out.push({ ...data, id, label: layerName(id, l.name), ...(LAYER_STYLE[id] ?? { css: '--lyr-bus' }) });
  }
  return out;
}
function layerSwitcher(): string {
  const box = (s: { group: string; items: { id: string; icon: string; name: string; note?: string }[] }) => `<fieldset><legend>${T(s.group)}</legend><div class="kinds">${s.items.map((i) =>
    `<label class="pick"><input type="checkbox" data-layer="${esc(i.id)}"${layerOn(i.id) ? ' checked' : ''}><span>${esc(i.name)}${i.note ? ` <small>${esc(i.note)}</small>` : ''}</span></label>`).join('')}</div></fieldset>`;
  return `<form class="layers" data-layers><h2>${T('map.layers')}</h2><p class="foot">${T('map.layers_note')}</p>${layerMenu().map(box).join('')}</form>`;
}
/** Everything the map is showing, in words. Bounded lists, so a cheap phone never draws thousands of rows. */
function layerList(rows: Ranked[], over: Overlay[]): string {
  const parks = layerOn('place:parks') ? [...(bundle?.parks ?? [])].sort((a, b) => (here ? milesBetween(here, a) - milesBetween(here, b) : a.name.localeCompare(b.name))) : [];
  const segs = layerOn('place:greenway') ? bundle?.greenway?.segments ?? [] : [];
  const names = (list: string[], limit = 40) => `<p>${esc([...new Set(list)].filter(Boolean).slice(0, limit).join(' · '))}</p>${new Set(list).size > limit ? `<p class="foot">${T('map.list_more', { count: new Set(list).size - limit })}</p>` : ''}`;
  const parts = [
    rows.length ? `<h3>${T('map.list_help', { count: rows.length })}</h3><ul class="cards">${rows.slice(0, 20).map((r) => card(r)).join('')}</ul>${rows.length > 20 ? `<p class="foot">${T('map.list_more', { count: rows.length - 20 })}</p>` : ''}` : '',
    segs.length ? `<h3>${T('gw.title')}</h3><ul class="rows">${segs.map((s) => rowLink({ v: 'segment', id: s.id }, 'path', s.name, t('gw.' + s.phase), true)).join('')}</ul>` : '',
    parks.length ? `<h3>${T('rec.parks')} <span class="count">${parks.length}</span></h3>${names(parks.map((p) => p.name), 30)}<button class="btn ghost" ${go({ v: 'parks' })}>${T('rec.all_parks', { count: parks.length })}</button>` : '',
    ...over.map((o) => {
      const list = [...o.lines.map((l) => l.name), ...o.points.map((q) => q.name)].filter(Boolean);
      const count = o.lines.length + o.points.length;
      return `<h3>${esc(o.label)} <span class="count">${count}</span></h3>${list.length ? names(list) : `<p class="foot">${T('map.list_unnamed', { count })}</p>`}`;
    }),
  ].filter(Boolean);
  if (!parts.length) return `<h2>${T('map.list_title')}</h2><p class="empty">${T('map.list_none')}</p>`;
  // The heading lives inside the summary, so the sections below it are h3s under an h2 and the outline has no gap.
  return `<details class="browse maplist"><summary>${icon('info', 'sm')}<h2 class="sumh">${T('map.list_title')}</h2>${icon('chevron', 'sm turn dim')}</summary><div class="maplistbody">${parts.join('')}</div></details>`;
}
function mapTab(): string {
  const g = bundle?.greenway, parks = bundle?.parks ?? [];
  const openCount = g?.segments.filter((s) => s.phase === 'open').length ?? 0;
  const rows = layerRows(), over = overlays();
  const dots: MapDot[] = rows.map((r) => ({ lat: r.row.lat!, lon: r.row.lon!, label: r.row.name, sub: layerName('help:' + groupOf(r.row.category)), go: JSON.stringify({ v: 'detail', id: r.row.id } satisfies View), css: '--grp-' + groupOf(r.row.category) }));
  const nearParks = here ? [...parks].map((p) => ({ p, mi: milesBetween(here!, p) })).sort((a, b) => a.mi - b.mi).slice(0, 5) : [];
  const centers = rank(bundle?.rows ?? [], { category: 'rec', ...(here ? { near: here } : {}) }, now(), bundle?.alerts ?? []);
  const sources = (bundle?.transit?.layers ?? []).filter((l) => layerOn('go:' + l.id));
  // On a phone this is one column, exactly as before (.maptop and .mapside are display:contents). On a laptop
  // the map sits beside the switcher and the list, and stays put while the list scrolls.
  return `<main class="wide"><h1 class="page" tabindex="-1">${T('tab.map')}</h1><p class="lede">${T('map.lede')}</p>
    <div class="maptop">${mapBox({ key: 'maptab', label: t('map.label_tab'), quiet: true, dots, overlays: over, segments: layerOn('place:greenway'), fit: CITY, cover: true })}
    <div class="mapside">${locChip()}${layerSwitcher()}${layerList(rows, over)}</div></div>
    ${sources.length ? `<p class="foot">${T('map.sources')} ${sources.map((l) => esc(`${l.source.name} (${l.source.license}, ${prettyDate(l.source.fetched_at)})`)).join(' · ')}</p>` : ''}
    ${g ? `<h2>${T('gw.title')}</h2><button class="feature" ${go({ v: 'greenway' })}><span class="rowic big">${icon('path')}</span><span class="rowtx"><strong>${T('gw.title')}</strong><small>${T('rec.gw_sub', { count: openCount })}</small></span>${icon('chevron', 'turn dim')}</button>` : ''}
    ${parks.length ? `<h2>${T('rec.parks')}</h2>${nearParks.length ? `<ul class="rows">${nearParks.map(({ p, mi }) => `<li><div class="row static"><span class="rowic">${icon('rec')}</span><span class="rowtx"><strong>${owner(p.name)}</strong><small>${[p.address ? owner(p.address) : '', T('miles', { miles: mi.toFixed(1) })].filter(Boolean).join(' · ')}</small></span></div></li>`).join('')}</ul>` : ''}
      <button class="btn ghost" ${go({ v: 'parks' })}>${T('rec.all_parks', { count: parks.length })}</button>` : ''}
    <h2>${T('rec.centers')}</h2>${centers.length ? `<ul class="cards">${centers.map((r) => card(r)).join('')}</ul>` : `<p class="empty">${T('rec.centers_none')}</p>`}
    ${transitPanels()}
    ${TRANSIT.bike ? `<h2>${T('rec.bike')}</h2><div class="panel"><p>${esc(TRANSIT.bike.body)}</p>${ext(TRANSIT.bike.url, TRANSIT.bike.label)}</div>` : ''}
    <p class="foot">${T('transit.tip')}</p><p class="foot">${T('transit.checked', { date: prettyDate(TRANSIT.checked) })}</p></main>`;
}
function parksList(): string {
  const parks = [...(bundle?.parks ?? [])].sort((a, b) => (here ? milesBetween(here, a) - milesBetween(here, b) : a.name.localeCompare(b.name)));
  return `<main>${mapBox({ key: 'parks', label: t('map.label_parks'), ...(here ? { fit: [here], minMeters: 3000 } : { fit: CITY, cover: true }) })}${locChip()}<ul class="rows">${parks.map((p) => `<li><div class="row static"><span class="rowtx"><strong>${owner(p.name)}</strong><small>${[p.address ? owner(p.address) : '', here ? T('miles', { miles: milesBetween(here, p).toFixed(1) }) : ''].filter(Boolean).join(' · ')}</small></span></div></li>`).join('')}</ul>
    <p class="foot">${T('rec.parks_source', { date: prettyDate(bundle?.parks_source?.last_edited ?? '') })}</p></main>`;
}
/** Everything the old Transit tab carried: trip planners, fares, free rides, phone numbers (transit.ts). */
function transitPanels(): string {
  return `<h2>${T('transit.head')}</h2><p class="lede">${T('transit.lede')}</p>
    ${TRANSIT.sections.map((s) => `<h3 class="sub">${owner(s.title)}</h3><div class="panel">${s.body ? `<p>${owner(s.body)}</p>` : ''}
      ${(s.facts ?? []).map((f) => `<p class="fact">${icon(f.icon, 'sm')}<span>${owner(f.text)}</span></p>`).join('')}
      <div class="stackbtns">${(s.phones ?? []).map((p) => `<a class="callrow" href="${telHref(p.number)}">${icon('phone')}<span>${owner(p.label)}</span><strong>${phoneHtml(p.number)}</strong></a>`).join('')}${(s.links ?? []).map((l) => ext(l.url, l.label)).join('')}</div></div>`).join('')}`;
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
  return `<main><p class="lede">${T('urgent.lede')}</p><div class="stackbtns">${['emg_911', 'emg_988', 'emg_shelter_helpline', 'emg_shelter_outwayne', 'emg_dwihn_crisis', 'emg_ndvh', 'emg_avalon', 'emg_211'].map(callButton).join('')}</div>
    <ul class="rows">${rowLink({ v: 'need', id: 'overdose_now' }, 'pulse', t('need.overdose_now'), t('urgent.od_sub'))}</ul></main>`;
}
function need(view: Extract<View, { v: 'need' }>): string {
  const n = NEEDS.find((x) => x.id === view.id) as Need;
  const chosen = n.refine?.find((r) => r.id === view.refine);
  // A choice may bring its own numbers (the emergency-room list leads with 911); otherwise the need's own.
  const first = ((chosen?.first ?? n.first) ?? []).map(callButton).join('');
  if (n.stepsOnly) return `<main><div class="stackbtns">${first}</div><ol class="steps">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${T('od.s' + i)}</li>`).join('')}</ol><p class="foot">${T('od.review_note')}</p></main>`;
  const refine = n.refine && !view.refine ? `<ul class="rows">${n.refine.map((r) => rowLink({ v: 'need', id: n.id, refine: r.id }, n.icon, t(`refine.${n.id}.${r.id}`))).join('')}</ul>` : '';
  const query = n.refine ? chosen?.query : n.query;
  const links = n.refine ? chosen?.links : n.links;
  // Programs that are not places: only the links, with their own lede (docs/05, "Help paying for food").
  if (links && !query) return `<main><p class="lede">${T(LINKS[links]!.lede ?? 'links.lede')}</p>${linkPanels(links)}</main>`;
  const dv = n.id === 'unsafe';
  // A link that comes before the phone numbers (313SafeBeds on the shelter screen): the same panel, at the top.
  const topLinks = n.firstLinks && !view.refine ? linkPanels(n.firstLinks, true) : '';
  return `<main>${n.intro && !view.refine ? `<p class="lede">${T(n.intro)}</p>` : ''}${topLinks}${first ? `<div class="stackbtns">${first}</div>` : ''}${dv ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    ${refine}${query ? results(query, { limit: view.all ? undefined : 3, seeAll: { ...view, all: true }, emptyKey: n.emptyKey, noDistance: dv, linksBelow: !!links }) : ''}
    ${links && query ? `<h2>${T('links.more')}</h2>${linkPanels(links)}` : ''}</main>`;
}
/** Link-outs to a program's own site. The words are in strings/*.json (link.<set>.<id>.title|body|label).
 *  `top` is a link shown above a screen's phone numbers (313SafeBeds): just the panel and the date it was read. */
function linkPanels(set: string, top = false): string {
  const l = LINKS[set]!, today = detroitDay(now());
  return `${l.items.filter((b) => !b.until || b.until >= today).map((b) => `<h2>${T(`link.${set}.${b.id}.title`)}</h2><div class="panel"><p>${T(`link.${set}.${b.id}.body`)}</p><div class="stackbtns">${ext(b.url, t(`link.${set}.${b.id}.label`))}</div></div>`).join('')}
    ${top ? '' : `<p class="foot">${T('benefits.note')} <a href="tel:211">211</a></p>`}<p class="foot">${T(top ? 'links.checked' : 'transit.checked', { date: prettyDate(l.checked) })}</p>`;
}
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
function hoursLine(s: Schedule): string {
  const codes = (s.byday ?? '').split(',').filter(Boolean);
  const days = codes.map((d) => { const m = /^([+-]?\d+)?(\w\w)$/.exec(d)!; return (m[1] ? `#${m[1]} ` : '') + t('day.' + m[2]); });
  const run = days.length > 2 && codes.every((d, i) => i === 0 || DAY_ORDER.indexOf(d) === DAY_ORDER.indexOf(codes[i - 1]!) + 1);
  const label = !s.freq ? prettyDate(s.dtstart) : run ? `${days[0]} – ${days[days.length - 1]}` : days.join(', ');
  return `<li><span>${esc(label)}</span><span><bdi>${esc(clock(s.opens_at))} – ${esc(clock(s.closes_at))}</bdi>${s.description ? ` · ${owner(s.description)}` : ''}</span></li>`;
}
// Directions live in directions.ts, so a row with coordinates but no street address (the naloxone and
// test-strip spots) still gets them. A coordinate is never printed as an address.
const goHere = (r: BundleRow) => directionsHref(r, navigator.userAgent);
// The same trip in the Transit app, when this phone could have it (directions.ts: Transit documents no web
// fallback, so a laptop is not offered a link that could only fail). An addition: "Bus directions" above needs
// no app and stays first. A link-out like any other, marked as leaving the app.
const busApp = (r: BundleRow) => transitAppHref(r, navigator.userAgent);
function detail(id: string): { title: string; html: string; exit: boolean } {
  const r = bundle!.rows.find((x) => x.id === id);
  if (!r) {
    const gone = bundle!.archived.find((x) => x.id === id);
    return { title: gone?.name ?? t('app.name'), exit: false, html: `<main><p class="banner warn">${gone ? T('badge.archived', { date: prettyDate(gone.archived.at) }) : T('detail.not_found')} ${T('detail.archived_try_211')} <a href="tel:211">211</a></p></main>` };
  }
  const b = badgeText(r), o = openNow(r, now(), bundle!.alerts), next = nextOccurrences(r, now(), 3, bundle!.alerts);
  const sensitive = isSensitive(r.category), priv = isPrivate(r.category);
  const gw = !sensitive && r.lat !== undefined && bundle!.greenway ? nearestSegment({ lat: r.lat, lon: r.lon! }, bundle!.greenway.segments, { openOnly: true, maxMiles: 0.5 }) : null;
  // Alerts that name this listing and haven't ended, including ones announced ahead ("closed Saturday").
  const own = bundle!.alerts.filter((a) => a.status === 'published' && a.targets?.includes(r.id) && Date.parse(a.ends_at) > now().getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return { title: r.name, exit: priv, html: `<main class="detail"><p class="org">${owner(r.org)}</p>
    <p class="meta"><span class="pill ${o.state}">${esc(openText(o))}</span></p><p class="fresh ${b.level}">${esc(b.text)}</p>${r.notice ? `<p class="notice">${owner(r.notice)}</p>` : ''}${own.map(alertBox).join('')}
    <div class="stackbtns">${r.phones.map((ph) => `<a class="callrow" href="${telHref(ph.number)}" aria-label="${T('detail.call_label', { name: r.name })}">${icon('phone')}<span>${T('detail.call')}${ph.label ? ` · ${owner(ph.label)}` : ''}</span><strong>${phoneHtml(ph.number)}</strong></a>`).join('')}
      ${goHere(r) ? `<div class="two"><a class="btn ghost" href="${esc(goHere(r)!)}" aria-label="${T('detail.directions_label', { name: r.name })}">${icon('pin', 'sm')}${T('detail.directions')}</a>
        <a class="btn ghost" href="${esc(transitHref(r)!)}" target="_blank" rel="noopener noreferrer">${icon('transit', 'sm')}${T('detail.bus')}</a></div>
        ${busApp(r) ? `<a class="btn ghost" href="${esc(busApp(r)!)}" aria-label="${T('detail.bus_app_label', { name: r.name })}">${icon('transit', 'sm')}${T('detail.bus_app')} ${icon('out', 'sm')}</a>` : ''}` : ''}
      <div class="two">${canSave(r.category) ? `<button class="btn ghost" data-save="${esc(r.id)}">${icon('bookmark', 'sm')}${T(savedIds.includes(r.id) ? 'saved.remove' : 'saved.add')}</button>` : ''}<button class="btn ghost" data-share="${esc(r.id)}">${T('detail.share')}</button></div>
      ${savedIds.includes(r.id) ? `<p class="foot">${T('saved.note')}</p>` : ''}</div>
    ${sensitive ? `<p class="foot">${T('safe.calls_note')}</p>` : ''}
    ${currentLang() !== 'en' ? `<p class="foot">${T('detail.in_english')}</p>` : ''}<h2>${T('detail.what')}</h2><p lang="en">${esc(r.what)}</p>${r.eligibility ? `<h2>${T('detail.who')}</h2><p>${owner(r.eligibility)}</p>` : ''}
    ${r.schedules.length ? `<h2>${T('detail.hours')}</h2><ul class="hours">${r.schedules.map(hoursLine).join('')}</ul>` : ''}${r.hours_text ? `<p>${T('detail.hours_as_listed', { text: '' })}<span lang="en">${esc(r.hours_text)}</span></p>` : ''}
    ${next.length ? `<h2>${T('detail.next')}</h2><ul class="hours">${next.map((n) => `<li><span>${esc(dayName(n.date))}</span><span>${esc(clock(n.opens_at))} – ${esc(clock(n.closes_at))}</span></li>`).join('')}</ul>` : ''}
    ${r.address || (!sensitive && r.lat !== undefined) ? `<h2>${T('detail.where')}</h2>${r.address ? `<address lang="en"><bdi>${esc(r.address.line1)}</bdi><br><bdi>${esc(r.address.city)}, MI ${esc(r.address.zip ?? '')}</bdi></address>` : `<p>${T('detail.where_no_address', { source: r.facts.source.name })}</p>`}${!sensitive && r.lat !== undefined ? mapBox({ key: 'r:' + r.id, label: t('map.label_place', { name: r.name }), small: true, quiet: true, fit: [{ lat: r.lat, lon: r.lon! }], minMeters: 650, dots: [{ lat: r.lat, lon: r.lon!, label: r.name }] }) : ''}<p class="foot">${T('detail.directions_note')}</p>` : ''}
    ${gw ? `<p><button class="link" ${go({ v: 'segment', id: gw.segment.id })}>${icon('path', 'sm')} ${T('detail.near_greenway', { miles: gw.miles.toFixed(1), segment: gw.segment.name })}</button></p>` : ''}
    ${r.website ? `<p>${ext(r.website, t('detail.website'), 'link')}</p>` : ''}
    <h2>${T('detail.source')}</h2><p>${owner(r.facts.source.name)}</p>${reportBox(r.id, false, r.category)}</main>` };
}
// Maps (map.ts): streets, parks and the greenway, drawn on the phone from the signed bundle. No third party.
// A screen asks for a map here; the views are attached after the screen is drawn.
let mapSpecs: MapSpec[] = [], mapViews: MapView[] = [];
const CITY = [{ lat: 42.256, lon: -83.287 }, { lat: 42.45, lon: -82.911 }];   // the whole city, for maps that are about parks
const segPoints = (segs: Segment[]) => segs.flatMap((x) => x.lines.flat().map(([lon, lat]) => ({ lat, lon })));
function mapBox(o: { key: string; label: string; focus?: string; dots?: MapDot[]; fit?: { lat: number; lon: number }[]; minMeters?: number; small?: boolean; cover?: boolean; quiet?: boolean; outline?: { lat: number; lon: number }[][]; overlays?: Overlay[]; segments?: boolean }): string {
  // Every map but the Map tab's always draws the greenway; there, it is a layer a person switches on.
  const segments = o.segments === false ? [] : bundle?.greenway?.segments ?? [];
  const phase = Object.fromEntries(['open', 'under_construction', 'funded', 'planned'].map((ph) => [ph, t('gw.' + ph)]));
  mapSpecs.push({
    key: o.key, label: o.label, segments, focus: o.focus, dots: o.dots, minMeters: o.minMeters, cover: o.cover, quiet: o.quiet, outline: o.outline, overlays: o.overlays,
    me: here && !hereZip ? here : null,                       // a typed ZIP is not where the person is
    fit: o.fit?.length ? o.fit : segPoints(segments),
    segGo: (id) => JSON.stringify({ v: 'segment', id } satisfies View),
    strings: { zoomIn: t('map.zoom_in'), zoomOut: t('map.zoom_out'), reset: t('map.reset'), bigger: t('map.bigger'), smaller: t('map.smaller'), details: t('map.details'), park: t('map.park'), noStreets: t('map.no_streets'),
      keys: t('map.keys'), panUp: t('map.pan_up'), panDown: t('map.pan_down'), panLeft: t('map.pan_left'), panRight: t('map.pan_right'),
      source: (date) => t('map.source', { date: prettyDate(date) }), phase },
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
  const group = (phase: string) => { const s = g.segments.filter((x) => x.phase === phase); return s.length ? `<h2>${T('gw.' + phase)} <span class="count">${s.length}</span></h2><ul class="rows">${s.map((x) => rowLink({ v: 'segment', id: x.id }, 'path', x.name, '', true)).join('')}</ul>` : ''; };
  // The key: what each line on the map means, in words (docs/05: colour never carries meaning alone).
  const key = `<ul class="gwkey">${[['open', ''], ['under_construction', 'build'], ['funded', 'fund'], ['planned', 'plan']].map(([ph, cls]) => `<li><i class="${cls}"></i>${T('gw.' + ph)}</li>`).join('')}</ul>`;
  return `<main><p class="lede">${T('gw.intro')}</p>${mapBox({ key: 'greenway', label: t('gw.map_label') })}${key}${group('open')}${group('under_construction')}${group('funded')}${group('planned')}<p class="foot">${T('gw.source', { date: prettyDate(g.source.last_edited) })}</p></main>`;
}
function segment(s: Segment): string {
  const near = helpAlong(bundle!.rows.filter((r) => !isSensitive(r.category)), s);
  const ranked = rank(near.map((n) => n.row), {}, now(), bundle!.alerts);
  return `<main><p class="meta"><span class="pill ${s.phase === 'open' ? 'open' : 'closed'}">${T('gw.' + s.phase)}</span></p>${s.phase === 'open' ? '' : `<p class="lede">${T('gw.not_open')}</p>`}
    ${mapBox({ key: 'seg:' + s.id, label: t('map.label_segment', { name: s.name }), focus: s.id, fit: segPoints([s]), minMeters: 700, dots: near.map((n) => ({ lat: n.row.lat!, lon: n.row.lon!, label: n.row.name, go: JSON.stringify({ v: 'detail', id: n.row.id }) })) })}
    ${s.cross_streets?.length ? `<h2>${T('gw.crosses')}</h2><p>${esc(s.cross_streets.join(' · '))}</p>` : ''}
    <h2>${T('gw.help_along')}</h2>${ranked.length ? `<ul class="cards">${ranked.map((r) => card({ ...r, miles: near.find((n) => n.row.id === r.row.id)!.miles })).join('')}</ul>` : `<p class="empty">${T('gw.help_none')}</p>`}
    ${s.phase === 'open' ? reportBox(s.id, true) : ''}
    ${bundle!.index.files['indicators/neighborhoods.json'] ? `<h2>${T('hood.about_area')}</h2><ul class="rows">${indicators ? (indicators.segments[s.id] ?? []).map((id) => indicators!.neighborhoods.find((n) => n.id === id)).filter((n): n is Hood => !!n).map((n) => rowLink({ v: 'hood', id: n.id }, 'info', n.name, '', true)).join('') : ''}${rowLink({ v: 'hoods', lens: 'jlg' }, 'path', t('hood.lens_jlg'))}</ul>` : ''}</main>`;
}
// Search: the text lives in one variable. It is never stored, sent, or put in the URL (docs/05).
function searchResults(): string {
  const tokens = searchTokens(searchText);
  if (!tokens.length) { searchCount = ''; return `<p class="foot">${T('search.hint')}</p>`; }
  const found = search(bundle!.rows, searchText, here ? { near: here } : {}, now(), bundle!.alerts);
  const closed = bundle!.archived.filter((a) => matchTier(tokens, a) !== null);
  // A screen reader hears how many places matched, not the whole list read out again on every letter typed.
  searchCount = found.length || closed.length ? t('search.count', { count: found.length + closed.length }) : t('search.none');
  if (!found.length && !closed.length) return `<p class="empty">${T('search.none')} <a href="tel:211">211</a></p>`;
  return `${found.length ? `${locChip()}<h2 class="vh">${T('results.head')}</h2><ul class="cards">${found.slice(0, 30).map((r) => card(r)).join('')}</ul>` : ''}
    ${closed.length ? `<h2>${T('search.closed_head')}</h2><ul class="rows">${closed.map((a) => rowLink({ v: 'detail', id: a.id }, 'info', a.name, t('badge.archived', { date: prettyDate(a.archived.at) }), true)).join('')}</ul>` : ''}`;
}
function searchScreen(): string {
  // The results themselves are not a live region: reading a whole list again after every letter is unusable.
  // A short count is, and it is the first thing under the box, so the cursor never has to leave the box.
  const out = searchResults();
  return `<main><label class="searchbox">${T('search.label')}<input id="q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="60" value="${esc(searchText)}" aria-describedby="searchsay"></label>
    <p class="vh" id="searchsay" role="status" aria-live="polite">${esc(searchCount)}</p><div id="searchout">${out}</div></main>`;
}
function savedScreen(): string {
  const rows = bundle!.rows.filter((r) => savedIds.includes(r.id) && canSave(r.category));
  const ranked = rank(rows, here ? { near: here } : {}, now(), bundle!.alerts).sort((a, b) => savedIds.indexOf(a.row.id) - savedIds.indexOf(b.row.id));
  const closed = bundle!.archived.filter((a) => savedIds.includes(a.id));
  if (!ranked.length && !closed.length) return `<main><p class="lede">${T('saved.note')}</p><p class="empty">${T('saved.none')}</p></main>`;
  return `<main><p class="lede">${T('saved.note')}</p><h2 class="vh">${T('results.head')}</h2><ul class="cards">${ranked.map((r) => card(r)).join('')}</ul>
    ${closed.length ? `<h2>${T('search.closed_head')}</h2><ul class="rows">${closed.map((a) => rowLink({ v: 'detail', id: a.id }, 'info', a.name, t('badge.archived', { date: prettyDate(a.archived.at) }), true)).join('')}</ul>` : ''}
    <button class="btn ghost" data-saved-clear>${T('saved.clear')}</button></main>`;
}
// Add a place (docs/04): about the place, never about the person sending it. A steward checks it before it can appear.
function addScreen(): string {
  if (proposed) return `<main><p class="banner ok" tabindex="-1">${icon('check', 'sm')} ${T(proposed.state === 'queued' ? 'add.queued' : 'add.sent')}${proposed.ref ? ` ${T('add.ref', { ref: proposed.ref })}` : ''}</p>
    <button class="btn ghost" data-add-again>${T('add.again')}</button></main>`;
  // A field that is missing says so on itself (aria-invalid plus a message the field points at), not only in one
  // banner at the top: a person using a screen reader hears the problem when they reach the field (WCAG 3.3.1).
  const bad = (name: string) => missing.includes(name);
  const err = (name: string) => (bad(name) ? `<small class="err" id="err_${name}">${T('add.e.' + name)}</small>` : '');
  const flags = (name: string) => (bad(name) ? ` aria-invalid="true" aria-describedby="err_${name}"` : '');
  const had = (name: string) => addValues[name] ?? '';
  const field = (name: string, max: number, o: { required?: boolean; area?: boolean; hint?: string; mode?: string } = {}) => `<label>${T('add.f.' + name)}${o.required ? '' : ` <small>${T('add.optional')}</small>`}
    ${o.area ? `<textarea name="${name}" rows="2" maxlength="${max}" ${o.required ? 'required' : ''}${flags(name)}>${esc(had(name))}</textarea>` : `<input name="${name}" maxlength="${max}" autocomplete="off" ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.required ? 'required' : ''}${flags(name)} value="${esc(had(name))}">`}${err(name)}${o.hint ? `<small>${T(o.hint)}</small>` : ''}</label>`;
  const radios = (name: string, ids: readonly string[], key: (id: string) => string) => `<fieldset${bad(name) ? ` aria-invalid="true" aria-describedby="err_${name}"` : ''}><legend>${T('add.f.' + name)}</legend>${err(name)}<div class="kinds">${ids.map((id) => `<label class="pick"><input type="radio" name="${name}" value="${id}" required${had(name) === id ? ' checked' : ''}><span>${esc(key(id))}</span></label>`).join('')}</div></fieldset>`;
  return `<main><p class="lede">${T('add.lede')}</p>${proposeError ? `<p class="banner warn" id="addmissing" tabindex="-1">${T('add.missing')}</p>` : ''}
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
// What this app keeps and sends, in plain words (docs/08). Everything here is true of the code; tests check the parts
// that can be checked (no storage writes in main.ts, closed report fields, no IP in the Worker).
let keyReset = false;
function privacy(): string {
  const li = (keys: string[]) => `<ul class="plain">${keys.map((k) => `<li>${T(k)}</li>`).join('')}</ul>`;
  return `<main><p class="lede">${T('privacy.lede')}</p>
    <h2>${T('privacy.phone_h')}</h2>${li(['privacy.phone_1', 'privacy.phone_2', 'privacy.phone_3', 'privacy.phone_4', 'privacy.phone_5'])}
    <h2>${T('privacy.where_h')}</h2><p>${T('privacy.where')}</p>
    <h2>${T('privacy.sent_h')}</h2>${li(['privacy.sent_1', 'privacy.sent_2'])}
    <h2>${T('privacy.never_h')}</h2><p>${T('privacy.never')}</p>
    <h2>${T('privacy.reset_h')}</h2><p>${T('privacy.reset')}</p>
    ${keyReset ? `<p class="banner ok" tabindex="-1">${icon('check', 'sm')} ${T('privacy.reset_done')}</p>` : `<button class="btn ghost" data-reset-key>${T('privacy.reset_btn')}</button>`}
    <p class="foot">${T('about.maker')}</p>${contactLine()}</main>`;
}
function about(): string {
  const i = bundle?.index;
  return `<main>${langBtn()}${[1, 2, 3].map((n) => `<p>${T('about.p' + n)}</p>`).join('')}
    ${i ? `<p class="foot">${T('about.data', { version: `⁦${i.version}⁩`, date: prettyDate(i.generated_at) })} ${T(i.signing === 'release' ? 'about.sig_ok' : 'about.sig_dev')}</p>` : ''}<p class="foot">${T('about.open')}</p>
    <ul class="rows">${rowLink({ v: 'privacy' }, 'shield', t('privacy.title'), t('privacy.sub'))}</ul>
    <h2>${T('hood.title')}</h2><ul class="rows">${rowLink({ v: 'hoods' }, 'info', t('hood.title'), t('hood.about_sub'))}</ul>
    ${credits()}</main>`;
}
// Who makes the app, and how to reach them (Kyle, 2026-09-19). An organization's address, not a resident's.
const CONTACT = 'kyle@linwoodtechnologies.com';
const contactLine = () => `<p class="foot">${T('about.contact')} <a href="mailto:${CONTACT}">${CONTACT}</a></p>`;

// Everyone whose information is in the app (NOTICE has the full list). The count comes from the list itself.
function credits(): string {
  const groups = new Set((bundle?.rows ?? []).map((r) => r.facts.source?.name).filter(Boolean)).size;
  return `<h2>${T('about.credits_h')}</h2><ul class="plain">${groups ? `<li>${T('about.credits_orgs', { count: groups })}</li>` : ''}
    ${['about.credits_foodbanks', 'about.credits_city', 'about.credits_census'].map((k) => `<li>${T(k)}</li>`).join('')}</ul><p>${T('about.credits_thanks')}</p><p class="foot">${T('about.maker')}</p>${contactLine()}`;
}

const TAB_OF: Partial<Record<View['v'], TabId>> = { privacy: 'home', about: 'home', search: 'help', saved: 'help', add: 'help', hoods: 'home', hood: 'home', need: 'help', list: 'help', detail: 'help', greenway: 'map', segment: 'map', parks: 'map' };
function render(focus = true): void {
  const v = stack[stack.length - 1]!;
  for (const m of mapViews) m.destroy();
  mapViews = []; mapSpecs = [];
  let title: string | undefined, body: string, exit = false;
  // Without a list, only the screens that don't need one: the urgent numbers and the overdose steps.
  const standsAlone = v.v === 'urgent' || v.v === 'privacy' || (v.v === 'need' && !!NEEDS.find((x) => x.id === v.id)?.stepsOnly);
  if (v.v === 'tab' || (!bundle && !standsAlone)) { const tab = v.v === 'tab' && shownTabs().some((x) => x.id === v.tab) ? v.tab : 'home'; body = !bundle || tab === 'home' ? homeTab() : tab === 'help' ? helpTab() : tab === 'map' ? mapTab() : eventsTab(); }
  else if (v.v === 'urgent') { title = t('strip.more'); body = urgent(); }
  else if (v.v === 'about') { title = t('about.title'); body = about(); }
  else if (v.v === 'privacy') { title = t('privacy.title'); body = privacy(); }
  else if (v.v === 'search') { title = t('search.title'); body = searchScreen(); }
  else if (v.v === 'saved') { title = t('saved.title'); body = savedScreen(); }
  else if (v.v === 'add') { title = t('add.title'); body = addScreen(); }
  else if (v.v === 'hoods' || v.v === 'hood') { const hs = hoodScreen(v); title = hs.title; body = hs.html; }
  else if (v.v === 'need') { const n = NEEDS.find((x) => x.id === v.id)!; title = t(n.stepsOnly ? 'od.title' : 'need.' + n.id); exit = !!n.quickExit; body = need(v); }
  else if (v.v === 'list') { title = t('cat.' + v.cat); body = `<main>${results(CATEGORIES.find((c) => c.id === v.cat)?.query ?? {}, {})}</main>`; }
  else if (v.v === 'detail') { const d = detail(v.id); title = d.title; exit = d.exit; body = d.html; }
  else if (v.v === 'greenway') { title = t('gw.title'); body = greenway(); }
  else if (v.v === 'parks') { title = t('rec.parks'); body = parksList(); }
  else { const s = bundle!.greenway?.segments.find((x) => x.id === v.id); title = s?.name ?? t('gw.title'); body = s ? segment(s) : greenway(); }
  const fromStack = stack.map((x) => (x.v === 'tab' ? x.tab : undefined)).filter(Boolean).pop();
  const active = v.v === 'tab' ? v.tab : fromStack ?? TAB_OF[v.v];
  // Every list and listing says when this phone last got updates, if that was a while ago. Home has its own spot.
  if (['need', 'list', 'detail', 'segment', 'search', 'saved'].includes(v.v) || (v.v === 'tab' && v.tab === 'map')) body = body.replace(/^<main([^>]*)>/, (m) => m + ageBanner());
  body = body.replace(/^<main/, '<main tabindex="-1"');                    // where the skip link lands
  const nav = tabBar(active), head = topBar(title, exit), skip = `<button class="skip" data-skip>${T('skip.main')}</button>`;
  // Wide: the rail (leftmost), then the bar above the page, then the page. Narrow: the bar, the page, and the tab
  // bar along the bottom. Either way the order the keyboard walks is the order the eye reads.
  app.innerHTML = skip + (wide.matches ? nav + head + body : head + body + nav);
  // Every screen has its own title, so a browser tab, a window list and a voice control command all name the screen
  // a person is on (WCAG 2.4.2). Screens that must leave no trace keep the plain app name: a browser can put a title
  // in its own history list, and a DV, crisis or treatment screen must never show up there (docs/08, audit A8).
  const docTitle = title ?? (v.v === 'tab' && v.tab !== 'home' ? t('tab.' + v.tab) : '');
  document.title = docTitle && traceable(v) ? `${docTitle} · ${t('app.name')}` : t('app.name');
  mountMaps();
  if (focus) { window.scrollTo(0, 0); app.querySelector<HTMLElement>(v.v === 'search' && !searchText ? '#q' : 'h1')?.focus({ preventScroll: true }); }
  if (refocus) { app.querySelector<HTMLElement>(`[data-layer="${refocus}"]`)?.focus({ preventScroll: true }); refocus = ''; }
  if (refocusSel) { app.querySelector<HTMLElement>(refocusSel)?.focus({ preventScroll: true }); refocusSel = ''; }
}
function navigate(view: View): void {
  if (view.v === 'tab') searchText = '';   // a tab is a fresh start
  if (view.v !== 'detail') listMap = false;   // coming back from a place, the map is still open
  if (view.v === 'add') { proposed = null; proposeError = false; missing = []; addValues = {}; }
  if (view.v === 'privacy') keyReset = false;
  router.navigate(view);
  render();
}

app.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-reset-key],[data-retry],[data-go],[data-back],[data-lang],[data-exit],[data-loc],[data-share],[data-report],[data-listmap],[data-save],[data-saved-clear],[data-add-again],[data-skip]');
  if (!el) return;
  if ('skip' in el.dataset) { app.querySelector<HTMLElement>('main')?.focus(); }   // past the bar and the tabs, into the page
  else if ('resetKey' in el.dataset) { await resetInstallSecret(); keyReset = true; refocusSel = '.banner.ok'; render(false); announce(t('privacy.reset_done')); }
  else if ('retry' in el.dataset) { el.setAttribute('disabled', ''); void checkForUpdate(true); }
  else if (el.dataset.go) { ev.preventDefault(); navigate(JSON.parse(el.dataset.go) as View); }
  else if (el.dataset.lang) { const next = LANGS.find((l) => l.code === el.dataset.lang)?.code ?? ('en' as Lang); if (await setLang(next)) { refocusSel = '[data-lang]'; render(false); announce(t('lang.changed')); } }
  else if ('listmap' in el.dataset) { listMap = !listMap; refocusSel = '[data-listmap]'; render(false); announce(t(listMap ? 'map.shown' : 'map.hidden')); }
  else if (el.dataset.save) {
    const id = el.dataset.save, row = bundle?.rows.find((x) => x.id === id);
    savedIds = await toggleSaved(savedIds, id, row?.category ?? '');
    refocusSel = `[data-save="${id}"]`; render(false); announce(t(savedIds.includes(id) ? 'saved.added_say' : 'saved.removed_say'));
  }
  else if ('savedClear' in el.dataset) { savedIds = await clearSaved(); render(false); announce(t('saved.cleared_say')); app.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); }
  else if ('addAgain' in el.dataset) { proposed = null; missing = []; addValues = {}; render(); }
  else if (el.dataset.report) {
    const box = el.closest<HTMLElement>('.report')!, target = box.dataset.target!;
    // A photo, if there is one, is re-drawn without its hidden data and sent first; the report then names it.
    const file = box.querySelector<HTMLInputElement>('[data-photo]')?.files?.[0];
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    const photo = file ? await preparePhoto(file).then((b) => (b ? uploadPhoto(b) : null)) : null;
    const state = await submit(await buildReport(target, el.dataset.report, box.querySelector('textarea')?.value ?? '', new Date(), photo));
    const done = file && !photo && state === 'sent' ? 'sent_no_photo' : state;
    reported.set(target, done);
    refocusSel = `.report[data-target="${CSS.escape(target)}"] .banner.ok, .banner.ok`;
    render(false);
    announce(t(done === 'queued' ? 'report.queued' : 'report.sent'));
  }
  else if ('back' in el.dataset) { if (stack.length > 1) history.back(); else navigate({ v: 'tab', tab: TAB_OF[stack[0]!.v] ?? 'home' }); }
  else if ('exit' in el.dataset) { stack.length = 0; location.replace('https://www.weather.gov/'); }   // replace(): this page leaves the back button too
  else if (el.dataset.loc === 'off') { here = null; hereZip = ''; refocusSel = '[data-loc="on"]'; redraw(); announce(t('loc.off_say')); }
  else if (el.dataset.loc === 'zip') { zipOpen = true; zipUnknown = false; redraw(); app.querySelector<HTMLInputElement>('.zipform input')?.focus(); }
  else if (el.dataset.loc === 'on') {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { here = { lat: pos.coords.latitude, lon: pos.coords.longitude }; hereZip = ''; locDenied = zipUnknown = zipOpen = false; refocusSel = '[data-loc="off"]'; redraw(); announce(t('loc.on_say')); },
      () => { locDenied = true; zipUnknown = false; refocusSel = '[data-loc="on"]'; redraw(); announce(t('loc.denied')); }, { maximumAge: 60000, timeout: 10000 });
  } else if (el.dataset.share) {
    const url = `${location.origin}/#/r/${el.dataset.share}`;   // a listing id only; nothing about the person
    try { if (navigator.share) await navigator.share({ url }); else await navigator.clipboard.writeText(url); } catch { /* cancelled */ }
  }
});
// On the search screen only the results are re-drawn, so the keyboard and the cursor stay put.
function redraw(): void {
  const out = stack[stack.length - 1]!.v === 'search' ? app.querySelector('#searchout') : null;
  if (!out) { render(false); return; }
  refocusSel = '';                                       // the cursor stays in the search box; nothing else moves
  out.innerHTML = searchResults();
  const say = app.querySelector('#searchsay');
  if (say) say.textContent = searchCount;                // the same element every time, so it is really announced
}
// Map layers: a real checkbox, so the keyboard and a screen reader already work. The choice is kept on this
// phone (layers.ts) and the cursor goes back to the switch that was just used.
app.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.dataset?.layer) return;
  refocus = el.dataset.layer;
  const layerId = el.dataset.layer, turningOn = el.checked;
  void toggleLayer(layersOn, layerId).then((next) => { layersOn = next; render(false); announce(t(turningOn ? 'map.layer_on_say' : 'map.layer_off_say', { name: layerName(layerId) })); });
});
app.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.id === 'q') { searchText = el.value; redraw(); }
});
app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  if ('add' in form.dataset) {
    const values = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)]));
    const p = buildProposal(values);
    if (!p) {
      // Say which fields are empty, mark each one, then put the cursor on the first: a person is never left to
      // hunt for the problem (WCAG 3.3.1, 3.3.3). The whole screen is drawn again so the marks are all in place.
      addValues = values;                                // everything typed so far comes straight back
      missing = ['name', 'category', 'what', 'how_known'].filter((k) => !(values[k] ?? '').trim());
      proposeError = true;
      refocusSel = `.addform [name="${missing[0] ?? 'name'}"]`;
      render(false);
      announce(t('add.missing'));
      return;
    }
    missing = []; addValues = {};
    form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = true;
    void submitProposal(p).then((r) => { proposed = r; proposeError = false; render(); announce(t(r.state === 'queued' ? 'add.queued' : 'add.sent')); });
    return;
  }
  if (!('zip' in form.dataset)) return;
  const zip = String(new FormData(form).get('zip') ?? '').trim(), c = bundle?.zips?.[zip];
  if (c) { here = { lat: c[0], lon: c[1] }; hereZip = zip; zipOpen = zipUnknown = locDenied = false; refocusSel = '[data-loc="off"]'; }
  else { zipUnknown = true; refocusSel = '.zipform input'; }
  redraw();
  announce(t(zipUnknown ? 'loc.zip_unknown' : 'loc.zip_using', { zip }));
});

// ---- start ------------------------------------------------------------------
// Looks for a newer list. With a list in hand, at most every 15 minutes. With none yet (a first visit that failed),
// it tries again on its own, sooner at first and then less often, and at once when the phone comes back online or a
// person taps "Try again". One check at a time.
let lastCheck = 0, checking: Promise<void> | null = null, retryIn = 5000, retryTimer: ReturnType<typeof setTimeout> | undefined;
function checkForUpdate(force = false): Promise<void> {
  if (checking) return checking;
  if (bundle && !force && Date.now() - lastCheck < 15 * 60000) return Promise.resolve();
  lastCheck = Date.now();
  checking = (async () => {
    // A new list brings new neighborhood numbers: forget the old ones, and load again when a neighborhood screen asks.
    try {
      const next = await refresh(bundle);
      if (next) { bundle = next; indicators = undefined; }
      if (loadError || next) { loadError = false; render(false); }
      retryIn = 5000;
    } catch (e) {
      console.warn('bundle refresh failed; keeping what we have', e);
      if (!bundle) {
        loadError = true; render(false); announce(t('home.no_data'));
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => void checkForUpdate(true), retryIn);
        retryIn = Math.min(retryIn * 2, 5 * 60000);
      }
    } finally { checking = null; }
  })();
  return checking;
}
async function start(): Promise<void> {
  // Listeners first, so nothing that happens while the list loads is missed.
  window.addEventListener('online', () => { void flush(); void flushProposals(); void checkForUpdate(!bundle); });
  // An installed app can stay open for days. Look for a newer list whenever it comes back into view
  // (at most every 15 minutes), so nobody is reading last week's list on a phone that has signal.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkForUpdate(); });
  // Back and forward (router.ts). A link that changes only the hash also arrives as popstate, then hashchange.
  // A window that crosses the wide/narrow line (or a laptop zoomed in until it is narrow) is drawn again, so
  // the rail and the bottom tab bar are never both half-right.
  wide.addEventListener('change', () => render(false));
  window.addEventListener('popstate', (e) => { if (router.popstate(e.state, location.hash)) render(); });
  window.addEventListener('hashchange', () => { if (router.hashchange(location.hash)) render(); });
  router.start(location.hash);
  await initLang();
  render(false);
  bundle = await cached();
  savedIds = await loadSaved();
  layersOn = await loadLayers();
  if (bundle) render(false);
  await checkForUpdate(true);
  void flush(); void flushProposals();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'cache', urls: performance.getEntriesByType('resource').map((r) => r.name) });
  }
}
void start();
