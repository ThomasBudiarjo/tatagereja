/**
 * A complete demo church for demos, walkthroughs and visual review, created through the public
 * API of a running server only (so every permission, audit and notification rule applies).
 *
 *   WEB_DIST_DIR=$PWD/apps/web/dist PORT=3950 DATABASE_PATH=/tmp/demo.db bun run --cwd apps/api start &
 *   bun scripts/seed-demo.ts --port 3950
 *   bun scripts/screenshots.ts --port 3950 --email jemaat@tatagereja.test
 *
 * GKI Kebon Jati, Bandung: about sixty people in households and four areas (a few of them through
 * the CSV import), komisi and small groups with leaders, a worship calendar with liturgy, rosters
 * and replies, events with RSVPs and registrations, announcements and two Warta Jemaat issues,
 * pastoral care and prayer requests, church records, Sekolah Minggu classes with past and open
 * check-in sessions, ten Sundays of counted offerings with giving, expenses, a budget and a
 * campaign, rooms with bookings, inventory with loans, and half a year of attendance.
 *
 * Every account uses the password `demo-password`:
 *
 *   demo@tatagereja.test       Maria Simanjuntak, owner (and a mother of three Sekolah Minggu children)
 *   admin@tatagereja.test      Yohanes Tambunan, administrator and Sekretaris
 *   bendahara@tatagereja.test  Ester Lumbantobing, member with the Bendahara role (counts and records)
 *   penatua@tatagereja.test    Pnt. Bonar Sitompul, member with the Majelis / Penatua role (verifies)
 *   pendeta@tatagereja.test    Pdt. Imanuel Pakpahan, member with the Pendeta role
 *   guru@tatagereja.test       Ruth Siregar, member with the Guru Sekolah Minggu role
 *   jemaat@tatagereja.test     Andreas Wijaya, plain member with two children
 *
 * Options: --port <n> (default 3950) or --base <url>, and --password <secret>. The server must
 * accept public registration. Run it once per database: it stops when the demo owner already has
 * a church. Dates are relative to today, in the church time zone (Asia/Jakarta).
 */
export {};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `${option('base', `http://localhost:${option('port', '3950')}`).replace(/\/$/, '')}/api`;
const password = option('password', 'demo-password');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose API payloads in a dev script
type Json = Record<string, any>;

