// Photos on condition reports (docs/11). A photo is about a THING (a broken light, dumped trash), it is never
// public, and it is deleted 30 days after its report closes. The phone re-draws the picture through a canvas,
// which drops all metadata; this file is the server's half of that promise: anything that is not a plain,
// metadata-free JPEG is refused, so a photo with GPS, a device name, or a timestamp inside can never be stored.

export const MAX_PHOTO_BYTES = 1_500_000;
export const MAX_PHOTO_SIDE = 1600;          // the app sends at most 1280 px; bigger did not come from the app
export const PHOTO_KEY = /^ph_[a-f0-9]{32}$/;

// Marker segments a canvas-made JPEG needs. Everything else is refused: APP1 (Exif, XMP), APP2 (ICC, MPF),
// APP13 (IPTC/Photoshop), COM (comments), and the rest of APPn.
const ALLOWED = new Set([0xe0 /* APP0 JFIF */, 0xdb /* DQT */, 0xc0, 0xc1, 0xc2 /* SOF */, 0xc4 /* DHT */, 0xdd /* DRI */, 0xda /* SOS */]);

export type PhotoCheck = { ok: true; clean: Uint8Array; width: number; height: number } | { ok: false; error: string };

export function checkJpeg(b: Uint8Array): PhotoCheck {
  const fail = (error: string): PhotoCheck => ({ ok: false, error });
  if (b.length > MAX_PHOTO_BYTES) return fail('photo is too large');
  if (b.length < 125 || b[0] !== 0xff || b[1] !== 0xd8) return fail('not a JPEG');
  let i = 2, width = 0, height = 0;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return fail('not a well-formed JPEG');
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; }                                  // fill byte
    if (m === 0xd9) {                                                   // end of image: drop anything after it (polyglot files)
      if (!width) return fail('not a well-formed JPEG');
      return { ok: true, clean: b.slice(0, i + 2), width, height };
    }
    if (!ALLOWED.has(m)) return fail(m === 0xe1 ? 'photo carries metadata (Exif or XMP)' : 'photo carries metadata or an unexpected segment');
    if (i + 3 >= b.length) return fail('not a well-formed JPEG');
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2 || i + 2 + len > b.length) return fail('not a well-formed JPEG');
    // APP0 must be the bare 16-byte "JFIF\0" header: a longer one carries a thumbnail or something tucked in after it.
    if (m === 0xe0 && !(len === 16 && b[i + 4] === 0x4a && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46 && b[i + 8] === 0)) return fail('photo carries metadata or an unexpected segment');
    if (m >= 0xc0 && m <= 0xc2) {
      height = (b[i + 5]! << 8) | b[i + 6]!; width = (b[i + 7]! << 8) | b[i + 8]!;
      if (!width || !height || Math.max(width, height) > MAX_PHOTO_SIDE) return fail('photo is too large');
    }
    i += 2 + len;
    if (m === 0xda) {                                                   // picture data: runs until the next real marker
      while (i + 1 < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1]! >= 0xd0 && b[i + 1]! <= 0xd7) && b[i + 1] !== 0xff)) i++;
    }
  }
  return fail('not a well-formed JPEG');
}

/** The part of R2 this Worker uses. In tests it is a Map. */
export interface PhotoStore {
  put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string | string[]): Promise<void>;
}
