// Write one alert into data/seed/alerts.json (docs/05 "Alerts", docs/OPERATIONS.md). An alert is a claim that
// something is happening NOW, so the rules are strict and built in:
//   - it always ends: at most 7 days, and the app hides it at ends_at by itself;
//   - it names its source (a press release or the owner's page) unless it is a demo;
//   - a demo alert says "Demo" in its title, lasts at most 3 hours, and cannot carry a phone number.
//
//   pnpm alert:new -- --title "Overnight warming centers are open" --body "Open tonight through Wednesday noon." \
//        --hours 60 --category warming --source-url https://detroitmi.gov/news/... --tel "Shelter help line=866-313-2520"
//   pnpm alert:new -- --demo --title "This is what an alert looks like" --hours 1

import { existsSync, readFileSync } from 'node:fs';
import type { Alert } from '@detroithelp/query';
import { p, parsePhone, slug, writeJson } from './util.js';

export interface AlertArgs { title?: string; body?: string; hours?: number; category?: string; sourceUrl?: string; tel?: string[]; targets?: string[]; demo?: boolean; kind?: Alert['kind'] }

export function makeAlert(a: AlertArgs, now: Date): Alert {
  const fail = (m: string): never => { throw new Error(m); };
  const title = (a.title ?? '').trim() || fail('--title is required');
  const hours = Number(a.hours) > 0 ? Number(a.hours) : fail('--hours is required: every alert ends');
  if (hours > (a.demo ? 3 : 168)) fail(a.demo ? 'a demo alert lasts at most 3 hours' : 'an alert lasts at most 7 days (168 hours); write a new one if it is extended');
  if (!a.demo && !/^https:\/\//.test(a.sourceUrl ?? '')) fail('--source-url (https) is required: say where this was announced');
  if (a.demo && a.tel?.length) fail('a demo alert cannot carry a phone number');
  const actions = (a.tel ?? []).map((t) => {
    const [label, number] = t.split('=').map((x) => x.trim());
    const ph = parsePhone(number ?? '');
    if (!label || !ph) fail(`--tel must look like "Label=313-555-0100": ${t}`);
    return { label: label!, tel: ph!.number };
  });
  const minute = (d: Date) => d.toISOString().slice(0, 16) + ':00Z';
  return {
    id: `alert_${slug(title).slice(0, 40)}_${now.toISOString().slice(0, 10)}`,
    kind: a.kind ?? 'notice', category: a.demo ? 'demo' : (a.category ?? 'notice'),
    title: a.demo ? `Demo: ${title}` : title,
    ...(a.body || a.demo ? { body_plain: a.demo ? `${a.body ? a.body + ' ' : ''}This is a demo. Nothing is happening.` : a.body } : {}),
    starts_at: minute(now), ends_at: minute(new Date(now.getTime() + hours * 3600000)),
    ...(a.targets?.length ? { targets: a.targets } : {}), ...(actions.length ? { actions } : {}),
    source: a.demo ? { type: 'demo' } : { type: 'press_release', url: a.sourceUrl },
    status: 'published',
  };
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/alert-new.ts')) {
  const argv = process.argv.slice(2), args: AlertArgs = { tel: [], targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--demo') args.demo = true;
    else if (k === '--title') { args.title = v; i++; } else if (k === '--body') { args.body = v; i++; }
    else if (k === '--hours') { args.hours = Number(v); i++; } else if (k === '--category') { args.category = v; i++; }
    else if (k === '--source-url') { args.sourceUrl = v; i++; } else if (k === '--tel') { args.tel!.push(v ?? ''); i++; }
    else if (k === '--target') { args.targets!.push(v ?? ''); i++; } else if (k === '--cancellation') args.kind = 'cancellation';
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
