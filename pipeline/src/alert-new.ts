// Write one alert into data/seed/alerts.json (docs/05 "Alerts", docs/OPERATIONS.md). An alert is a claim that
// something is happening NOW, so the rules are strict and built in:
//   - it always ends: at most 7 days, and the app hides it at ends_at by itself;
//   - it names its source (a press release or the owner's page) unless it is a demo;
//   - a demo alert says "Demo" in its title, lasts at most 3 hours, and cannot carry a phone number.
//
//   pnpm alert:new -- --title "Overnight warming centers are open" --body "Open tonight through Wednesday noon." \
//        --hours 60 --category warming --source-url https://detroitmi.gov/news/... --tel "Shelter help line=866-313-2520"
//   pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1
//   pnpm alert:new -- --cancellation --target sal_x --day 2026-09-26 --title "Pantry closed Saturday" --source-url https://...
//        (or --from "2026-09-26 13:00" --hours 3; times are Detroit wall time; at most 30 days ahead)

import { existsSync, readFileSync } from 'node:fs';
import { toWall, type Alert } from '@313help/query';
import { p, parsePhone, slug, writeJson } from './util.js';

const wallMs = (t: Date) => { const w = toWall(t); return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm); };
const isRealDay = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10) === s;
};

export interface AlertArgs {
  title?: string; body?: string; hours?: number; category?: string; sourceUrl?: string; tel?: string[]; targets?: string[]; demo?: boolean; kind?: Alert['kind'];
  /** Starts later, at this Detroit wall time: "2026-09-26 13:00". */ from?: string;
  /** All of one Detroit day, midnight to midnight: "2026-09-26". Sets the length, so --hours is not needed. */ day?: string;
}

/** The instant at which the Detroit wall clock reads this date and time. */
function detroitInstant(y: number, mo: number, d: number, hh: number, mm: number): Date {
  const asUtc = Date.UTC(y, mo - 1, d, hh, mm);
  let t = asUtc;
  for (let i = 0; i < 2; i++) t = asUtc - (wallMs(new Date(t)) - t);   // subtract Detroit's UTC offset at t
  return new Date(t);
}

export function makeAlert(a: AlertArgs, now: Date): Alert {
  const fail = (m: string): never => { throw new Error(m); };
  const title = (a.title ?? '').trim() || fail('--title is required');
  if (a.day && a.from) fail('use --day or --from, not both');
  let start = now, hours = Number(a.hours);
  if (a.from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(a.from.trim());
    if (!m || !isRealDay(`${m[1]}-${m[2]}-${m[3]}`) || Number(m[4]) > 23 || Number(m[5]) > 59) fail(`--from must look like "2026-09-26 13:00" (Detroit time): ${a.from}`);
    start = detroitInstant(Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4]), Number(m![5]));
  }
  if (a.day) {
    if (!isRealDay(a.day)) fail(`--day must be a date like 2026-09-26: ${a.day}`);
    const [y, mo, d] = a.day.split('-').map(Number) as [number, number, number];
    start = detroitInstant(y, mo, d, 0, 0);
    hours = (detroitInstant(y, mo, d + 1, 0, 0).getTime() - start.getTime()) / 3600000;   // 23 or 25 on DST days
  }
  if (!(hours > 0)) fail('--hours is required: every alert ends');
  if (hours > (a.demo ? 3 : 168)) fail(a.demo ? 'a demo alert lasts at most 3 hours' : 'an alert lasts at most 7 days (168 hours); write a new one if it is extended');
  if (start.getTime() + hours * 3600000 <= now.getTime()) fail('that time is already over');
  if (start.getTime() - now.getTime() > 30 * 86400000) fail('an alert can be posted at most 30 days ahead');
  if (a.demo && start !== now) fail('a demo alert starts now');
  if (!a.demo && !/^https:\/\//.test(a.sourceUrl ?? '')) fail('--source-url (https) is required: say where this was announced');
  if (a.demo && a.tel?.length) fail('a demo alert cannot carry a phone number');
  const actions = (a.tel ?? []).map((t) => {
    const [label, number] = t.split('=').map((x) => x.trim());
    const ph = parsePhone(number ?? '');
    if (!label || !ph) fail(`--tel must look like "Label=313-555-0100": ${t}`);
    return { label: label!, tel: ph!.number };
  });
  const minute = (d: Date) => d.toISOString().slice(0, 16) + ':00Z';
  const w = toWall(start), pad = (n: number) => String(n).padStart(2, '0');
  return {
    // The Detroit start time makes the id unique: the same title can be posted again for another day or hour.
    id: `alert_${slug(title).slice(0, 40)}_${w.y}${pad(w.m)}${pad(w.d)}t${pad(w.hh)}${pad(w.mm)}`,
    kind: a.kind ?? 'notice', category: a.demo ? 'demo' : (a.category ?? 'notice'),
    title: a.demo ? `Demo: ${title}` : title,
    ...(a.body || a.demo ? { body_plain: a.demo ? `${a.body ? a.body + ' ' : ''}This is a demo. Nothing is happening.` : a.body } : {}),
    starts_at: minute(start), ends_at: minute(new Date(start.getTime() + hours * 3600000)),
    ...(a.targets?.length ? { targets: a.targets } : {}), ...(actions.length ? { actions } : {}),
    source: a.demo ? { type: 'demo' } : { type: 'press_release', url: a.sourceUrl },
    status: 'published',
  };
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/alert-new.ts')) {
  const argv = process.argv.slice(2), args: AlertArgs = { tel: [], targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--') continue;
    if (k === '--demo') args.demo = true;
    else if (k === '--title') { args.title = v; i++; } else if (k === '--body') { args.body = v; i++; }
    else if (k === '--hours') { args.hours = Number(v); i++; } else if (k === '--category') { args.category = v; i++; }
    else if (k === '--source-url') { args.sourceUrl = v; i++; } else if (k === '--tel') { args.tel!.push(v ?? ''); i++; }
    else if (k === '--target') { args.targets!.push(v ?? ''); i++; } else if (k === '--cancellation') args.kind = 'cancellation';
    else if (k === '--from') { args.from = v; i++; } else if (k === '--day') { args.day = v; i++; }
    else { console.error(`unknown option: ${k}`); process.exit(1); }
  }
  try {
    const file = p('data/seed/alerts.json'), now = new Date();
    const all = (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []) as Alert[];
    const alert = makeAlert(args, now);
    // Alerts that ended are kept: nothing is deleted from the dataset. The build leaves them out of the bundle.
    writeJson(file, [...all.filter((x) => x.id !== alert.id), alert]);
    console.log(`wrote ${alert.id}: "${alert.title}" until ${alert.ends_at}. Run pnpm build:bundle to publish it.`);
  } catch (e) { console.error(String((e as Error).message)); process.exit(1); }
}
