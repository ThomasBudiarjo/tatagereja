/**
 * Demo data for the Sekolah Minggu check-in screens, for a running server whose demo church
 * was made by `scripts/screenshots.ts --seed`:
 *
 *   bun apps/api/src/modules/checkin/scripts/seed-demo.ts --port 3108 --db /tmp/wf-checkin.db
 *
 * Adds families with children, the suggested classes with their teachers, six past Sundays,
 * today's open session with children in class, alerts and pick-up people. Everything goes
 * through the API except the households, which belong to the people module (inserted into the
 * database directly, as the tests do). The owner becomes the mother of the Simanjuntak family.
 */
import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3108')}/api`;
const dbPath = option('db', '/tmp/wf-checkin.db');
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');

// Loose JSON for a throwaway script talking to our own API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function api<T = Json>(path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${json.error?.message}`);
  }
  return json;
}

let token: string | null = null;
const login = await api('/auth/login', { method: 'POST', body: { email, password } });
token = login.token as string;
const userId = login.user.id as string;
const churchId = (await api('/churches')).items[0].church.id as string;
const at = `/churches/${churchId}`;
const ck = `${at}/checkin`;

const existing = await api(`${ck}/sessions?limit=1`);
if (existing.total > 0) {
  console.info('Check-in demo data already present');
  process.exit(0);
}

const year = new Date().getFullYear();
const born = (age: number, month = 3) =>
  `${year - age}-${String(month).padStart(2, '0')}-${String(10 + age).padStart(2, '0')}`;

const directory = (await api(`${at}/people?limit=100`)).items as Json[];
const findOrCreate = async (firstName: string, lastName: string, extra: Json = {}) => {
  const found = directory.find(
    (person) => person.firstName === firstName && person.lastName === lastName,
  );
  if (found) return found.id as string;
  const created = await api(`${at}/people`, {
    method: 'POST',
    body: { firstName, lastName, membershipStatus: 'member', ...extra },
  });
  return created.person.id as string;
};

type Member = { id: string; relationship: 'head' | 'spouse' | 'child' | 'parent' };
const families: { name: string; phone: string; members: Member[] }[] = [];
const kids: Record<string, string> = {};

const family = async (
  name: string,
  phone: string,
  parents: [string, string, 'head' | 'spouse' | 'parent'][],
  children: [string, number, 'male' | 'female'][],
) => {
  const lastName = name.replace('Keluarga ', '');
  const members: Member[] = [];
  for (const [firstName, last, relationship] of parents) {
    members.push({ id: await findOrCreate(firstName, last, { phone }), relationship });
  }
  for (const [firstName, age, gender] of children) {
    const id = await findOrCreate(firstName, lastName, { birthDate: born(age), gender });
    kids[firstName] = id;
    members.push({ id, relationship: 'child' });
  }
  families.push({ name, phone, members });
};

await family(
  'Keluarga Simanjuntak',
  '0812-3456-7788',
  [
    ['Robert', 'Simanjuntak', 'head'],
    ['Maria', 'Simanjuntak', 'spouse'],
  ],
  [
    ['Yosua', 6, 'male'],
    ['Grace', 3, 'female'],
    ['Kezia', 9, 'female'],
  ],
);
await family(
  'Keluarga Hutapea',
  '0813-2200-9901',
  [
    ['Daniel', 'Hutapea', 'head'],
    ['Rina', 'Hutapea', 'spouse'],
  ],
  [
    ['Lukas', 8, 'male'],
    ['Naomi', 4, 'female'],
  ],
);
await family(
  'Keluarga Tambunan',
  '0821-7788-1204',
  [
    ['Yohanes', 'Tambunan', 'head'],
    ['Sarah', 'Tambunan', 'spouse'],
  ],
  [
    ['Samuel', 11, 'male'],
    ['Abigail', 13, 'female'],
    ['Elia', 1, 'male'],
  ],
);
await family(
  'Keluarga Wijaya',
  '0857-3141-5926',
  [
    ['Andreas', 'Wijaya', 'head'],
    ['Lidya', 'Wijaya', 'spouse'],
  ],
  [
    ['Kevin', 5, 'male'],
    ['Michelle', 7, 'female'],
  ],
);
await family(
  'Keluarga Siregar',
  '0811-6060-4321',
  [['Ruth', 'Siregar', 'parent']],
  [
    ['Joshua', 10, 'male'],
    ['Hana', 2, 'female'],
  ],
);
await family(
  'Keluarga Nainggolan',
  '0812-9090-1122',
  [
    ['Benny', 'Nainggolan', 'head'],
    ['Debora', 'Nainggolan', 'spouse'],
  ],
  [
    ['Timotius', 14, 'male'],
    ['Priskila', 5, 'female'],
    ['Natan', 4, 'male'],
  ],
);

// Households belong to the people module: insert them directly.
const db = new Database(dbPath);
const now = new Date().toISOString();
const insertHousehold = db.prepare(
  'insert into households (id, church_id, name, phone, city, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
);
const insertMember = db.prepare(
  'insert or ignore into household_members (id, church_id, household_id, person_id, relationship, is_primary_contact, added_at) values (?, ?, ?, ?, ?, ?, ?)',
);
for (const home of families) {
  const id = randomUUID();
  insertHousehold.run(id, churchId, home.name, home.phone, 'Bandung', now, now);
  home.members.forEach((member, index) =>
    insertMember.run(
      randomUUID(),
      churchId,
      id,
      member.id,
      member.relationship,
      index === 0 ? 1 : 0,
      now,
    ),
  );
}
db.close();

// The owner is Maria Simanjuntak, a mother in the Simanjuntak family.
const maria = await findOrCreate('Maria', 'Simanjuntak');
await api(`${at}/people/${maria}/user`, { method: 'PUT', body: { userId } }).catch(() => null);

