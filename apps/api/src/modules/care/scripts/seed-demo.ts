/**
 * Seeds realistic pastoral care data for visual review, through the public API only.
 *
 *   bun scripts/screenshots.ts --port 3105 --seed --routes /churches   # demo account + church
 *   bun apps/api/src/modules/care/scripts/seed-demo.ts --port 3105
 *
 * Signs in as the screenshot demo account (owner), adds a pastor and an elder with the suggested
 * roles, and records care cases (one confidential), visits, prayer requests, visitor follow-ups,
 * tasks and diakonia aid. Safe to run once per database.
 */
export {};

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3105')}/api`;
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

const owner = await api<{ token: string; user: { id: string } }>('/auth/login', {
  body: { email, password },
});
const churchId = (
  await api<{ items: { church: { id: string } }[] }>('/churches', { token: owner.token })
).items[0]?.church.id;
if (!churchId) throw new Error('Run the screenshot script with --seed first');
const at = `/churches/${churchId}`;
const care = `${at}/care`;

// ---- People -------------------------------------------------------------------------------------

const extraPeople = [
  ['Lidya', 'Pangaribuan', 'member', '0813-2211-4455'],
  ['Kevin', 'Sihombing', 'visitor', '0812-7788-9900'],
  ['Grace', 'Manurung', 'visitor', '0821-3344-5566'],
  ['Hendra', 'Gunawan', 'member', '0815-6677-8899'],
  ['Martha', 'Situmorang', 'member', '0817-1122-3344'],
] as const;
for (const [firstName, lastName, membershipStatus, phone] of extraPeople) {
  await api(`${at}/people`, {
    token: owner.token,
    body: { firstName, lastName, membershipStatus, phone },
  });
}
const people = (
  await api<{ items: { id: string; firstName: string }[] }>(`${at}/people?limit=200`, {
    token: owner.token,
  })
).items;
const person = (firstName: string) => {
  const found = people.find((item) => item.firstName === firstName);
  if (!found) throw new Error(`Missing person ${firstName}`);
  return found.id;
};

// ---- A pastor and an elder ------------------------------------------------------------------------

const invitation = await api<{ invitation: { token: string } }>(`${at}/invitations`, {
  token: owner.token,
  body: { expiresInDays: 7 },
});
const roles = (
  await api<{ items: { id: string; templateKey: string | null }[] }>(`${at}/roles`, {
    token: owner.token,
  })
).items;
const join = async (name: string, mail: string, templateKey: string, firstName: string) => {
  const account = await api<{ token: string; user: { id: string } }>('/auth/register', {
    body: { name, email: mail, password: 'demo-password' },
  });
  await api(`/invitations/${invitation.invitation.token}/accept`, {
    method: 'POST',
    token: account.token,
  });
  const members = await api<{ items: { id: string; userId: string }[] }>(`${at}/members`, {
    token: owner.token,
  });
  const membership = members.items.find((item) => item.userId === account.user.id);
  const role = roles.find((item) => item.templateKey === templateKey);
  if (membership && role) {
    await api(`${at}/members/${membership.id}/roles`, {
      token: owner.token,
      body: { roleId: role.id },
    });
  }
  await api(`${at}/people/${person(firstName)}/user`, {
    method: 'PUT',
    token: owner.token,
    body: { userId: account.user.id },
  });
  return account;
};
const pastor = await join('Pdt. Yohanes Tambunan', 'pdt.yohanes@example.com', 'pastor', 'Yohanes');
const elder = await join('Pnt. Ruth Siregar', 'pnt.ruth@example.com', 'elder', 'Ruth');
const ownerPerson = person('Maria');
await api(`${at}/people/${ownerPerson}/user`, {
  method: 'PUT',
  token: owner.token,
  body: { userId: owner.user.id },
}).catch(() => undefined);

// ---- Care cases -----------------------------------------------------------------------------------

