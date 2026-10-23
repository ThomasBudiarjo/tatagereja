/**
 * A large church for performance work: the shape of a big GKI/HKBP congregation after two years
 * of use, written straight into a SQLite file so it takes seconds rather than hours.
 *
 *   bun scripts/seed-large.ts --db /tmp/tatagereja-large.db --reset
 *   WEB_DIST_DIR=$PWD/apps/web/dist PORT=3202 DATABASE_PATH=/tmp/tatagereja-large.db bun run start
 *   bun scripts/bench-api.ts --port 3202
 *
 * The accounts, the church, its roles and the finance setup go through the API in-process, so
 * they are exactly what the app creates. Everything else is inserted directly: 8,000 people in
 * 2,500 households and 20 areas, 150 groups, two years of weekly services (two Sunday services)
 * with roster attendance (~400k records), ~50k ledger entries, ~5k care entries, 3k registry
 * records, 2k bookings, 1k assets, 300 events with registrations, 20k notifications and 50k
 * audit rows. Random choices use a fixed seed, so two runs produce the same church.
 *
 * Accounts (password `bench-password`, or --password):
 *
 *   owner@large.test      owner
 *   admin@large.test      administrator with the Sekretaris role
 *   treasurer@large.test  member with the Bendahara role
 *   member@large.test     plain member who leads two groups
 *
 * Options: --db <path> (default $DATABASE_PATH or /tmp/tatagereja-large.db), --reset to replace an
 * existing file, --password <secret>, --scale <factor> (0.1 gives a tenth of every volume).
 */
import { existsSync, rmSync } from 'node:fs';
import { createApp, createDeps } from '../apps/api/src/app';
import { testConfig } from '../apps/api/src/config';
import { insertRows } from '../apps/api/src/db/bulk';
import { openDatabase } from '../apps/api/src/db/client';
import * as schema from '../apps/api/src/db/schema';
import { createRateLimiter } from '../apps/api/src/lib/rate-limit';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const dbPath = option('db', process.env.DATABASE_PATH || '/tmp/tatagereja-large.db');
const password = option('password', 'bench-password');
const scale = Number(option('scale', '1'));
const n = (count: number) => Math.max(1, Math.round(count * scale));

