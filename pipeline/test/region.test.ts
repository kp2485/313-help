import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVICE_BBOX, inServiceArea } from '@313help/query';
import { BORDER_M, ROUTE_RUN_M, boxOf, cityId, ddotRoutes, displayName, municipalitiesFrom, routeRun, type Subdivision } from '../src/ingest-region.js';
import { placeAt, regionPlaces } from '../src/region.js';
import { p } from '../src/util.js';

type Pt = [number, number];
const square = (x0: number, y0: number, x1: number, y1: number): Pt[][][] => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
const sub = (geoid: string, censusName: string, baseName: string, county: string, poly: Pt[][][]): Subdivision =>
  ({ geoid, censusName, baseName, county, polygons: poly, center: poly[0]![0]![0]!, box: [poly[0]![0]![0]![0], poly[0]![0]![0]![1], poly[0]![0]![2]![0], poly[0]![0]![2]![1]] });

describe('the service area, worked out from where the buses stop (pnpm ingest:region)', () => {
  it('names a place the way a person says it, and keeps "Township" where two places share a name', () => {
    expect(displayName('Royal Oak city', 'Royal Oak')).toBe('Royal Oak');
    expect(displayName('Royal Oak charter township', 'Royal Oak')).toBe('Royal Oak Township');
    expect(displayName('Village of Grosse Pointe Shores city', 'Village of Grosse Pointe Shores')).toBe('Grosse Pointe Shores');
    expect(cityId('St. Clair Shores')).toBe('city_st_clair_shores');
  });

  it('a place is in when a stop is in it; one place across a county line is one place with two GEOIDs', () => {
    const subs = [
      sub('1', 'Warren city', 'Warren', 'Macomb', square(0, 0, 1, 1)),
      sub('2', 'Canton charter township', 'Canton', 'Wayne', square(1, 0, 2, 1)),                    // no stop: out
      sub('3', 'Village of Grosse Pointe Shores city', 'Village of Grosse Pointe Shores', 'Wayne', square(2, 0, 3, 1)),
      sub('4', 'Village of Grosse Pointe Shores city', 'Village of Grosse Pointe Shores', 'Macomb', square(3, 0, 4, 1)),
    ];
    const codes = new Map([['Warren city', 3130], ['Canton charter township', 1010], ['Village of Grosse Pointe Shores city', 8005]]);
    const { list, onALine } = municipalitiesFrom({ smart: [[0.5, 0.5], [2.5, 0.5], [3.5, 0.5], [9, 9]], ddot: [[0.4, 0.4]] }, subs, codes);
    expect(list.map((m) => m.id)).toEqual(['city_grosse_pointe_shores', 'city_warren']);    // Wayne first, then Macomb
    expect(list[0]).toMatchObject({ counties: ['Wayne', 'Macomb'], geoids: ['3', '4'], stops: { smart: 2, ddot: 0 } });
    expect(list[1]).toMatchObject({ semmcd: 3130, stops: { smart: 1, ddot: 1 } });
    expect(onALine).toBe(1);                                                                 // the stop at 9,9 is in no place
    expect(boxOf(list)).toEqual({ latMin: 0, latMax: 1, lonMin: 0, lonMax: 4 });
  });

  it('a place a route runs through is in, even with no stop; a road that only forms its edge is not', () => {
    const subs = [sub('1', 'Warren city', 'Warren', 'Macomb', square(0, 0, 0.01, 0.01)), sub('2', 'Orion charter township', 'Orion', 'Oakland', square(0.01, 0, 0.02, 0.01))];
    const codes = new Map([['Warren city', 3130], ['Orion charter township', 2190]]);
    // Along the shared edge at x = 0.01: a border road, so Orion stays out.
    const edge: Pt[][] = [[[0.01, 0.001], [0.01, 0.009]]];
    expect(municipalitiesFrom({ smart: [[0.005, 0.005]], ddot: [] }, subs, codes, edge).list.map((m) => m.id)).toEqual(['city_warren']);
    // Across Orion, well inside it: 0.008 degrees of latitude is about 900 m.
    const across: Pt[][] = [[[0.015, 0.001], [0.015, 0.009]]];
    const got = municipalitiesFrom({ smart: [[0.005, 0.005]], ddot: [] }, subs, codes, across).list;
    expect(got.map((m) => m.id)).toEqual(['city_orion_township', 'city_warren']);
    expect(got[0]).toMatchObject({ stops: { smart: 0, ddot: 0 } });
    expect(got[0]!.route_m).toBeGreaterThan(800);
    expect(routeRun(across, subs, new Set(['2'])).size).toBe(0);                 // a place already in is not measured
  });

  it('refuses a place SEMCOG has no code for, rather than guessing one', () => {
    expect(() => municipalitiesFrom({ smart: [[0.5, 0.5]], ddot: [] }, [sub('1', 'Nowhere city', 'Nowhere', 'Wayne', square(0, 0, 1, 1))], new Map()))
      .toThrow(/SEMCOG has no community/);
  });
});

