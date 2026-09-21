// How each transport layer is drawn in the `standard` map style (docs/MAP-STYLE.md, section 2). It is its own
// file so a test can hold the table itself, not the text of it: the `subway` style never reads or changes it.
// `css` is a custom property in style.css, so dark mode, "increase contrast" and forced colours all reach it.

export const LAYER_STYLE: Record<string, { css: string; width?: number; dash?: number[]; dense?: boolean; ring?: boolean }> = {
  'go:ddot_routes': { css: '--lyr-bus', width: 3.2 },
  'go:ddot_stops': { css: '--lyr-bus', dense: true },
  'go:smart_routes': { css: '--lyr-smart', width: 2.8, dash: [3, 2] },
  'go:smart_stops': { css: '--lyr-smart', dense: true },
  'go:qline': { css: '--lyr-rail', width: 4, ring: true },
  'go:people_mover': { css: '--lyr-rail', width: 3.4, ring: true },
  'go:mogo': { css: '--lyr-bike', ring: true },
  'go:bike_lanes': { css: '--lyr-bike', width: 2.4 },
  'go:stations': { css: '--lyr-rail', ring: true },
  'go:park_ride': { css: '--lyr-smart', ring: true },
  // Intercity coaches (Greyhound and the rest): a few stops, not a network. It had no entry at all, so it was
  // drawn exactly like the DDOT routes and nothing on the map told the two apart (web review, 2026-09-20).
  'go:intercity_bus': { css: '--lyr-rail', width: 2.6, dash: [5, 3], ring: true },
};