const createCase = async (token: string, body: Json) =>
  (await api<{ case: { id: string } }>(`${care}/cases`, { token, body })).case.id;
const note = (token: string, caseId: string, kind: string, text: string) =>
  api(`${care}/cases/${caseId}/notes`, { token, body: { kind, body: text } });

const hospital = await createCase(owner.token, {
  personId: person('Ester'),
  category: 'hospital',
  priority: 'high',
  status: 'in_progress',
  title: 'Opname di RS Immanuel',
  description: 'Operasi usus buntu hari Senin. Keluarga meminta didoakan dan dikunjungi.',
  nextActionDate: day(1),
  nextActionNote: 'Kunjungi setelah operasi, bawa Perjamuan Kudus',
  caregiverUserIds: [elder.user.id, owner.user.id],
});
await note(owner.token, hospital, 'call', 'Menelepon ibunya, operasi dijadwalkan pukul 10.00.');
await note(
  elder.token,
  hospital,
  'visit',
  'Berkunjung bersama Dkn. Hendra, berdoa bersama keluarga.',
);

const grief = await createCase(owner.token, {
  personId: person('Samuel'),
  category: 'grief',
  priority: 'normal',
  title: 'Pendampingan duka keluarga Nainggolan',
  description: 'Istri Bpk. Samuel dipanggil Tuhan. Ibadah penghiburan hari ketiga sudah dilayani.',
  nextActionDate: day(0),
  nextActionNote: 'Ibadah penghiburan hari ketujuh',
  caregiverUserIds: [pastor.user.id],
});
await note(pastor.token, grief, 'meeting', 'Ibadah penghiburan di rumah duka, dihadiri ±60 orang.');

await createCase(owner.token, {
  personId: person('Ruth'),
  category: 'hospital',
  priority: 'urgent',
  title: 'Kecelakaan motor, dirawat di RSHS',
  nextActionDate: day(-1),
  nextActionNote: 'Koordinasi donor darah',
  caregiverUserIds: [owner.user.id],
});

const counseling = await createCase(pastor.token, {
  personId: person('Daniel'),
  category: 'counseling',
  confidentiality: 'confidential',
  priority: 'normal',
  title: 'Konseling pranikah',
  description: 'Sesi konseling pranikah ketiga dari lima.',
  nextActionDate: day(4),
  nextActionNote: 'Sesi 4: keuangan keluarga',
  caregiverUserIds: [pastor.user.id, owner.user.id],
});
await note(pastor.token, counseling, 'meeting', 'Sesi 3 berjalan baik; membahas komunikasi.');

const aidCase = await createCase(owner.token, {
  personId: person('Lidya'),
  category: 'financial_aid',
  priority: 'high',
  title: 'Bantuan biaya sekolah anak',
  nextActionDate: day(6),
  nextActionNote: 'Rapat Diakonia memutuskan besaran bantuan',
  caregiverUserIds: [elder.user.id],
});

const closed = await createCase(owner.token, {
  personId: person('Andreas'),
  category: 'visitation',
  title: 'Perkunjungan rutin lansia',
});
await api(`${care}/cases/${closed}`, {
  method: 'PATCH',
  token: owner.token,
  body: {
    personId: person('Andreas'),
    category: 'visitation',
    title: 'Perkunjungan rutin lansia',
    status: 'closed',
    closedReason: 'Sudah kembali beribadah setiap Minggu',
  },
});

// ---- Visits ---------------------------------------------------------------------------------------

