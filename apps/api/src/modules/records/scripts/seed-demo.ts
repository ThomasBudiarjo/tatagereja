/**
 * Demo data for the records module (baptisms, sidi, marriage blessings, child dedications,
 * atestasi, a funeral and a milestone, with one correction and one voided entry) on top of the
 * church created by `scripts/screenshots.ts --seed`. Idempotent: it does nothing when the
 * church already has records.
 *
 *   bun scripts/screenshots.ts --port 3106 --seed --routes /churches
 *   bun apps/api/src/modules/records/scripts/seed-demo.ts --port 3106
 */
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3106')}/api`;
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${json.error?.message ?? ''}`);
  }
  return json;
}

type Ref = { id: string };
type Person = Ref & { firstName: string; lastName: string | null; userId: string | null };

const { token, user } = await api<{ token: string; user: Ref }>('POST', '/auth/login', null, {
  email,
  password,
});
const mine = await api<{ items: { church: Ref }[] }>('GET', '/churches', token);
const churchId = mine.items[0]?.church.id;
if (!churchId) throw new Error('Run scripts/screenshots.ts --seed first');
const at = `/churches/${churchId}`;
const r = `${at}/records`;

const existing = await api<{ total: number }>('GET', `${r}/entries?limit=1`, token);
if (existing.total > 0) {
  console.log('Records demo data already present');
  process.exit(0);
}

const directory = await api<{ items: Person[] }>('GET', `${at}/people?limit=200`, token);
const people = new Map(
  directory.items.map((person) => [`${person.firstName} ${person.lastName ?? ''}`.trim(), person]),
);
const add = async (
  firstName: string,
  lastName: string,
  membershipStatus: string,
  birthDate: string | null,
  gender: 'male' | 'female',
) => {
  const name = `${firstName} ${lastName}`;
  const found = people.get(name);
  if (found) return found;
  const { person } = await api<{ person: Person }>('POST', `${at}/people`, token, {
    firstName,
    lastName,
    membershipStatus,
    birthDate,
    gender,
  });
  people.set(name, person);
  return person;
};

const pdt = await add('Pdt. Samuel', 'Pakpahan', 'member', '1972-04-09', 'male');
const pdt2 = await add('Pdt. Debora', 'Sitompul', 'member', '1980-08-21', 'female');
const andreas = await add('Andreas', 'Wijaya', 'member', '1985-03-14', 'male');
const maria = await add('Maria', 'Simanjuntak', 'member', '1990-10-02', 'female');
const ruth = await add('Ruth', 'Siregar', 'member', '1995-01-30', 'female');
const daniel = await add('Daniel', 'Hutapea', 'visitor', '1994-05-12', 'male');
const ester = await add('Ester', 'Lumbantobing', 'member', '2001-06-19', 'female');
const yohanes = await add('Yohanes', 'Tambunan', 'regular', '1978-10-28', 'male');
const samuel = await add('Samuel', 'Nainggolan', 'member', '1969-11-11', 'male');
const kids = [
  await add('Gabriel', 'Wijaya', 'visitor', '2026-01-17', 'male'),
  await add('Kezia', 'Tambunan', 'visitor', '2025-11-03', 'female'),
  await add('Nathan', 'Hutagalung', 'visitor', '2026-02-22', 'male'),
  await add('Clara', 'Sinaga', 'visitor', '2025-12-30', 'female'),
  await add('Mikha', 'Pardede', 'visitor', '2026-04-11', 'male'),
];
const teens = [
  await add('Timotius', 'Manurung', 'regular', '2009-03-02', 'male'),
  await add('Priskila', 'Siahaan', 'regular', '2009-07-15', 'female'),
  await add('Yosua', 'Panjaitan', 'regular', '2008-12-01', 'male'),
];
const adults = [
  await add('Lukas', 'Gunawan', 'visitor', '1988-02-14', 'male'),
  await add('Hana', 'Kurniawan', 'visitor', '1992-09-09', 'female'),
];
const movers = [
  await add('Paulus', 'Sihombing', 'visitor', '1983-06-06', 'male'),
  await add('Lidia', 'Matondang', 'visitor', '1986-01-25', 'female'),
  await add('Stefanus', 'Halim', 'member', '1975-03-30', 'male'),
];

const name = (person: Person) => `${person.firstName} ${person.lastName ?? ''}`.trim();

await api('PUT', `${r}/settings`, token, {
  numberPatterns: {},
  signatoryName: name(pdt),
  signatoryTitle: 'Ketua Majelis Jemaat',
  certificateFooter: 'Kiranya kasih karunia Tuhan Yesus Kristus menyertai saudara.',
});

type Created = { record: Ref & { number: string } };
const record = (body: Record<string, unknown>) =>
  api<Created>('POST', `${r}/entries`, token, { applyStatusEffect: true, ...body });

const church = 'GKI Kebon Jati';
const fathers = [andreas, yohanes, null, null, daniel];
const mothers = [maria, ester, null, ruth, null];
const baptismDates = ['2026-03-08', '2026-04-05', '2026-05-24', '2026-08-16', '2026-10-11'];
for (const [index, child] of kids.entries()) {
  const father = fathers[index];
  const mother = mothers[index];
  await record({
    type: 'baptism',
    subtype: 'infant',
    date: baptismDates[index],
    place: church,
    officiantPersonId: index % 2 === 0 ? pdt.id : pdt2.id,
    details: { birthPlace: 'Bandung', verse: 'Markus 10:14' },
    people: [
      { personId: child.id, role: 'subject' },
      father
        ? { personId: father.id, role: 'father' }
        : { name: 'Benny Hutagalung', role: 'father' },
      mother ? { personId: mother.id, role: 'mother' } : { name: 'Rina Sinaga', role: 'mother' },
      { name: 'Om Hendrik Simatupang', role: 'godparent' },
    ],
  });
}
await record({
  type: 'baptism',
  subtype: 'adult',
  date: '2026-04-05',
  place: church,
  officiantPersonId: pdt.id,
  details: { birthPlace: 'Medan', birthDate: '1988-02-14', verse: 'Roma 6:4' },
  people: [
    { personId: adults[0]!.id, role: 'subject' },
    { name: 'Bapak Togar', role: 'witness' },
  ],
});
await record({
  type: 'baptism',
  subtype: 'adult',
  date: '2025-12-21',
  place: church,
  officiantPersonId: pdt2.id,
  details: { birthPlace: 'Surabaya', birthDate: '1992-09-09' },
  people: [{ personId: adults[1]!.id, role: 'subject' }],
});
for (const [index, teen] of teens.entries()) {
  await record({
    type: 'sidi',
    date: index < 2 ? '2026-04-05' : '2025-04-20',
    place: church,
    officiantPersonId: pdt.id,
    details: { verse: index === 0 ? 'Yosua 24:15' : 'Mazmur 119:105' },
    people: [{ personId: teen.id, role: 'subject' }],
  });
}
await record({
  type: 'marriage',
  date: '2026-06-20',
  place: church,
  officiantPersonId: pdt.id,
  details: {
    civilRegistrationNumber: '3273-KW-20062026-0012',
    civilRegistrationDate: '2026-06-20',
  },
  people: [
    { personId: daniel.id, role: 'spouse' },
    { personId: ruth.id, role: 'spouse' },
    { name: 'Robert Hutapea', role: 'witness' },
    { name: 'Sarah Siregar', role: 'witness' },
  ],
});
await record({
  type: 'marriage',
  date: '2026-03-14',
  place: 'GKI Kebon Jati, Gedung Serbaguna',
  officiantPersonId: pdt2.id,
  people: [
    { personId: movers[0]!.id, role: 'spouse' },
    { personId: movers[1]!.id, role: 'spouse' },
    { name: 'Markus Sihombing', role: 'witness' },
    { name: 'Yanti Matondang', role: 'witness' },
  ],
});
await record({
  type: 'child_dedication',
  date: '2026-07-12',
  place: church,
  officiantPersonId: pdt2.id,
  details: { birthPlace: 'Bandung', birthDate: '2026-04-11', verse: '1 Samuel 1:27-28' },
  people: [
    { name: 'Abigail Purba', role: 'subject' },
    { name: 'Rudi Purba', role: 'father' },
    { name: 'Nia Purba', role: 'mother' },
  ],
});
await record({
  type: 'transfer_in',
  date: '2026-02-01',
  place: church,
  details: {
    otherChurchName: 'HKBP Menteng',
    otherChurchAddress: 'Jl. Jambu No. 46, Jakarta Pusat',
    letterNumber: '045/AT/HKBP-M/I/2026',
    letterDate: '2026-01-15',
  },
  people: [{ personId: movers[0]!.id, role: 'subject' }],
});
await record({
  type: 'transfer_in',
  date: '2026-02-01',
  place: church,
  details: { otherChurchName: 'GPIB Immanuel Jakarta', letterNumber: '112/GPIB-IMM/2026' },
  people: [{ personId: movers[1]!.id, role: 'subject' }],
});
await record({
  type: 'transfer_out',
  date: '2026-09-07',
  place: church,
  details: {
    otherChurchName: 'GKI Pondok Indah',
    otherChurchAddress: 'Jl. Metro Pondok Indah, Jakarta Selatan',
    letterNumber: 'AK/2026/001',
  },
  people: [{ personId: movers[2]!.id, role: 'subject' }],
});
await record({
  type: 'death',
  date: '2026-08-02',
  place: 'RS Immanuel Bandung',
  details: {
    funeralDate: '2026-08-04',
    burialPlace: 'TPU Pandu, Bandung',
    causeOfDeath: 'Sakit jantung',
  },
  people: [
    { personId: samuel.id, role: 'subject' },
    { name: 'Ny. Rosmawati Nainggolan', role: 'other' },
  ],
});
await record({
  type: 'custom',
  subtype: 'Peneguhan Penatua',
  date: '2026-01-11',
  place: church,
  officiantPersonId: pdt.id,
  people: [{ personId: yohanes.id, role: 'subject' }],
});

// One wrong entry that was voided, and one correction, so the history has something to show.
const wrong = await record({
  type: 'sidi',
  date: '2026-04-05',
  place: church,
  people: [{ name: 'Priskila Siahan', role: 'subject' }],
  applyStatusEffect: false,
});
await api('POST', `${r}/entries/${wrong.record.id}/void`, token, {
  reason: 'Dicatat dobel; nama salah eja. Lihat catatan Priskila Siahaan.',
});
const list = await api<{ items: (Ref & { number: string })[] }>(
  'GET',
  `${r}/entries?type=baptism&year=2026&sort=number&limit=1`,
  token,
);
const latest = list.items[0];
if (latest) {
  const detail = await api<{ record: Record<string, unknown> & { people: unknown[] } }>(
    'GET',
    `${r}/entries/${latest.id}`,
    token,
  );
  const current = detail.record as Record<string, unknown> & {
    details: Record<string, unknown>;
    people: { personId: string | null; name: string; role: string }[];
  };
  await api('PUT', `${r}/entries/${latest.id}`, token, {
    record: {
      type: current.type,
      subtype: current.subtype,
      date: current.date,
      place: current.place,
      officiantPersonId: current.officiantPersonId,
      officiantName: current.officiantName,
      details: { ...current.details, birthPlace: 'Cimahi' },
      documentUrl: 'https://drive.google.com/file/d/contoh-surat-baptis',
      notes: current.notes,
      people: current.people.map((person) => ({
        personId: person.personId,
        name: person.name,
        role: person.role,
      })),
    },
    correctionNote: 'Tempat lahir diperbaiki sesuai akta kelahiran.',
  });
}

// The demo account is Maria: link it to her profile so "My records" has content.
if (!maria.userId) {
  await api('PUT', `${at}/people/${maria.id}/user`, token, { userId: user.id }).catch(() => null);
}

console.log('Records demo data created');

export {};
