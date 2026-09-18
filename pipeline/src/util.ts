import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const p = (...parts: string[]) => join(ROOT, ...parts);

// Detroit bbox sanity (CLAUDE.md).
export const BBOX = { latMin: 42.25, latMax: 42.46, lonMin: -83.29, lonMax: -82.91 };
export const inBbox = (lat: number, lon: number, slack = 0) =>
  lat >= BBOX.latMin - slack && lat <= BBOX.latMax + slack && lon >= BBOX.lonMin - slack && lon <= BBOX.lonMax + slack;

export type CsvRow = Record<string, string>;

export function readCsv(path: string): CsvRow[] {
  if (!existsSync(path)) return [];
  return parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as CsvRow[];
}

export function writeCsv(path: string, rows: CsvRow[], columns: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(rows, { header: true, columns }), 'utf8');
}

export function writeJson(path: string, data: unknown): Buffer {
  mkdirSync(dirname(path), { recursive: true });
  const buf = Buffer.from(JSON.stringify(data, null, 1) + '\n', 'utf8');
  writeFileSync(path, buf);
  return buf;
}

export const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

/** Digits only. "(313) 579-2100 ext. 4217" -> { number: "3135792100", ext: "4217" } */
export function parsePhone(raw: string): { number: string; ext?: string } | null {
  const m = /^(.*?)(?:\s*(?:ext\.?|x)\s*(\d+))?$/i.exec(raw.trim());
  if (!m) return null;
  let digits = (m[1] ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (/^(911|988|211|311)$/.test(digits)) return { number: digits };
  // NANP: 10 digits, area code and exchange start 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return m[2] ? { number: digits, ext: m[2] } : { number: digits };
}

export function formatPhone(n: string): string {
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : n;
}

// HSDS wants UUIDs; our ids are stable slugs (CLAUDE.md). The export carries a
// deterministic UUIDv5 of the slug as `id`, and the slug itself in x_detroit.id.
const NAMESPACE = 'b5f0c1d2-7a1e-5c3b-9e44-d37201a0de70';
export function uuid5(name: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(ns).update(name, 'utf8').digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);
