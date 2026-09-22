// How a neighbourhood or city boundary is drawn, at every zoom (Kyle, 2026-09-22: "The user needs to be able to
// see the boundaries of the neighborhoods on the map").
//
// This file is the whole of the rule, as arithmetic, so the iPhone and Android ports can be held to the same
// picture without reading a canvas: hand it metres per pixel, get back a stroke width, a dash, whether names are
// drawn, and how many. Nothing here reads a position, a theme or a stylesheet — the colour is a TOKEN NAME, and
// each client resolves it its own way (web `style.css`, iPhone `MapPalette.swift`, Android `MapPalette.kt`), so
// dark mode, "increase contrast" and forced colours all reach the map through the machinery that already exists.
//
// The spec, with the reasoning, is docs/MAP-STYLE.md section 15.

/**
 * The three zoom bands a boundary is drawn in. The cut points are exactly the ones the subway style already uses
 * (docs/MAP-STYLE.md section 5: far > 30, mid 12–30, near < 12), so a porter has one ladder to implement, not
 * two. `city` is that spec's `far`, renamed here because at that zoom the whole city is on the screen and the
 * band is about what a city-wide view can carry.
 */
export type BoundaryBand = 'city' | 'mid' | 'near';
/** > 30 m/px is `city`; 12–30 is `mid`; under 12 is `near`. */
export const BOUNDARY_MID_MPP = 30, BOUNDARY_NEAR_MPP = 12;
export const boundaryBand = (mpp: number): BoundaryBand => (mpp > BOUNDARY_MID_MPP ? 'city' : mpp >= BOUNDARY_NEAR_MPP ? 'mid' : 'near');

/**
 * The colour of every boundary, in every band. One token, so a boundary is one thing wherever it is drawn.
 *
 * It is deliberately **not** a street colour: the map is full of grey-green lines and an area edge is not one of
 * them (`--map-road`, `--map-main`, `--map-fwy` are all within a step of each other). A muted plum reads as
 * "administrative" beside them, and clears 3:1 against the land, against a park and against the ground outside
 * the four cities, in both themes and with "increase contrast" on. Under forced colours it becomes a system
 * keyword like every other map token, and the dash is then what tells it from a street.
 */
export const BOUNDARY_TOKEN = '--map-bnd';
/** The wash and the heavier solid stroke on the one outline that was tapped keep the colours they had. */
export const BOUNDARY_SELECTED_TOKEN = '--focus', BOUNDARY_WASH_TOKEN = '--brand', BOUNDARY_WASH_ALPHA = 0.08, BOUNDARY_SELECTED_WIDTH = 3;

export interface BoundaryStyle {
  band: BoundaryBand;
  /** Stroke width in CSS px / pt / dp for a neighbourhood outline. */
  width: number;
  /** Stroke width for one of the four city outlines: a city is a bigger fact than a neighbourhood, and the only
   *  thing that says so is weight — never colour, and never a fill (docs/13 rule 1: no choropleth, ever). */
  cityWidth: number;
  /** Dash pattern in CSS px, ABSOLUTE — not multiplied by the line width, the way a transit dash is. A hairline
   *  scaled dash collapses into a solid line, and the dotted texture is the point. */
  dash: number[];
  /** Whether a boundary carries its name in this band. */
  names: boolean;
  /** At most this many names a frame, so a city-wide view of 205 outlines is never a wall of words. */
  nameCap: number;
  /** A name is only drawn when the outline is at least this many pixels wide: about what the shortest name
   *  needs, and the reason 14 m/px used to be where neighbourhoods appeared at all. */
  nameMinPx: number;
}

/** At most 12 names a frame — the same cap the subway style puts on station names — and a name only where its
 *  outline is at least 70 px across, which is about what the shortest neighbourhood name needs. */
export const BOUNDARY_NAME_CAP = 12, BOUNDARY_NAME_MIN_PX = 70;

/**
 * Band → style. The whole table, in one place.
 *
 * | band | m/px | neighbourhood | city | dash | names |
 * |---|---|---|---|---|---|
 * | `city` | > 30 | 0.9 | 1.5 | 1 on, 2 off | no |
 * | `mid` | 12–30 | 1.1 | 1.8 | 2 on, 3 off | yes, ≤ 12 |
 * | `near` | < 12 | 1.8 | 2.6 | 5 on, 3 off | yes, ≤ 12 |
 *
 * Why these numbers:
 *
 * - **0.9 px at city zoom is thinner than the thinnest street on the screen.** At that zoom the map draws
 *   classes 0–2 only, whose floor is 1.6 px (`map.ts`), so a boundary can never be mistaken for a road, and 205
 *   of them read as a faint lattice over the city rather than as a mesh. The old rule drew none of them at all
 *   below 14 m/px, which is why a person who opened the Map tab saw no neighbourhoods. (The first draft was 0.6
 *   with a 1-on-3-off dot; on a real city-wide frame, over the help dots, it was not a line anyone could see.
 *   0.9 on 1-on-2-off is still under every street and is a line.)
 * - **The dash gets longer, not just thicker, as you come in.** A 1-on-2-off dot is a texture; a 5-on-3-off dash
 *   is a line with gaps, which is what an edge you are about to walk to should look like. Colour never carries
 *   the meaning alone (WCAG 1.4.1): the dash and the name do it too, and the list under the map says it in words.
 * - **No names in the city band.** 205 names at 70 px apiece do not fit, and a name that is dropped for want of
 *   room is worse than a band that never promised one.
 */
export function boundaryStyle(mpp: number): BoundaryStyle {
  const band = boundaryBand(mpp);
  if (band === 'city') return { band, width: 0.9, cityWidth: 1.5, dash: [1, 2], names: false, nameCap: 0, nameMinPx: BOUNDARY_NAME_MIN_PX };
  if (band === 'mid') return { band, width: 1.1, cityWidth: 1.8, dash: [2, 3], names: true, nameCap: BOUNDARY_NAME_CAP, nameMinPx: BOUNDARY_NAME_MIN_PX };
  return { band, width: 1.8, cityWidth: 2.6, dash: [5, 3], names: true, nameCap: BOUNDARY_NAME_CAP, nameMinPx: BOUNDARY_NAME_MIN_PX };
}
