/**
 * Demo data for the people module (areas, households, tags, custom fields, groups and join
 * requests) on top of the church created by `scripts/screenshots.ts --seed`. Idempotent: it does
 * nothing when the church already has areas.
 *
 *   bun scripts/screenshots.ts --port 3101 --seed --routes /churches
 *   bun apps/api/src/modules/people/scripts/seed-demo.ts --port 3101
 */
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3101')}/api`;
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

const { token } = await api<{ token: string }>('POST', '/auth/login', null, { email, password });
const mine = await api<{ items: { church: Ref }[] }>('GET', '/churches', token);
const churchId = mine.items[0]?.church.id;
if (!churchId) throw new Error('Run scripts/screenshots.ts --seed first');
const at = `/churches/${churchId}`;

const existing = await api<{ items: Ref[] }>('GET', `${at}/areas`, token);
if (existing.items.length > 0) {
  console.log('People demo data already present');
  process.exit(0);
}

const area = async (name: string, code: string, color: string, description: string) =>
  (await api<{ area: Ref }>('POST', `${at}/areas`, token, { name, code, color, description })).area;
const kebonJati = await area(
  'Wilayah 1 Kebon Jati',
  'W-01',
  '#2f7d6d',
  'Kebon Jati dan Pasir Kaliki',
);
const cicendo = await area('Wilayah 2 Cicendo', 'W-02', '#3f6fb5', 'Cicendo, Arjuna dan Pajajaran');
const sukajadi = await area('Wilayah 3 Sukajadi', 'W-03', '#a2652d', 'Sukajadi dan Setiabudi');
await area('Sektor Pelayanan Cimahi', 'S-04', '#7a4fa3', 'Pos pelayanan Cimahi');

const tag = async (name: string, color: string) =>
  (await api<{ tag: Ref }>('POST', `${at}/directory/tags`, token, { name, color })).tag;
const majelis = await tag('Majelis', '#b4502f');
const pemusik = await tag('Pemusik', '#3f6fb5');
const guruSm = await tag('Guru Sekolah Minggu', '#2f7d6d');
const jemaatBaru = await tag('Jemaat baru', '#c0912a');

const field = async (body: Record<string, unknown>) =>
  (await api<{ field: Ref }>('POST', `${at}/directory/fields`, token, body)).field;
const pekerjaan = await field({ key: 'pekerjaan', label: 'Pekerjaan', type: 'text' });
const golDarah = await field({
  key: 'golongan_darah',
  label: 'Golongan darah',
  type: 'select',
  options: ['A', 'B', 'AB', 'O'],
  isPrivate: true,
});
const sidi = await field({ key: 'sudah_sidi', label: 'Sudah sidi', type: 'checkbox' });
await field({ key: 'tahun_baptis', label: 'Tahun baptis', type: 'number' });

type PersonSeed = {
  firstName: string;
  lastName?: string;
  gender: 'male' | 'female';
  birthDate?: string;
  weddingDate?: string;
  membershipStatus?: 'visitor' | 'regular' | 'member' | 'inactive';
  joinedAt?: string;
  job?: string;
};

const createPerson = async (seed: PersonSeed) => {
  const { job, ...input } = seed;
  const slug = `${seed.firstName}.${seed.lastName ?? ''}`.toLowerCase().replace(/[^a-z.]/g, '');
  const { person } = await api<{ person: Ref }>('POST', `${at}/people`, token, {
    membershipStatus: 'member',
    phone: `0812-${String(1000 + Math.floor(Math.random() * 8999))}-${String(1000 + Math.floor(Math.random() * 8999))}`,
    email: `${slug}@example.com`,
    ...input,
  });
  if (job) {
    await api('PUT', `${at}/people/${person.id}/fields`, token, {
      values: { [pekerjaan.id]: job, [sidi.id]: 'true', [golDarah.id]: 'O' },
    });
  }
  return person;
};

