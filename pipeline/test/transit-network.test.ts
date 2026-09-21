// What the subway-map style needs from the data (docs/MAP-STYLE.md, pipeline/src/transit-network.ts).
// Never touches the network: small made-up networks, then the committed files.

import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  FORMAT, INTERCHANGE_M, NEIGHBOUR_M, SIDE_BY_SIDE_MAX, TONES, along, assignTones, assignTonesAcross, retone, riderOrder, sharedMetres, toneClashes, type ToneNet, cluster, distM, hubs, lengthM, neighbours, packNetwork, project, sharedRuns,
  type Network, type Pt,
} from '../src/transit-network.js';
import { FREQUENT_MIN, HUB_LAYERS, SPECS, TONE_LAYERS, ddotNetwork, gtfsNetwork, hubsFrom, networkFiles, packLayer, qlineNetwork, realEnd, stopTimes } from '../src/ingest-transit.js';
import { p } from '../src/util.js';

const ORIGIN: Pt = [-83.32, 42.22];
/** What a format-1 client does with a line: running sums of the deltas. Flat [x, y, x, y, …] in packed units. */
const decodeLine = (enc: number[], _origin: Pt): number[] => { const out: number[] = []; let x = 0, y = 0; for (let i = 0; i < enc.length; i += 2) { x += enc[i]!; y += enc[i + 1]!; out.push(x, y); } return out; };
const buf = (s: string) => Buffer.from(s, 'utf8');
// A north–south street about 2.2 km long, and the same street walked the other way.
const up = (lon: number, from = 42.33, to = 42.35, n = 9): Pt[] => Array.from({ length: n }, (_, i) => [lon, from + ((to - from) * i) / (n - 1)] as Pt);
const down = (lon: number) => up(lon).reverse();
const runsOf = (flat: number[]) => Array.from({ length: flat.length / 3 }, (_, i) => ({ from: flat[i * 3]!, off: flat[i * 3 + 1]!, n: flat[i * 3 + 2]! }));

describe('metres', () => {
  it('measures a line, finds a place along it, and projects a point onto it', () => {
    const line = up(-83.05);
    expect(lengthM(line)).toBeGreaterThan(2200); expect(lengthM(line)).toBeLessThan(2240);
    expect(distM(along(line, 1000).pt, line[0]!)).toBeCloseTo(1000, 0);
    const pr = project(line, [-83.0495, 42.34]);
    expect(pr.off).toBeGreaterThan(38); expect(pr.off).toBeLessThan(44);          // 0.0005° of longitude here
    expect(pr.at).toBeCloseTo(lengthM(line) / 2, -1);
  });
});

