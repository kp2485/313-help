// The street graph and the trip planner, off the main thread.
//
// Building the graph is ~200 ms on a laptop and one to two seconds on a cheap phone (DECISIONS 2026-09-22), and
// a phone that has to think for a second must not stop answering the person's thumb while it does. So it happens
// here, once per session, and the screen says "Getting the map ready… (about a second)" meanwhile.
//
// **This worker never touches the network.** It is handed the map files by the page, which read them from the
// copy already checked against the signed index and kept in IndexedDB. Nothing about a person is in a message
// except the two points of the trip, which go no further than this thread and are never stored.

import { type Itinerary, type PackedStreets, type TransitLayer, buildStreetGraph, buildTransitNetwork, plan } from '@313help/query';

export type ToWorker =
  | { type: 'build'; id: number; streets: PackedStreets[]; layers: TransitLayer[] }
  | { type: 'plan'; id: number; from: { lat: number; lon: number }; to: { lat: number; lon: number } };
export type FromWorker =
  | { type: 'ready'; id: number; nodes: number; edges: number; buildMs: number; transit: boolean }
  | { type: 'plans'; id: number; plans: Itinerary[] }
  | { type: 'error'; id: number; message: string };

let graph: ReturnType<typeof buildStreetGraph> | null = null;
let net: ReturnType<typeof buildTransitNetwork> | null = null;

/** What one message means. Exported so a test can drive it with no Worker at all. */
export function handle(msg: ToWorker): FromWorker {
  try {
    if (msg.type === 'build') {
      graph = buildStreetGraph(msg.streets);
      // An empty network is a real answer, not a failure: with no transit files on the phone the planner still
      // ranks walking, which is the leg that matters most to the two people this was built for.
      net = buildTransitNetwork(msg.layers);
      return { type: 'ready', id: msg.id, nodes: graph.nodeCount, edges: graph.edgeCount, buildMs: graph.stats.buildMs, transit: net.stops.length > 0 };
    }
    if (!graph || !net) return { type: 'error', id: msg.id, message: 'not built' };
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
