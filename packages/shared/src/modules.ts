import type { LocalizedText } from './localized';

/**
 * Feature modules. Every permission, notification type and API router belongs to one.
 * Optional modules can be switched off per church; their routes then answer 403 MODULE_DISABLED.
 */
export const MODULE_IDS = [
  'core',
  'admin-security',
  'people',
  'comms',
  'insights',
  'worship',
  'care',
  'records',
  'finance',
  'facilities',
  'checkin',
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleDefinition = {
  id: ModuleId;
  /** Optional modules can be disabled by people holding `settings.manage`. */
  optional: boolean;
  label: LocalizedText;
  description: LocalizedText;
};

export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'core',
    optional: false,
    label: { en: 'Church', id: 'Gereja' },
    description: {
      en: 'Church profile, member accounts, roles, invitations, settings and audit log.',
      id: 'Profil gereja, akun anggota, peran, undangan, pengaturan, dan log audit.',
    },
  },
  {
    id: 'admin-security',
    optional: false,
    label: { en: 'Administration & security', id: 'Administrasi & keamanan' },
    description: {
      en: 'Account security, two-factor authentication, security policy and data export.',
      id: 'Keamanan akun, verifikasi dua langkah, kebijakan keamanan, dan ekspor data.',
    },
  },
  {
    id: 'people',
    optional: false,
    label: { en: 'People & groups', id: 'Jemaat & kelompok' },
    description: {
      en: 'Directory, households, areas, groups and ministries.',
      id: 'Direktori jemaat, keluarga, wilayah/sektor, kelompok, dan komisi.',
    },
  },
  {
    id: 'comms',
    optional: false,
    label: { en: 'Communication & events', id: 'Komunikasi & kegiatan' },
    description: {
      en: 'Announcements, events, calendar, notifications and the weekly bulletin.',
      id: 'Pengumuman, kegiatan, kalender, pemberitahuan, dan Warta Jemaat.',
    },
  },
  {
    id: 'insights',
    optional: false,
    label: { en: 'Attendance & reports', id: 'Kehadiran & laporan' },
    description: {
      en: 'Home dashboard, attendance and church reports.',
      id: 'Beranda, kehadiran, dan laporan gereja.',
    },
  },
  {
    id: 'worship',
    optional: true,
    label: { en: 'Worship & volunteers', id: 'Ibadah & pelayanan' },
    description: {
      en: 'Worship services, liturgy, song library and volunteer rosters.',
      id: 'Ibadah, liturgi, daftar lagu, dan jadwal pelayanan.',
    },
  },
  {
    id: 'care',
    optional: true,
    label: { en: 'Pastoral care', id: 'Pelayanan pastoral' },
    description: {
      en: 'Care cases, visitation, prayer requests, visitor follow-up and diakonia.',
      id: 'Pendampingan, perkunjungan, pokok doa, tindak lanjut tamu, dan diakonia.',
    },
  },
  {
    id: 'records',
    optional: true,
    label: { en: 'Church registry', id: 'Catatan gerejawi' },
    description: {
      en: 'Baptism, confirmation (sidi), marriage blessing, child dedication, transfers and funerals.',
      id: 'Baptis, sidi, pemberkatan nikah, penyerahan anak, atestasi, dan kedukaan.',
    },
  },
  {
    id: 'finance',
    optional: true,
    label: { en: 'Finance', id: 'Keuangan' },
    description: {
      en: 'Offerings, tithes, expenses, budgets and financial reports.',
      id: 'Persembahan, perpuluhan, pengeluaran, anggaran (RAPB), dan laporan keuangan.',
    },
  },
  {
    id: 'facilities',
    optional: true,
    label: { en: 'Facilities & inventory', id: 'Sarana & inventaris' },
    description: {
      en: 'Rooms and resources, bookings, inventory and loans.',
      id: 'Ruangan dan sarana, peminjaman, inventaris, dan perawatan.',
    },
  },
  {
    id: 'checkin',
    optional: true,
    label: { en: 'Kids check-in', id: 'Check-in Sekolah Minggu' },
    description: {
      en: 'Secure check-in and pick-up for Sunday school classes.',
      id: 'Check-in dan penjemputan anak Sekolah Minggu yang aman.',
    },
  },
];

export const OPTIONAL_MODULE_IDS = MODULES.filter((module) => module.optional).map(
  (module) => module.id,
);

/** Modules enabled for a newly created church. */
export const DEFAULT_ENABLED_MODULES: readonly ModuleId[] = [...OPTIONAL_MODULE_IDS];

export const isModuleId = (value: unknown): value is ModuleId =>
  typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);

export const moduleDefinition = (id: ModuleId): ModuleDefinition => {
  const found = MODULES.find((module) => module.id === id);
  if (!found) throw new Error(`Unknown module ${id}`);
  return found;
};

/** Required modules are always on; optional ones only when listed in the church's enabled modules. */
export const isModuleEnabled = (enabledModules: readonly string[], id: ModuleId): boolean =>
  !moduleDefinition(id).optional || enabledModules.includes(id);