describe('routes that share a street', () => {
  it('a route alone sits on the centre of its street', () => {
    const [a] = sharedRuns([{ route: 0, line: up(-83.05) }], ORIGIN);
    expect(runsOf(a!.runs)).toEqual([{ from: 0, off: 0, n: 1 }]);
  });
  it('two routes on one street take the two sides, and the same side whichever way each bus is going', () => {
    const got = sharedRuns([{ route: 0, line: up(-83.05) }, { route: 0, line: down(-83.05) }, { route: 1, line: up(-83.05) }, { route: 1, line: down(-83.05) }], ORIGIN);
    const offs = got.map((g) => runsOf(g.runs).map((r) => r.off));
    expect(got.every((g) => runsOf(g.runs).every((r) => r.n === 2))).toBe(true);
    // "Left of travel" flips with the direction, so the numbers flip and the side of the street does not.
    expect(offs[0]).toEqual([-offs[1]![0]!]);
    expect(offs[2]).toEqual([-offs[3]![0]!]);
    expect(offs[0]![0]).toBe(-offs[2]![0]!);                                   // the two routes are on opposite sides
    expect(Math.abs(offs[0]![0]!)).toBe(1);
  });
  it('three routes: one either side and one in the middle', () => {
    const got = sharedRuns([0, 1, 2].map((r) => ({ route: r, line: up(-83.05) })), ORIGIN);
    expect(got.map((g) => g.runs[1]).sort((a, b) => a! - b!)).toEqual([-2, 0, 2]);
  });
  it(`more than ${SIDE_BY_SIDE_MAX} routes are a trunk: everyone on the centre, and the count says how many`, () => {
    const got = sharedRuns([0, 1, 2, 3, 4].map((r) => ({ route: r, line: up(-83.05) })), ORIGIN);
    for (const g of got) expect(runsOf(g.runs)).toEqual([{ from: 0, off: 0, n: 5 }]);
  });
  it('a street a block away is not company, and neither is a street that crosses', () => {
    const cross: Pt[] = [[-83.06, 42.34], [-83.04, 42.34]];
    const got = sharedRuns([{ route: 0, line: up(-83.05) }, { route: 1, line: up(-83.0488) }, { route: 2, line: cross }], ORIGIN);
    for (const g of got) expect(runsOf(g.runs).every((r) => r.n === 1)).toBe(true);
  });
  it('where a second route joins half way, the line gets a vertex there and a new run starts at it', () => {
    const half = up(-83.05, 42.34, 42.35, 5);
    const [a, b] = sharedRuns([{ route: 0, line: [[-83.05, 42.33], [-83.05, 42.35]] }, { route: 1, line: [[-83.04, 42.34], ...half] }], ORIGIN);
    const r = runsOf(a!.runs);
    expect(r.map((x) => x.n)).toEqual([1, 2]);
    expect(a!.line.length).toBe(3);                                               // two ends and the new boundary
    expect(a!.line[r[1]!.from]![1]).toBeGreaterThan(42.3385); expect(a!.line[r[1]!.from]![1]).toBeLessThan(42.3415);
    expect(runsOf(b!.runs).at(-1)!.n).toBe(2);
    // Run starts are vertex numbers a phone can use: strictly rising and inside the line.
    for (const g of [a!, b!]) { const f = runsOf(g.runs).map((x) => x.from); expect(f[0]).toBe(0); expect([...f].sort((x, y) => x - y)).toEqual(f); expect(new Set(f).size).toBe(f.length); expect(f.at(-1)!).toBeLessThan(g.line.length - 1); }
  });
  it('one shared block is not worth a jog', () => {
    const blip: Pt[] = [[-83.04, 42.3395], [-83.05, 42.3395], [-83.05, 42.3403], [-83.04, 42.3403]];   // 90 m on the street
    const [a] = sharedRuns([{ route: 0, line: up(-83.05) }, { route: 1, line: blip }], ORIGIN);
    expect(runsOf(a!.runs)).toEqual([{ from: 0, off: 0, n: 1 }]);
  });
});

describe('colour', () => {
  it('routes that run together never wear the same tone, the answer never changes, and every tone is in the palette', () => {
    const lines = sharedRuns([0, 1, 2, 3].map((r) => ({ route: r, line: up(-83.05) })).concat([{ route: 4, line: up(-83.0) }]), ORIGIN);
    const near = neighbours(lines), tones = assignTones(5, near);
    expect(new Set(tones.slice(0, 4)).size).toBe(4);
    expect(tones).toEqual(assignTones(5, neighbours(lines)));
    expect(tones.every((t) => t >= 0 && t < TONES)).toBe(true);
    expect(near.get(4)).toBeUndefined();
  });
  it('with more neighbours than tones it still answers, with the least-used tone', () => {
    const all = new Map(Array.from({ length: 9 }, (_, i) => [i, new Set(Array.from({ length: 9 }, (_, j) => j).filter((j) => j !== i))]));
    const tones = assignTones(9, all);
    expect(tones.every((t) => t >= 0 && t < TONES)).toBe(true);
    expect(new Set(tones.slice(0, TONES)).size).toBe(TONES);
  });
});

