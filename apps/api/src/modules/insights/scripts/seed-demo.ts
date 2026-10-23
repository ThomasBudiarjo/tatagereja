/**
 * Demo data for the insights module on top of the church created by `scripts/screenshots.ts
 * --seed` (run the other modules' seed scripts first for a fuller home screen): people who joined
 * over the past year, weekly headcount services, group meetings with marked attendance and a few
 * absence streaks, one dismissed alert and one care follow-up. Everything goes through the API.
 * Idempotent: it does nothing when the church already has headcount sessions.
 *
 *   bun scripts/screenshots.ts --port 3109 --seed --routes /churches
 *   bun apps/api/src/modules/insights/scripts/seed-demo.ts --port 3109
 */
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3109')}/api`;
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
const attendance = `${at}/attendance`;

const existing = await api<{ total: number }>(
  'GET',
  `${attendance}/sessions?mode=headcount&limit=1`,
  token,
);
if (existing.total > 0) {
  console.log('Insights demo data already present');
  process.exit(0);
}

/** A Sunday (or another weekday) `weeks` weeks ago at a local hour in Asia/Jakarta (UTC+7). */
const weeksAgo = (weeks: number, weekday = 0, hour = 8) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - date.getUTCDay() + weekday - weeks * 7);
  date.setUTCHours(hour - 7, 0, 0, 0);
  return date.toISOString();
};
const monthsAgo = (months: number, day = 10) => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months, day);
  return date.toISOString().slice(0, 10);
};

// Make sure the demo account has a person record (others' seeds usually link it already).
let directory = await api<{ items: Person[] }>('GET', `${at}/people?limit=200`, token);
const maria = directory.items.find((person) => person.firstName === 'Maria');
if (maria && !maria.userId) {
  await api('PUT', `${at}/people/${maria.id}/user`, token, { userId: user.id });
}

// People who joined over the past year: growth, demographics and new visitors.
const joiners = [
  ['Kezia', 'Pangaribuan', 'female', '2009-04-12', 'member', 13],
  ['Jonathan', 'Sembiring', 'male', '1998-08-03', 'member', 12],
  ['Febe', 'Situmorang', 'female', '1987-02-21', 'member', 11],
  ['Matius', 'Ginting', 'male', '1975-12-01', 'regular', 10],
  ['Agnes', 'Purba', 'female', '2004-07-17', 'member', 9],
  ['Elisa', 'Tarigan', 'male', '1959-05-30', 'member', 8],
  ['Sarah', 'Napitupulu', 'female', '2012-09-09', 'regular', 7],
  ['Petrus', 'Simbolon', 'male', '1992-11-25', 'member', 6],
  ['Marta', 'Sinaga', 'female', '1968-01-14', 'member', 5],
  ['Filipus', 'Damanik', 'male', '2001-03-08', 'visitor', 4],
  ['Yohana', 'Sihite', 'female', '1996-06-06', 'regular', 3],
  ['Andre', 'Lubis', 'male', '2007-10-19', 'visitor', 2],
  ['Christine', 'Panjaitan', 'female', '1983-04-27', 'member', 2],
  ['Bernard', 'Sianturi', 'male', '1950-08-15', 'member', 1],
  ['Lia', 'Marpaung', 'female', '2015-12-24', 'visitor', 0],
] as const;
for (const [firstName, lastName, gender, birthDate, membershipStatus, months] of joiners) {
  await api('POST', `${at}/people`, token, {
    firstName,
    lastName,
    gender,
    birthDate,
    membershipStatus,
    joinedAt: monthsAgo(months),
  });
}
directory = await api<{ items: Person[] }>('GET', `${at}/people?limit=200`, token);
const byName = (firstName: string) =>
  directory.items.find((person) => person.firstName === firstName);