describe('the committed region (data/ingested/region.json)', () => {
  const file = JSON.parse(readFileSync(p('data/ingested/region.json'), 'utf8')) as { bbox: typeof SERVICE_BBOX; municipalities: { id: string; stops: { smart: number; ddot: number }; route_m: number }[] };
  const places = regionPlaces();

  it('holds the four cities that came first, and every place has a stop in it or a route through it', () => {
    for (const id of ['city_detroit', 'city_hamtramck', 'city_highland_park', 'city_dearborn']) expect(places.map((m) => m.id)).toContain(id);
    expect(places.length).toBeGreaterThanOrEqual(60);
    for (const m of file.municipalities) expect(m.stops.smart + m.stops.ddot > 0 || m.route_m >= ROUTE_RUN_M, m.id).toBe(true);
    expect(file.municipalities.find((m) => m.id === 'city_orion_township')).toMatchObject({ stops: { smart: 0, ddot: 0 } });   // FAST Woodward on I-75
    expect(new Set(places.map((m) => m.id)).size).toBe(places.length);
  });

  it('fits inside SERVICE_BBOX, the box the pipeline and the three clients share', () => {
    expect(file.bbox.latMin).toBeGreaterThanOrEqual(SERVICE_BBOX.latMin);
    expect(file.bbox.latMax).toBeLessThanOrEqual(SERVICE_BBOX.latMax);
    expect(file.bbox.lonMin).toBeGreaterThanOrEqual(SERVICE_BBOX.lonMin);
    expect(file.bbox.lonMax).toBeLessThanOrEqual(SERVICE_BBOX.lonMax);
  });

  it('places a point in the right place, and a point in a place the buses skip in none', () => {
    expect(placeAt(42.3293, -83.0452)?.id).toBe('city_detroit');          // City Hall
    expect(placeAt(42.3934, -83.0497)?.id).toBe('city_hamtramck');
    expect(placeAt(42.6389, -83.2910)?.id).toBe('city_pontiac');
    expect(placeAt(42.4895, -83.0147)?.id).toBe('city_warren');
    expect(placeAt(42.3087, -83.4822)).toBeNull();                          // Canton: SMART does not serve it
    expect(placeAt(42.28, -83.74)).toBeNull();                              // Ann Arbor
  });
});

describe('every bus route in the app is contained (Kyle, 2026-09-24: "make sure they are all contained")', () => {
  const places = regionPlaces();
  /** Metres to the nearest outline edge of any place: a border road runs along one. */
  const K = Math.cos((42.35 * Math.PI) / 180);
  const toEdge = (pt: Pt) => {
    let best = Infinity;
    for (const m of places) for (const r of m.rings) for (let i = 0; i + 1 < r.length; i++) {
      const [ax, ay] = r[i]!, [bx, by] = r[i + 1]!;
      if (Math.max(ax, bx) < pt[0] - 0.002 || Math.min(ax, bx) > pt[0] + 0.002 || Math.max(ay, by) < pt[1] - 0.002 || Math.min(ay, by) > pt[1] + 0.002) continue;
      const dx = (bx - ax) * 111320 * K, dy = (by - ay) * 111132, px = (pt[0] - ax) * 111320 * K, py = (pt[1] - ay) * 111132;
      const len2 = dx * dx + dy * dy, u = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(px - u * dx, py - u * dy));
    }
    return best;
  };
  const decode = (file: string, key: 'lines' | 'points'): Pt[][] => {
    const d = JSON.parse(readFileSync(p(`data/ingested/transit/${file}`), 'utf8')) as { origin: Pt; lines: [number, number[]][]; points: [number, number, number][] };
    if (key === 'points') return [d.points.map(([, x, y]) => [d.origin[0] + x / 1e5, d.origin[1] + y / 1e5] as Pt)];
    return d.lines.map(([, enc]) => { const out: Pt[] = []; let x = 0, y = 0; for (let i = 0; i + 1 < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out.push([d.origin[0] + x / 1e5, d.origin[1] + y / 1e5]); } return out; });
  };
  /** Inside a place, or on a border road: the outlines are simplified to about 4 m, and a road is ~20 m wide. */
  const contained = (pt: Pt) => placeAt(pt[1], pt[0], places) !== null || toEdge(pt) <= BORDER_M + 20;

  for (const [name, file, key] of [
    ['every DDOT route', 'ddot_routes.json', 'lines'], ['every SMART route', 'smart_routes.json', 'lines'],
    ['every DDOT stop', 'ddot_stops.json', 'points'], ['every SMART stop', 'smart_stops.json', 'points'],
  ] as const) {
    it(`${name} lies inside the area's outlines`, () => {
      const pts = decode(file, key).flat();
      expect(pts.length).toBeGreaterThan(1000);
      const out = pts.filter((q) => !contained(q));
      expect(out.slice(0, 5), `${out.length} of ${pts.length} points outside`).toEqual([]);
      for (const [lon, lat] of pts) expect(inServiceArea(lat, lon), `${lat},${lon}`).toBe(true);
    });
  }

  it('the DDOT lines the region was worked out from are the committed ones', () => expect(ddotRoutes().length).toBeGreaterThan(50));
});