describe('colour across agencies: one street, many owners', () => {
  // A packed file the way a phone gets it: whole 1e-5 degrees from the origin, deltas after the first vertex.
  const packed = (system: string, routes: { short: string; lon: number }[]): ToneNet => ({
    system, origin: ORIGIN,
    lines: routes.map((r, i) => [i, up(r.lon).flatMap(([lon, lat], k, a) => (k ? [Math.round((lon - a[k - 1]![0]) * 1e5), Math.round((lat - a[k - 1]![1]) * 1e5)] : [Math.round((lon - ORIGIN[0]) * 1e5), Math.round((lat - ORIGIN[1]) * 1e5)]))] as [number, number[]]),
    routes: routes.map((r, i) => ({ short: r.short, tone: 3, lines: [i] })),
  });
  it('a DDOT route and a SMART route on the same street never share a tone, though each file alone would give both the first one', () => {
    const nets = [packed('ddot', [{ short: '4', lon: -83.05 }]), packed('smart', [{ short: '462', lon: -83.05 }, { short: '900', lon: -83.2 }])];
    expect(sharedMetres(nets).get('0:0')!.get('1:0')!).toBeGreaterThan(NEIGHBOUR_M);
    const tones = assignTonesAcross(nets);
    expect(tones[0]![0]).not.toBe(tones[1]![0]);
    expect(tones).toEqual(assignTonesAcross(nets));                                  // the same files, the same answer
    expect(tones.flat().every((t) => t >= 0 && t < TONES)).toBe(true);
    expect(retone(nets)).toBeGreaterThan(0); expect(toneClashes(nets)).toEqual([]);
    expect(nets[0]!.routes[0]!.tone).toBe(tones[0]![0]);
  });
  it('rider order runs across networks: by number, DDOT before SMART on a tie, no number last', () => {
    const nets = [packed('smart', [{ short: '4', lon: -83.1 }, { short: 'FAST', lon: -83.12 }]), packed('ddot', [{ short: '9', lon: -83.0 }, { short: '4', lon: -83.05 }])];
    expect(riderOrder(nets)).toEqual([[1, 1], [0, 0], [1, 0], [0, 1]]);
  });
  it('a stretch where a route is inside a trunk does not count: there it wears the trunk colour, not its tone', () => {
    const nets = [packed('ddot', ['1', '2', '3', '4', '5'].map((short) => ({ short, lon: -83.05 }))), packed('smart', [{ short: '461', lon: -83.05 }])];
    expect(sharedMetres(nets).size).toBe(0);
  });
});

describe('clusters', () => {
  it('joins what is close, keeps apart what is not, and does not depend on luck', () => {
    const pts: Pt[] = [[-83.05, 42.34], [-83.0503, 42.3402], [-83.06, 42.34]];
    expect(cluster(pts, (q) => q, INTERCHANGE_M).map((g) => g.length)).toEqual([2, 1]);
  });
  it('hubs are stations of DIFFERENT systems; two of the same system are not a hub', () => {
    const got = hubs([
      { layer: 'qline', name: 'Grand Circus Station', pt: [-83.0507, 42.3364] },
      { layer: 'people_mover', name: 'Grand Circus Park', pt: [-83.0506, 42.3358] },
      { layer: 'qline', name: 'A', pt: [-83.07, 42.36] }, { layer: 'qline', name: 'A', pt: [-83.0701, 42.3601] },
    ], ORIGIN);
    expect(got).toHaveLength(1);
    expect(got[0]!.layers).toEqual(['people_mover', 'qline']);
    expect(got[0]!.span).toHaveLength(4); expect(got[0]!.span[1]).toBeLessThan(got[0]!.span[3]!);   // south end first
    expect(got[0]!.name).toBe('Grand Circus Park');
    expect(got[0]!.origin).toEqual(ORIGIN);                                          // what `at` and `span` are counted from: never assumed by a client
    expect(got[0]!.stops.map((s) => s.name).sort()).toEqual(['Grand Circus Park', 'Grand Circus Station']);
  });
});