async function api<T = Json>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${json.error?.message ?? ''}`);
  }
  return json;
}

/** Runs an optional part of the seed; a failure is reported and the rest carries on. */
async function optional(label: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.warn(`  skipped ${label}: ${(error as Error).message}`);
  }
}

// ---- Dates in Asia/Jakarta (UTC+7) ---------------------------------------------------------------

const JAKARTA = 7 * 60 * 60 * 1000;
/** A calendar day relative to today in Jakarta, as YYYY-MM-DD. */
const day = (offset: number) => {
  const date = new Date(Date.now() + JAKARTA);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
/** An instant on a Jakarta wall clock: `at(0, '18:30')` is today at 18:30 WIB. */
const at = (offset: number, time: string) =>
  new Date(`${day(offset)}T${time}:00+07:00`).toISOString();
const plus = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
const weekday = new Date(`${day(0)}T00:00:00Z`).getUTCDay();
/** Days until the coming Sunday (0 on a Sunday). */
const toSunday = (7 - weekday) % 7;
/** The Sunday `weeks` before the last one (0 is the most recent Sunday, today on a Sunday). */
const pastSunday = (weeks: number) => day(-weekday - weeks * 7);
/** A Jakarta wall-clock time on that Sunday, or on a day `shift` days from it. */
const sundayAt = (weeks: number, time: string, shift = 0) => at(-weekday - weeks * 7 + shift, time);
const year = Number(day(0).slice(0, 4));
/** A birth date for someone `age` years old, on a fixed month and day. */
const born = (age: number, monthDay = '03-14') => `${year - age}-${monthDay}`;
/** Month and day `offset` days from today, for birthdays and anniversaries this week. */
const md = (offset: number) => day(offset).slice(5);
const monthsAgo = (months: number, dayOfMonth = 10) => {
  const date = new Date(Date.now() + JAKARTA);
  date.setUTCMonth(date.getUTCMonth() - months, dayOfMonth);
  return date.toISOString().slice(0, 10);
};

// ---- Owner and church ----------------------------------------------------------------------------

type Account = { token: string; user: { id: string; name: string; email: string } };

async function account(name: string, email: string): Promise<Account> {
  try {
    return await api<Account>('/auth/login', { body: { email, password } });
  } catch {
    return api<Account>('/auth/register', { body: { name, email, password } });
  }
}

console.info(`Seeding ${base}`);
const owner = await account('Maria Simanjuntak', 'demo@tatagereja.test');
const token = owner.token;
const mine = await api<{ items: { church: { id: string } }[] }>('/churches', { token });
if (mine.items.length > 0) {
  console.info('The demo owner already has a church; nothing to do.');
  process.exit(0);
}

const { church } = await api<{ church: { id: string } }>('/churches', {
  token,
  body: {
    name: 'GKI Kebon Jati',
    description: 'Bertumbuh bersama dalam kasih Kristus, melayani kota Bandung.',
    address: 'Jl. Kebon Jati No. 100',
    city: 'Bandung',
    phone: '022-4231234',
    email: 'sekretariat@gkikebonjati.or.id',
    website: 'https://gkikebonjati.or.id',
    brandColor: '#b4502f',
  },
});
const churchId = church.id;
const c = `/churches/${churchId}`;
console.info(`  church ${churchId}`);

// ---- Areas, tags and custom fields ---------------------------------------------------------------

const area = async (name: string, code: string, color: string, description: string) =>
  (
    await api<{ area: { id: string } }>(`${c}/areas`, {
      token,
      body: { name, code, color, description },
    })
  ).area.id;
const areas = {
  kebonJati: await area('Wilayah 1 Kebon Jati', 'W-01', '#2f7d6d', 'Kebon Jati dan Pasir Kaliki'),
  cicendo: await area('Wilayah 2 Cicendo', 'W-02', '#3f6fb5', 'Cicendo, Arjuna dan Pajajaran'),
  sukajadi: await area('Wilayah 3 Sukajadi', 'W-03', '#a2652d', 'Sukajadi dan Setiabudi'),
  cimahi: await area('Sektor Pelayanan Cimahi', 'S-04', '#7a4fa3', 'Pos pelayanan Cimahi'),
};
const tag = async (name: string, color: string) =>
  (await api<{ tag: { id: string } }>(`${c}/directory/tags`, { token, body: { name, color } })).tag
    .id;
const tags = {
  majelis: await tag('Majelis', '#b4502f'),
  pemusik: await tag('Pemusik', '#3f6fb5'),
  guruSm: await tag('Guru Sekolah Minggu', '#2f7d6d'),
  jemaatBaru: await tag('Jemaat baru', '#c0912a'),
};
const field = async (body: Json) =>
  (await api<{ field: { id: string } }>(`${c}/directory/fields`, { token, body })).field.id;
const fields = {
  job: await field({ key: 'pekerjaan', label: 'Pekerjaan', type: 'text' }),
  sidi: await field({ key: 'sudah_sidi', label: 'Sudah sidi', type: 'checkbox' }),
  blood: await field({
    key: 'golongan_darah',
    label: 'Golongan darah',
    type: 'select',
    options: ['A', 'B', 'AB', 'O'],
    isPrivate: true,
  }),
};

// ---- People and households -----------------------------------------------------------------------

type Relationship = 'head' | 'spouse' | 'child' | 'parent' | 'relative' | 'other';
type Status = 'visitor' | 'regular' | 'member' | 'inactive';
type PersonSeed = {
  firstName: string;
  lastName?: string;
  gender: 'male' | 'female';
  birthDate?: string;
  weddingDate?: string;
  status?: Status;
  joinedAt?: string;
  job?: string;
  tags?: string[];
  rel?: Relationship;
};

const people = new Map<string, string>();
/** A person's id by "First Last" (or a unique first name). */
const person = (name: string) => {
  const id =
    people.get(name) ??
    [...people.entries()].find(([full]) => full.split(' ')[0] === name)?.[1] ??
    null;
  if (!id) throw new Error(`No person ${name}`);
  return id;
};
let phoneSerial = 1100;
const phone = () => {
  phoneSerial += 137;
  return `0812-${String(2000 + (phoneSerial % 7000)).padStart(4, '0')}-${String(phoneSerial).slice(-4).padStart(4, '0')}`;
};

const createPerson = async (seed: PersonSeed, extra: Json = {}) => {
  const slug = `${seed.firstName}.${seed.lastName ?? ''}`
    .toLowerCase()
    .replace(/[^a-z.]/g, '')
    .replace(/\.$/, '');
  const isChild = !!seed.birthDate && year - Number(seed.birthDate.slice(0, 4)) < 15;
  const { person: created } = await api<{ person: { id: string } }>(`${c}/people`, {
    token,
    body: {
      firstName: seed.firstName,
      lastName: seed.lastName ?? null,
      gender: seed.gender,
      birthDate: seed.birthDate ?? null,
      weddingDate: seed.weddingDate ?? null,
      membershipStatus: seed.status ?? 'member',
      // Long-standing members joined years ago; children count from their birth.
      joinedAt:
        seed.joinedAt ??
        (seed.status === 'visitor'
          ? null
          : isChild
            ? seed.birthDate
            : `${Math.min(
                year - 1,
                Math.max(
                  1996 + (phoneSerial % 27),
                  Number(seed.birthDate?.slice(0, 4) ?? 1980) + 17,
                ),
              )}-${String(1 + (phoneSerial % 12)).padStart(2, '0')}-15`),
      phone: isChild ? null : phone(),
      email: isChild ? null : `${slug}@example.com`,
      ...extra,
    },
  });
  people.set(`${seed.firstName} ${seed.lastName ?? ''}`.trim(), created.id);
  if (seed.job || !isChild) {
    await api(`${c}/people/${created.id}/fields`, {
      method: 'PUT',
      token,
      body: {
        values: {
          ...(seed.job ? { [fields.job]: seed.job } : {}),
          [fields.sidi]: 'true',
          [fields.blood]: ['A', 'B', 'O', 'AB'][phoneSerial % 4]!,
        },
      },
    });
  }
  if (seed.tags?.length) {
    await api(`${c}/people/${created.id}/tags`, {
      method: 'PUT',
      token,
      body: { tagIds: seed.tags },
    });
  }
  return created.id;
};

type FamilySeed = { name: string; area: string; address: string; members: PersonSeed[] };
const families: FamilySeed[] = [
  {
    name: 'Keluarga Simanjuntak',
    area: areas.kebonJati,
    address: 'Jl. Kebon Jati No. 21',
    members: [
      {
        firstName: 'Robert',
        lastName: 'Simanjuntak',
        gender: 'male',
        birthDate: '1986-05-22',
        weddingDate: '2014-07-12',
        rel: 'head',
        job: 'Arsitek',
        joinedAt: '2014-08-01',
      },
      {
        firstName: 'Maria',
        lastName: 'Simanjuntak',
        gender: 'female',
        birthDate: '1990-10-02',
        weddingDate: '2014-07-12',
        rel: 'spouse',
        job: 'Dokter gigi',
        tags: [tags.pemusik],
        joinedAt: '2014-08-01',
      },
      {
        firstName: 'Kezia',
        lastName: 'Simanjuntak',
        gender: 'female',
        birthDate: born(9, '02-11'),
        rel: 'child',
      },
      {
        firstName: 'Yosua',
        lastName: 'Simanjuntak',
        gender: 'male',
        birthDate: born(6, '06-03'),
        rel: 'child',
      },
      {
        firstName: 'Grace',
        lastName: 'Simanjuntak',
        gender: 'female',
        birthDate: born(3, '09-19'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Wijaya',
    area: areas.cicendo,
    address: 'Jl. Arjuna No. 45',
    members: [
      {
        firstName: 'Andreas',
        lastName: 'Wijaya',
        gender: 'male',
        birthDate: '1985-03-14',
        weddingDate: '2016-11-05',
        rel: 'head',
        job: 'Wiraswasta',
      },
      {
        firstName: 'Lidya',
        lastName: 'Wijaya',
        gender: 'female',
        birthDate: '1988-12-09',
        weddingDate: '2016-11-05',
        rel: 'spouse',
        job: 'Guru SD',
      },
      {
        firstName: 'Michelle',
        lastName: 'Wijaya',
        gender: 'female',
        birthDate: born(7, '04-27'),
        rel: 'child',
      },
      {
        firstName: 'Kevin',
        lastName: 'Wijaya',
        gender: 'male',
        birthDate: born(5, '08-15'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Tambunan',
    area: areas.kebonJati,
    address: 'Jl. Pasir Kaliki No. 88',
    members: [
      {
        firstName: 'Yohanes',
        lastName: 'Tambunan',
        gender: 'male',
        birthDate: '1978-10-28',
        weddingDate: '2010-01-16',
        rel: 'head',
        job: 'Pegawai negeri',
        tags: [tags.majelis],
      },
      {
        firstName: 'Sarah',
        lastName: 'Tambunan',
        gender: 'female',
        birthDate: '1981-02-02',
        weddingDate: '2010-01-16',
        rel: 'spouse',
        job: 'Perawat',
        tags: [tags.guruSm],
      },
      {
        firstName: 'Abigail',
        lastName: 'Tambunan',
        gender: 'female',
        birthDate: born(13, '05-05'),
        rel: 'child',
      },
      {
        firstName: 'Samuel',
        lastName: 'Tambunan',
        gender: 'male',
        birthDate: born(11, '01-20'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Lumbantobing',
    area: areas.sukajadi,
    address: 'Jl. Sukajadi No. 210',
    members: [
      {
        firstName: 'Hotman',
        lastName: 'Lumbantobing',
        gender: 'male',
        birthDate: '1980-04-18',
        weddingDate: '2008-06-21',
        rel: 'head',
        job: 'Insinyur sipil',
      },
      {
        firstName: 'Ester',
        lastName: 'Lumbantobing',
        gender: 'female',
        birthDate: '1984-06-19',
        weddingDate: '2008-06-21',
        rel: 'spouse',
        job: 'Akuntan',
      },
      {
        firstName: 'Jonathan',
        lastName: 'Lumbantobing',
        gender: 'male',
        birthDate: born(16, '11-30'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Siregar',
    area: areas.cicendo,
    address: 'Jl. Pajajaran No. 17',
    members: [
      {
        firstName: 'Markus',
        lastName: 'Siregar',
        gender: 'male',
        birthDate: '1992-08-08',
        weddingDate: '2021-09-25',
        rel: 'head',
        job: 'Programmer',
      },
      {
        firstName: 'Ruth',
        lastName: 'Siregar',
        gender: 'female',
        birthDate: '1995-01-30',
        weddingDate: '2021-09-25',
        rel: 'spouse',
        job: 'Guru TK',
        tags: [tags.guruSm],
      },
      {
        firstName: 'Hana',
        lastName: 'Siregar',
        gender: 'female',
        birthDate: born(2, '07-07'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Sitompul',
    area: areas.kebonJati,
    address: 'Jl. Kebon Jati No. 12',
    members: [
      {
        firstName: 'Bonar',
        lastName: 'Sitompul',
        gender: 'male',
        birthDate: `1972-${md(2)}`,
        weddingDate: '1998-05-09',
        rel: 'head',
        job: 'Dosen',
        tags: [tags.majelis],
        joinedAt: '1999-04-11',
      },
      {
        firstName: 'Lena',
        lastName: 'Sitompul',
        gender: 'female',
        birthDate: '1975-08-21',
        weddingDate: '1998-05-09',
        rel: 'spouse',
        job: 'Guru',
        tags: [tags.guruSm],
      },
      {
        firstName: 'Natalia',
        lastName: 'Sitompul',
        gender: 'female',
        birthDate: '2004-02-14',
        rel: 'child',
        job: 'Mahasiswa',
      },
      {
        firstName: 'Daniel',
        lastName: 'Sitompul',
        gender: 'male',
        birthDate: born(14, '11-03'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Wibowo',
    area: areas.cicendo,
    address: 'Jl. Cicendo No. 9',
    members: [
      {
        firstName: 'Hendra',
        lastName: 'Wibowo',
        gender: 'male',
        birthDate: '1968-05-09',
        weddingDate: '1994-06-18',
        rel: 'head',
        job: 'Wiraswasta',
        tags: [tags.majelis, tags.pemusik],
      },
      {
        firstName: 'Sri',
        lastName: 'Wibowo',
        gender: 'female',
        birthDate: `1970-${md(0)}`,
        weddingDate: '1994-06-18',
        rel: 'spouse',
        job: 'Apoteker',
      },
      {
        firstName: 'Lien',
        lastName: 'Tan',
        gender: 'female',
        birthDate: '1941-01-25',
        rel: 'parent',
      },
    ],
  },
  {
    name: 'Keluarga Pardede',
    area: areas.sukajadi,
    address: 'Jl. Setiabudi No. 140',
    members: [
      {
        firstName: 'Togar',
        lastName: 'Pardede',
        gender: 'male',
        birthDate: '1983-12-01',
        weddingDate: `2010-${md(toSunday + 2)}`,
        rel: 'head',
        job: 'Kontraktor',
      },
      {
        firstName: 'Debora',
        lastName: 'Pardede',
        gender: 'female',
        birthDate: '1986-07-07',
        weddingDate: `2010-${md(toSunday + 2)}`,
        rel: 'spouse',
        job: 'Bidan',
        tags: [tags.pemusik],
      },
      {
        firstName: 'Naomi',
        lastName: 'Pardede',
        gender: 'female',
        birthDate: born(11, '03-30'),
        rel: 'child',
      },
      {
        firstName: 'Mikha',
        lastName: 'Pardede',
        gender: 'male',
        birthDate: `${year}-04-11`,
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Nainggolan',
    area: areas.sukajadi,
    address: 'Jl. Cihampelas No. 12',
    members: [
      {
        firstName: 'Samuel',
        lastName: 'Nainggolan',
        gender: 'male',
        birthDate: '1969-11-11',
        weddingDate: '1995-02-18',
        rel: 'head',
        job: 'Pensiunan BUMN',
        tags: [tags.majelis],
      },
      {
        firstName: 'Rosmawati',
        lastName: 'Nainggolan',
        gender: 'female',
        birthDate: '1971-09-03',
        weddingDate: '1995-02-18',
        rel: 'spouse',
      },
      {
        firstName: 'Timotius',
        lastName: 'Nainggolan',
        gender: 'male',
        birthDate: born(14, '01-09'),
        rel: 'child',
      },
      {
        firstName: 'Priskila',
        lastName: 'Nainggolan',
        gender: 'female',
        birthDate: born(5, '10-10'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Hutapea',
    area: areas.kebonJati,
    address: 'Jl. Kebon Kawung No. 3',
    members: [
      {
        firstName: 'Daniel',
        lastName: 'Hutapea',
        gender: 'male',
        birthDate: '1990-05-12',
        weddingDate: '2017-04-22',
        rel: 'head',
        job: 'Pegawai bank',
      },
      {
        firstName: 'Rina',
        lastName: 'Hutapea',
        gender: 'female',
        birthDate: '1992-03-03',
        weddingDate: '2017-04-22',
        rel: 'spouse',
        job: 'Desainer',
      },
      {
        firstName: 'Lukas',
        lastName: 'Hutapea',
        gender: 'male',
        birthDate: born(8, '12-12'),
        rel: 'child',
      },
      {
        firstName: 'Nadia',
        lastName: 'Hutapea',
        gender: 'female',
        birthDate: born(4, '06-06'),
        rel: 'child',
      },
    ],
  },
  {
    name: 'Keluarga Situmorang',
    area: areas.cimahi,
    address: 'Jl. Gatot Subroto No. 51, Cimahi',
    members: [
      {
        firstName: 'Petrus',
        lastName: 'Situmorang',
        gender: 'male',
        birthDate: '1966-02-27',
        weddingDate: `1992-${md(toSunday + 1)}`,
        rel: 'head',
        job: 'Petani sayur',
      },
      {
        firstName: 'Rosa',
        lastName: 'Situmorang',
        gender: 'female',
        birthDate: '1968-08-30',
        weddingDate: `1992-${md(toSunday + 1)}`,
        rel: 'spouse',
      },
    ],
  },
  {
    name: 'Keluarga Panjaitan',
    area: areas.cimahi,
    address: 'Jl. Amir Machmud No. 7, Cimahi',
    members: [
      {
        firstName: 'Benny',
        lastName: 'Panjaitan',
        gender: 'male',
        birthDate: '1989-09-09',
        weddingDate: '2023-10-14',
        rel: 'head',
        job: 'Polisi',
      },
      {
        firstName: 'Yanti',
        lastName: 'Panjaitan',
        gender: 'female',
        birthDate: '1993-12-24',
        weddingDate: '2023-10-14',
        rel: 'spouse',
      },
      {
        firstName: 'Elia',
        lastName: 'Panjaitan',
        gender: 'male',
        birthDate: born(1, '02-02'),
        rel: 'child',
      },
    ],
  },
];
for (const family of families) {
  const ids: string[] = [];
  for (const member of family.members) ids.push(await createPerson(member));
  await api(`${c}/households`, {
    token,
    body: {
      name: family.name,
      areaId: family.area,
      address: family.address,
      city: family.address.includes('Cimahi') ? 'Cimahi' : 'Bandung',
      phone: `022-${String(4200000 + ids.length * 1337).slice(0, 7)}`,
      members: family.members.map((member, index) => ({
        personId: ids[index]!,
        relationship: member.rel ?? 'other',
        isPrimaryContact: index === 0,
      })),
    },
  });
}

// Singles, elderly members, the pastor and visitors who live on their own.
const singles: (PersonSeed & { area?: string })[] = [
  {
    firstName: 'Pdt. Imanuel',
    lastName: 'Pakpahan',
    gender: 'male',
    birthDate: '1974-04-09',
    job: 'Pendeta jemaat',
    area: areas.kebonJati,
  },
  {
    firstName: 'Agnes',
    lastName: 'Halim',
    gender: 'female',
    birthDate: '1999-04-02',
    job: 'Akuntan',
    area: areas.cicendo,
  },
  {
    firstName: 'Benyamin',
    lastName: 'Saragih',
    gender: 'male',
    birthDate: '1988-07-01',
    job: 'Dokter',
    tags: [tags.pemusik],
    area: areas.cicendo,
  },
  {
    firstName: 'Martha',
    lastName: 'Lubis',
    gender: 'female',
    birthDate: `1951-${md(toSunday + 1)}`,
    area: areas.sukajadi,
  },
  {
    firstName: 'Bernard',
    lastName: 'Sianturi',
    gender: 'male',
    birthDate: '1950-08-15',
    area: areas.sukajadi,
  },
  {
    firstName: 'Christina',
    lastName: 'Gultom',
    gender: 'female',
    birthDate: '1957-10-10',
    status: 'inactive',
    area: areas.cimahi,
  },
  {
    firstName: 'Theodorus Hasiholan',
    lastName: 'Lumbantobing Simatupang Panggabean',
    gender: 'male',
    birthDate: '1979-01-05',
    job: 'Notaris',
    area: areas.kebonJati,
  },
  {
    firstName: 'Stefanus',
    lastName: 'Gunawan',
    gender: 'male',
    birthDate: '1996-03-21',
    job: 'Musisi',
    tags: [tags.pemusik],
    area: areas.kebonJati,
  },
  {
    firstName: 'Priskila',
    lastName: 'Hutagalung',
    gender: 'female',
    birthDate: '2000-12-01',
    job: 'Mahasiswa',
    area: areas.sukajadi,
  },
  {
    firstName: 'Timotius',
    lastName: 'Sihombing',
    gender: 'male',
    birthDate: '1998-06-16',
    job: 'Videografer',
    area: areas.cicendo,
  },
  {
    firstName: 'Kevin',
    lastName: 'Sihombing',
    gender: 'male',
    birthDate: '1997-02-08',
    status: 'visitor',
    joinedAt: monthsAgo(0, 1),
  },
  {
    firstName: 'Grace',
    lastName: 'Manurung',
    gender: 'female',
    birthDate: '2002-11-11',
    status: 'visitor',
    joinedAt: monthsAgo(1),
  },
  { firstName: 'Fransiskus', lastName: 'Manurung', gender: 'male', status: 'visitor' },
  {
    firstName: 'Jonathan',
    lastName: 'Sembiring',
    gender: 'male',
    birthDate: '1998-08-03',
    joinedAt: monthsAgo(11),
  },
  {
    firstName: 'Febe',
    lastName: 'Situmorang',
    gender: 'female',
    birthDate: '1987-02-21',
    joinedAt: monthsAgo(9),
  },
  {
    firstName: 'Filipus',
    lastName: 'Damanik',
    gender: 'male',
    birthDate: '2001-03-08',
    status: 'regular',
    joinedAt: monthsAgo(4),
  },
  {
    firstName: 'Yohana',
    lastName: 'Sihite',
    gender: 'female',
    birthDate: '1996-06-06',
    status: 'regular',
    joinedAt: monthsAgo(3),
  },
  {
    firstName: 'Andre',
    lastName: 'Lubis',
    gender: 'male',
    birthDate: '2007-10-19',
    status: 'visitor',
    joinedAt: monthsAgo(2),
  },
];
for (const { area: areaId, ...seed } of singles) {
  await createPerson(seed, areaId ? { areaId } : {});
}

// Families that moved in from another congregation arrive through the CSV import.
const imported = [
  ['Matius', 'Ginting', 'L', '1975-12-01', 'Keluarga Ginting', 'head', 'Wilayah 3 Sukajadi'],
  ['Elisabet', 'Ginting', 'P', '1979-03-17', 'Keluarga Ginting', 'spouse', 'Wilayah 3 Sukajadi'],
  ['Clara', 'Ginting', 'P', born(12, '05-25'), 'Keluarga Ginting', 'child', 'Wilayah 3 Sukajadi'],
  ['Paulus', 'Sinaga', 'L', '1970-01-14', 'Keluarga Sinaga', 'head', 'Sektor Pelayanan Cimahi'],
  ['Marta', 'Sinaga', 'P', '1972-04-28', 'Keluarga Sinaga', 'spouse', 'Sektor Pelayanan Cimahi'],
  [
    'Gabriel',
    'Sinaga',
    'L',
    born(10, '08-08'),
    'Keluarga Sinaga',
    'child',
    'Sektor Pelayanan Cimahi',
  ],
  [
    'Stevanus',
    'Kurniawan',
    'L',
    '1992-09-17',
    'Keluarga Kurniawan',
    'head',
    'Wilayah 1 Kebon Jati',
  ],
  [
    'Monika',
    'Kurniawan',
    'P',
    '1994-10-30',
    'Keluarga Kurniawan',
    'spouse',
    'Wilayah 1 Kebon Jati',
  ],
  ['Elisa', 'Tarigan', 'L', '1959-05-30', '', '', 'Wilayah 2 Cicendo'],
  ['Lia', 'Marpaung', 'P', '2015-12-24', '', '', ''],
] as const;
const importResult = await api<Json>(`${c}/people/import`, {
  token,
  body: {
    dryRun: false,
    rows: imported.map(
      ([firstName, lastName, gender, birthDate, householdName, relationship, areaName]) => ({
        firstName,
        lastName,
        gender,
        birthDate,
        membershipStatus: firstName === 'Lia' ? 'visitor' : 'Anggota',
        joinedAt: firstName === 'Lia' ? null : day(-70),
        phone:
          firstName === 'Lia' || firstName === 'Clara' || firstName === 'Gabriel' ? '' : phone(),
        householdName,
        relationship: relationship || null,
        areaName,
        tags: firstName === 'Stevanus' || firstName === 'Monika' ? ['Jemaat baru'] : [],
      }),
    ),
  },
});
console.info(`  imported ${importResult.created ?? imported.length} people from CSV`);
const directory = await api<{
  items: { id: string; firstName: string; lastName: string | null }[];
}>(`${c}/people?limit=200`, { token });
for (const item of directory.items) {
  people.set(`${item.firstName} ${item.lastName ?? ''}`.trim(), item.id);
}
console.info(`  ${directory.items.length} people in the directory`);

// A likely duplicate for the duplicate finder.
await api(`${c}/people`, {
  token,
  body: { firstName: 'Bonar', lastName: 'Sitompul', gender: 'male', membershipStatus: 'visitor' },
});
await api(`${c}/people/${person('Agnes Halim')}/privacy`, {
  method: 'PUT',
  token,
  body: { showPhone: false, showEmail: false, showAddress: false, showBirthday: false },
});

// ---- Accounts and roles --------------------------------------------------------------------------

const memberInvite = await api<{ invitation: { token: string } }>(`${c}/invitations`, {
  token,
  body: { role: 'member', label: 'QR Warta Jemaat', expiresInDays: 30, maxUses: 200 },
});
const adminInvite = await api<{ invitation: { token: string } }>(`${c}/invitations`, {
  token,
  body: { role: 'administrator', label: 'Sekretariat', expiresInDays: 7, maxUses: 1 },
});
await api(`${c}/invitations`, {
  token,
  body: { role: 'member', label: 'Komisi Pemuda', expiresInDays: 7 },
});

const roles = (
  await api<{ items: { id: string; name: string; templateKey: string | null }[] }>(`${c}/roles`, {
    token,
  })
).items;
const roleId = (templateKey: string) => {
  const found = roles.find((role) => role.templateKey === templateKey);
  if (!found) throw new Error(`No suggested role ${templateKey}`);
  return found.id;
};

const join = async (
  name: string,
  email: string,
  personName: string,
  options: { invite?: string; roles?: string[] } = {},
) => {
  const joined = await account(name, email);
  await api(`/invitations/${options.invite ?? memberInvite.invitation.token}/accept`, {
    method: 'POST',
    token: joined.token,
  });
  await api(`${c}/people/${person(personName)}/user`, {
    method: 'PUT',
    token,
    body: { userId: joined.user.id },
  });
  if (options.roles?.length) {
    const members = await api<{ items: { id: string; userId: string }[] }>(`${c}/members`, {
      token,
    });
    const membership = members.items.find((item) => item.userId === joined.user.id)!;
    for (const key of options.roles) {
      await api(`${c}/members/${membership.id}/roles`, { token, body: { roleId: roleId(key) } });
    }
  }
  return joined;
};

await api(`${c}/people/${person('Maria Simanjuntak')}/user`, {
  method: 'PUT',
  token,
  body: { userId: owner.user.id },
});
const admin = await join('Yohanes Tambunan', 'admin@tatagereja.test', 'Yohanes Tambunan', {
  invite: adminInvite.invitation.token,
  roles: ['secretary'],
});
const treasurer = await join(
  'Ester Lumbantobing',
  'bendahara@tatagereja.test',
  'Ester Lumbantobing',
  {
    roles: ['treasurer'],
  },
);
const elder = await join('Pnt. Bonar Sitompul', 'penatua@tatagereja.test', 'Bonar Sitompul', {
  roles: ['elder'],
});
const pastor = await join(
  'Pdt. Imanuel Pakpahan',
  'pendeta@tatagereja.test',
  'Pdt. Imanuel Pakpahan',
  {
    roles: ['pastor'],
  },
);
const teacher = await join('Ruth Siregar', 'guru@tatagereja.test', 'Ruth Siregar', {
  roles: ['kids_teacher'],
});
const member = await join('Andreas Wijaya', 'jemaat@tatagereja.test', 'Andreas Wijaya');
const reader = await join('Agnes Halim', 'agnes@example.com', 'Agnes Halim');
console.info('  accounts ready');

// ---- Groups --------------------------------------------------------------------------------------

const groups = new Map<string, string>();
const group = async (body: Json, memberNames: string[], leader?: Account) => {
  const { group: created } = await api<{ group: { id: string } }>(`${c}/groups`, { token, body });
  groups.set(body.name as string, created.id);
  await api(`${c}/groups/${created.id}/members`, {
    token,
    body: { personIds: memberNames.map(person) },
  });
  if (leader) {
    await api(`${c}/groups/${created.id}/leaders`, { token, body: { userId: leader.user.id } });
  }
  return created.id;
};
const youth = await group(
  {
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
  },
  [
    'Natalia Sitompul',
    'Agnes Halim',
    'Stefanus Gunawan',
    'Priskila Hutagalung',
    'Timotius Sihombing',
    'Jonathan Sembiring',
    'Filipus Damanik',
    'Yohana Sihite',
    'Andre Lubis',
    'Grace Manurung',
  ],
  reader,
);
const choir = await group(
  {
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
  },
  [
    'Lena Sitompul',
    'Hendra Wibowo',
    'Debora Pardede',
    'Benyamin Saragih',
    'Maria Simanjuntak',
    'Sarah Tambunan',
  ],
);
await group(
  {
    name: 'Komisi Anak / Sekolah Minggu',
    type: 'komisi',
    description: 'Pelayanan anak usia 0–12 tahun setiap Minggu pagi.',
    meetingDay: 0,
    meetingTime: '07:00',
    meetingFrequency: 'weekly',
    location: 'Gedung Sekolah Minggu',
    coverColor: '#c0912a',
  },
  ['Ruth Siregar', 'Sarah Tambunan', 'Lena Sitompul', 'Lidya Wijaya', 'Rina Hutapea'],
  teacher,
);
await group(
  {
    name: 'Komisi Wanita',
    type: 'komisi',
    description: 'Persekutuan kaum ibu, arisan kasih dan kunjungan diakonia.',
    meetingDay: 2,
    meetingTime: '10:00',
    meetingFrequency: 'biweekly',
    location: 'Ruang Konsistori',
    coverColor: '#be185d',
  },
  [
    'Lena Sitompul',
    'Sri Wibowo',
    'Rosmawati Nainggolan',
    'Rosa Situmorang',
    'Debora Pardede',
    'Ester Lumbantobing',
    'Martha Lubis',
  ],
);
await group(
  {
    name: 'Komisi Usia Lanjut',
    type: 'komisi',
    description: 'Persekutuan dan perkunjungan Oma-Opa jemaat.',
    meetingDay: 5,
    meetingTime: '09:00',
    meetingFrequency: 'monthly',
    location: 'Aula Serbaguna',
    coverColor: '#0f766e',
  },
  [
    'Lien Tan',
    'Martha Lubis',
    'Bernard Sianturi',
    'Christina Gultom',
    'Elisa Tarigan',
    'Petrus Situmorang',
  ],
);
await group(
  {
    name: 'PA Wilayah Kebon Jati',
    type: 'small_group',
    description: 'Pemahaman Alkitab dari rumah ke rumah.',
    meetingDay: 3,
    meetingTime: '19:30',
    meetingFrequency: 'biweekly',
    location: 'Bergiliran di rumah jemaat',
    coverColor: '#2f7d6d',
  },
  [
    'Bonar Sitompul',
    'Lena Sitompul',
    'Robert Simanjuntak',
    'Maria Simanjuntak',
    'Daniel Hutapea',
    'Rina Hutapea',
    'Yohanes Tambunan',
  ],
  elder,
);
await group(
  {
    name: 'Panitia Natal 2026',
    type: 'committee',
    description: 'Persiapan Ibadah dan perayaan Natal jemaat.',
    meetingFrequency: 'irregular',
    coverColor: '#7a4fa3',
    visibility: 'private',
    joinPolicy: 'closed',
  },
  ['Togar Pardede', 'Sri Wibowo', 'Yohanes Tambunan', 'Agnes Halim'],
);
// The plain member asks to join the choir.
await api(`${c}/groups/${choir}/join-requests`, {
  token: member.token,
  body: { message: 'Dulu saya ikut paduan suara di GKI Pasirkaliki, ingin bergabung lagi.' },
});
console.info('  groups ready');

// ---- Worship: teams, songs, services, liturgy and rosters ---------------------------------------

const w = `${c}/worship`;
await api(`${w}/setup`, { method: 'POST', token });
type Team = { id: string; name: string; positions: { id: string; name: string }[] };
const teams = (await api<{ items: Team[] }>(`${w}/teams`, { token })).items;
const team = (name: string) => {
  const found = teams.find((item) => item.name === name);
  if (!found) throw new Error(`No team ${name}`);
  return found;
};
const position = (teamName: string, name: string) => {
  const found = team(teamName).positions.find((item) => item.name === name);
  if (!found) throw new Error(`No position ${teamName} / ${name}`);
  return found.id;
};
const teamMembers: [string, string, string[], ('leader' | 'member')?][] = [
  ['Pemusik', 'Stefanus Gunawan', ['Pianis / Organis', 'Gitar'], 'leader'],
  ['Pemusik', 'Benyamin Saragih', ['Pianis / Organis']],
  ['Pemusik', 'Jonathan Sembiring', ['Gitar', 'Bass']],
  ['Pemusik', 'Timotius Sihombing', ['Drum']],
  ['Pemusik', 'Hendra Wibowo', ['Bass']],
  ['Singers', 'Maria Simanjuntak', ['Worship Leader', 'Singer'], 'leader'],
  ['Singers', 'Debora Pardede', ['Worship Leader', 'Singer']],
  ['Singers', 'Natalia Sitompul', ['Singer']],
  ['Singers', 'Agnes Halim', ['Singer']],
  ['Multimedia', 'Daniel Hutapea', ['Operator LCD', 'Live Streaming'], 'leader'],
  ['Multimedia', 'Markus Siregar', ['Sound System']],
  ['Multimedia', 'Priskila Hutagalung', ['Operator LCD']],
  ['Penerima Tamu', 'Andreas Wijaya', ['Usher', 'Kolektan']],
  ['Penerima Tamu', 'Lidya Wijaya', ['Usher']],
  ['Penerima Tamu', 'Rina Hutapea', ['Kolektan']],
  ['Penerima Tamu', 'Togar Pardede', ['Usher']],
  ['Penatua Bertugas', 'Bonar Sitompul', [], 'leader'],
  ['Penatua Bertugas', 'Yohanes Tambunan', []],
  ['Penatua Bertugas', 'Samuel Nainggolan', ['Doa Syafaat']],
];
for (const [teamName, name, positions, role] of teamMembers) {
  await optional(`team member ${name}`, () =>
    api(`${w}/teams/${team(teamName).id}/members`, {
      token,
      body: {
        personId: person(name),
        role: role ?? 'member',
        positionIds: positions.map((item) => position(teamName, item)),
      },
    }),
  );
}

const songs: Json[] = [
  {
    title: 'Haleluya, Pujilah',
    hymnal: 'KJ',
    hymnalNumber: '1',
    defaultKey: 'G',
    tags: ['pujian', 'pembukaan'],
  },
  {
    title: 'Kami Puji Dengan Riang',
    hymnal: 'KJ',
    hymnalNumber: '3',
    defaultKey: 'G',
    tags: ['pujian', 'pembukaan'],
  },
  {
    title: 'Pujilah Tuhan, Sang Raja',
    hymnal: 'KJ',
    hymnalNumber: '10',
    defaultKey: 'F',
    tags: ['pujian'],
  },
  {
    title: 'Ku Berbahagia',
    hymnal: 'KJ',
    hymnalNumber: '392',
    defaultKey: 'D',
    tags: ['syukur', 'penutup'],
  },
  {
    title: 'Allah Peduli',
    hymnal: 'KJ',
    hymnalNumber: '417',
    defaultKey: 'C',
    tags: ['penghiburan'],
  },
  {
    title: 'Tuhan, Kasihanilah',
    hymnal: 'PKJ',
    hymnalNumber: '173',
    defaultKey: 'Em',
    tags: ['pengakuan dosa'],
  },
  {
    title: 'Bila Kurenungkan',
    hymnal: 'PKJ',
    hymnalNumber: '12',
    defaultKey: 'E',
    tags: ['syukur'],
  },
  { title: 'Bapa Yang Kekal', hymnal: 'NKB', hymnalNumber: '2', defaultKey: 'A', tags: ['pujian'] },
  {
    title: 'Hidup Ini Adalah Kesempatan',
    hymnal: 'NKB',
    hymnalNumber: '210',
    defaultKey: 'D',
    tags: ['persembahan'],
  },
  {
    title: 'Bapa, Engkau Sungguh Baik',
    author: 'Ir. Ruby Ndoen',
    defaultKey: 'G',
    tempo: 72,
    tags: ['pujian', 'penyembahan'],
    lyrics:
      'Bait 1\nDi pagi hari kami datang memuji\nKasih-Mu baru setiap hari\n\nRefrein\nBapa, Engkau sungguh baik\nSetia-Mu tak berkesudahan',
  },
  { title: 'Tuhan Yesus Baik', defaultKey: 'C', tempo: 96, tags: ['sekolah minggu', 'pujian'] },
  {
    title: 'Hosana',
    author: 'Brooke Ligertwood',
    ccliNumber: '4785835',
    defaultKey: 'E',
    tempo: 70,
    tags: ['pemuda', 'penyembahan'],
  },
  { title: 'Berkat Tuhan Bagimu', defaultKey: 'F', tags: ['berkat', 'penutup'] },
];
const songIds = new Map<string, string>();
for (const song of songs) {
  const { song: created } = await api<{ song: { id: string } }>(`${w}/songs`, {
    token,
    body: {
      title: song.title,
      author: song.author ?? null,
      hymnal: song.hymnal ?? null,
      hymnalNumber: song.hymnalNumber ?? null,
      ccliNumber: song.ccliNumber ?? null,
      defaultKey: song.defaultKey ?? null,
      tempo: song.tempo ?? null,
      tags: song.tags,
      lyrics: song.lyrics ?? null,
    },
  });
  songIds.set(song.title as string, created.id);
}

const serviceTypes = (
  await api<{ items: { id: string; name: string }[] }>(`${w}/service-types`, { token })
).items;
const serviceType = (name: string) => serviceTypes.find((item) => item.name === name)?.id ?? null;
const liturgy = (picks: [string, string, string], preacherId: string | null) => [
  { type: 'prayer', title: 'Votum dan Salam', durationMinutes: 3, personName: 'Penatua bertugas' },
  {
    type: 'song',
    title: picks[0],
    durationMinutes: 5,
    songId: songIds.get(picks[0]),
    songKey: 'G',
  },
  { type: 'prayer', title: 'Pengakuan Dosa dan Berita Anugerah', durationMinutes: 4 },
  { type: 'song', title: picks[1], durationMinutes: 4, songId: songIds.get(picks[1]) },
  {
    type: 'reading',
    title: 'Pembacaan Alkitab',
    durationMinutes: 6,
    personId: person('Yohanes Tambunan'),
  },
  { type: 'sermon', title: 'Khotbah', durationMinutes: 30, personId: preacherId },
  {
    type: 'prayer',
    title: 'Doa Syafaat',
    durationMinutes: 6,
    personId: person('Samuel Nainggolan'),
  },
  { type: 'offering', title: 'Persembahan', durationMinutes: 8, notes: 'Kantong kolekte dan QRIS' },
  { type: 'announcement', title: 'Warta Jemaat', durationMinutes: 5 },
  { type: 'song', title: picks[2], durationMinutes: 4, songId: songIds.get(picks[2]) },
  { type: 'prayer', title: 'Pengutusan dan Berkat', durationMinutes: 2 },
];
const service = async (
  title: string,
  typeName: string,
  startsAt: string,
  minutes: number,
  extra: Json = {},
) =>
  (
    await api<{ service: { id: string } }>(`${w}/services`, {
      token,
      body: {
        title,
        serviceTypeId: serviceType(typeName),
        startsAt,
        endsAt: plus(startsAt, minutes),
        location: 'Gedung Gereja',
        status: 'published',
        ...extra,
      },
    })
  ).service.id;
const pastor1 = person('Pdt. Imanuel Pakpahan');
const pastSongs: [string, string, string][] = [
  ['Kami Puji Dengan Riang', 'Tuhan, Kasihanilah', 'Ku Berbahagia'],
  ['Haleluya, Pujilah', 'Bila Kurenungkan', 'Berkat Tuhan Bagimu'],
  ['Pujilah Tuhan, Sang Raja', 'Tuhan, Kasihanilah', 'Hidup Ini Adalah Kesempatan'],
];
const pastServices: string[] = [];
for (const [index, weeks] of [2, 1, 0].entries()) {
  const id = await service('Ibadah Minggu', 'Ibadah Umum 1', sundayAt(weeks, '07:00'), 120, {
    theme: ['Kasih yang memulihkan', 'Melayani dengan sukacita', 'Hidup dalam pengharapan'][index],
    scriptureReadings: [['Lukas 15:11-32'], ['1 Petrus 4:7-11', 'Mazmur 100'], ['Roma 15:4-13']][
      index
    ],
    preacherPersonId: pastor1,
  });
  await api(`${w}/services/${id}/liturgy`, {
    method: 'PUT',
    token,
    body: { items: liturgy(pastSongs[index]!, pastor1) },
  });
  await api(`${w}/services/${id}/roster/auto-fill`, { token, body: {} });
  pastServices.push(id);
}
for (const id of pastServices) {
  const roster = await api<{ items: { id: string }[] }>(`${w}/services/${id}/roster`, { token });
  for (const item of roster.items) {
    await optional('past reply', () =>
      api(`${w}/roster/${item.id}/respond`, { token, body: { status: 'accepted' } }),
    );
  }
}
const nextSunday = toSunday === 0 ? 7 : toSunday;
const sunday1 = await service('Ibadah Minggu', 'Ibadah Umum 1', at(nextSunday, '07:00'), 120, {
  theme: 'Bersiaplah menyambut Dia',
  scriptureReadings: ['Yesaya 40:1-11', 'Mazmur 85:2-14', 'Markus 1:1-8'],
  preacherPersonId: pastor1,
  notes: 'Perjamuan Kudus. Majelis bertugas hadir pukul 06.30.',
});
await api(`${w}/services/${sunday1}/liturgy`, {
  method: 'PUT',
  token,
  body: { items: liturgy(['Haleluya, Pujilah', 'Tuhan, Kasihanilah', 'Bapa Yang Kekal'], pastor1) },
});
await api(`${w}/services/${sunday1}/roster`, {
  token,
  body: {
    assignments: [
      { positionId: position('Penerima Tamu', 'Usher'), personId: person('Andreas Wijaya') },
      { positionId: position('Singers', 'Worship Leader'), personId: person('Maria Simanjuntak') },
      { positionId: position('Pemusik', 'Pianis / Organis'), personId: person('Stefanus Gunawan') },
    ],
    ignoreConflicts: true,
  },
});
await api(`${w}/services/${sunday1}/roster/auto-fill`, { token, body: {} });
const sunday2 = await service('Ibadah Minggu', 'Ibadah Umum 2', at(nextSunday, '09:30'), 120, {
  theme: 'Bersiaplah menyambut Dia',
  scriptureReadings: ['Yesaya 40:1-11', 'Markus 1:1-8'],
  preacherName: 'Pdt. Em. Ruth Lumban Gaol',
});
await api(`${w}/services/${sunday2}/liturgy`, {
  method: 'PUT',
  token,
  body: { items: liturgy(['Kami Puji Dengan Riang', 'Bila Kurenungkan', 'Ku Berbahagia'], null) },
});
await api(`${w}/services/${sunday2}/roster/auto-fill`, { token, body: {} });
// Replies for the coming Sunday: most accepted, one declined, the plain member still deciding.
const roster1 = await api<{ items: { id: string; person: { id: string; firstName: string } }[] }>(
  `${w}/services/${sunday1}/roster`,
  { token },
);
for (const [index, item] of roster1.items.entries()) {
  if (item.person.id === person('Andreas Wijaya')) continue;
  if (item.person.id === person('Jonathan Sembiring')) {
    await api(`${w}/roster/${item.id}/respond`, {
      token,
      body: { status: 'declined', reason: 'Dinas ke Surabaya' },
    });
  } else if (index % 3 !== 2) {
    await api(`${w}/roster/${item.id}/respond`, { token, body: { status: 'accepted' } });
  }
}
const youthService = await service(
  'Ibadah Pemuda: Bertumbuh Bersama',
  'Ibadah Pemuda',
  at(nextSunday - 1, '17:00'),
  120,
  {
    theme: 'Berakar dan dibangun di dalam Dia',
    scriptureReadings: ['Kolose 2:6-7'],
    preacherName: 'Ev. Kevin Lumbantoruan',
    location: 'Aula Serbaguna',
  },
);
await api(`${w}/services/${youthService}/liturgy`, {
  method: 'PUT',
  token,
  body: {
    items: [
      {
        type: 'song',
        title: 'Hosana',
        durationMinutes: 6,
        songId: songIds.get('Hosana'),
        songKey: 'E',
      },
      {
        type: 'song',
        title: 'Bapa, Engkau Sungguh Baik',
        durationMinutes: 5,
        songId: songIds.get('Bapa, Engkau Sungguh Baik'),
      },
      { type: 'prayer', title: 'Doa Pembukaan', durationMinutes: 3 },
      { type: 'sermon', title: 'Firman Tuhan', durationMinutes: 35 },
      { type: 'other', title: 'Sharing kelompok kecil', durationMinutes: 25 },
      { type: 'offering', title: 'Persembahan', durationMinutes: 5 },
    ],
  },
});
await optional('youth roster', () =>
  api(`${w}/services/${youthService}/roster/auto-fill`, {
    token,
    body: { teamId: team('Pemusik').id },
  }),
);
const sunday3 = await service('Ibadah Minggu', 'Ibadah Umum 1', at(nextSunday + 7, '07:00'), 120, {
  theme: 'Terang bagi bangsa-bangsa',
  scriptureReadings: ['Yesaya 60:1-6', 'Matius 2:1-12'],
  preacherPersonId: pastor1,
});
await optional('copy roster', () =>
  api(`${w}/services/${sunday3}/roster/copy`, { token, body: {} }),
);
await service('Ibadah Malam Natal', 'Ibadah Umum 1', `${year}-12-24T11:00:00.000Z`, 150, {
  theme: 'Firman telah menjadi manusia',
  scriptureReadings: ['Yohanes 1:1-14', 'Lukas 2:1-20'],
  status: 'draft',
  location: 'Gedung Gereja dan Aula',
});
await api(`${w}/blockouts`, {
  token,
  body: {
    personId: person('Stefanus Gunawan'),
    startDate: day(nextSunday + 14),
    endDate: day(nextSunday + 15),
    reason: 'Retret kantor',
  },
});
console.info('  worship ready');

// ---- Events, RSVPs and registrations -------------------------------------------------------------

const event = async (body: Json) =>
  (await api<{ event: { id: string } }>(`${c}/events`, { token, body })).event.id;
const nextWednesday = (3 - weekday + 7) % 7 || 7;
await api(`${c}/events/series`, {
  token,
  body: {
    title: 'Persekutuan Doa Rabu Malam',
    location: 'Ruang Konsistori',
    startsAt: at(nextWednesday, '19:00'),
    durationMinutes: 90,
    frequency: 'weekly',
    untilDate: day(nextWednesday + 7 * 10),
    coverColor: '#7c3aed',
  },
});
const retreat = await event({
  title: 'Retret Keluarga Jemaat',
  description:
    'Tiga hari bersama keluarga di **Wisma Kinasih**, Caringin. Tema: _Keluarga yang Berakar dalam Kristus_.\n\n- Transportasi bus dari gereja\n- Anak-anak didampingi guru Sekolah Minggu',
  location: 'Wisma Kinasih, Bogor',
  startsAt: at(12, '08:00'),
  endsAt: at(14, '15:00'),
  capacity: 12,
  registrationRequired: true,
  waitlistEnabled: true,
  coverColor: '#16a34a',
});
for (const [who, partySize] of [
  [treasurer, 3],
  [elder, 4],
  [teacher, 3],
] as const) {
  await api(`${c}/events/${retreat}/registrations`, { token: who.token, body: { partySize } });
}
const youthNight = await event({
  title: 'Persekutuan Pemuda: Malam Pujian',
  location: 'Aula Serbaguna',
  startsAt: at(nextSunday - 1 + 7, '18:00'),
  endsAt: at(nextSunday - 1 + 7, '20:30'),
  groupId: youth,
  coverColor: '#b4502f',
});
const bakti = await event({
  title: 'Bakti Sosial Pengobatan Gratis',
  description: 'Pemeriksaan kesehatan dan pembagian sembako bersama Komisi Wanita.',
  location: 'Balai Warga RW 05 Cicendo',
  startsAt: at(9, '08:00'),
  endsAt: at(9, '13:00'),
  coverColor: '#dc2626',
});
const council = await event({
  title: 'Rapat Majelis Jemaat',
  location: 'Ruang Konsistori',
  startsAt: at(5, '19:00'),
  endsAt: at(5, '21:30'),
});
for (const [eventId, who, name] of [
  [bakti, admin, 'Yohanes Tambunan'],
  [bakti, treasurer, 'Ester Lumbantobing'],
  [council, elder, 'Bonar Sitompul'],
  [council, pastor, 'Pdt. Imanuel Pakpahan'],
  [youthNight, reader, 'Agnes Halim'],
] as const) {
  await api(`${c}/events/${eventId}/participants/${person(name)}`, {
    method: 'PATCH',
    token: who.token,
    body: { status: 'going' },
  });
}
const cancelled = await event({
  title: 'Lomba Vokal Grup Antar Wilayah',
  startsAt: at(6, '15:00'),
  location: 'Aula Serbaguna',
});
await api(`${c}/events/${cancelled}/cancel`, { token, body: { reason: 'Diundur ke bulan depan' } });
console.info('  events ready');

// ---- Announcements and Warta Jemaat --------------------------------------------------------------

const announce = async (body: Json, author = token) =>
  (await api<{ announcement: { id: string } }>(`${c}/announcements`, { token: author, body }))
    .announcement.id;
const pinned = await announce({
  title: 'Perjamuan Kudus dan Persiapan Natal',
  body: [
    'Jemaat yang dikasihi Tuhan, pada **Minggu ini** kita merayakan Perjamuan Kudus dalam ibadah pagi.',
    '',
    'Persiapan yang perlu diperhatikan:',
    '- Ibadah persiapan Perjamuan Kudus hari _Jumat_ pukul 19.00',
    '- Pakaian putih bagi anggota sidi',
    '- Pendaftaran Panitia Natal dibuka di kantor gereja',
  ].join('\n'),
  status: 'published',
  pinned: true,
});
await announce(
  {
    title: 'Pendaftaran Katekisasi Sidi 2027',
    body: 'Pendaftaran katekisasi sidi angkatan 2027 dibuka sampai **akhir bulan**. Formulir tersedia di kantor gereja.',
    status: 'published',
  },
  admin.token,
);
await announce(
  {
    title: 'Kerja Bakti Lingkungan Gereja',
    body: 'Mari bersama membersihkan halaman dan taman gereja hari Sabtu pukul 07.00. Konsumsi disediakan Komisi Wanita.',
    status: 'published',
  },
  admin.token,
);
await announce({
  title: 'Latihan Paduan Suara Pemuda',
  body: 'Latihan untuk pelayanan Natal setiap Sabtu pukul 16.00 di Aula.',
  status: 'published',
  audience: 'group',
  groupId: youth,
});
await announce({
  title: 'Rapat Majelis Jemaat Bulanan',
  body: 'Rapat majelis membahas program pelayanan tahun depan. Mohon membawa laporan masing-masing bidang.',
  status: 'published',
  audience: 'roles',
  roleIds: [roleId('elder'), roleId('pastor')],
});
await announce({
  title: 'Ibadah Syukur HUT Gereja ke-75',
  body: 'Ibadah syukur dilanjutkan dengan makan bersama. Setiap keluarga diharapkan membawa satu hidangan.',
  status: 'published',
  publishAt: at(3, '08:00'),
});
await announce({
  title: 'Rencana Retret Majelis',
  body: 'Draf rencana retret: tempat dan anggaran masih dibahas.',
  status: 'draft',
});
for (const who of [admin, treasurer, elder]) {
  await api(`${c}/announcements/${pinned}/read`, { method: 'POST', token: who.token });
}
const sections = [
  {
    id: 'renungan',
    kind: 'text',
    title: 'Renungan Singkat',
    body: '> Kasih itu sabar; kasih itu murah hati; ia tidak cemburu. (1 Korintus 13:4)\n\nKasih bukan sekadar perasaan, melainkan keputusan untuk setia hadir bagi sesama.',
  },
  { id: 'ibadah', kind: 'services', title: 'Jadwal Ibadah' },
  { id: 'pelayan', kind: 'rosters', title: 'Petugas Pelayanan' },
  { id: 'pengumuman', kind: 'announcements', title: 'Pengumuman' },
  { id: 'kegiatan', kind: 'events', title: 'Kegiatan Pekan Ini' },
  { id: 'hut', kind: 'birthdays', title: 'Selamat Ulang Tahun' },
  { id: 'nikah', kind: 'anniversaries', title: 'Ulang Tahun Pernikahan' },
  { id: 'kolekte', kind: 'finance', title: 'Persembahan Minggu Lalu' },
  {
    id: 'doa',
    kind: 'text',
    title: 'Pokok Doa',
    body: '- Jemaat yang sedang sakit dan keluarga yang berduka\n- Persiapan Natal dan panitia\n- Para pelajar yang menghadapi ujian akhir semester',
  },
];
console.info('  announcements ready');

// ---- Pastoral care and prayer --------------------------------------------------------------------

const care = `${c}/care`;
const createCase = async (body: Json, author = token) =>
  (await api<{ case: { id: string } }>(`${care}/cases`, { token: author, body })).case.id;
const hospital = await createCase({
  personId: person('Lien Tan'),
  category: 'hospital',
  priority: 'high',
  status: 'in_progress',
  title: 'Opname di RS Immanuel',
  description: 'Oma Lien dirawat karena pneumonia. Keluarga meminta didoakan dan dikunjungi.',
  nextActionDate: day(1),
  nextActionNote: 'Kunjungi bersama Penatua, bawa Perjamuan Kudus',
  caregiverUserIds: [elder.user.id, owner.user.id],
});
await api(`${care}/cases/${hospital}/notes`, {
  token: elder.token,
  body: { kind: 'visit', body: 'Berkunjung bersama Dkn. Sarah, berdoa bersama keluarga Wibowo.' },
});
const grief = await createCase({
  personId: person('Samuel Nainggolan'),
  category: 'grief',
  title: 'Pendampingan duka keluarga Nainggolan',
  description:
    'Ibu dari Bpk. Samuel dipanggil Tuhan. Ibadah penghiburan hari ketiga sudah dilayani.',
  nextActionDate: day(0),
  nextActionNote: 'Ibadah penghiburan hari ketujuh',
  caregiverUserIds: [pastor.user.id],
});
await createCase(
  {
    personId: person('Benny Panjaitan'),
    category: 'counseling',
    confidentiality: 'confidential',
    title: 'Konseling keluarga muda',
    description: 'Sesi konseling kedua dari empat.',
    nextActionDate: day(4),
    nextActionNote: 'Sesi 3: komunikasi dan keuangan keluarga',
    caregiverUserIds: [pastor.user.id],
  },
  pastor.token,
);
const aidCase = await createCase({
  personId: person('Rosa Situmorang'),
  category: 'financial_aid',
  priority: 'high',
  title: 'Bantuan biaya berobat',
  nextActionDate: day(6),
  nextActionNote: 'Rapat Diakonia memutuskan besaran bantuan',
  caregiverUserIds: [elder.user.id],
});
await api(`${care}/visits`, {
  token: elder.token,
  body: {
    caseId: hospital,
    visitDate: day(-2),
    location: 'RS Immanuel, kamar 204',
    summary: 'Kondisi membaik. Berdoa bersama Ibu Sri dan cucu.',
    visitorPersonIds: [person('Bonar Sitompul'), person('Sarah Tambunan')],
    followUpNeeded: true,
    followUpNote: 'Kunjungi lagi setelah pulang dari rumah sakit',
  },
});
await api(`${care}/visits`, {
  token,
  body: {
    personId: person('Martha Lubis'),
    visitDate: day(-9),
    location: 'Rumah',
    summary: 'Perkunjungan lansia, Oma Martha sehat dan rindu ibadah.',
    visitorPersonIds: [person('Maria Simanjuntak')],
    otherVisitors: 'Tim Komisi Usia Lanjut',
  },
});
const prayer = async (who: Account, body: Json) =>
  (await api<{ request: { id: string } }>(`${care}/prayer-requests`, { token: who.token, body }))
    .request.id;
const exam = await prayer(owner, {
  title: 'Ujian akhir semester anak-anak',
  body: 'Doakan para pelajar dari jemaat kita yang menghadapi ujian akhir semester, agar diberi ketenangan dan hikmat.',
});
const healing = await prayer(elder, {
  title: 'Kesembuhan Oma Lien',
  body: 'Mohon dukungan doa untuk Oma Lien Tan yang dirawat di RS Immanuel.',
});
await optional('moderate prayer', () =>
  api(`${care}/prayer-requests/${healing}/moderate`, { token, body: { decision: 'approved' } }),
);
for (const who of [pastor, elder, member, teacher]) {
  await optional('pray', () =>
    api(`${care}/prayer-requests/${exam}/pray`, { method: 'POST', token: who.token }),
  );
}
await prayer(member, {
  title: 'Usaha keluarga',
  body: 'Doakan usaha kami yang sedang sepi agar tetap bisa mencukupi kebutuhan keluarga.',
});
await prayer(pastor, {
  title: 'Pekerjaan baru',
  body: 'Seorang anggota jemaat sedang mencari pekerjaan setelah kontraknya berakhir.',
  isAnonymous: true,
});
const answered = await prayer(owner, {
  title: 'Pembangunan gedung serbaguna',
  body: 'Doakan proses perizinan gedung serbaguna gereja.',
});
await api(`${care}/prayer-requests/${answered}/answer`, {
  token,
  body: {
    testimony: 'Puji Tuhan, izin bangunan sudah terbit bulan ini. Terima kasih atas doa jemaat.',
  },
});
const kevinFollowUp = await api<{ followUp: { id: string } }>(`${care}/follow-ups`, {
  token,
  body: {
    personId: person('Kevin Sihombing'),
    source: 'Diajak teman kantor',
    firstVisitDate: day(-6),
    assignedUserId: elder.user.id,
    notes: 'Baru pindah dari Medan, tertarik ikut Komisi Pemuda.',
  },
});
await api(`${care}/tasks`, {
  token,
  body: {
    title: 'Telepon Kevin, ajak ke Persekutuan Pemuda',
    followUpId: kevinFollowUp.followUp.id,
    dueDate: day(1),
    assignedUserId: elder.user.id,
  },
});
const graceFollowUp = await api<{ followUp: { id: string } }>(`${care}/follow-ups`, {
  token,
  body: { personId: person('Grace Manurung'), source: 'Instagram', firstVisitDate: day(-13) },
});
await api(`${care}/follow-ups/${graceFollowUp.followUp.id}/stage`, {
  token,
  body: { stage: 'contacted' },
});
await api(`${care}/follow-ups`, {
  token,
  body: {
    newVisitor: { firstName: 'Bayu', lastName: 'Prasetyo', phone: '0813-5566-7788' },
    source: 'Diajak keluarga',
    firstVisitDate: day(-1),
  },
});
await api(`${care}/tasks`, {
  token,
  body: { title: 'Siapkan bingkisan Natal lansia', dueDate: day(10) },
});
await api(`${care}/tasks`, {
  token,
  body: {
    title: 'Kirim ucapan penghiburan',
    caseId: grief,
    dueDate: day(-2),
    assignedUserId: owner.user.id,
  },
});
await api(`${care}/diakonia`, {
  token,
  body: {
    personId: person('Rosa Situmorang'),
    caseId: aidCase,
    category: 'health',
    form: 'cash',
    amount: 2_500_000,
    givenAt: day(-3),
    description: 'Bantuan biaya pengobatan',
    financeReference: `KK-${year}-0142`,
  },
});
await api(`${care}/diakonia`, {
  token,
  body: {
    personId: person('Martha Lubis'),
    category: 'food',
    form: 'goods',
    givenAt: day(-8),
    description: 'Paket sembako: beras 10 kg, minyak, gula',
  },
});
console.info('  care ready');

// ---- Church records ------------------------------------------------------------------------------

const r = `${c}/records`;
await api(`${r}/settings`, {
  method: 'PUT',
  token,
  body: {
    numberPatterns: {},
    signatoryName: 'Pdt. Imanuel Pakpahan',
    signatoryTitle: 'Ketua Majelis Jemaat',
    certificateFooter: 'Kiranya kasih karunia Tuhan Yesus Kristus menyertai saudara.',
  },
});
const record = (body: Json) =>
  api(`${r}/entries`, { token, body: { applyStatusEffect: true, ...body } });
await record({
  type: 'baptism',
  subtype: 'infant',
  date: day(-60),
  place: 'GKI Kebon Jati',
  officiantPersonId: pastor1,
  details: { birthPlace: 'Bandung', verse: 'Markus 10:14' },
  people: [
    { personId: person('Mikha Pardede'), role: 'subject' },
    { personId: person('Togar Pardede'), role: 'father' },
    { personId: person('Debora Pardede'), role: 'mother' },
  ],
});
await record({
  type: 'baptism',
  subtype: 'infant',
  date: `${year - 1}-04-20`,
  place: 'GKI Kebon Jati',
  officiantPersonId: pastor1,
  details: { birthPlace: 'Bandung' },
  people: [
    { personId: person('Elia Panjaitan'), role: 'subject' },
    { personId: person('Benny Panjaitan'), role: 'father' },
    { personId: person('Yanti Panjaitan'), role: 'mother' },
  ],
});
await record({
  type: 'baptism',
  subtype: 'adult',
  date: day(-40),
  place: 'GKI Kebon Jati',
  officiantPersonId: pastor1,
  details: { birthPlace: 'Medan', birthDate: '1998-08-03', verse: 'Roma 6:4' },
  people: [{ personId: person('Jonathan Sembiring'), role: 'subject' }],
});
for (const name of ['Natalia Sitompul', 'Priskila Hutagalung']) {
  await record({
    type: 'sidi',
    date: `${year}-04-05`,
    place: 'GKI Kebon Jati',
    officiantPersonId: pastor1,
    details: { verse: 'Mazmur 119:105' },
    people: [{ personId: person(name), role: 'subject' }],
  });
}
await record({
  type: 'marriage',
  date: '2023-10-14',
  place: 'GKI Kebon Jati',
  officiantPersonId: pastor1,
  details: {
    civilRegistrationNumber: '3273-KW-14102023-0012',
    civilRegistrationDate: '2023-10-14',
  },
  people: [
    { personId: person('Benny Panjaitan'), role: 'spouse' },
    { personId: person('Yanti Panjaitan'), role: 'spouse' },
    { name: 'Robert Panjaitan', role: 'witness' },
    { name: 'Sarah Simatupang', role: 'witness' },
  ],
});
await record({
  type: 'child_dedication',
  date: day(-25),
  place: 'GKI Kebon Jati',
  officiantPersonId: pastor1,
  details: { birthPlace: 'Bandung', verse: '1 Samuel 1:27-28' },
  people: [
    { name: 'Abigail Purba', role: 'subject' },
    { name: 'Rudi Purba', role: 'father' },
    { name: 'Nia Purba', role: 'mother' },
  ],
});
for (const name of ['Matius Ginting', 'Elisabet Ginting']) {
  await record({
    type: 'transfer_in',
    date: day(-70),
    place: 'GKI Kebon Jati',
    details: { otherChurchName: 'GBKP Runggun Bandung', letterNumber: `045/AT/GBKP/${year}` },
    people: [{ personId: person(name), role: 'subject' }],
  });
}
await record({
  type: 'transfer_out',
  date: day(-30),
  place: 'GKI Kebon Jati',
  details: { otherChurchName: 'GKI Pondok Indah', letterNumber: `AK/${year}/001` },
  people: [{ name: 'Lukas Gunawan', role: 'subject' }],
});
console.info('  records ready');

// ---- Sekolah Minggu check-in ---------------------------------------------------------------------

const ck = `${c}/checkin`;
const classes = (await api<{ items: Json[] }>(`${ck}/classes/defaults`, { method: 'POST', token }))
  .items;
const classId = (name: string) => classes.find((item) => item.name === name)?.id as string;
const classLook: Record<string, [string, string, number]> = {
  Balita: ['#e07a5f', 'Ruang Bayi, Lantai 1', 12],
  'Kelas Kecil': ['#e0a526', 'Ruang Sekolah Minggu 1', 20],
  'Kelas Tengah': ['#2fa39a', 'Ruang Sekolah Minggu 2', 25],
  'Kelas Besar': ['#4f86d9', 'Ruang Sekolah Minggu 3', 25],
  'Tunas Remaja': ['#9b6bd3', 'Ruang Serbaguna', 30],
};
for (const item of classes) {
  const [color, location, capacity] = classLook[item.name as string] ?? ['#8a8f98', null, null];
  await api(`${ck}/classes/${item.id}`, {
    method: 'PATCH',
    token,
    body: {
      name: item.name,
      minAge: item.minAge,
      maxAge: item.maxAge,
      color,
      location,
      capacity,
      maxChildrenPerTeacher: 6,
      sortOrder: item.sortOrder,
      isActive: true,
    },
  });
}
for (const [name, teachers] of [
  ['Balita', ['Lidya Wijaya', 'Rina Hutapea']],
  ['Kelas Kecil', ['Ruth Siregar', 'Sarah Tambunan']],
  ['Kelas Tengah', ['Ruth Siregar', 'Lena Sitompul']],
  ['Kelas Besar', ['Lena Sitompul']],
  ['Tunas Remaja', ['Yohanes Tambunan']],
] as const) {
  if (!classId(name)) continue;
  await api(`${ck}/classes/${classId(name)}/teachers`, {
    method: 'PUT',
    token,
    body: {
      teachers: teachers.map((teacherName, index) => ({
        personId: person(teacherName),
        isLead: index === 0,
      })),
    },
  });
}
const kid = (name: string) => person(name);
await api(`${ck}/children/${kid('Grace Simanjuntak')}/alerts`, {
  token,
  body: {
    kind: 'allergy',
    severity: 'critical',
    description: 'Alergi kacang tanah. EpiPen ada di tas biru.',
  },
});
await api(`${ck}/children/${kid('Lukas Hutapea')}/alerts`, {
  token,
  body: { kind: 'medical', severity: 'warning', description: 'Asma ringan, inhaler di saku tas.' },
});
await api(`${ck}/children/${kid('Kevin Wijaya')}/alerts`, {
  token,
  body: { kind: 'allergy', severity: 'warning', description: 'Alergi susu sapi.' },
});
await api(`${ck}/children/${kid('Yosua Simanjuntak')}/pickups`, {
  token,
  body: { name: 'Opung Boru Simanjuntak', relationship: 'Opung', phone: '0812-7000-1111' },
});
const children = [
  'Kezia Simanjuntak',
  'Yosua Simanjuntak',
  'Grace Simanjuntak',
  'Michelle Wijaya',
  'Kevin Wijaya',
  'Abigail Tambunan',
  'Samuel Tambunan',
  'Hana Siregar',
  'Naomi Pardede',
  'Priskila Nainggolan',
  'Timotius Nainggolan',
  'Lukas Hutapea',
  'Nadia Hutapea',
  'Clara Ginting',
  'Gabriel Sinaga',
  'Daniel Sitompul',
];
for (let week = 6; week >= 1; week -= 1) {
  const { session } = await api<{ session: { id: string } }>(`${ck}/sessions`, {
    token,
    body: { name: 'Sekolah Minggu Pagi', date: pastSunday(week) },
  });
  const coming = children.filter((_, index) => (index + week) % 5 !== 0);
  // Families arrive a few children at a time.
  for (let start = 0; start < coming.length; start += 4) {
    const result = await api<{ items: { id: string; securityCode: string }[] }>(
      `${ck}/sessions/${session.id}/checkins`,
      {
        token,
        body: {
          children: coming.slice(start, start + 4).map((name) => ({ personId: kid(name) })),
          method: 'staff',
        },
      },
    );
    for (const item of result.items) {
      await api(`${ck}/checkins/${item.id}/checkout`, {
        token,
        body: { securityCode: item.securityCode },
      });
    }
  }
  await api(`${ck}/sessions/${session.id}/close`, { method: 'POST', token });
}
// Today's session is open: a few children are in class; the plain member checks in his own.
const { session: today } = await api<{ session: { id: string } }>(`${ck}/sessions`, {
  token,
  body: { name: 'Sekolah Minggu Pagi', date: day(0) },
});
await api(`${ck}/sessions/${today.id}/checkins`, {
  token: teacher.token,
  body: {
    children: [
      'Lukas Hutapea',
      'Nadia Hutapea',
      'Samuel Tambunan',
      'Abigail Tambunan',
      'Hana Siregar',
    ].map((name) => ({ personId: kid(name) })),
    method: 'staff',
  },
});
console.info('  check-in ready');

// ---- Finance -------------------------------------------------------------------------------------

const fin = `${c}/finance`;
const openingDate = `${monthsAgo(6).slice(0, 8)}01`;
await api(`${fin}/setup/defaults`, { token, body: { openingDate, cashOpeningBalance: 4_250_000 } });
await api(`${fin}/accounts`, {
  token,
  body: {
    name: 'BCA Gereja',
    type: 'bank',
    bankName: 'BCA',
    accountNumber: '437 0123 456',
    openingBalance: 86_500_000,
    openingDate,
  },
});
await api(`${fin}/accounts`, {
  token,
  body: { name: 'QRIS Gereja', type: 'ewallet', openingBalance: 0, openingDate },
});
const setup = await api<{ funds: Json[]; accounts: Json[]; categories: Json[] }>(`${fin}/setup`, {
  token,
});
const fund = (name: string) => setup.funds.find((item) => item.name === name)!.id as string;
const cashAccount = (name: string) =>
  setup.accounts.find((item) => item.name === name)!.id as string;
const category = (name: string) =>
  setup.categories.find((item) => item.name === name)!.id as string;

const notes = (total: number) => {
  const result: Record<string, number> = {};
  let rest = total;
  for (const value of [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000]) {
    const count = Math.floor(rest / value / (value >= 50_000 ? 1.6 : 1));
    if (count > 0) {
      result[String(value)] = count;
      rest -= count * value;
    }
  }
  return { denominations: result, amount: total - rest };
};
// The treasurer counts each Sunday with a deacon; the elder verifies (segregation of duties).
// The last Sunday's first service still waits for verification, the second is still a draft.
for (let week = 9; week >= 0; week -= 1) {
  for (const [label, amount] of [
    ['Ibadah Umum 1', 4_200_000],
    ['Ibadah Umum 2', 2_650_000],
  ] as const) {
    const { batch } = await api<{ batch: { id: string } }>(`${fin}/offerings`, {
      token: treasurer.token,
      body: {
        serviceDate: pastSunday(week),
        serviceLabel: label,
        accountId: cashAccount('Kas Tunai'),
        counter1UserId: treasurer.user.id,
        counter2Name: week % 2 ? 'Dkn. Sarah Tambunan' : 'Dkn. Markus Siregar',
        lines: [
          {
            fundId: fund('Kas Umum'),
            categoryId: category('Persembahan Ibadah'),
            method: 'cash',
            ...notes(amount + ((week * 137_000) % 900_000)),
          },
          {
            fundId: fund('Kas Umum'),
            categoryId: category('Persembahan Ibadah'),
            method: 'qris',
            accountId: cashAccount('QRIS Gereja'),
            amount: 350_000 + ((week * 61_000) % 400_000),
          },
          ...(label === 'Ibadah Umum 1'
            ? [{ fundId: fund('Pembangunan'), method: 'cash', amount: 750_000 + week * 25_000 }]
            : []),
        ],
        submit: !(week === 0 && label === 'Ibadah Umum 2'),
      },
    });
    if (week > 0)
      await api(`${fin}/offerings/${batch.id}/verify`, { method: 'POST', token: elder.token });
  }
}
// Tithes and gifts from most households over half a year, including the plain member's own.
const givers = [
  'Robert Simanjuntak',
  'Andreas Wijaya',
  'Yohanes Tambunan',
  'Hotman Lumbantobing',
  'Markus Siregar',
  'Bonar Sitompul',
  'Hendra Wibowo',
  'Togar Pardede',
  'Samuel Nainggolan',
  'Daniel Hutapea',
  'Petrus Situmorang',
  'Benny Panjaitan',
  'Agnes Halim',
  'Benyamin Saragih',
  'Theodorus Hasiholan Lumbantobing Simatupang Panggabean',
  'Stefanus Gunawan',
];
const kinds = ['tithe', 'tithe', 'thanksgiving', 'tithe', 'donation', 'special'] as const;
let gift = 0;
for (let month = 5; month >= 0; month -= 1) {
  for (const name of givers) {
    gift += 1;
    const kind = kinds[gift % kinds.length]!;
    await api(`${fin}/contributions`, {
      token: treasurer.token,
      body: {
        personId: person(name),
        kind,
        fundId: kind === 'special' ? fund('Misi') : fund('Kas Umum'),
        accountId: cashAccount('BCA Gereja'),
        method: gift % 3 === 0 ? 'qris' : 'transfer',
        amount: (kind === 'tithe' ? 1_000_000 : 250_000) + ((gift * 175_000) % 1_500_000),
        receivedAt: day(-month * 30 - (gift % 20)),
        reference: `TRX${100200 + gift}`,
      },
    });
  }
}
const campaign = await api<{ campaign: { id: string } }>(`${fin}/campaigns`, {
  token: treasurer.token,
  body: {
    name: 'Renovasi Gedung Gereja',
    description: 'Atap, sound system, dan ruang Sekolah Minggu.',
    fundId: fund('Pembangunan'),
    targetAmount: 750_000_000,
    startDate: day(-150),
    endDate: day(200),
  },
});
for (const [index, name] of [
  'Hendra Wibowo',
  'Andreas Wijaya',
  'Bonar Sitompul',
  'Robert Simanjuntak',
].entries()) {
  await api(`${fin}/campaigns/${campaign.campaign.id}/pledges`, {
    token: treasurer.token,
    body: {
      personId: person(name),
      amount: [25_000_000, 10_000_000, 15_000_000, 5_000_000][index],
    },
  });
  await api(`${fin}/contributions`, {
    token: treasurer.token,
    body: {
      personId: person(name),
      kind: 'pledge_payment',
      fundId: fund('Pembangunan'),
      accountId: cashAccount('BCA Gereja'),
      campaignId: campaign.campaign.id,
      method: 'transfer',
      amount: [7_500_000, 4_000_000, 2_500_000, 5_000_000][index],
      receivedAt: day(-20 - index * 9),
    },
  });
}
// Expenses: the treasurer asks, the elder decides, the treasurer pays.
const expense = async (body: Json, steps: ('approve' | 'reject' | 'pay')[] = []) => {
  const { expense: created } = await api<{ expense: { id: string } }>(`${fin}/expenses`, {
    token: treasurer.token,
    body: { fundId: fund('Kas Umum'), submit: steps.length > 0, ...body },
  });
  for (const step of steps) {
    if (step === 'pay') {
      await api(`${fin}/expenses/${created.id}/pay`, {
        token: treasurer.token,
        body: {
          accountId: cashAccount('BCA Gereja'),
          paidAt: body.paidAt ?? day(-2),
          paymentReference: 'TRF-BCA',
        },
      });
    } else {
      await api(`${fin}/expenses/${created.id}/decide`, {
        token: elder.token,
        body:
          step === 'approve'
            ? { decision: 'approved' }
            : { decision: 'rejected', note: 'Gunakan anggaran Komisi Pemuda' },
      });
    }
  }
};
for (let month = 5; month >= 1; month -= 1) {
  await expense(
    {
      title: `Listrik, air & internet bulan ${monthsAgo(month).slice(0, 7)}`,
      categoryId: category('Listrik, Air & Internet'),
      amount: 2_350_000 + month * 40_000,
      payeeName: 'PLN & PDAM',
      paidAt: day(-month * 30 + 3),
    },
    ['approve', 'pay'],
  );
  await expense(
    {
      title: `Honorarium pemusik bulan ${monthsAgo(month).slice(0, 7)}`,
      categoryId: category('Honorarium'),
      amount: 3_000_000,
      payeeName: 'Tim Musik',
      paidAt: day(-month * 30 + 5),
    },
    ['approve', 'pay'],
  );
}
await expense(
  {
    title: 'Konsumsi Rapat Majelis Jemaat',
    categoryId: category('Pelayanan & Ibadah'),
    amount: 850_000,
    payeeName: 'Katering Berkat',
  },
  ['approve', 'pay'],
);
await expense(
  {
    title: 'Bantuan diakonia keluarga Situmorang',
    categoryId: category('Diakonia'),
    amount: 2_500_000,
    fundId: fund('Diakonia'),
  },
  ['approve'],
);
await expense({
  title: 'Perbaikan sound system',
  categoryId: category('Operasional Gedung'),
  amount: 6_750_000,
  payeeName: 'Toko Audio Sejahtera',
  neededBy: day(10),
  submit: true,
});
await expense(
  { title: 'Kaos retret pemuda', categoryId: category('Pelayanan & Ibadah'), amount: 4_500_000 },
  ['reject'],
);
await expense({ title: 'ATK sekretariat', categoryId: category('Administrasi'), amount: 420_000 });
await api(`${fin}/transfers`, {
  token: treasurer.token,
  body: {
    fromAccountId: cashAccount('Kas Tunai'),
    toAccountId: cashAccount('BCA Gereja'),
    fundId: fund('Kas Umum'),
    amount: 15_000_000,
    transferDate: day(-12),
    note: 'Setor kolekte',
  },
});
await api(`${fin}/budgets`, {
  method: 'PUT',
  token: treasurer.token,
  body: {
    year,
    items: (
      [
        ['Persembahan Ibadah', 380_000_000],
        ['Perpuluhan', 240_000_000],
        ['Persembahan Syukur', 60_000_000],
        ['Persembahan Khusus', 30_000_000],
        ['Donasi', 25_000_000],
        ['Pelayanan & Ibadah', 60_000_000],
        ['Honorarium', 48_000_000],
        ['Operasional Gedung', 36_000_000],
        ['Listrik, Air & Internet', 30_000_000],
        ['Diakonia', 40_000_000],
        ['Misi & Pekabaran Injil', 35_000_000],
        ['Pembangunan', 120_000_000],
        ['Administrasi', 12_000_000],
      ] as const
    ).map(([name, amount]) => ({ categoryId: category(name), amount })),
  },
});
const closing = monthsAgo(2);
await optional('close a month', () =>
  api(`${fin}/periods/${Number(closing.slice(0, 4))}/${Number(closing.slice(5, 7))}/close`, {
    method: 'POST',
    token,
  }),
);
console.info('  finance ready');

// ---- Facilities and inventory --------------------------------------------------------------------

const fac = `${c}/facilities`;
const inv = `${c}/inventory`;
const resource = async (body: Json) =>
  (await api<{ resource: { id: string } }>(`${fac}/resources`, { token, body })).resource.id;
const sanctuary = await resource({
  name: 'Ruang Kebaktian Utama',
  kind: 'sanctuary',
  location: 'Gedung A, lantai 1',
  capacity: 450,
  features: ['Sound system', 'Proyektor ganda', 'Organ pipa', 'AC sentral', 'Live streaming'],
  color: '#7c3aed',
  description: 'Ruang ibadah utama untuk Kebaktian Minggu, Pemberkatan Nikah dan ibadah raya.',
});
const hall = await resource({
  name: 'Aula Serbaguna',
  kind: 'hall',
  location: 'Gedung B, lantai 2',
  capacity: 200,
  features: ['Panggung', 'Sound system portabel', 'Dapur', 'Kursi lipat 150'],
  color: '#d97706',
});
const consistory = await resource({
  name: 'Ruang Konsistori',
  kind: 'room',
  location: 'Gedung A, samping mimbar',
  capacity: 20,
  features: ['Meja rapat', 'TV 55"', 'AC'],
});
const classroom = await resource({
  name: 'Ruang Sekolah Minggu A',
  kind: 'classroom',
  location: 'Gedung C, lantai 1',
  capacity: 30,
  features: ['Papan tulis', 'Karpet'],
  requiresApproval: false,
});
const car = await resource({
  name: 'Mobil Pelayanan Innova',
  kind: 'vehicle',
  location: 'Garasi gereja',
  capacity: 7,
  color: '#4f46e5',
  description: 'Untuk Perkunjungan, antar-jemput lansia dan keperluan pelayanan.',
});
const book = async (who: string, body: Json) =>
  (await api<{ booking: { id: string } }>(`${fac}/bookings`, { token: who, body })).booking.id;
await book(token, {
  resourceId: sanctuary,
  title: 'Kebaktian Minggu Pagi',
  purpose: 'Ibadah umum 1 dan 2',
  startsAt: at(nextSunday, '06:30'),
  endsAt: at(nextSunday, '11:30'),
  recurrence: 'weekly',
  recurrenceUntil: day(180),
  expectedAttendees: 400,
});
await book(token, {
  resourceId: hall,
  title: 'Latihan Paduan Suara Efrata',
  startsAt: at(1, '18:30'),
  endsAt: at(1, '21:00'),
  recurrence: 'weekly',
  recurrenceUntil: day(90),
  groupId: choir,
  expectedAttendees: 35,
});
await book(token, {
  resourceId: car,
  title: 'Perkunjungan lansia Wilayah 3',
  purpose: 'Perkunjungan bersama Penatua',
  startsAt: at(2, '13:00'),
  endsAt: at(2, '16:00'),
});
await book(teacher.token, {
  resourceId: classroom,
  title: 'Latihan Tari Natal Sekolah Minggu',
  startsAt: at(3, '15:00'),
  endsAt: at(3, '17:00'),
});
await book(member.token, {
  resourceId: hall,
  title: 'Ibadah Syukur Ulang Tahun Pernikahan',
  purpose: 'Ibadah keluarga dan makan bersama',
  startsAt: at(10, '17:00'),
  endsAt: at(10, '20:00'),
  expectedAttendees: 60,
  notes: 'Mohon kursi disusun melingkar.',
});
const rejected = await book(member.token, {
  resourceId: sanctuary,
  title: 'Bazar Natal',
  startsAt: at(12, '08:00'),
  endsAt: at(12, '15:00'),
});
await api(`${fac}/bookings/${rejected}/decision`, {
  token,
  body: {
    decision: 'rejected',
    note: 'Ruang Kebaktian tidak dipakai untuk bazar; silakan Aula Serbaguna.',
  },
});
const asset = async (body: Json) =>
  (await api<{ asset: { id: string } }>(`${inv}/assets`, { token, body })).asset.id;
const mixer = await asset({
  name: 'Mixer Yamaha MG16XU',
  category: 'Sound system',
  resourceId: sanctuary,
  location: 'Ruang operator',
  condition: 'good',
  acquisitionDate: '2021-04-12',
  acquisitionValue: 8_750_000,
  custodianPersonId: person('Daniel Hutapea'),
  serialNumber: 'YMG16-04821',
});
const mic = await asset({
  name: 'Mikrofon Wireless Shure BLX288',
  category: 'Sound system',
  resourceId: sanctuary,
  condition: 'good',
  acquisitionDate: '2022-11-03',
  acquisitionValue: 6_200_000,
  custodianPersonId: person('Daniel Hutapea'),
});
await asset({
  name: 'Keyboard Yamaha PSR-SX700',
  category: 'Alat musik',
  resourceId: hall,
  condition: 'good',
  acquisitionDate: '2020-02-01',
  acquisitionValue: 21_500_000,
  custodianPersonId: person('Stefanus Gunawan'),
});
await asset({
  name: 'Set Alat Perjamuan Kudus',
  category: 'Liturgi',
  resourceId: consistory,
  location: 'Lemari konsistori',
  condition: 'new',
  acquisitionDate: '2025-03-30',
  acquisitionValue: 4_800_000,
});
const ac = await asset({
  name: 'AC Daikin 2 PK Aula',
  category: 'Elektronik',
  resourceId: hall,
  condition: 'poor',
  acquisitionDate: '2016-09-10',
  acquisitionValue: 9_600_000,
});
await asset({
  name: 'Tenda Lipat 3x3 m',
  category: 'Perlengkapan acara',
  location: 'Gudang belakang',
  condition: 'broken',
  status: 'maintenance',
  acquisitionDate: '2017-11-02',
  acquisitionValue: 2_250_000,
});
await api(`${inv}/assets/${mic}/loans`, {
  token,
  body: {
    borrowerPersonId: person('Agnes Halim'),
    groupId: youth,
    dueDate: day(5),
    notes: 'Dua mikrofon beserta receiver.',
  },
});
await api(`${inv}/assets/${ac}/maintenance`, {
  token,
  body: {
    date: day(-40),
    kind: 'repair',
    description: 'Isi freon dan ganti kapasitor.',
    cost: 850_000,
    performedBy: 'Teknik Sejuk Bandung',
    nextDueDate: day(20),
  },
});
await api(`${inv}/assets/${mixer}/maintenance`, {
  token,
  body: {
    date: day(-25),
    kind: 'inspection',
    description: 'Pemeriksaan kanal dan fader.',
    performedBy: 'Tim Multimedia',
  },
});
console.info('  facilities ready');

// ---- Attendance history --------------------------------------------------------------------------

const att = `${c}/attendance`;
for (let weeks = 25; weeks >= 0; weeks -= 1) {
  const growth = (25 - weeks) * 2;
  const wobble = ((weeks * 37) % 11) - 5;
  await api(`${att}/sessions`, {
    token,
    body: {
      title: 'Ibadah Minggu Pagi',
      sessionAt: sundayAt(weeks, '07:00'),
      mode: 'headcount',
      headcount: {
        men: 92 + growth + wobble,
        women: 118 + growth + wobble * 2,
        children: 41 + Math.round(growth / 2),
        visitors: 6 + (weeks % 4),
      },
    },
  });
}
const youthMembers = [
  'Natalia Sitompul',
  'Agnes Halim',
  'Stefanus Gunawan',
  'Priskila Hutagalung',
  'Jonathan Sembiring',
  'Filipus Damanik',
  'Yohana Sihite',
  'Andre Lubis',
];
for (let weeks = 7; weeks >= 0; weeks -= 1) {
  const { session } = await api<{ session: { id: string } }>(`${att}/sessions`, {
    token,
    body: { title: 'Persekutuan Pemuda', groupId: youth, sessionAt: sundayAt(weeks, '18:00', -1) },
  });
  await api(`${att}/sessions/${session.id}/records`, {
    method: 'PUT',
    token,
    body: {
      records: youthMembers.map((name) => ({
        personId: person(name),
        status:
          (name === 'Andre Lubis' || name === 'Filipus Damanik') && weeks <= 3
            ? 'absent'
            : name === 'Agnes Halim' && weeks === 1
              ? 'excused'
              : 'present',
        note: name === 'Agnes Halim' && weeks === 1 ? 'Ujian kampus' : null,
      })),
    },
  });
}
console.info('  attendance ready');

// ---- Warta Jemaat (last, so its sections show this week's data) -------------------------------

const current = await api<{ bulletin: { id: string } }>(`${c}/bulletins`, {
  token: admin.token,
  body: {
    title: 'Warta Jemaat',
    issueDate: day(nextSunday),
    theme: 'Bersiaplah menyambut Dia',
    sections,
  },
});
await api(`${c}/bulletins/${current.bulletin.id}/publish`, { method: 'POST', token: admin.token });
const previous = await api<{ bulletin: { id: string } }>(`${c}/bulletins`, {
  token: admin.token,
  body: {
    title: 'Warta Jemaat',
    issueDate: day(nextSunday - 7),
    theme: 'Hidup dalam pengharapan',
    sections: sections.slice(0, 5),
  },
});
await api(`${c}/bulletins/${previous.bulletin.id}/publish`, { method: 'POST', token: admin.token });
await api(`${c}/bulletins/${current.bulletin.id}/duplicate`, {
  method: 'POST',
  token: admin.token,
});

console.info(
  `Done: GKI Kebon Jati (${churchId}). Sign in with any account above and "${password}".`,
);
