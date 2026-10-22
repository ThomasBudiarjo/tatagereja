import { definePermissions } from '../types';

/** Home dashboard, attendance and reports. */
export const INSIGHTS_PERMISSIONS = definePermissions('insights', [
  {
    key: 'attendance.view',
    label: { en: 'View all attendance', id: 'Lihat semua kehadiran' },
    description: {
      en: 'See every attendance session and personal attendance history.',
      id: 'Melihat seluruh sesi kehadiran dan riwayat kehadiran setiap orang.',
    },
    templates: ['pastor', 'elder', 'secretary', 'ministry_coordinator'],
  },
  {
    key: 'attendance.record',
    label: { en: 'Record attendance', id: 'Catat kehadiran' },
    description: {
      en: 'Create attendance sessions and mark attendance for any service or group.',
      id: 'Membuat sesi dan mencatat kehadiran untuk ibadah atau kelompok mana pun.',
    },
    templates: ['elder', 'secretary', 'ministry_coordinator'],
  },
  {
    key: 'reports.view',
    label: { en: 'View reports', id: 'Lihat laporan' },
    description: {
      en: 'See church reports. Finance reports additionally need finance reports permission.',
      id: 'Melihat laporan gereja. Laporan keuangan juga memerlukan hak laporan keuangan.',
    },
    templates: ['pastor', 'elder', 'secretary', 'treasurer'],
  },
] as const);
