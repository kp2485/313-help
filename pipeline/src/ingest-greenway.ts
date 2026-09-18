// Joe Louis Greenway route segments (City of Detroit open data) -> data/ingested/jlg_segments.json
// Committed, so a change in a segment's phase shows up as a reviewable diff.
// Geometry is simplified by the server (~10 m) and rounded to 5 decimals to keep the bundle small.

import { loadSources, type Source } from './ingest-arcgis.js';
import { p, slug, writeJson } from './util.js';
import type { Segment, Phase } from '@detroithelp/query';

const PHASE: Record<string, Phase> = { Open: 'open', 'Under Construction': 'under_construction', Funded: 'funded', Unfunded: 'planned' };

export function toSegments(features: any[]): Segment[] {
  // One segment per (name, phase): the layer splits some named stretches into several pieces.
  const by = new Map<string, Segment>();
  for (const f of features) {
    const a = f.properties ?? {};
    const name = String(a.ROUTE_SEGMENT_NAME ?? '').replace(/\s+/g, ' ').trim();
    const phase = PHASE[String(a.PHASE_DESCRIPTION ?? '').trim()];
    const g = f.geometry;
    if (!name || !phase || !g) continue;
    const lines: [number, number][][] = (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates])
      .map((l: number[][]) => l.map(([lon, lat]) => [Number(lon!.toFixed(5)), Number(lat!.toFixed(5))] as [number, number]));
    const key = `${name}|${phase}`;
    const seg = by.get(key) ?? { id: '', name, phase, ...(a.TYPOLOGY ? { typology: String(a.TYPOLOGY) } : {}), lines: [] };
    seg.lines.push(...lines);
    by.set(key, seg);
  }
  const segs = [...by.values()];
  const nameCount = new Map<string, number>();
  for (const s of segs) nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
  for (const s of segs) s.id = `seg_${slug(s.name)}${nameCount.get(s.name)! > 1 ? `_${s.phase}` : ''}`;
  return segs.sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  const src = loadSources().find((s: Source) => s.id === 'jlg_route_segments');
  if (!src) { console.log('jlg_route_segments is disabled in data/sources.yaml'); return; }
  const meta = await (await fetch(`${src.url}?f=json`)).json() as any;
  const lastEdited = new Date(meta.editingInfo?.dataLastEditDate ?? meta.editingInfo?.lastEditDate).toISOString().slice(0, 10);
  const q = `${src.url}/query?where=1%3D1&outFields=ROUTE_SEGMENT_NAME,PHASE_DESCRIPTION,TYPOLOGY&outSR=4326&maxAllowableOffset=0.0001&geometryPrecision=5&f=geojson`;
  const fc = await (await fetch(q)).json() as any;
  const segments = toSegments(fc.features ?? []);
  writeJson(p('data/ingested/jlg_segments.json'), { source: { name: src.name, url: src.url, last_edited: lastEdited, fetched_at: new Date().toISOString().slice(0, 10) }, segments });
  const count = (ph: Phase) => segments.filter((s) => s.phase === ph).length;
  console.log(`jlg: ${segments.length} segments (open ${count('open')}, under construction ${count('under_construction')}, funded ${count('funded')}, planned ${count('planned')}); layer last edited ${lastEdited}`);
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-greenway.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
