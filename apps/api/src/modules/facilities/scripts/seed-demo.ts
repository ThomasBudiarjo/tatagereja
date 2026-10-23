/**
 * Seeds realistic facilities and inventory data for visual review, through the public API.
 *
 *   bun scripts/screenshots.ts --port 3107 --seed --routes /churches   # demo account + church
 *   bun apps/api/src/modules/facilities/scripts/seed-demo.ts --port 3107 --db /tmp/wf-facilities.db
 *
 * Signs in as the screenshot demo account (owner, who manages facilities and inventory), adds two
 * members who request rooms, and records rooms and resources, approved, pending, rejected and
 * weekly bookings, inventory assets, loans and a maintenance log. The API refuses due dates in
 * the past, so `--db` (optional) backdates one loan in the database to show an overdue loan.
 * Safe to run once per database.
 */
import { Database } from 'bun:sqlite';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1]! : fallback;
};
const base = `http://localhost:${option('port', '3107')}/api`;
const email = option('email', 'demo@tatagereja.test');
const password = option('password', 'demo-password');
const databasePath = option('db', '');

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

const owner = await api<{ token: string; user: { id: string } }>('/auth/login', {
  body: { email, password },
});
const churchId = (
  await api<{ items: { church: { id: string } }[] }>('/churches', { token: owner.token })
).items[0]?.church.id;
if (!churchId) throw new Error('Run the screenshot script with --seed first');
const church = `/churches/${churchId}`;
const facilities = `${church}/facilities`;
const inventory = `${church}/inventory`;

// ---- People who request rooms -----------------------------------------------------------------

const people = (
  await api<{ items: { id: string; firstName: string }[] }>(`${church}/people?limit=200`, {
    token: owner.token,
  })
).items;
const person = (firstName: string) => {
  const found = people.find((item) => item.firstName === firstName);
  if (!found) throw new Error(`Missing person ${firstName}`);
  return found.id;
};
const groups = (
  await api<{ items: { id: string; name: string }[] }>(`${church}/groups`, { token: owner.token })
).items;
const group = (name: string) => groups.find((item) => item.name === name)?.id ?? null;

