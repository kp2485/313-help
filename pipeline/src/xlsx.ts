// Just enough of .xlsx to read a plain table: an .xlsx file is a zip of XML parts. No dependency: the zip central
// directory is read by hand and entries are inflated with node:zlib. Only what SAMHSA's National Directory needs
// (shared strings, inline strings, numbers); formulas, dates and styles are not interpreted.

import { inflateRawSync } from 'node:zlib';

/** Every file in a zip archive, by name. Stored and deflated entries only (what spreadsheet writers use). */
export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`zip entry ${name}: compression method ${method} is not supported`);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITY[e] ?? m);
/** The text of every <t> inside a fragment, joined (rich text is split into runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]!)).join('');

/** Column letters to a 0-based index: A -> 0, Z -> 25, AA -> 26. */
export const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** The rows of one worksheet (1-based sheet number, in workbook order) as arrays of strings. */
export function readSheet(xlsx: Buffer, sheet = 1): string[][] {
  const files = unzip(xlsx);
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const xml = files.get(`xl/worksheets/sheet${sheet}.xml`)?.toString('utf8');
  if (xml === undefined) throw new Error(`no worksheet ${sheet}`);
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!, inner = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? texts(inner) : v !== undefined ? unxml(v) : '';
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows;
}
