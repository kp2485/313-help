// The steward queue (docs/04, docs/06). Plain JavaScript, no build step, no dependencies.
// In production this page and /v1/steward/* sit behind Cloudflare Access; the browser's Access
// session authenticates every request, so there are no tokens or passwords in this file.
// Exceptions only: nobody works through listings on a schedule. What lands here is
//   1. listings that visitors reported closed or moved   2. other corrections   3. proposed new places
//   4. listings whose own web page changed (the nightly re-check).

import { CLOSED, esc, groupReports, settleBody, taskItem } from './queue.js';

const app = document.getElementById('app');
const say = (text) => { const el = document.getElementById('say'); if (el) { el.textContent = ''; setTimeout(() => (el.textContent = text), 60); } };
const KIND = { closed_permanently: 'Closed for good', moved: 'Moved', wrong_hours: 'Hours are different', wrong_phone: 'Wrong phone', out_of_stock: 'Out of supplies', wrong_info: 'Something else', confirmed_ok: 'Still open', looks_good: 'Looks good',
  light_out: 'Light out', glass_trash: 'Glass or trash', flooding_ice: 'Flooding or ice', path_damaged: 'Path damaged', overgrown: 'Overgrown', broken_fixture: 'Broken fixture', restroom: 'Restroom', dumping: 'Dumping' };
const SCRIPT = 'Phone script: “Are you still running this? What days and times? Any ID or address needed? Is it okay to list you?”';

// `shown` is what the page last showed, by listing: a button settles those reports and no others (a report that
// came in since stays open for the next look).
let names = new Map(), shown = new Map(), message = '';

