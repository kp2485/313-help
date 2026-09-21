// The steward page's own rules (admin/queue.js), tested without a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupReports, settleBody, taskItem } from '../../admin/queue.js';

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
    expect(js).toContain('function reportGroup({ target_id: targetId, reports, hot, phones })');
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
