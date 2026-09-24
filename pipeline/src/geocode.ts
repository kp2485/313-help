// Fills lat/lon (and a missing zip) in data/seed/resources.csv using the U.S. Census geocoder
// (public, no key). Runs by hand, results are committed; the build never calls the network.
// DV rows are skipped: they must never carry an address or coordinates.

import { isDvCategory } from '@313help/query';
import { inBbox } from './util.js';
import { readResources, writeResources } from './seed-io.js';

async function geocode(line: string): Promise<{ lat: number; lon: number; zip?: string } | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(line)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const m = ((await res.json()) as any).result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lon: m.coordinates.x, zip: m.addressComponents?.zip } : null;
}

const rows = readResources();
for (const r of rows) {
  // A domestic-violence row is skipped even if someone typed an address into it: this script never turns one
  // into a coordinate, and validate.ts fails the build for the typed address itself (docs/08).
  if (!r.address_1 || (r.lat && r.lon) || isDvCategory(r.category ?? '')) continue;
  // "Suite 100", "Ste. 4-450", "Suite G 7", "#2": the Census geocoder matches the building, not the unit.
  const street = r.address_1.replace(/,?\s*(suite|ste\.?|unit|#)\s*[\w-]+(\s+\w{1,3})?$/i, '');
  // A township's name is often not the mailing city the Census geocoder knows ("Clinton Township" mail says Mount
  // Clemens or Clinton Twp), so a miss on street + city is tried once more on street + ZIP alone (2026-09-24).
  const hit = await geocode(`${street}, ${r.city || 'Detroit'}, MI ${r.zip ?? ''}`) ?? (r.zip ? await geocode(`${street}, MI ${r.zip}`) : null);
  if (!hit) { console.warn(`no match: ${r.sal_id} (${r.address_1})`); continue; }
  if (!inBbox(hit.lat, hit.lon)) { console.warn(`outside the service area, ignored: ${r.sal_id}`); continue; }
  r.lat = hit.lat.toFixed(6); r.lon = hit.lon.toFixed(6);
  if (!r.zip && hit.zip) r.zip = hit.zip;
  console.log(`${r.sal_id}: ${r.lat}, ${r.lon}`);
}
writeResources(rows);
