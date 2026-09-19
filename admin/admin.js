// The steward queue (docs/04, docs/06). Plain JavaScript, no build step, no dependencies.
// In production this page and /v1/steward/* sit behind Cloudflare Access; the browser's Access
// session authenticates every request, so there are no tokens or passwords in this file.
// Exceptions only: nobody works through listings on a schedule. What lands here is
//   1. listings that visitors reported closed or moved   2. other corrections   3. proposed new places.

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { closed_permanently: 'Closed for good', moved: 'Moved', wrong_hours: 'Hours are different', wrong_phone: 'Wrong phone', out_of_stock: 'Out of supplies', wrong_info: 'Something else', confirmed_ok: 'Still open', looks_good: 'Looks good',
  light_out: 'Light out', glass_trash: 'Glass or trash', flooding_ice: 'Flooding or ice', path_damaged: 'Path damaged', overgrown: 'Overgrown', broken_fixture: 'Broken fixture', restroom: 'Restroom', dumping: 'Dumping' };
const CLOSED = ['closed_permanently', 'moved'];
const SCRIPT = 'Phone script: “Are you still running this? What days and times? Any ID or address needed? Is it okay to list you?”';

let names = new Map(), message = '';

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

function reportGroup(targetId, reports) {
  const meta = names.get(targetId) ?? { name: targetId };
  const counts = {};
  for (const r of reports) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  const closed = reports.filter((r) => CLOSED.includes(r.kind)).length;
  const isListing = targetId.startsWith('sal_');
  return `<article class="item ${closed >= 2 ? 'hot' : ''}" data-target="${esc(targetId)}">
    <h3>${esc(meta.name)}</h3>
    <p class="sub">${esc(targetId)}${meta.phone ? ` · <a href="tel:${esc(meta.phone)}">${esc(meta.phone)}</a>` : ''}</p>
    <p class="tags">${Object.entries(counts).map(([k, n]) => `<span class="tag ${CLOSED.includes(k) ? 'warn' : ''}">${esc(KIND[k] ?? k)} × ${n}</span>`).join(' ')}</p>
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
    const [queue, agg] = await Promise.all([api('/v1/steward/queue'), api('/v1/steward/aggregates')]);
    const groups = new Map();
    for (const r of queue.reports) groups.set(r.target_id, [...(groups.get(r.target_id) ?? []), r]);
    const weight = (rs) => rs.filter((r) => CLOSED.includes(r.kind)).length * 100 + rs.filter((r) => r.kind !== 'confirmed_ok' && r.kind !== 'looks_good').length;
    const sorted = [...groups.entries()].filter(([, rs]) => weight(rs) > 0).sort((a, b) => weight(b[1]) - weight(a[1]));
    const archived = (agg.overrides ?? []).filter((o) => o.status === 'archived');
    app.innerHTML = `${message ? `<p class="flash" role="status">${esc(message)}</p>` : ''}
      ${agg.circuit_breaker ? '<p class="breaker"><strong>Circuit breaker is on.</strong> More than 5 listings were reported closed in the last day. Closure reports are not changing any badges until you work through them below. This is either an attack or a real emergency; look before you archive.</p>' : ''}
      <section><h2>Reported listings and places <span class="count">${sorted.length}</span></h2>${sorted.map(([id, rs]) => reportGroup(id, rs)).join('') || '<p class="empty">Nothing to look at. Visitor confirmations are counted automatically.</p>'}</section>
      <section><h2>Proposed new places <span class="count">${queue.proposals.length}</span></h2>${queue.proposals.map(proposal).join('') || '<p class="empty">No proposals waiting.</p>'}</section>
      <section><h2>Publish</h2><p>Archiving and clearing take effect at the next bundle build. The nightly job does this; to do it now:</p><pre>pnpm build:bundle</pre>
      </section>
      <section><h2>Archived by a steward <span class="count">${archived.length}</span></h2><p class="sub">Nothing here was deleted. If a place turns out to be open, restore it; it comes back at the next build.</p>
        ${archived.sort((a, b) => b.at.localeCompare(a.at)).map((o) => `<article class="item" data-target="${esc(o.target_id)}"><h3>${esc(names.get(o.target_id)?.name ?? o.target_id)}</h3><p class="sub">${esc(o.target_id)} · ${esc(o.reason_code)} · ${esc(o.at.slice(0, 10))}</p><div class="actions"><button data-act="active" class="good">It's open again: restore it</button></div></article>`).join('') || '<p class="empty">None.</p>'}</section>`;
  } catch (e) { app.innerHTML = `<p class="breaker">${esc(e.message)}</p>`; }
}

app.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const item = btn.closest('.item'), { act, reason, status } = btn.dataset;
  btn.disabled = true;
  try {
    if (act === 'discard-photo') {
      await api(`/v1/steward/photos/${btn.dataset.photo}/discard`, { method: 'POST' });
      message = 'Photo deleted. The report is still here.';
    } else if (act === 'archive' || act === 'active') {
      if (act === 'archive' && !confirm(`Archive “${names.get(item.dataset.target)?.name ?? item.dataset.target}”? It stays in the dataset with its reason, and the app will say it closed.`)) { btn.disabled = false; return; }
      await api(`/v1/steward/listings/${item.dataset.target}/status`, { method: 'POST', body: JSON.stringify(act === 'archive' ? { status: 'archived', reason_code: reason } : { status: 'active' }) });
      message = act === 'archive' ? 'Archived. It will show as closed after the next build.' : 'Marked open. It shows as open again after the next build.';
    }
    if (act === 'dismiss' || act === 'active' || act === 'archive') {
      // Settle whatever is still open on this target (the status call only settles closure reports).
      // Restoring is not a phone call, so it never records one (review 10b).
      const queue = await api('/v1/steward/queue');
      for (const r of queue.reports.filter((x) => x.target_id === item.dataset.target))
        await api(`/v1/steward/reports/${r.id}/resolve`, { method: 'POST', body: JSON.stringify({ status: status ?? 'accepted', reason_code: act === 'dismiss' ? reason : act === 'active' ? 'restored' : 'confirmed_by_phone' }) });
      if (act === 'dismiss') message = 'Reports closed.';
    }
    if (act === 'proposal') { await api(`/v1/steward/proposals/${item.dataset.proposal}/resolve`, { method: 'POST', body: JSON.stringify({ status, reason_code: reason }) }); message = 'Proposal settled.'; }
  } catch (e) { message = e.message; }
  await render();
});

await loadNames();
await render();
