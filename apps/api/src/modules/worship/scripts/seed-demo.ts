/**
 * Demo data for the worship module (service types, teams, songs, services with liturgy and
 * rosters, replies and blockouts) on top of the church created by `scripts/screenshots.ts
 * --seed`. Idempotent: it does nothing when the church already has songs.
 *
 *   bun scripts/screenshots.ts --port 3104 --seed --routes /churches
 *   bun apps/api/src/modules/worship/scripts/seed-demo.ts --port 3104
 */
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3104')}/api`;
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
type Team = Ref & { name: string; positions: (Ref & { name: string })[] };

const { token, user } = await api<{ token: string; user: Ref }>('POST', '/auth/login', null, {
  email,
  password,
});
const mine = await api<{ items: { church: Ref }[] }>('GET', '/churches', token);
const churchId = mine.items[0]?.church.id;
if (!churchId) throw new Error('Run scripts/screenshots.ts --seed first');
const at = `/churches/${churchId}`;
const w = `${at}/worship`;

const existing = await api<{ total: number }>('GET', `${w}/songs?limit=1`, token);
if (existing.total > 0) {
  console.log('Worship demo data already present');
  process.exit(0);
}

await api('POST', `${w}/setup`, token);

// People who serve. The demo account is Maria Simanjuntak; link her to her directory record.
const directory = await api<{ items: Person[] }>('GET', `${at}/people?limit=200`, token);
const maria = directory.items.find((person) => person.firstName === 'Maria');
if (maria && !maria.userId) {
  await api('PUT', `${at}/people/${maria.id}/user`, token, { userId: user.id });
}
const names = [
  ['Yosua', 'Sitompul'],
  ['Grace', 'Halim'],
  ['Kevin', 'Santoso'],
  ['Debora', 'Manurung'],
  ['Natanael', 'Pardede'],
  ['Lidia', 'Wibowo'],
  ['Stefanus', 'Gunawan'],
  ['Priskila', 'Hutagalung'],
  ['Timotius', 'Sihombing'],
  ['Rebeka', 'Tanoto'],
  ['Imanuel', 'Silalahi'],
  ['Hana', 'Kristanti'],
] as const;
for (const [firstName, lastName] of names) {
  await api('POST', `${at}/people`, token, { firstName, lastName, membershipStatus: 'member' });
}
const people = (await api<{ items: Person[] }>('GET', `${at}/people?limit=200`, token)).items;
const person = (firstName: string) => {
  const found = people.find((item) => item.firstName === firstName);
  if (!found) throw new Error(`No person ${firstName}`);
  return found.id;
};

const teams = (await api<{ items: Team[] }>('GET', `${w}/teams`, token)).items;
const team = (name: string) => teams.find((item) => item.name === name)!;
const position = (teamName: string, name: string) =>
  team(teamName).positions.find((item) => item.name === name)!.id;

await api('PATCH', `${w}/teams/${team('Pemusik').id}`, token, {
  name: 'Pemusik',
  description: 'Pianis, gitar, bass, dan drum untuk ibadah umum dan pemuda.',
  color: '#7c3aed',
});
await api('PATCH', `${w}/teams/${team('Singers').id}`, token, {
  name: 'Singers',
  description: 'Worship leader dan singers. Latihan setiap Sabtu pukul 16.00.',
  color: '#db2777',
});
await api('PATCH', `${w}/teams/${team('Multimedia').id}`, token, {
  name: 'Multimedia',
  description: 'LCD, sound system, dan siaran langsung.',
  color: '#2563eb',
});
await api('PATCH', `${w}/teams/${team('Penerima Tamu').id}`, token, {
  name: 'Penerima Tamu',
  description: 'Menyambut jemaat dan mengedarkan kantong persembahan.',
  color: '#059669',
});

