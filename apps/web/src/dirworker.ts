// The street graph and the trip planner, off the main thread.
//
// Since the area widened to every city and township a DDOT or SMART bus stops in (2026-09-24), the whole street map
// is ~110,000 nodes — a second on a laptop and many on a cheap phone — so no graph of all of it is ever built. The
// worker is handed the street files once; each plan builds a graph of only the streets that trip can walk on
// (`tripWindow`, `windowFiles`; schema/query-spec.md "The trip window"), 15-50 ms, and drops it with the answer.
// A window graph is never kept: it is the streets round two points a person asked about.
//
// **This worker never touches the network.** It is handed the map files by the page, which read them from the
// copy already checked against the signed index and kept in IndexedDB. Nothing about a person is in a message
// except the two points of the trip, which go no further than this thread and are never stored.

import { type Itinerary, type PackedStreets, type TransitLayer, buildStreetGraph, buildTransitNetwork, plan, tripWindow, windowFiles } from '@313help/query';

export type ToWorker =
  | { type: 'build'; id: number; streets: PackedStreets[]; layers: TransitLayer[] }
  | { type: 'plan'; id: number; from: { lat: number; lon: number }; to: { lat: number; lon: number } };
export type FromWorker =
  | { type: 'ready'; id: number; transit: boolean }
  | { type: 'plans'; id: number; plans: Itinerary[] }
  | { type: 'error'; id: number; message: string };

/** `map/base.json` first, then every cell of `map/streets.json` in key order (dirfiles.ts `streetFiles`). */
let streets: PackedStreets[] | null = null;
let net: ReturnType<typeof buildTransitNetwork> | null = null;

/** What one message means. Exported so a test can drive it with no Worker at all. */
export function handle(msg: ToWorker): FromWorker {
  try {
    if (msg.type === 'build') {
      if (!msg.streets.length) return { type: 'error', id: msg.id, message: 'no streets' };
      streets = msg.streets;
      // An empty network is a real answer, not a failure: with no transit files on the phone the planner still
      // ranks walking, which is the leg that matters most to the two people this was built for.
      net = buildTransitNetwork(msg.layers);
      return { type: 'ready', id: msg.id, transit: net.stops.length > 0 };
    }
    if (!streets || !net) return { type: 'error', id: msg.id, message: 'not built' };
    const w = tripWindow(net, msg.from, msg.to);
    const graph = buildStreetGraph(windowFiles(streets[0]!, streets.slice(1), w));
    return { type: 'plans', id: msg.id, plans: plan(graph, net, msg.from, msg.to) as Itinerary[] };
  } catch (e) {
    return { type: 'error', id: msg.id, message: e instanceof Error ? e.message : 'failed' };
  }
}

// `self` and `postMessage` only exist inside a worker (and `self` is not defined at all under Node, which is
// where the tests run). Importing this file anywhere else must do nothing at all.
const scope = (globalThis as { self?: unknown }).self as { postMessage?: (m: FromWorker) => void; addEventListener?: (k: string, f: (e: MessageEvent<ToWorker>) => void) => void } | undefined;
if (scope && typeof scope.postMessage === 'function' && typeof scope.addEventListener === 'function' && typeof (globalThis as { document?: unknown }).document === 'undefined') {
  scope.addEventListener('message', (e: MessageEvent<ToWorker>) => scope.postMessage!(handle(e.data)));
}
