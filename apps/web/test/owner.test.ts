// The page the people who run a listing open from a steward's email (apps/web/src/owner.ts; docs/14).
// Held to what it shows and what it sends. What it sends is checked against the Worker's own closed schema, so the
// page and api/src/validate.ts cannot drift apart without a test saying so.

import { describe, expect, it } from 'vitest';
import type { BundleRow } from '@313help/query';
import { changeBody, ownerHtml, takeKey } from '../src/owner.js';
import { setLang } from '../src/i18n.js';
import { parseOwnerChange } from '../../../api/src/validate.js';

const KEY = 'Ab3_-'.repeat(8) + 'xyz';                 // 43 characters of base64url
const row = (over: Partial<BundleRow> = {}): BundleRow => ({
  id: 'sal_pantry', name: 'Brightmoor Pantry', org: 'Brightmoor', category: 'food.pantry', what: 'Free groceries you choose yourself.',
  address: { line1: '14585 Greenview Ave', city: 'Detroit', zip: '48223' }, phones: [{ number: '(313) 555-0142' }],
  availability: 'unknown', hours_text: 'Tuesdays 10 to 2', schedules: [], flags: [], status: 'active',
  facts: { reports: { closed_open: 0, wrong_open: 0 }, source: { type: 'seed_list', name: 'test' }, checked_at_entry: '2026-09-01', entry_method: 'web',
    last_confirmed_at: '2026-10-10T15:07Z', last_confirm_method: 'owner_attest' },
  ...over,
} as BundleRow);
const DV = row({ id: 'sal_dv_line', category: 'shelter.dv', name: 'Help line', what: '24-hour line.', address: undefined, service_area: 'detroit' });
const NOW = new Date('2026-10-20T16:00:00Z');

describe('the key in the link', () => {
  it('is read from after the #, with or without k=', () => {
    expect(takeKey('#' + KEY)).toBe(KEY);
    expect(takeKey('#k=' + KEY)).toBe(KEY);
  });
  it('anything else is no key at all', () => {
    for (const h of ['', '#', '#' + KEY.slice(1), '#' + KEY + 'x', '#/listing/sal_pantry', '#k=' + KEY.replace('A', '+')]) expect(takeKey(h), h).toBeNull();
  });
});

describe('what the page shows', () => {
  it('the listing as residents see it, its badge, and the two answers', () => {
    const out = ownerHtml({ v: 'ask', row: row(), now: NOW });
    for (const s of ['Brightmoor Pantry', 'Free groceries you choose yourself.', '14585 Greenview Ave, Detroit 48223', 'href="tel:3135550142"', 'Tuesdays 10 to 2',
      'The people who run it checked this 10 days ago', 'data-owner="right"', 'data-owner="change"', 'We never ask for a password']) expect(out).toContain(s);
  });

  it('a schedule reads as the app\'s own hours list, and the form offers it as words to fix', () => {
    const weekly = row({ hours_text: undefined, schedules: [{ freq: 'WEEKLY', byday: 'TU,TH', dtstart: '2026-09-01', opens_at: '10:00', closes_at: '14:00' }] });
    expect(ownerHtml({ v: 'ask', row: weekly, now: NOW })).toContain('<ul class="hours"><li><span>Tue, Thu</span><span><bdi>10 am – 2 pm</bdi></span></li></ul>');
    expect(ownerHtml({ v: 'change', row: weekly })).toContain('<textarea name="schedule_text" rows="3">Tue, Thu 10 am – 2 pm</textarea>');
  });

  it('a domestic-violence listing shows no address and says why; its form has no address field', () => {
    const ask = ownerHtml({ v: 'ask', row: DV, now: NOW });
    expect(ask).toContain('For safety, this listing never shows an address.');
    expect(ask).not.toMatch(/Greenview|Street address/);
    expect(ownerHtml({ v: 'change', row: DV })).not.toContain('name="address"');
  });

  it('"Something changed" opens the form filled with what is listed now', () => {
    const out = ownerHtml({ v: 'change', row: row() });
    expect(out).toContain('name="name" value="Brightmoor Pantry"');
    expect(out).toContain('name="address" value="14585 Greenview Ave, Detroit 48223"');
    expect(out).toContain('name="phone" value="(313) 555-0142" type="tel"');
    expect(out).toContain('<textarea name="schedule_text" rows="3">Tuesdays 10 to 2</textarea>');
  });

  it('a place\'s own words are escaped, and marked as English', () => {
    const out = ownerHtml({ v: 'ask', row: row({ name: '<img src=x onerror=alert(1)>' }), now: NOW });
    expect(out).not.toContain('<img');
    expect(out).toContain('<span lang="en" dir="auto">&lt;img');
  });

  it('every state reads as real words in all four languages: no key leaks, no empty placeholder', async () => {
    const states = [{ v: 'loading' }, { v: 'sending' }, { v: 'gone' }, { v: 'offline' }, { v: 'missing' }, { v: 'thanks_right' }, { v: 'thanks_changed', ref: 'A1B2C3' },
      { v: 'ask', row: row(), now: NOW }, { v: 'change', row: row(), error: 'required' }, { v: 'ask', row: DV, now: NOW }] as const;
    for (const l of ['en', 'es', 'ar', 'bn'] as const) {
      expect(await setLang(l), l).toBe(true);
      for (const s of states) {
        const out = ownerHtml(s as never);
        expect(out, `${l} ${s.v}`).not.toMatch(/owner\.[a-z_]+|\{\w+\}/);
      }
      expect(ownerHtml({ v: 'thanks_changed', ref: 'A1B2C3' }), l).toContain('A1B2C3');
    }
    await setLang('en');
  });
});

describe('what the page sends', () => {
  const form = { name: 'Brightmoor Pantry', what: 'Free groceries, Tuesdays now', address: '14585 Greenview Ave', phone: '(313) 555-0142', schedule_text: 'Tue 10-2', notes: '' };

  it('the key and the form\'s fields, blanks left out, and the Worker accepts exactly that', () => {
    const body = changeBody(KEY, form, false)!;
    expect(body).toEqual({ key: KEY, name: 'Brightmoor Pantry', what: 'Free groceries, Tuesdays now', address: '14585 Greenview Ave', phone: '(313) 555-0142', schedule_text: 'Tue 10-2' });
    expect(parseOwnerChange(body)).toMatchObject({ ok: true });
  });

  it('never sends an address for a domestic-violence listing, even if the form somehow held one', () => {
    expect(changeBody(KEY, form, true)).not.toHaveProperty('address');
  });

  it('nothing is sent without a name and what is offered, and nothing but the six fields ever is', () => {
    expect(changeBody(KEY, { ...form, name: '  ' }, false)).toBeNull();
    expect(changeBody(KEY, { ...form, what: '' }, false)).toBeNull();
    expect(Object.keys(changeBody(KEY, { ...form, email: 'director@example.org', category: 'shelter.dv' }, false)!)).not.toContain('email');
  });
});
