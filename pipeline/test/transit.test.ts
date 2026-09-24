// Transport layers for the Map tab (pipeline/src/ingest-transit.ts). These tests never touch the network:
// they run the readers over small made-up feeds, and check the committed files and the source list.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SLACK, SPECS, clipToArea, featuresToLines, featuresToPoints, gbfsStations, gtfsRows, gtfsRoutes, gtfsStops, packLayer, pickName,
} from '../src/ingest-transit.js';
import { GRID, SCALE } from '../src/ingest-basemap.js';
import { inBbox, p } from '../src/util.js';

const buf = (s: string) => Buffer.from(s, 'utf8');
const DOWNTOWN: [number, number] = [-83.045, 42.331];          // Campus Martius
const ANN_ARBOR: [number, number] = [-83.74, 42.28];           // well outside the service area (Pontiac was, until 2026-09-24)

describe('reading a GTFS feed', () => {
  const files = new Map<string, Buffer>([
    ['routes.txt', buf('route_id,route_short_name,route_long_name\nR1,17,Eight Mile\nR2,,Woodward\n')],
    ['trips.txt', buf('route_id,shape_id,direction_id\nR1,s_short,0\nR1,s_long,0\nR1,s_back,1\nR2,s_w,0\n')],
    ['shapes.txt', buf(['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      's_short,42.331,-83.045,1', 's_short,42.335,-83.045,2',
      's_long,42.331,-83.045,3', 's_long,42.340,-83.045,1', 's_long,42.350,-83.045,2',
      's_back,42.350,-83.045,1', 's_back,42.331,-83.045,2',
      's_w,42.331,-83.045,1', 's_w,42.280,-83.740,2',
    ].join('\n') + '\n')],
    ['stops.txt', buf(['stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station',
      'a,Woodward + Warren,42.355,-83.070,0,',
      'b,Times Square Station,42.337,-83.051,1,',
      'c,Times Square platform 1,42.337,-83.051,0,b',      // a platform of b: not a place to wait for
      'd,Far away,42.280,-83.740,0,',                       // outside the service area
      'e,An entrance,42.337,-83.052,2,',                    // an entrance, not a stop
      'f,Woodward + Warren,42.355,-83.070,0,',              // the same stop twice
    ].join('\n') + '\n')],
  ]);

  it('reads a header with a byte-order mark and trims it', () =>
    expect(gtfsRows(buf('﻿route_id,name\nR1,x\n'))[0]).toEqual({ route_id: 'R1', name: 'x' }));

  it('takes the longest shape for each route and direction, and names it the way a rider says it', () => {
    const lines = gtfsRoutes(files);
    const names = lines.map((l) => l.name);
    expect(names).toContain('17 Eight Mile');
    expect(names).toContain('Woodward');                    // no short name: the long name alone
    // R1 has two shapes going one way; only the longer one is kept, plus the one coming back.
    expect(lines.filter((l) => l.name === '17 Eight Mile')).toHaveLength(2);
    expect(lines.find((l) => l.name === '17 Eight Mile')!.line.length).toBe(3);
    // Shape points are put back in sequence order, not file order.
    expect(lines.find((l) => l.name === '17 Eight Mile')!.line[0]).toEqual([-83.045, 42.34]);
  });

  it('a route that leaves the service area keeps only the stretch near home', () => {
    const w = gtfsRoutes(files).filter((l) => l.name === 'Woodward');
    expect(w).toHaveLength(1);
    // Everything kept is inside, except the one point past the edge that stops the line short of nothing.
    expect(w[0]!.line.slice(0, -1).every(([lon, lat]) => inBbox(lat, lon, SLACK))).toBe(true);
    expect(w[0]!.line.length).toBeLessThanOrEqual(2);
  });

  it('stops: no platforms of a station, no entrances, nothing far away, and nothing twice', () => {
    const stops = gtfsStops(files);
    expect(stops.map((s) => s.name).sort()).toEqual(['Times Square Station', 'Woodward + Warren']);
  });
});

describe('clipping to the service area', () => {
  it('keeps the pieces inside, with one point over the edge so a line does not stop short', () => {
    const pieces = clipToArea([ANN_ARBOR, DOWNTOWN, [-83.05, 42.34], ANN_ARBOR]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]![0]).toEqual(ANN_ARBOR);                 // the point just before entering
    expect(pieces[0]!).toContainEqual(DOWNTOWN);
  });
  it('a line entirely outside gives nothing', () => expect(clipToArea([ANN_ARBOR, [-83.75, 42.3]])).toEqual([]));
});

describe('names and features', () => {
  it('takes the first field with something in it, or joins them without repeating', () => {
    expect(pickName({ a: '', b: ' Gratiot  Ave ' }, ['a', 'b'])).toBe('Gratiot Ave');
    expect(pickName({ a: '17', b: 'Eight Mile' }, ['a', 'b'], true)).toBe('17 Eight Mile');
    expect(pickName({ a: 'Dequindre Cut', b: 'DEQUINDRE CUT' }, ['a', 'b'], true)).toBe('Dequindre Cut');
    expect(pickName(undefined, ['a'])).toBe('');
  });
  it('points: only points, only inside the area', () => {
    const pts = featuresToPoints([
      { geometry: { type: 'Point', coordinates: DOWNTOWN }, properties: { name: 'Rosa Parks Transit Center' } },
      { geometry: { type: 'Point', coordinates: ANN_ARBOR }, properties: { name: 'Far' } },
      { geometry: { type: 'LineString', coordinates: [DOWNTOWN, DOWNTOWN] }, properties: { name: 'A line' } },
      { geometry: null, properties: { name: 'Nothing' } },
    ], ['name']);
    expect(pts.map((x) => x.name)).toEqual(['Rosa Parks Transit Center']);
  });
  it('lines: both LineString and MultiLineString, clipped', () => {
    const lines = featuresToLines([
      { geometry: { type: 'MultiLineString', coordinates: [[DOWNTOWN, [-83.05, 42.34]], [ANN_ARBOR, [-83.75, 42.3]]] }, properties: { route_name: 'Conner Creek' } },
    ], ['route_name', 'trail_name']);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.name).toBe('Conner Creek');
  });
  it('GBFS stations come out named and inside the area', () => {
    const got = gbfsStations({ data: { stations: [
      { name: 'Cass & Canfield', lat: DOWNTOWN[1], lon: DOWNTOWN[0] },
      { name: 'Somewhere else', lat: ANN_ARBOR[1], lon: ANN_ARBOR[0] },
      { name: 'Broken', lat: 'x', lon: 'y' },
    ] } });
    expect(got.map((s) => s.name)).toEqual(['Cass & Canfield']);
  });
});