const members: [string, string, string[], ('leader' | 'member')?][] = [
  ['Pemusik', 'Yosua', ['Pianis / Organis'], 'leader'],
  ['Pemusik', 'Kevin', ['Gitar', 'Bass']],
  ['Pemusik', 'Natanael', ['Drum']],
  ['Pemusik', 'Stefanus', ['Pianis / Organis', 'Gitar']],
  ['Pemusik', 'Imanuel', ['Bass', 'Drum']],
  ['Singers', 'Maria', ['Worship Leader', 'Singer'], 'leader'],
  ['Singers', 'Grace', ['Worship Leader', 'Singer']],
  ['Singers', 'Debora', ['Singer']],
  ['Singers', 'Lidia', ['Singer']],
  ['Singers', 'Hana', ['Singer']],
  ['Multimedia', 'Timotius', ['Operator LCD', 'Live Streaming']],
  ['Multimedia', 'Daniel', ['Sound System']],
  ['Multimedia', 'Rebeka', ['Operator LCD']],
  ['Penerima Tamu', 'Priskila', []],
  ['Penerima Tamu', 'Ester', []],
  ['Penerima Tamu', 'Ruth', ['Usher']],
  ['Penerima Tamu', 'Hana', ['Kolektan']],
  ['Penatua Bertugas', 'Yohanes', [], 'leader'],
  ['Penatua Bertugas', 'Andreas', []],
  ['Penatua Bertugas', 'Samuel', ['Doa Syafaat']],
];
for (const [teamName, firstName, positions, role] of members) {
  await api('POST', `${w}/teams/${team(teamName).id}/members`, token, {
    personId: person(firstName),
    role: role ?? 'member',
    positionIds: positions.map((name) => position(teamName, name)),
  });
}

const songs: Record<string, string>[] = [
  {
    title: 'Haleluya, Pujilah',
    hymnal: 'KJ',
    hymnalNumber: '1',
    defaultKey: 'G',
    tags: 'pujian,pembukaan',
  },
  {
    title: 'Kami Puji Dengan Riang',
    hymnal: 'KJ',
    hymnalNumber: '3',
    defaultKey: 'G',
    tags: 'pujian,pembukaan',
  },
  {
    title: 'Pujilah Tuhan, Sang Raja',
    hymnal: 'KJ',
    hymnalNumber: '10',
    defaultKey: 'F',
    tags: 'pujian',
  },
  {
    title: 'Ku Berbahagia',
    hymnal: 'KJ',
    hymnalNumber: '392',
    defaultKey: 'D',
    tags: 'syukur,penutup',
  },
  {
    title: 'Allah Peduli',
    hymnal: 'KJ',
    hymnalNumber: '417',
    defaultKey: 'C',
    tags: 'penghiburan',
  },
  {
    title: 'Tuhan, Kasihanilah',
    hymnal: 'PKJ',
    hymnalNumber: '173',
    defaultKey: 'Em',
    tags: 'pengakuan dosa',
  },
  { title: 'Bila Kurenungkan', hymnal: 'PKJ', hymnalNumber: '12', defaultKey: 'E', tags: 'syukur' },
  { title: 'Bapa Yang Kekal', hymnal: 'NKB', hymnalNumber: '2', defaultKey: 'A', tags: 'pujian' },
  {
    title: 'Hidup Ini Adalah Kesempatan',
    hymnal: 'NKB',
    hymnalNumber: '210',
    defaultKey: 'D',
    tags: 'persembahan',
  },
  {
    title: 'Bapa, Engkau Sungguh Baik',
    author: 'Ir. Ruby Ndoen',
    defaultKey: 'G',
    tempo: '72',
    tags: 'pujian,penyembahan',
  },
  { title: 'Tuhan Yesus Baik', defaultKey: 'C', tempo: '96', tags: 'sekolah minggu,pujian' },
  {
    title: 'Hosana',
    author: 'Brooke Ligertwood',
    ccliNumber: '4785835',
    defaultKey: 'E',
    tempo: '70',
    tags: 'pemuda,penyembahan',
  },
  { title: 'Berkat Tuhan Bagimu', defaultKey: 'F', tags: 'berkat,penutup' },
];
const songIds = new Map<string, string>();
for (const song of songs) {
  const created = await api<{ song: Ref }>('POST', `${w}/songs`, token, {
    title: song.title,
    author: song.author ?? null,
    hymnal: song.hymnal ?? null,
    hymnalNumber: song.hymnalNumber ?? null,
    ccliNumber: song.ccliNumber ?? null,
    defaultKey: song.defaultKey ?? null,
    tempo: song.tempo ? Number(song.tempo) : null,
    tags: (song.tags ?? '').split(',').filter(Boolean),
    lyrics:
      song.title === 'Bapa, Engkau Sungguh Baik'
        ? 'Bait 1\nDi pagi hari kami datang memuji\nKasih-Mu baru setiap hari\n\nRefrein\nBapa, Engkau sungguh baik\nSetia-Mu tak berkesudahan'
        : null,
  });
  songIds.set(song.title ?? '', created.song.id);
}

const types = (await api<{ items: (Ref & { name: string })[] }>('GET', `${w}/service-types`, token))
  .items;
const type = (name: string) => types.find((item) => item.name === name)!.id;

