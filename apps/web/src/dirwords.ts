// The words for a trip plan. Pure functions, no DOM, no state: the wording contract of
// schema/query-spec.md "Trip plans" written out once, so iOS and Android can mirror it line for line and a test
// can hold all four languages to the same table.
//
// Three rules from DECISIONS 2026-09-22 are enforced HERE, not in the screen:
//  * the estimate is always a RANGE, from `Itinerary.range` (`minutesRange` in packages/query) — never a single
//    number, never a clock time, never an arrival time;
//  * a headway may only be read out as the agency's own sentence ("about every 15 min"), and only when the
//    agency published one. `wait_minutes` is our assumption and is never shown;
//  * no sentence here says safe, accessible, lit or step-free, and none may ever be added.
//
// The last walking leg ends at the street, so the last sentence is "Then about 40 m to the building"
// (`end_off_metres`). We route to the street outside, not to the door.

import type { Itinerary, PlanLeg, RideLeg, WalkLeg } from '@313help/query';

/** The app's own `t`, passed in so this file knows nothing about i18n. */
export type Say = (key: string, p?: Record<string, string | number>) => string;

export const METRES_PER_MILE = 1609.344;
export const isRide = (l: PlanLeg): l is RideLeg => l.kind === 'ride';
export const isWalk = (l: PlanLeg): l is WalkLeg => l.kind === 'walk';

/** What a bus is called on screen: the short name a rider reads off the front of it, then the long one, then
 *  the id. Never invented, and never translated: it is the agency's own name for the route. */
export const routeName = (l: RideLeg): string => l.route_short || l.route_long || l.route_id;
/** Where the route is headed, as the agency writes it — only when it says something the short name does not. */
export const towardName = (l: RideLeg): string => (l.route_long && l.route_long !== l.route_short ? l.route_long : '');

/**
 * A walking distance, in miles to one decimal. Never zero: a leg that rounds to 0.0 mi is still a walk somebody
 * has to do, and "0.0 mi" reads as "no distance at all". The floor is a tenth of a mile.
 */
export function distance(t: Say, metres: number): string {
  const mi = metres / METRES_PER_MILE;
  return t('dir.dist_mi', { miles: (mi < 0.05 ? 0.1 : mi).toFixed(1) });
}
/** The one distance that is NOT in miles: how far the street is from the door (`end_off_metres`). Metres,
 *  rounded to the metre, because that is the number the spec says a person is told. */
export const offStreet = (t: Say, metres: number): string => t('dir.dist_m', { metres: Math.round(metres) });

/** "Walk", "Bus 4", "Bus 4, then bus 16". One line, and the only place a route is named in a card's heading. */
export function itineraryTitle(t: Say, it: Itinerary): string {
  const rides = it.legs.filter(isRide);
  if (!rides.length) return t('dir.walk_card');
  if (rides.length === 1) return t('dir.bus_card', { route: routeName(rides[0]!) });
  return t('dir.bus_card_two', { a: routeName(rides[0]!), b: routeName(rides[1]!) });
}
/** "walk 0.3 mi, ride 9 stops, walk 0.1 mi" — the shape of the trip, leg by leg, in the order it is walked. */
export function legsLine(t: Say, it: Itinerary): string {
  return it.legs.map((l) => (isWalk(l)
    ? t('dir.leg_walk', { distance: distance(t, l.metres) })
    : l.stops === 1 ? t('dir.leg_ride_one') : t('dir.leg_ride', { stops: l.stops }))).join(t('list.sep'));
}
/** "about 25–40 min". ALWAYS a range: `Itinerary.range` is the only number this file will read for a duration. */
export const rangeWords = (t: Say, it: Itinerary): string => t('dir.range', { lo: it.range[0], hi: it.range[1] });
/**
 * "about every 15 min", or nothing at all. The agency's own published headway on the first ride, and only when
 * it is a number — a route that publishes none says nothing, rather than our assumed wait dressed up as a fact.
 */
export function headwayWords(t: Say, it: Itinerary): string {
  const first = it.legs.find(isRide);
  return first && typeof first.headway_minutes === 'number' && first.headway_minutes > 0
    ? t('dir.every', { minutes: first.headway_minutes }) : '';
}
/** The whole card in one sentence: what a button is named, and what the live region says. */
export function summary(t: Say, it: Itinerary): string {
  return [itineraryTitle(t, it), legsLine(t, it), rangeWords(t, it), headwayWords(t, it)].filter(Boolean).join(' · ');
}

/** One numbered step: a sentence, and which leg of the plan it belongs to (the map highlights that leg). */
export interface DirStep { text: string; leg: number }

