import { PERSON_CSV_COLUMNS, type CustomFieldDefinition } from '@tatagereja/shared';

/*
 * CSV helpers for the import screen. Spreadsheets exported in Indonesia often use `;` as the
 * separator, so it is detected from the header line.
 */

export type ParsedCsv = { headers: string[]; rows: string[][] };

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      record.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  const nonEmpty = records.filter((row) => row.some((value) => value.trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((header) => header.trim()), rows };
}

/** Where a CSV column goes: a person column, `fullName` (split), a custom field or nowhere. */
export type ImportTarget =
  (typeof PERSON_CSV_COLUMNS)[number] | 'fullName' | `field:${string}` | '';

const ALIASES: Record<string, ImportTarget> = {
  nama: 'fullName',
  'nama lengkap': 'fullName',
  name: 'fullName',
  'full name': 'fullName',
  'nama depan': 'firstName',
  'first name': 'firstName',
  firstname: 'firstName',
  'nama belakang': 'lastName',
  marga: 'lastName',
  'last name': 'lastName',
  lastname: 'lastName',
  'jenis kelamin': 'gender',
  jk: 'gender',
  'l/p': 'gender',
  gender: 'gender',
  'tanggal lahir': 'birthDate',
  'tgl lahir': 'birthDate',
  'tgl. lahir': 'birthDate',
  birthdate: 'birthDate',
  'birth date': 'birthDate',
  email: 'email',
  'e-mail': 'email',
  telepon: 'phone',
  telp: 'phone',
  hp: 'phone',
  'no hp': 'phone',
  'no. hp': 'phone',
  whatsapp: 'phone',
  wa: 'phone',
  phone: 'phone',
  alamat: 'address',
  address: 'address',
  status: 'membershipStatus',
  'status keanggotaan': 'membershipStatus',
  membershipstatus: 'membershipStatus',
  'tanggal bergabung': 'joinedAt',
  'tgl bergabung': 'joinedAt',
  joinedat: 'joinedAt',
  'tanggal menikah': 'weddingDate',
  'tgl menikah': 'weddingDate',
  weddingdate: 'weddingDate',
  keluarga: 'householdName',
  'nama keluarga': 'householdName',
  kk: 'householdName',
  householdname: 'householdName',
  hubungan: 'relationship',
  'hubungan keluarga': 'relationship',
  relationship: 'relationship',
  wilayah: 'areaName',
  sektor: 'areaName',
  rayon: 'areaName',
  lingkungan: 'areaName',
  areaname: 'areaName',
  label: 'tags',
  tag: 'tags',
  tags: 'tags',
  catatan: 'notes',
  keterangan: 'notes',
  notes: 'notes',
};

/** A first guess for each column from its header. */
export function guessTarget(
  header: string,
  fields: readonly CustomFieldDefinition[],
): ImportTarget {
  const normalized = header.trim().toLowerCase();
  if (normalized.startsWith('field:')) return normalized as ImportTarget;
  const exact = ALIASES[normalized];
  if (exact) return exact;
  const field = fields.find(
    (definition) => definition.key === normalized || definition.label.toLowerCase() === normalized,
  );
  return field ? `field:${field.key}` : '';
}

/**
 * Builds the rows the API validates. A full name is split before the last word, which keeps a
 * Batak marga or a family name as the last name ("Maria Magdalena Situmorang").
 */
export function mapRows(
  parsed: ParsedCsv,
  targets: readonly ImportTarget[],
): Record<string, string>[] {
  return parsed.rows.map((row) => {
    const result: Record<string, string> = {};
    targets.forEach((target, index) => {
      const value = (row[index] ?? '').trim();
      if (!target || !value) return;
      if (target === 'fullName') {
        const words = value.split(/\s+/);
        if (words.length === 1) result.firstName = value;
        else {
          result.firstName = words.slice(0, -1).join(' ');
          result.lastName = words[words.length - 1] ?? '';
        }
        return;
      }
      result[target] = result[target] ? `${result[target]}; ${value}` : value;
    });
    return result;
  });
}

/** A CSV template with every column the import understands. */
export function templateCsv(fields: readonly CustomFieldDefinition[]): string {
  const header = [...PERSON_CSV_COLUMNS, ...fields.map((field) => `field:${field.key}`)];
  const example = [
    'Budi',
    'Santoso',
    'L',
    '17/08/1985',
    'budi@contoh.id',
    '0812 3456 7890',
    'Jl. Merdeka 10',
    'Anggota',
    '2010-05-02',
    '2012-06-12',
    'Keluarga Santoso',
    'Kepala Keluarga',
    'Wilayah 1',
    'Majelis; Paduan Suara',
    '',
    ...fields.map(() => ''),
  ];
  const quote = (value: string) =>
    /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return `\uFEFF${[header, example].map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
}
