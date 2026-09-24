// The steward page's own rules (admin/queue.js), tested without a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { askable, cadenceDays, groupReports, ownerDue, ownerEmail, settleBody, taskItem } from '../../admin/queue.js';

const r = (id: string, kind: string, target_id = 'sal_b') => ({ id, target_id, kind, submitted_at: '2026-09-18T17:41Z' });

describe('steward page: the reports queue', () => {
  it('highlights a listing only when 2 or more different phones said closed, as the Worker counts them', () => {
    const reports = [r('rpt_1', 'closed_permanently'), r('rpt_2', 'moved')];     // one phone saying both
    expect(groupReports(reports, { sal_b: 1 })[0]!.hot).toBe(false);
    expect(groupReports(reports, { sal_b: 2 })[0]!.hot).toBe(true);
    expect(groupReports(reports, {})[0]!.hot).toBe(false);
  });
  it('never lists a confirmation as something to look at', () => {
    expect(groupReports([r('rpt_1', 'confirmed_ok'), r('cond_2', 'looks_good', 'seg_x')], {})).toEqual([]);
    expect(groupReports([r('rpt_1', 'confirmed_ok'), r('rpt_2', 'wrong_hours')], {})[0]!.reports.map((x) => x.id)).toEqual(['rpt_2']);
  });
  it('puts closure reports first', () => {
    const groups = groupReports([r('rpt_1', 'wrong_hours', 'sal_a'), r('rpt_2', 'wrong_info', 'sal_a'), r('rpt_3', 'moved', 'sal_c')], { sal_c: 1 });
    expect(groups.map((g) => g.target_id)).toEqual(['sal_c', 'sal_a']);
  });
  it('settling sends exactly the report ids shown for that listing', () => {
    const [g] = groupReports([r('rpt_1', 'moved'), r('rpt_2', 'wrong_hours'), r('rpt_3', 'moved', 'sal_other')], { sal_b: 1 });
    expect(settleBody(g!, 'rejected', 'spam')).toEqual({ target_id: 'sal_b', ids: ['rpt_1', 'rpt_2'], status: 'rejected', reason_code: 'spam' });
  });
  it('1.4.1: "look at this one first" is a sentence, not only a thicker orange border', () => {
    // `hot` used to be a border colour and nothing else, so a steward who cannot tell the two borders apart had
    // no way at all to know which listing two different phones had reported closed.
    const js = readFileSync(join(__dirname, '../../admin/admin.js'), 'utf8');
    expect(js).toContain('Look at this one first:');
    expect(js).toContain('different phones said it closed or moved');
    expect(js).toContain('function reportGroup({ target_id: targetId, reports, hot, phones, owner_at: ownerAt })');
    // and the steward page answers a forced-colours desktop, where a border colour says nothing at all
    const css = readFileSync(join(__dirname, '../../admin/admin.css'), 'utf8');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (prefers-contrast: more)');
  });
  it('the click handler works from what the page showed and never re-reads the queue', () => {
    const js = readFileSync(join(__dirname, '../../admin/admin.js'), 'utf8');
    const handler = js.slice(js.indexOf("app.addEventListener('click'"));
    expect(handler.length).toBeLessThan(js.length);
    expect(handler).not.toContain('/v1/steward/queue');
    expect(handler).not.toMatch(/reports\/\$\{[^}]+\}\/resolve/);
  });
});