const visit = (token: string, body: Json) => api(`${care}/visits`, { token, body });
await visit(elder.token, {
  caseId: hospital,
  visitDate: day(-2),
  location: 'RS Immanuel, kamar 204',
  summary: 'Kondisi stabil, masih menunggu jadwal operasi. Berdoa bersama suami dan anak.',
  visitorPersonIds: [person('Ruth'), person('Hendra')],
  followUpNeeded: true,
  followUpNote: 'Kunjungi lagi setelah operasi',
});
await visit(owner.token, {
  personId: person('Samuel'),
  visitDate: day(-5),
  location: 'Rumah duka, Jl. Cihampelas 12',
  summary: 'Ibadah penghiburan dan menemani keluarga.',
  visitorPersonIds: [person('Yohanes'), person('Maria')],
});
await visit(owner.token, {
  personId: person('Martha'),
  visitDate: day(-9),
  location: 'Rumah',
  summary: 'Perkunjungan lansia, Oma Martha sehat dan rindu ibadah.',
  visitorPersonIds: [person('Maria')],
  otherVisitors: 'Tim Komisi Usia Lanjut',
  followUpNeeded: true,
  followUpNote: 'Atur penjemputan ke ibadah Minggu',
});
await visit(pastor.token, {
  personId: person('Andreas'),
  visitDate: day(-20),
  location: 'Rumah',
  visitorPersonIds: [person('Yohanes')],
});

// ---- Prayer requests ------------------------------------------------------------------------------

const prayer = async (token: string, body: Json) =>
  (await api<{ request: { id: string } }>(`${care}/prayer-requests`, { token, body })).request.id;
const pray = (token: string, id: string) =>
  api(`${care}/prayer-requests/${id}/pray`, { method: 'POST', token });

const exam = await prayer(owner.token, {
  title: 'Ujian nasional anak-anak SMA',
  body: 'Doakan para siswa kelas XII dari jemaat kita yang menghadapi ujian minggu depan, agar diberi ketenangan dan hikmat.',
});
await pray(pastor.token, exam);
await pray(elder.token, exam);
const healing = await prayer(elder.token, {
  title: 'Kesembuhan Ibu Ester',
  body: 'Mohon dukungan doa untuk operasi Ibu Ester hari Senin di RS Immanuel.',
});
await api(`${care}/prayer-requests/${healing}/moderate`, {
  token: owner.token,
  body: { decision: 'approved' },
}).catch(() => undefined);
await pray(owner.token, healing);
await pray(pastor.token, healing);
const job = await prayer(pastor.token, {
  title: 'Pekerjaan baru',
  body: 'Seorang anggota jemaat sedang mencari pekerjaan setelah kontraknya berakhir.',
  isAnonymous: true,
});
await pray(owner.token, job);
const answered = await prayer(owner.token, {
  title: 'Pembangunan gedung serbaguna',
  body: 'Doakan proses perizinan IMB gedung serbaguna gereja.',
});
await pray(elder.token, answered);
await api(`${care}/prayer-requests/${answered}/answer`, {
  token: owner.token,
  body: {
    testimony:
      'Puji Tuhan, izin bangunan sudah terbit pada bulan ini. Terima kasih atas doa jemaat.',
  },
});
await prayer(elder.token, {
  title: 'Pergumulan keluarga',
  body: 'Untuk tim pastoral saja: keluarga kami sedang dalam masa sulit.',
  visibility: 'care_team',
});
const member = await api<{ token: string }>('/auth/register', {
  body: { name: 'Grace Manurung', email: 'grace@example.com', password: 'demo-password' },
});
await api(`/invitations/${invitation.invitation.token}/accept`, {
  method: 'POST',
  token: member.token,
});
await prayer(member.token, {
  title: 'Pindah kerja ke Surabaya',
  body: 'Doakan keluarga kami yang akan pindah ke Surabaya bulan depan, agar mendapat gereja yang baik.',
});
await prayer(member.token, {
  title: 'Kesehatan papa',
  body: 'Papa baru didiagnosis diabetes, doakan agar disiplin berobat.',
});

// ---- Visitor follow-up ----------------------------------------------------------------------------

const followUp = async (body: Json) =>
  (await api<{ followUp: { id: string } }>(`${care}/follow-ups`, { token: owner.token, body }))
    .followUp.id;
const move = (id: string, stage: string, closedReason?: string) =>
  api(`${care}/follow-ups/${id}/stage`, { token: owner.token, body: { stage, closedReason } });
