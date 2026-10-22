import { definePermissions } from '../types';

/** Church registry (catatan gerejawi): baptis, sidi, pemberkatan nikah, atestasi, kedukaan. */
export const RECORDS_PERMISSIONS = definePermissions('records', [
  {
    key: 'records.view',
    label: { en: 'View church registry', id: 'Lihat catatan gerejawi' },
    description: {
      en: 'See the register books and certificates. Members always see their own records.',
      id: 'Melihat buku induk dan surat keterangan. Anggota selalu dapat melihat catatannya sendiri.',
    },
    sensitive: true,
    templates: ['pastor', 'elder', 'secretary'],
  },
  {
    key: 'records.manage',
    label: { en: 'Manage church registry', id: 'Kelola catatan gerejawi' },
    description: {
      en: 'Record baptisms, sidi, marriage blessings, child dedications, transfers (atestasi) and deaths.',
      id: 'Mencatat baptis, sidi, pemberkatan nikah, penyerahan anak, atestasi, dan kedukaan.',
    },
    sensitive: true,
    templates: ['pastor', 'secretary'],
  },
] as const);
