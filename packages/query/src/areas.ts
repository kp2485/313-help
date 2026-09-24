// Coarse service areas for domestic-violence rows (schema/query-spec.md, docs/08).
//
// A shelter.dv row never carries an address, a ZIP or a coordinate: the bundle is public and signed, so anything
// in it is published. A steward may instead record `service_area`, one value from the closed list below — a whole
// city or bigger, never a ZIP and never a neighbourhood.
//
// Each area maps HERE, in code, to one fixed public reference point: a city hall, or for a county the Census
// Bureau's published internal point. The point is about the area,
// never about a shelter, and every shelter serving one area shares the same point. That is the whole safety
// argument: the only things that go into the ordering are the person's own location (which never leaves the
// device) and a city hall's or the Census Bureau's published coordinate, so the order can say which area a row serves — which the
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
  // The three counties use the Census Bureau's own published internal point (TIGERweb State_County, INTPTLAT and
  // INTPTLON), so anyone can check the number. Wayne's was a hand-picked "geographic centre" at 42.2410, -83.1770,
  // about 8 km from the Bureau's point, until 2026-09-24.
  wayne_county: { point: { lat: 42.2847, lon: -83.2620 }, reference: "the US Census Bureau's internal point for Wayne County", wide: false },
  wayne_county_west: { point: { lat: 42.3247, lon: -83.4001 }, reference: 'Westland City Hall, the largest city of western Wayne County', wide: false },
  wayne_county_downriver: { point: { lat: 42.2256, lon: -83.2696 }, reference: 'Taylor City Hall, the largest city of the Downriver communities', wide: false },
  oakland_county: { point: { lat: 42.6605, lon: -83.3842 }, reference: "the US Census Bureau's internal point for Oakland County", wide: false },
  macomb_county: { point: { lat: 42.6716, lon: -82.9115 }, reference: "the US Census Bureau's internal point for Macomb County", wide: false },
  // Every other city and township in the area (2026-09-24, DECISIONS): the area a phone-only local service or a row
  // the geocoder cannot place names, at the Census Bureau's internal point for that place (data/ingested/region.json).
  allen_park: { point: { lat: 42.2595, lon: -83.2104 }, reference: "the US Census Bureau's internal point for Allen Park", wide: false },
  auburn_hills: { point: { lat: 42.6747, lon: -83.2436 }, reference: "the US Census Bureau's internal point for Auburn Hills", wide: false },
  berkley: { point: { lat: 42.4986, lon: -83.1853 }, reference: "the US Census Bureau's internal point for Berkley", wide: false },
  birmingham: { point: { lat: 42.5448, lon: -83.2166 }, reference: "the US Census Bureau's internal point for Birmingham", wide: false },
  bloomfield_hills: { point: { lat: 42.5814, lon: -83.2464 }, reference: "the US Census Bureau's internal point for Bloomfield Hills", wide: false },
  bloomfield_township: { point: { lat: 42.5779, lon: -83.2745 }, reference: "the US Census Bureau's internal point for Bloomfield Township", wide: false },
  center_line: { point: { lat: 42.4806, lon: -83.0274 }, reference: "the US Census Bureau's internal point for Center Line", wide: false },
  chesterfield_township: { point: { lat: 42.6795, lon: -82.8063 }, reference: "the US Census Bureau's internal point for Chesterfield Township", wide: false },
  clawson: { point: { lat: 42.5367, lon: -83.1504 }, reference: "the US Census Bureau's internal point for Clawson", wide: false },
  clinton_township: { point: { lat: 42.5903, lon: -82.9169 }, reference: "the US Census Bureau's internal point for Clinton Township", wide: false },
  commerce_township: { point: { lat: 42.5739, lon: -83.4957 }, reference: "the US Census Bureau's internal point for Commerce Township", wide: false },
  dearborn_heights: { point: { lat: 42.3357, lon: -83.2888 }, reference: "the US Census Bureau's internal point for Dearborn Heights", wide: false },
  eastpointe: { point: { lat: 42.4661, lon: -82.9463 }, reference: "the US Census Bureau's internal point for Eastpointe", wide: false },
  ecorse: { point: { lat: 42.2496, lon: -83.1404 }, reference: "the US Census Bureau's internal point for Ecorse", wide: false },
  farmington: { point: { lat: 42.4614, lon: -83.3784 }, reference: "the US Census Bureau's internal point for Farmington", wide: false },
  farmington_hills: { point: { lat: 42.4856, lon: -83.3760 }, reference: "the US Census Bureau's internal point for Farmington Hills", wide: false },
  ferndale: { point: { lat: 42.4592, lon: -83.1314 }, reference: "the US Census Bureau's internal point for Ferndale", wide: false },
  fraser: { point: { lat: 42.5377, lon: -82.9467 }, reference: "the US Census Bureau's internal point for Fraser", wide: false },
  garden_city: { point: { lat: 42.3244, lon: -83.3412 }, reference: "the US Census Bureau's internal point for Garden City", wide: false },
  grosse_pointe: { point: { lat: 42.3839, lon: -82.9039 }, reference: "the US Census Bureau's internal point for Grosse Pointe", wide: false },
  grosse_pointe_farms: { point: { lat: 42.3975, lon: -82.8892 }, reference: "the US Census Bureau's internal point for Grosse Pointe Farms", wide: false },
  grosse_pointe_park: { point: { lat: 42.3740, lon: -82.9234 }, reference: "the US Census Bureau's internal point for Grosse Pointe Park", wide: false },
  grosse_pointe_shores: { point: { lat: 42.4444, lon: -82.8737 }, reference: "the US Census Bureau's internal point for Grosse Pointe Shores", wide: false },
  grosse_pointe_woods: { point: { lat: 42.4393, lon: -82.8990 }, reference: "the US Census Bureau's internal point for Grosse Pointe Woods", wide: false },
  harper_woods: { point: { lat: 42.4390, lon: -82.9292 }, reference: "the US Census Bureau's internal point for Harper Woods", wide: false },
  harrison_township: { point: { lat: 42.5876, lon: -82.8175 }, reference: "the US Census Bureau's internal point for Harrison Township", wide: false },
  hazel_park: { point: { lat: 42.4619, lon: -83.0977 }, reference: "the US Census Bureau's internal point for Hazel Park", wide: false },
  huntington_woods: { point: { lat: 42.4819, lon: -83.1681 }, reference: "the US Census Bureau's internal point for Huntington Woods", wide: false },
  inkster: { point: { lat: 42.2939, lon: -83.3203 }, reference: "the US Census Bureau's internal point for Inkster", wide: false },
  lathrup_village: { point: { lat: 42.4921, lon: -83.2273 }, reference: "the US Census Bureau's internal point for Lathrup Village", wide: false },
  lincoln_park: { point: { lat: 42.2433, lon: -83.1813 }, reference: "the US Census Bureau's internal point for Lincoln Park", wide: false },
  livonia: { point: { lat: 42.3972, lon: -83.3723 }, reference: "the US Census Bureau's internal point for Livonia", wide: false },
  macomb_township: { point: { lat: 42.6749, lon: -82.9182 }, reference: "the US Census Bureau's internal point for Macomb Township", wide: false },
  madison_heights: { point: { lat: 42.5073, lon: -83.1034 }, reference: "the US Census Bureau's internal point for Madison Heights", wide: false },
  melvindale: { point: { lat: 42.2787, lon: -83.1822 }, reference: "the US Census Bureau's internal point for Melvindale", wide: false },
  mount_clemens: { point: { lat: 42.5981, lon: -82.8815 }, reference: "the US Census Bureau's internal point for Mount Clemens", wide: false },
  new_baltimore: { point: { lat: 42.6853, lon: -82.7377 }, reference: "the US Census Bureau's internal point for New Baltimore", wide: false },
  novi: { point: { lat: 42.4785, lon: -83.4868 }, reference: "the US Census Bureau's internal point for Novi", wide: false },
  oak_park: { point: { lat: 42.4649, lon: -83.1824 }, reference: "the US Census Bureau's internal point for Oak Park", wide: false },
  orion_township: { point: { lat: 42.7569, lon: -83.2619 }, reference: "the US Census Bureau's internal point for Orion Township", wide: false },
  pleasant_ridge: { point: { lat: 42.4715, lon: -83.1445 }, reference: "the US Census Bureau's internal point for Pleasant Ridge", wide: false },
  pontiac: { point: { lat: 42.6492, lon: -83.2874 }, reference: "the US Census Bureau's internal point for Pontiac", wide: false },
  redford_township: { point: { lat: 42.3948, lon: -83.2940 }, reference: "the US Census Bureau's internal point for Redford Township", wide: false },
  river_rouge: { point: { lat: 42.2743, lon: -83.1242 }, reference: "the US Census Bureau's internal point for River Rouge", wide: false },
  riverview: { point: { lat: 42.1735, lon: -83.1984 }, reference: "the US Census Bureau's internal point for Riverview", wide: false },
  rochester: { point: { lat: 42.6866, lon: -83.1197 }, reference: "the US Census Bureau's internal point for Rochester", wide: false },
  rochester_hills: { point: { lat: 42.6635, lon: -83.1592 }, reference: "the US Census Bureau's internal point for Rochester Hills", wide: false },
  romulus: { point: { lat: 42.2213, lon: -83.3674 }, reference: "the US Census Bureau's internal point for Romulus", wide: false },
  roseville: { point: { lat: 42.5076, lon: -82.9366 }, reference: "the US Census Bureau's internal point for Roseville", wide: false },
  royal_oak: { point: { lat: 42.5078, lon: -83.1539 }, reference: "the US Census Bureau's internal point for Royal Oak", wide: false },
  royal_oak_township: { point: { lat: 42.4498, lon: -83.1624 }, reference: "the US Census Bureau's internal point for Royal Oak Township", wide: false },
  shelby_township: { point: { lat: 42.6731, lon: -83.0366 }, reference: "the US Census Bureau's internal point for Shelby Township", wide: false },
  southfield: { point: { lat: 42.4746, lon: -83.2595 }, reference: "the US Census Bureau's internal point for Southfield", wide: false },
  southfield_township: { point: { lat: 42.5204, lon: -83.2648 }, reference: "the US Census Bureau's internal point for Southfield Township", wide: false },
  southgate: { point: { lat: 42.2047, lon: -83.2057 }, reference: "the US Census Bureau's internal point for Southgate", wide: false },
  st_clair_shores: { point: { lat: 42.4930, lon: -82.8909 }, reference: "the US Census Bureau's internal point for St. Clair Shores", wide: false },
  sterling_heights: { point: { lat: 42.5812, lon: -83.0303 }, reference: "the US Census Bureau's internal point for Sterling Heights", wide: false },
  sylvan_lake: { point: { lat: 42.6168, lon: -83.3335 }, reference: "the US Census Bureau's internal point for Sylvan Lake", wide: false },
  taylor: { point: { lat: 42.2253, lon: -83.2677 }, reference: "the US Census Bureau's internal point for Taylor", wide: false },
  trenton: { point: { lat: 42.1403, lon: -83.1924 }, reference: "the US Census Bureau's internal point for Trenton", wide: false },
  troy: { point: { lat: 42.5839, lon: -83.1455 }, reference: "the US Census Bureau's internal point for Troy", wide: false },
  utica: { point: { lat: 42.6287, lon: -83.0233 }, reference: "the US Census Bureau's internal point for Utica", wide: false },
  walled_lake: { point: { lat: 42.5372, lon: -83.4737 }, reference: "the US Census Bureau's internal point for Walled Lake", wide: false },
  warren: { point: { lat: 42.4929, lon: -83.0250 }, reference: "the US Census Bureau's internal point for Warren", wide: false },
  waterford_township: { point: { lat: 42.6620, lon: -83.3879 }, reference: "the US Census Bureau's internal point for Waterford Township", wide: false },
  wayne: { point: { lat: 42.2769, lon: -83.3881 }, reference: "the US Census Bureau's internal point for Wayne", wide: false },
  west_bloomfield_township: { point: { lat: 42.5667, lon: -83.3871 }, reference: "the US Census Bureau's internal point for West Bloomfield Township", wide: false },
  westland: { point: { lat: 42.3192, lon: -83.3808 }, reference: "the US Census Bureau's internal point for Westland", wide: false },
  white_lake_township: { point: { lat: 42.6550, lon: -83.5008 }, reference: "the US Census Bureau's internal point for White Lake Township", wide: false },
  wixom: { point: { lat: 42.5228, lon: -83.5302 }, reference: "the US Census Bureau's internal point for Wixom", wide: false },
  wyandotte: { point: { lat: 42.2107, lon: -83.1573 }, reference: "the US Census Bureau's internal point for Wyandotte", wide: false },
  statewide: { point: null, reference: 'no local centre: Michigan as a whole', wide: true },
  national: { point: null, reference: 'no local centre: the United States', wide: true },
};

