// Neighborhood indicators (docs/13), the offline step: joins the 205 neighborhoods with OUR listings, City parks,
// the greenway, and the City's own per-neighborhood sales and permit counts. Public data only. No report, no
// app usage, nothing a phone sends is read here, and there is no ranking of neighborhoods anywhere in the output.

import { milesToLine, miles, type BundleRow, type Segment } from '@313help/query';
import { encodeLine, GRID } from './ingest-basemap.js';
import { pointInRing, type Neighborhood, type NowStats, type YearStats } from './ingest-neighborhoods.js';
import type { CrashCounts, CrashRow } from './ingest-crashes.js';

export const NEAR_MILES = 0.5;                       // "inside or within half a mile" (docs/13)
/**
 * Two counting rules, and which count uses which (docs/13, "Counting rules"; DECISIONS 2026-09-22):
 *
 *   INSIDE   — bus stops and stores that take a Bridge card. Both are dense along every road, so "within half a
 *              mile of the edge" counted most stops in three or four neighborhoods at once: Airport Sub published
 *              289 bus stops when 139 lie inside its outline, and the 205 pages added up to 20,505 against 5,098
 *              real stops. Each stop and each store now counts in exactly one neighborhood — the one whose outline
 *              it falls in (even-odd, so a hole is outside) — and a stop on no outline counts in none.
 *   NEAR     — our help listings, parks, rec centers and open greenway pieces: inside or within half a mile. These
 *              are few, and a park across the street from the line is one you walk to.
 *
 * The page says which rule each count uses. `nearest_city` distances are measured from the middle to the nearest
 * point wherever it is, and are not touched by either rule.
 */
export const COUNT_RULE = { bus_stops: 'inside', snap_stores: 'inside', parks: 'near', rec_centers: 'near', greenway_open: 'near', help: 'near' } as const;
export const HELP_TOPS = ['food', 'health', 'harm', 'shelter', 'utilities', 'hygiene', 'youth', 'rec', 'jobs', 'learn', 'treatment', 'housing', 'legal', 'ids', 'money', 'goods', 'kids', 'connect', 'transport', 'pets'] as const;
/** Walk distance from the middle of the neighborhood to the nearest listing of each kind. */
// `narcan` is the whole `harm` top-level, the same query the "I want free Narcan" screen makes since the
// category audit of 2026-09-22: `harm.narcan` plus `harm.supplies`, every one of which says it gives out
// naloxone. A neighborhood panel that named a different nearest place than the screen would be a wrong fact.
const NEAREST: Record<string, string> = { food: 'food', clinic: 'health.clinic', narcan: 'harm', indoors: 'rec' };
/**
 * A "nearest" row is named and linked on a public neighborhood page, so it can only ever be a row a resident
 * may open from one: never a sensitive listing (`shelter.dv`, `health.mental` — no URL, no dot, no distance,
 * docs/08) and never a private one (`treatment`, `assault` — traceless, never on a map, DECISIONS 2026-09-19).
 * None of the four kinds above maps to one of these today; the guard is here so that a later edit to NEAREST,
 * or a new child category, cannot quietly put one of them on a neighborhood page. Held by a test.
 */
const NEVER_NEAREST = ['shelter.dv', 'health.mental', 'treatment', 'assault'];
export const canBeNearest = (category: string): boolean =>
  !NEVER_NEAREST.some((c) => category === c || category.startsWith(c + '.'));

/**
 * The nearest openable listing of each kind, and the miles to it: ONE pick, so the number on the page and the
 * listing it links to can never be two different places. A row needs a coordinate (there is nothing to measure
 * otherwise) and must pass `canBeNearest`. Ties are settled by the miles as the page prints them and then by
 * `sal_` id, so the same bundle always names the same place. Rounding is monotone, so the smallest rounded
 * distance is the rounding of the smallest distance: `nearest_miles` is the number it always was.
 */