// Every write is JSON (an empty object when there is nothing to say): the API refuses any other steward write,
// which is what stops another site from posting a form here with the steward's login (and the browser adds Origin).
async function api(path, options = {}) {
  const write = options.method && options.method !== 'GET';
  const res = await fetch(path, { ...options, ...(write ? { body: options.body ?? '{}' } : {}), headers: { 'content-type': 'application/json' }, credentials: 'same-origin' });
  if (res.status === 401) throw new Error('Not signed in. In production, sign in through Cloudflare Access. Locally, set DEV_STEWARD in api/.dev.vars.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}`);
  return data;
}

// Listing names come from the published bundle, so the queue shows "Capuchin Soup Kitchen", not an id.
async function loadNames() {
  try {
    const index = await (await fetch('/data/bundle/v1/index.json', { cache: 'no-store' })).json();
    const files = Object.keys(index.files).filter((f) => f.startsWith('category/') || f === 'archived.json' || f === 'places/greenway.json');
    for (const f of files) {
      const data = await (await fetch(`/data/bundle/v1/${f}`, { cache: 'no-store' })).json();
      for (const row of Array.isArray(data) ? data : data.segments ?? []) names.set(row.id, { name: row.name, phone: row.phones?.[0]?.number, category: row.category ?? 'greenway' });
    }
  } catch { /* the queue still works with ids only */ }
}

function reportGroup({ target_id: targetId, reports, hot, phones }) {
  const meta = names.get(targetId) ?? { name: targetId };
  const counts = {};
  for (const r of reports) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  const isListing = targetId.startsWith('sal_');
  return `<article class="item ${hot ? 'hot' : ''}" data-target="${esc(targetId)}">
    <h3>${esc(meta.name)}</h3>
    <p class="sub">${esc(targetId)}${meta.phone ? ` · <a href="tel:${esc(meta.phone)}">${esc(meta.phone)}</a>` : ''}</p>
    <p class="tags">${hot ? `<span class="tag warn">Look at this one first: ${esc(String(phones ?? 2))} different phones said it closed or moved</span> ` : ''}${Object.entries(counts).map(([k, n]) => `<span class="tag ${CLOSED.includes(k) ? 'warn' : ''}">${esc(KIND[k] ?? k)} × ${n}</span>`).join(' ')}</p>
    <ul class="notes">${reports.filter((r) => r.detail || r.suggested || r.photo_key).map((r) => `<li><strong>${esc(KIND[r.kind] ?? r.kind)}</strong> · ${esc(r.submitted_at.slice(0, 10))}${r.detail ? ` · “${esc(r.detail)}”` : ''}${r.suggested ? ` · suggested: ${esc(r.suggested)}` : ''}${r.photo_key ? `<div class="photo"><img src="/v1/steward/photos/${esc(r.photo_key)}" alt="Photo sent with this report" loading="lazy"><button data-act="discard-photo" data-photo="${esc(r.photo_key)}">Delete this photo now</button><small>Never share or post a photo. If it shows a person, a face, a license plate or a house number, delete it. It deletes itself 30 days after the report is closed.</small></div>` : ''}</li>`).join('')}</ul>
    ${isListing ? `<p class="script">${esc(SCRIPT)}</p>
    <div class="actions">
      <button data-act="archive" data-reason="closed_permanently">Archive: closed for good</button>
      <button data-act="archive" data-reason="moved">Archive: moved</button>
      <button data-act="archive" data-reason="program_ended">Archive: program ended</button>
      <button data-act="active" class="good">It's open. Clear the closed reports</button>
    </div>` : ''}
    <div class="actions quiet">
      <button data-act="dismiss" data-status="accepted" data-reason="${isListing ? 'confirmed_by_phone' : 'listed'}">${isListing ? 'Fixed the listing. Close these reports' : 'Passed along. Close these reports'}</button>
      <button data-act="dismiss" data-status="rejected" data-reason="could_not_confirm">Couldn't confirm</button>
      <button data-act="dismiss" data-status="rejected" data-reason="about_a_person">About a person: discard</button>
      <button data-act="dismiss" data-status="rejected" data-reason="spam">Spam</button>
    </div></article>`;
}

function proposal(p) {
  return `<article class="item" data-proposal="${esc(p.id)}">
    <h3>${esc(p.name)} <span class="tag">${esc(p.category)}</span></h3>
    <p class="sub">Ref ${esc(p.ref)} · ${esc(p.submitted_at.slice(0, 10))} · submitter says: ${esc({ run_it: 'I run it', volunteer: 'I volunteer there', went_there: 'I went there', heard: 'I heard about it' }[p.how_known] ?? p.how_known)}</p>
    <p>${esc(p.what)}</p>
    <p class="sub">${[p.address, p.phone && `phone ${p.phone}`, p.schedule_text].filter(Boolean).map(esc).join(' · ')}</p>${p.notes ? `<p class="sub">“${esc(p.notes)}”</p>` : ''}
    <p class="script">${esc(SCRIPT)} Then add it to data/seed/resources.csv.</p>
    <div class="actions"><button data-act="proposal" data-status="accepted" data-reason="listed" class="good">Checked and listed</button>
      <button data-act="proposal" data-status="rejected" data-reason="could_not_confirm">Couldn't confirm</button>
      <button data-act="proposal" data-status="rejected" data-reason="not_a_fit">Not a fit</button>
      <button data-act="proposal" data-status="duplicate" data-reason="duplicate">Already listed</button></div></article>`;
}

async function render() {
  try {
    const [queue, agg, tasks] = await Promise.all([api('/v1/steward/queue'), api('/v1/steward/aggregates'), api('/v1/steward/tasks')]);
    const groups = groupReports(queue.reports, queue.closed_phones);
    shown = new Map(groups.map((g) => [g.target_id, g]));
    const archived = (agg.overrides ?? []).filter((o) => o.status === 'archived');
    if (message) say(message);
    app.innerHTML = `${message ? `<p class="flash">${esc(message)}</p>` : ''}
      ${agg.circuit_breaker ? '<p class="breaker"><strong>Circuit breaker is on.</strong> More than 5 listings were reported closed in the last day. Closure reports are not changing any badges until you work through them below. This is either an attack or a real emergency; look before you archive.</p>' : ''}
      <section><h2>Reported listings and places <span class="count">${groups.length}</span></h2>${groups.map(reportGroup).join('') || '<p class="empty">Nothing to look at. Visitor confirmations are counted automatically.</p>'}</section>
      <section><h2>Proposed new places <span class="count">${queue.proposals.length}</span></h2>${queue.proposals.map(proposal).join('') || '<p class="empty">No proposals waiting.</p>'}</section>
      <section><h2>Pages that changed <span class="count">${tasks.tasks.length}</span></h2><p class="sub">Each night the listing's own web page is read again. These no longer show the phone number or street address we list, or could not be read. Nothing in the app has changed. Open the page (its link is <code>source_url</code> in data/seed/resources.csv); if the place changed, fix the row there.</p>
        ${tasks.tasks.map((t) => taskItem(t, names)).join('') || '<p class="empty">Every page still matches.</p>'}</section>
      <section><h2>Publish</h2><p>Archiving and clearing take effect at the next bundle build. The nightly job does this; to do it now:</p><pre>pnpm build:bundle</pre>
      </section>
      <section><h2>Archived by a steward <span class="count">${archived.length}</span></h2><p class="sub">Nothing here was deleted. If a place turns out to be open, restore it; it comes back at the next build.</p>
        ${archived.sort((a, b) => b.at.localeCompare(a.at)).map((o) => `<article class="item" data-target="${esc(o.target_id)}"><h3>${esc(names.get(o.target_id)?.name ?? o.target_id)}</h3><p class="sub">${esc(o.target_id)} · ${esc(o.reason_code)} · ${esc(o.at.slice(0, 10))}</p><div class="actions"><button data-act="active" class="good">It's open again: restore it</button></div></article>`).join('') || '<p class="empty">None.</p>'}</section>`;
  } catch (e) { say(e.message); app.innerHTML = `<p class="breaker">${esc(e.message)}</p>`; }
}

app.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const item = btn.closest('.item'), { act, reason, status } = btn.dataset;
  // Only what this page showed for this listing (nothing, for one that had no open reports).
  const group = shown.get(item.dataset.target) ?? { target_id: item.dataset.target, reports: [] };
  btn.disabled = true;
  try {
    if (act === 'discard-photo') {
      await api(`/v1/steward/photos/${btn.dataset.photo}/discard`, { method: 'POST' });
      message = 'Photo deleted. The report is still here.';
    } else if (act === 'archive' || act === 'active') {
      if (act === 'archive' && !confirm(`Archive “${names.get(item.dataset.target)?.name ?? item.dataset.target}”? It stays in the dataset with its reason, and the app will say it closed.`)) { btn.disabled = false; return; }
      const report_ids = group.reports.map((r) => r.id);
      await api(`/v1/steward/listings/${item.dataset.target}/status`, { method: 'POST', body: JSON.stringify(act === 'archive' ? { status: 'archived', reason_code: reason, report_ids } : { status: 'active', report_ids }) });
      message = act === 'archive' ? 'Archived. It will show as closed after the next build.' : 'Marked open. It shows as open again after the next build.';
    }
    if ((act === 'dismiss' || act === 'active' || act === 'archive') && group.reports.length) {
      // Settle the rest of what was shown (the status call only settles closure reports).
      // Restoring is not a phone call, so it never records one (review 10b).
      await api('/v1/steward/reports/settle', { method: 'POST', body: JSON.stringify(settleBody(group, status ?? 'accepted', act === 'dismiss' ? reason : act === 'active' ? 'restored' : 'confirmed_by_phone')) });
      if (act === 'dismiss') message = 'Reports closed.';
    }
    if (act === 'task') {
      await api(`/v1/steward/tasks/${item.dataset.task}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) });
      message = reason === 'will_fix' ? 'Noted. Fix the row in data/seed/resources.csv; the task stays closed unless the page changes again.' : 'Closed. It comes back only if the page says something different.';
    }
    if (act === 'proposal') { await api(`/v1/steward/proposals/${item.dataset.proposal}/resolve`, { method: 'POST', body: JSON.stringify({ status, reason_code: reason }) }); message = 'Proposal settled.'; }
  } catch (e) { message = e.message; }
  await render();
});

await loadNames();
await render();
