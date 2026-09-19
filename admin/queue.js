// The steward page's rules, kept apart from the page so they can be tested without a browser (api/test/admin.test.ts).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CLOSED = ['closed_permanently', 'moved'];
// "Still open" and "looks good" are counted for the badge by the build; a steward never settles them.
export const CONFIRM = ['confirmed_ok', 'looks_good'];

/**
 * Open reports grouped by listing or place, the ones reported closed first. `closedPhones` comes from the Worker: how
 * many different phones said closed or moved (one phone = one report, DECISIONS 2026-09-19). A listing is highlighted
 * at 2 or more, the same count that changes its badge.
 */
export function groupReports(reports, closedPhones = {}) {
  const groups = new Map();
  for (const r of reports) if (!CONFIRM.includes(r.kind)) groups.set(r.target_id, [...(groups.get(r.target_id) ?? []), r]);
  const out = [...groups].map(([target_id, rs]) => {
    const phones = closedPhones[target_id] ?? 0;
    return { target_id, reports: rs, phones, hot: phones >= 2 };
  });
  const weight = (g) => g.phones * 1000 + g.reports.filter((r) => CLOSED.includes(r.kind)).length * 100 + g.reports.length;
  return out.sort((a, b) => weight(b) - weight(a));
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