/**
 * The service area, as one box: every city and township a DDOT or SMART bus stops in or runs through (Kyle, 2026-09-24;
 * `pnpm ingest:region` writes the list and the box round its outlines to data/ingested/region.json, and a test
 * holds this box to contain that one). It was four cities until 2026-09-24 (lat 42.25–42.46, lon −83.33 to
 * −82.91). It is the pipeline's sanity check on every coordinate it ingests (`BBOX` in pipeline/src/util.ts,
 * which re-exports this one); the clients need the same box to answer one question the pipeline never asks:
 * is the phone in the area at all? A location outside it is not moved to (docs/05, "Map tab"), because a map of
 * Detroit centred on Chicago is not a map of anything.
 *
 * Mirrored by `serviceBox` in apps/ios/Sources/HelpCore/Locate.swift and by `ServiceBox` in
 * apps/android/app/src/main/kotlin/org/help313/app/Locate.kt.
 */
export const SERVICE_BBOX = { latMin: 42.11, latMax: 42.80, lonMin: -83.57, lonMax: -82.70 };

/** Whether a point is inside the service area's box. `slack` is in degrees, for a caller that wants the edge forgiven. */
export const inServiceArea = (lat: number, lon: number, slack = 0): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) &&
  lat >= SERVICE_BBOX.latMin - slack && lat <= SERVICE_BBOX.latMax + slack &&
  lon >= SERVICE_BBOX.lonMin - slack && lon <= SERVICE_BBOX.lonMax + slack;

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

/**
 * Whether a row is ranked, and described, by the coarse area it serves instead of by a place (2026-09-24, Kyle's
 * choice (a)): every domestic-violence row, and any other row that names a `service_area` and has no coordinate —
 * a phone-only local service (a ride program, Meals on Wheels, nurse home visits) or a place the geocoder could not
 * put on the map. Such a row gets its band from the area's reference point and never a distance. A row with a
 * coordinate ranks by that coordinate, whatever else it says.
 */
export const servesByArea = (row: { category: string; service_area?: string; lat?: number; lon?: number }): boolean =>
  isDvCategory(row.category) || (!!row.service_area && (row.lat === undefined || row.lon === undefined));

/** The string key for "Serves {area}" on a row that is described by its area, or null. */
export const servesAreaKey = (row: { category: string; service_area?: string; lat?: number; lon?: number }): string | null =>
  servesByArea(row) && row.service_area ? serviceAreaKey(row.service_area) : null;
