// Read-only City of Detroit sources for the Events and Recreation tabs, and for "Type a ZIP".
//   events: the City has no RSS/iCal/JSON feed (checked 2026-09-18), so we read its public calendar
//           pages: a handful of requests, spaced out, once a day. We keep facts only (title, date,
//           time, department, link) and link out for everything else. Tier B (docs/02).
//   parks:  the open-data "City Parks" layer (names, addresses, coordinates; no amenities).
//   zips:   the open-data ZIP code areas layer, reduced to one center point per ZIP, so a person who
//           does not want to share a location can type a ZIP and still sort by distance (docs/05).
// Output is committed under data/ingested/ so builds are reproducible and changes are reviewable.

import { inBbox, p, writeJson } from './util.js';

const UA = { 'user-agent': 'detroithelp-pipeline (open-source civic directory; one polite pass per day)' };
const CAL = 'https://detroitmi.gov/Calendar-and-Events';
const PARKS = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/city_parks/FeatureServer/0';
const ZIPS = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/City_of_Detroit_Zip_Code_Tabulation_Areas/FeatureServer/0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CityEvent { id: string; title: string; starts_at: string; time_text?: string; department?: string; url: string }

const decode = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#0?39;|&rsquo;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

/** "10:00 am - 2:00 pm" -> "10:00". Anything we can't read stays as display text only. */
function firstTime(text: string): string | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3]!.toLowerCase() === 'p') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

export function parseCalendar(html: string): CityEvent[] {
  const out: CityEvent[] = [];
  for (const block of html.split('event-preview-top').slice(1)) {
    const date = /<time datetime="(\d{4}-\d{2}-\d{2})/.exec(block)?.[1];
    const link = /<h3>\s*<a href="(\/events\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!date || !link) continue;
    const timeText = decode(/<article class="time">([\s\S]*?)<\/article>/.exec(block)?.[1] ?? '');
    const dept = decode(/<article class="tags">([\s\S]*?)<\/article>/.exec(block)?.[1] ?? '');
    const start = firstTime(timeText);
    out.push({
      id: `evt_${link[1]!.replace(/^\/events\//, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 60)}_${date}`,
      title: decode(link[2]!).slice(0, 140), starts_at: start ? `${date}T${start}` : date,
      ...(timeText ? { time_text: timeText.slice(0, 60) } : {}), ...(dept ? { department: dept.slice(0, 80) } : {}),
      url: `https://detroitmi.gov${link[1]}`,
    });
  }
  return out;
}

async function events(): Promise<void> {
  const all = new Map<string, CityEvent>();
  for (let page = 0; page < 8; page++) {
    const res = await fetch(`${CAL}?page=${page}`, { headers: UA });
    if (!res.ok) { console.warn(`events: page ${page} answered ${res.status}; keeping what we have`); break; }
    const found = parseCalendar(await res.text());
    if (!found.length) break;
    for (const e of found) all.set(e.id, e);
    await sleep(1500);
  }
  if (all.size < 5) throw new Error(`events: only ${all.size} parsed; the page layout may have changed. Not overwriting the last good file.`);
  const list = [...all.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  writeJson(p('data/ingested/city_events.json'), { source: { name: 'City of Detroit calendar', page: CAL, fetched_at: new Date().toISOString().slice(0, 10) }, events: list });
  console.log(`events: ${list.length} upcoming, ${list[0]!.starts_at.slice(0, 10)} to ${list[list.length - 1]!.starts_at.slice(0, 10)}`);
}

async function parks(): Promise<void> {
  const meta = (await (await fetch(`${PARKS}?f=json`, { headers: UA })).json()) as any;
  const lastEdited = new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate).toISOString().slice(0, 10);
  const q = `${PARKS}/query?where=1%3D1&outFields=park_name,address,park_type,acreage,latitude,longitude&returnGeometry=false&f=json&resultRecordCount=2000`;
  const feats = ((await (await fetch(q, { headers: UA })).json()) as any).features as { attributes: Record<string, unknown> }[];
  const list = feats.map((f) => f.attributes)
    .map((a) => ({ name: String(a.park_name ?? '').trim(), address: String(a.address ?? '').trim(), type: String(a.park_type ?? '').trim(), acres: Number(a.acreage) || 0, lat: Number(a.latitude), lon: Number(a.longitude) }))
    .filter((x) => x.name && inBbox(x.lat, x.lon))
    .map((x) => ({ id: `plc_park_${x.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)}`, ...x, lat: Number(x.lat.toFixed(5)), lon: Number(x.lon.toFixed(5)), acres: Number(x.acres.toFixed(1)) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  writeJson(p('data/ingested/city_parks.json'), { source: { name: 'City of Detroit parks layer', url: PARKS, last_edited: lastEdited }, parks: list });
  console.log(`parks: ${list.length} of ${feats.length} (inside the bbox, named); layer last edited ${lastEdited}`);
}

/** ZIP -> [lat, lon] of the area's center, 3 decimals (about 100 m): plenty for sorting by distance. */
export function toZipCenters(features: { attributes: { zipcode?: unknown }; centroid?: { x: number; y: number } }[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const f of features) {
    const zip = String(f.attributes.zipcode ?? '').trim(), c = f.centroid;
    // Border ZIPs reach into the suburbs, so a center may sit a little outside the city bbox: allow 0.05 degrees.
    if (!/^\d{5}$/.test(zip) || !c || !inBbox(c.y, c.x, 0.05)) continue;
    out[zip] = [Number(c.y.toFixed(3)), Number(c.x.toFixed(3))];
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function zips(): Promise<void> {
  const meta = (await (await fetch(`${ZIPS}?f=json`, { headers: UA })).json()) as any;
  const lastEdited = new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate).toISOString().slice(0, 10);
  const q = `${ZIPS}/query?where=1%3D1&outFields=zipcode&returnGeometry=false&returnCentroid=true&outSR=4326&f=json`;
  const centers = toZipCenters(((await (await fetch(q, { headers: UA })).json()) as any).features ?? []);
  if (Object.keys(centers).length < 20) throw new Error(`zips: only ${Object.keys(centers).length} parsed. Not overwriting the last good file.`);
  writeJson(p('data/ingested/city_zips.json'), { source: { name: 'City of Detroit ZIP code areas layer', url: ZIPS, last_edited: lastEdited }, zips: centers });
  console.log(`zips: ${Object.keys(centers).length} center points; layer last edited ${lastEdited}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-city.ts')) {
  const only = process.argv[2];
  (async () => { if (!only || only === 'events') await events(); if (!only || only === 'parks') await parks(); if (!only || only === 'zips') await zips(); })().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