const today = new Date();
const ymd = (offsetDays: number, year: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

type FamilySeed = {
  name: string;
  areaId: string;
  address: string;
  phone: string;
  members: (PersonSeed & {
    relationship: 'head' | 'spouse' | 'child' | 'parent' | 'relative' | 'other';
  })[];
  tags?: Record<number, string[]>;
};

const families: FamilySeed[] = [
  {
    name: 'Keluarga Sitompul',
    areaId: kebonJati.id,
    address: 'Jl. Kebon Jati No. 12',
    phone: '022-4201122',
    members: [
      {
        firstName: 'Bonar',
        lastName: 'Sitompul',
        gender: 'male',
        birthDate: ymd(2, 1972),
        weddingDate: ymd(5, 1998),
        relationship: 'head',
        joinedAt: '1999-04-11',
        job: 'Dosen',
      },
      {
        firstName: 'Lena',
        lastName: 'Sitompul',
        gender: 'female',
        birthDate: '1975-08-21',
        weddingDate: ymd(5, 1998),
        relationship: 'spouse',
        job: 'Guru',
      },
      {
        firstName: 'Grace',
        lastName: 'Sitompul',
        gender: 'female',
        birthDate: '2004-02-14',
        relationship: 'child',
        job: 'Mahasiswa',
      },
      {
        firstName: 'Kevin',
        lastName: 'Sitompul',
        gender: 'male',
        birthDate: '2012-11-03',
        relationship: 'child',
      },
    ],
    tags: { 0: [majelis.id], 1: [guruSm.id] },
  },
  {
    name: 'Keluarga Wibowo',
    areaId: cicendo.id,
    address: 'Jl. Arjuna No. 45',
    phone: '022-6012345',
    members: [
      {
        firstName: 'Hendra',
        lastName: 'Wibowo',
        gender: 'male',
        birthDate: '1968-05-09',
        weddingDate: '1994-06-18',
        relationship: 'head',
        job: 'Wiraswasta',
      },
      {
        firstName: 'Sri',
        lastName: 'Wibowo',
        gender: 'female',
        birthDate: ymd(0, 1970),
        weddingDate: '1994-06-18',
        relationship: 'spouse',
        job: 'Apoteker',
      },
      {
        firstName: 'Oma Lien',
        lastName: 'Tan',
        gender: 'female',
        birthDate: '1941-01-25',
        relationship: 'parent',
      },
    ],
    tags: { 0: [majelis.id, pemusik.id] },
  },
  {
    name: 'Keluarga Pardede',
    areaId: sukajadi.id,
    address: 'Jl. Sukajadi No. 210',
    phone: '022-2031987',
    members: [
      {
        firstName: 'Togar',
        lastName: 'Pardede',
        gender: 'male',
        birthDate: '1983-12-01',
        weddingDate: ymd(12, 2010),
        relationship: 'head',
        job: 'Insinyur sipil',
      },
      {
        firstName: 'Debora',
        lastName: 'Pardede',
        gender: 'female',
        birthDate: '1986-07-07',
        weddingDate: ymd(12, 2010),
        relationship: 'spouse',
        job: 'Perawat',
      },
      {
        firstName: 'Naomi',
        lastName: 'Pardede',
        gender: 'female',
        birthDate: '2015-03-30',
        relationship: 'child',
      },
    ],
    tags: { 1: [pemusik.id] },
  },
  {
    name: 'Keluarga Kurniawan',
    areaId: kebonJati.id,
    address: 'Jl. Pasir Kaliki No. 88',
    phone: '022-4234567',
    members: [
      {
        firstName: 'Yosua',
        lastName: 'Kurniawan',
        gender: 'male',
        birthDate: '1992-09-17',
        relationship: 'head',
        membershipStatus: 'regular',
        job: 'Desainer grafis',
      },
      {
        firstName: 'Natalia',
        lastName: 'Kurniawan',
        gender: 'female',
        birthDate: ymd(4, 1994),
        relationship: 'spouse',
        membershipStatus: 'visitor',
      },
    ],
    tags: { 0: [jemaatBaru.id], 1: [jemaatBaru.id] },
  },
];

const people: Record<string, Ref> = {};
for (const family of families) {
  const ids: Ref[] = [];
  for (const member of family.members) {
    const { relationship: _relationship, ...seed } = member;
    const person = await createPerson(seed);
    people[member.firstName] = person;
    ids.push(person);
  }
  await api('POST', `${at}/households`, token, {
    name: family.name,
    areaId: family.areaId,
    address: family.address,
    city: 'Bandung',
    phone: family.phone,
    members: family.members.map((member, index) => ({
      personId: ids[index]!.id,
      relationship: member.relationship,
      isPrimaryContact: index === 0,
    })),
  });
  for (const [index, tagIds] of Object.entries(family.tags ?? {})) {
    await api('PUT', `${at}/people/${ids[Number(index)]!.id}/tags`, token, { tagIds });
  }
}

// Singles living on their own, plus the people the screenshot seed created.
for (const seed of [
  {
    firstName: 'Agnes',
    lastName: 'Halim',
    gender: 'female',
    birthDate: '1999-04-02',
    job: 'Akuntan',
  },
  {
    firstName: 'Benyamin',
    lastName: 'Saragih',
    gender: 'male',
    birthDate: ymd(1, 1988),
    job: 'Dokter',
  },
  {
    firstName: 'Christina',
    lastName: 'Gultom',
    gender: 'female',
    birthDate: '1957-10-10',
    membershipStatus: 'inactive',
  },
  { firstName: 'Fransiskus', lastName: 'Manurung', gender: 'male', membershipStatus: 'visitor' },
] satisfies PersonSeed[]) {
  people[seed.firstName] = await createPerson(seed);
}
await api('POST', `${at}/areas/${cicendo.id}/assign`, token, {
  personIds: [people.Agnes!.id, people.Benyamin!.id],
});
await api('PUT', `${at}/people/${people.Agnes!.id}/privacy`, token, {
  showPhone: false,
  showEmail: false,
  showAddress: false,
  showBirthday: false,
});
await api('PUT', `${at}/people/${people.Benyamin!.id}/tags`, token, { tagIds: [pemusik.id] });

// A likely duplicate for the duplicate finder.
await api('POST', `${at}/people`, token, {
  firstName: 'Bonar',
  lastName: 'Sitompul',
  gender: 'male',
  membershipStatus: 'visitor',
  email: 'bonar.sitompul@example.com',
});

// Groups: upgrade the screenshot seed's groups and add a few more.
const groups = await api<{ items: (Ref & { name: string })[] }>('GET', `${at}/groups`, token);
const pemuda = groups.items.find((group) => group.name === 'Komisi Pemuda');
const choir = groups.items.find((group) => group.name === 'Paduan Suara Efrata');
if (pemuda) {
  await api('PATCH', `${at}/groups/${pemuda.id}`, token, {
    name: 'Komisi Pemuda',
    type: 'komisi',
    description: 'Persekutuan dan pembinaan pemuda usia 18–30 tahun.',
    meetingDay: 6,
    meetingTime: '18:00',
    meetingFrequency: 'weekly',
    location: 'Ruang Serbaguna Lt. 2',
    capacity: 60,
    coverColor: '#b4502f',
    visibility: 'public',
    joinPolicy: 'request',
  });
  await api('POST', `${at}/groups/${pemuda.id}/members`, token, {
    personIds: [people.Grace!.id, people.Yosua!.id, people.Agnes!.id, people.Natalia!.id],
  });
}
if (choir) {
  await api('PATCH', `${at}/groups/${choir.id}`, token, {
    name: 'Paduan Suara Efrata',
    type: 'choir',
    description: 'Paduan suara jemaat untuk Ibadah Minggu dan hari raya gerejawi.',
    meetingDay: 4,
    meetingTime: '19:00',
    meetingFrequency: 'weekly',
    location: 'Ruang Musik',
    capacity: 40,
    coverColor: '#3f6fb5',
    visibility: 'public',
    joinPolicy: 'request',
  });
  await api('POST', `${at}/groups/${choir.id}/members`, token, {
    personIds: [people.Lena!.id, people.Hendra!.id, people.Debora!.id, people.Benyamin!.id],
  });
}
const extraGroups = [
  {
    name: 'PA Wilayah Kebon Jati',
    type: 'small_group',
    description: 'Pemahaman Alkitab rumah ke rumah.',
    meetingDay: 3,
    meetingTime: '19:30',
    meetingFrequency: 'biweekly',
    location: 'Bergiliran di rumah jemaat',
    coverColor: '#2f7d6d',
    members: [people.Bonar!.id, people.Lena!.id, people.Yosua!.id],
  },
  {
    name: 'Komisi Anak / Sekolah Minggu',
    type: 'komisi',
    description: 'Pelayanan anak usia 3–12 tahun.',
    meetingDay: 0,
    meetingTime: '07:00',
    meetingFrequency: 'weekly',
    location: 'Gedung Sekolah Minggu',
    coverColor: '#c0912a',
    members: [people.Kevin!.id, people.Naomi!.id, people.Lena!.id],
  },
  {
    name: 'Panitia Natal 2026',
    type: 'committee',
    description: 'Persiapan Ibadah dan perayaan Natal.',
    meetingFrequency: 'irregular',
    coverColor: '#7a4fa3',
    visibility: 'private',
    joinPolicy: 'closed',
    members: [people.Togar!.id, people.Sri!.id],
  },
];
for (const { members, ...body } of extraGroups) {
  const { group } = await api<{ group: Ref }>('POST', `${at}/groups`, token, body);
  await api('POST', `${at}/groups/${group.id}/members`, token, { personIds: members });
}

// A member account that asks to join the choir.
const { invitation } = await api<{ invitation: { token: string } }>(
  'POST',
  `${at}/invitations`,
  token,
  { expiresInDays: 7 },
);
const joiner = await api<{ token: string; user: Ref }>('POST', '/auth/register', null, {
  name: 'Ruth Siregar',
  email: 'ruth.siregar@example.com',
  password: 'demo-password',
});
await api('POST', `/invitations/${invitation.token}/accept`, joiner.token);
const directory = await api<{ items: (Ref & { firstName: string })[] }>(
  'GET',
  `${at}/people?q=Ruth`,
  token,
);
const ruth = directory.items.find((person) => person.firstName === 'Ruth');
if (ruth) {
  await api('PUT', `${at}/people/${ruth.id}/user`, token, { userId: joiner.user.id });
  if (choir) {
    await api('POST', `${at}/groups/${choir.id}/join-requests`, joiner.token, {
      message: 'Saya dulu ikut paduan suara di GKI Pasirkaliki, ingin bergabung lagi.',
    });
  }
}

console.log(`Seeded people demo data for church ${churchId}`);

export {};