/**
 * The numbered list, which is the source of truth for the whole screen (the map is the extra).
 *
 * Every sentence is built from the structured facts `packages/query` hands over — a street name, a compass
 * word, a turn word, a stop's own name, a count of stops — and nothing else. The rules never produce prose and
 * this file never adds a fact of its own.
 */
export function steps(t: Say, it: Itinerary, destination: string): DirStep[] {
  const out: DirStep[] = [];
  it.legs.forEach((leg, i) => {
    const last = i === it.legs.length - 1;
    if (isWalk(leg)) {
      leg.steps.forEach((s, k) => {
        const dist = distance(t, s.metres);
        out.push({
          leg: i,
          text: k === 0 || !s.turn
            ? t('dir.step_first', { bearing: t('dir.bearing.' + s.bearing), street: s.street, distance: dist })
            : t('dir.step_turn', { turn: t('dir.turn.' + s.turn), street: s.street, distance: dist }),
        });
      });
      // A leg that ends at a stop names the stop, so the next sentence ("Board the 4 at …") is not the first
      // time a person hears where they are walking to. A leg with no steps at all (both ends on one edge) still
      // gets this one, so no leg is ever silent.
      if (leg.to_stop && leg.to_stop.name) out.push({ leg: i, text: t('dir.step_walk_to_stop', { distance: distance(t, leg.metres), stop: leg.to_stop.name }) });
      else if (last) out.push({ leg: i, text: t('dir.step_last', { distance: distance(t, leg.metres), name: destination }) });
      else if (!leg.steps.length) out.push({ leg: i, text: t('dir.step_walk', { distance: distance(t, leg.metres) }) });
    } else {
      const route = routeName(leg), toward = towardName(leg);
      out.push({ leg: i, text: toward ? t('dir.step_board', { route, stop: leg.from_stop.name, toward }) : t('dir.step_board_plain', { route, stop: leg.from_stop.name }) });
      out.push({ leg: i, text: leg.stops === 1 ? t('dir.step_ride_one', { stop: leg.to_stop.name }) : t('dir.step_ride', { stops: leg.stops, stop: leg.to_stop.name }) });
      out.push({ leg: i, text: t('dir.step_off', { stop: leg.to_stop.name }) });
    }
  });
  // We route to the street outside, never to the door (query-spec "Directions", rule 3). Under five metres
  // there is nothing to say; above it, this is the last thing a person is told.
  if (it.end_off_metres >= 5) out.push({ leg: it.legs.length - 1, text: t('dir.step_end_off', { metres: Math.round(it.end_off_metres) }) });
  return out;
}

/**
 * The route overlay's text equivalent (WCAG 1.1.1): what the coloured line on the canvas says, in words, for
 * anyone who cannot see it. It names the legs in order and nothing else — the steps below are the detail.
 */
export function routeText(t: Say, it: Itinerary): string {
  return t('dir.route_text', { legs: legsLine(t, it), range: rangeWords(t, it) });
}

/**
 * How far the person is from the route, in metres, for the one piece of follow-along logic there is: "you are
 * off the route — tap to plan again". There is no rerouting, by design.
 */
export const OFF_ROUTE_M = 120;
export function metresFromRoute(at: { lat: number; lon: number }, polylines: readonly (readonly [number, number][])[]): number {
  let best = Infinity;
  for (const line of polylines) for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, pointToPiece(at, line[i]!, line[i + 1]!));
  return best;
}
/** Which step a person is on: the nearest one whose leg they are standing on, walking forwards. */
export function currentStep(at: { lat: number; lon: number }, it: Itinerary, list: readonly DirStep[]): number {
  let bestLeg = 0, bestD = Infinity;
  it.legs.forEach((l, i) => { const d = metresFromRoute(at, [l.polyline]); if (d < bestD) { bestD = d; bestLeg = i; } });
  const at_ = list.findIndex((s) => s.leg === bestLeg);
  return at_ < 0 ? 0 : at_;
}

const M_PER_DEG_LAT = 111132, M_PER_DEG_LON = 111320 * Math.cos((42.35 * Math.PI) / 180);
function pointToPiece(p: { lat: number; lon: number }, a: readonly [number, number], b: readonly [number, number]): number {
  const px = p.lon * M_PER_DEG_LON, py = p.lat * M_PER_DEG_LAT;
  const ax = a[0] * M_PER_DEG_LON, ay = a[1] * M_PER_DEG_LAT, bx = b[0] * M_PER_DEG_LON, by = b[1] * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
