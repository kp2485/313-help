// Where "Directions" and "Bus directions" send a person, and nothing else.
//
// Some rows have coordinates but no street address a person could read out (Wayne County's naloxone and
// test-strip spots, harm.supplies). Those still get directions, from the coordinate. A coordinate is never
// printed as if it were an address: it only ever goes to the maps app the person chose to open.
// Nothing here touches the network or the phone; the screen says plainly that a maps app will see the place.

export interface Place {
  address?: { line1: string; city: string; zip?: string };
  lat?: number;
  lon?: number;
}

/** What a maps app is asked for: the written address when there is one, else the coordinate. Null when neither. */
export function placeQuery(r: Place): string | null {
  if (r.address) return encodeURIComponent(`${r.address.line1}, ${r.address.city}, MI ${r.address.zip ?? ''}`);
  if (r.lat !== undefined && r.lon !== undefined) return `${r.lat},${r.lon}`;
  return null;
}

/** The maps app this phone is likely to have. Null when the row has no address and no coordinate. */
export function directionsHref(r: Place, ua: string): string | null {
  const q = placeQuery(r);
  if (!q) return null;
  if (/iPhone|iPad|Macintosh/.test(ua)) return `https://maps.apple.com/?daddr=${q}`;
  if (/Android/.test(ua) && r.lat !== undefined) return `geo:${r.lat},${r.lon}?q=${q}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/** The same place, by bus. */
export function transitHref(r: Place): string | null {
  const q = placeQuery(r);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=transit` : null;
}