// Classes and teachers.
const classes = (await api(`${ck}/classes/defaults`, { method: 'POST' })).items as Json[];
const classId = (name: string) => classes.find((item) => item.name === name)!.id as string;
const colors: Record<string, [string, string, number]> = {
  Balita: ['#e07a5f', 'Ruang Bayi, Lantai 1', 12],
  'Kelas Kecil': ['#e0a526', 'Ruang Sekolah Minggu 1', 20],
  'Kelas Tengah': ['#2fa39a', 'Ruang Sekolah Minggu 2', 25],
  'Kelas Besar': ['#4f86d9', 'Ruang Sekolah Minggu 3', 25],
  'Tunas Remaja': ['#9b6bd3', 'Ruang Serbaguna', 30],
};
for (const item of classes) {
  const [color, location, capacity] = colors[item.name] ?? ['#8a8f98', null, null];
  await api(`${ck}/classes/${item.id}`, {
    method: 'PATCH',
    body: {
      name: item.name,
      minAge: item.minAge,
      maxAge: item.maxAge,
      color,
      location,
      capacity,
      maxChildrenPerTeacher: item.name === 'Kelas Kecil' ? 3 : 6,
      sortOrder: item.sortOrder,
      isActive: true,
    },
  });
}
const teacher = (firstName: string, lastName: string) => findOrCreate(firstName, lastName);
const teachers: [string, [string, string][]][] = [
  [
    'Balita',
    [
      ['Ester', 'Lumbantobing'],
      ['Lidya', 'Wijaya'],
    ],
  ],
  ['Kelas Kecil', [['Ruth', 'Siregar']]],
  [
    'Kelas Tengah',
    [
      ['Sarah', 'Tambunan'],
      ['Rina', 'Hutapea'],
    ],
  ],
  ['Kelas Besar', [['Benny', 'Nainggolan']]],
  [
    'Tunas Remaja',
    [
      ['Andreas', 'Wijaya'],
      ['Yohanes', 'Tambunan'],
    ],
  ],
];
for (const [name, people] of teachers) {
  const ids = [];
  for (const [first, last] of people) ids.push(await teacher(first, last));
  await api(`${ck}/classes/${classId(name)}/teachers`, {
    method: 'PUT',
    body: { teachers: ids.map((personId, index) => ({ personId, isLead: index === 0 })) },
  });
}

// Alerts and pick-up people.
const alert = (child: string, kind: string, severity: string, description: string) =>
  api(`${ck}/children/${kids[child]}/alerts`, {
    method: 'POST',
    body: { kind, severity, description },
  });
await alert('Grace', 'allergy', 'critical', 'Alergi kacang tanah. EpiPen ada di tas biru.');
await alert('Lukas', 'medical', 'warning', 'Asma ringan, inhaler di saku tas.');
await alert('Kevin', 'custody', 'critical', 'Hanya boleh dijemput oleh ibunya (Lidya).');
await alert('Elia', 'other', 'info', 'Masih menyusu, popok cadangan di tas.');
await alert('Naomi', 'allergy', 'warning', 'Alergi susu sapi.');
await api(`${ck}/children/${kids.Yosua}/pickups`, {
  method: 'POST',
  body: { name: 'Opung Boru Siregar', relationship: 'Opung', phone: '0812-7000-1111' },
});
await api(`${ck}/children/${kids.Kevin}/pickups`, {
  method: 'POST',
  body: { name: 'Pak Ujang', relationship: 'Sopir keluarga', notes: 'Mobil Avanza hitam' },
});

// Six past Sundays, closed into attendance.
const sunday = (weeksAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay() - weeksAgo * 7);
  return date.toISOString().slice(0, 10);
};
const everyone = Object.keys(kids);
for (let week = 6; week >= 1; week -= 1) {
  const { session } = await api(`${ck}/sessions`, {
    method: 'POST',
    body: { name: 'Ibadah Minggu Pagi', date: sunday(week) },
  });
  const coming = everyone.filter((_, index) => (index + week) % 5 !== 0).slice(0, 8 + week);
  const result = await api(`${ck}/sessions/${session.id}/checkins`, {
    method: 'POST',
    body: { children: coming.map((name) => ({ personId: kids[name] })), method: 'staff' },
  });
  for (const item of result.items as Json[]) {
    await api(`${ck}/checkins/${item.id}/checkout`, {
      method: 'POST',
      body: { securityCode: item.securityCode },
    });
  }
  await api(`${ck}/sessions/${session.id}/close`, { method: 'POST' });
}

// Today: an open session with children in class.
const today = new Date().toISOString().slice(0, 10);
const { session } = await api(`${ck}/sessions`, {
  method: 'POST',
  body: { name: 'Ibadah Minggu Pagi', date: today },
});
const checkIn = (names: string[], method = 'staff') =>
  api(`${ck}/sessions/${session.id}/checkins`, {
    method: 'POST',
    body: { children: names.map((name) => ({ personId: kids[name] })), method },
  });
await checkIn(['Lukas', 'Naomi']);
await checkIn(['Samuel', 'Abigail', 'Elia']);
await checkIn(['Kevin', 'Michelle']);
await checkIn(['Joshua', 'Hana']);
const nainggolan = await checkIn(['Timotius', 'Priskila', 'Natan']);
await checkIn(['Kezia']);
// One child already went home.
const timotius = (nainggolan.items as Json[])[0]!;
await api(`${ck}/checkins/${timotius.id}/checkout`, {
  method: 'POST',
  body: { securityCode: timotius.securityCode },
});

console.info(`Check-in demo data ready for ${churchId}; open session ${session.id}`);