const ring: Pt[] = [[-83.05, 42.33], [-83.04, 42.33], [-83.04, 42.335], [-83.05, 42.335], [-83.05, 42.33]];
const loop: Network = { system: 'dpm', agency: 'DTC', routes: [{ id: 'rt_dpm', short: 'DPM', long: 'People Mover' }], lines: [{ route: 0, line: ring }], stops: [{ id: 'a', name: 'Times Square', pt: [-83.045, 42.33], routes: [0] }, { id: 'b', name: 'Greektown', pt: [-83.04, 42.333], routes: [0] }], patterns: new Map([[0, [['a', 'b', 'a']]]]) };
const net: Network = {
    system: 'test', agency: 'Test Transit',
    routes: [{ id: 'rt_test_4', short: '4', long: 'Woodward', frequent: true, headway: 12 }, { id: 'rt_test_16', short: '16', long: 'Dexter', color: '#59327D', text: '#FFFFFF' }],
    lines: [{ route: 0, dir: 'Northbound', line: up(-83.05) }, { route: 0, dir: 'Southbound', line: down(-83.05) }, { route: 1, dir: 'Northbound', line: up(-83.05, 42.34, 42.36) }],
    stops: [
      { id: 't:1', name: 'Woodward & South', pt: [-83.0501, 42.3301], routes: [0], dir: 'Northbound' },
      { id: 't:2', name: 'Woodward & Middle', pt: [-83.0501, 42.3400], routes: [0, 1], dir: 'Northbound' },
      { id: 't:3', name: 'Woodward & North', pt: [-83.0501, 42.3499], routes: [0], dir: 'Northbound' },
      { id: 't:4', name: 'Dexter end', pt: [-83.0501, 42.3599], routes: [1], dir: 'Northbound' },
      { id: 't:5', name: 'A block off the line', pt: [-83.0480, 42.3450], routes: [0], dir: 'Northbound' },
    ],
};

describe('a packed network (format 2)', () => {
  const { routesLayer: r, stopsLayer: s } = packNetwork(net, { routes: 't_routes', stops: 't_stops' }, ORIGIN, 2, realEnd);
  const stopName = (i: number) => (s.names as string[])[s.points[i]![0]]!;

  it('packs lines and points the way every layer is packed, so one decoder reads both files', () => {
    expect(r.v).toBe(FORMAT); expect(s.v).toBe(FORMAT);
    expect(r.names).toEqual(expect.arrayContaining(['4 Woodward', '16 Dexter']));
    for (const [n, e] of r.lines) { expect((r.names as string[])[n]).toMatch(/Woodward|Dexter/); expect(decodeLine(e, ORIGIN).length).toBeGreaterThanOrEqual(4); }
    expect(s.points).toHaveLength(5);
    expect(s.points.every((q) => q.length === 3)).toBe(true);
  });
  it('says which route each line is, with the owner\'s facts and nothing guessed', () => {
    expect(r.routes.map((x) => x.id)).toEqual(['rt_test_4', 'rt_test_16']);
    expect(r.routes[0]).toMatchObject({ short: '4', long: 'Woodward', frequent: true, headway: 12, lines: [0, 1] });
    expect(r.routes[0]!.color).toBeUndefined();                                    // this owner published none
    expect(r.routes[1]).toMatchObject({ color: '#59327d', text: '#ffffff', lines: [2] });
    expect(r.routes[1]!.frequent).toBeUndefined();
    expect(r.routes[0]!.tone).not.toBe(r.routes[1]!.tone);                         // they share a kilometre of Woodward
  });
  it('runs line up with the lines, vertex for vertex', () => {
    const runs = r.runs as number[][];
    expect(runs).toHaveLength(r.lines.length);
    r.lines.forEach(([, e], i) => { const verts = e.length / 2; for (const x of runsOf(runs[i]!)) { expect(x.from).toBeLessThan(verts - 1); expect([1, 2]).toContain(x.n); } });
    expect(runsOf(runs[0]!).map((x) => x.n)).toEqual([1, 2]);
  });
  it('orders a route\'s stops along its line when the owner gives no order, and leaves out one that is not on it', () => {
    const north = r.routes[0]!.stops[0]!.map(stopName);
    expect(north).toEqual(['Woodward & South', 'Woodward & Middle', 'Woodward & North']);
    expect(r.routes[0]!.stops.flat().map(stopName)).not.toContain('A block off the line');
    // …but the stop still says which routes call there.
    expect(s.serves[s.points.findIndex((_, i) => stopName(i) === 'A block off the line')]).toEqual([0]);
    expect(s.route_ids).toEqual(['rt_test_4', 'rt_test_16']);
  });
  it('uses the owner\'s own order when there is one', () => {
    const withOrder = packNetwork({ ...net, patterns: new Map([[0, [['t:3', 't:1', 'nope', 't:2']]]]) }, { routes: 'a', stops: 'b' }, ORIGIN, 2, realEnd);
    expect(withOrder.routesLayer.routes[0]!.stops[0]!.map(stopName)).toEqual(['Woodward & North', 'Woodward & South', 'Woodward & Middle']);
  });
  it('finds the terminals (both directions end at the same two places) and names them after the nearest stop', () => {
    const ends = r.routes[0]!.ends.map((e) => (r.names as string[])[e[2]]);
    expect(ends.sort()).toEqual(['Woodward & North', 'Woodward & South']);
  });
  it('an end outside the area is where we clipped, not a terminal', () => {
    const far: Network = { ...net, routes: [net.routes[0]!], stops: [], lines: [{ route: 0, line: [[-83.05, 42.33], [-83.05, 42.70]] }] };
    expect(packNetwork(far, { routes: 'a', stops: 'b' }, ORIGIN, 2, realEnd).routesLayer.routes[0]!.ends).toHaveLength(1);
  });
  it('an interchange is where stops of two routes meet', () => {
    const ix = r.interchanges as [number, number, number, number[], number[]][];
    expect(ix).toHaveLength(1);
    expect((r.names as string[])[ix[0]![2]]).toBe('Woodward & Middle');
    expect(ix[0]![3]).toEqual([0, 1]);
    expect(ix[0]![4]).toHaveLength(4);                                             // the capsule's two ends
  });
  it('a closed line is a loop and has no terminals', () => {
    const one = packNetwork(loop, { routes: 'people_mover', stops: 'people_mover' }, ORIGIN, 1, realEnd).routesLayer as any;
    expect(one.routes[0]).toMatchObject({ loop: true, ends: [] });
    const first = decodeLine(one.lines[0][1], ORIGIN), n = first.length;
    expect([first[0], first[1]]).toEqual([first[n - 2], first[n - 1]]);           // closed: it ends where it starts
  });
});

