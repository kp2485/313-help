// Drug and alcohol treatment from SAMHSA's lists (DECISIONS 2026-09-19: "use SAMHSA's lists"). Tier A, staged.
// Sources, all read-only and read with a named user agent (listed in data/sources.yaml):
//   - SAMHSA's National Directory of Drug and Alcohol Use Treatment Facilities (public domain; programs' own answers
//     to the yearly N-SUMHSS survey): what care each program gives, how it's paid for, who it serves.
//   - SAMHSA's Opioid Treatment Program Directory (live CSV): the federally certified methadone clinics.
//   - DWIHN's provider directory (the programs Wayne County's public system pays for): its website, when it has one.
// Output: data/staging/samhsa_treatment.csv (every program in the service area, with a decision and a reason) and
// data/seed/incoming/samhsa-treatment.txt: import lines for programs we don't list yet, only when DWIHN names the
// program's own website. `pnpm import:lines` + `pnpm check:sources` then publish a row only if that website shows
// its phone and street number, like every other listing. Nothing here publishes anything by itself.
// Never listed: sober homes (MARR's list is a link-out), DUI-only programs, programs that take no public or
// low-cost payment, and an address SAMHSA leaves out (a live-in program that doesn't publish one).

import { writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { readResources } from './seed-io.js';
import { streetKey } from './page-match.js';
import { p, parsePhone, slug, today, writeCsv, type CsvRow } from './util.js';
import { readSheet } from './xlsx.js';
import { regionPlaces } from './region.js';

const UA = { 'user-agent': '313help-pipeline (open-source civic directory; one polite pass)' };
export const SAMHSA_DIRECTORY = 'https://www.samhsa.gov/data/sites/default/files/reports/rpt57009/2025_SU_Facilities_for_All_City_All.xlsx';
export const SAMHSA_OTP = 'https://www.samhsa.gov/find-help/locators/opioid-treatment-program-directory/export?page&_format=csv';
export const DWIHN_PROVIDERS = 'https://dwihn.org/sites/default/files/providers-practitioners/provider-directory.csv';
/**
 * The postal city a program writes, lower-cased, to the place it is in. SAMHSA's rows carry a mailing city, not a
 * coordinate, so the list is every place in the service area (data/ingested/region.json) by its own name, and a
 * township also by the "Twp" and bare forms mail uses ("Clinton Twp", "Shelby"). A mailing city that spans two
 * places (Bloomfield Hills mail reaches Bloomfield Township) is caught later, when the address is geocoded and the
 * build checks the point.
 */
export function cityNames(places: { name: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const { name } of places) {
    out.set(name.toLowerCase(), name);
    const twp = /^(.*) Township$/.exec(name);
    if (twp) { out.set(`${twp[1]!.toLowerCase()} twp`, name); if (!out.has(twp[1]!.toLowerCase())) out.set(twp[1]!.toLowerCase(), name); }
  }
  return out;
}
const CITIES = cityNames(regionPlaces());

export interface Program {
  name: string; site: string; street: string; city: string; zip: string; phone: string; intake: string;
  codes: Set<string>; otp?: 'Certified' | 'Provisional' | string; from: ('directory' | 'otp')[];
}
export type Mapped = { category: string; flags: string[]; what: string; eligibility: string } | { skip: string };

const digits = (s: string) => parsePhone(s)?.number ?? '';
const has = (c: Set<string>, ...xs: string[]) => xs.some((x) => c.has(x));

/** What we say about a program, from its SAMHSA service codes. Only facts the codes state; never "free". */
export function mapProgram(pr: Program): Mapped {
  const c = pr.codes;
  if (c.has('DUIO')) return { skip: 'serves only DUI/DWI clients' };
  const isOtp = pr.from.includes('otp') || has(c, 'OTP', 'MM');
  const care = isOtp || has(c, 'RD', 'HID', 'OD', 'RES', 'RS', 'RL', 'OP', 'IOP', 'ORT', 'OMB', 'ODT', 'HI', 'HIT');
  if (!care && c.has('HH')) return { skip: 'a sober home or halfway house (MARR\'s certified list is a link-out; we never list homes)' };
  if (!care) return { skip: 'no treatment setting listed' };
  // Public or low-cost payment only: the app's promise is help people can afford. A certified methadone clinic from
  // the OTP list carries no payment codes; it is kept and says "call to ask about cost".
  const payment = has(c, 'MD', 'SS', 'PA', 'SAMHSA', 'NP', 'FSA', 'SI');
  if (!payment && pr.from.includes('directory')) return { skip: 'takes no Medicaid, sliding fee, payment help or public funding' };

  const category = has(c, 'RD', 'HID') ? 'treatment.detox' : has(c, 'RES', 'RS', 'RL') ? 'treatment.residential' : isOtp ? 'treatment.meds' : 'treatment.outpatient';
  const meds = [has(c, 'MU', 'METH', 'MM') || isOtp ? 'methadone' : '', has(c, 'BU', 'UB', 'BUM', 'BWN', 'BWON', 'BERI', 'DB') ? 'buprenorphine (Suboxone)' : '', has(c, 'NU', 'UN', 'VTRL', 'NXN', 'RPN') ? 'naltrexone (Vivitrol)' : ''].filter(Boolean);
  const lead: Record<string, string> = {
    'treatment.detox': 'Detox: a safe place to stop using, with medical care.',
    'treatment.residential': 'Live-in treatment for drug or alcohol use.',
    'treatment.meds': 'Methadone clinic (a federally certified opioid treatment program).',
    'treatment.outpatient': 'Treatment for drug or alcohol use while you live at home.',
  };
  const medsLine = category !== 'treatment.meds' && meds.length ? ` Offers ${meds.join(' and ')}.` : category === 'treatment.meds' && meds.length > 1 ? ` Also offers ${meds.slice(1).join(' and ')}.` : '';
  const pay = [c.has('MD') ? 'Takes Medicaid.' : '', c.has('SS') ? 'Sliding fee.' : '', !payment ? 'Call to ask about cost.' : ''].filter(Boolean).join(' ');
  const what = `${lead[category]}${medsLine}${pay ? ' ' + pay : ''}`.slice(0, 180);

  // Only facts that decide whether a person can walk in. A live-in or detox program that takes one sex says so; the
  // survey's age answers and its "special programs for" codes (veterans, pregnant…) are not eligibility, so they are
  // left out rather than risk turning someone away.
  const stays = category === 'treatment.residential' || category === 'treatment.detox';
  const women = stays && c.has('FEM') && !c.has('MALE'), men = stays && c.has('MALE') && !c.has('FEM');
  const eligibility = women ? 'Women only.' : men ? 'Men only.' : '';
  const flags = [c.has('MD') ? 'medicaid' : '', c.has('SS') ? 'sliding_fee' : '', c.has('SP') ? 'spanish' : '', c.has('F4') ? 'arabic' : '', women ? 'women' : '', men ? 'men' : ''].filter(Boolean);
  return { category, flags, what, eligibility };
}

/** SAMHSA directory rows (sheet 1, with a header row) in the service area. */
export function directoryPrograms(rows: string[][]): Program[] {
  const [head, ...body] = rows;
  const col = (name: string) => head!.indexOf(name);
  const [n1, n2, s1, s2, city, st, zip, phone, in1, codes] = ['name1', 'name2', 'street1', 'street2', 'city', 'state', 'zip', 'phone', 'intake1', 'service_code_info'].map(col);
  return body.filter((r) => r[st!] === 'MI' && CITIES.has((r[city!] ?? '').trim().toLowerCase())).map((r) => ({
    name: (r[n1!] ?? '').trim(), site: (r[n2!] ?? '').trim(), street: [r[s1!], r[s2!]].filter(Boolean).join(', ').trim(),
    city: CITIES.get(r[city!]!.trim().toLowerCase())!, zip: (r[zip!] ?? '').slice(0, 5), phone: (r[phone!] ?? '').trim(), intake: (r[in1!] ?? '').trim(),
    codes: new Set((r[codes!] ?? '').split(/\s+/).filter((x) => x && x !== '*')), from: ['directory'],
  }));
}

/** OTP directory rows in the service area. */
export function otpPrograms(csv: string): Program[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true }) as CsvRow[];
  return rows.filter((r) => r.State === 'MI' && CITIES.has((r.City ?? '').trim().toLowerCase())).map((r) => ({
    name: (r['Program Name'] ?? '').trim(), site: '', street: (r.Street ?? '').trim(), city: CITIES.get(r.City!.trim().toLowerCase())!, zip: (r['Zip Code'] ?? '').slice(0, 5),
    phone: (r.Phone ?? '').trim(), intake: '', codes: new Set(['OTP']), otp: r.Certification, from: ['otp'],
  }));
}

