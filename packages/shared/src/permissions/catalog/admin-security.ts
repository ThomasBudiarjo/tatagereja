import { definePermissions } from '../types';

/**
 * Church security policy, security overview, audit export and data export. Account security
 * itself (password, two-step verification, sessions) needs no permission: everyone manages
 * their own account.
 */
export const ADMIN_SECURITY_PERMISSIONS = definePermissions('admin-security', [
  {
    key: 'security.view',
    label: { en: 'View security overview', id: 'Lihat ringkasan keamanan' },
    description: {
      en: 'See the church security policy and which members holding management permissions use two-step verification.',
      id: 'Melihat kebijakan keamanan gereja dan anggota berhak kelola yang sudah memakai verifikasi dua langkah.',
    },
    sensitive: true,
  },
  {
    key: 'security.manage',
    label: { en: 'Manage security policy', id: 'Kelola kebijakan keamanan' },
    description: {
      en: 'Require two-factor authentication for members who hold management permissions.',
      id: 'Mewajibkan verifikasi dua langkah bagi anggota yang memiliki hak pengelolaan.',
    },
    sensitive: true,
    ownerOnly: true,
  },
  {
    key: 'audit.export',
    label: { en: 'Export audit log', id: 'Ekspor log audit' },
    description: {
      en: 'Download the audit log as a CSV file (viewing the audit log is needed too).',
      id: 'Mengunduh log audit sebagai berkas CSV (hak melihat log audit juga diperlukan).',
    },
    sensitive: true,
  },
  {
    key: 'backup.export',
    label: { en: 'Export church backup', id: 'Ekspor cadangan gereja' },
    description: {
      en: 'Download a complete backup of the church data.',
      id: 'Mengunduh cadangan lengkap seluruh data gereja.',
    },
    sensitive: true,
    ownerOnly: true,
  },
] as const);