/** A Sunday `weeks` from the coming one, at a Jakarta (UTC+7) time. */
const sundayAt = (weeks: number, time: string, dayOffset = 0) => {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7 || 7) + weeks * 7 + dayOffset);
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(day.getTime() + (hours * 60 + minutes - 7 * 60) * 60_000).toISOString();
};
const plus = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const themes = [
  ['Bersiaplah menyambut Dia', ['Yesaya 40:1-11', 'Mazmur 85:2-14', 'Markus 1:1-8']],
  ['Hidup dalam pengharapan', ['Roma 15:4-13', 'Mazmur 72:1-7']],
  ['Kasih yang memulihkan', ['Lukas 15:11-32', 'Mazmur 103:1-13']],
  ['Melayani dengan sukacita', ['1 Petrus 4:7-11', 'Mazmur 100']],
  ['Terang bagi bangsa-bangsa', ['Yesaya 60:1-6', 'Matius 2:1-12']],
] as const;

const liturgy = (sermonBy: string | null, picks: string[]) => [
  { type: 'prayer', title: 'Votum dan Salam', durationMinutes: 3, personName: 'Penatua bertugas' },
  {
    type: 'song',
    title: picks[0]!,
    durationMinutes: 5,
    songId: songIds.get(picks[0]!),
    songKey: 'G',
  },
  { type: 'prayer', title: 'Pengakuan Dosa', durationMinutes: 4 },
  { type: 'song', title: picks[1]!, durationMinutes: 4, songId: songIds.get(picks[1]!) },
  { type: 'reading', title: 'Pembacaan Alkitab', durationMinutes: 6, personId: person('Andreas') },
  { type: 'sermon', title: 'Khotbah', durationMinutes: 30, personId: sermonBy },
  { type: 'prayer', title: 'Doa Syafaat', durationMinutes: 6, personId: person('Samuel') },
  {
    type: 'offering',
    title: 'Persembahan',
    durationMinutes: 8,
    songId: null,
    notes: 'Kantong kolekte dan QRIS',
  },
  { type: 'announcement', title: 'Warta Jemaat', durationMinutes: 5 },
  { type: 'song', title: picks[2]!, durationMinutes: 4, songId: songIds.get(picks[2]!) },
  { type: 'prayer', title: 'Berkat', durationMinutes: 2 },
];

const services: { id: string; when: number }[] = [];
const plan = async (
  title: string,
  typeName: string,
  startsAt: string,
  minutes: number,
  extra: Record<string, unknown> = {},
) => {
  const created = await api<{ service: Ref }>('POST', `${w}/services`, token, {
    title,
    serviceTypeId: type(typeName),
    startsAt,
    endsAt: plus(startsAt, minutes),
    location: 'Gedung Gereja',
    status: 'published',
    ...extra,
  });
  return created.service.id;
};

// Three past Sundays, with liturgy and confirmed rosters.
for (const [index, weeks] of [-3, -2, -1].entries()) {
  const [theme, readings] = themes[index + 2]!;
  const id = await plan('Ibadah Minggu', 'Ibadah Umum 1', sundayAt(weeks, '07:00'), 120, {
    theme,
    scriptureReadings: readings,
    preacherName: index === 1 ? 'Pdt. Yohanes Siahaan (GKI Pondok Indah)' : null,
    preacherPersonId: index === 1 ? null : person('Samuel'),
  });
  const songsUsed = [
    ['Kami Puji Dengan Riang', 'Tuhan, Kasihanilah', 'Ku Berbahagia'],
    ['Haleluya, Pujilah', 'Bila Kurenungkan', 'Berkat Tuhan Bagimu'],
    ['Pujilah Tuhan, Sang Raja', 'Tuhan, Kasihanilah', 'Hidup Ini Adalah Kesempatan'],
  ][index]!;
  await api('PUT', `${w}/services/${id}/liturgy`, token, {
    items: liturgy(index === 1 ? null : person('Samuel'), songsUsed),
  });
  await api('POST', `${w}/services/${id}/roster/auto-fill`, token, {});
  services.push({ id, when: weeks });
}
// Past assignments were all confirmed.
for (const { id } of services) {
  const roster = await api<{ items: Ref[] }>('GET', `${w}/services/${id}/roster`, token);
  for (const item of roster.items) {
    await api('POST', `${w}/roster/${item.id}/respond`, token, { status: 'accepted' });
  }
}