if (existsSync(dbPath)) {
  if (!args.includes('--reset')) {
    console.error(`${dbPath} exists. Pass --reset to replace it.`);
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
}

const started = performance.now();
const handle = openDatabase(dbPath);
const { db, sqlite } = handle;
const unlimited = () => createRateLimiter({ windowMs: 60_000, max: 1_000_000 });
const app = createApp(
  createDeps(db, testConfig({ databasePath: dbPath }), {
    limiters: { login: unlimited(), register: unlimited(), invitation: unlimited() },
  }),
);

// ---- Helpers -----------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose API payloads in a dev script
type Json = Record<string, any>;

async function api<T = Json>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const response = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${json.error?.message ?? ''}`);
  }
  return json;
}

/** Deterministic PRNG (mulberry32), so every run builds the same church. */
let state = 0x7a7a6e;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (p: number) => random() < p;

/** RFC 4122 v4-shaped ids from the seeded PRNG (the API validates ids as UUIDs). */
const hex = (length: number) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join('');
const uuid = () =>
  `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;

const DAY = 86_400_000;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dayOffset = (offset: number) => new Date(Date.parse(today) + offset * DAY);
const dateOf = (offset: number) => dayOffset(offset).toISOString().slice(0, 10);
/** An instant at a Jakarta local time on the day `offset` days from today. */
const instantOf = (offset: number, hour: number, minute = 0) =>
  new Date(dayOffset(offset).getTime() + (hour - 7) * 3_600_000 + minute * 60_000).toISOString();
const nowIso = new Date().toISOString();

const counts: Record<string, number> = {};
const put = (table: Parameters<typeof insertRows>[1], rows: Record<string, unknown>[]) => {
  const name = insertRows(sqlite, table, rows);
  counts[name] = (counts[name] ?? 0) + rows.length;
};

// ---- Names -------------------------------------------------------------------------------------

const FIRST_MALE = [
  'Andreas',
  'Bonar',
  'Daniel',
  'Elia',
  'Febrian',
  'Gideon',
  'Hendra',
  'Imanuel',
  'Johannes',
  'Kristian',
  'Lukas',
  'Markus',
  'Natanael',
  'Obaja',
  'Paulus',
  'Rudi',
  'Samuel',
  'Timotius',
  'Yosua',
  'Yohanes',
  'Agus',
  'Benny',
  'Christo',
  'David',
  'Efraim',
  'Frans',
  'Hotma',
  'Jonatan',
];
const FIRST_FEMALE = [
  'Agnes',
  'Betty',
  'Christine',
  'Debora',
  'Ester',
  'Febe',
  'Grace',
  'Hana',
  'Imelda',
  'Junita',
  'Kezia',
  'Lidia',
  'Maria',
  'Naomi',
  'Priskila',
  'Rut',
  'Sarah',
  'Tabita',
  'Veronika',
  'Yemima',
  'Anita',
  'Clara',
  'Dina',
  'Elisabet',
  'Fransiska',
  'Irene',
  'Lusiana',
  'Monika',
];
const LAST = [
  'Simanjuntak',
  'Sitompul',
  'Tambunan',
  'Lumbantobing',
  'Pakpahan',
  'Siregar',
  'Wijaya',
  'Hutapea',
  'Nainggolan',
  'Panjaitan',
  'Sihombing',
  'Manurung',
  'Situmorang',
  'Tanoto',
  'Halim',
  'Gunawan',
  'Santoso',
  'Kurniawan',
  'Hartono',
  'Setiawan',
  'Lumban Gaol',
  'Silalahi',
  'Sinaga',
  'Purba',
  'Saragih',
  'Tarigan',
  'Ginting',
  'Sembiring',
  'Wenas',
  'Rumondor',
  'Pattinasarany',
];
const STREETS = ['Jl. Kebon Jati', 'Jl. Merdeka', 'Jl. Sudirman', 'Jl. Dago', 'Jl. Cihampelas'];
const LOREM =
  'Tuhan adalah gembalaku, takkan kekurangan aku. Ia membaringkan aku di padang yang berumput hijau, ' +
  'Ia membimbing aku ke air yang tenang; Ia menyegarkan jiwaku. Ia menuntun aku di jalan yang benar ' +
  'oleh karena nama-Nya. Sekalipun aku berjalan dalam lembah kekelaman, aku tidak takut bahaya, ' +
  'sebab Engkau besertaku; gada-Mu dan tongkat-Mu, itulah yang menghibur aku. ';
const text = (sentences: number) => LOREM.repeat(Math.ceil(sentences / 4)).slice(0, sentences * 60);

// ---- Accounts, church and roles through the API ------------------------------------------------

console.info(`Seeding ${dbPath} (scale ${scale})`);

const register = async (name: string, email: string) =>
  api<{ token: string; user: { id: string } }>('/auth/register', {
    body: { name, email, password },
  });
const owner = await register('Pdt. Samuel Hutapea', 'owner@large.test');
const admin = await register('Yohanes Tambunan', 'admin@large.test');
const treasurer = await register('Ester Lumbantobing', 'treasurer@large.test');
const member = await register('Andreas Wijaya', 'member@large.test');

const { church } = await api<{ church: { id: string } }>('/churches', {
  token: owner.token,
  body: {
    name: 'GKI Pondok Indah Raya',
    city: 'Jakarta Selatan',
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
  },
});
const churchId = church.id;
const c = `/churches/${churchId}`;
const invitation = await api<{ invitation: { token: string } }>(`${c}/invitations`, {
  token: owner.token,
  body: { expiresInDays: 7 },
});
for (const account of [admin, treasurer, member]) {
  await api(`/invitations/${invitation.invitation.token}/accept`, {
    token: account.token,
    method: 'POST',
  });
}
const memberships = (
  await api<{ items: { id: string; userId: string }[] }>(`${c}/members`, {
    token: owner.token,
  })
).items;
const membershipOf = (userId: string) => memberships.find((item) => item.userId === userId)!.id;
await api(`${c}/members/${membershipOf(admin.user.id)}`, {
  token: owner.token,
  method: 'PATCH',
  body: { role: 'administrator' },
});
const roles = (
  await api<{ items: { id: string; templateKey: string | null }[] }>(`${c}/roles`, {
    token: owner.token,
  })
).items;
const roleOf = (key: string) => roles.find((role) => role.templateKey === key)!.id;
await api(`${c}/members/${membershipOf(admin.user.id)}/roles`, {
  token: owner.token,
  body: { roleId: roleOf('secretary') },
});
await api(`${c}/members/${membershipOf(treasurer.user.id)}/roles`, {
  token: owner.token,
  body: { roleId: roleOf('treasurer') },
});
const openingDate = dateOf(-760);
await api(`${c}/finance/setup/defaults`, {
  token: owner.token,
  body: { openingDate, cashOpeningBalance: 25_000_000 },
});
await api(`${c}/finance/accounts`, {
  token: owner.token,
  body: {
    name: 'BCA Giro',
    type: 'bank',
    bankName: 'BCA',
    accountNumber: '1234567890',
    openingBalance: 480_000_000,
    openingDate,
  },
});
const setup = await api<{
  funds: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  categories: { id: string; kind: 'income' | 'expense'; name: string }[];
}>(`${c}/finance/setup`, { token: owner.token });

const userIds = [owner.user.id, admin.user.id, treasurer.user.id, member.user.id];
const staffIds = [owner.user.id, admin.user.id, treasurer.user.id];

// ---- People, households and areas --------------------------------------------------------------

const areaIds: string[] = [];
put(
  schema.areas,
  Array.from({ length: n(20) }, (_, index) => {
    const id = uuid();
    areaIds.push(id);
    return {
      id,
      churchId,
      name: `Wilayah ${index + 1}`,
      code: `W-${String(index + 1).padStart(2, '0')}`,
      description: null,
      color: null,
      sortOrder: index * 10,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }),
);

type SeedPerson = { id: string; status: string; householdId: string; service: 1 | 2; p: number };
const persons: SeedPerson[] = [];
const householdRows: Record<string, unknown>[] = [];
const personRows: Record<string, unknown>[] = [];
const householdMemberRows: Record<string, unknown>[] = [];
const householdCount = n(2500);
const peopleTarget = n(8000);
const linked = [owner, admin, treasurer, member];
const linkedNames = [
  ['Samuel', 'Hutapea', 'male'],
  ['Yohanes', 'Tambunan', 'male'],
  ['Ester', 'Lumbantobing', 'female'],
  ['Andreas', 'Wijaya', 'male'],
] as const;

for (let h = 0; h < householdCount; h += 1) {
  const householdId = uuid();
  const lastName = pick(LAST);
  householdRows.push({
    id: householdId,
    churchId,
    name: `Keluarga ${lastName}`,
    areaId: pick(areaIds),
    address: `${pick(STREETS)} No. ${int(1, 250)}`,
    city: 'Jakarta',
    postalCode: String(int(10000, 19999)),
    phone: `08${int(1000000000, 9999999999)}`,
    photoUrl: null,
    notes: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  const remaining = peopleTarget - personRows.length;
  const housesLeft = householdCount - h;
  const size =
    h === householdCount - 1
      ? remaining
      : Math.max(1, Math.min(6, Math.round(remaining / housesLeft + (random() - 0.5) * 3)));
  const service = chance(0.55) ? 1 : 2;
  for (let m = 0; m < size; m += 1) {
    const id = uuid();
    const index = personRows.length;
    const linkedAccount = index < linked.length ? linked[index] : undefined;
    const names = index < linkedNames.length ? linkedNames[index] : undefined;
    const relationship = m === 0 ? 'head' : m === 1 ? 'spouse' : 'child';
    const gender = names?.[2] ?? (m === 0 ? 'male' : m === 1 ? 'female' : pick(['male', 'female']));
    const age = m < 2 ? int(28, 82) : int(0, 30);
    const status = names
      ? 'member'
      : pick([
          'member',
          'member',
          'member',
          'member',
          'member',
          'regular',
          'regular',
          'visitor',
          'inactive',
        ]);
    const birth = dayOffset(-age * 365 - int(0, 364))
      .toISOString()
      .slice(0, 10);
    personRows.push({
      id,
      churchId,
      firstName: names?.[0] ?? (gender === 'male' ? pick(FIRST_MALE) : pick(FIRST_FEMALE)),
      lastName: names?.[1] ?? lastName,
      gender,
      birthDate: birth,
      email: chance(0.5) ? `jemaat${index}@example.test` : null,
      phone: chance(0.7) ? `08${int(1000000000, 9999999999)}` : null,
      address: null,
      photoUrl: null,
      membershipStatus: status,
      joinedAt: dateOf(-int(0, 9000)),
      weddingDate: m < 2 && age > 30 ? dateOf(-int(400, 15000)) : null,
      notes: chance(0.1) ? text(2) : null,
      userId: linkedAccount?.user.id ?? null,
      createdAt: new Date(Date.now() - int(0, 730) * DAY).toISOString(),
      updatedAt: nowIso,
    });
    householdMemberRows.push({
      id: uuid(),
      churchId,
      householdId,
      personId: id,
      relationship,
      isPrimaryContact: m === 0,
      addedAt: nowIso,
    });
    persons.push({ id, status, householdId, service, p: 0.25 + random() * 0.75 });
  }
}
put(schema.households, householdRows);
put(schema.people, personRows);
put(schema.householdMembers, householdMemberRows);
const personIds = persons.map((person) => person.id);
const ownerPersonId = personIds[0]!;
const memberPersonId = personIds[3]!;

const tagIds = Array.from({ length: 10 }, () => uuid());
put(
  schema.personTags,
  [
    'Paduan Suara',
    'Majelis',
    'Diaken',
    'Guru SM',
    'Lansia',
    'Pemuda',
    'Remaja',
    'Multimedia',
    'Usher',
    'Musik',
  ].map((name, index) => ({ id: tagIds[index]!, churchId, name, color: null, createdAt: nowIso })),
);
put(
  schema.personTagAssignments,
  personIds.flatMap((personId) =>
    chance(0.4)
      ? [...new Set([pick(tagIds), pick(tagIds)])].map((tagId) => ({
          personId,
          tagId,
          churchId,
          assignedAt: nowIso,
        }))
      : [],
  ),
);

// ---- Groups ------------------------------------------------------------------------------------

const groupIds: string[] = [];
const groupTypes = ['komisi', 'small_group', 'choir', 'ministry', 'committee'] as const;
put(
  schema.groups,
  Array.from({ length: n(150) }, (_, index) => {
    const id = uuid();
    groupIds.push(id);
    const type = index < 6 ? 'komisi' : pick(groupTypes);
    return {
      id,
      churchId,
      name:
        index < 6
          ? [
              'Komisi Pemuda',
              'Komisi Remaja',
              'Komisi Wanita',
              'Komisi Pria',
              'Komisi Lansia',
              'Komisi Anak',
            ][index]
          : `${type === 'choir' ? 'Paduan Suara' : type === 'small_group' ? 'Kelompok Sel' : 'Pelayanan'} ${index + 1}`,
      description: chance(0.5) ? text(3) : null,
      type,
      meetingSchedule: null,
      meetingDay: int(0, 6),
      meetingTime: '19:00',
      meetingFrequency: 'weekly',
      location: 'Gedung Serbaguna',
      capacity: null,
      coverColor: null,
      visibility: chance(0.8) ? 'public' : 'private',
      joinPolicy: 'request',
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }),
);
const groupMemberRows: Record<string, unknown>[] = [];
for (const groupId of groupIds) {
  const size = int(10, 70);
  const chosen = new Set<string>();
  while (chosen.size < size) chosen.add(pick(personIds));
  for (const personId of chosen) {
    groupMemberRows.push({ id: uuid(), groupId, personId, churchId, addedAt: nowIso });
  }
}
put(schema.groupMembers, groupMemberRows);
put(
  schema.groupLeaders,
  groupIds.slice(0, 2).map((groupId) => ({
    id: uuid(),
    groupId,
    userId: member.user.id,
    churchId,
    assignedAt: nowIso,
  })),
);

// ---- Worship services and attendance -----------------------------------------------------------

const serviceTypeIds = [uuid(), uuid(), uuid()];
put(
  schema.serviceTypes,
  ['Ibadah Umum 1', 'Ibadah Umum 2', 'Ibadah Pemuda'].map((name, index) => ({
    id: serviceTypeIds[index]!,
    churchId,
    name,
    category: index === 2 ? 'youth' : 'general',
    defaultTime: ['07:00', '10:00', '17:00'][index],
    defaultDurationMinutes: 90,
    defaultLocation: 'Gedung Gereja',
    color: null,
    sortOrder: index * 10,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  })),
);

const songIds: string[] = [];
put(
  schema.songs,
  Array.from({ length: n(400) }, (_, index) => {
    const id = uuid();
    songIds.push(id);
    return {
      id,
      churchId,
      title: `${pick(['Kidung', 'Pujian', 'Mazmur', 'Nyanyian'])} ${index + 1}`,
      author: pick(['Anonim', 'H. A. Pandopo', 'Fanny Crosby', 'Charles Wesley']),
      defaultKey: pick(['C', 'D', 'E', 'F', 'G', 'A', 'Bes']),
      tempo: int(60, 140),
      lyrics: text(40),
      tags: [pick(['pujian', 'penyembahan', 'natal', 'paskah', 'persembahan'])],
      ccliNumber: null,
      hymnal: pick(['KJ', 'PKJ', 'NKB', null]),
      hymnalNumber: String(int(1, 480)),
      notes: null,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }),
);

const teams = ['Pemandu Pujian', 'Pemusik', 'Penerima Tamu', 'Multimedia', 'Kolektan'];
const teamIds = teams.map(() => uuid());
const positionIds = teams.map(() => uuid());
put(
  schema.servingTeams,
  teams.map((name, index) => ({
    id: teamIds[index]!,
    churchId,
    name,
    description: null,
    color: null,
    groupId: null,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  })),
);
put(
  schema.servingPositions,
  teams.map((name, index) => ({
    id: positionIds[index]!,
    churchId,
    teamId: teamIds[index]!,
    name,
    description: null,
    needed: 2,
    sortOrder: 0,
    createdAt: nowIso,
  })),
);
const teamMembers = teams.map(() => Array.from({ length: 20 }, () => pick(personIds)));
put(
  schema.servingTeamMembers,
  teamMembers.flatMap((members, index) =>
    [...new Set(members)].map((personId) => ({
      id: uuid(),
      churchId,
      teamId: teamIds[index]!,
      personId,
      role: 'member',
      joinedAt: nowIso,
    })),
  ),
);

const weeks = n(104);
const serviceRows: Record<string, unknown>[] = [];
const sessionRows: Record<string, unknown>[] = [];
const liturgyRows: Record<string, unknown>[] = [];
const rosterRows: Record<string, unknown>[] = [];
const attendanceRows: Record<string, unknown>[] = [];
const sundays: number[] = [];
const lastSunday = -((dayOffset(0).getUTCDay() + 7) % 7);
for (let week = weeks - 1; week >= -4; week -= 1) sundays.push(lastSunday - week * 7);
const pastServices: { id: string; offset: number; slot: 1 | 2 }[] = [];

for (const offset of sundays) {
  for (const slot of [1, 2] as const) {
    const serviceId = uuid();
    const startsAt = instantOf(offset, slot === 1 ? 7 : 10);
    const past = offset < 0;
    let sessionId: string | null = null;
    if (past) {
      sessionId = uuid();
      sessionRows.push({
        id: sessionId,
        churchId,
        eventId: null,
        groupId: null,
        title: `Ibadah Umum ${slot}`,
        sessionAt: startsAt,
        mode: 'roster',
        headcountMen: null,
        headcountWomen: null,
        headcountChildren: null,
        headcountVisitors: null,
        notes: null,
        createdBy: admin.user.id,
        createdAt: startsAt,
        updatedAt: startsAt,
      });
      pastServices.push({ id: serviceId, offset, slot });
    }
    serviceRows.push({
      id: serviceId,
      churchId,
      serviceTypeId: serviceTypeIds[slot - 1]!,
      title: `Ibadah Umum ${slot}`,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 90 * 60_000).toISOString(),
      location: 'Gedung Gereja',
      theme: 'Hidup sebagai anak terang',
      scriptureReadings: ['Efesus 5:8-14', 'Mazmur 23'],
      preacherPersonId: ownerPersonId,
      preacherName: null,
      notes: null,
      status: 'published',
      attendanceSessionId: sessionId,
      createdBy: admin.user.id,
      createdAt: startsAt,
      updatedAt: startsAt,
    });
    for (let position = 0; position < 8; position += 1) {
      const song = position % 2 === 0;
      liturgyRows.push({
        id: uuid(),
        churchId,
        serviceId,
        position,
        type: song ? 'song' : pick(['reading', 'prayer', 'sermon', 'offering']),
        title: song ? 'Nyanyian Jemaat' : 'Doa',
        durationMinutes: 5,
        songId: song ? pick(songIds) : null,
        songKey: null,
        personId: null,
        personName: null,
        notes: null,
        createdAt: startsAt,
        updatedAt: startsAt,
      });
    }
    teams.forEach((_, index) => {
      const people = [...new Set([pick(teamMembers[index]!), pick(teamMembers[index]!)])];
      for (const personId of people) {
        rosterRows.push({
          id: uuid(),
          churchId,
          serviceId,
          teamId: teamIds[index]!,
          positionId: positionIds[index]!,
          personId,
          status: past ? 'accepted' : pick(['pending', 'accepted', 'declined']),
          declineReason: null,
          respondedAt: null,
          notifiedAt: startsAt,
          notes: null,
          assignedBy: admin.user.id,
          createdAt: startsAt,
          updatedAt: startsAt,
        });
      }
    });
    if (sessionId) {
      for (const person of persons) {
        if (person.service !== slot) continue;
        if (person.status === 'visitor' || person.status === 'inactive') continue;
        const roll = random();
        const status = roll < person.p ? 'present' : roll < person.p + 0.12 ? 'absent' : null;
        if (!status) continue;
        attendanceRows.push({
          id: uuid(),
          sessionId,
          personId: person.id,
          churchId,
          status: status === 'absent' && chance(0.3) ? 'excused' : status,
          sessionAt: startsAt,
          note: null,
          recordedBy: admin.user.id,
          recordedAt: startsAt,
        });
      }
    }
  }
}
put(schema.attendanceSessions, sessionRows);
put(schema.worshipServices, serviceRows);
put(schema.liturgyItems, liturgyRows);
put(schema.rosterAssignments, rosterRows);
put(schema.attendanceRecords, attendanceRows);
attendanceRows.length = 0;

// ---- Events, registrations and announcements ---------------------------------------------------

const eventRows: Record<string, unknown>[] = [];
const registrationRows: Record<string, unknown>[] = [];
for (let index = 0; index < n(300); index += 1) {
  const id = uuid();
  const offset = int(-700, 90);
  const registrationRequired = chance(0.4);
  const startsAt = instantOf(offset, int(8, 19));
  eventRows.push({
    id,
    churchId,
    groupId: chance(0.3) ? pick(groupIds) : null,
    title: `${pick(['Retret', 'Persekutuan', 'Seminar', 'Bakti Sosial', 'Rapat Majelis', 'Natal'])} ${index + 1}`,
    description: text(4),
    location: pick(['Aula', 'Gedung Serbaguna', 'Puncak', 'Ruang Konsistori']),
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    isAllDay: false,
    seriesId: null,
    isSeriesException: false,
    coverColor: null,
    capacity: registrationRequired ? int(30, 200) : null,
    registrationRequired,
    registrationClosesAt: null,
    waitlistEnabled: true,
    checkInEnabled: false,
    cancelledAt: null,
    createdBy: admin.user.id,
    createdAt: startsAt,
    updatedAt: startsAt,
  });
  if (registrationRequired) {
    const chosen = new Set<string>();
    const target = int(10, 60);
    while (chosen.size < target) chosen.add(pick(personIds));
    for (const personId of chosen) {
      registrationRows.push({
        id: uuid(),
        churchId,
        eventId: id,
        personId,
        registeredBy: null,
        status: chance(0.9) ? 'registered' : 'waitlisted',
        partySize: 1,
        note: null,
        promotedAt: null,
        cancelledAt: null,
        checkedInAt: null,
        checkedInBy: null,
        createdAt: startsAt,
        updatedAt: startsAt,
      });
    }
  }
}
put(schema.events, eventRows);
put(schema.eventRegistrations, registrationRows);

put(
  schema.announcements,
  Array.from({ length: n(500) }, (_, index) => {
    const at = new Date(Date.now() - int(0, 730) * DAY).toISOString();
    return {
      id: uuid(),
      churchId,
      groupId: null,
      title: `Pengumuman ${index + 1}`,
      body: text(30),
      status: 'published',
      publishedAt: at,
      audience: 'church',
      publishAt: null,
      expiresAt: null,
      pinnedAt: index < 2 ? at : null,
      coverImageUrl: null,
      notifiedAt: at,
      createdBy: admin.user.id,
      createdAt: at,
      updatedAt: at,
    };
  }),
);
put(
  schema.bulletins,
  sundays
    .filter((offset) => offset <= 0)
    .map((offset) => ({
      id: uuid(),
      churchId,
      title: `Warta Jemaat ${dateOf(offset)}`,
      issueDate: dateOf(offset),
      theme: 'Hidup sebagai anak terang',
      coverImageUrl: null,
      sections: [
        { id: 'intro', kind: 'text', title: 'Renungan', body: text(12), itemIds: [] },
        { id: 'services', kind: 'services', title: 'Jadwal ibadah', body: null, itemIds: [] },
        { id: 'birthdays', kind: 'birthdays', title: 'Ulang tahun', body: null, itemIds: [] },
      ],
      includeFinanceSummary: false,
      status: 'published',
      publishedAt: instantOf(offset - 1, 18),
      createdBy: admin.user.id,
      updatedBy: admin.user.id,
      createdAt: instantOf(offset - 2, 18),
      updatedAt: instantOf(offset - 1, 18),
    })),
);

// ---- Finance -----------------------------------------------------------------------------------

const fundId = (name: string) =>
  (setup.funds.find((fund) => fund.name === name) ?? setup.funds[0]!).id;
const generalFund = fundId('Kas Umum');
const cashAccount = setup.accounts.find((account) => account.name !== 'BCA Giro')!.id;
const bankAccount = setup.accounts.find((account) => account.name === 'BCA Giro')!.id;
const incomeCategories = setup.categories.filter((category) => category.kind === 'income');
const expenseCategories = setup.categories.filter((category) => category.kind === 'expense');
const entryRows: Record<string, unknown>[] = [];
const entry = (row: {
  date: string;
  accountId: string;
  fundId: string;
  categoryId: string | null;
  amount: number;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy: string;
}) =>
  entryRows.push({
    id: uuid(),
    churchId,
    entryDate: row.date,
    accountId: row.accountId,
    fundId: row.fundId,
    categoryId: row.categoryId,
    amount: row.amount,
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdBy: row.createdBy,
    createdAt: `${row.date}T05:00:00.000Z`,
  });

const batchRows: Record<string, unknown>[] = [];
const lineRows: Record<string, unknown>[] = [];
for (const service of pastServices) {
  const id = uuid();
  const date = dateOf(service.offset);
  const lines = [
    { fundId: generalFund, method: 'cash', amount: int(8, 30) * 1_000_000 },
    { fundId: fundId('Pembangunan'), method: 'cash', amount: int(1, 8) * 1_000_000 },
    { fundId: generalFund, method: 'qris', amount: int(1, 6) * 1_000_000 },
  ];
  batchRows.push({
    id,
    churchId,
    serviceDate: date,
    worshipServiceId: service.id,
    serviceLabel: null,
    accountId: cashAccount,
    status: 'verified',
    totalAmount: lines.reduce((sum, line) => sum + line.amount, 0),
    counter1UserId: treasurer.user.id,
    counter1Name: null,
    counter2UserId: admin.user.id,
    counter2Name: null,
    notes: null,
    submittedAt: `${date}T06:00:00.000Z`,
    submittedBy: treasurer.user.id,
    updatedBy: treasurer.user.id,
    editorUserIds: [treasurer.user.id],
    verifiedBy: owner.user.id,
    verifiedAt: `${date}T07:00:00.000Z`,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdBy: treasurer.user.id,
    createdAt: `${date}T05:00:00.000Z`,
    updatedAt: `${date}T07:00:00.000Z`,
  });
  lines.forEach((line, position) => {
    const categoryId = incomeCategories[0]?.id ?? null;
    lineRows.push({
      id: uuid(),
      churchId,
      batchId: id,
      fundId: line.fundId,
      categoryId,
      method: line.method,
      accountId: line.method === 'qris' ? bankAccount : null,
      amount: line.amount,
      denominations: {},
      note: null,
      position,
    });
    entry({
      date,
      accountId: line.method === 'qris' ? bankAccount : cashAccount,
      fundId: line.fundId,
      categoryId,
      amount: line.amount,
      description: `Persembahan Ibadah Umum ${service.slot}`,
      sourceType: 'offering',
      sourceId: id,
      createdBy: owner.user.id,
    });
  });
}
put(schema.offeringBatches, batchRows);
put(schema.offeringBatchLines, lineRows);

const contributionRows: Record<string, unknown>[] = [];
const givers = personIds.filter((_, index) => index % 3 !== 2);
const contributionCount = n(46_000);
const receiptCounters = new Map<string, number>();
/** `KW-2026-00042`, the app's own receipt format (numbered per year in insertion order). */
const receiptNumber = (date: string) => {
  const year = date.slice(0, 4);
  const next = (receiptCounters.get(year) ?? 0) + 1;
  receiptCounters.set(year, next);
  return `KW-${year}-${String(next).padStart(5, '0')}`;
};
for (let index = 0; index < contributionCount; index += 1) {
  const id = uuid();
  const offset = -int(0, 729);
  const date = dateOf(offset);
  const kind = pick(['tithe', 'tithe', 'tithe', 'thanksgiving', 'special', 'donation']);
  const amount = int(5, 500) * 10_000;
  const categoryId = pick(incomeCategories).id;
  const accountId = chance(0.6) ? bankAccount : cashAccount;
  const recordedBy = chance(0.8) ? treasurer.user.id : admin.user.id;
  contributionRows.push({
    id,
    churchId,
    personId: index === 0 || index % 97 === 0 ? memberPersonId : chance(0.95) ? pick(givers) : null,
    donorName: null,
    kind,
    fundId: kind === 'special' ? fundId('Misi') : generalFund,
    accountId,
    categoryId,
    campaignId: null,
    method: accountId === bankAccount ? 'transfer' : 'cash',
    amount,
    receivedAt: date,
    reference: null,
    receiptNumber: receiptNumber(date),
    note: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    recordedBy,
    createdAt: `${date}T04:00:00.000Z`,
    updatedAt: `${date}T04:00:00.000Z`,
  });
  entry({
    date,
    accountId,
    fundId: kind === 'special' ? fundId('Misi') : generalFund,
    categoryId,
    amount,
    description: 'Persembahan',
    sourceType: 'contribution',
    sourceId: id,
    createdBy: recordedBy,
  });
}
put(schema.financeContributions, contributionRows);
contributionRows.length = 0;

const expenseRows: Record<string, unknown>[] = [];
for (let index = 0; index < n(1500); index += 1) {
  const id = uuid();
  const offset = -int(0, 729);
  const date = dateOf(offset);
  const paid = chance(0.85);
  const amount = int(2, 300) * 50_000;
  const categoryId = pick(expenseCategories).id;
  expenseRows.push({
    id,
    churchId,
    title: `${pick(['Listrik', 'Air', 'Honor pemusik', 'Konsumsi', 'Perawatan gedung', 'ATK'])} ${index + 1}`,
    description: null,
    categoryId,
    fundId: generalFund,
    amount,
    payeeName: null,
    neededBy: date,
    attachmentUrls: [],
    isReimbursement: false,
    reimbursePersonId: null,
    status: paid ? 'paid' : pick(['submitted', 'approved', 'rejected']),
    requestedBy: admin.user.id,
    editorUserIds: [admin.user.id],
    submittedAt: `${date}T03:00:00.000Z`,
    decidedBy: paid ? treasurer.user.id : null,
    decidedAt: paid ? `${date}T04:00:00.000Z` : null,
    decisionNote: null,
    paidAt: paid ? `${date}T05:00:00.000Z` : null,
    paidBy: paid ? treasurer.user.id : null,
    paidFromAccountId: paid ? bankAccount : null,
    paymentReference: null,
    createdAt: `${date}T02:00:00.000Z`,
    updatedAt: `${date}T05:00:00.000Z`,
  });
  if (paid) {
    entry({
      date,
      accountId: bankAccount,
      fundId: generalFund,
      categoryId,
      amount: -amount,
      description: 'Pengeluaran',
      sourceType: 'expense',
      sourceId: id,
      createdBy: treasurer.user.id,
    });
  }
}
put(schema.expenseRequests, expenseRows);
put(schema.financeEntries, entryRows);
entryRows.length = 0;
const year = Number(today.slice(0, 4));
put(
  schema.financeBudgets,
  [year - 1, year].flatMap((budgetYear) =>
    setup.categories.map((category) => ({
      id: uuid(),
      churchId,
      year: budgetYear,
      categoryId: category.id,
      amount: int(50, 900) * 1_000_000,
      notes: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })),
  ),
);

// ---- Pastoral care -----------------------------------------------------------------------------

const caseIds: string[] = [];
const caseRows = Array.from({ length: n(800) }, () => {
  const id = uuid();
  caseIds.push(id);
  const at = new Date(Date.now() - int(0, 729) * DAY).toISOString();
  const status = pick(['open', 'in_progress', 'closed', 'closed']);
  return {
    id,
    churchId,
    personId: pick(personIds),
    householdId: null,
    category: pick(['visitation', 'counseling', 'hospital', 'grief', 'financial_aid', 'other']),
    priority: pick(['low', 'normal', 'normal', 'high', 'urgent']),
    status,
    confidentiality: chance(0.15) ? 'confidential' : 'normal',
    title: pick(['Kunjungan RS', 'Pendampingan duka', 'Konseling keluarga', 'Kunjungan lansia']),
    description: text(6),
    nextActionDate: status === 'closed' ? null : dateOf(int(-20, 30)),
    nextActionNote: null,
    reminderSentAt: null,
    closedAt: status === 'closed' ? at : null,
    closedReason: null,
    openedBy: owner.user.id,
    createdAt: at,
    updatedAt: at,
  };
});
put(schema.careCases, caseRows);
put(
  schema.careCaseCaregivers,
  caseIds.map((caseId) => ({
    caseId,
    userId: owner.user.id,
    churchId,
    assignedBy: owner.user.id,
    assignedAt: nowIso,
  })),
);
put(
  schema.careNotes,
  Array.from({ length: n(2000) }, () => {
    const at = new Date(Date.now() - int(0, 729) * DAY).toISOString();
    return {
      id: uuid(),
      churchId,
      caseId: pick(caseIds),
      kind: pick(['note', 'call', 'visit', 'meeting']),
      body: text(8),
      authorUserId: owner.user.id,
      createdAt: at,
      updatedAt: at,
    };
  }),
);
const visitIds: string[] = [];
put(
  schema.careVisits,
  Array.from({ length: n(1500) }, () => {
    const id = uuid();
    visitIds.push(id);
    const offset = -int(0, 729);
    return {
      id,
      churchId,
      caseId: chance(0.3) ? pick(caseIds) : null,
      personId: pick(personIds),
      householdId: null,
      visitDate: dateOf(offset),
      location: pick(['Rumah', 'RS Pondok Indah', 'RS Fatmawati']),
      summary: text(5),
      confidentiality: 'normal',
      followUpNeeded: chance(0.2),
      followUpNote: null,
      otherVisitors: null,
      createdBy: owner.user.id,
      createdAt: instantOf(offset, 16),
      updatedAt: instantOf(offset, 16),
    };
  }),
);
put(
  schema.careVisitVisitors,
  visitIds.map((visitId) => ({ visitId, personId: ownerPersonId, churchId })),
);
put(
  schema.prayerRequests,
  Array.from({ length: n(500) }, (_, index) => {
    const at = new Date(Date.now() - int(0, 729) * DAY).toISOString();
    return {
      id: uuid(),
      churchId,
      personId: pick(personIds),
      submittedBy: index % 5 === 0 ? member.user.id : admin.user.id,
      title: `Pokok doa ${index + 1}`,
      body: text(5),
      visibility: pick(['church', 'church', 'care_team', 'pastors']),
      isAnonymous: chance(0.1),
      moderationStatus: pick(['approved', 'approved', 'approved', 'pending', 'rejected']),
      moderatedBy: owner.user.id,
      moderatedAt: at,
      moderationNote: null,
      prayedCount: int(0, 40),
      answeredAt: null,
      testimony: null,
      closedAt: null,
      createdAt: at,
      updatedAt: at,
    };
  }),
);
const followUpIds: string[] = [];
const visitorPeople = persons.filter((person) => person.status === 'visitor').map((p) => p.id);
put(
  schema.visitorFollowUps,
  visitorPeople.slice(0, n(200)).map((personId) => {
    const id = uuid();
    followUpIds.push(id);
    const at = new Date(Date.now() - int(0, 300) * DAY).toISOString();
    return {
      id,
      churchId,
      personId,
      stage: pick(['new', 'contacted', 'visited', 'joined', 'closed']),
      source: pick(['Teman', 'Media sosial', 'Datang sendiri']),
      firstVisitDate: at.slice(0, 10),
      assignedUserId: pick(staffIds),
      notes: null,
      closedReason: null,
      stageChangedAt: at,
      createdBy: admin.user.id,
      createdAt: at,
      updatedAt: at,
    };
  }),
);
put(
  schema.careTasks,
  Array.from({ length: n(500) }, (_, index) => {
    const at = new Date(Date.now() - int(0, 400) * DAY).toISOString();
    const status = pick(['open', 'open', 'done', 'cancelled']);
    return {
      id: uuid(),
      churchId,
      title: `Tindak lanjut ${index + 1}`,
      description: null,
      dueDate: dateOf(int(-60, 30)),
      status,
      assignedUserId: pick(staffIds),
      followUpId: followUpIds.length > 0 && chance(0.3) ? pick(followUpIds) : null,
      caseId: chance(0.4) ? pick(caseIds) : null,
      personId: pick(personIds),
      completedAt: status === 'done' ? at : null,
      completedBy: status === 'done' ? owner.user.id : null,
      reminderSentAt: null,
      createdBy: owner.user.id,
      createdAt: at,
      updatedAt: at,
    };
  }),
);
put(
  schema.diakoniaAid,
  Array.from({ length: n(400) }, () => {
    const offset = -int(0, 729);
    return {
      id: uuid(),
      churchId,
      personId: pick(personIds),
      householdId: null,
      caseId: null,
      recipientName: null,
      category: pick(['food', 'health', 'education', 'housing', 'emergency', 'funeral']),
      form: 'cash',
      description: null,
      amount: int(5, 100) * 50_000,
      givenAt: dateOf(offset),
      financeReference: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdBy: owner.user.id,
      createdAt: instantOf(offset, 12),
      updatedAt: instantOf(offset, 12),
    };
  }),
);

// ---- Church registry ---------------------------------------------------------------------------

const recordTypes = [
  'baptism',
  'sidi',
  'marriage',
  'child_dedication',
  'transfer_in',
  'transfer_out',
  'death',
] as const;
const prefixes: Record<string, string> = {
  baptism: 'B',
  sidi: 'S',
  marriage: 'N',
  child_dedication: 'PA',
  transfer_in: 'AM',
  transfer_out: 'AK',
  death: 'K',
};
const sequences = new Map<string, number>();
const recordRows: Record<string, unknown>[] = [];
const recordPeopleRows: Record<string, unknown>[] = [];
for (let index = 0; index < n(3000); index += 1) {
  const id = uuid();
  const type = pick(recordTypes);
  const date = dateOf(-int(0, 3650));
  const recordYear = Number(date.slice(0, 4));
  const key = `${type}:${recordYear}`;
  const sequence = (sequences.get(key) ?? 0) + 1;
  sequences.set(key, sequence);
  recordRows.push({
    id,
    churchId,
    type,
    subtype: type === 'baptism' ? pick(['infant', 'adult']) : null,
    year: recordYear,
    sequence,
    number: `${prefixes[type]}/${recordYear}/${String(sequence).padStart(3, '0')}`,
    date,
    place: 'GKI Pondok Indah Raya',
    officiantPersonId: ownerPersonId,
    officiantName: 'Pdt. Samuel Hutapea',
    details: {},
    documentUrl: null,
    notes: null,
    status: chance(0.02) ? 'voided' : 'active',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdBy: admin.user.id,
    updatedBy: admin.user.id,
    createdAt: `${date}T03:00:00.000Z`,
    updatedAt: `${date}T03:00:00.000Z`,
  });
  const subject = pick(personIds);
  recordPeopleRows.push({
    id: uuid(),
    churchId,
    recordId: id,
    personId: subject,
    name: 'Jemaat',
    role: 'subject',
    position: 0,
  });
  if (type === 'marriage') {
    recordPeopleRows.push({
      id: uuid(),
      churchId,
      recordId: id,
      personId: pick(personIds),
      name: 'Pasangan',
      role: 'spouse',
      position: 1,
    });
  }
}
put(schema.registryRecords, recordRows);
put(schema.registryRecordPeople, recordPeopleRows);

// ---- Facilities and inventory ------------------------------------------------------------------

const resourceIds = Array.from({ length: 8 }, () => uuid());
put(
  schema.facilityResources,
  [
    'Gedung Gereja',
    'Aula',
    'Ruang Konsistori',
    'Ruang Kelas 1',
    'Ruang Kelas 2',
    'Ruang Musik',
    'Mobil Gereja',
    'Proyektor',
  ].map((name, index) => ({
    id: resourceIds[index]!,
    churchId,
    name,
    kind: index === 0 ? 'sanctuary' : index === 1 ? 'hall' : index < 6 ? 'room' : 'equipment',
    description: null,
    location: null,
    capacity: index < 2 ? 500 : 40,
    features: [],
    photoUrl: null,
    color: null,
    requiresApproval: true,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  })),
);
put(
  schema.facilityBookings,
  Array.from({ length: n(2000) }, (_, index) => {
    const offset = int(-700, 120);
    const startsAt = instantOf(offset, int(8, 19));
    return {
      id: uuid(),
      churchId,
      resourceId: pick(resourceIds),
      title: `Pemakaian ruang ${index + 1}`,
      purpose: null,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
      recurrence: 'none',
      recurrenceUntil: null,
      status: pick(['approved', 'approved', 'approved', 'pending', 'rejected', 'cancelled']),
      expectedAttendees: int(5, 200),
      groupId: chance(0.4) ? pick(groupIds) : null,
      eventId: null,
      requestedBy: pick(userIds),
      decidedBy: admin.user.id,
      decidedAt: startsAt,
      decisionNote: null,
      cancelledAt: null,
      cancelledBy: null,
      notes: null,
      createdAt: startsAt,
      updatedAt: startsAt,
    };
  }),
);
const assetIds: string[] = [];
put(
  schema.inventoryAssets,
  Array.from({ length: n(1000) }, (_, index) => {
    const id = uuid();
    assetIds.push(id);
    return {
      id,
      churchId,
      code: `INV-${String(index + 1).padStart(4, '0')}`,
      name: `${pick(['Kursi', 'Meja', 'Mikrofon', 'Speaker', 'Kipas', 'Lemari', 'Gitar'])} ${index + 1}`,
      category: pick(['Perabot', 'Audio', 'Musik', 'Elektronik']),
      description: null,
      resourceId: pick(resourceIds),
      location: null,
      condition: pick(['new', 'good', 'good', 'fair', 'poor']),
      status: index < 60 ? 'on_loan' : pick(['available', 'available', 'available', 'maintenance']),
      acquisitionDate: dateOf(-int(30, 3000)),
      acquisitionValue: int(1, 200) * 100_000,
      custodianPersonId: null,
      serialNumber: null,
      photoUrl: null,
      notes: null,
      retiredAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }),
);
put(
  schema.assetLoans,
  assetIds.slice(0, 300).map((assetId, index) => {
    const offset = -int(0, 500);
    return {
      id: uuid(),
      churchId,
      assetId,
      borrowerPersonId: pick(personIds),
      borrowerName: 'Jemaat',
      groupId: null,
      checkedOutAt: instantOf(offset, 10),
      dueDate: dateOf(offset + 7),
      returnedAt: index < 60 ? null : instantOf(offset + 5, 10),
      conditionOut: 'good',
      conditionIn: index < 60 ? null : 'good',
      notes: null,
      checkedOutBy: admin.user.id,
      returnedTo: index < 60 ? null : admin.user.id,
      createdAt: instantOf(offset, 10),
      updatedAt: instantOf(offset, 10),
    };
  }),
);

// ---- Notifications and audit -------------------------------------------------------------------

const notificationRows = Array.from({ length: n(20_000) }, (_, index) => {
  const userId =
    index % 10 < 4
      ? owner.user.id
      : index % 10 < 7
        ? admin.user.id
        : index % 10 < 9
          ? treasurer.user.id
          : member.user.id;
  const at = new Date(Date.now() - int(0, 729) * DAY - int(0, 86_000) * 1000).toISOString();
  return {
    id: uuid(),
    churchId,
    userId,
    type: pick([
      'announcement.published',
      'event.updated',
      'roster.assigned',
      'care.task_assigned',
    ]),
    title: 'Pengumuman baru',
    body: text(2),
    titleEn: 'New announcement',
    bodyEn: null,
    link: `/c/${churchId}/announcements`,
    entityType: null,
    entityId: null,
    readAt: chance(0.9) ? at : null,
    createdAt: at,
  };
});
put(schema.notifications, notificationRows);

const modules = ['people', 'finance', 'care', 'records', 'worship', 'facilities', 'core'];
put(
  schema.auditLogs,
  Array.from({ length: n(50_000) }, (_, index) => {
    const at = new Date(Date.now() - int(0, 729) * DAY - int(0, 86_000) * 1000).toISOString();
    const module = pick(modules);
    return {
      id: uuid(),
      churchId,
      actorUserId: pick(userIds),
      module,
      action: `${module}.update`,
      entityType: module === 'people' ? 'person' : module,
      entityId: module === 'people' ? pick(personIds) : null,
      summary: `Perubahan data ${index + 1}`,
      before: { name: 'Lama' },
      after: { name: 'Baru' },
      ip: '10.0.0.1',
      userAgent: 'seed-large',
      createdAt: at,
    };
  }),
);

sqlite.exec('ANALYZE;');
handle.close();

console.info(
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([table, count]) => `  ${table.padEnd(28)} ${count.toLocaleString('en')}`)
    .join('\n'),
);
console.info(
  `Done in ${((performance.now() - started) / 1000).toFixed(1)}s. Church ${churchId}; ` +
    `sign in as owner@large.test, admin@large.test, treasurer@large.test or member@large.test ` +
    `with the password "${password}".`,
);