describe('two styles, two files: the standard layer is not touched', () => {
  it('stop numbers in the subway file are positions in the standard layer, whatever order that layer is in', () => {
    const stops = packLayer('t_stops', [], net.stops.map((x) => ({ name: x.name, pt: x.pt })));
    const before = JSON.stringify(stops);
    const { layers, nets } = networkFiles(net, 't_routes', 't_stops', { lines: packLayer('t_routes', [], []), stops }, 2);
    expect(JSON.stringify(layers.get('t_stops'))).toBe(before);                   // byte for byte
    expect(Object.keys(layers.get('t_stops')!).sort()).toEqual(['id', 'kind', 'lines', 'names', 'origin', 'points']);
    const r = nets.get('t_routes') as any, s = nets.get('t_stops') as any;
    const nameAt = (i: number) => stops.names[stops.points[i]![0]]!;
    expect(r.routes[0].stops[0].map(nameAt)).toEqual(['Woodward & South', 'Woodward & Middle', 'Woodward & North']);
    expect(s.serves).toHaveLength(stops.points.length);
    expect(s.serves[stops.points.findIndex((_, i) => nameAt(i) === 'Woodward & Middle')]).toEqual([0, 1]);
    expect(s.points).toBeUndefined(); expect(s.names).toBeUndefined();            // the small file repeats nothing
    expect(s).toMatchObject({ id: 't_stops', v: FORMAT, routes_layer: 't_routes', route_ids: ['rt_test_4', 'rt_test_16'] });
  });
  it('a network that is one layer (the People Mover) gets one subway file, with its line and who stops where', () => {
    const stops = packLayer('people_mover', [], loop.stops.map((x) => ({ name: x.name, pt: x.pt })));
    const { layers, nets } = networkFiles(loop, 'people_mover', 'people_mover', { stops }, 1);
    expect(layers.get('people_mover')!.kind).toBe('point');                       // what the standard style draws: stations
    const n = nets.get('people_mover') as any;
    expect(n.lines).toHaveLength(1); expect(n.serves).toEqual([[0], [0]]);
    expect(n.routes[0].stops[0].map((i: number) => stops.names[stops.points[i]![0]])).toEqual(['Times Square', 'Greektown', 'Times Square']);
  });
});