/** DWIHN's provider directory: its first line is `"Last Updated",<date>`, then a normal header. */
export function dwihnProviders(csv: string): { updated: string; rows: CsvRow[] } {
  const [first, ...rest] = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(first ?? '');
  return { updated: m ? `${m[3]}-${m[1]}-${m[2]}` : '', rows: parse(rest.join('\n'), { columns: true, skip_empty_lines: true, relax_column_count: true }) as CsvRow[] };
}

const sameStreet = (a: string, cityA: string, b: string, cityB: string) => {
  const x = streetKey(a), y = streetKey(b);
  return !!x && !!y && x[0] === y[0] && x[1] === y[1] && cityA.toLowerCase() === cityB.toLowerCase();
};
/** The same program: a shared phone number (extensions ignored), or the same house number and street in the same city. */
export const samePlace = (a: { phone: string; intake?: string; street: string; city: string }, b: { phones: string[]; street: string; city: string }) =>
  [a.phone, a.intake ?? ''].map(digits).some((d) => d && b.phones.map(digits).includes(d)) || sameStreet(a.street, a.city, b.street, b.city);

/** Merge OTP rows into directory rows for the same place, so a clinic on both lists is one program. */
export function mergePrograms(dir: Program[], otp: Program[]): Program[] {
  const out = dir.map((d) => ({ ...d, codes: new Set(d.codes), from: [...d.from] }));
  for (const o of otp) {
    const hit = out.find((d) => samePlace(o, { phones: [d.phone, d.intake], street: d.street, city: d.city }));
    if (hit) { hit.from.push('otp'); hit.otp = o.otp; hit.codes.add('OTP'); } else out.push(o);
  }
  return out;
}

