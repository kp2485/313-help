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

/** The same place, by bus. Needs no app: it opens in the browser wherever the person is. */
export function transitHref(r: Place): string | null {
  const q = placeQuery(r);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=transit` : null;
}

// ---- the Transit app -------------------------------------------------------
// Transit (transitapp.com) is the app DDOT and SMART riders use for real-time buses; SMART's own page lists it
// among the third-party apps that get SMART's data (docs/research/2026-09-20/transit-app.md). It is an extra way
// to open the trip, never a replacement for the link above, and never an endorsement or a partnership.
//
// The format is Transit's own documented URL scheme (https://transitapp.com/developers): `transit://directions`
// with `from` and `to`. We send **only `to`**. Their note says leaving a parameter out uses the person's own
// location, which the Transit app asks for itself, on their phone — so we pass no origin and read none.

/** The destination handed to the Transit app: the publisher's coordinate first, the written address only when
 *  there is no coordinate. This is the reverse of `placeQuery`, on purpose: Transit documents that "User's
 *  current location is taken into account when geocoding address strings," so a coordinate lands exactly where
 *  the publisher put the place and an address string does not. A coordinate is still never printed as an
 *  address — like everywhere else here, it is only ever passed through. */
export function transitAppQuery(r: Place): string | null {
  if (r.lat !== undefined && r.lon !== undefined) return `${r.lat},${r.lon}`;
  if (r.address) return encodeURIComponent(`${r.address.line1}, ${r.address.city}, MI ${r.address.zip ?? ''}`);
  return null;
}

/** Bus directions in the Transit app, or null when we would be offering a link that cannot work.
 *
 *  Two gates, both from the docs:
 *  - the same one as `transitHref`: an address or a coordinate, so DV and crisis rows (which have neither) get
 *    no Transit link, exactly as they get no Directions and no Bus directions;
 *  - phones only. Transit documents no https universal link and no behaviour when the app is not installed, and
 *    it ships for iOS and Android only, so on a laptop a `transit://` link could only fail. We hide it there
 *    rather than guess a URL, using the same user-agent test `directionsHref` uses. The plain "Bus directions"
 *    link needs no app and is what a laptop gets. */
export function transitAppHref(r: Place, ua: string): string | null {
  if (!/iPhone|iPad|Android/.test(ua)) return null;
  const q = transitAppQuery(r);
  return q ? `transit://directions?to=${q}` : null;
}