describe('reading the owners', () => {
  const files = new Map<string, Buffer>([
    ['agency.txt', buf('agency_id,agency_name,agency_url\n1,SMART,https://smartbus.org\n')],
    ['routes.txt', buf('route_id,route_short_name,route_long_name,route_color,route_text_color\n461,461,FAST Woodward,ce2a2a,ffffff\n450,450,Woodward Local,,\n999,999,Nowhere near,00ff00,000000\n')],
    ['trips.txt', buf('route_id,trip_id,shape_id,direction_id\n461,t1,s1,0\n461,t2,s1,0\n450,t3,s2,0\n999,t4,s3,0\n')],
    ['shapes.txt', buf(['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', 's1,42.33,-83.05,1', 's1,42.35,-83.05,2', 's2,42.33,-83.05,1', 's2,42.34,-83.05,2', 's3,42.70,-83.30,1', 's3,42.71,-83.30,2'].join('\n') + '\n')],
    ['stops.txt', buf(['stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station', 'a,Woodward + Warren,42.335,-83.05,0,', 'st,Times Square,42.345,-83.05,1,', 'pl,Times Square platform,42.345,-83.05,0,st', 'far,Far,42.70,-83.30,0,'].join('\n') + '\n')],
    ['stop_times.txt', buf('trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,8:00,8:00,a,1\nt2,8:00,8:00,pl,2\nt2,7:50,7:50,a,1\nt3,9:00,9:00,a,1\nt4,9:00,9:00,far,1\n')],
  ]);
  it('a GTFS feed: names, colours and order are the owner\'s; FAST is the owner\'s word for frequent', () => {
    const net = gtfsNetwork(files, 'smart', (r) => /^FAST\b/.test(r.route_long_name ?? ''));
    expect(net.routes.map((r) => r.id)).toEqual(['rt_smart_450', 'rt_smart_461']);   // 999 never comes near
    expect(net.routes[1]).toMatchObject({ short: '461', long: 'FAST Woodward', color: '#ce2a2a', text: '#ffffff', frequent: true });
    expect(net.routes[0]!.color).toBeUndefined(); expect(net.routes[0]!.frequent).toBeUndefined();
    expect(net.agency).toBe('SMART'); expect(net.agency_url).toBe('https://smartbus.org');
    // A platform answers for its station, and the trip with the most stops gives the order.
    expect(net.patterns!.get(1)).toEqual([['smart:a', 'smart:st']]);
    expect(net.stops.find((s) => s.id === 'smart:a')!.routes).toEqual([0, 1]);
    expect(net.stops.map((s) => s.id).sort()).toEqual(['smart:a', 'smart:st']);
  });
  it('stop_times is read the quick way, and the careful way when a field is quoted', () => {
    expect(stopTimes(buf('trip_id,stop_id,stop_sequence\nt,a,3\n'))).toEqual([{ trip: 't', stop: 'a', seq: 3 }]);
    expect(stopTimes(buf('trip_id,stop_headsign,stop_id,stop_sequence\nt,"To, town",a,3\n'))).toEqual([{ trip: 't', stop: 'a', seq: 3 }]);
  });
  it(`DDOT: frequent only when the City's own layer says every ${FREQUENT_MIN} minutes or better; a stop names its routes`, () => {
    const route = (n: number, name: string, dir: string, every: number) => ({ geometry: { type: 'LineString', coordinates: dir === 'Southbound' ? down(-83.05) : up(-83.05) }, properties: { route_number: n, route_name: name, direction: dir, weekday_base_frequency: every } });
    const net = ddotNetwork([route(4, 'Woodward', 'Northbound', 12), route(4, 'Woodward', 'Southbound', 12), route(16, 'Dexter', 'Northbound', 20)],
      [{ geometry: { type: 'Point', coordinates: [-83.05, 42.34] }, properties: { bus_stop_id: 77, location: 'Woodward & Warren', route_number: '4, 16', direction: 'Northbound' } }]);
    expect(net.routes).toEqual([{ id: 'rt_ddot_4', short: '4', long: 'Woodward', headway: 12, frequent: true }, { id: 'rt_ddot_16', short: '16', long: 'Dexter', headway: 20 }]);
    expect(net.lines).toHaveLength(3);
    expect(net.stops[0]).toMatchObject({ id: 'ddot:77', routes: [0, 1], dir: 'Northbound' });
  });
  it('the QLINE is drawn through its stations, south to north, and says so', () => {
    const at = (name: string, lon: number, lat: number) => ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name } });
    const net = qlineNetwork([at('Grand Blvd Station', -83.0731, 42.37), at('Congress Station', -83.0455, 42.3296), at('Warren Station', -83.0644, 42.3563), at('Warren Station', -83.0646, 42.3573)], ['name']);
    expect(net.routes[0]).toMatchObject({ id: 'rt_qline', short: 'QLINE', derived: true });
    expect(net.lines[0]!.line).toHaveLength(3);                                     // two platforms, one station
    expect(net.lines[0]!.line[0]![1]).toBeLessThan(net.lines[0]!.line[2]![1]);
    expect(net.stops).toHaveLength(4);
  });
});

