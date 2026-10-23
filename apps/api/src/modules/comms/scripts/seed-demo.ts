/**
 * Seeds realistic comms data for visual review, through the public API.
 *
 *   bun scripts/screenshots.ts --port 3103 --seed --routes /churches   # demo account + church
 *   bun apps/api/src/modules/comms/scripts/seed-demo.ts --port 3103
 *
 * Signs in as the screenshot demo account (owner), adds members who read, register and RSVP,
 * and records announcements (pinned, group, roles, scheduled, draft), events (a weekly series,
 * a retreat with registration and a waitlist, an event starting now with check-in, a cancelled
 * one), worship services with a serving roster, a room booking, birthdays and anniversaries of
 * this week, and two Warta Jemaat issues. Safe to run once per database.
 */

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3103')}/api`;
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose API payloads in a dev script
type Json = Record<string, any>;

async function api<T = Json>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message: string } };
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${json.error?.message ?? response.status}`);
  return json;
}

/** A date relative to today in Jakarta (the demo church time zone). */
const day = (offset: number) => {
  const date = new Date(Date.now() + 7 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
/** An instant on a Jakarta wall clock: `at(0, '18:30')` is today at 18:30 WIB. */
const at = (offset: number, time: string) =>
  new Date(`${day(offset)}T${time}:00+07:00`).toISOString();
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** Days until the coming Sunday (0 when today is Sunday). */
const toSunday = (7 - weekday(day(0))) % 7;

const owner = await api<{ token: string; user: { id: string } }>('/auth/login', {
  body: { email, password },
});
const token = owner.token;
const churchId = (await api<{ items: { church: { id: string } }[] }>('/churches', { token }))
  .items[0]?.church.id;
if (!churchId) throw new Error('Run the screenshot script with --seed first');
const church = `/churches/${churchId}`;

// ---- People, households and accounts -----------------------------------------------------------

const people = (
  await api<{ items: { id: string; firstName: string; userId: string | null }[] }>(
    `${church}/people?limit=200`,
    { token },
  )
).items;
const person = (firstName: string) => {
  const found = people.find((item) => item.firstName === firstName);
  if (!found) throw new Error(`Missing person ${firstName}`);
  return found.id;
};
const groups = (await api<{ items: { id: string; name: string }[] }>(`${church}/groups`, { token }))
  .items;
const youth = groups.find((group) => group.name === 'Komisi Pemuda')?.id ?? null;

const addPerson = async (body: Json) =>
  (await api<{ person: { id: string } }>(`${church}/people`, { token, body })).person.id;
const md = (offset: number) => day(offset).slice(5);
await addPerson({
  firstName: 'Martha',
  lastName: 'Lubis',
  membershipStatus: 'member',
  birthDate: `1951-${md(toSunday + 1)}`,
});
await addPerson({
  firstName: 'Lukas',
  lastName: 'Pardede',
  membershipStatus: 'member',
  birthDate: `2012-${md(toSunday + 3)}`,
});
await addPerson({
  firstName: 'Debora',
  lastName: 'Sihombing',
  membershipStatus: 'member',
  birthDate: `1988-${md(toSunday + 5)}`,
});
const petrus = await addPerson({
  firstName: 'Petrus',
  lastName: 'Situmorang',
  membershipStatus: 'member',
  weddingDate: `1998-${md(toSunday + 2)}`,
});
const rina = await addPerson({
  firstName: 'Rina',
  lastName: 'Situmorang',
  membershipStatus: 'member',
  weddingDate: `1998-${md(toSunday + 2)}`,
});
await api(`${church}/households`, {
  token,
  body: {
    name: 'Keluarga Situmorang',
    members: [
      { personId: petrus, relationship: 'head' },
      { personId: rina, relationship: 'spouse' },
    ],
  },
});

const invitation = await api<{ invitation: { token: string } }>(`${church}/invitations`, {
  token,
  body: { expiresInDays: 7 },
});
const join = async (name: string, mail: string, firstName: string) => {
  const account = await api<{ token: string; user: { id: string } }>('/auth/register', {
    body: { name, email: mail, password: 'demo-password' },
  });
  await api(`/invitations/${invitation.invitation.token}/accept`, {
    method: 'POST',
    token: account.token,
  });
  const target = people.find((item) => item.firstName === firstName);
  if (target && !target.userId) {
    await api(`${church}/people/${target.id}/user`, {
      method: 'PUT',
      token,
      body: { userId: account.user.id },
    });
  }
  return account;
};
const ester = await join('Ester Lumbantobing', 'ester.comms@example.com', 'Ester');
const andreas = await join('Andreas Wijaya', 'andreas.comms@example.com', 'Andreas');
const ruth = await join('Ruth Siregar', 'ruth.comms@example.com', 'Ruth');
await api(`${church}/people/${person('Maria')}/user`, {
  method: 'PUT',
  token,
  body: { userId: owner.user.id },
}).catch(() => undefined);

// Ester is the church secretary (Sekretaris template): she posts news the owner hears about.
const roles = (
  await api<{ items: { id: string; name: string; templateKey: string | null }[] }>(
    `${church}/roles`,
    { token },
  )
).items;
const members = (
  await api<{ items: { id: string; userId: string }[] }>(`${church}/members`, { token })
).items;
const membershipOf = (userId: string) => members.find((item) => item.userId === userId)!.id;
const secretaryRole = roles.find((role) => role.templateKey === 'secretary');
if (secretaryRole) {
  await api(`${church}/members/${membershipOf(ester.user.id)}/roles`, {
    token,
    body: { roleId: secretaryRole.id },
  });
}
const elderRole = roles.find((role) => role.templateKey === 'elder');
if (elderRole) {
  await api(`${church}/members/${membershipOf(andreas.user.id)}/roles`, {
    token,
    body: { roleId: elderRole.id },
  });
}
// The organiser opts in to hearing about registrations.
await api('/notifications/preferences', {
  method: 'PUT',
  token,
  body: { items: [{ type: 'event.registrations', inApp: true, email: false }] },
});

// ---- Announcements ------------------------------------------------------------------------------

const announce = async (author: string, body: Json) =>
  (await api<{ announcement: { id: string } }>(`${church}/announcements`, { token: author, body }))
    .announcement.id;
const pinned = await announce(token, {
  title: 'Perjamuan Kudus dan Persiapan Natal',
  body: [
    'Jemaat yang dikasihi Tuhan, pada **Minggu depan** kita akan merayakan Perjamuan Kudus dalam ibadah pagi dan sore.',
    '',
    'Persiapan yang perlu diperhatikan:',
    '- Ibadah persiapan Perjamuan Kudus hari _Jumat_ pukul 19.00',
    '- Pakaian putih bagi anggota sidi',
    '- Pendaftaran panitia Natal dibuka di kantor gereja',
    '',
    'Informasi lebih lanjut: [kantor gereja](https://example.org/kontak).',
  ].join('\n'),
  status: 'published',
  pinned: true,
});
await announce(ester.token, {
  title: 'Pendaftaran Katekisasi Sidi 2027',
  body: 'Pendaftaran katekisasi sidi angkatan 2027 dibuka sampai **akhir bulan**. Formulir tersedia di kantor gereja dan dapat diserahkan setelah ibadah.',
  status: 'published',
});
await announce(ester.token, {
  title: 'Kerja Bakti Lingkungan Gereja',
  body: 'Mari bersama membersihkan halaman dan taman gereja hari Sabtu pukul 07.00. Konsumsi disediakan Komisi Wanita.',
  status: 'published',
});
if (youth) {
  await announce(token, {
    title: 'Latihan Paduan Suara Pemuda',
    body: 'Latihan untuk pelayanan Natal setiap Sabtu pukul 16.00 di Aula.',
    status: 'published',
    audience: 'group',
    groupId: youth,
  });
}
if (elderRole) {
  await announce(token, {
    title: 'Rapat Majelis Jemaat Bulanan',
    body: 'Rapat majelis membahas program pelayanan tahun depan. Mohon membawa laporan masing-masing bidang.',
    status: 'published',
    audience: 'roles',
    roleIds: [elderRole.id],
  });
}
await announce(token, {
  title: 'Ibadah Syukur HUT Gereja ke-75',
  body: 'Ibadah syukur dilanjutkan dengan makan bersama. Setiap keluarga diharapkan membawa satu hidangan.',
  status: 'published',
  publishAt: at(3, '08:00'),
});
await announce(token, {
  title: 'Rencana Retret Majelis',
  body: 'Draf rencana retret: tempat dan anggaran masih dibahas.',
  status: 'draft',
});
for (const reader of [ester, andreas, ruth]) {
  await api(`${church}/announcements/${pinned}/read`, { method: 'POST', token: reader.token });
}

// ---- Events -------------------------------------------------------------------------------------

const event = async (body: Json, author = token) =>
  (await api<{ event: { id: string } }>(`${church}/events`, { token: author, body })).event.id;
const nextWednesday = (3 - weekday(day(0)) + 7) % 7 || 7;
await api(`${church}/events/series`, {
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
  capacity: 6,
  registrationRequired: true,
  waitlistEnabled: true,
  coverColor: '#16a34a',
});
await api(`${church}/events/${retreat}/registrations`, {
  token: ester.token,
  body: { partySize: 3, note: 'Satu anak 6 tahun' },
});
await api(`${church}/events/${retreat}/registrations`, {
  token: andreas.token,
  body: { partySize: 2 },
});
await api(`${church}/events/${retreat}/registrations`, {
  token: ruth.token,
  body: { partySize: 2 },
});
await api(`${church}/events/${retreat}/registrations`, { token, body: { partySize: 1 } }).catch(
  () => undefined,
);

const tonight = await event({
  title: 'Ibadah Pemuda dan Remaja',
  location: 'Aula Serbaguna',
  startsAt: at(0, new Date(Date.now() + 7 * 3_600_000).toISOString().slice(11, 13) + ':00'),
  endsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
  checkInEnabled: true,
  groupId: youth,
});
for (const account of [ester, andreas]) {
  const detail = await api<{ registrablePeople: { id: string }[] }>(`${church}/events/${tonight}`, {
    token: account.token,
  });
  const personId = detail.registrablePeople[0]?.id;
  if (personId) {
    await api(`${church}/events/${tonight}/participants/${personId}`, {
      method: 'PATCH',
      token: account.token,
      body: { status: 'going' },
    });
  }
}
await api(`${church}/events/${tonight}/check-in`, {
  token,
  body: { personIds: [person('Ester')] },
});

await event({
  title: 'Bakti Sosial Pengobatan Gratis',
  location: 'Balai Warga RW 05',
  startsAt: at(9, '08:00'),
  endsAt: at(9, '13:00'),
  coverColor: '#dc2626',
});
const cancelled = await event({
  title: 'Lomba Vokal Grup Antar Sektor',
  startsAt: at(6, '15:00'),
  location: 'Aula Serbaguna',
});
await api(`${church}/events/${cancelled}/cancel`, {
  token,
  body: { reason: 'Diundur ke bulan depan' },
});

// ---- Worship services, roster and a booking -----------------------------------------------------

const worship = `${church}/worship`;
const service = async (
  title: string,
  offset: number,
  time: string,
  preacherName: string,
  theme: string,
) =>
  (
    await api<{ service: { id: string } }>(`${worship}/services`, {
      token,
      body: {
        title,
        startsAt: at(offset, time),
        status: 'published',
        preacherName,
        theme,
        location: 'Gedung Gereja',
      },
    })
  ).service.id;
const morning = await service(
  'Kebaktian Umum I',
  toSunday,
  '07:00',
  'Pdt. Samuel Nainggolan',
  'Kasih itu sabar',
);
await service('Kebaktian Umum II', toSunday, '10:00', 'Pdt. Samuel Nainggolan', 'Kasih itu sabar');
await service('Kebaktian Sore', toSunday, '17:00', 'Pnt. Yohanes Tambunan', 'Berakar dalam kasih');
const team = await api<{ team: { id: string } }>(`${worship}/teams`, {
  token,
  body: { name: 'Tim Musik' },
});
const organ = await api<{ position: { id: string } }>(
  `${worship}/teams/${team.team.id}/positions`,
  { token, body: { name: 'Organis' } },
);
const song = await api<{ position: { id: string } }>(`${worship}/teams/${team.team.id}/positions`, {
  token,
  body: { name: 'Pemandu Lagu' },
});
for (const name of ['Ester', 'Andreas', 'Ruth']) {
  await api(`${worship}/teams/${team.team.id}/members`, {
    token,
    body: { personId: person(name) },
  });
}
await api(`${worship}/services/${morning}/roster`, {
  token,
  body: {
    assignments: [
      { positionId: organ.position.id, personId: person('Ester') },
      { positionId: song.position.id, personId: person('Andreas') },
      { positionId: song.position.id, personId: person('Ruth') },
    ],
    ignoreConflicts: true,
  },
});

const resource = await api<{ resource: { id: string } }>(`${church}/facilities/resources`, {
  token,
  body: { name: 'Aula Serbaguna Lt. 2', kind: 'hall', capacity: 150, color: '#0d9488' },
}).catch(() => null);
if (resource) {
  await api(`${church}/facilities/bookings`, {
    token,
    body: {
      resourceId: resource.resource.id,
      title: 'Latihan Tari Natal Sekolah Minggu',
      startsAt: at(2, '15:00'),
      endsAt: at(2, '17:00'),
    },
  });
}

// ---- Warta Jemaat -------------------------------------------------------------------------------

const sections = [
  {
    id: 'renungan',
    kind: 'text',
    title: 'Renungan Singkat',
    body: '> Kasih itu sabar; kasih itu murah hati; ia tidak cemburu. (1 Korintus 13:4)\n\nKasih bukan sekadar perasaan, melainkan keputusan untuk setia hadir bagi sesama. Minggu ini, mari kita wujudkan kasih itu dalam keluarga dan lingkungan kita.',
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
const current = await api<{ bulletin: { id: string } }>(`${church}/bulletins`, {
  token,
  body: { title: 'Warta Jemaat', issueDate: day(toSunday), theme: 'Kasih itu sabar', sections },
});
await api(`${church}/bulletins/${current.bulletin.id}/publish`, { method: 'POST', token });
const previous = await api<{ bulletin: { id: string } }>(`${church}/bulletins`, {
  token,
  body: {
    title: 'Warta Jemaat',
    issueDate: day(toSunday - 7),
    theme: 'Bersyukur dalam segala hal',
    sections: sections.slice(0, 4),
  },
});
await api(`${church}/bulletins/${previous.bulletin.id}/publish`, { method: 'POST', token });
await api(`${church}/bulletins/${current.bulletin.id}/duplicate`, { method: 'POST', token });

console.info(`Seeded comms data for church ${churchId}`);

export {};
