import type { ChurchRole } from '../constants';
import type { LocalizedText } from '../localized';
import {
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  normalizePermissions,
  type Permission,
} from './catalog';
import { ROLE_TEMPLATE_KEYS, type RoleTemplateKey } from './types';

/** Permissions that only the owner holds and that no custom role can carry. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = PERMISSION_DEFINITIONS.filter(
  (definition) => definition.ownerOnly,
).map((definition) => definition.key);

/** Permissions a custom role may contain. */
export const GRANTABLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (key) => !OWNER_ONLY_PERMISSIONS.includes(key),
);

/**
 * Built-in base roles. Owner holds everything; administrator holds everything except
 * owner-only permissions and those marked `adminExcluded` (confidential care); member holds
 * the `memberDefault` viewing permissions and acts on their own data.
 */
export const BASE_ROLE_PERMISSIONS: Readonly<Record<ChurchRole, readonly Permission[]>> = {
  owner: PERMISSIONS,
  administrator: PERMISSION_DEFINITIONS.filter(
    (definition) => !definition.ownerOnly && !definition.adminExcluded,
  ).map((definition) => definition.key),
  member: PERMISSION_DEFINITIONS.filter((definition) => definition.memberDefault).map(
    (definition) => definition.key,
  ),
};

export const basePermissionsOf = (role: ChurchRole): readonly Permission[] =>
  BASE_ROLE_PERMISSIONS[role];

/**
 * Effective permissions: the base role's permissions plus every assigned custom role's.
 * Unknown keys and owner-only keys stored in a custom role are ignored.
 */
export const effectivePermissions = (
  role: ChurchRole,
  customRolePermissions: Iterable<Iterable<unknown>> = [],
): Permission[] => {
  const all = new Set<unknown>(BASE_ROLE_PERMISSIONS[role]);
  for (const list of customRolePermissions) {
    for (const key of normalizePermissions(list)) {
      if (!OWNER_ONLY_PERMISSIONS.includes(key)) all.add(key);
    }
  }
  return normalizePermissions(all);
};

export type RoleTemplate = {
  key: RoleTemplateKey;
  name: LocalizedText;
  description: LocalizedText;
};

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'pastor',
    name: { en: 'Pastor', id: 'Pendeta' },
    description: {
      en: 'Pastoral leadership: care (including confidential), registry, worship and communication.',
      id: 'Kepemimpinan pastoral: pendampingan (termasuk rahasia), catatan gerejawi, ibadah, dan komunikasi.',
    },
  },
  {
    key: 'elder',
    name: { en: 'Elder (Majelis)', id: 'Majelis / Penatua' },
    description: {
      en: 'Church council: visitation, prayer, attendance, registry and finance oversight.',
      id: 'Majelis jemaat: perkunjungan, pokok doa, kehadiran, catatan gerejawi, dan pengawasan keuangan.',
    },
  },
  {
    key: 'treasurer',
    name: { en: 'Treasurer', id: 'Bendahara' },
    description: {
      en: 'Offerings, contributions, expenses, budgets and finance reports.',
      id: 'Persembahan, pengeluaran, anggaran, dan laporan keuangan.',
    },
  },
  {
    key: 'secretary',
    name: { en: 'Secretary', id: 'Sekretaris' },
    description: {
      en: 'Church administration: directory, households, registry, announcements and bulletin.',
      id: 'Administrasi gereja: data jemaat, keluarga, catatan gerejawi, pengumuman, dan Warta Jemaat.',
    },
  },
  {
    key: 'ministry_coordinator',
    name: { en: 'Ministry coordinator', id: 'Koordinator Pelayanan' },
    description: {
      en: 'Groups, events, worship services and volunteer rosters.',
      id: 'Kelompok, kegiatan, ibadah, dan jadwal pelayanan.',
    },
  },
  {
    key: 'kids_teacher',
    name: { en: 'Sunday school teacher', id: 'Guru Sekolah Minggu' },
    description: {
      en: 'Kids check-in and class rosters.',
      id: 'Check-in anak dan daftar kelas Sekolah Minggu.',
    },
  },
];

export const isRoleTemplateKey = (value: unknown): value is RoleTemplateKey =>
  typeof value === 'string' && (ROLE_TEMPLATE_KEYS as readonly string[]).includes(value);

/** The permissions a template starts with, collected from the catalog's `templates` fields. */
export const templatePermissions = (key: RoleTemplateKey): Permission[] =>
  PERMISSION_DEFINITIONS.filter(
    (definition) => !definition.ownerOnly && definition.templates?.includes(key),
  ).map((definition) => definition.key);