const task = (body: Json, token = owner.token) => api(`${care}/tasks`, { token, body });

const kevin = await followUp({
  personId: person('Kevin'),
  source: 'Diajak teman kantor',
  firstVisitDate: day(-6),
  assignedUserId: elder.user.id,
  notes: 'Baru pindah dari Medan, tertarik ikut persekutuan pemuda.',
});
await task({
  title: 'Telepon Kevin, ajak ke Persekutuan Pemuda',
  followUpId: kevin,
  dueDate: day(-1),
  assignedUserId: elder.user.id,
});
const grace = await followUp({
  personId: person('Grace'),
  source: 'Instagram',
  firstVisitDate: day(-13),
  assignedUserId: owner.user.id,
});
await move(grace, 'contacted');
await task({ title: 'Kunjungi keluarga Grace', followUpId: grace, dueDate: day(0) });
const nathan = await followUp({
  newVisitor: { firstName: 'Nathan', lastName: 'Kurniawan', phone: '0812-9090-1212' },
  source: 'Datang sendiri',
  firstVisitDate: day(-20),
  assignedUserId: pastor.user.id,
});
await move(nathan, 'contacted');
await move(nathan, 'visited');
await task({
  title: 'Undang ke kelas katekisasi',
  followUpId: nathan,
  dueDate: day(5),
  assignedUserId: pastor.user.id,
});
const sinta = await followUp({
  newVisitor: { firstName: 'Sinta', lastName: 'Rahayu', phone: '0856-4433-2211' },
  source: 'Natal Pemuda',
  firstVisitDate: day(-35),
});
await move(sinta, 'joined');
await followUp({
  newVisitor: { firstName: 'Bayu', lastName: 'Prasetyo', phone: '0813-5566-7788' },
  source: 'Diajak keluarga',
  firstVisitDate: day(-1),
});
const tomi = await followUp({
  newVisitor: { firstName: 'Tomi', lastName: 'Halim' },
  firstVisitDate: day(-40),
});
await move(tomi, 'closed', 'Pindah ke luar kota');

// ---- Tasks ----------------------------------------------------------------------------------------

await task({ title: 'Bawa Perjamuan Kudus untuk Ibu Ester', caseId: hospital, dueDate: day(1) });
await task({ title: 'Siapkan bingkisan Natal lansia', dueDate: day(10) });
await task({
  title: 'Kirim ucapan penghiburan',
  caseId: grief,
  dueDate: day(-2),
  assignedUserId: owner.user.id,
});

// ---- Diakonia -------------------------------------------------------------------------------------

const aid = (body: Json) => api(`${care}/diakonia`, { token: owner.token, body });
await aid({
  personId: person('Lidya'),
  caseId: aidCase,
  category: 'education',
  form: 'cash',
  amount: 2_500_000,
  givenAt: day(-3),
  description: 'Uang sekolah semester ganjil',
  financeReference: 'KK-2026-0142',
});
await aid({
  personId: person('Samuel'),
  category: 'funeral',
  form: 'cash',
  amount: 1_000_000,
  givenAt: day(-6),
  description: 'Tali kasih kedukaan',
  financeReference: 'KK-2026-0139',
});
await aid({
  personId: person('Martha'),
  category: 'food',
  form: 'goods',
  givenAt: day(-8),
  description: 'Paket sembako: beras 10 kg, minyak, gula',
});
await aid({
  recipientName: 'Korban banjir Dayeuhkolot',
  category: 'emergency',
  form: 'cash',
  amount: 5_000_000,
  givenAt: day(-15),
  description: 'Bantuan tanggap darurat bersama klasis',
  financeReference: 'KK-2026-0121',
});
await aid({
  personId: person('Ester'),
  category: 'health',
  form: 'service',
  givenAt: day(-1),
  description: 'Antar-jemput ke rumah sakit oleh tim diakonia',
});

console.info(`Seeded pastoral care for church ${churchId}`);