export const STAGED_COLUMNS = ['staged_id', 'decision', 'reason', 'category', 'name', 'address_1', 'city', 'zip', 'phone', 'intake', 'flags', 'what', 'eligibility',
  'listed_as', 'dwihn_website', 'dwihn_accepting_new', 'on_lists', 'otp_certification', 'directory_file_date', 'otp_read', 'dwihn_updated', 'fetched_at'];

/** One staged row per program, with what happens to it and why. */
export function stage(programs: Program[], existing: CsvRow[], dwihn: CsvRow[], dates: { directory: string; otp: string; dwihn: string; fetched: string }): CsvRow[] {
  const listed = existing.filter((r) => r.status !== 'archived').map((r) => ({ id: r.sal_id!, phones: [r.phone ?? '', r.phone2 ?? ''], street: r.address_1 ?? '', city: r.city ?? '' }));
  const provider = dwihn.map((d) => ({ d, phones: [d.Phone ?? ''], street: d.Address ?? '', city: d.City ?? '' }));
  return programs.map((pr) => {
    const m = mapProgram(pr);
    const dw = provider.filter((x) => samePlace(pr, x)).map((x) => x.d);
    const website = dw.map((d) => (d.Website ?? '').trim()).find((w) => /^https?:\/\//i.test(w)) ?? '';
    const onList = listed.find((x) => samePlace(pr, x));
    const decision = 'skip' in m ? 'skip' : onList ? 'listed' : !pr.street ? 'staged' : pr.otp === 'Provisional' ? 'staged' : website ? 'import' : 'staged';
    const reason = 'skip' in m ? m.skip : onList ? `already listed as ${onList.id}` : !pr.street ? 'SAMHSA gives no street address; a live-in program that doesn\'t publish one is listed by phone only, after a person reads its own page'
      : pr.otp === 'Provisional' ? 'provisional OTP certification' : website ? 'DWIHN names its website; check:sources decides' : 'no website on DWIHN\'s list; a person or a research pass must find its own page';
    const name = pr.site && !/admin/i.test(pr.site) ? `${pr.name}, ${pr.site}` : pr.name;
    return {
      staged_id: `sal_samhsa_${slug(pr.street || pr.name).slice(0, 40)}`, decision, reason,
      category: 'skip' in m ? '' : m.category, name, address_1: pr.street, city: pr.city, zip: pr.zip, phone: pr.phone, intake: pr.intake && digits(pr.intake) !== digits(pr.phone) ? pr.intake : '',
      flags: 'skip' in m ? '' : m.flags.join(','), what: 'skip' in m ? '' : m.what, eligibility: 'skip' in m ? '' : m.eligibility,
      listed_as: onList?.id ?? '', dwihn_website: website, dwihn_accepting_new: dw[0]?.['Accepting New People'] ?? '',
      on_lists: [...new Set(pr.from)].join('+') + (dw.length ? '+dwihn' : ''), otp_certification: pr.otp ?? '',
      directory_file_date: pr.from.includes('directory') ? dates.directory : '', otp_read: pr.from.includes('otp') ? dates.otp : '', dwihn_updated: dw.length ? dates.dwihn : '', fetched_at: dates.fetched,
    };
  }).sort((a, b) => a.staged_id.localeCompare(b.staged_id));
}

/** Import lines (pipeline/src/import-lines.ts format) for the rows marked `import`. */
export function importLines(staged: CsvRow[]): string[] {
  const rows = staged.filter((s) => s.decision === 'import');
  // Two sites of one program share a name; the street tells them (and their ids) apart.
  const shared = new Set(rows.map((s) => s.name).filter((n, i, all) => all.indexOf(n) !== i));
  return rows.map((s) => {
    const org = s.name!.split(',')[0]!;
    s = shared.has(s.name) ? { ...s, name: `${s.name}, ${s.address_1!.split(',')[0]}` } : s;
    const extras = [s.flags ? `flags=${s.flags}` : '', s.intake ? `phone2=${s.intake}; phone2_label=Intake` : ''].filter(Boolean).join('; ');
    const clean = (x: string) => x.replace(/\|/g, '/');
    return [s.name, org, s.category, s.what, s.address_1, s.city, s.zip, s.phone, s.dwihn_website, 'not stated', s.eligibility, s.dwihn_website, extras].map((x) => clean(x ?? '')).join(' | ');
  });
}

async function get(url: string): Promise<{ body: Buffer; lastModified: string }> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const lm = res.headers.get('last-modified');
  return { body: Buffer.from(await res.arrayBuffer()), lastModified: lm ? new Date(lm).toISOString().slice(0, 10) : '' };
}

