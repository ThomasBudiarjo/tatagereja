import { definePermissions } from '../types';

/** Church security policy and data export. Account security itself needs no permission. */
export const ADMIN_SECURITY_PERMISSIONS = definePermissions('admin-security', [
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