export function nearestPicks(
  center: { lat: number; lon: number },
  rows: BundleRow[],
  mapping: Record<string, string> = NEAREST,
): { miles: Record<string, number | null>; ids: Record<string, string | null> } {
  const picks = Object.entries(mapping).map(([kind, cat]) => {
    const hit = rows
      .filter((r) => r.lat !== undefined && r.lon !== undefined && canBeNearest(r.category) && (r.category === cat || r.category.startsWith(cat + '.')))
      .map((r) => ({ id: r.id, mi: Number(miles(center, { lat: r.lat!, lon: r.lon! }).toFixed(1)) }))
      .sort((a, b) => a.mi - b.mi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    return [kind, hit ?? null] as const;
  });
  return {
    miles: Object.fromEntries(picks.map(([k, hit]) => [k, hit ? hit.mi : null])),
    ids: Object.fromEntries(picks.map(([k, hit]) => [k, hit ? hit.id : null])),
  };
}

type Pt = [number, number];
export interface NeighborhoodIndicators {
  id: string; name: string; district: number | null; jlg_study_area?: boolean;
  center: [number, number];                          // [lat, lon]
  rings: number[][];                                 // outline, same compact encoding as the street map
  /** `nearest_id` is the `sal_` id of the very listing each `nearest_miles` number was measured to, so a
   *  neighborhood page can open it. Added 2026-09-22 beside `nearest_miles`, which did not change: an older
   *  client that knows nothing of the ids keeps printing the same distances. */
  help: { total: number; by: Record<string, number>; nearest_miles: Record<string, number | null>; nearest_id: Record<string, string | null>; none_listed_yet: string[]; coverage_checked: boolean };
  places: { parks: number; rec_centers: number; greenway_open: number; snap_stores?: number; bus_stops?: number };
  /** Straight-line miles from the middle to the nearest store that takes a Bridge card, such a grocery store, and bus stop (City data, not our list). */
  nearest_city?: { snap: number | null; grocery: number | null; bus: number | null };
  parcels?: number;                                  // the City's parcel count here: the base for "per 1,000 parcels"
  years: Record<string, YearStats>;
  now?: NowStats;
  /** "Safe streets" (docs/13): crashes involving people walking or biking, added up over the years the panel
   *  names. Exact counts. No rate: docs/13 defines no denominator for crashes. */
  crashes?: CrashCounts;
  /** The same three counts for each year of the window (2026-09-22, when suppression ended): what the chart
   *  draws. Additive: `crashes` is still the window total an older client prints. */
  crashes_by_year?: Record<string, CrashCounts>;
}

// ---- city pages (docs/13, "The four cities"; DECISIONS 2026-09-22) ----------------------------------------
//
// A city page is the SAME page as a neighborhood page, drawn from the same components, with two differences
// that are properties of the data rather than of the screen:
//
//   1. `panels` is an explicit ALLOW-LIST. A client draws a panel because the area lists it, never because a
//      number happens to be there or missing. That is what makes "absent, not zero" a fact about the bundle
//      instead of a habit of one client — and it is what a test can hold.
//   2. `sources` is PER PANEL, not one flat map for everybody. Detroit's roads come from the City and
//      Hamtramck's from SEMCOG; two numbers that share a word must never share a source line. The strings
//      themselves are interned in `area_sources` so each one appears in the bundle once.
//
// Nothing here ranks or compares cities, and no number from one city is ever printed on another's page.

/** Which Detroit-only panels a city's public sources cannot support, and the two honest reasons why. */
export interface MissingPanel { panel: string; why: 'not_published' | 'none_recorded' }
/** A source, interned in `area_sources` and named by key on each panel that uses it. */
export interface AreaSource { name: string; url: string; license: string; license_url?: string; notice?: string; last_edited: string; records_from?: string }
/**
 * One page that is not a Detroit neighborhood. It is a `NeighborhoodIndicators` with extra keys, on purpose:
 * every client already knows how to draw the shared half (outline, help, nearest), so a city page costs no new
 * drawing code — only the allow-list and the panels below.
 */
export interface AreaIndicators extends NeighborhoodIndicators {
  city: string;                                      // the city this area belongs to (itself, for a city page)
  kind: 'city' | 'neighborhood';                     // `tract` and `district` are reserved and unused
  panels: string[];                                  // the allow-list: the ONLY panels a client may draw
  sources: Record<string, string>;                   // panel -> key in `area_sources`
  missing: MissingPanel[];                           // what this city's public sources do not support
  park_acres?: number;
  roads_bands?: { pieces: number; miles: number; good_pct: number; fair_pct: number; poor_pct: number };
  vacancy?: { housing_units: number; vacant: number; pct: number; population: number };
  permits_by_year?: { year: number; buildings: number; units: number; months_reported: number }[];
}
/** The index row for the Areas layer and the city list: a name and where its page is. Carries no indicator. */
export interface CityRow { id: string; name: string; kind: 'city'; children: 'neighborhood' | 'none' }

/**
 * Is this point inside the area's own outline? Even-odd over every ring, so a point in a hole (Belle Isle carries
 * one) is outside, and a point in one part of a two-part outline is inside. A city page counts what is IN the
 * city, not within half a mile of it — half a mile outside Hamtramck is Detroit, and Detroit's listings are not
 * Hamtramck's.
 */
export const pointInRings = (pt: { lat: number; lon: number }, rings: Pt[][]): boolean =>
  rings.reduce((n, r) => n + (pointInRing([pt.lon, pt.lat], r) ? 1 : 0), 0) % 2 === 1;
const insideAny = pointInRings;

export function buildAreas(input: {
  cities: {
    id: string; name: string; children: 'neighborhood' | 'none'; center: Pt; rings: Pt[][];
    /** A place in the area with an outline and its help only (2026-09-24): nothing about it was researched, so
     *  nothing is said to be missing — "{city} does not publish" is a claim somebody has to have checked. */
    outline_only?: boolean;
    parks?: { count: number; acres: number }; roads?: AreaIndicators['roads_bands'];
    vacancy?: { housing_units: number; vacant: number; pct: number; population: number; land_acres: number };
    parcels?: number; permits: NonNullable<AreaIndicators['permits_by_year']>;
  }[];
  sources: Record<string, AreaSource>;               // the keys ingest-cities.ts writes: parks, roads, vacancy, permits, …
  rows: BundleRow[];
  /** Detroit's own parks layer, already in the bundle: Detroit's parks panel stays on the City's own numbers. */
  detroitParks?: { lat: number; lon: number; acres?: number }[];
  /** Per-city crash counts from ingest-crashes.ts, keyed by the city NAME SEMCOG uses. */
  crashes?: Record<string, { window: CrashCounts; years?: Record<string, CrashCounts> }>;
  crashSource?: AreaSource;
}): { cities: CityRow[]; areas: AreaIndicators[]; area_sources: Record<string, AreaSource> } {
  const located = input.rows.filter((r) => r.status === 'active' && r.lat !== undefined && r.lon !== undefined);
  const used: Record<string, AreaSource> = {};
  const key = (name: string, src: AreaSource | undefined) => { if (!src) return null; used[name] = src; return name; };
  const areas = input.cities.map((c) => {
    const inCity = located.filter((r) => insideAny({ lat: r.lat!, lon: r.lon! }, c.rings));
    const by = Object.fromEntries(HELP_TOPS.map((t) => [t, inCity.filter((r) => r.category === t || r.category.startsWith(t + '.')).length]));
    const center = { lat: c.center[1], lon: c.center[0] };
    // The nearest listed food, clinic, Narcan and indoor place are measured over EVERY listing, not only this
    // city's: from the middle of Hamtramck the nearest pantry may be in Detroit, and saying so is the useful
    // answer. `nearestPicks` carries the guard that keeps a sensitive or private row off a public page.
    const nearest = nearestPicks(center, located);
    const detroit = c.children === 'neighborhood';
    const parksInCity = detroit && input.detroitParks ? input.detroitParks.filter((q) => insideAny(q, c.rings)) : null;
    const parkCount = parksInCity ? parksInCity.length : c.parks?.count;
    const parkAcres = parksInCity ? Math.round(parksInCity.reduce((s, q) => s + (q.acres ?? 0), 0)) : c.parks?.acres;
    const crashes = input.crashes?.[c.name]?.window, crashYears = input.crashes?.[c.name]?.years;
    // The allow-list. A panel is listed only where this city has a source for it; `missing` says why for the rest.
    const panels: string[] = ['help'];
    const sources: Record<string, string> = {};
    const missing: MissingPanel[] = [];
    const add = (panel: string, ok: unknown, srcKey: string | null) => { if (ok && srcKey) { panels.push(panel); sources[panel] = srcKey; } };
    add('parks', parkCount !== undefined, key(detroit ? 'src_detroit_parks' : 'src_semcog_parks', detroit ? input.sources.detroit_parks : input.sources.parks));
    add('crashes', crashes, key('src_semcog_crashes', input.crashSource));
    add('roads', c.roads, key('src_semcog_pavement', input.sources.roads));
    add('vacancy', c.vacancy, key('src_census_vacancy', input.sources.vacancy));
    // A permits panel needs a year with a number in it. Highland Park authorised no new home in any published
    // year, so it gets no chart and one sentence saying exactly that — never a row of zeros beside Detroit's.
    const anyPermits = c.permits.some((y) => y.units > 0 || y.buildings > 0);
    add('permits', anyPermits, key('src_census_bps', input.sources.permits));
    if (!anyPermits && c.permits.length) missing.push({ panel: 'permits', why: 'none_recorded' });
    if (!detroit && !c.outline_only) for (const panel of ['sales', 'blight', 'demolitions', 'issues', 'fires', 'rentals', 'vacant_reg']) missing.push({ panel, why: 'not_published' });
    return {
      id: c.id, name: c.name, city: c.id, kind: 'city' as const, district: null,
      center: [c.center[1], c.center[0]] as [number, number],
      rings: c.rings.map((r) => encodeLine(r, [GRID.lon0, GRID.lat0])),
      help: {
        total: inCity.length, by, nearest_miles: nearest.miles, nearest_id: nearest.ids,
        none_listed_yet: ['food', 'health', 'harm'].filter((t) => by[t] === 0),
        coverage_checked: false,
      },
      places: { parks: parkCount ?? 0, rec_centers: inCity.filter((r) => r.category === 'rec.center').length, greenway_open: 0 },
      ...(parkAcres !== undefined ? { park_acres: parkAcres } : {}),
      ...(c.parcels ? { parcels: c.parcels } : {}),
      ...(c.roads ? { roads_bands: c.roads } : {}),
      ...(c.vacancy ? { vacancy: { housing_units: c.vacancy.housing_units, vacant: c.vacancy.vacant, pct: c.vacancy.pct, population: c.vacancy.population } } : {}),
      ...(anyPermits ? { permits_by_year: c.permits } : {}),
      ...(crashes ? { crashes } : {}),
      ...(crashYears ? { crashes_by_year: crashYears } : {}),
      years: {},                                     // a city page has no per-year City series of its own
      panels, sources, missing,
    };
  });
  return {
    cities: input.cities.map((c) => ({ id: c.id, name: c.name, kind: 'city' as const, children: c.children })),
    areas, area_sources: used,
  };
}

/** 0 when the point is inside; otherwise miles to the nearest edge. */
export function milesToArea(pt: { lat: number; lon: number }, rings: Pt[][]): number {
  if (pointInRings(pt, rings)) return 0;
  return Math.min(...rings.map((r) => milesToLine(pt, r)));
}

/** Straight-line miles to the nearest of `pts` ([lon, lat, ...]), to one decimal; null when there are none. */
export function nearestMiles(from: { lat: number; lon: number }, pts: number[][]): number | null {
  let best = Infinity;
  for (const q of pts) best = Math.min(best, miles(from, { lat: q[1]!, lon: q[0]! }));
  return best === Infinity ? null : Number(best.toFixed(1));
}

export function buildIndicators(input: {
  hoods: Neighborhood[]; rows: BundleRow[]; parks: { lat: number; lon: number }[]; segments: Segment[];
  stats: { neighborhoods: Record<string, Record<string, YearStats>>; parcels?: Record<string, number>; current?: { neighborhoods: Record<string, NowStats> } }; coverageChecked?: Set<string>;
  /** City points: SNAP stores as [lon, lat, 1 if a grocery store], bus stops as [lon, lat]. */
  snap?: number[][]; busStops?: number[][];
  /** Crashes involving people walking or biking, per neighborhood (pipeline/src/ingest-crashes.ts). */
  crashes?: Record<string, CrashRow>;
}): { neighborhoods: NeighborhoodIndicators[]; segments: Record<string, string[]> } {
  const asPt = (q: number[]) => ({ lat: q[1]!, lon: q[0]! });
  const located = input.rows.filter((r) => r.status === 'active' && r.lat !== undefined && r.lon !== undefined);
  const open = input.segments.filter((s) => s.phase === 'open');
  const segHoods: Record<string, string[]> = {};
  const neighborhoods = input.hoods.map((n) => {
    const box = n.rings.flat(), pad = 0.012;
    const x0 = Math.min(...box.map((q) => q[0])) - pad, x1 = Math.max(...box.map((q) => q[0])) + pad, y0 = Math.min(...box.map((q) => q[1])) - pad, y1 = Math.max(...box.map((q) => q[1])) + pad;
    const maybe = (q: { lat: number; lon: number }) => q.lon >= x0 && q.lon <= x1 && q.lat >= y0 && q.lat <= y1;
    const near = (q: { lat: number; lon: number }) => maybe(q) && milesToArea(q, n.rings) <= NEAR_MILES;
    const inside = (q: { lat: number; lon: number }) => maybe(q) && pointInRings(q, n.rings);
    const help = located.filter((r) => near({ lat: r.lat!, lon: r.lon! }));
    const by = Object.fromEntries(HELP_TOPS.map((t) => [t, help.filter((r) => r.category === t || r.category.startsWith(t + '.')).length]));
    const center = { lat: n.center[1], lon: n.center[0] };
    const nearest = nearestPicks(center, located);
    // A segment belongs to every neighborhood it passes through (any point of the path inside the outline).
    for (const s of input.segments) if (s.lines.some((l) => l.some(([lon, lat]) => inside({ lat, lon })))) (segHoods[s.id] ??= []).push(n.id);
    return {
      id: n.id, name: n.name, district: n.district, ...(n.jlg_study_area ? { jlg_study_area: true } : {}),
      center: [n.center[1], n.center[0]] as [number, number],
      rings: n.rings.map((r) => encodeLine(r, [GRID.lon0, GRID.lat0])),
      help: {
        total: help.length, by, nearest_miles: nearest.miles, nearest_id: nearest.ids,
        // "None listed yet" describes OUR directory, not the neighborhood (honesty rule 6).
        none_listed_yet: ['food', 'health', 'harm'].filter((t) => by[t] === 0),
        coverage_checked: input.coverageChecked?.has(n.id) ?? false,
      },
      places: {
        parks: input.parks.filter(near).length,
        rec_centers: help.filter((r) => r.category === 'rec.center').length,
        greenway_open: open.filter((s) => s.lines.some((l) => l.some(([lon, lat]) => near({ lat, lon })))).length,
        // Strictly inside (COUNT_RULE): a stop or a store counts in one neighborhood, never in every one it is
        // half a mile from.
        ...(input.snap ? { snap_stores: input.snap.filter((q) => inside(asPt(q))).length } : {}),
        ...(input.busStops ? { bus_stops: input.busStops.filter((q) => inside(asPt(q))).length } : {}),
      },
      ...(input.snap && input.busStops ? { nearest_city: { snap: nearestMiles(center, input.snap), grocery: nearestMiles(center, input.snap.filter((q) => q[2] === 1)), bus: nearestMiles(center, input.busStops) } } : {}),
      ...(input.stats.parcels?.[n.id] ? { parcels: input.stats.parcels[n.id] } : {}),
      ...(input.crashes?.[n.id] ? { crashes: input.crashes[n.id]!.window } : {}),
      ...(input.crashes?.[n.id]?.years ? { crashes_by_year: input.crashes[n.id]!.years } : {}),
      years: input.stats.neighborhoods[n.id] ?? {},
      ...(input.stats.current?.neighborhoods[n.id] ? { now: input.stats.current.neighborhoods[n.id] } : {}),
    };
  });
  return { neighborhoods, segments: segHoods };
}