// Weekly headcount for Ibadah Minggu over the last half year, slowly growing with Easter dips.
for (let weeks = 26; weeks >= 1; weeks -= 1) {
  const growth = (26 - weeks) * 2;
  const wobble = ((weeks * 37) % 11) - 5;
  await api('POST', `${attendance}/sessions`, token, {
    title: 'Ibadah Minggu Pagi',
    sessionAt: weeksAgo(weeks),
    mode: 'headcount',
    headcount: {
      men: 92 + growth + wobble,
      women: 118 + growth + wobble * 2,
      children: 41 + Math.round(growth / 2),
      visitors: 6 + (weeks % 4),
    },
    notes: weeks === 13 ? 'Ibadah Paskah gabungan, hujan deras.' : null,
  });
}
// The sore service, smaller and steady.
for (let weeks = 12; weeks >= 1; weeks -= 1) {
  await api('POST', `${attendance}/sessions`, token, {
    title: 'Ibadah Minggu Sore',
    sessionAt: weeksAgo(weeks, 0, 17),
    mode: 'headcount',
    headcount: { men: 34 + (weeks % 3), women: 41 + (weeks % 5), children: 9, visitors: 2 },
  });
}

// Komisi Pemuda meets on Saturdays; mark its members, with a few drifting away.
const groups = await api<{ items: (Ref & { name: string })[] }>('GET', `${at}/groups`, token);
const youth = groups.items.find((group) => group.name === 'Komisi Pemuda') ?? groups.items[0];
const youthNames = ['Kezia', 'Jonathan', 'Agnes', 'Petrus', 'Yohana', 'Andre', 'Ester', 'Filipus'];
const youthIds = youthNames.flatMap((name) => {
  const person = byName(name);
  return person ? [person.id] : [];
});
if (youth) {
  await api('POST', `${at}/groups/${youth.id}/members`, token, { personIds: youthIds });
  for (let weeks = 8; weeks >= 1; weeks -= 1) {
    const created = await api<{ session: Ref }>('POST', `${attendance}/sessions`, token, {
      title: 'Persekutuan Pemuda',
      groupId: youth.id,
      sessionAt: weeksAgo(weeks, 6, 18),
    });
    const records = youthIds.map((personId, index) => {
      const name = youthNames[index];
      // Andre and Filipus stopped coming four weeks ago; Agnes was away (excused) once.
      const absent = (name === 'Andre' || name === 'Filipus') && weeks <= 4;
      const excused = name === 'Agnes' && weeks === 2;
      const sometimes = name === 'Yohana' && weeks % 3 === 0;
      return {
        personId,
        status: absent || sometimes ? 'absent' : excused ? 'excused' : 'present',
        note: excused ? 'Ujian sekolah' : null,
      };
    });
    await api('PUT', `${attendance}/sessions/${created.session.id}/records`, token, { records });
  }
}

// Ibadah Doa Rabu: church-wide, name by name. Bernard has missed the last three.
const prayerPeople = ['Maria', 'Marta', 'Bernard', 'Elisa', 'Febe', 'Matius']
  .map(byName)
  .filter((person): person is Person => !!person);
for (let weeks = 6; weeks >= 1; weeks -= 1) {
  const created = await api<{ session: Ref }>('POST', `${attendance}/sessions`, token, {
    title: 'Ibadah Doa Rabu',
    sessionAt: weeksAgo(weeks, 3, 19),
    notes: weeks === 1 ? 'Pokok doa: jemaat yang sakit dan pembangunan gedung serbaguna.' : null,
  });
  await api('PUT', `${attendance}/sessions/${created.session.id}/records`, token, {
    records: prayerPeople.map((person) => ({
      personId: person.id,
      status:
        person.firstName === 'Bernard' && weeks <= 3
          ? 'absent'
          : person.firstName === 'Matius' && weeks === 2
            ? 'excused'
            : 'present',
      note: null,
    })),
  });
}

// One alert dismissed (known reason), one turned into a follow-up for the demo account.
const yohana = byName('Yohana');
const bernard = byName('Bernard');
if (yohana) {
  await api('POST', `${attendance}/absences/${yohana.id}`, token, { action: 'dismiss' }).catch(
    () => undefined,
  );
}
if (bernard) {
  await api('POST', `${attendance}/absences/${bernard.id}`, token, {
    action: 'follow_up',
    dueDate: monthsAgo(0, new Date().getUTCDate()),
    note: 'Kunjungi bersama Penatua Wilayah 2; kabarnya sedang sakit.',
  }).catch(() => undefined);
}

console.log(`Seeded insights demo data for church ${churchId}`);

export {};