describe('steward page: pages that changed', () => {
  it('shows the listing name when it has one, the id otherwise, the machine\'s detail, and the two buttons', () => {
    const t = { id: 'task_0011223344556677', target_id: 'sal_b', result: 'missing', detail: 'phone 313-555-0100', checked_on: '2026-09-19' };
    const named = taskItem(t, new Map([['sal_b', { name: 'Joy Road <Pantry>' }]]));
    expect(named).toContain('Joy Road &lt;Pantry&gt;');
    expect(named).toContain('phone 313-555-0100');
    expect(named).toContain('data-task="task_0011223344556677"');
    expect(named).toMatch(/data-reason="checked_fine"[^>]*>Checked: it's fine</);
    expect(named).toMatch(/data-reason="will_fix"[^>]*>I'll fix it</);
    expect(taskItem({ ...t, result: 'unreadable', detail: 'HTTP 503' }, new Map())).toContain('<h3>sal_b</h3>');
  });
});

describe('steward page: asking the people who run a listing (docs/14)', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id.replace('sal_', ''), category: 'food.pantry', source_url: 'https://www.pantry.example.org/contact', website: 'https://pantry.example.org', scheduled: true, ...over });
  const link = (target_id: string, made_at: string, over: Record<string, unknown> = {}) => ({ target_id, made_at, expires_at: new Date(Date.parse(made_at) + 30 * 86400000).toISOString().slice(0, 16) + 'Z', used_at: made_at as string | null, answer: 'still_right' as string | null, ...over });
  const NOW = new Date('2026-12-01T12:00:00Z');

  it('asks only listings whose source is a page on their own website (D6)', () => {
    expect(askable(row('sal_a'))).toBe(true);
    expect(askable(row('sal_b', { source_url: 'https://pantrynet.gleaners.org/x' }))).toBe(false);   // a partner's page
    expect(askable(row('sal_c', { website: undefined }))).toBe(false);
    expect(askable(row('sal_d', { source_url: undefined }))).toBe(false);
  });

  it('every three months, and monthly for a mobile pantry (D7)', () => {
    expect(cadenceDays(row('sal_a'))).toBe(90);
    expect(cadenceDays(row('sal_a', { category: 'food.mobile' }))).toBe(30);
  });

  it('who is due: never asked first, food and scheduled rows before the rest, then the longest since asked', () => {
    const rows = [row('sal_asked_long_ago'), row('sal_other', { category: 'legal.aid', scheduled: false }), row('sal_food'), row('sal_asked_recently'), row('sal_asked_earlier')];
    const links = [link('sal_asked_long_ago', '2026-06-01T10:00Z'), link('sal_asked_recently', '2026-11-20T10:00Z'), link('sal_asked_earlier', '2026-07-15T10:00Z')];
    expect(ownerDue(rows, links, NOW).map((d) => d.row.id)).toEqual(['sal_food', 'sal_other', 'sal_asked_long_ago', 'sal_asked_earlier']);
  });

  it('a link still waiting for an answer is not asked again; an expired one is', () => {
    expect(ownerDue([row('sal_a')], [link('sal_a', '2026-11-25T10:00Z', { used_at: null, answer: null })], NOW)).toEqual([]);
    expect(ownerDue([row('sal_a')], [link('sal_a', '2026-08-01T10:00Z', { used_at: null, answer: null })], NOW).map((d) => d.row.id)).toEqual(['sal_a']);
  });

  it('a mobile pantry asked 40 days ago is due; a pantry asked 40 days ago is not', () => {
    const at = '2026-10-22T10:00Z';
    expect(ownerDue([row('sal_truck', { category: 'food.mobile' }), row('sal_pantry')], [link('sal_truck', at), link('sal_pantry', at)], NOW).map((d) => d.row.id)).toEqual(['sal_truck']);
  });

  it('the email: one link, when it stops working, where we found the address, and what we never ask for', () => {
    const text = ownerEmail('Brightmoor Pantry', 'https://313help.com/owner.html#KEY', '2026-10-24T15:07Z', 'https://pantry.example.org/contact');
    expect(text).toContain('It lists "Brightmoor Pantry"');
    expect(text).toContain('https://313help.com/owner.html#KEY');
    expect(text).toContain('until 2026-10-24');
    expect(text).toContain('on your own website: https://pantry.example.org/contact');
    expect(text).toContain('It will never ask for a password, a payment or anything about you.');
    expect(text.match(/https:\/\/313help\.com/g)).toHaveLength(1);
  });

  it('a listing its owner said is still right, after it was reported closed, goes to the top for a call (D4)', () => {
    const groups = groupReports([r('rpt_1', 'moved', 'sal_hot'), r('rpt_2', 'moved', 'sal_hot'), r('rpt_3', 'wrong_hours', 'sal_owner')], { sal_hot: 2 }, { sal_owner: '2026-09-24T15:07Z' });
    expect(groups.map((g) => [g.target_id, g.owner_at])).toEqual([['sal_owner', '2026-09-24T15:07Z'], ['sal_hot', null]]);
  });
});
