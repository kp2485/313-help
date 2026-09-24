// Read-only City of Detroit open-data layers for the Recreation tab and for "Type a ZIP".
// City events are not read (DECISIONS 2026-09-19): the City has no events feed, and its website blocks
// programs with bot protection, which we do not get around. Events come back only with a real feed.
//   parks:  the open-data "City Parks" layer (names, addresses, coordinates; no amenities).
//   zips:   the open-data ZIP code areas layer, reduced to one center point per ZIP, so a person who
//           does not want to share a location can type a ZIP and still sort by distance (docs/05).
// Output is committed under data/ingested/ so builds are reproducible and changes are reviewable.

import { BBOX, inBbox, p, writeJson, today } from './util.js';
import { inRings, placeAt, regionPlaces } from './region.js';

const UA = { 'user-agent': '313help-pipeline (open-source civic directory; one polite pass per day)' };
const PARKS = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/city_parks/FeatureServer/0';
const ZIPS = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/City_of_Detroit_Zip_Code_Tabulation_Areas/FeatureServer/0';
async function parks(): Promise<void> {
  const meta = (await (await fetch(`${PARKS}?f=json`, { headers: UA })).json()) as any;
  const lastEdited = today(new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate));
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

// Outside Detroit (Hamtramck, Highland Park and Dearborn from 2026-09-19; every city and township a DDOT or SMART bus
// stops in from 2026-09-24) the City's layer has no ZIPs, so they come from the Census Bureau's ZIP Code Tabulation
// Areas (public domain). A ZIP is in when the Bureau's internal point for it lies inside a place in the area
// (data/ingested/region.json), or when its outline holds a place's own centre — Trenton's ZIP has its internal point
// in Woodhaven, and a person in Trenton still types it. No list of ZIPs is typed by hand.
const CENSUS_ZCTA = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1';

type Zcta = { attributes: { ZCTA5?: unknown; INTPTLAT?: unknown; INTPTLON?: unknown }; geometry?: { rings?: [number, number][][] } };
/** The default rule: the ZIP's internal point is in a place, or its outline holds a place's centre. */
export const zipInArea = (f: Zcta, lat: number, lon: number): boolean =>
  placeAt(lat, lon) !== null || (!!f.geometry?.rings && regionPlaces().some((m) => inRings(m.center, f.geometry!.rings!)));

/** The City's centers, plus a Census center for each ZIP the City's layer lacks and `keep` accepts. */
export function addNeighborZips(city: Record<string, [number, number]>, census: Zcta[], keep: (f: Zcta, lat: number, lon: number) => boolean = zipInArea): Record<string, [number, number]> {
  const out = { ...city };
  for (const f of census) {
    const zip = String(f.attributes.ZCTA5 ?? ''), lat = Number(f.attributes.INTPTLAT), lon = Number(f.attributes.INTPTLON);
    if (!/^\d{5}$/.test(zip) || zip in out || !inBbox(lat, lon, 0.05) || !keep(f, lat, lon)) continue;
    out[zip] = [Number(lat.toFixed(3)), Number(lon.toFixed(3))];
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function zips(): Promise<void> {
  const meta = (await (await fetch(`${ZIPS}?f=json`, { headers: UA })).json()) as any;
  const lastEdited = today(new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate));
  const q = `${ZIPS}/query?where=1%3D1&outFields=zipcode&returnGeometry=false&returnCentroid=true&outSR=4326&f=json`;
  const city = toZipCenters(((await (await fetch(q, { headers: UA })).json()) as any).features ?? []);
  if (Object.keys(city).length < 20) throw new Error(`zips: only ${Object.keys(city).length} parsed. Not overwriting the last good file.`);
  const env = encodeURIComponent(JSON.stringify({ xmin: BBOX.lonMin, ymin: BBOX.latMin, xmax: BBOX.lonMax, ymax: BBOX.latMax, spatialReference: { wkid: 4326 } }));
  const census = (await (await fetch(`${CENSUS_ZCTA}/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=ZCTA5,INTPTLAT,INTPTLON&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0005&f=json`, { headers: UA })).json()) as any;
  if (census.error) throw new Error(`zips: Census layer answered ${census.error.message ?? 'an error'}. Not overwriting the last good file.`);
  const centers = addNeighborZips(city, census.features ?? []);
  const added = Object.keys(centers).filter((z) => !(z in city));
  writeJson(p('data/ingested/city_zips.json'), { source: { name: 'City of Detroit ZIP code areas layer', url: ZIPS, last_edited: lastEdited, neighbors: { name: 'US Census Bureau ZIP Code Tabulation Areas (TIGERweb)', url: CENSUS_ZCTA, zips: added } }, zips: centers });
  console.log(`zips: ${Object.keys(centers).length} center points (${added.length} from the Census layer: ${added.join(' ')}); City layer last edited ${lastEdited}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-city.ts')) {
  const only = process.argv[2];
  if (only === 'events') { console.error('City events are not read (DECISIONS 2026-09-19): no feed, and the site blocks programs.'); process.exit(1); }
  (async () => { if (!only || only === 'parks') await parks(); if (!only || only === 'zips') await zips(); })().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
