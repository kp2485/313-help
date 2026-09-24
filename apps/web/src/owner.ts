// "Is this listing right?" — the page the people who run a place open from a steward's email (docs/14; Kyle's
// decisions of 2026-09-24). Its own small entry (owner.html): no part of it loads with the app, and the app loads
// none of it.
//
// The link is https://313help.com/owner.html#<key>. The key is after the `#`, which a browser never sends to any
// server, and this page takes it out of the address bar before it does anything else, so it is not left in the
// history or on the screen. It is sent once, in the body of a POST to our own Worker.
//
// What the page shows is the listing as residents see it, read from the same signed bundle the app reads. It asks
// for nothing about the person reading it: no name, no email, no password, and it says so.

import { badge, type BundleRow } from '@313help/query';
import { cached, refresh, type Bundle } from './data.js';
import { hoursLine, hoursPlain } from './hours.js';
import { LANGS, currentLang, dirFor, initLang, langPicker, setLang, t } from './i18n.js';
import './style.css';

/** 32 random bytes, base64url, as the Worker makes them (api/src/validate.ts OWNER_KEY). */
const KEY = /^[A-Za-z0-9_-]{43}$/;

/** The key from the address bar's `#`, or null. Accepts `#<key>` and `#k=<key>`. */
export function takeKey(hash: string): string | null {
  const raw = hash.replace(/^#/, '').replace(/^k=/, '');
  return KEY.test(raw) ? raw : null;
}

export type OwnerState =
  | { v: 'loading' }
  | { v: 'gone' }
  | { v: 'offline' }
  | { v: 'missing' }
  | { v: 'ask'; row: BundleRow; now: Date }
  | { v: 'change'; row: BundleRow; error?: 'required' }
  | { v: 'sending' }
  | { v: 'thanks_right' }
  | { v: 'thanks_changed'; ref: string };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const isDv = (row: BundleRow) => row.category === 'shelter.dv';
/** A place's own words, marked as English wherever the page is in another language (docs/05). */
const own = (s: string) => `<span lang="en" dir="auto">${esc(s)}</span>`;

/** How the listing reads to a resident: its name, what it offers, where, how to call, when, and the badge. */
function listing(row: BundleRow, now: Date): string {
  const b = badge(row, now);
  const where = !isDv(row) && row.address ? `<p>${own(`${row.address.line1}, ${row.address.city}${row.address.zip ? ` ${row.address.zip}` : ''}`)}</p>` : '';
  const phones = row.phones.map((p) => `<p><a href="tel:${esc(p.number.replace(/[^\d+]/g, ''))}" dir="ltr">${esc(p.number)}</a></p>`).join('');
  // The same hours list the app's own listing screen draws (hours.ts), then any hours the place wrote in words.
  const hours = (row.schedules.length ? `<p>${esc(t('owner.hours'))}</p><ul class="hours">${row.schedules.map(hoursLine).join('')}</ul>` : '')
    + (row.hours_text ? `<p>${row.schedules.length ? '' : `${esc(t('owner.hours'))} `}${own(row.hours_text)}</p>` : '');
  return `<article class="card" aria-label="${esc(t('owner.how_shown'))}">
    <h3>${own(row.name)}</h3><p>${own(row.what)}</p>${where}${phones}${hours}
    ${isDv(row) ? `<p class="foot">${esc(t('owner.dv_note'))}</p>` : ''}
    <p class="foot">${esc(t(b.key, b.params ?? {}))}</p></article>`;
}

/** The whole page, as HTML, for one state. Pure: the tests hold it without a browser. */
export function ownerHtml(s: OwnerState): string {
  const head = `<h1>${esc(t('owner.title'))}</h1>`;
  const never = `<p class="foot">${esc(t('owner.never_ask'))}</p>`;
  const wrap = (body: string) => `<main class="owner">${head}${body}${never}</main>`;
  switch (s.v) {
    case 'loading': return wrap(`<p class="banner plain" role="status">${esc(t('owner.loading'))}</p>`);
    case 'sending': return wrap(`<p class="banner plain" role="status">${esc(t('owner.working'))}</p>`);
    case 'gone': return wrap(`<p class="banner warn" role="alert">${esc(t('owner.gone'))}</p>`);
    case 'offline': return wrap(`<p class="banner warn" role="alert">${esc(t('owner.offline'))}</p>`);
    case 'missing': return wrap(`<p class="banner warn" role="alert">${esc(t('owner.not_found'))}</p>`);
    case 'thanks_right': return wrap(`<p class="banner ok" role="status" tabindex="-1">${esc(t('owner.thanks_right'))}</p>`);
    case 'thanks_changed': return wrap(`<p class="banner ok" role="status" tabindex="-1">${esc(t('owner.thanks_changed', { ref: s.ref }))}</p>`);
    case 'ask': return wrap(`<p>${esc(t('owner.intro'))}</p><h2 class="sub">${esc(t('owner.how_shown'))}</h2>${listing(s.row, s.now)}
      <div class="stackbtns"><button class="btn" data-owner="right">${esc(t('owner.still_right'))}</button>
      <button class="btn ghost" data-owner="change">${esc(t('owner.changed'))}</button></div>`);
    case 'change': {
      const r = s.row, field = (name: string, label: string, value: string, multi = false) => `<label>${esc(label)}${multi
        ? `<textarea name="${name}" rows="3">${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}"${name === 'phone' ? ' type="tel" dir="ltr"' : ''}>`}</label>`;
      return wrap(`<p>${esc(t('owner.change_intro'))}</p>${s.error ? `<p class="banner warn" role="alert">${esc(t('owner.required'))}</p>` : ''}
        <form class="addform" data-owner-form novalidate>
        ${field('name', t('owner.field_name'), r.name)}
        ${field('what', t('owner.field_what'), r.what, true)}
        ${isDv(r) ? '' : field('address', t('owner.field_address'), r.address ? `${r.address.line1}, ${r.address.city}${r.address.zip ? ` ${r.address.zip}` : ''}` : '')}
        ${field('phone', t('owner.field_phone'), r.phones[0]?.number ?? '')}
        ${field('schedule_text', t('owner.field_hours'), [...r.schedules.map(hoursPlain), ...(r.hours_text ? [r.hours_text] : [])].join('\n'), true)}
        ${field('notes', t('owner.field_notes'), '', true)}
        <button class="btn" type="submit">${esc(t('owner.send'))}</button></form>`);
    }
  }
}

/** What "Something changed" sends: the key and the form's six fields, and nothing else. Blank is left out. */
export function changeBody(key: string, form: Record<string, string>, dv: boolean): Record<string, string> | null {
  const pick = (k: string) => (form[k] ?? '').trim();
  if (!pick('name') || !pick('what')) return null;
  const out: Record<string, string> = { key };
  for (const k of ['name', 'what', 'address', 'phone', 'schedule_text', 'notes']) {
    if (k === 'address' && dv) continue;                        // never sent for a DV listing, whatever the form held
    if (pick(k)) out[k] = pick(k);
  }
  return out;
}

// ---- the page itself (browser only) -------------------------------------------------------------

async function send(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** The listing from the signed bundle: the copy on this device if it has the row, else a fresh, verified one. */
async function findRow(id: string): Promise<BundleRow | null> {
  let b: Bundle | null | undefined = await cached().catch(() => undefined);
  let row = b?.rows.find((r) => r.id === id);
  if (!row) { b = await refresh(b ?? undefined).catch(() => null) ?? b; row = b?.rows.find((r) => r.id === id); }
  return row ?? null;
}

async function start(): Promise<void> {
  const key = takeKey(location.hash);
  // First thing, before any network: the key leaves the address bar and the history entry.
  history.replaceState(null, '', location.pathname);
  await initLang();
  const app = document.getElementById('app')!;
  let state: OwnerState = { v: 'loading' };
  const draw = () => {
    document.title = `${t('owner.title')} · ${t('app.name')}`;
    const pick = langPicker(currentLang(), t('lang.switch'), '', esc);
    app.innerHTML = `<header class="top owner-top">${pick}</header>${ownerHtml(state)}`;
    app.querySelector<HTMLElement>('.banner.ok, h1')?.focus?.();
  };
  const go = (s: OwnerState) => { state = s; draw(); };
  draw();

  app.addEventListener('change', async (ev) => {
    const sel = (ev.target as HTMLElement).closest('select');
    const next = sel?.value;
    if (next && LANGS.some((l) => l.code === next) && (await setLang(next as never))) { document.documentElement.dir = dirFor(next); draw(); }
  });
  app.addEventListener('click', async (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-owner]')?.dataset.owner;
    if (!act || !key || state.v !== 'ask') return;
    if (act === 'change') { go({ v: 'change', row: state.row }); return; }
    go({ v: 'sending' });
    try {
      const r = await send('/v1/owner/confirm', { key });
      go(r.status === 202 ? { v: 'thanks_right' } : { v: 'gone' });
    } catch { go({ v: 'offline' }); }
  });
  app.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!key || state.v !== 'change') return;
    const row = state.row;
    const form = Object.fromEntries(new FormData(ev.target as HTMLFormElement).entries()) as Record<string, string>;
    const body = changeBody(key, form, isDv(row));
    if (!body) { go({ v: 'change', row, error: 'required' }); return; }
    go({ v: 'sending' });
    try {
      const r = await send('/v1/owner/propose', body);
      go(r.status === 202 ? { v: 'thanks_changed', ref: String(r.data.ref ?? '') } : { v: 'gone' });
    } catch { go({ v: 'offline' }); }
  });

  if (!key) { go({ v: 'gone' }); return; }
  try {
    const look = await send('/v1/owner/look', { key });
    if (look.status !== 200) { go({ v: 'gone' }); return; }
    const row = await findRow(String(look.data.target_id));
    go(row ? { v: 'ask', row, now: new Date() } : { v: 'missing' });
  } catch { go({ v: 'offline' }); }
}

if (typeof document !== 'undefined' && document.getElementById('app')?.dataset.page === 'owner') void start();