describe('packing a layer the phone can decode', () => {
  const layer = packLayer('t', [{ cls: 1, name: 'Woodward', line: [DOWNTOWN, [-83.045, 42.35]] }], [{ name: 'A stop', pt: DOWNTOWN }]);
  it('uses the same origin as the street map, so both draw in one place', () =>
    expect(layer.origin).toEqual([GRID.lon0, GRID.lat0]));
  it('holds each name once, and -1 means no name', () => {
    expect(layer.names).toEqual(['Woodward', 'A stop']);
    expect(packLayer('t', [], [{ name: '', pt: DOWNTOWN }]).points[0]![0]).toBe(-1);
  });
  it('a point is whole 1e-5 degrees from the origin, and comes back where it started', () => {
    const [, x, y] = layer.points[0]!;
    expect(GRID.lon0 + x / SCALE).toBeCloseTo(DOWNTOWN[0], 5);
    expect(GRID.lat0 + y / SCALE).toBeCloseTo(DOWNTOWN[1], 5);
  });
  it('a line is a first point then steps, the way apps/web/src/map.ts decodes it', () => {
    const enc = layer.lines[0]![1];
    expect(enc).toHaveLength(4);
    expect(GRID.lat0 + (enc[1]! + enc[3]!) / SCALE).toBeCloseTo(42.35, 5);
  });
  it('says whether it is lines, points, or both', () => {
    expect(layer.kind).toBe('both');
    expect(packLayer('t', [], [{ name: 'x', pt: DOWNTOWN }]).kind).toBe('point');
    expect(packLayer('t', [{ cls: 1, name: 'x', line: [DOWNTOWN, [-83.05, 42.34]] }], []).kind).toBe('line');
  });
});

describe('the sources we read, and the ones we leave alone', () => {
  it('every layer names its owner, the page that publishes it, and what that page says about reuse', () => {
    expect(SPECS.length).toBeGreaterThan(6);
    for (const s of SPECS) {
      expect(s.source.url.startsWith('https://'), s.id).toBe(true);
      expect(s.source.page.startsWith('https://'), s.id).toBe(true);
      expect(s.source.name.length, s.id).toBeGreaterThan(5);
      expect(s.source.license.length, s.id).toBeGreaterThan(5);
    }
    expect(new Set(SPECS.map((s) => s.id)).size).toBe(SPECS.length);
  });
  it('anything that is not plainly free to reuse carries a note for a person to settle', () => {
    for (const s of SPECS) {
      const free = /not protected by copyright|public domain|CC0/i.test(s.source.license);
      expect(Boolean(s.review), `${s.id} (${s.source.license})`).toBe(!free);
    }
    // The one clearly public-domain source is the US government's, and it needs no note.
    expect(SPECS.find((s) => s.id === 'stations')!.review).toBeUndefined();
    // The non-commercial one is named as such, so nobody has to guess later.
    expect(SPECS.find((s) => s.id === 'intercity_bus')!.source.license).toMatch(/BY-NC/);
  });
  it('no crash data: SEMCOG publishes no terms, and the City layer holds 2011 only (DECISIONS)', () => {
    const src = readFileSync(p('pipeline/src/ingest-transit.ts'), 'utf8');
    expect(SPECS.some((s) => /crash/i.test(s.id) || /crash/i.test(s.source.url))).toBe(false);
    expect(src).toMatch(/Crashes are deliberately absent/);
  });
  it('we identify ourselves honestly and never pretend to be a browser', () => {
    const src = readFileSync(p('pipeline/src/ingest-transit.ts'), 'utf8');
    expect(src).toMatch(/'user-agent': '313help-pipeline/);
    expect(src).not.toMatch(/Mozilla|Chrome\/|Safari\//);
  });
  it('the committed layers match the sources list, and each one has shapes', () => {
    const file = p('data/ingested/transit/source.json');
    if (!existsSync(file)) return;                          // a checkout that has not run the ingest yet
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { layers: { id: string; lines: number; points: number; bytes: number }[] };
    for (const l of doc.layers) {
      expect(SPECS.map((s) => s.id), l.id).toContain(l.id);
      expect(l.lines + l.points, l.id).toBeGreaterThan(0);
      expect(existsSync(p(`data/ingested/transit/${l.id}.json`)), l.id).toBe(true);
    }
    // The order of the list is the order the switcher shows, so it follows SPECS rather than the alphabet.
    expect(doc.layers.map((l) => l.id)).toEqual(SPECS.filter((s) => doc.layers.some((l) => l.id === s.id)).map((s) => s.id));
  });
});
