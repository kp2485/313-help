// Coarse service areas for domestic-violence rows (schema/query-spec.md, docs/08).
//
// A shelter.dv row never carries an address, a ZIP or a coordinate: the bundle is public and signed, so anything
// in it is published. A steward may instead record `service_area`, one value from the closed list below — a whole
// city or bigger, never a ZIP and never a neighbourhood.
//
// Each area maps HERE, in code, to one fixed public reference point: a city hall. The point is about the area,
// never about a shelter, and every shelter serving one area shares the same point. That is the whole safety
// argument: the only things that go into the ordering are the person's own location (which never leaves the
// device) and a city hall's published coordinate, so the order can say which area a row serves — which the
// screen says in words anyway — and nothing finer.
//
// Mirrored by apps/ios/Sources/DetroitQuery/Areas.swift and
// apps/android/query/src/main/kotlin/org/help313/query/Areas.kt. All three are held to schema/fixtures/13-dv-service-area.json.

export interface ServiceArea {
  /** The reference point, or null for an area with no local centre (statewide, national). */
  point: { lat: number; lon: number } | null;
  /** What the point is, in plain words. Used by docs and tests; never shown to a person. */
  reference: string;
  /** statewide and national rank after every local area. */
  wide: boolean;
}

export const SERVICE_AREAS: Record<string, ServiceArea> = {
  detroit: { point: { lat: 42.3293, lon: -83.0452 }, reference: 'Detroit City Hall (Coleman A. Young Municipal Center)', wide: false },
  dearborn: { point: { lat: 42.3224, lon: -83.1763 }, reference: 'Dearborn Administrative Center', wide: false },
  hamtramck: { point: { lat: 42.3934, lon: -83.0497 }, reference: 'Hamtramck City Hall', wide: false },
  highland_park: { point: { lat: 42.4055, lon: -83.0968 }, reference: 'Highland Park City Hall', wide: false },
  wayne_county: { point: { lat: 42.2410, lon: -83.1770 }, reference: 'the geographic centre of Wayne County', wide: false },
  wayne_county_west: { point: { lat: 42.3247, lon: -83.4001 }, reference: 'Westland City Hall, the largest city of western Wayne County', wide: false },
  wayne_county_downriver: { point: { lat: 42.2256, lon: -83.2696 }, reference: 'Taylor City Hall, the largest city of the Downriver communities', wide: false },
  statewide: { point: null, reference: 'no local centre: Michigan as a whole', wide: true },
  national: { point: null, reference: 'no local centre: the United States', wide: true },
};

export const SERVICE_AREA_IDS = Object.keys(SERVICE_AREAS);
export const isServiceArea = (id: string): boolean => Object.prototype.hasOwnProperty.call(SERVICE_AREAS, id);

/** The string key a screen uses to name the area in words ("Serves Detroit"). Text never lives in code. */
export const serviceAreaKey = (id: string): string | null => (isServiceArea(id) ? `area.${id}` : null);

/**
 * The bands an area's distance falls into. Deliberately coarser than the 0–1/1–3/3+ ladder ordinary rows use:
 * an area is a whole city, so a finer ladder would pretend to a precision the data does not have.
 */
export const AREA_BAND_MILES: [number, number] = [3, 10];

/** True for every category the service-area rules cover: shelter.dv and anything under it. */
export const isDvCategory = (category: string): boolean => category === 'shelter.dv' || category.startsWith('shelter.dv.');