const invitation = await api<{ invitation: { token: string } }>(`${church}/invitations`, {
  token: owner.token,
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
  await api(`${church}/people/${person(firstName)}/user`, {
    method: 'PUT',
    token: owner.token,
    body: { userId: account.user.id },
  });
  return account;
};
const ester = await join('Ester Lumbantobing', 'ester.facilities@example.com', 'Ester');
const andreas = await join('Andreas Wijaya', 'andreas.facilities@example.com', 'Andreas');
await api(`${church}/people/${person('Maria')}/user`, {
  method: 'PUT',
  token: owner.token,
  body: { userId: owner.user.id },
}).catch(() => undefined);

// ---- Rooms and resources ----------------------------------------------------------------------

const resource = async (body: Json) =>
  (await api<{ resource: { id: string } }>(`${facilities}/resources`, { token: owner.token, body }))
    .resource.id;

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
const classA = await resource({
  name: 'Ruang Sekolah Minggu A',
  kind: 'classroom',
  location: 'Gedung C, lantai 1',
  capacity: 30,
  features: ['Papan tulis', 'Karpet', 'Speaker kecil'],
  requiresApproval: false,
});
await resource({
  name: 'Ruang Sekolah Minggu B',
  kind: 'classroom',
  location: 'Gedung C, lantai 1',
  capacity: 25,
  features: ['Papan tulis', 'Meja anak'],
  requiresApproval: false,
});
const car = await resource({
  name: 'Mobil Pelayanan Innova',
  kind: 'vehicle',
  location: 'Garasi gereja',
  capacity: 7,
  features: ['Sopir: Pak Tigor', 'BBM diisi peminjam'],
  color: '#4f46e5',
  description: 'Untuk Perkunjungan, antar-jemput lansia dan keperluan pelayanan.',
});
const projector = await resource({
  name: 'Proyektor Portabel',
  kind: 'equipment',
  location: 'Ruang multimedia',
  features: ['Layar 70"', 'Kabel HDMI 10 m'],
});
await resource({
  name: 'Gedung Serbaguna Lama',
  kind: 'other',
  location: 'Jl. Kebon Jati belakang',
  capacity: 80,
  isActive: false,
  description: 'Sedang direnovasi.',
});

// ---- Bookings ---------------------------------------------------------------------------------

const book = async (token: string, body: Json) =>
  (await api<{ booking: { id: string } }>(`${facilities}/bookings`, { token, body })).booking.id;
const decide = (id: string, decision: 'approved' | 'rejected', note?: string) =>
  api(`${facilities}/bookings/${id}/decision`, { token: owner.token, body: { decision, note } });

// Managers' own bookings are approved at once.
const sunday = (7 - new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay()) % 7;
await book(owner.token, {
  resourceId: sanctuary,
  title: 'Kebaktian Minggu Pagi',
  purpose: 'Ibadah umum 1 dan 2',
  startsAt: at(sunday, '06:30'),
  endsAt: at(sunday, '11:30'),
  recurrence: 'weekly',
  recurrenceUntil: day(180),
  expectedAttendees: 400,
});
await book(owner.token, {
  resourceId: consistory,
  title: 'Rapat Majelis Jemaat',
  purpose: 'Rapat rutin bulanan Majelis',
  startsAt: at(0, '09:00'),
  endsAt: at(0, '11:30'),
  expectedAttendees: 16,
});
await book(owner.token, {
  resourceId: hall,
  title: 'Latihan Paduan Suara Efrata',
  startsAt: at(0, '18:30'),
  endsAt: at(0, '21:00'),
  recurrence: 'weekly',
  recurrenceUntil: day(90),
  groupId: group('Paduan Suara Efrata'),
  expectedAttendees: 35,
});
await book(owner.token, {
  resourceId: car,
  title: 'Perkunjungan lansia Wilayah 3',
  purpose: 'Perkunjungan bersama Penatua',
  startsAt: at(0, '13:00'),
  endsAt: at(0, '16:00'),
});
await book(owner.token, {
  resourceId: sanctuary,
  title: 'Pemberkatan Nikah Daniel & Grace',
  startsAt: at(sunday + 6, '10:00'),
  endsAt: at(sunday + 6, '12:00'),
  expectedAttendees: 250,
});
// Classrooms book at once for members too.
await book(ester.token, {
  resourceId: classA,
  title: 'Persiapan Sekolah Minggu',
  startsAt: at(2, '16:00'),
  endsAt: at(2, '18:00'),
  groupId: group('Komisi Pemuda'),
});
// Requests waiting for the facilities manager.
await book(ester.token, {
  resourceId: hall,
  title: 'Persekutuan Pemuda',
  purpose: 'Ibadah dan diskusi Komisi Pemuda',
  startsAt: at(4, '18:00'),
  endsAt: at(4, '21:00'),
  groupId: group('Komisi Pemuda'),
  expectedAttendees: 60,
  notes: 'Mohon kursi disusun melingkar.',
});
await book(andreas.token, {
  resourceId: projector,
  title: 'Presentasi Retret Keluarga',
  startsAt: at(6, '19:00'),
  endsAt: at(6, '21:00'),
});
const katekisasi = await book(andreas.token, {
  resourceId: consistory,
  title: 'Kelas Katekisasi Sidi',
  startsAt: at(3, '19:00'),
  endsAt: at(3, '20:30'),
  recurrence: 'weekly',
  recurrenceUntil: day(60),
  expectedAttendees: 12,
});
await decide(katekisasi, 'approved', 'Kunci ruangan ada pada koster.');
const bazaar = await book(andreas.token, {
  resourceId: sanctuary,
  title: 'Bazar Natal',
  startsAt: at(12, '08:00'),
  endsAt: at(12, '15:00'),
});
await decide(
  bazaar,
  'rejected',
  'Ruang Kebaktian tidak dipakai untuk bazar; silakan Aula Serbaguna.',
);

// ---- Inventory ----------------------------------------------------------------------------------

const asset = async (body: Json) =>
  (await api<{ asset: { id: string } }>(`${inventory}/assets`, { token: owner.token, body })).asset
    .id;

const mixer = await asset({
  name: 'Mixer Yamaha MG16XU',
  category: 'Sound system',
  resourceId: sanctuary,
  location: 'Ruang operator',
  condition: 'good',
  acquisitionDate: '2021-04-12',
  acquisitionValue: 8_750_000,
  custodianPersonId: person('Yohanes'),
  serialNumber: 'YMG16-04821',
});
const mic = await asset({
  name: 'Mikrofon Wireless Shure BLX288',
  category: 'Sound system',
  resourceId: sanctuary,
  condition: 'good',
  acquisitionDate: '2022-11-03',
  acquisitionValue: 6_200_000,
  custodianPersonId: person('Yohanes'),
});
const portableProjector = await asset({
  name: 'Proyektor Epson EB-X51',
  category: 'Multimedia',
  resourceId: projector,
  location: 'Lemari multimedia',
  condition: 'fair',
  acquisitionDate: '2019-08-20',
  acquisitionValue: 7_400_000,
  serialNumber: 'EPX51-77310',
});
const keyboard = await asset({
  name: 'Keyboard Yamaha PSR-SX700',
  category: 'Alat musik',
  resourceId: hall,
  condition: 'good',
  acquisitionDate: '2020-02-01',
  acquisitionValue: 21_500_000,
  custodianPersonId: person('Ruth'),
});
const organ = await asset({
  name: 'Organ Pipa Ruang Kebaktian',
  category: 'Alat musik',
  resourceId: sanctuary,
  condition: 'good',
  acquisitionDate: '1998-12-20',
  acquisitionValue: 450_000_000,
  notes: 'Disetem dua kali setahun oleh teknisi dari Yogyakarta.',
});
const chairs = await asset({
  name: 'Kursi Lipat Chitose (150 buah)',
  category: 'Perabot',
  resourceId: hall,
  location: 'Gudang aula',
  condition: 'fair',
  acquisitionDate: '2018-06-15',
  acquisitionValue: 33_000_000,
});
await asset({
  name: 'Set Alat Perjamuan Kudus',
  category: 'Liturgi',
  resourceId: consistory,
  location: 'Lemari konsistori',
  condition: 'new',
  acquisitionDate: '2025-03-30',
  acquisitionValue: 4_800_000,
  custodianPersonId: person('Ruth'),
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
const camera = await asset({
  name: 'Kamera Sony ZV-E10 (live streaming)',
  category: 'Multimedia',
  resourceId: sanctuary,
  condition: 'good',
  acquisitionDate: '2023-07-14',
  acquisitionValue: 11_900_000,
  custodianPersonId: person('Andreas'),
});
await asset({
  name: 'Gitar Akustik Yamaha F310',
  category: 'Alat musik',
  resourceId: classA,
  condition: 'good',
  acquisitionDate: '2024-01-08',
  acquisitionValue: 1_650_000,
});

// Loans: one out, one returned and one that is overdue.
const lend = (assetId: string, body: Json) =>
  api<{ loan: { id: string } }>(`${inventory}/assets/${assetId}/loans`, {
    token: owner.token,
    body,
  });
await lend(mic, {
  borrowerPersonId: person('Ester'),
  groupId: group('Komisi Pemuda'),
  dueDate: day(5),
  notes: 'Dua mikrofon beserta receiver.',
});
const returned = await lend(keyboard, {
  borrowerName: 'GKI Pasirkaliki (gereja tamu)',
  dueDate: day(3),
});
await api(`${inventory}/loans/${returned.loan.id}/return`, {
  token: owner.token,
  body: { conditionIn: 'good', notes: 'Kembali lengkap dengan stand.' },
});
const late = await lend(portableProjector, {
  borrowerPersonId: person('Daniel'),
  dueDate: day(1),
  notes: 'Untuk persekutuan kampus.',
});
await lend(camera, { borrowerPersonId: person('Andreas'), dueDate: day(14) });

if (databasePath) {
  const sqlite = new Database(databasePath);
  sqlite
    .query('update asset_loans set due_date = ?, checked_out_at = ? where id = ?')
    .run(day(-4), at(-11, '10:00'), late.loan.id);
  sqlite.close();
}

// Maintenance log.
const maintain = (assetId: string, body: Json) =>
  api(`${inventory}/assets/${assetId}/maintenance`, { token: owner.token, body });
await maintain(organ, {
  date: day(-190),
  kind: 'service',
  description: 'Penyeteman seluruh pipa dan pembersihan debu.',
  cost: 12_500_000,
  performedBy: 'CV Orgel Nusantara',
  nextDueDate: day(-8),
});
await maintain(ac, {
  date: day(-40),
  kind: 'repair',
  description: 'Isi freon dan ganti kapasitor.',
  cost: 850_000,
  performedBy: 'Teknik Sejuk Bandung',
  nextDueDate: day(20),
});
await maintain(mixer, {
  date: day(-25),
  kind: 'inspection',
  description: 'Pemeriksaan kanal dan fader menjelang Paskah.',
  performedBy: 'Tim Multimedia',
});
await maintain(chairs, {
  date: day(-60),
  kind: 'cleaning',
  description: 'Pencucian dan pengecekan engsel.',
  cost: 300_000,
});

console.info(`Seeded facilities and inventory for church ${churchId}`);