if ((process.argv[1] ?? '').split('\\').join('/').endsWith('/src/ingest-treatment.ts')) {
  const fetched = today();
  const [dir, otp, dw] = await Promise.all([get(SAMHSA_DIRECTORY), get(SAMHSA_OTP), get(DWIHN_PROVIDERS)]);
  const programs = mergePrograms(directoryPrograms(readSheet(dir.body, 1)), otpPrograms(otp.body.toString('utf8')));
  const provider = dwihnProviders(dw.body.toString('utf8'));
  const existing = readResources();
  const staged = stage(programs, existing, provider.rows, { directory: dir.lastModified, otp: fetched, dwihn: provider.updated, fetched });
  writeCsv(p('data/staging/samhsa_treatment.csv'), staged, STAGED_COLUMNS);
  const lines = importLines(staged);
  writeFileSync(p('data/seed/incoming/samhsa-treatment.txt'), [
    `# Written by pnpm ingest:treatment on ${fetched} (pipeline/src/ingest-treatment.ts). Do not edit by hand; it is rewritten each run.`,
    '# Programs from SAMHSA\'s treatment directory and OTP list that we don\'t list yet, whose own website DWIHN\'s provider',
    '# directory names. What each line says comes from SAMHSA\'s codes; pnpm check:sources publishes a row only if that',
    '# website shows its phone number and street number. Everything else waits in data/staging/samhsa_treatment.csv.',
    ...lines, '',
  ].join('\n'));
  const count = (d: string) => staged.filter((s) => s.decision === d).length;
  console.log(`${programs.length} programs in the service area: ${count('listed')} already listed, ${count('import')} to import, ${count('staged')} staged for a person, ${count('skip')} left out.`);
  for (const s of staged.filter((x) => x.decision === 'skip')) console.log(`  left out: ${s.name} (${s.reason})`);
  // A treatment listing that is on none of the three lists may have closed or moved: a person should look.
  const everything = [...programs.map((pr) => ({ phones: [pr.phone, pr.intake], street: pr.street, city: pr.city })), ...provider.rows.map((d) => ({ phones: [d.Phone ?? ''], street: d.Address ?? '', city: d.City ?? '' }))];
  for (const r of existing.filter((x) => x.status === 'active' && /^treatment\./.test(x.category ?? ''))) {
    if (!everything.some((e) => samePlace({ phone: r.phone ?? '', intake: r.phone2 ?? '', street: r.address_1 ?? '', city: r.city ?? '' }, e)))
      console.warn(`  not on SAMHSA's or DWIHN's lists: ${r.sal_id} (${r.address_1 || r.phone}). A person should check it is still open.`);
  }
}
