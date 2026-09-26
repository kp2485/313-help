// The steward page's rules, kept apart from the page so they can be tested without a browser (api/test/admin.test.ts).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CLOSED = ['closed_permanently', 'moved'];
// "Still open" and "looks good" are counted for the badge by the build; a steward never settles them.
export const CONFIRM = ['confirmed_ok', 'looks_good'];

/**
 * Open reports grouped by listing or place, the ones reported closed first. `closedPhones` comes from the Worker: how
 * many different phones said closed or moved (one phone = one report, DECISIONS 2026-09-19). A listing is highlighted
 * at 2 or more, the same count that changes its badge. `ownerSaidOpen` (listing -> when) is the people who run it
 * saying "still right" after it was reported closed: those go first of all, for a call (docs/14 D4).
 */
export function groupReports(reports, closedPhones = {}, ownerSaidOpen = {}) {
  const groups = new Map();
  for (const r of reports) if (!CONFIRM.includes(r.kind)) groups.set(r.target_id, [...(groups.get(r.target_id) ?? []), r]);
  const out = [...groups].map(([target_id, rs]) => {
    const phones = closedPhones[target_id] ?? 0;
    return { target_id, reports: rs, phones, hot: phones >= 2, owner_at: ownerSaidOpen[target_id] ?? null };
  });
  const weight = (g) => (g.owner_at ? 1e7 : 0) + g.phones * 1000 + g.reports.filter((r) => CLOSED.includes(r.kind)).length * 100 + g.reports.length;
  return out.sort((a, b) => weight(b) - weight(a));
}

// ---- asking the people who run a listing (docs/14) --------------------------------------------------

/** The registrable part of a host, roughly: the last two labels ("www.pantry.example.org" -> "example.org"). */
const site = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); } catch { return ''; } };

/** A listing is asked only when its source is a page on the organization's own website (D6): that page is where the
 *  steward reads the address to send to. */
export const askable = (row) => !!row.source_url && !!row.website && site(row.source_url) === site(row.website);

/** How many days between asks (D7): monthly for mobile pantries, every three months for everything else. */
export const cadenceDays = (row) => (row.category === 'food.mobile' ? 30 : 90);

const DAY = 86400000;
/**
 * Who is due to be asked, in order: never asked first (food and scheduled rows before the rest, since they change
 * most), then the longest since the last ask. A listing whose last link is still waiting for an answer is not due.
 */
export function ownerDue(rows, links, now) {
  const last = new Map();
  for (const l of links) if (!last.has(l.target_id) || l.made_at > last.get(l.target_id).made_at) last.set(l.target_id, l);
  const due = [];
  for (const row of rows) {
    if (!askable(row)) continue;
    const l = last.get(row.id) ?? null;
    if (l && !l.used_at && Date.parse(l.expires_at) > now.getTime()) continue;         // asked, and the link still works
    if (l && now.getTime() - Date.parse(l.made_at) < cadenceDays(row) * DAY) continue;
    due.push({ row, last: l });
  }
  const first = (r) => (r.category.startsWith('food.') || r.scheduled ? 0 : 1);
  return due.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0)
    || (a.last && b.last ? a.last.made_at.localeCompare(b.last.made_at) : first(a.row) - first(b.row) || a.row.name.localeCompare(b.row.name)));
}

/** The email a steward sends, from the project mailbox, to the address on the organization's own page. Plain words, one
 *  link, and the sentence that tells a real email from a fake one (docs/14 §5). */
export function ownerEmail(name, link, expiresAt, sourceUrl) {
  const until = expiresAt.slice(0, 10);
  return `Subject: Is your listing on 313 Help right?

Hello,

313 Help is a free app that helps people in Detroit and the cities its buses reach find free help. It lists "${name}". We found this email address on your own website: ${sourceUrl}

Could you check that what we say is right? It takes a minute:
${link}

The link works once, until ${until}. It opens a page on 313help.com. It will never ask for a password, a payment or anything about you.

If you would rather not be asked again, reply and say so.

Thank you,
313 Help`;
}

/** Settle exactly the reports this page showed for one listing. One that came in since stays open for the next look. */
export const settleBody = (group, status, reason_code) => ({ target_id: group.target_id, ids: group.reports.map((r) => r.id), status, reason_code });

/** One "page that changed": the listing, what the nightly re-check could not find on its page, and two ways to close it. */
export function taskItem(t, names) {
  const name = names.get(t.target_id)?.name;
  const what = t.result === 'unreadable' ? `Its page could not be read (${esc(t.detail)}). Open it in a normal browser.` : `Its own page no longer shows: ${esc(t.detail)}.`;
  return `<article class="item" data-task="${esc(t.id)}"><h3>${esc(name ?? t.target_id)}</h3>
    <p class="sub">${name ? `${esc(t.target_id)} · ` : ''}since ${esc(t.checked_on)}</p>
    <p>${what}</p>
    <div class="actions"><button data-act="task" data-reason="checked_fine" class="good">Checked: it's fine</button>
      <button data-act="task" data-reason="will_fix">I'll fix it</button></div></article>`;
}
