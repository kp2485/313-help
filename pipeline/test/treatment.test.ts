import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { colIndex, readSheet, unzip } from '../src/xlsx.js';
import { directoryPrograms, dwihnProviders, importLines, mapProgram, mergePrograms, otpPrograms, samePlace, stage, type Program } from '../src/ingest-treatment.js';
import { lineToRows } from '../src/import-lines.js';

/** A minimal zip (one deflated and one stored entry), built the way spreadsheet writers do. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0, i = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), method = i++ % 2 ? 0 : 8, data = method ? deflateRawSync(raw) : raw, fname = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(fname.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(fname.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, fname, data); central.push(ch, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe('xlsx reader (no dependency)', () => {
  it('reads stored and deflated zip entries', () => {
    const files = unzip(zip({ 'a.txt': 'hello', 'b.txt': 'world' }));
    expect(files.get('a.txt')!.toString()).toBe('hello');
    expect(files.get('b.txt')!.toString()).toBe('world');
  });
  it('reads shared strings, inline strings, numbers, entities and gaps by column letter', () => {
    const book = zip({
      'xl/sharedStrings.xml': '<sst><si><t>name1</t></si><si><r><t>Harbor </t></r><r><t>Light &amp; Co</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>zip</t></is></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>48208</v></c></row></sheetData></worksheet>',
    });
    expect(readSheet(book)).toEqual([['name1', '', 'zip'], ['Harbor Light & Co', '', '48208']]);
    expect(colIndex('A')).toBe(0); expect(colIndex('Z')).toBe(25); expect(colIndex('AA')).toBe(26);
  });
  it('refuses a file that is not a zip', () => expect(() => unzip(Buffer.from('not a zip at all, just text'))).toThrow(/not a zip/));
});

const prog = (codes: string, over: Partial<Program> = {}): Program => ({
  name: 'Hope Recovery', site: '', street: '100 Main Street', city: 'Detroit', zip: '48201', phone: '313-555-0100', intake: '',
  codes: new Set(codes.split(' ')), from: ['directory'], ...over,
});

describe('SAMHSA treatment programs (DECISIONS 2026-09-19)', () => {
  it('never lists sober homes, DUI-only programs, or programs with no public or low-cost payment', () => {
    expect(mapProgram(prog('SA HH MD'))).toEqual({ skip: expect.stringMatching(/sober home.*MARR/) });
    expect(mapProgram(prog('SA OP MD DUIO'))).toEqual({ skip: expect.stringMatching(/DUI/) });
    expect(mapProgram(prog('SA OP PI CASH'))).toEqual({ skip: expect.stringMatching(/no Medicaid/) });
  });
  it('files each program by its most intensive care, and says only what the codes say', () => {
    expect(mapProgram(prog('SA DT RES RD OP MD SS BU'))).toMatchObject({ category: 'treatment.detox', flags: ['medicaid', 'sliding_fee'] });
    expect(mapProgram(prog('SA RES RL MD'))).toMatchObject({ category: 'treatment.residential', what: 'Live-in treatment for drug or alcohol use. Takes Medicaid.' });
    const op = mapProgram(prog('SA OP ORT BU VTRL MD SP F4'));
    expect(op).toMatchObject({ category: 'treatment.outpatient', flags: ['medicaid', 'spanish', 'arabic'] });
    expect((op as { what: string }).what).toBe('Treatment for drug or alcohol use while you live at home. Offers buprenorphine (Suboxone) and naltrexone (Vivitrol). Takes Medicaid.');
    for (const m of [mapProgram(prog('SA RES MD')), op]) expect((m as { what: string }).what).not.toMatch(/\bfree\b|verified/i);
  });
  it('a certified methadone clinic from the OTP list is kept, with no promise about cost', () => {
    const m = mapProgram(prog('OTP', { from: ['otp'] }));
    expect(m).toMatchObject({ category: 'treatment.meds', flags: [] });
    expect((m as { what: string }).what).toMatch(/Methadone clinic.*Call to ask about cost\./);
  });
  it('one sex only is said for live-in and detox programs; age answers and "special programs" codes are not eligibility', () => {
    expect(mapProgram(prog('SA RES MD FEM'))).toMatchObject({ eligibility: 'Women only.', flags: ['medicaid', 'women'] });
    expect(mapProgram(prog('SA OP MD MALE CH/AD PW VET'))).toMatchObject({ eligibility: '', flags: ['medicaid'] });
  });
  it('the same place: a shared phone (extensions ignored) or the same house number and street in the same city', () => {
    expect(samePlace({ phone: '313-962-9446 x222', street: '', city: 'Detroit' }, { phones: ['(313) 962-9446'], street: '', city: 'Detroit' })).toBe(true);
    expect(samePlace({ phone: '313-555-0100', street: '3737 Lawton Street', city: 'Detroit' }, { phones: ['313-555-9999'], street: '3737 Lawton St', city: 'Detroit' })).toBe(true);
    expect(samePlace({ phone: '313-555-0100', street: '3737 Lawton Street', city: 'Detroit' }, { phones: ['313-555-9999'], street: '3737 Lawton St', city: 'Dearborn' })).toBe(false);
  });
  it('reads the three files: directory rows in the four cities, OTP rows, and DWIHN\'s dated provider list', () => {
    const rows = [['name1', 'name2', 'street1', 'street2', 'city', 'state', 'zip', 'phone', 'intake1', 'service_code_info'],
      ['Hope', 'Main', '1 Oak Street', '', 'Highland Park', 'MI', '48203-1234', '313-555-0100', '313-555-0101', 'SA * OP * MD'],
      ['Elsewhere', '', '2 Elm', '', 'Southfield', 'MI', '48075', '248-555-0100', '', 'SA OP MD'],
      ['Ohio Detroit', '', '3 Elm', '', 'Detroit', 'OH', '43000', '419-555-0100', '', 'SA OP MD']];
    const dir = directoryPrograms(rows);
    expect(dir).toHaveLength(1);
    expect(dir[0]).toMatchObject({ name: 'Hope', site: 'Main', city: 'Highland Park', zip: '48203', intake: '313-555-0101' });
    expect([...dir[0]!.codes]).toEqual(['SA', 'OP', 'MD']);
    const otp = otpPrograms('"Program Name",Street,City,State,"Zip Code",Phone,Certification\n"Hope",1 Oak Street,Highland Park,MI,48203,(313) 555-0100,Certified\n"Far",9 Pine,Lansing,MI,48900,(517) 555-0100,Certified\n');
    expect(otp).toHaveLength(1);
    const merged = mergePrograms(dir, otp);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ from: ['directory', 'otp'], otp: 'Certified' });
    const dw = dwihnProviders('"Last Updated",04/06/2026\nPIHP,"Organization Name",Address,City,Phone,Website\nDWIHN,Hope,1 Oak St,Highland Park,(313) 555-0100,https://hope.example.org\n');
    expect(dw.updated).toBe('2026-04-06');
    expect(dw.rows[0]).toMatchObject({ Website: 'https://hope.example.org' });
  });
  it('stages every program with a reason; imports only unlisted ones whose own website DWIHN names', () => {
    const dates = { directory: '2026-03-06', otp: '2026-09-19', dwihn: '2026-04-06', fetched: '2026-09-19' };
    const programs = [prog('SA OP MD'), prog('SA OP MD', { name: 'Listed Already', street: '9 Elm Street', phone: '313-555-0200' }), prog('SA RES MD', { name: 'Quiet House', street: '', phone: '313-555-0300' }),
      prog('OTP', { name: 'New Clinic', street: '5 Pine Street', phone: '313-555-0400', from: ['otp'], otp: 'Provisional' }), prog('SA OP MD', { name: 'No Site', street: '7 Ash Street', phone: '313-555-0500' })];
    const existing = [{ sal_id: 'sal_listed', status: 'active', phone: '313-555-0200', address_1: '', city: 'Detroit' }];
    const dwihn = [{ Phone: '313-555-0100', Address: '100 Main St', City: 'Detroit', Website: 'https://hope.example.org', 'Accepting New People': 'Yes' }];
    const s = stage(programs, existing, dwihn, dates);
    const by = (n: string) => s.find((r) => r.name === n)!;
    expect(by('Hope Recovery')).toMatchObject({ decision: 'import', dwihn_website: 'https://hope.example.org', on_lists: 'directory+dwihn' });
    expect(by('Listed Already')).toMatchObject({ decision: 'listed', listed_as: 'sal_listed' });
    expect(by('Quiet House')).toMatchObject({ decision: 'staged', address_1: '', reason: expect.stringMatching(/no street address/) });
    expect(by('New Clinic')).toMatchObject({ decision: 'staged', reason: 'provisional OTP certification' });
    expect(by('No Site')).toMatchObject({ decision: 'staged', reason: expect.stringMatching(/no website/) });
    const lines = importLines(s);
    expect(lines).toHaveLength(1);
    const row = lineToRows(lines[0]!);
    expect(row).toMatchObject({ resource: { category: 'treatment.outpatient', status: 'proposed', source_url: 'https://hope.example.org', flags: 'medicaid', availability: 'call_first' } });
  });
  it('two sites with one name import as two listings', () => {
    const dates = { directory: '', otp: '', dwihn: '', fetched: '' };
    const a = prog('SA OP MD', { name: 'Twin', street: '1 Oak Street', phone: '313-555-0600' }), b = prog('SA OP MD', { name: 'Twin', street: '2 Elm Street', phone: '313-555-0700' });
    const dwihn = [{ Phone: '313-555-0600', Address: '', City: '', Website: 'https://twin.example.org' }, { Phone: '313-555-0700', Address: '', City: '', Website: 'https://twin.example.org' }];
    const ids = importLines(stage([a, b], [], dwihn, dates)).map((l) => (lineToRows(l) as { resource: Record<string, string> }).resource.sal_id);
    expect(new Set(ids).size).toBe(2);
  });
});