// The coming Sunday: two services, fully planned.
const [theme0, readings0] = themes[0]!;
const sunday1 = await plan('Ibadah Minggu Adven I', 'Ibadah Umum 1', sundayAt(0, '07:00'), 120, {
  theme: theme0,
  scriptureReadings: readings0,
  preacherPersonId: person('Samuel'),
  notes: 'Perjamuan Kudus. Majelis bertugas hadir pukul 06.30.',
});
await api('PUT', `${w}/services/${sunday1}/liturgy`, token, {
  items: liturgy(person('Samuel'), ['Haleluya, Pujilah', 'Tuhan, Kasihanilah', 'Bapa Yang Kekal']),
});
await api('POST', `${w}/services/${sunday1}/roster/copy`, token, {});
await api('POST', `${w}/services/${sunday1}/roster/auto-fill`, token, {});
const sunday2 = await plan('Ibadah Minggu Adven I', 'Ibadah Umum 2', sundayAt(0, '09:30'), 120, {
  theme: theme0,
  scriptureReadings: readings0,
  preacherName: 'Pdt. Em. Ruth Lumban Gaol',
});
await api('PUT', `${w}/services/${sunday2}/liturgy`, token, {
  items: liturgy(null, ['Kami Puji Dengan Riang', 'Bila Kurenungkan', 'Ku Berbahagia']),
});
await api('POST', `${w}/services/${sunday2}/roster`, token, {
  assignments: [
    { positionId: position('Singers', 'Worship Leader'), personId: person('Maria') },
    { positionId: position('Pemusik', 'Pianis / Organis'), personId: person('Stefanus') },
    { positionId: position('Multimedia', 'Operator LCD'), personId: person('Rebeka') },
  ],
  ignoreConflicts: true,
});

// Replies for the coming Sunday: some accepted, one declined, the rest still waiting.
const roster1 = await api<{ items: (Ref & { person: Person; positionName: string })[] }>(
  'GET',
  `${w}/services/${sunday1}/roster`,
  token,
);
for (const [index, item] of roster1.items.entries()) {
  if (item.person.firstName === 'Natanael') {
    await api('POST', `${w}/roster/${item.id}/respond`, token, {
      status: 'declined',
      reason: 'Dinas ke Surabaya',
    });
  } else if (index % 3 !== 2) {
    await api('POST', `${w}/roster/${item.id}/respond`, token, { status: 'accepted' });
  }
}

// Youth service, prayer meeting, next Sunday and a Christmas Eve draft.
const youth = await plan(
  'Ibadah Pemuda: Bertumbuh Bersama',
  'Ibadah Pemuda',
  sundayAt(0, '17:00', -1),
  120,
  {
    theme: 'Berakar dan dibangun di dalam Dia',
    scriptureReadings: ['Kolose 2:6-7'],
    preacherName: 'Ev. Kevin Lumbantoruan',
    location: 'Aula Lantai 2',
  },
);
await api('PUT', `${w}/services/${youth}/liturgy`, token, {
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
    { type: 'prayer', title: 'Doa Penutup', durationMinutes: 3 },
  ],
});
await api('POST', `${w}/services/${youth}/roster/auto-fill`, token, { teamId: team('Pemusik').id });
await api('POST', `${w}/services/${youth}/roster/auto-fill`, token, { teamId: team('Singers').id });
await plan('Persekutuan Doa Rabu', 'Persekutuan Doa', sundayAt(0, '19:00', 3), 90, {
  theme: 'Berdoa bagi kota',
  scriptureReadings: ['Yeremia 29:7'],
  location: 'Ruang Serbaguna',
});
const [theme1, readings1] = themes[1]!;
const sunday3 = await plan('Ibadah Minggu Adven II', 'Ibadah Umum 1', sundayAt(1, '07:00'), 120, {
  theme: theme1,
  scriptureReadings: readings1,
  preacherPersonId: person('Samuel'),
});
await api('POST', `${w}/services/${sunday3}/roster/copy`, token, {});
// Christmas Eve this year, 18.00 in Jakarta.
const christmasEve = `${new Date().getUTCFullYear()}-12-24T11:00:00.000Z`;
await plan('Ibadah Malam Natal', 'Ibadah Umum 1', christmasEve, 150, {
  theme: 'Firman telah menjadi manusia',
  scriptureReadings: ['Yohanes 1:1-14', 'Lukas 2:1-20'],
  status: 'draft',
  location: 'Gedung Gereja dan Aula',
});

// Availability.
await api('POST', `${w}/blockouts`, token, {
  personId: person('Kevin'),
  startDate: sundayAt(1, '00:00').slice(0, 10),
  endDate: sundayAt(1, '23:00').slice(0, 10),
  reason: 'Retret kantor',
});
await api('POST', `${w}/blockouts`, token, {
  startDate: sundayAt(3, '07:00', -2).slice(0, 10),
  endDate: sundayAt(3, '07:00', 1).slice(0, 10),
  reason: 'Mudik ke Siantar',
});

console.log('Worship demo data created');

export {};