describe('the committed files', () => {
  const dir = p('data/ingested/transit'), has = existsSync(`${dir}/source.json`);
  const read = (id: string) => JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'));
  /** The most any one layer may weigh, gzipped: a layer is one lazy download on a phone. */
  const BUDGET_GZ = 64 * 1024;

  const net = (id: string) => JSON.parse(readFileSync(`${dir}/${id}.net.json`, 'utf8'));

  it.skipIf(!has)('every file fits the budget, and the standard layers carry nothing new', () => {
    for (const s of SPECS) {
      const file = `${dir}/${s.id}.json`;
      if (!existsSync(file)) continue;
      expect(gzipSync(readFileSync(file), { level: 9 }).length, s.id).toBeLessThanOrEqual(BUDGET_GZ);
      expect(Object.keys(read(s.id)).sort(), s.id).toEqual(['id', 'kind', 'lines', 'names', 'origin', 'points']);
      if (!s.network) { expect(existsSync(`${dir}/${s.id}.net.json`), s.id).toBe(false); continue; }
      expect(gzipSync(readFileSync(`${dir}/${s.id}.net.json`), { level: 9 }).length, `${s.id}.net`).toBeLessThanOrEqual(BUDGET_GZ);
      expect(net(s.id).v, s.id).toBe(FORMAT);
    }
    // The standard style draws the rail layers as stations, as it always has: the lines live in the subway files.
    expect(read('qline').kind).toBe('point'); expect(read('people_mover').kind).toBe('point');
  });
  it.skipIf(!has)('source.json names each subway file and its size, for the signed index and the switcher', () => {
    const doc = JSON.parse(readFileSync(`${dir}/source.json`, 'utf8'));
    for (const l of doc.layers) {
      const s = SPECS.find((x) => x.id === l.id)!;
      if (!s.network) { expect(l.net, l.id).toBeUndefined(); continue; }
      expect(l.net.file).toBe(`${l.id}.net.json`);
      expect(l.net.bytes).toBe(readFileSync(`${dir}/${l.net.file}`).length);
    }
  });
  it.skipIf(!has)('routes, runs, stops and interchanges all point at things that exist', () => {
    for (const [routesId, stopsId] of [['ddot_routes', 'ddot_stops'], ['smart_routes', 'smart_stops'], ['qline', 'qline'], ['people_mover', 'people_mover']] as const) {
      const r = net(routesId), s = net(stopsId), base = read(stopsId);
      expect(r.stops_layer).toBe(stopsId); expect(r.stops_count).toBe(base.points.length);
      expect(s.serves).toHaveLength(base.points.length);
      expect(s.route_ids).toEqual(r.routes.map((x: any) => x.id));
      expect(r.runs).toHaveLength(r.lines.length);
      const owned = new Set<number>();
      for (const rt of r.routes) {
        expect(rt.id).toMatch(/^rt_[a-z0-9_]+$/); expect(rt.tone).toBeGreaterThanOrEqual(0); expect(rt.tone).toBeLessThan(TONES);
        expect(r.names.some((n: string) => n.includes(rt.long) || n.includes(rt.short)), rt.id).toBe(true);
        for (const li of rt.lines) { expect(li).toBeLessThan(r.lines.length); owned.add(li); }
        expect(rt.stops.length, rt.id).toBeGreaterThan(0);
        for (const pat of rt.stops) for (const si of pat) { expect(si).toBeLessThan(base.points.length); expect(s.serves[si], `${rt.id} stop ${si}`).toContain(r.routes.indexOf(rt)); }
        for (const e of rt.ends) expect(e[2]).toBeLessThan(r.names.length);
        if (rt.color) expect(rt.color).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(owned.size).toBe(r.lines.length);                                     // no anonymous line is left
      r.lines.forEach(([, e]: [number, number[]], i: number) => { const f = runsOf(r.runs[i]); expect(f[0]!.from).toBe(0); for (const x of f) { expect(x.from).toBeLessThan(e.length / 2); if (x.n > SIDE_BY_SIDE_MAX) expect(x.off).toBe(0); else expect(Math.abs(x.off)).toBeLessThanOrEqual(x.n - 1); } });
      for (const ix of r.interchanges) { expect(ix[3].length).toBeGreaterThan(1); expect(ix[4]).toHaveLength(4); for (const ri of ix[3]) expect(ri).toBeLessThan(r.routes.length); }
      for (const t of r.trunks) expect(t[2].length).toBeGreaterThan(SIDE_BY_SIDE_MAX);
      for (const list of s.serves) for (const ri of list) expect(ri).toBeLessThan(r.routes.length);
    }
  });
  it.skipIf(!has)('the People Mover is a closed loop, and the QLINE says its line is a drawing through its stations', () => {
    const dpm = net('people_mover'), q = net('qline');
    expect(dpm.routes[0].loop).toBe(true); expect(dpm.routes[0].ends).toEqual([]);
    const pts = decodeLine(dpm.lines[0][1], dpm.origin); expect([pts[0], pts[1]]).toEqual([pts[pts.length - 2], pts[pts.length - 1]]);
    expect(q.routes[0].derived).toBe(true); expect(q.routes[0].ends).toHaveLength(2);
  });
  it.skipIf(!has)('frequent is only ever the owner\'s word', () => {
    for (const r of net('ddot_routes').routes) expect(Boolean(r.frequent), r.id).toBe(r.headway > 0 && r.headway <= FREQUENT_MIN);
    for (const r of net('smart_routes').routes) expect(Boolean(r.frequent), r.id).toBe(/^FAST\b/.test(r.long));
  });
  it.skipIf(!has)('bus tones are handed out across ALL bus networks: no two routes that share a street share a tone, DDOT or SMART', () => {
    const nets = TONE_LAYERS.map(net) as ToneNet[];
    expect(nets.map((n) => n.routes.map((r) => r.tone))).toEqual(assignTonesAcross(nets));   // the files carry exactly what the function gives
    expect(toneClashes(nets)).toEqual([]);
    const tone = (n: ToneNet, short: string) => n.routes.find((r) => r.short === short)!.tone;
    // Woodward: DDOT 4 with SMART 461 and 462, which the per-file tones had in one brown.
    expect(tone(nets[0]!, '4')).not.toBe(tone(nets[1]!, '462')); expect(tone(nets[0]!, '4')).not.toBe(tone(nets[1]!, '461'));
  });
  it.skipIf(!has)('every hub says what its numbers are counted from, and they land on its own stations', () => {
    const doc = JSON.parse(readFileSync(`${dir}/source.json`, 'utf8'));
    for (const h of doc.hubs) {
      expect(h.origin).toHaveLength(2);
      const lon = h.origin[0] + h.at[0] / 1e5, lat = h.origin[1] + h.at[1] / 1e5;
      const near = h.layers.flatMap((id: string) => { const l = read(id); return l.points.map(([, x, y]: number[]) => distM([l.origin[0] + x! / 1e5, l.origin[1] + y! / 1e5], [lon, lat])); });
      expect(Math.min(...near), h.name).toBeLessThan(150);
    }
  });
  it.skipIf(!has)('source.json carries the hubs, and they are what the committed layers give', () => {
    const doc = JSON.parse(readFileSync(`${dir}/source.json`, 'utf8'));
    expect(doc.format).toBe(FORMAT);
    expect(doc.hubs).toEqual(hubsFrom(HUB_LAYERS.filter((id) => existsSync(`${dir}/${id}.json`)).map(read)));
    expect(doc.hubs.some((h: any) => h.layers.includes('qline') && h.layers.includes('people_mover'))).toBe(true);
  });
});
