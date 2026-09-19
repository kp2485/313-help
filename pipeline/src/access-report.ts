// "Access shed" (docs/11 Layer A): for each OPEN greenway segment, how much help is within a
// 10-minute walk, by category, and where the gaps are. Reads the built bundle; prints a table
// and writes data/indicators/greenway_access.json. No resident data is involved anywhere.

import { readdirSync, readFileSync } from 'node:fs';
import { helpAlong, type BundleRow, type Segment } from '@313help/query';
import { p, writeJson } from './util.js';

const dir = p('data/bundle/v1');
const rows: BundleRow[] = readdirSync(`${dir}/category`).flatMap((f) => JSON.parse(readFileSync(`${dir}/category/${f}`, 'utf8')));
const { segments, source } = JSON.parse(readFileSync(`${dir}/places/greenway.json`, 'utf8')) as { segments: Segment[]; source: unknown };

const TOPS = ['food', 'health', 'harm', 'shelter', 'utilities', 'hygiene', 'youth', 'rec'];
const out = segments.filter((s) => s.phase === 'open').map((s) => {
  const near = helpAlong(rows, s);
  const by = Object.fromEntries(TOPS.map((t) => [t, near.filter((x) => x.row.category.startsWith(t)).length]));
  return { id: s.id, name: s.name, total: near.length, by_category: by, // "None listed yet" describes OUR directory, not the neighborhood (docs/13 honesty rule 6).
    none_listed_yet: TOPS.filter((t) => ['food', 'health', 'harm'].includes(t) && by[t] === 0) };
});

writeJson(p('data/indicators/greenway_access.json'), { generated_from: 'data/bundle/v1', walk_miles: 0.5, source, segments: out });
for (const s of out) console.log(`${String(s.total).padStart(3)}  ${s.name.padEnd(46).slice(0, 46)} ${TOPS.map((t) => `${t[0]}${t[1]}:${s.by_category[t]}`).join(' ')}${s.none_listed_yet.length ? `   none listed yet: ${s.none_listed_yet.join(', ')}` : ''}`);
